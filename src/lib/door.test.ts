import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeVerdict, DoorRuleError, isLazyTrigger, thresholdNote, verdictFor, weakest, DOOR_RULES_VERSION } from "./door.ts";
import { DOOR_FIXTURE } from "./door-fixture.ts";
import { DOOR_FIXTURE_SQL_PATH, renderDoorFixtureSql } from "../../scripts/gen-door-fixture.ts";

test("rules v1: every fixture run gives the expected verdict", () => {
  for (const r of DOOR_FIXTURE) {
    const got = computeVerdict(r.input);
    assert.deepEqual(got, { rules_version: DOOR_RULES_VERSION, ...r.expect }, r.name);
  }
});

test("the SQL fixture is in step with the TypeScript fixture (regenerate with: npx tsx scripts/gen-door-fixture.ts)", () => {
  const onDisk = readFileSync(DOOR_FIXTURE_SQL_PATH, "utf8");
  assert.equal(onDisk, renderDoorFixtureSql());
});

test("the thresholds", () => {
  assert.equal(verdictFor(25), "go");
  assert.equal(verdictFor(18), "go");
  assert.equal(verdictFor(17), "parked");
  assert.equal(verdictFor(13), "parked");
  assert.equal(verdictFor(12), "killed");
  assert.equal(verdictFor(5), "killed");
});

test("gates must be answered in order; an unanswered gate is a rules error, not a verdict", () => {
  assert.throws(() => computeVerdict({ gates: [true, true, null, true, true], scores: { demand: 3, time: 3, price: 3, edge: 3, margin: 3 } }), (e: unknown) => e instanceof DoorRuleError && e.code === "door.gate_order" && e.detail === "3");
  assert.throws(() => computeVerdict({ gates: [true, true, true, true, true], scores: { demand: 3, time: 3, price: 3, edge: 3 } }), (e: unknown) => e instanceof DoorRuleError && e.code === "door.scores_incomplete");
  assert.throws(() => computeVerdict({ gates: [true, true, true, true, true], scores: { demand: 0, time: 3, price: 3, edge: 3, margin: 6 }, demand_evidence: true }), (e: unknown) => e instanceof DoorRuleError && e.code === "door.scores_incomplete");
});

test("what one point changes", () => {
  assert.deepEqual(thresholdNote(18), { nextThreshold: null, short: 0, atTheBar: true });
  assert.deepEqual(thresholdNote(17), { nextThreshold: 18, short: 1, atTheBar: true });
  assert.deepEqual(thresholdNote(15), { nextThreshold: 18, short: 3, atTheBar: false });
  assert.deepEqual(thresholdNote(13), { nextThreshold: 18, short: 5, atTheBar: true });
  assert.deepEqual(thresholdNote(12), { nextThreshold: 13, short: 1, atTheBar: true });
  assert.deepEqual(thresholdNote(7), { nextThreshold: 13, short: 6, atTheBar: false });
  assert.deepEqual(thresholdNote(25), { nextThreshold: null, short: 0, atTheBar: false });
});

test("where it is weak: the two lowest, in dimension order on ties", () => {
  assert.deepEqual(weakest({ demand: 3, time: 4, price: 3, edge: 3, margin: 5 }), ["demand", "price"]);
  assert.deepEqual(weakest({ demand: 4, time: 3, price: 3, edge: 3, margin: 2 }), ["margin", "time"]);
});

test("\"when I have time\" is not a trigger", () => {
  assert.equal(isLazyTrigger("When I have time"), true);
  assert.equal(isLazyTrigger("when i get the time"), true);
  assert.equal(isLazyTrigger("50 nurses across two hospitals on a waitlist by 30 Nov"), false);
});
