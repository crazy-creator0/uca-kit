"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const detect = require("../bin/detect.cjs");
const cli = require("../bin/cli.cjs");

const root = path.join(__dirname, "..");
const CLI = path.join(root, "bin", "cli.cjs");
const cleanEnv = () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

test("detection reports real values, each marked known", () => {
  const env = detect.detectEnvironment();
  assert.equal(env.arch.known, true);
  assert.equal(env.cpuCores.known, true);
  assert.ok(env.totalMemoryMB.value > 0);
  assert.equal(env.node.value, process.versions.node);
});

test("a value that cannot be read is unknown, never a number", () => {
  const broken = {
    platform: () => { throw new Error("denied"); },
    release: () => "x",
    arch: () => { throw new Error("denied"); },
    cpus: () => [],
    totalmem: () => NaN,
    freemem: () => { throw new Error("denied"); }
  };
  const env = detect.detectEnvironment({ os: broken, readFile: () => { throw new Error("denied"); } });
  for (const key of ["platform", "arch", "cpuCores", "totalMemoryMB", "freeMemoryMB"]) {
    assert.equal(env[key].known, false, key);
    assert.equal(env[key].value, null, key);
  }
  assert.match(detect.describeEnvironment(env).join("\n"), /unknown \(/);
});

test("container limits: a number, no limit, or unknown", { skip: process.platform !== "linux" }, () => {
  const limit = (text) => detect.detectEnvironment({ readFile: () => text }).containerMemoryLimitMB;
  assert.deepEqual(limit(String(512 * 1024 * 1024)), { value: 512, known: true });
  assert.deepEqual(limit("max"), { value: null, known: true });
  assert.deepEqual(limit(String(2 ** 62)), { value: null, known: true });
  assert.equal(detect.detectEnvironment({ readFile: () => { throw new Error("no file"); } }).containerMemoryLimitMB.known, false);
});

test("the recommendation follows the stated context only, and unknown means standard", () => {
  assert.equal(detect.recommendTier({ context: 4000 }).tier, "lite");
  assert.equal(detect.recommendTier({ context: 8000 }).tier, "lite");
  assert.equal(detect.recommendTier({ context: 8001 }).tier, "standard");
  assert.equal(detect.recommendTier({ context: 32000 }).tier, "standard");
  assert.equal(detect.recommendTier({ context: 32001 }).tier, "full");
  const unknown = detect.recommendTier({});
  assert.equal(unknown.tier, "standard");
  assert.equal(unknown.basis, "unknown");
  assert.equal(detect.recommendTier({ context: 4000 }).basis, "known");
});

test("detection never reads hardware to decide the tier: memory changes nothing", () => {
  assert.deepEqual(detect.recommendTier({ context: 4000, totalMemoryMB: 1048576 }), detect.recommendTier({ context: 4000 }));
  assert.equal(detect.recommendTier({ totalMemoryMB: 1 }).tier, "standard");
  assert.equal(detect.recommendTier({ context: 100000, totalMemoryMB: 1 }).tier, "full");
  assert.equal(detect.recommendTier({ context: 100000, freeMemoryMB: 1, cpuCores: 1 }).tier, "full");
});

// The privacy promises, checked on the source. A static check cannot prove behaviour, so it sits next to the real tests above.
const source = fs.readFileSync(path.join(root, "bin", "detect.cjs"), "utf8");
const FORBIDDEN = [
  [/process\.env/, "reads environment variables"],
  [/require\(["'](?:node:)?(?:http|https|net|dns|dgram|tls|child_process|worker_threads)["']\)/, "can reach the network or run programs"],
  [/\bfetch\(|XMLHttpRequest|WebSocket/, "network call"],
  [/writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync/, "writes to disk"],
  [/process\.cwd\(\)|readdirSync|opendirSync/, "looks at the project or lists folders"]
];
test("the detector source has no environment, network, disk-write or project access", () => {
  for (const [pattern, why] of FORBIDDEN) assert.doesNotMatch(source, pattern, why);
});

test("the only files it reads are the two container limit files", () => {
  const reads = [...source.matchAll(/readFile(?:Sync)?\(([^)]*)\)/g)].map((match) => match[1].trim());
  assert.deepEqual(reads.filter((arg) => arg !== "file, \"utf8\""), []);
  assert.equal(reads.length, 1);
  assert.deepEqual(detect.CGROUP_LIMIT_FILES, ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]);
});

test("the privacy check can fail: forbidden code is caught", () => {
  assert.match(`${source}\nconst key = process.env.API_KEY;`, FORBIDDEN[0][0]);
  assert.match(`${source}\nrequire("node:https")`, FORBIDDEN[1][0]);
  assert.match(`${source}\nfs.writeFileSync("x", "y")`, FORBIDDEN[3][0]);
});

function init(args, projectRoot) {
  return spawnSync(process.execPath, [CLI, "init", projectRoot, "--platform", "generic", "--yes", ...args], { encoding: "utf8", env: cleanEnv() });
}

test("--auto-tier with no context installs standard, shows the machine, and says why", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-auto-"));
  try {
    const run = init(["--auto-tier"], dir);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Detected on this machine/);
    assert.match(run.stdout, /Recommended tier: standard \(unknown context\)/);
    assert.match(run.stdout, /do not tell how large the model's context is/);
    assert.equal(cli.recordedTier(dir), "standard");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--auto-tier uses the stated context, and an explicit --tier always wins", () => {
  const small = fs.mkdtempSync(path.join(os.tmpdir(), "uca-auto-"));
  const explicit = fs.mkdtempSync(path.join(os.tmpdir(), "uca-auto-"));
  try {
    assert.equal(init(["--auto-tier", "--context", "6000"], small).status, 0);
    assert.equal(cli.recordedTier(small), "lite");
    assert.equal(init(["--auto-tier", "--context", "6000", "--tier", "full"], explicit).status, 0);
    assert.equal(cli.recordedTier(explicit), "full");
  } finally {
    fs.rmSync(small, { recursive: true, force: true });
    fs.rmSync(explicit, { recursive: true, force: true });
  }
});

test("--auto-tier never changes the tier of an existing install", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-auto-"));
  try {
    assert.equal(init(["--tier", "lite"], dir).status, 0);
    const before = fs.readFileSync(path.join(dir, ".uca", "manifest.json"), "utf8");
    const run = init(["--auto-tier", "--context", "100000"], dir);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /already has the lite tier installed, so that tier is kept/);
    assert.equal(cli.recordedTier(dir), "lite");
    assert.equal(fs.readFileSync(path.join(dir, ".uca", "manifest.json"), "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--context alone is still display only", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-auto-"));
  try {
    const run = init(["--context", "6000", "--tier", "full"], dir);
    assert.match(run.stdout, /suggestion only/);
    assert.equal(cli.recordedTier(dir), "full");
    assert.doesNotMatch(run.stdout, /Detected on this machine/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
