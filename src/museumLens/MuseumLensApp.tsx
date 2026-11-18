import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Aperture,
  ArrowLeft,
  Box,
  Camera,
  Check,
  ExternalLink,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  Languages,
  Library,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Scan,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';
import { useAllScanArtifacts } from '../moon/moonObjects';
import { getMoonSession, MoonSession } from '../moon/moonAuth';
import { CodeReader } from '../scan/codeReader';
import { resolveCode } from '../scan/resolveCode';
import { FlowTracker } from '../scan/flowTracker';
import { assetUrl } from '../utils/assetUrl';
import { spatialSound } from '../utils/spatialSound';
import { speak, stopSpeaking } from '../voice/speak';
import { analyzeFrameQuality, FrameMetrics } from './engine/frameQuality';
import {
  CustomTaughtMeta,
  findCatalogArtifact,
  getSavedGeminiKey,
  hasAiVisionCapability,
  identifyRealObjectWithAI,
  LiveCandidate,
  MuseumHotspot,
  MuseumScanResult,
  MuseumSightEngine,
  resultFromArtifact,
  resultFromTaught,
  saveCustomGeminiKey,
} from './engine/museumBrain';
import { Hologram3DCanvas } from './Hologram3DCanvas';
import './museumLens.css';

const AlqamiLoginScreen = lazy(() => import('../components/login/AlqamiLoginScreen'));

type Lang = 'ar' | 'en';
type DrawerKind = 'none' | 'teach' | 'catalog' | 'settings';

