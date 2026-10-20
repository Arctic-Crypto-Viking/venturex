"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNext } from "@core/lib/safe-next";
import { FONT_KEYS, POST_COLUMNS, type FontKey, type Post, type Template } from "@core/lib/social/db";
import { normaliseUpload, renderTemplate } from "@core/lib/social/render";
import { SOCIAL_BUCKET, adoptPostVideo, isOwnUpload, objectPathOf, removePostFiles, uploadPostImage } from "@core/lib/social/storage";
import type { MediaItem, PostFormat, UserTag } from "@core/lib/social/types";
import { loadSocial, ownConnection, SOCIAL_PATH, type SocialContext } from "./context";
import { zonedToUtc } from "./format";
import { ensureKit } from "./brand/kit";
import { product } from "@product";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const IMAGE_FORMATS: PostFormat[] = ["feed_4x5", "square", "story_9x16"];
const VIDEO_FORMATS: PostFormat[] = ["reel_9x16", "story_9x16"];
/** Instagram usernames: letters, digits, dots and underscores, at most 30. */
const HANDLE = /^[a-z0-9._]{1,30}$/i;

export type ComposeState = { error?: string } | undefined;
type Source = "template" | "upload" | "video";

/**
 * What the editor sends, checked and resolved: the connection, the format, the
 * time, the words, and the picture's source. Shared by "make the picture" (a
 * new draft) and "update picture and text" (an existing draft, S2: a draft is
 * the only state the artist edits; after approval it is frozen).
 */
type Parsed = {
  conn: NonNullable<ReturnType<typeof ownConnection>>;
  source: Source;
  format: PostFormat;
  kind: "image" | "video";
  when: Date;
  caption: string; firstComment: string | null; altText: string | null;
  /** 034: the link for the public page (not sent to the network), the tagged people, the collaborators (≤ 3, not on a story) */
  link: string | null; userTags: UserTag[]; collaborators: string[];
  template: Template | null;
  slots: Record<string, string>;
  uploadUrl: string | null;
  /** the time was under five minutes ahead and was moved */
  moved: boolean;
  /** a reel's cover: a template render or a photo, or none */
  cover: { mode: "none" } | { mode: "template"; template: Template; slots: Record<string, string> } | { mode: "photo"; url: string };
};

async function parse(ctx: SocialContext, fd: FormData): Promise<Parsed | { error: string }> {
  const t = ctx.dict.social.compose;
  const conn = ownConnection(ctx, str(fd, "account"));
  if (!conn) return { error: t.errors.account };
  const source: Source = str(fd, "source") === "upload" ? "upload" : str(fd, "source") === "video" ? "video" : "template";
  const kind = source === "video" ? "video" : "image";
  const wanted = str(fd, "format") as PostFormat;
  const allowed = kind === "video" ? VIDEO_FORMATS : IMAGE_FORMATS;
  const format = allowed.includes(wanted) ? wanted : allowed[0];
  const typed = zonedToUtc(str(fd, "when"), str(fd, "tz") || "UTC");
  if (!typed) return { error: t.errors.when };
  // under five minutes ahead (or past) is moved to five minutes ahead, never refused (founder, 20 Oct)
  const { when, moved } = atLeastFiveMinutesAhead(typed);
  const link = parseLink(str(fd, "link"));
  if (link === undefined) return { error: t.errors.link };
  let caption = format === "story_9x16" ? "" : str(fd, "caption").slice(0, 2200);
  // a link is never clickable in a post: the caption points to the bio, where the public page carries it
  if (link && format !== "story_9x16" && !caption.includes(t.linkInBioLine)) {
    caption = (caption ? `${caption.slice(0, 2200 - t.linkInBioLine.length - 2)}\n\n${t.linkInBioLine}` : t.linkInBioLine);
  }
  const collaborators = format === "story_9x16" ? [] : handles(str(fd, "collaborators")).slice(0, 3);
  const userTags = parseTags(str(fd, "user_tags"), kind === "video" && format === "reel_9x16");
  const firstComment = format === "story_9x16" ? null : str(fd, "first_comment").slice(0, 2200) || null; // stories carry no comments
  const altText = kind === "video" ? null : str(fd, "alt_text").slice(0, 1000) || null;

  let template: Template | null = null;
  const slots: Record<string, string> = {};
  let uploadUrl: string | null = null;
  if (source === "template") {
    const id = str(fd, "template");
    if (!UUID.test(id)) return { error: t.errors.template };
    template = await loadTemplate(ctx, id);
    if (!template || template.format !== format) return { error: t.errors.template };
    for (const s of template.slots) slots[s] = str(fd, `slot_${s}`).slice(0, s === "lineup" ? 600 : 200);
    if (slots.photo && !ownUpload(ctx.account.id, slots.photo)) return { error: t.errors.uploadOrigin };
  } else if (source === "upload") {
    uploadUrl = str(fd, "upload_url");
    if (!uploadUrl) return { error: t.errors.upload };
    if (!ownUpload(ctx.account.id, uploadUrl)) return { error: t.errors.uploadOrigin };
  } else {
    uploadUrl = str(fd, "video_url");
    if (!uploadUrl) return { error: t.errors.video };
    if (!ownUpload(ctx.account.id, uploadUrl)) return { error: t.errors.uploadOrigin };
    if (!/\.(mp4|mov)(\?|$)/i.test(uploadUrl)) return { error: t.errors.videoType };
  }

  let cover: Parsed["cover"] = { mode: "none" };
  if (kind === "video" && format === "reel_9x16") {
    const mode = str(fd, "cover_mode");
    if (mode === "template") {
      const id = str(fd, "cover_template");
      const ct = UUID.test(id) ? await loadTemplate(ctx, id) : null;
      if (ct && ct.format === "reel_cover") {
        const cs: Record<string, string> = {};
        for (const s of ct.slots) cs[s] = str(fd, `cover_slot_${s}`).slice(0, 200);
        cover = { mode: "template", template: ct, slots: cs };
      }
    } else if (mode === "photo") {
      const url = str(fd, "cover_url");
      if (url && ownUpload(ctx.account.id, url)) cover = { mode: "photo", url };
    }
  }
  return { conn, source, format, kind, when, moved, caption, firstComment, altText, link, userTags, collaborators, template, slots, uploadUrl, cover };
}

