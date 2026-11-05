#!/usr/bin/env node
"use strict";

// Senior Bar check: a read-only, static checklist of things a carefully built project usually has.
//
//   node scripts/uca-senior-check.cjs [project folder] [--json] [--list] [--min <percent>]
//
// It never runs project code, never writes, never follows symlinks, and never reads .env or key files (it only sees
// that they exist). When it finds a hard-coded secret it prints the file, line and kind, never the value.
// Scored checks are objective (a file is there or it is not). Heuristics are reported as hints and are not scored.
// A high score does not prove senior-grade quality, and a low one is a to-do list, not a verdict.
//
// Exit codes: 0 done, 1 the overall score is below --min, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const MAX_READ_BYTES = 400_000;
const MAX_FILES_DEFAULT = 3000;
const maxFiles = () => (Number(process.env.UCA_SENIOR_MAX_FILES) > 0 ? Number(process.env.UCA_SENIOR_MAX_FILES) : MAX_FILES_DEFAULT);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage", ".venv", "venv", "__pycache__", "target", "vendor", ".uca", ".uca-workspace", ".agents", ".claude", ".cursor", ".opencode", ".idea", ".vscode", ".turbo", ".cache"]);
const SECRET_FILE = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\..*)?|secrets?(?:\..*)?|service-account.*\.json)$/i;
const KIT_SCRIPT = /^scripts\/uca-[\w-]+\.(?:cjs|mjs)$/;
const SOURCE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs", ".vue", ".svelte", ".html", ".htm"]);
const CONFIG_EXT = new Set([".yml", ".yaml", ".toml", ".ini", ".properties", ".sh"]);
const UI_EXT = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte"]);
const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "Pipfile", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json"];
const DISCLAIMER = "This is a static checklist. A high score does not prove senior-grade quality; a low one is a to-do list, not a verdict.";

