import { sample, testpdfs, results, launch } from "./common.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
// Phone-sized view of each build with a file open; prints sideways overflow and control counts.
const A = { A: ["without-kit", 8101, "#fileInput"], B: ["with-kit", 8102, "#file-input"], K: ["debug-with-kit", 8104, "#file-input"], N: ["debug-without-kit", 8105, "#file-input"] };
const b = await launch();
for (const [w, [dir, port, input]] of Object.entries(A)) {
  const s = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: `${sample}/${dir}`, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1000));
  const ctx = await b.newContext({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/`);
  await p.setInputFiles(input, `${testpdfs}/` + "three-pages.pdf");
  await p.waitForTimeout(2500);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const tabbable = await p.evaluate(() => [...document.querySelectorAll("button, input, select, [tabindex]")].filter(e => e.offsetParent && !e.disabled).length);
  const small = await p.evaluate(() => [...document.querySelectorAll("button")].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 32)).length);
  console.log(w, { overflowPx: overflow, visibleControls: tabbable, buttonsUnder32px: small });
  fs.mkdirSync(`${results}/${w}`, { recursive: true });
  await p.screenshot({ path: `${results}/${w}/phone.png` });
  await ctx.close(); s.kill();
}
await b.close();
