// Packs a 4D point-cloud capture (one binary PLY per frame, e.g. from Any4D) into one small file for the web:
// keeps the subject (points near the front, the room behind is dropped), thins each frame, and stores positions as
// 16-bit integers and colours as bytes.
//
//   node scripts/pack-pointcloud.mjs <out.bin> <frame_0.ply> <frame_1.ply> ... [--depth 0.9] [--max 70000]
//     [--crop xmin,xmax,ymin,ymax,zmin]   keep only the subject (capture units); measure it on a depth map first
//
// File: "ALQ4D1" + uint32 header length + JSON header { frames: [{ count, offset }], min, max } + per frame
// count × (int16 x, y, z) followed by count × (uint8 r, g, b).
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  return v;
};
const cropAt = args.indexOf('--crop');
const CROP = cropAt >= 0 ? args.splice(cropAt, 2)[1].split(',').map(Number) : null;
const DEPTH = opt('--depth', 0.9);
const MAX = opt('--max', 70000);
const [out, ...files] = args;

function readPly(path) {
  const buf = readFileSync(path);
  const end = buf.indexOf('end_header\n') + 'end_header\n'.length;
  const header = buf.subarray(0, end).toString('latin1');
  const count = Number(/element vertex (\d+)/.exec(header)[1]);
  const props = [...header.matchAll(/property (\w+) (\w+)/g)].map((m) => ({ type: m[1], name: m[2] }));
  const size = { float: 4, uchar: 1 };
  const stride = props.reduce((s, p) => s + size[p.type], 0);
  const at = Object.fromEntries(props.map((p, i) => [p.name, props.slice(0, i).reduce((s, q) => s + size[q.type], 0)]));
  const pos = new Float32Array(count * 3);
  const col = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = end + i * stride;
    pos[i * 3] = buf.readFloatLE(o + at.x);
    pos[i * 3 + 1] = buf.readFloatLE(o + at.y);
    pos[i * 3 + 2] = buf.readFloatLE(o + at.z);
    col[i * 3] = buf[o + at.red];
    col[i * 3 + 1] = buf[o + at.green];
    col[i * 3 + 2] = buf[o + at.blue];
  }
  return { count, pos, col };
}

const frames = files.map(readPly);
// The subject is the nearest thing to the camera (largest z, the camera looks down -z): keep a band behind it.
const kept = frames.map(({ count, pos, col }) => {
  const zs = Float32Array.from({ length: count }, (_, i) => pos[i * 3 + 2]).sort();
  const front = zs[Math.floor(count * 0.98)];
  const idx = [];
  const inCrop = (i) =>
    !CROP || (pos[i * 3] >= CROP[0] && pos[i * 3] <= CROP[1] && pos[i * 3 + 1] >= CROP[2] && pos[i * 3 + 1] <= CROP[3] && pos[i * 3 + 2] >= CROP[4]);
  for (let i = 0; i < count; i++) if (pos[i * 3 + 2] >= front - DEPTH && inCrop(i)) idx.push(i);
  // Thin evenly to at most MAX points.
  const step = Math.max(1, idx.length / MAX);
  const pick = [];
  for (let k = 0; k < idx.length; k += step) pick.push(idx[Math.floor(k)]);
  return { pos, col, pick };
});
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const { pos, pick } of kept)
  for (const i of pick)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i * 3 + k]);
      max[k] = Math.max(max[k], pos[i * 3 + k]);
    }

const parts = [];
const header = { frames: [], min, max };
let offset = 0;
for (const { pos, col, pick } of kept) {
  const q = new Int16Array(pick.length * 3);
  const c = new Uint8Array(pick.length * 3);
  pick.forEach((i, n) => {
    for (let k = 0; k < 3; k++) {
      q[n * 3 + k] = Math.round(((pos[i * 3 + k] - min[k]) / (max[k] - min[k] || 1)) * 65535 - 32768);
      c[n * 3 + k] = col[i * 3 + k];
    }
  });
  header.frames.push({ count: pick.length, offset });
  parts.push(Buffer.from(q.buffer), Buffer.from(c));
  offset += q.byteLength + c.byteLength;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) parts.push(Buffer.alloc(pad)), (offset += pad);
}
const json = Buffer.from(JSON.stringify(header));
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32LE(json.length);
const prefix = Buffer.concat([Buffer.from('ALQ4D1'), lenBuf, json]);
const padHead = Buffer.alloc((4 - (prefix.length % 4)) % 4, 0x20);
// The header length includes the padding so the data starts 4-byte aligned.
lenBuf.writeUInt32LE(json.length + padHead.length);
const file = Buffer.concat([Buffer.from('ALQ4D1'), lenBuf, json, padHead, ...parts]);
writeFileSync(out, file);
console.log(
  `${frames.length} frames: ${kept.map((k) => k.pick.length).join(', ')} points; box ${min.map((v) => v.toFixed(2))} → ${max.map((v) => v.toFixed(2))}; ${(file.length / 1e6).toFixed(2)} MB`
);
