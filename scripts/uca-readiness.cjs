#!/usr/bin/env node
"use strict";

// Readiness levels: the Senior Bar checks and the audit check, grouped into Bronze, Silver and Gold.
//
//   node scripts/uca-readiness.cjs [project folder] [--json] [--min bronze|silver|gold] [--target <percent>] [--target-level bronze|silver|gold] [--require-target]
//
// The target (default: Silver and 80% of the checks that apply) is what a project built with the kit should reach
// before it is called done. The report shows the gap and the failing checks to fix first, lowest level first. It is a
// goal for the work, not a promise about the product. --require-target exits 1 below it.
//
// Bronze: safe to share. Silver: safe to show users. Gold: ready for production traffic.
// A level is reached when none of its checks, or the checks of the levels below it, fail. An audit finding marked
// "needs a human" does not fail a check: it is listed to confirm, because it may be fine. A check that does not apply
// (no HTML pages, no server code) is left out rather than counted as passed or failed.
// The percentage is checks passed out of checks that apply. It is a to-do list, not a measure of how ready a product
// is: a project can pass every check here and still be unsafe in ways a static reading cannot see.
//
// Read-only, like the two checks it runs. Exit codes: 0 done, 1 below --min, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");
const senior = require("./uca-senior-check.cjs");
const auditCheck = require("./uca-audit-check.cjs");
const wiringCheck = require("./uca-wiring-check.cjs");

const LEVELS = [
  {
    name: "Bronze",
    meaning: "safe to share",
    checks: ["structure.manifest", "docs.readme", "docs.run-instructions", "config.env-ignored", "secrets.none-in-source", "deploy.run-command", "audit:hardcoded-secret", "audit:sql-injection"]
  },
  {
    name: "Silver",
    meaning: "safe to show users",
    checks: ["tests.exist", "tests.command-declared", "deploy.lockfile", "config.env-example", "git.ignores-dependencies", "audit:missing-auth", "audit:error-detail-leak", "audit:debug-mode", "audit:cors-credentials-wildcard", "wiring:links", "wiring:ways", "a11y.html-lang", "a11y.viewport", "a11y.img-alt"]
  },
  {
    name: "Gold",
    meaning: "ready for production traffic",
    checks: ["deploy.runtime-declared", "structure.not-one-file", "audit:unbounded-read", "audit:query-in-loop", "audit:no-rate-limit", "audit:missing-index"]
  }
];

const AUDIT_TITLES = {
  "hardcoded-secret": "No secret falls back to a value written in the code",
  "sql-injection": "No SQL is built from strings",
  "missing-auth": "Write routes have the same auth as the other routes",
  "error-detail-leak": "Errors do not send internals to the client",
  "debug-mode": "Debug mode is not switched on in code",
  "cors-credentials-wildcard": "CORS does not allow every origin with credentials",
  "unbounded-read": "Reads have a filter or a limit",
  "query-in-loop": "No database query runs once per loop item",
  "no-rate-limit": "Login routes are rate limited",
  "missing-index": "Looked-up columns have an index"
};

const WIRING = {
  links: { title: "Links and routes lead somewhere", kinds: ["broken-link", "broken-anchor", "broken-route", "link-label"] },
  ways: { title: "Every page has a way in and a way out", kinds: ["dead-end", "orphan"] }
};

const DEFAULT_TARGET = { percent: 80, level: "Silver" };
const ORDER = ["Bronze", "Silver", "Gold"];

class UsageError extends Error {}

function readiness(root, target = DEFAULT_TARGET) {
  const bar = senior.evaluate(root);
  const found = auditCheck.audit(root);
  const wired = wiringCheck.wiring(root);
  const hasServerCode = found.scanned > 0 && found.findings !== undefined && hasCode(root);
  const byId = new Map(bar.checks.filter((item) => item.scored).map((item) => [item.id, item]));
  const result = (id) => {
    if (id.startsWith("wiring:")) {
      const { title, kinds } = WIRING[id.slice(7)];
      if (wired.pages === 0 && !wired.router) return { id, title, status: "na", evidence: ["no HTML pages and no React Router or Next.js routes"] };
      const hits = wired.findings.filter((finding) => kinds.includes(finding.kind));
      const certain = hits.filter((finding) => finding.confidence === "certain");
      const where = (list) => list.slice(0, 5).map((finding) => `${finding.file}:${finding.line} ${finding.what}`);
      if (certain.length) return { id, title, status: "fail", evidence: where(certain) };
      if (hits.length) return { id, title, status: "confirm", evidence: where(hits) };
      return { id, title, status: "pass", evidence: [] };
    }
    if (id.startsWith("audit:")) {
      const kind = id.slice(6);
      const hits = found.findings.filter((finding) => finding.kind === kind);
      const certain = hits.filter((finding) => finding.confidence === "certain");
      const where = (list) => list.slice(0, 5).map((finding) => `${finding.file}:${finding.line} ${finding.what}`);
      if (!hasServerCode) return { id, title: AUDIT_TITLES[kind], status: "na", evidence: ["no JavaScript, TypeScript or Python source to audit"] };
      if (certain.length) return { id, title: AUDIT_TITLES[kind], status: "fail", evidence: where(certain) };
      if (hits.length) return { id, title: AUDIT_TITLES[kind], status: "confirm", evidence: where(hits) };
      return { id, title: AUDIT_TITLES[kind], status: "pass", evidence: [] };
    }
    const item = byId.get(id);
    if (!item) return { id, title: id, status: "na", evidence: ["check not available"] };
    return { id, title: item.title, status: item.status === "pass" ? "pass" : item.status === "na" ? "na" : "fail", evidence: item.evidence };
  };
  const levels = LEVELS.map((level) => {
    const checks = level.checks.map(result);
    const applies = checks.filter((check) => check.status !== "na");
    return { name: level.name, meaning: level.meaning, checks, passed: applies.filter((check) => check.status === "pass").length, total: applies.length, failed: applies.filter((check) => check.status === "fail").length, toConfirm: applies.filter((check) => check.status === "confirm").length };
  });
  let reached = null;
  for (const level of levels) {
    if (level.failed > 0) break;
    reached = level.name;
  }
  const passed = levels.reduce((sum, level) => sum + level.passed, 0);
  const total = levels.reduce((sum, level) => sum + level.total, 0);
  // The gap to the target: first every failing check of the target level and below, then the lowest-level failures
  // until enough checks pass to reach the percentage. "To confirm" items are listed for a person, not counted.
  const failing = levels.flatMap((level) => level.checks.filter((check) => check.status === "fail").map((check) => ({ level: level.name, id: check.id, title: check.title })));
  const levelIndex = ORDER.indexOf(target.level);
  const needed = Math.max(0, Math.ceil((target.percent * total) / 100) - passed);
  const toDo = failing.filter((check) => ORDER.indexOf(check.level) <= levelIndex);
  for (const check of failing) if (toDo.length < needed && !toDo.includes(check)) toDo.push(check);
  const percentNow = total ? Math.round((passed / total) * 100) : null;
  const met = total > 0 && reached !== null && ORDER.indexOf(reached) >= levelIndex && (passed / total) * 100 >= target.percent;
  return {
    root: path.basename(root),
    target: { level: target.level, percent: target.percent, met, toDo },
    level: reached,
    toConfirm: levels.reduce((sum, level) => sum + level.toConfirm, 0),
    passed,
    total,
    percent: total ? Math.round((passed / total) * 100) : null,
    levels,
    note: "Checks passed out of checks that apply: a to-do list, not proof of production readiness. Static reading cannot see run-time problems or problems reached through helper functions."
  };
}

