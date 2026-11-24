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

// Sample 06: a "like Sejda" build left out page tools and its README said Sejda lacks features it has.
test("new-project lists the named product's core features and checks the request before done", () => {
  const workflow = fs.readFileSync(path.join(root, ".agents", "workflows", "new-project.md"), "utf8");
  assert.match(workflow, /\*\*"Like X" or "better than X"\.\*\*/);
  assert.match(workflow, /"in this build", "later" or "not planned"/);
  assert.match(workflow, /Never write in the README or the app that X lacks a feature unless you checked/);
  assert.match(workflow, /\*\*Does what was asked\.\*\*/);
  assert.match(workflow, /never silently dropped/);
});

test("the audit compares the project with the request and checks its own claims", () => {
  const workflow = fs.readFileSync(path.join(root, ".agents", "workflows", "audit.md"), "utf8");
  assert.match(workflow, /\*\*The people who use it\.\*\* First the ordinary user: do the main task/);
  assert.match(workflow, /Then the person who asked/);
  assert.match(workflow, /\*\*What was asked against what exists:\*\*/);
  assert.match(workflow, /part of every audit, not an optional extra/);
  assert.match(workflow, /missing, or a claim in the README, help text or screens that is false, is at least \*\*Medium\*\*/);
});

// Sample 06, debug round: asked to "find what is missing or broken", neither run used the audit and both left its confirmed bugs in place.
test("an open-ended 'find what is broken' request starts with the audit", () => {
  const router = fs.readFileSync(path.join(root, ".agents", "router-rule.md"), "utf8");
  const bugs = fs.readFileSync(path.join(root, ".agents", "workflows", "bug-investigation.md"), "utf8");
  assert.match(router, /find what is missing or broken in existing code, with no single symptom/);
  assert.match(router, /starts `audit`/);
  assert.match(bugs, /No single symptom\?/);
  assert.match(bugs, /run the audit first \(`\.agents\/workflows\/audit\.md`/);
  assert.match(bugs, /Report the findings you did not fix/);
});

// After Sample 06, a user found the main job (editing text) broken in ways every build's own tests missed:
// the checks were written from the builder's assumptions, on inputs it made itself. One ladder, any model.
test("testing-and-code-review checks the main task like the user, for any model", () => {
  const skill = fs.readFileSync(path.join(root, ".agents", "skills", "testing-and-code-review", "SKILL.md"), "utf8");
  assert.match(skill, /## Check it like the user/);
  assert.match(skill, /not from how the code happens to work/);
  assert.match(skill, /at least one hard input from the user's world/);
  assert.match(skill, /If every input was made by you, say so/);
  assert.match(skill, /by doing it, never by assuming/);
  assert.match(skill, /`py --version` on Windows/);
  for (const level of [/1\. \*\*Read\*\* \(any model\)/, /2\. \*\*Script\*\* \(you can run commands\)/, /3\. \*\*One look\*\* \(only if you can read images/, /4\. \*\*Hand over\*\* \(always/]) assert.match(skill, level);
  assert.match(skill, /never the user's private content/);
  assert.match(skill, /Install nothing without asking/);
  assert.match(skill, /never the whole screen/);
  assert.match(skill, /A picture you did not read is not a check/);
  assert.match(skill, /without their content/);
  assert.match(skill, /one Checks line per step/);
});

test("planning, scorecard, core rules, audit, design and debugging all use the same check", () => {
  const plan = fs.readFileSync(path.join(root, ".agents", "workflows", "new-project.md"), "utf8");
  assert.match(plan, /their main task as they would do it, in 3 to 6 steps in their words, each with a concrete input and the result they expect/);
  assert.match(plan, /confirmed by the user or marked assumed/);
  assert.match(plan, /with one line on how each behaves in X/);
  assert.match(plan, /\*\*Checked like the user\.\*\*/);
  assert.match(plan, /nothing collapsed, cut off, overflowing or changed that the user did not change/);
  for (const tier of ["lite", "standard", "full"]) {
    const core = fs.readFileSync(path.join(root, ".agents", tier, "CORE.md"), "utf8");
    assert.match(core, /title, goal, users, main task steps with expected results/, tier);
    assert.match(core, /Checks per main step \(read, script run, image really read, or steps left for the user\)/, tier);
  }
  for (const file of [".agents/workflows/audit.md", ".agents/skills/design-taste-discovery/SKILL.md", ".agents/workflows/bug-investigation.md", ".agents/workflows/new-project.md"]) {
    assert.match(fs.readFileSync(path.join(root, file), "utf8"), /"Check it like the user"/, file);
  }
});

test("the project card notes a missing main task without failing the check", () => {
  const { mainTaskNote } = require(path.join(root, "scripts", "uca-project-check.cjs"));
  assert.match(mainTaskNote("# PROJECT.md\n## Stack\n- Node\n"), /^NOTE: no "## Project brief" section/);
  assert.match(mainTaskNote("## Project brief (the user's words; not generated)\n- Not recorded yet. Draft it.\n## Stack\n"), /not filled in yet/);
  assert.equal(mainTaskNote("## Main task\n- Open a PDF: invoice.pdf -> all pages shown\n## Stack\n- Node\n"), "");
  assert.equal(mainTaskNote("## Stack\n- Node\n## Main task\n- Type a long sentence in a paragraph -> it wraps inside the paragraph (assumed)\n"), "");
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "uca-main-task-"));
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  const run = (args) => require("node:child_process").spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" });
  run([path.join(root, "scripts", "uca-project-discover.cjs"), "--write", "PROJECT.md"]);
  const card = fs.readFileSync(path.join(dir, "PROJECT.md"), "utf8");
  assert.match(card, /## Project brief \(the user's words; not generated\)\n- Not recorded yet/);
  assert.ok(card.indexOf("## Project brief") > card.lastIndexOf("<!-- /uca:generated -->"), "the main task sits outside the generated blocks");
  const checked = run([path.join(root, "scripts", "uca-project-check.cjs")]);
  assert.match(checked.stdout, /NOTE: the project brief is not filled in yet/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a new project starts from a drafted brief, and attached documents or images are the spec", () => {
  const plan = fs.readFileSync(path.join(root, ".agents", "workflows", "new-project.md"), "utf8");
  assert.match(plan, /\*\*Project brief first\*\* \(an empty folder, or no clear direction\): draft four short lines yourself, each marked assumed: title, description \(one sentence\), goal/);
  assert.match(plan, /The user edits what is wrong; "go ahead" accepts them/);
  assert.match(plan, /\*\*Attached documents or images are the spec:\*\*/);
  assert.match(plan, /naming where each point came from/);
  assert.match(plan, /Plan the whole documented scope and build it slice by slice to the end/);
  assert.match(plan, /If you cannot read an image, say so and ask for a short description; never guess from its name/);
  const skill = fs.readFileSync(path.join(root, ".agents", "skills", "testing-and-code-review", "SKILL.md"), "utf8");
  assert.match(skill, /one Checks line per step as `step \| level \| result`/);
  const template = fs.readFileSync(path.join(root, ".agents", "PROJECT-TEMPLATE.md"), "utf8");
  for (const key of ["- title:", "- description:", "- goal:", "- task:"]) assert.ok(template.includes(key), key);
});

test("skill-gap-router is installed but no longer read on every task", () => {
  const rule = fs.readFileSync(path.join(root, ".agents", "router-rule.md"), "utf8");
  assert.match(rule, /\*\*Guardrails are always on\*\* \(`anti-ai-slop`, `anti-hallucination`\)/);
  assert.match(rule, /`skill-gap-router` is read only for the "Unclear, or spans many areas" row or a missing capability/);
  assert.match(rule, /search for outside skills only when the user asks; never install or run third-party skills or scripts without showing their contents and getting a yes/);
  const { GUARDRAILS } = require(path.join(root, "scripts", "uca-route.cjs"));
  assert.deepEqual(GUARDRAILS, ["anti-ai-slop", "anti-hallucination"]);
  const profiles = JSON.parse(fs.readFileSync(path.join(root, ".agents", "profiles", "profiles.json"), "utf8"));
  assert.ok(JSON.stringify(profiles).includes("skill-gap-router"), "still installed by the profiles");
});
