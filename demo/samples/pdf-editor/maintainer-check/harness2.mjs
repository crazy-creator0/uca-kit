// Second round, same steps for both builds:
// 1) replace only on page 1, save with "really remove" -> do pages 2-3 keep real text?
// 2) Tamil and Hindi replacement text, normal save
// 3) broken.pdf and password.pdf -> what the user sees
// 4) 300-page file -> time to first page, memory, last page reachable
import { sample, testpdfs, results, launch } from "./common.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APPS = {
  A: { dir: "without-kit", port: 8101, file: "#fileInput", find: "#btnFind", findText: "#findText", replaceText: "#replaceText", go: "#findGo", replaceAll: "#replaceAll", save: "#btnSave", erase: "#saveRemove", saveGo: "#saveGo" },
  B: { dir: "with-kit", port: 8102, file: "#file-input", find: "#btn-find", findText: "#find-text", replaceText: "#replace-text", go: "#btn-find-go", replaceAll: "#btn-replace-all", save: "#btn-save", erase: "#save-erase", saveGo: "#btn-save-go" },
  K: { dir: "debug-with-kit", port: 8104, file: "#file-input", find: "#btn-find", findText: "#find-text", replaceText: "#replace-text", go: "#btn-find-go", replaceAll: "#btn-replace-all", save: "#btn-save", erase: "#save-erase", saveGo: "#btn-save-go" },
  N: { dir: "debug-without-kit", port: 8105, file: "#file-input", find: "#btn-find", findText: "#find-text", replaceText: "#replace-text", go: "#btn-find-go", replaceAll: "#btn-replace-all", save: "#btn-save", erase: "#save-erase", saveGo: "#btn-save-go" }
};
const which = process.argv[2];
const app = APPS[which];
const out = path.join(results, which, "round2");
fs.mkdirSync(out, { recursive: true });
const server = spawn("python3", ["-m", "http.server", String(app.port), "--bind", "127.0.0.1"], { cwd: path.join(sample, app.dir), stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const browser = await launch();
const log = { steps: [], errors: [], external: new Set() };
const step = (s) => { log.steps.push(s); console.log(which, s); };

async function fresh() {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(`http://127.0.0.1:${app.port}/`) && !u.startsWith("blob:") && !u.startsWith("data:")) log.external.add(u); });
  page.on("pageerror", (e) => log.errors.push(String(e).slice(0, 200)));
  page.on("dialog", (d) => { step(`native dialog: ${d.message().slice(0, 120)}`); d.type() === "prompt" ? d.accept("userpw") : d.accept(); });
  await page.goto(`http://127.0.0.1:${app.port}/`, { waitUntil: "load" });
  return { context, page };
}
async function open(page, name, wait = 2500) {
  await page.setInputFiles(app.file, path.join(testpdfs, name));
  await page.waitForTimeout(wait);
}
async function replace(page, from, to) {
  await page.click(app.find);
  await page.fill(app.findText, from);
  await page.fill(app.replaceText, to);
  await page.click(app.go).catch(() => {});
  await page.waitForSelector(`${app.replaceAll}:not([disabled])`, { timeout: 20000 });
  await page.click(app.replaceAll);
  const confirm = page.locator(`button:visible:not(${app.replaceAll})`, { hasText: /^\s*Replace all\s*$/ });
  if (await confirm.count()) await confirm.last().click();
  await page.waitForFunction(() => /Replaced/.test(document.body.innerText), null, { timeout: 180000 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
}
async function save(page, name, erase) {
  await page.click(app.save);
  await page.waitForTimeout(800);
  if (erase) await page.check(app.erase);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click(app.saveGo)]);
  const file = path.join(out, name);
  await dl.saveAs(file);
  step(`saved ${name} ${fs.statSync(file).size} bytes`);
}
const visibleText = (page) => page.evaluate(() => [...document.querySelectorAll("[role=alert], .toast, .modal, dialog[open], .error, #toast, .status")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ").slice(0, 400));

const ONLY = process.env.ONLY;
async function scenario(name, fn) {
  if (ONLY && ONLY !== name) return;
  const { context, page } = await fresh();
  try { await fn(page); } catch (e) { step(`${name}: FAILED ${e.message.split("\n")[0].slice(0, 160)}`); }
  await page.screenshot({ path: path.join(out, `${name}.png`) }).catch(() => {});
  await context.close();
}

await scenario("page1-only-erase", async (page) => {
  await open(page, "three-pages.pdf");
  await replace(page, "Invoice 2026-001", "Invoice 2026-101");
  await save(page, "page1-erase.pdf", true);
});
await scenario("tamil", async (page) => {
  await open(page, "three-pages.pdf");
  await replace(page, "Asha Raman", "பிரியா குமார்");
  await save(page, "tamil.pdf", false);
});
await scenario("hindi", async (page) => {
  await open(page, "three-pages.pdf");
  await replace(page, "Asha Raman", "प्रिया कुमार");
  await save(page, "hindi.pdf", false);
});
await scenario("broken", async (page) => {
  await open(page, "broken.pdf");
  step(`broken: canvases ${await page.locator("canvas").count()}; message: ${await visibleText(page)}`);
});
await scenario("password", async (page) => {
  await open(page, "password.pdf");
  const box = page.locator("input[type=password]:visible");
  step(`password: box shown ${await box.count()}; message: ${await visibleText(page)}`);
  if (await box.count()) { await box.first().fill("userpw"); await box.first().press("Enter"); await page.waitForTimeout(2500); }
  step(`password: canvases after ${await page.locator("canvas").count()}`);
});
await scenario("big", async (page) => {
  const t0 = Date.now();
  await page.setInputFiles(app.file, path.join(testpdfs, "three-hundred-pages.pdf"));
  await page.waitForFunction(() => document.querySelectorAll("canvas").length > 0, null, { timeout: 60000 });
  step(`big: first canvas after ${Date.now() - t0} ms`);
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => ({ canvases: document.querySelectorAll("canvas").length, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6) }));
  step(`big: canvases ${m.canvases}, heap ${m.heapMB} MB`);
  await page.keyboard.press("End");
  await page.evaluate(() => { const s = [...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 500 && getComputedStyle(e).overflowY !== "visible"); (s[0] || document.scrollingElement).scrollTop = 1e9; });
  await page.waitForTimeout(2500);
  const last = await page.evaluate(() => document.body.innerText.match(/\b300\b/g)?.length || 0);
  step(`big: '300' visible on screen after scrolling to end: ${last}`);
  const t1 = Date.now();
  await replace(page, "Asha Raman", "Priya Kumar").catch((e) => step(`big replace failed ${e.message.slice(0, 100)}`));
  step(`big: replace-all took ${Date.now() - t1} ms`);
  await save(page, "big.pdf", false);
});

