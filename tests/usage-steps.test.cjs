"use strict";

// uca-usage steps: totals a step log or a run sheet. Unknown numbers stay unknown; nothing is written.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "../scripts/uca-usage.cjs");
const { readStepLog, readRunSheet, runFigures } = require(SCRIPT);

const LOG = [
  { time: "2026-11-26T10:00:00.000Z", step: 1, input: 9000, output: 200, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, finish: "tool-calls" },
  { time: "2026-11-26T10:00:01.000Z", afterStep: 1, tool: "read", kind: "read", kit: ".agents/CORE.md" },
  { time: "2026-11-26T10:00:20.000Z", step: 2, input: 500, output: 150, reasoning: 0, cacheRead: 9000, cacheWrite: 0, cost: 0, finish: "tool-calls" },
  { time: "2026-11-26T10:00:21.000Z", afterStep: 2, tool: "read", kind: "read", kit: ".agents/workflows/new-project/small.md" },
  { time: "2026-11-26T10:00:21.500Z", afterStep: 2, tool: "glob", kind: "read" },
  { time: "2026-11-26T10:00:40.000Z", step: 3, input: 800, output: 6000, reasoning: 10, cacheRead: 10000, cacheWrite: 50, cost: 0.002, finish: "tool-calls" },
  { time: "2026-11-26T10:00:41.000Z", afterStep: 3, tool: "write", kind: "write" },
  { time: "2026-11-26T10:00:42.000Z", afterStep: 3, tool: "read", kind: "read" },
  { time: "2026-11-26T10:01:00.000Z", step: 4, input: 300, output: 100, reasoning: 0, cacheRead: 17000, cacheWrite: 0, cost: 0, finish: "tool-calls" },
  { time: "2026-11-26T10:01:01.000Z", afterStep: 4, tool: "bash", kind: "check" },
  { time: "2026-11-26T10:01:30.000Z", step: 5, input: 200, output: 300, reasoning: 0, cacheRead: 17500, cacheWrite: 0, cost: 0, finish: "stop" }
];
const logText = (entries) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";

function tempFile(t, name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-steps-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 10_000 });

test("step log: requests, summed tokens, peak context, wall time, tool kinds", () => {
  const f = runFigures(readStepLog(logText(LOG)));
  assert.equal(f.requests, 5);
  assert.equal(f.replies, 1);
  assert.equal(f.input, 10800);
  assert.equal(f.cacheRead, 53500);
  assert.equal(f.cacheWrite, 50);
  assert.equal(f.inputAll, 64350);
  assert.equal(f.inputAllComplete, true);
  assert.equal(f.output, 6750);
  assert.equal(f.peakContext, 17700);
  assert.equal(f.firstContext, 9000);
  assert.equal(f.wallSeconds, 90);
  assert.deepEqual([f.toolCalls, f.reads, f.writes, f.checks, f.shell], [6, 4, 1, 1, 0]);
  assert.equal(f.readsBeforeFirstWrite, 3);
  assert.equal(f.kitFilesOpened, 2);
});

test("step log: a repeated request line counts once; broken lines are skipped and reported", () => {
  const text = logText([LOG[0], LOG[0], LOG[2]]) + "not json\n[1,2]\n{\"other\":true}\n";
  const parsed = readStepLog(text);
  assert.equal(parsed.requests, 2);
  assert.equal(parsed.skipped, 3);
});

test("step log from before 0.3.7: tool lines without a kind count as unknown, missing finish is not a reply", () => {
  const old = [
    { time: "2026-11-26T10:00:00.000Z", step: 1, input: 100, output: 7, reasoning: 0, cacheRead: 3, cacheWrite: 0, cost: 0 },
    { time: "2026-11-26T10:00:01.000Z", afterStep: 1, tool: "read", kit: ".agents/CORE.md" }
  ];
  const parsed = readStepLog(logText(old));
  assert.equal(parsed.ended.unknown, 1);
  assert.equal(parsed.tools.unknown, 1);
  assert.equal(runFigures(parsed).replies, 0);
});

