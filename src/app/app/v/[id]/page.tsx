import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";
import { getLocale } from "@core/lib/i18n";
import { fill } from "@core/lib/i18n-shared";
import { Badge, ButtonLink, Card, PageHeader, Rows, cx } from "@core/components/ui";
import { getDict } from "@/i18n";
import { DIMENSIONS, GATE_NUMBERS } from "@/lib/door";
import { fmtDate, loadRuns, loadVenture, scoresOf } from "@/lib/ventures";
import { STATE_TONE } from "../../home-view";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).card.metaTitle };
}

/**
 * The card (HANDOFF §4.6): the venture's home. State with basis and date, the
 * score with its five dimensions, the gates, the stage, the test in flight, the
 * trigger if parked, the descriptive six, money, next action — and "Re-score",
 * which opens the door on this venture (the door asks for the changed fact
 * when the venture is killed).
 */
export default async function VenturePage({ params }: PageProps<"/app/v/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/v/${id}`);
  const supabase = await createClient();
  const [v, runs, t, locale] = await Promise.all([loadVenture(supabase, id), loadRuns(supabase, id), getDict(), getLocale()]);
  if (!v) notFound();
  const c = t.card;
  const scores = scoresOf(v);
  const date = (d: string | null | undefined) => fmtDate(d, locale);
  const money = (cents: number) => (cents ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100) : c.none);

  return (
    <div className="flex flex-col gap-6">
      <p><Link href="/app" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">← {c.back}</Link></p>
      <PageHeader
        eyebrow={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={STATE_TONE[v.state]}>{t.states[v.state]}</Badge>
          {v.state_basis ? <span className="text-xs text-muted">{t.states[v.state_basis]}{v.state_since ? ` · ${fill(c.since, { date: date(v.state_since) })}` : ""}</span> : null}
          {v.has_hours ? <Badge tone="accent">{t.states.hasHours}</Badge> : null}
        </span>}
        title={v.title}
        subtitle={v.state_reason ?? undefined}
        action={<ButtonLink href={`/door/start?rescore=${v.account_id}`} variant="secondary">{c.rescore}</ButtonLink>}
      />
      {v.to_confirm ? <p className="text-sm text-warn">{c.toConfirm}</p> : null}
      {v.state === "killed" ? <p className="text-xs text-muted">{c.rescoreKilledHint}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">{c.scores}</p>
            {v.total != null ? <span className="font-display text-2xl font-semibold">{v.total}<span className="text-sm font-normal text-muted"> / 25</span></span> : null}
          </div>
          {scores ? (
            <ul className="flex flex-col gap-2">
              {DIMENSIONS.map((d) => (
                <li key={d} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1">{t.door.score.dims[d].name}</span>
                  <span className="flex gap-1" aria-hidden>
                    {[1, 2, 3, 4, 5].map((i) => <span key={i} className={cx("h-2.5 w-2.5 rounded-[3px]", i <= scores[d] ? "bg-fg" : "bg-border-strong")} />)}
                  </span>
                  <span className="w-4 text-right font-mono">{scores[d]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{v.killed_at_gate ? fill(c.gateKilled, { n: v.killed_at_gate }) : "—"}</p>
          )}
          {v.demand_capped ? <p className="text-xs text-muted">{t.door.verdict.capped}</p> : null}
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{c.gates}</p>
          {v.run_id ? (
            <ol className="flex flex-col gap-1.5 text-sm">
              {GATE_NUMBERS.map((n) => {
                const answer = v[`gate_${n}` as const];
                const note = v[`gate_${n}_note` as const];
                if (answer == null) return null;
                return (
                  <li key={n} className="flex gap-2">
                    <Badge tone={answer ? "success" : "danger"}>{answer ? t.door.gates.yes : t.door.gates.no}</Badge>
                    <span className="min-w-0"><span className="text-muted">{n}.</span> {t.door.gates.items[n - 1].q}{note ? <span className="block text-muted">{note}</span> : null}</span>
                  </li>
                );
              })}
            </ol>
          ) : <p className="text-sm text-muted">—</p>}
        </Card>
      </div>

      {v.state === "live" ? (
        <Card tone="accent" className="flex flex-col gap-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{c.test}</p>
          {v.test_what ? (
            <p className="text-sm">{fill(c.testLine, { what: v.test_what, date: date(v.test_deadline), pass: v.test_pass ?? "", fail: v.test_fail ?? "" })}</p>
          ) : <p className="text-sm text-muted">{c.noTest}</p>}
          {v.stage ? <p className="text-sm text-muted">{fill(c.stage, { n: v.stage })} · {c.stageNames[v.stage - 1]}{v.stage_since ? ` · ${fill(c.since, { date: date(v.stage_since) })}` : ""}</p> : null}
        </Card>
      ) : null}
      {v.state === "parked" && v.revival_trigger ? (
        <Card tone="warn" className="flex flex-col gap-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{c.revival}</p>
          <p className="text-sm">{fill(t.home.trigger, { trigger: v.revival_trigger, number: v.revival_number ?? "", date: date(v.revival_deadline) })}</p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{c.title}</p>
        <Rows rows={[
          [c.whatItIs, v.title],
          [c.customer, v.customer ?? c.notYet],
          [c.usesToday, v.uses_today ?? c.notYet],
          [c.shipIn30, v.ship_in_30_days ?? c.notYet],
          [c.unfairReach, v.unfair_reach ?? c.notYet],
          [c.assets, v.assets ?? c.notYet],
          [c.channelHas, v.channel_has ?? c.notYet],
          [c.channelNeeds, v.channel_needs ?? c.notYet],
          [c.moneyIn, money(v.money_in_cents)],
          [c.committed, money(v.committed_cents)],
          [c.calendar, v.calendar ?? c.notYet],
          [c.unblocker, v.unblocker ?? c.notYet],
          [c.nextAction, v.next_action ?? "—"],
          [c.nextDate, v.next_date ? date(v.next_date) : "—"],
        ]} />
      </Card>

      {runs.length ? (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{c.runs}</p>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {runs.map((r) => (
              <li key={r.id}>
                {fill(c.runLine, { date: date(r.created_at), verdict: t.verdicts[r.verdict], total: r.total != null ? ` ${r.total}/25` : r.killed_at_gate ? ` · ${fill(c.gateKilled, { n: r.killed_at_gate })}` : "", v: r.rules_version })}
                {r.fact_changed ? <span className="block">{fill(c.factChanged, { fact: r.fact_changed })}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
