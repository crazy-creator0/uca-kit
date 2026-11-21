"use strict";

// License, attribution and citation: Apache-2.0 from v0.2.0, with the MIT history of v0.1.x stated, and the
// license and NOTICE copied into every install (Apache-2.0, section 4).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { TIER_NAMES, installKit } = require("../bin/cli.cjs");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
// SHA-256 of the Apache License 2.0 text as published at apache.org/licenses/LICENSE-2.0.txt.
const APACHE_2_SHA256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";
const CREDIT = "UCA Kit by Crazy Creators, Apache-2.0 (`.agents/NOTICE`).";

test("LICENSE is the unchanged Apache License 2.0 text, and package.json says so", () => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "LICENSE"))).digest("hex");
  assert.equal(hash, APACHE_2_SHA256, "LICENSE differs from the published Apache-2.0 text");
  assert.equal(require(path.join(root, "package.json")).license, "Apache-2.0");
});

test("NOTICE credits Crazy Creators and states that v0.1.0 and v0.1.1 stay MIT", () => {
  const notice = read("NOTICE");
  assert.match(notice, /^UCA Kit/);
  assert.match(notice, /Copyright 2026 Crazy Creators/);
  assert.match(notice, /Apache License, Version 2\.0/);
  assert.match(notice, /v0\.1\.0 and v0\.1\.1[\s\S]*MIT License/);
  assert.match(notice, /section 4\(d\)/);
});

test("CITATION.cff names the project, author, repository and license, with no personal address", () => {
  const citation = read("CITATION.cff");
  for (const line of [/^cff-version: 1\.2\.0$/m, /^type: software$/m, /^title: "UCA Kit/m, /^ {2}- name: "Crazy Creators"$/m, /^repository-code: "https:\/\/github\.com\/crazy-creator0\/uca-kit"$/m, /^license: Apache-2\.0$/m]) {
    assert.match(citation, line);
  }
  assert.doesNotMatch(citation, /@|email/i);
});

test("README states the license change and the MIT history; site footers no longer say plain MIT", () => {
  const readme = read("README.md");
  assert.match(readme, /\[Apache License, Version 2\.0\]\(LICENSE\), starting with v0\.2\.0/);
  assert.match(readme, /v0\.1\.0 and v0\.1\.1 were published under the MIT License/);
  const pages = ["demo/index.html", "demo/samples/index.html", ...fs.readdirSync(path.join(root, "demo", "samples"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `demo/samples/${entry.name}/index.html`)];
  for (const page of pages) {
    const html = read(page);
    assert.doesNotMatch(html, /<p>MIT licensed\./, `${page}: old footer`);
    assert.match(html, /Apache-2\.0 licensed from v0\.2\.0; v0\.1\.1 and earlier are MIT\./, `${page}: footer`);
  }
});

test("every tier installs LICENSE and NOTICE under .agents/, recorded in the manifest, and AGENTS.md carries the credit line", () => {
  for (const tier of TIER_NAMES) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "uca-license-"));
    try {
      installKit({ packageRoot: root, projectRoot: project, platform: "claude", tier });
      for (const file of ["LICENSE", "NOTICE"]) {
        assert.equal(fs.readFileSync(path.join(project, ".agents", file), "utf8"), read(file), `${tier}: .agents/${file}`);
      }
      const manifest = fs.readFileSync(path.join(project, ".uca", "manifest.json"), "utf8");
      assert.match(manifest, /"\.agents\/LICENSE"/, `${tier}: LICENSE not in manifest`);
      assert.match(manifest, /"\.agents\/NOTICE"/, `${tier}: NOTICE not in manifest`);
      assert.ok(fs.readFileSync(path.join(project, "AGENTS.md"), "utf8").includes(CREDIT), `${tier}: credit line missing in AGENTS.md`);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  }
});
