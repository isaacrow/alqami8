// Turns a scan of a manuscript leaf or an open book into a small 3D model (.glb): the scan on the front of a thin
// sheet with paper-coloured back and edges. An open book can be folded along its spine (the two pages rise a little
// towards the reader), so it reads as a book in the 3D viewer and in AR on its QR label.
//
// Recognition renders such flat objects only from the front (`flat: true` on the model in alqamiArtifacts.ts):
// their plain back would otherwise look like any sheet of paper.
//
//   node scripts/page-glb.mjs <scan> <out.glb> --width <metres> [--fold <degrees>] [--paper <hex>]
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const [, , input, output] = process.argv;
const arg = (name, d) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : d);
const WIDTH = Number(arg('--width', '0.4'));
const FOLD = (Number(arg('--fold', '0')) * Math.PI) / 180;
const PAPER = arg('--paper', 'e8dcc0');
const THICK = 0.004;
if (!input || !output) throw new Error('usage: node scripts/page-glb.mjs <scan> <out.glb> --width <metres> [--fold <degrees>]');

const meta = await sharp(input).rotate().metadata();
const jpg = await sharp(input).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
const W = WIDTH;
const H = (WIDTH * meta.height) / meta.width;

// The sheet's columns across (x from -W/2 to W/2); with a fold, the outer edges come forward (z) by |x|·tan(fold).
const cols = FOLD ? [-W / 2, 0, W / 2] : [-W / 2, W / 2];
const zOf = (x) => Math.abs(x) * Math.tan(FOLD);
const front = { pos: [], uv: [], idx: [] };
const back = { pos: [], uv: [], idx: [] };
for (const [k, x] of cols.entries()) {
  for (const y of [-H / 2, H / 2]) {
    front.pos.push(x, y, zOf(x));
    front.uv.push((x + W / 2) / W, 1 - (y + H / 2) / H);
    back.pos.push(x, y, zOf(x) - THICK);
    back.uv.push(0, 0);
  }
  if (k > 0) {
    const a = (k - 1) * 2;
    front.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    back.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}
// Edges: the four sides of the sheet between front and back.
const ring = [];
for (const x of cols) ring.push([x, -H / 2]);
for (const x of [...cols].reverse()) ring.push([x, H / 2]);
const bi = back.pos.length / 3;
for (let i = 0; i < ring.length; i++) {
  const [x0, y0] = ring[i];
  const [x1, y1] = ring[(i + 1) % ring.length];
  const s = back.pos.length / 3;
  back.pos.push(x0, y0, zOf(x0), x1, y1, zOf(x1), x0, y0, zOf(x0) - THICK, x1, y1, zOf(x1) - THICK);
  back.uv.push(0, 0, 0, 0, 0, 0, 0, 0);
  back.idx.push(s, s + 2, s + 1, s + 1, s + 2, s + 3);
}
void bi;

// Flat normals per triangle are enough for a sheet; compute vertex normals by averaging.
function normals(m) {
  const n = new Float32Array(m.pos.length);
  for (let i = 0; i < m.idx.length; i += 3) {
    const [a, b, c] = [m.idx[i], m.idx[i + 1], m.idx[i + 2]].map((j) => m.pos.slice(j * 3, j * 3 + 3));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const j of [m.idx[i], m.idx[i + 1], m.idx[i + 2]]) for (let k = 0; k < 3; k++) n[j * 3 + k] += f[k];
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

// Binary buffer: front (pos, normal, uv, idx), back (pos, normal, uv, idx), then the image.
const chunks = [];
const views = [];
const accessors = [];
let offset = 0;
function add(data, target, type, componentType, count, minmax) {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const pad = (4 - (buf.length % 4)) % 4;
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
  chunks.push(buf, Buffer.alloc(pad));
  offset += buf.length + pad;
  accessors.push({ bufferView: views.length - 1, componentType, count, type, ...(minmax || {}) });
  return accessors.length - 1;
}
function mesh(m) {
  const p = Float32Array.from(m.pos);
  const min = [0, 1, 2].map((k) => Math.min(...p.filter((_, i) => i % 3 === k)));
  const max = [0, 1, 2].map((k) => Math.max(...p.filter((_, i) => i % 3 === k)));
  return {
    POSITION: add(p, 34962, 'VEC3', 5126, p.length / 3, { min, max }),
    NORMAL: add(normals(m), 34962, 'VEC3', 5126, p.length / 3),
    TEXCOORD_0: add(Float32Array.from(m.uv), 34962, 'VEC2', 5126, m.uv.length / 2),
    indices: add(Uint16Array.from(m.idx), 34963, 'SCALAR', 5123, m.idx.length),
  };
}
const fa = mesh(front);
const ba = mesh(back);
const imgOffset = offset;
chunks.push(jpg, Buffer.alloc((4 - (jpg.length % 4)) % 4));
views.push({ buffer: 0, byteOffset: imgOffset, byteLength: jpg.length });
offset += jpg.length + ((4 - (jpg.length % 4)) % 4);
const bin = Buffer.concat(chunks);

const rgb = [0, 2, 4].map((i) => (parseInt(PAPER.slice(i, i + 2), 16) / 255) ** 2.2);
const gltf = {
  asset: { version: '2.0', generator: 'alqami page-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'page' }],
  meshes: [
    {
      primitives: [
        { attributes: { POSITION: fa.POSITION, NORMAL: fa.NORMAL, TEXCOORD_0: fa.TEXCOORD_0 }, indices: fa.indices, material: 0 },
        { attributes: { POSITION: ba.POSITION, NORMAL: ba.NORMAL, TEXCOORD_0: ba.TEXCOORD_0 }, indices: ba.indices, material: 1 },
      ],
    },
  ],
  materials: [
    { name: 'scan', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.85 } },
    { name: 'paper', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
  ],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: [{ bufferView: views.length - 1, mimeType: 'image/jpeg' }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: views,
  accessors,
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(json.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bin.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(output, Buffer.concat([header, jh, json, bh, bin]));
console.log(`${output}: ${W.toFixed(3)} × ${H.toFixed(3)} m, ${(12 + 16 + json.length + bin.length) >> 10} kB`);
