import Link from "next/link";
import { createClient } from "@core/lib/supabase/server";
import { Card, Notice, Section } from "@core/components/ui";
import { product } from "@product";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

type Overview = {
  mrr_cents: number;
  active_accounts: number;
  paying_accounts: number;
  signups_7d: number;
  signups_30d: number;
  invoices_overdue: number;
  generated_at: string;
} & Record<string, unknown>; // + the fields app.overview_extra() adds

/** Admin overview (spec §6, first row). Calls public.internal_overview() as the superadmin user. */
export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const [{ data, error }, { count: awaiting }] = await Promise.all([
    supabase.rpc("internal_overview"),
    supabase.from("feedback_board").select("id", { count: "exact", head: true }).eq("awaiting_review", true),
  ]);
  if (error) {
    return <Notice tone="danger">Overview unavailable: {error.message}</Notice>;
  }
  const o = data as Overview;
  const tiles: Array<[string, string | number]> = [
    ["MRR", `€${(o.mrr_cents / 100).toFixed(0)}`],
    ["Active accounts", o.active_accounts],
    ["Paying accounts", o.paying_accounts],
    ["Signups · 7d / 30d", `${o.signups_7d} / ${o.signups_30d}`],
    ["Invoices overdue", o.invoices_overdue],
    ...(product.admin.overviewTiles?.(o) ?? []),
  ];
  return (
    <Section title="Overview">
      {awaiting ? (
        <Notice tone="accent">
          {awaiting} {awaiting === 1 ? "suggestion is" : "suggestions are"} waiting for your go-ahead.{" "}
          <Link href="/admin/feedback" className="font-medium underline underline-offset-4">Open Feedback</Link>
        </Notice>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-faint">
        Internal account excluded from every figure · generated {new Date(o.generated_at).toLocaleString("en-GB")}
      </p>
    </Section>
  );
}
