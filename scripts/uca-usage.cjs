#!/usr/bin/env node
"use strict";

// Local-only aggregate usage ledger. No prompts/source files are read or stored.
// Hosts must explicitly call this script for metering or pre-call budget checks.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const VERSION = 1;
const THRESHOLDS = [0.6, 0.8, 0.95];
const ZERO = () => ({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, agentCalls: 0, skillReads: 0, toolCalls: 0, costUsd: 0 });

function ledgerPath() {
  return path.resolve(process.env.UCA_USAGE_FILE || path.join(os.homedir(), ".uca-kit", "usage.json"));
}
function blank() {
  return {
    version: VERSION,
    updatedAt: null,
    budget: { maxTotalTokens: null, maxAgentCalls: null, maxCostUsd: null, plannedTokensPerAgentCall: null, plannedCostUsdPerAgentCall: null, warningThresholds: THRESHOLDS.slice() },
    totals: { exact: ZERO(), estimated: ZERO() }
  };
}
function validateMetrics(metrics, label) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) throw new Error("Invalid usage ledger: " + label + " must be an object.");
  for (const key of Object.keys(ZERO())) {
    if (!Number.isFinite(metrics[key]) || metrics[key] < 0) throw new Error("Invalid usage ledger metric: " + label + "." + key);
  }
}
function migrate(data) {
  // Add fields introduced by later local-ledger versions without discarding prior counters.
  if (!data || data.version !== VERSION || !data.budget || !data.totals) return;
  if (data.budget.plannedTokensPerAgentCall === undefined) data.budget.plannedTokensPerAgentCall = null;
  if (data.budget.plannedCostUsdPerAgentCall === undefined) data.budget.plannedCostUsdPerAgentCall = null;
  for (const bucket of ["exact", "estimated"]) {
    if (!data.totals[bucket] || typeof data.totals[bucket] !== "object") continue;
    for (const key of ["reasoningTokens", "cacheReadTokens", "cacheWriteTokens"]) {
      if (data.totals[bucket][key] === undefined) data.totals[bucket][key] = 0;
    }
  }
}
function validate(data) {
  if (!data || data.version !== VERSION || !data.budget || !data.totals) throw new Error("Unsupported or invalid usage ledger. It was not overwritten.");
  validateMetrics(data.totals.exact, "totals.exact");
  validateMetrics(data.totals.estimated, "totals.estimated");
  for (const key of ["maxTotalTokens", "maxAgentCalls", "maxCostUsd", "plannedTokensPerAgentCall", "plannedCostUsdPerAgentCall"]) {
    const n = data.budget[key];
    if (n !== null && (!Number.isFinite(n) || n < 0)) throw new Error("Invalid usage ledger budget: " + key);
  }
  if (!Array.isArray(data.budget.warningThresholds) || data.budget.warningThresholds.some((n) => !Number.isFinite(n) || n <= 0 || n > 1)) {
    throw new Error("Invalid usage ledger warning thresholds.");
  }
}
function readLedger() {
  const file = ledgerPath();
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { if (error.code === "ENOENT") return blank(); throw error; }
  if (stat.isSymbolicLink()) throw new Error("Refusing a symbolic link at the local usage-file path.");
  if (!stat.isFile()) throw new Error("The usage path exists but is not a regular file.");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    migrate(data);
    validate(data);
    return data;
  } catch (error) {
    throw new Error("Could not read local usage ledger (" + error.message + "). The file was not overwritten.");
  }
}
function writeLedger(data) {
  validate(data);
  const file = ledgerPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Refusing a symbolic link at the local usage-file path."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const temp = file + ".tmp-" + process.pid + "-" + crypto.randomBytes(5).toString("hex");
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Refusing to replace a symbolic link at the local usage-file path."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    fs.renameSync(temp, file);
    try { fs.chmodSync(file, 0o600); } catch { /* best effort on non-POSIX hosts */ }
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* best effort cleanup */ } }
    try { fs.rmSync(temp, { force: true }); } catch { /* best effort cleanup */ }
  }
}
function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) throw new Error("Unexpected argument: " + arg);
    const eq = arg.indexOf("=");
    const key = arg.slice(2, eq < 0 ? undefined : eq);
    let value;
    if (eq >= 0) value = arg.slice(eq + 1);
    else {
      value = args[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("Option --" + key + " requires a value.");
      i += 1;
    }
    if (Object.hasOwn(options, key)) throw new Error("Duplicate option: --" + key);
    options[key] = value;
  }
  return options;
}
function allowed(options, keys) {
  const bad = Object.keys(options).filter((key) => !keys.includes(key));
  if (bad.length) throw new Error("Unknown option(s): " + bad.map((key) => "--" + key).join(", "));
}
function numberOption(options, name, integer, optional) {
  if (!Object.hasOwn(options, name)) return undefined;
  if (options[name] === "off" && optional) return null;
  const n = Number(options[name]);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n))) {
    throw new Error("--" + name + " must be a non-negative " + (integer ? "integer" : "number") + (optional ? " or off" : "") + ".");
  }
  return n;
}
function totalTokens(metrics) { return metrics.inputTokens + metrics.outputTokens + metrics.reasoningTokens + metrics.cacheReadTokens + metrics.cacheWriteTokens; }
function combined(ledger) {
  const sum = ZERO();
  for (const source of ["exact", "estimated"]) for (const key of Object.keys(sum)) sum[key] += ledger.totals[source][key];
  return sum;
}
function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ""); }
function warnings(ledger) {
  const sums = combined(ledger);
  const checks = [
    ["recorded tokens (exact + estimated)", totalTokens(sums), ledger.budget.maxTotalTokens],
    ["recorded agent calls", sums.agentCalls, ledger.budget.maxAgentCalls]
  ];
  const out = [];
  for (const item of checks) {
    if (item[2] === null || item[2] <= 0) continue;
    const ratio = item[1] / item[2];
    for (const threshold of ledger.budget.warningThresholds) if (ratio >= threshold) {
      out.push("WARNING: " + item[0] + " is at " + Math.round(ratio * 100) + "% of its configured limit (" + fmt(item[1]) + " / " + fmt(item[2]) + ").");
    }
  }
  if (ledger.budget.maxCostUsd !== null) {
    if (sums.costUsd === 0) out.push("NOTICE: cost limit is configured, but no cost is recorded; cost usage cannot be assessed.");
    else if (ledger.budget.maxCostUsd > 0) {
      const ratio = sums.costUsd / ledger.budget.maxCostUsd;
      for (const threshold of ledger.budget.warningThresholds) if (ratio >= threshold) {
        out.push("WARNING: recorded cost values are at " + Math.round(ratio * 100) + "% of configured limit ($" + fmt(sums.costUsd) + " / $" + fmt(ledger.budget.maxCostUsd) + ").");
      }
    }
  }
  return [...new Set(out)];
}
function breaches(ledger, planned) {
  const sums = combined(ledger);
  const out = [];
  if (ledger.budget.maxTotalTokens !== null && totalTokens(sums) + planned.tokens > ledger.budget.maxTotalTokens) {
    out.push("token limit would be exceeded: " + totalTokens(sums) + " recorded + " + planned.tokens + " planned > " + ledger.budget.maxTotalTokens);
  }
  if (ledger.budget.maxAgentCalls !== null && sums.agentCalls + planned.agentCalls > ledger.budget.maxAgentCalls) {
    out.push("agent-call limit would be exceeded: " + sums.agentCalls + " recorded + " + planned.agentCalls + " planned > " + ledger.budget.maxAgentCalls);
  }
  if (ledger.budget.maxCostUsd !== null && planned.costUsd !== undefined && sums.costUsd + planned.costUsd > ledger.budget.maxCostUsd) {
    out.push("cost limit would be exceeded: $" + fmt(sums.costUsd) + " recorded + $" + fmt(planned.costUsd) + " planned > $" + fmt(ledger.budget.maxCostUsd));
  } else if (ledger.budget.maxCostUsd !== null && planned.agentCalls > 0 && sums.costUsd >= ledger.budget.maxCostUsd) {
    out.push("recorded cost has reached the configured limit; the next call cost is unknown, so this optional call is blocked");
  }
  return out;
}
function printSummary(ledger) {
  const exact = ledger.totals.exact;
  const estimated = ledger.totals.estimated;
  const sums = combined(ledger);
  console.log("UCA Kit — local usage summary");
  console.log("Ledger: " + ledgerPath());
  console.log("Privacy: aggregate counters only; this utility does not store prompts, code, credentials or chat transcripts.");
  console.log("Input tokens (excluding cache): exact " + fmt(exact.inputTokens) + " | estimated " + fmt(estimated.inputTokens));
  console.log("Cached input tokens: exact read " + fmt(exact.cacheReadTokens) + " + write " + fmt(exact.cacheWriteTokens) + " | estimated read " + fmt(estimated.cacheReadTokens) + " + write " + fmt(estimated.cacheWriteTokens));
  console.log("Output tokens (excluding reasoning): exact " + fmt(exact.outputTokens) + " | estimated " + fmt(estimated.outputTokens));
  console.log("Reasoning tokens: exact " + fmt(exact.reasoningTokens) + " | estimated " + fmt(estimated.reasoningTokens));
  console.log("Total recorded tokens (exact + estimated): " + fmt(totalTokens(sums)));
  console.log("Agent calls: " + fmt(sums.agentCalls) + " | skill reads: " + fmt(sums.skillReads) + " | tool calls: " + fmt(sums.toolCalls));
  console.log("Cost values supplied: $" + fmt(exact.costUsd) + " exact-source | $" + fmt(estimated.costUsd) + " estimated-source");
  console.log("Limits: tokens=" + (ledger.budget.maxTotalTokens ?? "off") + ", agent calls=" + (ledger.budget.maxAgentCalls ?? "off") + ", cost USD=" + (ledger.budget.maxCostUsd ?? "off"));
  console.log("Last updated: " + (ledger.updatedAt || "never"));
  if (totalTokens(sums) === 0 && sums.agentCalls === 0 && sums.skillReads === 0 && sums.toolCalls === 0 && sums.costUsd === 0) {
    console.log("No usage recorded yet. Missing host events mean this ledger may undercount actual provider usage.");
  }
  for (const message of warnings(ledger)) console.log(message);
}
function help() {
  console.log("UCA Kit local usage ledger — no network or login\n\n" +
    "Commands:\n" +
    "  node scripts/uca-usage.cjs budget [limits]\n" +
    "  node scripts/uca-usage.cjs record --source exact|estimated [metrics]\n" +
    "  node scripts/uca-usage.cjs show\n" +
    "  node scripts/uca-usage.cjs guard [planned metrics]\n" +
    "  node scripts/uca-usage.cjs reset\n\n" +
    "Budget: --max-total-tokens <integer|off> --max-agent-calls <integer|off> --max-cost-usd <number|off> --planned-agent-tokens <integer|off> --planned-agent-cost-usd <number|off>\n" +
    "Record: --source exact|estimated [--cost-source exact|estimated] --input-tokens N --output-tokens N --reasoning-tokens N --cache-read-tokens N --cache-write-tokens N --agent-calls N --skill-reads N --tool-calls N --cost-usd N\n" +
    "Guard: --planned-tokens N --planned-agent-calls N --planned-cost-usd N\n\n" +
    "Default file: ~/.uca-kit/usage.json; override with UCA_USAGE_FILE.\n" +
    "Exact describes the reported/entered source; UCA Kit does not independently verify it.\n" +
    "Budget checks add exact and estimated counters. Do not record the same usage twice.\n" +
    "Use --planned-agent-tokens to set a per-agent token reservation estimate for host budget guards.\n" +
    "Reset clears counters but preserves budget. This ledger is not a provider billing dashboard.");
}
function main(argv) {
  const command = argv[0] || "show";
  if (["--help", "-h", "help"].includes(command)) { help(); return 0; }
  if (!["budget", "record", "show", "guard", "reset"].includes(command)) throw new Error("Unknown command: " + command + ". Run with --help.");
  const opts = parseOptions(argv.slice(1));
  const ledger = readLedger();

  if (command === "show") {
    allowed(opts, []);
    printSummary(ledger);
    return 0;
  }
  if (command === "budget") {
    allowed(opts, ["max-total-tokens", "max-agent-calls", "max-cost-usd", "planned-agent-tokens", "planned-agent-cost-usd"]);
    if (Object.keys(opts).length === 0) throw new Error("Set at least one limit. Run with --help.");
    const configs = [
      ["max-total-tokens", "maxTotalTokens", true],
      ["max-agent-calls", "maxAgentCalls", true],
      ["max-cost-usd", "maxCostUsd", false],
      ["planned-agent-tokens", "plannedTokensPerAgentCall", true],
      ["planned-agent-cost-usd", "plannedCostUsdPerAgentCall", false]
    ];
    for (const item of configs) if (Object.hasOwn(opts, item[0])) ledger.budget[item[1]] = numberOption(opts, item[0], item[2], true);
    ledger.updatedAt = new Date().toISOString();
    writeLedger(ledger);
    console.log("Saved local UCA Kit budget. No data was sent over the network.");
    printSummary(ledger);
    return 0;
  }
  if (command === "record") {
    allowed(opts, ["source", "cost-source", "input-tokens", "output-tokens", "reasoning-tokens", "cache-read-tokens", "cache-write-tokens", "agent-calls", "skill-reads", "tool-calls", "cost-usd"]);
    if (!["exact", "estimated"].includes(opts.source)) throw new Error("Provide --source exact or --source estimated.");
    if (Object.hasOwn(opts, "cost-source") && !["exact", "estimated"].includes(opts["cost-source"])) throw new Error("Provide --cost-source exact or --cost-source estimated.");
    if (Object.hasOwn(opts, "cost-source") && !Object.hasOwn(opts, "cost-usd")) throw new Error("--cost-source requires --cost-usd.");
    const keys = [
      ["input-tokens", "inputTokens", true],
      ["output-tokens", "outputTokens", true],
      ["reasoning-tokens", "reasoningTokens", true],
      ["cache-read-tokens", "cacheReadTokens", true],
      ["cache-write-tokens", "cacheWriteTokens", true],
      ["agent-calls", "agentCalls", true],
      ["skill-reads", "skillReads", true],
      ["tool-calls", "toolCalls", true],
      ["cost-usd", "costUsd", false]
    ];
    let given = false;
    for (const item of keys) {
      if (!Object.hasOwn(opts, item[0])) continue;
      const n = numberOption(opts, item[0], item[2], false);
      if (n > 0) given = true;
      const bucket = item[1] === "costUsd" ? (opts["cost-source"] || opts.source) : opts.source;
      ledger.totals[bucket][item[1]] += n;
    }
    if (!given) throw new Error("Provide at least one positive metric to record.");
    ledger.updatedAt = new Date().toISOString();
    writeLedger(ledger);
    console.log("Recorded aggregate usage (source=" + opts.source + "). No prompt, code or transcript was stored.");
    for (const message of warnings(ledger)) console.log(message);
    return 0;
  }
  if (command === "guard") {
    allowed(opts, ["planned-tokens", "planned-agent-calls", "planned-cost-usd"]);
    const planned = {
      tokens: numberOption(opts, "planned-tokens", true, false) || 0,
      agentCalls: numberOption(opts, "planned-agent-calls", true, false) || 0
    };
    if (!Object.hasOwn(opts, "planned-tokens") && ledger.budget.plannedTokensPerAgentCall !== null) {
      planned.tokens = planned.agentCalls * ledger.budget.plannedTokensPerAgentCall;
      if (planned.tokens > 0) console.log("Budget estimate: reserving " + planned.tokens + " planned tokens for " + planned.agentCalls + " agent call(s).");
    }
    if (Object.hasOwn(opts, "planned-cost-usd")) planned.costUsd = numberOption(opts, "planned-cost-usd", false, false);
    else if (planned.agentCalls > 0 && ledger.budget.plannedCostUsdPerAgentCall !== null) {
      planned.costUsd = planned.agentCalls * ledger.budget.plannedCostUsdPerAgentCall;
      if (planned.costUsd > 0) console.log("Budget estimate: reserving $" + fmt(planned.costUsd) + " planned cost for " + planned.agentCalls + " agent call(s).");
    }
    const active = ledger.budget.maxTotalTokens !== null || ledger.budget.maxAgentCalls !== null || ledger.budget.maxCostUsd !== null;
    if (!active) {
      console.log("Budget guard inactive: no limits configured. No limit is being enforced.");
      return 0;
    }
    for (const message of warnings(ledger)) console.log(message);
    if (ledger.budget.maxCostUsd !== null && planned.agentCalls > 0 && planned.costUsd === undefined) {
      console.log("NOTICE: no per-agent cost estimate configured; this guard cannot predict the next call cost. Use --planned-agent-cost-usd to set an assumption.");
    }
    const blocked = breaches(ledger, planned);
    if (planned.agentCalls > 0 && ledger.budget.maxTotalTokens !== null &&
        !Object.hasOwn(opts, "planned-tokens") && ledger.budget.plannedTokensPerAgentCall === null) {
      blocked.push("token limit is enabled but planned tokens for the next agent call are unknown; set --planned-agent-tokens or supply --planned-tokens");
    }
    if (planned.agentCalls > 0 && ledger.budget.maxCostUsd !== null && planned.costUsd === undefined) {
      blocked.push("cost limit is enabled but planned cost for the next agent call is unknown; set --planned-agent-cost-usd or supply --planned-cost-usd");
    }
    if (blocked.length) {
      console.error("BLOCKED: configured local budget would be exceeded:");
      for (const message of blocked) console.error("- " + message);
      console.error("Skip this optional call or explicitly adjust the budget. Do not bypass essential safety checks to save tokens.");
      return 2;
    }
    console.log("Budget guard passed for supplied planned metrics only. The caller must honor this result.");
    return 0;
  }
  if (command === "reset") {
    allowed(opts, []);
    ledger.totals = { exact: ZERO(), estimated: ZERO() };
    ledger.updatedAt = new Date().toISOString();
    writeLedger(ledger);
    console.log("Reset local usage counters; configured budget limits were preserved. No data was sent over the network.");
    return 0;
  }
  return 0;
}
try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.error("Error: " + error.message); process.exitCode = 1; }
