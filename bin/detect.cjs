"use strict";

// Read-only look at the machine, used to explain a tier choice. It reads nothing from the project, never looks at
// environment variables, makes no network request and stores nothing. A value it cannot read is reported as unknown.
// Hardware is supporting information only: it says nothing reliable about how much context a model has.

const fs = require("node:fs");
const os = require("node:os");

const CGROUP_LIMIT_FILES = ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"];
const MB = 1024 * 1024;
// A cgroup file reports a huge number (or "max") when there is no limit; anything above this is treated as no limit.
const NO_LIMIT_BYTES = 2 ** 50;

function known(value) {
  return { value, known: true };
}
function unknown(reason) {
  return { value: null, known: false, reason };
}
function attempt(read, reason) {
  try {
    const value = read();
    return value === undefined || value === null || Number.isNaN(value) ? unknown(reason) : known(value);
  } catch {
    return unknown(reason);
  }
}

function containerMemoryLimit(readFile) {
  if (process.platform !== "linux") return unknown("only detected on Linux");
  for (const file of CGROUP_LIMIT_FILES) {
    let text;
    try {
      text = readFile(file, "utf8").trim();
    } catch {
      continue;
    }
    if (text === "max") return known(null);
    const bytes = Number(text);
    if (!Number.isFinite(bytes)) continue;
    return known(bytes >= NO_LIMIT_BYTES ? null : Math.round(bytes / MB));
  }
  return unknown("no container limit file could be read");
}

// `deps` lets tests supply fake readers. Every field is { value, known } so "not detected" is never mistaken for a number.
function detectEnvironment(deps = {}) {
  const osApi = deps.os || os;
  const readFile = deps.readFile || fs.readFileSync;
  return {
    platform: attempt(() => `${osApi.platform()} ${osApi.release()}`, "could not read the operating system"),
    arch: attempt(() => osApi.arch(), "could not read the CPU architecture"),
    cpuCores: attempt(() => osApi.cpus().length || null, "could not read the CPU count"),
    totalMemoryMB: attempt(() => Math.round(osApi.totalmem() / MB), "could not read total memory"),
    freeMemoryMB: attempt(() => Math.round(osApi.freemem() / MB), "could not read free memory"),
    containerMemoryLimitMB: containerMemoryLimit(readFile),
    node: known(process.versions.node)
  };
}

// The model's context window can only come from a value the user gave. Nothing here guesses it from hardware.
function recommendTier({ context = null } = {}) {
  if (context === null || context === undefined) {
    return {
      tier: "standard",
      basis: "unknown",
      reason: "The model's context size is unknown, so the safe default is used. Pass --context <tokens> if you know it."
    };
  }
  const tier = context <= 8000 ? "lite" : context <= 32000 ? "standard" : "full";
  return { tier, basis: "known", reason: `You said the model has about ${context} tokens of context.` };
}

function describeEnvironment(environment) {
  const show = (field, format = (value) => String(value)) => (field.known ? format(field.value) : `unknown (${field.reason})`);
  const memory = (field) => show(field, (value) => (value === null ? "no limit" : `${value} MB`));
  return [
    `Operating system: ${show(environment.platform)}`,
    `CPU: ${show(environment.arch)}, ${show(environment.cpuCores, (value) => `${value} cores`)}`,
    `Memory: ${show(environment.totalMemoryMB, (value) => `${value} MB total`)}, ${show(environment.freeMemoryMB, (value) => `${value} MB free`)}`,
    `Container memory limit: ${memory(environment.containerMemoryLimitMB)}`,
    `Node.js: ${show(environment.node)}`
  ];
}

module.exports = { CGROUP_LIMIT_FILES, describeEnvironment, detectEnvironment, recommendTier };
