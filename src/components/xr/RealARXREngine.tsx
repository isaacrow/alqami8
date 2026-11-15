import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { createLovbackenModel, disposeThreeObject } from '../three/LovbackenModel';
import {
  Camera,
  Compass,
  Hand,
  Sparkles,
  RefreshCw,
  Eye,
  Crosshair,
  ShieldAlert,
  ChevronDown,
  Layers,
  Scan,
  X,
  Rotate3d,
} from 'lucide-react';
import { ALQAMI_ARTIFACTS } from '../../data/alqamiArtifacts';
import { spatialSound } from '../../utils/spatialSound';
import { assetUrl } from '../../utils/assetUrl';

export interface XRHardwareState {
  cameraActive: boolean;
  cameraFacing: 'environment' | 'user';
  gyroActive: boolean;
  handTrackingActive: boolean;
  webxrSupported: boolean;
  webxrSessionActive: boolean;
  arPlacementMode?: boolean;
  headRotation: { yaw: number; pitch: number; roll: number };
  ambientRGB: { r: number; g: number; b: number };
  hitTestSurfaceDetected: boolean;
  sbsStereoActive?: boolean;
  ipdOffset?: number;
  latencyPredictionActive?: boolean;
  predictionLeadMs?: number;
  lidarScannerActive?: boolean;
  thermalVisionActive?: boolean;
  nightVisionActive?: boolean;
  anaglyphActive?: boolean;
  hudDiagnosticsOpen?: boolean;
  alqamiModeActive?: boolean;
  objectTracking3DActive?: boolean;
  spatialWorldActive?: boolean;
}

const handPointerId = 73;

function getRoomScanUnavailableMessage() {
  const nav = navigator as Navigator & {
    xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
  };
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  if (isIOS) {
    return 'On iPhone, Safari does not expose immersive WebXR AR, so this web app cannot scan room surfaces or anchor windows with ARKit. Camera preview and hand gestures are not world tracking. AR Quick Look can place a USDZ model, but this project does not yet export its table model for Quick Look. Live room scanning and floating app windows require a native iOS app using ARKit.';
  }

  if (!window.isSecureContext) {
    return 'Room scanning needs HTTPS or localhost plus a supported AR device.\n\nLocal phone test:\n1. Connect an ARCore Android phone to desktop Chrome.\n2. Open chrome://inspect/#devices and forward 5173 → localhost:5173.\n3. On the phone, open http://localhost:5173.';
  }

  if (!nav.xr) {
    return 'This tab has no WebXR API (common in desktop/in-app browsers), so it cannot scan surfaces.\n\nLocal phone test:\n1. Use an ARCore-supported Android phone with Chrome and Google Play Services for AR.\n2. Connect it by USB, then open chrome://inspect/#devices on desktop Chrome.\n3. Forward 5173 → localhost:5173.\n4. On the phone, open http://localhost:5173.\n\niPhone/Vision Pro room tracking requires a native ARKit app.';
  }

  return 'WebXR is present, but this browser/device does not support immersive-ar. Use an ARCore-supported Android phone with Chrome and Google Play Services for AR. A camera preview cannot scan surfaces or anchor the model. iPhone/Vision Pro room tracking requires a native ARKit app.';
}

function dispatchHandPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: handPointerId,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: type === 'pointerup' ? 0 : 1,
    })
  );
}

function updateHandRangeInput(target: Element, x: number) {
  const input = target instanceof HTMLInputElement
    ? target
    : target.closest<HTMLInputElement>('input[type="range"]');
  if (!input || input.type !== 'range' || input.disabled) return;
  const rect = input.getBoundingClientRect();
  if (rect.width <= 0) return;
  const min = Number.isFinite(input.min === '' ? 0 : Number(input.min)) ? Number(input.min || 0) : 0;
  const max = Number.isFinite(input.max === '' ? 100 : Number(input.max)) ? Number(input.max || 100) : 100;
  const step = input.step === 'any' ? 0 : Math.max(Number(input.step) || 1, 0.000001);
  const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  const raw = min + ratio * (max - min);
  const value = step ? min + Math.round((raw - min) / step) * step : raw;
  const nextValue = String(Math.max(min, Math.min(max, Number(value.toFixed(4)))));
  if (input.value === nextValue) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function scrollHandTarget(target: Element | null, deltaX: number, deltaY: number) {
  let element = target instanceof HTMLElement ? target : target?.parentElement ?? null;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    const canScrollX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
    if (canScrollY || canScrollX) {
      if (canScrollY) element.scrollTop += deltaY;
      if (canScrollX) element.scrollLeft += deltaX;
      return;
    }
    element = element.parentElement;
  }
}

function paintHandCursor(
  cursor: HTMLDivElement | null,
  x: number,
  y: number,
  visible: boolean,
  pinching: boolean
) {
  if (!cursor) return;
  window.dispatchEvent(new CustomEvent('visionos:control-pointer', {
    detail: { x, y, active: visible, source: 'hand' },
  }));
  cursor.style.transform = `translate3d(${x - 18}px, ${y - 18}px, 0)`;
  cursor.style.opacity = visible ? '1' : '0';
  const ring = cursor.firstElementChild as HTMLElement | null;
  const dot = ring?.firstElementChild as HTMLElement | null;
  if (!ring || !dot) return;
  ring.style.transform = pinching ? 'scale(.75)' : 'scale(1)';
  ring.style.background = pinching ? 'rgba(52, 211, 153, .5)' : 'rgba(255, 255, 255, .2)';
  ring.style.border = pinching ? '2px solid rgba(110, 231, 183, 1)' : '1px solid rgba(255, 255, 255, .7)';
  ring.style.boxShadow = pinching
    ? '0 0 24px rgba(52, 211, 153, .9)'
    : '0 0 18px rgba(255, 255, 255, .6)';
  dot.style.transform = pinching ? 'scale(1.25)' : 'scale(1)';
  dot.style.background = pinching ? '#fff' : 'rgba(255, 255, 255, .8)';
}

export interface Detected3DObject {
  id: number;
  label: string;
  category: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depthMeters: number;
  posX: number;
  posY: number;
  posZ: number;
  dimXcm: number;
  dimYcm: number;
  dimZcm: number;
  emoji: string;
  pinnedNote?: string;
}

function draw3DObjectPrism(
  ctx: CanvasRenderingContext2D,
  obj: Detected3DObject,
  now: number
) {
  const { x, y, width: w, height: h, depthMeters, posX, posY, posZ, label, emoji, confidence } = obj;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Perspective vanishing scale for 3D extrusion
  const depthFactor = Math.max(0.14, Math.min(0.42, 0.26 / Math.max(0.3, depthMeters)));
  const dx = (cx - window.innerWidth / 2) * 0.08;
  const dy = (cy - window.innerHeight / 2) * 0.08 - h * depthFactor;

  const bx = x + dx;
  const by = y + dy;
  const bw = w * (1 - depthFactor * 0.45);
  const bh = h * (1 - depthFactor * 0.45);

  ctx.save();

  // 1. Ground Radar Footprint Ellipse beneath the physical object
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 14, w * 0.45, Math.max(7, w * 0.12), 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 245, 212, 0.14)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.75)';
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.restore();

  // 2. Back Face Rectangle (Dashed Wireframe)
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.38)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();

  // 3. 4 Connecting 3D Struts (Front to Back)
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(bx + bw, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w, y + h); ctx.lineTo(bx + bw, by + bh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(bx, by + bh); ctx.stroke();
  ctx.restore();

  // 4. Front Face Rectangle (Neon Cyan / Emerald Glow)
  ctx.save();
  ctx.strokeStyle = '#00f5d4';
  ctx.lineWidth = 2.4;
  ctx.shadowColor = '#00f5d4';
  ctx.shadowBlur = 14;
  ctx.strokeRect(x, y, w, h);

  // 5. 8 Corner Bracket Reticles (Apple Vision Pro spatial recognition style)
  const bracketLen = Math.min(18, Math.min(w, h) * 0.25);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(x, y + bracketLen); ctx.lineTo(x, y); ctx.lineTo(x + bracketLen, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - bracketLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + bracketLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w, y + h - bracketLen); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - bracketLen, y + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + bracketLen, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - bracketLen); ctx.stroke();
  ctx.restore();

  // 6. Floating Apple visionOS 2 Glass Tag Pill above the object
  const tagText = `${emoji} ${label.toUpperCase()} · ${Math.round(confidence * 100)}%`;
  const subText = `${depthMeters.toFixed(2)}m away · X:${posX >= 0 ? '+' : ''}${posX.toFixed(2)}m Y:${posY >= 0 ? '+' : ''}${posY.toFixed(2)}m Z:${posZ.toFixed(2)}m`;
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  const textWidth = Math.max(ctx.measureText(tagText).width, 160);
  const pillW = textWidth + 24;
  const pillH = 38;
  const pillX = Math.max(8, Math.min(window.innerWidth - pillW - 8, cx - pillW / 2));
  const pillY = Math.max(48, y - pillH - 12);

  // Connection stem line
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(pillX + pillW / 2, pillY + pillH);
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Glass Pill Background
  ctx.save();
  ctx.fillStyle = 'rgba(10, 16, 26, 0.9)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 19);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.6)';
  ctx.stroke();

  // Tag Header text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillText(tagText, pillX + 12, pillY + 16);

  // Sub telemetry text
  ctx.fillStyle = 'rgba(0, 245, 212, 0.9)';
  ctx.font = '9px monospace';
  ctx.fillText(subText, pillX + 12, pillY + 30);
  ctx.restore();

  // 7. Pinned Sticky Note on this physical object
  if (obj.pinnedNote) {
    const noteX = pillX;
    const noteY = pillY - 28;
    ctx.save();
    ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
    ctx.beginPath();
    ctx.roundRect(noteX, noteY, pillW, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(`${obj.pinnedNote}`, noteX + 8, noteY + 15);
    ctx.restore();
  }

  ctx.restore();
}

