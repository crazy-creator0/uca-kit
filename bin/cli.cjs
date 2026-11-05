#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const detect = require("./detect.cjs");

const CORE_ENTRIES = [
  { source: "AGENTS.md", destination: "AGENTS.md" },
  { source: ".agents/AGENTS.md", destination: ".agents/AGENTS.md" },
  { source: ".agents/core-policy-full.md", destination: ".agents/core-policy-full.md" },
  { source: ".agents/skills", destination: ".agents/skills" },
  { source: ".agents/workflows", destination: ".agents/workflows" },
  { source: ".agents/catalog/skill-catalog.md", destination: ".agents/catalog/skill-catalog.md" },
  { source: ".agents/profiles", destination: ".agents/profiles" },
  { source: ".agents/router-rule.md", destination: ".agents/router-rule.md" },
  { source: "AGENT-SKILL-MAP.md", destination: "AGENT-SKILL-MAP.md" },
  { source: "HOST-CAPABILITY-FALLBACK.md", destination: "HOST-CAPABILITY-FALLBACK.md" },
  { source: "USAGE-PRIVACY.md", destination: "USAGE-PRIVACY.md" },
  { source: "scripts/uca-usage.cjs", destination: "scripts/uca-usage.cjs" },
];

const SKILLS_ROOT = ".agents/skills";
const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

let cachedProfiles = null;

function loadProfiles() {
  if (cachedProfiles) return cachedProfiles;
  const profilesPath = path.join(__dirname, "..", ".agents", "profiles", "profiles.json");
  let data;
  try {
    data = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot load skill profiles from ${profilesPath}: ${error.message}`);
  }
  for (const [name, definition] of Object.entries(data)) {
    if (!definition || !Array.isArray(definition.skills)) {
      throw new Error(`Profile "${name}" must define a "skills" array.`);
    }
    for (const skill of definition.skills) {
      if (skill !== "*" && !SKILL_NAME_PATTERN.test(skill)) {
        throw new Error(`Profile "${name}" contains an invalid skill name: ${skill}`);
      }
    }
  }
  cachedProfiles = data;
  return data;
}

function profileSkillNames(profile) {
  if (profile == null) return null;
  const profiles = loadProfiles();
  if (!Object.hasOwn(profiles, profile)) {
    throw new Error(`Unknown profile "${profile}". Choose: ${Object.keys(profiles).join(", ")}.`);
  }
  const skills = profiles[profile].skills;
  return skills.includes("*") ? null : [...skills];
}

const TIER_NAMES = ["lite", "standard", "full"];
const DEFAULT_TIER = "standard";
const CONFIG_PATH = ".uca/config.json";
let cachedTiers = null;

function loadTiers() {
  if (cachedTiers) return cachedTiers;
  const tiersPath = path.join(__dirname, "..", ".agents", "tiers.json");
  let data;
  try {
    data = JSON.parse(fs.readFileSync(tiersPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot load tiers from ${tiersPath}: ${error.message}`);
  }
  for (const name of TIER_NAMES) {
    const tier = data[name];
    if (!tier || typeof tier.core !== "string" || typeof tier.agents !== "string" ||
        typeof tier.skillsRoot !== "string" || !Array.isArray(tier.skills)) {
      throw new Error(`Tier "${name}" must define core, agents, skillsRoot, and a skills array.`);
    }
    for (const skill of tier.skills) {
      if (skill !== "*" && !SKILL_NAME_PATTERN.test(skill)) {
        throw new Error(`Tier "${name}" contains an invalid skill name: ${skill}`);
      }
    }
    if (tier.include !== undefined && !(Array.isArray(tier.include) && tier.include.every((file) => typeof file === "string"))) {
      throw new Error(`Tier "${name}" include must be an array of file paths.`);
    }
  }
  cachedTiers = data;
  return data;
}

function assertTierName(value) {
  if (!TIER_NAMES.includes(value)) {
    throw new Error(`Unknown tier "${value}". Choose: ${TIER_NAMES.join(", ")}.`);
  }
}

// Display-only: the installer never applies this suggestion by itself.
function suggestTier(contextTokens) {
  if (contextTokens <= 8000) return "lite";
  if (contextTokens <= 32000) return "standard";
  return "full";
}

