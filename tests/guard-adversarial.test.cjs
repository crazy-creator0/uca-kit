"use strict";

// Playbook P0.1: hostile inputs for the handoff guard. A model working in the project can edit any file,
// including .uca/state.json, and can create symlinks. None of that may make the guard read, write or delete
// outside the project, and a broken state may never end in a success exit code.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-guard.cjs");
const OK = "process.exit(0)";
const FAIL = 'console.error("TypeError: broken"); process.exit(1)';
const MODELS = [{ name: "small", tier: "lite" }, { name: "large", tier: "full" }];

// An outer folder holds the project and a "victim" area beside it, so an escape is easy to see.
function setup() {
  const outer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uca-guard-adv-")));
  const root = path.join(outer, "project");
  const outside = path.join(outer, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, "a.txt"), "one\n");
  fs.writeFileSync(path.join(root, "b.txt"), "two\n");
  fs.mkdirSync(path.join(root, ".uca"));
  fs.writeFileSync(path.join(root, ".uca", "config.json"), JSON.stringify({ models: MODELS }));
  return { outer, root, outside, done: () => fs.rmSync(outer, { recursive: true, force: true }) };
}
const run = (root, code) => spawnSync(process.execPath, [SCRIPT, "run", "--", process.execPath, "-e", code], { cwd: root, encoding: "utf8", timeout: 60_000 });
const guardCmd = (root, args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: "utf8", timeout: 60_000 });
const statePath = (root) => path.join(root, ".uca", "state.json");
const readState = (root) => JSON.parse(fs.readFileSync(statePath(root), "utf8"));
const writeState = (root, value) => fs.writeFileSync(statePath(root), JSON.stringify(value));

function symlinkOrSkip(t, target, where, type) {
  try {
    fs.symlinkSync(target, where, type);
    return true;
  } catch {
    t.skip("this system does not allow symlinks");
    return false;
  }
}

test("a tampered state file cannot make a passing run delete a file outside the project", () => {
  const { outer, root, done } = setup();
  try {
    const victim = path.join(outer, "victim.txt");
    fs.writeFileSync(victim, "keep me\n");
    assert.equal(run(root, OK).status, 0);
    const saved = readState(root);
    saved.lastPass.files["../../../victim.txt"] = "0".repeat(40);
    writeState(root, saved);
    const result = run(root, OK);
    assert.ok(fs.existsSync(victim), `victim was deleted (exit ${result.status}): ${result.stdout}${result.stderr}`);
    assert.notEqual(result.status, 0, "a state file with a path that leaves the project must not end in success");
  } finally {
    done();
  }
});

test("a tampered state file cannot make a passing run delete a project file through the mirror", () => {
  const { root, done } = setup();
  try {
    assert.equal(run(root, OK).status, 0);
    const saved = readState(root);
    saved.lastPass.files["../../b.txt"] = "0".repeat(40);
    writeState(root, saved);
    run(root, OK);
    assert.ok(fs.existsSync(path.join(root, "b.txt")), "b.txt in the project was deleted");
  } finally {
    done();
  }
});

test("a dangling symlink in place of a tracked file cannot make a restore write outside", (t) => {
  const { root, outside, done } = setup();
  try {
    assert.equal(run(root, OK).status, 0);
    fs.rmSync(path.join(root, "a.txt"));
    if (!symlinkOrSkip(t, path.join(outside, "planted.txt"), path.join(root, "a.txt"), "file")) return;
    const result = run(root, FAIL);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.deepEqual(fs.readdirSync(outside), [], "restore wrote through a dangling symlink");
  } finally {
    done();
  }
});

test("a symlinked .uca folder is refused, so reset cannot delete outside the project", (t) => {
  const { root, outside, done } = setup();
  try {
    fs.mkdirSync(path.join(outside, "passing"));
    fs.writeFileSync(path.join(outside, "passing", "keep.txt"), "keep\n");
    fs.writeFileSync(path.join(outside, "state.json"), "{}");
    fs.copyFileSync(path.join(root, ".uca", "config.json"), path.join(outside, "config.json"));
    fs.rmSync(path.join(root, ".uca"), { recursive: true });
    if (!symlinkOrSkip(t, outside, path.join(root, ".uca"), "dir")) return;
    const reset = guardCmd(root, ["reset"]);
    assert.ok(fs.existsSync(path.join(outside, "passing", "keep.txt")), "reset deleted files outside the project");
    assert.ok(fs.existsSync(path.join(outside, "state.json")), "reset deleted a file outside the project");
    assert.equal(reset.status, 2, reset.stdout + reset.stderr);
    const passing = run(root, OK);
    assert.equal(passing.status, 2, passing.stdout + passing.stderr);
    assert.deepEqual(fs.readdirSync(path.join(outside, "passing")), ["keep.txt"], "run wrote through the symlinked .uca");
  } finally {
    done();
  }
});

test("a symlinked mirror folder cannot make a passing run copy project files outside", (t) => {
  const { root, outside, done } = setup();
  try {
    assert.equal(run(root, OK).status, 0);
    fs.rmSync(path.join(root, ".uca", "passing"), { recursive: true });
    if (!symlinkOrSkip(t, outside, path.join(root, ".uca", "passing"), "dir")) return;
    fs.writeFileSync(path.join(root, "a.txt"), "changed\n");
    run(root, OK);
    assert.deepEqual(fs.readdirSync(outside), [], "project files were copied outside");
  } finally {
    done();
  }
});

