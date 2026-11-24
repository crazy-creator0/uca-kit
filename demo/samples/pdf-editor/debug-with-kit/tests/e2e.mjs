// End-to-end test: drives the real editor in Chrome and checks the saved files with independent PDF tools.
// Run: node tests/e2e.mjs   (needs Playwright + Chrome, qpdf, pdftotext, pdftoppm; see README "Testing")
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

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
// Same, with line breaks flattened (on turned pages -raw puts each word on its own line).
const flat = (f, pg) => text(f, pg).replace(/\s+/g, ' ');
const qpdfOk = (f) => { try { execFileSync('qpdf', ['--check', f], { stdio: 'pipe' }); return true; } catch (e) { return /operation succeeded with warnings/.test(String(e.stdout)); } };
const pages = (f) => parseInt(execFileSync('qpdf', ['--show-npages', f]).toString(), 10);
const png = (f, pg, name) => execFileSync('pdftoppm', ['-png', '-r', '60', '-f', String(pg), '-l', String(pg), '-singlefile', f, path.join(OUT, name)]);
// Page pixels drawn by poppler (independent of the editor), with a helper to count matching pixels.
const pixels = (f, pg) => {
  const buf = execFileSync('pdftoppm', ['-r', '40', '-f', String(pg), '-l', String(pg), f], { maxBuffer: 1 << 26 });
  const head = buf.toString('latin1', 0, 40).match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
  const data = buf.subarray(head[0].length);
  return { count: (fn) => { let n = 0; for (let i = 0; i + 2 < data.length; i += 3) if (fn([data[i], data[i + 1], data[i + 2]])) n++; return n; } };
};
// A solid red PNG made here, so the test needs no picture files.
function redPng(w, h) {
  const crcTable = [...Array(256).keys()].map((n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(w).fill([230, 20, 20]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
// Reads page turns, links and form values from a saved file with pypdf (a separate PDF library).
const PYPDF_INFO = `
import sys, json
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
refs = [p.indirect_reference.idnum for p in r.pages]
links = []
for p in r.pages:
    for a in (p.get('/Annots') or []):
        a = a.get_object()
        if a.get('/Subtype') != '/Link': continue
        d = {}
        if '/A' in a: d['uri'] = str(a['/A'].get('/URI'))
        if '/Dest' in a: d['page'] = refs.index(a['/Dest'][0].idnum)
        links.append(d)
fields = {k: (None if v.get('/V') is None else str(v.get('/V'))) for k, v in (r.get_fields() or {}).items()}
print(json.dumps({'rotate': [p.rotation for p in r.pages], 'links': links, 'fields': fields}))
`;

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

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

  // ---------- 8. a failed save must not make the NEXT file save as pictures ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'invoice.pdf');
    await page.click('[data-tool="add"]');
    await page.locator('.page[data-page="0"]').click({ position: { x: 300, y: 500 } });
    await page.fill('.edit-area', 'हिंदी');
    await page.keyboard.press('Escape');
    // make the one picture this save needs fail once, as a low-memory device would
    await page.evaluate(() => { const orig = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb) { HTMLCanvasElement.prototype.toBlob = orig; cb(null); }; });
    await page.click('#btn-save');
    await page.click('#btn-save-go');
    await page.waitForFunction(() => /Nothing was saved/.test(document.getElementById('save-result').textContent));
    await page.click('#btn-save-cancel');
    await page.setInputFiles('#file-input', path.join(PDFS, 'big300.pdf'));
    await page.waitForFunction(() => window.__editor.name === 'big300.pdf' && window.__editor.pages[0]?.renderedAt > 0);
    await page.click('#btn-save');
    const warn = await page.evaluate(() => ({ hidden: document.getElementById('save-warn').hidden, text: document.getElementById('save-warn').textContent, go: document.getElementById('btn-save-go').textContent }));
    check(warn.hidden && warn.go === 'Save a copy', 'after a failed save, the next file opened is saved normally (not as pictures)', JSON.stringify(warn));
    await page.click('#btn-save-cancel');
    await ctx.close();
  }

  // ---------- 9. Sejda-style tools: forms, picture, signature, shapes, drawing, highlight, links, pages ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'form.pdf');
    const pt = async (i, x, y) => page.evaluate(([i, x, y]) => { const S = window.__editor; const b = S.pages[i].el.getBoundingClientRect(); return { x: b.left + x * S.zoom, y: b.top + y * S.zoom }; }, [i, x, y]);
    const drag = async (i, x1, y1, x2, y2) => {
      const a = await pt(i, x1, y1); const b = await pt(i, x2, y2);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
    };
    const count = (type) => page.evaluate((t) => window.__editor.edits.filter((e) => e.type === t).length, type);

    // forms: text, checkbox, radio, dropdown
    await page.waitForSelector('.fld');
    const fields = await page.evaluate(() => window.__editor.pages[0].widgets.map((a) => a.fieldName));
    check(['fullname', 'agree', 'size', 'city'].every((f) => fields.includes(f)), 'form fields are found and can be clicked', fields.join(','));
    const fld = async (name, n = 0) => page.locator(`.page[data-page="0"] .fld[data-k="${await page.evaluate(([nm, n]) => window.__editor.pages[0].widgets.map((a, k) => [a.fieldName, k]).filter(([f]) => f === nm)[n][1], [name, n])}"]`);
    await (await fld('fullname')).click();
    await page.fill('.fld-editor', 'Asha Verma');
    await page.keyboard.press('Enter');
    await (await fld('agree')).click();
    await (await fld('size', 0)).click();
    await (await fld('city')).click();
    await page.selectOption('.fld-editor', 'Mumbai');
    const forms = await page.evaluate(() => window.__editor.forms);
    check(forms.fullname === 'Asha Verma' && forms.agree === false && forms.city === 'Mumbai' && forms.size, 'form values are kept as typed and ticked', JSON.stringify(forms));
    await page.waitForFunction(() => !window.__editor.pages[0].stale && !window.__editor.pages[0].rendering);

    // picture (a red 40x20 PNG)
    await page.setInputFiles('#image-file', { name: 'red.png', mimeType: 'image/png', buffer: redPng(40, 20) });
    await page.waitForFunction(() => window.__editor.edits.some((e) => e.type === 'image'));
    const img = await page.evaluate(() => window.__editor.edits.find((e) => e.type === 'image'));
    await page.evaluate((id) => { const S = window.__editor; const e = S.edits.find((x) => x.id === id); e.x = 420; e.y = 410; }, img.id);
    await page.click('#btn-zoom-in'); await page.click('#btn-zoom-out'); // redraw at the new place
    await page.locator(`.edit[data-id="${img.id}"]`).click();
    const hb = await page.locator(`.edit[data-id="${img.id}"] .handle`).boundingBox();
    await page.mouse.move(hb.x + 8, hb.y + 8); await page.mouse.down(); await page.mouse.move(hb.x + 68, hb.y + 38, { steps: 5 }); await page.mouse.up();
    const resized = await page.evaluate((id) => window.__editor.edits.find((e) => e.id === id), img.id);
    check(resized.w > img.w * 1.3 && Math.abs(resized.w / resized.h - img.w / img.h) < 0.02, 'picture can be resized from its corner and keeps its shape', `${img.w.toFixed(0)}x${img.h.toFixed(0)} -> ${resized.w.toFixed(0)}x${resized.h.toFixed(0)}`);

    // signature: draw on the pad
    await page.click('#btn-sign');
    const padBox = await page.locator('#sign-pad').boundingBox();
    await page.mouse.move(padBox.x + 40, padBox.y + 60); await page.mouse.down();
    await page.mouse.move(padBox.x + 200, padBox.y + 40, { steps: 8 }); await page.mouse.move(padBox.x + 300, padBox.y + 90, { steps: 8 }); await page.mouse.up();
    await page.click('#sign-use');
    await page.waitForFunction(() => window.__editor.edits.some((e) => e.type === 'image' && e.sig));
    check(true, 'signature drawn and placed on the page');

    // shapes, drawing, highlight, links
    await page.click('[data-tool="shape"]');
    await drag(0, 60, 300, 160, 340);
    await page.selectOption('#sel-shape', 'ellipse');
    await drag(0, 180, 300, 260, 340);
    await page.selectOption('#sel-shape', 'line');
    await drag(0, 280, 300, 400, 330);
    await page.click('[data-tool="draw"]');
    await drag(0, 60, 360, 200, 400);
    await page.click('[data-tool="mark"]');
    const title = await pt(0, 100, 55); // on "Application form"
    await page.mouse.click(title.x, title.y);
    await page.click('[data-tool="link"]');
    await drag(0, 420, 300, 540, 330);
    await page.fill('#inp-link', 'example.com');
    await page.press('#inp-link', 'Enter');
    await page.click('[data-tool="link"]');
    await drag(0, 420, 360, 540, 390);
    await page.fill('#inp-link', '2');
    await page.press('#inp-link', 'Enter');
    check(await count('shape') === 3 && await count('ink') === 1 && await count('mark') === 1 && await count('link') === 2, 'shapes, drawing, highlight and links are added',
      JSON.stringify(await page.evaluate(() => window.__editor.edits.map((e) => e.type))));
    const mk = await page.evaluate(() => { const S = window.__editor; const m = S.edits.find((e) => e.type === 'mark'); const r = S.pages[0].runs.find((x) => x.str === 'Application form'); return { m, r }; });
    check(Math.abs(mk.m.x - mk.r.x) < 0.5 && Math.abs(mk.m.w - mk.r.w) < 0.5 && Math.abs(mk.m.y - mk.r.y) < 0.5, 'clicking a line of text highlights exactly that line', `mark x=${mk.m.x.toFixed(1)} w=${mk.m.w.toFixed(1)}, line x=${mk.r.x.toFixed(1)} w=${mk.r.w.toFixed(1)}`);

    // pages: insert a blank page after page 1, then turn page 1; undo/redo a page change
    await page.click('.pagehead[data-page="0"] button[data-act="insert"]');
    await page.click('.pagehead[data-page="0"] button[data-act="rotate"]');
    check((await page.evaluate(() => window.__editor.order.length)) === 2, 'blank page inserted');
    await page.click('#btn-undo');
    check((await page.evaluate(() => window.__editor.rot[0] || 0)) === 0, 'undo takes back turning the page');
    await page.click('#btn-redo');
    await page.waitForSelector('.page[data-page="1"]');
    await page.evaluate(() => window.__editor.pages[1].head.scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => window.__editor.pages[1].renderedAt > 0);
    await page.click('[data-tool="add"]');
    // clicks on the blank page 2 land where clicked
    const bp = await page.evaluate(() => { const S = window.__editor; const b = S.pages[1].el.getBoundingClientRect(); return { x: b.left + 100 * S.zoom, y: b.top + 100 * S.zoom }; });
    await page.mouse.click(bp.x, bp.y);
    await page.fill('.edit-area', 'Blank page words');
    await page.keyboard.press('Escape');
    // a click on the turned page 1 maps back to the right spot on the page
    await page.evaluate(() => window.__editor.pages[0].head.scrollIntoView({ block: 'start' }));
    const turned = await page.evaluate(() => { const S = window.__editor; const b = S.pages[0].el.getBoundingClientRect(); return { x: b.right - 100 * S.zoom, y: b.top + 100 * S.zoom }; });
    await page.mouse.click(turned.x, turned.y);
    const tp = await page.evaluate(() => { const e = window.__editor.edits.at(-1); return { x: e.x, page: e.page, editing: !!document.querySelector('.edit-area') }; });
    await page.fill('.edit-area', 'Turned page note');
    await page.keyboard.press('Escape');
    check(tp.page === 0 && Math.abs(tp.x - 100) < 3, 'clicking a turned page places text at the right spot', JSON.stringify(tp));
    await page.screenshot({ path: path.join(OUT, 'tools-desktop.png') });

    const r = await save(page, 'form-tools.pdf');
    check(qpdfOk(r.file) && pages(r.file) === 2, 'saved file with all tools is valid and has the inserted page', r.result.slice(0, 120));
    const info = JSON.parse(execFileSync('python3', ['-c', PYPDF_INFO, r.file]).toString());
    check(info.rotate[0] === 90 && info.rotate[1] === 0, 'page 1 is turned in the saved file', JSON.stringify(info.rotate));
    check(info.links.some((l) => l.uri === 'https://example.com') && info.links.some((l) => l.page === 1), 'web link and page link are in the saved file', JSON.stringify(info.links));
    check(info.fields.fullname === 'Asha Verma' && info.fields.agree === '/Off' && info.fields.city === 'Mumbai' && info.fields.size && info.fields.size !== '/Off',
      'form values are saved in the form itself', JSON.stringify(info.fields));
    check(flat(r.file, 1).includes('Asha Verma'), 'filled-in text field shows the new value in the saved file');
    check(text(r.file, 2).includes('Blank page words'), 'text on the inserted blank page is saved');
    const ppm = pixels(r.file, 1);
    check(ppm.count(([R, G, B]) => R > 200 && G < 60 && B < 60) > 30, 'picture is drawn in the saved file', `${ppm.count(([R, G, B]) => R > 200 && G < 60 && B < 60)} red pixels`);
    check(ppm.count(([R, G, B]) => R > 230 && G > 200 && B > 60 && B < 180) > 30, 'highlight is drawn in the saved file');
    png(r.file, 1, 'saved-tools-p1');

    // erase-for-real path draws the new kinds of changes too
    await page.click('[data-tool="cover"]');
    await page.evaluate(() => window.__editor.pages[0].head.scrollIntoView({ block: 'start' }));
    await drag(0, 60, 420, 120, 440);
    const e2 = await save(page, 'form-tools-erased.pdf', { erase: true });
    const ppm2 = pixels(e2.file, 1);
    check(qpdfOk(e2.file) && ppm2.count(([R, G, B]) => R > 200 && G < 60 && B < 60) > 30, 'with "erase", the page picture includes the picture and other changes');

    // everything is restored after the tab is reloaded
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForSelector('#restore:not([hidden])', { timeout: 5000 });
    await page.click('#btn-restore');
    await page.waitForFunction(() => window.__editor.pages.length && window.__editor.pages[0].renderedAt > 0);
    const back = await page.evaluate(() => ({ order: window.__editor.order.length, rot: window.__editor.rot[0], forms: Object.keys(window.__editor.forms).length, assets: Object.keys(window.__editor.assets).length }));
    check(back.order === 2 && back.rot === 90 && back.forms === 4 && back.assets === 2, 'reload: pages, form values and pictures are restored', JSON.stringify(back));
    await ctx.close();
  }

  // ---------- 10. delete a page ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'invoice.pdf');
    await page.click('.pagehead[data-page="1"] button[data-act="delete"]');
    const labels = await page.evaluate(() => [...document.querySelectorAll('.pagehead:not([hidden]) .pagelabel')].map((x) => x.textContent));
    const r = await save(page, 'invoice-deleted.pdf');
    check(pages(r.file) === 2 && flat(r.file, 2).includes('Page three') && !flat(r.file).includes('Page two'), 'deleted page is left out of the saved file', labels.join(' | '));
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
const realErrors = consoleErrors.filter((e) => !/favicon/.test(e) && !/Could not draw the image/.test(e)); // test 8 causes that one on purpose
check(realErrors.length === 0, 'no errors in the browser console', realErrors.slice(0, 3).join(' | '));
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
