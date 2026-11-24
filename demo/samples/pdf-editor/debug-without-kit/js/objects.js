// Non-text changes: images and signatures, shapes, highlights, freehand drawing, links, notes and new form fields.
// Every object is stored in page points (1/72 inch) with a top-left origin, like text changes.
// One SVG path string per object is used three ways: on screen (SVG), in page pictures (canvas Path2D)
// and in the saved PDF (pdf-lib drawSvgPath), so all three look the same.

export const NOTE_SIZE = 20;

// The rectangle an object covers (always positive width/height).
export function bounds(e) {
  if (e.type === 'note') return { x: e.x, y: e.y, w: NOTE_SIZE, h: NOTE_SIZE };
  const x = Math.min(e.x, e.x + e.w); const y = Math.min(e.y, e.y + e.h);
  return { x, y, w: Math.abs(e.w), h: Math.abs(e.h) };
}

const n = (v) => (Math.round(v * 100) / 100).toString();

function ellipsePath(x, y, w, h) {
  const rx = w / 2; const ry = h / 2; const cx = x + rx; const cy = y + ry;
  // four cubic curves (kappa) instead of arcs: every renderer draws these identically
  const k = 0.5522847498;
  return `M${n(cx - rx)} ${n(cy)} C${n(cx - rx)} ${n(cy - ry * k)} ${n(cx - rx * k)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}`
    + ` C${n(cx + rx * k)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - ry * k)} ${n(cx + rx)} ${n(cy)}`
    + ` C${n(cx + rx)} ${n(cy + ry * k)} ${n(cx + rx * k)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}`
    + ` C${n(cx - rx * k)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + ry * k)} ${n(cx - rx)} ${n(cy)} Z`;
}

function arrowHead(e) {
  const x1 = e.x; const y1 = e.y; const x2 = e.x + e.w; const y2 = e.y + e.h;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
  const s = Math.max(8, (e.lw || 2) * 4);
  const bx = x2 - ux * s; const by = y2 - uy * s;
  return `M${n(x2)} ${n(y2)} L${n(bx - uy * s * 0.5)} ${n(by + ux * s * 0.5)} L${n(bx + uy * s * 0.5)} ${n(by - ux * s * 0.5)} Z`;
}

/**
 * Returns the drawing of an object as a list of parts:
 * { d: svg path, fill: colour|null, stroke: colour|null, lw, opacity, multiply }
 */
