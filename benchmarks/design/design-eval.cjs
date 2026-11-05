#!/usr/bin/env node
"use strict";

// Helpers for the design scoring round. They hide which variant made an output, count what the automatic design checks
// report, and summarize human scores. Nothing here judges design quality; the scores come from a person.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const check = require("../../scripts/uca-design-check.cjs");

const CRITERIA = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "overall"];
const TARGET = { overall: 9, promptsNeeded: 6, promptsTotal: 8 };

function outputFolders(root) {
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

// Folder names look like "<prompt-number>-<variant>".
function parseName(name) {
  const match = /^(\d+)-(.+)$/.exec(name);
  return match ? { prompt: Number(match[1]), variant: match[2] } : { prompt: null, variant: name };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name === ".git" || entry.name === "node_modules") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

function blind(root, out, random = () => crypto.randomInt(0, 1_000_000) / 1_000_000) {
  const names = outputFolders(root);
  const order = names.map((name) => ({ name, key: random() })).sort((a, b) => a.key - b.key).map((item) => item.name);
  const key = {};
  order.forEach((name, index) => {
    const id = `A${index + 1}`;
    copyDir(path.join(root, name), path.join(out, id));
    key[id] = parseName(name);
  });
  fs.writeFileSync(path.join(out, "key.json"), `${JSON.stringify(key, null, 2)}\n`);
  return key;
}

function auto(root) {
  return outputFolders(root).map((name) => {
    const folder = path.join(root, name);
    const lines = [];
    const code = check.run([folder, "--json"], { out: (text) => lines.push(text), err: () => {} });
    let findings = null;
    try {
      findings = JSON.parse(lines.join("\n")).findings;
    } catch {
      findings = null;
    }
    const briefFile = path.join(folder, "DESIGN.md");
    const brief = fs.existsSync(briefFile) ? check.checkBrief(fs.readFileSync(briefFile, "utf8")) : null;
    return { name, ...parseName(name), checkExit: code, designTells: findings, briefPresent: brief !== null, briefProblems: brief ? brief.length : null };
  });
}

function parseCsv(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(",").map((cell) => cell.trim()));
  if (!header || header[0] !== "id") throw new Error('scores.csv must start with the header "id,d1,...,d8,overall"');
  return rows.map((cells) => {
    const row = Object.fromEntries(header.map((name, index) => [name, cells[index]]));
    for (const name of CRITERIA) {
      const value = Number(row[name]);
      if (!Number.isFinite(value) || value < 1 || value > 10) throw new Error(`score out of range 1-10: ${row.id} ${name}="${row[name]}"`);
      row[name] = value;
    }
    return row;
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Per variant: every criterion's median, how many prompts scored 9 or more overall, and whether the target is met.
function summarize(rows, key) {
  const byVariant = new Map();
  for (const row of rows) {
    const who = key[row.id];
    if (!who) throw new Error(`id ${row.id} is not in the key`);
    if (!byVariant.has(who.variant)) byVariant.set(who.variant, []);
    byVariant.get(who.variant).push({ ...row, prompt: who.prompt });
  }
  return [...byVariant.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([variant, list]) => {
    const medians = Object.fromEntries(CRITERIA.map((name) => [name, median(list.map((row) => row[name]))]));
    const prompts = new Set(list.map((row) => row.prompt));
    const reached = [...prompts].filter((prompt) => median(list.filter((row) => row.prompt === prompt).map((row) => row.overall)) >= TARGET.overall).length;
    return { variant, outputs: list.length, prompts: prompts.size, medians, promptsAtTarget: reached, targetMet: prompts.size >= TARGET.promptsTotal && reached >= TARGET.promptsNeeded };
  });
}

function main(argv, io = { out: (text) => console.log(text), err: (text) => console.error(text) }) {
  const [command, ...args] = argv;
  try {
    if (command === "blind" && args.length === 2) {
      const key = blind(path.resolve(args[0]), path.resolve(args[1]));
      io.out(`Wrote ${Object.keys(key).length} blind outputs to ${args[1]} and key.json (do not open it until you have scored).`);
      return 0;
    }
    if (command === "auto" && args.length === 1) {
      io.out(JSON.stringify(auto(path.resolve(args[0])), null, 2));
      return 0;
    }
    if (command === "summary" && args.length === 2) {
      const result = summarize(parseCsv(fs.readFileSync(args[0], "utf8")), JSON.parse(fs.readFileSync(args[1], "utf8")));
      for (const item of result) {
        io.out(`${item.variant}: ${item.outputs} outputs over ${item.prompts} prompts. Median overall ${item.medians.overall}; ${item.promptsAtTarget} prompt(s) at 9 or more. Target ${item.targetMet ? "MET" : "NOT met"} (needs ${TARGET.promptsNeeded} of ${TARGET.promptsTotal}).`);
        io.out(`  medians: ${CRITERIA.map((name) => `${name}=${item.medians[name]}`).join(" ")}`);
      }
      io.out("The target needs two different models to meet it. A variant name that mixes both models hides that: label them separately.");
      return 0;
    }
  } catch (error) {
    io.err(`Error: ${error.message}`);
    return 2;
  }
  io.err("Usage: design-eval.cjs blind <outputs> <out> | auto <outputs> | summary <scores.csv> <key.json>");
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { CRITERIA, TARGET, auto, blind, main, median, parseCsv, parseName, summarize };
