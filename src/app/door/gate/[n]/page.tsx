import { notFound, redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { GATE_COUNT } from "@/lib/door";
import { intakeComplete, killedAt, readDoor } from "@/lib/door-cookie";
import { DoorFrame } from "../../frame";
import { GateScreen } from "../../screens";
import { answerGateAction } from "../../actions";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).door.metaTitle };
}

/** Screen 2 · gate n of 5: one binary question, one line of evidence; a No ends the run. */
export default async function GatePage({ params }: PageProps<"/door/gate/[n]">) {
  const n = Number.parseInt((await params).n, 10);
  if (!(n >= 1 && n <= GATE_COUNT)) notFound();
  const [t, s] = await Promise.all([getDict(), readDoor()]);
  if (!s || (!s.rescore && !intakeComplete(s))) redirect("/door");
  const k = killedAt(s);
  if (k !== null && k < n) redirect("/door/killed");
  // every earlier gate must be a Yes
  for (let i = 0; i < n - 1; i++) if (s.gates[i] !== true) redirect(`/door/gate/${i + 1}`);
  const g = t.door.gates.items[n - 1];
  return (
    <DoorFrame phase={2} step={n} total={GATE_COUNT} title={t.door.gates.title} sub={t.door.gates.sub} backHref={n > 1 ? `/door/gate/${n - 1}` : s.rescore ? "/app" : "/door/intake/5"} t={t}>
      <GateScreen n={n} question={g.q} kills={g.kills} defaultAnswer={s.gates[n - 1]} defaultNote={s.notes[n - 1]} action={answerGateAction} t={t.door} ideaTitle={s.intake.title ?? ""} nextLabel={t.common.next} />
    </DoorFrame>
  );
}
