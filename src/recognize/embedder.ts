/**
 * DINOv2-small image embeddings in the browser (Transformers.js / ONNX Runtime Web).
 *
 * Chosen by measurement: on visitor-style photos of Moon's 125 covers it put the right book first 76% of the time
 * against 23% for MobileNetV4-small (scripts/recognition-bench.mjs). The model (about 24 MB, int8) is only loaded
 * while a scanner is open and released when it closes, because iPhone Safari kills tabs that hold too much memory.
 *
 * DINOv3-S/16 was compared on 2026-11-14 (scripts/model-bench.mjs, 132 rendered views from unseen angles): 99% vs 98%
 * answered, both with no wrong answer, the same side accuracy and speed, so DINOv2 stays (no index rebuild, no new
 * download for visitors).
 *
 * The image preparation here must match scripts/build-recognition-index.mjs exactly: the picture resized to
 * 224 x 224 without cropping, ImageNet normalisation, and the CLS token. On scanner-like views (the object inside
 * the guide square) the CLS token beat the mean of the patch tokens: 74% vs 58% right first (recognition-bench.mjs).
 */

export const EMBED_MODEL = 'Xenova/dinov2-small';
export const EMBED_KEY = 'dinov2s';
const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type Transformers = typeof import('@huggingface/transformers');

export class Embedder {
  private lib: Transformers | null = null;
  private model: any = null;
  private loading: Promise<void> | null = null;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true });

  constructor(private device: 'wasm' | 'webgpu' = 'wasm') {
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
  }

  load(): Promise<void> {
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.loading ??= (async () => {
      const lib = await import('@huggingface/transformers');
      lib.env.allowLocalModels = false;
      this.model = await lib.AutoModel.from_pretrained(EMBED_MODEL, { dtype: 'q8', device: this.device });
      this.lib = lib;
    })();
    return this.loading;
  }

  /**
   * Embedding of the centre of a video frame (the square the scanner's guide frame shows), or of a whole image.
   * `crop` is the share of the shorter side used for video frames.
   */
  async embed(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, crop = 0.8): Promise<Float32Array | null> {
    await this.load();
    if (!this.ctx || !this.lib || !this.model) return null;
    const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!w || !h) return null;
    if (source instanceof HTMLVideoElement) {
      const side = Math.min(w, h) * crop;
      this.ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
    } else {
      this.ctx.drawImage(source, 0, 0, w, h, 0, 0, SIZE, SIZE);
    }
    const { data } = this.ctx.getImageData(0, 0, SIZE, SIZE);
    const px = new Float32Array(3 * SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
    const out = await this.model({ pixel_values: new this.lib.Tensor('float32', px, [1, 3, SIZE, SIZE]) });
    return clsToken(out.last_hidden_state.data as Float32Array, out.last_hidden_state.dims as number[]);
  }

  async dispose() {
    const model = this.model;
    this.model = null;
    this.lib = null;
    this.loading = null;
    this.canvas.width = 0;
    await model?.dispose?.();
  }
}

/** The CLS token, unit length. */
export function clsToken(d: ArrayLike<number>, dims: number[]): Float32Array {
  const dim = dims[2];
  const out = new Float32Array(dim);
  let n = 0;
  for (let k = 0; k < dim; k++) {
    out[k] = d[k];
    n += out[k] * out[k];
  }
  n = Math.sqrt(n) || 1;
  for (let k = 0; k < dim; k++) out[k] /= n;
  return out;
}
