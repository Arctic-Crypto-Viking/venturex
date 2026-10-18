import { Badge, Card, EmptyState, Notice, PageHeader } from "@core/components/ui";
import type { VentureRow } from "@/app/admin/_product/account-panel";
import { en, type Dict } from "@/i18n/en";

/**
 * The owner's home, "My ventures": the same view the superadmin sees read-only
 * through View as. In B1 there is no venture yet; B2 fills it with the cards
 * by state, the cap line and the week's test (HANDOFF §6).
 */
export function HomeView({ accountName, venture, readOnly = false, t = en }: {
  accountName: string; venture: VentureRow | null; readOnly?: boolean; t?: Dict;
}) {
  return (
    <div className="flex flex-col gap-6">
      {readOnly ? <Notice tone="accent">{t.home.readOnly}: {accountName}</Notice> : null}
      <PageHeader title={t.home.title} />
      {venture ? (
        <Card>
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
            {venture.title ?? accountName}
            {venture.state ? <Badge>{venture.state}</Badge> : null}
          </p>
          <p className="text-sm text-muted">{venture.score != null ? `${venture.score} / 25` : "—"}</p>
        </Card>
      ) : (
        <EmptyState title={t.home.empty} hint={`${t.home.emptyHint} ${t.home.doorSoon}`} />
      )}
    </div>
  );
}
