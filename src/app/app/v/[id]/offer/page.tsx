import { Card } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { getDict } from "@/i18n";
import { fmtDate } from "@/lib/ventures";
import { loadOffer } from "@/lib/workspace";
import { loadWorkspace } from "../workspace";
import { OfferForm } from "../forms";
import { ScreenHead, WorkspaceOff } from "../off";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).workspace.offer.metaTitle };
}

/** The one-page offer (HANDOFF §4.3 stage 4, §5.2 offers): one row per venture, edited in place. */
export default async function OfferPage({ params }: PageProps<"/app/v/[id]/offer">) {
  const { id } = await params;
  const { v, t, locale, on, supabase } = await loadWorkspace(id, `/app/v/${id}/offer`);
  const w = t.workspace.offer;
  if (!on) return <><ScreenHead v={v} t={t} title={w.title} /><WorkspaceOff t={t} id={id} /></>;
  const offer = await loadOffer(supabase, id);
  return (
    <div className="flex flex-col gap-6">
      <ScreenHead v={v} t={t} title={w.title} subtitle={w.sub} />
      <Card>
        <OfferForm account={id} offer={offer} w={w} savedLine={offer ? fill(w.saved, { date: fmtDate(offer.updated_at, locale) }) : null} />
      </Card>
    </div>
  );
}
