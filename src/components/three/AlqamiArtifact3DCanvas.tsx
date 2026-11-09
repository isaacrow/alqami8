import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeObject, downscaleTextures, getDracoLoader } from '../../utils/modelMemory';
import { isScannerOpen, onScannerChange } from '../../utils/scannerState';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ArrowRight } from 'lucide-react';
import { assetUrl } from '../../utils/assetUrl';
import { applyLightingToThreeScene } from '../../utils/lightingManager';
import { spatialSound } from '../../utils/spatialSound';

export interface ArtifactFeaturePoint {
  id: string;
  x?: number; // fallback percentage (0 - 100)
  y?: number; // fallback percentage (0 - 100)
  localPos?: [number, number, number]; // exact [X, Y, Z] 3D mesh coordinates
  title: { ar: string; en: string };
  desc: { ar: string; en: string };
  price?: number;
  badge?: { ar: string; en: string };
  onInspect?: () => void;
}

interface AlqamiArtifact3DCanvasProps {
  glbUrl: string;
  autoRotate?: boolean;
  mode?: 'embedded' | 'popout' | 'banner' | 'card';
  className?: string;
  featurePoints?: ArtifactFeaturePoint[];
  lang?: 'ar' | 'en';
}

export const AlqamiArtifact3DCanvas: React.FC<AlqamiArtifact3DCanvasProps> = ({
  glbUrl,
  autoRotate = true,
  mode = 'embedded',
  className = '',
  featurePoints = [],
  lang = 'ar',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const featurePointsRef = useRef(featurePoints);
  featurePointsRef.current = featurePoints;

  const isAr = lang === 'ar';

  // Only hold a WebGL context while the viewer is on (or near) the screen; a page full of live
  // contexts runs iPhone Safari out of memory.
  const [inView, setInView] = useState(false);
  // A camera scanner (recognition model + camera) needs the memory: every viewer stops while one is open.
  const [paused, setPaused] = useState(isScannerOpen());
  useEffect(() => onScannerChange(setPaused), []);
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '150px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !inView || paused) return;

    setLoading(true);

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    // Camera placed directly on Z-axis, centered at Y=0, looking straight at (0, 0, 0)
    // Mode popout starts further back with targetSize 0.95 so tall models have generous headroom and never touch window borders
    let currentCamDist = mode === 'popout' ? 2.35 : mode === 'card' ? 1.65 : mode === 'banner' ? 2.1 : 1.75;
    camera.position.set(0, 0, currentCamDist);
    camera.lookAt(0, 0, 0);

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: true,
      powerPreference: isMobile ? 'low-power' : 'high-performance',
    });
    renderer.setPixelRatio(Math.min(isMobile ? 1.25 : 2, window.devicePixelRatio || 1));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(renderer.domElement);

    // Realistic PBR Environment Map (from RoomEnvironment for glowing metallic/gold reflections)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = pmremGenerator.fromScene(new RoomEnvironment()).texture;
    scene.environment = roomEnv;

    // Enhanced Museum Studio Lighting (Warm Key, Cool Fill, Gold Specular Highlights)
    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfffaec, 2.8);
    keyLight.position.set(2.5, 4.5, 3.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb2d2ff, 1.5);
    fillLight.position.set(-3.5, 2.0, 2.0);
    scene.add(fillLight);

    const goldAccentLight = new THREE.DirectionalLight(0xffdf80, 1.6);
    goldAccentLight.position.set(0, 3.5, -3.0);
    scene.add(goldAccentLight);

    const pointLight = new THREE.PointLight(0xffe6a3, 1.5, 6);
    pointLight.position.set(0, 0.8, 1.5);
    scene.add(pointLight);

    // Apply global lighting configuration and subscribe to lighting changes
    applyLightingToThreeScene(renderer, ambient, keyLight, fillLight, goldAccentLight, pointLight);
    const onLightingChange = () => {
      applyLightingToThreeScene(renderer, ambient, keyLight, fillLight, goldAccentLight, pointLight);
    };
    window.addEventListener('visionos:lighting-change', onLightingChange);

    // Floor contact shadow
    const shadowGeo = new THREE.PlaneGeometry(1.8, 1.8);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(canvas);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.65, depthWrite: false });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -0.45;
    if (mode !== 'banner') { scene.add(shadowMesh); }

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);
    const loader = new GLTFLoader();
    try {
      loader.setDRACOLoader(getDracoLoader());
    } catch (e) {
      console.warn('Draco setup warning:', e);
    }
    let loadedRoot: THREE.Object3D | null = null;

    let disposed = false;
    const safetyTimer = window.setTimeout(() => {
      if (!disposed) setLoading(false);
    }, 4000);

    loader.load(
      assetUrl(glbUrl),
      (gltf) => {
        window.clearTimeout(safetyTimer);
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        try {
          const root = gltf.scene;
          loadedRoot = root;
          if (isMobile) downscaleTextures(root, 512);
          root.updateMatrixWorld(true);
          root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach((mat) => {
                  if ('envMapIntensity' in mat) {
                    (mat as THREE.MeshStandardMaterial).envMapIntensity = 1.45;
                  }
                  if ('roughness' in mat && typeof (mat as THREE.MeshStandardMaterial).roughness === 'number') {
                    const m = mat as THREE.MeshStandardMaterial;
                    if (m.metalness > 0.3) {
                      m.roughness = Math.max(0.12, m.roughness * 0.9);
                    }
                  }
                  mat.needsUpdate = true;
                });
              }
            }
          });
          const box = new THREE.Box3().setFromObject(root);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;

          // Framing scale: popout and banner have safe non-clipping border margins
          const targetSize = mode === 'banner' ? 1.0 : mode === 'popout' ? 0.95 : mode === 'card' ? 0.82 : 1.15;
          const targetScale = targetSize / maxDim;

          // Create pivot group:
          const pivot = new THREE.Group();
          pivot.name = 'pivot';

          // Center root inside pivot so (0,0,0) is EXACTLY the center of the bounding box
          root.position.set(-center.x, -center.y, -center.z);
          pivot.add(root);
          pivot.scale.setScalar(targetScale);

          modelRoot.add(pivot);

          // Position shadow directly beneath the bottom of the object
          const halfY = (size.y * targetScale) / 2;
          shadowMesh.position.y = -halfY - 0.02;
          const horizRadius = Math.max(size.x, size.z) * targetScale * 0.85;
          shadowMesh.scale.set(Math.max(0.7, horizRadius * 1.8), Math.max(0.7, horizRadius * 1.8), 1);
        } catch (err) {
          console.error('Error processing model hierarchy:', err);
        } finally {
          setLoading(false);
          renderer.render(scene, camera);
        }
      },
      undefined,
      (err) => {
        window.clearTimeout(safetyTimer);
        if (disposed) return;
        console.warn('Failed to load GLTF model:', glbUrl, err);
        const fallbackGeo = new THREE.BoxGeometry(0.7, 0.45, 0.1);
        const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xc8aa78, roughness: 0.5, metalness: 0.1 });
        modelRoot.add(new THREE.Mesh(fallbackGeo, fallbackMat));
        setLoading(false);
        renderer.render(scene, camera);
      }
    );

    // Pointer Interaction & Touch Control (Initial movement copies large-thumbnail20230914-22636-1i3w6cl.mp4)
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let baseRotX = mode === 'popout' ? -0.15 : 0.14;
    let baseRotY = mode === 'popout' ? -0.28 : 0.35;
    let curRotX = baseRotX;
    let curRotY = baseRotY;
    let parallaxX = 0;
    let parallaxY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // ignore pointer capture exceptions
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) {
        if (modeRef.current === 'banner') {
          const rect = container.getBoundingClientRect();
          parallaxY = ((e.clientX - rect.left) / rect.width - 0.5) * 0.45;
          parallaxX = ((e.clientY - rect.top) / rect.height - 0.5) * 0.25;
        }
        return;
      }
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      const maxTilt = modeRef.current === 'popout' ? Math.PI * 0.92 : 1.25;
      baseRotY += dx * 0.007;
      baseRotX = Math.max(-maxTilt, Math.min(maxTilt, baseRotX + dy * 0.007));
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);

    // Interactive Zoom In / Out via Mouse Wheel & Touch Pinch (Requested for img 1 and img 2)
    const minCamDist = 0.75;
    const maxCamDist = 4.2;

    const onWheel = (e: WheelEvent) => {
      // Zoom available in popout (img 1) and embedded/detail (img 2)
      if (modeRef.current === 'popout' || modeRef.current === 'embedded') {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY * 0.0022;
        currentCamDist = Math.max(minCamDist, Math.min(maxCamDist, currentCamDist + delta));
      }
    };

    let touchStartDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDist > 0) {
        if (modeRef.current === 'popout' || modeRef.current === 'embedded') {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const newDist = Math.hypot(dx, dy);
          const factor = (touchStartDist - newDist) * 0.005;
          touchStartDist = newDist;
          currentCamDist = Math.max(minCamDist, Math.min(maxCamDist, currentCamDist + factor));
        }
      }
    };

    const onTouchEnd = () => {
      touchStartDist = 0;
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });

    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 480;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      if (modeRef.current === 'card') {
        if (autoRotateRef.current && !isDragging) {
          baseRotY += 0.0035;
        }
        curRotY += (baseRotY - curRotY) * 0.1;
        curRotX += (baseRotX - curRotX) * 0.1;
        modelRoot.rotation.y = curRotY;
        modelRoot.rotation.x = curRotX;
        renderer.render(scene, camera);
        return;
      }

      if (modeRef.current === 'banner') {
        modelRoot.position.set(0, 0, 0);
        modelRoot.rotation.x = 0.12;
        modelRoot.rotation.z = 0;
        baseRotY += 0.0028;
        curRotY += (baseRotY + parallaxY - curRotY) * 0.045;
        modelRoot.rotation.y = curRotY;
      } else {
        if (autoRotateRef.current && !isDragging) baseRotY += 0.0022;
        curRotX += (baseRotX - curRotX) * 0.045;
        curRotY += (baseRotY - curRotY) * 0.045;
        modelRoot.rotation.x = curRotX;
        modelRoot.rotation.y = curRotY;
      }

      // Track 3D shape: project local 3D points on the rotating mesh to 2D screen positions every frame
      const currentPoints = featurePointsRef.current;
      if (currentPoints.length > 0 && container) {
        modelRoot.updateMatrixWorld(true);
        const cw = container.clientWidth || 480;
        const ch = container.clientHeight || 420;
        const tempV = new THREE.Vector3();

        currentPoints.forEach((pt, idx) => {
          const el = dotRefs.current[idx];
          if (!el) return;

          const lx = pt.localPos ? pt.localPos[0] : ((pt.x ?? 50) / 100 - 0.5) * 0.65;
          const ly = pt.localPos ? pt.localPos[1] : (-((pt.y ?? 50) / 100) + 0.5) * 0.65;
          const lz = pt.localPos ? pt.localPos[2] : 0.22;

          tempV.set(lx, ly, lz);
          tempV.applyMatrix4(modelRoot.matrixWorld);

          const isFront = tempV.z > -0.15;
          tempV.project(camera);

          const sx = (tempV.x * 0.5 + 0.5) * cw;
          const sy = (-(tempV.y * 0.5) + 0.5) * ch;

          el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
          el.style.opacity = isFront ? '1' : '0.2';
          el.style.pointerEvents = isFront ? 'auto' : 'none';
          el.dataset.nearBottom = sy > ch * 0.52 ? 'true' : 'false';
          el.dataset.nearRight = sx > cw * 0.5 ? 'true' : 'false';
        });
      }

      // Smooth Zoom Damping
      camera.position.z += (currentCamDist - camera.position.z) * 0.14;

      renderer.render(scene, camera);
    };
    reqId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.removeEventListener('visionos:lighting-change', onLightingChange);
      pmremGenerator.dispose();
      roomEnv.dispose();
      cancelAnimationFrame(reqId);
      ro.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      if (loadedRoot) disposeObject(loadedRoot);
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [glbUrl, mode, inView, paused]);

  return (
    <div className={`relative w-full h-full flex items-center justify-center select-none pointer-events-auto overflow-visible ${className}`}>
      <div ref={mountRef} className="w-full h-full touch-none cursor-grab active:cursor-grabbing pointer-events-auto" />

      {/* Interactive 3D Feature Hotspot Points that dynamically track the 3D surface */}
      {!loading && featurePoints.map((pt, idx) => {
        const isHovered = hoveredPointId === pt.id;
        const isNearBottom = dotRefs.current[idx]?.dataset?.nearBottom === 'true';
        const isNearRight = dotRefs.current[idx]?.dataset?.nearRight === 'true';

        return (
          <div
            ref={(el) => (dotRefs.current[idx] = el)}
            key={pt.id}
            className="absolute top-0 left-0 room-hotspot-pin pointer-events-auto z-30 transition-opacity duration-200"
            onMouseEnter={() => {
              spatialSound.playPinchTap();
              setHoveredPointId(pt.id);
            }}
            onMouseLeave={() => setHoveredPointId(null)}
          >
            {/* Pulsing Outer Ring */}
            <span className="w-7 h-7 rounded-full bg-white/30 animate-ping absolute -top-1.5 -left-1.5 pointer-events-none" />

            {/* Hotspot Disc */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                spatialSound.playPinchTap();
                setHoveredPointId((prev) => (prev === pt.id ? null : pt.id));
              }}
              className={`w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-all shadow-xl backdrop-blur-md ${
                isHovered
                  ? 'bg-amber-400 text-black border-2 border-white scale-125'
                  : 'bg-black/65 hover:bg-black/90 text-white border border-white/80'
              }`}
              title={isAr ? pt.title.ar : pt.title.en}
            >
              <span className={`w-2 h-2 rounded-full ${isHovered ? 'bg-black' : 'bg-white shadow-[0_0_6px_#fff]'}`} />
            </button>

            {/* Hover Floating Card Matching Image 1 (media_1792751103967_ee698720.png) - Auto-adjusts so it NEVER clips */}
            {isHovered && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute z-50 p-3.5 rounded-2xl bg-[#362e26fa] backdrop-blur-2xl border border-white/25 shadow-[0_20px_50px_rgba(0,0,0,0.85)] text-white min-w-[210px] pointer-events-auto transition-all animate-in fade-in zoom-in-95 ${
                  isNearRight ? 'right-0 -translate-x-3' : 'left-0 translate-x-3'
                } ${
                  isNearBottom ? 'bottom-8' : 'top-8'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <h4 className="text-[13.5px] font-bold text-white leading-tight truncate">
                      {isAr ? pt.title.ar : pt.title.en}
                    </h4>
                    <p className="text-[11px] text-white/75 leading-tight line-clamp-2">
                      {isAr ? pt.desc.ar : pt.desc.en}
                    </p>
                    {pt.price !== undefined ? (
                      <p className="text-[12.5px] font-bold text-white pt-1 font-mono">
                        ${pt.price} <span className="text-[10.5px] font-normal text-white/70">{isAr ? '/ قطعة' : '/ piece'}</span>
                      </p>
                    ) : pt.badge ? (
                      <p className="text-[11.5px] font-bold text-amber-300 pt-1 font-mono">
                        {isAr ? pt.badge.ar : pt.badge.en}
                      </p>
                    ) : null}
                  </div>
                  {pt.onInspect && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        spatialSound.playPinchTap();
                        pt.onInspect?.();
                      }}
                      className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white transition active:scale-95 flex-shrink-0 cursor-pointer shadow"
                      title={isAr ? 'فحص ثلاثي الأبعاد' : 'Inspect 3D'}
                    >
                      <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 backdrop-blur-sm pointer-events-none">
          <div className="w-7 h-7 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mb-1.5" />
          <span className="text-[10px] font-mono text-white/80">Loading 3D...</span>
        </div>
      )}
    </div>
  );
};