export const MuseumLensApp: React.FC = () => {
  // Isaac-only owner auth gate
  const [ownerSession, setOwnerSession] = useState<MoonSession | null>(() => getMoonSession());
  useEffect(() => {
    const sync = () => setOwnerSession(getMoonSession());
    window.addEventListener('alqami:moon-auth-changed', sync);
    return () => window.removeEventListener('alqami:moon-auth-changed', sync);
  }, []);

  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('alqami_lang') as Lang) || 'ar';
    } catch {
      return 'ar';
    }
  });
  const isAr = lang === 'ar';
  const t = useCallback((ar: string, en: string) => (isAr ? ar : en), [isAr]);

  const allArtifacts = useAllScanArtifacts();
  const artifactsRef = useRef<AlqamiArtifact[]>(allArtifacts);
  artifactsRef.current = allArtifacts;

  // Camera & test photo state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'denied'>('starting');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const uploadedImgRef = useRef<HTMLImageElement | null>(null);

  // Recognition engine state
  const engineRef = useRef<MuseumSightEngine | null>(null);
  const flowRef = useRef<FlowTracker>(new FlowTracker());
  const [engineStatus, setEngineStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [engineBackend, setEngineBackend] = useState<string>('');
  const [engineError, setEngineError] = useState<string>('');
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [frameQuality, setFrameQuality] = useState<FrameMetrics>({
    sharpness: 100,
    brightness: 120,
    glareRatio: 0,
    hint: 'ok',
  });

  // Detection & AR lock state
  const [lockedResult, setLockedResult] = useState<MuseumScanResult | null>(null);
  const lockedRef = useRef<MuseumScanResult | null>(null);
  lockedRef.current = lockedResult;

  const [candidates, setCandidates] = useState<LiveCandidate[]>([]);
  const [deepScanning, setDeepScanning] = useState(false);
  const [lockPulse, setLockPulse] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string>('');

  // AR Hologram & Hotspots state
  const [showHologram, setShowHologram] = useState(false);
  const [hologramScale, setHologramScale] = useState(1.0);
  const [activeHotspot, setActiveHotspot] = useState<MuseumHotspot | null>(null);
  const [cardExpanded, setCardExpanded] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Tracked normalized bounding box (0..1)
  const [trackedBox, setTrackedBox] = useState({ cx: 0.5, cy: 0.45, w: 0.52, h: 0.42 });
  const [gyro, setGyro] = useState({ yaw: 0, pitch: 0 });

  // Drawers & settings
  const [drawer, setDrawer] = useState<DrawerKind>('none');
  const [sensitivity, setSensitivity] = useState<number>(0.60);
  const sensitivityRef = useRef(0.60);
  sensitivityRef.current = sensitivity;
  const [antiGlare, setAntiGlare] = useState<boolean>(true);
  const antiGlareRef = useRef(true);
  antiGlareRef.current = antiGlare;
  const [autoSpeak, setAutoSpeak] = useState<boolean>(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>(() => getSavedGeminiKey());

  // Catalog search
  const [catalogSearch, setCatalogSearch] = useState('');
  const [taughtList, setTaughtList] = useState<Array<{ meta: CustomTaughtMeta; viewsCount: number }>>([]);

  // Teach real object state
  const [teachTitleAr, setTeachTitleAr] = useState('');
  const [teachTitleEn, setTeachTitleEn] = useState('');
  const [teachPeriod, setTeachPeriod] = useState('');
  const [teachMaterial, setTeachMaterial] = useState('');
  const [teachDesc, setTeachDesc] = useState('');
  const [teachSamples, setTeachSamples] = useState<Array<{ vec: Float32Array; blob: Blob; thumb: string }>>([]);
  const [sweeping360, setSweeping360] = useState(false);
  const [sweepProgress, setSweepProgress] = useState(0);
  const [savingTeach, setSavingTeach] = useState(false);

  const flashNotice = useCallback((msg: string, ms = 3200) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((cur) => (cur === msg ? '' : cur));
    }, ms);
  }, []);

  const refreshTaughtList = useCallback(async () => {
    if (!engineRef.current) return;
    const list = await engineRef.current.listTaughtObjects();
    setTaughtList(list);
  }, []);

  const lockResult = useCallback(
    (res: MuseumScanResult, spot = { x: 0.5, y: 0.45 }) => {
      setLockedResult(res);
      setActiveHotspot(null);
      setCardExpanded(true);
      setShowHologram(Boolean(res.artifact?.model?.glb));
      setLockPulse(true);
      window.setTimeout(() => setLockPulse(false), 700);
      spatialSound.playAlqamiChime();

      const v = videoRef.current;
      if (v && v.videoWidth && !uploadedPhotoUrl) {
        flowRef.current.seed(res.id, v, { x: spot.x, y: spot.y, hw: 0.22, hh: 0.20 });
      }
      setTrackedBox({ cx: spot.x, cy: spot.y, w: 0.56, h: 0.42 });

      if (autoSpeak) {
        const lines = isAr
          ? [res.titleAr, res.descriptionAr].filter(Boolean)
          : [res.titleEn, res.descriptionEn].filter(Boolean);
        setIsSpeaking(true);
        speak(lines, lang, { onSentence: () => {}, onEnd: () => setIsSpeaking(false) });
      }
    },
    [autoSpeak, isAr, lang, uploadedPhotoUrl]
  );

  const clearLock = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
    setLockedResult(null);
    setActiveHotspot(null);
    setShowHologram(false);
    setUploadedPhotoUrl(null);
    uploadedImgRef.current = null;
    engineRef.current?.resetTemporal();
    setTrackedBox({ cx: 0.5, cy: 0.45, w: 0.52, h: 0.42 });
  }, []);

  // 1. Start live camera stream (only after owner auth passes)
  useEffect(() => {
    if (!ownerSession) return;
    let alive = true;
    setCameraState('starting');
    setTorchOn(false);
    setTorchSupported(false);

    const startCam = async () => {
      try {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() as any) || {};
        setTorchSupported(Boolean(caps.torch));

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraState('live');
      } catch {
        if (alive) setCameraState('denied');
      }
    };
    void startCam();

    // Gyroscope parallax
    let baseA: number | null = null;
    let baseB: number | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null) return;
      if (baseA == null) baseA = e.alpha;
      if (baseB == null) baseB = e.beta;
      let dY = e.alpha - baseA;
      if (dY > 180) dY -= 360;
      if (dY < -180) dY += 360;
      const dP = e.beta - baseB;
      setGyro({
        yaw: Math.max(-0.45, Math.min(0.45, dY * 0.012)),
        pitch: Math.max(-0.3, Math.min(0.3, dP * 0.008)),
      });
    };
    window.addEventListener('deviceorientation', onOrient);

    return () => {
      alive = false;
      window.removeEventListener('deviceorientation', onOrient);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      stopSpeaking();
    };
  }, [facingMode, ownerSession]);

  // Toggle hardware flashlight / torch
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  // 2. Initialize MuseumSightEngine (iOS-safe WASM INT8 + Desktop WebGPU with automatic fallback)
  //    + Continuous Multi-Scale Visual Loop + Live QR Loop + 60fps FlowTracker
  useEffect(() => {
    if (!ownerSession) return;
    let disposed = false;
    let sightTimer = 0;
    let qrTimer = 0;
    let raf = 0;

    const engine = new MuseumSightEngine();
    engineRef.current = engine;
    const qrReader = new CodeReader();

    setEngineStatus('loading');
    setEngineError('');

    engine
      .prepare()
      .then(() => {
        if (disposed) return;
        setEngineStatus('ready');
        setEngineBackend(engine.backendLabel);
        void refreshTaughtList();
      })
      .catch((err) => {
        if (disposed) return;
        setEngineStatus('error');
        setEngineError(err instanceof Error ? err.message : 'Model offline');
      });

    const crops = [
      { cx: 0.5, cy: 0.45, scale: 0.78 },
      { cx: 0.5, cy: 0.45, scale: 0.58 },
      { cx: 0.5, cy: 0.48, scale: 0.94 },
    ];
    let cropIdx = 0;

    const runSightLoop = async () => {
      if (disposed) return;
      const v = videoRef.current;
      // Pause auto-scan while already locked, teaching, browsing drawers, or viewing uploaded photo
      if (
        !lockedRef.current &&
        !uploadedImgRef.current &&
        drawer === 'none' &&
        v &&
        v.readyState >= 2 &&
        v.videoWidth
      ) {
        const quality = analyzeFrameQuality(v);
        setFrameQuality(quality);

        // Skip severely motion-blurred frames so embeddings stay crisp
        if (quality.sharpness >= 22) {
          try {
            const c = crops[cropIdx % crops.length];
            cropIdx++;
            const out = await engine.scanCrop(v, artifactsRef.current, {
              cx: c.cx,
              cy: c.cy,
              scale: c.scale,
              enhance: antiGlareRef.current,
              autoLockThreshold: sensitivityRef.current,
              candidateFloor: Math.max(0.42, sensitivityRef.current - 0.16),
            });
            if (disposed) return;
            setLatencyMs(out.latencyMs);
            setCandidates(out.candidates);
            if (out.locked) {
              lockResult(out.locked, { x: c.cx, y: c.cy });
            }
          } catch {
            /* transient frame error */
          }
        }
      }
      if (!disposed) {
        // 220ms pace on mobile WASM keeps UI butter-smooth at 60fps; 110ms on WebGPU
        const delay = engine.backendLabel.includes('WebGPU') ? 110 : 220;
        sightTimer = window.setTimeout(runSightLoop, delay);
      }
    };

    const runQrLoop = async () => {
      if (disposed) return;
      const v = videoRef.current;
      if (!lockedRef.current && !uploadedImgRef.current && drawer === 'none' && v && v.readyState >= 2 && v.videoWidth) {
        try {
          const code = await qrReader.read(v);
          if (code && !disposed) {
            const target = await resolveCode(code.text);
            if (target.kind === 'artifact') {
              const art = findCatalogArtifact(target.id, artifactsRef.current);
              if (art) lockResult(resultFromArtifact(art, 0.99, 'qr', 0));
            } else if (target.kind === 'moon') {
              const art = findCatalogArtifact(`moon:${target.recordId}`, artifactsRef.current);
              if (art) lockResult(resultFromArtifact(art, 0.99, 'qr', 0));
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!disposed) qrTimer = window.setTimeout(runQrLoop, 220);
    };

    const trackLoop = () => {
      if (disposed) return;
      const v = videoRef.current;
      const cur = lockedRef.current;
      if (cur && v && v.readyState >= 2 && v.videoWidth && !uploadedImgRef.current) {
        flowRef.current.update(v);
        const box = flowRef.current.box(cur.id);
        if (box) {
          setTrackedBox((prev) => ({
            cx: prev.cx + (Math.max(0.22, Math.min(0.78, box.x)) - prev.cx) * 0.22,
            cy: prev.cy + (Math.max(0.24, Math.min(0.68, box.y)) - prev.cy) * 0.22,
            w: Math.max(0.36, Math.min(0.74, box.hw * 2.2)),
            h: Math.max(0.28, Math.min(0.62, box.hh * 2.2)),
          }));
        }
      }
      raf = requestAnimationFrame(trackLoop);
    };

    sightTimer = window.setTimeout(runSightLoop, 400);
    qrTimer = window.setTimeout(runQrLoop, 500);
    raf = requestAnimationFrame(trackLoop);

    return () => {
      disposed = true;
      window.clearTimeout(sightTimer);
      window.clearTimeout(qrTimer);
      cancelAnimationFrame(raf);
      void engine.dispose();
      engineRef.current = null;
    };
  }, [ownerSession, drawer, lockResult, refreshTaughtList]);

  // 3. Center Shutter — Deep Real-Life Object Identification (5-crop DINOv2 Ensemble + Gemini Vision Curator!)
  const handleDeepScan = async (explicitSource?: HTMLImageElement | HTMLVideoElement) => {
    const source = explicitSource || uploadedImgRef.current || videoRef.current;
    if (!source) return;
    if (source instanceof HTMLVideoElement && (!source.videoWidth || source.readyState < 2)) {
      flashNotice(t('الكاميرا غير جاهزة بعد — يمكنك رفع صورة للتجربة', 'Camera not ready — you can upload a photo to scan'));
      return;
    }

    setDeepScanning(true);
    spatialSound.playPinchTap();

    try {
      // Step A: Run 5-window high-resolution DINOv2 ensemble locally first
      let ensembleCandidates: LiveCandidate[] = [];
      if (engineRef.current && engineStatus === 'ready') {
        ensembleCandidates = await engineRef.current.deepEnsembleSnapshot(source, artifactsRef.current);
        setCandidates(ensembleCandidates.slice(0, 3));
      }

      const topLocal = ensembleCandidates[0];
      // If strong local DINOv2 match (>= 0.68 with clear margin), lock immediately!
      if (topLocal && topLocal.score >= 0.68 && topLocal.score - (ensembleCandidates[1]?.score ?? 0) >= 0.03) {
        const res = topLocal.isTaught
          ? resultFromTaught((await engineRef.current!.listTaughtObjects()).find((x) => x.meta.key === topLocal.key)!.meta, topLocal.score)
          : resultFromArtifact(topLocal.artifact!, topLocal.score, 'dinov2', topLocal.angle);
        lockResult(res);
        setDeepScanning(false);
        return;
      }

      // Step B: If AI Vision is available, run Gemini Museum Curator on ANY real-life object!
      if (hasAiVisionCapability()) {
        try {
          const aiResult = await identifyRealObjectWithAI(source, artifactsRef.current, lang, ensembleCandidates);
          lockResult(aiResult);
          setDeepScanning(false);
          return;
        } catch (aiErr) {
          console.warn('AI Vision fallback to local ensemble:', aiErr);
        }
      }

      // Step C: Graceful offline / no-AI-key fallback to best local DINOv2 candidate if plausible (>= 0.48)
      if (topLocal && topLocal.score >= 0.48) {
        const res = topLocal.isTaught
          ? resultFromTaught((await engineRef.current!.listTaughtObjects()).find((x) => x.meta.key === topLocal.key)!.meta, topLocal.score)
          : resultFromArtifact(topLocal.artifact!, topLocal.score, 'dinov2', topLocal.angle);
        lockResult(res);
      } else {
        flashNotice(
          t(
            'لم نجد تطابقاً كافياً — جرّب الاقتراب أو علّم هذه القطعة عبر زر (+)',
            'No confident match yet — move closer, add a Gemini key in Settings, or tap (+) to Teach this object'
          ),
          4200
        );
      }
    } finally {
      setDeepScanning(false);
    }
  };

  // Upload any real-life photo from gallery/PC to scan immediately
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      uploadedImgRef.current = img;
      setUploadedPhotoUrl(url);
      setLockedResult(null);
      void handleDeepScan(img);
    };
    img.src = url;
  };

  // Select a live candidate chip
  const handlePickCandidate = async (c: LiveCandidate) => {
    spatialSound.playPinchTap();
    if (c.isTaught && engineRef.current) {
      const list = await engineRef.current.listTaughtObjects();
      const found = list.find((x) => x.meta.key === c.key);
      if (found) lockResult(resultFromTaught(found.meta, Math.max(c.score, 0.82)));
    } else if (c.artifact) {
      lockResult(resultFromArtifact(c.artifact, Math.max(c.score, 0.82), 'dinov2', c.angle));
    }
  };

  // Teach Real Object — capture single angle
  const captureTeachAngle = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !engineRef.current) {
      flashNotice(t('الكاميرا غير متاحة للتصوير', 'Camera unavailable'));
      return;
    }
    const snap = await engineRef.current.embedSnapshot(v);
    if (snap) {
      spatialSound.playPinchTap();
      setTeachSamples((prev) => [...prev, snap]);
    }
  };

  // Teach Real Object — guided 5-second 360° orbit auto-capture (up to 8 sharp diverse angles!)
  const startGuided360Sweep = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !engineRef.current || sweeping360) return;
    setSweeping360(true);
    setSweepProgress(0);
    const collected: Array<{ vec: Float32Array; blob: Blob; thumb: string }> = [...teachSamples];
    const start = performance.now();
    const duration = 5200;

    while (performance.now() - start < duration && collected.length < 8) {
      const elapsed = performance.now() - start;
      setSweepProgress(Math.min(100, Math.round((elapsed / duration) * 100)));
      const q = analyzeFrameQuality(v);
      if (q.sharpness >= 26) {
        const snap = await engineRef.current.embedSnapshot(v);
        if (snap) {
          // Deduplicate near-identical angles (cosine similarity > 0.96)
          const duplicate = collected.some((prev) => {
            let dot = 0;
            for (let i = 0; i < prev.vec.length; i++) dot += prev.vec[i] * snap.vec[i];
            return dot > 0.96;
          });
          if (!duplicate) {
            collected.push(snap);
            setTeachSamples([...collected]);
            spatialSound.playPinchTap();
          }
        }
      }
      await new Promise((r) => setTimeout(r, 420));
    }
    setSweepProgress(100);
    setSweeping360(false);
  };

  const handleSaveTaughtObject = async () => {
    if (!engineRef.current || teachSamples.length === 0) return;
    if (!teachTitleAr.trim() && !teachTitleEn.trim()) {
      flashNotice(t('اكتب اسم القطعة أولاً', 'Please enter a name for this object'));
      return;
    }
    setSavingTeach(true);
    try {
      const saved = await engineRef.current.enrollRealObject({
        titleAr: teachTitleAr.trim() || teachTitleEn.trim(),
        titleEn: teachTitleEn.trim() || teachTitleAr.trim(),
        period: teachPeriod.trim() || undefined,
        material: teachMaterial.trim() || undefined,
        description: teachDesc.trim() || undefined,
        samples: teachSamples,
      });
      await refreshTaughtList();
      setTeachTitleAr('');
      setTeachTitleEn('');
      setTeachPeriod('');
      setTeachMaterial('');
      setTeachDesc('');
      setTeachSamples([]);
      setDrawer('none');
      lockResult(resultFromTaught(saved, 0.98));
      flashNotice(t('تم حفظ القطعة وتدريب العدسة بنجاح!', 'Object enrolled! Lens now recognizes it live.'));
    } finally {
      setSavingTeach(false);
    }
  };

  const toggleSpeakResult = () => {
    if (!lockedResult) return;
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    const lines = isAr
      ? [lockedResult.titleAr, lockedResult.descriptionAr, lockedResult.inscriptionReading ? `النص المقروء: ${lockedResult.inscriptionReading}` : ''].filter(Boolean)
      : [lockedResult.titleEn, lockedResult.descriptionEn, lockedResult.inscriptionReading ? `Inscription: ${lockedResult.inscriptionReading}` : ''].filter(Boolean);
    setIsSpeaking(true);
    speak(lines, lang, { onSentence: () => {}, onEnd: () => setIsSpeaking(false) });
  };

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    const list = allArtifacts.length ? allArtifacts : ALQAMI_ARTIFACTS;
    if (!q) return list.slice(0, 48);
    return list
      .filter(
        (a) =>
          a.title.ar.toLowerCase().includes(q) ||
          a.title.en.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          (a.categoryLabel?.ar || '').toLowerCase().includes(q) ||
          (a.categoryLabel?.en || '').toLowerCase().includes(q)
      )
      .slice(0, 48);
  }, [allArtifacts, catalogSearch]);

  // Strict Isaac-only auth check
  if (!ownerSession) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 bg-[#06070a] flex items-center justify-center text-white text-sm">
            Loading Alqami…
          </div>
        }
      >
        <AlqamiLoginScreen
          initialLang={lang}
          session={ownerSession}
          locked={true}
          onSessionChange={(next) => setOwnerSession(next)}
          onClose={() => setOwnerSession(getMoonSession())}
        />
      </Suspense>
    );
  }

  const sourceBadgeLabel = (src: MuseumScanResult['source']) => {
    if (src === 'dinov2') return t('بصمة DINOv2 البصرية', 'DINOv2 Visual Match');
    if (src === 'ai-vision') return t('محلل المتاحف الذكي', 'Deep AI Curator');
    if (src === 'qr') return t('ملصق QR متحفي', 'QR Museum Plaque');
    if (src === 'taught') return t('قطعة مُدرَّبة 360°', 'Enrolled 360° Object');
    return t('سجل متحف الكفيل', 'Al-Kafeel Catalogue');
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 w-screen h-[100dvh] bg-[#05070c] text-slate-950 overflow-hidden select-none"
    >
      {/* Hidden file input for scanning any real-life photo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* 1. LIVE CAMERA STREAM / UPLOADED PHOTO BACKDROP */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          uploadedPhotoUrl ? 'opacity-0' : 'opacity-100'
        }`}
      />
      {uploadedPhotoUrl && (
        <img
          src={uploadedPhotoUrl}
          alt="Uploaded museum photo"
          className="absolute inset-0 w-full h-full object-contain bg-black"
        />
      )}
      <canvas ref={photoCanvasRef} className="hidden" />

      {/* Camera unavailable fallback backdrop (hidden once an artifact or photo is active) */}
      {cameraState === 'denied' && !uploadedPhotoUrl && !lockedResult && drawer === 'none' && (
        <div className="absolute inset-0 z-5 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-slate-950 via-slate-900 to-black">
          <div className="ml-glass-strong max-w-sm p-6 space-y-4 text-slate-950">
            <Camera className="w-10 h-10 mx-auto text-slate-900" />
            <h2 className="text-base font-black">
              {t('الكاميرا غير مفعّلة على هذا الجهاز', 'Camera is unavailable on this device')}
            </h2>
            <p className="text-xs font-medium text-slate-800 leading-relaxed">
              {t(
                'يمكنك السماح للكاميرا من إعدادات المتصفح، أو رفع صورة أي قطعة متحفية حقيقية لفحصها فوراً.',
                'Allow camera access in your browser settings, or upload any real-life museum object photo to scan it right away.'
              )}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-slate-950 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4" />
                <span>{t('رفع صورة قطعة', 'Upload Photo')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawer('catalog')}
                className="px-4 py-2.5 rounded-xl bg-white/75 text-slate-950 text-xs font-bold border border-white cursor-pointer"
              >
                {t('تصفح القطع', 'Browse')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. INTERACTIVE 3D HOLOGRAM OVERLAY (when locked artifact has GLB & toggled on) */}
      {showHologram && lockedResult?.artifact?.model?.glb && (
        <Hologram3DCanvas
          glbUrl={lockedResult.artifact.model.glb}
          initialAngleDeg={lockedResult.angle}
          scale={hologramScale}
          autoRotate={true}
          gyroYaw={gyro.yaw}
          gyroPitch={gyro.pitch}
          centerX={trackedBox.cx}
          centerY={trackedBox.cy}
        />
      )}

      {/* 3. ALQAMI3-INSPIRED PRECISION AR VIEWFINDER, 3D RGB AXES & INTERACTIVE HOTSPOTS */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {/* Tracked AR Frame */}
        <div
          style={{
            left: `${trackedBox.cx * 100}%`,
            top: `${trackedBox.cy * 100}%`,
            width: `${Math.min(82, trackedBox.w * 100)}%`,
            maxWidth: '420px',
            height: `${Math.min(54, trackedBox.h * 100)}%`,
            maxHeight: '360px',
            transform: `translate(-50%, -50%) translate3d(${gyro.yaw * -14}px, ${gyro.pitch * -10}px, 0)`,
            transition: 'left 120ms linear, top 120ms linear, width 220ms ease, height 220ms ease',
          }}
          className={`absolute ${lockPulse ? 'ml-lock-flash rounded-2xl' : ''}`}
        >
          {/* Subtle hairline perimeter (alqami3 signature) */}
          <div
            className={`absolute inset-0 rounded-2xl border transition-colors duration-300 ${
              lockedResult ? 'border-emerald-300/75' : 'border-white/35'
            }`}
          />

          {/* 4 Crisp Corner Brackets (Apple Vision Pro / alqami3 style) */}
          <span className={`absolute -top-0.5 -left-0.5 w-7 h-7 border-t-[3px] border-l-[3px] rounded-tl-2xl ${lockedResult ? 'border-emerald-300' : 'border-white'}`} />
          <span className={`absolute -top-0.5 -right-0.5 w-7 h-7 border-t-[3px] border-r-[3px] rounded-tr-2xl ${lockedResult ? 'border-emerald-300' : 'border-white'}`} />
          <span className={`absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-[3px] border-l-[3px] rounded-bl-2xl ${lockedResult ? 'border-emerald-300' : 'border-white'}`} />
          <span className={`absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-[3px] border-r-[3px] rounded-br-2xl ${lockedResult ? 'border-emerald-300' : 'border-white'}`} />

          {/* Animated sweeping laser scanline while actively searching */}
          {!lockedResult && (
            <div className="absolute inset-2 overflow-hidden rounded-xl">
              <div className="ml-scan-beam w-full h-16 bg-gradient-to-b from-transparent via-white/45 to-transparent border-b border-white/80" />
            </div>
          )}

          {/* Deep Scanning radial pulse */}
          {deepScanning && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="ml-glass-pill px-4 py-2 flex items-center gap-2 text-xs font-black text-slate-950">
                <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-950 rounded-full animate-spin" />
                <span>{t('جاري التحليل العميق للقطعة…', 'Deep-analyzing museum object…')}</span>
              </div>
            </div>
          )}

          {/* alqami3 Precision 3D RGB Coordinate Axis Gizmo (bottom-left corner) */}
          <svg
            viewBox="0 0 64 64"
            className="absolute -bottom-5 -left-5 w-14 h-14 drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
          >
            {/* X Axis (Red) */}
            <line x1="18" y1="46" x2="54" y2="46" stroke="#ff3b30" strokeWidth="2.5" strokeLinecap="round" />
            <text x="56" y="49" fill="#ff3b30" fontSize="9" fontWeight="800">X</text>
            {/* Y Axis (Green) */}
            <line x1="18" y1="46" x2="18" y2="10" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round" />
            <text x="15" y="8" fill="#34c759" fontSize="9" fontWeight="800">Y</text>
            {/* Z Axis (Blue) */}
            <line x1="18" y1="46" x2="4" y2="58" stroke="#0071e3" strokeWidth="2.5" strokeLinecap="round" />
            <text x="1" y="63" fill="#38bdf8" fontSize="9" fontWeight="800">Z</text>
            <circle cx="18" cy="46" r="3" fill="#ffffff" />
          </svg>

          {/* Live Quality Hint Chip right below reticle while searching */}
          {!lockedResult && !deepScanning && frameQuality.hint !== 'ok' && cameraState === 'live' && (
            <div className="absolute -bottom-11 inset-x-0 mx-auto w-fit ml-glass-pill px-3.5 py-1 text-[11px] font-bold text-slate-950 whitespace-nowrap">
              {frameQuality.hint === 'glare' && t('وهج زجاج الفاترينة — أمل الهاتف قليلاً', 'Glass glare detected — tilt phone slightly')}
              {frameQuality.hint === 'dark' && t('إضاءة خافتة — جرّب تشغيل الفلاش', 'Low hall light — try tapping the torch')}
              {frameQuality.hint === 'blur' && t('ثبّت الهاتف قليلاً للتركيز', 'Hold steady to sharpen focus')}
            </div>
          )}

          {/* INTERACTIVE PULSING HOTSPOT PINS ON LOCKED OBJECT (alqami3 signature!) */}
          {lockedResult &&
            lockedResult.hotspots.map((pin) => {
              const isSelected = activeHotspot?.id === pin.id;
              return (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setActiveHotspot(isSelected ? null : pin);
                    if (!isSelected) {
                      const lines = isAr ? [pin.labelAr, pin.noteAr].filter(Boolean) : [pin.labelEn, pin.noteEn].filter(Boolean);
                      speak(lines, lang, { onSentence: () => {}, onEnd: () => {} });
                    }
                  }}
                  style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  aria-label={isAr ? pin.labelAr : pin.labelEn}
                >
                  <span className="ml-pin-ring absolute inset-0 rounded-full bg-white/70" />
                  <span
                    className={`relative flex items-center justify-center w-7 h-7 rounded-full border-2 shadow-lg transition-transform ${
                      isSelected
                        ? 'bg-slate-950 border-white scale-115 text-white'
                        : 'bg-white/85 border-white text-slate-950 group-hover:scale-110'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span className="hidden sm:inline-block absolute top-full mt-1 left-1/2 -translate-x-1/2 ml-glass-pill px-2 py-0.5 text-[10px] font-extrabold text-slate-950 whitespace-nowrap">
                    {isAr ? pin.labelAr : pin.labelEn}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* 4. TOP CSS.GLASS BAR */}
      <div className="fixed top-[calc(env(safe-area-inset-top)+12px)] inset-x-3 z-30 flex items-center justify-between gap-2 pointer-events-none">
        {/* Back to Alqami OS */}
        <a
          href="./"
          className="pointer-events-auto ml-glass-pill h-10 px-3.5 flex items-center gap-2 text-slate-950 font-extrabold text-xs hover:bg-white/50 transition"
        >
          <ArrowLeft className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
          <img src={assetUrl('alqami-logo.png')} alt="Alqami" className="w-5 h-5 object-contain invert" />
          <span className="hidden sm:inline">{t('عدسة المتحف', 'Museum Lens')}</span>
        </a>

        {/* Live Telemetry & Engine Status Pill */}
        <div className="pointer-events-auto ml-glass-pill h-10 px-3.5 flex items-center gap-2 text-[11.5px] font-extrabold text-slate-950 max-w-[52vw] truncate">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              lockedResult
                ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                : engineStatus === 'ready'
                  ? 'bg-amber-400 animate-pulse'
                  : engineStatus === 'loading'
                    ? 'bg-sky-400 animate-pulse'
                    : 'bg-rose-500'
            }`}
          />
          <span className="truncate">
            {lockedResult
              ? `✓ ${isAr ? lockedResult.titleAr : lockedResult.titleEn}`
              : engineStatus === 'loading'
                ? t('تحميل محرك الرؤية…', 'Loading Vision AI…')
                : engineStatus === 'ready'
                  ? t(
                      `جاهز (${engineBackend}) • ${latencyMs ? `${latencyMs}ms` : 'يمسح…'}`,
                      `Live (${engineBackend}) • ${latencyMs ? `${latencyMs}ms` : 'Scanning…'}`
                    )
                  : t('الوضع الذكي والرموز', 'AI & QR Mode')}
          </span>
        </div>

        {/* Right Quick Controls: Torch, Flip, Lang */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`ml-glass-pill w-10 h-10 flex items-center justify-center text-slate-950 transition cursor-pointer ${
                torchOn ? '!bg-amber-300/80' : ''
              }`}
              title={t('الفلاش', 'Torch')}
            >
              {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
            className="ml-glass-pill w-10 h-10 flex items-center justify-center text-slate-950 hover:bg-white/50 transition cursor-pointer"
            title={t('تبديل الكاميرا', 'Switch Camera')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setLang(isAr ? 'en' : 'ar')}
            className="ml-glass-pill h-10 px-3 flex items-center gap-1 text-slate-950 text-xs font-extrabold hover:bg-white/50 transition cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{isAr ? 'EN' : 'ع'}</span>
          </button>
        </div>
      </div>

      {/* Transient Toast Notice */}
      <AnimatePresence>
        {statusNotice && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-[calc(env(safe-area-inset-top)+62px)] inset-x-0 mx-auto w-fit max-w-[90vw] z-40 ml-glass-strong px-4 py-2 text-xs font-extrabold text-slate-950 text-center"
          >
            {statusNotice}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. ACTIVE HOTSPOT DETAIL POPOVER (css.glass) */}
      <AnimatePresence>
        {activeHotspot && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            className="fixed top-[calc(env(safe-area-inset-top)+66px)] inset-x-3 sm:inset-x-0 sm:mx-auto sm:w-[420px] z-35 ml-glass-strong p-4 text-slate-950"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-950 text-white flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <h3 className="text-sm font-black">
                  {isAr ? activeHotspot.labelAr : activeHotspot.labelEn}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveHotspot(null)}
                className="w-7 h-7 rounded-full bg-white/60 flex items-center justify-center text-slate-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-900 leading-relaxed">
              {isAr ? activeHotspot.noteAr : activeHotspot.noteEn}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. FLOATING CSS.GLASS HOLOGRAPHIC RESULT CARD (when locked) */}
      <AnimatePresence>
        {lockedResult && drawer === 'none' && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] inset-x-3 sm:inset-x-0 sm:mx-auto sm:w-[540px] z-30 ml-glass-strong p-4 text-slate-950 max-h-[46vh] overflow-y-auto ml-no-scrollbar"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {lockedResult.imageUrl && (
                  <img
                    src={
                      lockedResult.imageUrl.startsWith('data:') || /^https?:\/\//i.test(lockedResult.imageUrl)
                        ? lockedResult.imageUrl
                        : assetUrl(lockedResult.imageUrl.replace(/^\.\//, ''))
                    }
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-white/80 bg-black/15 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-slate-950 text-white text-[10px] font-extrabold">
                      {sourceBadgeLabel(lockedResult.source)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/75 text-slate-950 text-[10px] font-black border border-white">
                      {Math.round(lockedResult.confidence * 100)}%
                    </span>
                  </div>
                  <h2 className="mt-1 text-sm sm:text-base font-black text-slate-950 leading-snug">
                    {isAr ? lockedResult.titleAr : lockedResult.titleEn}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setCardExpanded(!cardExpanded)}
                  className="px-2.5 h-8 rounded-full bg-white/70 text-[10.5px] font-extrabold text-slate-950 border border-white cursor-pointer"
                >
                  {cardExpanded ? t('تصغير', 'Compact') : t('التفاصيل', 'Details')}
                </button>
                <button
                  type="button"
                  onClick={clearLock}
                  className="w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center cursor-pointer"
                  title={t('مسح قطعة أخرى', 'Scan another')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {cardExpanded && (
              <div className="mt-3 space-y-3">
                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {(lockedResult.periodAr || lockedResult.periodEn) && (
                    <div className="p-2 rounded-xl bg-white/55 border border-white/80">
                      <span className="block text-[9.5px] font-bold text-slate-600">{t('الحقبة / الفترة', 'PERIOD')}</span>
                      <span className="font-extrabold text-slate-950">
                        {isAr ? lockedResult.periodAr || lockedResult.periodEn : lockedResult.periodEn || lockedResult.periodAr}
                      </span>
                    </div>
                  )}
                  {(lockedResult.materialAr || lockedResult.materialEn) && (
                    <div className="p-2 rounded-xl bg-white/55 border border-white/80">
                      <span className="block text-[9.5px] font-bold text-slate-600">{t('المواد', 'MATERIALS')}</span>
                      <span className="font-extrabold text-slate-950">
                        {isAr ? lockedResult.materialAr || lockedResult.materialEn : lockedResult.materialEn || lockedResult.materialAr}
                      </span>
                    </div>
                  )}
                </div>

                {lockedResult.dimensions && (
                  <p className="text-[11px] font-bold text-slate-800 bg-white/45 px-2.5 py-1.5 rounded-lg border border-white/70">
                    {t('الأبعاد: ', 'Dimensions: ')}
                    {lockedResult.dimensions}
                  </p>
                )}

                {lockedResult.inscriptionReading && (
                  <div className="p-2.5 rounded-xl bg-amber-100/75 border border-amber-300/80 text-xs font-bold text-slate-950">
                    <span className="block text-[10px] font-black text-amber-900 mb-0.5">
                      {t('قراءة النقش / الكتابة', 'INSCRIPTION READING')}
                    </span>
                    {lockedResult.inscriptionReading}
                  </div>
                )}

                <p className="text-xs font-semibold text-slate-900 leading-relaxed">
                  {isAr ? lockedResult.descriptionAr : lockedResult.descriptionEn}
                </p>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={toggleSpeakResult}
                    className={`h-9 px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                      isSpeaking
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-950 text-white hover:bg-slate-900'
                    }`}
                  >
                    {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{isSpeaking ? t('إيقاف الصوت', 'Stop Voice') : t('الدليل الصوتي', 'Audio Guide')}</span>
                  </button>

                  {lockedResult.artifact?.model?.glb && (
                    <button
                      type="button"
                      onClick={() => setShowHologram((s) => !s)}
                      className={`h-9 px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition cursor-pointer ${
                        showHologram
                          ? 'bg-slate-950 text-white border-slate-950'
                          : 'bg-white/75 text-slate-950 border-white'
                      }`}
                    >
                      <Box className="w-3.5 h-3.5" />
                      <span>{showHologram ? t('إخفاء 3D', 'Hide 3D') : t('مجسم 3D', '3D Hologram')}</span>
                    </button>
                  )}

                  {showHologram && lockedResult.artifact?.model?.glb && (
                    <input
                      type="range"
                      min={0.55}
                      max={1.65}
                      step={0.05}
                      value={hologramScale}
                      onChange={(e) => setHologramScale(Number(e.target.value))}
                      className="w-20 accent-slate-950"
                      title={t('حجم المجسم', '3D Scale')}
                    />
                  )}

                  {lockedResult.artifact && (
                    <a
                      href={`./object.html?artifact=${encodeURIComponent(lockedResult.artifact.id)}`}
                      className="h-9 px-3 rounded-xl bg-white/75 hover:bg-white text-slate-950 border border-white text-xs font-extrabold flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{t('البطاقة الكاملة', 'Full Record')}</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={clearLock}
                    className="h-9 px-3 rounded-xl bg-white/65 hover:bg-white text-slate-950 border border-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('مسح جديد', 'Next')}</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. LIVE VISUAL CANDIDATE STRIP (when scanning & top matches >= 44%) */}
      <AnimatePresence>
        {!lockedResult && candidates.length > 0 && drawer === 'none' && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] inset-x-3 z-30 flex items-center justify-center"
          >
            <div className="flex items-center gap-2 overflow-x-auto ml-no-scrollbar max-w-full py-1 px-1">
              {candidates.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => handlePickCandidate(c)}
                  className="ml-glass shrink-0 flex items-center gap-2 px-2.5 py-1.5 text-slate-950 hover:bg-white/55 transition active:scale-95 cursor-pointer max-w-[230px]"
                >
                  {c.imageUrl && (
                    <img
                      src={
                        c.imageUrl.startsWith('data:') || /^https?:\/\//i.test(c.imageUrl)
                          ? c.imageUrl
                          : assetUrl(c.imageUrl.replace(/^\.\//, ''))
                      }
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover border border-white/80 shrink-0"
                    />
                  )}
                  <div className="min-w-0 text-start">
                    <p className="text-[11px] font-black truncate">{isAr ? c.titleAr : c.titleEn}</p>
                    <p className="text-[9.5px] font-bold text-slate-800">
                      {Math.round(c.score * 100)}% • {t('انقر للتثبيت', 'Tap to lock')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 8. BOTTOM CSS.GLASS MAIN CONTROL DOCK */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] inset-x-0 mx-auto w-fit max-w-[94vw] z-35">
        <div className="ml-glass px-3 sm:px-4 py-2 flex items-center gap-2.5 sm:gap-4">
          {/* Upload Real Photo */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl hover:bg-white/40 text-slate-950 transition active:scale-95 cursor-pointer"
            title={t('فحص صورة', 'Scan Photo')}
          >
            <ImagePlus className="w-5 h-5" strokeWidth={2.2} />
            <span className="text-[9.5px] font-extrabold mt-0.5">{t('صورة', 'Photo')}</span>
          </button>

          {/* Teach Real Object (360° Live Enroll) */}
          <button
            type="button"
            onClick={() => setDrawer(drawer === 'teach' ? 'none' : 'teach')}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition active:scale-95 cursor-pointer ${
              drawer === 'teach' ? 'bg-slate-950 text-white' : 'hover:bg-white/40 text-slate-950'
            }`}
            title={t('تدريب قطعة حقيقية', 'Teach Real Object')}
          >
            <PlusCircle className="w-5 h-5" strokeWidth={2.2} />
            <span className="text-[9.5px] font-extrabold mt-0.5">{t('تدريب', 'Teach')}</span>
          </button>

          {/* CENTER TACTILE DEEP SCAN SHUTTER */}
          <button
            type="button"
            disabled={deepScanning}
            onClick={() => handleDeepScan()}
            className="relative w-16 h-16 rounded-full bg-slate-950 hover:bg-slate-900 active:scale-90 text-white shadow-[0_6px_24px_rgba(0,0,0,0.4)] border-[3px] border-white flex flex-col items-center justify-center transition cursor-pointer disabled:opacity-60"
            title={t('فحص وتحليل فوري للقطعة', 'Instant Deep Scan')}
          >
            {deepScanning ? (
              <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Aperture className="w-7 h-7" strokeWidth={2} />
                <span className="text-[8px] font-black tracking-wider uppercase mt-0.5">
                  {t('مسح', 'SCAN')}
                </span>
              </>
            )}
          </button>

          {/* Museum Catalog / Quick Test */}
          <button
            type="button"
            onClick={() => setDrawer(drawer === 'catalog' ? 'none' : 'catalog')}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition active:scale-95 cursor-pointer ${
              drawer === 'catalog' ? 'bg-slate-950 text-white' : 'hover:bg-white/40 text-slate-950'
            }`}
            title={t('كتالوج المتحف', 'Catalogue')}
          >
            <Library className="w-5 h-5" strokeWidth={2.2} />
            <span className="text-[9.5px] font-extrabold mt-0.5">{t('المقتنيات', 'Items')}</span>
          </button>

          {/* Settings & Sensitivity */}
          <button
            type="button"
            onClick={() => setDrawer(drawer === 'settings' ? 'none' : 'settings')}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition active:scale-95 cursor-pointer ${
              drawer === 'settings' ? 'bg-slate-950 text-white' : 'hover:bg-white/40 text-slate-950'
            }`}
            title={t('الإعدادات', 'Settings')}
          >
            <SlidersHorizontal className="w-5 h-5" strokeWidth={2.2} />
            <span className="text-[9.5px] font-extrabold mt-0.5">{t('ضبط', 'Tune')}</span>
          </button>
        </div>
      </div>

      {/* 9. DRAWER OVERLAYS (Teach Real Object / Museum Catalogue / Settings) — ALL css.glass */}
      <AnimatePresence>
        {drawer !== 'none' && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ type: 'spring', stiffness: 330, damping: 30 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] inset-x-3 sm:inset-x-0 sm:mx-auto sm:w-[540px] max-h-[66vh] z-40 ml-glass-strong p-4 sm:p-5 text-slate-950 overflow-y-auto ml-no-scrollbar"
          >
            {/* TEACH REAL OBJECT DRAWER */}
            {drawer === 'teach' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm sm:text-base font-black">
                      {t('تدريب العدسة على قطعة متحفية حقيقية (360°)', 'Teach Real-Life Museum Object (360°)')}
                    </h3>
                    <p className="text-[11px] font-semibold text-slate-700">
                      {t(
                        'التقط زوايا متعددة للقطعة ليتم التعرّف عليها فوراً في الكاميرا بدون إنترنت',
                        'Capture multiple angles so Museum Lens recognizes this real object live offline'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawer('none')}
                    className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Live Capture Controls */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={sweeping360 || engineStatus !== 'ready'}
                    onClick={startGuided360Sweep}
                    className="flex-1 h-10 px-3 rounded-xl bg-slate-950 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Scan className="w-4 h-4" />
                    <span>
                      {sweeping360
                        ? t(`جاري المسح 360° (${sweepProgress}%)…`, `Sweeping 360° (${sweepProgress}%)…`)
                        : t('مسح تلقائي 5 ثوانٍ (360°)', 'Auto 5s 360° Sweep')}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={sweeping360 || engineStatus !== 'ready'}
                    onClick={captureTeachAngle}
                    className="h-10 px-3.5 rounded-xl bg-white/80 text-slate-950 border border-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{t('التقط زاوية', 'Snap Angle')} ({teachSamples.length})</span>
                  </button>
                </div>

                {/* Captured Angle Thumbnails */}
                {teachSamples.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto ml-no-scrollbar py-1">
                    {teachSamples.map((s, idx) => (
                      <div key={idx} className="relative shrink-0">
                        <img
                          src={s.thumb}
                          alt=""
                          className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow"
                        />
                        <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/75 text-white text-[9px] font-bold">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={teachTitleAr}
                    onChange={(e) => setTeachTitleAr(e.target.value)}
                    placeholder={t('اسم القطعة (بالعربية) *', 'Artifact Name (Arabic)')}
                    className="h-9 px-3 rounded-xl bg-white/75 border border-white text-xs font-semibold text-slate-950 placeholder:text-slate-500 outline-none"
                  />
                  <input
                    value={teachTitleEn}
                    onChange={(e) => setTeachTitleEn(e.target.value)}
                    placeholder={t('اسم القطعة (بالإنجليزية)', 'Artifact Name (English) *')}
                    className="h-9 px-3 rounded-xl bg-white/75 border border-white text-xs font-semibold text-slate-950 placeholder:text-slate-500 outline-none"
                  />
                  <input
                    value={teachPeriod}
                    onChange={(e) => setTeachPeriod(e.target.value)}
                    placeholder={t('الحقبة / العصر', 'Historical Period')}
                    className="h-9 px-3 rounded-xl bg-white/75 border border-white text-xs font-semibold text-slate-950 placeholder:text-slate-500 outline-none"
                  />
                  <input
                    value={teachMaterial}
                    onChange={(e) => setTeachMaterial(e.target.value)}
                    placeholder={t('المواد (نحاس، فولاذ، رق…)', 'Materials (Brass, Steel…)')}
                    className="h-9 px-3 rounded-xl bg-white/75 border border-white text-xs font-semibold text-slate-950 placeholder:text-slate-500 outline-none"
                  />
                </div>
                <textarea
                  value={teachDesc}
                  onChange={(e) => setTeachDesc(e.target.value)}
                  rows={2}
                  placeholder={t('وصف تاريخي مختصر للقطعة…', 'Brief historical description…')}
                  className="w-full p-2.5 rounded-xl bg-white/75 border border-white text-xs font-semibold text-slate-950 placeholder:text-slate-500 outline-none resize-none"
                />

                <button
                  type="button"
                  disabled={savingTeach || teachSamples.length === 0}
                  onClick={handleSaveTaughtObject}
                  className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {savingTeach
                      ? t('جاري الحفظ والتدريب…', 'Saving & Indexing…')
                      : t(`حفظ وتفعيل التعرّف الفوري (${teachSamples.length} زوايا)`, `Save & Activate Live Recognition (${teachSamples.length} views)`)}
                  </span>
                </button>

                {/* Existing Taught Objects List */}
                {taughtList.length > 0 && (
                  <div className="pt-2 border-t border-slate-900/15 space-y-1.5">
                    <p className="text-[11px] font-extrabold text-slate-800">
                      {t(`القطع المُدرَّبة على هذا الجهاز (${taughtList.length})`, `Enrolled on this device (${taughtList.length})`)}
                    </p>
                    {taughtList.map(({ meta, viewsCount }) => (
                      <div
                        key={meta.key}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/60 border border-white"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {meta.thumbDataUrl && (
                            <img src={meta.thumbDataUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-black truncate">{isAr ? meta.titleAr : meta.titleEn}</p>
                            <p className="text-[10px] font-bold text-slate-600">{viewsCount} views</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await engineRef.current?.deleteTaughtObject(meta.key);
                            await refreshTaughtList();
                          }}
                          className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-800 flex items-center justify-center cursor-pointer"
                          title={t('حذف', 'Delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CATALOGUE DRAWER */}
            {drawer === 'catalog' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-black">
                    {t(`مقتنيات متحف الكفيل (${allArtifacts.length})`, `Al-Kafeel Museum Collection (${allArtifacts.length})`)}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setDrawer('none')}
                    className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="relative">
                  <Search className={`w-4 h-4 absolute top-2.5 ${isAr ? 'right-3' : 'left-3'} text-slate-700`} />
                  <input
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder={t('ابحث بالاسم أو الرقم المتحفي (مثال: 2210، سيف، كشكول)…', 'Search by title or museum # (e.g. 2210, sword, kashkul)…')}
                    className={`w-full h-9 ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'} rounded-xl bg-white/75 border border-white text-xs font-semibold text-slate-950 placeholder:text-slate-600 outline-none`}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredCatalog.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => {
                        setDrawer('none');
                        lockResult(resultFromArtifact(art, 0.99, 'catalog', 0));
                      }}
                      className="p-2 rounded-xl bg-white/60 hover:bg-white/90 border border-white text-start transition cursor-pointer flex flex-col gap-1.5"
                    >
                      <img
                        src={
                          /^https?:\/\//i.test(art.image)
                            ? art.image
                            : assetUrl(art.image.replace(/^\.\//, ''))
                        }
                        alt=""
                        loading="lazy"
                        className="w-full h-20 rounded-lg object-cover bg-black/10"
                      />
                      <p className="text-[11px] font-black leading-tight line-clamp-2">
                        {isAr ? art.title.ar : art.title.en}
                      </p>
                      <span className="text-[9.5px] font-bold text-slate-600">{art.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SETTINGS & SENSITIVITY DRAWER */}
            {drawer === 'settings' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-black">
                    {t('ضبط محرك عدسة المتحف', 'Museum Lens Engine Settings')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setDrawer('none')}
                    className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Engine Diagnostics */}
                <div className="p-3 rounded-xl bg-white/60 border border-white text-[11px] font-bold flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t('المحرك البصري: ', 'Sight Engine: ')}
                    {engineStatus === 'ready' ? `DINOv2 (${engineBackend})` : engineStatus}
                  </span>
                  <span>
                    {t('القطع المفهرسة: ', 'Indexed Items: ')}
                    {engineRef.current?.entryCount ?? 0}
                  </span>
                  {engineError && <span className="text-rose-700 w-full">{engineError}</span>}
                </div>

                {/* Auto-Lock Sensitivity Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span>{t('حساسية التعرّف التلقائي (القاعات الواقعية)', 'Auto-Lock Sensitivity (Real Museum Halls)')}</span>
                    <span>{Math.round(sensitivity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.48}
                    max={0.78}
                    step={0.02}
                    value={sensitivity}
                    onChange={(e) => setSensitivity(Number(e.target.value))}
                    className="w-full accent-slate-950"
                  />
                  <div className="flex justify-between text-[10px] font-bold text-slate-700">
                    <span>{t('أسرع خلف الزجاج (48%)', 'Faster behind glass (48%)')}</span>
                    <span>{t('أكثر صرامة (78%)', 'Stricter (78%)')}</span>
                  </div>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAntiGlare((v) => !v)}
                    className={`p-3 rounded-xl border text-xs font-extrabold flex items-center justify-between cursor-pointer ${
                      antiGlare ? 'bg-slate-950 text-white border-slate-950' : 'bg-white/65 text-slate-950 border-white'
                    }`}
                  >
                    <span>{t('مقاومة وهج الزجاج', 'Vitrine Anti-Glare')}</span>
                    <span>{antiGlare ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAutoSpeak((v) => !v)}
                    className={`p-3 rounded-xl border text-xs font-extrabold flex items-center justify-between cursor-pointer ${
                      autoSpeak ? 'bg-slate-950 text-white border-slate-950' : 'bg-white/65 text-slate-950 border-white'
                    }`}
                  >
                    <span>{t('النطق التلقائي للدليل', 'Auto Audio Guide')}</span>
                    <span>{autoSpeak ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                {/* Optional Gemini Vision Key for identifying ANY unknown real-life museum object */}
                <div className="space-y-1.5 pt-1 border-t border-slate-900/15">
                  <label className="block text-xs font-extrabold">
                    {t('مفتاح Gemini Vision (اختياري للتعرّف على أي قطعة عالمية)', 'Gemini Vision Key (optional — identifies any museum object worldwide)')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      placeholder="AIza..."
                      dir="ltr"
                      className="flex-1 h-9 px-3 rounded-xl bg-white/75 border border-white text-xs font-mono text-slate-950 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        saveCustomGeminiKey(geminiKeyInput);
                        flashNotice(t('تم حفظ المفتاح بنجاح', 'Vision key saved'));
                      }}
                      className="h-9 px-4 rounded-xl bg-slate-950 text-white text-xs font-extrabold cursor-pointer"
                    >
                      {t('حفظ', 'Save')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MuseumLensApp;
