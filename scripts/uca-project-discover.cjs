#!/usr/bin/env node
"use strict";

// Drafts PROJECT.md facts from the files in a repository.
//
// - Every fact names the file it came from: "(source: path)".
// - It reads files only. A command runs only when you pass --verify or --verify-scripts.
// - It never reads .env files. For .env.example it keeps variable names and drops values.
// - With --write it edits only the blocks it owns (<!-- uca:generated:NAME --> ... <!-- /uca:generated -->).
//   Text you wrote is left exactly as it was.
//
// Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SECTIONS = ["header", "stack", "entry-points", "commands", "routes", "data", "auth", "structure", "conventions", "unknowns"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".nuxt", ".svelte-kit", "venv", ".venv", "env", "__pycache__", "vendor", "target", ".turbo", ".cache"]);
const SOURCE_EXT = /\.(c|m)?(js|ts)x?$|\.py$|\.go$|\.rs$/;
const MAX_FILES = 6000;
const MAX_BYTES = 200_000;
const MAX_LISTED = 40;

function printHelp() {
  return `uca-project-discover — draft PROJECT.md facts from the repository

Usage:
  node scripts/uca-project-discover.cjs [--root <dir>] [--write <PROJECT.md>] [--section a,b]
                                        [--verify "<command>"]... [--verify-scripts test,lint,build]

Without --write the draft is printed. With --write, only generated blocks are created or replaced;
text outside them is never changed. If the file exists without blocks, they are appended.
--section limits the update to the named blocks (${SECTIONS.join(", ")}).
--verify runs a command you name and records the result; --verify-scripts runs "<package manager> run <name>".
Nothing runs unless you pass one of these, and a command counts as verified only if it exits 0.
`;
}

function parseArgs(argv) {
  const options = { root: ".", write: null, sections: null, verify: [], verifyScripts: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`Option ${arg} needs a value.`);
      index += 1;
      return next;
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--root") options.root = value();
    else if (arg === "--write") options.write = value();
    else if (arg === "--section") options.sections = value().split(",").map((name) => name.trim()).filter(Boolean);
    else if (arg === "--verify") options.verify.push(value());
    else if (arg === "--verify-scripts") options.verifyScripts.push(...value().split(",").map((name) => name.trim()).filter(Boolean));
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.sections) {
    const unknown = options.sections.filter((name) => !SECTIONS.includes(name));
    if (unknown.length > 0) throw new Error(`Unknown section: ${unknown.join(", ")}. Known: ${SECTIONS.join(", ")}`);
  }
  return options;
}

// ---------- reading the repository ----------

function listFiles(root) {
  const git = spawnSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 20_000_000 });
  let files;
  if (git.status === 0 && git.stdout.trim()) {
    files = git.stdout.split(/\r?\n/).filter(Boolean);
  } else {
    files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const relative = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(relative);
        else files.push(relative);
        if (files.length > MAX_FILES) return;
      }
    };
    walk("");
  }
  return files
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.split("/").some((part) => SKIP_DIRS.has(part)))
    .sort()
    .slice(0, MAX_FILES);
}

function createReader(root) {
  const cache = new Map();
  return (relative) => {
    if (cache.has(relative)) return cache.get(relative);
    let text = null;
    // Secret-bearing files are never read here; .env.example is handled by envNames().
    if (!/(^|\/)\.env(\.|$)/.test(relative) || /\.(example|sample|template)$/.test(relative)) {
      try {
        const full = path.join(root, relative);
        if (fs.statSync(full).size <= MAX_BYTES) text = fs.readFileSync(full, "utf8");
      } catch {
        text = null;
      }
    }
    cache.set(relative, text);
    return text;
  };
}

