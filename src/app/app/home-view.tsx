import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { en, type Dict } from "@/i18n/en";
import { fmtDate, type VentureCard } from "@/lib/ventures";
import type { VentureState } from "@/lib/door";

/**
 * The owner's home, "My ventures" (HANDOFF §6): cards by state — LIVE first
 * with the one that has the hours marked, then PARKED with their triggers,
 * KILLED collapsed — the cap line, the week's test, "New idea". The same view
 * the superadmin sees read-only through View as.
 */
export const STATE_TONE: Record<VentureState, "neutral" | "accent" | "success" | "warn" | "danger"> = {
  live: "success", parked: "warn", killed: "danger", untriaged: "neutral",
};

export function HomeView({ ventures, cap, savedMax, readOnly = false, accountName = "", t = en, locale = "en" }: {
  ventures: VentureCard[];
  cap: { live: number; hours: VentureCard | null; saved: number };
  /** -1 = unlimited */
  savedMax: number;
  readOnly?: boolean;
  accountName?: string;
  t?: Dict;
  locale?: string;
}) {
  const h = t.home;
  const byState = (s: VentureState) => ventures.filter((v) => v.state === s);
  const live = byState("live"), parked = byState("parked"), untriaged = byState("untriaged"), killed = byState("killed");
  const weekTest = live.find((v) => v.is_week_test && v.test_what) ?? live.find((v) => v.test_what) ?? null;
  const savedLine = savedMax === -1 ? fill(h.savedUnlimited, { n: cap.saved }) : fill(h.savedLine, { n: cap.saved, max: savedMax });

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? <Notice tone="accent">{h.readOnly}: {accountName}</Notice> : null}
      <PageHeader
        title={h.title}
        subtitle={ventures.length ? `${fill(h.capLine, { live: cap.live })} · ${cap.hours ? fill(h.hoursOn, { title: cap.hours.title }) : h.hoursNone} · ${savedLine}` : undefined}
        action={readOnly ? undefined : <ButtonLink href="/app/new" variant="primary">{h.newIdea}</ButtonLink>}
      />

      {ventures.length === 0 ? (
        <EmptyState title={h.empty} hint={h.emptyHint} action={readOnly ? undefined : <ButtonLink href="/app/new" variant="primary">{h.newIdea}</ButtonLink>} />
      ) : null}

      {weekTest ? (
        <Card tone="accent">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{h.weekTest}</p>
          <p className="mt-1 text-[15px] font-medium">{weekTest.title}</p>
          <p className="text-sm">{fill(h.testDue, { what: weekTest.test_what ?? "", date: fmtDate(weekTest.test_deadline, locale), pass: weekTest.test_pass ?? "" })}</p>
        </Card>
      ) : null}

      {live.length ? <Group title={h.sections.live} items={live} t={t} locale={locale} readOnly={readOnly} /> : null}
      {parked.length ? <Group title={h.sections.parked} items={parked} t={t} locale={locale} readOnly={readOnly} /> : null}
      {untriaged.length ? <Group title={h.sections.untriaged} items={untriaged} t={t} locale={locale} readOnly={readOnly} /> : null}
      {killed.length ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-muted underline-offset-4 hover:text-fg hover:underline">{fill(h.showKilled, { n: killed.length })}</summary>
          <div className="mt-3"><Group title={h.sections.killed} items={killed} t={t} locale={locale} readOnly={readOnly} /></div>
        </details>
      ) : null}
    </div>
  );
}

function Group({ title, items, t, locale, readOnly }: { title: string; items: VentureCard[]; t: Dict; locale: string; readOnly: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((v) => <li key={v.account_id}><VentureRowCard v={v} t={t} locale={locale} readOnly={readOnly} /></li>)}
      </ul>
    </section>
  );
}

export function VentureRowCard({ v, t, locale, readOnly }: { v: VentureCard; t: Dict; locale: string; readOnly: boolean }) {
  const inner = (
    <Card className="transition-colors hover:border-border-strong">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
        <span className="min-w-0 flex-1">{v.title}</span>
        <Badge tone={STATE_TONE[v.state]}>{t.states[v.state]}</Badge>
        {v.has_hours ? <Badge tone="accent">{t.states.hasHours}</Badge> : null}
      </p>
      <p className="mt-1 text-sm text-muted">
        {v.total != null ? `${v.total} / 25` : v.killed_at_gate ? fill(t.card.gateKilled, { n: v.killed_at_gate }) : "—"}
        {v.stage != null ? ` · ${fill(t.card.stage, { n: v.stage })}` : ""}
        {v.state_since ? ` · ${fill(t.card.since, { date: fmtDate(v.state_since, locale) })}` : ""}
      </p>
      {v.state === "live" && v.test_what ? (
        <p className="mt-1.5 text-sm">{fill(t.home.testDue, { what: v.test_what, date: fmtDate(v.test_deadline, locale), pass: v.test_pass ?? "" })}</p>
      ) : null}
      {v.state === "parked" && v.revival_trigger ? (
        <p className="mt-1.5 text-sm">{fill(t.home.trigger, { trigger: v.revival_trigger, number: v.revival_number ?? "", date: fmtDate(v.revival_deadline, locale) })}</p>
      ) : null}
      {v.state === "killed" && v.state_reason ? <p className="mt-1.5 text-sm text-muted">{v.state_reason}</p> : null}
      {v.to_confirm ? <p className="mt-1.5 text-xs text-warn">{t.card.toConfirm}</p> : null}
    </Card>
  );
  return readOnly ? inner : <Link href={`/app/v/${v.account_id}`} className="block">{inner}</Link>;
}
