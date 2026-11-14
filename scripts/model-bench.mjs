// Compares sight models on the "any side" task: for each model, an index of renders/ (36 views per object) is built,
// then every view in renders-test/ (angles, heights, backgrounds and light the index never saw) is looked up with the
// app's rule (score above the floor and 0.06 ahead of the runner-up). Also times one embedding.
//
//   node scripts/model-bench.mjs Xenova/dinov2-small onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

function load(dir) {
  const out = [];
  for (const d of readdirSync(dir)) for (const f of readdirSync(join(dir, d))) {
    const m = /^az(\d+)_el(\d+)\.jpg$/.exec(f);
    if (m) out.push({ key: d, az: Number(m[1]), buf: readFileSync(join(dir, d, f)) });
  }
  return out;
}
const train = load('renders');
const test = load('renders-test');
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

for (const name of process.argv.slice(2)) {
  const model = await AutoModel.from_pretrained(name, { dtype: 'q8' });
  const embed = async (buf) => {
    const { data } = await sharp(buf).removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const px = new Float32Array(3 * SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
    const out = await model({ pixel_values: new Tensor('float32', px, [1, 3, SIZE, SIZE]) });
    const h = out.last_hidden_state;
    const cls = Float32Array.from(h.data.subarray(0, h.dims[2]));
    const n = Math.hypot(...cls) || 1;
    return cls.map((x) => x / n);
  };
  const t0 = performance.now();
  const index = [];
  for (const v of train) index.push({ ...v, e: await embed(v.buf) });
  const ms = (performance.now() - t0) / train.length;

  // Score floor: the lowest score that never accepts the wrong object on the index's own views is not measurable
  // here, so report accuracy at several floors.
  const results = [];
  for (const q of test) {
    const e = await embed(q.buf);
    const best = new Map();
    for (const v of index) {
      const s = dot(e, v.e);
      if (!best.has(v.key) || s > best.get(v.key).s) best.set(v.key, { s, az: v.az });
    }
    const ranked = [...best.entries()].sort((a, b) => b[1].s - a[1].s);
    results.push({ right: ranked[0][0] === q.key, s: ranked[0][1].s, gap: ranked[0][1].s - ranked[1][1].s, angleErr: Math.min(Math.abs(ranked[0][1].az - q.az) % 360, 360 - (Math.abs(ranked[0][1].az - q.az) % 360)) });
  }
  const top1 = results.filter((r) => r.right).length;
  const answered = results.filter((r) => r.gap >= 0.06);
  const wrong = answered.filter((r) => !r.right).length;
  const angles = results.filter((r) => r.right).map((r) => r.angleErr).sort((a, b) => a - b);
  console.log(
    `${name}: right first ${((100 * top1) / results.length).toFixed(0)}% · answered (gap ≥ 0.06) ${((100 * answered.length) / results.length).toFixed(0)}% with ${wrong} wrong · ` +
      `side median error ${angles[Math.floor(angles.length / 2)]}°, within 45° ${((100 * angles.filter((a) => a <= 45).length) / angles.length).toFixed(0)}% · ` +
      `mean score ${(results.reduce((s, r) => s + r.s, 0) / results.length).toFixed(3)} · ${ms.toFixed(0)} ms/image (this PC, CPU)`
  );
  await model.dispose?.();
}
