// Builds the edited copy. The original bytes are only ever read (copied), never changed.
import {
  PDFDocument, PDFName, PDFRef, PDFDict, PDFArray, PDFStream, PDFSignature, PDFString, PDFHexString,
  StandardFonts, rgb, degrees, BlendMode, LineCapStyle,
} from '../vendor/pdf-lib.esm.min.js';
import { getDocument, AnnotationMode } from '../vendor/pdf.min.mjs';
import { textToCanvas, drawText, layoutText } from './textdraw.js';
import { parts, bounds, drawObjectCanvas, linkTarget, NOTE_SIZE } from './objects.js';

const TEXT_PX_PER_PT = 4;          // ~288 dpi for edited text
const PAGE_PX_PER_PT = 200 / 72;   // 200 dpi for pages turned into pictures
const MAX_PIXELS = 24e6;

// Objects that become annotations or form fields (kept separate from the page drawing).
const ANNOT_TYPES = new Set(['link', 'note', 'field']);
export const isAnnot = (e) => ANNOT_TYPES.has(e.type);

function hexToRgb(hex) {
  const n = parseInt(String(hex || '#000000').slice(1), 16) || 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function hexToArr(hex) {
  const c = hexToRgb(hex);
  return [c.red, c.green, c.blue];
}

function canvasBytes(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(async (b) => {
    if (!b) return reject(new Error('Could not draw the image (the device may be low on memory).'));
    resolve(new Uint8Array(await b.arrayBuffer()));
  }, type, quality));
}

// True when a change hides something that is in the original page.
export function hasCover(e) {
  return e.type === 'box' || (e.type === 'text' && e.cover);
}

// A viewport for a plain page (blank pages and pages turned into pictures).
export function flatViewport(w, h) {
  return { width: w, height: h, convertToPdfPoint: (x, y) => [x, h - y] };
}

// Maps a box given in on-screen page points (top-left origin, after page rotation) into PDF space.
function placeBox(viewport, x, y, w, h) {
  const p0 = viewport.convertToPdfPoint(x, y + h);
  const p1 = viewport.convertToPdfPoint(x + w, y + h);
  const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
  return { x: p0[0], y: p0[1], width: w, height: h, rotate: degrees(Math.round(angle * 1000) / 1000) };
}

// An upright PDF rectangle [x1 y1 x2 y2] around an on-screen box (for annotations).
function pdfRect(viewport, b) {
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => viewport.convertToPdfPoint(x, y));
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function drawVectorObject(page, viewport, e) {
  const p0 = viewport.convertToPdfPoint(0, 0);
  const p1 = viewport.convertToPdfPoint(1, 0);
  const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
  for (const part of parts(e)) {
    const o = { x: p0[0], y: p0[1], rotate: degrees(Math.round(angle * 1000) / 1000) };
    if (part.fill) { o.color = hexToRgb(part.fill); o.opacity = part.opacity ?? 1; }
    if (part.stroke) {
      o.borderColor = hexToRgb(part.stroke); o.borderWidth = part.lw; o.borderOpacity = part.opacity ?? 1;
      o.borderLineCap = part.butt ? LineCapStyle.Butt : LineCapStyle.Round;
    }
    if (part.multiply) o.blendMode = BlendMode.Multiply;
    page.drawSvgPath(part.d, o);
  }
}

async function embedAsset(doc, cache, assets, id) {
  if (cache.has(id)) return cache.get(id);
  const a = assets.get(id);
  if (!a) return null;
  const img = a.kind === 'jpg' ? await doc.embedJpg(a.bytes) : await doc.embedPng(a.bytes);
  cache.set(id, img);
  return img;
}

