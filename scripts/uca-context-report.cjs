#!/usr/bin/env node
"use strict";

// Measures how much instruction text each tier asks a model to read.
// Token counts are estimates (characters divided by four), not tokenizer output. They are good for comparing
// tiers with each other, not for predicting any one model's real usage.
// Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const GUARDRAILS = ["anti-ai-slop", "anti-hallucination", "skill-gap-router"];
const MIN_DUPLICATE_LENGTH = 25;

const estimateTokens = (text) => Math.ceil(text.length / 4);
const readText = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
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
    const text = readText(file);
    files[file] = text;
    return { skill, file, tokens: estimateTokens(text), guardrail: GUARDRAILS.includes(skill) };
  });
  const guardrails = skills.filter((skill) => skill.guardrail);
  const tasks = skills.filter((skill) => !skill.guardrail).sort((a, b) => b.tokens - a.tokens);
  const sum = (list) => list.reduce((total, item) => total + item.tokens, 0);
  const router = tier.extras && exists(".agents/router-rule.md") ? estimateTokens(readText(".agents/router-rule.md")) : 0;

  const base = sum(alwaysOn) + sum(guardrails);
  const median = tasks.length ? tasks[Math.floor(tasks.length / 2)].tokens : 0;
  const duplicates = duplicateOverhead(files);
  return {
    tier: name,
    alwaysOnTokens: sum(alwaysOn),
    guardrailTokens: sum(guardrails),
    routerTokens: router,
    skillCount: skills.length,
    taskSkills: tasks.map(({ skill, tokens }) => ({ skill, tokens })),
    guardrailSkills: guardrails.map(({ skill, tokens }) => ({ skill, tokens })),
    typicalTask: base + router + median,
    worstCaseTask: base + router + (tasks[0] ? tasks[0].tokens : 0) + (tasks[1] ? tasks[1].tokens : 0),
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
  console.log("\nTypical task = always on + guardrails + router + a median skill. Worst case = the two largest task skills (one primary, one companion).");
  console.log("Task success per token: not measured. It needs the benchmark runs.");
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { duplicateOverhead, estimateTokens, main, measureTier, report };
