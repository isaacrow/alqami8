import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { downscaleTextures, getDracoLoader, isPhoneViewport } from '../../../utils/modelMemory';
import { Box, Camera, Compass, Crosshair, Hand, Layers, LayoutGrid, LogOut, Mountain, Navigation, PenTool, QrCode, RotateCcw, SlidersHorizontal, Trash2, Undo2 } from 'lucide-react';
import { OrientationTracker, requestMotionPermission } from './orientationTracker';
import { createLovbackenModel, disposeThreeObject } from '../../three/LovbackenModel';
import { spatialSound } from '../../../utils/spatialSound';
import { createTroikaSpatialText } from '../../../utils/troika3DText';
import { networkedSync } from '../../../utils/networkedSpatialSync';
import { assetUrl } from '../../../utils/assetUrl';
import { ALQAMI_ARTIFACTS, type AlqamiArtifact } from '../../../data/alqamiArtifacts';
import { ArRecognitionOverlay, useArRecognition } from './ArRecognition';

/* ──────────────────────────────────────────────────────────────────────────────
 * Spatial World — a visionOS-style "every window is its own object" renderer for
 * iPhone Safari WITHOUT WebXR and WITHOUT AR Quick Look.
 *
 *  • Camera passthrough  : getUserMedia rear camera (owned by RealARXREngine).
 *  • Head pose           : DeviceOrientation → quaternion (OrientationTracker), 3DoF.
 *  • Windows             : real DOM (React portals) wrapped in three.js CSS3DObjects,
 *                          each with its own world pose (yaw / pitch / distance).
 *  • 3D objects          : WebGL layer sharing the exact same camera (floor-anchored).
 *  • Projection          : camera FOV derived from the live video intrinsics so virtual
 *                          content matches the real-world scale of the passthrough.
 *
 * World units: 1 unit = 1 CSS px = 1 mm. Eye height ≈ 1.45 m above the floor.
 * ──────────────────────────────────────────────────────────────────────────── */

const UNITS_PER_METER = 1000;
const EYE_HEIGHT = 1.45 * UNITS_PER_METER;
const MIN_DIST = 500;
const MAX_DIST = 4500;
const DEG = Math.PI / 180;
const LENS_KEY = 'spatial-world-lens-fov';

interface PanelPose {
  yaw: number; // radians, + = left
  pitch: number; // radians, + = up
  dist: number; // world units
}

interface PanelRecord {
  id: string;
  el: HTMLDivElement;
  obj: CSS3DObject;
  width: number;
  height: number;
  pose: PanelPose;
  shown: PanelPose; // eased pose actually rendered
  carry: null | { pointerId: number; dYaw: number; dPitch: number; lastX: number; lastY: number };
}

interface WorldObjectRecord {
  id: string;
  group: THREE.Group;
  shadow: THREE.Mesh;
  ornament: CSS3DObject;
  troikaText?: THREE.Group;
  height: number;
}

interface WorldApi {
  addPanel: (id: string, el: HTMLDivElement, width: number, height: number) => void;
  removePanel: (id: string) => void;
  resizePanel: (id: string, width: number, height: number) => void;
  beginCarry: (id: string, e: React.PointerEvent | PointerEvent) => void;
  changeDepth: (id: string, factor: number) => void;
}

const WorldContext = createContext<WorldApi | null>(null);

export function useSpatialWorld() {
  return useContext(WorldContext);
}

/* ─────────────────────────── helpers ─────────────────────────── */

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const _euler = new THREE.Euler();
const _v = new THREE.Vector3();

function applyPose(obj: THREE.Object3D, pose: PanelPose) {
  _euler.set(pose.pitch, pose.yaw, 0, 'YXZ');
  _v.set(0, 0, -pose.dist).applyEuler(_euler);
  obj.position.copy(_v);
  obj.rotation.copy(_euler); // element's +Z faces back toward the viewer
}

function cameraYawPitch(q: THREE.Quaternion) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return { yaw: Math.atan2(-f.x, -f.z), pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) };
}

/**
 * Estimates small camera translations from passthrough video. This is visual parallax,
 * not ARKit tracking. Subpixel flow preserves responsive movement; robust averaging,
 * gyro gating, damping, and a bounded range reduce the old jitter and drift.
 */
class OpticalFlowTracker {
  private readonly width = 64;
  private readonly height = 48;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  private previous: Float32Array | null = null;
  private readonly velocity = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  readonly translation = new THREE.Vector3();

  constructor() {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  reset() {
    this.previous = null;
    this.velocity.multiplyScalar(0.5);
  }

  update(video: HTMLVideoElement | null, angularSpeed: number) {
    if (!video || video.readyState < 2 || !this.ctx) return;

    try {
      this.ctx.drawImage(video, 0, 0, this.width, this.height);
      const rgba = this.ctx.getImageData(0, 0, this.width, this.height).data;
      const current = new Float32Array(this.width * this.height);
      let mean = 0;
      for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
        const luma = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
        current[p] = luma;
        mean += luma;
      }
      mean /= current.length;
      for (let i = 0; i < current.length; i += 1) current[i] -= mean;

      const previous = this.previous;
      this.previous = current;
      if (!previous) return;

      // Rebase during fast turns so rotational flow does not masquerade as translation.
      if (angularSpeed > 0.45) {
        this.velocity.multiplyScalar(0.72);
        this.target.add(this.velocity).multiplyScalar(0.995).clampLength(0, 1200);
        this.translation.lerp(this.target, 0.22);
        return;
      }

      const flowX: number[] = [];
      const flowY: number[] = [];
      for (let y = 4; y < this.height - 4; y += 3) {
        for (let x = 4; x < this.width - 4; x += 3) {
          const i = y * this.width + x;
          const ix = (previous[i + 1] - previous[i - 1]) * 0.5;
          const iy = (previous[i + this.width] - previous[i - this.width]) * 0.5;
          const gradientSq = ix * ix + iy * iy;
          if (gradientSq < 36) continue;

          const temporal = current[i] - previous[i];
          const dx = (-temporal * ix) / gradientSq;
          const dy = (-temporal * iy) / gradientSq;
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) continue;
          flowX.push(dx);
          flowY.push(dy);
        }
      }

      if (flowX.length >= 8) {
        const median = (values: number[]) => {
          values.sort((a, b) => a - b);
          const mid = Math.floor(values.length / 2);
          return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) * 0.5;
        };
        const medianX = median([...flowX]);
        const medianY = median([...flowY]);
        const deviations = flowX.map((x, i) => Math.hypot(x - medianX, flowY[i] - medianY));
        const mad = median(deviations);
        const maxDeviation = Math.max(0.12, mad * 2.5);
        let dxSum = 0;
        let dySum = 0;
        let inliers = 0;
        for (let i = 0; i < flowX.length; i += 1) {
          if (deviations[i] > maxDeviation) continue;
          dxSum += flowX[i];
          dySum += flowY[i];
          inliers += 1;
        }
        if (inliers >= 5) {
          const dx = dxSum / inliers;
          const dy = dySum / inliers;
          if (Math.abs(dx) > 0.015 || Math.abs(dy) > 0.015) {
            // Camera motion is opposite image motion. Keep a damped velocity estimate
            // so subpixel movement remains responsive without amplifying single-frame noise.
            this.velocity.x += -dx * 10;
            this.velocity.y += dy * 10;
          }
        }
      } else {
        this.velocity.multiplyScalar(0.88);
      }

      this.velocity.multiplyScalar(0.82);
      this.target.add(this.velocity).clampLength(0, 1200);
      this.target.multiplyScalar(0.997);
      this.translation.lerp(this.target, 0.22);
    } catch {
      // Safari can briefly reject canvas reads while camera frames are changing.
      this.reset();
    }
  }
}

/**
 * Vertical FOV of what is actually visible on screen. The phone camera's long sensor axis
 * spans `lensFovDeg` (iPhone 1× wide ≈ 69°). The <video> is `object-fit: cover`, so we
 * account for the crop. This keeps virtual objects at true real-world scale.
 */
function computeVerticalFov(lensFovDeg: number, screenW: number, screenH: number, videoW?: number, videoH?: number) {
  let vw = videoW || 0;
  let vh = videoH || 0;
  if (!vw || !vh) {
    // assume 16:9 stream in the current screen orientation
    const portrait = screenH >= screenW;
    vw = portrait ? 1080 : 1920;
    vh = portrait ? 1920 : 1080;
  }
  const longPx = Math.max(vw, vh);
  const focalPx = longPx / 2 / Math.tan((lensFovDeg * DEG) / 2);
  const scale = Math.max(screenW / vw, screenH / vh); // object-fit: cover
  return (2 * Math.atan(screenH / 2 / (focalPx * scale))) / DEG;
}

function makeBlobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** FocusEntity procedural floor reticle (Three.js ring on floor plane) */
function createFocusReticleGroup(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'focus-reticle';

  const ringGeo = new THREE.RingGeometry(180, 210, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);

  const dotGeo = new THREE.CircleGeometry(26, 32);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 1;
  g.add(dot);

  const ticks = new THREE.Group();
  ticks.name = 'ticks';
  const tickGeo = new THREE.PlaneGeometry(10, 42);
  const tickMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(tickGeo, tickMat);
    const ang = (i * Math.PI) / 2;
    t.rotation.x = -Math.PI / 2;
    t.rotation.z = ang;
    t.position.set(Math.cos(ang) * 235, 1, Math.sin(ang) * 235);
    ticks.add(t);
  }
  g.add(ticks);

  g.visible = false;
  return g;
}

