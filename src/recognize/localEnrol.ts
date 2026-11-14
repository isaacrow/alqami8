/**
 * Objects taught on this device ("Teach ALQAMI" in the scanner): their reference embeddings, recognised at once on
 * this phone, and their photos, which can be exported as a zip for the repository's enrol/ folder so the nightly
 * index teaches every visitor's ALQAMI.
 */

export interface EnrolledObject {
  /** "moon:<record id>" or "artifact:<ALQAMI id>", the same keys as the recognition index. */
  key: string;
  title: string;
  /** Unit-length embeddings, base64 int8 (as in the recognition index). */
  views: string[];
  /** The model the views were made with ("dinov2s" or "dinov2s-fp16"); missing = "dinov2s". */
  model?: string;
  photos: Blob[];
  /** The angle each photo was seen from (renders of a 3D scan), null for photos taken by hand; aligned with photos. */
  angles?: Array<number | null>;
  /** The object's 3D scan (GLB/USDZ), when it was taught from one: shown in 3D and AR. */
  mesh?: Blob;
  meshName?: string;
  savedAt: string;
}

const DB = 'alqami-enrol';
const STORE = 'objects';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

export async function listEnrolled(): Promise<EnrolledObject[]> {
  return (await run<EnrolledObject[]>('readonly', (s) => s.getAll())) ?? [];
}

/** Adds the views and photos to what is already taught for this key. */
export async function saveEnrolled(entry: EnrolledObject): Promise<void> {
  const existing = await run<EnrolledObject>('readonly', (s) => s.get(entry.key));
  const nulls = (n: number) => Array.from({ length: n }, () => null);
  const angles = (o: EnrolledObject) => o.angles ?? nulls(o.photos.length);
  const merged: EnrolledObject = existing
    ? {
        ...entry,
        photos: [...existing.photos, ...entry.photos],
        angles: [...angles(existing), ...angles(entry)],
        mesh: entry.mesh ?? existing.mesh,
        meshName: entry.meshName ?? existing.meshName,
        // Same model: views add up (aligned with photos). Different models: views no longer line up with photos, so
        // they are left out and recognition re-learns them from the photos.
        ...((existing.model ?? 'dinov2s') === (entry.model ?? 'dinov2s')
          ? { views: [...existing.views, ...entry.views] }
          : { views: [], model: 'mixed' }),
      }
    : entry;
  await run('readwrite', (s) => s.put(merged));
}

export async function removeEnrolled(key: string): Promise<void> {
  await run('readwrite', (s) => s.delete(key));
}

/** A zip of every taught object's photos, laid out as the repository's enrol/ folder expects. */
export async function enrolmentZip(objects: EnrolledObject[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  for (const o of objects) {
    const folder = o.key.replace(':', '__');
    for (let i = 0; i < o.photos.length; i++) {
      files[`enrol/${folder}/${o.savedAt.slice(0, 10)}-${i + 1}.jpg`] = new Uint8Array(await o.photos[i].arrayBuffer());
    }
  }
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
