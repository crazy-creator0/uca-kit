"use strict";

// The trust claims in README.md and SECURITY.md are checked against the code, not just written down.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));

test("the package has no runtime dependencies and no install-time scripts", () => {
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
  assert.equal(Object.keys(pkg.optionalDependencies || {}).length, 0);
  for (const hook of ["preinstall", "install", "postinstall", "prepare"]) assert.equal(pkg.scripts[hook], undefined, `${hook} script present`);
});

test("the installer code makes no network requests and starts no other programs", () => {
  const forbidden = /require\(\s*["'](?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process|worker_threads|cluster)["']\s*\)|\bfetch\s*\(|\bXMLHttpRequest\b|\bimport\s*\(\s*["']https?:/;
  for (const file of fs.readdirSync(path.join(root, "bin")).filter((name) => /\.(?:cjs|mjs|js)$/.test(name))) {
    assert.ok(!forbidden.test(read(`bin/${file}`)), `bin/${file} uses the network or starts a program`);
  }
});

test("README has the read-first section with limits, the not-affiliated line and a dry-run step", () => {
  const readme = read("README.md");
  assert.match(readme, /## Read this first/);
  assert.match(readme, /Not benchmarked/);
  assert.match(readme, /Not affiliated with, endorsed by, or sponsored by/);
  assert.match(readme, /init \. --dry-run/);
  assert.match(readme, /no dependencies and no install-time scripts/);
});

test("the pinned install example matches the package version and the changelog", () => {
  const readme = read("README.md");
  assert.ok(readme.includes(`#v${pkg.version} init`), "README pins a different version than package.json");
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${pkg.version.replace(/\./g, "\\.")} \\(`, "m"));
});

test("SECURITY.md says how to report privately and states what the package does", () => {
  const security = read("SECURITY.md");
  assert.match(security, /Report a vulnerability/);
  assert.match(security, /no runtime dependencies and no install-time scripts/);
  assert.match(security, /not a security boundary/);
});

test("issue templates exist and point security reports to the policy", () => {
  for (const file of ["bug_report.md", "wrong_claim.md", "config.yml"]) assert.ok(fs.existsSync(path.join(root, ".github", "ISSUE_TEMPLATE", file)), file);
  assert.match(read(".github/ISSUE_TEMPLATE/config.yml"), /security\/policy/);
});
