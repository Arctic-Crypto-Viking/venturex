import { notFound, redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { DIMENSIONS } from "@/lib/door";
import { killedAt, nextGate, readDoor } from "@/lib/door-cookie";
import { DoorFrame } from "../../frame";
import { ScoreScreen } from "../../screens";
import { saveScoreAction } from "../../actions";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).door.metaTitle };
}

/** Screen 3 · dimension n of 5: the five anchors as choices; demand asks for its evidence from level 3. */
export default async function ScorePage({ params }: PageProps<"/door/score/[n]">) {
  const n = Number.parseInt((await params).n, 10);
  if (!(n >= 1 && n <= DIMENSIONS.length)) notFound();
  const [t, s] = await Promise.all([getDict(), readDoor()]);
  if (!s) redirect("/door");
  if (killedAt(s) !== null) redirect("/door/killed");
  if (nextGate(s) !== null) redirect("/door");
  for (let i = 0; i < n - 1; i++) if (!s.scores[DIMENSIONS[i]]) redirect(`/door/score/${i + 1}`);
  const dim = DIMENSIONS[n - 1];
  const soFar = DIMENSIONS.slice(0, n - 1).reduce((acc, d) => ({ total: acc.total + (s.scores[d] ?? 0), count: acc.count + 1 }), { total: 0, count: 0 });
  return (
    <DoorFrame phase={3} step={n} total={DIMENSIONS.length} title={t.door.score.title} sub={t.door.score.sub} backHref={n > 1 ? `/door/score/${n - 1}` : "/door/gate/5"} t={t}>
      <ScoreScreen n={n} dim={dim} words={t.door.score.dims[dim]} defaultLevel={s.scores[dim]} defaultEvidence={s.evidence} action={saveScoreAction} t={t.door} ideaTitle={s.intake.title ?? ""} soFar={soFar} nextLabel={t.common.next} />
    </DoorFrame>
  );
}
