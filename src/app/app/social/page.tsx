import Link from "next/link";
import { Notice } from "@core/components/ui";
import { around, fill } from "@core/lib/i18n-shared";
import { LocalTime } from "./local-time";
import { POST_COLUMNS, type Post } from "@core/lib/social/db";
import { loadSocial } from "./context";
import { SocialShell } from "./shell";
import { QueueList } from "./queue-list";
import { cancelPostAction, retryPostAction } from "./actions";

export const metadata = { title: "Social" };

/**
 * The queue (docs/SOCIAL-MANAGER.md §2.3 step 4): what goes out when, by day,
 * with Published (link), Failed (reason, Retry) and Waiting (why) on each card.
 * Grouping by day happens in the browser, in the person's own time zone.
 */
export default async function SocialQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ctx = await loadSocial();
  const t = ctx.dict.social;
  const [{ data }, { data: flag }] = await Promise.all([
    ctx.supabase.from("social_posts").select(POST_COLUMNS).eq("account_id", ctx.account.id).eq("actor_id", ctx.actor.id)
      .neq("status", "draft").order("scheduled_for", { ascending: true }).limit(300),
    ctx.supabase.from("feature_flags").select("enabled").eq("key", "social.publishing").maybeSingle(),
  ]);
  const posts = (data ?? []) as Post[];
  const paused = flag ? !flag.enabled : false;
  const byConn = Object.fromEntries(ctx.connections.map((c) => [c.id, c.handle ? `@${c.handle}` : c.display_name ?? c.provider]));

  return (
    <SocialShell ctx={ctx} paused={paused && posts.some((p) => ["approved", "queued", "publishing", "held"].includes(p.status))}>
      {one("error") ? <Notice tone="danger">{one("error")}</Notice> : null}
      {one("approved") ? <Notice tone="success">{t.compose.approved}</Notice> : null}
      {one("planned") ? <Notice tone="success">{fill(t.promote.planned_done, { n: one("planned")! })}</Notice> : null}
      {one("approved") && one("moved") && posts.find((p) => p.id === one("approved")) ? (
        <Notice tone="warn">{around(t.compose.timeMoved, "time")[0]}<LocalTime iso={posts.find((p) => p.id === one("approved"))!.scheduled_for} mode="time" />{around(t.compose.timeMoved, "time")[1]}</Notice>
      ) : null}
      {one("cancelled") ? <Notice tone="success">{t.queue.cancelled}</Notice> : null}
      {one("retried") ? <Notice tone="success">{t.queue.retried}</Notice> : null}
      {ctx.connections.length === 0 ? (
        <Notice tone="accent">
          {t.banner.noConnection}{" "}
          <Link href="/app/social/accounts" className="font-medium underline underline-offset-4">{t.accounts.connectInstagram}</Link>
        </Notice>
      ) : null}
      <QueueList posts={posts} handles={byConn} t={t.queue} highlight={one("approved") ?? one("retried")} cancel={cancelPostAction} retry={retryPostAction} />
    </SocialShell>
  );
}
