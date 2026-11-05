"use strict";

// Install lifecycle: a manifest of the files the installer wrote, and the commands that use it.
//   doctor     check the install is healthy
//   diff       show what the current kit would change
//   update     bring unedited files up to date
//   uninstall  remove the files the installer wrote
//
// The manifest (.uca/manifest.json) records a SHA-256 hash for each file the installer wrote.
// Only files in the manifest are ever changed or removed. A file whose content no longer matches its
// recorded hash was edited by the user, and it is kept unless the user passes --force (update only).
// Exit codes: 0 done, 1 problem found or operation failed, 2 usage error or confirmation missing.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const cli = require("./cli.cjs");

const MANIFEST_PATH = ".uca/manifest.json";
const BACKUP_DIR = ".uca/backup";
const COMMANDS = ["doctor", "diff", "update", "uninstall"];

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const toPosix = (value) => value.split(path.sep).join("/");

function packageVersion(packageRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version || "unknown";
  } catch {
    return "unknown";
  }
}

// ---------- manifest ----------

function validateManifest(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "it is not an object";
  if (data.schema !== 1) return `unsupported schema ${JSON.stringify(data.schema)}`;
  if (!Object.hasOwn(cli.PLATFORM_ENTRIES, data.platform)) return `unknown platform ${JSON.stringify(data.platform)}`;
  if (data.tier !== null && !cli.TIER_NAMES.includes(data.tier)) return `unknown tier ${JSON.stringify(data.tier)}`;
  if (data.profile !== null && typeof data.profile !== "string") return "profile must be a string or null";
  if (!data.files || typeof data.files !== "object" || Array.isArray(data.files)) return "files must be an object";
  for (const [relative, hash] of Object.entries(data.files)) {
    const parts = relative.split("/");
    if (!relative || relative.includes("\\") || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || parts.some((part) => part === "" || part === "." || part === "..")) {
      return `unsafe path in files: ${JSON.stringify(relative)}`;
    }
    if (relative === MANIFEST_PATH || relative === BACKUP_DIR || relative.startsWith(`${BACKUP_DIR}/`)) return `the manifest may not list its own bookkeeping: ${relative}`;
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return `bad hash for ${relative}`;
  }
  return null;
}

function readManifest(projectRoot) {
  const file = path.join(projectRoot, ...MANIFEST_PATH.split("/"));
  let text;
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return { status: "invalid", error: "the manifest is not a regular file" };
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { status: "missing" };
    return { status: "invalid", error: error.message };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { status: "invalid", error: `it is not valid JSON (${error.message})` };
  }
  const problem = validateManifest(data);
  return problem ? { status: "invalid", error: problem } : { status: "ok", manifest: data };
}

