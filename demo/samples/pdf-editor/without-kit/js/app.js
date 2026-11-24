// Private PDF Editor — main application. Runs fully in the browser.
import * as pdfjsLib from '../vendor/pdf.min.mjs';
import { buildPdf, NeedsImageMode, pageHasCovers } from './save.js';
import { layoutText, renderObject, ensureFont, measure, drawPageObjects, canvasToBytes, isRtl } from './draw.js';
import {
  initFonts, fontGroups, addFontFiles, canListDeviceFonts, listDeviceFonts, guessFont, fontString, rememberFont,
  userFontNames, removeUserFont, isFontAvailable,
} from './fonts.js';
import { kvGet, kvSet, kvDel } from './store.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

// ---------------------------------------------------------------- state
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let idCounter = Date.now() % 100000;
const uid = () => 'o' + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6);
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

const S = {
  docs: [],           // [{bytes, pdf, numPages, name}]  bytes are the untouched original file
  pages: [],          // [{uid, docId, src, baseW, baseH, origRotate, rot, objects: []}]
  assets: {},         // id -> {mime, bytes, bitmap, w, h}
  name: '',
  scale: 1,
  fitMode: true,
  tool: 'edit',
  sel: null,          // {uid, id}
  undo: [], redo: [],
  unsaved: false,
  lastInk: null,
  defaults: {
    text: { font: 'sans-serif', size: 12, color: '#000000', bold: false, italic: false },
    whiteout: { fill: '#ffffff' },
    highlight: { fill: '#fde047', opacity: 0.4 },
    rect: { stroke: '#e11d48', strokeWidth: 2 },
    draw: { color: '#1d4ed8', width: 2 },
    mark: { symbol: '✓', size: 16, color: '#000000' },
  },
};
const slots = new Map();       // uid -> slot record
let pageIndex = new Map();     // uid -> page
const pdfPageCache = new Map();
const linesCache = new Map();  // "docId:src" -> lines

const pagesEl = $('#pages'), viewer = $('#viewer');

function getPdfPage(docId, src) {
  const key = docId + ':' + src;
  if (!pdfPageCache.has(key)) pdfPageCache.set(key, S.docs[docId].pdf.getPage(src + 1));
  return pdfPageCache.get(key);
}
const pageOf = u => pageIndex.get(u);
const findObj = (p, id) => p.objects.find(o => o.id === id);

