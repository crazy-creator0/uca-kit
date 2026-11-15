"use strict";

// Playbook P0.3: the local usage ledger under concurrent writers and hostile or broken ledger files.
// A count may never be lost or silently rounded, and a broken ledger may never read as zero usage.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "../scripts/uca-usage.cjs");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-usage-adv-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "private", "usage.json");
  return { dir, file, env: { ...process.env, UCA_USAGE_FILE: file } };
}
const invoke = (args, env) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env, timeout: 20_000 });
const runAsync = (args, env) => new Promise((resolve) => {
  const child = spawn(process.execPath, [SCRIPT, ...args], { env });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (status) => resolve({ status, stderr }));
});
const ledger = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const valid = () => JSON.parse(JSON.stringify({
  version: 1,
  updatedAt: null,
  budget: { maxTotalTokens: null, maxAgentCalls: null, maxCostUsd: null, plannedTokensPerAgentCall: null, plannedCostUsdPerAgentCall: null, warningThresholds: [0.6, 0.8, 0.95] },
  totals: {
    exact: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, agentCalls: 0, skillReads: 0, toolCalls: 0, costUsd: 0 },
    estimated: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, agentCalls: 0, skillReads: 0, toolCalls: 0, costUsd: 0 }
  }
}));
const writeLedgerFile = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
};

test("concurrent writers never lose a count", async (t) => {
  const { file, env } = fixture(t);
  assert.equal(invoke(["record", "--source", "exact", "--input-tokens", "1"], env).status, 0);
  const writers = 16;
  const results = await Promise.all(Array.from({ length: writers }, () => runAsync(["record", "--source", "exact", "--input-tokens", "1", "--agent-calls", "1"], env)));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const totals = ledger(file).totals.exact;
  assert.equal(totals.inputTokens, writers + 1, "increments were lost");
  assert.equal(totals.agentCalls, writers, "agent calls were lost");
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((name) => name !== "usage.json"), [], "temporary or lock files were left behind");
});

test("a lock left by a crashed writer does not block forever, but a live one is respected", (t) => {
  const { file, env } = fixture(t);
  assert.equal(invoke(["record", "--source", "exact", "--input-tokens", "1"], env).status, 0);
  // A lock from a process that no longer exists is stale and is cleared.
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, at: new Date(Date.now() - 120_000).toISOString() }));
  const afterCrash = invoke(["record", "--source", "exact", "--input-tokens", "1"], env);
  assert.equal(afterCrash.status, 0, afterCrash.stderr);
  assert.equal(ledger(file).totals.exact.inputTokens, 2);
  // A fresh lock held by a live process (this test) makes the writer give up with an error, not write.
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  const blocked = invoke(["record", "--source", "exact", "--input-tokens", "1"], { ...env, UCA_USAGE_LOCK_WAIT_MS: "300" });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /busy|lock/i);
  assert.equal(ledger(file).totals.exact.inputTokens, 2, "a write happened while another process held the lock");
  fs.rmSync(`${file}.lock`);
});

test("token and call counters in the ledger file must be whole numbers", (t) => {
  const { file, env } = fixture(t);
  const data = valid();
  data.totals.exact.inputTokens = 1.5;
  writeLedgerFile(file, data);
  const result = invoke(["show"], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /inputTokens/);
});

test("a count that would pass the largest exact number is refused, not silently rounded", (t) => {
  const { file, env } = fixture(t);
  const data = valid();
  data.totals.exact.inputTokens = Number.MAX_SAFE_INTEGER - 1;
  writeLedgerFile(file, data);
  const before = fs.readFileSync(file, "utf8");
  const result = invoke(["record", "--source", "exact", "--input-tokens", "5"], env);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(fs.readFileSync(file, "utf8"), before, "the ledger was changed");
});

