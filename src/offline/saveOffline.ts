import { coverGuess } from '../moon/moonApi';
import { loadRecord } from '../moon/moonCache';
import { publishedRecords } from '../moon/moonObjects';
import { Embedder } from '../recognize/embedder';

/**
 * "Save for offline": everything a visit needs, fetched before entering a hall with no signal. The service worker
 * (public/sw.js) keeps what is fetched here: the app's files (offline-manifest.json, written at build), every
 * published Moon record and its cover, and the recognition model.
 */

const APP_CACHE = 'alqami-app-v1';
const SAVED_KEY = 'alqami-offline-saved';

export interface OfflineProgress {
  done: number;
  total: number;
  step: 'app' | 'records' | 'model' | 'done';
}

export interface OfflineSaved {
  at: string;
  bytes: number;
  records: number;
}

export function offlineSaved(): OfflineSaved | null {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
  } catch {
    return null;
  }
}

/** About how much "Save for offline" downloads, for the button's label. */
export async function offlineSize(): Promise<number> {
  const res = await fetch(`${import.meta.env.BASE_URL || './'}offline-manifest.json`, { cache: 'no-cache' });
  if (!res.ok) return 0;
  const { files } = (await res.json()) as { files: Array<{ bytes: number }> };
  // The app's files, plus the recognition model (~24 MB) and covers (~6 MB).
  return files.reduce((n, f) => n + f.bytes, 0) + 30e6;
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map((it) => run(it).catch(() => {})));
}

export async function saveForOffline(onProgress: (p: OfflineProgress) => void): Promise<OfflineSaved> {
  const base = import.meta.env.BASE_URL || './';
  const manifest = (await (await fetch(`${base}offline-manifest.json`, { cache: 'no-cache' })).json()) as {
    files: Array<{ path: string; bytes: number }>;
  };
  const records = await publishedRecords();
  const appBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
  // Progress in bytes for the app's files, then one unit per record and its cover, then the model.
  const total = appBytes + records.length * 60_000 + 24e6;
  let done = 0;
  const tick = (n: number, step: OfflineProgress['step']) => {
    done += n;
    onProgress({ done: Math.min(done, total), total, step });
  };

  const cache = await caches.open(APP_CACHE);
  await inBatches(manifest.files, 4, async (f) => {
    const url = new URL(`${base}${f.path}`, location.href).href;
    if (!(await cache.match(url))) {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    }
    tick(f.bytes, 'app');
  });

  // Records go to the device's record store (and the service worker's cache); covers through the service worker.
  await inBatches(records, 4, async (r) => {
    await loadRecord(r.id);
    await fetch(coverGuess(r.id)).catch(() => undefined);
    tick(60_000, 'records');
  });

  // The model this phone recognises with (WebGPU fp16 after its self-test, else WASM int8), and its index.
  const { sightBackend } = await import('../recognize/backend');
  const b = await sightBackend();
  const embedder = new Embedder(b.device, b.dtype);
  await embedder.load();
  await embedder.dispose();
  await fetch(`${import.meta.env.BASE_URL || './'}data/recognition-${b.key}.json`).catch(() => undefined);
  tick(24e6, 'model');

  const saved = { at: new Date().toISOString(), bytes: appBytes + 30e6, records: records.length };
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // The files are saved; only the "saved on" note is lost.
  }
  onProgress({ done: total, total, step: 'done' });
  return saved;
}