// ---------------------------------------------------------------- small UI helpers
let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function showModal(html, onReady) {
  $('#modalBody').innerHTML = html; $('#modal').hidden = false;
  if (onReady) onReady($('#modalBody'));
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal' && !$('#modal').dataset.locked) closeModal(); });
function ask(title, text, buttons) {
  return new Promise(resolve => {
    showModal(`<h2>${esc(title)}</h2><div>${text}</div><div class="actions">${buttons.map((b, i) =>
      `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`, body => {
      body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { closeModal(); resolve(buttons[+b.dataset.i].value); });
    });
  });
}

// ---------------------------------------------------------------- undo / redo / autosave
const snap = () => JSON.stringify(S.pages);
function commitFrom(before) {
  if (before === snap()) return false;
  S.undo.push(before);
  if (S.undo.length > 500) S.undo.shift();
  S.redo = [];
  changed();
  return true;
}
function changed() {
  S.unsaved = true;
  updateButtons();
  scheduleAutosave();
}
function undo() {
  closeEditor();
  if (!S.undo.length) return;
  S.redo.push(snap()); S.pages = JSON.parse(S.undo.pop()); S.sel = null;
  layout(); changed();
}
function redo() {
  closeEditor();
  if (!S.redo.length) return;
  S.undo.push(snap()); S.pages = JSON.parse(S.redo.pop()); S.sel = null;
  layout(); changed();
}
function updateButtons() {
  $('#btnUndo').disabled = !S.undo.length;
  $('#btnRedo').disabled = !S.redo.length;
  const has = S.pages.length > 0;
  document.querySelectorAll('.needs-doc').forEach(b => { b.disabled = !has; });
}

let autosaveTimer;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, 1500);
}
async function autosave() {
  if (!S.docs.length) return;
  try {
    const assets = {};
    for (const [id, a] of Object.entries(S.assets)) assets[id] = { mime: a.mime, bytes: a.bytes, w: a.w, h: a.h };
    await kvSet('session', {
      v: 1, name: S.name, savedAt: Date.now(),
      docs: S.docs.map(d => ({ bytes: d.bytes, name: d.name })),
      pages: S.pages, assets, undo: S.undo.slice(-50),
    });
  } catch (e) { console.warn('Autosave failed', e); }
}

// ---------------------------------------------------------------- opening files
async function loadPdfjs(bytes, label) {
  // pdf.js takes ownership of the buffer it is given, so it always gets a copy: the original stays untouched.
  const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false });
  task.onPassword = (update, reason) => {
    showModal(`<h2>This PDF is locked</h2>
      <p>${reason === 2 ? '<span class="err">That password was not right. Try again.</span>' : `Type the password for <b>${esc(label)}</b>.`}</p>
      <form id="pwForm"><input type="password" id="pw" autocomplete="off"></form>
      <div class="actions"><button class="btn" id="pwCancel">Cancel</button><button class="btn primary" id="pwOk">Open</button></div>`, body => {
      const go = e => { e && e.preventDefault(); const v = body.querySelector('#pw').value; closeModal(); update(v); };
      body.querySelector('#pwForm').onsubmit = go;
      body.querySelector('#pwOk').onclick = go;
      body.querySelector('#pwCancel').onclick = () => { closeModal(); task.destroy(); };
      body.querySelector('#pw').focus();
    });
  };
  return task.promise;
}

async function pagesFromDoc(docId) {
  const d = S.docs[docId];
  const out = [];
  for (let i = 0; i < d.numPages; i++) {
    const page = await getPdfPage(docId, i);
    const vp = page.getViewport({ scale: 1 });
    out.push({ uid: uid(), docId, src: i, baseW: vp.width, baseH: vp.height, origRotate: page.rotate || 0, rot: 0, objects: [] });
  }
  return out;
}

async function openFile(file) {
  if (!file) return;
  if (S.unsaved && S.pages.length) {
    const ok = await ask('Open another file?', 'Your changes to the current file have not been saved as a PDF yet. They will be lost.', [
      { label: 'Keep working here', value: false }, { label: 'Open the new file', value: true, primary: true }]);
    if (!ok) return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await openBytes(bytes, file.name);
}

async function openBytes(bytes, name) {
  if (!looksLikePdf(bytes)) { toast('That file does not look like a PDF.'); return; }
  toast('Opening…', 60000);
  let pdf;
  try { pdf = await loadPdfjs(bytes, name); }
  catch (e) { $('#toast').hidden = true; toast(e && e.name === 'PasswordException' ? 'Not opened (no password).' : 'Sorry, this PDF could not be opened. It may be damaged.'); console.error(e); return; }
  resetDoc();
  S.docs = [{ bytes, pdf, numPages: pdf.numPages, name }];
  S.name = name;
  S.pages = await pagesFromDoc(0);
  afterOpen();
  $('#toast').hidden = true;
  toast(`Opened ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}. Click any text to change it.`);
  scheduleAutosave();
}

function looksLikePdf(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF');
}

function resetDoc() {
  closeEditor();
  for (const d of S.docs) { try { d.pdf.destroy(); } catch {} }
  S.docs = []; S.pages = []; S.assets = {}; S.undo = []; S.redo = []; S.sel = null; S.unsaved = false;
  pdfPageCache.clear(); linesCache.clear(); thumbCache.clear();
}

function afterOpen() {
  document.body.classList.add('has-doc');
  $('#fileName').textContent = S.name;
  document.title = S.name + ' — Private PDF Editor';
  $('#zoomBox').hidden = false;
  S.fitMode = true;
  setTool('edit');
  layout();
  viewer.scrollTop = 0;
  updateButtons();
}

async function resumeSession() {
  const s = await kvGet('session');
  if (!s) return;
  toast('Restoring…', 60000);
  try {
    resetDoc();
    for (const d of s.docs) {
      const pdf = await loadPdfjs(d.bytes, d.name);
      S.docs.push({ bytes: d.bytes, pdf, numPages: pdf.numPages, name: d.name });
    }
    for (const [id, a] of Object.entries(s.assets || {})) {
      const bitmap = await createImageBitmap(new Blob([a.bytes], { type: a.mime }));
      S.assets[id] = { ...a, bitmap };
    }
    S.name = s.name; S.pages = s.pages; S.undo = s.undo || [];
    for (const p of S.pages) for (const o of p.objects) if (o.kind === 'text') await ensureFont(o);
    afterOpen();
    S.unsaved = true;
    updateButtons();
    $('#toast').hidden = true;
    toast('Your work is back.');
  } catch (e) {
    console.error(e);
    $('#toast').hidden = true;
    toast('Sorry, the earlier work could not be restored.');
  }
}

// ---------------------------------------------------------------- layout & rendering
const io = new IntersectionObserver(entries => {
  for (const en of entries) {
    const rec = slots.get(en.target.dataset.uid);
    if (!rec) continue;
    rec.visible = en.isIntersecting;
    if (en.isIntersecting) showSlot(rec);
  }
  trimRendered();
}, { root: viewer, rootMargin: '800px 0px' });

function computeFitScale() {
  const maxW = Math.max(...S.pages.map(p => (p.rot % 180 ? p.baseH : p.baseW)), 100);
  const avail = Math.max(200, viewer.clientWidth - 28);
  return Math.min(avail / maxW, 1.6);
}

function layout() {
  io.disconnect();
  for (const rec of slots.values()) if (rec.task) { try { rec.task.cancel(); } catch {} }
  slots.clear();
  pagesEl.innerHTML = '';
  pageIndex = new Map(S.pages.map(p => [p.uid, p]));
  if (S.fitMode) S.scale = computeFitScale();
  S.pages.forEach((p, i) => {
    const slot = el('div', 'page-slot'); slot.dataset.uid = p.uid;
    const page = el('div', 'page'); page.dataset.uid = p.uid;
    const loading = el('div', 'loading', 'Loading page ' + (i + 1) + '…');
    const textlayer = el('div', 'textlayer');
    const obj = el('div', 'objlayer');
    page.append(loading, textlayer, obj);
    slot.append(page, el('div', 'page-label', `${i + 1}`));
    pagesEl.append(slot);
    const rec = { uid: p.uid, slot, page, loading, textlayer, obj, canvas: null, renderedScale: 0, overlayScale: 0, task: null, visible: false, lastShown: 0 };
    slots.set(p.uid, rec);
    applyGeometry(rec);
    io.observe(slot);
  });
  $('#pageCount').textContent = '/ ' + S.pages.length;
  $('#pageNum').max = S.pages.length;
  $('#zoomPct').textContent = Math.round(S.scale * 100) + '%';
  updateButtons();
  renderProps();
}

function applyGeometry(rec) {
  const p = pageOf(rec.uid), s = S.scale;
  const rotated = p.rot % 180 !== 0;
  rec.slot.style.width = (rotated ? p.baseH : p.baseW) * s + 'px';
  rec.slot.style.height = (rotated ? p.baseW : p.baseH) * s + 'px';
  rec.page.style.width = p.baseW * s + 'px';
  rec.page.style.height = p.baseH * s + 'px';
  rec.page.style.transform = `translate(-50%, -50%) rotate(${p.rot}deg)`;
}

function setScale(newScale, keepFit = false) {
  closeEditor();
  const ratio = viewer.scrollTop / Math.max(1, viewer.scrollHeight);
  S.scale = Math.max(0.2, Math.min(6, newScale));
  S.fitMode = keepFit;
  for (const rec of slots.values()) { applyGeometry(rec); rec.overlayScale = 0; if (rec.visible) showSlot(rec); }
  viewer.scrollTop = ratio * viewer.scrollHeight;
  $('#zoomPct').textContent = Math.round(S.scale * 100) + '%';
}

function showSlot(rec) {
  rec.lastShown = performance.now();
  if (rec.overlayScale !== S.scale) renderOverlay(rec);
  if (rec.renderedScale !== S.scale) renderCanvas(rec);
}

function trimRendered() {
  const rendered = [...slots.values()].filter(r => r.canvas && !r.visible).sort((a, b) => a.lastShown - b.lastShown);
  const keep = 12;
  while (rendered.length > keep) {
    const r = rendered.shift();
    r.canvas.width = r.canvas.height = 0; r.canvas.remove(); r.canvas = null; r.renderedScale = 0; r.loading.hidden = false;
  }
}

async function renderCanvas(rec) {
  const p = pageOf(rec.uid);
  if (!p) return;
  const want = S.scale;
  if (rec.task) { try { rec.task.cancel(); } catch {} rec.task = null; }
  let k = want * DPR();
  const maxPx = 14e6;
  if (p.baseW * k * p.baseH * k > maxPx) k = Math.sqrt(maxPx / (p.baseW * p.baseH));
  const canvas = el('canvas', 'render');
  canvas.width = Math.ceil(p.baseW * k); canvas.height = Math.ceil(p.baseH * k);
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (p.docId == null) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    try {
      const page = await getPdfPage(p.docId, p.src);
      const task = page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: k }) });
      rec.task = task;
      await task.promise;
      if (rec.task !== task) return;
      rec.task = null;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      console.error(e);
      rec.loading.textContent = 'Part of this page could not be shown.';
    }
  }
  if (S.scale !== want || slots.get(rec.uid) !== rec) return;
  if (rec.canvas) { rec.canvas.width = rec.canvas.height = 0; rec.canvas.remove(); }
  rec.canvas = canvas; rec.canvasK = k;
  rec.page.insertBefore(canvas, rec.page.firstChild);
  rec.loading.hidden = true;
  rec.renderedScale = want;
  if (p.docId != null) loadLines(p).then(() => { if (slots.get(rec.uid) === rec) renderTextLayer(rec); });
}

// ---------------------------------------------------------------- overlay: added things
function renderOverlay(rec) {
  const p = pageOf(rec.uid);
  if (!p) return;
  const s = S.scale;
  rec.obj.innerHTML = '';
  for (const o of p.objects) {
    if (o.kind === 'text' && o.cover) {
      const c = el('div', 'obj cover');
      Object.assign(c.style, { left: o.cover.x * s + 'px', top: o.cover.y * s + 'px', width: o.cover.w * s + 'px', height: o.cover.h * s + 'px', background: o.cover.color });
      rec.obj.append(c);
    }
  }
  for (const o of p.objects) rec.obj.append(makeObjEl(o, s));
  rec.overlayScale = s;
  renderTextLayer(rec);
  if (editing && editing.uid === rec.uid) { rec.obj.append(editing.ta); hideEditedEl(); }
}

function objBox(o) {
  if (o.kind === 'text' && o.cover && !String(o.text).trim()) return o.cover; // deleted text: select via its cover
  return o;
}

function makeObjEl(o, s) {
  const b = objBox(o);
  const d = el('div', 'obj k-' + o.kind);
  d.dataset.id = o.id;
  Object.assign(d.style, { left: b.x * s + 'px', top: b.y * s + 'px', width: Math.max(4, b.w * s) + 'px', height: Math.max(4, b.h * s) + 'px' });
  if (o.r) { d.style.transformOrigin = '0 0'; d.style.transform = `rotate(${o.r}deg)`; }
  if (o.kind === 'rect') {
    if (o.fill) { d.style.background = o.fill; d.style.opacity = o.opacity ?? 1; }
    if (o.stroke && o.strokeWidth) { d.style.border = `${o.strokeWidth * s}px solid ${o.stroke}`; d.style.opacity = o.opacity ?? 1; }
  } else if (!(o.kind === 'text' && !String(o.text).trim())) {
    const c = renderObject(o, s * DPR(), S.assets);
    d.append(c);
  }
  if (S.sel && S.sel.id === o.id) d.classList.add('selected');
  const del = el('button', 'del', o.origin === 'edit' ? 'Undo this edit' : 'Delete');
  del.dataset.act = 'delete';
  const h = el('div', 'handle'); h.dataset.act = 'resize';
  d.append(h, del);
  return d;
}

function refreshPage(uidStr) {
  const rec = slots.get(uidStr);
  if (rec) renderOverlay(rec);
}

function select(uidStr, id) {
  const prev = S.sel;
  S.sel = id ? { uid: uidStr, id } : null;
  if (prev && prev.uid !== uidStr) refreshSelectionClass(prev.uid);
  refreshSelectionClass(uidStr);
  renderProps();
}
function refreshSelectionClass(u) {
  const rec = slots.get(u);
  if (!rec) return;
  rec.obj.querySelectorAll('.obj[data-id]').forEach(d => d.classList.toggle('selected', !!S.sel && S.sel.id === d.dataset.id));
}
function selected() {
  if (!S.sel) return null;
  const p = pageOf(S.sel.uid);
  const o = p && findObj(p, S.sel.id);
  return o ? { p, o } : null;
}

function deleteObj(p, o) {
  const before = snap();
  p.objects = p.objects.filter(x => x !== o);
  S.sel = null;
  commitFrom(before);
  refreshPage(p.uid);
  renderProps();
}

// ---------------------------------------------------------------- text in the original page
async function loadLines(p) {
  const key = p.docId + ':' + p.src;
  if (linesCache.has(key)) return linesCache.get(key);
  const promise = (async () => {
    const page = await getPdfPage(p.docId, p.src);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str) continue;
      const t = pdfjsLib.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(t[2], t[3]);
      if (size < 1) continue;
      if (Math.abs(t[1]) > 0.01 * size || t[0] <= 0) continue; // only straight, left-to-right lines
      const st = tc.styles[it.fontName] || {};
      // generous: some fonts report a small ascent, and the patch must hide the whole old text
      const asc = Math.max(st.ascent > 0 ? st.ascent : 0.8, 0.92);
      const desc = Math.min(st.descent < 0 ? st.descent : -0.2, -0.24);
      items.push({ str: it.str, x: t[4], baseline: t[5], size, w: it.width * vp.scale, asc, desc, fontName: it.fontName, generic: st.fontFamily });
    }
    const lines = [];
    for (const it of items) {
      const isSpace = !it.str.trim();
      let line = null;
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
        const L = lines[i];
        if (Math.abs(L.baseline - it.baseline) < 0.3 * L.size && Math.abs(L.size - it.size) < 0.35 * L.size &&
          it.x > L.x + L.w - 0.6 * L.size && it.x - (L.x + L.w) < 1.2 * L.size) { line = L; break; }
      }
      if (!line) {
        if (isSpace) continue;
        lines.push({ ...it, text: it.str, parts: 1 });
        continue;
      }
      const gap = it.x - (line.x + line.w);
      if (gap > 0.15 * line.size && !/\s$/.test(line.text) && !/^\s/.test(it.str)) line.text += ' ';
      line.text += it.str;
      line.w = Math.max(line.w, it.x + it.w - line.x);
      line.parts++;
    }
    const out = lines.filter(L => L.text.trim()).map((L, i) => ({
      key: `${key}:${i}`, text: L.text.replace(/\s+$/, ''), x: L.x, w: L.w, size: L.size, baseline: L.baseline,
      top: L.baseline - L.asc * L.size, bottom: L.baseline - L.desc * L.size, fontName: L.fontName, generic: L.generic,
    }));
    return out;
  })();
  linesCache.set(key, promise);
  return promise;
}

function renderTextLayer(rec) {
  const p = pageOf(rec.uid);
  rec.textlayer.innerHTML = '';
  if (!p || p.docId == null) return;
  const key = p.docId + ':' + p.src;
  const pr = linesCache.get(key);
  if (!pr) return;
  pr.then(lines => {
    if (!pageOf(rec.uid)) return;
    const edited = new Set(p.objects.filter(o => o.lineKey).map(o => o.lineKey));
    const s = S.scale;
    rec.textlayer.innerHTML = '';
    lines.forEach((L, i) => {
      if (edited.has(L.key)) return;
      const d = el('div', 'tline');
      d.dataset.line = i;
      d.title = 'Click to change this text';
      Object.assign(d.style, { left: (L.x - 1) * s + 'px', top: L.top * s + 'px', width: (L.w + 2) * s + 'px', height: (L.bottom - L.top) * s + 'px' });
      rec.textlayer.append(d);
    });
  });
}

/** Look at the page picture to find the text colour and the background colour of an area. */
async function sampleColors(p, box) {
  let canvas = null, k = 1;
  const rec = slots.get(p.uid);
  if (rec && rec.canvas && rec.canvas.width) { canvas = rec.canvas; k = rec.canvasK; }
  else if (p.docId != null) {
    canvas = document.createElement('canvas'); k = 1.5;
    canvas.width = Math.ceil(p.baseW * k); canvas.height = Math.ceil(p.baseH * k);
    const page = await getPdfPage(p.docId, p.src);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: k }) }).promise;
  }
  if (!canvas) return { text: '#000000', bg: '#ffffff' };
  const x0 = Math.max(0, Math.floor((box.x - 2) * k)), y0 = Math.max(0, Math.floor((box.y - 2) * k));
  const x1 = Math.min(canvas.width, Math.ceil((box.x + box.w + 2) * k)), y1 = Math.min(canvas.height, Math.ceil((box.y + box.h + 2) * k));
  if (x1 - x0 < 2 || y1 - y0 < 2) return { text: '#000000', bg: '#ffffff' };
  let data;
  try { data = canvas.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data; } catch { return { text: '#000000', bg: '#ffffff' }; }
  const W = x1 - x0, H = y1 - y0;
  const counts = new Map();
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const c = px(x, y); const q = c.map(v => v >> 3).join(','); counts.set(q, (counts.get(q) || 0) + 1); }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const c = px(x, y); const q = c.map(v => v >> 3).join(','); counts.set(q, (counts.get(q) || 0) + 1); }
  let best = '31,31,31', n = -1;
  for (const [q, c] of counts) if (c > n) { n = c; best = q; }
  // average the real border pixels that fall in the most common colour group
  const sum = [0, 0, 0]; let cnt = 0;
  const addIf = (x, y) => { const c = px(x, y); if (c.map(v => v >> 3).join(',') === best) { sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; cnt++; } };
  for (let x = 0; x < W; x++) { addIf(x, 0); addIf(x, H - 1); }
  for (let y = 0; y < H; y++) { addIf(0, y); addIf(W - 1, y); }
  const bg = sum.map(v => Math.round(v / Math.max(1, cnt)));
  let maxD = 0; const far = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = px(x, y); const d = Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]);
    if (d > maxD) maxD = d;
    far.push([d, c]);
  }
  let text = [0, 0, 0];
  if (maxD > 40) {
    const sel = far.filter(([d]) => d >= maxD * 0.8).map(([, c]) => c);
    text = [0, 1, 2].map(i => Math.round(sel.reduce((a, c) => a + c[i], 0) / sel.length));
  }
  const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  const bgHex = bg.every(v => v >= 248) ? '#ffffff' : hex(bg);
  return { text: hex(text), bg: bgHex };
}

async function pdfFontName(p, fontName) {
  try {
    const page = await getPdfPage(p.docId, p.src);
    if (page.commonObjs.has(fontName)) {
      const f = page.commonObjs.get(fontName);
      return { name: f && f.name, bold: !!(f && f.bold), italic: !!(f && f.italic) };
    }
  } catch {}
  return { name: '' };
}

/** Create an edit object that replaces one original line of text. */
async function makeEditObject(p, L, newText) {
  const pf = await pdfFontName(p, L.fontName);
  const g = guessFont(pf.name, L.generic);
  const box = { x: L.x, y: L.top, w: L.w, h: L.bottom - L.top };
  const colors = await sampleColors(p, box);
  const o = {
    id: uid(), kind: 'text', origin: 'edit', lineKey: L.key, fresh: true,
    x: L.x - L.size * 0.12, baseline: L.baseline, text: newText ?? L.text, origText: L.text, origW: L.w,
    font: g.font, bold: g.bold || pf.bold, italic: g.italic || pf.italic, size: Math.round(L.size * 10) / 10, color: colors.text,
    cover: { x: L.x - 1, y: L.top - 0.5, w: L.w + 2, h: L.bottom - L.top + 1, color: colors.bg },
  };
  await ensureFont(o);
  fitWidth(o);
  updateTextBox(o);
  return o;
}

/** Make the replacement font take the same width as the original text, so the line looks the same. */
function fitWidth(o) {
  if (o.origin !== 'edit' || !o.origW || !o.origText) return;
  const w = measure({ ...o, hscale: 1 }, o.origText);
  o.hscale = w > 0 ? Math.max(0.6, Math.min(1.5, o.origW / w)) : 1;
  if (Math.abs(o.hscale - 1) < 0.02) o.hscale = 1;
}

function updateTextBox(o) {
  const L = layoutText(o);
  o.w = L.w; o.h = L.h;
  o.y = o.baseline - L.firstBaseline;
}

async function startLineEdit(rec, lineIdx) {
  const p = pageOf(rec.uid);
  const lines = await loadLines(p);
  const L = lines[lineIdx];
  if (!L) return;
  const before = snap();
  const o = await makeEditObject(p, L);
  p.objects.push(o);
  S.sel = { uid: p.uid, id: o.id };
  renderOverlay(rec);
  openEditor(rec, o, before);
  renderProps();
}

// ---------------------------------------------------------------- text editor (typing)
let editing = null; // {uid, o, ta, before}

function openEditor(rec, o, before) {
  closeEditor();
  const ta = document.createElement('textarea');
  ta.className = 'editor';
  ta.value = o.text;
  ta.dir = 'auto';
  ta.setAttribute('autocapitalize', 'sentences');
  editing = { uid: rec.uid, o, ta, before: before ?? snap() };
  rec.obj.append(ta);
  styleEditor();
  hideEditedEl();
  ta.addEventListener('input', () => { o.text = ta.value; updateTextBox(o); styleEditor(); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeEditor(); }
    e.stopPropagation();
  });
  ta.addEventListener('blur', () => setTimeout(() => { if (editing && editing.ta === ta && document.activeElement !== ta) closeEditor(); }, 0));
  ta.focus({ preventScroll: true });
  if (o.origin === 'edit' && o.fresh) ta.setSelectionRange(ta.value.length, ta.value.length);
}

function hideEditedEl() {
  if (!editing) return;
  const rec = slots.get(editing.uid);
  const d = rec && rec.obj.querySelector(`.obj[data-id="${editing.o.id}"]`);
  if (d) d.style.visibility = 'hidden';
}

function styleEditor() {
  if (!editing) return;
  const { o, ta } = editing;
  const s = S.scale, L = layoutText(o), hs = o.hscale || 1;
  Object.assign(ta.style, {
    left: o.x * s + 'px', top: o.y * s + 'px',
    width: (L.w / hs + o.size * 1.5) * s + 'px', height: L.h * s + 'px',
    paddingLeft: L.pad / hs * s + 'px',
    font: fontString(o, o.size * s), lineHeight: L.lh * s + 'px',
    color: o.color, background: o.cover ? o.cover.color : 'rgba(255,255,255,.55)',
    transform: (o.r ? `rotate(${o.r}deg) ` : '') + (hs !== 1 ? `scaleX(${hs})` : ''),
    textAlign: o.align || (isRtl(o.text) ? 'right' : 'left'),
  });
}

function closeEditor() {
  if (!editing) return;
  const { uid: u, o, ta, before } = editing;
  editing = null;
  o.text = ta.value;
  ta.remove();
  const p = pageOf(u);
  if (p) {
    const empty = !o.text.trim();
    if ((o.origin !== 'edit' && empty) || (o.origin === 'edit' && o.fresh && o.text === o.origText)) {
      p.objects = p.objects.filter(x => x !== o);
      if (S.sel && S.sel.id === o.id) S.sel = null;
    } else {
      o.fresh = false;
      updateTextBox(o);
      if (o.font) rememberFont(o.font);
    }
    commitFrom(before);
    refreshPage(u);
  }
  renderProps();
}

// ---------------------------------------------------------------- pointer interaction on pages
function toPage(e, rec) {
  const p = pageOf(rec.uid);
  const r = rec.slot.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const dx = e.clientX - cx, dy = e.clientY - cy;
  const t = -p.rot * Math.PI / 180;
  const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t);
  return { x: (lx + p.baseW * S.scale / 2) / S.scale, y: (ly + p.baseH * S.scale / 2) / S.scale };
}

function trackPointer(e, target, onMove, onUp) {
  target.setPointerCapture?.(e.pointerId);
  const move = ev => { if (ev.pointerId === e.pointerId) onMove(ev); };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    onUp(ev);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

const DRAG_TOOLS = ['whiteout', 'highlight', 'rect', 'draw'];

pagesEl.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  const pageDiv = e.target.closest('.page');
  if (!pageDiv || e.target.closest('textarea.editor')) return;
  const rec = slots.get(pageDiv.dataset.uid);
  if (!rec) return;
  const p = pageOf(rec.uid);
  const objEl = e.target.closest('.obj[data-id]');
  const act = e.target.dataset.act;

  if (objEl && (act === 'delete' || act === 'resize' || !DRAG_TOOLS.includes(S.tool))) {
    const o = findObj(p, objEl.dataset.id);
    if (!o) return;
    e.preventDefault();
    if (act === 'delete') { deleteObj(p, o); return; }
    const wasSelected = S.sel && S.sel.id === o.id;
    if (editing && editing.o !== o) closeEditor();
    if (!wasSelected) select(p.uid, o.id);
    dragObject(e, rec, p, o, act === 'resize' ? 'resize' : 'move', wasSelected);
    return;
  }
  if (editing) { closeEditor(); if (S.tool === 'select') return; }

  const tl = e.target.closest('.tline');
  if (tl && S.tool === 'edit') { e.preventDefault(); startLineEdit(rec, +tl.dataset.line); return; }

  const pt = toPage(e, rec);
  if (S.tool === 'text') { e.preventDefault(); addTextAt(rec, p, pt); return; }
  if (S.tool === 'mark') { e.preventDefault(); addMarkAt(rec, p, pt); return; }
  if (S.tool === 'whiteout' || S.tool === 'highlight' || S.tool === 'rect') { e.preventDefault(); dragBox(e, rec, p, pt); return; }
  if (S.tool === 'draw') { e.preventDefault(); drawInk(e, rec, p, pt); return; }
  if (S.sel) select(null, null);
});

function dragObject(e, rec, p, o, mode, wasSelected) {
  const before = snap();
  const start = toPage(e, rec);
  const o0 = JSON.parse(JSON.stringify(o));
  let moved = false;
  const d = rec.obj.querySelector(`.obj[data-id="${o.id}"]`);
  trackPointer(e, rec.page, ev => {
    const pt = toPage(ev, rec);
    let dx = pt.x - start.x, dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) * S.scale < 3) return;
    moved = true;
    if (mode !== 'move' && o.r) { // resize handle follows the item's own direction
      const t = -o.r * Math.PI / 180;
      [dx, dy] = [dx * Math.cos(t) - dy * Math.sin(t), dx * Math.sin(t) + dy * Math.cos(t)];
    }
    if (mode === 'move') {
      o.x = o0.x + dx;
      if (o.kind === 'text') { o.baseline = o0.baseline + dy; updateTextBox(o); } else o.y = o0.y + dy;
      if (o.kind === 'text' && o.cover && !String(o.text).trim()) { o.cover.x = o0.cover.x + dx; o.cover.y = o0.cover.y + dy; }
      const b = objBox(o);
      if (d) { d.style.left = b.x * S.scale + 'px'; d.style.top = b.y * S.scale + 'px'; }
      if (editing && editing.o === o) styleEditor();
    } else {
      if (o.kind === 'text') {
        const f = Math.max(0.1, (o0.w + dx) / o0.w);
        o.size = Math.max(3, Math.round(o0.size * f * 10) / 10);
        updateTextBox(o);
      } else if (o.kind === 'image' || o.kind === 'ink') {
        o.w = Math.max(5, o0.w + dx); o.h = o.w * o0.h / o0.w;
      } else { o.w = Math.max(3, o0.w + dx); o.h = Math.max(3, o0.h + dy); }
      if (d) { d.style.width = o.w * S.scale + 'px'; d.style.height = o.h * S.scale + 'px'; }
      if (editing && editing.o === o) styleEditor();
    }
  }, () => {
    if (moved) { commitFrom(before); refreshPage(p.uid); renderProps(); }
    else if (wasSelected && o.kind === 'text' && !(editing && editing.o === o)) openEditor(rec, o);
  });
}

/** Items added on a page the user turned are turned back, so they look upright. */
const uprightFor = p => (360 - (p.rot || 0)) % 360;
/** Top-left corner that puts local point (lx, ly) of an item turned by r degrees at page point pt. */
function anchorFor(pt, r, lx, ly) {
  const t = r * Math.PI / 180;
  return { x: pt.x - (lx * Math.cos(t) - ly * Math.sin(t)), y: pt.y - (lx * Math.sin(t) + ly * Math.cos(t)) };
}

function addTextAt(rec, p, pt) {
  const before = snap();
  const d = S.defaults.text;
  const o = { id: uid(), kind: 'text', origin: 'new', x: pt.x, baseline: 0, text: '', font: d.font, size: d.size, color: d.color, bold: d.bold, italic: d.italic, r: uprightFor(p) };
  const L = layoutText(o);
  const a = anchorFor(pt, o.r, 0, L.h / 2);
  o.x = a.x; o.baseline = a.y + L.firstBaseline;
  updateTextBox(o);
  p.objects.push(o);
  S.sel = { uid: p.uid, id: o.id };
  renderOverlay(rec);
  openEditor(rec, o, before);
  renderProps();
}

function addMarkAt(rec, p, pt) {
  const before = snap();
  const d = S.defaults.mark;
  const text = d.symbol === 'date' ? new Date().toLocaleDateString() : d.symbol;
  const o = { id: uid(), kind: 'text', origin: 'new', x: 0, baseline: 0, text, font: 'sans-serif', size: d.size, color: d.color, bold: d.symbol !== 'date', r: uprightFor(p) };
  const L = layoutText(o);
  const a = anchorFor(pt, o.r, L.w / 2, L.h / 2);
  o.x = a.x; o.baseline = a.y + L.firstBaseline;
  updateTextBox(o);
  p.objects.push(o);
  commitFrom(before);
  S.sel = { uid: p.uid, id: o.id };
  renderOverlay(rec);
  renderProps();
}

function dragBox(e, rec, p, start) {
  const box = el('div', 'dragbox');
  rec.obj.append(box);
  let cur = start;
  const upd = () => {
    const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y), w = Math.abs(cur.x - start.x), h = Math.abs(cur.y - start.y);
    Object.assign(box.style, { left: x * S.scale + 'px', top: y * S.scale + 'px', width: w * S.scale + 'px', height: h * S.scale + 'px' });
    return { x, y, w, h };
  };
  trackPointer(e, rec.page, ev => { cur = toPage(ev, rec); upd(); }, () => {
    const b = upd(); box.remove();
    if (b.w < 2 || b.h < 2) { toast('Press and drag to draw the box.'); return; }
    const before = snap();
    const t = S.tool, d = S.defaults[t];
    const o = { id: uid(), kind: 'rect', tool: t, ...b };
    if (t === 'whiteout') o.fill = d.fill;
    if (t === 'highlight') { o.fill = d.fill; o.opacity = d.opacity; }
    if (t === 'rect') { o.stroke = d.stroke; o.strokeWidth = d.strokeWidth; }
    p.objects.push(o);
    commitFrom(before);
    S.sel = { uid: p.uid, id: o.id };
    renderOverlay(rec); renderProps();
  });
}

function drawInk(e, rec, p, start) {
  const d = S.defaults.draw;
  const pts = [[start.x, start.y]];
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' });
  svg.setAttribute('viewBox', `0 0 ${p.baseW} ${p.baseH}`);
  const path = document.createElementNS(svgNS, 'polyline');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', d.color); path.setAttribute('stroke-width', d.width);
  path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
  svg.append(path); rec.obj.append(svg);
  const upd = () => path.setAttribute('points', pts.map(q => q.join(',')).join(' '));
  upd();
  trackPointer(e, rec.page, ev => {
    const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    for (const c of (evs.length ? evs : [ev])) { const q = toPage(c, rec); pts.push([q.x, q.y]); }
    upd();
  }, () => {
    svg.remove();
    const before = snap();
    // Strokes drawn quickly one after another become one drawing (handwriting, signatures).
    let o = null;
    const li = S.lastInk;
    if (li && li.uid === p.uid && performance.now() - li.time < 2500) o = findObj(p, li.id);
    const strokes = o ? o.strokes.map(st => st.map(([x, y]) => [x * o.w / o.w0 + o.x, y * o.h / o.h0 + o.y])) : [];
    strokes.push(pts);
    const width = o ? o.width : d.width, color = o ? o.color : d.color;
    const all = strokes.flat();
    const pad = width;
    const x0 = Math.min(...all.map(q => q[0])) - pad, y0 = Math.min(...all.map(q => q[1])) - pad;
    const x1 = Math.max(...all.map(q => q[0])) + pad, y1 = Math.max(...all.map(q => q[1])) + pad;
    const rel = strokes.map(st => st.map(([x, y]) => [Math.round((x - x0) * 100) / 100, Math.round((y - y0) * 100) / 100]));
    const fields = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, w0: x1 - x0, h0: y1 - y0, strokes: rel, width, color };
    if (o) Object.assign(o, fields);
    else { o = { id: uid(), kind: 'ink', ...fields }; p.objects.push(o); }
    S.lastInk = { uid: p.uid, id: o.id, time: performance.now() };
    commitFrom(before);
    renderOverlay(rec);
  });
}

// ---------------------------------------------------------------- images & signatures
function currentPageRec() {
  const vr = viewer.getBoundingClientRect();
  const mid = vr.top + vr.height / 3;
  let best = null;
  for (const rec of slots.values()) {
    const r = rec.slot.getBoundingClientRect();
    if (r.bottom >= mid) { best = rec; break; }
    best = rec;
  }
  return best;
}

async function imageFileToAsset(file) {
  const bmp = await createImageBitmap(file); // applies phone photo rotation
  const max = 2400;
  const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const jpeg = file.type === 'image/jpeg';
  return addAssetFromCanvas(c, jpeg ? 'image/jpeg' : 'image/png');
}

async function addAssetFromCanvas(c, mime) {
  const bytes = await canvasToBytes(c, mime, 0.92);
  const bitmap = await createImageBitmap(c);
  const id = uid();
  S.assets[id] = { mime, bytes, bitmap, w: c.width, h: c.height };
  return id;
}

function placeImage(assetId, widthPt) {
  const rec = currentPageRec();
  if (!rec) return;
  const p = pageOf(rec.uid);
  const a = S.assets[assetId];
  const w = Math.min(widthPt, p.baseW * 0.8);
  const h = w * a.h / a.w;
  const before = snap();
  const r = uprightFor(p);
  const pos = anchorFor({ x: p.baseW / 2, y: p.baseH / 2 }, r, w / 2, h / 2);
  const o = { id: uid(), kind: 'image', assetId, x: pos.x, y: pos.y, w, h, r };
  p.objects.push(o);
  commitFrom(before);
  setTool('select');
  S.sel = { uid: p.uid, id: o.id };
  renderOverlay(rec); renderProps();
  toast('Drag it where you want it. Use the round handle to resize.');
}

$('#imageInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { const id = await imageFileToAsset(f); placeImage(id, 200); }
  catch (err) { console.error(err); toast('Sorry, that picture could not be read.'); }
});

const SIG_FONTS = ['Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Snell Roundhand', 'Bradley Hand', 'Ink Free', 'Comic Sans MS', 'cursive'];
function openSignature() {
  const fonts = SIG_FONTS.filter(isFontAvailable);
  showModal(`<h2>Your signature</h2>
    <div class="tabs"><button class="btn on" data-tab="draw">Draw</button><button class="btn" data-tab="type">Type</button></div>
    <div data-pane="draw"><canvas class="sigpad" id="sigpad"></canvas>
      <div class="row gap" style="margin-top:6px"><label class="row">Colour <input type="color" id="sigColor" value="#1d3b8f"></label><button class="btn" id="sigClear">Clear</button></div></div>
    <div data-pane="type" hidden><label>Your name<input type="text" id="sigName" autocomplete="name"></label>
      <label>Style <select id="sigFont">${fonts.map(f => `<option style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select></label>
      <div id="sigPreview" style="font-size:34px;min-height:50px;color:#1d3b8f"></div></div>
    <p class="muted small">Not saved anywhere. It is only added to this document.</p>
    <div class="actions"><button class="btn" id="sigCancel">Cancel</button><button class="btn primary" id="sigUse">Add to page</button></div>`, body => {
    let tab = 'draw';
    body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      tab = b.dataset.tab;
      body.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
      body.querySelectorAll('[data-pane]').forEach(x => { x.hidden = x.dataset.pane !== tab; });
    });
    const pad = body.querySelector('#sigpad');
    const r = pad.getBoundingClientRect();
    pad.width = r.width * 2; pad.height = r.height * 2;
    const ctx = pad.getContext('2d');
    ctx.scale(2, 2); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.5;
    let drawn = false;
    pad.addEventListener('pointerdown', e => {
      e.preventDefault();
      const rr = pad.getBoundingClientRect();
      ctx.strokeStyle = body.querySelector('#sigColor').value;
      ctx.beginPath(); ctx.moveTo(e.clientX - rr.left, e.clientY - rr.top);
      drawn = true;
      trackPointer(e, pad, ev => { ctx.lineTo(ev.clientX - rr.left, ev.clientY - rr.top); ctx.stroke(); }, () => {});
    });
    body.querySelector('#sigClear').onclick = () => { ctx.clearRect(0, 0, pad.width, pad.height); drawn = false; };
    const prev = () => { const pv = body.querySelector('#sigPreview'); pv.textContent = body.querySelector('#sigName').value; pv.style.fontFamily = `"${body.querySelector('#sigFont').value}", cursive`; };
    body.querySelector('#sigName').oninput = prev; body.querySelector('#sigFont').onchange = prev;
    body.querySelector('#sigCancel').onclick = closeModal;
    body.querySelector('#sigUse').onclick = async () => {
      if (tab === 'draw') {
        if (!drawn) { toast('Draw your signature in the box first.'); return; }
        const crop = cropCanvas(pad);
        if (!crop) { toast('Draw your signature in the box first.'); return; }
        closeModal();
        const id = await addAssetFromCanvas(crop, 'image/png');
        placeImage(id, 160);
      } else {
        const name = body.querySelector('#sigName').value.trim();
        if (!name) { toast('Type your name first.'); return; }
        const font = body.querySelector('#sigFont').value || 'cursive';
        closeModal();
        const rec = currentPageRec(); const p = pageOf(rec.uid);
        const before = snap();
        const o = { id: uid(), kind: 'text', origin: 'new', x: 0, baseline: 0, text: name, font, size: 26, color: '#1d3b8f', r: uprightFor(p) };
        await ensureFont(o);
        const L = layoutText(o);
        const a = anchorFor({ x: p.baseW / 2, y: p.baseH / 2 }, o.r, L.w / 2, L.h / 2);
        o.x = a.x; o.baseline = a.y + L.firstBaseline; updateTextBox(o);
        p.objects.push(o); commitFrom(before);
        setTool('select'); S.sel = { uid: p.uid, id: o.id }; renderOverlay(rec); renderProps();
      }
    };
  });
}

function cropCanvas(c) {
  const ctx = c.getContext('2d');
  const { data, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 10) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ---------------------------------------------------------------- tools & properties bar
function setTool(t) {
  if (t === 'image') { $('#imageInput').click(); return; }
  if (t === 'sign') { openSignature(); return; }
  closeEditor();
  S.tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  document.body.className = document.body.className.replace(/\btool-\S+/g, '').replace(/\bdrawing-tool\b/g, '').trim();
  document.body.classList.add('tool-' + t);
  if (DRAG_TOOLS.includes(t)) document.body.classList.add('drawing-tool');
  if (S.sel) select(null, null); else renderProps();
}
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

const HINTS = {
  edit: 'Click any text with a dashed outline to change it. To delete text, clear it.',
  text: 'Click anywhere on the page to type new text.',
  select: 'Click something you added to move it, resize it (round handle) or delete it.',
  whiteout: 'Press and drag to cover something.',
  highlight: 'Press and drag over what you want to highlight.',
  rect: 'Press and drag to draw a box.',
  draw: 'Draw with your mouse, finger or pen.',
  mark: 'Click where the mark should go.',
};

function renderProps() {
  const bar = $('#propsBar');
  if (!S.pages.length) { bar.hidden = true; return; }
  bar.hidden = false;
  const sel = selected();
  const o = sel ? sel.o : null;
  const kind = o ? (o.kind === 'rect' ? o.tool || 'rect' : o.kind) : S.tool;
  let html = '';
  const target = o || (kind === 'text' || kind === 'edit' ? S.defaults.text : S.defaults[kind]);
  if ((o && o.kind === 'text') || kind === 'text') {
    const t = o || S.defaults.text;
    html += `<button class="btn font-btn" data-p="font" title="Choose a font" style="font-family:${esc(fontCssAttr(t.font))}">${esc(t.font)} &#9662;</button>
      <label title="Size">Size <input type="number" data-p="size" min="3" max="400" step="0.5" value="${t.size}"></label>
      <button class="btn icon ${t.bold ? 'on' : ''}" data-p="bold" title="Bold"><b>B</b></button>
      <button class="btn icon ${t.italic ? 'on' : ''}" data-p="italic" title="Italic"><i>I</i></button>
      <label title="Text colour">Colour <input type="color" data-p="color" value="${t.color}"></label>`;
    if (o && o.cover) html += `<label title="Colour of the patch covering the old text">Background <input type="color" data-p="cover" value="${o.cover.color}"></label>`;
    if (o && o.origin === 'edit') html += `<label title="Squeeze or stretch the text to fit">Width <input type="number" data-p="hscale" min="50" max="150" step="1" value="${Math.round((o.hscale || 1) * 100)}">%</label>`;
    if (o) html += `<button class="btn" data-p="edit">Edit text</button>`;
  } else if (kind === 'whiteout' || kind === 'highlight') {
    html += `<label>Colour <input type="color" data-p="fill" value="${target.fill}"></label>`;
    if (kind === 'highlight') html += `<label>Strength <input type="range" data-p="opacity" min="0.1" max="0.9" step="0.05" value="${target.opacity}"></label>`;
  } else if (kind === 'rect') {
    html += `<label>Colour <input type="color" data-p="stroke" value="${target.stroke}"></label>
      <label>Line <input type="number" data-p="strokeWidth" min="0.5" max="30" step="0.5" value="${target.strokeWidth}"></label>`;
  } else if (kind === 'draw' || kind === 'ink') {
    const t = o || S.defaults.draw;
    html += `<label>Colour <input type="color" data-p="color" value="${t.color}"></label>
      <label>Thickness <input type="number" data-p="width" min="0.5" max="30" step="0.5" value="${t.width}"></label>`;
  } else if (kind === 'mark') {
    const t = S.defaults.mark;
    html += ['✓', '✗', '●', 'date'].map(sym => `<button class="btn ${t.symbol === sym ? 'on' : ''}" data-p="symbol" data-v="${sym}">${sym === 'date' ? 'Today\'s date' : sym}</button>`).join('')
      + `<label>Size <input type="number" data-p="msize" min="4" max="200" value="${t.size}"></label><label>Colour <input type="color" data-p="mcolor" value="${t.color}"></label>`;
  }
  if (o) html += `<button class="btn danger" data-p="delete">${o.origin === 'edit' ? 'Undo this edit' : 'Delete'}</button>`;
  html += `<span class="hint">${o ? (o.kind === 'text' ? 'Click it again to type. Drag to move.' : 'Drag to move. Round handle resizes.') : HINTS[S.tool] || ''}</span>`;
  bar.innerHTML = html;
}

function fontCssAttr(f) { return ['sans-serif', 'serif', 'monospace', 'cursive'].includes(f) ? f : `'${String(f).replace(/'/g, '')}'`; }

async function applyProp(name, value, btn) {
  const sel = selected();
  const o = sel ? sel.o : null;
  if (name === 'delete' && sel) { deleteObj(sel.p, o); return; }
  if (name === 'edit' && sel) { const rec = slots.get(sel.p.uid); openEditor(rec, o); return; }
  if (name === 'font') { pickFont(o || S.defaults.text); return; }
  if (name === 'symbol') { S.defaults.mark.symbol = btn.dataset.v; renderProps(); return; }
  if (name === 'msize') { S.defaults.mark.size = +value || 16; return; }
  if (name === 'mcolor') { S.defaults.mark.color = value; return; }
  const before = snap();
  const t = o || (S.tool === 'edit' ? S.defaults.text : S.defaults[S.tool] || S.defaults.text);
  switch (name) {
    case 'size': { const v = parseFloat(value); if (v > 0) t.size = v; break; }
    case 'bold': t.bold = !t.bold; fitWidth(t); break;
    case 'italic': t.italic = !t.italic; fitWidth(t); break;
    case 'color': t.color = value; break;
    case 'cover': if (o && o.cover) o.cover.color = value; break;
    case 'hscale': { const v = parseFloat(value); if (v >= 30 && v <= 300) t.hscale = v / 100; break; }
    case 'fill': t.fill = value; break;
    case 'opacity': t.opacity = parseFloat(value); break;
    case 'stroke': t.stroke = value; break;
    case 'strokeWidth': t.strokeWidth = parseFloat(value) || 1; break;
    case 'width': t.width = parseFloat(value) || 1; break;
  }
  if (o) {
    if (o.kind === 'text') { await ensureFont(o); updateTextBox(o); }
    commitFrom(before);
    refreshPage(sel.p.uid);
    if (editing && editing.o === o) styleEditor();
    // remember the choice for the next new item of the same kind
    if (o.kind === 'text' && o.origin === 'new') Object.assign(S.defaults.text, { font: o.font, size: o.size, color: o.color, bold: o.bold, italic: o.italic });
  }
  if (name === 'bold' || name === 'italic') renderProps();
}

$('#propsBar').addEventListener('click', e => {
  const b = e.target.closest('button[data-p]');
  if (b) applyProp(b.dataset.p, null, b);
});
$('#propsBar').addEventListener('change', e => {
  const i = e.target.closest('input[data-p]');
  if (i) applyProp(i.dataset.p, i.value, i);
});
$('#propsBar').addEventListener('input', e => {
  const i = e.target.closest('input[data-p]');
  if (i && (i.type === 'range' || i.type === 'color')) {
    // live preview without creating many undo steps
    const sel = selected();
    if (sel && i.type === 'range') { sel.o.opacity = parseFloat(i.value); const d = slots.get(sel.p.uid)?.obj.querySelector(`.obj[data-id="${sel.o.id}"]`); if (d) d.style.opacity = i.value; }
  }
});

// ---------------------------------------------------------------- font picker
function pickFont(target) {
  const sample = (target.text && target.text.trim().slice(0, 30)) || 'The quick brown fox';
  const draw = (body, q) => {
    const list = body.querySelector('.fontlist');
    const ql = q.toLowerCase();
    let html = '';
    let count = 0;
    for (const [grp, names] of fontGroups()) {
      const f = names.filter(n => !ql || n.toLowerCase().includes(ql));
      if (!f.length) continue;
      html += `<div class="grp">${esc(grp)}</div>`;
      for (const n of f.slice(0, 400)) {
        count++;
        const mine = grp === 'Your font files';
        html += `<div class="fi ${n === target.font ? 'cur' : ''}" data-f="${esc(n)}"><span class="fs" style="font-family:${esc(fontCssAttr(n))}">${esc(sample)}</span><span class="fn">${esc(n)}${mine ? ` <a href="#" data-rm="${esc(n)}" title="Remove this font file from this browser">remove</a>` : ''}</span></div>`;
      }
    }
    if (!count) html = `<p class="muted" style="padding:10px">No font called “${esc(q)}”. You can add a font file (.ttf, .otf, .woff).</p>`;
    list.innerHTML = html;
  };
  showModal(`<h2>Choose a font</h2>
    <input type="search" id="fontQ" placeholder="Search fonts" autocomplete="off">
    <div class="row gap" style="margin-top:8px;flex-wrap:wrap">
      ${canListDeviceFonts() ? '<button class="btn" id="fontDevice">Show all fonts on this device</button>' : ''}
      <button class="btn" id="fontFile">Add a font file…</button>
    </div>
    <p class="muted small">Any language works when the font has its letters. Fonts you add stay only in this browser.</p>
    <div class="fontlist"></div>
    <div class="actions"><button class="btn" id="fontClose">Close</button></div>`, body => {
    const q = body.querySelector('#fontQ');
    draw(body, '');
    q.oninput = () => draw(body, q.value);
    body.querySelector('#fontClose').onclick = closeModal;
    const dev = body.querySelector('#fontDevice');
    if (dev) dev.onclick = async () => {
      try { const n = await listDeviceFonts(); toast(`${n} fonts found on this device.`); draw(body, q.value); }
      catch (e) { toast('The browser did not allow listing fonts. You can still type a font name or add a font file.'); }
    };
    body.querySelector('#fontFile').onclick = () => { fontFileTarget = { target, body, q }; $('#fontInput').click(); };
    body.querySelector('.fontlist').addEventListener('click', async e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { e.preventDefault(); e.stopPropagation(); await removeUserFont(rm.dataset.rm); draw(body, q.value); return; }
      const fi = e.target.closest('[data-f]');
      if (!fi) return;
      closeModal();
      await setFont(target, fi.dataset.f);
    });
    q.focus();
  });
}
let fontFileTarget = null;
$('#fontInput').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  try {
    const added = await addFontFiles(files);
    toast(`Added: ${added.join(', ')}`);
    if (fontFileTarget && added.length) { closeModal(); await setFont(fontFileTarget.target, added[0]); }
  } catch (err) { toast(err.message); }
});

