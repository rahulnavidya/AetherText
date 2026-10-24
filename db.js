const DB_NAME = 'aethertext-local';
const DB_VERSION = 2;
const STORE_NAME = 'workspace';
const HISTORY_STORE = 'history';
const HISTORY_TOTAL_LIMIT = 120;
let databasePromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const history = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        history.createIndex('byTabId', 'tabId', { unique: false });
      } else {
        const history = request.transaction.objectStore(HISTORY_STORE);
        if (!history.indexNames.contains('byTabId')) history.createIndex('byTabId', 'tabId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Could not open local database.'));
    request.onblocked = () => reject(new Error('The local database is blocked by another open tab.'));
  });
  databasePromise.catch(() => { databasePromise = undefined; });
  return databasePromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database request failed.'));
  });
}

function transactionToPromise(transaction, message) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error(message));
    transaction.onabort = () => reject(transaction.error || new Error(message));
  });
}

export async function readWorkspace() {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  return (await requestToPromise(transaction.objectStore(STORE_NAME).get('current'))) ?? null;
}

export async function writeWorkspace(workspace) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(workspace, 'current');
  await transactionToPromise(transaction, 'Could not save the workspace.');
}

export async function listHistory(tabId, limit = 40) {
  if (!tabId) return [];
  const db = await openDatabase();
  const transaction = db.transaction(HISTORY_STORE, 'readonly');
  const records = await requestToPromise(transaction.objectStore(HISTORY_STORE).index('byTabId').getAll(IDBKeyRange.only(tabId)));
  return records.sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.max(1, limit));
}

export async function writeHistoryVersion(version, limit = 40) {
  if (!version?.id || !version?.tabId || typeof version.text !== 'string') throw new TypeError('A history version requires id, tabId, and text.');
  const db = await openDatabase();
  const transaction = db.transaction(HISTORY_STORE, 'readwrite');
  const store = transaction.objectStore(HISTORY_STORE);
  const allRequest = store.getAll();
  allRequest.onsuccess = () => {
    const records = allRequest.result.filter((entry) => entry.id !== version.id);
    const combined = [...records, version];
    const byTab = combined.filter((entry) => entry.tabId === version.tabId).sort((a, b) => b.createdAt - a.createdAt);
    const keepForTab = new Set(byTab.slice(0, Math.max(1, limit)).map((entry) => entry.id));
    const keepGlobally = new Set([...combined].sort((a, b) => b.createdAt - a.createdAt).slice(0, HISTORY_TOTAL_LIMIT).map((entry) => entry.id));
    store.put(version);
    for (const entry of records) {
      if (!keepGlobally.has(entry.id) || (entry.tabId === version.tabId && !keepForTab.has(entry.id))) store.delete(entry.id);
    }
  };
  await transactionToPromise(transaction, 'Could not save document history.');
}

export async function clearHistory(tabId) {
  const db = await openDatabase();
  const transaction = db.transaction(HISTORY_STORE, 'readwrite');
  const store = transaction.objectStore(HISTORY_STORE);
  if (tabId) {
    const request = store.index('byTabId').getAllKeys(IDBKeyRange.only(tabId));
    request.onsuccess = () => request.result.forEach((key) => store.delete(key));
  } else {
    store.clear();
  }
  await transactionToPromise(transaction, 'Could not clear document history.');
}

export async function clearWorkspace() {
  const db = await openDatabase();
  const transaction = db.transaction([STORE_NAME, HISTORY_STORE], 'readwrite');
  transaction.objectStore(STORE_NAME).delete('current');
  transaction.objectStore(HISTORY_STORE).clear();
  await transactionToPromise(transaction, 'Could not clear the workspace.');
}
