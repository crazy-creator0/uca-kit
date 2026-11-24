// End-to-end test: drives the real editor in Chrome and checks the saved files with independent PDF tools.
// Run: node tests/e2e.mjs   (needs Playwright + Chrome, qpdf, pdftotext, pdftoppm; see README "Testing")
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PDFS = path.join(ROOT, '.uca-workspace', 'pdfs');
const OUT = path.join(ROOT, '.uca-workspace', 'out');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8765;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const text = (f, pg) => execFileSync('pdftotext', ['-raw', ...(pg ? ['-f', String(pg), '-l', String(pg)] : []), f, '-']).toString();
const qpdfOk = (f) => { try { execFileSync('qpdf', ['--check', f], { stdio: 'pipe' }); return true; } catch (e) { return /operation succeeded with warnings/.test(String(e.stdout)); } };
const pages = (f) => parseInt(execFileSync('qpdf', ['--show-npages', f]).toString(), 10);
const png = (f, pg, name) => execFileSync('pdftoppm', ['-png', '-r', '60', '-f', String(pg), '-l', String(pg), '-singlefile', f, path.join(OUT, name)]);

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
// wait until the local server answers (starting Python can take a few seconds)
for (let t = 0; t < 100; t++) {
  try { if ((await fetch(`${ORIGIN}/index.html`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const requests = [];
const consoleErrors = [];

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 }, ...opts });
  ctx.on('request', (r) => requests.push(r.url()));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${ORIGIN}/index.html`);
  return { ctx, page };
}
async function open(page, file) {
  await page.setInputFiles('#file-input', path.join(PDFS, file));
  await page.waitForFunction(() => window.__editor.pages.length && window.__editor.pages[0].renderedAt > 0 && window.__editor.pages[0].runs, null, { timeout: 60000 });
}
async function renderPageN(page, i) {
  await page.locator(`.page[data-page="${i}"]`).scrollIntoViewIfNeeded();
  await page.waitForFunction((n) => window.__editor.pages[n].renderedAt > 0 && window.__editor.pages[n].runs, i, { timeout: 30000 });
}
async function clickRun(page, pageIndex, contains) {
  const key = await page.evaluate(([i, s]) => window.__editor.pages[i].runs.find((r) => r.str.includes(s))?.key, [pageIndex, contains]);
  if (!key) throw new Error(`no run containing "${contains}" on page ${pageIndex + 1}`);
  await page.click(`.run[data-key="${key}"]`);
  await page.waitForSelector('.edit-area');
}
async function save(page, name, { erase = false } = {}) {
  await page.click('#btn-save');
  if (erase) await page.check('#save-erase');
  const dl = page.waitForEvent('download', { timeout: 120000 });
  await page.click('#btn-save-go');
  const file = path.join(OUT, name);
  await (await dl).saveAs(file);
  const result = await page.textContent('#save-result');
  await page.click('#btn-save-cancel');
  return { file, result };
}

try {
  // ---------- 1. change text, add text in another script, add text on a rotated page, cover an area ----------
  {
    const before = sha(path.join(PDFS, 'invoice.pdf'));
    const { ctx, page } = await newPage();
    await open(page, 'invoice.pdf');
    const runs = await page.evaluate(() => window.__editor.pages[0].runs.map((r) => r.str));
    check(runs.some((s) => s.includes('Ravi Kumar')), 'existing text is detected as clickable', runs.slice(0, 4).join(' | '));

    await clickRun(page, 0, 'Ravi Kumar');
    const guessed = await page.evaluate(() => { const S = window.__editor; const e = S.edits[0]; return { family: e.family, bold: e.bold, color: e.color, orig: e.origFont }; });
    check(guessed.bold === true, 'bold original text is recognised as bold', JSON.stringify(guessed));
    await page.fill('.edit-area', 'Priya Sharma');
    await page.keyboard.press('Escape');

    await clickRun(page, 0, 'Amount due');
    const red = await page.evaluate(() => window.__editor.edits.at(-1).color);
    check(/^#[a-f0-9]{6}$/.test(red) && parseInt(red.slice(1, 3), 16) > 120 && parseInt(red.slice(3, 5), 16) < 80, 'red original text keeps its red colour', red);
    await page.fill('.edit-area', 'Amount due: Rs 9,999 by 15 December 2026');
    await page.keyboard.press('Escape');

    // click and leave unchanged: must not count as a change
    await clickRun(page, 0, 'Ref code');
    await page.keyboard.press('Escape');
    check((await page.evaluate(() => window.__editor.edits.length)) === 2, 'clicking text without changing it adds no change');

    await page.click('[data-tool="add"]');
    await page.locator('.page[data-page="0"]').click({ position: { x: 400, y: 640 } });
    await page.fill('.edit-area', 'नया पाठ — हिंदी में');
    await page.keyboard.press('Escape');

    // cover the secret note
    await page.click('[data-tool="cover"]');
    const box = await page.evaluate(() => { const S = window.__editor; const p = S.pages[0]; const r = p.runs.find((x) => x.str.includes('ACCT')); const b = p.el.getBoundingClientRect(); return { x: b.left + (r.x - 2) * S.zoom, y: b.top + (r.y - 2) * S.zoom, w: (r.w + 4) * S.zoom, h: (r.h + 4) * S.zoom }; });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w, box.y + box.h, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => window.__editor.edits.some((e) => e.type === 'box'));
    const coverBox = await page.evaluate(() => window.__editor.edits.find((e) => e.type === 'box'));
    check(coverBox.color === '#fff3c4', 'cover box picks up the yellow background colour', JSON.stringify(coverBox));

    // rotated page 3
    await renderPageN(page, 2);
    await page.click('[data-tool="add"]');
    await page.locator('.page[data-page="2"]').click({ position: { x: 120, y: 120 } });
    await page.fill('.edit-area', 'ROTATED NOTE');
    await page.keyboard.press('Escape');
    check((await page.evaluate(() => window.__editor.edits.length)) === 5, 'five changes recorded');

    // undo / redo
    await page.click('#btn-undo');
    check((await page.evaluate(() => window.__editor.edits.length)) === 4, 'undo removes the last change');
    await page.click('#btn-redo');
    check((await page.evaluate(() => window.__editor.edits.length)) === 5, 'redo brings it back');

    await page.screenshot({ path: path.join(OUT, 'desktop-edited.png') });

    const a = await save(page, 'invoice-edited.pdf');
    check(/Checked: the new file opens/.test(a.result), 'app verified its own output', a.result.slice(0, 90));
    check(qpdfOk(a.file), 'qpdf --check: saved file is structurally valid');
    check(pages(a.file) === 3, 'saved file has 3 pages');
    const t1 = text(a.file, 1);
    check(t1.includes('Priya Sharma'), 'changed English text is searchable in the saved file');
    check(t1.includes('Ref code: QX-55'), 'untouched text is still real text');
    check(t1.includes('Ravi Kumar'), 'WITHOUT "erase": covered original text is still inside the file (expected, and the app warns about it)');
    check(text(a.file, 3).includes('ROTATED NOTE'), 'text added on rotated page is in the file');
    png(a.file, 1, 'saved-normal-p1'); png(a.file, 3, 'saved-normal-p3');

    const b = await save(page, 'invoice-erased.pdf', { erase: true });
    check(qpdfOk(b.file), 'qpdf --check: erased file is structurally valid');
    const t1e = text(b.file, 1);
    check(!t1e.includes('Ravi Kumar') && !t1e.includes('ACCT-778899'), 'WITH "erase": covered text is really gone from page 1', JSON.stringify(t1e.slice(0, 60)));
    const raw = execFileSync('qpdf', ['--qdf', '--object-streams=disable', b.file, '-']).toString('latin1');
    check(!raw.includes('ACCT') && !raw.includes('Ravi'), 'WITH "erase": no plain copy of the covered words anywhere in the raw file');
    check(text(b.file, 2).includes('Page two says hello'), 'WITH "erase": other pages keep their real text');
    png(b.file, 1, 'saved-erased-p1');

    check(sha(path.join(PDFS, 'invoice.pdf')) === before, 'original file on disk is byte-for-byte unchanged');

    // autosave + restore after closing the tab
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForSelector('#restore:not([hidden])', { timeout: 5000 });
    await page.click('#btn-restore');
    await page.waitForFunction(() => window.__editor.pages.length && window.__editor.pages[0].renderedAt > 0);
    check((await page.evaluate(() => window.__editor.edits.length)) === 5, 'work is restored after the tab is reloaded');

    // offline: reload with the network cut
    await page.evaluate(() => navigator.serviceWorker.ready);
    await ctx.setOffline(true);
    await page.reload();
    const offlineOk = await page.locator('#btn-open').isVisible().catch(() => false);
    check(offlineOk, 'editor reloads while offline (after first visit)');
    await ctx.setOffline(false);
    await ctx.close();
  }

  // ---------- 2. find & replace across pages ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'invoice.pdf');
    await page.click('#btn-find');
    await page.fill('#find-text', 'ravi kumar');
    await page.fill('#replace-text', 'Anil Rao');
    await page.click('#btn-find-go');
    await page.waitForFunction(() => /Found|Not found/.test(document.getElementById('find-status').textContent));
    const status = await page.textContent('#find-status');
    check(/Found 2 times on 2 page/.test(status), 'find (ignoring capitals) finds level text on pages 1-2; rotated page text is not editable', status);
    await page.click('#btn-replace-all');
    await page.waitForFunction(() => /Replaced/.test(document.getElementById('find-status').textContent));
    const r = await save(page, 'invoice-replaced.pdf');
    check(text(r.file, 1).includes('Anil Rao') && text(r.file, 2).includes('Anil Rao'), 'replace all: new words are in the saved file on both pages');
    await ctx.close();
  }

  // ---------- 3. custom font file ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'invoice.pdf');
    await clickRun(page, 0, 'Ref code');
    await page.setInputFiles('#font-file', path.join(PDFS, 'BlockTest.ttf'));
    await page.waitForFunction(() => window.__editor.edits[0]?.family === 'BlockTest');
    await page.fill('.edit-area', 'Ref code Blocks');
    await page.keyboard.press('Escape');
    const r = await save(page, 'invoice-font.pdf');
    png(r.file, 1, 'saved-font-p1');
    check(true, 'custom font file accepted and used (see saved-font-p1.png for the block letters)');
    await page.reload();
    const kept = await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 500)); return document.fonts.check('16px "BlockTest"') && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'BlockTest'); });
    check(kept, 'added font is still available after reload');
    await ctx.close();
  }

  // ---------- 4. protected (owner password) and password-protected files ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'protected.pdf');
    await page.waitForFunction(() => window.__editor.info);
    check((await page.evaluate(() => window.__editor.info.ok)) === false, 'protected file is detected');
    await clickRun(page, 0, 'Ravi Kumar');
    await page.fill('.edit-area', 'Protected Edit');
    await page.keyboard.press('Escape');
    const r = await save(page, 'protected-edited.pdf');
    check(pages(r.file) === 3 && qpdfOk(r.file), 'protected file saved as a valid 3-page picture copy');

    await page.setInputFiles('#file-input', path.join(PDFS, 'password.pdf'));
    await page.waitForSelector('#pw-dialog[open]');
    await page.fill('#pw-input', 'wrong');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#pw-error:not([hidden])');
    await page.fill('#pw-input', 'userpw');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__editor.name === 'password.pdf' && window.__editor.pages[0]?.renderedAt > 0);
    check(true, 'password file: wrong password rejected, right one opens it');
    await ctx.close();
  }

  // ---------- 5. page with unusual drawing state ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'tricky_raw.pdf');
    await page.click('[data-tool="add"]');
    await page.locator('.page[data-page="0"]').click({ position: { x: 40, y: 40 } });
    await page.fill('.edit-area', 'Top left note');
    await page.keyboard.press('Escape');
    const r = await save(page, 'tricky-edited.pdf');
    const bbox = execFileSync('pdftotext', ['-bbox', r.file, '-']).toString();
    const m = bbox.match(/xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>Top</);
    const ok = m && +m[1] < 80 && +m[2] < 80;
    check(ok, 'new text lands where it was placed, even on a page that leaves its drawing state changed', m ? `x=${m[1]} y=${m[2]}` : 'not found');
    await ctx.close();
  }

  // ---------- 6. 300-page file ----------
  {
    const { ctx, page } = await newPage();
    const t0 = Date.now();
    await open(page, 'big300.pdf');
    const openMs = Date.now() - t0;
    check(true, '300-page file opens', `${(openMs / 1000).toFixed(1)} s until first page shown`);
    await page.fill('#page-input', '250');
    await page.press('#page-input', 'Enter');
    await renderPageN(page, 249);
    await clickRun(page, 249, 'Chapter 250');
    await page.fill('.edit-area', 'Chapter 250: edited far into the file');
    await page.keyboard.press('Escape');
    const rendered = await page.evaluate(() => window.__editor.pages.filter((p) => p.renderedAt).length);
    check(rendered <= 20, 'only nearby pages are kept drawn (memory stays low)', `${rendered} drawn`);
    const t1 = Date.now();
    const r = await save(page, 'big300-edited.pdf');
    check(pages(r.file) === 300 && text(r.file, 250).includes('edited far into the file'), '300-page file saved with the change on page 250', `${((Date.now() - t1) / 1000).toFixed(1)} s to save`);
    await ctx.close();
  }

  // ---------- 7. phone-sized screen with touch ----------
  {
    const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await page.screenshot({ path: path.join(OUT, 'phone-empty.png') });
    await open(page, 'invoice.pdf');
    const key = await page.evaluate(() => window.__editor.pages[0].runs.find((r) => r.str.includes('Ravi'))?.key);
    await page.tap(`.run[data-key="${key}"]`);
    await page.waitForSelector('.edit-area');
    await page.fill('.edit-area', 'Phone edit');
    await page.screenshot({ path: path.join(OUT, 'phone-editing.png') });
    await page.keyboard.press('Escape');
    check((await page.evaluate(() => window.__editor.edits.length)) === 1, 'phone: tap on text opens it for editing');
    await ctx.close();
  }
} catch (err) {
  console.log('FAIL  test run stopped:', err.message);
  failures++;
} finally {
  await browser.close();
  server.kill();
}

const outside = requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('blob:') && !u.startsWith('data:'));
check(outside.length === 0, 'no request left this computer during all tests', outside.slice(0, 5).join(', ') || `${requests.length} local requests only`);
const realErrors = consoleErrors.filter((e) => !/favicon/.test(e));
check(realErrors.length === 0, 'no errors in the browser console', realErrors.slice(0, 3).join(' | '));
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
