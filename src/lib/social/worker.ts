import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProvider } from "./providers";
import { COMMENT_SCOPE } from "./providers/instagram";
import { renderTemplate } from "./render";
import { uploadPostImage } from "./storage";
import { ProviderError, type Connected, type FrozenPost } from "./types";
import type { BrandKit, Post, Template } from "./db";
import { POST_COLUMNS } from "./db";

/**
 * The minute worker (docs/SOCIAL-MANAGER.md §4.5), driven by pg_cron + pg_net
 * every minute (SETUP-GUIDE Part 15) with CRON_SECRET as the bearer. Runs with
 * the service role; every step is idempotent and every claim is a lock:
 *
 *  1. refresh tokens that end within 10 days (a token is refreshable after 24 h);
 *     mark health: expiring (< 7 days), reconnect (refresh failed / expired).
 *  2. kill switch social.publishing: off → due posts hold with reason kill_switch,
 *     nothing reaches Meta; on → held(kill_switch) posts go back to the queue.
 *  3. render: approved posts due within 24 h without media → JPEG in the bucket → queued
 *     (social_claim_render; a post with media skips straight to queued).
 *  4. containers: queued posts due within 15 minutes → publishing (social_claim_due),
 *     quota checked, container created, id stored. Never twice: the id on the row says so.
 *  5. publish: publishing posts with a container, due now → poll → FINISHED → publish →
 *     published with permalink → first comment (a failure there is a warning, not a failed
 *     post). ERROR → failed with Meta's message, retried once after 5 minutes when transient.
 *     EXPIRED → container made again at the next run.
 *
 * Budget: at most MAX_POSTS posts touched per run (Vercel maxDuration 60); the rest
 * waits for the next minute. A post is never rendered and published in one run.
 */
export const MAX_POSTS = 20;
const TEN_DAYS = 10 * 86_400_000;
const SEVEN_DAYS = 7 * 86_400_000;
const DAY = 86_400_000;
const RETRY_AFTER_MS = 5 * 60_000;
const CONTAINER_MAX_AGE_MS = 23 * 3_600_000;

export type WorkerReport = {
  at: string; publishing: boolean;
  refreshed: number; health: number; released: number; heldBySwitch: number;
  rendered: number; renderFailed: number; containers: number; published: number; failed: number; retried: number;
  errors: string[];
};

type ConnRow = { id: string; account_id: string; provider: string; external_id: string; scopes: string[]; token_expires_at: string | null; token_refreshed_at: string | null; health: string; disconnected_at: string | null; daily_cap: number };

export async function runSocialWorker(admin: SupabaseClient, now = new Date()): Promise<WorkerReport> {
  const r: WorkerReport = {
    at: now.toISOString(), publishing: false, refreshed: 0, health: 0, released: 0, heldBySwitch: 0,
    rendered: 0, renderFailed: 0, containers: 0, published: 0, failed: 0, retried: 0, errors: [],
  };
  const note = (where: string, e: unknown) => { const m = e instanceof Error ? e.message : String(e); console.error(`social worker: ${where}`, m); r.errors.push(`${where}: ${m}`.slice(0, 300)); };

  // 1. tokens and health
  try { await refreshTokens(admin, now, r); } catch (e) { note("refresh", e); }

  // 2. the kill switch
  const { data: flag } = await admin.from("feature_flags").select("enabled").eq("key", "social.publishing").maybeSingle();
  r.publishing = Boolean(flag?.enabled);
  if (r.publishing) {
    const { data } = await admin.from("social_posts").update({ status: "queued", held_reason: null }).eq("status", "held").eq("held_reason", "kill_switch").select("id");
    r.released = data?.length ?? 0;
  }

  let budget = MAX_POSTS;

  // 3. render
  try { budget -= await renderDue(admin, now, r, budget); } catch (e) { note("render", e); }

  // 4. containers (or hold when the switch is off)
  if (budget > 0) {
    const { data: due, error } = await admin.rpc("social_claim_due", { p_now: now.toISOString(), p_limit: budget });
    if (error) note("claim", error);
    for (const post of (due ?? []) as Post[]) {
      budget--;
      if (!r.publishing) {
        await admin.rpc("social_hold", { p_post: post.id, p_reason: "kill_switch" });
        r.heldBySwitch++;
        continue;
      }
      try { await makeContainer(admin, post, r); } catch (e) { note(`container ${post.id}`, e); }
    }
  }

  // 5. poll and publish (only with the switch on; otherwise the containers wait and may expire → remade later)
  if (r.publishing && budget > 0) {
    const { data: pending } = await admin.from("social_posts").select(POST_COLUMNS)
      .eq("status", "publishing").not("container_id", "is", null).is("external_post_id", null)
      .lte("scheduled_for", now.toISOString()).order("scheduled_for").limit(budget);
    for (const post of (pending ?? []) as Post[]) {
      try { await publishIfReady(admin, post, now, r); } catch (e) { note(`publish ${post.id}`, e); }
    }
  }

  // transient failures: one more go after five minutes
  const { data: retry } = await admin.from("social_posts").select("id").eq("status", "failed").eq("held_reason", "retry")
    .lte("updated_at", new Date(now.getTime() - RETRY_AFTER_MS).toISOString()).limit(5);
  for (const p of retry ?? []) {
    await admin.from("social_posts").update({ status: "queued", held_reason: null, container_id: null, container_created_at: null }).eq("id", p.id);
    r.retried++;
  }
  return r;
}

