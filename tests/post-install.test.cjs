"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const cli = require(path.join(root, "bin", "cli.cjs"));
const lifecycle = require(path.join(root, "bin", "lifecycle.cjs"));
const CLI = path.join(root, "bin", "cli.cjs");

function withProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-verify-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function init(dir, args = []) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [CLI, "init", dir, "--platform", "generic", "--tier", "lite", "--yes", ...args], { encoding: "utf8", env });
}
const install = (dir) => cli.installKit({ packageRoot: root, projectRoot: dir, platform: "generic", tier: "lite" });

test("a clean install ends with a passing verification", () => {
  withProject((dir) => {
    const run = init(dir);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Verification: PASS\. \d+ planned files present, manifest valid/);
  });
});

test("your own file in the way is kept byte for byte and reported", () => {
  withProject((dir) => {
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "my own rules\n");
    const run = init(dir);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Verification: PASS.*1 of your own file\(s\) kept untouched/);
    assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), "my own rules\n");
  });
});

test("a planned file that is not on disk is reported by name", () => {
  withProject((dir) => {
    assert.equal(install(dir).errors, 0);
    const manifestPath = path.join(dir, ".uca", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const victim = ".agents/CORE.md";
    fs.rmSync(path.join(dir, victim));
    delete manifest.files[victim];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = lifecycle.verifyInstall(dir, root, {});
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((problem) => problem.includes(`Not installed: ${victim}`)), result.problems.join("\n"));
  });
});

test("a tracked file deleted after install is reported as missing", () => {
  withProject((dir) => {
    install(dir);
    fs.rmSync(path.join(dir, ".agents", "CORE.md"));
    const result = lifecycle.verifyInstall(dir, root, {});
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((problem) => problem.includes("Missing: .agents/CORE.md")));
  });
});

test("a manifest that is missing or broken fails verification", () => {
  withProject((dir) => {
    install(dir);
    fs.writeFileSync(path.join(dir, ".uca", "manifest.json"), "not json");
    assert.equal(lifecycle.verifyInstall(dir, root, {}).ok, false);
    fs.rmSync(path.join(dir, ".uca", "manifest.json"));
    assert.equal(lifecycle.verifyInstall(dir, root, {}).ok, false);
  });
});

test("a file that changed without the installer recording it is caught", () => {
  withProject((dir) => {
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "my own rules\n");
    const before = lifecycle.snapshotBefore({ packageRoot: root, projectRoot: dir, platform: "generic", profile: null, tier: "lite" });
    assert.ok(before["AGENTS.md"]);
    install(dir);
    assert.equal(lifecycle.verifyInstall(dir, root, before).ok, true);
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "changed behind your back\n");
    const result = lifecycle.verifyInstall(dir, root, before);
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((problem) => problem.includes("Changed without being recorded: AGENTS.md")));
    fs.rmSync(path.join(dir, "AGENTS.md"));
    assert.ok(lifecycle.verifyInstall(dir, root, before).problems.some((problem) => problem.includes("now gone: AGENTS.md")));
  });
});

test("a dry run verifies nothing and writes nothing", () => {
  withProject((dir) => {
    const run = init(dir, ["--dry-run"]);
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /Verification:/);
    assert.equal(fs.existsSync(path.join(dir, ".uca")), false);
  });
});

test("a failed verification exits 1, lists what is wrong, and deletes nothing", () => {
  withProject((dir) => {
    // A file where a folder is needed makes the install fail partway; the verdict must say so.
    fs.writeFileSync(path.join(dir, ".agents"), "a file, not a folder\n");
    const run = init(dir);
    assert.notEqual(run.status, 0);
    assert.equal(fs.readFileSync(path.join(dir, ".agents"), "utf8"), "a file, not a folder\n");
    assert.doesNotMatch(run.stdout, /Verification: PASS/);
  });
});
