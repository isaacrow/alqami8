/**
 * Persistent Deleted Items Store for ALQAMI (alqami.net).
 *
 * - Immediately saves deleted artifact IDs to `localStorage` + `IndexedDB`
 *   so deleted items stay hidden across page reloads and restarts until restored.
 * - Automatically syncs with the ALQAMI backend Worker (`GET/PUT /deleted`) when configured.
 * - Broadcasts `alqami:deleted-changed` + `storage` events so all tabs stay in sync.
 */

import { getMoonSession } from '../moon/moonAuth';

const STORAGE_KEY = 'alqami.deleted.v1';
const IDB_NAME = 'alqami-user-state';
const IDB_STORE = 'favorites';
const IDB_KEY = 'deleted_ids';

export interface DeletedItemsState {
  ids: string[];
  updatedAt: number;
}

function getBackendDeletedUrl(): string | null {
  try {
    const envUrl = (import.meta as any).env?.VITE_FAVORITES_API_URL as string | undefined;
    if (envUrl && envUrl.trim()) {
      return envUrl.trim().replace(/\/favorites\/?$/, '/deleted').replace(/\/+$/, '');
    }
    const storedWorker = localStorage.getItem('alqami.worker.url');
    if (storedWorker && storedWorker.trim()) {
      return `${storedWorker.trim().replace(/\/+$/, '')}/deleted`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getOwnerKey(): string {
  const session = getMoonSession();
  return session?.user?.id || 'isaac-owner';
}

function readLocalDeleted(): DeletedItemsState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { ids: parsed.filter((x) => typeof x === 'string'), updatedAt: Date.now() };
    }
    if (parsed && Array.isArray(parsed.ids)) {
      return {
        ids: parsed.ids.filter((x: unknown) => typeof x === 'string'),
        updatedAt: Number(parsed.updatedAt) || 0,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocalDeleted(state: DeletedItemsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function openStateDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIdbDeleted(): Promise<DeletedItemsState | null> {
  const db = await openStateDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result as DeletedItemsState | undefined;
        resolve(val && Array.isArray(val.ids) ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIdbDeleted(state: DeletedItemsState): Promise<void> {
  const db = await openStateDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(state, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function fetchBackendDeleted(): Promise<DeletedItemsState | null> {
  const baseUrl = getBackendDeletedUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}?user=${encodeURIComponent(getOwnerKey())}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.ids)) {
      return {
        ids: data.ids.filter((x: unknown) => typeof x === 'string'),
        updatedAt: Number(data.updatedAt) || Date.now(),
      };
    }
  } catch {
    /* offline */
  }
  return null;
}

async function pushBackendDeleted(state: DeletedItemsState): Promise<boolean> {
  const baseUrl = getBackendDeletedUrl();
  if (!baseUrl) return false;
  try {
    const res = await fetch(`${baseUrl}?user=${encodeURIComponent(getOwnerKey())}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function idsToDeletedRecord(ids: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of ids) out[id] = true;
  return out;
}

export function getInitialDeletedMap(): Record<string, boolean> {
  const local = readLocalDeleted();
  return idsToDeletedRecord(local ? local.ids : []);
}

export async function hydrateDeletedItems(): Promise<Record<string, boolean>> {
  const local = readLocalDeleted();
  const [idb, remote] = await Promise.all([readIdbDeleted(), fetchBackendDeleted()]);
  const candidates = [local, idb, remote].filter((c): c is DeletedItemsState => Boolean(c));
  if (candidates.length === 0) return {};
  candidates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const winner = candidates[0];
  writeLocalDeleted(winner);
  void writeIdbDeleted(winner);
  if (!remote || (winner.updatedAt || 0) > (remote.updatedAt || 0)) {
    void pushBackendDeleted(winner);
  }
  return idsToDeletedRecord(winner.ids);
}

export function saveDeletedMap(map: Record<string, boolean>): DeletedItemsState {
  const ids = Object.keys(map).filter((k) => Boolean(map[k]));
  const state: DeletedItemsState = { ids, updatedAt: Date.now() };
  writeLocalDeleted(state);
  void writeIdbDeleted(state);
  void pushBackendDeleted(state);
  try {
    window.dispatchEvent(new CustomEvent('alqami:deleted-changed', { detail: state }));
  } catch {
    /* ignore */
  }
  return state;
}

export function subscribeDeletedItems(onChange: (map: Record<string, boolean>) => void): () => void {
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<DeletedItemsState>).detail;
    if (detail && Array.isArray(detail.ids)) {
      onChange(idsToDeletedRecord(detail.ids));
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      const local = readLocalDeleted();
      if (local) onChange(idsToDeletedRecord(local.ids));
    }
  };
  window.addEventListener('alqami:deleted-changed', onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('alqami:deleted-changed', onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
