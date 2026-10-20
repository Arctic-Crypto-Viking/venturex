import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedToUtc } from "@core/app/app/social/format";
import type { PostFormat } from "@core/lib/social/types";
import { formatFor, loadItems, type Folder, type Item } from "./db";

/**
 * "Fill a month" (docs/FILES.md §6): a month of Instagram drafts from the
 * Library, for the artist to look through once and approve in one tap.
 *
 * The rhythm is the artist's (posts per week, which days, what time, in their
 * zone); the material is the Library's, chosen to spread well: files that were
 * never used come first, folders take turns so three nights from the same
 * party do not land in a row, and videos become reels. Every post is a draft
 * (S2: nothing goes out unapproved); the worker stages each file's own copy,
 * and the review screen shows them as they come in.
 *
 * Captions here are plain: a line from the file (its note, else its folder) and
 * the brand's signature; hashtags go to the first comment. Captions by Claude
 * arrive with Social phase 2 and its privacy change, not before.
 */
export type PlanOptions = {
  connectionId: string;
  perWeek: number;          // 1..7
  weekdays: number[];       // 0 = Sunday … 6 = Saturday; empty = spread by perWeek
  hour: number;             // local hour 0..23
  minute: number;           // 0..59
  tz: string;               // the browser's IANA zone
  days: number;             // the window, 7..62
  kinds: Array<"image" | "video">;
  folderIds: string[] | null;
  maxPosts: number;         // social.autoplan_max (-1 = unlimited)
};

export type PlanBrand = { signature: string | null; hashtags: string[] };

export type PlanResult = { planId: string; created: number; candidates: number; slots: number };

const SPACING_MS = 90 * 60_000;
const DEFAULT_DAYS: Record<number, number[]> = { 1: [4], 2: [2, 5], 3: [2, 4, 6], 4: [1, 3, 5, 6], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };

export async function createMonthPlan(
  supabase: SupabaseClient,
  who: { accountId: string; actorId: string; userId: string },
  brand: PlanBrand,
  folders: Folder[],
  opts: PlanOptions,
): Promise<PlanResult> {
  const items = await loadItems(supabase, who.accountId, { actorId: who.actorId, status: "active", limit: 1000 });
  const wanted = new Set(opts.kinds);
  const pool = items.filter((i) => wanted.has(i.kind as "image" | "video") && (!opts.folderIds || (i.folder_id && opts.folderIds.includes(i.folder_id))));
  const ordered = spread(pool);

  const slots = await openSlots(supabase, opts);
  const max = opts.maxPosts === -1 ? Infinity : Math.max(0, opts.maxPosts);
  const n = Math.min(ordered.length, slots.length, max);
  if (n === 0) return { planId: "", created: 0, candidates: ordered.length, slots: slots.length };

  const { data: plan, error: pe } = await supabase.from("social_plans")
    .insert({ account_id: who.accountId, actor_id: who.actorId, trigger_kind: "library.month", rule_key: "library.month.v1" })
    .select("id").single();
  if (pe || !plan) throw new Error(pe?.message ?? "plan");

  const byFolder = new Map(folders.map((f) => [f.id, f]));
  const rows = ordered.slice(0, n).map((item, i) => {
    const folder = item.folder_id ? byFolder.get(item.folder_id) ?? null : null;
    const video = item.kind === "video";
    const format: PostFormat = video ? "reel_cover" : formatFor(item);
    return {
      account_id: who.accountId, actor_id: who.actorId, plan_id: plan.id, social_account_id: opts.connectionId, template_id: null,
      format, kind: video ? "video" : "image",
      slots: { library_item: item.id, library_name: item.name, folder: folder?.path ?? "" },
      media: [], caption: caption(item, folder, brand), first_comment: brand.hashtags.length ? brand.hashtags.join(" ") : null,
      alt_text: altText(item, folder), scheduled_for: slots[i].toISOString(), created_by: who.userId,
    };
  });
  const { error } = await supabase.from("social_posts").insert(rows);
  if (error) {
    await supabase.from("social_plans").delete().eq("id", plan.id);
    throw new Error(error.message);
  }
  return { planId: plan.id, created: n, candidates: ordered.length, slots: slots.length };
}

/** Never-used first, then least used, then newest; folders take turns. */
function spread(items: Item[]): Item[] {
  const sorted = [...items].sort((a, b) =>
    a.times_used - b.times_used
    || (a.last_used_at ? Date.parse(a.last_used_at) : 0) - (b.last_used_at ? Date.parse(b.last_used_at) : 0)
    || (Date.parse(b.taken_at ?? b.created_at) - Date.parse(a.taken_at ?? a.created_at)));
  const groups = new Map<string, Item[]>();
  for (const it of sorted) {
    const k = it.folder_id ?? "_";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const queues = Array.from(groups.values());
  const out: Item[] = [];
  for (let round = 0; out.length < sorted.length; round++) {
    for (const q of queues) if (q[round]) out.push(q[round]);
  }
  return out;
}

/** The instants to post at: the chosen weekdays at the chosen time (±20 min), skipping where this account already posts within 90 minutes. */
async function openSlots(supabase: SupabaseClient, opts: PlanOptions): Promise<Date[]> {
  const days = opts.weekdays.length ? opts.weekdays : DEFAULT_DAYS[Math.min(7, Math.max(1, opts.perWeek))];
  const from = new Date(Date.now() + 86_400_000);
  const to = new Date(from.getTime() + opts.days * 86_400_000);
  const { data } = await supabase.from("social_posts").select("scheduled_for")
    .eq("social_account_id", opts.connectionId).neq("status", "draft").neq("status", "cancelled")
    .gte("scheduled_for", from.toISOString()).lte("scheduled_for", to.toISOString());
  const taken = (data ?? []).map((p) => Date.parse(p.scheduled_for as string));
  const out: Date[] = [];
  for (let d = 1; d <= opts.days; d++) {
    const day = new Date(Date.now() + d * 86_400_000);
    const ymd = localYmd(day, opts.tz);
    if (!days.includes(ymd.weekday)) continue;
    const jitter = ((d * 7919) % 41) - 20; // -20..+20 minutes, fixed per day so a re-run lands the same
    const minute = Math.min(59, Math.max(0, opts.minute + jitter));
    const local = `${ymd.date}T${String(opts.hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const at = zonedToUtc(local, opts.tz);
    if (!at || at.getTime() < Date.now() + 10 * 60_000) continue;
    if (taken.some((t) => Math.abs(t - at.getTime()) < SPACING_MS) || out.some((o) => Math.abs(o.getTime() - at.getTime()) < SPACING_MS)) continue;
    out.push(at);
  }
  return out;
}

function localYmd(at: Date, tz: string): { date: string; weekday: number } {
  let zone = tz;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { zone = "UTC"; }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: weekday < 0 ? 0 : weekday };
}

function caption(item: Item, folder: Folder | null, brand: PlanBrand): string {
  const line = (item.note?.trim() || folder?.name || "").trim();
  return [line, brand.signature?.trim() || ""].filter(Boolean).join("\n\n").slice(0, 2200);
}

function altText(item: Item, folder: Folder | null): string | null {
  const words = [item.note?.trim(), folder?.name, item.kind === "video" ? "video" : "photo"].filter(Boolean).join(", ");
  return words ? words.slice(0, 1000) : null;
}
