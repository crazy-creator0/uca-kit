#!/usr/bin/env node
"use strict";

// Drafts PROJECT.md facts from the files in a repository.
//
// - Every fact names the file it came from: "(source: path)".
// - Entry points come from the manifest first; examples and tests are counted, not listed as the app.
// - The import map follows local imports from the entry files, within a fixed size.
// - It reads files only. A command runs only when you pass --verify or --verify-scripts.
// - It never reads .env files. For .env.example it keeps variable names and drops values.
// - With --write it edits only the blocks it owns (<!-- uca:generated:NAME --> ... <!-- /uca:generated -->).
//   Text you wrote is left exactly as it was.
//
// Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SECTIONS = ["header", "stack", "entry-points", "map", "commands", "routes", "data", "auth", "structure", "conventions", "key-files", "unknowns"];
const MAX_KEY_FILES = 8;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".nuxt", ".svelte-kit", "venv", ".venv", "env", "__pycache__", "vendor", "target", ".turbo", ".cache"]);
const SOURCE_EXT = /\.(c|m)?(js|ts)x?$|\.py$|\.go$|\.rs$/;
const MAX_FILES = 6000;
const MAX_BYTES = 200_000;
const MAX_LISTED = 40;
const MAX_MAP_FILES = 25;
const MAX_MAP_CHARS = 3000;
const MAX_MAP_IMPORTS = 6;
const MAX_MAP_LEAVES = 15;
const MAX_ROUTES_PER_LINE = 12;
const MAX_ROUTE_CHARS = 3000;
const MAX_MAP_VISITS = 2000;
// Folders and file names that hold examples, tests, fixtures or benchmarks rather than the app itself.
const SAMPLE_PATH = /(^|\/)(examples?|samples?|demos?|tests?|__tests__|__mocks__|specs?|e2e|cypress|benchmarks?|bench|fixtures?|testdata|benches|fuzz|test[_-][\w-]+)\//;
const SAMPLE_FILE = /\.(test|spec)\.[^/]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/;
const isSample = (file) => SAMPLE_PATH.test(file) || SAMPLE_FILE.test(file);
// The folder that makes a path a sample, e.g. "examples/" or "src/__tests__/"; for a file name match, its folder.
const sampleGroup = (file) => {
  const match = SAMPLE_PATH.exec(file);
  if (match) return file.slice(0, match.index + match[0].length).replace(/^\//, "");
  const dir = path.posix.dirname(file);
  return dir === "." ? "./" : `${dir}/`;
};

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

// True when the match sits on a line comment or a block-comment line ("// ...", "# ...", " * ...").
function inComment(text, index) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*|#)/.test(text.slice(lineStart, index));
}

const fact = (text, source) => `- ${text} (source: ${source})`;

// ---------- discovery ----------

// Paths named in package.json "exports": the "." entry, or the object itself when it has no subpaths.
function exportTargets(exportsField) {
  const found = [];
  const walk = (value, depth) => {
    if (found.length >= 3 || depth > 3) return;
    if (typeof value === "string") found.push(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1));
    else if (value && typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.some((key) => key.startsWith("."))) walk(value["."], depth + 1);
      else for (const key of ["require", "import", "node", "default"]) if (key in value) walk(value[key], depth + 1);
    }
  };
  walk(exportsField, 0);
  return [...new Set(found)].filter((target) => !target.includes("*"));
}

const JS_EXT = [".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".mts", ".cts"];

// Turns an import from one file into a repository path, or null when it is a package or not found.
// Removes // and /* */ comments outside strings, so tsconfig.json can be parsed.
function stripJsonComments(text) {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const end = /"(?:[^"\\\n]|\\.)*"/y;
      end.lastIndex = index;
      const match = end.exec(text);
      if (!match) return out + text.slice(index);
      out += match[0];
      index += match[0].length - 1;
    } else if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
    } else if (char === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close === -1 ? text.length : close + 1;
    } else out += char;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

// Path aliases from tsconfig.json or jsconfig.json "compilerOptions.paths", e.g. "@/*": ["./src/*"].
function pathAliases(files, read) {
  const aliases = [];
  for (const file of files.filter((name) => /(^|\/)(tsconfig|jsconfig)\.json$/.test(name) && name.split("/").length <= 3)) {
    let options;
    try {
      options = (JSON.parse(stripJsonComments(read(file) || "")) || {}).compilerOptions || {};
    } catch {
      continue;
    }
    if (!options.paths || typeof options.paths !== "object") continue;
    const dir = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
    const base = path.posix.join(dir || ".", typeof options.baseUrl === "string" ? options.baseUrl : ".");
    for (const [pattern, targets] of Object.entries(options.paths)) {
      if (!Array.isArray(targets) || (pattern.match(/\*/g) || []).length > 1) continue;
      aliases.push({ scope: dir, pattern, base, targets: targets.filter((target) => typeof target === "string"), source: file });
    }
  }
  return aliases;
}

