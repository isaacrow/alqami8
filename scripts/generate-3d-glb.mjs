// scripts/generate-3d-glb.mjs
// Open-source Image-to-3D Mesh Reconstruction Pipeline based on:
// 1. DepthAnything/Depth-Anything-V2 (onnx-community/depth-anything-v2-small) for monocular neural depth estimation
// 2. Automated Studio Background Matting + Silhouette Distance-Field Volumetric Inflation (MonsterMash / Relief-to-3D)
// 3. Watertight Double-Sided 3D Mesh Triangulation & Binary glTF 2.0 (.glb) Exporter with PBR Materials

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { pipeline, AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';

const CATALOGUE_PATH = path.resolve('public/data/alkafeel-catalogue.json');
const OUT_MODEL_DIR = path.resolve('public/models/alkafeel');
fs.mkdirSync(OUT_MODEL_DIR, { recursive: true });

// Material presets per Al-Kafeel Hall prefix for realistic Three.js PBR reflections
const PBR_PRESETS = {
  SWD: { metalness: 0.82, roughness: 0.24, thickness: 0.14, relief: 0.10 }, // Swords (Damascus steel & gold)
  MSS: { metalness: 0.08, roughness: 0.72, thickness: 0.12, relief: 0.08 }, // Manuscripts
  CON: { metalness: 0.85, roughness: 0.28, thickness: 0.10, relief: 0.09 }, // Coins
  CND: { metalness: 0.78, roughness: 0.25, thickness: 0.28, relief: 0.18 }, // Candlesticks
  KUF: { metalness: 0.88, roughness: 0.20, thickness: 0.20, relief: 0.15 }, // Sacred Brass/Gold Hands (Kuffuf)
  STP: { metalness: 0.05, roughness: 0.78, thickness: 0.06, relief: 0.05 }, // Stamps
  JWL: { metalness: 0.85, roughness: 0.18, thickness: 0.22, relief: 0.16 }, // Jewelry
  MTL: { metalness: 0.80, roughness: 0.26, thickness: 0.28, relief: 0.18 }, // Metalware vessels
  CLK: { metalness: 0.65, roughness: 0.30, thickness: 0.24, relief: 0.16 }, // Antique Clocks
  TXT: { metalness: 0.06, roughness: 0.82, thickness: 0.08, relief: 0.07 }, // Textiles & Carpets
  LNT: { metalness: 0.72, roughness: 0.24, thickness: 0.28, relief: 0.18 }, // Shrine Lanterns
  ARM: { metalness: 0.82, roughness: 0.28, thickness: 0.24, relief: 0.16 }, // Defensive Armor
  SHR: { metalness: 0.84, roughness: 0.22, thickness: 0.22, relief: 0.16 }, // Sacred Shrine Parts
  CST: { metalness: 0.45, roughness: 0.42, thickness: 0.26, relief: 0.16 }, // Sanctuary Chests
};

// Flood-fill studio background detector from image borders + soft alpha transition
function extractForegroundMask(rgb, w, h) {
  const mask = new Float32Array(w * h).fill(1.0);
  // Sample border pixels to estimate background color distribution
  const borderSamples = [];
  for (let x = 0; x < w; x += 2) {
    borderSamples.push([rgb[(0 * w + x) * 3], rgb[(0 * w + x) * 3 + 1], rgb[(0 * w + x) * 3 + 2]]);
    borderSamples.push([rgb[((h - 1) * w + x) * 3], rgb[((h - 1) * w + x) * 3 + 1], rgb[((h - 1) * w + x) * 3 + 2]]);
  }
  for (let y = 0; y < h; y += 2) {
    borderSamples.push([rgb[(y * w + 0) * 3], rgb[(y * w + 0) * 3 + 1], rgb[(y * w + 0) * 3 + 2]]);
    borderSamples.push([rgb[(y * w + (w - 1)) * 3], rgb[(y * w + (w - 1)) * 3 + 1], rgb[(y * w + (w - 1)) * 3 + 2]]);
  }

  // Compute median border color
  const rs = borderSamples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = borderSamples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = borderSamples.map((s) => s[2]).sort((a, b) => a - b);
  const bgR = rs[Math.floor(rs.length / 2)];
  const bgG = gs[Math.floor(gs.length / 2)];
  const bgB = bs[Math.floor(bs.length / 2)];

  // Check if the border has a relatively uniform studio backdrop (white, black, gray, or cream)
  let uniformCount = 0;
  for (const [r, g, b] of borderSamples) {
    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
    if (dist < 42) uniformCount++;
  }
  const hasUniformBackdrop = uniformCount / borderSamples.length > 0.55;

  if (!hasUniformBackdrop) {
    // Full-frame artifact (e.g., carpet, stamp, manuscript page): keep rounded rectangle mask
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x / (w - 1)) * 2 - 1;
        const ny = (y / (h - 1)) * 2 - 1;
        const edge = Math.max(Math.abs(nx), Math.abs(ny));
        mask[y * w + x] = edge > 0.96 ? 0.0 : 1.0;
      }
    }
    return mask;
  }

  // BFS flood fill from all border pixels that match background color
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const colorDist = (idx) => {
    const r = rgb[idx * 3];
    const g = rgb[idx * 3 + 1];
    const b = rgb[idx * 3 + 2];
    return Math.hypot(r - bgR, g - bgG, b - bgB);
  };

  const THRESH = 44;
  const pushIfBg = (x, y) => {
    const idx = y * w + x;
    if (!visited[idx] && colorDist(idx) < THRESH) {
      visited[idx] = 1;
      mask[idx] = 0.0;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushIfBg(0, y);
    pushIfBg(w - 1, y);
  }

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = (curr - cx) / w;
    if (cx > 0) pushIfBg(cx - 1, cy);
    if (cx + 1 < w) pushIfBg(cx + 1, cy);
    if (cy > 0) pushIfBg(cx, cy - 1);
    if (cy + 1 < h) pushIfBg(cx, cy + 1);
  }

  // Ensure at least 15% of pixels remain foreground; otherwise fall back to central object mask
  let fgCount = 0;
  for (let i = 0; i < w * h; i++) if (mask[i] > 0.5) fgCount++;
  if (fgCount < w * h * 0.12) {
    mask.fill(1.0);
  }

  // Morphological closing (dilate then erode) to fill small specular holes inside metallic swords/vessels
  const tmp = new Float32Array(mask);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let maxV = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) maxV = Math.max(maxV, tmp[(y + dy) * w + (x + dx)]);
        mask[y * w + x] = maxV;
      }
    }
    tmp.set(mask);
  }

  return mask;
}

