// Private PDF Editor — runs entirely in this browser. No network requests are made with the user's file.
import * as pdfjs from '../vendor/pdf.min.mjs';
import { layoutText, textToCanvas, fontString } from './textdraw.js';
import {
  fontState, scanDeviceFonts, guessFont, addFontFile, restoreCustomFonts, canListAllFonts, listAllLocalFonts,
} from './fonts.js';
import * as store from './store.js';
import { buildEditedPdf, inspect, hasCover } from './export.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const viewer = $('viewer');
const pagesEl = $('pages');
const MAX_RENDERED = 14;
const MAX_CANVAS_PIXELS = 16e6;

const S = {
  name: '', bytes: null, pdf: null, pages: [], edits: [], undo: [], redo: [],
  tool: 'edit', zoom: 1, sel: null, editing: null, editBefore: null, info: null,
  dirty: false, current: 0, style: { family: null, size: 12, bold: false, italic: false, color: '#000000' },
};
window.__editor = S; // for automated tests and troubleshooting in the browser console

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (v, total) => `${(v / total) * 100}%`;

function msg(text, isError = false) {
  const el = $('st-msg');
  el.textContent = text;
  el.classList.toggle('err', isError);
}

// ---------- opening ----------
async function askPassword(again) {
  const dlg = $('pw-dialog');
  $('pw-error').hidden = !again;
  $('pw-input').value = '';
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? $('pw-input').value : null), { once: true }));
}

async function openBytes(name, bytes, work = null) {
  if (S.pdf && S.dirty && S.edits.length && !work && !confirm('Open another file? Your changes to the current file are kept in this browser only until you open a new one.')) return;
  closeDoc();
  msg('Opening…');
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true });
  let asked = false;
  task.onPassword = async (give) => {
    const pw = await askPassword(asked);
    asked = true;
    if (pw === null) task.destroy(); else give(pw);
  };
  let pdf;
  try {
    pdf = await task.promise;
    S.task = task;
  } catch (err) {
    msg(asked ? 'The file was not opened.' : 'This file could not be opened. It may not be a PDF, or it may be damaged.', true);
    return;
  }
  S.name = name; S.bytes = bytes; S.pdf = pdf;
  S.edits = work ? work.edits : [];
  S.undo = []; S.redo = []; S.sel = null; S.editing = null; S.dirty = false;
  $('empty').hidden = true;

  const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
  const fit = (viewer.clientWidth - 40) / first.width;
  S.zoom = clamp(Math.round(fit * 20) / 20, 0.3, 1.5);
  for (let i = 0; i < pdf.numPages; i++) {
    if (i % 25 === 0) msg(`Reading pages… ${i + 1} of ${pdf.numPages}`);
    const vp = (await pdf.getPage(i + 1)).getViewport({ scale: 1 });
    addPageShell(i, vp);
  }
  $('page-count').textContent = `of ${pdf.numPages}`;
  $('page-input').max = pdf.numPages;
  hideStylebar();
  applyZoom();
  setEnabled(true);
  updateStatus();
  msg(`Opened “${name}”, ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}.`);
  if (!work) {
    store.saveFile(name, bytes).then(() => saveWorkSoon()).catch(() => msg('Could not keep a backup in this browser (storage full or blocked). Editing still works.'));
  }
  inspect(bytes).then((info) => {
    S.info = info;
    if (!info.ok) msg(info.encrypted ? 'This PDF is protected. You can edit it; the copy will be saved as pictures of the pages.' : 'This PDF is unusual. You can edit it; the copy may need to be saved as pictures of the pages.');
    else if (info.signed) msg('Note: this PDF is digitally signed. Saving any change makes the signature invalid.');
  });
}

function closeDoc() {
  if (S.task) S.task.destroy();
  S.task = null; S.pdf = null; S.pages = [];
  pagesEl.textContent = '';
  observer.disconnect();
  hideStylebar();
}

function addPageShell(i, vp) {
  const head = document.createElement('div');
  head.className = 'pagehead';
  head.textContent = `Page ${i + 1}`;
  const el = document.createElement('div');
  el.className = 'page';
  el.dataset.page = i;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'Loading page…';
  const runsEl = document.createElement('div'); runsEl.className = 'runs';
  const editsEl = document.createElement('div'); editsEl.className = 'edits';
  el.append(loading, runsEl, editsEl);
  pagesEl.append(head, el);
  const p = { i, vp, w: vp.width, h: vp.height, el, head, runsEl, editsEl, loading, canvas: null, renderedAt: 0, rendering: false, runs: null, proxy: null, visible: false };
  S.pages.push(p);
  observer.observe(el);
}

// ---------- rendering ----------
const observer = new IntersectionObserver((entries) => {
  for (const en of entries) {
    const p = S.pages[+en.target.dataset.page];
    if (!p) continue;
    p.visible = en.isIntersecting;
    if (p.visible) renderPage(p);
  }
}, { root: viewer, rootMargin: '600px 0px' });

function wantedScale(p) {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(S.zoom * dpr, Math.sqrt(MAX_CANVAS_PIXELS / (p.w * p.h)));
}