/** "" → null; "example.com/x" → "https://example.com/x"; anything that is not an http(s) address → undefined. */
function parseLink(v: string): string | null | undefined {
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || /\s/.test(withScheme) || withScheme.length > 500) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** "@a, b  @c" → ["a", "b", "c"]: Instagram usernames only, each once. */
function handles(v: string): string[] {
  const out: string[] = [];
  for (const h of v.split(/[\s,]+/).map((x) => x.replace(/^@+/, "")).filter(Boolean)) {
    if (HANDLE.test(h) && !out.some((o) => o.toLowerCase() === h.toLowerCase())) out.push(h);
  }
  return out;
}

/** The editor's tags (JSON [{username, x, y}]), checked: real usernames, positions inside 0–1, at most 20; a reel keeps names only. */
function parseTags(json: string, namesOnly: boolean): UserTag[] {
  let raw: unknown;
  try { raw = JSON.parse(json || "[]"); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: UserTag[] = [];
  for (const r of raw) {
    const username = typeof r?.username === "string" ? r.username.replace(/^@+/, "") : "";
    if (!HANDLE.test(username) || out.some((o) => o.username.toLowerCase() === username.toLowerCase())) continue;
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : undefined);
    const x = num(r.x), y = num(r.y);
    out.push(namesOnly || x === undefined || y === undefined ? { username } : { username, x, y });
    if (out.length === 20) break;
  }
  return out;
}

const MIN_AHEAD_MS = 5 * 60_000;
/** The slot, or five minutes from now when it has slipped under that (the plan path keeps the strict check in SQL). */
function atLeastFiveMinutesAhead(d: Date): { when: Date; moved: boolean } {
  const floor = Date.now() + MIN_AHEAD_MS;
  return d.getTime() < floor ? { when: new Date(floor), moved: true } : { when: d, moved: false };
}

async function loadTemplate(ctx: SocialContext, id: string): Promise<Template | null> {
  const { data } = await ctx.supabase.from("social_templates").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  return (data as Template | null) ?? null;
}

