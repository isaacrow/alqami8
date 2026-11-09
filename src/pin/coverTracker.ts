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

const PROC_WIDTH = 640;
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

  constructor(
    private onPose: (pose: CoverPose) => void,
    private onLost: () => void
  ) {}

  private async controller(video: HTMLVideoElement) {
    const w = PROC_WIDTH;
    const h = Math.round((PROC_WIDTH * video.videoHeight) / video.videoWidth);
    if (this.ar && this.size[0] === w && this.size[1] === h) return this.ar;
    this.size = [w, h];
    this.canvas.width = w;
    this.canvas.height = h;
    this.markers.clear();
    this.ar = await ARControllerNFT.initWithDimensions(w, h, `${base()}nft/camera_para.dat`, false);
    this.ar.addEventListener('getNFTMarker', (ev: any) => {
      if (!this.current || ev.data.index !== this.current.id) return;
      this.lastSeen = performance.now();
      const m = mul(this.ar.getCameraMatrix(), ev.data.matrixGL_RH);
      const at = (x: number, y: number): [number, number] => {
        const v = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[12 + r]);
        return [(v[0] / v[3] + 1) / 2, (1 - v[1] / v[3]) / 2];
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
    this.stopped = false;
    this.lastSeen = performance.now();
    window.clearTimeout(this.timer);
    const tick = () => {
      if (this.stopped || !this.ctx) return;
      this.ctx.drawImage(video, 0, 0, this.size[0], this.size[1]);
      ar.process(this.ctx.getImageData(0, 0, this.size[0], this.size[1]));
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