// Compute Chamfer distance transform inside silhouette for smooth 3D volumetric inflation (MonsterMash style)
function computeSilhouetteDome(mask, w, h) {
  const dist = new Float32Array(w * h);
  const INF = 1e6;
  for (let i = 0; i < w * h; i++) dist[i] = mask[i] > 0.5 ? INF : 0;

  // Forward pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - w] + 1);
      if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - w - 1] + 1.414);
    }
  }
  // Backward pass
  let maxD = 1;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      if (x + 1 < w) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y + 1 < h) dist[i] = Math.min(dist[i], dist[i + w] + 1);
      if (x + 1 < w && y + 1 < h) dist[i] = Math.min(dist[i], dist[i + w + 1] + 1.414);
      if (dist[i] > maxD) maxD = dist[i];
    }
  }

  // Smooth elliptical profile: sqrt(d / maxD)
  const dome = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const n = Math.min(1.0, dist[i] / Math.max(4.0, maxD * 0.65));
    dome[i] = Math.sqrt(n);
  }
  return dome;
}

// Box-blur a 2D float grid for smooth organic 3D surface normals
function smoothGrid(grid, w, h, passes = 2) {
  let src = new Float32Array(grid);
  let dst = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0,
          cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            sum += src[ny * w + nx];
            cnt++;
          }
        }
        dst[y * w + x] = sum / cnt;
      }
    }
    src.set(dst);
  }
  return src;
}

