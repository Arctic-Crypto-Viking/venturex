"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { featureValue } from "@core/lib/entitlements";
import { loadFolders } from "@core/lib/files/db";
import { createMonthPlan } from "@core/lib/files/planner";
import { removePostFiles } from "@core/lib/social/storage";
import { loadSocial, ownConnection, SOCIAL_PATH } from "../context";
import { ensureKit } from "../brand/kit";

const PLAN_PATH = `${SOCIAL_PATH}/plan`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, lo: number, hi: number, d: number) => { const v = Number(str(fd, k)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; };

export type PlanState = { error?: string } | undefined;

/** Fill a month, step 1: the rhythm → a plan of drafts (docs/FILES.md §6). */
export async function createPlanAction(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const ctx = await loadSocial(PLAN_PATH);
  const t = ctx.dict.files.plan;
  const conn = ownConnection(ctx, str(fd, "account"));
  if (!conn) return { error: t.errors.account };
  const kinds = fd.getAll("kind").map(String).filter((k): k is "image" | "video" => k === "image" || k === "video");
  const folderIds = fd.getAll("folder").map(String).filter((f) => UUID.test(f));
  const kit = await ensureKit(ctx);
  const folders = await loadFolders(ctx.supabase, ctx.account.id);
  const result = await createMonthPlan(ctx.supabase, { accountId: ctx.account.id, actorId: ctx.actor.id, userId: ctx.user.id },
    { signature: kit.signature, hashtags: kit.hashtag_sets?.default ?? [] }, folders, {
      connectionId: conn.id,
      perWeek: num(fd, "per_week", 1, 7, 3),
      weekdays: fd.getAll("weekday").map(Number).filter((d) => d >= 0 && d <= 6),
      hour: num(fd, "hour", 0, 23, 18), minute: num(fd, "minute", 0, 59, 0),
      tz: str(fd, "tz") || "UTC", days: num(fd, "days", 7, 62, 30),
      kinds: kinds.length ? kinds : ["image"], folderIds: folderIds.length ? folderIds : null,
      maxPosts: featureValue(ctx.ent, "social.autoplan_max"),
    });
  if (result.created === 0) return { error: t.none };
  revalidatePath(PLAN_PATH);
  redirect(`${PLAN_PATH}?plan=${result.planId}`);
}

async function ownPlan(ctx: Awaited<ReturnType<typeof loadSocial>>, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await ctx.supabase.from("social_plans").select("id, status").eq("id", id).eq("account_id", ctx.account.id).maybeSingle();
  return data as { id: string; status: string } | null;
}

export async function savePlanCaptionAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PLAN_PATH);
  const planId = str(fd, "plan"); const postId = str(fd, "post");
  const plan = await ownPlan(ctx, planId);
  if (!plan || !UUID.test(postId)) redirect(PLAN_PATH);
  await ctx.supabase.from("social_posts").update({ caption: str(fd, "caption").slice(0, 2200), first_comment: str(fd, "first_comment").slice(0, 2200) || null })
    .eq("id", postId).eq("plan_id", plan.id).eq("status", "draft");
  revalidatePath(PLAN_PATH);
  redirect(`${PLAN_PATH}?plan=${plan.id}&saved=${postId}#post-${postId}`);
}

export async function removePlanPostAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PLAN_PATH);
  const planId = str(fd, "plan"); const postId = str(fd, "post");
  const plan = await ownPlan(ctx, planId);
  if (!plan || !UUID.test(postId)) redirect(PLAN_PATH);
  const { data } = await ctx.supabase.from("social_posts").delete().eq("id", postId).eq("plan_id", plan.id).eq("status", "draft").select("id");
  if (data?.length) await removePostFiles(ctx.supabase, ctx.account.id, postId).catch(() => {});
  revalidatePath(PLAN_PATH);
  redirect(`${PLAN_PATH}?plan=${plan.id}`);
}

export async function discardPlanAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PLAN_PATH);
  const plan = await ownPlan(ctx, str(fd, "plan"));
  if (plan) {
    const { data } = await ctx.supabase.from("social_posts").delete().eq("plan_id", plan.id).eq("status", "draft").select("id");
    for (const p of data ?? []) await removePostFiles(ctx.supabase, ctx.account.id, p.id as string).catch(() => {});
    await ctx.supabase.from("social_plans").delete().eq("id", plan.id).eq("status", "proposed");
  }
  revalidatePath(PLAN_PATH);
  redirect(PLAN_PATH);
}

/** Step 2: approve them all. The database decides (social_approve_plan → social_post_issues per post). */
export async function approvePlanAction(fd: FormData): Promise<void> {
  const ctx = await loadSocial(PLAN_PATH);
  const plan = await ownPlan(ctx, str(fd, "plan"));
  if (!plan) redirect(PLAN_PATH);
  const { data, error } = await ctx.supabase.rpc("social_approve_plan", { p_plan: plan.id, p_force: str(fd, "force") === "1" });
  if (error) redirect(`${PLAN_PATH}?plan=${plan.id}&error=${encodeURIComponent(error.message.slice(0, 300))}`);
  const r = data as { ok: boolean; approved?: number; issues?: Record<string, string[]> };
  if (!r.ok) redirect(`${PLAN_PATH}?plan=${plan.id}&issues=${encodeURIComponent(JSON.stringify(r.issues ?? {}))}`);
  revalidatePath(SOCIAL_PATH);
  redirect(`${SOCIAL_PATH}?planned=${r.approved ?? 0}`);
}
