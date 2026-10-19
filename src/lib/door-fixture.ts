import type { VerdictInput, VerdictResult } from "./door";

/**
 * Twenty runs through the door with the result rules version 1 must give
 * (HANDOFF §8 B2): Conscious Pulse at 13 → PARKED, a gate-2 kill, an 18 → GO,
 * every threshold edge, the demand cap, and each gate as the one that kills.
 * src/lib/door.test.ts runs computeVerdict() over it; scripts/gen-door-fixture.ts
 * writes the same runs as supabase/tests/door_fixture.sql, which run.sh feeds
 * to compute_verdict(). Change a row here → regenerate the SQL (the test says so).
 */
export type FixtureRun = { name: string; input: VerdictInput; expect: Omit<VerdictResult, "rules_version"> };

const pass = [true, true, true, true, true] as const;
const ok = (demand: number, time: number, price: number, edge: number, margin: number, demand_evidence = true): VerdictInput => ({
  gates: pass,
  scores: { demand, time, price, edge, margin },
  demand_evidence,
});
const scored = (demand: number, time: number, price: number, edge: number, margin: number) => ({
  total: demand + time + price + edge + margin,
  killed_at_gate: null,
  scores: { demand, time, price, edge, margin },
});

export const DOOR_FIXTURE: FixtureRun[] = [
  {
    name: "Conscious Pulse, 13 Oct 2026: demand 2, time 4, price 3, edge 2, margin 2 → PARKED 13",
    input: ok(2, 4, 3, 2, 2, false),
    expect: { verdict: "parked", ...scored(2, 4, 3, 2, 2), demand_capped: false },
  },
  {
    name: "the sketch's sample: 3 4 3 3 5 with a named person → GO 18, at the bar",
    input: ok(3, 4, 3, 3, 5),
    expect: { verdict: "go", ...scored(3, 4, 3, 3, 5), demand_capped: false },
  },
  {
    name: "the sketch's parked sample: 4 3 3 3 2 with evidence → PARKED 15",
    input: ok(4, 3, 3, 3, 2),
    expect: { verdict: "parked", ...scored(4, 3, 3, 3, 2), demand_capped: false },
  },
  {
    name: "a No at gate 2 kills: category creation",
    input: { gates: [true, false, null, null, null] },
    expect: { verdict: "killed", total: null, killed_at_gate: 2, scores: null, demand_capped: false },
  },
  {
    name: "a No at gate 1 kills, whatever follows",
    input: { gates: [false, true, true, true, true], scores: { demand: 5, time: 5, price: 5, edge: 5, margin: 5 }, demand_evidence: true },
    expect: { verdict: "killed", total: null, killed_at_gate: 1, scores: null, demand_capped: false },
  },
  {
    name: "a No at gate 3 kills: a project in disguise",
    input: { gates: [true, true, false] },
    expect: { verdict: "killed", total: null, killed_at_gate: 3, scores: null, demand_capped: false },
  },
  {
    name: "a No at gate 4 kills: freelancing in disguise (the wedding speeches)",
    input: { gates: [true, true, true, false, true] },
    expect: { verdict: "killed", total: null, killed_at_gate: 4, scores: null, demand_capped: false },
  },
  {
    name: "a No at gate 5 kills: the week-three dip",
    input: { gates: [true, true, true, true, false] },
    expect: { verdict: "killed", total: null, killed_at_gate: 5, scores: null, demand_capped: false },
  },
  {
    name: "all fives → GO 25",
    input: ok(5, 5, 5, 5, 5),
    expect: { verdict: "go", ...scored(5, 5, 5, 5, 5), demand_capped: false },
  },
  {
    name: "all ones → KILLED 5, too weak to park",
    input: ok(1, 1, 1, 1, 1),
    expect: { verdict: "killed", ...scored(1, 1, 1, 1, 1), demand_capped: false },
  },
  {
    name: "12 is killed: one under the parked floor",
    input: ok(2, 3, 2, 3, 2),
    expect: { verdict: "killed", ...scored(2, 3, 2, 3, 2), demand_capped: false },
  },
  {
    name: "13 is parked: the floor",
    input: ok(2, 3, 3, 3, 2),
    expect: { verdict: "parked", ...scored(2, 3, 3, 3, 2), demand_capped: false },
  },
  {
    name: "17 is parked: one short of GO",
    input: ok(3, 4, 3, 3, 4),
    expect: { verdict: "parked", ...scored(3, 4, 3, 3, 4), demand_capped: false },
  },
  {
    name: "18 is GO: the bar",
    input: ok(4, 4, 3, 3, 4),
    expect: { verdict: "go", ...scored(4, 4, 3, 3, 4), demand_capped: false },
  },
  {
    name: "demand 4 without a named person is stored as 2: 4 4 4 4 4 → 18 GO",
    input: ok(4, 4, 4, 4, 4, false),
    expect: { verdict: "go", ...scored(2, 4, 4, 4, 4), demand_capped: true },
  },
  {
    name: "demand 5 without a payment on record is stored as 2: 5 5 3 3 3 → 16 PARKED",
    input: ok(5, 5, 3, 3, 3, false),
    expect: { verdict: "parked", ...scored(2, 5, 3, 3, 3), demand_capped: true },
  },
  {
    name: "demand 3 without evidence falls to 2 and the total under 13: 3 3 3 2 2 → 12 KILLED",
    input: ok(3, 3, 3, 2, 2, false),
    expect: { verdict: "killed", ...scored(2, 3, 3, 2, 2), demand_capped: true },
  },
  {
    name: "demand 2 needs no evidence and is not capped",
    input: ok(2, 5, 5, 5, 5, false),
    expect: { verdict: "go", ...scored(2, 5, 5, 5, 5), demand_capped: false },
  },
  {
    name: "demand 5 with a payment on record stays 5: 5 2 2 2 2 → 13 PARKED",
    input: ok(5, 2, 2, 2, 2),
    expect: { verdict: "parked", ...scored(5, 2, 2, 2, 2), demand_capped: false },
  },
  {
    name: "Venturex on its own door, 3 Oct 2026: 2 4 3 2 3 → PARKED 14",
    input: ok(2, 4, 3, 2, 3, false),
    expect: { verdict: "parked", ...scored(2, 4, 3, 2, 3), demand_capped: false },
  },
];
