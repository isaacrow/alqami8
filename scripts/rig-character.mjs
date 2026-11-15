// Builds al-Jawahiri's phone model from the full Meshy scan with a mouth that can really open.
//
// shrink-character.mjs simplifies the whole scan evenly, which left about 33 vertices around the lips: too few to
// shape a mouth, so the lips could only be painted. Here the mouth and chin keep the scan's full detail (about 3,200
// vertices are locked while the rest is simplified), the lips are cut apart along the line where they meet (its
// vertices are doubled, one copy for each lip, joined again at the corners), and two per-vertex weights are baked in
// for the face rig (src/character/bustRig.ts):
//   _JAW  how much the vertex turns with the jaw (1 on the lower lip and chin, fading over the cheeks and neck);
//   _LIP  the lips: positive on the upper lip, negative on the lower, 0 elsewhere.
// The lip line was read off the scan's depth (the crease between the lips): y ≈ 0.093 at the centre (x ≈ 0.02),
// rising to ≈ 0.098 6 cm either side; the mouth spans about x −0.07 … 0.11.
//
//   node scripts/rig-character.mjs <full scan.glb> public/characters/jawahiri-mouth.glb [triangles=80000]
// (a new file name, so the offline cache, which serves characters/ cache-first, never keeps the old model)
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output, trianglesArg, configPath] = process.argv.slice(2);
// Per-character numbers (a JSON file, 4th argument); the defaults are al-Jawahiri's.
const cfg = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const TARGET_TRIS = Number(trianglesArg || 80000);
const TEXTURE_SIZES = [2048, 1024, 1024];

const CX = cfg.centreX ?? 0.02;
const LIP_Y = cfg.lipLine ?? 0.093;
const LIP_CURVE = cfg.lipCurve ?? 1.5;
// A tilted head tilts the lip line too: lipTilt is its slope across the mouth.
const LIP_TILT = cfg.lipTilt ?? 0;
const lipLine = (x) => LIP_Y + LIP_TILT * (x - CX) + LIP_CURVE * (x - CX) ** 2;
const CUT_HALF = cfg.cutHalf ?? 0.072; // the cut stops this far either side of the centre: the lip corners stay joined
const LOCK = { halfWidth: 0.12, yMin: 0.03, yMax: 0.16, zMin: 0.42, ...(cfg.lock ?? {}) };
const inLock = (x, y, z) => Math.abs(x - CX) < LOCK.halfWidth && y > LOCK.yMin && y < LOCK.yMax && z > LOCK.zMin;
// Where the lips are in depth (the cut and the lip weights only touch the front of the face).
const LIP_Z = cfg.lipZ ?? 0.44;
// The jaw's reach: across (dx), down to the neck (y) and front to back (z).
const JAW_DX = cfg.jawDx ?? [0.09, 0.17];
const JAW_NECK = cfg.jawNeck ?? [-0.3, -0.17];
const JAW_Z = cfg.jawZ ?? [0.18, 0.36];