async function setFont(target, font) {
  const sel = selected();
  const before = snap();
  target.font = font;
  rememberFont(font);
  await ensureFont(target);
  if (sel && sel.o === target) {
    fitWidth(target);
    updateTextBox(target);
    commitFrom(before);
    refreshPage(sel.p.uid);
    if (target.origin === 'new') S.defaults.text.font = font;
    if (editing && editing.o === target) { styleEditor(); editing.ta.focus(); }
  }
  renderProps();
}

// ---------------------------------------------------------------- find & replace
let findMatches = [];
async function runFind() {
  const q = $('#findText').value;
  const cs = $('#findCase').checked;
  const list = $('#findResults');
  list.innerHTML = ''; findMatches = [];
  $('#replaceAll').disabled = true;
  if (!q) { $('#findStatus').textContent = ''; return; }
  const norm = s => cs ? s : s.toLocaleLowerCase();
  const nq = norm(q);
  for (let i = 0; i < S.pages.length; i++) {
    const p = S.pages[i];
    if (i % 10 === 0) { $('#findStatus').textContent = `Searching page ${i + 1} of ${S.pages.length}…`; await new Promise(r => setTimeout(r)); }
    const edited = new Set(p.objects.filter(o => o.lineKey).map(o => o.lineKey));
    if (p.docId != null) {
      const lines = await loadLines(p);
      lines.forEach((L, li) => { if (!edited.has(L.key) && norm(L.text).includes(nq)) findMatches.push({ page: i, uid: p.uid, line: li, text: L.text }); });
    }
    for (const o of p.objects) if (o.kind === 'text' && norm(o.text).includes(nq)) findMatches.push({ page: i, uid: p.uid, objId: o.id, text: o.text });
  }
  $('#findStatus').textContent = findMatches.length ? `Found on ${findMatches.length} line${findMatches.length > 1 ? 's' : ''}.` : 'Not found. (Text inside pictures or scanned pages cannot be searched.)';
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
  list.innerHTML = findMatches.slice(0, 1000).map((m, k) =>
    `<li data-k="${k}"><b>Page ${m.page + 1}:</b> ${esc(m.text).replace(new RegExp(re.source.replace(/&/g, '&amp;').replace(/</g, '&lt;'), re.flags), x => `<mark>${x}</mark>`)}</li>`).join('');
  $('#replaceAll').disabled = !findMatches.length;
}
$('#findGo').onclick = runFind;
$('#findText').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runFind(); } e.stopPropagation(); });
$('#replaceText').addEventListener('keydown', e => e.stopPropagation());
$('#findResults').addEventListener('click', e => {
  const li = e.target.closest('li[data-k]');
  if (!li) return;
  const m = findMatches[+li.dataset.k];
  goToPage(m.page);
  setTimeout(() => {
    const rec = slots.get(m.uid);
    if (!rec) return;
    const t = m.objId ? rec.obj.querySelector(`.obj[data-id="${m.objId}"]`) : rec.textlayer.querySelector(`.tline[data-line="${m.line}"]`);
    if (t) { t.scrollIntoView({ block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
    if (S.tool !== 'edit' && !m.objId) setTool('edit');
  }, 350);
});
$('#replaceAll').onclick = async () => {
  const q = $('#findText').value, rep = $('#replaceText').value, cs = $('#findCase').checked;
  if (!q || !findMatches.length) return;
  const ok = await ask('Replace all?', `Replace “${esc(q)}” with “${esc(rep)}” on ${findMatches.length} line(s)? You can undo this in one step.`, [
    { label: 'Cancel', value: false }, { label: 'Replace all', value: true, primary: true }]);
  if (!ok) return;
  closeEditor();
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
  const before = snap();
  let n = 0;
  for (const m of findMatches) {
    const p = S.pages[m.page];
    if (m.objId) {
      const o = findObj(p, m.objId);
      if (o) { o.text = o.text.replace(re, () => rep); o.fresh = false; await ensureFont(o); updateTextBox(o); n++; }
    } else {
      const lines = await loadLines(p);
      const L = lines[m.line];
      if (p.objects.some(o => o.lineKey === L.key)) continue;
      const o = await makeEditObject(p, L, L.text.replace(re, () => rep));
      o.fresh = false;
      updateTextBox(o);
      p.objects.push(o); n++;
    }
    $('#findStatus').textContent = `Replacing… ${n}`;
  }
  commitFrom(before);
  for (const rec of slots.values()) if (rec.visible) renderOverlay(rec); else rec.overlayScale = 0;
  $('#findStatus').textContent = `Replaced on ${n} line(s).`;
  findMatches = []; $('#findResults').innerHTML = ''; $('#replaceAll').disabled = true;
  toast(`Replaced on ${n} line(s). Press Undo to reverse.`);
};
function toggleFind(show) {
  $('#findPanel').hidden = show === undefined ? !$('#findPanel').hidden : !show;
  if (!$('#findPanel').hidden) $('#findText').focus();
}
$('#btnFind').onclick = () => toggleFind();
$('#findClose').onclick = () => toggleFind(false);

// ---------------------------------------------------------------- navigation & zoom
function goToPage(i) {
  const p = S.pages[i];
  const rec = p && slots.get(p.uid);
  if (rec) viewer.scrollTop = rec.slot.offsetTop - 10;
}
$('#pageNum').addEventListener('change', e => goToPage(Math.max(1, Math.min(S.pages.length, +e.target.value || 1)) - 1));
$('#pageNum').addEventListener('keydown', e => e.stopPropagation());
let scrollRaf;
viewer.addEventListener('scroll', () => {
  cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    const rec = currentPageRec();
    if (rec) $('#pageNum').value = S.pages.findIndex(p => p.uid === rec.uid) + 1;
  });
});
$('#zoomIn').onclick = () => setScale(S.scale * 1.2);
$('#zoomOut').onclick = () => setScale(S.scale / 1.2);
$('#zoomFit').onclick = () => setScale(computeFitScale(), true);
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (S.fitMode && S.pages.length && !editing) setScale(computeFitScale(), true); }, 250);
});

