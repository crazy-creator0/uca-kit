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
