import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// OpenCode v1-style plugin adapter. It records only aggregate counters and
// provider-reported message usage; prompt, output, tool results and source code
// are never read by this plugin or passed to the usage ledger.
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
      const result = ledgerCall(args);
      requireSuccess(result, "recording");
      await notifyThresholds(result.stdout);
      seenMessageIds.add(info.id);
    },

    // Gate actual OpenCode subagent/task tool dispatches before execution.
    // A configured budget is respected; an unconfigured guard reports inactive.
    "tool.execute.before": async (input) => {
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
