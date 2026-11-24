// Pictures and signatures. Everything is decoded and drawn inside this browser window.
import { fontState, isAvailable } from './fonts.js';

const MAX_SIDE = 3000;

function toBlob(canvas, type, q) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the picture.'))), type, q));
}

// Makes an asset { kind: 'png'|'jpg', bytes, w, h, url, bitmap } from bytes the browser can show.
export async function makeAsset(kind, bytes) {
  const blob = new Blob([bytes], { type: kind === 'jpg' ? 'image/jpeg' : 'image/png' });
  const bitmap = await createImageBitmap(blob);
  return { kind, bytes, w: bitmap.width, h: bitmap.height, url: URL.createObjectURL(blob), bitmap };
}

// Reads a picture file (PNG, JPEG, WebP, GIF, BMP, SVG...) and turns it into PNG or JPEG for the PDF.
export async function imageFileToAsset(file) {
  const raw = new Uint8Array(await file.arrayBuffer());
  let bitmap;
  try { bitmap = await createImageBitmap(new Blob([raw], { type: file.type || '' })); } catch {
    // SVG and some other types only decode through an <img>
    const url = URL.createObjectURL(new Blob([raw], { type: file.type || 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      bitmap = await createImageBitmap(img);
    } catch { throw new Error('not an image'); } finally { URL.revokeObjectURL(url); }
  }
  const isPng = /png$/i.test(file.type) || /\.png$/i.test(file.name);
  const isJpg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (isPng && k === 1) { bitmap.close?.(); return makeAsset('png', raw); }
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
  const g = c.getContext('2d');
  // JPEGs are redrawn so that the camera's "turn this photo" setting is applied
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close?.();
  const blob = isJpg ? await toBlob(c, 'image/jpeg', 0.92) : await toBlob(c, 'image/png');
  return makeAsset(isJpg ? 'jpg' : 'png', new Uint8Array(await blob.arrayBuffer()));
}

// Cuts away empty (transparent) space around a drawing.
function trim(canvas) {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return null;
  const m = 4;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// Turns a white (paper) background see-through, for photographed or scanned signatures.
function clearWhite(canvas) {
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const light = Math.min(d[i], d[i + 1], d[i + 2]);
    if (light > 200) d[i + 3] = 0;
    else if (light > 150) d[i + 3] = Math.round(d[i + 3] * (200 - light) / 50);
  }
  g.putImageData(img, 0, 0);
}

const HANDWRITING = ['Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Bradley Hand', 'Snell Roundhand', 'Savoye LET',
  'Dancing Script', 'Great Vibes', 'Pacifico', 'Caveat', 'Kalam', 'Comic Sans MS', 'Z003', 'URW Chancery L'];

let wired = false;
const $ = (id) => document.getElementById(id);

/** Opens the signature window. Resolves with an asset, or null if closed. */
export function askSignature() {
  const dlg = $('sign-dialog');
  const pad = $('sign-pad');
  const g = pad.getContext('2d');
  let mode = 'draw';
  let drawn = false;
  let upload = null;

  const setMode = (m) => {
    mode = m;
    for (const b of dlg.querySelectorAll('[data-sign]')) b.setAttribute('aria-pressed', String(b.dataset.sign === m));
    for (const s of dlg.querySelectorAll('[data-sign-panel]')) s.hidden = s.dataset.signPanel !== m;
    if (m === 'type') { $('sign-text').focus(); preview(); }
  };
  const clearPad = () => {
    const r = pad.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    pad.width = Math.max(300, Math.round(r.width * dpr)); pad.height = Math.round(pad.width / 3);
    g.clearRect(0, 0, pad.width, pad.height);
    drawn = false;
  };
  const preview = () => {
    const c = $('sign-type-preview');
    const pg = c.getContext('2d');
    c.width = 600; c.height = 160;
    pg.clearRect(0, 0, c.width, c.height);
    pg.fillStyle = $('sign-color').value;
    pg.font = `64px "${$('sign-font').value}", cursive`;
    pg.textBaseline = 'middle';
    pg.fillText($('sign-text').value || 'Your name', 16, 80, 568);
  };

  if (!wired) {
    wired = true;
    let last = null;
    pad.addEventListener('pointerdown', (ev) => {
      pad.setPointerCapture(ev.pointerId);
      const r = pad.getBoundingClientRect();
      last = [(ev.clientX - r.left) * (pad.width / r.width), (ev.clientY - r.top) * (pad.height / r.height)];
      ev.preventDefault();
    });
    pad.addEventListener('pointermove', (ev) => {
      if (!last) return;
      const r = pad.getBoundingClientRect();
      const p = [(ev.clientX - r.left) * (pad.width / r.width), (ev.clientY - r.top) * (pad.height / r.height)];
      g.strokeStyle = $('sign-color').value;
      g.lineWidth = Math.max(2, pad.width / 220);
      g.lineCap = g.lineJoin = 'round';
      g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke();
      last = p; pad.dataset.drawn = '1';
    });
    const end = () => { last = null; };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    $('sign-text').addEventListener('input', () => dlg._preview());
    $('sign-font').addEventListener('change', () => dlg._preview());
    $('sign-color').addEventListener('change', () => dlg._preview());
    $('sign-clear').addEventListener('click', () => dlg._clear());
    for (const b of dlg.querySelectorAll('[data-sign]')) b.addEventListener('click', () => dlg._setMode(b.dataset.sign));
    $('sign-file').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      dlg._upload(f);
    });
  }
  dlg._preview = preview;
  dlg._clear = () => { clearPad(); pad.dataset.drawn = ''; };
  dlg._setMode = setMode;
  dlg._upload = (f) => { upload = f; $('sign-file-name').textContent = f.name; };

  const fonts = [...new Set([...HANDWRITING.filter(isAvailable), ...fontState.custom, 'cursive'])];
  $('sign-font').textContent = '';
  for (const f of fonts) { const o = new Option(f, f); o.style.fontFamily = `"${f}"`; $('sign-font').append(o); }
  $('sign-file-name').textContent = '';
  $('sign-file').value = '';
  $('sign-error').hidden = true;
  dlg.returnValue = '';
  dlg.showModal();
  clearPad(); pad.dataset.drawn = '';
  setMode('draw');

  return new Promise((resolve) => {
    const done = async (ev) => {
      if (ev.submitter?.value !== 'ok') return;
      ev.preventDefault();
      try {
        let canvas = null;
        if (mode === 'draw') {
          if (pad.dataset.drawn) canvas = trim(pad);
        } else if (mode === 'type') {
          if ($('sign-text').value.trim()) { preview(); canvas = trim($('sign-type-preview')); }
        } else if (upload) {
          const bmp = await createImageBitmap(upload);
          const k = Math.min(1, 1500 / Math.max(bmp.width, bmp.height));
          canvas = document.createElement('canvas');
          canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
          canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
          if ($('sign-white').checked) { clearWhite(canvas); canvas = trim(canvas) || canvas; }
        }
        if (!canvas) { $('sign-error').hidden = false; return; }
        const blob = await toBlob(canvas, 'image/png');
        const asset = await makeAsset('png', new Uint8Array(await blob.arrayBuffer()));
        cleanup();
        dlg.close('ok');
        resolve(asset);
      } catch {
        $('sign-error').hidden = false;
      }
    };
    const closed = () => { cleanup(); resolve(null); };
    const cleanup = () => { $('sign-form').removeEventListener('submit', done); dlg.removeEventListener('close', closed); };
    $('sign-form').addEventListener('submit', done);
    dlg.addEventListener('close', closed, { once: true });
  });
}
