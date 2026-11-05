#!/usr/bin/env node
"use strict";

// Builds the benchmark snapshot as a git repository with one commit.
// Author, committer and dates are fixed, so identical files always give the identical commit hash.
// Usage: node benchmarks/make-snapshot.cjs <empty-or-new-directory>

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SOURCE = path.join(__dirname, "sample-app");
const FIXED = "2026-01-01T00:00:00+00:00";

function git(dir, args) {
  const result = spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Benchmark Snapshot",
      GIT_AUTHOR_EMAIL: "snapshot@example.invalid",
      GIT_COMMITTER_NAME: "Benchmark Snapshot",
      GIT_COMMITTER_EMAIL: "snapshot@example.invalid",
      GIT_AUTHOR_DATE: FIXED,
      GIT_COMMITTER_DATE: FIXED,
      GIT_CONFIG_GLOBAL: path.join(__dirname, "no-such-gitconfig"),
      GIT_CONFIG_SYSTEM: path.join(__dirname, "no-such-gitconfig")
    }
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function makeSnapshot(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.readdirSync(dir).length > 0) throw new Error(`${dir} is not empty`);
  fs.cpSync(SOURCE, dir, { recursive: true, filter: (file) => !file.includes("node_modules") });
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "core.autocrlf", "false"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "Benchmark snapshot"]);
  return git(dir, ["rev-parse", "HEAD"]);
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: node benchmarks/make-snapshot.cjs <new-directory>");
    process.exit(2);
  }
  try {
    console.log(makeSnapshot(path.resolve(dir)));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { makeSnapshot };
