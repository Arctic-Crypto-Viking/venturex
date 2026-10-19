import { redirect } from "next/navigation";
import { intakeComplete, killedAt, nextGate, readDoor } from "@/lib/door-cookie";
import { DIMENSIONS } from "@/lib/door";

export const dynamic = "force-dynamic"; // reads the run cookie

/** /door resumes the run in progress at its next screen, or starts at line 1. */
export default async function DoorIndex() {
  const s = await readDoor();
  if (!s) redirect("/door/intake/1");
  if (!s.rescore && !intakeComplete(s)) {
    const i = (["title", "customer", "uses_today", "ship_in_30_days", "unfair_reach"] as const).findIndex((f) => !(s.intake[f] ?? "").trim());
    redirect(`/door/intake/${i + 1}`);
  }
  if (killedAt(s) !== null) redirect("/door/killed");
  const g = nextGate(s);
  if (g !== null) redirect(`/door/gate/${g}`);
  const d = DIMENSIONS.findIndex((x) => !s.scores[x]);
  if (d !== -1) redirect(`/door/score/${d + 1}`);
  redirect("/door/verdict");
}
