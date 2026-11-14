import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
  Check,
  Scan,
  Sparkles,
  Search,
  Maximize2,
  Eye,
  LayoutGrid,
  QrCode,
  Copy,
} from 'lucide-react';
import QRCode from 'qrcode';
import { AlqamiArtifact } from '../../data/alqamiArtifacts';
import { AlqamiArtifact3DCanvas } from '../three/AlqamiArtifact3DCanvas';
import { AlqamiDuoFoldTransition } from '../effects/AlqamiDuoFoldTransition';
import { AlqamiDuoFoldShowcase } from '../effects/AlqamiDuoFoldShowcase';
// The scanner (recognition, image tracking) loads only when it is opened.
/** While the scanner's code arrives: the camera screen's black, with a quiet note (never a blank flash). */
const ScannerLoading: React.FC = () => (
  <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center text-white/75 text-[13px]" role="status">
    <span className="w-5 h-5 me-2 rounded-full border-2 border-white/30 border-t-white animate-spin" />
    يفتح الماسح… · Opening the scanner…
  </div>
);
const AlqamiARKitObjectScanner = lazy(() => import('./AlqamiARKitObjectScanner').then((m) => ({ default: m.AlqamiARKitObjectScanner })));
import { spatialSound } from '../../utils/spatialSound';
import { assetUrl } from '../../utils/assetUrl';
import { MoonRecordPanel } from '../moon/MoonRecordCard';
import { MoonRecordSheet, MoonShelf } from '../moon/MoonCatalogue';
import { useAlqamiArtifacts } from '../../moon/moonObjects';
import { useMoonRecord } from '../../moon/useMoon';
import { roomViewUrl } from '../../moon/roomView';
import { SpeakingPanel } from '../voice/SpeakingPanel';
import { factsFromArtifact } from '../../voice/persona';

interface BentoHotspot {
  id: string;
  x: number;
  y: number;
  artifactId: string;
  labelAr: string;
  labelEn: string;
  area: string;
}

const BENTO_HOTSPOTS: BentoHotspot[] = [
  {
    id: 'hs-table',
    x: 25.5,
    y: 39,
    artifactId: 'ALQ-TAB-004',
    labelAr: 'طاولة الشلال الحجرية التراثية',
    labelEn: 'Travertine Waterfall Table',
    area: 'Living Space',
  },
  {
    id: 'hs-vase',
    x: 36.5,
    y: 35.5,
    artifactId: 'ALQ-ART-008',
    labelAr: 'مبخرة ومزهرية خزفية عتيقة',
    labelEn: 'Artisanal Ceramic Incense Vase',
    area: 'Table Centerpiece',
  },
  {
    id: 'hs-rug',
    x: 13,
    y: 71,
    artifactId: 'ALQ-MSS-006',
    labelAr: 'بساط صوف منسوج يدوياً',
    labelEn: 'Hand-knotted Textured Rug',
    area: 'Floor Accents',
  },
  {
    id: 'hs-art',
    x: 78.5,
    y: 12.5,
    artifactId: 'ALQ-ART-002',
    labelAr: 'لوحة جدارية منقوشة',
    labelEn: 'Sculptural Plaster Relief Artwork',
    area: 'Wall Decor',
  },
  {
    id: 'hs-credenza',
    x: 87.5,
    y: 26,
    artifactId: 'ALQ-STE-003',
    labelAr: 'كونسول خشبي دافئ كلاسيكي',
    labelEn: 'Oak Wood Media Console Credenza',
    area: 'Storage & Display',
  },
  {
    id: 'hs-lamp',
    x: 69,
    y: 69.5,
    artifactId: 'ALQ-HLM-001',
    labelAr: 'مصباح أرضي نحاسي مع كُم قماشي',
    labelEn: 'Brass Column Floor Lamp',
    area: 'Atmospheric Lighting',
  },
  {
    id: 'hs-stools',
    x: 82,
    y: 77.5,
    artifactId: 'ALQ-ART-009',
    labelAr: 'طاولات جانبية مضلعة حجرية',
    labelEn: 'Fluted Pedestal Side Tables',
    area: 'Accent Tables',
  },
  {
    id: 'hs-sofa',
    x: 93,
    y: 56.5,
    artifactId: 'ALQ-SWD-005',
    labelAr: 'أريكة صالون ناعمة ومريحة',
    labelEn: 'Textured Linen Lounge Sofa',
    area: 'Lounge Seating',
  },
];

interface AlqamiSpatialAppProps {
  onPreviewInSpace?: (artifact?: AlqamiArtifact) => void;
  lang?: 'ar' | 'en';
  onToggleLang?: (l: 'ar' | 'en') => void;
  activeNav?: 'grid' | 'search' | 'user' | 'favorites' | 'cart';
  onNavChange?: (nav: 'grid' | 'search' | 'user' | 'favorites' | 'cart') => void;
}

