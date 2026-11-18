// Slims heavy 3D models: every mesh above `max` triangles is simplified to about `target` with meshoptimizer, keeping
// its UVs (so the baked texture still fits) and normals; textures and everything else are copied as they are.
//
//   node scripts/slim-glb.mjs <file.glb …> [--max 80000] [--target 50000] [--dry]
//
// Writes over each file it slims (git keeps the original). TripoSR meshes come out at up to 725k triangles; on an
// iPhone one of those in a 3D view costs as much memory as a whole page.
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args.splice(i, 2)[1]) : d; };
const MAX = opt('--max', 80000);
const TARGET = opt('--target', 50000);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));
await MeshoptSimplifier.ready;

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const TYPED = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };

function read(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  return { json, bin };
}
function accessor(g, i) {
  const a = g.json.accessors[i];
  const v = g.json.bufferViews[a.bufferView];
  const n = SIZE[a.type];
  const T = TYPED[a.componentType];
  if (v.byteStride && v.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('interleaved data not handled');
  const start = (v.byteOffset || 0) + (a.byteOffset || 0);
  return new T(g.bin.buffer.slice(g.bin.byteOffset + start, g.bin.byteOffset + start + a.count * n * T.BYTES_PER_ELEMENT));
}

for (const file of files) {
  const g = read(file);
  const views = []; // new bufferViews' data, in order
  const newViews = [];
  const addView = (data, target) => {
    newViews.push({ buffer: 0, byteLength: data.byteLength, ...(target ? { target } : {}) });
    views.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    return newViews.length - 1;
  };
  const accessors = [];
  const keepViews = new Map(); // old bufferView → new (images and anything not rewritten)
  const copyView = (old) => {
    if (!keepViews.has(old)) {
      const v = g.json.bufferViews[old];
      const data = g.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
      newViews.push({ buffer: 0, byteLength: v.byteLength, ...(v.target ? { target: v.target } : {}), ...(v.byteStride ? { byteStride: v.byteStride } : {}) });
      views.push(Buffer.from(data));
      keepViews.set(old, newViews.length - 1);
    }
    return keepViews.get(old);
  };
  const report = [];
  let changed = false;
  for (const mesh of g.json.meshes || []) {
    for (const p of mesh.primitives) {
      const tris = p.indices != null ? g.json.accessors[p.indices].count / 3 : 0;
      if (p.indices == null || tris <= MAX) {
        // kept: re-point its accessors at copied views
        for (const [k, ai] of Object.entries(p.attributes)) p.attributes[k] = keepAccessor(ai);
        if (p.indices != null) p.indices = keepAccessor(p.indices);
        continue;
      }
      const pos = accessor(g, p.attributes.POSITION);
      const nrm = p.attributes.NORMAL != null ? accessor(g, p.attributes.NORMAL) : null;
      const uv = p.attributes.TEXCOORD_0 != null ? accessor(g, p.attributes.TEXCOORD_0) : null;
      const idx = new Uint32Array(accessor(g, p.indices));
      const vc = pos.length / 3;
      // Attributes the simplifier keeps in mind: UV (so the texture keeps fitting) and normal.
      const stride = (uv ? 2 : 0) + (nrm ? 3 : 0);
      const attrs = new Float32Array(vc * Math.max(1, stride));
      for (let i = 0; i < vc; i++) {
        let o = i * stride;
        if (uv) { attrs[o++] = uv[2 * i]; attrs[o++] = uv[2 * i + 1]; }
        if (nrm) { attrs[o++] = nrm[3 * i]; attrs[o++] = nrm[3 * i + 1]; attrs[o++] = nrm[3 * i + 2]; }
      }
      const weights = [...(uv ? [1, 1] : []), ...(nrm ? [0.5, 0.5, 0.5] : [])];
      const [out, err] = stride
        ? MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attrs, stride, weights, null, TARGET * 3, 0.02)
        : MeshoptSimplifier.simplify(idx, pos, 3, TARGET * 3, 0.02);
      // Keep only the vertices still used.
      const remap = new Int32Array(vc).fill(-1);
      let n = 0;
      for (const v of out) if (remap[v] < 0) remap[v] = n++;
      const P = new Float32Array(n * 3), N = nrm ? new Float32Array(n * 3) : null, U = uv ? new Float32Array(n * 2) : null;
      for (let v = 0; v < vc; v++) {
        const r = remap[v];
        if (r < 0) continue;
        P.set(pos.subarray(3 * v, 3 * v + 3), 3 * r);
        if (N) N.set(nrm.subarray(3 * v, 3 * v + 3), 3 * r);
        if (U) U.set(uv.subarray(2 * v, 2 * v + 2), 2 * r);
      }
      const I = new Uint32Array(out.length);
      for (let i = 0; i < out.length; i++) I[i] = remap[out[i]];
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[3 * i + k]); max[k] = Math.max(max[k], P[3 * i + k]); }
      const acc = (data, type, ct, target, extra = {}) => { accessors.push({ bufferView: addView(data, target), componentType: ct, count: data.length / SIZE[type], type, ...extra }); return accessors.length - 1; };
      const attributes = { POSITION: acc(P, 'VEC3', 5126, 34962, { min, max }) };
      if (N) attributes.NORMAL = acc(N, 'VEC3', 5126, 34962);
      if (U) attributes.TEXCOORD_0 = acc(U, 'VEC2', 5126, 34962);
      for (const [k, ai] of Object.entries(p.attributes)) if (!(k in attributes)) attributes[k] = keepAccessor(ai); // anything else, unchanged (rare)
      p.attributes = attributes;
      p.indices = acc(I, 'SCALAR', 5125, 34963);
      report.push(`${Math.round(tris)} → ${out.length / 3} triangles (error ${err.toFixed(4)})`);
      changed = true;
    }
  }
  function keepAccessor(ai) {
    const a = { ...g.json.accessors[ai] };
    a.bufferView = copyView(a.bufferView);
    accessors.push(a);
    return accessors.length - 1;
  }
  if (!changed) { console.log(file, 'kept'); continue; }
  // Images and other views by index.
  for (const im of g.json.images || []) if (im.bufferView != null) im.bufferView = copyView(im.bufferView);
  // Lay out the new binary chunk (4-byte aligned).
  let off = 0;
  const chunks = [];
  newViews.forEach((v, i) => {
    const pad = (4 - (off % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad));
    off += pad;
    v.byteOffset = off;
    chunks.push(views[i]);
    off += views[i].length;
  });
  const binPad = (4 - (off % 4)) % 4;
  if (binPad) chunks.push(Buffer.alloc(binPad));
  const BIN = Buffer.concat(chunks);
  g.json.bufferViews = newViews;
  g.json.accessors = accessors;
  g.json.buffers = [{ byteLength: BIN.length }];
  let J = Buffer.from(JSON.stringify(g.json));
  J = Buffer.concat([J, Buffer.alloc((4 - (J.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + J.length + 8 + BIN.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(J.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(BIN.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([head, jh, J, bh, BIN]);
  const before = fs.statSync(file).size;
  if (!dry) fs.writeFileSync(file, glb);
  console.log(file, report.join('; '), `${(before / 1e6).toFixed(1)} MB → ${(glb.length / 1e6).toFixed(1)} MB${dry ? ' (dry run)' : ''}`);
}
