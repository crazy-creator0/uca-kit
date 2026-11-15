"use strict";

// Playbook P0.2: hostile and interrupted install, update and uninstall. The manifest is a file anyone working in the
// project can edit, so it is untrusted input. A run that fails halfway must be reported and must converge when re-run.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PACKAGE_ROOT = path.join(__dirname, "..");
const cli = require(path.join(PACKAGE_ROOT, "bin", "cli.cjs"));
const lifecycle = require(path.join(PACKAGE_ROOT, "bin", "lifecycle.cjs"));

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const manifestPath = (root) => path.join(root, ".uca", "manifest.json");
const manifestOf = (root) => JSON.parse(fs.readFileSync(manifestPath(root), "utf8"));
const setManifest = (root, edit) => {
  const manifest = manifestOf(root);
  edit(manifest);
  fs.writeFileSync(manifestPath(root), JSON.stringify(manifest, null, 2));
};
const install = (root) => cli.installKit({ packageRoot: PACKAGE_ROOT, projectRoot: root, platform: "generic", tier: "lite" });

function project(t) {
  const outer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uca-life-adv-")));
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }));
  const root = path.join(outer, "project");
  const outside = path.join(outer, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  return { root, outside };
}

// Makes one fs call fail for paths that end with `suffix`, the way a full disk or a locked file would.
function failOn(t, method, suffix) {
  const original = fs[method];
  fs[method] = function failing(...args) {
    const target = String(args[method === "copyFileSync" ? 1 : 0]);
    if (target.split(path.sep).join("/").endsWith(suffix)) {
      const error = new Error(`simulated failure writing ${suffix}`);
      error.code = "EIO";
      throw error;
    }
    return original.apply(this, args);
  };
  const restore = () => {
    fs[method] = original;
  };
  t.after(restore);
  return restore;
}

const trackedFiles = (root) => Object.keys(manifestOf(root).files).filter((name) => !name.startsWith(".uca/")).sort();

test("update that fails halfway converges when re-run: kit files are not mistaken for your edits", (t) => {
  const { root } = project(t);
  assert.equal(install(root).errors, 0);
  const [first, second, third] = trackedFiles(root);
  // Make three files look like an older kit version: unedited, but different from what this kit ships.
  setManifest(root, (manifest) => {
    for (const name of [first, second, third]) {
      fs.writeFileSync(path.join(root, name), `old version of ${name}\n`);
      manifest.files[name] = sha(`old version of ${name}\n`);
    }
  });
  const restore = failOn(t, "copyFileSync", second);
  const partial = lifecycle.update(root, PACKAGE_ROOT);
  restore();
  assert.equal(partial.errors.length, 1, "the failure must be reported");
  const again = lifecycle.update(root, PACKAGE_ROOT);
  assert.deepEqual(again.errors, []);
  assert.deepEqual(again.keptConflict, [], "files the kit itself wrote were treated as your edits");
  for (const name of [first, second, third]) {
    assert.equal(manifestOf(root).files[name], sha(fs.readFileSync(path.join(root, name))), `${name} is not tracked at its current content`);
  }
  const report = lifecycle.doctor(root, PACKAGE_ROOT);
  assert.ok(report.ok, report.problems.join("; "));
  assert.equal(report.counts.conflict || 0, 0);
  assert.equal(report.counts.modified || 0, 0);
});

test("a failed update still records the files it did write, so uninstall can remove them", (t) => {
  const { root } = project(t);
  assert.equal(install(root).errors, 0);
  const [first, second] = trackedFiles(root);
  setManifest(root, (manifest) => {
    for (const name of [first, second]) {
      fs.writeFileSync(path.join(root, name), "old\n");
      manifest.files[name] = sha("old\n");
    }
  });
  const restore = failOn(t, "copyFileSync", second);
  lifecycle.update(root, PACKAGE_ROOT);
  restore();
  assert.equal(manifestOf(root).files[first], sha(fs.readFileSync(path.join(root, first))), "the file that was written is not recorded");
});

test("an install that fails halfway converges when re-run", (t) => {
  const { root } = project(t);
  const victim = "AGENTS.md";
  const restore = failOn(t, "copyFileSync", victim);
  const partial = install(root);
  restore();
  assert.ok(partial.errors >= 1, "the failure must be reported");
  assert.equal(install(root).errors, 0);
  const report = lifecycle.doctor(root, PACKAGE_ROOT);
  assert.ok(report.ok, report.problems.join("; "));
  assert.ok(manifestOf(root).files[victim], `${victim} is not tracked after the re-run`);
});