// Skill names a tier installs, narrowed by an optional profile. null means every skill in the tier's root.
function tierSkillNames(tier, profile) {
  const tierSkills = loadTiers()[tier].skills;
  const profileSkills = profileSkillNames(profile);
  const base = tierSkills.includes("*") ? null : [...tierSkills];
  if (!profileSkills) return base;
  if (!base) return profileSkills;
  const selected = base.filter((skill) => profileSkills.includes(skill));
  if (selected.length === 0) {
    throw new Error(`Profile "${profile}" shares no skills with the ${tier} tier. Choose another profile or tier.`);
  }
  return selected;
}

function resolveEntries(entries, skillNames, skillsRoot = SKILLS_ROOT) {
  if (!skillNames && skillsRoot === SKILLS_ROOT) return entries;
  const expanded = [];
  for (const entry of entries) {
    if (entry.source !== SKILLS_ROOT) {
      expanded.push(entry);
      continue;
    }
    if (!skillNames) {
      expanded.push({ source: skillsRoot, destination: entry.destination });
      continue;
    }
    for (const skill of skillNames) {
      expanded.push({
        source: `${skillsRoot}/${skill}`,
        destination: `${entry.destination}/${skill}`
      });
    }
  }
  return expanded;
}

const PLATFORM_ENTRIES = {
  generic: [
    { source: "GENERIC-IDE-SETUP.md", destination: "GENERIC-IDE-SETUP.md" }
  ],
  codex: [],
  cursor: [
    { source: ".cursor/rules/universal-coding-agent-kit.mdc", destination: ".cursor/rules/universal-coding-agent-kit.mdc" },
    { source: ".cursor/agents/designer.md", destination: ".cursor/agents/designer.md" },
    { source: ".cursor/agents/service-strategist.md", destination: ".cursor/agents/service-strategist.md" }
  ],
  claude: [
    { source: "CLAUDE.md", destination: "CLAUDE.md" },
    { source: ".agents/skills", destination: ".claude/skills" }
  ],
  gemini: [
    { source: "GEMINI.md", destination: "GEMINI.md" },
    { source: ".agents/skills", destination: ".gemini/skills" }
  ],
  copilot: [
    { source: ".github/copilot-instructions.md", destination: ".github/copilot-instructions.md" },
    { source: ".agents/skills", destination: ".github/skills" }
  ],
  opencode: [
    { source: "OPENCODE-SETUP.md", destination: "OPENCODE-SETUP.md" },
    { source: ".opencode/agents", destination: ".opencode/agents" },
    { source: ".opencode/plugins/uca-usage.mjs", destination: ".opencode/plugins/uca-usage.mjs" }
  ],
  devin: [
    { source: ".devin/rules/universal-coding-agent-kit.md", destination: ".devin/rules/universal-coding-agent-kit.md" }
  ],
  windsurf: [
    { source: ".windsurf/rules/universal-coding-agent-kit.md", destination: ".windsurf/rules/universal-coding-agent-kit.md" },
    { source: ".agents/skills", destination: ".windsurf/skills" }
  ],
  junie: [
    { source: ".junie/rules/universal-coding-agent-kit.md", destination: ".junie/rules/universal-coding-agent-kit.md" }
  ],
  jetbrains: [
    { source: ".aiassistant/rules/universal-coding-agent-kit.md", destination: ".aiassistant/rules/universal-coding-agent-kit.md" }
  ]
};

// Files to install for a platform, profile, and optional tier. A null tier keeps the pre-tier behavior.
function buildEntries({ platform, profile = null, tier = null }) {
  if (!tier) {
    return resolveEntries([...CORE_ENTRIES, ...PLATFORM_ENTRIES[platform]], profileSkillNames(profile));
  }
  assertTierName(tier);
  const definition = loadTiers()[tier];
  const tierRoot = [
    { source: definition.agents, destination: "AGENTS.md" },
    { source: definition.core, destination: ".agents/CORE.md" }
  ];
  const shared = definition.extras
    ? CORE_ENTRIES.filter((entry) => entry.source !== "AGENTS.md")
    : [{ source: SKILLS_ROOT, destination: SKILLS_ROOT }];
  const included = (definition.include || []).map((file) => ({ source: file, destination: file }));
  return resolveEntries(
    [...tierRoot, ...shared, ...included, ...PLATFORM_ENTRIES[platform]],
    tierSkillNames(tier, profile),
    definition.skillsRoot
  );
}

