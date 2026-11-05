"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const evalKit = require("../benchmarks/design/design-eval.cjs");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "design", name), "utf8");

function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-deval-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function put(dir, relative, text) {
  fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
  fs.writeFileSync(path.join(dir, relative), text);
}
function capture(args) {
  const out = [];
  const err = [];
  const code = evalKit.main(args, { out: (text) => out.push(text), err: (text) => err.push(text) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("folder names give the prompt number and the variant", () => {
  assert.deepEqual(evalKit.parseName("3-main-modelA"), { prompt: 3, variant: "main-modelA" });
  assert.deepEqual(evalKit.parseName("notes"), { prompt: null, variant: "notes" });
});

test("blind copies outputs under neutral ids, keeps the key apart, and the order is random", () => {
  withDir((dir) => {
    for (const name of ["1-old", "1-new", "2-old", "2-new"]) put(dir, `outputs/${name}/index.html`, `<p>${name}</p>`);
    const sequence = [0.9, 0.1, 0.5, 0.3];
    let call = 0;
    const key = evalKit.blind(path.join(dir, "outputs"), path.join(dir, "blind"), () => sequence[call++]);
    assert.deepEqual(Object.keys(key).sort(), ["A1", "A2", "A3", "A4"]);
    assert.deepEqual(Object.values(key).map((item) => `${item.prompt}-${item.variant}`), ["1-old", "2-old", "2-new", "1-new"]);
    for (const id of Object.keys(key)) assert.ok(fs.existsSync(path.join(dir, "blind", id, "index.html")));
    const folders = fs.readdirSync(path.join(dir, "blind")).filter((name) => name !== "key.json");
    assert.ok(folders.every((name) => /^A\d+$/.test(name)), "no variant name leaks into a folder name");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "blind", "key.json"), "utf8")), key);
  });
});

test("blind does not copy .git or node_modules", () => {
  withDir((dir) => {
    put(dir, "outputs/1-x/index.html", "<p>x</p>");
    put(dir, "outputs/1-x/node_modules/a.js", "x");
    put(dir, "outputs/1-x/.git/config", "x");
    evalKit.blind(path.join(dir, "outputs"), path.join(dir, "blind"));
    assert.equal(fs.existsSync(path.join(dir, "blind", "A1", "node_modules")), false);
    assert.equal(fs.existsSync(path.join(dir, "blind", "A1", ".git")), false);
  });
});

test("auto counts design tells and checks the brief, without scoring anything", () => {
  withDir((dir) => {
    put(dir, "outputs/1-bad/index.html", fixture("template.html"));
    put(dir, "outputs/1-good/index.html", fixture("specific.html"));
    put(dir, "outputs/1-good/DESIGN.md", fixture("DESIGN-good.md"));
    const rows = evalKit.auto(path.join(dir, "outputs"));
    const bad = rows.find((row) => row.name === "1-bad");
    const good = rows.find((row) => row.name === "1-good");
    assert.ok(bad.designTells >= 8 && bad.checkExit === 1);
    assert.equal(bad.briefPresent, false);
    assert.equal(good.designTells, 0);
    assert.deepEqual([good.briefPresent, good.briefProblems], [true, 0]);
  });
});

test("scores must be numbers from 1 to 10 with the expected header", () => {
  const header = "id,d1,d2,d3,d4,d5,d6,d7,d8,overall";
  assert.equal(evalKit.parseCsv(`${header}\nA1,9,9,9,9,9,9,9,9,9\n`)[0].overall, 9);
  assert.throws(() => evalKit.parseCsv(`${header}\nA1,9,9,9,9,9,9,9,9,11\n`), /out of range/);
  assert.throws(() => evalKit.parseCsv(`${header}\nA1,9,9,9,9,9,9,9,9,x\n`), /out of range/);
  assert.throws(() => evalKit.parseCsv("a,b\n1,2\n"), /header/);
});