function makeResolver(fileSet, aliases = []) {
  const tidy = (candidate) => {
    const normal = path.posix.normalize(candidate);
    return normal === "." ? "" : normal.replace(/^\.\//, "");
  };
  const firstExisting = (candidates) => candidates.map(tidy).find((candidate) => candidate && !candidate.startsWith("../") && fileSet.has(candidate)) || null;
  const CODE = /\.((c|m)?(js|ts)x?|py)$/;
  return {
    js(fromFile, spec) {
      if (!spec.startsWith(".")) {
        for (const alias of aliases) {
          if (alias.scope && !fromFile.startsWith(`${alias.scope}/`)) continue;
          const star = alias.pattern.indexOf("*");
          const prefix = star === -1 ? alias.pattern : alias.pattern.slice(0, star);
          const suffix = star === -1 ? "" : alias.pattern.slice(star + 1);
          const matches = star === -1 ? spec === alias.pattern : spec.startsWith(prefix) && spec.endsWith(suffix) && spec.length >= prefix.length + suffix.length;
          if (!matches) continue;
          const rest = star === -1 ? "" : spec.slice(prefix.length, spec.length - suffix.length);
          for (const target of alias.targets) {
            const hit = this.js("", `./${tidy(path.posix.join(alias.base, target.replace("*", rest)))}`);
            if (hit) return hit;
          }
        }
        return null;
      }
      const base = tidy(path.posix.join(path.posix.dirname(fromFile), spec));
      if (base.startsWith("../")) return null;
      const prefix = base ? `${base}/` : "";
      const tsTwin = /\.(c|m)?jsx?$/.test(base) ? [base.replace(/\.(c|m)?js(x?)$/, ".$1ts$2"), base.replace(/\.jsx?$/, ".tsx")] : [];
      const hit = firstExisting([base, ...tsTwin, ...JS_EXT.map((ext) => base + ext), ...JS_EXT.map((ext) => `${prefix}index${ext}`)]);
      return hit && CODE.test(hit) ? hit : null;
    },
    py(fromFile, dots, module, names) {
      if (dots === 0) {
        // An absolute import may start at the repository root or at any folder above the file (backend/app/...).
        const roots = [""];
        for (let dir = path.posix.dirname(fromFile); dir !== "."; dir = path.posix.dirname(dir)) roots.push(`${dir}/`);
        for (const root of roots.reverse()) {
          const hits = this.pyFrom(root, module, names, true);
          if (hits.length) return hits;
        }
        return [];
      }
      let dir;
      if (dots > 0) {
        dir = path.posix.dirname(fromFile);
        for (let up = 1; up < dots; up += 1) dir = path.posix.dirname(dir);
        dir = dir === "." ? "" : `${dir}/`;
      } else dir = "";
      return this.pyFrom(dir, module, names, false);
    },
    pyFrom(dir, module, names, absolute) {
      const found = [];
      if (module) {
        const hit = firstExisting([`${dir}${module.replace(/\./g, "/")}.py`, `${dir}${module.replace(/\./g, "/")}/__init__.py`]);
        if (hit) found.push(hit);
        else if (absolute) return found;
      }
      const base = module ? `${dir}${module.replace(/\./g, "/")}/` : dir;
      for (const name of names) {
        const hit = firstExisting([`${base}${name}.py`, `${base}${name}/__init__.py`]);
        if (hit && !(module && found.length && hit === found[0])) found.push(hit);
      }
      return found;
    }
  };
}

// FastAPI: the full prefix of a router variable in a file, joined from APIRouter(prefix=...) and every
// include_router(child, prefix=...) above it. A prefix that is not a string literal, or a constant set to one
// in an imported file, is shown as "{unread prefix}" rather than guessed.
function fastapiPrefixes(files, read, resolver) {
  const python = files.filter((file) => /\.py$/.test(file) && !isSample(file));
  const quote = (text) => /^(['"])(.*)\1$/.exec(text.trim());
  const constant = (file, expr) => {
    const name = expr.split(".").pop();
    if (!/^[A-Za-z_]\w*$/.test(name) || /\[/.test(expr)) return null;
    for (const candidate of [file, ...importsOf(file, read(file) || "", resolver)]) {
      const hit = new RegExp(`^\\s*${name}\\s*(?::[^=\\n]+)?=\\s*(['"])([^'"\\n]*)\\1`, "m").exec(read(candidate) || "");
      if (hit) return hit[2];
    }
    return null;
  };
  const prefixArg = (file, args) => {
    const match = /\bprefix\s*=\s*([^,)]+)/.exec(args || "");
    if (!match) return "";
    const literal = quote(match[1]);
    if (literal) return literal[2];
    const value = constant(file, match[1].trim());
    return value === null ? "{unread prefix}" : value;
  };
  // Which file defines a name used in "parent": from X import name / from X import module.
  const origin = (parent, expr) => {
    const [head, ...rest] = expr.split(".");
    const text = read(parent) || "";
    for (const found of text.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(?:\(([^)]*)\)|([^\n]+))/gm)) {
      const names = (found[3] || found[4]).split(",").map((part) => part.trim().split(/\s+as\s+/)).map((pair) => ({ name: pair[0], alias: pair[1] || pair[0] }));
      const entry = names.find((item) => item.alias === head);
      if (!entry) continue;
      const dots = found[1].length;
      if (rest.length > 0) {
        const module = found[2] ? `${found[2]}.${entry.name}` : entry.name;
        const hit = resolver.py(parent, dots, module, [])[0];
        if (hit) return { file: hit, variable: rest[rest.length - 1] };
      } else {
        const hit = found[2] ? resolver.py(parent, dots, found[2], [])[0] : null;
        if (hit) return { file: hit, variable: entry.name };
      }
    }
    return rest.length === 0 ? { file: parent, variable: head } : null;
  };
  const mounts = new Map();
  for (const file of python) {
    const text = read(file) || "";
    if (!/include_router/.test(text)) continue;
    for (const found of text.matchAll(/(\w+)\.include_router\(\s*([\w.]+)\s*(?:,([^)]*))?\)/g)) {
      const child = origin(file, found[2]);
      if (!child) continue;
      const key = `${child.file}|${child.variable}`;
      if (!mounts.has(key)) mounts.set(key, { file, variable: found[1], prefix: prefixArg(file, found[3]) });
    }
  }
  const memo = new Map();
  const full = (file, variable, seen = new Set()) => {
    const key = `${file}|${variable}`;
    if (memo.has(key)) return memo.get(key);
    if (seen.has(key)) return "";
    seen.add(key);
    const own = new RegExp(`\\b${variable}\\s*=\\s*APIRouter\\(([^)]*)\\)`).exec(read(file) || "");
    const mount = mounts.get(key);
    const value = `${mount ? full(mount.file, mount.variable, seen) + mount.prefix : ""}${own ? prefixArg(file, own[1]) : ""}`.replace(/\/\/+/g, "/");
    memo.set(key, value);
    return value;
  };
  return (file, variable) => full(file, variable);
}

