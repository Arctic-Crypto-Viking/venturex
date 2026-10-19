import { notFound, redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { INTAKE_FIELDS } from "@/lib/door";
import { emptyDoor, readDoor } from "@/lib/door-cookie";
import { DoorFrame } from "../../frame";
import { IntakeScreen } from "../../screens";
import { saveIntakeAction } from "../../actions";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).door.metaTitle };
}

/** Screen 1 · line n of 5 (HANDOFF §4.1): one line per screen. */
export default async function IntakePage({ params }: PageProps<"/door/intake/[n]">) {
  const n = Number.parseInt((await params).n, 10);
  if (!(n >= 1 && n <= INTAKE_FIELDS.length)) notFound();
  const [t, s] = await Promise.all([getDict(), readDoor()]);
  const state = s ?? emptyDoor();
  if (state.rescore) redirect("/door/gate/1"); // a re-score keeps the record's five lines
  // no skipping ahead: the first empty line is the one to answer
  const firstEmpty = INTAKE_FIELDS.findIndex((f) => !(state.intake[f] ?? "").trim());
  if (firstEmpty !== -1 && n > firstEmpty + 1) redirect(`/door/intake/${firstEmpty + 1}`);
  const field = INTAKE_FIELDS[n - 1];
  const words = t.door.intake.fields[field];
  return (
    <DoorFrame phase={1} step={n} total={INTAKE_FIELDS.length} title={t.door.intake.title} sub={t.door.intake.sub} backHref={n > 1 ? `/door/intake/${n - 1}` : "/"} t={t}>
      <IntakeScreen n={n} label={words.label} placeholder={words.placeholder} defaultValue={state.intake[field]} action={saveIntakeAction} t={t.door} last={n === INTAKE_FIELDS.length} nextLabel={t.common.next} />
    </DoorFrame>
  );
}
