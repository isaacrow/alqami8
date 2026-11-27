import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ScanLine,
  LayoutGrid,
  Camera,
  Rotate3d,
  Users,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Aperture,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  Box,
  Feather,
  Swords,
  Mic,
  ArrowLeftRight,
} from 'lucide-react';
import { useAlqamiArtifacts } from '../../moon/moonObjects';
import type { AlqamiArtifact } from '../../data/alqamiArtifacts';
import { AlqamiArtifact3DCanvas } from '../three/AlqamiArtifact3DCanvas';
import { assetUrl } from '../../utils/assetUrl';
import { spatialSound } from '../../utils/spatialSound';
import { getInitialDeletedMap, subscribeDeletedItems } from '../../utils/deletedItemsStore';
import { Alqami3RdfGraph } from './Alqami3RdfGraph';
import './alqami3Mobile.css';

export interface Alqami3MobileShellProps {
  lang: 'ar' | 'en';
  onToggleLang: (lang: 'ar' | 'en') => void;
  onSwitchToOriginal: () => void;
  onOpenScan: () => void;
  onToggleSpatialWorld: () => void;
  spatialWorldActive: boolean;
  /** Optional artifact ID pushed from the ARKit scanner when a user scans an item */
  selectedArtifactId?: string | null;
  onClearExternalSelection?: () => void;
}

type HudTab = 'meta' | 'desc' | 'graph' | 'editor';
type CollectionFilter =
  | 'all'
  | 'ane'
  | 'alkafeel'
  | 'manuscripts'
  | 'islamic-art'
  | 'heritage'
  | 'history';

const CHARACTERS = [
  {
    key: 'jawahiri',
    href: './jawahiri.html',
    ar: 'محمد مهدي الجواهري',
    en: 'Al-Jawahiri',
    roleAr: 'شاعر العرب الأكبر',
    roleEn: 'Great Iraqi Poet',
    bg: 'radial-gradient(circle at 50% 30%, #6b5536, #1a140c)',
    Icon: Feather,
  },
  {
    key: 'mutanabbi',
    href: './mutanabbi.html',
    ar: 'أبو الطيب المتنبي',
    en: 'Al-Mutanabbi',
    roleAr: 'شاعر العربية الخالد',
    roleEn: 'Classical Arab Poet',
    bg: 'radial-gradient(circle at 50% 30%, #7a5a2e, #1a1209)',
    Icon: Swords,
  },
  {
    key: 'waili',
    href: './waili.html',
    ar: 'الشيخ أحمد الوائلي',
    en: 'Sheikh Al-Waili',
    roleAr: 'عميد المنبر الحسيني',
    roleEn: 'Scholar & Orator',
    bg: 'radial-gradient(circle at 50% 30%, #4a3a2a, #120d08)',
    Icon: Mic,
  },
] as const;

