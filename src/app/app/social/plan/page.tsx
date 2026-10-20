import { Badge, Button, Card, Field, Notice, Section, Textarea } from "@core/components/ui";
import { CopyButton } from "@core/components/copy-button";
import { fill } from "@core/lib/i18n-shared";
import { featureValue } from "@core/lib/entitlements";
import { loadFolders, loadItems } from "@core/lib/files/db";
import { signedUrls } from "@core/lib/files/storage";
import { POST_COLUMNS, type Post } from "@core/lib/social/db";
import { loadSocial, SOCIAL_PATH } from "../context";
import { SocialShell } from "../shell";
import { LocalTime } from "../local-time";
import { ConfirmForm } from "../confirm-form";
import { PlanForm } from "./plan-form";
import { approvePlanAction, discardPlanAction, removePlanPostAction, savePlanCaptionAction } from "./actions";

export const metadata = { title: "Fill a month" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fill a month (docs/FILES.md §6): without ?plan, the rhythm form; with it, the
 * review — one card per draft, its picture as the worker prepares it, caption
 * editable, Remove, and Approve all once every picture is there. Approval goes
 * through social_approve_plan: its reasons come back per post in ?issues.
 */
export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ctx = await loadSocial(`${SOCIAL_PATH}/plan`);
  const t = ctx.dict.files.plan;
  const planId = one("plan");

  if (planId && UUID.test(planId)) {
    const [{ data: plan }, { data }] = await Promise.all([
      ctx.supabase.from("social_plans").select("id, status").eq("id", planId).eq("account_id", ctx.account.id).maybeSingle(),
      ctx.supabase.from("social_posts").select(POST_COLUMNS).eq("plan_id", planId).eq("status", "draft").order("scheduled_for"),
    ]);
    const posts = (data ?? []) as Post[];
    if (!plan || plan.status !== "proposed" || posts.length === 0) {
      return <SocialShell ctx={ctx}><Notice tone="warn">{t.errors.gone}</Notice></SocialShell>;
    }
    const itemIds = posts.map((p) => p.slots?.library_item).filter((v): v is string => Boolean(v));
    const items = itemIds.length ? await loadItems(ctx.supabase, ctx.account.id, { status: "all", limit: 200 }) : [];
    const byItem = new Map(items.filter((i) => itemIds.includes(i.id)).map((i) => [i.id, i]));
    const thumbs = await signedUrls(ctx.supabase, Array.from(byItem.values()).map((i) => i.thumb_path).filter((p): p is string => Boolean(p)));
    let issues: Record<string, string[]> = {};
    try { issues = one("issues") ? (JSON.parse(one("issues")!) as Record<string, string[]>) : {}; } catch { issues = {}; }
    const ready = posts.filter((p) => p.media.length > 0).length;
    const failed = posts.filter((p) => p.slots?.stage_error);
    const allReady = ready === posts.length;
    const duplicateOnly = Object.keys(issues).length > 0 && Object.values(issues).every((list) => list.every((i) => i.startsWith("duplicate:")));
    const connLabel = (id: string) => { const c = ctx.connections.find((x) => x.id === id); return c ? (c.handle ? `@${c.handle}` : c.display_name ?? c.provider) : ""; };

    return (
      <SocialShell ctx={ctx}>
        <Section title={t.review}>
          <p className="-mt-1 text-sm text-muted">{t.reviewIntro}</p>
          {one("error") ? <Notice tone="danger">{one("error")}</Notice> : null}
          {!ctx.canPublish ? <Notice tone="accent">{t.freeNote}</Notice> : null}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={allReady ? "success" : "warn"}>{fill(t.ready, { n: String(ready), m: String(posts.length) })}</Badge>
            {!allReady && failed.length === 0 ? <meta httpEquiv="refresh" content="20" /> : null}
          </div>
          <ul className="flex flex-col gap-4">
            {posts.map((p) => {
              const item = p.slots?.library_item ? byItem.get(p.slots.library_item) : undefined;
              const src = p.media[0]?.url ?? (item?.thumb_path ? thumbs.get(item.thumb_path) : null) ?? null;
              const own = issues[p.id] ?? [];
              return (
                <li key={p.id} id={`post-${p.id}`}>
                  <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone="accent">{ctx.dict.social.compose.formats[p.format]}</Badge>
                      <span className="text-muted">{connLabel(p.social_account_id)}</span>
                      <span className="font-medium"><LocalTime iso={p.scheduled_for} /></span>
                      {p.media.length ? null : <Badge tone="warn">{ctx.dict.files.item.preparing}</Badge>}
                    </div>
                    {p.slots?.stage_error ? <Notice tone="danger">{t.stageFailed} {p.slots.stage_error}</Notice> : null}
                    {own.length ? <Notice tone={own.every((i) => i.startsWith("duplicate:")) ? "warn" : "danger"}><span className="font-medium">{t.issues}</span><ul className="mt-1 list-disc pl-5">{own.map((i) => <li key={i}>{i.replace(/^duplicate:/, "")}</li>)}</ul></Notice> : null}
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="w-full max-w-[200px] shrink-0 overflow-hidden rounded-xl bg-surface-2">
                        {src && p.kind === "image" ? <img src={src} alt={p.alt_text ?? ""} className="h-auto w-full" /> : src ? <img src={src} alt="" className="h-auto w-full" /> : <div className="flex aspect-[4/5] items-center justify-center text-xs text-muted">{ctx.dict.files.item.preparing}</div>}
                      </div>
                      <form action={savePlanCaptionAction} className="flex min-w-0 flex-1 flex-col gap-2">
                        <input type="hidden" name="plan" value={plan.id} />
                        <input type="hidden" name="post" value={p.id} />
                        <Field label={t.caption}><Textarea name="caption" defaultValue={p.caption} rows={4} maxLength={2200} /></Field>
                        <Textarea name="first_comment" defaultValue={p.first_comment ?? ""} rows={2} maxLength={2200} aria-label={ctx.dict.social.compose.firstComment} />
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm" variant="secondary">{t.saveCaption}</Button>
                          {!ctx.canPublish && p.caption ? <CopyButton text={p.caption} label={ctx.dict.social.compose.copyCaption} /> : null}
                          {!ctx.canPublish && p.media[0] ? <a href={p.media[0].url} download className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm">{ctx.dict.social.compose.download}</a> : null}
                        </div>
                      </form>
                    </div>
                    <form action={removePlanPostAction} className="self-end">
                      <input type="hidden" name="plan" value={plan.id} />
                      <input type="hidden" name="post" value={p.id} />
                      <Button type="submit" size="sm" variant="ghost">{t.remove}</Button>
                    </form>
                  </Card>
                </li>
              );
            })}
          </ul>
          {!allReady ? <p className="text-sm text-muted">{t.notReady}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <form action={approvePlanAction} className="sm:flex-1">
              <input type="hidden" name="plan" value={plan.id} />
              {duplicateOnly ? <input type="hidden" name="force" value="1" /> : null}
              <Button type="submit" size="lg" full disabled={!ctx.canPublish || !allReady}>{fill(t.approveAll, { n: String(posts.length) })}</Button>
            </form>
            <ConfirmForm action={discardPlanAction} message={t.confirmDiscard}>
              <input type="hidden" name="plan" value={plan.id} />
              <Button type="submit" size="lg" variant="ghost" full>{t.discard}</Button>
            </ConfirmForm>
          </div>
        </Section>
      </SocialShell>
    );
  }

  const [items, folders] = await Promise.all([
    loadItems(ctx.supabase, ctx.account.id, { actorId: ctx.actor.id, status: "active", limit: 1000 }),
    loadFolders(ctx.supabase, ctx.account.id),
  ]);
  const counts = new Map<string, number>();
  for (const i of items) if (i.folder_id && i.kind !== "other") counts.set(i.folder_id, (counts.get(i.folder_id) ?? 0) + 1);
  const max = featureValue(ctx.ent, "social.autoplan_max");
  return (
    <SocialShell ctx={ctx}>
      <Section title={t.title}>
        <p className="-mt-1 text-sm text-muted">{t.intro}</p>
        {ctx.connections.length === 0 ? <Notice tone="accent">{ctx.dict.social.banner.noConnection}</Notice> : null}
        {items.length === 0 ? <Notice tone="accent">{t.none}</Notice> : null}
        {ctx.connections.length > 0 && items.length > 0 ? (
          <PlanForm
            t={t}
            connections={ctx.connections.map((c) => ({ id: c.id, label: c.handle ? `@${c.handle}` : c.display_name ?? c.provider }))}
            folders={folders.filter((f) => counts.has(f.id)).map((f) => ({ id: f.id, name: f.path || f.name, count: counts.get(f.id) ?? 0 }))}
            photos={items.filter((i) => i.kind === "image").length}
            videos={items.filter((i) => i.kind === "video").length}
            max={max}
          />
        ) : null}
      </Section>
    </SocialShell>
  );
}
