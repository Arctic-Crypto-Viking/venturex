"use server";

import { redirect } from "next/navigation";
import { createClient } from "@core/lib/supabase/server";
import { getCurrentUser } from "@core/lib/auth";
import { getLocale } from "@core/lib/i18n";
import { fill } from "@core/lib/i18n-shared";
import { getDict } from "@/i18n";
import {
  DEMAND_EVIDENCE_FROM, DIMENSIONS, GATE_COUNT, INTAKE_FIELDS, computeVerdict, doorErrorCode, isLazyTrigger,
  type Dimension, type IntakeField,
} from "@/lib/door";
import { clearDoor, emptyDoor, intakeComplete, killedAt, readDoor, runPayload, writeDoor, type DoorState } from "@/lib/door-cookie";

/**
 * One action per door screen (HANDOFF §6; the Mainfloor wizard idiom). Every
 * action reads the run from the cookie, validates the one answer it owns,
 * writes the cookie back and redirects to the next screen. Nothing touches the
 * database until saveAction(), which calls create_venture() (a new venture) or
 * record_door_run() (a re-score) and lets SQL enforce the rules.
 */
export type ActionState = { error?: string } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const intOrNull = (fd: FormData, k: string): number | null | "bad" => {
  const s = str(fd, k);
  if (!s) return null;
  if (!/^-?\d{1,9}$/.test(s)) return "bad";
  return Number.parseInt(s, 10);
};
const dateOrNull = (fd: FormData, k: string): string | null | "bad" => {
  const s = str(fd, k);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return "bad";
  return s;
};

async function current(): Promise<DoorState> {
  return (await readDoor()) ?? emptyDoor();
}

// ---------------------------------------------------------------- intake 1–5

export async function saveIntakeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getDict();
  const n = Number.parseInt(str(fd, "n"), 10);
  if (!(n >= 1 && n <= INTAKE_FIELDS.length)) redirect("/door/intake/1");
  const field: IntakeField = INTAKE_FIELDS[n - 1];
  const value = str(fd, "value");
  if (!value) return { error: t.door.intake.required };
  // the /new-venture command's push-back: "people who like X" is not a customer (§4.1)
  if (field === "customer" && /^(people|anyone|everyone|folks|users)\s+who\s+(like|love|enjoy|want)/i.test(value) && str(fd, "confirmed") !== "1") {
    return { error: t.door.intake.customerPushback };
  }
  const s = await current();
  s.intake[field] = value;
  await writeDoor(s);
  redirect(n < INTAKE_FIELDS.length ? `/door/intake/${n + 1}` : "/door/gate/1");
}

// ---------------------------------------------------------------- gates 1–5

export async function answerGateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getDict();
  const n = Number.parseInt(str(fd, "n"), 10);
  if (!(n >= 1 && n <= GATE_COUNT)) redirect("/door/gate/1");
  const answer = str(fd, "answer");
  if (answer !== "yes" && answer !== "no") return { error: t.door.gates.answerFirst };
  const s = await current();
  if (!intakeComplete(s) && !s.rescore) redirect("/door/intake/1");
  s.gates[n - 1] = answer === "yes";
  s.notes[n - 1] = str(fd, "note");
  // answers after a No are void; a changed earlier answer voids the later ones too
  for (let i = n; i < GATE_COUNT; i++) {
    if (answer === "no" || s.gates[n - 1] !== true) { s.gates[i] = null; s.notes[i] = ""; }
  }
  await writeDoor(s);
  if (answer === "no") redirect("/door/killed");
  redirect(n < GATE_COUNT ? `/door/gate/${n + 1}` : "/door/score/1");
}

// ---------------------------------------------------------------- scores 1–5

export async function saveScoreAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getDict();
  const n = Number.parseInt(str(fd, "n"), 10);
  if (!(n >= 1 && n <= DIMENSIONS.length)) redirect("/door/score/1");
  const dim: Dimension = DIMENSIONS[n - 1];
  const level = Number.parseInt(str(fd, "level"), 10);
  if (!(level >= 1 && level <= 5)) return { error: t.door.score.pickOne };
  const s = await current();
  if (killedAt(s) !== null || s.gates.some((g) => g !== true)) redirect("/door/gate/1");
  s.scores[dim] = level;
  if (dim === "demand") {
    const claim = str(fd, "claim");
    s.evidence = level >= DEMAND_EVIDENCE_FROM && claim ? { claim, source: str(fd, "source"), source_date: str(fd, "source_date") } : undefined;
  }
  await writeDoor(s);
  redirect(n < DIMENSIONS.length ? `/door/score/${n + 1}` : "/door/verdict");
}

