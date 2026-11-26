"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const SCRIPT = path.resolve(__dirname, "../scripts/uca-usage.cjs");
const PLUGIN = path.resolve(__dirname, "../.opencode/plugins/uca-usage.mjs");

function run(script, args, env = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env
  });
}

test("OpenCode adapter records final usage once and consults local subagent budget", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-opencode-plugin-test-"));
  const scriptDir = path.join(dir, "scripts");
  fs.mkdirSync(scriptDir, { recursive: true });
  const localScript = path.join(scriptDir, "uca-usage.cjs");
  fs.copyFileSync(SCRIPT, localScript);
  const usageFile = path.join(dir, "private", "usage.json");
  const previousUsageFile = process.env.UCA_USAGE_FILE;
  process.env.UCA_USAGE_FILE = usageFile;

  try {
    const budget = run(localScript, [
      "budget", "--max-total-tokens", "150", "--max-agent-calls", "1",
      "--max-cost-usd", "0.10", "--planned-agent-tokens", "10",
      "--planned-agent-cost-usd", "0.01"
    ]);
    assert.equal(budget.status, 0, budget.stderr);

    const { UcaUsagePlugin } = await import(pathToFileURL(PLUGIN).href);
    const toasts = [];
    const hooks = await UcaUsagePlugin({ directory: dir, client: { tui: { showToast: async ({ body }) => toasts.push(body) } } });
    const event = {
      type: "message.updated",
      properties: {
        info: {
          id: "message-test-id",
          role: "assistant",
          time: { completed: Date.now() },
          cost: 0.012,
          tokens: {
            input: 80,
            output: 10,
            reasoning: 5,
            cache: { read: 15, write: 2 }
          }
        }
      }
    };

    await hooks.event({ event });
    await hooks.event({ event }); // repeated final event must not count twice
    await hooks["tool.execute.before"]({ tool: "task" });
    await hooks["tool.execute.after"]({ tool: "skill" }, {});

    await assert.rejects(
      hooks["tool.execute.before"]({ tool: "task" }),
      /UCA Kit local usage budget check failed/
    );

    const ledger = JSON.parse(fs.readFileSync(usageFile, "utf8"));
    assert.equal(ledger.totals.exact.inputTokens, 80);
    assert.equal(ledger.totals.exact.outputTokens, 10);
    assert.equal(ledger.totals.exact.reasoningTokens, 5);
    assert.equal(ledger.totals.exact.cacheReadTokens, 15);
    assert.equal(ledger.totals.exact.cacheWriteTokens, 2);
    assert.equal(ledger.totals.exact.agentCalls, 1);
    assert.equal(ledger.totals.exact.toolCalls, 1);
    assert.equal(ledger.totals.exact.skillReads, 1);
    assert.equal(ledger.totals.estimated.costUsd, 0.012);
    assert.equal(ledger.totals.exact.costUsd, 0);
    assert.equal(JSON.stringify(ledger).includes("message-test-id"), false);
    assert.ok(toasts.some((toast) => /Usage heads-up/.test(toast.message)), "Expected a local usage-threshold toast.");
    assert.ok(toasts.some((toast) => /Near budget limit/.test(toast.message)), "Expected a high agent-usage toast.");
    assert.ok(toasts.some((toast) => toast.variant === "error" && /blocked an optional specialist call/.test(toast.message)), "Expected a toast when budget blocks a subagent.");
  } finally {
    if (previousUsageFile === undefined) delete process.env.UCA_USAGE_FILE;
    else process.env.UCA_USAGE_FILE = previousUsageFile;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("OpenCode adapter: the opt-in step log names token counts, tool kinds and kit files only", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-opencode-steps-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(dir, "scripts", "uca-usage.cjs"));
  const saved = { file: process.env.UCA_USAGE_FILE, steps: process.env.UCA_USAGE_STEPS };
  process.env.UCA_USAGE_FILE = path.join(dir, "private", "usage.json");
  const stepsFile = path.join(dir, "steps.jsonl");
  process.env.UCA_USAGE_STEPS = stepsFile;
  try {
    const { UcaUsagePlugin } = await import(pathToFileURL(PLUGIN).href + "?steps");
    const hooks = await UcaUsagePlugin({ directory: dir, client: {} });
    const message = (id, input, finish) => ({ type: "message.updated", properties: { info: { id, role: "assistant", finish, time: { completed: Date.now() }, cost: 0, tokens: { input, output: 7, reasoning: 0, cache: { read: 3, write: 0 } } } } });
    await hooks.event({ event: message("m1", 100, "tool-calls") });
    await hooks["tool.execute.before"]({ tool: "read" }, { args: { filePath: "C:\\proj\\.agents\\skills\\debugging\\SKILL.md" } });
    await hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "node scripts/uca-read.cjs design-taste-discovery --section \"Step 3\"" } });
    await hooks["tool.execute.before"]({ tool: "read" }, { args: { filePath: "/home/me/secret-project/src/app.js" } });
    await hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "cat .env" } });
    await hooks["tool.execute.before"]({ tool: "write" }, { args: { filePath: "/home/me/secret-project/index.html", content: "SECRET-CONTENT" } });
    await hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "node scripts/uca-page-check.cjs index.html --steps .uca-workspace/s.txt" } });
    await hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "npm test -- --token=SECRET-TOKEN" } });
    await hooks.event({ event: message("m2", 250, "stop") });
    await hooks.event({ event: message("m2", 250, "stop") });
    const text = fs.readFileSync(stepsFile, "utf8");
    for (const secret of ["secret-project", ".env", "SECRET-CONTENT", "SECRET-TOKEN", "page-check"]) assert.equal(text.includes(secret), false, secret);
    const lines = text.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(lines.map(({ time, ...rest }) => rest), [
      { step: 1, input: 100, output: 7, reasoning: 0, cacheRead: 3, cacheWrite: 0, cost: 0, finish: "tool-calls" },
      { afterStep: 1, tool: "read", kind: "read", kit: ".agents/skills/debugging/SKILL.md" },
      { afterStep: 1, tool: "bash", kind: "shell", kit: "uca-read design-taste-discovery --section \"Step 3\"" },
      { afterStep: 1, tool: "read", kind: "read" },
      { afterStep: 1, tool: "bash", kind: "shell" },
      { afterStep: 1, tool: "write", kind: "write" },
      { afterStep: 1, tool: "bash", kind: "check" },
      { afterStep: 1, tool: "bash", kind: "check" },
      { step: 2, input: 250, output: 7, reasoning: 0, cacheRead: 3, cacheWrite: 0, cost: 0, finish: "stop" }
    ]);
    // The summary reads what the plugin writes.
    const { readStepLog, runFigures } = require(SCRIPT);
    const figures = runFigures(readStepLog(text));
    assert.deepEqual([figures.requests, figures.replies, figures.reads, figures.writes, figures.checks, figures.shell, figures.readsBeforeFirstWrite], [2, 1, 2, 1, 2, 2, 2]);
  } finally {
    for (const [key, value] of [["UCA_USAGE_FILE", saved.file], ["UCA_USAGE_STEPS", saved.steps]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
