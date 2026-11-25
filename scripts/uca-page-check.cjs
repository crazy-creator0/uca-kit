#!/usr/bin/env node
"use strict";

// Page check: open a page the way its user would, run a few written steps, and report in plain text.
//
//   node scripts/uca-page-check.cjs <page.html | http://localhost:PORT/path> [--steps steps.txt] [--widths 390,1280]
//
// A steps file has one step per line ("#" starts a comment). The model writes the user's own steps here,
// so the checks stay specific to the task; this script only runs them:
//   click <selector>               type <selector> <text>        press <key>          wait <ms, at most 2000>
//   expect text <text>             expect visible <selector>     expect count <selector> <n>
//   expect focus <selector>        (which element has keyboard focus now)
//
// Built in, at each width: page errors, console errors, horizontal overflow, images without alt, form controls
// and buttons without a name, and a note when a clicked button keeps keyboard focus (Space or Enter would press
// it again, a common pause or restart bug in games).
//
// Uses Playwright when it is already installed; it never installs anything. Without a browser it runs static
// checks on a local HTML file and says the steps were not run. It opens local pages only: a file, or localhost,
// 127.0.0.1 or [::1]. It prints selectors, counts and positions, not page text, apart from text the steps name.
// Exit codes: 0 every check passed, 1 a check failed, 2 usage error, 3 the page could not be opened.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_WAIT_MS = 2000;
const MAX_STEPS = 60;
const MAX_LINES = 20;
const DEFAULT_WIDTHS = [390, 1280];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function usage() {
  return `uca-page-check — open a local page like its user, run written steps, report in plain text

  node scripts/uca-page-check.cjs <page.html | http://localhost:PORT/path> [--steps steps.txt] [--widths 390,1280]

Steps file, one per line:
  click <selector> | type <selector> <text> | press <key> | wait <ms>
  expect text <text> | expect visible <selector> | expect count <selector> <n> | expect focus <selector>

Local pages only. Uses Playwright if it is installed; otherwise static checks, and the steps are not run.
Exit codes: 0 passed, 1 a check failed, 2 usage error, 3 the page could not be opened.`;
}

function parseArgs(argv) {
  const options = { target: null, steps: null, widths: DEFAULT_WIDTHS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--steps") {
      if (i + 1 >= argv.length) throw new Error("--steps needs a file");
      options.steps = argv[(i += 1)];
    } else if (arg === "--widths") {
      if (i + 1 >= argv.length) throw new Error("--widths needs numbers, such as 390,1280");
      const widths = argv[(i += 1)].split(",").map((item) => Number(item.trim()));
      if (!widths.length || widths.some((width) => !Number.isInteger(width) || width < 200 || width > 3840)) throw new Error("--widths takes whole numbers from 200 to 3840");
      options.widths = widths.slice(0, 3);
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (options.target) throw new Error(`Only one page, got "${options.target}" and "${arg}"`);
    else options.target = arg;
  }
  if (!options.target) throw new Error("A page is required: a local HTML file or a localhost address");
  return options;
}

// A local page only: never a live site.
function resolveTarget(target, cwd = process.cwd()) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
    let url;
    try {
      url = new URL(target);
    } catch {
      throw new Error(`Not a valid address: ${target}`);
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http, https or a file path");
    if (!LOCAL_HOSTS.has(url.hostname)) throw new Error(`Only local pages (localhost, 127.0.0.1, [::1]); not ${url.hostname}`);
    return { url: url.href, file: null };
  }
  const file = path.resolve(cwd, target);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`No such file: ${target}`);
  if (!/\.html?$/i.test(file)) throw new Error("A file target must be an .html page");
  return { url: pathToFileURL(file).href, file };
}

function parseSteps(text) {
  const steps = [];
  const errors = [];
  text.replace(/\r\n/g, "\n").split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const number = index + 1;
    let match;
    if ((match = /^click\s+(.+)$/.exec(line))) steps.push({ number, kind: "click", selector: match[1] });
    else if ((match = /^type\s+(\S+)\s+(.+)$/.exec(line))) steps.push({ number, kind: "type", selector: match[1], text: match[2] });
    else if ((match = /^press\s+(\S+)$/.exec(line))) steps.push({ number, kind: "press", key: match[1] });
    else if ((match = /^wait\s+(\d+)$/.exec(line))) {
      const ms = Number(match[1]);
      if (ms > MAX_WAIT_MS) errors.push(`line ${number}: wait is at most ${MAX_WAIT_MS} ms`);
      else steps.push({ number, kind: "wait", ms });
    } else if ((match = /^expect\s+text\s+(.+)$/.exec(line))) steps.push({ number, kind: "expect-text", text: match[1] });
    else if ((match = /^expect\s+visible\s+(.+)$/.exec(line))) steps.push({ number, kind: "expect-visible", selector: match[1] });
    else if ((match = /^expect\s+count\s+(.+)\s+(\d+)$/.exec(line))) steps.push({ number, kind: "expect-count", selector: match[1], count: Number(match[2]) });
    else if ((match = /^expect\s+focus\s+(.+)$/.exec(line))) steps.push({ number, kind: "expect-focus", selector: match[1] });
    else errors.push(`line ${number}: not a step: ${line.slice(0, 60)}`);
  });
  if (steps.length > MAX_STEPS) errors.push(`at most ${MAX_STEPS} steps, got ${steps.length}`);
  return { steps, errors };
}