// ---------------------------------------------------------------- page organiser
const thumbCache = new Map();
let orgObserver = null;
function openOrganizer() {
  closeEditor();
  $('#organizer').hidden = false;
  renderOrganizer();
}
function renderOrganizer() {
  const grid = $('#orgGrid');
  if (orgObserver) orgObserver.disconnect();
  orgObserver = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { drawThumb(en.target); orgObserver.unobserve(en.target); } }), { root: grid, rootMargin: '300px' });
  grid.innerHTML = '';
  S.pages.forEach((p, i) => {
    const t = el('div', 'thumb');
    t.draggable = true; t.dataset.i = i;
    t.innerHTML = `<div class="tbox"><div class="ph"></div></div><span class="num">Page ${i + 1}</span>
      <div class="tact">
        <button class="btn" data-a="left" title="Move earlier">&#8592;</button>
        <button class="btn" data-a="rotl" title="Rotate left">&#10226;</button>
        <button class="btn" data-a="rotr" title="Rotate right">&#10227;</button>
        <button class="btn" data-a="dup" title="Duplicate page">&#10697;</button>
        <button class="btn danger" data-a="del" title="Delete page">&#128465;</button>
        <button class="btn" data-a="right" title="Move later">&#8594;</button>
      </div>`;
    grid.append(t);
    orgObserver.observe(t);
  });
}
async function drawThumb(t) {
  const p = S.pages[+t.dataset.i];
  if (!p) return;
  const key = p.docId + ':' + p.src;
  const w = 130, k = w / Math.max(p.baseW, p.baseH) * 1.35;
  const c = document.createElement('canvas');
  c.width = Math.ceil(p.baseW * k); c.height = Math.ceil(p.baseH * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (p.docId != null) {
    if (!thumbCache.has(key)) {
      thumbCache.set(key, (async () => {
        const page = await getPdfPage(p.docId, p.src);
        const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height;
        await page.render({ canvasContext: cc.getContext('2d'), viewport: page.getViewport({ scale: k }) }).promise;
        return createImageBitmap(cc);
      })());
    }
    try { ctx.drawImage(await thumbCache.get(key), 0, 0, c.width, c.height); } catch {}
  }
  drawPageObjects(ctx, p.objects, k, S.assets);
  c.style.transform = `rotate(${p.rot}deg)`;
  c.style.maxWidth = c.style.maxHeight = '128px';
  c.style.boxShadow = '0 1px 3px rgba(0,0,0,.3)';
  const box = t.querySelector('.tbox'); box.innerHTML = ''; box.append(c);
}
function orgChange(fn) {
  const before = snap();
  fn();
  if (commitFrom(before)) { pageIndex = new Map(S.pages.map(p => [p.uid, p])); renderOrganizer(); }
}
$('#orgGrid').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  const i = +b.closest('.thumb').dataset.i;
  const a = b.dataset.a;
  orgChange(() => {
    const P = S.pages;
    if (a === 'left' && i > 0) [P[i - 1], P[i]] = [P[i], P[i - 1]];
    if (a === 'right' && i < P.length - 1) [P[i + 1], P[i]] = [P[i], P[i + 1]];
    if (a === 'rotl') P[i].rot = (P[i].rot + 270) % 360;
    if (a === 'rotr') P[i].rot = (P[i].rot + 90) % 360;
    if (a === 'dup') { const c = JSON.parse(JSON.stringify(P[i])); c.uid = uid(); c.objects.forEach(o => { o.id = uid(); }); P.splice(i + 1, 0, c); }
    if (a === 'del') { if (P.length === 1) toast('A PDF needs at least one page.'); else P.splice(i, 1); }
  });
});
let dragFrom = null;
$('#orgGrid').addEventListener('dragstart', e => { const t = e.target.closest('.thumb'); if (t) { dragFrom = +t.dataset.i; e.dataTransfer.effectAllowed = 'move'; } });
$('#orgGrid').addEventListener('dragover', e => { const t = e.target.closest('.thumb'); if (t && dragFrom != null) { e.preventDefault(); document.querySelectorAll('.thumb.drag-over').forEach(x => x.classList.remove('drag-over')); t.classList.add('drag-over'); } });
$('#orgGrid').addEventListener('drop', e => {
  const t = e.target.closest('.thumb');
  if (!t || dragFrom == null) return;
  e.preventDefault();
  const to = +t.dataset.i, from = dragFrom; dragFrom = null;
  if (to !== from) orgChange(() => { const [m] = S.pages.splice(from, 1); S.pages.splice(to, 0, m); });
  else renderOrganizer();
});
$('#orgGrid').addEventListener('dragend', () => { dragFrom = null; document.querySelectorAll('.thumb.drag-over').forEach(x => x.classList.remove('drag-over')); });
$('#orgBlank').onclick = () => orgChange(() => {
  const last = S.pages[S.pages.length - 1];
  const vis = last.rot % 180 ? [last.baseH, last.baseW] : [last.baseW, last.baseH];
  S.pages.push({ uid: uid(), docId: null, src: null, baseW: vis[0], baseH: vis[1], origRotate: 0, rot: 0, objects: [] });
});
$('#orgMerge').onclick = () => $('#mergeInput').click();
$('#mergeInput').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!looksLikePdf(bytes)) { toast(`${f.name} is not a PDF.`); continue; }
      const pdf = await loadPdfjs(bytes, f.name);
      S.docs.push({ bytes, pdf, numPages: pdf.numPages, name: f.name });
      const added = await pagesFromDoc(S.docs.length - 1);
      orgChange(() => S.pages.push(...added));
      toast(`Added ${added.length} page(s) from ${f.name}.`);
    } catch (err) { console.error(err); toast(`Could not add ${f.name}.`); }
  }
});
$('#orgDone').onclick = () => { $('#organizer').hidden = true; layout(); };
$('#btnPages').onclick = openOrganizer;