// ------------------------------------------------------------------ 1. tokens

async function refreshTokens(admin: SupabaseClient, now: Date, r: WorkerReport) {
  const soon = new Date(now.getTime() + TEN_DAYS).toISOString();
  const { data } = await admin.from("social_accounts")
    .select("id, account_id, provider, external_id, scopes, token_expires_at, token_refreshed_at, health, disconnected_at, daily_cap")
    .is("disconnected_at", null).lte("token_expires_at", soon).limit(25);
  for (const c of (data ?? []) as ConnRow[]) {
    const expires = c.token_expires_at ? new Date(c.token_expires_at).getTime() : 0;
    const refreshedAgo = c.token_refreshed_at ? now.getTime() - new Date(c.token_refreshed_at).getTime() : Infinity;
    if (expires <= now.getTime()) {
      await setHealth(admin, c, "reconnect", "The connection has ended: connect the account again.", now);
      r.health++;
      continue;
    }
    if (refreshedAgo < DAY) continue; // Instagram refuses a refresh inside 24 h
    const provider = getProvider(c.provider);
    const { data: token } = await admin.rpc("social_token", { p_social_account: c.id });
    if (!token) continue;
    try {
      const fresh = await provider.refresh(token as string);
      await admin.rpc("social_store_token", { p_social_account: c.id, p_token: fresh.token, p_expires_at: fresh.expiresAt.toISOString() });
      await log(admin, { account_id: c.account_id, social_account_id: c.id, step: "refresh", ok: true, response: { expires_at: fresh.expiresAt.toISOString() } });
      r.refreshed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const transient = e instanceof ProviderError && e.transient;
      await log(admin, { account_id: c.account_id, social_account_id: c.id, step: "refresh", ok: false, response: { error: msg } });
      if (!transient) await setHealth(admin, c, expires - now.getTime() < SEVEN_DAYS ? "reconnect" : "expiring", msg, now);
      else if (expires - now.getTime() < SEVEN_DAYS) await setHealth(admin, c, "expiring", msg, now);
      r.health++;
    }
  }
}

async function setHealth(admin: SupabaseClient, c: ConnRow, health: string, note: string | null, now: Date) {
  await admin.from("social_accounts").update({ health, health_note: note, last_checked_at: now.toISOString() }).eq("id", c.id);
}

// ------------------------------------------------------------------ 3. render

