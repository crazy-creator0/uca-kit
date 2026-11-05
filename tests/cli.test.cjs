"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  PLATFORM_ENTRIES,
  findExistingConflicts,
  installKit,
  loadProfiles,
  parseArgs,
  printHelp,
  profileSkillNames
} = require("../bin/cli.cjs");

const CANONICAL_SKILLS = [
  "anti-ai-slop",
  "anti-hallucination",
  "application-security",
  "backend-api",
  "cloudflare-operations",
  "data-engineering-analytics",
  "database-engineering",
  "debugging",
  "design-taste-discovery",
  "frontend-engineering",
  "frontend-visuals-and-3d",
  "import-hygiene",
  "language-engineering",
  "performance-engineering",
  "skill-gap-router",
  "testing-and-code-review"
];

function makeKit(root) {
  const files = [
    "AGENTS.md",
    ".agents/AGENTS.md",
    ".agents/core-policy-full.md",
    ".agents/router-rule.md",
    ".agents/catalog/skill-catalog.md",
    ".agents/profiles/profiles.json",
    ".agents/profiles/minimal.md",
    ".agents/profiles/fullstack.md",
    ".agents/profiles/frontend.md",
    ".agents/profiles/security-focused.md",
    ".agents/README.md",
    ...CANONICAL_SKILLS.map((skill) => `.agents/skills/${skill}/SKILL.md`),
    ".agents/workflows/new-project.md",
    ".agents/workflows/stack-migration.md",
    "AGENT-SKILL-MAP.md",
    "HOST-CAPABILITY-FALLBACK.md",
    "USAGE-PRIVACY.md",
    "scripts/uca-usage.cjs",
    "GENERIC-IDE-SETUP.md",
    "PLATFORM-SETUP.md",
    ".cursor/rules/universal-coding-agent-kit.mdc",
    ".cursor/agents/designer.md",
    ".cursor/agents/service-strategist.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
    "OPENCODE-SETUP.md",
    ".opencode/agents/planner.md",
    ".opencode/agents/reviewer.md",
    ".opencode/agents/verifier.md",
    ".opencode/agents/designer.md",
    ".opencode/agents/service-strategist.md",
    ".opencode/plugins/uca-usage.mjs",
    ".devin/rules/universal-coding-agent-kit.md",
    ".windsurf/rules/universal-coding-agent-kit.md",
    ".junie/rules/universal-coding-agent-kit.md",
    ".aiassistant/rules/universal-coding-agent-kit.md"
  ];
  for (const relative of files) {
    const fullPath = path.join(root, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `template:${relative}\n`, "utf8");
  }
}

function withFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-kit-test-"));
  const kitRoot = path.join(root, "kit");
  const projectRoot = path.join(root, "project");
  fs.mkdirSync(kitRoot, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  makeKit(kitRoot);
  try {
    run({ kitRoot, projectRoot });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("documents Git as optional and preserves local-first project workflow", () => {
  const root = path.join(__dirname, "..");
  const instructions = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".agents/workflows/new-project.md"), "utf8");
  const map = fs.readFileSync(path.join(root, "AGENT-SKILL-MAP.md"), "utf8");

  assert.match(instructions, /Git is recommended, not mandatory for local work/i);
  assert.match(instructions, /ask before initializing a repository/i);
  assert.match(instructions, /If the user declines or Git is unavailable, continue with local files/i);
  assert.match(readme, /Git is recommended.*not required to keep working locally/i);
  assert.match(workflow, /do not assume a language or framework in advance/i);
  assert.doesNotMatch(workflow, /Python backend/i);
  assert.match(workflow, /if they decline, continue locally/i);
  assert.match(map, /New project \/ local-first setup/);
});

test("parses platform, directory, and safety flags", () => {
  assert.deepEqual(parseArgs(["init", "../app", "--platform", "cursor", "--dry-run"]), {
    dir: "../app",
    platform: "cursor",
    profile: null,
    tier: null,
    context: null,
    autoTier: false,
    yes: false,
    force: false,
    dryRun: true,
    help: false,
    version: false
  });
});

test("rejects unknown platform names", () => {
  assert.throws(() => parseArgs(["--platform", "unknown-editor"]), /Unknown platform/);
});

