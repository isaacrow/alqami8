/**
 * Lip sync from the voice itself: HeadAudio (MIT, met4citizen/HeadAudio, vendored in public/vendor/headaudio, 34 kB)
 * listens to the audio that plays and recognises mouth shapes (15 Oculus visemes) in real time, in the browser.
 * Each is turned into a full mouth shape for the bust's face rig: how open the jaw is, how spread (ee, s) or round
 * (oo, o) the lips are, whether the upper teeth show, the lips press (m, b, p), the lower lip tucks under the teeth
 * (f, v) or the tongue rises (t, d, n, l, th), and the shapes are blended by how strongly each is heard. Its model
 * was trained on English speech; Arabic sounds map onto the same shapes (ب م → PP, ف → FF, ث ذ ظ → TH, ت د ط ض ن ل →
 * DD/nn, س ص ز → SS, ش ج → CH, و ُ → U/O, ي ِ → I, ا َ → aa).
 */
import type { MouthShape } from './bustRig';
type HeadAudioNode = AudioNode & {
  loadModel(url: string): Promise<void>;
  update(dtMs: number): void;
  onvalue: ((key: string, value: number) => void) | null;
};

// Per viseme: [jaw, wide (-1 round .. 1 spread), round, upper teeth, press, tuck, tongue].
type Shape = [number, number, number, number, number, number, number];
const SHAPES: Record<string, Shape> = {
  viseme_aa: [1.0, 0.25, 0, 0.35, 0, 0, 0],
  viseme_E: [0.55, 0.6, 0, 0.3, 0, 0, 0.1],
  viseme_I: [0.3, 0.95, 0, 0.35, 0, 0, 0.2],
  viseme_O: [0.65, -0.4, 0.75, 0.1, 0, 0, 0],
  viseme_U: [0.3, -0.6, 1.0, 0, 0, 0, 0],
  viseme_PP: [0.0, 0.0, 0, 0, 1.0, 0, 0],
  viseme_SS: [0.15, 0.7, 0, 0.6, 0, 0, 0.3],
  viseme_TH: [0.25, 0.3, 0, 0.4, 0, 0, 1.0],
  viseme_DD: [0.3, 0.25, 0, 0.3, 0, 0, 0.8],
  viseme_FF: [0.12, 0.3, 0, 0.5, 0, 1.0, 0],
  viseme_kk: [0.35, 0.1, 0, 0.2, 0, 0, 0.2],
  viseme_nn: [0.25, 0.15, 0, 0.25, 0, 0, 0.7],
  viseme_RR: [0.3, -0.2, 0.45, 0.2, 0, 0, 0.4],
  viseme_CH: [0.25, 0.1, 0.55, 0.45, 0, 0, 0.3],
  viseme_sil: [0.0, 0.0, 0, 0, 0, 0, 0],
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

  /** Call every frame: the mouth shape now. */
  update(dtMs: number): MouthShape & { speaking: boolean } {
    this.node.update(dtMs);
    let total = 0;
    const acc = [0, 0, 0, 0, 0, 0, 0];
    for (const [k, v] of Object.entries(this.values)) {
      const s = SHAPES[k];
      if (!s || v <= 0) continue;
      total += v;
      for (let i = 0; i < 7; i++) acc[i] += s[i] * v;
    }
    const sil = this.values.viseme_sil ?? 0;
    if (!total) return { jaw: 0, wide: 0, speaking: false };
    // Each viseme peaks at about 0.65 (HeadAudio's visemeMaxs): divide by it for the full range. The jaw scales with
    // how strongly the sounds are heard; the shape channels are a weighted mean of the shapes heard.
    const strength = Math.min(1, total / 0.65);
    const mean = (i: number) => (acc[i] / total) * strength;
    const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
    return {
      jaw: clamp(acc[0] / 0.5),
      wide: clamp((acc[1] / total) * 1.3, -1, 1) * Math.sqrt(strength),
      round: clamp(mean(2)),
      upper: clamp(mean(3)),
      // A press or a tuck must win outright to show: a blend half-closes the lips, which reads as mumbling.
      press: clamp((mean(4) - 0.25) / 0.6),
      tuck: clamp((mean(5) - 0.25) / 0.6),
      tongue: clamp(mean(6)),
      speaking: total - sil > 0.05,
    };
  }

  dispose() {
    this.node.disconnect();
    this.node.onvalue = null;
  }
}
