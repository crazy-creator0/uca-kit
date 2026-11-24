// Private PDF Editor — runs entirely in this browser. No network requests are made with the user's file.
import * as pdfjs from '../vendor/pdf.min.mjs';
import { layoutText, textToCanvas, fontString } from './textdraw.js';
import {
  fontState, scanDeviceFonts, guessFont, addFontFile, restoreCustomFonts, canListAllFonts, listAllLocalFonts, isAvailable,
} from './fonts.js';
import * as store from './store.js';
import { buildEditedPdf, inspect, hasCover } from './export.js';
import { itemBox, drawItem, parseLinkTarget, RESIZABLE } from './items.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const viewer = $('viewer');
const pagesEl = $('pages');
const MAX_RENDERED = 14;
const MAX_CANVAS_PIXELS = 16e6;
const MAX_IMAGE_SIDE = 5000;
const WIDGET = 20; // pdf.js annotation type for form fields

const S = {
  name: '', bytes: null, pdf: null, pages: [], edits: [], undo: [], redo: [],
  tool: 'edit', zoom: 1, sel: null, editing: null, editBefore: null, info: null,
  dirty: false, current: 0, style: { family: null, size: 12, bold: false, italic: false, color: '#000000' },
  // order: page ids in the order they will be saved (deleted pages are left out); rot: extra turn per page id
  order: [], rot: {}, forms: {}, assets: {},
  draw: { color: '#d0021b', width: 2, fill: null },
  marks: { highlight: '#ffe600', underline: '#0b57d0', strike: '#d0021b' },
  shapeKind: 'rect', markKind: 'highlight',
};
window.__editor = S; // for automated tests and troubleshooting in the browser console
const images = new Map(); // asset id -> decoded picture (for drawing; not saved with the work)

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (v, total) => `${(v / total) * 100}%`;

function msg(text, isError = false) {
  const el = $('st-msg');
  el.textContent = text;
  el.classList.toggle('err', isError);
}

// How many things the user changed: edits, form fields and page changes (turned, deleted, inserted).
function countChanges(w) {
  const order = w.order || [];
  const pageOps = Object.values(w.rot || {}).filter(Boolean).length
    + (w.order ? order.filter((id) => id >= (w.numPages ?? Infinity)).length : 0)
    + (w.order && w.numPages ? w.numPages - order.filter((id) => id < w.numPages).length : 0);
  return (w.edits || []).length + Object.keys(w.forms || {}).length + pageOps;
}
const currentCount = () => countChanges({ ...S, numPages: S.pdf ? S.pdf.numPages : 0 });

// ---------- opening ----------
async function askPassword(again) {
  const dlg = $('pw-dialog');
  $('pw-error').hidden = !again;
  $('pw-input').value = '';
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? $('pw-input').value : null), { once: true }));
}

async function decodeAsset(id) {
  const a = S.assets[id];
  if (!a || images.has(id)) return;
  const img = new Image();
  img.src = a.data;
  try { await img.decode(); images.set(id, img); } catch { /* broken picture: shown as an empty box */ }
}

async function openBytes(name, bytes, work = null) {
  if (S.pdf && S.dirty && currentCount() && !work && !confirm('Open another file? Your changes to the current file are kept in this browser only until you open a new one.')) return;
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
  S.name = name; S.bytes = bytes; S.pdf = pdf; S.info = null;
  imageOnlyRetry = false; // a failed save of an earlier file must not affect this one
  S.edits = work ? work.edits : [];
  S.forms = (work && work.forms) || {};
  S.assets = (work && work.assets) || {};
  S.rot = (work && work.rot) || {};
  images.clear();
  await Promise.all(Object.keys(S.assets).map(decodeAsset));
  S.undo = []; S.redo = []; S.sel = null; S.editing = null; S.dirty = false;
  $('empty').hidden = true;

  const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
  const fit = (viewer.clientWidth - 40) / first.width;
  S.zoom = clamp(Math.round(fit * 20) / 20, 0.3, 1.5);
  for (let i = 0; i < pdf.numPages; i++) {
    if (i % 25 === 0) msg(`Reading pages… ${i + 1} of ${pdf.numPages}`);
    const vp = (await pdf.getPage(i + 1)).getViewport({ scale: 1 });
    addPageShell(i, vp, i);
  }
  for (const b of (work && work.blanks) || []) if (b.id === S.pages.length) addPageShell(b.id, blankViewport(b.w, b.h), null);
  S.order = (work && work.order) ? work.order.filter((id) => S.pages[id]) : S.pages.map((p) => p.i);
  hideStylebar();
  layoutPages();
  setEnabled(true);
  updateStatus();
  msg(`Opened “${name}”, ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}.`);
  if (!work) {
    store.saveFile(name, bytes).then(() => saveWorkSoon()).catch(() => msg('Could not keep a backup in this browser (storage full or blocked). Editing still works.'));
  }
  inspect(bytes).then((info) => {
    if (S.pdf !== pdf) return;
    S.info = info;
    if (!info.ok) msg(info.encrypted ? 'This PDF is protected. You can edit it; the copy will be saved as pictures of the pages.' : 'This PDF is unusual. You can edit it; the copy may need to be saved as pictures of the pages.');
    else if (info.signed) msg('Note: this PDF is digitally signed. Saving any change makes the signature invalid.');
  });
}

function closeDoc() {
  if (S.task) S.task.destroy();
  S.task = null; S.pdf = null; S.pages = []; S.order = [];
  pagesEl.textContent = '';
  observer.disconnect();
  hideStylebar();
}

// A stand-in for a pdf.js viewport, for blank pages the user inserts.
function blankViewport(w, h) {
  return { width: w, height: h, transform: [1, 0, 0, -1, 0, h], convertToPdfPoint: (x, y) => [x, h - y] };
}