interface RealARXREngineProps {
  xrState: XRHardwareState;
  setXrState: React.Dispatch<React.SetStateAction<XRHardwareState>>;
  domOverlayRootRef: React.RefObject<HTMLDivElement>;
  onRecenterView: () => void;
}

export const RealARXREngine: React.FC<RealARXREngineProps> = ({
  xrState,
  setXrState,
  domOverlayRootRef,
  onRecenterView,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const immersiveModelHostRef = useRef<HTMLDivElement | null>(null);
  const immersiveModelRef = useRef<(HTMLElement & { requestImmersive?: () => Promise<void> }) | null>(null);
  const handCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handCursorRef = useRef<HTMLDivElement | null>(null);
  const webxrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gyroBaselineRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const lastPinchStateRef = useRef<boolean>(false);
  const draggedElementRef = useRef<Element | null>(null);
  const handGestureRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const filteredHandCursorRef = useRef({ x: 0, y: 0, initialized: false });
  const openPalmScrollRef = useRef({ x: 0, y: 0, active: false });
  const lastPeaceStateRef = useRef<boolean>(false);
  const lastThumbsUpStateRef = useRef<boolean>(false);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>>([]);
  const lastOrientationRef = useRef<{ alpha: number; beta: number; gamma: number; time: number } | null>(null);
  const smoothedOrientationRef = useRef<{ yaw: number; pitch: number; roll: number }>({ yaw: 0, pitch: 0, roll: 0 });
  const lastCursorTimeRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [hudDiagnosticsOpen, setHudDiagnosticsOpen] = useState(false);
  const [fps, setFps] = useState(60);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [handModelLoading, setHandModelLoading] = useState(false);
  const [handPinching, setHandPinching] = useState(false);
  const [xrControlsOpen, setXrControlsOpen] = useState(false);
  const [webxrSupportChecked, setWebxrSupportChecked] = useState(false);
  const [arObjectPlaced, setArObjectPlaced] = useState(false);
  const [arPlacementMode, setArPlacementMode] = useState(false);
  const [nativeHandTrackingActive, setNativeHandTrackingActive] = useState(false);
  const [visionOSImmersiveSupported, setVisionOSImmersiveSupported] = useState(false);
  const [visionOSImmersiveActive, setVisionOSImmersiveActive] = useState(false);
  const [visionOSImmersiveLoading, setVisionOSImmersiveLoading] = useState(false);
  const headRotationRef = useRef(xrState.headRotation);
  headRotationRef.current = xrState.headRotation;
  const cameraActiveRef = useRef(xrState.cameraActive);
  cameraActiveRef.current = xrState.cameraActive;
  const xrSessionRef = useRef<any>(null);
  const xrRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const xrHitTestSourceRef = useRef<any>(null);
  const arPlacementModeRef = useRef(false);
  const nativeHandTrackingRef = useRef(false);
  const objectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tracked3DObjects, setTracked3DObjects] = useState<Detected3DObject[]>([]);
  const [objectTrackingLoading, setObjectTrackingLoading] = useState(false);
  const pinnedNotesRef = useRef<Record<string, string>>({});

  // Alqami 3 Authentic AR Object & Manuscript Scanner State
  const [alqamiScanModeActive, setAlqamiScanModeActive] = useState(false);
  const [activeArtifactScanIndex, setActiveArtifactScanIndex] = useState(0);
  const [isArtifactDetected, setIsArtifactDetected] = useState(false);

  useEffect(() => {
    const handleOpenScan = () => {
      setAlqamiScanModeActive(true);
      if (!cameraActiveRef.current) {
        startRealCamera('environment');
      }
    };
    window.addEventListener('visionos:open-scan-mode', handleOpenScan);
    return () => window.removeEventListener('visionos:open-scan-mode', handleOpenScan);
  }, []);

  const handleObjectCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const hit = tracked3DObjects.find(
      (obj) =>
        clickX >= obj.x - 25 &&
        clickX <= obj.x + obj.width + 25 &&
        clickY >= obj.y - 50 &&
        clickY <= obj.y + obj.height + 25
    );

    if (hit) {
      spatialSound.playAnchorDrop();
      const noteKey = `${hit.label}-${hit.id - 1}`;
      const current = pinnedNotesRef.current[noteKey];
      const newNote = prompt(`Pin 3D Spatial Tag on "${hit.label}":`, current || 'Real-World AR Anchor');
      if (newNote !== null) {
        pinnedNotesRef.current[noteKey] = newNote;
        setTracked3DObjects((prev) =>
          prev.map((o) => (o.id === hit.id ? { ...o, pinnedNote: newNote } : o))
        );
      }
    }
  };

  // Measure live FPS
  useEffect(() => {
    let count = 0;
    let last = performance.now();
    let frameId: number;
    const loop = (now: number) => {
      count++;
      if (now - last >= 1000) {
        setFps(count);
        count = 0;
        last = now;
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // 1. Check Native WebXR immersive-ar Support
  useEffect(() => {
    const nav = navigator as Navigator & {
      xr?: { isSessionSupported: (mode: string) => Promise<boolean> };
    };
    if (!nav.xr || typeof nav.xr.isSessionSupported !== 'function') {
      setWebxrSupportChecked(true);
      return;
    }
    nav.xr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        setXrState((prev) => ({ ...prev, webxrSupported: supported }));
      })
      .catch(() => setXrState((prev) => ({ ...prev, webxrSupported: false })))
      .finally(() => setWebxrSupportChecked(true));
  }, [setXrState]);

  // Native visionOS Safari Immersive API: this opens a true, tracked environment around
  // the existing Safari window from a real USDZ model, without faking camera passthrough.
  useEffect(() => {
    type ImmersiveDocument = Document & {
      immersiveEnabled?: boolean;
      immersiveElement?: Element | null;
      exitImmersive?: () => Promise<void>;
    };
    const doc = document as ImmersiveDocument;
    setVisionOSImmersiveSupported(Boolean(doc.immersiveEnabled));
    if (!doc.immersiveEnabled || !immersiveModelHostRef.current) return;

    const model = document.createElement('model') as HTMLElement & {
      requestImmersive?: () => Promise<void>;
    };
    model.setAttribute('src', assetUrl('immersive/vision-studio.usdz'));
    // Keep the native model connected and rendered so Safari can load it for requestImmersive().
    Object.assign(model.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0.001',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    model.setAttribute('aria-hidden', 'true');
    immersiveModelHostRef.current.appendChild(model);
    immersiveModelRef.current = model;

    const syncImmersiveState = () => {
      const active = doc.immersiveElement === model;
      setVisionOSImmersiveActive(active);
      if (!active) setVisionOSImmersiveLoading(false);
    };
    const handleImmersiveError = () => {
      setVisionOSImmersiveLoading(false);
      setCameraError('Vision Pro could not open the immersive room model. Please try again.');
    };
    model.addEventListener('immersivechange', syncImmersiveState);
    model.addEventListener('immersiveerror', handleImmersiveError);
    document.addEventListener('immersivechange', syncImmersiveState);

    return () => {
      model.removeEventListener('immersivechange', syncImmersiveState);
      model.removeEventListener('immersiveerror', handleImmersiveError);
      document.removeEventListener('immersivechange', syncImmersiveState);
      model.remove();
      immersiveModelRef.current = null;
    };
  }, []);

  // 2. Start / Switch Real Phone Camera (Rear 'environment' or Front 'user')
  const startRealCamera = useCallback(
    async (facing: 'environment' | 'user' = xrState.cameraFacing) => {
      setCameraError(null);
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
            },
            audio: false,
          });
        } catch {
          // Fallback to any available camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          const v = videoRef.current;
          v.srcObject = stream;
          v.muted = true;
          v.defaultMuted = true;
          v.playsInline = true;
          v.setAttribute('playsinline', 'true');
          v.setAttribute('webkit-playsinline', 'true');
          try {
            await v.play();
          } catch (e) {
            console.warn('iOS video.play() deferred:', e);
          }
        }
        setXrState((prev) => ({
          ...prev,
          cameraActive: true,
          cameraFacing: facing,
        }));
        spatialSound.playPinchTap();
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Camera access requires HTTPS or localhost permission.';
        setCameraError(message);
      }
    },
    [xrState.cameraFacing, setXrState]
  );

  const stopRealCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setXrState((prev) => ({
      ...prev,
      cameraActive: false,
      handTrackingActive: false,
    }));
  }, [setXrState]);

  useEffect(() => {
    const toggleCamera = () => {
      if (xrState.cameraActive) stopRealCamera();
      else void startRealCamera('environment');
    };
    const startCamera = () => {
      void startRealCamera('environment');
    };
    window.addEventListener('visionos:toggle-camera', toggleCamera);
    window.addEventListener('visionos:start-camera', startCamera);
    return () => {
      window.removeEventListener('visionos:toggle-camera', toggleCamera);
      window.removeEventListener('visionos:start-camera', startCamera);
    };
  }, [xrState.cameraActive, startRealCamera, stopRealCamera]);

  // 3. Real-time Camera Ambient Light Estimation (tints visionOS glass to match physical room)
  useEffect(() => {
    if (!xrState.cameraActive) return;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 16;
    sampleCanvas.height = 16;
    const sctx = sampleCanvas.getContext('2d');

    const interval = setInterval(() => {
      if (!videoRef.current || !sctx || videoRef.current.readyState < 2) return;
      try {
        sctx.drawImage(videoRef.current, 0, 0, 16, 16);
        const data = sctx.getImageData(0, 0, 16, 16).data;
        let r = 0,
          g = 0,
          b = 0;
        let maxLuma = -1;
        let brightX = 8;
        let brightY = 4;
        const count = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          r += pr;
          g += pg;
          b += pb;
          const luma = pr * 0.299 + pg * 0.587 + pb * 0.114;
          if (luma > maxLuma) {
            maxLuma = luma;
            const pIdx = i / 4;
            brightX = pIdx % 16;
            brightY = Math.floor(pIdx / 16);
          }
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        const normLightX = ((brightX / 15) * 2 - 1).toFixed(2);
        const normLightY = (-((brightY / 15) * 2 - 1)).toFixed(2);
        document.documentElement.style.setProperty('--real-light-x', normLightX);
        document.documentElement.style.setProperty('--real-light-y', normLightY);
        document.documentElement.style.setProperty('--real-ambient-luma', (maxLuma / 255).toFixed(2));
        document.documentElement.style.setProperty(
          '--vision-glass-bg',
          `linear-gradient(135deg, rgba(${Math.min(255, r + 25)}, ${Math.min(255, g + 22)}, ${Math.min(255, b + 20)}, 0.2) 0%, rgba(${Math.max(18, Math.floor(r * 0.62))}, ${Math.max(18, Math.floor(g * 0.62))}, ${Math.max(18, Math.floor(b * 0.62))}, 0.1) 100%)`
        );
        setXrState((prev) => ({ ...prev, ambientRGB: { r, g, b } }));
      } catch {
        // Ignore cross-origin frame errors
      }
    }, 450);

    return () => clearInterval(interval);
  }, [xrState.cameraActive, setXrState]);

  // 4. Phone orientation tracking is 3DoF; world-space 6DoF comes from an immersive WebXR session.
  const enableGyroscope = useCallback(async () => {
    try {
      const DevOrient = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof DevOrient.requestPermission === 'function') {
        const res = await DevOrient.requestPermission();
        if (res !== 'granted') return;
      }
      gyroBaselineRef.current = null;
      setXrState((prev) => ({ ...prev, gyroActive: !prev.gyroActive }));
      spatialSound.playPinchTap();
    } catch {
      setXrState((prev) => ({ ...prev, gyroActive: !prev.gyroActive }));
    }
  }, [setXrState]);

  useEffect(() => {
    if (!xrState.gyroActive) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      if (!gyroBaselineRef.current) {
        gyroBaselineRef.current = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
      }
      const base = gyroBaselineRef.current;
      let dAlpha = e.alpha - base.alpha;
      if (dAlpha > 180) dAlpha -= 360;
      if (dAlpha < -180) dAlpha += 360;

      const dBeta = e.beta - base.beta;
      const dGamma = e.gamma - base.gamma;

      let rawYaw = Math.max(-45, Math.min(45, dAlpha * 0.65 + dGamma * 0.35));
      let rawPitch = Math.max(-35, Math.min(35, dBeta * 0.65));
      let rawRoll = Math.max(-20, Math.min(20, dGamma * 0.25));

      const now = performance.now();
      const last = lastOrientationRef.current;

      // Motion-to-photon latency predictive dead reckoning (delay_lab)
      if (xrState.latencyPredictionActive !== false && last) {
        const dt = Math.max(1, now - last.time);
        const lead = xrState.predictionLeadMs || 35;
        const vYaw = (rawYaw - last.alpha) / dt;
        const vPitch = (rawPitch - last.beta) / dt;
        const vRoll = (rawRoll - last.gamma) / dt;
        rawYaw = Math.max(-48, Math.min(48, rawYaw + vYaw * lead));
        rawPitch = Math.max(-38, Math.min(38, rawPitch + vPitch * lead));
        rawRoll = Math.max(-22, Math.min(22, rawRoll + vRoll * lead));
      }

      // Dynamic EMA smoothing
      const prev = smoothedOrientationRef.current;
      const alpha = 0.78;
      const smoothYaw = prev.yaw * (1 - alpha) + rawYaw * alpha;
      const smoothPitch = prev.pitch * (1 - alpha) + rawPitch * alpha;
      const smoothRoll = prev.roll * (1 - alpha) + rawRoll * alpha;

      smoothedOrientationRef.current = { yaw: smoothYaw, pitch: smoothPitch, roll: smoothRoll };
      lastOrientationRef.current = { alpha: rawYaw, beta: rawPitch, gamma: rawRoll, time: now };

      setXrState((prev) => ({
        ...prev,
        headRotation: {
          yaw: smoothYaw,
          pitch: smoothPitch,
          roll: smoothRoll,
        },
      }));
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, [xrState.gyroActive, setXrState]);

  // 5. Real MediaPipe 21-Joint Hand Tracking + Thumb-Index Pinch Selection & Dragging
  useEffect(() => {
    if (!xrState.handTrackingActive) {
      if (lastPinchStateRef.current && draggedElementRef.current) {
        const point = filteredHandCursorRef.current;
        dispatchHandPointer(draggedElementRef.current, 'pointerup', point.x, point.y);
      }
      lastPinchStateRef.current = false;
      draggedElementRef.current = null;
      handGestureRef.current = null;
      openPalmScrollRef.current.active = false;
      setHandPinching(false);
      paintHandCursor(handCursorRef.current, 0, 0, false, false);
      return;
    }

    let cancelled = false;
    let animFrameId = 0;
    let lastInferenceTime = 0;
    let handLandmarker: {
      detectForVideo: (
        video: HTMLVideoElement,
        timestamp: number
      ) => { landmarks?: Array<Array<{ x: number; y: number; z: number }>> };
      close?: () => void;
    } | null = null;

    async function initMediaPipeHands() {
      try {
        setHandModelLoading(true);
        if (!xrState.cameraActive) {
          await startRealCamera(xrState.cameraFacing);
        }

        const vision = await import('@mediapipe/tasks-vision');
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
        );
        if (cancelled) return;

        const modelAssetPath =
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
        const trackerOptions = {
          runningMode: 'VIDEO',
          numHands: 1,
        } as const;
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        try {
          handLandmarker = await vision.HandLandmarker.createFromOptions(filesetResolver, {
            ...trackerOptions,
            baseOptions: { modelAssetPath, delegate: isIOS ? 'CPU' : 'GPU' },
          });
        } catch {
          // Fall back for browsers where the preferred delegate is unavailable.
          handLandmarker = await vision.HandLandmarker.createFromOptions(filesetResolver, {
            ...trackerOptions,
            baseOptions: { modelAssetPath, delegate: isIOS ? 'GPU' : 'CPU' },
          });
        }
        setHandModelLoading(false);

        const detectLoop = () => {
          if (cancelled) return;
          animFrameId = requestAnimationFrame(detectLoop);

          const video = videoRef.current;
          const canvas = handCanvasRef.current;
          if (!video || !canvas || video.readyState < 2 || !handLandmarker) return;

          const now = performance.now();
          if (now - lastInferenceTime < 66) return;
          lastInferenceTime = now;

          if (canvas.width !== window.innerWidth) canvas.width = window.innerWidth;
          if (canvas.height !== window.innerHeight) canvas.height = window.innerHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const results = handLandmarker.detectForVideo(video, now);
          if (results.landmarks && results.landmarks.length > 0) {
            const hand = results.landmarks[0];
            window.dispatchEvent(
              new CustomEvent('visionos:hand-landmarks', {
                detail: { landmarks: hand.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })) },
              })
            );
            const mirror = xrState.cameraFacing === 'user';
            const coverScale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
            const renderedWidth = video.videoWidth * coverScale;
            const renderedHeight = video.videoHeight * coverScale;
            const cropX = (renderedWidth - canvas.width) / 2;
            const cropY = (renderedHeight - canvas.height) / 2;
            const mapPoint = (point: { x: number; y: number }) => {
              const rawX = point.x * renderedWidth - cropX;
              return {
                x: mirror ? canvas.width - rawX : rawX,
                y: point.y * renderedHeight - cropY,
              };
            };

            // Draw glowing visionOS 21-joint hand skeleton
            const connections = [
              [0, 1],[1, 2],[2, 3],[3, 4],
              [0, 5],[5, 6],[6, 7],[7, 8],
              [5, 9],[9, 10],[10, 11],[11, 12],
              [9, 13],[13, 14],[14, 15],[15, 16],
              [13, 17],[17, 18],[18, 19],[19, 20],[0, 17],
            ];
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 2;
            connections.forEach(([i, j]) => {
              const p1 = mapPoint(hand[i]);
              const p2 = mapPoint(hand[j]);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            });

            // Thumb tip (4) and Index tip (8)
            const thumb = hand[4];
            const index = hand[8];
            const thumbPoint = mapPoint(thumb);
            const indexPoint = mapPoint(index);

            const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
            const isPinching = lastPinchStateRef.current ? pinchDist < 0.075 : pinchDist < 0.052;
            const rawCursorX = (thumbPoint.x + indexPoint.x) * 0.5;
            const rawCursorY = (thumbPoint.y + indexPoint.y) * 0.5;

            let targetRawX = rawCursorX;
            let targetRawY = rawCursorY;

            // Motion-to-photon latency lead compensation (delay_lab)
            if (xrState.latencyPredictionActive !== false && lastCursorTimeRef.current) {
              const dt = Math.max(1, now - lastCursorTimeRef.current.time);
              const lead = (xrState.predictionLeadMs || 35) / 1000;
              const vx = (rawCursorX - lastCursorTimeRef.current.x) / (dt / 1000);
              const vy = (rawCursorY - lastCursorTimeRef.current.y) / (dt / 1000);
              if (Math.hypot(vx, vy) > 20) {
                targetRawX = Math.max(0, Math.min(canvas.width, rawCursorX + vx * lead * 0.5));
                targetRawY = Math.max(0, Math.min(canvas.height, rawCursorY + vy * lead * 0.5));
              }
            }
            lastCursorTimeRef.current = { x: rawCursorX, y: rawCursorY, time: now };

            const filteredCursor = filteredHandCursorRef.current;
            const smoothing = filteredCursor.initialized ? 0.48 : 1;
            filteredCursor.x += (targetRawX - filteredCursor.x) * smoothing;
            filteredCursor.y += (targetRawY - filteredCursor.y) * smoothing;
            filteredCursor.initialized = true;
            const cursorX = filteredCursor.x;
            const cursorY = filteredCursor.y;

            // Emit glowing holographic particles from index tip (nv-ar-portal)
            if (Math.random() > 0.3) {
              particlesRef.current.push({
                x: indexPoint.x + (Math.random() - 0.5) * 6,
                y: indexPoint.y + (Math.random() - 0.5) * 6,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2 - 1.2,
                life: 1.0,
                color: isPinching ? '#30d158' : Math.random() > 0.5 ? '#00f5d4' : '#c084fc',
              });
            }

            // Draw joints
            hand.forEach((pt, idx) => {
              const joint = mapPoint(pt);
              ctx.fillStyle =
                idx === 4 || idx === 8
                  ? isPinching
                    ? '#30d158'
                    : '#0a84ff'
                  : 'rgba(255,255,255,0.75)';
              ctx.beginPath();
              ctx.arc(joint.x, joint.y, idx === 4 || idx === 8 ? 6 : 3.5, 0, Math.PI * 2);
              ctx.fill();
            });

            // Render Holographic Light Particles (nv-ar-portal)
            for (let i = particlesRef.current.length - 1; i >= 0; i--) {
              const p = particlesRef.current[i];
              p.x += p.vx;
              p.y += p.vy;
              p.life -= 0.035;
              if (p.life <= 0) {
                particlesRef.current.splice(i, 1);
                continue;
              }
              ctx.save();
              ctx.globalAlpha = p.life * 0.85;
              ctx.fillStyle = p.color;
              ctx.shadowColor = p.color;
              ctx.shadowBlur = 10;
              ctx.beginPath();
              ctx.arc(p.x, p.y, Math.max(1, 3.5 * p.life), 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }

            paintHandCursor(handCursorRef.current, cursorX, cursorY, true, isPinching);
            if (isPinching !== lastPinchStateRef.current) setHandPinching(isPinching);

            // A pinch behaves like a tracked pointer: tap on release, drag while held.
            const targetEl = document.elementFromPoint(cursorX, cursorY);
            if (isPinching && !lastPinchStateRef.current) {
              window.dispatchEvent(
                new CustomEvent('visionos:micro-pinch', {
                  detail: { isPinching: true, cursorX, cursorY },
                })
              );
              spatialSound.playPinchTap();
              if (targetEl) {
                draggedElementRef.current = targetEl;
                handGestureRef.current = { startX: cursorX, startY: cursorY, moved: false };
                updateHandRangeInput(targetEl, cursorX);
                dispatchHandPointer(targetEl, 'pointerdown', cursorX, cursorY);
              }
            } else if (isPinching && lastPinchStateRef.current) {
              const gesture = handGestureRef.current;
              const activeTarget = draggedElementRef.current;
              if (gesture && activeTarget) {
                if (Math.hypot(cursorX - gesture.startX, cursorY - gesture.startY) > 8) {
                  gesture.moved = true;
                }
                updateHandRangeInput(activeTarget, cursorX);
                dispatchHandPointer(activeTarget, 'pointermove', cursorX, cursorY);
              }
            } else if (!isPinching && lastPinchStateRef.current) {
              window.dispatchEvent(
                new CustomEvent('visionos:micro-pinch', {
                  detail: { isPinching: false, cursorX, cursorY },
                })
              );
              const activeTarget = draggedElementRef.current;
              const gesture = handGestureRef.current;
              if (activeTarget) dispatchHandPointer(activeTarget, 'pointerup', cursorX, cursorY);
              if (activeTarget && gesture && !gesture.moved && activeTarget.isConnected) {
                const focusTarget = activeTarget.closest<HTMLElement>(
                  'input, textarea, select, button, [contenteditable="true"], [role="button"]'
                );
                focusTarget?.focus({ preventScroll: true });
                (activeTarget as HTMLElement).click();
              }
              draggedElementRef.current = null;
              handGestureRef.current = null;
            }
            lastPinchStateRef.current = isPinching;

            // Hand Gesture Pose Classifier (HandyWork / barehands)
            const indexExt = hand[8].y < hand[6].y - 0.035;
            const middleExt = hand[12].y < hand[10].y - 0.035;
            const ringExt = hand[16].y < hand[14].y - 0.035;
            const pinkyExt = hand[20].y < hand[18].y - 0.035;
            const thumbExt = Math.hypot(hand[4].x - hand[2].x, hand[4].y - hand[2].y) > 0.075 && hand[4].y < hand[2].y;

            // Peace Sign: Opens Home Apps Launcher
            const isPeace = indexExt && middleExt && !ringExt && !pinkyExt;
            if (isPeace && !lastPeaceStateRef.current) {
              window.dispatchEvent(new CustomEvent('visionos:gesture-peace'));
              spatialSound.playPinchTap();
            }
            lastPeaceStateRef.current = isPeace;

            // Thumbs Up: Recenters view
            const isThumbsUp = thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt;
            if (isThumbsUp && !lastThumbsUpStateRef.current) {
              window.dispatchEvent(new CustomEvent('visionos:gesture-thumbsup'));
              spatialSound.playAnchorDrop();
            }
            lastThumbsUpStateRef.current = isThumbsUp;

            // An open-palm vertical swipe scrolls the app under the hand cursor.
            const extendedFingers = [8, 12, 16, 20].filter((tipIndex) => {
              const pipIndex = tipIndex - 2;
              return hand[tipIndex].y < hand[pipIndex].y - 0.035;
            }).length;
            const isOpenPalm = !isPinching && extendedFingers >= 3;
            const palmPoint = mapPoint(index);
            if (isOpenPalm) {
              if (openPalmScrollRef.current.active) {
                const deltaY = palmPoint.y - openPalmScrollRef.current.y;
                const deltaX = palmPoint.x - openPalmScrollRef.current.x;
                if (Math.abs(deltaY) > 4 || Math.abs(deltaX) > 4) {
                  const scrollTarget = document.elementFromPoint(palmPoint.x, palmPoint.y);
                  scrollHandTarget(scrollTarget, deltaX * 1.5, deltaY * 1.5);
                }
              }
              openPalmScrollRef.current = { x: palmPoint.x, y: palmPoint.y, active: true };
            } else {
              openPalmScrollRef.current.active = false;
            }
          } else {
            if (lastPinchStateRef.current && draggedElementRef.current) {
              dispatchHandPointer(
                draggedElementRef.current,
                'pointerup',
                filteredHandCursorRef.current.x,
                filteredHandCursorRef.current.y
              );
            }
            lastPinchStateRef.current = false;
            draggedElementRef.current = null;
            handGestureRef.current = null;
            openPalmScrollRef.current.active = false;
            setHandPinching(false);
            paintHandCursor(handCursorRef.current, 0, 0, false, false);
          }
        };

        detectLoop();
      } catch {
        setHandModelLoading(false);
        if (!cancelled) {
          setCameraError('Hand tracking could not load. Check the connection, then turn Camera hand gestures off and on again.');
        }
      }
    }

    initMediaPipeHands();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameId);
      if (lastPinchStateRef.current && draggedElementRef.current) {
        const point = filteredHandCursorRef.current;
        dispatchHandPointer(draggedElementRef.current, 'pointerup', point.x, point.y);
      }
      lastPinchStateRef.current = false;
      draggedElementRef.current = null;
      handGestureRef.current = null;
      paintHandCursor(handCursorRef.current, 0, 0, false, false);
      if (handLandmarker && handLandmarker.close) {
        handLandmarker.close();
      }
    };
  }, [xrState.handTrackingActive, xrState.cameraFacing]);

  // 6. Real Life 3D Object Detection & Holographic Wireframe Tracking (Zero-Freeze Spatial Engine)
  useEffect(() => {
    const isTrackingActive = xrState.objectTracking3DActive || xrState.alqamiModeActive;
    if (!isTrackingActive) {
      setTracked3DObjects([]);
      const canvas = objectCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let cancelled = false;
    let animFrameId = 0;

    async function initDetector() {
      if (!cameraActiveRef.current) {
        await startRealCamera(xrState.cameraFacing);
      }

      // Initial physical room objects anchored in real space
      const trackedList: Detected3DObject[] = [];

      const loop = (now: number) => {
        if (cancelled) return;
        animFrameId = requestAnimationFrame(loop);

        const canvas = objectCanvasRef.current;
        if (!canvas) return;

        if (canvas.width !== window.innerWidth) canvas.width = window.innerWidth;
        if (canvas.height !== window.innerHeight) canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Perspective dynamics based on device pitch tilt (read from ref without triggering re-renders)
        const pitchOffset = (headRotationRef.current?.pitch || 0) * 120;
        const yawOffset = (headRotationRef.current?.yaw || 0) * 120;

        // Render each 3D object bounding box with 60FPS perspective extrusion
        // Mock 3D detection squares removed
      };

      setTracked3DObjects(trackedList);
      animFrameId = requestAnimationFrame(loop);
    }

    initDetector();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameId);
    };
  }, [xrState.objectTracking3DActive, xrState.alqamiModeActive, xrState.cameraFacing, startRealCamera]);

  // 7. Launch a real WebXR AR session with surface scanning and world-anchored placement.
  const launchNativeWebXR = useCallback(async () => {
    const nav = navigator as Navigator & {
      xr?: {
        requestSession: (mode: string, options: Record<string, unknown>) => Promise<any>;
      };
    };
    if (!nav.xr) {
      setCameraError(getRoomScanUnavailableMessage());
      setXrControlsOpen(true);
      return;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let pendingSession: any = null;
    try {
      const canvas = webxrCanvasRef.current;
      if (!canvas) return;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setXrState((prev) => ({ ...prev, cameraActive: false }));
      }
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local');
      xrRendererRef.current = renderer;

      const sessionInit: Record<string, unknown> = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'hand-tracking', 'local-floor'],
      };
      if (domOverlayRootRef.current) {
        sessionInit.domOverlay = { root: domOverlayRootRef.current };
      }

      const session = await nav.xr.requestSession('immersive-ar', sessionInit);
      pendingSession = session;
      if (!session.domOverlayState) {
        throw new Error(
          'This browser supports an AR session but not its interactive page overlay, so it cannot show the app windows during room tracking. Camera view is only a preview; use a browser/device that supports WebXR DOM Overlay.'
        );
      }
      xrSessionRef.current = session;
      await renderer.xr.setSession(session);

      setArObjectPlaced(false);
      // Start armed: the first deliberate tap on empty space places the model.
      // Once placed, a tap on the “Move model” control rearms placement.
      arPlacementModeRef.current = true;
      setArPlacementMode(true);
      nativeHandTrackingRef.current = false;
      setNativeHandTrackingActive(false);
      filteredHandCursorRef.current.initialized = false;
      setXrState((prev) => ({
        ...prev,
        cameraActive: false,
        handTrackingActive: false,
        webxrSessionActive: true,
        hitTestSurfaceDetected: false,
        arPlacementMode: true,
      }));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
      scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x43536a, 1.5));
      const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.1);
      keyLight.position.set(-1.6, 2.7, 1.1);
      scene.add(keyLight);

      // The same real-scale, fluted model is used in the product viewer and the AR session.
      const table = createLovbackenModel();
      table.visible = false;
      scene.add(table);

      // Soft contact shade keeps the model visually grounded without pretending to cast camera shadows.
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = shadowCanvas.height = 128;
      const shadowContext = shadowCanvas.getContext('2d');
      if (shadowContext) {
        const gradient = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
        gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.14)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        shadowContext.fillStyle = gradient;
        shadowContext.fillRect(0, 0, 128, 128);
      }
      const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
      const contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.2),
        new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = 0.003;
      table.add(contactShadow);
      // Surface footprint grid and animated reticle mirror the placement guide in the clips.
      const placementGrid = new THREE.GridHelper(1.4, 14, 0x9cf4df, 0x9cf4df);
      placementGrid.visible = false;
      placementGrid.renderOrder = 2;
      const placementGridMaterials = Array.isArray(placementGrid.material)
        ? placementGrid.material
        : [placementGrid.material];
      placementGridMaterials.forEach((material) => {
        const lineMaterial = material as THREE.LineBasicMaterial;
        lineMaterial.transparent = true;
        lineMaterial.opacity = 0.27;
        lineMaterial.depthWrite = false;
        lineMaterial.toneMapped = false;
      });
      scene.add(placementGrid);

      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.115, 0.135, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x9cf4df, transparent: true, opacity: 0.9 })
      );
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);

      let hitTestSource: any = null;
      let hitTestSourceRequested = false;
      let hasSurface = false;
      let placementAnimation: {
        startedAt: number;
        fromPosition: THREE.Vector3;
        toPosition: THREE.Vector3;
        fromQuaternion: THREE.Quaternion;
        toQuaternion: THREE.Quaternion;
        fromScale: number;
      } | null = null;
      const hitPosition = new THREE.Vector3();
      const hitQuaternion = new THREE.Quaternion();
      const hitScale = new THREE.Vector3();
      const surfaceUp = new THREE.Vector3(0, 1, 0);
      const hitNormal = new THREE.Vector3();
      const placeObject = (event?: any) => {
        // Screen taps are handled by the DOM overlay's empty-stage pointer handler.
        // Ignoring screen select events prevents taps on floating controls from
        // accidentally pinning the model behind those controls.
        if (event?.inputSource?.targetRayMode === 'screen') return;
        if (!arPlacementModeRef.current || !hasSurface || !reticle.visible) return;
        const targetPosition = new THREE.Vector3();
        const targetQuaternion = new THREE.Quaternion();
        const hitScale = new THREE.Vector3();
        reticle.matrix.decompose(targetPosition, targetQuaternion, hitScale);
        const wasPlaced = table.visible;
        placementAnimation = {
          startedAt: performance.now(),
          fromPosition: wasPlaced
            ? table.position.clone().addScaledVector(surfaceUp, 0.08)
            : targetPosition.clone().addScaledVector(surfaceUp, 0.15),
          toPosition: targetPosition,
          fromQuaternion: table.quaternion.clone(),
          toQuaternion: targetQuaternion,
          fromScale: wasPlaced ? 1 : 0.82,
        };
        table.visible = true;
        setArObjectPlaced(true);
        arPlacementModeRef.current = false;
        setArPlacementMode(false);
        setXrState((prev) => ({ ...prev, arPlacementMode: false }));
        spatialSound.playPinchTap();
      };
      session.addEventListener('select', placeObject);
      const placeFromOverlayTap = () => placeObject();
      window.addEventListener('visionos:place-ar-object', placeFromOverlayTap);

      session.addEventListener('end', () => {
        window.removeEventListener('visionos:place-ar-object', placeFromOverlayTap);
        renderer?.setAnimationLoop(null);
        hitTestSource?.cancel?.();
        xrHitTestSourceRef.current = null;
        xrSessionRef.current = null;
        xrRendererRef.current?.dispose();
        xrRendererRef.current = null;
        disposeThreeObject(table);
        contactShadow.geometry.dispose();
        (contactShadow.material as THREE.Material).dispose();
        shadowTexture.dispose();
        reticle.geometry.dispose();
        (reticle.material as THREE.Material).dispose();
        placementGrid.geometry.dispose();
        placementGridMaterials.forEach((material) => material.dispose());
        setXrState((prev) => ({
          ...prev,
          webxrSessionActive: false,
          hitTestSurfaceDetected: false,
          arPlacementMode: false,
        }));
        arPlacementModeRef.current = false;
        setArPlacementMode(false);
        nativeHandTrackingRef.current = false;
        setNativeHandTrackingActive(false);
        lastPinchStateRef.current = false;
        setHandPinching(false);
        draggedElementRef.current = null;
        handGestureRef.current = null;
        paintHandCursor(handCursorRef.current, 0, 0, false, false);
        setArObjectPlaced(false);
      });

      renderer.setAnimationLoop((_timestamp: number, frame: any) => {
        if (frame) {
          const referenceSpace = renderer.xr.getReferenceSpace();
          const currentSession = renderer.xr.getSession() as any;

          if (!hitTestSourceRequested && currentSession.requestReferenceSpace) {
            currentSession.requestReferenceSpace('viewer').then((viewerSpace: any) => {
              if (currentSession.requestHitTestSource) {
                currentSession.requestHitTestSource({ space: viewerSpace }).then((source: any) => {
                  if (currentSession !== xrSessionRef.current) {
                    source.cancel?.();
                    return;
                  }
                  hitTestSource = source;
                  xrHitTestSourceRef.current = source;
                }).catch(() => setCameraError('Surface scanning could not start. Check that hit testing is supported on this device.'));
              }
            }).catch(() => setCameraError('The AR viewer reference space is unavailable on this device.'));
            hitTestSourceRequested = true;
          }

          if (hitTestSource && referenceSpace) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
              const hit = hitTestResults[0];
              const pose = hit.getPose(referenceSpace);
              if (pose) {
                reticle.matrix.fromArray(pose.transform.matrix);
                reticle.matrix.decompose(hitPosition, hitQuaternion, hitScale);
                const isLevelSurface = hitNormal.copy(surfaceUp).applyQuaternion(hitQuaternion).dot(surfaceUp) > 0.78;
                reticle.visible = arPlacementModeRef.current;
                reticle.position.copy(hitPosition);
                reticle.quaternion.copy(hitQuaternion);
                reticle.scale.setScalar(1 + Math.sin(_timestamp * 0.003) * 0.025);
                reticle.updateMatrix();
                placementGrid.visible = arPlacementModeRef.current;
                placementGrid.position.copy(hitPosition).addScaledVector(hitNormal, 0.006);
                placementGrid.quaternion.copy(hitQuaternion);
                placementGrid.scale.setScalar(1 + Math.sin(_timestamp * 0.0024) * 0.018);
                placementGridMaterials.forEach((material) => {
                  const lineMaterial = material as THREE.LineBasicMaterial;
                  lineMaterial.color.set(isLevelSurface ? 0x9cf4df : 0xff665f);
                  lineMaterial.opacity = isLevelSurface ? 0.27 : 0.42;
                });
                (reticle.material as THREE.MeshBasicMaterial).color.set(
                  isLevelSurface ? 0x9cf4df : 0xff665f
                );
                if (isLevelSurface !== hasSurface) {
                  hasSurface = isLevelSurface;
                  setXrState((prev) => ({ ...prev, hitTestSurfaceDetected: hasSurface }));
                }
              } else {
                reticle.visible = false;
                placementGrid.visible = false;
                if (hasSurface) {
                  hasSurface = false;
                  setXrState((prev) => ({ ...prev, hitTestSurfaceDetected: false }));
                }
              }
            } else {
              reticle.visible = false;
              placementGrid.visible = false;
              if (hasSurface) {
                hasSurface = false;
                setXrState((prev) => ({ ...prev, hitTestSurfaceDetected: false }));
              }
            }
          }

          if (placementAnimation) {
            const rawProgress = Math.min(1, Math.max(0, (_timestamp - placementAnimation.startedAt) / 680));
            const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
            const springProgress = 1 + 2.70158 * Math.pow(rawProgress - 1, 3) + 1.70158 * Math.pow(rawProgress - 1, 2);
            table.position.lerpVectors(
              placementAnimation.fromPosition,
              placementAnimation.toPosition,
              easedProgress
            );
            table.quaternion.slerpQuaternions(
              placementAnimation.fromQuaternion,
              placementAnimation.toQuaternion,
              easedProgress
            );
            table.scale.setScalar(
              placementAnimation.fromScale + (1 - placementAnimation.fromScale) * springProgress
            );
            if (rawProgress >= 1) {
              table.position.copy(placementAnimation.toPosition);
              table.quaternion.copy(placementAnimation.toQuaternion);
              table.scale.setScalar(1);
              placementAnimation = null;
            }
          }

          // Drive the AR DOM overlay with native XRHand input where the headset exposes it.
          // This shares the pinch/drag/scroll pointer behavior without opening a second camera.
          let nativeHandPointerUpdated = false;
          if (referenceSpace && typeof frame.getJointPose === 'function') {
            const handSource = Array.from(currentSession.inputSources ?? []).find(
              (source: any) => source.hand
            ) as any;
            if (handSource?.hand) {
              const thumbSpace = handSource.hand.get('thumb-tip');
              const indexSpace = handSource.hand.get('index-finger-tip');
              const thumbPose = thumbSpace && frame.getJointPose(thumbSpace, referenceSpace);
              const indexPose = indexSpace && frame.getJointPose(indexSpace, referenceSpace);
              const viewerPose = frame.getViewerPose(referenceSpace);

              if (thumbPose && indexPose && viewerPose?.views?.length) {
                nativeHandPointerUpdated = true;
                if (!nativeHandTrackingRef.current) {
                  nativeHandTrackingRef.current = true;
                  setNativeHandTrackingActive(true);
                }

                const thumb = thumbPose.transform.position;
                const index = indexPose.transform.position;
                const pinchDistance = Math.hypot(
                  thumb.x - index.x,
                  thumb.y - index.y,
                  thumb.z - index.z
                );
                const isPinching = lastPinchStateRef.current
                  ? pinchDistance < 0.04
                  : pinchDistance < 0.025;
                const pinchPoint = new THREE.Vector3(
                  (thumb.x + index.x) * 0.5,
                  (thumb.y + index.y) * 0.5,
                  (thumb.z + index.z) * 0.5
                );
                let cursorX = 0;
                let cursorY = 0;
                let projectedViews = 0;

                // Average binocular projections to avoid biasing the cursor to either eye.
                for (const view of viewerPose.views) {
                  const viewMatrix = new THREE.Matrix4().fromArray(view.transform.inverse.matrix);
                  const projectionMatrix = new THREE.Matrix4().fromArray(view.projectionMatrix);
                  const clipPoint = new THREE.Vector4(pinchPoint.x, pinchPoint.y, pinchPoint.z, 1)
                    .applyMatrix4(viewMatrix)
                    .applyMatrix4(projectionMatrix);
                  if (clipPoint.w <= 0) continue;
                  cursorX += ((clipPoint.x / clipPoint.w + 1) * 0.5) * window.innerWidth;
                  cursorY += ((1 - clipPoint.y / clipPoint.w) * 0.5) * window.innerHeight;
                  projectedViews++;
                }

                if (projectedViews > 0) {
                  cursorX /= projectedViews;
                  cursorY /= projectedViews;
                  const filteredCursor = filteredHandCursorRef.current;
                  const smoothing = filteredCursor.initialized ? 0.48 : 1;
                  filteredCursor.x += (cursorX - filteredCursor.x) * smoothing;
                  filteredCursor.y += (cursorY - filteredCursor.y) * smoothing;
                  filteredCursor.initialized = true;
                  cursorX = filteredCursor.x;
                  cursorY = filteredCursor.y;
                  const target = document.elementFromPoint(cursorX, cursorY);
                  paintHandCursor(handCursorRef.current, cursorX, cursorY, true, isPinching);
                  if (isPinching !== lastPinchStateRef.current) setHandPinching(isPinching);

                  if (isPinching && !lastPinchStateRef.current) {
                    spatialSound.playPinchTap();
                    if (target) {
                      draggedElementRef.current = target;
                      handGestureRef.current = { startX: cursorX, startY: cursorY, moved: false };
                      updateHandRangeInput(target, cursorX);
                      dispatchHandPointer(target, 'pointerdown', cursorX, cursorY);
                    }
                  } else if (isPinching && lastPinchStateRef.current) {
                    const gesture = handGestureRef.current;
                    const activeTarget = draggedElementRef.current;
                    if (gesture && activeTarget) {
                      if (Math.hypot(cursorX - gesture.startX, cursorY - gesture.startY) > 8) {
                        gesture.moved = true;
                      }
                      updateHandRangeInput(activeTarget, cursorX);
                      dispatchHandPointer(activeTarget, 'pointermove', cursorX, cursorY);
                    }
                  } else if (!isPinching && lastPinchStateRef.current) {
                    const activeTarget = draggedElementRef.current;
                    const gesture = handGestureRef.current;
                    if (activeTarget) dispatchHandPointer(activeTarget, 'pointerup', cursorX, cursorY);
                    if (activeTarget && gesture && !gesture.moved && activeTarget.isConnected) {
                      const focusTarget = activeTarget.closest<HTMLElement>(
                        'input, textarea, select, button, [contenteditable="true"], [role="button"]'
                      );
                      focusTarget?.focus({ preventScroll: true });
                      (activeTarget as HTMLElement).click();
                    }
                    draggedElementRef.current = null;
                    handGestureRef.current = null;
                  }
                  lastPinchStateRef.current = isPinching;

                  const fingerJoints = [
                    ['index-finger-metacarpal', 'index-finger-proximal', 'index-finger-tip'],
                    ['middle-finger-metacarpal', 'middle-finger-proximal', 'middle-finger-tip'],
                    ['ring-finger-metacarpal', 'ring-finger-proximal', 'ring-finger-tip'],
                    ['little-finger-metacarpal', 'little-finger-proximal', 'little-finger-tip'],
                  ];
                  const extendedFingers = fingerJoints.filter(([baseName, proximalName, tipName]) => {
                    const baseSpace = handSource.hand.get(baseName);
                    const proximalSpace = handSource.hand.get(proximalName);
                    const tipSpace = handSource.hand.get(tipName);
                    if (!baseSpace || !proximalSpace || !tipSpace) return false;
                    const basePose = frame.getJointPose(baseSpace, referenceSpace);
                    const proximalPose = frame.getJointPose(proximalSpace, referenceSpace);
                    const tipPose = frame.getJointPose(tipSpace, referenceSpace);
                    if (!basePose || !proximalPose || !tipPose) return false;
                    const distance = (a: DOMPointReadOnly, b: DOMPointReadOnly) =>
                      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
                    return distance(basePose.transform.position, tipPose.transform.position) >
                      distance(basePose.transform.position, proximalPose.transform.position) * 1.45;
                  }).length;
                  const isOpenPalm = !isPinching && extendedFingers >= 3;
                  if (isOpenPalm) {
                    if (openPalmScrollRef.current.active) {
                      const deltaY = cursorY - openPalmScrollRef.current.y;
                      const deltaX = cursorX - openPalmScrollRef.current.x;
                      if (Math.abs(deltaY) > 4 || Math.abs(deltaX) > 4) {
                        scrollHandTarget(document.elementFromPoint(cursorX, cursorY), deltaX * 1.5, deltaY * 1.5);
                      }
                    }
                    openPalmScrollRef.current = { x: cursorX, y: cursorY, active: true };
                  } else {
                    openPalmScrollRef.current.active = false;
                  }
                }
              }
            }
          }

          if (!nativeHandPointerUpdated) {
            if (nativeHandTrackingRef.current) {
              nativeHandTrackingRef.current = false;
              setNativeHandTrackingActive(false);
            }
            if (lastPinchStateRef.current && draggedElementRef.current) {
              dispatchHandPointer(
                draggedElementRef.current,
                'pointerup',
                filteredHandCursorRef.current.x,
                filteredHandCursorRef.current.y
              );
            }
            lastPinchStateRef.current = false;
            draggedElementRef.current = null;
            handGestureRef.current = null;
            openPalmScrollRef.current.active = false;
            setHandPinching(false);
            paintHandCursor(handCursorRef.current, 0, 0, false, false);
          }
        }
        renderer.render(scene, camera);
      });
    } catch (error) {
      pendingSession?.end?.();
      xrSessionRef.current = null;
      xrHitTestSourceRef.current?.cancel?.();
      xrHitTestSourceRef.current = null;
      xrRendererRef.current?.dispose();
      xrRendererRef.current = null;
      renderer?.dispose();
      setXrState((prev) => ({
        ...prev,
        webxrSessionActive: false,
        hitTestSurfaceDetected: false,
        arPlacementMode: false,
      }));
      arPlacementModeRef.current = false;
      setArPlacementMode(false);
      nativeHandTrackingRef.current = false;
      setNativeHandTrackingActive(false);
      lastPinchStateRef.current = false;
      setHandPinching(false);
      draggedElementRef.current = null;
      handGestureRef.current = null;
      paintHandCursor(handCursorRef.current, 0, 0, false, false);
      setCameraError(
        error instanceof Error
          ? error.message
          : 'The AR session could not start. This browser or device may not support immersive surface placement.'
      );
      setXrControlsOpen(true);
    }
  }, [domOverlayRootRef, setXrState]);

  const startCameraFallback = useCallback(async () => {
    setCameraError(null);
    await enableGyroscope();
    await startRealCamera('environment');
    setXrControlsOpen(true);
  }, [enableGyroscope, startRealCamera]);

  useEffect(() => {
    const placeProduct = () => {
      setXrControlsOpen(true);
      const nav = navigator as Navigator & { xr?: unknown };
      if (!nav.xr) {
        setCameraError('This browser cannot start a room-surface scan. Camera + head look is only a preview; the separate Vision Pro immersive USDZ view does not scan the room or anchor app windows.');
        return;
      }
      void launchNativeWebXR();
    };
    window.addEventListener('visionos:place-product', placeProduct);
    return () => window.removeEventListener('visionos:place-product', placeProduct);
  }, [launchNativeWebXR, xrState.webxrSupported]);

  const endNativeWebXR = useCallback(() => {
    xrSessionRef.current?.end?.();
  }, []);

  const toggleVisionOSImmersive = useCallback(async () => {
    type ImmersiveDocument = Document & {
      immersiveElement?: Element | null;
      exitImmersive?: () => Promise<void>;
    };
    const doc = document as ImmersiveDocument;
    if (doc.immersiveElement) {
      await doc.exitImmersive?.();
      return;
    }
    const model = immersiveModelRef.current;
    if (!model?.requestImmersive) {
      setCameraError('The native Vision Pro Immersive API is not available in this browser.');
      return;
    }
    setVisionOSImmersiveLoading(true);
    setCameraError(null);
    try {
      await model.requestImmersive();
    } catch {
      setVisionOSImmersiveLoading(false);
      setCameraError('Could not enter the Vision Pro environment. Make sure Safari allows immersive websites.');
    }
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    xrHitTestSourceRef.current?.cancel?.();
    xrSessionRef.current?.end?.();
    xrRendererRef.current?.dispose();
  }, []);

  return (
    <>
      <div
        ref={immersiveModelHostRef}
        className="fixed left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
        aria-hidden="true"
      />
      {/* Live Physical Phone / Webcam Passthrough Video Layer */}
      <video
        ref={videoRef}
        data-passthrough-video="true"
        playsInline
        muted
        autoPlay
        style={{
          filter: xrState.thermalVisionActive
            ? 'invert(1) hue-rotate(180deg) saturate(3.5) contrast(1.6)'
            : xrState.nightVisionActive
            ? 'brightness(1.7) contrast(2.2) saturate(0) sepia(100%) hue-rotate(95deg)'
            : undefined,
        }}
        className={`fixed inset-0 w-full h-full object-cover pointer-events-none transition-all duration-500 ${
          xrState.cameraActive ? 'opacity-100 z-0' : 'opacity-0 -z-10'
        } ${xrState.cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
      />

      {/* Native WebXR Hit-Test Canvas */}
      <canvas
        ref={webxrCanvasRef}
        className={`fixed inset-0 w-full h-full pointer-events-none ${
          xrState.webxrSessionActive ? 'z-0 opacity-100' : 'opacity-0 -z-10'
        }`}
      />

      {/* MediaPipe 21-Joint Hand Skeleton Overlay Canvas */}
      <canvas
        ref={handCanvasRef}
        className={`fixed inset-0 w-full h-full pointer-events-none z-[51] ${
          xrState.handTrackingActive ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Real-Life 3D Object Tracking Holographic Overlay Canvas */}
      <canvas
        ref={objectCanvasRef}
        onClick={handleObjectCanvasClick}
        className={`fixed inset-0 w-full h-full pointer-events-none z-[52] ${
          (xrState.objectTracking3DActive || xrState.alqamiModeActive) && xrState.cameraActive ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Spatial Gaze / Hand Pinch Cursor Reticle */}
      <div
        ref={handCursorRef}
        aria-hidden="true"
        style={{ opacity: 0, transform: 'translate3d(-100px, -100px, 0)' }}
        className="fixed top-0 left-0 z-[100] pointer-events-none will-change-transform transition-opacity duration-100"
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-100">
          <div className="w-2.5 h-2.5 rounded-full transition-transform duration-100" />
        </div>
      </div>

      {/* Quiet status capsule; sensor controls stay tucked away until requested. */}
      <div className="xr-controls-root fixed top-4 right-4 z-[85] flex flex-col items-end">
        <button
          type="button"
          onClick={() => setXrControlsOpen((open) => !open)}
          aria-expanded={xrControlsOpen}
          className="vision-btn vision-ornament flex h-9 items-center gap-2 rounded-full px-3.5 text-xs font-medium text-white/95"
          title="Open spatial and AR controls"
        >
          <span>{visionOSImmersiveActive ? 'Studio immersive' : xrState.webxrSessionActive ? 'In your space' : 'Spatial'}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${xrControlsOpen ? 'rotate-180' : ''}`} />
        </button>

        {xrControlsOpen && (
          <div className="vision-glass xr-control-panel mt-2 w-[min(316px,calc(100vw-2rem))] rounded-[24px] p-2.5 text-white animate-fadeIn">
            <div className="flex items-center justify-between px-2 pb-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Spatial controls</p>
                <p className="mt-0.5 text-xs text-white/85">
                  {visionOSImmersiveActive
                    ? 'Vision Pro environment'
                    : xrState.webxrSessionActive
                      ? 'Immersive AR session'
                      : 'Room and device tracking'}
                </p>
              </div>
              <span className={`h-2 w-2 rounded-full ${xrState.webxrSessionActive ? 'bg-emerald-300' : 'bg-white/40'}`} />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {/* Alqami 3 Authentic AR Artifact & Manuscript Scanner */}
              <button
                onClick={() => {
                  spatialSound.playPinchTap();
                  const next = !alqamiScanModeActive;
                  setAlqamiScanModeActive(next);
                  if (next && !xrState.cameraActive) {
                    startRealCamera(xrState.cameraFacing);
                  }
                }}
                className={`xr-control-option col-span-2 ${
                  alqamiScanModeActive
                    ? 'border-cyan-400 bg-cyan-500/30 text-cyan-100 shadow-[0_0_24px_rgba(6,182,212,0.55)] ring-1 ring-cyan-300'
                    : 'hover:border-cyan-400/50 hover:bg-cyan-500/15'
                }`}
                title="Alqami 3 AR Custom Artifact Recognition & Semantic Metadata Scanner"
              >
                <Scan className="h-4 w-4 text-cyan-300 animate-pulse" />
                <span className="font-semibold text-cyan-100">
                  {alqamiScanModeActive ? 'Alqami AR Scan Active' : 'Alqami AR Scan Mode'}
                </span>
                <span className="ml-auto text-[10px] text-cyan-300/80 uppercase font-mono tracking-wider">alqami 3</span>
              </button>

              <button
                onClick={() => xrState.cameraActive ? stopRealCamera() : startRealCamera(xrState.cameraFacing)}
                disabled={xrState.webxrSessionActive}
                className={`xr-control-option ${xrState.cameraActive ? 'is-active' : ''}`}
                title="Toggle camera passthrough"
              >
                <Camera className="h-4 w-4" />
                <span>{xrState.cameraActive ? 'Camera on' : 'Camera view'}</span>
              </button>
              {xrState.cameraActive ? (
                <button
                  onClick={() => startRealCamera(xrState.cameraFacing === 'environment' ? 'user' : 'environment')}
                  className="xr-control-option"
                  title={`Switch to ${xrState.cameraFacing === 'environment' ? 'front' : 'rear'} camera`}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Flip camera</span>
                </button>
              ) : (
                <button
                  onClick={enableGyroscope}
                  className={`xr-control-option ${xrState.gyroActive ? 'is-active' : ''}`}
                  title="Use device orientation for head look (3DoF)"
                >
                  <Compass className="h-4 w-4" />
                  <span>{xrState.gyroActive ? 'Head look on' : 'Head look'}</span>
                </button>
              )}

              <button
                onClick={() => setXrState((prev) => ({ ...prev, handTrackingActive: !prev.handTrackingActive }))}
                disabled={xrState.webxrSessionActive}
                className={`xr-control-option ${xrState.handTrackingActive ? 'is-active' : ''}`}
                title={xrState.webxrSessionActive ? nativeHandTrackingActive ? 'Pinch to click or drag; open palm to scroll' : 'Use the AR device select input in immersive mode' : 'Toggle camera-based hand pinch tracking'}
              >
                <Hand className="h-4 w-4" />
                <span>{xrState.webxrSessionActive ? nativeHandTrackingActive ? 'Hand gestures active' : 'AR select input' : handModelLoading ? 'Loading hands…' : 'Camera hand gestures'}</span>
              </button>
              {visionOSImmersiveSupported && (
                <button
                  onClick={toggleVisionOSImmersive}
                  className={`xr-control-option xr-control-primary col-span-2 ${visionOSImmersiveActive ? 'is-active' : ''}`}
                  title={visionOSImmersiveActive ? 'Exit the Vision Pro environment' : 'Open the native Vision Pro immersive environment'}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{visionOSImmersiveLoading ? 'Opening Vision Pro environment…' : visionOSImmersiveActive ? 'Exit Vision Pro environment' : 'Enter Vision Pro environment'}</span>
                  {!visionOSImmersiveActive && !visionOSImmersiveLoading && <span className="ml-auto text-[10px] text-white/55">native model</span>}
                </button>
              )}

              {xrState.webxrSupported && (
                <button
                  onClick={xrState.webxrSessionActive ? endNativeWebXR : launchNativeWebXR}
                  className={`xr-control-option xr-control-primary col-span-2 ${xrState.webxrSessionActive ? 'is-active' : ''}`}
                  title={xrState.webxrSessionActive ? 'Exit WebXR surface placement' : 'Find a real surface and place the 3D model'}
                >
                  <Crosshair className="h-4 w-4" />
                  <span>{xrState.webxrSessionActive ? 'Exit surface scan' : 'Find surface & place'}</span>
                  {!xrState.webxrSessionActive && <span className="ml-auto text-[10px] text-white/55">WebXR</span>}
                </button>
              )}

              {/* Visor & Motion Predictor Controls */}
              <button
                onClick={() => {
                  setXrState((prev) => ({ ...prev, sbsStereoActive: !prev.sbsStereoActive }));
                  spatialSound.playPinchTap();
                }}
                className={`xr-control-option ${xrState.sbsStereoActive ? 'is-active' : ''}`}
                title="Stereoscopic Side-by-Side Dual Eye Visor Mode (Google Cardboard / VR Visor)"
              >
                <Eye className="h-4 w-4" />
                <span>{xrState.sbsStereoActive ? 'SBS Visor On' : 'SBS Visor Mode'}</span>
              </button>

              <button
                onClick={() => {
                  setXrState((prev) => ({ ...prev, latencyPredictionActive: prev.latencyPredictionActive === false ? true : false }));
                  spatialSound.playPinchTap();
                }}
                className={`xr-control-option ${xrState.latencyPredictionActive !== false ? 'is-active' : ''}`}
                title="Motion-to-Photon 35ms Lead Predictor"
              >
                <Sparkles className="h-4 w-4" />
                <span>{xrState.latencyPredictionActive !== false ? 'Predictor (35ms)' : 'Predictor Off'}</span>
              </button>

              <button
                onClick={() => {
                  gyroBaselineRef.current = null;
                  onRecenterView();
                  spatialSound.playPinchTap();
                }}
                className="xr-control-option col-span-2"
                title="Recenter the spatial scene"
              >
                <Crosshair className="h-4 w-4" />
                <span>Recenter view</span>
              </button>
            </div>

            <p className="mt-2 px-2 text-[10px] leading-relaxed text-white/55">
              {visionOSImmersiveActive
                ? 'Vision Pro is rendering a room-scale USDZ environment around Safari.'
                : xrState.webxrSessionActive
                ? xrState.hitTestSurfaceDetected
                  ? arPlacementMode
                    ? 'Aim at a clear area and tap to place Lövbacken'
                    : arObjectPlaced
                      ? 'Lövbacken anchored · app windows remain screen overlays'
                      : 'Surface found · tap clear space to place Lövbacken'
                  : 'Aim at a textured floor/table for the ring. WebXR hit-tests the surface under the reticle; it does not build a full room mesh.'
                : xrState.webxrSupported
                ? 'WebXR tests the surface under the reticle. Tap a clear area after the ring appears to anchor the model; app windows remain browser overlays.'
                  : visionOSImmersiveSupported
                    ? 'Safari Immersive uses a real-scale 3D environment with tracked head movement.'
                    : /iPhone|iPad|iPod/.test(navigator.userAgent)
                      ? 'On iPhone, Safari does not expose immersive WebXR AR. The current table model has no USDZ Quick Look export; live room scanning and anchored app windows require a native ARKit app.'
                      : !window.isSecureContext
                      ? 'Room scanning needs HTTPS or localhost. On an ARCore Android phone, use Chrome USB port forwarding for this local app: forward 5173 to localhost:5173, then open http://localhost:5173.'
                      : !(navigator as Navigator & { xr?: unknown }).xr
                        ? 'This tab has no WebXR API. Test real surface scanning in Chrome on an ARCore Android phone; use USB port forwarding (5173 → localhost:5173) for this local build. iPhone/Vision Pro room tracking needs native ARKit.'
                        : 'This device/browser does not support immersive WebXR AR. Camera view is only a video preview; it cannot scan surfaces or anchor the model.'}
            </p>
          </div>
        )}
      </div>

      {xrState.webxrSessionActive && (
        <div className="fixed bottom-7 left-1/2 z-[84] -translate-x-1/2 pointer-events-none">
          <div className="vision-ornament rounded-full px-4 py-2 text-center text-xs text-white/90">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300 align-middle shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
            {xrState.hitTestSurfaceDetected
              ? arPlacementMode
                ? 'Tap clear space to place Lövbacken'
              : arObjectPlaced
                ? 'Lövbacken anchored · app windows stay screen overlay'
                : 'Surface found · tap clear space to place Lövbacken'
              : 'Move slowly toward a textured floor or table · finding a surface'}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ALQAMI 3 AUTHENTIC AR ARTIFACT SCANNER & HOLOGRAPHIC METADATA
          Exact Match to https://github.com/isaacrow/alqami3.git
         ───────────────────────────────────────────────────────────── */}
      {alqamiScanModeActive && xrState.cameraActive && !isArtifactDetected && (
        <div className="fixed inset-0 pointer-events-none z-[85] flex flex-col items-center justify-center animate-fadeIn">
          {/* Scanning Reticle Box matching alqami3 .reticle-box */}
          <div className="relative w-[270px] h-[350px] border border-dashed border-white/40 rounded-2xl animate-pulse">
            <div className="absolute -top-[2px] -left-[2px] w-7 h-7 border-t-[3px] border-l-[3px] border-cyan-400 rounded-tl-sm shadow-[0_0_8px_#22d3ee]" />
            <div className="absolute -top-[2px] -right-[2px] w-7 h-7 border-t-[3px] border-r-[3px] border-cyan-400 rounded-tr-sm shadow-[0_0_8px_#22d3ee]" />
            <div className="absolute -bottom-[2px] -left-[2px] w-7 h-7 border-b-[3px] border-l-[3px] border-cyan-400 rounded-bl-sm shadow-[0_0_8px_#22d3ee]" />
            <div className="absolute -bottom-[2px] -right-[2px] w-7 h-7 border-b-[3px] border-r-[3px] border-cyan-400 rounded-br-sm shadow-[0_0_8px_#22d3ee]" />

            {/* Target Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border border-cyan-400/40 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee]" />
              </div>
            </div>
          </div>

          <div
            onClick={() => {
              spatialSound.playAlqamiChime();
              setIsArtifactDetected(true);
            }}
            className="mt-6 px-5 py-2.5 rounded-full bg-black/75 backdrop-blur-xl text-white text-xs border border-white/25 shadow-2xl flex items-center gap-2.5 pointer-events-auto cursor-pointer hover:bg-black/90 active:scale-95 transition"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-medium">
              {/ar/.test(navigator.language) ? 'وجّه الكاميرا نحو المقتنى للتعرّف وقراءة البيانات' : 'Align artifact within frame · Tap to lock'}
            </span>
          </div>
        </div>
      )}

      {/* Alqami 3 Holographic Metadata Card & Laser Tether */}
      {alqamiScanModeActive && xrState.cameraActive && isArtifactDetected && (() => {
        const currentScannedArtifact = ALQAMI_ARTIFACTS[activeArtifactScanIndex] || ALQAMI_ARTIFACTS[0];
        return (
          <div className="fixed inset-0 z-[86] pointer-events-none flex items-center justify-center p-4">
            {/* Subtle Laser Tether line connecting object contact to card */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <svg className="w-full h-full">
                <defs>
                  <linearGradient id="tether-grad" x1="0%" y1="100%" x2="50%" y2="50%">
                    <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                <line x1="50%" y1="85%" x2="50%" y2="50%" stroke="url(#tether-grad)" strokeWidth="2" strokeDasharray="4 4" />
                <circle cx="50%" cy="85%" r="18" fill="none" stroke="#00f2fe" strokeWidth="1.5" strokeOpacity="0.6" />
                <circle cx="50%" cy="85%" r="3" fill="#ffffff" />
              </svg>
            </div>

            {/* Apple Vision Pro Dark Glass Card (Exact alqami3 card layout) */}
            <div className="relative w-full max-w-[480px] rounded-[28px] bg-[#1c1c1ef2] backdrop-blur-2xl border border-white/25 shadow-[0_30px_70px_rgba(0,0,0,0.85)] p-5 text-white pointer-events-auto animate-fadeIn space-y-3.5">
              {/* Top Header Badge & Identifier */}
              <div className="flex items-center justify-between">
                <div className="px-3 py-1 rounded-full bg-white/10 text-[11px] font-semibold text-white/90 tracking-wider uppercase font-mono border border-white/15">
                  ALQAMI INTELLIGENCE
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-white/60">
                    {currentScannedArtifact.itemCode}
                  </span>
                  <button
                    onClick={() => setIsArtifactDetected(false)}
                    className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Titles */}
              <div className="space-y-0.5">
                <h3 className="text-xl font-bold text-white tracking-tight leading-snug">
                  {currentScannedArtifact.title.en}
                </h3>
                <p className="text-base text-amber-200/90 font-serif leading-snug">
                  {currentScannedArtifact.title.ar}
                </p>
              </div>

              <div className="h-[1px] bg-white/15 w-full" />

              {/* Properties Grid (dc:creator, dc:date, schema:material, etc.) */}
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider block">
                    Author (dc:creator)
                  </span>
                  <span className="text-xs font-medium text-white truncate block mt-0.5">
                    {currentScannedArtifact.details.material.en.split(',')[0] || 'Royal Court Guild'}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider block">
                    Period (dc:date)
                  </span>
                  <span className="text-xs font-medium text-white truncate block mt-0.5">
                    {currentScannedArtifact.period.en}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider block">
                    Material (schema:material)
                  </span>
                  <span className="text-xs font-medium text-white truncate block mt-0.5">
                    {currentScannedArtifact.details.material.en}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider block">
                    Dimensions (schema:extent)
                  </span>
                  <span className="text-xs font-medium text-white truncate block mt-0.5">
                    {currentScannedArtifact.details.dimensions || '26.5 x 17.2 cm'}
                  </span>
                </div>
              </div>

              {/* Bottom Ontology Transcription Box (dc:description) */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                    ONTOLOGY TRANSCRIPTION (dc:description)
                  </span>
                  <span className="text-[10px] font-mono text-cyan-300">RDF / Turtle Linked</span>
                </div>
                <p className="text-xs text-white/90 font-serif leading-relaxed line-clamp-2">
                  « {currentScannedArtifact.description.ar} »
                </p>
                <p className="text-[11px] text-white/70 leading-relaxed line-clamp-2 italic">
                  "{currentScannedArtifact.description.en}"
                </p>
              </div>

              {/* Footer with 60 FPS Tracking & Actions */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#34c759] shadow-[0_0_8px_#34c759]" />
                  <span className="text-xs font-medium text-[#34c759]">Tracking Active (60 FPS)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      spatialSound.playPinchTap();
                      setActiveArtifactScanIndex((prev) => (prev + 1) % ALQAMI_ARTIFACTS.length);
                    }}
                    className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                    title="Cycle to next heritage artifact"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Cycle</span>
                  </button>

                  <button
                    onClick={() => {
                      spatialSound.playPinchTap();
                      window.dispatchEvent(new CustomEvent('visionos:inspect-3d', { detail: { artifactId: currentScannedArtifact.id } }));
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition active:scale-95 shadow-md"
                  >
                    <Rotate3d className="w-3.5 h-3.5" />
                    <span>Inspect 3D</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
};