test("an uninstall that fails halfway converges when re-run and leaves your files", (t) => {
  const { root } = project(t);
  assert.equal(install(root).errors, 0);
  fs.writeFileSync(path.join(root, "mine.txt"), "mine\n");
  const [, second] = trackedFiles(root);
  const restore = failOn(t, "unlinkSync", second);
  const partial = lifecycle.uninstall(root);
  restore();
  assert.ok(partial.unsafe.length + partial.errors.length >= 1, "the failure must be reported");
  assert.ok(fs.existsSync(manifestPath(root)), "the manifest must stay while files it lists are still installed");
  const again = lifecycle.uninstall(root);
  assert.deepEqual([...again.unsafe, ...again.errors], []);
  assert.equal(fs.existsSync(manifestPath(root)), false);
  assert.ok(fs.existsSync(path.join(root, "mine.txt")));
  assert.equal(fs.existsSync(path.join(root, second)), false);
});

test("a manifest edited to list your own file cannot make uninstall delete it", (t) => {
  const { root } = project(t);
  assert.equal(install(root).errors, 0);
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "app.js"), "my code\n");
  fs.writeFileSync(path.join(root, "README.md"), "# mine\n");
  setManifest(root, (manifest) => {
    manifest.files["src/app.js"] = sha("my code\n");
    manifest.files["README.md"] = sha("# mine\n");
  });
  const result = lifecycle.uninstall(root);
  assert.ok(fs.existsSync(path.join(root, "src", "app.js")), "your source file was deleted");
  assert.ok(fs.existsSync(path.join(root, "README.md")), "your README was deleted");
  assert.ok(result.unsafe.some((line) => line.startsWith("src/app.js")), "the refused path must be reported");
});

test("a manifest edited to list your own file cannot make update --prune delete it", (t) => {
  const { root } = project(t);
  assert.equal(install(root).errors, 0);
  fs.writeFileSync(path.join(root, "notes.md"), "my notes\n");
  setManifest(root, (manifest) => {
    manifest.files["notes.md"] = sha("my notes\n");
  });
  const result = lifecycle.update(root, PACKAGE_ROOT, { prune: true });
  assert.ok(fs.existsSync(path.join(root, "notes.md")), "your file was pruned");
  assert.ok(result.unsafe.some((line) => line.startsWith("notes.md")), "the refused path must be reported");
});

test("a linked .uca folder cannot make uninstall delete a file outside the project", (t) => {
  const { root, outside } = project(t);
  assert.equal(install(root).errors, 0);
  setManifest(root, (manifest) => {
    delete manifest.files[".uca/config.json"];
  });
  for (const name of fs.readdirSync(path.join(root, ".uca"))) fs.renameSync(path.join(root, ".uca", name), path.join(outside, name));
  fs.rmdirSync(path.join(root, ".uca"));
  try {
    fs.symlinkSync(outside, path.join(root, ".uca"), "dir");
  } catch {
    t.skip("this system does not allow symlinks");
    return;
  }
  let result;
  try {
    result = lifecycle.uninstall(root);
  } catch {
    result = null;
  }
  assert.ok(fs.existsSync(path.join(outside, "manifest.json")), "the manifest outside the project was deleted");
  if (result) assert.ok(result.unsafe.length + result.errors.length >= 1, "the refusal must be reported");
});

test("a file already matching the kit is adopted, not kept as your edit (a run killed before it saved the manifest)", (t) => {
  const { root } = project(t);
  assert.equal(install(root).errors, 0);
  const [name] = trackedFiles(root);
  // The kit file is on disk at the current version, but the manifest still has the hash of an older one.
  setManifest(root, (manifest) => {
    manifest.files[name] = sha("older kit version\n");
  });
  const result = lifecycle.update(root, PACKAGE_ROOT);
  assert.deepEqual(result.keptConflict, [], "a file identical to the kit was treated as your edit");
  assert.equal(manifestOf(root).files[name], sha(fs.readFileSync(path.join(root, name))));
});

test("doctor and update refuse a linked .uca folder instead of reading through it", (t) => {
  const { root, outside } = project(t);
  assert.equal(install(root).errors, 0);
  for (const name of fs.readdirSync(path.join(root, ".uca"))) fs.renameSync(path.join(root, ".uca", name), path.join(outside, name));
  fs.rmdirSync(path.join(root, ".uca"));
  try {
    fs.symlinkSync(outside, path.join(root, ".uca"), "dir");
  } catch {
    t.skip("this system does not allow symlinks");
    return;
  }
  const report = lifecycle.doctor(root, PACKAGE_ROOT);
  assert.equal(report.ok, false);
  assert.match(report.problems.join(" "), /symbolic-link/);
  assert.throws(() => lifecycle.update(root, PACKAGE_ROOT), /cannot be used/);
});
