import { createClient } from "@core/lib/supabase/server";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Section, cx } from "@core/components/ui";
import { product } from "@product";
import { FeedbackForm } from "./feedback-form";
import { discardFeedbackAction, publishFeedbackAction, toggleVoteAction, voteInsteadAction } from "./actions";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

type BoardRow = {
  id: string; kind: string; title: string; summary: string; status: string; vote_count: number;
  decision_note: string | null; mine: boolean; voted: boolean; awaiting_review: boolean;
};
type Draft = { id: string; kind: string; title: string; summary: string; body: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<string, [string, "neutral" | "accent" | "success" | "warn" | "danger"]> = {
  open: ["Open", "neutral"],
  approved: ["Approved", "accent"],
  in_progress: ["In progress", "accent"],
  shipped: ["Shipped", "success"],
  declined: ["Declined", "neutral"],
};
const KIND: Record<string, string> = { idea: "Idea", problem: "Problem", other: "Other" };
const VOTABLE = new Set(["open", "approved", "in_progress"]);

/**
 * Feedback board (core, migration 024). Step 1 is the form; step 2 (?draft=) shows the
 * draft the way others will see it, next to the suggestions that already say the same,
 * so a vote goes there instead of a duplicate. Below: the board, most votes first.
 */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const draftId = one("draft");
  const supabase = await createClient();

  const [{ data: boardData }, { data: status }, draftRes] = await Promise.all([
    supabase.from("feedback_board").select("*").order("vote_count", { ascending: false }).order("published_at", { ascending: false }).limit(300),
    supabase.rpc("feedback_status"),
    draftId && UUID.test(draftId)
      ? supabase.from("feedback_items").select("id, kind, title, summary, body").eq("id", draftId).eq("status", "draft").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const board = (boardData ?? []) as BoardRow[];
  const threshold = (status as { vote_threshold?: number } | null)?.vote_threshold ?? 10;
  const draftsLeft = (status as { drafts_left?: number } | null)?.drafts_left ?? 0;
  const draft = draftRes.data as Draft | null;
  const matchIds = (one("m") ?? "").split(",").filter((id) => UUID.test(id));
  const matches = matchIds.map((id) => board.find((b) => b.id === id)).filter((b): b is BoardRow => !!b);

  const active = board.filter((b) => VOTABLE.has(b.status));
  const shipped = board.filter((b) => b.status === "shipped");
  const declined = board.filter((b) => b.status === "declined");
  const posted = one("posted");
  const voted = one("voted");
  const error = one("error");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Feedback"
        subtitle={`Tell us what would make ${product.brand.name} better, and vote for what others asked. A suggestion with ${threshold} votes goes to review.`}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {posted ? <Notice tone="success">Posted, with your vote. Thank you!</Notice> : null}
      {voted ? <Notice tone="success">Your vote is in. Thank you!</Notice> : null}

      {draftId && draft ? (
        <section className="flex flex-col gap-4" aria-labelledby="draft-title">
          <Card tone="accent">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">How others will see it</p>
            <div className="mt-2 flex items-center gap-2"><Badge>{KIND[draft.kind] ?? draft.kind}</Badge></div>
            <h2 id="draft-title" className="mt-2 text-lg font-semibold leading-snug">{draft.title}</h2>
            <p className="mt-1 text-[15px] leading-relaxed">{draft.summary}</p>
            {draft.body ? (
              <details className="mt-3 text-sm text-muted">
                <summary className="cursor-pointer">What you wrote (only you and the team see this)</summary>
                <p className="mt-2 whitespace-pre-line">{draft.body}</p>
              </details>
            ) : null}
          </Card>

          {matches.length ? (
            <Section title="Already on the board. Is it one of these?">
              <ul className="flex flex-col gap-3">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Card>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge row={m} />
                        <span className="text-sm text-muted">{m.vote_count} {m.vote_count === 1 ? "vote" : "votes"}</span>
                      </div>
                      <h3 className="mt-2 font-semibold leading-snug">{m.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{m.summary}</p>
                      <div className="mt-3">
                        {!VOTABLE.has(m.status) ? (
                          <p className="text-sm text-muted">{m.status === "shipped" ? "This one is already shipped." : "This one is closed."}</p>
                        ) : m.voted ? (
                          <p className="text-sm text-muted">You have already voted for this one.</p>
                        ) : (
                          <form action={voteInsteadAction.bind(null, draft.id, m.id)}>
                            <Button type="submit" full>+1, that&apos;s my point</Button>
                          </form>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <form action={publishFeedbackAction.bind(null, draft.id)} className="sm:flex-1">
              <Button type="submit" variant={matches.length ? "secondary" : "primary"} size="lg" full>
                {matches.length ? "Mine is different: post it" : "Post it"}
              </Button>
            </form>
            <form action={discardFeedbackAction.bind(null, draft.id)}>
              <Button type="submit" variant="ghost" size="lg" full>Discard</Button>
            </form>
          </div>
        </section>
      ) : (
        <Card>
          {draftId ? <div className="mb-4"><Notice tone="warn">That draft is gone (posted, discarded or older than a day).</Notice></div> : null}
          {draftsLeft === 0 ? <div className="mb-4"><Notice tone="warn">You have sent a lot of feedback today. Thank you! Try again tomorrow.</Notice></div> : null}
          <FeedbackForm draftsLeft={draftsLeft} ai={!!process.env.ANTHROPIC_API_KEY} privacyPath={product.privacyPath} />
        </Card>
      )}

      <Section title="On the board">
        {active.length === 0 ? (
          <EmptyState title="Nothing here yet" hint="Be the first: what would make it better for you?" />
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((row) => <BoardItem key={row.id} row={row} highlight={row.id === posted || row.id === voted} />)}
          </ul>
        )}
      </Section>

      {shipped.length || declined.length ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted">Shipped ({shipped.length}) and declined ({declined.length})</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {[...shipped, ...declined].map((row) => <BoardItem key={row.id} row={row} highlight={false} />)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function StatusBadge({ row }: { row: BoardRow }) {
  if (row.awaiting_review) return <Badge tone="warn">Waiting for review</Badge>;
  const [label, tone] = STATUS[row.status] ?? [row.status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

function BoardItem({ row, highlight }: { row: BoardRow; highlight: boolean }) {
  const votable = VOTABLE.has(row.status);
  return (
    <li>
      <Card className={cx("flex gap-3", highlight && "ring-2 ring-accent")}>
        <form action={toggleVoteAction.bind(null, row.id, row.voted)} className="shrink-0">
          <button
            type="submit"
            disabled={!votable}
            aria-pressed={row.voted}
            aria-label={row.voted ? `Remove your vote (${row.vote_count})` : `Vote (${row.vote_count})`}
            className={cx(
              "flex h-14 w-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60",
              row.voted ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface hover:border-border-strong",
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 15 7-7 7 7" /></svg>
            {row.vote_count}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge row={row} />
            <span className="text-xs text-muted">{KIND[row.kind] ?? row.kind}</span>
            {row.mine ? <span className="text-xs text-muted">· yours</span> : null}
          </div>
          <h3 className="mt-1.5 font-semibold leading-snug">{row.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{row.summary}</p>
          {row.decision_note ? <p className="mt-2 text-sm"><span className="font-medium">From the team:</span> {row.decision_note}</p> : null}
        </div>
      </Card>
    </li>
  );
}
