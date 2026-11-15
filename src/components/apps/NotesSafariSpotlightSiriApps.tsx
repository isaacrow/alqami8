import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  Share,
  MoreHorizontal,
  Edit3,
  Folder,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  RefreshCw,
  Plus,
  Sparkles,
  Sun,
  Orbit,
  Cloud,
  Box,
  MessageSquare,
  Maximize2,
  Play,
} from 'lucide-react';
import { EarthGlobeMode, QuickLookShaderMode } from '../../types/spatial';
import {
  PlanetEarth3DCanvas,
  QuickLookChairCanvas,
} from '../three/SpatialThreeCanvas';
import { spatialSound } from '../../utils/spatialSound';

import { Glyph } from '../shell/Glyph';
// 1. NOTES APP (Exact replica of IMG-3-vision-pro.webp: Folders | Notes | Monday Morning Meeting)
export const NotesSpatialApp: React.FC<{
  noteBody: string;
  onChangeNoteBody: (val: string) => void;
  onSummonKeyboard: () => void;
}> = ({ noteBody, onChangeNoteBody, onSummonKeyboard }) => {
  const [activeTag, setActiveTag] = useState('All Tags');

  return (
    <div className="w-full h-full grid grid-cols-12 text-white overflow-hidden">
      {/* Column 1: Folders & Tags Sidebar */}
      <div className="col-span-3 border-r border-white/10 bg-black/20 p-4 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold">Folders</h2>
            <button className="px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-medium">
              Edit
            </button>
          </div>

          <div className="space-y-1 text-[12.5px]">
            <div className="px-2.5 py-1.5 rounded-xl flex items-center justify-between text-white/85 hover:bg-white/10 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="text-amber-400"><Glyph e="👤" /></span> Shared
              </span>
              <span className="text-white/50">2</span>
            </div>

            <div className="text-[11px] font-semibold text-white/50 px-2 pt-2">
              iCloud
            </div>
            <div className="px-2.5 py-1.5 rounded-xl flex items-center justify-between text-white/85 hover:bg-white/10 cursor-pointer">
              <span className="flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-amber-400" /> All iCloud
              </span>
              <span className="text-white/50">28</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-white/20 flex items-center justify-between font-semibold text-white cursor-pointer">
              <span className="flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-amber-400" /> Notes
              </span>
              <span>28</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl flex items-center justify-between text-white/85 hover:bg-white/10 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="text-amber-400"><Glyph e="⚙️" /></span> Work
              </span>
              <span className="text-white/50">3</span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="text-[11px] font-semibold text-white/50 px-1 mb-2">
              Tags
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['All Tags', '#Art', '#food', '#Housing', '#Policy'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                    activeTag === tag
                      ? 'bg-white/30 text-white'
                      : 'bg-white/10 text-white/75 hover:bg-white/20'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
          <Folder className="w-4 h-4" />
        </button>
      </div>

      {/* Column 2: Pinned & Recent Notes List */}
      <div className="col-span-3 border-r border-white/10 bg-black/10 p-4 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold">Notes</h3>
          <button className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-8 rounded-full bg-black/30 px-3 flex items-center gap-2 text-xs text-white/55">
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
        </div>

        <div className="text-[11px] font-semibold text-white/60">Pinned</div>
        <div className="p-2.5 rounded-2xl bg-white/20 border border-white/15 cursor-pointer">
          <div className="text-[12.5px] font-bold">Monday Morning Meeting</div>
          <div className="text-[10.5px] text-white/70 truncate mt-0.5">
            12/6/23 #Policy #Housing #Art #work
          </div>
        </div>

        <div className="text-[11px] font-semibold text-white/60 pt-1">
          Previous 30 Days
        </div>
        {[
          { title: 'Nature Walks', sub: '12/7/23 #Art', icon: '🌸' },
          { title: 'Urban planner', sub: '12/7/23 #work', icon: '🗺️' },
          { title: '30-Day Design Challenge', sub: '12/7/23 #work', icon: '📐' },
        ].map((n) => (
          <div
            key={n.title}
            className="p-2.5 rounded-2xl hover:bg-white/10 flex items-center justify-between cursor-pointer transition"
          >
            <div>
              <div className="text-[12.5px] font-semibold">{n.title}</div>
              <div className="text-[10.5px] text-white/60">{n.sub}</div>
            </div>
            <span className="w-8 h-8 rounded-lg bg-white text-base flex items-center justify-center">
              <Glyph e={n.icon} />
            </span>
          </div>
        ))}
      </div>

      {/* Column 3: Crisp White Paper Document Canvas ("Monday Morning Meeting") */}
      <div className="col-span-6 p-3 flex flex-col">
        <div className="flex items-center justify-end gap-2 pb-2.5 px-2">
          <button
            onClick={onSummonKeyboard}
            className="px-3 py-1 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-200 text-[11px] font-semibold"
          >
            <Glyph e="⌨️" /> Show Spatial Keyboard
          </button>
          <button className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
            <Share className="w-3.5 h-3.5" />
          </button>
          <button className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSummonKeyboard}
            className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          onClick={onSummonKeyboard}
          className="flex-1 rounded-[24px] bg-[#FAF9F6] text-stone-900 p-6 overflow-y-auto shadow-inner cursor-text"
        >
          <h1 className="text-[20px] font-bold text-stone-900">
            Monday Morning Meeting
          </h1>
          <div className="text-[13px] font-semibold text-amber-600 mt-2">
            #Policy #Housing #Art #work
          </div>
          <div className="text-[12.5px] font-bold text-stone-900 mt-3">
            White Paper: Public Art&apos;s Development Benefits for Kids <Glyph e="🎨🌻⭐" />
          </div>
          <textarea
            value={noteBody}
            onFocus={onSummonKeyboard}
            onChange={(e) => onChangeNoteBody(e.target.value)}
            className="mt-2 w-full h-56 bg-transparent text-[12.5px] leading-relaxed text-stone-800 focus:outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
};

// 2. SAFARI SPATIAL APP (Exact replica of maxresdefault.jpg Numa Stays + download.htm AI Reading List Topics)
export const SafariSpatialApp: React.FC = () => {
  const [showReadingListTopics, setShowReadingListTopics] = useState(false);
  const [selectedCity, setSelectedCity] = useState('Belfort');

  return (
    <div className="w-full h-full flex overflow-hidden rounded-[38px] bg-white text-stone-900">
      {/* Optional Apple Intelligence Reading List Grouped by Topics Sidebar (download.htm line 770) */}
      {showReadingListTopics && (
        <div className="w-64 bg-stone-900 text-white p-4 flex flex-col gap-3 border-r border-stone-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> AI Reading Topics
            </span>
            <button
              onClick={() => setShowReadingListTopics(false)}
              className="text-xs text-white/60"
            >
              ✕
            </button>
          </div>
          {[
            { topic: 'Architecture & Stays', count: 4, tag: 'Berlin • Belfort' },
            { topic: 'Spatial Computing SDK', count: 6, tag: 'RealityKit • WebXR' },
            { topic: 'Icelandic Expeditions', count: 3, tag: 'Thórsmörk Aurora' },
          ].map((t) => (
            <div
              key={t.topic}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/15 cursor-pointer"
            >
              <div className="text-xs font-bold">{t.topic}</div>
              <div className="text-[11px] text-white/60 mt-0.5">
                {t.count} articles • {t.tag}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Numa Stays Booking Page (maxresdefault.jpg center window) */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Filter & Map Banner */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-[#F7F9F8]">
          <div>
            <div className="text-[15px] font-bold leading-tight">
              Ready to book?
              <br />
              Find your room in
              <br />
              <span className="text-emerald-700">{selectedCity}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <div>
              <div className="font-bold text-stone-800">Check In | Check Out</div>
              <div className="text-stone-500 mt-0.5">May 06 - May 08</div>
            </div>
            <div>
              <div className="font-bold text-stone-800">Guests</div>
              <div className="text-stone-500 mt-0.5">1 guest</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReadingListTopics(!showReadingListTopics)}
              className="px-3.5 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>AI Topics</span>
            </button>
            <button className="px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-semibold flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>
        </div>

        {/* Map Strip with Pins (Novela, Drift, Arc, Kater) */}
        <div className="h-24 bg-gradient-to-r from-emerald-100 via-teal-50 to-emerald-100 border-b border-stone-200 relative flex items-center justify-around px-12">
          {['Novela', 'Drift', 'Arc', 'Kater'].map((pin) => (
            <button
              key={pin}
              onClick={() => setSelectedCity(pin)}
              className="px-3 py-1 rounded-full bg-white shadow border border-stone-300 text-[11px] font-bold text-stone-800 hover:scale-105 transition"
            >
              <Glyph e="📍" /> {pin}
            </button>
          ))}
        </div>

        {/* Hotel Listings Grid: ARC & NOVELA */}
        <div className="p-6 grid grid-cols-2 gap-6 flex-1">
          {[
            {
              name: 'ARC',
              area: 'in Kreuzberg Friedrichstraße 31',
              desc: 'Your most authentic stay in Berlin, Kreuzberg',
              price: '€ 104',
              bg: 'from-stone-300 via-amber-100 to-stone-400',
            },
            {
              name: 'NOVELA',
              area: 'in Wilmersdorf Hohenzollerndamm',
              desc: 'Get a taste of refined architectural living',
              price: '€ 128',
              bg: 'from-rose-200 via-stone-200 to-amber-200',
            },
          ].map((hotel) => (
            <div key={hotel.name} className="flex flex-col justify-between">
              <div>
                <div
                  className={`h-44 rounded-2xl bg-gradient-to-br ${hotel.bg} p-4 flex items-end justify-between shadow-inner border border-stone-200`}
                >
                  <span className="px-2.5 py-1 rounded-md bg-black/65 text-white text-[10px] font-semibold">
                    360° Spatial Tour
                  </span>
                  <span className="text-3xl"><Glyph e="🛏️🪟" /></span>
                </div>
                <h3 className="text-[18px] font-extrabold mt-3">{hotel.name}</h3>
                <div className="text-xs text-stone-500">{hotel.area}</div>
                <p className="text-xs text-stone-600 mt-1">{hotel.desc}</p>
              </div>

              <div className="mt-3">
                <div className="text-xs text-stone-500 mb-2">
                  7 Room Types from{' '}
                  <strong className="text-stone-900">{hotel.price}</strong>
                </div>
                <button
                  onClick={() => spatialSound.playPinchTap()}
                  className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition"
                >
                  Explore and Book
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 3. SPOTLIGHT SEARCH APP (Exact replica of oLK7KBr5ogcGwd2SxzuJCH.jpg: "doc" autocomplete dropdown)
export const SpotlightSearchApp: React.FC<{
  query: string;
  onChangeQuery: (q: string) => void;
  onSummonKeyboard: () => void;
}> = ({ query, onChangeQuery, onSummonKeyboard }) => {
  const suggestions = [
    'documents',
    'docusign',
    'docomo',
    'document scanner',
    'documents pro',
    'docket®',
    'doc scan',
    'Browser and documents manager',
  ];

  return (
    <div className="w-full h-full p-6 text-white relative flex flex-col justify-between">
      {/* Top Bar: Search Title + Input Field + Profile Avatar */}
      <div className="flex items-center justify-between gap-4 z-20">
        <h2 className="text-[22px] font-bold">Search</h2>

        <div className="w-80 h-9 rounded-full bg-black/45 border border-white/20 px-3.5 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-white/60" />
          <input
            type="text"
            value={query}
            onFocus={onSummonKeyboard}
            onChange={(e) => onChangeQuery(e.target.value)}
            className="bg-transparent flex-1 text-[13px] text-white focus:outline-none"
          />
          {query && (
            <button
              onClick={() => onChangeQuery('')}
              className="w-4 h-4 rounded-full bg-white/25 text-[10px] flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>

        <div className="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center text-sm font-bold shadow">
          <Glyph e="👨🏻‍💻" />
        </div>
      </div>

      {/* Floating Center Autocomplete Dropdown Overlay (Exact match to oLK7KBr5ogcGwd2SxzuJCH.jpg) */}
      {query.trim().length > 0 && (
        <div
          style={{ transform: 'translate3d(-50%, 0, 35px)' }}
          className="absolute top-16 left-1/2 w-80 rounded-[24px] vision-glass-dark p-3 space-y-1.5 z-30 shadow-2xl border border-white/20"
        >
          {suggestions
            .filter((s) => s.toLowerCase().includes(query.toLowerCase()))
            .map((item, idx) => (
              <button
                key={item}
                onClick={() => onChangeQuery(item)}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-white/15 flex items-center gap-2.5 text-left text-[12.5px]"
              >
                <Search className="w-3.5 h-3.5 text-white/50" />
                <span>
                  <strong className="text-white">{query}</strong>
                  <span className="text-white/75">
                    {item.slice(query.length)}
                  </span>
                </span>
                {idx === 2 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 ml-auto" />
                )}
              </button>
            ))}
        </div>
      )}

      {/* Background Discover & Suggested Bento */}
      <div className="my-auto space-y-5 opacity-85">
        <div>
          <div className="text-xs font-bold text-white/75 mb-2">Discover</div>
          <div className="grid grid-cols-3 gap-3">
            {['movies', 'sports', 'games', 'astronomy', 'spatial design', '3d models'].map(
              (topic) => (
                <button
                  key={topic}
                  onClick={() => onChangeQuery(topic)}
                  className="h-10 rounded-2xl bg-white/15 hover:bg-white/25 flex items-center justify-center gap-2 text-xs font-semibold"
                >
                  <Search className="w-3.5 h-3.5 text-white/70" />
                  <span>{topic}</span>
                </button>
              )
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-white/75 mb-2">Suggested</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-28 rounded-[24px] bg-gradient-to-r from-blue-950 to-indigo-900 p-4 flex flex-col justify-between border border-white/15">
              <span className="text-[10px] uppercase tracking-wider text-sky-300 font-bold">
                OUR FAVORITES
              </span>
              <div className="text-sm font-bold">
                The Best Apps for Apple Vision Pro
              </div>
            </div>
            <div className="h-28 rounded-[24px] bg-gradient-to-r from-rose-500 to-orange-500 p-4 flex items-center justify-between border border-white/15">
              <div className="text-sm font-bold">Spatial Entertainment</div>
              <span className="text-4xl"><Glyph e="🍿" /></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 4. SIRI AI SPATIAL ASSISTANT + 3D REFRACTIVE GLASS ORB (Exact replica of images (1).jpg & download.htm)
export const SiriAISpatialApp: React.FC = () => {
  const [query, setQuery] = useState(
    'Remind me what Silo is about and when I can watch the premiere'
  );
  const [visualIntelActive, setVisualIntelActive] = useState(false);

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 text-white relative preserve-3d">
      {/* Top User Query Bubble */}
      <div className="flex justify-end">
        <div className="max-w-xs px-4 py-2 rounded-2xl bg-white/20 border border-white/25 text-[12.5px] font-medium text-white/95 shadow">
          &ldquo;{query}&rdquo;
        </div>
      </div>

      {/* Main Siri AI Contextual Response + Silo Apple TV+ Card (Exact match to images (1).jpg) */}
      <div className="my-2 space-y-3 text-[13px] leading-relaxed text-white/95">
        {!visualIntelActive ? (
          <>
            <p>
              <strong>Silo</strong> is a sci-fi drama series set in a dystopian
              future where thousands of people live in a giant, 144-level
              underground silo to survive a toxic outside world. The story
              follows Juliette Nichols, an engineer who begins to uncover
              shocking secrets about the silo&apos;s history and true purpose.
            </p>
            <p className="text-white/80 text-[12px]">
              The Season 3 premiere is scheduled for Friday, July 3, 2026. You
              have a few work events that day, but your evening is currently
              free after 5:30 PM, so you should be available to watch it!
            </p>

            {/* SILO Apple TV+ Preview Card */}
            <div className="h-28 rounded-[22px] bg-gradient-to-r from-stone-800 via-stone-700 to-stone-900 border border-white/20 p-4 flex items-end justify-between relative overflow-hidden shadow-lg">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/70">
                  tv+ Sci-Fi Drama
                </div>
                <div className="text-2xl font-black tracking-[0.25em]">SILO</div>
              </div>
              <button
                onClick={() => spatialSound.playPinchTap()}
                className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
            </div>
          </>
        ) : (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-400/35 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              <Glyph e="👁️" /> Visual Intelligence Active (visionOS 27)
            </div>
            <p className="text-xs text-white/90">
              Siri sees your physical room and active 3D volumes: The{' '}
              <strong>Lövbacken 90cm table</strong> fits with 42cm clearance in
              front of your sofa, and your hiking gear pack has 14L remaining
              capacity.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Prompt Input + Visual Intelligence Toggle */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask Siri AI anything..."
          className="flex-1 h-9 rounded-full bg-black/35 border border-white/20 px-4 text-xs text-white focus:outline-none"
        />
        <button
          onClick={() => {
            spatialSound.playSiriChime();
            setVisualIntelActive(!visualIntelActive);
          }}
          className={`px-3 h-9 rounded-full text-xs font-semibold transition ${
            visualIntelActive
              ? 'bg-emerald-400 text-black'
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
        >
          Visual AI
        </button>
      </div>

      {/* FLOATING 3D REFRACTIVE GLASS SIRI ORB HOVERING BELOW WINDOW + TABLE CAUSTIC GLOW (images (1).jpg) */}
      <div
        onClick={() => spatialSound.playSiriChime()}
        style={{ transform: 'translate3d(-50%, 92px, 90px)' }}
        className="absolute bottom-0 left-1/2 flex flex-col items-center cursor-pointer group preserve-3d"
      >
        <div className="w-16 h-16 rounded-full bg-[radial-gradient(circle_at_50%_30%,#ffffff_0%,rgba(255,235,200,0.85)_25%,rgba(160,130,100,0.45)_62%,rgba(255,255,255,0.35)_100%)] border border-white/60 shadow-[0_12px_35px_rgba(255,215,150,0.55),inset_0_2px_12px_rgba(255,255,255,0.95)] group-hover:scale-110 transition-transform" />
        {/* Warm Table Caustic Spotlight Reflection Below the Orb */}
        <div className="w-24 h-6 bg-amber-200/45 blur-xl rounded-full mt-3" />
      </div>
    </div>
  );
};

// 5. QUICK LOOK USDZ INSPECTOR (Exact replica of quick_look__d7qy16ralfcm_large.jpg: Chair_V3.usdz)
export const QuickLookUSDZApp: React.FC = () => {
  const [shaderMode, setShaderMode] = useState<QuickLookShaderMode>('wireframe');
  const [popoverOpen, setPopoverOpen] = useState(true);
  const [scalePct, setScalePct] = useState(100);

  const modes: { id: QuickLookShaderMode; label: string; badge: string }[] = [
    { id: 'original', label: 'Original', badge: '🧊' },
    { id: 'plain', label: 'Plain', badge: '⚪' },
    { id: 'wireframe', label: 'Wireframe', badge: '🌐' },
    { id: 'uv', label: 'UV', badge: '🌈' },
  ];

  return (
    <div className="w-full h-full flex flex-col items-center justify-between p-4 text-white relative preserve-3d">
      {/* Interactive 3D Chair_V3.usdz Mesh */}
      <div
        style={{ transform: `scale(${scalePct / 100}) translateZ(45px)` }}
        className="w-full flex-1 relative transition-transform"
      >
        <QuickLookChairCanvas shaderMode={shaderMode} />
      </div>

      {/* Material Override Popover (Original | Plain | Wireframe | UV from quick_look__d7qy16ralfcm_large.jpg) */}
      {popoverOpen && (
        <div
          style={{ transform: 'translateZ(65px)' }}
          className="mb-2.5 px-4 py-3 rounded-[26px] vision-ornament flex items-center gap-3 shadow-2xl"
        >
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                spatialSound.playPinchTap();
                setShaderMode(m.id);
              }}
              className={`w-16 py-2 rounded-2xl flex flex-col items-center gap-1 transition ${
                shaderMode === m.id
                  ? 'bg-white/25 border border-white/40 shadow'
                  : 'hover:bg-white/10'
              }`}
            >
              <span className="text-xl"><Glyph e={m.badge} /></span>
              <span className="text-[11px] font-medium">{m.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bottom Quick Look Floating Pill Toolbar */}
      <div
        style={{ transform: 'translateZ(65px)' }}
        className="h-12 px-4 rounded-full vision-ornament flex items-center gap-3 text-xs font-medium"
      >
        <button
          onClick={() => setScalePct(scalePct === 100 ? 115 : 100)}
          className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-2 pr-2">
          <span className="w-6 h-6 rounded-md bg-[#0A84FF] flex items-center justify-center text-xs">
            <Glyph e="📁" />
          </span>
          <span className="font-semibold">Chair_V3.usdz</span>
        </div>

        <span className="px-2.5 py-1 rounded-full bg-white/15 font-semibold">
          {scalePct}%
        </span>

        <button
          onClick={() => setPopoverOpen(!popoverOpen)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
            popoverOpen ? 'bg-white text-black' : 'bg-white/15 text-white'
          }`}
          title="Toggle Material Override Shader Popover"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        <button className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center">
          <Box className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center">
          <Share className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// 6. HELLO WORLD — PLANET EARTH 3D VOLUME & EDUCATIONAL PANEL (Exact replica of Hello-World-intro@2x.png)
export const PlanetEarthVolumeApp: React.FC = () => {
  const [globeMode, setGlobeMode] = useState<EarthGlobeMode>('daylight');

  return (
    <div className="w-full h-full grid grid-cols-12 items-center gap-4 p-4 text-white preserve-3d">
      {/* Left Interactive 3D Earth Volume Floating in Room Space */}
      <div
        style={{ transform: 'translateZ(55px)' }}
        className="col-span-5 h-full flex flex-col items-center justify-center relative"
      >
        <div className="w-full h-[300px]">
          <PlanetEarth3DCanvas mode={globeMode} />
        </div>

        <span className="px-2.5 py-0.5 rounded-full bg-black/45 text-[11px] font-medium text-white/85 -mt-1">
          Rotate
        </span>

        {/* 4-Icon Mode Pill (Sun | Orbit | Axial Rotation | Clouds from Hello-World-intro@2x.png) */}
        <div className="mt-2 h-10 px-2.5 rounded-full vision-ornament flex items-center gap-2">
          {[
            { id: 'daylight', icon: Sun, title: 'Sunlight & Day/Night' },
            { id: 'orbit', icon: Orbit, title: 'Satellite Orbit' },
            { id: 'rotation', icon: RotateCw, title: '24h Axial Spin' },
            { id: 'clouds', icon: Cloud, title: 'Cloud Atmosphere' },
          ].map((item) => {
            const Icon = item.icon;
            const active = globeMode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  spatialSound.playPinchTap();
                  setGlobeMode(item.id as EarthGlobeMode);
                }}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                  active
                    ? 'bg-white text-black shadow'
                    : 'text-white/80 hover:bg-white/15'
                }`}
                title={item.title}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Glass Educational Panel ("A Day in the Life — Planet Earth") */}
      <div className="col-span-7 h-full rounded-[32px] vision-glass p-7 flex flex-col justify-between">
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[15px] font-semibold text-white/90">
            A Day in the Life
          </span>
        </div>

        <div className="space-y-3 my-auto">
          <h2 className="text-[32px] font-extrabold tracking-tight">
            Planet Earth
          </h2>
          <p className="text-[12.5px] leading-relaxed text-white/85">
            You can&apos;t feel it, but Earth is constantly in motion. All
            planets spin on an invisible axis: ours makes one full turn every 24
            hours, bringing days and nights to our home.
          </p>
          <p className="text-[12.5px] leading-relaxed text-white/85">
            When your part of the world faces the Sun, it&apos;s daytime; when
            it rotates away, we move into night. When you see a sunrise or
            sunset, you&apos;re witnessing the Earth in motion.
          </p>
          <p className="text-[12.5px] leading-relaxed text-white/85">
            Want to explore Earth&apos;s rotation and axial tilt? Check out our
            interactive 3D globe and be hands-on with Earth&apos;s movements.
          </p>
        </div>

        <div>
          <button
            onClick={() =>
              setGlobeMode(globeMode === 'rotation' ? 'daylight' : 'rotation')
            }
            className="px-5 py-2 rounded-full bg-white text-black font-semibold text-xs hover:scale-105 transition shadow"
          >
            View Globe
          </button>
        </div>
      </div>
    </div>
  );
};

interface CameraBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ObjectCandidate {
  label: string;
  confidence: number;
  box: CameraBox;
}

interface TrackedCameraObject extends ObjectCandidate {
  id: number;
  missedFrames: number;
}

function boxIoU(a: CameraBox, b: CameraBox) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function associateCameraTracks(
  candidates: ObjectCandidate[],
  previous: TrackedCameraObject[],
  nextId: number
) {
  const matchedIds = new Set<number>();
  const current = candidates.map((candidate) => {
    let best: TrackedCameraObject | null = null;
    let bestOverlap = 0.12;
    for (const prior of previous) {
      if (matchedIds.has(prior.id) || prior.label !== candidate.label) continue;
      const overlap = boxIoU(prior.box, candidate.box);
      if (overlap > bestOverlap) {
        best = prior;
        bestOverlap = overlap;
      }
    }
    const id = best?.id ?? nextId++;
    matchedIds.add(id);
    return { ...candidate, id, missedFrames: 0 };
  });

  const brieflyOccluded = previous
    .filter((prior) => !matchedIds.has(prior.id) && prior.missedFrames < 2)
    .map((prior) => ({ ...prior, missedFrames: prior.missedFrames + 1 }));

  return { tracks: [...current, ...brieflyOccluded].slice(0, 8), nextId };
}

function drawObjectTracks(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  objects: TrackedCameraObject[]
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height || !video.videoWidth || !video.videoHeight) return;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  // Match object-fit: cover so detections line up with the visible camera crop.
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const offsetX = (width - video.videoWidth * scale) / 2;
  const offsetY = (height - video.videoHeight * scale) / 2;
  const colors = ['#7cf5d2', '#7dd3fc', '#c4b5fd', '#f9a8d4', '#fcd34d'];

  objects.forEach((object) => {
    const color = colors[object.id % colors.length];
    const x = object.box.x * scale + offsetX;
    const y = object.box.y * scale + offsetY;
    const boxWidth = object.box.width * scale;
    const boxHeight = object.box.height * scale;
    const alpha = object.missedFrames ? 0.48 : 1;

    // 3D Perspective Box Calculations
    const cx = x + boxWidth / 2;
    const cy = y + boxHeight / 2;
    const depthScale = 0.22;
    const dx = (cx - width / 2) * 0.12;
    const dy = (cy - height / 2) * 0.12 - boxHeight * depthScale;
    const bx = x + dx;
    const by = y + dy;
    const bw = boxWidth * (1 - depthScale * 0.5);
    const bh = boxHeight * (1 - depthScale * 0.5);

    context.save();
    context.globalAlpha = alpha;

    // 1. Ground Radar Footprint
    context.save();
    context.beginPath();
    context.ellipse(cx, y + boxHeight + 10, boxWidth * 0.42, 7, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(0, 245, 212, 0.14)';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = color;
    context.setLineDash([3, 3]);
    context.stroke();
    context.restore();

    // 2. Back Face Rectangle (dashed)
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = alpha * 0.45;
    context.lineWidth = 1.5;
    context.setLineDash([3, 3]);
    context.strokeRect(bx, by, bw, bh);
    context.restore();

    // 3. 4 Connecting 3D Depth Lines
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = alpha * 0.6;
    context.lineWidth = 1.5;
    context.setLineDash([2, 2]);
    context.beginPath(); context.moveTo(x, y); context.lineTo(bx, by); context.stroke();
    context.beginPath(); context.moveTo(x + boxWidth, y); context.lineTo(bx + bw, by); context.stroke();
    context.beginPath(); context.moveTo(x + boxWidth, y + boxHeight); context.lineTo(bx + bw, by + bh); context.stroke();
    context.beginPath(); context.moveTo(x, y + boxHeight); context.lineTo(bx, by + bh); context.stroke();
    context.restore();

    // 4. Front Face Rectangle
    context.strokeStyle = color;
    context.lineWidth = 2.2;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.shadowBlur = 0;

    // 5. 8 Corner Reticles
    const bLen = Math.min(16, Math.min(boxWidth, boxHeight) * 0.25);
    context.lineWidth = 3.5;
    context.strokeStyle = '#ffffff';
    context.beginPath(); context.moveTo(x, y + bLen); context.lineTo(x, y); context.lineTo(x + bLen, y); context.stroke();
    context.beginPath(); context.moveTo(x + boxWidth - bLen, y); context.lineTo(x + boxWidth, y); context.lineTo(x + boxWidth, y + bLen); context.stroke();
    context.beginPath(); context.moveTo(x + boxWidth, y + boxHeight - bLen); context.lineTo(x + boxWidth, y + boxHeight); context.lineTo(x + boxWidth - bLen, y + boxHeight); context.stroke();
    context.beginPath(); context.moveTo(x + bLen, y + boxHeight); context.lineTo(x, y + boxHeight); context.lineTo(x, y + boxHeight - bLen); context.stroke();

    // 6. 3D Spatial Tag Pill
    const estDepth = Math.max(0.4, (650 * 0.3) / Math.max(20, boxHeight));
    const label = `${object.label.toUpperCase()} · ${estDepth.toFixed(2)}m · ${Math.round(object.confidence * 100)}%`;
    context.font = '600 11px system-ui, sans-serif';
    const labelWidth = context.measureText(label).width + 18;
    const labelY = Math.max(26, y - 9);
    context.fillStyle = 'rgba(8, 15, 24, 0.9)';
    context.beginPath();
    context.roundRect(x, labelY - 20, labelWidth, 24, 8);
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = color;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.fillText(label, x + 9, labelY - 4);
    context.restore();
  });
}

// Live on-device camera detection. This produces real image-space detections and
// stable visual track IDs; physical 6DoF object anchors require a native object-tracking API.
export const ObjectTrackingApp: React.FC<{ xrSessionActive?: boolean }> = ({ xrSessionActive = false }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const sessionTokenRef = useRef(0);
  const previousTracksRef = useRef<TrackedCameraObject[]>([]);
  const nextTrackIdRef = useRef(1);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objects, setObjects] = useState<TrackedCameraObject[]>([]);

  const stopTracking = useCallback(() => {
    sessionTokenRef.current += 1;
    activeRef.current = false;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    try {
      detectorRef.current?.close?.();
    } catch {
      // The task may already be closed after a failed model initialization.
    }
    detectorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    previousTracksRef.current = [];
    setObjects([]);
    setTracking(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (xrSessionActive) stopTracking();
  }, [xrSessionActive, stopTracking]);

  useEffect(() => () => {
    sessionTokenRef.current += 1;
    activeRef.current = false;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    detectorRef.current?.close?.();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startTracking = async () => {
    if (xrSessionActive) return;
    stopTracking();
    const token = sessionTokenRef.current;
    setError(null);
    setLoading(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (token !== sessionTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('The live camera preview is unavailable.');
      video.srcObject = stream;
      await video.play();
      if (token !== sessionTokenRef.current) return;

      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
      );
      const modelAssetPath =
        'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite';
      let detector: any;
      try {
        detector = await vision.ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: 'GPU' },
          runningMode: 'VIDEO',
          scoreThreshold: 0.42,
          maxResults: 5,
        });
      } catch {
        detector = await vision.ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: 'CPU' },
          runningMode: 'VIDEO',
          scoreThreshold: 0.42,
          maxResults: 5,
        });
      }
      if (token !== sessionTokenRef.current) {
        detector.close();
        return;
      }

      detectorRef.current = detector;
      activeRef.current = true;
      setTracking(true);
      setLoading(false);
      let lastInferenceAt = 0;
      let lastVideoTime = -1;
      const detectFrame = (now: number) => {
        if (!activeRef.current) return;
        animationFrameRef.current = requestAnimationFrame(detectFrame);
        const currentVideo = videoRef.current;
        const canvas = overlayRef.current;
        if (!currentVideo || !canvas || currentVideo.readyState < 2 || !detectorRef.current) return;
        if (now - lastInferenceAt < 110 || currentVideo.currentTime === lastVideoTime) return;

        lastInferenceAt = now;
        lastVideoTime = currentVideo.currentTime;
        try {
          const result = detectorRef.current.detectForVideo(currentVideo, now);
          const candidates: ObjectCandidate[] = (result.detections || []).flatMap((detection: any) => {
            const box = detection.boundingBox;
            if (!box) return [];
            const category = detection.categories?.[0];
            return [{
              label: category?.displayName || category?.categoryName || 'Object',
              confidence: category?.score ?? 0,
              box: { x: box.originX, y: box.originY, width: box.width, height: box.height },
            }];
          });
          const associated = associateCameraTracks(
            candidates,
            previousTracksRef.current,
            nextTrackIdRef.current
          );
          previousTracksRef.current = associated.tracks;
          nextTrackIdRef.current = associated.nextId;
          setObjects(associated.tracks);
          drawObjectTracks(canvas, currentVideo, associated.tracks);
        } catch (detectionError) {
          stopTracking();
          setError(detectionError instanceof Error ? detectionError.message : 'Object detection stopped unexpectedly.');
        }
      };
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    } catch (startError) {
      const message = startError instanceof Error
        ? startError.message
        : 'Camera or object detector could not start. Allow camera access and try again.';
      setError(message);
      stopTracking();
    } finally {
      if (token === sessionTokenRef.current) setLoading(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[inherit] bg-[#07111b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(30,120,145,0.24),transparent_62%),linear-gradient(145deg,#0b1722,#05090f)]" />
      {tracking && (
        <>
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={overlayRef} className="absolute inset-0 h-full w-full pointer-events-none" />
        </>
      )}

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2 w-2 rounded-full ${tracking ? 'animate-pulse bg-emerald-300' : 'bg-white/35'}`} />
            Live Object Tracking
          </div>
          <p className="mt-0.5 text-[10px] text-white/55">On-device camera detection · image-space tracks</p>
        </div>
        {tracking ? (
          <button onClick={stopTracking} className="shrink-0 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/20">
            Stop tracking
          </button>
        ) : (
          <button
            onClick={() => void startTracking()}
            disabled={loading || xrSessionActive}
            className="shrink-0 rounded-full bg-emerald-300 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Starting detector…' : 'Start real detection'}
          </button>
        )}
      </header>

      {!tracking && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pt-14 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] border border-cyan-200/30 bg-cyan-300/10 text-4xl shadow-[0_0_55px_rgba(45,212,191,0.16)]">⌖</div>
          <h2 className="text-xl font-semibold tracking-tight">Find objects in your camera view</h2>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-white/60">
            Detects common real objects on-device, draws live camera bounds, and keeps a visual track ID as each object moves.
          </p>
          {xrSessionActive ? (
            <p className="mt-4 max-w-md rounded-2xl border border-amber-200/20 bg-amber-200/10 px-4 py-3 text-[11px] leading-relaxed text-amber-100/90">
            Exit immersive AR before starting this detector. This page uses a separate camera stream; raw camera access inside the XR session is not enabled here.
            </p>
          ) : (
            <p className="mt-4 text-[10px] text-white/40">Camera permission is requested only after you press Start.</p>
          )}
        </div>
      )}

      {tracking && (
        <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end justify-between gap-3 sm:bottom-5 sm:left-5 sm:right-5">
          <div className="vision-ornament rounded-2xl px-3 py-2 text-[10px] text-white/75">
            {objects.length ? `${objects.filter((object) => object.missedFrames === 0).length} visible · ${objects.length} tracked` : 'Scanning for common objects…'}
          </div>
          <div className="vision-ornament max-w-[60%] rounded-2xl px-3 py-2 text-right text-[9px] leading-relaxed text-white/55">
            Visual 2D tracking only. Metric 3D pose needs a trained reference object and a native object-tracking API.
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-rose-200/20 bg-rose-950/80 px-4 py-3 text-[11px] text-rose-100 backdrop-blur-xl">
          {error}
          <button onClick={() => setError(null)} className="ml-3 font-bold text-white/65">Dismiss</button>
        </div>
      )}
    </div>
  );
};

// 8. ULTRAWIDE CURVED 32:9 MAC VIRTUAL DISPLAY (Exact replica of Apple-WWDC24-visionOS-2-Mac-Virtual-Display-240610_big.webp.large_2x.jpg)
export const MacVirtualDisplayApp: React.FC = () => {
  const [curveIntensity, setCurveIntensity] = useState<'ultrawide' | 'wide'>('ultrawide');

  return (
    <div className="w-full h-full flex flex-col justify-between rounded-[32px] overflow-hidden bg-gradient-to-br from-[#1f4f91] via-[#276d62] to-[#32964d] text-white border border-white/30 shadow-[0_40px_120px_rgba(0,0,0,0.85)] relative">
      {/* Top macOS Menu Bar */}
      <div className="h-6 bg-black/45 backdrop-blur-md px-4 flex items-center justify-between text-[11px] font-medium">
        <div className="flex items-center gap-3.5">
          <span className="font-bold"></span>
          <span className="font-bold">DaVinci Resolve Studio</span>
          <span className="text-white/80">File</span>
          <span className="text-white/80">Edit</span>
          <span className="text-white/80">Trim</span>
          <span className="text-white/80">Timeline</span>
          <span className="text-white/80">Color</span>
          <span className="text-white/80">Playback</span>
        </div>
        <div className="flex items-center gap-3 text-white/85">
          <button
            onClick={() =>
              setCurveIntensity(curveIntensity === 'ultrawide' ? 'wide' : 'ultrawide')
            }
            className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-semibold"
          >
            Display: {curveIntensity === 'ultrawide' ? '32:9 Curved Ultrawide' : '16:9 Studio'}
          </button>
          <span>Mon Jun 10 9:41 AM</span>
        </div>
      </div>

      {/* 3-Column Panoramic Pro Production Desktop */}
      <div className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* Left: Pages "Narrative Films Postproduction Planning" + RGB Waveform Scope */}
        <div className="col-span-3 flex flex-col gap-2.5">
          <div className="flex-1 rounded-xl bg-[#FDF4F5] text-stone-900 p-4 shadow-xl overflow-hidden relative">
            <div className="text-[15px] font-extrabold text-rose-600 leading-tight">
              Narrative Films
              <br />
              <span className="font-normal text-[12px]">Postproduction Planning</span>
            </div>
            <div className="mt-3 space-y-1.5 text-[9.5px] text-stone-600">
              <p>• Offline Rough Cut Assembly &amp; Color Lut Pass</p>
              <p>• Spatial Audio Dolby Atmos 7.1.4 Stem Mix</p>
              <p>• EXR 16-bit ACEScg Node Graph Delivery</p>
              <p>• Final Mastering for Apple Vision Pro Theater</p>
            </div>
          </div>

          {/* RGB Parade Waveform & Vectorscope Window */}
          <div className="h-28 rounded-xl bg-[#121316] border border-white/15 p-2.5 grid grid-cols-2 gap-2 shadow-xl">
            <div className="rounded bg-black flex items-end p-1 gap-0.5">
              {[45, 80, 60, 95, 70, 50, 85, 65].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className="flex-1 bg-gradient-to-t from-blue-500 via-emerald-400 to-rose-500 opacity-80 rounded-t"
                />
              ))}
            </div>
            <div className="rounded bg-black flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border border-amber-500/40 flex items-center justify-center">
                <div className="w-6 h-1 bg-amber-400 rotate-45 blur-[1px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Center: DaVinci Resolve Studio Color Grading Suite & Primary Wheels */}
        <div className="col-span-6 rounded-xl bg-[#18181b] border border-white/15 p-3 flex flex-col justify-between shadow-2xl">
          <div className="flex-1 grid grid-cols-12 gap-2 overflow-hidden">
            {/* Program Monitor */}
            <div className="col-span-8 rounded-lg bg-gradient-to-br from-amber-900/60 via-stone-900 to-emerald-950 flex flex-col items-center justify-center relative overflow-hidden border border-white/10">
              <span className="text-5xl"><Glyph e="🎬👩🏾‍🦱✨" /></span>
              <span className="text-[10px] text-amber-200/80 mt-2 font-mono">
                01:00:08:19 • ACEScct 4K DCI
              </span>
            </div>
            {/* Node Graph */}
            <div className="col-span-4 rounded-lg bg-[#111113] p-2 flex flex-col justify-center gap-2 border border-white/5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="px-2 py-1.5 rounded bg-stone-800 border border-amber-400/50 text-[9px] flex items-center justify-between"
                >
                  <span>0{n} CST Grade</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Primary Color Wheels Bar */}
          <div className="h-24 mt-2 pt-2 border-t border-white/10 grid grid-cols-4 gap-2 items-center">
            {['Lift', 'Gamma', 'Gain', 'Offset'].map((wheel) => (
              <div key={wheel} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full border-2 border-stone-600 bg-[conic-gradient(from_0deg,#ff453a,#ffd60a,#32d74b,#0a84ff,#bf5af2,#ff453a)] p-1 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                </div>
                <span className="text-[9px] text-white/60 mt-1">{wheel}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Finder Raw Takes Grid + Numbers Scene List Spreadsheet */}
        <div className="col-span-3 flex flex-col gap-2.5">
          <div className="flex-1 rounded-xl bg-[#1e1f24]/95 border border-white/15 p-2.5 grid grid-cols-4 gap-1.5 overflow-hidden shadow-xl">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded bg-stone-800 p-1 flex flex-col items-center justify-center text-[8px] text-white/75"
              >
                <span><Glyph e="🎞️" /></span>
                <span className="truncate w-full text-center mt-0.5">
                  A00{idx + 1}.mov
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 rounded-xl bg-white text-stone-900 p-2.5 overflow-hidden shadow-xl">
            <div className="text-[10px] font-bold text-emerald-700 mb-1">
              Scene List with Editing Time Stamps
            </div>
            <div className="space-y-1 text-[8.5px]">
              {[
                ['Scene 01', '00:01:20', 'Approved', 'Locked'],
                ['Scene 02', '00:04:15', 'Color Pass', 'VFX'],
                ['Scene 03', '00:08:42', 'Audio Mix', 'Ready'],
                ['Scene 04', '00:12:05', 'Final Cut', 'Locked'],
              ].map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 bg-emerald-50 px-1.5 py-0.5 rounded"
                >
                  {row.map((cell, j) => (
                    <span key={j} className="truncate">
                      {cell}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom macOS Dock */}
      <div className="pb-1.5 flex justify-center">
        <div className="px-3 py-1 rounded-2xl bg-white/25 backdrop-blur-xl border border-white/30 flex items-center gap-2 shadow-lg">
          {['', '', '', '', '', '', '', '', '', '', '', ''].map(
            (ic, idx) => (
              <button
                key={idx}
                onClick={() => spatialSound.playPinchTap()}
                className="w-6 h-6 rounded-lg bg-white/20 hover:scale-125 transition flex items-center justify-center text-xs"
              >
                <Glyph e={ic} />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
