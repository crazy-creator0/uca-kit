#!/usr/bin/env node
"use strict";

// Audit check: a read-only, static look for problems in what a project's code does.
//
//   node scripts/uca-audit-check.cjs [project folder] [--json]
//
// It reads JavaScript, TypeScript and Python source and the dependency manifests. It never runs project code, never
// writes, never follows symlinks, never reads .env or key files, and never prints a secret's value: a finding names
// the file, the line and the setting, not what it is set to.
//
// Each finding has a kind, file, line, confidence ("certain" or "needs a human"), how it could be abused and the fix.
// "Certain" means the pattern on that line is the problem as written; it does not mean the app is exploitable in
// production. "Needs a human" means the code points at a problem that depends on things outside the line.
// Not covered: problems reached through helper functions, anything that shows only at run time, other languages.
// Tests, examples, fixtures and benchmarks are skipped: the audit is about the code that runs for users.
//
// Exit codes: 0 done (findings or not), 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const MAX_READ_BYTES = 400_000;
const MAX_FILES = 3000;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage", ".venv", "venv", "env", "__pycache__", "target", "vendor", ".uca", ".uca-workspace", ".agents", ".claude", ".cursor", ".opencode", ".idea", ".vscode", ".turbo", ".cache", "migrations", "alembic"]);
const SKIP_PATH = /(^|\/)(tests?|__tests__|spec|e2e|examples?|fixtures?|mocks?|benchmarks?|scripts\/uca-[\w-]+\.cjs$)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(test_[^/]+|[^/]+_test|conftest)\.py$/;
const SECRET_FILE = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$/i;
const JS = /\.[cm]?[jt]sx?$/;
const PY = /\.py$/;
const SECRET_NAME = /(secret|token|api_?key|apikey|password|passwd|private_?key|signing_?key|jwt_?key)/i;
const RATE_LIMIT_DEPS = /^(express-rate-limit|rate-limiter-flexible|express-slow-down|@nestjs\/throttler|koa-ratelimit|express-brute|slowapi|fastapi-limiter|flask-limiter|django-ratelimit|django-axes|limits)$/i;
const SQL_START = /^\s*(select|insert|update|delete|with)\b/i;
const DB_CALL_JS = /(\b(?:db|pool|client|conn|connection|knex|sql|trx|tx)\s*\.\s*(?:query|execute|raw|one|oneOrNone|any|many|none)\s*\(|\bprisma\s*\.\s*\w+\s*\.\s*(?:find\w*|count|aggregate|update\w*|delete\w*|create\w*|upsert)\s*\(|\.\s*(?:findOne|findById|findByPk|findAll|findUnique|findFirst|findMany)\s*\()/;
const DB_CALL_PY = /(\bsession\s*\.\s*(?:exec|execute|get|query|scalars?)\s*\(|\.objects\s*\.\s*(?:get|filter|exclude|all)\s*\(|\bcursor\s*\.\s*execute\s*\(|\bconn(?:ection)?\s*\.\s*execute\s*\(|\bdb\s*\.\s*(?:query|execute|get)\s*\()/;

const FIX = {
  "hardcoded-secret": ["Anyone who can read the code can use this value; if the setting is missing in production, the app silently runs with it.", "Read the setting from the environment and stop at startup when it is missing. Never fall back to a value written in code."],
  "sql-injection": ["Text from outside is pasted into SQL, so a crafted value can read or change data the query was never meant to touch.", "Pass values as query parameters ($1, ?, :name) instead of building the SQL string."],
  "missing-auth": ["This route changes data but has no login or permission check, while other routes in the same file do.", "Add the same auth middleware the other routes use, or write down why this route is public."],
  "unbounded-read": ["Returns every row of the table with no filter and no limit: slow and memory-heavy as data grows, and possibly other users' data.", "Filter to what the caller may see and add a limit with paging."],
  "query-in-loop": ["One database query per item in the loop: fine for 5 items, slow for 500 (the N+1 problem).", "Fetch all items with one query before the loop (IN / ANY / a join) and look them up in memory."],
  "error-detail-leak": ["Server errors send internal details (stack trace or exception text) to the client, showing paths, libraries and code structure.", "Log the details on the server and send a short generic message."],
  "no-rate-limit": ["A login route with no rate limiter anywhere in the dependencies allows unlimited password guessing.", "Limit attempts per IP and per account (for example express-rate-limit or slowapi), or confirm a proxy in front does it."],
  "debug-mode": ["Debug mode is switched on in code; if it reaches production it shows tracebacks and internals to visitors.", "Read debug from a setting that is off by default and in production."],
  "cors-credentials-wildcard": ["Any website may call this API from a visitor's browser, with credentials allowed.", "List the real front-end origins instead of *."],
  "missing-index": ["This column is used to look rows up but has no index, so each lookup scans the whole table as it grows.", "Add an index (index=True, @@index or @unique) with a migration, after checking the query really runs often."]
};

class UsageError extends Error {}

function walk(root) {
  const files = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full);
      } else if (entry.isFile() && !SECRET_FILE.test(entry.name)) files.push(rel);
    }
  };
  visit(root);
  return files.sort();
}

function reader(root) {
  const cache = new Map();
  return (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    let text = null;
    try {
      const full = path.join(root, rel);
      if (fs.statSync(full).size <= MAX_READ_BYTES) text = fs.readFileSync(full, "utf8");
    } catch {
      text = null;
    }
    cache.set(rel, text);
    return text;
  };
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const isComment = (line) => /^\s*(\/\/|#|\*|\/\*)/.test(line);

// The text of a call starting at `start` (the index of its "("), up to the matching ")". Strings are skipped.
function callText(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length && index < start + 4000; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return text.slice(start, start + 400);
}

// Splits call arguments at commas that are not inside brackets or strings.
function splitArgs(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") quote = char;
    else if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

// ---------- detectors ----------

function hardcodedSecrets(file, text, add) {
  const patterns = JS.test(file)
    ? [/process\.env(?:\.(\w+)|\[\s*["'](\w+)["']\s*\])\s*(?:\|\||\?\?)\s*(["'`])(?!\s*\3)/g]
    : [/os\.(?:environ\.get|getenv)\(\s*["'](\w+)["']\s*,\s*(["'])(?!\2)/g];
  for (const pattern of patterns) {
    for (const found of text.matchAll(pattern)) {
      const name = found[1] || found[2] || "";
      if (!SECRET_NAME.test(name)) continue;
      add("hardcoded-secret", file, lineAt(text, found.index), "certain", `${name} falls back to a value written in the code`);
    }
  }
  if (PY.test(file)) {
    // Settings classes: SECRET_KEY: str = "literal"  (a generated value such as secrets.token_urlsafe() is fine)
    for (const found of text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*(?::\s*\w+)?\s*=\s*(["'])[^"'\n]{6,}\2\s*$/gm)) {
      if (SECRET_NAME.test(found[1]) && !/ALGORITHM|_URL$|_NAME$|_HEADER$|_PREFIX$/.test(found[1])) add("hardcoded-secret", file, lineAt(text, found.index), "needs a human", `${found[1]} is set to a value written in the code`);
    }
  }
}

function sqlInjection(file, text, add) {
  if (JS.test(file)) {
    for (const found of text.matchAll(/\.\s*(?:query|execute|raw|\$queryRawUnsafe|\$executeRawUnsafe|unsafe)\s*\(\s*`([^`]*)`/g)) {
      if (SQL_START.test(found[1]) && /\$\{/.test(found[1])) add("sql-injection", file, lineAt(text, found.index), "certain", "SQL built with a template string that inserts a value");
    }
    for (const found of text.matchAll(/\.\s*(?:query|execute|raw)\s*\(\s*(["'])((?:select|insert|update|delete)\b[^"'\n]*)\1\s*\+/gi)) {
      add("sql-injection", file, lineAt(text, found.index), "certain", "SQL built by adding strings together");
    }
  } else if (PY.test(file)) {
    for (const found of text.matchAll(/\b(?:text|execute|executemany|raw|exec_driver_sql)\s*\(\s*f(["'])((?:(?!\1).)*)\1/gi)) {
      if (SQL_START.test(found[2]) && /\{[^}]+\}/.test(found[2])) add("sql-injection", file, lineAt(text, found.index), "certain", "SQL built with an f-string");
    }
    for (const found of text.matchAll(/\b(?:execute|text|raw)\s*\(\s*(["'])((?:select|insert|update|delete)\b(?:(?!\1).)*)\1\s*(%|\.format\(|\+)/gi)) {
      add("sql-injection", file, lineAt(text, found.index), "certain", "SQL built with string formatting");
    }
  }
}

// Express-style write routes with no middleware, in a file where other routes use auth middleware.
function missingAuth(file, text, add) {
  if (!JS.test(file)) return;
  const routes = [];
  for (const found of text.matchAll(/\b(app|router|\w+Router)\s*\.\s*(get|post|put|patch|delete)\s*\(/g)) {
    const call = callText(text, found.index + found[0].length - 1);
    const args = call.slice(1, -1);
    const pathMatch = /^\s*(["'`])([^"'`]*)\1\s*,/.exec(args);
    if (!pathMatch) continue;
    // Middleware = every argument after the path except the last one (the handler), split at top-level commas.
    const parts = splitArgs(args.slice(pathMatch[0].length));
    const before = parts.slice(0, -1).join(",");
    routes.push({ method: found[2], path: pathMatch[2], line: lineAt(text, found.index), guarded: /\b(auth|authenticat|login|require|protect|verify|guard|admin|session|permission|isAllowed|ensure)\w*/i.test(before) });
  }
  if (!routes.some((route) => route.guarded)) return;
  for (const route of routes) {
    if (route.guarded || route.method === "get") continue;
    if (/(login|logout|signin|sign-in|signup|sign-up|register|password|reset|forgot|verify|callback|webhook|health|token|refresh)/i.test(route.path)) continue;
    add("missing-auth", file, route.line, "needs a human", `${route.method.toUpperCase()} ${route.path} has no auth middleware`);
  }
}

function unboundedReads(file, text, add) {
  if (JS.test(file)) {
    for (const found of text.matchAll(/\.\s*(?:query|execute)\s*\(\s*(["'`])(select\b(?:(?!\1).)*?\bfrom\b(?:(?!\1).)*)\1/gis)) {
      const sql = found[2];
      if (!/\b(?:where|limit|top|fetch\s+first|group\s+by)\b|\bcount\s*\(/i.test(sql)) add("unbounded-read", file, lineAt(text, found.index), "certain", "SELECT with no WHERE and no LIMIT");
    }
    for (const found of text.matchAll(/\bprisma\s*\.\s*\w+\s*\.\s*findMany\s*\(/g)) {
      const call = callText(text, found.index + found[0].length - 1);
      if (!/\b(take|where)\s*:/.test(call)) add("unbounded-read", file, lineAt(text, found.index), "certain", "findMany() with no where and no take");
    }
  } else if (PY.test(file)) {
    for (const found of text.matchAll(/\.\s*exec\s*\(\s*select\s*\(\s*\w+\s*\)\s*\)\s*\.\s*all\s*\(\s*\)/g)) add("unbounded-read", file, lineAt(text, found.index), "certain", "select(...).all() with no where and no limit");
    for (const found of text.matchAll(/\.objects\s*\.\s*all\s*\(\s*\)(?!\s*\[)/g)) add("unbounded-read", file, lineAt(text, found.index), "needs a human", ".objects.all() with no slice or filter");
  }
}

// A database call inside a loop body that uses the loop variable.
function queriesInLoops(file, text, add) {
  const lines = text.split("\n");
  if (JS.test(file)) {
    for (const found of text.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+(?:\{([^}]*)\}|\[([^\]]*)\]|(\w+))\s+of\b|\.\s*(?:forEach|map|flatMap)\s*\(\s*(?:async\s*)?\(?\s*(\w+)/g)) {
      const names = (found[1] || found[2] || found[3] || found[4] || "").split(",").map((name) => name.trim().split(/\s*:\s*/).pop()).filter(Boolean);
      if (names.length === 0) continue;
      // The loop body. A callback (.map, .forEach): exactly the call's brackets. A for loop: after the head's
      // matching ")", either the braced block or the single statement up to ";".
      let body;
      if (found[4]) {
        const paren = text.indexOf("(", found.index);
        body = { start: paren, text: callText(text, paren) };
      } else {
        const head = text.indexOf("(", found.index);
        const after = head + callText(text, head).length;
        const next = text.slice(after).search(/\S/) + after;
        if (text[next] === "{") {
          let depth = 0;
          let end = next;
          for (; end < text.length; end += 1) {
            if (text[end] === "{") depth += 1;
            else if (text[end] === "}" && --depth === 0) break;
          }
          body = { start: next, text: text.slice(next, end + 1) };
        } else body = { start: next, text: text.slice(next, text.indexOf(";", next) + 1) };
      }
      const call = DB_CALL_JS.exec(body.text);
      if (!call) continue;
      const callLine = lineAt(text, body.start + call.index);
      const statement = lines.slice(callLine - 1, callLine + 2).join(" ");
      if (names.some((name) => new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`).test(statement))) add("query-in-loop", file, callLine, "certain", "a database query runs once per loop item");
    }
  } else if (PY.test(file)) {
    lines.forEach((line, index) => {
      const head = /^(\s*)(?:async\s+)?for\s+([\w\s,()]+?)\s+in\s+.+:\s*(#.*)?$/.exec(line);
      if (!head) return;
      const indent = head[1].length;
      const names = head[2].replace(/[()]/g, "").split(",").map((name) => name.trim()).filter(Boolean);
      for (let next = index + 1; next < lines.length; next += 1) {
        const body = lines[next];
        if (body.trim() === "") continue;
        if (body.length - body.trimStart().length <= indent) break;
        if (isComment(body)) continue;
        if (DB_CALL_PY.test(body) && names.some((name) => new RegExp(`\\b${name}\\b`).test(body))) {
          add("query-in-loop", file, next + 1, "certain", "a database query runs once per loop item");
          break;
        }
      }
    });
  }
}

function errorLeaks(file, text, add) {
  if (JS.test(file)) {
    for (const found of text.matchAll(/\b(?:res|reply|ctx)\s*\.[\s\S]{0,60}?\b(?:json|send|body)\b[\s\S]{0,200}?\b(?:err|error|e|ex)\s*\.\s*stack\b/g)) {
      if (!/\n\s*\n/.test(found[0])) add("error-detail-leak", file, lineAt(text, found.index + found[0].lastIndexOf("stack")), "certain", "the stack trace is sent in the response");
    }
  } else if (PY.test(file)) {
    for (const found of text.matchAll(/\b(?:return|detail\s*=|content\s*=)[^\n]*traceback\.format_exc\(\)/g)) add("error-detail-leak", file, lineAt(text, found.index), "certain", "the traceback is sent in the response");
  }
}

function debugMode(file, text, add) {
  if (!PY.test(file)) return;
  for (const found of text.matchAll(/\b(?:FastAPI|Flask|Starlette)\s*\([^)]*\bdebug\s*=\s*True|\.run\s*\([^)]*\bdebug\s*=\s*True|^DEBUG\s*=\s*True\b/gm)) add("debug-mode", file, lineAt(text, found.index), "certain", "debug mode is on in code");
}

function corsWildcard(file, text, add) {
  if (PY.test(file)) {
    for (const found of text.matchAll(/CORSMiddleware\s*,/g)) {
      const call = text.slice(found.index, found.index + 600).split(/\n\)/)[0];
      const origins = /allow_origins\s*=\s*\[\s*["']\*["']\s*\]/.exec(call);
      if (origins && /allow_credentials\s*=\s*True/.test(call)) add("cors-credentials-wildcard", file, lineAt(text, found.index + origins.index), "certain", "allow_origins is * with allow_credentials=True");
    }
  } else if (JS.test(file)) {
    for (const found of text.matchAll(/\bcors\s*\(\s*\{/g)) {
      const call = callText(text, found.index + found[0].indexOf("("));
      const origin = /\borigin\s*:\s*(["']\*["']|true)/.exec(call);
      if (origin && /\bcredentials\s*:\s*true/.test(call)) add("cors-credentials-wildcard", file, lineAt(text, found.index + found[0].indexOf("(") + origin.index), "certain", "cors() allows every origin with credentials");
    }
  }
}

// Login routes with no rate-limiting dependency anywhere in the project.
function rateLimits(files, read, add) {
  const deps = new Set();
  for (const file of files) {
    const text = read(file) || "";
    if (/(^|\/)package\.json$/.test(file)) {
      try {
        const json = JSON.parse(text);
        for (const name of Object.keys({ ...json.dependencies, ...json.devDependencies })) deps.add(name);
      } catch {
        // not JSON: ignore
      }
    } else if (/(^|\/)(pyproject\.toml|requirements[^/]*\.txt|Pipfile)$/.test(file)) {
      for (const found of text.matchAll(/["'\s^]([A-Za-z][\w.-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=~!]=?|["',\n])/g)) deps.add(found[1].toLowerCase());
    }
  }
  if ([...deps].some((name) => RATE_LIMIT_DEPS.test(name))) return;
  for (const file of files.filter((name) => JS.test(name) || PY.test(name))) {
    const text = read(file) || "";
    const patterns = JS.test(file) ? /\b(?:app|router|\w+Router)\s*\.\s*post\s*\(\s*(["'`])([^"'`]*(?:login|signin|sign-in|session|token)[^"'`]*)\1/gi : /@\w+\s*\.\s*post\s*\(\s*(["'])([^"']*(?:login|signin|sign-in|token)[^"']*)\1/gi;
    for (const found of text.matchAll(patterns)) add("no-rate-limit", file, lineAt(text, found.index), "needs a human", `POST ${found[2]} with no rate-limiting dependency in the project`);
  }
}

// SQLModel / SQLAlchemy columns looked up with == somewhere but declared without an index.
function missingIndexes(files, read, add) {
  const py = files.filter((file) => PY.test(file));
  const lookups = new Set();
  for (const file of py) for (const found of (read(file) || "").matchAll(/\b([A-Z]\w*)\.(\w+)\s*==/g)) lookups.add(`${found[1]}.${found[2]}`);
  for (const file of py) {
    const text = read(file) || "";
    let model = null;
    text.split("\n").forEach((line, index) => {
      const cls = /^class\s+(\w+)\s*\(([^)]*)\)/.exec(line);
      if (cls) {
        model = /table\s*=\s*True|\bBase\b|DeclarativeBase|db\.Model/.test(cls[2]) ? cls[1] : null;
        return;
      }
      if (!model || !/^\s{4}\w/.test(line)) return;
      const column = /^\s{4}(\w+)\s*(?::\s*[^=]+)?(?:=\s*(.*))?$/.exec(line);
      if (!column || !lookups.has(`${model}.${column[1]}`)) return;
      if (/primary_key\s*=\s*True|index\s*=\s*True|unique\s*=\s*True/.test(column[2] || "")) return;
      add("missing-index", file, index + 1, "needs a human", `${model}.${column[1]} is looked up with == but has no index`);
    });
  }
}

function audit(root) {
  const all = walk(root);
  const files = all.filter((file) => !SKIP_PATH.test(file));
  const read = reader(root);
  const findings = [];
  const seen = new Set();
  const add = (kind, file, line, confidence, what) => {
    const id = `${kind}|${file}|${line}`;
    if (seen.has(id)) return;
    seen.add(id);
    findings.push({ kind, file, line, confidence, what, abuse: FIX[kind][0], fix: FIX[kind][1] });
  };
  for (const file of files.filter((name) => JS.test(name) || PY.test(name))) {
    const text = read(file);
    if (!text) continue;
    hardcodedSecrets(file, text, add);
    sqlInjection(file, text, add);
    missingAuth(file, text, add);
    unboundedReads(file, text, add);
    queriesInLoops(file, text, add);
    errorLeaks(file, text, add);
    debugMode(file, text, add);
    corsWildcard(file, text, add);
  }
  rateLimits(files, read, add);
  missingIndexes(files, read, add);
  // Drop findings on comment lines.
  const kept = findings.filter((finding) => !isComment((read(finding.file) || "").split("\n")[finding.line - 1] || ""));
  kept.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "certain" ? -1 : 1) || a.file.localeCompare(b.file) || a.line - b.line);
  return { root, scanned: files.length, skipped: all.length - files.length, findings: kept };
}

function main(argv) {
  const json = argv.includes("--json");
  const rest = argv.filter((arg) => arg !== "--json");
  if (rest.some((arg) => arg.startsWith("-"))) throw new UsageError("Usage: uca-audit-check.cjs [project folder] [--json]");
  const root = path.resolve(rest[0] || ".");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new UsageError(`Not a folder: ${root}`);
  const result = audit(root);
  if (json) {
    console.log(JSON.stringify(result, null, 1));
    return 0;
  }
  const lines = [`Audit of ${root}: ${result.findings.length} finding(s) in ${result.scanned} file(s); tests, examples, fixtures and benchmarks skipped.`];
  for (const finding of result.findings) {
    lines.push("", `[${finding.confidence}] ${finding.kind} at ${finding.file}:${finding.line}: ${finding.what}`, `  Risk: ${finding.abuse}`, `  Fix:  ${finding.fix}`);
  }
  lines.push("", "Static reading only: problems reached through helper functions or visible only at run time are not found. No finding is not proof of safety.");
  console.log(lines.join("\n"));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

module.exports = { audit };