function printHelp() {
  return `create-universal-coding-agent-kit — UCA Kit installer for shared coding-agent rules

Usage:
  npx create-universal-coding-agent-kit
  npx create-universal-coding-agent-kit init [directory] [options]

Options:
  --dir, --project-root <path>   Destination project (default: current directory)
  --platform <name>              generic, codex, cursor, claude, gemini, copilot,
                                 opencode, devin, windsurf, junie, jetbrains
  --tier <name>                  lite, standard, full
                                 Controls how much guidance is installed. Without
                                 --tier you are asked in a terminal; non-interactive
                                 runs use standard. With --profile and no --tier,
                                 the full tier files are used.
  --context <tokens>             Print a suggested tier for your model's context
                                 size (<= 8000 lite, <= 32000 standard, above: full).
                                 Display only, unless --auto-tier is also given.
  --auto-tier                    Choose the tier from --context (unknown context:
                                 standard) and show the detected machine and the
                                 reason. An explicit --tier always wins, and a tier
                                 already recorded for the project is kept, never
                                 changed. Hardware is shown but never used to
                                 guess context size.
  --profile <name>               all, minimal, fullstack, frontend, security-focused
                                 Narrows which skills the tier installs (default: all)
  --yes, -y                      Skip prompts; default to generic and keep conflicts
  --force                        Overwrite existing files without prompting (use carefully)
  --dry-run                      Preview changes without writing files
  --help, -h                     Show this help
  --version                      Show package version

Examples:
  npx create-universal-coding-agent-kit init .
  npx create-universal-coding-agent-kit init . --platform cursor
  npx create-universal-coding-agent-kit init ../my-app --platform claude
  npx create-universal-coding-agent-kit init . --platform generic --dry-run
  npx create-universal-coding-agent-kit init . --platform cursor --profile minimal
  npx create-universal-coding-agent-kit init . --platform generic --tier lite
  npx create-universal-coding-agent-kit init . --context 8000

After installing, these commands use the manifest in .uca/manifest.json (run each with --help):
  doctor [dir]       check the install      diff [dir]       show what an update would change
  update [dir]       refresh unedited files uninstall [dir]  remove only what the installer wrote

Existing files are preserved by default. In an interactive terminal, detected
conflicts prompt you to keep existing files, override them, or cancel the install.
Cancel leaves the project unchanged. --force explicitly overrides without prompting.
The generic option also works with unlisted IDEs: use GENERIC-IDE-SETUP.md for
manual instruction setup.
`;
}

function parseArgs(argv) {
  const options = {
    dir: ".",
    platform: null,
    profile: null,
    tier: null,
    context: null,
    autoTier: false,
    yes: false,
    force: false,
    dryRun: false,
    help: false,
    version: false
  };
  let positionalDirSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "init") continue;
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--version") {
      options.version = true;
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--dir" || arg === "--project-root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Option ${arg} requires a path.`);
      }
      options.dir = value;
      positionalDirSeen = true;
      index += 1;
      continue;
    }
    if (arg === "--platform") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Option --platform requires a platform name.");
      }
      if (!Object.hasOwn(PLATFORM_ENTRIES, value)) {
        throw new Error(`Unknown platform "${value}". Choose: ${Object.keys(PLATFORM_ENTRIES).join(", ")}.`);
      }
      options.platform = value;
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Option --profile requires a profile name.");
      }
      profileSkillNames(value);
      options.profile = value;
      index += 1;
      continue;
    }
    if (arg === "--tier") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Option --tier requires a tier name.");
      }
      assertTierName(value);
      options.tier = value;
      index += 1;
      continue;
    }
    if (arg === "--auto-tier") {
      options.autoTier = true;
      continue;
    }
    if (arg === "--context") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--") || !/^[0-9]+$/.test(value) || Number(value) < 1) {
        throw new Error("Option --context requires a positive whole number of tokens.");
      }
      options.context = Number(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!positionalDirSeen) {
      options.dir = arg;
      positionalDirSeen = true;
      continue;
    }
    throw new Error(`Unexpected extra argument: ${arg}`);
  }

  return options;
}

function safeResolve(root, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Refusing absolute path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside root: ${relativePath}`);
  }
  return resolved;
}

