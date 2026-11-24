// Keeps work in this browser's own storage (IndexedDB) so nothing is lost if the tab closes.
// Nothing here leaves the device.
const DB = 'private-pdf-editor';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 2); // 2: adds remembered signatures
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['file', 'work', 'fonts', 'signs']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const saveFile = (name, bytes) => tx('file', 'readwrite', (s) => s.put({ name, bytes, size: bytes.length }, 'current'));
export const saveWork = (work) => tx('work', 'readwrite', (s) => s.put(work, 'current'));
export const loadFile = () => tx('file', 'readonly', (s) => s.get('current'));
export const loadWork = () => tx('work', 'readonly', (s) => s.get('current'));
export async function forget() {
  await tx('file', 'readwrite', (s) => s.delete('current'));
  await tx('work', 'readwrite', (s) => s.delete('current'));
}
export const saveFont = (family, data) => tx('fonts', 'readwrite', (s) => s.put({ family, data }, family));
export const loadFonts = () => tx('fonts', 'readonly', (s) => s.getAll());
export const saveSign = (sign) => tx('signs', 'readwrite', (s) => s.put(sign, sign.id));
export const loadSigns = () => tx('signs', 'readonly', (s) => s.getAll());
export const deleteSign = (id) => tx('signs', 'readwrite', (s) => s.delete(id));
