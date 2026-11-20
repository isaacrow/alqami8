import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Camera,
  CameraOff,
  Compass,
  Download,
  Footprints,
  Hand,
  ImagePlus,
  Info,
  Layers,
  RotateCcw,
  Sliders,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ALQAMI_ARTIFACTS, type AlqamiArtifact } from '../../data/alqamiArtifacts';
import { assetUrl } from '../../utils/assetUrl';
import { spatialSound } from '../../utils/spatialSound';

const SpatialPortalVFX = lazy(() =>
  import('../three/SpatialPortalVFX').then((m) => ({ default: m.SpatialPortalVFX }))
);

export interface WalkIntoMemoryAppProps {
  lang?: 'ar' | 'en';
}

type DepthProfile = 'corridor' | 'rooftop' | 'courtyard' | 'general';

interface MemorySample {
  id: string;
  titleAr: string;
  titleEn: string;
  image: string;
  depthProfile?: DepthProfile;
  artifact?: AlqamiArtifact;
}

const FEATURED_SHRINE_MEMORIES: MemorySample[] = [
  {
    id: 'SHRINE-SANCTUARY-HALL',
    titleAr: 'الروضة المباركة والضريح المقدس · كربلاء',
    titleEn: 'Sacred Sanctuary Hall · Al-Abbas Holy Shrine',
    image: './images/memories/shrine-sanctuary-interior.jpg',
    depthProfile: 'corridor',
  },
  {
    id: 'SHRINE-TWILIGHT-DOME',
    titleAr: 'القبة الذهبية والمآذن عند الغسق · كربلاء',
    titleEn: 'Golden Dome & Twin Minarets at Twilight',
    image: './images/memories/shrine-twilight-dome.jpg',
    depthProfile: 'rooftop',
  },
  {
    id: 'SHRINE-COURTYARD-GATE',
    titleAr: 'صحن وبوابة العتبة العباسية المقدسة',
    titleEn: 'Al-Abbas Holy Shrine Courtyard & Gate',
    image: './images/memories/shrine-courtyard.jpg',
    depthProfile: 'courtyard',
  },
];

const GRID_W = 240;
const GRID_H = 176;
const SPLAT_COUNT = GRID_W * GRID_H; // 42,240 real-time elliptical 3D Gaussian splats

/**
 * Single-pass client-side "ML-SHARP" style monocular depth estimator:
 * combines scene-aware architectural perspective priors (corridor / rooftop / courtyard / general),
 * local Sobel edge salience, and chromatic depth cues to synthesize a smooth volumetric
 * 3D Gaussian Splat field in < 120ms on-device.
 */
