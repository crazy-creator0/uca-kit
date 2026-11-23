"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-wiring-check.cjs");
const { wiring } = require(SCRIPT);

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-wiring-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}
const page = (body) => `<!doctype html><html lang="en"><head><title>t</title></head><body>${body}</body></html>\n`;
const found = (root) => wiring(root).findings.map((item) => `${item.kind} ${item.file}:${item.line} ${item.confidence}`);

test("A -> B and back: a two-page site that links both ways has no findings", () => {
  assert.deepEqual(found(project({ "index.html": page('<a href="about.html">About</a>'), "about.html": page('<a href="./">Home</a>') })), []);
});

test("broken links: a missing page, image or script is certain; folder links and .html-less links resolve", () => {
  const root = project({
    "index.html": page('<a href="about.html">a</a>\n<img src="img/logo.png" alt="">\n<script src="app.js"></script>\n<a href="docs/">d</a>\n<a href="contact">c</a>'),
    "docs/index.html": page('<a href="../">home</a>'),
    "contact.html": page('<a href="index.html">home</a>')
  });
  assert.deepEqual(found(root), ["broken-link index.html:1 certain", "broken-link index.html:2 certain", "broken-link index.html:3 certain"]);
});

test("external links, mailto, build placeholders and template strings are not followed", () => {
  const root = project({ "index.html": page('<a href="https://example.com/x">x</a><a href="mailto:a@b.c">m</a><link href="%PUBLIC_URL%/favicon.ico" rel="icon"><a href="${base}/x">t</a><a href="//cdn.example.com/a.js">c</a>') });
  assert.deepEqual(found(root), []);
});

test("anchors: a missing id is certain on a page without scripts and needs a human when scripts may add it", () => {
  const root = project({
    "index.html": page('<a href="guide.html#install">i</a>\n<a href="guide.html#setup">s</a>\n<a href="#top">t</a><h1 id="top">x</h1>'),
    "guide.html": page('<h2 id="install">Install</h2><a href="index.html">back</a>'),
    "app.html": page('<a href="#later">l</a><a href="index.html">back</a><script>document.body.setAttribute("i" + "d", ["la", "ter"].join(""))</script>')
  });
  assert.deepEqual(found(root), ["broken-anchor index.html:2 certain", "broken-anchor app.html:1 needs a human", "orphan app.html:1 needs a human"].sort((a, b) => (a.includes("certain") ? -1 : 1) - (b.includes("certain") ? -1 : 1) || a.localeCompare(b)));
});

test("links starting with / need a human when missing, and are found in public/ (Vite, Create React App)", () => {
  const root = project({ "frontend/index.html": '<!doctype html><html><head><link rel="icon" href="/favicon.png"><link rel="icon" href="/vite.svg"></head><body><div id="root"></div><script type="module" src="./src/main.tsx"></script></body></html>\n', "frontend/public/favicon.png": "x", "frontend/src/main.tsx": "x" });
  assert.deepEqual(found(root), ["broken-link frontend/index.html:1 needs a human"]);
  assert.match(wiring(root).findings[0].what, /\/vite\.svg does not exist/);
});

test("dead ends and orphans need a human; the top index, embedded pages, app shells and email templates are exempt", () => {
  const root = project({
    "index.html": page('<a href="a.html">a</a><a href="b.html">b</a><iframe src="demo/app.html"></iframe>'),
    "a.html": page("no way back"),
    "b.html": page('<a href="index.html">home</a>'),
    "lonely.html": page('<a href="index.html">home</a>'),
    "demo/app.html": page("an embedded app"),
    "shell/index.html": '<html><body><div id="root"></div><script type="module" src="main.js"></script></body></html>',
    "shell/main.js": "x",
    "emails/welcome.html": page("Welcome")
  });
  assert.deepEqual(found(root), ["dead-end a.html:1 needs a human", "orphan lonely.html:1 needs a human", "orphan shell/index.html:1 needs a human"]);
});

