"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "../scripts/uca-usage.cjs");

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-usage-test-"));
  const env = { ...process.env, UCA_USAGE_FILE: path.join(dir, "private", "usage.json") };
  try { run({ dir, env, file: env.UCA_USAGE_FILE }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function invoke(args, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env, timeout: 10_000 });
}

test("records exact and estimated counters separately without storing prompt content", () => {
  fixture(({ env, file }) => {
    const exact = invoke(["record", "--source", "exact", "--input-tokens", "120", "--output-tokens", "30", "--agent-calls", "1", "--skill-reads", "2"], env);
    assert.equal(exact.status, 0, exact.stderr);
    const estimated = invoke(["record", "--source", "estimated", "--input-tokens", "50", "--output-tokens", "20", "--tool-calls", "3"], env);
    assert.equal(estimated.status, 0, estimated.stderr);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(data.totals.exact.inputTokens, 120);
    assert.equal(data.totals.exact.outputTokens, 30);
    assert.equal(data.totals.exact.agentCalls, 1);
    assert.equal(data.totals.exact.skillReads, 2);
    assert.equal(data.totals.estimated.inputTokens, 50);
    assert.equal(data.totals.estimated.outputTokens, 20);
    assert.equal(data.totals.estimated.toolCalls, 3);
    assert.equal(JSON.stringify(data).includes("PRIVATE_PROMPT"), false);
    const shown = invoke(["show"], env);
    assert.equal(shown.status, 0, shown.stderr);
    assert.match(shown.stdout, /exact 120 \| estimated 50/);
    assert.match(shown.stdout, /Total recorded tokens \(exact \+ estimated\): 220/);
  });
});

test("budget guard blocks an optional call that would exceed token or agent-call limits", () => {
  fixture(({ env }) => {
    const set = invoke(["budget", "--max-total-tokens", "100", "--max-agent-calls", "2"], env);
    assert.equal(set.status, 0, set.stderr);
    const record = invoke(["record", "--source", "exact", "--input-tokens", "80", "--agent-calls", "1"], env);
    assert.equal(record.status, 0, record.stderr);
    const blocked = invoke(["guard", "--planned-tokens", "21", "--planned-agent-calls", "2"], env);
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /BLOCKED/);
    assert.match(blocked.stderr, /token limit would be exceeded/);
    assert.match(blocked.stderr, /agent-call limit would be exceeded/);
  });
});

test("budget emits a warning once the recorded amount reaches a configured threshold", () => {
  fixture(({ env }) => {
    assert.equal(invoke(["budget", "--max-total-tokens", "100"], env).status, 0);
    assert.equal(invoke(["record", "--source", "estimated", "--input-tokens", "80"], env).status, 0);
    const shown = invoke(["show"], env);
    assert.equal(shown.status, 0, shown.stderr);
    assert.match(shown.stdout, /WARNING: recorded tokens .*80%/);
  });
});

test("reset clears recorded counters but preserves the configured budget", () => {
  fixture(({ env, file }) => {
    invoke(["budget", "--max-total-tokens", "500"], env);
    invoke(["record", "--source", "exact", "--input-tokens", "100"], env);
    const reset = invoke(["reset"], env);
    assert.equal(reset.status, 0, reset.stderr);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(data.totals.exact.inputTokens, 0);
    assert.equal(data.budget.maxTotalTokens, 500);
  });
});

test("keeps cache/reasoning token counters and estimated host cost distinct", () => {
  fixture(({ env, file }) => {
    const result = invoke([
      "record", "--source", "exact",
      "--input-tokens", "100",
      "--output-tokens", "20",
      "--reasoning-tokens", "5",
      "--cache-read-tokens", "10",
      "--cache-write-tokens", "3",
      "--cost-source", "estimated",
      "--cost-usd", "0.025"
    ], env);
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(data.totals.exact.inputTokens, 100);
    assert.equal(data.totals.exact.outputTokens, 20);
    assert.equal(data.totals.exact.reasoningTokens, 5);
    assert.equal(data.totals.exact.cacheReadTokens, 10);
    assert.equal(data.totals.exact.cacheWriteTokens, 3);
    assert.equal(data.totals.exact.costUsd, 0);
    assert.equal(data.totals.estimated.costUsd, 0.025);
    const shown = invoke(["show"], env);
    assert.equal(shown.status, 0, shown.stderr);
    assert.match(shown.stdout, /Total recorded tokens \(exact \+ estimated\): 138/);
    assert.match(shown.stdout, /\$0 exact-source \| \$0.025 estimated-source/);
  });
});