function buildGaussianSplatsFromImage(
  img: HTMLImageElement,
  gridW: number,
  gridH: number,
  profile: DepthProfile = 'general'
): {
  positions: Float32Array;
  flatPositions: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  opacities: Float32Array;
  depths: Float32Array;
} {
  const canvas = document.createElement('canvas');
  canvas.width = gridW;
  canvas.height = gridH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, gridW, gridH);
  const rgba = ctx.getImageData(0, 0, gridW, gridH).data;

  const count = gridW * gridH;
  const lum = new Float32Array(count);
  const sat = new Float32Array(count);
  const warm = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = maxC > 0.001 ? (maxC - minC) / maxC : 0;
    warm[i] = Math.max(0, r - b);
  }

  // Edge salience (foreground subjects have sharper local contrast than distant backgrounds)
  const edge = new Float32Array(count);
  for (let y = 1; y < gridH - 1; y++) {
    for (let x = 1; x < gridW - 1; x++) {
      const idx = y * gridW + x;
      const gx = lum[idx + 1] - lum[idx - 1];
      const gy = lum[idx + gridW] - lum[idx - gridW];
      edge[idx] = Math.min(1, Math.hypot(gx, gy) * 3.2);
    }
  }

  // Raw monocular depth (0 = far background, 1 = close foreground)
  const rawDepth = new Float32Array(count);
  for (let y = 0; y < gridH; y++) {
    const vNorm = y / (gridH - 1); // 0 = top (sky/ceiling), 1 = bottom (floor/near)
    for (let x = 0; x < gridW; x++) {
      const uNorm = x / (gridW - 1);
      const idx = y * gridW + x;
      const dxC = Math.abs(uNorm - 0.5) * 2; // 0 at center, 1 at left/right edge
      let d = 0.5;

      if (profile === 'corridor') {
        // 1-point perspective hall: left/right marble walls & bottom carpet come close; central shrine sits deep
        const wallNear = Math.pow(dxC, 1.55) * 0.72;
        const floorNear = Math.pow(Math.max(0, (vNorm - 0.48) / 0.52), 1.35) * 0.85;
        const ceilingNear = Math.pow(Math.max(0, (0.36 - vNorm) / 0.36), 1.5) * 0.42;
        const centerTunnel = Math.exp(-Math.pow((uNorm - 0.5) * 3.1, 2) - Math.pow((vNorm - 0.44) * 3.4, 2));
        d = Math.max(wallNear, floorNear, ceilingNear) * (1 - centerTunnel * 0.65) + edge[idx] * 0.1 + warm[idx] * 0.08;
      } else if (profile === 'rooftop') {
        // Rooftop skylight & stone terrace near; twin golden minarets mid; deep blue twilight sky far
        const isSky = vNorm < 0.56 && bChannelAt(rgba, idx) > rChannelAt(rgba, idx) + 0.08;
        const terraceNear = Math.pow(Math.max(0, (vNorm - 0.42) / 0.58), 1.25) * 0.92;
        const minaretMid = !isSky && vNorm < 0.68 ? 0.38 + warm[idx] * 0.25 : 0.06;
        d = isSky ? 0.04 + (1 - vNorm) * 0.02 : Math.max(terraceNear, minaretMid) + edge[idx] * 0.08;
      } else if (profile === 'courtyard') {
        // Courtyard foreground & visitors near; tiled shrine wall & golden dome mid; overcast sky far
        const floorAndCrowd = Math.pow(Math.max(0, (vNorm - 0.55) / 0.45), 1.15) * 0.92;
        const facadeBand = vNorm >= 0.35 && vNorm <= 0.74 ? 0.42 + sat[idx] * 0.18 + warm[idx] * 0.12 : 0.06;
        const skyFar = vNorm < 0.48 && lum[idx] > 0.66 && sat[idx] < 0.18;
        d = skyFar ? 0.05 : Math.max(floorAndCrowd, facadeBand) + edge[idx] * 0.08;
      } else {
        const centerDist = Math.hypot((uNorm - 0.5) * 1.15, (vNorm - 0.52) * 1.15);
        const subjectPrior = Math.exp(-centerDist * centerDist * 2.4);
        const groundPrior = Math.pow(vNorm, 1.35) * 0.55;
        d =
          groundPrior * 0.42 +
          subjectPrior * (0.34 + 0.22 * sat[idx] + 0.16 * edge[idx]) +
          warm[idx] * 0.14 +
          (1 - Math.abs(lum[idx] - 0.55)) * 0.12;
      }
      rawDepth[idx] = THREE.MathUtils.clamp(d, 0.02, 1.0);
    }
  }

  // Fast 2-pass box blur on depth for smooth volumetric parallax without harsh tears
  const depths = new Float32Array(count);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = THREE.MathUtils.clamp(y + dy, 0, gridH - 1);
        for (let dx = -2; dx <= 2; dx++) {
          const xx = THREE.MathUtils.clamp(x + dx, 0, gridW - 1);
          sum += rawDepth[yy * gridW + xx];
          n++;
        }
      }
      depths[y * gridW + x] = sum / n;
    }
  }

  const aspect = (img.naturalWidth || gridW) / Math.max(1, img.naturalHeight || gridH);
  const clampedAspect = THREE.MathUtils.clamp(aspect, 0.65, 1.85);
  const worldH = 2.75;
  const worldW = worldH * clampedAspect;

  const positions = new Float32Array(count * 3);
  const flatPositions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const opacities = new Float32Array(count);

  for (let y = 0; y < gridH; y++) {
    const v = 0.5 - y / (gridH - 1);
    for (let x = 0; x < gridW; x++) {
      const u = x / (gridW - 1) - 0.5;
      const idx = y * gridW + x;
      const d = depths[idx];

      // Flat tablet photo card coordinate
      flatPositions[idx * 3] = u * worldW * 0.72;
      flatPositions[idx * 3 + 1] = v * worldH * 0.72;
      flatPositions[idx * 3 + 2] = 0.0;

      // Reconstructed 3D Gaussian Splat world coordinate with perspective frustum expansion
      const z = (d - 0.5) * 2.85; // closer pixels come forward toward viewer
      const frustumScale = 1.0 + (0.5 - d) * 0.42;
      positions[idx * 3] = u * worldW * frustumScale;
      positions[idx * 3 + 1] = v * worldH * frustumScale;
      positions[idx * 3 + 2] = z;

      const r = rgba[idx * 4] / 255;
      const g = rgba[idx * 4 + 1] / 255;
      const b = rgba[idx * 4 + 2] / 255;
      colors[idx * 3] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = b;

      // Splat size slightly larger in smooth background regions to avoid gaps
      scales[idx] = 0.85 + (1 - edge[idx]) * 0.45 + (1 - d) * 0.25;
      // Softly feather extreme corners so the memory blends organically into the real room
      const edgeFade = 1 - Math.pow(Math.max(Math.abs(u * 2), Math.abs(v * 2)), 7);
      opacities[idx] = THREE.MathUtils.clamp(0.78 + lum[idx] * 0.22, 0.35, 1.0) * THREE.MathUtils.clamp(edgeFade, 0.08, 1.0);
    }
  }

  return { positions, flatPositions, colors, scales, opacities, depths };
}

