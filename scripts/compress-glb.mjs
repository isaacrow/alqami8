// Packs the geometry of GLB models with EXT_meshopt_compression so they download several times faster. Triangles,
// UVs, normals and textures stay as they are (no simplification); vertex floats keep 16/14/10 mantissa bits for
// position/UV/normal (the exponential filter), which is far below what shows on screen. Every three.js viewer here
// decodes it through MeshoptDecoder, and <model-viewer> does on its own.
//
//   node scripts/compress-glb.mjs <file.glb …> [--dry]
//
// Writes over each file it packs (git keeps the original). Files that already use meshopt or Draco are skipped.
import fs from 'node:fs';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const TYPED = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const BITS = { POSITION: 16, TEXCOORD_0: 14, TEXCOORD_1: 14, NORMAL: 10 };
const EXT = 'EXT_meshopt_compression';
const align4 = (n) => (n + 3) & ~3;

function read(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  return { json, bin, bytes: b.length };
}
function accessorData(g, i) {
  const a = g.json.accessors[i];
  const v = g.json.bufferViews[a.bufferView];
  const n = SIZE[a.type];
  const T = TYPED[a.componentType];
  if (a.sparse) throw new Error('sparse accessors not handled');
  if (v.byteStride && v.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('interleaved data not handled');
  const start = g.bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  return new T(g.bin.buffer.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT));
}