test("a symlink inside the mirror cannot make a passing run write outside", (t) => {
  const { root, outside, done } = setup();
  try {
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "c.txt"), "three\n");
    assert.equal(run(root, OK).status, 0);
    fs.rmSync(path.join(root, ".uca", "passing", "src"), { recursive: true });
    if (!symlinkOrSkip(t, outside, path.join(root, ".uca", "passing", "src"), "dir")) return;
    fs.writeFileSync(path.join(root, "src", "c.txt"), "changed\n");
    run(root, OK);
    assert.deepEqual(fs.readdirSync(outside), [], "a project file was copied through the planted link");
  } finally {
    done();
  }
});

test("a symlinked backup folder cannot make a snapshot write outside", (t) => {
  const { root, outside, done } = setup();
  try {
    assert.equal(run(root, OK).status, 0);
    if (!symlinkOrSkip(t, outside, path.join(root, ".uca", "backup"), "dir")) return;
    fs.writeFileSync(path.join(root, "a.txt"), "changed\n");
    run(root, FAIL);
    assert.deepEqual(fs.readdirSync(outside), [], "the snapshot was written outside");
  } finally {
    done();
  }
});

test("a state file whose last passing state has the wrong shape is refused, never a success", () => {
  const broken = [
    { lastPass: "garbage" },
    { lastPass: { at: "x", files: "not an object", mirror: true } },
    { lastPass: { at: "x", files: { "a.txt": 42 }, mirror: true } },
    { lastPass: { at: "x", files: { "/etc/passwd": "0".repeat(40) }, mirror: true } },
    { baseline: { at: "x", files: ["a.txt"] } },
    { modelIndex: -1 }
  ];
  for (const patch of broken) {
    const { root, done } = setup();
    try {
      assert.equal(run(root, OK).status, 0);
      writeState(root, { ...readState(root), ...patch });
      const before = fs.readFileSync(statePath(root), "utf8");
      const result = run(root, OK);
      assert.equal(result.status, 2, `${JSON.stringify(patch)} → exit ${result.status}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /unexpected shape/);
      assert.equal(fs.readFileSync(statePath(root), "utf8"), before, "the broken state was overwritten");
    } finally {
      done();
    }
  }
});

test("a secret canary in a secret file never reaches HANDOFF.md, the mirror or the backup", () => {
  const { root, done } = setup();
  const canary = "TEST_SECRET_DO_NOT_LEAK_91f3a7c2";
  try {
    fs.writeFileSync(path.join(root, ".env"), `TOKEN=${canary}\n`);
    fs.mkdirSync(path.join(root, "config"));
    fs.writeFileSync(path.join(root, "config", "secrets.json"), JSON.stringify({ key: canary }));
    assert.equal(run(root, OK).status, 0);
    fs.writeFileSync(path.join(root, ".env"), `TOKEN=${canary}2\n`);
    fs.writeFileSync(path.join(root, "a.txt"), "changed\n");
    const result = run(root, `console.error("TOKEN=${canary}"); process.exit(1)`);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.ok(!result.stdout.includes(canary) && !result.stderr.includes(canary), "canary printed");
    const found = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full !== path.join(root, ".env") && full !== path.join(root, "config", "secrets.json") && fs.readFileSync(full, "utf8").includes(canary)) found.push(path.relative(root, full));
      }
    };
    walk(root);
    assert.deepEqual(found, [], "canary copied into the guard's own files");
  } finally {
    done();
  }
});

// The copy helper has overlapping defences; each one is tested on its own here, so removing one makes a test fail.
const { copyInto } = require(SCRIPT);

test("copy helper: a dangling link at the destination is refused, not replaced or followed", (t) => {
  const { root, outside, done } = setup();
  try {
    if (!symlinkOrSkip(t, path.join(outside, "planted.txt"), path.join(root, "link.txt"), "file")) return;
    assert.throws(() => copyInto(root, path.join(root, "a.txt"), path.join(root, "link.txt")), /not a regular file/);
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.ok(fs.lstatSync(path.join(root, "link.txt")).isSymbolicLink(), "the link should be left for the person to inspect");
  } finally {
    done();
  }
});

test("copy helper: a folder that resolves outside is refused before any folder is created", (t) => {
  const { root, outside, done } = setup();
  try {
    if (!symlinkOrSkip(t, outside, path.join(root, "out"), "dir")) return;
    assert.throws(() => copyInto(root, path.join(root, "a.txt"), path.join(root, "out", "new", "a.txt")), /outside the project/);
    assert.deepEqual(fs.readdirSync(outside), [], "a folder was created outside before the check");
  } finally {
    done();
  }
});

test("copy helper: an existing regular file is replaced whole and no temporary file is left", () => {
  const { root, done } = setup();
  try {
    copyInto(root, path.join(root, "a.txt"), path.join(root, "b.txt"));
    assert.equal(fs.readFileSync(path.join(root, "b.txt"), "utf8"), "one\n");
    assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith(".tmp")), []);
  } finally {
    done();
  }
});