async function renderDue(admin: SupabaseClient, now: Date, r: WorkerReport, limit: number): Promise<number> {
  const { data, error } = await admin.rpc("social_claim_render", { p_limit: limit });
  if (error) throw error;
  const posts = (data ?? []) as Post[];
  for (const post of posts) {
    if (post.status !== "rendering") continue; // had media: went straight to queued
    try {
      if (!post.template_id) throw new Error("no template and no media");
      const [{ data: tpl }, { data: kit }] = await Promise.all([
        admin.from("social_templates").select("*").eq("id", post.template_id).maybeSingle(),
        admin.from("social_brand_kits").select("*").eq("account_id", post.account_id).eq("actor_id", post.actor_id).maybeSingle(),
      ]);
      if (!tpl) throw new Error("template is gone");
      const brand = (kit as BrandKit | null) ?? { primary_color: "#111111", secondary_color: "#ffffff", font_key: "dm_sans" as const, logo_url: null, signature: null, handle: null, name: null };
      const out = await renderTemplate({ layout: (tpl as Template).layout, format: post.format, values: post.slots ?? {}, brand });
      const item = await uploadPostImage(admin, post.account_id, post.id, 1, out.jpeg, out.width, out.height);
      await admin.from("social_posts").update({ media: [item], status: "queued" }).eq("id", post.id).eq("status", "rendering");
      await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "render", ok: true, response: { bytes: item.bytes, width: item.width, height: item.height } });
      r.rendered++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("social_posts").update({ status: "held", held_reason: "render_failed", error: msg.slice(0, 500) }).eq("id", post.id).eq("status", "rendering");
      await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "render", ok: false, response: { error: msg } });
      r.renderFailed++;
    }
  }
  return posts.length;
}

// ------------------------------------------------------------------ 4. containers

async function connected(admin: SupabaseClient, post: Post): Promise<{ acct: Connected; conn: ConnRow } | null> {
  const { data: conn } = await admin.from("social_accounts")
    .select("id, account_id, provider, external_id, scopes, token_expires_at, token_refreshed_at, health, disconnected_at, daily_cap")
    .eq("id", post.social_account_id).maybeSingle();
  if (!conn || conn.disconnected_at) { await admin.rpc("social_hold", { p_post: post.id, p_reason: "disconnected" }); return null; }
  const { data: token } = await admin.rpc("social_token", { p_social_account: conn.id });
  if (!token) { await admin.rpc("social_hold", { p_post: post.id, p_reason: "disconnected" }); return null; }
  return { acct: { id: conn.id, externalId: conn.external_id, token: token as string }, conn: conn as ConnRow };
}

const frozen = (p: Post): FrozenPost => ({
  id: p.id, kind: p.kind, format: p.format, media: p.media ?? [], caption: p.caption ?? "",
  firstComment: p.first_comment, altText: p.alt_text, collaborators: p.collaborators ?? [], userTags: p.user_tags ?? [],
});

async function makeContainer(admin: SupabaseClient, post: Post, r: WorkerReport) {
  if (post.container_id) return; // idempotent: created already
  const c = await connected(admin, post);
  if (!c) return;
  const provider = getProvider(c.conn.provider);
  // the account's own cap over the last 24 h, then Meta's rolling limit
  const since = new Date(Date.now() - DAY).toISOString();
  const { count } = await admin.from("social_posts").select("id", { count: "exact", head: true })
    .eq("social_account_id", post.social_account_id).eq("status", "published").gte("published_at", since);
  if ((count ?? 0) >= c.conn.daily_cap) { await admin.rpc("social_hold", { p_post: post.id, p_reason: "daily_cap" }); return; }
  try {
    const left = await provider.remainingQuota(c.acct);
    if (left <= 0) { await admin.rpc("social_hold", { p_post: post.id, p_reason: "provider_quota" }); return; }
  } catch (e) {
    await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "container", ok: false, request: { step: "quota" }, response: { error: String(e instanceof Error ? e.message : e) } });
    // not fatal: Meta tells us again at publish time
  }
  try {
    const { containerId } = await provider.createContainer(c.acct, frozen(post));
    await admin.from("social_posts").update({ container_id: containerId, container_created_at: new Date().toISOString(), error: null }).eq("id", post.id);
    await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "container", ok: true, request: { format: post.format, kind: post.kind, media: post.media.map((m) => m.url) }, response: { id: containerId } });
    r.containers++;
  } catch (e) {
    await failPost(admin, post, e, "container", r);
  }
}