// ---------------------------------------------------------------- saving
function safeName(n) {
  n = String(n || 'document').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  return /\.pdf$/i.test(n) ? n : n + '.pdf';
}

function openSaveDialog() {
  closeEditor();
  const base = (S.name || 'document.pdf').replace(/\.pdf$/i, '');
  const coverCount = S.pages.filter(pageHasCovers).length;
  const hasCovers = coverCount > 0;
  showModal(`<h2>Save a new PDF</h2>
    <p class="note">Your original file is not changed. A new file is created on this device.</p>
    <label>File name<input type="text" id="saveName" value="${esc(base)}-edited.pdf"></label>
    ${hasCovers ? `<label class="check"><input type="checkbox" id="saveRemove"><span><b>Permanently remove the text I covered or replaced.</b><br>
      <span class="muted small">Without this, covered text is hidden but still inside the file and could be copied out by someone who knows how. With this, the ${coverCount} page${coverCount > 1 ? 's' : ''} with covered text ${coverCount > 1 ? 'are' : 'is'} saved as ${coverCount > 1 ? 'pictures' : 'a picture'} (text there can no longer be selected or searched, and the file gets bigger).</span></span></label>` : ''}
    <div id="saveMsg"></div>
    <div class="progress" hidden><div></div></div>
    <div class="actions"><button class="btn" id="saveCancel">Cancel</button><button class="btn primary" id="saveGo">Save</button></div>`, body => {
    body.querySelector('#saveCancel').onclick = closeModal;
    body.querySelector('#saveGo').onclick = () => doSave(body, { removeCovered: !!body.querySelector('#saveRemove')?.checked, imageMode: false });
    body.querySelector('#saveName').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') body.querySelector('#saveGo').click(); });
  });
}

