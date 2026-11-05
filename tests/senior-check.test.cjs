"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-senior-check.cjs");
const { evaluate } = require(SCRIPT);

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-senior-"));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, ...name.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}
const cli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
const status = (report, id) => report.checks.find((check) => check.id === id).status;

const GOOD = {
  "package.json": JSON.stringify({ scripts: { test: "node --test", start: "node src/index.js" }, engines: { node: ">=18" }, dependencies: { zod: "1.0.0" } }),
  "package-lock.json": "{}",
  ".gitignore": "node_modules\n.env\n",
  ".env.example": "API_URL=\n",
  "README.md": `# Demo\n${"A small app that does one thing well. ".repeat(8)}\nInstall with npm install, then run npm start.\n`,
  "src/index.js": "const url = process.env.API_URL;\nconsole.log(url);\n",
  "src/util.js": "module.exports = {};\n",
  "tests/index.test.js": "// test\n"
};

test("a well-formed project passes every scored check", () => {
  const report = evaluate(project(GOOD));
  const failing = report.checks.filter((check) => check.status === "fail").map((check) => check.id);
  assert.deepEqual(failing, []);
  assert.equal(report.overall.percent, 100);
});

test("an empty folder has nothing to score and does not fail --min", () => {
  const dir = project({ "notes.txt": "hi" });
  const result = cli([dir, "--min", "90"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /nothing to score/i);
});

test("each missing basic is reported", () => {
  const report = evaluate(project({ "index.js": "console.log(1);\n", "package.json": "{}" }));
  for (const id of ["docs.readme", "tests.exist", "tests.command-declared", "deploy.run-command", "git.ignores-dependencies"]) {
    assert.equal(status(report, id), "fail", id);
  }
});

test("a hard-coded secret fails, and the value is never printed", () => {
  const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
  const dir = project({ ...GOOD, "src/leak.js": `const key = "${secret}";\n` });
  const result = cli([dir]);
  assert.match(result.stdout, /src\/leak\.js:1 OpenAI-style key/);
  assert.ok(!result.stdout.includes(secret));
  assert.ok(!cli([dir, "--json"]).stdout.includes(secret));
});

test("placeholder passwords are not flagged", () => {
  const report = evaluate(project({ ...GOOD, "src/cfg.js": 'const password = "your-password-here";\nconst apiKey = process.env.API_KEY;\n' }));
  assert.equal(status(report, "secrets.none-in-source"), "pass");
});

test("secret files are never read: contents do not appear anywhere", () => {
  const marker = "TOPSECRETVALUE1234567890abcdef";
  const dir = project({ ...GOOD, ".env": `TOKEN="${marker}"\n`, "server.key": marker, "secrets.js": `const password = "${marker}";\n` });
  const out = cli([dir, "--json"]).stdout + cli([dir]).stdout;
  assert.ok(!out.includes(marker));
  assert.equal(status(evaluate(dir), "secrets.none-in-source"), "pass");
});

test(".env not ignored by .gitignore fails", () => {
  const report = evaluate(project({ ...GOOD, ".gitignore": "node_modules\n" }));
  assert.equal(status(report, "config.env-ignored"), "fail");
});

test("missing .env.example fails when code reads env vars", () => {
  const files = { ...GOOD };
  delete files[".env.example"];
  assert.equal(status(evaluate(project(files)), "config.env-example"), "fail");
});

test("HTML checks: alt, lang, viewport", () => {
  const bad = evaluate(project({ "index.html": "<html><head></head><body><img src='a.png'></body></html>" }));
  assert.equal(status(bad, "a11y.img-alt"), "fail");
  assert.equal(status(bad, "a11y.html-lang"), "fail");
  assert.equal(status(bad, "a11y.viewport"), "fail");
  const good = evaluate(project({ "index.html": '<html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><img src="a.png" alt="x"></body></html>' }));
  for (const id of ["a11y.img-alt", "a11y.html-lang", "a11y.viewport"]) assert.equal(status(good, id), "pass", id);
});

test("a plain static site does not need a manifest or lockfile", () => {
  const report = evaluate(project({ "index.html": '<html lang="en"><head><meta name="viewport" content="width=device-width"></head><body></body></html>' }));
  assert.equal(status(report, "structure.manifest"), "na");
  assert.equal(status(report, "deploy.lockfile"), "na");
});

test("risky patterns are hints with file and line, not failures", () => {
  const report = evaluate(project({ ...GOOD, "src/bad.js": "const a = 1;\neval(a);\n" }));
  const risky = report.checks.find((check) => check.id === "hint.risky-patterns");
  assert.equal(risky.status, "hint");
  assert.match(risky.evidence[0], /src\/bad\.js:2 eval\(\)/);
});

test("--min returns 1 when below the threshold and 0 when met", () => {
  const dir = project({ "index.js": "x\n", "package.json": "{}" });
  assert.equal(cli([dir, "--min", "99"]).status, 1);
  assert.equal(cli([dir, "--min", "0"]).status, 0);
});

test("usage errors exit 2", () => {
  assert.equal(cli(["--bogus"]).status, 2);
  assert.equal(cli(["--min", "abc"]).status, 2);
  assert.equal(cli(["--min", "101"]).status, 2);
  assert.equal(cli([path.join(os.tmpdir(), "uca-no-such-dir-xyz")]).status, 2);
  assert.equal(cli(["a", "b"]).status, 2);
});

test("--json is valid and carries the disclaimer; --list lists ids", () => {
  const report = JSON.parse(cli([project(GOOD), "--json"]).stdout);
  assert.match(report.disclaimer, /not prove/);
  assert.ok(cli(["--list"]).stdout.includes("secrets.none-in-source"));
});

test("it is read-only: the project folder is unchanged", () => {
  const dir = project(GOOD);
  const snap = () => JSON.stringify(fs.readdirSync(dir, { recursive: false }).sort().map((n) => [n, fs.statSync(path.join(dir, n)).mtimeMs]));
  const before = snap();
  cli([dir]);
  assert.equal(snap(), before);
});

test("symlinks are not followed", { skip: process.platform === "win32" }, () => {
  const outside = project({ "secret.js": 'const password = "hunter2hunter2hunter2";\n' });
  const dir = project(GOOD);
  fs.symlinkSync(outside, path.join(dir, "linked"));
  fs.symlinkSync(path.join(outside, "secret.js"), path.join(dir, "src", "linked.js"));
  const report = evaluate(dir);
  assert.equal(status(report, "secrets.none-in-source"), "pass");
});

test("file cap is honoured and reported", () => {
  const files = {};
  for (let i = 0; i < 30; i += 1) files[`f${i}.js`] = "x\n";
  process.env.UCA_SENIOR_MAX_FILES = "10";
  try {
    const report = evaluate(project(files));
    assert.equal(report.truncated, true);
    assert.equal(report.filesScanned, 10);
  } finally {
    delete process.env.UCA_SENIOR_MAX_FILES;
  }
});

test("node_modules and generated kit folders are skipped", () => {
  const report = evaluate(project({ ...GOOD, "node_modules/x/index.js": 'const password = "hunter2hunter2hunter2";\n', ".agents/x.js": "eval(1)\n" }));
  assert.equal(status(report, "secrets.none-in-source"), "pass");
  assert.equal(status(report, "hint.risky-patterns"), "pass");
});

test("the scratch folder is not scanned", () => {
  const report = evaluate(project({ ...GOOD, ".uca-workspace/try.js": 'const password = "hunter2hunter2hunter2";\neval(1)\n' }));
  assert.equal(status(report, "secrets.none-in-source"), "pass");
  assert.equal(status(report, "hint.risky-patterns"), "pass");
});

test("the kit's own installed scripts do not count as the project's code", () => {
  const report = evaluate(project({ "index.html": '<html lang="en"><head><meta name="viewport" content="width=device-width"></head><body></body></html>', "scripts/uca-guard.cjs": "const e = process.env.HOME; eval(1);\n", "scripts/mine.js": "const e = process.env.MINE;\n" }));
  assert.equal(status(report, "hint.risky-patterns"), "pass");
  assert.equal(status(report, "config.env-ignored"), "fail", "the user's own script that reads env is still seen");
});
