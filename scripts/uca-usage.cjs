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
const MAX_LEDGER_BYTES = 1024 * 1024;
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function onlyKeys(value, keys, label) {
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  if (extra.length) throw new Error("Invalid usage ledger: unknown field(s) in " + label + ": " + extra.join(", "));
}
// Counts are whole numbers that JavaScript can still store exactly; cost is any finite non-negative number.
function validateMetrics(metrics, label) {
  if (!isObject(metrics)) throw new Error("Invalid usage ledger: " + label + " must be an object.");
  onlyKeys(metrics, Object.keys(ZERO()), label);
  for (const key of Object.keys(ZERO())) {
    const n = metrics[key];
    const ok = key === "costUsd" ? Number.isFinite(n) && n >= 0 : Number.isSafeInteger(n) && n >= 0;
    if (!ok) throw new Error("Invalid usage ledger metric: " + label + "." + key + (key === "costUsd" ? "" : " (must be a whole number no larger than " + Number.MAX_SAFE_INTEGER + ")"));
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
  if (!isObject(data) || data.version !== VERSION || !isObject(data.budget) || !isObject(data.totals)) throw new Error("Unsupported or invalid usage ledger. It was not overwritten.");
  onlyKeys(data, ["version", "updatedAt", "budget", "totals"], "the ledger");
  if (data.updatedAt !== null && (typeof data.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(data.updatedAt) || Number.isNaN(Date.parse(data.updatedAt)))) {
    throw new Error("Invalid usage ledger: updatedAt must be null or an ISO date.");
  }
  onlyKeys(data.totals, ["exact", "estimated"], "totals");
  validateMetrics(data.totals.exact, "totals.exact");
  validateMetrics(data.totals.estimated, "totals.estimated");
  const integers = ["maxTotalTokens", "maxAgentCalls", "plannedTokensPerAgentCall"];
  const budgetKeys = ["maxTotalTokens", "maxAgentCalls", "maxCostUsd", "plannedTokensPerAgentCall", "plannedCostUsdPerAgentCall"];
  onlyKeys(data.budget, [...budgetKeys, "warningThresholds"], "budget");
  for (const key of budgetKeys) {
    const n = data.budget[key];
    const ok = n === null || (integers.includes(key) ? Number.isSafeInteger(n) && n >= 0 : Number.isFinite(n) && n >= 0);
    if (!ok) throw new Error("Invalid usage ledger budget: " + key);
  }
  if (!Array.isArray(data.budget.warningThresholds) || data.budget.warningThresholds.some((n) => !Number.isFinite(n) || n <= 0 || n > 1)) {
    throw new Error("Invalid usage ledger warning thresholds.");
  }
}
// The ledger's own folder must be a plain folder: a link there would send every write somewhere else.
function assertPlainFolder(file) {
  let stat;
  try { stat = fs.lstatSync(path.dirname(file)); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Refusing the usage folder " + path.dirname(file) + ": it is a link or not a folder.");
}
function readLedger() {
  const file = ledgerPath();
  assertPlainFolder(file);
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { if (error.code === "ENOENT") return blank(); throw error; }
  if (stat.isSymbolicLink()) throw new Error("Refusing a symbolic link at the local usage-file path.");
  if (!stat.isFile()) throw new Error("The usage path exists but is not a regular file.");
  if (stat.size > MAX_LEDGER_BYTES) throw new Error("Could not read local usage ledger (it is larger than " + MAX_LEDGER_BYTES + " bytes). The file was not overwritten.");
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
  assertPlainFolder(file);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  assertPlainFolder(file);
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
// One writer at a time: read, change and write happen while holding <ledger>.lock, created exclusively. A lock whose
// process is gone, or that is older than LOCK_STALE_MS, is cleared. A live lock makes the writer wait, then give up.
const LOCK_STALE_MS = 10 * 60 * 1000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "EPERM"; }
}
// Removes a lock judged stale, but only if it is still that same lock. Deleting by path alone would remove a new
// lock another writer took after the stale one was released, letting two writers in at once. Renaming is atomic, so
// the lock is moved aside first and its contents compared; a lock that turns out to be someone else's is put back.
function clearStaleLock(lock, seen) {
  const delay = Number(process.env.UCA_USAGE_TEST_STALE_DELAY_MS);
  if (delay > 0) sleep(delay); // test hook: widens the window between judging a lock stale and clearing it
  const aside = lock + ".stale-" + process.pid + "-" + crypto.randomBytes(4).toString("hex");
  try { fs.renameSync(lock, aside); }
  catch (error) { if (error.code === "ENOENT") return true; throw error; }
  let now = null;
  try { now = fs.readFileSync(aside, "utf8"); } catch { /* unreadable: treat as not the same lock */ }
  if (now === seen) { fs.rmSync(aside, { force: true }); return true; }
  try { fs.linkSync(aside, lock); } catch { /* the path was taken again meanwhile; that writer holds it */ }
  fs.rmSync(aside, { force: true });
  return false;
}
function withLock(fn) {
  const file = ledgerPath();
  assertPlainFolder(file);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  assertPlainFolder(file);
  const lock = file + ".lock";
  const token = crypto.randomBytes(8).toString("hex");
  const waitMs = Number(process.env.UCA_USAGE_LOCK_WAIT_MS) > 0 ? Number(process.env.UCA_USAGE_LOCK_WAIT_MS) : 10_000;
  const deadline = Date.now() + waitMs;
  let holder = null;
  for (;;) {
    try {
      fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token }), { flag: "wx", mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    try {
      const info = fs.lstatSync(lock);
      if (!info.isFile()) throw new Error("Refusing a usage lock that is not a regular file: " + lock);
      let text = "";
      try { text = fs.readFileSync(lock, "utf8"); holder = JSON.parse(text); } catch { holder = null; }
      const age = Date.now() - info.mtimeMs;
      const stale = age > LOCK_STALE_MS || (holder && age > 1_000 && !processAlive(holder.pid)) || (!holder && age > 5_000);
      if (stale && clearStaleLock(lock, text)) continue;
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (Date.now() > deadline) throw new Error("The usage ledger is busy: its lock is held by process " + (holder ? holder.pid : "unknown") + ". Nothing was recorded. Try again.");
    sleep(15 + Math.floor(Math.random() * 20));
  }
  try { return fn(); }
  finally {
    try {
      const mine = JSON.parse(fs.readFileSync(lock, "utf8"));
      if (mine.token === token) fs.rmSync(lock, { force: true });
    } catch { /* already gone */ }
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
// ---- Run summary: totals a step log (OpenCode plugin, UCA_USAGE_STEPS) or a filled run sheet (benchmarks/agent-eval/RUN-SHEET.md).
// Reads the file only; the ledger is not touched. A number the file does not hold is printed as unknown, never 0.
const MAX_STEPS_BYTES = 20 * 1024 * 1024;
const KINDS = ["read", "write", "check", "shell", "agent", "other", "unknown"];
const SHEET_COLUMNS = ["request", "count", "time", "input", "cache_read", "cache_write", "output", "context", "ended", "tools", "source"];

function blankRun(format) {
  return {
    format, rows: 0, requests: 0, requestsKnown: true, ended: { "tool-calls": 0, stop: 0, length: 0, unknown: 0 },
    sums: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, cost: 0 }, unknownRows: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, cost: 0 },
    peak: null, peakAt: null, first: null, wallMs: null, tools: Object.fromEntries(KINDS.map((k) => [k, 0])), toolsKnown: false,
    readsBeforeWrite: null, kitOpened: 0, kitDistinct: new Set(), gaps: { one: 0, many: 0 }, skipped: 0, sources: new Set()
  };
}
function addContext(run, context, at) {
  if (!Number.isFinite(context)) return;
  if (run.first === null && at !== "all") run.first = context;
  if (run.peak === null || context > run.peak) { run.peak = context; run.peakAt = at; }
}
function countTool(run, kind, state) {
  const k = KINDS.includes(kind) ? kind : "unknown";
  run.tools[k] += 1;
  run.toolsKnown = true;
  if (k === "write") state.sawWrite = true;
  if (k === "read" && !state.sawWrite) state.reads += 1;
}
function finishTools(run, state, gaps) {
  run.readsBeforeWrite = run.toolsKnown ? state.reads : null;
  for (const n of gaps.values()) { if (n === 1) run.gaps.one += 1; else if (n > 1) run.gaps.many += 1; }
}
const num = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

function readStepLog(text) {
  const run = blankRun("OpenCode step log");
  run.sources.add("exact (host-reported)");
  const seen = new Set();
  const gaps = new Map();
  const state = { reads: 0, sawWrite: false };
  let firstTime = null;
  let lastTime = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { run.skipped += 1; continue; }
    if (!isObject(entry)) { run.skipped += 1; continue; }
    const time = typeof entry.time === "string" ? Date.parse(entry.time) : NaN;
    if (Number.isSafeInteger(entry.step) && entry.step > 0) {
      if (seen.has(entry.step)) continue;
      seen.add(entry.step);
      run.requests += 1;
      run.rows += 1;
      run.ended[["tool-calls", "stop", "length"].includes(entry.finish) ? entry.finish : "unknown"] += 1;
      for (const key of Object.keys(run.sums)) {
        const n = num(entry[key]);
        if (n === null) run.unknownRows[key] += 1; else run.sums[key] += n;
      }
      const parts = [entry.input, entry.cacheRead, entry.cacheWrite].map(num);
      if (parts.every((n) => n !== null)) addContext(run, parts[0] + parts[1] + parts[2], entry.step);
    } else if (Number.isSafeInteger(entry.afterStep) && typeof entry.tool === "string") {
      countTool(run, typeof entry.kind === "string" ? entry.kind : "unknown", state);
      gaps.set(entry.afterStep, (gaps.get(entry.afterStep) || 0) + 1);
      if (typeof entry.kit === "string") { run.kitOpened += 1; run.kitDistinct.add(entry.kit); }
    } else { run.skipped += 1; continue; }
    if (Number.isFinite(time)) { if (firstTime === null || time < firstTime) firstTime = time; if (lastTime === null || time > lastTime) lastTime = time; }
  }
  if (firstTime !== null && lastTime !== null) run.wallMs = lastTime - firstTime;
  finishTools(run, state, gaps);
  return run;
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === "\"" && line[i + 1] === "\"") { cell += "\""; i += 1; }
      else if (ch === "\"") quoted = false;
      else cell += ch;
    } else if (ch === "\"") quoted = true;
    else if (ch === ",") { cells.push(cell.trim()); cell = ""; }
    else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}