function assertNoSymlinkParents(projectRoot, destination) {
  const relative = path.relative(projectRoot, destination);
  const parts = relative.split(path.sep).slice(0, -1);
  let current = projectRoot;

  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to write through a symbolic-link directory: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Destination parent is not a directory: ${current}`);
    }
  }
}

function listSourceFiles(sourcePath) {
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to follow a template symlink: ${sourcePath}`);
  }
  if (stat.isFile()) return [sourcePath];
  if (!stat.isDirectory()) {
    throw new Error(`Unsupported template entry: ${sourcePath}`);
  }

  const files = [];
  for (const child of fs.readdirSync(sourcePath).sort()) {
    files.push(...listSourceFiles(path.join(sourcePath, child)));
  }
  return files;
}

function collectFiles(packageRoot, entries) {
  const root = path.resolve(packageRoot);
  const planned = [];
  for (const entry of entries) {
    const sourceRoot = safeResolve(root, entry.source);
    if (!fs.existsSync(sourceRoot)) {
      throw new Error(`Required template not found: ${entry.source}`);
    }

    for (const sourceFile of listSourceFiles(sourceRoot)) {
      const relativeInsideSource = path.relative(sourceRoot, sourceFile);
      const destinationRelative = fs.statSync(sourceRoot).isDirectory()
        ? path.join(entry.destination, relativeInsideSource)
        : entry.destination;
      planned.push({
        source: sourceFile,
        destination: destinationRelative
      });
    }
  }
  return planned;
}

