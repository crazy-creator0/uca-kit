"use strict";

// Per-call cost ratchet: no number in tests/cost-baseline.json may rise without a written reason, and a number
// that falls must be written into the baseline, so a later change cannot quietly take the saving back.

const test = require("node:test");
const assert = require("node:assert/strict");
const { compare, current, load } = require("../scripts/uca-cost-baseline.cjs");

test("every per-call and per-task cost matches its baseline (node scripts/uca-cost-baseline.cjs)", () => {
  const findings = compare(current(), load());
  assert.deepEqual(findings, [], `Cost differs from tests/cost-baseline.json:\n${findings.join("\n")}`);
});

test("the ratchet can fail: a rise without a reason, a fall not written down, and a missing number are all caught", () => {
  const baseline = { a: { tokens: 100 }, b: { tokens: 100 }, c: { tokens: 100, reason: "safety line" }, gone: { tokens: 5 } };
  const findings = compare({ a: 110, b: 90, c: 120, d: 1 }, baseline);
  assert.ok(findings.some((line) => /^a: 110, up from 100 with no reason/.test(line)));
  assert.ok(findings.some((line) => /^b: 90, down from 100 \(run --write/.test(line)));
  assert.ok(findings.some((line) => /^c: 120, up from 100$/.test(line)), "a rise with a reason is still reported until written");
  assert.ok(findings.some((line) => /^d: 1, not in the baseline/.test(line)));
  assert.ok(findings.some((line) => /^gone: no longer measured/.test(line)));
});

test("the baseline covers every tier, every host and every skill or workflow", () => {
  const keys = Object.keys(load());
  for (const prefix of ["always-on lite", "always-on standard", "always-on full", "host generic lite", "host claude standard", "read first debugging", "read first audit", "task bug standard", "small build lite"]) {
    assert.ok(keys.includes(prefix), `baseline has no "${prefix}"`);
  }
  assert.ok(keys.filter((key) => key.startsWith("host ")).length === 22, "11 hosts in lite and standard");
});
