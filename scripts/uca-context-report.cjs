#!/usr/bin/env node
"use strict";

// Measures how much instruction text each tier asks a model to read.
// Token counts are estimates (characters divided by four), not tokenizer output. They are good for comparing
// tiers with each other, not for predicting any one model's real usage.
// Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { partFiles, pick, readWhole, resolve, sections, withoutFrontmatter } = require("./uca-read.cjs");
// skill-gap-router is installed everywhere but read only for unclear or many-area tasks (router-rule step 7).
const GUARDRAILS = ["anti-ai-slop", "anti-hallucination"];

// What the standard and full instructions ask a model to read for four kinds of task, beyond the always-on files.
// Each part is [name, how]: "read-first" (the block), "full", "list", or a section heading.
// The guardrail lines are in CORE and the Route table picks the skill, so a clear task opens neither the guardrail
// files nor router-rule.md. Whether a model really stops at a Read first block is only known from evaluation runs.
const TASK_PATHS = {
  bug: [["debugging", "read-first"]],
  feature: [["feature-development", "full"], ["backend-api", "read-first"]],
  newApp: [
    ["new-project", "read-first"], ["new-project", "Size the plan first"], ["new-project", "Steps"], ["new-project", "Senior finish"],
    ["design-taste-discovery", "read-first"], ["design-taste-discovery", "Step 1"], ["design-taste-discovery", "Step 3"], ["design-taste-discovery", "Step 7"],
    ["design-taste-discovery/directions", "list"], ["design-taste-discovery/directions", "Ledger"], ["design-taste-discovery/directions", "Chalkboard"],
    ["design-taste-discovery/review", "full"],
    ["frontend-engineering", "read-first"], ["frontend-engineering", "Stack decision"],
    ["testing-and-code-review", "read-first"], ["testing-and-code-review", "Check it like the user"]
  ],
  audit: [["audit", "full"], ["testing-and-code-review", "read-first"], ["testing-and-code-review", "Check it like the user"]]
};

// Tokens for one part, measured with the same code the read helper uses. Throws when a part no longer exists,
// so a renamed section cannot silently drop out of the measurement.
function partTokens([name, how]) {
  const file = resolve(name, path.join(ROOT, ".agents"));
  if (!file) throw new Error(`context report: no skill or workflow named ${name}`);
  const body = readWhole(file, path.join(ROOT, ".agents"));
  const options = how === "full" ? { full: true } : how === "list" ? { list: true } : how === "read-first" ? {} : { section: how };
  const result = pick(body, options);
  if (!result.ok) throw new Error(`context report: ${name} has no section "${how}"`);
  return estimateTokens(result.text);
}

// The same task read the old way: every file the path touches, whole.
function wholeFileTokens(parts) {
  const names = [...new Set(parts.map(([name]) => name))];
  return names.reduce((total, name) => total + partTokens([name, "full"]), 0);
}

// The same task for a model without Node: it opens files, not sections. A Read first block costs the main file;
// a section costs the file that holds it (the main file, or the part its Parts list names). Each file counts once.
function fileFor([name, how]) {
  const main = resolve(name, path.join(ROOT, ".agents"));
  if (how === "read-first" || how === "full" || how === "list") return how === "full" ? [main, ...partFiles(withoutFrontmatter(fs.readFileSync(main, "utf8")), path.join(ROOT, ".agents"))] : [main];
  const wanted = how.trim().toLowerCase();
  const holder = [main, ...partFiles(withoutFrontmatter(fs.readFileSync(main, "utf8")), path.join(ROOT, ".agents"))]
    .find((file) => sections(withoutFrontmatter(fs.readFileSync(file, "utf8"))).some((item) => item.heading.toLowerCase().startsWith(wanted)));
  if (!holder) throw new Error(`context report: ${name} has no section "${how}"`);
  return [holder];
}

function noNodeTokens(parts) {
  const files = [...new Set(parts.flatMap(fileFor))];
  return files.reduce((total, file) => total + estimateTokens(withoutFrontmatter(fs.readFileSync(file, "utf8"))), 0);
}

