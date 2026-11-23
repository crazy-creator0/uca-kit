"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCORE = path.join(__dirname, "..", "benchmarks", "audit-planted", "score.cjs");
const { score, loadKey } = require(SCORE);
const key = loadKey();

test("every planted problem and decoy points at exactly one line, with a known kind", () => {
  assert.equal(key.planted.length, 13);
  assert.equal(key.decoys.length, 12);
  const ids = new Set();
  for (const item of [...key.planted, ...key.decoys]) {
    assert.ok(!ids.has(item.id), `duplicate ${item.id}`);
    ids.add(item.id);
    assert.ok(item.lines.length >= 1, `${item.id}: "${item.has}" not found in ${item.file}`);
    if (item.id !== "D12") assert.equal(item.lines.length, 1, `${item.id} is ambiguous: lines ${item.lines.join(", ")}`);
  }
  for (const item of key.planted) {
    assert.ok(key.kinds.includes(item.kind), `${item.id}: unknown kind ${item.kind}`);
    assert.ok(item.abuse.length > 20 && item.fix.length > 10, `${item.id} needs abuse and fix text`);
  }
});

test("no decoy sits within the matching window of a planted problem in the same file", () => {
  for (const decoy of key.decoys) {
    for (const item of key.planted.filter((planted) => planted.file === decoy.file)) {
      for (const line of decoy.lines) assert.ok(Math.abs(line - item.lines[0]) > 1, `${decoy.id} (line ${line}) is too close to ${item.id} (line ${item.lines[0]})`);
    }
  }
});

test("the planted apps are syntactically valid JavaScript and Python", () => {
  const root = path.join(__dirname, "..", "benchmarks", "audit-planted");
  for (const file of ["express-shop/src/server.js", "express-shop/src/auth.js", "express-shop/src/db.js", "express-shop/src/routes/users.js", "express-shop/src/routes/orders.js"]) {
    assert.equal(spawnSync(process.execPath, ["--check", path.join(root, file)]).status, 0, file);
  }
  const python = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
  if (python) for (const file of ["app/main.py", "app/models.py", "app/db.py"]) {
    const out = spawnSync(python, ["-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", path.join(root, "fastapi-notes", file)]);
    assert.equal(out.status, 0, `${file}: ${out.stderr}`);
  }
});

test("scoring: kind, file and a line within 1 must all match; misses, false alarms and decoy hits are counted", () => {
  const result = score([
    { kind: "query-in-loop", file: "express-shop/src/routes/orders.js", line: 19 },
    { kind: "sql-injection", file: "fastapi-notes/app/main.py", line: 30 },
    { kind: "sql-injection", file: "fastapi-notes/app/main.py", line: 36 },
    { kind: "missing-auth", file: "express-shop/src/auth.js", line: 3 },
    { kind: "unbounded-read", file: "express-shop/src/routes/orders.js", line: 18 }
  ], key);
  assert.equal(result.found, 2);
  assert.equal(result.missed.length, 11);
  assert.equal(result.falseAlarms.length, 3);
  assert.equal(result.decoyHits, 2);
  assert.deepEqual(result.falseAlarms.map((alarm) => alarm.decoy), ["D07", null, "D12"]);
});

test("the same planted problem reported twice counts once", () => {
  const twice = [{ kind: "hardcoded-secret", file: "express-shop/src/auth.js", line: 3 }, { kind: "hardcoded-secret", file: "express-shop/src/auth.js", line: 3 }];
  assert.equal(score(twice, key).found, 1);
});

test("the command line rejects malformed findings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-audit-"));
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, JSON.stringify([{ kind: "sql-injection", file: "x.js" }]));
  assert.equal(spawnSync(process.execPath, [SCORE, bad], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCORE], { encoding: "utf8" }).status, 2);
});
