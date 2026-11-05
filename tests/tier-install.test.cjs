"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { TIER_NAMES, installKit, parseArgs, suggestTier, tierSkillNames } = require("../bin/cli.cjs");

const PACKAGE_ROOT = path.join(__dirname, "..");
const CLI = path.join(PACKAGE_ROOT, "bin", "cli.cjs");
const LITE_SKILLS = ["anti-ai-slop", "anti-hallucination", "debugging", "import-hygiene"];
// Standard installs every skill; the router loads one primary and at most one companion per task.
const STANDARD_SKILLS = fs.readdirSync(path.join(PACKAGE_ROOT, ".agents", "skills")).sort();

function withProject(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-tier-test-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const list = (root, relative) => fs.readdirSync(path.join(root, relative)).sort();
const exists = (root, relative) => fs.existsSync(path.join(root, relative));
const install = (root, options) =>
  installKit({ packageRoot: PACKAGE_ROOT, projectRoot: root, platform: "claude", ...options });

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30_000 });
}

test("parses valid tiers and rejects invalid or missing tier values", () => {
  for (const tier of TIER_NAMES) assert.equal(parseArgs(["--tier", tier]).tier, tier);
  assert.equal(parseArgs([]).tier, null);
  assert.throws(() => parseArgs(["--tier", "huge"]), /Unknown tier "huge"\. Choose: lite, standard, full\./);
  assert.throws(() => parseArgs(["--tier"]), /requires a tier name/);
  assert.throws(() => parseArgs(["--tier", "--force"]), /requires a tier name/);
});

test("parses --context and rejects values that are not positive whole numbers", () => {
  assert.equal(parseArgs(["--context", "8000"]).context, 8000);
  for (const bad of ["0", "-5", "abc", "1.5", ""]) {
    assert.throws(() => parseArgs(["--context", bad]), /positive whole number/, `value: "${bad}"`);
  }
  assert.throws(() => parseArgs(["--context"]), /positive whole number/);
});

test("suggestTier uses the planned boundaries", () => {
  assert.equal(suggestTier(1), "lite");
  assert.equal(suggestTier(8000), "lite");
  assert.equal(suggestTier(8001), "standard");
  assert.equal(suggestTier(32000), "standard");
  assert.equal(suggestTier(32001), "full");
});

test("--context only prints a suggestion and never changes the selected tier", () => {
  withProject((root) => {
    const result = runCli(["init", root, "--platform", "generic", "--yes", "--dry-run", "--context", "4000"], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Suggested tier for 4000 tokens of context: lite \(suggestion only/);
    assert.match(result.stdout, /Tier: standard/);
  });
});

test("an invalid --tier exits with status 2 and a clear message", () => {
  withProject((root) => {
    const result = runCli(["init", root, "--tier", "huge"], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown tier "huge"/);
    assert.equal(fs.readdirSync(root).length, 0, "nothing should be installed");
  });
});

test("lite installs only the lite core, four skills, and a tiny AGENTS.md", () => {
  withProject((root) => {
    const summary = install(root, { tier: "lite" });
    assert.equal(summary.errors, 0);
    assert.deepEqual(list(root, ".agents/skills"), LITE_SKILLS);
    assert.deepEqual(list(root, ".claude/skills"), LITE_SKILLS);
    assert.equal(fs.readFileSync(path.join(root, ".agents/CORE.md"), "utf8"),
      fs.readFileSync(path.join(PACKAGE_ROOT, ".agents/lite/CORE.md"), "utf8"));
    assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /# UCA Lite/);
    for (const absent of [".agents/workflows", ".agents/core-policy-full.md", ".agents/catalog", "scripts/uca-usage.cjs"]) {
      assert.equal(exists(root, absent), false, `lite should not install ${absent}`);
    }
    assert.deepEqual(list(root, "scripts"), ["uca-guard.cjs", "uca-project-check.cjs", "uca-project-discover.cjs"], "lite should install only the handoff guard and the two project-card scripts");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".uca/config.json"), "utf8")), { tier: "lite" });
  });
});

test("lite skills are the condensed versions, not the full skill files", () => {
  withProject((root) => {
    install(root, { tier: "lite" });
    const installed = fs.readFileSync(path.join(root, ".agents/skills/debugging/SKILL.md"), "utf8");
    assert.match(installed, /# Debugging \(Lite\)/);
  });
});

test("standard installs every skill, the standard core, and shared policy files", () => {
  withProject((root) => {
    const summary = install(root, { tier: "standard" });
    assert.equal(summary.errors, 0);
    assert.deepEqual(list(root, ".agents/skills"), STANDARD_SKILLS);
    assert.deepEqual(list(root, ".claude/skills"), STANDARD_SKILLS);
    assert.match(fs.readFileSync(path.join(root, ".agents/CORE.md"), "utf8"), /# UCA Standard Core/);
    assert.match(fs.readFileSync(path.join(root, ".agents/skills/debugging/SKILL.md"), "utf8"), /# Debugging Playbook/);
    assert.ok(exists(root, ".agents/router-rule.md"));
    assert.ok(exists(root, ".agents/workflows/stack-migration.md"));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".uca/config.json"), "utf8")), { tier: "standard" });
  });
});

