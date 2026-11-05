"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const SCRIPT = path.join(root, "scripts", "uca-route.cjs");
const { ALL_SKILLS, GUARDRAILS, detectLayers, evaluate, parseArgs, route } = require(SCRIPT);
const tuned = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "routing-cases.json"), "utf8"));
const holdout = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "routing-holdout.json"), "utf8"));
const holdout2 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "routing-holdout-2.json"), "utf8"));
const holdout3 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "routing-holdout-3.json"), "utf8"));
const holdout4 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "routing-holdout-4.json"), "utf8"));

const skillsOnDisk = fs.readdirSync(path.join(root, ".agents", "skills")).sort();
const workflowsOnDisk = fs.readdirSync(path.join(root, ".agents", "workflows")).map((name) => name.replace(/\.md$/, ""));

function cli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 30_000 });
}

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-route-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test("the router knows exactly the skills in the repository", () => {
  assert.deepEqual([...ALL_SKILLS].sort(), skillsOnDisk);
  assert.deepEqual(
    GUARDRAILS.slice().sort(),
    skillsOnDisk.filter((name) => /priority: guardrail/.test(fs.readFileSync(path.join(root, ".agents", "skills", name, "SKILL.md"), "utf8"))).sort()
  );
});

test("there are at least 20 routing cases, including ambiguous and cross-domain ones", () => {
  assert.ok(tuned.length >= 20, `only ${tuned.length} cases`);
  assert.ok(tuned.some((item) => item.primary === "skill-gap-router"), "no ambiguous case");
  assert.ok(tuned.some((item) => item.companion), "no cross-domain case");
  assert.ok(tuned.some((item) => item.options && item.options.tier), "no not-installed case");
  assert.ok(tuned.some((item) => /skip|use the/i.test(item.task)), "no user-override case");
  for (const item of [...tuned, ...holdout, ...holdout2, ...holdout3, ...holdout4]) {
    const valid = [null, undefined, "skill-gap-router", ...skillsOnDisk, ...workflowsOnDisk];
    assert.ok(valid.includes(item.primary), `unknown primary in case: ${item.task}`);
  }
});

test("the tuned cases are all routed as expected", () => {
  const report = evaluate(tuned);
  const misses = report.rows.filter((row) => !row.okPrimary || !row.okCompanion).map((row) => `${row.task} -> ${row.got.join(" + ")} (wanted ${row.want.join(" + ")})`);
  assert.deepEqual(misses, []);
});

test("no task loads more than one primary and one companion, and nothing unneeded is loaded", () => {
  const report = evaluate(tuned);
  assert.ok(report.maxLoadedPerTask <= 2, `a task loaded ${report.maxLoadedPerTask} skills`);
  assert.equal(report.unnecessaryLoads, 0);
});

test("the unseen cases keep their recorded results; a new miss or a fixed one must be recorded on purpose", () => {
  const report = evaluate(holdout);
  const missed = report.rows.filter((row) => !row.okPrimary || !row.okCompanion).map((row) => row.task).sort();
  const recorded = holdout.filter((item) => item.knownMiss).map((item) => item.task).sort();
  assert.deepEqual(missed, recorded);
  for (const item of holdout.filter((entry) => entry.knownMiss)) assert.ok(item.note, `known miss without a reason: ${item.task}`);
});

test("the second unseen set (written for the performance and data skills) keeps its recorded results", () => {
  const report = evaluate(holdout2);
  const missed = report.rows.filter((row) => !row.okPrimary || !row.okCompanion).map((row) => row.task).sort();
  assert.deepEqual(missed, holdout2.filter((item) => item.knownMiss).map((item) => item.task).sort());
  assert.ok(holdout2.length >= 12);
});

test("performance work is told apart from bugs, known database fixes, and data work", () => {
  assert.equal(route("Reduce the p95 latency of the search endpoint").primary.name, "performance-engineering");
  assert.equal(route("Reduce the p95 latency of the search endpoint").companion, null, "performance takes no companion");
  assert.equal(route("Why is the products page so slow?").primary.name, "debugging");
  assert.equal(route("Add an index so the report query runs faster").primary.name, "database-engineering");
  assert.equal(route("Make the app faster").primary.name, "performance-engineering");
});

test("data work is told apart from bugs and from application schemas", () => {
  assert.equal(route("Clean the customers.csv file and fix the date formats").primary.name, "data-engineering-analytics");
  assert.equal(route("The CSV export shows the wrong totals").primary.name, "debugging");
  assert.equal(route("Add a new users table with email and created_at").primary.name, "database-engineering");
});

test("the word 'worker' alone is not Cloudflare; Cloudflare Workers still are", () => {
  assert.equal(route("Reduce memory usage of the image resizing worker").loaded.includes("cloudflare-operations"), false);
  assert.equal(route("Deploy a Cloudflare Worker with a KV namespace").primary.name, "cloudflare-operations");
});

