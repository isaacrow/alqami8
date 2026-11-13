// Shrinks a heavy single-mesh character scan (e.g. a Meshy export) into a phone-sized GLB: the mesh is simplified
// with meshoptimizer (keeping UV seams and normals so textures still line up), unused vertices are dropped, and the
// textures are resized. Only for single-mesh, single-material GLBs without skins or morph targets.
//
//   node scripts/shrink-character.mjs <in.glb> <out.glb> [triangles=80000]
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output, trianglesArg] = process.argv.slice(2);
const TARGET_TRIS = Number(trianglesArg || 80000);
const TEXTURE_SIZES = [2048, 1024, 1024]; // base colour, metal/rough, normal (by texture order in the file)

const glb = readFileSync(input);
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart);

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

// UV and normal as attributes, so seams and shading edges are kept.
const attrs = new Float32Array(vertexCount * 5);
for (let i = 0; i < vertexCount; i++) {
  attrs[i * 5] = uv[i * 2];
  attrs[i * 5 + 1] = uv[i * 2 + 1];
  attrs[i * 5 + 2] = nrm[i * 3];
  attrs[i * 5 + 3] = nrm[i * 3 + 1];
  attrs[i * 5 + 4] = nrm[i * 3 + 2];
}
await MeshoptSimplifier.ready;
const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(indices, pos, 3, attrs, 5, [1, 1, 0.25, 0.25, 0.25], null, TARGET_TRIS * 3, 0.05);
console.log(`simplified: ${simplified.length / 3} triangles, relative error ${error.toFixed(4)}`);

// Keep only the vertices still in use.
const remap = new Int32Array(vertexCount).fill(-1);
let kept = 0;
for (const i of simplified) if (remap[i] < 0) remap[i] = kept++;
const P = new Float32Array(kept * 3), N = new Float32Array(kept * 3), T = new Float32Array(kept * 2);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vertexCount; i++) {
  const r = remap[i];
  if (r < 0) continue;
  for (let k = 0; k < 3; k++) {
    P[r * 3 + k] = pos[i * 3 + k];
    N[r * 3 + k] = nrm[i * 3 + k];
    min[k] = Math.min(min[k], pos[i * 3 + k]);
    max[k] = Math.max(max[k], pos[i * 3 + k]);
  }
  T[r * 2] = uv[i * 2];
  T[r * 2 + 1] = uv[i * 2 + 1];
}
const I = kept <= 65535 ? Uint16Array.from(simplified, (i) => remap[i]) : Uint32Array.from(simplified, (i) => remap[i]);

// Textures, resized and re-encoded as JPEG.
const images = [];
for (let i = 0; i < json.images.length; i++) {
  const v = json.bufferViews[json.images[i].bufferView];
  const bytes = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const size = TEXTURE_SIZES[json.textures.findIndex((t) => t.source === i)] ?? 1024;
  images.push(await sharp(bytes).resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
}

// New GLB: one buffer, views laid out 4-byte aligned.
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
const vP = add(P, 34962), vN = add(N, 34962), vT = add(T, 34962), vI = add(I, 34963);
const imageViews = images.map((im) => add(im));
const binOut = Buffer.concat([...chunks, Buffer.alloc((4 - (offset % 4)) % 4)]);

const out = {
  asset: { version: '2.0', generator: 'alqami8 scripts/shrink-character.mjs' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'character' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
  accessors: [
    { bufferView: vP, componentType: 5126, count: kept, type: 'VEC3', min, max },
    { bufferView: vN, componentType: 5126, count: kept, type: 'VEC3' },
    { bufferView: vT, componentType: 5126, count: kept, type: 'VEC2' },
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
console.log(`out: ${kept} vertices, ${I.length / 3} triangles, ${(file.length / 1e6).toFixed(2)} MB (from ${(glb.length / 1e6).toFixed(1)} MB)`);
