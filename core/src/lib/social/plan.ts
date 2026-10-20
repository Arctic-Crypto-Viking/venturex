import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialActor, SocialCaptionContext, SocialTrigger } from "@core/product";
import { zonedToUtc } from "@core/app/app/social/format";
import { consumeQuota, hasFeature, type Entitlements } from "@core/lib/entitlements";
import { draftCaptions, type CaptionCard } from "./caption";
import { loadTemplates, type BrandKit, type Connection, type Template } from "./db";
import { renderTemplate } from "./render";
import { uploadPostImage } from "./storage";
import type { MediaItem, PostFormat } from "./types";

/**
 * The plan engine (docs/SOCIAL-MANAGER.md §4.4, phase 2): a rule (data, table
 * social_plan_rules) and a trigger (the product's `social.triggers()` hook: a
 * confirmed gig) become one social_plans row with one draft social_posts row per
 * card and connected account. For each card the engine picks the template of
 * that family and format (the actor's own copy first, else the system one),
 * fills its slots from the trigger, counts the time from the trigger's instant,
 * snaps it to the actor's posting slots (social_accounts.slots, else 18:30 local)
 * or the evening, keeps the cards 90 minutes apart, drafts caption, first comment
 * and alt text (caption.ts), renders the card now so the approval screen shows
 * the file that goes out (S2), and writes the rows. Approval is the database's
 * decision (social_approve_plan, §4.6). A trigger that moved re-proposes the
 * drafts and flags an approved plan (reconcileTriggerPlan).
 */
export type RulePost = { offset: string; family: string; format: PostFormat; snap: "slot" | "evening" | "none"; asks?: string[] };
export type PlanRule = { key: string; trigger_kind: string; name: string; posts: RulePost[]; is_active: boolean; version: number };
export const RULE_COLUMNS = "key, trigger_kind, name, posts, is_active, version, updated_at";

export type TriggerPlan = { id: string; status: "proposed" | "approved" | "done" | "cancelled"; trigger_at: string | null; moved_at: string | null; rule_key: string | null; created_at: string };
const PLAN_COLUMNS = "id, status, trigger_at, moved_at, rule_key, created_at";

/** The active rule for a trigger kind: the highest version key wins when several exist. */
export async function loadRule(supabase: SupabaseClient, triggerKind: string): Promise<PlanRule | null> {
  const { data } = await supabase.from("social_plan_rules").select(RULE_COLUMNS).eq("trigger_kind", triggerKind).eq("is_active", true).order("key", { ascending: false }).limit(1);
  const r = data?.[0] as PlanRule | undefined;
  return r && Array.isArray(r.posts) ? r : null;
}

export async function loadRules(supabase: SupabaseClient): Promise<PlanRule[]> {
  const { data } = await supabase.from("social_plan_rules").select(RULE_COLUMNS).order("trigger_kind").order("key");
  return (data ?? []) as PlanRule[];
}

/** The live plan of one trigger (proposed or approved), newest first; cancelled and done plans are history. */
export async function findTriggerPlan(supabase: SupabaseClient, accountId: string, kind: string, ref: string): Promise<TriggerPlan | null> {
  const { data } = await supabase.from("social_plans").select(PLAN_COLUMNS)
    .eq("account_id", accountId).eq("trigger_kind", kind).eq("trigger_ref", ref).in("status", ["proposed", "approved"])
    .order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as TriggerPlan | undefined) ?? null;
}

export type PlanInput = {
  supabase: SupabaseClient;
  accountId: string;
  userId: string;
  actor: SocialActor;
  connections: Connection[];
  kit: BrandKit;
  ent: Entitlements;
  trigger: SocialTrigger;
  rule: PlanRule;
  captionContext: SocialCaptionContext | null;
  productName: string;
  /** A plan to replace (re-propose): its drafts are deleted first. */
  replacePlanId?: string | null;
};

export type PlanOutcome = {
  planId: string | null;
  created: number;
  /** Cards left out and why: "late" (its time has passed), "template" (none for that family and format). */
  skipped: Array<{ family: string; reason: "late" | "template" }>;
  /** Cards whose picture could not be made now; the worker makes it after approval. */
  renderFailed: number;
  ai: boolean;
};

