"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const TIERS = ["lite", "standard", "full"];
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

const readCore = (tier) => fs.readFileSync(path.join(ROOT, ".agents", tier, "CORE.md"), "utf8");

function ruleLines(text) {
  const lines = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^- \*\*(R-[A-Z]+)\*\*/.exec(line);
    if (match) lines.set(match[1], line);
  }
  return lines;
}

function section(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next).trim();
}

test("every tier has a CORE.md that defines every shared rule ID", () => {
  for (const tier of TIERS) {
    const rules = ruleLines(readCore(tier));
    for (const id of RULE_IDS) {
      assert.ok(rules.has(id), `${tier}/CORE.md is missing ${id}`);
    }
  }
});

test("shared rule wording is identical in every tier (no drift from Lite)", () => {
  const lite = ruleLines(readCore("lite"));
  for (const tier of ["standard", "full"]) {
    const rules = ruleLines(readCore(tier));
    for (const id of RULE_IDS) {
      assert.equal(rules.get(id), lite.get(id), `${tier}/CORE.md changed the wording of ${id}`);
    }
  }
});

test("the safety and handoff section is identical in every tier", () => {
  const lite = section(readCore("lite"), "Safety and handoff");
  assert.ok(lite, "lite/CORE.md is missing the Safety and handoff section");
  for (const tier of ["standard", "full"]) {
    assert.equal(section(readCore(tier), "Safety and handoff"), lite, `${tier}/CORE.md safety section differs from lite`);
  }
});

test("only the Full tier mentions subagent dispatch", () => {
  assert.doesNotMatch(readCore("lite"), /subagent/i);
  assert.doesNotMatch(readCore("standard"), /subagent/i);
  assert.match(readCore("full"), /## Subagent dispatch/);
});

test("skills named by the Standard and Full cores exist", () => {
  const skillsDir = path.join(ROOT, ".agents", "skills");
  const standard = readCore("standard");
  for (const skill of ["debugging", "testing-and-code-review", "anti-hallucination", "anti-ai-slop", "import-hygiene"]) {
    assert.ok(standard.includes(skill), `standard/CORE.md should name ${skill}`);
    assert.ok(fs.existsSync(path.join(skillsDir, skill, "SKILL.md")), `missing canonical skill ${skill}`);
  }
  const full = readCore("full");
  for (const skill of ["design-taste-discovery", "frontend-visuals-and-3d"]) {
    assert.ok(full.includes(skill), `full/CORE.md should name ${skill}`);
    assert.ok(fs.existsSync(path.join(skillsDir, skill, "SKILL.md")), `missing canonical skill ${skill}`);
  }
});

test("tier cores grow in size from lite to full (estimated tokens, characters / 4)", () => {
  const size = (tier) => Math.ceil(readCore(tier).length / 4);
  assert.ok(size("lite") < size("standard"), "standard core should be larger than lite");
  assert.ok(size("standard") <= size("full"), "full core should not be smaller than standard");
});

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

test("tiers.json defines exactly lite, standard, and full with valid files and skills", () => {
  const tiers = readJson(".agents/tiers.json");
  assert.deepEqual(Object.keys(tiers).sort(), [...TIERS].sort());
  for (const [name, tier] of Object.entries(tiers)) {
    assert.ok(typeof tier.description === "string" && tier.description.length > 0, `${name}: missing description`);
    for (const key of ["core", "agents"]) {
      assert.ok(fs.existsSync(path.join(ROOT, tier[key])), `${name}: ${key} file not found: ${tier[key]}`);
    }
    for (const file of tier.include || []) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${name}: included file not found: ${file}`);
    }
    assert.ok(Array.isArray(tier.skills) && tier.skills.length > 0, `${name}: skills must be a non-empty array`);
    for (const skill of tier.skills) {
      if (skill === "*") continue;
      const file = path.join(ROOT, tier.skillsRoot, skill, "SKILL.md");
      assert.ok(fs.existsSync(file), `${name}: skill file not found: ${path.relative(ROOT, file)}`);
    }
  }
});

test("the Lite root instructions stay tiny and point at the tier core", () => {
  const text = fs.readFileSync(path.join(ROOT, ".agents", "lite", "AGENTS.md"), "utf8");
  assert.match(text, /\.agents\/CORE\.md/);
  assert.ok(Math.ceil(text.length / 4) <= 150, "lite AGENTS.md should stay within about 150 estimated tokens");
});

const ADAPTERS = [
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/universal-coding-agent-kit.mdc",
  ".windsurf/rules/universal-coding-agent-kit.md",
  ".devin/rules/universal-coding-agent-kit.md",
  ".junie/rules/universal-coding-agent-kit.md",
  ".aiassistant/rules/universal-coding-agent-kit.md"
];

test("each adapter is a thin pointer to root AGENTS.md, not a second copy of the rules", () => {
  for (const adapter of ADAPTERS) {
    const text = fs.readFileSync(path.join(ROOT, adapter), "utf8");
    assert.match(text, /AGENTS\.md/, `${adapter} should point at AGENTS.md`);
    assert.ok(text.length <= 1000, `${adapter} is ${text.length} characters; keep adapters short`);
    assert.doesNotMatch(text, /circular imports|protect secrets|actually performed/i, `${adapter} repeats rule text from the core`);
  }
});

test("adapters do not name files the Lite tier lacks, and mark the fallback guide as optional", () => {
  for (const adapter of ADAPTERS) {
    const text = fs.readFileSync(path.join(ROOT, adapter), "utf8");
    assert.doesNotMatch(text, /\.agents\/AGENTS\.md|AGENT-SKILL-MAP\.md|router-rule\.md|catalog/, `${adapter} names a file the Lite tier does not install`);
    if (text.includes("HOST-CAPABILITY-FALLBACK.md")) {
      assert.match(text, /when it is installed/, `${adapter} must mark HOST-CAPABILITY-FALLBACK.md as optional`);
    }
  }
});

test("the PROJECT.md template has the planned sections and the staleness fields", () => {
  const text = fs.readFileSync(path.join(ROOT, ".agents", "PROJECT-TEMPLATE.md"), "utf8");
  for (const heading of [
    "Stack",
    "Entry points",
    "Commands (run and seen to work)",
    "Architecture and boundaries",
    "Conventions",
    "Known issues and constraints",
    "Paths to avoid",
    "Assumed or unknown (not verified)"
  ]) {
    assert.match(text, new RegExp(`^## ${heading.replace(/[()]/g, "\\$&")}$`, "m"), `template is missing: ${heading}`);
  }
  assert.match(text, /^Verified at:/m);
  assert.match(text, /\(source: /);
});

test("R-MODE keeps its parts in every tier: user override, safe default, drop order, honest retry", () => {
  for (const tier of ["lite", "standard", "full"]) {
    const core = fs.readFileSync(path.join(__dirname, "..", ".agents", tier, "CORE.md"), "utf8");
    const rule = core.split("\n").find((line) => line.includes("**R-MODE**")) || "";
    assert.match(rule, /LITE \/ BALANCED \/ FULL win/, tier);
    assert.match(rule, /lite if unsure/, tier);
    assert.match(rule, /drop references, then the companion skill, then shorten steps/, tier);
    assert.match(rule, /never safety, checks or the stated task/, tier);
    assert.match(rule, /Retry a failed step once, then report it/, tier);
  }
});
