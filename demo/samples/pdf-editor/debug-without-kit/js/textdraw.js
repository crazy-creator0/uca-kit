// Lays out and draws a text change. The same functions draw it on screen and into the saved PDF,
// so the saved result matches what the user saw. All sizes are in PDF points (1/72 inch).

export const LINE_HEIGHT = 1.25;

const measureCtx = document.createElement('canvas').getContext('2d');

export function cssFamily(family) {
  const safe = String(family || 'sans-serif').replace(/["\\]/g, '');
  if (['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui'].includes(safe)) return safe;
  return `"${safe}", sans-serif`;
}

export function fontString(e, px) {
  return `${e.italic ? 'italic ' : ''}${e.bold ? 'bold ' : ''}${px}px ${cssFamily(e.family)}`;
}

// Returns the box of a text change relative to its first baseline, in points.
export function layoutText(e) {
  const lines = String(e.text).split('\n');
  const ref = 100; // measure at 100px and scale, for accuracy
  measureCtx.font = fontString(e, ref);
  const k = e.size / ref;
  const lineWidths = lines.map((line) => measureCtx.measureText(line).width * k);
  const width = Math.max(0, ...lineWidths);
  const m = measureCtx.measureText('Hg');
  const asc = (m.fontBoundingBoxAscent ?? 80) * k;
  const desc = (m.fontBoundingBoxDescent ?? 20) * k;
  const lh = e.size * LINE_HEIGHT;
  const pad = e.size * 0.15; // room for italic overhang and accents
  return {
    lines, lineWidths, width, asc, desc, lh, pad,
    left: e.x - pad,
    top: e.baseline - asc - pad,
    w: width + pad * 2,
    h: asc + desc + (lines.length - 1) * lh + pad * 2,
  };
}

// Draws the text onto a 2D context. `scale` = pixels per point; (ox, oy) = point that maps to pixel (0,0).
export function drawText(ctx, e, scale, ox, oy) {
  const L = layoutText(e);
  ctx.save();
  ctx.font = fontString(e, e.size * scale);
  ctx.fillStyle = e.color || '#000000';
  ctx.textBaseline = 'alphabetic';
  L.lines.forEach((line, i) => {
    ctx.fillText(line, (e.x - ox) * scale, (e.baseline + i * L.lh - oy) * scale);
  });
  ctx.restore();
  return L;
}

// Renders a text change into its own transparent canvas (used for screen and for the saved file).
export function textToCanvas(e, scale) {
  const L = layoutText(e);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(L.w * scale));
  c.height = Math.max(1, Math.ceil(L.h * scale));
  drawText(c.getContext('2d'), e, scale, L.left, L.top);
  return { canvas: c, layout: L };
}
