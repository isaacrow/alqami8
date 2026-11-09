import { IndexEntry } from './decide';

/**
 * The recognition index built nightly by scripts/build-recognition-index.mjs: reference embeddings for every
 * Moon cover and every enrolled object. Each view is stored as base64 int8 (value / 127), about 0.5 KB.
 */
export interface RecognitionIndexFile {
  model: string;
  dim: number;
  builtAt: string;
  entries: Array<{ key: string; threshold: number; views: string[] }>;
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

export async function loadRecognitionIndex(model: string): Promise<{ file: RecognitionIndexFile; entries: IndexEntry[] }> {
  const base = import.meta.env.BASE_URL || './';
  const res = await fetch(`${base}data/recognition-${model}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Recognition index missing (${res.status})`);
  const file = (await res.json()) as RecognitionIndexFile;
  return { file, entries: file.entries.map((e) => ({ key: e.key, threshold: e.threshold, views: e.views.map(decodeView) })) };
}
