"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const LITE_ROOT = path.join(__dirname, "..", ".agents", "lite");

// Token figures are estimates (characters / 4), not tokenizer measurements.
const estimateTokens = (text) => Math.ceil(text.length / 4);

const CORE_BUDGET = 740; // was 600, then 670 for R-NEW (new-product trigger, about 60 tokens); 710 for the handoff-guard sentence in R-HANDOFF (about 40); 740 for R-SCRATCH (about 30)
const SKILL_BUDGET = 250;
const TOTAL_BUDGET = 1600;
const RULE_IDS = [
  "R-RESCUE",
  "R-LOOP",
  "R-IMPORT",
  "R-AUDIENCE",
  "R-TOKENS",
  "R-MODE",
  "R-NEW",
  "R-PROJECT",
  "R-HONEST",
  "R-SAFETY",
  "R-SCRATCH",
  "R-HANDOFF",
  "R-FINISH"
];
const LITE_SKILLS = ["anti-hallucination", "debugging", "anti-ai-slop", "import-hygiene"];

const read = (...parts) => fs.readFileSync(path.join(LITE_ROOT, ...parts), "utf8");

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

test("lite core stays within its estimated token budget", () => {
  const tokens = estimateTokens(read("CORE.md"));
  assert.ok(tokens <= CORE_BUDGET, `CORE.md is about ${tokens} tokens (estimate); budget is ${CORE_BUDGET}`);
});

test("lite core defines every shared rule ID, safety, and handoff rules", () => {
  const core = read("CORE.md");
  for (const id of RULE_IDS) {
    assert.match(core, new RegExp(`\\*\\*${id}\\*\\*`), `CORE.md is missing ${id}`);
  }
  assert.match(core, /Never print secrets/);
  assert.match(core, /must not edit or reorder the user's configured model list/);
});

test("the lite tier ships exactly the four planned skills", () => {
  const dirs = fs
    .readdirSync(LITE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(dirs, [...LITE_SKILLS].sort());
});

test("each lite skill has matching frontmatter and stays within its estimated token budget", () => {
  let total = estimateTokens(read("CORE.md"));
  for (const skill of LITE_SKILLS) {
    const text = read(skill, "SKILL.md");
    const meta = frontmatter(text);
    assert.ok(meta, `${skill}: missing frontmatter`);
    assert.equal(meta.name, skill, `${skill}: name must match its folder`);
    assert.ok(meta.description && meta.description.length > 0, `${skill}: missing description`);
    const tokens = estimateTokens(text);
    assert.ok(tokens <= SKILL_BUDGET, `${skill} is about ${tokens} tokens (estimate); budget is ${SKILL_BUDGET}`);
    total += tokens;
  }
  assert.ok(total <= TOTAL_BUDGET, `core plus lite skills is about ${total} tokens (estimate); budget is ${TOTAL_BUDGET}`);
});

test("lite anti-ai-slop bans the planned openers, words, and filler", () => {
  const text = read("anti-ai-slop", "SKILL.md");
  for (const phrase of [
    "Certainly!",
    "Great question",
    "I'd be happy to",
    "delve",
    "seamless",
    "robust",
    "leverage",
    "elevate",
    "game-changer",
    "unlock",
    "comprehensive"
  ]) {
    assert.ok(text.includes(phrase), `anti-ai-slop is missing banned phrase: ${phrase}`);
  }
  assert.match(text, /restate the question/);
  assert.match(text, /closing summary/);
});

test("lite import-hygiene covers the cycle-check fallback order and never installing tools", () => {
  const text = read("import-hygiene", "SKILL.md");
  assert.match(text, /configured checks first/);
  assert.match(text, /Never install a tool/);
  assert.match(text, /Never fix an import error by adding another import/);
  assert.match(text, /third module/);
});
