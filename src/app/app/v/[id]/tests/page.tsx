import { getDict } from "@/i18n";
import { loadMyVentures } from "@/lib/ventures";
import { loadTests } from "@/lib/workspace";
import { loadWorkspace } from "../workspace";
import { TestsView } from "./view";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).workspace.tests.metaTitle };
}

/** /app/v/[id]/tests: load through RLS, find the owner's other venture holding the week (set_week_test refuses unless it is named), render TestsView. */
export default async function TestsPage({ params }: PageProps<"/app/v/[id]/tests">) {
  const { id } = await params;
  const { v, t, locale, on, supabase } = await loadWorkspace(id, `/app/v/${id}/tests`);
  const [tests, mine] = on ? await Promise.all([loadTests(supabase, id), loadMyVentures(supabase)]) : [[], []];
  const elsewhere = mine.find((x) => x.account_id !== id && x.owner_user_id === v.owner_user_id && x.is_week_test && x.test_what);
  const weekElsewhere = elsewhere ? { account_id: elsewhere.account_id, title: elsewhere.title } : null;
  return <TestsView id={id} v={v} t={t} locale={locale} on={on} tests={tests} weekElsewhere={weekElsewhere} />;
}
