/**
 * Follows a Moon record's cover in the camera so its card can stay pinned beside it (natural-feature image tracking,
 * jsartoolkit-nft: about 730 KB, no TensorFlow, about 15 ms a frame on a laptop).
 *
 * Markers are built nightly by scripts/build-nft-targets.mjs into nft/; only the marker of the record in view is
 * downloaded (about 50-400 KB). Marker space is millimetres, x to the right and y up from the cover's bottom-left
 * corner, which is how the corners are projected below (checked against a drawn cover: centre within 3 px).
 */
import { ARControllerNFT } from '@webarkit/jsartoolkit-nft';

export interface CoverPose {
  /** Cover corners in the video frame, 0..1: top-left, top-right, bottom-right, bottom-left. */
  corners: Array<[number, number]>;
}

// The tracker finds markers only in 4:3 frames (the shape its camera file, camera_para.dat, was made for: a 640x360
// or a portrait 640x1138 frame finds nothing, measured with the library's own sample). So it is given the 4:3 middle
// of the camera frame, 640x480, and the corners it finds are mapped back to the whole frame.
const PROC_WIDTH = 640;
const PROC_HEIGHT = 480;
// Counters for checking on a device (window.__nft): frames processed, poses found, the marker being followed.
const stats = { frames: 0, found: 0, marker: '', size: '' };
(globalThis as unknown as { __nft?: typeof stats }).__nft = stats;
let manifest: Promise<Record<string, { file: string }>> | null = null;

const base = () => import.meta.env.BASE_URL || './';

function loadManifest() {
  manifest ??= fetch(`${base()}nft/index.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifest;
}

/** Whether a tracking marker exists for this Moon record. */
export async function hasCoverMarker(recordId: string): Promise<boolean> {
  return Boolean((await loadManifest())[recordId]);
}

// Column-major 4x4 multiply (WebGL order).
function mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export class CoverTracker {
  private ar: any = null;
  private size: [number, number] = [0, 0];
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  private markers = new Map<string, number>();
  private current: { id: number; w: number; h: number } | null = null;
  private timer = 0;
  private stopped = false;
  private lastSeen = 0;
  private crop = { x: 0, y: 0, w: 1, h: 1, vw: 1, vh: 1 };

  constructor(
    private onPose: (pose: CoverPose) => void,
    private onLost: () => void
  ) {}

  private async controller(video: HTMLVideoElement) {
    const w = PROC_WIDTH;
    const h = PROC_HEIGHT;
    // The 4:3 middle of the video, in video pixels.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = Math.min(vw, (vh * 4) / 3);
    const ch = (cw * 3) / 4;
    this.crop = { x: (vw - cw) / 2, y: (vh - ch) / 2, w: cw, h: ch, vw, vh };
    if (this.ar && this.size[0] === w && this.size[1] === h) return this.ar;
    this.size = [w, h];
    this.canvas.width = w;
    this.canvas.height = h;
    this.markers.clear();
    this.ar = await ARControllerNFT.initWithDimensions(w, h, `${base()}nft/camera_para.dat`, false);
    this.ar.addEventListener('getNFTMarker', (ev: any) => {
      if (!this.current || ev.data.index !== this.current.id) return;
      this.lastSeen = performance.now();
      stats.found++;
      const m = mul(this.ar.getCameraMatrix(), ev.data.matrixGL_RH);
      const at = (x: number, y: number): [number, number] => {
        const v = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[12 + r]);
        const u = (v[0] / v[3] + 1) / 2;
        const t = (1 - v[1] / v[3]) / 2;
        const c = this.crop;
        return [(c.x + u * c.w) / c.vw, (c.y + t * c.h) / c.vh];
      };
      const { w: cw, h: ch } = this.current;
      this.onPose({ corners: [at(0, ch), at(cw, ch), at(cw, 0), at(0, 0)] });
    });
    return this.ar;
  }

  /** Starts following the record's cover. False when the record has no marker (the caller shows the plain card). */
  async follow(recordId: string, video: HTMLVideoElement): Promise<boolean> {
    const entry = (await loadManifest())[recordId];
    if (!entry || !video.videoWidth || !this.ctx) return false;
    const ar = await this.controller(video);
    let id = this.markers.get(recordId);
    if (id === undefined) {
      id = await new Promise<number>((resolve, reject) => {
        ar.loadNFTMarker(`${base()}nft/${entry.file}`, (loaded: number) => resolve(loaded), (err: number) => reject(new Error(`marker ${err}`)));
      });
      this.markers.set(recordId, id);
    }
    ar.trackNFTMarkerId(id);
    const data = ar.getNFTData(id) as { width: number; height: number; dpi: number };
    const mm = (px: number) => (px / data.dpi) * 25.4;
    this.current = { id, w: mm(data.width), h: mm(data.height) };
    stats.marker = recordId;
    stats.size = `${this.size[0]}x${this.size[1]}`;
    this.stopped = false;
    this.lastSeen = performance.now();
    window.clearTimeout(this.timer);
    const tick = () => {
      if (this.stopped || !this.ctx) return;
      const c = this.crop;
      this.ctx.drawImage(video, c.x, c.y, c.w, c.h, 0, 0, this.size[0], this.size[1]);
      ar.process(this.ctx.getImageData(0, 0, this.size[0], this.size[1]));
      stats.frames++;
      // Lost when the cover has not been seen for a moment (a single missed frame keeps the card in place).
      if (performance.now() - this.lastSeen > 700) this.onLost();
      this.timer = window.setTimeout(tick, 40);
    };
    tick();
    return true;
  }

  stop() {
    this.stopped = true;
    this.current = null;
    window.clearTimeout(this.timer);
  }

  dispose() {
    this.stop();
    this.ar = null;
    this.markers.clear();
    this.canvas.width = 0;
  }
}
