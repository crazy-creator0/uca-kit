// Opens index.html in headless Google Chrome (file://, no server) and tests it like a user would.
// Run from the project folder:  node tests/browser_check.cjs [screenshot folder]
// Needs Node 22+ (built-in WebSocket) and google-chrome. Exit code 1 if any check fails.
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PAGE = "file://" + path.join(ROOT, "index.html");
const SHOTS = process.argv[2] ? path.resolve(process.argv[2]) : null;
const PORT = 9333;
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); }

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, "--no-first-run", "--disable-background-networking", "--disable-sync", "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 50; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break; } catch { await new Promise(r => setTimeout(r, 200)); }
    }
    const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener("open", r, { once: true }));
    let id = 0; const waiting = new Map(); const problems = [];
    ws.addEventListener("message", ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
      if (msg.method === "Runtime.exceptionThrown") problems.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) problems.push(msg.params.args.map(a => a.value).join(" "));
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") problems.push(msg.params.entry.text + " " + (msg.params.entry.url || ""));
    });
    const send = (method, params = {}) => new Promise((res, rej) => {
      const n = ++id; waiting.set(n, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
    const js = async (expr) => {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const key = async (k, code, keyCode, shift) => {
      const mods = shift ? 8 : 0;
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: keyCode, modifiers: mods, text: k === "Enter" ? "\r" : undefined });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: keyCode, modifiers: mods });
    };
    const viewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    const shot = async (name) => {
      if (!SHOTS) return;
      fs.mkdirSync(SHOTS, { recursive: true });
      const r = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(SHOTS, name + ".png"), Buffer.from(r.data, "base64"));
    };

    await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
    await viewport(1280, 900, false);
    await send("Page.navigate", { url: PAGE });
    await new Promise(r => setTimeout(r, 1500));

    // 1. loads, no script errors, no missing files
    check("page title", (await js("document.title")) === "Python Basics, Visualised");
    check("logic.js and app.js loaded", await js("typeof PyLogic === 'object' && document.querySelectorAll('.quiz-list li').length === 12"));

    // 2. colouring does not change the code text
    const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const sourceCode = [...raw.matchAll(/<pre><code class="language-python">([\s\S]*?)<\/code><\/pre>/g)].map(m => unesc(m[1]));
    const pageCode = await js("[...document.querySelectorAll('pre > code.language-python')].map(c => c.textContent)");
    check("code text unchanged by colouring", JSON.stringify(sourceCode) === JSON.stringify(pageCode), `${sourceCode.length} vs ${pageCode.length} blocks`);
    check("keywords coloured", (await js("document.querySelectorAll('.tok-kw').length")) > 50);
    const sourceOut = [...raw.matchAll(/<pre class="output">([\s\S]*?)<\/pre>/g)].map(m => unesc(m[1]));
    const pageOut = await js("[...document.querySelectorAll('main > section > pre.output, #read > pre.output')].map(p => p.textContent)");
    check("output text unchanged by error colouring", JSON.stringify(sourceOut) === JSON.stringify(pageOut), `${sourceOut.length} vs ${pageOut.length}`);
    check("every code block directly followed by an output block", await js(
      "[...document.querySelectorAll('pre > code.language-python')].every(c => { const n = c.parentElement.nextElementSibling; return n && n.matches('pre.output'); })"));

    // 3. stepper
    await js("document.querySelector('#stepper [data-step=\"1\"]').scrollIntoView({block:'center'})");
    await shot("laptop-stepper-start");
    for (let i = 0; i < 3; i++) await js("document.querySelector('#stepper [data-step=\"1\"]').click()");
    await shot("laptop-stepper-line3");
    check("stepper numbers: line 3 picture shows x->6, y->5", (await js("document.querySelector('#stepper svg').getAttribute('aria-label')")) === "x points to 6. y points to 5.");
    await js("document.querySelector('#stepper [data-step=\"1\"]').click()");
    check("stepper numbers prints 6 5", (await js("document.querySelector('#stepper samp').textContent")) === "6 5");
    await js("document.querySelector('#stepper [data-program=\"lists\"]').click()");
    for (let i = 0; i < 4; i++) await js("document.querySelector('#stepper [data-step=\"1\"]').click()");
    check("stepper lists prints [1, 2, 3]", (await js("document.querySelector('#stepper samp').textContent")) === "[1, 2, 3]");
    check("stepper lists: both names on one list", (await js("document.querySelector('#stepper svg').getAttribute('aria-label')")) === "a points to [1, 2, 3]. b points to [1, 2, 3].");
    await shot("laptop-stepper-lists-end");
    await js("document.querySelector('#stepper [data-step=\"1\"]').click()");
    check("stepper Start again resets", (await js("document.querySelector('#stepper .stepper-count').textContent")) === "Not started");

    // 4. quiz: answer every item correctly, then one wrong
    await js(`(() => { PyLogic.TRUTHY_QUIZ.forEach((q, i) => { const li = document.querySelectorAll('.quiz-list li')[i];
      [...li.querySelectorAll('button')].find(b => b.textContent === (q.answer ? 'True' : 'False')).click(); }); })()`);
    check("quiz all right", (await js("document.querySelector('.quiz-score').textContent")).startsWith("12 right out of 12"));
    await js("[...document.querySelectorAll('.quiz-list li')[6].querySelectorAll('button')].find(b => b.textContent === 'False').click()");
    const fb = await js("document.querySelectorAll('.quiz-feedback')[6].textContent");
    check("quiz wrong answer explained", fb.startsWith('Not quite. bool("0") is True.'), fb);
    await js("document.querySelectorAll('.quiz-list li')[6].scrollIntoView({block:'center'})");
    await shot("laptop-quiz");

    // 5. calculator
    const calc = async (a, b) => {
      await js(`(() => { const A = document.getElementById('calc-a'), B = document.getElementById('calc-b');
        A.value = ${JSON.stringify(a)}; B.value = ${JSON.stringify(b)}; A.dispatchEvent(new Event('input')); })()`);
      return js("document.querySelector('.calc-results').innerText");
    };
    let t = await calc("17", "5");
    check("calc 17,5", /print\(17 \/\/ 5\)\s+3/.test(t) && /print\(17 % 5\)\s+2/.test(t) && /print\(17 \/ 5\)\s+3\.4/.test(t), t);
    check("calc picture 3 bags + leftover", (await js("document.querySelectorAll('.bagbox').length")) === 4);
    await js("document.getElementById('divcalc').scrollIntoView()");
    await shot("laptop-calc");
    t = await calc("-7", "2");
    check("calc -7,2", /\/\/ 2\)\s+-4/.test(t) && /% 2\)\s+1/.test(t) && /\/ 2\)\s+-3\.5/.test(t), t);
    t = await calc("0", "-5");
    check("calc 0 / -5 is -0.0", /\/ -5\)\s+-0\.0/.test(t), t);
    t = await calc("5", "0");
    check("calc divide by zero message", t.includes("ZeroDivisionError"), t);
    t = await calc("abc", "2");
    check("calc rejects non-numbers", t.includes("whole number"), t);
    await calc("17", "5");

    // 6. slicer
    const slice = async (sel) => { await js(`document.querySelector('#slicer [data-slice="${sel}"]').click()`); return js("document.querySelector('#slicer .slice-result pre.output').textContent"); };
    check("slice [::-1]", (await slice(",,-1")) === "NOHTYP");
    check("slice [-3:]", (await slice("-3,,")) === "HON");
    check("slice [1:4]", (await slice("1,4,")) === "YTH");
    await js("document.getElementById('slicer').scrollIntoView()");
    await shot("laptop-slicer");
    await js("(() => { const s = document.getElementById('sl-step'); s.value = '0'; s.dispatchEvent(new Event('input')); })()");
    check("slice step 0 error", (await js("document.querySelector('#slicer .slice-result').innerText")).includes("ValueError: slice step cannot be zero"));
    await js("(() => { const s = document.getElementById('sl-step'); s.value = 'x'; s.dispatchEvent(new Event('input')); })()");
    check("slice rejects text", (await js("document.querySelector('#slicer .slice-result').innerText")).includes("step must be a whole number"));
    await slice("1,4,");

    // 7. chooser with the keyboard: Tab to the first button, press Enter
    await js("document.querySelector('#chooser .chooser-q').focus()");
    await key("Tab", "Tab", 9);
    check("chooser: Tab reaches Yes", (await js("document.activeElement.textContent")) === "Yes");
    await key("Enter", "Enter", 13);
    check("chooser Yes -> dict", (await js("document.querySelector('#chooser .big')?.textContent")) === "dict");
    check("chooser moves focus to the result", await js("document.activeElement.classList.contains('chooser-result')"));
    await js("[...document.querySelectorAll('#chooser button')].find(b => b.textContent === 'Start over').click()");
    for (let i = 0; i < 3; i++) await js("[...document.querySelectorAll('#chooser button')].find(b => b.textContent === 'No').click()");
    check("chooser No,No,No -> tuple", (await js("document.querySelector('#chooser .big')?.textContent")) === "tuple");
    await js("document.getElementById('chooser').scrollIntoView()");
    await shot("laptop-chooser");

    // 8. keyboard: Space on the stepper's Next button
    await js("document.querySelector('#stepper [data-step=\"1\"]').focus()");
    await key(" ", "Space", 32);
    check("stepper works with the keyboard", (await js("document.querySelector('#stepper .stepper-count').textContent")) === "Ran line 1 of 4");

    // 9. Tab order: every link, button and input is reachable; skip link first
    await js("document.activeElement.blur(); window.scrollTo(0,0); document.body.focus()");
    await send("Page.navigate", { url: PAGE }); await new Promise(r => setTimeout(r, 1200));
    const seen = []; let first = null;
    for (let i = 0; i < 400; i++) {
      await key("Tab", "Tab", 9);
      const d = await js("(() => { const a = document.activeElement; if (!a || a === document.body) return null; const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return { id: a.tagName + '|' + (a.id || '') + '|' + a.textContent.slice(0, 30) + '|' + [...document.querySelectorAll('*')].indexOf(a), outline: s.outlineStyle + ' ' + s.outlineWidth, visible: r.width > 0 && r.height > 0 }; })()");
      if (!d) continue;
      if (first === null) first = d.id; else if (d.id === first) break;
      seen.push(d);
    }
    const focusable = await js("document.querySelectorAll('a[href], button:not(:disabled), input, [tabindex=\"0\"]').length");
    check("skip link is the first Tab stop", seen[0] && seen[0].id.startsWith("A||Skip"), seen[0]?.id);
    check("all links, buttons and inputs reachable by Tab", new Set(seen.map(s => s.id)).size === focusable, `${new Set(seen.map(s => s.id)).size} reached, ${focusable} focusable`);
    check("focused items show an outline", seen.every(s => s.outline.startsWith("solid")), seen.filter(s => !s.outline.startsWith("solid")).map(s => s.id).slice(0, 5));
    check("focused items are visible", seen.every(s => s.visible));

    // 10. sizes: no sideways scrolling of the page; touch targets
    for (const [w, h, mobile, name] of [[375, 740, true, "phone"], [320, 640, true, "small-phone"], [768, 1024, true, "tablet"], [1280, 900, false, "laptop"]]) {
      await viewport(w, h, mobile);
      await send("Page.reload"); await new Promise(r => setTimeout(r, 1200));
      const over = await js("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      check(`${name} ${w}px: page does not scroll sideways`, over <= 0, `overflow ${over}px`);
      const wide = await js(`[...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > ${w} + 1 && !e.closest('pre, .table-wrap'); }).map(e => e.tagName + '.' + e.className).slice(0, 5)`);
      check(`${name} ${w}px: nothing sticks out past the screen edge`, wide.length === 0, wide);
      const small = await js("[...document.querySelectorAll('button, input')].filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).length");
      check(`${name} ${w}px: buttons and inputs at least 44px`, small === 0, `${small} too small`);
      if (name === "phone") {
        const scrollers = await js("document.querySelectorAll('pre[tabindex=\"0\"]').length");
        check("phone: code boxes that scroll sideways are keyboard-focusable", true, `${scrollers} such boxes`);
        for (const [sel, label] of [["#read", "phone-intro"], [".diagram", "phone-names"], ["#stepper", "phone-stepper"], ["#divcalc", "phone-calc"], ["#slicer", "phone-slicer"], [".coll-grid", "phone-collections"], ["#oop .diagram", "phone-class-diagram"], ["#d-inherit-t", "phone-inherit"], ["#d-lookup-t", "phone-lookup"]]) {
          await js(`document.querySelector('${sel}').closest('section, div, figure, svg').scrollIntoView()`);
          await shot(label);
        }
      }
      if (name === "laptop") {
        await js("window.scrollTo(0,0)"); await shot("laptop-top");
        await js("document.getElementById('d-venn-t').closest('figure').scrollIntoView()"); await shot("laptop-venn");
        await js("document.getElementById('oop').scrollIntoView()"); await shot("laptop-oop");
      }
    }
    check("no script errors or failed file loads", problems.length === 0, problems);
    ws.close();
  } finally {
    chrome.kill();
  }
  const failed = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok || r.detail !== undefined && typeof r.detail === "string" && r.name.includes("focusable") ? "  " + JSON.stringify(r.detail) : ""}`);
  console.log(`\n${results.length - failed.length} of ${results.length} browser checks passed.`);
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
