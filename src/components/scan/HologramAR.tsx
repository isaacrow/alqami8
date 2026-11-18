import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeObject, downscaleTextures, getDracoLoader } from '../../utils/modelMemory';
import { assetUrl } from '../../utils/assetUrl';

/**
 * The object's 3D hologram beside it in the camera view, brought over from alqami3's scan mode (its "XR artifact
 * deployer") and joined to ALQAMI's recognition: when a 3D object is recognised, its model floats next to it, linked
 * to it by a glowing line, and gently bobs. Because recognition also says which side of the object is in view, the
 * twin turns to show that same side; drag it to turn it yourself, tap it to play its animation (a book opens). Its
 * parts are marked with pins (the annotations of its record); tap a pin to read about that part.
 */

export interface HologramPin {
  position: [number, number, number];
  title: { ar: string; en: string };
  text?: { ar: string; en: string };
}

interface RecordModel {
  id: string;
  model?: { annotations?: Array<{ position: string; title: { ar: string; en: string }; text?: { ar: string; en: string } }> };
}

let recordsPromise: Promise<RecordModel[]> | null = null;
/** The parts of a built-in object marked on its model (records-data.json, as in the gallery's 3D viewer). */
export async function pinsFor(id: string): Promise<HologramPin[]> {
  recordsPromise ??= fetch(assetUrl('/records-data.json'))
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const rec = (await recordsPromise).find((r) => r.id === id);
  if (rec?.model?.annotations?.length) {
    return rec.model.annotations.map((a) => ({
      position: a.position.trim().split(/\s+/).map(Number) as [number, number, number],
      title: a.title,
      text: a.text,
    }));
  }
  if (id.startsWith('KFL-')) {
    return [
      {
        position: [0, 0.22, 0.08],
        title: { ar: 'الزخرفة والنقش التراثي', en: 'Heritage Inscription & Motif' },
        text: {
          ar: 'تفاصيل النقوش الدقيقة المحفوظة في قاعة متحف الكفيل للنفائس والمخطوطات.',
          en: 'Fine surface craftsmanship preserved in the Al-Kafeel Museum of Treasures & Manuscripts.',
        },
      },
      {
        position: [0.12, -0.1, 0.08],
        title: { ar: 'بنية المادة والصناعة', en: 'Material & Craft Structure' },
        text: {
          ar: 'بنية ثلاثية الأبعاد مُستخرجة بتقنية Depth-Anything-V2 وRMBG-1.4 من صورة القطعة الأصلية.',
          en: 'Watertight 3D relief geometry reconstructed via Depth-Anything-V2 & RMBG-1.4.',
        },
      },
    ];
  }
  return [];
}

const SIZE = 150; // the twin's height on screen (px)

