import React, { useEffect, useRef, useState } from 'react';
import { CoverPose, CoverTracker } from './coverTracker';
import { homography } from '../scan/markerPose';

/**
 * Pins on the parts of a manuscript page, brought over from alqami3's scan mode (its "spatial hotspots"): once a page
 * is recognised, the page itself is followed in the camera (natural-feature tracking, the same tracker that pins Moon
 * cards to book covers) and glowing numbered pins sit on its headpiece, its seal, its text... as the phone moves.
 * Tap a pin to read about that part. Each pin is a point on the page from 0 to 1 (left to right, top to bottom) of
 * the scan the page's marker was made from (enrol/<key>/scan.jpg).
 */

export interface PagePin {
  x: number;
  y: number;
  title: { ar: string; en: string };
  text?: { ar: string; en: string };
}

type Pt = [number, number];

// Video frame (0..1) to the element's own pixels, for a video shown with object-fit: cover.
function toScreen(p: Pt, video: HTMLVideoElement): Pt {
  const cw = video.clientWidth, ch = video.clientHeight;
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const s = Math.max(cw / vw, ch / vh);
  return [p[0] * vw * s + (cw - vw * s) / 2, p[1] * vh * s + (ch - vh * s) / 2];
}

const PAGE: Pt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export const PagePins: React.FC<{
  /** The page's marker key (e.g. "artifact:ALQ-MS-003"). */
  markerKey: string;
  pins: PagePin[];
  video: HTMLVideoElement | null;
  /** Whether the page is being followed (the caller can then step its own card aside). */
  onTracking?: (on: boolean) => void;
}> = ({ markerKey, pins, video, onTracking }) => {
  const [corners, setCorners] = useState<Pt[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const smooth = useRef<Pt[] | null>(null);
  const onTrackingRef = useRef(onTracking);
  onTrackingRef.current = onTracking;

  useEffect(() => {
    if (!video) return;
    let live = true;
    const tracker = new CoverTracker(
      (pose: CoverPose) => {
        if (!live) return;
        const target = pose.corners.map((c) => toScreen(c, video));
        const prev = smooth.current;
        smooth.current = prev ? target.map((t, i) => [prev[i][0] + (t[0] - prev[i][0]) * 0.45, prev[i][1] + (t[1] - prev[i][1]) * 0.45] as Pt) : target;
        setCorners(smooth.current);
        onTrackingRef.current?.(true);
      },
      () => {
        if (!live) return;
        smooth.current = null;
        setCorners(null);
        onTrackingRef.current?.(false);
      }
    );
    void tracker.follow(markerKey, video).catch(() => undefined);
    return () => {
      live = false;
      tracker.dispose();
      onTrackingRef.current?.(false);
    };
  }, [markerKey, video]);

  if (!corners) return null;
  const H = homography(PAGE, corners);
  if (!H) return null;
  const at = ([u, v]: Pt): Pt => {
    const w = H[6] * u + H[7] * v + H[8];
    return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
  };
  const shown = open != null ? pins[open] : null;

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <polygon points={corners.map((c) => c.join(',')).join(' ')} fill="rgba(0,242,254,0.05)" stroke="#00f2fe" strokeWidth="1.5" strokeOpacity="0.7" strokeLinejoin="round" />
      </svg>
      {pins.map((p, i) => {
        const [x, y] = at([p.x, p.y]);
        return (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            aria-label={p.title.en}
            title={p.title.ar}
            className={`absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 flex items-center justify-center text-[12px] font-bold text-white shadow-[0_0_14px_#00f2fe] ${
              open === i ? 'bg-[#00f2fe] text-black border-white' : 'bg-[#00f2fe]/30 border-[#00f2fe] animate-pulse'
            }`}
            style={{ left: x, top: y }}
          >
            {i + 1}
          </button>
        );
      })}
      {shown ? (
        <div dir="rtl" className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+24px)] pointer-events-auto rounded-2xl bg-black/75 backdrop-blur-md border border-[#00f2fe]/50 text-white p-3 shadow-2xl">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[13.5px] font-semibold">
              {open! + 1}. {shown.title.ar} · <span className="text-white/70 font-normal">{shown.title.en}</span>
            </p>
            <button onClick={() => setOpen(null)} aria-label="Close" className="w-6 h-6 rounded-full bg-white/10 shrink-0">
              ×
            </button>
          </div>
          {shown.text && (
            <>
              <p className="mt-1 text-[12px] text-white/90 leading-relaxed">{shown.text.ar}</p>
              <p dir="ltr" className="mt-0.5 text-[11px] text-white/60 leading-relaxed">
                {shown.text.en}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+28px)] inset-x-0 flex justify-center">
          <span className="px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md text-white/90 text-[11.5px]">اضغط رقمًا لتعرف الجزء · Tap a number to learn about that part</span>
        </div>
      )}
    </div>
  );
};
