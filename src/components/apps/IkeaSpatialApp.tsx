import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Share,
  Heart,
  Plus,
  Minus,
  Box,
  Rotate3d,
  X,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react';
import { Lovbacken3DCanvas } from '../three/SpatialThreeCanvas';
import { spatialSound } from '../../utils/spatialSound';

import { Glyph } from '../shell/Glyph';
interface IkeaSpatialAppProps {
  onPreviewInSpace: () => void;
}

export const IkeaSpatialApp: React.FC<IkeaSpatialAppProps> = ({ onPreviewInSpace }) => {
  const [view, setView] = useState<'catalog' | 'detail' | 'room-bento'>('detail');
  const [isLeavingView, setIsLeavingView] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isPopOut3D, setIsPopOut3D] = useState(false);
  const [isClosingPopOut, setIsClosingPopOut] = useState(false);
  const [isDissolvingForAR, setIsDissolvingForAR] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [liked, setLiked] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [activeHotspot, setActiveHotspot] = useState<string | null>('morbylanga');
  const viewTransitionTimerRef = useRef<number | null>(null);
  const popOutTimerRef = useRef<number | null>(null);
  const arDissolveTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (viewTransitionTimerRef.current !== null) window.clearTimeout(viewTransitionTimerRef.current);
    if (popOutTimerRef.current !== null) window.clearTimeout(popOutTimerRef.current);
    if (arDissolveTimerRef.current !== null) window.clearTimeout(arDissolveTimerRef.current);
  }, []);

  const transitionToView = (nextView: typeof view) => {
    if (nextView === view || isLeavingView) return;
    setIsLeavingView(true);
    viewTransitionTimerRef.current = window.setTimeout(() => {
      setView(nextView);
      setIsLeavingView(false);
      viewTransitionTimerRef.current = null;
    }, 150);
  };

  const openPopOut3D = () => {
    if (popOutTimerRef.current !== null) window.clearTimeout(popOutTimerRef.current);
    popOutTimerRef.current = null;
    setIsClosingPopOut(false);
    setIsPopOut3D(true);
    spatialSound.playPinchTap();
  };

  const closePopOut3D = () => {
    if (!isPopOut3D || isClosingPopOut) return;
    setIsClosingPopOut(true);
    spatialSound.playPinchTap();
    popOutTimerRef.current = window.setTimeout(() => {
      setIsPopOut3D(false);
      setIsClosingPopOut(false);
      popOutTimerRef.current = null;
    }, 360);
  };

  const triggerARPreviewInSpace = () => {
    spatialSound.playPinchTap();
    setIsDissolvingForAR(true);
    // Start WebXR in the original click stack so the browser keeps its user activation.
    onPreviewInSpace();
    if (arDissolveTimerRef.current !== null) window.clearTimeout(arDissolveTimerRef.current);
    arDissolveTimerRef.current = window.setTimeout(() => {
      setIsDissolvingForAR(false);
      arDissolveTimerRef.current = null;
    }, 760);
  };

  const categories = [
    'All',
    'Bedroom',
    'Living room',
    'Kitchen',
    'Workspace',
    'Bathroom',
    'Dining',
    'Laundry',
  ];

  const products = [
    {
      id: 'knarrevik',
      name: 'Knarrevik',
      desc: 'Side table, stone, 42x28 cm',
      price: 53,
      rating: 4,
      img: 'stone-pedestal',
    },
    {
      id: 'lovbacken',
      name: 'Lövbacken',
      desc: 'Coffee table, concrete, 90 cm',
      price: 149,
      rating: 4,
      img: 'blue-ribbed',
    },
    {
      id: 'ekenaset',
      name: 'Ekenäset',
      desc: 'Armchair, oak',
      price: 30,
      rating: 4,
      img: 'oak-chair',
    },
    {
      id: 'skruvby',
      name: 'Skruvby',
      desc: 'Bedside table, blue, 30x38 cm',
      price: 50,
      rating: 4,
      img: 'blue-cabinet',
    },
  ];

  return (
    <div className="w-full h-full relative preserve-3d">
      {/* Frosted Window Dissolve Transition Overlay (00:01 of original-0ce5b...mp4) */}
      {isDissolvingForAR && (
        <div aria-hidden="true" className="absolute inset-0 z-50 rounded-[38px] ikea-ar-dissolve" />
      )}

      {/* 3D Volume Pop-Out Overlay in Front of Dimmed Window (00:05-00:11 of original-d56ab...mp4) */}
      {isPopOut3D && (
        <div
          style={{ transform: 'translate3d(0, 0, 160px)' }}
          className={`absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-auto preserve-3d ${isClosingPopOut ? 'ikea-volume-exit' : 'ikea-volume-enter'}`}
        >
          <div
            style={{
              width: 'min(520px, calc(100vw - 56px))',
              maxHeight: 'min(390px, calc(100dvh - 180px))',
              aspectRatio: '4 / 3',
            }}
            className={`drop-shadow-[0_45px_75px_rgba(0,0,0,0.85)] ${isClosingPopOut ? 'ikea-volume-model-exit' : 'ikea-volume-model-enter'}`}
          >
            <Lovbacken3DCanvas mode="popout" />
          </div>
          <button
            onClick={() => {
              closePopOut3D();
            }}
            disabled={isClosingPopOut}
            className="vision-btn mt-2 px-5 py-2 rounded-full vision-ornament flex items-center gap-2 text-[13px] font-semibold text-white shadow-xl"
          >
            <span>Close preview</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* VIEW 1: LÖVBACKEN SPLIT-PANE PRODUCT DETAIL (Exact match to still-b5f564c5b0939789a9dee198fb7fd037.webp) */}
      {view === 'detail' && (
        <div
          className={`w-full h-full grid grid-cols-12 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isLeavingView ? 'ikea-scene-leave' : 'ikea-scene-enter'} ${
            isPopOut3D ? 'opacity-30 blur-md scale-[0.98]' : 'opacity-100'
          }`}
        >
          {/* Left Pane: Warm Stone-Gray 3D Studio Viewport (#C9C7C3) */}
          <div className="col-span-7 bg-[#CBC9C5] text-stone-900 relative flex flex-col justify-between p-6 overflow-hidden">
            {/* Interactive 3D Lövbacken Table */}
            <div className="flex-1 w-full relative flex items-center justify-center">
              <Lovbacken3DCanvas mode="embedded" />

              {/* Curved Orbit Track + 3D Pop-Out Button Beneath Table */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <div className="w-48 h-4 border-b border-stone-400/60 rounded-b-full" />
                <button
                  onClick={() => {
                    openPopOut3D();
                  }}
                  className="vision-btn -mt-3.5 w-8 h-8 rounded-full bg-stone-600/60 hover:bg-stone-800 text-white flex items-center justify-center shadow"
                  title="Pop out 3D Volume in front of window"
                >
                  <Rotate3d className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bottom Controls: "Preview in your space" Pill + < > Gallery Arrows */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={triggerARPreviewInSpace}
                className="vision-btn h-10 px-4 rounded-full bg-stone-700/55 hover:bg-stone-800/80 text-white text-[13px] font-medium flex items-center gap-2 shadow-sm backdrop-blur-md"
              >
                <Box className="w-4 h-4" />
                <span>Preview in your space</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={openPopOut3D}
                  className="w-9 h-9 rounded-full bg-stone-700/45 hover:bg-stone-800/75 text-white flex items-center justify-center transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={openPopOut3D}
                  className="w-9 h-9 rounded-full bg-stone-700/45 hover:bg-stone-800/75 text-white flex items-center justify-center transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Pane: Translucent Spatial Frosted Glass Product Details */}
          <div className="col-span-5 p-7 flex flex-col justify-between text-white overflow-y-auto">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  spatialSound.playPinchTap();
                  transitionToView('catalog');
                }}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
                title="Back to Get Inspired Catalog"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => spatialSound.playPinchTap()}
                  className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
                >
                  <Share className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setLiked(!liked);
                    spatialSound.playPinchTap();
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                    liked ? 'bg-rose-500 text-white' : 'bg-white/15 hover:bg-white/25'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>

            {/* Title, Rating & Description */}
            <div className="my-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[26px] font-bold tracking-tight">Lövbacken</h2>
                <div className="text-[11px] text-white/75 flex items-center gap-1.5">
                  <span>12 reviews</span>
                  <span>•</span>
                  <span className="tracking-tighter text-white"><Glyph e="★★★★" /></span>
                  <span className="text-white/35"><Glyph e="★" /></span>
                </div>
              </div>
              <div className="text-[13px] text-white/75 mt-0.5">
                Coffee table, concrete, 90 cm
              </div>

              <p className="text-[12.5px] leading-relaxed text-white/80 mt-4">
                An organic shape and smooth finish of this concrete coffee table
                reflect nature&apos;s elegance. Made from lightweight, reinforced
                glass fibre concrete, it seamlessly blends durability with style.
              </p>

              <div className="flex justify-end mt-3">
                <span className="px-2.5 py-1 rounded-md bg-white/15 text-[10.5px] font-medium text-white/85">
                  Article Number: 903.031.06
                </span>
              </div>
            </div>

            {/* Expandable Specification Accordions */}
            <div className="divide-y divide-white/15 border-t border-b border-white/15 my-2">
              {[
                {
                  id: 'details',
                  label: 'Product details',
                  content:
                    'Reinforced glass fibre concrete tabletop with fluted royal-blue acoustic wood base.',
                },
                {
                  id: 'measurements',
                  label: 'Measurements',
                  content: 'Diameter: 90 cm (35.4") • Height: 42 cm (16.5") • Max load: 50 kg.',
                },
                {
                  id: 'delivery',
                  label: 'Delivery',
                  content: 'In stock for Spatial AR Preview & Next-Day Home Delivery.',
                },
                {
                  id: 'assembly',
                  label: 'Assembly instructions',
                  content: 'No tools required — concrete top locks onto pedestal base.',
                },
              ].map((acc) => (
                <div key={acc.id}>
                  <button
                    onClick={() => {
                      spatialSound.playPinchTap();
                      setOpenAccordion(openAccordion === acc.id ? null : acc.id);
                    }}
                    className="w-full py-2.5 flex items-center justify-between text-[13px] font-semibold text-white/90 hover:text-white"
                  >
                    <span>{acc.label}</span>
                    <Plus
                      className={`w-4 h-4 transition-transform ${
                        openAccordion === acc.id ? 'rotate-45' : ''
                      }`}
                    />
                  </button>
                  {openAccordion === acc.id && (
                    <div className="pb-2.5 text-[12px] text-white/70">
                      {acc.content}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom Quantity Stepper & Yellow Add to Cart Button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <div className="h-10 px-3 rounded-full bg-white/15 flex items-center gap-3.5 text-[13px] font-semibold">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="text-white/75 hover:text-white"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span>{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="text-white/75 hover:text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => {
                  setCartCount((c) => c + quantity);
                  spatialSound.playPinchTap();
                }}
                className="vision-btn h-10 px-6 rounded-full bg-[#FFD60A] hover:bg-[#ffe03b] text-black font-semibold text-[13px] shadow-md"
              >
                {cartCount > 0
                  ? `In Cart (${cartCount}) • $${149 * quantity}`
                  : `Add to cart ($${149 * quantity})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: GET INSPIRED CATALOG + ROOM HOTSPOT BENTO (Exact match to original-d56ab...mp4 00:00 & 00:16-00:22) */}
      {view === 'catalog' && (
        <div className={`w-full h-full overflow-y-auto p-6 space-y-6 text-white ${isLeavingView ? 'ikea-scene-leave' : 'ikea-scene-enter'}`}>
          {/* Blue Architectural Hero Banner (00:16 of original-d56ab...mp4) */}
          <div className="w-full h-[210px] rounded-[28px] bg-gradient-to-r from-[#124091] via-[#1c56b8] to-[#0f3478] p-8 flex items-center justify-between relative overflow-hidden shadow-lg border border-white/15 ikea-hero-arrive">
            <div className="z-10 max-w-sm">
              <h2 className="text-[28px] font-bold leading-tight">
                Add finishing touches
                <br />
                to your living room
              </h2>
              <p className="text-[13px] text-white/80 mt-1.5">
                Discover items that match your latest purchases
              </p>
              <button
                onClick={() => {
                  spatialSound.playPinchTap();
                  transitionToView('room-bento');
                }}
                className="mt-4 h-9 px-5 rounded-full bg-[#FFD60A] text-black font-semibold text-[13px] flex items-center gap-2 hover:scale-105 transition"
              >
                <span>Discover</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right 3D Blue Archway & Yellow Armchair Stage */}
            <div className="flex items-end gap-4 pr-6 z-10">
              <div className="w-28 h-40 rounded-t-full bg-[#0a275c] border border-white/10 flex items-center justify-center shadow-inner">
                <span className="text-4xl"><Glyph e="🪑" /></span>
              </div>
              <div className="w-16 h-20 rounded-xl bg-[#2764c9] flex items-center justify-center shadow-md">
                <span className="w-5 h-5 rounded-full bg-amber-300 shadow-[0_0_16px_#fde047]" />
              </div>
            </div>
          </div>

          {/* Get Inspired Category Pills */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[20px] font-bold">Get inspired</h3>
              <button
                onClick={() => transitionToView('room-bento')}
                className="text-xs text-amber-300 hover:underline font-medium"
              >
                Open Room Hotspot Gallery →
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    spatialSound.playPinchTap();
                  }}
                  className={`px-4 py-1.5 rounded-full text-[12.5px] font-medium transition ${
                    activeCategory === cat
                      ? 'bg-white text-black font-semibold shadow'
                      : 'bg-white/15 text-white/85 hover:bg-white/25'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 4-Column Product Grid: Knarrevik, Lövbacken, Ekenäset, Skruvby */}
          <div className="grid grid-cols-4 gap-4">
            {products.map((prod, productIndex) => (
              <div
                key={prod.id}
                onClick={() => {
                  spatialSound.playPinchTap();
                  transitionToView('detail');
                }}
                style={{ animationDelay: `${Math.min(240, productIndex * 55)}ms` }}
                className="group cursor-pointer rounded-[24px] bg-white/10 hover:bg-white/15 border border-white/10 p-3.5 flex flex-col justify-between transition-all hover:scale-[1.02] ikea-product-card-enter"
              >
                <div className="h-36 rounded-[18px] bg-[#D5D3CE] flex items-center justify-center relative overflow-hidden">
                  {prod.id === 'lovbacken' && (
                    <div className="w-28 h-16 rounded-b-full bg-[#0c3888] border-t-4 border-stone-300 shadow-lg" />
                  )}
                  {prod.id === 'knarrevik' && (
                    <div className="flex flex-col items-center">
                      <div className="w-20 h-3 rounded-full bg-stone-600" />
                      <div className="w-6 h-16 bg-stone-500 rounded-b-lg" />
                    </div>
                  )}
                  {prod.id === 'ekenaset' && <span className="text-5xl"><Glyph e="🪑" /></span>}
                  {prod.id === 'skruvby' && (
                    <div className="w-20 h-16 bg-sky-700/80 rounded-md border border-sky-900 shadow" />
                  )}
                </div>

                <div className="mt-3">
                  <div className="text-[15px] font-bold">{prod.name}</div>
                  <div className="text-[11px] text-white/70 truncate">{prod.desc}</div>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <span className="text-[14px] font-bold">${prod.price}</span>
                      <span className="text-[10px] text-white/65"> / piece</span>
                      <div className="text-[10px] text-white/90 tracking-tighter">
                        <Glyph e="★★★★" /><span className="text-white/35"><Glyph e="★" /></span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
                        <Heart className="w-3.5 h-3.5" />
                      </span>
                      <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: INTERACTIVE ROOM HOTSPOT BENTO (Exact match to original-d56ab...mp4 00:19-00:22) */}
      {view === 'room-bento' && (
        <div className={`w-full h-full p-6 flex flex-col gap-4 text-white ${isLeavingView ? 'ikea-scene-leave' : 'ikea-scene-enter'}`}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => transitionToView('catalog')}
              className="vision-btn px-3.5 py-1.5 rounded-full bg-white/15 text-xs font-medium flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Catalog</span>
            </button>
            <span className="text-xs text-white/75">
              Hover or tap pulsing hotspots to inspect spatial furniture
            </span>
          </div>

          <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
            {/* Left Large Room Card with Mörbylånga Coffee Table Hotspot */}
            <div className="col-span-7 rounded-[26px] bg-gradient-to-br from-[#d7cab8] via-[#b8a388] to-[#8f7960] relative overflow-hidden p-6 flex items-end">
              {/* Stylized Travertine Coffee Table on Woven Rug */}
              <div className="absolute inset-x-10 bottom-10 h-32 rounded-2xl bg-[#e3d7c6] shadow-2xl border-t-8 border-[#efe6d8] transform -rotate-6" />

              {/* Hotspot Dot + Floating Tooltip ("Mörbylånga Coffee table, 140x60 cm — $119 / piece") */}
              <div className="relative z-10 mb-12 ml-12 flex items-center gap-3">
                <button
                  onClick={() =>
                    setActiveHotspot(activeHotspot === 'morbylanga' ? null : 'morbylanga')
                  }
                  className="w-8 h-8 rounded-full bg-black/55 border-2 border-white text-white flex items-center justify-center shadow-lg hover:scale-110 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {activeHotspot === 'morbylanga' && (
                  <div
                    onClick={() => transitionToView('detail')}
                    className="cursor-pointer vision-ornament px-4 py-2.5 rounded-2xl flex items-center gap-4 hover:scale-105 transition"
                  >
                    <div>
                      <div className="text-[13px] font-bold text-white">Mörbylånga</div>
                      <div className="text-[11px] text-white/75">
                        Coffee table, 140x60 cm
                      </div>
                      <div className="text-[12px] font-bold text-white mt-0.5">
                        $119 <span className="font-normal text-white/70">/ piece</span>
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right 2-Row Split Bento (Credenza + Floor Lamp & Fluted Stools) */}
            <div className="col-span-5 flex flex-col gap-4">
              <div className="flex-1 rounded-[24px] bg-[#c9b7a2] relative p-4 flex items-center justify-center">
                <div className="w-4/5 h-20 bg-[#9c6b3b] rounded-lg shadow-md border-b-4 border-[#6b4623]" />
                <button
                  onClick={() => transitionToView('detail')}
                  className="absolute top-1/2 right-12 w-7 h-7 rounded-full bg-black/55 border border-white flex items-center justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div className="rounded-[24px] bg-[#dfd7cc] relative flex items-center justify-center">
                  <div className="w-8 h-28 bg-amber-100 rounded-t-lg shadow" />
                  <button
                    onClick={() => transitionToView('detail')}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-black/55 border border-white flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="rounded-[24px] bg-[#d4c8b8] relative flex items-center justify-center">
                  <div className="w-16 h-16 rounded-xl bg-white/90 shadow" />
                  <button
                    onClick={() => transitionToView('detail')}
                    className="absolute top-8 right-8 w-7 h-7 rounded-full bg-black/55 border border-white flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
