"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const standard = read(".agents", "skills", "debugging", "SKILL.md");
const lite = read(".agents", "lite", "debugging", "SKILL.md");

// Wording checks: they show the required steps are written down, not that an agent follows them.
test("both debugging skills keep the investigation sequence", () => {
  for (const text of [standard, lite]) {
    assert.match(text, /Symptom → Investigate → Hypothesis → Evidence → Root cause → Fix → Prevention/);
  }
});

test("both debugging skills require a failing reproduction before any code change", () => {
  for (const text of [standard, lite]) {
    assert.match(text, /(Do not change code|change code) until a failing reproduction exists/);
    assert.match(text, /cannot reproduce/);
  }
});

test("both debugging skills require a regression test that fails before the fix and passes after", () => {
  for (const text of [standard, lite]) {
    assert.match(text, /regression test that fails before the fix and passes after/);
    assert.match(text, /original reproduction/);
  }
});

test("both debugging skills forbid unconfirmed root causes and one-change-at-a-time violations", () => {
  for (const text of [standard, lite]) {
    assert.match(text, /root cause not yet confirmed/);
    assert.match(text, /one thing at a time|one area at a time/);
    assert.match(text, /random config/i);
  }
});

test("the standard debugging skill ranks hypotheses with confirming and rejecting evidence", () => {
  assert.match(standard, /priority order/);
  assert.match(standard, /confirm it and what would reject it/);
  assert.match(standard, /rejected twice/);
});

test("debugging traces only layers the project really has", () => {
  assert.match(standard, /layers this project really has/);
  assert.match(lite, /only layers this project has/);
  assert.doesNotMatch(standard, /Use only layers that exist\.\s*$/m);
});

test("the standard debugging output format asks for reproduction and an evidence log", () => {
  const output = standard.slice(standard.indexOf("## Output format"));
  for (const item of ["Reproduction", "Evidence log", "Root cause status", "Verification", "Prevention"]) {
    assert.ok(output.includes(item), `output format is missing: ${item}`);
  }
});
