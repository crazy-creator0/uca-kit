import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// OpenCode plugin adapter for OpenCode 1.x (1.18.29 or newer: the default export's
// server()) and 2.x (its setup(ctx)). The file is .js because OpenCode's docs list .js
// and .ts plugins; an .mjs file did not start in a real run. It records only aggregate
// counters and provider-reported message usage; prompt, output, tool results and source code
// are never read by this plugin or passed to the usage ledger.
// Opt-in step log: when UCA_USAGE_STEPS names a file, each finished assistant
// message (one model request) adds one line with its token counts and how it
// ended (tool calls or a reply), and each tool call adds one line with the tool's
// name and a kind (read, write, check, shell, agent, other). A tool call that
// opens a kit file also names that file. No prompt, output, other path, command
// text or file content is written.
// The first line of a step log says which API started the plugin ({"loaded":"v1"} or
// {"loaded":"v2"}), so an empty log means the plugin did not start. On 2.x the log also
// names each event type seen once (names only), so a change in what the host sends shows.
// One process may start the plugin more than once (2.x runs setup once per client
// connection); messages are counted once by id, and only the first start per folder
// adds hooks.
const shared = (globalThis.__ucaUsageShared ??= { messages: new Set(), started: new Set() });

const createUsage = ({ directory, client }, api) => {
  const script = path.join(directory, "scripts", "uca-usage.cjs");
  const seenMessageIds = shared.messages;
  const highestWarnedLevel = new Map();

  const stepsFile = process.env.UCA_USAGE_STEPS || "";
  // Without the toolkit script there is no ledger or budget guard. The plugin then
  // only writes the step log, if one is asked for (this is how a no-kit eval arm is
  // counted: an empty folder plus this one file), and otherwise does nothing.
  const hasLedger = fs.existsSync(script);
  if (!hasLedger && !stepsFile) return null;

  const ledgerCall = (args) => spawnSync(process.env.UCA_USAGE_NODE || "node", [script, ...args], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 32 * 1024
  });

  const showToast = async (message, variant = "warning") => {
    // Usage visibility is best-effort; a missing TUI client must not break coding.
    try {
      if (typeof client?.tui?.showToast === "function") {
        await client.tui.showToast({ body: { message, variant } });
      }
    } catch {
      // The CLI usage summary remains available if this host cannot show a toast.
    }
  };

  const notifyThresholds = async (stdout) => {
    const highestInThisUpdate = new Map();
    for (const line of String(stdout || "").split(/\r?\n/)) {
      const match = line.match(/^WARNING: (.+?) is at (\d+)% of its configured limit/);
      if (!match) continue;
      const metric = match[1].replace(/ \(exact \+ estimated\)$/, "");
      const percent = Number(match[2]);
      const level = percent >= 95 ? 95 : percent >= 80 ? 80 : 60;
      const prior = highestInThisUpdate.get(metric);
      if (!prior || level > prior.level) highestInThisUpdate.set(metric, { level, percent });
    }
    for (const [metric, current] of highestInThisUpdate) {
      const previous = highestWarnedLevel.get(metric) || 0;
      if (current.level <= previous) continue;
      highestWarnedLevel.set(metric, current.level);
      const severity = current.level >= 95 ? "error" : "warning";
      const prefix = current.level >= 95 ? "Near budget limit" : current.level >= 80 ? "High usage" : "Usage heads-up";
      await showToast("UCA Kit: " + prefix + " — " + metric + " at " + current.percent + "%. Run node scripts/uca-usage.cjs show for details.", severity);
    }
  };

  let stepNumber = 0;
  const logStep = (entry) => {
    if (!stepsFile) return;
    try {
      fs.appendFileSync(stepsFile, JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n", "utf8");
    } catch {
      // The step log is optional; it must never break the host.
    }
  };
  logStep({ loaded: api });
  const seenTypes = new Set();
  const logEventType = (type) => {
    const name = String(type || "");
    if (!/^[a-z][a-z0-9._-]{0,59}$/i.test(name) || seenTypes.has(name)) return;
    seenTypes.add(name);
    logStep({ eventType: name });
  };
  // Only the kit's own files are named: the part of the path from ".agents/" on, or the
  // arguments of a scripts/uca-read.cjs call (skill names and headings). Nothing else.
  const kitTarget = (args) => {
    const file = String(args?.filePath || args?.path || "").replace(/\\/g, "/");
    const at = file.indexOf(".agents/");
    if (at !== -1) return file.slice(at);
    const command = String(args?.command || "");
    const read = command.match(/uca-read\.cjs\s+([^|;&<>]{1,120})/);
    return read ? "uca-read " + read[1].trim() : null;
  };
  // A coarse kind for each tool call, worked out here so the command itself is never written.
  const CHECK_COMMAND = /uca-[a-z-]*check\.cjs|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|node\s+--test\b|\b(?:pytest|vitest|jest|playwright\s+test|go\s+test|cargo\s+test)\b/i;
  const toolKind = (tool, args) => {
    const name = String(tool || "").toLowerCase();
    if (["read", "glob", "grep", "list", "ls", "skill", "webfetch"].includes(name)) return "read";
    if (["write", "edit", "patch", "multiedit"].includes(name)) return "write";
    if (["task", "subagent"].includes(name)) return "agent";
    if (["bash", "shell"].includes(name)) return CHECK_COMMAND.test(String(args?.command || "")) ? "check" : "shell";
    return "other";
  };

  const requireSuccess = (result, action) => {
    if (result.error) {
      throw new Error("UCA Kit local usage " + action + " failed; the local budget/usage guard was not verified. Check Node.js and USAGE-PRIVACY.md.");
    }
    if (result.status !== 0) {
      const details = String(result.stderr || result.stdout || "").trim().slice(0, 1200);
      throw new Error("UCA Kit local usage " + action + " failed (exit " + result.status + "). " + details);
    }
  };

  // A finalized assistant message carries per-message tokens and cost (1.x
  // message.updated: event.properties.info; on 2.x the same fields are looked for
  // under event.data). Interim updates are ignored so a message counts once.
  const onMessage = async (info) => {
      if (!info || info.role !== "assistant" || !info.time?.completed || !info.tokens || !info.id) return;
      if (seenMessageIds.has(info.id)) return;

      const tokens = info.tokens;
      const input = Number(tokens.input || 0);
      const output = Number(tokens.output || 0);
      const reasoning = Number(tokens.reasoning || 0);
      const cacheRead = Number(tokens.cache?.read || 0);
      const cacheWrite = Number(tokens.cache?.write || 0);
      const cost = Number(info.cost || 0);
      if (![input, output, reasoning, cacheRead, cacheWrite, cost].every((n) => Number.isFinite(n) && n >= 0)) return;
      if (input + output + reasoning + cacheRead + cacheWrite <= 0 && cost <= 0) return;

      const args = [
        "record", "--source", "exact",
        "--input-tokens", String(input),
        "--output-tokens", String(output),
        "--reasoning-tokens", String(reasoning),
        "--cache-read-tokens", String(cacheRead),
        "--cache-write-tokens", String(cacheWrite)
      ];
      if (cost > 0) args.push("--cost-source", "estimated", "--cost-usd", String(cost));
      stepNumber += 1;
      const finish = ["tool-calls", "stop", "length"].includes(info.finish) ? info.finish : undefined;
      logStep({ step: stepNumber, input, output, reasoning, cacheRead, cacheWrite, cost, ...(finish ? { finish } : {}) });
      if (!hasLedger) {
        seenMessageIds.add(info.id);
        return;
      }
      const result = ledgerCall(args);
      requireSuccess(result, "recording");
      await notifyThresholds(result.stdout);
      seenMessageIds.add(info.id);
  };

  // Gate actual OpenCode subagent/task tool dispatches before execution.
  // A configured budget is respected; an unconfigured guard reports inactive.
  const onToolBefore = async (tool, toolArgs) => {
      const target = kitTarget(toolArgs);
      const toolName = String(tool || "").slice(0, 40);
      logStep({ afterStep: stepNumber, tool: toolName, kind: toolKind(toolName, toolArgs), ...(target ? { kit: target } : {}) });
      if (!hasLedger || !["task", "subagent"].includes(toolName)) return;

      const check = ledgerCall(["guard", "--planned-agent-calls", "1"]);
      if (check.status !== 0 || check.error) {
        await showToast("UCA Kit blocked an optional specialist call because the local budget guard failed. Review the local usage summary and configured per-call estimates.", "error");
        requireSuccess(check, "budget check");
      }
      requireSuccess(check, "budget check");
      await notifyThresholds(check.stdout);

      const record = ledgerCall(["record", "--source", "exact", "--agent-calls", "1"]);
      requireSuccess(record, "agent-call accounting");
      await notifyThresholds(record.stdout);
  };

  const onToolAfter = async (tool) => {
      const toolName = String(tool || "");
      if (!toolName || !hasLedger) return;
      const args = ["record", "--source", "exact", "--tool-calls", "1"];
      if (toolName === "skill") args.push("--skill-reads", "1");
      const result = ledgerCall(args);
      requireSuccess(result, "tool-call accounting");
      await notifyThresholds(result.stdout);
  };

  return { onMessage, onToolBefore, onToolAfter, logEventType };
};

