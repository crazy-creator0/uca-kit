// Fonts: anything the browser can draw can be used, because edited text is drawn by the browser
// and stored in the PDF as a picture. Sources: fonts installed on the device, and font files the user adds.
import { fontsAll, fontPut, fontDel } from './store.js';

export const GENERIC = ['sans-serif', 'serif', 'monospace', 'cursive'];

// Common fonts across Windows, macOS, Android, iOS and Linux, including many non-Latin scripts.
const COMMON = [
  'Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Times', 'Georgia', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Courier New', 'Courier', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel', 'Segoe UI', 'Segoe Script',
  'Garamond', 'Palatino Linotype', 'Palatino', 'Book Antiqua', 'Bookman Old Style', 'Century Gothic', 'Franklin Gothic Medium',
  'Gill Sans', 'Optima', 'Futura', 'Avenir', 'Baskerville', 'Didot', 'American Typewriter', 'Lucida Sans Unicode', 'Lucida Grande',
  'Comic Sans MS', 'Impact', 'Brush Script MT', 'Snell Roundhand', 'Bradley Hand', 'Lucida Handwriting', 'Ink Free',
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro', 'Ubuntu', 'Cantarell', 'DejaVu Sans', 'DejaVu Serif',
  'DejaVu Sans Mono', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'Noto Sans', 'Noto Serif', 'Noto Sans Mono',
  'Arial Unicode MS', 'Nirmala UI', 'Mangal', 'Kokila', 'Aparajita', 'Latha', 'Vijaya', 'Gautami', 'Tunga', 'Kartika', 'Shruti', 'Vrinda',
  'Kohinoor Devanagari', 'Devanagari Sangam MN', 'Tamil Sangam MN', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu',
  'Noto Sans Kannada', 'Noto Sans Malayalam', 'Noto Sans Bengali', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi',
  'Noto Sans Arabic', 'Noto Naskh Arabic', 'Arabic Typesetting', 'Traditional Arabic', 'Simplified Arabic', 'Geeza Pro',
  'Noto Sans Hebrew', 'David', 'Narkisim', 'Noto Sans Thai', 'Leelawadee UI', 'Tahoma',
  'Microsoft YaHei', 'SimSun', 'SimHei', 'PingFang SC', 'PingFang TC', 'Heiti SC', 'Noto Sans CJK SC', 'Noto Sans SC', 'Noto Serif CJK SC',
  'MS Gothic', 'MS Mincho', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Hiragino Mincho ProN', 'Noto Sans JP', 'Noto Sans CJK JP',
  'Malgun Gothic', 'Batang', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans CJK KR',
  'Sylfaen', 'Ebrima', 'Gadugi', 'Myanmar Text', 'Khmer UI', 'Noto Sans Ethiopic', 'Noto Sans Georgian', 'Noto Sans Armenian',
  'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji', 'Segoe UI Symbol',
];

const state = {
  available: [],          // common fonts found on this device
  device: [],             // full list from the Local Font Access API (if the user allowed it)
  user: [],               // font files the user added: [{name}]
  recent: [],
};

const testCtx = document.createElement('canvas').getContext('2d');
const SAMPLE = 'mmmmmmmmmmlliWW@#0OQgjy';
function width(font) { testCtx.font = font; return testCtx.measureText(SAMPLE).width; }
const baseMono = width('72px monospace'), baseSerif = width('72px serif'), baseSans = width('72px sans-serif');

export function isFontAvailable(family) {
  if (GENERIC.includes(family)) return true;
  if (state.user.some(f => f.name === family)) return true;
  const q = cssFamily(family);
  return width(`72px ${q}, monospace`) !== baseMono || width(`72px ${q}, serif`) !== baseSerif || width(`72px ${q}, sans-serif`) !== baseSans;
}