test("parses profile names and rejects unknown profiles", () => {
  assert.equal(parseArgs(["init", ".", "--profile", "minimal"]).profile, "minimal");
  assert.equal(parseArgs(["init", "."]).profile, null);
  assert.throws(() => parseArgs(["--profile", "huge"]), /Unknown profile/);
  assert.throws(() => parseArgs(["--profile"]), /requires a profile name/);
});

test("minimal profile installs only evergreen guardrail skills", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({
      packageRoot: kitRoot,
      projectRoot,
      platform: "generic",
      profile: "minimal"
    });
    assert.equal(summary.errors, 0);
    for (const skill of ["anti-ai-slop", "anti-hallucination", "skill-gap-router"]) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, `.agents/skills/${skill}/SKILL.md`)),
        `Expected guardrail skill missing: ${skill}`
      );
    }
    assert.equal(fs.existsSync(path.join(projectRoot, ".agents/skills/language-engineering/SKILL.md")), false);
    assert.ok(fs.existsSync(path.join(projectRoot, ".agents/router-rule.md")));
    assert.ok(fs.existsSync(path.join(projectRoot, ".agents/catalog/skill-catalog.md")));
    assert.ok(fs.existsSync(path.join(projectRoot, ".agents/core-policy-full.md")));
  });
});

test("profile filtering also applies to platform-native skill copies", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({
      packageRoot: kitRoot,
      projectRoot,
      platform: "claude",
      profile: "minimal"
    });
    assert.equal(summary.errors, 0);
    for (const skill of ["anti-ai-slop", "anti-hallucination", "skill-gap-router"]) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, `.claude/skills/${skill}/SKILL.md`)),
        `Expected native guardrail skill missing: ${skill}`
      );
    }
    assert.equal(fs.existsSync(path.join(projectRoot, ".claude/skills/language-engineering/SKILL.md")), false);
  });
});

test("every profile installs exactly its skills in every skills directory of every platform", () => {
  const SKILLS_SOURCE = ".agents/skills";
  for (const [platform, entries] of Object.entries(PLATFORM_ENTRIES)) {
    const nativeDirs = entries
      .filter((entry) => entry.source === SKILLS_SOURCE)
      .map((entry) => entry.destination);
    const skillDirs = [SKILLS_SOURCE, ...nativeDirs];
    for (const profile of Object.keys(loadProfiles())) {
      const expected = (profileSkillNames(profile) || CANONICAL_SKILLS).slice().sort();
      withFixture(({ kitRoot, projectRoot }) => {
        const summary = installKit({ packageRoot: kitRoot, projectRoot, platform, profile });
        assert.equal(summary.errors, 0, `${platform}/${profile}: install reported errors`);
        for (const skillDir of skillDirs) {
          const installed = fs
            .readdirSync(path.join(projectRoot, skillDir))
            .sort();
          assert.deepEqual(
            installed,
            expected,
            `${platform}/${profile}: ${skillDir} should contain exactly the profile's skills`
          );
        }
      });
    }
  }
});

test("default and explicit all profile install every canonical skill", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const defaultSummary = installKit({ packageRoot: kitRoot, projectRoot, platform: "generic" });
    assert.equal(defaultSummary.errors, 0);
    for (const skill of CANONICAL_SKILLS) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, `.agents/skills/${skill}/SKILL.md`)),
        `Expected full-skill install missing: ${skill}`
      );
    }
  });
  withFixture(({ kitRoot, projectRoot }) => {
    const allSummary = installKit({ packageRoot: kitRoot, projectRoot, platform: "generic", profile: "all" });
    assert.equal(allSummary.errors, 0);
    for (const skill of CANONICAL_SKILLS) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, `.agents/skills/${skill}/SKILL.md`)),
        `Expected all-profile install missing: ${skill}`
      );
    }
  });
});

test("help describes generic fallback and preservation behavior", () => {
  const help = printHelp();
  assert.match(help, /UCA Kit/);
  assert.match(help, /unlisted IDEs/);
  assert.match(help, /preserved by default/);
  assert.match(help, /keep existing files, override them, or cancel the install/i);
  assert.match(help, /Cancel leaves the project unchanged/i);
});

test("generic profile installs only the generic fallback guide from setup docs", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "generic" });
    assert.equal(summary.errors, 0);
    assert.ok(fs.existsSync(path.join(projectRoot, "GENERIC-IDE-SETUP.md")));
    assert.equal(fs.existsSync(path.join(projectRoot, "PLATFORM-SETUP.md")), false);
    assert.equal(fs.existsSync(path.join(projectRoot, ".agents/README.md")), false);
  });
});

