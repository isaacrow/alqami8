import { Decider, Decision, IndexEntry, rank } from './decide';
import { Embedder } from './embedder';
import { encodeView, loadRecognitionIndex } from './recognitionIndex';
import { sightBackend } from './backend';

export type SightTarget = { kind: 'moon'; recordId: string } | { kind: 'artifact'; id: string };

export type SightResult =
  | { kind: 'match'; target: SightTarget; score: number; angle: number | null }
  | { kind: 'unsure'; candidates: Array<{ target: SightTarget; score: number }> }
  | { kind: 'none' };

export function targetOf(key: string): SightTarget {
  return key.startsWith('artifact:') ? { kind: 'artifact', id: key.slice(9) } : { kind: 'moon', recordId: key.replace(/^moon:/, '') };
}

/**
 * Recognition by sight: one camera frame at a time, through DINOv2 and the nightly recognition index, decided by
 * the gap-to-runner-up rule over steady frames (see decide.ts). Create it when a scanner opens; dispose it after.
 */
export class SightRecognizer {
  private embedder: Embedder | null = null;
  private decider: Decider | null = null;
  private ready: Promise<void> | null = null;
  private entries: IndexEntry[] = [];

  /** The model this phone uses (WebGPU after a self-test, else WASM): see backend.ts. */
  backend = '';

  /** Loads the index and the model. Rejects when either is unavailable (no signal on first use, missing index). */
  prepare(): Promise<void> {
    this.ready ??= (async () => {
      const b = await sightBackend();
      const embedder = new Embedder(b.device, b.dtype);
      this.embedder = embedder;
      this.backend = `${b.device} ${b.dtype}`;
      await embedder.load();
      // Objects taught under the other model are re-learnt from their photos with this one.
      const reembed = async (photos: Blob[]) => {
        const out: string[] = [];
        for (const p of photos) {
          const bmp = await createImageBitmap(p);
          const c = document.createElement('canvas');
          c.width = bmp.width;
          c.height = bmp.height;
          c.getContext('2d')!.drawImage(bmp, 0, 0);
          const v = await embedder.embed(c);
          if (v) out.push(encodeView(v));
        }
        return out;
      };
      const { entries } = await loadRecognitionIndex(b.key, reembed);
      this.entries = entries;
      this.decider = new Decider(entries);
    })();
    return this.ready;
  }

  async step(video: HTMLVideoElement | HTMLCanvasElement): Promise<SightResult> {
    await this.prepare();
    const query = await this.embedder!.embed(video);
    if (!query || !this.decider) return { kind: 'none' };
    const d: Decision = this.decider.next(query);
    if (d.kind === 'match') return { kind: 'match', target: targetOf(d.key), score: d.score, angle: d.angle };
    if (d.kind === 'unsure') return { kind: 'unsure', candidates: d.candidates.map((c) => ({ target: targetOf(c.key), score: c.score })) };
    return { kind: 'none' };
  }

  /**
   * One look at a source, without the steady-frames rule: the best entries with their scores, the score each needs,
   * and the matched view's angle. For crops (a region the visitor points at, a bust's face) and for a running label.
   * `crop` is the share of a video's shorter side taken from its centre; canvases are used whole.
   */
  async look(source: HTMLVideoElement | HTMLCanvasElement, crop = 0.8) {
    await this.prepare();
    const query = await this.embedder!.embed(source, crop);
    if (!query) return [];
    return rank(query, this.entries)
      .slice(0, 3)
      .map((c) => ({ target: targetOf(c.key), key: c.key, score: c.score, angle: c.angle ?? null, threshold: this.entries.find((e) => e.key === c.key)?.threshold ?? 0.76 }));
  }

  reset() {
    this.decider?.reset();
  }

  async dispose() {
    this.decider = null;
    this.ready = null;
    await this.embedder?.dispose();
    this.embedder = null;
  }
}
