// Can DINOv2's patch tokens find known objects in one look? (Plan 5, step 2.)
//
// Each object gets a "patch fingerprint": the mean of the foreground patch tokens of its renders (renders/). A test
// image is made from real clutter (a desk photo) with two unseen views of different objects pasted in (renders-test/,
// angles the index never saw). The whole image goes through DINOv2 once; every patch is compared with every
// fingerprint, which gives a heat map per object. We check (1) whether the two hottest objects are the two pasted
// ones and (2) whether each one's hottest patch falls inside where it was pasted. Baseline: the scanner's 6-cell sweep
// with CLS matching (each cell embedded separately).
//
//   node scripts/patch-bench.mjs [clutter.jpg ...]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { AutoModel, Tensor } from '@huggingface/transformers';

const SIZE = 224;
const GRID = 16;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const model = await AutoModel.from_pretrained('Xenova/dinov2-small', { dtype: 'q8' });

async function tokens(buf) {
  const { data } = await sharp(buf).removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await model({ pixel_values: new Tensor('float32', px, [1, 3, SIZE, SIZE]) });
  const h = out.last_hidden_state;
  const [, n, d] = h.dims;
  const unit = (v) => {
    const m = Math.hypot(...v) || 1;
    return v.map((x) => x / m);
  };
  const cls = unit(Float32Array.from(h.data.subarray(0, d)));
  const patches = [];
  for (let i = n - GRID * GRID; i < n; i++) patches.push(unit(Float32Array.from(h.data.subarray(i * d, (i + 1) * d))));
  return { cls, patches };
}
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

// Fingerprints: per object, the mean of the patches most like its own view (the object, not the backdrop).
const objects = readdirSync('renders');
const prints = {};
const clsIndex = {};
for (const o of objects) {
  const sum = new Float32Array(384);
  clsIndex[o] = [];
  for (const f of readdirSync(join('renders', o)).filter((x) => x.endsWith('.jpg'))) {
    const { cls, patches } = await tokens(readFileSync(join('renders', o, f)));
    clsIndex[o].push(cls);
    const scored = patches.map((p) => dot(p, cls)).map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    for (const [, i] of scored.slice(0, 96)) for (let k = 0; k < 384; k++) sum[k] += patches[i][k];
  }
  const m = Math.hypot(...sum) || 1;
  prints[o] = sum.map((x) => x / m);
  process.stdout.write('.');
}
console.log(`\n${objects.length} fingerprints`);

