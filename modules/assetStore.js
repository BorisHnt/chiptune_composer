const DB_NAME = "chiptune_composer_assets_v1";
const STORE_NAME = "assets";
const DB_VERSION = 1;
const memoryStore = new Map();

function openDatabase() {
  if (!window.indexedDB) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(mode, operation) {
  let db;
  try {
    db = await openDatabase();
  } catch (error) {
    console.warn("IndexedDB unavailable, using memory storage", error);
    return null;
  }
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;
    try {
      request = operation(store);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function fallbackHash(bytes) {
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function createAssetId(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `audio_${hex.slice(0, 24)}`;
  }
  return `audio_${fallbackHash(bytes)}_${bytes.byteLength}`;
}

export async function putAsset({ id, name, type, blob }) {
  const record = {
    id,
    name: name || "Sample",
    type: type || blob?.type || "application/octet-stream",
    blob,
    updatedAt: Date.now(),
  };
  memoryStore.set(id, record);
  const result = await runTransaction("readwrite", (store) => store.put(record));
  return result ?? id;
}

export async function getAsset(id) {
  if (!id) return null;
  const result = await runTransaction("readonly", (store) => store.get(id));
  return result || memoryStore.get(id) || null;
}

export async function deleteAsset(id) {
  memoryStore.delete(id);
  await runTransaction("readwrite", (store) => store.delete(id));
}

export async function clearAssets() {
  memoryStore.clear();
  await runTransaction("readwrite", (store) => store.clear());
}
