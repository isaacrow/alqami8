import { EMBED_KEY, Embedder } from './embedder';
import { decodeView } from './recognitionIndex';

/**
 * Which way this phone runs recognition by sight:
 *  - WebGPU, half precision ("dinov2s-fp16" index): measured 16× faster than WASM on a PC (15 vs 240 ms a frame) and
 *    as accurate on the any-side bench (scripts/model-bench.mjs: 98% answered, 0 wrong, side within 45° 86% vs 81%);
 *  - WASM, int8 ("dinov2s" index): what every phone could always run.
 * WebGPU is used only after a self-test: this phone embeds the index's fixed picture and must agree with the
 * embedding computed when the index was built (some GPUs compute wrong results at half precision). The answer is
 * remembered for the visit.
 */
export interface SightBackend {
  device: 'wasm' | 'webgpu';
  dtype: 'q8' | 'fp16';
  /** Index (and taught views) made with this model: "dinov2s" or "dinov2s-fp16". */
  key: string;
}

const WASM: SightBackend = { device: 'wasm', dtype: 'q8', key: EMBED_KEY };
const GPU: SightBackend = { device: 'webgpu', dtype: 'fp16', key: `${EMBED_KEY}-fp16` };
const REMEMBER = 'alqami.sight.backend';
let choice: Promise<SightBackend> | null = null;

async function selfTest(): Promise<boolean> {
  const base = import.meta.env.BASE_URL || './';
  const res = await fetch(`${base}data/recognition-${GPU.key}.json`, { cache: 'no-cache' });
  if (!res.ok) return false;
  const { selftest } = (await res.json()) as { selftest?: { image: string; view: string } };
  if (!selftest) return false;
  const img = new Image();
  img.src = `${base}${selftest.image}`;
  await img.decode();
  const embedder = new Embedder(GPU.device, GPU.dtype);
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
    try {
      const saved = sessionStorage.getItem(REMEMBER);
      if (saved === 'webgpu') return GPU;
      if (saved === 'wasm') return WASM;
    } catch {
      // private mode: decide again
    }
    let ok = false;
    if ('gpu' in navigator && !new URLSearchParams(location.search).has('wasm')) ok = await selfTest().catch(() => false);
    try {
      sessionStorage.setItem(REMEMBER, ok ? 'webgpu' : 'wasm');
    } catch {
      // ignore
    }
    return ok ? GPU : WASM;
  })();
  return choice;
}
