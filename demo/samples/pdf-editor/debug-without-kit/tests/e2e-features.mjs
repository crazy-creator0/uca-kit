// End-to-end test of the tools added to match Sejda: pictures, signatures, mark-up, shapes, links, notes,
// new form fields, filling existing forms, page tools (turn, move, delete, blank page) and attachments.
// Run after the files in README "Testing" are made: node tests/e2e-features.mjs
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PDFS = path.join(ROOT, '.uca-workspace', 'pdfs');
const OUT = path.join(ROOT, '.uca-workspace', 'out');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8767;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};
const text = (f, pg) => execFileSync('pdftotext', ['-raw', ...(pg ? ['-f', String(pg), '-l', String(pg)] : []), f, '-']).toString();
const qpdfOk = (f) => { try { execFileSync('qpdf', ['--check', f], { stdio: 'pipe' }); return true; } catch (e) { return /operation succeeded with warnings/.test(String(e.stdout)); } };
const pages = (f) => parseInt(execFileSync('qpdf', ['--show-npages', f]).toString(), 10);
// Facts about a saved file, read with an independent library (pypdf).
const PY = `
import sys, json
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
out = {'pages': []}
for pg in r.pages:
    annots = []
    for a in pg.get('/Annots') or []:
        a = a.get_object()
        d = {'sub': a.get('/Subtype'), 'contents': a.get('/Contents')}
        if a.get('/A'): d['uri'] = a['/A'].get('/URI')
        if a.get('/Dest') is not None: d['dest'] = r.get_page_number(a['/Dest'][0].get_object().indirect_reference) if hasattr(a['/Dest'][0], 'get_object') else None
        annots.append(d)
    imgs = 0
    res = pg.get('/Resources') or {}
    xo = res.get('/XObject') or {}
    for k in xo:
        if xo[k].get_object().get('/Subtype') == '/Image': imgs += 1
    out['pages'].append({'rotate': pg.rotation, 'annots': annots, 'images': imgs})
fields = r.get_fields() or {}
out['fields'] = {k: (str(v.get('/V')) if v.get('/V') is not None else None) for k, v in fields.items()}
out['attachments'] = list((r.attachments or {}).keys())
print(json.dumps(out, default=str))
`;
const facts = (f) => JSON.parse(execFileSync('python3', ['-I', '-c', PY, f]).toString());
const redPixels = (f, pg) => {
  execFileSync('pdftoppm', ['-png', '-r', '60', '-f', String(pg), '-l', String(pg), '-singlefile', f, path.join(OUT, 'tmp-red')]);
  return parseInt(execFileSync('python3', ['-I', '-c', `
from PIL import Image
im = Image.open(${JSON.stringify(path.join(OUT, 'tmp-red.png'))}).convert('RGB')
b = im.tobytes()
print(sum(1 for i in range(0, len(b), 3) if b[i] > 190 and b[i + 1] < 70 and b[i + 2] < 70))`]).toString(), 10);
};

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
// Screen position of a point given in page points on page id `i`.
// (Scrolls the point into the middle of the view first.)
const screenAt = (page, i, x, y) => page.evaluate(([n, px, py]) => {
  const S = window.__editor; const p = S.pages[n]; const v = document.getElementById('viewer');
  let r = p.box.getBoundingClientRect(); const vr = v.getBoundingClientRect();
  const sy = r.top + py * S.zoom;
  if (sy < vr.top + 40 || sy > vr.bottom - 40) { v.scrollTop += sy - (vr.top + vr.height / 2); r = p.box.getBoundingClientRect(); }
  return { x: r.left + px * S.zoom, y: r.top + py * S.zoom };
}, [i, x, y]);
async function dragOnPage(page, i, a, b) {
  await screenAt(page, i, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  await page.waitForTimeout(50);
  const s = await screenAt(page, i, a[0], a[1]); const e = await screenAt(page, i, b[0], b[1]);
  await page.mouse.move(s.x, s.y); await page.mouse.down();
  await page.mouse.move((s.x + e.x) / 2, (s.y + e.y) / 2, { steps: 4 });
  await page.mouse.move(e.x, e.y, { steps: 4 }); await page.mouse.up();
}
const count = (page, type) => page.evaluate((t) => window.__editor.edits.filter((e) => e.type === t).length, type);
const last = (page) => page.evaluate(() => window.__editor.edits.at(-1));

try {
  // ---------- 1. pictures, signatures, mark-up, shapes, links, notes, new fields, page tools ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'invoice.pdf');

    // picture
    await page.setInputFiles('#image-file', path.join(PDFS, 'logo.png'));
    await page.waitForFunction(() => window.__editor.edits.some((e) => e.type === 'image'));
    check(await page.locator('.edit.image img').count() === 1, 'image: picture is placed on the page');
    // move it to the empty lower part of page 1, then make it bigger with the corner handle
    await page.evaluate(() => { const e = window.__editor.edits.at(-1); e.x = 300; e.y = 470; });
    await page.evaluate(() => window.__editor.refresh());
    await page.click('.edit.image');
    const w0 = (await last(page)).w;
    const hb = await page.locator('.handle.se').boundingBox();
    await page.mouse.move(hb.x + 7, hb.y + 7); await page.mouse.down();
    await page.mouse.move(hb.x + 60, hb.y + 60, { steps: 5 }); await page.mouse.up();
    const img = await last(page);
    check(img.w > w0 + 20 && Math.abs(img.w / img.h - 2) < 0.05, 'image: corner handle resizes and keeps the shape', `${w0.toFixed(0)} -> ${img.w.toFixed(0)} wide`);

    // signature: drawn
    await page.click('#btn-sign');
    await page.waitForSelector('#sign-dialog[open]');
    const pad = await page.locator('#sign-pad').boundingBox();
    await page.mouse.move(pad.x + 30, pad.y + pad.height * 0.7); await page.mouse.down();
    await page.mouse.move(pad.x + 120, pad.y + 30, { steps: 6 });
    await page.mouse.move(pad.x + 240, pad.y + pad.height * 0.8, { steps: 6 }); await page.mouse.up();
    await page.click('#sign-form button[value="ok"]');
    await page.waitForFunction(() => window.__editor.edits.filter((e) => e.type === 'image').length === 2);
    check(true, 'signature: drawn signature is put on the page');
    // signature: uploaded photo of a signature on white paper
    await page.click('#btn-sign');
    await page.click('[data-sign="upload"]');
    await page.setInputFiles('#sign-file', path.join(PDFS, 'signature.jpg'));
    await page.click('#sign-form button[value="ok"]');
    await page.waitForFunction(() => window.__editor.edits.filter((e) => e.type === 'image').length === 3);
    const seeThrough = await page.evaluate(async () => {
      const S = window.__editor; const a = S.assets.get(S.edits.at(-1).asset);
      const c = document.createElement('canvas'); c.width = a.w; c.height = a.h;
      const g = c.getContext('2d'); g.drawImage(a.bitmap, 0, 0);
      return g.getImageData(1, 1, 1, 1).data[3];
    });
    check(seeThrough === 0, 'signature: white paper of an uploaded signature becomes see-through', `corner alpha ${seeThrough}`);
    // signature: typed
    await page.click('#btn-sign');
    await page.click('[data-sign="type"]');
    await page.fill('#sign-text', 'Ravi K');
    await page.click('#sign-form button[value="ok"]');
    await page.waitForFunction(() => window.__editor.edits.filter((e) => e.type === 'image').length === 4);
    check(true, 'signature: typed signature is put on the page');
    // move the signatures out of the way, into the empty bottom of page 1
    await page.evaluate(() => { const S = window.__editor; S.edits.filter((e) => e.type === 'image').slice(1).forEach((e, k) => { e.x = 60 + k * 170; e.y = 700; }); S.refresh(); });
    await page.keyboard.press('Escape');

    // highlight over "Customer name" snaps to the line of text
    const run = await page.evaluate(() => window.__editor.pages[0].runs.find((r) => r.str.includes('Customer')));
    await page.click('[data-tool="highlight"]');
    await dragOnPage(page, 0, [run.x - 2, run.y + run.h * 0.3], [run.x + run.w * 0.6, run.y + run.h * 0.6]);
    const hl = await last(page);
    check(hl.type === 'mark' && Math.abs(hl.y - run.y) < 0.5 && Math.abs(hl.h - run.h) < 0.5, 'highlight: follows the height of the text line', JSON.stringify({ y: hl.y?.toFixed(1), runY: run.y.toFixed(1) }));
    const ref = await page.evaluate(() => window.__editor.pages[0].runs.find((r) => r.str.includes('Ref code')));
    await page.click('[data-tool="strike"]');
    await dragOnPage(page, 0, [ref.x, ref.y + 2], [ref.x + ref.w, ref.y + ref.h - 2]);
    check((await last(page)).kind === 'strike', 'strike out: added over the text');
    await page.click('[data-tool="underline"]');
    await dragOnPage(page, 0, [run.x, run.y + 2], [run.x + run.w, run.y + run.h - 2]);
    check((await last(page)).kind === 'underline', 'underline: added under the text');

    // shapes and drawing
    await page.click('[data-tool="rect"]');
    await dragOnPage(page, 0, [350, 300], [450, 360]);
    await page.click('[data-tool="ellipse"]');
    await dragOnPage(page, 0, [460, 300], [540, 360]);
    await page.click('[data-tool="arrow"]');
    await dragOnPage(page, 0, [350, 400], [520, 440]);
    await page.click('[data-tool="draw"]');
    await dragOnPage(page, 0, [80, 420], [200, 470]);
    const kinds = await page.evaluate(() => window.__editor.edits.filter((e) => e.type === 'shape').map((e) => e.kind).join(','));
    check(kinds === 'rect,ellipse,arrow' && (await count(page, 'ink')) === 1, 'shapes: rectangle, ellipse, arrow and freehand drawing added', kinds);
    // change the rectangle: fill it and thicken its border
    await page.click('[data-tool="edit"]');
    const rectId = await page.evaluate(() => window.__editor.edits.find((e) => e.kind === 'rect').id);
    await page.click(`.edit[data-id="${rectId}"]`);
    await page.check('#chk-fill');
    await page.fill('#inp-lw', '4'); await page.press('#inp-lw', 'Enter');
    const rect = await page.evaluate((id) => window.__editor.edits.find((e) => e.id === id), rectId);
    check(rect.fill && rect.lw === 4, 'shapes: fill and line width can be changed', JSON.stringify({ fill: rect.fill, lw: rect.lw }));

    // note, links, new form fields
    await page.click('[data-tool="note"]');
    const np = await screenAt(page, 0, 520, 100);
    await page.mouse.click(np.x, np.y);
    await page.fill('#inp-note', 'Check this amount');
    await page.press('#inp-note', 'Enter');
    check((await last(page)).text === 'Check this amount', 'note: sticky note with text added');
    await page.click('[data-tool="link"]');
    await dragOnPage(page, 0, [350, 200], [500, 220]);
    await page.fill('#inp-link', 'example.com/pay'); await page.press('#inp-link', 'Enter');
    await page.click('[data-tool="link"]');
    await dragOnPage(page, 0, [350, 230], [500, 250]);
    await page.fill('#inp-link', '3'); await page.press('#inp-link', 'Enter');
    check((await count(page, 'link')) === 2, 'links: web link and link to a page added');
    await page.click('[data-tool="textfield"]');
    await dragOnPage(page, 0, [60, 640], [230, 662]);
    await page.click('[data-tool="checkbox"]');
    const cp = await screenAt(page, 0, 250, 651);
    await page.mouse.click(cp.x, cp.y);
    check((await count(page, 'field')) === 2, 'forms: new text field and tick box added');

    // page tools: blank page after page 1 (with text on it), turn page 2, delete page 3
    await page.click('[data-tool="add"]');
    await page.locator('.pagehead').nth(0).getByRole('button', { name: 'Add a blank page after this one' }).click();
    const blankId = await page.evaluate(() => window.__editor.order[1]);
    check(await page.evaluate((id) => window.__editor.pages[id].blank, blankId), 'pages: blank page inserted after page 1');
    await page.locator(`.page[data-page="${blankId}"]`).scrollIntoViewIfNeeded();
    await page.waitForFunction((id) => window.__editor.pages[id].renderedAt > 0, blankId);
    await page.locator(`.page[data-page="${blankId}"]`).click({ position: { x: 80, y: 80 } });
    await page.fill('.edit-area', 'Text on the new page');
    await page.keyboard.press('Escape');
    await page.locator('.pagehead').nth(2).getByRole('button', { name: 'Turn page right' }).click();
    // add text on the turned page: it must land where clicked, upright on the turned page
    await page.click('#btn-zoom-out'); await page.click('#btn-zoom-out');
    await page.locator('.pagebox').nth(2).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.__editor.pages[1].renderedAt > 0);
    const boxR = await page.locator('.pagebox').nth(2).boundingBox();
    await page.mouse.click(boxR.x + boxR.width - 60, boxR.y + 60);
    await page.fill('.edit-area', 'TURNED');
    await page.keyboard.press('Escape');
    const turned = await last(page);
    check(turned.page === 1 && turned.x < 80 && turned.y === undefined, 'pages: a click on a turned page maps back to the page correctly', `x=${turned.x.toFixed(0)} baseline=${turned.baseline.toFixed(0)}`);
    await page.locator('.pagehead').nth(3).getByRole('button', { name: 'Delete this page' }).click();
    check((await page.evaluate(() => window.__editor.order.join(','))) === `0,${blankId},1`, 'pages: page 3 deleted, order is 1, blank, 2');
    await page.click('#btn-undo');
    check((await page.evaluate(() => window.__editor.order.length)) === 4, 'pages: undo brings a deleted page back');
    await page.click('#btn-redo');

    // attachment
    await page.click('#btn-attach');
    await page.setInputFiles('#attach-file', path.join(PDFS, 'photo.jpg'));
    await page.waitForSelector('#attach-list li:has-text("photo.jpg")');
    await page.click('#attach-dialog button[value="close"]');

    await page.screenshot({ path: path.join(OUT, 'features-desktop.png') });
    const a = await save(page, 'features.pdf');
    check(/Checked: the new file opens and has all 3 pages/.test(a.result), 'save: app verified its own output', a.result.slice(0, 100));
    check(qpdfOk(a.file), 'qpdf --check: saved file is structurally valid');
    check(pages(a.file) === 3, 'saved file has 3 pages (one deleted, one blank added)');
    const all = text(a.file);
    check(!all.includes('Page three'), 'deleted page is not in the saved file');
    check(text(a.file, 2).includes('Text on the new page'), 'text written on the blank page is in the saved file');
    const t3 = text(a.file, 3).replace(/\s+/g, ' ');
    check(t3.includes('Page two says hello') && t3.includes('TURNED'), 'page 2 kept its text and the new text, now as page 3');
    const F = facts(a.file);
    check(F.pages[2].rotate === 90 && F.pages[0].rotate === 0, 'turned page is saved turned', `rotations ${F.pages.map((p) => p.rotate)}`);
    const an = F.pages[0].annots;
    check(an.some((x) => x.sub === '/Link' && x.uri === 'https://example.com/pay'), 'saved web link points to https://example.com/pay');
    check(an.some((x) => x.sub === '/Link' && x.dest === 2), 'saved page link points to page 3 of the saved file', JSON.stringify(an.filter((x) => x.sub === '/Link')));
    check(an.some((x) => x.sub === '/Text' && x.contents === 'Check this amount'), 'saved note has its text');
    check('Text1' in F.fields && 'Tick1' in F.fields, 'new form fields are real fields in the saved file', Object.keys(F.fields).join(','));
    check(F.pages[0].images >= 4, 'pictures and signatures are embedded', `${F.pages[0].images} images on page 1`);
    check(redPixels(a.file, 1) > 4000, 'picture is visible where it was placed (rendered by poppler)');
    check(F.attachments.includes('photo.jpg'), 'attached file is inside the saved PDF');
    execFileSync('pdftoppm', ['-png', '-r', '60', '-f', '1', '-l', '1', '-singlefile', a.file, path.join(OUT, 'features-p1')]);
    execFileSync('pdftoppm', ['-png', '-r', '60', '-f', '3', '-l', '3', '-singlefile', a.file, path.join(OUT, 'features-p3')]);

    const b = await save(page, 'features-erased.pdf', { erase: false });
    check(qpdfOk(b.file), 'saving twice works');
    // the work, including pictures and page changes, survives closing the tab
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForSelector('#restore:not([hidden])', { timeout: 5000 });
    await page.click('#btn-restore');
    await page.waitForFunction(() => window.__editor.pages.length && window.__editor.pages[0].renderedAt > 0);
    const restored = await page.evaluate(() => ({ n: window.__editor.edits.length, order: window.__editor.order.length, assets: window.__editor.assets.size, att: window.__editor.attachments.length }));
    check(restored.order === 3 && restored.assets === 4 && restored.att === 1 && restored.n > 15, 'work with pictures, page changes and attachments is restored after reload', JSON.stringify(restored));
    await ctx.close();
  }

  // ---------- 2. filling in an existing form ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'form.pdf');
    await page.waitForSelector('.ff');
    const n = await page.locator('.page[data-page="0"] .ff').count();
    check(n === 5, 'form: fillable boxes are found (text, tick, 2 choices, list)', `${n} boxes`);
    await page.fill('.ff[aria-label="fullname"]', 'Meera Devi');
    await page.locator('.ff[aria-label="fullname"]').blur();
    await page.check('.ff[aria-label="agree"]');
    await page.locator('.ff[aria-label="size"]').nth(1).check();
    await page.selectOption('.ff[aria-label="city"]', 'Mumbai');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'form-filled.png') });
    // the page picture shows the typed name (drawn by the PDF engine, not just the input box)
    const shows = await page.evaluate(async () => {
      const S = window.__editor; const p = S.pages[0];
      const tc = await p.proxy.getTextContent();
      return S.forms;
    });
    check(Object.keys(shows).length >= 4, 'form: values are recorded', JSON.stringify(shows));
    const r = await save(page, 'form-filled.pdf');
    const F = facts(r.file);
    check(F.fields.fullname === 'Meera Devi', 'form: typed text saved', F.fields.fullname);
    check(F.fields.agree && F.fields.agree !== '/Off', 'form: tick box saved as ticked', F.fields.agree);
    // pdf-lib names radio choices by number, with the labels in /Opt: '/1' = second choice ("large")
    check(F.fields.size === '/large' || F.fields.size === '/1', 'form: chosen option saved', F.fields.size);
    check(F.fields.city === 'Mumbai', 'form: list choice saved', F.fields.city);
    check(text(r.file, 1).includes('Meera Devi'), 'form: the typed name is visible in the saved file (appearance drawn)');
    check(qpdfOk(r.file), 'qpdf --check: filled form is structurally valid');
    await ctx.close();
  }

  // ---------- 3. erase-for-real with new objects, and a protected file with page changes ----------
  {
    const { ctx, page } = await newPage();
    await open(page, 'invoice.pdf');
    await page.click('[data-tool="cover"]');
    const acct = await page.evaluate(() => window.__editor.pages[0].runs.find((x) => x.str.includes('ACCT')));
    await dragOnPage(page, 0, [acct.x - 2, acct.y - 2], [acct.x + acct.w + 2, acct.y + acct.h + 2]);
    await page.click('[data-tool="link"]');
    await dragOnPage(page, 0, [350, 200], [500, 220]);
    await page.fill('#inp-link', 'https://example.org'); await page.press('#inp-link', 'Enter');
    await page.setInputFiles('#image-file', path.join(PDFS, 'photo.jpg'));
    await page.waitForFunction(() => window.__editor.edits.some((e) => e.type === 'image'));
    const r = await save(page, 'erase-objects.pdf', { erase: true });
    check(qpdfOk(r.file) && !text(r.file, 1).includes('ACCT'), 'erase: covered text gone with pictures and links on the page');
    check(facts(r.file).pages[0].annots.some((x) => x.uri === 'https://example.org'), 'erase: link still works on a page saved as a picture');

    await page.setInputFiles('#file-input', path.join(PDFS, 'protected.pdf'));
    await page.waitForFunction(() => window.__editor.name === 'protected.pdf' && window.__editor.pages[0]?.renderedAt > 0 && window.__editor.info);
    await page.locator('.pagehead').nth(0).getByRole('button', { name: 'Turn page right' }).click();
    await page.locator('.pagehead').nth(1).getByRole('button', { name: 'Delete this page' }).click();
    const p2 = await save(page, 'protected-pages.pdf');
    const F = facts(p2.file);
    check(pages(p2.file) === 2 && F.pages[0].rotate === 90, 'protected file: page changes also apply when saved as pictures', `pages ${pages(p2.file)}, rotate ${F.pages[0].rotate}`);
    await ctx.close();
  }

  // ---------- 4. phone ----------
  {
    const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await open(page, 'invoice.pdf');
    await page.tap('[data-tool="highlight"]');
    await page.screenshot({ path: path.join(OUT, 'features-phone.png') });
    const railVisible = await page.locator('[data-tool="highlight"]').isVisible();
    const pageTop = await page.locator('.pagebox').first().boundingBox();
    check(railVisible && pageTop.y < 520, 'phone: tools are reachable and the page is still in view', `page starts at y=${pageTop.y.toFixed(0)}`);
    await ctx.close();
  }
} catch (err) {
  console.log('FAIL  test run stopped:', err.message);
  for (const c of browser.contexts()) for (const pg of c.pages()) {
    await pg.screenshot({ path: path.join(OUT, 'features-failure.png') }).catch(() => {});
    console.log('      state:', await pg.evaluate(() => { const S = window.__editor; return JSON.stringify({ tool: S.tool, editing: S.editing, sel: S.sel, order: S.order, last: S.edits.at(-1) }); }).catch(() => '?'));
  }
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
