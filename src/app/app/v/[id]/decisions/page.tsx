import { Card, EmptyState } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { getDict } from "@/i18n";
import { fmtDate } from "@/lib/ventures";
import { loadDecisions } from "@/lib/workspace";
import { loadWorkspace } from "../workspace";
import { DecisionForm } from "../forms";
import { ScreenHead, WorkspaceOff } from "../off";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).workspace.decisions.metaTitle };
}

/** Decisions (HANDOFF §5.2): append-only; add one with date, decision, reason, what it replaces. */
export default async function DecisionsPage({ params }: PageProps<"/app/v/[id]/decisions">) {
  const { id } = await params;
  const { v, t, locale, on, supabase } = await loadWorkspace(id, `/app/v/${id}/decisions`);
  const w = t.workspace.decisions;
  if (!on) return <><ScreenHead v={v} t={t} title={w.title} /><WorkspaceOff t={t} id={id} /></>;
  const rows = await loadDecisions(supabase, id);
  return (
    <div className="flex flex-col gap-6">
      <ScreenHead v={v} t={t} title={w.title} subtitle={w.sub} />
      {rows.length === 0 ? <EmptyState title={w.empty} /> : (
        <ul className="divide-y divide-border">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-col gap-1 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{fmtDate(d.decided_on, locale)}</p>
              <p className="text-[15px] font-medium">{d.decision}</p>
              {d.reason ? <p className="text-sm text-muted">{d.reason}</p> : null}
              {d.replaces ? <p className="text-xs text-muted">{fill(w.replacesLine, { text: d.replaces })}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <Card className="flex flex-col gap-3">
        <p className="text-[15px] font-semibold">{w.add}</p>
        <DecisionForm account={id} w={w} today={new Date().toISOString().slice(0, 10)} />
      </Card>
    </div>
  );
}