const SECRET_PATTERNS = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{16,}/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["hard-coded password", /\b(?:password|passwd|pwd)\s*[:=]\s*["'](?![^"']*(?:your|example|changeme|change_me|xxx|placeholder|<|\{\{|\$\{|process\.env|\*\*\*))[^"'\s]{8,}["']/i],
  ["hard-coded API key or token", /\b(?:api[_-]?key|secret|token)\s*[:=]\s*["'](?![^"']*(?:your|example|changeme|change_me|xxx|placeholder|<|\{\{|\$\{|process\.env|\*\*\*))[A-Za-z0-9_\-/+=]{16,}["']/i]
];
const RISKY_PATTERNS = [
  ["eval()", /\beval\s*\(/],
  ["new Function()", /\bnew Function\s*\(/],
  ["innerHTML assignment", /\.innerHTML\s*=/],
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
  ["document.write()", /document\.write\s*\(/],
  ["TLS verification off", /verify\s*=\s*False|rejectUnauthorized\s*:\s*false/],
  ["CORS allows every origin", /Access-Control-Allow-Origin["']?\s*[:,]\s*["']?\*/i],
  ["shell=True", /shell\s*=\s*True/],
  ["os.system()", /\bos\.system\s*\(/],
  ["pickle.loads()", /\bpickle\.loads?\s*\(/]
];

const posix = (value) => value.split(path.sep).join("/");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// ---------- scanning ----------

function scan(root) {
  const files = [];
  let truncated = false;
  const stack = [root];
  const limit = maxFiles();
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue; // symlinks and special files are never followed
      if (KIT_SCRIPT.test(posix(path.relative(root, full)))) continue; // the kit's own installed helpers are not the user's code
      if (files.length >= limit) {
        truncated = true;
        continue;
      }
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      files.push({ rel: posix(path.relative(root, full)), size, ext: path.extname(entry.name).toLowerCase(), name: entry.name });
    }
  }
  return { files, truncated };
}

function context(root) {
  const { files, truncated } = scan(root);
  const names = new Set(files.map((file) => file.rel));
  const cache = new Map();
  const read = (rel) => {
    const file = files.find((item) => item.rel === rel);
    if (!file || SECRET_FILE.test(file.name) || file.size > MAX_READ_BYTES) return null;
    if (cache.has(rel)) return cache.get(rel);
    let text = null;
    try {
      const buffer = fs.readFileSync(path.join(root, ...rel.split("/")));
      text = buffer.includes(0) ? null : buffer.toString("utf8");
    } catch {
      text = null;
    }
    cache.set(rel, text);
    return text;
  };
  const rootNames = new Set(files.filter((file) => !file.rel.includes("/")).map((file) => file.name));
  const source = files.filter((file) => SOURCE_EXT.has(file.ext));
  const scanned = files.filter((file) => (SOURCE_EXT.has(file.ext) || CONFIG_EXT.has(file.ext)) && !/lock/i.test(file.name));
  const manifests = MANIFESTS.filter((name) => rootNames.has(name));
  const hasUI = files.some((file) => UI_EXT.has(file.ext));
  const hasHtml = files.some((file) => file.ext === ".html" || file.ext === ".htm");
  let pkg = null;
  if (rootNames.has("package.json")) {
    try {
      pkg = JSON.parse(read("package.json") || "null");
    } catch {
      pkg = null;
    }
  }
  const sourceText = source.map((file) => ({ file, text: read(file.rel) })).filter((item) => item.text !== null);
  const usesEnv = sourceText.some((item) => /process\.env|os\.environ|os\.getenv|import\.meta\.env|\bgetenv\(|\bENV\[/.test(item.text));
  return { root, files, names, rootNames, read, source, scanned, manifests, hasUI, hasHtml, pkg, sourceText, usesEnv, truncated, hasSource: source.length > 0, staticSite: manifests.length === 0 && hasHtml };
}

// ---------- checks ----------

const pass = (evidence = []) => ({ status: "pass", evidence });
const fail = (evidence = []) => ({ status: "fail", evidence });
const na = (reason) => ({ status: "na", evidence: [reason] });
const hint = (evidence = []) => ({ status: "hint", evidence });

function findings(ctx, patterns, list) {
  const out = [];
  for (const file of list) {
    const text = ctx.read(file.rel);
    if (text === null) continue;
    for (const [kind, pattern] of patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
      for (const match of text.matchAll(re)) out.push(`${file.rel}:${lineOf(text, match.index)} ${kind}`);
    }
  }
  return out;
}

const TEST_FILE = /(?:^|\/)(?:tests?|__tests__|specs?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]*\.py$|_test\.(?:go|py)$|Test\.java$|_spec\.rb$/i;
const LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock", "Pipfile.lock", "uv.lock", "Cargo.lock", "go.sum", "Gemfile.lock", "composer.lock"];

const CHECKS = [
  { id: "structure.not-one-file", dimension: "structure", title: "Code is not piled into one big file", run: (ctx) => {
    if (!ctx.hasSource) return na("no source files found");
    const lines = ctx.sourceText.map((item) => ({ rel: item.file.rel, count: item.text.split("\n").length }));
    const big = lines.filter((item) => item.count > 400);
    if (ctx.source.length === 1 && big.length) return fail([`${big[0].rel} has ${big[0].count} lines and is the only source file`]);
    return pass();
  } },
  { id: "structure.manifest", dimension: "structure", title: "Dependencies are declared in a manifest", run: (ctx) => {
    if (!ctx.hasSource) return na("no source files found");
    if (ctx.staticSite) return na("a plain static site needs no manifest");
    return ctx.manifests.length ? pass([ctx.manifests.join(", ")]) : fail(["none of package.json, pyproject.toml, requirements.txt, go.mod, Cargo.toml, pom.xml, Gemfile, composer.json"]);
  } },
  { id: "docs.readme", dimension: "docs", title: "A README exists", run: (ctx) => {
    if (!ctx.hasSource) return na("no source files found");
    const readme = ctx.files.find((file) => /^readme(?:\.[a-z]+)?$/i.test(file.rel));
    return readme ? pass([readme.rel]) : fail(["no README at the project root"]);
  } },
  { id: "docs.run-instructions", dimension: "docs", title: "The README says what this is and how to run it", run: (ctx) => {
    const readme = ctx.files.find((file) => /^readme(?:\.[a-z]+)?$/i.test(file.rel));
    if (!readme) return na("no README");
    const text = ctx.read(readme.rel) || "";
    const how = /\b(install|run|start|usage|getting started|npm|pnpm|yarn|pip|python|node|open)\b/i.test(text);
    return text.trim().length >= 200 && how ? pass([readme.rel]) : fail([`${readme.rel} is ${text.trim().length} characters${how ? "" : " and mentions no way to install or run it"}`]);
  } },
  { id: "config.env-ignored", dimension: "secrets", title: ".env files are kept out of Git", run: (ctx) => {
    const envFile = ctx.rootNames.has(".env");
    if (!envFile && !ctx.usesEnv) return na("no .env file and no environment variables in use");
    const ignore = ctx.rootNames.has(".gitignore") ? ctx.read(".gitignore") || "" : null;
    if (ignore === null) return fail([".gitignore is missing"]);
    return /^\s*(?:\*\*\/)?\.env(?:\*|\.\*)?\s*$/m.test(ignore) || /^\s*\*\.env\s*$/m.test(ignore) ? pass() : fail([".gitignore does not list .env"]);
  } },
  { id: "config.env-example", dimension: "secrets", title: "An .env.example documents the settings the code reads", run: (ctx) => {
    if (!ctx.usesEnv) return na("the code reads no environment variables");
    return [".env.example", ".env.sample", ".env.template"].some((name) => ctx.rootNames.has(name)) ? pass() : fail(["the code reads environment variables but no .env.example exists"]);
  } },
  { id: "secrets.none-in-source", dimension: "secrets", title: "No secret is written into the source", run: (ctx) => {
    if (!ctx.scanned.length) return na("no source files found");
    const found = findings(ctx, SECRET_PATTERNS, ctx.scanned);
    return found.length ? fail(found.slice(0, 20)) : pass();
  } },
  { id: "tests.exist", dimension: "tests", title: "Test files exist", run: (ctx) => {
    if (!ctx.hasSource) return na("no source files found");
    const tests = ctx.files.filter((file) => TEST_FILE.test(file.rel));
    return tests.length ? pass([`${tests.length} test file(s)`]) : fail(["no test files found"]);
  } },
  { id: "tests.command-declared", dimension: "tests", title: "A test command is declared", run: (ctx) => {
    if (!ctx.hasSource) return na("no source files found");
    const script = ctx.pkg && ctx.pkg.scripts && ctx.pkg.scripts.test;
    if (script && !/no test specified/i.test(script)) return pass([`npm test: ${script}`]);
    if (["pytest.ini", "tox.ini", "noxfile.py", "Makefile"].some((name) => ctx.rootNames.has(name))) return pass(["pytest.ini, tox.ini, noxfile.py or Makefile"]);
    const pyproject = ctx.rootNames.has("pyproject.toml") ? ctx.read("pyproject.toml") || "" : "";
    if (/\[tool\.pytest/.test(pyproject)) return pass(["pyproject.toml [tool.pytest]"]);
    if (ctx.rootNames.has("go.mod") || ctx.rootNames.has("Cargo.toml")) return ctx.files.some((file) => TEST_FILE.test(file.rel) || /#\[test\]/.test(ctx.read(file.rel) || "")) ? pass(["go test or cargo test"]) : fail(["no tests for the built-in test command to run"]);
    return fail(["no test command in package.json, pytest/tox config or a Makefile"]);
  } },
  { id: "deploy.lockfile", dimension: "deploy", title: "Dependency versions are locked", run: (ctx) => {
    const hasDeps = ctx.pkg ? Object.keys({ ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies }).length > 0 : ctx.manifests.length > 0;
    if (!hasDeps || ctx.staticSite) return na("no dependencies to lock");
    const lock = LOCKFILES.find((name) => ctx.rootNames.has(name));
    if (lock) return pass([lock]);
    const requirements = ctx.rootNames.has("requirements.txt") ? ctx.read("requirements.txt") || "" : "";
    if (requirements && /==/.test(requirements)) return pass(["requirements.txt pins versions with =="]);
    return fail(["no lockfile and no pinned requirements"]);
  } },
  { id: "deploy.run-command", dimension: "deploy", title: "A start or build command is declared", run: (ctx) => {
    if (!ctx.pkg) return na("only checked for package.json projects");
    const scripts = ctx.pkg.scripts || {};
    return scripts.start || scripts.build || scripts.dev ? pass([Object.keys(scripts).filter((name) => ["start", "build", "dev"].includes(name)).join(", ")]) : fail(["package.json has no start, build or dev script"]);
  } },
  { id: "deploy.runtime-declared", dimension: "deploy", title: "The runtime version is declared", run: (ctx) => {
    if (ctx.staticSite || !ctx.hasSource || !ctx.manifests.length) return na("nothing to declare a runtime for");
    const hit = [".nvmrc", ".node-version", ".python-version", "runtime.txt", ".tool-versions", "rust-toolchain", "rust-toolchain.toml"].find((name) => ctx.rootNames.has(name));
    if (hit) return pass([hit]);
    if (ctx.pkg && ctx.pkg.engines && ctx.pkg.engines.node) return pass(["package.json engines.node"]);
    if (ctx.rootNames.has("go.mod") && /^go \d/m.test(ctx.read("go.mod") || "")) return pass(["go.mod go directive"]);
    if (/requires-python/.test(ctx.rootNames.has("pyproject.toml") ? ctx.read("pyproject.toml") || "" : "")) return pass(["pyproject.toml requires-python"]);
    return fail(["no engines, .nvmrc, .python-version, go directive or requires-python"]);
  } },
  { id: "git.ignores-dependencies", dimension: "git", title: ".gitignore keeps dependency and build folders out of Git", run: (ctx) => {
    const wanted = [];
    if (ctx.rootNames.has("package.json")) wanted.push("node_modules");
    if (ctx.rootNames.has("requirements.txt") || ctx.rootNames.has("pyproject.toml") || ctx.rootNames.has("Pipfile")) wanted.push("__pycache__|\\.venv|venv");
    if (!wanted.length) return na("no dependency folder expected");
    if (!ctx.rootNames.has(".gitignore")) return fail([".gitignore is missing"]);
    const text = ctx.read(".gitignore") || "";
    const missing = wanted.filter((item) => !new RegExp(`^\\s*/?(?:${item})/?\\s*$`, "m").test(text));
    return missing.length ? fail([`.gitignore does not list ${missing.map((item) => item.split("|")[0].replace("\\.", ".")).join(", ")}`]) : pass();
  } },
  { id: "a11y.img-alt", dimension: "accessibility", title: "Every image has an alt attribute", run: (ctx) => {
    const files = ctx.files.filter((file) => [".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte"].includes(file.ext));
    if (!files.length) return na("no UI files found");
    const found = findings(ctx, [["<img without alt", /<img\b(?![^>]*\balt\b)[^>]*>/i]], files);
    return found.length ? fail(found.slice(0, 20)) : pass();
  } },
  { id: "a11y.html-lang", dimension: "accessibility", title: "HTML pages declare a language", run: (ctx) => {
    const pages = ctx.files.filter((file) => file.ext === ".html" || file.ext === ".htm");
    if (!pages.length) return na("no HTML pages found");
    const bad = pages.filter((page) => /<html\b/i.test(ctx.read(page.rel) || "") && !/<html\b[^>]*\blang\s*=/i.test(ctx.read(page.rel) || "")).map((page) => `${page.rel} has <html> without lang`);
    return bad.length ? fail(bad.slice(0, 20)) : pass();
  } },
  { id: "a11y.viewport", dimension: "accessibility", title: "HTML pages set a viewport for phones", run: (ctx) => {
    const pages = ctx.files.filter((file) => file.ext === ".html" || file.ext === ".htm");
    if (!pages.length) return na("no HTML pages found");
    const bad = pages.filter((page) => /<head\b/i.test(ctx.read(page.rel) || "") && !/<meta[^>]*name\s*=\s*["']viewport["']/i.test(ctx.read(page.rel) || "")).map((page) => `${page.rel} has no viewport meta`);
    return bad.length ? fail(bad.slice(0, 20)) : pass();
  } }
];

const HINTS = [
  { id: "hint.risky-patterns", dimension: "security", title: "Patterns that need a reason (each may be fine)", run: (ctx) => {
    const found = findings(ctx, RISKY_PATTERNS, ctx.scanned);
    return found.length ? hint(found.slice(0, 20)) : pass();
  } },
  { id: "hint.ui-states", dimension: "states", title: "The UI source mentions loading, error and empty states", run: (ctx) => {
    const ui = ctx.files.filter((file) => UI_EXT.has(file.ext) || [".js", ".ts"].includes(file.ext));
    if (!ctx.hasUI) return na("no UI files found");
    const text = ui.map((file) => ctx.read(file.rel) || "").join("\n").toLowerCase();
    const words = { loading: /loading|spinner|skeleton/, error: /error|failed|try again/, empty: /empty|no results|nothing (?:here|yet)|no \w+ yet/ };
    const missing = Object.entries(words).filter(([, re]) => !re.test(text)).map(([name]) => name);
    return missing.length ? hint([`no mention of: ${missing.join(", ")}`]) : pass();
  } },
  { id: "hint.validation", dimension: "validation", title: "Input is validated somewhere", run: (ctx) => {
    if (!ctx.hasSource) return na("no source files found");
    const text = ctx.sourceText.map((item) => item.text).join("\n");
    const validates = /\b(zod|joi|yup|ajv|pydantic|marshmallow|express-validator|class-validator|validator|cerberus|wtforms)\b|\.safeParse\(|required\s*[:=]/i.test(text);
    return validates ? pass() : hint(["no validation library or schema found; check by reading the input handlers"]);
  } },
  { id: "hint.git-repo", dimension: "git", title: "The project is a Git repository", run: (ctx) => (fs.existsSync(path.join(ctx.root, ".git")) ? pass() : hint(["no .git folder (Git is recommended, not required)"])) }
];

// ---------- running ----------

function evaluate(root) {
  const ctx = context(root);
  const results = [...CHECKS.map((check) => ({ check, scored: true })), ...HINTS.map((check) => ({ check, scored: false }))].map(({ check, scored }) => {
    const outcome = check.run(ctx);
    return { id: check.id, dimension: check.dimension, title: check.title, scored, status: scored || outcome.status === "na" ? outcome.status : outcome.status === "pass" ? "pass" : "hint", evidence: outcome.evidence };
  });
  const dimensions = {};
  for (const item of results.filter((entry) => entry.scored && entry.status !== "na")) {
    dimensions[item.dimension] = dimensions[item.dimension] || { pass: 0, fail: 0 };
    dimensions[item.dimension][item.status === "pass" ? "pass" : "fail"] += 1;
  }
  const passed = Object.values(dimensions).reduce((sum, value) => sum + value.pass, 0);
  const failed = Object.values(dimensions).reduce((sum, value) => sum + value.fail, 0);
  const stack = [...(ctx.pkg ? ["node"] : []), ...(ctx.rootNames.has("requirements.txt") || ctx.rootNames.has("pyproject.toml") ? ["python"] : []), ...(ctx.rootNames.has("go.mod") ? ["go"] : []), ...(ctx.rootNames.has("Cargo.toml") ? ["rust"] : []), ...(ctx.staticSite ? ["static site"] : [])];
  return {
    version: 1,
    root: path.basename(root),
    stack,
    filesScanned: ctx.files.length,
    truncated: ctx.truncated,
    dimensions,
    overall: { pass: passed, fail: failed, percent: passed + failed ? Math.round((passed / (passed + failed)) * 100) : null },
    checks: results,
    disclaimer: DISCLAIMER
  };
}

function render(report) {
  const lines = [`UCA Senior Bar check: ${report.root}`, `Stack: ${report.stack.join(", ") || "not recognised"}; files scanned: ${report.filesScanned}${report.truncated ? " (limit reached, some files were not scanned)" : ""}`, ""];
  for (const [name, value] of Object.entries(report.dimensions)) lines.push(`${name.padEnd(14)} ${value.pass}/${value.pass + value.fail}`);
  if (!Object.keys(report.dimensions).length) lines.push("Nothing to score: no source files were found.");
  const failing = report.checks.filter((item) => item.status === "fail");
  if (failing.length) lines.push("", "To fix:");
  for (const item of failing) lines.push(`  FAIL ${item.id}: ${item.title}`, ...item.evidence.map((line) => `       ${line}`));
  const hints = report.checks.filter((item) => item.status === "hint");
  if (hints.length) lines.push("", "Worth a look (not scored):");
  for (const item of hints) lines.push(`  HINT ${item.id}: ${item.title}`, ...item.evidence.map((line) => `       ${line}`));
  lines.push("", report.overall.percent === null ? "Overall: nothing to score" : `Overall: ${report.overall.pass}/${report.overall.pass + report.overall.fail} (${report.overall.percent}%)`, report.disclaimer);
  return lines.join("\n");
}

const HELP = `UCA Senior Bar check (read-only)

  node scripts/uca-senior-check.cjs [project folder] [--json] [--list] [--min <percent>]

--json   print the full report as JSON
--list   print every check id and what it looks for
--min    exit 1 when the overall score is below this percent (nothing to score never fails)
It never runs project code, never writes, and never reads .env or key files. ${DISCLAIMER}`;

function main(argv, out = (line) => process.stdout.write(`${line}\n`), err = (line) => process.stderr.write(`${line}\n`)) {
  const args = argv.slice(2);
  const options = { json: false, list: false, min: null, dir: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      out(HELP);
      return 0;
    }
    if (arg === "--json") options.json = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--min") {
      const value = Number(args[(i += 1)]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        err("uca-senior-check: --min needs a number from 0 to 100.");
        return 2;
      }
      options.min = value;
    } else if (arg.startsWith("--")) {
      err(`uca-senior-check: unknown option ${arg}. Try --help.`);
      return 2;
    } else if (options.dir === null) options.dir = arg;
    else {
      err("uca-senior-check: only one project folder can be given.");
      return 2;
    }
  }
  if (options.list) {
    for (const check of [...CHECKS, ...HINTS]) out(`${check.id.padEnd(30)} ${check.id.startsWith("hint.") ? "hint " : "check"}  ${check.title}`);
    return 0;
  }
  const root = path.resolve(options.dir || process.cwd());
  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    err(`uca-senior-check: ${root} does not exist.`);
    return 2;
  }
  if (!stat.isDirectory()) {
    err(`uca-senior-check: ${root} is not a folder.`);
    return 2;
  }
  const report = evaluate(root);
  out(options.json ? JSON.stringify(report, null, 2) : render(report));
  return options.min !== null && report.overall.percent !== null && report.overall.percent < options.min ? 1 : 0;
}

module.exports = { main, evaluate, CHECKS, HINTS };

if (require.main === module) process.exitCode = main(process.argv);
