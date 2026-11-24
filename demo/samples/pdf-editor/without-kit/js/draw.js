// Draws added things (text, drawings, pictures) to a canvas. The same code is used on screen and
// when saving, so what you see is what ends up in the PDF.
import { fontString } from './fonts.js';

const mctx = document.createElement('canvas').getContext('2d');
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** Right-to-left if the first real letter is Hebrew/Arabic (same rule as the browser's dir="auto"). */
export function isRtl(text) {
  const m = String(text || '').match(/\p{L}/u);
  return !!m && RTL.test(m[0]);
}

/** Measure a text object. Sizes are in PDF points. */
export function layoutText(o) {
  const size = o.size;
  mctx.font = fontString(o, 100);
  const m = mctx.measureText('HgÅy');
  let asc = (m.fontBoundingBoxAscent ?? 80) / 100 * size;
  let desc = (m.fontBoundingBoxDescent ?? 20) / 100 * size;
  if (!(asc > 0)) asc = 0.8 * size;
  if (!(desc >= 0)) desc = 0.2 * size;
  const lh = Math.max(asc + desc, size * 1.15) * (o.lineHeight || 1);
  const lines = String(o.text ?? '').split('\n');
  const hs = o.hscale || 1;
  const widths = lines.map(l => mctx.measureText(l).width / 100 * size * hs);
  // a little room left and right so letters that lean out (italics, some scripts) are not cut off
  const pad = size * 0.12;
  const inner = Math.max(size * 0.3, ...widths);
  const w = inner + 2 * pad;
  const firstBaseline = (lh - (asc + desc)) / 2 + asc;
  return { lines, widths, w, inner, pad, h: lh * lines.length, lh, asc, desc, firstBaseline };
}

/** Make sure a font is ready before drawing with it (fonts load lazily in browsers). */
export async function ensureFont(o) {
  try { await document.fonts.load(fontString(o, 20), o.text || 'A'); } catch {}
}

/** Width of a string in a given font at a size (points), without horizontal scale. */
export function measure(o, text) {
  mctx.font = fontString(o, 100);
  return mctx.measureText(text).width / 100 * o.size;
}

export function hexToRgb(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Render an object (except plain boxes) to a new canvas at k pixels per point.
 * assets: map assetId -> {bitmap}
 */
export function renderObject(o, k, assets) {
  const W = Math.max(1, Math.ceil(o.w * k)), H = Math.max(1, Math.ceil(o.h * k));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  drawObjectInto(ctx, o, k, assets, 0, 0, false);
  return c;
}

/** Draw an object into an existing context whose origin is the page's top-left, at k px per point. */
export function drawObjectInto(ctx, o, k, assets, ox = o.x, oy = o.y, applyRot = true) {
  ctx.save();
  ctx.translate(ox * k, oy * k);
  if (applyRot && o.r) ctx.rotate(o.r * Math.PI / 180); // turned around its top-left corner
  if (o.kind === 'text') {
    if (o.cover && ox !== 0) { /* covers are drawn separately by caller */ }
    const L = layoutText(o);
    ctx.scale(k, k);
    ctx.fillStyle = o.color || '#000';
    ctx.font = fontString(o, o.size);
    ctx.textBaseline = 'alphabetic';
    const rtl = isRtl(o.text);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    const align = o.align || (rtl ? 'right' : 'left');
    L.lines.forEach((line, i) => {
      const lw = L.widths[i];
      let x = L.pad;
      if (align === 'center') x += (L.inner - lw) / 2; else if (align === 'right') x += L.inner - lw;
      ctx.save();
      ctx.translate(x, L.firstBaseline + i * L.lh);
      ctx.scale(o.hscale || 1, 1);
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(line, rtl ? lw / (o.hscale || 1) : 0, 0);
      ctx.restore();
    });
  } else if (o.kind === 'ink') {
    const sx = o.w / o.w0, sy = o.h / o.h0;
    ctx.scale(k, k);
    ctx.strokeStyle = o.color; ctx.lineWidth = o.width * Math.min(sx, sy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const stroke of o.strokes) {
      ctx.beginPath();
      stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy)));
      if (stroke.length === 1) ctx.lineTo(stroke[0][0] * sx + 0.01, stroke[0][1] * sy);
      ctx.stroke();
    }
  } else if (o.kind === 'image') {
    const a = assets[o.assetId];
    if (a && a.bitmap) ctx.drawImage(a.bitmap, 0, 0, o.w * k, o.h * k);
  } else if (o.kind === 'rect') {
    ctx.scale(k, k);
    ctx.globalAlpha = o.opacity ?? 1;
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(0, 0, o.w, o.h); }
    if (o.stroke && o.strokeWidth) {
      ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth;
      ctx.strokeRect(o.strokeWidth / 2, o.strokeWidth / 2, o.w - o.strokeWidth, o.h - o.strokeWidth);
    }
  }
  ctx.restore();
}

/** Draw everything a page has (covers first, then objects) onto a page-sized canvas context. */
export function drawPageObjects(ctx, objects, k, assets) {
  for (const o of objects) {
    if (o.kind === 'text' && o.cover) {
      ctx.fillStyle = o.cover.color || '#fff';
      ctx.fillRect(o.cover.x * k, o.cover.y * k, o.cover.w * k, o.cover.h * k);
    }
  }
  for (const o of objects) drawObjectInto(ctx, o, k, assets);
}

export function canvasToBytes(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => {
      if (!b) { reject(new Error('Could not create image')); return; }
      b.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject);
    }, type, quality);
  });
}
