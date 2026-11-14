import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  LayoutGrid,
  Search,
  User,
  Heart,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Share,
  Plus,
  Copy,
  Sidebar,
  Image,
  Film,
  ChevronDown,
  Undo2,
  Redo2,
  ListChecks,
  Table,
  PenTool,
} from 'lucide-react';
import { AppId, EnvironmentId, WindowState } from './types/spatial';
import type { XRHardwareState } from './components/xr/RealARXREngine';
import { assetUrl } from './utils/assetUrl';
import { SpatialWindow } from './components/shell/SpatialWindow';
import { ControlCenter3Panel } from './components/shell/ControlCenter3Panel';
import { HomeViewLauncher } from './components/shell/HomeViewLauncher';
import { SpatialKeyboard } from './components/shell/SpatialKeyboard';
import { spatialSound } from './utils/spatialSound';
import type { SpatialWorldPanelControls } from './components/xr/spatial/SpatialWorld';
import { requestMotionPermission } from './components/xr/spatial/motionPermission';

const SpatialWorldStage = lazy(() => import('./components/xr/spatial/SpatialWorld'));

const RealARXREngine = lazy(() =>
  import('./components/xr/RealARXREngine').then((module) => ({ default: module.RealARXREngine }))
);
const AlqamiSpatialApp = lazy(() =>
  import('./components/apps/AlqamiSpatialApp').then((module) => ({ default: module.AlqamiSpatialApp }))
);
import { ChromaticWaveWallpaper } from './components/effects/ChromaticWaveWallpaper';
import { PhoneCameraButton } from './remoteCam/PhoneCameraButton';

const IkeaSpatialApp = lazy(() =>
  import('./components/apps/IkeaSpatialApp').then((module) => ({ default: module.IkeaSpatialApp }))
);
const MessagesGenmojiApp = lazy(() =>
  import('./components/apps/MessagesGenmojiApp').then((module) => ({ default: module.MessagesGenmojiApp }))
);
const ImagePlaygroundApp = lazy(() =>
  import('./components/apps/ImagePlaygroundApp').then((module) => ({ default: module.ImagePlaygroundApp }))
);
const PhotosMemoryApp = lazy(() =>
  import('./components/apps/PhotosMemoryApp').then((module) => ({ default: module.PhotosMemoryApp }))
);
const NotesSpatialApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.NotesSpatialApp }))
);
const SafariSpatialApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.SafariSpatialApp }))
);
const SpotlightSearchApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.SpotlightSearchApp }))
);
const SiriAISpatialApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.SiriAISpatialApp }))
);
const QuickLookUSDZApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.QuickLookUSDZApp }))
);
const PlanetEarthVolumeApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.PlanetEarthVolumeApp }))
);
const ObjectTrackingApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.ObjectTrackingApp }))
);
const MacVirtualDisplayApp = lazy(() =>
  import('./components/apps/NotesSafariSpotlightSiriApps').then((module) => ({ default: module.MacVirtualDisplayApp }))
);
const SpatialAirCanvasApp = lazy(() =>
  import('./components/apps/SpatialAirCanvasApp').then((module) => ({ default: module.SpatialAirCanvasApp }))
);
const SpatialWorldAnchorsApp = lazy(() =>
  import('./components/apps/SpatialWorldAnchorsApp').then((module) => ({ default: module.SpatialWorldAnchorsApp }))
);
const Spatial3DStudioApp = lazy(() =>
  import('./components/apps/Spatial3DStudioApp').then((module) => ({ default: module.Spatial3DStudioApp }))
);
const SpatialToolsHubApp = lazy(() =>
  import('./components/apps/SpatialToolsHubApp').then((module) => ({ default: module.SpatialToolsHubApp }))
);
const isTouchPhone = () =>
  /iPhone|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;

const AlqamiARKitObjectScanner = lazy(() =>
  import('./components/apps/AlqamiARKitObjectScanner').then((module) => ({
    default: module.AlqamiARKitObjectScanner,
  }))
);

