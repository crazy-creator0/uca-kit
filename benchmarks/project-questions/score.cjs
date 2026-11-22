#!/usr/bin/env node
"use strict";

// Fixed questions about real repositories, with answer keys read from the code.
//
//   node benchmarks/project-questions/score.cjs verify <repo-id> <checkout>
//       Checks the checkout is at the pinned commit and that every evidence line is in its file.
//   node benchmarks/project-questions/score.cjs map <repo-id> <checkout>
//       Runs the project scanner on the checkout and counts the questions its card already answers.
//   node benchmarks/project-questions/score.cjs answers <repo-id> <answers.json>
//       Scores a model's answers: {"F01": "answer text", ...}. A missing answer fails.
//
// Add --json for machine-readable output. Exit codes: 0 done, 1 verify found a problem, 2 usage error.
// Nothing here counts tokens. Token counts come from the host or the model's tokenizer during a run (EVALUATION.md).

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const QUESTIONS = path.join(__dirname, "questions.json");
const SCANNER = path.join(__dirname, "..", "..", "scripts", "uca-project-discover.cjs");

class UsageError extends Error {}

function loadRepo(id, file = QUESTIONS) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const repo = data.repos.find((entry) => entry.id === id);
  if (!repo) throw new UsageError(`Unknown repo id "${id}". Known: ${data.repos.map((entry) => entry.id).join(", ")}`);
  return repo;
}

// An answer passes when every group has at least one pattern that matches it.
function passes(question, text) {
  if (typeof text !== "string" || text.trim() === "") return { pass: false, missing: question.need.map((group) => group.join(" | ")) };
  const missing = question.need.filter((group) => !group.some((pattern) => new RegExp(pattern, "i").test(text))).map((group) => group.join(" | "));
  return { pass: missing.length === 0, missing };
}

function headCommit(checkout) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function verify(repo, checkout) {
  const problems = [];
  const head = headCommit(checkout);
  if (!head) problems.push(`${checkout} is not a git checkout; cannot confirm commit ${repo.commit}`);
  else if (!head.startsWith(repo.commit)) problems.push(`checkout is at ${head.slice(0, 12)}, the answer keys are for ${repo.commit}`);
  const lines = [];
  for (const question of repo.questions) {
    for (const evidence of question.evidence) {
      const full = path.join(checkout, evidence.file);
      const text = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
      const index = text === null ? -1 : text.split("\n").findIndex((line) => line.includes(evidence.has));
      if (index < 0) problems.push(`${question.id}: "${evidence.has}" not found in ${evidence.file}`);
      else lines.push(`${question.id}: ${evidence.file}:${index + 1}`);
    }
  }
  return { problems, lines };
}

function scanCard(checkout) {
  const result = spawnSync(process.execPath, [SCANNER, "--root", checkout], { encoding: "utf8", timeout: 120_000, maxBuffer: 20_000_000 });
  if (result.status !== 0) throw new Error(`scanner failed: ${result.stderr}`);
  return result.stdout;
}

function score(repo, answers) {
  const rows = repo.questions.map((question) => ({ id: question.id, ask: question.ask, ...passes(question, answers[question.id]) }));
  return { repo: repo.id, passed: rows.filter((row) => row.pass).length, total: rows.length, rows };
}

function printScore(result, label) {
  const lines = [`${result.repo}: ${result.passed} of ${result.total} ${label}`];
  for (const row of result.rows) lines.push(`  ${row.pass ? "yes" : "no "} ${row.id} ${row.ask}${row.pass ? "" : `  (missing: ${row.missing.join("; ")})`}`);
  return lines.join("\n");
}

function main(argv) {
  const json = argv.includes("--json");
  const [command, id, target] = argv.filter((arg) => arg !== "--json");
  if (!command || !id || !target || !["verify", "map", "answers"].includes(command)) {
    throw new UsageError("Usage: score.cjs verify|map <repo-id> <checkout>  or  score.cjs answers <repo-id> <answers.json>  [--json]");
  }
  const repo = loadRepo(id);
  if (command === "verify") {
    const result = verify(repo, target);
    console.log(json ? JSON.stringify(result, null, 1) : [...result.lines, ...result.problems.map((problem) => `PROBLEM ${problem}`), result.problems.length ? `FAIL: ${result.problems.length} problem(s)` : `PASS: ${result.lines.length} evidence lines found at ${repo.commit}`].join("\n"));
    return result.problems.length ? 1 : 0;
  }
  if (command === "map") {
    const card = scanCard(target);
    const result = { ...score(repo, Object.fromEntries(repo.questions.map((question) => [question.id, card]))), cardChars: card.length };
    console.log(json ? JSON.stringify(result, null, 1) : `${printScore(result, "answered by the scanner's card alone")}\n  card size: ${card.length} characters`);
    return 0;
  }
  const answers = JSON.parse(fs.readFileSync(target, "utf8"));
  const result = score(repo, answers);
  console.log(json ? JSON.stringify(result, null, 1) : printScore(result, "answers pass"));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

module.exports = { passes, verify, score, loadRepo };