function findExistingConflicts(projectRoot, files) {
  const root = path.resolve(projectRoot);
  const conflicts = [];

  for (const item of files) {
    const destination = safeResolve(root, item.destination);
    assertNoSymlinkParents(root, destination);
    let stat;
    try {
      stat = fs.lstatSync(destination);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to replace a symbolic link: ${destination}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Destination exists but is not a regular file: ${destination}`);
    }
    conflicts.push(path.relative(root, destination).split(path.sep).join("/"));
  }

  return conflicts;
}

async function chooseConflictMode(conflicts) {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    console.log(`\nFound ${conflicts.length} existing file conflict(s):`);
    for (const relative of conflicts.slice(0, 12)) console.log(`  - ${relative}`);
    if (conflicts.length > 12) console.log(`  ... and ${conflicts.length - 12} more`);
    console.log("\nChoose how to handle conflicts:");
    console.log("  1. Remove conflicting UCA Kit files from this install; keep user files and add the rest");
    console.log("  2. Override existing files with UCA Kit versions");
    console.log("  3. Cancel installation (leave the project unchanged)");
    while (true) {
      const answer = (await terminal.question("Choose 1, 2, or 3 [1]: ")).trim();
      if (!answer || answer === "1") return "skip";
      if (answer === "2") return "overwrite";
      if (answer === "3") return "cancel";
      console.log("Please enter 1, 2, or 3.");
    }
  } finally {
    terminal.close();
  }
}

const hashBytes = (bytes) => require("node:crypto").createHash("sha256").update(bytes).digest("hex");
const toManifestPath = (destination) => destination.split(path.sep).join("/");

function installKit({
  packageRoot,
  projectRoot,
  platform = "generic",
  profile = null,
  tier = null,
  force = false,
  dryRun = false,
  conflictMode = null,
  log = () => {}
}) {
  if (!Object.hasOwn(PLATFORM_ENTRIES, platform)) {
    throw new Error(`Unknown platform "${platform}". Choose: ${Object.keys(PLATFORM_ENTRIES).join(", ")}.`);
  }

  const resolvedPackageRoot = path.resolve(packageRoot);
  const resolvedProjectRoot = path.resolve(projectRoot);
  const entries = buildEntries({ platform, profile, tier });
  const files = collectFiles(resolvedPackageRoot, entries);
  const summary = { copied: 0, overwritten: 0, skipped: 0, errors: 0, cancelled: false };
  const written = {};
  const mode = conflictMode || (force ? "overwrite" : "skip");

  if (!["skip", "overwrite", "cancel"].includes(mode)) {
    throw new Error(`Unknown conflict mode "${mode}". Choose skip, overwrite, or cancel.`);
  }
  if (mode === "cancel") {
    summary.cancelled = true;
    summary.conflicts = findExistingConflicts(resolvedProjectRoot, files);
    log("Installation cancelled. No files were changed.");
    return summary;
  }

  for (const item of files) {
    let destination;
    try {
      destination = safeResolve(resolvedProjectRoot, item.destination);
      assertNoSymlinkParents(resolvedProjectRoot, destination);
      let exists = false;
      try {
        const destinationStat = fs.lstatSync(destination);
        exists = true;
        if (destinationStat.isSymbolicLink()) {
          throw new Error(`Refusing to replace a symbolic link: ${destination}`);
        }
        if (!destinationStat.isFile()) {
          throw new Error(`Destination exists but is not a regular file: ${destination}`);
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      if (exists && mode !== "overwrite") {
        log(`SKIP existing: ${path.relative(resolvedProjectRoot, destination)}`);
        summary.skipped += 1;
        // A file that is byte-for-byte what the kit would write is adopted into the manifest; any other file stays the user's.
        const sourceBytes = fs.readFileSync(item.source);
        if (sourceBytes.equals(fs.readFileSync(destination))) written[toManifestPath(item.destination)] = hashBytes(sourceBytes);
        continue;
      }

      if (dryRun) {
        log(`${exists ? "OVERWRITE" : "COPY"}: ${path.relative(resolvedProjectRoot, destination)}`);
        if (exists) summary.overwritten += 1;
        else summary.copied += 1;
        continue;
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(item.source, destination);
      written[toManifestPath(item.destination)] = hashBytes(fs.readFileSync(item.source));
      log(`${exists ? "UPDATED" : "COPIED"}: ${path.relative(resolvedProjectRoot, destination)}`);
      if (exists) summary.overwritten += 1;
      else summary.copied += 1;
    } catch (error) {
      summary.errors += 1;
      log(`ERROR: ${item.destination}: ${error.message}`);
    }
  }

  if (tier) {
    writeTierConfig({ projectRoot: resolvedProjectRoot, tier, mode, dryRun, summary, log });
    if (!dryRun) {
      const expected = `${JSON.stringify({ tier }, null, 2)}\n`;
      try {
        if (fs.readFileSync(path.join(resolvedProjectRoot, CONFIG_PATH), "utf8") === expected) written[CONFIG_PATH] = hashBytes(Buffer.from(expected));
      } catch {
        /* no config file was written or it is not readable: it is not ours */
      }
    }
  }

  if (!dryRun && summary.errors === 0) {
    try {
      require("./lifecycle.cjs").recordInstall({ packageRoot: resolvedPackageRoot, projectRoot: resolvedProjectRoot, platform, profile, tier, written, log });
    } catch (error) {
      summary.errors += 1;
      log(`ERROR: could not write the install manifest: ${error.message}`);
    }
  }

  return summary;
}

// Records the selected tier so later tools and adapters can read it. Existing config is preserved unless overwriting.
function writeTierConfig({ projectRoot, tier, mode, dryRun, summary, log }) {
  try {
    const destination = safeResolve(projectRoot, CONFIG_PATH);
    assertNoSymlinkParents(projectRoot, destination);
    let exists = false;
    try {
      const stat = fs.lstatSync(destination);
      exists = true;
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`Refusing to replace a non-regular file: ${destination}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (exists && mode !== "overwrite") {
      log(`SKIP existing: ${CONFIG_PATH}`);
      summary.skipped += 1;
      return;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, `${JSON.stringify({ tier }, null, 2)}\n`, "utf8");
    }
    log(`${dryRun ? (exists ? "OVERWRITE" : "COPY") : (exists ? "UPDATED" : "COPIED")}: ${CONFIG_PATH}`);
    if (exists) summary.overwritten += 1;
    else summary.copied += 1;
  } catch (error) {
    summary.errors += 1;
    log(`ERROR: ${CONFIG_PATH}: ${error.message}`);
  }
}