function taskPaths(alwaysOn) {
  return Object.fromEntries(Object.entries(TASK_PATHS).map(([task, parts]) => [task, {
    readFirst: alwaysOn + parts.reduce((total, part) => total + partTokens(part), 0),
    noNode: alwaysOn + noNodeTokens(parts),
    wholeFiles: alwaysOn + wholeFileTokens(parts)
  }]));
}
const MIN_DUPLICATE_LENGTH = 25;

const estimateTokens = (text) => Math.ceil(text.length / 4);
const readText = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
// A file as it sits on disk (frontmatter included, as hosts load it), plus every part its Parts list names.
const withParts = (relative) => {
  const text = readText(relative);
  const parts = partFiles(withoutFrontmatter(text), path.join(ROOT, ".agents"));
  return [text, ...parts.map((part) => fs.readFileSync(part, "utf8"))].join("\n\n");
};
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

function skillNames(tier) {
  if (!tier.skills.includes("*")) return tier.skills;
  return fs.readdirSync(path.join(ROOT, tier.skillsRoot)).filter((name) => exists(path.posix.join(tier.skillsRoot, name, "SKILL.md"))).sort();
}

function normalizeLine(line) {
  return line.trim().replace(/^[-*\d.)\s]+/, "").replace(/\s+/g, " ").toLowerCase();
}

