"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PACKAGE_ROOT = path.join(__dirname, "..");
const cli = require(path.join(PACKAGE_ROOT, "bin", "cli.cjs"));
const lifecycle = require(path.join(PACKAGE_ROOT, "bin", "lifecycle.cjs"));

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (root, relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (root, relative) => fs.existsSync(path.join(root, relative));
const manifestOf = (root) => JSON.parse(read(root, ".uca/manifest.json"));
const setManifest = (root, edit) => {
  const manifest = manifestOf(root);
  edit(manifest);
  fs.writeFileSync(path.join(root, ".uca/manifest.json"), JSON.stringify(manifest, null, 2));
};

function project(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-life-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (options.before) options.before(root);
  if (options.install !== false) {
    const summary = cli.installKit({ packageRoot: PACKAGE_ROOT, projectRoot: root, platform: "generic", tier: "lite", ...(options.installOptions || {}) });
    assert.equal(summary.errors, 0);
  }
  return root;
}

async function exec(root, args) {
  const out = [];
  const err = [];
  const code = await lifecycle.run([...args.slice(0, 1), root, ...args.slice(1)], { packageRoot: PACKAGE_ROOT, out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

// Pretend the kit changed: the project holds an older version of a file that the user never edited.
function makeOutdated(root, relative, oldContent) {
  fs.writeFileSync(path.join(root, relative), oldContent);
  setManifest(root, (manifest) => {
    manifest.files[relative] = sha(oldContent);
  });
}

test("install records a hash for every file it wrote, and only those", (t) => {
  const root = project(t);
  const manifest = manifestOf(root);
  assert.equal(manifest.schema, 1);
  assert.deepEqual([manifest.platform, manifest.tier, manifest.profile], ["generic", "lite", null]);
  assert.ok(Object.keys(manifest.files).length > 5);
  for (const [relative, hash] of Object.entries(manifest.files)) assert.equal(sha(fs.readFileSync(path.join(root, relative))), hash, relative);
  assert.ok(manifest.files[".uca/config.json"], "the tier config is tracked");
  assert.equal(manifest.files[".uca/manifest.json"], undefined);
});

test("a dry run writes no manifest", (t) => {
  const root = project(t, { install: false });
  cli.installKit({ packageRoot: PACKAGE_ROOT, projectRoot: root, platform: "generic", tier: "lite", dryRun: true });
  assert.equal(exists(root, ".uca"), false);
});

test("a file the user already had is not tracked unless it is identical to the kit's", (t) => {
  const reference = project(t);
  const sameFile = Object.keys(manifestOf(reference).files).find((name) => name.endsWith("SKILL.md"));
  const identical = fs.readFileSync(path.join(reference, sameFile));
  const root = project(t, {
    before: (dir) => {
      fs.writeFileSync(path.join(dir, "AGENTS.md"), "my own rules\n");
      fs.mkdirSync(path.dirname(path.join(dir, sameFile)), { recursive: true });
      fs.writeFileSync(path.join(dir, sameFile), identical);
    }
  });
  const manifest = manifestOf(root);
  assert.equal(manifest.files["AGENTS.md"], undefined, "user content must not be adopted");
  assert.equal(read(root, "AGENTS.md"), "my own rules\n");
  assert.equal(manifest.files[sameFile], sha(identical), "identical content is adopted");
});

test("doctor: a fresh install is healthy", async (t) => {
  const root = project(t);
  const result = await exec(root, ["doctor"]);
  assert.equal(result.code, 0, result.out + result.err);
  assert.match(result.out, /looks healthy/);
  assert.match(result.out, /tier lite/);
});

test("doctor: an edited file is a note, a deleted file is a problem", async (t) => {
  const root = project(t);
  const files = Object.keys(manifestOf(root).files).filter((name) => name.endsWith("SKILL.md"));
  fs.appendFileSync(path.join(root, files[0]), "\nmy note\n");
  let result = await exec(root, ["doctor"]);
  assert.equal(result.code, 0);
  assert.match(result.out, /edited by you/);
  fs.rmSync(path.join(root, files[1]));
  result = await exec(root, ["doctor"]);
  assert.equal(result.code, 1);
  assert.match(result.out, new RegExp(`Missing: ${files[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("doctor: no manifest, a corrupt manifest and a config that disagrees are all reported", async (t) => {
  const none = project(t, { install: false });
  let result = await exec(none, ["doctor"]);
  assert.equal(result.code, 1);
  assert.match(result.out, /not tracked/);

  const corrupt = project(t);
  fs.writeFileSync(path.join(corrupt, ".uca/manifest.json"), "{not json");
  result = await exec(corrupt, ["doctor"]);
  assert.equal(result.code, 1);
  assert.match(result.out, /unusable/);

  const mismatch = project(t);
  fs.writeFileSync(path.join(mismatch, ".uca/config.json"), '{"tier":"full"}\n');
  result = await exec(mismatch, ["doctor", "--json"]);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.out).problems.join(" "), /says tier "full"/);
});

test("a manifest that points outside the project is rejected and nothing is touched", async (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "uca-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "precious.txt"), "keep me");
  for (const bad of ["../precious.txt", "/etc/passwd", "a/../../x", "C:\\x", ".uca/manifest.json"]) {
    const root = project(t);
    setManifest(root, (manifest) => {
      manifest.files[bad] = sha("keep me");
    });
    for (const command of [["doctor"], ["diff"], ["update"], ["uninstall", "--yes"]]) {
      const result = await exec(root, command);
      assert.equal(result.code, 1, `${command.join(" ")} with ${bad}: ${result.out}${result.err}`);
    }
    assert.equal(fs.readFileSync(path.join(outside, "precious.txt"), "utf8"), "keep me");
    assert.ok(exists(root, "AGENTS.md"), "a bad manifest must not lead to any deletion");
  }
});

test("a manifest with the wrong shape is rejected", () => {
  for (const [name, edit] of [
    ["schema", (m) => { m.schema = 2; }],
    ["platform", (m) => { m.platform = "nope"; }],
    ["tier", (m) => { m.tier = "huge"; }],
    ["hash", (m) => { m.files["AGENTS.md"] = "abc"; }],
    ["files", (m) => { m.files = []; }]
  ]) {
    const manifest = { schema: 1, platform: "generic", tier: "lite", profile: null, files: { "AGENTS.md": sha("x") } };
    edit(manifest);
    assert.ok(lifecycle.readManifest, name);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-shape-"));
    fs.mkdirSync(path.join(dir, ".uca"));
    fs.writeFileSync(path.join(dir, ".uca/manifest.json"), JSON.stringify(manifest));
    assert.equal(lifecycle.readManifest(dir).status, "invalid", name);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("diff lists each kind of difference and changes nothing", async (t) => {
  const root = project(t);
  const files = Object.keys(manifestOf(root).files).filter((name) => name.endsWith("SKILL.md"));
  makeOutdated(root, files[0], "older version of the file\n");
  fs.appendFileSync(path.join(root, files[1]), "\nmy edit\n");
  fs.writeFileSync(path.join(root, files[2]), "edited and also outdated\n");
  setManifest(root, (manifest) => {
    manifest.files[files[2]] = sha("an even older version\n");
  });
  fs.rmSync(path.join(root, files[3]));
  const before = fs.readFileSync(path.join(root, files[0]), "utf8");
  const result = await exec(root, ["diff", "--json"]);
  assert.equal(result.code, 0);
  const states = Object.fromEntries(JSON.parse(result.out).map((row) => [row.path, row.state]));
  assert.equal(states[files[0]], "outdated");
  assert.equal(states[files[1]], "modified");
  assert.equal(states[files[2]], "conflict");
  assert.equal(states[files[3]], "missing");
  assert.equal(fs.readFileSync(path.join(root, files[0]), "utf8"), before, "diff must not write");
  assert.match((await exec(root, ["diff"])).out, /outdated\s+\S+ — would be updated/);
});

test("update refreshes unedited files and keeps edited ones", async (t) => {
  const root = project(t);
  const files = Object.keys(manifestOf(root).files).filter((name) => name.endsWith("SKILL.md"));
  const current = fs.readFileSync(path.join(PACKAGE_ROOT, ".agents/lite", path.basename(path.dirname(files[0])), "SKILL.md"), "utf8");
  makeOutdated(root, files[0], "older version\n");
  fs.appendFileSync(path.join(root, files[1]), "\nmy edit\n");
  const edited = read(root, files[1]);
  const result = await exec(root, ["update"]);
  assert.equal(result.code, 0, result.out + result.err);
  assert.equal(read(root, files[0]), current, "unedited file is refreshed");
  assert.equal(read(root, files[1]), edited, "edited file is kept");
  assert.equal(manifestOf(root).files[files[0]], sha(current));
  assert.match(result.out, /Kept: edited by you/);
  assert.equal((await exec(root, ["diff", "--json"])).out.includes(files[0]), false, "nothing outdated remains");
});

test("update keeps a file you edited when the kit also changed it, unless --force, which saves your version first", async (t) => {
  const root = project(t);
  const file = Object.keys(manifestOf(root).files).find((name) => name.endsWith("SKILL.md"));
  fs.writeFileSync(path.join(root, file), "my version\n");
  setManifest(root, (manifest) => {
    manifest.files[file] = sha("an older kit version\n");
  });
  let result = await exec(root, ["update"]);
  assert.equal(read(root, file), "my version\n");
  assert.match(result.out, /use --force/);
  result = await exec(root, ["update", "--dry-run", "--force"]);
  assert.equal(read(root, file), "my version\n", "dry run changes nothing");
  assert.equal(exists(root, ".uca/backup"), false);
  result = await exec(root, ["update", "--force"]);
  assert.notEqual(read(root, file), "my version\n");
  const backups = fs.readdirSync(path.join(root, ".uca/backup"));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(root, ".uca/backup", backups[0], file), "utf8"), "my version\n");
});

test("update adds files the kit now ships, but never over a file of the user's", async (t) => {
  const root = project(t);
  const files = Object.keys(manifestOf(root).files).filter((name) => name.endsWith("SKILL.md"));
  fs.rmSync(path.join(root, files[0]));
  setManifest(root, (manifest) => {
    delete manifest.files[files[0]];
    delete manifest.files[files[1]];
  });
  fs.writeFileSync(path.join(root, files[1]), "the user's own file\n");
  const result = await exec(root, ["update"]);
  assert.equal(result.code, 0);
  assert.ok(exists(root, files[0]), "the missing shipped file is added back");
  assert.equal(read(root, files[1]), "the user's own file\n");
  assert.match(result.out, /your own file is in the way/);
});

test("update deletes files the kit no longer ships only with --prune, and only if unedited", async (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, "retired.md"), "old kit file\n");
  fs.writeFileSync(path.join(root, "retired-edited.md"), "edited\n");
  setManifest(root, (manifest) => {
    manifest.files["retired.md"] = sha("old kit file\n");
    manifest.files["retired-edited.md"] = sha("what the kit wrote\n");
  });
  let result = await exec(root, ["update"]);
  assert.ok(exists(root, "retired.md"));
  assert.match(result.out, /use --prune/);
  result = await exec(root, ["update", "--prune"]);
  assert.equal(exists(root, "retired.md"), false);
  assert.equal(read(root, "retired-edited.md"), "edited\n", "an edited file is never pruned");
  assert.equal(manifestOf(root).files["retired-edited.md"], undefined, "and is no longer tracked");
});

test("update does not restore a file you deleted", async (t) => {
  const root = project(t);
  const file = Object.keys(manifestOf(root).files).find((name) => name.endsWith("SKILL.md"));
  fs.rmSync(path.join(root, file));
  const result = await exec(root, ["update"]);
  assert.equal(exists(root, file), false);
  assert.match(result.out, /Not restored: deleted by you/);
});

test("update and uninstall refuse to write through a symlinked folder", async (t) => {
  if (process.platform === "win32") return t.skip("symlinks need privileges on Windows");
  const root = project(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "uca-link-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const relative = Object.keys(manifestOf(root).files).find((name) => name.startsWith(".agents/") && name.endsWith("SKILL.md"));
  const folder = relative.split("/")[0];
  const moved = path.join(outside, folder);
  fs.renameSync(path.join(root, folder), moved);
  fs.symlinkSync(moved, path.join(root, folder), "dir");
  const survivors = fs.readdirSync(moved, { recursive: true }).length;
  for (const command of [["update", "--force", "--prune"], ["uninstall", "--yes"]]) {
    const result = await exec(root, command);
    assert.equal(result.code, 1, command.join(" "));
  }
  assert.equal(fs.readdirSync(moved, { recursive: true }).length, survivors, "nothing outside the project was removed");
});

test("uninstall removes only unedited files the installer wrote, then the empty folders", async (t) => {
  const root = project(t, { before: (dir) => fs.writeFileSync(path.join(dir, "AGENTS.md"), "my own rules\n") });
  const files = Object.keys(manifestOf(root).files).filter((name) => name.endsWith("SKILL.md"));
  fs.appendFileSync(path.join(root, files[0]), "\nmine\n");
  fs.writeFileSync(path.join(root, "notes.md"), "not part of the kit\n");
  const result = await exec(root, ["uninstall", "--yes"]);
  assert.equal(result.code, 0, result.out + result.err);
  assert.equal(read(root, "AGENTS.md"), "my own rules\n", "user file survives");
  assert.equal(read(root, "notes.md"), "not part of the kit\n");
  assert.ok(exists(root, files[0]), "an edited file survives");
  assert.equal(exists(root, files[1]), false);
  assert.equal(exists(root, ".uca/manifest.json"), false);
  assert.equal(exists(root, ".uca/config.json"), false);
  assert.equal(exists(root, ".uca"), false, "the empty bookkeeping folder is gone");
  assert.equal(exists(root, path.dirname(files[1])), false, "folders the kit emptied are removed");
});

test("uninstall asks for confirmation: without --yes (and no terminal) nothing is removed", async (t) => {
  const root = project(t);
  const before = fs.readdirSync(root, { recursive: true }).sort();
  const result = await exec(root, ["uninstall"]);
  assert.equal(result.code, 2);
  assert.match(result.err, /Re-run with --yes/);
  assert.deepEqual(fs.readdirSync(root, { recursive: true }).sort(), before);
  const dry = await exec(root, ["uninstall", "--dry-run"]);
  assert.equal(dry.code, 0);
  assert.match(dry.out, /Would remove/);
  assert.deepEqual(fs.readdirSync(root, { recursive: true }).sort(), before);
});

test("a project installed before manifests existed is told what to do, and init adopts its identical files", async (t) => {
  const root = project(t);
  const tracked = Object.keys(manifestOf(root).files).length;
  fs.rmSync(path.join(root, ".uca/manifest.json"));
  for (const command of [["doctor"], ["diff"], ["update"], ["uninstall", "--yes"]]) {
    const result = await exec(root, command);
    assert.equal(result.code, 1, command.join(" "));
    assert.match(result.out + result.err, /init/);
  }
  assert.ok(exists(root, "AGENTS.md"), "nothing was removed");
  cli.installKit({ packageRoot: PACKAGE_ROOT, projectRoot: root, platform: "generic", tier: "lite" });
  assert.equal(Object.keys(manifestOf(root).files).length, tracked, "identical files are adopted again");
});

test("re-running init keeps earlier tracking and does not claim edited files", (t) => {
  const root = project(t);
  const file = Object.keys(manifestOf(root).files).find((name) => name.endsWith("SKILL.md"));
  const owned = manifestOf(root).files[file];
  fs.appendFileSync(path.join(root, file), "\nmine\n");
  cli.installKit({ packageRoot: PACKAGE_ROOT, projectRoot: root, platform: "generic", tier: "lite" });
  assert.equal(manifestOf(root).files[file], owned, "the recorded hash is still the one the kit wrote");
  assert.match(read(root, file), /mine/);
});

test("the CLI routes the commands, lists them in --help, and rejects bad options", () => {
  const run = (args) => spawnSync(process.execPath, [path.join(PACKAGE_ROOT, "bin/cli.cjs"), ...args], { encoding: "utf8", timeout: 60000 });
  assert.match(run(["--help"]).stdout, /doctor \[dir\]/);
  assert.match(run(["update", "--help"]).stdout, /--prune/);
  assert.equal(run(["doctor", "--nope"]).status, 2);
  assert.equal(run(["doctor", "--force"]).status, 2, "--force is only valid for update");
  assert.equal(run(["uninstall", "--prune"]).status, 2);
  assert.equal(run(["update", "a", "b"]).status, 2);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "uca-cli-"));
  try {
    assert.equal(run(["doctor", empty]).status, 1);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
