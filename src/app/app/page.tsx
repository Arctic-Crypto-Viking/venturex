import { getCurrentAccount } from "@core/lib/auth";
import { getDict } from "@/i18n";
import { HomeView } from "./home-view";

export const dynamic = "force-dynamic"; // per-user data, never prerendered

/** My ventures. Until B2 a person has no venture: the empty state says the door is next. */
export default async function AppHome() {
  const [account, t] = await Promise.all([getCurrentAccount(), getDict()]);
  return <HomeView accountName={account?.name ?? ""} venture={null} t={t} />;
}