function pack(file) {
  const g = read(file);
  const used = g.json.extensionsUsed || [];
  if (used.includes(EXT) || used.includes('KHR_meshopt_compression') || used.includes('KHR_draco_mesh_compression')) return { skipped: 'already compressed' };
  if ((g.json.buffers || []).length !== 1 || g.json.buffers[0].uri) return { skipped: 'not a single embedded buffer' };

  const chunks = []; // buffer 0 (the GLB's BIN): compressed geometry and copied views
  let binLength = 0;
  let fallbackLength = 0; // buffer 1: the decoded size, never stored
  const views = [];
  const put = (data) => {
    const offset = binLength;
    chunks.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    const pad = align4(data.byteLength) - data.byteLength;
    if (pad) chunks.push(Buffer.alloc(pad));
    binLength += data.byteLength + pad;
    return offset;
  };
  const addCompressed = (raw, count, byteStride, mode, filter, target) => {
    const enc = mode === 'ATTRIBUTES'
      ? MeshoptEncoder.encodeVertexBufferLevel(raw, count, byteStride, 2, 0) // version 0: what EXT_meshopt_compression allows
      : MeshoptEncoder.encodeGltfBuffer(raw, count, byteStride, mode);
    // Decode it straight back: a check, and the exact values the viewer will see (for POSITION min/max).
    const back = new Uint8Array(count * byteStride);
    MeshoptDecoder.decodeGltfBuffer(back, count, byteStride, enc, mode, filter);
    const fbOffset = fallbackLength;
    fallbackLength += align4(count * byteStride);
    views.push({
      buffer: 1, byteOffset: fbOffset, byteLength: count * byteStride,
      ...(mode === 'ATTRIBUTES' ? { byteStride } : {}), ...(target ? { target } : {}),
      extensions: { [EXT]: { buffer: 0, byteOffset: put(enc), byteLength: enc.byteLength, byteStride, count, mode, ...(filter ? { filter } : {}) } },
    });
    return { view: views.length - 1, back };
  };
  const copied = new Map();
  const copyView = (old) => {
    if (!copied.has(old)) {
      const v = g.json.bufferViews[old];
      const data = g.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
      const { buffer, byteOffset, extensions, ...rest } = v;
      views.push({ ...rest, buffer: 0, byteOffset: put(data) });
      copied.set(old, views.length - 1);
    }
    return copied.get(old);
  };

  const accessors = g.json.accessors.map((a) => ({ ...a }));
  const geometryAccessors = new Set();
  for (const mesh of g.json.meshes || []) {
    for (const p of mesh.primitives) {
      if ((p.mode ?? 4) !== 4 || p.indices == null || p.targets) return { skipped: 'non-indexed, non-triangle or morph primitive' };
      for (const ai of [p.indices, ...Object.values(p.attributes)]) {
        if (geometryAccessors.has(ai)) return { skipped: 'accessor shared between primitives' };
        geometryAccessors.add(ai);
      }
    }
  }

  for (const mesh of g.json.meshes || []) {
    for (const p of mesh.primitives) {
      const indices = new Uint32Array(accessorData(g, p.indices));
      const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true); // vertex-cache + fetch order, indices remapped in place
      for (const [name, ai] of Object.entries(p.attributes)) {
        const a = g.json.accessors[ai];
        if (a.componentType !== 5126) return { skipped: `${name} is not float` };
        const n = SIZE[a.type];
        const src = accessorData(g, ai);
        const out = new Float32Array(unique * n);
        for (let i = 0; i < a.count; i++) {
          const r = remap[i];
          if (r !== 0xffffffff) for (let c = 0; c < n; c++) out[r * n + c] = src[i * n + c];
        }
        const stride = n * 4;
        const bits = BITS[name] ?? 16;
        const filtered = MeshoptEncoder.encodeFilterExp(out, unique, stride, bits, name === 'POSITION' ? 'SharedComponent' : 'Separate');
        const { view, back } = addCompressed(filtered, unique, stride, 'ATTRIBUTES', 'EXPONENTIAL', 34962);
        const acc = { ...accessors[ai], bufferView: view, byteOffset: 0, count: unique };
        if (name === 'POSITION') {
          const f = new Float32Array(back.buffer);
          const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < f.length; i += 3) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], f[i + c]); max[c] = Math.max(max[c], f[i + c]); }
          acc.min = min; acc.max = max;
        } else { delete acc.min; delete acc.max; }
        accessors[ai] = acc;
      }
      const wide = unique > 65535;
      const idx = wide ? indices : Uint16Array.from(indices);
      const size = wide ? 4 : 2;
      const raw = new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength);
      const { view, back } = addCompressed(raw, indices.length, size, 'TRIANGLES', undefined, 34963);
      // The codec may rotate a triangle's corners (same winding); anything else is a bug.
      const dec = wide ? new Uint32Array(back.buffer) : new Uint16Array(back.buffer);
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
        const [x, y, z] = [dec[t], dec[t + 1], dec[t + 2]];
        if (!((x === a && y === b && z === c) || (x === b && y === c && z === a) || (x === c && y === a && z === b))) throw new Error('index round trip differs');
      }
      accessors[p.indices] = { ...accessors[p.indices], bufferView: view, byteOffset: 0, componentType: wide ? 5125 : 5123 };
    }
  }
  // Everything else (images, animation data …) is copied as it is.
  accessors.forEach((a, i) => { if (!geometryAccessors.has(i) && a.bufferView != null) a.bufferView = copyView(a.bufferView); });
  for (const img of g.json.images || []) if (img.bufferView != null) img.bufferView = copyView(img.bufferView);

  const json = {
    ...g.json,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: binLength }, { byteLength: fallbackLength, extensions: { [EXT]: { fallback: true } } }],
    extensionsUsed: [...new Set([...used, EXT])],
    extensionsRequired: [...new Set([...(g.json.extensionsRequired || []), EXT])],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(align4(jsonBuf.length) - jsonBuf.length, 0x20)]);
  const binBuf = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const chunkHead = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  const out = Buffer.concat([header, chunkHead(jsonBuf.length, 0x4e4f534a), jsonBuf, chunkHead(binBuf.length, 0x004e4942), binBuf]);
  return { before: g.bytes, after: out.length, out };
}

let before = 0, after = 0;
for (const file of files) {
  try {
    const r = pack(file);
    if (r.skipped) { console.log(`${file}: skipped (${r.skipped})`); continue; }
    before += r.before; after += r.after;
    console.log(`${file}: ${(r.before / 1e6).toFixed(2)} MB -> ${(r.after / 1e6).toFixed(2)} MB`);
    if (!dry) fs.writeFileSync(file, r.out);
  } catch (e) {
    console.log(`${file}: failed (${e.message})`);
  }
}
if (files.length > 1) console.log(`total: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
