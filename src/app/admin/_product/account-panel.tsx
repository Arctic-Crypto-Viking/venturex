import type { AccountDetail } from "@core/app/admin/accounts/[id]/detail";
import { Badge, Card } from "@core/components/ui";

/**
 * The venture keys app.admin_account_extra() adds to the core shape
 * (supabase/migrations/…006_reference_data.sql defines the hook; B2 fills it
 * from `ventures` and the latest door run). Until B2 the hook returns no venture.
 */
export type VentureRow = {
  title: string | null; state: string | null; state_basis: string | null; state_since: string | null;
  score: number | null; stage: number | null; has_hours: boolean | null; test_deadline: string | null;
};
export function ventureOf(detail: AccountDetail): VentureRow | null {
  const v = detail.venture as VentureRow | null | undefined;
  return v && typeof v === "object" ? v : null;
}

const STATE_TONE: Record<string, "neutral" | "accent" | "success" | "warn" | "danger"> = {
  live: "success", parked: "warn", killed: "neutral", untriaged: "neutral",
};

/** One account's venture, on the core admin account page (product.admin.AccountPanel). */
export function AccountPanel({ detail }: { detail: AccountDetail }) {
  const v = ventureOf(detail);
  return (
    <Card>
      <h3 className="mb-2 text-sm font-semibold">Venture</h3>
      {v ? (
        <div className="flex flex-col gap-1 text-[15px]">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {v.title ?? detail.account.name}
            {v.state ? <Badge tone={STATE_TONE[v.state] ?? "neutral"}>{v.state}{v.state_basis ? ` · ${v.state_basis}` : ""}</Badge> : null}
            {v.has_hours ? <Badge tone="accent">has the hours</Badge> : null}
          </p>
          <p className="text-sm text-muted">
            {v.score != null ? `${v.score} / 25` : "not scored"}
            {v.stage != null ? ` · stage ${v.stage}` : ""}
            {v.state_since ? ` · since ${v.state_since}` : ""}
            {v.test_deadline ? ` · test due ${v.test_deadline}` : " · no test set"}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">No venture recorded for this account yet (the door comes with B2).</p>
      )}
    </Card>
  );
}
