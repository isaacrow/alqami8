import React, { useState, useRef, useEffect } from 'react';
import { Mic, ArrowUp, Delete, Smile, X } from 'lucide-react';
import { spatialSound } from '../../utils/spatialSound';

interface SpatialKeyboardProps {
  isOpen: boolean;
  value: string;
  placeholder?: string;
  submitLabel?: 'return' | 'search';
  suggestions?: [string, string, string];
  onChange: (newVal: string) => void;
  onSubmit?: () => void;
  onClose: () => void;
}

export const SpatialKeyboard: React.FC<SpatialKeyboardProps> = ({
  isOpen,
  value,
  placeholder = 'Type or dictate...',
  submitLabel = 'return',
  suggestions = ['drafts', 'drafting', 'drafted'],
  onChange,
  onSubmit,
  onClose,
}) => {
  const [pos, setPos] = useState({ x: 0, y: 185 });
  const [isDragging, setIsDragging] = useState(false);
  const [shift, setShift] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const dragRef = useRef({ mx: 0, my: 0, kx: 0, ky: 185 });

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      setPos({
        x: dragRef.current.kx + (e.clientX - dragRef.current.mx),
        y: dragRef.current.ky + (e.clientY - dragRef.current.my),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  const row1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const row3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

  const handleKey = (ch: string) => {
    spatialSound.playPinchTap();
    const out = shift ? ch.toUpperCase() : ch;
    onChange(value + out);
    if (shift) setShift(false);
  };

  const handleBackspace = () => {
    spatialSound.playPinchTap();
    onChange(value.slice(0, -1));
  };
  const isPhoneViewport = typeof window !== 'undefined' && window.innerWidth < 640;
  const phoneY = isPhoneViewport
    ? Math.max(-window.innerHeight / 2 + 150, Math.min(window.innerHeight / 2 - 150, pos.y))
    : pos.y;

  return (
    <div
      style={{
        width: isPhoneViewport ? 'calc(100vw - 24px)' : '540px',
        transform: `translate3d(calc(-50% + ${pos.x}px), calc(-50% + ${phoneY}px), 140px) rotateX(18deg)`,
      }}
      className="spatial-keyboard-shell fixed top-1/2 left-1/2 z-[75] preserve-3d select-none"
    >
      {/* Main Spatial Keyboard Platter (Exact Replica of IMG-3-vision-pro.webp & oLK7KBr5ogcGwd2SxzuJCH.jpg) */}
      <div
        style={{ background: 'var(--vision-keyboard-bg)' }}
        className="spatial-keyboard-content rounded-[34px] vision-glass overflow-hidden shadow-[0_36px_90px_rgba(0,0,0,0.75)] border border-white/20"
      >
        {/* Top Dark Glass Text Preview Bar + Left Microphone Dictation Button */}
        <div className="h-12 bg-black/40 border-b border-white/10 px-3.5 flex items-center gap-3">
          <button
            onClick={() => {
              spatialSound.playSiriChime();
              setIsDictating(!isDictating);
              if (!isDictating) {
                onChange(
                  value
                    ? `${value} reviewed second draft`
                    : 'this group has reviewed second draft'
                );
              }
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              isDictating
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-white/15 hover:bg-white/25 text-white/90'
            }`}
            title="Dictation"
          >
            <Mic className="w-4 h-4" />
          </button>

          <div className="flex-1 text-center text-[14px] font-medium text-white/95 truncate">
            {value || <span className="text-white/40">{placeholder}</span>}
            <span className="inline-block w-[2px] h-4 bg-sky-400 ml-0.5 align-middle animate-pulse" />
          </div>

          <div className="w-8" />
        </div>

        {/* 3-Column Predictive Autocomplete Row (drafts | drafting | drafted) */}
        <div className="grid grid-cols-3 gap-2.5 px-4 pt-3 pb-1.5">
          {suggestions.map((sug) => (
            <button
              key={sug}
              onClick={() => {
                spatialSound.playPinchTap();
                const words = value.trim().split(' ');
                words[words.length - 1] = sug;
                onChange(words.join(' ') + ' ');
              }}
              className="vision-btn h-8 rounded-full bg-white/15 hover:bg-white/25 text-[12px] font-medium text-white/90 flex items-center justify-center border border-white/10"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Circular Keycap Rows */}
        <div className="px-4 pb-4 pt-1.5 flex flex-col gap-2.5 preserve-3d">
          {/* Row 1: q - p */}
          <div className="flex justify-center gap-2 preserve-3d">
            {row1.map((k) => (
              <button
                key={k}
                onMouseEnter={() => spatialSound.playHover()}
                onClick={() => handleKey(k)}
                className="vision-keycap w-11 h-11 rounded-full text-[16px] font-medium text-white flex items-center justify-center"
              >
                {shift ? k.toUpperCase() : k}
              </button>
            ))}
          </div>

          {/* Row 2: a - l */}
          <div className="flex justify-center gap-2 preserve-3d">
            {row2.map((k) => (
              <button
                key={k}
                onMouseEnter={() => spatialSound.playHover()}
                onClick={() => handleKey(k)}
                className="vision-keycap w-11 h-11 rounded-full text-[16px] font-medium text-white flex items-center justify-center"
              >
                {shift ? k.toUpperCase() : k}
              </button>
            ))}
          </div>

          {/* Row 3: shift + z - m + backspace */}
          <div className="flex justify-center items-center gap-2 preserve-3d">
            <button
              onClick={() => {
                setShift(!shift);
                spatialSound.playPinchTap();
              }}
              className={`vision-keycap w-12 h-11 rounded-full flex items-center justify-center ${
                shift ? 'bg-white text-black' : 'bg-black/45 text-white'
              }`}
            >
              <ArrowUp className="w-4 h-4" />
            </button>

            {row3.map((k) => (
              <button
                key={k}
                onMouseEnter={() => spatialSound.playHover()}
                onClick={() => handleKey(k)}
                className="vision-keycap w-11 h-11 rounded-full text-[16px] font-medium text-white flex items-center justify-center"
              >
                {shift ? k.toUpperCase() : k}
              </button>
            ))}

            <button
              onClick={handleBackspace}
              className="vision-keycap w-12 h-11 rounded-full bg-black/45 text-white flex items-center justify-center"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          {/* Row 4: .?123 + Emoji + Space Pill + Return/Search Pill */}
          <div className="flex items-center justify-between gap-2.5 pt-0.5 preserve-3d">
            <button
              onClick={() => handleKey('27')}
              className="vision-keycap w-14 h-11 rounded-full bg-black/45 text-[13px] font-medium text-white flex items-center justify-center"
            >
              .?123
            </button>
            <button
              onClick={() => handleKey('')}
              className="vision-keycap w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center"
            >
              <Smile className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleKey(' ')}
              className="vision-keycap flex-1 h-11 rounded-full text-[14px] font-medium text-white/90 flex items-center justify-center"
            >
              space
            </button>
            <button
              onClick={() => {
                spatialSound.playPinchTap();
                if (onSubmit) onSubmit();
              }}
              className="vision-keycap w-28 h-11 rounded-full bg-black/55 text-[14px] font-medium text-white flex items-center justify-center"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard Bottom Close Dot & Grabber Handle */}
      <div className="mt-2.5 flex items-center justify-center gap-3">
        <button
          onClick={onClose}
          className="w-4 h-4 rounded-full bg-white/40 hover:bg-white hover:text-black text-transparent flex items-center justify-center transition"
          title="Hide Spatial Keyboard"
        >
          <X className="w-3 h-3" />
        </button>
        <div
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Camera hand pointers are synthetic and already tracked by the engine.
            }
            setIsDragging(true);
            dragRef.current = { mx: e.clientX, my: e.clientY, kx: pos.x, ky: pos.y };
          }}
          className="w-28 h-1.5 rounded-full bg-white/50 hover:bg-white cursor-grab active:cursor-grabbing transition touch-none"
        />
      </div>
    </div>
  );
};
