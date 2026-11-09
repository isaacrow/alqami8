import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Box, X } from 'lucide-react';
import { useMoonRecord } from '../moon/useMoon';
import { roomViewUrl } from '../moon/roomView';
import { CoverPose } from './coverTracker';

/**
 * A Moon record's card pinned beside its cover in the camera view: a thin outline follows the cover and the card
 * sits next to it, moving with it. Positions are smoothed so the card glides instead of shaking.
 */

type Pt = [number, number];

// Video frame (0..1) to the element's own pixels, for a video shown with object-fit: cover.
function toScreen(p: Pt, video: HTMLVideoElement): Pt {
  const cw = video.clientWidth, ch = video.clientHeight;
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const s = Math.max(cw / vw, ch / vh);
  return [p[0] * vw * s + (cw - vw * s) / 2, p[1] * vh * s + (ch - vh * s) / 2];
}

export const PinnedCard: React.FC<{
  recordId: string;
  pose: CoverPose | null;
  video: HTMLVideoElement | null;
  onDetails: () => void;
  onClose: () => void;
}> = ({ recordId, pose, video, onDetails, onClose }) => {
  const load = useMoonRecord(recordId, 'ar');
  const card = load?.state === 'ready' ? load.data : null;
  const smooth = useRef<Pt[] | null>(null);
  const [corners, setCorners] = useState<Pt[] | null>(null);

  useEffect(() => {
    if (!pose || !video) return;
    const target = pose.corners.map((c) => toScreen(c, video));
    const prev = smooth.current;
    // Exponential smoothing: steady when the hand shakes, still quick to follow a real move.
    smooth.current = prev ? target.map((t, i) => [prev[i][0] + (t[0] - prev[i][0]) * 0.45, prev[i][1] + (t[1] - prev[i][1]) * 0.45] as Pt) : target;
    setCorners(smooth.current);
  }, [pose, video]);

  if (!corners || !video) return null;
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const right = Math.max(...xs), left = Math.min(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const cw = video.clientWidth;
  const cardW = Math.min(260, cw * 0.62);
  // Beside the cover where there is room, otherwise under it.
  const roomRight = cw - right > cardW + 12;
  const roomLeft = left > cardW + 12;
  const style: React.CSSProperties = roomRight
    ? { left: right + 12, top: Math.max(8, (top + bottom) / 2 - 70), width: cardW }
    : roomLeft
      ? { left: left - cardW - 12, top: Math.max(8, (top + bottom) / 2 - 70), width: cardW }
      : { left: Math.max(8, Math.min(cw - cardW - 8, (left + right) / 2 - cardW / 2)), top: Math.min(bottom + 10, video.clientHeight - 150), width: cardW };

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <polygon points={corners.map((c) => c.join(',')).join(' ')} fill="rgba(255,214,10,0.08)" stroke="#FFD60A" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div dir="rtl" style={style} className="absolute pointer-events-auto rounded-2xl vision-glass border border-[#FFD60A]/60 bg-[#0b1220]/85 p-3 text-white shadow-2xl transition-[left,top] duration-100 ease-out">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9.5px] font-semibold tracking-wide text-[#FFD60A]">ALQAMI · مثبّت على الغلاف</div>
            <div className="mt-0.5 text-[13px] font-bold leading-snug" dir="auto">{card?.title ?? '…'}</div>
            {card && (
              <div className="mt-1 text-[11px] text-white/75" dir="auto">
                {[card.contributors[0]?.label, card.date].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="إغلاق · Close" className="shrink-0 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
        {card?.summary && <p className="mt-1.5 text-[11px] leading-relaxed text-white/70 line-clamp-3" dir="auto">{card.summary}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={onDetails} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-white text-black text-[11.5px] font-semibold cursor-pointer">
            <BookOpen className="w-3 h-3" /> التفاصيل · Details
          </button>
          {card?.modelUrl && (
            <a href={roomViewUrl(card.modelUrl, card.title)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#FFD60A] text-black text-[11.5px] font-semibold">
              <Box className="w-3 h-3" /> في مكانك · In your room
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
