// Fonts: which fonts this device has, guessing the original font of PDF text, and fonts the user adds from files.
import { saveFont, loadFonts } from './store.js';

// Common fonts across Windows, macOS, Linux, Android and iOS, including many scripts.
const CANDIDATES = [
  // Latin and general
  'Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Times', 'Georgia', 'Garamond', 'Palatino Linotype', 'Palatino',
  'Book Antiqua', 'Cambria', 'Calibri', 'Candara', 'Constantia', 'Corbel', 'Segoe UI', 'Tahoma', 'Verdana', 'Trebuchet MS',
  'Century Gothic', 'Franklin Gothic Medium', 'Gill Sans', 'Futura', 'Optima', 'Avenir', 'Baskerville', 'Didot',
  'Courier New', 'Courier', 'Consolas', 'Lucida Console', 'Menlo', 'Monaco', 'Comic Sans MS', 'Impact', 'Aptos',
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro', 'Ubuntu', 'Cantarell', 'Fira Sans', 'DM Sans',
  'Noto Sans', 'Noto Serif', 'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'Liberation Sans', 'Liberation Serif',
  'Liberation Mono', 'Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine', 'FreeSans', 'FreeSerif', 'Crimson Text', 'Cardo',
  // South Asian
  'Nirmala UI', 'Mangal', 'Kokila', 'Aparajita', 'Utsaah', 'Latha', 'Vijaya', 'Gautami', 'Tunga', 'Kartika', 'Shruti',
  'Raavi', 'Vrinda', 'Kalinga', 'Iskoola Pota', 'Kohinoor Devanagari', 'Devanagari Sangam MN', 'Tamil Sangam MN',
  'Noto Sans Devanagari', 'Noto Serif Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Kannada',
  'Noto Sans Malayalam', 'Noto Sans Bengali', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi', 'Noto Sans Oriya',
  'Noto Sans Sinhala', 'Lohit Devanagari', 'Lohit Tamil', 'Lohit Bengali', 'Gargi', 'Samanata',
  // Middle East
  'Arial Unicode MS', 'Traditional Arabic', 'Simplified Arabic', 'Sakkal Majalla', 'Geeza Pro', 'Noto Naskh Arabic',
  'Noto Sans Arabic', 'Amiri', 'David', 'Noto Sans Hebrew', 'Vazirmatn',
  // East Asian
  'Microsoft YaHei', 'Microsoft JhengHei', 'SimSun', 'SimHei', 'KaiTi', 'PingFang SC', 'PingFang TC', 'Hiragino Sans',
  'Hiragino Mincho ProN', 'Yu Gothic', 'Yu Mincho', 'Meiryo', 'MS Gothic', 'MS Mincho', 'Malgun Gothic',
  'Apple SD Gothic Neo', 'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Noto Sans CJK KR', 'Noto Sans JP', 'Noto Sans KR',
  'Noto Sans SC', 'Noto Serif CJK SC', 'IPAGothic', 'IPAMincho', 'WenQuanYi Zen Hei', 'Droid Sans Fallback',
  // South-East Asia, Africa, others
  'Leelawadee UI', 'Leelawadee', 'Thonburi', 'Noto Sans Thai', 'Khmer UI', 'Myanmar Text', 'Ebrima', 'Nyala', 'Gadugi',
  'Sylfaen', 'Noto Sans Georgian', 'Noto Sans Armenian', 'Noto Sans Ethiopic',
];

// Mixed-script sample: a font counts as present if it changes the width of any part of it.
const SAMPLE = 'mmmmwwlli 0123 ऄअकि தமிழ் ಕನ್ನಡ বাংলা عربي עברית 中文字 あア 한국 ไทย';
const ctx = document.createElement('canvas').getContext('2d');
const cache = new Map();

export function isAvailable(family) {
  if (cache.has(family)) return cache.get(family);
  let found = false;
  for (const base of ['monospace', 'serif', 'sans-serif']) {
    ctx.font = `40px ${base}`;
    const a = ctx.measureText(SAMPLE).width;
    ctx.font = `40px "${family.replace(/"/g, '')}", ${base}`;
    if (Math.abs(ctx.measureText(SAMPLE).width - a) > 0.5) { found = true; break; }
  }
  cache.set(family, found);
  return found;
}

export const fontState = { device: [], local: [], custom: [] };

export function scanDeviceFonts() {
  fontState.device = CANDIDATES.filter(isAvailable);
  return fontState.device;
}