async function doSave(body, opts) {
  const name = safeName(body.querySelector('#saveName').value);
  const msg = body.querySelector('#saveMsg'), bar = body.querySelector('.progress'), go = body.querySelector('#saveGo');
  go.disabled = true; bar.hidden = false; msg.innerHTML = '';
  $('#modal').dataset.locked = '1';
  const setP = (f, t) => { bar.firstElementChild.style.width = Math.round(f * 100) + '%'; msg.innerHTML = `<p class="muted small">${esc(t)}</p>`; };
  try {
    for (const p of S.pages) for (const o of p.objects) if (o.kind === 'text') await ensureFont(o);
    const bytes = await buildPdf({ docs: S.docs, pages: S.pages, assets: S.assets, getPdfPage }, { ...opts, onProgress: setP });
    setP(0.97, 'Checking the new file…');
    const check = await verifyPdf(bytes);
    if (!check.ok) throw new Error('The new file did not pass the safety check: ' + check.reason);
    download(bytes, name);
    S.unsaved = false;
    msg.innerHTML = `<p class="ok">&#10003; Saved <b>${esc(name)}</b> (${(bytes.length / 1048576).toFixed(2)} MB).<br>
      Safety check passed: the new file opens correctly and has all ${check.pages} page${check.pages > 1 ? 's' : ''}.</p>
      ${opts.imageMode ? '<p class="warn small">This file was saved with pages as pictures.</p>' : ''}
      <p class="muted small">Look in your Downloads folder. Your work also stays here, so you can keep editing.</p>`;
    bar.hidden = true;
    go.hidden = true;
    body.querySelector('#saveCancel').textContent = 'Close';
    if (navigator.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      const f = new File([bytes], name, { type: 'application/pdf' });
      if (navigator.canShare({ files: [f] })) {
        const sb = el('button', 'btn', 'Share / Open in…');
        sb.onclick = () => navigator.share({ files: [f] }).catch(() => {});
        body.querySelector('.actions').prepend(sb);
      }
    }
  } catch (e) {
    console.error(e);
    bar.hidden = true;
    if (e instanceof NeedsImageMode && !opts.imageMode) {
      msg.innerHTML = `<p class="warn">This PDF is protected or built in an unusual way, so it cannot be changed directly.
        It can still be saved with every page turned into a picture (it will look the same, but text cannot be selected or searched).</p>`;
      go.disabled = false; go.textContent = 'Save as pictures';
      go.onclick = () => doSave(body, { ...opts, imageMode: true });
    } else {
      msg.innerHTML = `<p class="err">Sorry, saving failed. Nothing was lost: your edits are still here and your original file is untouched.<br><span class="small muted">${esc(e.message || e)}</span></p>`;
      go.disabled = false;
    }
  } finally {
    delete $('#modal').dataset.locked;
  }
}

