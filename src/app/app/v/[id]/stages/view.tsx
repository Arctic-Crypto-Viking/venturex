import { Badge, Card, cx } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import type { Dict } from "@/i18n/en";
import { fmtDate, type VentureCard } from "@/lib/ventures";
import { STAGES, STALL_WEEKS, weeksAtStage, type StageHistoryRow, type StageProgressRow } from "@/lib/workspace";
import { StageStepForm } from "../forms";
import { NotLive, ScreenHead, WorkspaceOff } from "../off";

/**
 * The eight stages (HANDOFF §4.3): the exit test and "Founder does" of each,
 * the one the venture stands at, the founder's step recorded with evidence,
 * premature work named in the method's words, the stall line, the history.
 * Pure: the page loads, this renders (the View-as pattern of HomeView).
 */
export function StagesView({ id, v, t, locale, on, progress, history }: {
  id: string; v: VentureCard; t: Dict; locale: string; on: boolean; progress: StageProgressRow[]; history: StageHistoryRow[];
}) {
  const w = t.workspace.stages;
  if (!on) return <><ScreenHead v={v} t={t} title={w.title} /><WorkspaceOff t={t} id={id} /></>;
  const byStage = new Map(progress.map((p) => [p.stage, p]));
  const current = v.stage ?? null;
  const weeks = weeksAtStage(v.stage_since);
  const stalled = v.state === "live" && weeks != null && weeks >= STALL_WEEKS;
  const coveredByVerdict = v.verdict === "go";
  const date = (d: string | null | undefined) => fmtDate(d, locale);

  return (
    <div className="flex flex-col gap-5">
      <ScreenHead v={v} t={t} title={w.title} subtitle={w.sub} />
      {v.state !== "live" ? <NotLive t={t} /> : null}
      {stalled ? <p className="text-sm text-warn">{w.stalled}</p> : null}
      <ol className="flex flex-col gap-3">
        {STAGES.map((n) => {
          const p = byStage.get(n);
          const done = Boolean(p?.founder_step_done_at) || (coveredByVerdict && n <= 2);
          const isCurrent = current === n;
          const premature = current != null && n > current && Boolean(p && (p.founder_step_done_at || p.exit_passed_at || p.evidence));
          return (
            <li key={n}>
              <Card tone={isCurrent ? "accent" : "default"} className={cx("flex flex-col gap-3", done && !isCurrent && "opacity-80")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{fill(t.card.stage, { n })}</span>
                  {isCurrent ? <Badge tone="accent">{w.current}</Badge> : null}
                  {done ? <Badge tone="success">{p?.founder_step_done_at ? fill(w.done, { date: date(p.founder_step_done_at) }) : w.coveredByVerdict}</Badge> : null}
                  {p?.exit_passed_at ? <Badge tone="success">{fill(w.exitPassed, { date: date(p.exit_passed_at) })}</Badge> : null}
                </div>
                <p className="text-[17px] font-semibold leading-tight">{t.card.stageNames[n - 1]}</p>
                {isCurrent && weeks != null ? <p className={cx("text-sm", stalled ? "text-warn" : "text-muted")}>{fill(w.weeksAt, { n: weeks })}</p> : null}
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">{w.exitTest}</dt><dd>{w.items[n - 1].exit}</dd>
                  <dt className="text-muted">{w.founderDoes}</dt><dd className="font-medium">{w.items[n - 1].founder}</dd>
                </dl>
                {p?.evidence ? <p className="text-sm"><span className="text-muted">{w.evidence}: </span>{p.evidence}</p> : null}
                {premature ? <p className="text-xs text-warn">{w.premature}</p> : null}
                {v.state === "live" && !(coveredByVerdict && n <= 2) ? (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <StageStepForm account={id} stage={n} step="founder" done={Boolean(p?.founder_step_done_at)} evidence={p?.evidence ?? null} w={w} />
                    {p?.founder_step_done_at ? <StageStepForm account={id} stage={n} step="exit" done={Boolean(p?.exit_passed_at)} evidence={p?.evidence ?? null} w={w} /> : null}
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>
      {history.length ? (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{w.history}</p>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {history.map((h) => (
              <li key={h.id}>{fill(w.historyLine, { date: date(h.changed_at), from: h.from_stage ?? "—", to: h.to_stage ?? "—", source: w.sources[h.source as keyof typeof w.sources] ?? h.source })}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