const getInitialWindows = (): Record<AppId, WindowState> => {
  const isClient = typeof window !== 'undefined';
  const screenW = isClient ? window.innerWidth : 1280;
  const screenH = isClient ? window.innerHeight : 800;
  // Start maximized/large to match img 1 (User Request)
  const bigWidth = Math.min(1360, Math.max(1040, screenW - 48));
  const bigHeight = Math.min(840, Math.max(720, screenH - 64));

  return {
    ikea: {
      id: 'ikea',
      title: 'علقمي · Alqami Islamic Heritage Spatial Museum',
      isOpen: true,
      x: 0,
      y: -10,
      z: 20,
      width: bigWidth,
      height: bigHeight,
      zIndex: 30,
    },
  messages: {
    id: 'messages',
    title: 'Messages',
    isOpen: false,
    x: -40,
    y: -10,
    z: 25,
    width: 860,
    height: 540,
    zIndex: 25,
  },
  playground: {
    id: 'playground',
    title: 'Image Playground',
    isOpen: false,
    x: 20,
    y: -10,
    z: 30,
    width: 680,
    height: 550,
    zIndex: 26,
  },
  photos: {
    id: 'photos',
    title: 'Photos Memory Movie',
    isOpen: false,
    x: 0,
    y: -15,
    z: 25,
    width: 880,
    height: 520,
    zIndex: 24,
  },
  notes: {
    id: 'notes',
    title: 'Notes',
    isOpen: false,
    x: 0,
    y: -85,
    z: 10,
    width: 860,
    height: 460,
    zIndex: 22,
  },
  safari: {
    id: 'safari',
    title: 'Safari — numastays.com',
    isOpen: false,
    x: 0,
    y: -10,
    z: 20,
    width: 860,
    height: 520,
    zIndex: 21,
  },
  search: {
    id: 'search',
    title: 'Spotlight Search',
    isOpen: false,
    x: 0,
    y: -80,
    z: 20,
    width: 780,
    height: 440,
    zIndex: 27,
  },
  siri: {
    id: 'siri',
    title: 'Siri AI',
    isOpen: false,
    x: 20,
    y: -55,
    z: 40,
    width: 440,
    height: 470,
    zIndex: 35,
  },
  quicklook: {
    id: 'quicklook',
    title: 'Quick Look — Chair_V3.usdz',
    isOpen: false,
    x: 0,
    y: -10,
    z: 45,
    width: 680,
    height: 530,
    zIndex: 32,
  },
  earth: {
    id: 'earth',
    title: 'Hello World — Planet Earth',
    isOpen: false,
    x: 0,
    y: -10,
    z: 35,
    width: 920,
    height: 500,
    zIndex: 31,
  },
  'object-tracking': {
    id: 'object-tracking',
    title: 'visionOS 2 3D Object Tracking',
    isOpen: false,
    x: 0,
    y: -10,
    z: 25,
    width: 860,
    height: 510,
    zIndex: 28,
  },
  'mac-display': {
    id: 'mac-display',
    title: 'Mac Virtual Display (32:9 Curved)',
    isOpen: false,
    x: 0,
    y: -25,
    z: 15,
    width: 1180,
    height: 520,
    curved: true,
    zIndex: 29,
  },
  aircanvas: {
    id: 'aircanvas',
    title: 'Spatial Air Canvas',
    isOpen: false,
    x: 0,
    y: -10,
    z: 25,
    width: 860,
    height: 520,
    zIndex: 33,
  },
  anchors: {
    id: 'anchors',
    title: 'GPS & Compass AR Anchors',
    isOpen: false,
    x: 0,
    y: -10,
    z: 25,
    width: 860,
    height: 520,
    zIndex: 34,
  },
  studio3d: {
    id: 'studio3d',
    title: 'Spatial 3D Studio & PBR Lab',
    isOpen: false,
    x: 0,
    y: -10,
    z: 25,
    width: 980,
    height: 560,
    zIndex: 35,
  },
  'tools-hub': {
    id: 'tools-hub',
    title: 'Spatial AR/XR & 3D Power Tools Hub (100 Tools)',
    isOpen: false,
    x: 0,
    y: -10,
    z: 25,
    width: 1040,
    height: 580,
    zIndex: 36,
  },
  };
};

const INITIAL_WINDOWS = getInitialWindows();

