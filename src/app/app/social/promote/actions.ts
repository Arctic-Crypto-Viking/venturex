"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTriggerPlan, findTriggerPlan, loadRule, reconcileTriggerPlan } from "@core/lib/social/plan";
import { removePostFiles } from "@core/lib/social/storage";
import { loadSocial, PROMOTE_PATH, SOCIAL_PATH } from "../context";
import { ensureKit } from "../brand/kit";
import { product } from "@product";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** The trigger the browser named, found in the product's own list (never trusted from the form). */
async function ownTrigger(kind: string, ref: string) {
  if (!product.social?.triggers || !ref) return null;
  const probe = await loadSocial(PROMOTE_PATH);
  const triggers = await product.social.triggers(probe.supabase, probe.account.id);
  const trigger = triggers.find((t) => t.kind === kind && t.ref === ref) ?? null;
  return trigger ? { trigger, probe } : null;
}

/**
 * Promote this gig (§6 phase 2): a rule + the trigger → one plan of drafts, rendered
 * now, then the plan screen. Promoting the same thing again while a plan is
 * proposed makes it again; while a plan is approved, opens it.
 */
export async function promoteTriggerAction(fd: FormData): Promise<void> {
  const kind = str(fd, "kind") || "gig.confirmed";
  const ref = str(fd, "ref");
  const found = await ownTrigger(kind, ref);
  if (!found) redirect(`${PROMOTE_PATH}?error=trigger`);
  const { trigger } = found;
  const ctx = await loadSocial(PROMOTE_PATH, trigger.actorId);
  if (ctx.actor.id !== trigger.actorId) redirect(`${PROMOTE_PATH}?error=trigger`);
  if (!ctx.connections.some((c) => !c.disconnected_at)) redirect(`${PROMOTE_PATH}?error=connection`);
  const rule = await loadRule(ctx.supabase, trigger.kind);
  if (!rule) redirect(`${PROMOTE_PATH}?error=rule`);
  const existing = await findTriggerPlan(ctx.supabase, ctx.account.id, trigger.kind, trigger.ref);
  if (existing?.status === "approved") redirect(`${PROMOTE_PATH}?plan=${existing.id}`);
  const [kit, captionContext] = await Promise.all([
    ensureKit(ctx),
    product.social?.captionContext ? product.social.captionContext(ctx.supabase, ctx.account.id, ctx.actor.id).catch(() => null) : Promise.resolve(null),
  ]);
  let outcome;
  try {
    outcome = await createTriggerPlan({
      supabase: ctx.supabase, accountId: ctx.account.id, userId: ctx.user.id, actor: ctx.actor, connections: ctx.connections, kit, ent: ctx.ent,
      trigger, rule, captionContext, productName: product.brand.name, replacePlanId: existing?.status === "proposed" ? existing.id : null,
    });
  } catch (e) {
    console.error("social: promote", e);
    redirect(`${PROMOTE_PATH}?error=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "plan")}`);
  }
  if (!outcome.planId) redirect(`${PROMOTE_PATH}?error=nothing`);
  revalidatePath(PROMOTE_PATH);
  revalidatePath(SOCIAL_PATH);
  const skipped = outcome.skipped.map((s) => `${s.family}:${s.reason}`).join(",");
  redirect(`${PROMOTE_PATH}?plan=${outcome.planId}${outcome.ai ? "&ai=1" : "&ai=0"}${skipped ? `&skipped=${encodeURIComponent(skipped)}` : ""}${outcome.renderFailed ? "&render_failed=1" : ""}`);
}

/** Opening a trigger's plan checks whether the trigger moved (a proposed plan is re-made; an approved one is flagged). */
export async function reconcileAction(kind: string, ref: string): Promise<"same" | "reproposed" | "flagged" | null> {
  const found = await ownTrigger(kind, ref);
  if (!found) return null;
  const { trigger } = found;
  const ctx = await loadSocial(PROMOTE_PATH, trigger.actorId);
  const plan = await findTriggerPlan(ctx.supabase, ctx.account.id, trigger.kind, trigger.ref);
  if (!plan) return null;
  const [rule, kit, captionContext] = await Promise.all([
    loadRule(ctx.supabase, trigger.kind), ensureKit(ctx),
    product.social?.captionContext ? product.social.captionContext(ctx.supabase, ctx.account.id, ctx.actor.id).catch(() => null) : Promise.resolve(null),
  ]);
  return reconcileTriggerPlan({
    supabase: ctx.supabase, accountId: ctx.account.id, userId: ctx.user.id, actor: ctx.actor, connections: ctx.connections, kit, ent: ctx.ent,
    trigger, rule, captionContext, productName: product.brand.name, plan,
  });
}

