#!/usr/bin/env node
"use strict";

// Round 3 helpers: set up the 12 build folders, trace which kit files each kit build opened, and blind the builds.
// Usage:
//   node run-tools.cjs setup <runs-dir> <kit-root>
//   node run-tools.cjs trace <runs-dir>
//   node run-tools.cjs blind <runs-dir> <blind-dir>
// Nothing here reads a build's own files except to copy them and to compare them with the kit's installed files.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const BUILDS = ["t3", "t4"].flatMap((task) => ["kit", "none"].flatMap((arm) => [1, 2, 3].map((run) => `${task}-${arm}-${run}`)));
const OLD = new Date("2000-01-01T00:00:00Z");
const READ_LOG = path.join(".uca", "read-log.jsonl");

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

function setup(runsDir, kitRoot) {
  fs.mkdirSync(runsDir, { recursive: true });
  for (const build of BUILDS) {
    const dir = path.join(runsDir, build);
    if (fs.existsSync(dir)) throw new Error(`${dir} exists; use a fresh runs folder`);
    fs.mkdirSync(dir);
    if (!build.includes("-kit-")) continue;
    const result = spawnSync(process.execPath, [path.join(kitRoot, "bin", "cli.cjs"), "init", dir, "--platform", "claude", "--tier", "standard", "--yes"], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`install failed for ${build}: ${result.stderr || result.stdout}`);
    const files = walk(dir);
    fs.writeFileSync(path.join(runsDir, `${build}.install.json`), JSON.stringify(Object.fromEntries(files.map((file) => [file, sha(path.join(dir, file))])), null, 1));
    fs.writeFileSync(path.join(dir, READ_LOG), "");
    // Old access times, so a later read of a kit file shows as a newer one (the disk is mounted with relatime).
    for (const file of files) {
      const full = path.join(dir, file);
      fs.utimesSync(full, OLD, fs.statSync(full).mtime);
    }
  }
  console.log(`set up ${BUILDS.length} folders in ${runsDir}`);
}

const tokens = (chars) => Math.ceil(chars / 4);

function trace(runsDir) {
  const rows = [];
  for (const build of BUILDS.filter((name) => name.includes("-kit-"))) {
    const dir = path.join(runsDir, build);
    const installed = JSON.parse(fs.readFileSync(path.join(runsDir, `${build}.install.json`), "utf8"));
    const opened = Object.keys(installed).filter((file) => {
      const full = path.join(dir, file);
      return fs.existsSync(full) && fs.statSync(full).atime > new Date("2001-01-01T00:00:00Z");
    });
    const logText = fs.existsSync(path.join(dir, READ_LOG)) ? fs.readFileSync(path.join(dir, READ_LOG), "utf8") : "";
    const helperReads = logText.trim() ? logText.trim().split("\n").map((line) => JSON.parse(line)) : [];
    // A kit file the helper printed from also shows as opened; only files the helper never named count as direct reads.
    const helperFiles = new Set(helperReads.map((entry) => entry.name));
    const isHelperFile = (file) => [...helperFiles].some((name) => file === `.agents/skills/${name}/SKILL.md` || file === `.agents/workflows/${name}.md` || (name.includes("/") && file === `.agents/skills/${name}.md`));
    const direct = opened.filter((file) => !isHelperFile(file) && file !== "scripts/uca-read.cjs" && !file.startsWith("scripts/") && file !== READ_LOG.split(path.sep).join("/"));
    const directTokens = direct.reduce((total, file) => total + tokens(fs.readFileSync(path.join(dir, file), "utf8").length), 0);
    const helperTokens = helperReads.reduce((total, entry) => total + entry.tokens, 0);
    const scriptsRun = opened.filter((file) => file.startsWith("scripts/"));
    rows.push({ build, directFiles: direct, directTokens, helperReads: helperReads.map(({ name, part, tokens: t }) => ({ name, part, tokens: t })), helperTokens, scriptsRun, kitTokensRead: directTokens + helperTokens });
  }
  fs.writeFileSync(path.join(runsDir, "kit-reads.json"), JSON.stringify(rows, null, 1));
  for (const row of rows) console.log(`${row.build}: ${row.kitTokensRead} kit tokens read (${row.directFiles.length} files opened directly, ${row.directTokens}; ${row.helperReads.length} helper reads, ${row.helperTokens}); scripts run: ${row.scriptsRun.join(", ") || "none"}`);
}

// Words that would tell a scorer which arm a closing message came from.
const KIT_WORDS = /\bUCA(?: Kit)?\b|\.agents\/[^\s)`]*|\bAGENTS\.md\b|\bCLAUDE\.md\b|\bR-[A-Z]{3,}\b|\buca-[a-z-]+(?:\.cjs)?\b|\bthe kit\b|\bkit's\b/gi;

function blind(runsDir, blindDir) {
  fs.mkdirSync(blindDir, { recursive: true });
  const key = {};
  const used = new Set();
  for (const build of BUILDS) {
    const task = build.slice(0, 2).toUpperCase();
    let code;
    do code = `${task}-${crypto.randomInt(100, 1000)}`; while (used.has(code));
    used.add(code);
    key[code] = build;
    const from = path.join(runsDir, build);
    const to = path.join(blindDir, code);
    const installPath = path.join(runsDir, `${build}.install.json`);
    const installed = fs.existsSync(installPath) ? JSON.parse(fs.readFileSync(installPath, "utf8")) : {};
    fs.cpSync(from, to, { recursive: true });
    for (const [file, hash] of Object.entries(installed)) {
      const full = path.join(to, file);
      if (fs.existsSync(full) && sha(full) === hash) fs.rmSync(full);
    }
    fs.rmSync(path.join(to, READ_LOG), { force: true });
    // Folders that held installed files and are now empty go too, deepest first; any other empty folder stays
    // (round 1 lost a point by removing a build's own empty folder).
    const installDirs = new Set();
    for (const file of [...Object.keys(installed), READ_LOG.split(path.sep).join("/")]) {
      for (let dirName = path.posix.dirname(file); dirName !== "."; dirName = path.posix.dirname(dirName)) installDirs.add(dirName);
    }
    for (const dirName of [...installDirs].sort((a, b) => b.split("/").length - a.split("/").length)) {
      const full = path.join(to, dirName);
      if (fs.existsSync(full) && fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    }
    const closing = path.join(to, "CLOSING.md");
    if (fs.existsSync(closing)) fs.writeFileSync(closing, fs.readFileSync(closing, "utf8").replace(KIT_WORDS, "[redacted]"));
  }
  const keyText = JSON.stringify(key, null, 1);
  fs.writeFileSync(path.join(runsDir, "code-key.json"), keyText);
  console.log(`blinded ${BUILDS.length} builds into ${blindDir}; code key sha256 ${crypto.createHash("sha256").update(keyText).digest("hex").slice(0, 16)}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "setup" && args.length === 2) setup(path.resolve(args[0]), path.resolve(args[1]));
else if (command === "trace" && args.length === 1) trace(path.resolve(args[0]));
else if (command === "blind" && args.length === 2) blind(path.resolve(args[0]), path.resolve(args[1]));
else {
  console.error("Usage: run-tools.cjs setup <runs-dir> <kit-root> | trace <runs-dir> | blind <runs-dir> <blind-dir>");
  process.exitCode = 2;
}
