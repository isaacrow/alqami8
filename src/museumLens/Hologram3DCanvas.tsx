import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { assetUrl } from '../utils/assetUrl';
import { disposeObject, getDracoLoader } from '../utils/modelMemory';

interface Hologram3DCanvasProps {
  glbUrl: string;
  initialAngleDeg?: number | null;
  scale?: number;
  autoRotate?: boolean;
  gyroYaw?: number;
  gyroPitch?: number;
  centerX?: number; // 0..1
  centerY?: number; // 0..1
}

export const Hologram3DCanvas: React.FC<Hologram3DCanvasProps> = ({
  glbUrl,
  initialAngleDeg = 0,
  scale = 1,
  autoRotate = true,
  gyroYaw = 0,
  gyroPitch = 0,
  centerX = 0.5,
  centerY = 0.46,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);

  const propsRef = useRef({ scale, autoRotate, gyroYaw, gyroPitch, centerX, centerY });
  propsRef.current = { scale, autoRotate, gyroYaw, gyroPitch, centerX, centerY };

  const userRotRef = useRef({ yaw: ((initialAngleDeg ?? 0) * Math.PI) / 180, pitch: 0.08 });
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  useEffect(() => {
    userRotRef.current.yaw = ((initialAngleDeg ?? 0) * Math.PI) / 180;
  }, [glbUrl, initialAngleDeg]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !glbUrl) return;

    let alive = true;
    setLoading(true);
    setLoadErr(false);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(
      40,
      (host.clientWidth || window.innerWidth) / Math.max(1, host.clientHeight || window.innerHeight),
      0.05,
      100
    );
    camera.position.set(0, 0.12, 3.6);

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2.5, 4, 3.5);
    const fill = new THREE.DirectionalLight(0xdbeafe, 0.7);
    fill.position.set(-3, 1, 2);
    const rim = new THREE.DirectionalLight(0xfef3c7, 0.65);
    rim.position.set(0, -2, -3);
    scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.45));

    const pivot = new THREE.Group();
    scene.add(pivot);

    // Subtle floating holographic pedestal ring underneath the 3D object
    const ringGeo = new THREE.RingGeometry(0.68, 0.72, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.82;
    pivot.add(ring);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(getDracoLoader());

    let loadedModel: THREE.Object3D | null = null;
    const resolved = /^https?:\/\//i.test(glbUrl) ? glbUrl : assetUrl(glbUrl.replace(/^\.\//, ''));

    loader.load(
      resolved,
      (gltf) => {
        if (!alive) {
          disposeObject(gltf.scene);
          return;
        }
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const normScale = 1.55 / maxDim;
        root.scale.setScalar(normScale);
        root.position.sub(center.multiplyScalar(normScale));
        pivot.add(root);
        loadedModel = root;
        setLoading(false);
      },
      undefined,
      () => {
        if (alive) {
          setLoading(false);
          setLoadErr(true);
        }
      }
    );

    const onResize = () => {
      if (!host || !alive) return;
      const w = host.clientWidth || window.innerWidth;
      const h = Math.max(1, host.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    const animate = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const p = propsRef.current;
      if (p.autoRotate && !dragRef.current.active) {
        userRotRef.current.yaw += dt * 0.42;
      }

      // Smoothly position hologram over tracked object center
      const targetX = (p.centerX - 0.5) * 2.1;
      const targetY = (0.46 - p.centerY) * 1.6 + Math.sin(now * 0.002) * 0.035;
      pivot.position.x += (targetX - pivot.position.x) * 0.14;
      pivot.position.y += (targetY - pivot.position.y) * 0.14;
      pivot.scale.setScalar(p.scale);
      pivot.rotation.y = userRotRef.current.yaw + p.gyroYaw * 0.6;
      pivot.rotation.x = THREE.MathUtils.clamp(userRotRef.current.pitch + p.gyroPitch * 0.4, -0.75, 0.75);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (loadedModel) disposeObject(loadedModel);
      ringGeo.dispose();
      ringMat.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [glbUrl]);

  return (
    <div
      ref={hostRef}
      onPointerDown={(e) => {
        dragRef.current = { active: true, x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragRef.current.active) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        dragRef.current = { active: true, x: e.clientX, y: e.clientY };
        userRotRef.current.yaw += dx * 0.012;
        userRotRef.current.pitch = Math.max(-0.7, Math.min(0.7, userRotRef.current.pitch + dy * 0.008));
      }}
      onPointerUp={(e) => {
        dragRef.current.active = false;
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      }}
      className="absolute inset-0 z-10 touch-none cursor-grab active:cursor-grabbing"
    >
      {loading && !loadErr && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ml-glass-pill px-4 py-2 text-xs font-bold text-slate-950 flex items-center gap-2 pointer-events-none">
          <span className="w-3.5 h-3.5 border-2 border-slate-900/30 border-t-slate-950 rounded-full animate-spin" />
          <span>Loading 3D Hologram…</span>
        </div>
      )}
    </div>
  );
};

export default Hologram3DCanvas;
