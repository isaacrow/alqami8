import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CodeReader } from '../../scan/codeReader';
import { markerPose } from '../../scan/markerPose';
import { disposeObject, downscaleTextures, getDracoLoader } from '../../utils/modelMemory';

/**
 * Marker AR on a QR label: once a label is recognised, its object's 3D model stands on the QR code and stays on it
 * as the phone moves. The QR's four corners are followed every frame (a small, QR-only read), its pose comes from
 * the corners (markerPose), and the model is drawn over the camera with the same crop as the video (object-fit:
 * cover), smoothed so it does not shake. When the QR leaves the view, the model fades and waits for it.
 *
 * The phone camera's vertical field of view is taken as 60° (portrait iPhone main camera ≈ 60–65°).
 */
const FOV = 60;

export const QrModelAR: React.FC<{ video: React.RefObject<HTMLVideoElement | null>; model: string; code: string }> = ({ video, model, code }) => {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'tracking' | 'searching'>('loading');

  useEffect(() => {
    const el = host.current;
    const v = video.current;
    if (!el || !v) return;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.position = 'absolute';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1));
    const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);

    // The marker frame (pose of the QR) and, inside it, the model standing on it.
    const marker = new THREE.Group();
    marker.matrixAutoUpdate = false;
    marker.visible = false;
    scene.add(marker);
    const stand = new THREE.Group();
    stand.rotation.x = Math.PI / 2; // the model's up (+Y) along the QR's normal (+Z, towards the camera)
    marker.add(stand);
    // A soft shadow under it.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    shadow.position.z = 0.002;
    marker.add(shadow);

    let object: THREE.Object3D | null = null;
    new GLTFLoader()
      .setDRACOLoader(getDracoLoader())
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(model)
      .then((gltf) => {
        if (disposed) return disposeObject(gltf.scene);
        object = gltf.scene;
        downscaleTextures(object, 1024);
        // Stand on the QR: base on the plane, about 1.6× the QR's side tall, centred.
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const s = 1.6 / Math.max(size.x, size.y, size.z);
        object.scale.setScalar(s);
        const c = box.getCenter(new THREE.Vector3());
        object.position.set(-c.x * s, -box.min.y * s, -c.z * s);
        stand.add(object);
        setState('searching');
      })
      .catch(() => setState('searching'));

    // Canvas over the video with the video's cover crop, so the 3D lines up with the picture.
    const layout = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const vw = v.videoWidth || W;
      const vh = v.videoHeight || H;
      const s = Math.max(W / vw, H / vh);
      const cw = vw * s;
      const ch = vh * s;
      renderer.setSize(cw, ch, false);
      Object.assign(renderer.domElement.style, { width: `${cw}px`, height: `${ch}px`, left: `${(W - cw) / 2}px`, top: `${(H - ch) / 2}px` });
      camera.aspect = vw / vh;
      camera.updateProjectionMatrix();
    };

    const reader = new CodeReader();
    const target = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const curPos = new THREE.Vector3();
    const curQuat = new THREE.Quaternion();
    const curScl = new THREE.Vector3(1, 1, 1);
    let have = false;
    let lastSeen = 0;
    let busy = false;
    let raf = 0;
    let t0 = performance.now();

    const frame = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - t0) / 1000);
      t0 = now;
      layout();
      // Follow the QR (one read at a time; ~15–25 per second on a phone).
      if (!busy && v.videoWidth) {
        busy = true;
        void reader
          .read(v, 640, true)
          .then((hit) => {
            if (hit?.corners && hit.text === code) {
              const m = markerPose(
                hit.corners.map(([x, y]) => [x * v.videoWidth, y * v.videoHeight] as [number, number]),
                v.videoWidth,
                v.videoHeight,
                FOV
              );
              if (m) {
                target.copy(m);
                lastSeen = performance.now();
                if (!have) {
                  target.decompose(curPos, curQuat, curScl);
                  have = true;
                }
              }
            }
          })
          .catch(() => undefined)
          .finally(() => (busy = false));
      }
      const fresh = now - lastSeen < 700;
      if (have) {
        target.decompose(pos, quat, scl);
        const k = 1 - Math.exp(-dt * 14);
        curPos.lerp(pos, k);
        curQuat.slerp(quat, k);
        marker.matrix.compose(curPos, curQuat, curScl);
        marker.matrixWorldNeedsUpdate = true;
      }
      marker.visible = have && fresh && Boolean(object);
      if (object) {
        stand.rotation.y += dt * 0.25; // a slow turn, so every side shows
        setState(marker.visible ? 'tracking' : 'searching');
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      reader.dispose();
      if (object) disposeObject(object);
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [video, model, code]);

  return (
    <div ref={host} className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
      {state !== 'tracking' && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+104px)] inset-x-0 flex justify-center">
          <span className="px-3 py-1 rounded-full bg-black/60 text-white text-[11.5px]">
            {state === 'loading' ? 'يحمّل المجسّم… · Loading the 3D model…' : 'وجّه الكاميرا إلى رمز QR · Point at the QR code'}
          </span>
        </div>
      )}
    </div>
  );
};