function addPageShell(i, vp, src) {
  const head = document.createElement('div');
  head.className = 'pagehead';
  head.dataset.page = i;
  const label = document.createElement('span');
  label.className = 'pagelabel';
  const tools = document.createElement('span');
  tools.className = 'pagetools';
  for (const [act, text, title] of [
    ['rotate', 'Rotate', 'Turn this page a quarter turn clockwise'],
    ['insert', 'Insert page', 'Insert a blank page after this one'],
    ['delete', 'Delete page', 'Leave this page out of the saved copy'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn tiny'; b.dataset.act = act; b.textContent = text; b.title = title;
    tools.append(b);
  }
  head.append(label, tools);
  const wrap = document.createElement('div');
  wrap.className = 'pagewrap';
  const el = document.createElement('div');
  el.className = 'page';
  el.dataset.page = i;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'Loading page…';
  const runsEl = document.createElement('div'); runsEl.className = 'runs';
  const formsEl = document.createElement('div'); formsEl.className = 'forms';
  const editsEl = document.createElement('div'); editsEl.className = 'edits';
  el.append(loading, runsEl, formsEl, editsEl);
  wrap.append(el);
  pagesEl.append(head, wrap);
  const p = {
    i, src, vp, w: vp.width, h: vp.height, el, wrap, head, label, runsEl, formsEl, editsEl, loading,
    canvas: null, renderedAt: 0, rendering: false, stale: false, runs: null, widgets: null, proxy: null, visible: false,
  };
  S.pages.push(p);
  observer.observe(el);
  return p;
}

// Puts pages in their saved order, hides deleted ones, numbers them and applies zoom and turning.
function layoutPages() {
  const shown = new Set(S.order);
  for (const p of S.pages) { p.head.hidden = !shown.has(p.i); p.wrap.hidden = !shown.has(p.i); }
  S.order.forEach((id, k) => {
    const p = S.pages[id];
    pagesEl.append(p.head, p.wrap);
    p.label.textContent = `Page ${k + 1}${p.src === null ? ' (blank, added)' : ''}${S.rot[id] ? ' (turned)' : ''}`;
  });
  $('page-count').textContent = `of ${S.order.length}`;
  $('page-input').max = S.order.length;
  applyZoom();
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

async function getProxy(p) {
  return p.proxy || (p.proxy = await S.pdf.getPage(p.src + 1));
}

async function renderPage(p) {
  if (!S.pdf || p.rendering) return;
  const scale = wantedScale(p);
  if (!p.stale && Math.abs(p.renderedAt - scale) < 0.001) return;
  p.rendering = true;
  p.stale = false;
  const pdf = S.pdf;
  try {
    if (p.src === null) { // blank page: the white page background is all there is
      p.runs = []; p.widgets = [];
      p.loading.hidden = true;
      p.renderedAt = scale;
    } else {
      const page = await getProxy(p);
      if (!p.widgets) await loadWidgets(p);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.className = 'render';
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      // ENABLE_STORAGE: form fields show the values typed in this editor.
      await page.render({ canvas, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE }).promise;
      if (S.pdf !== pdf) return;
      if (p.canvas) p.canvas.remove();
      p.canvas = canvas;
      p.el.prepend(canvas);
      p.loading.hidden = true;
      p.renderedAt = scale;
      if (!p.runs) await buildRuns(p);
    }
    renderRuns(p);
    renderForms(p);
    renderEdits(p);
    freeFarPages();
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') { p.loading.textContent = 'This page could not be shown.'; p.loading.hidden = false; }
  } finally {
    p.rendering = false;
  }
  if (p.visible && (p.stale || Math.abs(p.renderedAt - wantedScale(p)) > 0.001)) renderPage(p);
}

function freeFarPages() {
  const pos = new Map(S.order.map((id, k) => [id, k]));
  const dist = (p) => (pos.has(p.i) ? Math.abs(pos.get(p.i) - (pos.get(S.current) ?? 0)) : Infinity);
  const rendered = S.pages.filter((p) => p.renderedAt && !p.visible);
  if (rendered.length + S.pages.filter((p) => p.visible).length <= MAX_RENDERED) return;
  rendered.sort((a, b) => dist(b) - dist(a));
  for (const p of rendered.slice(0, rendered.length - 4)) {
    if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); }
    p.canvas = null; p.renderedAt = 0;
    p.loading.hidden = false;
    p.editsEl.textContent = '';
    p.formsEl.textContent = '';
  }
}

function rerenderAll() {
  for (const p of S.pages) if (p.renderedAt) { renderRuns(p); renderEdits(p); }
}

// ---------- original text (what can be clicked to change) ----------
async function buildRuns(p) {
  if (p.src === null) { p.runs = []; return; }
  const page = await getProxy(p);
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

// ---------- form fields (fill in) ----------
async function loadWidgets(p) {
  if (p.src === null) { p.widgets = []; return; }
  let annots = [];
  try { annots = await (await getProxy(p)).getAnnotations({ intent: 'display' }); } catch { /* no fields */ }
  p.widgets = annots.filter((a) => a.annotationType === WIDGET && a.fieldName && !a.pushButton && !a.hidden && ['Tx', 'Btn', 'Ch'].includes(a.fieldType));
  for (const a of p.widgets) setStorage(a);
}

function formValue(a) {
  if (Object.prototype.hasOwnProperty.call(S.forms, a.fieldName)) return S.forms[a.fieldName];
  if (a.checkBox) return !!a.fieldValue && a.fieldValue !== 'Off';
  if (a.fieldType === 'Ch') return Array.isArray(a.fieldValue) ? (a.fieldValue[0] ?? '') : (a.fieldValue ?? '');
  return a.fieldValue ?? '';
}

function setStorage(a) {
  const st = S.pdf.annotationStorage;
  if (!Object.prototype.hasOwnProperty.call(S.forms, a.fieldName)) { st.remove(a.id); return; }
  const v = S.forms[a.fieldName];
  if (a.checkBox) st.setValue(a.id, { value: v === true });
  else if (a.radioButton) st.setValue(a.id, { value: v === a.buttonValue });
  else st.setValue(a.id, { value: String(v ?? '') });
}

// After a value changes (or undo), every widget of that field is updated and its page redrawn.
function refreshForms(name = null) {
  for (const p of S.pages) {
    if (!p.widgets || !p.widgets.some((a) => !name || a.fieldName === name)) continue;
    for (const a of p.widgets) setStorage(a);
    if (p.renderedAt) { p.stale = true; renderPage(p); }
  }
}

function setForm(name, value) {
  const before = snapshot();
  S.forms[name] = value;
  pushHistory(before);
  changed();
  refreshForms(name);
}

function widgetBox(p, a) {
  const m = p.vp.transform;
  const at = (x, y) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
  const [x1, y1] = at(a.rect[0], a.rect[1]);
  const [x2, y2] = at(a.rect[2], a.rect[3]);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

function renderForms(p) {
  p.formsEl.textContent = '';
  if (!p.widgets || !p.renderedAt) return;
  p.widgets.forEach((a, k) => {
    if (a.readOnly) return;
    const b = widgetBox(p, a);
    const d = document.createElement('div');
    d.className = 'fld';
    d.dataset.k = k;
    d.title = a.checkBox || a.radioButton ? 'Click to tick or untick' : 'Click to fill in';
    Object.assign(d.style, { left: pct(b.x, p.w), top: pct(b.y, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h) });
    p.formsEl.append(d);
  });
}

function openFieldEditor(p, a) {
  const b = widgetBox(p, a);
  let el;
  if (a.fieldType === 'Ch') {
    el = document.createElement('select');
    for (const o of a.options || []) el.append(new Option(o.displayValue ?? o.exportValue, o.exportValue));
  } else {
    el = document.createElement(a.multiLine ? 'textarea' : 'input');
    if (a.maxLen) el.maxLength = a.maxLen;
  }
  el.className = 'fld-editor';
  el.value = String(formValue(a) ?? '');
  el.setAttribute('aria-label', a.alternativeText || a.fieldName);
  const size = (a.defaultAppearanceData && a.defaultAppearanceData.fontSize) || Math.min(12, b.h * 0.7);
  Object.assign(el.style, { left: pct(b.x, p.w), top: pct(b.y, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h), fontSize: `${Math.max(6, size) * S.zoom}px` });
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    const v = el.value;
    el.remove();
    if (keep && v !== String(formValue(a) ?? '')) setForm(a.fieldName, v);
  };
  el.addEventListener('blur', () => finish(true));
  el.addEventListener('change', () => { if (a.fieldType === 'Ch') finish(true); });
  el.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    if (ev.key === 'Enter' && el.tagName === 'INPUT') { ev.preventDefault(); finish(true); }
  });
  p.formsEl.append(el);
  el.focus();
}

