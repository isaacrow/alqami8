import { listEnrolled } from './localEnrol';
import { IndexEntry } from './decide';

/**
 * The recognition index built nightly by scripts/build-recognition-index.mjs: reference embeddings for every
 * Moon cover and every enrolled object. Each view is stored as base64 int8 (value / 127), about 0.5 KB.
 */
export interface RecognitionIndexFile {
  model: string;
  selftest?: { image: string; view: string };
  dim: number;
  builtAt: string;
  entries: Array<{ key: string; threshold: number; views: string[]; angles?: Array<number | null> }>;
}

export function decodeView(b64: string): Float32Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const v = new Float32Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    v[i] = (bytes[i] > 127 ? bytes[i] - 256 : bytes[i]) / 127;
    n += v[i] * v[i];
  }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export function encodeView(v: ArrayLike<number>): string {
  const bytes = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) bytes[i] = Math.max(-127, Math.min(127, Math.round(v[i] * 127))) & 0xff;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * `reembed` turns a taught object's photos into views for this model, for objects taught while the phone ran the other
 * model (WebGPU fp16 vs WASM int8); without it those objects are skipped.
 */
export async function loadRecognitionIndex(
  model: string,
  reembed?: (photos: Blob[]) => Promise<string[]>
): Promise<{ file: RecognitionIndexFile; entries: IndexEntry[] }> {
  const base = import.meta.env.BASE_URL || './';
  const res = await fetch(`${base}data/recognition-${model}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Recognition index missing (${res.status})`);
  const file = (await res.json()) as RecognitionIndexFile;
  const entries: IndexEntry[] = file.entries.map((e) => ({ key: e.key, threshold: e.threshold, views: e.views.map(decodeView), angles: e.angles }));

  // Objects taught on this phone count at once, with the same score floor as the server-built entries.
  const floor = file.entries[0]?.threshold ?? 0.76;
  for (const taught of await listEnrolled().catch(() => [])) {
    let raw = taught.views;
    if ((taught.model ?? 'dinov2s') !== model) {
      if (!reembed) continue;
      raw = await reembed(taught.photos).catch(() => []);
      if (!raw.length) continue;
    }
    const views = raw.map(decodeView);
    // Angles of a 3D scan's renders (aligned with photos, so also with views re-learnt from them).
    const angles = views.map((_, i) => taught.angles?.[i] ?? null);
    const same = entries.find((e) => e.key === taught.key);
    if (same) {
      same.angles = [...(same.angles ?? same.views.map(() => null)), ...angles];
      same.views.push(...views);
    } else entries.push({ key: taught.key, threshold: floor, views, angles: angles.some((a) => a !== null) ? angles : undefined });
  }
  return { file, entries };
}
