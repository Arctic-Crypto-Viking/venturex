import Link from "next/link";
import { createClient } from "@core/lib/supabase/server";
import { Badge, Button, Card, Input, Notice, Select, Textarea, cx, inputSmCls } from "@core/components/ui";
import { feedbackBuildConfig } from "@core/lib/feedback-build";
import { decideFeedbackAction, editFeedbackAction, mergeFeedbackAction } from "./actions";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

type Item = {
  id: string; kind: string; title: string; summary: string; body: string | null; status: string;
  vote_count: number; ai_formatted: boolean; merged_into: string | null; decision_note: string | null;
  decided_at: string | null; published_at: string | null; author_email: string | null;
  awaiting_review: boolean; vote_threshold: number; build_url: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open", approved: "Go-ahead given", in_progress: "In progress", shipped: "Shipped",
  declined: "Declined", hidden: "Hidden", merged: "Merged",
};
const SETTABLE = ["open", "approved", "in_progress", "shipped", "declined", "hidden"];
/** A virtual status: picking it opens a GitHub issue for Claude and then sets in_progress (migration 030). */
const BUILD = "build";
const BUILDABLE = new Set(["open", "approved", "in_progress"]);
const ON_BOARD = new Set(["open", "approved", "in_progress", "shipped", "declined"]);

/**
 * Admin → Feedback (core, migration 024). Suggestions that reached the vote threshold
 * wait at the top for the go-ahead; nothing is built because of a count alone. Status,
 * note, wording and merges are audited RPCs. The note is shown to users on the board.
 * "Start the build with Claude" (when FEEDBACK_GITHUB_REPO/TOKEN are set) opens an issue
 * in the product's repository that the Claude Code GitHub Action turns into a pull request.
 */
