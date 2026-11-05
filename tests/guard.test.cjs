"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-guard.cjs");
const guard = require(SCRIPT);

const OK = "process.exit(0)";
const boom = (n) => `console.error("Error: boom number ${n} at line ${n}"); process.exit(1)`;
const OTHER = 'console.error("TypeError: something else entirely"); process.exit(1)';
const SILENT_FAIL = "process.exit(1)";
const FILES = { "a.txt": "one\n", "b.txt": "two\n", "c.txt": "three\n", "d.txt": "four\n" };
const MODELS = [{ name: "small", tier: "lite" }, { name: "medium" }, { name: "large", tier: "full" }];

function project(config = { tier: "standard", models: MODELS }, files = FILES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-guard-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, name), body);
  if (config) {
    fs.mkdirSync(path.join(root, ".uca"));
    fs.writeFileSync(path.join(root, ".uca", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  }
  return root;
}
const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });
const read = (root, name) => fs.readFileSync(path.join(root, name), "utf8");
const state = (root) => JSON.parse(read(root, ".uca/state.json"));
const guardCli = (root, args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: "utf8", timeout: 60_000 });
const check = (root, code, extra = []) => guardCli(root, ["run", ...extra, "--", process.execPath, "-e", code]);

function withProject(fn, config, files) {
  const root = project(config, files);
  try {
    return fn(root);
  } finally {
    cleanup(root);
  }
}

