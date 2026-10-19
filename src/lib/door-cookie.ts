import "server-only";
import { cookies } from "next/headers";
import { GATE_COUNT, INTAKE_FIELDS, type Dimension, type Intake, type Scores } from "./door";

/**
 * An unsaved run lives in one HttpOnly cookie (HANDOFF §6): the five lines, the
 * gates with their one-line evidence, the five levels and the demand evidence,
 * and — once the verdict screen is answered — the test or the trigger and the
 * card's fields. Nothing is written anywhere else until "Save this verdict"
 * calls create_venture(). One day, under 4 KB, removed on save. The privacy
 * notice names it (`vx_door`).
 */
export const DOOR_COOKIE = "vx_door";
const MAX_AGE = 60 * 60 * 24;
const MAX_TEXT = 600;
const MAX_BYTES = 3900;

export type DemandEvidence = { claim?: string; source?: string; source_date?: string };
export type WeekTest = { what?: string; cost_cents?: number; currency?: string; deadline?: string; pass_number?: number; fail_number?: number };
export type Revival = { trigger?: string; number?: number; deadline?: string };
export type CardFields = { assets?: string; channel_has?: string; channel_needs?: string; calendar?: string; unblocker?: string };

export type DoorState = {
  v: 1;
  started: string;
  intake: Intake;
  gates: Array<boolean | null>;
  notes: string[];
  scores: Partial<Scores>;
  evidence?: DemandEvidence;
  test?: WeekTest;
  revival?: Revival;
  card?: CardFields;
  fact_changed?: string;
  /** Re-scoring an existing venture: its account id (the intake is prefilled from it). */
  rescore?: string;
};

export function emptyDoor(): DoorState {
  return { v: 1, started: new Date().toISOString(), intake: {}, gates: Array.from({ length: GATE_COUNT }, () => null), notes: Array.from({ length: GATE_COUNT }, () => ""), scores: {} };
}

const clip = (s: unknown) => (typeof s === "string" ? s.slice(0, MAX_TEXT) : "");

function sanitize(raw: unknown): DoorState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const s = emptyDoor();
  s.started = typeof r.started === "string" ? r.started : s.started;
  const intake = (r.intake ?? {}) as Record<string, unknown>;
  for (const f of INTAKE_FIELDS) if (typeof intake[f] === "string") s.intake[f] = clip(intake[f]);
  const gates = Array.isArray(r.gates) ? r.gates : [];
  const notes = Array.isArray(r.notes) ? r.notes : [];
  for (let i = 0; i < GATE_COUNT; i++) {
    s.gates[i] = typeof gates[i] === "boolean" ? (gates[i] as boolean) : null;
    s.notes[i] = clip(notes[i]);
  }
  const scores = (r.scores ?? {}) as Record<string, unknown>;
  for (const d of ["demand", "time", "price", "edge", "margin"] as Dimension[]) {
    const v = scores[d];
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) s.scores[d] = v;
  }
  if (r.evidence && typeof r.evidence === "object") {
    const e = r.evidence as Record<string, unknown>;
    s.evidence = { claim: clip(e.claim), source: clip(e.source), source_date: clip(e.source_date) };
  }
  if (r.test && typeof r.test === "object") {
    const t = r.test as Record<string, unknown>;
    s.test = {
      what: clip(t.what), currency: clip(t.currency) || "EUR", deadline: clip(t.deadline),
      cost_cents: typeof t.cost_cents === "number" ? t.cost_cents : undefined,
      pass_number: typeof t.pass_number === "number" ? t.pass_number : undefined,
      fail_number: typeof t.fail_number === "number" ? t.fail_number : undefined,
    };
  }
  if (r.revival && typeof r.revival === "object") {
    const v = r.revival as Record<string, unknown>;
    s.revival = { trigger: clip(v.trigger), deadline: clip(v.deadline), number: typeof v.number === "number" ? v.number : undefined };
  }
  if (r.card && typeof r.card === "object") {
    const c = r.card as Record<string, unknown>;
    s.card = { assets: clip(c.assets), channel_has: clip(c.channel_has), channel_needs: clip(c.channel_needs), calendar: clip(c.calendar), unblocker: clip(c.unblocker) };
  }
  if (typeof r.fact_changed === "string") s.fact_changed = clip(r.fact_changed);
  if (typeof r.rescore === "string" && /^[0-9a-f-]{36}$/i.test(r.rescore)) s.rescore = r.rescore;
  return s;
}

/** The run in progress, or null when there is none (or it is malformed). */
export async function readDoor(): Promise<DoorState | null> {
  const jar = await cookies();
  const raw = jar.get(DOOR_COOKIE)?.value;
  if (!raw) return null;
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Writes the run (Server Functions and Route Handlers only). Long free text is clipped so the cookie stays under 4 KB. */
export async function writeDoor(state: DoorState): Promise<void> {
  const jar = await cookies();
  let json = JSON.stringify(state);
  if (Buffer.byteLength(json) > MAX_BYTES) {
    // clip the card first (optional), then the notes
    const trimmed: DoorState = { ...state, card: undefined, notes: state.notes.map((n) => n.slice(0, 200)) };
    json = JSON.stringify(trimmed);
  }
  jar.set(DOOR_COOKIE, json, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

export async function clearDoor(): Promise<void> {
  const jar = await cookies();
  jar.set(DOOR_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** The first gate not yet answered (1–5), or null when all five are; a No stops the count at that gate. */
export function nextGate(state: DoorState): number | null {
  for (let i = 0; i < GATE_COUNT; i++) {
    if (state.gates[i] === null) return i + 1;
    if (state.gates[i] === false) return null;
  }
  return null;
}

export function killedAt(state: DoorState): number | null {
  const i = state.gates.findIndex((g) => g === false);
  return i === -1 ? null : i + 1;
}

export function intakeComplete(state: DoorState): boolean {
  return INTAKE_FIELDS.every((f) => (state.intake[f] ?? "").trim().length > 0);
}

/** The JSON record_door_run() / create_venture() take, from the cookie. */
export function runPayload(state: DoorState) {
  const hasEvidence = Boolean(state.evidence?.claim?.trim());
  return {
    gates: state.gates,
    gate_notes: state.notes,
    scores: state.scores,
    demand_evidence: hasEvidence ? state.evidence : null,
    fact_changed: state.fact_changed ?? null,
    test: state.test ?? null,
    revival: state.revival ?? null,
    card: state.card ?? null,
    intake: state.intake,
  };
}
