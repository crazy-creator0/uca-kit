// Builds the edited copy. The original bytes are only ever read (copied), never changed.
import {
  PDFDocument, PDFName, PDFRef, PDFDict, PDFArray, PDFStream, PDFString, PDFSignature, PDFBool, StandardFonts,
  PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, BlendMode, LineCapStyle, rgb, degrees,
} from '../vendor/pdf-lib.esm.min.js';
import { getDocument, AnnotationMode } from '../vendor/pdf.min.mjs';
import { textToCanvas, drawText, layoutText } from './textdraw.js';
import { drawItem, markLine, parseLinkTarget, HIGHLIGHT_ALPHA } from './items.js';

const TEXT_PX_PER_PT = 4;          // ~288 dpi for edited text that has to be saved as a picture
const PAGE_PX_PER_PT = 200 / 72;   // 200 dpi for pages turned into pictures
const MAX_PIXELS = 24e6;

function hexToRgb(hex) {
  const n = parseInt(String(hex || '#000000').slice(1), 16) || 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function canvasBytes(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(async (b) => {
    if (!b) return reject(new Error('Could not draw the image (the device may be low on memory).'));
    resolve(new Uint8Array(await b.arrayBuffer()));
  }, type, quality));
}

function dataUrlBytes(url) {
  const bin = atob(String(url).split(',')[1] || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hasCover(e) {
  return e.type === 'box' || (e.type === 'text' && e.cover);
}

// Maps a box given in on-screen page points (top-left origin, after page rotation) into PDF space.
function placeBox(viewport, x, y, w, h) {
  const p0 = viewport.convertToPdfPoint(x, y + h);
  const p1 = viewport.convertToPdfPoint(x + w, y + h);
  const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
  return { x: p0[0], y: p0[1], width: w, height: h, rotate: degrees(angle) };
}
const pdfPoint = (viewport, x, y) => { const p = viewport.convertToPdfPoint(x, y); return { x: p[0], y: p[1] }; };

// Fonts every PDF reader has built in. Text in these families (and in letters they contain) is saved
// as real text instead of a picture: sharp at any zoom, selectable and searchable.
const STANDARD = [
  [/^(arial|helvetica|helvetica neue|liberation sans|arimo|freesans|nimbus sans)$/i, ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique']],
  [/^(times new roman|times|liberation serif|tinos|freeserif|nimbus roman)$/i, ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic']],
  [/^(courier new|courier|liberation mono|cousine|nimbus mono)$/i, ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique']],
];

async function standardFontFor(e, kit) {
  const row = STANDARD.find(([re]) => re.test(String(e.family || '').trim()));
  if (!row) return null;
  const name = StandardFonts[row[1][(e.bold ? 1 : 0) + (e.italic ? 2 : 0)]];
  if (!kit.fonts.has(name)) kit.fonts.set(name, await kit.doc.embedFont(name));
  const font = kit.fonts.get(name);
  try { for (const line of String(e.text).split('\n')) font.widthOfTextAtSize(line, e.size); } catch { return null; }
  return font;
}

async function drawTextVector(kit, page, viewport, e) {
  const font = await standardFontFor(e, kit);
  const L = layoutText(e);
  if (font) {
    L.lines.forEach((line, i) => {
      if (!line) return;
      const p = placeBox(viewport, e.x, e.baseline + i * L.lh, 1, 0);
      page.drawText(line, { x: p.x, y: p.y, rotate: p.rotate, size: e.size, font, color: hexToRgb(e.color) });
    });
    return;
  }
  const scale = Math.min(TEXT_PX_PER_PT, Math.sqrt(MAX_PIXELS / Math.max(1, L.w * L.h)));
  const { canvas, layout } = textToCanvas(e, scale);
  const png = await kit.doc.embedPng(await canvasBytes(canvas, 'image/png'));
  page.drawImage(png, placeBox(viewport, layout.left, layout.top, layout.w, layout.h));
  // Invisible copy of the words so they can still be searched and copied (only for characters
  // the built-in PDF font knows; other scripts stay as picture only).
  layout.lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const natural = kit.helv.widthOfTextAtSize(line, e.size);
      const size = natural > 0 ? e.size * (layout.lineWidths[i] / natural) : e.size;
      const p = placeBox(viewport, e.x, e.baseline + i * layout.lh, 1, 0);
      page.drawText(line, { x: p.x, y: p.y, rotate: p.rotate, size: Math.max(1, size), font: kit.helv, opacity: 0 });
    } catch { kit.notes.unsearchable = true; }
  });
}

async function embedAsset(kit, id) {
  if (!kit.embedded.has(id)) {
    const a = kit.assets[id];
    if (!a) throw new Error('A picture in your changes is missing. Remove it and add it again.');
    const bytes = dataUrlBytes(a.data);
    kit.embedded.set(id, a.mime === 'image/jpeg' ? await kit.doc.embedJpg(bytes) : await kit.doc.embedPng(bytes));
  }
  return kit.embedded.get(id);
}

async function drawEditsVector(kit, page, viewport, edits) {
  for (const e of edits) {
    if (e.type === 'text') {
      if (e.cover) page.drawRectangle({ ...placeBox(viewport, e.cover.x, e.cover.y, e.cover.w, e.cover.h), color: hexToRgb(e.cover.color), borderWidth: 0 });
      if (e.text.trim()) await drawTextVector(kit, page, viewport, e);
    } else if (e.type === 'box') {
      page.drawRectangle({ ...placeBox(viewport, e.x, e.y, e.w, e.h), color: hexToRgb(e.color), borderWidth: 0 });
    } else if (e.type === 'image') {
      page.drawImage(await embedAsset(kit, e.asset), placeBox(viewport, e.x, e.y, e.w, e.h));
    } else if (e.type === 'shape') {
      const stroke = e.width > 0 ? { borderColor: hexToRgb(e.color), borderWidth: e.width } : {};
      const fill = e.fill ? hexToRgb(e.fill) : undefined;
      const x = Math.min(e.x, e.x + e.w); const y = Math.min(e.y, e.y + e.h); const w = Math.abs(e.w); const h = Math.abs(e.h);
      if (e.shape === 'line') {
        page.drawLine({ start: pdfPoint(viewport, e.x, e.y), end: pdfPoint(viewport, e.x + e.w, e.y + e.h), thickness: e.width, color: hexToRgb(e.color), lineCap: LineCapStyle.Round });
      } else if (e.shape === 'ellipse') {
        const c = pdfPoint(viewport, x + w / 2, y + h / 2);
        page.drawEllipse({ x: c.x, y: c.y, xScale: w / 2, yScale: h / 2, rotate: placeBox(viewport, x, y, w, h).rotate, color: fill, ...stroke });
      } else {
        page.drawRectangle({ ...placeBox(viewport, x, y, w, h), color: fill, ...stroke });
      }
    } else if (e.type === 'ink') {
      const pts = e.points.length === 1 ? [e.points[0], [e.points[0][0] + 0.01, e.points[0][1]]] : e.points;
      const d = pts.map(([px, py], k) => { const p = pdfPoint(viewport, px, py); return `${k ? 'L' : 'M'}${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`; }).join(' ');
      page.drawSvgPath(d, { x: 0, y: 0, borderColor: hexToRgb(e.color), borderWidth: e.width, borderLineCap: LineCapStyle.Round });
    } else if (e.type === 'mark') {
      if (e.kind === 'highlight') {
        page.drawRectangle({ ...placeBox(viewport, e.x, e.y, e.w, e.h), color: hexToRgb(e.color), opacity: HIGHLIGHT_ALPHA, blendMode: BlendMode.Multiply, borderWidth: 0 });
      } else {
        const { y, t } = markLine(e);
        page.drawRectangle({ ...placeBox(viewport, e.x, y - t / 2, e.w, t), color: hexToRgb(e.color), borderWidth: 0 });
      }
    }
  }
}

// Draws changes onto a page picture (used for "erase for real" and for protected files).
function drawEditsRaster(ctx, edits, scale, images) {
  for (const e of edits) {
    if (e.type === 'text') {
      if (e.cover) { ctx.fillStyle = e.cover.color; ctx.fillRect(e.cover.x * scale, e.cover.y * scale, e.cover.w * scale, e.cover.h * scale); }
      if (e.text.trim()) drawText(ctx, e, scale, 0, 0);
    } else if (e.type !== 'link') {
      drawItem(ctx, e, scale, 0, 0, images && images.get(e.asset));
    }
  }
}

async function pictureOf(canvas) {
  const [jpg, png] = await Promise.all([canvasBytes(canvas, 'image/jpeg', 0.92), canvasBytes(canvas, 'image/png')]);
  canvas.width = canvas.height = 0;
  return png.length <= jpg.length ? { bytes: png, isPng: true } : { bytes: jpg, isPng: false };
}

// `src` null = a blank page the user inserted (w, h in points).
async function renderPageImage(pdfjsDoc, src, edits, images, w, h) {
  let base = { width: w, height: h };
  let page = null;
  if (src !== null) { page = await pdfjsDoc.getPage(src + 1); base = page.getViewport({ scale: 1 }); }
  const scale = Math.min(PAGE_PX_PER_PT, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(base.width * scale);
  canvas.height = Math.ceil(base.height * scale);
  const ctx = canvas.getContext('2d');
  if (page) {
    // ENABLE_STORAGE: form fields are drawn with the values typed in this editor.
    await page.render({ canvas, viewport: page.getViewport({ scale }), annotationMode: AnnotationMode.ENABLE_STORAGE }).promise;
  } else {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawEditsRaster(ctx, edits, scale, images);
  return { w: base.width, h: base.height, ...(await pictureOf(canvas)) };
}

// Replaces a page's content with a picture of it, keeping the same page object (so bookmarks still point to it).
async function turnPageIntoPicture(doc, page, pdfjsDoc, src, edits, images) {
  const img = await renderPageImage(pdfjsDoc, src, edits, images);
  const node = page.node;
  for (const k of ['Annots', 'StructParents', 'Group', 'Thumb', 'PieceInfo', 'B']) node.delete(PDFName.of(k));
  node.set(PDFName.of('Contents'), doc.context.obj([]));
  node.set(PDFName.of('Resources'), doc.context.obj({}));
  page.setRotation(degrees(0));
  page.setMediaBox(0, 0, img.w, img.h);
  page.setCropBox(0, 0, img.w, img.h);
  page.setBleedBox(0, 0, img.w, img.h);
  page.setTrimBox(0, 0, img.w, img.h);
  page.setArtBox(0, 0, img.w, img.h);
  const embedded = img.isPng ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  page.drawImage(embedded, { x: 0, y: 0, width: img.w, height: img.h });
}

// Deletes objects nothing points to any more (e.g. the old text of a page turned into a picture).
function removeUnreachable(doc) {
  const ctx = doc.context;
  const seen = new Set();
  const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info];
  while (stack.length) {
    const o = stack.pop();
    if (!o) continue;
    if (o instanceof PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
      stack.push(ctx.lookup(o));
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) stack.push(v);
    } else if (o instanceof PDFArray) {
      stack.push(...o.asArray());
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.tag)) { ctx.delete(ref); removed++; }
  return removed;
}

// Adds clickable links. Page numbers count pages in the saved file.
function addLinks(doc, outPages, layout, viewports, byPage, notes) {
  layout.forEach((entry, k) => {
    for (const e of byPage.get(entry.id) || []) {
      if (e.type !== 'link') continue;
      const t = parseLinkTarget(e.url);
      if (!t || (t.page && (t.page < 1 || t.page > outPages.length))) { notes.badLinks++; continue; }
      const vp = viewports[entry.id];
      const corners = [[e.x, e.y], [e.x + e.w, e.y], [e.x, e.y + e.h], [e.x + e.w, e.y + e.h]].map(([x, y]) => vp.convertToPdfPoint(x, y));
      const xs = corners.map((c) => c[0]); const ys = corners.map((c) => c[1]);
      const dict = { Type: 'Annot', Subtype: 'Link', Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], Border: [0, 0, 0], F: 4 };
      if (t.url) dict.A = { Type: 'Action', S: 'URI', URI: PDFString.of(t.url) };
      else dict.Dest = [outPages[t.page - 1].ref, 'Fit'];
      outPages[k].node.addAnnot(doc.context.register(doc.context.obj(dict)));
    }
  });
}

// Puts the values typed into form fields into the file's own form.
function fillForm(doc, forms, notes) {
  const names = Object.keys(forms || {});
  if (!names.length) return false;
  let form;
  try { form = doc.getForm(); } catch { notes.formProblems += names.length; return false; }
  for (const name of names) {
    const v = forms[name];
    try {
      const f = form.getField(name);
      if (f instanceof PDFTextField) f.setText(String(v ?? ''));
      else if (f instanceof PDFCheckBox) { if (v === true) f.check(); else f.uncheck(); }
      else if (f instanceof PDFRadioGroup) f.select(String(v));
      else if (f instanceof PDFDropdown || f instanceof PDFOptionList) f.select(Array.isArray(v) ? v : String(v));
      else notes.formProblems++;
    } catch { notes.formProblems++; }
  }
  return true;
}

// Checks the new file by opening it again with a separate reader before it is offered for download.
async function verify(bytes, expectedPages, editedPages, erasedPages) {
  const task = getDocument({ data: bytes.slice(), isEvalSupported: false });
  const pdf = await task.promise;
  try {
    if (pdf.numPages !== expectedPages) throw new Error(`The new file has ${pdf.numPages} pages instead of ${expectedPages}.`);
    for (const i of editedPages) {
      const page = await pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: 0.25 });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({ canvas: c, viewport: vp }).promise;
      c.width = c.height = 0;
      if (erasedPages.has(i)) {
        const tc = await page.getTextContent();
        if (tc.items.some((it) => it.str && it.str.trim())) throw new Error(`Page ${i + 1} still contains text after erasing.`);
      }
    }
  } finally {
    await task.destroy();
  }
}