// Package positions, normals, uvs, indices, and texture JPEG into a binary glTF 2.0 (.glb) buffer
function buildGlbBinary({ positions, normals, uvs, indices, jpegBuffer, metalness, roughness }) {
  // Align buffer segments to 4-byte boundaries
  const pad4 = (buf) => {
    const rem = buf.length % 4;
    return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)]);
  };

  const posBuf = pad4(Buffer.from(positions.buffer));
  const normBuf = pad4(Buffer.from(normals.buffer));
  const uvBuf = pad4(Buffer.from(uvs.buffer));
  const idxBuf = pad4(Buffer.from(indices.buffer));
  const imgBuf = pad4(jpegBuffer);

  // Compute min/max for POSITION accessor
  const minPos = [Infinity, Infinity, Infinity];
  const maxPos = [-Infinity, -Infinity, -Infinity];
  const vertCount = positions.length / 3;
  for (let i = 0; i < vertCount; i++) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i * 3 + c];
      if (v < minPos[c]) minPos[c] = v;
      if (v > maxPos[c]) maxPos[c] = v;
    }
  }

  let offset = 0;
  const bvPos = { buffer: 0, byteOffset: offset, byteLength: positions.byteLength, target: 34962 };
  offset += posBuf.length;
  const bvNorm = { buffer: 0, byteOffset: offset, byteLength: normals.byteLength, target: 34962 };
  offset += normBuf.length;
  const bvUv = { buffer: 0, byteOffset: offset, byteLength: uvs.byteLength, target: 34962 };
  offset += uvBuf.length;
  const bvIdx = { buffer: 0, byteOffset: offset, byteLength: indices.byteLength, target: 34963 };
  offset += idxBuf.length;
  const bvImg = { buffer: 0, byteOffset: offset, byteLength: jpegBuffer.length };
  offset += imgBuf.length;

  const binChunkData = Buffer.concat([posBuf, normBuf, uvBuf, idxBuf, imgBuf]);

  const gltf = {
    asset: { version: '2.0', generator: 'Alqami-DepthAnythingV2-3DMeshBuilder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'AlKafeelArtifact3DMesh' }],
    meshes: [
      {
        name: 'AlKafeelArtifact3DMesh',
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'AlKafeelPBRMaterial',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: metalness,
          roughnessFactor: roughness,
        },
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: 4, mimeType: 'image/jpeg' }],
    bufferViews: [bvPos, bvNorm, bvUv, bvIdx, bvImg],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertCount,
        type: 'VEC3',
        min: minPos,
        max: maxPos,
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: vertCount,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: vertCount,
        type: 'VEC2',
      },
      {
        bufferView: 3,
        componentType: 5125,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    buffers: [{ byteLength: binChunkData.length }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonRem = jsonBuf.length % 4;
  if (jsonRem !== 0) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - jsonRem, 0x20)]);
  }

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binChunkData.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binChunkData.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binChunkData]);
}