test("the new skills are missing from lite, so they are reported, not guessed; standard installs them", () => {
  assert.equal(route("Reduce the p95 latency of the search endpoint", { tier: "standard" }).loaded.includes("performance-engineering"), true);
  for (const tier of ["lite"]) {
    const result = route("Reduce the p95 latency of the search endpoint", { tier });
    assert.equal(result.loaded.includes("performance-engineering"), false, tier);
    assert.match(result.notes.join(" "), /not installed/, tier);
  }
});

test("greetings, plain questions and documentation edits load nothing", () => {
  for (const task of ["hello!", "What does a mutex do?", "Explain how the router works", "Fix the typo in the README"]) {
    assert.equal(route(task).primary.kind, "none", task);
    assert.equal(route(task).loaded.length, 0, task);
  }
});

test("'the database docs' is a docs edit, not database work; a real schema change is database work", () => {
  assert.equal(route("Fix the typo in the database docs").primary.kind, "none");
  assert.equal(route("Add a nullable column to the orders table").primary.name, "database-engineering");
});

test("a failing test is a bug, not a testing task", () => {
  assert.equal(route("The login test fails after the upgrade").primary.name, "debugging");
  assert.equal(route("Add tests for the login flow").primary.name, "testing-and-code-review");
});

test("a bug takes no companion even when it sits in a screen or an API", () => {
  assert.equal(route("The settings page crashes when the form is empty").companion, null);
  assert.equal(route("The orders API crashes on an empty body").companion, null);
});

test("'API key' is not API work", () => {
  assert.equal(route("Where should I keep the API key?").loaded.includes("backend-api"), false);
  assert.equal(route("Rotate the API key and remove it from the repo").primary.name, "application-security");
});

test("a login endpoint crosses two areas and gets both skills, nothing else", () => {
  const result = route("Add a login endpoint that issues JWTs and hashes passwords");
  assert.deepEqual([...result.loaded].sort(), ["application-security", "backend-api"]);
});

test("the real project stack gates stack-specific skills", () => {
  const backendOnly = { layers: ["backend"] };
  assert.equal(route("Add a page size parameter to the API", backendOnly).loaded.includes("frontend-engineering"), false);
  assert.deepEqual(route("Add a page size parameter to the API", { layers: ["backend", "frontend"] }).loaded.sort(), ["backend-api", "frontend-engineering"]);
});

test("naming a layer outright, or creating one, is never gated away", () => {
  assert.equal(route("Build a React settings screen", { layers: ["backend"] }).primary.name, "frontend-engineering");
  // Creating a whole new page is now routed to the design skill; what matters here is that a front-end skill is still chosen.
  assert.ok(["frontend-engineering", "design-taste-discovery"].includes(route("Create a landing page for the launch", { layers: ["backend"] }).primary.name));
});

test("--root reads manifests to find the real layers", () => {
  const frontend = project({ "package.json": JSON.stringify({ dependencies: { react: "^18", vite: "^5" } }) });
  const backend = project({ "package.json": JSON.stringify({ dependencies: { express: "^4", "better-sqlite3": "^9" } }) });
  const python = project({ "requirements.txt": "flask\n" });
  assert.deepEqual([...detectLayers(frontend)], ["frontend"]);
  assert.deepEqual([...detectLayers(backend)].sort(), ["backend", "database"]);
  assert.deepEqual([...detectLayers(python)], ["backend"]);
  assert.equal(route("Add a page size parameter to the API", { root: backend }).loaded.includes("frontend-engineering"), false);
  assert.equal(detectLayers(path.join(os.tmpdir(), "uca-no-such-dir")).size, 0);
});

test("the user's choice wins; skipping one skill does not skip another", () => {
  assert.equal(route("Use the debugging skill on the slow report").primary.name, "debugging");
  assert.equal(route("Please skip frontend-engineering and use the debugging skill on the failing form").primary.name, "debugging");
});

test("a request to skip application-security is refused only when secrets or credentials are involved", () => {
  const unsafe = route("Store the password in plain text but skip the application-security skill");
  assert.equal(unsafe.primary.name, "application-security");
  assert.match(unsafe.notes.join(" "), /stays, for safety/);
  const harmless = route("Fix the login redirect loop but skip the application-security skill");
  assert.equal(harmless.loaded.includes("application-security"), false);
});

test("a skill that is not installed is reported, never guessed", () => {
  const result = route("Add a column to the users table", { tier: "lite" });
  assert.equal(result.primary.kind, "none");
  assert.match(result.notes.join(" "), /not installed/);
  const forced = route("Use the backend-api skill for this", { tier: "lite" });
  assert.equal(forced.primary.kind, "none");
  assert.match(forced.notes.join(" "), /backend-api is not installed/);
});

