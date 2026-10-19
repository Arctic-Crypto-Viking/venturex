import { getDict } from "@/i18n";
import { loadStages } from "@/lib/workspace";
import { loadWorkspace } from "../workspace";
import { StagesView } from "./view";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).workspace.stages.metaTitle };
}

/** /app/v/[id]/stages: load through RLS, render StagesView. */
export default async function StagesPage({ params }: PageProps<"/app/v/[id]/stages">) {
  const { id } = await params;
  const { v, t, locale, on, supabase } = await loadWorkspace(id, `/app/v/${id}/stages`);
  const { progress, history } = on ? await loadStages(supabase, id) : { progress: [], history: [] };
  return <StagesView id={id} v={v} t={t} locale={locale} on={on} progress={progress} history={history} />;
}
