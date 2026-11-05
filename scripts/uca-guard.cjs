#!/usr/bin/env node
"use strict";

// Handoff guard. Runs a check, remembers the result, and decides IN CODE (not in the model) when work should pass to the
// next model on the user's list. Dependency-free. It never edits .uca/config.json, never runs Git, and never switches
// models: it prints which model to switch to and the user or host does the switch.
//
//   node scripts/uca-guard.cjs run [--goal "<your words>"] [--timeout <ms>] -- <check command>
//   node scripts/uca-guard.cjs status [--json]
//   node scripts/uca-guard.cjs reset
//
// Exit codes: 0 check passed, 1 check failed (no trigger), 2 usage or config error, 3 handoff written (switch model),
// 4 STOP (last configured model failed; a person must take over).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const STATE_VERSION = 1;
const TIERS = ["lite", "standard", "full"];
const EXIT = { pass: 0, fail: 1, usage: 2, switch: 3, stop: 4 };
const CONFIG_PATH = path.join(".uca", "config.json");
const STATE_PATH = path.join(".uca", "state.json");
const MIRROR_DIR = path.join(".uca", "passing");
const BACKUP_DIR = path.join(".uca", "backup");
const HANDOFF_FILE = "HANDOFF.md";
const IGNORE_ENTRIES = [HANDOFF_FILE, ".uca/state.json", ".uca/guard.lock", ".uca/backup/", ".uca/passing/"];
// Files that usually hold secrets are never tracked, copied or restored, so the guard cannot leak them into .uca/.
const SECRET_FILE = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\..*)?|secrets?(?:\..*)?|service-account.*\.json)$/i;
const SKIP_DIRS = new Set([".git", "node_modules", ".uca", ".uca-workspace", ".venv", "venv", "__pycache__", ".next", ".nuxt", "dist", "build", "target", "coverage", ".cache", ".idea", ".vscode"]);
const MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_FILES = 5000;
const MAX_RUNS_KEPT = 20;
const OUTPUT_CAP = 8000;
const REDACT_INPUT_CAP = 200000;
const HANDOFF_RUNS = 5;
const HANDOFF_OUTPUT = 4000;
const DEFAULT_TIMEOUT_MS = 600000;
const REDACTED = "[REDACTED]";

const maxFiles = () => Number(process.env.UCA_GUARD_MAX_FILES) > 0 ? Number(process.env.UCA_GUARD_MAX_FILES) : DEFAULT_MAX_FILES;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function usageError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}

// ---------- paths ----------

function toPosix(value, separator = path.sep) {
  return String(value).split(separator).join("/");
}

// Resolves a project-relative path from the state file, or returns null when it could leave the project.
function safeJoin(root, relative) {
  if (typeof relative !== "string" || relative === "" || relative.includes("\0")) return null;
  const parts = relative.split(/[\\/]+/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  if (/^[A-Za-z]:/.test(parts[0])) return null;
  const full = path.resolve(root, ...parts);
  const back = path.relative(root, full);
  if (back === "" || back.startsWith("..") || path.isAbsolute(back)) return null;
  return full;
}

// True when the real location (after following symlinks in any parent folder) is still inside the project.
function withinRoot(root, target) {
  try {
    const realRoot = fs.realpathSync(root);
    let probe = target;
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) return false;
      probe = parent;
    }
    const back = path.relative(realRoot, fs.realpathSync(probe));
    return back === "" || (!back.startsWith("..") && !path.isAbsolute(back));
  } catch {
    return false;
  }
}

// ---------- redaction ----------

