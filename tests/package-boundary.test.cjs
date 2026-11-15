"use strict";

// Playbook P0.4: the trust claims checked at the package boundary and at run time, not just by reading the source.
// 1. What `npm pack` really ships: only allowed paths, no secret-looking files even when one is dropped into a shipped folder.
// 2. What the installer and helper scripts really do when they run: no network, and no other program except
//    read-only git, recorded by hooks preloaded into the process.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function packedFiles() {
  const packed = spawnSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8", timeout: 120_000, shell: process.platform === "win32" });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  return JSON.parse(packed.stdout)[0].files.map((file) => file.path);
}

const SECRET_NAME = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|id_rsa[^/]*|id_ed25519[^/]*|[^/]*\.(?:pem|key|p12|pfx|log)|credentials(?:\.json)?|\.uca(?:-workspace)?\/.*)$/i;

test("every packed file is on the allow-list in package.json, and none looks like a secret", () => {
  const allow = require(path.join(ROOT, "package.json")).files.filter((entry) => !entry.startsWith("!"));
  const allowed = (file) => ["package.json", "README.md", "LICENSE"].includes(file) || allow.some((entry) => (entry.endsWith("/") ? file.startsWith(entry) : file === entry));
  const files = packedFiles();
  assert.deepEqual(files.filter((file) => !allowed(file)), [], "files outside the allow-list");
  assert.deepEqual(files.filter((file) => SECRET_NAME.test(file) && !/\.env\.example$/.test(file)), [], "secret-looking files");
});

test("a secret file dropped into a shipped folder is not packed", () => {
  const canaries = ["scripts/.env", "scripts/.env.local", ".agents/server.key", ".agents/skills/id_rsa", "bin/.npmrc", ".agents/debug.log", "scripts/cert.pem", ".agents/.uca-workspace/notes.md", ".agents/.uca/state.json"];
  const created = [];
  try {
    for (const relative of canaries) {
      const full = path.join(ROOT, ...relative.split("/"));
      if (fs.existsSync(full)) continue;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, "TEST_SECRET_DO_NOT_LEAK_7c1e\n");
      created.push(full);
    }
    const files = packedFiles();
    assert.deepEqual(canaries.filter((relative) => files.includes(relative)), [], "secret files would be published");
  } finally {
    for (const full of created) fs.rmSync(full, { force: true });
    for (const dir of [".agents/.uca-workspace", ".agents/.uca"]) fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  }
});

test("packed text files contain no credential patterns", () => {
  const patterns = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
    [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
    [/\bsk-[A-Za-z0-9]{32,}\b/, "OpenAI-style key"],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
    [/TEST_SECRET_DO_NOT_LEAK/, "test canary"]
  ];
  const hits = [];
  for (const file of packedFiles()) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const [pattern, label] of patterns) if (pattern.test(text)) hits.push(`${file}: ${label}`);
  }
  assert.deepEqual(hits, []);
});

// ---------- run time ----------

// Preloaded with --require. Records every attempt to open a network connection or start a program, then lets
// child_process calls through (so read-only git still works) and blocks network calls.
const HOOK = `
"use strict";
const fs = require("node:fs");
const log = process.env.UCA_TRACE_LOG;
const note = (kind, detail) => fs.appendFileSync(log, JSON.stringify({ kind, detail }) + "\\n");
const cp = require("node:child_process");
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  const original = cp[name];
  cp[name] = function traced(command, args) {
    note("program", { call: name, command: String(command), args: Array.isArray(args) ? args.map(String) : [] });
    return original.apply(this, arguments);
  };
}
const block = (kind) => function blocked() { note("network", kind); throw new Error("network blocked by test: " + kind); };
for (const mod of ["http", "https", "http2"]) { const m = require("node:" + mod); m.request = block(mod + ".request"); m.get = block(mod + ".get"); if (m.connect) m.connect = block(mod + ".connect"); }
const net = require("node:net"); net.connect = block("net.connect"); net.createConnection = block("net.createConnection");
const tls = require("node:tls"); tls.connect = block("tls.connect");
const dns = require("node:dns"); dns.lookup = block("dns.lookup"); dns.resolve = block("dns.resolve");
globalThis.fetch = block("fetch");
const wt = require("node:worker_threads"); wt.Worker = class { constructor() { note("program", { call: "Worker" }); throw new Error("worker blocked by test"); } };
`;

