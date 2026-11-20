import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Compass,
  Footprints,
  Layers,
  RotateCcw,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type { AlqamiArtifact } from '../../data/alqamiArtifacts';
import { assetUrl } from '../../utils/assetUrl';
import { disposeObject, getDracoLoader } from '../../utils/modelMemory';
import { spatialSound } from '../../utils/spatialSound';

export interface SpatialPortalVFXProps {
  open: boolean;
  onClose: () => void;
  artifact: AlqamiArtifact;
  lang?: 'ar' | 'en';
}

type PortalMood = 'sunset' | 'shrine' | 'cobalt';

const MOOD_PRESETS: Record<
  PortalMood,
  {
    ar: string;
    en: string;
    bg: number;
    fog: number;
    keyColor: number;
    rimColor: number;
    hemiSky: number;
    hemiGround: number;
    ringColorA: [number, number, number];
    ringColorB: [number, number, number];
  }
> = {
  sunset: {
    ar: 'غروب ذهبي',
    en: 'Golden Sunset',
    bg: 0x0d0914,
    fog: 0x160e1f,
    keyColor: 0xffa654,
    rimColor: 0xff6b3d,
    hemiSky: 0xffc896,
    hemiGround: 0x1d1428,
    ringColorA: [1.0, 0.74, 0.34],
    ringColorB: [0.95, 0.36, 0.24],
  },
  shrine: {
    ar: 'نور الكفيل الذهبي',
    en: 'Shrine Sanctuary',
    bg: 0x070c12,
    fog: 0x0b1520,
    keyColor: 0xf7d37c,
    rimColor: 0x38bdf8,
    hemiSky: 0xfef3c7,
    hemiGround: 0x0f1c2b,
    ringColorA: [0.98, 0.82, 0.38],
    ringColorB: [0.22, 0.74, 0.97],
  },
  cobalt: {
    ar: 'غسق أزرق',
    en: 'Twilight Cobalt',
    bg: 0x050914,
    fog: 0x091326,
    keyColor: 0x7dd3fc,
    rimColor: 0xa78bfa,
    hemiSky: 0xbae6fd,
    hemiGround: 0x0b1024,
    ringColorA: [0.38, 0.82, 1.0],
    ringColorB: [0.66, 0.45, 1.0],
  },
};

function resolvePortalGlb(glb: string, texMode: 'hd' | 'classic'): string {
  const base = assetUrl(glb);
  if (texMode === 'classic' && base.includes('/models/alkafeel/')) {
    return base.replace('/models/alkafeel/', '/models/alkafeel-classic/').split('?')[0] + '?v=wt5';
  }
  return base;
}

