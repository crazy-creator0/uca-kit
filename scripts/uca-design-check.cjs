#!/usr/bin/env node
"use strict";

// Looks for common template tells in UI source files and prints each one with its file, line and evidence.
// Read-only. It is a set of text heuristics, not a design judge: a clean result does not mean the design is good,
// and a finding is a question to answer ("what is the product reason for this?"), not an automatic defect.

const fs = require("node:fs");
const path = require("node:path");

const EXTENSIONS = new Set([".html", ".htm", ".css", ".scss", ".jsx", ".tsx", ".vue", ".svelte", ".astro"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage", ".agents", ".claude"]);
const MAX_FILES = 400;
const MAX_BYTES = 400_000;

const GENERIC_FONTS = new Set(["inter", "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "arial", "helvetica", "helvetica neue", "ui-sans-serif", "sans-serif", "serif", "monospace", "ui-monospace", "ui-serif", "inherit", "initial"]);
const GENERIC_WORDS = /\b(seamless(?:ly)?|empower(?:s|ing)?|revolutioni[sz](?:e|es|ing)|supercharge[sd]?|unleash(?:es|ed)?|next[- ]gen(?:eration)?|cutting[- ]edge|all[- ]in[- ]one|game[- ]chang(?:er|ing)|take your \w+ to the next level|lorem ipsum)\b/gi;
const GENERIC_CTA = /<(?:a|button)[^>]*>\s*(get started|learn more|start (?:your )?free trial|sign up (?:now|today|for free))\s*</gi;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function hueOf(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.12) return null; // grey: no hue
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function* matches(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let match;
  while ((match = re.exec(text))) {
    yield match;
    if (match[0] === "") re.lastIndex += 1;
  }
}

// Each rule returns findings [{ line, evidence }] for one file's text. `why` says what to ask about it.
const RULES = [
  {
    id: "default-typeface",
    why: "No typeface was chosen: the page uses only the framework or system default.",
    check(text) {
      const found = [];
      const families = [...matches(text, /font-family\s*:\s*([^;}{]+)/i)];
      const tailwind = [...matches(text, /\bfont-(?:sans|serif|mono)\b/)];
      const names = [];
      for (const family of families) {
        for (const part of family[1].split(",")) names.push(part.replace(/!important/gi, "").replace(/["']/g, "").trim().toLowerCase());
      }
      const named = names.filter((name) => name && !name.startsWith("var(") && !GENERIC_FONTS.has(name));
      const importsFont = /fonts\.googleapis\.com|@font-face|fonts\.bunny\.net|@fontsource|next\/font/i.test(text);
      if (named.length === 0 && !importsFont && (families.length || tailwind.length)) {
        found.push({ line: families.length ? lineOf(text, families[0].index) : lineOf(text, tailwind[0].index), evidence: families.length ? families[0][0].trim() : tailwind[0][0] });
      }
      return found;
    }
  },
  {
    id: "purple-blue-gradient",
    why: "A purple-to-blue gradient is the most common AI-template look. Keep it only if the brand or product needs it.",
    check(text) {
      const found = [];
      for (const gradient of matches(text, /(?:linear|radial|conic)-gradient\([^;{}]*\)/i)) {
        const hues = [...matches(gradient[0], /#[0-9a-f]{3,6}\b/i)].map((hex) => hueOf(hex[0])).filter((hue) => hue !== null);
        const purple = hues.some((hue) => hue >= 255 && hue <= 310);
        const blue = hues.some((hue) => hue >= 195 && hue < 255);
        const named = /\b(purple|violet|indigo|fuchsia)\b/i.test(gradient[0]) && /\b(blue|cyan|pink|indigo)\b/i.test(gradient[0]);
        if ((purple && blue) || named) found.push({ line: lineOf(text, gradient.index), evidence: gradient[0].slice(0, 90) });
      }
      for (const tw of matches(text, /\bfrom-(?:purple|violet|indigo|fuchsia)-\d{2,3}\b[^"'`]*\bto-(?:blue|indigo|pink|cyan|purple|violet)-\d{2,3}\b/)) {
        found.push({ line: lineOf(text, tw.index), evidence: tw[0].slice(0, 90) });
      }
      return found;
    }
  },
  {
    id: "glow-or-blob",
    why: "Large blurred glows and blobs are decoration. Say what they communicate, or remove them.",
    check(text) {
      const found = [];
      for (const match of matches(text, /\bblur-(?:2xl|3xl)\b|\bblur-\[(?:[4-9]\d|\d{3,})px\]|filter\s*:\s*blur\((?:[4-9]\d|\d{3,})px\)/)) {
        found.push({ line: lineOf(text, match.index), evidence: match[0] });
      }
      for (const match of matches(text, /box-shadow\s*:[^;}]*\b0\s+0\s+(?:[4-9]\d|\d{3,})px\s+[^;}]*(?:#[0-9a-f]{3,6}|rgba?\([^)]*\))/i)) {
        found.push({ line: lineOf(text, match.index), evidence: match[0].slice(0, 90) });
      }
      return found;
    }
  },
  {
    id: "generic-copy",
    why: "This wording could belong to any product. Replace it with what this product actually does.",
    check(text) {
      const found = [];
      for (const match of matches(text, GENERIC_WORDS)) found.push({ line: lineOf(text, match.index), evidence: match[0] });
      for (const match of matches(text, GENERIC_CTA)) found.push({ line: lineOf(text, match.index), evidence: `button "${match[1]}"` });
      return found;
    }
  },
  {
    id: "three-up-cards",
    why: "A row of three equal feature cards is a template layout. Keep it only if there are exactly three things of equal weight.",
    check(text) {
      const found = [];
      for (const match of matches(text, /\b(?:md:|lg:|sm:)?grid-cols-3\b|grid-template-columns\s*:\s*repeat\(\s*3\s*,\s*(?:1fr|minmax)/)) {
        found.push({ line: lineOf(text, match.index), evidence: match[0] });
      }
      return found;
    }
  },
  {
    id: "emoji-icons",
    why: "Emoji used as icons or decoration. Use real icons, or none, if they do not help the user decide.",
    check(text) {
      const body = text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, "");
      const all = [...matches(body, EMOJI)];
      return all.length >= 2 ? [{ line: lineOf(text, text.indexOf(all[0][0])), evidence: `${all.length} emoji, first: ${all[0][0]}` }] : [];
    }
  },
  {
    id: "uniform-rounding-and-shadow",
    why: "Every surface has the same big radius or shadow. Choose one radius and one shadow rule on purpose.",
    check(text) {
      const rounded = [...matches(text, /\brounded-(?:2xl|3xl)\b/)];
      const shadows = [...matches(text, /\bshadow-(?:lg|xl|2xl)\b/)];
      const found = [];
      if (rounded.length >= 6) found.push({ line: lineOf(text, rounded[0].index), evidence: `${rounded.length} uses of rounded-2xl/3xl` });
      if (shadows.length >= 6) found.push({ line: lineOf(text, shadows[0].index), evidence: `${shadows.length} uses of shadow-lg/xl/2xl` });
      return found;
    }
  },
  {
    id: "no-design-tokens",
    why: "Many literal colors and no variables: the palette was not defined once. Write the brief's hex values as tokens.",
    check(text) {
      const colors = new Set([...matches(text, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i)].map((match) => match[0].toLowerCase()));
      const tokens = /var\(--|:root\s*{|--[a-z][\w-]*\s*:|theme\s*[:(]|tailwind\.config/i.test(text);
      return colors.size >= 8 && !tokens ? [{ line: 1, evidence: `${colors.size} different hex colors and no custom properties or theme` }] : [];
    }
  }
];

// ---------- the written brief (DESIGN.md) ----------

const BRIEF_FIELDS = ["Job", "Direction", "Type", "Color", "Space", "Layout", "Stack", "Signature", "Departure"];
const VAGUE = new Set(["modern", "clean", "sleek", "minimal", "minimalist", "beautiful", "professional", "simple", "elegant", "nice", "good", "intuitive", "user-friendly", "stylish", "fresh", "polished", "premium", "slick"]);
const STACK_WORDS = /\b(vanilla|html|javascript|typescript|react|preact|vite|astro|next|svelte|sveltekit|vue|nuxt|solid|tailwind|css|node|express|fastapi|django|flask|sqlite|postgres|localstorage|indexeddb)\b/i;

function parseBrief(text) {
  const fields = {};
  const lines = text.split(/\r?\n/);
  let heading = null;
  for (const line of lines) {
    const head = /^#{1,4}\s*([A-Za-z ]+?)\s*$/.exec(line);
    if (head) {
      heading = BRIEF_FIELDS.find((name) => name.toLowerCase() === head[1].trim().toLowerCase()) || null;
      continue;
    }
    const inline = /^\s*(?:[-*]\s*)?\**([A-Za-z]+)\**\s*:\s*\**\s*(.*)$/.exec(line);
    const name = inline && BRIEF_FIELDS.find((field) => field.toLowerCase() === inline[1].toLowerCase());
    if (name) {
      fields[name] = `${fields[name] || ""} ${inline[2]}`.trim();
      heading = null;
    } else if (heading && line.trim()) {
      fields[heading] = `${fields[heading] || ""} ${line.replace(/^\s*[-*]\s*/, "")}`.trim();
    }
  }
  return fields;
}

// Returns problems; an empty list means the brief states concrete choices. It cannot say the choices are good.
function checkBrief(text) {
  const fields = parseBrief(text);
  const problems = [];
  for (const name of BRIEF_FIELDS) if (!fields[name]) problems.push(`${name}: missing`);
  const words = (value) => value.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const vagueOnly = (value) => { const list = words(value).filter((word) => word.length > 2 && !["and", "the", "with", "for", "but", "not"].includes(word)); return list.length > 0 && list.every((word) => VAGUE.has(word)); };
  for (const name of ["Direction", "Layout", "Signature", "Departure", "Job"]) {
    if (fields[name] && vagueOnly(fields[name])) problems.push(`${name}: only vague words ("${fields[name]}"); say the concrete choice`);
  }
  if (fields.Job && words(fields.Job).length < 5) problems.push("Job: too short; say who uses it, in what moment, and the one main action");
  for (const name of ["Signature", "Departure"]) {
    if (fields[name] && words(fields[name]).length < 4) problems.push(`${name}: too short to be a real choice; say what it is and where it appears`);
  }
  if (fields.Color) {
    const hexes = new Set([...matches(fields.Color, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i)].map((hex) => hex[0].toLowerCase()));
    if (hexes.size < 4) problems.push(`Color: ${hexes.size} hex value(s); give at least 4 (background, text, accent, status)`);
  }
  if (fields.Type) {
    const names = fields.Type.split(/[,;+&/]|\band\b/i).map((part) => part.replace(/\([^)]*\)/g, "").replace(/\b(headings?|body|display|labels?|numbers?|figures?|data|text|all|for|in|bold|heavy|weights?|\d+)\b/gi, "").replace(/[^A-Za-z0-9 -]/g, "").trim().toLowerCase()).filter((part) => part.length >= 3);
    const named = names.filter((name) => !GENERIC_FONTS.has(name) && !VAGUE.has(name));
    if (named.length === 0) problems.push("Type: no named typeface; name the actual fonts, not the framework default");
  }
  if (fields.Space && !/\d/.test(fields.Space)) problems.push("Space: no number; give a spacing step and a corner radius");
  if (fields.Stack && !STACK_WORDS.test(fields.Stack)) problems.push("Stack: no tool named; say what it is built with and why");
  return problems;
}

function runBrief(file, io) {
  let text;
  try {
    text = fs.readFileSync(path.resolve(file), "utf8");
  } catch {
    io.err(`Cannot read the brief: ${file}`);
    return 2;
  }
  const problems = checkBrief(text);
  if (problems.length === 0) {
    io.out("Brief: every field states a concrete choice. That does not prove the choices are good.");
    return 0;
  }
  for (const problem of problems) io.out(`  - ${problem}`);
  io.out(`\n${problems.length} problem(s) in the brief. Replace adjectives with choices (fonts, hex values, a named signature element).`);
  return 1;
}

function listFiles(target, out) {
  if (out.length >= MAX_FILES) return;
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(target).toLowerCase()) && stat.size <= MAX_BYTES) out.push(target);
    return;
  }
  if (!stat.isDirectory() || SKIP_DIRS.has(path.basename(target))) return;
  for (const name of fs.readdirSync(target).sort()) listFiles(path.join(target, name), out);
}

function checkText(text) {
  const findings = [];
  for (const rule of RULES) {
    for (const hit of rule.check(text)) findings.push({ rule: rule.id, line: hit.line, evidence: hit.evidence, why: rule.why });
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

function run(argv, io = { out: (text) => console.log(text), err: (text) => console.error(text) }) {
  const briefAt = argv.indexOf("--brief");
  if (briefAt !== -1) return runBrief(argv[briefAt + 1] || "DESIGN.md", io);
  const json = argv.includes("--json");
  const targets = argv.filter((arg) => !arg.startsWith("--"));
  if (argv.includes("--help") || targets.length === 0) {
    io.out("Usage: node scripts/uca-design-check.cjs <file-or-folder...> [--json]\n       node scripts/uca-design-check.cjs --brief DESIGN.md   (checks that a written brief states concrete choices)\nReports common template tells in UI source files. Exit 0: none found, 1: findings, 2: nothing to check.\nA clean result does not prove the design is good.");
    return targets.length === 0 && !argv.includes("--help") ? 2 : 0;
  }
  const files = [];
  for (const target of targets) listFiles(path.resolve(target), files);
  if (files.length === 0) {
    io.err("No UI files (.html .css .jsx .tsx .vue .svelte .astro) found to check.");
    return 2;
  }
  const report = files.map((file) => ({ file: path.relative(process.cwd(), file) || file, findings: checkText(fs.readFileSync(file, "utf8")) }));
  const total = report.reduce((sum, item) => sum + item.findings.length, 0);
  if (json) {
    io.out(JSON.stringify({ filesChecked: files.length, findings: total, report }, null, 2));
  } else {
    for (const item of report) for (const f of item.findings) io.out(`${item.file}:${f.line}  [${f.rule}]  ${f.evidence}\n    ${f.why}`);
    io.out(`\n${files.length} file(s) checked, ${total} possible template tell(s).`);
    io.out(total ? "Each one needs a product reason or a change. This is a heuristic: it cannot judge the design as a whole." : "No template tells found. That does not prove the design is good; look at the result.");
  }
  return total ? 1 : 0;
}

if (require.main === module) process.exitCode = run(process.argv.slice(2));

module.exports = { BRIEF_FIELDS, RULES, checkBrief, checkText, hueOf, parseBrief, run };