async function renderPage(p) {
  if (!S.pdf || p.rendering) return;
  const scale = wantedScale(p);
  if (Math.abs(p.renderedAt - scale) < 0.001) return;
  p.rendering = true;
  const pdf = S.pdf;
  try {
    const page = p.proxy || (p.proxy = await pdf.getPage(p.i + 1));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.className = 'render';
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    await page.render({ canvas, viewport: vp }).promise;
    if (S.pdf !== pdf) return;
    if (p.canvas) p.canvas.remove();
    p.canvas = canvas;
    p.el.prepend(canvas);
    p.loading.hidden = true;
    p.renderedAt = scale;
    if (!p.runs) await buildRuns(p);
    renderRuns(p);
    renderEdits(p);
    freeFarPages();
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') { p.loading.textContent = 'This page could not be shown.'; p.loading.hidden = false; }
  } finally {
    p.rendering = false;
  }
  if (p.visible && Math.abs(p.renderedAt - wantedScale(p)) > 0.001) renderPage(p);
}

function freeFarPages() {
  const rendered = S.pages.filter((p) => p.renderedAt && !p.visible);
  if (rendered.length + S.pages.filter((p) => p.visible).length <= MAX_RENDERED) return;
  rendered.sort((a, b) => Math.abs(b.i - S.current) - Math.abs(a.i - S.current));
  for (const p of rendered.slice(0, rendered.length - 4)) {
    p.canvas.width = p.canvas.height = 0;
    p.canvas.remove();
    p.canvas = null; p.renderedAt = 0;
    p.loading.hidden = false;
    p.editsEl.textContent = '';
  }
}

function rerenderAll() {
  for (const p of S.pages) if (p.renderedAt) { renderRuns(p); renderEdits(p); }
}

// ---------- original text (what can be clicked to change) ----------
async function buildRuns(p) {
  const page = p.proxy || (p.proxy = await S.pdf.getPage(p.i + 1));
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items) {
    if (!it.str) continue;
    const tx = pdfjs.Util.transform(p.vp.transform, it.transform);
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 1 || Math.abs(Math.atan2(tx[1], tx[0])) > 0.02) continue; // only level text can be edited
    const st = tc.styles[it.fontName] || {};
    const asc = clamp(st.ascent || 0.8, 0.6, 1.1);
    const desc = clamp(Math.abs(st.descent || 0.2), 0.1, 0.45);
    items.push({ x: tx[4], base: tx[5], size, w: it.width, asc, desc, str: it.str, font: it.fontName, generic: st.fontFamily || '' });
  }
  const runs = [];
  let r = null;
  for (const it of items) {
    const gap = r ? it.x - (r.x + r.w) : 0;
    if (r && it.font === r.font && Math.abs(it.base - r.base) < 0.25 * r.size && Math.abs(it.size - r.size) < 0.15 * r.size
        && gap > -0.5 * r.size && gap < 1.0 * r.size) {
      if (gap > 0.2 * r.size && !r.str.endsWith(' ') && !it.str.startsWith(' ')) r.str += ' ';
      r.str += it.str;
      r.w = Math.max(r.w, it.x + it.w - r.x);
    } else {
      if (r) runs.push(r);
      r = { ...it };
    }
  }
  if (r) runs.push(r);
  p.runs = runs.filter((x) => x.str.trim()).map((x, k) => {
    const lead = x.str.length - x.str.trimStart().length;
    return {
      key: `${p.i}:${k}`, x: x.x + (lead ? x.w * (lead / x.str.length) : 0), y: x.base - x.asc * x.size, w: x.w,
      h: (x.asc + x.desc) * x.size, base: x.base, size: x.size, str: x.str.trim(), font: x.font, generic: x.generic,
    };
  });
}

function renderRuns(p) {
  if (!p.runs) return;
  if (!p.runsEl.childElementCount && p.runs.length) {
    const frag = document.createDocumentFragment();
    for (const run of p.runs) {
      const d = document.createElement('div');
      d.className = 'run';
      d.dataset.key = run.key;
      d.title = 'Click to change this text';
      Object.assign(d.style, { left: pct(run.x, p.w), top: pct(run.y, p.h), width: pct(run.w, p.w), height: pct(run.h, p.h) });
      frag.append(d);
    }
    p.runsEl.append(frag);
  }
  const used = new Set(S.edits.filter((e) => e.source && e.page === p.i).map((e) => e.source));
  for (const d of p.runsEl.children) d.classList.toggle('hidden', used.has(d.dataset.key));
}

// ---------- changes drawn on the page ----------
function editBox(e) {
  if (e.type === 'box') return { left: e.x, top: e.y, w: e.w, h: e.h };
  const L = layoutText(e);
  return { left: L.left, top: L.top, w: Math.max(L.w, e.size * 0.6), h: L.h, L };
}

