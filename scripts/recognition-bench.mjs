// Recognition benchmark behind ALQAMI's settings (src/recognize/decide.ts, scripts/build-recognition-index.mjs).
// Scanner-like views: the object inside the centre square of a camera frame. Index: 100 Moon covers; unknowns:
// 25 covers left out of the index plus real images that are not in Moon. Download the covers first (one
// <record id>.jpg each), put unknown images in a second folder, then:
//   node scripts/recognition-bench.mjs <covers folder> <unknown images folder>
// 2026-11-09: CLS + plain and framed views: top-1 74%, top-3 84%; score >= 0.76 and gap >= 0.06 answered 61% with
// no wrong answer and 0 of 35 unknowns accepted. Mean patch: top-1 58%. MobileNetV4-small: top-1 23%.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const [coversDir, imagesDir] = process.argv.slice(2);
const covers = readdirSync(coversDir).filter((f) => f.endsWith('.jpg')).sort();
const known = covers.slice(0, 100), heldOut = covers.slice(100);
let seed = 5; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const model = await AutoModel.from_pretrained('Xenova/dinov2-small', { dtype: 'q8' });
const M = [0.485, 0.456, 0.406], S = [0.229, 0.224, 0.225];
async function feats(buf) {
  const { data } = await sharp(buf).removeAlpha().resize(224, 224, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) for (let c = 0; c < 3; c++) px[c * 224 * 224 + i] = (data[i * 3 + c] / 255 - M[c]) / S[c];
  const o = await model({ pixel_values: new Tensor('float32', px, [1, 3, 224, 224]) });
  const d = o.last_hidden_state.data, [, t, dim] = o.last_hidden_state.dims;
  const cls = Float32Array.from(d.slice(0, dim)), mean = new Float32Array(dim);
  for (let i = 1; i < t; i++) for (let k = 0; k < dim; k++) mean[k] += d[i * dim + k];
  const u = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  return { cls: u(cls), mean: u(mean) };
}
async function inFrame(buf, size = 448) {
  const meta = await sharp(buf).rotate().metadata();
  const h = Math.round(size * (0.55 + rand() * 0.25)), w = Math.min(size - 8, Math.round((h * meta.width) / meta.height));
  const bg = { r: 60 + Math.round(rand() * 160), g: 55 + Math.round(rand() * 160), b: 50 + Math.round(rand() * 160), alpha: 1 };
  const turned = await sharp(buf).rotate().resize(w, h, { fit: 'fill' }).rotate((rand() - 0.5) * 10, { background: bg }).toBuffer();
  const fitted = await sharp(turned).resize(size, size, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  const fm = await sharp(fitted).metadata();
  return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([{ input: fitted, left: Math.round((size - fm.width) / 2), top: Math.round((size - fm.height) / 2) }])
    .modulate({ brightness: 0.75 + rand() * 0.45 }).jpeg({ quality: 75 }).toBuffer();
}
async function mild(buf) {
  const { width, height } = await sharp(buf).rotate().metadata();
  const s = 0.85 + rand() * 0.15, w = Math.round(width * s), h = Math.round(height * s);
  return sharp(buf).rotate().extract({ left: Math.round(rand() * (width - w)), top: Math.round(rand() * (height - h)), width: w, height: h })
    .modulate({ brightness: 0.75 + rand() * 0.45 }).jpeg({ quality: 80 }).toBuffer();
}

const index = [];
for (const f of known) {
  const b = readFileSync(join(coversDir, f));
  const plain = [await feats(b), await feats(await mild(b)), await feats(await mild(b))];
  const framed = [];
  for (let k = 0; k < 4; k++) framed.push(await feats(await inFrame(b)));
  index.push({ f, plain, framed });
}
const queries = [];
for (const f of known) for (let k = 0; k < 2; k++) queries.push({ f, known: true, q: await feats(await inFrame(readFileSync(join(coversDir, f)))) });
for (const f of heldOut) queries.push({ f, known: false, q: await feats(await inFrame(readFileSync(join(coversDir, f)))) });
for (const f of readdirSync(imagesDir)) queries.push({ f, known: false, q: await feats(await inFrame(readFileSync(join(imagesDir, f)))) });

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
for (const kind of ['cls', 'mean']) for (const views of ['plain', 'plain+framed']) {
  const rows = queries.map(({ f, known, q }) => {
    const r = index.map((e) => ({ f: e.f, s: Math.max(...(views === 'plain' ? e.plain : [...e.plain, ...e.framed]).map((v) => dot(q[kind], v[kind]))) })).sort((a, b) => b.s - a.s);
    return { known, right: known && r[0].f === f, top3: known && r.slice(0, 3).some((x) => x.f === f), s: r[0].s, m: r[0].s - r[1].s };
  });
  const K = rows.filter((r) => r.known), U = rows.filter((r) => !r.known);
  let best = null;
  for (const T of [0.6, 0.65, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 0.82, 0.84, 0.86, 0.88, 0.9]) for (const Mg of [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08]) {
    const acc = (r) => r.s >= T && r.m >= Mg;
    if (U.some(acc) || K.some((r) => acc(r) && !r.right)) continue;
    const answered = K.filter((r) => acc(r) && r.right).length;
    if (!best || answered > best.answered) best = { T, Mg, answered };
  }
  console.log(`${kind}, ${views}: top-1 ${(100 * K.filter((r) => r.right).length / K.length).toFixed(0)}%, top-3 ${(100 * K.filter((r) => r.top3).length / K.length).toFixed(0)}%; ` +
    (best ? `with score >= ${best.T} and gap >= ${best.Mg}: ${(100 * best.answered / K.length).toFixed(0)}% answered, 0 wrong, 0 of ${U.length} unknowns accepted` : 'no rule with zero wrong'));
}
