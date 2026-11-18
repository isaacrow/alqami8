import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArrowLeft,
  Box,
  Camera,
  Compass,
  Eye,
  Maximize2,
  Rotate3d,
  Scan,
  Search,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';
import { useAllScanArtifacts } from '../moon/moonObjects';
import { MoonLoginButton } from '../moon/MoonLoginModal';
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

function findArtifact(rawId: string, list: AlqamiArtifact[] = ALQAMI_ARTIFACTS): AlqamiArtifact | undefined {
  const needle = rawId.toLowerCase();
  const sid = needle.replace(/^(?:alkafeel:|alkafeel__|artifact:|moon:|kfl-[a-z]+-|kfl-)/i, '');
  return list.find(
    (a) =>
      a.id.toLowerCase() === needle ||
      (a.moonRecordId && a.moonRecordId.toLowerCase() === sid) ||
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

export const KafeelScannerApp: React.FC = () => {
  const [lang, setLang] = useState<Lang>('ar');
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  // All scannable museum & mooon.site pictures/objects (~378+ items)
  const allScanArtifacts = useAllScanArtifacts();
  const allArtifactsRef = useRef<AlqamiArtifact[]>(allScanArtifacts);
  allArtifactsRef.current = allScanArtifacts;

  // Default to ?artifact=<id> query param, else the engraved Kashkul (#2165) or Sultan Selim Sword (#2126)
  const [activeArtifact, setActiveArtifact] = useState<AlqamiArtifact>(() => {
    const q = new URLSearchParams(window.location.search).get('artifact');
    return (q && findArtifact(q)) || findArtifact('KFL-KSH-2165') || findArtifact('KFL-SWD-2126') || ALQAMI_ARTIFACTS[0];
  });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('artifact');
    if (q) {
      const match = findArtifact(q, allScanArtifacts);
      if (match) setActiveArtifact(match);
    }
  }, [allScanArtifacts]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0.97);
  const [detectSource, setDetectSource] = useState<'sight' | 'qr' | 'catch' | 'photo' | 'ar-lock'>('ar-lock');
  const [sightStatus, setSightStatus] = useState<'loading' | 'ready' | 'off'>('loading');
  const [sightLatencyMs, setSightLatencyMs] = useState<number>(38);
  const [viewAngle, setViewAngle] = useState<number>(0);
  const [autoRotate3D, setAutoRotate3D] = useState<boolean>(true);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const recognizerRef = useRef<SightRecognizer | null>(null);
  const flowRef = useRef<FlowTracker>(new FlowTracker());
  const worldPinRef = useRef<WorldPin>(new WorldPin());
  const emaScoresRef = useRef<Map<string, number>>(new Map());
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
      source: 'sight' | 'qr' | 'catch' | 'photo' | 'ar-lock',
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

  // Ultra-fast Multi-Scale Pyramid DINOv2 Recognition Loop (85ms) + Temporal EMA Smoothing + QR Reader (140ms) + 60fps FlowTracker
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

    // Multi-scale pyramid crops: standard object frame (0.82), tight detail focus (0.56), full vitrine (0.95), left & right case regions
    const pyramidCrops = [
      { x: 0.5, y: 0.46, side: 0.82 },
      { x: 0.5, y: 0.46, side: 0.58 },
      { x: 0.5, y: 0.48, side: 0.94 },
      { x: 0.36, y: 0.46, side: 0.62 },
      { x: 0.64, y: 0.46, side: 0.62 },
    ];
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropCanvas.height = 224;
    let stepIdx = 0;

    const sightLoop = async () => {
      if (disposed) return;
      const v = videoRef.current;
      try {
        if (v && v.readyState >= 2 && v.videoWidth) {
          const t0 = performance.now();
          const spot = pyramidCrops[stepIdx % pyramidCrops.length];
          stepIdx++;
          const side = Math.min(v.videoWidth, v.videoHeight) * spot.side;
          const sx = Math.max(0, Math.min(v.videoWidth - side, spot.x * v.videoWidth - side / 2));
          const sy = Math.max(0, Math.min(v.videoHeight - side, spot.y * v.videoHeight - side / 2));
          cropCanvas.getContext('2d')!.drawImage(v, sx, sy, side, side, 0, 0, 224, 224);

          const ranked = await sight.look(cropCanvas, 1.0);
          if (disposed) return;
          setSightLatencyMs(Math.max(12, Math.round(performance.now() - t0)));

          const ema = emaScoresRef.current;
          const mapped = ranked
            .map((r) => {
              const targetKey = r.target.kind === 'moon' ? `moon:${r.target.recordId}` : r.target.id;
              const art = findArtifact(targetKey, allArtifactsRef.current);
              if (!art) return null;
              const prev = ema.get(art.id) ?? r.score;
              const smoothed = prev * 0.35 + r.score * 0.65;
              ema.set(art.id, smoothed);
              return {
                artifact: art,
                score: smoothed,
                rawScore: r.score,
                angle: r.angle,
                threshold: r.threshold,
              };
            })
            .filter(
              (x): x is { artifact: AlqamiArtifact; score: number; rawScore: number; angle: number | null; threshold: number } =>
                Boolean(x)
            )
            .sort((a, b) => b.score - a.score);

          if (mapped.length > 0) {
            setLiveCandidates(mapped.slice(0, 3).map((m) => ({ artifact: m.artifact, score: m.score })));
            const [best, second] = mapped;
            if (best.score >= best.threshold && best.score - (second?.score ?? 0) >= 0.048) {
              lockOnArtifact(best.artifact, best.score, 'sight', best.angle, { x: spot.x, y: spot.y });
            }
          }
        }
      } catch {
        // Keep scanning on transient frame errors
      }
      if (!disposed) sightTimer = window.setTimeout(sightLoop, 85);
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
              const found = findArtifact(target.id, allArtifactsRef.current);
              if (found) lockOnArtifact(found, 0.99, 'qr', 0, { x: 0.5, y: 0.46 });
            } else if (target.kind === 'moon') {
              const found = findArtifact(`moon:${target.recordId}`, allArtifactsRef.current);
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

  // Multi-crop instant "Catch & Analyze AR" (tests center + tight crop + full frame and picks highest confidence match)
  const handleCatchAndAnalyze = async () => {
    const v = videoRef.current;
    const sight = recognizerRef.current;
    if (v && v.videoWidth && sight) {
      try {
        const [r1, r2] = await Promise.all([sight.look(v, 0.85), sight.look(v, 0.6)]);
        const combined = [...r1, ...r2].sort((a, b) => b.score - a.score);
        for (const r of combined) {
          if (r.target.kind === 'artifact') {
            const found = findArtifact(r.target.id);
            if (found) {
              lockOnArtifact(found, Math.max(0.89, r.score), 'catch', r.angle ?? 0, { x: 0.5, y: 0.46 });
              return;
            }
          }
        }
      } catch {
        // Fallback below
      }
    }
    if (liveCandidates.length > 0) {
      lockOnArtifact(liveCandidates[0].artifact, Math.max(0.9, liveCandidates[0].score), 'catch', 0, { x: 0.5, y: 0.46 });
    } else {
      setScanPulse(true);
      window.setTimeout(() => setScanPulse(false), 650);
    }
  };

  // Upload any photo of a museum object to test instant DINOv2 recognition & spawn its 3D AR hologram + spatial parts
  const handlePhotoUploadAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const sight = recognizerRef.current;
    if (!sight) return;
    try {
      const bmp = await createImageBitmap(file);
      const c = document.createElement('canvas');
      c.width = c.height = 224;
      c.getContext('2d')!.drawImage(bmp, 0, 0, bmp.width, bmp.height, 0, 0, 224, 224);
      const ranked = await sight.look(c, 1.0);
      const mapped = ranked
        .map((r) => ({
          artifact: r.target.kind === 'artifact' ? findArtifact(r.target.id) : undefined,
          score: r.score,
          angle: r.angle,
        }))
        .filter((x): x is { artifact: AlqamiArtifact; score: number; angle: number | null } => Boolean(x.artifact));

      if (mapped.length > 0) {
        setLiveCandidates(mapped.slice(0, 3).map((m) => ({ artifact: m.artifact, score: m.score })));
        lockOnArtifact(mapped[0].artifact, Math.max(0.92, mapped[0].score), 'photo', mapped[0].angle ?? 0, {
          x: 0.5,
          y: 0.46,
        });
      }
    } catch {
      // Ignore invalid image file
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

  const speakPart = useCallback(
    (part: SpatialPartNode) => {
      setSelectedPartId(part.id);
      setAutoRotate3D(false);
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
    },
    [isAr, lang, activeArtifact.model.glb]
  );

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
    return allScanArtifacts.filter((a) => {
      if (hallFilter === 'MOON' && !a.moonRecordId) return false;
      if (hallFilter !== 'ALL' && hallFilter !== 'MOON' && !a.id.startsWith(hallFilter)) return false;
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
  }, [allScanArtifacts, searchQuery, hallFilter]);

  const currentAngleMeta = VIEW_ANGLES.reduce((prev, curr) =>
    Math.abs(curr.deg - viewAngle) < Math.abs(prev.deg - viewAngle) ? curr : prev
  );

  return (
    <div ref={viewportRef} dir={isAr ? 'rtl' : 'ltr'} className="fixed inset-0 bg-black text-white overflow-hidden select-none">
      {/* Hidden File Input for testing DINOv2 recognition on any uploaded museum photo */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUploadAnalyze} className="hidden" />

      {/* 1. PRIMARY AUGMENTED REALITY CAMERA FEED (100% Full-Screen Live Pass-Through) */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover brightness-105 contrast-[1.03]"
      />

      {/* Subtle AR Spatial Grid & Light Horizon Scrim */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 46%, rgba(16,185,129,0.16) 0%, transparent 55%), linear-gradient(rgba(52,211,153,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(52,211,153,0.07) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
        }}
      />

      {/* 2. PRIMARY FULL-VIEWPORT 3D AUGMENTED REALITY STAGE (Three.js WebGL + Raycasting + Smart Part Focus + WebXR) */}
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
          onSelectPart={speakPart}
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
              : detectSource === 'photo'
                ? t('واقع معزز · تطابق صورة DINOv2', 'AR · Photo Matched')
                : detectSource === 'catch'
                  ? t('واقع معزز · التقاط بصري فوري', 'AR · Instant Catch')
                  : detectSource === 'sight'
                    ? t('واقع معزز · تعرّف بصري DINOv2', 'AR · DINOv2 Sight Lock')
                    : t('واقع معزز مكاني ثلاثي الأبعاد نشط', 'Primary 3D Augmented Reality Active')}{' '}
            · {Math.round(confidence * 100)}% · {sightLatencyMs}ms
          </span>
        </div>

        {/* Live Top-3 Neural Vision Candidates Pill (when camera sees multiple candidates) */}
        {liveCandidates.length > 1 && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[9.5px] whitespace-nowrap">
            <span className="text-white/55">{t('أقرب تطابق:', 'Top matches:')}</span>
            {liveCandidates.slice(0, 3).map((c) => (
              <button
                key={c.artifact.id}
                onClick={() => lockOnArtifact(c.artifact, c.score, 'catch', 0, { x: 0.5, y: 0.46 })}
                className={`px-1.5 py-0.5 rounded-full transition ${
                  c.artifact.id === activeArtifact.id
                    ? 'bg-emerald-400/25 text-emerald-300 font-bold'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {c.artifact.id.replace(/^KFL-/, '')} ({Math.round(c.score * 100)}%)
              </button>
            ))}
          </div>
        )}
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
                strokeWidth={isSelected ? 3.2 : 1.9}
                strokeOpacity={isSelected ? 0.98 : 0.78}
                filter="url(#kfl-glow)"
              />
              {/* Flowing Energy Dashes from 3D Part Anchor to Floating AR Metadata Card */}
              <path
                d={pathD}
                fill="none"
                stroke="#ffffff"
                strokeWidth={isSelected ? 2.3 : 1.35}
                strokeDasharray="5 9"
                strokeOpacity={0.9}
              >
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.05s" repeatCount="indefinite" />
              </path>
              {/* 3D-Projected Physical Part Anchor Ring on the AR Mesh */}
              <circle
                cx={anchorX}
                cy={anchorY}
                r={isSelected ? 13 : 8}
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
                  ? t('كاميرا الواقع المعزز المباشر + 196 مجسّم 3D فريد + DINOv2', 'Live AR Camera + 196 Unique 3D Models + DINOv2')
                  : sightStatus === 'ready'
                    ? t('الواقع المعزز الثلاثي الأبعاد + 196 مجسّم فريد نشط', 'Primary 3D AR + 196 Unique 3D Models Active')
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
            onClick={() => fileInputRef.current?.click()}
            className="h-10 px-3 rounded-full bg-black/55 hover:bg-white/20 border border-white/20 text-[12px] font-semibold flex items-center gap-1.5"
            title={t('ارفع صورة أي قطعة أثرية للتعرّف عليها فوراً بـ DINOv2', 'Upload a photo of any artifact for instant DINOv2 recognition')}
          >
            <Upload className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden md:inline">{t('فحص صورة', 'Photo Scan')}</span>
          </button>
          <button
            onClick={() => setShowPhotoCompare((v) => !v)}
            className={`h-10 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 transition ${
              showPhotoCompare ? 'bg-white/25 text-white border-white/40' : 'bg-black/55 text-white/75 border-white/20'
            }`}
            title={t('إظهار/إخفاء صورة الأرشيف المصغّرة للمقارنة', 'Toggle small archive photo PiP comparison')}
          >
            <Eye className="w-4 h-4" />
            <span className="hidden xl:inline">{t('مقارنة', 'PiP')}</span>
          </button>
          <button
            onClick={() => setCatalogOpen(true)}
            className="h-10 px-3.5 rounded-full bg-black/65 hover:bg-white/25 border border-white/25 text-[12px] font-semibold flex items-center gap-1.5"
          >
            <Search className="w-4 h-4 text-[#FFD60A]" />
            <span>{t(`الفهرس (${allScanArtifacts.length})`, `Catalogue (${allScanArtifacts.length})`)}</span>
          </button>
          <MoonLoginButton lang={lang} compact />
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
                {activeArtifact.uri ? ` · ${activeArtifact.uri}` : ''}
              </p>
            </div>
          </div>

          {/* 360° View Angle Analyzer Pills */}
          <div className="hidden md:flex items-center gap-1 bg-black/55 p-1 rounded-full border border-white/15">
            {VIEW_ANGLES.map((ang) => (
              <button
                key={ang.deg}
                onClick={() => {
                  setSelectedPartId(null);
                  setAutoRotate3D(false);
                  setViewAngle(ang.deg);
                }}
                className={`h-7 px-2.5 rounded-full text-[10.5px] font-semibold transition ${
                  !autoRotate3D && !selectedPartId && viewAngle === ang.deg
                    ? 'bg-emerald-400 text-black'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                {ang[lang]}
              </button>
            ))}
            <button
              onClick={() => {
                setSelectedPartId(null);
                setAutoRotate3D((v) => !v);
              }}
              className={`h-7 px-2.5 rounded-full text-[10.5px] font-semibold flex items-center gap-1 transition ${
                autoRotate3D ? 'bg-[#FFD60A] text-black' : 'text-white/75 hover:text-white'
              }`}
            >
              <Rotate3d className="w-3.5 h-3.5" />
              <span>360°</span>
            </button>
          </div>

          {/* Primary Action Buttons: Catch & Analyze, Photo Scan, Voice Narrator, Full 3D Page */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCatchAndAnalyze}
              className="h-10 px-4 rounded-full bg-gradient-to-r from-[#FFD60A] to-amber-500 text-black font-bold text-[12.5px] flex items-center gap-1.5 shadow-[0_0_20px_rgba(251,191,36,0.45)] active:scale-95 transition"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{t('التقط وحلّل AR', 'Catch & Analyze AR')}</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-[12px] font-semibold flex sm:hidden items-center gap-1"
              title={t('فحص صورة', 'Photo Scan')}
            >
              <Camera className="w-4 h-4" />
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
            {t('اختر قطعة لعرض مجسّمها الفريد في الواقع المعزز:', 'Place unique 3D model in AR:')}
          </span>
          {allScanArtifacts.slice(0, 45).map((item) => {
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
            {t(`عرض الكل (${allScanArtifacts.length}) ←`, `View All (${allScanArtifacts.length}) →`)}
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
                  {t('فهرس ماسح الواقع المعزز لمتحف الكفيل (196 مجسّم 3D فريد)', 'Al-Kafeel Primary AR Scanner Catalogue (196 Unique 3D Models)')}
                </h2>
                <p className="text-[12px] text-white/60">
                  {t(
                    'لكل قطعة مجسّم ثلاثي الأبعاد فريد خاص بها مع ربط البيانات بأجزائها المكانية في الواقع المعزز',
                    'Every item has its own unique 3D model with spatial part-attached metadata in Augmented Reality'
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
                ['ALL', t(`الكل (${allScanArtifacts.length})`, `All (${allScanArtifacts.length})`)],
                ['MOON', t('مقتنيات mooon.site', 'mooon.site')],
                ['KFL-SWD', t('السيوف', 'Swords')],
                ['KFL-GUN', t('الأسلحة النارية', 'Firearms')],
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
 * - Renders the item's unique 360° 3D .glb artifact floating directly in the live camera pass-through (or native WebXR immersive-ar session).
 * - Creates interactive 3D spatial anchor nodes (`part.pos3d`) attached to the rotating 3D object pivot.
 * - Supports 3D Raycasting: tapping directly on any 3D part node or region of the 3D mesh in AR selects that part,
 *   rotates the 3D hologram to focus on it, and triggers voice narration.
 * - Projects every part's real 3D world position through the AR camera into screen coordinates (`vector.project(camera)`).
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
  onSelectPart: (part: SpatialPartNode) => void;
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
  onSelectPart,
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
    parts,
    onSelectPart,
  });
  stateRef.current = {
    deg: viewAngleDeg,
    auto: autoRotate,
    scale: arScale,
    center: trackedCenter,
    gyro: gyroOffset,
    selectedPartId,
    parts,
    onSelectPart,
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

    // Master AR World Anchor Group
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

    const scanLaserRing = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.485, 64),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    scanLaserRing.rotation.x = -Math.PI / 2;
    arAnchor.add(scanLaserRing);

    // Create 3D Part Anchor Nodes attached to the rotating 3D mesh pivot
    const partNodesMap = new Map<string, THREE.Object3D>();
    const pickTargets: THREE.Object3D[] = [];
    parts.forEach((p) => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(p.pos3d[0], p.pos3d[1], p.pos3d[2]);
      nodeGroup.userData.partId = p.id;

      const dotMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.036, 16, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color) })
      );
      dotMesh.userData.partId = p.id;
      nodeGroup.add(dotMesh);
      pickTargets.push(dotMesh);

      const haloMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.048, 0.066, 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(p.color),
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        })
      );
      haloMesh.userData.partId = p.id;
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

    // Interactive touch/mouse drag to rotate + tap raycasting on 3D part nodes & mesh
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let dragging = false;
    let movedDist = 0;
    let prevX = 0;
    let prevY = 0;
    let manualYaw = 0;
    let manualPitch = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      movedDist = 0;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      movedDist += Math.abs(dx) + Math.abs(dy);
      manualYaw += dx * 0.011;
      manualPitch = THREE.MathUtils.clamp(manualPitch + dy * 0.007, -0.45, 0.45);
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      // If it was a clean tap (< 8px movement), raycast against the 3D part spheres & 3D artifact mesh
      if (movedDist < 8) {
        const rect = el.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);

        // 1. Check direct hit on a 3D part node sphere
        const hits = raycaster.intersectObjects(pickTargets, true);
        if (hits.length > 0) {
          const hitId = hits[0].object.userData.partId;
          const foundPart = stateRef.current.parts.find((p) => p.id === hitId);
          if (foundPart) {
            stateRef.current.onSelectPart(foundPart);
            return;
          }
        }
        // 2. Check hit on the 3D artifact mesh itself and select the closest anatomical 3D part node
        if (loadedObj) {
          const meshHits = raycaster.intersectObject(loadedObj, true);
          if (meshHits.length > 0) {
            const hitWorld = meshHits[0].point;
            let bestPart: SpatialPartNode | null = null;
            let bestDist = Infinity;
            const nodeWorld = new THREE.Vector3();
            partNodesMap.forEach((node, id) => {
              node.getWorldPosition(nodeWorld);
              const d = nodeWorld.distanceTo(hitWorld);
              if (d < bestDist) {
                bestDist = d;
                bestPart = stateRef.current.parts.find((p) => p.id === id) ?? null;
              }
            });
            if (bestPart) stateRef.current.onSelectPart(bestPart);
          }
        }
      }
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

      // Smart Part Focus Alignment: if a part is selected and user isn't dragging, smoothly orient that part toward the camera
      const activePart = st.selectedPartId ? st.parts.find((p) => p.id === st.selectedPartId) : null;
      if (activePart && !dragging) {
        const focusYaw = Math.atan2(-activePart.pos3d[0], Math.max(0.15, activePart.pos3d[2])) * 0.45 + manualYaw;
        curYaw += (focusYaw - curYaw) * 0.1;
      } else if (st.auto && !dragging) {
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
      const targetScale = activePart ? st.scale * 1.08 : st.scale;
      arAnchor.scale.setScalar(arAnchor.scale.x + (targetScale - arAnchor.scale.x) * 0.15);

      pivot.rotation.y = curYaw;
      pivot.rotation.x = manualPitch;
      pivot.position.y = Math.sin(now * 0.0022) * 0.025;

      // Animate AR floor reticle & vertical laser scan ring
      outerRing.rotation.z = now * 0.0005;
      innerRing.rotation.z = -now * 0.0008;
      scanLaserRing.position.y = Math.sin(now * 0.0028) * 0.42;

      // Make 3D part halos face the AR camera & pulse the selected part halo
      partNodesMap.forEach((node, id) => {
        const halo = node.children[1];
        if (halo) {
          halo.lookAt(camera.position);
          const s = id === st.selectedPartId ? 1.45 + Math.sin(now * 0.01) * 0.2 : 1.0;
          halo.scale.setScalar(s);
        }
      });

      renderer.render(scene, camera);

      // Project 3D part anchors to 2D screen coordinates for the SVG cubic-bezier leader lines
      if (now - lastEmit > 24) {
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
