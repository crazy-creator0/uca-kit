"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCORE = path.join(__dirname, "..", "benchmarks", "project-questions", "score.cjs");
const { passes, verify, score } = require(SCORE);
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "benchmarks", "project-questions", "questions.json"), "utf8"));
const gitAvailable = spawnSync("git", ["--version"]).status === 0;

test("questions.json: pinned repos, unique ids, valid patterns, evidence for every question", () => {
  assert.equal(data.repos.length, 3);
  const ids = new Set();
  for (const repo of data.repos) {
    assert.match(repo.url, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    assert.match(repo.commit, /^[0-9a-f]{7,40}$/);
    assert.equal(repo.questions.length, 10, repo.id);
    for (const question of repo.questions) {
      assert.ok(!ids.has(question.id), `duplicate ${question.id}`);
      ids.add(question.id);
      assert.ok(question.ask.endsWith("?"), question.id);
      assert.ok(question.need.length > 0 && question.need.every((group) => group.length > 0), question.id);
      for (const group of question.need) for (const pattern of group) assert.doesNotThrow(() => new RegExp(pattern, "i"), `${question.id}: ${pattern}`);
      assert.ok(question.evidence.length > 0 && question.evidence.every((item) => item.file && item.has), question.id);
    }
  }
});

test("an answer passes only when every group matches", () => {
  const question = { need: [["postgres"], ["sqlmodel", "sql model"]] };
  assert.equal(passes(question, "PostgreSQL through SQLModel").pass, true);
  assert.deepEqual(passes(question, "PostgreSQL with SQLAlchemy").missing, ["sqlmodel | sql model"]);
  assert.equal(passes(question, "").pass, false);
  assert.equal(passes(question, undefined).pass, false);
});

test("number questions need the subject near the number, so a stray digit does not pass", () => {
  const koa = data.repos.find((repo) => repo.id === "koa");
  const k10 = koa.questions.find((question) => question.id === "K10");
  assert.equal(passes(k10, "The default subdomainOffset is 2.").pass, true);
  assert.equal(passes(k10, "- lib/application.js (depth 2) imports ...\n- subdomainOffset is read from options").pass, false);
});

test("score counts passes and treats a missing answer as a fail", () => {
  const repo = { id: "demo", questions: [{ id: "Q1", ask: "a?", need: [["yes"]] }, { id: "Q2", ask: "b?", need: [["yes"]] }] };
  const result = score(repo, { Q1: "yes" });
  assert.equal(result.passed, 1);
  assert.equal(result.rows[1].pass, false);
});

test("verify finds evidence lines and reports a moved commit and a missing line", { skip: !gitAvailable }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-pq-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "main.js"), "const a = 1;\napp.listen(3000);\n");
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const repo = { commit: head.slice(0, 12), questions: [{ id: "Q1", evidence: [{ file: "src/main.js", has: "app.listen(3000)" }] }] };
  assert.deepEqual(verify(repo, root), { problems: [], lines: ["Q1: src/main.js:2"] });
  const stale = verify({ ...repo, commit: "0000000", questions: [{ id: "Q1", evidence: [{ file: "src/main.js", has: "app.listen(8080)" }] }] }, root);
  assert.equal(stale.problems.length, 2);
  assert.match(stale.problems[0], /answer keys are for 0000000/);
  assert.match(stale.problems[1], /not found in src\/main\.js/);
});

test("the command line refuses unknown commands and repo ids", () => {
  const run = (...args) => spawnSync(process.execPath, [SCORE, ...args], { encoding: "utf8" });
  assert.equal(run("nope", "koa", ".").status, 2);
  assert.match(run("map", "no-such-repo", ".").stderr, /Unknown repo id/);
});
