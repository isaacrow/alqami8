// High-Speed WebGL GPU Multi-Angle 3D Statue & Artifact Feature Extractor for Alqami
// Combines 4-Window Multi-Scale + Elliptical Foreground Masking (1280-D MobileNetV2) + 64-D 3D Part-Structure Signature
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as tf from '@tensorflow/tfjs';

const SIZE = 224;

export class FeatureExtractor {
  constructor() {
    this.model = null;
    this.isLoading = false;
    this.isReady = false;

    // Reusable offscreen canvases for zero-GC 60fps mobile scanning
    this._cropCanvasMed = document.createElement('canvas');
    this._cropCanvasMed.width = SIZE;
    this._cropCanvasMed.height = SIZE;
    this._cropCtxMed = this._cropCanvasMed.getContext('2d', { willReadFrequently: true });

    this._cropCanvasTight = document.createElement('canvas');
    this._cropCanvasTight.width = SIZE;
    this._cropCanvasTight.height = SIZE;
    this._cropCtxTight = this._cropCanvasTight.getContext('2d', { willReadFrequently: true });

    this._cropCanvasMasked = document.createElement('canvas');
    this._cropCanvasMasked.width = SIZE;
    this._cropCanvasMasked.height = SIZE;
    this._cropCtxMasked = this._cropCanvasMasked.getContext('2d', { willReadFrequently: true });

    this._saliencyCanvas = document.createElement('canvas');
    this._saliencyCanvas.width = 96;
    this._saliencyCanvas.height = 96;
    this._saliencyCtx = this._saliencyCanvas.getContext('2d', { willReadFrequently: true });

    // Smoothed salient ROI state so the target lock box glides smoothly on screen
    this._smoothRoi = null;
  }

