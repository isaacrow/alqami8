// scripts/alkafeel-sight-bench.mjs
// How well "recognise by sight" would do in the Al-Kafeel Museum halls, measured on the committed index
// (public/data/recognition-dinov2s.json) with views made to look like a visitor's phone at a glass case:
// turned and sheared, partly out of frame, glare and a reflection on the glass, dim warm light, blur and noise.
//
// Known objects: 4 such views of every museum object. Unknown objects: every 6th museum object is taken OUT of the
// index and its views are asked for; any confident answer to those is a wrong name shown to a visitor, the one
// mistake a museum guide must not make. Prints answered / wrong / unknowns accepted for a grid of score floors and
// gaps, so the rule in src/recognize/decide.ts can be chosen from numbers.
//
//   node scripts/alkafeel-sight-bench.mjs            (about 2-4 minutes on a laptop CPU)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const VIEWS_PER_OBJECT = 4;

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

let seed = 29;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a, b) => a + rand() * (b - a);

/** A soft white glare blob, as a lamp reflected in the case glass. */
function glareSvg(size) {
  const cx = Math.round(between(0.15, 0.85) * size);
  const cy = Math.round(between(0.1, 0.6) * size);
  const r = Math.round(between(0.12, 0.3) * size);
  return Buffer.from(
    `<svg width="${size}" height="${size}"><defs><radialGradient id="g"><stop offset="0" stop-color="white" stop-opacity="${between(0.45, 0.8).toFixed(2)}"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${Math.round(r * between(0.4, 1))}" fill="url(#g)"/></svg>`,
  );
}

