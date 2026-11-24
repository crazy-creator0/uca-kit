// Private PDF Editor — runs entirely in this browser. No network requests are made with the user's file.
import * as pdfjs from '../vendor/pdf.min.mjs';
import { layoutText, textToCanvas, fontString } from './textdraw.js';
import {
  fontState, scanDeviceFonts, guessFont, addFontFile, restoreCustomFonts, canListAllFonts, listAllLocalFonts,
} from './fonts.js';
import * as store from './store.js';
import { buildEditedPdf, inspect, hasCover, flatViewport } from './export.js';
import { bounds, toSvg, linkTarget, NOTE_SIZE } from './objects.js';
import { imageFileToAsset, makeAsset, askSignature } from './sign.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const viewer = $('viewer');
const pagesEl = $('pages');
const MAX_RENDERED = 14;
const MAX_CANVAS_PIXELS = 16e6;
const AM = pdfjs.AnnotationMode;

const S = {
  name: '', bytes: null, pdf: null, pages: [], edits: [], undo: [], redo: [],
  order: [], rot: {}, assets: new Map(), attachments: [], forms: {}, fieldObjects: null, existingAttachments: null,
  tool: 'edit', zoom: 1, sel: null, editing: null, editBefore: null, info: null,
  dirty: false, current: 0, style: { family: null, size: 12, bold: false, italic: false, color: '#000000' },
  draw: { color: '#d92d20', fill: null, lw: 2 },
  marks: { highlight: '#ffe14d', strike: '#d92d20', underline: '#1a56db' },
  clipboard: null,
};
window.__editor = S; // for automated tests and troubleshooting in the browser console
S.refresh = () => rerenderAll();

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (v, total) => `${(v / total) * 100}%`;
const shown = () => S.order.map((id) => S.pages[id]);
const posOf = (id) => S.order.indexOf(id);

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
  if (S.pdf && S.dirty && (S.edits.length || Object.keys(S.forms).length) && !work
    && !confirm('Open another file? Your changes to the current file are kept in this browser only until you open a new one.')) return;
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
  S.attachments = work?.attachments || [];
  S.forms = {};
  $('empty').hidden = true;

  const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
  const fit = (viewer.clientWidth - 40) / first.width;
  S.zoom = clamp(Math.round(fit * 20) / 20, 0.3, 1.5);
  for (let i = 0; i < pdf.numPages; i++) {
    if (i % 25 === 0) msg(`Reading pages… ${i + 1} of ${pdf.numPages}`);
    const vp = (await pdf.getPage(i + 1)).getViewport({ scale: 1 });
    addPageShell(i, vp);
  }
  for (const b of work?.blanks || []) {
    while (S.pages.length < b.i) addPageShell(S.pages.length, blankViewport(b.w, b.h), true);
    addPageShell(b.i, blankViewport(b.w, b.h), true);
  }
  S.order = work?.order ? work.order.filter((id) => S.pages[id]) : [...Array(pdf.numPages).keys()];
  if (!S.order.length) S.order = [...Array(pdf.numPages).keys()];
  S.rot = work?.rot || {};
  for (const [id, a] of work?.assets || []) {
    try { S.assets.set(id, await makeAsset(a.kind, a.bytes)); } catch { /* broken picture: skipped */ }
  }
  try { S.fieldObjects = await pdf.getFieldObjects(); } catch { S.fieldObjects = null; }
  for (const [id, v] of Object.entries(work?.forms || {})) setForm(id, v, true);

  hideStylebar();
  applyLayout();
  setEnabled(true);
  updateStatus();
  const hasForm = S.fieldObjects && Object.keys(S.fieldObjects).length;
  msg(`Opened “${name}”, ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}.${hasForm ? ' This PDF has a form: click its boxes to fill them in.' : ''}`);
  if (!work) {
    store.saveFile(name, bytes).then(() => saveWorkSoon()).catch(() => msg('Could not keep a backup in this browser (storage full or blocked). Editing still works.'));
  }
  inspect(bytes).then((info) => {
    S.info = info;
    if (!info.ok) msg(info.encrypted ? 'This PDF is protected. You can edit it; the copy will be saved as pictures of the pages.' : 'This PDF is unusual. You can edit it; the copy may need to be saved as pictures of the pages.');
    else if (info.signed) msg('Note: this PDF is digitally signed. Saving any change makes the signature invalid.');
  });
}

function blankViewport(w, h) {
  return { ...flatViewport(w, h), transform: [1, 0, 0, -1, 0, h], rotation: 0 };
}

function closeDoc() {
  if (S.task) S.task.destroy();
  S.task = null; S.pdf = null; S.pages = []; S.order = []; S.rot = {};
  for (const a of S.assets.values()) { URL.revokeObjectURL(a.url); a.bitmap?.close?.(); }
  S.assets = new Map(); S.attachments = []; S.forms = {}; S.fieldObjects = null; S.existingAttachments = null;
  pagesEl.textContent = '';
  observer.disconnect();
  hideStylebar();
}

function pageButton(label, title, fn) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title);
  b.addEventListener('click', fn);
  return b;
}

function addPageShell(i, vp, blank = false) {
  const head = document.createElement('div');
  head.className = 'pagehead';
  const label = document.createElement('span');
  label.className = 'pagelabel';
  const actions = {
    left: pageButton('⟲', 'Turn page left', () => rotatePage(i, -90)),
    right: pageButton('⟳', 'Turn page right', () => rotatePage(i, 90)),
    up: pageButton('↑', 'Move page up', () => movePage(i, -1)),
    down: pageButton('↓', 'Move page down', () => movePage(i, 1)),
    blank: pageButton('+ Page', 'Add a blank page after this one', () => addBlankAfter(i)),
    del: pageButton('Delete', 'Delete this page', () => deletePage(i)),
  };
  actions.del.classList.add('danger');
  head.append(label, ...Object.values(actions));
  const box = document.createElement('div');
  box.className = 'pagebox';
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
  box.append(el);
  const p = {
    i, vp, w: vp.width, h: vp.height, el, box, head, label, actions, runsEl, formsEl, editsEl, loading, canvas: null,
    renderedAt: 0, rendering: false, stale: false, runs: blank ? [] : null, proxy: null, visible: false, blank, annots: null,
  };
  S.pages[i] = p;
  observer.observe(el);
  return p;
}

// Puts the pages on screen in the chosen order, with their turn.
function applyLayout() {
  const frag = document.createDocumentFragment();
  S.order.forEach((id, k) => {
    const p = S.pages[id];
    p.label.textContent = `Page ${k + 1}`;
    p.actions.up.disabled = k === 0;
    p.actions.down.disabled = k === S.order.length - 1;
    p.actions.del.disabled = S.order.length === 1;
    frag.append(p.head, p.box);
  });
  pagesEl.textContent = '';
  pagesEl.append(frag);
  $('page-count').textContent = `of ${S.order.length}`;
  $('page-input').max = S.order.length;
  applyZoom();
}