test("blocks unknown future consumption when a hard budget has no call reservation", () => {
  fixture(({ env }) => {
    const set = invoke(["budget", "--max-total-tokens", "500", "--max-cost-usd", "0.10"], env);
    assert.equal(set.status, 0, set.stderr);
    const blocked = invoke(["guard", "--planned-agent-calls", "1"], env);
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /planned tokens for the next agent call are unknown/);
    assert.match(blocked.stderr, /planned cost for the next agent call is unknown/);

    const reserve = invoke([
      "budget", "--planned-agent-tokens", "100", "--planned-agent-cost-usd", "0.02"
    ], env);
    assert.equal(reserve.status, 0, reserve.stderr);
    const pass = invoke(["guard", "--planned-agent-calls", "1"], env);
    assert.equal(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, /reserving 100 planned tokens/);
    assert.match(pass.stdout, /reserving \$0.02 planned cost/);
  });
});

test("uses per-agent token and cost reservations when checking a budget", () => {
  fixture(({ env }) => {
    const set = invoke([
      "budget", "--max-total-tokens", "500",
      "--max-agent-calls", "3",
      "--max-cost-usd", "0.05",
      "--planned-agent-tokens", "300",
      "--planned-agent-cost-usd", "0.03"
    ], env);
    assert.equal(set.status, 0, set.stderr);
    const record = invoke([
      "record", "--source", "exact", "--input-tokens", "250",
      "--cost-source", "estimated", "--cost-usd", "0.03"
    ], env);
    assert.equal(record.status, 0, record.stderr);
    const blocked = invoke(["guard", "--planned-agent-calls", "1"], env);
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /token limit would be exceeded/);
    assert.match(blocked.stderr, /cost limit would be exceeded/);
    assert.match(blocked.stdout, /reserving 300 planned tokens/);
    assert.match(blocked.stdout, /reserving \$0.03 planned cost/);
  });
});

test("refuses a usage data-file symlink rather than following it", (t) => {
  fixture(({ dir, env }) => {
    const target = path.join(dir, "actual.json");
    fs.writeFileSync(target, JSON.stringify({
      version: 1,
      updatedAt: null,
      budget: { maxTotalTokens: null, maxAgentCalls: null, maxCostUsd: null, warningThresholds: [0.6, 0.8, 0.95] },
      totals: {
        exact: { inputTokens: 0, outputTokens: 0, agentCalls: 0, skillReads: 0, toolCalls: 0, costUsd: 0 },
        estimated: { inputTokens: 0, outputTokens: 0, agentCalls: 0, skillReads: 0, toolCalls: 0, costUsd: 0 }
      }
    }));
    fs.mkdirSync(path.dirname(env.UCA_USAGE_FILE), { recursive: true });
    try {
      fs.symlinkSync(target, env.UCA_USAGE_FILE, "file");
    } catch (error) {
      if (error.code === "EPERM" && process.platform === "win32") {
        t.skip("symlink creation requires elevated privileges on this Windows host");
        return;
      }
      throw error;
    }
    const result = invoke(["record", "--source", "exact", "--input-tokens", "1"], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symbolic link/);
    assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).totals.exact.inputTokens, 0);
  });
});

test("rejects unknown options rather than accepting/storing arbitrary content", () => {
  fixture(({ env, file }) => {
    const result = invoke(["record", "--source", "exact", "--input-tokens", "1", "--prompt", "PRIVATE_PROMPT"], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown option/);
    assert.equal(fs.existsSync(file), false);
  });
});