export const AlqamiSpatialApp: React.FC<AlqamiSpatialAppProps> = ({
  onPreviewInSpace,
  lang: propLang = 'ar',
  onToggleLang,
  activeNav = 'grid',
  onNavChange,
}) => {
  // Built-in objects plus every object catalogued in Moon with a 3D model.
  const artifacts = useAlqamiArtifacts();
  // Start directly on 'catalog' (Image 1) when entering the app
  const [view, setView] = useState<'catalog' | 'detail' | 'room-bento' | 'duo-fold'>('catalog');
  const [isLeavingView, setIsLeavingView] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  // Banner 3D artifact: randomizes automatically periodically and on load
  const [bannerArtifactIndex, setBannerArtifactIndex] = useState(() =>
    Math.floor(Math.random() * artifacts.length)
  );
  const [showLive3D, setShowLive3D] = useState(false);
  const [activeCard3D, setActiveCard3D] = useState<Record<string, boolean>>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [lang, setLang] = useState<'ar' | 'en'>(() => {
    try {
      return (localStorage.getItem('alqami_lang') as 'ar' | 'en') || propLang || 'ar';
    } catch {
      return propLang || 'ar';
    }
  });

  useEffect(() => {
    if (propLang) setLang(propLang);
  }, [propLang]);

  useEffect(() => {
    const handleLangEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: 'ar' | 'en' }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('visionos:lang-change', handleLangEvent);
    return () => {
      window.removeEventListener('visionos:lang-change', handleLangEvent);
    };
  }, []);

  const isAr = lang === 'ar';

  // Keep the live 3D banner stable; changing models repeatedly creates new GPU resources.
  const [activeArtifactIndex, setActiveArtifactIndex] = useState(0);
  const [isFoldTransitionActive, setIsFoldTransitionActive] = useState(false);
  const [foldDirection, setFoldDirection] = useState<1 | -1>(1);
  const [isPopOut3D, setIsPopOut3D] = useState(false);
  const [isClosingPopOut, setIsClosingPopOut] = useState(false);
  const [isDissolvingForAR, setIsDissolvingForAR] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [liked, setLiked] = useState<Record<string, boolean>>(() => ({
    'ALQ-TAB-004': true,
    'ALQ-HLM-001': true,
    'ALQ-SWD-005': true,
  }));
  const [cartCount, setCartCount] = useState(0);
  const [openAccordion, setOpenAccordion] = useState<string | null>('details');
  const [addedToast, setAddedToast] = useState(false);
  const [deployedToast, setDeployedToast] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [qrCopied, setQrCopied] = useState(false);

  const viewTransitionTimerRef = useRef<number | null>(null);
  const popOutTimerRef = useRef<number | null>(null);
  const arDissolveTimerRef = useRef<number | null>(null);

  const currentArtifact = artifacts[activeArtifactIndex] || artifacts[0];
  // Once an object is catalogued in Moon, Moon is the source of its details.
  const currentMoonRecord = useMoonRecord(currentArtifact.moonRecordId, lang);
  const [moonSheetId, setMoonSheetId] = useState<string | null>(null);

  // Auto-generate QR code data URL pointing to the authentic AR Quick Look mode
  useEffect(() => {
    const arUrl = new URL(roomViewUrl(currentArtifact.model.glb, isAr ? currentArtifact.title.ar : currentArtifact.title.en), window.location.href).href;
    QRCode.toDataURL(arUrl, {
      width: 420,
      margin: 1.5,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error('QR generation error:', err));
  }, [currentArtifact, isAr]);

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

  const [popOutArtifact, setPopOutArtifact] = useState<AlqamiArtifact | null>(null);

  const openPopOut3D = (art?: AlqamiArtifact | unknown) => {
    if (popOutTimerRef.current !== null) window.clearTimeout(popOutTimerRef.current);
    popOutTimerRef.current = null;
    let target: AlqamiArtifact = currentArtifact;
    if (art && typeof art === 'object' && 'model' in (art as Record<string, unknown>)) {
      target = art as AlqamiArtifact;
    }
    setPopOutArtifact(target);
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
    }, 320);
  };

  // Keyboard shortcut: Escape closes popout
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPopOut3D) {
        closePopOut3D();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPopOut3D, isClosingPopOut]);

  // Listen to inspect-3d from AR scan or external triggers
  useEffect(() => {
    const handleInspectEvent = (e: Event) => {
      const ce = e as CustomEvent<{ artifactId?: string }>;
      if (ce.detail?.artifactId) {
        const found = artifacts.find((a) => a.id === ce.detail.artifactId);
        if (found) {
          openPopOut3D(found);
        }
      }
    };
    window.addEventListener('visionos:inspect-3d', handleInspectEvent);
    return () => window.removeEventListener('visionos:inspect-3d', handleInspectEvent);
  }, []);

  // Preview in room space (placed in another distinct location than the tab)
  const triggerARPreviewInSpace = (art: AlqamiArtifact = currentArtifact) => {
    spatialSound.playPinchTap();
    setIsDissolvingForAR(true);

    window.dispatchEvent(
      new CustomEvent('visionos:place-ar-object', {
        detail: {
          glb: art.model.glb,
          label: `${art.title.ar} · ${art.title.en}`,
          scale: art.model.scale || 1.0,
          dimensions: art.details.dimensions,
          id: art.id,
          offsetPlacement: true,
        },
      })
    );

    onPreviewInSpace?.(art);

    setDeployedToast(`✨ تم نشر ${art.title.ar} ثلاثي الأبعاد في غرفتك بجانب النافذة!`);
    setTimeout(() => setDeployedToast(null), 3600);

    if (arDissolveTimerRef.current !== null) window.clearTimeout(arDissolveTimerRef.current);
    arDissolveTimerRef.current = window.setTimeout(() => {
      setIsDissolvingForAR(false);
      arDissolveTimerRef.current = null;
    }, 600);
  };

  const handleNextArtifact = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    spatialSound.playPinchTap();
    setFoldDirection(1);
    setIsFoldTransitionActive(true);
    setActiveArtifactIndex((prev) => (prev + 1) % artifacts.length);
  };

  const handlePrevArtifact = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    spatialSound.playPinchTap();
    setFoldDirection(-1);
    setIsFoldTransitionActive(true);
    setActiveArtifactIndex((prev) => (prev - 1 + artifacts.length) % artifacts.length);
  };

  // Auto-randomize the hero banner 3D artifact periodically
  useEffect(() => {
    const timer = setInterval(() => {
      setBannerArtifactIndex((prev) => {
        let next = Math.floor(Math.random() * artifacts.length);
        if (next === prev) next = (prev + 1) % artifacts.length;
        return next;
      });
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const randomizeBannerArtifact = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    spatialSound.playPinchTap();
    setBannerArtifactIndex((prev) => {
      let next = Math.floor(Math.random() * artifacts.length);
      if (next === prev) next = (prev + 1) % artifacts.length;
      return next;
    });
  };

  // Search event listeners from Left Dock or shortcuts
  useEffect(() => {
    const handleToggleSearch = () => {
      setIsSearchOpen((prev) => {
        const next = !prev;
        window.dispatchEvent(new CustomEvent('visionos:search-state', { detail: { open: next } }));
        if (next) {
          setTimeout(() => searchInputRef.current?.focus(), 100);
        } else {
          setSearchQuery('');
        }
        return next;
      });
    };

    const handleFocusSearch = () => {
      setIsSearchOpen(true);
      window.dispatchEvent(new CustomEvent('visionos:search-state', { detail: { open: true } }));
      setTimeout(() => searchInputRef.current?.focus(), 100);
    };

    const handleCloseSearch = () => {
      setIsSearchOpen(false);
      setSearchQuery('');
      window.dispatchEvent(new CustomEvent('visionos:search-state', { detail: { open: false } }));
    };

    window.addEventListener('visionos:toggle-search', handleToggleSearch);
    window.addEventListener('visionos:focus-search', handleFocusSearch);
    window.addEventListener('visionos:close-search', handleCloseSearch);
    return () => {
      window.removeEventListener('visionos:toggle-search', handleToggleSearch);
      window.removeEventListener('visionos:focus-search', handleFocusSearch);
      window.removeEventListener('visionos:close-search', handleCloseSearch);
    };
  }, []);

  const categories: { id: string; ar: string; en: string }[] = [
    { id: 'All', ar: 'الكل', en: 'All' },
    { id: 'Artifact', ar: 'مقتنيات أثرية', en: 'Artifacts' },
    { id: 'Manuscripts', ar: 'مخطوطات', en: 'Manuscripts' },
    { id: 'Islamic Art', ar: 'فن إسلامي', en: 'Islamic Art' },
    { id: 'History', ar: 'تاريخ', en: 'History' },
    { id: 'Heritage', ar: 'تراث', en: 'Heritage' },
    { id: 'Museum', ar: 'متحف', en: 'Museum' },
    { id: 'Culture', ar: 'ثقافة', en: 'Culture' },
  ];

  const q = searchQuery.trim().toLowerCase();
  const filteredArtifacts = artifacts.filter((a) => {
    const matchesCat =
      activeCategory === 'All'
        ? true
        : a.category.toLowerCase().includes(activeCategory.toLowerCase().replace(' ', '-')) ||
          (activeCategory === 'Heritage' && (a.category === 'manuscripts' || a.category === 'artifact')) ||
          (activeCategory === 'Museum' && a.institution) ||
          (activeCategory === 'Culture' && a.period);

    if (!matchesCat) return false;
    if (!q) return true;

    return (
      a.title.ar.toLowerCase().includes(q) ||
      a.title.en.toLowerCase().includes(q) ||
      a.itemCode.toLowerCase().includes(q) ||
      (a.subtitle && (a.subtitle.ar.toLowerCase().includes(q) || a.subtitle.en.toLowerCase().includes(q))) ||
      a.details.material.ar.toLowerCase().includes(q) ||
      a.details.material.en.toLowerCase().includes(q) ||
      a.period.ar.toLowerCase().includes(q) ||
      a.period.en.toLowerCase().includes(q) ||
      a.description.ar.toLowerCase().includes(q) ||
      a.description.en.toLowerCase().includes(q)
    );
  });

  const isFavoritesMode = activeNav === 'favorites';
  const displayedArtifacts = filteredArtifacts.filter((a) => {
    if (isFavoritesMode) {
      return !!liked[a.id];
    }
    return true;
  });

  const toggleLike = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    spatialSound.playPinchTap();
    setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddToCart = () => {
    spatialSound.playPinchTap();
    setCartCount((c) => c + quantity);
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2400);
  };

  const toggleAccordion = (id: string) => {
    spatialSound.playPinchTap();
    setOpenAccordion((prev) => (prev === id ? null : id));
  };

  return (
    <div className="w-full h-full relative preserve-3d select-none pointer-events-auto">
      {/* Dissolve Transition for AR placement */}
      {isDissolvingForAR && (
        <div aria-hidden="true" className="absolute inset-0 z-50 rounded-[38px] ikea-ar-dissolve pointer-events-none" />
      )}

      {/* Cart Toast Notification */}
      {addedToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full vision-glass border border-emerald-400/50 text-emerald-300 text-xs shadow-[0_8px_24px_rgba(52,211,153,0.4)] pointer-events-none">
          <Check className="h-4 w-4" />
          <span>تمت إضافة المقتنى إلى السلة ({quantity} قطعة)</span>
        </div>
      )}

      {/* Deployed In Space Toast Notification */}
      {deployedToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full vision-glass border border-amber-400/60 bg-black/75 text-amber-300 text-xs font-semibold shadow-[0_8px_28px_rgba(245,190,70,0.5)] pointer-events-none animate-in fade-in slide-in-from-top-2">
          <Sparkles className="h-4 w-4" />
          <span>{deployedToast}</span>
        </div>
      )}

      {/* The scanner: recognition, codes, Teach, Add record */}
      {isScanModalOpen && (
      <Suspense fallback={<ScannerLoading />}>
      <AlqamiARKitObjectScanner
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onMoonRecord={(id) => {
          setIsScanModalOpen(false);
          setMoonSheetId(id);
        }}
        onDeployInSpace={(art) => triggerARPreviewInSpace(art)}
        onOpenDetail={(art) => {
          const idx = artifacts.findIndex((a) => a.id === art.id);
          if (idx >= 0) setActiveArtifactIndex(idx);
          transitionToView('detail');
        }}
      />
      </Suspense>
      )}

      {moonSheetId && <MoonRecordSheet recordId={moonSheetId} lang={lang} onClose={() => setMoonSheetId(null)} />}

      {/* 3D Volume Pop-Out Overlay in Front of Dimmed Window (Exact match to large-thumbnail20230914-22636-1i3w6cl.mp4) */}
      {isPopOut3D && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closePopOut3D();
          }}
          className={`absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-auto preserve-3d ${
            isClosingPopOut ? 'ikea-volume-exit' : 'ikea-volume-enter'
          }`}
        >
          {/* Spatial Dimming Vignette Backdrop */}
          <div
            onClick={closePopOut3D}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl pointer-events-auto transition-opacity duration-300 cursor-pointer"
          />

          <div
            style={{
              width: 'min(780px, calc(100vw - 32px))',
              height: 'min(620px, calc(100dvh - 100px))',
            }}
            className={`drop-shadow-[0_45px_85px_rgba(0,0,0,0.95)] relative pointer-events-auto z-10 ${
              isClosingPopOut ? 'ikea-volume-model-exit' : 'ikea-volume-model-enter'
            }`}
          >
            <AlqamiArtifact3DCanvas
              key={((popOutArtifact && 'id' in popOutArtifact ? popOutArtifact.id : currentArtifact.id)) + '-popout'}
              glbUrl={(popOutArtifact && 'model' in popOutArtifact ? popOutArtifact : currentArtifact).model.glb}
              mode="popout"
              autoRotate={true}
              lang={lang}
              featurePoints={[
                {
                  id: 'pop-fp1',
                  localPos: [-0.18, 0.14, 0.28],
                  x: 36,
                  y: 35,
                  title: { ar: 'الزخارف والنقوش الأصيلة', en: 'Inscriptions & Motifs' },
                  desc: { ar: 'نقوش وزخارف يدوية دقيقة تميز هذا المقتنى وتوثق أصالته', en: 'Intricate historical engravings and handcrafted details' },
                  badge: { ar: 'أصلي · Authentic', en: 'Authentic' },
                },
                {
                  id: 'pop-fp2',
                  localPos: [0.22, -0.06, 0.26],
                  x: 64,
                  y: 62,
                  title: { ar: 'المادة والصناعة التراثية', en: 'Material & Craftsmanship' },
                  desc: {
                    ar: (popOutArtifact && 'details' in popOutArtifact ? popOutArtifact : currentArtifact).details.material.ar,
                    en: (popOutArtifact && 'details' in popOutArtifact ? popOutArtifact : currentArtifact).details.material.en,
                  },
                  badge: {
                    ar: (popOutArtifact && 'period' in popOutArtifact ? popOutArtifact : currentArtifact).period.ar,
                    en: (popOutArtifact && 'period' in popOutArtifact ? popOutArtifact : currentArtifact).period.en,
                  },
                },
                {
                  id: 'pop-fp3',
                  localPos: [0.0, -0.22, 0.2],
                  x: 50,
                  y: 80,
                  title: { ar: 'قاعدة المقتنى والختم الأثري', en: 'Artifact Base & Stamp' },
                  desc: { ar: 'فحص قاعدة المقتنى وتفاصيل التثبيت والختم التاريخي', en: 'Base hallmark stamp and historical fabrication details' },
                  badge: { ar: '360° فحص حر', en: '360° Free Inspect' },
                },
              ]}
            />
          </div>
          <button
            onClick={closePopOut3D}
            disabled={isClosingPopOut}
            className="vision-btn z-20 mt-3 px-6 py-2.5 rounded-full vision-ornament flex items-center gap-2 text-[13.5px] font-semibold text-white shadow-2xl cursor-pointer hover:bg-white/25 active:scale-95 transition-all border border-white/20 backdrop-blur-2xl"
          >
            <span>{isAr ? 'إغلاق المعاينة' : 'Close preview'}</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 1: GET INSPIRED CATALOG (DEFAULT FIRST VIEW - IMAGE 1)
         ───────────────────────────────────────────────────────────── */}
      {view === 'catalog' && activeNav !== 'user' && (
        <div
          className={`w-full h-full overflow-y-auto p-6 space-y-6 text-white custom-scrollbar pointer-events-auto transition-all duration-500 ${
            isPopOut3D ? 'opacity-15 blur-md scale-[0.97] pointer-events-none' : 'opacity-100'
          } ${
            isLeavingView ? 'ikea-scene-leave' : 'ikea-scene-enter'
          }`}
        >
          {/* Blue Architectural Hero Banner with DYNAMIC 3D MOVING ARTIFACT (Randomly Changing) */}
          <div className="w-full min-h-[260px] md:min-h-[285px] rounded-[32px] bg-gradient-to-r from-[#124091] via-[#1c56b8] to-[#0f3478] p-6 md:p-8 flex items-center justify-between relative overflow-hidden shadow-2xl border border-white/20 ikea-hero-arrive">
            <div className="z-10 max-w-sm space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
                {isAr ? 'اكتشف المقتنيات النادرة' : 'Discover authentic artifacts'}
              </span>
              <h2 className="text-[26px] font-bold leading-tight text-white">
                {isAr ? 'استكشف كنوز التراث الإسلامي' : 'Explore the treasures of Islamic heritage'}
              </h2>
              <p className="text-[13px] text-white/80">
                {isAr ? 'مقتنيات فريدة، قصص خالدة، حضارة عريقة' : 'Unique artifacts, rich stories, timeless culture'}
              </p>
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setActiveArtifactIndex(bannerArtifactIndex);
                    transitionToView('detail');
                  }}
                  className="h-9 px-5 rounded-full bg-[#FFD60A] hover:bg-[#ffe03b] text-black font-semibold text-[13px] flex items-center gap-2 hover:scale-105 active:scale-95 transition cursor-pointer shadow-md"
                >
                  <span>{isAr ? 'استكشف المعرض' : 'Discover'}</span>
                  <ArrowRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Right: live 3D artifact in the banner with large presentation (as requested in img 3) */}
            <div className="flex items-center gap-4 pr-2 z-10 h-full">
              <div
                onClick={randomizeBannerArtifact}
                className="w-72 h-72 md:w-80 md:h-80 relative pointer-events-auto flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                title={isAr ? 'انقر لتغيير المعروض ثلاثي الأبعاد عشوائياً' : 'Click to cycle random authentic artifact'}
              >
                <AlqamiArtifact3DCanvas
                  key={artifacts[bannerArtifactIndex]?.id || 'banner-obj'}
                  glbUrl={artifacts[bannerArtifactIndex]?.model?.glb || '/models/Old_Islamic_Helmet.glb'}
                  mode="banner"
                  autoRotate={true}
                  className="w-full h-full relative z-10"
                />
              </div>

              {/* Glowing Orb & Alqami Logo Stage */}
              <div
                onClick={randomizeBannerArtifact}
                className="w-16 h-24 rounded-2xl bg-[#2764c9]/80 hover:bg-[#2764c9] border border-white/20 backdrop-blur-md flex flex-col items-center justify-center gap-2 shadow-lg cursor-pointer transition active:scale-95"
                title={isAr ? 'تبديل عشوائي للمجسم' : 'Randomize 3D Artifact'}
              >
                <img
                  src={assetUrl('alqami-logo.png')}
                  alt="Alqami"
                  className="w-7 h-7 object-contain drop-shadow"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-300 shadow-[0_0_12px_#fde047] animate-pulse" />
              </div>
            </div>
          </div>

          {/* Interactive VisionOS Search Bar (Activated from Left Dock or Search query) */}
          {isSearchOpen && (
            <div className="w-full flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/15 backdrop-blur-xl border border-white/25 shadow-lg animate-in fade-in slide-in-from-top-2">
              <Search className="w-4 h-4 text-white/70 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'البحث عن مقتنى، مخطوطة، أو رقم القطعة...' : 'Search artifacts, manuscripts, or item code...'}
                className="w-full bg-transparent border-none text-white text-[13.5px] placeholder-white/50 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                  window.dispatchEvent(new CustomEvent('visionos:search-state', { detail: { open: false } }));
                }}
                className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-[11px] font-medium transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          )}

          {/* Get Inspired Header, Category Pills & 3D Toggle */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <h3 className="text-[20px] font-bold">
                  {isFavoritesMode
                    ? (isAr ? 'المقتنيات المفضلة' : 'Favorite Models')
                    : (isAr ? 'استلهم من التراث' : 'Get inspired')}
                </h3>
                {isFavoritesMode && (
                  <button
                    onClick={() => {
                      spatialSound.playPinchTap();
                      onNavChange?.('grid');
                    }}
                    className="text-xs px-3.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white/95 flex items-center gap-1.5 transition cursor-pointer border border-white/20 active:scale-95"
                  >
                    <ChevronLeft className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
                    <span>{isAr ? 'كافة المقتنيات' : 'All Artifacts'}</span>
                  </button>
                )}
              </div>

              {/* Header Action Buttons: Live 3D Toggle AND 3D Popout Inspect side-by-side (Matching Image 1 in red circle) */}
              <div className="flex items-center gap-2">
                {/* Scan: QR labels, book barcodes and recognition by sight, all opening Moon records */}
                <button
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setIsScanModalOpen(true);
                  }}
                  className="h-9 px-3.5 rounded-full flex items-center gap-1.5 bg-[#FFD60A] hover:bg-[#ffe03b] text-black text-[12.5px] font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                  aria-label={isAr ? 'امسح قطعة أو كتابًا' : 'Scan an object or a book'}
                  title={isAr ? 'امسح ملصق QR أو باركود كتاب أو وجّه الكاميرا نحو القطعة' : 'Scan a QR label, a book barcode, or point at the object'}
                >
                  <Scan className="w-4 h-4" />
                  <span>{isAr ? 'امسح' : 'Scan'}</span>
                </button>
                {/* Button 1: Toggle live interactive 3D models in all cards */}
                <button
                  onClick={() => {
                    setShowLive3D((prev) => !prev);
                    spatialSound.playPinchTap();
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm border ${
                    showLive3D
                      ? 'bg-white/40 border-white/60 text-white shadow-[0_0_14px_rgba(255,255,255,0.45)] scale-105'
                      : 'bg-white/20 hover:bg-white/35 border-white/25 text-white'
                  }`}
                  aria-label={isAr ? 'تبديل النماذج ثلاثية الأبعاد التفاعلية' : 'Toggle live 3D models'}
                  title={isAr ? 'عرض النماذج ثلاثية الأبعاد التفاعلية في البطاقات' : 'Toggle live interactive 3D models'}
                >
                  <Box className="w-4 h-4 text-white" />
                </button>

                {/* Button 2: 3D Model Inspect Pop-out Button (the one in red circle in Image 1) */}
                <button
                  onClick={() => {
                    spatialSound.playPinchTap();
                    openPopOut3D(artifacts[bannerArtifactIndex] || currentArtifact);
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm border bg-white/20 hover:bg-white/35 border-white/25 text-white active:scale-95"
                  aria-label={isAr ? 'فحص ثلاثي الأبعاد مكاني' : 'Inspect 3D spatial volume'}
                  title={isAr ? 'فحص ثلاثي الأبعاد في الفضاء المكاني' : 'Inspect 3D spatial volume'}
                >
                  <Rotate3d className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {!isFavoritesMode && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      spatialSound.playPinchTap();
                    }}
                    className={`px-4 py-1.5 rounded-full text-[12.5px] font-medium transition cursor-pointer ${
                      activeCategory === cat.id
                        ? 'bg-white text-black font-semibold shadow'
                        : 'bg-white/15 text-white/85 hover:bg-white/25'
                    }`}
                  >
                    {cat[isAr ? 'ar' : 'en']}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* All Authentic Artifacts Grid with Elevation & Specular Hover Glow (Matching Image 2) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {displayedArtifacts.map((prod, productIndex) => {
              const globalIdx = artifacts.findIndex((a) => a.id === prod.id);
              const isFav = !!liked[prod.id];
              const isCardLive = showLive3D || !!activeCard3D[prod.id];

              return (
                <div
                  key={prod.id}
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setActiveArtifactIndex(globalIdx >= 0 ? globalIdx : 0);
                    setFoldDirection(1);
                    setIsFoldTransitionActive(true);
                    transitionToView('detail');
                  }}
                  style={{ animationDelay: `${Math.min(240, productIndex * 45)}ms` }}
                  className="group cursor-pointer rounded-[24px] bg-white/10 hover:bg-white/25 border border-white/10 hover:border-white/30 p-3.5 flex flex-col justify-between transition-all visionos-hover-card pointer-events-auto shadow-sm"
                >
                  {/* Card Viewport: Shows Live 3D Model when active, or image thumbnail with on-model 3D action button */}
                  <div
                    onPointerDown={() => {
                      if (!activeCard3D[prod.id]) {
                        setActiveCard3D((prev) => ({ ...prev, [prod.id]: true }));
                      }
                    }}
                    className="card-thumb-container h-36 rounded-[18px] bg-[#CBC9C5] flex items-center justify-center relative overflow-hidden shadow-inner transition-transform"
                  >
                    {isCardLive ? (
                      <div className="w-full h-full relative" onClick={(e) => e.stopPropagation()}>
                        <AlqamiArtifact3DCanvas
                          glbUrl={prod.model.glb}
                          mode="card"
                          autoRotate={true}
                          className="w-full h-full"
                        />
                      </div>
                    ) : (
                      <img
                        src={assetUrl(prod.image)}
                        alt={prod.title[isAr ? 'ar' : 'en']}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="mt-3 space-y-1">
                    <h4 className="text-[14.5px] font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                      {isAr ? prod.title.ar : prod.title.en}
                    </h4>
                    <p className="text-[11.5px] text-white/70 line-clamp-1">
                      {isAr ? prod.title.en : prod.title.ar}
                    </p>

                    <div className="flex items-center justify-between pt-2.5">
                      {/* Item Code Badge styled in frosted glass pill (matching Image 5 style) */}
                      <span className="text-[11px] font-bold font-mono text-white/95 bg-white/15 hover:bg-white/20 px-3 py-1 rounded-full border border-white/20 backdrop-blur-md shadow-sm transition-colors">
                        {prod.itemCode}
                      </span>

                      {/* Action buttons styled as circular frosted glass buttons (exact style of Image 5) */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => toggleLike(prod.id, e)}
                          className={`w-8 h-8 rounded-full border border-white/25 backdrop-blur-md flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md ${
                            isFav
                              ? 'bg-rose-500/85 text-white border-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                              : 'bg-white/20 hover:bg-white/35 text-white'
                          }`}
                          title={isAr ? 'إضافة للمفضلة' : 'Favorite'}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white text-white' : 'text-white'}`} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPopOut3D(prod);
                          }}
                          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/35 active:scale-95 border border-white/25 backdrop-blur-md flex items-center justify-center text-white shadow-md transition-all cursor-pointer"
                          title={isAr ? 'فحص ثلاثي الأبعاد 3D' : 'Inspect 3D Model'}
                        >
                          <Box className="w-4 h-4 text-white drop-shadow" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {displayedArtifacts.length === 0 && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-center space-y-3 bg-white/5 rounded-3xl border border-white/10 p-6">
                <Heart className="w-10 h-10 text-white/30" />
                <h4 className="text-base font-bold text-white">
                  {isAr ? 'لا توجد مقتنيات في المفضلة بعد' : 'No Favorite Models Yet'}
                </h4>
                <p className="text-xs text-white/60 max-w-sm">
                  {isAr
                    ? 'انقر على أيقونة القلب في أي بطاقة مقتنى لحفظه هنا ومشاهدته متى شئت.'
                    : 'Tap the heart icon on any artifact card to add it to your personal favorites collection.'}
                </p>
                <button
                  onClick={() => onNavChange?.('grid')}
                  className="px-5 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold cursor-pointer transition active:scale-95"
                >
                  {isAr ? 'تصفح كافة المقتنيات' : 'Explore Artifacts'}
                </button>
              </div>
            )}
          </div>

          {!isFavoritesMode && (
            <MoonShelf
              query={searchQuery}
              lang={lang}
              onOpen={(id) => {
                spatialSound.playPinchTap();
                setMoonSheetId(id);
              }}
            />
          )}

          {/* ─────────────────────────────────────────────────────────────
              ROOM BENTO SHOWCASE: REAL INTERACTIVE 3D MODELS (NO PICS / NO TEXT)
             ───────────────────────────────────────────────────────────── */}
          {!isFavoritesMode && (
          <div className="pt-4 pb-6 select-none">
            <div className="grid grid-cols-12 gap-4">
              {/* Cell 1: Large Left Panel (col-span-12 md:col-span-7 h-[360px]) with REAL 3D Model */}
              <div className="col-span-12 md:col-span-7 h-[360px] rounded-[26px] bg-[#CBC9C5]/20 hover:bg-[#CBC9C5]/30 border border-white/20 relative overflow-visible flex flex-col justify-between shadow-xl transition-all">
                <AlqamiArtifact3DCanvas
                  key="bento-3d-1"
                  glbUrl={artifacts[3]?.model?.glb || '/models/babylonian_map_of_the_world_tablet_-_imago_mundi.glb'}
                  mode="embedded"
                  autoRotate={true}
                  lang={lang}
                  featurePoints={[
                    {
                      id: 'bento-fp1',
                      localPos: [-0.08, 0.12, 0.16],
                      title: { ar: artifacts[3]?.title.ar, en: artifacts[3]?.title.en },
                      desc: { ar: artifacts[3]?.details.dimensions, en: artifacts[3]?.details.material.en },
                      onInspect: () => openPopOut3D(artifacts[3]),
                    },
                    {
                      id: 'bento-fp2',
                      localPos: [0.10, -0.08, 0.16],
                      title: { ar: 'نقوش مسمارية تراثية', en: 'Cuneiform Inscriptions' },
                      desc: { ar: 'أقدم خريطة جغرافية كلاسيكية', en: 'Ancient cartographic world map' },
                      badge: { ar: 'نادر جداً · Rare', en: 'Rare Artifact' },
                      onInspect: () => openPopOut3D(artifacts[3]),
                    },
                  ]}
                />
              </div>

              {/* Right Side 3D Panels */}
              <div className="col-span-12 md:col-span-5 flex flex-col gap-4">
                {/* Cell 2: Top Right Panel (h-[172px]) with REAL 3D Model */}
                <div className="h-[172px] rounded-[24px] bg-[#CBC9C5]/20 hover:bg-[#CBC9C5]/30 border border-white/20 relative overflow-visible shadow-lg transition-all">
                  <AlqamiArtifact3DCanvas
                    key="bento-3d-2"
                    glbUrl={artifacts[1]?.model?.glb || '/models/Old_Islamic_Helmet.glb'}
                    mode="embedded"
                    autoRotate={true}
                    lang={lang}
                    featurePoints={[
                      {
                        id: 'bento-fp3',
                        localPos: [0.0, 0.14, 0.28],
                        title: { ar: artifacts[1]?.title.ar, en: artifacts[1]?.title.en },
                        desc: { ar: artifacts[1]?.details.dimensions, en: artifacts[1]?.details.material.en },
                        onInspect: () => openPopOut3D(artifacts[1]),
                      },
                    ]}
                  />
                </div>

                {/* Bottom 2 Split Cells */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Cell 3: Bottom Left (h-[172px]) with REAL 3D Model */}
                  <div className="h-[172px] rounded-[24px] bg-[#CBC9C5]/20 hover:bg-[#CBC9C5]/30 border border-white/20 relative overflow-visible shadow-lg transition-all">
                    <AlqamiArtifact3DCanvas
                      key="bento-3d-3"
                      glbUrl={artifacts[2]?.model?.glb || '/models/Zulfiqar_Sword.glb'}
                      mode="embedded"
                      autoRotate={true}
                      lang={lang}
                      featurePoints={[
                        {
                          id: 'bento-fp4',
                          localPos: [0.12, 0.03, 0.10],
                          title: { ar: artifacts[2]?.title.ar, en: artifacts[2]?.title.en },
                          desc: { ar: artifacts[2]?.details.material.ar, en: artifacts[2]?.details.material.en },
                          onInspect: () => openPopOut3D(artifacts[2]),
                        },
                      ]}
                    />
                  </div>

                  {/* Cell 4: Bottom Right (h-[172px]) with REAL 3D Model */}
                  <div className="h-[172px] rounded-[24px] bg-[#CBC9C5]/20 hover:bg-[#CBC9C5]/30 border border-white/20 relative overflow-visible shadow-lg transition-all">
                    <AlqamiArtifact3DCanvas
                      key="bento-3d-4"
                      glbUrl={artifacts[8]?.model?.glb || '/models/bowl.glb'}
                      mode="embedded"
                      autoRotate={true}
                      lang={lang}
                      featurePoints={[
                        {
                          id: 'bento-fp5',
                          localPos: [0.0, 0.10, 0.18],
                          title: { ar: artifacts[8]?.title.ar, en: artifacts[8]?.title.en },
                          desc: { ar: artifacts[8]?.details.material.ar, en: artifacts[8]?.details.material.en },
                          onInspect: () => openPopOut3D(artifacts[8]),
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW: ABOUT & CREATOR CREDIT (When User icon is clicked on Left Dock)
         ───────────────────────────────────────────────────────────── */}
      {activeNav === 'user' && (
        <div className="w-full h-full p-8 flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in duration-300 pointer-events-auto">
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl backdrop-blur-2xl">
            <img src={assetUrl('alqami-logo.png')} alt="Alqami" className="w-12 h-12 object-contain drop-shadow" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-wide text-white">علقمي · ALQAMI</h2>
            <p className="text-xs text-white/60">VisionOS Islamic Heritage Spatial Museum</p>
          </div>
          <div className="max-w-md p-6 rounded-3xl bg-white/10 border border-white/20 backdrop-blur-2xl shadow-xl space-y-3">
            <span className="text-[11px] font-semibold tracking-wider text-amber-300 uppercase">
              Creator & Developer Credit
            </span>
            <div className="text-base font-semibold text-white tracking-wide">
              designed and developed by isaac faleh
            </div>
            <div className="text-lg font-bold text-amber-200 font-serif" dir="rtl">
              تصميم و تطوير اسحاق فالح
            </div>
          </div>
          <button
            onClick={() => onNavChange?.('grid')}
            className="px-6 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-xs font-semibold text-white transition active:scale-95 cursor-pointer shadow-md"
          >
            {isAr ? 'العودة للمعرض' : 'Back to Catalog'}
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 2: SPLIT-PANE PRODUCT DETAIL (IMAGE 2)
         ───────────────────────────────────────────────────────────── */}
      {view === 'detail' && (
        <div
          className={`w-full h-full flex flex-col overflow-y-auto custom-scrollbar sm:grid sm:grid-cols-12 sm:overflow-visible transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            isLeavingView ? 'ikea-scene-leave' : 'ikea-scene-enter'
          } ${isPopOut3D ? 'opacity-15 blur-xl scale-[0.97] pointer-events-none' : 'opacity-100'}`}
        >
          {/* Left Pane: Warm Stone-Gray 3D Studio Viewport (#CBC9C5). On a phone it sits on top, the details below. */}
          <div className="shrink-0 h-[50vh] min-h-[300px] sm:h-auto sm:min-h-0 sm:col-span-7 bg-[#CBC9C5] text-stone-900 relative flex flex-col justify-between p-4 sm:p-6 overflow-hidden">
            {/* Interactive 3D Artifact wrapped with Duo Fold Carousel 3D mechanical hinge transition */}
            <AlqamiDuoFoldTransition
              currentArtifact={currentArtifact}
              isFolding={isFoldTransitionActive}
              foldDirection={foldDirection}
              onFoldComplete={() => setIsFoldTransitionActive(false)}
              className="flex-1 w-full relative flex items-center justify-center rounded-2xl"
            >
              {!isPopOut3D && (
                <AlqamiArtifact3DCanvas glbUrl={currentArtifact.model.glb} mode="embedded" autoRotate={true} />
              )}

              {/* Curved Orbit Track + 3D Rotate Pop-Out Button Beneath Artifact */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-20">
                <div className="w-48 h-4 border-b border-stone-400/60 rounded-b-full" />
                <button
                  onClick={() => openPopOut3D(currentArtifact)}
                  className="vision-btn -mt-3.5 w-8 h-8 rounded-full bg-stone-700/80 hover:bg-stone-900 text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-95 border border-white/20"
                  title={isAr ? 'فحص وتدوير المجسم ثلاثي الأبعاد' : 'Inspect and rotate 3D volume'}
                >
                  <Rotate3d className="w-4 h-4" />
                </button>
              </div>
            </AlqamiDuoFoldTransition>

            {/* Bottom Controls: "Preview in your space" Pill + AR Mode SVG Icon + < > Gallery Arrows */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 pointer-events-auto">
              <button
                onClick={() => triggerARPreviewInSpace(currentArtifact)}
                className="vision-btn whitespace-nowrap h-10 px-3 sm:px-4 rounded-full bg-stone-700/55 hover:bg-stone-800/80 text-white text-[13px] font-medium flex items-center gap-2 shadow-sm backdrop-blur-md cursor-pointer transition-all active:scale-95"
              >
                <Box className="w-4 h-4" />
                <span>{isAr ? 'معاينة في المكان' : 'Preview in your space'}</span>
              </button>
              <div className="flex items-center gap-2.5">
                {/* Round yellow AR Mode button with SVG Scan icon (User Request) */}
                <a
                  href={roomViewUrl(currentArtifact.model.glb, isAr ? currentArtifact.title.ar : currentArtifact.title.en)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => spatialSound.playPinchTap()}
                  className="vision-btn w-10 h-10 rounded-full bg-[#FFD60A] hover:bg-[#ffe03b] text-black flex items-center justify-center shadow-md cursor-pointer transition-all active:scale-95"
                  title={isAr ? 'وضع الواقع المعزز · AR Mode' : 'AR Mode'}
                  aria-label="AR Mode"
                >
                  <Scan className="w-5 h-5 stroke-[2.2]" />
                </a>

                {/* QR Code Generator Button Beside the AR Button (User Request) */}
                <button
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setShowQrModal(true);
                  }}
                  className="vision-btn w-10 h-10 rounded-full bg-stone-700/60 hover:bg-stone-850 text-white flex items-center justify-center shadow-md cursor-pointer transition-all active:scale-95 border border-white/20"
                  title={isAr ? 'إنشاء رمز QR لمعاينة الواقع المعزز على الهاتف' : 'Generate QR Code for Phone AR'}
                  aria-label="Generate QR Code"
                >
                  <QrCode className="w-5 h-5 text-amber-300" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevArtifact}
                  className="w-9 h-9 rounded-full bg-stone-700/45 hover:bg-stone-800/75 text-white flex items-center justify-center transition cursor-pointer active:scale-95"
                  title={isAr ? 'المعروض السابق' : 'Previous Artifact'}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextArtifact}
                  className="w-9 h-9 rounded-full bg-stone-700/45 hover:bg-stone-800/75 text-white flex items-center justify-center transition cursor-pointer active:scale-95"
                  title={isAr ? 'المعروض التالي' : 'Next Artifact'}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Pane: Translucent Spatial Frosted Glass Product Details */}
          <div className="sm:col-span-5 p-5 sm:p-7 flex flex-col justify-between gap-4 text-white sm:overflow-y-auto pointer-events-auto custom-scrollbar">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  spatialSound.playPinchTap();
                  transitionToView('catalog');
                }}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer"
                title={isAr ? 'العودة للمعرض' : 'Back to Catalog'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    spatialSound.playPinchTap();
                    if (navigator.share) {
                      navigator.share({
                        title: isAr ? currentArtifact.title.ar : currentArtifact.title.en,
                        text: isAr ? currentArtifact.description.ar : currentArtifact.description.en,
                        url: window.location.href,
                      });
                    }
                  }}
                  className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer"
                  title={isAr ? 'مشاركة' : 'Share'}
                >
                  <Share className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => toggleLike(currentArtifact.id, e)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer ${
                    liked[currentArtifact.id] ? 'bg-rose-500 text-white' : 'bg-white/15 hover:bg-white/25'
                  }`}
                  title={isAr ? 'إضافة للمفضلة' : 'Favorite'}
                >
                  <Heart className={`w-4 h-4 ${liked[currentArtifact.id] ? 'fill-white' : ''}`} />
                </button>
              </div>
            </div>

            {currentMoonRecord ? (
              /* Catalogued in Moon: everything below comes from the live Moon record. */
              <div className="my-4">
                <MoonRecordPanel load={currentMoonRecord} lang={lang} />
              </div>
            ) : (
            <>
            {/* Title */}
            <div className="space-y-1.5 my-3">
              <h1 className="text-[28px] font-bold leading-tight tracking-tight">
                {isAr ? currentArtifact.title.ar : currentArtifact.title.en}
              </h1>
              <p className="text-[13px] text-white/70">
                {isAr ? (currentArtifact.subtitle?.ar || currentArtifact.period.ar) : (currentArtifact.subtitle?.en || currentArtifact.period.en)}
              </p>
            </div>

            {/* Description Paragraph */}
            <p className="text-[13px] leading-relaxed text-white/80 font-light mb-3">
              {isAr ? currentArtifact.description.ar : currentArtifact.description.en}
            </p>

            <div className="mb-3">
              <SpeakingPanel facts={factsFromArtifact(currentArtifact, lang)} lang={lang} model={currentArtifact.model.glb} />
            </div>

            {/* Item Code Badge */}
            <div className="mb-3">
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-[11px] font-mono text-white/80 border border-white/10">
                {isAr ? 'رقم القطعة' : 'Item Code'}: {currentArtifact.itemCode}
              </span>
            </div>

            {/* Collapsible Accordions (Piece Details, Dimensions, Delivery, Assembly) */}
            <div className="border-t border-white/15 divide-y divide-white/15 my-2">
              {/* 1. تفاصيل القطعة */}
              <div className="py-2.5">
                <button
                  onClick={() => toggleAccordion('details')}
                  className="w-full flex items-center justify-between text-[13.5px] font-semibold text-white/90 hover:text-white cursor-pointer"
                >
                  <span>تفاصيل القطعة (Details)</span>
                  <Plus className={`w-4 h-4 transition-transform ${openAccordion === 'details' ? 'rotate-45' : ''}`} />
                </button>
                {openAccordion === 'details' && (
                  <div className="pt-2 text-[12px] text-white/70 space-y-1 font-light leading-relaxed">
                    <p><strong className="text-white/90">المادة:</strong> {currentArtifact.details.material.ar}</p>
                    <p><strong className="text-white/90">الحالة:</strong> {currentArtifact.details.condition.ar}</p>
                    {currentArtifact.details.binding && (
                      <p><strong className="text-white/90">التجليد:</strong> {currentArtifact.details.binding.ar}</p>
                    )}
                    {currentArtifact.details.decoration && (
                      <p><strong className="text-white/90">الزخرفة:</strong> {currentArtifact.details.decoration.ar}</p>
                    )}
                  </div>
                )}
              </div>

              {/* 2. القياسات */}
              <div className="py-2.5">
                <button
                  onClick={() => toggleAccordion('dimensions')}
                  className="w-full flex items-center justify-between text-[13.5px] font-semibold text-white/90 hover:text-white cursor-pointer"
                >
                  <span>القياسات (Measurements)</span>
                  <Plus className={`w-4 h-4 transition-transform ${openAccordion === 'dimensions' ? 'rotate-45' : ''}`} />
                </button>
                {openAccordion === 'dimensions' && (
                  <div className="pt-2 text-[12px] text-white/70 font-light">
                    <p><strong className="text-white/90">الأبعاد:</strong> {currentArtifact.details.dimensions}</p>
                  </div>
                )}
              </div>

            </div>

            <p className="text-[11.5px] text-white/50 leading-relaxed">
              {isAr
                ? 'هذه القطعة غير مفهرسة في مون بعد؛ تُعرض بياناتها المحلية إلى أن تُفهرس.'
                : 'This object is not catalogued in Moon yet; its local details show until it is.'}
            </p>
            </>
            )}

            {/* Museum Heritage 3D Room Exploration Action (Image 3 Stepper & Cart removed) */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                onClick={() => triggerARPreviewInSpace(currentArtifact)}
                className="vision-btn h-11 w-11 rounded-full bg-amber-400 hover:bg-amber-300 text-stone-950 shadow-lg flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                aria-label="Preview artifact in the room"
                title="Preview artifact in the room"
              >
                <Box className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 3: ROOM BENTO GALLERY (360° Hotspot Gallery)
         ───────────────────────────────────────────────────────────── */}
      {view === 'room-bento' && (
        <div className="w-full h-full overflow-y-auto p-6 space-y-5 text-white pointer-events-auto custom-scrollbar">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                spatialSound.playPinchTap();
                transitionToView('catalog');
              }}
              className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white px-3 py-1.5 rounded-full bg-white/15 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Catalog</span>
            </button>
            <h2 className="text-lg font-bold">Room Hotspot Gallery</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {artifacts.slice(0, 4).map((art, idx) => (
              <div
                key={art.id}
                onClick={() => {
                  spatialSound.playPinchTap();
                  setActiveArtifactIndex(idx);
                  transitionToView('detail');
                }}
                className="rounded-2xl bg-white/10 p-4 border border-white/15 hover:bg-white/20 transition cursor-pointer flex flex-col justify-between h-48"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-cyan-300">Hotspot #{idx + 1}</span>

                </div>
                <div>
                  <h3 className="font-bold text-sm">{art.title.ar}</h3>
                  <p className="text-xs text-white/70">{art.title.en}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerARPreviewInSpace(art);
                  }}
                  className="w-full py-1.5 rounded-full bg-stone-700/60 hover:bg-stone-700 text-xs font-medium flex items-center justify-center gap-2"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Deploy in your room</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          VIEW 4: IPHONE DUO FOLD MECHANICAL CAROUSEL (Kareem-AEz/iphone-duo-fold-carousel)
         ───────────────────────────────────────────────────────────── */}
      {view === 'duo-fold' && (
        <div className="w-full h-full overflow-y-auto p-4 flex flex-col items-center justify-center pointer-events-auto">
          <AlqamiDuoFoldShowcase
            initialIndex={activeArtifactIndex}
            lang={lang}
            onClose={() => transitionToView('catalog')}
            onSelectArtifact={(art) => {
              const idx = artifacts.findIndex((a) => a.id === art.id);
              if (idx >= 0) setActiveArtifactIndex(idx);
              transitionToView('detail');
            }}
          />
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────
          VISIONOS AR QUICK LOOK QR CODE GENERATOR MODAL (User Request)
         ───────────────────────────────────────────────────────────── */}
      {showQrModal && (
        <div
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xl p-4 animate-in fade-in duration-200 pointer-events-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-[32px] bg-stone-900/95 border border-white/20 p-6 flex flex-col items-center text-center shadow-[0_30px_90px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.15)] space-y-4"
          >
            {/* Close Button */}
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center justify-center cursor-pointer transition active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono tracking-wider text-amber-300 uppercase px-2.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30">
                AR Quick Look QR Code
              </span>
              <h3 className="text-lg font-bold text-white pt-1">
                {isAr ? currentArtifact.title.ar : currentArtifact.title.en}
              </h3>
              <p className="text-xs text-white/70">
                {isAr
                  ? 'امسح الرمز بكاميرا هاتفك لمعاينة المجسم في غرفتك فوراً'
                  : 'Scan with your iPhone camera to place this 3D model in your space'}
              </p>
            </div>

            {/* Generated QR Code Card */}
            <div className="p-3.5 rounded-2xl bg-white shadow-2xl relative flex items-center justify-center group">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="AR Mode QR Code"
                  className="w-56 h-56 object-contain rounded-xl select-none"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-stone-500 text-xs">
                  Generating QR Code...
                </div>
              )}
            </div>

            {/* Action Buttons: Copy Link & Done */}
            <div className="w-full flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  spatialSound.playPinchTap();
                  const arUrl = new URL(roomViewUrl(currentArtifact.model.glb, isAr ? currentArtifact.title.ar : currentArtifact.title.en), window.location.href).href;
                  navigator.clipboard.writeText(arUrl);
                  setQrCopied(true);
                  setTimeout(() => setQrCopied(false), 2000);
                }}
                className="flex-1 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
              >
                {qrCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{qrCopied ? (isAr ? 'تم نسخ الرابط!' : 'Copied Link!') : (isAr ? 'نسخ الرابط' : 'Copy Link')}</span>
              </button>

              <button
                onClick={() => setShowQrModal(false)}
                className="h-10 px-5 rounded-full bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs cursor-pointer transition active:scale-95 shadow-md"
              >
                {isAr ? 'تم' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