function pageOps() { finishEditing(); select(null); }

function rotatePage(id, delta) {
  pageOps();
  pushHistory();
  S.rot = { ...S.rot, [id]: (((S.rot[id] || 0) + delta) % 360 + 360) % 360 };
  applyLayout(); changed();
}
function movePage(id, dir) {
  pageOps();
  const k = posOf(id); const j = k + dir;
  if (k < 0 || j < 0 || j >= S.order.length) return;
  pushHistory();
  const order = [...S.order];
  [order[k], order[j]] = [order[j], order[k]];
  S.order = order;
  applyLayout(); changed();
  S.pages[id].head.scrollIntoView({ block: 'nearest' });
}
function deletePage(id) {
  pageOps();
  if (S.order.length < 2) return;
  pushHistory();
  S.order = S.order.filter((x) => x !== id);
  applyLayout(); changed();
  msg('Page deleted. Use Undo to bring it back.');
}
function addBlankAfter(id) {
  pageOps();
  const src = S.pages[id];
  const turned = (S.rot[id] || 0) % 180 !== 0;
  const w = turned ? src.h : src.w; const h = turned ? src.w : src.h;
  pushHistory();
  const p = addPageShell(S.pages.length, blankViewport(w, h), true);
  const order = [...S.order];
  order.splice(posOf(id) + 1, 0, p.i);
  S.order = order;
  applyLayout(); changed();
  p.head.scrollIntoView({ block: 'nearest' });
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

async function renderPage(p, force = false) {
  if (!S.pdf) return;
  if (p.rendering) { if (force) p.stale = true; return; }
  const scale = wantedScale(p);
  if (!force && Math.abs(p.renderedAt - scale) < 0.001) return;
  p.rendering = true; p.stale = false;
  const pdf = S.pdf;
  try {
    const canvas = document.createElement('canvas');
    canvas.className = 'render';
    if (p.blank) {
      canvas.width = Math.ceil(p.w * scale); canvas.height = Math.ceil(p.h * scale);
      const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const page = p.proxy || (p.proxy = await pdf.getPage(p.i + 1));
      const vp = page.getViewport({ scale });
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      // ENABLE_STORAGE draws form boxes with the values typed in this editor
      await page.render({ canvas, viewport: vp, annotationMode: AM.ENABLE_STORAGE }).promise;
    }
    if (S.pdf !== pdf) return;
    if (p.canvas) p.canvas.remove();
    p.canvas = canvas;
    p.el.prepend(canvas);
    p.loading.hidden = true;
    p.renderedAt = scale;
    if (!p.runs) await buildRuns(p);
    renderRuns(p);
    await renderForms(p);
    if (!S.dragging) renderEdits(p); // a drag in progress redraws this page itself when it ends
    freeFarPages();
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') { p.loading.textContent = 'This page could not be shown.'; p.loading.hidden = false; }
  } finally {
    p.rendering = false;
  }
  if (p.stale || (p.visible && Math.abs(p.renderedAt - wantedScale(p)) > 0.001)) renderPage(p, p.stale);
}

function freeFarPages() {
  const rendered = S.pages.filter((p) => p.renderedAt && !p.visible);
  if (rendered.length + S.pages.filter((p) => p.visible).length <= MAX_RENDERED) return;
  const dist = (p) => { const k = posOf(p.i); return k < 0 ? 1e9 : Math.abs(k - S.current); };
  rendered.sort((a, b) => dist(b) - dist(a));
  for (const p of rendered.slice(0, rendered.length - 4)) {
    if (S.editing && findEdit(S.editing)?.page === p.i) continue;
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
  if (p.blank) { p.runs = []; return; }
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
    const trail = x.str.length - x.str.trimEnd().length;
    const per = x.w / x.str.length;
    return {
      key: `${p.i}:${k}`, x: x.x + lead * per, y: x.base - x.asc * x.size, w: x.w - (lead + trail) * per,
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

// ---------- filling in existing form boxes ----------
function setForm(id, value, quiet = false) {
  S.forms[id] = value;
  S.pdf.annotationStorage.setValue(id, { value });
  if (!quiet) { S.dirty = true; updateStatus(); saveWorkSoon(); }
}

function formValue(a) {
  if (a.id in S.forms) return S.forms[a.id];
  if (a.checkBox) return !!a.fieldValue && a.fieldValue !== 'Off' && (a.exportValue ? a.fieldValue === a.exportValue : true);
  if (a.radioButton) return a.fieldValue === a.buttonValue;
  return a.fieldValue ?? '';
}

function redrawFormPages() {
  for (const p of S.pages) if (p.renderedAt && p.annots && p.annots.length) renderPage(p, true);
}

async function renderForms(p) {
  if (p.blank || !S.fieldObjects) return;
  if (!p.annots) {
    try {
      const all = await p.proxy.getAnnotations();
      p.annots = all.filter((a) => a.annotationType === 20 && ['Tx', 'Btn', 'Ch'].includes(a.fieldType)
        && !a.readOnly && !a.hidden && !a.pushButton && a.rect);
    } catch { p.annots = []; }
  }
  if (p.formsEl.childElementCount || !p.annots.length) return;
  for (const a of p.annots) {
    const c1 = p.vp.convertToViewportPoint(a.rect[0], a.rect[1]);
    const c2 = p.vp.convertToViewportPoint(a.rect[2], a.rect[3]);
    const x = Math.min(c1[0], c2[0]); const y = Math.min(c1[1], c2[1]);
    const w = Math.abs(c2[0] - c1[0]); const h = Math.abs(c2[1] - c1[1]);
    let el;
    if (a.fieldType === 'Tx') {
      el = document.createElement(a.multiLine ? 'textarea' : 'input');
      if (!a.multiLine) el.type = 'text';
      el.value = formValue(a);
      if (a.maxLen) el.maxLength = a.maxLen;
      const fs = a.defaultAppearanceData?.fontSize || (a.multiLine ? 10 : clamp(h * 0.65, 6, 14));
      el.style.setProperty('--fs', fs);
      el.addEventListener('input', () => setForm(a.id, el.value));
      el.addEventListener('change', () => redrawFormPages());
    } else if (a.fieldType === 'Btn') {
      el = document.createElement('input');
      el.type = a.radioButton ? 'radio' : 'checkbox';
      if (a.radioButton) el.name = `rf-${a.fieldName}`;
      el.checked = !!formValue(a);
      el.addEventListener('change', () => {
        if (a.radioButton) {
          for (const sib of S.fieldObjects[a.fieldName] || []) if (sib.id !== a.id) setForm(sib.id, false, true);
          setForm(a.id, true);
        } else setForm(a.id, el.checked);
        redrawFormPages();
      });
    } else {
      el = document.createElement('select');
      el.multiple = !!a.multiSelect;
      const v = formValue(a);
      const want = new Set(Array.isArray(v) ? v : [v]);
      for (const o of a.options || []) {
        const opt = new Option(o.displayValue ?? o.exportValue, o.exportValue);
        opt.selected = want.has(o.exportValue) || want.has(o.displayValue);
        el.append(opt);
      }
      el.addEventListener('change', () => {
        const vals = [...el.selectedOptions].map((o) => o.value);
        setForm(a.id, el.multiple ? vals : (vals[0] ?? ''));
        redrawFormPages();
      });
      el.style.setProperty('--fs', clamp(h * 0.65, 6, 14));
    }
    el.className = 'ff';
    el.title = a.alternativeText || a.fieldName || 'Form box';
    el.setAttribute('aria-label', a.alternativeText || a.fieldName || 'Form box');
    el.dataset.annot = a.id;
    Object.assign(el.style, { left: pct(x, p.w), top: pct(y, p.h), width: pct(w, p.w), height: pct(h, p.h) });
    p.formsEl.append(el);
  }
}

// ---------- changes drawn on the page ----------
function editBox(e) {
  if (e.type === 'box') return { left: e.x, top: e.y, w: e.w, h: e.h };
  const L = layoutText(e);
  return { left: L.left, top: L.top, w: Math.max(L.w, e.size * 0.6), h: L.h, L };
}

// Area that can be clicked for a change (in page points).
function hitBox(e) {
  if (e.type === 'text' || e.type === 'box') { const b = editBox(e); return { x: b.left, y: b.top, w: b.w, h: b.h }; }
  const b = bounds(e);
  if (e.type === 'shape' || e.type === 'ink' || e.type === 'mark') {
    const m = Math.max(4, (e.lw || 0) / 2 + 2);
    const w = Math.max(b.w + m * 2, 10); const h = Math.max(b.h + m * 2, 10);
    return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
  }
  return b;
}

const RESIZABLE = new Set(['box', 'image', 'ink', 'link', 'mark']);
function handlesFor(e) {
  if (e.type === 'shape') return (e.kind === 'line' || e.kind === 'arrow') ? ['p1', 'p2'] : ['se'];
  if (e.type === 'field') return e.kind === 'text' ? ['se'] : [];
  return RESIZABLE.has(e.type) ? ['se'] : [];
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
    const b = hitBox(e);
    const el = document.createElement('div');
    el.className = `edit ${e.type}`;
    el.dataset.id = e.id;
    Object.assign(el.style, { left: pct(b.x, p.w), top: pct(b.y, p.h), width: pct(b.w, p.w), height: pct(b.h, p.h) });
    if (e.type === 'box') {
      el.style.background = e.color;
      el.title = 'Cover box: drag to move';
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
      const a = S.assets.get(e.asset);
      if (a) { const img = document.createElement('img'); img.src = a.url; img.alt = ''; img.draggable = false; if ((e.opacity ?? 1) < 1) img.style.opacity = e.opacity; el.append(img); }
      el.title = 'Picture: drag to move, use the corner to resize';
    } else if (e.type === 'shape' || e.type === 'ink' || e.type === 'mark') {
      el.append(toSvg(e, b));
      el.title = 'Drag to move';
    } else if (e.type === 'link') {
      if (!linkTarget(e.target, S.order.length)) el.classList.add('bad');
      el.title = e.target ? `Link to ${e.target}` : 'Link: type where it goes in the bar above';
    } else if (e.type === 'note') {
      el.style.background = e.color || '#f6d743';
      el.title = e.text || 'Note: type the note in the bar above';
    } else if (e.type === 'field') {
      el.textContent = e.kind === 'check' ? '' : e.name;
      el.title = `Form ${e.kind === 'check' ? 'tick box' : 'text field'} “${e.name}”`;
    }
    if (S.sel === e.id) el.classList.add('sel');
    layer.append(el);
    addTick(layer, p, b);
    if (S.sel === e.id) addHandles(layer, p, e);
  }
}

function addHandles(layer, p, e) {
  for (const kind of handlesFor(e)) {
    let x; let y;
    if (kind === 'se') { const b = bounds(e); x = b.x + b.w; y = b.y + b.h; }
    if (kind === 'p1') { x = e.x; y = e.y; }
    if (kind === 'p2') { x = e.x + e.w; y = e.y + e.h; }
    const h = document.createElement('div');
    h.className = `handle ${kind === 'se' ? 'se' : 'pt'}`;
    h.dataset.handle = kind;
    h.dataset.id = e.id;
    h.title = kind === 'se' ? 'Drag to resize' : 'Drag to move this end';
    Object.assign(h.style, { left: pct(x, p.w), top: pct(y, p.h) });
    layer.append(h);
  }
}

function addTick(layer, p, b) {
  const t = document.createElement('div');
  t.className = 'tick';
  const top = b.top ?? b.y;
  Object.assign(t.style, { top: pct(top, p.h), height: pct(Math.max(b.h, 6), p.h) });
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
function snapshot() { return JSON.stringify({ edits: S.edits, order: S.order, rot: S.rot }); }
function restoreSnapshot(json) {
  const s = JSON.parse(json);
  S.edits = s.edits;
  const layoutChanged = JSON.stringify(s.order) !== JSON.stringify(S.order) || JSON.stringify(s.rot) !== JSON.stringify(S.rot);
  S.order = s.order; S.rot = s.rot;
  if (layoutChanged) applyLayout();
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

function pageLayoutChanges() {
  if (!S.pdf) return 0;
  const n = S.pdf.numPages;
  let c = Object.values(S.rot).filter((r) => r % 360).length;
  if (S.order.length !== n || S.order.some((id, k) => id !== k)) c++;
  return c;
}

function updateStatus() {
  const live = S.edits.filter((e) => S.order.includes(e.page));
  const n = live.length;
  const pages = new Set(live.map((e) => e.page)).size;
  const parts = [];
  if (n) parts.push(`${n} change${n > 1 ? 's' : ''} on ${pages} page${pages > 1 ? 's' : ''}`);
  const f = Object.keys(S.forms).length;
  if (f) parts.push(`${f} form box${f > 1 ? 'es' : ''} filled`);
  if (pageLayoutChanges()) parts.push('pages rearranged');
  $('st-changes').textContent = parts.length ? parts.join(' · ') : 'No changes';
  $('btn-undo').disabled = !S.undo.length;
  $('btn-redo').disabled = !S.redo.length;
}

let saveTimer = null;
function saveWorkSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!S.bytes) return;
    try {
      const blanks = S.pages.filter((p) => p.blank).map((p) => ({ i: p.i, w: p.w, h: p.h }));
      const assets = [...S.assets].map(([id, a]) => [id, { kind: a.kind, bytes: a.bytes }]);
      await store.saveWork({
        name: S.name, size: S.bytes.length, edits: S.edits, order: S.order, rot: S.rot, blanks, assets,
        forms: S.forms, attachments: S.attachments, layoutChanged: pageLayoutChanges() > 0, at: Date.now(),
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
  if (p.canvas && p.renderedAt) return { canvas: p.canvas, scale: p.renderedAt, temp: false };
  const scale = Math.min(1.5, Math.sqrt(4e6 / (p.w * p.h)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(p.w * scale); canvas.height = Math.ceil(p.h * scale);
  if (p.blank) {
    const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    return { canvas, scale, temp: true };
  }
  const page = p.proxy || (p.proxy = await S.pdf.getPage(p.i + 1));
  const vp = page.getViewport({ scale });
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, viewport: vp, annotationMode: AM.ENABLE_STORAGE }).promise;
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
    S.style = { ...S.style, family: e.family, size: Math.round(e.size * 2) / 2, bold: e.bold, italic: e.italic, color: e.color };
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
  const prev = S.sel && findEdit(S.sel);
  S.sel = id;
  const e = id && findEdit(id);
  if (prev && prev !== e && pageOf(prev)?.renderedAt) renderEdits(pageOf(prev));
  if (e && pageOf(e).renderedAt) renderEdits(pageOf(e));
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

function addObject(p, list, before = snapshot()) {
  const arr = Array.isArray(list) ? list : [list];
  if (!arr.length) return;
  pushHistory(before);
  S.edits.push(...arr);
  renderEdits(p);
  select(arr[arr.length - 1].id);
  changed();
}

// ---------- pointer handling on pages ----------
// Converts a pointer position to page points, allowing for a page turned in this editor.
function pagePoint(p, ev) {
  const r = p.box.getBoundingClientRect();
  const u = (ev.clientX - r.left) / r.width; const v = (ev.clientY - r.top) / r.height;
  const rot = S.rot[p.i] || 0;
  const [a, b] = rot === 90 ? [v, 1 - u] : rot === 180 ? [1 - u, 1 - v] : rot === 270 ? [1 - v, u] : [u, v];
  return { x: a * p.w, y: b * p.h };
}

const MARK_TOOLS = new Set(['highlight', 'strike', 'underline']);
const DRAG_TOOLS = new Set(['cover', 'rect', 'ellipse', 'line', 'arrow', 'highlight', 'strike', 'underline', 'link', 'textfield']);

pagesEl.addEventListener('pointerdown', async (ev) => {
  if (ev.button !== 0 || document.body.classList.contains('compare')) return;
  const pageEl = ev.target.closest('.page');
  if (!pageEl || ev.target.closest('.edit-area') || ev.target.closest('.ff')) return;
  const p = S.pages[+pageEl.dataset.page];
  const handle = ev.target.closest('.handle');
  if (handle) return resizeEdit(ev, p, findEdit(handle.dataset.id), handle.dataset.handle);
  let editEl = ev.target.closest('.edit[data-id]');
  // with a mark-up tool, existing highlights do not get in the way of marking the same words again
  if (editEl && MARK_TOOLS.has(S.tool) && findEdit(editEl.dataset.id)?.type === 'mark') editEl = null;
  if (editEl) return dragEdit(ev, p, findEdit(editEl.dataset.id));
  if (S.tool === 'edit') {
    const runEl = ev.target.closest('.run');
    if (runEl) { ev.preventDefault(); return changeRun(p, p.runs.find((r) => r.key === runEl.dataset.key)); }
    if (S.editing || S.sel) { select(null); }
    return;
  }
  if (S.editing || S.sel) select(null);
  const pt = pagePoint(p, ev);
  if (S.tool === 'add') { ev.preventDefault(); return addTextAt(p, pt.x, pt.y); }
  if (S.tool === 'note') { ev.preventDefault(); return addNote(p, pt); }
  if (S.tool === 'checkbox') { ev.preventDefault(); return addObject(p, { id: uid(), page: p.i, type: 'field', kind: 'check', x: pt.x - 7, y: pt.y - 7, w: 14, h: 14, name: nextFieldName('Tick') }); }
  if (S.tool === 'draw' || S.tool === 'marker') return drawInk(ev, p);
  if (DRAG_TOOLS.has(S.tool)) dragOut(ev, p);
});

viewer.addEventListener('pointerdown', (ev) => {
  if (!ev.target.closest('.page') && !ev.target.closest('.pagehead') && (S.editing || S.sel)) select(null);
});

function dragEdit(ev, p, e) {
  if (!e) return;
  ev.preventDefault();
  const start = pagePoint(p, ev);
  const orig = e.type === 'text' ? { x: e.x, y: e.baseline } : { x: e.x, y: e.y };
  const before = snapshot();
  const el = ev.target.closest('.edit');
  let moved = false;
  S.dragging = true;
  el.setPointerCapture(ev.pointerId);
  const move = (m) => {
    const pt = pagePoint(p, m);
    const dx = pt.x - start.x; const dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) * S.zoom < 5) return;
    if (!moved) for (const h of p.editsEl.querySelectorAll('.handle')) h.remove();
    moved = true;
    e.x = orig.x + dx;
    if (e.type === 'text') e.baseline = orig.y + dy; else e.y = orig.y + dy;
    const b = hitBox(e);
    el.style.left = pct(b.x, p.w); el.style.top = pct(b.y, p.h);
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    S.dragging = false;
    if (moved) { pushHistory(before); changed(); renderEdits(p); select(e.id); return; }
    if (e.type === 'text') startEditing(e);
    else {
      select(e.id);
      const focus = { link: 'inp-link', note: 'inp-note' }[e.type];
      if (focus && !(e.target || e.text)) $(focus).focus();
    }
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function resizeEdit(ev, p, e, kind) {
  if (!e) return;
  ev.preventDefault();
  const before = snapshot();
  const b0 = bounds(e);
  const ratio = b0.w / Math.max(b0.h, 0.01);
  const x2 = e.x + e.w; const y2 = e.y + e.h;
  p.el.setPointerCapture(ev.pointerId);
  S.dragging = true;
  let queued = false; let moved = false;
  const move = (m) => {
    const pt = pagePoint(p, m);
    moved = true;
    if (kind === 'p1') { e.x = pt.x; e.y = pt.y; e.w = x2 - pt.x; e.h = y2 - pt.y; } else if (kind === 'p2') { e.w = pt.x - e.x; e.h = pt.y - e.y; } else {
      if (e.type === 'shape' || e.type === 'ink' || e.type === 'mark' || e.type === 'link' || e.type === 'field' || e.type === 'image' || e.type === 'box') {
        e.x = b0.x; e.y = b0.y;
      }
      let w = Math.max(2, pt.x - b0.x); let h = Math.max(2, pt.y - b0.y);
      if (e.type === 'image' && !m.shiftKey) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
      e.w = w; e.h = h;
    }
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; renderEdits(p); }); }
  };
  const up = () => {
    p.el.removeEventListener('pointermove', move);
    p.el.removeEventListener('pointerup', up);
    p.el.removeEventListener('pointercancel', up);
    S.dragging = false;
    if (moved) { pushHistory(before); changed(); }
    renderEdits(p); select(e.id);
  };
  p.el.addEventListener('pointermove', move);
  p.el.addEventListener('pointerup', up);
  p.el.addEventListener('pointercancel', up);
}

// A preview drawn while dragging out a new shape or area.
function draftSvg(p) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${p.w} ${p.h}`);
  svg.setAttribute('class', 'draftsvg');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:7';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'rgba(255,255,255,.35)');
  path.setAttribute('stroke', '#0F6E5C');
  path.setAttribute('stroke-width', String(1.5 / S.zoom));
  path.setAttribute('stroke-dasharray', `${4 / S.zoom} ${3 / S.zoom}`);
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  p.el.append(svg);
  return { svg, path };
}

function dragOut(ev, p) {
  ev.preventDefault();
  const tool = S.tool;
  const a = pagePoint(p, ev);
  const { svg, path } = draftSvg(p);
  p.el.setPointerCapture(ev.pointerId);
  let c = a;
  const isLine = tool === 'line' || tool === 'arrow';
  const move = (m) => {
    c = pagePoint(p, m);
    if (isLine) { path.setAttribute('d', `M${a.x} ${a.y} L${c.x} ${c.y}`); path.setAttribute('fill', 'none'); return; }
    const x = Math.min(a.x, c.x); const y = Math.min(a.y, c.y);
    path.setAttribute('d', `M${x} ${y} H${Math.max(a.x, c.x)} V${Math.max(a.y, c.y)} H${x} Z`);
  };
  const up = async () => {
    p.el.removeEventListener('pointermove', move);
    p.el.removeEventListener('pointerup', up);
    p.el.removeEventListener('pointercancel', up);
    svg.remove();
    const b = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
    await finishDragOut(p, tool, a, c, b);
  };
  p.el.addEventListener('pointermove', move);
  p.el.addEventListener('pointerup', up);
  p.el.addEventListener('pointercancel', up);
}

async function finishDragOut(p, tool, a, c, b) {
  const big = b.w >= 2 && b.h >= 2;
  const before = snapshot();
  if (tool === 'cover') {
    if (!big) return;
    const ring = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
    const pic = await pagePicture(p);
    const color = sampleColors(pic.canvas, pic.scale, ring).bg;
    return addObject(p, { id: uid(), page: p.i, type: 'box', x: b.x, y: b.y, w: b.w, h: b.h, color }, before);
  }
  if (tool === 'rect' || tool === 'ellipse') {
    if (!big) return;
    return addObject(p, { id: uid(), page: p.i, type: 'shape', kind: tool, ...b, stroke: S.draw.color, fill: S.draw.fill, lw: S.draw.lw, opacity: 1 }, before);
  }
  if (tool === 'line' || tool === 'arrow') {
    if (Math.hypot(c.x - a.x, c.y - a.y) < 3) return;
    return addObject(p, { id: uid(), page: p.i, type: 'shape', kind: tool, x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y, stroke: S.draw.color, fill: null, lw: S.draw.lw, opacity: 1 }, before);
  }
  if (tool === 'highlight' || tool === 'strike' || tool === 'underline') {
    const marks = snapMarks(p, a, c, b).map((r) => ({ id: uid(), page: p.i, type: 'mark', kind: tool, ...r, color: S.marks[tool] }));
    return addObject(p, marks, before);
  }
  if (tool === 'link') {
    if (!big) return;
    addObject(p, { id: uid(), page: p.i, type: 'link', ...b, target: '' }, before);
    $('inp-link').focus();
    return;
  }
  if (tool === 'textfield') {
    const r = big && b.w > 8 && b.h > 6 ? b : { x: a.x, y: a.y - 9, w: 150, h: 18 };
    return addObject(p, { id: uid(), page: p.i, type: 'field', kind: 'text', ...r, name: nextFieldName('Text') }, before);
  }
}

// Highlights, strike-outs and underlines follow the lines of text under the drag, like selecting text.
function snapMarks(p, a, c, b) {
  const runs = (p.runs || []).filter((r) => {
    const top = Math.max(r.y, b.y); const bottom = Math.min(r.y + r.h, b.y + b.h);
    return bottom - top > Math.min(r.h * 0.3, 3) && Math.min(r.x + r.w, b.x + b.w) > r.x && Math.max(r.x, b.x) < r.x + r.w;
  });
  if (!runs.length) return b.w >= 2 && b.h >= 2 ? [b] : [];
  const lines = [];
  for (const r of runs.sort((m, n) => m.base - n.base || m.x - n.x)) {
    const line = lines.find((l) => Math.abs(l.base - r.base) < r.size * 0.5);
    if (line) line.runs.push(r); else lines.push({ base: r.base, runs: [r] });
  }
  const [s, e] = a.y <= c.y ? [a, c] : [c, a];
  const out = [];
  lines.forEach((line, k) => {
    let x0; let x1;
    if (lines.length === 1) { x0 = b.x; x1 = b.x + b.w; } else if (k === 0) { x0 = s.x; x1 = Infinity; } else if (k === lines.length - 1) { x0 = -Infinity; x1 = e.x; } else { x0 = -Infinity; x1 = Infinity; }
    for (const r of line.runs) {
      const l = Math.max(r.x, x0); const rr = Math.min(r.x + r.w, x1);
      if (rr - l > 1) out.push({ x: l, y: r.y, w: rr - l, h: r.h });
    }
  });
  return out;
}

function drawInk(ev, p) {
  ev.preventDefault();
  const marker = S.tool === 'marker';
  const color = marker ? S.marks.highlight : S.draw.color;
  const lw = marker ? 12 : Math.max(0.5, S.draw.lw);
  const pts = [pagePoint(p, ev)];
  const { svg, path } = draftSvg(p);
  path.setAttribute('fill', 'none'); path.removeAttribute('stroke-dasharray');
  path.setAttribute('stroke', color); path.setAttribute('stroke-width', String(lw));
  path.setAttribute('stroke-linejoin', 'round');
  if (marker) path.setAttribute('opacity', '0.4');
  p.el.setPointerCapture(ev.pointerId);
  const move = (m) => {
    for (const ce of (m.getCoalescedEvents ? m.getCoalescedEvents() : [m])) pts.push(pagePoint(p, ce));
    path.setAttribute('d', pts.map((q, k) => `${k ? 'L' : 'M'}${q.x} ${q.y}`).join(' '));
  };
  const up = () => {
    p.el.removeEventListener('pointermove', move);
    p.el.removeEventListener('pointerup', up);
    p.el.removeEventListener('pointercancel', up);
    svg.remove();
    // drop points that are too close together to matter
    const kept = [pts[0]];
    for (const q of pts.slice(1)) { const l = kept[kept.length - 1]; if (Math.hypot(q.x - l.x, q.y - l.y) > 0.4) kept.push(q); }
    const xs = kept.map((q) => q.x); const ys = kept.map((q) => q.y);
    const x = Math.min(...xs); const y = Math.min(...ys);
    const w = Math.max(0.5, Math.max(...xs) - x); const h = Math.max(0.5, Math.max(...ys) - y);
    const flat = [];
    for (const q of kept) flat.push(Math.round(((q.x - x) / w) * 1e4) / 1e4, Math.round(((q.y - y) / h) * 1e4) / 1e4);
    const e = { id: uid(), page: p.i, type: 'ink', x, y, w, h, pts: flat, stroke: color, lw, opacity: marker ? 0.4 : 1, marker };
    pushHistory();
    S.edits.push(e);
    renderEdits(p); changed();
  };
  p.el.addEventListener('pointermove', move);
  p.el.addEventListener('pointerup', up);
  p.el.addEventListener('pointercancel', up);
}

function addNote(p, pt) {
  addObject(p, { id: uid(), page: p.i, type: 'note', x: pt.x - NOTE_SIZE / 2, y: pt.y - NOTE_SIZE / 2, text: '', color: '#f6d743' });
  $('inp-note').focus();
}

function nextFieldName(base) {
  const used = new Set(S.edits.filter((e) => e.type === 'field').map((e) => e.name));
  for (const n of Object.keys(S.fieldObjects || {})) used.add(n);
  let k = 1;
  while (used.has(`${base}${k}`)) k++;
  return `${base}${k}`;
}

// The page most in view, and a point in the middle of its visible part.
function currentPageAndPoint() {
  const p = shown()[clamp(S.current, 0, S.order.length - 1)];
  const r = p.box.getBoundingClientRect(); const vr = viewer.getBoundingClientRect();
  const cy = (Math.max(r.top, vr.top) + Math.min(r.bottom, vr.bottom)) / 2;
  return { p, pt: pagePoint(p, { clientX: r.left + r.width / 2, clientY: cy }) };
}

function placeAsset(asset, frac) {
  finishEditing();
  const id = uid();
  S.assets.set(id, asset);
  const { p, pt } = currentPageAndPoint();
  let w = Math.min(p.w * frac, asset.w * 0.75);
  let h = w * (asset.h / asset.w);
  if (h > p.h * 0.6) { h = p.h * 0.6; w = h * (asset.w / asset.h); }
  addObject(p, { id: uid(), page: p.i, type: 'image', asset: id, x: pt.x - w / 2, y: pt.y - h / 2, w, h, opacity: 1 });
  msg('Drag the picture where you want it. Use the round corner handle to resize it.');
}

$('btn-image').addEventListener('click', () => $('image-file').click());
$('image-file').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f || !S.pdf) return;
  try { placeAsset(await imageFileToAsset(f), 0.4); } catch { msg(`“${f.name}” is not a picture this browser can read.`, true); }
});
$('btn-sign').addEventListener('click', async () => {
  if (!S.pdf) return;
  finishEditing();
  const asset = await askSignature();
  if (asset) placeAsset(asset, 0.25);
});
$('btn-sign-cancel').addEventListener('click', () => $('sign-dialog').close('cancel'));

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

const STYLE_CONTROLS = ['sel-font', 'inp-size', 'btn-bold', 'btn-italic', 'inp-color', 'inp-cover', 'chk-fill', 'inp-fill', 'inp-lw',
  'inp-opacity', 'inp-link', 'inp-note', 'inp-fieldname', 'btn-allpages', 'btn-delete'];

function tagsOf(e) {
  const t = new Set([e.type]);
  if (e.type === 'text' && e.cover) t.add('textcover');
  if (e.type === 'shape' && (e.kind === 'rect' || e.kind === 'ellipse')) t.add('shape-fill');
  if (['box', 'image', 'shape', 'ink', 'link', 'mark'].includes(e.type) || (e.type === 'text' && !e.source)) t.add('copyable');
  return t;
}
function showControls(tags) {
  for (const el of $('stylebar').querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').some((x) => tags.has(x));
}

function showStylebar(e) {
  $('stylebar').hidden = false;
  $('style-hint').hidden = true;
  for (const id of STYLE_CONTROLS) $(id).disabled = false;
  showControls(tagsOf(e));
  $('inp-cover').value = e.type === 'box' ? e.color : e.cover ? e.cover.color : '#ffffff';
  if (e.type === 'text') {
    fillFontSelect(e.family);
    $('inp-size').value = Math.round(e.size * 10) / 10;
    $('btn-bold').setAttribute('aria-pressed', String(!!e.bold));
    $('btn-italic').setAttribute('aria-pressed', String(!!e.italic));
    $('inp-color').value = e.color;
  } else if (e.type === 'shape' || e.type === 'ink') {
    $('inp-color').value = e.stroke;
    $('inp-lw').value = e.lw;
    $('chk-fill').checked = !!e.fill;
    $('inp-fill').value = e.fill || '#ffe14d';
  } else if (e.type === 'mark' || e.type === 'note') {
    $('inp-color').value = e.color || '#f6d743';
  }
  $('inp-opacity').value = Math.round((e.opacity ?? 1) * 100);
  if (e.type === 'link') $('inp-link').value = e.target || '';
  if (e.type === 'note') $('inp-note').value = e.text || '';
  if (e.type === 'field') $('inp-fieldname').value = e.name || '';
  $('orig-font').textContent = e.origFont ? `Original font: ${e.origFont}` : '';
}
// The bar stays in place (only its controls switch off) so the pages never jump under the pointer.
function hideStylebar() {
  $('stylebar').hidden = !S.pdf;
  $('style-hint').hidden = false;
  $('orig-font').textContent = '';
  for (const id of STYLE_CONTROLS) $(id).disabled = true;
  if (!$('sel-font').options.length && fontState.device.length) fillFontSelect(S.style.family || fontState.device[0]);
  showControls(new Set(['text']));
  $('btn-allpages').hidden = true;
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
  if (e.type === 'shape' || (e.type === 'ink' && !e.marker)) S.draw = { color: e.stroke, fill: e.fill ?? S.draw.fill, lw: e.lw };
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
$('inp-color').addEventListener('change', (ev) => styleChange((x) => {
  if (x.type === 'shape' || x.type === 'ink') x.stroke = ev.target.value; else x.color = ev.target.value;
}));
$('inp-cover').addEventListener('change', (ev) => styleChange((x) => { if (x.type === 'box') x.color = ev.target.value; else if (x.cover) x.cover.color = ev.target.value; }));
const setFill = () => styleChange((x) => { if (x.type === 'shape') x.fill = $('chk-fill').checked ? $('inp-fill').value : null; });
$('chk-fill').addEventListener('change', setFill);
$('inp-fill').addEventListener('change', () => { $('chk-fill').checked = true; setFill(); });
$('inp-lw').addEventListener('change', (ev) => { const v = parseFloat(ev.target.value); if (v >= 0 && v <= 40) styleChange((x) => { if ('lw' in x) x.lw = v; }); });
$('inp-opacity').addEventListener('change', (ev) => styleChange((x) => { x.opacity = clamp(+ev.target.value / 100, 0.1, 1); }));
$('inp-link').addEventListener('change', (ev) => styleChange((x) => { if (x.type === 'link') x.target = ev.target.value.trim(); }));
$('inp-note').addEventListener('change', (ev) => styleChange((x) => { if (x.type === 'note') x.text = ev.target.value; }));
$('inp-fieldname').addEventListener('change', (ev) => styleChange((x) => { if (x.type === 'field') x.name = ev.target.value.trim() || nextFieldName(x.kind === 'check' ? 'Tick' : 'Text'); }));
for (const id of ['inp-link', 'inp-note', 'inp-fieldname']) {
  $(id).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); } });
}
$('btn-delete').addEventListener('click', deleteSelected);
$('btn-allpages').addEventListener('click', () => {
  const e = S.sel && findEdit(S.sel);
  if (!e) return;
  finishEditing();
  pushHistory();
  for (const id of S.order) {
    if (id === e.page) continue;
    S.edits.push({ ...structuredClone(e), id: uid(), page: id });
  }
  rerenderAll(); changed();
  msg(`Copied to all ${S.order.length - 1} other pages. Use Undo to take it back.`);
});
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

// ---------- copy, paste and nudging ----------
function copySelected() {
  const e = S.sel && findEdit(S.sel);
  if (!e || e.source) return false;
  finishEditing();
  S.clipboard = structuredClone(e);
  msg('Copied. Press Ctrl+V to paste it on the page in view.');
  return true;
}
function paste() {
  if (!S.clipboard || !S.pdf) return;
  const { p } = currentPageAndPoint();
  const e = { ...structuredClone(S.clipboard), id: uid(), page: p.i };
  const off = S.clipboard.page === p.i ? 10 : 0;
  e.x += off; if (e.type === 'text') e.baseline += off; else e.y += off;
  addObject(p, e);
}
function nudge(dx, dy) {
  const e = S.sel && findEdit(S.sel);
  if (!e) return;
  pushHistory();
  e.x += dx; if (e.type === 'text') e.baseline += dy; else e.y += dy;
  renderEdits(pageOf(e)); changed();
}

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
  const pages = shown();
  for (const [k, p] of pages.entries()) {
    if (!p.runs) { $('find-status').textContent = `Searching page ${k + 1} of ${pages.length}…`; await buildRuns(p); }
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
    const m = f.t.search(new RegExp(re.source, re.flags.replace('g', '')));
    const strong = document.createElement('mark');
    strong.textContent = f.t.substr(m, q.length);
    b.append(`Page ${posOf(f.p.i) + 1}: …${f.t.slice(Math.max(0, m - 25), m)}`, strong, `${f.t.slice(m + q.length, m + q.length + 25)}…`);
    b.addEventListener('click', () => { f.p.box.scrollIntoView({ block: 'center' }); flash(f.p, f.run); });
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
    $('find-status').textContent = `Replacing on page ${posOf(p.i) + 1} (${++done} of ${byPage.size})…`;
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

// ---------- attachments ----------
function downloadBytes(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type: type || 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function showAttachments() {
  if (!S.pdf) return;
  if (!S.existingAttachments) {
    try { S.existingAttachments = Object.values((await S.pdf.getAttachments()) || {}); } catch { S.existingAttachments = []; }
  }
  const list = $('attach-list');
  list.textContent = '';
  const row = (name, note, btnLabel, fn) => {
    const li = document.createElement('li');
    const s = document.createElement('span'); s.textContent = name; s.title = name;
    const h = document.createElement('small'); h.className = 'hint'; h.textContent = note;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = btnLabel;
    b.addEventListener('click', fn);
    li.append(s, h, b);
    list.append(li);
  };
  for (const a of S.existingAttachments) row(a.filename, 'in the file', 'Download', () => downloadBytes(a.content, a.filename));
  S.attachments.forEach((a, k) => row(a.name, `added, ${Math.max(1, Math.round(a.bytes.length / 1024))} KB`, 'Remove', () => {
    S.attachments.splice(k, 1); changed(); showAttachments();
  }));
  if (!list.childElementCount) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = 'No files are attached.'; list.append(li); }
  if (!$('attach-dialog').open) $('attach-dialog').showModal();
}
$('btn-attach').addEventListener('click', showAttachments);
$('btn-attach-add').addEventListener('click', () => $('attach-file').click());
$('attach-file').addEventListener('change', async (ev) => {
  for (const f of [...ev.target.files]) S.attachments.push({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  ev.target.value = '';
  changed();
  showAttachments();
});

// ---------- saving ----------
function suggestedName() {
  const base = S.name.replace(/\.pdf$/i, '');
  return `${base} (edited).pdf`;
}

let imageOnlyRetry = false;
function openSaveDialog() {
  finishEditing();
  if (!S.pdf) return;
  const live = S.edits.filter((e) => S.order.includes(e.page));
  const pages = new Set(live.map((e) => e.page)).size;
  const what = [];
  if (live.length) what.push(`${live.length} change${live.length > 1 ? 's' : ''} on ${pages} page${pages > 1 ? 's' : ''}`);
  const f = Object.keys(S.forms).length;
  if (f) what.push(`${f} form box${f > 1 ? 'es' : ''} filled`);
  if (pageLayoutChanges()) what.push(`pages turned, moved, added or deleted (${S.order.length} pages)`);
  if (S.attachments.length) what.push(`${S.attachments.length} file${S.attachments.length > 1 ? 's' : ''} attached`);
  $('save-summary').textContent = what.length
    ? `${what.join(', ')}. A new file is made; “${S.name}” is not changed.`
    : 'You have not made any changes yet. Saving makes an identical copy.';
  $('save-name').value = suggestedName();
  $('save-cover-box').hidden = !live.some(hasCover);
  $('save-erase').checked = false;
  const warn = [];
  const imageOnly = imageOnlyRetry || (S.info && !S.info.ok);
  if (imageOnly) warn.push('This file is protected or unusual, so the copy will be saved as pictures of the pages. Its text will not be selectable.');
  if (S.info && S.info.signed) warn.push('This PDF is digitally signed. Any change makes the signature invalid.');
  const bad = live.filter((e) => e.type === 'link' && !linkTarget(e.target, S.order.length)).length;
  if (bad) warn.push(`${bad} link${bad > 1 ? 's have' : ' has'} no valid address and will be left out.`);
  if (S.order.length < S.pdf.numPages) warn.push('Deleted pages are removed from the copy. Bookmarks that pointed to them will no longer work.');
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
    let baseBytes = null;
    if (!imageOnly && Object.keys(S.forms).length) {
      $('save-result').textContent = 'Filling in the form';
      baseBytes = await S.pdf.saveDocument();
    }
    const { bytes, notes } = await buildEditedPdf({
      originalBytes: S.bytes, baseBytes, pdfjsDoc: S.pdf, numPages: S.pdf.numPages, pages: S.pages,
      order: S.order, rot: S.rot, edits: S.edits, assets: S.assets, attachments: S.attachments,
      erase: $('save-erase').checked, imageOnly,
      onProgress: (f, text) => { $('save-bar').style.width = `${Math.round(f * 100)}%`; $('save-result').textContent = text; },
    });
    downloadBytes(bytes, name, 'application/pdf');
    S.dirty = false;
    const extra = [];
    if (notes.picturePages.length && !imageOnly) extra.push(`Page${notes.picturePages.length > 1 ? 's' : ''} ${notes.picturePages.map((i) => i + 1).join(', ')} saved as pictures, so the covered text is gone.`);
    if (notes.unsearchable) extra.push('Some new words use letters that cannot be made searchable; they look right but cannot be searched.');
    if (notes.badLinks) extra.push(`${notes.badLinks} link${notes.badLinks > 1 ? 's' : ''} without a valid address left out.`);
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
const TOOL_HINTS = {
  edit: 'Click any text on a page to change it, or click a form box to fill it in.',
  add: 'Click on a page where the new text should go.',
  cover: 'Drag over an area to cover it.',
  highlight: 'Drag over text to highlight it.',
  strike: 'Drag over text to strike it out.',
  underline: 'Drag over text to underline it.',
  draw: 'Draw on the page with your mouse, finger or pen.',
  marker: 'Draw over the page with a see-through marker.',
  note: 'Click where the note should go.',
  rect: 'Drag to draw a rectangle.',
  ellipse: 'Drag to draw an ellipse.',
  line: 'Drag to draw a line.',
  arrow: 'Drag to draw an arrow.',
  link: 'Drag over the area that should be clickable.',
  textfield: 'Drag to make a box people can type in.',
  checkbox: 'Click where the tick box should go.',
};
function setTool(t) {
  finishEditing();
  S.tool = t;
  document.body.className = document.body.className.replace(/\btool-\S+/g, '').trim();
  document.body.classList.add(`tool-${t}`);
  for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  msg(TOOL_HINTS[t] || '');
}
for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => setTool(b.dataset.tool));

function setEnabled(on) {
  for (const id of ['btn-find', 'btn-compare', 'btn-save', 'btn-attach', 'btn-image', 'btn-sign']) $(id).disabled = !on;
}

function applyZoom(keepCenter = false) {
  const ratio = keepCenter && viewer.scrollHeight ? (viewer.scrollTop + viewer.clientHeight / 2) / viewer.scrollHeight : 0;
  pagesEl.style.setProperty('--z', S.zoom);
  for (const p of S.pages) {
    const r = S.rot[p.i] || 0;
    const turned = r % 180 !== 0;
    const bw = (turned ? p.h : p.w) * S.zoom; const bh = (turned ? p.w : p.h) * S.zoom;
    p.box.style.width = `${bw}px`;
    p.box.style.height = `${bh}px`;
    p.el.style.width = `${p.w * S.zoom}px`;
    p.el.style.height = `${p.h * S.zoom}px`;
    p.el.style.transform = `translate(-50%, -50%)${r ? ` rotate(${r}deg)` : ''}`;
    p.head.style.width = `${Math.max(bw, 320)}px`;
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
// Ctrl + mouse wheel (or trackpad pinch) zooms the pages, not the whole window.
viewer.addEventListener('wheel', (ev) => {
  if (!(ev.ctrlKey || ev.metaKey) || !S.pdf) return;
  ev.preventDefault();
  zoomBy(ev.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

let scrollQueued = false;
viewer.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const list = shown();
    if (!list.length) return;
    const mid = viewer.scrollTop + viewer.clientHeight / 3;
    let lo = 0; let hi = list.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; const p = list[m]; if (p.box.offsetTop + p.box.offsetHeight < mid) lo = m + 1; else hi = m; }
    S.current = lo;
    if (document.activeElement !== $('page-input')) $('page-input').value = lo + 1;
  });
});
$('page-input').addEventListener('change', (ev) => {
  const n = clamp(parseInt(ev.target.value, 10) || 1, 1, S.order.length);
  shown()[n - 1]?.head.scrollIntoView({ block: 'start' });
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
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    if (/^image\//.test(file.type) && S.pdf) {
      try { placeAsset(await imageFileToAsset(file), 0.4); } catch { msg('That picture could not be read.', true); }
      return;
    }
    msg('That is not a PDF file.', true);
    return;
  }
  imageOnlyRetry = false;
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
  if (mod && ev.key.toLowerCase() === 'f' && S.pdf) { ev.preventDefault(); $('findpanel').hidden = false; $('find-text').focus(); return; }
  if (typing) return;
  if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
  if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
  if (mod && ev.key.toLowerCase() === 'c') { if (copySelected()) ev.preventDefault(); return; }
  if (mod && ev.key.toLowerCase() === 'v') { if (S.clipboard) { ev.preventDefault(); paste(); } return; }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.sel) { ev.preventDefault(); deleteSelected(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[ev.key] && S.sel) { ev.preventDefault(); const k = ev.shiftKey ? 10 : 1; nudge(arrows[ev.key][0] * k, arrows[ev.key][1] * k); return; }
  if (ev.key === 'Escape') select(null);
});

window.addEventListener('beforeunload', (ev) => { if (S.dirty && (S.edits.length || Object.keys(S.forms).length)) ev.preventDefault(); });

// ---------- start ----------
async function start() {
  setTool('edit');
  msg('');
  scanDeviceFonts();
  restoreCustomFonts();
  try {
    const [file, work] = await Promise.all([store.loadFile(), store.loadWork()]);
    const amount = work ? (work.edits?.length || 0) + Object.keys(work.forms || {}).length : 0;
    const layout = !!work?.layoutChanged;
    if (file && work && (amount || layout || work.attachments?.length) && work.name === file.name) {
      const when = new Date(work.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const what = [amount ? `${amount} change${amount !== 1 ? 's' : ''}` : '', layout ? 'pages rearranged' : ''].filter(Boolean).join(', ') || 'files attached';
      $('restore-text').textContent = `You were editing “${file.name}” (${what}, ${when}). Your work was kept in this browser.`;
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