async function choosePlatform() {
  const labels = [
    ["generic", "Unknown IDE / universal manual setup (recommended for unlisted tools)"],
    ["codex", "OpenAI Codex"],
    ["cursor", "Cursor"],
    ["claude", "Claude Code"],
    ["gemini", "Gemini CLI"],
    ["copilot", "GitHub Copilot"],
    ["opencode", "OpenCode"],
    ["devin", "Devin"],
    ["windsurf", "Windsurf / Cascade"],
    ["junie", "JetBrains Junie"],
    ["jetbrains", "JetBrains AI Assistant"]
  ];
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    console.log("\nWhich coding tool do you use?");
    labels.forEach(([key, description], index) => {
      console.log(`  ${index + 1}. ${description} [${key}]`);
    });
    const answer = await terminal.question("Choose a number (default 1): ");
    if (!answer.trim()) return "generic";
    const choice = Number.parseInt(answer.trim(), 10);
    if (!Number.isInteger(choice) || choice < 1 || choice > labels.length) {
      throw new Error(`Please enter a number from 1 to ${labels.length}.`);
    }
    return labels[choice - 1][0];
  } finally {
    terminal.close();
  }
}

// The tier an earlier install recorded for this project, or null when there is none or the record is unreadable.
function recordedTier(projectRoot) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, ".uca", "manifest.json"), "utf8"));
    return TIER_NAMES.includes(manifest.tier) ? manifest.tier : null;
  } catch {
    return null;
  }
}

async function chooseTier() {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    console.log("\nHow much guidance should the agent load?");
    console.log("  1. lite     - smallest; for small local models (about 8k tokens of context)");
    console.log("  2. standard - balanced default for most models");
    console.log("  3. full     - everything, for large-context models");
    while (true) {
      const answer = (await terminal.question("Choose 1, 2, or 3 [2]: ")).trim();
      if (!answer || answer === "2") return "standard";
      if (answer === "1") return "lite";
      if (answer === "3") return "full";
      console.log("Please enter 1, 2, or 3.");
    }
  } finally {
    terminal.close();
  }
}

