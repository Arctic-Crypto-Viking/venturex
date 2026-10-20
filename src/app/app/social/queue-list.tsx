"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, ButtonLink, Card, EmptyState, cx } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import type { CoreDict } from "@core/i18n";
import type { Post } from "@core/lib/social/db";
import { ConfirmForm } from "./confirm-form";
import { LocalTime } from "./local-time";

type Words = CoreDict["social"]["queue"];
const TONE: Record<string, "neutral" | "accent" | "success" | "warn" | "danger"> = {
  approved: "accent", queued: "accent", rendering: "accent", publishing: "accent", published: "success", failed: "danger", cancelled: "neutral", held: "warn", draft: "neutral",
};
const OPEN = new Set(["approved", "rendering", "queued", "publishing", "held", "failed"]);

/** Posts by local day, upcoming first; published and cancelled fold away below. */
export function QueueList({ posts, handles, t, highlight, cancel, retry }: {
  posts: Post[]; handles: Record<string, string>; t: Words; highlight: string | null;
  cancel: (fd: FormData) => Promise<void>; retry: (fd: FormData) => Promise<void>;
}) {
  const [showPast, setShowPast] = useState(false);
  const open = posts.filter((p) => OPEN.has(p.status));
  const past = posts.filter((p) => !OPEN.has(p.status)).reverse();
  const groups = useMemo(() => groupByDay(open, t), [open, t]);

  if (posts.length === 0) return <EmptyState title={t.empty} hint={t.emptyHint} />;
  return (
    <div className="flex flex-col gap-6">
      {groups.map(([day, items]) => (
        <section key={day} className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">{day}</h2>
          <ul className="flex flex-col gap-3">{items.map((p) => <PostCard key={p.id} post={p} handle={handles[p.social_account_id]} t={t} on={p.id === highlight} cancel={cancel} retry={retry} />)}</ul>
        </section>
      ))}
      {past.length ? (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setShowPast((v) => !v)} className="self-start text-sm font-medium text-muted underline-offset-4 hover:underline">
            {fill(t.showPast, { n: past.length })}
          </button>
          {showPast ? <ul className="flex flex-col gap-3">{past.map((p) => <PostCard key={p.id} post={p} handle={handles[p.social_account_id]} t={t} on={false} cancel={cancel} retry={retry} />)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}

function groupByDay(posts: Post[], t: Words): Array<[string, Post[]]> {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date(); const tomorrow = new Date(today.getTime() + 86_400_000);
  const out = new Map<string, [string, Post[]]>();
  for (const p of posts) {
    const d = new Date(p.scheduled_for);
    const k = key(d);
    const label = k === key(today) ? t.today : k === key(tomorrow) ? t.tomorrow : fmt.format(d);
    if (!out.has(k)) out.set(k, [label, []]);
    out.get(k)![1].push(p);
  }
  return [...out.values()];
}

function PostCard({ post, handle, t, on, cancel, retry }: { post: Post; handle?: string; t: Words; on: boolean; cancel: (fd: FormData) => Promise<void>; retry: (fd: FormData) => Promise<void> }) {
  const thumb = post.media.find((m) => m.kind === "image")?.url;
  const isVideo = post.kind === "video";
  const status = t.status[post.status as keyof Words["status"]] ?? post.status;
  const held = post.status === "held" && post.held_reason ? t.held[post.held_reason as keyof Words["held"]] : null;
  const canCancel = !["published", "cancelled"].includes(post.status) && !post.external_post_id;
  const canRetry = post.status === "failed" || (post.status === "held" && post.held_reason !== "kill_switch" && post.held_reason !== "disconnected");
  return (
    <li>
      <Card className={cx("flex gap-3", on && "ring-2 ring-accent")}>
        <div className={cx("relative shrink-0 overflow-hidden rounded-xl bg-surface-2", post.format === "story_9x16" || post.format === "reel_9x16" ? "h-24 w-[54px]" : "h-24 w-[77px]")}>
          {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : null}
          {isVideo ? <span aria-hidden className="absolute inset-0 flex items-center justify-center text-2xl text-fg/80">▶</span> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold"><LocalTime iso={post.scheduled_for} mode="time" /></span>
            {handle ? <span className="text-muted">{handle}</span> : null}
            <Badge tone={TONE[post.status] ?? "neutral"}>{status}</Badge>
          </div>
          {post.caption ? <p className="mt-1 line-clamp-2 text-sm text-muted">{post.caption}</p> : null}
          {held ? <p className="mt-1 text-sm text-warn">{held}</p> : null}
          {post.status === "failed" && post.error ? <p className="mt-1 text-sm text-danger"><span className="font-medium">{t.errorLabel}</span> {post.error}</p> : null}
          {post.status === "published" && post.error ? <p className="mt-1 text-xs text-muted">{post.error}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {post.status === "published" && post.permalink ? <ButtonLink href={post.permalink} size="sm" target="_blank" rel="noreferrer">{t.open}</ButtonLink> : null}
            {post.status === "draft" ? <ButtonLink href={`/app/social/new?post=${post.id}`} size="sm" variant="primary">{t.finish}</ButtonLink> : null}
            {canRetry ? (
              <form action={retry}><input type="hidden" name="post" value={post.id} /><Button type="submit" size="sm" variant="soft">{t.retry}</Button></form>
            ) : null}
            {canCancel ? (
              <ConfirmForm action={cancel} message={t.confirmCancel}><input type="hidden" name="post" value={post.id} /><Button type="submit" size="sm" variant="ghost">{t.cancel}</Button></ConfirmForm>
            ) : null}
            {post.permalink && post.status !== "published" ? <Link href={post.permalink} className="text-sm underline">{t.open}</Link> : null}
          </div>
        </div>
      </Card>
    </li>
  );
}