/** Re-open the produced file with a separate reader to make sure it is a valid PDF with every page. */
async function verifyPdf(bytes) {
  let doc;
  const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
  try {
    doc = await task.promise;
    if (doc.numPages !== S.pages.length) return { ok: false, reason: `expected ${S.pages.length} pages, found ${doc.numPages}` };
    for (let i = 1; i <= doc.numPages; i++) await doc.getPage(i);
    return { ok: true, pages: doc.numPages };
  } catch (e) {
    return { ok: false, reason: e.message || String(e) };
  } finally { try { await task.destroy(); } catch {} }
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('#btnSave').onclick = openSaveDialog;

// ---------------------------------------------------------------- help
$('#btnHelp').onclick = () => showModal(`<h2>How to use</h2>
  <ul>
    <li><b>Change existing text:</b> choose <i>Edit text</i>, click a line, type. Clear it to delete it. Pick another font from the bar at the top.</li>
    <li><b>Add text:</b> choose <i>Add text</i> and click the page.</li>
    <li><b>Fonts:</b> click the font name. Search, use <i>Show all fonts on this device</i> (Chrome/Edge on a computer), or <i>Add a font file</i> (.ttf/.otf/.woff) for any language.</li>
    <li><b>Pages:</b> the <i>Pages</i> button lets you reorder, rotate, duplicate, delete, add blank pages and add pages from other PDFs.</li>
    <li><b>Find:</b> search the whole document and replace words everywhere at once.</li>
    <li><b>Original:</b> hold the eye button to compare with the original.</li>
    <li>Shortcuts: Ctrl+Z undo, Ctrl+Y redo, Delete removes the selected item, arrow keys nudge it, Ctrl+S saves.</li>
  </ul>
  <h2>Privacy and safety</h2>
  <ul>
    <li>Your files are read and saved only inside this browser. The page is locked by a browser security rule so it cannot send data to other websites.</li>
    <li>Your original file is never changed: saving makes a new file and checks that it opens.</li>
    <li>While you work, a copy of the document and your edits is kept in this browser so you can continue after closing the tab. Use <i>Close file</i> below to remove it.</li>
  </ul>
  <h2>Good to know</h2>
  <ul>
    <li>Text you add or change is saved as a sharp picture of the text, so it cannot be selected or searched in the saved PDF. The rest of the page stays as it was.</li>
    <li>Replaced or whited-out text is covered, not erased, unless you tick <i>Permanently remove</i> when saving.</li>
    <li>Scanned pages are pictures: their words cannot be edited, only covered and typed over.</li>
  </ul>
  <div class="actions"><button class="btn danger" id="helpForget">Close file and forget it</button><button class="btn primary" id="helpOk">OK</button></div>`, body => {
  body.querySelector('#helpOk').onclick = closeModal;
  body.querySelector('#helpForget').onclick = async () => {
    closeModal();
    if (S.unsaved && S.pages.length) {
      const ok = await ask('Close this file?', 'Changes not saved as a PDF will be lost, and the copy kept in this browser will be removed.', [
        { label: 'Cancel', value: false }, { label: 'Close and forget', value: true, primary: true }]);
      if (!ok) return;
    }
    await kvDel('session');
    resetDoc();
    document.body.classList.remove('has-doc');
    $('#fileName').textContent = ''; $('#zoomBox').hidden = true; $('#propsBar').hidden = true;
    pagesEl.innerHTML = ''; slots.clear(); updateButtons(); checkResume();
    toast('Closed. Nothing about that file is kept in this browser.');
  };
});

// ---------------------------------------------------------------- show original
const origBtn = $('#btnOriginal');
let origLatched = false;
origBtn.addEventListener('pointerdown', () => { closeEditor(); document.body.classList.add('show-original'); });
const origUp = () => { if (!origLatched) document.body.classList.remove('show-original'); };
origBtn.addEventListener('pointerup', origUp); origBtn.addEventListener('pointerleave', origUp);
origBtn.addEventListener('click', e => {
  if (e.detail === 0) { origLatched = !origLatched; document.body.classList.toggle('show-original', origLatched); origBtn.classList.toggle('on', origLatched); }
});

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (S.pages.length) openSaveDialog(); }
  else if (mod && e.key.toLowerCase() === 'f') { if (S.pages.length) { e.preventDefault(); toggleFind(true); } }
  else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#fileInput').click(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selected()) { e.preventDefault(); const s = selected(); deleteObj(s.p, s.o); }
  else if (e.key === 'Escape') { if (S.sel) select(null, null); }
  else if (e.key.startsWith('Arrow') && selected()) {
    e.preventDefault();
    const { p, o } = selected();
    const before = snap();
    const st = e.shiftKey ? 5 : 0.5;
    const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
    o.x += dx;
    if (o.kind === 'text') { o.baseline += dy; updateTextBox(o); } else o.y += dy;
    commitFrom(before); refreshPage(p.uid);
  }
});

