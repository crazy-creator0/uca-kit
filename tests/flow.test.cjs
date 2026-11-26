"use strict";

// The flow between skills: a Read first block's "Next:" line names the skill that follows. Every name must exist, a
// cycle is allowed only when each of its edges is conditional ("if ..."), and no chain runs longer than four skills.
// A skill with no Next line ends at R-FINISH, the shared rule every task ends with.

const test = require("node:test");
const assert = require("node:assert/strict");
const { flowChains, flowEdges, flowProblems } = require("../scripts/uca-context-report.cjs");

test("the kit's flow is sound: names exist, cycles are conditional, chains are short", () => {
  const { names, edges } = flowEdges();
  assert.ok(Object.keys(edges).length >= 8, "the flow has at least eight handoffs");
  assert.deepEqual(flowProblems(names, edges), []);
  for (const item of flowChains()) assert.ok(item.tokens > 0 && item.chain.length <= 4, item.chain.join(" > "));
});

test("the checks can fail: a missing name, a self-loop, an unconditional cycle and a long chain are each caught", () => {
  const names = ["a", "b", "c", "d", "e"];
  const edge = (to, conditional = false) => ({ to, conditional });
  assert.deepEqual(flowProblems(names, { a: [edge("zz")] }), ['a: Next names "zz", which is not a skill or workflow']);
  assert.ok(flowProblems(names, { a: [edge("a", true)] }).includes("a: Next names itself"));
  assert.ok(flowProblems(names, { a: [edge("b")], b: [edge("a", true)] }).some((line) => /^unconditional cycle: /.test(line)));
  assert.deepEqual(flowProblems(names, { a: [edge("b", true)], b: [edge("a", true)] }), [], "a cycle of conditional edges is allowed");
  assert.ok(flowProblems(names, { a: [edge("b")], b: [edge("c")], c: [edge("d")], d: [edge("e")] }).some((line) => /^chain too long \(5\): a > b > c > d > e$/.test(line)));
});