// Chrome/Edge on a computer can list every installed font, after the user agrees in a browser prompt.
export const canListAllFonts = typeof window.queryLocalFonts === 'function';
export async function listAllLocalFonts() {
  const list = await window.queryLocalFonts();
  const fams = [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
  fontState.local = fams;
  return fams;
}

async function registerFont(family, data) {
  const face = new FontFace(family, data);
  await face.load();
  document.fonts.add(face);
  cache.set(family, true);
}

// Adds a font file chosen by the user. It is kept in this browser so it is there next time.
export async function addFontFile(file) {
  const data = await file.arrayBuffer();
  let family = file.name.replace(/\.(ttf|otf|woff2?|ttc)$/i, '').replace(/[^\p{L}\p{N} _-]/gu, ' ').trim() || 'My font';
  let n = 2;
  while (fontState.custom.includes(family)) family = `${family} ${n++}`;
  await registerFont(family, data);
  fontState.custom.push(family);
  try { await saveFont(family, data); } catch { /* still usable this session */ }
  return family;
}

export async function restoreCustomFonts() {
  let rows = [];
  try { rows = await loadFonts(); } catch { return; }
  for (const r of rows) {
    try { await registerFont(r.family, r.data); fontState.custom.push(r.family); } catch { /* skip broken file */ }
  }
}

// Turns a PDF font name like "ABCDEF+TimesNewRomanPS-BoldItalicMT" into a font we can draw with.
const MAP = [
  [/times|tinos|liberationserif|nimbusrom/i, ['Times New Roman', 'Times', 'Liberation Serif', 'Tinos', 'FreeSerif', 'DejaVu Serif']],
  [/arial|helvetica|arimo|liberationsans|nimbussans|freesans/i, ['Arial', 'Helvetica', 'Liberation Sans', 'Arimo', 'FreeSans']],
  [/courier|cousine|liberationmono|nimbusmono/i, ['Courier New', 'Courier', 'Liberation Mono', 'Cousine', 'DejaVu Sans Mono']],
  [/calibri|carlito/i, ['Calibri', 'Carlito']],
  [/cambria|caladea/i, ['Cambria', 'Caladea']],
  [/georgia/i, ['Georgia']], [/verdana/i, ['Verdana']], [/garamond/i, ['Garamond']], [/tahoma/i, ['Tahoma']],
  [/segoe/i, ['Segoe UI']], [/roboto/i, ['Roboto']], [/opensans/i, ['Open Sans']], [/lato/i, ['Lato']],
  [/dejavusansmono/i, ['DejaVu Sans Mono']], [/dejavuserif/i, ['DejaVu Serif']], [/dejavusans/i, ['DejaVu Sans']],
  [/notoserif/i, ['Noto Serif']], [/notosans/i, ['Noto Sans']], [/aptos/i, ['Aptos']],
];
const GENERIC = {
  serif: ['Times New Roman', 'Times', 'Liberation Serif', 'Noto Serif', 'DejaVu Serif', 'Georgia'],
  'sans-serif': ['Arial', 'Helvetica', 'Liberation Sans', 'Noto Sans', 'DejaVu Sans', 'Segoe UI', 'Roboto'],
  monospace: ['Courier New', 'Courier', 'Liberation Mono', 'DejaVu Sans Mono', 'Menlo', 'Consolas'],
};

export function guessFont(pdfFontName, genericFamily) {
  const raw = String(pdfFontName || '').replace(/^[A-Z]{6}\+/, '');
  const flat = raw.replace(/[\s_-]/g, '');
  const bold = /bold|black|heavy|semibold|demi|,bd|-bd/i.test(raw);
  const italic = /italic|oblique|,it\b|-it\b/i.test(raw);
  let family = null;
  for (const [re, options] of MAP) {
    if (re.test(flat)) { family = options.find(isAvailable) || null; if (family) break; }
  }
  if (!family && raw) {
    // Try the PDF's own family name, e.g. "SourceSansPro-Regular" -> "Source Sans Pro"
    const base = raw.split(/[-,]/)[0];
    const spaced = base.replace(/(PS|MT)$/g, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    family = [base, spaced].find((f) => f && isAvailable(f)) || null;
  }
  if (!family) {
    let g = 'sans-serif';
    if (/serif/i.test(genericFamily) && !/sans/i.test(genericFamily)) g = 'serif';
    if (/mono/i.test(genericFamily)) g = 'monospace';
    if (/serif|roman|mincho|song|book/i.test(flat) && !/sans/i.test(flat)) g = 'serif';
    family = GENERIC[g].find(isAvailable) || g;
  }
  return { family, bold, italic, original: raw };
}