function writeManifest(projectRoot, manifest) {
  const destination = cli.safeResolve(projectRoot, MANIFEST_PATH);
  cli.assertNoSymlinkParents(projectRoot, destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  fs.writeFileSync(destination, `${JSON.stringify({ ...manifest, files: sorted }, null, 2)}\n`, "utf8");
}

// Called by the installer after a real (not dry-run) install. `written` maps a relative path to the hash of the
// content the kit put there (or that was already there and identical).
function recordInstall({ packageRoot, projectRoot, platform, profile, tier, written, log = () => {} }) {
  const existing = readManifest(projectRoot);
  let files = {};
  if (existing.status === "ok") files = { ...existing.manifest.files };
  else if (existing.status === "invalid") log(`The old manifest was unreadable (${existing.error}); starting a new one. Files it listed are no longer tracked.`);
  Object.assign(files, written);
  writeManifest(projectRoot, { schema: 1, kitVersion: packageVersion(packageRoot), platform, tier: tier || null, profile: profile || null, files });
}

// ---------- inspecting an install ----------

function plannedFiles(packageRoot, manifest) {
  const entries = cli.buildEntries({ platform: manifest.platform, profile: manifest.profile, tier: manifest.tier });
  const plan = new Map();
  for (const item of cli.collectFiles(packageRoot, entries)) {
    plan.set(toPosix(item.destination), { hash: sha256(fs.readFileSync(item.source)), source: item.source });
  }
  if (manifest.tier) {
    const content = `${JSON.stringify({ tier: manifest.tier }, null, 2)}\n`;
    plan.set(cli.CONFIG_PATH, { hash: sha256(Buffer.from(content)), content });
  }
  return plan;
}

function localState(projectRoot, relative) {
  const destination = cli.safeResolve(projectRoot, relative);
  cli.assertNoSymlinkParents(projectRoot, destination);
  let stat;
  try {
    stat = fs.lstatSync(destination);
  } catch (error) {
    if (error.code === "ENOENT") return { present: false, destination };
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`not a regular file: ${relative}`);
  return { present: true, destination, hash: sha256(fs.readFileSync(destination)) };
}

// One row per path in the manifest or in the current plan.
//   ok / outdated        unedited; outdated means the kit has a newer version
//   modified / conflict  edited by the user; conflict means the kit also has a newer version
//   missing              in the manifest but deleted from the project
//   new                  the kit now ships it and the project has no file there
//   unmanaged            a file the installer did not write is in the way
//   removed-upstream     the kit no longer ships it (unedited) / removed-modified (edited) / gone (already deleted)
//   unsafe               the path cannot be touched safely
function analyze(projectRoot, packageRoot, manifest) {
  const plan = plannedFiles(packageRoot, manifest);
  const paths = [...new Set([...Object.keys(manifest.files), ...plan.keys()])].sort();
  return paths.map((relative) => {
    const owned = manifest.files[relative] || null;
    const want = plan.get(relative) || null;
    const row = { path: relative, owned, want, state: "ok" };
    let local;
    try {
      local = localState(projectRoot, relative);
    } catch (error) {
      return { ...row, state: "unsafe", error: error.message };
    }
    row.destination = local.destination;
    row.local = local.present ? local.hash : null;
    if (!owned) {
      row.state = !local.present ? "new" : local.hash === want.hash ? "identical" : "unmanaged";
    } else if (!local.present) {
      row.state = want ? "missing" : "gone";
    } else if (local.hash === owned) {
      row.state = !want ? "removed-upstream" : want.hash !== owned ? "outdated" : "ok";
    } else {
      row.state = !want ? "removed-modified" : want.hash !== owned ? "conflict" : "modified";
    }
    return row;
  });
}

function loadForCommand(projectRoot, command) {
  const read = readManifest(projectRoot);
  if (read.status === "missing") {
    const error = new Error(`No UCA Kit manifest found in ${projectRoot}. This project was not installed with a version that records one, or it was never installed here. Re-run "init" (it keeps your files and adopts identical ones), then run "${command}" again.`);
    error.code = "NO_MANIFEST";
    throw error;
  }
  if (read.status === "invalid") throw new Error(`The manifest ${MANIFEST_PATH} cannot be used: ${read.error}. Nothing was changed.`);
  return read.manifest;
}

// ---------- doctor ----------

function doctor(projectRoot, packageRoot) {
  const report = { ok: true, problems: [], notes: [], counts: {} };
  const read = readManifest(projectRoot);
  if (read.status !== "ok") {
    report.ok = false;
    report.problems.push(read.status === "missing" ? `No ${MANIFEST_PATH}: the install is not tracked. Re-run "init" to adopt the existing files.` : `${MANIFEST_PATH} is unusable: ${read.error}`);
    return report;
  }
  const { manifest } = read;
  let rows;
  try {
    rows = analyze(projectRoot, packageRoot, manifest);
  } catch (error) {
    report.ok = false;
    report.problems.push(`This install's settings cannot be checked against the kit: ${error.message}`);
    return report;
  }
  for (const row of rows) report.counts[row.state] = (report.counts[row.state] || 0) + 1;
  for (const row of rows) {
    if (row.state === "missing") report.problems.push(`Missing: ${row.path} (installed earlier, now deleted)`);
    if (row.state === "unsafe") report.problems.push(`Unsafe path ${row.path}: ${row.error}`);
  }
  const edited = rows.filter((row) => row.state === "modified" || row.state === "conflict").length;
  const outdated = rows.filter((row) => row.state === "outdated" || row.state === "conflict").length;
  if (edited) report.notes.push(`${edited} file(s) edited by you; they are kept on update.`);
  if (outdated) report.notes.push(`${outdated} file(s) differ from this version of the kit; run "update" to refresh the unedited ones.`);
  const configRow = rows.find((row) => row.path === cli.CONFIG_PATH);
  if (configRow && configRow.local) {
    try {
      const configured = JSON.parse(fs.readFileSync(configRow.destination, "utf8")).tier;
      if (manifest.tier && configured !== manifest.tier) report.problems.push(`${cli.CONFIG_PATH} says tier "${configured}" but the install was made with "${manifest.tier}".`);
    } catch {
      report.problems.push(`${cli.CONFIG_PATH} is not valid JSON.`);
    }
  }
  const version = packageVersion(packageRoot);
  if (manifest.kitVersion !== version) report.notes.push(`Installed with kit ${manifest.kitVersion}; this is ${version}.`);
  report.ok = report.problems.length === 0;
  report.summary = { platform: manifest.platform, tier: manifest.tier, profile: manifest.profile, tracked: Object.keys(manifest.files).length };
  return report;
}

// ---------- checking an install right after it was made ----------

// Hashes of the files an install is about to write that already exist, taken before anything is copied.
function snapshotBefore({ packageRoot, projectRoot, platform, profile, tier }) {
  const before = {};
  const entries = cli.buildEntries({ platform, profile, tier });
  for (const item of cli.collectFiles(packageRoot, entries)) {
    const relative = toPosix(item.destination);
    try {
      const local = localState(projectRoot, relative);
      if (local.present) before[relative] = local.hash;
    } catch {
      // A path that cannot be inspected is reported by the install itself.
    }
  }
  return before;
}

// Compares the finished install with what was planned and with the snapshot. Reads only; changes nothing.
//   problems: planned files that are absent, unsafe paths, a manifest or tier mismatch, a file changed without the installer recording it
//   kept:     your own files that were in the way and are untouched
function verifyInstall(projectRoot, packageRoot, before = {}) {
  const report = doctor(projectRoot, packageRoot);
  const result = { ok: false, problems: [...report.problems], notes: [...report.notes], kept: [], checked: 0 };
  const read = readManifest(projectRoot);
  if (read.status !== "ok") return result;
  let rows;
  try {
    rows = analyze(projectRoot, packageRoot, read.manifest);
  } catch (error) {
    result.problems.push(`The install could not be compared with the kit: ${error.message}`);
    return result;
  }
  for (const row of rows) {
    if (row.state === "new") result.problems.push(`Not installed: ${row.path} (planned, but not on disk)`);
    if (row.state === "unmanaged") result.kept.push(row.path);
    if (row.want) result.checked += 1;
  }
  for (const [relative, hash] of Object.entries(before)) {
    let now;
    try {
      now = localState(projectRoot, relative);
    } catch {
      continue;
    }
    if (!now.present) result.problems.push(`A file that existed before is now gone: ${relative}`);
    else if (now.hash !== hash && read.manifest.files[relative] !== now.hash) result.problems.push(`Changed without being recorded: ${relative}`);
  }
  result.ok = result.problems.length === 0;
  return result;
}

// ---------- update ----------

function backupFile(projectRoot, row, stamp) {
  const target = cli.safeResolve(projectRoot, `${BACKUP_DIR}/${stamp}/${row.path}`);
  cli.assertNoSymlinkParents(projectRoot, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(row.destination, target);
  return toPosix(path.relative(projectRoot, target));
}

function writePlanned(row) {
  fs.mkdirSync(path.dirname(row.destination), { recursive: true });
  if (row.want.source) fs.copyFileSync(row.want.source, row.destination);
  else fs.writeFileSync(row.destination, row.want.content, "utf8");
}

function update(projectRoot, packageRoot, { dryRun = false, force = false, prune = false } = {}) {
  const manifest = loadForCommand(projectRoot, "update");
  const rows = analyze(projectRoot, packageRoot, manifest);
  const result = { added: [], updated: [], overwrittenWithBackup: [], keptEdited: [], keptConflict: [], missing: [], unmanaged: [], pruned: [], notPruned: [], stoppedTracking: [], unsafe: [], errors: [] };
  const files = { ...manifest.files };
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  for (const row of rows) {
    try {
      if (row.state === "unsafe") result.unsafe.push(`${row.path}: ${row.error}`);
      else if (row.state === "new" || row.state === "outdated") {
        if (!dryRun) writePlanned(row);
        files[row.path] = row.want.hash;
        (row.state === "new" ? result.added : result.updated).push(row.path);
      } else if (row.state === "identical") files[row.path] = row.want.hash;
      else if (row.state === "conflict") {
        if (force) {
          const saved = dryRun ? `${BACKUP_DIR}/${stamp}/${row.path}` : backupFile(projectRoot, row, stamp);
          if (!dryRun) writePlanned(row);
          files[row.path] = row.want.hash;
          result.overwrittenWithBackup.push(`${row.path} (your version saved to ${saved})`);
        } else result.keptConflict.push(row.path);
      } else if (row.state === "modified") result.keptEdited.push(row.path);
      else if (row.state === "missing") result.missing.push(row.path);
      else if (row.state === "unmanaged") result.unmanaged.push(row.path);
      else if (row.state === "removed-upstream") {
        if (prune) {
          if (!dryRun) fs.unlinkSync(row.destination);
          delete files[row.path];
          result.pruned.push(row.path);
        } else result.notPruned.push(row.path);
      } else if (row.state === "removed-modified") {
        delete files[row.path];
        result.stoppedTracking.push(row.path);
      } else if (row.state === "gone") delete files[row.path];
    } catch (error) {
      result.errors.push(`${row.path}: ${error.message}`);
    }
  }
  if (!dryRun && result.errors.length === 0) writeManifest(projectRoot, { ...manifest, kitVersion: packageVersion(packageRoot), files });
  return result;
}

// ---------- uninstall ----------

function uninstall(projectRoot, { dryRun = false } = {}) {
  const manifest = loadForCommand(projectRoot, "uninstall");
  const result = { removed: [], keptEdited: [], alreadyGone: [], unsafe: [], errors: [], removedDirs: [] };
  const touchedDirs = new Set();
  for (const [relative, hash] of Object.entries(manifest.files)) {
    try {
      const local = localState(projectRoot, relative);
      if (!local.present) result.alreadyGone.push(relative);
      else if (local.hash !== hash) result.keptEdited.push(relative);
      else {
        if (!dryRun) fs.unlinkSync(local.destination);
        result.removed.push(relative);
        touchedDirs.add(path.dirname(local.destination));
      }
    } catch (error) {
      result.unsafe.push(`${relative}: ${error.message}`);
    }
  }
  if (dryRun || result.errors.length > 0) return result;
  // Remove directories the kit left empty, deepest first, never the project root.
  const root = path.resolve(projectRoot);
  const emptied = [...touchedDirs].sort((a, b) => b.length - a.length);
  for (let dir of emptied) {
    while (dir !== root && dir.startsWith(root + path.sep)) {
      try {
        fs.rmdirSync(dir);
        result.removedDirs.push(toPosix(path.relative(root, dir)));
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
  if (result.unsafe.length === 0) {
    try {
      fs.unlinkSync(cli.safeResolve(projectRoot, MANIFEST_PATH));
      for (const dir of [path.join(root, ".uca")]) {
        try {
          fs.rmdirSync(dir);
        } catch {
          /* not empty (backups or the user's own files): leave it */
        }
      }
    } catch (error) {
      result.errors.push(`${MANIFEST_PATH}: ${error.message}`);
    }
  }
  return result;
}

// ---------- command line ----------

function printHelp() {
  return `UCA Kit install lifecycle

Usage:
  npx create-universal-coding-agent-kit doctor    [directory] [--json]
  npx create-universal-coding-agent-kit diff      [directory] [--json]
  npx create-universal-coding-agent-kit update    [directory] [--dry-run] [--force] [--prune]
  npx create-universal-coding-agent-kit uninstall [directory] [--dry-run] [--yes]

doctor     Check the install against its manifest (.uca/manifest.json). Exit 1 if files are missing or unsafe.
diff       List what this version of the kit would change, without changing anything.
update     Refresh files you have not edited. Files you edited are kept.
             --force  also overwrite files you edited (your version is saved under .uca/backup/ first)
             --prune  also delete files the kit no longer ships (only if you have not edited them)
uninstall  Remove only the files the installer wrote and you have not edited, then empty folders it left.
             Needs --yes (or a typed confirmation in a terminal).

Only files recorded in the manifest are ever changed or removed. Your own files are never touched.
Projects installed before the manifest existed: run "init" again (it keeps your files) to create one.
`;
}

function parseLifecycleArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, dir: ".", json: false, dryRun: false, force: false, prune: false, yes: false, help: false };
  let dirSeen = false;
  const allowed = { doctor: ["--json"], diff: ["--json"], update: ["--dry-run", "--force", "--prune"], uninstall: ["--dry-run", "--yes", "-y"] }[command] || [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dir" || arg === "--project-root") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Option ${arg} requires a path.`);
      options.dir = value;
      dirSeen = true;
      index += 1;
    } else if (arg.startsWith("-")) {
      if (!allowed.includes(arg)) throw new Error(`Option ${arg} is not valid for "${command}".`);
      if (arg === "--json") options.json = true;
      else if (arg === "--dry-run") options.dryRun = true;
      else if (arg === "--force") options.force = true;
      else if (arg === "--prune") options.prune = true;
      else options.yes = true;
    } else if (!dirSeen) {
      options.dir = arg;
      dirSeen = true;
    } else throw new Error(`Unexpected extra argument: ${arg}`);
  }
  return options;
}

function printList(title, items, out) {
  if (items.length === 0) return;
  out(`${title} (${items.length}):`);
  for (const item of items.slice(0, 40)) out(`  - ${item}`);
  if (items.length > 40) out(`  ... and ${items.length - 40} more`);
}

async function confirm(question) {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await terminal.question(question)).trim());
  } finally {
    terminal.close();
  }
}

