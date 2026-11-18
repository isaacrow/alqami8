// scripts/alkafeel-bench.mjs
// Evaluates Al-Kafeel Museum "Recognise by sight" (DINOv2 index in public/data/recognition-dinov2s.json)
// on held-out photos (enrol_heldout/alkafeel__<id>.jpg) and simulated phone camera views,
// using the 0.76 score floor and 0.06 runner-up gap rule (src/recognize/decide.ts).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SCORE_FLOOR = 0.76;
const MARGIN = 0.06;

const model = await AutoModel.from_pretrained('Xenova/dinov2-small', { dtype: 'q8' });

async function embed(buf) {
  const { data } = await sharp(buf).rotate().removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await model({ pixel_values: new Tensor('float32', px, [1, 3, SIZE, SIZE]) });
  const dim = out.last_hidden_state.dims[2];
  const v = Float32Array.from(out.last_hidden_state.data.slice(0, dim));
  const n = Math.hypot(...v) || 1;
  for (let k = 0; k < dim; k++) v[k] /= n;
  return v;
}

let seed = 17;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
async function phoneCaseView(buf) {
  const size = 448;
  const meta = await sharp(buf).rotate().metadata();
  const h = Math.round(size * (0.62 + rand() * 0.22));
  const w = Math.min(size - 8, Math.round((h * meta.width) / meta.height));
  const bg = { r: 70 + Math.round(rand() * 120), g: 65 + Math.round(rand() * 120), b: 60 + Math.round(rand() * 120), alpha: 1 };
  const turned = await sharp(buf).rotate().resize(w, h, { fit: 'fill' }).rotate((rand() - 0.5) * 8, { background: bg }).toBuffer();
  const fitted = await sharp(turned).resize(size, size, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  const fm = await sharp(fitted).metadata();
  return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([{ input: fitted, left: Math.round((size - fm.width) / 2), top: Math.round((size - fm.height) / 2) }])
    .modulate({ brightness: 0.8 + rand() * 0.35 })
    .jpeg({ quality: 78 })
    .toBuffer();
}

const indexFile = JSON.parse(readFileSync('public/data/recognition-dinov2s.json', 'utf8'));
const entries = indexFile.entries.map((e) => ({
  key: e.key,
  threshold: e.threshold ?? SCORE_FLOOR,
  views: e.views.map((b64) => {
    const buf = Buffer.from(b64, 'base64');
    const v = Float32Array.from(new Int8Array(buf.buffer, buf.byteOffset, buf.length), (x) => x / 127);
    const n = Math.hypot(...v) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }),
}));

const normId = (k) => k.replace(/^(?:alkafeel:|artifact:KFL-[A-Z]+-|artifact:)/i, '');

function decide(q) {
  const ranked = entries
    .map((e) => {
      let best = -1;
      for (const v of e.views) {
        let s = 0;
        for (let k = 0; k < v.length; k++) s += v[k] * q[k];
        if (s > best) best = s;
      }
      return { key: e.key, id: normId(e.key), threshold: e.threshold, score: best };
    })
    .sort((a, b) => b.score - a.score);
  // Deduplicate same underlying serial ID (e.g. alkafeel:2126 and artifact:KFL-SWD-2126)
  const dedup = [];
  const seen = new Set();
  for (const r of ranked) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      dedup.push(r);
    }
    if (dedup.length >= 3) break;
  }
  const [a, b] = dedup;
  const gap = a.score - (b?.score ?? 0);
  return {
    topId: a.id,
    top3Ids: dedup.map((x) => x.id),
    score: a.score,
    gap,
    accepted: a.score >= SCORE_FLOOR && gap >= MARGIN,
  };
}

const heldOutDir = 'enrol_heldout';
const files = existsSync(heldOutDir) ? readdirSync(heldOutDir).filter((f) => f.endsWith('.jpg')).sort() : [];
const testSet = files.slice(0, 60);

let top1 = 0,
  top3 = 0,
  answeredRight = 0,
  answeredWrong = 0;

for (const f of testSet) {
  const expectedId = f.replace(/^alkafeel__|\.jpg$/g, '');
  const buf = await phoneCaseView(readFileSync(join(heldOutDir, f)));
  const q = await embed(buf);
  const res = decide(q);
  const isRight = res.topId === expectedId;
  if (isRight) top1++;
  if (res.top3Ids.includes(expectedId)) top3++;
  if (res.accepted) {
    if (isRight) answeredRight++;
    else answeredWrong++;
  }
}

console.log(
  `Al-Kafeel Sight Benchmark (${testSet.length} held-out museum case views, index=${entries.length} entries): ` +
    `top-1 ${((100 * top1) / Math.max(1, testSet.length)).toFixed(1)}%, ` +
    `top-3 ${((100 * top3) / Math.max(1, testSet.length)).toFixed(1)}% | ` +
    `With score >= ${SCORE_FLOOR} & gap >= ${MARGIN}: ${((100 * answeredRight) / Math.max(1, testSet.length)).toFixed(1)}% answered, ${answeredWrong} wrong!`
);
