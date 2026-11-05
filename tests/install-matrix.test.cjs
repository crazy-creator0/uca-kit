"use strict";

// Checks every platform x tier x profile combination the installer accepts:
//   - the plan is safe (relative paths, no collisions, sources inside the repository)
//   - every source file is in the npm package (otherwise an npx install would fail)
//   - a real install is healthy, tracked, and uninstalls cleanly

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const cli = require(path.join(root, "bin", "cli.cjs"));
const lifecycle = require(path.join(root, "bin", "lifecycle.cjs"));

const PLATFORMS = Object.keys(cli.PLATFORM_ENTRIES);
const TIERS = cli.TIER_NAMES;
const PROFILES = [null, ...Object.keys(cli.loadProfiles())];

function plan(platform, tier, profile) {
  try {
    return cli.collectFiles(root, cli.buildEntries({ platform, tier, profile }));
  } catch (error) {
    // The only accepted refusal: a profile that leaves a tier with no skills.
    assert.match(error.message, /shares no skills with the/, `${platform}/${tier}/${profile}: ${error.message}`);
    return null;
  }
}

const combos = [];
for (const platform of PLATFORMS) for (const tier of TIERS) for (const profile of PROFILES) combos.push([platform, tier, profile]);

let packed = null;
function packedPaths() {
  if (packed) return packed;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8", timeout: 60_000, shell: process.platform === "win32" });
  assert.equal(result.status, 0, result.stderr);
  packed = new Set(JSON.parse(result.stdout)[0].files.map((file) => file.path));
  return packed;
}

test("the matrix covers every platform, tier and profile, and some combinations are real installs", () => {
  assert.ok(PLATFORMS.length >= 10 && TIERS.length === 3 && PROFILES.length >= 5);
  assert.ok(combos.filter(([p, t, pr]) => plan(p, t, pr)).length > combos.length / 2);
});

test("every plan writes only safe, relative, non-colliding destinations", () => {
  for (const [platform, tier, profile] of combos) {
    const files = plan(platform, tier, profile);
    if (!files) continue;
    const label = `${platform}/${tier}/${profile}`;
    const seen = new Map();
    for (const item of files) {
      const destination = item.destination.split(path.sep).join("/");
      const parts = destination.split("/");
      assert.ok(!path.isAbsolute(item.destination) && !path.win32.isAbsolute(item.destination), `${label}: absolute ${destination}`);
      assert.ok(!parts.includes("..") && !parts.includes("") && !destination.includes("\\"), `${label}: unsafe ${destination}`);
      assert.ok(!destination.startsWith(".uca/"), `${label}: the kit may not ship its own bookkeeping folder (${destination})`);
      assert.ok(!destination.startsWith(".git/") && !destination.startsWith("node_modules/"), `${label}: ${destination}`);
      assert.ok(!seen.has(destination) || seen.get(destination) === item.source, `${label}: two different sources for ${destination}`);
      seen.set(destination, item.source);
      const relative = path.relative(root, item.source);
      assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), `${label}: source outside the repository ${item.source}`);
      assert.ok(fs.lstatSync(item.source).isFile(), `${label}: ${item.source} is not a regular file`);
    }
  }
});

test("every file the installer can copy is in the npm package", () => {
  const inPackage = packedPaths();
  const missing = new Set();
  for (const [platform, tier, profile] of combos) {
    for (const item of plan(platform, tier, profile) || []) {
      const relative = path.relative(root, item.source).split(path.sep).join("/");
      if (!inPackage.has(relative)) missing.add(relative);
    }
  }
  assert.deepEqual([...missing].sort(), [], "these files are installed by the CLI but would be missing from `npx` installs");
});

test("every platform and tier installs, is healthy and tracked, and uninstalls to an empty folder", (t) => {
  for (const platform of PLATFORMS) {
    for (const tier of TIERS) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-matrix-"));
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
      const label = `${platform}/${tier}`;
      const summary = cli.installKit({ packageRoot: root, projectRoot: dir, platform, tier });
      assert.equal(summary.errors, 0, label);
      const report = lifecycle.doctor(dir, root);
      assert.deepEqual(report.problems, [], label);
      const tracked = Object.keys(lifecycle.readManifest(dir).manifest.files);
      assert.equal(tracked.length, summary.copied, `${label}: every copied file is tracked`);
      const result = lifecycle.uninstall(dir, {});
      assert.deepEqual([result.keptEdited, result.unsafe, result.errors], [[], [], []], label);
      assert.deepEqual(fs.readdirSync(dir, { recursive: true }), [], `${label}: uninstall leaves nothing behind`);
    }
  }
});

test("a second install over the first changes nothing and keeps tracking", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-twice-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cli.installKit({ packageRoot: root, projectRoot: dir, platform: "claude", tier: "standard" });
  const first = fs.readFileSync(path.join(dir, ".uca/manifest.json"), "utf8");
  const summary = cli.installKit({ packageRoot: root, projectRoot: dir, platform: "claude", tier: "standard" });
  assert.equal(summary.errors, 0);
  assert.equal(summary.copied, 0);
  assert.equal(fs.readFileSync(path.join(dir, ".uca/manifest.json"), "utf8"), first);
});