async function run(argv, { packageRoot = path.resolve(__dirname, ".."), out = console.log, err = console.error } = {}) {
  let options;
  try {
    options = parseLifecycleArgs(argv);
  } catch (error) {
    err(`Error: ${error.message}\n\nRun "${argv[0]} --help" for usage.`);
    return 2;
  }
  if (options.help) {
    out(printHelp());
    return 0;
  }
  const projectRoot = path.resolve(process.cwd(), options.dir);
  try {
    if (options.command === "doctor") {
      const report = doctor(projectRoot, packageRoot);
      if (options.json) out(JSON.stringify(report, null, 2));
      else {
        out(report.ok ? "UCA Kit install looks healthy." : "UCA Kit install has problems.");
        if (report.summary) out(`Platform ${report.summary.platform}, tier ${report.summary.tier || "none"}, profile ${report.summary.profile || "all"}, ${report.summary.tracked} tracked file(s).`);
        printList("Problems", report.problems, out);
        printList("Notes", report.notes, out);
      }
      return report.ok ? 0 : 1;
    }
    if (options.command === "diff") {
      const manifest = loadForCommand(projectRoot, "diff");
      const rows = analyze(projectRoot, packageRoot, manifest).filter((row) => row.state !== "ok");
      if (options.json) {
        out(JSON.stringify(rows.map(({ path: file, state }) => ({ path: file, state })), null, 2));
        return 0;
      }
      const meaning = {
        new: "would be added", outdated: "would be updated (unedited)", conflict: "newer in the kit, but you edited it (kept unless --force)", modified: "edited by you (kept)",
        missing: "deleted by you (not restored)", unmanaged: "your own file is in the way (left alone)", identical: "already matches the kit (would be tracked)",
        "removed-upstream": "no longer shipped (deleted only with --prune)", "removed-modified": "no longer shipped, edited by you (kept, no longer tracked)", unsafe: "cannot be touched safely"
      };
      if (rows.length === 0) out("No differences: everything the kit installed matches this version.");
      for (const row of rows) out(`${row.state.padEnd(17)} ${row.path} — ${meaning[row.state] || ""}`);
      return 0;
    }
    if (options.command === "update") {
      const result = update(projectRoot, packageRoot, options);
      const verb = options.dryRun ? "Would" : "Did";
      out(`${options.dryRun ? "Dry run: nothing was changed. " : ""}${verb} add ${result.added.length}, update ${result.updated.length}, overwrite ${result.overwrittenWithBackup.length}, remove ${result.pruned.length}.`);
      printList("Added", result.added, out);
      printList("Updated", result.updated, out);
      printList("Overwritten after saving your version", result.overwrittenWithBackup, out);
      printList("Removed (no longer shipped)", result.pruned, out);
      printList("Kept: you edited these and the kit has a newer version (use --force to overwrite)", result.keptConflict, out);
      printList("Kept: edited by you", result.keptEdited, out);
      printList("Not removed: no longer shipped (use --prune)", result.notPruned, out);
      printList("Not restored: deleted by you", result.missing, out);
      printList("Left alone: your own file is in the way", result.unmanaged, out);
      printList("No longer tracked: edited by you and no longer shipped", result.stoppedTracking, out);
      printList("Unsafe, skipped", result.unsafe, out);
      printList("Errors", result.errors, out);
      return result.errors.length || result.unsafe.length ? 1 : 0;
    }
    // uninstall
    const preview = uninstall(projectRoot, { dryRun: true });
    if (options.dryRun || !options.yes) {
      printList("Would remove", preview.removed, out);
      printList("Would keep: edited by you", preview.keptEdited, out);
      printList("Unsafe, skipped", preview.unsafe, out);
    }
    if (options.dryRun) {
      out("Dry run: nothing was changed.");
      return preview.unsafe.length ? 1 : 0;
    }
    if (!options.yes) {
      if (!(process.stdin.isTTY && process.stdout.isTTY)) {
        err(`Nothing was removed. Re-run with --yes to remove ${preview.removed.length} file(s).`);
        return 2;
      }
      if (!(await confirm(`Remove ${preview.removed.length} file(s)? Type "yes" to continue: `))) {
        out("Cancelled. Nothing was changed.");
        return 0;
      }
    }
    const result = uninstall(projectRoot, {});
    out(`Removed ${result.removed.length} file(s) and ${result.removedDirs.length} empty folder(s).`);
    printList("Kept: edited by you", result.keptEdited, out);
    printList("Unsafe, skipped", result.unsafe, out);
    printList("Errors", result.errors, out);
    return result.errors.length || result.unsafe.length ? 1 : 0;
  } catch (error) {
    err(`Error: ${error.message}`);
    return 1;
  }
}

module.exports = { BACKUP_DIR, COMMANDS, MANIFEST_PATH, analyze, doctor, parseLifecycleArgs, plannedFiles, readManifest, recordInstall, run, sha256, snapshotBefore, uninstall, update, verifyInstall, writeManifest };
