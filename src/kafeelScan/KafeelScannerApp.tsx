import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArrowLeft,
  Box,
  Compass,
  Crosshair,
  Eye,
  Maximize2,
  Rotate3d,
  Scan,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';
import { SightRecognizer } from '../recognize/recognizer';
import { CodeReader } from '../scan/codeReader';
import { resolveCode } from '../scan/resolveCode';
import { FlowTracker } from '../scan/flowTracker';
import { WorldPin } from '../scan/worldPin';
import { assetUrl } from '../utils/assetUrl';
import { disposeObject, getDracoLoader } from '../utils/modelMemory';
import { answer, factsFromArtifact } from '../voice/persona';
import { speak, stopSpeaking } from '../voice/speak';
import { getSpatialPartsForArtifact, SpatialPartNode } from './partAnatomy';

type Lang = 'ar' | 'en';

function findArtifact(rawId: string): AlqamiArtifact | undefined {
  const needle = rawId.toLowerCase();
  const sid = needle.replace(/^(?:alkafeel:|alkafeel__|artifact:|kfl-[a-z]+-|kfl-)/i, '');
  return ALQAMI_ARTIFACTS.find(
    (a) =>
      a.id.toLowerCase() === needle ||
      a.itemCode.toLowerCase() === needle ||
      a.slug.toLowerCase() === needle ||
      (sid && /^\d+$/.test(sid) && a.id.toLowerCase().endsWith(`-${sid}`))
  );
}

const VIEW_ANGLES = [
  { deg: 0, ar: 'واجهة أمامية 0°', en: 'Front View 0°' },
  { deg: 45, ar: 'زاوية مائلة 45°', en: 'Oblique 45°' },
  { deg: 90, ar: 'جانب أيمن 90°', en: 'Right Profile 90°' },
  { deg: 180, ar: 'الوجه الخلفي 180°', en: 'Rear View 180°' },
  { deg: 270, ar: 'جانب أيسر 270°', en: 'Left Profile 270°' },
];

export interface ProjectedPartAnchor {
  id: string;
  x: number;
  y: number;
  z: number;
}

