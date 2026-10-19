import Link from "next/link";
import { createClient } from "@core/lib/supabase/server";
import { Badge, Notice } from "@core/components/ui";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

type Row = {
  account_id: string; title: string; slug: string; owner_email: string | null; owner_user_id: string;
  state: string; state_basis: string | null; state_since: string | null; score: number | null; verdict: string | null;
  stage: number | null; stage_since: string | null; weeks_at_stage: number | null; stalled: boolean; has_hours: boolean;
  test_what: string | null; test_deadline: string | null; test_pass: number | null; is_week_test: boolean | null;
  owner_live: number; owner_saved: number; members: number; plan_key: string | null; updated_at: string;
};
const TONE: Record<string, "neutral" | "accent" | "success" | "warn" | "danger"> = { live: "success", parked: "warn", killed: "neutral", untriaged: "neutral" };

/**
 * /admin/ventures (HANDOFF §6, B3): every venture across accounts by state,
 * stalled first (more than four weeks at one stage), with the cap per owner.
 * Reads through admin_list_ventures(), which re-checks the superadmin in SQL.
 * Admin is English only, like the core console.
 */
export default async function AdminVenturesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_ventures");
  const rows = (data ?? []) as Row[];
  const groups: Array<[string, Row[]]> = [
    ["Stalled", rows.filter((r) => r.stalled)],
    ["Live", rows.filter((r) => r.state === "live" && !r.stalled)],
    ["Parked", rows.filter((r) => r.state === "parked")],
    ["Not yet scored", rows.filter((r) => r.state === "untriaged")],
    ["Killed", rows.filter((r) => r.state === "killed")],
  ];
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Ventures</h2>
        <p className="text-sm text-muted">{rows.length} across every account · stalled = more than four weeks at one stage</p>
      </div>
      {error ? <Notice tone="danger">{error.message}</Notice> : null}
      {groups.map(([title, items]) => items.length ? (
        <div key={title} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title} · {items.length}</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {items.map((r) => (
              <li key={r.account_id}>
                <Link href={`/admin/accounts/${r.account_id}`} className="grid grid-cols-1 gap-1 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                      <span className="truncate">{r.title}</span>
                      <Badge tone={TONE[r.state] ?? "neutral"}>{r.state}{r.state_basis ? ` · ${r.state_basis}` : ""}</Badge>
                      {r.has_hours ? <Badge tone="accent">has the hours</Badge> : null}
                      {r.stalled ? <Badge tone="danger">stalled</Badge> : null}
                    </p>
                    <p className="text-sm text-muted">
                      {r.owner_email ?? "—"} · {r.plan_key ?? "—"}
                      {r.score != null ? ` · ${r.score}/25` : ""}
                      {r.stage != null ? ` · stage ${r.stage}${r.weeks_at_stage != null ? ` (${r.weeks_at_stage} w)` : ""}` : ""}
                      {r.members ? ` · ${r.members} invited` : ""}
                    </p>
                    {r.test_what ? <p className="text-sm">{r.is_week_test ? "Week's test: " : "Test: "}{r.test_what} — by {r.test_deadline} · passes at {r.test_pass}</p> : null}
                  </div>
                  <div className="text-sm text-muted sm:text-right">
                    <p>owner: {r.owner_live} of 3 live · {r.owner_saved} saved</p>
                    {r.state_since ? <p>since {r.state_since}</p> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null)}
      {!error && rows.length === 0 ? <p className="text-sm text-muted">No ventures yet.</p> : null}
    </section>
  );
}