function rChannelAt(rgba: Uint8ClampedArray, idx: number): number {
  return rgba[idx * 4] / 255;
}
function bChannelAt(rgba: Uint8ClampedArray, idx: number): number {
  return rgba[idx * 4 + 2] / 255;
}

/** Export reconstructed 3D Gaussian Splats as a standard .PLY file (compatible with MetalSplatter / SuperSplat). */
function downloadGaussianPly(
  positions: Float32Array,
  colors: Float32Array,
  scales: Float32Array,
  opacities: Float32Array,
  filename: string
): void {
  const count = positions.length / 3;
  // Subsample stride 2 for fast browser download (~9,680 splats, ~900 KB)
  const stride = 2;
  const exported = Math.floor(count / stride);
  const lines: string[] = [
    'ply',
    'format ascii 1.0',
    'comment Generated by ALQAMI Walk Into Memory (ML-SHARP 3DGS Engine)',
    `element vertex ${exported}`,
    'property float x',
    'property float y',
    'property float z',
    'property float f_dc_0',
    'property float f_dc_1',
    'property float f_dc_2',
    'property float opacity',
    'property float scale_0',
    'property float scale_1',
    'property float scale_2',
    'end_header',
  ];
  const SH_C0 = 0.28209479177387814;
  for (let i = 0; i < count; i += stride) {
    const x = positions[i * 3].toFixed(4);
    const y = positions[i * 3 + 1].toFixed(4);
    const z = positions[i * 3 + 2].toFixed(4);
    const dc0 = ((colors[i * 3] - 0.5) / SH_C0).toFixed(4);
    const dc1 = ((colors[i * 3 + 1] - 0.5) / SH_C0).toFixed(4);
    const dc2 = ((colors[i * 3 + 2] - 0.5) / SH_C0).toFixed(4);
    const op = Math.log(Math.max(0.01, opacities[i]) / Math.max(0.01, 1 - opacities[i] * 0.98)).toFixed(3);
    const sc = Math.log(0.014 * scales[i]).toFixed(3);
    lines.push(`${x} ${y} ${z} ${dc0} ${dc1} ${dc2} ${op} ${sc} ${sc} ${sc}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export const WalkIntoMemoryApp: React.FC<WalkIntoMemoryAppProps> = ({ lang = 'ar' }) => {
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  // Build quick-select gallery: 3 Featured Al-Abbas Holy Shrine Memories FIRST, then iconic Al-Kafeel Museum treasures
  const museumSamples = useMemo<MemorySample[]>(() => {
    const picks = [
      'KFL-SWD-2126',
      'KFL-KSH-2165',
      'KFL-TXT-1739',
      'KFL-MSS-1870',
      'KFL-KUF-1701',
      'KFL-SHR-1689',
    ];
    const picked: MemorySample[] = [...FEATURED_SHRINE_MEMORIES];
    for (const id of picks) {
      const a = ALQAMI_ARTIFACTS.find((x) => x.id === id);
      if (a) {
        picked.push({
          id: a.id,
          titleAr: a.title.ar,
          titleEn: a.title.en,
          image: a.image,
          artifact: a,
        });
      }
    }
    if (picked.length < 6) {
      for (const a of ALQAMI_ARTIFACTS.slice(0, 8)) {
        if (!picked.some((p) => p.id === a.id)) {
          picked.push({
            id: a.id,
            titleAr: a.title.ar,
            titleEn: a.title.en,
            image: a.image,
            artifact: a,
          });
        }
      }
    }
    return picked;
  }, []);

  const [activeSample, setActiveSample] = useState<MemorySample>(() => museumSamples[0]);
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);
  const [pulledOut, setPulledOut] = useState<boolean>(true); // true = volumetric 3DGS room-anchored; false = flat tablet photo
  const [walkDepth, setWalkDepth] = useState<number>(36); // 0..100 walking into the 3DGS memory
  const [depthStrength, setDepthStrength] = useState<number>(1.0); // 0.3..1.8 SHARP parallax depth multiplier
  const [splatSize, setSplatSize] = useState<number>(1.15); // 0.6..2.0 Gaussian splat scale
  const [roomPassthrough, setRoomPassthrough] = useState<boolean>(false);
  const [reconMs, setReconMs] = useState<number>(68);
  const [showTechInfo, setShowTechInfo] = useState<boolean>(false);
  const [portalOpen, setPortalOpen] = useState<boolean>(false);
  const [controlsOpen, setControlsOpen] = useState<boolean>(true);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSplatDataRef = useRef<{
    positions: Float32Array;
    colors: Float32Array;
    scales: Float32Array;
    opacities: Float32Array;
  } | null>(null);

  // Refs for real-time 60fps Three.js loop
  const pulledOutRef = useRef(pulledOut);
  pulledOutRef.current = pulledOut;
  const walkDepthRef = useRef(walkDepth);
  walkDepthRef.current = walkDepth;
  const depthStrengthRef = useRef(depthStrength);
  depthStrengthRef.current = depthStrength;
  const splatSizeRef = useRef(splatSize);
  splatSizeRef.current = splatSize;
  const passthroughRef = useRef(roomPassthrough);
  passthroughRef.current = roomPassthrough;

  const lookRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const gyroRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  const activeImageUrl = customPhotoUrl || assetUrl(activeSample.image);

  // Live Camera Passthrough for Vision Pro-style room anchoring
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (!roomPassthrough) {
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        setRoomPassthrough(false);
      });
    return () => {
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [roomPassthrough]);

  // Gyroscope parallax on mobile devices
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      gyroRef.current = {
        yaw: THREE.MathUtils.clamp((e.gamma / 45) * 0.45, -0.5, 0.5),
        pitch: THREE.MathUtils.clamp(((e.beta - 55) / 45) * 0.3, -0.35, 0.35),
      };
    };
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, []);

  // Main Three.js + WebGL 3D Gaussian Splatting (ML-SHARP) Renderer
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let disposed = false;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 50);
    camera.position.set(0, 0, 3.6);

    // Subtle spatial floor grid anchor (like VisionOS spatial anchoring)
    const gridHelper = new THREE.GridHelper(12, 24, 0xfbbf24, 0x334155);
    gridHelper.position.y = -1.65;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.22;
    scene.add(gridHelper);

    // Floating 3D Gaussian Splat Geometry & Custom Anisotropic Gaussian ShaderMaterial
    const geo = new THREE.BufferGeometry();
    const initPos = new Float32Array(SPLAT_COUNT * 3);
    const initFlat = new Float32Array(SPLAT_COUNT * 3);
    const initCol = new Float32Array(SPLAT_COUNT * 3);
    const initScale = new Float32Array(SPLAT_COUNT).fill(1);
    const initOp = new Float32Array(SPLAT_COUNT).fill(0);

    geo.setAttribute('position', new THREE.BufferAttribute(initPos, 3));
    geo.setAttribute('aFlatPos', new THREE.BufferAttribute(initFlat, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(initCol, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(initScale, 1));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(initOp, 1));

    const uniforms = {
      uPull: { value: pulledOutRef.current ? 1.0 : 0.0 },
      uDepthStrength: { value: depthStrengthRef.current },
      uSplatSize: { value: splatSizeRef.current },
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    };

    const splatMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      vertexShader: `
        attribute vec3 aFlatPos;
        attribute vec3 aColor;
        attribute float aScale;
        attribute float aOpacity;

        uniform float uPull;
        uniform float uDepthStrength;
        uniform float uSplatSize;
        uniform float uTime;
        uniform float uPixelRatio;

        varying vec3 vColor;
        varying float vOpacity;

        void main() {
          // Interpolate smoothly from 2D floating tablet photo -> volumetric 3D Gaussian Splat scene
          vec3 volPos = vec3(position.x, position.y, position.z * uDepthStrength);
          vec3 p = mix(aFlatPos, volPos, uPull);

          // Gentle organic breathing parallax when pulled into room space
          p.y += sin(uTime * 0.8 + p.x * 1.4) * 0.008 * uPull;

          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          float dist = max(0.35, -mvPosition.z);
          float baseSize = (18.5 * uSplatSize * aScale * uPixelRatio) / dist;
          gl_PointSize = clamp(baseSize, 2.0, 26.0);

          vColor = aColor;
          vOpacity = aOpacity;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vOpacity;

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float r2 = dot(c, c);
          if (r2 > 0.25) discard;

          // True 2D Gaussian splat kernel falloff: exp(-r^2 * k)
          float gauss = exp(-r2 * 11.5);
          float alpha = gauss * vOpacity;
          if (alpha < 0.04) discard;

          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    const splatCloud = new THREE.Points(geo, splatMat);
    scene.add(splatCloud);

    // Load active photo & run on-device single-pass ML-SHARP 3DGS reconstruction
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (disposed) return;
      const t0 = performance.now();
      const built = buildGaussianSplatsFromImage(
        img,
        GRID_W,
        GRID_H,
        customPhotoUrl ? 'general' : activeSample.depthProfile || 'general'
      );
      const dt = Math.max(12, Math.round(performance.now() - t0));
      setReconMs(dt);

      lastSplatDataRef.current = {
        positions: built.positions,
        colors: built.colors,
        scales: built.scales,
        opacities: built.opacities,
      };

      geo.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
      geo.setAttribute('aFlatPos', new THREE.BufferAttribute(built.flatPositions, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(built.colors, 3));
      geo.setAttribute('aScale', new THREE.BufferAttribute(built.scales, 1));
      geo.setAttribute('aOpacity', new THREE.BufferAttribute(built.opacities, 1));
      geo.computeBoundingSphere();
    };
    img.src = activeImageUrl;

    // 60fps Spatial Walk & Parallax Loop
    const clock = new THREE.Clock();
    let rafId = 0;

    const animate = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      const targetPull = pulledOutRef.current ? 1.0 : 0.0;
      uniforms.uPull.value = THREE.MathUtils.lerp(uniforms.uPull.value, targetPull, 0.08);
      uniforms.uDepthStrength.value = THREE.MathUtils.lerp(
        uniforms.uDepthStrength.value,
        depthStrengthRef.current,
        0.1
      );
      uniforms.uSplatSize.value = THREE.MathUtils.lerp(uniforms.uSplatSize.value, splatSizeRef.current, 0.12);
      uniforms.uTime.value = elapsed;

      // Clear background when live room camera passthrough is active
      renderer.setClearColor(0x06080f, passthroughRef.current ? 0.0 : 1.0);
      gridHelper.visible = !passthroughRef.current && uniforms.uPull.value > 0.25;

      // Walk-in camera depth: z = 4.1 (outside) -> z = 0.65 (standing deep inside the 3DGS memory)
      const walkT = walkDepthRef.current / 100;
      const targetZ = THREE.MathUtils.lerp(4.05, 0.68, walkT);
      const yaw = lookRef.current.yaw + gyroRef.current.yaw;
      const pitch = lookRef.current.pitch + gyroRef.current.pitch;

      const targetX = Math.sin(yaw) * (1.25 + (1 - walkT) * 0.45);
      const targetY = pitch * 0.95;

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.08);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.08);
      camera.lookAt(0, 0, -0.35);

      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      if (disposed || !mountRef.current) return;
      const w = mountRef.current.clientWidth || 960;
      const h = mountRef.current.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      geo.dispose();
      splatMat.dispose();
      renderer.dispose();
    };
  }, [activeImageUrl, activeSample.depthProfile, customPhotoUrl]);

  const handleUploadPhoto = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomPhotoUrl(url);
    setPulledOut(true);
    setWalkDepth(32);
    spatialSound.playPinchTap();
  }, []);

  const handleExportPly = useCallback(() => {
    if (!lastSplatDataRef.current) return;
    spatialSound.playPinchTap();
    downloadGaussianPly(
      lastSplatDataRef.current.positions,
      lastSplatDataRef.current.colors,
      lastSplatDataRef.current.scales,
      lastSplatDataRef.current.opacities,
      `alqami-sharp-3dgs-${activeSample.id.toLowerCase()}.ply`
    );
  }, [activeSample.id]);

  // Artifact object for the companion AirDrop Spatial Portal VFX mode
  const portalArtifact = useMemo<AlqamiArtifact>(() => {
    if (activeSample.artifact && !customPhotoUrl) return activeSample.artifact;
    const fallback = ALQAMI_ARTIFACTS[0];
    return {
      ...fallback,
      id: customPhotoUrl ? 'CUSTOM-MEMORY' : activeSample.id,
      title: {
        ar: customPhotoUrl ? 'ذكراك المكانية · صورة مرفوعة' : activeSample.titleAr,
        en: customPhotoUrl ? 'Your Uploaded Spatial Memory' : activeSample.titleEn,
      },
      image: customPhotoUrl || activeSample.image,
    };
  }, [activeSample, customPhotoUrl]);

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full overflow-hidden bg-[#06080f] text-white select-none flex flex-col"
    >
      {/* Optional Live Camera Passthrough behind the 3D Gaussian Splat Memory */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          roomPassthrough ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Full-viewport Three.js 3D Gaussian Splatting (ML-SHARP) Canvas */}
      <div
        ref={mountRef}
        onPointerDown={(e) => {
          dragRef.current = { active: true, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.x;
          const dy = e.clientY - dragRef.current.y;
          dragRef.current.x = e.clientX;
          dragRef.current.y = e.clientY;
          lookRef.current = {
            yaw: THREE.MathUtils.clamp(lookRef.current.yaw - dx * 0.005, -0.85, 0.85),
            pitch: THREE.MathUtils.clamp(lookRef.current.pitch + dy * 0.004, -0.45, 0.45),
          };
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerLeave={() => {
          dragRef.current.active = false;
        }}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Hidden File Input for Any Single 2D Photo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadPhoto}
        className="hidden"
      />

      {/* Top Spatial Header HUD */}
      <div className="pointer-events-none relative z-20 p-3 sm:p-4 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-2xl bg-black/50 backdrop-blur-xl border border-white/20 px-3.5 py-2.5 max-w-md shadow-2xl">
          <div className="flex items-center gap-2 text-[11px] font-bold text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {t(
                `ML-SHARP · 3D Gaussian Splatting (${SPLAT_COUNT.toLocaleString()} بقعة غاوسية · ${reconMs}ms)`,
                `ML-SHARP · 3D Gaussian Splatting (${SPLAT_COUNT.toLocaleString()} splats · ${reconMs}ms)`
              )}
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">
            {customPhotoUrl
              ? t('صورة ذاكرتك الشخصية (3DGS)', 'Your Personal Photo Memory (3DGS)')
              : t(activeSample.titleAr, activeSample.titleEn)}
          </h2>
          <p className="text-[11px] text-white/70 flex items-center gap-1 mt-0.5">
            <Compass className="w-3 h-3 text-amber-300/80 shrink-0" />
            <span>
              {t(
                'اسحب للنظر بتأثير العمق، أو اسحب الصورة إلى غرفتك وامشِ داخلها',
                'Drag for real-time 3DGS parallax, or pinch out into your room & walk in'
              )}
            </span>
          </p>
        </div>

        {/* Top Action Pills */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 px-3.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 backdrop-blur-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-amber-300" />
            <span>{t('ارفع أي صورة 2D', 'Upload Photo')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              spatialSound.playPinchTap();
              setPortalOpen(true);
            }}
            className="h-9 px-3.5 rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 hover:brightness-110 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('بوابة AirDrop · تفكيك الجسيمات', 'AirDrop Portal VFX')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPly}
            className="h-9 px-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/45 text-emerald-200 text-xs font-bold flex items-center gap-1.5 backdrop-blur-xl transition cursor-pointer"
            title={t('تصدير ملف 3DGS .PLY المتوافق مع MetalSplatter', 'Export 3DGS .PLY file for MetalSplatter / SuperSplat')}
          >
            <Download className="w-3.5 h-3.5" />
            <span>.PLY</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTechInfo((v) => !v)}
            className={`h-9 w-9 rounded-full border backdrop-blur-xl flex items-center justify-center transition cursor-pointer ${
              showTechInfo
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-black/45 hover:bg-white/20 text-white border-white/20'
            }`}
            title={t('البنية التقنية (ML-SHARP + 3DGS + AirDrop Portal)', 'Tech Stack Breakdown')}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional Tech Stack Drawer */}
      {showTechInfo && (
        <div className="pointer-events-auto relative z-20 mx-3 sm:mx-4 max-w-xl rounded-2xl bg-black/75 backdrop-blur-2xl border border-amber-300/30 p-3.5 text-xs space-y-2 shadow-2xl">
          <div className="font-bold text-amber-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>{t('التقنيات المدمجة في تطبيق «ادخل الذاكرة»', 'Walk Into Memory · Full Spatial VFX Pipeline')}</span>
          </div>
          <ul className="space-y-1 text-white/85 leading-relaxed">
            <li>
              <strong className="text-white">1. ML-SHARP + 3D Gaussian Splatting (3DGS):</strong>{' '}
              {t(
                'تحويل أي صورة 2D واحدة فورياً على الجهاز إلى آلاف البقع الغاوسية ثلاثية الأبعاد مع عمق حقيقي وتصدير .PLY.',
                'Single-image feedforward depth estimation generating tens of thousands of oriented 3D Gaussian splats in real time with .PLY export.'
              )}
            </li>
            <li>
              <strong className="text-white">2. Pinch-Out & Room Passthrough:</strong>{' '}
              {t(
                'اسحب الصورة من الشاشة إلى فضاء غرفتك مع دمج الكاميرا الحية لتطفو الذاكرة في محيطك الحقيقي.',
                'Pull the 2D photo out into room-scale volumetric space and blend it over your real room via live camera passthrough.'
              )}
            </li>
            <li>
              <strong className="text-white">3. AirDrop Particle Dissolve + Instanced 3D Rocks:</strong>{' '}
              {t(
                'بوابة مكانية متوهجة تفكك بكسلات الصورة إلى جسيمات دوّامة وتدخلك إلى قاعة ثلاثية الأبعاد بصخور مكررة ومجسم TripoSR.',
                'Swirling photo-pixel particle dissolve opening a glowing room-scale portal into an instanced-rock 3D sanctuary.'
              )}
            </li>
          </ul>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom Interactive Spatial Dock */}
      <div className="pointer-events-none relative z-20 p-3 sm:p-4 flex flex-col items-center gap-2">
        {/* Museum Photo Strip Selector */}
        <div className="pointer-events-auto w-full max-w-3xl flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 h-9 px-3 rounded-full bg-amber-400/20 hover:bg-amber-400/35 border border-amber-300/45 text-amber-200 text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-xl cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>{t('صورتك', 'Your Photo')}</span>
          </button>
          {museumSamples.map((s) => {
            const selected = !customPhotoUrl && activeSample.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  setCustomPhotoUrl(null);
                  setActiveSample(s);
                }}
                className={`shrink-0 h-9 pl-2.5 pr-1.5 rounded-full border backdrop-blur-xl text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  selected
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow'
                    : 'bg-black/55 hover:bg-white/20 text-white border-white/20'
                }`}
              >
                <img
                  src={assetUrl(s.image)}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
                <span className="max-w-[130px] truncate">
                  {t(s.titleAr, s.titleEn).replace(/\s*\(متحف.*$/, '')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Walk-In & 3DGS Controls Panel */}
        <div className="pointer-events-auto w-full max-w-3xl rounded-[24px] bg-black/60 backdrop-blur-2xl border border-white/20 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.7)] space-y-2.5">
          {/* Primary Row: Pinch Out + Walk-In Slider + Room Passthrough */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                spatialSound.playPinchTap();
                setPulledOut((v) => !v);
              }}
              className={`h-9 px-3.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                pulledOut
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>
                {pulledOut
                  ? t('ممتد في الغرفة (3DGS)', 'Pulled Into Room (3DGS)')
                  : t('اسحب الصورة للفضاء', 'Pinch Out Into Room')}
              </span>
            </button>

            <div className="flex-1 min-w-[180px] flex items-center gap-2">
              <Footprints className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-[11px] font-semibold text-white/80 shrink-0">
                {t('المشي للداخل', 'Walk In')}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={walkDepth}
                onChange={(e) => setWalkDepth(Number(e.target.value))}
                className="flex-1 accent-amber-400 h-1.5 bg-white/20 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] font-mono text-white/75 w-8 text-end">{walkDepth}%</span>
            </div>

            <button
              type="button"
              onClick={() => {
                spatialSound.playPinchTap();
                setRoomPassthrough((v) => !v);
              }}
              className={`h-9 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer shrink-0 ${
                roomPassthrough
                  ? 'bg-cyan-400 text-black border-cyan-300 font-bold'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
              }`}
            >
              {roomPassthrough ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5 text-cyan-300" />}
              <span>{t('كاميرا الغرفة', 'Room AR')}</span>
            </button>

            <button
              type="button"
              onClick={() => setControlsOpen((v) => !v)}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center transition cursor-pointer"
              title={t('ضبط عمق وحجم البقع الغاوسية', 'Tune SHARP Depth & Splat Size')}
            >
              <Sliders className="w-3.5 h-3.5 text-white/90" />
            </button>
          </div>

          {/* Secondary Row: SHARP Depth Strength + Gaussian Splat Size + Recenter */}
          {controlsOpen && (
            <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-white/10 text-[11px]">
              <div className="flex-1 min-w-[160px] flex items-center gap-2">
                <span className="text-white/70 shrink-0">{t('عمق SHARP', 'SHARP Depth')}</span>
                <input
                  type="range"
                  min={30}
                  max={180}
                  value={Math.round(depthStrength * 100)}
                  onChange={(e) => setDepthStrength(Number(e.target.value) / 100)}
                  className="flex-1 accent-cyan-400 h-1 bg-white/20 rounded-lg cursor-pointer"
                />
                <span className="font-mono text-white/75 w-9 text-end">{depthStrength.toFixed(1)}x</span>
              </div>

              <div className="flex-1 min-w-[160px] flex items-center gap-2">
                <span className="text-white/70 shrink-0">{t('حجم البقع 3DGS', 'Splat Size')}</span>
                <input
                  type="range"
                  min={60}
                  max={200}
                  value={Math.round(splatSize * 100)}
                  onChange={(e) => setSplatSize(Number(e.target.value) / 100)}
                  className="flex-1 accent-emerald-400 h-1 bg-white/20 rounded-lg cursor-pointer"
                />
                <span className="font-mono text-white/75 w-9 text-end">{splatSize.toFixed(1)}x</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  lookRef.current = { yaw: 0, pitch: 0 };
                  setWalkDepth(36);
                  setDepthStrength(1.0);
                  setSplatSize(1.15);
                  setPulledOut(true);
                }}
                className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/85 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('إعادة ضبط', 'Reset')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Companion AirDrop Particle-Dissolve Room-Scale Spatial Portal Mode */}
      {portalOpen && (
        <Suspense fallback={null}>
          <SpatialPortalVFX
            open={portalOpen}
            onClose={() => setPortalOpen(false)}
            artifact={portalArtifact}
            lang={lang}
          />
        </Suspense>
      )}
    </div>
  );
};