function renderEdits(p) {
  const layer = p.editsEl;
  layer.textContent = '';
  if (!p.renderedAt) return;
  const px = S.zoom * (window.devicePixelRatio || 1);
  for (const e of S.edits) {
    if (e.page !== p.i) continue;
    const cover = e.type === 'box' ? e : e.cover;
    if (cover && e.type === 'text') {
      const c = document.createElement('div');
      c.className = 'edit cover';
      Object.assign(c.style, { left: pct(cover.x, p.w), top: pct(cover.y, p.h), width: pct(cover.w, p.w), height: pct(cover.h, p.h), background: cover.color });
      layer.append(c);
    }
    const b = editBox(e);
    const el = document.createElement('div');
    el.className = `edit ${e.type}`;
    el.dataset.id = e.id;
    Object.assign(el.style, { left: pct(b.left, p.w), top: pct(b.top, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h) });
    if (e.type === 'box') {
      el.style.background = e.color;
      el.title = 'Cover box: drag to move';
    } else if (S.editing === e.id) {
      el.style.visibility = 'hidden';
      layer.append(el);
      layer.append(makeTextarea(e, p));
      addTick(layer, p, b);
      continue;
    } else if (e.text) {
      el.append(textToCanvas(e, px).canvas);
      el.title = 'Click to change, drag to move';
    } else {
      el.classList.add('empty-text');
    }
    if (S.sel === e.id) el.classList.add('sel');
    layer.append(el);
    addTick(layer, p, b);
  }
}

function addTick(layer, p, b) {
  const t = document.createElement('div');
  t.className = 'tick';
  Object.assign(t.style, { top: pct(b.top, p.h), height: pct(Math.max(b.h, 6), p.h) });
  layer.append(t);
}

function makeTextarea(e, p) {
  const ta = document.createElement('textarea');
  ta.className = 'edit-area';
  ta.value = e.text;
  ta.spellcheck = true;
  ta.setAttribute('aria-label', 'Text');
  const place = () => {
    const L = layoutText(e);
    const z = S.zoom;
    const half = (L.lh - (L.asc + L.desc)) / 2;
    ta.style.font = fontString(e, e.size * z);
    ta.style.lineHeight = `${L.lh * z}px`;
    ta.style.color = e.color;
    ta.style.left = `${L.left * z}px`;
    ta.style.top = `${(e.baseline - L.asc - half) * z}px`;
    ta.style.paddingLeft = ta.style.paddingRight = `${L.pad * z}px`;
    ta.style.width = `${(L.w + e.size * 1.5) * z}px`;
    ta.style.height = `${(L.lines.length * L.lh + e.size * 0.1) * z}px`;
  };
  place();
  ta.addEventListener('input', () => { e.text = ta.value; place(); });
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); finishEditing(); }
    ev.stopPropagation();
  });
  ta._place = place;
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
  return ta;
}

// ---------- history ----------
function snapshot() { return JSON.stringify(S.edits); }
function pushHistory(before = snapshot()) { S.undo.push(before); S.redo = []; }
function changed() {
  S.dirty = true;
  updateStatus();
  saveWorkSoon();
}
function undo() {
  finishEditing();
  if (!S.undo.length) return;
  S.redo.push(snapshot());
  S.edits = JSON.parse(S.undo.pop());
  S.sel = null; hideStylebar();
  rerenderAll(); changed();
}
function redo() {
  finishEditing();
  if (!S.redo.length) return;
  S.undo.push(snapshot());
  S.edits = JSON.parse(S.redo.pop());
  S.sel = null; hideStylebar();
  rerenderAll(); changed();
}

function updateStatus() {
  const n = S.edits.length;
  const pages = new Set(S.edits.map((e) => e.page)).size;
  $('st-changes').textContent = n ? `${n} change${n > 1 ? 's' : ''} on ${pages} page${pages > 1 ? 's' : ''}` : 'No changes';
  $('btn-undo').disabled = !S.undo.length;
  $('btn-redo').disabled = !S.redo.length;
}

let saveTimer = null;
function saveWorkSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!S.bytes) return;
    try {
      await store.saveWork({ name: S.name, size: S.bytes.length, edits: S.edits, at: Date.now() });
      $('st-saved').textContent = `Kept in this browser ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch { $('st-saved').textContent = 'Not kept in this browser (storage blocked)'; }
  }, 600);
}

// ---------- reading colours from the page ----------
function hex(r, g, b) { return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`; }

function sampleColors(canvas, sx, rect) {
  const x0 = clamp(Math.floor(rect.x * sx), 0, canvas.width - 1);
  const y0 = clamp(Math.floor(rect.y * sx), 0, canvas.height - 1);
  const w = clamp(Math.ceil(rect.w * sx), 1, canvas.width - x0);
  const h = clamp(Math.ceil(rect.h * sx), 1, canvas.height - y0);
  let data;
  try { data = canvas.getContext('2d').getImageData(x0, y0, w, h).data; } catch { return { bg: '#ffffff', fg: '#000000' }; }
  const counts = new Map();
  const step = Math.max(1, Math.floor((w * h) / 40000)) * 4;
  for (let i = 0; i < data.length; i += step) {
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const c = counts.get(k) || [0, 0, 0, 0];
    c[0]++; c[1] += data[i]; c[2] += data[i + 1]; c[3] += data[i + 2];
    counts.set(k, c);
  }
  let best = null;
  for (const c of counts.values()) if (!best || c[0] > best[0]) best = c;
  const bg = [best[1] / best[0], best[2] / best[0], best[3] / best[0]];
  let far = 0; let fg = [0, 0, 0];
  for (let i = 0; i < data.length; i += step) {
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    if (d > far) { far = d; fg = [data[i], data[i + 1], data[i + 2]]; }
  }
  if (far < 60) fg = (bg[0] + bg[1] + bg[2]) / 3 > 128 ? [0, 0, 0] : [255, 255, 255];
  return { bg: hex(...bg), fg: hex(...fg) };
}