/** Makes the post's files from the parsed input: the picture (or the video, moved into place) and a reel's cover. */
async function makeMedia(ctx: SocialContext, postId: string, p: Parsed): Promise<MediaItem[]> {
  const media: MediaItem[] = [];
  if (p.source === "template" && p.template) {
    const kit = await ensureKit(ctx);
    const out = await renderTemplate({ layout: p.template.layout, format: p.format, values: p.slots, brand: kit });
    media.push(await uploadPostImage(ctx.supabase, ctx.account.id, postId, 1, out.jpeg, out.width, out.height));
  } else if (p.source === "upload" && p.uploadUrl) {
    const res = await fetch(p.uploadUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const out = await normaliseUpload(Buffer.from(await res.arrayBuffer()), p.format);
    media.push(await uploadPostImage(ctx.supabase, ctx.account.id, postId, 1, out.jpeg, out.width, out.height));
    await removeTemp(ctx, p.uploadUrl);
  } else if (p.source === "video") {
    if (p.uploadUrl) media.push(await adoptPostVideo(ctx.supabase, ctx.account.id, postId, p.uploadUrl));
    if (p.cover.mode === "template") {
      const kit = await ensureKit(ctx);
      const out = await renderTemplate({ layout: p.cover.template.layout, format: "reel_cover", values: p.cover.slots, brand: kit });
      media.push(await uploadPostImage(ctx.supabase, ctx.account.id, postId, 2, out.jpeg, out.width, out.height));
    } else if (p.cover.mode === "photo") {
      const res = await fetch(p.cover.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch cover ${res.status}`);
      const out = await normaliseUpload(Buffer.from(await res.arrayBuffer()), "reel_cover");
      media.push(await uploadPostImage(ctx.supabase, ctx.account.id, postId, 2, out.jpeg, out.width, out.height));
      await removeTemp(ctx, p.cover.url);
    }
  }
  return media;
}

/** New post, step 1 → a draft with its files made now (the render the artist approves is the file that goes out, S2). */
export async function createPostAction(_prev: ComposeState, fd: FormData): Promise<ComposeState> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/new`);
  const t = ctx.dict.social.compose;
  const p = await parse(ctx, fd);
  if ("error" in p) return { error: p.error };
  const { data: post, error } = await ctx.supabase.from("social_posts").insert({
    account_id: ctx.account.id, actor_id: ctx.actor.id, social_account_id: p.conn.id, template_id: p.template?.id ?? null,
    format: p.format, kind: p.kind, slots: p.slots, caption: p.caption, first_comment: p.firstComment, alt_text: p.altText,
    link: p.link, user_tags: p.userTags, collaborators: p.collaborators,
    scheduled_for: p.when.toISOString(), created_by: ctx.user.id,
  }).select("id").single();
  if (error || !post) return { error: error?.message ?? t.errors.render };
  // the draft is saved now, whatever happens to the picture: a failed render keeps the
  // row (its source kept in slots._source for the retry) and the review screen says so
  try {
    const media = await makeMedia(ctx, post.id, p);
    const { error: e2 } = await ctx.supabase.from("social_posts").update({ media }).eq("id", post.id);
    if (e2) throw new Error(e2.message);
  } catch (e) {
    console.error("social: render", e);
    await ctx.supabase.from("social_posts").update({ slots: { ...p.slots, ...sourceOf(p) } }).eq("id", post.id);
    redirect(`${SOCIAL_PATH}/new?post=${post.id}&render_error=1`);
  }
  redirect(`${SOCIAL_PATH}/new?post=${post.id}${p.moved ? "&moved=1" : ""}`);
}

/**
 * Edit a draft (the check-and-edit step the founder asked for): words and time
 * change in place; a changed picture source, template, slot or upload makes
 * the files again, so what the review screen shows is still what goes out.
 */
export async function updatePostAction(_prev: ComposeState, fd: FormData): Promise<ComposeState> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/new`);
  const t = ctx.dict.social.compose;
  const id = str(fd, "post");
  if (!UUID.test(id)) return { error: t.errors.gone };
  const { data } = await ctx.supabase.from("social_posts").select(POST_COLUMNS).eq("id", id).eq("status", "draft").maybeSingle();
  const existing = data as Post | null;
  if (!existing) return { error: t.errors.gone };
  const p = await parse(ctx, fd);
  if ("error" in p) return { error: p.error };

  // Which files change? A template post: a different template, slot value or format.
  // A photo post: a newly uploaded photo (under /uploads/; an unchanged one is the
  // post's own file). A video post: a new video, and separately a new cover.
  const isNew = (u: string | null) => !!u && (objectPathOf(u) ?? "").includes("/uploads/");
  const kindChanged = existing.kind !== p.kind || (existing.template_id ? "template" : existing.kind === "video" ? "video" : "upload") !== p.source;
  let media: MediaItem[] = existing.media ?? [];
  try {
    if (p.source === "template") {
      const changed = kindChanged || existing.template_id !== (p.template?.id ?? null) || existing.format !== p.format
        || JSON.stringify(existing.slots ?? {}) !== JSON.stringify(p.slots);
      if (changed) { await removePostFiles(ctx.supabase, ctx.account.id, id).catch(() => {}); media = await makeMedia(ctx, id, p); }
    } else if (p.source === "upload") {
      if (kindChanged || isNew(p.uploadUrl) || existing.format !== p.format) {
        await removePostFiles(ctx.supabase, ctx.account.id, id).catch(() => {});
        media = await makeMedia(ctx, id, p);
      }
    } else {
      const newVideo = kindChanged || isNew(p.uploadUrl);
      const newCover = p.cover.mode === "template" || (p.cover.mode === "photo" && isNew(p.cover.url));
      if (newVideo) {
        await removePostFiles(ctx.supabase, ctx.account.id, id).catch(() => {});
        media = await makeMedia(ctx, id, p);
      } else if (newCover) {
        const video = media.find((m) => m.kind === "video");
        const fresh = await makeMedia(ctx, id, { ...p, uploadUrl: null, source: "video" });   // no video to move: only the cover
        media = [...(video ? [video] : []), ...fresh.filter((m) => m.kind === "image")];
      } else if (p.cover.mode === "none") {
        media = media.filter((m) => m.kind !== "image");
      }
    }
  } catch (e) {
    console.error("social: re-render", e);
    return { error: t.errors.render };
  }
  const { error } = await ctx.supabase.from("social_posts").update({
    social_account_id: p.conn.id, template_id: p.template?.id ?? null, format: p.format, kind: p.kind, slots: p.slots,
    caption: p.caption, first_comment: p.firstComment, alt_text: p.altText, scheduled_for: p.when.toISOString(), media,
    link: p.link, user_tags: p.userTags, collaborators: p.collaborators,
  }).eq("id", id).eq("status", "draft");
  if (error) return { error: error.message };
  // a plan's draft goes back to its plan screen (the path is checked, never trusted)
  const back = str(fd, "return");
  if (back) redirect(safeNext(back, `${SOCIAL_PATH}/new?post=${id}`));
  redirect(`${SOCIAL_PATH}/new?post=${id}${p.moved ? "&moved=1" : ""}`);
}

/** What a retry needs that the row does not hold otherwise: the upload's URL and a reel's cover choice. */
function sourceOf(p: Parsed): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.uploadUrl) out._source = p.uploadUrl;
  if (p.cover.mode === "photo") out._cover_url = p.cover.url;
  if (p.cover.mode === "template") { out._cover_template = p.cover.template.id; for (const [k, v] of Object.entries(p.cover.slots)) out[`_cover_slot_${k}`] = v; }
  return out;
}

/**
 * "Make the picture again" on a draft whose render failed: the files are made from
 * what the row holds (template + slots, or the kept upload URL), nothing re-typed.
 */
export async function rerenderPostAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/new`);
  const id = str(fd, "post");
  if (!UUID.test(id)) redirect(`${SOCIAL_PATH}/new`);
  const { data } = await ctx.supabase.from("social_posts").select(POST_COLUMNS).eq("id", id).eq("status", "draft").maybeSingle();
  const post = data as Post | null;
  if (!post) redirect(`${SOCIAL_PATH}/new`);
  const slots = post.slots ?? {};
  const conn = ownConnection(ctx, post.social_account_id);
  if (!conn) redirect(`${SOCIAL_PATH}/new?post=${id}&render_error=1`);
  const template = post.template_id ? await loadTemplate(ctx, post.template_id) : null;
  const clean = Object.fromEntries(Object.entries(slots).filter(([k]) => !k.startsWith("_")));
  const coverTemplate = slots._cover_template ? await loadTemplate(ctx, slots._cover_template) : null;
  const cover: Parsed["cover"] = slots._cover_url ? { mode: "photo", url: slots._cover_url }
    : coverTemplate ? { mode: "template", template: coverTemplate, slots: Object.fromEntries(Object.entries(slots).filter(([k]) => k.startsWith("_cover_slot_")).map(([k, v]) => [k.slice("_cover_slot_".length), v])) }
    : { mode: "none" };
  const p: Parsed = {
    conn, source: template ? "template" : post.kind === "video" ? "video" : "upload", format: post.format, kind: post.kind,
    when: new Date(post.scheduled_for), moved: false, caption: post.caption, firstComment: post.first_comment, altText: post.alt_text,
    link: post.link, userTags: post.user_tags ?? [], collaborators: post.collaborators ?? [], template, slots: clean, uploadUrl: slots._source ?? null, cover,
  };
  if (!template && !p.uploadUrl) redirect(`${SOCIAL_PATH}/new?post=${id}&render_error=1`);
  try {
    await removePostFiles(ctx.supabase, ctx.account.id, id).catch(() => {});
    const media = await makeMedia(ctx, id, p);
    const { error } = await ctx.supabase.from("social_posts").update({ media, slots: clean }).eq("id", id).eq("status", "draft");
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("social: re-render", e);
    redirect(`${SOCIAL_PATH}/new?post=${id}&render_error=1`);
  }
  redirect(`${SOCIAL_PATH}/new?post=${id}`);
}

const ownUpload = isOwnUpload;
async function removeTemp(ctx: SocialContext, url: string) {
  const path = objectPathOf(url);
  if (path && path.includes("/uploads/")) await ctx.supabase.storage.from(SOCIAL_BUCKET).remove([path]);
}

/** Step 2: approve. The database decides (social_approve_post: plan, health, caps, spacing, duplicates). */
export async function approvePostAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/new`);
  const id = str(fd, "post");
  const force = str(fd, "force") === "1";
  if (!UUID.test(id)) redirect(`${SOCIAL_PATH}/new`);
  // a slot that slipped under five minutes while the picture was made and checked is
  // moved to five minutes from now, then approved (a draft is still the member's to edit)
  let moved = false;
  const { data: draft } = await ctx.supabase.from("social_posts").select("scheduled_for").eq("id", id).eq("status", "draft").maybeSingle();
  if (draft && new Date(draft.scheduled_for as string).getTime() < Date.now() + MIN_AHEAD_MS) {
    const { error: e } = await ctx.supabase.from("social_posts").update({ scheduled_for: new Date(Date.now() + MIN_AHEAD_MS).toISOString() }).eq("id", id).eq("status", "draft");
    moved = !e;
  }
  const { data, error } = await ctx.supabase.rpc("social_approve_post", { p_post: id, p_force: force });
  if (error) redirect(`${SOCIAL_PATH}/new?post=${id}&issues=${encodeURIComponent(error.message)}`);
  const issues = (data ?? []) as string[];
  if (issues.length) redirect(`${SOCIAL_PATH}/new?post=${id}&issues=${encodeURIComponent(issues.join("\n"))}`);
  revalidatePath(SOCIAL_PATH);
  redirect(`${SOCIAL_PATH}?approved=${id}${moved ? "&moved=1" : ""}`);
}

export async function discardDraftAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/new`);
  const id = str(fd, "post");
  if (UUID.test(id)) {
    const { data } = await ctx.supabase.from("social_posts").delete().eq("id", id).eq("status", "draft").select("id");
    if (data?.length) await removePostFiles(ctx.supabase, ctx.account.id, id).catch(() => {});
  }
  redirect(`${SOCIAL_PATH}/new`);
}

