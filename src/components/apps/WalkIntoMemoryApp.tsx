import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  CameraOff,
  Compass,
  Expand,
  Footprints,
  Minimize2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { assetUrl } from '../../utils/assetUrl';
import { spatialSound } from '../../utils/spatialSound';

export interface WalkIntoMemoryAppProps {
  lang?: 'ar' | 'en';
}

type SceneProfile = 'corridor' | 'rooftop' | 'courtyard';

interface ShrineMemoryScene {
  id: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  image: string;
  profile: SceneProfile;
  portalColor: number;
  ambientTint: number;
}

/** ONLY the 3 iconic Al-Abbas Holy Shrine photographs — zero upload clutter. */
const SHRINE_SCENES: ShrineMemoryScene[] = [
  {
    id: 'sanctuary-hall',
    titleAr: 'الروضة المباركة والضريح المقدس',
    titleEn: 'Sacred Sanctuary Hall',
    subtitleAr: 'امشِ بين الأعمدة الرخامية نحو الضريح الذهبي',
    subtitleEn: 'Walk down the marble corridor toward the golden shrine',
    image: './images/memories/shrine-sanctuary-interior.jpg',
    profile: 'corridor',
    portalColor: 0xfbbf24,
    ambientTint: 0x0b1210,
  },
  {
    id: 'twilight-dome',
    titleAr: 'القبة الذهبية والمآذن عند الغسق',
    titleEn: 'Golden Dome & Minarets at Twilight',
    subtitleAr: 'تقدّم فوق الصحن الزجاجي نحو المآذن الذهبية',
    subtitleEn: 'Step across the glass skylight toward the twin golden minarets',
    image: './images/memories/shrine-twilight-dome.jpg',
    profile: 'rooftop',
    portalColor: 0x38bdf8,
    ambientTint: 0x070c18,
  },
  {
    id: 'courtyard-gate',
    titleAr: 'صحن وبوابة العتبة العباسية المقدسة',
    titleEn: 'Al-Abbas Holy Shrine Courtyard & Gate',
    subtitleAr: 'اعبر ساحة الصحن الشريف نحو البوابة المزخرفة',
    subtitleEn: 'Walk across the courtyard toward the ornate shrine gate',
    image: './images/memories/shrine-courtyard.jpg',
    profile: 'courtyard',
    portalColor: 0xf59e0b,
    ambientTint: 0x0f0e14,
  },
];

/**
 * Builds a continuous, high-resolution, full-depth 3D displaced mesh (220x160 = 70,400 triangles)
 * from the shrine photograph, folding walls/floors/ceilings/sky into true 3D room depth
 * so the visitor can physically walk INTO the scene with zero dotted gaps.
 */