// A rendered picture of a page for reading colours; uses the on-screen one if there is one.
async function pagePicture(p) {
  if (p.canvas && p.renderedAt) return { canvas: p.canvas, scale: p.renderedAt, temp: false };
  const page = p.proxy || (p.proxy = await S.pdf.getPage(p.i + 1));
  const scale = Math.min(1.5, Math.sqrt(4e6 / (p.w * p.h)));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, viewport: vp }).promise;
  return { canvas, scale, temp: true };
}

function pdfFontName(p, run) {
  try { return p.proxy.commonObjs.get(run.font)?.name || ''; } catch { return ''; }
}

function editFromRun(p, run, pic, text) {
  const { bg, fg } = sampleColors(pic.canvas, pic.scale, run);
  const orig = pdfFontName(p, run);
  const g = guessFont(orig, run.generic);
  const pad = Math.max(0.6, run.size * 0.04);
  return {
    id: uid(), page: p.i, type: 'text', source: run.key, text, origText: run.str, origFont: g.original,
    x: run.x, baseline: run.base, size: Math.round(run.size * 100) / 100,
    family: g.family, bold: g.bold, italic: g.italic, color: fg,
    cover: { x: run.x - pad, y: run.y - pad, w: run.w + pad * 2, h: run.h + pad * 2, color: bg },
  };
}

// ---------- editing actions ----------
const findEdit = (id) => S.edits.find((e) => e.id === id);
const pageOf = (e) => S.pages[e.page];

function startEditing(e, before = snapshot()) {
  finishEditing();
  S.editing = e.id; S.sel = e.id;
  S.editBefore = { json: before, text: e.text, style: styleKey(e) };
  renderEdits(pageOf(e));
  showStylebar(e);
}
const styleKey = (e) => JSON.stringify([e.family, e.size, e.bold, e.italic, e.color, e.x, e.baseline, e.cover && e.cover.color]);

function finishEditing() {
  if (!S.editing) return;
  const e = findEdit(S.editing);
  const before = S.editBefore;
  S.editing = null; S.editBefore = null;
  if (!e) return;
  const p = pageOf(e);
  const unchanged = before && e.text === before.text && styleKey(e) === before.style && !before.isNew;
  const noop = e.type === 'text' && ((e.source && e.text === e.origText && before.isNew && styleKey(e) === before.style) || (!e.source && !e.text.trim()));
  if (noop) {
    S.edits = S.edits.filter((x) => x !== e);
    S.sel = null; hideStylebar();
  } else if (!unchanged) {
    pushHistory(before.json);
    changed();
    S.style = { ...S.style, family: e.family, size: Math.round(e.size * 2) / 2, bold: e.bold, italic: e.italic };
  }
  renderRuns(p);
  renderEdits(p);
  updateStatus();
}

async function changeRun(p, run) {
  const existing = S.edits.find((e) => e.source === run.key);
  if (existing) return startEditing(existing);
  const before = snapshot();
  const pic = await pagePicture(p);
  const e = editFromRun(p, run, pic, run.str);
  S.edits.push(e);
  startEditing(e, before);
  S.editBefore.isNew = true;
  renderRuns(p);
}

function addTextAt(p, x, y) {
  const st = S.style;
  const family = st.family || fontState.device.find((f) => /^(Arial|Helvetica|Liberation Sans|Noto Sans|DejaVu Sans)$/.test(f)) || 'sans-serif';
  const e = { id: uid(), page: p.i, type: 'text', text: '', x, baseline: y + st.size * 0.35, size: st.size, family, bold: st.bold, italic: st.italic, color: st.color, cover: null };
  const before = snapshot();
  S.edits.push(e);
  startEditing(e, before);
  S.editBefore.isNew = true;
}

function select(id) {
  finishEditing();
  S.sel = id;
  const e = id && findEdit(id);
  for (const p of S.pages) if (p.renderedAt) for (const el of p.editsEl.querySelectorAll('.edit[data-id]')) el.classList.toggle('sel', el.dataset.id === id);
  if (e) showStylebar(e); else hideStylebar();
}

function deleteSelected() {
  const e = S.sel && findEdit(S.sel);
  if (!e) return;
  const before = S.editing ? S.editBefore.json : snapshot();
  S.editing = null; S.editBefore = null;
  S.edits = S.edits.filter((x) => x !== e);
  pushHistory(before);
  S.sel = null; hideStylebar();
  const p = pageOf(e); renderRuns(p); renderEdits(p);
  changed();
}

// ---------- pointer handling on pages ----------
function pagePoint(p, ev) {
  const r = p.el.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * p.w, y: ((ev.clientY - r.top) / r.height) * p.h };
}

pagesEl.addEventListener('pointerdown', async (ev) => {
  if (ev.button !== 0 || document.body.classList.contains('compare')) return;
  const pageEl = ev.target.closest('.page');
  if (!pageEl || ev.target.closest('.edit-area')) return;
  const p = S.pages[+pageEl.dataset.page];
  const editEl = ev.target.closest('.edit[data-id]');
  if (editEl) return dragEdit(ev, p, findEdit(editEl.dataset.id));
  if (S.tool === 'edit') {
    const runEl = ev.target.closest('.run');
    if (runEl) { ev.preventDefault(); return changeRun(p, p.runs.find((r) => r.key === runEl.dataset.key)); }
    if (S.editing || S.sel) { select(null); }
    return;
  }
  if (S.editing || S.sel) select(null);
  if (S.tool === 'add') { ev.preventDefault(); const pt = pagePoint(p, ev); return addTextAt(p, pt.x, pt.y); }
  if (S.tool === 'cover') drawCover(ev, p);
});