export const KafeelScannerApp: React.FC = () => {
  const [lang, setLang] = useState<Lang>('ar');
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  // Default to ?artifact=<id> query param, else the engraved Kashkul (#2165) or Sultan Selim Sword (#2126)
  const [activeArtifact, setActiveArtifact] = useState<AlqamiArtifact>(() => {
    const q = new URLSearchParams(window.location.search).get('artifact');
    return (q && findArtifact(q)) || findArtifact('KFL-KSH-2165') || findArtifact('KFL-SWD-2126') || ALQAMI_ARTIFACTS[0];
  });
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0.97);
  const [detectSource, setDetectSource] = useState<'sight' | 'qr' | 'catch' | 'ar-lock'>('ar-lock');
  const [sightStatus, setSightStatus] = useState<'loading' | 'ready' | 'off'>('loading');
  const [viewAngle, setViewAngle] = useState<number>(0);
  const [autoRotate3D, setAutoRotate3D] = useState<boolean>(true);
  // Primary AR mode: full-screen transparent 3D AR hologram over live camera feed is ALWAYS primary.
  // Optional photo inset is off by default so the 3D AR hologram floats cleanly in real space.
  const [showPhotoCompare, setShowPhotoCompare] = useState<boolean>(false);
  const [arMode, setArMode] = useState<'passthrough-ar' | 'webxr-ar'>('passthrough-ar');
  const [arScale, setArScale] = useState<number>(1.0);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [gyroOffset, setGyroOffset] = useState<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [catalogOpen, setCatalogOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hallFilter, setHallFilter] = useState<string>('ALL');
  const [scanPulse, setScanPulse] = useState<boolean>(false);
  const [liveCandidates, setLiveCandidates] = useState<Array<{ artifact: AlqamiArtifact; score: number }>>([]);

  // Tracked AR object center in normalized viewport coordinates (0..1)
  const [trackedBox, setTrackedBox] = useState<{ cx: number; cy: number; w: number; h: number }>({
    cx: 0.5,
    cy: 0.46,
    w: 0.36,
    h: 0.38,
  });

  // Live 3D-projected screen coordinates for each spatial part on the 3D AR mesh
  const [projectedAnchors, setProjectedAnchors] = useState<Record<string, { x: number; y: number }>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const recognizerRef = useRef<SightRecognizer | null>(null);
  const flowRef = useRef<FlowTracker>(new FlowTracker());
  const worldPinRef = useRef<WorldPin>(new WorldPin());
  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({ w: 1280, h: 820 });

  const parts = useMemo(() => getSpatialPartsForArtifact(activeArtifact), [activeArtifact]);

  // Measure viewport for exact SVG bezier leader line coordinates
  useEffect(() => {
    const updateSize = () => {
      const el = viewportRef.current;
      if (el) setVpSize({ w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Start primary AR rear camera stream + DeviceOrientation gyroscope tracking
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().then(() => setCameraReady(true)).catch(() => {});
        }
      })
      .catch(() => {
        setCameraReady(false);
      });

    void worldPinRef.current.start();

    let baseAlpha: number | null = null;
    let baseBeta: number | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null) return;
      if (baseAlpha == null) baseAlpha = e.alpha;
      if (baseBeta == null) baseBeta = e.beta;
      let dYaw = e.alpha - baseAlpha;
      if (dYaw > 180) dYaw -= 360;
      if (dYaw < -180) dYaw += 360;
      const dPitch = e.beta - baseBeta;
      setGyroOffset({
        yaw: THREE.MathUtils.clamp(dYaw * 0.012, -0.45, 0.45),
        pitch: THREE.MathUtils.clamp(dPitch * 0.008, -0.3, 0.3),
      });
    };
    window.addEventListener('deviceorientation', onOrient);

    return () => {
      active = false;
      window.removeEventListener('deviceorientation', onOrient);
      stream?.getTracks().forEach((tr) => tr.stop());
      worldPinRef.current.stop();
      stopSpeaking();
    };
  }, []);

  const lockOnArtifact = useCallback(
    (
      art: AlqamiArtifact,
      score: number,
      source: 'sight' | 'qr' | 'catch' | 'ar-lock',
      angle: number | null = null,
      spot = { x: 0.5, y: 0.46 }
    ) => {
      setActiveArtifact(art);
      setConfidence(Math.max(0.76, Math.min(0.99, score)));
      setDetectSource(source);
      if (angle != null) setViewAngle(angle);
      setSelectedPartId(null);
      setScanPulse(true);
      window.setTimeout(() => setScanPulse(false), 650);

      const v = videoRef.current;
      if (v && v.videoWidth) {
        flowRef.current.seed(art.id, v, { x: spot.x, y: spot.y, hw: 0.16, hh: 0.16 });
      }
      setTrackedBox({ cx: spot.x, cy: spot.y, w: 0.36, h: 0.38 });
    },
    []
  );

  // Ultra-fast dual recognition loop: DINOv2 SightRecognizer (90ms) + QR CodeReader (140ms) + 60fps FlowTracker
  useEffect(() => {
    let disposed = false;
    let sightTimer = 0;
    let qrTimer = 0;
    let raf = 0;

    const sight = new SightRecognizer();
    recognizerRef.current = sight;
    const reader = new CodeReader();

    sight
      .prepare()
      .then(() => !disposed && setSightStatus('ready'))
      .catch(() => !disposed && setSightStatus('off'));

    const crops = [
      { x: 0.5, y: 0.46, side: 0.78 },
      { x: 0.35, y: 0.45, side: 0.58 },
      { x: 0.65, y: 0.45, side: 0.58 },
      { x: 0.5, y: 0.58, side: 0.62 },
    ];
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropCanvas.height = 224;
    let stepIdx = 0;

    const sightLoop = async () => {
      if (disposed) return;
      const v = videoRef.current;
      try {
        if (v && v.readyState >= 2 && v.videoWidth) {
          const spot = crops[stepIdx % crops.length];
          stepIdx++;
          const side = Math.min(v.videoWidth, v.videoHeight) * spot.side;
          const sx = Math.max(0, Math.min(v.videoWidth - side, spot.x * v.videoWidth - side / 2));
          const sy = Math.max(0, Math.min(v.videoHeight - side, spot.y * v.videoHeight - side / 2));
          cropCanvas.getContext('2d')!.drawImage(v, sx, sy, side, side, 0, 0, 224, 224);

          const ranked = await sight.look(cropCanvas, 1.0);
          if (disposed) return;

          const mapped = ranked
            .map((r) => ({
              artifact: r.target.kind === 'artifact' ? findArtifact(r.target.id) : undefined,
              score: r.score,
              angle: r.angle,
              threshold: r.threshold,
            }))
            .filter((x): x is { artifact: AlqamiArtifact; score: number; angle: number | null; threshold: number } => Boolean(x.artifact));

          if (mapped.length > 0) {
            setLiveCandidates(mapped.slice(0, 3).map((m) => ({ artifact: m.artifact, score: m.score })));
            const [best, second] = mapped;
            if (best.score >= best.threshold && best.score - (second?.score ?? 0) >= 0.05) {
              lockOnArtifact(best.artifact, best.score, 'sight', best.angle, { x: spot.x, y: spot.y });
            }
          }
        }
      } catch {
        // Keep scanning on transient frame errors
      }
      if (!disposed) sightTimer = window.setTimeout(sightLoop, 90);
    };

    const qrLoop = async () => {
      if (disposed) return;
      const v = videoRef.current;
      try {
        if (v && v.readyState >= 2 && v.videoWidth) {
          const code = await reader.read(v);
          if (code && !disposed) {
            const target = await resolveCode(code.text);
            if (target.kind === 'artifact') {
              const found = findArtifact(target.id);
              if (found) lockOnArtifact(found, 0.99, 'qr', 0, { x: 0.5, y: 0.46 });
            }
          }
        }
      } catch {
        // Keep scanning
      }
      if (!disposed) qrTimer = window.setTimeout(qrLoop, 140);
    };

    const trackFrame = () => {
      if (disposed) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        flowRef.current.update(v);
        const box = flowRef.current.box(activeArtifact.id);
        if (box) {
          setTrackedBox((prev) => ({
            cx: prev.cx * 0.65 + box.x * 0.35,
            cy: prev.cy * 0.65 + box.y * 0.35,
            w: 0.36,
            h: 0.38,
          }));
        }
      }
      raf = requestAnimationFrame(trackFrame);
    };

    void sightLoop();
    void qrLoop();
    raf = requestAnimationFrame(trackFrame);

    return () => {
      disposed = true;
      window.clearTimeout(sightTimer);
      window.clearTimeout(qrTimer);
      cancelAnimationFrame(raf);
      reader.dispose();
      void sight.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Catch & Analyze" button: immediately locks onto the top live candidate from the AR camera
  const handleCatchAndAnalyze = async () => {
    const v = videoRef.current;
    const sight = recognizerRef.current;
    if (v && v.videoWidth && sight) {
      try {
        const ranked = await sight.look(v, 0.85);
        for (const r of ranked) {
          if (r.target.kind === 'artifact') {
            const found = findArtifact(r.target.id);
            if (found) {
              lockOnArtifact(found, Math.max(0.88, r.score), 'catch', r.angle ?? 0, { x: 0.5, y: 0.46 });
              return;
            }
          }
        }
      } catch {
        // Fallback below
      }
    }
    if (liveCandidates.length > 0) {
      lockOnArtifact(liveCandidates[0].artifact, Math.max(0.89, liveCandidates[0].score), 'catch', 0, { x: 0.5, y: 0.46 });
    } else {
      setScanPulse(true);
      window.setTimeout(() => setScanPulse(false), 650);
    }
  };

  const speakFullArtifact = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    const facts = factsFromArtifact(activeArtifact, lang);
    const sentences = [...answer(facts, 'intro', lang), ...answer(facts, 'story', lang), ...answer(facts, 'body', lang)];
    setIsSpeaking(true);
    speak(
      sentences,
      lang,
      {
        onSentence: () => {},
        onEnd: () => setIsSpeaking(false),
      },
      activeArtifact.model.glb
    );
  };

  const speakPart = (part: SpatialPartNode) => {
    setSelectedPartId(part.id);
    setIsSpeaking(true);
    const sentences = isAr
      ? [`${part.badgeAr}: ${part.titleAr}.`, part.detailAr]
      : [`${part.badgeEn}: ${part.titleEn}.`, part.detailEn];
    speak(
      sentences,
      lang,
      {
        onSentence: () => {},
        onEnd: () => setIsSpeaking(false),
      },
      activeArtifact.model.glb
    );
  };

  // Compute pixel positions for the AR target reticle, each part's real 3D-projected anchor on the 3D AR mesh,
  // and each part's floating AR metadata card around the object.
  const layoutGeometry = useMemo(() => {
    const W = vpSize.w;
    const H = vpSize.h;
    const isNarrow = W < 720;
    const boxPxW = Math.min(W * (isNarrow ? 0.58 : 0.36), 410);
    const boxPxH = Math.min(H * (isNarrow ? 0.38 : 0.44), 390);
    const cx = trackedBox.cx * W;
    const cy = trackedBox.cy * H;

    const cardW = isNarrow ? Math.min(172, W * 0.44) : 256;
    const cardH = isNarrow ? 96 : 114;

    const dockPositions: Record<SpatialPartNode['dock'], { x: number; y: number }> = {
      'top-left': {
        x: Math.max(12, cx - boxPxW * 0.52 - cardW - (isNarrow ? 6 : 26)),
        y: Math.max(76, cy - boxPxH * 0.46 - cardH * 0.32),
      },
      'top-right': {
        x: Math.min(W - cardW - 12, cx + boxPxW * 0.52 + (isNarrow ? 6 : 26)),
        y: Math.max(76, cy - boxPxH * 0.46 - cardH * 0.32),
      },
      'bottom-left': {
        x: Math.max(12, cx - boxPxW * 0.52 - cardW - (isNarrow ? 6 : 26)),
        y: Math.min(H - cardH - 138, cy + boxPxH * 0.14),
      },
      'bottom-right': {
        x: Math.min(W - cardW - 12, cx + boxPxW * 0.52 + (isNarrow ? 6 : 26)),
        y: Math.min(H - cardH - 138, cy + boxPxH * 0.14),
      },
      top: {
        x: Math.max(12, Math.min(W - cardW - 12, cx - cardW / 2)),
        y: Math.max(74, cy - boxPxH * 0.62 - cardH),
      },
      bottom: {
        x: Math.max(12, Math.min(W - cardW - 12, cx - cardW / 2)),
        y: Math.min(H - cardH - 138, cy + boxPxH * 0.52),
      },
    };

    const nodes = parts.map((part, idx) => {
      // Use live 3D-projected coordinates from the Three.js AR camera when available, else fallback to 2D relative offset
      const proj = projectedAnchors[part.id];
      const anchorX = proj ? proj.x : cx + part.dx * boxPxW;
      const anchorY = proj ? proj.y : cy + part.dy * boxPxH;
      const dock = dockPositions[part.dock] || dockPositions['top-right'];
      const isLeftCard = dock.x + cardW / 2 < cx;
      const cardEdgeX = isLeftCard ? dock.x + cardW : dock.x;
      const cardEdgeY = dock.y + cardH * 0.45;
      const ctrl1X = anchorX + (cardEdgeX - anchorX) * 0.45;
      const ctrl1Y = anchorY;
      const ctrl2X = anchorX + (cardEdgeX - anchorX) * 0.65;
      const ctrl2Y = cardEdgeY;
      const pathD = `M ${anchorX.toFixed(1)} ${anchorY.toFixed(1)} C ${ctrl1X.toFixed(1)} ${ctrl1Y.toFixed(1)}, ${ctrl2X.toFixed(1)} ${ctrl2Y.toFixed(1)}, ${cardEdgeX.toFixed(1)} ${cardEdgeY.toFixed(1)}`;
      return {
        part,
        idx,
        anchorX,
        anchorY,
        cardX: dock.x,
        cardY: dock.y,
        cardW,
        cardEdgeX,
        cardEdgeY,
        pathD,
      };
    });

    return { cx, cy, boxPxW, boxPxH, nodes };
  }, [vpSize, trackedBox, parts, projectedAnchors]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALQAMI_ARTIFACTS.filter((a) => {
      if (hallFilter !== 'ALL' && !a.id.startsWith(hallFilter)) return false;
      if (!q) return true;
      return (
        a.title.ar.toLowerCase().includes(q) ||
        a.title.en.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.itemCode.toLowerCase().includes(q) ||
        (a.subtitle?.ar.toLowerCase().includes(q) ?? false) ||
        a.description.ar.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, hallFilter]);

  const currentAngleMeta = VIEW_ANGLES.reduce((prev, curr) =>
    Math.abs(curr.deg - viewAngle) < Math.abs(prev.deg - viewAngle) ? curr : prev
  );

  return (
    <div ref={viewportRef} dir={isAr ? 'rtl' : 'ltr'} className="fixed inset-0 bg-black text-white overflow-hidden select-none">
      {/* 1. PRIMARY AUGMENTED REALITY CAMERA FEED (100% Full-Screen Live Pass-Through) */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover brightness-105 contrast-[1.03]"
      />

      {/* Subtle AR Spatial Grid & Light Horizon Scrim (keeps camera feed crystal-clear while making AR HUD legible) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 46%, rgba(16,185,129,0.16) 0%, transparent 55%), linear-gradient(rgba(52,211,153,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(52,211,153,0.07) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
        }}
      />

      {/* 2. PRIMARY FULL-VIEWPORT 3D AUGMENTED REALITY STAGE (Three.js WebGL + WebXR Hit-Test + Live 3D Part Projection) */}
      <div className="absolute inset-0 z-10">
        <KafeelPrimaryARStage
          glbUrl={activeArtifact.model.glb}
          viewAngleDeg={viewAngle}
          autoRotate={autoRotate3D}
          arScale={arScale}
          trackedCenter={{ x: trackedBox.cx, y: trackedBox.cy }}
          gyroOffset={gyroOffset}
          parts={parts}
          selectedPartId={selectedPartId}
          domOverlayRoot={viewportRef.current}
          requestWebXR={arMode === 'webxr-ar'}
          onExitWebXR={() => setArMode('passthrough-ar')}
          onProjectedAnchors={setProjectedAnchors}
        />
      </div>

      {/* 3. AR Spatial Target Reticle Frame around the 3D Hologram in the Real World */}
      <div
        style={{
          left: layoutGeometry.cx - layoutGeometry.boxPxW / 2,
          top: layoutGeometry.cy - layoutGeometry.boxPxH / 2,
          width: layoutGeometry.boxPxW,
          height: layoutGeometry.boxPxH,
        }}
        className={`absolute z-15 rounded-[30px] pointer-events-none transition-transform duration-300 ${
          scanPulse ? 'scale-105' : ''
        }`}
      >
        {/* AR Corner Reticle Brackets */}
        <span className="absolute -top-1 -left-1 w-8 h-8 border-t-[3px] border-l-[3px] border-[#FFD60A] rounded-tl-2xl drop-shadow-[0_0_10px_#FFD60A]" />
        <span className="absolute -top-1 -right-1 w-8 h-8 border-t-[3px] border-r-[3px] border-[#FFD60A] rounded-tr-2xl drop-shadow-[0_0_10px_#FFD60A]" />
        <span className="absolute -bottom-1 -left-1 w-8 h-8 border-b-[3px] border-l-[3px] border-[#FFD60A] rounded-bl-2xl drop-shadow-[0_0_10px_#FFD60A]" />
        <span className="absolute -bottom-1 -right-1 w-8 h-8 border-b-[3px] border-r-[3px] border-[#FFD60A] rounded-br-2xl drop-shadow-[0_0_10px_#FFD60A]" />

        {/* Optional Small Reference Photo Picture-in-Picture Badge (only if toggled on) */}
        {showPhotoCompare && (
          <div className="absolute bottom-2 right-2 w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#FFD60A]/70 bg-black/75 shadow-2xl pointer-events-auto">
            <img src={assetUrl(activeArtifact.image)} alt={activeArtifact.title[lang]} className="w-full h-full object-cover" />
            <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[8.5px] text-center text-amber-300 py-0.5">
              {t('صورة الأرشيف', 'Archive Photo')}
            </span>
          </div>
        )}

        {/* Top-Center AR Lock Telemetry Pill */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-emerald-400/70 text-[10.5px] font-bold text-emerald-300 whitespace-nowrap flex items-center gap-1.5 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>
            {detectSource === 'qr'
              ? t('واقع معزز · تطابق QR', 'AR · QR Locked')
              : detectSource === 'catch'
                ? t('واقع معزز · التقاط بصري فوري', 'AR · Instant Catch')
                : detectSource === 'sight'
                  ? t('واقع معزز · تعرّف بصري DINOv2', 'AR · DINOv2 Sight Lock')
                  : t('واقع معزز مكاني ثلاثي الأبعاد نشط', 'Primary 3D Augmented Reality Active')}{' '}
            · {Math.round(confidence * 100)}%
          </span>
        </div>
      </div>

      {/* 4. SVG Layer: Animated Bezier Leader Lines & 3D-Projected Physical Part Anchor Rings */}
      <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none overflow-visible">
        <defs>
          <filter id="kfl-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {layoutGeometry.nodes.map(({ part, idx, anchorX, anchorY, cardEdgeX, cardEdgeY, pathD }) => {
          const isSelected = selectedPartId === part.id;
          return (
            <g key={part.id}>
              {/* Base Glowing AR Leader Conduit */}
              <path
                d={pathD}
                fill="none"
                stroke={part.color}
                strokeWidth={isSelected ? 3.0 : 1.9}
                strokeOpacity={isSelected ? 0.98 : 0.78}
                filter="url(#kfl-glow)"
              />
              {/* Flowing Energy Dashes from 3D Part Anchor to Floating AR Metadata Card */}
              <path
                d={pathD}
                fill="none"
                stroke="#ffffff"
                strokeWidth={isSelected ? 2.2 : 1.35}
                strokeDasharray="5 9"
                strokeOpacity={0.9}
              >
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.05s" repeatCount="indefinite" />
              </path>
              {/* 3D-Projected Physical Part Anchor Ring on the AR Mesh */}
              <circle
                cx={anchorX}
                cy={anchorY}
                r={isSelected ? 12 : 8}
                fill={part.color}
                fillOpacity={0.28}
                stroke={part.color}
                strokeWidth={2}
              />
              <circle cx={anchorX} cy={anchorY} r={4} fill="#ffffff" stroke={part.color} strokeWidth={2.2} />
              <text
                x={anchorX}
                y={anchorY - 12}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10.5"
                fontWeight="bold"
                style={{ textShadow: '0 1px 4px #000' }}
              >
                {idx + 1}
              </text>
              {/* Terminal Dot on the Floating Card Edge */}
              <circle cx={cardEdgeX} cy={cardEdgeY} r={3.8} fill={part.color} />
            </g>
          );
        })}
      </svg>

      {/* 5. Floating Spatial Part Metadata Cards Attached to the 3D AR Object's Physical Parts */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {layoutGeometry.nodes.map(({ part, idx, cardX, cardY, cardW }) => {
          const isSelected = selectedPartId === part.id;
          return (
            <div
              key={part.id}
              style={{ left: cardX, top: cardY, width: cardW, borderColor: isSelected ? part.color : 'rgba(255,255,255,0.24)' }}
              onClick={() => speakPart(part)}
              className={`absolute pointer-events-auto rounded-2xl bg-[#060b14]/78 backdrop-blur-xl border p-2.5 sm:p-3 shadow-[0_16px_38px_rgba(0,0,0,0.72)] cursor-pointer transition-all duration-200 hover:scale-[1.03] active:scale-95 ${
                isSelected ? 'ring-2 ring-amber-400/80 bg-[#0b1324]/92' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span
                  style={{ backgroundColor: `${part.color}28`, color: part.color, borderColor: `${part.color}66` }}
                  className="px-2 py-0.5 rounded-full border text-[10px] font-bold flex items-center gap-1 truncate"
                >
                  <span className="w-4 h-4 rounded-full bg-black/60 inline-flex items-center justify-center text-[9.5px] font-extrabold">
                    {idx + 1}
                  </span>
                  <span className="truncate">{isAr ? part.badgeAr : part.badgeEn}</span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    speakPart(part);
                  }}
                  title={t('استمع لتحليل هذا الجزء', 'Listen to part analysis')}
                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-amber-400 hover:text-black flex items-center justify-center shrink-0 transition"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[12px] sm:text-[12.5px] font-bold text-white leading-snug line-clamp-1">
                {isAr ? part.titleAr : part.titleEn}
              </p>
              <p className="text-[10.5px] text-white/80 leading-relaxed line-clamp-2 mt-0.5">
                {isAr ? part.detailAr : part.detailEn}
              </p>
              {part.metric && (
                <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between text-[9.5px] text-white/60">
                  <span className="truncate">{part.metric}</span>
                  <span style={{ color: part.color }} className="font-semibold">
                    {t('نقطة AR 3D ✦', '3D AR Node ✦')}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 6. Top Primary AR Navigation & Live Telemetry Header */}
      <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-2 px-3 sm:px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-2.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-2">
          <a
            href="./index.html"
            className="h-10 px-3.5 rounded-full bg-black/55 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center gap-1.5 text-[13px] font-semibold"
          >
            <ArrowLeft className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">{t('تطبيقاتك', 'Apps')}</span>
          </a>
          <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 backdrop-blur-md flex items-center gap-2 shadow-lg">
            <Scan className="w-4 h-4 text-emerald-300 animate-pulse" />
            <div>
              <span className="block text-[12px] font-bold text-white leading-none">
                {t('ماسح الواقع المعزز للأجزاء المكانية', 'Primary AR Spatial Part Scanner')}
              </span>
              <span className="block text-[9.5px] text-emerald-300 mt-0.5">
                {cameraReady
                  ? t('كاميرا الواقع المعزز المباشر + مجسّم 3D + DINOv2 نشط', 'Live AR Camera Pass-Through + 3D Hologram + DINOv2')
                  : sightStatus === 'ready'
                    ? t('الواقع المعزز الثلاثي الأبعاد + تتبع الأجزاء (196 قطعة)', 'Primary 3D AR + Part Projection Active (196 items)')
                    : t('جاري تهيئة محرك الواقع المعزز…', 'Initializing Primary AR Engine…')}
              </span>
            </div>
          </div>
        </div>

        {/* Center Artifact Identity Pill */}
        <div className="hidden lg:flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/70 border border-[#FFD60A]/55 backdrop-blur-xl shadow-lg">
          <img src={assetUrl(activeArtifact.image)} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/20" />
          <div className="text-start">
            <p className="text-[12.5px] font-bold text-white leading-tight">{activeArtifact.title[lang]}</p>
            <p className="text-[10.5px] text-[#FFD60A]">
              {activeArtifact.subtitle?.[lang] || activeArtifact.categoryLabel[lang]} · {currentAngleMeta[lang]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Primary AR WebXR / Live AR Scale & Mode Controls */}
          <button
            onClick={() => setArMode((m) => (m === 'webxr-ar' ? 'passthrough-ar' : 'webxr-ar'))}
            className={`h-10 px-3 rounded-full border text-[12px] font-bold flex items-center gap-1.5 transition shadow-lg ${
              arMode === 'webxr-ar'
                ? 'bg-emerald-400 text-black border-emerald-300'
                : 'bg-[#FFD60A] text-black border-[#FFD60A]'
            }`}
            title={t('تثبيت المجسّم والأجزاء في الواقع المعزز الحقيقي', 'Anchor 3D Hologram & Spatial Parts in Real AR')}
          >
            <Compass className="w-4 h-4" />
            <span className="hidden sm:inline">
              {arMode === 'webxr-ar' ? t('WebXR AR نشط', 'WebXR AR Live') : t('الواقع المعزز AR', 'Primary AR')}
            </span>
          </button>
          <button
            onClick={() => setArScale((s) => (s >= 1.35 ? 0.85 : Number((s + 0.25).toFixed(2))))}
            className="h-10 px-2.5 rounded-full bg-black/55 hover:bg-white/20 border border-white/20 text-[11.5px] font-bold flex items-center gap-1"
            title={t('تغيير حجم مجسّم الواقع المعزز', 'Scale AR 3D Hologram')}
          >
            <Box className="w-3.5 h-3.5 text-emerald-300" />
            <span>{Math.round(arScale * 100)}%</span>
          </button>
          <button
            onClick={() => setShowPhotoCompare((v) => !v)}
            className={`h-10 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 transition ${
              showPhotoCompare ? 'bg-white/25 text-white border-white/40' : 'bg-black/55 text-white/75 border-white/20'
            }`}
            title={t('إظهار/إخفاء صورة الأرشيف المصغّرة للمقارنة', 'Toggle small archive photo PiP comparison')}
          >
            <Eye className="w-4 h-4" />
            <span className="hidden md:inline">{t('مقارنة صورة', 'Photo PiP')}</span>
          </button>
          <button
            onClick={() => setCatalogOpen(true)}
            className="h-10 px-3.5 rounded-full bg-black/65 hover:bg-white/25 border border-white/25 text-[12px] font-semibold flex items-center gap-1.5"
          >
            <Search className="w-4 h-4 text-[#FFD60A]" />
            <span>{t('الفهرس (196)', 'Catalogue (196)')}</span>
          </button>
          <button
            onClick={() => setLang(isAr ? 'en' : 'ar')}
            className="w-10 h-10 rounded-full bg-black/55 hover:bg-white/20 border border-white/20 text-[12px] font-bold"
          >
            {isAr ? 'EN' : 'ع'}
          </button>
        </div>
      </header>

      {/* 7. Bottom AR Command Deck: Active Artifact Master Card + View Angle Selector + Catch & Analyze + 196-Item Quick Strip */}
      <footer className="absolute bottom-0 inset-x-0 z-30 px-3 sm:px-5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 bg-gradient-to-t from-black/90 via-black/65 to-transparent space-y-2">
        {/* Row 1: Active Object Summary Bar + Action Buttons + View Angle Pills */}
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#080d18]/85 backdrop-blur-xl border border-white/20 p-2.5 shadow-2xl">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <img
              src={assetUrl(activeArtifact.image)}
              alt={activeArtifact.title[lang]}
              className="w-12 h-12 rounded-xl object-cover border border-[#FFD60A]/60 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] sm:text-[15px] font-bold text-white truncate">{activeArtifact.title[lang]}</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono shrink-0">
                  {activeArtifact.id}
                </span>
              </div>
              <p className="text-[11px] text-white/75 truncate">
                {activeArtifact.period[lang]} · {activeArtifact.details.material[lang]} · {activeArtifact.details.dimensions}
              </p>
            </div>
          </div>

          {/* 360° View Angle Analyzer Pills */}
          <div className="hidden md:flex items-center gap-1 bg-black/55 p-1 rounded-full border border-white/15">
            {VIEW_ANGLES.map((ang) => (
              <button
                key={ang.deg}
                onClick={() => {
                  setAutoRotate3D(false);
                  setViewAngle(ang.deg);
                }}
                className={`h-7 px-2.5 rounded-full text-[10.5px] font-semibold transition ${
                  !autoRotate3D && viewAngle === ang.deg ? 'bg-emerald-400 text-black' : 'text-white/75 hover:text-white'
                }`}
              >
                {ang[lang]}
              </button>
            ))}
            <button
              onClick={() => setAutoRotate3D((v) => !v)}
              className={`h-7 px-2.5 rounded-full text-[10.5px] font-semibold flex items-center gap-1 transition ${
                autoRotate3D ? 'bg-[#FFD60A] text-black' : 'text-white/75 hover:text-white'
              }`}
            >
              <Rotate3d className="w-3.5 h-3.5" />
              <span>360°</span>
            </button>
          </div>

          {/* Primary Action Buttons: Catch & Analyze, Voice Narrator, Full 3D Page */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCatchAndAnalyze}
              className="h-10 px-4 rounded-full bg-gradient-to-r from-[#FFD60A] to-amber-500 text-black font-bold text-[12.5px] flex items-center gap-1.5 shadow-[0_0_20px_rgba(251,191,36,0.45)] active:scale-95 transition"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{t('التقط وحلّل AR', 'Catch & Analyze AR')}</span>
            </button>
            <button
              onClick={speakFullArtifact}
              className={`h-10 px-3.5 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 transition ${
                isSpeaking ? 'bg-rose-500 text-white border-rose-400' : 'bg-white/15 hover:bg-white/25 text-white border-white/20'
              }`}
            >
              {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#FFD60A]" />}
              <span>{isSpeaking ? t('إيقاف', 'Stop') : t('نطق الوصف', 'Speak')}</span>
            </button>
            <a
              href={`./object.html?artifact=${encodeURIComponent(activeArtifact.id)}`}
              className="h-10 px-3.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[12px] font-semibold flex items-center gap-1"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('صفحة القطعة', 'Full Page')}</span>
            </a>
          </div>
        </div>

        {/* Row 2: Instant Museum Object Switcher Strip (All 183 Al-Kafeel + 13 Alqami Objects) */}
        <div className="max-w-5xl mx-auto flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none]">
          <span className="shrink-0 text-[11px] font-bold text-amber-300 px-2 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            {t('اختر قطعة لعرضها في الواقع المعزز:', 'Place object in AR:')}
          </span>
          {ALQAMI_ARTIFACTS.slice(0, 35).map((item) => {
            const active = item.id === activeArtifact.id;
            return (
              <button
                key={item.id}
                onClick={() => lockOnArtifact(item, 0.98, 'ar-lock', 0, { x: 0.5, y: 0.46 })}
                className={`shrink-0 h-8 pl-2.5 pr-1.5 rounded-full border text-[11.5px] font-medium flex items-center gap-1.5 transition active:scale-95 ${
                  active
                    ? 'bg-[#FFD60A] text-black border-[#FFD60A] font-bold shadow'
                    : 'bg-black/60 hover:bg-white/20 text-white border-white/20'
                }`}
              >
                <img src={assetUrl(item.image)} alt="" className="w-5 h-5 rounded-full object-cover" />
                <span className="max-w-[140px] truncate">
                  {item.title[lang].replace(/\s*\(متحف.*$/, '').replace(/\s*—.*$/, '')}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setCatalogOpen(true)}
            className="shrink-0 h-8 px-3 rounded-full bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 text-[11.5px] font-semibold"
          >
            {t(`عرض الكل (${ALQAMI_ARTIFACTS.length}) ←`, `View All (${ALQAMI_ARTIFACTS.length}) →`)}
          </button>
        </div>
      </footer>

      {/* 8. Full 196-Item Museum Search & Hall Filter Modal */}
      {catalogOpen && (
        <div
          onClick={() => setCatalogOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[85vh] rounded-3xl bg-[#0c1220] border border-white/20 p-5 flex flex-col gap-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold text-white">
                  {t('فهرس ماسح الواقع المعزز لمتحف الكفيل (196 قطعة)', 'Al-Kafeel Primary AR Scanner Catalogue (196 Items)')}
                </h2>
                <p className="text-[12px] text-white/60">
                  {t(
                    'اختر أي قطعة لإسقاط مجسّمها ثلاثي الأبعاد في الواقع المعزز مع ربط البيانات بأجزائها المكانية',
                    'Select any artifact to project its 3D hologram in Augmented Reality with spatial part-attached metadata'
                  )}
                </p>
              </div>
              <button
                onClick={() => setCatalogOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('ابحث بالاسم أو الرقم المتحفي أو التسلسل (مثال: 2126، سيف، كشكول)…', 'Search by title, serial # (e.g. 2126, sword, kashkul)…')}
                className="flex-1 min-w-[240px] h-10 rounded-full bg-white/10 border border-white/20 px-4 text-[13.5px] text-white placeholder:text-white/45 outline-none focus:border-[#FFD60A]"
              />
              {[
                ['ALL', t('الكل (196)', 'All (196)')],
                ['KFL-SWD', t('السيوف', 'Swords')],
                ['KFL-KSH', t('الكشاكيل', 'Kashkuls')],
                ['KFL-KUF', t('الكفوف', 'Kuffuf')],
                ['KFL-MSS', t('المخطوطات', 'Manuscripts')],
                ['KFL-MTL', t('الأواني', 'Vessels')],
                ['KFL-ARM', t('الدروع', 'Armor')],
                ['KFL-CST', t('الصناديق', 'Chests')],
              ].map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setHallFilter(code)}
                  className={`h-10 px-3.5 rounded-full text-[12px] font-semibold transition ${
                    hallFilter === code ? 'bg-[#FFD60A] text-black' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pr-1">
              {filteredCatalog.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    lockOnArtifact(item, 0.99, 'ar-lock', 0, { x: 0.5, y: 0.46 });
                    setCatalogOpen(false);
                  }}
                  className={`text-start rounded-2xl p-2.5 border flex items-center gap-3 transition ${
                    item.id === activeArtifact.id
                      ? 'bg-[#FFD60A]/20 border-[#FFD60A]'
                      : 'bg-white/[0.05] hover:bg-white/[0.12] border-white/10'
                  }`}
                >
                  <img
                    src={assetUrl(item.image)}
                    alt={item.title[lang]}
                    className="w-14 h-14 rounded-xl object-cover bg-black/40 shrink-0 border border-white/15"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-white truncate">{item.title[lang]}</p>
                    <p className="text-[11px] text-[#FFD60A] truncate">{item.subtitle?.[lang] || item.categoryLabel[lang]}</p>
                    <p className="text-[10px] text-white/55 font-mono mt-0.5">{item.id}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Primary Full-Viewport Three.js Augmented Reality Stage:
 * - Renders the real 360° 3D .glb artifact floating directly in the live camera pass-through (or native WebXR immersive-ar session).
 * - Creates 3D spatial anchor nodes (`part.pos3d`) attached directly to the rotating 3D object pivot.
 * - Projects every part's real 3D world position through the AR camera into screen coordinates (`vector.project(camera)`)
 *   so the glowing SVG leader lines stay physically attached to the rotating 3D parts in Augmented Reality.
 */
const KafeelPrimaryARStage: React.FC<{
  glbUrl: string;
  viewAngleDeg: number;
  autoRotate: boolean;
  arScale: number;
  trackedCenter: { x: number; y: number };
  gyroOffset: { yaw: number; pitch: number };
  parts: SpatialPartNode[];
  selectedPartId: string | null;
  domOverlayRoot: HTMLElement | null;
  requestWebXR: boolean;
  onExitWebXR: () => void;
  onProjectedAnchors: (anchors: Record<string, { x: number; y: number }>) => void;
}> = ({
  glbUrl,
  viewAngleDeg,
  autoRotate,
  arScale,
  trackedCenter,
  gyroOffset,
  parts,
  selectedPartId,
  domOverlayRoot,
  requestWebXR,
  onExitWebXR,
  onProjectedAnchors,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({
    deg: viewAngleDeg,
    auto: autoRotate,
    scale: arScale,
    center: trackedCenter,
    gyro: gyroOffset,
    selectedPartId,
  });
  stateRef.current = {
    deg: viewAngleDeg,
    auto: autoRotate,
    scale: arScale,
    center: trackedCenter,
    gyro: gyroOffset,
    selectedPartId,
  };

  const xrSessionRef = useRef<XRSession | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Launch or exit native WebXR immersive-ar session when user toggles WebXR AR
  useEffect(() => {
    if (!requestWebXR) {
      if (xrSessionRef.current) {
        void xrSessionRef.current.end().catch(() => {});
        xrSessionRef.current = null;
      }
      return;
    }
    const navXr = (navigator as Navigator & { xr?: XRSystem }).xr;
    const renderer = rendererRef.current;
    if (!navXr || !renderer) {
      onExitWebXR();
      return;
    }
    let cancelled = false;
    navXr
      .isSessionSupported('immersive-ar')
      .then(async (supported) => {
        if (!supported || cancelled) {
          onExitWebXR();
          return;
        }
        const init: XRSessionInit & { domOverlay?: { root: Element } } = {
          optionalFeatures: ['hit-test', 'dom-overlay', 'local-floor'],
        };
        if (domOverlayRoot) init.domOverlay = { root: domOverlayRoot };
        const session = await navXr.requestSession('immersive-ar', init);
        if (cancelled) {
          await session.end();
          return;
        }
        xrSessionRef.current = session;
        renderer.xr.enabled = true;
        await renderer.xr.setSession(session);
        session.addEventListener('end', () => {
          xrSessionRef.current = null;
          onExitWebXR();
        });
      })
      .catch(() => {
        onExitWebXR();
      });

    return () => {
      cancelled = true;
    };
  }, [requestWebXR, domOverlayRoot, onExitWebXR]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let disposed = false;
    const W = el.clientWidth || window.innerWidth;
    const H = el.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xfff8ee, 0.72));
    const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.45);
    keyLight.position.set(2.2, 3.8, 3.2);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    fillLight.position.set(-2.5, 1.2, 2.0);
    scene.add(fillLight);
    const rimLight = new THREE.PointLight(0x34d399, 1.25, 8);
    rimLight.position.set(0, -1.0, -2.0);
    scene.add(rimLight);

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 60);
    camera.position.set(0, 0.08, 2.55);
    camera.lookAt(0, 0, 0);

    // Master AR World Anchor Group (moves with optical flow + gyroscope in pass-through AR)
    const arAnchor = new THREE.Group();
    scene.add(arAnchor);

    // Rotating 3D Artifact Pivot Group
    const pivot = new THREE.Group();
    arAnchor.add(pivot);

    // 3D AR Spatial Floor Reticle Rings & Laser Scan Disc under the object
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.56, 0.6, 64),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = -0.52;
    arAnchor.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.385, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = -0.515;
    arAnchor.add(innerRing);

    // Horizontal AR Laser Scan Ring that sweeps vertically across the 3D artifact
    const scanLaserRing = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.485, 64),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    scanLaserRing.rotation.x = -Math.PI / 2;
    arAnchor.add(scanLaserRing);

    // Create 3D Part Anchor Nodes attached to the rotating 3D mesh pivot
    const partNodesMap = new Map<string, THREE.Object3D>();
    parts.forEach((p) => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(p.pos3d[0], p.pos3d[1], p.pos3d[2]);

      const dotMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 16, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color) })
      );
      nodeGroup.add(dotMesh);

      const haloMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.042, 0.056, 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(p.color),
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        })
      );
      nodeGroup.add(haloMesh);

      pivot.add(nodeGroup);
      partNodesMap.set(p.id, nodeGroup);
    });

    let loadedObj: THREE.Object3D | null = null;
    const loader = new GLTFLoader();
    try {
      loader.setDRACOLoader(getDracoLoader());
    } catch {
      /* ignore draco init warning */
    }

    loader.load(
      assetUrl(glbUrl),
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        const root = gltf.scene;
        loadedObj = root;
        root.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh && m.material) {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => {
              const std = mat as THREE.MeshStandardMaterial;
              if (std.map) {
                std.map.colorSpace = THREE.SRGBColorSpace;
                if (!std.metalnessMap && typeof std.metalness === 'number') {
                  std.metalness = Math.min(0.22, std.metalness);
                }
              }
              if ('envMapIntensity' in std) std.envMapIntensity = 0.68;
            });
          }
        });
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 0.98 / (Math.max(size.x, size.y, size.z) || 1);
        root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        root.scale.setScalar(scale);
        pivot.add(root);
      },
      undefined,
      () => {}
    );

    // Interactive touch/mouse drag to rotate the 3D hologram in AR space
    let dragging = false;
    let prevX = 0;
    let prevY = 0;
    let manualYaw = 0;
    let manualPitch = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      manualYaw += (e.clientX - prevX) * 0.011;
      manualPitch = THREE.MathUtils.clamp(manualPitch + (e.clientY - prevY) * 0.007, -0.45, 0.45);
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const onResize = () => {
      if (!el || disposed) return;
      const nw = el.clientWidth || window.innerWidth;
      const nh = el.clientHeight || window.innerHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    let curYaw = 0;
    let lastEmit = 0;
    const tempVec = new THREE.Vector3();

    renderer.setAnimationLoop((now: number) => {
      if (disposed) return;
      const st = stateRef.current;

      if (st.auto && !dragging) {
        curYaw += 0.0075;
      } else {
        const targetYaw = THREE.MathUtils.degToRad(st.deg) + manualYaw;
        curYaw += (targetYaw - curYaw) * 0.12;
      }

      // Position the 3D AR Anchor in real-world camera space from optical flow + gyroscope
      const normX = (st.center.x - 0.5) * 1.65 - st.gyro.yaw;
      const normY = (0.47 - st.center.y) * 1.25 + st.gyro.pitch;
      arAnchor.position.x += (normX - arAnchor.position.x) * 0.18;
      arAnchor.position.y += (normY - arAnchor.position.y) * 0.18;
      arAnchor.scale.setScalar(st.scale);

      pivot.rotation.y = curYaw;
      pivot.rotation.x = manualPitch;
      pivot.position.y = Math.sin(now * 0.0022) * 0.025;

      // Animate AR floor reticle & vertical laser scan ring
      outerRing.rotation.z = now * 0.0005;
      innerRing.rotation.z = -now * 0.0008;
      scanLaserRing.position.y = Math.sin(now * 0.0028) * 0.42;

      // Make 3D part halos face the AR camera
      partNodesMap.forEach((node) => {
        const halo = node.children[1];
        if (halo) halo.lookAt(camera.position);
      });

      renderer.render(scene, camera);

      // Project 3D part anchors to 2D screen coordinates for the SVG cubic-bezier leader lines (~30fps update)
      if (now - lastEmit > 32) {
        lastEmit = now;
        const cw = el.clientWidth || window.innerWidth;
        const ch = el.clientHeight || window.innerHeight;
        const nextAnchors: Record<string, { x: number; y: number }> = {};
        partNodesMap.forEach((node, id) => {
          node.getWorldPosition(tempVec);
          tempVec.project(camera);
          nextAnchors[id] = {
            x: (tempVec.x * 0.5 + 0.5) * cw,
            y: (-tempVec.y * 0.5 + 0.5) * ch,
          };
        });
        onProjectedAnchors(nextAnchors);
      }
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (loadedObj) disposeObject(loadedObj);
      pmrem.dispose();
      renderer.dispose();
    };
  }, [glbUrl, parts, onProjectedAnchors]);

  return <div ref={hostRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
};