await scenario("save-mid-replace", async (page) => {
  await page.setInputFiles(app.file, path.join(testpdfs, "three-hundred-pages.pdf"));
  await page.waitForTimeout(3000);
  await page.click(app.find);
  await page.fill(app.findText, "Asha Raman");
  await page.fill(app.replaceText, "Priya Kumar");
  await page.click(app.go).catch(() => {});
  await page.waitForSelector(`${app.replaceAll}:not([disabled])`, { timeout: 30000 });
  await page.click(app.replaceAll);
  const confirm = page.locator(`button:visible:not(${app.replaceAll})`, { hasText: /^\s*Replace all\s*$/ });
  if (await confirm.count()) await confirm.last().click();
  await page.waitForTimeout(1200);
  const saveDisabled = await page.locator(app.save).isDisabled();
  await page.click(app.save).catch((e) => step("mid-replace: save click refused " + e.message.slice(0, 60)));
  await page.waitForTimeout(600);
  step(`mid-replace: dialog/message after Save: ${(await page.evaluate(() => [...document.querySelectorAll("dialog[open], .modal, [role=dialog]")].map(e => e.innerText).join(" | ").replace(/\s+/g, " "))).slice(0, 220)}`);
  const go = page.locator(app.saveGo);
  if (await go.count() && await go.isVisible()) {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), go.click()]);
    const f = path.join(out, "mid.pdf"); await dl.saveAs(f); step(`mid-replace: saved ${fs.statSync(f).size} bytes`);
  }
  step(`mid-replace: save button disabled=${saveDisabled}; status: ${(await page.evaluate(() => document.body.innerText.match(/Replac[^\n]*/)?.[0] || "")).slice(0, 80)}`);
});
await browser.close();
server.kill();
fs.writeFileSync(path.join(out, "log.json"), JSON.stringify({ ...log, external: [...log.external] }, null, 1));
console.log(which, "errors:", log.errors.length, "external:", [...log.external]);