/**
 * opts: { originalBytes, pdfjsDoc, numPages, viewports, edits, erase, imageOnly, onProgress,
 *         layout, forms, assets, images }
 *  - viewports[id]: viewport of page `id` (edits store their page id in `e.page`)
 *  - layout: pages of the new file in order: { id, src (original page index, or null for a blank page), rot, w, h }
 *  - forms: { fieldName: value }, assets: { id: { mime, data } }, images: Map(assetId -> decoded image)
 * Returns { bytes, notes }.
 */
export async function buildEditedPdf(opts) {
  const { originalBytes, pdfjsDoc, numPages, viewports, edits, erase, imageOnly, onProgress = () => {} } = opts;
  const layout = opts.layout || [...Array(numPages).keys()].map((i) => ({ id: i, src: i, rot: 0 }));
  const forms = opts.forms || {};
  const byPage = new Map();
  for (const e of edits) {
    if (!byPage.has(e.page)) byPage.set(e.page, []);
    byPage.get(e.page).push(e);
  }
  const notes = { unsearchable: false, picturePages: [], badLinks: 0, formProblems: 0 };
  const kit = { doc: null, helv: null, fonts: new Map(), embedded: new Map(), assets: opts.assets || {}, notes };
  let doc;
  const touched = [];

  if (imageOnly) {
    doc = await PDFDocument.create();
    kit.doc = doc;
    for (let k = 0; k < layout.length; k++) {
      const entry = layout[k];
      onProgress(k / layout.length, `Drawing page ${k + 1} of ${layout.length}`);
      const img = await renderPageImage(pdfjsDoc, entry.src, byPage.get(entry.id) || [], opts.images, entry.w, entry.h);
      const page = doc.addPage([img.w, img.h]);
      const embedded = img.isPng ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
      page.drawImage(embedded, { x: 0, y: 0, width: img.w, height: img.h });
      if (entry.rot) page.setRotation(degrees(entry.rot));
      notes.picturePages.push(k);
      touched.push(k);
    }
    addLinks(doc, doc.getPages(), layout, viewports, byPage, notes);
  } else {
    doc = await PDFDocument.load(originalBytes.slice(), { updateMetadata: false });
    if (doc.getPageCount() !== numPages) throw new Error('The file could not be read the same way twice. Nothing was saved.');
    kit.doc = doc;
    kit.helv = await doc.embedFont(StandardFonts.Helvetica);
    const srcPages = doc.getPages();
    const kept = new Set(layout.filter((x) => x.src !== null).map((x) => x.src));
    const erased = new Set();
    const editedSrc = layout.filter((x) => x.src !== null && byPage.has(x.id));
    let n = 0;
    for (const entry of editedSrc) {
      onProgress(n++ / Math.max(1, editedSrc.length), `Applying changes on page ${entry.src + 1}`);
      const list = byPage.get(entry.id);
      if (erase && list.some(hasCover)) {
        await turnPageIntoPicture(doc, srcPages[entry.src], pdfjsDoc, entry.src, list, opts.images);
        erased.add(entry.src);
      } else {
        await drawEditsVector(kit, srcPages[entry.src], viewports[entry.id], list);
      }
    }
    // Page changes: remove deleted pages, insert blank ones, turn pages.
    for (let i = numPages - 1; i >= 0; i--) if (!kept.has(i)) doc.removePage(i);
    for (let k = 0; k < layout.length; k++) {
      const entry = layout[k];
      if (entry.src !== null) {
        if (entry.rot) { const pg = srcPages[entry.src]; pg.setRotation(degrees((pg.getRotation().angle + entry.rot) % 360)); }
        if (byPage.has(entry.id) || entry.rot) touched.push(k);
        if (erased.has(entry.src)) notes.picturePages.push(k);
      } else {
        const pg = doc.insertPage(k, [entry.w, entry.h]);
        if (entry.rot) pg.setRotation(degrees(entry.rot));
        await drawEditsVector(kit, pg, viewports[entry.id], byPage.get(entry.id) || []);
        touched.push(k);
      }
    }
    addLinks(doc, doc.getPages(), layout, viewports, byPage, notes);
    if (erased.size || kept.size < numPages) removeUnreachable(doc);
  }

  onProgress(0.95, 'Writing the new file');
  let bytes;
  if (!imageOnly && fillForm(doc, forms, notes)) {
    try {
      bytes = await doc.save();
    } catch {
      // Letters the built-in form font cannot draw: keep the values and let the reader draw them.
      doc.getForm().acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
      bytes = await doc.save({ updateFieldAppearances: false });
    }
  } else {
    bytes = await doc.save();
  }
  onProgress(0.97, 'Checking the new file opens correctly');
  await verify(bytes, layout.length, touched, new Set(notes.picturePages));
  onProgress(1, 'Done');
  return { bytes, notes };
}

// Quick look at the file: can it be rewritten safely, and is it digitally signed?
export async function inspect(originalBytes) {
  try {
    const doc = await PDFDocument.load(originalBytes.slice(), { updateMetadata: false });
    let signed = false;
    try { signed = doc.getForm().getFields().some((f) => f instanceof PDFSignature); } catch { /* no form */ }
    return { ok: true, signed };
  } catch (err) {
    return { ok: false, encrypted: /encrypt/i.test(String(err && err.message)), reason: String(err && err.message) };
  }
}