test("installs shared core and selected Cursor adapter", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({
      packageRoot: kitRoot,
      projectRoot,
      platform: "cursor"
    });
    assert.equal(summary.errors, 0);
    assert.equal(
      fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8"),
      "template:AGENTS.md\n"
    );
    assert.equal(
      fs.readFileSync(path.join(projectRoot, ".cursor/rules/universal-coding-agent-kit.mdc"), "utf8"),
      "template:.cursor/rules/universal-coding-agent-kit.mdc\n"
    );
    assert.equal(
      fs.readFileSync(path.join(projectRoot, ".agents/skills/language-engineering/SKILL.md"), "utf8"),
      "template:.agents/skills/language-engineering/SKILL.md\n"
    );
    for (const relative of ["AGENT-SKILL-MAP.md", "HOST-CAPABILITY-FALLBACK.md", ".agents/workflows/stack-migration.md", "USAGE-PRIVACY.md", "scripts/uca-usage.cjs", ".cursor/agents/designer.md", ".cursor/agents/service-strategist.md"]) {
      assert.ok(fs.existsSync(path.join(projectRoot, relative)), `Expected routing/usage file missing: ${relative}`);
    }
  });
});

test("preserves existing files and same-name user skills while adding non-conflicting files", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "my existing rules\n", "utf8");
    fs.mkdirSync(path.join(projectRoot, ".agents/skills/language-engineering"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".agents/skills/language-engineering/SKILL.md"),
      "my custom language skill\n",
      "utf8"
    );
    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "generic" });
    assert.equal(summary.errors, 0);
    assert.equal(
      fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8"),
      "my existing rules\n"
    );
    assert.ok(summary.skipped >= 2);
    assert.equal(
      fs.readFileSync(path.join(projectRoot, ".agents/skills/language-engineering/SKILL.md"), "utf8"),
      "my custom language skill\n"
    );
    assert.ok(fs.existsSync(path.join(projectRoot, ".agents/workflows/new-project.md")));
  });
});

test("detects conflicts without changing the project", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "user-owned instructions\n", "utf8");
    fs.mkdirSync(path.join(projectRoot, ".agents/skills/language-engineering"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".agents/skills/language-engineering/SKILL.md"),
      "user-owned skill\n",
      "utf8"
    );

    const entries = require("../bin/cli.cjs").CORE_ENTRIES;
    const conflicts = findExistingConflicts(
      projectRoot,
      require("../bin/cli.cjs").collectFiles(kitRoot, entries)
    );

    assert.ok(conflicts.includes("AGENTS.md"));
    assert.ok(conflicts.includes(".agents/skills/language-engineering/SKILL.md"));
    assert.equal(fs.existsSync(path.join(projectRoot, ".agents/workflows/new-project.md")), false);
    assert.equal(
      fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8"),
      "user-owned instructions\n"
    );
  });
});

test("cancel on conflict leaves existing files intact and creates no UCA Kit files", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "user-owned instructions\n", "utf8");
    const summary = installKit({
      packageRoot: kitRoot,
      projectRoot,
      platform: "generic",
      conflictMode: "cancel"
    });

    assert.equal(summary.cancelled, true);
    assert.equal(summary.errors, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), ["AGENTS.md"]);
    assert.equal(
      fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8"),
      "user-owned instructions\n"
    );
    assert.equal(fs.existsSync(path.join(projectRoot, ".agents/skills/language-engineering/SKILL.md")), false);
  });
});

test("explicit conflict override replaces matching files but keeps unrelated user skills", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "old rules\n", "utf8");
    fs.mkdirSync(path.join(projectRoot, ".agents/skills/my-custom-skill"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".agents/skills/my-custom-skill/SKILL.md"), "my own skill\n", "utf8");
    const summary = installKit({
      packageRoot: kitRoot,
      projectRoot,
      platform: "generic",
      conflictMode: "overwrite"
    });

    assert.equal(summary.errors, 0);
    assert.equal(summary.overwritten, 1);
    assert.equal(fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8"), "template:AGENTS.md\n");
    assert.equal(
      fs.readFileSync(path.join(projectRoot, ".agents/skills/my-custom-skill/SKILL.md"), "utf8"),
      "my own skill\n"
    );
  });
});

