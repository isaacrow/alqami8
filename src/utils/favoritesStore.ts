/**
 * Persistent Favorites Store for ALQAMI (alqami.net).
 *
 * - Immediately saves every favorited artifact ID to BOTH `localStorage` and `IndexedDB`
 *   so favorites persist across reloads, restarts, and offline use until explicitly removed.
 * - Automatically syncs with the ALQAMI backend Worker (`GET/PUT /favorites`) when configured
 *   (via `VITE_FAVORITES_API_URL` or `localStorage.getItem('alqami.worker.url')`),
 *   keyed by the signed-in owner account (`isaac-owner`).
 * - Broadcasts `alqami:favorites-changed` + `storage` events so all open pages
 *   (`index.html`, `object.html`, `kafeel-scan.html`) stay in sync instantly.
 */

import { getMoonSession } from '../moon/moonAuth';

const STORAGE_KEY = 'alqami.favorites.v1';
const IDB_NAME = 'alqami-user-state';
const IDB_STORE = 'favorites';
const IDB_KEY = 'saved_ids';

export interface FavoritesState {
  ids: string[];
  updatedAt: number;
}

const DEFAULT_FAVORITES: string[] = [];

function getBackendFavoritesUrl(): string | null {
  try {
    const envUrl = (import.meta as any).env?.VITE_FAVORITES_API_URL as string | undefined;
    if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/+$/, '');
    const storedWorker = localStorage.getItem('alqami.worker.url');
    if (storedWorker && storedWorker.trim()) {
      return `${storedWorker.trim().replace(/\/+$/, '')}/favorites`;
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

function readLocalFavorites(): FavoritesState | null {
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

function writeLocalFavorites(state: FavoritesState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

function openFavDb(): Promise<IDBDatabase | null> {
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

async function readIdbFavorites(): Promise<FavoritesState | null> {
  const db = await openFavDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result as FavoritesState | undefined;
        resolve(val && Array.isArray(val.ids) ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIdbFavorites(state: FavoritesState): Promise<void> {
  const db = await openFavDb();
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

async function fetchBackendFavorites(): Promise<FavoritesState | null> {
  const baseUrl = getBackendFavoritesUrl();
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
    /* offline or backend unavailable */
  }
  return null;
}

async function pushBackendFavorites(state: FavoritesState): Promise<boolean> {
  const baseUrl = getBackendFavoritesUrl();
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

export function idsToRecord(ids: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of ids) out[id] = true;
  return out;
}

/** Synchronous initial read for React useState initializer. */
export function getInitialFavoritesMap(): Record<string, boolean> {
  const local = readLocalFavorites();
  return idsToRecord(local ? local.ids : DEFAULT_FAVORITES);
}

/**
 * Hydrate favorites from IndexedDB and backend Worker (whichever is newest)
 * and keep all layers synchronized.
 */
export async function hydrateFavorites(): Promise<Record<string, boolean>> {
  const local = readLocalFavorites();
  const [idb, remote] = await Promise.all([readIdbFavorites(), fetchBackendFavorites()]);

  const candidates = [local, idb, remote].filter((c): c is FavoritesState => Boolean(c));
  if (candidates.length === 0) {
    return idsToRecord(DEFAULT_FAVORITES);
  }
  candidates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const winner = candidates[0];

  writeLocalFavorites(winner);
  void writeIdbFavorites(winner);
  if (!remote || (winner.updatedAt || 0) > (remote.updatedAt || 0)) {
    void pushBackendFavorites(winner);
  }
  return idsToRecord(winner.ids);
}

/**
 * Persist updated favorites map to localStorage + IndexedDB + Backend Worker
 * and notify all components/tabs immediately.
 */
export function saveFavoritesMap(map: Record<string, boolean>): FavoritesState {
  const ids = Object.keys(map).filter((k) => Boolean(map[k]));
  const state: FavoritesState = { ids, updatedAt: Date.now() };
  writeLocalFavorites(state);
  void writeIdbFavorites(state);
  void pushBackendFavorites(state);
  try {
    window.dispatchEvent(new CustomEvent('alqami:favorites-changed', { detail: state }));
  } catch {
    /* ignore */
  }
  return state;
}

export function subscribeFavorites(onChange: (map: Record<string, boolean>) => void): () => void {
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<FavoritesState>).detail;
    if (detail && Array.isArray(detail.ids)) {
      onChange(idsToRecord(detail.ids));
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      const local = readLocalFavorites();
      if (local) onChange(idsToRecord(local.ids));
    }
  };
  window.addEventListener('alqami:favorites-changed', onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('alqami:favorites-changed', onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