/** WebAR hand depth occlusion group (occludes 3D models behind physical hands) */
function createHandOcclusionGroup(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'hand-occlusion';
  const occlMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
  });
  const sphereGeo = new THREE.SphereGeometry(22, 10, 10);
  for (let i = 0; i < 21; i++) {
    const m = new THREE.Mesh(sphereGeo, occlMat);
    m.renderOrder = -1;
    m.visible = false;
    g.add(m);
  }
  g.visible = false;
  return g;
}

/* ─────────────────────────── component ─────────────────────────── */

/** visionOS 2 Celestial Immersion Environments */
const CELESTIAL_ENVIRONMENTS = [
  {
    id: 'cosmos',
    name: 'Deep Cosmos',
    icon: '🌌',
    top: new THREE.Color(0x060919),
    mid: new THREE.Color(0x181e35),
    low: new THREE.Color(0x0a0815),
  },
  {
    id: 'moon',
    name: 'The Moon',
    icon: '🌕',
    top: new THREE.Color(0x010103),
    mid: new THREE.Color(0x111116),
    low: new THREE.Color(0x282830),
  },
  {
    id: 'haleakala',
    name: 'Haleakala',
    icon: '🌅',
    top: new THREE.Color(0x22123d),
    mid: new THREE.Color(0x5c2440),
    low: new THREE.Color(0xb8522c),
  },
  {
    id: 'borabora',
    name: 'Bora Bora',
    icon: '🏝️',
    top: new THREE.Color(0x142e5c),
    mid: new THREE.Color(0x38657d),
    low: new THREE.Color(0xd1894d),
  },
];

interface SpatialWorldProps {
  cameraActive: boolean;
  ambientRGB?: { r: number; g: number; b: number };
  handTrackingActive?: boolean;
  onToggleHandTracking?: () => void;
  objectTracking3DActive?: boolean;
  onToggleObjectTracking?: () => void;
  onOpenHome?: () => void;
  onExit: () => void;
  children?: React.ReactNode;
  hud?: React.ReactNode;
}