export function App() {
  const domOverlayRootRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Real Hardware AR / XR State
  const [xrState, setXrState] = useState<XRHardwareState>({
    cameraActive: false,
    cameraFacing: 'environment',
    gyroActive: false,
    handTrackingActive: false,
    webxrSupported: false,
    webxrSessionActive: false,
    arPlacementMode: false,
    headRotation: { yaw: 0, pitch: 0, roll: 0 },
    ambientRGB: { r: 62, g: 58, b: 54 },
    hitTestSurfaceDetected: false,
  });

  // Spatial OS Shell State
  const [windows, setWindows] = useState<Record<AppId, WindowState>>(getInitialWindows);
  const [topZ, setTopZ] = useState(40);
  const [homeOpen, setHomeOpen] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [currentEnv, setCurrentEnv] = useState<EnvironmentId>('living-room');
  const [immersionLevel, setImmersionLevel] = useState<number>(65);
  const [isArkitScannerOpen, setIsArkitScannerOpen] = useState(false);
  const [ikeaActiveNav, setIkeaActiveNav] = useState<'grid' | 'search' | 'user' | 'favorites' | 'cart'>('grid');
  const [lang, setLang] = useState<'ar' | 'en'>(() => {
    try {
      return (localStorage.getItem('alqami_lang') as 'ar' | 'en') || 'ar';
    } catch {
      return 'ar';
    }
  });

  useEffect(() => {
    const bgUrl = assetUrl('images/custom_room_bg.png');
    document.body.style.backgroundImage = `url("${bgUrl}")`;
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundPosition = 'center center';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundColor = '#08080a';
  }, []);

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

  useEffect(() => {
    const onOpenScanner = () => setIsArkitScannerOpen(true);
    window.addEventListener('visionos:open-arkit-scanner', onOpenScanner);
  return () => window.removeEventListener('visionos:open-arkit-scanner', onOpenScanner);
  }, []);

  useEffect(() => {
    const handleSearchState = (e: Event) => {
      const ce = e as CustomEvent<{ open: boolean }>;
      if (ce.detail?.open) {
        setIkeaActiveNav('search');
      } else {
        setIkeaActiveNav('grid');
      }
    };
    window.addEventListener('visionos:search-state', handleSearchState);
    return () => window.removeEventListener('visionos:search-state', handleSearchState);
  }, []);

  // Spatial 3D Keyboard State & Synced App Text
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardTarget, setKeyboardTarget] = useState<'notes' | 'search' | 'custom'>('notes');
  const [noteBody, setNoteBody] = useState(
    `– Co-authored by Fleur Lasseur and Ryan Notch\n– Research support from Schoberl College MA students\n– Split focus between\n  – art placed in public space (i.e. large sculptures, murals)\n  – art accessible by the public (free museums)\n– First draft under review\n– Send paper through review once this group has reviewed second draft`
  );
  const [spotlightQuery, setSpotlightQuery] = useState('doc');
  const [customKeyboardText, setCustomKeyboardText] = useState('');
  const customKeyboardCallbackRef = useRef<((v: string) => void) | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
  return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('webxr-active', xrState.webxrSessionActive);
    document.body.classList.toggle('camera-passthrough-active', xrState.cameraActive || Boolean(xrState.spatialWorldActive));
  return () => {
      document.body.classList.remove('webxr-active', 'camera-passthrough-active');
    };
  }, [xrState.webxrSessionActive, xrState.cameraActive, xrState.spatialWorldActive]);

  // Start hand gestures only after Safari has a real camera stream. Starting the hand
  // tracker while getUserMedia is still pending makes it request a second camera stream.
  // Auto-start happens once per visit to the world (so the hand button can turn it off again), and never on
  // phones, where the tracker on top of the camera and the 3D world runs Safari out of memory.
  const handAutoStartedRef = useRef(false);
  useEffect(() => {
    if (!xrState.spatialWorldActive) {
      handAutoStartedRef.current = false;
      return;
    }
    if (!xrState.cameraActive || xrState.handTrackingActive || handAutoStartedRef.current || isTouchPhone()) return;
    handAutoStartedRef.current = true;
    setXrState((prev) =>
      prev.spatialWorldActive && prev.cameraActive && !prev.handTrackingActive
        ? { ...prev, handTrackingActive: true }
        : prev
    );
  }, [xrState.spatialWorldActive, xrState.cameraActive, xrState.handTrackingActive, setXrState]);

  // Desktop room-look fallback; real device orientation is handled separately by the sensor engine.
  const [cameraLook, setCameraLook] = useState({ yaw: 0, pitch: 0 });
  const [isRoomGliding, setIsRoomGliding] = useState(false);
  const isPanningRoomRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, yaw: 0, pitch: 0 });
  const panLastMoveRef = useRef({ mx: 0, my: 0, time: 0 });
  const panVelocityRef = useRef({ yaw: 0, pitch: 0 });
  const roomGlideFrameRef = useRef(0);

  const beginRoomPan = (mx: number, my: number) => {
    cancelAnimationFrame(roomGlideFrameRef.current);
    setIsRoomGliding(false);
    isPanningRoomRef.current = true;
    panStartRef.current = { mx, my, yaw: cameraLook.yaw, pitch: cameraLook.pitch };
    panLastMoveRef.current = { mx, my, time: performance.now() };
    panVelocityRef.current = { yaw: 0, pitch: 0 };
  };

  const moveRoomPan = (mx: number, my: number) => {
    if (!isPanningRoomRef.current) return;
    const now = performance.now();
    const dx = mx - panStartRef.current.mx;
    const dy = my - panStartRef.current.my;
    const deltaX = mx - panLastMoveRef.current.mx;
    const deltaY = my - panLastMoveRef.current.my;
    const elapsed = Math.max(1, now - panLastMoveRef.current.time);
    setCameraLook({
      yaw: Math.max(-25, Math.min(25, panStartRef.current.yaw + dx * 0.06)),
      pitch: Math.max(-18, Math.min(18, panStartRef.current.pitch - dy * 0.05)),
    });
    panVelocityRef.current = {
      yaw: (deltaX * 0.06 * 16) / elapsed,
      pitch: (-deltaY * 0.05 * 16) / elapsed,
    };
    panLastMoveRef.current = { mx, my, time: now };
  };

  const endRoomPan = () => {
    if (!isPanningRoomRef.current) return;
    isPanningRoomRef.current = false;
    const velocity = { ...panVelocityRef.current };
    if (Math.hypot(velocity.yaw, velocity.pitch) < 0.08) return;

    setIsRoomGliding(true);
    const glide = () => {
      velocity.yaw *= 0.91;
      velocity.pitch *= 0.91;
      if (Math.hypot(velocity.yaw, velocity.pitch) < 0.015) {
        setIsRoomGliding(false);
        return;
      }
      setCameraLook((look) => ({
        yaw: Math.max(-25, Math.min(25, look.yaw + velocity.yaw)),
        pitch: Math.max(-18, Math.min(18, look.pitch + velocity.pitch)),
      }));
      roomGlideFrameRef.current = requestAnimationFrame(glide);
    };
    roomGlideFrameRef.current = requestAnimationFrame(glide);
  };

  useEffect(() => () => cancelAnimationFrame(roomGlideFrameRef.current), []);

  const bringToFront = (id: AppId) => {
    setTopZ((prev) => {
      const next = prev + 1;
      setWindows((w) => ({
        ...w,
        [id]: { ...w[id], zIndex: next },
      }));
      return next;
    });
  };

  const openSingleOrFocusApp = useCallback((id: AppId, exclusive: boolean = false) => {
    setHomeOpen(false);
    setControlCenterOpen(false);
    if (id === 'object-tracking') {
      setIsArkitScannerOpen(true);
      return;
    }
    setTopZ((prev) => {
      const next = prev + 1;
      setWindows((w) => {
        const updated = { ...w };
        if (exclusive) {
          (Object.keys(updated) as AppId[]).forEach((k) => {
            updated[k] = { ...updated[k], isOpen: k === id };
          });
        } else {
          const previous = updated[id];
          if (!previous.isOpen) {
            const openCount = Object.values(updated).filter((win) => win.isOpen).length;
            const slot = openCount % 5;
            const spreadX = [0, 48, -48, 96, -96][slot];
            const spreadY = [0, 24, 48, 72, 96][slot];
            updated[id] = {
              ...previous,
              isOpen: true,
              zIndex: next,
              x: previous.x + spreadX,
              y: previous.y + spreadY,
            };
          } else {
            updated[id] = { ...previous, zIndex: next };
          }
        }
        updated[id].zIndex = next;
        return updated;
      });
      return next;
    });

    // Automatically summon the Spatial 3D Keyboard for Notes or Spotlight Search (matching IMG-3-vision-pro.webp & oLK7KBr5ogcGwd2SxzuJCH.jpg)
    if (id === 'notes') {
      setKeyboardTarget('notes');
      setKeyboardOpen(true);
    } else if (id === 'search') {
      setKeyboardTarget('search');
      setKeyboardOpen(true);
    } else {
      setKeyboardOpen(false);
    }
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey;

      if (event.key === 'Escape') {
        setHomeOpen(false);
        setControlCenterOpen(false);
        setKeyboardOpen(false);
        return;
      }
      if (isEditing) return;

      if (event.key.toLowerCase() === 'h') {
        setHomeOpen((open) => !open);
        setControlCenterOpen(false);
      } else if (event.key.toLowerCase() === 'c') {
        setControlCenterOpen((open) => !open);
        setHomeOpen(false);
      } else if (event.key === '/') {
        event.preventDefault();
        openSingleOrFocusApp('search');
      }
    };

    window.addEventListener('keydown', handleShortcut);
  return () => window.removeEventListener('keydown', handleShortcut);
  }, [openSingleOrFocusApp]);

  // Environment backdrop selection (shown when the camera view is off).
  const environmentBackdrops: Record<EnvironmentId, string> = {
    'living-room': assetUrl('reference/still-b5f564c5b0939789a9dee198fb7fd037.webp'),
    'wood-studio': assetUrl('reference/large_2x (1).mp4'),
    thorsmork: assetUrl('reference/control_center__e3iguusguvma_large.jpg'),
    'sunset-clouds': assetUrl('reference/large_2x (2).mp4'),
    'cafe-lounge': assetUrl('reference/oLK7KBr5ogcGwd2SxzuJCH.jpg'),
  };

  const totalYaw = xrState.headRotation.yaw + cameraLook.yaw;
  const totalPitch = xrState.headRotation.pitch + cameraLook.pitch;

  // Each app window. In Spatial World mode the same element becomes its own world-anchored object.
  const renderWindowElement = (win: WindowState, world?: SpatialWorldPanelControls) => (
    <SpatialWindow
      worldAnchored={Boolean(world)}
      onWorldGrab={world?.onWorldGrab}
      onWorldDepth={world?.onWorldDepth}
      id={win.id}
      title={win.title}
      x={win.x}
      y={win.y}
      z={win.z}
      width={win.width}
      height={win.height}
      zIndex={win.zIndex}
      curved={win.curved}
      noGlassChrome={win.id === 'quicklook' || win.id === 'earth'}
      alqamiMode={xrState.alqamiModeActive}
      onClose={() =>
        setWindows((prev) => ({
          ...prev,
          [win.id]: { ...prev[win.id], isOpen: false },
        }))
      }
      onFocus={() => bringToFront(win.id)}
      onMove={(nx, ny) =>
        setWindows((prev) => ({
          ...prev,
          [win.id]: { ...prev[win.id], x: nx, y: ny },
        }))
      }
      onZChange={(nz) =>
        setWindows((prev) => ({
          ...prev,
          [win.id]: { ...prev[win.id], z: nz },
        }))
      }
      onResize={(nw, nh) =>
        setWindows((prev) => ({
          ...prev,
          [win.id]: { ...prev[win.id], width: nw, height: nh },
        }))
      }
      /* Left Vertical Ornament for IKEA, Photos, and Spotlight Search */
      leftOrnament={
        win.id === 'ikea' ? (
          <div className="vision-ornament rounded-full p-1.5 flex flex-col gap-2 pointer-events-auto">
            {[
              { id: 'grid' as const, icon: LayoutGrid, label: lang === 'ar' ? 'المعرض' : 'Catalog' },
              { id: 'search' as const, icon: Search, label: lang === 'ar' ? 'بحث في المقتنيات' : 'Search' },
              { id: 'user' as const, icon: User, label: lang === 'ar' ? 'عن المعرض' : 'About' },
              { id: 'favorites' as const, icon: Heart, label: lang === 'ar' ? 'المفضلة' : 'Favorites', dot: true },
              { id: 'cart' as const, icon: ShoppingBag, label: lang === 'ar' ? 'السلة' : 'Bag' },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = ikeaActiveNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    spatialSound.playPinchTap();
                    if (item.id === 'search') {
                      if (ikeaActiveNav === 'search') {
                        setIkeaActiveNav('grid');
                        window.dispatchEvent(new CustomEvent('visionos:close-search'));
                      } else {
                        setIkeaActiveNav('search');
                        window.dispatchEvent(new CustomEvent('visionos:toggle-search'));
                      }
                    } else {
                      setIkeaActiveNav(item.id);
                      if (item.id === 'grid') {
                        window.dispatchEvent(new CustomEvent('visionos:close-search'));
                      }
                    }
                  }}
                  title={item.label}
                  className={`w-9 h-9 rounded-full flex items-center justify-center relative transition-all active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-white/35 text-white shadow-[0_0_12px_rgba(255,255,255,0.4)] scale-105'
                      : 'text-white/75 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.dot && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFD60A] absolute top-1.5 right-1.5 shadow-[0_0_6px_#FFD60A]" />
                  )}
                </button>
              );
            })}
          </div>
        ) : win.id === 'photos' ? (
          <div className="vision-ornament rounded-full p-1.5 flex flex-col gap-2">
            {[Image, LayoutGrid, Film, Search].map((Icon, idx) => (
              <button
                key={idx}
                onClick={() => spatialSound.playPinchTap()}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                  idx === 2
                    ? 'bg-white/30 text-white'
                    : 'text-white/75 hover:bg-white/15'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        ) : win.id === 'search' ? (
          <div className="vision-ornament rounded-full p-1.5 flex flex-col gap-2">
            {['A', '🕹️', '🔍'].map((g, idx) => (
              <button
                key={idx}
                onClick={() => spatialSound.playPinchTap()}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                  idx === 2
                    ? 'bg-white/30 text-white'
                    : 'text-white/75 hover:bg-white/15'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        ) : undefined
      }
      /* Top Floating URL Bar Ornament for Safari (Exact match to maxresdefault.jpg) */
      topOrnament={
        win.id === 'safari' ? (
          <div className="spatial-safari-url-bar h-11 px-3 rounded-full vision-ornament flex items-center gap-2.5 text-white w-[560px]">
            <button className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
              <Sidebar className="w-3.5 h-3.5" />
            </button>
            <button className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
              <ChevronRight className="w-3.5 h-3.5 text-white/45" />
            </button>

            <div className="flex-1 h-8 rounded-full bg-black/35 border border-white/15 px-3 flex items-center justify-between text-xs">
              <span className="text-[11px] font-serif">AA</span>
              <span className="font-medium">🔒 numastays.com</span>
              <RotateCw className="w-3 h-3 text-white/70" />
            </div>

            <button className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
              <Share className="w-3.5 h-3.5" />
            </button>
            <button className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : undefined
      }
      /* Bottom Formatting Ornament for Notes (Exact match to maxresdefault.jpg right window) */
      bottomOrnament={
        win.id === 'notes' ? (
          <div className="h-10 px-4 rounded-full vision-ornament flex items-center gap-4 text-white/90 text-xs">
            <Undo2 className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
            <Redo2 className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
            <span className="font-bold cursor-pointer">Aa</span>
            <ListChecks className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
            <Table className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
            <PenTool className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
          </div>
        ) : undefined
      }
    >
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center gap-3 text-sm text-white/75">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <span>Opening spatial app…</span>
          </div>
        }
      >
        {win.id === 'ikea' && (
          <AlqamiSpatialApp
            onPreviewInSpace={() => {}}
            lang={lang}
            onToggleLang={setLang}
            activeNav={ikeaActiveNav}
            onNavChange={setIkeaActiveNav}
          />
        )}
        {win.id === 'messages' && (
          <MessagesGenmojiApp
            onOpenKeyboard={(initVal, cb) => {
              setKeyboardTarget('custom');
              setCustomKeyboardText(initVal);
              customKeyboardCallbackRef.current = cb;
              setKeyboardOpen(true);
            }}
          />
        )}
        {win.id === 'playground' && <ImagePlaygroundApp />}
        {win.id === 'photos' && (
          <PhotosMemoryApp
            onSwitchEnvironment={(env, imm) => {
              setCurrentEnv(env);
              setImmersionLevel(imm);
            }}
          />
        )}
        {win.id === 'notes' && (
          <NotesSpatialApp
            noteBody={noteBody}
            onChangeNoteBody={setNoteBody}
            onSummonKeyboard={() => {
              setKeyboardTarget('notes');
              setKeyboardOpen(true);
            }}
          />
        )}
        {win.id === 'safari' && <SafariSpatialApp />}
        {win.id === 'search' && (
          <SpotlightSearchApp
            query={spotlightQuery}
            onChangeQuery={setSpotlightQuery}
            onSummonKeyboard={() => {
              setKeyboardTarget('search');
              setKeyboardOpen(true);
            }}
          />
        )}
        {win.id === 'siri' && <SiriAISpatialApp />}
        {win.id === 'quicklook' && <QuickLookUSDZApp />}
        {win.id === 'earth' && <PlanetEarthVolumeApp />}
        {win.id === 'object-tracking' && (
          <ObjectTrackingApp xrSessionActive={xrState.webxrSessionActive} />
        )}
        {win.id === 'mac-display' && <MacVirtualDisplayApp />}
        {win.id === 'aircanvas' && <SpatialAirCanvasApp />}
        {win.id === 'anchors' && <SpatialWorldAnchorsApp />}
        {win.id === 'studio3d' && <Spatial3DStudioApp />}
        {win.id === 'tools-hub' && (
          <SpatialToolsHubApp
            onOpenApp={(id) => openSingleOrFocusApp(id, false)}
            xrState={xrState}
            setXrState={setXrState}
          />
        )}
      </Suspense>
    </SpatialWindow>
  );

  const renderKeyboard = () => (
    <SpatialKeyboard
      isOpen={keyboardOpen && !homeOpen}
      value={
        keyboardTarget === 'notes'
          ? noteBody.split('\n').pop() || ''
          : keyboardTarget === 'search'
          ? spotlightQuery
          : customKeyboardText
      }
      submitLabel={keyboardTarget === 'search' ? 'search' : 'return'}
      suggestions={
        keyboardTarget === 'search'
          ? ['documents', 'docusign', 'docomo']
          : ['drafts', 'drafting', 'drafted']
      }
      onChange={(newVal) => {
        if (keyboardTarget === 'notes') {
          const lines = noteBody.split('\n');
          lines[lines.length - 1] = newVal;
          setNoteBody(lines.join('\n'));
        } else if (keyboardTarget === 'search') {
          setSpotlightQuery(newVal);
        } else {
          setCustomKeyboardText(newVal);
          if (customKeyboardCallbackRef.current) {
            customKeyboardCallbackRef.current(newVal);
          }
        }
      }}
      onSubmit={() => {
        if (keyboardTarget === 'notes') {
          setNoteBody((prev) => prev + '\n– ');
        }
      }}
      onClose={() => setKeyboardOpen(false)}
    />
  );

  // Render the entire Spatial Stage (can be rendered once normally, or twice side-by-side in Stereo XR Visor mode)
  const renderSpatialViewport = (eyeOffsetPx: number = 0) => (
    <div
      onPointerDown={(e) => {
        const isEmptyStage = e.target === e.currentTarget || (e.target as HTMLElement).dataset.roomBg;
        if (xrState.webxrSessionActive && xrState.arPlacementMode && isEmptyStage) {
          window.dispatchEvent(new Event('visionos:place-ar-object'));
          return;
        }
        if (isEmptyStage) {
          beginRoomPan(e.clientX, e.clientY);
        }
      }}
      onPointerMove={(e) => {
        if (isPanningRoomRef.current) e.preventDefault();
        moveRoomPan(e.clientX, e.clientY);
      }}
      onPointerUp={endRoomPan}
      onPointerCancel={endRoomPan}
      className="relative z-20 w-full h-full overflow-hidden spatial-stage"
    >
      {/* 1. 3D room backdrop (hidden while a live camera view is active). */}
      {!xrState.cameraActive && !xrState.webxrSessionActive && (
        <div
          data-room-bg="true"
          style={{
            transform: `translate3d(${-totalYaw * 6 + eyeOffsetPx}px, ${
              -totalPitch * 5
            }px, -120px) scale(1.16)`,
            transition: isPanningRoomRef.current || isRoomGliding ? 'none' : 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="fixed inset-0 z-0 pointer-events-auto"
        >
          {currentEnv === 'living-room' && (
            <img
              data-room-bg="true"
              src={assetUrl('images/custom_room_bg.png')}
              alt="Warm Living Room with Fireplace"
              className="w-full h-full object-cover brightness-[0.92]"
            />
          )}
          {currentEnv === 'wood-studio' && (
            <div
              data-room-bg="true"
              className="w-full h-full bg-[repeating-linear-gradient(90deg,#6e4726_0px,#6e4726_14px,#472c16_14px,#472c16_24px)] relative"
            >
              <div className="absolute inset-x-0 bottom-0 h-[32%] bg-gradient-to-t from-[#d6cfc4] to-[#b8afa2]" />
              <div className="absolute inset-0 bg-radial from-amber-200/15 via-transparent to-black/55" />
            </div>
          )}
          {currentEnv === 'thorsmork' && (
            <div
              data-room-bg="true"
              className="w-full h-full bg-gradient-to-b from-[#0b1d3a] via-[#1c4b82] to-[#0f172a] relative overflow-hidden"
            >
              {/* Dynamic Icelandic Aurora Borealis Ribbons */}
              <div className="absolute -top-20 inset-x-0 h-96 bg-gradient-to-r from-emerald-400/35 via-cyan-300/45 to-purple-500/35 blur-3xl animate-pulse" />
              <img
                src={assetUrl('reference/control_center__e3iguusguvma_large.jpg')}
                alt="Thórsmörk Mountains"
                className="w-full h-full object-cover object-[78%_55%] scale-[2.2] opacity-55 mix-blend-screen"
              />
            </div>
          )}
          {currentEnv === 'sunset-clouds' && (
            <div
              data-room-bg="true"
              className="w-full h-full bg-gradient-to-b from-[#2c4c70] via-[#d48b6a] to-[#2b1d28] relative"
            >
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#1f161d] via-[#9e5a47]/60 to-transparent" />
            </div>
          )}
          {currentEnv === 'cafe-lounge' && (
            <img
              data-room-bg="true"
              src={environmentBackdrops['cafe-lounge']}
              alt="Lounge"
              className="w-full h-full object-cover blur-[2px] brightness-75"
            />
          )}
          {currentEnv === 'chromatic-wave' && (
            <div data-room-bg="true" className="w-full h-full relative overflow-hidden">
              <ChromaticWaveWallpaper />
            </div>
          )}

          {/* Immersion Dimming Scrim controlled by Control Center Immersion Slider */}
          <div
            data-room-bg="true"
            style={{ opacity: (immersionLevel - 50) / 140 }}
            className="absolute inset-0 bg-black pointer-events-none transition-opacity"
          />
        </div>
      )}

      {/* 2. Spatial window stage. WebXR hit testing places the AR object; phone orientation is 3DoF. */}
      <div
        style={{
          transform: `translate3d(${eyeOffsetPx}px, 0, 0) rotateY(${-totalYaw}deg) rotateX(${totalPitch}deg) rotateZ(${-xrState.headRotation.roll * 0.25}deg)`,
          filter: xrState.anaglyphActive
            ? 'drop-shadow(-4px 0 0 rgba(255, 0, 0, 0.75)) drop-shadow(4px 0 0 rgba(0, 255, 255, 0.75))'
            : undefined,
          transition: isPanningRoomRef.current || isRoomGliding ? 'none' : 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative w-full h-full preserve-3d z-10 pointer-events-none"
      >
        {/* Active Spatial Windows */}
        {!homeOpen &&
          (Object.values(windows) as WindowState[])
            .filter((w) => w.isOpen)
            .map((win) => (
              <div key={win.id} className="pointer-events-auto">
                {renderWindowElement(win)}
              </div>
            ))}

        {/* Floating 3D Spatial Keyboard (Paired with Notes, Spotlight Search, or Messages) */}
        <div className="pointer-events-auto">{renderKeyboard()}</div>
      </div>
    </div>
  );

  const handleToggleSpatialWorld = async () => {
    spatialSound.playAlqamiChime();
    const next = !xrState.spatialWorldActive;
    if (next) {
      window.dispatchEvent(new Event('visionos:start-camera'));
      void requestMotionPermission();
    }
    setXrState((prev) => ({
      ...prev,
      spatialWorldActive: next,
      cameraActive: next ? true : prev.cameraActive,
      gyroActive: next ? true : prev.gyroActive,
      alqamiModeActive: false,
      objectTracking3DActive: false,
      // The hand tracker (MediaPipe WASM + model) on top of the camera and the 3D world runs iPhone Safari
      // out of memory, so phones enter AR without it; the hand button in the world still turns it on.
      handTrackingActive: next && !isTouchPhone(),
    }));
  };

  return (
    <div
      ref={domOverlayRootRef}
      className={`visionos-root fixed inset-0 w-screen h-[100dvh] overflow-hidden isolate ${xrState.webxrSessionActive || xrState.cameraActive || xrState.spatialWorldActive ? 'bg-transparent' : 'bg-transparent'}`}
    >
      {/* Real Hardware AR / XR Sensor & Camera Engine */}
      <Suspense fallback={null}>
        <RealARXREngine
          xrState={xrState}
          setXrState={setXrState}
          domOverlayRootRef={domOverlayRootRef}
          onRecenterView={() => {
            setCameraLook({ yaw: 0, pitch: 0 });
            setWindows(INITIAL_WINDOWS);
          }}
        />
      </Suspense>

      {/* Quiet top controls: Single round Alqami Logo button matching img 5 (no text, no background), Home button, and Control Center */}
      <div className="visionos-shell-controls fixed top-3.5 left-1/2 -translate-x-1/2 z-[85] flex items-center gap-2 pointer-events-auto">
        {/* On a computer: use a phone as the camera (and motion sensor) for AR and scanning. */}
        {!isTouchPhone() && <PhoneCameraButton />}
        {/* Round Alqami Logo Button: Activates AR World Mode directly as requested */}
        <button
          onClick={() => {
            spatialSound.playAlqamiChime();
            handleToggleSpatialWorld();
          }}
          className={`vision-btn h-8 w-8 rounded-full vision-ornament flex items-center justify-center cursor-pointer shadow-lg hover:scale-105 active:scale-95 transition-all p-1 text-white border border-white/20 ${
            xrState.spatialWorldActive ? 'ring-2 ring-cyan-400 bg-cyan-500/30' : ''
          }`}
          title={xrState.spatialWorldActive ? 'الخروج من عالم الواقع المعزز · Exit AR World' : 'دخول عالم الواقع المعزز · Enter AR World Mode'}
          aria-label="Toggle AR World Mode"
        >
          <img
            src={assetUrl('alqami-logo.png')}
            alt="Alqami"
            className="w-4.5 h-4.5 object-contain drop-shadow"
          />
        </button>

        <button
          onClick={() => {
            spatialSound.playPinchTap();
            setHomeOpen(!homeOpen);
            setControlCenterOpen(false);
          }}
          className={`vision-btn h-8 w-8 rounded-full vision-ornament flex items-center justify-center text-white ${homeOpen ? 'ring-2 ring-white/80' : ''}`}
          title="Open Home View"
          aria-label="Open Home View"
          aria-pressed={homeOpen}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>

        {/* Look-Up Control Center Pill */}
        <button
          onClick={() => {
            spatialSound.playPinchTap();
            setControlCenterOpen(!controlCenterOpen);
            setHomeOpen(false);
          }}
          className="vision-btn px-3 py-1 rounded-full vision-ornament text-xs font-semibold flex items-center gap-1 text-white/95 hover:bg-white/20 transition active:scale-95"
          title="Look Up Gesture — Open 3-Panel Control Center"
        >
          <span>{currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Creator Credit Badge: bottom-right corner; hidden in the AR world, where its toolbar sits at the bottom */}
      <div className={`fixed bottom-3 right-4 z-[75] pointer-events-auto max-w-[85vw] ${xrState.spatialWorldActive ? 'hidden' : ''}`}>
        <div className="px-3.5 py-1 rounded-full bg-black/40 hover:bg-black/60 border border-white/10 shadow-lg backdrop-blur-xl flex items-center justify-center select-none text-[9px] sm:text-[10px] text-white/70 font-normal tracking-wide gap-1.5 text-center whitespace-nowrap">
          <span>designed & developed by isaac faleh</span>
          <span className="text-white/25">·</span>
          <span dir="rtl">تصميم و تطوير اسحاق فالح</span>
        </div>
      </div>

      {/* Spatial Stage: either standard CSS 3D stage or iPhone Safari Real AR XR World */}
      {xrState.spatialWorldActive ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-20 flex items-center justify-center text-white text-sm">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white mr-2" />
              Initializing Spatial World…
            </div>
          }
        >
          <SpatialWorldStage
            cameraActive={xrState.cameraActive}
            ambientRGB={xrState.ambientRGB}
            handTrackingActive={xrState.handTrackingActive}
            onToggleHandTracking={() =>
              setXrState((prev) => ({
                ...prev,
                handTrackingActive: !prev.handTrackingActive,
                cameraActive: true,
              }))
            }
            objectTracking3DActive={xrState.objectTracking3DActive}
            onToggleObjectTracking={() =>
              setXrState((prev) => ({
                ...prev,
                objectTracking3DActive: !prev.objectTracking3DActive,
                cameraActive: true,
              }))
            }
            onOpenHome={() => setHomeOpen(true)}
            onExit={() => setXrState((prev) => ({ ...prev, spatialWorldActive: false }))}
            panels={
              homeOpen
                ? []
                : (Object.values(windows) as WindowState[])
                    .filter((w) => w.isOpen)
                    .map((w) => ({ id: w.id, width: w.width, height: w.height }))
            }
            renderPanel={(id, controls) => {
              const win = windows[id as AppId];
              return win ? renderWindowElement(win, controls) : null;
            }}
            hud={
              keyboardOpen && !homeOpen ? (
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70]">
                  {renderKeyboard()}
                </div>
              ) : null
            }
          />
        </Suspense>
      ) : xrState.sbsStereoActive && !xrState.webxrSessionActive ? (
        <div className="flex w-full h-full">
          <div className="w-1/2 h-full overflow-hidden border-r border-white/20 relative">
            {renderSpatialViewport(-(xrState.ipdOffset || 16))}
          </div>
          <div className="w-1/2 h-full overflow-hidden relative">
            {renderSpatialViewport(xrState.ipdOffset || 16)}
          </div>
        </div>
      ) : (
        renderSpatialViewport(0)
      )}

      {/* Home View 13-App Honeycomb Launcher (images.jpg) */}
      <HomeViewLauncher
        isOpen={homeOpen}
        onLaunchApp={(id) => openSingleOrFocusApp(id, false)}
        onOpenControlCenter={() => {
          setHomeOpen(false);
          setControlCenterOpen(true);
        }}
        onToggleEnvironments={() => {
          const order: EnvironmentId[] = [
            'living-room',
            'chromatic-wave',
            'thorsmork',
            'sunset-clouds',
            'wood-studio',
            'cafe-lounge',
          ];
          setCurrentEnv(order[(order.indexOf(currentEnv) + 1) % order.length]);
        }}
      />

      {/* 3-Panel Control Center (control_center__e3iguusguvma_large.jpg) */}
      <ControlCenter3Panel
        isOpen={controlCenterOpen}
        onClose={() => setControlCenterOpen(false)}
        currentEnv={currentEnv}
        onSelectEnv={(env) => setCurrentEnv(env)}
        immersionLevel={immersionLevel}
        onChangeImmersion={(val) => setImmersionLevel(val)}
        onOpenApp={(id) => openSingleOrFocusApp(id, false)}
        onToggleRealCamera={() => window.dispatchEvent(new Event('visionos:toggle-camera'))}
        realCameraActive={xrState.cameraActive}
        spatialWorldActive={xrState.spatialWorldActive}
        onToggleSpatialWorld={handleToggleSpatialWorld}
        alqamiModeActive={xrState.alqamiModeActive}
        onToggleAlqamiMode={() =>
          setXrState((prev) => ({
            ...prev,
            alqamiModeActive: !prev.alqamiModeActive,
            cameraActive: !prev.alqamiModeActive ? true : prev.cameraActive,
            gyroActive: !prev.alqamiModeActive ? true : prev.gyroActive,
          }))
        }
        objectTracking3DActive={xrState.objectTracking3DActive}
        onToggle3DObjectTracking={() =>
          setXrState((prev) => ({
            ...prev,
            objectTracking3DActive: !prev.objectTracking3DActive,
            cameraActive: !prev.objectTracking3DActive ? true : prev.cameraActive,
          }))
        }
        lang={lang}
        onToggleLang={setLang}
      />

      {/* Apple ARKit 3D Object Scanner & RDF Recall Fullscreen Studio */}
      {isArkitScannerOpen && (
        <Suspense fallback={null}>
          <AlqamiARKitObjectScanner
            isOpen={isArkitScannerOpen}
            onClose={() => setIsArkitScannerOpen(false)}
            onDeployInSpace={(art) => {
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
            }}
            onOpenDetail={() => {
              openSingleOrFocusApp('ikea', false);
            }}
          />
        </Suspense>
      )}

    </div>
  );
}

export default App;