function hasCode(root) {
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 5000) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", ".agents", ".uca"].includes(entry.name)) stack.push(path.join(dir, entry.name));
      } else if (/\.([cm]?[jt]sx?|py)$/.test(entry.name)) return true;
    }
  }
  return false;
}

function render(report) {
  const mark = { pass: "ok  ", fail: "FAIL", confirm: "?   " };
  const lines = [`Readiness: ${report.root}`, ""];
  for (const level of report.levels) {
    lines.push(`${level.name} (${level.meaning}): ${level.passed} of ${level.total} passed${level.failed ? `, ${level.failed} failing` : ""}${level.toConfirm ? `, ${level.toConfirm} to confirm` : ""}`);
    for (const check of level.checks.filter((item) => item.status !== "na")) {
      lines.push(`  ${mark[check.status]} ${check.title}`);
      if (check.status !== "pass") for (const line of check.evidence.slice(0, 3)) lines.push(`         ${line}`);
    }
    lines.push("");
  }
  lines.push(report.level ? `Level reached: ${report.level}${report.toConfirm ? ` (${report.toConfirm} item(s) to confirm by a person)` : ""}` : "Level reached: none yet (a Bronze check is failing)");
  if (report.percent !== null) lines.push(`Checks passed: ${report.passed} of ${report.total} (${report.percent}%)`);
  const goal = `${report.target.level} and ${report.target.percent}% of checks`;
  if (report.total === 0) lines.push(`Target (${goal}): nothing to score`);
  else if (report.target.met) lines.push(`Target (${goal}): met`);
  else {
    lines.push(`Target (${goal}): not met yet. Fix these first, lowest level first:`);
    for (const item of report.target.toDo) lines.push(`  - [${item.level}] ${item.title}`);
  }
  lines.push(report.note);
  return lines.join("\n");
}

function main(argv) {
  let json = false;
  let min = null;
  let requireTarget = false;
  const target = { ...DEFAULT_TARGET };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") json = true;
    else if (arg === "--min") {
      min = String(argv[++index] || "").toLowerCase();
      if (!["bronze", "silver", "gold"].includes(min)) throw new UsageError("--min needs bronze, silver or gold.");
    } else if (arg === "--target") {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new UsageError("--target needs a percent from 0 to 100.");
      target.percent = value;
    } else if (arg === "--target-level") {
      const value = String(argv[++index] || "").toLowerCase();
      if (!["bronze", "silver", "gold"].includes(value)) throw new UsageError("--target-level needs bronze, silver or gold.");
      target.level = value[0].toUpperCase() + value.slice(1);
    } else if (arg === "--require-target") requireTarget = true;
    else if (arg.startsWith("-")) throw new UsageError(`Unknown option ${arg}. Usage: uca-readiness.cjs [project folder] [--json] [--min bronze|silver|gold] [--target <percent>] [--target-level bronze|silver|gold] [--require-target]`);
    else rest.push(arg);
  }
  if (rest.length > 1) throw new UsageError("Only one project folder can be given.");
  const root = path.resolve(rest[0] || ".");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new UsageError(`Not a folder: ${root}`);
  const report = readiness(root, target);
  console.log(json ? JSON.stringify(report, null, 1) : render(report));
  if (requireTarget && !report.target.met && report.total > 0) return 1;
  if (min) {
    const order = ["bronze", "silver", "gold"];
    const reached = report.level ? order.indexOf(report.level.toLowerCase()) : -1;
    if (reached < order.indexOf(min)) return 1;
  }
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

module.exports = { readiness, LEVELS };
