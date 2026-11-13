// Builds public/data/recognition-dinov2s.json: reference embeddings for ALQAMI's "scan by sight".
//
// Sources: the cover of every published Moon record (Moon's public storage), enrolment photos in
// enrol/<key>/*.jpg|png, where <key> is "moon:<record id>" or "artifact:<ALQAMI id>" (":" written as "__" on disk),
// and renders of every 3D object from all around (renders/<key>/az<deg>_el<deg>.jpg, made by
// scripts/render-object-views.mjs). A render's view keeps its azimuth, so a match also says which side is in view.
// Each source image also gets a few mild variations (crop, tilt, light), which helps photos taken in a hall match.
//
// Runs in the deploy workflow (on every push and nightly). Image preparation must match src/recognize/embedder.ts.
//
//   node scripts/build-recognition-index.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const MOON_API = 'https://gfbagczwhvxxstbfrfhu.supabase.co/functions/v1/make-server-49c0e13c';
const MOON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmYmFnY3p3aHZ4eHN0YmZyZmh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODg4OTksImV4cCI6MjA4NjM2NDg5OX0.Hrib4UwwVvCu0o7K51UAICoSmd2J-0XlkLegdkIqLJk';
const COVERS = 'https://gfbagczwhvxxstbfrfhu.supabase.co/storage/v1/object/public/covers';
const MODEL = 'Xenova/dinov2-small';
const KEY = 'dinov2s';
const VARIATIONS = 2;
// Views as the scanner sees them: the object inside the guide square, with surroundings around it.
const IN_FRAME = 4;
// Below this score nothing counts as a match, together with the gap rule in src/recognize/decide.ts. Measured on
// scanner-like views: score >= 0.76 and gap >= 0.06 answered 61% of known covers with no wrong answer and accepted none
// of 35 unknown images (scripts/recognition-bench.mjs, 2026-11-09).
const SCORE_FLOOR = 0.76;

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const model = await AutoModel.from_pretrained(MODEL, { dtype: 'q8' });

async function embed(buf) {
  const { data } = await sharp(buf).rotate().removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await model({ pixel_values: new Tensor('float32', px, [1, 3, SIZE, SIZE]) });
  const d = out.last_hidden_state.data;
  const [, tokens, dim] = out.last_hidden_state.dims;
  // The CLS token, unit length: matches clsToken() in src/recognize/embedder.ts.
  const v = Float32Array.from(d.slice(0, dim));
  const n = Math.hypot(...v) || 1;
  for (let k = 0; k < dim; k++) v[k] /= n;
  return v;
}

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
async function variation(buf) {
  const { width, height } = await sharp(buf).rotate().metadata();
  const s = 0.85 + rand() * 0.15;
  const w = Math.round(width * s), h = Math.round(height * s);
  const bg = { r: 110 + Math.round(rand() * 90), g: 100 + Math.round(rand() * 90), b: 90 + Math.round(rand() * 90), alpha: 1 };
  return sharp(buf).rotate()
    .extract({ left: Math.round(rand() * (width - w)), top: Math.round(rand() * (height - h)), width: w, height: h })
    .rotate((rand() - 0.5) * 8, { background: bg })
    .modulate({ brightness: 0.75 + rand() * 0.45 })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// The object at 55-80% of a square view on a plain surround, slightly turned: what the scanner's centre square
// holds when a visitor points at a book or object.
async function inFrame(buf) {
  const size = 448;
  const meta = await sharp(buf).rotate().metadata();
  const h = Math.round(size * (0.55 + rand() * 0.25));
  const w = Math.min(size - 8, Math.round((h * meta.width) / meta.height));
  const bg = { r: 60 + Math.round(rand() * 160), g: 55 + Math.round(rand() * 160), b: 50 + Math.round(rand() * 160), alpha: 1 };
  const turned = await sharp(buf).rotate().resize(w, h, { fit: 'fill' }).rotate((rand() - 0.5) * 10, { background: bg }).toBuffer();
  const fitted = await sharp(turned).resize(size, size, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  const fm = await sharp(fitted).metadata();
  return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([{ input: fitted, left: Math.round((size - fm.width) / 2), top: Math.round((size - fm.height) / 2) }])
    .modulate({ brightness: 0.75 + rand() * 0.45 })
    .jpeg({ quality: 80 })
    .toBuffer();
}

const encode =(v) => Buffer.from(Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round(x * 127)))).buffer).toString('base64');
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