const startOnce = (ctx, api) => {
  const directory = String(ctx?.directory || "");
  if (!directory || shared.started.has(directory)) return null;
  const usage = createUsage(ctx, api);
  if (usage) shared.started.add(directory);
  return usage;
};

// OpenCode 1.x: hooks returned by string key.
const server = async ({ directory, client } = {}) => {
  const usage = startOnce({ directory, client }, "v1");
  if (!usage) return {};
  return {
    event: async ({ event }) => {
      if (event?.type === "message.updated") await usage.onMessage(event.properties?.info);
    },
    "tool.execute.before": async (input, output) => usage.onToolBefore(input?.tool, output?.args),
    "tool.execute.after": async (input) => usage.onToolAfter(input?.tool)
  };
};

// OpenCode 2.x: hooks registered on the context. Tool events carry the tool name in
// e.tool and its arguments in e.input; events stream from ctx.event.subscribe().
const setup = (ctx) => {
  const directory = ctx?.location?.directory || ctx?.directory || process.cwd();
  const usage = startOnce({ directory, client: null }, "v2");
  if (!usage) return undefined;
  if (typeof ctx?.tool?.hook === "function") {
    ctx.tool.hook("execute.before", (e) => usage.onToolBefore(e?.tool, e?.input));
    ctx.tool.hook("execute.after", (e) => usage.onToolAfter(e?.tool));
  }
  const controller = new AbortController();
  if (typeof ctx?.event?.subscribe === "function") {
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          usage.logEventType(event?.type);
          // 2.x reports each model request's tokens on session.step.ended:
          // { assistantMessageID, finish, tokens: { input, output, reasoning, cache: { read, write } }, cost }.
          // A retried step starts again but ends once, so ended steps are counted.
          if (event?.type !== "session.step.ended") continue;
          const data = event.data || {};
          const id = data.assistantMessageID || event.id;
          try {
            await usage.onMessage({ id, role: "assistant", time: { completed: 1 }, finish: data.finish, tokens: data.tokens, cost: data.cost });
          } catch {
            // A failed ledger write must not end the stream; the step line is already written.
          }
        }
      } catch {
        // The stream ends when the plugin unloads; usage logging must never break the host.
      }
    })();
  }
  return () => {
    controller.abort();
    shared.started.delete(directory);
  };
};

export default { id: "uca.usage", server, setup };