test("full installs every skill and the full core", () => {
  withProject((root) => {
    const summary = install(root, { tier: "full" });
    assert.equal(summary.errors, 0);
    const canonical = fs.readdirSync(path.join(PACKAGE_ROOT, ".agents/skills")).sort();
    assert.deepEqual(list(root, ".agents/skills"), canonical);
    assert.deepEqual(list(root, ".claude/skills"), canonical);
    assert.match(fs.readFileSync(path.join(root, ".agents/CORE.md"), "utf8"), /## Subagent dispatch/);
  });
});

test("every tier and platform installs without errors", () => {
  const platforms = ["generic", "codex", "cursor", "claude", "gemini", "copilot", "opencode", "devin", "windsurf", "junie", "jetbrains"];
  for (const tier of TIER_NAMES) {
    for (const platform of platforms) {
      withProject((root) => {
        const summary = installKit({ packageRoot: PACKAGE_ROOT, projectRoot: root, platform, tier });
        assert.equal(summary.errors, 0, `${tier}/${platform} reported errors`);
        assert.ok(exists(root, ".agents/CORE.md"), `${tier}/${platform}: missing .agents/CORE.md`);
      });
    }
  }
});

test("a profile narrows the tier's skills and never adds skills the tier lacks", () => {
  assert.deepEqual(tierSkillNames("standard", "minimal").sort(), ["anti-ai-slop", "anti-hallucination", "skill-gap-router"]);
  assert.deepEqual(tierSkillNames("full", "minimal").sort(), ["anti-ai-slop", "anti-hallucination", "skill-gap-router"]);
  withProject((root) => {
    install(root, { tier: "standard", profile: "minimal" });
    assert.deepEqual(list(root, ".agents/skills"), ["anti-ai-slop", "anti-hallucination", "skill-gap-router"]);
    assert.deepEqual(list(root, ".claude/skills"), ["anti-ai-slop", "anti-hallucination", "skill-gap-router"]);
  });
});

test("a profile that shares no skills with the tier is an error, not an empty install", () => {
  withProject((root) => {
    // Use a private copy of the CLI so a throwaway profile file can replace the real one.
    const copy = path.join(root, "pkg");
    fs.mkdirSync(path.join(copy, "bin"), { recursive: true });
    fs.mkdirSync(path.join(copy, ".agents", "profiles"), { recursive: true });
    fs.copyFileSync(CLI, path.join(copy, "bin", "cli.cjs"));
    fs.copyFileSync(path.join(PACKAGE_ROOT, "bin", "detect.cjs"), path.join(copy, "bin", "detect.cjs"));
    fs.copyFileSync(path.join(PACKAGE_ROOT, ".agents", "tiers.json"), path.join(copy, ".agents", "tiers.json"));
    fs.writeFileSync(
      path.join(copy, ".agents", "profiles", "profiles.json"),
      JSON.stringify({ alien: { skills: ["backend-api"] } })
    );
    const isolated = require(path.join(copy, "bin", "cli.cjs"));
    assert.throws(() => isolated.tierSkillNames("lite", "alien"), /shares no skills with the lite tier/);
  });
});

test("without a tier, --profile keeps the previous behavior and uses the full tier files", () => {
  withProject((root) => {
    const result = runCli(["init", root, "--platform", "claude", "--profile", "minimal", "--yes"], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Tier: full/);
    assert.deepEqual(list(root, ".agents/skills"), ["anti-ai-slop", "anti-hallucination", "skill-gap-router"]);
  });
});

test("non-interactive runs without --tier use the standard tier", () => {
  withProject((root) => {
    const result = runCli(["init", root, "--platform", "generic", "--yes"], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Tier: standard/);
    assert.deepEqual(list(root, ".agents/skills"), STANDARD_SKILLS);
  });
});

test("existing files and config are preserved by default and replaced only with force", () => {
  withProject((root) => {
    fs.mkdirSync(path.join(root, ".uca"), { recursive: true });
    fs.writeFileSync(path.join(root, ".uca/config.json"), '{"tier":"full","note":"mine"}\n');
    fs.writeFileSync(path.join(root, "AGENTS.md"), "my own rules\n");
    const kept = install(root, { tier: "lite" });
    assert.equal(kept.errors, 0);
    assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), "my own rules\n");
    assert.match(fs.readFileSync(path.join(root, ".uca/config.json"), "utf8"), /"note":"mine"/);
    const forced = install(root, { tier: "lite", force: true });
    assert.equal(forced.errors, 0);
    assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /# UCA Lite/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".uca/config.json"), "utf8")), { tier: "lite" });
  });
});