test("broken ledger contents are refused with an error, never shown as zero usage", (t) => {
  const cases = {
    "not JSON": "{oops",
    "wrong updatedAt": { ...valid(), updatedAt: "yesterday" },
    "unknown top-level field": { ...valid(), injected: "x" },
    "negative counter": (() => { const d = valid(); d.totals.estimated.toolCalls = -1; return d; })(),
    "infinite budget": (() => { const d = valid(); d.budget.maxTotalTokens = "Infinity"; return d; })(),
    "fractional token limit": (() => { const d = valid(); d.budget.maxTotalTokens = 10.5; return d; })(),
    "array instead of object": "[]",
    "too large": JSON.stringify({ ...valid(), padding: "x".repeat(2 * 1024 * 1024) })
  };
  for (const [name, content] of Object.entries(cases)) {
    const { file, env } = fixture(t);
    writeLedgerFile(file, content);
    const before = fs.readFileSync(file, "utf8");
    const show = invoke(["show"], env);
    assert.equal(show.status, 1, `${name}: show exited ${show.status}`);
    assert.doesNotMatch(show.stdout, /No usage recorded/, `${name}: shown as zero usage`);
    const record = invoke(["record", "--source", "exact", "--input-tokens", "1"], env);
    assert.equal(record.status, 1, `${name}: record exited ${record.status}`);
    assert.equal(fs.readFileSync(file, "utf8"), before, `${name}: the broken ledger was overwritten`);
  }
});

test("a linked folder for the ledger is refused, so writes cannot land elsewhere", (t) => {
  const { dir, env } = fixture(t);
  const elsewhere = path.join(dir, "elsewhere");
  fs.mkdirSync(elsewhere);
  try {
    fs.symlinkSync(elsewhere, path.join(dir, "private"), "dir");
  } catch {
    t.skip("this system does not allow symlinks");
    return;
  }
  const result = invoke(["record", "--source", "exact", "--input-tokens", "1"], env);
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(fs.readdirSync(elsewhere), [], "the ledger was written through the link");
});

test("an oversized ledger is refused before it is read, even when its contents are valid", (t) => {
  const { file, env } = fixture(t);
  writeLedgerFile(file, JSON.stringify(valid()) + " ".repeat(2 * 1024 * 1024));
  const show = invoke(["show"], env);
  assert.equal(show.status, 1, show.stdout);
  assert.match(show.stderr, /larger than/);
});

test("show refuses to read a ledger through a linked folder", (t) => {
  const { dir, env } = fixture(t);
  const elsewhere = path.join(dir, "elsewhere");
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(elsewhere, "usage.json"), JSON.stringify(valid()));
  try {
    fs.symlinkSync(elsewhere, path.join(dir, "private"), "dir");
  } catch {
    t.skip("this system does not allow symlinks");
    return;
  }
  const show = invoke(["show"], env);
  assert.equal(show.status, 1, show.stdout);
  assert.match(show.stderr, /link or not a folder/);
});

test("a writer clearing a stale lock never removes a newer live lock that replaced it", async (t) => {
  const { file, env } = fixture(t);
  assert.equal(invoke(["record", "--source", "exact", "--input-tokens", "1"], env).status, 0);
  const lock = `${file}.lock`;
  // A lock from a process that has exited, old enough to be judged stale.
  fs.writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 54321, at: "2026-01-01T00:00:00.000Z", token: "dead" }));
  const old = new Date(Date.now() - 5_000);
  fs.utimesSync(lock, old, old);
  // The writer pauses after judging it stale; meanwhile a live writer (this test) takes a new lock.
  const writer = runAsync(["record", "--source", "exact", "--input-tokens", "1"], { ...env, UCA_USAGE_TEST_STALE_DELAY_MS: "1500", UCA_USAGE_LOCK_WAIT_MS: "3000" });
  await new Promise((resolve) => setTimeout(resolve, 600));
  const live = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token: "live" });
  fs.writeFileSync(lock, live);
  const result = await writer;
  assert.equal(fs.existsSync(lock) && fs.readFileSync(lock, "utf8"), live, "the live lock was removed");
  assert.equal(ledger(file).totals.exact.inputTokens, 1, "the writer wrote while another writer held the lock");
  assert.equal(result.status, 1, "the writer should give up while the live lock is held");
  fs.rmSync(lock);
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((name) => name.includes(".stale-")), [], "a moved-aside lock was left behind");
});