/** Build a procedural faceted wet-rock geometry for instanced plinth stones (Tripo AI instanced-rock technique). */
function createProceduralRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.42, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      0.82 +
      0.16 * Math.sin(x * 7.3 + y * 5.1) +
      0.12 * Math.cos(z * 6.4 - x * 4.2) +
      0.08 * Math.sin((x + y + z) * 9.0);
    // Slightly flatten bottom so rocks sit naturally on the sanctuary floor
    const yScale = y < 0 ? 0.58 : 0.86;
    pos.setXYZ(i, x * n, y * n * yScale, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

export const SpatialPortalVFX: React.FC<SpatialPortalVFXProps> = ({
  open,
  onClose,
  artifact,
  lang = 'ar',
}) => {
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<'dissolving' | 'entering' | 'immersed'>('dissolving');
  const [walkProgress, setWalkProgress] = useState<number>(0); // 0 = outside portal, 100 = inside standing beside artifact
  const [mood, setMood] = useState<PortalMood>('sunset');
  const [texMode, setTexMode] = useState<'hd' | 'classic'>('hd');
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [replayNonce, setReplayNonce] = useState<number>(0);

  // Refs shared with the WebGL animation loop
  const moodRef = useRef<PortalMood>(mood);
  moodRef.current = mood;
  const manualWalkRef = useRef<number | null>(null);
  const pointerLookRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const gyroLookRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const dragStateRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  const isAlkafeel = artifact.id.startsWith('KFL-') || (artifact.model?.glb || '').includes('/models/alkafeel/');

  const triggerReplay = useCallback(() => {
    manualWalkRef.current = null;
    setPhase('dissolving');
    setWalkProgress(0);
    setReplayNonce((n) => n + 1);
    try {
      spatialSound.playPinchTap();
    } catch {
      /* ignore audio unlock */
    }
  }, []);

  // Device orientation (gyroscope) spatial parallax on mobile devices
  useEffect(() => {
    if (!open) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      const yaw = THREE.MathUtils.clamp((e.gamma / 45) * 0.42, -0.45, 0.45);
      const pitch = THREE.MathUtils.clamp(((e.beta - 55) / 45) * 0.28, -0.32, 0.32);
      gyroLookRef.current = { yaw, pitch };
    };
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [open]);

  // Main Three.js + WebGL Portal & Particle Dissolve Scene
  useEffect(() => {
    if (!open || !mountRef.current) return;
    const container = mountRef.current;
    let disposed = false;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initialMood = MOOD_PRESETS[moodRef.current];
    scene.background = new THREE.Color(initialMood.bg);
    scene.fog = new THREE.FogExp2(initialMood.fog, 0.085);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.08, 60);
    camera.position.set(0, 0.35, 6.4);

    // Lighting rig (updated dynamically by mood)
    const hemiLight = new THREE.HemisphereLight(initialMood.hemiSky, initialMood.hemiGround, 1.0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(initialMood.keyColor, 2.6);
    keyLight.position.set(3.2, 4.5, 3.8);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(initialMood.rimColor, 4.2, 14, 1.5);
    rimLight.position.set(-2.4, 2.2, -1.6);
    scene.add(rimLight);

    const plinthSpot = new THREE.PointLight(0xffe0a3, 2.8, 8, 1.6);
    plinthSpot.position.set(0, 2.4, 0.9);
    scene.add(plinthSpot);

    // -------------------------------------------------------------------------
    // 1. ROOM-SCALE GLOWING SPATIAL PORTAL ARCH (Custom GLSL ShaderMaterial)
    // -------------------------------------------------------------------------
    const portalZ = 2.65;
    const portalUniforms = {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uColorA: { value: new THREE.Vector3(...initialMood.ringColorA) },
      uColorB: { value: new THREE.Vector3(...initialMood.ringColorB) },
    };

    const portalRingGeo = new THREE.TorusGeometry(1.75, 0.055, 24, 128);
    const portalRingMat = new THREE.ShaderMaterial({
      uniforms: portalUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        uniform float uTime;
        void main() {
          vUv = uv;
          vPos = position;
          vec3 p = position;
          float ripple = sin(atan(p.y, p.x) * 8.0 - uTime * 3.2) * 0.025;
          p.xy *= (1.0 + ripple);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        uniform float uTime;
        uniform float uOpen;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        void main() {
          float ang = atan(vPos.y, vPos.x);
          float pulse = 0.55 + 0.45 * sin(ang * 5.0 - uTime * 3.8);
          vec3 col = mix(uColorB, uColorA, pulse);
          float glow = 0.7 + 0.5 * sin(ang * 12.0 + uTime * 5.5);
          float alpha = smoothstep(0.0, 0.25, uOpen) * (0.65 + 0.35 * glow);
          gl_FragColor = vec4(col * 1.45, alpha);
        }
      `,
    });
    const portalRing = new THREE.Mesh(portalRingGeo, portalRingMat);
    portalRing.position.set(0, 0.22, portalZ);
    scene.add(portalRing);

    // Outer soft halo ring
    const haloGeo = new THREE.TorusGeometry(1.92, 0.18, 16, 96);
    const haloMat = new THREE.MeshBasicMaterial({
      color: initialMood.keyColor,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const portalHalo = new THREE.Mesh(haloGeo, haloMat);
    portalHalo.position.copy(portalRing.position);
    scene.add(portalHalo);

    // -------------------------------------------------------------------------
    // 2. SANCTUARY CHAMBER FLOOR + OBSIDIAN PLINTH + INSTANCED 3D ROCKS
    //    (Mirrors the Tripo AI instanced wet-rock ground technique)
    // -------------------------------------------------------------------------
    const floorGeo = new THREE.CircleGeometry(14, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0e1118,
      roughness: 0.24,
      metalness: 0.55,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.35;
    scene.add(floor);

    // Pedestal plinth for the 3D museum artifact
    const plinthGeo = new THREE.CylinderGeometry(0.76, 0.96, 0.52, 48);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x161922,
      roughness: 0.28,
      metalness: 0.62,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(0, -1.09, 0);
    scene.add(plinth);

    const plinthRingGeo = new THREE.TorusGeometry(0.78, 0.018, 12, 64);
    const plinthRingMat = new THREE.MeshBasicMaterial({
      color: initialMood.keyColor,
      transparent: true,
      opacity: 0.72,
    });
    const plinthRing = new THREE.Mesh(plinthRingGeo, plinthRingMat);
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.set(0, -0.82, 0);
    scene.add(plinthRing);

    // 42 Instanced Wet Carved Rocks around the sanctuary floor & plinth
    const rockGeo = createProceduralRockGeometry();
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x20242e,
      roughness: 0.22,
      metalness: 0.35,
    });
    const ROCK_COUNT = 42;
    const rockInstances = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < ROCK_COUNT; i++) {
      const ring = i < 16 ? 1.45 + (i % 3) * 0.35 : 2.8 + (i % 5) * 0.72;
      const angle = (i / ROCK_COUNT) * Math.PI * 2 * 2.3 + (i % 7) * 0.21;
      const rx = Math.cos(angle) * ring;
      const rz = Math.sin(angle) * ring - 0.3;
      const scaleX = 0.55 + ((i * 37) % 100) / 110;
      const scaleY = 0.38 + ((i * 53) % 100) / 140;
      const scaleZ = 0.55 + ((i * 29) % 100) / 110;
      dummy.position.set(rx, -1.33 + scaleY * 0.12, rz);
      dummy.rotation.set(((i * 17) % 10) * 0.08, angle * 1.7, ((i * 23) % 10) * 0.08);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.updateMatrix();
      rockInstances.setMatrixAt(i, dummy.matrix);
    }
    rockInstances.instanceMatrix.needsUpdate = true;
    scene.add(rockInstances);

    // -------------------------------------------------------------------------
    // 3. FLOATING AMBIENT GOLDEN DUST & VOLUMETRIC LIGHT MOTES
    // -------------------------------------------------------------------------
    const DUST_COUNT = 1800;
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustSeeds = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      const r = 0.7 + Math.random() * 8.5;
      const th = Math.random() * Math.PI * 2;
      dustPositions[i * 3] = Math.cos(th) * r;
      dustPositions[i * 3 + 1] = -1.2 + Math.random() * 5.2;
      dustPositions[i * 3 + 2] = -4.5 + Math.random() * 10.0;
      dustSeeds[i] = Math.random() * 6.283;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeeds, 1));
    const dustUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(initialMood.keyColor) },
    };
    const dustMat = new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.55 + aSeed) * 0.25 + mod(uTime * 0.08 + aSeed, 1.0) * 0.35;
          p.x += cos(uTime * 0.35 + aSeed * 1.7) * 0.18;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(24.0 / max(-mv.z, 0.6), 1.5, 5.5);
          vAlpha = 0.35 + 0.45 * sin(uTime * 1.4 + aSeed * 3.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(uColor, soft * vAlpha * 0.65);
        }
      `,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    // -------------------------------------------------------------------------
    // 4. AIRDROP PHOTO PARTICLE-DISSOLVE CLOUD (~14,400 photo-colored GPU points)
    // -------------------------------------------------------------------------
    const GRID = 120; // 120 x 120 = 14,400 pixels sampled from the artifact image
    const COUNT = GRID * GRID;
    const basePos = new Float32Array(COUNT * 3);
    const targetPos = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const delays = new Float32Array(COUNT);

    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const idx = gy * GRID + gx;
        const u = gx / (GRID - 1) - 0.5;
        const v = 0.5 - gy / (GRID - 1);
        // Initial 2D photo card hovering in front of the portal
        basePos[idx * 3] = u * 2.15;
        basePos[idx * 3 + 1] = v * 2.15 + 0.22;
        basePos[idx * 3 + 2] = portalZ + 1.15;

        // Swirl outward around the portal perimeter into the volumetric sanctuary
        const dist = Math.hypot(u, v);
        const angle = Math.atan2(v, u) + 1.85 + dist * 2.6;
        const ringR = 1.65 + dist * 2.4;
        targetPos[idx * 3] = Math.cos(angle) * ringR;
        targetPos[idx * 3 + 1] = Math.sin(angle) * ringR + 0.22;
        targetPos[idx * 3 + 2] = portalZ - 1.4 - dist * 4.2;

        // Center dissolves first like an AirDrop ripple
        delays[idx] = Math.min(0.68, dist * 0.92 + ((idx * 19) % 100) * 0.0018);

        // Warm golden fallback palette until image loads
        colors[idx * 3] = 0.92;
        colors[idx * 3 + 1] = 0.72;
        colors[idx * 3 + 2] = 0.42;
      }
    }

    const dissolveGeo = new THREE.BufferGeometry();
    dissolveGeo.setAttribute('position', new THREE.BufferAttribute(basePos, 3));
    dissolveGeo.setAttribute('aTarget', new THREE.BufferAttribute(targetPos, 3));
    dissolveGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    dissolveGeo.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));

    const dissolveUniforms = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
    };

    const dissolveMat = new THREE.ShaderMaterial({
      uniforms: dissolveUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aTarget;
        attribute vec3 aColor;
        attribute float aDelay;
        uniform float uProgress;
        uniform float uTime;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          float localP = clamp((uProgress - aDelay) / max(0.001, (1.0 - aDelay)), 0.0, 1.0);
          float ease = localP * localP * (3.0 - 2.0 * localP);

          // Spiral swirl during dissolve
          vec3 p = mix(position, aTarget, ease);
          float swirl = sin(ease * 3.14159) * 0.62;
          float s = sin(swirl);
          float c = cos(swirl);
          vec2 rot = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
          p.xy = mix(p.xy, rot, ease);
          p.z += sin(uTime * 2.2 + aDelay * 12.0) * 0.06 * ease;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((16.0 + 10.0 * sin(ease * 3.14159)) / max(-mv.z, 0.5), 1.8, 7.0);

          // Glow brighter during transition, then gently fade into ambient portal dust
          vColor = mix(aColor, vec3(1.0, 0.85, 0.55), sin(ease * 3.14159) * 0.55);
          vAlpha = 1.0 - smoothstep(0.65, 1.0, localP) * 0.88;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(vColor, soft * vAlpha);
        }
      `,
    });

    const dissolvePoints = new THREE.Points(dissolveGeo, dissolveMat);
    scene.add(dissolvePoints);

    // Sample actual artifact photo pixels into dissolveGeo.attributes.aColor
    if (artifact.image) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (disposed) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = GRID;
          canvas.height = GRID;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, GRID, GRID);
          const data = ctx.getImageData(0, 0, GRID, GRID).data;
          const colAttr = dissolveGeo.getAttribute('aColor') as THREE.BufferAttribute;
          const posAttr = dissolveGeo.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < COUNT; i++) {
            const r = data[i * 4] / 255;
            const g = data[i * 4 + 1] / 255;
            const b = data[i * 4 + 2] / 255;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            colAttr.setXYZ(i, Math.min(1, r * 1.15), Math.min(1, g * 1.12), Math.min(1, b * 1.12));
            // Give subtle volumetric depth relief to brighter pixels (ML-SHARP depth hint)
            posAttr.setZ(i, portalZ + 1.15 + (lum - 0.5) * 0.28);
          }
          colAttr.needsUpdate = true;
          posAttr.needsUpdate = true;
        } catch {
          /* CORS tainted image fallback keeps golden palette */
        }
      };
      img.src = assetUrl(artifact.image);
    }

    // -------------------------------------------------------------------------
    // 5. LOAD REAL 3D TRIPOSR .GLB ARTIFACT INSIDE THE SANCTUARY PORTAL
    // -------------------------------------------------------------------------
    const artifactGroup = new THREE.Group();
    artifactGroup.position.set(0, 0.22, 0);
    scene.add(artifactGroup);

    setModelLoaded(false);
    const glbUrl = artifact.model?.glb ? resolvePortalGlb(artifact.model.glb, texMode) : '';
    if (glbUrl) {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(getDracoLoader());
      loader.load(
        glbUrl,
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const normScale = 1.65 / maxDim;
          model.scale.setScalar(normScale);
          model.position.sub(center.multiplyScalar(normScale));
          artifactGroup.add(model);
          setModelLoaded(true);
        },
        undefined,
        () => {
          if (!disposed) setModelLoaded(true);
        }
      );
    } else {
      setModelLoaded(true);
    }

    // -------------------------------------------------------------------------
    // 6. ANIMATION LOOP (AirDrop Dissolve -> Portal Open -> Walk-In Immersion)
    // -------------------------------------------------------------------------
    const clock = new THREE.Clock();
    let rafId = 0;
    let lastUiSync = 0;

    const animate = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Apply live mood colors smoothly
      const m = MOOD_PRESETS[moodRef.current];
      (scene.background as THREE.Color).lerp(new THREE.Color(m.bg), 0.06);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.lerp(new THREE.Color(m.fog), 0.06);
      }
      keyLight.color.lerp(new THREE.Color(m.keyColor), 0.06);
      rimLight.color.lerp(new THREE.Color(m.rimColor), 0.06);
      hemiLight.color.lerp(new THREE.Color(m.hemiSky), 0.06);
      haloMat.color.lerp(new THREE.Color(m.keyColor), 0.06);
      plinthRingMat.color.lerp(new THREE.Color(m.keyColor), 0.06);
      dustUniforms.uColor.value.lerp(new THREE.Color(m.keyColor), 0.06);
      portalUniforms.uColorA.value.lerp(new THREE.Vector3(...m.ringColorA), 0.06);
      portalUniforms.uColorB.value.lerp(new THREE.Vector3(...m.ringColorB), 0.06);

      // Timeline:
      // 0.0s - 0.55s: Hold crisp photo card
      // 0.55s - 2.65s: AirDrop particle dissolve + portal expands
      // 1.6s - 4.6s: Smooth walk-in dolly through the glowing portal into sanctuary
      const autoDissolve = THREE.MathUtils.clamp((elapsed - 0.45) / 2.2, 0, 1);
      const autoWalk = THREE.MathUtils.clamp((elapsed - 1.55) / 3.1, 0, 1);
      const easeWalk = autoWalk * autoWalk * (3 - 2 * autoWalk);
      const walkT = manualWalkRef.current !== null ? manualWalkRef.current : easeWalk;

      dissolveUniforms.uProgress.value = Math.max(autoDissolve, walkT * 0.95);
      dissolveUniforms.uTime.value = elapsed;
      portalUniforms.uTime.value = elapsed;
      portalUniforms.uOpen.value = THREE.MathUtils.clamp(elapsed / 1.4, 0, 1);
      dustUniforms.uTime.value = elapsed;

      const portalScale = 0.25 + 0.75 * THREE.MathUtils.smoothstep(elapsed, 0.15, 1.55);
      portalRing.scale.setScalar(portalScale);
      portalHalo.scale.setScalar(portalScale * (1 + 0.03 * Math.sin(elapsed * 2.4)));

      // Camera walk-in from z = 6.35 (outside) -> z = 1.95 (inside sanctuary beside artifact)
      const camZ = THREE.MathUtils.lerp(6.35, 1.95, walkT);
      const lookYaw = pointerLookRef.current.yaw + gyroLookRef.current.yaw;
      const lookPitch = pointerLookRef.current.pitch + gyroLookRef.current.pitch;
      const camX = Math.sin(lookYaw) * (1.15 + (1 - walkT) * 0.45);
      const camY = 0.34 + lookPitch * 0.85 + Math.sin(elapsed * 0.9) * 0.03;

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, camX, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, camY, 0.08);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, camZ, 0.08);
      camera.lookAt(0, 0.18, 0);

      // Gentle levitation and slow rotation of the 3D artifact
      artifactGroup.rotation.y = elapsed * 0.34;
      artifactGroup.position.y = 0.22 + Math.sin(elapsed * 1.45) * 0.055;

      // Sync UI state ~10fps
      if (elapsed - lastUiSync > 0.1) {
        lastUiSync = elapsed;
        if (manualWalkRef.current === null) {
          setWalkProgress(Math.round(walkT * 100));
        }
        if (walkT < 0.22) setPhase('dissolving');
        else if (walkT < 0.86) setPhase('entering');
        else setPhase('immersed');
      }

      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      if (disposed || !mountRef.current) return;
      const w = mountRef.current.clientWidth || window.innerWidth;
      const h = mountRef.current.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      disposeObject(artifactGroup);
      portalRingGeo.dispose();
      portalRingMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      plinthRingGeo.dispose();
      plinthRingMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      dissolveGeo.dispose();
      dissolveMat.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [open, artifact.id, artifact.image, artifact.model?.glb, texMode, replayNonce]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = { active: true, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const dx = e.clientX - dragStateRef.current.x;
    const dy = e.clientY - dragStateRef.current.y;
    dragStateRef.current.x = e.clientX;
    dragStateRef.current.y = e.clientY;
    pointerLookRef.current = {
      yaw: THREE.MathUtils.clamp(pointerLookRef.current.yaw - dx * 0.0055, -1.35, 1.35),
      pitch: THREE.MathUtils.clamp(pointerLookRef.current.pitch + dy * 0.004, -0.55, 0.55),
    };
  };
  const onPointerUp = () => {
    dragStateRef.current.active = false;
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[130] bg-black text-white select-none overflow-hidden"
    >
      {/* Full-viewport Three.js WebGL Spatial Portal Canvas */}
      <div
        ref={mountRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Top HUD Bar */}
      <div className="pointer-events-none absolute top-0 inset-x-0 p-3 sm:p-5 flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-2xl bg-black/45 backdrop-blur-xl border border-white/20 px-3.5 py-2.5 max-w-[75vw] sm:max-w-md shadow-2xl">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {phase === 'dissolving'
                ? t('تفكيك الجسيمات · AirDrop Particle Dissolve', 'AirDrop Particle Dissolve')
                : phase === 'entering'
                ? t('عبور البوابة المكانية · Entering Spatial Portal', 'Entering Room-Scale Portal')
                : t('داخل اللحظة التراثية · Immersed in 3D Sanctuary', 'Immersed in 3D Sanctuary')}
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">
            {isAr ? artifact.title.ar : artifact.title.en}
          </h2>
          <p className="text-[11px] text-white/70 flex items-center gap-1.5 mt-0.5">
            <Compass className="w-3 h-3 text-amber-300/80 shrink-0" />
            <span>
              {t(
                'اسحب للنظر 360° أو حرّك شريط الدخول المكاني',
                'Drag to look around 360° or slide to step into the moment'
              )}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t('إغلاق البوابة', 'Close Spatial Portal')}
          className="pointer-events-auto w-10 h-10 rounded-full bg-black/50 hover:bg-black/75 backdrop-blur-xl border border-white/25 flex items-center justify-center shadow-xl transition"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Loading badge for 3D GLB */}
      {!modelLoaded && (
        <div className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-amber-300/30 text-xs text-amber-200">
          {t('جاري تحميل المجسم ثلاثي الأبعاد داخل البوابة...', 'Loading 3D artifact inside portal...')}
        </div>
      )}

      {/* Bottom Interactive Spatial Controls Deck */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 p-3 sm:p-5 flex flex-col items-center gap-2.5">
        <div className="pointer-events-auto w-full max-w-xl rounded-[24px] bg-black/55 backdrop-blur-2xl border border-white/20 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.65)] space-y-2.5">
          {/* Walk-In Spatial Depth Slider */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 shrink-0">
              <Footprints className="w-4 h-4" />
              <span>{t('ادخل اللحظة', 'Step In')}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={walkProgress}
              onChange={(e) => {
                const v = Number(e.target.value);
                setWalkProgress(v);
                manualWalkRef.current = v / 100;
              }}
              aria-label={t('عمق الدخول المكاني', 'Spatial Walk-In Depth')}
              className="flex-1 accent-amber-400 h-1.5 bg-white/20 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono text-white/80 w-9 text-end">{walkProgress}%</span>
          </div>

          {/* Mood + Texture + Replay Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-300/90" />
              {(['sunset', 'shrine', 'cobalt'] as PortalMood[]).map((mKey) => (
                <button
                  key={mKey}
                  type="button"
                  onClick={() => setMood(mKey)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                    mood === mKey
                      ? 'bg-amber-400 text-black shadow'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  {t(MOOD_PRESETS[mKey].ar, MOOD_PRESETS[mKey].en)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {isAlkafeel && (
                <button
                  type="button"
                  onClick={() => setTexMode((m) => (m === 'hd' ? 'classic' : 'hd'))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/12 hover:bg-white/22 border border-white/15 text-white transition"
                >
                  <Layers className="w-3 h-3 text-amber-300" />
                  <span>
                    {texMode === 'hd'
                      ? t('نسيج HD', 'HD PBR')
                      : t('النسيج القديم 3D', 'Classic 3D')}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={triggerReplay}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-black hover:brightness-110 shadow transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('أعد بوابة AirDrop', 'Replay Portal')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
