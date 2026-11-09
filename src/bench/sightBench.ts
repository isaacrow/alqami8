import { coverGuess } from '../moon/moonApi';
import { rank } from '../recognize/decide';
import { EMBED_KEY, Embedder } from '../recognize/embedder';
import { loadRecognitionIndex } from '../recognize/recognitionIndex';

/**
 * bench.html: measures recognition by sight on this device. For a sample of Moon covers it embeds the cover and a
 * phone-like version of it (cropped, tilted, darker), then reports speed, agreement with the server-built index,
 * and how often the right record comes first.
 */

const SAMPLE = 20;
const $ = (id: string) => document.getElementById(id)!;
const log = (line: string) => ($('log').textContent += `${line}\n`);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${url}`));
    img.src = url;
  });
}

// A rough phone photo of a cover: 85% crop, a slight tilt, darker light, on a grey surround.
function phoneLike(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 448;
  c.height = 448;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8a8178';
  ctx.fillRect(0, 0, 448, 448);
  ctx.filter = 'brightness(0.8)';
  ctx.translate(224, 224);
  ctx.rotate((4 * Math.PI) / 180);
  const sx = img.width * 0.075, sy = img.height * 0.075;
  ctx.drawImage(img, sx, sy, img.width * 0.85, img.height * 0.85, -190, -190, 380, 380);
  return c;
}

function row(label: string, value: string) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td></td><td></td>`;
  tr.children[0].textContent = label;
  tr.children[1].textContent = value;
  $('results').appendChild(tr);
}

async function run() {
  ($('run') as HTMLButtonElement).disabled = true;
  $('log').textContent = '';
  $('results').innerHTML = '';
  const device = ($('gpu') as HTMLInputElement).checked ? 'webgpu' : 'wasm';
  const mem = () => ((performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1e6)} MB JS heap` : 'n/a on this browser');
  try {
    log(`Device: ${navigator.userAgent}`);
    log(`Backend: ${device}`);
    const t0 = performance.now();
    const { entries } = await loadRecognitionIndex(EMBED_KEY);
    const embedder = new Embedder(device);
    await embedder.load();
    const loadMs = performance.now() - t0;
    log(`Model and index loaded in ${(loadMs / 1000).toFixed(1)} s (${entries.length} index entries)`);

    const sample = entries.filter((e) => e.key.startsWith('moon:')).slice(0, SAMPLE);
    const times: number[] = [];
    let agree = 0, top1 = 0, top3 = 0, done = 0;
    for (const e of sample) {
      const id = e.key.slice(5);
      const img = await loadImage(coverGuess(id));
      const t = performance.now();
      const own = await embedder.embed(img);
      times.push(performance.now() - t);
      if (own) agree += rank(own, [{ ...e, views: e.views.slice(0, 1) }])[0].score;
      const photo = await embedder.embed(phoneLike(img));
      if (photo) {
        const r = rank(photo, entries);
        if (r[0].key === e.key) top1++;
        if (r.slice(0, 3).some((c) => c.key === e.key)) top3++;
      }
      done++;
      log(`${done}/${sample.length} ${id}`);
    }
    times.sort((a, b) => a - b);
    $('results').hidden = false;
    row('Backend', device);
    row('Model + index load', `${(loadMs / 1000).toFixed(1)} s`);
    row('Time per frame (median)', `${Math.round(times[Math.floor(times.length / 2)])} ms`);
    row('Time per frame (slowest)', `${Math.round(times[times.length - 1])} ms`);
    row('Agreement with server index', (agree / done).toFixed(3));
    row('Phone-like photo: right record first', `${Math.round((100 * top1) / done)}%`);
    row('Phone-like photo: right record in top 3', `${Math.round((100 * top3) / done)}%`);
    row('Memory', mem());
    await embedder.dispose();
  } catch (error) {
    log(`Failed: ${(error as Error).message}`);
  }
  ($('run') as HTMLButtonElement).disabled = false;
}

$('run').addEventListener('click', () => void run());