export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_feedback_list");
  const items = (data ?? []) as Item[];
  const threshold = items[0]?.vote_threshold ?? 10;
  const err = typeof sp.error === "string" ? sp.error : null;
  const saved = typeof sp.saved === "string" ? sp.saved : null;

  const groups: Array<[string, string, Item[]]> = [
    ["review", `Waiting for your go-ahead (${threshold}+ votes)`, items.filter((i) => i.awaiting_review)],
    ["work", "Go-ahead given and in progress", items.filter((i) => i.status === "approved" || i.status === "in_progress")],
    ["open", `Open, under ${threshold} votes`, items.filter((i) => i.status === "open" && !i.awaiting_review)],
  ];
  const closed = items.filter((i) => ["shipped", "declined", "hidden", "merged"].includes(i.status));
  const mergeTargets = items.filter((i) => ON_BOARD.has(i.status));
  const build = feedbackBuildConfig();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-[15px] font-semibold">Feedback</h2>
        <p className="mt-1 text-sm text-muted">
          Users vote on each other&apos;s suggestions. At {threshold} votes one waits here for your go-ahead (change the number
          under <Link href="/admin/settings" className="underline underline-offset-4">Settings</Link>, key <code>feedback</code>).
          Users see the title, summary, status and your note, never the author or the original text. Every change is audited.
        </p>
        <p className="mt-1 text-sm text-muted">
          {build ? (
            <>
              <strong className="font-medium text-fg">Start the build with Claude</strong> (in the status list) opens an issue in{" "}
              <code>{build.repo}</code> with the title, summary, votes and your note — never the author or the original text — and
              Claude answers with a pull request for you to review. The suggestion moves to <em>In progress</em> with the link.
            </>
          ) : (
            <>
              <strong className="font-medium text-fg">Start the build with Claude</strong> is off: set <code>FEEDBACK_GITHUB_REPO</code> and{" "}
              <code>FEEDBACK_GITHUB_TOKEN</code> on the server (SETUP-GUIDE Part 17).
            </>
          )}
        </p>
      </div>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {saved ? <Notice tone="success">Saved.</Notice> : null}
      {error ? <Notice tone="danger">{error.message}</Notice> : null}

      {groups.map(([key, title, list]) => (
        <div key={key} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {list.length === 0 ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            list.map((i) => <ItemCard key={i.id} item={i} highlight={i.id === saved} targets={mergeTargets} canBuild={!!build} />)
          )}
        </div>
      ))}

      {closed.length ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Shipped, declined, hidden and merged ({closed.length})</summary>
          <div className="mt-3 flex flex-col gap-3">
            {closed.map((i) => <ItemCard key={i.id} item={i} highlight={i.id === saved} targets={mergeTargets} canBuild={!!build} />)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function ItemCard({ item: i, highlight, targets, canBuild }: { item: Item; highlight: boolean; targets: Item[]; canBuild: boolean }) {
  // offered once: a suggestion that already has its issue is not sent to Claude a second time
  const offerBuild = canBuild && BUILDABLE.has(i.status) && !i.build_url;
  return (
    <Card className={cx(highlight && "ring-2 ring-accent")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={i.awaiting_review ? "warn" : i.status === "shipped" ? "success" : "neutral"}>
          {i.awaiting_review ? "Waiting for your go-ahead" : STATUS_LABEL[i.status] ?? i.status}
        </Badge>
        <span className="font-semibold tabular-nums">{i.vote_count} {i.vote_count === 1 ? "vote" : "votes"}</span>
        <span className="text-muted">{i.kind}</span>
        {!i.ai_formatted ? <span className="text-muted">· not reformatted</span> : null}
        {i.published_at ? <span className="text-muted">· {new Date(i.published_at).toLocaleDateString("en-GB")}</span> : null}
      </div>
      <h4 className="mt-2 font-semibold leading-snug">{i.title}</h4>
      <p className="mt-1 text-sm leading-relaxed">{i.summary}</p>
      {i.decision_note ? <p className="mt-2 text-sm text-muted">Your note: {i.decision_note}</p> : null}
      {i.build_url ? (
        <p className="mt-2 text-sm">
          Claude is building it ·{" "}
          <a href={i.build_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">open the issue</a>
        </p>
      ) : null}
      {i.merged_into ? <p className="mt-2 text-sm text-muted">Merged into {targets.find((t) => t.id === i.merged_into)?.title ?? "another suggestion"}.</p> : null}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Original text · {i.author_email ?? "deleted login"}</summary>
        <p className="mt-2 whitespace-pre-line rounded-xl bg-surface-2 px-3 py-2.5">{i.body ?? "(removed with the login)"}</p>
      </details>

      {i.status !== "merged" ? (
        <>
          <form action={decideFeedbackAction} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="id" value={i.id} />
            <label className="sm:w-48">
              <span className="mb-1 block text-xs text-muted">Status</span>
              <Select name="status" defaultValue={i.awaiting_review ? "approved" : i.status} className="h-10 text-sm">
                {SETTABLE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                {offerBuild ? <option value={BUILD}>Start the build with Claude → In progress</option> : null}
              </Select>
            </label>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs text-muted">Note for users (optional){offerBuild ? " · Claude reads it too" : ""}</span>
              <input name="note" defaultValue={i.decision_note ?? ""} maxLength={1000} className={inputSmCls} placeholder="e.g. Planned for November" />
            </label>
            <Button type="submit" size="sm" className="h-10">{i.awaiting_review ? "Save decision" : "Save"}</Button>
          </form>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Edit wording or merge a duplicate</summary>
            <form action={editFeedbackAction} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="id" value={i.id} />
              <Select name="kind" defaultValue={i.kind} className="h-10 text-sm">
                <option value="idea">Idea</option><option value="problem">Problem</option><option value="other">Other</option>
              </Select>
              <Input name="title" defaultValue={i.title} required minLength={3} maxLength={120} className="h-10 text-sm" />
              <Textarea name="summary" defaultValue={i.summary} required maxLength={1200} rows={3} className="text-sm" />
              <Button type="submit" size="sm" variant="secondary" className="self-start">Save wording</Button>
            </form>
            <form action={mergeFeedbackAction} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={i.id} />
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs text-muted">Same as… (its votes move there; a person who voted for both counts once)</span>
                <Select name="into" defaultValue="" className="h-10 text-sm">
                  <option value="" disabled>Pick the original</option>
                  {targets.filter((t) => t.id !== i.id && t.status !== "hidden").map((t) => (
                    <option key={t.id} value={t.id}>{t.title} ({t.vote_count})</option>
                  ))}
                </Select>
              </label>
              <Button type="submit" size="sm" variant="danger" className="h-10">Merge</Button>
            </form>
          </details>
        </>
      ) : null}
    </Card>
  );
}