// Express-style mounts: app.use("/api", router), Router().use("/api", api), router.use(require("./x")).
// Returns (file, receiver) => the set of path prefixes the routes in that file sit under.
// A node is a router inside a file: (file, local name), or (file, "*") for what the file exports.
// An imported router is the whole file it comes from; a file that exports several routers is treated as one.
function expressPrefixes(files, read, resolver) {
  const js = files.filter((file) => /\.(c|m)?(js|ts)x?$/.test(file) && !isSample(file));
  const incoming = new Map(); // node key -> [{ from: node key, prefix }]
  const key = (file, name) => `${file}|${name}`;
  const add = (to, from, prefix) => {
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to).push({ from, prefix });
  };
  for (const file of js) {
    const text = read(file) || "";
    if (!/\.use\(/.test(text)) continue;
    const bindings = new Map();
    for (const found of text.matchAll(/\bimport\s+([\w$]+)?\s*,?\s*(?:\*\s+as\s+([\w$]+)|\{([^}]*)\})?\s*from\s*(['"])([^'"\n]+)\4/g)) {
      const target = resolver.js(file, found[5]);
      if (!target) continue;
      const names = [found[1], found[2], ...(found[3] || "").split(",").map((part) => part.trim().split(/\s+as\s+/).pop())].filter(Boolean);
      for (const name of names) bindings.set(name, target);
    }
    for (const found of text.matchAll(/\b(?:const|let|var)\s+(?:([\w$]+)|\{([^}]*)\})\s*=\s*require\(\s*(['"])([^'"\n]+)\3\s*\)/g)) {
      const target = resolver.js(file, found[4]);
      if (!target) continue;
      const names = found[1] ? [found[1]] : found[2].split(",").map((part) => part.trim().split(/\s*:\s*/).pop());
      for (const name of names.filter(Boolean)) bindings.set(name, target);
    }
    const definitions = [...text.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=/g)].map((found) => ({ name: found[1], at: found.index }));
    const owner = (index) => {
      let back = index - 1;
      while (back >= 0 && /\s/.test(text[back])) back -= 1;
      const ident = /([\w$]+)$/.exec(text.slice(Math.max(0, back - 60), back + 1));
      if (ident && text[back - ident[1].length] !== ".") return ident[1];
      // A chain such as "const api = Router()\n  .use(a)": the variable whose definition the call sits in.
      const def = definitions.filter((item) => item.at < index && !text.slice(item.at, index).includes(";")).pop();
      const exported = text.lastIndexOf("export default", index);
      if (def && !(exported > def.at && !text.slice(exported, index).includes(";"))) return def.name;
      return "*";
    };
    for (const found of text.matchAll(/\.use\(\s*(?:(['"`])(\/[^'"`\n]*)\1\s*,)?([^;]*?)\)\s*(?=[;.\n)]|$)/g)) {
      if (inComment(text, found.index)) continue;
      const prefix = found[2] || "";
      const from = owner(found.index);
      const fromKey = key(file, from);
      for (const arg of found[3].split(",").map((part) => part.trim()).filter(Boolean)) {
        const required = /^require\(\s*(['"])([^'"\n]+)\1\s*\)?$/.exec(arg);
        if (required) {
          const target = resolver.js(file, required[2]);
          if (target) add(key(target, "*"), fromKey, prefix);
          continue;
        }
        const name = /^([\w$]+)(?:\.[\w$]+)*$/.exec(arg);
        if (!name) continue;
        if (bindings.has(name[1])) add(key(bindings.get(name[1]), "*"), fromKey, prefix);
        else if (definitions.some((item) => item.name === name[1])) add(key(file, name[1]), fromKey, prefix);
      }
    }
  }
  const memo = new Map();
  const prefixes = (node, seen = new Set()) => {
    if (memo.has(node)) return memo.get(node);
    if (seen.has(node) || seen.size > 40) return new Set([""]);
    seen.add(node);
    let parents = incoming.get(node) || [];
    // A router with no mount inside its own file inherits the file's prefixes (it is what the file exports or serves).
    if (parents.length === 0 && !node.endsWith("|*")) parents = (incoming.get(`${node.slice(0, node.lastIndexOf("|"))}|*`) || []);
    const out = new Set();
    if (parents.length === 0) out.add("");
    for (const parent of parents) for (const above of prefixes(parent.from, new Set(seen))) out.add(`${above}${parent.prefix}`.replace(/\/\/+/g, "/"));
    memo.set(node, out);
    return out;
  };
  return (file, receiver) => [...new Set([...prefixes(key(file, receiver))].map((value) => value.replace(/\/$/, "")))];
}

// Cargo.toml files: package name, [lib] and [[bin]] targets (with Cargo's default paths).
function cargoCrates(files, read, fileSet) {
  const crates = [];
  for (const file of files.filter((name) => /(^|\/)Cargo\.toml$/.test(name) && name.split("/").length <= 4 && !isSample(name))) {
    const dir = path.posix.dirname(file) === "." ? "" : `${path.posix.dirname(file)}/`;
    const pkg = {};
    const lib = {};
    const bins = [];
    let section = null;
    let current = null;
    for (const raw of (read(file) || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (/^\[\[\s*bin\s*\]\]$/.test(line)) {
        current = {};
        bins.push(current);
        section = "bin";
        continue;
      }
      if (line.startsWith("[")) {
        section = line === "[package]" ? "package" : line === "[lib]" ? "lib" : "other";
        continue;
      }
      const pair = /^([\w-]+)\s*=\s*"([^"]*)"/.exec(line);
      if (!pair) continue;
      if (section === "package") pkg[pair[1]] = pair[2];
      else if (section === "lib") lib[pair[1]] = pair[2];
      else if (section === "bin") current[pair[1]] = pair[2];
    }
    if (!pkg.name) continue;
    const libPath = lib.path ? dir + lib.path : fileSet.has(`${dir}src/lib.rs`) ? `${dir}src/lib.rs` : null;
    const binPaths = bins.map((bin) => ({ name: bin.name || pkg.name, path: bin.path ? dir + bin.path : `${dir}src/bin/${bin.name}.rs` }));
    if (bins.length === 0 && fileSet.has(`${dir}src/main.rs`)) binPaths.push({ name: pkg.name, path: `${dir}src/main.rs` });
    crates.push({ file, name: pkg.name, lib: libPath, bins: binPaths });
  }
  return crates;
}

// Go: the module path from each go.mod, and every folder of non-test .go files as one package ("dir/", root "./").
function goLayout(files, read) {
  const modules = [];
  for (const file of files.filter((name) => /(^|\/)go\.mod$/.test(name) && name.split("/").length <= 3 && !isSample(name))) {
    const module = /^module\s+(\S+)/m.exec(read(file) || "");
    if (module) modules.push({ dir: path.posix.dirname(file) === "." ? "" : path.posix.dirname(file), module: module[1], file });
  }
  const packages = new Map();
  if (modules.length === 0) return { modules, packages };
  for (const file of files) {
    if (!/\.go$/.test(file) || isSample(file)) continue;
    const dir = path.posix.dirname(file);
    const node = dir === "." ? "./" : `${dir}/`;
    if (!packages.has(node)) packages.set(node, []);
    packages.get(node).push(file);
  }
  return { modules, packages };
}

// Packages of this module that a Go package imports, by module path.
function goImports(node, layout, read) {
  const found = [];
  for (const file of layout.packages.get(node) || []) {
    const text = (read(file) || "").replace(/\/\/[^\n]*/g, "");
    const specs = [...text.matchAll(/^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"]+)"/gm)].map((match) => match[1]);
    for (const block of text.matchAll(/^[ \t]*import[ \t]*\(([\s\S]*?)\)/gm)) specs.push(...[...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
    for (const spec of specs) {
      const module = layout.modules.find((item) => spec === item.module || spec.startsWith(`${item.module}/`));
      if (!module) continue;
      const dir = [module.dir, spec.slice(module.module.length + 1)].filter(Boolean).join("/");
      const target = dir ? `${dir}/` : "./";
      if (layout.packages.has(target) && target !== node && !found.includes(target)) found.push(target);
    }
  }
  return found;
}

// Rust: "mod x;" (with #[path]), "use crate::a::b", and other workspace crates used by name.
// Each file remembers its crate root and module path, so later "use crate::..." lines find files declared earlier.
function makeRust(fileSet, crates) {
  const libs = new Map(crates.filter((crate) => crate.lib && fileSet.has(crate.lib)).map((crate) => [crate.name.replace(/-/g, "_"), crate.lib]));
  const context = new Map();
  const modules = new Map();
  const pick = (candidates) => candidates.map((candidate) => path.posix.normalize(candidate)).find((candidate) => fileSet.has(candidate)) || null;
  return (file, text) => {
    if (!context.has(file)) context.set(file, { root: file, mod: "" });
    const ctx = context.get(file);
    if (!modules.has(ctx.root)) modules.set(ctx.root, new Map());
    const known = modules.get(ctx.root);
    const dir = path.posix.dirname(file) === "." ? "" : `${path.posix.dirname(file)}/`;
    const rootDir = path.posix.dirname(ctx.root) === "." ? "" : `${path.posix.dirname(ctx.root)}/`;
    const moduleDir = file === ctx.root || /(^|\/)mod\.rs$/.test(file) ? dir : `${file.replace(/\.rs$/, "")}/`;
    const found = [];
    const add = (target, next) => {
      if (!target || target === file || found.includes(target)) return;
      found.push(target);
      if (!context.has(target)) context.set(target, next);
    };
    const code = text.replace(/\/\/[^\n]*/g, "");
    for (const match of code.matchAll(/(?:#\[path\s*=\s*"([^"]+)"\]\s*)?^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?mod[ \t]+(\w+)[ \t]*;/gm)) {
      const target = match[1] ? pick([dir + match[1]]) : pick([`${moduleDir}${match[2]}.rs`, `${moduleDir}${match[2]}/mod.rs`]);
      const modPath = ctx.mod ? `${ctx.mod}::${match[2]}` : match[2];
      if (target) known.set(modPath, target);
      add(target, { root: ctx.root, mod: modPath });
    }
    const uses = [];
    for (const match of code.matchAll(/\buse[ \t]+crate::((?:\w+::)*\w*)(?:::)?(\{[^}]*\})?/g)) {
      const base = match[1].split("::").filter(Boolean);
      if (match[2]) for (const item of match[2].slice(1, -1).split(",")) uses.push([...base, ...item.trim().split("::").filter((part) => /^\w+$/.test(part))]);
      else uses.push(base);
    }
    for (const segments of uses) {
      for (let length = segments.length; length > 0; length -= 1) {
        const modPath = segments.slice(0, length).join("::");
        const rel = segments.slice(0, length).join("/");
        const target = known.get(modPath) || pick([`${rootDir}${rel}.rs`, `${rootDir}${rel}/mod.rs`]);
        if (target) {
          add(target, { root: ctx.root, mod: modPath });
          break;
        }
      }
    }
    const own = [...libs].find(([, lib]) => lib === ctx.root);
    for (const match of code.matchAll(/\b(?:use[ \t]+|extern[ \t]+crate[ \t]+)(\w+)/g)) {
      const lib = libs.get(match[1]);
      if (lib && (!own || own[0] !== match[1])) add(lib, { root: lib, mod: "" });
    }
    return found;
  };
}

// Local files a source file imports, in the order they appear. Packages are skipped.
function importsOf(file, text, resolver) {
  const found = [];
  if (/\.(c|m)?(js|ts)x?$/.test(file)) {
    const pattern = /(?:\brequire\s*\(\s*|\bimport\s*\(\s*|\bfrom\s+|^\s*import\s+)(['"])([^'"\n]+)\1/gm;
    for (const match of text.matchAll(pattern)) {
      const hit = resolver.js(file, match[2]);
      if (hit) found.push(hit);
    }
  } else if (/\.py$/.test(file)) {
    for (const match of text.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(?:\(([^)]*)\)|([\w \t,*]+))/gm)) {
      const names = (match[3] || match[4]).split(",").map((name) => name.trim().split(/\s+/)[0]).filter((name) => /^\w+$/.test(name));
      found.push(...resolver.py(file, match[1].length, match[2], names));
    }
    for (const match of text.matchAll(/^[ \t]*import[ \t]+([\w.]+)/gm)) found.push(...resolver.py(file, 0, match[1], []));
  }
  return found;
}


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
const PY_FRAMEWORKS = {
  django: "Django", flask: "Flask", fastapi: "FastAPI", sqlalchemy: "SQLAlchemy", sqlmodel: "SQLModel", alembic: "Alembic", pytest: "pytest",
  pyjwt: "PyJWT", "flask-login": "Flask-Login", authlib: "Authlib", passlib: "passlib (password hashing)", pwdlib: "pwdlib (password hashing)",
  bcrypt: "bcrypt", "argon2-cffi": "argon2-cffi", psycopg2: "psycopg2 (PostgreSQL driver)", psycopg: "psycopg (PostgreSQL driver)",
  asyncpg: "asyncpg (PostgreSQL driver)", pymysql: "PyMySQL (MySQL driver)", pymongo: "PyMongo (MongoDB driver)", celery: "Celery"
};
const PY_DATA = ["sqlalchemy", "sqlmodel", "alembic", "psycopg2", "psycopg", "asyncpg", "pymysql", "pymongo"];
const PY_AUTH = ["pyjwt", "flask-login", "authlib", "passlib", "pwdlib", "bcrypt", "argon2-cffi"];
// Database images a Docker Compose service may run.
const DB_IMAGES = { postgres: "PostgreSQL", postgis: "PostgreSQL (PostGIS)", mysql: "MySQL", mariadb: "MariaDB", mongo: "MongoDB", redis: "Redis", valkey: "Valkey" };

// Top-level services of a Compose file and their images. A small reader for the common layout
// (services: at column 0, two-space service keys, "image:" inside); anything else yields fewer facts, not wrong ones.
function composeServices(text) {
  const services = [];
  let inServices = false;
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inServices = /^services:\s*(#.*)?$/.test(line);
      current = null;
      continue;
    }
    if (!inServices) continue;
    const key = /^ {2}([\w.-]+):\s*(#.*)?$/.exec(line);
    if (key) {
      current = { name: key[1], image: null };
      services.push(current);
      continue;
    }
    const image = /^ {4}image:\s*['"]?([^'"\s#]+)/.exec(line);
    if (image && current && !current.image) current.image = image[1];
  }
  return services;
}

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
    if (PY_DATA.includes(name) || PY_AUTH.includes(name)) continue;
    out.stack.push(fact(`${PY_FRAMEWORKS[name]} (Python dependency)`, source));
  }

  // ----- entry points -----
  // Order: what the manifest declares (main, bin, exports, or Node's default index.js), then entry-like
  // file names outside example and test folders. Entry-like files inside those folders are counted, not listed.
  const declaredEntries = [];
  const nameEntries = [];
  const listedEntry = new Set();
  const twinOf = makeResolver(fileSet);
  const addEntry = (target, label, source) => {
    const file = path.posix.normalize(target.replace(/^\.\//, ""));
    const present = has(file);
    listedEntry.add(file);
    if (present) {
      declaredEntries.push(file);
      out["entry-points"].push(fact(`${label}: ${file}`, source));
      return;
    }
    // A built path such as dist/source/index.js often has its source at source/index.ts.
    const rest = file.replace(/^(dist|build|out|lib)\//, "");
    const twin = rest === file ? null : twinOf.js("", `./${rest}`) || twinOf.js("", `./src/${rest}`);
    if (twin) {
      declaredEntries.push(twin);
      listedEntry.add(twin);
    }
    out["entry-points"].push(fact(`${label}: ${file} (file not in the repository; probably built${twin ? `, source looks like ${twin}` : ""})`, source));
  };
  for (const manifest of manifests) {
    const where = manifest.dir ? ` (${manifest.dir}/)` : "";
    const prefix = manifest.dir ? `${manifest.dir}/` : "";
    const data = manifest.data;
    if (typeof data.main === "string") addEntry(prefix + data.main, `package main${where}`, manifest.file);
    const bin = data.bin;
    if (typeof bin === "string") addEntry(prefix + bin, `package bin${where}`, manifest.file);
    else if (bin && typeof bin === "object") for (const [name, target] of Object.entries(bin)) if (typeof target === "string") addEntry(prefix + target, `package bin${where} ${name}`, manifest.file);
    for (const target of exportTargets(data.exports)) if (!listedEntry.has(path.posix.normalize(prefix + target.replace(/^\.\//, "")))) addEntry(prefix + target, `package exports${where}`, manifest.file);
    if (typeof data.main !== "string" && !data.exports && has(`${prefix}index.js`)) {
      addEntry(`${prefix}index.js`, `package default entry${where}`, manifest.file);
      out["entry-points"][out["entry-points"].length - 1] = fact(`package default entry${where}: ${prefix}index.js (no main field, so Node loads index.js)`, manifest.file);
    }
  }
  const crates = cargoCrates(files, read, fileSet);
  for (const crate of crates) {
    for (const bin of crate.bins) addEntry(bin.path, `Cargo bin ${bin.name}`, crate.file);
    if (crate.lib) addEntry(crate.lib, `Cargo lib ${crate.name}`, crate.file);
  }
  const go = goLayout(files, read);
  const goEntries = [];
  const entryKind = new Map();
  const isGoMain = (file) => /^package\s+main\b/m.test(read(file) || "");
  for (const [node, members] of go.packages) {
    if (members.some(isGoMain)) {
      goEntries.push(node);
      entryKind.set(node, "Go package main");
    }
  }
  for (const module of go.modules) {
    const root = module.dir ? `${module.dir}/` : "./";
    const hasMain = goEntries.some((node) => module.dir === "" || node.startsWith(`${module.dir}/`));
    if (!hasMain && go.packages.has(root)) {
      goEntries.push(root);
      entryKind.set(root, "Go root package");
      out["entry-points"].push(fact(`Go library ${module.module}: root package ${root} (no main package)`, module.file));
    }
  }
  for (const node of goEntries.filter((item) => entryKind.get(item) === "Go package main")) out["entry-points"].push(fact(`Go package main: ${node}`, go.packages.get(node).find(isGoMain)));
  const goNodeOf = (file) => (path.posix.dirname(file) === "." ? "./" : `${path.posix.dirname(file)}/`);
  const ENTRY_FILES = /(^|\/)(index\.html|src\/(main|index|app|server)\.(c|m)?(js|ts)x?|(server|app|index|main)\.(c|m)?(js|ts)|manage\.py|main\.py|app\.py|wsgi\.py|asgi\.py|cmd\/[^/]+\/main\.go|main\.go|src\/main\.rs|app\/layout\.(js|jsx|ts|tsx)|pages\/_app\.(js|jsx|ts|tsx))$/;
  const entryLike = files.filter((name) => ENTRY_FILES.test(name) && name.split("/").length <= 4);
  const sampleEntries = entryLike.filter(isSample);
  const namedFiles = entryLike.filter((name) => !isSample(name) && !listedEntry.has(name) && !(/\.go$/.test(name) && entryKind.has(goNodeOf(name)))).slice(0, MAX_LISTED);
  for (const file of namedFiles) if (SOURCE_EXT.test(file)) nameEntries.push(file);
  const sampleEntryLine = () => {
    if (sampleEntries.length === 0) return;
    const groups = [...new Set(sampleEntries.map(sampleGroup))];
    out["entry-points"].push(fact(`Not app entry points: ${sampleEntries.length} entry-like file(s) under example or test folders: ${groups.slice(0, 6).join(", ")}${groups.length > 6 ? ", ..." : ""}`, groups[0].replace(/\/$/, "") || "."));
  };

  // ----- import map: breadth first from the entry files, relative imports only -----
  // Declared entries are walked first; a file found by name becomes a start point only if nothing reached it.
  const aliases = pathAliases(files, read);
  const resolveImport = makeResolver(fileSet, aliases);
  const rust = makeRust(fileSet, crates);
  const nodeImports = (node) => (node.endsWith("/") ? goImports(node, go, read) : /\.rs$/.test(node) ? rust(node, read(node) || "") : importsOf(node, read(node) || "", resolveImport));
  const nodeSource = (node) => (node.endsWith("/") ? (go.packages.get(node) || []).find((file) => entryKind.get(node) !== "Go package main" || isGoMain(file)) || node : node);
  const depth = new Map();
  const edges = new Map();
  const seeds = [];
  const walk = (start) => {
    if (depth.has(start) || seeds.length >= 8) return;
    seeds.push(start);
    depth.set(start, 0);
    const queue = [start];
    while (queue.length > 0 && depth.size <= MAX_MAP_VISITS) {
      const file = queue.shift();
      const targets = [];
      for (const target of nodeImports(file)) {
        if (target === file || targets.includes(target) || isSample(target)) continue;
        targets.push(target);
        if (!depth.has(target)) {
          depth.set(target, depth.get(file) + 1);
          queue.push(target);
        }
      }
      edges.set(file, targets);
    }
  };
  // A named file that another named file imports (app.tsx imported by main.tsx) is walked after it.
  const importedByNamed = new Set(nameEntries.flatMap((file) => importsOf(file, read(file) || "", resolveImport)));
  const shallowFirst = [...nameEntries].sort((x, y) => x.split("/").length - y.split("/").length || importedByNamed.has(x) - importedByNamed.has(y) || x.localeCompare(y));
  for (const file of [...declaredEntries, ...goEntries, ...shallowFirst]) if (/\.((c|m)?(js|ts)x?|py|rs)$/.test(file) || go.packages.has(file)) walk(file);
  const walked = [...edges.keys()];
  // Shallow files first, so every entry gets its first levels before the budget runs out.
  const branches = walked.filter((file) => edges.get(file).length > 0 || depth.get(file) === 0).sort((x, y) => depth.get(x) - depth.get(y) || walked.indexOf(x) - walked.indexOf(y));
  const leaves = walked.filter((file) => edges.get(file).length === 0 && depth.get(file) > 0);
  // Imports under the importer's own folder are written relative to it ("./routes/items.py") to save space.
  const short = (from, target) => {
    const dir = path.posix.dirname(from);
    if (from.endsWith("/")) return target;
    return dir !== "." && target.startsWith(`${dir}/`) ? `./${target.slice(dir.length + 1)}` : target;
  };
  let used = 0;
  let listed = 0;
  for (const file of branches) {
    if (listed >= MAX_MAP_FILES) break;
    const level = depth.get(file) === 0 ? (entryKind.has(file) ? `entry, ${entryKind.get(file)}` : "entry") : `depth ${depth.get(file)}`;
    const targets = edges.get(file);
    const shown = targets.slice(0, MAX_MAP_IMPORTS).map((target) => short(file, target)).join(", ");
    const more = targets.length > MAX_MAP_IMPORTS ? ` (+${targets.length - MAX_MAP_IMPORTS} more)` : "";
    const line = fact(targets.length ? `${file} (${level}) imports: ${shown}${more}` : `${file} (${level}) imports nothing local`, nodeSource(file));
    if (listed > 0 && used + line.length > MAX_MAP_CHARS) break;
    out.map.push(line);
    used += line.length;
    listed += 1;
  }
  if (branches.length > listed) out.map.push(`- ... and ${branches.length - listed} more importing file(s) not listed`);
  if (leaves.length > 0) out.map.push(`- Leaf files (import nothing local): ${leaves.slice(0, MAX_MAP_LEAVES).join(", ")}${leaves.length > MAX_MAP_LEAVES ? ` (+${leaves.length - MAX_MAP_LEAVES} more)` : ""}`);
  const reachable = new Set(depth.keys());
  // Entry-like file names go after the declared entries; one reached from another entry is marked, not presented as a start.
  for (const file of namedFiles) {
    const from = depth.get(file) > 0 ? walked.find((other) => edges.get(other).includes(file)) : null;
    out["entry-points"].push(fact(`file present: ${file}${from ? ` (imported by ${from}; not a separate start)` : ""}`, file));
  }
  sampleEntryLine();
  if (aliases.length > 0) out.map.unshift(fact(`Path aliases followed: ${aliases.slice(0, 4).map((alias) => `${alias.pattern} -> ${alias.targets[0]}`).join(", ")}`, aliases[0].source));
  if (seeds.length > 0) {
    const unreached = files.filter((file) => SOURCE_EXT.test(file) && !isSample(file) && !/\.d\.ts$/.test(file) && !/(^|\/)(__init__\.py|setup\.py|conftest\.py|build\.rs|[^/]*\.config\.(c|m)?(js|ts))$/.test(file) && (/\.go$/.test(file) ? go.packages.has(goNodeOf(file)) && !reachable.has(goNodeOf(file)) : !reachable.has(file)));
    if (unreached.length > 0) out.map.push(`- ${unreached.length} source file(s) outside examples and tests are not reached from an entry, e.g. ${unreached.slice(0, 3).join(", ")} (scripts, config, or code loaded by name)`);
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
  // Each route keeps its file, line and router variable, so routes can be grouped per file
  // and FastAPI prefixes (APIRouter(prefix=...), include_router(..., prefix=...)) joined into full paths.
  const apiRoutes = [];
  const pageRoutes = [];
  const routeFile = /(^|\/)(app|pages)\/.*\.(c|m)?(js|ts)x?$/;
  const clean = (segments) => "/" + segments.filter((part) => part && !/^\(.*\)$/.test(part)).join("/");
  const fileGroup = (prefix, root) => ({ group: `${prefix}${root}/`, style: "file routes" });
  for (const file of files) {
    let match = /^((?:.*\/)?)app\/(.*)\/?route\.(c|m)?(js|ts)x?$/.exec(file);
    if (match) {
      const text = read(file) || "";
      const methods = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      apiRoutes.push({ text: `${methods.join("/") || "?"} ${clean(match[2].split("/"))}`.replace(/\/\/+/g, "/"), file, line: 0, ...fileGroup(match[1], "app") });
      continue;
    }
    match = /^((?:.*\/)?)pages\/api\/(.+)\.(c|m)?(js|ts)x?$/.exec(file);
    if (match) {
      apiRoutes.push({ text: `any ${clean(["api", ...match[2].replace(/\/index$/, "").split("/")])}`, file, line: 0, ...fileGroup(match[1], "pages") });
      continue;
    }
    match = /^((?:.*\/)?)app\/(.*\/)?page\.(c|m)?(js|ts)x?$/.exec(file);
    if (match && !file.includes("/api/")) {
      pageRoutes.push({ text: clean((match[2] || "").split("/")), file, line: 0, ...fileGroup(match[1], "app") });
      continue;
    }
    match = /^((?:.*\/)?)pages\/(.+)\.(c|m)?(js|ts)x?$/.exec(file);
    if (match && !/^api\//.test(match[2]) && !/(^|\/)_/.test(match[2])) {
      pageRoutes.push({ text: clean(match[2].replace(/(^|\/)index$/, "").split("/")), file, line: 0, ...fileGroup(match[1], "pages") });
      continue;
    }
    if (!SOURCE_EXT.test(file) || routeFile.test(file) && /^(.*\/)?(app|pages)\//.test(file) && /\/(page|route)\./.test(file)) continue;
    const text = read(file);
    if (!text) continue;
    const at = (index) => lineOf(text, index);
    for (const found of text.matchAll(/\b(app|router|server|api|routes)\.(get|post|put|patch|delete)\(\s*(['"`])(\/[^'"`]*)\3/g)) {
      if (inComment(text, found.index) || text[found.index - 1] === "@") continue;
      apiRoutes.push({ text: `${found[2].toUpperCase()} ${found[4]}`, file, line: at(found.index), group: file, style: "", receiver: found[1] });
    }
    for (const found of text.matchAll(/@(\w+)\.(get|post|put|patch|delete)\(\s*(['"])(\/[^'"]*)\3/g)) {
      apiRoutes.push({ text: `${found[2].toUpperCase()} ${found[4]}`, file, line: at(found.index), group: file, style: "FastAPI", router: found[1] });
    }
    for (const found of text.matchAll(/@\w+\.route\(\s*(['"])(\/[^'"]*)\1(?:\s*,\s*methods\s*=\s*\[([^\]]*)\])?/g)) {
      const methods = found[3] ? found[3].replace(/['"\s]/g, "").replace(/,/g, "/") : "GET";
      apiRoutes.push({ text: `${methods} ${found[2]}`, file, line: at(found.index), group: file, style: "Flask" });
    }
    // Only files that import react-router; a path built from a template (`${...}`) is not a route.
    if (/(?:\bfrom\s*|\brequire\(\s*|\bimport\(\s*)['"]react-router(?:-dom)?['"]/.test(text)) {
      const page = (found, value) => {
        if (!value.includes("${")) pageRoutes.push({ text: value.startsWith("/") ? value : `/${value}`, file, line: at(found.index), group: file, style: "" });
      };
      for (const found of text.matchAll(/<Route\b[^>]*\bpath=(['"{`]+)(\/?[^'"`}]*)/g)) page(found, found[2]);
      for (const found of text.matchAll(/\bpath:\s*(['"`])(\/?[^'"`]*)\1/g)) page(found, found[2]);
    }
  }
  const prefixOf = fastapiPrefixes(files, read, makeResolver(fileSet));
  // Express-style routes are shown with the prefix they are mounted under, when every mount path agrees.
  const mountedAt = expressPrefixes(files, read, resolveImport);
  for (const route of apiRoutes) {
    if (!route.receiver) continue;
    const found = mountedAt(route.file, route.receiver).filter(Boolean);
    if (found.length === 1) {
      const [method, ...rest] = route.text.split(" ");
      route.text = `${method} ${found[0]}${rest.join(" ")}`.replace(/(?<=\S)\/\/+/g, "/").replace(/(?<=\S)\/$/, "");
    } else if (found.length > 1) route.prefix = `mounted at ${found.slice(0, 4).join(", ")}`;
  }
  // FastAPI routes are shown with their full path: the joined router prefixes, then the decorator's path.
  for (const route of apiRoutes) {
    if (route.style !== "FastAPI") continue;
    route.prefix = prefixOf(route.file, route.router);
    if (route.prefix) {
      const [method, ...rest] = route.text.split(" ");
      route.text = `${method} ${route.prefix}${rest.join(" ")}`.replace(/(?<=\S)\/\/+/g, "/");
    }
  }

  const sampleRoutes = [...apiRoutes, ...pageRoutes].filter((route) => isSample(route.file));
  const appApi = apiRoutes.filter((route) => !sampleRoutes.includes(route));
  const appPages = pageRoutes.filter((route) => !sampleRoutes.includes(route));
  // One line per file (or per file-routing folder), within a character budget.
  let routeChars = 0;
  let routeGroupsLeft = 0;
  const emit = (list, label) => {
    const groups = new Map();
    for (const route of list) {
      const key = `${route.group}|${route.prefix || ""}`;
      if (!groups.has(key)) groups.set(key, []);
      if (!groups.get(key).some((other) => other.text === route.text)) groups.get(key).push(route);
    }
    for (const [, routes] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (routes[0].style === "file routes") routes.sort((a, b) => a.text.localeCompare(b.text) || a.file.localeCompare(b.file));
      else routes.sort((a, b) => a.line - b.line);
      const head = routes[0];
      const style = head.style ? ` (${head.style})` : "";
      const shown = routes.slice(0, MAX_ROUTES_PER_LINE).map((route) => route.text).join(", ");
      const more = routes.length > MAX_ROUTES_PER_LINE ? ` (+${routes.length - MAX_ROUTES_PER_LINE} more)` : "";
      const several = head.prefix && head.prefix.startsWith("mounted at ") ? `, ${head.prefix}` : "";
      const line = fact(`${label} in ${head.group}${style}${several}: ${shown}${more}`, head.line ? `${head.file}:${head.line}` : head.file);
      if (routeChars > 0 && routeChars + line.length > MAX_ROUTE_CHARS) {
        routeGroupsLeft += 1;
        continue;
      }
      out.routes.push(line);
      routeChars += line.length;
    }
  };
  emit(appApi, "API");
  emit(appPages, "Page");
  if (routeGroupsLeft > 0) out.routes.push(`- ... and ${routeGroupsLeft} more route file(s) not listed`);
  if (sampleRoutes.length > 0) {
    if (out.routes.length === 0) out.routes.push("- No app routes were detected.");
    const counts = new Map();
    for (const route of sampleRoutes) {
      const group = sampleGroup(route.file);
      counts.set(group, (counts.get(group) || 0) + 1);
    }
    const summary = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([group, count]) => `${group}: ${count}`).join(", ");
    out.routes.push(fact(`Not app routes: ${sampleRoutes.length} route definition(s) in example or test files (${summary})`, [...counts.keys()].sort()[0].replace(/\/$/, "") || "."));
  }

  // ----- data layer -----
  for (const manifest of manifests) {
    const deps = depsOf(manifest);
    for (const [name, label] of Object.entries(DATABASES)) if (deps[name]) out.data.push(fact(`Dependency declared: ${label}${manifest.dir ? ` (in ${manifest.dir}/)` : ""}`, manifest.file));
  }
  for (const [name, source] of python) if (PY_DATA.includes(name)) out.data.push(fact(`Python dependency: ${PY_FRAMEWORKS[name]}`, source));
  for (const file of files.filter((name) => /(^|\/)schema\.prisma$/.test(name))) {
    const provider = /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"/s.exec(read(file) || "");
    const models = [...(read(file) || "").matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]);
    out.data.push(fact(`Prisma schema${provider ? `, provider ${provider[1]}` : ""}${models.length ? `, models: ${models.slice(0, 15).join(", ")}` : ""}`, file));
  }
  // An import of node:sqlite in app code; examples, tests and benchmarks do not count, nor does the name in a string.
  for (const file of files) {
    if (SOURCE_EXT.test(file) && !isSample(file) && /(?:\bfrom\s*|\brequire\(\s*|\bimport\(\s*)['"]node:sqlite['"]/.test(read(file) || "")) {
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

  // ----- Docker Compose: services, and the database images they run -----
  const composeFiles = files.filter((file) => /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(file) && file.split("/").length <= 2 && !isSample(file));
  const compose = composeFiles.map((file) => ({ file, services: composeServices(read(file) || "") }));
  for (const { file, services } of compose) {
    for (const service of services) {
      const repo = (service.image || "").split("/").pop().split(":")[0].replace(/\$\{[^}]*\}/g, "");
      if (DB_IMAGES[repo]) out.data.push(fact(`Docker Compose service "${service.name}" runs ${DB_IMAGES[repo]} (image ${service.image})`, file));
    }
  }

  // ----- authentication (dependencies and file names only) -----
  for (const manifest of manifests) {
    const deps = depsOf(manifest);
    for (const [name, label] of Object.entries(AUTH_DEPS)) if (deps[name]) out.auth.push(fact(`Dependency declared: ${label}${manifest.dir ? ` (in ${manifest.dir}/)` : ""}`, manifest.file));
  }
  for (const [name, source] of python) if (PY_AUTH.includes(name)) out.auth.push(fact(`Python dependency: ${PY_FRAMEWORKS[name]}`, source));
  for (const file of files) {
    if (/django\.contrib\.auth/.test(/(^|\/)settings\.py$/.test(file) ? read(file) || "" : "")) out.auth.push(fact("django.contrib.auth is in INSTALLED_APPS", file));
  }
  const authFiles = files.filter((file) => /(^|\/)[^/]*(auth|login|session|jwt)[^/]*\.(c|m)?(js|ts)x?$|(^|\/)[^/]*(auth|login|session)[^/]*\.py$/i.test(file) && !isSample(file)).slice(0, 8);
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
  if (businessDirs.length > 0 || appApi.length > 0) unknown.push("Important business rules: not discovered automatically. Read the service, domain or route files before assuming how the product behaves.");

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
  // A marker counts only inside a comment, once per line: on a comment line, or after " //" (or " #" in Python).
  // The same word inside a string or a regular expression does not count.
  const todoHits = [];
  for (const file of files) {
    if (!SOURCE_EXT.test(file)) continue;
    const text = read(file);
    if (!text) continue;
    const lines = new Set();
    for (const hit of text.matchAll(/\b(TODO|FIXME|HACK)\b/g)) {
      const before = text.slice(text.lastIndexOf("\n", hit.index - 1) + 1, hit.index);
      const comment = inComment(text, hit.index) || /(^|\s)\/\//.test(before) || (/\.py$/.test(file) && /(^|\s)#/.test(before));
      if (comment) lines.add(lineOf(text, hit.index));
    }
    for (const line of lines) todoHits.push(`${file}:${line}`);
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

  // ----- key files: where behaviour lives, for Key file notes -----
  // One of each kind first (entry, auth, config, data model, routes), then the next of each, up to MAX_KEY_FILES.
  // Chosen from names, entries and route counts only; the files are not read for this.
  const keyable = (file) => has(file) && !isSample(file) && !/\.gen\.|\.min\.|\.d\.ts$/.test(file) && SOURCE_EXT.test(file) || /(^|\/)schema\.prisma$/.test(file) && !isSample(file);
  const routeCounts = new Map();
  for (const route of appApi) routeCounts.set(route.file, (routeCounts.get(route.file) || 0) + 1);
  // Name parts of a file: "token.utils.ts" -> token, utils; "useAuth.ts" -> use, auth. "author" is its own word.
  const words = (file) => path.posix.basename(file).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const rank = (table) => (file) => {
    const found = words(file).map((word) => table[word]).filter((value) => value !== undefined);
    return found.length ? Math.min(...found) + (/\.(tsx|jsx)$/.test(file) ? 10 : 0) : null;
  };
  const byRank = (score) => files.map((file) => [file, score(file)]).filter(([, value]) => value !== null).sort((a, b) => a[1] - b[1] || a[0].split("/").length - b[0].split("/").length || a[0].localeCompare(b[0])).map(([file]) => file);
  const authRank = rank({ jwt: 0, token: 0, tokens: 0, security: 0, password: 0, passwords: 0, crypto: 0, auth: 1, authn: 1, authz: 1, authentication: 1, authorization: 1, oauth: 1, passport: 1, login: 2, logout: 2, session: 2, sessions: 2, permission: 2, permissions: 2 });
  const configRank = (file) => (/(^|\/)(migrations?|alembic|versions)\//.test(file) || /(^|\/)(vite|vitest|jest|eslint|tailwind|postcss|next|webpack|babel|playwright|tsconfig)[^/]*$/i.test(file) || !/^(config|settings|configuration|env)\.\w+$/i.test(path.posix.basename(file)) || /\.(tsx|jsx)$/.test(file) ? null : rank({ config: 0, settings: 0, configuration: 0, env: 1 })(file));
  const dataRank = (file) => (/(^|\/)schema\.prisma$/.test(file) ? 0 : /(^|\/)(models\.py|schema\.(ts|js)|[^/]+\.entity\.ts)$/.test(file) ? 1 : /(^|\/)models\/[^/]+\.(py|js|ts)$/.test(file) ? 2 : null);
  const entryFiles = seeds.map(nodeSource).filter((file) => !file.endsWith("/"));
  const kinds = [
    ["entry", entryFiles],
    ["auth (by name)", byRank(authRank)],
    ["config (by name)", byRank(configRank)],
    ["data model", byRank(dataRank)],
    ["routes", [...routeCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([file]) => file)]
  ].map(([label, list]) => [label, [...new Set(list)].filter(keyable)]);
  const picked = new Map();
  for (let round = 0; picked.size < MAX_KEY_FILES && kinds.some(([, list]) => list.length > round); round += 1) {
    for (const [label, list] of kinds) {
      const file = list[round];
      if (!file || picked.size >= MAX_KEY_FILES) continue;
      if (picked.has(file)) picked.get(file).push(label);
      else picked.set(file, [label]);
    }
  }
  // Slots left: the files an entry imports directly, in import order.
  for (const entry of entryFiles) {
    for (const file of edges.get(entry) || []) {
      if (picked.size >= MAX_KEY_FILES) break;
      if (keyable(file) && !picked.has(file)) picked.set(file, [`imported by ${entry}`]);
    }
  }
  for (const [file, labels] of picked) {
    const count = routeCounts.get(file);
    out["key-files"].push(fact(`${file}: ${labels.map((label) => (label === "routes" ? `routes (${count})` : label)).join(", ")}`, file));
  }
  if (picked.size === 0) out["key-files"].push("- No key files were picked: no entry, auth, config, data model or route file was found.");

  // ----- always unknown -----
  if (compose.length > 0) {
    for (const { file, services } of compose) out.structure.push(fact(`Docker Compose file${services.length ? `, services: ${services.map((service) => service.name).slice(0, 12).join(", ")}` : ""}`, file));
    unknown.push(`Deployment and hosting: Docker Compose files exist (${composeFiles.slice(0, 4).join(", ")}); where and how it is hosted is not discovered.`);
  } else unknown.push("Deployment and hosting: not discovered.");
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
  blocks.map = ["## Import map (from the entry files)", ...(found.out.map.length ? found.out.map : ["- No entry file to start from (JavaScript, TypeScript, Python, Go or Rust); no map was built."])];
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
  blocks["key-files"] = ["## Key files (where behaviour lives)", "Picked from names, entries and route counts, without reading them. Read these first when writing Key file notes; on a small model, only the first 3.", ...found.out["key-files"]];
  blocks.unknowns = ["## Assumed or unknown (not verified)", ...found.out.unknowns];
  return blocks;
}

const open = (name) => `<!-- uca:generated:${name} -->`;
const CLOSE = "<!-- /uca:generated -->";
const wrap = (name, lines) => `${open(name)}\n${lines.join("\n")}\n${CLOSE}`;

// The user's main task comes from the user, never from the code, so it sits outside the generated blocks.
const MAIN_TASK = "## Main task (the user's words; not generated)\n- Not recorded yet. Ask the user, or write it from the request and mark it assumed: 3 to 6 steps as they would do them, each with a concrete input and the result they expect.";

function renderFresh(blocks) {
  const title = "# PROJECT.md\n\n> Project card for coding agents. Blocks between uca:generated markers are rewritten by `node scripts/uca-project-discover.cjs --write`. Text outside them is yours and is never changed.\n";
  const order = SECTIONS;
  return `${title}\n${order.map((name) => wrap(name, blocks[name])).join("\n\n")}\n\n${MAIN_TASK}\n`;
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
