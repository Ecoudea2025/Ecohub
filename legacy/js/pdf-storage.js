// econhub · pdf-storage.js — Almacenamiento binario nativo en IndexedDB para documentos PDF y recientes
// Elimina límites de cuota de localStorage y previene corrupción de datos binarios

const DB_NAME = 'econhub_db';
const DB_VERSION = 1;
const STORE_PDFS = 'pdf_documents';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB no soportado en este navegador'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
  });
}

export const pdfStorage = {
  async save(key, name, uint8Array, numPages = 0) {
    try {
      if (!uint8Array) return false;
      let bufferData;

      if (uint8Array instanceof Uint8Array) {
        if (!uint8Array.buffer || uint8Array.buffer.byteLength === 0) {
          console.warn('[pdfStorage.save] buffer está desconectado o vacío');
          return false;
        }
        try {
          bufferData = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
        } catch {
          const copy = new Uint8Array(uint8Array.length);
          copy.set(uint8Array);
          bufferData = copy.buffer;
        }
      } else if (uint8Array instanceof ArrayBuffer) {
        if (uint8Array.byteLength === 0) return false;
        bufferData = uint8Array.slice(0);
      } else {
        bufferData = uint8Array;
      }

      const size = bufferData?.byteLength || 0;
      if (!size) return false;

      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PDFS, 'readwrite');
        const store = tx.objectStore(STORE_PDFS);
        const record = {
          key,
          name,
          data: bufferData,
          size,
          numPages,
          updatedAt: Date.now(),
        };
        store.put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[pdfStorage.save error]', err);
      return false;
    }
  },

  async load(key) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PDFS, 'readonly');
        const store = tx.objectStore(STORE_PDFS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (!req.result || !req.result.data) return resolve(null);
          const raw = req.result.data;
          const uint8 = new Uint8Array(raw);
          resolve({
            key: req.result.key,
            name: req.result.name,
            uint8,
            size: req.result.size || uint8.length,
            numPages: req.result.numPages || 0,
          });
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[pdfStorage.load error]', err);
      return null;
    }
  },

  async delete(key) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PDFS, 'readwrite');
        const store = tx.objectStore(STORE_PDFS);
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return false;
    }
  },

  async list() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PDFS, 'readonly');
        const store = tx.objectStore(STORE_PDFS);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []).map((r) => ({
            key: r.key,
            name: r.name,
            size: r.size || (r.data?.byteLength || 0),
            numPages: r.numPages || 0,
            updatedAt: r.updatedAt || 0,
          }));
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  },
};