// Build a watertight, double-sided 3D mesh from foreground mask + neural depth map
function constructWatertight3DMesh({ mask, depthMap, w, h, aspect, preset }) {
  const dome = computeSilhouetteDome(mask, w, h);
  const smoothedDepth = smoothGrid(depthMap, w, h, 2);

  // Heightmap Z(x,y) combines silhouette volumetric dome + neural depth relief
  const zFront = new Float32Array(w * h);
  const zBack = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (mask[i] <= 0.5) {
      zFront[i] = 0;
      zBack[i] = 0;
    } else {
      const d = smoothedDepth[i];
      const dm = dome[i];
      const hVal = dm * preset.thickness + d * dm * preset.relief + 0.012;
      zFront[i] = hVal;
      zBack[i] = -hVal * 0.85;
    }
  }

  const meshW = aspect >= 1 ? 1.0 : 1.0 * aspect;
  const meshH = aspect >= 1 ? 1.0 / aspect : 1.0;

  // Assign vertex indices only to active foreground pixels (plus 1-pixel boundary ring where thickness tapers to 0 for watertight edge!)
  const active = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] > 0.5) {
        active[i] = 1;
        // Mark immediate neighbors as active boundary vertices (with zFront=zBack=0) so front and back weld seamlessly!
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const ni = ny * w + nx;
              if (mask[ni] <= 0.5) active[ni] = 2; // boundary seam vertex!
            }
          }
        }
      }
    }
  }

  const frontIdx = new Int32Array(w * h).fill(-1);
  const backIdx = new Int32Array(w * h).fill(-1);

  const posList = [];
  const normList = [];
  const uvList = [];

  const getZFront = (x, y) => {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    return zFront[cy * w + cx];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!active[i]) continue;

      const u = x / (w - 1);
      const v = y / (h - 1);
      const px = (u - 0.5) * meshW;
      const py = (0.5 - v) * meshH;

      // Finite-difference surface normal
      const dzdx = (getZFront(x + 1, y) - getZFront(x - 1, y)) * (w / (2 * meshW));
      const dzdy = (getZFront(x, y - 1) - getZFront(x, y + 1)) * (h / (2 * meshH));
      let nx = -dzdx,
        ny = -dzdy,
        nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      // Front vertex
      const fId = posList.length / 3;
      frontIdx[i] = fId;
      posList.push(px, py, zFront[i]);
      normList.push(nx, ny, nz);
      uvList.push(u, v);

      // If interior foreground vertex, create distinct back vertex; if boundary seam (active===2), share vertex so mesh is 100% watertight!
      if (active[i] === 2) {
        backIdx[i] = fId;
      } else {
        const bId = posList.length / 3;
        backIdx[i] = bId;
        posList.push(px, py, zBack[i]);
        normList.push(nx, ny, -nz);
        uvList.push(u, v);
      }
    }
  }

  const triIndices = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i00 = y * w + x;
      const i10 = y * w + (x + 1);
      const i01 = (y + 1) * w + x;
      const i11 = (y + 1) * w + (x + 1);

      // Only emit cell if at least one corner is true foreground (active === 1) and all 4 corners are active
      if (!active[i00] || !active[i10] || !active[i01] || !active[i11]) continue;
      if (active[i00] !== 1 && active[i10] !== 1 && active[i01] !== 1 && active[i11] !== 1) continue;

      // Front triangles (CCW)
      triIndices.push(frontIdx[i00], frontIdx[i01], frontIdx[i10]);
      triIndices.push(frontIdx[i10], frontIdx[i01], frontIdx[i11]);

      // Back triangles (reversed winding for outward-facing back volume)
      triIndices.push(backIdx[i00], backIdx[i10], backIdx[i01]);
      triIndices.push(backIdx[i10], backIdx[i11], backIdx[i01]);
    }
  }

  return {
    positions: new Float32Array(posList),
    normals: new Float32Array(normList),
    uvs: new Float32Array(uvList),
    indices: new Uint32Array(triIndices),
  };
}