async function ownPlan(ctx: Awaited<ReturnType<typeof loadSocial>>, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await ctx.supabase.from("social_plans").select("id, status, actor_id").eq("id", id).eq("account_id", ctx.account.id).maybeSingle();
  return data as { id: string; status: string; actor_id: string | null } | null;
}

/** Edit on a card: caption, first comment and alt text change in place (a draft is still the member's). */
export async function savePromoteCardAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PROMOTE_PATH);
  const plan = await ownPlan(ctx, str(fd, "plan"));
  const postId = str(fd, "post");
  if (!plan || !UUID.test(postId)) redirect(PROMOTE_PATH);
  const { data: post } = await ctx.supabase.from("social_posts").select("format").eq("id", postId).eq("plan_id", plan.id).eq("status", "draft").maybeSingle();
  if (!post) redirect(`${PROMOTE_PATH}?plan=${plan.id}`);
  const story = post.format === "story_9x16";
  await ctx.supabase.from("social_posts").update({
    caption: story ? "" : str(fd, "caption").slice(0, 2200),
    first_comment: story ? null : str(fd, "first_comment").slice(0, 2200) || null,
    alt_text: str(fd, "alt_text").slice(0, 1000) || null,
  }).eq("id", postId).eq("plan_id", plan.id).eq("status", "draft");
  revalidatePath(PROMOTE_PATH);
  redirect(`${PROMOTE_PATH}?plan=${plan.id}&saved=${postId}#post-${postId}`);
}

/** Skip on a card: the draft and its files go. */
export async function skipPromoteCardAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PROMOTE_PATH);
  const plan = await ownPlan(ctx, str(fd, "plan"));
  const postId = str(fd, "post");
  if (!plan || !UUID.test(postId)) redirect(PROMOTE_PATH);
  const { data } = await ctx.supabase.from("social_posts").delete().eq("id", postId).eq("plan_id", plan.id).eq("status", "draft").select("id");
  if (data?.length) await removePostFiles(ctx.supabase, ctx.account.id, postId).catch(() => {});
  revalidatePath(PROMOTE_PATH);
  redirect(`${PROMOTE_PATH}?plan=${plan.id}&skipped=1`);
}

export async function discardPromotePlanAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PROMOTE_PATH);
  const plan = await ownPlan(ctx, str(fd, "plan"));
  if (plan && plan.status === "proposed") {
    const { data } = await ctx.supabase.from("social_posts").delete().eq("plan_id", plan.id).eq("status", "draft").select("id");
    for (const p of data ?? []) await removePostFiles(ctx.supabase, ctx.account.id, p.id as string).catch(() => {});
    await ctx.supabase.from("social_plans").delete().eq("id", plan.id).eq("status", "proposed");
  }
  revalidatePath(PROMOTE_PATH);
  redirect(PROMOTE_PATH);
}

/** Approve plan: the database decides for every card at once (social_approve_plan → social_post_issues: token, caps, spacing, duplicates). */
export async function approvePromotePlanAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PROMOTE_PATH);
  const plan = await ownPlan(ctx, str(fd, "plan"));
  if (!plan) redirect(PROMOTE_PATH);
  const { data, error } = await ctx.supabase.rpc("social_approve_plan", { p_plan: plan.id, p_force: str(fd, "force") === "1" });
  if (error) redirect(`${PROMOTE_PATH}?plan=${plan.id}&error=${encodeURIComponent(error.message.slice(0, 300))}`);
  const r = data as { ok: boolean; approved?: number; issues?: Record<string, string[]> };
  if (!r.ok) redirect(`${PROMOTE_PATH}?plan=${plan.id}&issues=${encodeURIComponent(JSON.stringify(r.issues ?? {}))}`);
  revalidatePath(SOCIAL_PATH);
  revalidatePath(PROMOTE_PATH);
  redirect(`${SOCIAL_PATH}?planned=${r.approved ?? 0}`);
}