const SENSITIVE_WORDS = "api[_-]?key|apikey|secret|token|passw(?:or)?d|passwd|pwd|credential|private[_-]?key|dsn|connection[_-]?string";
const REDACTIONS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"],
  [/(authorization\s*[:=]\s*["']?)(?:(?:bearer|basic|token)\s+)?[^\s"',;]+/gi, `$1${REDACTED}`],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [/((?:set-)?cookie\s*:\s*)[^\n]+/gi, `$1${REDACTED}`],
  [/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g, REDACTED],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(@)/gi, `$1${REDACTED}$2`],
  [new RegExp(`(\\b[\\w.-]*(?:${SENSITIVE_WORDS})[\\w.-]*\\s*["']?\\s*[:=]\\s*["']?)([^\\s"',;&]+)`, "gi"), `$1${REDACTED}`],
  // The shape of a .env file: NAME=value at the start of a line. Values are always masked.
  [/^(\s*(?:export\s+)?[A-Z][A-Z0-9_]*=).+$/gm, `$1${REDACTED}`]
];

// Best effort. It catches common shapes of secrets; it cannot promise nothing sensitive remains.
function redact(text) {
  let out = String(text || "");
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

// ---------- reading check output ----------

const stripAnsi = (text) => String(text || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");

function looksGarbled(text) {
  const sample = String(text || "").slice(0, 4000);
  if (!sample) return false;
  if (sample.includes("\u0000")) return true;
  let bad = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0);
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) bad += 1;
  }
  return bad / sample.length > 0.2;
}