viewer.addEventListener('pointerdown', (ev) => {
  if (!ev.target.closest('.page') && (S.editing || S.sel)) select(null);
});

function dragEdit(ev, p, e) {
  if (!e) return;
  ev.preventDefault();
  const start = pagePoint(p, ev);
  const orig = e.type === 'box' ? { x: e.x, y: e.y } : { x: e.x, y: e.baseline };
  const before = snapshot();
  const el = ev.target.closest('.edit');
  let moved = false;
  el.setPointerCapture(ev.pointerId);
  const move = (m) => {
    const pt = pagePoint(p, m);
    const dx = pt.x - start.x; const dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) * S.zoom < 5) return;
    moved = true;
    if (e.type === 'box') { e.x = orig.x + dx; e.y = orig.y + dy; } else { e.x = orig.x + dx; e.baseline = orig.y + dy; }
    const b = editBox(e);
    el.style.left = pct(b.left, p.w); el.style.top = pct(b.top, p.h);
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    if (moved) { pushHistory(before); changed(); renderEdits(p); select(e.id); return; }
    if (e.type === 'text') startEditing(e); else select(e.id);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function drawCover(ev, p) {
  ev.preventDefault();
  const a = pagePoint(p, ev);
  const draft = document.createElement('div');
  draft.className = 'draft';
  p.el.append(draft);
  p.el.setPointerCapture(ev.pointerId);
  let b = { x: a.x, y: a.y, w: 0, h: 0 };
  const move = (m) => {
    const c = pagePoint(p, m);
    b = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
    Object.assign(draft.style, { left: pct(b.x, p.w), top: pct(b.y, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h) });
  };
  const up = async () => {
    p.el.removeEventListener('pointermove', move);
    p.el.removeEventListener('pointerup', up);
    p.el.removeEventListener('pointercancel', up);
    draft.remove();
    if (b.w < 2 || b.h < 2) return;
    const ring = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
    const pic = await pagePicture(p);
    const color = sampleColors(pic.canvas, pic.scale, ring).bg;
    pushHistory();
    const e = { id: uid(), page: p.i, type: 'box', x: b.x, y: b.y, w: b.w, h: b.h, color };
    S.edits.push(e);
    renderEdits(p); select(e.id); changed();
  };
  p.el.addEventListener('pointermove', move);
  p.el.addEventListener('pointerup', up);
  p.el.addEventListener('pointercancel', up);
}

// ---------- style bar ----------
function fillFontSelect(current) {
  const sel = $('sel-font');
  sel.textContent = '';
  const group = (label, fams) => {
    if (!fams.length) return;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const f of fams) { const o = new Option(f, f); o.style.fontFamily = `"${f}"`; g.append(o); }
    sel.append(g);
  };
  const known = new Set([...fontState.custom, ...fontState.device, ...fontState.local]);
  if (current && !known.has(current)) group('Current', [current]);
  group('Your added fonts', fontState.custom);
  group('On this device', fontState.device);
  group('All fonts on this computer', fontState.local.filter((f) => !fontState.device.includes(f)));
  const more = document.createElement('optgroup');
  more.label = 'More fonts';
  more.append(new Option('Add a font file (.ttf, .otf, .woff)…', '__add__'));
  if (canListAllFonts && !fontState.local.length) more.append(new Option('Show all fonts on this computer…', '__all__'));
  sel.append(more);
  sel.value = current || '';
}

const STYLE_CONTROLS = ['sel-font', 'inp-size', 'btn-bold', 'btn-italic', 'inp-color', 'inp-cover', 'btn-delete'];
function showStylebar(e) {
  $('stylebar').hidden = false;
  $('style-hint').hidden = true;
  const isText = e.type === 'text';
  for (const id of STYLE_CONTROLS) $(id).disabled = false;
  for (const id of ['sel-font', 'inp-size', 'btn-bold', 'btn-italic', 'inp-color']) {
    const el = $(id); (el.closest('label') || el).hidden = !isText;
  }
  $('cover-field').hidden = !(e.type === 'box' || e.cover);
  $('inp-cover').value = e.type === 'box' ? e.color : e.cover ? e.cover.color : '#ffffff';
  if (isText) {
    fillFontSelect(e.family);
    $('inp-size').value = Math.round(e.size * 10) / 10;
    $('btn-bold').setAttribute('aria-pressed', String(!!e.bold));
    $('btn-italic').setAttribute('aria-pressed', String(!!e.italic));
    $('inp-color').value = e.color;
  }
  $('orig-font').textContent = e.origFont ? `Original font: ${e.origFont}` : '';
}
// The bar stays in place (only its controls switch off) so the pages never jump under the pointer.
function hideStylebar() {
  $('stylebar').hidden = !S.pdf;
  $('style-hint').hidden = false;
  $('orig-font').textContent = '';
  $('cover-field').hidden = true;
  for (const id of STYLE_CONTROLS) $(id).disabled = true;
  for (const id of ['sel-font', 'inp-size', 'btn-bold', 'btn-italic', 'inp-color']) { const el = $(id); (el.closest('label') || el).hidden = false; }
}

