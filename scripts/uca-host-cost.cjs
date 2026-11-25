#!/usr/bin/env node
"use strict";

// Fixed cost per host: what each platform's install puts where its host is meant to load it on every session,
// before the model reads anything for the task.
//
//   node scripts/uca-host-cost.cjs [--tier standard|lite|full] [--json]
//
// It installs the kit for each platform into a temporary folder with the real installer and measures the files:
//   entry       the files the host is meant to load by itself (docs/TOOL-COMPATIBILITY.md, "intended entry point")
//   every task  AGENTS.md and .agents/CORE.md, which every entry file sends the model to before each task
//   skill list  the name and description of each skill, for hosts meant to list a skills folder; the body of a skill
//               is read only when the skill is used
// These are intended loading paths, from the install files. Whether a host really loads them is "not run" until a
// person checks that host (docs/TOOL-COMPATIBILITY.md says how); a checked host is listed in HOST_CHECKED.
// Estimated tokens are characters / 4. Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

// The intended entry points, as docs/TOOL-COMPATIBILITY.md lists them. Where it says "and/or", both count, so the
// figure is an upper bound. skills: the folder the host is meant to list, or null when it lists none by itself.
const HOSTS = {
  generic: { entry: ["AGENTS.md"], skills: null },
  codex: { entry: ["AGENTS.md"], skills: ".agents/skills" },
  cursor: { entry: ["AGENTS.md", ".cursor/rules/universal-coding-agent-kit.mdc"], skills: null },
  claude: { entry: ["CLAUDE.md", "AGENTS.md"], skills: ".claude/skills" },
  gemini: { entry: ["GEMINI.md", "AGENTS.md"], skills: ".gemini/skills" },
  copilot: { entry: [".github/copilot-instructions.md"], skills: ".github/skills" },
  opencode: { entry: ["AGENTS.md"], skills: ".agents/skills" },
  devin: { entry: [".devin/rules/universal-coding-agent-kit.md"], skills: null },
  windsurf: { entry: [".windsurf/rules/universal-coding-agent-kit.md"], skills: ".windsurf/skills" },
  junie: { entry: ["AGENTS.md", ".junie/rules/universal-coding-agent-kit.md"], skills: null },
  jetbrains: { entry: [".aiassistant/rules/universal-coding-agent-kit.md"], skills: null }
};

// Hosts a person has checked in a real session, with what was seen. Empty until a check is recorded.
const HOST_CHECKED = {};

const EVERY_TASK = ["AGENTS.md", ".agents/CORE.md"];

const estimateTokens = (text) => Math.ceil(text.length / 4);

// The part of a SKILL.md a host lists: its frontmatter name and description lines.
function listedText(skillFile) {
  const text = fs.readFileSync(skillFile, "utf8").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return "";
  return match[1].split("\n").filter((line) => /^(name|description):/.test(line)).join("\n");
}

function measureHost(platform, tier) {
  const { installKit } = require(path.join(ROOT, "bin", "cli.cjs"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `uca-host-${platform}-`));
  try {
    installKit({ packageRoot: ROOT, projectRoot: dir, platform, tier });
    const host = HOSTS[platform];
    const read = (relative) => (fs.existsSync(path.join(dir, relative)) ? fs.readFileSync(path.join(dir, relative), "utf8") : null);
    const entryFiles = host.entry.filter((file) => read(file) !== null);
    const everyTask = EVERY_TASK.filter((file) => !entryFiles.includes(file) && read(file) !== null);
    const entry = entryFiles.reduce((total, file) => total + estimateTokens(read(file)), 0);
    const task = everyTask.reduce((total, file) => total + estimateTokens(read(file)), 0);
    let skillList = 0;
    let skills = 0;
    const folder = host.skills && path.join(dir, host.skills);
    if (folder && fs.existsSync(folder)) {
      for (const name of fs.readdirSync(folder).sort()) {
        const file = path.join(folder, name, "SKILL.md");
        if (!fs.existsSync(file)) continue;
        skills += 1;
        skillList += estimateTokens(listedText(file));
      }
    }
    return {
      platform,
      tier,
      entryFiles,
      entry,
      everyTask: task,
      skills,
      skillList,
      fixed: entry + task + skillList,
      basis: HOST_CHECKED[platform] ? `checked: ${HOST_CHECKED[platform]}` : "intended, from install files, not run"
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function report(tier = "standard") {
  return Object.keys(HOSTS).map((platform) => measureHost(platform, tier));
}

function printHelp() {
  return `uca-host-cost — fixed cost per host, before any task reading

  node scripts/uca-host-cost.cjs [--tier standard|lite|full] [--json]

Installs the kit for each platform into a temporary folder and measures the files the host is meant to load on
every session: its entry files, AGENTS.md and .agents/CORE.md, and the skill names and descriptions it lists.
Intended paths from docs/TOOL-COMPATIBILITY.md; "not run" until a person checks the host.`;
}

function main(argv = process.argv.slice(2), { out = console.log, err = console.error } = {}) {
  if (argv.includes("--help") || argv.includes("-h")) {
    out(printHelp());
    return 0;
  }
  let tier = "standard";
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") json = true;
    else if (argv[i] === "--tier" && ["lite", "standard", "full"].includes(argv[i + 1])) tier = argv[(i += 1)];
    else {
      err(`Error: Unknown option: ${argv[i]}\n\nRun with --help for usage.`);
      return 2;
    }
  }
  const rows = report(tier);
  if (json) {
    out(JSON.stringify(rows, null, 2));
    return 0;
  }
  const pad = (value, width) => String(value).padEnd(width);
  out(`Fixed cost per host, ${tier} tier. Estimated tokens (characters / 4).\n`);
  out(`${pad("host", 11)}${pad("entry", 7)}${pad("every task", 12)}${pad("skill list", 12)}${pad("fixed", 7)}basis`);
  for (const row of rows) out(`${pad(row.platform, 11)}${pad(row.entry, 7)}${pad(row.everyTask, 12)}${pad(row.skills ? `${row.skillList} (${row.skills})` : "-", 12)}${pad(row.fixed, 7)}${row.basis}`);
  out("\nentry: files the host is meant to load itself. every task: AGENTS.md and .agents/CORE.md when not already an entry file.");
  out("skill list: names and descriptions of the skills in the folder the host is meant to list (count in brackets).");
  out("Intended paths from docs/TOOL-COMPATIBILITY.md, an upper bound where it says \"and/or\". A host counts as checked only after a real session.");
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { HOSTS, HOST_CHECKED, listedText, main, measureHost, report };
