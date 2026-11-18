import React, { useEffect, useRef, useState } from 'react';
import { Hand, Pin, Sparkles, Volume2, X } from 'lucide-react';
import { loadSettings } from '../../character/liveVoice';
import { AskAnswer, askAboutFrame } from '../../scan/askGemini';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../../data/alqamiArtifacts';
import { getCustomScannedObjects } from '../../utils/alqamiRdfStore';
import { assetUrl } from '../../utils/assetUrl';
import { answer, factsFromArtifact } from '../../voice/persona';
import { speak } from '../../voice/speak';
import { listEnrolled } from '../../recognize/localEnrol';
import { ModelOverlay } from '../three/ModelOverlay';
import { HologramAR, HologramPin, pinsFor } from './HologramAR';
import { PagePins } from '../../pin/PagePins';
import { useMoonRecord } from '../../moon/useMoon';
import { SightRecognizer, SightTarget } from '../../recognize/recognizer';
import { HandGestures, HandGesture } from '../../scan/handGestures';
import { SIDE_NAMES, sideNotes, sideOf } from '../../scan/sides';
import { Direction, WorldPin } from '../../scan/worldPin';
import { FlowTracker } from '../../scan/flowTracker';
import { LabelLayout } from '../../scan/labelLayout';

import { Glyph, isGlyph } from '../shell/Glyph';
/**
 * Scan mode in a gallery: every catalogued object or statue in view gets its record floating on it.
 *  - recognition by sight from any side (the index holds renders of every 3D object from all around): the centre of
 *    the view, a sweep over six overlapping squares of the view (so several statues are found at once), the region
 *    the visitor points at, and a bust's face when one is in view;
 *  - each recognised object gets a tag pinned where it stands; tags stay on their objects as the phone turns
 *    (gyroscope). Tapping a tag opens its card: what it is, who made it, when, material, where it is kept, which side
 *    is in view, and the cataloguer's notes for that side ("AR 180°: …" notes in Moon);
 *  - hands: point to choose, pinch to open the record, open palm to fold the card.
 *
 * Wrong records are avoided: a match needs a clear score (above the entry's threshold and 0.06 ahead of the
 * runner-up), confirmed on a second look (3 looks in a row in the centre); when unsure, candidates are offered.
 */

export interface StatueARProps {
  video: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onOpen: (target: SightTarget) => void;
  onCandidates: (candidates: SightTarget[]) => void;
  /** `reason` says why sight is off (shown to the visitor, so a failure on a phone can be reported). */
  onStatus: (status: 'loading' | 'ready' | 'off', reason?: string) => void;
  /**
   * Simple mode (phones): no tool buttons; when one object is found, its record opens on it by itself (its card
   * floats on the object with a line to it); several objects each get a label. `hint` shows until something is found.
   */
  simple?: boolean;
  hint?: string;
}

interface Tag {
  key: string;
  target: SightTarget;
  angle: number | null;
  direction: Direction;
  seen: number;
}

type Spot = { x: number; y: number; side: number };

const MARGIN = 0.06;
const STEADY = 3;
const MAX_TAGS = 8;
// Six overlapping squares over the view (as shares of the video frame); half the shorter side each.
const SWEEP: Spot[] = [
  { x: 0.3, y: 0.3, side: 0.55 },
  { x: 0.7, y: 0.3, side: 0.55 },
  { x: 0.3, y: 0.55, side: 0.55 },
  { x: 0.7, y: 0.55, side: 0.55 },
  { x: 0.3, y: 0.78, side: 0.55 },
  { x: 0.7, y: 0.78, side: 0.55 },
];