test("redaction masks common secret shapes and leaves ordinary text alone", () => {
  const samples = [
    "Authorization: Bearer abc123.def456.ghi789",
    "password=hunter2hunter2",
    '{"api_key": "AbCdEf123456"}',
    "token: sk-abcdefghijklmnopqrstuvwx",
    "pushed with ghp_abcdefghijklmnopqrstuvwxyz0123",
    "postgres://admin:s3cretpass@db.internal/app",
    "DATABASE_URL=postgres://x",
    "STRIPE_LIVE=whatever",
    "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----"
  ];
  for (const sample of samples) {
    const out = guard.redact(sample);
    assert.match(out, /\[REDACTED/, `not redacted: ${sample}`);
    for (const secret of ["abc123.def456", "hunter2hunter2", "AbCdEf123456", "sk-abcdefghijkl", "ghp_abcdefghijkl", "s3cretpass", "postgres://x", "whatever", "MIIBOgIBAAJBAK"]) {
      assert.ok(!out.includes(secret), `${secret} survived in: ${out}`);
    }
  }
  for (const sample of ["curl failed: Bearer abcdefgh12345678", "Cookie: session=abc123; theme=dark", "Set-Cookie: id=xyz789"]) {
    const out = guard.redact(sample);
    assert.match(out, /\[REDACTED\]/, `not redacted: ${sample}`);
    for (const secret of ["abcdefgh12345678", "abc123", "xyz789"]) assert.ok(!out.includes(secret), `${secret} survived in: ${out}`);
  }
  const plain = "Error: Cannot find module './util' at src/index.js:12\n3 tests passed";
  assert.equal(guard.redact(plain), plain);
});

test("an error signature ignores numbers, paths and ids but still tells different errors apart", () => {
  const a = guard.errorSignature("Error: boom 12 at /home/x/app.js:44\n    at fn (0xdeadbeef)");
  const b = guard.errorSignature("Error: boom 97 at C:\\work\\app.js:3\n    at fn (0xabcdef12)");
  const c = guard.errorSignature("TypeError: x is not a function");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("failure counts are read from common runners and are null otherwise", () => {
  assert.equal(guard.failCountOf("# pass 5\n# fail 2\n"), 2);
  assert.equal(guard.failCountOf("Tests: 3 failed, 10 passed"), 3);
  assert.equal(guard.failCountOf("== 4 failed, 1 passed in 0.3s =="), 4);
  assert.equal(guard.failCountOf("something broke"), null);
});

test("garbled output is detected, coloured and empty output is not", () => {
  assert.equal(guard.looksGarbled("ok\u0000\u0000binary"), true);
  assert.equal(guard.looksGarbled("\ufffd".repeat(50) + "x"), true);
  assert.equal(guard.looksGarbled("\u001b[31mFAIL\u001b[0m tests/a.test.js"), false);
  assert.equal(guard.looksGarbled(""), false);
  assert.equal(guard.classify({ exitCode: 1, output: "", timedOut: false }), "empty");
  assert.equal(guard.classify({ exitCode: 0, output: "", timedOut: false }), "pass");
  assert.equal(guard.classify({ exitCode: null, output: "x", timedOut: true }), "timeout");
});

test("triggers are detected by code: same error twice, worse, 3+ files, empty, garbled, timeout", () => {
  const fail = (signature, failCount = null) => ({ status: "fail", signature, failCount });
  const pass = { status: "pass", failCount: 0 };
  const t = (previous, current, changedCount = 0) => guard.detectTriggers({ previous, current, changedCount });
  assert.deepEqual(t(null, fail("a")), [], "a first failure is not a trigger");
  assert.deepEqual(t(fail("a"), fail("a")), ["same error twice"]);
  assert.deepEqual(t(fail("a"), fail("b")), [], "a different error is not the same error");
  assert.deepEqual(t(pass, fail("a")), ["checks worse than the previous run"]);
  assert.deepEqual(t(fail("a", 1), fail("b", 3)), ["checks worse than the previous run"]);
  assert.deepEqual(t(fail("a", 3), fail("b", 1)), [], "fewer failures is better, not worse");
  assert.ok(t(fail("a"), fail("b"), 3).includes("3 or more files changed since the last passing state"));
  assert.deepEqual(t(fail("a"), fail("b"), 2), []);
  assert.deepEqual(t(null, { status: "empty" }), ["empty output"]);
  assert.deepEqual(t(null, { status: "garbled" }), ["garbled output"]);
  assert.deepEqual(t(null, { status: "timeout" }), ["timeout"]);
  assert.deepEqual(t(pass, pass, 9), [], "a passing run never triggers");
});

test("paths from the state file cannot leave the project, and Windows separators are handled", () => {
  const root = path.resolve("/tmp/uca-guard-root");
  for (const bad of ["../x", "..\\x", "a/../../x", "/etc/passwd", "\\\\server\\share", "C:\\Windows\\x", "", "a//b/", "a\0b"]) assert.equal(guard.safeJoin(root, bad), null, `accepted: ${JSON.stringify(bad)}`);
  assert.equal(guard.safeJoin(root, "src/a.txt"), path.join(root, "src", "a.txt"));
  assert.equal(guard.safeJoin(root, "src\\a.txt"), path.join(root, "src", "a.txt"));
  assert.equal(guard.toPosix("src\\deep\\a.txt", "\\"), "src/deep/a.txt");
});

test("a passing check is recorded, copied, and exits 0", () => {
  withProject((root) => {
    const result = check(root, OK, ["--goal", "make a.txt say two"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /check passed/);
    const saved = state(root);
    assert.equal(saved.lastPass.mirror, true);
    assert.equal(saved.goal, "make a.txt say two");
    assert.equal(read(root, ".uca/passing/a.txt"), FILES["a.txt"]);
  });
});

test("one failure with no earlier pass is not a trigger and exits 1", () => {
  withProject((root) => {
    const result = check(root, boom(1));
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /No handoff trigger yet/);
    assert.equal(fs.existsSync(path.join(root, "HANDOFF.md")), false);
  });
});

test("the same error twice triggers a handoff and names the next model with its tier", () => {
  withProject((root) => {
    assert.equal(check(root, boom(1)).status, 1);
    const second = check(root, boom(2));
    assert.equal(second.status, 3, second.stdout);
    assert.match(second.stdout, /same error twice/);
    assert.match(second.stdout, /Switch to model 2: medium \(tier: standard\)/);
    assert.match(second.stdout, /does not switch models/);
    assert.equal(state(root).modelIndex, 1);
  });
});

test("a model that gets worse after a pass is handed off, and the next run starts clean", () => {
  withProject((root) => {
    assert.equal(check(root, OK).status, 0);
    const worse = check(root, boom(1));
    assert.equal(worse.status, 3, worse.stdout);
    assert.match(worse.stdout, /checks worse than the previous run/);
    assert.match(worse.stdout, /Switch to model 2: medium/);
    const next = check(root, boom(1));
    assert.equal(next.status, 3, "the next model's first failure after the restored pass is also worse");
    const again = check(root, OK);
    assert.equal(again.status, 0, "a pass clears the way");
  });
});

test("3 or more changed files trigger a handoff", () => {
  withProject((root) => {
    assert.equal(check(root, OK).status, 0);
    for (const name of ["a.txt", "b.txt", "c.txt"]) fs.writeFileSync(path.join(root, name), "edited\n");
    const result = check(root, OTHER);
    assert.equal(result.status, 3);
    assert.match(result.stdout, /3 or more files changed/);
  });
});

test("empty output and a timeout each trigger a handoff", () => {
  withProject((root) => {
    const empty = check(root, SILENT_FAIL);
    assert.equal(empty.status, 3, empty.stdout);
    assert.match(empty.stdout, /empty output/);
  });
  withProject((root) => {
    const slow = check(root, "setTimeout(() => {}, 20000)", ["--timeout", "300"]);
    assert.equal(slow.status, 3, slow.stdout + slow.stderr);
    assert.match(slow.stdout, /timeout/);
  });
});

test("the snapshot is saved, then the last passing state is restored, then HANDOFF.md is written", () => {
  withProject((root) => {
    assert.equal(check(root, OK).status, 0);
    fs.writeFileSync(path.join(root, "a.txt"), "broken\n");
    fs.writeFileSync(path.join(root, "new.txt"), "added\n");
    fs.rmSync(path.join(root, "d.txt"));
    const result = check(root, OTHER);
    assert.equal(result.status, 3, result.stdout);
    assert.equal(read(root, "a.txt"), FILES["a.txt"], "modified file restored");
    assert.equal(read(root, "d.txt"), FILES["d.txt"], "deleted file restored");
    assert.equal(fs.existsSync(path.join(root, "new.txt")), false, "added file removed");
    const backup = state(root).handoffs[0].backup;
    assert.equal(read(root, `${backup}/a.txt`), "broken\n", "the broken version was saved first");
    assert.equal(read(root, `${backup}/new.txt`), "added\n");
    const handoff = read(root, "HANDOFF.md");
    assert.match(handoff, /Restored the last passing state: 2 file\(s\) put back, 1 added file\(s\) removed/);
    const at = (text) => result.stdout.indexOf(text);
    assert.ok(at("Snapshot:") >= 0 && at("Snapshot:") < at("Restored the last passing state"), "the snapshot is saved before anything is restored");
    assert.ok(at("Restored the last passing state") < at("Wrote HANDOFF.md"), "restore comes before HANDOFF.md");
    assert.ok(at("Wrote HANDOFF.md") < at("Switch to model"), "the switch message comes last");
  });
});

test("the mirror follows the latest pass, so a later handoff restores the latest passing content", () => {
  withProject((root) => {
    assert.equal(check(root, OK).status, 0);
    fs.writeFileSync(path.join(root, "a.txt"), "second good version\n");
    assert.equal(check(root, OK).status, 0);
    fs.writeFileSync(path.join(root, "a.txt"), "bad\n");
    assert.equal(check(root, OTHER).status, 3);
    assert.equal(read(root, "a.txt"), "second good version\n");
  });
});

test("with no passing state nothing is restored and your files are left alone", () => {
  withProject((root) => {
    fs.writeFileSync(path.join(root, "a.txt"), "my work\n");
    const result = check(root, SILENT_FAIL);
    assert.equal(result.status, 3);
    assert.match(result.stdout, /Not restored: no check has passed yet/);
    assert.equal(read(root, "a.txt"), "my work\n");
    assert.match(read(root, "HANDOFF.md"), /Nothing was restored: no check has passed yet/);
  });
});

test("HANDOFF.md holds tool evidence only, the user's goal, and no secrets", () => {
  withProject((root) => {
    check(root, OK, ["--goal", "fix the login, my key is token=abcdef123456"]);
    const noisy = 'console.error("Error: failed with password=hunter2hunter2 and key sk-abcdefghijklmnopqrstuvwx"); process.exit(1)';
    assert.equal(check(root, noisy).status, 3);
    const handoff = read(root, "HANDOFF.md");
    assert.match(handoff, /from tool output only/);
    assert.match(handoff, /fix the login/);
    assert.match(handoff, /\[REDACTED\]/);
    assert.match(handoff, /Exit code: 1; result: fail/);
    assert.match(handoff, /re-run the checks and verify the repository state/);
    for (const secret of ["hunter2hunter2", "sk-abcdefghijkl", "abcdef123456"]) {
      assert.ok(!handoff.includes(secret), `${secret} leaked into HANDOFF.md`);
      assert.ok(!read(root, ".uca/state.json").includes(secret), `${secret} leaked into state.json`);
    }
  });
});

test("the last configured model failing prints STOP, exits non-zero, and never goes back", () => {
  withProject((root) => {
    const marker = path.join(root, "ran.txt");
    const first = check(root, SILENT_FAIL);
    assert.equal(first.status, 3);
    assert.equal(check(root, SILENT_FAIL).status, 3);
    const last = check(root, SILENT_FAIL);
    assert.equal(last.status, 4, last.stdout);
    assert.match(last.stdout, /STOP/);
    assert.match(read(root, "HANDOFF.md"), /No model is left on the list/);
    const later = check(root, `require("fs").writeFileSync(${JSON.stringify(marker)}, "x")`);
    assert.equal(later.status, 4);
    assert.equal(fs.existsSync(marker), false, "the check must not run again after STOP");
    assert.equal(state(root).modelIndex, 2, "never returns to an earlier model");
  });
});

test("with one model or none configured, the first trigger is a STOP", () => {
  for (const config of [{ models: [{ name: "only" }] }, { tier: "lite" }]) {
    withProject((root) => {
      const result = check(root, SILENT_FAIL);
      assert.equal(result.status, 4, result.stdout);
      assert.match(result.stdout, /STOP/);
    }, config);
  }
});

test("the guard never edits or reorders the user's model list", () => {
  withProject((root) => {
    const before = fs.readFileSync(path.join(root, ".uca", "config.json"));
    check(root, OK);
    check(root, boom(1));
    check(root, boom(1));
    check(root, SILENT_FAIL);
    guardCli(root, ["reset"]);
    assert.ok(before.equals(fs.readFileSync(path.join(root, ".uca", "config.json"))));
  });
});

test("an existing .gitignore gets the guard's entries once; none is created when absent", () => {
  withProject((root) => {
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules");
    check(root, OK);
    check(root, OK);
    const text = read(root, ".gitignore");
    assert.match(text, /^node_modules\nHANDOFF\.md\n\.uca\/state\.json\n\.uca\/guard\.lock\n\.uca\/backup\/\n\.uca\/passing\/\n$/);
    assert.equal(text.split("HANDOFF.md").length - 1, 1);
    assert.ok(!text.includes(".uca/manifest.json") && !/^\.uca\/$/m.test(text), "the shared manifest and config stay committable");
  });
  withProject((root) => {
    check(root, OK);
    assert.equal(fs.existsSync(path.join(root, ".gitignore")), false);
  });
});

test("the guard's own .gitignore edit is not counted as a changed file", () => {
  withProject((root) => {
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\n");
    check(root, OK);
    const result = check(root, OTHER);
    assert.equal(result.status, 3);
    assert.match(read(root, "HANDOFF.md"), /Files changed since the last passing state[\s\S]*- none recorded/);
  });
});

test("a tampered state file cannot make the guard write or delete outside the project", () => {
  withProject((root) => {
    check(root, OK);
    const saved = state(root);
    saved.lastPass.files["../outside.txt"] = "deadbeef";
    saved.lastPass.files["..\\outside2.txt"] = "deadbeef";
    fs.writeFileSync(path.join(root, ".uca", "state.json"), JSON.stringify(saved));
    fs.writeFileSync(path.join(root, "a.txt"), "x\n");
    const result = check(root, OTHER);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.equal(fs.existsSync(path.join(root, "..", "outside.txt")), false);
    assert.equal(fs.existsSync(path.join(root, "..", "outside2.txt")), false);
    assert.match(result.stdout, /skipped/);
  });
});

test("invalid config exits 2 with a clear message and runs nothing", () => {
  const cases = [
    [{ tier: "huge" }, /tier must be one of/],
    [{ models: [{ tier: "lite" }] }, /models\[0\] needs a name/],
    [{ models: [{ name: "x", tier: "tiny" }] }, /models\[0\]\.tier must be one of/],
    [{ checks: [1] }, /checks must be a list/],
    [{ allowGit: "yes" }, /allowGit must be true or false/]
  ];
  for (const [config, message] of cases) {
    withProject((root) => {
      const result = check(root, OK);
      assert.equal(result.status, 2, JSON.stringify(config));
      assert.match(result.stderr, message);
      assert.equal(fs.existsSync(path.join(root, ".uca", "state.json")), false);
    }, config);
  }
});

test("usage errors exit 2: unknown command, unknown option, missing value, bad timeout, nothing to run", () => {
  withProject((root) => {
    assert.equal(guardCli(root, ["bogus"]).status, 2);
    assert.equal(guardCli(root, ["run", "--nope", "--", "x"]).status, 2);
    assert.equal(guardCli(root, ["run", "--goal"]).status, 2);
    assert.equal(check(root, OK, ["--timeout", "abc"]).status, 2);
    const none = guardCli(root, ["run"]);
    assert.equal(none.status, 2);
    assert.match(none.stderr, /No check to run/);
  });
});

test("without a command after --, the checks listed in the config are run", () => {
  const command = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
  withProject((root) => {
    const result = guardCli(root, ["run"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /check passed/);
  }, { tier: "standard", checks: [command] });
});

test("a corrupt state file is reported and not overwritten", () => {
  withProject((root) => {
    fs.mkdirSync(path.join(root, ".uca"), { recursive: true });
    fs.writeFileSync(path.join(root, ".uca", "state.json"), "{ not json");
    const result = check(root, OK);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not valid JSON\. It was not overwritten/);
    assert.equal(read(root, ".uca/state.json"), "{ not json");
  });
});

test("a project with too many files is not tracked, and the guard says so instead of restoring badly", () => {
  withProject((root) => {
    const result = spawnSync(process.execPath, [SCRIPT, "run", "--", process.execPath, "-e", SILENT_FAIL], { cwd: root, encoding: "utf8", env: { ...process.env, UCA_GUARD_MAX_FILES: "2" } });
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.match(result.stdout, /more than 2 files/);
    assert.match(result.stdout, /Not restored: the project has too many files/);
    assert.equal(read(root, "a.txt"), FILES["a.txt"]);
  });
});

test("status shows the current model and reset clears the state but not the config", () => {
  withProject((root) => {
    check(root, OK);
    const status = JSON.parse(guardCli(root, ["status", "--json"]).stdout);
    assert.equal(status.model.name, "small");
    assert.equal(status.model.number, 1);
    assert.equal(status.lastPass.restorable, true);
    assert.match(guardCli(root, ["status"]).stdout, /Model: 1 of 3: small \(tier: lite\)/);
    const reset = guardCli(root, ["reset"]);
    assert.equal(reset.status, 0);
    assert.equal(fs.existsSync(path.join(root, ".uca", "state.json")), false);
    assert.equal(fs.existsSync(path.join(root, ".uca", "passing")), false);
    assert.equal(fs.existsSync(path.join(root, ".uca", "config.json")), true);
  });
});

test("the guard runs no Git commands and works in a folder that is not a Git repository", () => {
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.ok(!/["'`]git["'`]/.test(source) && !/\bgit (?:stash|reset|checkout|commit|clean)\b/.test(source.replace(/\/\/.*$/gm, "")), "the guard must not call Git");
  withProject((root) => {
    assert.equal(fs.existsSync(path.join(root, ".git")), false);
    assert.equal(check(root, OK).status, 0);
  });
});

test("a check that exits 0 but reports failures is not recorded as a pass", () => {
  assert.equal(guard.classify({ exitCode: 0, output: "# pass 3\n# fail 2\n", timedOut: false }), "fail");
  assert.equal(guard.classify({ exitCode: 0, output: "# pass 3\n# fail 0\n", timedOut: false }), "pass");
  withProject((root) => {
    const result = check(root, 'console.log("# fail 2"); process.exit(0)');
    assert.equal(result.status, 1, result.stdout);
    assert.equal(state(root).lastPass, null);
  });
});

test("changing the model list or the checks after the guard started is refused until a reset", () => {
  withProject((root) => {
    assert.equal(check(root, OK).status, 0);
    const file = path.join(root, ".uca", "config.json");
    const original = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, JSON.stringify({ tier: "standard", models: [...MODELS].reverse() }));
    const refused = check(root, OK);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /changed after the guard started/);
    assert.equal(guardCli(root, ["status"]).status, 2);
    fs.writeFileSync(file, original);
    assert.equal(check(root, OK).status, 0, "restoring the file clears the refusal");
    fs.writeFileSync(file, JSON.stringify({ tier: "standard", models: [{ name: "only-one" }] }));
    assert.equal(guardCli(root, ["reset"]).status, 0);
    assert.equal(check(root, OK).status, 0, "after a deliberate reset the new list is accepted");
  });
});

test("when checks are listed, a different command is refused, so a trivial command cannot fake a pass", () => {
  withProject((root) => {
    const refused = check(root, OK);
    assert.equal(refused.status, 2, refused.stdout);
    assert.match(refused.stderr, /is not in the "checks" list/);
    assert.equal(fs.existsSync(path.join(root, ".uca", "state.json")), false);
    const listed = guardCli(root, ["run", "--", "node", "--version"]);
    assert.equal(listed.status, 0, listed.stdout + listed.stderr);
  }, { tier: "standard", models: MODELS, checks: ["node --version"] });
});

test("files that usually hold secrets are never tracked, copied or restored", () => {
  withProject((root) => {
    assert.equal(check(root, OK).status, 0);
    for (const name of [".env", "key.pem", "id_rsa", "credentials.json", ".npmrc"]) {
      assert.equal(fs.existsSync(path.join(root, ".uca", "passing", name)), false, `${name} was copied into the mirror`);
      assert.ok(!Object.keys(state(root).lastPass.files).includes(name), `${name} is tracked`);
    }
    fs.writeFileSync(path.join(root, ".env"), "TOKEN=changed\n");
    assert.equal(check(root, OTHER).status, 3);
    assert.equal(read(root, ".env"), "TOKEN=changed\n", "an untracked secret file is left exactly as it was");
    const names = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? names(path.join(dir, entry.name)) : [entry.name])) : []);
    assert.deepEqual(names(path.join(root, ".uca", "backup")).filter((name) => /^\.env$/.test(name)), [], "a secret file must not be backed up");
  }, { tier: "standard", models: MODELS }, { ...FILES, ".env": "TOKEN=abc123\n", "key.pem": "PRIVATE", id_rsa: "PRIVATE", "credentials.json": "{}", ".npmrc": "//registry/:_authToken=abc\n" });
});