// "6m", "6m30s", "390s", "1h2m" -> milliseconds; a clock time "14:05", "14:05:30" or an ISO time -> ms of the day or epoch.
function parseDuration(text) {
  const match = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i.exec(text);
  if (!match || !text) return null;
  return ((Number(match[1] || 0) * 60 + Number(match[2] || 0)) * 60 + Number(match[3] || 0)) * 1000;
}
function parseClock(text) {
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (clock) return ((Number(clock[1]) * 60 + Number(clock[2])) * 60 + Number(clock[3] || 0)) * 1000;
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(iso) ? iso : null;
}
function sheetNumber(text) {
  if (!text || /^unknown$/i.test(text)) return null;
  const n = Number(text.replace(/[_\s]/g, "").replace(/,(?=\d{3}\b)/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function readRunSheet(text) {
  const run = blankRun("run sheet");
  const rows = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (!rows.length) throw new Error("The run sheet is empty.");
  const header = splitCsvLine(rows[0]).map((cell) => cell.toLowerCase());
  const unknownColumns = header.filter((name) => !SHEET_COLUMNS.includes(name));
  if (unknownColumns.length || !header.includes("request")) {
    throw new Error("Run sheet header must use these columns (request is required): " + SHEET_COLUMNS.join(",") + (unknownColumns.length ? ". Unknown: " + unknownColumns.join(", ") : ""));
  }
  const at = (cells, name) => { const i = header.indexOf(name); return i < 0 ? "" : (cells[i] || ""); };
  const gaps = new Map();
  const state = { reads: 0, sawWrite: false };
  const fields = { input: "input", cacheRead: "cache_read", cacheWrite: "cache_write", output: "output" };
  let firstTime = null;
  let lastTime = null;
  let index = 0;
  for (const line of rows.slice(1)) {
    const cells = splitCsvLine(line);
    const request = at(cells, "request").toLowerCase();
    const all = request === "all";
    if (!all && !/^\d+$/.test(request)) { run.skipped += 1; continue; }
    const count = all ? sheetNumber(at(cells, "count")) : 1;
    if (all && count === null) run.requestsKnown = false;
    else if (!Number.isSafeInteger(count)) { run.skipped += 1; continue; }
    else run.requests += count;
    index += 1;
    run.rows += 1;
    const values = {};
    let bad = false;
    for (const [key, column] of Object.entries(fields)) { values[key] = sheetNumber(at(cells, column)); if (Number.isNaN(values[key])) bad = true; }
    const context = sheetNumber(at(cells, "context"));
    if (bad || Number.isNaN(context)) { run.skipped += 1; continue; }
    for (const key of Object.keys(fields)) { if (values[key] === null) run.unknownRows[key] += 1; else run.sums[key] += values[key]; }
    run.unknownRows.reasoning += 1;
    run.unknownRows.cost += 1;
    const label = all ? "all" : Number(request);
    if (context !== null) addContext(run, context, label);
    else if (!all && [values.input, values.cacheRead, values.cacheWrite].every((n) => n !== null)) addContext(run, values.input + values.cacheRead + values.cacheWrite, label);
    const ended = at(cells, "ended").toLowerCase();
    if (!all) run.ended[["tool-calls", "stop", "length"].includes(ended) ? ended : "unknown"] += 1;
    else if (count !== null) run.ended.unknown += count;
    const tools = at(cells, "tools").toLowerCase().split(/\s+/).filter(Boolean);
    for (const kind of tools) countTool(run, kind, state);
    if (tools.length) gaps.set(index, tools.length);
    const source = at(cells, "source").toLowerCase();
    run.sources.add(["exact", "estimated"].includes(source) ? source : "unknown");
    const time = at(cells, "time");
    if (all) { const ms = parseDuration(time); if (ms !== null) run.wallMs = ms; }
    else { const ms = parseClock(time); if (ms !== null) { if (firstTime === null) firstTime = ms; lastTime = ms; } }
  }
  if (run.wallMs === null && firstTime !== null && lastTime !== null && lastTime >= firstTime) run.wallMs = lastTime - firstTime;
  finishTools(run, state, gaps);
  return run;
}

function readRun(file) {
  const resolved = path.resolve(file);
  let stat;
  try { stat = fs.statSync(resolved); } catch { throw new Error("No such file: " + file); }
  if (!stat.isFile()) throw new Error("Not a file: " + file);
  if (stat.size > MAX_STEPS_BYTES) throw new Error(file + " is larger than " + MAX_STEPS_BYTES + " bytes.");
  const text = fs.readFileSync(resolved, "utf8").replace(/^﻿/, "");
  const firstLine = (text.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("#")) || "").trim();
  const run = /\.csv$/i.test(resolved) || /^request\b/i.test(firstLine) ? readRunSheet(text) : readStepLog(text);
  run.file = path.basename(resolved);
  return run;
}

const group = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function summed(run, key) {
  const n = run.unknownRows[key];
  if (run.rows === 0 || n >= run.rows) return { value: null, complete: false, text: "unknown" };
  return { value: run.sums[key], complete: n === 0, text: group(run.sums[key]) + (n ? " (at least; " + n + " row(s) unknown)" : "") };
}
function wall(ms) {
  if (ms === null) return "unknown";
  const s = Math.round(ms / 1000);
  return (s >= 60 ? Math.floor(s / 60) + "m " : "") + String(s % 60).padStart(s >= 60 ? 2 : 1, "0") + "s";
}
function runFigures(run) {
  const input = summed(run, "input");
  const cacheRead = summed(run, "cacheRead");
  const cacheWrite = summed(run, "cacheWrite");
  const parts = [input, cacheRead, cacheWrite];
  const allInput = parts.some((x) => x.value !== null) ? parts.reduce((sum, x) => sum + (x.value || 0), 0) : null;
  return {
    requests: run.requestsKnown ? run.requests : null,
    inputAll: allInput, inputAllComplete: parts.every((x) => x.complete), input: input.value, cacheRead: cacheRead.value, cacheWrite: cacheWrite.value,
    output: summed(run, "output").value, reasoning: summed(run, "reasoning").value, cost: summed(run, "cost").value,
    peakContext: run.peak, firstContext: run.first, wallSeconds: run.wallMs === null ? null : Math.round(run.wallMs / 1000),
    toolCalls: run.toolsKnown ? KINDS.reduce((sum, k) => sum + run.tools[k], 0) : null,
    reads: run.toolsKnown ? run.tools.read : null, writes: run.toolsKnown ? run.tools.write : null,
    checks: run.toolsKnown ? run.tools.check : null, shell: run.toolsKnown ? run.tools.shell : null,
    readsBeforeFirstWrite: run.readsBeforeWrite, replies: run.ended.stop, kitFilesOpened: run.kitOpened
  };
}
function printRun(run, out) {
  const f = runFigures(run);
  out("UCA Kit — run summary: " + run.file + " (" + run.format + ")");
  const ended = run.ended;
  out("Requests: " + (f.requests === null ? "unknown" : group(f.requests)) + "  (ended in tool calls " + ended["tool-calls"] + ", replies " + ended.stop + ", cut off " + ended.length + ", not recorded " + ended.unknown + ")");
  out("Input tokens, summed over requests: " + (f.inputAll === null ? "unknown" : (f.inputAllComplete ? "" : "at least ") + group(f.inputAll)) + "  (new " + summed(run, "input").text + ", cache read " + summed(run, "cacheRead").text + ", cache write " + summed(run, "cacheWrite").text + ")");
  out("Output tokens, summed: " + summed(run, "output").text + "  (reasoning " + summed(run, "reasoning").text + ")");
  out("Peak context: " + (f.peakContext === null ? "unknown" : group(f.peakContext) + (run.peakAt === "all" ? " (as the host showed it)" : " (request " + run.peakAt + ")")) + "; first request: " + (f.firstContext === null ? "unknown" : group(f.firstContext)));
  out("Wall time: " + wall(run.wallMs));
  if (run.toolsKnown) {
    out("Tool calls: " + f.toolCalls + "  (" + KINDS.filter((k) => run.tools[k] || ["read", "write", "check", "shell"].includes(k)).map((k) => k + " " + run.tools[k]).join(", ") + ")");
    out("Reads before the first write: " + f.readsBeforeFirstWrite + (run.tools.write ? "" : " (no write recorded)"));
    out("Tool calls between two requests: 1 in " + run.gaps.one + " gap(s), 2 or more in " + run.gaps.many);
  } else out("Tool calls: unknown (none recorded in this file)");
  if (run.format === "OpenCode step log") out("Kit files opened: " + run.kitOpened + " (" + run.kitDistinct.size + " different)");
  if (run.sums.cost > 0) out("Cost the host estimated: $" + fmt(run.sums.cost) + " (an estimate, not an invoice)");
  if (run.skipped) out("Skipped " + run.skipped + " line(s) that were not a request or a tool call.");
  out("Source: " + [...run.sources].join(", ") + ". Peak context = new input + cache read + cache write of one request.");
}
const COMPARE_ROWS = [
  ["Requests", "requests"], ["Input tokens, summed", "inputAll"], ["Output tokens, summed", "output"], ["Peak context", "peakContext"],
  ["Wall time (s)", "wallSeconds"], ["Tool calls", "toolCalls"], ["Reads", "reads"], ["Writes", "writes"], ["Check runs", "checks"],
  ["Other shell", "shell"], ["Reads before first write", "readsBeforeFirstWrite"], ["Replies", "replies"]
];
function printCompare(a, b, out) {
  const fa = runFigures(a);
  const fb = runFigures(b);
  const cell = (n, key, f) => (n === null ? "unknown" : (key === "inputAll" && !f.inputAllComplete ? ">=" : "") + group(n));
  const rows = [["", a.file, b.file, "difference"]];
  for (const [label, key] of COMPARE_ROWS) {
    const x = fa[key];
    const y = fb[key];
    let diff = "unknown";
    if (x !== null && y !== null) diff = (x - y >= 0 ? "+" : "-") + group(Math.abs(x - y)) + (y > 0 ? " (" + (x - y >= 0 ? "+" : "-") + Math.round(Math.abs(x - y) / y * 100) + "%)" : "");
    if (key === "inputAll" && !(fa.inputAllComplete && fb.inputAllComplete) && x !== null && y !== null) diff += " (a total is partial)";
    rows.push([label, cell(x, key, fa), cell(y, key, fb), diff]);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  out("UCA Kit — run comparison (first file minus second)");
  for (const row of rows) out(row.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  "));
  if (a.skipped || b.skipped) out("Skipped lines: " + a.file + " " + a.skipped + ", " + b.file + " " + b.skipped + ".");
}
function stepsCommand(args, out = console.log) {
  const json = args.includes("--json");
  const files = args.filter((arg) => arg !== "--json");
  const bad = files.filter((arg) => arg.startsWith("--"));
  if (bad.length) throw new Error("Unknown option(s): " + bad.join(", ") + ". Usage: steps <file> [second file] [--json]");
  if (files.length < 1 || files.length > 2) throw new Error("Usage: steps <file> [second file] [--json]. Give a step log or a run sheet; a second file prints a comparison.");
  const runs = files.map(readRun);
  if (runs.every((run) => run.requests === 0 && !run.toolsKnown && run.requestsKnown)) {
    console.error("Nothing to summarize: no request or tool-call lines found in " + files.join(" or ") + ".");
    return 1;
  }
  if (json) { out(JSON.stringify(runs.map((run) => ({ file: run.file, format: run.format, ...runFigures(run), skippedLines: run.skipped })), null, 2)); return 0; }
  if (runs.length === 2) printCompare(runs[0], runs[1], out);
  else printRun(runs[0], out);
  return 0;
}

function help() {
  console.log("UCA Kit local usage ledger — no network or login\n\n" +
    "Commands:\n" +
    "  node scripts/uca-usage.cjs budget [limits]\n" +
    "  node scripts/uca-usage.cjs record --source exact|estimated [metrics]\n" +
    "  node scripts/uca-usage.cjs show\n" +
    "  node scripts/uca-usage.cjs guard [planned metrics]\n" +
    "  node scripts/uca-usage.cjs reset\n" +
    "  node scripts/uca-usage.cjs steps <file> [second file] [--json]\n\n" +
    "Budget: --max-total-tokens <integer|off> --max-agent-calls <integer|off> --max-cost-usd <number|off> --planned-agent-tokens <integer|off> --planned-agent-cost-usd <number|off>\n" +
    "Record: --source exact|estimated [--cost-source exact|estimated] --input-tokens N --output-tokens N --reasoning-tokens N --cache-read-tokens N --cache-write-tokens N --agent-calls N --skill-reads N --tool-calls N --cost-usd N\n" +
    "Guard: --planned-tokens N --planned-agent-calls N --planned-cost-usd N\n" +
    "Steps: totals a step log (UCA_USAGE_STEPS) or a run sheet (benchmarks/agent-eval/RUN-SHEET.md in the kit repo): requests, summed tokens,\n" +
    "peak context, wall time, tool calls by kind. A second file prints a side-by-side comparison. Read only.\n\n" +
    "Default file: ~/.uca-kit/usage.json; override with UCA_USAGE_FILE.\n" +
    "Exact describes the reported/entered source; UCA Kit does not independently verify it.\n" +
    "Budget checks add exact and estimated counters. Do not record the same usage twice.\n" +
    "Use --planned-agent-tokens to set a per-agent token reservation estimate for host budget guards.\n" +
    "Reset clears counters but preserves budget. This ledger is not a provider billing dashboard.");
}
function main(argv) {
  const command = argv[0] || "show";
  if (["--help", "-h", "help"].includes(command)) { help(); return 0; }
  if (command === "steps") return stepsCommand(argv.slice(1));
  if (!["budget", "record", "show", "guard", "reset"].includes(command)) throw new Error("Unknown command: " + command + ". Run with --help.");
  const opts = parseOptions(argv.slice(1));
  if (["budget", "record", "reset"].includes(command)) return withLock(() => run(command, opts, readLedger()));
  return run(command, opts, readLedger());
}
function run(command, opts, ledger) {

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
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error("Error: " + error.message); process.exitCode = 1; }
}

module.exports = { readStepLog, readRunSheet, runFigures, stepsCommand };