function buildFullDepth3DMesh(
  img: HTMLImageElement,
  profile: SceneProfile,
  depthMeters: number
): THREE.BufferGeometry {
  const segX = 220;
  const segY = 160;
  const aspect = (img.naturalWidth || 1024) / Math.max(1, img.naturalHeight || 680);
  const baseH = 7.4;
  const baseW = baseH * THREE.MathUtils.clamp(aspect, 1.15, 1.75);

  // Sample image pixels for fine micro-relief (edge & luminance detail on top of architectural 3D geometry)
  const sampleW = segX + 1;
  const sampleH = segY + 1;
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const rgba = ctx.getImageData(0, 0, sampleW, sampleH).data;

  const geo = new THREE.PlaneGeometry(baseW, baseH, segX, segY);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Compute raw depth (0 = far back end of the 3D space, 1 = closest foreground near the portal)
  const count = pos.count;
  const rawDepth = new Float32Array(count);

  for (let iy = 0; iy < sampleH; iy++) {
    const vNorm = iy / segY; // 0 = top, 1 = bottom
    for (let ix = 0; ix < sampleW; ix++) {
      const uNorm = ix / segX; // 0 = left, 1 = right
      const idx = iy * sampleW + ix;
      const r = rgba[idx * 4] / 255;
      const g = rgba[idx * 4 + 1] / 255;
      const b = rgba[idx * 4 + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const warm = Math.max(0, r - b);
      const dxC = Math.abs(uNorm - 0.5) * 2; // 0 at center, 1 at left/right edge

      let d = 0.5;
      if (profile === 'corridor') {
        // Real 3D rectangular sanctuary corridor:
        // - Left & right marble walls fold forward toward the visitor (dxC > 0.38)
        // - Carpet floor extends smoothly toward the visitor's feet (vNorm > 0.56)
        // - Crystal chandelier ceiling arches forward overhead (vNorm < 0.25)
        // - Central golden shrine sits deep at the far end of the hall!
        const leftRightWall = Math.pow(THREE.MathUtils.clamp((dxC - 0.26) / 0.74, 0, 1), 1.25) * 0.94;
        const floorForward = Math.pow(THREE.MathUtils.clamp((vNorm - 0.52) / 0.48, 0, 1), 1.15) * 0.96;
        const ceilingArch = Math.pow(THREE.MathUtils.clamp((0.26 - vNorm) / 0.26, 0, 1), 1.45) * 0.55;
        const shrineCore = Math.exp(-Math.pow((uNorm - 0.5) * 3.4, 2) - Math.pow((vNorm - 0.44) * 3.8, 2));
        d = Math.max(leftRightWall, floorForward, ceilingArch) * (1 - shrineCore * 0.72) + warm * 0.05 + lum * 0.03;
      } else if (profile === 'rooftop') {
        // Real 3D rooftop terrace + skylight pyramid + twin rising golden minarets + curved twilight sky
        const isBlueSky = vNorm < 0.58 && b > r + 0.07;
        const terraceFloor = Math.pow(THREE.MathUtils.clamp((vNorm - 0.54) / 0.46, 0, 1), 1.05) * 0.96;
        const sideDomes = Math.pow(dxC, 1.8) * Math.max(0, (vNorm - 0.5) * 2) * 0.65;
        const minaretRelief = !isBlueSky && vNorm < 0.68 ? 0.36 + warm * 0.24 : 0.03;
        d = isBlueSky
          ? 0.02 + (1 - vNorm) * 0.02
          : Math.max(terraceFloor, sideDomes, minaretRelief) + lum * 0.03;
      } else {
        // Real 3D courtyard: wide ground plaza & pilgrims near, ornate tiled wall & gate mid, sky dome far
        const isSky = vNorm < 0.52 && lum > 0.64 && Math.abs(r - b) < 0.14;
        const courtyardGround = Math.pow(THREE.MathUtils.clamp((vNorm - 0.62) / 0.38, 0, 1), 1.05) * 0.95;
        const sideWings = Math.pow(dxC, 1.5) * (vNorm > 0.5 ? 0.68 : 0.22);
        const gateFacade = !isSky && vNorm >= 0.34 && vNorm <= 0.78 ? 0.42 + warm * 0.14 : 0.04;
        d = isSky ? 0.03 : Math.max(courtyardGround, sideWings, gateFacade) + lum * 0.03;
      }

      rawDepth[idx] = THREE.MathUtils.clamp(d, 0.0, 1.0);
    }
  }

  // Smooth depth field with 3x3 blur so the 3D mesh surfaces (walls, carpet, domes) are silky smooth
  const smoothDepth = new Float32Array(count);
  for (let iy = 0; iy < sampleH; iy++) {
    for (let ix = 0; ix < sampleW; ix++) {
      let sum = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = THREE.MathUtils.clamp(iy + dy, 0, sampleH - 1);
        for (let dx = -2; dx <= 2; dx++) {
          const xx = THREE.MathUtils.clamp(ix + dx, 0, sampleW - 1);
          sum += rawDepth[yy * sampleW + xx];
          n++;
        }
      }
      smoothDepth[iy * sampleW + ix] = sum / n;
    }
  }

  // Displace every vertex into true 3D room perspective (perspective un-projection!)
  for (let iy = 0; iy < sampleH; iy++) {
    const v = 0.5 - iy / segY; // +0.5 top, -0.5 bottom
    for (let ix = 0; ix < sampleW; ix++) {
      const u = ix / segX - 0.5; // -0.5 left, +0.5 right
      const idx = iy * sampleW + ix;
      const d = smoothDepth[idx]; // 0 = far back (-depthMeters), 1 = closest foreground (0)

      // Z ranges from -depthMeters (far shrine/sky) up to +0.2 (right at portal entrance)
      const z = -(1 - d) * depthMeters;
      // Perspective frustum expansion: deeper points expand naturally so straight corridor lines stay true!
      const frustumExpand = 0.58 + (1 - d) * 0.92;
      const x = u * baseW * frustumExpand;
      const y = v * baseH * frustumExpand;

      pos.setXYZ(idx, x, y, z);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export const WalkIntoMemoryApp: React.FC<WalkIntoMemoryAppProps> = ({ lang = 'ar' }) => {
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [deployedInRoom, setDeployedInRoom] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [depthMeters, setDepthMeters] = useState<number>(8.5);
  const [walkPct, setWalkPct] = useState<number>(18); // 0 = outside portal in your room, 100 = deep inside the 3D scene
  const [insidePortal, setInsidePortal] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const activeScene = SHRINE_SCENES[activeSceneIdx];

  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Live 3D walk & look state shared with the 60fps Three.js loop
  const camStateRef = useRef({
    x: 0,
    y: -0.15,
    z: 2.8, // > 0.35 = outside the portal in your real room; < 0.35 = stepped INSIDE the 3D shrine mesh!
    yaw: 0,
    pitch: 0,
  });
  const gyroRef = useRef({ yaw: 0, pitch: 0 });
  const keysRef = useRef<{ f: boolean; b: boolean; l: boolean; r: boolean }>({
    f: false,
    b: false,
    l: false,
    r: false,
  });
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const deployedRef = useRef(deployedInRoom);
  deployedRef.current = deployedInRoom;
  const depthRef = useRef(depthMeters);
  depthRef.current = depthMeters;

  // Toggle Live Room Camera Passthrough when deployed in room
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (!deployedInRoom) {
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraError(null);
      return;
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        stream = s;
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        setCameraError(
          isAr
            ? 'تعذّر فتح الكاميرا — يمكنك المشي داخل المشهد ثلاثي الأبعاد مباشرة'
            : 'Camera unavailable — walking directly in full 3D immersive mode'
        );
      });
    return () => {
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [deployedInRoom, isAr]);

  // Request iOS/Android DeviceOrientation (360° Head Look) + Step Motion walking
  const enableRoomSensors = useCallback(async () => {
    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof DOE?.requestPermission === 'function') {
        await DOE.requestPermission();
      }
    } catch {
      /* non-iOS or denied */
    }
  }, []);

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      gyroRef.current = {
        yaw: THREE.MathUtils.clamp((e.gamma / 45) * 0.55, -0.75, 0.75),
        pitch: THREE.MathUtils.clamp(((e.beta - 60) / 45) * 0.35, -0.45, 0.45),
      };
    };
    // Subtle physical step detector on phones when deployed in room
    let lastStepMs = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      if (!deployedRef.current) return;
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      const now = performance.now();
      if (mag > 12.6 && now - lastStepMs > 420) {
        lastStepMs = now;
        const minZ = -(depthRef.current * 0.62);
        camStateRef.current.z = Math.max(minZ, camStateRef.current.z - 0.48);
      }
    };
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    window.addEventListener('devicemotion', onMotion, { passive: true });
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('devicemotion', onMotion);
    };
  }, []);

  // Keyboard WASD / Arrow Keys for smooth walking inside the 3D scene
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') keysRef.current.f = down;
      if (k === 's' || k === 'arrowdown') keysRef.current.b = down;
      if (k === 'a' || k === 'arrowleft') keysRef.current.l = down;
      if (k === 'd' || k === 'arrowright') keysRef.current.r = down;
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  // Main Three.js Full-Depth 3D Mesh + Room-Scale Glowing Portal Renderer
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let disposed = false;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, width / height, 0.05, 80);

    // Start standing just in front of the glowing portal entrance
    camStateRef.current = { x: 0, y: -0.1, z: 2.35, yaw: 0, pitch: 0 };
    setWalkPct(18);
    setInsidePortal(false);

    // 1. Glowing Room-Scale Spatial Portal Arch at Z = 0.25 (anchored in your real room!)
    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, -0.05, 0.28);
    scene.add(portalGroup);

    const archShape = new THREE.Shape();
    const pw = 2.05;
    const ph = 1.65;
    archShape.moveTo(-pw, -ph);
    archShape.lineTo(-pw, ph * 0.35);
    archShape.absarc(0, ph * 0.35, pw, Math.PI, 0, true);
    archShape.lineTo(pw, -ph);

    const archPoints = archShape.getPoints(96);
    const archCurve = new THREE.CatmullRomCurve3(
      archPoints.map((pt) => new THREE.Vector3(pt.x, pt.y, 0)),
      true
    );
    const portalTubeGeo = new THREE.TubeGeometry(archCurve, 128, 0.045, 16, true);
    const portalUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(activeScene.portalColor) },
    };
    const portalMat = new THREE.ShaderMaterial({
      uniforms: portalUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec3 vPos;
        void main() {
          float pulse = 0.65 + 0.35 * sin(vPos.y * 4.0 + vPos.x * 3.0 - uTime * 3.6);
          gl_FragColor = vec4(uColor * (1.2 + pulse * 0.6), 0.88);
        }
      `,
    });
    const portalArch = new THREE.Mesh(portalTubeGeo, portalMat);
    portalGroup.add(portalArch);

    // Subtle spatial floor guide markers leading INTO the portal
    const guideGeo = new THREE.RingGeometry(0.18, 0.22, 32);
    const guideMat = new THREE.MeshBasicMaterial({
      color: activeScene.portalColor,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const floorGuides: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(guideGeo, guideMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, -1.65, 1.5 - i * 1.15);
      scene.add(m);
      floorGuides.push(m);
    }

    // 2. Floating Atmospheric Golden Dust Motes inside the 3D Shrine Hall
    const DUST = 900;
    const dustPos = new Float32Array(DUST * 3);
    const dustSeed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 7.5;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 4.8;
      dustPos[i * 3 + 2] = -Math.random() * depthMeters * 0.92;
      dustSeed[i] = Math.random() * 6.283;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
    const dustUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(activeScene.portalColor) },
    };
    const dustMat = new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.6 + aSeed) * 0.16;
          p.x += cos(uTime * 0.4 + aSeed * 1.3) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(18.0 / max(-mv.z, 0.5), 1.5, 5.0);
          vA = 0.35 + 0.45 * sin(uTime * 1.5 + aSeed * 2.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.05, d) * vA * 0.6);
        }
      `,
    });
    const dustCloud = new THREE.Points(dustGeo, dustMat);
    scene.add(dustCloud);

    // 3. Load Full-Resolution Shrine Photo & Build Solid Full-Depth 3D Mesh
    let shrineMesh: THREE.Mesh | null = null;
    let shrineGeo: THREE.BufferGeometry | null = null;
    let shrineMat: THREE.MeshBasicMaterial | null = null;
    let shrineTex: THREE.Texture | null = null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (disposed) return;
      shrineGeo = buildFullDepth3DMesh(img, activeScene.profile, depthMeters);
      shrineTex = new THREE.Texture(img);
      shrineTex.colorSpace = THREE.SRGBColorSpace;
      shrineTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      shrineTex.needsUpdate = true;

      shrineMat = new THREE.MeshBasicMaterial({
        map: shrineTex,
        side: THREE.DoubleSide,
      });
      shrineMesh = new THREE.Mesh(shrineGeo, shrineMat);
      scene.add(shrineMesh);
    };
    img.src = assetUrl(activeScene.image);

    // 4. 60fps Real-Time Walk-In & Room-Portal Loop
    const clock = new THREE.Clock();
    let rafId = 0;
    let lastUiSync = 0;

    const animate = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      portalUniforms.uTime.value = elapsed;
      dustUniforms.uTime.value = elapsed;

      const st = camStateRef.current;
      const moveSpeed = 2.6 * dt;
      const minZ = -(depthMeters * 0.62); // Deep inside the 3D hall / near the shrine!
      const maxZ = 3.2; // Standing outside the glowing portal in your room

      if (keysRef.current.f) st.z = Math.max(minZ, st.z - moveSpeed);
      if (keysRef.current.b) st.z = Math.min(maxZ, st.z + moveSpeed);
      if (keysRef.current.l) st.x = Math.max(-1.65, st.x - moveSpeed * 0.75);
      if (keysRef.current.r) st.x = Math.min(1.65, st.x + moveSpeed * 0.75);

      // Inside portal when camera crosses Z < 0.35
      const nowInside = st.z < 0.35;

      // In Room AR mode: keep transparent clear color outside portal so real room shows around the arch!
      // Once you step inside the portal, smoothly immerse you inside the 3D hall.
      const clearAlpha = deployedRef.current ? (nowInside ? 0.82 : 0.0) : 1.0;
      renderer.setClearColor(activeScene.ambientTint, clearAlpha);

      // Hide portal arch softly once you walk past it
      portalGroup.visible = st.z > -0.6;
      floorGuides.forEach((g, idx) => {
        g.visible = st.z > -0.8;
        const s = 1 + 0.08 * Math.sin(elapsed * 2.5 - idx * 0.6);
        g.scale.setScalar(s);
      });

      // Smooth camera position & 360° look-around (drag + mobile gyroscope)
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, st.x, 0.14);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, st.y, 0.14);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, st.z, 0.14);

      const totalYaw = st.yaw + gyroRef.current.yaw;
      const totalPitch = st.pitch + gyroRef.current.pitch;
      const lookTarget = new THREE.Vector3(
        camera.position.x + Math.sin(totalYaw) * 4.5,
        camera.position.y + Math.sin(totalPitch) * 3.0,
        camera.position.z - Math.cos(totalYaw) * 4.5
      );
      camera.lookAt(lookTarget);

      if (elapsed - lastUiSync > 0.1) {
        lastUiSync = elapsed;
        const pct = Math.round(THREE.MathUtils.clamp((maxZ - st.z) / (maxZ - minZ), 0, 1) * 100);
        setWalkPct(pct);
        setInsidePortal(nowInside);
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
      if (shrineGeo) shrineGeo.dispose();
      if (shrineMat) shrineMat.dispose();
      if (shrineTex) shrineTex.dispose();
      portalTubeGeo.dispose();
      portalMat.dispose();
      guideGeo.dispose();
      guideMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      renderer.dispose();
    };
  }, [activeScene, depthMeters]);

  // Smoothly set walk depth from slider (0% = outside portal, 100% = deep inside 3D hall)
  const handleWalkSlider = (pct: number) => {
    setWalkPct(pct);
    const minZ = -(depthMeters * 0.62);
    const maxZ = 3.2;
    camStateRef.current.z = THREE.MathUtils.lerp(maxZ, minZ, pct / 100);
  };

  // One-tap "Deploy in Room" button: activates live room camera + fullscreen + gyro/step sensors!
  const handleToggleDeployInRoom = async () => {
    spatialSound.playPinchTap();
    if (!deployedInRoom) {
      await enableRoomSensors();
      setDeployedInRoom(true);
      setIsFullscreen(true);
      camStateRef.current = { x: 0, y: -0.1, z: 2.65, yaw: 0, pitch: 0 };
    } else {
      setDeployedInRoom(false);
    }
  };

  // Hold-to-walk helper for touch & mouse buttons
  const bindWalkHold = (dir: 'f' | 'b' | 'l' | 'r') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      keysRef.current[dir] = true;
    },
    onPointerUp: () => {
      keysRef.current[dir] = false;
    },
    onPointerLeave: () => {
      keysRef.current[dir] = false;
    },
    onPointerCancel: () => {
      keysRef.current[dir] = false;
    },
  });

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`${
        isFullscreen ? 'fixed inset-0 z-[150]' : 'relative w-full h-full'
      } overflow-hidden bg-[#070a10] text-white select-none flex flex-col`}
    >
      {/* Live Physical Room Camera Feed behind the 3D Portal when Deployed in Room */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          deployedInRoom ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Full-Viewport Three.js Full-Depth 3D Mesh & Spatial Portal Canvas */}
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
          camStateRef.current.yaw = THREE.MathUtils.clamp(
            camStateRef.current.yaw - dx * 0.0045,
            -1.05,
            1.05
          );
          camStateRef.current.pitch = THREE.MathUtils.clamp(
            camStateRef.current.pitch - dy * 0.0038,
            -0.55,
            0.55
          );
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerLeave={() => {
          dragRef.current.active = false;
        }}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Top HUD: Scene Title + Deploy in Room AR Button */}
      <div className="pointer-events-none relative z-20 p-3 sm:p-4 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-2xl bg-black/55 backdrop-blur-xl border border-white/20 px-3.5 py-2.5 max-w-md shadow-2xl">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {insidePortal
                ? t('أنت الآن داخل المشهد ثلاثي الأبعاد الكامل', 'Inside Full-Depth 3D Scene')
                : deployedInRoom
                ? t('البوابة منشورة في غرفتك · تقدّم للأمام للدخول', 'Portal Deployed in Room · Walk Forward to Enter')
                : t('مشهد ثلاثي الأبعاد كامل العمق · Full 3D Mesh', 'Full-Depth 3D Volumetric Mesh')}
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white mt-0.5">
            {t(activeScene.titleAr, activeScene.titleEn)}
          </h2>
          <p className="text-[11px] text-white/75 flex items-center gap-1 mt-0.5">
            <Compass className="w-3 h-3 text-amber-300/80 shrink-0" />
            <span>{t(activeScene.subtitleAr, activeScene.subtitleEn)}</span>
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleDeployInRoom}
            className={`h-10 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xl transition cursor-pointer ${
              deployedInRoom
                ? 'bg-emerald-400 text-black'
                : 'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-black hover:brightness-110'
            }`}
          >
            {deployedInRoom ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            <span>
              {deployedInRoom
                ? t('إيقاف كاميرا الغرفة', 'Exit Room AR')
                : t('نشر البوابة في غرفتك AR', 'Deploy in Room AR')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className="h-10 w-10 rounded-full bg-black/55 hover:bg-white/20 border border-white/25 backdrop-blur-xl flex items-center justify-center transition cursor-pointer"
            title={isFullscreen ? t('تصغير', 'Exit Fullscreen') : t('ملء الشاشة', 'Fullscreen')}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {cameraError && (
        <div className="pointer-events-none relative z-20 mx-auto px-3.5 py-1.5 rounded-full bg-black/65 border border-amber-300/30 text-[11px] text-amber-200">
          {cameraError}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* On-Screen Walk D-Pad (Right/Bottom) + 3 Shrine Scenes Switcher */}
      <div className="pointer-events-none relative z-20 p-3 sm:p-4 flex flex-col items-center gap-2.5">
        {/* ONLY the 3 Uploaded Al-Abbas Holy Shrine Scenes */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
          {SHRINE_SCENES.map((sc, idx) => {
            const active = idx === activeSceneIdx;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => {
                  spatialSound.playPinchTap();
                  setActiveSceneIdx(idx);
                }}
                className={`h-11 pl-3.5 pr-1.5 rounded-full border backdrop-blur-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg ${
                  active
                    ? 'bg-amber-400 text-black border-amber-300 scale-[1.03]'
                    : 'bg-black/60 hover:bg-white/20 text-white border-white/20'
                }`}
              >
                <img
                  src={assetUrl(sc.image)}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border border-white/30"
                />
                <span>{t(sc.titleAr, sc.titleEn)}</span>
              </button>
            );
          })}
        </div>

        {/* Walk-In Controls Bar */}
        <div className="pointer-events-auto w-full max-w-2xl rounded-[24px] bg-black/65 backdrop-blur-2xl border border-white/20 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.75)] flex flex-wrap items-center gap-3">
          {/* Hold-to-Walk Buttons (Forward / Back / Left / Right) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              {...bindWalkHold('f')}
              className="h-9 px-3 rounded-full bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1 shadow active:scale-95 cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>{t('ادخل للأمام', 'Walk In')}</span>
            </button>
            <button
              type="button"
              {...bindWalkHold('b')}
              className="h-9 px-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1 active:scale-95 cursor-pointer"
              title={t('رجوع للخلف', 'Walk Back')}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              {...bindWalkHold('l')}
              className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-95 cursor-pointer"
              title={t('يسار', 'Strafe Left')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              {...bindWalkHold('r')}
              className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-95 cursor-pointer"
              title={t('يمين', 'Strafe Right')}
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Walk Depth Slider */}
          <div className="flex-1 min-w-[160px] flex items-center gap-2">
            <Footprints className="w-4 h-4 text-amber-300 shrink-0" />
            <input
              type="range"
              min={0}
              max={100}
              value={walkPct}
              onChange={(e) => handleWalkSlider(Number(e.target.value))}
              aria-label={t('التقدم داخل المشهد', 'Walk Into 3D Scene')}
              className="flex-1 accent-amber-400 h-1.5 bg-white/20 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono text-white/80 w-9 text-end">{walkPct}%</span>
          </div>

          {/* 3D Depth Strength + Reset */}
          <div className="flex items-center gap-2 shrink-0 text-[11px]">
            <span className="text-white/70">{t('العمق 3D', '3D Depth')}</span>
            <input
              type="range"
              min={4}
              max={13}
              step={0.5}
              value={depthMeters}
              onChange={(e) => setDepthMeters(Number(e.target.value))}
              className="w-16 accent-cyan-400 h-1 bg-white/20 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() => {
                camStateRef.current = { x: 0, y: -0.1, z: 2.35, yaw: 0, pitch: 0 };
                setWalkPct(18);
              }}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              title={t('إعادة ضبط الموقع', 'Reset Position')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