const MIN_AHEAD_MS = 15 * 60_000;
const SPACING_MS = 90 * 60_000;
const DEFAULT_SLOT = "18:30";
const EVENING = "19:00";

export async function createTriggerPlan(input: PlanInput): Promise<PlanOutcome> {
  const { supabase, accountId, actor, trigger, rule } = input;
  const connections = input.connections.filter((c) => !c.disconnected_at);
  const outcome: PlanOutcome = { planId: null, created: 0, skipped: [], renderFailed: 0, ai: false };
  if (!connections.length) return outcome;
  const templates = await loadTemplates(supabase, accountId, actor.id);
  const base = Date.parse(trigger.at);
  if (!Number.isFinite(base)) return outcome;

  // 1. the cards: time, template, slot values
  type Card = { rulePost: RulePost; template: Omit<Template, "layout">; when: Date; conn: Connection; slots: Record<string, string>; index: number };
  const cards: Card[] = [];
  const slotsOf = (c: Connection) => Array.isArray(c.slots) ? (c.slots as Array<{ dow?: number; time?: string }>).filter((s) => typeof s?.time === "string" && /^\d{2}:\d{2}$/.test(s.time)) : [];
  for (const rp of rule.posts) {
    const template = pickTemplate(templates, rp.family, rp.format);
    if (!template) { outcome.skipped.push({ family: rp.family, reason: "template" }); continue; }
    const offset = offsetMs(rp.offset);
    if (offset === null) continue;
    for (const conn of connections) {
      let when = snap(new Date(base + offset), rp.snap, slotsOf(conn), trigger.timezone);
      if (when.getTime() < Date.now() + MIN_AHEAD_MS) {
        // a pre-event card whose moment has passed moves to the next half hour, as long as the night is still ahead
        if (offset < 0 && base - Date.now() > 3 * 3_600_000) when = nextHalfHour(Date.now() + 2 * MIN_AHEAD_MS);
        else { outcome.skipped.push({ family: rp.family, reason: "late" }); continue; }
      }
      cards.push({ rulePost: rp, template, when, conn, slots: {}, index: cards.length });
    }
  }
  if (!cards.length) return outcome;

  // 2. spacing inside the plan (90 minutes between feed posts to one account; stories exempt), then the DB's own check at approval
  cards.sort((a, b) => a.when.getTime() - b.when.getTime());
  for (const card of cards) {
    if (card.rulePost.format === "story_9x16") continue;
    for (let guard = 0; guard < 6; guard++) {
      const clash = cards.find((o) => o !== card && o.conn.id === card.conn.id && o.rulePost.format !== "story_9x16" && o.index < card.index && Math.abs(o.when.getTime() - card.when.getTime()) < SPACING_MS);
      if (!clash) break;
      card.when = new Date(clash.when.getTime() + SPACING_MS);
    }
  }
  cards.sort((a, b) => a.when.getTime() - b.when.getTime());
  cards.forEach((c, i) => { c.index = i; c.slots = slotValues(c.template.slots, trigger, c.when, base); });

  // 3. captions: metered by ai.drafts_per_month, one per card with words; plain when the plan is out
  const withWords = cards.filter((c) => c.rulePost.format !== "story_9x16");
  let allowModel = false;
  if (withWords.length && hasFeature(input.ent, "ai.drafts_per_month")) {
    try {
      const q = await consumeQuota(supabase, { accountId, featureKey: "ai.drafts_per_month", quantity: withWords.length, refType: "social_plan", refId: trigger.ref, model: "claude-haiku-5-5" });
      allowModel = q.allowed;
    } catch (e) {
      console.error("social: quota", e instanceof Error ? e.message : e);
    }
  }
  const pastCaptions = await lastApprovedCaptions(supabase, accountId, actor.id);
  const captionCards: CaptionCard[] = cards.map((c) => ({
    index: c.index, family: c.rulePost.family, format: c.rulePost.format, isStory: c.rulePost.format === "story_9x16",
    when: localWords(c.when, trigger.timezone), daysToEvent: daysBetween(c.when, new Date(base), trigger.timezone),
  }));
  const { drafts, ai } = await draftCaptions({
    context: input.captionContext ?? { name: actor.name, bio: null, language: actor.language, tags: actor.tags, baseCity: null, links: actor.links },
    pastCaptions, facts: trigger.facts, label: trigger.label,
    hashtags: input.kit.hashtag_sets?.default ?? [], signature: input.kit.signature, cards: captionCards, productName: input.productName,
  }, { allowModel });
  outcome.ai = ai;
  const draftOf = new Map(drafts.map((d) => [d.index, d]));

  // 4. the plan row (a re-proposal replaces the old plan's drafts and row)
  if (input.replacePlanId) {
    await supabase.from("social_posts").delete().eq("plan_id", input.replacePlanId).eq("status", "draft");
    await supabase.from("social_plans").delete().eq("id", input.replacePlanId).eq("status", "proposed");
  }
  const { data: plan, error: pe } = await supabase.from("social_plans")
    .insert({ account_id: accountId, actor_id: actor.id, trigger_kind: trigger.kind, trigger_ref: trigger.ref, rule_key: rule.key, trigger_at: trigger.at })
    .select("id").single();
  if (pe || !plan) throw new Error(pe?.message ?? "plan");
  outcome.planId = plan.id as string;

  // 5. the drafts, each with its picture made now (a failed render is left to the worker: template_id without media)
  for (const card of cards) {
    const d = draftOf.get(card.index)!;
    const row = {
      account_id: accountId, actor_id: actor.id, plan_id: plan.id, social_account_id: card.conn.id, template_id: card.template.id,
      format: card.rulePost.format, kind: "image", slots: { ...card.slots, _family: card.rulePost.family, _asks: (card.rulePost.asks ?? []).join(",") },
      caption: d.caption, first_comment: d.firstComment, alt_text: d.altText, scheduled_for: card.when.toISOString(), created_by: input.userId,
    };
    const { data: post, error } = await supabase.from("social_posts").insert(row).select("id").single();
    if (error || !post) { console.error("social: plan draft", error?.message); continue; }
    outcome.created++;
    try {
      const { data: full } = await supabase.from("social_templates").select("layout").eq("id", card.template.id).maybeSingle();
      if (!full) throw new Error("template gone");
      const out = await renderTemplate({ layout: full.layout, format: card.rulePost.format, values: card.slots, brand: input.kit });
      const media: MediaItem[] = [await uploadPostImage(supabase, accountId, post.id as string, 1, out.jpeg, out.width, out.height)];
      await supabase.from("social_posts").update({ media }).eq("id", post.id);
    } catch (e) {
      console.error("social: plan render", e instanceof Error ? e.message : e);
      outcome.renderFailed++;
    }
  }
  if (outcome.created === 0) {
    await supabase.from("social_plans").delete().eq("id", plan.id);
    outcome.planId = null;
  }
  return outcome;
}