async function moonCovers() {
  const out = [];
  for (let offset = 0; ; offset += 200) {
    const res = await fetch(`${MOON_API}/records/search?view=published&limit=200&offset=${offset}`, { headers: { Authorization: `Bearer ${MOON_KEY}` } });
    if (!res.ok) throw new Error(`Moon search ${res.status}`);
    const page = await res.json();
    for (const r of page.records) {
      const img = await fetch(`${COVERS}/${encodeURIComponent(r.id)}.jpg`);
      if (img.ok) out.push({ key: `moon:${r.id}`, images: [Buffer.from(await img.arrayBuffer())] });
    }
    if (page.records.length < 200) break;
  }
  return out;
}

function enrolment() {
  const root = join(process.cwd(), 'enrol');
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      key: d.name.replace('__', ':'),
      images: readdirSync(join(root, d.name)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => readFileSync(join(root, d.name, f))),
    }))
    .filter((s) => s.images.length);
}

const sources = new Map();
for (const s of [...(await moonCovers()), ...enrolment()]) {
  sources.set(s.key, [...(sources.get(s.key) || []), ...s.images]);
}

// Renders from all around: already varied in background, light, size and tilt, so each is embedded once.
function renders() {
  const root = join(process.cwd(), 'renders');
  if (!existsSync(root)) return new Map();
  const out = new Map();
  for (const d of readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const shots = readdirSync(join(root, d.name))
      .map((f) => ({ f, m: /^az(\d+)_el(\d+)\.jpg$/.exec(f) }))
      .filter((x) => x.m)
      .map((x) => ({ azimuth: Number(x.m[1]), image: readFileSync(join(root, d.name, x.f)) }));
    if (shots.length) out.set(d.name.replace('__', ':'), shots);
  }
  return out;
}
const rendered = renders();

const entries = [];
for (const key of new Set([...sources.keys(), ...rendered.keys()])) {
  const views = [];
  const angles = [];
  for (const img of sources.get(key) || []) {
    views.push(await embed(img));
    for (let k = 0; k < VARIATIONS; k++) views.push(await embed(await variation(img)));
    for (let k = 0; k < IN_FRAME; k++) views.push(await embed(await inFrame(img)));
  }
  while (angles.length < views.length) angles.push(null);
  for (const shot of rendered.get(key) || []) {
    views.push(await embed(shot.image));
    angles.push(shot.azimuth);
  }
  entries.push({ key, views, angles });
}

for (const e of entries) e.threshold = SCORE_FLOOR;

mkdirSync(join(process.cwd(), 'public', 'data'), { recursive: true });
const file = {
  model: KEY,
  dim: entries[0]?.views[0].length ?? 0,
  builtAt: new Date().toISOString(),
  entries: entries.map((e) => ({
    key: e.key,
    threshold: Number(e.threshold.toFixed(3)),
    views: e.views.map(encode),
    // Azimuth of each view (degrees around the object, 0 = its front), null for photos and covers.
    ...(e.angles.some((a) => a !== null) ? { angles: e.angles } : {}),
  })),
};
writeFileSync(join(process.cwd(), 'public', 'data', `recognition-${KEY}.json`), JSON.stringify(file));
console.log(`Recognition index: ${entries.length} entries, ${entries.reduce((n, e) => n + e.views.length, 0)} views.`);
