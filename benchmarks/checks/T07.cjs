"use strict";
const assert = require("node:assert/strict");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

finish(checks([
  ["two clicks show 2", () => {
    const { createStore, createQuantityControl } = load(dir, "src/quantity-control.cjs");
    const store = createStore({ count: 0 });
    const control = createQuantityControl(store);
    control.increment();
    control.increment();
    assert.equal(control.render(), "Qty: 2");
  }],
  ["a change made elsewhere is not overwritten", () => {
    const { createStore, createQuantityControl } = load(dir, "src/quantity-control.cjs");
    const store = createStore({ count: 0, note: "a" });
    const control = createQuantityControl(store);
    store.setState({ count: 5, note: "b" });
    control.increment();
    assert.deepEqual(store.getState(), { count: 6, note: "b" });
  }],
  ["subscribers are told on every click", () => {
    const { createStore, createQuantityControl } = load(dir, "src/quantity-control.cjs");
    const store = createStore({ count: 0 });
    const seen = [];
    store.subscribe((state) => seen.push(state.count));
    const control = createQuantityControl(store);
    control.increment();
    control.increment();
    assert.deepEqual(seen, [1, 2]);
  }],
  ["the suite still passes", () => green(dir)]
]));
