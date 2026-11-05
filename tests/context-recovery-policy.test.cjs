"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("extended policy recovers missing context and avoids speculative files", () => {
  const instructions = read(".agents/core-policy-full.md");
  assert.match(instructions, /recover from current files/i);
  assert.match(instructions, /Separate facts, recorded decisions, assumptions, and unknowns/i);
  assert.match(instructions, /Search for existing functionality before adding files/i);
});

test("root instructions stay thin and reference the extended policy", () => {
  const instructions = read("AGENTS.md");
  assert.match(instructions, /core-policy-full\.md/);
  assert.ok(
    instructions.split(/\s+/).length < 300,
    "Root policy should stay compact to limit always-on context."
  );
});

test("compatibility shim does not duplicate core policy", () => {
  const instructions = read(".agents/AGENTS.md");
  assert.match(instructions, /Canonical project policy: root `AGENTS.md`/);
  assert.ok(instructions.length < 1200, "Compatibility shim should remain compact.");
});

test("anti-hallucination and anti-slop skills protect against guessed files", () => {
  const antiHallucination = read(".agents/skills/anti-hallucination/SKILL.md");
  const antiSlop = read(".agents/skills/anti-ai-slop/SKILL.md");
  assert.match(antiHallucination, /If the conversation or prior session summary is incomplete/i);
  assert.match(antiHallucination, /search for an existing equivalent/i);
  assert.match(antiSlop, /Never create files just to cover a guessed requirement/i);
});

test("core policy stays language-neutral and skills are not a language gate", () => {
  const instructions = read(".agents/core-policy-full.md");
  const map = read("AGENT-SKILL-MAP.md");
  assert.match(instructions, /Do not restrict coding capability to languages, frameworks, tools, or skills explicitly listed/i);
  assert.match(instructions, /absence of such a skill must never block work/i);
  assert.match(map, /not a list of supported languages or a capability boundary/i);
  assert.match(map, /lack of a dedicated skill is not a blocker/i);
  assert.doesNotMatch(map, /\| Python change \|/i);
});
