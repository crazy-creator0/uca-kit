// Run with: node --test tests/card.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const card = require("../card.js");

const shapeOf = (scene) => ({
  body: scene.body.length,
  sats: scene.sats.map((s) => s.length),
  satOpacity: scene.satOpacity.length,
  bolt: scene.bolt.length
});

test("every weather has the same point structure, so any pair can morph", () => {
  const first = shapeOf(card.buildScene("sunny"));
  for (const w of card.WEATHERS) {
    const scene = card.buildScene(w);
    assert.deepEqual(shapeOf(scene), first, w);
    const nums = [scene.body, ...scene.sats, scene.bolt].flat(2);
    assert.ok(nums.every(Number.isFinite), w + " has a non-number point");
  }
});

test("each drawing stays inside the picture area", () => {
  for (const w of card.WEATHERS) {
    const scene = card.buildScene(w);
    for (const [x, y] of [scene.body, ...scene.sats, scene.bolt].flat()) {
      assert.ok(x >= 0 && x <= 200 && y >= 0 && y <= 160, w + " point out of view: " + x + "," + y);
    }
  }
});

test("a morph starts at the old picture and ends exactly at the new one", () => {
  for (const a of card.WEATHERS) {
    for (const b of card.WEATHERS) {
      const from = card.buildScene(a);
      const to = card.buildScene(b);
      assert.equal(card.smoothPath(card.lerpScene(from, to, 0).body), card.smoothPath(from.body));
      assert.equal(card.smoothPath(card.lerpScene(from, to, 1).body), card.smoothPath(to.body));
      const mid = card.lerpScene(from, to, 0.5);
      assert.match(card.smoothPath(mid.body), /^M[\d. -]+(C[\d. -]+)+Z$/);
      assert.match(card.polygonPath(mid.bolt), /^M[\d. -]+(L[\d. -]+)+Z$/);
    }
  }
});

test("temperature input: accepts normal numbers, rejects junk with a plain message", () => {
  assert.deepEqual(card.parseTemp("12", "C"), { ok: true, value: 12 });
  assert.deepEqual(card.parseTemp(" -3 ", "C"), { ok: true, value: -3 });
  assert.deepEqual(card.parseTemp("12,5", "C"), { ok: true, value: 12.5 });
  assert.deepEqual(card.parseTemp("18°C", "C"), { ok: true, value: 18 });
  assert.deepEqual(card.parseTemp("", "C"), { ok: true, value: null });
  assert.equal(card.parseTemp("warm", "C").ok, false);
  assert.equal(card.parseTemp("<b>9</b>", "C").ok, false);
  assert.equal(card.parseTemp("75", "C").ok, false);
  assert.deepEqual(card.parseTemp("75", "F"), { ok: true, value: 75 });
  assert.match(card.parseTemp("75", "C").message, /-60 to 60/);
});

test("broken saved data falls back to safe values instead of crashing", () => {
  assert.deepEqual(card.normalizeState(null), { weather: "cloudy", temp: null, unit: "C", date: null });
  assert.deepEqual(card.normalizeState({ weather: "hail", temp: "hot", unit: "K", date: "yesterday" }),
    { weather: "cloudy", temp: null, unit: "C", date: null });
  assert.deepEqual(card.normalizeState({ weather: "rainy", temp: "12", unit: "C", date: "2026-11-15" }),
    { weather: "rainy", temp: 12, unit: "C", date: "2026-11-15" });
});

test("the line to paste matches what the card reads back", () => {
  const state = { weather: "stormy", temp: -2, unit: "F", date: "2026-11-15" };
  const line = card.publishLine(state);
  assert.equal(line, 'data-weather="stormy" data-temp="-2" data-unit="F" data-date="2026-11-15"');
  const attrs = Object.fromEntries([...line.matchAll(/data-(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  assert.ok(card.sameState(card.normalizeState(attrs), state));
});

test("today's date is written as year-month-day in local time", () => {
  assert.equal(card.todayIso(new Date(2026, 0, 5)), "2026-01-05");
});
