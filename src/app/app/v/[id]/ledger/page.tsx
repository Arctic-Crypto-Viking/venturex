import { Badge, Card, EmptyState } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { getDict, type Dict } from "@/i18n";
import { fmtDate } from "@/lib/ventures";
import { loadLedger, type EvidenceRow } from "@/lib/workspace";
import { loadWorkspace } from "../workspace";
import { AddEvidenceForm, KillEvidenceForm, PromoteForm } from "../forms";
import { ScreenHead, WorkspaceOff } from "../off";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).workspace.ledger.metaTitle };
}

/** The assumption ledger (HANDOFF §5.2): open by risk, facts with source and date, promoted, killed; promote with a source. */
export default async function LedgerPage({ params }: PageProps<"/app/v/[id]/ledger">) {
  const { id } = await params;
  const { v, t, locale, on, supabase } = await loadWorkspace(id, `/app/v/${id}/ledger`);
  const w = t.workspace.ledger;
  if (!on) return <><ScreenHead v={v} t={t} title={w.title} /><WorkspaceOff t={t} id={id} /></>;
  const rows = await loadLedger(supabase, id);
  const open = rows.filter((r) => r.status === "open" && r.kind === "assumption");
  const facts = rows.filter((r) => r.kind === "fact" && r.status !== "killed");
  const promoted = rows.filter((r) => r.status === "promoted");
  const killed = rows.filter((r) => r.status === "killed" || r.kind === "killed");
  const date = (d: string | null | undefined) => fmtDate(d, locale);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHead v={v} t={t} title={w.title} subtitle={w.sub} />
      {rows.length === 0 ? <EmptyState title={w.empty} /> : null}
      <Group title={w.sections.open} items={open} actions id={id} w={w} date={date} />
      <Group title={w.sections.facts} items={facts} id={id} w={w} date={date} />
      <Group title={w.sections.promoted} items={promoted} id={id} w={w} date={date} />
      <Group title={w.sections.killed} items={killed} id={id} w={w} date={date} />
      <Card className="flex flex-col gap-3">
        <p className="text-[15px] font-semibold">{w.add}</p>
        <AddEvidenceForm account={id} w={w} />
      </Card>
    </div>
  );
}

type W = Dict["workspace"]["ledger"];
type Fmt = (d: string | null | undefined) => string;

function Row({ r, actions, id, w, date }: { r: EvidenceRow; actions?: boolean; id: string; w: W; date: Fmt }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone={r.kind === "fact" ? "success" : r.status === "killed" ? "danger" : "neutral"}>{r.kind === "fact" ? w.fact : r.status === "killed" ? w.killed : w.assumption}</Badge>
        {r.risk != null && r.kind !== "fact" ? <span className="font-mono text-xs text-muted">{fill(w.risk, { n: r.risk })}</span> : null}
        {r.promoted_from ? <span className="text-xs text-muted">{w.promotedFrom}</span> : null}
      </p>
      <p className="text-[15px]">{r.claim}</p>
      {r.source ? <p className="text-sm text-muted">{fill(w.sourceLine, { source: r.source, date: date(r.source_date) })}</p> : null}
      {actions ? (
        <div className="flex flex-wrap items-start gap-2">
          <PromoteForm account={id} row={r} w={w} />
          <KillEvidenceForm account={id} row={r} w={w} />
        </div>
      ) : null}
    </li>
  );
}

function Group({ title, items, actions, id, w, date }: { title: string; items: EvidenceRow[]; actions?: boolean; id: string; w: W; date: Fmt }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
      <ul className="divide-y divide-border">{items.map((r) => <Row key={r.id} r={r} actions={actions} id={id} w={w} date={date} />)}</ul>
    </section>
  );
}
