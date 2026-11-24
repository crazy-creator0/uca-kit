// Builds the edited copy. The original bytes are only ever read (copied), never changed.
import {
  PDFDocument, PDFName, PDFRef, PDFDict, PDFArray, PDFStream, PDFSignature, StandardFonts, rgb, degrees,
} from '../vendor/pdf-lib.esm.min.js';
import { getDocument, AnnotationMode } from '../vendor/pdf.min.mjs';
import { textToCanvas, drawText, layoutText } from './textdraw.js';

const TEXT_PX_PER_PT = 4;          // ~288 dpi for edited text
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

async function drawEditsVector(doc, page, viewport, edits, helv, notes) {
  for (const e of edits) {
    const cover = e.type === 'box' ? e : e.cover;
    if (cover) {
      page.drawRectangle({ ...placeBox(viewport, cover.x, cover.y, cover.w, cover.h), color: hexToRgb(cover.color), borderWidth: 0 });
    }
    if (e.type !== 'text' || !e.text.trim()) continue;
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

async function renderPageImage(pdfjsDoc, index, edits) {
  const page = await pdfjsDoc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(PAGE_PX_PER_PT, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, viewport: vp, annotationMode: AnnotationMode.ENABLE }).promise;
  const ctx = canvas.getContext('2d');
  for (const e of edits) {
    const cover = e.type === 'box' ? e : e.cover;
    if (cover) { ctx.fillStyle = cover.color; ctx.fillRect(cover.x * scale, cover.y * scale, cover.w * scale, cover.h * scale); }
    if (e.type === 'text' && e.text.trim()) drawText(ctx, e, scale, 0, 0);
  }
  const [jpg, png] = await Promise.all([canvasBytes(canvas, 'image/jpeg', 0.92), canvasBytes(canvas, 'image/png')]);
  canvas.width = canvas.height = 0;
  return { w: base.width, h: base.height, bytes: png.length <= jpg.length ? png : jpg, isPng: png.length <= jpg.length };
}

// Replaces a page's content with a picture of it, keeping the same page object (so bookmarks still point to it).
async function turnPageIntoPicture(doc, pdfjsDoc, index, edits) {
  const img = await renderPageImage(pdfjsDoc, index, edits);
  const page = doc.getPage(index);
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
 * opts: { originalBytes, pdfjsDoc, numPages, viewports, edits, erase, imageOnly, onProgress }
 * Returns { bytes, notes }.
 */
export async function buildEditedPdf(opts) {
  const { originalBytes, pdfjsDoc, numPages, viewports, edits, erase, imageOnly, onProgress = () => {} } = opts;
  const byPage = new Map();
  for (const e of edits) {
    if (!byPage.has(e.page)) byPage.set(e.page, []);
    byPage.get(e.page).push(e);
  }
  const notes = { unsearchable: false, picturePages: [] };
  let doc;

  if (imageOnly) {
    doc = await PDFDocument.create();
    for (let i = 0; i < numPages; i++) {
      onProgress(i / numPages, `Drawing page ${i + 1} of ${numPages}`);
      const img = await renderPageImage(pdfjsDoc, i, byPage.get(i) || []);
      const page = doc.addPage([img.w, img.h]);
      const embedded = img.isPng ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
      page.drawImage(embedded, { x: 0, y: 0, width: img.w, height: img.h });
      notes.picturePages.push(i);
    }
  } else {
    doc = await PDFDocument.load(originalBytes.slice(), { updateMetadata: false });
    if (doc.getPageCount() !== numPages) throw new Error('The file could not be read the same way twice. Nothing was saved.');
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const pages = [...byPage.keys()].sort((a, b) => a - b);
    let n = 0;
    for (const i of pages) {
      onProgress(n++ / Math.max(1, pages.length), `Applying changes on page ${i + 1}`);
      const list = byPage.get(i);
      if (erase && list.some(hasCover)) {
        await turnPageIntoPicture(doc, pdfjsDoc, i, list);
        notes.picturePages.push(i);
      } else {
        await drawEditsVector(doc, doc.getPage(i), viewports[i], list, helv, notes);
      }
    }
    if (notes.picturePages.length) removeUnreachable(doc);
  }

  onProgress(0.95, 'Writing the new file');
  const bytes = await doc.save();
  onProgress(0.97, 'Checking the new file opens correctly');
  const touched = imageOnly ? [...Array(numPages).keys()] : [...byPage.keys()];
  await verify(bytes, numPages, touched, new Set(notes.picturePages));
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