export const SpatialWorld: React.FC<SpatialWorldProps> = ({
  cameraActive,
  ambientRGB,
  handTrackingActive = false,
  onToggleHandTracking,
  objectTracking3DActive = false,
  onToggleObjectTracking,
  onOpenHome,
  onExit,
  children,
  hud,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const glHostRef = useRef<HTMLDivElement>(null);
  const cssHostRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<OrientationTracker>(new OrientationTracker());
  const opticalTrackerRef = useRef<OpticalFlowTracker | null>(null);
  if (!opticalTrackerRef.current) opticalTrackerRef.current = new OpticalFlowTracker();
  const panelsRef = useRef(new Map<string, PanelRecord>());
  const pendingPanelsRef = useRef(new Map<string, { el: HTMLDivElement; width: number; height: number }>());
  const objectsRef = useRef(new Map<string, WorldObjectRecord>());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const glSceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const envRef = useRef<THREE.Group | null>(null);
  const hemiRef = useRef<THREE.HemisphereLight | null>(null);
  const cameraActiveRef = useRef(cameraActive);
  const [lensFov, setLensFov] = useState<number>(() => {
    const saved = Number(localStorage.getItem(LENS_KEY));
    return saved > 30 && saved < 120 ? saved : 69;
  });
  const [trackingMode, setTrackingMode] = useState<'vision-pro' | 'slam-6dof'>(() => {
    return (localStorage.getItem('spatial-world-tracking-mode') as any) || 'vision-pro';
  });
  const trackingModeRef = useRef(trackingMode);
  trackingModeRef.current = trackingMode;
  const lensFovRef = useRef(lensFov);
  const [sensorState, setSensorState] = useState<'waiting' | 'live' | 'none'>('waiting');
  const [calibrateOpen, setCalibrateOpen] = useState(false);
  const [objectCount, setObjectCount] = useState(0);
  const [, setMountTick] = useState(0);

  const focusReticleRef = useRef<THREE.Group | null>(null);
  const controlPointerRef = useRef<null | { x: number; y: number; lastSeen: number; active: boolean }>(null);
  const handOcclGroupRef = useRef<THREE.Group | null>(null);
  const lastGazeIdRef = useRef<string | null>(null);
  const [gazeTargetId, setGazeTargetId] = useState<string | null>(null);
  const [isMicroPinching, setIsMicroPinching] = useState(false);
  const [handControlActive, setHandControlActive] = useState(false);
  const handControlActiveRef = useRef(false);
  // QR labels, book barcodes, and recognition by sight on request: all open Moon records (ArRecognition.tsx).
  const recognition = useArRecognition(cameraActive);

  const [immersionLevel, setImmersionLevel] = useState<number>(0);
  const immersionRef = useRef(immersionLevel);
  immersionRef.current = immersionLevel;
  const [immersionOpen, setImmersionOpen] = useState(false);

  const [radarBlips, setRadarBlips] = useState<Array<{ id: string; x: number; y: number; type: 'window' | 'object' }>>([]);
  const [radarHeading, setRadarHeading] = useState(0);
  const [flashActive, setFlashActive] = useState(false);

  const [activeEnvIndex, setActiveEnvIndex] = useState(0);
  const activeEnvRef = useRef(activeEnvIndex);
  activeEnvRef.current = activeEnvIndex;

  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);

  const [airPenActive, setAirPenActive] = useState(false);
  const airPenActiveRef = useRef(airPenActive);
  airPenActiveRef.current = airPenActive;
  const [airColor, setAirColor] = useState('#00f5d4');
  const airColorRef = useRef(airColor);
  airColorRef.current = airColor;
  const [airStrokesCount, setAirStrokesCount] = useState(0);
  const airStrokesGroupRef = useRef<THREE.Group | null>(null);
  const activeStrokeRef = useRef<{ line: THREE.Line; points: THREE.Vector3[] } | null>(null);

  const onOpenHomeRef = useRef(onOpenHome);
  onOpenHomeRef.current = onOpenHome;

  cameraActiveRef.current = cameraActive;
  lensFovRef.current = lensFov;

  /* ── scene bootstrap ── */
  useLayoutEffect(() => {
    const glHost = glHostRef.current!;
    const cssHost = cssHostRef.current!;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const camera = new THREE.PerspectiveCamera(60, w / h, 10, 60000);
    cameraRef.current = camera;

    // DOM / CSS3D layer: one scene holding every window as its own object.
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(w, h);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.inset = '0';
    cssRenderer.domElement.style.pointerEvents = 'none';
    cssHost.appendChild(cssRenderer.domElement);

    // WebGL layer: real 3D objects + optional virtual environment.
    const glScene = new THREE.Scene();
    glSceneRef.current = glScene;
    const mobileSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const gl = new THREE.WebGLRenderer({
      antialias: !mobileSafari,
      alpha: true,
      powerPreference: mobileSafari ? 'low-power' : 'high-performance',
    });
    gl.setPixelRatio(Math.min(mobileSafari ? 1.35 : 2, window.devicePixelRatio || 1));
    gl.setSize(w, h);
    gl.setClearColor(0x000000, 0);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.domElement.style.position = 'absolute';
    gl.domElement.style.inset = '0';
    gl.domElement.style.width = '100%';
    gl.domElement.style.height = '100%';
    glHost.appendChild(gl.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.6);
    hemiRef.current = hemi;
    glScene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1500, 4000, 1200);
    glScene.add(sun);

    const onLightingChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ preset: any; brightness: number; multiplier: number }>;
      if (customEvent.detail) {
        const { preset, multiplier } = customEvent.detail;
        hemi.intensity = 1.6 * multiplier;
        sun.intensity = 1.4 * multiplier;
        if (preset?.keyColor) sun.color.setHex(preset.keyColor);
        if (preset?.ambientColor) hemi.color.setHex(preset.ambientColor);
        gl.toneMappingExposure = (preset?.exposure || 1.35) * multiplier;
      }
    };
    window.addEventListener('visionos:lighting-change', onLightingChange);

    // FocusEntity procedural floor reticle
    const focusReticle = createFocusReticleGroup();
    glScene.add(focusReticle);
    focusReticleRef.current = focusReticle;

    // WebAR hand depth occlusion mesh
    const handOcclGroup = createHandOcclusionGroup();
    glScene.add(handOcclGroup);
    handOcclGroupRef.current = handOcclGroup;

    // Virtual environment (with Digital Crown immersion blending).
    const env = new THREE.Group();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(40000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        uniforms: {
          uOpacity: { value: 1.0 },
          uColorTop: { value: CELESTIAL_ENVIRONMENTS[0].top.clone() },
          uColorMid: { value: CELESTIAL_ENVIRONMENTS[0].mid.clone() },
          uColorLow: { value: CELESTIAL_ENVIRONMENTS[0].low.clone() },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform float uOpacity; uniform vec3 uColorTop; uniform vec3 uColorMid; uniform vec3 uColorLow; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(uColorMid, uColorTop, pow(h, 0.6)) : mix(uColorMid, uColorLow, pow(-h, 0.5)); gl_FragColor = vec4(c, uOpacity); }',
      })
    );
    env.add(sky);
    const grid = new THREE.GridHelper(24000, 48, 0x6b7a99, 0x2c3344);
    grid.position.y = -EYE_HEIGHT;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    env.add(grid);

    // Warm fireplace living-room panoramic backdrop (Image 4)
    const roomTexLoader = new THREE.TextureLoader();
    roomTexLoader.load(assetUrl('images/custom_room_bg.png'), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const roomGeo = new THREE.SphereGeometry(12000, 48, 32);
      const roomMat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
      });
      const roomMesh = new THREE.Mesh(roomGeo, roomMat);
      roomMesh.position.set(0, 0, 0);
      env.add(roomMesh);
    });

    glScene.add(env);
    envRef.current = env;

    // 3D Spatial Air Drawing Group
    const airStrokesGroup = new THREE.Group();
    airStrokesGroup.name = 'spatial-air-strokes';
    glScene.add(airStrokesGroup);
    airStrokesGroupRef.current = airStrokesGroup;

    const tracker = trackerRef.current;
    tracker.start();

    // Hands-free gesture listeners (HandyWork / barehands)
    const onGesturePeace = () => onOpenHomeRef.current?.();
    const onGestureThumbsUp = () => recenter();
    window.addEventListener('visionos:gesture-peace', onGesturePeace);
    window.addEventListener('visionos:gesture-thumbsup', onGestureThumbsUp);

    // Hand tracking depth occlusion listener
    const onHandLandmarks = (e: Event) => {
      const custom = e as CustomEvent<{ landmarks: Array<{ x: number; y: number; z: number }> }>;
      const lms = custom.detail?.landmarks;
      if (!lms || lms.length === 0) {
        handOcclGroup.visible = false;
        return;
      }
      handOcclGroup.visible = true;
      const meshes = handOcclGroup.children as THREE.Mesh[];
      lms.forEach((lm, idx) => {
        if (idx < meshes.length) {
          const m = meshes[idx];
          const ndcX = lm.x * 2 - 1;
          const ndcY = -(lm.y * 2 - 1);
          const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
          const dir = v.sub(camera.position).normalize();
          m.position.copy(camera.position).addScaledVector(dir, 380);
          m.visible = true;
        }
      });
    };
    window.addEventListener('visionos:hand-landmarks', onHandLandmarks);

    // Micro-pinch gesture interaction (barehands / pinchplan)
    const onMicroPinch = (e: Event) => {
      const custom = e as CustomEvent<{ isPinching: boolean; cursorX?: number; cursorY?: number }>;
      const pinching = Boolean(custom.detail?.isPinching);
      setIsMicroPinching(pinching);
      if (pinching && lastGazeIdRef.current) {
        const focused = panelsRef.current.get(lastGazeIdRef.current);
        if (focused) {
          const rect = focused.el.getBoundingClientRect();
          const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (target) {
            spatialSound.playPinchTap();
            (target as HTMLElement).click();
          }
        }
      }
    };
    window.addEventListener('visionos:micro-pinch', onMicroPinch);

    const onControlPointer = (e: Event) => {
      const detail = (e as CustomEvent<{ x?: number; y?: number; active?: boolean; source?: string }>).detail;
      if (!Number.isFinite(detail?.x) || !Number.isFinite(detail?.y)) return;
      const handActive = detail.active !== false && detail.source === 'hand';
      if (handControlActiveRef.current !== handActive) {
        handControlActiveRef.current = handActive;
        setHandControlActive(handActive);
      }
      controlPointerRef.current = {
        x: detail.x!,
        y: detail.y!,
        lastSeen: performance.now(),
        active: detail.active !== false,
      };
    };
    window.addEventListener('visionos:control-pointer', onControlPointer);

    const onResize = () => {
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      cssRenderer.setSize(nw, nh);
      gl.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    screen.orientation?.addEventListener?.('change', onResize);

    let raf = 0;
    let frame = 0;
    let lastFov = 0;
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), EYE_HEIGHT);
    const floorHit = new THREE.Vector3();
    const mountTime = performance.now();
    const previousCameraQuaternion = new THREE.Quaternion();
    let lastCameraPoseTime = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      frame += 1;

      // 1) FOV that matches the passthrough video (re-evaluated a few times per second).
      if (frame % 15 === 1) {
        const video = document.querySelector<HTMLVideoElement>('video[data-passthrough-video]');
        const vfov = computeVerticalFov(
          lensFovRef.current,
          window.innerWidth,
          window.innerHeight,
          cameraActiveRef.current ? video?.videoWidth : undefined,
          cameraActiveRef.current ? video?.videoHeight : undefined
        );
        if (Math.abs(vfov - lastFov) > 0.05) {
          lastFov = vfov;
          camera.fov = vfov;
          camera.updateProjectionMatrix();
        }
        env.visible = !cameraActiveRef.current || immersionRef.current > 0.01;
        if (sky.material instanceof THREE.ShaderMaterial && sky.material.uniforms?.uOpacity) {
          sky.material.uniforms.uOpacity.value = cameraActiveRef.current ? immersionRef.current : 1.0;
          const targetEnv = CELESTIAL_ENVIRONMENTS[activeEnvRef.current] || CELESTIAL_ENVIRONMENTS[0];
          sky.material.uniforms.uColorTop.value.lerp(targetEnv.top, 0.08);
          sky.material.uniforms.uColorMid.value.lerp(targetEnv.mid, 0.08);
          sky.material.uniforms.uColorLow.value.lerp(targetEnv.low, 0.08);
        }
      }

      // Safari has no ARKit world-position feed, so use restrained visual parallax for
      // translation and the device sensors for rotation. Rebase during fast turns.
      tracker.getCameraQuaternion(camera.quaternion, now);
      const poseDt = lastCameraPoseTime ? Math.max(0.001, (now - lastCameraPoseTime) / 1000) : 0.016;
      const angularSpeed = previousCameraQuaternion.angleTo(camera.quaternion) / poseDt;
      previousCameraQuaternion.copy(camera.quaternion);
      lastCameraPoseTime = now;
      const is6DoF = trackingModeRef.current === 'slam-6dof';
      if (is6DoF) {
        if (frame % 2 === 0) {
          const video = document.querySelector<HTMLVideoElement>('video[data-passthrough-video]');
          if (cameraActiveRef.current) opticalTrackerRef.current!.update(video, angularSpeed);
          else opticalTrackerRef.current!.reset();
        }
        camera.position.copy(opticalTrackerRef.current!.translation);
      } else {
        opticalTrackerRef.current!.reset();
        camera.position.set(0, 0, 0);
      }
      camera.updateMatrixWorld();
      const cam = cameraYawPitch(camera.quaternion);
      const forward = _v.set(0, 0, -1).applyQuaternion(camera.quaternion).clone();

      // The hand/touch point is the placement target; use view center before input arrives.
      const pointer = controlPointerRef.current;
      const pointerFresh = pointer?.active && now - pointer.lastSeen < 1500;
      let ray: THREE.Ray;
      if (pointerFresh && pointer) {
        const ndc = new THREE.Vector2((pointer.x / window.innerWidth) * 2 - 1, -(pointer.y / window.innerHeight) * 2 + 1);
        raycaster.current.setFromCamera(ndc, camera);
        ray = raycaster.current.ray;
      } else {
        ray = new THREE.Ray(camera.position, forward);
      }
      if (ray.intersectPlane(floorPlane, floorHit) && floorHit.z < -100 && floorHit.length() < 5500) {
        focusReticle.visible = true;
        focusReticle.position.set(floorHit.x, -EYE_HEIGHT + 2, floorHit.z);
        const pulse = 1 + Math.sin(now * 0.006) * 0.05;
        focusReticle.scale.set(pulse, 1, pulse);
        const ticks = focusReticle.getObjectByName('ticks');
        if (ticks) ticks.rotation.z = now * 0.0012;
      } else {
        focusReticle.visible = false;
      }

      // 4) Gaze raycasting on spatial windows (barehands / pinchplan)
      let currentGazeId: string | null = null;
      let minAngDist = Infinity;
      panelsRef.current.forEach((p) => {
        if (p.carry) {
          p.pose.yaw = wrapAngle(cam.yaw + p.carry.dYaw);
          p.pose.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch + p.carry.dPitch));
        }
        // In Vision Pro mode: use heavy spring damping (k=0.12) to absorb hand shake
        const isVp = trackingModeRef.current === 'vision-pro';
        const k = p.carry ? 0.35 : isVp ? 0.12 : 0.22;
        const diffYaw = wrapAngle(p.pose.yaw - p.shown.yaw);
        // Small deadzone threshold (<0.15 deg) prevents micro-jitter when holding still
        if (isVp && Math.abs(diffYaw) < 0.0026 && !p.carry) {
          // Locked in place
        } else {
          p.shown.yaw = wrapAngle(p.shown.yaw + diffYaw * k);
        }
        p.shown.pitch += (p.pose.pitch - p.shown.pitch) * k;
        p.shown.dist += (p.pose.dist - p.shown.dist) * k;
        applyPose(p.obj, p.shown);

        // Hide panels behind the viewer (CSS perspective cannot clip them correctly).
        const dir = p.obj.position.clone().normalize();
        p.obj.visible = dir.dot(forward) > -0.1;

        // Gaze check
        const dYaw = Math.abs(wrapAngle(cam.yaw - p.shown.yaw));
        const dPitch = Math.abs(cam.pitch - p.shown.pitch);
        const halfW = Math.atan((p.width / 2) / p.shown.dist);
        const halfH = Math.atan((p.height / 2) / p.shown.dist);
        if (dYaw <= halfW * 1.05 && dPitch <= halfH * 1.05) {
          const d = Math.hypot(dYaw, dPitch);
          if (d < minAngDist) {
            minAngDist = d;
            currentGazeId = p.id;
          }
        }
      });

      if (currentGazeId !== lastGazeIdRef.current) {
        if (lastGazeIdRef.current) {
          const prevEl = panelsRef.current.get(lastGazeIdRef.current)?.el;
          prevEl?.classList.remove('spatial-gaze-focused');
        }
        if (currentGazeId) {
          const nextEl = panelsRef.current.get(currentGazeId)?.el;
          nextEl?.classList.add('spatial-gaze-focused');
          const rec = panelsRef.current.get(currentGazeId);
          if (rec) {
            spatialSound.playRelativeSpatialSound(rec.shown.yaw, rec.shown.dist, cam.yaw, 'focus');
          }
        }
        lastGazeIdRef.current = currentGazeId;
        setGazeTargetId(currentGazeId);
      }

      // 5) Dynamic Specular Glass Shader updates (Satin shader)
      if (frame % 6 === 0) {
        const sunYaw = 0.38;
        const sunPitch = 0.72;
        const specX = Math.round(Math.sin(cam.yaw - sunYaw) * 45 + 50);
        const specY = Math.round(Math.cos(cam.pitch - sunPitch) * 45 + 50);
        document.documentElement.style.setProperty('--satin-specular-x', `${specX}%`);
        document.documentElement.style.setProperty('--satin-specular-y', `${specY}%`);
      }

      // 6) Object ornaments always face the user (yaw-only billboard).
      objectsRef.current.forEach((o) => {
        const pos = o.group.position;
        o.ornament.position.set(pos.x, pos.y + o.height + 120, pos.z);
        o.ornament.rotation.set(0, Math.atan2(-pos.x, -pos.z) + Math.PI, 0);
        o.ornament.visible = pos.clone().normalize().dot(forward) > 0;
        if (o.troikaText) {
          o.troikaText.rotation.set(0, Math.atan2(-pos.x, -pos.z) + Math.PI - o.group.rotation.y, 0);
        }
      });

      // Networked-AFrame: Multiplayer WebAR Presence Sync
      if (frame % 18 === 0) {
        networkedSync.broadcastPresence({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          yaw: cam.yaw,
          pitch: cam.pitch,
        });
      }

      // 7) Spatial 360° Room Radar Mini-Map updates
      if (frame % 6 === 0) {
        const blips: Array<{ id: string; x: number; y: number; type: 'window' | 'object' }> = [];
        panelsRef.current.forEach((p) => {
          const rel = wrapAngle(p.shown.yaw - cam.yaw);
          const r = Math.min(26, Math.max(6, (p.shown.dist / 2500) * 22));
          blips.push({
            id: p.id,
            x: Math.round(Math.sin(rel) * r),
            y: Math.round(-Math.cos(rel) * r),
            type: 'window',
          });
        });
        objectsRef.current.forEach((o) => {
          const pos = o.group.position;
          const objYaw = Math.atan2(-pos.x, -pos.z);
          const rel = wrapAngle(objYaw - cam.yaw);
          const r = Math.min(26, Math.max(6, (pos.length() / 2500) * 22));
          blips.push({
            id: o.id,
            x: Math.round(Math.sin(rel) * r),
            y: Math.round(-Math.cos(rel) * r),
            type: 'object',
          });
        });
        setRadarBlips(blips);
        const heading = tracker.compassHeading || Math.round(((-cam.yaw / DEG) + 360) % 360);
        setRadarHeading(heading);
      }

      cssRenderer.render(scene, camera);
      if (env.visible || objectsRef.current.size > 0 || focusReticle.visible || handOcclGroup.visible) {
        gl.render(glScene, camera);
      } else {
        gl.clear();
      }

      if (frame % 30 === 0) {
        setSensorState((prev) => {
          const next = tracker.sensorAlive ? 'live' : now - mountTime > 2500 && tracker.samples === 0 ? 'none' : prev;
          return next === prev ? prev : next;
        });
      }
    };
    raf = requestAnimationFrame(tick);
    setMountTick((t) => t + 1);

    // Initial FOV right away so the first window placement uses the real projection.
    camera.fov = computeVerticalFov(lensFovRef.current, w, h);
    camera.updateProjectionMatrix();
    pendingPanelsRef.current.forEach((p, id) => api.current.addPanel(id, p.el, p.width, p.height));
    pendingPanelsRef.current.clear();
    window.setTimeout(() => recenter(), 150);

    return () => {
      cancelAnimationFrame(raf);
      tracker.stop();
      window.removeEventListener('visionos:hand-landmarks', onHandLandmarks);
      window.removeEventListener('visionos:micro-pinch', onMicroPinch);
      window.removeEventListener('visionos:control-pointer', onControlPointer);
      window.removeEventListener('visionos:gesture-peace', onGesturePeace);
      window.removeEventListener('visionos:gesture-thumbsup', onGestureThumbsUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      screen.orientation?.removeEventListener?.('change', onResize);
      disposeThreeObject(focusReticle);
      disposeThreeObject(handOcclGroup);
      disposeThreeObject(airStrokesGroup);
      objectsRef.current.forEach((o) => {
        disposeThreeObject(o.group);
        scene.remove(o.ornament);
      });
      objectsRef.current.clear();
      panelsRef.current.forEach((p) => scene.remove(p.obj));
      panelsRef.current.clear();
      disposeThreeObject(env);
      gl.dispose();
      gl.domElement.remove();
      cssRenderer.domElement.remove();
      sceneRef.current = null;
      glSceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  /* ── ambient light estimation from the camera tints 3D objects ── */
  useEffect(() => {
    if (!hemiRef.current || !ambientRGB) return;
    const { r, g, b } = ambientRGB;
    hemiRef.current.color.setRGB(Math.min(1, (r + 60) / 255), Math.min(1, (g + 60) / 255), Math.min(1, (b + 60) / 255));
  }, [ambientRGB]);

  useEffect(() => {
    localStorage.setItem(LENS_KEY, String(lensFov));
  }, [lensFov]);

  /* ── panel placement (visionOS: new windows open where you are looking) ── */
  const choosePose = useCallback(
    (
      width: number,
      opts?: { gaze?: { yaw: number; pitch: number }; occupiedBy?: Set<string> }
    ): PanelPose => {
    const camera = cameraRef.current;
    const q = camera ? camera.quaternion : new THREE.Quaternion();
    const gaze = opts?.gaze ?? cameraYawPitch(q);
    const vfov = (camera?.fov ?? 60) * DEG;
    const aspect = camera?.aspect ?? window.innerWidth / window.innerHeight;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const targetAngular = Math.min(hfov * 0.86, 46 * DEG);
    const dist = Math.max(MIN_DIST, Math.min(MAX_DIST, width / 2 / Math.tan(targetAngular / 2)));
    const myHalf = Math.atan(width / 2 / dist);

    const others = [...panelsRef.current.values()].filter(
      (p) => !opts?.occupiedBy || opts.occupiedBy.has(p.id)
    );
    const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    for (const step of offsets) {
      const yaw = wrapAngle(gaze.yaw + step * (myHalf * 2 + 6 * DEG));
      const clear = others.every((o) => {
        const oHalf = Math.atan(o.width / 2 / o.pose.dist);
        return Math.abs(wrapAngle(o.pose.yaw - yaw)) > myHalf + oHalf + 2 * DEG;
      });
      if (clear) return { yaw, pitch: Math.max(-0.35, Math.min(0.35, gaze.pitch)) - 2 * DEG, dist };
    }
    return { yaw: gaze.yaw, pitch: gaze.pitch, dist: dist * 0.85 };
    },
    []
  );

  const api = useRef<WorldApi>({
    addPanel: () => undefined,
    removePanel: () => undefined,
    resizePanel: () => undefined,
    beginCarry: () => undefined,
    changeDepth: () => undefined,
  });

  api.current.addPanel = (id, el, width, height) => {
    const scene = sceneRef.current;
    if (!scene) {
      // children mount before the parent's scene bootstrap; queue until it exists
      pendingPanelsRef.current.set(id, { el, width, height });
      return;
    }
    const existing = panelsRef.current.get(id);
    if (existing) scene.remove(existing.obj);
    const obj = new CSS3DObject(el);
    obj.element.style.userSelect = '';
    const pose = existing?.pose ?? choosePose(width);
    // windows "fly in" from slightly further away
    const shown = existing?.shown ?? { ...pose, dist: pose.dist * 1.25 };
    applyPose(obj, shown);
    scene.add(obj);
    panelsRef.current.set(id, { id, el, obj, width, height, pose, shown, carry: null });
  };

  api.current.removePanel = (id) => {
    pendingPanelsRef.current.delete(id);
    const rec = panelsRef.current.get(id);
    if (!rec) return;
    sceneRef.current?.remove(rec.obj);
    panelsRef.current.delete(id);
  };

  api.current.resizePanel = (id, width, height) => {
    const rec = panelsRef.current.get(id);
    if (rec) {
      rec.width = width;
      rec.height = height;
    }
  };

  api.current.changeDepth = (id, factor) => {
    const rec = panelsRef.current.get(id);
    if (!rec) return;
    rec.pose.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, rec.pose.dist * factor));
  };

  api.current.beginCarry = (id, e) => {
    const rec = panelsRef.current.get(id);
    const camera = cameraRef.current;
    if (!rec || !camera) return;
    e.stopPropagation();
    const cam = cameraYawPitch(camera.quaternion);
    rec.carry = {
      pointerId: e.pointerId,
      dYaw: wrapAngle(rec.pose.yaw - cam.yaw),
      dPitch: rec.pose.pitch - cam.pitch,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    spatialSound.playPinchTap();

    const radPerPx = (camera.fov * DEG) / window.innerHeight;
    let snappedLast = false;

    const move = (ev: PointerEvent) => {
      if (!rec.carry || ev.pointerId !== rec.carry.pointerId) return;
      const dx = ev.clientX - rec.carry.lastX;
      const dy = ev.clientY - rec.carry.lastY;
      rec.carry.lastX = ev.clientX;
      rec.carry.lastY = ev.clientY;
      // finger drag fine-tunes; turning the phone carries the window (visionOS grab bar feel)
      const k = radPerPx * (rec.pose.dist > 0 ? 1 : 1);
      rec.carry.dYaw -= dx * k;
      rec.carry.dPitch -= dy * k;

      // Magnetic window snapping (RealityUI)
      const currentYaw = wrapAngle(cam.yaw + rec.carry.dYaw);
      const myHalf = Math.atan((rec.width / 2) / rec.pose.dist);
      let isSnapped = false;

      for (const other of panelsRef.current.values()) {
        if (other.id === rec.id) continue;
        const otherHalf = Math.atan((other.width / 2) / other.pose.dist);
        const idealSpacing = myHalf + otherHalf + 5 * DEG;
        const diff = wrapAngle(currentYaw - other.pose.yaw);
        const sign = Math.sign(diff) || 1;

        if (Math.abs(Math.abs(diff) - idealSpacing) < 3.2 * DEG) {
          const snappedWorldYaw = wrapAngle(other.pose.yaw + sign * idealSpacing);
          rec.carry.dYaw = wrapAngle(snappedWorldYaw - cam.yaw);
          if (Math.abs(rec.pose.pitch - other.pose.pitch) < 3.8 * DEG) {
            rec.carry.dPitch = other.pose.pitch - cam.pitch;
          }
          if (Math.abs(rec.pose.dist - other.pose.dist) < 220) {
            rec.pose.dist = other.pose.dist;
          }
          if (!snappedLast) {
            spatialSound.playSnap();
            snappedLast = true;
          }
          isSnapped = true;
          break;
        }
      }
      if (!isSnapped) {
        snappedLast = false;
      }
    };
    const up = (ev: PointerEvent) => {
      if (rec.carry && ev.pointerId !== rec.carry.pointerId) return;
      rec.carry = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      spatialSound.playAnchorDrop?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /* ── 3D objects ── */
  const placeObject = useCallback(
    (artifactDetail?: { glb?: string; label?: string; scale?: number; dimensions?: string; id?: string; offsetPlacement?: boolean }) => {
      const glScene = glSceneRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!glScene || !scene || !camera) return;

      const gaze = cameraYawPitch(camera.quaternion);
      let pos: THREE.Vector3;

      if (artifactDetail?.offsetPlacement) {
        // Explicitly place in another distinct space to the side of the open window/tab (38° side angle at table/counter height)
        const sideSign = objectsRef.current.size % 2 === 0 ? 1 : -1;
        const offsetAngle = gaze.yaw + sideSign * (38 * DEG);
        pos = new THREE.Vector3(-Math.sin(offsetAngle) * 1450, -EYE_HEIGHT + 320, -Math.cos(offsetAngle) * 1450);
      } else if (focusReticleRef.current?.visible) {
        pos = focusReticleRef.current.position.clone();
        pos.y = Math.max(pos.y, -EYE_HEIGHT + 200);
      } else {
        const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
        const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), EYE_HEIGHT);
        const hit = new THREE.Vector3();
        if (ray.intersectPlane(floor, hit) && Math.hypot(hit.x, hit.z) > 600 && Math.hypot(hit.x, hit.z) < 4000) {
          pos = hit;
          pos.y = Math.max(pos.y, -EYE_HEIGHT + 200);
        } else {
          const sideSign = objectsRef.current.size % 2 === 0 ? 1 : -1;
          const offsetAngle = gaze.yaw + sideSign * (38 * DEG);
          pos = new THREE.Vector3(-Math.sin(offsetAngle) * 1450, -EYE_HEIGHT + 320, -Math.cos(offsetAngle) * 1450);
        }
      }

      // Floor placement ripple
      const rippleGeo = new THREE.RingGeometry(25, 45, 32);
      const rippleMat = new THREE.MeshBasicMaterial({
        color: 0x00f5d4,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ripple = new THREE.Mesh(rippleGeo, rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(pos.x, -EYE_HEIGHT + 3, pos.z);
      glScene.add(ripple);
      const startR = performance.now();
      const animRipple = () => {
        const elapsed = performance.now() - startR;
        if (elapsed > 550) {
          glScene.remove(ripple);
          ripple.geometry.dispose();
          rippleMat.dispose();
          return;
        }
        const p = elapsed / 550;
        ripple.scale.setScalar(1 + p * 12);
        rippleMat.opacity = (1 - p) * 0.95;
        requestAnimationFrame(animRipple);
      };
      animRipple();

      const id = `obj-${Date.now()}`;
      const group = new THREE.Group();
      const itemLabel = artifactDetail?.label || 'Alqami Artifact';
      let ornamentElement: HTMLDivElement | null = null;
      let retryModelLoad: (() => void) | null = null;

      if (artifactDetail?.glb) {
        const loader = new GLTFLoader();
        loader.setDRACOLoader(getDracoLoader());
        retryModelLoad = () => loader.load(
          assetUrl(artifactDetail.glb!),
          (gltf) => {
            if (!group.parent) {
              disposeThreeObject(gltf.scene);
              return;
            }
            const root = gltf.scene;
            if (isPhoneViewport()) downscaleTextures(root, 512);
            const box = new THREE.Box3().setFromObject(root);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const baseScale = (750 * (artifactDetail.scale || 1.0)) / maxDim;
            root.position.sub(center);
            root.position.y += (size.y * baseScale) / 2;
            root.scale.setScalar(baseScale);
            group.add(root);
            const label = ornamentElement?.querySelector<HTMLElement>('[data-span="label"]');
            if (label) label.textContent = itemLabel;
            const retryButton = ornamentElement?.querySelector<HTMLButtonElement>('[data-act="retry"]');
            if (retryButton) retryButton.hidden = true;
          },
          undefined,
          () => {
            if (!group.parent) return;
            const label = ornamentElement?.querySelector<HTMLElement>('[data-span="label"]');
            if (label) label.textContent = `${itemLabel} · model failed to load`;
            const retryButton = ornamentElement?.querySelector<HTMLButtonElement>('[data-act="retry"]');
            if (retryButton) retryButton.hidden = false;
          }
        );
        retryModelLoad();
      } else {
        const model = createLovbackenModel();
        model.scale.setScalar(UNITS_PER_METER);
        group.add(model);
      }

      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1300, 1300),
        new THREE.MeshBasicMaterial({ map: makeBlobShadowTexture(), transparent: true, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 2;
      group.add(shadow);
      group.position.copy(pos);
      group.rotation.y = gaze.yaw;
      group.userData.id = id;
      glScene.add(group);

      // A small floating ornament (visionOS style) owned by the object.
      const el = document.createElement('div');
      el.className = 'world-object-ornament';
      el.innerHTML = `
        <button data-act="scale-down" title="Scale Down">−</button>
        <button data-act="scale-up" title="Scale Up">+</button>
        <button data-act="lift" title="Lift onto Desk">⬆</button>
        <button data-act="lower" title="Lower">⬇</button>
        <button data-act="rotate" aria-label="Rotate">⟲</button>
        <span data-span="label">${itemLabel}</span>
        <button data-act="retry" title="Retry loading this model" hidden>↻</button>
        <button data-act="rdf" title="View RDF Metadata & 3D Detection" style="color: #6ee7b7; font-weight: bold; background: rgba(16, 185, 129, 0.3); border: 1px solid rgba(52, 211, 153, 0.5); border-radius: 9999px; padding: 2px 8px; font-size: 11px; cursor: pointer;">📜 RDF</button>
        <button data-act="remove" aria-label="Remove">✕</button>`;
      ornamentElement = el;
      const ornament = new CSS3DObject(el);
      ornament.scale.setScalar(1.6);
      scene.add(ornament);
      const dragModel = { active: false, x: 0, y: 0 };
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        if ((ev.target as HTMLElement).closest('button')) return;
        dragModel.active = true;
        dragModel.x = ev.clientX;
        dragModel.y = ev.clientY;
        el.setPointerCapture?.(ev.pointerId);
        el.style.cursor = 'grabbing';
      });
      el.addEventListener('pointermove', (ev) => {
        if (!dragModel.active) return;
        ev.stopPropagation();
        const camera = cameraRef.current;
        if (!camera) return;
        const unitsPerPixel = (2 * Math.max(500, camera.position.distanceTo(group.position)) * Math.tan((camera.fov * DEG) / 2)) / window.innerHeight;
        camera.updateMatrixWorld();
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        group.position.addScaledVector(right, (ev.clientX - dragModel.x) * unitsPerPixel);
        group.position.addScaledVector(up, (dragModel.y - ev.clientY) * unitsPerPixel);
        dragModel.x = ev.clientX;
        dragModel.y = ev.clientY;
      });
      const stopModelDrag = (ev: PointerEvent) => {
        dragModel.active = false;
        el.style.cursor = '';
      };
      el.addEventListener('pointerup', stopModelDrag);
      el.addEventListener('pointercancel', stopModelDrag);
      el.addEventListener('click', (ev) => {
        const act = (ev.target as HTMLElement).closest('button')?.dataset.act;
        if (act === 'retry') {
          const label = el.querySelector<HTMLElement>('[data-span="label"]');
          if (label) label.textContent = `${itemLabel} · loading…`;
          const retryButton = el.querySelector<HTMLButtonElement>('[data-act="retry"]');
          if (retryButton) retryButton.hidden = true;
          retryModelLoad?.();
        } else if (act === 'rotate') {
          group.rotation.y += Math.PI / 8;
          spatialSound.playPinchTap();
        } else if (act === 'scale-up') {
          group.scale.multiplyScalar(1.15);
          spatialSound.playPinchTap();
        } else if (act === 'scale-down') {
          group.scale.multiplyScalar(0.85);
          spatialSound.playPinchTap();
        } else if (act === 'lift') {
          group.position.y += 180;
          spatialSound.playPinchTap();
        } else if (act === 'lower') {
          group.position.y = Math.max(-EYE_HEIGHT, group.position.y - 180);
          spatialSound.playPinchTap();
        } else if (act === 'rdf') {
          spatialSound.playPinchTap();
          window.dispatchEvent(
            new CustomEvent('visionos:open-arkit-scanner', {
              detail: { artifactId: artifactDetail?.id },
            })
          );
        } else if (act === 'remove') {
          glScene.remove(group);
          scene.remove(ornament);
          disposeThreeObject(group);
          objectsRef.current.delete(id);
          setObjectCount(objectsRef.current.size);
          spatialSound.playPinchTap();
        }
      });

      // troika-three-text: High-clarity 3D Arabic & English Typography in AR
      const labelParts = itemLabel.split('·');
      const labelAr = labelParts[0]?.trim() || 'مقتنى إسلامي';
      const labelEn = labelParts[1]?.trim() || 'Islamic Heritage Artifact';
      const troikaText = createTroikaSpatialText({
        textAr: labelAr,
        textEn: labelEn,
        fontSize: 28,
      });
      troikaText.position.set(0, 480, 0);
      group.add(troikaText);

      // Networked-AFrame sync
      networkedSync.broadcastObjectUpdate({
        id,
        glb: artifactDetail?.glb,
        label: itemLabel,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: gaze.yaw,
        scale: 1.0,
      });

      objectsRef.current.set(id, { id, group, shadow, ornament, troikaText, height: 451 });
      setObjectCount(objectsRef.current.size);
      spatialSound.playAnchorDrop?.();
    },
    []
  );

  useEffect(() => {
    const onPlace = (e: Event) => {
      const custom = e as CustomEvent<{ glb?: string; label?: string; scale?: number; dimensions?: string; id?: string; offsetPlacement?: boolean }>;
      placeObject(custom.detail);
    };
    window.addEventListener('visionos:place-product', onPlace);
    window.addEventListener('visionos:place-ar-object', onPlace);
    return () => {
      window.removeEventListener('visionos:place-product', onPlace);
      window.removeEventListener('visionos:place-ar-object', onPlace);
    };
  }, [placeObject]);

  const clearObjects = () => {
    objectsRef.current.forEach((o) => {
      glSceneRef.current?.remove(o.group);
      sceneRef.current?.remove(o.ornament);
      disposeThreeObject(o.group);
    });
    objectsRef.current.clear();
    setObjectCount(0);
  };

  /* ── Touch/hand gestures: drag an object, then pinch/twist with a second pointer ── */
  const gestureRef = useRef<null | {
    id: number;
    x: number;
    y: number;
    object?: WorldObjectRecord;
    offset?: THREE.Vector3;
    pointers: Map<number, { x: number; y: number }>;
    pinch?: { distance: number; angle: number; scale: number; rotation: number; midpoint: { x: number; y: number }; offset: THREE.Vector3 };
  }>(null);
  const raycaster = useRef(new THREE.Raycaster());

  const floorPointAt = (clientX: number, clientY: number) => {
    const camera = cameraRef.current!;
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.current.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    const ok = raycaster.current.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), EYE_HEIGHT), hit);
    return ok ? hit : null;
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    const camera = cameraRef.current;
    if (!camera) return;
    controlPointerRef.current = { x: e.clientX, y: e.clientY, lastSeen: performance.now(), active: true };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    // 3D Spatial Air Drawing
    if (airPenActiveRef.current) {
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const startPt = camera.position.clone().addScaledVector(ray.ray.direction, 1250);

      const geo = new THREE.BufferGeometry().setFromPoints([startPt]);
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(airColorRef.current),
        linewidth: 4,
      });
      const line = new THREE.Line(geo, mat);
      airStrokesGroupRef.current?.add(line);
      activeStrokeRef.current = { line, points: [startPt] };
      spatialSound.playDrawStroke?.(520);
      return;
    }

    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.current.setFromCamera(ndc, camera);
    let picked: WorldObjectRecord | undefined;
    let best = Infinity;
    objectsRef.current.forEach((o) => {
      const hits = raycaster.current.intersectObject(o.group, true);
      if (hits[0] && hits[0].distance < best) {
        best = hits[0].distance;
        picked = o;
      }
    });
    let offset: THREE.Vector3 | undefined;
    if (picked) {
      const fp = floorPointAt(e.clientX, e.clientY);
      offset = fp ? picked.group.position.clone().sub(fp) : new THREE.Vector3();
      spatialSound.playPinchTap();
    }
    const active = gestureRef.current;
    if (active && picked && active.object === picked) {
      active.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.pointers.size >= 2) {
        const [a, b] = [...active.pointers.values()];
        active.pinch = {
          distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
          angle: Math.atan2(b.y - a.y, b.x - a.x),
          scale: picked.group.scale.x,
          rotation: picked.group.rotation.y,
          midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          offset: (() => {
            const midpoint = floorPointAt((a.x + b.x) / 2, (a.y + b.y) / 2);
            return midpoint ? picked.group.position.clone().sub(midpoint) : new THREE.Vector3();
          })(),
        };
      }
      return;
    }
    gestureRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      object: picked,
      offset,
      pointers: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]),
    };
  };

  const onBackgroundPointerMove = (e: React.PointerEvent) => {
    const camera = cameraRef.current;
    if (!camera) return;
    controlPointerRef.current = { x: e.clientX, y: e.clientY, lastSeen: performance.now(), active: true };

    // 3D Air Drawing in real room space
    if (airPenActiveRef.current && activeStrokeRef.current) {
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const pt = camera.position.clone().addScaledVector(ray.ray.direction, 1250);
      const pts = activeStrokeRef.current.points;
      if (pts.length === 0 || pts[pts.length - 1].distanceTo(pt) > 14) {
        pts.push(pt);
        activeStrokeRef.current.line.geometry.dispose();
        activeStrokeRef.current.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      }
      return;
    }

    const g = gestureRef.current;
    if (!g) return;
    const point = g.pointers.get(e.pointerId);
    if (!point) return;
    point.x = e.clientX;
    point.y = e.clientY;
    if (g.object && g.pointers.size >= 2 && g.pinch) {
      const [a, b] = [...g.pointers.values()];
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const midpointX = (a.x + b.x) / 2;
      const midpointY = (a.y + b.y) / 2;
      const scale = THREE.MathUtils.clamp(g.pinch.scale * (distance / g.pinch.distance), 0.12, 5);
      g.object.group.scale.setScalar(scale);
      g.object.group.rotation.y = g.pinch.rotation + THREE.MathUtils.euclideanModulo(angle - g.pinch.angle + Math.PI, Math.PI * 2) - Math.PI;
      const floorPoint = floorPointAt(midpointX, midpointY);
      if (floorPoint) {
        const next = floorPoint.add(g.pinch.offset);
        const radius = Math.hypot(next.x, next.z);
        if (radius > 400 && radius < 6000) g.object.group.position.set(next.x, -EYE_HEIGHT, next.z);
      }
      return;
    }
    if (g.id !== e.pointerId) return;
    if (g.object) {
      const fp = floorPointAt(e.clientX, e.clientY);
      if (fp) {
        const next = fp.add(g.offset ?? new THREE.Vector3());
        const r = Math.hypot(next.x, next.z);
        if (r > 400 && r < 6000) g.object.group.position.set(next.x, -EYE_HEIGHT, next.z);
      }
    } else {
      const radPerPx = (camera.fov * DEG) / window.innerHeight;
      trackerRef.current.addLook((e.clientX - g.x) * radPerPx, (e.clientY - g.y) * radPerPx);
    }
    g.x = e.clientX;
    g.y = e.clientY;
  };

  const onBackgroundPointerUp = (e: React.PointerEvent) => {
    if (airPenActiveRef.current && activeStrokeRef.current) {
      activeStrokeRef.current = null;
      setAirStrokesCount((c) => c + 1);
      return;
    }
    const g = gestureRef.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    if (g.id === e.pointerId) {
      const nextId = g.pointers.keys().next().value;
      if (nextId !== undefined) {
        g.id = nextId;
        const next = g.pointers.get(nextId)!;
        g.x = next.x;
        g.y = next.y;
        if (g.object) {
          const fp = floorPointAt(next.x, next.y);
          g.offset = fp ? g.object.group.position.clone().sub(fp) : new THREE.Vector3();
        }
      } else gestureRef.current = null;
    }
    if (g.pointers.size < 2) g.pinch = undefined;
  };

  /* ── 3D Air Drawing actions ── */
  const undoAirStroke = () => {
    const grp = airStrokesGroupRef.current;
    if (!grp || grp.children.length === 0) return;
    const last = grp.children[grp.children.length - 1];
    grp.remove(last);
    disposeThreeObject(last);
    setAirStrokesCount(grp.children.length);
    spatialSound.playPinchTap();
  };

  const clearAirStrokes = () => {
    const grp = airStrokesGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      const c = grp.children[0];
      grp.remove(c);
      disposeThreeObject(c);
    }
    setAirStrokesCount(0);
    spatialSound.playPinchTap();
  };

  /* ── Workspace Layout Presets (Arc, Theater, Matrix) ── */
  const applySpatialLayout = (mode: 'arc' | 'theater' | 'matrix') => {
    spatialSound.playSnap();
    const camera = cameraRef.current;
    const cam = camera ? cameraYawPitch(camera.quaternion) : { yaw: 0, pitch: 0 };
    const allPanels = [...panelsRef.current.values()];
    const count = allPanels.length;
    if (count === 0) return;

    if (mode === 'arc') {
      const totalSpan = Math.min(130 * DEG, count * 34 * DEG);
      const step = count > 1 ? totalSpan / (count - 1) : 0;
      const startYaw = cam.yaw - totalSpan / 2;
      allPanels.forEach((p, idx) => {
        p.pose.yaw = wrapAngle(startYaw + idx * step);
        p.pose.pitch = 0;
        p.pose.dist = 1800;
      });
    } else if (mode === 'theater') {
      const focusedId = lastGazeIdRef.current || allPanels[0].id;
      let side = 0;
      allPanels.forEach((p) => {
        if (p.id === focusedId) {
          p.pose.yaw = cam.yaw;
          p.pose.pitch = cam.pitch;
          p.pose.dist = 1350;
        } else {
          side++;
          const sign = side % 2 === 1 ? 1 : -1;
          const offset = Math.ceil(side / 2) * 36 * DEG;
          p.pose.yaw = wrapAngle(cam.yaw + sign * offset);
          p.pose.pitch = cam.pitch;
          p.pose.dist = 2250;
        }
      });
    } else if (mode === 'matrix') {
      const spacing = 30 * DEG;
      allPanels.forEach((p, idx) => {
        p.pose.yaw = wrapAngle(cam.yaw + (idx - (count - 1) / 2) * spacing);
        p.pose.pitch = 0;
        p.pose.dist = 1950;
      });
    }
    setLayoutMenuOpen(false);
  };

  /* ── HUD actions ── */
  const recenter = () => {
    const camera = cameraRef.current;
    const gazeBefore = camera ? cameraYawPitch(camera.quaternion) : { yaw: 0, pitch: 0 };
    // Make the current heading the world's "front" (yaw 0)…
    trackerRef.current.recenter();
    // …and, like holding the Digital Crown on Vision Pro, re-arrange every window in front
    // of you. The window you were closest to looking at stays in the middle.
    const sorted = [...panelsRef.current.values()].sort(
      (a, b) =>
        Math.abs(wrapAngle(a.pose.yaw - gazeBefore.yaw)) - Math.abs(wrapAngle(b.pose.yaw - gazeBefore.yaw))
    );
    const placed = new Set<string>();
    sorted.forEach((rec) => {
      rec.pose = choosePose(rec.width, { gaze: { yaw: 0, pitch: 0 }, occupiedBy: placed });
      // keep the eased pose continuous in the new heading frame
      rec.shown.yaw = wrapAngle(rec.shown.yaw - gazeBefore.yaw);
      placed.add(rec.id);
    });
    // 3D objects stay glued to the real room: counter-rotate them by the heading change.
    objectsRef.current.forEach((o) => {
      o.group.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -gazeBefore.yaw);
      o.group.rotation.y -= gazeBefore.yaw;
    });
    spatialSound.playPinchTap();
  };

  const enableMotion = () => {
    // must run synchronously in the tap handler on iOS
    void requestMotionPermission().then((ok) => {
      if (ok) {
        trackerRef.current.stop();
        trackerRef.current.start();
        setSensorState('waiting');
      }
    });
  };

  const takeSpatialPhoto = () => {
    spatialSound.playPinchTap();
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 320);

    const video = document.querySelector<HTMLVideoElement>('video[data-passthrough-video]');
    const gl = glHostRef.current?.querySelector('canvas');
    if (!gl) return;
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = window.innerWidth;
      snapCanvas.height = window.innerHeight;
      const sctx = snapCanvas.getContext('2d');
      if (!sctx) return;
      if (video && cameraActiveRef.current && video.readyState >= 2) {
        const scale = Math.max(snapCanvas.width / video.videoWidth, snapCanvas.height / video.videoHeight);
        const sw = video.videoWidth * scale;
        const sh = video.videoHeight * scale;
        sctx.drawImage(video, (snapCanvas.width - sw) / 2, (snapCanvas.height - sh) / 2, sw, sh);
      }
      sctx.drawImage(gl, 0, 0, snapCanvas.width, snapCanvas.height);
      const dataUrl = snapCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `spatial-ar-${Date.now()}.png`;
      a.click();
    } catch {
      // Ignore
    }
  };

  const ctxValue = api.current;

  return (
    <WorldContext.Provider value={ctxValue}>
      <div
        ref={rootRef}
        className="spatial-world-root fixed inset-0 z-20 overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        {/* WebGL objects + gesture catcher (behind the windows) */}
        <div
          ref={glHostRef}
          className="absolute inset-0"
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onPointerCancel={onBackgroundPointerUp}
        />
        {/* CSS3D windows (every window = its own world object) */}
        <div ref={cssHostRef} className="absolute inset-0 pointer-events-none" />

        {/* Apple Vision Pro Central Gaze Reticle (barehands / pinchplan) */}
        <div
          className={`spatial-gaze-reticle pointer-events-none ${
            gazeTargetId ? 'has-target' : ''
          } ${isMicroPinching ? 'is-pinching' : ''} ${handControlActive ? 'opacity-0' : ''}`}
        />

        {!cameraActive && (
          <div className="absolute top-20 left-1/2 z-[54] -translate-x-1/2 rounded-full vision-glass px-3 py-1 text-[10px] text-white/80 pointer-events-none">
            Waiting for Safari camera access…
          </div>
        )}
        <ArRecognitionOverlay state={recognition} cameraActive={cameraActive} />

        {/* Spatial 360° Room Radar Mini-Map (awesome-arkit) */}
        <div
          className="spatial-radar-widget absolute top-3.5 right-4 z-[65] w-20 h-20 rounded-full vision-glass border border-white/25 flex items-center justify-center pointer-events-auto shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          title="Spatial 360° Room Radar: shows positions of all windows & objects"
        >
          <div className="relative w-16 h-16 rounded-full border border-white/20 bg-black/30 overflow-hidden flex items-center justify-center">
            {/* Compass North arrow */}
            <span
              className="absolute text-[8px] font-bold text-amber-300 font-mono"
              style={{
                top: 2,
                left: '50%',
                transform: `translateX(-50%) rotate(${-(radarHeading)}deg)`,
                transformOrigin: '50% 30px',
              }}
            >
              N
            </span>
            {/* Vision FOV cone */}
            <div className="absolute top-1/2 left-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[24px] border-t-cyan-400/25 -translate-x-1/2 -translate-y-full" />
            {/* User dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_#00f5d4] z-10" />
            {/* Window and 3D object blips */}
            {radarBlips.map((blip) => (
              <div
                key={blip.id}
                className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${
                  blip.type === 'window'
                    ? 'w-2 h-1 bg-white/90 shadow-[0_0_4px_#ffffff]'
                    : 'w-1.5 h-1.5 bg-amber-400 shadow-[0_0_4px_#fbbf24]'
                }`}
                style={{
                  left: `calc(50% + ${blip.x}px)`,
                  top: `calc(50% + ${blip.y}px)`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Camera Snapshot Flash Animation */}
        {flashActive && (
          <div className="fixed inset-0 z-[100] bg-white animate-out fade-out duration-300 pointer-events-none" />
        )}

        {/* Head-locked HUD */}
        <div
          className="spatial-world-hud absolute left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 rounded-full vision-ornament px-2 py-1.5 text-white"
          style={{ bottom: 'max(14px, env(safe-area-inset-bottom))' }}
        >
          {onOpenHome && (
            <button
              onClick={() => {
                spatialSound.playPinchTap();
                onOpenHome();
              }}
              className="world-hud-btn"
              title="Open Apps Launcher"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          )}
          <button onClick={recenter} className="world-hud-btn" title="Recenter: bring windows in front of you">
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              spatialSound.playPinchTap();
              const nextMode = trackingMode === 'vision-pro' ? 'slam-6dof' : 'vision-pro';
              setTrackingMode(nextMode);
              localStorage.setItem('spatial-world-tracking-mode', nextMode);
            }}
            className={`world-hud-btn px-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide transition-all ${
              trackingMode === 'vision-pro'
                ? 'bg-amber-400/35 text-amber-100 border border-amber-300/50 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                : 'bg-cyan-500/35 text-cyan-100 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,245,212,0.5)]'
            }`}
            title="Switch Mode: Vision Pro Heavy Glass vs 6DoF Physical Room Tracking"
          >
            <span>{trackingMode === 'vision-pro' ? '🥽 Vision Pro Solid' : '🌐 6DoF Room Track'}</span>
          </button>
          {onToggleHandTracking && (
            <button
              onClick={() => {
                spatialSound.playPinchTap();
                onToggleHandTracking();
              }}
              className={`world-hud-btn ${
                handTrackingActive
                  ? 'bg-emerald-500/40 text-emerald-300 ring-1 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                  : 'hover:bg-white/15'
              }`}
              title="Hand Tracking Pinch & Drag Gestures"
            >
              <Hand className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => placeObject()} className="world-hud-btn" title="Place a 3D object on the floor where you look">
            <Box className="h-4 w-4" />
          </button>
          {objectCount > 0 && (
            <button onClick={clearObjects} className="world-hud-btn" title="Remove all 3D objects">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => {
              spatialSound.playPinchTap();
              setAirPenActive((p) => !p);
            }}
            className={`world-hud-btn ${
              airPenActive
                ? 'bg-cyan-500/40 text-cyan-300 ring-1 ring-cyan-400 shadow-[0_0_12px_rgba(0,245,212,0.6)]'
                : 'hover:bg-white/15'
            }`}
            title="3D Spatial Air Pen: Draw neon light ribbons in physical air"
          >
            <PenTool className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              spatialSound.playPinchTap();
              setLayoutMenuOpen((o) => !o);
              setImmersionOpen(false);
              setCalibrateOpen(false);
            }}
            className={`world-hud-btn ${layoutMenuOpen ? 'bg-purple-500/40 text-purple-300 ring-1 ring-purple-400' : 'hover:bg-white/15'}`}
            title="Window Layout Presets (180° Arc, Theater Focus, Matrix Wall)"
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              spatialSound.playPinchTap();
              setImmersionOpen((o) => !o);
              setCalibrateOpen(false);
            }}
            className={`world-hud-btn ${immersionLevel > 0 ? 'bg-indigo-500/40 text-indigo-300 ring-1 ring-indigo-400' : 'hover:bg-white/15'}`}
            title="Digital Crown: Environment Immersion Blender"
          >
            <Mountain className="h-4 w-4" />
          </button>
          <button
            onClick={takeSpatialPhoto}
            className="world-hud-btn hover:bg-white/15"
            title="Spatial Photo Snapshot"
          >
            <Camera className="h-4 w-4" />
          </button>
          <button onClick={() => {
            setCalibrateOpen((o) => !o);
            setImmersionOpen(false);
          }} className="world-hud-btn" title="Calibrate lens FOV">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <span
            className={`mx-1 flex items-center gap-1 text-[10px] font-semibold ${
              sensorState === 'live' ? 'text-emerald-300' : 'text-amber-200'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            {sensorState === 'live' ? 'World locked' : sensorState === 'none' ? 'Drag to look' : 'Starting…'}
          </span>
          <button onClick={onExit} className="world-hud-btn" title="Exit Spatial World">
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {sensorState === 'none' && 'ontouchstart' in window && (
          <button
            onClick={enableMotion}
            className="absolute left-1/2 top-[22%] z-[61] -translate-x-1/2 rounded-full vision-ornament px-4 py-2 text-xs font-semibold text-white"
          >
            Tap to enable motion tracking
          </button>
        )}

        {/* 3D Spatial Air Pen Floating Palette */}
        {airPenActive && (
          <div
            className="absolute left-1/2 z-[61] -translate-x-1/2 rounded-full vision-glass px-3.5 py-1.5 flex items-center gap-2 border border-cyan-400/50 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            style={{ bottom: 'calc(max(14px, env(safe-area-inset-bottom)) + 56px)' }}
          >
            <div className="flex items-center gap-1.5">
              {['#00f5d4', '#ff007f', '#fbbf24', '#ffffff', '#a855f7'].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setAirColor(c);
                  }}
                  className={`w-5 h-5 rounded-full transition-transform ${airColor === c ? 'scale-125 ring-2 ring-white shadow-md' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="w-[1px] h-4 bg-white/20 mx-0.5" />
            <button
              onClick={undoAirStroke}
              disabled={airStrokesCount === 0}
              className={`p-1.5 rounded-full hover:bg-white/20 ${airStrokesCount === 0 ? 'opacity-40 cursor-not-allowed' : 'text-white'}`}
              title="Undo Stroke"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={clearAirStrokes}
              disabled={airStrokesCount === 0}
              className={`p-1.5 rounded-full hover:bg-white/20 ${airStrokesCount === 0 ? 'opacity-40 cursor-not-allowed' : 'text-rose-300'}`}
              title="Clear All Strokes"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Window Layout Presets Popover */}
        {layoutMenuOpen && (
          <div
            className="absolute left-1/2 z-[61] w-[min(300px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl vision-glass p-3 text-xs text-white"
            style={{ bottom: 'calc(max(14px, env(safe-area-inset-bottom)) + 56px)' }}
          >
            <div className="font-semibold mb-2 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-purple-300" />
              <span>Spatial Window Layouts</span>
            </div>
            <div className="space-y-1.5">
              <button
                onClick={() => applySpatialLayout('arc')}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-white/10 hover:bg-white/20 text-left transition-colors"
              >
                <span>180° Panoramic Arc</span>
                <span className="text-[10px] text-white/60">Surround</span>
              </button>
              <button
                onClick={() => applySpatialLayout('theater')}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-white/10 hover:bg-white/20 text-left transition-colors"
              >
                <span>Theater Focus</span>
                <span className="text-[10px] text-white/60">Front & Center</span>
              </button>
              <button
                onClick={() => applySpatialLayout('matrix')}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-white/10 hover:bg-white/20 text-left transition-colors"
              >
                <span>Multitasking Matrix</span>
                <span className="text-[10px] text-white/60">Side-by-Side</span>
              </button>
            </div>
          </div>
        )}

        {/* Digital Crown Immersion Environment Blender Popover */}
        {immersionOpen && (
          <div
            className="absolute left-1/2 z-[61] w-[min(320px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl vision-glass p-3 text-xs text-white"
            style={{ bottom: 'calc(max(14px, env(safe-area-inset-bottom)) + 56px)' }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold flex items-center gap-1.5">
                <Mountain className="h-3.5 w-3.5 text-indigo-300" />
                Environment Immersion
              </span>
              <span className="font-mono">{Math.round(immersionLevel * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={immersionLevel}
              onChange={(e) => setImmersionLevel(Number(e.target.value))}
              className="w-full"
            />
            {/* Celestial Environments selector tiles */}
            <div className="grid grid-cols-2 gap-1.5 my-2.5">
              {CELESTIAL_ENVIRONMENTS.map((cEnv, idx) => (
                <button
                  key={cEnv.id}
                  onClick={() => {
                    spatialSound.playPinchTap();
                    setActiveEnvIndex(idx);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-xl text-left transition-all ${
                    activeEnvIndex === idx
                      ? 'bg-indigo-500/40 border border-indigo-400 text-white font-semibold shadow-md'
                      : 'bg-white/10 hover:bg-white/15 border border-white/10 text-white/80'
                  }`}
                >
                  <span className="text-base">{cEnv.icon}</span>
                  <span className="text-[11px] leading-tight">{cEnv.name}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-white/70">
              Turn the immersion dial to blend from your physical room passthrough into deep celestial space.
            </p>
          </div>
        )}

        {calibrateOpen && (
          <div
            className="absolute left-1/2 z-[61] w-[min(320px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl vision-glass p-3 text-xs text-white"
            style={{ bottom: 'calc(max(14px, env(safe-area-inset-bottom)) + 56px)' }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">Lens field of view</span>
              <span className="font-mono">{lensFov.toFixed(0)}°</span>
            </div>
            <input
              type="range"
              min={45}
              max={110}
              step={1}
              value={lensFov}
              onChange={(e) => setLensFov(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-white/70">
              Turn the phone left/right: if windows slide against the room, adjust until they stay glued. iPhone 1× ≈ 69°.
            </p>
            <button
              onClick={recenter}
              className="mt-2 flex items-center gap-1 rounded-full bg-white/15 px-3 py-1"
            >
              <RotateCcw className="h-3 w-3" /> Reset heading
            </button>
          </div>
        )}

        {hud}
      </div>
      {children}
    </WorldContext.Provider>
  );
};

/* ─────────────────────────── WorldPanel ─────────────────────────── */

interface WorldPanelProps {
  id: string;
  width: number;
  height: number;
  children: React.ReactNode;
}

/** Renders its children as an independent, world-anchored object inside <SpatialWorld>. */
export const WorldPanel: React.FC<WorldPanelProps> = ({ id, width, height, children }) => {
  const world = useContext(WorldContext);
  const [el] = useState(() => {
    const d = document.createElement('div');
    d.className = 'world-panel';
    return d;
  });

  useLayoutEffect(() => {
    if (!world) return;
    world.addPanel(id, el, width, height);
    return () => world.removePanel(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, id, el]);

  useEffect(() => {
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    world?.resizePanel(id, width, height);
  }, [el, id, width, height, world]);

  return createPortal(children, el);
};

/* ─────────────────────────── Lazy-loadable stage ─────────────────────────── */

export interface SpatialWorldPanelControls {
  onWorldGrab: (e: React.PointerEvent) => void;
  onWorldDepth: (factor: number) => void;
}

interface PanelSlotProps {
  id: string;
  width: number;
  height: number;
  render: (controls: SpatialWorldPanelControls) => React.ReactNode;
}

const PanelSlot: React.FC<PanelSlotProps> = ({ id, width, height, render }) => {
  const world = useContext(WorldContext);
  const controls: SpatialWorldPanelControls = {
    onWorldGrab: (e) => world?.beginCarry(id, e),
    onWorldDepth: (f) => world?.changeDepth(id, f),
  };
  return (
    <WorldPanel id={id} width={width} height={height}>
      {render(controls)}
    </WorldPanel>
  );
};

export interface SpatialWorldStageProps extends Omit<SpatialWorldProps, 'children'> {
  panels: Array<{ id: string; width: number; height: number }>;
  renderPanel: (id: string, controls: SpatialWorldPanelControls) => React.ReactNode;
}

export default function SpatialWorldStage({ panels, renderPanel, ...rest }: SpatialWorldStageProps) {
  return (
    <SpatialWorld {...rest}>
      {panels.map((p) => (
        <PanelSlot
          key={p.id}
          id={p.id}
          width={p.width}
          height={p.height}
          render={(controls) => renderPanel(p.id, controls)}
        />
      ))}
    </SpatialWorld>
  );
}