// Test scenes: clutter + two different unseen views pasted at random places (each 30–40% of the frame's width).
const clutter = process.argv.slice(2);
let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const W = 720;
const H = 960;
let idBoth = 0, locHit = 0, locTotal = 0, sweepBoth = 0, scenes = 0;
let msOne = 0, msSweep = 0;
// The full pipeline: one look finds hot spots, each is cropped and confirmed with the safe CLS rule.
let pipeRight = 0, pipeWrong = 0, pipeTotal = 0, msPipe = 0;
const samples = []; // { score, gap, present }
for (let s = 0; s < 40; s++) {
  const a = objects[Math.floor(rand() * objects.length)];
  let b = objects[Math.floor(rand() * objects.length)];
  while (b === a) b = objects[Math.floor(rand() * objects.length)];
  const pick = (o) => {
    const fs = readdirSync(join('renders-test', o));
    return readFileSync(join('renders-test', o, fs[Math.floor(rand() * fs.length)]));
  };
  const bg = await sharp(readFileSync(clutter[s % clutter.length])).resize(W, H, { fit: 'cover' }).toBuffer();
  const place = [];
  const comps = [];
  for (const [o, side] of [[a, 0], [b, 1]]) {
    const w = Math.round(W * (0.3 + rand() * 0.1));
    // Cut the object out of its render (its backdrop is a gradient): keep the centre square.
    const tile = await sharp(pick(o)).extract({ left: 64, top: 64, width: 320, height: 320 }).resize(w, w).toBuffer();
    const x = side === 0 ? Math.round(rand() * (W / 2 - w)) : Math.round(W / 2 + rand() * (W / 2 - w));
    const y = Math.round(H * 0.15 + rand() * (H * 0.6 - w));
    place.push({ o, x, y, w });
    comps.push({ input: tile, left: x, top: y });
  }
  const scene = await sharp(bg).composite(comps).jpeg().toBuffer();
  scenes++;

  // One look: the whole scene (as a 224 square of its centre 720x720 would crop too much; use the full frame).
  let t = performance.now();
  const { patches } = await tokens(scene);
  const heat = {};
  for (const o of objects) heat[o] = patches.map((p) => dot(p, prints[o]));
  // An object's score: the mean of its 6 hottest patches; location: the hottest patch.
  const score = Object.entries(heat)
    .map(([o, h]) => [o, [...h].sort((x, y) => y - x).slice(0, 6).reduce((u, v) => u + v, 0) / 6])
    .sort((x, y) => y[1] - x[1]);
  msOne += performance.now() - t;
  for (let k = 0; k < score.length; k++) samples.push({ score: score[k][1], gap: score[k][1] - (score[k + 2]?.[1] ?? score[score.length - 1][1]), present: score[k][0] === a || score[k][0] === b });
  const top2 = score.slice(0, 2).map((x) => x[0]);
  if (top2.includes(a) && top2.includes(b)) idBoth++;
  for (const p of place) {
    if (!top2.includes(p.o)) continue;
    locTotal++;
    const h = heat[p.o];
    const best = h.indexOf(Math.max(...h));
    const px = ((best % GRID) + 0.5) * (W / GRID);
    const py = (Math.floor(best / GRID) + 0.5) * (H / GRID);
    if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.w) locHit++;
  }

  // Pipeline: for the 3 hottest objects, crop around the hot spot (centroid of its 12 hottest patches, size from their
  // spread) and confirm with the safe rule (score >= 0.76 and 0.06 ahead), as the app does.
  t = performance.now();
  const confirmed = new Set();
  for (const [o] of score.slice(0, 3)) {
    const h = heat[o];
    const top = h.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).slice(0, 12);
    const xs = top.map(([, i]) => ((i % GRID) + 0.5) / GRID);
    const ys = top.map(([, i]) => (Math.floor(i / GRID) + 0.5) / GRID);
    const mx = xs.reduce((u, v) => u + v, 0) / xs.length;
    const my = ys.reduce((u, v) => u + v, 0) / ys.length;
    const sd = Math.sqrt(xs.reduce((u, v) => u + (v - mx) ** 2, 0) / xs.length + ys.reduce((u, v) => u + (v - my) ** 2, 0) / ys.length);
    const sideN = Math.min(0.9, Math.max(0.28, sd * 4.5));
    const side = Math.round(Math.min(W, H) * sideN);
    const left = Math.max(0, Math.min(W - side, Math.round(mx * W - side / 2)));
    const topY = Math.max(0, Math.min(H - side, Math.round(my * H - side / 2)));
    const crop = await sharp(scene).extract({ left, top: topY, width: side, height: side }).toBuffer();
    const { cls } = await tokens(crop);
    const ranked = objects.map((q) => [q, Math.max(...clsIndex[q].map((v) => dot(v, cls)))]).sort((x, y) => y[1] - x[1]);
    if (ranked[0][1] >= 0.76 && ranked[0][1] - ranked[1][1] >= 0.06) confirmed.add(ranked[0][0]);
  }
  msPipe += performance.now() - t + 0;
  pipeTotal += 2;
  for (const q of confirmed) (q === a || q === b ? pipeRight++ : pipeWrong++);

  // Baseline: the scanner's sweep, 6 square cells (half the shorter side), CLS against the CLS index, best per cell.
  t = performance.now();
  const found = new Set();
  const side = Math.round(Math.min(W, H) * 0.55);
  for (const [cx, cy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.55], [0.7, 0.55], [0.3, 0.78], [0.7, 0.78]]) {
    const left = Math.max(0, Math.min(W - side, Math.round(cx * W - side / 2)));
    const top = Math.max(0, Math.min(H - side, Math.round(cy * H - side / 2)));
    const cell = await sharp(scene).extract({ left, top, width: side, height: side }).toBuffer();
    const { cls } = await tokens(cell);
    const ranked = objects.map((o) => [o, Math.max(...clsIndex[o].map((v) => dot(v, cls)))]).sort((x, y) => y[1] - x[1]);
    if (ranked[0][1] >= 0.76 && ranked[0][1] - ranked[1][1] >= 0.06) found.add(ranked[0][0]);
  }
  msSweep += performance.now() - t;
  if (found.has(a) && found.has(b)) sweepBoth++;
}
const pct = (x, n) => `${Math.round((100 * x) / n)}%`;
console.log(`${scenes} scenes, 2 objects each, on real clutter`);
console.log(`one look (patch fingerprints): both objects named ${pct(idBoth, scenes)}, located ${pct(locHit, locTotal)} · ${Math.round(msOne / scenes)} ms/scene (CPU)`);
console.log(`one look + confirm (safe rule): objects tagged ${pct(pipeRight, pipeTotal)}, wrong tags ${pipeWrong} · ${Math.round((msOne + msPipe) / scenes)} ms/scene (CPU)`);
console.log(`6-cell sweep (CLS, safe rule): both objects found ${pct(sweepBoth, scenes)} · ${Math.round(msSweep / scenes)} ms/scene (CPU)`);

// Scenes with no catalogued object at all: the desk photos themselves (an astronaut figurine, a cup, a monitor).
for (const c of clutter) {
  const { patches } = await tokens(await sharp(readFileSync(c)).resize(W, H, { fit: 'cover' }).jpeg().toBuffer());
  for (const o of objects) {
    const h = patches.map((p) => dot(p, prints[o]));
    samples.push({ score: [...h].sort((x, y) => y - x).slice(0, 6).reduce((u, v) => u + v, 0) / 6, gap: 0, present: false });
  }
}
const absent = samples.filter((x) => !x.present).map((x) => x.score).sort((x, y) => y - x);
const present = samples.filter((x) => x.present).map((x) => x.score).sort((x, y) => y - x);
const q = (a, p) => a[Math.floor(p * (a.length - 1))].toFixed(3);
console.log(`patch score, present objects: max ${q(present, 0)} median ${q(present, 0.5)} min ${q(present, 1)} (n=${present.length})`);
console.log(`patch score, absent objects:  max ${q(absent, 0)} 99th ${q(absent, 0.01)} median ${q(absent, 0.5)} (n=${absent.length})`);
for (const th of [absent[0] + 0.005, absent[0] + 0.02]) {
  console.log(`  threshold ${th.toFixed(3)} (above every absent score): tags ${Math.round((100 * present.filter((x) => x >= th).length) / present.length)}% of present objects, 0 wrong`);
}