// Lines of at least MIN_DUPLICATE_LENGTH characters that appear in more than one file (or twice in one).
// The overhead is the tokens of every repeat after the first.
function duplicateOverhead(files) {
  const seen = new Map();
  for (const [name, text] of Object.entries(files)) {
    let inFence = false;
    for (const raw of text.split(/\r?\n/)) {
      if (/^```/.test(raw.trim())) inFence = !inFence;
      if (inFence || /^(#|---|\|)/.test(raw.trim())) continue;
      const line = normalizeLine(raw);
      if (line.length < MIN_DUPLICATE_LENGTH) continue;
      if (!seen.has(line)) seen.set(line, []);
      seen.get(line).push(name);
    }
  }
  const repeated = [];
  let tokens = 0;
  for (const [line, where] of seen) {
    if (where.length < 2) continue;
    const extra = estimateTokens(line) * (where.length - 1);
    tokens += extra;
    repeated.push({ line: line.slice(0, 90), files: [...new Set(where)], extraTokens: extra });
  }
  repeated.sort((a, b) => b.extraTokens - a.extraTokens);
  return { tokens, repeated };
}

function measureTier(name, tier) {
  const alwaysOnFiles = [tier.agents, tier.core];
  const files = {};
  const alwaysOn = alwaysOnFiles.map((file) => {
    const text = readText(file);
    files[file] = text;
    return { file, tokens: estimateTokens(text) };
  });
  const skills = skillNames(tier).map((skill) => {
    const file = path.posix.join(tier.skillsRoot, skill, "SKILL.md");
    // A skill split into parts counts whole: the main file plus every part its Parts list names.
    const text = withParts(file);
    files[file] = text;
    return { skill, file, tokens: estimateTokens(text), guardrail: GUARDRAILS.includes(skill) };
  });
  const guardrails = skills.filter((skill) => skill.guardrail);
  const tasks = skills.filter((skill) => !skill.guardrail).sort((a, b) => b.tokens - a.tokens);
  const sum = (list) => list.reduce((total, item) => total + item.tokens, 0);
  const router = tier.extras && exists(".agents/router-rule.md") ? estimateTokens(readText(".agents/router-rule.md")) : 0;

  const base = sum(alwaysOn) + sum(guardrails);
  const medianSkill = tasks.length ? tasks[Math.floor(tasks.length / 2)] : null;
  const median = medianSkill ? medianSkill.tokens : 0;
  const duplicates = duplicateOverhead(files);
  // Workflow tasks load a workflow file plus their skills; the two largest real paths are reported on their own.
  const skillTokens = (name) => (skills.find((skill) => skill.skill === name) || { tokens: 0 }).tokens;
  const workflow = (name) => (tier.extras && exists(`.agents/workflows/${name}.md`) ? estimateTokens(withParts(`.agents/workflows/${name}.md`)) : 0);
  // Standard and full: guardrail lines and the Route table are in CORE, so a clear task reads CORE plus the skill's
  // Read first block. Lite has no router and reads its short guardrail skills.
  const paths = tier.extras ? taskPaths(sum(alwaysOn)) : null;
  const typicalTask = tier.extras ? sum(alwaysOn) + partTokens([medianSkill.skill, "read-first"]) : base + median;
  const newAppTask = paths ? paths.newApp.readFirst : null;
  const auditTask = paths ? paths.audit.readFirst : null;
  return {
    tier: name,
    alwaysOnTokens: sum(alwaysOn),
    guardrailTokens: sum(guardrails),
    routerTokens: router,
    skillCount: skills.length,
    taskSkills: tasks.map(({ skill, tokens }) => ({ skill, tokens })),
    guardrailSkills: guardrails.map(({ skill, tokens }) => ({ skill, tokens })),
    typicalTask,
    typicalTaskWholeFiles: tier.extras ? sum(alwaysOn) + median : base + median,
    worstCaseTask: base + router + (tasks[0] ? tasks[0].tokens : 0) + (tasks[1] ? tasks[1].tokens : 0),
    newAppTask,
    auditTask,
    taskPaths: paths,
    allSkillsTokens: sum(skills),
    duplicateTokens: duplicates.tokens,
    duplicateLines: duplicates.repeated.slice(0, 5),
    successPerContext: "not measured: needs the benchmark runs"
  };
}

function report() {
  const tiers = JSON.parse(readText(".agents/tiers.json"));
  return Object.entries(tiers).map(([name, tier]) => measureTier(name, tier));
}

function printHelp() {
  return `uca-context-report — estimate the instruction size of each tier

Usage:
  node scripts/uca-context-report.cjs [--json]

Tokens are estimated as characters divided by four. They compare tiers with each other; they do not predict a model's real usage.
Task success per token is reported as not measured until the benchmark has been run.
`;
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(printHelp());
    return 0;
  }
  const unknown = argv.filter((arg) => arg !== "--json");
  if (unknown.length > 0) {
    console.error(`Error: Unknown option: ${unknown[0]}\n\nRun with --help for usage.`);
    return 2;
  }
  const rows = report();
  if (argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  const pad = (value, width) => String(value).padEnd(width);
  console.log("Estimated tokens (characters / 4). Smaller is lighter.\n");
  console.log(`${pad("tier", 10)}${pad("always on", 11)}${pad("guardrails", 12)}${pad("router", 8)}${pad("typical task", 14)}${pad("worst case", 12)}${pad("all skills", 12)}duplicate overhead`);
  for (const row of rows) {
    console.log(`${pad(row.tier, 10)}${pad(row.alwaysOnTokens, 11)}${pad(row.guardrailTokens, 12)}${pad(row.routerTokens, 8)}${pad(row.typicalTask, 14)}${pad(row.worstCaseTask, 12)}${pad(row.allSkillsTokens, 12)}${row.duplicateTokens}`);
  }
  console.log("\nTypical task: lite = always on + its guardrail skills + a median skill; standard and full = always on (CORE carries the guardrail lines and the Route table) + a median skill's Read first block.");
  console.log("Worst case = always on + guardrail files + router + the two largest task skills read whole (an unclear task that opens everything).");
  console.log("\nPer task (standard and full): what the instructions ask / the files that hold it, opened whole (no Node) / every file it touches, read whole.");
  for (const row of rows) {
    if (!row.taskPaths) continue;
    const p = row.taskPaths;
    const cell = (item) => `${item.readFirst} / ${item.noNode} / ${item.wholeFiles}`;
    console.log(`${row.tier}: bug ${cell(p.bug)}; feature ${cell(p.feature)}; new app with a screen ${cell(p.newApp)}; audit ${cell(p.audit)}`);
  }
  console.log("Whether a model stops at a Read first block or a section is not measured here; evaluation runs with read logs show it.");
  console.log("Task success per token: not measured. It needs the benchmark runs.");
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { TASK_PATHS, duplicateOverhead, estimateTokens, main, measureTier, partTokens, report };
