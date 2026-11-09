import { Decider, Decision } from './decide';
import { EMBED_KEY, Embedder } from './embedder';
import { loadRecognitionIndex } from './recognitionIndex';

export type SightTarget = { kind: 'moon'; recordId: string } | { kind: 'artifact'; id: string };

export type SightResult =
  | { kind: 'match'; target: SightTarget; score: number }
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
  private embedder: Embedder;
  private decider: Decider | null = null;
  private ready: Promise<void> | null = null;

  constructor(device: 'wasm' | 'webgpu' = 'wasm') {
    this.embedder = new Embedder(device);
  }

  /** Loads the index and the model. Rejects when either is unavailable (no signal on first use, missing index). */
  prepare(): Promise<void> {
    this.ready ??= Promise.all([loadRecognitionIndex(EMBED_KEY), this.embedder.load()]).then(([{ entries }]) => {
      this.decider = new Decider(entries);
    });
    return this.ready;
  }

  async step(video: HTMLVideoElement): Promise<SightResult> {
    await this.prepare();
    const query = await this.embedder.embed(video);
    if (!query || !this.decider) return { kind: 'none' };
    const d: Decision = this.decider.next(query);
    if (d.kind === 'match') return { kind: 'match', target: targetOf(d.key), score: d.score };
    if (d.kind === 'unsure') return { kind: 'unsure', candidates: d.candidates.map((c) => ({ target: targetOf(c.key), score: c.score })) };
    return { kind: 'none' };
  }

  reset() {
    this.decider?.reset();
  }

  async dispose() {
    this.decider = null;
    this.ready = null;
    await this.embedder.dispose();
  }
}