test("vague tasks and tasks that span many areas go to the gap router, not to a guess", () => {
  assert.equal(route("Improve this").primary.name, "skill-gap-router");
  assert.equal(route("Add a payment flow: new checkout screen, payment API, orders table, and fraud checks").primary.name, "skill-gap-router");
});

test("workflows are chosen as the primary item and take no companion", () => {
  for (const [task, workflow] of [["Start a new project from scratch", "new-project"], ["Deploy the app to production", "production-deployment"], ["Migrate the app from Express to Fastify", "stack-migration"]]) {
    const result = route(task);
    assert.deepEqual([result.primary.kind, result.primary.name, result.companion], ["workflow", workflow, null]);
    assert.ok(workflowsOnDisk.includes(workflow));
  }
});

test("every task answer gives a one-line reason", () => {
  for (const item of tuned) {
    const result = route(item.task, item.options || {});
    assert.ok(result.reason.length > 0 && !result.reason.includes("\n"), `no one-line reason for: ${item.task}`);
  }
});

test("the CLI prints the choice, supports --json and --tier, and rejects bad input", () => {
  const plain = cli(["The checkout page crashes on an empty cart"]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /Primary: debugging/);
  assert.match(plain.stdout, /Always on: anti-ai-slop, anti-hallucination, skill-gap-router/);
  const json = JSON.parse(cli(["Add an index to the orders table", "--json"]).stdout);
  assert.equal(json.primary.name, "database-engineering");
  assert.match(cli(["Add a column to the users table", "--tier", "lite"]).stdout, /Note: database-engineering is not installed/);
  assert.equal(cli([]).status, 2);
  assert.equal(cli(["x", "--tier", "huge"]).status, 2);
  assert.equal(cli(["x", "--nope"]).status, 2);
  assert.equal(cli(["a", "b"]).status, 2);
  assert.equal(cli(["--help"]).status, 0);
});

test("--eval reports accuracy and unnecessary loading for a case file", () => {
  const result = cli(["--eval", path.join(__dirname, "fixtures", "routing-cases.json"), "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.total, tuned.length);
  assert.equal(report.primaryAccuracy, 1);
  assert.equal(report.unnecessaryLoads, 0);
});

test("parseArgs reads the task and options", () => {
  assert.deepEqual(parseArgs(["task text", "--tier", "lite", "--json"]), { task: "task text", root: null, tier: "lite", profile: null, evalFile: null, json: true, help: false });
});

// Written before the router rule for "create a new app or page" existed. First run: 10 of 16 (all six misses were new-product
// prompts such as "Create a cafe management file", which fell through to the generic fallback). The rule was then added
// and these were re-run, so this set is now tuned: it guards against regressions, it is not evidence of accuracy.
test("new-product prompts reach the design skill, and non-UI work keeps its own skill", () => {
  const report = evaluate(holdout3);
  assert.deepEqual(report.rows.filter((row) => !row.okPrimary || !row.okCompanion).map((row) => row.task), []);
  assert.ok(holdout3.filter((item) => item.primary === "new-project" && item.companion === "design-taste-discovery").length >= 6);
});

// Written after that rule. First run on unseen phrasing: 3 of 10 with a fixed list of nouns, 9 of 10 once the rule was
// widened to "create a new thing" minus code-shaped things. The widening used these misses, so this set is tuned too.
test("a second set of product prompts keeps its recorded result", () => {
  const report = evaluate(holdout4);
  assert.deepEqual(report.rows.filter((row) => !row.okPrimary || !row.okCompanion).map((row) => row.task), []);
});

test("code-shaped and speed requests that say create or build do not go to the design skill", () => {
  for (const task of ["Build a notification service in Go", "Create a script to rename files", "Create a summary of the report", "Build a CLI tool to resize images", "Create a function that parses dates", "Make an API key rotation job", "I need a faster search page", "Make the dashboard load faster", "Create a React component for a date picker"]) {
    const name = route(task).primary.name || "none";
    assert.notEqual(name, "design-taste-discovery", task);
  }
});

test("a whole new product starts the planning workflow with the design skill beside it", () => {
  for (const task of ["create cafe management file", "Make me a todo app", "I need a booking site for my yoga studio"]) {
    const result = route(task);
    assert.deepEqual([result.primary.kind, result.primary.name, result.companion && result.companion.name], ["workflow", "new-project", "design-taste-discovery"], task);
  }
  // A single page, or work inside a project that already has code, is not a new project.
  assert.equal(route("Create a cafe menu page").primary.name, "design-taste-discovery");
  assert.notEqual(route("Create a todo app", { layers: ["frontend"] }).primary.name, "new-project");
  // Where the design skill is not installed the plan still runs and says what is missing.
  const lite = route("create cafe management file", { tier: "lite" });
  assert.equal(lite.primary.name, "new-project");
  assert.equal(lite.companion, null);
  assert.match(lite.notes.join(" "), /design-taste-discovery is not installed/);
});
