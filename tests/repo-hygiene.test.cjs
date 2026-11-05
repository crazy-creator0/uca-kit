"use strict";

// Guards against things that fail silently: a test file nobody runs, a package.json entry that points nowhere,
// a script with a syntax error that no test happens to load, a JSON file that no longer parses.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git"].includes(entry.name)) files.push(...walk(full));
    } else files.push(full);
  }
  return files;
}
const all = walk(root);
const rel = (file) => path.relative(root, file).split(path.sep).join("/");

test("every test file is run by `npm test` or `npm run test:bench`, and every listed test file exists", () => {
  const listed = new Set();
  for (const script of [pkg.scripts.test, pkg.scripts["test:bench"]]) for (const match of script.matchAll(/tests\/[\w.-]+\.test\.cjs/g)) listed.add(match[0]);
  const onDisk = all.map(rel).filter((file) => /^tests\/[\w.-]+\.test\.cjs$/.test(file));
  assert.deepEqual(onDisk.filter((file) => !listed.has(file)).sort(), [], "test files that no npm script runs");
  assert.deepEqual([...listed].filter((file) => !fs.existsSync(path.join(root, file))).sort(), [], "listed test files that do not exist");
});

test("shipped files do not depend on third-party UI or codebase tools", () => {
  // The kit's own guides and checks (UI-EFFECTS-GUIDE.md, uca-design-check, uca-project-discover) replace them.
  // Test sources are not shipped, so the banned-brand list in tests/directions.test.cjs may still name them.
  const banned = /aceternity|canvas ?ui|spline|vgpu|impeccable|understand[- ]anything/i;
  const shipped = pkg.files.flatMap((entry) => {
    const full = path.join(root, entry);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  }).map(rel).filter((file) => /\.(?:md|mdc|json|cjs|mjs|py)$/.test(file));
  assert.ok(shipped.length > 50, "the shipped file list looks too short");
  const hits = shipped.filter((file) => banned.test(fs.readFileSync(path.join(root, file), "utf8")));
  assert.deepEqual(hits, [], "shipped files that still name a third-party UI or codebase tool");
});

test("python tests are run by CI", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/npm-cli.yml"), "utf8");
  for (const file of all.map(rel).filter((name) => /^tests\/test_[\w]+\.py$/.test(name))) assert.ok(workflow.includes(file), `${file} is not run by the workflow`);
});

test("every path in package.json (files, bin) exists", () => {
  for (const entry of pkg.files) assert.ok(fs.existsSync(path.join(root, entry)), `files entry does not exist: ${entry}`);
  for (const target of Object.values(pkg.bin)) assert.ok(fs.existsSync(path.join(root, target)), `bin target does not exist: ${target}`);
});

test("every script file parses (including ones no test loads)", () => {
  const scripts = all.map(rel).filter((file) => /\.(?:cjs|mjs)$/.test(file) && !file.startsWith("benchmarks/sample-app/") && !file.startsWith("benchmarks/reference/"));
  assert.ok(scripts.length > 20);
  const failures = [];
  for (const file of scripts) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8", timeout: 30_000 });
    if (result.status !== 0) failures.push(`${file}: ${(result.stderr || "").split("\n")[0]}`);
  }
  assert.deepEqual(failures, []);
});

test("every JSON file parses", () => {
  const failures = [];
  for (const file of all.map(rel).filter((name) => name.endsWith(".json") && !name.startsWith("benchmarks/sample-app/"))) {
    try {
      JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("the workflow runs the checks on every supported Node line and limits its own permissions", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/npm-cli.yml"), "utf8");
  const minimum = Number(String(pkg.engines.node).match(/\d+/)[0]);
  assert.ok(workflow.includes(`node-version: [${minimum}, `), `the main matrix must start at Node ${minimum} (engines.node)`);
  assert.match(workflow, /^permissions:\s*\n\s+contents: read/m, "the workflow should request read-only repository access");
  assert.match(workflow, /timeout-minutes:/, "jobs should have a timeout");
});
