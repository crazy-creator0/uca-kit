// Builds the new PDF. The original file bytes are never modified; a new file is produced.
import { PDFDocument, rgb, degrees } from '../vendor/pdf-lib.esm.min.js';
import { renderObject, drawPageObjects, canvasToBytes, hexToRgb } from './draw.js';

export class NeedsImageMode extends Error {}

const col = hex => { const [r, g, b] = hexToRgb(hex); return rgb(r / 255, g / 255, b / 255); };

/** Does this page have something that hides content underneath (white-out or edited text)? */
export function pageHasCovers(p) {
  return p.objects.some(o => (o.kind === 'text' && o.cover) || (o.kind === 'rect' && o.fill && (o.opacity ?? 1) >= 0.99));
}

/**
 * ctx: { docs, pages, assets, getPdfPage(docId, src) -> pdf.js page }
 * opts: { removeCovered: bool, imageMode: bool, onProgress(fraction, text) }
 */
export async function buildPdf(ctx, opts) {
  const { docs, pages, assets, getPdfPage } = ctx;
  const progress = opts.onProgress || (() => {});
  const flatten = new Set();
  pages.forEach((p, i) => {
    if (opts.imageMode || (opts.removeCovered && pageHasCovers(p))) flatten.add(i);
  });

  // Were any pages of the main file removed? Then build a fresh file so removed pages are really gone.
  const mainUsed = new Set(pages.filter(p => p.docId === 0).map(p => p.src));
  const mainCount = docs[0].numPages;
  const deleted = mainUsed.size < mainCount;
  const rebuild = opts.imageMode || flatten.size > 0 || deleted;

  const libDocs = {};
  async function lib(docId) {
    if (!libDocs[docId]) {
      try {
        libDocs[docId] = await PDFDocument.load(docs[docId].bytes.slice(), { updateMetadata: false });
      } catch (e) {
        if (/encrypt/i.test(String(e && e.message))) throw new NeedsImageMode('encrypted');
        throw new NeedsImageMode(String(e && e.message || e));
      }
    }
    return libDocs[docId];
  }

  let out;
  const libPages = new Array(pages.length).fill(null); // pdf-lib page for each of our pages
  progress(0.02, 'Preparing pages…');

  if (!rebuild) {
    out = await lib(0);
    const orig = out.getPages();
    const used = new Set();
    const plan = [];
    for (const p of pages) {
      if (p.docId === 0 && !used.has(p.src)) { used.add(p.src); plan.push(orig[p.src]); }
      else if (p.docId === 0) { const [cp] = await out.copyPages(out, [p.src]); plan.push(cp); }
      else if (p.docId == null) plan.push(null);
      else { const [cp] = await out.copyPages(await lib(p.docId), [p.src]); plan.push(cp); }
    }
    const same = plan.length === orig.length && plan.every((pg, i) => pg === orig[i]);
    if (!same) {
      for (let i = orig.length - 1; i >= 0; i--) out.removePage(i);
      plan.forEach((pg, i) => {
        libPages[i] = pg ? out.addPage(pg) : out.addPage([pages[i].baseW, pages[i].baseH]);
      });
    } else plan.forEach((pg, i) => { libPages[i] = pg; });
  } else {
    out = await PDFDocument.create();
    // keep the title/author if we can read them
    if (!opts.imageMode) {
      try {
        const src = await lib(0);
        const t = src.getTitle(); if (t) out.setTitle(t);
        const a = src.getAuthor(); if (a) out.setAuthor(a);
      } catch (e) { if (e instanceof NeedsImageMode) throw e; }
    }
    // copy normal pages in one batch per source file (so fonts are shared, keeping the file small)
    const byDoc = new Map();
    pages.forEach((p, i) => {
      if (flatten.has(i) || p.docId == null) return;
      if (!byDoc.has(p.docId)) byDoc.set(p.docId, []);
      byDoc.get(p.docId).push(i);
    });
    const copied = new Map();
    for (const [docId, idxs] of byDoc) {
      const cps = await out.copyPages(await lib(docId), idxs.map(i => pages[i].src));
      idxs.forEach((i, n) => copied.set(i, cps[n]));
    }
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (flatten.has(i)) {
        progress(0.05 + 0.75 * i / pages.length, `Making page ${i + 1} of ${pages.length}…`);
        const jpg = await rasterPage(p, assets, getPdfPage);
        const img = await out.embedJpg(jpg);
        const pg = out.addPage([p.baseW, p.baseH]);
        pg.drawImage(img, { x: 0, y: 0, width: p.baseW, height: p.baseH });
        libPages[i] = pg;
      } else if (p.docId == null) {
        libPages[i] = out.addPage([p.baseW, p.baseH]);
      } else {
        libPages[i] = out.addPage(copied.get(i));
      }
    }
  }

  // Draw added things onto pages that were not turned into images.
  const embedded = new Map();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pg = libPages[i];
    const flat = flatten.has(i);
    const baseRot = flat || p.docId == null ? 0 : ((p.origRotate || 0) % 360);
    if (!flat && p.objects.length) {
      progress(0.1 + 0.8 * i / pages.length, `Adding your changes to page ${i + 1}…`);
      const conv = await converter(p, getPdfPage);
      for (const o of p.objects) await drawObject(out, pg, o, conv, assets, embedded);
    }
    pg.setRotation(degrees((baseRot + (p.rot || 0)) % 360));
  }

  progress(0.92, 'Writing file…');
  const bytes = await out.save({ useObjectStreams: true });
  progress(1, 'Done');
  return bytes;
}

