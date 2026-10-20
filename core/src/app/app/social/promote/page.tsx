import Link from "next/link";
import { Badge, Button, ButtonLink, Card, Field, Notice, Section, Textarea } from "@core/components/ui";
import { CopyButton } from "@core/components/copy-button";
import { fill } from "@core/lib/i18n-shared";
import { POST_COLUMNS, type Post } from "@core/lib/social/db";
import { findTriggerPlan, type TriggerPlan } from "@core/lib/social/plan";
import { loadSocial, PROMOTE_PATH, SOCIAL_PATH } from "../context";
import { SocialShell } from "../shell";
import { LocalTime } from "../local-time";
import { ConfirmForm } from "../confirm-form";
import { approvePromotePlanAction, discardPromotePlanAction, promoteTriggerAction, reconcileAction, savePromoteCardAction, skipPromoteCardAction } from "./actions";
import { product } from "@product";

export const metadata = { title: "Promote" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Promote (docs/SOCIAL-MANAGER.md §2.3, §6 phase 2). Without ?plan: what the actor
 * can promote now (the product's triggers: confirmed gigs) with one button each.
 * With ?plan: the plan's cards — date · format · rendered picture · caption —
 * each with Edit and Skip, and Approve plan at the bottom. Approval is one
 * database call (social_approve_plan): every card passes the gate rules of §4.6
 * or none is approved, and the reasons come back per card.
 */
export default async function PromotePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const planId = one("plan");
  // the plan's own actor (the gig's name), not the cookie's: a plan is read before the shell is drawn
  let planActor: string | null = null;
  if (planId && UUID.test(planId)) {
    const probe = await loadSocial(PROMOTE_PATH);
    const { data } = await probe.supabase.from("social_plans").select("actor_id").eq("id", planId).eq("account_id", probe.account.id).maybeSingle();
    planActor = (data?.actor_id as string | null) ?? null;
  }
  const ctx = await loadSocial(PROMOTE_PATH, planActor);
  const t = ctx.dict.social.promote;
  const c = ctx.dict.social.compose;
  const errorKey = one("error");
  const errorText = errorKey ? (t.errors as Record<string, string>)[errorKey] ?? errorKey : null;

  if (planId && UUID.test(planId)) {
    const [{ data: plan }, { data }] = await Promise.all([
      ctx.supabase.from("social_plans").select("id, status, trigger_kind, trigger_ref, trigger_at, moved_at, moved_from").eq("id", planId).eq("account_id", ctx.account.id).maybeSingle(),
      ctx.supabase.from("social_posts").select(POST_COLUMNS).eq("plan_id", planId).neq("status", "cancelled").order("scheduled_for"),
    ]);
    const posts = (data ?? []) as Post[];
    if (!plan || posts.length === 0) {
      return <SocialShell ctx={ctx}><Notice tone="warn">{t.errors.gone}</Notice><ButtonLink href={PROMOTE_PATH}>{t.tab}</ButtonLink></SocialShell>;
    }
    // did the trigger move since? (re-makes a proposed plan; flags an approved one)
    const moved = await reconcileAction(plan.trigger_kind as string, (plan.trigger_ref as string | null) ?? "");
    if (moved === "reproposed") {
      const fresh = await findTriggerPlan(ctx.supabase, ctx.account.id, plan.trigger_kind as string, plan.trigger_ref as string);
      if (fresh && fresh.id !== plan.id) return <SocialShell ctx={ctx}><Notice tone="accent">{t.reproposed}</Notice><ButtonLink href={`${PROMOTE_PATH}?plan=${fresh.id}`}>{t.open}</ButtonLink></SocialShell>;
    }
    const approved = plan.status !== "proposed";
    const drafts = posts.filter((p) => p.status === "draft");
    let issues: Record<string, string[]> = {};
    try { issues = one("issues") ? (JSON.parse(one("issues")!) as Record<string, string[]>) : {}; } catch { issues = {}; }
    const duplicateOnly = Object.keys(issues).length > 0 && Object.values(issues).every((list) => list.every((i) => i.startsWith("duplicate:")));
    const connLabel = (id: string) => { const x = ctx.connections.find((k) => k.id === id); return x ? (x.handle ? `@${x.handle}` : x.display_name ?? x.provider) : ""; };
    const skipped = (one("skipped") ?? "").split(",").filter(Boolean).map((s) => { const [family, reason] = s.split(":"); return { family, reason }; });
    const familyName = (p: Post) => (t.families as Record<string, string>)[p.slots?._family ?? ""] ?? p.slots?._family ?? "";

    return (
      <SocialShell ctx={ctx}>
        <Section title={approved ? t.approvedTitle : t.review}>
          <p className="-mt-1 text-sm text-muted">{approved ? t.approvedIntro : t.reviewIntro}</p>
          {errorText ? <Notice tone="danger">{errorText}</Notice> : null}
          {moved === "flagged" || plan.moved_at ? <Notice tone="danger">{t.moved}</Notice> : null}
          {one("ai") === "1" ? <Notice tone="accent">{t.aiNote}</Notice> : one("ai") === "0" ? <Notice tone="warn">{t.plainNote}</Notice> : null}
          {one("render_failed") ? <Notice tone="warn">{t.renderLater}</Notice> : null}
          {skipped.map((s) => <Notice key={`${s.family}-${s.reason}`} tone="warn">{fill(s.reason === "late" ? t.tooLate : t.noTemplate, { family: (t.families as Record<string, string>)[s.family] ?? s.family })}</Notice>)}
          {one("saved") ? <Notice tone="success">{t.saved}</Notice> : one("skipped") === "1" ? <Notice tone="success">{t.skippedOne}</Notice> : null}
          {!ctx.canPublish ? <Notice tone="accent">{c.freeNote}</Notice> : null}
          <ul className="flex flex-col gap-4">
            {posts.map((p) => {
              const own = issues[p.id] ?? [];
              const story = p.format === "story_9x16";
              const asks = (p.slots?._asks ?? "").split(",").filter(Boolean);
              const src = p.media[0]?.url ?? null;
              return (
                <li key={p.id} id={`post-${p.id}`}>
                  <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium"><LocalTime iso={p.scheduled_for} /></span>
                      <Badge tone="accent">{c.formats[p.format]}</Badge>
                      <Badge tone="neutral">{familyName(p)}</Badge>
                      <span className="text-muted">{connLabel(p.social_account_id)}</span>
                      {p.status !== "draft" ? <Badge tone={p.status === "published" ? "success" : p.status === "failed" ? "danger" : "neutral"}>{ctx.dict.social.queue.status[p.status]}</Badge> : null}
                    </div>
                    {own.length ? <Notice tone={own.every((i) => i.startsWith("duplicate:")) ? "warn" : "danger"}><span className="font-medium">{t.issues}</span><ul className="mt-1 list-disc pl-5">{own.map((i) => <li key={i}>{i.replace(/^duplicate:/, "")}</li>)}</ul></Notice> : null}
                    {asks.map((a) => <Notice key={a} tone="accent">{(t.asks as Record<string, string>)[a] ?? a}</Notice>)}
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className={`w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 ${story ? "max-w-[150px]" : "max-w-[200px]"}`}>
                        {src ? <img src={src} alt={p.alt_text ?? ""} className="h-auto w-full" /> : <div className={`flex ${story ? "aspect-[9/16]" : "aspect-[4/5]"} items-center justify-center p-3 text-center text-xs text-muted`}>{t.pictureLater}</div>}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {story ? <p className="text-sm text-muted">{t.storyNoCaption}</p> : <p className="whitespace-pre-wrap text-[15px] leading-snug">{p.caption}</p>}
                        {p.first_comment ? <p className="text-sm text-muted">{p.first_comment}</p> : null}
                        {p.status === "draft" ? (
                          <details className="group mt-1">
                            <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-lg border border-border-strong px-4 text-sm font-medium">{t.edit}</summary>
                            <form action={savePromoteCardAction} className="mt-3 flex flex-col gap-2">
                              <input type="hidden" name="plan" value={plan.id} />
                              <input type="hidden" name="post" value={p.id} />
                              {story ? null : <Field label={c.caption}><Textarea name="caption" defaultValue={p.caption} rows={5} maxLength={2200} /></Field>}
                              {story ? null : <Field label={c.firstComment} hint={c.firstCommentHint}><Textarea name="first_comment" defaultValue={p.first_comment ?? ""} rows={2} maxLength={2200} /></Field>}
                              <Field label={c.altText}><Textarea name="alt_text" defaultValue={p.alt_text ?? ""} rows={2} maxLength={1000} /></Field>
                              <div className="flex flex-wrap gap-2">
                                <Button type="submit" size="sm">{t.save}</Button>
                                <Link href={`${SOCIAL_PATH}/new?post=${p.id}&edit=1&return=${encodeURIComponent(`${PROMOTE_PATH}?plan=${plan.id}`)}`} className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm">{t.editPicture}</Link>
                              </div>
                            </form>
                          </details>
                        ) : null}
                        {!ctx.canPublish && p.caption ? <div className="flex flex-wrap gap-2"><CopyButton text={p.caption} label={c.copyCaption} />{src ? <a href={src} download className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm">{c.download}</a> : null}</div> : null}
                      </div>
                    </div>
                    {p.status === "draft" ? (
                      <ConfirmForm action={skipPromoteCardAction} message={t.confirmSkip} className="self-end">
                        <input type="hidden" name="plan" value={plan.id} />
                        <input type="hidden" name="post" value={p.id} />
                        <Button type="submit" size="sm" variant="ghost">{t.skip}</Button>
                      </ConfirmForm>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
          {!approved ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <form action={approvePromotePlanAction} className="sm:flex-1">
                <input type="hidden" name="plan" value={plan.id} />
                {duplicateOnly ? <input type="hidden" name="force" value="1" /> : null}
                <Button type="submit" size="lg" full disabled={!ctx.canPublish || drafts.length === 0}>{duplicateOnly ? t.approveAnyway : fill(t.approve, { n: String(drafts.length) })}</Button>
              </form>
              <ConfirmForm action={discardPromotePlanAction} message={fill(t.confirmDiscard, { n: String(drafts.length) })}>
                <input type="hidden" name="plan" value={plan.id} />
                <Button type="submit" size="lg" variant="ghost" full>{t.discard}</Button>
              </ConfirmForm>
            </div>
          ) : <ButtonLink href={SOCIAL_PATH} variant="secondary">{ctx.dict.social.tabs.queue}</ButtonLink>}
        </Section>
      </SocialShell>
    );
  }

  // the list: what this actor can promote now
  const triggers = product.social?.triggers ? await product.social.triggers(ctx.supabase, ctx.account.id).catch(() => []) : [];
  const mine = triggers.filter((tr) => tr.actorId === ctx.actor.id);
  const plans = await Promise.all(mine.map((tr) => findTriggerPlan(ctx.supabase, ctx.account.id, tr.kind, tr.ref)));
  return (
    <SocialShell ctx={ctx}>
      <Section title={t.listTitle}>
        <p className="-mt-1 text-sm text-muted">{fill(t.listIntro, { app: product.brand.name })}</p>
        {errorText ? <Notice tone="danger">{fill(errorText, { name: ctx.actor.name })}</Notice> : null}
        {ctx.connections.length === 0 ? <Notice tone="accent">{ctx.dict.social.banner.noConnection}</Notice> : null}
        {mine.length === 0 ? <Notice tone="accent">{t.none}</Notice> : null}
        <ul className="flex flex-col gap-3">
          {mine.map((tr, i) => <li key={`${tr.kind}:${tr.ref}`}><TriggerRow trigger={tr} plan={plans[i]} t={t} connected={ctx.connections.length > 0} /></li>)}
        </ul>
      </Section>
    </SocialShell>
  );
}

function TriggerRow({ trigger, plan, t, connected }: { trigger: { kind: string; ref: string; label: string; at: string; slots: Record<string, string> }; plan: TriggerPlan | null; t: Awaited<ReturnType<typeof loadSocial>>["dict"]["social"]["promote"]; connected: boolean }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{trigger.label}</p>
        <p className="text-sm text-muted">{[trigger.slots.venue, trigger.slots.city, trigger.slots.date, trigger.slots.time].filter(Boolean).join(" · ")}</p>
      </div>
      <PlanState plan={plan} t={t} />
      <div className="flex flex-wrap gap-2">
        {plan ? <ButtonLink href={`${PROMOTE_PATH}?plan=${plan.id}`} size="sm" variant="secondary">{t.open}</ButtonLink> : null}
        {!plan || plan.status === "proposed" ? (
          <form action={promoteTriggerAction}>
            <input type="hidden" name="kind" value={trigger.kind} />
            <input type="hidden" name="ref" value={trigger.ref} />
            <Button type="submit" size="sm" disabled={!connected}>{plan ? t.again : t.button}</Button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

/** One line on a trigger's plan: proposed, scheduled, or moved. */
function PlanState({ plan, t }: { plan: TriggerPlan | null; t: { planned: string; scheduled: string; movedShort: string } }) {
  if (!plan) return null;
  if (plan.moved_at) return <Badge tone="danger">{t.movedShort}</Badge>;
  return <Badge tone={plan.status === "approved" ? "success" : "accent"}>{plan.status === "approved" ? t.scheduled : t.planned}</Badge>;
}