function styleChange(fn) {
  const e = S.sel && findEdit(S.sel);
  if (!e) return;
  const live = S.editing === e.id;
  const before = snapshot();
  fn(e);
  const p = pageOf(e);
  if (live) {
    const ta = p.editsEl.querySelector('.edit-area');
    if (ta) { ta._place(); ta.focus(); }
    renderRuns(p);
  } else {
    pushHistory(before); changed(); renderEdits(p);
  }
  if (e.type === 'text') S.style = { family: e.family, size: Math.round(e.size * 2) / 2, bold: e.bold, italic: e.italic, color: e.color };
}

$('sel-font').addEventListener('change', async (ev) => {
  const v = ev.target.value;
  const e = S.sel && findEdit(S.sel);
  if (v === '__add__') { ev.target.value = e ? e.family : ''; $('font-file').click(); return; }
  if (v === '__all__') {
    ev.target.value = e ? e.family : '';
    try { const all = await listAllLocalFonts(); msg(`${all.length} fonts found on this computer.`); } catch { msg('The browser did not allow listing fonts. You can still add a font file.'); }
    if (e) fillFontSelect(e.family);
    return;
  }
  await document.fonts.load(`16px "${v}"`).catch(() => {});
  styleChange((x) => { x.family = v; });
});
$('inp-size').addEventListener('change', (ev) => {
  const v = parseFloat(ev.target.value);
  if (v >= 2 && v <= 400) styleChange((x) => { x.size = v; });
});
$('btn-bold').addEventListener('click', () => styleChange((x) => { x.bold = !x.bold; $('btn-bold').setAttribute('aria-pressed', String(x.bold)); }));
$('btn-italic').addEventListener('click', () => styleChange((x) => { x.italic = !x.italic; $('btn-italic').setAttribute('aria-pressed', String(x.italic)); }));
$('inp-color').addEventListener('change', (ev) => styleChange((x) => { x.color = ev.target.value; }));
$('inp-cover').addEventListener('change', (ev) => styleChange((x) => { if (x.type === 'box') x.color = ev.target.value; else if (x.cover) x.cover.color = ev.target.value; }));
$('btn-delete').addEventListener('click', deleteSelected);
// keep the text box focused when clicking style buttons
$('stylebar').addEventListener('pointerdown', (ev) => { if (ev.target.closest('button')) ev.preventDefault(); });

$('font-file').addEventListener('change', async (ev) => {
  const files = [...ev.target.files];
  ev.target.value = '';
  let last = null;
  for (const f of files) {
    try { last = await addFontFile(f); msg(`Font “${last}” added. It stays in this browser for next time.`); } catch { msg(`“${f.name}” is not a font file this browser can use.`, true); }
  }
  if (last) styleChange((x) => { x.family = last; });
  const e = S.sel && findEdit(S.sel);
  if (e && e.type === 'text') fillFontSelect(e.family);
});

// ---------- find & replace ----------
let found = [];
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function currentText(run) { const e = S.edits.find((x) => x.source === run.key); return e ? e.text : run.str; }

async function doFind() {
  const q = $('find-text').value;
  const list = $('find-results');
  list.textContent = '';
  found = [];
  if (!q || !S.pdf) { $('find-status').textContent = 'Type the words to find.'; $('btn-replace-all').disabled = true; return; }
  const re = new RegExp(escapeRe(q), $('find-case').checked ? 'g' : 'gi');
  for (const p of S.pages) {
    if (!p.runs) { $('find-status').textContent = `Searching page ${p.i + 1} of ${S.pages.length}…`; await buildRuns(p); }
    for (const run of p.runs) {
      const t = currentText(run);
      const n = (t.match(re) || []).length;
      if (n) found.push({ p, run, n, t });
    }
  }
  const total = found.reduce((a, f) => a + f.n, 0);
  $('find-status').textContent = total ? `Found ${total} time${total > 1 ? 's' : ''} on ${new Set(found.map((f) => f.p.i)).size} page(s).` : 'Not found.';
  $('btn-replace-all').disabled = !total;
  for (const f of found.slice(0, 300)) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const m = f.t.search(re.global ? new RegExp(re.source, re.flags.replace('g', '')) : re);
    const strong = document.createElement('mark');
    strong.textContent = f.t.substr(m, q.length);
    b.append(`Page ${f.p.i + 1}: …${f.t.slice(Math.max(0, m - 25), m)}`, strong, `${f.t.slice(m + q.length, m + q.length + 25)}…`);
    b.addEventListener('click', () => { f.p.el.scrollIntoView({ block: 'center' }); flash(f.p, f.run); });
    li.append(b);
    list.append(li);
  }
  if (found.length > 300) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = `…and ${found.length - 300} more lines (all are included in Replace all).`; list.append(li); }
}

function flash(p, run) {
  const d = p.runsEl.querySelector(`[data-key="${run.key}"]`);
  if (!d) return;
  d.style.background = 'rgba(246, 226, 127, .7)';
  setTimeout(() => { d.style.background = ''; }, 1500);
}