test("a symlinked folder cannot make a restore write outside the project", (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "uca-guard-outside-"));
  const root = project(null, {});
  try {
    fs.mkdirSync(path.join(root, ".uca"));
    fs.writeFileSync(path.join(root, ".uca", "config.json"), JSON.stringify({ models: MODELS }));
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "a.txt"), "inside\n");
    assert.equal(check(root, OK).status, 0);
    fs.rmSync(path.join(root, "src"), { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(root, "src"), "dir");
    } catch {
      t.skip("this system does not allow symlinks");
      return;
    }
    const result = check(root, OTHER);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.deepEqual(fs.readdirSync(outside), [], "nothing may be written through the symlink");
    assert.match(result.stdout, /skipped/);
    assert.equal(guard.withinRoot(root, path.join(root, "src", "a.txt")), false);
    assert.equal(guard.withinRoot(root, path.join(root, "plain", "new.txt")), true);
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test("a huge output is capped before it is redacted or stored", () => {
  withProject((root) => {
    const result = check(root, 'process.stdout.write("a".repeat(2000000) + "\\nError: the end"); process.exit(1)');
    assert.equal(result.status, 1, result.stdout.slice(-300));
    assert.ok(fs.statSync(path.join(root, ".uca", "state.json")).size < 40000, "the state file must stay small");
  });
});

test("only one guard run at a time: a fresh lock blocks, a stale one is cleared, and the lock is released", () => {
  withProject((root) => {
    const lock = path.join(root, ".uca", "guard.lock");
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, "999999");
    const blocked = check(root, OK);
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /Another guard run is in progress/);
    assert.equal(fs.existsSync(path.join(root, ".uca", "state.json")), false);
    const old = new Date(Date.now() - 3600 * 1000);
    fs.utimesSync(lock, old, old);
    assert.equal(check(root, OK).status, 0, "a lock older than the timeout plus a minute is stale");
    assert.equal(fs.existsSync(lock), false, "the lock is released after a run");
    assert.equal(check(root, boom(1)).status, 3);
    assert.equal(fs.existsSync(lock), false, "and after a handoff");
  });
});

test("every tier's core tells the agent to run checks through the guard", () => {
  for (const tier of ["lite", "standard", "full"]) {
    const core = fs.readFileSync(path.join(__dirname, "..", ".agents", tier, "CORE.md"), "utf8");
    assert.match(core, /node scripts\/uca-guard\.cjs run -- <check>/, `${tier} core does not mention the guard`);
    assert.match(core, /never edit the model list or run reset/, `${tier} core does not protect the model list`);
  }
});