async function main(argv = process.argv.slice(2)) {
  if (["doctor", "diff", "update", "uninstall"].includes(argv[0])) {
    return require("./lifecycle.cjs").run(argv, { packageRoot: path.resolve(__dirname, "..") });
  }
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`Error: ${error.message}\n\nRun with --help for usage.`);
    return 2;
  }

  const packageRoot = path.resolve(__dirname, "..");
  if (options.help) {
    console.log(printHelp());
    return 0;
  }
  if (options.version) {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    console.log(manifest.version);
    return 0;
  }

  if (!options.platform) {
    if (process.stdin.isTTY && process.stdout.isTTY && !options.yes) {
      try {
        options.platform = await choosePlatform();
      } catch (error) {
        console.error(`Error: ${error.message}`);
        return 2;
      }
    } else {
      options.platform = "generic";
    }
  }

  const projectRoot = path.resolve(process.cwd(), options.dir);
  if (options.autoTier) {
    console.log("\nDetected on this machine (read-only; nothing is stored or sent):");
    for (const line of detect.describeEnvironment(detect.detectEnvironment())) console.log(`  ${line}`);
    console.log("  Memory and CPU are shown for information. They do not tell how large the model's context is.");
  }
  if (options.context !== null && !options.autoTier) {
    console.log(`Suggested tier for ${options.context} tokens of context: ${suggestTier(options.context)} (suggestion only; it does not change your selection).`);
  }

  if (!options.tier) {
    if (options.autoTier) {
      const recorded = recordedTier(projectRoot);
      if (recorded) {
        options.tier = recorded;
        console.log(`This project already has the ${recorded} tier installed, so that tier is kept. Use --tier or the update command to change it.`);
      } else {
        const recommendation = detect.recommendTier({ context: options.context });
        options.tier = recommendation.tier;
        console.log(`Recommended tier: ${recommendation.tier} (${recommendation.basis} context). ${recommendation.reason}`);
        console.log("Choose another tier with --tier <lite|standard|full>.");
      }
    } else if (options.profile) {
      options.tier = "full";
    } else if (process.stdin.isTTY && process.stdout.isTTY && !options.yes) {
      options.tier = await chooseTier();
    } else {
      options.tier = DEFAULT_TIER;
    }
  }

  let conflictMode = options.force ? "overwrite" : "skip";
  if (!options.force && !options.yes && !options.dryRun && process.stdin.isTTY && process.stdout.isTTY) {
    try {
      const plannedEntries = buildEntries({
        platform: options.platform,
        profile: options.profile,
        tier: options.tier
      });
      const plannedFiles = collectFiles(packageRoot, plannedEntries);
      const conflicts = findExistingConflicts(projectRoot, plannedFiles);
      if (conflicts.length > 0) {
        conflictMode = await chooseConflictMode(conflicts);
        if (conflictMode === "cancel") {
          console.log("\nInstallation cancelled. No files were changed.");
          return 0;
        }
      }
    } catch (error) {
      console.error(`Cannot safely check installation conflicts: ${error.message}`);
      return 1;
    }
  }
  console.log(`\nInstalling UCA Kit (Universal Coding Agent Kit) into: ${projectRoot}`);
  console.log(`Platform profile: ${options.platform}`);
  console.log(`Tier: ${options.tier}`);
  console.log(`Skill profile: ${options.profile || "all (default)"}`);
  if (options.force) {
    console.warn("Warning: --force may overwrite existing instruction and skill files.");
  } else if (conflictMode === "overwrite") {
    console.warn("You chose to override conflicting files; review the copied files and diffs.");
  } else {
    console.log("Existing files will be preserved; conflicts will be skipped.");
  }
  if (options.dryRun) console.log("Dry-run enabled; no files will be changed.\n");
  else console.log("");

  const lifecycle = require("./lifecycle.cjs");
  let before = {};
  if (!options.dryRun) {
    try {
      before = lifecycle.snapshotBefore({ packageRoot, projectRoot, platform: options.platform, profile: options.profile, tier: options.tier });
    } catch (error) {
      console.error(`Cannot safely check the existing files: ${error.message}`);
      return 1;
    }
  }
  let summary;
  try {
    summary = installKit({
      packageRoot,
      projectRoot,
      platform: options.platform,
      profile: options.profile,
      tier: options.tier,
      force: options.force,
      dryRun: options.dryRun,
      conflictMode,
      log: (message) => console.log(`  ${message}`)
    });
  } catch (error) {
    console.error(`Install failed: ${error.message}`);
    return 1;
  }

  if (summary.cancelled) {
    console.log("\nInstallation cancelled. No files were changed.");
    return 0;
  }
  console.log(
    `\nSummary: ${summary.copied} copied, ${summary.overwritten} overwritten, ${summary.skipped} skipped, ${summary.errors} errors.`
  );
  if (!options.dryRun) {
    const verdict = lifecycle.verifyInstall(projectRoot, packageRoot, before);
    if (verdict.ok && summary.errors === 0) {
      console.log(`Verification: PASS. ${verdict.checked} planned files present, manifest valid${verdict.kept.length ? `, ${verdict.kept.length} of your own file(s) kept untouched` : ""}.`);
    } else {
      console.error("Verification: FAIL. The install is incomplete or inconsistent. Nothing was deleted.");
      for (const problem of verdict.problems) console.error(`  - ${problem}`);
      if (summary.errors > 0) console.error(`  - ${summary.errors} operation(s) reported an error above.`);
      console.error('Run the same command again to retry (existing files are kept), run "doctor" for details, or run "uninstall" to remove what the kit installed.');
      return 1;
    }
  }
  if (summary.errors > 0) return 1;
  if (options.profile && options.profile !== "all") {
    console.log("\nSkill routing: the agent loads at most one task-matching skill (see .agents/router-rule.md).");
  }
  if (options.platform === "generic") {
    console.log("\nNext step: open GENERIC-IDE-SETUP.md and add its copy-paste instructions to your IDE.");
  } else {
    console.log("\nNext step: open the project in your IDE and verify its rules/skills are loaded.");
  }
  console.log("Review the copied files before committing them.");
  return 0;
}

module.exports = {
  CORE_ENTRIES,
  PLATFORM_ENTRIES,
  TIER_NAMES,
  buildEntries,
  CONFIG_PATH,
  assertNoSymlinkParents,
  collectFiles,
  findExistingConflicts,
  installKit,
  loadProfiles,
  loadTiers,
  parseArgs,
  printHelp,
  profileSkillNames,
  recordedTier,
  resolveEntries,
  safeResolve,
  suggestTier,
  tierSkillNames
};

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
