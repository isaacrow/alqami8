import { ErrorBoundary } from './ErrorBoundary';
import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { spatialSound } from '../../utils/spatialSound';

interface SpatialWindowProps {
  id: string;
  title?: string;
  x: number;
  y: number;
  z?: number;
  width: number;
  height: number;
  zIndex: number;
  curved?: boolean;
  dimmed?: boolean;
  noGlassChrome?: boolean;
  alqamiMode?: boolean;
  leftOrnament?: React.ReactNode;
  topOrnament?: React.ReactNode;
  bottomOrnament?: React.ReactNode;
  onClose: () => void;
  onFocus: () => void;
  onMove: (newX: number, newY: number) => void;
  onZChange?: (newZ: number) => void;
  onResize?: (newW: number, newH: number) => void;
  /** Rendered as an independent world-anchored object inside <SpatialWorld> (iPhone spatial mode). */
  worldAnchored?: boolean;
  /** World mode: grab bar pressed — the world layer carries the window with your gaze. */
  onWorldGrab?: (e: React.PointerEvent) => void;
  /** World mode: push the window away (factor > 1) or pull it closer (factor < 1). */
  onWorldDepth?: (factor: number) => void;
  children: React.ReactNode;
}

export const SpatialWindow: React.FC<SpatialWindowProps> = ({
  id,
  title,
  x,
  y,
  z = 0,
  width,
  height,
  zIndex,
  curved = false,
  dimmed = false,
  noGlassChrome = false,
  alqamiMode = false,
  leftOrnament,
  topOrnament,
  bottomOrnament,
  onClose,
  onFocus,
  onMove,
  onZChange,
  onResize,
  worldAnchored = false,
  onWorldGrab,
  onWorldDepth,
  children,
}) => {
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const [hasAppeared, setHasAppeared] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const [cornerHovered, setCornerHovered] = useState(false);
  const dragStartRef = useRef<{ mx: number; my: number; wx: number; wy: number }>({
    mx: 0,
    my: 0,
    wx: x,
    wy: y,
  });
  const resizeStartRef = useRef<{ mx: number; my: number; ww: number; wh: number }>({
    mx: 0,
    my: 0,
    ww: width,
    wh: height,
  });
  const dragMotionRef = useRef({ mx: 0, my: 0, time: 0, vx: 0, vy: 0 });
  const currentPositionRef = useRef({ x, y });
  const glideFrameRef = useRef(0);

  useEffect(() => {
    const updateViewport = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    currentPositionRef.current = { x, y };
  }, [x, y]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHasAppeared(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Dynamic visionOS Spatial Billboarding: windows subtly angle toward the user's center viewpoint
  const billboardRotateY = worldAnchored ? 0 : Math.max(-18, Math.min(18, -x * 0.022));
  const billboardRotateX = worldAnchored ? 0 : Math.max(-12, Math.min(12, y * 0.018));
  const isPhoneViewport = !worldAnchored && viewportSize.width < 640;
  const renderedWidth = isPhoneViewport ? Math.max(1, Math.min(width, viewportSize.width - 48)) : width;
  const renderedHeight = isPhoneViewport ? Math.max(1, Math.min(height, viewportSize.height - 184)) : height;
  // Keep the front window inside the phone's safe area while leaving a small edge
  // of earlier windows visible, so opening another app still feels like a stack.
  const maxPhoneOffsetX = Math.max(0, (viewportSize.width - renderedWidth) / 2 - 8);
  const maxPhoneOffsetY = Math.max(0, (viewportSize.height - renderedHeight) / 2 - 42);
  const renderedX = isPhoneViewport ? Math.max(-maxPhoneOffsetX, Math.min(maxPhoneOffsetX, x)) : x;
  const renderedY = isPhoneViewport ? Math.max(-maxPhoneOffsetY, Math.min(maxPhoneOffsetY, y)) : y;

  const rootTransform = worldAnchored
    ? `scale(${hasAppeared ? 1 : 0.94})`
    : `translate3d(calc(-50% + ${renderedX}px), calc(-50% + ${renderedY}px), ${
        isDragging ? z + 28 : z
      }px) rotateY(${billboardRotateY}deg) rotateX(${billboardRotateX}deg) scale(${hasAppeared ? 1 : 0.965})`;

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.mx;
        const dy = e.clientY - dragStartRef.current.my;
        const now = performance.now();
        const elapsed = Math.max(1, now - dragMotionRef.current.time);
        currentPositionRef.current = {
          x: dragStartRef.current.wx + dx,
          y: dragStartRef.current.wy + dy,
        };
        dragMotionRef.current.vx = Math.max(-14, Math.min(14, ((e.clientX - dragMotionRef.current.mx) * 16) / elapsed));
        dragMotionRef.current.vy = Math.max(-14, Math.min(14, ((e.clientY - dragMotionRef.current.my) * 16) / elapsed));
        dragMotionRef.current = {
          ...dragMotionRef.current,
          mx: e.clientX,
          my: e.clientY,
          time: now,
        };
        onMove(currentPositionRef.current.x, currentPositionRef.current.y);
      } else if (isResizing && onResize) {
        const dw = e.clientX - resizeStartRef.current.mx;
        const dh = e.clientY - resizeStartRef.current.my;
        onResize(
          Math.max(460, Math.min(1420, resizeStartRef.current.ww + dw)),
          Math.max(320, Math.min(860, resizeStartRef.current.wh + dh))
        );
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      if (isDragging) {
        let { vx, vy } = dragMotionRef.current;
        if (Math.hypot(vx, vy) > 0.35) {
          const glide = () => {
            vx *= 0.84;
            vy *= 0.84;
            if (Math.hypot(vx, vy) < 0.12) return;
            currentPositionRef.current = {
              x: currentPositionRef.current.x + vx,
              y: currentPositionRef.current.y + vy,
            };
            onMove(currentPositionRef.current.x, currentPositionRef.current.y);
            glideFrameRef.current = requestAnimationFrame(glide);
          };
          glideFrameRef.current = requestAnimationFrame(glide);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, isResizing, onMove, onResize]);

  useEffect(() => () => cancelAnimationFrame(glideFrameRef.current), []);

  return (
    <div
      onPointerDown={onFocus}
      style={{
        width: `${renderedWidth}px`,
        height: `${renderedHeight}px`,
        zIndex,
        opacity: hasAppeared ? 1 : 0,
        filter: hasAppeared ? 'blur(0px)' : 'blur(10px)',
        transform: rootTransform,
        transition:
          isDragging || isResizing
            ? 'none'
            : 'transform 560ms cubic-bezier(0.16, 1.12, 0.3, 1), opacity 380ms ease, filter 420ms ease',
        willChange: isDragging || isResizing ? 'transform' : undefined,
      }}
        className={
          worldAnchored
            ? 'spatial-window-world relative preserve-3d select-none'
            : 'spatial-window-root fixed top-1/2 left-1/2 preserve-3d select-none'
        }
    >
      {/* Top Floating Ornament (e.g., Safari URL Bar at translateZ(28px)) */}
      {topOrnament && (
        <div
          style={{ transform: 'translate3d(-50%, -62px, 28px)' }}
          className="spatial-window-top-ornament absolute top-0 left-1/2 z-30 preserve-3d"
        >
          {topOrnament}
        </div>
      )}

      {/* Left Vertical Tab Ornament (e.g., IKEA / Photos / Spotlight at translateZ(28px)) */}
      {leftOrnament && (
        <div
          style={{ transform: 'translate3d(-76px, -50%, 28px)' }}
          className="spatial-window-left-ornament absolute top-1/2 left-0 z-30 preserve-3d"
        >
          {leftOrnament}
        </div>
      )}

      {/* Alqami Mode Top Floating Holographic Charm (Vision Pro Spatial Anchor Tag) */}
      {alqamiMode && (
        <div
          style={{ transform: 'translate3d(-50%, -46px, 32px)' }}
          className="absolute top-0 left-1/2 flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/45 border border-amber-300/50 backdrop-blur-2xl text-[11px] font-semibold text-white/95 shadow-[0_0_20px_rgba(245,190,70,0.35)] pointer-events-none whitespace-nowrap z-30"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]" />
          <span>{title || 'Spatial App'}</span>
          <span className="text-white/35">·</span>
          <span className="text-emerald-300 font-mono text-[10px]">
            {((100 + (z || 20)) / 100).toFixed(2)}m Room Anchor
          </span>
        </div>
      )}

      {/* Main Spatial Glass Window Surface */}
      <div
        className={`spatial-window-surface w-full h-full rounded-[38px] overflow-hidden relative transition-all duration-300 ${
          noGlassChrome
            ? ''
            : alqamiMode
            ? 'border border-amber-300/40 shadow-[0_28px_80px_rgba(0,0,0,0.85),0_0_0_1.5px_rgba(255,255,255,0.45),0_0_35px_rgba(245,190,70,0.25),inset_0_1px_2px_rgba(255,255,255,0.85)] backdrop-blur-2xl bg-white/[0.10]'
            : 'vision-glass'
        } ${
          dimmed ? 'opacity-45 blur-[8px] scale-[0.97]' : 'opacity-100'
        } ${curved ? 'shadow-[0_40px_110px_rgba(0,0,0,0.75)]' : ''}`}
      >
        {/* Specular glare edge in Alqami Mode */}
        {alqamiMode && (
          <div className="absolute inset-0 pointer-events-none rounded-[inherit] bg-gradient-to-tr from-transparent via-white/5 to-amber-200/10" />
        )}
        <ErrorBoundary area={title} onClose={onClose}>
          {children}
        </ErrorBoundary>
      </div>

      {/* Bottom Floating Ornament (e.g., Freeform/Notes Tool Palette at translateZ(28px)) */}
      {bottomOrnament && (
        <div
          style={{ transform: 'translate3d(-50%, 16px, 28px)' }}
          className="absolute -bottom-12 left-1/2 z-30 preserve-3d"
        >
          {bottomOrnament}
        </div>
      )}

      {/* Bottom Spatial Window Controls: Close Dot + Grabber Pill + Depth Steppers */}
      <div
        style={{ transform: 'translate3d(-50%, 0, 18px)' }}
        className="absolute -bottom-7 left-1/2 flex items-center gap-2.5 z-40"
      >
        {/* Close Dot (14px circle -> expands to 24px with X on hover) */}
        <button
          onMouseEnter={() => {
            setCloseHovered(true);
            spatialSound.playHover();
          }}
          onMouseLeave={() => setCloseHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            spatialSound.playPinchTap();
            onClose();
          }}
          className={`rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border border-white/30 ${
            closeHovered
              ? 'w-6 h-6 bg-white/90 text-black shadow-[0_0_16px_rgba(255,255,255,0.8)] scale-110'
              : 'w-3.5 h-3.5 bg-white/40 text-transparent hover:bg-white/70'
          }`}
          title="Close Window"
        >
          <X className="w-3.5 h-3.5 stroke-[2.75]" />
        </button>

        {/* Window Grabber Bar (136px x 6px pill) */}
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            if (worldAnchored && onWorldGrab) {
              onFocus();
              setIsDragging(true);
              const release = () => {
                setIsDragging(false);
                window.removeEventListener('pointerup', release);
                window.removeEventListener('pointercancel', release);
              };
              window.addEventListener('pointerup', release);
              window.addEventListener('pointercancel', release);
              onWorldGrab(e);
              return;
            }
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Camera hand pointers are synthetic and cannot be captured by the browser.
            }
            cancelAnimationFrame(glideFrameRef.current);
            onFocus();
            spatialSound.playPinchTap();
            setIsDragging(true);
            dragStartRef.current = { mx: e.clientX, my: e.clientY, wx: x, wy: y };
            currentPositionRef.current = { x, y };
            dragMotionRef.current = { mx: e.clientX, my: e.clientY, time: performance.now(), vx: 0, vy: 0 };
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`h-1.5 w-36 rounded-full cursor-grab active:cursor-grabbing transition-all duration-200 backdrop-blur-xl ${
            isDragging
              ? 'bg-white h-2 w-40 shadow-[0_0_20px_rgba(255,255,255,0.95)]'
              : alqamiMode
              ? 'bg-amber-300/60 hover:bg-amber-200 hover:h-2 shadow-[0_0_10px_rgba(245,190,70,0.5)]'
              : 'bg-white/45 hover:bg-white/80 hover:h-2'
          }`}
          title={worldAnchored ? 'Hold and turn your phone (or drag) to move this window in your room' : 'Drag to move window in 3D room space'}
        />

        {/* World mode depth steppers: push the window away / bring it closer in the real room */}
        {worldAnchored && onWorldDepth && (
          <div className="flex items-center gap-1 bg-black/40 border border-white/20 rounded-full px-1.5 py-0.5 backdrop-blur-md">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                spatialSound.playPinchTap();
                onWorldDepth(1.2);
              }}
              className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 text-xs text-white flex items-center justify-center font-bold"
              title="Push further away"
            >
              −
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                spatialSound.playPinchTap();
                onWorldDepth(1 / 1.2);
              }}
              className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 text-xs text-white flex items-center justify-center font-bold"
              title="Bring closer"
            >
              +
            </button>
          </div>
        )}

        {/* Alqami Mode 3D Z-Depth Steppers: Push Back / Bring Closer in Room */}
        {alqamiMode && onZChange && (
          <div className="flex items-center gap-1 bg-black/40 border border-white/20 rounded-full px-1.5 py-0.5 backdrop-blur-md">
            <button
              onClick={(e) => {
                e.stopPropagation();
                spatialSound.playPinchTap();
                onZChange(Math.max(-50, z - 20));
              }}
              className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 text-[10px] text-white flex items-center justify-center font-bold"
              title="Push deeper into room (-Z)"
            >
              -
            </button>
            <span className="text-[9px] font-mono text-amber-200 px-0.5">Z</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                spatialSound.playPinchTap();
                onZChange(Math.min(180, z + 20));
              }}
              className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 text-[10px] text-white flex items-center justify-center font-bold"
              title="Pull closer (+Z)"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Bottom-Right Curved Resize Arc Handle (from large_2x (2).mp4 at 00:13-00:16) */}
      {onResize && (
        <div
          onMouseEnter={() => setCornerHovered(true)}
          onMouseLeave={() => setCornerHovered(false)}
          onPointerDown={(e) => {
            e.stopPropagation();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Camera hand pointers are synthetic and cannot be captured by the browser.
            }
            onFocus();
            setIsResizing(true);
            resizeStartRef.current = {
              mx: e.clientX,
              my: e.clientY,
              ww: width,
              wh: height,
            };
          }}
          className="absolute -bottom-3 -right-3 w-11 h-11 cursor-nwse-resize z-40 flex items-end justify-end p-1"
          title="Drag corner arc to scale window"
        >
          <svg
            width="34"
            height="34"
            viewBox="0 0 34 34"
            className={`transition-all duration-200 ${
              cornerHovered || isResizing ? 'opacity-100 scale-105' : 'opacity-35'
            }`}
          >
            <path
              d="M 6 30 A 24 24 0 0 0 30 6"
              fill="none"
              stroke="white"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {/* Soft Dynamic Spatial Floor Contact Shadow */}
      {!worldAnchored && (
      <div
        style={{
          transform: alqamiMode
            ? 'translate3d(-50%, 65px, -55px) rotateX(84deg)'
            : 'translate3d(-50%, 48px, -40px) rotateX(82deg)',
        }}
        className={`absolute -bottom-6 left-1/2 rounded-full pointer-events-none transition-all duration-300 ${
          alqamiMode
            ? 'w-[90%] h-16 bg-black/75 blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.9)]'
            : 'w-[78%] h-10 bg-black/45 blur-2xl'
        }`}
      />
      )}
    </div>
  );
};