/** One phone view of an object behind glass. `other` is another object's photo, used as the reflection. */
async function caseView(buf, other) {
  const size = 448;
  const meta = await sharp(buf).rotate().metadata();
  // Part of the object only, sometimes: visitors frame what interests them.
  const keep = rand() < 0.5 ? between(0.7, 0.92) : 1;
  const cw = Math.round(meta.width * keep);
  const ch = Math.round(meta.height * keep);
  const part = await sharp(buf)
    .rotate()
    .extract({ left: Math.round(rand() * (meta.width - cw)), top: Math.round(rand() * (meta.height - ch)), width: cw, height: ch })
    .toBuffer();
  const h = Math.round(size * between(0.5, 0.85));
  const w = Math.min(size - 8, Math.round((h * cw) / ch));
  const bg = { r: Math.round(between(15, 90)), g: Math.round(between(15, 80)), b: Math.round(between(15, 70)), alpha: 1 };
  // Seen from the side: a shear and a turn.
  const sheared = await sharp(part)
    .resize(w, h, { fit: 'fill' })
    .affine([1, between(-0.18, 0.18), between(-0.08, 0.08), 1], { background: bg })
    .rotate(between(-12, 12), { background: bg })
    .toBuffer();
  const fitted = await sharp(sheared).resize(size, size, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  const fm = await sharp(fitted).metadata();
  const reflection = await sharp(other).rotate().resize(size, size, { fit: 'cover' }).blur(3).ensureAlpha(between(0.1, 0.22)).png().toBuffer();
  const scene = await sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([
      { input: fitted, left: Math.round((size - fm.width) / 2), top: Math.round((size - fm.height) / 2) },
      { input: reflection, blend: 'screen' },
      ...(rand() < 0.7 ? [{ input: glareSvg(size) }] : []),
    ])
    .png()
    .toBuffer();
  // Dim, warm museum light; a little shake; a phone's noisy JPEG.
  return sharp(scene)
    .modulate({ brightness: between(0.55, 1.05), saturation: between(0.8, 1.15) })
    .tint({ r: 255, g: Math.round(between(225, 250)), b: Math.round(between(190, 235)) })
    .blur(between(0.3, 1.6))
    .jpeg({ quality: Math.round(between(50, 75)) })
    .toBuffer();
}

const index = JSON.parse(readFileSync('public/data/recognition-dinov2s.json', 'utf8'));
const decode = (b64) => {
  const buf = Buffer.from(b64, 'base64');
  const v = Float32Array.from(new Int8Array(buf.buffer, buf.byteOffset, buf.length), (x) => x / 127);
  const n = Math.hypot(...v) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
};
const allEntries = index.entries.map((e) => ({ key: e.key, views: e.views.map(decode) }));

const museumKeys = allEntries.filter((e) => e.key.startsWith('alkafeel:')).map((e) => e.key).sort();
const unknownKeys = new Set(museumKeys.filter((_, i) => i % 6 === 3));
const photoOf = (key) => {
  const dir = join('enrol', key.replace(':', '__'));
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((x) => /\.(jpe?g|png|webp)$/i.test(x));
  return f ? readFileSync(join(dir, f)) : null;
};

function ranked(q, entries) {
  return entries
    .map((e) => {
      let best = -1;
      for (const v of e.views) {
        let s = 0;
        for (let k = 0; k < v.length; k++) s += v[k] * q[k];
        if (s > best) best = s;
      }
      return { key: e.key, score: best };
    })
    .sort((a, b) => b.score - a.score);
}

// Known: every object, with the full index. Unknown: the held-out objects, against the index without them.
const withoutUnknowns = allEntries.filter((e) => !unknownKeys.has(e.key));
const known = [];
const unknown = [];
const photos = museumKeys.map(photoOf);
const started = Date.now();
for (let i = 0; i < museumKeys.length; i++) {
  const key = museumKeys[i];
  if (!photos[i]) continue;
  for (let v = 0; v < VIEWS_PER_OBJECT; v++) {
    const other = photos[(i + 1 + Math.floor(rand() * (photos.length - 1))) % photos.length] || photos[i];
    const q = await embed(await caseView(photos[i], other));
    const r = ranked(q, allEntries);
    known.push({ key, top: r[0], second: r[1], top3: r.slice(0, 3).map((x) => x.key) });
    if (unknownKeys.has(key)) {
      const u = ranked(q, withoutUnknowns);
      unknown.push({ key, top: u[0], second: u[1] });
    }
  }
}

const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;

// The scanner needs the same answer in several frames in a row (DEFAULT_DECIDE.steadyFrames). As a stand-in, an
// object counts as named when at least 3 of its 4 different views give the same accepted answer.
function steady(views, ok) {
  const byObject = new Map();
  for (const v of views) byObject.set(v.key, [...(byObject.get(v.key) || []), v]);
  let right = 0;
  let wrong = 0;
  for (const [key, vs] of byObject) {
    const votes = new Map();
    for (const v of vs) if (ok(v)) votes.set(v.top.key, (votes.get(v.top.key) || 0) + 1);
    const [best, n] = [...votes].sort((a, b) => b[1] - a[1])[0] || [null, 0];
    if (n >= 3) best === key ? right++ : wrong++;
  }
  return { right, wrong, objects: byObject.size };
}
const top1 = known.filter((x) => x.top.key === x.key).length;
const top3 = known.filter((x) => x.top3.includes(x.key)).length;
console.log(`\n${known.length} known views of ${museumKeys.length} objects, ${unknown.length} views of ${unknownKeys.size} objects not in the index (${Math.round((Date.now() - started) / 1000)} s)`);
console.log(`Ranking alone: right object first ${pct(top1, known.length)}, in the first three ${pct(top3, known.length)}`);
console.log('\n             single frame                          | 3 steady frames (objects)');
console.log('floor  gap  | answered  wrong-named | unknown named | named right  wrong | unknown named');
for (const floor of [0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 0.82, 0.84]) {
  for (const gap of [0.02, 0.04, 0.06, 0.08, 0.1]) {
    const ok = (x) => x.top.score >= floor && x.top.score - x.second.score >= gap;
    const answered = known.filter(ok);
    const wrong = answered.filter((x) => x.top.key !== x.key).length;
    const fa = unknown.filter(ok).length;
    const sk = steady(known, ok);
    const su = steady(unknown, ok);
    console.log(
      `${floor.toFixed(2)}  ${gap.toFixed(2)} | ${pct(answered.length - wrong, known.length).padStart(7)}   ${String(wrong).padStart(3)} (${pct(wrong, known.length)})  | ${String(fa).padStart(3)} of ${unknown.length}     | ${pct(sk.right, sk.objects).padStart(6)}   ${String(sk.wrong).padStart(4)}  | ${su.right + su.wrong} of ${su.objects}`,
    );
  }
}

// Objects not in the index that still get a steady name: show the pair, they are usually near twins.
{
  const ok = (x) => x.top.score >= 0.72 && x.top.score - x.second.score >= 0.06;
  const byObject = new Map();
  for (const v of unknown) byObject.set(v.key, [...(byObject.get(v.key) || []), v]);
  for (const [key, vs] of byObject) {
    const named = vs.filter(ok).map((v) => `${v.top.key} (${v.top.score.toFixed(3)})`);
    if (named.length >= 3) console.log(`Not in the index but named at 0.72/0.06: ${key} -> ${named.join(', ')}`);
  }
}
