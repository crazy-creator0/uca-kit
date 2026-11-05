"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-project-check.cjs");
const TEMPLATE = path.join(__dirname, "..", ".agents", "PROJECT-TEMPLATE.md");
const { extractSources, parseArgs, readVerifiedAt } = require(SCRIPT);

const gitAvailable = spawnSync("git", ["--version"]).status === 0;

function run(args, { cwd, env } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: env || process.env,
    encoding: "utf8",
    timeout: 30_000
  });
}

function withRepo(run_, { initGit = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-project-check-"));
  const sh = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  try {
    if (initGit) {
      sh("init", "-q");
      sh("config", "user.name", "Test User");
      sh("config", "user.email", "test@example.invalid");
      sh("config", "commit.gpgsign", "false");
    }
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"demo"}\n');
    fs.writeFileSync(path.join(root, "src", "main.js"), "console.log(1);\n");
    const commit = (message) => {
      sh("add", "-A");
      sh("commit", "-q", "-m", message);
      return sh("rev-parse", "HEAD");
    };
    run_({ root, sh, commit });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const card = (verifiedAt, body = "- Entry: src/main.js (source: src/main.js)\n- Node (source: package.json:1)\n") =>
  `# PROJECT.md\n\nVerified at: ${verifiedAt}\n\n## Stack\n${body}`;

test("extractSources keeps file paths, strips line numbers, and skips URLs and placeholders", () => {
  const { sources, placeholders } = extractSources(
    "a (source: src/a.js:12, docs/b.md#intro) b (source: https://example.com/x) c (source: <file>) d (source: lib/c.js:3-9)"
  );
  assert.deepEqual(sources.sort(), ["docs/b.md", "lib/c.js", "src/a.js"]);
  assert.equal(placeholders, 1);
});

test("extractSources keeps paths that contain parentheses, such as Next.js route groups", () => {
  const { sources } = extractSources("- Page /login (source: app/(auth)/login/page.tsx) and (source: app/(shop)/cart/page.tsx:4)");
  assert.deepEqual(sources.sort(), ["app/(auth)/login/page.tsx", "app/(shop)/cart/page.tsx"]);
});

test("readVerifiedAt returns the value after Verified at, or an empty string", () => {
  assert.equal(readVerifiedAt("x\nVerified at: abc1234\ny"), "abc1234");
  assert.equal(readVerifiedAt("no field here"), "");
});

test("parseArgs accepts a card path and --root, and rejects unknown options", () => {
  assert.deepEqual(parseArgs(["card.md", "--root", "."]), { card: "card.md", root: ".", help: false });
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
  assert.throws(() => parseArgs(["--root"]), /requires a directory/);
  assert.throws(() => parseArgs(["a.md", "b.md"]), /Unexpected extra argument/);
});

test("--help prints usage and exits 0", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /report PROJECT\.md facts that may be stale/);
});

test("a missing card exits 2", () => {
  const result = run([path.join(os.tmpdir(), "uca-no-such-dir", "PROJECT.md")]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /card not found/);
});

test("the unfilled template is reported as placeholders, not as current", () => {
  const result = run([TEMPLATE, "--root", os.tmpdir()]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /PLACEHOLDER/);
});

test("a card without a usable Verified at line is reported as unverified", () => {
  withRepo(({ root }) => {
    fs.writeFileSync(path.join(root, "PROJECT.md"), card("sometime last week"));
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /UNVERIFIED/);
  });
});

test("a card verified at HEAD with unchanged sources is current", { skip: !gitAvailable }, () => {
  withRepo(({ root, commit }) => {
    const head = commit("init");
    fs.writeFileSync(path.join(root, "PROJECT.md"), card(head));
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /No staleness found: 2 cited file\(s\)/);
  });
});

test("a source committed after the verified commit is reported as changed", { skip: !gitAvailable }, () => {
  withRepo(({ root, commit }) => {
    const head = commit("init");
    fs.writeFileSync(path.join(root, "PROJECT.md"), card(head));
    fs.writeFileSync(path.join(root, "src", "main.js"), "console.log(2);\n");
    commit("change entry point");
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /CHANGED: src\/main\.js differs from commit/);
    assert.doesNotMatch(result.stdout, /CHANGED: package\.json/);
  });
});

test("an uncommitted edit to a cited source is reported as changed", { skip: !gitAvailable }, () => {
  withRepo(({ root, commit }) => {
    const head = commit("init");
    fs.writeFileSync(path.join(root, "PROJECT.md"), card(head));
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"demo","version":"2"}\n');
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /CHANGED: package\.json/);
  });
});

test("an unknown commit hash is reported, not trusted", { skip: !gitAvailable }, () => {
  withRepo(({ root, commit }) => {
    commit("init");
    fs.writeFileSync(path.join(root, "PROJECT.md"), card("deadbeefdeadbeef"));
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /UNKNOWN: commit deadbeefdeadbeef was not found/);
  });
});

test("a missing cited file is reported", () => {
  withRepo(({ root }) => {
    fs.writeFileSync(path.join(root, "PROJECT.md"), card("2020-01-01", "- Gone (source: src/removed.js)\n"));
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /MISSING: src\/removed\.js/);
  }, { initGit: false });
});

test("a date-verified card flags sources modified after that date and keeps older ones", () => {
  withRepo(({ root }) => {
    const old = new Date("2020-01-01T00:00:00");
    fs.utimesSync(path.join(root, "package.json"), old, old);
    fs.writeFileSync(path.join(root, "PROJECT.md"), card("2020-06-01"));
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /CHANGED: src\/main\.js was modified after 2020-06-01/);
    assert.doesNotMatch(result.stdout, /CHANGED: package\.json/);
  }, { initGit: false });
});

test("a date-verified card with sources older than the date is current", () => {
  withRepo(({ root }) => {
    const old = new Date("2020-01-01T00:00:00");
    for (const file of ["package.json", path.join("src", "main.js")]) fs.utimesSync(path.join(root, file), old, old);
    fs.writeFileSync(path.join(root, "PROJECT.md"), card("2020-06-01"));
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 0, result.stdout);
  }, { initGit: false });
});

test("a source path outside the project is refused", () => {
  withRepo(({ root }) => {
    fs.writeFileSync(path.join(root, "PROJECT.md"), card("2020-06-01", "- Secret (source: ../outside.txt)\n"));
    const result = run(["PROJECT.md"], { cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /UNSAFE: source path is outside the project/);
  }, { initGit: false });
});

test("when git cannot be run, a commit-verified card is reported as unverifiable", () => {
  withRepo(({ root }) => {
    fs.writeFileSync(path.join(root, "PROJECT.md"), card("abc1234"));
    const result = run(["PROJECT.md"], { cwd: root, env: { ...process.env, PATH: path.join(root, "no-such-bin") } });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /UNKNOWN: git is not available/);
  }, { initGit: false });
});

test("the checker never edits the card or the cited files", { skip: !gitAvailable }, () => {
  withRepo(({ root, commit }) => {
    const head = commit("init");
    const cardPath = path.join(root, "PROJECT.md");
    fs.writeFileSync(cardPath, card(head));
    const before = fs.readFileSync(cardPath, "utf8");
    run(["PROJECT.md"], { cwd: root });
    assert.equal(fs.readFileSync(cardPath, "utf8"), before);
  });
});
