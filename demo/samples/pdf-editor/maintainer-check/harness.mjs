// Same test for both builds: open, replace a name everywhere, save normally and with "really remove", record requests.
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
const out = path.join(results, which);
fs.mkdirSync(out, { recursive: true });
const server = spawn("python3", ["-m", "http.server", String(app.port), "--bind", "127.0.0.1"], { cwd: path.join(sample, app.dir), stdio: "ignore" });
await new Promise((resolve) => setTimeout(resolve, 1200));

const browser = await launch();
const log = { requests: [], errors: [], steps: [] };
async function run(erase) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("request", (request) => log.requests.push(request.url()));
  page.on("pageerror", (error) => log.errors.push(String(error)));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`http://127.0.0.1:${app.port}/`, { waitUntil: "load" });
  await page.setInputFiles(app.file, path.join(testpdfs, "three-pages.pdf"));
  await page.waitForTimeout(2500);
  log.steps.push(`${erase ? "erase" : "normal"}: canvases after open = ${await page.locator("canvas").count()}`);
  await page.click(app.find);
  await page.fill(app.findText, "Asha Raman");
  await page.fill(app.replaceText, "Priya Kumar");
  await page.click(app.go).catch(() => {});
  await page.waitForTimeout(800);
  await page.waitForSelector(`${app.replaceAll}:not([disabled])`, { timeout: 15000 });
  await page.click(app.replaceAll);
  // Some builds ask "Replace all?" in their own pop-up; press its confirm button if one appears.
  const confirm = page.locator("button:visible", { hasText: /^\s*Replace all\s*$/ }).filter({ hasNot: page.locator(app.replaceAll) });
  if (await confirm.count().catch(() => 0)) { log.steps.push(`${erase ? "erase" : "normal"}: pressed in-page confirm`); await confirm.last().click().catch(() => {}); }
  await page.waitForTimeout(2000);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(out, `screen-${erase ? "erase" : "normal"}.png`) });
  await page.click(app.save);
  await page.waitForTimeout(800);
  if (erase) await page.check(app.erase);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click(app.saveGo)]);
  const saved = path.join(out, erase ? "saved-erase.pdf" : "saved.pdf");
  await download.saveAs(saved);
  log.steps.push(`${erase ? "erase" : "normal"}: saved ${fs.statSync(saved).size} bytes`);
  await context.close();
}
try {
  await run(false);
  await run(true);
} catch (error) {
  log.errors.push(`HARNESS: ${error.message.split("\n")[0]}`);
}
await browser.close();
server.kill();
const external = [...new Set(log.requests.filter((url) => !url.startsWith(`http://127.0.0.1:${app.port}/`) && !url.startsWith("blob:") && !url.startsWith("data:")))];
fs.writeFileSync(path.join(out, "log.json"), JSON.stringify({ ...log, external, requestCount: log.requests.length }, null, 1));
console.log(which, JSON.stringify({ steps: log.steps, errors: log.errors, requests: log.requests.length, external }));
