import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentAccount, getCurrentUser } from "@core/lib/auth";
import { featureValue, getEntitlements } from "@core/lib/entitlements";
import { getLocale } from "@core/lib/i18n";
import { getDict } from "@/i18n";
import { capOf, loadMyVentures } from "@/lib/ventures";
import { HomeView } from "./home-view";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

/** My ventures: every venture the person belongs to, by state; the cap line from the ones they own. */
export default async function AppHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app");
  const supabase = await createClient();
  // an invited person's first visit makes the membership active (migration 010); until then they see nothing
  await supabase.rpc("accept_invites");
  const [ventures, t, locale, account] = await Promise.all([loadMyVentures(supabase), getDict(), getLocale(), getCurrentAccount()]);
  const cap = capOf(ventures, user.id);
  // the saved-ventures limit comes from the owner's newest account's plan (create_venture carries it over)
  let savedMax = 3;
  if (account) {
    const ent = await getEntitlements(supabase, account.id);
    savedMax = featureValue(ent, "venture.ventures_max");
  }
  return <HomeView ventures={ventures} cap={cap} savedMax={savedMax} t={t} locale={locale} />;
}
