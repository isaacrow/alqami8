// Shrinks every texture larger than MAX px inside GLB files, in place, keeping their format (WebP/PNG/JPEG).
// Geometry (Draco) and everything else are copied byte for byte; only the image buffer views change.
//
// Phones already shrink textures to 512 px when a model loads (src/utils/modelMemory.ts); this saves the download
// and the space "Save for offline" takes.
//
//   node scripts/shrink-glb-textures.mjs public/models/*.glb
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const MAX = Number(process.env.MAX_TEXTURE || 1024);
const pad4 = (n) => (n + 3) & ~3;

for (const file of process.argv.slice(2)) {
  const glb = readFileSync(file);
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));

  // New contents for image buffer views; every other view keeps its bytes.
  const replaced = new Map();
  let shrunk = 0;
  for (const image of json.images || []) {
    if (image.bufferView === undefined) continue;
    const view = json.bufferViews[image.bufferView];
    const bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const meta = await sharp(bytes).metadata();
    if (Math.max(meta.width, meta.height) <= MAX) continue;
    const resized = sharp(bytes).resize(MAX, MAX, { fit: 'inside' });
    const out =
      meta.format === 'webp' ? await resized.webp({ quality: 88 }).toBuffer()
      : meta.format === 'png' ? await resized.png().toBuffer()
      : await resized.jpeg({ quality: 90 }).toBuffer();
    replaced.set(image.bufferView, out);
    shrunk++;
  }
  if (!shrunk) {
    console.log(`${file}: nothing above ${MAX} px`);
    continue;
  }

  // Lay the buffer views out again, 4-byte aligned, in their original order.
  const parts = [];
  let offset = 0;
  const order = json.bufferViews.map((v, i) => ({ v, i })).sort((a, b) => (a.v.byteOffset || 0) - (b.v.byteOffset || 0));
  for (const { v, i } of order) {
    const data = replaced.get(i) ?? bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const at = pad4(offset);
    if (at > offset) parts.push(Buffer.alloc(at - offset));
    v.byteOffset = at;
    v.byteLength = data.length;
    parts.push(data);
    offset = at + data.length;
  }
  const newBin = Buffer.concat([...parts, Buffer.alloc(pad4(offset) - offset)]);
  json.buffers[0].byteLength = newBin.length;

  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + newBin.length, 8);
  const chunk = (len, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(len, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  const outGlb = Buffer.concat([header, chunk(jsonBuf.length, 0x4e4f534a), jsonBuf, chunk(newBin.length, 0x004e4942), newBin]);
  writeFileSync(file, outGlb);
  console.log(`${file}: ${shrunk} textures to ${MAX} px, ${(glb.length / 1e6).toFixed(2)} -> ${(outGlb.length / 1e6).toFixed(2)} MB`);
}
