/**
 * Real-life museum camera frame quality analyzer & anti-glare pre-processor.
 * - Measures Laplacian sharpness variance (rejects motion-blurred frames)
 * - Detects vitrine glass glare (% clipped highlights) & dim museum hall light
 * - Extracts glare-normalized, contrast-balanced crops for DINOv2 & Vision AI
 */

export interface FrameMetrics {
  sharpness: number; // Laplacian variance (> 45 = sharp enough, > 110 = crisp)
  brightness: number; // Mean luma 0..255
  glareRatio: number; // Fraction of pixels with luma > 246
  hint: 'ok' | 'blur' | 'glare' | 'dark';
}

const probeCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const probeCtx = probeCanvas ? probeCanvas.getContext('2d', { willReadFrequently: true }) : null;

export function analyzeFrameQuality(source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): FrameMetrics {
  if (!probeCanvas || !probeCtx) {
    return { sharpness: 120, brightness: 128, glareRatio: 0, hint: 'ok' };
  }
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!sw || !sh) return { sharpness: 0, brightness: 0, glareRatio: 0, hint: 'blur' };

  const W = 128;
  const H = 128;
  if (probeCanvas.width !== W || probeCanvas.height !== H) {
    probeCanvas.width = W;
    probeCanvas.height = H;
  }

  // Analyze center 75% (where the museum object sits inside the reticle)
  const side = Math.min(sw, sh) * 0.75;
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  probeCtx.drawImage(source, sx, sy, side, side, 0, 0, W, H);
  const data = probeCtx.getImageData(0, 0, W, H).data;

  const gray = new Float32Array(W * H);
  let sumLuma = 0;
  let glareCount = 0;
  for (let i = 0; i < W * H; i++) {
    const l = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    gray[i] = l;
    sumLuma += l;
    if (l > 246) glareCount++;
  }

  // 4-neighbor Laplacian variance for sharpness
  let sumLap = 0;
  let sumLapSq = 0;
  let n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - W] + gray[idx + W];
      sumLap += lap;
      sumLapSq += lap * lap;
      n++;
    }
  }
  const meanLap = sumLap / (n || 1);
  const sharpness = Math.max(0, sumLapSq / (n || 1) - meanLap * meanLap);
  const brightness = sumLuma / (W * H);
  const glareRatio = glareCount / (W * H);

  let hint: FrameMetrics['hint'] = 'ok';
  if (brightness < 38) hint = 'dark';
  else if (glareRatio > 0.16) hint = 'glare';
  else if (sharpness < 32) hint = 'blur';

  return { sharpness, brightness, glareRatio, hint };
}

/**
 * Draws a centered or offset crop onto `outCanvas` and applies gentle vitrine anti-glare
 * highlight roll-off + 2%–98% adaptive contrast normalization so real-life museum photos
 * behind glass match studio embeddings reliably.
 */
export function renderEnhancedCrop(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  outCanvas: HTMLCanvasElement,
  cx = 0.5,
  cy = 0.5,
  scale = 0.78,
  enhance = true
): boolean {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!sw || !sh) return false;

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const side = Math.min(sw, sh) * Math.min(1, Math.max(0.25, scale));
  const sx = Math.max(0, Math.min(sw - side, cx * sw - side / 2));
  const sy = Math.max(0, Math.min(sh - side, cy * sh - side / 2));

  ctx.drawImage(source, sx, sy, side, side, 0, 0, outCanvas.width, outCanvas.height);

  if (!enhance) return true;

  const img = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
  const d = img.data;

  // Build luma histogram for robust 2%–98% stretch
  const hist = new Uint32Array(256);
  const total = outCanvas.width * outCanvas.height;
  for (let i = 0; i < total; i++) {
    const l = Math.min(255, Math.round(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114));
    hist[l]++;
  }

  let acc = 0;
  let lo = 0;
  let hi = 255;
  const loTarget = total * 0.02;
  const hiTarget = total * 0.98;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= loTarget) {
      lo = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= hiTarget) {
      hi = i;
      break;
    }
  }

  // Only normalize if frame is noticeably washed out / hazy (common behind museum glass)
  const span = Math.max(30, hi - lo);
  if (lo > 14 || hi < 238) {
    // Blend 65% normalized + 35% original to preserve natural color tones
    const gain = 242 / span;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const orig = d[i + c];
        let stretched = (orig - lo) * gain;
        // Soft highlight roll-off above 225 to tame glass reflections
        if (stretched > 225) stretched = 225 + (stretched - 225) * 0.45;
        d[i + c] = Math.max(0, Math.min(255, Math.round(orig * 0.35 + stretched * 0.65)));
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return true;
}

/** Captures an HD JPEG base64 string (without data URL prefix) for Gemini Vision. */
export function captureHighResJpeg(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  maxDim = 1024,
  quality = 0.86
): string {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  const ratio = Math.min(1, maxDim / Math.max(sw || 1, sh || 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * ratio));
  c.height = Math.max(1, Math.round(sh * ratio));
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality).split(',')[1] || '';
}
