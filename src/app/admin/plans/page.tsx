import { Fragment } from "react";
import { createClient } from "@core/lib/supabase/server";
import { MatrixCell } from "./matrix-cell";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

type Plan = { id: string; key: string; name: string; is_public: boolean; sort_order: number };
type Feature = { id: string; key: string; name: string; kind: string; unit: string; default_value: unknown; modules: { key: string; name: string; sort_order: number } | null };
type PlanFeature = { plan_id: string; feature_id: string; value: unknown };
type Price = { plan_id: string; term_months: number; price_cents: number; currency: string; is_active: boolean };

/**
 * Plan × feature matrix with inline values (spec §6 "Modules & features").
 * Rows are features grouped by module, columns are plans; every cell saves
 * through admin_set_plan_feature() (validated + audited in SQL). Prices are
 * shown per term; editing them arrives with the billing build.
 */
export default async function AdminPlansPage() {
  const supabase = await createClient();
  const [{ data: plans }, { data: features }, { data: matrix }, { data: prices }] = await Promise.all([
    supabase.from("plans").select("id, key, name, is_public, sort_order").order("sort_order", { ascending: true }),
    supabase.from("features").select("id, key, name, kind, unit, default_value, modules ( key, name, sort_order )").eq("is_active", true),
    supabase.from("plan_features").select("plan_id, feature_id, value"),
    supabase.from("plan_prices").select("plan_id, term_months, price_cents, currency, is_active").eq("is_active", true).order("term_months", { ascending: true }),
  ]);
  const P = (plans ?? []) as Plan[];
  const F = ((features ?? []) as unknown as Feature[]).sort((a, b) =>
    (a.modules?.sort_order ?? 999) - (b.modules?.sort_order ?? 999) || a.key.localeCompare(b.key));
  const M = new Map<string, unknown>();
  for (const pf of (matrix ?? []) as PlanFeature[]) M.set(`${pf.plan_id}:${pf.feature_id}`, pf.value);
  const byModule = new Map<string, Feature[]>();
  for (const f of F) {
    const k = f.modules?.name ?? "Other";
    if (!byModule.has(k)) byModule.set(k, []);
    byModule.get(k)!.push(f);
  }
  const eur = (c: number) => `€${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

  return (
    <section>
      <h2 className="text-[15px] font-semibold">Plans & features</h2>
      <p className="mt-1 text-sm text-muted">Click a flag to toggle it; type a number and press Enter (−1 = unlimited). Every change is audited.</p>

      <div className="-mx-5 mt-4 overflow-x-auto px-5">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-bg py-2 pr-3 text-left font-medium">Feature</th>
              {P.map((p) => (
                <th key={p.id} className="px-2 py-2 text-center font-medium">
                  {p.name}
                  <span className="block text-xs font-normal text-muted">{p.key}{p.is_public ? "" : " · hidden"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byModule.entries()].map(([moduleName, feats]) => (
              <Fragment key={moduleName}>
                <tr>
                  <td colSpan={P.length + 1} className="pt-5 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">{moduleName}</td>
                </tr>
                {feats.map((f) => (
                  <tr key={f.id}>
                    <td className="sticky left-0 border-t border-border bg-bg py-2 pr-3">
                      <p>{f.name}</p>
                      <p className="text-xs text-muted">{f.key} · {f.kind}{f.unit !== "absolute" ? ` · ${f.unit.replace("_", " ")}` : ""}</p>
                    </td>
                    {P.map((p) => (
                      <td key={p.id} className="border-t border-border px-2 py-2 align-middle">
                        <MatrixCell plan={p.key} feature={f.key} kind={f.kind} value={M.get(`${p.id}:${f.id}`) ?? f.default_value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr>
              <td colSpan={P.length + 1} className="pt-7 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Prices per term (EUR)</td>
            </tr>
            {[1, 12, 24, 36].map((term) => (
              <tr key={term}>
                <td className="sticky left-0 border-t border-border bg-bg py-2 pr-3">{term === 1 ? "Monthly" : `${term} months`}</td>
                {P.map((p) => {
                  const pr = ((prices ?? []) as Price[]).find((x) => x.plan_id === p.id && x.term_months === term);
                  return (
                    <td key={p.id} className="border-t border-border px-2 py-2 text-center tabular-nums text-muted">
                      {pr ? `${eur(pr.price_cents)}${term > 1 ? ` (${eur(Math.round(pr.price_cents / term))}/mo)` : ""}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-faint">Multi-year prices are the suggested values from spec §10.1 until decided; price editing lands with billing (Week 5–6).</p>
    </section>
  );
}

