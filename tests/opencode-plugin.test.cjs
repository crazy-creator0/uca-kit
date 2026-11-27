"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const SCRIPT = path.resolve(__dirname, "../scripts/uca-usage.cjs");
const PLUGIN = path.resolve(__dirname, "../.opencode/plugins/uca-usage.js");

// The plugin is an ES module in a .js file (OpenCode loads .js and .ts plugins). This
// repository is CommonJS, so the tests load a copy with an .mjs name.
let loadCount = 0;
async function loadPlugin() {
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uca-plugin-load-")), "uca-usage-" + (loadCount += 1) + ".mjs");
  fs.copyFileSync(PLUGIN, copy);
  const mod = await import(pathToFileURL(copy).href);
  return { UcaUsagePlugin: mod.default.server, definition: mod.default };
}

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

    const { UcaUsagePlugin } = await loadPlugin();
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
    const { UcaUsagePlugin } = await loadPlugin();
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
      { loaded: "v1" },
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

test("OpenCode adapter in a folder without the kit: step log only, no ledger, no guard", async (t) => {
  // The no-kit eval arm is an empty folder plus this one plugin file, so both arms are counted the same way.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-opencode-bare-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const saved = { file: process.env.UCA_USAGE_FILE, steps: process.env.UCA_USAGE_STEPS };
  const usageFile = path.join(dir, "private", "usage.json");
  process.env.UCA_USAGE_FILE = usageFile;
  try {
    const { UcaUsagePlugin } = await loadPlugin();
    delete process.env.UCA_USAGE_STEPS;
    assert.deepEqual(await UcaUsagePlugin({ directory: dir, client: {} }), {}, "without a step log the plugin does nothing");

    const stepsFile = path.join(dir, "steps.jsonl");
    process.env.UCA_USAGE_STEPS = stepsFile;
    const hooks = await UcaUsagePlugin({ directory: dir, client: {} });
    const message = (id, input, finish) => ({ type: "message.updated", properties: { info: { id, role: "assistant", finish, time: { completed: Date.now() }, cost: 0, tokens: { input, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } } } });
    await hooks.event({ event: message("b1", 90, "tool-calls") });
    await hooks["tool.execute.before"]({ tool: "write" }, { args: { filePath: "/tmp/x/index.html", content: "PAGE" } });
    await hooks["tool.execute.after"]({ tool: "write" });
    await hooks["tool.execute.before"]({ tool: "task" }, { args: { prompt: "PRIVATE-PROMPT" } });
    await hooks["tool.execute.after"]({ tool: "task" });
    await hooks.event({ event: message("b2", 180, "stop") });
    await hooks.event({ event: message("b2", 180, "stop") });
    const text = fs.readFileSync(stepsFile, "utf8");
    for (const secret of ["/tmp/x", "PAGE", "PRIVATE-PROMPT"]) assert.equal(text.includes(secret), false, secret);
    assert.deepEqual(text.trim().split("\n").map((line) => { const { time, ...rest } = JSON.parse(line); return rest; }), [
      { loaded: "v1" },
      { step: 1, input: 90, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, finish: "tool-calls" },
      { afterStep: 1, tool: "write", kind: "write" },
      { afterStep: 1, tool: "task", kind: "agent" },
      { step: 2, input: 180, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, finish: "stop" }
    ]);
    assert.equal(fs.existsSync(usageFile), false, "no ledger is written without the kit");
    const { readStepLog, runFigures } = require(SCRIPT);
    const figures = runFigures(readStepLog(text));
    assert.deepEqual([figures.requests, figures.writes, figures.agents], [2, 1, 1]);
  } finally {
    for (const [key, value] of [["UCA_USAGE_FILE", saved.file], ["UCA_USAGE_STEPS", saved.steps]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("OpenCode plugin file: .js, one default export with id, server() for 1.x and setup() for 2.x", async () => {
  assert.equal(fs.existsSync(PLUGIN.replace(/\.js$/, ".mjs")), false, "an .mjs plugin is not loaded by OpenCode");
  const { definition } = await loadPlugin();
  assert.equal(definition.id, "uca.usage");
  assert.equal(typeof definition.server, "function");
  assert.equal(typeof definition.setup, "function");
  const source = fs.readFileSync(PLUGIN, "utf8");
  assert.equal(/^export (const|function|async)/m.test(source), false, "one default export only, so a host never starts it twice");
});

test("OpenCode 2.x setup: tool hooks and event stream write the same step log, once per message", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-opencode-v2-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const saved = { file: process.env.UCA_USAGE_FILE, steps: process.env.UCA_USAGE_STEPS };
  process.env.UCA_USAGE_FILE = path.join(dir, "private", "usage.json");
  const stepsFile = path.join(dir, "steps.jsonl");
  process.env.UCA_USAGE_STEPS = stepsFile;
  try {
    const { definition } = await loadPlugin();
    const hooks = {};
    const queue = [];
    let wake = null;
    const push = (event) => { queue.push(event); if (wake) { wake(); wake = null; } };
    const makeCtx = () => ({
      location: { directory: dir },
      tool: { hook: (name, fn) => { (hooks[name] ||= []).push(fn); } },
      event: {
        subscribe: ({ signal }) => ({
          async *[Symbol.asyncIterator]() {
            while (!signal.aborted) {
              if (!queue.length) await new Promise((resolve) => { wake = resolve; signal.addEventListener("abort", resolve, { once: true }); });
              while (queue.length) yield queue.shift();
            }
          }
        })
      }
    });
    const cleanup = definition.setup(makeCtx());
    assert.equal(definition.setup(makeCtx()), undefined, "a second client connection adds no second set of hooks");
    // The 2.x frame, as captured from OpenCode 2.x runs: tokens are on session.step.ended.
    const message = (id, input, finish) => ({ type: "session.step.ended", id: "evt-" + id, data: { sessionID: "ses_1", assistantMessageID: id, finish, rawFinish: finish, cost: 0, tokens: { input, output: 4, reasoning: 0, cache: { read: 0, write: 0 } } } });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    push({ type: "session.status", data: { secret: "PRIVATE" } });
    push({ type: "session.step.started", data: { assistantMessageID: "v2a", model: { id: "m" } } });
    push(message("v2a", 50, "tool-calls"));
    await settle();
    for (const fn of hooks["execute.before"]) await fn({ tool: "edit", id: "c1", input: { filePath: "/home/me/private/app.js", content: "SECRET" } });
    for (const fn of hooks["execute.before"]) await fn({ tool: "subagent", id: "c2", input: { prompt: "PRIVATE-PROMPT" } });
    push(message("v2b", 120, "stop"));
    push(message("v2b", 120, "stop"));
    await settle();
    cleanup();
    const text = fs.readFileSync(stepsFile, "utf8");
    for (const secret of ["PRIVATE", "/home/me", "SECRET"]) assert.equal(text.includes(secret), false, secret);
    assert.deepEqual(text.trim().split("\n").map((line) => { const { time, ...rest } = JSON.parse(line); return rest; }), [
      { loaded: "v2" },
      { eventType: "session.status" },
      { eventType: "session.step.started" },
      { eventType: "session.step.ended" },
      { step: 1, input: 50, output: 4, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, finish: "tool-calls" },
      { afterStep: 1, tool: "edit", kind: "write" },
      { afterStep: 1, tool: "subagent", kind: "agent" },
      { step: 2, input: 120, output: 4, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, finish: "stop" }
    ]);
  } finally {
    for (const [key, value] of [["UCA_USAGE_FILE", saved.file], ["UCA_USAGE_STEPS", saved.steps]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("Run summary: says which API started the plugin, warns when none did, and names event types when no request was counted", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-steps-notes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name, lines) => { const file = path.join(dir, name); fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); return file; };
  const started = write("started.jsonl", [{ loaded: "v1" }, { step: 1, input: 10, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, finish: "stop" }]);
  let result = run(SCRIPT, ["steps", started]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Plugin started: OpenCode v1 API\./);
  assert.doesNotMatch(result.stdout, /Skipped/);
  const old = write("old.jsonl", [{ step: 1, input: 10, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, finish: "stop" }]);
  result = run(SCRIPT, ["steps", old]);
  assert.match(result.stdout, /WARNING: no start line/);
  const shapes = write("shapes.jsonl", [{ loaded: "v2" }, { eventType: "session.status" }, { eventType: "message.part.updated" }]);
  result = run(SCRIPT, ["steps", shapes]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /host sent these event types: session\.status, message\.part\.updated/);
});
