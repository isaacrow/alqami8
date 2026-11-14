/**
 * Lip sync from the voice itself: HeadAudio (MIT, met4citizen/HeadAudio, vendored in public/vendor/headaudio, 34 kB)
 * listens to the audio that plays and recognises mouth shapes (15 Oculus visemes) in real time, in the browser.
 * They are turned into the two things the bust's face rig moves: how open the jaw is, and how wide (ee, s) or round
 * (oo, o) the lips are. Its model was trained on English speech; Arabic vowels map onto the same shapes.
 */
type HeadAudioNode = AudioNode & {
  loadModel(url: string): Promise<void>;
  update(dtMs: number): void;
  onvalue: ((key: string, value: number) => void) | null;
};

// Per viseme: [jaw 0..1, lips -1 round .. 1 wide].
const SHAPES: Record<string, [number, number]> = {
  viseme_aa: [1.0, 0.2],
  viseme_E: [0.55, 0.6],
  viseme_I: [0.3, 0.95],
  viseme_O: [0.65, -0.75],
  viseme_U: [0.3, -1.0],
  viseme_PP: [0.0, 0.0],
  viseme_SS: [0.18, 0.75],
  viseme_TH: [0.25, 0.3],
  viseme_DD: [0.3, 0.2],
  viseme_FF: [0.12, 0.3],
  viseme_kk: [0.35, 0.1],
  viseme_nn: [0.25, 0.15],
  viseme_RR: [0.3, -0.45],
  viseme_CH: [0.25, 0.4],
  viseme_sil: [0.0, 0.0],
};

export class LipSync {
  private values: Record<string, number> = {};
  private constructor(private node: HeadAudioNode) {
    node.onvalue = (key, value) => {
      this.values[key] = value;
    };
  }

  /** Listens to `source` (the voice as it plays). Rejects if the browser cannot run it; the face then uses loudness. */
  static async attach(ctx: AudioContext, source: AudioNode): Promise<LipSync> {
    const base = new URL(`${import.meta.env.BASE_URL || './'}vendor/headaudio/`, location.href).href;
    await ctx.audioWorklet.addModule(`${base}headworklet.min.js`);
    const { HeadAudio } = (await import(/* @vite-ignore */ `${base}headaudio.min.js`)) as {
      HeadAudio: new (ctx: AudioContext, o: object) => HeadAudioNode;
    };
    const node = new HeadAudio(ctx, {
      visemeMinMs: 70,
      visemeRampMs: 70,
      parameterData: {
        vadGateActiveDb: -45,
        vadGateInactiveDb: -58,
        // Use the trained silence prototypes (no calibration step); a man's voice.
        silMode: 0,
        speakerMeanHz: 120,
      },
    });
    await node.loadModel(`${base}model-en-mixed.bin`);
    source.connect(node);
    return new LipSync(node);
  }

  /** Call every frame: the jaw opening and lip shape now. */
  update(dtMs: number): { jaw: number; wide: number; speaking: boolean } {
    this.node.update(dtMs);
    let total = 0;
    let jaw = 0;
    let wide = 0;
    for (const [k, v] of Object.entries(this.values)) {
      const s = SHAPES[k];
      if (!s || v <= 0) continue;
      total += v;
      jaw += s[0] * v;
      wide += s[1] * v;
    }
    const sil = this.values.viseme_sil ?? 0;
    if (!total) return { jaw: 0, wide: 0, speaking: false };
    // Each viseme peaks at about 0.65 (HeadAudio's visemeMaxs): divide by it for the full range.
    const strength = Math.min(1, total / 0.65);
    return { jaw: Math.min(1, jaw / 0.65), wide: Math.max(-1, Math.min(1, wide / total)) * strength, speaking: total - sil > 0.05 };
  }

  dispose() {
    this.node.disconnect();
    this.node.onvalue = null;
  }
}