async function replaceAll() {
  finishEditing();
  const q = $('find-text').value;
  const rep = $('replace-text').value;
  if (!q || !found.length) return;
  const re = new RegExp(escapeRe(q), $('find-case').checked ? 'g' : 'gi');
  const before = snapshot();
  let count = 0;
  const byPage = new Map();
  for (const f of found) { if (!byPage.has(f.p)) byPage.set(f.p, []); byPage.get(f.p).push(f); }
  let done = 0;
  for (const [p, list] of byPage) {
    $('find-status').textContent = `Replacing on page ${p.i + 1} (${++done} of ${byPage.size})…`;
    const pic = await pagePicture(p);
    if (!p.proxy) p.proxy = await S.pdf.getPage(p.i + 1);
    for (const f of list) {
      const existing = S.edits.find((x) => x.source === f.run.key);
      if (existing) existing.text = existing.text.replace(re, () => rep);
      else S.edits.push(editFromRun(p, f.run, pic, f.run.str.replace(re, () => rep)));
      count += f.n;
    }
    if (pic.temp) pic.canvas.width = pic.canvas.height = 0;
  }
  pushHistory(before);
  rerenderAll();
  changed();
  found = [];
  $('find-results').textContent = '';
  $('btn-replace-all').disabled = true;
  $('find-status').textContent = `Replaced ${count} time${count > 1 ? 's' : ''} on ${byPage.size} page(s). Use Undo to take it back.`;
}

$('btn-find').addEventListener('click', () => { $('findpanel').hidden = !$('findpanel').hidden; if (!$('findpanel').hidden) $('find-text').focus(); });
$('btn-find-close').addEventListener('click', () => { $('findpanel').hidden = true; });
$('btn-find-go').addEventListener('click', doFind);
$('find-text').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doFind(); });
$('find-case').addEventListener('change', doFind);
$('btn-replace-all').addEventListener('click', replaceAll);

// ---------- saving ----------
function suggestedName() {
  const base = S.name.replace(/\.pdf$/i, '');
  return `${base} (edited).pdf`;
}

let imageOnlyRetry = false;
function openSaveDialog() {
  finishEditing();
  if (!S.pdf) return;
  const pages = new Set(S.edits.map((e) => e.page)).size;
  $('save-summary').textContent = S.edits.length
    ? `${S.edits.length} change${S.edits.length > 1 ? 's' : ''} on ${pages} page${pages > 1 ? 's' : ''}. A new file is made; “${S.name}” is not changed.`
    : 'You have not made any changes yet. Saving makes an identical copy.';
  $('save-name').value = suggestedName();
  $('save-cover-box').hidden = !S.edits.some(hasCover);
  $('save-erase').checked = false;
  const warn = [];
  const imageOnly = imageOnlyRetry || (S.info && !S.info.ok);
  if (imageOnly) warn.push('This file is protected or unusual, so the copy will be saved as pictures of the pages. Its text will not be selectable.');
  if (S.info && S.info.signed) warn.push('This PDF is digitally signed. Any change makes the signature invalid.');
  $('save-warn').textContent = warn.join(' ');
  $('save-warn').hidden = !warn.length;
  $('save-result').textContent = '';
  $('save-progress').hidden = true;
  $('btn-save-go').disabled = false;
  $('btn-save-go').textContent = 'Save a copy';
  $('save-dialog').showModal();
}