test("run sheet: per-request rows, unknown cells stay unknown, partial totals are marked", () => {
  const sheet = "# copied by hand\nrequest,count,time,input,cache_read,cache_write,output,context,ended,tools,source\n" +
    "1,,10:00:00,3000,0,0,4000,,tool-calls,write,exact\n" +
    "2,,10:00:30,200,7000,0,100,,tool-calls,shell check,exact\n" +
    "3,,10:01:00,unknown,7300,0,200,,stop,,exact\n";
  const parsed = readRunSheet(sheet);
  const f = runFigures(parsed);
  assert.equal(f.requests, 3);
  assert.equal(f.replies, 1);
  assert.equal(f.input, 3200);
  assert.equal(f.inputAll, 17500);
  assert.equal(f.inputAllComplete, false);
  assert.equal(f.reasoning, null);
  assert.equal(f.cost, null);
  assert.equal(f.peakContext, 7200);
  assert.equal(f.wallSeconds, 60);
  assert.deepEqual([f.toolCalls, f.writes, f.shell, f.checks], [3, 1, 1, 1]);
});

test("run sheet: a totals-only host gives requests, wall time and the context it showed; the rest is unknown", () => {
  const f = runFigures(readRunSheet("request,count,time,input,output,context,source\nall,24,3m,500000,20000,31883,exact\n"));
  assert.equal(f.requests, 24);
  assert.equal(f.wallSeconds, 180);
  assert.equal(f.peakContext, 31883);
  assert.equal(f.firstContext, null);
  assert.equal(f.cacheRead, null);
  assert.equal(f.toolCalls, null);
  assert.equal(f.inputAllComplete, false);
});

test("run sheet: an unknown column is refused with the accepted columns listed", () => {
  assert.throws(() => readRunSheet("request,tokens\n1,5\n"), /request,count,time,input,cache_read,cache_write,output,context,ended,tools,source.*Unknown: tokens/);
});

test("the shipped run-sheet template is a valid, empty sheet", () => {
  const template = fs.readFileSync(path.resolve(__dirname, "../benchmarks/agent-eval/run-sheet.csv"), "utf8");
  assert.equal(readRunSheet(template).requests, 0);
});

test("CLI: one file prints a summary, two print a comparison, --json prints figures, bad use fails", (t) => {
  const log = tempFile(t, "kit.jsonl", logText(LOG));
  const sheet = tempFile(t, "nokit.csv", "request,input,cache_read,cache_write,output,ended,tools\n1,3000,0,0,4000,tool-calls,write\n2,200,7000,0,100,stop,\n");
  const one = run("steps", log);
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /Requests: 5 {2}\(ended in tool calls 4, replies 1/);
  assert.match(one.stdout, /Peak context: 17,700 \(request 5\)/);
  assert.match(one.stdout, /Reads before the first write: 3/);
  const two = run("steps", log, sheet);
  assert.equal(two.status, 0, two.stderr);
  assert.match(two.stdout, /Requests\s+5\s+2\s+\+3 \(\+150%\)/);
  const json = JSON.parse(run("steps", log, "--json").stdout);
  assert.equal(json[0].requests, 5);
  assert.equal(run("steps").status, 1);
  assert.equal(run("steps", log, "--bogus").status, 1);
  assert.equal(run("steps", path.join(os.tmpdir(), "uca-no-such-steps-file.jsonl")).status, 1);
  const empty = tempFile(t, "empty.jsonl", "\n");
  const nothing = run("steps", empty);
  assert.equal(nothing.status, 1);
  assert.match(nothing.stderr, /Nothing to summarize/);
});

test("CLI: steps reads only; it never creates or changes the usage ledger", (t) => {
  const log = tempFile(t, "kit.jsonl", logText(LOG));
  const ledger = path.join(path.dirname(log), "ledger", "usage.json");
  const result = spawnSync(process.execPath, [SCRIPT, "steps", log], { encoding: "utf8", env: { ...process.env, UCA_USAGE_FILE: ledger } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.dirname(ledger)), false);
});
