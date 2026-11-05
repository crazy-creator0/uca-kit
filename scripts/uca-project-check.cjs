#!/usr/bin/env node
"use strict";

// Checks whether a PROJECT.md card may be out of date. It never edits the card.
// Exit codes: 0 = no staleness found, 1 = stale or unverifiable, 2 = usage error or card not found.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// A path may hold one level of parentheses, as in Next.js route groups: app/(auth)/login/page.tsx
const SOURCE_PATTERN = /\(source:\s*((?:[^()]|\([^()]*\))*)\)/g;

function printHelp() {
  return `uca-project-check — report PROJECT.md facts that may be stale

Usage:
  node scripts/uca-project-check.cjs [path/to/PROJECT.md] [--root <dir>]

The card needs a "Verified at:" line holding a git commit hash or a YYYY-MM-DD date,
and facts that cite files as "(source: path)". The check reports cited files that are
missing or changed since the card was verified. It does not edit anything.

Exit codes: 0 current, 1 stale or could not be verified, 2 usage error or card not found.
`;
}

function parseArgs(argv) {
  const options = { card: "PROJECT.md", root: null, help: false };
  let cardSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Option --root requires a directory.");
      options.root = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!cardSeen) {
      options.card = arg;
      cardSeen = true;
    } else {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
  }
  return options;
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 });
  if (result.error) return { ok: false, unavailable: result.error.code === "ENOENT", stdout: "", stderr: String(result.error.message) };
  return { ok: result.status === 0, unavailable: false, stdout: result.stdout || "", stderr: result.stderr || "" };
}

// Pulls cited file paths out of "(source: a, b:12)" notes. URLs and template placeholders are skipped.
function extractSources(text) {
  const sources = new Set();
  let placeholders = 0;
  for (const match of text.matchAll(SOURCE_PATTERN)) {
    for (const raw of match[1].split(",")) {
      const entry = raw.trim();
      if (!entry) continue;
      if (/^<.*>$/.test(entry)) {
        placeholders += 1;
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(entry)) continue;
      sources.add(entry.replace(/#.*$/, "").replace(/:\d+(-\d+)?$/, ""));
    }
  }
  return { sources: [...sources], placeholders };
}

function readVerifiedAt(text) {
  const match = /^Verified at:[ \t]*(.*)$/m.exec(text);
  return match ? match[1].trim() : "";
}

function checkCard({ cardPath, root }) {
  const problems = [];
  const text = fs.readFileSync(cardPath, "utf8");
  const verifiedAt = readVerifiedAt(text);
  const { sources, placeholders } = extractSources(text);

  if (placeholders > 0 || /^Verified at:[ \t]*<.*>/m.test(text)) {
    problems.push("PLACEHOLDER: the card still contains template placeholders; fill them from the files first.");
  }

  const isHash = HASH_PATTERN.test(verifiedAt);
  const isDate = DATE_PATTERN.test(verifiedAt);
  if (!isHash && !isDate && !problems.some((problem) => problem.startsWith("PLACEHOLDER"))) {
    problems.push('UNVERIFIED: "Verified at:" must be a git commit hash or a YYYY-MM-DD date.');
  }

  let changedByGit = null;
  if (isHash) {
    const exists = git(root, ["cat-file", "-e", `${verifiedAt}^{commit}`]);
    if (exists.unavailable) {
      problems.push("UNKNOWN: git is not available, so changes since the verified commit cannot be checked.");
    } else if (!exists.ok) {
      problems.push(`UNKNOWN: commit ${verifiedAt} was not found in this repository.`);
    } else {
      const diff = git(root, ["diff", "--name-only", "--relative", verifiedAt]);
      if (diff.ok) {
        changedByGit = new Set(diff.stdout.split(/\r?\n/).filter(Boolean).map((file) => path.normalize(file)));
      } else {
        problems.push("UNKNOWN: could not compare the working tree with the verified commit.");
      }
    }
  }

  const verifiedDayEnd = isDate ? new Date(`${verifiedAt}T23:59:59.999`).getTime() : null;

  for (const source of sources) {
    const resolved = path.resolve(root, source);
    const relative = path.relative(root, resolved);
    if (path.isAbsolute(source) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      problems.push(`UNSAFE: source path is outside the project: ${source}`);
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch {
      problems.push(`MISSING: ${source} no longer exists.`);
      continue;
    }
    if (changedByGit && changedByGit.has(path.normalize(relative))) {
      problems.push(`CHANGED: ${source} differs from commit ${verifiedAt}.`);
    } else if (verifiedDayEnd !== null && stat.mtimeMs > verifiedDayEnd) {
      problems.push(`CHANGED: ${source} was modified after ${verifiedAt}.`);
    }
  }

  return { problems, sourceCount: sources.length, verifiedAt };
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`Error: ${error.message}\n\nRun with --help for usage.`);
    return 2;
  }
  if (options.help) {
    console.log(printHelp());
    return 0;
  }

  const cardPath = path.resolve(process.cwd(), options.card);
  const root = path.resolve(options.root || path.dirname(cardPath));
  if (!fs.existsSync(cardPath) || !fs.statSync(cardPath).isFile()) {
    console.error(`PROJECT.md card not found: ${cardPath}`);
    return 2;
  }

  const { problems, sourceCount, verifiedAt } = checkCard({ cardPath, root });
  if (problems.length === 0) {
    console.log(`No staleness found: ${sourceCount} cited file(s) unchanged since ${verifiedAt}.`);
    console.log("This is not proof every line is correct; it only means the cited files have not changed.");
    return 0;
  }
  for (const problem of problems) console.log(problem);
  console.log("Re-verify the affected lines from the files, update the card, and set Verified at.");
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { checkCard, extractSources, main, parseArgs, readVerifiedAt };
