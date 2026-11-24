// Tiny IndexedDB wrapper. Everything is stored only inside this browser on this device.
const DB_NAME = 'private-pdf-editor';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('fonts')) db.createObjectStore('fonts', { keyPath: 'name' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const kvGet = key => tx('kv', 'readonly', s => s.get(key)).catch(() => undefined);
export const kvSet = (key, val) => tx('kv', 'readwrite', s => s.put(val, key));
export const kvDel = key => tx('kv', 'readwrite', s => s.delete(key)).catch(() => {});
export const fontsAll = () => tx('fonts', 'readonly', s => s.getAll()).catch(() => []);
export const fontPut = rec => tx('fonts', 'readwrite', s => s.put(rec));
export const fontDel = name => tx('fonts', 'readwrite', s => s.delete(name));