const glb = readFileSync(input);
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const bin = glb.subarray(20 + jsonLen + 8);
const accessor = (i, Type, comps) => {
  const a = json.accessors[i];
  const v = json.bufferViews[a.bufferView];
  const start = (v.byteOffset || 0) + (a.byteOffset || 0);
  const bytes = bin.subarray(start, start + a.count * comps * Type.BYTES_PER_ELEMENT);
  return new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const prim = json.meshes[0].primitives[0];
const pos = accessor(prim.attributes.POSITION, Float32Array, 3);
const nrm = accessor(prim.attributes.NORMAL, Float32Array, 3);
const uv = accessor(prim.attributes.TEXCOORD_0, Float32Array, 2);
const idxAcc = json.accessors[prim.indices];
const indices = idxAcc.componentType === 5125 ? accessor(prim.indices, Uint32Array, 1) : Uint32Array.from(accessor(prim.indices, Uint16Array, 1));
const vertexCount = pos.length / 3;
console.log(`in: ${vertexCount} vertices, ${indices.length / 3} triangles`);

// 1. Simplify everywhere except the mouth.
const attrs = new Float32Array(vertexCount * 5);
const lock = new Uint8Array(vertexCount);
let locked = 0;
for (let i = 0; i < vertexCount; i++) {
  attrs.set([uv[i * 2], uv[i * 2 + 1], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]], i * 5);
  if (inLock(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) (lock[i] = 1), locked++;
}
await MeshoptSimplifier.ready;
const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(indices, pos, 3, attrs, 5, [1, 1, 0.25, 0.25, 0.25], lock, TARGET_TRIS * 3, 0.05);
console.log(`simplified: ${simplified.length / 3} triangles (${locked} mouth vertices kept), relative error ${error.toFixed(4)}`);

// Compact to the vertices in use.
const remap = new Int32Array(vertexCount).fill(-1);
const order = [];
for (const i of simplified) if (remap[i] < 0) (remap[i] = order.length), order.push(i);
const tris = Uint32Array.from(simplified, (i) => remap[i]);

// 2. Cut the lips apart: triangles near the lip line are upper or lower by their centre; a vertex used by both gets
// a second copy for the lower lip (except near the corners, which stay joined).
const vx = (v) => pos[order[v] * 3];
const vy = (v) => pos[order[v] * 3 + 1];
const vz = (v) => pos[order[v] * 3 + 2];
const side = new Int8Array(tris.length / 3).fill(-1); // -1 not in the cut, 0 upper, 1 lower
const usedBy = new Uint8Array(order.length); // bit 1 upper, bit 2 lower
for (let t = 0; t < tris.length / 3; t++) {
  const [a, b, c] = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]];
  const x = (vx(a) + vx(b) + vx(c)) / 3;
  const y = (vy(a) + vy(b) + vy(c)) / 3;
  const z = (vz(a) + vz(b) + vz(c)) / 3;
  if (Math.abs(x - CX) > CUT_HALF + 0.01 || Math.abs(y - lipLine(x)) > 0.03 || z < LIP_Z) continue;
  side[t] = y < lipLine(x) ? 1 : 0;
  for (const v of [a, b, c]) usedBy[v] |= side[t] ? 2 : 1;
}
const copyOf = new Int32Array(order.length).fill(-1);
const extra = [];
for (let v = 0; v < order.length; v++) {
  if (usedBy[v] === 3 && Math.abs(vx(v) - CX) < CUT_HALF) {
    copyOf[v] = order.length + extra.length;
    extra.push(v);
  }
}
for (let t = 0; t < tris.length / 3; t++) {
  if (side[t] !== 1) continue;
  for (let k = 0; k < 3; k++) {
    const v = tris[t * 3 + k];
    if (copyOf[v] >= 0) tris[t * 3 + k] = copyOf[v];
  }
}
const count = order.length + extra.length;
const source = (v) => (v < order.length ? order[v] : order[extra[v - order.length]]);
const isLowerCopy = (v) => v >= order.length;
const isUpperOriginal = (v) => v < order.length && copyOf[v] >= 0;
console.log(`lip cut: ${extra.length} vertices doubled`);

