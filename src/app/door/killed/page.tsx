import { redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { killedAt, readDoor } from "@/lib/door-cookie";
import { DoorFrame } from "../frame";
import { KilledScreen } from "../screens";
import { startOverAction } from "../actions";

export const dynamic = "force-dynamic";

/** The kill screen: the gate, the person's line, and that a kill in thirty seconds is a good outcome. */
export default async function KilledPage() {
  const [t, s] = await Promise.all([getDict(), readDoor()]);
  const n = s ? killedAt(s) : null;
  if (!s || n === null) redirect("/door");
  const g = t.door.gates.items[n - 1];
  return (
    <DoorFrame phase={4} title={t.door.verdict.title} backHref={`/door/gate/${n}`} t={t}>
      <KilledScreen n={n} question={g.q} why={g.why} note={s.notes[n - 1]} t={t.door} recordHref="/door/verdict" againAction={startOverAction} />
    </DoorFrame>
  );
}
