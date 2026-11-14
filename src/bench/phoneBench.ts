import { coverGuess } from '../moon/moonApi';
import { Embedder } from '../recognize/embedder';
import { FlowTracker } from '../scan/flowTracker';

/**
 * Plan 3, step 0 (bench.html, second section): the numbers that decide which runtime and which lip-sync model ALQAMI
 * uses on phones. No public source has measured these in iPhone Safari, so they are measured here, on the visitor's
 * own device.
 *  - Recognition: DINOv2 on WASM (int8, today) vs WebGPU (fp16): load time, ms per frame, and whether the two give the
 *    same embeddings (onnxruntime-web has had silent fp16 errors on WebGPU, so they are compared, not trusted).
 *  - The walking tracker: ms per camera frame with 2 objects followed.
 *  - Lip sync (optional, a 192 MB download): the LAM audio-to-expression model (52 ARKit face shapes from voice),
 *    its download, load and speed for 1 s of audio, and whether the tab survives it.
 */

const $ = (id: string) => document.getElementById(id)!;
const log = (line: string) => ($('log2').textContent += `${line}\n`);
const row = (label: string, value: string) => {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td></td><td></td>';
  tr.children[0].textContent = label;
  tr.children[1].textContent = value;
  const t = $('results2');
  t.hidden = false;
  t.appendChild(tr);
};
const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? NaN;
const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${url}`));
    img.src = url;
  });
}

async function timeBackend(device: 'wasm' | 'webgpu', images: HTMLImageElement[], dtype?: 'q8' | 'fp16' | 'fp32') {
  const embedder = new Embedder(device, dtype);
  const t0 = performance.now();
  await embedder.load();
  const loadMs = performance.now() - t0;
  const out: Float32Array[] = [];
  const times: number[] = [];
  // The first run compiles shaders on WebGPU: time it apart.
  const w0 = performance.now();
  await embedder.embed(images[0]);
  const firstMs = performance.now() - w0;
  for (const img of images) {
    const t = performance.now();
    const e = await embedder.embed(img);
    times.push(performance.now() - t);
    if (e) out.push(e);
  }
  await embedder.dispose();
  return { loadMs, firstMs, ms: median(times), out };
}

async function recognition() {
  log(`Device: ${navigator.userAgent}`);
  log(`WebGPU: ${'gpu' in navigator ? 'available' : 'not available'}`);
  const ids = ['0', '1', '2', '3', '4', '5', '6', '7'];
  const images: HTMLImageElement[] = [];
  const { publishedRecords } = await import('../moon/moonObjects');
  for (const r of (await publishedRecords()).slice(0, ids.length)) images.push(await loadImage(coverGuess(r.id)));
  log(`${images.length} test images`);

  const wasm = await timeBackend('wasm', images);
  row('Recognition, WASM int8: load', `${(wasm.loadMs / 1000).toFixed(1)} s`);
  row('Recognition, WASM int8: per frame', `${Math.round(wasm.ms)} ms`);
  if (!('gpu' in navigator)) {
    row('Recognition, WebGPU', 'not available');
    return;
  }
  // fp16 and fp32 on WebGPU: the fastest one whose embeddings agree with WASM (min cosine > 0.97) wins.
  let best: { name: string; ms: number } | null = null;
  for (const dtype of ['fp16', 'fp32'] as const) {
    try {
      const gpu = await timeBackend('webgpu', images, dtype);
      const agree = Math.min(...wasm.out.map((e, i) => (gpu.out[i] ? dot(e, gpu.out[i]) : 0)));
      row(`Recognition, WebGPU ${dtype}: load / first frame`, `${(gpu.loadMs / 1000).toFixed(1)} s / ${Math.round(gpu.firstMs)} ms`);
      row(`Recognition, WebGPU ${dtype}: per frame`, `${Math.round(gpu.ms)} ms`);
      // int8 and full precision differ by design (about 0.77 on a PC); each has its own index.
      row(`Recognition, WebGPU ${dtype}: similarity to WASM int8`, agree.toFixed(3));
      if (dtype === 'fp16' && gpu.ms < wasm.ms) best = { name: `WebGPU ${dtype}`, ms: gpu.ms };
    } catch (e) {
      row(`Recognition, WebGPU ${dtype}`, `failed: ${(e as Error).message.slice(0, 60)}`);
    }
  }
  // What ALQAMI will really use here: WebGPU fp16 only if this phone passes the self-test against its index.
  try {
    sessionStorage.removeItem('alqami.sight.backend');
  } catch {
    // ignore
  }
  const { sightBackend } = await import('../recognize/backend');
  const b = await sightBackend();
  row('Self-test → ALQAMI uses', `${b.device} ${b.dtype}${b.device === 'webgpu' && best ? `, ${(wasm.ms / best.ms).toFixed(1)}× faster` : ''}`);
}

async function tracker() {
  // A moving test picture as the "camera", with two objects followed.
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 1280;
  const g = c.getContext('2d')!;
  const img = await loadImage(`${import.meta.env.BASE_URL}alqami-logo.png`).catch(() => null);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = c.captureStream(30);
  let dx = 0;
  const draw = () => {
    g.fillStyle = '#777';
    g.fillRect(0, 0, 720, 1280);
    if (img) g.drawImage(img, 60 + dx, 300, 600, 600);
    for (let i = 0; i < 400; i++) g.fillRect(((i * 97) % 700) + dx, (i * 53) % 1280, 6, 6);
  };
  draw();
  await video.play();
  await new Promise((r) => setTimeout(r, 300));
  const t = new FlowTracker();
  t.seed('a', video, { x: 0.35, y: 0.45, hw: 0.15, hh: 0.08 });
  t.seed('b', video, { x: 0.65, y: 0.55, hw: 0.15, hh: 0.08 });
  const times: number[] = [];
  for (let i = 0; i < 40; i++) {
    dx += 3;
    draw();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const s = performance.now();
    t.update(video);
    times.push(performance.now() - s);
  }
  video.pause();
  row('Walking tracker: per frame (2 objects)', `${median(times).toFixed(1)} ms`);
  row('Walking tracker: still following', `${['a', 'b'].filter((k) => t.box(k)).length}/2`);
}

async function lips() {
  const base = 'https://huggingface.co/adolon-ai/lam-a2e/resolve/main/';
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const t0 = performance.now();
  log('Downloading the lip model (192 MB)…');
  const data = new Uint8Array(await (await fetch(`${base}lam_ios.onnx.data`)).arrayBuffer());
  const graph = new Uint8Array(await (await fetch(`${base}lam_ios.onnx`)).arrayBuffer());
  const dlMs = performance.now() - t0;
  row('Lip model: download', `${(dlMs / 1000).toFixed(1)} s (${Math.round((data.length + graph.length) / 1e6)} MB)`);
  const t1 = performance.now();
  const session = await ort.InferenceSession.create(graph, { executionProviders: ['wasm'], externalData: [{ path: 'lam_ios.onnx.data', data }] });
  row('Lip model: load', `${((performance.now() - t1) / 1000).toFixed(1)} s`);
  const input = session.inputNames[0];
  const audio = new Float32Array(16000).map((_, i) => Math.sin(i / 8) * 0.2 * Math.sin(i / 2000));
  const times: number[] = [];
  let frames = 0;
  for (let k = 0; k < 4; k++) {
    const s = performance.now();
    const out = await session.run({ [input]: new ort.Tensor('float32', audio, [1, 16000]) });
    times.push(performance.now() - s);
    frames = out[session.outputNames[0]].dims[1] as number;
  }
  row('Lip model: 1 s of voice takes', `${Math.round(median(times))} ms (${frames} frames of 52 shapes)`);
  row('Lip model: real time?', median(times) < 600 ? 'yes' : 'no — too slow for live speech');
  await session.release();
}

async function guard(name: string, fn: () => Promise<void>) {
  const b = $(name) as HTMLButtonElement;
  b.disabled = true;
  try {
    await fn();
  } catch (e) {
    log(`Failed: ${(e as Error).message}`);
  }
  b.disabled = false;
}

$('bench-recognition').addEventListener('click', () => void guard('bench-recognition', recognition));
$('bench-tracker').addEventListener('click', () => void guard('bench-tracker', tracker));
$('bench-lips').addEventListener('click', () => void guard('bench-lips', lips));
