"use strict";

// Finds file references that point nowhere.
//   1. In the repository's own docs: every reference must resolve (a stale name like a removed skill fails).
//   2. In an installed project, for every platform and tier: a reference to a file that was not installed
//      is allowed only if it is optional by its wording, or is a recorded known gap.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const cli = require(path.join(root, "bin", "cli.cjs"));

// Names that are never a path to an installed file.
const GENERATED = {
  "PROJECT.md": "created by the project-discovery step in the user's project",
  "DESIGN.md": "the design brief the agent writes in the user's project (design-taste-discovery Step 8)",
  ".uca/config.json": "written by the installer",
  ".uca/manifest.json": "written by the installer",
  ".uca-workspace/": "scratch folder created in the user's project (R-SCRATCH)",
  ".uca/state.json": "written by scripts/uca-guard.cjs in the user's project",
  "HANDOFF.md": "written by scripts/uca-guard.cjs in the user's project when a handoff is due",
  "SKILL.md": "the generic file name of a skill, not a path"
};
// Referenced as optional or platform-specific, so missing from some installs on purpose.
const OPTIONAL = {
  "GENERIC-IDE-SETUP.md": "installed only for the generic platform",
  ".agents/workflows/new-project.md": "R-NEW says 'if installed'; the lite tier does not ship workflows",
  "HOST-CAPABILITY-FALLBACK.md": "every mention says 'when it is installed' or 'only when' it is needed"
};
// Real gaps that exist today. The test fails if one disappears (remove it here) or a new one appears (fix it).
const KNOWN_GAP_TARGETS = [];
// Written for the full kit: they name skills, the skill map or usage files that lite and standard installs do not contain.
// Each of these files must say so itself, so a reader of a lite or standard install is told to skip missing paths.
const FULL_KIT_NOTE = /Written for the full kit\. In the lite and standard tiers .*not installed; skip any path that does not exist/;
const FULL_KIT_REFERRER = /^(?:\.(?:cursor|opencode)\/agents\/[^/]+\.md|GENERIC-IDE-SETUP\.md|OPENCODE-SETUP\.md)$/;

// Where the installer puts things. Docs in the repository use these paths (for example .agents/CORE.md is the installed
// name of a tier core), so they count as resolvable there.
const posix = (value) => value.split(path.sep).join("/");
const destinations = (platform, tier) => new Set(cli.collectFiles(root, cli.buildEntries({ platform, tier })).map((item) => posix(item.destination)));
const ALL_DESTINATIONS = new Set();
const BASE_DESTINATIONS = new Set(); // what every platform gets
for (const tier of cli.TIER_NAMES) {
  for (const name of destinations("generic", tier)) BASE_DESTINATIONS.add(name);
  for (const platform of Object.keys(cli.PLATFORM_ENTRIES)) for (const name of destinations(platform, tier)) ALL_DESTINATIONS.add(name);
}
// Adapter files that only some platforms get (CLAUDE.md, GEMINI.md, .cursor/rules/...). Other platforms' docs may name them.
const PLATFORM_ONLY = new Set([...ALL_DESTINATIONS].filter((name) => !BASE_DESTINATIONS.has(name)));

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") files.push(...walk(full));
    } else files.push(full);
  }
  return files;
}

function referencesIn(text) {
  const refs = new Set();
  for (const match of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) if (!/^[a-z][a-z0-9+.-]*:/i.test(match[1]) && !match[1].startsWith("#")) refs.add(match[1]);
  for (const match of text.matchAll(/`((?:\.?[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+\.(?:md|cjs|mjs|json|py|mdc))`/g)) refs.add(match[1]);
  for (const match of text.matchAll(/`([A-Z][A-Za-z0-9_-]+\.md)`/g)) refs.add(match[1]);
  return refs;
}

function unresolved(baseDir, files) {
  const missing = [];
  for (const file of files.filter((name) => /\.(?:md|mdc)$/.test(name))) {
    for (const reference of referencesIn(fs.readFileSync(file, "utf8"))) {
      const candidates = [path.join(baseDir, reference), path.join(path.dirname(file), reference)];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) missing.push({ from: path.relative(baseDir, file).split(path.sep).join("/"), to: reference });
    }
  }
  return missing;
}

test("the scanner finds references of each kind", () => {
  const refs = referencesIn("See [guide](docs/A.md#x), `scripts/run.cjs`, `README.md`, [web](https://example.com) and [anchor](#top).");
  assert.deepEqual([...refs].sort(), ["README.md", "docs/A.md", "scripts/run.cjs"]);
});

test("every file reference in the repository's shipped docs resolves", () => {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const packed = spawnSync(npm, ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8", timeout: 60_000, shell: process.platform === "win32" });
  assert.equal(packed.status, 0, packed.stderr);
  const files = JSON.parse(packed.stdout)[0].files.map((file) => path.join(root, file.path));
  const broken = unresolved(root, files).filter((item) => !Object.hasOwn(GENERATED, item.to) && !ALL_DESTINATIONS.has(item.to.replace(/^\.\//, "")));
  assert.deepEqual(broken, [], "these references point at files that do not exist in the repository");
});

test("in installed projects, every unresolved reference is optional, generated, or a recorded gap", (t) => {
  const surprises = [];
  const gapTargets = new Set();
  let fullKitGap = false;
  for (const platform of Object.keys(cli.PLATFORM_ENTRIES)) {
    for (const tier of cli.TIER_NAMES) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-refs-"));
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
      assert.equal(cli.installKit({ packageRoot: root, projectRoot: dir, platform, tier }).errors, 0);
      for (const item of unresolved(dir, walk(dir))) {
        if (Object.hasOwn(GENERATED, item.to) || Object.hasOwn(OPTIONAL, item.to) || PLATFORM_ONLY.has(item.to)) continue;
        if (KNOWN_GAP_TARGETS.includes(item.to)) gapTargets.add(item.to);
        else if (FULL_KIT_REFERRER.test(item.from) && FULL_KIT_NOTE.test(fs.readFileSync(path.join(dir, item.from), "utf8"))) fullKitGap = true;
        else surprises.push(`${platform}/${tier}: ${item.from} -> ${item.to}`);
      }
    }
  }
  assert.deepEqual([...new Set(surprises)].sort(), [], "new broken references in an installed project");
  assert.deepEqual([...gapTargets].sort(), KNOWN_GAP_TARGETS, "a known gap changed: update KNOWN_GAP_TARGETS");
  assert.equal(fullKitGap, true, "the full-kit gap is gone: remove FULL_KIT_REFERRER handling");
});

test("the recorded exceptions are real: optional and generated names exist in the repository or are produced by it", () => {
  for (const name of Object.keys(OPTIONAL)) assert.ok(fs.existsSync(path.join(root, name)), name);
  for (const name of KNOWN_GAP_TARGETS) assert.ok(fs.existsSync(path.join(root, name)), `${name} should exist in the repository (it is just not installed)`);
});
