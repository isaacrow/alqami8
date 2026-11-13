/**
 * Sees the visitor through the camera with MediaPipe (on the device, nothing is uploaded):
 *  - face (front camera): where the visitor's face is, so he looks at them;
 *  - hands (either camera): position, a pinch to turn him, an open-hand wave and a thumbs-up he reacts to.
 *
 * Coordinates are in screen space (0..1, left to right, top to bottom), already mirrored for the front camera.
 */
import type { FaceDetector, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type Gesture = 'wave' | 'thumbs-up';

export interface Seen {
  face: { x: number; y: number } | null;
  hand: { x: number; y: number } | null;
  /** While pinching: how far the pinch moved since the last frame (screen units). */
  pinchDelta: { x: number; y: number } | null;
}

let loading: Promise<{ face: FaceDetector; hands: HandLandmarker }> | null = null;

async function load() {
  const vision = await import('@mediapipe/tasks-vision');
  const files = await vision.FilesetResolver.forVisionTasks(WASM);
  const make = async (delegate: 'GPU' | 'CPU') => ({
    face: await vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 }),
    hands: await vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  });
  try {
    return await make('GPU');
  } catch {
    return make('CPU');
  }
}

export class VisitorTracker {
  private models: { face: FaceDetector; hands: HandLandmarker } | null = null;
  private frame = 0;
  private lastTs = 0;
  private seen: Seen = { face: null, hand: null, pinchDelta: null };
  private pinchAt: { x: number; y: number } | null = null;
  private waveXs: Array<{ x: number; t: number }> = [];
  private gestureCooldown: Record<Gesture, number> = { wave: 0, 'thumbs-up': 0 };
  private thumbFrames = 0;
  ready = false;

  constructor(private onGesture: (g: Gesture) => void) {}

  async init() {
    loading ??= load();
    this.models = await loading;
    this.ready = true;
  }

  /** Call once per animation frame with the camera video. Face and hands take turns, to keep the phone cool. */
  update(video: HTMLVideoElement, mirrored: boolean): Seen {
    if (!this.models || video.readyState < 2 || !video.videoWidth) return this.seen;
    const now = performance.now();
    if (now - this.lastTs < 33) return this.seen; // at most ~30 detections a second
    this.lastTs = now;
    const mx = (x: number) => (mirrored ? 1 - x : x);
    this.frame++;
    try {
      if (mirrored && this.frame % 2 === 0) {
        const res = this.models.face.detectForVideo(video, now);
        const box = res.detections[0]?.boundingBox;
        this.seen.face = box ? { x: mx((box.originX + box.width / 2) / video.videoWidth), y: (box.originY + box.height * 0.4) / video.videoHeight } : null;
      } else {
        const res = this.models.hands.detectForVideo(video, now);
        const lm = res.landmarks[0];
        if (lm) this.readHand(lm, mx, now);
        else {
          this.seen.hand = null;
          this.seen.pinchDelta = null;
          this.pinchAt = null;
          this.waveXs = [];
          this.thumbFrames = 0;
        }
      }
    } catch {
      /* a dropped frame */
    }
    return this.seen;
  }

  private readHand(lm: NormalizedLandmark[], mx: (x: number) => number, now: number) {
    const p = (i: number) => ({ x: mx(lm[i].x), y: lm[i].y });
    const d = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
    const size = d(0, 9) || 0.1; // wrist to middle knuckle
    const palm = p(9);
    this.seen.hand = palm;

    // Pinch: thumb tip touching index tip.
    const pinching = d(4, 8) < size * 0.35;
    const mid = { x: (mx(lm[4].x) + mx(lm[8].x)) / 2, y: (lm[4].y + lm[8].y) / 2 };
    this.seen.pinchDelta = pinching && this.pinchAt ? { x: mid.x - this.pinchAt.x, y: mid.y - this.pinchAt.y } : null;
    this.pinchAt = pinching ? mid : null;

    // Which fingers are straight: tip further from the wrist than its middle joint.
    const straight = (tip: number, pip: number) => d(0, tip) > d(0, pip) * 1.15;
    const fingers = [straight(8, 6), straight(12, 10), straight(16, 14), straight(20, 18)];
    const open = fingers.every(Boolean);

    // Wave: an open hand swinging side to side at least twice within a second and a half.
    if (open && !pinching) {
      this.waveXs.push({ x: palm.x, t: now });
      this.waveXs = this.waveXs.filter((s) => now - s.t < 1500);
      let turns = 0;
      for (let i = 2; i < this.waveXs.length; i++) {
        const a = this.waveXs[i - 1].x - this.waveXs[i - 2].x;
        const b = this.waveXs[i].x - this.waveXs[i - 1].x;
        if (a * b < 0 && Math.abs(b) > 0.012) turns++;
      }
      if (turns >= 2) this.fire('wave', now);
    } else this.waveXs = [];

    // Thumbs up: fist with the thumb pointing up, held for a moment.
    const thumbUp = !fingers.some(Boolean) && lm[4].y < lm[3].y && lm[4].y < lm[5].y - size * 0.3;
    this.thumbFrames = thumbUp ? this.thumbFrames + 1 : 0;
    if (this.thumbFrames > 6) this.fire('thumbs-up', now);
  }

  private fire(g: Gesture, now: number) {
    if (now < this.gestureCooldown[g]) return;
    this.gestureCooldown[g] = now + 8000;
    this.waveXs = [];
    this.thumbFrames = 0;
    this.onGesture(g);
  }
}
