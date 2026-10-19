import { redirect } from "next/navigation";
import { getCurrentUser } from "@core/lib/auth";
import { createClient } from "@core/lib/supabase/server";
import { getDict } from "@/i18n";
import { computeVerdict, thresholdNote, weakest } from "@/lib/door";
import { readDoor } from "@/lib/door-cookie";
import { DoorFrame } from "../frame";
import { VerdictScreen, type VerdictView } from "../screens";
import { commitVerdictAction } from "../actions";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getDict()).door.metaTitle };
}

/**
 * Screen 4 · the verdict (HANDOFF §4.2): GO, PARKED or KILLED with the total,
 * where it is weak, what one point changes, and the form that makes it
 * saveable — this week's test for a GO, the revival trigger for PARKED, the
 * changed fact for a re-score of a killed venture, the card's fields.
 */
export default async function VerdictPage() {
  const [t, s] = await Promise.all([getDict(), readDoor()]);
  if (!s) redirect("/door");
  let result;
  try {
    result = computeVerdict({ gates: s.gates, scores: s.scores, demand_evidence: Boolean(s.evidence?.claim?.trim()) });
  } catch {
    redirect("/door");
  }

  // signed in? (null when the database is not reachable: the button then says "Save" and the action decides)
  let signedIn: boolean | null = null;
  let rescoreOf: VerdictView["rescoreOf"];
  try {
    const user = await getCurrentUser();
    signedIn = Boolean(user);
    if (user && s.rescore) {
      const supabase = await createClient();
      const { data: v } = await supabase.from("ventures").select("title, state").eq("account_id", s.rescore).maybeSingle();
      if (v) rescoreOf = { title: v.title as string, killed: v.state === "killed" };
    }
  } catch {
    signedIn = null;
  }

  const view: VerdictView = {
    result,
    title: s.intake.title ?? "",
    gateNotes: s.notes,
    gateQuestions: t.door.gates.items.map((g) => g.q),
    weakest: result.scores ? weakest(result.scores) : [],
    threshold: result.total !== null ? thresholdNote(result.total) : { nextThreshold: null, short: 0, atTheBar: false },
    rescoreOf,
    signedIn,
    defaults: { test: s.test, revival: s.revival, card: s.card, fact_changed: s.fact_changed },
  };
  const back = result.killed_at_gate ? "/door/killed" : "/door/score/5";
  return (
    <DoorFrame phase={4} title={t.door.verdict.title} backHref={back} t={t}>
      <VerdictScreen v={view} action={commitVerdictAction} t={t.door} verdictNames={t.verdicts} startOverHref="/door/start" />
    </DoorFrame>
  );
}
