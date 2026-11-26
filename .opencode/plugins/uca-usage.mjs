import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// OpenCode v1-style plugin adapter. It records only aggregate counters and
// provider-reported message usage; prompt, output, tool results and source code
// are never read by this plugin or passed to the usage ledger.
// Opt-in step log: when UCA_USAGE_STEPS names a file, each finished assistant
// message (one model request) adds one line with its token counts and how it
// ended (tool calls or a reply), and each tool call adds one line with the tool's
// name and a kind (read, write, check, shell, agent, other). A tool call that
// opens a kit file also names that file. No prompt, output, other path, command
// text or file content is written.
export const UcaUsagePlugin = async ({ directory, client }) => {
  const script = path.join(directory, "scripts", "uca-usage.cjs");
  const seenMessageIds = new Set();
  const highestWarnedLevel = new Map();

  // If the toolkit script is missing, this plugin degrades to a no-op instead
  // of breaking the host. An installed kit should include the script.
  if (!fs.existsSync(script)) return {};

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

  const stepsFile = process.env.UCA_USAGE_STEPS || "";
  let stepNumber = 0;
  const logStep = (entry) => {
    if (!stepsFile) return;
    try {
      fs.appendFileSync(stepsFile, JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n", "utf8");
    } catch {
      // The step log is optional; it must never break the host.
    }
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

  return {
    event: async ({ event }) => {
      // In the current message.updated event shape, finalized assistant
      // messages contain per-message tokens and cost. Ignore interim updates
      // to avoid counting the same message repeatedly.
      if (event.type !== "message.updated") return;
      const info = event.properties?.info;
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
      const result = ledgerCall(args);
      requireSuccess(result, "recording");
      await notifyThresholds(result.stdout);
      seenMessageIds.add(info.id);
    },

    // Gate actual OpenCode subagent/task tool dispatches before execution.
    // A configured budget is respected; an unconfigured guard reports inactive.
    "tool.execute.before": async (input, output) => {
      const target = kitTarget(output?.args);
      const toolName = String(input?.tool || "").slice(0, 40);
      logStep({ afterStep: stepNumber, tool: toolName, kind: toolKind(toolName, output?.args), ...(target ? { kit: target } : {}) });
      if (!["task", "subagent"].includes(String(input?.tool || ""))) return;

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
    },

    "tool.execute.after": async (input) => {
      const toolName = String(input?.tool || "");
      if (!toolName) return;
      const args = ["record", "--source", "exact", "--tool-calls", "1"];
      if (toolName === "skill") args.push("--skill-reads", "1");
      const result = ledgerCall(args);
      requireSuccess(result, "tool-call accounting");
      await notifyThresholds(result.stdout);
    }
  };
};