export const StatueAR: React.FC<StatueARProps> = ({ video, active, onOpen, onCandidates, onStatus, simple = false, hint }) => {
  const box = useRef<HTMLDivElement>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const tagsRef = useRef<Tag[]>([]);
  tagsRef.current = tags;
  const [open, setOpen] = useState<string | null>(null);
  // Simple mode: records the visitor closed do not open by themselves again.
  const closed = useRef(new Set<string>());
  const openRef = useRef<string | null>(null);
  openRef.current = open;
  const [, setFrame] = useState(0);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [gyroOn, setGyroOn] = useState(false);
  const [handsOn, setHandsOn] = useState(false);
  const [toast, setToast] = useState('');
  const [ask, setAsk] = useState<{ state: 'busy' } | { state: 'done'; answer: AskAnswer } | { state: 'error' } | null>(null);

  const askAI = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setAsk({ state: 'busy' });
    try {
      setAsk({ state: 'done', answer: await askAboutFrame(v, loadSettings().geminiKey) });
    } catch {
      setAsk({ state: 'error' });
    }
  };
  const pin = useRef(new WorldPin());
  // Follows each recognised object in the picture while the visitor walks (optical flow); the gyroscope pin is the
  // fallback when the object is lost, until the next recognition re-seeds it.
  const tracker = useRef(new FlowTracker());
  const layout = useRef(new LabelLayout());
  // The room direction of the screen's centre at the last tracked frame (for the gyroscope's head start).
  const lastCentre = useRef<Direction | null>(null);
  const hands = useRef<HandGestures | null>(null);
  const pointRequest = useRef<{ x: number; y: number } | null>(null);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? '' : t)), 1800);
  };

  // Video coordinates (0..1 of the frame) → this box's pixels, for a video shown with object-fit: cover.
  const videoToBox = (nx: number, ny: number) => {
    const v = video.current;
    const el = box.current;
    const W = el?.clientWidth ?? 0;
    const H = el?.clientHeight ?? 0;
    if (!v || !v.videoWidth) return { x: nx * W, y: ny * H };
    const s = Math.max(W / v.videoWidth, H / v.videoHeight);
    return { x: nx * v.videoWidth * s - (v.videoWidth * s - W) / 2, y: ny * v.videoHeight * s - (v.videoHeight * s - H) / 2 };
  };

  const pinTag = (key: string, target: SightTarget, angle: number | null, at: Spot, force = false) => {
    const el = box.current;
    const v = video.current;
    if (!el) return;
    // Already followed in the picture: keep the tracked position (more exact than the looked-at square); only the
    // side in view and the time it was last seen change.
    if (!force && tracker.current.box(key)) {
      setTags((prev) => prev.map((t) => (t.key === key ? { ...t, angle: angle ?? t.angle, seen: Date.now() } : t)));
      return;
    }
    const p = videoToBox(at.x, at.y);
    // Follow the middle of what was looked at (the object, less the background around it).
    if (v?.videoWidth) {
      const half = (Math.min(v.videoWidth, v.videoHeight) * at.side * 0.32);
      tracker.current.seed(key, v, { x: at.x, y: at.y, hw: half / v.videoWidth, hh: half / v.videoHeight });
    }
    const direction = pin.current.directionAt(p.x / el.clientWidth, p.y / el.clientHeight, el.clientWidth, el.clientHeight);
    setTags((prev) => {
      const others = prev.filter((t) => t.key !== key);
      const old = prev.find((t) => t.key === key);
      return [...others, { key, target, angle: angle ?? old?.angle ?? null, direction, seen: Date.now() }]
        .sort((a, b) => b.seen - a.seen)
        .slice(0, MAX_TAGS);
    });
  };

  // Recognition loop: centre, then one square of the sweep, then centre again…
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer = 0;
    const recognizer = new SightRecognizer();
    let streak: { key: string; count: number } | null = null;
    const cellHits = new Map<number, string>();
    const crop = document.createElement('canvas');
    let faceDetector: import('@mediapipe/tasks-vision').FaceDetector | null = null;
    let tick = 0;
    let cell = 0;

    let errors = 0;
    const why = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 90);
    onStatus('loading');
    // Faces of busts and portraits (never of visitors: nothing is stored, nobody is identified). Loaded only after
    // the sight model is ready, so the two downloads do not compete on a phone; if it fails, only faces are skipped.
    const loadFaces = () =>
      import('@mediapipe/tasks-vision')
      .then(async (vision) => {
        const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm');
        faceDetector = await vision.FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.6,
        });
      })
      .catch((e) => console.warn('Bust faces off:', e));
    recognizer.prepare().then(
      () => {
        if (disposed) return;
        onStatus('ready');
        void loadFaces();
      },
      (e) => {
        console.warn('Recognition by sight unavailable:', e);
        if (!disposed) onStatus('off', why(e));
      }
    );

    // A square crop of the video around a point (0..1); `side` is a share of the shorter side.
    const cropAt = (v: HTMLVideoElement, s: Spot) => {
      const side = Math.min(v.videoWidth, v.videoHeight) * s.side;
      crop.width = crop.height = 224;
      const x = Math.max(0, Math.min(v.videoWidth - side, s.x * v.videoWidth - side / 2));
      const y = Math.max(0, Math.min(v.videoHeight - side, s.y * v.videoHeight - side / 2));
      crop.getContext('2d')!.drawImage(v, x, y, side, side, 0, 0, 224, 224);
      return crop;
    };

    const loop = async () => {
      const v = video.current;
      if (disposed) return;
      try {
        if (v && v.readyState >= 2 && v.videoWidth) {
          tick++;
          // What to look at: where the visitor points; else the centre and a sweep square in turn; now and then a
          // bust's face.
          let kind: 'point' | 'centre' | 'sweep' | 'face' = tick % 2 ? 'centre' : 'sweep';
          let spot: Spot = { x: 0.5, y: 0.5, side: 0.8 };
          const req = pointRequest.current;
          pointRequest.current = null;
          if (req) {
            kind = 'point';
            spot = { ...req, side: 0.45 };
          } else if (faceDetector && tick % 5 === 0) {
            let face;
            try {
              face = faceDetector.detect(v).detections[0]?.boundingBox;
            } catch (e) {
              console.warn('Bust faces off:', e);
              faceDetector = null;
            }
            if (face) {
              kind = 'face';
              spot = {
                x: (face.originX + face.width / 2) / v.videoWidth,
                y: (face.originY + face.height * 0.9) / v.videoHeight,
                side: Math.min(0.95, (face.width * 3.2) / Math.min(v.videoWidth, v.videoHeight)),
              };
            }
          } else if (kind === 'sweep') {
            cell = (cell + 1) % SWEEP.length;
            spot = SWEEP[cell];
          }
          const ranked = kind === 'centre' ? await recognizer.look(v) : await recognizer.look(cropAt(v, spot));
          if (disposed) return;
          const [best, second] = ranked;
          const clear = Boolean(best) && best.score >= best.threshold && best.score - (second?.score ?? 0) >= MARGIN;

          if (kind === 'centre') {
            streak = clear ? (streak?.key === best.key ? { key: best.key, count: streak.count + 1 } : { key: best.key, count: 1 }) : null;
            if (streak && streak.count >= STEADY) pinTag(best.key, best.target, best.angle, spot);
            if (!clear && !tagsRef.current.length) onCandidates(ranked.filter((c) => c.score >= 0.6).map((c) => c.target));
          } else if (kind === 'sweep') {
            // A square counts when the same object is found there on two visits in a row.
            if (clear && cellHits.get(cell) === best.key) pinTag(best.key, best.target, best.angle, spot);
            if (clear) cellHits.set(cell, best.key);
            else cellHits.delete(cell);
          } else if (clear) {
            // The visitor pointed here, or a bust's face: a clear answer counts at once.
            pinTag(best.key, best.target, best.angle, spot, kind === 'point');
            if (kind === 'point') setOpen(best.key);
          } else if (kind === 'point') flash('؟');
          if (tagsRef.current.length) onCandidates([]);
          if (errors) onStatus('ready');
          errors = 0;
        }
      } catch (e) {
        // One bad frame (or a slow phone) is not the end: try again; give up only after several failures in a row.
        console.warn('Sight look failed:', e);
        if (++errors >= 6) {
          if (!disposed) onStatus('off', why(e));
          return;
        }
      }
      if (!disposed) timer = window.setTimeout(loop, errors ? 1000 : 200);
    };
    void loop();

    // Motion access: works at once on Android and desktop; iPhone asks on the pin button.
    void pin.current.start().then((ok) => !disposed && setGyroOn(ok));

    const onPinRequest = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const key = `artifact:${id}`;
      const target: SightTarget = { kind: 'artifact', id };
      pinTag(key, target, 0, { x: 0.5, y: 0.52, side: 0.6 }, true);
      setOpen(key);
    };
    window.addEventListener('alqami:pin-sight', onPinRequest);

    return () => {
      disposed = true;
      window.removeEventListener('alqami:pin-sight', onPinRequest);
      window.clearTimeout(timer);
      pin.current.stop();
      tracker.current.clear();
      faceDetector?.close();
      void recognizer.dispose();
      setTags([]);
      setOpen(null);
      onCandidates([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Redraw every frame (tags follow the gyroscope) and read the hands.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    // How far the picture moved since the last frame by the gyroscope (fractions of the video's width and height):
    // where the last frame's centre is on screen now, in video terms. Null without a gyroscope.
    const gyroShift = (v: HTMLVideoElement): { x: number; y: number } | undefined => {
      const el = box.current;
      if (!el || !pin.current.tracking || !v.videoWidth) return undefined;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const prev = lastCentre.current;
      lastCentre.current = pin.current.directionAt(0.5, 0.5, W, H);
      if (!prev) return undefined;
      const p = pin.current.project(prev, W, H);
      if (!p) return undefined;
      const s = Math.max(W / v.videoWidth, H / v.videoHeight);
      const x = (p.x - W / 2) / (v.videoWidth * s);
      const y = (p.y - H / 2) / (v.videoHeight * s);
      return Math.abs(x) < 0.4 && Math.abs(y) < 0.4 ? { x, y } : undefined;
    };
    const frame = () => {
      const v = video.current;
      if (tagsRef.current.length) {
        if (v) tracker.current.update(v, gyroShift(v));
        // Keep each tag's room direction current from the tracker, so the gyroscope takes over from the latest spot.
        const el = box.current;
        if (el)
          for (const t of tagsRef.current) {
            const b = tracker.current.box(t.key);
            if (!b) continue;
            const p = videoToBox(b.x, b.y);
            t.direction = pin.current.directionAt(p.x / el.clientWidth, p.y / el.clientHeight, el.clientWidth, el.clientHeight);
          }
        setFrame((n) => n + 1);
      }
      if (hands.current && v) {
        hands.current.update(v);
        setPointer(hands.current.pointer ? videoToBox(hands.current.pointer.x, hands.current.pointer.y) : null);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onGesture = (g: HandGesture) => {
    if (g.kind === 'point') {
      pointRequest.current = { x: g.x, y: g.y };
      flash('👉');
    } else if (g.kind === 'pinch') {
      const key = openRef.current ?? tagsRef.current[0]?.key;
      const tag = tagsRef.current.find((t) => t.key === key);
      if (tag) {
        flash('🤏');
        onOpen(tag.target);
      }
    } else if (g.kind === 'palm' && openRef.current) {
      flash('✋');
      setOpen(null);
    } else if (g.kind === 'thumbs-up') flash('👍');
  };

  const toggleHands = async () => {
    if (handsOn) {
      hands.current?.dispose();
      hands.current = null;
      setHandsOn(false);
      setPointer(null);
      return;
    }
    const h = new HandGestures(onGesture);
    setHandsOn(true);
    try {
      await h.init();
      hands.current = h;
    } catch {
      setHandsOn(false);
      flash('—');
    }
  };

  if (!active) return null;
  const el = box.current;
  const W = el?.clientWidth ?? 0;
  const H = el?.clientHeight ?? 0;
  const placed = tags.map((t) => {
    const b = tracker.current.box(t.key);
    if (b && W) {
      const p = videoToBox(b.x, b.y);
      return { tag: t, at: { x: p.x, y: p.y, onScreen: p.x >= -20 && p.x <= W + 20 && p.y >= -20 && p.y <= H + 20 } };
    }
    return { tag: t, at: W ? pin.current.project(t.direction, W, H) : null };
  });
  const offScreen = placed.filter((p) => !p.at || !p.at.onScreen).length;
  // Simple mode: the only object in view shows its record on it without a tap.
  const inView = placed.filter((p) => p.at?.onScreen);
  const shown = open ?? (simple && inView.length === 1 && !closed.current.has(inView[0].tag.key) ? inView[0].tag.key : null);
  const close = (key: string) => {
    closed.current.add(key);
    setOpen(null);
  };
  // Labels of the tags (not the open card) spread so none covers another.
  const labels = layout.current.place(
    placed.filter((p) => p.at?.onScreen && p.tag.key !== shown).map((p) => ({ key: p.tag.key, x: p.at!.x, y: p.at!.y })),
    W,
    H
  );

  return (
    <div ref={box} className="absolute inset-0 pointer-events-none">
      {placed.map(({ tag, at }) =>
        at && at.onScreen ? (
          tag.key === shown ? (
            <PinnedRecord key={tag.key} target={tag.target} angle={tag.angle} at={at} box={box} video={video} onOpen={() => onOpen(tag.target)} onClose={() => close(tag.key)} />
          ) : (
            <TagChip key={tag.key} target={tag.target} angle={tag.angle} at={at} label={labels.get(tag.key) ?? { x: at.x, y: at.y - 46 }} onTap={() => setOpen(tag.key)} />
          )
        ) : null
      )}
      {offScreen > 0 && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+68px)] inset-x-0 flex justify-center">
          <span className="px-3 py-1 rounded-full bg-black/60 text-white text-[11px]">
            {offScreen} خارج الإطار · {offScreen} out of view
          </span>
        </div>
      )}
      {simple && hint && !inView.length && (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+28px)] inset-x-0 flex justify-center">
          <span className="px-4 py-2 rounded-full bg-black/55 backdrop-blur-md text-white/90 text-[12.5px]">{hint}</span>
        </div>
      )}
      {pointer && <span className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-[#FFD60A] bg-[#FFD60A]/30" style={{ left: pointer.x, top: pointer.y }} />}
      {toast && <span className="absolute top-1/3 inset-x-0 text-center text-4xl">{isGlyph(toast) ? <Glyph e={toast} className="inline-block w-12 h-12 text-white" /> : toast}</span>}

      <div className={`absolute top-[calc(env(safe-area-inset-top)+104px)] end-3 flex-col items-end gap-2 pointer-events-auto ${simple ? 'hidden' : 'flex'}`}>
        <button
          onClick={askAI}
          disabled={ask?.state === 'busy'}
          className="w-11 h-11 rounded-full border flex items-center justify-center shadow-lg backdrop-blur-md active:scale-95 bg-black/55 border-white/25 text-white disabled:opacity-60"
          title="ما هذا؟ · What is this? (AI)"
          aria-label="What is this?"
        >
          <Sparkles className={`w-5 h-5 ${ask?.state === 'busy' ? 'animate-pulse text-violet-200' : ''}`} />
        </button>
        {!gyroOn && (
          <button
            onClick={async () => setGyroOn(await pin.current.start())}
            className="w-11 h-11 rounded-full border flex items-center justify-center shadow-lg backdrop-blur-md active:scale-95 bg-black/55 border-white/25 text-white"
            title="ثبّت البطاقات · Keep labels on the objects as the phone turns"
            aria-label="Pin labels"
          >
            <Pin className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={toggleHands}
          aria-pressed={handsOn}
          className={`w-11 h-11 rounded-full border flex items-center justify-center shadow-lg backdrop-blur-md active:scale-95 ${handsOn ? 'bg-[#FFD60A] text-black border-[#FFD60A]' : 'bg-black/55 text-white border-white/25'}`}
          title="بيدك · Use hands"
          aria-label="Use hands"
        >
          <Hand className="w-5 h-5" />
        </button>
      </div>
      {ask && ask.state !== 'busy' && (
        <div dir="rtl" className="absolute top-[calc(env(safe-area-inset-top)+68px)] inset-x-3 z-40 pointer-events-auto rounded-2xl bg-black/75 backdrop-blur-md border border-violet-300/40 text-white p-3 shadow-2xl">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[10.5px] text-violet-200">
              <Glyph e="✨" /> تخمين الذكاء الاصطناعي، ليس من الفهرس · AI guess, not from the catalogue ·{' '}
              <a href="privacy.html" className="underline">
                الخصوصية · Privacy
              </a>
            </p>
            <button onClick={() => setAsk(null)} aria-label="Close" className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {ask.state === 'error' ? (
            <p className="mt-1 text-[12.5px]">تعذّر السؤال الآن · Could not ask right now</p>
          ) : (
            <>
              <p className="mt-1 text-[14px] font-semibold">{ask.answer.name}</p>
              {(ask.answer.period || ask.answer.culture) && <p className="text-[11.5px] text-white/70">{[ask.answer.period, ask.answer.culture].filter(Boolean).join(' · ')}</p>}
              <p className="mt-1 text-[12px] text-white/85 leading-relaxed">{ask.answer.description}</p>
              {ask.answer.records.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10.5px] text-white/60">ربما في الفهرس · Maybe in the catalogue</p>
                  {ask.answer.records.map((r) => (
                    <button key={r.id} dir="auto" onClick={() => onOpen({ kind: 'moon', recordId: r.id })} className="block w-full text-start truncate px-3 py-1.5 rounded-full bg-white/12 border border-white/20 text-[12px]">
                      {r.title}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {handsOn && (
        <p className="absolute bottom-[calc(env(safe-area-inset-bottom)+150px)] inset-x-3 text-center text-[10.5px] text-white/80 bg-black/45 rounded-xl px-2.5 py-1.5">
          أشر إلى قطعة لتختارها، اقرص لفتح سجلّها، افتح كفّك لطيّ البطاقة · Point to choose, pinch to open, open palm to fold
        </p>
      )}
    </div>
  );
};

function findArtifactByTargetId(rawId: string): AlqamiArtifact | undefined {
  const needle = rawId.toLowerCase();
  const sid = needle.replace(/^(?:alkafeel:|alkafeel__|kfl-[a-z]+-|kfl-)/i, '');
  return ALQAMI_ARTIFACTS.find(
    (a) =>
      a.id.toLowerCase() === needle ||
      a.itemCode.toLowerCase() === needle ||
      a.slug.toLowerCase() === needle ||
      (sid && /^\d+$/.test(sid) && a.id.toLowerCase().endsWith(`-${sid}`))
  );
}

/** What the tags and cards say about an object: from its Moon record, else the built-in object's details. */
function useObjectFacts(target: SightTarget) {
  const artifact = target.kind === 'artifact' ? findArtifactByTargetId(target.id) : undefined;
  const moonId = target.kind === 'moon' ? target.recordId : artifact?.moonRecordId;
  const moon = useMoonRecord(moonId, 'ar');
  const card = moon?.state === 'ready' ? moon.data : null;
  // A record the visitor added in the scanner ("Add record"), kept on this device.
  const own = target.kind === 'artifact' && !artifact ? getCustomScannedObjects().find((o) => o.id === target.id)?.metadata : undefined;
  return {
    artifact,
    card,
    title: card?.title ?? artifact?.title.ar ?? own?.titleAr ?? (target.kind === 'moon' ? target.recordId : target.id),
    subtitle: artifact?.subtitle?.ar ?? artifact?.categoryLabel?.ar,
    image: artifact?.image,
    maker: card?.contributors.map((c) => c.label).join('، ') || artifact?.creator?.ar || own?.creatorAr,
    date: card?.date ?? artifact?.period?.ar ?? own?.date,
    material: card?.notes.find((n) => /material|مادة|حجر|برونز|خزف|ورق|stone|bronze|clay|ceramic/i.test(n)) ?? artifact?.details.material?.ar ?? own?.materialsAr,
    holder: card?.holder ?? artifact?.institution?.ar ?? (own ? own.publisherAr : undefined),
    dimensions: artifact?.details.dimensions || own?.dimensions,
    text: artifact?.description?.ar || own?.transcriptionAr,
    front: artifact?.model.initialOrbit?.theta ?? 0,
  };
}

/** A small tag floating on an object: its name and the side in view. */
const TagChip: React.FC<{ target: SightTarget; angle: number | null; at: { x: number; y: number }; label: { x: number; y: number }; onTap: () => void }> = ({
  target,
  angle,
  at,
  label,
  onTap,
}) => {
  const f = useObjectFacts(target);
  const side = angle != null ? sideOf(angle, f.front) : null;
  return (
    <>
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        <line x1={at.x} y1={at.y} x2={label.x} y2={label.y} stroke="#FFD60A" strokeWidth="1.5" />
        <circle cx={at.x} cy={at.y} r="5" fill="#FFD60A" stroke="white" strokeWidth="2" />
      </svg>
      <button
        dir="rtl"
        onClick={onTap}
        className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full max-w-[220px] rounded-xl bg-black/75 backdrop-blur-md border border-[#FFD60A]/60 px-2.5 py-1.5 text-start text-white shadow-xl flex items-center gap-2"
        style={{ left: label.x, top: label.y }}
      >
        {f.image && <img src={assetUrl(f.image)} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/20" />}
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold leading-tight truncate">{f.title}</span>
          <span className="block text-[10px] text-amber-300/90 truncate">
            {[f.subtitle || f.date, side ? `${SIDE_NAMES[side].ar}` : null].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    </>
  );
};

/** The open card beside the object: a short record above a leader line that ends on the object. */
const PinnedRecord: React.FC<{
  target: SightTarget;
  angle: number | null;
  at: { x: number; y: number };
  box: React.RefObject<HTMLDivElement | null>;
  video: React.RefObject<HTMLVideoElement | null>;
  onOpen: () => void;
  onClose: () => void;
}> = ({ target, angle, at, box, video, onOpen, onClose }) => {
  const f = useObjectFacts(target);
  // The object's own 3D scan (taught from a GLB), else its catalogue model: shown in 3D and AR.
  const [mesh, setMesh] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(false);
  const key = target.kind === 'moon' ? `moon:${target.recordId}` : `artifact:${f.artifact?.id ?? target.id}`;
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    void listEnrolled().then((all) => {
      if (!live) return;
      const own = all.find((o) => o.key === key)?.mesh;
      if (own) {
        url = URL.createObjectURL(own);
        setMesh(url);
        return;
      }
      const glb = f.artifact?.model.glb;
      if (glb) setMesh(new URL(glb.replace(/^\//, ''), new URL(import.meta.env.BASE_URL || './', location.href)).href);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, f.artifact]);
  const side = angle != null ? sideOf(angle, f.front) : null;
  const notes = angle != null && f.card ? sideNotes(f.card.notes, angle, f.front) : [];
  // A 3D object's hologram beside it (alqami3's scan mode): its model, turned to the side in view, with its parts
  // pinned. Not for leaves and open books (flat), whose record card is enough.
  const builtIn = f.artifact;
  const [pins, setPins] = useState<HologramPin[]>([]);
  useEffect(() => {
    if (builtIn) void pinsFor(builtIn.id).then(setPins);
  }, [builtIn]);
  // A page with pins: the page is followed and its parts pinned; the record card folds to its title meanwhile.
  const pagePins = builtIn?.pagePins;
  const [onPage, setOnPage] = useState(false);
  const hologram = mesh && !builtIn?.model.flat && !pagePins;

  const W = box.current?.clientWidth ?? 360;
  const cardW = Math.min(280, W - 24);
  const left = Math.max(12, Math.min(W - cardW - 12, at.x - cardW / 2));
  // While a page is pinned, the card folds to its title at the top, out of the page's way.
  const top = onPage ? 64 : Math.max(12, at.y - 220);

  const speakDescription = () => {
    const handlers = { onSentence: () => {}, onEnd: () => {} };
    if (builtIn) {
      const facts = factsFromArtifact(builtIn, 'ar');
      speak([...answer(facts, 'intro', 'ar'), ...answer(facts, 'story', 'ar')], 'ar', handlers, builtIn.model.glb);
    } else if (f.text || f.title) {
      speak([f.title, f.text || ''].filter(Boolean), 'ar', handlers);
    }
  };

  return (
    <>
      {hologram && !show3d && <HologramAR model={mesh} at={at} angle={angle} pins={pins} />}
      {pagePins && builtIn && !show3d && <PagePins markerKey={`artifact:${builtIn.id}`} pins={pagePins} video={video.current} onTracking={setOnPage} />}
      <svg className={`absolute inset-0 w-full h-full overflow-visible ${onPage ? 'hidden' : ''}`}>
        <line x1={at.x} y1={at.y} x2={Math.max(left + 16, Math.min(left + cardW - 16, at.x))} y2={top + 140} stroke="#FFD60A" strokeWidth="1.8" />
        <circle cx={at.x} cy={at.y} r="6" fill="#FFD60A" stroke="white" strokeWidth="2" />
      </svg>
      <div dir="rtl" className="absolute pointer-events-auto rounded-2xl bg-black/80 backdrop-blur-xl border border-[#FFD60A]/50 text-white p-3 shadow-2xl" style={{ left, top, width: cardW }}>
        <div className="flex items-start gap-2.5">
          {f.image && <img src={assetUrl(f.image)} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white/20" />}
          <button onClick={onOpen} className="flex-1 min-w-0 text-start">
            <p className="text-[13.5px] font-bold leading-snug">{f.title}</p>
            {f.subtitle && <p className="text-[10.5px] text-[#FFD60A] truncate">{f.subtitle}</p>}
            {f.maker && <p className="text-[11px] text-white/70 truncate">{f.maker}</p>}
          </button>
          <button onClick={speakDescription} title="استمع لوصف القطعة · Listen in Arabic" aria-label="Listen" className="w-7 h-7 rounded-full bg-[#FFD60A]/20 border border-[#FFD60A]/50 text-[#FFD60A] flex items-center justify-center shrink-0">
            <Volume2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} aria-label="Close" className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className={`mt-2 space-y-0.5 text-[11px] text-white/85 ${onPage ? 'hidden' : ''}`}>
          {f.date && <p><Glyph e="📅" /> {f.date}</p>}
          {f.material && <p className="truncate"><Glyph e="🪨" /> {f.material}</p>}
          {f.dimensions && <p className="truncate"><Glyph e="📏" /> {f.dimensions}</p>}
          {f.holder && <p className="truncate"><Glyph e="🏛" /> {f.holder}</p>}
          {f.text && <p className="line-clamp-3 text-white/90 pt-0.5 leading-relaxed"><Glyph e="✎" /> {f.text}</p>}
          {side && (
            <p className="text-[#FFD60A]">
              <Glyph e="👁" /> تنظر إلى {SIDE_NAMES[side].ar} · {SIDE_NAMES[side].en}
            </p>
          )}
          {notes.map((n) => (
            <p key={n} className="text-white">
              ✦ {n}
            </p>
          ))}
        </div>
        <div className="mt-2.5 flex gap-1.5">
          <button onClick={onOpen} className="flex-1 h-8 rounded-full bg-[#FFD60A] text-black text-[11.5px] font-semibold">
            السجلّ الكامل · Full record
          </button>
          <button onClick={speakDescription} className="h-8 px-2.5 rounded-full bg-white/15 border border-white/25 text-[11.5px] font-semibold flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5 text-[#FFD60A]" />
            <span>صوت</span>
          </button>
          {mesh && (
            <button onClick={() => setShow3d(true)} className="h-8 px-2.5 rounded-full bg-white/15 border border-white/25 text-[11.5px] font-semibold">
              3D / AR
            </button>
          )}
        </div>
        {show3d && mesh && <ModelOverlay model={mesh} title={f.title} onClose={() => setShow3d(false)} />}
      </div>
    </>
  );
};