// ---------------------------------------------------------------- verdict → save

/**
 * The verdict screen's form: the week's test (GO), the revival trigger (PARKED),
 * the changed fact (a re-score of a KILLED venture), the card's fields. Stored
 * in the cookie, then saved — or, signed out, the person goes to sign in and
 * lands on /door/save, one button.
 */
export async function commitVerdictAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getDict();
  const s = await current();
  let verdict;
  try {
    verdict = computeVerdict({ gates: s.gates, scores: s.scores, demand_evidence: Boolean(s.evidence?.claim) });
  } catch {
    redirect("/door/gate/1");
  }

  if (verdict.verdict === "go") {
    const what = str(fd, "test_what");
    const deadline = dateOrNull(fd, "test_deadline");
    const pass = intOrNull(fd, "test_pass");
    const fail = intOrNull(fd, "test_fail");
    const cost = intOrNull(fd, "test_cost");
    if (!what || deadline === null || pass === null || fail === null) return { error: t.door.errors["door.go_needs_test"] };
    if (deadline === "bad") return { error: t.door.errors.dateInvalid };
    if (pass === "bad" || fail === "bad" || cost === "bad") return { error: t.door.errors.numberInvalid };
    if (pass <= fail) return { error: t.door.errors.passAboveFail };
    s.test = { what, deadline, pass_number: pass, fail_number: fail, cost_cents: cost === null ? 0 : cost * 100, currency: "EUR" };
    s.revival = undefined;
  } else if (verdict.verdict === "parked") {
    const trigger = str(fd, "revival_trigger");
    const number = intOrNull(fd, "revival_number");
    const deadline = dateOrNull(fd, "revival_deadline");
    if (!trigger || number === null || deadline === null || isLazyTrigger(trigger)) return { error: t.door.errors["door.parked_needs_trigger"] };
    if (deadline === "bad") return { error: t.door.errors.dateInvalid };
    if (number === "bad") return { error: t.door.errors.numberInvalid };
    s.revival = { trigger, number, deadline };
    s.test = undefined;
  } else {
    s.test = undefined;
    s.revival = undefined;
  }

  const card = {
    assets: str(fd, "card_assets"), channel_has: str(fd, "card_channel_has"), channel_needs: str(fd, "card_channel_needs"),
    calendar: str(fd, "card_calendar"), unblocker: str(fd, "card_unblocker"),
  };
  s.card = Object.values(card).some(Boolean) ? card : undefined;
  if (str(fd, "fact_changed")) s.fact_changed = str(fd, "fact_changed");
  await writeDoor(s);

  const user = await currentUserOrNull();
  if (!user) redirect("/login?next=/door/save");
  return save(s);
}

/** /door/save, after sign-in: the one button. */
export async function saveAction(): Promise<ActionState> {
  const s = await readDoor();
  if (!s) redirect("/door/start");
  const user = await currentUserOrNull();
  if (!user) redirect("/login?next=/door/save");
  return save(s);
}

async function save(s: DoorState): Promise<ActionState> {
  const t = await getDict();
  const supabase = await createClient();
  const payload = runPayload(s);
  let accountId: string;
  if (s.rescore) {
    const { error } = await supabase.rpc("record_door_run", { p_account: s.rescore, p_run: payload });
    if (error) return { error: friendly(error.message, t) };
    accountId = s.rescore;
  } else {
    const { data, error } = await supabase.rpc("create_venture", {
      p_intake: s.intake, p_run: payload, p_name: null, p_locale: await getLocale(),
    });
    if (error) return { error: friendly(error.message, t) };
    accountId = String(data);
  }
  await clearDoor();
  redirect(`/app/v/${accountId}`);
}

function friendly(message: string, t: Awaited<ReturnType<typeof getDict>>): string {
  const code = doorErrorCode(message);
  if (!code) return t.door.errors.generic;
  const text = t.door.errors[code];
  // the number a cap carries travels in the message's detail on PostgREST ("… (3)") — keep it simple: the plan's own figure
  return fill(text, { n: message.match(/\d+/)?.[0] ?? "" });
}

/** The signed-in person, or null — also null when the database is not reachable (the door works without it). */
async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- start over

export async function startOverAction(): Promise<void> {
  await clearDoor();
  redirect("/door/intake/1");
}