/**
 * The trigger moved since the plan was made (§4.4): a proposed plan is made
 * again from the new instant ("reproposed"); an approved one is flagged, since
 * its posts are frozen ("flagged": the person cancels them and promotes again).
 */
export async function reconcileTriggerPlan(input: Omit<PlanInput, "rule" | "replacePlanId"> & { rule: PlanRule | null; plan: TriggerPlan }): Promise<"same" | "reproposed" | "flagged"> {
  const { plan, trigger, supabase } = input;
  if (!plan.trigger_at || Date.parse(plan.trigger_at) === Date.parse(trigger.at)) return "same";
  if (plan.status === "approved") {
    if (!plan.moved_at) await supabase.from("social_plans").update({ moved_at: new Date().toISOString(), moved_from: plan.trigger_at }).eq("id", plan.id);
    return "flagged";
  }
  if (plan.status === "proposed" && input.rule) {
    await createTriggerPlan({ ...input, rule: input.rule, replacePlanId: plan.id });
    return "reproposed";
  }
  return "same";
}

// ------------------------------------------------------------------ helpers

function pickTemplate(templates: Array<Omit<Template, "layout">>, family: string, format: PostFormat) {
  // loadTemplates orders own rows first, so the first match is the actor's own copy when one exists
  return templates.find((t) => t.family === family && t.format === format)
    ?? templates.find((t) => t.family === "plain" && t.format === format)
    ?? null;
}