export async function cancelPostAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial();
  const id = str(fd, "post");
  if (!UUID.test(id)) redirect(SOCIAL_PATH);
  const { error } = await ctx.supabase.rpc("social_cancel_post", { p_post: id });
  revalidatePath(SOCIAL_PATH);
  redirect(error ? `${SOCIAL_PATH}?error=${encodeURIComponent(error.message)}` : `${SOCIAL_PATH}?cancelled=${id}`);
}

export async function retryPostAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial();
  const id = str(fd, "post");
  if (!UUID.test(id)) redirect(SOCIAL_PATH);
  const { error } = await ctx.supabase.rpc("social_retry_post", { p_post: id });
  revalidatePath(SOCIAL_PATH);
  redirect(error ? `${SOCIAL_PATH}?error=${encodeURIComponent(error.message)}` : `${SOCIAL_PATH}?retried=${id}`);
}

// ------------------------------------------------------------------ accounts

export async function disconnectAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/accounts`);
  const conn = ownConnection(ctx, str(fd, "connection"));
  if (!conn) redirect(`${SOCIAL_PATH}/accounts`);
  const { error } = await ctx.supabase.rpc("social_disconnect", { p_social_account: conn.id });
  revalidatePath(`${SOCIAL_PATH}/accounts`);
  redirect(error ? `${SOCIAL_PATH}/accounts?error=save&detail=${encodeURIComponent(error.message)}` : `${SOCIAL_PATH}/accounts?disconnected=1`);
}

export async function saveCapAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/accounts`);
  const conn = ownConnection(ctx, str(fd, "connection"));
  if (!conn) redirect(`${SOCIAL_PATH}/accounts`);
  const cap = Math.max(1, Math.min(50, Number(str(fd, "daily_cap")) || conn.daily_cap));
  await ctx.supabase.from("social_accounts").update({ daily_cap: cap }).eq("id", conn.id);
  revalidatePath(`${SOCIAL_PATH}/accounts`);
  redirect(`${SOCIAL_PATH}/accounts?saved=1`);
}