function describe(step) {
  switch (step.kind) {
    case "click": return `click ${step.selector}`;
    case "type": return `type ${step.selector}`;
    case "press": return `press ${step.key}`;
    case "wait": return `wait ${step.ms}`;
    case "expect-text": return `expect text "${step.text}"`;
    case "expect-visible": return `expect visible ${step.selector}`;
    case "expect-count": return `expect count ${step.selector} ${step.count}`;
    case "expect-focus": return `expect focus ${step.selector}`;
    default: return step.kind;
  }
}

// Static checks need no browser: they read the HTML text of a local file.
function staticChecks(html) {
  const results = [];
  const tags = (name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => match[0]);
  const attr = (tag, name) => new RegExp(`\\s${name}\\s*=`, "i").test(tag);
  const ids = new Set([...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
  results.push({ ok: /<html\b[^>]*\slang\s*=/i.test(html), text: "the page declares a language (<html lang>)" });
  results.push({ ok: /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html), text: "the page sets a viewport for phones" });
  const noAlt = tags("img").filter((tag) => !attr(tag, "alt")).length;
  results.push({ ok: noAlt === 0, text: noAlt ? `${noAlt} image(s) without alt` : "every image has alt" });
  const unlabeled = tags("input").filter((tag) => !/type\s*=\s*["']?(hidden|submit|button)/i.test(tag))
    .filter((tag) => !attr(tag, "aria-label") && !attr(tag, "aria-labelledby") && !(/\sid\s*=\s*["']([^"']+)/i.exec(tag) && new RegExp(`for\\s*=\\s*["']${(/\sid\s*=\s*["']([^"']+)/i.exec(tag) || [])[1]}["']`, "i").test(html))).length;
  results.push({ ok: unlabeled === 0, text: unlabeled ? `${unlabeled} input(s) without a label` : "every input has a label" });
  return { results, ids };
}

async function loadPlaywright() {
  if (process.env.UCA_PAGE_CHECK_NO_BROWSER === "1") return null;
  try {
    return require("playwright");
  } catch {
    return null;
  }
}

async function launch(playwright) {
  try {
    return await playwright.chromium.launch();
  } catch {
    try {
      return await playwright.chromium.launch({ channel: "chrome" });
    } catch {
      return null;
    }
  }
}

// Built-in checks run inside the page; they return counts and selectors, never page text.
function pageFacts() {
  // A control has a name when one of the usual sources gives it words a screen reader can say.
  const named = (element) => Boolean(
    (element.getAttribute("aria-label") || "").trim() ||
    element.getAttribute("aria-labelledby") ||
    (element.getAttribute("title") || "").trim() ||
    (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) ||
    element.closest("label") ||
    (["BUTTON"].includes(element.tagName) || element.getAttribute("role") === "button" ? (element.textContent || "").trim() : "") ||
    (["submit", "button", "reset"].includes(element.type) && element.tagName === "INPUT" ? (element.value || "").trim() : "")
  );
  const unnamed = [...document.querySelectorAll("button, input:not([type=hidden]), select, textarea, [role=button]")].filter((element) => !named(element)).length;
  return {
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    imagesWithoutAlt: [...document.images].filter((image) => !image.hasAttribute("alt")).length,
    unnamed
  };
}

function focusFacts() {
  const element = document.activeElement;
  if (!element || element === document.body) return { tag: "body", button: false };
  const name = element.id ? `#${element.id}` : element.tagName.toLowerCase();
  return { tag: name, button: element.tagName === "BUTTON" || element.getAttribute("role") === "button" };
}

async function runSteps(page, steps, report) {
  for (const step of steps) {
    const where = `line ${step.number}: ${describe(step)}`;
    try {
      if (step.kind === "click") {
        await page.click(step.selector, { timeout: 3000 });
        const focus = await page.evaluate(focusFacts);
        report.pass(where);
        if (focus.button) report.note(`after line ${step.number}, keyboard focus stays on ${focus.tag}: Space or Enter will press it again`);
      } else if (step.kind === "type") {
        await page.fill(step.selector, step.text, { timeout: 3000 });
        report.pass(where);
      } else if (step.kind === "press") {
        await page.keyboard.press(step.key);
        report.pass(where);
      } else if (step.kind === "wait") {
        await page.waitForTimeout(step.ms);
        report.pass(where);
      } else if (step.kind === "expect-text") {
        const found = await page.evaluate((text) => document.body.innerText.includes(text), step.text);
        report.check(found, where, "not on the page");
      } else if (step.kind === "expect-visible") {
        const visible = await page.isVisible(step.selector);
        report.check(visible, where, "not visible");
      } else if (step.kind === "expect-count") {
        const count = await page.locator(step.selector).count();
        report.check(count === step.count, where, `found ${count}`);
      } else if (step.kind === "expect-focus") {
        const focused = await page.evaluate((selector) => { const target = document.querySelector(selector); return Boolean(target) && document.activeElement === target; }, step.selector);
        const focus = await page.evaluate(focusFacts);
        report.check(focused, where, `focus is on ${focus.tag}`);
      }
    } catch (error) {
      report.fail(where, String(error.message || error).split("\n")[0].slice(0, 100));
    }
  }
}

function makeReport() {
  const lines = [];
  let failed = 0;
  let passed = 0;
  let notes = 0;
  return {
    pass(text) { passed += 1; lines.push({ kind: "ok", text }); },
    fail(text, why) { failed += 1; lines.push({ kind: "FAIL", text: why ? `${text} (${why})` : text }); },
    check(ok, text, why) { if (ok) this.pass(text); else this.fail(text, why); },
    note(text) { notes += 1; lines.push({ kind: "note", text }); },
    heading(text) { lines.push({ kind: "", text }); },
    get failed() { return failed; },
    print(out) {
      // Failures and notes first, then as many passes as fit: the reader needs the problems.
      const important = lines.filter((line) => line.kind === "FAIL" || line.kind === "note" || line.kind === "");
      const shown = important.length > MAX_LINES ? important.slice(0, MAX_LINES) : lines.length > MAX_LINES ? important : lines;
      for (const line of shown) out(line.kind ? `${line.kind.padEnd(4)}  ${line.text}` : line.text);
      const hidden = lines.length - shown.length;
      if (hidden > 0) out(`(${hidden} more line(s) not shown, all of them passes or headings)`);
      const verdict = failed ? "FAILED" : this.staticOnly ? "STATIC ONLY (nothing was run in a browser)" : "PASSED";
      out(`${verdict}: ${passed} passed, ${failed} failed, ${notes} note(s).`);
    }
  };
}

async function main(argv = process.argv.slice(2), { out = console.log, err = console.error, cwd = process.cwd() } = {}) {
  if (argv.includes("--help") || argv.includes("-h")) {
    out(usage());
    return 0;
  }
  let options;
  let target;
  let steps = [];
  try {
    options = parseArgs(argv);
    target = resolveTarget(options.target, cwd);
    if (options.steps) {
      const stepsFile = path.resolve(cwd, options.steps);
      if (!fs.existsSync(stepsFile)) throw new Error(`No such steps file: ${options.steps}`);
      const parsed = parseSteps(fs.readFileSync(stepsFile, "utf8"));
      if (parsed.errors.length) throw new Error(`Steps file: ${parsed.errors.slice(0, 5).join("; ")}`);
      steps = parsed.steps;
    }
  } catch (error) {
    err(`Error: ${error.message}\n\nRun with --help for usage.`);
    return 2;
  }

  const report = makeReport();
  const playwright = await loadPlaywright();
  const browser = playwright ? await launch(playwright) : null;

  if (!browser) {
    if (!target.file) {
      err("Error: no browser is available (Playwright is not installed or cannot start), and a localhost page cannot be read without one.");
      return 3;
    }
    report.staticOnly = true;
    report.heading("static checks only: no browser (Playwright is not installed or cannot start); steps not run");
    const { results, ids } = staticChecks(fs.readFileSync(target.file, "utf8"));
    for (const result of results) report.check(result.ok, result.text);
    for (const step of steps.filter((item) => item.selector && /^#[\w-]+$/.test(item.selector))) {
      report.check(ids.has(step.selector.slice(1)), `line ${step.number}: ${step.selector} exists in the HTML (not run)`, "no element with that id");
    }
    if (steps.length) report.note(`${steps.length} step(s) not run: hand them to the user, or install a browser tool with the user's agreement`);
    report.print(out);
    return report.failed ? 1 : 0;
  }

  try {
    for (const width of options.widths) {
      report.heading(`width ${width}px`);
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error.message || error).split("\n")[0].slice(0, 100)));
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().split("\n")[0].slice(0, 100)); });
      try {
        await page.goto(target.url, { waitUntil: "load", timeout: 15000 });
      } catch (error) {
        err(`Error: the page could not be opened: ${String(error.message || error).split("\n")[0]}`);
        return 3;
      }
      // Steps run once, at the first width; the other widths check layout only.
      if (width === options.widths[0]) await runSteps(page, steps, report);
      const facts = await page.evaluate(pageFacts);
      report.check(facts.overflow === 0, "no horizontal overflow", `${facts.overflow}px wider than the window`);
      report.check(facts.imagesWithoutAlt === 0, "every image has alt", `${facts.imagesWithoutAlt} without alt`);
      report.check(facts.unnamed === 0, "every control has a name", `${facts.unnamed} without a label or text`);
      report.check(pageErrors.length === 0, "no page errors", pageErrors[0]);
      report.check(consoleErrors.length === 0, "no console errors", consoleErrors[0]);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  report.print(out);
  return report.failed ? 1 : 0;
}

if (require.main === module) main().then((code) => { process.exitCode = code; });

module.exports = { main, parseArgs, parseSteps, resolveTarget, staticChecks };