function traced(t, args, cwd, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-trace-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const hook = path.join(dir, "hook.cjs");
  const log = path.join(dir, "trace.log");
  fs.writeFileSync(hook, HOOK);
  fs.writeFileSync(log, "");
  const result = spawnSync(process.execPath, ["--require", hook, ...args], { cwd, encoding: "utf8", timeout: 120_000, env: { ...process.env, ...env, UCA_TRACE_LOG: log } });
  const events = fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { result, events };
}

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-boundary-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node -e 0" } }));
  fs.writeFileSync(path.join(dir, "index.html"), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>x</title></head><body></body></html>');
  return dir;
}

const CLI = path.join(ROOT, "bin", "cli.cjs");

test("init, doctor, diff, update and uninstall make no network request and start no program", (t) => {
  const dir = project(t);
  const runs = [
    ["init", dir, "--platform", "opencode", "--tier", "full", "--yes"],
    ["doctor", dir],
    ["diff", dir],
    ["update", dir],
    ["uninstall", dir, "--yes"]
  ];
  for (const args of runs) {
    const { result, events } = traced(t, [CLI, ...args], dir);
    assert.equal(result.status, 0, `${args[0]}: ${result.stdout}${result.stderr}`);
    assert.deepEqual(events, [], `${args[0]} did something it should not: ${JSON.stringify(events)}`);
  }
});

test("helper scripts make no network request and start no program except read-only git", (t) => {
  const dir = project(t);
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const usage = path.join(dir, "usage-ledger", "usage.json");
  const scripts = [
    ["scripts/uca-senior-check.cjs", dir],
    ["scripts/uca-design-check.cjs", path.join(dir, "index.html")],
    ["scripts/uca-project-discover.cjs", "--root", dir],
    ["scripts/uca-usage.cjs", "show"]
  ];
  const READ_ONLY_GIT = new Set(["ls-files", "rev-parse", "cat-file", "diff", "log", "status"]);
  for (const [script, ...args] of scripts) {
    const { result, events } = traced(t, [path.join(ROOT, script), ...args], dir, { UCA_USAGE_FILE: usage });
    assert.ok(result.status === 0 || result.status === 1, `${script} crashed: ${result.stderr}`);
    const network = events.filter((event) => event.kind === "network");
    const programs = events.filter((event) => event.kind === "program" && !(event.detail.command === "git" && READ_ONLY_GIT.has(event.detail.args[0])));
    assert.deepEqual(network, [], `${script} used the network`);
    assert.deepEqual(programs, [], `${script} started a program other than read-only git`);
  }
});

test("project discovery runs a command only when --verify names it", (t) => {
  const dir = project(t);
  const quiet = traced(t, [path.join(ROOT, "scripts", "uca-project-discover.cjs"), "--root", dir], dir);
  assert.deepEqual(quiet.events.filter((event) => event.kind === "program" && event.detail.command !== "git"), []);
  const asked = traced(t, [path.join(ROOT, "scripts", "uca-project-discover.cjs"), "--root", dir, "--verify", "node -e 0"], dir);
  const ran = asked.events.filter((event) => event.kind === "program" && event.detail.command !== "git").map((event) => event.detail.command);
  assert.deepEqual(ran, ["node -e 0"], "it must run exactly the named command");
});

test("the trust tests themselves catch a planted network call", (t) => {
  const dir = project(t);
  const planted = path.join(dir, "planted.cjs");
  fs.writeFileSync(planted, 'require("node:https").get("https://example.invalid/");');
  const { events } = traced(t, [planted], dir);
  assert.deepEqual(events.map((event) => event.kind), ["network"], "the network hook did not fire");
  const program = path.join(dir, "program.cjs");
  fs.writeFileSync(program, 'require("node:child_process").spawnSync("echo", ["hi"]);');
  assert.deepEqual(traced(t, [program], dir).events.map((event) => event.kind), ["program"], "the program hook did not fire");
});
