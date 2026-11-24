// Checks the blind audit's runtime findings on one build: node audit-checks.mjs <build folder> <port>
import { sample, testpdfs, results, launch } from "./common.mjs";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
const [dir, port] = [process.argv[2], process.argv[3]];
const out = `${results}/audit/${dir}`;
fs.mkdirSync(out, { recursive: true });
const s = spawn("python3", ["-m", "http.server", port, "--bind", "127.0.0.1"], { cwd: `${sample}/${dir}`, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1000));
const b = await launch();
const url = `http://127.0.0.1:${port}/`;
const res = {};
async function saveTo(p, name) {
  await p.click("#btn-save"); await p.waitForTimeout(800);
  const warn = await p.evaluate(() => { const w = document.querySelector("#save-warn"); return w && !w.hidden ? w.innerText : ""; });
  const [d] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), p.click("#btn-save-go")]);
  await d.saveAs(`${out}/${name}`);
  return warn;
}
// 1. Find clicked twice, then Replace all (High)
{
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  await p.goto(url);
  await p.setInputFiles("#file-input", `${testpdfs}/` + "three-hundred-pages.pdf");
  await p.waitForTimeout(2000);
  await p.click("#btn-find"); await p.fill("#find-text", "Asha"); await p.fill("#replace-text", "Asha!");
  await p.click("#btn-find-go"); await p.waitForTimeout(150); await p.click("#btn-find-go");
  await p.waitForFunction(() => /Found/.test(document.querySelector("#find-status").textContent), null, { timeout: 60000 });
  await p.waitForTimeout(3000);
  res.findStatus = await p.textContent("#find-status");
  await p.waitForSelector("#btn-replace-all:not([disabled])"); await p.click("#btn-replace-all");
  await p.waitForFunction(() => /Replaced/.test(document.querySelector("#find-status").textContent), null, { timeout: 180000 });
  await p.waitForTimeout(500);
  await saveTo(p, "double.pdf");
  const counts = execSync(`pdftotext ${out}/double.pdf - | grep -o "Asha!*" | sort | uniq -c`).toString().trim().replace(/\s+/g, " ");
  res.doubleReplace = counts;
  await ctx.close();
}
// 2. Password file saved without its password, and what the dialog says (Medium)
{
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  await p.goto(url);
  await p.setInputFiles("#file-input", `${testpdfs}/` + "password.pdf");
  await p.waitForTimeout(1500);
  const box = p.locator("input[type=password]:visible");
  await box.first().fill("userpw"); await box.first().press("Enter"); await p.waitForTimeout(2500);
  res.passwordWarning = await saveTo(p, "password-saved.pdf");
  res.passwordEncrypted = execSync(`qpdf --show-encryption ${out}/password-saved.pdf --password=userpw 2>&1 | head -1`).toString().trim();
  await ctx.close();
}
// 3. Opened file kept in browser storage with no edits; is there a way to forget it? (Medium)
{
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(url);
  await p.setInputFiles("#file-input", `${testpdfs}/` + "three-pages.pdf");
  await p.waitForTimeout(2500);
  await p.reload(); await p.waitForTimeout(2000);
  res.storedAfterReload = await p.evaluate(async () => {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    let bytes = 0;
    for (const { name } of dbs) {
      const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = no; });
      for (const st of db.objectStoreNames) {
        const all = await new Promise((ok) => { const r = db.transaction(st).objectStore(st).getAll(); r.onsuccess = () => ok(r.result); });
        bytes += JSON.stringify(all, (k, v) => (v instanceof Uint8Array || v instanceof ArrayBuffer ? "x".repeat(v.byteLength) : v)).length;
      }
    }
    return { databases: dbs.map((d) => d.name), approxBytes: bytes };
  });
  res.forgetVisibleWithoutEdits = await p.evaluate(() => [...document.querySelectorAll("button")].filter((e) => e.offsetParent && /forget/i.test(e.innerText)).map((e) => e.innerText.trim()));
  res.storageMentioned = await p.evaluate(() => /kept in this browser|stored in this browser|saved in this browser/i.test(document.body.innerText));
  await ctx.close();
}
// 4. Keyboard: can page text be reached with Tab? (Medium)
{
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(url);
  await p.setInputFiles("#file-input", `${testpdfs}/` + "three-pages.pdf");
  await p.waitForTimeout(2500);
  res.keyboard = await p.evaluate(() => {
    const runs = [...document.querySelectorAll("[data-key]")];
    return { textRuns: runs.length, focusable: runs.filter((e) => e.tabIndex >= 0 || /^(BUTTON|INPUT|A)$/.test(e.tagName)).length };
  });
  await ctx.close();
}
await b.close(); s.kill();
fs.writeFileSync(`${out}/checks.json`, JSON.stringify(res, null, 1));
console.log(dir, JSON.stringify(res, null, 1));