/** "-12d" → ms (negative), "+6h" → ms; null when malformed. */
export function offsetMs(s: string): number | null {
  const m = /^([+-])(\d{1,3})([hd])$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[2]) * (m[3] === "d" ? 86_400_000 : 3_600_000);
  return m[1] === "-" ? -n : n;
}

/** The card's instant: the nearest posting slot within three days ("slot"), 19:00 of that day ("evening"), or as computed. */
function snap(at: Date, mode: RulePost["snap"], slots: Array<{ dow?: number; time?: string }>, tz: string): Date {
  if (mode === "none") return at;
  const day = localYmd(at, tz);
  if (mode === "evening") return zonedToUtc(`${day.date}T${EVENING}`, tz) ?? at;
  // slot: candidate instants on the days around, pick the closest; no slots → the default time that day
  const candidates: Date[] = [];
  for (let d = -3; d <= 3; d++) {
    const dayAt = new Date(at.getTime() + d * 86_400_000);
    const ymd = localYmd(dayAt, tz);
    const times = slots.length ? slots.filter((s) => s.dow === undefined || s.dow === ymd.weekday).map((s) => s.time!) : d === 0 ? [DEFAULT_SLOT] : [];
    for (const t of times) { const c = zonedToUtc(`${ymd.date}T${t}`, tz); if (c) candidates.push(c); }
  }
  if (!candidates.length) return zonedToUtc(`${day.date}T${DEFAULT_SLOT}`, tz) ?? at;
  return candidates.reduce((best, c) => (Math.abs(c.getTime() - at.getTime()) < Math.abs(best.getTime() - at.getTime()) ? c : best));
}

function nextHalfHour(ms: number): Date {
  const step = 30 * 60_000;
  return new Date(Math.ceil(ms / step) * step);
}

function localYmd(at: Date, tz: string): { date: string; weekday: number } {
  let zone = tz;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { zone = "UTC"; }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: weekday < 0 ? 0 : weekday };
}

function localWords(at: Date, tz: string): string {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at); }
  catch { return at.toISOString(); }
}

/** Whole local days from `from` to `to` (positive when `to` is later). */
function daysBetween(from: Date, to: Date, tz: string): number {
  const a = localYmd(from, tz).date, b = localYmd(to, tz).date;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The template's slots from the trigger's words: what it names directly, else a sensible stand-in per slot name. */
function slotValues(slotNames: string[], trigger: SocialTrigger, when: Date, base: number): Record<string, string> {
  const s = trigger.slots;
  const out: Record<string, string> = {};
  for (const name of slotNames) {
    let v = s[name];
    if (v === undefined) {
      if (name === "photo") v = trigger.photo ?? "";
      else if (name === "number") v = String(Math.max(0, daysBetween(when, new Date(base), trigger.timezone)));
      else if (name === "text") v = s.title ?? trigger.label;
      else if (name === "detail" || name === "subtitle") v = [s.venue, s.city, s.date].filter(Boolean).join(" · ");
      else if (name === "label") v = s.date ?? "";
      else v = "";
    }
    out[name] = (v ?? "").slice(0, name === "lineup" ? 600 : 200);
  }
  return out;
}

/** The actor's last ten approved captions, the voice the model imitates. */
async function lastApprovedCaptions(supabase: SupabaseClient, accountId: string, actorId: string): Promise<string[]> {
  const { data } = await supabase.from("social_posts").select("caption")
    .eq("account_id", accountId).eq("actor_id", actorId).in("status", ["approved", "rendering", "queued", "publishing", "published"]).neq("caption", "")
    .order("frozen_at", { ascending: false }).limit(10);
  return (data ?? []).map((r) => (r.caption as string).slice(0, 1200));
}
