import assert from "node:assert/strict";
import test from "node:test";

import {
  comparisonReference,
  verifyLegacyBaselineEvolution,
  verifyLegacyGraphPolicy,
  verifyProductionLegacyGraph,
} from "../scripts/legacy-graph-policy.mjs";

test("the production legacy graph matches its non-growth baseline", async () => {
  assert.deepEqual(await verifyProductionLegacyGraph(), {
    exceptions: 0,
    grandfathered: 304,
    inputs: 304,
  });
});

test("new legacy inputs require a reviewed, expiring exception", () => {
  const inputs = ["js/existing.js", "js/new-feature.js"];
  assert.throws(
    () => verifyLegacyGraphPolicy({
      baselineInputs: ["js/existing.js"],
      currentInputs: inputs,
      now: new Date("2026-09-05T00:00:00Z"),
    }),
    /requires a reviewed exception: js\/new-feature\.js/,
  );

  assert.deepEqual(
    verifyLegacyGraphPolicy({
      baselineInputs: ["js/existing.js"],
      currentInputs: inputs,
      exceptions: {
        "js/new-feature.js": {
          expires: "2026-09-30",
          reason: "Temporary bridge while the host adapter migrates",
        },
      },
      now: new Date("2026-09-05T00:00:00Z"),
    }),
    { exceptions: 1, grandfathered: 1, inputs: 2 },
  );
});

test("the committed baseline may shrink but cannot grow or reorder", () => {
  assert.doesNotThrow(() => verifyLegacyBaselineEvolution({
    baselineInputs: ["js/first.js", "js/third.js"],
    previousInputs: ["js/first.js", "js/second.js", "js/third.js"],
  }));
  assert.throws(
    () => verifyLegacyBaselineEvolution({
      baselineInputs: ["js/first.js", "js/new.js"],
      previousInputs: ["js/first.js"],
    }),
    /baseline cannot grow.*js\/new\.js/,
  );
  assert.throws(
    () => verifyLegacyBaselineEvolution({
      baselineInputs: ["js/third.js", "js/first.js"],
      previousInputs: ["js/first.js", "js/second.js", "js/third.js"],
    }),
    /cannot reorder retained inputs/,
  );
});

test("push CI compares the complete pushed commit range", () => {
  const before = "1234567890abcdef1234567890abcdef12345678";
  assert.deepEqual(comparisonReference({
    CI: "true",
    GITHUB_EVENT_BEFORE: before,
    GITHUB_EVENT_NAME: "push",
  }), { reference: before, required: true });
  assert.throws(() => comparisonReference({
    CI: "true",
    GITHUB_EVENT_NAME: "push",
  }), /requires the event's before SHA/);
  assert.throws(() => comparisonReference({
    CI: "true",
    GITHUB_EVENT_BEFORE: "0000000000000000000000000000000000000000",
    GITHUB_EVENT_NAME: "push",
  }), /requires the event's before SHA/);
});

test("legacy exceptions expire and removed inputs leave the baseline", () => {
  assert.throws(
    () => verifyLegacyGraphPolicy({
      baselineInputs: ["js/existing.js"],
      currentInputs: ["js/existing.js", "js/new-feature.js"],
      exceptions: {
        "js/new-feature.js": { expires: "2026-09-04", reason: "Expired bridge" },
      },
      now: new Date("2026-09-05T00:00:00Z"),
    }),
    /expired or has an invalid expiry/,
  );

  assert.throws(
    () => verifyLegacyGraphPolicy({
      baselineInputs: ["js/existing.js", "js/removed.js"],
      currentInputs: ["js/existing.js"],
    }),
    /baseline retains removed inputs/,
  );
});
