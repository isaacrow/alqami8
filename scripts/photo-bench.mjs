// Real-photo check of "scan by sight" (Plan 5, step 1): phone-like views made from real photos are matched against
// public/data/recognition-dinov2s.json with the app's rule (score >= the entry's threshold and 0.06 ahead of the next
// object). Each known photo is shown as a phone would see it: tilted in perspective, turned a little, dimmer or
// brighter, at 55–90% of the scanner's square, on a real background; single pages of open books too. Photos of
// things that are not catalogued must never be named.
//
//   node scripts/photo-bench.mjs --known <key>=<photo> [...] --unknown <photo> [...] --background <photo>
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const args = process.argv.slice(2);
const known = [];
const unknown = [];
let background = null;
for (let i = 0, mode = ''; i < args.length; i++) {
  if (args[i].startsWith('--')) mode = args[i];
  else if (mode === '--known') {
    const at = args[i].indexOf('=');
    known.push({ key: args[i].slice(0, at), file: args[i].slice(at + 1) });
  } else if (mode === '--unknown') unknown.push(args[i]);
  else if (mode === '--background') background = args[i];
}

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const model = await AutoModel.from_pretrained('Xenova/dinov2-small', { dtype: 'q8' });
async function embed(buf) {
  const { data } = await sharp(buf).removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await model({ pixel_values: new Tensor('float32', px, [1, 3, SIZE, SIZE]) });
  const v = Float32Array.from(out.last_hidden_state.data.slice(0, out.last_hidden_state.dims[2]));
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

const index = JSON.parse(readFileSync('public/data/recognition-dinov2s.json', 'utf8'));
const entries = index.entries.map((e) => ({
  key: e.key,
  threshold: e.threshold ?? 0.76,
  // Each view: base64 int8 values (value / 127).
  views: e.views.map((b64) => {
    const buf = Buffer.from(b64, 'base64');
    return Float32Array.from(new Int8Array(buf.buffer, buf.byteOffset, buf.length), (x) => x / 127);
  }),
}));
function decide(q) {
  const ranked = entries
    .map((e) => {
      let best = -1;
      for (const v of e.views) {
        let s = 0;
        for (let k = 0; k < v.length; k++) s += v[k] * q[k];
        if (s > best) best = s;
      }
      return { key: e.key, threshold: e.threshold, score: best };
    })
    .sort((a, b) => b.score - a.score);
  const [a, b] = ranked;
  return { top: a.key, score: a.score, gap: a.score - b.score, answer: a.score >= a.threshold && a.score - b.score >= 0.06 ? a.key : null };
}

let seed = 23;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const bgBuf = background ? readFileSync(background) : null;

// A phone's view of a photo: perspective tilt (one side shorter), a small turn, light, framed on the background.
async function phoneView(buf, part = 'all') {
  let img = sharp(buf).rotate();
  const m = await img.metadata();
  if (part !== 'all') {
    const h = Math.floor(m.width / 2);
    img = sharp(await img.extract({ left: part === 'left' ? 0 : h, top: 0, width: part === 'left' ? h : m.width - h, height: m.height }).toBuffer());
  }
  const src = await img.resize(640, 640, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = src.info;
  // Perspective: squeeze the top (or a side) by up to 22%, sampled by inverse mapping.
  const squeeze = 0.06 + rand() * 0.16;
  const side = rand() < 0.5;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = side ? x / w : 1 - y / h;
      const k = 1 - squeeze * t;
      const sx = side ? x : w / 2 + (x - w / 2) / k;
      const sy = side ? h / 2 + (y - h / 2) / k : y;
      const o = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (Math.floor(sy) * w + Math.floor(sx)) * 4;
      src.data.copy(out, o, i, i + 4);
    }
  const turned = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .rotate((rand() - 0.5) * 16, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .modulate({ brightness: 0.65 + rand() * 0.55, saturation: 0.85 + rand() * 0.3 })
    .png()
    .toBuffer();
  const S = 448;
  const fill = 0.55 + rand() * 0.35;
  const fitted = await sharp(turned).resize(Math.round(S * fill), Math.round(S * fill), { fit: 'inside' }).toBuffer();
  const fm = await sharp(fitted).metadata();
  const base = bgBuf
    ? await sharp(bgBuf).extract({ left: Math.round(rand() * 200), top: Math.round(rand() * 400), width: 1000, height: 1000 }).resize(S, S).toBuffer()
    : await sharp({ create: { width: S, height: S, channels: 3, background: '#777' } }).png().toBuffer();
  return sharp(base)
    .composite([{ input: fitted, left: Math.round((S - fm.width) / 2 + (rand() - 0.5) * 40), top: Math.round((S - fm.height) / 2 + (rand() - 0.5) * 40) }])
    .jpeg({ quality: 70 })
    .toBuffer();
}

const PER = 12;
console.log(`index: ${entries.length} entries`);
let right = 0, wrong = 0, silent = 0, total = 0, top1 = 0;
for (const k of known) {
  const buf = readFileSync(k.file);
  const m = await sharp(buf).metadata();
  const spread = m.width / m.height > 1.25;
  const row = { right: 0, wrong: 0, silent: 0, top1: 0, scores: [] };
  for (let i = 0; i < PER; i++) {
    const part = spread && i % 3 !== 0 ? (i % 3 === 1 ? 'left' : 'right') : 'all';
    const d = decide(await embed(await phoneView(buf, part)));
    total++;
    if (d.top === k.key) row.top1++;
    if (d.answer === k.key) row.right++;
    else if (d.answer) row.wrong++, console.log(`    wrong: ${part} → ${d.answer} (${d.score.toFixed(3)})`);
    else row.silent++;
    row.scores.push(d.score.toFixed(2));
  }
  right += row.right; wrong += row.wrong; silent += row.silent; top1 += row.top1;
  console.log(`${k.key}: named ${row.right}/${PER}, wrong ${row.wrong}, unsure ${row.silent}, top-1 ${row.top1}/${PER} · scores ${row.scores.join(' ')}`);
}
console.log(`known photos: named ${right}/${total} (${Math.round((100 * right) / total)}%), wrong ${wrong}, top-1 ${Math.round((100 * top1) / total)}%`);

let falseNamed = 0, tried = 0;
for (const f of unknown) {
  const buf = readFileSync(f);
  const views = [await sharp(buf).rotate().jpeg().toBuffer()];
  for (let i = 0; i < 5; i++) views.push(await phoneView(buf));
  // Also the centre square, as the scanner crops it.
  const m = await sharp(buf).rotate().metadata();
  const s = Math.min(m.width, m.height);
  views.push(await sharp(buf).rotate().extract({ left: (m.width - s) >> 1, top: (m.height - s) >> 1, width: s, height: s }).jpeg().toBuffer());
  for (const v of views) {
    const d = decide(await embed(v));
    tried++;
    if (d.answer) falseNamed++, console.log(`  ${f.split(/[\\/]/).pop()}: named ${d.answer} (${d.score.toFixed(3)}, gap ${d.gap.toFixed(3)})`);
  }
}
console.log(`not catalogued: ${falseNamed} of ${tried} views wrongly named`);