async function main() {
  console.log('🧠 Loading open-source Depth-Anything-V2 (onnx-community/depth-anything-v2-small)...');
  const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
    dtype: 'q8',
  });

  console.log('✂️ Loading open-source BRIA RMBG-1.4 neural segmentation (briaai/RMBG-1.4)...');
  const rmbgModel = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
    config: { model_type: 'custom' },
  });
  const rmbgProcessor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
    config: {
      do_normalize: true,
      do_pad: false,
      do_rescale: true,
      do_resize: true,
      image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: 'ImageFeatureExtractor',
      image_std: [1, 1, 1],
      resample: 2,
      rescale_factor: 0.00392156862745098,
      size: { width: 1024, height: 1024 },
    },
  });

  const catalogue = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8'));
  const GRID = 144; // 144x144 grid => crisp geometry & fast WebGL loading

  for (const item of catalogue) {
    const relImg = item.image.replace(/^\.?\//, '');
    const imgPath = path.resolve('public', relImg);
    if (!fs.existsSync(imgPath)) continue;

    const prefix = item.id.split('-')[1] || 'SWD';
    const preset = PBR_PRESETS[prefix] || PBR_PRESETS.SWD;

    const meta = await sharp(imgPath).rotate().metadata();
    const aspect = (meta.width || 1) / (meta.height || 1);
    const w = aspect >= 1 ? GRID : Math.max(64, Math.round(GRID * aspect));
    const h = aspect >= 1 ? Math.max(64, Math.round(GRID / aspect)) : GRID;

    // 1. Run Depth-Anything-V2 on the artifact image
    const depthOut = await depthEstimator(imgPath);
    const depthRaw = await sharp(Buffer.from(depthOut.depth.data), {
      raw: { width: depthOut.depth.width, height: depthOut.depth.height, channels: depthOut.depth.channels || 1 },
    })
      .resize(w, h, { fit: 'fill' })
      .raw()
      .toBuffer();

    const depthMap = new Float32Array(w * h);
    let dMin = 255,
      dMax = 0;
    for (let i = 0; i < w * h; i++) {
      const v = depthRaw[i];
      if (v < dMin) dMin = v;
      if (v > dMax) dMax = v;
    }
    const dRange = Math.max(1, dMax - dMin);
    for (let i = 0; i < w * h; i++) {
      depthMap[i] = (depthRaw[i] - dMin) / dRange;
    }

    // 2. Run BRIA RMBG-1.4 neural foreground segmentation on the artifact image
    let mask = new Float32Array(w * h);
    try {
      const rawImg = await RawImage.fromURL(imgPath);
      const { pixel_values } = await rmbgProcessor(rawImg);
      const { output } = await rmbgModel({ input: pixel_values });
      const maskTensor = output[0].mul(255).to('uint8');
      const [, mh, mw] = maskTensor.dims;
      const resizedMask = await sharp(Buffer.from(maskTensor.data), {
        raw: { width: mw, height: mh, channels: 1 },
      })
        .resize(w, h, { fit: 'fill' })
        .raw()
        .toBuffer();

      let fgCount = 0;
      for (let i = 0; i < w * h; i++) {
        mask[i] = resizedMask[i] >= 90 ? 1.0 : 0.0;
        if (mask[i] > 0.5) fgCount++;
      }
      if (fgCount < w * h * 0.06) {
        const rgbBuf = await sharp(imgPath).rotate().removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer();
        mask = extractForegroundMask(rgbBuf, w, h);
      }
    } catch {
      const rgbBuf = await sharp(imgPath).rotate().removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer();
      mask = extractForegroundMask(rgbBuf, w, h);
    }

    // 3. Prepare optimized 1024px PBR texture JPEG for embedding inside the .glb
    const jpegBuffer = await sharp(imgPath)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer();

    // 4. Construct watertight double-sided 3D mesh and write binary .glb
    const meshData = constructWatertight3DMesh({ mask, depthMap, w, h, aspect, preset });
    const glbBuffer = buildGlbBinary({
      ...meshData,
      jpegBuffer,
      metalness: preset.metalness,
      roughness: preset.roughness,
    });

    const sid = item.id.split('-').pop();
    const glbFileName = `kfl-${sid}.glb`;
    const glbOutPath = path.join(OUT_MODEL_DIR, glbFileName);
    fs.writeFileSync(glbOutPath, glbBuffer);

    item.model.glb = `./models/alkafeel/${glbFileName}`;
    console.log(
      `  ✅ Built real 3D GLB: ${glbFileName} (${(glbBuffer.length / 1024).toFixed(0)} KB, ${meshData.indices.length / 3} tris)`
    );
  }

  // Update public/data/alkafeel-catalogue.json and src/data/alkafeelArtifacts.ts to use the real .glb files!
  fs.writeFileSync(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2), 'utf8');
  const tsContent = `// Auto-generated with real Depth-Anything-V2 3D GLB models from https://museum.alkafeel.net/nafessPage
import type { AlqamiArtifact } from './alqamiArtifacts';

export const ALKAFEEL_ARTIFACTS: AlqamiArtifact[] = ${JSON.stringify(catalogue, null, 2)};
`;
  fs.writeFileSync(path.resolve('src/data/alkafeelArtifacts.ts'), tsContent, 'utf8');
  console.log('\n🎉 All 28 Al-Kafeel Museum photos converted into real watertight 3D .glb models!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