test("force updates existing files explicitly", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "old rules\n", "utf8");
    const summary = installKit({
      packageRoot: kitRoot,
      projectRoot,
      platform: "generic",
      force: true
    });
    assert.equal(summary.errors, 0);
    assert.equal(summary.overwritten, 1);
    assert.equal(
      fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8"),
      "template:AGENTS.md\n"
    );
  });
});

test("dry-run reports intended changes without writing", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const messages = [];
    const summary = installKit({
      packageRoot: kitRoot,
      projectRoot,
      platform: "generic",
      dryRun: true,
      log: (message) => messages.push(message)
    });
    assert.equal(summary.errors, 0);
    assert.ok(summary.copied > 0);
    assert.ok(messages.some((message) => message.startsWith("COPY:")));
    assert.equal(fs.existsSync(path.join(projectRoot, "AGENTS.md")), false);
  });
});


test("refuses to write through a symlinked directory", (t) => {
  withFixture(({ kitRoot, projectRoot }) => {
    const outside = path.join(path.dirname(projectRoot), "outside");
    fs.mkdirSync(outside, { recursive: true });
    const sentinel = path.join(outside, "AGENTS.md");
    fs.writeFileSync(sentinel, "keep private rules\\n", "utf8");
    try {
      fs.symlinkSync(outside, path.join(projectRoot, ".agents"), "dir");
    } catch (error) {
      if (error.code === "EPERM" && process.platform === "win32") {
        t.skip("symlink creation requires elevated privileges on this Windows host");
        return;
      }
      throw error;
    }

    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "generic" });
    assert.ok(summary.errors > 0);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "keep private rules\\n");
  });
});


test("refuses to write through a broken file symlink", (t) => {
  withFixture(({ kitRoot, projectRoot }) => {
    const outside = path.join(path.dirname(projectRoot), "outside");
    fs.mkdirSync(outside, { recursive: true });
    const target = path.join(outside, "should-not-be-created.md");
    try {
      fs.symlinkSync(target, path.join(projectRoot, "AGENTS.md"), "file");
    } catch (error) {
      if (error.code === "EPERM" && process.platform === "win32") {
        t.skip("symlink creation requires elevated privileges on this Windows host");
        return;
      }
      throw error;
    }

    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "generic" });
    assert.ok(summary.errors > 0);
    assert.equal(fs.existsSync(target), false);
  });
});

test("Claude profile copies skills into the native skill directory", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "claude" });
    assert.equal(summary.errors, 0);
    assert.ok(fs.existsSync(path.join(projectRoot, "CLAUDE.md")));
    assert.equal(
      fs.readFileSync(path.join(projectRoot, ".claude/skills/language-engineering/SKILL.md"), "utf8"),
      "template:.agents/skills/language-engineering/SKILL.md\n"
    );
  });
});


test("OpenCode profile installs specialist agents and local usage plugin", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "opencode" });
    assert.equal(summary.errors, 0);
    for (const relative of [
      ".opencode/agents/designer.md",
      ".opencode/agents/service-strategist.md",
      ".opencode/agents/planner.md",
      ".opencode/plugins/uca-usage.mjs",
      "scripts/uca-usage.cjs",
      "AGENT-SKILL-MAP.md",
      "USAGE-PRIVACY.md"
    ]) {
      assert.ok(fs.existsSync(path.join(projectRoot, relative)), `Expected OpenCode/routing/usage file missing: ${relative}`);
    }
  });
});

test("Devin profile copies its own adapter", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "devin" });
    assert.equal(summary.errors, 0);
    assert.ok(fs.existsSync(path.join(projectRoot, ".devin/rules/universal-coding-agent-kit.md")));
    assert.equal(fs.existsSync(path.join(projectRoot, ".windsurf/rules/universal-coding-agent-kit.md")), false);
  });
});

test("Windsurf profile copies its own adapter, not the Devin adapter", () => {
  withFixture(({ kitRoot, projectRoot }) => {
    const summary = installKit({ packageRoot: kitRoot, projectRoot, platform: "windsurf" });
    assert.equal(summary.errors, 0);
    assert.ok(fs.existsSync(path.join(projectRoot, ".windsurf/rules/universal-coding-agent-kit.md")));
    assert.equal(fs.existsSync(path.join(projectRoot, ".devin/rules/universal-coding-agent-kit.md")), false);
  });
});