function rowsFor(scores) {
  return scores.map(([id, overall]) => ({ id, d1: overall, d2: overall, d3: overall, d4: overall, d5: overall, d6: overall, d7: overall, d8: overall, overall }));
}

test("the 9 out of 10 target needs six of eight prompts at a median of 9 or more", () => {
  const key = {};
  const scores = [];
  for (let prompt = 1; prompt <= 8; prompt += 1) {
    key[`A${prompt}`] = { prompt, variant: "kit-modelA" };
    scores.push([`A${prompt}`, prompt <= 6 ? 9 : 7]);
  }
  const [met] = evalKit.summarize(rowsFor(scores), key);
  assert.equal(met.promptsAtTarget, 6);
  assert.equal(met.targetMet, true);
  const short = scores.map(([id, overall]) => [id, id === "A6" ? 8 : overall]);
  assert.equal(evalKit.summarize(rowsFor(short), key)[0].targetMet, false);
});

test("the target is not met when fewer than eight prompts were scored, however high the scores", () => {
  const key = {};
  const scores = [];
  for (let prompt = 1; prompt <= 6; prompt += 1) {
    key[`A${prompt}`] = { prompt, variant: "kit" };
    scores.push([`A${prompt}`, 10]);
  }
  assert.equal(evalKit.summarize(rowsFor(scores), key)[0].targetMet, false);
});

test("variants are reported separately, and an id missing from the key is an error", () => {
  const key = { A1: { prompt: 1, variant: "old" }, A2: { prompt: 1, variant: "new" } };
  const result = evalKit.summarize(rowsFor([["A1", 5], ["A2", 9]]), key);
  assert.deepEqual(result.map((item) => [item.variant, item.medians.overall]), [["new", 9], ["old", 5]]);
  assert.throws(() => evalKit.summarize(rowsFor([["A9", 5]]), key), /not in the key/);
  assert.equal(evalKit.median([1, 9, 5, 7]), 6);
});

test("the commands work end to end and report an unmet target honestly", () => {
  withDir((dir) => {
    for (let prompt = 1; prompt <= 8; prompt += 1) put(dir, `outputs/${prompt}-kit/index.html`, fixture("specific.html"));
    const made = capture(["blind", path.join(dir, "outputs"), path.join(dir, "blind")]);
    assert.equal(made.code, 0, made.err);
    const key = JSON.parse(fs.readFileSync(path.join(dir, "blind", "key.json"), "utf8"));
    const csv = ["id,d1,d2,d3,d4,d5,d6,d7,d8,overall", ...Object.keys(key).map((id) => `${id},6,6,6,6,6,6,6,6,6`)].join("\n");
    fs.writeFileSync(path.join(dir, "scores.csv"), csv);
    const summary = capture(["summary", path.join(dir, "scores.csv"), path.join(dir, "blind", "key.json")]);
    assert.equal(summary.code, 0, summary.err);
    assert.match(summary.out, /kit: 8 outputs over 8 prompts\. Median overall 6; 0 prompt\(s\) at 9 or more\. Target NOT met/);
    assert.match(summary.out, /two different models/);
    assert.equal(capture(["nonsense"]).code, 2);
    assert.equal(capture(["summary", path.join(dir, "missing.csv"), path.join(dir, "blind", "key.json")]).code, 2);
  });
});

test("the rubric, prompts and runbook exist and say the status is not run", () => {
  const dir = path.join(__dirname, "..", "benchmarks", "design");
  const rubric = fs.readFileSync(path.join(dir, "RUBRIC.md"), "utf8");
  assert.match(rubric, /Until scored runs exist, the status is "not run"/);
  assert.match(rubric, /median Overall is 9 or higher on at least 6 of the 8 prompts/);
  assert.equal((fs.readFileSync(path.join(dir, "PROMPTS.md"), "utf8").match(/^\d\. /gm) || []).length, 8);
  assert.match(fs.readFileSync(path.join(dir, "RUNBOOK.md"), "utf8"), /Nothing here has been run/);
});