  async init() {
    if (this.isReady && this.model) return true;
    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise(r => setTimeout(r, 40));
      }
      return this.isReady;
    }

    this.isLoading = true;
    try {
      console.log('Loading WebGL MobileNetV2 3D Multi-Scale Feature Extractor...');
      this.model = await mobilenet.load({
        version: 2,
        alpha: 1.0
      });
      this.isReady = true;
      console.log('WebGL MobileNetV2 3D Feature Extractor ready (60 FPS GPU mode)!');
      return true;
    } catch (err) {
      console.error('Failed to load MobileNetV2 model:', err);
      this.isReady = false;
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  _inferNormalized(canvasOrElem) {
    return tf.tidy(() => {
      const embeddingTensor = this.model.infer(canvasOrElem, true);
      const squeezed = embeddingTensor.squeeze();
      const norm = squeezed.norm();
      const normalizedTensor = squeezed.div(norm.add(1e-8));
      return new Float32Array(normalizedTensor.dataSync());
    });
  }

  /**
   * Applies a soft elliptical foreground mask on a 224x224 canvas, replacing background corners
   * with neutral gray [140, 144, 150] so desk clutter does not pollute the CNN embedding!
   */
  _buildEllipticalMaskedCanvas(sourceCanvas224, rx = 0.42, ry = 0.48) {
    this._cropCtxMasked.drawImage(sourceCanvas224, 0, 0);
    const imgData = this._cropCtxMasked.getImageData(0, 0, SIZE, SIZE);
    const d = imgData.data;

    for (let y = 0; y < SIZE; y++) {
      const ny = (y - 112) / 112;
      for (let x = 0; x < SIZE; x++) {
        const nx = (x - 112) / 112;
        const dist = Math.sqrt((nx * nx) / (rx * rx) + (ny * ny) / (ry * ry));
        if (dist > 0.75) {
          const alpha = Math.min(1.0, Math.max(0.0, (dist - 0.75) / 0.40));
          const idx = (y * SIZE + x) * 4;
          d[idx] = Math.round(d[idx] * (1 - alpha) + 140 * alpha);
          d[idx + 1] = Math.round(d[idx + 1] * (1 - alpha) + 144 * alpha);
          d[idx + 2] = Math.round(d[idx + 2] * (1 - alpha) + 150 * alpha);
        }
      }
    }
    this._cropCtxMasked.putImageData(imgData, 0, 0);
    return this._cropCanvasMasked;
  }

  /**
   * 64-D L2-normalized 3D Part-Structure & Material Signature:
   * Divides the 224x224 crop into 3 vertical anatomical zones (Top=Head/Visor, Mid=Torso/Arms, Bot=Legs/Base)
   * and measures Matte-White, Metallic-Gold visor/stripes, Bronze/Wood, Luminance, Saturation, and 4-dir Edge gradients.
   */
  extractColorSignature(canvas224) {
    const ctx = canvas224.getContext('2d', { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const sig = new Float32Array(64);

    const zoneFeats = [new Float32Array(12), new Float32Array(12), new Float32Array(12)];
    const zoneWeights = [0, 0, 0];

    const rHist = new Float32Array(8);
    const gHist = new Float32Array(8);
    const bHist = new Float32Array(8);
    const edgeOrient = new Float32Array(4);
    let totalW = 0;

    const step = 3;
    for (let y = 20; y < 204; y += step) {
      const ny = (y - 112) / 112;
      const zIdx = y < 86 ? 0 : (y < 152 ? 1 : 2);

      for (let x = 24; x < 200; x += step) {
        const nx = (x - 112) / 112;
        const ellipDist = (nx * nx) / 0.55 + (ny * ny) / 0.85;
        if (ellipDist > 1.0) continue;

        const w = Math.exp(-ellipDist * 1.8);
        const idx = (y * SIZE + x) * 4;
        const r = data[idx] / 255;
        const g = data[idx + 1] / 255;
        const b = data[idx + 2] / 255;

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const delta = maxC - minC;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = maxC > 0.04 ? delta / maxC : 0;

        const zf = zoneFeats[zIdx];
        zoneWeights[zIdx] += w;

        if (lum > 0.52 && sat < 0.28) zf[0] += w * 1.8;
        if (r > 0.42 && g > 0.32 && b < 0.38 && (r - b) > 0.18 && (g - b) > 0.08) zf[1] += w * 2.8;
        if (r > 0.65 && g > 0.52 && (r - b) > 0.25) zf[2] += w * 3.0;
        if (lum >= 0.38 && lum <= 0.72 && b >= r - 0.05 && sat < 0.32) zf[3] += w * 1.4;
        if (lum < 0.22) zf[4] += w;
        if (r > g && g > b && lum >= 0.20 && lum <= 0.55 && (r - g) > 0.08) zf[5] += w * 1.2;
        zf[6] += r * w;
        zf[7] += g * w;
        zf[8] += b * w;
        zf[9] += lum * w;
        zf[10] += sat * w;

        const idxR = (y * SIZE + Math.min(223, x + 2)) * 4;
        const idxD = (Math.min(223, y + 2) * SIZE + x) * 4;
        const lumR = (0.299 * data[idxR] + 0.587 * data[idxR + 1] + 0.114 * data[idxR + 2]) / 255;
        const lumD = (0.299 * data[idxD] + 0.587 * data[idxD + 1] + 0.114 * data[idxD + 2]) / 255;
        const gx = lumR - lum;
        const gy = lumD - lum;
        const mag = Math.sqrt(gx * gx + gy * gy);
        zf[11] += mag * w * 2.0;

        if (mag > 0.04) {
          if (Math.abs(gx) > Math.abs(gy) * 1.5) edgeOrient[0] += mag * w;
          else if (Math.abs(gy) > Math.abs(gx) * 1.5) edgeOrient[1] += mag * w;
          else if (gx * gy > 0) edgeOrient[2] += mag * w;
          else edgeOrient[3] += mag * w;
        }

        rHist[Math.min(7, Math.floor(r * 8))] += w;
        gHist[Math.min(7, Math.floor(g * 8))] += w;
        bHist[Math.min(7, Math.floor(b * 8))] += w;
        totalW += w;
      }
    }

    for (let z = 0; z < 3; z++) {
      const zw = zoneWeights[z] || 1;
      for (let f = 0; f < 12; f++) {
        sig[z * 12 + f] = zoneFeats[z][f] / zw;
      }
    }

    if (totalW > 0) {
      for (let i = 0; i < 8; i++) {
        sig[36 + i] = rHist[i] / totalW;
        sig[44 + i] = gHist[i] / totalW;
        sig[52 + i] = bHist[i] / totalW;
      }
      for (let i = 0; i < 4; i++) {
        sig[60 + i] = edgeOrient[i] / totalW;
      }
    }

    let norm = 0;
    for (let i = 0; i < sig.length; i++) norm += sig[i] * sig[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < sig.length; i++) sig[i] /= norm;
    return sig;
  }

  /**
   * Smart 3D Statue & Object Auto-Tracker (`detectSalientRoi`):
   * Combines Sobel edge energy + metallic gold / high-contrast object saliency on a 96x96 grid,
   * and applies temporal LERP smoothing so the lock box smoothly tracks the physical object!
   */
  detectSalientRoi(source, roi) {
    const S = 96;
    this._saliencyCtx.drawImage(source, roi.x, roi.y, roi.width, roi.height, 0, 0, S, S);
    const { data } = this._saliencyCtx.getImageData(0, 0, S, S);

    const lum = new Float32Array(S * S);
    const chromaBoost = new Float32Array(S * S);

    for (let i = 0; i < S * S; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      // Boost metallic gold/amber or bright 3D object features
      if (r > 110 && g > 85 && (r - b) > 45) {
        chromaBoost[i] = 28;
      }
    }

    let sumE = 0;
    let sumX = 0;
    let sumY = 0;
    const energy = new Float32Array(S * S);

    for (let y = 8; y < S - 8; y++) {
      const ny = (y - S / 2) / (S / 2);
      for (let x = 8; x < S - 8; x++) {
        const nx = (x - S / 2) / (S / 2);
        const centerPrior = Math.exp(-(nx * nx + ny * ny) * 1.5);
        const i = y * S + x;
        const gx = Math.abs(lum[i + 1] - lum[i - 1]);
        const gy = Math.abs(lum[i + S] - lum[i - S]);
        const e = (gx + gy + chromaBoost[i]) * centerPrior;
        energy[i] = e;
        if (e > 16) {
          sumE += e;
          sumX += x * e;
          sumY += y * e;
        }
      }
    }

    let rawBox;
    if (sumE < 90) {
      const side = roi.width * 0.58;
      rawBox = {
        x: roi.x + (roi.width - side) / 2,
        y: roi.y + (roi.height - side) / 2,
        width: side,
        height: side,
        sharpness: 0
      };
    } else {
      const cx = sumX / sumE;
      const cy = sumY / sumE;
      let varSq = 0;
      for (let y = 8; y < S - 8; y++) {
        for (let x = 8; x < S - 8; x++) {
          const e = energy[y * S + x];
          if (e > 16) {
            const dx = x - cx;
            const dy = y - cy;
            varSq += e * (dx * dx + dy * dy);
          }
        }
      }
      const spread = Math.sqrt(varSq / sumE);
      const ratio = Math.max(0.42, Math.min(0.76, (spread * 2.9) / S));
      const tightSide = roi.width * ratio;

      const absCx = roi.x + (cx / S) * roi.width;
      const absCy = roi.y + (cy / S) * roi.height;
      const tx = Math.max(roi.x, Math.min(roi.x + roi.width - tightSide, absCx - tightSide / 2));
      const ty = Math.max(roi.y, Math.min(roi.y + roi.height - tightSide, absCy - tightSide / 2));

      rawBox = {
        x: tx,
        y: ty,
        width: tightSide,
        height: tightSide,
        sharpness: sumE / (S * S)
      };
    }

    // Smooth LERP so the green/cyan target lock box glides smoothly over the statue
    if (!this._smoothRoi) {
      this._smoothRoi = { ...rawBox };
    } else {
      const alpha = 0.35;
      this._smoothRoi.x += (rawBox.x - this._smoothRoi.x) * alpha;
      this._smoothRoi.y += (rawBox.y - this._smoothRoi.y) * alpha;
      this._smoothRoi.width += (rawBox.width - this._smoothRoi.width) * alpha;
      this._smoothRoi.height += (rawBox.height - this._smoothRoi.height) * alpha;
      this._smoothRoi.sharpness = rawBox.sharpness;
    }

    return { ...this._smoothRoi };
  }

  async extractEmbedding(inputElement) {
    if (!this.isReady || !this.model) {
      await this.init();
    }

    const w = inputElement.videoWidth || inputElement.naturalWidth || inputElement.width || SIZE;
    const h = inputElement.videoHeight || inputElement.naturalHeight || inputElement.height || SIZE;
    const side = Math.min(w, h) * 0.78;
    const sx = (w - side) / 2;
    const sy = (h - side) / 2;

    this._cropCtxMed.clearRect(0, 0, SIZE, SIZE);
    this._cropCtxMed.drawImage(inputElement, sx, sy, side, side, 0, 0, SIZE, SIZE);
    return this._inferNormalized(this._cropCanvasMed);
  }

  /**
   * Extracts a 4-Window Multi-Scale + Foreground-Masked Query Descriptor in <25ms on WebGL GPU:
   * 1. mediumVector: Full reticle crop (68%)
   * 2. tightVector: Salient Auto-Tracked statue box crop
   * 3. maskedVector: Elliptical foreground-masked statue crop (background corners erased!)
   * 4. colorSignature: 64-D 3D Part-Structure & Material Signature
   */
  async extractFromCrop(source, roi) {
    if (!this.isReady || !this.model) {
      await this.init();
    }

    // 1. Medium ROI Crop
    this._cropCtxMed.drawImage(
      source,
      roi.x, roi.y, roi.width, roi.height,
      0, 0, SIZE, SIZE
    );

    // 2. Salient Auto-Tracked Statue Crop
    const salientRoi = this.detectSalientRoi(source, roi);
    this._cropCtxTight.drawImage(
      source,
      salientRoi.x, salientRoi.y, salientRoi.width, salientRoi.height,
      0, 0, SIZE, SIZE
    );

    // 3. Elliptical Foreground-Masked Canvas (erases desk clutter around the statue!)
    const maskedCanvas = this._buildEllipticalMaskedCanvas(this._cropCanvasTight, 0.42, 0.48);

    const mediumVector = this._inferNormalized(this._cropCanvasMed);
    const tightVector = this._inferNormalized(this._cropCanvasTight);
    const maskedVector = this._inferNormalized(maskedCanvas);

    // Fused Query Vector combining Masked Foreground + Tight + Medium
    const fusedVector = new Float32Array(mediumVector.length);
    let norm = 0;
    for (let i = 0; i < mediumVector.length; i++) {
      const v = maskedVector[i] * 0.42 + tightVector[i] * 0.36 + mediumVector[i] * 0.22;
      fusedVector[i] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < fusedVector.length; i++) {
      fusedVector[i] /= norm;
    }

    const colorSignature = this.extractColorSignature(this._cropCanvasTight);

    fusedVector.mediumVector = mediumVector;
    fusedVector.tightVector = tightVector;
    fusedVector.maskedVector = maskedVector;
    fusedVector.colorSignature = colorSignature;
    fusedVector.salientRoi = salientRoi;

    return fusedVector;
  }

  /**
   * Generates a rich bank of Multi-Scale + Foreground-Masked Reference Embeddings from a reference image
   */
  async extractMultiScaleFromImage(imgElement, baseView = 'angle', baseLabel = 'Reference View') {
    if (!this.isReady || !this.model) {
      await this.init();
    }

    const w = imgElement.videoWidth || imgElement.naturalWidth || imgElement.width;
    const h = imgElement.videoHeight || imgElement.naturalHeight || imgElement.height;
    const minSide = Math.min(w, h);

    const scales = [
      { suffix: 'tight', ratio: 0.42, desc: 'Tight Core' },
      { suffix: 'medium', ratio: 0.62, desc: 'Medium Frame' },
      { suffix: 'wide', ratio: 0.84, desc: 'Wide Context' }
    ];

    const results = [];
    for (const sc of scales) {
      const side = Math.round(minSide * sc.ratio);
      const sx = Math.round((w - side) / 2);
      const sy = Math.round((h - side) / 2);

      this._cropCtxTight.clearRect(0, 0, SIZE, SIZE);
      this._cropCtxTight.drawImage(imgElement, sx, sy, side, side, 0, 0, SIZE, SIZE);

      const vec = this._inferNormalized(this._cropCanvasTight);
      const colorSig = this.extractColorSignature(this._cropCanvasTight);

      results.push({
        view: baseView,
        scale: sc.suffix,
        label: `${baseLabel} [${sc.desc}]`,
        vector: Array.from(vec).map(n => Math.round(n * 10000) / 10000),
        colorSignature: Array.from(colorSig).map(n => Math.round(n * 10000) / 10000)
      });

      if (sc.suffix === 'tight' || sc.suffix === 'medium') {
        const maskedCanvas = this._buildEllipticalMaskedCanvas(this._cropCanvasTight, 0.42, 0.48);
        const maskedVec = this._inferNormalized(maskedCanvas);
        results.push({
          view: baseView,
          scale: `${sc.suffix}-masked`,
          label: `${baseLabel} [${sc.desc} • Masked]`,
          vector: Array.from(maskedVec).map(n => Math.round(n * 10000) / 10000),
          colorSignature: Array.from(colorSig).map(n => Math.round(n * 10000) / 10000)
        });
      }
    }

    return results;
  }
}
