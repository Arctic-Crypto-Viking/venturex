import type { AccountDetail } from "@core/app/admin/accounts/[id]/detail";
import { HomeView } from "@/app/app/home-view";
import { ventureOf } from "./account-panel";

/**
 * product.admin.ViewAs: the owner's home, from the same HomeView the owner
 * sees, read-only. Core has already checked the open view-as session.
 */
export async function ViewAs({ detail: x }: {
  detail: AccountDetail; sessionId: string; searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <HomeView accountName={x.account.name} venture={ventureOf(x)} readOnly />
    </div>
  );
}