// ------------------------------------------------------------------ brand kit

export async function saveBrandKitAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/brand`);
  const kit = await ensureKit(ctx);
  const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
  const font = FONT_KEYS.includes(str(fd, "font_key") as FontKey) ? (str(fd, "font_key") as FontKey) : kit.font_key;
  const tags = str(fd, "hashtags").split(/[\s,]+/).map((h) => h.replace(/^#*/, "#").replace(/[^#\p{L}\p{N}_]/gu, "")).filter((h) => h.length > 1).slice(0, 30);
  const lang = /^[a-z]{2,3}$/.test(str(fd, "language")) ? str(fd, "language") : kit.language;
  const handle = str(fd, "handle").replace(/^@*/, "@").slice(0, 60);
  const { error } = await ctx.supabase.from("social_brand_kits").update({
    primary_color: hex(str(fd, "primary_color"), kit.primary_color),
    secondary_color: hex(str(fd, "secondary_color"), kit.secondary_color),
    font_key: font,
    signature: str(fd, "signature").slice(0, 120) || null,
    handle: handle === "@" ? null : handle,
    hashtag_sets: { ...kit.hashtag_sets, default: tags },
    language: lang,
    confirmed_at: new Date().toISOString(), // the person has looked at it: the guide's step is done (031)
  }).eq("id", kit.id);
  revalidatePath(`${SOCIAL_PATH}/brand`);
  redirect(error ? `${SOCIAL_PATH}/brand?error=${encodeURIComponent(error.message)}` : `${SOCIAL_PATH}/brand?saved=1`);
}

/**
 * The Brand kit page's own logo upload: the browser put the file in the product's
 * bucket (RLS-scoped to the account folder); this records the URL where the product
 * keeps the actor's logo of record and mirrors it into the kit. Never trusts the URL:
 * it must point into this account's and actor's folder of the bucket the product named.
 */
export async function setBrandLogoAction(url: string): Promise<{ error?: string }> {
  const ctx = await loadSocial(`${SOCIAL_PATH}/brand`);
  const up = product.social?.logoUpload;
  if (!up) return { error: "Logo uploads are not set up for this product." };
  let u: URL;
  try { u = new URL(url); } catch { return { error: "Bad image URL." }; }
  const folder = up.path(ctx.account.id, ctx.actor.id).replace(/\/[^/]*$/, "/");
  if (!u.pathname.startsWith(`/storage/v1/object/public/${up.bucket}/${folder}`)) return { error: "That image does not belong to this name." };
  const res = await up.record(ctx.supabase, ctx.account.id, ctx.actor.id, u.toString());
  if (res.error) return res;
  const kit = await ensureKit(ctx);
  await ctx.supabase.from("social_brand_kits").update({ logo_url: u.toString() }).eq("id", kit.id);
  revalidatePath(`${SOCIAL_PATH}/brand`);
  revalidatePath(SOCIAL_PATH);
  return {};
}

/** After the OAuth round trip the start route needs a safe place to return to. */
export async function connectStartPath(next: string): Promise<string> {
  return `/api/social/oauth/instagram/start?next=${encodeURIComponent(safeNext(next, `${SOCIAL_PATH}/accounts`))}`;
}
