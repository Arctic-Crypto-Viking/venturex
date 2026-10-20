import Link from "next/link";
import { Badge, Button, ButtonLink, Card, Notice, Section } from "@core/components/ui";
import { CopyButton } from "@core/components/copy-button";
import { POST_COLUMNS, loadTemplates, type Post } from "@core/lib/social/db";
import { loadSocial, SOCIAL_PATH } from "../context";
import { SocialShell } from "../shell";
import { LocalTime } from "../local-time";
import { around } from "@core/lib/i18n-shared";
import { PostForm, type PostInitial } from "./post-form";
import { approvePostAction, discardDraftAction, rerenderPostAction } from "../actions";
import { ensureKit } from "../brand/kit";
import { product } from "@product";
import { safeNext } from "@core/lib/safe-next";

export const metadata = { title: "New post" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Venue picker's gigs, when the product has them (product.social.gigs); a failure only means typing the venue. */
async function loadGigs(ctx: Awaited<ReturnType<typeof loadSocial>>) {
  return product.social?.gigs ? product.social.gigs(ctx.supabase, ctx.account.id, ctx.actor.id).catch(() => []) : [];
}

/**
 * New post (§2.3 step 5): one form — template or your own photo, caption, first
 * comment, link, tags, time — makes a draft with its picture; step 2 (?post=)
 * shows exactly that picture and caption with Approve, Keep editing and Discard.
 * Approval is the database's decision (social_approve_post); its reasons come
 * back as ?issues.
 */
export default async function NewPostPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ctx = await loadSocial(`${SOCIAL_PATH}/new`);
  const t = ctx.dict.social;
  const postId = one("post");

  if (postId && UUID.test(postId)) {
    const { data } = await ctx.supabase.from("social_posts").select(POST_COLUMNS).eq("id", postId).eq("status", "draft").maybeSingle();
    const post = data as Post | null;
    if (!post) {
      return <SocialShell ctx={ctx}><Notice tone="warn">{t.compose.errors.gone}</Notice><ButtonLink href={`${SOCIAL_PATH}/new`}>{t.compose.title}</ButtonLink></SocialShell>;
    }
    if (one("edit") === "1") {
      // the check-and-edit step: the same editor, prefilled; saving makes the files again when they changed
      const [tpls, kit, gigs] = await Promise.all([loadTemplates(ctx.supabase, ctx.account.id, ctx.actor.id), ensureKit(ctx), loadGigs(ctx)]);
      const initial: PostInitial = {
        id: post.id, connectionId: post.social_account_id, format: post.format, kind: post.kind, templateId: post.template_id,
        slots: Object.fromEntries(Object.entries(post.slots ?? {}).filter(([k]) => !k.startsWith("_"))), media: post.media ?? [], caption: post.caption ?? "", firstComment: post.first_comment ?? "", altText: post.alt_text ?? "",
        link: post.link ?? "", userTags: post.user_tags ?? [], collaborators: post.collaborators ?? [],
        scheduledFor: post.scheduled_for,
        returnTo: one("return") ? safeNext(one("return")!, `${SOCIAL_PATH}/new?post=${post.id}`) : null,
      };
      return (
        <SocialShell ctx={ctx}>
          <Section title={t.compose.editTitle} action={<Link href={`${SOCIAL_PATH}/new?post=${post.id}`} className="underline underline-offset-4">{t.compose.review}</Link>}>
            <PostForm
              t={t.compose}
              accountId={ctx.account.id}
              connections={ctx.connections.map((c) => ({ id: c.id, label: c.handle ? `@${c.handle}` : c.display_name ?? c.provider }))}
              templates={tpls}
              gigs={gigs}
              defaultHashtags={(kit.hashtag_sets?.default ?? []).join(" ")}
              initial={initial}
            />
          </Section>
        </SocialShell>
      );
    }
    const issues = (one("issues") ?? "").split("\n").filter(Boolean);
    const duplicateOnly = issues.length > 0 && issues.every((i) => i.startsWith("duplicate:"));
    const conn = ctx.connections.find((c) => c.id === post.social_account_id);
    return (
      <SocialShell ctx={ctx}>
        <Section title={t.compose.review}>
          <p className="-mt-1 text-sm text-muted">{t.compose.reviewIntro}</p>
          {issues.length ? (
            <Notice tone={duplicateOnly ? "warn" : "danger"}>
              <span className="font-medium">{t.compose.issues}</span>
              <ul className="mt-1 list-disc pl-5">{issues.map((i) => <li key={i}>{i.replace(/^duplicate:/, "")}</li>)}</ul>
            </Notice>
          ) : null}
          {one("moved") ? <Notice tone="warn">{around(t.compose.timeMoved, "time")[0]}<LocalTime iso={post.scheduled_for} mode="time" />{around(t.compose.timeMoved, "time")[1]}</Notice> : null}
          {one("render_error") || post.media.length === 0 ? (
            <Notice tone="danger">
              {t.compose.renderFailed}
              <form action={rerenderPostAction} className="mt-2"><input type="hidden" name="post" value={post.id} /><Button type="submit" size="sm" variant="secondary">{t.compose.tryAgain}</Button></form>
            </Notice>
          ) : null}
          {!ctx.canPublish ? <Notice tone="accent">{t.compose.freeNote}</Notice> : null}
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="accent">{t.compose.formats[post.format]}</Badge>
              {conn ? <span className="text-muted">{conn.handle ? `@${conn.handle}` : conn.display_name}</span> : null}
              <span className="font-medium"><LocalTime iso={post.scheduled_for} /></span>
            </div>
            {post.kind === "video" && post.media.find((m) => m.kind === "video") ? (
              <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl bg-surface-2">
                <video src={post.media.find((m) => m.kind === "video")!.url} poster={post.media.find((m) => m.kind === "image")?.url} controls playsInline className="h-auto w-full" />
              </div>
            ) : post.media[0] ? (
              <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-surface-2">
                <img src={post.media[0].url} alt={post.alt_text ?? ""} className="h-auto w-full" />
              </div>
            ) : null}
            {post.caption ? <p className="whitespace-pre-line text-[15px] leading-relaxed">{post.caption}</p> : null}
            {post.first_comment ? <p className="whitespace-pre-line text-sm text-muted">{post.first_comment}</p> : null}
            {post.link || post.user_tags?.length || post.collaborators?.length ? (
              <dl className="grid gap-1 text-sm">
                {post.link ? <div className="flex gap-2"><dt className="text-muted">{t.compose.link}</dt><dd className="min-w-0 truncate"><a href={post.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{post.link}</a></dd></div> : null}
                {post.user_tags?.length ? <div className="flex gap-2"><dt className="text-muted">{t.compose.tags}</dt><dd>{post.user_tags.map((u) => `@${u.username}`).join(" ")}</dd></div> : null}
                {post.collaborators?.length ? <div className="flex gap-2"><dt className="text-muted">{t.compose.collaborators}</dt><dd>{post.collaborators.map((c) => `@${c}`).join(" ")}</dd></div> : null}
              </dl>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {post.caption ? <CopyButton text={post.caption} label={t.compose.copyCaption} /> : null}
              {post.first_comment ? <CopyButton text={post.first_comment} label={t.compose.copyComment} /> : null}
              {post.media[0] ? <a href={post.media[0].url} download className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm">{t.compose.download}</a> : null}
            </div>
          </Card>
          <div className="flex flex-col gap-2 sm:flex-row">
            <form action={approvePostAction} className="sm:flex-1">
              <input type="hidden" name="post" value={post.id} />
              {duplicateOnly ? <input type="hidden" name="force" value="1" /> : null}
              <Button type="submit" size="lg" full disabled={!ctx.canPublish || post.media.length === 0}>{duplicateOnly ? t.compose.approveAnyway : t.compose.approve}</Button>
            </form>
            {/* the founder's ask (20 Oct 2026): from the finished picture, back into the editor with everything kept */}
            <ButtonLink href={`${SOCIAL_PATH}/new?post=${post.id}&edit=1`} size="lg" variant="secondary" className="sm:flex-1">{t.compose.keepEditing}</ButtonLink>
            <form action={discardDraftAction}>
              <input type="hidden" name="post" value={post.id} />
              <Button type="submit" size="lg" variant="ghost" full>{t.compose.discard}</Button>
            </form>
          </div>
        </Section>
      </SocialShell>
    );
  }

  const [tpls, kit, gigs] = await Promise.all([loadTemplates(ctx.supabase, ctx.account.id, ctx.actor.id), ensureKit(ctx), loadGigs(ctx)]);
  return (
    <SocialShell ctx={ctx}>
      <Section title={t.compose.title}>
        <p className="-mt-1 text-sm text-muted">{t.compose.intro}</p>
        {ctx.connections.length === 0 ? (
          <Notice tone="accent">{t.banner.noConnection} <Link href={`${SOCIAL_PATH}/accounts`} className="font-medium underline underline-offset-4">{t.accounts.connectInstagram}</Link></Notice>
        ) : (
          <PostForm
            t={t.compose}
            accountId={ctx.account.id}
            connections={ctx.connections.map((c) => ({ id: c.id, label: c.handle ? `@${c.handle}` : c.display_name ?? c.provider }))}
            templates={tpls}
            gigs={gigs}
            defaultHashtags={(kit.hashtag_sets?.default ?? []).join(" ")}
          />
        )}
      </Section>
    </SocialShell>
  );
}
