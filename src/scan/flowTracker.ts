/**
 * Keeps recognised objects' boxes on the objects while the visitor walks and the phone moves: corner features
 * (Shi-Tomasi) are picked inside each object's box and followed frame to frame with pyramidal Lucas-Kanade optical
 * flow, on a small grey copy of the camera frame. Each box moves with the median motion of its points and grows or
 * shrinks with their spread; points that disagree with the rest are dropped. When too few points survive (fast motion,
 * the object left the view, something passed in front) the object is "lost" and the caller falls back to the
 * gyroscope until the next recognition re-seeds it.
 *
 * Boxes are in video coordinates, 0..1 across and down.
 */
export interface TrackBox {
  x: number;
  y: number;
  /** Half the box's side, as a share of the frame's width (x) and height (y). */
  hw: number;
  hh: number;
}

interface Tracked {
  box: TrackBox;
  pts: Float32Array; // x, y in level-0 pixels
  n: number;
  lost: boolean;
}

const WIDTH = 240; // processing width (pixels); height follows the video's aspect
const LEVELS = 3;
const WIN = 4; // half window for Lucas-Kanade (9 x 9)
const ITERS = 8;
const MAX_POINTS = 48;
const MIN_POINTS = 8;

type Level = { w: number; h: number; px: Float32Array };

function downsample(l: Level): Level {
  const w = l.w >> 1;
  const h = l.h >> 1;
  const px = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * l.w + 2 * x;
      px[y * w + x] = (l.px[i] + l.px[i + 1] + l.px[i + l.w] + l.px[i + l.w + 1]) / 4;
    }
  return { w, h, px };
}

function sample(l: Level, x: number, y: number): number {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > l.w - 1.001) x = l.w - 1.001;
  if (y > l.h - 1.001) y = l.h - 1.001;
  const x0 = x | 0;
  const y0 = y | 0;
  const ax = x - x0;
  const ay = y - y0;
  const i = y0 * l.w + x0;
  return (l.px[i] * (1 - ax) + l.px[i + 1] * ax) * (1 - ay) + (l.px[i + l.w] * (1 - ax) + l.px[i + l.w + 1] * ax) * ay;
}

const median = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  return s.length ? s[s.length >> 1] : 0;
};

export class FlowTracker {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private prev: Level[] | null = null;
  private objects = new Map<string, Tracked>();

  private grab(video: HTMLVideoElement): Level[] | null {
    if (!video.videoWidth) return null;
    const w = WIDTH;
    const h = Math.round((WIDTH * video.videoHeight) / video.videoWidth);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    const d = this.ctx.getImageData(0, 0, w, h).data;
    const px = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) px[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    const pyr: Level[] = [{ w, h, px }];
    for (let k = 1; k < LEVELS; k++) pyr.push(downsample(pyr[k - 1]));
    return pyr;
  }

  /** Strong corners (Shi-Tomasi: the smaller eigenvalue of the gradient matrix) inside a box of level 0. */
  private corners(l: Level, box: TrackBox): Float32Array {
    const x0 = Math.max(3, Math.floor((box.x - box.hw) * l.w));
    const x1 = Math.min(l.w - 4, Math.ceil((box.x + box.hw) * l.w));
    const y0 = Math.max(3, Math.floor((box.y - box.hh) * l.h));
    const y1 = Math.min(l.h - 4, Math.ceil((box.y + box.hh) * l.h));
    const cand: Array<[number, number, number]> = [];
    for (let y = y0; y <= y1; y += 2)
      for (let x = x0; x <= x1; x += 2) {
        let gxx = 0;
        let gyy = 0;
        let gxy = 0;
        for (let v = -2; v <= 2; v++)
          for (let u = -2; u <= 2; u++) {
            const i = (y + v) * l.w + x + u;
            const gx = (l.px[i + 1] - l.px[i - 1]) / 2;
            const gy = (l.px[i + l.w] - l.px[i - l.w]) / 2;
            gxx += gx * gx;
            gyy += gy * gy;
            gxy += gx * gy;
          }
        const tr = (gxx + gyy) / 2;
        const score = tr - Math.sqrt(Math.max(0, tr * tr - (gxx * gyy - gxy * gxy)));
        if (score > 400) cand.push([score, x, y]);
      }
    cand.sort((a, b) => b[0] - a[0]);
    const out: number[] = [];
    for (const [, x, y] of cand) {
      if (out.length >= MAX_POINTS * 2) break;
      let ok = true;
      for (let k = 0; k < out.length && ok; k += 2) if (Math.abs(out[k] - x) < 6 && Math.abs(out[k + 1] - y) < 6) ok = false;
      if (ok) out.push(x, y);
    }
    return Float32Array.from(out);
  }