// ---------------------------------------------------------------- open buttons, drag & drop, resume
$('#btnOpen').onclick = () => $('#fileInput').click();
$('#btnOpen2').onclick = () => $('#fileInput').click();
$('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f); });
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;
['dragover', 'dragenter'].forEach(t => document.addEventListener(t, e => {
  if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); $('#dropZone').classList.add('over'); }
}));
document.addEventListener('dragleave', e => { if (!e.relatedTarget) $('#dropZone').classList.remove('over'); });
document.addEventListener('drop', e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault(); $('#dropZone').classList.remove('over');
  const f = [...e.dataTransfer.files].find(x => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name));
  if (f) openFile(f); else toast('Please drop a PDF file.');
});
window.addEventListener('beforeunload', e => { if (S.unsaved && S.pages.length) { e.preventDefault(); e.returnValue = ''; } });

async function checkResume() {
  const s = await kvGet('session');
  const box = $('#resumeBox');
  if (!s || !s.docs) { box.hidden = true; return; }
  $('#resumeName').textContent = s.name;
  $('#resumeTime').textContent = new Date(s.savedAt).toLocaleString();
  box.hidden = false;
}
$('#btnResume').onclick = () => resumeSession();
$('#btnDiscard').onclick = async () => { await kvDel('session'); $('#resumeBox').hidden = true; toast('Removed from this browser.'); };

// ---------------------------------------------------------------- start
(async function start() {
  await initFonts();
  const sansGuess = ['Arial', 'Helvetica', 'Roboto', 'Liberation Sans', 'DejaVu Sans'].find(isFontAvailable);
  if (sansGuess) S.defaults.text.font = sansGuess;
  setTool('edit');
  updateButtons();
  checkResume();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Offline mode not available', err));
  }
  window.__ppe = { S, userFontNames }; // for automated tests
})();
