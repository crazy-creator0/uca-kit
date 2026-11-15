// Weather mood card. Plain JavaScript, no libraries, works from a file:// page.
// The drawing is built from point lists that have the same length in every weather,
// so changing weather can move each point smoothly to its new place (a "morph").
(function () {
  "use strict";

  const WEATHERS = ["sunny", "cloudy", "rainy", "stormy"];
  const LABELS = { sunny: "Sunny", cloudy: "Cloudy", rainy: "Rainy", stormy: "Stormy" };
  const MOODS = {
    sunny: "Windows open, words come easy.",
    cloudy: "A soft, grey, thinking kind of day.",
    rainy: "Tea by the window. Long sentences.",
    stormy: "Stay in. Batten down the drafts."
  };
  const STORAGE_KEY = "weather-mood-card:v1";
  const TEMP_LIMITS = { C: [-60, 60], F: [-76, 140] };

  const BODY_POINTS = 64;
  const SAT_POINTS = 16;
  const SAT_COUNT = 8;
  const BOLT_POINTS = 7;
  const MORPH_MS = 900;

  // ---------- geometry ----------

  // Points around a shape, starting at the top and going clockwise on screen.
  // `inside(x, y)` says whether a point is inside the shape; the shape must be visible from (cx, cy).
  function rayCast(cx, cy, inside, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let t = 130;
      while (t > 0 && !inside(cx + t * dx, cy + t * dy)) t -= 0.5;
      let lo = t;
      let hi = t + 0.5;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (inside(cx + mid * dx, cy + mid * dy)) lo = mid;
        else hi = mid;
      }
      pts.push([cx + lo * dx, cy + lo * dy]);
    }
    return pts;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  }

  function circle(cx, cy, r, n) {
    return rayCast(cx, cy, (x, y) => Math.hypot(x - cx, y - cy) <= r, n);
  }

  // A cloud = a few round puffs on top of a flat rounded base.
  function cloud(cx, cy, puffs, base, n) {
    const [ax, ay, bx, by, br] = base;
    return rayCast(cx, cy, (x, y) =>
      distToSegment(x, y, ax, ay, bx, by) <= br ||
      puffs.some(([px, py, pr]) => Math.hypot(x - px, y - py) <= pr), n);
  }

  // A sun ray: a short rounded bar pointing away from the sun's centre.
  function ray(sx, sy, angle, from, to, halfWidth, n) {
    const ax = sx + from * Math.cos(angle);
    const ay = sy + from * Math.sin(angle);
    const bx = sx + to * Math.cos(angle);
    const by = sy + to * Math.sin(angle);
    return rayCast((ax + bx) / 2, (ay + by) / 2,
      (x, y) => distToSegment(x, y, ax, ay, bx, by) <= halfWidth, n);
  }

  // A raindrop: pointed top, round bottom, optionally leaning (radians).
  function drop(cx, cy, size, lean, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i * 2 * Math.PI) / n;
      const x = size * 0.62 * Math.sin(t) * Math.sin(t / 2);
      const y = -size * Math.cos(t);
      pts.push([
        cx + x * Math.cos(lean) - y * Math.sin(lean),
        cy + x * Math.sin(lean) + y * Math.cos(lean)
      ]);
    }
    return pts;
  }

  const BOLT = [[106, 82], [90, 114], [102, 114], [93, 146], [124, 102], [110, 102], [118, 82]];

  function shrink(points, cx, cy, factor) {
    return points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
  }

  function hiddenSats(cx, cy) {
    const sats = [];
    for (let i = 0; i < SAT_COUNT; i++) sats.push(circle(cx - 21 + i * 6, cy, 1.5, SAT_POINTS));
    return sats;
  }

  function rainSats(left, top, lean) {
    const sats = [];
    for (let i = 0; i < SAT_COUNT; i++) {
      const x = left + i * 10;
      const y = top + (i % 2 ? 18 : 0) + (i % 3 === 2 ? 6 : 0);
      sats.push(drop(x, y, 7, lean, SAT_POINTS));
    }
    return sats;
  }

  // One "scene" per weather. Every scene has the same number of points in the same order.
  function buildScene(weather) {
    const hiddenBolt = shrink(BOLT, 108, 80, 0.04);
    const none = new Array(SAT_COUNT).fill(0);
    const all = new Array(SAT_COUNT).fill(1);
    switch (weather) {
      case "sunny": {
        const sats = [];
        for (let i = 0; i < SAT_COUNT; i++) {
          sats.push(ray(100, 78, -Math.PI / 2 + (i * Math.PI) / 4, 41, 54, 3.6, SAT_POINTS));
        }
        return { body: circle(100, 78, 30, BODY_POINTS), sats, satOpacity: all, bolt: hiddenBolt, boltOpacity: 0 };
      }
      case "cloudy":
        return {
          body: cloud(100, 86, [[72, 88, 20], [98, 70, 28], [129, 84, 22]], [66, 96, 136, 96, 14], BODY_POINTS),
          sats: hiddenSats(100, 90), satOpacity: none, bolt: hiddenBolt, boltOpacity: 0
        };
      case "rainy":
        return {
          body: cloud(99, 68, [[70, 70, 19], [97, 54, 25], [126, 66, 21]], [64, 78, 134, 78, 13], BODY_POINTS),
          sats: rainSats(64, 112, 0), satOpacity: all, bolt: hiddenBolt, boltOpacity: 0
        };
      case "stormy":
        return {
          body: cloud(102, 64, [[66, 66, 21], [94, 50, 27], [126, 58, 25], [148, 72, 15]], [60, 76, 148, 76, 13], BODY_POINTS),
          // slanted drops on both sides of the bolt; two drops hide inside the cloud
          sats: [[60, 118], [72, 136], [82, 114], null, null, [136, 116], [148, 134], [160, 114]].map((p, i) =>
            p ? drop(p[0], p[1], 7, 0.35, SAT_POINTS) : circle(96 + i * 8, 70, 1.5, SAT_POINTS)),
          satOpacity: all.map((v, i) => (i === 3 || i === 4 ? 0 : 1)),
          bolt: BOLT, boltOpacity: 1
        };
      default:
        throw new Error("Unknown weather: " + weather);
    }
  }

  function lerpPoints(a, b, t) {
    return a.map(([x, y], i) => [x + (b[i][0] - x) * t, y + (b[i][1] - y) * t]);
  }

  function lerpScene(a, b, t) {
    return {
      body: lerpPoints(a.body, b.body, t),
      sats: a.sats.map((s, i) => lerpPoints(s, b.sats[i], t)),
      satOpacity: a.satOpacity.map((o, i) => o + (b.satOpacity[i] - o) * t),
      bolt: lerpPoints(a.bolt, b.bolt, t),
      boltOpacity: a.boltOpacity + (b.boltOpacity - a.boltOpacity) * t
    };
  }

  const f = (n) => (Math.round(n * 100) / 100).toString();

  // Smooth closed curve through the points (Catmull-Rom turned into Bezier curves).
  function smoothPath(pts) {
    const n = pts.length;
    let d = "M" + f(pts[0][0]) + " " + f(pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      d += "C" + f(p1[0] + (p2[0] - p0[0]) / 6) + " " + f(p1[1] + (p2[1] - p0[1]) / 6) +
        " " + f(p2[0] - (p3[0] - p1[0]) / 6) + " " + f(p2[1] - (p3[1] - p1[1]) / 6) +
        " " + f(p2[0]) + " " + f(p2[1]);
    }
    return d + "Z";
  }

  function polygonPath(pts) {
    return "M" + pts.map(([x, y]) => f(x) + " " + f(y)).join("L") + "Z";
  }

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------- data ----------

  // Reads a temperature the owner typed. Returns { ok, value } or { ok: false, message }.
  function parseTemp(text, unit) {
    const raw = String(text == null ? "" : text).trim().replace(",", ".").replace(/°\s*[cf]?$/i, "");
    if (raw === "") return { ok: true, value: null };
    if (!/^[-+−]?\d{1,3}(\.\d)?$/.test(raw)) return { ok: false, message: "Type a number, like 12 or -3." };
    const value = Number(raw.replace("−", "-"));
    const [lo, hi] = TEMP_LIMITS[unit] || TEMP_LIMITS.C;
    if (value < lo || value > hi) return { ok: false, message: "That is outside " + lo + " to " + hi + " °" + unit + ". Check the number." };
    return { ok: true, value };
  }

  function isIsoDate(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  // Cleans up a saved or published entry; anything broken falls back to safe values.
  function normalizeState(input) {
    const s = input && typeof input === "object" ? input : {};
    const unit = s.unit === "F" ? "F" : "C";
    const temp = parseTemp(s.temp, unit);
    return {
      weather: WEATHERS.includes(s.weather) ? s.weather : "cloudy",
      temp: temp.ok ? temp.value : null,
      unit,
      date: isIsoDate(s.date) ? s.date : null
    };
  }

  function sameState(a, b) {
    return a.weather === b.weather && a.temp === b.temp && a.unit === b.unit && a.date === b.date;
  }

  function todayIso(now) {
    const d = now || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function describe(state) {
    return LABELS[state.weather] + (state.temp == null ? "" : ", " + state.temp + "°" + state.unit);
  }

  function publishLine(state) {
    return 'data-weather="' + state.weather + '" data-temp="' + (state.temp == null ? "" : state.temp) +
      '" data-unit="' + state.unit + '" data-date="' + (state.date || "") + '"';
  }

  const api = { WEATHERS, buildScene, lerpScene, smoothPath, polygonPath, parseTemp, normalizeState, sameState, todayIso, publishLine };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  // ---------- page ----------

  const card = document.getElementById("weather-card");
  if (!card) return;
  const $ = (sel) => card.querySelector(sel);
  const el = {
    body: $(".sky-body"), bolt: $(".sky-bolt"), sats: Array.from(card.querySelectorAll(".sky-sat")),
    dayLabel: $(".day-label"), date: $(".day-date"), word: $(".weather-word"), temp: $(".weather-temp"),
    mood: $(".mood"), note: $(".unpublished"), edit: $(".owner"), radios: Array.from(card.querySelectorAll('input[name="weather"]')),
    tempInput: $("#temp-input"), unitSelect: $("#unit-select"), tempError: $("#temp-error"),
    line: $("#publish-line"), copy: $("#copy-line"), copyStatus: $("#copy-status")
  };

  const published = normalizeState({
    weather: card.dataset.weather, temp: card.dataset.temp, unit: card.dataset.unit, date: card.dataset.date
  });

  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : null;
    } catch (e) {
      return null; // storage blocked or the saved text is broken: use the published values
    }
  }

  function save(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  let state = loadSaved() || published;
  let storageWorks = true;
  let current = buildScene(state.weather);
  let animation = null;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  function draw(scene) {
    el.body.setAttribute("d", smoothPath(scene.body));
    el.sats.forEach((node, i) => {
      node.setAttribute("d", smoothPath(scene.sats[i]));
      node.style.opacity = scene.satOpacity[i].toFixed(3);
    });
    el.bolt.setAttribute("d", polygonPath(scene.bolt));
    el.bolt.style.opacity = scene.boltOpacity.toFixed(3);
  }

  function morphTo(weather) {
    const target = buildScene(weather);
    if (animation) cancelAnimationFrame(animation);
    if (reduceMotion && reduceMotion.matches) {
      current = target;
      draw(current);
      return;
    }
    const from = current; // starting from wherever the drawing is now, so a quick second click is smooth too
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / MORPH_MS);
      current = lerpScene(from, target, easeInOut(p));
      draw(current);
      animation = p < 1 ? requestAnimationFrame(step) : null;
    };
    animation = requestAnimationFrame(step);
  }

  function renderText() {
    card.dataset.sky = state.weather;
    el.word.textContent = LABELS[state.weather];
    el.mood.textContent = MOODS[state.weather];
    el.temp.textContent = state.temp == null ? "" : state.temp + "°" + state.unit;
    el.temp.hidden = state.temp == null;
    if (state.date) {
      const [y, m, d] = state.date.split("-").map(Number);
      el.date.textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
      el.dayLabel.textContent = state.date === todayIso() ? "Today's sky" : "Last set";
    } else {
      el.date.textContent = "";
      el.dayLabel.textContent = "Today's sky";
    }
    const differs = !sameState(state, published);
    el.note.hidden = !differs;
    if (differs) {
      el.note.textContent = "Only this browser shows " + describe(state) + ". Readers still see " + describe(published) +
        " until index.html is updated" + (isEditing() ? " (see below)." : ".");
    }
    el.line.value = publishLine(state);
    if (!storageWorks) {
      el.note.hidden = false;
      el.note.textContent = "This browser would not save the choice, so it will be forgotten when the page closes.";
    }
  }

  function isEditing() {
    return window.location.hash === "#edit";
  }

  function renderControls() {
    el.edit.hidden = !isEditing();
    el.radios.forEach((r) => { r.checked = r.value === state.weather; });
    el.unitSelect.value = state.unit;
    if (document.activeElement !== el.tempInput) el.tempInput.value = state.temp == null ? "" : String(state.temp);
  }

  function commit(next) {
    state = normalizeState(Object.assign({}, next, { date: todayIso() }));
    storageWorks = save(state);
    renderText();
  }

  el.radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked || radio.value === state.weather) return;
      commit(Object.assign({}, state, { weather: radio.value }));
      morphTo(state.weather);
    });
  });

  function onTempChange() {
    const unit = el.unitSelect.value === "F" ? "F" : "C";
    const result = parseTemp(el.tempInput.value, unit);
    el.tempInput.setAttribute("aria-invalid", result.ok ? "false" : "true");
    el.tempError.textContent = result.ok ? "" : result.message;
    if (result.ok) commit(Object.assign({}, state, { temp: result.value, unit }));
  }
  el.tempInput.addEventListener("input", onTempChange);
  el.unitSelect.addEventListener("change", onTempChange);

  el.copy.addEventListener("click", () => {
    const done = (msg) => { el.copyStatus.textContent = msg; };
    el.line.focus();
    el.line.select();
    const fallback = () => {
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      done(ok ? "Copied." : "Copy did not work here. The text is selected: press Ctrl+C (or Cmd+C).");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(el.line.value).then(() => done("Copied."), fallback);
    } else {
      fallback();
    }
  });

  window.addEventListener("hashchange", () => { renderControls(); renderText(); });

  draw(current);
  renderText();
  renderControls();
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("is-ready")));
})();
