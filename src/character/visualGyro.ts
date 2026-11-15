/**
 * How the phone turns, read from the camera picture instead of the motion sensor (which iPhone only gives after a
 * permission question that often never shows). Each frame, the whole picture's shift since the last frame is found
 * with Lucas-Kanade on a small grey copy (three pyramid levels); a shift of the room to the left means the phone
 * turned right. The shift is measured in screen pixels of the full-screen ("cover") camera view, so the character,
 * drawn with the stage camera's field of view, moves exactly with the room in the picture.
 *
 * Turning is followed well; walking shows up as turning (it is not tracked), and things moving in front of the camera
 * pull a little. Good enough to leave him standing where he was put while the visitor looks around.
 */
const W = 112; // processing width; height follows the video

type Level = { w: number; h: number; px: Float32Array };

export function half(l: Level): Level {
  const w = l.w >> 1;
  const h = l.h >> 1;
  const px = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * l.w + 2 * x;
      px[y * w + x] = (l.px[i] + l.px[i + 1] + l.px[i + l.w] + l.px[i + l.w + 1]) * 0.25;
    }
  return { w, h, px };
}

/** The shift (dx, dy) that maps `a` onto `b`, refined from a guess, by Lucas-Kanade over the whole image. */
const LEVELS = 4;

/** The whole-pixel shift (within ±4) with the smallest mean difference: the start for the finer levels. */
export function coarse(a: Level, b: Level): [number, number] {
  let best = Infinity;
  let bx = 0;
  let by = 0;
  const R = 4;
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, -dy); y < Math.min(a.h, b.h - dy); y++)
        for (let x = Math.max(0, -dx); x < Math.min(a.w, b.w - dx); x++) {
          sum += Math.abs(a.px[y * a.w + x] - b.px[(y + dy) * b.w + x + dx]);
          n++;
        }
      // A small pull towards no shift, so a blank picture does not wander.
      const cost = sum / Math.max(1, n) + 0.002 * (Math.abs(dx) + Math.abs(dy));
      if (n > (a.w * a.h) / 3 && cost < best) {
        best = cost;
        bx = dx;
        by = dy;
      }
    }
  return [bx, by];
}

export function shift(a: Level, b: Level, gx: number, gy: number): [number, number, number] {
  let dx = gx;
  let dy = gy;
  let quality = 0;
  const m = 3;
  for (let it = 0; it < 6; it++) {
    let sxx = 0, sxy = 0, syy = 0, sxt = 0, syt = 0;
    for (let y = m; y < a.h - m; y++) {
      const by = y + dy;
      const y0 = Math.floor(by);
      if (y0 < 0 || y0 + 1 >= b.h) continue;
      const fy = by - y0;
      for (let x = m; x < a.w - m; x++) {
        const bx = x + dx;
        const x0 = Math.floor(bx);
        if (x0 < 0 || x0 + 1 >= b.w) continue;
        const fx = bx - x0;
        const i = y0 * b.w + x0;
        const v = (b.px[i] * (1 - fx) + b.px[i + 1] * fx) * (1 - fy) + (b.px[i + b.w] * (1 - fx) + b.px[i + b.w + 1] * fx) * fy;
        const j = y * a.w + x;
        const ix = (a.px[j + 1] - a.px[j - 1]) * 0.5;
        const iy = (a.px[j + a.w] - a.px[j - a.w]) * 0.5;
        const t = v - a.px[j];
        sxx += ix * ix; sxy += ix * iy; syy += iy * iy; sxt += ix * t; syt += iy * t;
      }
    }
    const det = sxx * syy - sxy * sxy;
    if (det < 1e-6) return [dx, dy, 0];
    const ux = -(syy * sxt - sxy * syt) / det;
    const uy = -(sxx * syt - sxy * sxt) / det;
    dx += ux;
    dy += uy;
    // How well the picture pins the shift down (a blank wall gives little): the smaller eigenvalue, per pixel.
    quality = (sxx + syy - Math.sqrt((sxx - syy) ** 2 + 4 * sxy * sxy)) / 2 / (a.w * a.h);
    if (Math.abs(ux) + Math.abs(uy) < 0.01) break;
  }
  return [dx, dy, quality];
}

export class VisualGyro {
  yaw = 0;
  pitch = 0;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private prev: Level[] | null = null;
  private lastTime = -1;

  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this.prev = null;
    this.lastTime = -1;
  }

  /**
   * Reads one camera frame. `screenW/H` and `vfov` (radians) are the stage's view, to turn picture shifts into angles.
   * Returns false until the camera gives frames.
   */
  update(video: HTMLVideoElement, screenW: number, screenH: number, vfov: number): boolean {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return false;
    if (video.currentTime === this.lastTime) return this.prev != null; // no new frame yet
    this.lastTime = video.currentTime;
    const w = W;
    const h = Math.max(16, Math.round((W * vh) / vw));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.prev = null;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    const rgba = this.ctx.getImageData(0, 0, w, h).data;
    const px = new Float32Array(w * h);
    for (let i = 0; i < px.length; i++) px[i] = (rgba[4 * i] * 0.3 + rgba[4 * i + 1] * 0.59 + rgba[4 * i + 2] * 0.11) / 255;
    const l0: Level = { w, h, px };
    const pyr = [l0];
    for (let k = 1; k < LEVELS; k++) pyr.push(half(pyr[k - 1]));
    if (this.prev) {
      // Coarsest level first: try every whole-pixel shift nearby (a slow frame or a quick turn can move the picture
      // further than gradient steps can follow), then refine down the pyramid.
      let [dx, dy] = coarse(this.prev[LEVELS - 1], pyr[LEVELS - 1]);
      let q = 0;
      for (let k = LEVELS - 1; k >= 0; k--) {
        if (k < LEVELS - 1) {
          dx *= 2;
          dy *= 2;
        }
        [dx, dy, q] = shift(this.prev[k], pyr[k], dx, dy);
      }
      // Trust the shift only when the picture has texture and the jump is plausible for one frame.
      if (q > 2e-5 && Math.abs(dx) < w * 0.4 && Math.abs(dy) < h * 0.4) {
        // Processing pixels → screen pixels of the full-screen ("cover") view → angles of the stage camera.
        const cover = Math.max(screenW / vw, screenH / vh) * (vw / w);
        const f = screenH / 2 / Math.tan(vfov / 2);
        this.yaw += (dx * cover) / f;
        this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + (dy * cover) / f));
      }
    }
    this.prev = pyr;
    return true;
  }
}
