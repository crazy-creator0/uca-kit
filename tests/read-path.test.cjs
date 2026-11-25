"use strict";

// What a model reads on an ordinary task: CORE (with its Route table) instead of the full router.
// These tests check the files agree with each other. Whether a model really reads less is a benchmark question.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const skills = fs.readdirSync(path.join(ROOT, ".agents", "skills")).filter((name) => fs.existsSync(path.join(ROOT, ".agents", "skills", name, "SKILL.md")));
const workflows = fs.readdirSync(path.join(ROOT, ".agents", "workflows")).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3));

function section(text, heading) {
  const start = text.indexOf(`## ${heading}\n`);
  if (start === -1) return null;
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next).trim();
}

// Names in backticks in the table rows of a Markdown section.
function tableNames(text) {
  const names = new Set();
  for (const line of text.split("\n").filter((row) => row.startsWith("|"))) {
    for (const match of line.matchAll(/`([a-z0-9-]+)`/g)) names.add(match[1]);
  }
  return names;
}

// The router's intent table, plus the workflows its Workflows paragraph names.
function routerNames(router) {
  const names = tableNames(section(router, "Intent table"));
  for (const match of section(router, "Workflows").matchAll(/`([a-z0-9-]+)`/g)) names.add(match[1]);
  return names;
}

function checkRoute(core, router) {
  const route = section(core, "Route");
  if (!route) return ["no Route section"];
  const problems = [];
  const coreNames = tableNames(route);
  const fromRouter = routerNames(router);
  for (const name of coreNames) {
    if (!skills.includes(name) && !workflows.includes(name)) problems.push(`Route names ${name}, which is neither a skill nor a workflow`);
    if (!fromRouter.has(name)) problems.push(`Route names ${name}, which router-rule.md does not`);
  }
  // Every task skill the router can pick is reachable from the short table; skill-gap-router is reached through router-rule.md itself.
  for (const name of fromRouter) {
    if (name === "skill-gap-router") continue;
    if (skills.includes(name) && !coreNames.has(name)) problems.push(`router-rule.md routes to ${name}, the Route table does not`);
  }
  if (!/router-rule\.md/.test(route)) problems.push("Route does not say when to open router-rule.md");
  return problems;
}

test("standard and full carry the same Route table", () => {
  const standard = section(read(".agents/standard/CORE.md"), "Route");
  assert.ok(standard, "standard/CORE.md has no Route section");
  assert.equal(section(read(".agents/full/CORE.md"), "Route"), standard);
  assert.equal(section(read(".agents/lite/CORE.md"), "Route"), null, "lite installs no router, so it has no Route table");
});

test("the Route table agrees with router-rule.md", () => {
  const router = read(".agents/router-rule.md");
  for (const tier of ["standard", "full"]) assert.deepEqual(checkRoute(read(`.agents/${tier}/CORE.md`), router), [], tier);
});

test("the Route check can fail: a wrong or missing skill is caught", () => {
  const core = read(".agents/standard/CORE.md");
  const router = read(".agents/router-rule.md");
  assert.ok(checkRoute(core.replace("`backend-api`", "`backend-apis`"), router).some((problem) => /backend-apis/.test(problem)));
  assert.ok(checkRoute(core.replace(/^\| An API.*\n/m, ""), router).some((problem) => /backend-api/.test(problem)));
  assert.deepEqual(checkRoute(core.replace("## Route", "## Routes"), router), ["no Route section"]);
});

test("the entry file sends the model to CORE first and to the router only when needed", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /Read `\.agents\/CORE\.md` before every task/);
  assert.match(agents, /Open `\.agents\/router-rule\.md` only when that table says to/);
  assert.doesNotMatch(agents, /AGENT-SKILL-MAP\.md/, "the skill map is reference reading, not an every-task pointer");
  assert.doesNotMatch(agents, /skill-catalog\.md/, "the catalog is reference reading, not an every-task pointer");
});

test("the guardrails' must-do lines live in the standard and full cores, once", () => {
  const standard = section(read(".agents/standard/CORE.md"), "Guardrails (always on)");
  assert.ok(standard, "standard/CORE.md has no Guardrails section");
  assert.equal(section(read(".agents/full/CORE.md"), "Guardrails (always on)"), standard);
  assert.match(standard, /\*\*Evidence\.\*\*[^\n]*Open `anti-hallucination` for/);
  assert.match(standard, /\*\*No slop\.\*\*[^\n]*Open `anti-ai-slop` before/);
  // The guardrail files point at those lines instead of repeating them, so the duplicate-line check stays at zero.
  assert.match(read(".agents/skills/anti-hallucination/SKILL.md"), /^Must do: Evidence, in the core's guardrails \(`\.agents\/CORE\.md`\)/m);
  assert.match(read(".agents/skills/anti-ai-slop/SKILL.md"), /^Must do: No slop, in the core's guardrails \(`\.agents\/CORE\.md`\)/m);
  assert.match(read(".agents/router-rule.md"), /through their lines under "Guardrails" in `\.agents\/CORE\.md`/);
});