pagesEl.addEventListener('click', (ev) => {
  const fld = ev.target.closest('.fld');
  if (!fld || document.body.classList.contains('compare')) return;
  const p = S.pages[+fld.closest('.page').dataset.page];
  const a = p.widgets[+fld.dataset.k];
  select(null);
  if (a.checkBox) setForm(a.fieldName, !formValue(a));
  else if (a.radioButton) setForm(a.fieldName, a.buttonValue);
  else openFieldEditor(p, a);
});

// ---------- changes drawn on the page ----------
function editBox(e) {
  if (e.type === 'text') {
    const L = layoutText(e);
    return { left: L.left, top: L.top, w: Math.max(L.w, e.size * 0.6), h: L.h, L };
  }
  return itemBox(e);
}

function renderEdits(p) {
  const layer = p.editsEl;
  layer.textContent = '';
  if (!p.renderedAt) return;
  const px = S.zoom * (window.devicePixelRatio || 1);
  for (const e of S.edits) {
    if (e.page !== p.i) continue;
    if (e.type === 'text' && e.cover) {
      const c = document.createElement('div');
      c.className = 'edit cover';
      Object.assign(c.style, { left: pct(e.cover.x, p.w), top: pct(e.cover.y, p.h), width: pct(e.cover.w, p.w), height: pct(e.cover.h, p.h), background: e.cover.color });
      layer.append(c);
    }
    const b = editBox(e);
    const el = document.createElement('div');
    el.className = `edit ${e.type}`;
    el.dataset.id = e.id;
    Object.assign(el.style, { left: pct(b.left, p.w), top: pct(b.top, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h) });
    if (e.type === 'box') {
      el.style.background = e.color;
      el.title = 'Cover box: drag to move, drag the corner to resize';
    } else if (e.type === 'text') {
      if (S.editing === e.id) {
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
    } else if (e.type === 'image') {
      const img = document.createElement('img');
      img.alt = e.sig ? 'Signature' : 'Picture';
      img.draggable = false;
      if (S.assets[e.asset]) img.src = S.assets[e.asset].data;
      el.append(img);
      el.title = 'Drag to move, drag the corner to resize';
    } else if (e.type === 'link') {
      const t = parseLinkTarget(e.url);
      el.title = t ? (t.page ? `Link to page ${t.page}` : `Link to ${t.url}`) : 'Link: choose where it goes in the bar above';
      if (!t) el.classList.add('unset');
    } else {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(b.w * px));
      c.height = Math.max(1, Math.ceil(b.h * px));
      drawItem(c.getContext('2d'), e, px, b.left, b.top);
      el.append(c);
      if (e.type === 'mark' && e.kind === 'highlight') el.classList.add('hl');
      el.title = 'Drag to move';
    }
    if (RESIZABLE.has(e.type)) {
      const h = document.createElement('div');
      h.className = 'handle';
      h.title = 'Drag to resize';
      el.append(h);
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
function snapshot() { return JSON.stringify({ edits: S.edits, forms: S.forms, order: S.order, rot: S.rot }); }
function restoreSnapshot(json) {
  const s = JSON.parse(json);
  const pagesChanged = JSON.stringify([s.order, s.rot]) !== JSON.stringify([S.order, S.rot]);
  const formsChanged = JSON.stringify(s.forms) !== JSON.stringify(S.forms);
  S.edits = s.edits; S.forms = s.forms; S.order = s.order; S.rot = s.rot;
  if (pagesChanged) layoutPages();
  if (formsChanged) refreshForms();
}
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
  restoreSnapshot(S.undo.pop());
  S.sel = null; hideStylebar();
  rerenderAll(); changed();
}
function redo() {
  finishEditing();
  if (!S.redo.length) return;
  S.undo.push(snapshot());
  restoreSnapshot(S.redo.pop());
  S.sel = null; hideStylebar();
  rerenderAll(); changed();
}

function updateStatus() {
  const n = currentCount();
  const pages = new Set(S.edits.filter((e) => S.order.includes(e.page)).map((e) => e.page)).size;
  $('st-changes').textContent = n ? `${n} change${n > 1 ? 's' : ''}${pages ? ` on ${pages} page${pages > 1 ? 's' : ''}` : ''}` : 'No changes';
  $('btn-undo').disabled = !S.undo.length;
  $('btn-redo').disabled = !S.redo.length;
}

let saveTimer = null;
function saveWorkSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!S.bytes || !S.pdf) return;
    try {
      await store.saveWork({
        name: S.name, size: S.bytes.length, numPages: S.pdf.numPages, edits: S.edits, forms: S.forms, order: S.order, rot: S.rot,
        assets: S.assets, blanks: S.pages.filter((p) => p.src === null).map((p) => ({ id: p.i, w: p.w, h: p.h })), at: Date.now(),
      });
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
  if (p.src === null) {
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 4;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4, 4);
    return { canvas, scale: 4 / Math.max(p.w, p.h), temp: true };
  }
  if (p.canvas && p.renderedAt) return { canvas: p.canvas, scale: p.renderedAt, temp: false };
  const page = await getProxy(p);
  const scale = Math.min(1.5, Math.sqrt(4e6 / (p.w * p.h)));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE }).promise;
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

