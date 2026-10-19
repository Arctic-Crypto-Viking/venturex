import type { AccountDetail } from "@core/app/admin/accounts/[id]/detail";
import { createAdminClient } from "@core/lib/supabase/admin";
import { getLocale } from "@core/lib/i18n";
import { getDict } from "@/i18n";
import { HomeView } from "@/app/app/home-view";
import { loadVenture } from "@/lib/ventures";

/**
 * product.admin.ViewAs: the owner's home, from the same HomeView the owner
 * sees, read-only. Core has already checked the open view-as session and
 * audited it; the row is read with the service client because the superadmin
 * is not a member of the account.
 */
export async function ViewAs({ detail: x }: {
  detail: AccountDetail; sessionId: string; searchParams: Record<string, string | string[] | undefined>;
}) {
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const v = await loadVenture(createAdminClient(), x.account.id);
  const ventures = v ? [v] : [];
  return (
    <div className="mx-auto max-w-3xl">
      <HomeView
        ventures={ventures}
        cap={{ live: ventures.filter((z) => z.state === "live").length, hours: ventures.find((z) => z.has_hours) ?? null, saved: ventures.length }}
        savedMax={Number((x.entitlements as Record<string, unknown>)["venture.ventures_max"] ?? 3)}
        readOnly
        accountName={x.account.name}
        t={t}
        locale={locale}
      />
    </div>
  );
}
