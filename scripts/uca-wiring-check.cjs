#!/usr/bin/env node
"use strict";

// Wiring check: do the links between pages and routes lead somewhere, and back?
//
//   node scripts/uca-wiring-check.cjs [project folder] [--json]
//
// Reads HTML pages, and React Router or Next.js apps, without running them:
//   broken-link    a link, image, script, stylesheet or form on a page points to a file that does not exist
//   broken-anchor  a #fragment points to no element with that id on the target page
//   broken-route   a <Link to>, href, navigate(), router.push() or a menu entry ({ href: "/x" }) points to a route the app never defines
//   dead-end       a page with no link to any other page (no way back)          needs a human
//   orphan         a page that no other page links to (no way in)                needs a human
// A link that starts with "/" depends on where the site is served from, so a missing target there "needs a human".
// Links built at run time (template strings, variables) are not followed. It cannot measure lag or loading time:
// that needs the page running in a browser.
//
// Read-only: it never runs code, never writes, never follows symbolic links. Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const MAX_READ_BYTES = 400_000;
const MAX_FILES = 3000;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage", ".venv", "venv", "__pycache__", "target", "vendor", ".uca", ".agents", ".claude", ".cursor", ".opencode", ".idea", ".vscode", ".cache"]);
const SKIP_PATH = /(^|\/)(tests?|__tests__|spec|e2e|fixtures?|__fixtures__|mocks?)(\/|$)/;
const PAGE = /\.html?$/i;
const APP_CODE = /\.(jsx|tsx|js|ts|mjs)$/;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, mailto:, tel:, data:, javascript:, //cdn
const DYNAMIC = /\$\{|\{\{|\{%|<%|\+\s*$|%[A-Z_]+%/; // template strings and build placeholders such as %PUBLIC_URL%
// Not pages a visitor browses: email templates, partials and layouts rendered into other pages.
const NOT_A_SITE_PAGE = /(^|\/)(templates?|email-templates|emails?|mail|partials?|layouts?|includes?)\//i;
// An app shell (a mount point and a module script): the app's own router does the navigation.
const APP_SHELL = /<div\b[^>]{0,4000}\bid\s*=\s*["'](?:root|app|__next|__nuxt)["']/i;

const FIX = {
  "broken-link": "Point the link at the file's real path (check the folder and the spelling), or add the missing file.",
  "broken-anchor": "Add id=\"...\" to the element the link should jump to, or fix the fragment after #.",
  "broken-route": "Add the route to the router, or change the link to a route that exists.",
  "dead-end": "Add a link back (to the home page, the previous step or a menu) so the visitor is not stuck.",
  "orphan": "Link to this page from another page, or remove it if it is not used."
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
      if (files.length >= MAX_FILES || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !SKIP_PATH.test(`${rel}/`)) visit(full);
      } else if (entry.isFile()) files.push(rel);
    }
  };
  visit(root);
  return files.sort();
}

// Line numbers from a table of newline positions built once per file, so many links in one big file stay fast.
function lineFinder(text) {
  const breaks = [];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) breaks.push(index);
  return (offset) => {
    let low = 0;
    let high = breaks.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (breaks[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return low + 1;
  };
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ---------- HTML pages ----------

function pageLinks(text) {
  const links = [];
  // Attributes are capped at 4,000 characters: a file of unclosed tags would otherwise be re-read from every "<a".
  const tag = /<(a|link|script|img|source|iframe|form|area)\b([^>]{0,4000})>/gi;
  for (const found of text.matchAll(tag)) {
    const name = found[1].toLowerCase();
    const attr = name === "form" ? "action" : ["script", "img", "source", "iframe"].includes(name) ? "src" : "href";
    const value = new RegExp(`\\b${attr}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(found[2]);
    if (value) links.push({ url: value[2].trim(), index: found.index, kind: name === "a" || name === "area" || name === "form" ? "page" : name === "iframe" ? "embed" : "asset" });
  }
  // Script navigation with a literal target: location.href = "x.html", window.location.assign('x.html').
  for (const found of text.matchAll(/\blocation(?:\.href)?\s*=\s*(["'])([^"'\n]+)\1|\blocation\.(?:assign|replace)\(\s*(["'])([^"'\n]+)\3/g)) {
    links.push({ url: (found[2] || found[4]).trim(), index: found.index, kind: "page" });
  }
  return links;
}

const idsOf = (text) => new Set([...text.matchAll(/\b(?:id|name)\s*=\s*(["'])([^"']+)\1/gi)].map((found) => found[2]));

function checkPages(files, read, add) {
  const pages = files.filter((file) => PAGE.test(file));
  const fileSet = new Set(files);
  const inbound = new Map(pages.map((page) => [page, 0]));
  const outbound = new Map(pages.map((page) => [page, 0]));
  const embedded = new Set();
  let checked = 0;
  // The folder that holds the top-level index.html is where "/" most likely points when the site is served.
  const siteRoots = ["", ...pages.filter((page) => /(^|\/)index\.html?$/i.test(page)).map((page) => path.posix.dirname(page)).filter((dir) => dir !== ".").sort((a, b) => a.length - b.length).slice(0, 1)];
  const resolveTarget = (page, url) => {
    const clean = decode(url.split("#")[0].split("?")[0]);
    if (clean === "") return { file: page, absolute: false };
    const absolute = clean.startsWith("/");
    // "/" may also mean the page's public/ folder, which Vite and Create React App serve at the site root.
    const candidates = absolute ? [...siteRoots, path.posix.join(path.posix.dirname(page), "public")].map((base) => path.posix.join(base, clean)) : [path.posix.join(path.posix.dirname(page), clean)];
    for (const candidate of candidates) {
      let normal = path.posix.normalize(candidate).replace(/^\/+/, "");
      if (normal === "." || normal === "./") normal = "";
      if (normal.startsWith("..")) continue;
      const folder = normal.replace(/\/$/, "");
      const options = normal === "" ? ["index.html", "index.htm"] : [normal, `${folder}/index.html`, `${folder}/index.htm`, `${normal}.html`];
      for (const option of options) if (fileSet.has(option)) return { file: option, absolute };
    }
    return { file: null, absolute, shown: clean };
  };
  for (const page of pages) {
    const text = read(page);
    if (!text) continue;
    const scripts = /<script\b/i.test(text);
    const lineAt = lineFinder(text);
    for (const link of pageLinks(text)) {
      const url = link.url;
      if (!url || EXTERNAL.test(url) || DYNAMIC.test(url) || url === "#" || url.startsWith("#!")) continue;
      checked += 1;
      const line = lineAt(link.index);
      const target = resolveTarget(page, url);
      if (!target.file) {
        add("broken-link", page, line, target.absolute ? "needs a human" : "certain", `${url} does not exist${target.absolute ? " (a link starting with / depends on where the site is served from)" : ""}`);
        continue;
      }
      if (link.kind === "embed" && inbound.has(target.file)) {
        embedded.add(target.file);
        inbound.set(target.file, inbound.get(target.file) + 1);
      }
      if (link.kind === "page" && target.file !== page && inbound.has(target.file)) {
        inbound.set(target.file, inbound.get(target.file) + 1);
        outbound.set(page, outbound.get(page) + 1);
      }
      const fragment = url.includes("#") ? decode(url.split("#")[1]) : "";
      if (fragment && PAGE.test(target.file)) {
        const targetText = read(target.file) || "";
        if (!idsOf(targetText).has(fragment)) add("broken-anchor", page, line, /<script\b/i.test(targetText) || scripts ? "needs a human" : "certain", `#${fragment} matches no id on ${target.file}`);
      }
    }
  }
  // Only full pages count for dead ends and orphans; a single page site has nowhere to go and nothing to come from.
  // A page shown inside another page (an iframe) is reached through that page and needs no way back of its own.
  const full = pages.filter((page) => /<body\b|<html\b/i.test(read(page) || "") && !NOT_A_SITE_PAGE.test(page));
  if (full.length > 1) {
    // The entry is the top index page: the one at the root, or else the shallowest one. Nothing has to link to it.
    const indexes = full.filter((page) => /(^|\/)index\.html?$/i.test(page)).sort((a, b) => a.split("/").length - b.split("/").length);
    const entries = new Set(indexes.length ? indexes.filter((page) => page.split("/").length === indexes[0].split("/").length) : []);
    for (const page of full) {
      if (outbound.get(page) === 0 && !embedded.has(page) && !APP_SHELL.test(read(page) || "")) add("dead-end", page, 1, "needs a human", "no link to another page of the site");
      if (inbound.get(page) === 0 && !entries.has(page)) add("orphan", page, 1, "needs a human", "no other page links here");
    }
  }
  return { pages: pages.length, links: checked };
}

// ---------- React Router and Next.js ----------

function knownRoutes(files, read) {
  const routes = new Set();
  const relative = new Set(); // React Router child routes written without a leading "/": relative to a parent route
  let router = null;
  for (const file of files) {
    // Next.js: pages/ and app/ folders, with or without src/.
    const pages = /^(?:src\/)?pages\/(.+)\.(jsx|tsx|js|ts|mdx)$/.exec(file);
    if (pages && !/^(?:_app|_document|_error|api\/)/.test(pages[1])) {
      router = "Next.js";
      routes.add(`/${pages[1].replace(/(^|\/)index$/, "")}`.replace(/\/$/, "") || "/");
      continue;
    }
    const app = /^(?:src\/)?app\/(?:(.*)\/)?page\.(jsx|tsx|js|ts|mdx)$/.exec(file);
    if (app) {
      router = "Next.js";
      routes.add(`/${(app[1] || "").split("/").filter((part) => !/^\(.*\)$/.test(part)).join("/")}`.replace(/\/$/, "") || "/");
      continue;
    }
    if (!APP_CODE.test(file)) continue;
    const text = read(file) || "";
    if (!/(?:\bfrom\s*|\brequire\(\s*)['"]react-router(?:-dom)?['"]/.test(text)) continue;
    router = router || "React Router";
    for (const found of text.matchAll(/<Route\b[^>]{0,4000}\bpath\s*=\s*["']([^"']*)["']|\bpath\s*:\s*["'`]([^"'`$]*)["'`]/g)) {
      const value = found[1] !== undefined ? found[1] : found[2];
      if (value.startsWith("/")) routes.add(value);
      else if (value === "" || value === "*") routes.add(value === "*" ? "*" : "/");
      else relative.add(value);
    }
  }
  // A relative child route may sit under any parent, so it is also kept as a top-level route of its own.
  for (const value of relative) routes.add(`/${value}`);
  return { router, routes: [...routes], relative: [...relative] };
}

function routeMatches(routes, target) {
  const parts = target.replace(/\/$/, "").split("/");
  return routes.some((route) => {
    if (route === "*" || route === "/*") return true;
    const pattern = route.replace(/\/$/, "").split("/");
    for (let index = 0; index < pattern.length; index += 1) {
      const piece = pattern[index];
      if (piece === "*" || /^\[\[?\.\.\./.test(piece)) return true;
      if (index >= parts.length) return false;
      if (piece.startsWith(":") || /^\[.+\]$/.test(piece) || piece.startsWith("$")) continue;
      if (piece !== parts[index]) return false;
    }
    return pattern.length === parts.length;
  });
}

function checkRoutes(files, read, add) {
  const { router, routes, relative } = knownRoutes(files, read);
  if (!router || routes.length === 0) return { router: null, routes: 0, links: 0, catchAll: false };
  // A catch-all at the top ("*", "/[...slug]") accepts every path, so a link cannot be shown to lead nowhere.
  const catchAll = routes.some((route) => /^\/?\*$|^\/\[\[?\.\.\./.test(route));
  // A link matches a route, or ends with the segments of a relative child route under some parent route.
  const matches = (target) => routeMatches(routes, target) || relative.some((child) => {
    const parts = target.split("/").filter(Boolean);
    const tail = child.split("/").filter(Boolean);
    return tail.length < parts.length && routeMatches([`/${tail.join("/")}`], `/${parts.slice(parts.length - tail.length).join("/")}`) && routeMatches(routes, `/${parts.slice(0, parts.length - tail.length).join("/")}`);
  });
  let checked = 0;
  for (const file of files.filter((name) => APP_CODE.test(name))) {
    const text = read(file) || "";
    const lineAt = lineFinder(text);
    const targets = /<Link\b[^>]{0,4000}\b(?:to|href)\s*=\s*\{?\s*["']([^"']+)["']|<a\b[^>]{0,4000}\bhref\s*=\s*\{?\s*["'](\/[^"']*)["']|\bnavigate\(\s*["']([^"']+)["']|\brouter\.(?:push|replace)\(\s*["']([^"']+)["']|\bredirect\(\s*["'](\/[^"']*)["']|\b(?:href|to)\s*:\s*["'](\/[^"']*)["']/g;
    for (const found of text.matchAll(targets)) {
      const raw = found[1] || found[2] || found[3] || found[4] || found[5] || found[6]; // [6]: menus kept in objects, { href: "/x" }
      if (!raw.startsWith("/") || EXTERNAL.test(raw) || DYNAMIC.test(raw)) continue;
      const target = raw.split("#")[0].split("?")[0] || "/";
      checked += 1;
      if (/\.[a-z0-9]{2,5}$/i.test(target)) continue; // a file under public/, not a route
      if (!matches(target)) add("broken-route", file, lineAt(found.index), "certain", `${raw} is not a route the app defines (${router})`);
    }
  }
  return { router, routes: routes.length, links: checked, catchAll };
}

function wiring(root) {
  const files = walk(root);
  const cache = new Map();
  const read = (rel) => {
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
  const findings = [];
  const seen = new Set();
  const add = (kind, file, line, confidence, what) => {
    const id = `${kind}|${file}|${line}|${what}`;
    if (seen.has(id)) return;
    seen.add(id);
    findings.push({ kind, file, line, confidence, what, fix: FIX[kind] });
  };
  const pages = checkPages(files, read, add);
  const routes = checkRoutes(files, read, add);
  findings.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "certain" ? -1 : 1) || a.file.localeCompare(b.file) || a.line - b.line);
  return { root, pages: pages.pages, pageLinks: pages.links, router: routes.router, routes: routes.routes, routeLinks: routes.links, catchAll: routes.catchAll, findings };
}

function main(argv) {
  const json = argv.includes("--json");
  const rest = argv.filter((arg) => arg !== "--json");
  if (rest.some((arg) => arg.startsWith("-")) || rest.length > 1) throw new UsageError("Usage: uca-wiring-check.cjs [project folder] [--json]");
  const root = path.resolve(rest[0] || ".");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new UsageError(`Not a folder: ${root}`);
  const result = wiring(root);
  if (json) {
    console.log(JSON.stringify(result, null, 1));
    return 0;
  }
  const lines = [`Wiring of ${root}: ${result.pages} page(s), ${result.pageLinks} link(s) checked${result.router ? `; ${result.router}: ${result.routes} route(s), ${result.routeLinks} route link(s) checked` : ""}; ${result.findings.length} finding(s).`];
  if (result.catchAll) lines.push("", "Note: the app has a catch-all route at the top level, which accepts every path, so a link to a missing page cannot be found by reading the code. Check those links in a browser.");
  for (const finding of result.findings) lines.push("", `[${finding.confidence}] ${finding.kind} at ${finding.file}:${finding.line}: ${finding.what}`, `  Fix: ${finding.fix}`);
  lines.push("", "Static reading only: links built at run time are not followed, and lag or loading time is not measured (that needs the page running in a browser).");
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

module.exports = { wiring };