async function runSave(ev) {
  ev.preventDefault();
  const go = $('btn-save-go');
  go.disabled = true;
  $('save-progress').hidden = false;
  $('save-result').textContent = '';
  let name = $('save-name').value.trim().replace(/[\\/:*?"<>|]+/g, '-') || suggestedName();
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  const imageOnly = imageOnlyRetry || (S.info && !S.info.ok);
  try {
    const { bytes, notes } = await buildEditedPdf({
      originalBytes: S.bytes, pdfjsDoc: S.pdf, numPages: S.pdf.numPages, viewports: S.pages.map((p) => p.vp),
      edits: S.edits, erase: $('save-erase').checked, imageOnly,
      onProgress: (f, text) => { $('save-bar').style.width = `${Math.round(f * 100)}%`; $('save-result').textContent = text; },
    });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    S.dirty = false;
    const extra = [];
    if (notes.picturePages.length && !imageOnly) extra.push(`Page${notes.picturePages.length > 1 ? 's' : ''} ${notes.picturePages.map((i) => i + 1).join(', ')} saved as pictures, so the covered text is gone.`);
    if (notes.unsearchable) extra.push('Some new words use letters that cannot be made searchable; they look right but cannot be searched.');
    $('save-result').textContent = `Saved “${name}” (${(bytes.length / 1024 / 1024).toFixed(2)} MB). Checked: the new file opens and has all ${S.pdf.numPages} pages. ${extra.join(' ')}`;
    go.textContent = 'Save again';
    msg(`Saved a copy: ${name}`);
  } catch (err) {
    console.error(err);
    const encrypted = /encrypt/i.test(String(err && err.message));
    $('save-result').textContent = `Nothing was saved: ${encrypted ? 'the file is protected.' : (err && err.message) || 'unknown problem.'} Your original file is unchanged.${imageOnly ? '' : ' You can try again: the copy will then be saved as pictures of the pages.'}`;
    if (!imageOnly) { imageOnlyRetry = true; go.textContent = 'Try saving as pictures'; }
  } finally {
    go.disabled = false;
  }
}
$('save-form').addEventListener('submit', runSave);
$('btn-save').addEventListener('click', openSaveDialog);
$('btn-save-cancel').addEventListener('click', () => $('save-dialog').close());
$('btn-pw-cancel').addEventListener('click', () => $('pw-dialog').close('cancel'));

// ---------- toolbar, zoom, navigation ----------
function setTool(t) {
  finishEditing();
  S.tool = t;
  document.body.classList.remove('tool-edit', 'tool-add', 'tool-cover');
  document.body.classList.add(`tool-${t}`);
  for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  msg({ edit: 'Click any text on a page to change it.', add: 'Click on a page where the new text should go.', cover: 'Drag over an area to cover it.' }[t]);
}
for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => setTool(b.dataset.tool));

function setEnabled(on) {
  for (const id of ['btn-find', 'btn-compare', 'btn-save']) $(id).disabled = !on;
}

function applyZoom(keepCenter = false) {
  const ratio = keepCenter && viewer.scrollHeight ? (viewer.scrollTop + viewer.clientHeight / 2) / viewer.scrollHeight : 0;
  for (const p of S.pages) {
    p.el.style.width = `${p.w * S.zoom}px`;
    p.el.style.height = `${p.h * S.zoom}px`;
    p.head.style.width = `${p.w * S.zoom}px`;
  }
  $('zoom-label').textContent = `${Math.round(S.zoom * 100)}%`;
  if (keepCenter) viewer.scrollTop = ratio * viewer.scrollHeight - viewer.clientHeight / 2;
  for (const p of S.pages) {
    if (!p.renderedAt) continue;
    const ta = p.editsEl.querySelector('.edit-area');
    if (ta) ta._place();
    if (p.visible) renderPage(p);
    renderEdits(p);
  }
}
function zoomBy(f) { S.zoom = clamp(Math.round(S.zoom * f * 100) / 100, 0.25, 4); applyZoom(true); }
$('btn-zoom-in').addEventListener('click', () => zoomBy(1.2));
$('btn-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));

let scrollQueued = false;
viewer.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const mid = viewer.scrollTop + viewer.clientHeight / 3;
    let lo = 0; let hi = S.pages.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; const p = S.pages[m]; if (p.el.offsetTop + p.el.offsetHeight < mid) lo = m + 1; else hi = m; }
    S.current = lo;
    if (document.activeElement !== $('page-input')) $('page-input').value = lo + 1;
  });
});
$('page-input').addEventListener('change', (ev) => {
  const n = clamp(parseInt(ev.target.value, 10) || 1, 1, S.pages.length);
  S.pages[n - 1]?.head.scrollIntoView({ block: 'start' });
});

$('btn-compare').addEventListener('click', () => {
  finishEditing();
  const on = document.body.classList.toggle('compare');
  $('btn-compare').setAttribute('aria-pressed', String(on));
  msg(on ? 'Showing the original. Click “Show original” again to see your changes.' : '');
});
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);

// ---------- opening files ----------
const pickFile = () => $('file-input').click();
$('btn-open').addEventListener('click', pickFile);
$('btn-open-big').addEventListener('click', pickFile);
async function openFile(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { msg('That is not a PDF file.', true); return; }
  await openBytes(file.name, new Uint8Array(await file.arrayBuffer()));
}
$('file-input').addEventListener('change', (ev) => { openFile(ev.target.files[0]); ev.target.value = ''; });

let dragDepth = 0;
window.addEventListener('dragenter', (ev) => { if (ev.dataTransfer?.types.includes('Files')) { dragDepth++; $('drop-hint').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-hint').hidden = true; } });
window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', (ev) => {
  ev.preventDefault(); dragDepth = 0; $('drop-hint').hidden = true;
  openFile(ev.dataTransfer?.files?.[0]);
});

// ---------- keyboard ----------
window.addEventListener('keydown', (ev) => {
  const mod = ev.ctrlKey || ev.metaKey;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); openSaveDialog(); return; }
  if (mod && ev.key.toLowerCase() === 'o') { ev.preventDefault(); pickFile(); return; }
  if (mod && ev.key.toLowerCase() === 'f' && S.pdf) { ev.preventDefault(); $('findpanel').hidden = false; $('find-text').focus(); return; }
  if (typing) return;
  if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
  if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.sel) { ev.preventDefault(); deleteSelected(); return; }
  if (ev.key === 'Escape') select(null);
});

window.addEventListener('beforeunload', (ev) => { if (S.dirty && S.edits.length) ev.preventDefault(); });

// ---------- start ----------
async function start() {
  setTool('edit');
  msg('');
  scanDeviceFonts();
  restoreCustomFonts();
  try {
    const [file, work] = await Promise.all([store.loadFile(), store.loadWork()]);
    if (file && work && work.edits && work.edits.length && work.name === file.name) {
      const when = new Date(work.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      $('restore-text').textContent = `You were editing “${file.name}” (${work.edits.length} change${work.edits.length > 1 ? 's' : ''}, ${when}). Your work was kept in this browser.`;
      $('restore').hidden = false;
      $('btn-restore').onclick = () => openBytes(file.name, file.bytes, work);
      $('btn-forget').onclick = async () => { await store.forget(); $('restore').hidden = true; };
    }
  } catch { /* storage unavailable: editing still works */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
start();