/** Function converting our page coordinates (points, from top-left, as displayed) to PDF coordinates. */
async function converter(p, getPdfPage) {
  if (p.docId == null) return (x, y) => [x, p.baseH - y];
  const page = await getPdfPage(p.docId, p.src);
  const vp = page.getViewport({ scale: 1 });
  return (x, y) => vp.convertToPdfPoint(x, y);
}

function place(conv, x, y, w, h, r = 0) {
  // corners of the item, turned by r degrees (clockwise on screen) around its top-left corner
  const t = r * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t);
  const at = (px, py) => conv(x + px * cos - py * sin, y + px * sin + py * cos);
  const bl = at(0, h), br = at(w, h);
  const ang = Math.atan2(br[1] - bl[1], br[0] - bl[0]) * 180 / Math.PI;
  return { x: bl[0], y: bl[1], rotate: degrees(Math.round(ang * 1000) / 1000) };
}

async function drawObject(out, pg, o, conv, assets, embedded) {
  if (o.kind === 'text' && o.cover) {
    const c = o.cover;
    pg.drawRectangle({ ...place(conv, c.x, c.y, c.w, c.h), width: c.w, height: c.h, color: col(c.color || '#ffffff') });
  }
  if (o.kind === 'rect') {
    const opt = { ...place(conv, o.x, o.y, o.w, o.h), width: o.w, height: o.h };
    if (o.fill) { opt.color = col(o.fill); opt.opacity = o.opacity ?? 1; }
    if (o.stroke && o.strokeWidth) { opt.borderColor = col(o.stroke); opt.borderWidth = o.strokeWidth; opt.borderOpacity = o.opacity ?? 1; }
    pg.drawRectangle(opt);
    return;
  }
  if (o.kind === 'text' && !String(o.text || '').trim()) return; // text deleted: only the cover stays
  let img;
  if (o.kind === 'image') {
    img = embedded.get(o.assetId);
    if (!img) {
      const a = assets[o.assetId];
      img = a.mime === 'image/jpeg' ? await out.embedJpg(a.bytes) : await out.embedPng(a.bytes);
      embedded.set(o.assetId, img);
    }
  } else {
    // text and drawings become a sharp, transparent picture (about 300 dpi, capped for huge items)
    let k = 300 / 72;
    const maxPx = 4000;
    k = Math.min(k, maxPx / Math.max(1, o.w), maxPx / Math.max(1, o.h));
    k = Math.max(k, 1);
    const canvas = renderObject(o, k, assets);
    img = await out.embedPng(await canvasToBytes(canvas));
  }
  pg.drawImage(img, { ...place(conv, o.x, o.y, o.w, o.h, o.r || 0), width: o.w, height: o.h });
}

/** Turn a page (with its changes) into a JPEG picture at about 150 dpi. */
async function rasterPage(p, assets, getPdfPage) {
  const k = 150 / 72;
  const scale = Math.min(k, 4000 / Math.max(p.baseW, p.baseH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(p.baseW * scale);
  canvas.height = Math.ceil(p.baseH * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (p.docId != null) {
    const page = await getPdfPage(p.docId, p.src);
    const vp = page.getViewport({ scale });
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
  }
  drawPageObjects(ctx, p.objects, scale, assets);
  const bytes = await canvasToBytes(canvas, 'image/jpeg', 0.85);
  canvas.width = canvas.height = 0;
  return bytes;
}