test("React Router: links to undefined routes are certain; params and nested relative routes match", () => {
  const root = project({
    "src/App.jsx": 'import { Route, Routes, Link } from "react-router-dom";\nconst routes = [{ path: "/" }, { path: "/article/:id" }, { path: "settings" }];\n<Route path="/@:username" />\n',
    "src/Nav.jsx": 'import { Link } from "react-router-dom";\n<Link to="/">h</Link>\n<Link to="/article/42">a</Link>\n<Link to="/settings">s</Link>\n<Link to="/profile">p</Link>\n<Link to={`/article/${id}`}>x</Link>\nnavigate("/editor");\n'
  });
  assert.deepEqual(found(root), ["broken-route src/Nav.jsx:5 certain", "broken-route src/Nav.jsx:7 certain"]);
});

test("React Router: a relative child route matches only under a parent route that exists", () => {
  const root = project({
    "src/App.jsx": 'import { Route } from "react-router-dom";\nconst routes = [{ path: "/article/:id", children: [{ path: "edit" }] }];\n',
    "src/Nav.jsx": 'import { Link } from "react-router-dom";\n<Link to="/article/3/edit">e</Link>\n<Link to="/nope/edit/now">n</Link>\n'
  });
  assert.deepEqual(found(root), ["broken-route src/Nav.jsx:3 certain"]);
});

test("Next.js: app and pages routes, route groups, dynamic and catch-all segments", () => {
  const root = project({
    "app/(marketing)/page.tsx": "x",
    "app/(marketing)/pricing/page.tsx": "x",
    "app/blog/[slug]/page.tsx": "x",
    "app/docs/[[...slug]]/page.tsx": "x",
    "pages/about.tsx": "x",
    "components/nav.tsx": 'import Link from "next/link";\n<Link href="/pricing">p</Link>\n<Link href="/blog/hello">b</Link>\n<Link href="/docs/a/b">d</Link>\n<Link href="/about">a</Link>\n<Link href="/careers">c</Link>\n<a href="/logo.svg">l</a>\nrouter.push("/dashboard");\n'
  });
  assert.deepEqual(found(root), ["broken-route components/nav.tsx:6 certain", "broken-route components/nav.tsx:8 certain"]);
});

test("tests, fixtures and symbolic links are not read; the command line rejects bad options", () => {
  const root = project({ "index.html": page('<a href="b.html">b</a>'), "b.html": page('<a href="index.html">i</a>'), "tests/fixtures/bad.html": page('<a href="missing.html">m</a>') });
  fs.symlinkSync(os.tmpdir(), path.join(root, "linked"));
  assert.deepEqual(found(root), []);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" }).status, 2);
});

test("menus kept in objects are checked, and a top-level catch-all is reported instead of a silent pass", () => {
  const menu = { "src/App.jsx": 'import { Route } from "react-router-dom";\n<Route path="/" /><Route path="/billing" />\n', "src/menu.js": 'export const items = [{ title: "Billing", href: "/billing" }, { title: "Team", href: "/team" }];\n' };
  assert.deepEqual(found(project(menu)), ["broken-route src/menu.js:1 certain"]);
  const root = project({ "app/page.tsx": "x", "app/[...slug]/page.tsx": "x", "components/nav.tsx": '<Link href="/anything">a</Link>\n' });
  const result = wiring(root);
  assert.equal(result.catchAll, true);
  assert.deepEqual(result.findings, []);
  assert.match(spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8" }).stdout, /catch-all route at the top level, which accepts every path/);
});

test("crafted files of unclosed tags stay fast (no rescanning to the end of the file from every tag)", () => {
  const repeat = (unit) => { let text = ""; while (text.length < 390_000) text += unit; return text; };
  const root = project({
    "index.html": `<html><body>${repeat('<a href="')}`,
    "shell.html": `<html><body>${repeat("<div id=")}`,
    "src/App.jsx": `import { Route } from "react-router-dom";\n<Route path="/a" />\n${repeat('<Link to="/a')}${repeat("<Route ")}${repeat("<a ")}`
  });
  const started = Date.now();
  wiring(root);
  assert.ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`);
});
