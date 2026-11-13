/**
 * Hand gestures in front of the back camera, with MediaPipe (on the device):
 *  - point (index finger up/out): choose the object the finger points at;
 *  - pinch (thumb and index together): open the record;
 *  - open palm, held: close the label;
 *  - thumbs up: "I like this" (e.g. save it).
 * Positions are 0..1 in the video frame.
 */
import type { GestureRecognizer, NormalizedLandmark } from '@mediapipe/tasks-vision';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export type HandGesture = { kind: 'point'; x: number; y: number } | { kind: 'pinch'; x: number; y: number } | { kind: 'palm' } | { kind: 'thumbs-up' };

let loading: Promise<GestureRecognizer> | null = null;
async function load(): Promise<GestureRecognizer> {
  const vision = await import('@mediapipe/tasks-vision');
  const files = await vision.FilesetResolver.forVisionTasks(WASM);
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.GestureRecognizer.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 1 });
  try {
    return await make('GPU');
  } catch {
    return make('CPU');
  }
}

export class HandGestures {
  private recognizer: GestureRecognizer | null = null;
  private last = 0;
  private held: { name: string; frames: number } = { name: '', frames: 0 };
  private cooldownUntil = 0;
  /** The fingertip while pointing (for drawing a pointer), else null. */
  pointer: { x: number; y: number } | null = null;

  constructor(private onGesture: (g: HandGesture) => void) {}

  async init() {
    loading ??= load();
    this.recognizer = await loading;
  }

  /** Call every animation frame; detection runs about 12 times a second to leave room for recognition. */
  update(video: HTMLVideoElement) {
    const now = performance.now();
    if (!this.recognizer || video.readyState < 2 || now - this.last < 80) return;
    this.last = now;
    let res;
    try {
      res = this.recognizer.recognizeForVideo(video, now);
    } catch {
      return;
    }
    const lm: NormalizedLandmark[] | undefined = res.landmarks[0];
    const name = res.gestures[0]?.[0]?.categoryName ?? 'None';
    if (!lm) {
      this.pointer = null;
      this.held = { name: '', frames: 0 };
      return;
    }
    const d = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
    const size = d(0, 9) || 0.1;
    const pinching = d(4, 8) < size * 0.33;
    const label = pinching ? 'Pinch' : name;
    this.held = this.held.name === label ? { name: label, frames: this.held.frames + 1 } : { name: label, frames: 1 };
    // Pointing: the tip of the index finger, pushed a little further along the finger so it lands on the object.
    const pointing = label === 'Pointing_Up' || (!pinching && d(0, 8) > d(0, 6) * 1.2 && d(0, 12) < d(0, 10) * 1.1);
    this.pointer = pointing ? { x: lm[8].x + (lm[8].x - lm[6].x) * 1.5, y: lm[8].y + (lm[8].y - lm[6].y) * 1.5 } : null;

    if (now < this.cooldownUntil) return;
    const fire = (g: HandGesture) => {
      this.cooldownUntil = now + 1200;
      this.held.frames = 0;
      this.onGesture(g);
    };
    if (label === 'Pinch' && this.held.frames >= 2) fire({ kind: 'pinch', x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 });
    else if (label === 'Open_Palm' && this.held.frames >= 6) fire({ kind: 'palm' });
    else if (label === 'Thumb_Up' && this.held.frames >= 6) fire({ kind: 'thumbs-up' });
    else if (this.pointer && this.held.frames >= 5) fire({ kind: 'point', ...this.pointer });
  }

  dispose() {
    // The recognizer is shared and kept: loading it again costs seconds.
    this.pointer = null;
  }
}