function readJson(read, relative) {
  const text = read(relative);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

const fact = (text, source) => `- ${text} (source: ${source})`;

// ---------- discovery ----------

const FRAMEWORKS = {
  react: "React", "react-dom": null, next: "Next.js", vue: "Vue", nuxt: "Nuxt", svelte: "Svelte", "@sveltejs/kit": "SvelteKit",
  "@angular/core": "Angular", vite: "Vite", express: "Express", fastify: "Fastify", koa: "Koa", hono: "Hono", "@nestjs/core": "NestJS",
  "react-router-dom": "React Router", "react-router": "React Router", "@remix-run/react": "Remix", astro: "Astro"
};
const STATE_LIBS = { redux: "Redux", "@reduxjs/toolkit": "Redux Toolkit", zustand: "Zustand", "@tanstack/react-query": "TanStack Query", pinia: "Pinia", mobx: "MobX", recoil: "Recoil", jotai: "Jotai", swr: "SWR" };
const STYLING = { tailwindcss: "Tailwind CSS", "styled-components": "styled-components", "@emotion/react": "Emotion", sass: "Sass" };
const TEST_TOOLS = { vitest: "Vitest", jest: "Jest", mocha: "Mocha", "@playwright/test": "Playwright", cypress: "Cypress", "@testing-library/react": "Testing Library" };
const DATABASES = {
  prisma: "Prisma", "@prisma/client": "Prisma Client", sequelize: "Sequelize", typeorm: "TypeORM", mongoose: "Mongoose", knex: "Knex",
  "drizzle-orm": "Drizzle ORM", pg: "PostgreSQL driver (pg)", mysql2: "MySQL driver (mysql2)", sqlite3: "SQLite driver (sqlite3)",
  "better-sqlite3": "SQLite driver (better-sqlite3)", redis: "Redis client", ioredis: "Redis client (ioredis)", mongodb: "MongoDB driver"
};
const AUTH_DEPS = {
  "next-auth": "NextAuth", "@auth/core": "Auth.js", passport: "Passport", jsonwebtoken: "jsonwebtoken", jose: "jose", bcrypt: "bcrypt",
  bcryptjs: "bcryptjs", argon2: "argon2", "@clerk/nextjs": "Clerk", "@clerk/clerk-react": "Clerk", "firebase-admin": "Firebase Admin", auth0: "Auth0", "express-session": "express-session"
};
const INTEGRATIONS = { stripe: "Stripe", "@sendgrid/mail": "SendGrid", twilio: "Twilio", openai: "OpenAI", "aws-sdk": "AWS SDK", "@aws-sdk/client-s3": "AWS S3 client", nodemailer: "Nodemailer", axios: "axios" };
const PY_FRAMEWORKS = { django: "Django", flask: "Flask", fastapi: "FastAPI", sqlalchemy: "SQLAlchemy", alembic: "Alembic", pytest: "pytest", pyjwt: "PyJWT", "flask-login": "Flask-Login", authlib: "Authlib", psycopg2: "psycopg2", psycopg: "psycopg", celery: "Celery" };

function manifestsOf(files, read) {
  // package.json at the root and one level down (client/, server/, apps/x, packages/x).
  const found = [];
  for (const file of files) {
    if (!/(^|\/)package\.json$/.test(file)) continue;
    if (file.split("/").length > 3) continue;
    const data = readJson(read, file);
    if (data) found.push({ file, dir: path.posix.dirname(file) === "." ? "" : path.posix.dirname(file), data });
  }
  return found;
}

function depsOf(manifest) {
  return { ...(manifest.data.devDependencies || {}), ...(manifest.data.dependencies || {}) };
}

function pythonDeps(files, read) {
  const found = new Map();
  for (const file of files) {
    if (!/(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Pipfile)$/.test(file) || file.split("/").length > 3) continue;
    const text = (read(file) || "").toLowerCase();
    for (const name of Object.keys(PY_FRAMEWORKS)) {
      if (new RegExp(`(^|[\\s"'\\[,])${name.replace(/[-]/g, "[-_]")}(\\b|[=<>~!\\[])`, "m").test(text) && !found.has(name)) found.set(name, file);
    }
  }
  return found;
}

function packageManager(files, dir) {
  const prefix = dir ? `${dir}/` : "";
  const lock = [["package-lock.json", "npm"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["bun.lockb", "bun"], ["bun.lock", "bun"]].find(([name]) => files.includes(prefix + name));
  return lock ? { name: lock[1], source: prefix + lock[0] } : { name: "npm", source: null };
}

function discover(root) {
  const files = listFiles(root);
  const fileSet = new Set(files);
  const read = createReader(root);
  const manifests = manifestsOf(files, read);
  const python = pythonDeps(files, read);
  const out = Object.fromEntries(SECTIONS.map((name) => [name, []]));
  const declared = [];
  const unknown = [];
  const has = (file) => fileSet.has(file);

  // ----- stack -----
  for (const manifest of manifests) {
    const where = manifest.dir ? ` in ${manifest.dir}/` : "";
    if (manifest.data.engines && manifest.data.engines.node) out.stack.push(fact(`Node.js engine${where}: ${manifest.data.engines.node}`, manifest.file));
    const pm = packageManager(files, manifest.dir);
    if (pm.source) out.stack.push(fact(`Package manager${where}: ${pm.name}`, pm.source));
    const deps = depsOf(manifest);
    if (deps.typescript || has(`${manifest.dir ? `${manifest.dir}/` : ""}tsconfig.json`)) out.stack.push(fact(`TypeScript${where}${deps.typescript ? ` (declared ${deps.typescript})` : ""}`, deps.typescript ? manifest.file : `${manifest.dir ? `${manifest.dir}/` : ""}tsconfig.json`));
    const seen = new Set();
    for (const [name, label] of Object.entries(FRAMEWORKS)) {
      if (deps[name] && label && !seen.has(label)) {
        seen.add(label);
        out.stack.push(fact(`${label}${where}: declared ${deps[name]}`, manifest.file));
      }
    }
  }
  for (const file of [".nvmrc", ".node-version", ".python-version", ".tool-versions", "rust-toolchain", "rust-toolchain.toml"]) {
    if (has(file)) out.stack.push(fact(`Runtime version file: ${(read(file) || "").trim().split("\n")[0]}`, file));
  }
  if (has("go.mod")) {
    const goVersion = /^go\s+(\S+)/m.exec(read("go.mod") || "");
    if (goVersion) out.stack.push(fact(`Go ${goVersion[1]}`, "go.mod"));
  }
  if (has("Cargo.toml")) {
    const edition = /^edition\s*=\s*"([^"]+)"/m.exec(read("Cargo.toml") || "");
    out.stack.push(fact(`Rust${edition ? ` (edition ${edition[1]})` : ""}`, "Cargo.toml"));
  }
  if (has("pyproject.toml")) {
    const requires = /^requires-python\s*=\s*"([^"]+)"/m.exec(read("pyproject.toml") || "");
    if (requires) out.stack.push(fact(`Python: ${requires[1]}`, "pyproject.toml"));
  }
  for (const [name, source] of python) {
    if (["sqlalchemy", "alembic", "psycopg2", "psycopg", "pyjwt", "flask-login", "authlib"].includes(name)) continue;
    out.stack.push(fact(`${PY_FRAMEWORKS[name]} (Python dependency)`, source));
  }

  // ----- entry points -----
  for (const manifest of manifests) {
    const where = manifest.dir ? ` (${manifest.dir}/)` : "";
    if (manifest.data.main) out["entry-points"].push(fact(`package main${where}: ${manifest.data.main}`, manifest.file));
    const bin = manifest.data.bin;
    if (typeof bin === "string") out["entry-points"].push(fact(`package bin${where}: ${bin}`, manifest.file));
    else if (bin) for (const [name, target] of Object.entries(bin)) out["entry-points"].push(fact(`package bin${where} ${name}: ${target}`, manifest.file));
  }
  const ENTRY_FILES = /(^|\/)(index\.html|src\/(main|index|app|server)\.(c|m)?(js|ts)x?|(server|app|index|main)\.(c|m)?(js|ts)|manage\.py|main\.py|app\.py|wsgi\.py|asgi\.py|cmd\/[^/]+\/main\.go|main\.go|src\/main\.rs|app\/layout\.(js|jsx|ts|tsx)|pages\/_app\.(js|jsx|ts|tsx))$/;
  for (const file of files.filter((name) => ENTRY_FILES.test(name) && name.split("/").length <= 4).slice(0, MAX_LISTED)) {
    out["entry-points"].push(fact(`file present: ${file}`, file));
  }

  // ----- commands (declared only) -----
  const SCRIPT_NAMES = /^(dev|start|serve|build|test|test:.*|lint|lint:.*|format|typecheck|check|preview|e2e|migrate.*|db:.*)$/;
  for (const manifest of manifests) {
    const pm = packageManager(files, manifest.dir).name;
    for (const [name, command] of Object.entries(manifest.data.scripts || {})) {
      if (!SCRIPT_NAMES.test(name)) continue;
      const run = pm === "yarn" ? `yarn ${name}` : pm === "npm" && name === "test" ? "npm test" : pm === "npm" && name === "start" ? "npm start" : `${pm} run ${name}`;
      const where = manifest.dir ? `cd ${manifest.dir} && ` : "";
      declared.push({ label: `${where}${run}`, detail: `runs \`${command}\``, source: manifest.file, script: name, dir: manifest.dir, pm });
    }
  }
  if (has("Makefile")) {
    const targets = [...(read("Makefile") || "").matchAll(/^([A-Za-z][A-Za-z0-9_-]*):(?!=)/gm)].map((match) => match[1]).slice(0, 12);
    for (const target of targets) declared.push({ label: `make ${target}`, detail: "Makefile target", source: "Makefile" });
  }
  if (has("pytest.ini") || /\[tool\.pytest/.test(read("pyproject.toml") || "")) declared.push({ label: "pytest", detail: "pytest is configured", source: has("pytest.ini") ? "pytest.ini" : "pyproject.toml" });
  if (has("go.mod")) unknown.push("Go test and build commands: `go test ./...` and `go build ./...` are the usual commands but were not read from a file or run.");

  // ----- routes -----
  const apiRoutes = [];
  const pageRoutes = [];
  const routeFile = /(^|\/)(app|pages)\/.*\.(c|m)?(js|ts)x?$/;
  const clean = (segments) => "/" + segments.filter((part) => part && !/^\(.*\)$/.test(part)).join("/");
  for (const file of files) {
    let match = /^((?:.*\/)?)app\/(.*)\/?route\.(c|m)?(js|ts)x?$/.exec(file);
    if (match) {
      const text = read(file) || "";
      const methods = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      apiRoutes.push({ text: `${methods.join("/") || "?"} ${clean(match[2].split("/"))}`.replace(/\/\/+/g, "/"), source: file });
      continue;
    }
    match = /^((?:.*\/)?)pages\/api\/(.+)\.(c|m)?(js|ts)x?$/.exec(file);
    if (match) {
      apiRoutes.push({ text: `any ${clean(["api", ...match[2].replace(/\/index$/, "").split("/")])}`, source: file });
      continue;
    }
    match = /^((?:.*\/)?)app\/(.*\/)?page\.(c|m)?(js|ts)x?$/.exec(file);
    if (match && !file.includes("/api/")) {
      pageRoutes.push({ text: clean((match[2] || "").split("/")), source: file });
      continue;
    }
    match = /^((?:.*\/)?)pages\/(.+)\.(c|m)?(js|ts)x?$/.exec(file);
    if (match && !/^api\//.test(match[2]) && !/(^|\/)_/.test(match[2])) {
      pageRoutes.push({ text: clean(match[2].replace(/(^|\/)index$/, "").split("/")), source: file });
      continue;
    }
    if (!SOURCE_EXT.test(file) || routeFile.test(file) && /^(.*\/)?(app|pages)\//.test(file) && /\/(page|route)\./.test(file)) continue;
    const text = read(file);
    if (!text) continue;
    for (const found of text.matchAll(/\b(?:app|router|server|api|routes)\.(get|post|put|patch|delete)\(\s*(['"`])(\/[^'"`]*)\2/g)) {
      apiRoutes.push({ text: `${found[1].toUpperCase()} ${found[3]}`, source: `${file}:${lineOf(text, found.index)}` });
    }
    for (const found of text.matchAll(/@\w+\.(get|post|put|patch|delete)\(\s*(['"])(\/[^'"]*)\2/g)) {
      apiRoutes.push({ text: `${found[1].toUpperCase()} ${found[3]} (FastAPI-style decorator)`, source: `${file}:${lineOf(text, found.index)}` });
    }
    for (const found of text.matchAll(/@\w+\.route\(\s*(['"])(\/[^'"]*)\1(?:\s*,\s*methods\s*=\s*\[([^\]]*)\])?/g)) {
      const methods = found[3] ? found[3].replace(/['"\s]/g, "").replace(/,/g, "/") : "GET";
      apiRoutes.push({ text: `${methods} ${found[2]} (Flask-style decorator)`, source: `${file}:${lineOf(text, found.index)}` });
    }
    if (/react-router/.test(text)) {
      for (const found of text.matchAll(/<Route\b[^>]*\bpath=(['"{`]+)(\/?[^'"`}]*)/g)) pageRoutes.push({ text: found[2].startsWith("/") ? found[2] : `/${found[2]}`, source: `${file}:${lineOf(text, found.index)}` });
      for (const found of text.matchAll(/\bpath:\s*(['"`])(\/?[^'"`]*)\1/g)) pageRoutes.push({ text: found[2].startsWith("/") ? found[2] : `/${found[2]}`, source: `${file}:${lineOf(text, found.index)}` });
    }
  }
  const emit = (list, label) => {
    const unique = [...new Map(list.map((route) => [`${route.text}|${route.source}`, route])).values()].sort((a, b) => a.text.localeCompare(b.text) || a.source.localeCompare(b.source));
    unique.slice(0, MAX_LISTED).forEach((route) => out.routes.push(fact(`${label} ${route.text}`, route.source)));
    if (unique.length > MAX_LISTED) out.routes.push(`- ... and ${unique.length - MAX_LISTED} more ${label} entries`);
  };
  emit(apiRoutes, "API");
  emit(pageRoutes, "Page");

  // ----- data layer -----
  for (const manifest of manifests) {
    const deps = depsOf(manifest);
    for (const [name, label] of Object.entries(DATABASES)) if (deps[name]) out.data.push(fact(`Dependency declared: ${label}${manifest.dir ? ` (in ${manifest.dir}/)` : ""}`, manifest.file));
  }
  for (const [name, source] of python) if (["sqlalchemy", "alembic", "psycopg2", "psycopg"].includes(name)) out.data.push(fact(`Python dependency: ${PY_FRAMEWORKS[name]}`, source));
  for (const file of files.filter((name) => /(^|\/)schema\.prisma$/.test(name))) {
    const provider = /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"/s.exec(read(file) || "");
    const models = [...(read(file) || "").matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]);
    out.data.push(fact(`Prisma schema${provider ? `, provider ${provider[1]}` : ""}${models.length ? `, models: ${models.slice(0, 15).join(", ")}` : ""}`, file));
  }
  for (const file of files) {
    if (SOURCE_EXT.test(file) && /node:sqlite/.test(read(file) || "")) {
      out.data.push(fact("Uses the built-in node:sqlite module", file));
      break;
    }
  }
  const migrationDirs = [...new Set(files.map((file) => /^(.*?\/?(?:migrations|migrate))\//.exec(file)).filter(Boolean).map((match) => match[1]))].slice(0, 5);
  for (const dir of migrationDirs) out.data.push(fact(`Migration folder: ${dir}/`, dir));
  if (has("alembic.ini")) out.data.push(fact("Alembic is configured", "alembic.ini"));
  for (const file of files) {
    if (!/(^|\/)settings\.py$/.test(file)) continue;
    const engine = /ENGINE['"]\s*:\s*['"]([^'"]+)/.exec(read(file) || "");
    if (engine) out.data.push(fact(`Django database engine: ${engine[1]}`, file));
  }

  // ----- authentication (dependencies and file names only) -----
  for (const manifest of manifests) {
    const deps = depsOf(manifest);
    for (const [name, label] of Object.entries(AUTH_DEPS)) if (deps[name]) out.auth.push(fact(`Dependency declared: ${label}${manifest.dir ? ` (in ${manifest.dir}/)` : ""}`, manifest.file));
  }
  for (const [name, source] of python) if (["pyjwt", "flask-login", "authlib"].includes(name)) out.auth.push(fact(`Python dependency: ${PY_FRAMEWORKS[name]}`, source));
  for (const file of files) {
    if (/django\.contrib\.auth/.test(/(^|\/)settings\.py$/.test(file) ? read(file) || "" : "")) out.auth.push(fact("django.contrib.auth is in INSTALLED_APPS", file));
  }
  const authFiles = files.filter((file) => /(^|\/)[^/]*(auth|login|session|jwt)[^/]*\.(c|m)?(js|ts)x?$|(^|\/)[^/]*(auth|login|session)[^/]*\.py$/i.test(file) && !/\.(test|spec)\./.test(file)).slice(0, 8);
  for (const file of authFiles) out.auth.push(fact(`File name suggests authentication code: ${file}`, file));
  if (out.auth.length > 0) unknown.push(`How authentication works end to end (${authFiles.length ? authFiles.slice(0, 3).join(", ") : "dependencies above"}): listed from names only; read the code before relying on it.`);

  // ----- structure and frontend architecture -----
  const topDirs = [...new Set(files.filter((file) => file.includes("/")).map((file) => file.split("/")[0]))].filter((dir) => !dir.startsWith(".")).sort();
  if (topDirs.length > 0) out.structure.push(fact(`Top-level folders: ${topDirs.join(", ")}`, "."));
  const FE_DIRS = ["src/components", "src/pages", "src/hooks", "src/store", "src/stores", "src/context", "src/services", "src/api", "src/lib", "src/utils", "src/domain", "src/models", "src/routes", "src/controllers", "src/middleware"];
  for (const manifest of manifests) {
    const prefix = manifest.dir ? `${manifest.dir}/` : "";
    for (const dir of FE_DIRS) {
      if (files.some((file) => file.startsWith(`${prefix}${dir}/`))) out.structure.push(fact(`Source folder: ${prefix}${dir}/`, `${prefix}${dir}`));
    }
    const deps = depsOf(manifest);
    for (const table of [STATE_LIBS, STYLING, TEST_TOOLS, INTEGRATIONS]) {
      for (const [name, label] of Object.entries(table)) if (deps[name]) out.structure.push(fact(`Dependency declared: ${label}${manifest.dir ? ` (in ${manifest.dir}/)` : ""}`, manifest.file));
    }
  }
  const businessDirs = out.structure.filter((line) => /Source folder: .*(services|domain|models|controllers|lib)\//.test(line));
  if (businessDirs.length > 0 || apiRoutes.length > 0) unknown.push("Important business rules: not discovered automatically. Read the service, domain or route files before assuming how the product behaves.");

  // ----- conventions -----
  const conventionFiles = [".editorconfig", ".prettierrc", ".prettierrc.json", ".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "biome.json", ".flake8", "ruff.toml", "commitlint.config.js", "CONTRIBUTING.md", ".pre-commit-config.yaml"];
  for (const file of conventionFiles.filter(has)) out.conventions.push(fact(`Config present: ${file}`, file));
  for (const file of files.filter((name) => /(^|\/)tsconfig\.json$/.test(name) && name.split("/").length <= 3)) {
    if (/"strict"\s*:\s*true/.test(read(file) || "")) out.conventions.push(fact("TypeScript strict mode is on", file));
  }
  if (has(".editorconfig")) {
    const text = read(".editorconfig") || "";
    const style = /indent_style\s*=\s*(\w+)/.exec(text);
    const size = /indent_size\s*=\s*(\w+)/.exec(text);
    if (style) out.conventions.push(fact(`Indent: ${style[1]}${size ? ` ${size[1]}` : ""}`, ".editorconfig"));
  }
  if (files.some((file) => file.startsWith(".github/workflows/"))) out.conventions.push(fact("CI workflows exist", ".github/workflows"));
  const todoHits = [];
  for (const file of files) {
    if (!SOURCE_EXT.test(file)) continue;
    const text = read(file);
    if (!text) continue;
    for (const hit of text.matchAll(/\b(TODO|FIXME|HACK)\b/g)) todoHits.push(`${file}:${lineOf(text, hit.index)}`);
  }
  if (todoHits.length > 0) out.conventions.push(fact(`${todoHits.length} TODO/FIXME/HACK comment(s); first: ${todoHits.slice(0, 5).join(", ")}`, todoHits[0].split(":")[0]));

  // ----- environment variable names (names only; values are never read) -----
  for (const file of [".env.example", ".env.sample", ".env.template"].filter(has)) {
    const names = [...(read(file) || "").matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]);
    if (names.length > 0) out.conventions.push(fact(`Environment variables expected (names only): ${names.join(", ")}`, file));
  }

  // ----- never-touch paths (names only) -----
  const avoid = [];
  for (const dir of ["node_modules", "dist", "build", ".next", "coverage", ".venv", "venv", "vendor", "__pycache__"]) {
    if (fs.existsSync(path.join(root, dir))) avoid.push(`${dir}/ (generated or vendored)`);
  }
  for (const file of files.filter((name) => /(^|\/)\.env(\.[^/]+)?$/.test(name) && !/\.(example|sample|template)$/.test(name))) avoid.push(`${file} (may hold secrets; never read or paste it)`);
  for (const entry of fs.readdirSync(root)) if (/^\.env(\..+)?$/.test(entry) && !/\.(example|sample|template)$/.test(entry) && !files.includes(entry)) avoid.push(`${entry} (may hold secrets; never read or paste it)`);
  avoid.sort().forEach((item) => out.structure.push(`- Avoid: ${item}`));

  // ----- always unknown -----
  unknown.push("Deployment and hosting: not discovered.");
  unknown.push("Known issues and limits: only TODO/FIXME comments are listed above; check the issue tracker.");
  unknown.push(...declared.length ? ["Whether each declared command works: not run, see Commands."] : ["Run, test, lint and build commands: none were found in a manifest or Makefile."]);
  out.unknowns = unknown.map((line) => `- ${line}`);

  return { files, manifests, out, declared, unknown };
}

// ---------- verification (opt-in) ----------

function runVerification(root, options, declared) {
  const todo = [...options.verify.map((command) => ({ command, label: command }))];
  for (const name of options.verifyScripts) {
    const match = declared.find((entry) => entry.script === name && !entry.dir) || declared.find((entry) => entry.script === name);
    if (!match) todo.push({ missing: name });
    else todo.push({ command: `${match.pm === "yarn" ? "yarn" : match.pm} run ${name}`, label: match.label, cwd: match.dir ? path.join(root, match.dir) : root });
  }
  return todo.map((item) => {
    if (item.missing) return { label: `script "${item.missing}"`, ok: false, note: "no such script was found in a manifest" };
    const started = Date.now();
    const result = spawnSync(item.command, { cwd: item.cwd || root, shell: true, encoding: "utf8", timeout: 300_000 });
    return { label: item.label, ok: result.status === 0, note: result.status === 0 ? `exit 0 in ${Math.round((Date.now() - started) / 1000)}s` : `exit ${result.status === null ? "none (timeout or signal)" : result.status}` };
  });
}

// ---------- rendering ----------

function headRef(root) {
  const head = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8", timeout: 10_000 });
  return head.status === 0 && head.stdout.trim() ? head.stdout.trim() : new Date().toISOString().slice(0, 10);
}

function buildBlocks(root, found, verification, now = headRef(root)) {
  const blocks = {};
  const checkedBy = verification.length > 0 ? `uca-project-discover.cjs read the files and ran: ${verification.map((item) => item.label).join("; ")}` : "uca-project-discover.cjs read the files; no command was run";
  blocks.header = ["Verified at: " + now, "Checked by: " + checkedBy];
  blocks.stack = ["## Stack", ...(found.out.stack.length ? found.out.stack : ["- No runtime or framework was detected from manifests or version files."])];
  blocks["entry-points"] = ["## Entry points", ...(found.out["entry-points"].length ? found.out["entry-points"] : ["- None detected."])];
  const verified = verification.filter((item) => item.ok);
  const failed = verification.filter((item) => !item.ok);
  const commands = ["## Commands"];
  commands.push("Run and seen to work:");
  commands.push(...(verified.length ? verified.map((item) => `- \`${item.label}\` (${item.note}; ran by uca-project-discover.cjs)`) : ["- None yet. Nothing was run."]));
  if (failed.length) commands.push("Run and failed:", ...failed.map((item) => `- \`${item.label}\` (${item.note})`));
  const verifiedLabels = new Set(verification.map((item) => item.label));
  const remaining = found.declared.filter((entry) => !verifiedLabels.has(entry.label));
  commands.push("Declared in files, not run (do not treat as working):");
  commands.push(...(remaining.length ? remaining.map((entry) => fact(`\`${entry.label}\` ${entry.detail}`, entry.source)) : ["- None found."]));
  blocks.commands = commands;
  blocks.routes = ["## Routes", ...(found.out.routes.length ? found.out.routes : ["- No routes were detected."])];
  blocks.data = ["## Data layer", ...(found.out.data.length ? found.out.data : ["- No database dependency or schema was detected."])];
  blocks.auth = ["## Authentication", ...(found.out.auth.length ? found.out.auth : ["- No authentication dependency or file name was detected."])];
  blocks.structure = ["## Structure and boundaries", ...(found.out.structure.length ? found.out.structure : ["- Nothing detected."])];
  blocks.conventions = ["## Conventions and constraints", ...(found.out.conventions.length ? found.out.conventions : ["- None detected."])];
  blocks.unknowns = ["## Assumed or unknown (not verified)", ...found.out.unknowns];
  return blocks;
}

const open = (name) => `<!-- uca:generated:${name} -->`;
const CLOSE = "<!-- /uca:generated -->";
const wrap = (name, lines) => `${open(name)}\n${lines.join("\n")}\n${CLOSE}`;

function renderFresh(blocks) {
  const title = "# PROJECT.md\n\n> Project card for coding agents. Blocks between uca:generated markers are rewritten by `node scripts/uca-project-discover.cjs --write`. Text outside them is yours and is never changed.\n";
  const order = ["header", "stack", "entry-points", "commands", "routes", "data", "auth", "structure", "conventions", "unknowns"];
  return `${title}\n${order.map((name) => wrap(name, blocks[name])).join("\n\n")}\n`;
}

// Replaces only the named generated blocks. Anything else in the file is returned unchanged.
function mergeIntoExisting(existing, blocks, only) {
  let text = existing;
  const wanted = (name) => !only || only.includes(name);
  const missing = [];
  for (const name of SECTIONS) {
    if (!wanted(name)) continue;
    const pattern = new RegExp(`${open(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${CLOSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    if (pattern.test(text)) text = text.replace(pattern, () => wrap(name, blocks[name]));
    else missing.push(name);
  }
  if (missing.length > 0) {
    const skipHeader = /^Verified at:/m.test(text);
    const toAdd = missing.filter((name) => !(name === "header" && skipHeader));
    if (toAdd.length > 0) text = `${text.replace(/\s*$/, "")}\n\n${toAdd.map((name) => wrap(name, blocks[name])).join("\n\n")}\n`;
  }
  return text;
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
  const root = path.resolve(options.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`Error: ${root} is not a directory.`);
    return 2;
  }
  const found = discover(root);
  const verification = runVerification(root, options, found.declared);
  const blocks = buildBlocks(root, found, verification);

  if (!options.write) {
    process.stdout.write(renderFresh(blocks));
    return 0;
  }
  const target = path.resolve(process.cwd(), options.write);
  if (fs.existsSync(target)) {
    fs.writeFileSync(target, mergeIntoExisting(fs.readFileSync(target, "utf8"), blocks, options.sections));
    console.log(`Updated generated blocks in ${target}. Text outside them was not changed.`);
  } else {
    const fresh = options.sections ? renderFresh(Object.fromEntries(Object.entries(blocks).filter(([name]) => options.sections.includes(name)))).replace(/<!--[^]*$/, "") : renderFresh(blocks);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, options.sections ? renderSome(blocks, options.sections) : fresh);
    console.log(`Created ${target}.`);
  }
  return 0;
}

function renderSome(blocks, names) {
  return `# PROJECT.md\n\n${SECTIONS.filter((name) => names.includes(name)).map((name) => wrap(name, blocks[name])).join("\n\n")}\n`;
}

if (require.main === module) process.exitCode = main();

module.exports = { buildBlocks, createReader, discover, main, mergeIntoExisting, parseArgs, renderFresh, SECTIONS };
