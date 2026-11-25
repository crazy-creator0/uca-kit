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

// ---- scripts/uca-read.cjs: partial reads ----
const os = require("node:os");
const { main: readMain, resolve: resolveName } = require(path.join(ROOT, "scripts", "uca-read.cjs"));

function runRead(args, env = {}) {
  const saved = {};
  for (const [key, value] of Object.entries(env)) { saved[key] = process.env[key]; process.env[key] = value; }
  const out = [];
  const err = [];
  try {
    const code = readMain(args, { out: (text) => out.push(text), err: (text) => err.push(text) });
    return { code, out: out.join("\n"), err: err.join("\n") };
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

test("uca-read prints only the Read first block by default, and much less than the file", () => {
  const result = runRead(["debugging"]);
  assert.equal(result.code, 0);
  assert.match(result.out, /^# Debugging Playbook\n\n## Read first\nUse when:/);
  assert.doesNotMatch(result.out, /## 1\. Symptom\n/);
  assert.match(result.out, /Sections: introduction: --section "Read first" \| 1\. Symptom/);
  assert.ok(result.out.length * 2 < read(".agents/skills/debugging/SKILL.md").length);
});

test("uca-read prints one section by the start of its heading, any case", () => {
  const result = runRead(["design-taste-discovery", "--section", "step 3"]);
  assert.equal(result.code, 0);
  assert.match(result.out, /^## Step 3 — commit to a design brief/);
  assert.doesNotMatch(result.out, /## Step 4/);
  const missing = runRead(["debugging", "--section", "Nope"]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No section starts with "Nope"\. Sections: Read first \|/);
});

test("uca-read lists a reference file's sections with their first line, so the model reads only the ones it picks", () => {
  const result = runRead(["design-taste-discovery/directions", "--list"]);
  assert.equal(result.code, 0);
  assert.match(result.out, /^## Ledger — Fits: money, invoices/m);
  assert.ok(result.out.length * 4 < read(".agents/skills/design-taste-discovery/directions.md").length);
});

test("uca-read takes names, never paths, and reports usage errors with exit 2", () => {
  for (const name of ["../package", "/etc/passwd", "skills/debugging/SKILL.md", "debugging/../../x", "Debugging", ""]) assert.equal(resolveName(name), null, name);
  assert.equal(runRead(["../package"]).code, 1);
  assert.equal(runRead([]).code, 2);
  assert.equal(runRead(["debugging", "--section"]).code, 2);
  assert.equal(runRead(["debugging", "--full", "--list"]).code, 2);
  assert.equal(runRead(["debugging", "--bogus"]).code, 2);
  assert.ok(resolveName("audit").endsWith(path.join("workflows", "audit.md")));
});

test("uca-read can log each read's name, part and size, never its text", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-read-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, "reads.jsonl");
  runRead(["debugging"], { UCA_READ_LOG: log });
  runRead(["new-project", "--section", "Size the plan"], { UCA_READ_LOG: log });
  const entries = fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(entries.map((entry) => [entry.name, entry.part]), [["debugging", "read-first"], ["new-project", "section:Size the plan"]]);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["name", "part", "project", "time", "tokens"]);
    assert.equal(entry.project, path.basename(ROOT));
    assert.ok(entry.tokens > 0);
  }
});

test("every skill and the three large workflows open with a Read first block within their first 25 lines", () => {
  const files = [...skills.map((name) => `.agents/skills/${name}/SKILL.md`), ...["new-project", "audit", "stack-migration"].map((name) => `.agents/workflows/${name}.md`)];
  for (const file of files) {
    const index = read(file).split(/\r?\n/).findIndex((line) => line === "## Read first");
    assert.ok(index !== -1, `${file} has no Read first block`);
    const blockEnd = read(file).split(/\r?\n/).findIndex((line, i) => i > index && line.trim() === "");
    assert.ok(blockEnd <= 25, `${file}: the block ends on line ${blockEnd + 1}, past the 25 lines the no-Node fallback reads`);
  }
});

test("every section a workflow or skill points to exists, so a --section read finds it", () => {
  const pointers = [
    ["design-taste-discovery", "Step 1"], ["design-taste-discovery", "Step 3"], ["design-taste-discovery", "Step 7"],
    ["frontend-engineering", "Stack decision"], ["testing-and-code-review", "Check it like the user"],
    ["new-project", "Size the plan first"], ["new-project", "Intake"], ["new-project", "Steps"], ["new-project", "Senior finish"],
    ["audit", "Limits"], ["audit", "Steps"], ["audit", "Severity"]
  ];
  for (const [name, heading] of pointers) assert.equal(runRead([name, "--section", heading]).code, 0, `${name} --section "${heading}"`);
  const plan = read(".agents/workflows/new-project.md");
  for (const [skill, heading] of [["design-taste-discovery", "Step 1"], ["design-taste-discovery", "Step 3"], ["design-taste-discovery", "Step 7"], ["frontend-engineering", "Stack decision"], ["testing-and-code-review", "Check it like the user"]]) {
    assert.ok(plan.includes(skill) && plan.includes(heading), `new-project no longer points to ${skill} "${heading}"; update this list`);
  }
});

test("R-PROJECT applies to existing or ongoing projects, in the same words in every tier", () => {
  for (const tier of ["lite", "standard", "full"]) {
    assert.match(read(`.agents/${tier}/CORE.md`), /^- \*\*R-PROJECT\*\* — Existing or ongoing project: read PROJECT\.md/m, tier);
  }
});

test("there is one finishing report, and a small build skips the heavy finish", () => {
  assert.match(read(".agents/skills/anti-hallucination/SKILL.md"), /## Completion report\nReport with R-FINISH/);
  assert.match(read(".agents/skills/anti-ai-slop/SKILL.md"), /## Completion\nReport with R-FINISH/);
  const plan = read(".agents/workflows/new-project.md");
  assert.match(plan, /\*\*A small build\*\* \(as in "Size the plan first"\) walks items 4 to 9 below/);
  assert.match(plan, /no README, \.env\.example, readiness run, scorecard or deliverables list unless the user asked for them/);
  assert.match(plan, /## Deliverables \(medium or large build\)/);
  // Checking the main task like the user and checking the request are never skipped.
  const items = plan.slice(plan.indexOf("## Senior finish"));
  for (const item of ["4. **Real states.**", "7. **Checked like the user.**", "9. **Does what was asked.**"]) assert.ok(items.includes(item), item);
});

test("uca-read logs to .uca/read-log.jsonl only when that file already exists", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-read-local-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, ".agents", "workflows"), path.join(dir, ".agents", "workflows"), { recursive: true });
  const agentsDir = path.join(dir, ".agents");
  const saved = process.env.UCA_READ_LOG;
  delete process.env.UCA_READ_LOG;
  try {
    const quiet = { agentsDir, out: () => {}, err: () => {} };
    assert.equal(readMain(["audit"], quiet), 0);
    assert.equal(fs.existsSync(path.join(dir, ".uca")), false, "no log and no folder are created by default");
    fs.mkdirSync(path.join(dir, ".uca"));
    fs.writeFileSync(path.join(dir, ".uca", "read-log.jsonl"), "");
    assert.equal(readMain(["audit", "--section", "Limits"], quiet), 0);
    const entry = JSON.parse(fs.readFileSync(path.join(dir, ".uca", "read-log.jsonl"), "utf8"));
    assert.equal(entry.name, "audit");
    assert.equal(entry.part, "section:Limits");
    assert.equal(entry.project, path.basename(dir));
  } finally {
    if (saved === undefined) delete process.env.UCA_READ_LOG; else process.env.UCA_READ_LOG = saved;
  }
});