// 3. Write positions, normals, UVs and the rig weights.
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const P = new Float32Array(count * 3), N = new Float32Array(count * 3), T = new Float32Array(count * 2);
const JAW = new Float32Array(count), LIP = new Float32Array(count);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let v = 0; v < count; v++) {
  const s = source(v);
  for (let k = 0; k < 3; k++) {
    P[v * 3 + k] = pos[s * 3 + k];
    N[v * 3 + k] = nrm[s * 3 + k];
    min[k] = Math.min(min[k], pos[s * 3 + k]);
    max[k] = Math.max(max[k], pos[s * 3 + k]);
  }
  T[v * 2] = uv[s * 2];
  T[v * 2 + 1] = uv[s * 2 + 1];
  let [x, y, z] = [pos[s * 3], pos[s * 3 + 1], pos[s * 3 + 2]];
  // The cut runs along triangle edges, so it zigzags; its vertices (both copies) are moved onto the smooth lip line.
  if (isLowerCopy(v) || isUpperOriginal(v)) {
    y = lipLine(x);
    P[v * 3 + 1] = y;
  }
  const dx = Math.abs(x - CX);
  const below = y - lipLine(x);
  // Lower or upper: explicit on the cut, else by height (just under the line counts as lower).
  // Near the cut a vertex belongs to the lip whose triangles use it (by height alone, a vertex just above the line
  // that only lower-lip triangles use stayed behind and stretched them into spikes); elsewhere, by height.
  const only = v < order.length ? usedBy[v] : 0;
  const lower = isLowerCopy(v) ? 1 : isUpperOriginal(v) ? 0 : only === 2 ? 1 : only === 1 ? 0 : 1 - smooth(-0.006, 0.003, below);
  // Near the lips the opening narrows to the corners like a lens (height ∝ √(1 − (dx/w)²)); lower down, the chin
  // turns as one piece.
  const lens = Math.sqrt(Math.max(0, 1 - (dx / (CUT_HALF + 0.006)) ** 2));
  const nearLips = 1 - smooth(0.015, 0.05, -below);
  JAW[v] = lower * (1 - smooth(JAW_DX[0], JAW_DX[1], dx)) * smooth(JAW_NECK[0], JAW_NECK[1], y) * smooth(JAW_Z[0], JAW_Z[1], z) * (1 - nearLips * (1 - lens));
  const lip = (1 - smooth(0.012, 0.03, Math.abs(below))) * (1 - smooth(CUT_HALF - 0.002, CUT_HALF + 0.028, dx)) * smooth(LIP_Z - 0.01, LIP_Z + 0.03, z);
  LIP[v] = lower > 0.5 ? -lip : lip;
}

// Textures, resized and re-encoded.
const images = [];
for (let i = 0; i < json.images.length; i++) {
  const v = json.bufferViews[json.images[i].bufferView];
  const bytes = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const size = TEXTURE_SIZES[json.textures.findIndex((t) => t.source === i)] ?? 1024;
  images.push(await sharp(bytes).resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
}

// 4. The GLB.
const I = count <= 65535 ? Uint16Array.from(tris) : tris;
const chunks = [];
const views = [];
let offset = 0;
const add = (buf, target) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad)), (offset += pad);
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.byteLength, ...(target ? { target } : {}) });
  chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  offset += buf.byteLength;
  return views.length - 1;
};
const vP = add(P, 34962), vN = add(N, 34962), vT = add(T, 34962), vJ = add(JAW, 34962), vL = add(LIP, 34962), vI = add(I, 34963);
const imageViews = images.map((im) => add(im));
const binOut = Buffer.concat([...chunks, Buffer.alloc((4 - (offset % 4)) % 4)]);
const out = {
  asset: { version: '2.0', generator: 'alqami8 scripts/rig-character.mjs' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'character' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, _JAW: 3, _LIP: 4 }, indices: 5, material: 0, mode: 4 }] }],
  accessors: [
    { bufferView: vP, componentType: 5126, count, type: 'VEC3', min, max },
    { bufferView: vN, componentType: 5126, count, type: 'VEC3' },
    { bufferView: vT, componentType: 5126, count, type: 'VEC2' },
    { bufferView: vJ, componentType: 5126, count, type: 'SCALAR' },
    { bufferView: vL, componentType: 5126, count, type: 'SCALAR' },
    { bufferView: vI, componentType: I instanceof Uint16Array ? 5123 : 5125, count: I.length, type: 'SCALAR' },
  ],
  bufferViews: views,
  buffers: [{ byteLength: binOut.length }],
  materials: json.materials,
  textures: json.textures,
  samplers: json.samplers,
  images: images.map((_, i) => ({ bufferView: imageViews[i], mimeType: 'image/jpeg' })),
};
let jsonBuf = Buffer.from(JSON.stringify(out), 'utf8');
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binOut.length, 8);
const chunkHeader = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
const file = Buffer.concat([header, chunkHeader(jsonBuf.length, 0x4e4f534a), jsonBuf, chunkHeader(binOut.length, 0x004e4942), binOut]);
writeFileSync(output, file);
console.log(`out: ${count} vertices, ${I.length / 3} triangles, ${(file.length / 1e6).toFixed(2)} MB`);
