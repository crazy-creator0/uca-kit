"use strict";

// The bundled page check: steps are parsed strictly, only local pages are opened, a missing browser falls back to
// static checks that say nothing was run, and (where Playwright and a browser exist) a known focus bug is caught.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { main, parseSteps, resolveTarget, staticChecks } = require("../scripts/uca-page-check.cjs");

const GAME = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>t</title></head>
<body><h1>Score: <span id="score">0</span></h1>
<button id="pause">Pause</button> <button id="restart">Restart</button>
<p id="state">running</p>
<script>
document.getElementById("pause").onclick=()=>{state.textContent=state.textContent==="running"?"paused":"running"};
document.getElementById("restart").onclick=()=>{score.textContent="0";state.textContent="running"};
document.addEventListener("keydown",e=>{if(e.key==="ArrowUp")score.textContent=String(+score.textContent+1)});
</script></body></html>`;

// The steps a user of a game would take: score, pause, then press Space expecting it to stay paused.
const STEPS = "# user steps\npress ArrowUp\nexpect text Score: 1\nclick #pause\nexpect text paused\npress Space\nexpect text paused\n";

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-page-check-"));
  fs.writeFileSync(path.join(dir, "game.html"), GAME);
  fs.writeFileSync(path.join(dir, "steps.txt"), STEPS);
  return dir;
}

async function run(args, cwd, env = {}) {
  const saved = {};
  for (const [key, value] of Object.entries(env)) { saved[key] = process.env[key]; process.env[key] = value; }
  const out = [];
  const err = [];
  try {
    const code = await main(args, { out: (text) => out.push(text), err: (text) => err.push(text), cwd });
    return { code, out: out.join("\n"), err: err.join("\n") };
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

function browserAvailable() {
  try {
    require.resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

test("steps are parsed strictly: every kind, comments skipped, unknown lines and long waits refused", () => {
  const { steps, errors } = parseSteps("# c\nclick #a\ntype #name Ada Lovelace\npress Enter\nwait 200\nexpect text Saved\nexpect visible .row\nexpect count li 3\nexpect focus #name\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(steps.map((step) => step.kind), ["click", "type", "press", "wait", "expect-text", "expect-visible", "expect-count", "expect-focus"]);
  assert.equal(steps[1].text, "Ada Lovelace");
  assert.equal(steps[6].count, 3);
  const bad = parseSteps("clik #a\nwait 9000\n");
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[0], /line 1: not a step/);
  assert.match(bad.errors[1], /line 2: wait is at most 2000 ms/);
});

test("only local pages are opened: a live site, another scheme or a missing file is refused", async () => {
  const dir = project();
  assert.equal(resolveTarget("http://localhost:5173/app").file, null);
  assert.equal(resolveTarget("http://127.0.0.1:8080/").file, null);
  assert.throws(() => resolveTarget("https://example.com/"), /Only local pages/);
  assert.throws(() => resolveTarget("ftp://localhost/x"), /Only http, https or a file path/);
  assert.throws(() => resolveTarget("missing.html", dir), /No such file/);
  fs.writeFileSync(path.join(dir, "notes.txt"), "x");
  assert.throws(() => resolveTarget("notes.txt", dir), /must be an \.html page/);
  const refused = await run(["https://example.com/"], dir);
  assert.equal(refused.code, 2);
});

test("without a browser it runs static checks, says the steps were not run, and never claims a pass", async () => {
  const dir = project();
  const result = await run(["game.html", "--steps", "steps.txt"], dir, { UCA_PAGE_CHECK_NO_BROWSER: "1" });
  assert.equal(result.code, 0);
  assert.match(result.out, /static checks only: no browser/);
  assert.match(result.out, /6 step\(s\) not run/);
  assert.match(result.out, /STATIC ONLY \(nothing was run in a browser\)/);
  assert.doesNotMatch(result.out, /^PASSED/m);
});

test("static checks can fail: a missing lang, viewport, alt or label is caught", () => {
  const { results } = staticChecks("<html><body><img src=a.png><input id=q></body></html>");
  assert.deepEqual(results.map((item) => item.ok), [false, false, false, false]);
  const good = staticChecks('<html lang="en"><meta name="viewport" content="x"><img src=a alt=""><label for="q">Q</label><input id="q"></html>');
  assert.deepEqual(good.results.map((item) => item.ok), [true, true, true, true]);
});

test("in a browser it catches a pause button that Space presses again, and reports focus", { skip: !browserAvailable() && "Playwright is not installed here" }, async (t) => {
  const dir = project();
  const result = await run(["game.html", "--steps", "steps.txt"], dir);
  if (result.code === 3 || /no browser/.test(result.out)) return t.skip("no browser could start");
  assert.equal(result.code, 1);
  assert.match(result.out, /keyboard focus stays on #pause: Space or Enter will press it again/);
  assert.match(result.out, /FAIL\s+line 7: expect text "paused" \(not on the page\)/);
  assert.match(result.out, /FAILED: \d+ passed, 1 failed/);
  // The same page with focus moved off the button passes.
  fs.writeFileSync(path.join(dir, "game.html"), GAME.replace('state.textContent==="running"?"paused":"running"};', 'state.textContent==="running"?"paused":"running";document.activeElement.blur()};'));
  const fixed = await run(["game.html", "--steps", "steps.txt"], dir);
  assert.equal(fixed.code, 0, fixed.out);
  assert.match(fixed.out, /PASSED: \d+ passed, 0 failed, 0 note\(s\)\./);
});

test("the user check points to the page check, and standard and full install it; the model still writes the steps", () => {
  const root = path.join(__dirname, "..");
  const check = fs.readFileSync(path.join(root, ".agents/skills/testing-and-code-review/parts/user-check.md"), "utf8");
  assert.match(check, /write the user's steps from the plan as a steps file in `\.uca-workspace\/` and run `node scripts\/uca-page-check\.cjs <page> --steps <file>`/);
  assert.match(check, /write your own only for what its steps cannot express/);
  const tiers = JSON.parse(fs.readFileSync(path.join(root, ".agents/tiers.json"), "utf8"));
  for (const tier of ["standard", "full"]) assert.ok(tiers[tier].include.includes("scripts/uca-page-check.cjs"), tier);
  assert.ok(!tiers.lite.include.includes("scripts/uca-page-check.cjs"), "lite ships no workflows or testing skill");
});