// Adds a finished (non-text) change with one undo step, and selects it.
function addItem(e, before = snapshot()) {
  S.edits.push(e);
  pushHistory(before);
  const p = pageOf(e);
  renderEdits(p);
  select(e.id);
  changed();
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
// Page point (in PDF points, top-left origin) under the pointer; works on turned pages too.
function pagePoint(p, ev) {
  const r = p.el.getBoundingClientRect();
  const dx = ev.clientX - (r.left + r.width / 2);
  const dy = ev.clientY - (r.top + r.height / 2);
  const a = ((S.rot[p.i] || 0) * Math.PI) / 180;
  const ux = dx * Math.cos(a) + dy * Math.sin(a);
  const uy = -dx * Math.sin(a) + dy * Math.cos(a);
  return { x: ux / S.zoom + p.w / 2, y: uy / S.zoom + p.h / 2 };
}

pagesEl.addEventListener('pointerdown', async (ev) => {
  if (ev.button !== 0 || document.body.classList.contains('compare')) return;
  const pageEl = ev.target.closest('.page');
  if (!pageEl || ev.target.closest('.edit-area, .fld, .fld-editor')) return;
  const p = S.pages[+pageEl.dataset.page];
  const handle = ev.target.closest('.handle');
  if (handle) return resizeEdit(ev, p, findEdit(handle.parentElement.dataset.id));
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
  if (S.tool === 'draw') return drawInk(ev, p);
  if (['cover', 'shape', 'mark', 'link'].includes(S.tool)) drawArea(ev, p, S.tool);
});

viewer.addEventListener('pointerdown', (ev) => {
  if (!ev.target.closest('.page') && (S.editing || S.sel)) select(null);
});

function dragEdit(ev, p, e) {
  if (!e) return;
  ev.preventDefault();
  const start = pagePoint(p, ev);
  const orig = e.type === 'text' ? { x: e.x, y: e.baseline } : e.type === 'ink' ? { points: e.points.map((q) => [...q]) } : { x: e.x, y: e.y };
  const before = snapshot();
  const el = ev.target.closest('.edit');
  let moved = false;
  el.setPointerCapture(ev.pointerId);
  const move = (m) => {
    const pt = pagePoint(p, m);
    const dx = pt.x - start.x; const dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) * S.zoom < 5) return;
    moved = true;
    if (e.type === 'text') { e.x = orig.x + dx; e.baseline = orig.y + dy; }
    else if (e.type === 'ink') e.points = orig.points.map(([x, y]) => [x + dx, y + dy]);
    else { e.x = orig.x + dx; e.y = orig.y + dy; }
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

function resizeEdit(ev, p, e) {
  if (!e) return;
  ev.preventDefault();
  ev.stopPropagation();
  const start = pagePoint(p, ev);
  const o = { w: e.w, h: e.h };
  const before = snapshot();
  const el = ev.target.closest('.edit');
  const handle = ev.target;
  handle.setPointerCapture(ev.pointerId);
  let moved = false;
  const move = (m) => {
    const pt = pagePoint(p, m);
    const dx = pt.x - start.x; const dy = pt.y - start.y;
    moved = true;
    if (e.type === 'shape' && e.shape === 'line') { e.w = o.w + dx; e.h = o.h + dy; }
    else if (e.type === 'image') {
      const k = Math.max(4 / o.w, ((o.w + dx) / o.w + (o.h + dy) / o.h) / 2);
      e.w = o.w * k; e.h = o.h * k;
    } else { e.w = Math.max(3, o.w + dx); e.h = Math.max(3, o.h + dy); }
    const b = editBox(e);
    Object.assign(el.style, { left: pct(b.left, p.w), top: pct(b.top, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h) });
  };
  const up = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    if (moved) { pushHistory(before); changed(); renderEdits(p); }
    select(e.id);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

// Highlight / underline / strike out: snaps to the lines of text under the dragged area
// (a click marks the whole line under the pointer). Without text there, marks the area itself.
function marksFor(p, b, click) {
  const kind = S.markKind;
  const make = (x, y, w, h) => ({ id: uid(), page: p.i, type: 'mark', kind, x, y, w, h, color: S.marks[kind] });
  const runs = (p.runs || []).filter((r) => (click
    ? b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h
    : r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y));
  if (click) return runs.slice(0, 1).map((r) => make(r.x, r.y, r.w, r.h));
  const out = [];
  for (const r of runs) {
    const x1 = Math.max(r.x, b.x); const x2 = Math.min(r.x + r.w, b.x + b.w);
    if (x2 - x1 > 1) out.push(make(x1, r.y, x2 - x1, r.h));
  }
  return out.length ? out : [make(b.x, b.y, b.w, b.h)];
}

function drawArea(ev, p, kind) {
  ev.preventDefault();
  const a = pagePoint(p, ev);
  const draft = document.createElement('div');
  draft.className = `draft ${kind}`;
  p.el.append(draft);
  p.el.setPointerCapture(ev.pointerId);
  let b = { x: a.x, y: a.y, w: 0, h: 0 };
  let c = a;
  const move = (m) => {
    c = pagePoint(p, m);
    b = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
    Object.assign(draft.style, { left: pct(b.x, p.w), top: pct(b.y, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h) });
  };
  const up = async () => {
    p.el.removeEventListener('pointermove', move);
    p.el.removeEventListener('pointerup', up);
    p.el.removeEventListener('pointercancel', up);
    draft.remove();
    const tiny = b.w < 2 && b.h < 2;
    const before = snapshot();
    if (kind === 'mark') {
      const list = marksFor(p, tiny ? a : b, tiny);
      if (!list.length) { msg('Drag over text (or click a line of text) to mark it.'); return; }
      S.edits.push(...list.slice(0, -1));
      return addItem(list.at(-1), before);
    }
    if (kind === 'shape' && S.shapeKind === 'line') {
      if (Math.hypot(c.x - a.x, c.y - a.y) < 3) return;
      return addItem({ id: uid(), page: p.i, type: 'shape', shape: 'line', x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y, color: S.draw.color, width: Math.max(0.5, S.draw.width), fill: null }, before);
    }
    if (b.w < 2 || b.h < 2) return;
    if (kind === 'shape') return addItem({ id: uid(), page: p.i, type: 'shape', shape: S.shapeKind, ...b, color: S.draw.color, width: S.draw.width, fill: S.draw.fill }, before);
    if (kind === 'link') {
      addItem({ id: uid(), page: p.i, type: 'link', ...b, url: '' }, before);
      $('inp-link').focus();
      msg('Type a web address or a page number for the link in the bar above.');
      return;
    }
    const ring = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
    const pic = await pagePicture(p);
    const color = sampleColors(pic.canvas, pic.scale, ring).bg;
    addItem({ id: uid(), page: p.i, type: 'box', x: b.x, y: b.y, w: b.w, h: b.h, color }, before);
  };
  p.el.addEventListener('pointermove', move);
  p.el.addEventListener('pointerup', up);
  p.el.addEventListener('pointercancel', up);
}

function drawInk(ev, p) {
  ev.preventDefault();
  const pts = [];
  const add = (m) => { const q = pagePoint(p, m); const last = pts.at(-1); if (!last || Math.hypot(q.x - last[0], q.y - last[1]) > 0.4) pts.push([+q.x.toFixed(2), +q.y.toFixed(2)]); };
  add(ev);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'inkdraft');
  svg.setAttribute('viewBox', `0 0 ${p.w} ${p.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  Object.entries({ fill: 'none', stroke: S.draw.color, 'stroke-width': S.draw.width || 1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }).forEach(([k, v]) => line.setAttribute(k, v));
  svg.append(line);
  p.el.append(svg);
  p.el.setPointerCapture(ev.pointerId);
  const move = (m) => { add(m); line.setAttribute('points', pts.map((q) => q.join(',')).join(' ')); };
  const up = () => {
    p.el.removeEventListener('pointermove', move);
    p.el.removeEventListener('pointerup', up);
    p.el.removeEventListener('pointercancel', up);
    svg.remove();
    addItem({ id: uid(), page: p.i, type: 'ink', points: pts, color: S.draw.color, width: Math.max(0.5, S.draw.width || 1) });
  };
  p.el.addEventListener('pointermove', move);
  p.el.addEventListener('pointerup', up);
  p.el.addEventListener('pointercancel', up);
}

// The page and point at the middle of what is on screen (where new pictures and signatures go).
function viewCenter() {
  const vr = viewer.getBoundingClientRect();
  const probe = { clientX: vr.left + vr.width / 2, clientY: vr.top + vr.height / 2 };
  const p = S.pages[S.current] && S.order.includes(S.current) ? S.pages[S.current] : S.pages[S.order[0]];
  const pt = pagePoint(p, probe);
  return { p, x: clamp(pt.x, 0, p.w), y: clamp(pt.y, 0, p.h) };
}

function placeImage(assetId, natW, natH, sig = false) {
  const { p, x, y } = viewCenter();
  let w = sig ? Math.min(180, p.w * 0.4) : Math.min(natW * 0.75, p.w * 0.5);
  let h = w * (natH / natW);
  const maxH = sig ? 70 : p.h * 0.5;
  if (h > maxH) { w *= maxH / h; h = maxH; }
  const e = { id: uid(), page: p.i, type: 'image', asset: assetId, sig, x: clamp(x - w / 2, 0, Math.max(0, p.w - w)), y: clamp(y - h / 2, 0, Math.max(0, p.h - h)), w, h };
  addItem(e);
}

async function addAsset(canvas, mime) {
  const id = uid();
  S.assets[id] = { mime, data: canvas.toDataURL(mime, 0.92) };
  await decodeAsset(id);
  return id;
}

// Pictures are redrawn once through a canvas: this applies photo orientation and turns any image type
// into PNG (keeps transparency) or JPEG (photos), the two kinds a PDF can hold.
$('image-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file || !S.pdf) return;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const id = await addAsset(c, /jpe?g/i.test(file.type) ? 'image/jpeg' : 'image/png');
    placeImage(id, img.naturalWidth, img.naturalHeight);
    msg('Picture added. Drag it to move it, drag its corner to resize it.');
  } catch {
    msg(`“${file.name}” is not a picture this browser can read.`, true);
  } finally {
    URL.revokeObjectURL(url);
  }
});
$('btn-image').addEventListener('click', () => $('image-file').click());

// ---------- signatures ----------
const pad = $('sign-pad');
const padCtx = pad.getContext('2d');
let padDrawn = false;
let signMode = 'draw';
const SIGN_FONTS = ['Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Snell Roundhand', 'Bradley Hand', 'Zapfino', 'Z003', 'URW Chancery L', 'Comic Sans MS'];

function clearPad() { padCtx.clearRect(0, 0, pad.width, pad.height); padDrawn = false; }
pad.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  pad.setPointerCapture(ev.pointerId);
  const r = pad.getBoundingClientRect();
  const at = (m) => [(m.clientX - r.left) * (pad.width / r.width), (m.clientY - r.top) * (pad.height / r.height)];
  padCtx.strokeStyle = $('sign-color').value; padCtx.lineWidth = 3.5; padCtx.lineCap = 'round'; padCtx.lineJoin = 'round';
  padCtx.beginPath(); padCtx.moveTo(...at(ev)); padCtx.lineTo(...at(ev)); padCtx.stroke();
  padDrawn = true;
  const move = (m) => { padCtx.lineTo(...at(m)); padCtx.stroke(); };
  const up = () => { pad.removeEventListener('pointermove', move); pad.removeEventListener('pointerup', up); pad.removeEventListener('pointercancel', up); };
  pad.addEventListener('pointermove', move); pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
});

function typedSignature() {
  const name = $('sign-name').value.trim();
  if (!name) return null;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `96px ${$('sign-font').value === 'cursive' ? 'cursive' : `"${$('sign-font').value}", cursive`}`;
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(name).width + 40); c.height = 150;
  ctx.font = font; ctx.fillStyle = $('sign-color').value; ctx.textBaseline = 'middle';
  ctx.fillText(name, 20, 75);
  return c;
}

// Cuts away the empty space around the drawn signature.
function trimmed(canvas) {
  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const m = 6;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1 + m * 2; out.height = y1 - y0 + 1 + m * 2;
  out.getContext('2d').drawImage(canvas, x0 - m, y0 - m, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function setSignMode(mode) {
  signMode = mode;
  $('sign-draw').hidden = mode !== 'draw';
  $('sign-type').hidden = mode !== 'type';
  $('sign-tab-draw').setAttribute('aria-pressed', String(mode === 'draw'));
  $('sign-tab-type').setAttribute('aria-pressed', String(mode === 'type'));
  if (mode === 'type') $('sign-name').focus();
}

async function showSavedSignatures() {
  const box = $('sign-saved');
  box.textContent = '';
  let list = [];
  try { list = await store.loadSigns(); } catch { /* storage blocked */ }
  $('sign-saved-box').hidden = !list.length;
  for (const s of list) {
    const item = document.createElement('span');
    item.className = 'signitem';
    const use = document.createElement('button');
    use.type = 'button'; use.className = 'btn'; use.title = 'Place this signature';
    const img = document.createElement('img'); img.src = s.data; img.alt = 'Saved signature';
    use.append(img);
    use.addEventListener('click', async () => {
      const im = new Image(); im.src = s.data; await im.decode();
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0);
      const id = await addAsset(c, 'image/png');
      $('sign-dialog').close();
      placeImage(id, c.width, c.height, true);
    });
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small danger'; del.textContent = 'Forget';
    del.title = 'Remove this saved signature from this browser';
    del.addEventListener('click', async () => { await store.deleteSign(s.id); showSavedSignatures(); });
    item.append(use, del);
    box.append(item);
  }
}

$('btn-sign').addEventListener('click', () => {
  if (!S.pdf) return;
  finishEditing();
  clearPad();
  const sel = $('sign-font');
  if (!sel.options.length) for (const f of [...SIGN_FONTS.filter(isAvailable), 'cursive']) sel.append(new Option(f === 'cursive' ? 'Handwriting (default)' : f, f));
  $('sign-error').hidden = true;
  setSignMode(signMode);
  showSavedSignatures();
  $('sign-dialog').showModal();
});
$('sign-tab-draw').addEventListener('click', () => setSignMode('draw'));
$('sign-tab-type').addEventListener('click', () => setSignMode('type'));
$('sign-clear').addEventListener('click', () => { clearPad(); $('sign-name').value = ''; });
$('sign-cancel').addEventListener('click', () => $('sign-dialog').close());
$('sign-use').addEventListener('click', async () => {
  const src = signMode === 'draw' ? (padDrawn ? pad : null) : typedSignature();
  const c = src && trimmed(src);
  if (!c) { $('sign-error').hidden = false; return; }
  const id = await addAsset(c, 'image/png');
  if ($('sign-remember').checked) store.saveSign({ id: uid(), data: S.assets[id].data, at: Date.now() }).catch(() => msg('Could not remember the signature (storage blocked).'));
  $('sign-dialog').close();
  placeImage(id, c.width, c.height, true);
  msg('Signature added. Drag it into place; drag its corner to resize it.');
});

// ---------- page changes: turn, insert blank, delete ----------
pagesEl.addEventListener('click', (ev) => {
  const b = ev.target.closest('.pagehead button[data-act]');
  if (!b || !S.pdf) return;
  finishEditing();
  select(null);
  const id = +b.closest('.pagehead').dataset.page;
  const before = snapshot();
  const k = S.order.indexOf(id);
  if (b.dataset.act === 'rotate') {
    S.rot = { ...S.rot, [id]: ((S.rot[id] || 0) + 90) % 360 };
    if (!S.rot[id]) delete S.rot[id];
  } else if (b.dataset.act === 'delete') {
    if (S.order.length === 1) { msg('A PDF needs at least one page.', true); return; }
    S.order = S.order.filter((x) => x !== id);
    msg(`Page ${k + 1} will be left out of the saved copy. Use Undo to bring it back.`);
  } else if (b.dataset.act === 'insert') {
    const p = S.pages[id];
    const turned = (S.rot[id] || 0) % 180 !== 0;
    const blank = addPageShell(S.pages.length, blankViewport(turned ? p.h : p.w, turned ? p.w : p.h), null);
    S.order = [...S.order.slice(0, k + 1), blank.i, ...S.order.slice(k + 1)];
  }
  pushHistory(before);
  layoutPages();
  changed();
});

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

const STYLE_CONTROLS = ['sel-font', 'inp-size', 'btn-bold', 'btn-italic', 'inp-color', 'inp-cover', 'chk-fill', 'inp-fill', 'inp-width', 'inp-link', 'btn-delete'];
function showStylebar(e) {
  $('stylebar').hidden = false;
  $('style-hint').hidden = true;
  for (const id of STYLE_CONTROLS) $(id).disabled = false;
  for (const el of document.querySelectorAll('#stylebar [data-for]')) el.hidden = !el.dataset.for.split(' ').includes(e.type);
  $('cover-field').hidden = !(e.type === 'box' || e.cover);
  $('inp-cover').value = e.type === 'box' ? e.color : e.cover ? e.cover.color : '#ffffff';
  if (e.type === 'shape' && e.shape === 'line') $('fill-field').hidden = true;
  if (e.color && e.type !== 'box') $('inp-color').value = e.color;
  if (e.type === 'text') {
    fillFontSelect(e.family);
    $('inp-size').value = Math.round(e.size * 10) / 10;
    $('btn-bold').setAttribute('aria-pressed', String(!!e.bold));
    $('btn-italic').setAttribute('aria-pressed', String(!!e.italic));
  }
  if (e.type === 'shape') { $('chk-fill').checked = !!e.fill; $('inp-fill').value = e.fill || '#ffffff'; }
  if (e.type === 'shape' || e.type === 'ink') $('inp-width').value = e.width;
  if (e.type === 'link') $('inp-link').value = e.url || '';
  $('orig-font').textContent = e.origFont ? `Original font: ${e.origFont}` : '';
}
// The bar stays in place (only its controls switch off) so the pages never jump under the pointer.
function hideStylebar() {
  $('stylebar').hidden = !S.pdf;
  $('style-hint').hidden = false;
  $('orig-font').textContent = '';
  for (const id of STYLE_CONTROLS) $(id).disabled = true;
  for (const el of document.querySelectorAll('#stylebar [data-for]')) el.hidden = !el.dataset.for.split(' ').includes('text');
  $('cover-field').hidden = true;
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
  if (e.type === 'shape' || e.type === 'ink') S.draw = { color: e.color, width: e.width, fill: e.type === 'shape' ? e.fill : S.draw.fill };
  if (e.type === 'mark') S.marks[e.kind] = e.color;
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
$('inp-color').addEventListener('change', (ev) => styleChange((x) => { if (x.type !== 'box') x.color = ev.target.value; }));
$('inp-cover').addEventListener('change', (ev) => styleChange((x) => { if (x.type === 'box') x.color = ev.target.value; else if (x.cover) x.cover.color = ev.target.value; }));
const fillChange = () => styleChange((x) => { if (x.type === 'shape') x.fill = $('chk-fill').checked ? $('inp-fill').value : null; });
$('chk-fill').addEventListener('change', fillChange);
$('inp-fill').addEventListener('change', () => { $('chk-fill').checked = true; fillChange(); });
$('inp-width').addEventListener('change', (ev) => {
  const v = parseFloat(ev.target.value);
  if (v >= 0 && v <= 50) styleChange((x) => { if (x.type === 'shape' || x.type === 'ink') x.width = x.type === 'shape' && x.shape !== 'line' ? v : Math.max(0.5, v); });
});
$('inp-link').addEventListener('change', (ev) => {
  const v = ev.target.value.trim();
  const t = parseLinkTarget(v);
  if (v && !t) { msg('That is not a web address or page number this editor can link to.', true); return; }
  if (t && t.page && t.page > S.order.length) msg(`There is no page ${t.page}; the saved copy has ${S.order.length} pages.`, true);
  else msg(t ? (t.page ? `The link goes to page ${t.page}.` : `The link goes to ${t.url}.`) : '');
  styleChange((x) => { if (x.type === 'link') x.url = v; });
});
$('inp-link').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });
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
  for (const [k, id] of S.order.entries()) {
    const p = S.pages[id];
    if (!p.runs) { $('find-status').textContent = `Searching page ${k + 1} of ${S.order.length}…`; await buildRuns(p); }
    for (const run of p.runs) {
      const t = currentText(run);
      const n = (t.match(re) || []).length;
      if (n) found.push({ p, k, run, n, t });
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
    b.append(`Page ${f.k + 1}: …${f.t.slice(Math.max(0, m - 25), m)}`, strong, `${f.t.slice(m + q.length, m + q.length + 25)}…`);
    b.addEventListener('click', () => { f.p.wrap.scrollIntoView({ block: 'center' }); flash(f.p, f.run); });
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
    $('find-status').textContent = `Replacing on page ${list[0].k + 1} (${++done} of ${byPage.size})…`;
    const pic = await pagePicture(p);
    await getProxy(p);
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

// The panel opens just under the toolbars (they wrap onto more rows on narrower screens).
function showFind(show = true) {
  $('findpanel').hidden = !show;
  if (!show) return;
  if (window.innerWidth > 700) $('findpanel').style.top = `${Math.round(viewer.getBoundingClientRect().top) + 8}px`;
  $('find-text').focus();
}
$('btn-find').addEventListener('click', () => showFind($('findpanel').hidden));
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
  const n = currentCount();
  const pages = new Set(S.edits.filter((e) => S.order.includes(e.page)).map((e) => e.page)).size;
  $('save-summary').textContent = n
    ? `${n} change${n > 1 ? 's' : ''}${pages ? ` on ${pages} page${pages > 1 ? 's' : ''}` : ''}. A new file is made; “${S.name}” is not changed.`
    : 'You have not made any changes yet. Saving makes an identical copy.';
  $('save-name').value = suggestedName();
  $('save-cover-box').hidden = !S.edits.some((e) => hasCover(e) && S.order.includes(e.page));
  $('save-erase').checked = false;
  const warn = [];
  const imageOnly = imageOnlyRetry || (S.info && !S.info.ok);
  if (imageOnly) warn.push('This file is protected or unusual, so the copy will be saved as pictures of the pages. Its text will not be selectable.');
  if (S.info && S.info.signed) warn.push('This PDF is digitally signed. Any change makes the signature invalid.');
  const unsetLinks = S.edits.filter((e) => e.type === 'link' && S.order.includes(e.page) && !parseLinkTarget(e.url)).length;
  if (unsetLinks) warn.push(`${unsetLinks} link${unsetLinks > 1 ? 's have' : ' has'} no web address or page number yet and will be left out.`);
  $('save-warn').textContent = warn.join(' ');
  $('save-warn').hidden = !warn.length;
  $('save-result').textContent = '';
  $('save-progress').hidden = true;
  $('btn-save-go').disabled = false;
  $('btn-save-go').textContent = imageOnlyRetry ? 'Try saving as pictures' : 'Save a copy';
  $('save-dialog').showModal();
}

// Form values must be known for every page before saving (fields can repeat on pages not yet shown).
async function loadAllWidgets() {
  if (!Object.keys(S.forms).length) return;
  for (const id of S.order) { const p = S.pages[id]; if (!p.widgets) await loadWidgets(p); }
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
    await loadAllWidgets();
    const { bytes, notes } = await buildEditedPdf({
      originalBytes: S.bytes, pdfjsDoc: S.pdf, numPages: S.pdf.numPages, viewports: S.pages.map((p) => p.vp),
      layout: S.order.map((id) => ({ id, src: S.pages[id].src, rot: S.rot[id] || 0, w: S.pages[id].w, h: S.pages[id].h })),
      edits: S.edits, forms: S.forms, assets: S.assets, images, erase: $('save-erase').checked, imageOnly,
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
    if (notes.badLinks) extra.push(`${notes.badLinks} link${notes.badLinks > 1 ? 's were' : ' was'} left out (no valid web address or page number).`);
    if (notes.formProblems) extra.push(`${notes.formProblems} form field${notes.formProblems > 1 ? 's' : ''} could not be filled in this file.`);
    $('save-result').textContent = `Saved “${name}” (${(bytes.length / 1024 / 1024).toFixed(2)} MB). Checked: the new file opens and has all ${S.order.length} pages. ${extra.join(' ')}`;
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
const TOOL_HELP = {
  edit: 'Click any text on a page to change it, or click a form field to fill it in.',
  add: 'Click on a page where the new text should go.',
  cover: 'Drag over an area to cover it.',
  mark: 'Drag over text to mark it, or click a line of text.',
  shape: 'Drag on a page to draw the shape.',
  draw: 'Draw on the page with your mouse, finger or pen.',
  link: 'Drag over the area that should become a link.',
};
function setTool(t) {
  finishEditing();
  S.tool = t;
  document.body.classList.remove(...Object.keys(TOOL_HELP).map((k) => `tool-${k}`));
  document.body.classList.add(`tool-${t}`);
  for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  msg(TOOL_HELP[t]);
}
for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => setTool(b.dataset.tool));
$('sel-mark').addEventListener('change', (ev) => { S.markKind = ev.target.value; setTool('mark'); });
$('sel-shape').addEventListener('change', (ev) => { S.shapeKind = ev.target.value; setTool('shape'); });

function setEnabled(on) {
  for (const id of ['btn-find', 'btn-compare', 'btn-save', 'btn-image', 'btn-sign']) $(id).disabled = !on;
}

function applyZoom(keepCenter = false) {
  const ratio = keepCenter && viewer.scrollHeight ? (viewer.scrollTop + viewer.clientHeight / 2) / viewer.scrollHeight : 0;
  for (const p of S.pages) {
    const w = p.w * S.zoom; const h = p.h * S.zoom;
    const rot = S.rot[p.i] || 0;
    const turned = rot % 180 !== 0;
    p.el.style.width = `${w}px`;
    p.el.style.height = `${h}px`;
    p.el.style.transform = `translate(-50%, -50%)${rot ? ` rotate(${rot}deg)` : ''}`;
    p.wrap.style.width = `${turned ? h : w}px`;
    p.wrap.style.height = `${turned ? w : h}px`;
    p.head.style.width = `${turned ? h : w}px`;
  }
  $('zoom-label').textContent = `${Math.round(S.zoom * 100)}%`;
  if (keepCenter) viewer.scrollTop = ratio * viewer.scrollHeight - viewer.clientHeight / 2;
  for (const p of S.pages) {
    if (!p.renderedAt) continue;
    const ta = p.editsEl.querySelector('.edit-area');
    if (ta) ta._place();
    if (p.visible) renderPage(p);
    renderForms(p);
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
    if (!S.order.length) return;
    const mid = viewer.scrollTop + viewer.clientHeight / 3;
    let lo = 0; let hi = S.order.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; const p = S.pages[S.order[m]]; if (p.wrap.offsetTop + p.wrap.offsetHeight < mid) lo = m + 1; else hi = m; }
    S.current = S.order[lo];
    if (document.activeElement !== $('page-input')) $('page-input').value = lo + 1;
  });
});
$('page-input').addEventListener('change', (ev) => {
  const n = clamp(parseInt(ev.target.value, 10) || 1, 1, S.order.length);
  S.pages[S.order[n - 1]]?.head.scrollIntoView({ block: 'start' });
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
  if (document.querySelector('dialog[open]')) return;
  if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); openSaveDialog(); return; }
  if (mod && ev.key.toLowerCase() === 'o') { ev.preventDefault(); pickFile(); return; }
  if (mod && ev.key.toLowerCase() === 'f' && S.pdf) { ev.preventDefault(); showFind(); return; }
  if (typing) return;
  if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
  if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.sel) { ev.preventDefault(); deleteSelected(); return; }
  if (ev.key === 'Escape') select(null);
});

window.addEventListener('beforeunload', (ev) => { if (S.dirty && currentCount()) ev.preventDefault(); });

// ---------- start ----------
async function start() {
  setTool('edit');
  msg('');
  scanDeviceFonts();
  restoreCustomFonts();
  try {
    const [file, work] = await Promise.all([store.loadFile(), store.loadWork()]);
    const n = work ? countChanges(work) : 0;
    if (file && work && n && work.name === file.name) {
      const when = new Date(work.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      $('restore-text').textContent = `You were editing “${file.name}” (${n} change${n > 1 ? 's' : ''}, ${when}). Your work was kept in this browser.`;
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