export function cssFamily(family) {
  if (GENERIC.includes(family)) return family;
  return '"' + String(family).replace(/["\\]/g, '') + '"';
}

/** CSS / canvas font string. */
export function fontString(o, sizePx) {
  const fam = cssFamily(o.font || 'sans-serif');
  const fallback = /serif/i.test(o.font) && !/sans/i.test(o.font) ? 'serif' : 'sans-serif';
  return `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${sizePx}px ${fam}, ${fallback}`;
}

export async function initFonts() {
  const seen = new Set();
  state.available = COMMON.filter(f => { if (seen.has(f)) return false; seen.add(f); return isFontAvailable(f); });
  try {
    const recs = await fontsAll();
    for (const r of recs) {
      try {
        const ff = new FontFace(r.name, r.bytes);
        await ff.load();
        document.fonts.add(ff);
        state.user.push({ name: r.name });
      } catch (e) { console.warn('Could not load saved font', r.name, e); }
    }
  } catch { /* storage not available */ }
  try { state.recent = JSON.parse(localStorage.getItem('ppe-recent-fonts') || '[]'); } catch { state.recent = []; }
}

export function rememberFont(name) {
  state.recent = [name, ...state.recent.filter(n => n !== name)].slice(0, 8);
  try { localStorage.setItem('ppe-recent-fonts', JSON.stringify(state.recent)); } catch {}
}

export async function addFontFiles(files) {
  const added = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    let name = file.name.replace(/\.(ttf|otf|woff2?|ttc)$/i, '').replace(/[_]+/g, ' ').trim() || 'My font';
    let n = name, i = 2;
    while (state.user.some(f => f.name === n)) n = `${name} (${i++})`;
    try {
      const ff = new FontFace(n, bytes);
      await ff.load();
      document.fonts.add(ff);
      state.user.push({ name: n });
      added.push(n);
      try { await fontPut({ name: n, bytes }); } catch {}
    } catch (e) {
      throw new Error(`"${file.name}" is not a font file this browser can read.`);
    }
  }
  return added;
}

export async function removeUserFont(name) {
  state.user = state.user.filter(f => f.name !== name);
  try { await fontDel(name); } catch {}
}

export const canListDeviceFonts = () => 'queryLocalFonts' in window;

export async function listDeviceFonts() {
  const fonts = await window.queryLocalFonts();
  const fams = new Set(fonts.map(f => f.family));
  state.device = [...fams].sort((a, b) => a.localeCompare(b));
  return state.device.length;
}

export function fontGroups() {
  const groups = [];
  if (state.recent.length) groups.push(['Recently used', state.recent]);
  if (state.user.length) groups.push(['Your font files', state.user.map(f => f.name)]);
  groups.push(['Basic', GENERIC]);
  if (state.device.length) groups.push(['All fonts on this device', state.device]);
  else groups.push(['Found on this device', state.available]);
  return groups;
}

export const userFontNames = () => state.user.map(f => f.name);

/**
 * Guess a usable font from a PDF font name like "ABCDEF+TimesNewRomanPS-BoldItalicMT".
 * Returns {font, bold, italic}. If the exact font is not installed, a similar generic one is used.
 */
export function guessFont(pdfName, genericHint) {
  let name = String(pdfName || '').replace(/^[A-Z]{6}\+/, '');
  const bold = /bold|black|heavy|semibold|demi/i.test(name);
  const italic = /italic|oblique|-it\b|kursiv/i.test(name);
  let base = name.split(/[-,]/)[0]
    .replace(/(PSMT|PS|MT|Std|Pro|LT|OT)$/g, '')
    .replace(/(Bold|Italic|Regular|Oblique|Roman)$/i, '');
  const spaced = base.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const candidates = [spaced, base, name.split(/[-,]/)[0]];
  const known = {
    'Times New Roman': ['Times New Roman', 'Times', 'Liberation Serif', 'DejaVu Serif', 'serif'],
    'Times': ['Times New Roman', 'Times', 'Liberation Serif', 'serif'],
    'Arial': ['Arial', 'Helvetica', 'Liberation Sans', 'DejaVu Sans', 'sans-serif'],
    'Helvetica': ['Helvetica', 'Arial', 'Liberation Sans', 'sans-serif'],
    'Courier': ['Courier New', 'Courier', 'Liberation Mono', 'monospace'],
    'Courier New': ['Courier New', 'Courier', 'Liberation Mono', 'monospace'],
    'Calibri': ['Calibri', 'Carlito', 'Arial', 'sans-serif'],
    'Cambria': ['Cambria', 'Caladea', 'Georgia', 'serif'],
  };
  for (const c of candidates) {
    if (!c) continue;
    const list = known[c] || [c];
    for (const f of list) if (isFontAvailable(f)) return { font: f, bold, italic };
  }
  let generic = genericHint && GENERIC.includes(genericHint) ? genericHint : null;
  if (!generic) generic = /times|serif|roman|georgia|garamond|cambria|book|minion|palatino/i.test(name) && !/sans/i.test(name) ? 'serif'
    : /courier|mono|consol/i.test(name) ? 'monospace' : 'sans-serif';
  return { font: generic, bold, italic };
}