export const HologramAR: React.FC<{
  model: string;
  /** The object's point on screen (px, in the parent box). */
  at: { x: number; y: number };
  /** The side in view (degrees around the object, 0 = its front), from recognition; null = unknown. */
  angle: number | null;
  pins: HologramPin[];
}> = ({ model, at, angle, pins }) => {
  const host = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLButtonElement>(null);
  const line = useRef<SVGPathElement>(null);
  const pinEls = useRef<Array<HTMLButtonElement | null>>([]);
  const live = useRef({ at, angle });
  live.current = { at, angle };
  const [openPin, setOpenPin] = useState<number | null>(null);
  const [hasAnim, setHasAnim] = useState(false);
  const toggle = useRef<() => void>(() => undefined);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.8);
    key.position.set(2, 4, 3);
    scene.add(key);
    // alqami3's cyan rim light: the hologram look.
    const rim = new THREE.PointLight(0x00f2fe, 2.5, 8);
    rim.position.set(0, 0.6, -1.2);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 50);

    const root = new THREE.Group(); // placed beside the object, at a fixed depth
    const turn = new THREE.Group(); // turned to the side in view
    root.add(turn);
    root.scale.setScalar(0.001);
    scene.add(root);
    // A glowing ring under the twin.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.46, 64),
      new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.52;
    root.add(ring);

    let object: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let action: THREE.AnimationAction | null = null;
    let open = false;
    const pinAnchors: THREE.Object3D[] = [];
    new GLTFLoader()
      .setDRACOLoader(getDracoLoader())
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(model)
      .then((gltf) => {
        if (disposed) return disposeObject(gltf.scene);
        object = gltf.scene;
        downscaleTextures(object, 1024);
        // Fit into a unit-high box centred on the origin; pins are children of the model, so they follow it.
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const s = 1 / Math.max(size.x, size.y, size.z, 1e-6);
        const c = box.getCenter(new THREE.Vector3());
        const holder = new THREE.Group();
        holder.scale.setScalar(s);
        holder.position.set(-c.x * s, -c.y * s, -c.z * s);
        holder.add(object);
        turn.add(holder);
        for (const p of pins) {
          const a = new THREE.Object3D();
          a.position.set(...p.position);
          object.add(a);
          pinAnchors.push(a);
        }
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(object);
          const clip = gltf.animations.find((x) => /open/i.test(x.name)) ?? gltf.animations[0];
          action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          setHasAnim(true);
        }
      })
      .catch(() => undefined);

    // Tap: play the animation forwards, tap again: backwards (alqami3's open/close book).
    toggle.current = () => {
      if (!action) return;
      action.paused = false;
      if (!open) {
        action.reset();
        action.timeScale = 1;
      } else action.timeScale = -1;
      action.play();
      open = !open;
    };

    // Drag to turn (it goes back to following the side in view a few seconds later).
    let drag: { x: number; yaw: number } | null = null;
    let userYaw = 0;
    let userUntil = 0;
    const hb = hit.current!;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, yaw: userYaw };
      hb.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      userYaw = drag.yaw + (e.clientX - drag.x) * 0.015;
      userUntil = performance.now() + 4000;
    };
    const up = (e: PointerEvent) => {
      if (drag && Math.abs(e.clientX - drag.x) < 6) toggle.current();
      drag = null;
    };
    hb.addEventListener('pointerdown', down);
    hb.addEventListener('pointermove', move);
    hb.addEventListener('pointerup', up);
    hb.addEventListener('pointercancel', () => (drag = null));

    const clock = new THREE.Clock();
    let yaw = 0;
    let scale = 0.001;
    const pos = new THREE.Vector3();
    const target = new THREE.Vector3();
    const v = new THREE.Vector3();
    let raf = 0;
    let first = true;
    const frame = () => {
      if (disposed) return;
      const dt = Math.min(0.1, clock.getDelta());
      const t = clock.elapsedTime;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (renderer.domElement.width !== Math.round(W * renderer.getPixelRatio())) renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();

      // Beside the object, on the side with more room, a little lower than it (the record card sits above it).
      const { at: p, angle: side } = live.current;
      const right = p.x < W / 2;
      const sx = Math.min(W - SIZE / 2 - 8, Math.max(SIZE / 2 + 8, p.x + (right ? 1 : -1) * (SIZE * 0.75)));
      const sy = Math.min(H - SIZE / 2 - 90, Math.max(SIZE / 2 + 120, p.y + 40));
      // Screen point → 3D at a depth where the twin is SIZE px tall.
      const depth = (H / SIZE) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * depth;
      target.set(((sx / W) * 2 - 1) * (visH * camera.aspect) / 2, (1 - (sy / H) * 2) * visH / 2, -depth);
      if (first) pos.copy(target), (first = false);
      pos.lerp(target, 1 - Math.exp(-dt * 8));
      root.position.copy(pos);
      root.position.y += Math.sin(t * 2.2) * 0.035;
      scale += ((object ? 1 : 0.001) - scale) * (1 - Math.exp(-dt * 7));
      root.scale.setScalar(scale);

      // Turn to the side in view (renders: azimuth a = camera at a° around the model, so turn the model by -a).
      const want = performance.now() < userUntil ? userYaw : side != null ? -THREE.MathUtils.degToRad(side) : yaw + dt * 0.4;
      let d = want - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * (1 - Math.exp(-dt * 5));
      if (performance.now() >= userUntil) userYaw = yaw;
      turn.rotation.y = yaw;
      ring.material.opacity = 0.45 + Math.sin(t * 4) * 0.2;
      mixer?.update(dt);
      renderer.render(scene, camera);

      // The tap/drag area over the twin, and the glowing line from the object to it.
      Object.assign(hb.style, { left: `${sx - SIZE / 2}px`, top: `${sy - SIZE / 2}px`, width: `${SIZE}px`, height: `${SIZE}px`, display: object ? 'block' : 'none' });
      line.current?.setAttribute('d', `M ${p.x} ${p.y} Q ${(p.x + sx) / 2} ${Math.max(p.y, sy) + 30} ${sx} ${sy + SIZE * 0.42}`);
      line.current?.setAttribute('opacity', object ? String(0.5 + Math.sin(t * 4) * 0.25) : '0');

      // Pins on the twin's parts; hidden while the part faces away.
      root.updateMatrixWorld();
      pinAnchors.forEach((a, i) => {
        const pe = pinEls.current[i];
        if (!pe) return;
        a.getWorldPosition(v);
        const facing = v.clone().sub(root.position).setY(0).normalize().z > -0.2;
        v.project(camera);
        Object.assign(pe.style, {
          transform: `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -50%)`,
          opacity: scale > 0.6 && facing ? '1' : '0',
          pointerEvents: scale > 0.6 && facing ? 'auto' : 'none',
        });
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      hb.removeEventListener('pointerdown', down);
      hb.removeEventListener('pointermove', move);
      hb.removeEventListener('pointerup', up);
      if (object) disposeObject(object);
      ring.geometry.dispose();
      ring.material.dispose();
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // pins are read once per model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  return (
    <div ref={host} className="absolute inset-0 pointer-events-none">
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <filter id="holo-glow">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        <path ref={line} fill="none" stroke="#00f2fe" strokeWidth="2" strokeDasharray="6 5" filter="url(#holo-glow)" opacity="0" />
      </svg>
      <button
        ref={hit}
        aria-label={hasAnim ? 'Play its movement' : 'Turn the model'}
        title={hasAnim ? 'اضغط لتحريكه، اسحب لتدويره · Tap to play, drag to turn' : 'اسحب لتدويره · Drag to turn'}
        className="absolute pointer-events-auto rounded-full touch-none"
        style={{ display: 'none' }}
      />
      {pins.map((p, i) => (
        <button
          key={i}
          ref={(b) => (pinEls.current[i] = b)}
          onClick={() => setOpenPin(openPin === i ? null : i)}
          aria-label={p.title.en}
          className="absolute left-0 top-0 w-7 h-7 rounded-full bg-[#00f2fe]/25 border-2 border-[#00f2fe] shadow-[0_0_12px_#00f2fe] flex items-center justify-center text-[11px] font-bold text-white transition-opacity"
          style={{ opacity: 0 }}
        >
          {i + 1}
        </button>
      ))}
      {openPin != null && pins[openPin] && (
        <div dir="rtl" className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+24px)] pointer-events-auto rounded-2xl bg-black/75 backdrop-blur-md border border-[#00f2fe]/50 text-white p-3 shadow-2xl">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[13.5px] font-semibold">
              {openPin + 1}. {pins[openPin].title.ar} · <span className="text-white/70 font-normal">{pins[openPin].title.en}</span>
            </p>
            <button onClick={() => setOpenPin(null)} aria-label="Close" className="w-6 h-6 rounded-full bg-white/10 shrink-0">
              ×
            </button>
          </div>
          {pins[openPin].text && <p className="mt-1 text-[12px] text-white/85 leading-relaxed">{pins[openPin].text!.ar}</p>}
        </div>
      )}
    </div>
  );
};
