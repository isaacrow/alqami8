// Measures recognition from any side: each image in renders-test/<key>/az<deg>_el<deg>.jpg (angles and heights the
// index never saw, other backgrounds and light) is embedded exactly as in the app, compared with
// public/data/recognition-dinov2s.json, and decided with the app's rule (score ≥ threshold and ≥ 0.06 ahead).
// Prints how many were answered, how many answers were right, and how far off the reported side was.
//
//   node scripts/render-object-views.mjs --out renders-test --az 15,75,135,195,255,315 --el 12,28 --seed 99
//   node scripts/any-side-bench.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const index = JSON.parse(readFileSync('public/data/recognition-dinov2s.json', 'utf8'));
const decode = (b64) => {
  const b = Buffer.from(b64, 'base64');
  const v = Float32Array.from(b, (x) => (x > 127 ? x - 256 : x) / 127);
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
const entries = index.entries.map((e) => ({ key: e.key, threshold: e.threshold, views: e.views.map(decode), angles: e.angles }));
const model = await AutoModel.from_pretrained('Xenova/dinov2-small', { dtype: 'q8' });

async function embed(buf) {
  // The app embeds the centre 80% square of the camera frame; renders are already square and framed like that.
  const { data } = await sharp(buf).removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await model({ pixel_values: new Tensor('float32', px, [1, 3, SIZE, SIZE]) });
  const d = out.last_hidden_state.data;
  const dim = out.last_hidden_state.dims[2];
  const cls = Float32Array.from(d.subarray(0, dim));
  const n = Math.hypot(...cls) || 1;
  return cls.map((x) => x / n);
}
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

let total = 0, answered = 0, right = 0, top1 = 0;
const angleErrors = [];
for (const dir of readdirSync('renders-test')) {
  const key = dir.replace('__', ':');
  for (const f of readdirSync(join('renders-test', dir))) {
    const m = /^az(\d+)_el(\d+)\.jpg$/.exec(f);
    if (!m) continue;
    total++;
    const q = await embed(readFileSync(join('renders-test', dir, f)));
    const ranked = entries
      .map((e) => {
        let best = -1, at = 0;
        e.views.forEach((v, i) => {
          const s = dot(q, v);
          if (s > best) (best = s), (at = i);
        });
        return { key: e.key, score: best, threshold: e.threshold, angle: e.angles?.[at] ?? null };
      })
      .sort((a, b) => b.score - a.score);
    const [best, second] = ranked;
    if (best.key === key) top1++;
    if (best.score >= best.threshold && best.score - second.score >= 0.06) {
      answered++;
      if (best.key === key) {
        right++;
        if (best.angle !== null) {
          const d = Math.abs(((best.angle - Number(m[1])) % 360 + 360) % 360);
          angleErrors.push(Math.min(d, 360 - d));
        }
      } else console.log(`  wrong: ${key} ${f} → ${best.key} (${best.score.toFixed(3)})`);
    }
  }
}
angleErrors.sort((a, b) => a - b);
const pct = (a, b) => `${((100 * a) / (b || 1)).toFixed(0)}%`;
console.log(`${total} unseen views of ${readdirSync('renders-test').length} objects`);
console.log(`right first: ${pct(top1, total)} · answered: ${pct(answered, total)} · wrong answers: ${answered - right}`);
console.log(`side: median error ${angleErrors[Math.floor(angleErrors.length / 2)] ?? '-'}°, within 45°: ${pct(angleErrors.filter((x) => x <= 45).length, angleErrors.length)}`);