// Fonts with the same letter widths as the fonts built into every PDF reader. Text in these is saved as
// real, sharp text instead of a picture (when all its letters exist in the built-in fonts).
const STANDARD = [
  [/^(arial|helvetica|liberation sans|arimo|freesans|nimbus sans( l)?)$/i, ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique']],
  [/^(times new roman|times|liberation serif|tinos|freeserif|nimbus roman( no9 l)?)$/i, ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic']],
  [/^(courier new|courier|liberation mono|cousine|freemono|nimbus mono( ps)?)$/i, ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique']],
];
async function drawStandardText(doc, page, viewport, e, ctx) {
  const row = STANDARD.find(([re]) => re.test(String(e.family || '').trim()));
  if (!row) return false;
  const key = row[1][(e.bold ? 1 : 0) + (e.italic ? 2 : 0)];
  ctx.std = ctx.std || new Map();
  if (!ctx.std.has(key)) ctx.std.set(key, await doc.embedFont(StandardFonts[key]));
  const font = ctx.std.get(key);
  const L = layoutText(e);
  try { for (const line of L.lines) font.encodeText(line); } catch { return false; } // a letter the built-in font lacks
  L.lines.forEach((line, i) => {
    if (!line) return;
    const p = placeBox(viewport, e.x, e.baseline + i * L.lh, 1, 0);
    page.drawText(line, { x: p.x, y: p.y, rotate: p.rotate, size: e.size, font, color: hexToRgb(e.color) });
  });
  return true;
}

async function drawEditsVector(doc, page, viewport, edits, helv, notes, ctx) {
  for (const e of edits) {
    if (isAnnot(e)) continue;
    if (e.type === 'image') {
      const img = await embedAsset(doc, ctx.imgCache, ctx.assets, e.asset);
      if (img) page.drawImage(img, { ...placeBox(viewport, e.x, e.y, e.w, e.h), opacity: e.opacity ?? 1 });
      continue;
    }
    if (e.type !== 'text') { drawVectorObject(page, viewport, e); continue; }
    if (e.cover) drawVectorObject(page, viewport, { type: 'box', ...e.cover });
    if (!e.text.trim()) continue;
    if (await drawStandardText(doc, page, viewport, e, ctx)) continue;
    const L0 = layoutText(e);
    const scale = Math.min(TEXT_PX_PER_PT, Math.sqrt(MAX_PIXELS / Math.max(1, L0.w * L0.h)));
    const { canvas, layout: L } = textToCanvas(e, scale);
    const png = await doc.embedPng(await canvasBytes(canvas, 'image/png'));
    page.drawImage(png, placeBox(viewport, L.left, L.top, L.w, L.h));
    // Invisible copy of the words so they can still be searched and copied (only for characters
    // the built-in PDF font knows; other scripts stay as picture only).
    L.lines.forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const natural = helv.widthOfTextAtSize(line, e.size);
        const size = natural > 0 ? e.size * (L.lineWidths[i] / natural) : e.size;
        const p = placeBox(viewport, e.x, e.baseline + i * L.lh, 1, 0);
        page.drawText(line, { x: p.x, y: p.y, rotate: p.rotate, size: Math.max(1, size), font: helv, opacity: 0 });
      } catch { notes.unsearchable = true; }
    });
  }
}

