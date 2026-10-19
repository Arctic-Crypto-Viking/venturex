import { Badge, Card, EmptyState } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import type { Dict } from "@/i18n/en";
import { rulesFor } from "@/lib/test-rules";
import { fmtDate, type VentureCard } from "@/lib/ventures";
import { openTestOf, type TestRow } from "@/lib/workspace";
import { MakeWeekForm, ResultForm, SetTestForm } from "../forms";
import { NotLive, ScreenHead, WorkspaceOff } from "../off";

/**
 * Tests (HANDOFF §4.4, §6): the test in flight with its numbers, the result
 * against them, "set the test" with the country-rules checklist before it
 * starts, the week's test (moves the hours), and the log of forecasts and results.
 * Pure: the page loads, this renders.
 */
export function TestsView({ id, v, t, locale, on, tests, weekElsewhere }: {
  id: string; v: VentureCard; t: Dict; locale: string; on: boolean; tests: TestRow[]; weekElsewhere: { account_id: string; title: string } | null;
}) {
  const w = t.workspace.tests;
  if (!on) return <><ScreenHead v={v} t={t} title={w.title} /><WorkspaceOff t={t} id={id} /></>;
  const open = openTestOf(tests);
  const log = tests.filter((x) => x.status === "done");
  const date = (d: string | null | undefined) => fmtDate(d, locale);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHead v={v} t={t} title={w.title} subtitle={w.sub} />
      {v.state !== "live" ? <NotLive t={t} /> : null}

      <Card tone="accent" className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{w.open}</span>
          {open?.is_week_test ? <Badge tone="accent">{w.week}</Badge> : null}
        </p>
        {open ? (
          <>
            <p className="text-[15px] font-medium">{open.what}</p>
            <p className="text-sm">{fill(t.card.testLine, { what: "", date: date(open.deadline), pass: open.pass_number, fail: open.fail_number }).replace(/^\s*—\s*/, "")}</p>
            {open.cost_cents ? <p className="text-xs text-muted">{fill(w.cost, { cost: money(open.cost_cents) })}</p> : null}
            {v.has_hours ? <p className="text-xs text-muted">{w.hoursHere}</p> : v.state === "live" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">{w.notWeek}</p>
                {!open.is_week_test ? <MakeWeekForm account={id} w={w} weekElsewhere={weekElsewhere} /> : null}
              </div>
            ) : null}
            <div className="border-t border-border/60 pt-3">
              <ResultForm account={id} test={open} w={w} rescoreHref={`/door/start?rescore=${id}`} />
            </div>
          </>
        ) : <p className="text-sm text-muted">{w.noOpen}</p>}
      </Card>

      {!open ? (
        <Card className="flex flex-col gap-3">
          <SetTestForm account={id} w={w} tw={t.door.verdict.test} rules={rulesFor(v.market)} weekElsewhere={weekElsewhere} isLive={v.state === "live"} />
        </Card>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{w.log}</h2>
        {log.length === 0 ? <EmptyState title={w.logEmpty} /> : (
          <ul className="divide-y divide-border">
            {log.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  {x.outcome ? <Badge tone={x.outcome === "pass" ? "success" : x.outcome === "fail" ? "danger" : "warn"}>{w.outcome[x.outcome]}</Badge> : <Badge>{w.superseded}</Badge>}
                  {x.is_week_test ? <span className="text-xs text-muted">{w.week}</span> : null}
                  <span className="text-xs text-muted">{date(x.set_at)}</span>
                </p>
                <p className="text-[15px]">{fill(w.logLine, { what: x.what, date: date(x.deadline), pass: x.pass_number, fail: x.fail_number })}</p>
                {x.result_number != null && x.outcome ? <p className="text-sm text-muted">{fill(w.resultLine, { n: x.result_number, outcome: w.outcome[x.outcome], date: date(x.result_at) })}</p> : null}
                {x.changed_one_thing ? <p className="text-xs text-muted">{x.changed_one_thing}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
