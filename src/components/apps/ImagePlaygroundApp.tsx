import React, { useState } from 'react';
import {
  LayoutGrid,
  Plus,
  Trash2,
  Share,
  MoreHorizontal,
  Sparkles,
  User,
  Wand2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { spatialSound } from '../../utils/spatialSound';

import { Glyph } from '../shell/Glyph';
export const ImagePlaygroundApp: React.FC = () => {
  // Toggle between the two exact reference views in D:\vison os:
  // 1. 'orbital' (large_2x (1).mp4: Lani + Birthday + Disco orbiting portal mixer)
  // 2. 'cabin-split' (apps__ggku3gfk5him_large.jpg: Split-pane yellow cabin editor)
  const [mode, setMode] = useState<'orbital' | 'cabin-split'>('orbital');
  const [activeConcepts, setActiveConcepts] = useState<string[]>([
    'Lani',
    'Birthday',
    'Disco',
  ]);
  const [showGeneratedPortrait, setShowGeneratedPortrait] = useState(true);
  const [showFullBleed, setShowFullBleed] = useState(false);
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [cabinPrompt, setCabinPrompt] = useState(
    'Vibrant yellow rectangular modern cabin perched on top of a hill, golden hour. Landscape architecture.'
  );
  const [changeInput, setChangeInput] = useState('');
  const [cabinVariant, setCabinVariant] = useState<'golden' | 'twilight' | 'snow'>('golden');

  const themes = [
    { name: 'Adventure', icon: '🏕️', color: 'from-emerald-500 to-teal-700' },
    { name: 'Birthday', icon: '🎈', color: 'from-pink-500 to-rose-600' },
    { name: 'Disco', icon: '🪩', color: 'from-indigo-500 to-purple-700' },
    { name: 'Fantasy', icon: '🏰', color: 'from-violet-500 to-fuchsia-700' },
    { name: 'Fireworks', icon: '🎆', color: 'from-amber-500 to-red-600' },
    { name: 'Love', icon: '💖', color: 'from-rose-400 to-pink-600' },
    { name: 'Starry Night', icon: '🌌', color: 'from-blue-600 to-slate-900' },
    { name: 'Summer', icon: '☀️', color: 'from-yellow-400 to-orange-500' },
    { name: 'Party', icon: '🎉', color: 'from-fuchsia-500 to-purple-600' },
    { name: 'Spring', icon: '🌸', color: 'from-teal-400 to-emerald-600' },
    { name: 'Sci-Fi', icon: '🛸', color: 'from-cyan-500 to-blue-700' },
    { name: 'Sunset', icon: '🌅', color: 'from-orange-500 to-rose-700' },
  ];

  const toggleConcept = (name: string) => {
    spatialSound.playSiriChime();
    setShowGeneratedPortrait(false);
    setActiveConcepts((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev.slice(-3), name]
    );
    setTimeout(() => {
      setShowGeneratedPortrait(true);
    }, 900);
  };

  // Full-bleed final portrait view (00:31-00:36 of large_2x (1).mp4)
  if (showFullBleed) {
    return (
      <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-purple-900 via-fuchsia-800 to-amber-600">
        <img
          src="/reference/apps__ggku3gfk5him_large.jpg"
          alt="Generated Playground"
          className="hidden"
        />
        {/* Celebratory Disco Birthday Portrait */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,215,0,0.45),rgba(147,51,234,0.85))] flex flex-col items-center justify-center">
          <div className="text-[120px] drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
            <Glyph e="👩🏽‍🦱🎉🪩" />
          </div>
          <div className="mt-2 px-4 py-1.5 rounded-full bg-black/35 backdrop-blur-md text-sm font-semibold text-white">
            {activeConcepts.join(' • ')} — 3D Animation Style
          </div>
        </div>

        <div className="absolute top-5 right-5 flex items-center gap-2 z-20">
          <button
            onClick={() => setShowFullBleed(false)}
            className="px-4 py-1.5 rounded-full vision-ornament text-xs font-semibold text-white"
          >
            Edit Concepts
          </button>
          <button
            onClick={() => setMode('cabin-split')}
            className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full text-white relative overflow-hidden flex flex-col justify-between">
      {/* MODE 1: ORBITAL CONCEPT MIXER (Exact replica of large_2x (1).mp4) */}
      {mode === 'orbital' && (
        <div className="w-full h-full p-6 flex flex-col justify-between relative">
          {/* Top Bar: Cancel | Mode Switch | Done */}
          <div className="flex items-center justify-between z-20">
            <button
              onClick={() => setMode('cabin-split')}
              className="px-4 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-[12.5px] font-medium flex items-center gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Library & Cabin Editor</span>
            </button>

            <div className="text-xs text-white/70 font-medium">
              Image Playground • Apple Intelligence
            </div>

            <button
              onClick={() => {
                spatialSound.playPinchTap();
                setShowFullBleed(true);
              }}
              className="px-4 py-1.5 rounded-full bg-white/20 hover:bg-white text-white hover:text-black text-[12.5px] font-semibold transition"
            >
              Done
            </button>
          </div>

          {/* Center Orbital Portal + Floating Concept Bubbles ("Lani", "Birthday", "Disco") */}
          <div className="my-auto flex flex-col items-center justify-center relative h-[250px]">
            {/* Orbiting Concept Pills */}
            {activeConcepts.map((concept, idx) => {
              const angles = [-40, 35, 155, -145];
              const deg = angles[idx % angles.length];
              const rad = (deg * Math.PI) / 180;
              const rx = Math.cos(rad) * 145;
              const ry = Math.sin(rad) * 88;
              return (
                <button
                  key={concept}
                  onClick={() => toggleConcept(concept)}
                  style={{
                    transform: `translate3d(${rx}px, ${ry}px, 35px)`,
                  }}
                  className="vision-btn absolute z-30 px-3 py-1.5 rounded-full vision-ornament flex items-center gap-1.5 text-[11.5px] font-semibold shadow-xl border border-white/30"
                >
                  <span>
                    <Glyph e={concept === 'Lani'
                      ? '👩🏽‍🦱'
                      : themes.find((t) => t.name === concept)?.icon || '✨'} />
                  </span>
                  <span>{concept}</span>
                  <span className="text-white/50 text-[10px] ml-0.5">✕</span>
                </button>
              );
            })}

            {/* Central Iridescent Portal OR Rainbow-Bordered Generated Portrait Square */}
            {!showGeneratedPortrait ? (
              <div className="w-44 h-44 rounded-full ai-morph-sphere flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-white animate-spin" />
              </div>
            ) : (
              <div className="relative group">
                <div className="w-48 h-48 rounded-[34px] ai-rainbow-border p-1 shadow-[0_0_50px_rgba(236,72,153,0.45)] overflow-hidden bg-gradient-to-br from-indigo-900 via-fuchsia-700 to-amber-500 flex flex-col items-center justify-center">
                  <div className="text-7xl drop-shadow-lg transform group-hover:scale-105 transition">
                    <Glyph e="👩🏽‍🦱🎉🪩" />
                  </div>
                  <div className="mt-2 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-black/40 backdrop-blur-md">
                    {activeConcepts.join(' + ')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Choose a Person Popover (00:00 of large_2x (1).mp4) */}
          {showPersonPicker && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 w-72 rounded-[28px] vision-glass p-4 border border-white/25 shadow-2xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold">Choose a Person</span>
                <button
                  onClick={() => setShowPersonPicker(false)}
                  className="text-xs text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['Lani', 'Rody', 'Ashley', 'Marco'].map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      if (!activeConcepts.includes(p)) {
                        toggleConcept(p);
                      }
                      setShowPersonPicker(false);
                    }}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/25 flex flex-col items-center gap-1 text-[11px]"
                  >
                    <span className="text-xl"><Glyph e="👩🏽‍🦱" /></span>
                    <span>{p}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Themes Grid & Prompt Bar (00:03-00:14 of large_2x (1).mp4) */}
          <div className="space-y-3 z-20">
            <div className="text-center text-[12px] font-semibold text-white/85">
              Themes
            </div>
            <div className="grid grid-cols-6 gap-2">
              {themes.slice(0, 6).map((t) => {
                const isSelected = activeConcepts.includes(t.name);
                return (
                  <button
                    key={t.name}
                    onClick={() => toggleConcept(t.name)}
                    className={`p-2 rounded-2xl flex flex-col items-center gap-1 transition ${
                      isSelected
                        ? 'bg-white/25 border border-white/50 scale-105'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-lg shadow`}
                    >
                      <Glyph e={t.icon} />
                    </div>
                    <span className="text-[10.5px] font-medium text-white/90 truncate">
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Prompt Input Bar */}
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-10 rounded-full bg-black/35 border border-white/15 px-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400" />
                <input
                  type="text"
                  placeholder="Describe an image"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      toggleConcept(e.currentTarget.value.trim());
                      e.currentTarget.value = '';
                    }
                  }}
                  className="bg-transparent flex-1 text-[12.5px] text-white placeholder-white/50 focus:outline-none"
                />
              </div>

              <button
                onClick={() => setShowPersonPicker(!showPersonPicker)}
                className="h-10 px-3.5 rounded-full bg-white/15 hover:bg-white/25 flex items-center gap-1.5 text-xs font-medium"
              >
                <User className="w-3.5 h-3.5" />
                <span>Person</span>
              </button>

              <button
                onClick={() => toggleConcept('3D Animation')}
                className="h-10 px-3.5 rounded-full bg-white/15 hover:bg-white/25 flex items-center gap-1.5 text-xs font-medium"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Style: Animation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: SPLIT-PANE CABIN EDITOR (Exact replica of apps__ggku3gfk5him_large.jpg) */}
      {mode === 'cabin-split' && (
        <div className="w-full h-full grid grid-cols-12">
          {/* Left 2x4 Library Sidebar */}
          <div className="col-span-4 border-r border-white/10 p-4 flex flex-col gap-3 overflow-y-auto bg-black/15">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/70">Playground</span>
              <button
                onClick={() => setMode('orbital')}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                title="Switch to Orbital Concept Mixer"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* 2x4 Thumbnail Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { title: 'Pelican', bg: 'from-sky-300 to-slate-600', emoji: '🦤' },
                { title: 'Train Dining', bg: 'from-amber-700 to-orange-900', emoji: '🚆' },
                { title: 'Mars Walk', bg: 'from-orange-500 to-red-800', emoji: '👩🏼‍🚀' },
                { title: 'Morning Cafe', bg: 'from-stone-400 to-amber-800', emoji: '🥐' },
                { title: 'Lotus Boat', bg: 'from-emerald-600 to-teal-900', emoji: '🚣‍♀️' },
                { title: 'Red Lipstick', bg: 'from-sky-100 to-rose-700', emoji: '💄' },
                { title: 'Glacier Peak', bg: 'from-slate-300 to-slate-800', emoji: '🏔️' },
                { title: 'Pink Lily', bg: 'from-pink-400 to-stone-950', emoji: '🌺' },
              ].map((art) => (
                <div
                  key={art.title}
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setCabinPrompt(`${art.title} — photorealistic golden hour lighting`);
                  }}
                  className={`aspect-square rounded-[20px] bg-gradient-to-br ${art.bg} flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition border border-white/15 shadow-md`}
                >
                  <span className="text-3xl"><Glyph e={art.emoji} /></span>
                  <span className="text-[10px] font-medium text-white/90 mt-1">
                    {art.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Cabin Editor Canvas */}
          <div className="col-span-8 p-6 flex flex-col justify-between items-center">
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between">
              <button
                onClick={() => setMode('orbital')}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                title="New Orbital Concept Mix"
              >
                <Plus className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <button className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
                  <Share className="w-4 h-4" />
                </button>
                <button className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Editable Prompt Caption & Modern Yellow Cabin Preview */}
            <div className="flex flex-col items-center max-w-md w-full my-auto">
              <p className="text-[13px] font-medium text-white/90 text-center mb-3 px-4 line-clamp-2">
                <Glyph e="✎" /> {cabinPrompt}
              </p>

              {/* High-Res Yellow Modern Cabin Card (Exact match to apps__ggku3gfk5him_large.jpg) */}
              <div className="w-72 h-72 rounded-[32px] overflow-hidden shadow-2xl border border-white/20 relative group">
                <img
                  src="/reference/apps__ggku3gfk5him_large.jpg"
                  alt="Vibrant yellow cabin"
                  className={`w-full h-full object-cover object-[55%_54%] scale-[2.35] transition-all duration-500 ${
                    cabinVariant === 'twilight'
                      ? 'hue-rotate-180 brightness-90'
                      : cabinVariant === 'snow'
                      ? 'saturate-50 brightness-110'
                      : ''
                  }`}
                />
                <div className="absolute bottom-3 right-3 flex gap-1.5">
                  <button
                    onClick={() => setCabinVariant('golden')}
                    className="px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-[10px]"
                  >
                    Golden
                  </button>
                  <button
                    onClick={() => setCabinVariant('twilight')}
                    className="px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-[10px]"
                  >
                    Twilight
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom "Describe a change" Input Bar */}
            <div className="w-full max-w-md flex flex-col items-center gap-1.5">
              <div className="w-full h-10 rounded-full bg-black/35 border border-white/20 px-4 flex items-center">
                <input
                  type="text"
                  value={changeInput}
                  onChange={(e) => setChangeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && changeInput.trim()) {
                      spatialSound.playSiriChime();
                      setCabinPrompt(`${cabinPrompt} • ${changeInput}`);
                      setCabinVariant(
                        cabinVariant === 'golden' ? 'twilight' : 'golden'
                      );
                      setChangeInput('');
                    }
                  }}
                  placeholder="Describe a change"
                  className="bg-transparent w-full text-[13px] text-white placeholder-white/50 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-white/45">
                Image Playground may create unexpected results
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