test("dry-run with a tier writes nothing, including the config", () => {
  withProject((root) => {
    const lines = [];
    const summary = install(root, { tier: "standard", dryRun: true, log: (line) => lines.push(line) });
    assert.equal(summary.errors, 0);
    assert.equal(fs.readdirSync(root).length, 0);
    assert.ok(lines.some((line) => line.includes(".uca/config.json")), "dry-run should list the config file");
  });
});

test("installing without a tier keeps the earlier behavior and writes no core or config", () => {
  withProject((root) => {
    const summary = install(root, {});
    assert.equal(summary.errors, 0);
    assert.equal(exists(root, ".agents/CORE.md"), false);
    assert.equal(exists(root, ".uca/config.json"), false);
    assert.deepEqual(list(root, ".uca"), ["manifest.json"], "only the install manifest is written");
    assert.equal(list(root, ".agents/skills").length, fs.readdirSync(path.join(PACKAGE_ROOT, ".agents/skills")).length);
  });
});

test("installing refuses to write the config through a symlinked .uca directory", (t) => {
  withProject((root) => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "uca-elsewhere-"));
    t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
    try {
      fs.symlinkSync(elsewhere, path.join(root, ".uca"), "dir");
    } catch {
      t.skip("symlinks are not available on this system");
      return;
    }
    const summary = install(root, { tier: "lite" });
    assert.ok(summary.errors > 0, "a symlinked .uca directory should be reported as an error");
    assert.equal(fs.existsSync(path.join(elsewhere, "config.json")), false);
  });
});

test("every tier installs the handoff guard, and it runs from the installed copy", () => {
  for (const tier of TIER_NAMES) {
    withProject((root) => {
      const summary = install(root, { tier });
      assert.equal(summary.errors, 0);
      assert.ok(exists(root, "scripts/uca-guard.cjs"), `${tier} should install the handoff guard`);
      const result = require("node:child_process").spawnSync(process.execPath, [path.join(root, "scripts/uca-guard.cjs"), "run", "--", process.execPath, "-e", "process.exit(0)"], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, `${tier}: ${result.stdout}${result.stderr}`);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".uca/config.json"), "utf8")), { tier }, "the guard must leave the installed config alone");
    });
  }
});

test("every tier installs the PROJECT.md template and its staleness checker", () => {
  for (const tier of TIER_NAMES) {
    withProject((root) => {
      const summary = install(root, { tier });
      assert.equal(summary.errors, 0);
      assert.ok(exists(root, ".agents/PROJECT-TEMPLATE.md"), `${tier} should install the PROJECT.md template`);
      assert.ok(exists(root, "scripts/uca-project-check.cjs"), `${tier} should install the staleness checker`);
      assert.ok(exists(root, "scripts/uca-project-discover.cjs"), `${tier} should install the project discovery script`);
      assert.equal(exists(root, "scripts/uca-route.cjs"), tier !== "lite", `${tier}: the reference router belongs with the router rule, not in lite`);
    });
  }
});

test("a look-and-feel task routes to a skill the default install actually contains", () => {
  const { route } = require(path.join(PACKAGE_ROOT, "scripts", "uca-route.cjs"));
  for (const task of ["make my landing page look beautiful", "redesign the dashboard so it does not look generic"]) {
    const primary = route(task).primary.name;
    assert.equal(primary, "design-taste-discovery", task);
    assert.ok(STANDARD_SKILLS.includes(primary), `${primary} is routed to but the standard tier does not install it`);
  }
  withProject((root) => {
    install(root, { tier: "standard" });
    assert.ok(exists(root, ".agents/skills/design-taste-discovery/SKILL.md"));
    assert.ok(exists(root, "scripts/uca-design-check.cjs"));
    assert.ok(exists(root, "UI-EFFECTS-GUIDE.md"));
  });
});

test("every skill and workflow the router can choose exists in a standard install", () => {
  const { ALL_SKILLS } = require(path.join(PACKAGE_ROOT, "scripts", "uca-route.cjs"));
  withProject((root) => {
    assert.equal(install(root, { tier: "standard" }).errors, 0);
    const missing = ALL_SKILLS.filter((name) => !exists(root, `.agents/skills/${name}/SKILL.md`));
    assert.deepEqual(missing, []);
    for (const workflow of ["new-project", "feature-development", "bug-investigation", "production-deployment", "stack-migration"]) {
      assert.ok(exists(root, `.agents/workflows/${workflow}.md`), workflow);
    }
  });
});
