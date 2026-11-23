"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-readiness.cjs");
const { readiness, LEVELS } = require(SCRIPT);
const { CHECKS } = require(path.join(__dirname, "..", "scripts", "uca-senior-check.cjs"));

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-ready-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

// A small Express project that passes every Bronze and Silver check.
const GOOD = {
  "package.json": JSON.stringify({ name: "shop", scripts: { start: "node src/server.js", test: "node --test" }, engines: { node: ">=18" }, dependencies: { express: "4", "express-rate-limit": "7" } }),
  "package-lock.json": "{}",
  "README.md": "# Shop\n\nA small shop API that lists products and takes orders for a single store. It keeps data in PostgreSQL.\n\n## Run\n\nCopy .env.example to .env and set DATABASE_URL, then:\n\n```\nnpm install\nnpm start\n```\n\nRun the tests with `npm test`.\n",
  ".gitignore": "node_modules/\n.env\n",
  ".env.example": "DATABASE_URL=\n",
  "src/server.js": "const express = require('express');\nconst app = express();\napp.get('/health', (req, res) => res.json({ ok: true }));\napp.listen(process.env.PORT || 3000);\n",
  "src/db.js": "const url = process.env.DATABASE_URL;\nmodule.exports = { url };\n",
  "test/server.test.js": "require('node:test')('ok', () => {});\n"
};

test("every level check names a real Senior Bar check or an audit kind", () => {
  const ids = new Set(CHECKS.map((check) => check.id));
  const kinds = ["hardcoded-secret", "sql-injection", "missing-auth", "unbounded-read", "query-in-loop", "error-detail-leak", "no-rate-limit", "debug-mode", "cors-credentials-wildcard", "missing-index"];
  const used = LEVELS.flatMap((level) => level.checks);
  for (const id of used) assert.ok(id.startsWith("audit:") ? kinds.includes(id.slice(6)) : ids.has(id), id);
  assert.equal(new Set(used).size, used.length, "a check is in two levels");
  for (const kind of kinds) assert.ok(used.includes(`audit:${kind}`), `audit kind ${kind} is in no level`);
});

test("a tidy project reaches Gold; a planted secret fallback drops it to none", () => {
  const good = readiness(project(GOOD));
  assert.equal(good.level, "Gold", JSON.stringify(good.levels.map((level) => level.checks.filter((check) => check.status !== "pass" && check.status !== "na"))));
  assert.equal(good.passed, good.total);
  const bad = readiness(project({ ...GOOD, "src/auth.js": "const secret = process.env.JWT_SECRET || 'dev-secret';\nmodule.exports = secret;\n" }));
  assert.equal(bad.level, null);
  const failing = bad.levels[0].checks.find((check) => check.id === "audit:hardcoded-secret");
  assert.equal(failing.status, "fail");
  assert.match(failing.evidence[0], /src\/auth\.js:1 JWT_SECRET falls back/);
  assert.doesNotMatch(JSON.stringify(bad), /dev-secret/);
});

test("a 'needs a human' finding is listed to confirm, not counted as a failure", () => {
  const report = readiness(project({ ...GOOD, "package.json": JSON.stringify({ name: "shop", scripts: { start: "node src/server.js", test: "node --test" }, engines: { node: ">=18" }, dependencies: { express: "4" } }), "src/login.js": "const router = require('express').Router();\nrouter.post('/login', (req, res) => res.end());\nmodule.exports = router;\n" }));
  assert.equal(report.level, "Gold");
  assert.equal(report.toConfirm, 1);
  assert.equal(report.levels[2].checks.find((check) => check.id === "audit:no-rate-limit").status, "confirm");
  assert.ok(report.passed < report.total);
});

test("audit checks do not apply to a project with no JavaScript, TypeScript or Python", () => {
  const report = readiness(project({ "index.html": "<!doctype html><html lang=\"en\"><head><meta name=\"viewport\" content=\"width=device-width\"></head><body></body></html>\n" }));
  for (const level of report.levels) for (const check of level.checks.filter((item) => item.id.startsWith("audit:"))) assert.equal(check.status, "na", check.id);
});

test("--min exits 1 below the level asked for and 0 at or above it; the text never claims production readiness", () => {
  const root = project(GOOD);
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, root, ...args], { encoding: "utf8" });
  assert.equal(run("--min", "gold").status, 0);
  const bad = project({ ...GOOD, "src/q.js": "db.query(`SELECT * FROM t WHERE a = '${x}' LIMIT 1`);\n" });
  const out = spawnSync(process.execPath, [SCRIPT, bad, "--min", "bronze"], { encoding: "utf8" });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /Level reached: none yet/);
  assert.match(out.stdout, /not proof of production readiness/);
  assert.equal(run("--min", "platinum").status, 2);
});