// ------------------------------------------------------------------ 5. publish

async function publishIfReady(admin: SupabaseClient, post: Post, now: Date, r: WorkerReport) {
  if (post.external_post_id || !post.container_id) return;
  const c = await connected(admin, post);
  if (!c) return;
  const provider = getProvider(c.conn.provider);
  const age = post.container_created_at ? now.getTime() - new Date(post.container_created_at).getTime() : 0;
  if (age > CONTAINER_MAX_AGE_MS) { // a container lives 24 h: make a new one next minute
    await admin.from("social_posts").update({ status: "queued", container_id: null, container_created_at: null }).eq("id", post.id);
    return;
  }
  let status: Awaited<ReturnType<typeof provider.containerStatus>>;
  try {
    status = await provider.containerStatus(c.acct, post.container_id);
  } catch (e) {
    await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "poll", ok: false, response: { error: String(e instanceof Error ? e.message : e) } });
    return; // polled again next minute
  }
  await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "poll", ok: status.status !== "ERROR", response: status });
  if (status.status === "IN_PROGRESS") return;
  if (status.status === "EXPIRED") {
    await admin.from("social_posts").update({ status: "queued", container_id: null, container_created_at: null }).eq("id", post.id);
    return;
  }
  if (status.status === "ERROR") {
    await failPost(admin, post, new ProviderError(status.detail ?? "Instagram could not process the media.", { transient: false }), "poll", r);
    return;
  }
  // FINISHED (or already PUBLISHED by Meta's account: treat as finished)
  try {
    const out = await provider.publish(c.acct, post.container_id);
    await admin.from("social_posts").update({
      status: "published", external_post_id: out.externalId, permalink: out.permalink, published_at: new Date().toISOString(), error: null, held_reason: null,
    }).eq("id", post.id);
    await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "publish", ok: true, response: out });
    r.published++;
  } catch (e) {
    await failPost(admin, post, e, "publish", r);
    return;
  }
  // a story carries no comments (§3): the step is skipped, not attempted
  if (post.first_comment && provider.comment && post.format !== "story_9x16") {
    if (!(c.conn.scopes ?? []).includes(COMMENT_SCOPE)) {
      await admin.from("social_posts").update({ error: "First comment not posted: the comments permission is not granted yet." }).eq("id", post.id);
      return;
    }
    try {
      await provider.comment(c.acct, (await admin.from("social_posts").select("external_post_id").eq("id", post.id).single()).data!.external_post_id as string, post.first_comment);
      await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "comment", ok: true });
    } catch (e) {
      // a warning, not a failed post (§3): the post is out
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("social_posts").update({ error: `First comment not posted: ${msg}`.slice(0, 500) }).eq("id", post.id);
      await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step: "comment", ok: false, response: { error: msg } });
    }
  }
}

async function failPost(admin: SupabaseClient, post: Post, e: unknown, step: "container" | "poll" | "publish", r: WorkerReport) {
  const msg = e instanceof Error ? e.message : String(e);
  const transient = e instanceof ProviderError && e.transient && post.attempts < 2;
  const detail = e instanceof ProviderError ? { message: msg, code: e.code, subcode: e.subcode, status: e.status, transient: e.transient } : { message: msg };
  await admin.from("social_posts").update({
    status: "failed", held_reason: transient ? "retry" : null, error: msg.slice(0, 500),
    ...(step === "poll" ? { container_id: null, container_created_at: null } : {}),
  }).eq("id", post.id);
  await log(admin, { account_id: post.account_id, post_id: post.id, social_account_id: post.social_account_id, step, ok: false, response: detail });
  r.failed++;
}

async function log(admin: SupabaseClient, row: { account_id: string; post_id?: string; social_account_id?: string; step: string; ok: boolean; request?: unknown; response?: unknown }) {
  const { error } = await admin.from("social_publish_log").insert(row);
  if (error) console.error("social worker: log", error.message);
}