async function renderPageImage(pdfjsDoc, src, edits, getBitmap) {
  let canvas; let base; let scale;
  if (src.blank) {
    base = { width: src.w, height: src.h };
    scale = Math.min(PAGE_PX_PER_PT, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(base.width * scale); canvas.height = Math.ceil(base.height * scale);
    const c = canvas.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const page = await pdfjsDoc.getPage(src.i + 1);
    base = page.getViewport({ scale: 1 });
    scale = Math.min(PAGE_PX_PER_PT, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
    const vp = page.getViewport({ scale });
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    // ENABLE_STORAGE: form fields are drawn with the values typed in this editor
    await page.render({ canvas, viewport: vp, annotationMode: AnnotationMode.ENABLE_STORAGE }).promise;
  }
  const ctx = canvas.getContext('2d');
  for (const e of edits) {
    if (isAnnot(e)) continue;
    if (e.type === 'text') {
      if (e.cover) { ctx.fillStyle = e.cover.color; ctx.fillRect(e.cover.x * scale, e.cover.y * scale, e.cover.w * scale, e.cover.h * scale); }
      if (e.text.trim()) drawText(ctx, e, scale, 0, 0);
    } else {
      drawObjectCanvas(ctx, e, scale, getBitmap);
    }
  }
  const [jpg, png] = await Promise.all([canvasBytes(canvas, 'image/jpeg', 0.92), canvasBytes(canvas, 'image/png')]);
  canvas.width = canvas.height = 0;
  return { w: base.width, h: base.height, bytes: png.length <= jpg.length ? png : jpg, isPng: png.length <= jpg.length };
}

// Replaces a page's content with a picture of it, keeping the same page object (so bookmarks still point to it).
async function turnPageIntoPicture(doc, pdfjsDoc, src, edits, getBitmap) {
  const img = await renderPageImage(pdfjsDoc, src, edits, getBitmap);
  const page = doc.getPage(src.i);
  clearPage(page);
  page.setRotation(degrees(0));
  page.setMediaBox(0, 0, img.w, img.h);
  page.setCropBox(0, 0, img.w, img.h);
  page.setBleedBox(0, 0, img.w, img.h);
  page.setTrimBox(0, 0, img.w, img.h);
  page.setArtBox(0, 0, img.w, img.h);
  const embedded = img.isPng ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  page.drawImage(embedded, { x: 0, y: 0, width: img.w, height: img.h });
  return flatViewport(img.w, img.h);
}

function clearPage(page) {
  const node = page.node;
  for (const k of ['Annots', 'StructParents', 'Group', 'Thumb', 'PieceInfo', 'B']) node.delete(PDFName.of(k));
  node.set(PDFName.of('Contents'), page.doc.context.obj([]));
  node.set(PDFName.of('Resources'), page.doc.context.obj({}));
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

function addAnnot(page, dict) {
  const ctx = page.doc.context;
  const ref = ctx.register(ctx.obj(dict));
  let annots = page.node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) { annots = ctx.obj([]); page.node.set(PDFName.of('Annots'), annots); }
  annots.push(ref);
  return ref;
}

const pdfText = (s) => (/^[\x20-\x7e]*$/.test(s) ? PDFString.of(s) : PDFHexString.fromText(s));

function uniqueName(form, base, used) {
  let name = String(base || 'Field').replace(/[.\s]+/g, '_') || 'Field';
  let k = 2;
  const taken = (nm) => used.has(nm) || !!form.getFieldMaybe(nm);
  const root = name;
  while (taken(name)) name = `${root}_${k++}`;
  used.add(name);
  return name;
}

// Links, notes and new form fields. `finalPages` = pdf-lib pages in saved order (for links to pages).
function addAnnotations(doc, page, viewport, edits, finalPages, notes, ctx) {
  for (const e of edits) {
    if (!isAnnot(e)) continue;
    const b = bounds(e);
    const rect = pdfRect(viewport, b);
    if (e.type === 'link') {
      const t = linkTarget(e.target, finalPages.length);
      if (!t) { notes.badLinks++; continue; }
      const dict = { Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], F: 4 };
      if (t.page !== undefined) dict.Dest = [finalPages[t.page].ref, PDFName.of('Fit')];
      else dict.A = { Type: 'Action', S: 'URI', URI: PDFString.of(t.uri) };
      addAnnot(page, dict);
    } else if (e.type === 'note') {
      const [x1, y1] = [rect[0], rect[1]];
      addAnnot(page, {
        Type: 'Annot', Subtype: 'Text', Rect: [x1, y1, x1 + NOTE_SIZE, y1 + NOTE_SIZE], Contents: pdfText(e.text || ''),
        Name: 'Comment', C: hexToArr(e.color || '#f6d743'), Open: false, F: 4, M: PDFString.fromDate(new Date()),
      });
    } else if (e.type === 'field') {
      const form = ctx.form || (ctx.form = doc.getForm());
      const name = uniqueName(form, e.name, ctx.usedNames);
      const place = { ...placeBox(viewport, b.x, b.y, b.w, b.h), borderWidth: 1, borderColor: rgb(0.33, 0.33, 0.33) };
      if (e.kind === 'check') form.createCheckBox(name).addToPage(page, place);
      else {
        const f = form.createTextField(name);
        if (b.h > 40) f.enableMultiline();
        f.addToPage(page, place);
      }
      ctx.fieldsAdded = true;
    }
  }
}

// Checks the new file by opening it again with a separate reader before it is offered for download.
async function verify(bytes, expectedPages, checkPages, erasedPages) {
  const task = getDocument({ data: bytes.slice(), isEvalSupported: false });
  const pdf = await task.promise;
  try {
    if (pdf.numPages !== expectedPages) throw new Error(`The new file has ${pdf.numPages} pages instead of ${expectedPages}.`);
    for (const i of checkPages) {
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
 * opts: {
 *   originalBytes, baseBytes (original with form values filled in, optional), pdfjsDoc, numPages,
 *   pages: [{ i, blank, w, h, vp }] (every page the editor knows, by id), order: [page id...], rot: { id: degrees },
 *   edits, assets: Map(id -> { kind, bytes, bitmap }), attachments: [{ name, bytes, type }],
 *   erase, imageOnly, onProgress
 * }
 * Returns { bytes, notes }.
 */
export async function buildEditedPdf(opts) {
  const {
    originalBytes, baseBytes, pdfjsDoc, numPages, pages, edits, erase, imageOnly, onProgress = () => {},
    assets = new Map(), attachments = [],
  } = opts;
  const order = opts.order || [...Array(numPages).keys()];
  const rot = opts.rot || {};
  const byPage = new Map();
  for (const e of edits) {
    if (!order.includes(e.page)) continue; // page was deleted
    if (!byPage.has(e.page)) byPage.set(e.page, []);
    byPage.get(e.page).push(e);
  }
  const getBitmap = (id) => assets.get(id)?.bitmap || null;
  const notes = { unsearchable: false, picturePages: [], badLinks: 0, deleted: 0 };
  const ctx = { assets, imgCache: new Map(), usedNames: new Set(), form: null, fieldsAdded: false };
  const pdfPage = new Map(); // page id -> pdf-lib page
  const vpOf = new Map();    // page id -> viewport to place annotations with
  let doc;
  let picturesMade = false;

  if (imageOnly) {
    doc = await PDFDocument.create();
    let k = 0;
    for (const id of order) {
      onProgress(k++ / order.length, `Drawing page ${k} of ${order.length}`);
      const img = await renderPageImage(pdfjsDoc, pages[id], byPage.get(id) || [], getBitmap);
      const page = doc.addPage([img.w, img.h]);
      const embedded = img.isPng ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
      page.drawImage(embedded, { x: 0, y: 0, width: img.w, height: img.h });
      notes.picturePages.push(k - 1);
      pdfPage.set(id, page); vpOf.set(id, flatViewport(img.w, img.h));
    }
  } else {
    doc = await PDFDocument.load((baseBytes || originalBytes).slice(), { updateMetadata: false });
    if (doc.getPageCount() !== numPages) throw new Error('The file could not be read the same way twice. Nothing was saved.');
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const all = doc.getPages();
    for (let i = 0; i < numPages; i++) { pdfPage.set(i, all[i]); vpOf.set(i, pages[i].vp); }
    for (const id of order) {
      if (!pages[id].blank) continue;
      const pg = doc.addPage([pages[id].w, pages[id].h]);
      pdfPage.set(id, pg); vpOf.set(id, flatViewport(pages[id].w, pages[id].h));
    }
    const touched = [...byPage.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    let n = 0;
    for (const id of touched) {
      onProgress(n++ / Math.max(1, touched.length), `Applying changes on page ${order.indexOf(id) + 1}`);
      const list = byPage.get(id);
      if (erase && !pages[id].blank && list.some(hasCover)) {
        vpOf.set(id, await turnPageIntoPicture(doc, pdfjsDoc, pages[id], list, getBitmap));
        notes.picturePages.push(order.indexOf(id));
        picturesMade = true;
      } else {
        await drawEditsVector(doc, pdfPage.get(id), vpOf.get(id), list, helv, notes, ctx);
      }
    }
    // Page order, deleted pages and blank pages.
    const identity = order.length === numPages && order.every((id, k) => id === k);
    if (!identity) {
      const count = doc.getPageCount();
      order.forEach((id, k) => doc.insertPage(count + k, pdfPage.get(id)));
      for (let k = count - 1; k >= 0; k--) doc.removePage(k);
      for (let i = 0; i < numPages; i++) {
        if (!order.includes(i)) { clearPage(pdfPage.get(i)); notes.deleted++; }
      }
    }
    if (picturesMade || notes.deleted) removeUnreachable(doc);
  }

  // Turning pages (adds to any turn the page already had).
  for (const id of order) {
    const extra = ((rot[id] || 0) % 360 + 360) % 360;
    if (!extra) continue;
    const pg = pdfPage.get(id);
    pg.setRotation(degrees((pg.getRotation().angle + extra) % 360));
  }

  const finalPages = order.map((id) => pdfPage.get(id));
  for (const id of order) {
    const list = byPage.get(id);
    if (list && list.some(isAnnot)) addAnnotations(doc, pdfPage.get(id), vpOf.get(id), list, finalPages, notes, ctx);
  }

  for (const a of attachments) {
    await doc.attach(a.bytes, a.name, { mimeType: a.type || 'application/octet-stream', description: a.name, creationDate: new Date(), modificationDate: new Date() });
  }

  onProgress(0.95, 'Writing the new file');
  const bytes = await doc.save({ updateFieldAppearances: ctx.fieldsAdded });
  onProgress(0.97, 'Checking the new file opens correctly');
  const check = imageOnly ? order.map((_, k) => k)
    : order.map((id, k) => (byPage.has(id) || pages[id].blank || rot[id] ? k : -1)).filter((k) => k >= 0);
  await verify(bytes, order.length, check, new Set(notes.picturePages.filter(() => !imageOnly)));
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
