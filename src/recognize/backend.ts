import { EMBED_KEY, Embedder } from './embedder';
import { decodeView } from './recognitionIndex';

/**
 * Which way this device runs recognition by sight:
 *  - iPhone / iPad / mobile browsers: ALWAYS use WASM int8 ("dinov2s") — iOS Safari WebGPU throws
 *    `RangeError: Out of memory` when running fp16 ViTs alongside a live camera stream.
 *  - Desktop with WebGPU: try WebGPU fp16 ("dinov2s-fp16") after a self-test, and fall back to WASM int8
 *    on any error (including OOM).
 */
export interface SightBackend {
  device: 'wasm' | 'webgpu';
  dtype: 'q8' | 'fp16';
  /** Index (and taught views) made with this model: "dinov2s" or "dinov2s-fp16". */
  key: string;
}

export const WASM_BACKEND: SightBackend = { device: 'wasm', dtype: 'q8', key: EMBED_KEY };
const GPU_BACKEND: SightBackend = { device: 'webgpu', dtype: 'fp16', key: `${EMBED_KEY}-fp16` };
const REMEMBER = 'alqami.sight.backend.v2';
let choice: Promise<SightBackend> | null = null;

export function isMobileOrIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPhone|iPad|iPod|Android|Mobile/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function forceWasmBackend(): void {
  choice = Promise.resolve(WASM_BACKEND);
  try {
    sessionStorage.setItem(REMEMBER, 'wasm');
  } catch {
    /* ignore */
  }
}

async function selfTest(): Promise<boolean> {
  const base = import.meta.env.BASE_URL || './';
  const res = await fetch(`${base}data/recognition-${GPU_BACKEND.key}.json`, { cache: 'no-cache' });
  if (!res.ok) return false;
  const { selftest } = (await res.json()) as { selftest?: { image: string; view: string } };
  if (!selftest) return false;
  const img = new Image();
  img.src = `${base}${selftest.image}`;
  await img.decode();
  const embedder = new Embedder(GPU_BACKEND.device, GPU_BACKEND.dtype);
  try {
    const v = await embedder.embed(img);
    if (!v) return false;
    const ref = decodeView(selftest.view);
    const agree = v.reduce((s, x, i) => s + x * ref[i], 0);
    console.info(`Sight self-test on WebGPU: ${agree.toFixed(3)}`);
    return agree > 0.97;
  } finally {
    await embedder.dispose();
  }
}

export function sightBackend(): Promise<SightBackend> {
  choice ??= (async () => {
    // Mobile & iOS Safari: always use low-RAM WASM int8 so WebGPU never OOMs alongside camera + WebGL
    if (isMobileOrIOS() || new URLSearchParams(location.search).has('wasm')) {
      try {
        sessionStorage.setItem(REMEMBER, 'wasm');
      } catch {
        /* ignore */
      }
      return WASM_BACKEND;
    }
    try {
      const saved = sessionStorage.getItem(REMEMBER);
      if (saved === 'webgpu') return GPU_BACKEND;
      if (saved === 'wasm') return WASM_BACKEND;
    } catch {
      /* ignore */
    }
    let ok = false;
    if ('gpu' in navigator) ok = await selfTest().catch(() => false);
    try {
      sessionStorage.setItem(REMEMBER, ok ? 'webgpu' : 'wasm');
    } catch {
      /* ignore */
    }
    return ok ? GPU_BACKEND : WASM_BACKEND;
  })();
  return choice;
}
