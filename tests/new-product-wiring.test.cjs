"use strict";

// The router script is a reference; a real agent only follows the files it is told to read. This test starts at the file each
// platform actually loads and follows references (two hops at most) to check the new-product trigger can be reached.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cli = require(path.join(root, "bin", "cli.cjs"));

const ENTRY = {
  generic: "AGENTS.md", codex: "AGENTS.md", opencode: "AGENTS.md",
  claude: "CLAUDE.md", gemini: "GEMINI.md", copilot: ".github/copilot-instructions.md",
  cursor: ".cursor/rules/universal-coding-agent-kit.mdc", windsurf: ".windsurf/rules/universal-coding-agent-kit.md",
  devin: ".devin/rules/universal-coding-agent-kit.md", junie: ".junie/rules/universal-coding-agent-kit.md",
  jetbrains: ".aiassistant/rules/universal-coding-agent-kit.md"
};
const TRIGGER = /R-NEW/;
const TRIGGER_TEXT = /New app, site, page or tool, even from one line: before coding show a plan/;

function reachable(projectRoot, entry, maxHops) {
  const seen = new Map([[entry, 0]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    const hops = seen.get(file);
    if (hops >= maxHops) continue;
    const text = fs.readFileSync(path.join(projectRoot, file), "utf8");
    for (const [, ref] of text.matchAll(/(?:@|`)?([A-Za-z0-9_.\-/]+\.(?:md|mdc))`?/g)) {
      const clean = ref.replace(/^\.\//, "");
      if (!seen.has(clean) && fs.existsSync(path.join(projectRoot, clean))) {
        seen.set(clean, hops + 1);
        queue.push(clean);
      }
    }
  }
  return [...seen.keys()];
}

function withInstall(platform, tier, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-wire-"));
  try {
    assert.equal(cli.installKit({ packageRoot: root, projectRoot: dir, platform, tier }).errors, 0);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const tier of cli.TIER_NAMES) {
  test(`${tier}: from every platform's entry file the new-product trigger is reached in two hops`, () => {
    for (const platform of Object.keys(ENTRY)) {
      withInstall(platform, tier, (dir) => {
        const visited = reachable(dir, ENTRY[platform], 2);
        const hit = visited.filter((file) => TRIGGER.test(fs.readFileSync(path.join(dir, file), "utf8")));
        assert.ok(hit.length > 0, `${platform}/${tier}: no file reached from ${ENTRY[platform]} carries R-NEW (visited: ${visited.join(", ")})`);
        assert.ok(visited.some((file) => TRIGGER_TEXT.test(fs.readFileSync(path.join(dir, file), "utf8"))), `${platform}/${tier}: the rule text is missing`);
      });
    }
  });
}

test("standard and full put the trigger in AGENTS.md itself, so it does not depend on the task looking substantial", () => {
  for (const tier of ["standard", "full"]) {
    withInstall("generic", tier, (dir) => {
      const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      assert.match(agents, /## New app, site, page or tool \(always-on\)/);
      assert.match(agents, /do not start coding/);
      assert.match(agents, /\.agents\/workflows\/new-project\.md/);
      assert.match(agents, /\.agents\/skills\/design-taste-discovery\/SKILL\.md/);
      for (const target of [".agents/workflows/new-project.md", ".agents/skills/design-taste-discovery/SKILL.md"]) assert.ok(fs.existsSync(path.join(dir, target)), `${tier}: ${target} is named but not installed`);
    });
  }
});

test("lite carries the plan rule in its core, which its entry file tells the model to read", () => {
  withInstall("generic", "lite", (dir) => {
    assert.match(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), /Read `\.agents\/CORE\.md` before every task/);
    assert.match(fs.readFileSync(path.join(dir, ".agents", "CORE.md"), "utf8"), TRIGGER_TEXT);
  });
});

test("the reachability check can fail: a core without the rule is not reached", () => {
  withInstall("generic", "lite", (dir) => {
    const core = path.join(dir, ".agents", "CORE.md");
    fs.writeFileSync(core, fs.readFileSync(core, "utf8").replace(/^- \*\*R-NEW\*\*.*$/m, ""));
    const visited = reachable(dir, "AGENTS.md", 2);
    assert.equal(visited.some((file) => TRIGGER.test(fs.readFileSync(path.join(dir, file), "utf8"))), false);
  });
});

test("new-project asks few, defaulted questions and ends with the Senior Bar check", () => {
  const workflow = fs.readFileSync(path.join(root, ".agents", "workflows", "new-project.md"), "utf8");
  assert.match(workflow, /## Intake/);
  assert.match(workflow, /at most three questions/);
  assert.match(workflow, /uca-senior-check\.cjs/);
  assert.ok(fs.existsSync(path.join(root, "scripts", "uca-senior-check.cjs")));
});

test("new-project ends with a scorecard that cannot mark unchecked lines Done", () => {
  const workflow = fs.readFileSync(path.join(root, ".agents", "workflows", "new-project.md"), "utf8");
  assert.match(workflow, /## Senior finish/);
  assert.match(workflow, /Never mark a line Done without having looked/);
  assert.match(workflow, /Do not call the project production-ready/);
  for (const topic of ["README", ".env.example", "No secrets", "Real states", "validated", "phone width", "test", "Safe by default"]) assert.ok(workflow.includes(topic), topic);
});
