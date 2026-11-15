import React, { useState } from 'react';
import {
  ChevronLeft,
  Sparkles,
  Play,
  Columns,
  Maximize2,
  Mountain,
} from 'lucide-react';
import { EnvironmentId } from '../../types/spatial';
import { spatialSound } from '../../utils/spatialSound';

import { Glyph } from '../shell/Glyph';
export const PhotosMemoryApp: React.FC<{
  onSwitchEnvironment: (env: EnvironmentId, immersion: number) => void;
}> = ({ onSwitchEnvironment }) => {
  const [stage, setStage] = useState<'prompt' | 'assembling' | 'movie'>('prompt');
  const [prompt, setPrompt] = useState('Day at the skate park');
  const [bentoSplit, setBentoSplit] = useState(false);

  const handleGenerateMemory = (customPrompt?: string) => {
    const activePrompt = customPrompt || prompt;
    setPrompt(activePrompt);
    spatialSound.playSiriChime();
    setStage('assembling');
    setTimeout(() => {
      setStage('movie');
      // At 00:19 of large_2x (2).mp4, the room transitions to the Sunset Cloudscape Environment!
      onSwitchEnvironment('sunset-clouds', 92);
    }, 1500);
  };

  return (
    <div className="w-full h-full relative overflow-hidden text-white select-none">
      {/* STAGE 1: "Create a Memory Movie — WITH JUST A DESCRIPTION" (00:00-00:05 of large_2x (2).mp4) */}
      {stage === 'prompt' && (
        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(162, 136, 175, 0.72) 0%, rgba(218, 138, 148, 0.72) 48%, rgba(208, 170, 118, 0.72) 100%)',
          }}
          className="w-full h-full p-8 flex flex-col justify-between items-center relative"
        >
          <div className="w-full flex items-center justify-between">
            <button
              onClick={() => handleGenerateMemory('Day at the skate park')}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-white/80">
              Photos • Apple Intelligence Memories
            </span>
            <div className="w-9" />
          </div>

          {/* Center Serif Headline & Suggestion Pills */}
          <div className="flex flex-col items-center text-center max-w-lg my-auto">
            <h2 className="text-[34px] font-serif font-semibold tracking-tight text-white drop-shadow">
              Create a Memory Movie
            </h2>
            <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-white/80 mt-1">
              WITH JUST A DESCRIPTION
            </div>

            {/* Suggestion Pills */}
            <div className="flex flex-col items-start gap-2 mt-8 w-full max-w-sm">
              <button
                onClick={() => handleGenerateMemory('Spring 2024')}
                className="px-3.5 py-1 rounded-full bg-white/15 hover:bg-white/30 text-[12.5px] font-medium text-white/95 transition"
              >
                &ldquo;Spring 2024&rdquo;
              </button>
              <button
                onClick={() => handleGenerateMemory('Malibu in the Summer')}
                className="px-3.5 py-1 rounded-full bg-white/15 hover:bg-white/30 text-[12.5px] font-medium text-white/95 flex items-center gap-1.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>&ldquo;Malibu in the Summer&rdquo;</span>
              </button>
            </div>

            {/* Glowing Prompt Input ("Day at the skate park") */}
            <div className="mt-4 w-full max-w-md h-11 rounded-full bg-white/20 backdrop-blur-xl border border-white/40 px-4 flex items-center gap-2.5 shadow-lg">
              <Sparkles className="w-4 h-4 text-white shrink-0" />
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGenerateMemory(prompt);
                }}
                placeholder="Describe a memory..."
                className="bg-transparent flex-1 text-[13.5px] font-medium text-white placeholder-white/70 focus:outline-none"
              />
              <button
                onClick={() => handleGenerateMemory(prompt)}
                className="px-3 py-1 rounded-full bg-white text-black text-xs font-semibold hover:scale-105 transition"
              >
                Create
              </button>
            </div>
          </div>

          <div className="text-[11px] text-white/70">
            Click &ldquo;Create&rdquo; to assemble spatial photo mosaic &amp; launch Memory Movie
          </div>
        </div>
      )}

      {/* STAGE 2: 3D FLOATING PHOTO CLOUD MOSAIC WITH AMBIENT BLOOMS (00:06-00:09 of large_2x (2).mp4) */}
      {stage === 'assembling' && (
        <div className="w-full h-full p-8 flex flex-col items-center justify-center relative bg-stone-900/65">
          {/* Glowing Blue/Pink/Gold Ambient Backlight Blooms */}
          <div className="absolute w-72 h-44 bg-sky-400/45 blur-3xl rounded-full -translate-x-16 -translate-y-6 animate-pulse" />
          <div className="absolute w-72 h-44 bg-rose-500/45 blur-3xl rounded-full translate-x-20 translate-y-6 animate-pulse" />

          {/* 3D Floating Photo Collage Grid */}
          <div className="relative z-10 grid grid-cols-5 gap-2.5 max-w-lg p-4">
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                style={{
                  transform: `translateZ(${(i % 3) * 18}px) scale(${
                    i % 2 === 0 ? 1.05 : 0.94
                  })`,
                }}
                className="w-20 h-16 rounded-xl bg-gradient-to-br from-amber-500 via-emerald-600 to-sky-700 border border-white/30 shadow-xl flex items-center justify-center text-xl animate-bounce"
              >
                <Glyph e={['🛹', '🌲', '👟', '☀️', '🏞️'][i % 5]} />
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-6 h-10 px-5 rounded-full bg-white/15 border border-white/30 flex items-center gap-2 text-xs font-medium">
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
            <span>{prompt}</span>
          </div>
        </div>
      )}

      {/* STAGE 3: "Skateboarding Tricks" MEMORY MOVIE PLAYER + BENTO COLLAGE (00:11-00:34 of large_2x (2).mp4) */}
      {stage === 'movie' && (
        <div className="w-full h-full relative overflow-hidden bg-black">
          {!bentoSplit ? (
            <div className="w-full h-full relative">
              {/* Play the actual reference video from D:\vison os\large_2x (2).mp4! */}
              <video
                src="/reference/large_2x (2).mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover scale-[1.32]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/25 pointer-events-none" />

              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center pointer-events-none">
                <h2 className="text-[32px] font-bold tracking-tight text-white drop-shadow-lg">
                  Skateboarding Tricks
                </h2>
                <p className="text-xs text-white/80 mt-0.5">
                  {prompt} • Spatial Memory Movie
                </p>
              </div>
            </div>
          ) : (
            /* Multi-Panel Split-Screen Bento Collage View (00:24-00:29 of large_2x (2).mp4) */
            <div className="w-full h-full grid grid-cols-2 gap-2 p-2 bg-stone-950">
              <div className="rounded-[24px] overflow-hidden relative">
                <video
                  src="/reference/large_2x (2).mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover object-left scale-150"
                />
                <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] font-semibold">
                  Kickflip Lipslide • Slow-Mo
                </span>
              </div>
              <div className="rounded-[24px] overflow-hidden relative">
                <video
                  src="/reference/large_2x (2).mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover object-right scale-150"
                />
                <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] font-semibold">
                  Ramp Drop-In • Sunset Cloudscape
                </span>
              </div>
            </div>
          )}

          {/* Top Player Controls */}
          <div className="absolute top-4 inset-x-5 flex items-center justify-between z-20">
            <button
              onClick={() => setStage('prompt')}
              className="vision-btn px-3.5 py-1.5 rounded-full vision-ornament text-xs font-medium flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>New Memory Prompt</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  spatialSound.playPinchTap();
                  setBentoSplit(!bentoSplit);
                }}
                className="vision-btn px-3.5 py-1.5 rounded-full vision-ornament text-xs font-medium flex items-center gap-1.5"
              >
                {bentoSplit ? (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Single Cinema View</span>
                  </>
                ) : (
                  <>
                    <Columns className="w-3.5 h-3.5" />
                    <span>Split Bento Collage (00:25)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => onSwitchEnvironment('sunset-clouds', 100)}
                className="vision-btn px-3.5 py-1.5 rounded-full vision-ornament text-xs font-medium flex items-center gap-1.5"
                title="Activate Full Sunset Cloudscape Environment"
              >
                <Mountain className="w-3.5 h-3.5 text-amber-300" />
                <span>Sunset Clouds</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
