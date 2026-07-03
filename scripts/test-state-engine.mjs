import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await import(path.join(root, "public/neurocrop-state-engine.js"));

const engine = globalThis.NeuroCropStateEngine;
if (!engine) throw new Error("NeuroCropStateEngine did not initialize.");

const fixturesDir = path.join(root, "tests/state-engine");
const fixtureNames = (await fs.readdir(fixturesDir)).filter((name) => name.endsWith(".json")).sort();
let failures = 0;

function assertEqual(actual, expected, message) {
  if (actual === expected) return;
  failures += 1;
  console.error(`FAIL ${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

for (const fixtureName of fixtureNames) {
  const fixture = JSON.parse(await fs.readFile(path.join(fixturesDir, fixtureName), "utf8"));
  if (fixture.name === "normal-live") {
    const result = engine.computeNodeFreshness(fixture.node, fixture.now);
    assertEqual(result.transportStatus, fixture.expected.transportStatus, `${fixture.name} transport`);
    assertEqual(result.observations.temperature.status, fixture.expected.observationStatus, `${fixture.name} observation`);
  } else if (fixture.name === "backfill-out-of-range") {
    const result = engine.computeConditionStatus(fixture.readings, fixture.profile, fixture.now);
    assertEqual(result.status, fixture.expected.status, `${fixture.name} condition`);
    assertEqual(result.lateEvents.length, fixture.expected.lateEventCount, `${fixture.name} late events`);
    assertEqual(result.reasons.length, fixture.expected.activeReasonCount, `${fixture.name} active reasons`);
  } else if (fixture.name === "critical-then-silent") {
    const freshness = engine.computeNodeFreshness(fixture.node, fixture.now);
    const state = engine.deriveFarmState({
      scope: { type: "section", id: "section-1", name: "Section 1" },
      nodes: [{ ...fixture.node, freshness }],
      condition: { status: "unknown", reasons: [] },
      previousState: fixture.previousState
    }, fixture.now);
    assertEqual(freshness.transportStatus, fixture.expected.transportStatus, `${fixture.name} transport`);
    assertEqual(state.conditionStatus, fixture.expected.conditionStatus, `${fixture.name} condition`);
    assertEqual(state.lastKnownCondition?.status, fixture.expected.lastKnownStatus, `${fixture.name} last known`);
  } else if (fixture.name === "flapping-node") {
    const result = engine.computeNodeFreshness(fixture.node, fixture.now, fixture.previousFreshness);
    assertEqual(result.rawStatus, fixture.expected.rawStatus, `${fixture.name} raw`);
    assertEqual(result.transportStatus, fixture.expected.stableStatus, `${fixture.name} stable`);
    assertEqual(result.recoveryStreak, fixture.expected.recoveryStreak, `${fixture.name} recovery streak`);
    assertEqual(result.rawTransitionCount, fixture.expected.rawTransitionCount, `${fixture.name} raw transitions`);
    assertEqual(result.reasons.some((reason) => reason.code === "TRANSPORT_FLAPPING"), fixture.expected.hasFlappingReason, `${fixture.name} reason`);
  }
  console.log(`PASS ${fixture.name}`);
}

if (failures) process.exitCode = 1;
else console.log(`\n${fixtureNames.length} golden vectors passed.`);