export function parts(e) {
  const b = bounds(e);
  const op = e.opacity ?? 1;
  switch (e.type) {
    case 'box':
      return [{ d: `M${n(b.x)} ${n(b.y)} H${n(b.x + b.w)} V${n(b.y + b.h)} H${n(b.x)} Z`, fill: e.color, opacity: 1 }];
    case 'shape': {
      if (e.kind === 'line' || e.kind === 'arrow') {
        const out = [{ d: `M${n(e.x)} ${n(e.y)} L${n(e.x + e.w)} ${n(e.y + e.h)}`, stroke: e.stroke, lw: e.lw, opacity: op }];
        if (e.kind === 'arrow') out.push({ d: arrowHead(e), fill: e.stroke, opacity: op });
        return out;
      }
      const d = e.kind === 'ellipse' ? ellipsePath(b.x, b.y, b.w, b.h)
        : `M${n(b.x)} ${n(b.y)} H${n(b.x + b.w)} V${n(b.y + b.h)} H${n(b.x)} Z`;
      return [{ d, fill: e.fill || null, stroke: e.lw > 0 ? e.stroke : null, lw: e.lw, opacity: op }];
    }
    case 'mark': {
      if (e.kind === 'highlight') {
        return [{ d: `M${n(b.x)} ${n(b.y)} H${n(b.x + b.w)} V${n(b.y + b.h)} H${n(b.x)} Z`, fill: e.color, opacity: 0.4, multiply: true }];
      }
      const lw = Math.max(0.8, b.h * 0.07);
      const y = e.kind === 'strike' ? b.y + b.h * 0.55 : b.y + b.h - lw;
      return [{ d: `M${n(b.x)} ${n(y)} H${n(b.x + b.w)}`, stroke: e.color, lw, opacity: 1, butt: true }];
    }
    case 'ink': {
      const pts = e.pts;
      if (!pts || pts.length < 2) return [];
      let d = '';
      for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${n(e.x + pts[i] * e.w)} ${n(e.y + pts[i + 1] * e.h)} `;
      if (pts.length === 2) d += `L${n(e.x + pts[0] * e.w + 0.01)} ${n(e.y + pts[1] * e.h)}`;
      return [{ d: d.trim(), stroke: e.stroke, lw: e.lw, opacity: op, multiply: !!e.marker }];
    }
    default:
      return [];
  }
}

// ---------- screen ----------
const SVGNS = 'http://www.w3.org/2000/svg';
// `box` is the on-screen area of the object (page points); the drawing may reach outside it.
export function toSvg(e, box) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `${box.x} ${box.y} ${Math.max(box.w, 0.01)} ${Math.max(box.h, 0.01)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
  for (const part of parts(e)) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', part.d);
    p.setAttribute('fill', part.fill || 'none');
    if (part.stroke) {
      p.setAttribute('stroke', part.stroke);
      p.setAttribute('stroke-width', part.lw);
      p.setAttribute('stroke-linecap', part.butt ? 'butt' : 'round');
      p.setAttribute('stroke-linejoin', 'round');
    }
    if (part.opacity < 1) p.setAttribute('opacity', part.opacity);
    if (part.multiply) p.style.mixBlendMode = 'multiply';
    svg.append(p);
  }
  return svg;
}

// ---------- page pictures (canvas) ----------
// `getBitmap(assetId)` returns a drawable image for image objects.
export function drawObjectCanvas(ctx, e, scale, getBitmap) {
  ctx.save();
  ctx.scale(scale, scale);
  if (e.type === 'image') {
    const bmp = getBitmap(e.asset);
    if (bmp) { ctx.globalAlpha = e.opacity ?? 1; ctx.drawImage(bmp, e.x, e.y, e.w, e.h); }
  } else if (e.type === 'note') {
    ctx.fillStyle = e.color || '#f6d743';
    ctx.fillRect(e.x, e.y, NOTE_SIZE, NOTE_SIZE * 0.8);
    ctx.strokeStyle = '#6b5a00'; ctx.lineWidth = 0.8;
    ctx.strokeRect(e.x, e.y, NOTE_SIZE, NOTE_SIZE * 0.8);
  } else if (e.type === 'field') {
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.75;
    ctx.strokeRect(e.x, e.y, e.w, e.h);
  } else {
    for (const part of parts(e)) {
      const path = new Path2D(part.d);
      ctx.globalAlpha = part.opacity ?? 1;
      ctx.globalCompositeOperation = part.multiply ? 'multiply' : 'source-over';
      if (part.fill) { ctx.fillStyle = part.fill; ctx.fill(path); }
      if (part.stroke) {
        ctx.strokeStyle = part.stroke; ctx.lineWidth = part.lw;
        ctx.lineCap = part.butt ? 'butt' : 'round'; ctx.lineJoin = 'round';
        ctx.stroke(path);
      }
    }
  }
  ctx.restore();
}

// ---------- links ----------
// Turns what the user typed into a safe link target, or null.
// Plain numbers up to the page count are pages of the saved file.
export function linkTarget(raw, pageCount) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t) && +t >= 1 && +t <= pageCount) return { page: +t - 1 };
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return { uri: t };
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(t)) return { uri: `mailto:${t}` };
  if (/^\+?[\d\s().-]{6,}$/.test(t)) return { uri: `tel:${t.replace(/[\s().-]/g, '')}` };
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(t)) return { uri: `https://${t}` };
  return null;
}
