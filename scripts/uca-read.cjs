#!/usr/bin/env node
"use strict";

// Prints part of a kit skill or workflow, so a model does not have to read the whole file.
// Read-only. It looks files up by name inside the kit's .agents folder and never takes a path.
// Exit codes: 0 printed, 1 name or section not found, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const AGENTS_DIR = path.join(__dirname, "..", ".agents");
// A skill or workflow name, or a skill's own reference file such as "design-taste-discovery/directions".
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

function resolve(name, agentsDir = AGENTS_DIR) {
  if (!NAME.test(name)) return null;
  const candidates = name.includes("/")
    ? [path.join(agentsDir, "skills", ...name.split("/")) + ".md"]
    : [path.join(agentsDir, "skills", name, "SKILL.md"), path.join(agentsDir, "workflows", `${name}.md`)];
  return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

function withoutFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n[\s\S]*?\n---\n/.exec(normalized);
  return (match ? normalized.slice(match[0].length) : normalized).trim();
}

// Sections are "## " headings. A section runs to the next "## " heading, so its "### " parts come with it.
function sections(body) {
  const lines = body.split("\n");
  const found = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^## /.test(line)) found.push({ heading: line.slice(3).trim(), start: index });
  });
  return found.map((item, i) => ({ ...item, text: lines.slice(item.start, i + 1 < found.length ? found[i + 1].start : lines.length).join("\n").trim() }));
}

function title(body) {
  const line = body.split("\n").find((item) => /^# /.test(item));
  return line ? line.trim() : "";
}

// The first line under a heading, shortened: enough to choose a section without reading it.
function summary(sectionText) {
  const line = sectionText.split("\n").slice(1).map((item) => item.trim()).find(Boolean);
  if (!line) return "";
  const plain = line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "");
  return ` — ${plain.length > 110 ? `${plain.slice(0, 107)}...` : plain}`;
}

// A heading matches when it starts with the asked text, ignoring case: "Step 3" finds "Step 3 — commit to a design brief".
function pick(body, { section, full, list }) {
  const all = sections(body);
  if (list) return { ok: true, text: [title(body), ...all.map((item) => `## ${item.heading}${summary(item.text)}`)].filter(Boolean).join("\n") };
  if (full) return { ok: true, text: body };
  if (section) {
    const wanted = section.trim().toLowerCase();
    const hit = all.find((item) => item.heading.toLowerCase().startsWith(wanted));
    if (!hit) return { ok: false, text: `No section starts with "${section}". Sections: ${all.map((item) => item.heading).join(" | ") || "none"}` };
    return { ok: true, text: hit.text };
  }
  const first = all.find((item) => item.heading === "Read first");
  if (!first) return { ok: true, text: `${body}\n\n(no Read first block, so the whole file is shown)` };
  // The block ends at its first blank line. Text after it, before the next heading, is the file's introduction.
  const [block, ...rest] = first.text.split(/\n\s*\n/);
  const others = all.filter((item) => item !== first).map((item) => item.heading);
  if (rest.join("").trim()) others.unshift('introduction: --section "Read first"');
  return { ok: true, text: `${title(body)}\n\n${block}\n\n(Read first block only. Sections: ${others.join(" | ")})` };
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Optional measurement for evaluations: one JSON line per read, with the name, section and size, never the text.
function logRead(entry) {
  const file = process.env.UCA_READ_LOG;
  if (!file) return;
  try {
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // The log is optional; a read must not fail because the log cannot be written.
  }
}

function printHelp() {
  return `uca-read — print part of a kit skill or workflow

Usage:
  node scripts/uca-read.cjs <name>                      the Read first block
  node scripts/uca-read.cjs <name> --section "<heading>" one section (heading start, any case)
  node scripts/uca-read.cjs <name> --list                each heading with its first line
  node scripts/uca-read.cjs <name> --full                the whole file

<name> is a skill (debugging), a workflow (new-project) or a skill's reference file
(design-taste-discovery/directions). Paths are not accepted.
Set UCA_READ_LOG to a file to log each read's name, section and estimated tokens (no text).
`;
}

function parseArgs(argv) {
  const options = { name: null, section: null, full: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--section") {
      if (i + 1 >= argv.length) throw new Error("--section needs a heading");
      options.section = argv[(i += 1)];
    } else if (arg === "--full") options.full = true;
    else if (arg === "--list") options.list = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (options.name) throw new Error(`Only one name, got "${options.name}" and "${arg}"`);
    else options.name = arg;
  }
  if (!options.name) throw new Error("A skill or workflow name is required");
  if ([options.section !== null, options.full, options.list].filter(Boolean).length > 1) throw new Error("Use one of --section, --list or --full");
  return options;
}

function main(argv = process.argv.slice(2), { agentsDir = AGENTS_DIR, out = console.log, err = console.error } = {}) {
  if (argv.includes("--help") || argv.includes("-h")) {
    out(printHelp());
    return 0;
  }
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    err(`Error: ${error.message}\n\nRun with --help for usage.`);
    return 2;
  }
  const file = resolve(options.name, agentsDir);
  if (!file) {
    err(`Error: no skill or workflow named "${options.name}".`);
    return 1;
  }
  const result = pick(withoutFrontmatter(fs.readFileSync(file, "utf8")), options);
  if (!result.ok) {
    err(`Error: ${result.text}`);
    return 1;
  }
  out(result.text);
  // "project" is the name of the folder the kit is installed in, so runs side by side can be told apart.
  logRead({ time: new Date().toISOString(), project: path.basename(path.dirname(agentsDir)), name: options.name, part: options.section ? `section:${options.section}` : options.full ? "full" : options.list ? "list" : "read-first", tokens: estimateTokens(result.text) });
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { main, pick, resolve, sections, withoutFrontmatter };
