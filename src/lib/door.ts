/**
 * The door's rules as code, version 1 (HANDOFF §4.2, rule 10). The same rules
 * live in SQL as compute_verdict() (migration 009); src/lib/door-fixture.ts
 * holds 20 runs both must agree on, and `npm test` checks that the generated
 * supabase/tests/door_fixture.sql is in step with the fixture. A rule change is
 * DOOR_RULES_VERSION + 1 and a new SQL function; old runs keep their version.
 *
 * Words (questions, anchors, error texts) live in src/i18n; this file holds the
 * structure and the arithmetic only, so client components can import it too.
 */

export const DOOR_RULES_VERSION = 1 as const;

/** 18 or more is GO; 13 to 17 is PARKED; under 13, or a No at a gate, is KILLED. */
export const GO_MIN = 18;
export const PARKED_MIN = 13;
export const MAX_TOTAL = 25;

/** Demand is capped here without behavioural evidence (competition analysis, move 2). */
export const DEMAND_CAP = 2;
/** From this demand level up the screen asks for the named person or the payment. */
export const DEMAND_EVIDENCE_FROM = 3;

export const GATE_COUNT = 5;
export const GATE_NUMBERS = [1, 2, 3, 4, 5] as const;
export type GateNumber = (typeof GATE_NUMBERS)[number];

export const DIMENSIONS = ["demand", "time", "price", "edge", "margin"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type Scores = Record<Dimension, number>;
export const LEVELS = [1, 2, 3, 4, 5] as const;

/** The five intake lines (HANDOFF §4.1), in order, one per screen. */
export const INTAKE_FIELDS = ["title", "customer", "uses_today", "ship_in_30_days", "unfair_reach"] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];
export type Intake = Partial<Record<IntakeField, string>>;

export type Verdict = "go" | "parked" | "killed";
export type VentureState = "untriaged" | "live" | "parked" | "killed";

/** What compute_verdict() takes: the gates in order, the five levels, whether demand has evidence. */
export type VerdictInput = {
  gates: ReadonlyArray<boolean | null | undefined>;
  scores?: Partial<Scores> | null;
  demand_evidence?: boolean;
};

export type VerdictResult = {
  rules_version: typeof DOOR_RULES_VERSION;
  verdict: Verdict;
  total: number | null;
  killed_at_gate: GateNumber | null;
  scores: Scores | null;
  demand_capped: boolean;
};

/** The codes the SQL raises (and this file throws); src/i18n `door.errors` has the words. */
export const DOOR_ERROR_CODES = [
  "door.gate_order",
  "door.scores_incomplete",
  "door.killed_needs_fact",
  "door.go_needs_test",
  "door.parked_needs_trigger",
  "door.title_required",
  "venture.saved_cap",
  "venture.live_cap",
  "venture.hours_taken",
  "venture.hours_need_live",
  "venture.use_rpc",
  "venture.not_found",
  "tests.immutable",
  "signup.closed",
] as const;
export type DoorErrorCode = (typeof DOOR_ERROR_CODES)[number];

export class DoorRuleError extends Error {
  code: DoorErrorCode;
  detail?: string;
  constructor(code: DoorErrorCode, detail?: string) {
    super(code);
    this.name = "DoorRuleError";
    this.code = code;
    this.detail = detail;
  }
}

/** True when a message from the database (or this file) is one of the door's codes. */
export function doorErrorCode(message: string | null | undefined): DoorErrorCode | null {
  if (!message) return null;
  const m = message.trim();
  return (DOOR_ERROR_CODES as readonly string[]).includes(m) ? (m as DoorErrorCode) : null;
}

export function verdictFor(total: number): Verdict {
  return total >= GO_MIN ? "go" : total >= PARKED_MIN ? "parked" : "killed";
}

/**
 * Rules version 1, word for word what compute_verdict() does in SQL:
 * 1. the gates in order; the first No ends the run (KILLED at that gate);
 * 2. five levels 1–5; demand ≥ 3 without evidence is stored as 2;
 * 3. total ≥ 18 GO · 13–17 PARKED · under 13 KILLED.
 */
export function computeVerdict(input: VerdictInput): VerdictResult {
  for (let i = 0; i < GATE_COUNT; i++) {
    const g = input.gates[i];
    if (typeof g !== "boolean") throw new DoorRuleError("door.gate_order", String(i + 1));
    if (!g) {
      return {
        rules_version: DOOR_RULES_VERSION,
        verdict: "killed",
        total: null,
        killed_at_gate: (i + 1) as GateNumber,
        scores: null,
        demand_capped: false,
      };
    }
  }
  const s = input.scores ?? {};
  const levels = DIMENSIONS.map((d) => s[d]);
  if (levels.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5)) {
    throw new DoorRuleError("door.scores_incomplete");
  }
  let demand = s.demand as number;
  let capped = false;
  if (demand >= DEMAND_EVIDENCE_FROM && !input.demand_evidence) {
    demand = DEMAND_CAP;
    capped = true;
  }
  const scores: Scores = { demand, time: s.time!, price: s.price!, edge: s.edge!, margin: s.margin! };
  const total = scores.demand + scores.time + scores.price + scores.edge + scores.margin;
  return {
    rules_version: DOOR_RULES_VERSION,
    verdict: verdictFor(total),
    total,
    killed_at_gate: null,
    scores,
    demand_capped: capped,
  };
}

/**
 * What one point changes (the Conscious Pulse lesson, §4.2): the next threshold
 * up, how far it is, and whether the total sits at or within one point of a
 * threshold ("At the bar").
 */
export function thresholdNote(total: number): { nextThreshold: number | null; short: number; atTheBar: boolean } {
  const nextThreshold = total < PARKED_MIN ? PARKED_MIN : total < GO_MIN ? GO_MIN : null;
  const short = nextThreshold === null ? 0 : nextThreshold - total;
  const atTheBar = total === GO_MIN || total === PARKED_MIN || short === 1;
  return { nextThreshold, short, atTheBar };
}

/** The two lowest dimensions, lowest first (ties keep the dimension order). */
export function weakest(scores: Scores, n = 2): Dimension[] {
  return [...DIMENSIONS].sort((a, b) => scores[a] - scores[b]).slice(0, n);
}

/** The dimensions whose score is the person's own to raise with evidence this week (§4.2). */
export const OWN_TO_CORRECT: readonly Dimension[] = ["demand", "edge"];

/** "when I have time" is not a revival trigger (§4.2); the SQL refuses the same phrase. */
export function isLazyTrigger(text: string): boolean {
  return /when i (have|get|find) (the )?time/i.test(text);
}

/** The eight stages of the path (§4.3); a GO lands at stage 3 because the verdict covers 1 and 2. */
export const STAGE_COUNT = 8;
export const GO_LANDS_AT_STAGE = 3;
