"use strict";

// Counts import cycles among the project's own source files (relative require/import only).

const fs = require("node:fs");
const path = require("node:path");

const IMPORT = /(?:require\(\s*|from\s+|import\s+)["'](\.{1,2}\/[^"']+)["']/g;
const EXTENSIONS = ["", ".cjs", ".js", ".mjs", ".ts", "/index.js", "/index.cjs"];

function listSources(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(c|m)?(js|ts)$/.test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

function resolve(from, request) {
  const base = path.resolve(path.dirname(from), request);
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Tarjan's strongly connected components; a cycle is a component of two or more files, or a file importing itself.
function countCycles(dir) {
  const files = listSources(dir);
  const edges = new Map(files.map((file) => [file, []]));
  for (const file of files) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(IMPORT)) {
      const target = resolve(file, match[1]);
      if (target && edges.has(target)) edges.get(file).push(target);
    }
  }
  let index = 0;
  const state = new Map();
  const stack = [];
  let cycles = 0;
  const visit = (node) => {
    state.set(node, { index, low: index, onStack: true });
    index += 1;
    stack.push(node);
    for (const next of edges.get(node)) {
      if (!state.has(next)) {
        visit(next);
        state.get(node).low = Math.min(state.get(node).low, state.get(next).low);
      } else if (state.get(next).onStack) {
        state.get(node).low = Math.min(state.get(node).low, state.get(next).index);
      }
    }
    if (state.get(node).low === state.get(node).index) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        state.get(member).onStack = false;
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || edges.get(node).includes(node)) cycles += 1;
    }
  };
  for (const file of files) if (!state.has(file)) visit(file);
  return cycles;
}

module.exports = { countCycles };