  /**
   * Lucas-Kanade from `a` to `b` for one point, coarse to fine; null when it fails to settle. `gx`, `gy`: a first guess
   * of the shift (level-0 pixels), e.g. from the gyroscope, so a quick turn starts the search near the answer.
   */
  private flow(a: Level[], b: Level[], x: number, y: number, gx = 0, gy = 0): [number, number] | null {
    let dx = gx / (1 << (LEVELS - 1));
    let dy = gy / (1 << (LEVELS - 1));
    for (let k = LEVELS - 1; k >= 0; k--) {
      const s = 1 / (1 << k);
      const px = x * s;
      const py = y * s;
      const la = a[k];
      const lb = b[k];
      let gxx = 0;
      let gyy = 0;
      let gxy = 0;
      const gxs: number[] = [];
      const gys: number[] = [];
      const ia: number[] = [];
      for (let v = -WIN; v <= WIN; v++)
        for (let u = -WIN; u <= WIN; u++) {
          const gx = (sample(la, px + u + 1, py + v) - sample(la, px + u - 1, py + v)) / 2;
          const gy = (sample(la, px + u, py + v + 1) - sample(la, px + u, py + v - 1)) / 2;
          gxs.push(gx);
          gys.push(gy);
          ia.push(sample(la, px + u, py + v));
          gxx += gx * gx;
          gyy += gy * gy;
          gxy += gx * gy;
        }
      const det = gxx * gyy - gxy * gxy;
      if (det < 1e-3) return null;
      for (let it = 0; it < ITERS; it++) {
        let bx = 0;
        let by = 0;
        let j = 0;
        for (let v = -WIN; v <= WIN; v++)
          for (let u = -WIN; u <= WIN; u++, j++) {
            const diff = ia[j] - sample(lb, px + dx + u, py + dy + v);
            bx += diff * gxs[j];
            by += diff * gys[j];
          }
        const ux = (gyy * bx - gxy * by) / det;
        const uy = (gxx * by - gxy * bx) / det;
        dx += ux;
        dy += uy;
        if (ux * ux + uy * uy < 0.0009) break;
      }
      if (k > 0) {
        dx *= 2;
        dy *= 2;
      }
    }
    return Number.isFinite(dx) && Number.isFinite(dy) ? [dx, dy] : null;
  }

  /** Start (or restart) following an object, from its box in the current frame. */
  seed(key: string, video: HTMLVideoElement, box: TrackBox) {
    const pyr = this.grab(video);
    if (!pyr) return;
    this.prev = pyr;
    const pts = this.corners(pyr[0], box);
    this.objects.set(key, { box: { ...box }, pts, n: pts.length / 2, lost: pts.length / 2 < MIN_POINTS });
  }

  forget(key: string) {
    this.objects.delete(key);
  }

  clear() {
    this.objects.clear();
    this.prev = null;
  }

  /** Where an object is now, or null if it is not tracked or lost. */
  box(key: string): TrackBox | null {
    const o = this.objects.get(key);
    return o && !o.lost ? o.box : null;
  }

  /**
   * One camera frame: moves every tracked object's points and box. `prior`: how far the picture moved since the last
   * frame as the gyroscope sees it (fractions of the frame's width and height), used as the search's starting guess.
   */
  update(video: HTMLVideoElement, prior?: { x: number; y: number }) {
    if (!this.objects.size) return;
    const cur = this.grab(video);
    if (!cur) return;
    const prev = this.prev;
    this.prev = cur;
    if (!prev || prev[0].w !== cur[0].w || prev[0].h !== cur[0].h) return;
    const W = cur[0].w;
    const H = cur[0].h;
    const gx = prior ? prior.x * W : 0;
    const gy = prior ? prior.y * H : 0;
    for (const o of this.objects.values()) {
      if (o.lost) continue;
      const moved: number[] = [];
      const from: number[] = [];
      for (let i = 0; i < o.n; i++) {
        const x = o.pts[i * 2];
        const y = o.pts[i * 2 + 1];
        const d = this.flow(prev, cur, x, y, gx, gy);
        if (!d) continue;
        const nx = x + d[0];
        const ny = y + d[1];
        if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
        from.push(x, y);
        moved.push(nx, ny);
      }
      // Agreement: drop points whose motion is far from the median motion.
      const mdx = median(moved.filter((_, i) => i % 2 === 0).map((v, i) => v - from[i * 2]));
      const mdy = median(moved.filter((_, i) => i % 2 === 1).map((v, i) => v - from[i * 2 + 1]));
      const keepFrom: number[] = [];
      const keep: number[] = [];
      for (let i = 0; i < moved.length; i += 2) {
        const ex = moved[i] - from[i] - mdx;
        const ey = moved[i + 1] - from[i + 1] - mdy;
        if (ex * ex + ey * ey < 4) keepFrom.push(from[i], from[i + 1]), keep.push(moved[i], moved[i + 1]);
      }
      const n = keep.length / 2;
      if (n < MIN_POINTS || n < o.n * 0.35) {
        o.lost = true;
        continue;
      }
      // Scale: how the spread of the points around their centre changed (walking closer or away).
      let cx0 = 0, cy0 = 0, cx1 = 0, cy1 = 0;
      for (let i = 0; i < keep.length; i += 2) (cx0 += keepFrom[i]), (cy0 += keepFrom[i + 1]), (cx1 += keep[i]), (cy1 += keep[i + 1]);
      cx0 /= n; cy0 /= n; cx1 /= n; cy1 /= n;
      const ratios: number[] = [];
      for (let i = 0; i < keep.length; i += 2) {
        const r0 = Math.hypot(keepFrom[i] - cx0, keepFrom[i + 1] - cy0);
        if (r0 > 3) ratios.push(Math.hypot(keep[i] - cx1, keep[i + 1] - cy1) / r0);
      }
      const scale = Math.min(1.15, Math.max(0.87, ratios.length >= 4 ? median(ratios) : 1));
      o.box = {
        x: o.box.x + mdx / W,
        y: o.box.y + mdy / H,
        hw: Math.min(0.5, o.box.hw * scale),
        hh: Math.min(0.5, o.box.hh * scale),
      };
      o.pts = Float32Array.from(keep);
      o.n = n;
      if (o.box.x < -0.1 || o.box.x > 1.1 || o.box.y < -0.1 || o.box.y > 1.1) o.lost = true;
    }
  }
}