function buildTurtle(art: AlqamiArtifact): string {
  const esc = (s: string) => (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const uri = art.uri || `https://alqami.net/artifact/${art.slug}`;
  return [
    `@prefix dcterms: <http://purl.org/dc/terms/> .`,
    `@prefix schema:  <https://schema.org/> .`,
    `@prefix alqami:  <https://alqami.net/ontology/> .`,
    ``,
    `<${uri}>`,
    `  a alqami:CulturalArtifact ;`,
    `  dcterms:identifier "${esc(art.id)}" ;`,
    `  dcterms:title "${esc(art.title.ar)}"@ar, "${esc(art.title.en)}"@en ;`,
    `  dcterms:creator "${esc(art.creator.ar)}"@ar, "${esc(art.creator.en)}"@en ;`,
    `  dcterms:date "${esc(art.period.ar)}"@ar, "${esc(art.period.en)}"@en ;`,
    `  dcterms:publisher "${esc(art.institution.ar)}"@ar ;`,
    `  dcterms:extent "${esc(art.details.dimensions)}" ;`,
    `  dcterms:medium "${esc(art.details.material.ar)}"@ar ;`,
    `  dcterms:description "${esc(art.description.ar)}"@ar ;`,
    `  schema:encodingFormat "model/gltf-binary" ;`,
    `  alqami:modelUrl "${esc(art.model.glb)}" .`,
  ].join('\n');
}

function artifactCollection(art: AlqamiArtifact): CollectionFilter {
  if (art.id.startsWith('ANE-') || art.model.glb.includes('/ane/')) return 'ane';
  if (art.id.startsWith('KFL-') || art.model.glb.includes('/alkafeel/')) return 'alkafeel';
  if (art.category === 'manuscripts') return 'manuscripts';
  if (art.category === 'islamic-art') return 'islamic-art';
  if (art.category === 'history') return 'history';
  return 'heritage';
}

export const Alqami3MobileShell: React.FC<Alqami3MobileShellProps> = ({
  lang,
  onToggleLang,
  onSwitchToOriginal,
  onOpenScan,
  onToggleSpatialWorld,
  spatialWorldActive,
  selectedArtifactId,
  onClearExternalSelection,
}) => {
  const isAr = lang === 'ar';
  const allRawArtifacts = useAlqamiArtifacts();
  const [deletedMap, setDeletedMap] = useState<Record<string, boolean>>(() => getInitialDeletedMap());

  useEffect(() => {
    return subscribeDeletedItems(setDeletedMap);
  }, []);

  const artifacts = useMemo(
    () => allRawArtifacts.filter((a) => !deletedMap[a.id] && Boolean(a.model?.glb)),
    [allRawArtifacts, deletedMap]
  );

  // Default to Nahj al-Balagha or first artifact
  const [currentId, setCurrentId] = useState<string>(() => {
    try {
      return localStorage.getItem('alqami3_selected_id') || 'ALQ-MSS-006';
    } catch {
      return 'ALQ-MSS-006';
    }
  });

  // Sync external selection from ARKit scanner
  useEffect(() => {
    if (selectedArtifactId && artifacts.some((a) => a.id === selectedArtifactId)) {
      setCurrentId(selectedArtifactId);
      onClearExternalSelection?.();
    }
  }, [selectedArtifactId, artifacts, onClearExternalSelection]);

  const currentArtifact = useMemo<AlqamiArtifact | undefined>(() => {
    return artifacts.find((a) => a.id === currentId) || artifacts[0];
  }, [artifacts, currentId]);

  const selectArtifact = useCallback((art: AlqamiArtifact) => {
    spatialSound.playPinchTap();
    setCurrentId(art.id);
    try {
      localStorage.setItem('alqami3_selected_id', art.id);
    } catch {
      // ignore storage quota errors
    }
    setMenuOpen(false);
  }, []);

  // UI State
  const [activeTab, setActiveTab] = useState<HudTab>('meta');
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLive3D, setShowLive3D] = useState(false);
  const [popOutArtifact, setPopOutArtifact] = useState<AlqamiArtifact | null>(null);
  const [shownCount, setShownCount] = useState(24);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [scanModesOpen, setScanModesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all');
  const [speaking, setSpeaking] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [isInteracting3D, setIsInteracting3D] = useState(false);
  const interactTimerRef = useRef<number | null>(null);

  // Live RDF Turtle editor state
  const [ttlDraft, setTtlDraft] = useState('');
  const [ttlSavedToast, setTtlSavedToast] = useState(false);

  useEffect(() => {
    if (currentArtifact) {
      setTtlDraft(buildTurtle(currentArtifact));
    }
  }, [currentArtifact]);

  // Stop speech on unmount or artifact switch
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [currentId]);

  // Filtered list for Item View Menu
  const filteredArtifacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return artifacts.filter((art) => {
      if (collectionFilter !== 'all') {
        const col = artifactCollection(art);
        if (col !== collectionFilter && art.category !== collectionFilter) return false;
      }
      if (!q) return true;
      return (
        art.title.ar.toLowerCase().includes(q) ||
        art.title.en.toLowerCase().includes(q) ||
        art.id.toLowerCase().includes(q) ||
        art.period.ar.toLowerCase().includes(q) ||
        art.period.en.toLowerCase().includes(q) ||
        art.details.material.ar.toLowerCase().includes(q) ||
        art.details.material.en.toLowerCase().includes(q)
      );
    });
  }, [artifacts, collectionFilter, searchQuery]);

  // Dock quick pills: show the current item + curated slice of 24 items for smooth scrolling
  const dockItems = useMemo(() => {
    const base = artifacts.slice(0, 24);
    if (currentArtifact && !base.some((a) => a.id === currentArtifact.id)) {
      return [currentArtifact, ...base.slice(0, 23)];
    }
    return base;
  }, [artifacts, currentArtifact]);

  const handle3DInteractStart = () => {
    if (interactTimerRef.current) window.clearTimeout(interactTimerRef.current);
    setIsInteracting3D(true);
  };

  const handle3DInteractEnd = () => {
    if (interactTimerRef.current) window.clearTimeout(interactTimerRef.current);
    interactTimerRef.current = window.setTimeout(() => {
      setIsInteracting3D(false);
    }, 520);
  };

  const handleToggleAudio = () => {
    spatialSound.playPinchTap();
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !currentArtifact) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const text = isAr
      ? `${currentArtifact.title.ar}. ${currentArtifact.description.ar}`
      : `${currentArtifact.title.en}. ${currentArtifact.description.en}`;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = isAr ? 'ar-SA' : 'en-US';
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const handleSnapshot = () => {
    spatialSound.playPinchTap();
    setFlashActive(true);
    window.setTimeout(() => setFlashActive(false), 180);
    const canvas = document.querySelector<HTMLCanvasElement>('.a3m-stage canvas');
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `alqami-${currentArtifact?.slug || 'artifact'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // ignore tainted canvas if any
    }
  };

  const handleViewInAR = () => {
    spatialSound.playAlqamiChime();
    if (!currentArtifact) return;
    const glb = currentArtifact.model.glb;
    const title = encodeURIComponent(isAr ? currentArtifact.title.ar : currentArtifact.title.en);
    window.location.href = `./ar-viewer.html?model=${encodeURIComponent(glb)}&title=${title}`;
  };

  const filterChips: Array<{ id: CollectionFilter; ar: string; en: string }> = [
    { id: 'all', ar: `الكل (${artifacts.length})`, en: `All (${artifacts.length})` },
    { id: 'ane', ar: 'بلاد الرافدين', en: 'Ancient Near East' },
    { id: 'alkafeel', ar: 'متحف الكفيل', en: 'Al-Kafeel' },
    { id: 'manuscripts', ar: 'المخطوطات', en: 'Manuscripts' },
    { id: 'islamic-art', ar: 'الفن الإسلامي', en: 'Islamic Art' },
    { id: 'heritage', ar: 'التراث', en: 'Heritage' },
    { id: 'history', ar: 'التاريخ', en: 'History' },
  ];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`a3m-root ${lightTheme ? 'a3m-light' : ''}`}
    >
      {/* Fullscreen 3D Background Stage */}
      <div
        className="a3m-stage"
        onPointerDown={handle3DInteractStart}
        onPointerUp={handle3DInteractEnd}
        onPointerCancel={handle3DInteractEnd}
      >
        {currentArtifact && (
          <AlqamiArtifact3DCanvas
            key={currentArtifact.id}
            glbUrl={currentArtifact.model.glb}
            autoRotate
            mode="popout"
            lang={lang}
            className="a3m-stage-canvas"
          />
        )}
      </div>

      {/* Vision Pro Glass UI Layer (Exact Alqami 3 Mobile Architecture) */}
      <div className="a3m-ui">
        <div className="a3m-top-stack">
          {/* Top Bar (Alqami 3 Mobile Sidebar Style) */}
          <div className="a3m-bar a3m-glass">
            <div className="a3m-bar-group">
              {/* Img 2: Round Alqami Logo Button -> AR World Mode */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playAlqamiChime();
                  onToggleSpatialWorld();
                }}
                className="a3m-ar-world-btn"
                style={spatialWorldActive ? { boxShadow: '0 0 0 2px #22d3ee' } : undefined}
                title={isAr ? 'عالم الواقع المعزز · AR World' : 'AR World Mode'}
                aria-label="AR World Mode"
              >
                <img src={assetUrl('alqami-logo.png')} alt="Alqami AR World" />
              </button>

              {/* Img 1: Yellow Scan Pill ("امسح") -> Alqami 8 ARKit Scanner */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  onOpenScan();
                }}
                className="a3m-scan-pill"
                title={isAr ? 'امسح قطعة أو كتاباً' : 'Scan an object or book'}
                aria-label="Scan"
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>{isAr ? 'امسح' : 'Scan'}</span>
              </button>

              {/* Original Alqami 3 Scan Modes (AR Picture Tracking & 360° Closed-Set) */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  setScanModesOpen(true);
                }}
                className="a3m-side-btn"
                title={isAr ? 'مسح علقمي 3 الأصلي (AR و 360°)' : 'Alqami 3 Original Scan (AR & 360°)'}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isAr ? 'مسح AR' : 'AR Scan'}</span>
              </button>

              {/* Item View Menu Button */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  setMenuOpen(true);
                }}
                className={`a3m-side-btn ${menuOpen ? 'active' : ''}`}
                title={isAr ? 'قائمة القطع والنماذج' : 'Item View Menu'}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{isAr ? 'القائمة' : 'Items'}</span>
              </button>

              {/* 3 Talking Characters Button */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  setCharactersOpen(true);
                }}
                className={`a3m-side-btn ${charactersOpen ? 'active' : ''}`}
                title={isAr ? 'الشخصيات الثلاث (الجواهري، المتنبي، الوائلي)' : '3 Talking Characters'}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{isAr ? 'الشخصيات' : 'Characters'}</span>
              </button>
            </div>

            <div className="a3m-divider" />

            <div className="a3m-bar-group">
              {/* Audio Guide */}
              <button
                type="button"
                onClick={handleToggleAudio}
                className={`a3m-side-btn icon-only ${speaking ? 'active' : ''}`}
                title={isAr ? 'الدليل الصوتي' : 'Audio Guide'}
                aria-label="Audio Guide"
              >
                {speaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Language Toggle */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  onToggleLang(isAr ? 'en' : 'ar');
                }}
                className="a3m-side-btn icon-only"
                title={isAr ? 'تبديل اللغة' : 'Switch Language'}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>{isAr ? 'EN' : 'ع'}</span>
              </button>

              {/* Theme Toggle */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  setLightTheme((v) => !v);
                }}
                className="a3m-side-btn icon-only"
                title={isAr ? 'تبديل الخلفية' : 'Toggle Theme'}
                aria-label="Toggle Theme"
              >
                {lightTheme ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* Snapshot */}
              <button
                type="button"
                onClick={handleSnapshot}
                className="a3m-side-btn icon-only"
                title={isAr ? 'التقاط صورة' : 'Snapshot'}
                aria-label="Snapshot"
              >
                <Aperture className="w-4 h-4" />
              </button>

              {/* Switch Back to Mode 1 (Original Alqami 8) */}
              <button
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  onSwitchToOriginal();
                }}
                className="a3m-side-btn a3m-mode-switch-btn"
                title={isAr ? 'التبديل إلى الوضع الأصلي (علقمي 8)' : 'Switch to Original Mode (Alqami 8)'}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>{isAr ? 'الأصلي' : 'Mode 1'}</span>
              </button>
            </div>
          </div>

          {/* Top Model Dock (Alqami 3 Dock + Quick Item Menu Trigger) */}
          <div className={`a3m-dock a3m-glass ${isInteracting3D ? 'hide-ui' : ''}`}>
            <button
              type="button"
              onClick={() => {
                spatialSound.playPinchTap();
                setMenuOpen(true);
              }}
              className="a3m-dock-menu-btn"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{isAr ? `الكل (${artifacts.length})` : `All (${artifacts.length})`}</span>
            </button>

            <div className="a3m-dock-scroll">
              {dockItems.map((art) => {
                const active = currentArtifact?.id === art.id;
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => selectArtifact(art)}
                    className={`a3m-dock-btn ${active ? 'active' : ''}`}
                  >
                    {isAr ? art.title.ar : art.title.en}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Floating AR CTA + 4-Tab Metadata HUD */}
        <div className={`a3m-bottom-stack ${isInteracting3D ? 'hide-ui' : ''}`}>
          <div className="a3m-floating-actions">
            <button type="button" onClick={handleViewInAR} className="a3m-ar-cta a3m-glass">
              <Box className="w-4 h-4" />
              <span>{isAr ? 'عرض في الواقع المعزز (AR)' : 'View in AR'}</span>
            </button>
          </div>

          {currentArtifact && (
            <div className="a3m-hud a3m-glass">
              <div className="a3m-hud-header-row">
                <div className="a3m-hud-title-group">
                  <div className="a3m-hud-title">
                    {isAr ? currentArtifact.title.ar : currentArtifact.title.en}
                  </div>
                  <div className="a3m-hud-subtitle">
                    {isAr ? currentArtifact.period.ar : currentArtifact.period.en} · {currentArtifact.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setHudCollapsed((v) => !v);
                  }}
                  className="a3m-collapse-btn"
                  aria-label={hudCollapsed ? 'Expand' : 'Collapse'}
                >
                  {hudCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {!hudCollapsed && (
                <>
                  <div className="a3m-tab-nav">
                    <button
                      type="button"
                      onClick={() => setActiveTab('meta')}
                      className={`a3m-tab-btn ${activeTab === 'meta' ? 'active' : ''}`}
                    >
                      {isAr ? 'بيانات القطعة' : 'Metadata'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('desc')}
                      className={`a3m-tab-btn ${activeTab === 'desc' ? 'active' : ''}`}
                    >
                      {isAr ? 'الوصف' : 'Description'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('graph')}
                      className={`a3m-tab-btn ${activeTab === 'graph' ? 'active' : ''}`}
                    >
                      {isAr ? 'الرسم البياني' : 'RDF Graph'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('editor')}
                      className={`a3m-tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
                    >
                      {isAr ? 'المحرر' : 'Editor'}
                    </button>
                  </div>

                  <div className="a3m-tab-body">
                    {activeTab === 'meta' && (
                      <div className="a3m-meta-grid">
                        <div className="a3m-meta-card">
                          <div className="a3m-meta-label">{isAr ? 'العنوان / Title' : 'Title'}</div>
                          <div className="a3m-meta-value">
                            {isAr ? currentArtifact.title.ar : currentArtifact.title.en}
                          </div>
                        </div>
                        <div className="a3m-meta-card">
                          <div className="a3m-meta-label">{isAr ? 'المنشئ / Creator' : 'Creator'}</div>
                          <div className="a3m-meta-value">
                            {isAr ? currentArtifact.creator.ar : currentArtifact.creator.en}
                          </div>
                        </div>
                        <div className="a3m-meta-card">
                          <div className="a3m-meta-label">{isAr ? 'الحقبة / Period' : 'Period'}</div>
                          <div className="a3m-meta-value">
                            {isAr ? currentArtifact.period.ar : currentArtifact.period.en}
                          </div>
                        </div>
                        <div className="a3m-meta-card">
                          <div className="a3m-meta-label">{isAr ? 'القياسات / Extent' : 'Dimensions'}</div>
                          <div className="a3m-meta-value">
                            {currentArtifact.details.dimensions || currentArtifact.itemCode}
                          </div>
                        </div>
                        <div className="a3m-meta-card full">
                          <div className="a3m-meta-label">{isAr ? 'المادة / Material' : 'Material'}</div>
                          <div className="a3m-meta-value">
                            {isAr ? currentArtifact.details.material.ar : currentArtifact.details.material.en}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'desc' && (
                      <div>
                        <div className="a3m-meta-label">{isAr ? 'ملاحظات / Description' : 'Description'}</div>
                        <div className="a3m-arabic-desc">
                          {isAr ? currentArtifact.description.ar : currentArtifact.description.en}
                        </div>
                      </div>
                    )}

                    {activeTab === 'graph' && (
                      <Alqami3RdfGraph artifact={currentArtifact} lang={lang} lightTheme={lightTheme} />
                    )}

                    {activeTab === 'editor' && (
                      <div>
                        <textarea
                          className="a3m-ttl-editor"
                          spellCheck={false}
                          value={ttlDraft}
                          onChange={(e) => setTtlDraft(e.target.value)}
                        />
                        <div className="a3m-editor-actions">
                          <button
                            type="button"
                            className="a3m-pill-btn"
                            style={{ color: '#ff453a' }}
                            onClick={() => setTtlDraft(buildTurtle(currentArtifact))}
                          >
                            {isAr ? 'إعادة ضبط' : 'Reset'}
                          </button>
                          <button
                            type="button"
                            className="a3m-pill-btn"
                            style={{ background: '#0a84ff', color: '#ffffff', borderColor: '#0a84ff' }}
                            onClick={() => {
                              setTtlSavedToast(true);
                              window.setTimeout(() => setTtlSavedToast(false), 1600);
                            }}
                          >
                            {ttlSavedToast
                              ? isAr
                                ? 'تم التحديث ✓'
                                : 'Updated ✓'
                              : isAr
                              ? 'تحديث البيانات'
                              : 'Update AR'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =======================================================
          ITEM VIEW MENU MODAL (Browse All 213+ Alqami 8 Models)
         ======================================================= */}
      {menuOpen && (
        <div className="a3m-modal-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="a3m-menu-card" onClick={(e) => e.stopPropagation()}>
            <div className="a3m-menu-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {isAr ? 'قائمة القطع والنماذج ثلاثية الأبعاد' : 'Item View Menu — All 3D Models'}
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.72 }}>
                  {isAr
                    ? `${filteredArtifacts.length} من أصل ${artifacts.length} قطعة أثرية ومخطوطة`
                    : `${filteredArtifacts.length} of ${artifacts.length} artifacts & manuscripts`}
                </div>
              </div>
              <div className="a3m-menu-header-actions">
                {/* Img 2: Round Glass 3D Box Toggle (Live Interactive 3D Models in Menu) */}
                <button
                  type="button"
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setShowLive3D((prev) => !prev);
                  }}
                  className={`a3m-box-btn ${showLive3D ? 'active' : ''}`}
                  title={isAr ? 'تبديل العرض ثلاثي الأبعاد المباشر في القائمة' : 'Toggle live interactive 3D models'}
                  aria-label={isAr ? 'تبديل العرض ثلاثي الأبعاد المباشر' : 'Toggle live 3D models'}
                  aria-pressed={showLive3D}
                >
                  <Box className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="a3m-menu-close-btn"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="a3m-menu-search-wrap">
              <div style={{ position: 'relative' }}>
                <Search
                  className="w-4 h-4"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    [isAr ? 'right' : 'left']: 12,
                    opacity: 0.55,
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShownCount(24);
                  }}
                  placeholder={isAr ? 'ابحث باسم القطعة، الحقبة، المادة، أو الرمز…' : 'Search by name, period, material, or ID…'}
                  className="a3m-search-input"
                  style={{
                    [isAr ? 'paddingRight' : 'paddingLeft']: 36,
                  }}
                />
              </div>

              <div className="a3m-filter-row">
                {filterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setCollectionFilter(chip.id);
                      setShownCount(24);
                    }}
                    className={`a3m-filter-chip ${collectionFilter === chip.id ? 'active' : ''}`}
                  >
                    {isAr ? chip.ar : chip.en}
                  </button>
                ))}
              </div>
            </div>

            <div className="a3m-item-grid">
              {filteredArtifacts.slice(0, shownCount).map((art) => {
                const selected = currentArtifact?.id === art.id;
                return (
                  <div
                    key={art.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectArtifact(art)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectArtifact(art);
                      }
                    }}
                    className={`a3m-item-card ${selected ? 'selected' : ''}`}
                  >
                    <div className="a3m-item-thumb">
                      {showLive3D ? (
                        <AlqamiArtifact3DCanvas
                          key={`${art.id}-card3d`}
                          glbUrl={art.model.glb}
                          autoRotate
                          mode="card"
                          lang={lang}
                          className="w-full h-full"
                        />
                      ) : (
                        <img
                          src={
                            art.id.startsWith('ANE-')
                              ? assetUrl(`/images/thumbs/${art.id}.webp`)
                              : assetUrl(art.image)
                          }
                          onError={(e) => {
                            const fallback = assetUrl(art.image);
                            if (e.currentTarget.src !== fallback) {
                              e.currentTarget.src = fallback;
                            }
                          }}
                          alt={isAr ? art.title.ar : art.title.en}
                          loading="lazy"
                        />
                      )}
                      {/* Img 2: Round Glass 3D Box Button on each card -> Pop-out 3D Inspection */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          spatialSound.playPinchTap();
                          setPopOutArtifact(art);
                        }}
                        className="a3m-card-box-btn"
                        title={isAr ? 'فحص النموذج ثلاثي الأبعاد' : 'Inspect 3D Model'}
                        aria-label={isAr ? 'فحص النموذج ثلاثي الأبعاد' : 'Inspect 3D Model'}
                      >
                        <Box className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="a3m-item-body">
                      <div className="a3m-item-title">{isAr ? art.title.ar : art.title.en}</div>
                      <div className="a3m-item-meta">
                        {isAr ? art.period.ar : art.period.en}
                      </div>
                    </div>
                  </div>
                );
              })}

              {shownCount < filteredArtifacts.length && (
                <button
                  type="button"
                  onClick={() => setShownCount((c) => c + 24)}
                  className="a3m-load-more-btn"
                >
                  {isAr
                    ? `عرض المزيد (${filteredArtifacts.length - shownCount} متبقي)`
                    : `Load more (${filteredArtifacts.length - shownCount} remaining)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================
          3 TALKING CHARACTERS MODAL (Jawahiri, Mutanabbi, Waili)
         ======================================================= */}
      {charactersOpen && (
        <div className="a3m-modal-backdrop" onClick={() => setCharactersOpen(false)}>
          <div className="a3m-menu-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="a3m-menu-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {isAr ? 'الشخصيات التفاعلية الثلاث' : '3 Interactive Talking Characters'}
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.65 }}>
                  {isAr ? 'اختر شخصية للتحاور معها بالصوت والواقع المعزز' : 'Choose a character to converse with in 3D'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCharactersOpen(false)}
                className="a3m-collapse-btn"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="a3m-char-grid">
              {CHARACTERS.map((char) => {
                const Icon = char.Icon;
                return (
                  <a
                    key={char.key}
                    href={char.href}
                    className="a3m-char-card"
                    onClick={() => spatialSound.playPinchTap()}
                  >
                    <div className="a3m-char-avatar" style={{ background: char.bg }}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {isAr ? char.ar : char.en}
                    </div>
                    <div style={{ fontSize: 11.5, opacity: 0.7 }}>
                      {isAr ? char.roleAr : char.roleEn}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================
          SCAN MODES SHEET (Original Alqami 3 Scans + Img 1 Scan)
         ======================================================= */}
      {scanModesOpen && (
        <div className="a3m-modal-backdrop" onClick={() => setScanModesOpen(false)}>
          <div className="a3m-menu-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="a3m-menu-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {isAr ? 'أوضاع المسح والتعرّف' : 'Scan & Recognition Modes'}
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.65 }}>
                  {isAr ? 'مسح علقمي 8 الذكي + أوضاع مسح علقمي 3 الأصلية' : 'Alqami 8 Smart Scan + Original Alqami 3 Scans'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScanModesOpen(false)}
                className="a3m-collapse-btn"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="a3m-char-grid">
              <button
                type="button"
                className="a3m-char-card"
                onClick={() => {
                  spatialSound.playPinchTap();
                  setScanModesOpen(false);
                  onOpenScan();
                }}
              >
                <div className="a3m-char-avatar" style={{ background: 'linear-gradient(180deg, #ffd60a, #f59e0b)', color: '#000' }}>
                  <ScanLine className="w-6 h-6" />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {isAr ? 'امسح (علقمي 8)' : 'Scan (Alqami 8)'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {isAr ? 'التعرّف الذكي و QR والباركود' : 'Smart AI, QR & Barcode'}
                </div>
              </button>

              <a
                href="./alqami3-scan.html"
                className="a3m-char-card"
                onClick={() => spatialSound.playPinchTap()}
              >
                <div className="a3m-char-avatar" style={{ background: 'linear-gradient(180deg, #0ea5e9, #0369a1)' }}>
                  <Camera className="w-6 h-6" />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {isAr ? 'مسح AR (علقمي 3)' : 'AR Scan (Alqami 3)'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {isAr ? 'تتبع صور المخطوطات الأصلي' : 'Original Picture Tracking'}
                </div>
              </a>

              <a
                href="./alqami3-360.html"
                className="a3m-char-card"
                onClick={() => spatialSound.playPinchTap()}
              >
                <div className="a3m-char-avatar" style={{ background: 'linear-gradient(180deg, #14b8a6, #0f766e)' }}>
                  <Rotate3d className="w-6 h-6" />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {isAr ? 'التعرّف 360° (علقمي 3)' : '360° Scan (Alqami 3)'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {isAr ? 'التعرف المغلق من كل الجهات' : 'Closed-Set 360° Recognition'}
                </div>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================
          POP-OUT 3D MODEL INSPECTOR (Img 2 Box Button Action)
         ======================================================= */}
      {popOutArtifact && (
        <div className="a3m-popout-backdrop" onClick={() => setPopOutArtifact(null)}>
          <div className="a3m-popout-stage" onClick={(e) => e.stopPropagation()}>
            <AlqamiArtifact3DCanvas
              key={`${popOutArtifact.id}-popout`}
              glbUrl={popOutArtifact.model.glb}
              autoRotate
              mode="popout"
              lang={lang}
              className="w-full h-full"
            />
          </div>
          <div className="a3m-popout-bar" onClick={(e) => e.stopPropagation()}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isAr ? popOutArtifact.title.ar : popOutArtifact.title.en}
              </div>
              <div style={{ fontSize: 11, opacity: 0.72 }}>
                {isAr ? popOutArtifact.period.ar : popOutArtifact.period.en}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                selectArtifact(popOutArtifact);
                setPopOutArtifact(null);
              }}
              className="a3m-pill-btn"
              style={{ background: '#0a84ff', color: '#ffffff', borderColor: '#0a84ff' }}
            >
              {isAr ? 'فتح القطعة' : 'Select'}
            </button>
            <button
              type="button"
              onClick={() => setPopOutArtifact(null)}
              className="a3m-menu-close-btn"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Snapshot Camera Flash */}
      <div className={`a3m-flash ${flashActive ? 'active' : ''}`} />
    </div>
  );
};

export default Alqami3MobileShell;