// Reads a failure count from common test runners. Returns null when the output has none we recognise.
function failCountOf(text) {
  const patterns = [/^# fail (\d+)/m, /Tests:.*?(\d+) failed/, /\b(\d+) failed\b/, /\b(\d+) failing\b/, /failures=(\d+)/];
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

// A short fingerprint of the error, with numbers, paths, hex ids and timestamps removed so the same error matches itself.
function errorSignature(text) {
  const lines = stripAnsi(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const errorish = lines.filter((line) => /error|fail|exception|assert|traceback|cannot|not found|unexpected|undefined/i.test(line));
  const picked = (errorish.length ? errorish.slice(0, 5) : lines.slice(-5));
  const normalised = picked.map((line) => line.toLowerCase()
    .replace(/\d{4}-\d\d-\d\d[t ]\d\d:\d\d:\d\d[\w.:+-]*/g, "T")
    .replace(/[a-z]:\\[^\s:]+|(?:\.{0,2}\/)?[\w.-]+(?:[\\/][\w.-]+)+/g, "P")
    .replace(/0x[0-9a-f]+|\b[0-9a-f]{7,}\b/g, "X")
    .replace(/\d+/g, "#")).join("|");
  return crypto.createHash("sha1").update(normalised).digest("hex").slice(0, 16);
}

// pass | fail | timeout | empty | garbled. An empty output is only suspicious when the check also failed.
function classify({ exitCode, output, timedOut }) {
  const clean = stripAnsi(output);
  if (timedOut) return "timeout";
  if (looksGarbled(clean)) return "garbled";
  if (exitCode === 0) return failCountOf(clean) > 0 ? "fail" : "pass";
  if (clean.trim() === "") return "empty";
  return "fail";
}

const measure = (run) => (run.status === "pass" ? 0 : Math.max(1, Number.isFinite(run.failCount) ? run.failCount : 1));
const isWorse = (previous, current) => measure(current) > measure(previous);

// The script, not the model, decides. Returns the reasons a handoff is due (empty when none).
function detectTriggers({ previous, current, changedCount }) {
  const reasons = [];
  if (current.status === "pass") return reasons;
  if (current.status === "timeout") reasons.push("timeout");
  if (current.status === "empty") reasons.push("empty output");
  if (current.status === "garbled") reasons.push("garbled output");
  if (previous && previous.status === "fail" && current.status === "fail" && previous.signature && previous.signature === current.signature) reasons.push("same error twice");
  if (previous && isWorse(previous, current)) reasons.push("checks worse than the previous run");
  if (changedCount >= 3) reasons.push("3 or more files changed since the last passing state");
  return reasons;
}

// ---------- files ----------

function hashFile(file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

// Hashes the project's regular files (symlinks are never followed). Returns { files, overflow }.
function walkFiles(root, limit) {
  const files = {};
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile() || (dir === root && entry.name === HANDOFF_FILE) || SECRET_FILE.test(entry.name)) continue;
      let size;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      if (size > MAX_FILE_BYTES) continue;
      if (count >= limit) return { files: {}, overflow: true };
      const hash = hashFile(full);
      if (hash === null) continue;
      files[toPosix(path.relative(root, full))] = hash;
      count += 1;
    }
  }
  return { files, overflow: false };
}

function diffMaps(before, after) {
  const added = [];
  const modified = [];
  const deleted = [];
  for (const key of Object.keys(after)) {
    if (!own(before, key)) added.push(key);
    else if (before[key] !== after[key]) modified.push(key);
  }
  for (const key of Object.keys(before)) if (!own(after, key)) deleted.push(key);
  return { added: added.sort(), modified: modified.sort(), deleted: deleted.sort() };
}

const totalChanged = (change) => change.added.length + change.modified.length + change.deleted.length;
const EMPTY_CHANGE = () => ({ added: [], modified: [], deleted: [] });

function copyInto(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

// Keeps a copy of the project as it was at the last passing check, so it can be restored without Git.
function syncMirror(root, previousFiles, currentFiles) {
  const mirror = path.join(root, MIRROR_DIR);
  let copy;
  if (!previousFiles) {
    fs.rmSync(mirror, { recursive: true, force: true });
    copy = Object.keys(currentFiles);
  } else {
    const change = diffMaps(previousFiles, currentFiles);
    copy = [...change.added, ...change.modified];
    for (const key of change.deleted) fs.rmSync(path.join(mirror, ...key.split("/")), { force: true });
  }
  for (const key of copy) {
    const source = path.join(root, ...key.split("/"));
    if (!withinRoot(root, source)) throw new Error(`${key} resolves outside the project`);
    const target = path.join(mirror, ...key.split("/"));
    copyInto(source, target);
    // A file that changed while it was being copied would make a later restore wrong, so refuse such a copy.
    if (hashFile(target) !== currentFiles[key]) throw new Error(`${key} changed while it was being copied`);
  }
}

// Saves the files that changed since the last passing state before anything is restored.
function snapshot(root, change, stamp) {
  const target = path.join(root, BACKUP_DIR, stamp);
  const saved = [];
  for (const key of [...change.added, ...change.modified]) {
    const source = safeJoin(root, key);
    if (!source || !withinRoot(root, source)) continue;
    try {
      if (!fs.lstatSync(source).isFile()) continue;
      copyInto(source, path.join(target, ...key.split("/")));
      saved.push(key);
    } catch {
      /* the file vanished between the walk and the copy: nothing to save */
    }
  }
  return { dir: toPosix(path.join(BACKUP_DIR, stamp)), saved };
}

// Puts the project back to the last passing state. Only paths inside the project are touched; the snapshot is already saved.
function restoreLastPass(root, lastPass, current) {
  const report = { restored: [], removed: [], skipped: [] };
  const change = diffMaps(lastPass.files, current);
  for (const key of [...change.modified, ...change.deleted]) {
    const destination = safeJoin(root, key);
    const source = safeJoin(path.join(root, MIRROR_DIR), key);
    if (!destination || !source || !withinRoot(root, destination) || !withinRoot(root, source) || hashFile(source) !== lastPass.files[key]) {
      report.skipped.push(key);
      continue;
    }
    try {
      if (fs.existsSync(destination) && !fs.lstatSync(destination).isFile()) throw new Error("not a regular file");
      copyInto(source, destination);
      report.restored.push(key);
    } catch {
      report.skipped.push(key);
    }
  }
  for (const key of change.added) {
    const destination = safeJoin(root, key);
    try {
      if (!destination || !withinRoot(root, destination) || !fs.lstatSync(destination).isFile()) throw new Error("not a regular file");
      fs.rmSync(destination, { force: true });
      report.removed.push(key);
    } catch {
      report.skipped.push(key);
    }
  }
  return report;
}

// Appends the guard's own files to an EXISTING .gitignore. It never creates one.
function ensureIgnored(root) {
  const file = path.join(root, ".gitignore");
  try {
    if (!fs.lstatSync(file).isFile()) return [];
    const text = fs.readFileSync(file, "utf8");
    const have = new Set(text.split(/\r?\n/).map((line) => line.trim()));
    const missing = IGNORE_ENTRIES.filter((entry) => !have.has(entry));
    if (!missing.length) return [];
    fs.appendFileSync(file, `${text === "" || text.endsWith("\n") ? "" : "\n"}${missing.join("\n")}\n`);
    return missing;
  } catch {
    return [];
  }
}

// ---------- config and state ----------

function loadConfig(root) {
  const config = { tier: "standard", models: [], checks: [], allowGit: false };
  let raw;
  try {
    raw = fs.readFileSync(path.join(root, CONFIG_PATH), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return config;
    throw usageError(`Cannot read ${toPosix(CONFIG_PATH)}: ${error.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw usageError(`${toPosix(CONFIG_PATH)} is not valid JSON: ${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw usageError(`${toPosix(CONFIG_PATH)} must be a JSON object.`);
  if (data.tier !== undefined) {
    if (!TIERS.includes(data.tier)) throw usageError(`${toPosix(CONFIG_PATH)}: tier must be one of ${TIERS.join(", ")}.`);
    config.tier = data.tier;
  }
  if (data.models !== undefined) {
    if (!Array.isArray(data.models)) throw usageError(`${toPosix(CONFIG_PATH)}: models must be a list of { "name", "tier" }.`);
    config.models = data.models.map((model, index) => {
      if (!model || typeof model.name !== "string" || model.name.trim() === "") throw usageError(`${toPosix(CONFIG_PATH)}: models[${index}] needs a name.`);
      if (model.tier !== undefined && !TIERS.includes(model.tier)) throw usageError(`${toPosix(CONFIG_PATH)}: models[${index}].tier must be one of ${TIERS.join(", ")}.`);
      return { name: model.name, tier: model.tier || config.tier };
    });
  }
  if (data.checks !== undefined) {
    if (!Array.isArray(data.checks) || data.checks.some((check) => typeof check !== "string" || check.trim() === "")) throw usageError(`${toPosix(CONFIG_PATH)}: checks must be a list of command strings.`);
    config.checks = data.checks;
  }
  if (data.allowGit !== undefined) {
    if (typeof data.allowGit !== "boolean") throw usageError(`${toPosix(CONFIG_PATH)}: allowGit must be true or false.`);
    config.allowGit = data.allowGit;
  }
  return config;
}

const blankState = () => ({ version: STATE_VERSION, goal: null, modelIndex: 0, stopped: false, baseline: null, lastPass: null, runs: [], handoffs: [] });

function loadState(root) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(root, STATE_PATH), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return blankState();
    throw usageError(`Cannot read ${toPosix(STATE_PATH)}: ${error.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw usageError(`${toPosix(STATE_PATH)} is not valid JSON. It was not overwritten. Fix or delete it, or run "reset".`);
  }
  if (!data || data.version !== STATE_VERSION || !Array.isArray(data.runs) || !Array.isArray(data.handoffs) || !Number.isInteger(data.modelIndex)) {
    throw usageError(`${toPosix(STATE_PATH)} has an unexpected shape. It was not overwritten. Fix or delete it, or run "reset".`);
  }
  return { ...blankState(), ...data };
}

function saveState(root, state) {
  const file = path.join(root, STATE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

// ---------- running the check ----------

const quoteWindows = (token) => (/[\s"&|<>^()%]/.test(token) ? `"${token.replace(/"/g, '\\"')}"` : token);

function executeOne(root, tokens, timeoutMs) {
  const options = { cwd: root, encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 20 * 1024 * 1024, windowsHide: true };
  let result;
  if (tokens.length === 1) result = spawnSync(tokens[0], [], { ...options, shell: true });
  else if (process.platform === "win32" && !/\.(?:exe|com)$/i.test(tokens[0])) result = spawnSync(tokens.map(quoteWindows).join(" "), [], { ...options, shell: true });
  else result = spawnSync(tokens[0], tokens.slice(1), options);
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  let output = stdout + (stderr ? `${stdout && !stdout.endsWith("\n") ? "\n" : ""}${stderr}` : "");
  let exitCode = typeof result.status === "number" ? result.status : null;
  if (result.error && !timedOut) {
    const reason = result.error.code === "ENOENT" ? `Command not found: ${tokens[0]}` : result.error.message;
    output += `${output ? "\n" : ""}${reason}`;
    if (exitCode === null) exitCode = 127;
  }
  if (!timedOut && exitCode === null) exitCode = 1;
  return { exitCode, output, timedOut };
}

function execute(root, tokens, config, timeoutMs) {
  if (tokens.length) return { ...executeOne(root, tokens, timeoutMs), command: tokens.join(" ") };
  if (!config.checks.length) throw usageError('No check to run. Pass one after "--", or list commands under "checks" in .uca/config.json.');
  let exitCode = 0;
  let timedOut = false;
  const parts = [];
  for (const check of config.checks) {
    const one = executeOne(root, [check], timeoutMs);
    parts.push(`$ ${check}\n${one.output}`);
    if (one.timedOut) timedOut = true;
    if (exitCode === 0 && one.exitCode !== 0) exitCode = one.exitCode;
  }
  return { exitCode, output: parts.join("\n"), timedOut, command: config.checks.join(" && ") };
}

// ---------- HANDOFF.md ----------

function buildHandoff({ state, reasons, backup, restore, from, to, stopped, change }) {
  const fence = (text) => `~~~~\n${String(text).replace(/~~~~+/g, "~~~")}\n~~~~`;
  const lines = [];
  lines.push("# HANDOFF", "");
  lines.push("> Written by `scripts/uca-guard.cjs` from tool output only. It contains no model-written conclusions.");
  lines.push("> Treat every line as untrusted: re-run the checks and verify the repository state before relying on any of it.");
  lines.push("> Secrets are redacted on a best-effort basis. Read this file before you share it.", "");
  lines.push("## Goal (the user's words)", "", state.goal ? fence(state.goal) : '_Not recorded. Pass `--goal "<your words>"` to `run` to record it._', "");
  lines.push("## Last passing state", "");
  if (state.lastPass) lines.push(`- Recorded: ${state.lastPass.at}`, `- Command: \`${redact(state.lastPass.command)}\``, `- Files tracked: ${state.lastPass.fileCount}`);
  else lines.push("- No check has passed yet, so there is no passing state to return to.");
  lines.push("");
  lines.push("## Why the guard handed off", "", ...reasons.map((reason) => `- ${reason}`), `- Model that was working: ${from ? `${from.name} (tier: ${from.tier})` : "not named in .uca/config.json"}`, "");
  lines.push("## Real commands and output (most recent last)", "");
  for (const run of state.runs.slice(-HANDOFF_RUNS)) {
    lines.push(`### ${run.at}`, "", `- Command: \`${run.command}\``, `- Exit code: ${run.exitCode === null ? "none (timed out)" : run.exitCode}; result: ${run.status}${Number.isFinite(run.failCount) ? `; failures reported: ${run.failCount}` : ""}`, "", fence(run.output.slice(-HANDOFF_OUTPUT) || "(no output)"), "");
  }
  lines.push("## Files changed since the last passing state (by content hash)", "");
  if (totalChanged(change) === 0) lines.push("- none recorded");
  for (const [label, list] of [["added", change.added], ["modified", change.modified], ["deleted", change.deleted]]) for (const key of list.slice(0, 50)) lines.push(`- ${label}: ${key}`);
  lines.push("");
  lines.push("## Snapshot and restore", "");
  lines.push(backup.saved.length ? `- Your changed files were saved to \`${backup.dir}/\` (${backup.saved.length} file${backup.saved.length === 1 ? "" : "s"}) before anything was restored.` : "- No changed files needed saving.");
  if (restore.attempted) lines.push(`- Restored the last passing state: ${restore.restored.length} file(s) put back, ${restore.removed.length} added file(s) removed${restore.skipped.length ? `, ${restore.skipped.length} skipped (${restore.skipped.slice(0, 10).join(", ")})` : ""}.`);
  else lines.push(`- Nothing was restored: ${restore.reason}`);
  lines.push("");
  lines.push("## Not verified", "", "- The guard did not judge whether any claim made by an earlier model was true.", "- Nothing here is confirmed until the next model re-runs the check itself.", stopped ? "- No model is left on the list. A person must take over." : `- Next: ${to ? `${to.name} (tier: ${to.tier})` : "not configured"}.`, "");
  return lines.join("\n");
}

// ---------- commands ----------

// Holds a lock file while a run is in progress, so two runs cannot overwrite each other's state.
function acquireLock(root, staleMs) {
  const file = path.join(root, ".uca", "guard.lock");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => fs.rmSync(file, { force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let age;
      try {
        age = Date.now() - fs.statSync(file).mtimeMs;
      } catch {
        continue;
      }
      if (age > staleMs) {
        fs.rmSync(file, { force: true });
        continue;
      }
      throw usageError("Another guard run is in progress in this project (.uca/guard.lock). Wait for it to finish. A crashed run's lock clears itself after the check's timeout plus one minute.");
    }
  }
  throw usageError("Could not take the guard lock (.uca/guard.lock).");
}

// The model list and the check list steer what the guard does. A change after the guard started is refused, so a model cannot quietly reorder them.
const configFingerprint = (config) => crypto.createHash("sha1").update(JSON.stringify({ models: config.models, checks: config.checks })).digest("hex").slice(0, 16);
function assertConfigUnchanged(state, config) {
  const fingerprint = configFingerprint(config);
  if (state.configHash && state.configHash !== fingerprint) {
    throw usageError('"models" or "checks" in .uca/config.json changed after the guard started. If you changed them on purpose, run "reset" (it clears the guard state, not your config). If you did not, restore the file.');
  }
  state.configHash = fingerprint;
}

const modelAt = (config, index) => (config.models[index] ? { name: config.models[index].name, tier: config.models[index].tier } : null);
const tailLines = (text, count) => text.split(/\r?\n/).slice(-count).join("\n");

function cmdRun(root, options, tokens, log) {
  const config = loadConfig(root);
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (options.timeout !== undefined) {
    timeoutMs = Number(options.timeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw usageError("--timeout must be a positive whole number of milliseconds.");
  }
  if (tokens.length && config.checks.length && !config.checks.some((check) => check.trim() === tokens.join(" "))) {
    throw usageError(`"${tokens.join(" ")}" is not in the "checks" list of .uca/config.json. Run one of the listed checks, or run without a command to use them all. This stops a trivial command from being recorded as a pass.`);
  }
  const release = acquireLock(root, timeoutMs * Math.max(1, tokens.length ? 1 : config.checks.length) + 60000);
  try {
    return runLocked(root, options, tokens, log, config, timeoutMs);
  } finally {
    release();
  }
}

function runLocked(root, options, tokens, log, config, timeoutMs) {
  const state = loadState(root);
  if (state.stopped) {
    log("STOP: the last configured model already failed. Do not return to an earlier model. A person must take over (run \"reset\" only after that).");
    return EXIT.stop;
  }
  assertConfigUnchanged(state, config);
  if (options.goal) state.goal = redact(options.goal);

  // Before any file is hashed, so the guard's own .gitignore edit is never counted as a change.
  fs.mkdirSync(path.join(root, ".uca"), { recursive: true });
  const ignored = ensureIgnored(root);
  if (ignored.length) log(`Added to .gitignore: ${ignored.join(", ")}`);

  const executed = execute(root, tokens, config, timeoutMs);
  const clean = stripAnsi(executed.output).slice(-REDACT_INPUT_CAP);
  const status = classify({ ...executed, output: clean });
  const stamp = new Date().toISOString();
  const run = {
    at: stamp,
    command: redact(executed.command),
    exitCode: executed.timedOut ? null : executed.exitCode,
    status,
    failCount: failCountOf(clean),
    signature: status === "pass" ? null : errorSignature(clean),
    output: redact(clean).slice(-OUTPUT_CAP)
  };

  const walked = walkFiles(root, maxFiles());
  const tracking = !walked.overflow;
  const reference = state.lastPass ? state.lastPass.files : state.baseline ? state.baseline.files : null;
  const change = tracking && reference ? diffMaps(reference, walked.files) : EMPTY_CHANGE();
  if (!state.baseline) state.baseline = { at: stamp, files: walked.files };

  const previous = state.runs.length ? state.runs[state.runs.length - 1] : state.lastPass ? { status: "pass", failCount: 0 } : null;
  const reasons = detectTriggers({ previous, current: run, changedCount: totalChanged(change) });
  state.runs.push(run);
  if (state.runs.length > MAX_RUNS_KEPT) state.runs = state.runs.slice(-MAX_RUNS_KEPT);

  if (!tracking) log(`Warning: more than ${maxFiles()} files. The guard cannot track changes or restore this project; use Git checkpoints instead.`);

  const shown = tailLines(run.output, 30);
  if (shown.trim()) log(shown);

  if (status === "pass") {
    let mirror = false;
    if (tracking) {
      try {
        syncMirror(root, state.lastPass && state.lastPass.mirror ? state.lastPass.files : null, walked.files);
        mirror = true;
      } catch (error) {
        log(`Warning: could not keep a copy of this passing state (${error.message}). Restore will not be possible.`);
      }
    }
    state.lastPass = { at: stamp, command: run.command, files: tracking ? walked.files : {}, fileCount: Object.keys(walked.files).length, mirror };
    state.runs = [run];
    saveState(root, state);
    log(`Guard: check passed. ${mirror ? `Saved as the last passing state (${state.lastPass.fileCount} files).` : "No copy of this state was kept."}`);
    if (totalChanged(change) >= 3) log(`Note: ${totalChanged(change)} files changed in one step. Smaller steps are easier to undo.`);
    return EXIT.pass;
  }

  if (!reasons.length) {
    saveState(root, state);
    log(`Guard: check failed (${status}, exit ${run.exitCode}). No handoff trigger yet. Fix one thing, then run the check again.`);
    return EXIT.fail;
  }

  // Handoff: snapshot, then restore, then write HANDOFF.md, then say which model comes next.
  log(`Guard: handoff triggered: ${reasons.join("; ")}.`);
  const backup = snapshot(root, change, stamp.replace(/[:.]/g, "-"));
  log(backup.saved.length ? `Snapshot: ${backup.dir}/ (${backup.saved.length} file${backup.saved.length === 1 ? "" : "s"})` : "Snapshot: nothing had changed since the last state.");
  let restore;
  if (!tracking) restore = { attempted: false, reason: "the project has too many files for the guard to track." };
  else if (!state.lastPass) restore = { attempted: false, reason: "no check has passed yet, so there is no passing state to return to. Your files were left as they are." };
  else if (!state.lastPass.mirror) restore = { attempted: false, reason: "the guard has no saved copy of the last passing state. Your files were left as they are." };
  else {
    const result = restoreLastPass(root, state.lastPass, walked.files);
    restore = { attempted: true, ...result };
  }
  log(restore.attempted ? `Restored the last passing state (${restore.restored.length} put back, ${restore.removed.length} removed${restore.skipped.length ? `, ${restore.skipped.length} skipped` : ""}).` : `Not restored: ${restore.reason}`);

  const from = modelAt(config, state.modelIndex);
  const to = modelAt(config, state.modelIndex + 1);
  const stopped = !to;
  fs.writeFileSync(path.join(root, HANDOFF_FILE), buildHandoff({ state, reasons, backup, restore, from, to, stopped, change }), "utf8");
  log("Wrote HANDOFF.md (tool output only, secrets redacted).");

  state.handoffs.push({ at: stamp, reasons, fromModel: from ? from.name : null, toModel: to ? to.name : null, backup: backup.dir });
  state.runs = [];
  if (stopped) state.stopped = true;
  else state.modelIndex += 1;
  saveState(root, state);

  if (stopped) {
    log("STOP: no model is left in .uca/config.json. Do not return to an earlier model. A person must take over.");
    return EXIT.stop;
  }
  log(`Switch to model ${state.modelIndex + 1}: ${to.name} (tier: ${to.tier})`);
  log("The guard does not switch models. You or your host must do it, and the next model must re-run the checks before trusting HANDOFF.md.");
  return EXIT.switch;
}

function cmdStatus(root, options, log) {
  const config = loadConfig(root);
  const state = loadState(root);
  assertConfigUnchanged(state, config);
  const current = modelAt(config, state.modelIndex);
  const summary = {
    model: current ? { number: state.modelIndex + 1, ...current } : null,
    modelsConfigured: config.models.length,
    stopped: state.stopped,
    lastPass: state.lastPass ? { at: state.lastPass.at, files: state.lastPass.fileCount, restorable: Boolean(state.lastPass.mirror) } : null,
    runsSinceLastHandoff: state.runs.length,
    handoffs: state.handoffs.length
  };
  if (options.json) log(JSON.stringify(summary, null, 2));
  else {
    log(`Model: ${current ? `${state.modelIndex + 1} of ${config.models.length}: ${current.name} (tier: ${current.tier})` : "none configured"}`);
    log(`Stopped: ${state.stopped ? "yes" : "no"}`);
    log(summary.lastPass ? `Last passing state: ${summary.lastPass.at} (${summary.lastPass.files} files, ${summary.lastPass.restorable ? "restorable" : "not restorable"})` : "Last passing state: none yet");
    log(`Runs since the last handoff: ${summary.runsSinceLastHandoff}; handoffs so far: ${summary.handoffs}`);
  }
  return EXIT.pass;
}

function cmdReset(root, log) {
  fs.rmSync(path.join(root, STATE_PATH), { force: true });
  fs.rmSync(path.join(root, MIRROR_DIR), { recursive: true, force: true });
  log("Guard state cleared. Snapshots under .uca/backup/ and HANDOFF.md were left in place. .uca/config.json was not touched.");
  return EXIT.pass;
}

const HELP = `UCA handoff guard

  node scripts/uca-guard.cjs run [--goal "<your words>"] [--timeout <ms>] [--project-root <dir>] -- <check command>
  node scripts/uca-guard.cjs status [--json] [--project-root <dir>]
  node scripts/uca-guard.cjs reset [--project-root <dir>]

Without a command after "--", "run" uses the "checks" list in .uca/config.json.
Exit codes: 0 passed, 1 failed (no trigger), 2 usage or config error, 3 handoff written (switch model), 4 STOP.
The guard never edits .uca/config.json, never runs Git, and never switches models itself.`;

function parseArgs(argv) {
  const args = argv.slice(2);
  if (!args.length || args[0] === "--help" || args[0] === "-h" || args[0] === "help") return { command: "help", options: {}, tokens: [] };
  const rest = args.slice(1);
  const dash = rest.indexOf("--");
  const before = dash === -1 ? rest : rest.slice(0, dash);
  const options = {};
  for (let i = 0; i < before.length; i += 1) {
    const arg = before[i];
    if (arg === "--goal" || arg === "--timeout" || arg === "--project-root") {
      if (i + 1 >= before.length) throw usageError(`${arg} needs a value.`);
      options[arg.slice(2)] = before[(i += 1)];
    } else if (arg === "--json") options.json = true;
    else throw usageError(`Unknown option: ${arg}`);
  }
  return { command: args[0], options, tokens: dash === -1 ? [] : rest.slice(dash + 1) };
}

function main(argv, out = (line) => process.stdout.write(`${line}\n`)) {
  try {
    const { command, options, tokens } = parseArgs(argv);
    if (command === "help") {
      out(HELP);
      return EXIT.pass;
    }
    const root = path.resolve(options["project-root"] || process.cwd());
    if (command === "run") return cmdRun(root, options, tokens, out);
    if (command === "status") return cmdStatus(root, options, out);
    if (command === "reset") return cmdReset(root, out);
    throw usageError(`Unknown command: ${command}. Try --help.`);
  } catch (error) {
    if (error.usage) {
      process.stderr.write(`uca-guard: ${error.message}\n`);
      return EXIT.usage;
    }
    process.stderr.write(`uca-guard: unexpected error: ${error.message}\n`);
    return EXIT.usage;
  }
}

module.exports = { main, redact, detectTriggers, isWorse, classify, failCountOf, errorSignature, looksGarbled, safeJoin, withinRoot, toPosix, diffMaps, EXIT };

if (require.main === module) process.exitCode = main(process.argv);
