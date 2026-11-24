// Changes other than text: cover boxes, pictures and signatures, shapes, freehand lines, highlights and links.
// Like text changes, all sizes are in PDF points with a top-left origin. The same drawing code is used
// on screen and for pages saved as pictures; export.js draws the same shapes as real PDF graphics.

export const HIGHLIGHT_ALPHA = 0.45;
export const RESIZABLE = new Set(['box', 'image', 'shape', 'mark', 'link']);

// Where the line of an underline / strike-out sits inside its box, and how thick it is.
export function markLine(e) {
  return { y: e.y + e.h * (e.kind === 'strike' ? 0.55 : 0.92), t: Math.max(0.6, e.h * 0.07) };
}

export function itemBox(e) {
  if (e.type === 'ink') {
    const xs = e.points.map((p) => p[0]);
    const ys = e.points.map((p) => p[1]);
    const pad = e.width / 2 + 1;
    const left = Math.min(...xs) - pad; const top = Math.min(...ys) - pad;
    return { left, top, w: Math.max(...xs) + pad - left, h: Math.max(...ys) + pad - top };
  }
  let pad = 0;
  if (e.type === 'shape') pad = e.shape === 'line' ? Math.max(4, e.width / 2 + 1) : e.width / 2 + 1;
  return {
    left: Math.min(e.x, e.x + e.w) - pad, top: Math.min(e.y, e.y + e.h) - pad,
    w: Math.abs(e.w) + pad * 2, h: Math.abs(e.h) + pad * 2,
  };
}

// Draws one change onto a 2D canvas. `s` = pixels per point; (ox, oy) = the point that maps to pixel (0,0).
// `img` is the decoded picture for image changes.
export function drawItem(ctx, e, s, ox, oy, img) {
  const X = (x) => (x - ox) * s;
  const Y = (y) => (y - oy) * s;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (e.type === 'box') {
    ctx.fillStyle = e.color;
    ctx.fillRect(X(e.x), Y(e.y), e.w * s, e.h * s);
  } else if (e.type === 'image') {
    if (img) ctx.drawImage(img, X(e.x), Y(e.y), e.w * s, e.h * s);
  } else if (e.type === 'shape') {
    ctx.beginPath();
    if (e.shape === 'line') { ctx.moveTo(X(e.x), Y(e.y)); ctx.lineTo(X(e.x + e.w), Y(e.y + e.h)); }
    else if (e.shape === 'ellipse') ctx.ellipse(X(e.x + e.w / 2), Y(e.y + e.h / 2), Math.abs(e.w) * s / 2, Math.abs(e.h) * s / 2, 0, 0, Math.PI * 2);
    else { ctx.lineJoin = 'miter'; ctx.rect(X(e.x), Y(e.y), e.w * s, e.h * s); }
    if (e.fill && e.shape !== 'line') { ctx.fillStyle = e.fill; ctx.fill(); }
    if (e.width > 0) { ctx.lineWidth = e.width * s; ctx.strokeStyle = e.color; ctx.stroke(); }
  } else if (e.type === 'ink') {
    ctx.beginPath();
    e.points.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    if (e.points.length === 1) ctx.lineTo(X(e.points[0][0]) + 0.01, Y(e.points[0][1]));
    ctx.lineWidth = e.width * s; ctx.strokeStyle = e.color; ctx.stroke();
  } else if (e.type === 'mark') {
    if (e.kind === 'highlight') {
      ctx.globalAlpha = HIGHLIGHT_ALPHA;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = e.color;
      ctx.fillRect(X(e.x), Y(e.y), e.w * s, e.h * s);
    } else {
      const { y, t } = markLine(e);
      ctx.fillStyle = e.color;
      ctx.fillRect(X(e.x), Y(y - t / 2), e.w * s, t * s);
    }
  }
  ctx.restore();
}

// Turns what the user typed for a link into a safe target: a page number or a web / mail / phone address.
export function parseLinkTarget(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return { page: parseInt(v, 10) };
  let url = v;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url) ? `mailto:${url}` : `https://${url}`;
  if (!/^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s()-]+)$/i.test(url)) return null;
  return { url };
}
