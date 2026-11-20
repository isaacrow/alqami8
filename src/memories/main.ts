/**
 * Memories: step into a photograph. Each memory is one photo that Apple's SHARP model turned into a 3D Gaussian splat
 * scene (scripts/memory-splat.py packs it as .spz); Spark (src/vendor/spark) draws it.
 *
 *  - Tap a photo: it grows full screen, the 3D scene fades in behind it from the very same viewpoint, and a dolly-zoom
 *    wakes up the depth. Drag (or turn the phone) to look around, pinch to walk in.
 *  - "In your room": the back camera fills the screen and the memory grows out of the phone as a floating miniature,
 *    held in place by the phone's motion sensor, or by the camera picture when the sensor is not given (VisualGyro).
 *
 * SHARP is an Apple Machine Learning Research Model, licensed for research only; the page says so.
 */
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '../vendor/spark/index.js';
import { VisualGyro } from '../character/visualGyro';
import './memories.css';

interface Meta {
  gaussians: number;
  box: { min: number[]; max: number[] };
  medianDepth: number;
  camera: { width: number; height: number; vfov: number } | null;
}
interface Memory {
  id: string;
  ar: string;
  en: string;
  noteAr: string;
  noteEn: string;
}

const MEMORIES: Memory[] = [
  { id: 'shrine-gate', ar: 'عند الباب', en: 'At the gate', noteAr: 'زائرون أمام باب الحرم والحمام يحلّق', noteEn: 'Pilgrims before the shrine gate, pigeons overhead' },
  // Inside the shrine (shrine-zarih) follows once SHARP finishes it: its first run stalled on this PC's GPU.
  // { id: 'shrine-zarih', ar: 'داخل الحرم', en: 'Inside the shrine', noteAr: 'الشبّاك الشريف تحت الثريّا', noteEn: 'The shrine screen beneath the chandelier' },
  { id: 'shrine-dome', ar: 'على السطح', en: 'On the roof', noteAr: 'القبّة والمئذنتان عند الغروب', noteEn: 'The dome and minarets at dusk' },
];

const BASE = (import.meta.env.BASE_URL as string) || './';
const asset = (p: string) => `${BASE}memories/${p}`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7.5V6a2 2 0 0 0-2-2h-1.5"/><path d="M3 7.5V6a2 2 0 0 1 2-2h1.5"/><path d="M21 16.5V18a2 2 0 0 1-2 2h-1.5"/><path d="M3 16.5V18a2 2 0 0 0 2 2h1.5"/><path d="M12 8 8 10v4l4 2 4-2v-4z"/></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  step: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
};

// ── Gallery ───────────────────────────────────────────────────────────────────────────────────────────────────────
const app = document.getElementById('app')!;
app.innerHTML = `
<main class="mem-gallery">
  <div class="mem-top">
    <a class="mem-round" href="./" aria-label="رجوع · Back">${icon.back}</a>
    <div>
      <h1 class="mem-title">ذكريات · Memories</h1>
      <p class="mem-sub">ادخل إلى الصورة · Step into the photo</p>
    </div>
  </div>
  <div class="mem-list">
    ${MEMORIES.map(
      (m) => `<button class="mem-card" data-id="${m.id}">
        <img src="${asset(m.id + '.jpg')}" alt="${m.ar} · ${m.en}" />
        <h2>${m.ar} · ${m.en}</h2>
        <p>${m.noteAr} · ${m.noteEn}</p>
        <span class="mem-step">${icon.step} ادخل · Step in</span>
      </button>`
    ).join('')}
  </div>
  <p class="mem-note">
    كل مشهد ثلاثي الأبعاد صنعه نموذج Apple SHARP من صورة واحدة، فيُرى من جهة التصوير فقط؛ وهو نموذج بحثي غير تجاري.
    Each 3D scene was made from a single photo by Apple's SHARP model (an Apple Machine Learning Research Model, for research use), so it is seen from the photo's side only.
    Drawn with <a href="https://sparkjs.dev" target="_blank" rel="noreferrer">Spark</a> (World Labs, MIT).
  </p>
</main>
<section class="mem-viewer" hidden>
  <video playsinline muted></video>
  <canvas></canvas>
  <img class="mem-flat" alt="" />
  <div class="mem-loading" hidden><span><i></i>يتحوّل إلى مشهد · Turning into 3D…</span></div>
  <div class="mem-bar">
    <button class="mem-round" data-act="close" aria-label="إغلاق · Close">${icon.close}</button>
    <div class="mem-name"><h2></h2><p>مشهد ثلاثي الأبعاد مولَّد بالذكاء الاصطناعي من صورة واحدة · AI 3D scene from one photo</p></div>
  </div>
  <button class="mem-recenter" data-act="recenter" hidden>أحضرها أمامي · Bring it here</button>
  <div class="mem-foot">
    <button class="mem-main" data-act="mode"></button>
    <p class="mem-hint"></p>
  </div>
</section>`;

const $ = <T extends Element>(s: string) => app.querySelector(s) as T;
const viewer = $<HTMLElement>('.mem-viewer');
const video = $<HTMLVideoElement>('.mem-viewer video');
const canvas = $<HTMLCanvasElement>('.mem-viewer canvas');
const flat = $<HTMLImageElement>('.mem-flat');
const loading = $<HTMLElement>('.mem-loading');
const nameEl = $<HTMLElement>('.mem-name h2');
const modeBtn = $<HTMLButtonElement>('[data-act="mode"]');
const hint = $<HTMLElement>('.mem-hint');
const recenterBtn = $<HTMLButtonElement>('[data-act="recenter"]');

// ── Three + Spark ─────────────────────────────────────────────────────────────────────────────────────────────────
let renderer: THREE.WebGLRenderer | null = null;
let spark: SparkRenderer | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 4000);
/** The memory: `holder` places it (in the room: in front of the phone, small), `splat` is SHARP's scene turned to three.js axes. */
const holder = new THREE.Group();
scene.add(holder);
let splat: SplatMesh | null = null;
let meta: Meta | null = null;
let current: Memory | null = null;
let mode: 'screen' | 'room' = 'screen';
let t0 = 0;

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  spark = new SparkRenderer({ renderer });
  scene.add(spark);
  window.addEventListener('resize', resize);
  resize();
  renderer.setAnimationLoop(frame);
}

function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = mode === 'room' ? 62 : photoFov();
  camera.updateProjectionMatrix();
}

/** The field of view that shows the photo as the flat <img> shows it (object-fit: cover), so the swap is seamless. */
function photoFov() {
  const c = meta?.camera;
  if (!c) return 45;
  const photoAspect = c.width / c.height, screenAspect = innerWidth / innerHeight;
  if (screenAspect <= photoAspect) return c.vfov; // the photo's height fills the screen
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.vfov) / 2) * photoAspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / screenAspect));
}

// ── Looking around (screen) ───────────────────────────────────────────────────────────────────────────────────────
/** Orbit around a point at the scene's middle depth: yaw/pitch from drags (and the phone's tilt), dist from pinches. */
const look = { yaw: 0, pitch: 0, dist: 1, depth: 10, minDist: 0.4, intro: 0 };
let tilt = { yaw: 0, pitch: 0, base: null as null | { a: number; b: number } };

function placeScreenCamera(dt: number) {
  const d = look.depth;
  // The opening dolly-zoom: the camera glides in a quarter of the way while the view widens, so the middle plane
  // keeps its size and everything nearer and farther slides apart: the photo comes alive.
  if (look.intro < 1) look.intro = Math.min(1, look.intro + dt / (reduced ? 0.01 : 2.6));
  const e = 1 - Math.pow(1 - look.intro, 3);
  const sway = reduced ? 0 : Math.sin(t0 * 0.35) * 0.02;
  const yaw = THREE.MathUtils.clamp(look.yaw + tilt.yaw + sway, -0.45, 0.45);
  const pitch = THREE.MathUtils.clamp(look.pitch + tilt.pitch, -0.25, 0.25);
  const dist = d * look.dist * (1 - 0.1 * e);
  const target = new THREE.Vector3(0, 0, -d);
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  const base = THREE.MathUtils.degToRad(photoFov());
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(base / 2) * d / dist));
  camera.updateProjectionMatrix();
}

// ── The room ──────────────────────────────────────────────────────────────────────────────────────────────────────
const visual = new VisualGyro();
const gyro = { has: false, q: new THREE.Quaternion() };
const euler = new THREE.Euler();
const qBack = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const qScreen = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
let placed = false, roomStart = 0, roomScale = 1, roomYaw = 0;
const onOrient = (e: DeviceOrientationEvent) => {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  const d = THREE.MathUtils.degToRad;
  if (mode === 'room') {
    const angle = d((screen.orientation?.angle as number | undefined) ?? 0);
    euler.set(d(e.beta), d(e.alpha), -d(e.gamma), 'YXZ');
    gyro.q.setFromEuler(euler).multiply(qBack).multiply(qScreen.setFromAxisAngle(zAxis, -angle));
    gyro.has = true;
  } else {
    // On screen: tilting the phone looks around a little, from wherever it was held when the scene opened.
    if (!tilt.base) tilt.base = { a: e.gamma, b: e.beta };
    tilt.yaw = THREE.MathUtils.clamp(-d(e.gamma - tilt.base.a) * 0.6, -0.3, 0.3);
    tilt.pitch = THREE.MathUtils.clamp(d(e.beta - tilt.base.b) * 0.4, -0.18, 0.18);
  }
};
/** Asked on a tap (iPhone shows its question only then); if it never comes, drags and the camera picture do the job. */
function askMotion() {
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  const on = () => window.addEventListener('deviceorientation', onOrient);
  if (DOE?.requestPermission) DOE.requestPermission().then((r) => r === 'granted' && on(), () => {});
  else on();
}

function placeInFront() {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
  fwd.normalize().multiplyScalar(1.6);
  holder.position.set(fwd.x, -0.15, fwd.z);
  roomYaw = 0;
  placed = true;
  roomStart = t0;
}

function roomFrame() {
  if (gyro.has) camera.quaternion.copy(gyro.q);
  else if (video.readyState >= 2 && visual.update(video, innerWidth, innerHeight, THREE.MathUtils.degToRad(62))) camera.quaternion.setFromEuler(euler.set(visual.pitch, visual.yaw, 0, 'YXZ'));
  if (!placed && (gyro.has || video.readyState >= 2 || t0 - roomStart > 2)) placeInFront();
  const p = holder.position;
  holder.rotation.set(0, Math.atan2(-p.x, -p.z) + roomYaw, 0);
  // It grows out of the phone into the room.
  const g = Math.min(1, (t0 - roomStart) / (reduced ? 0.01 : 1.1));
  const back = 1 + 2.2 * Math.pow(g - 1, 3) + 1.2 * Math.pow(g - 1, 2); // ease-out with a small overshoot
  holder.scale.setScalar(Math.max(0.001, back) * roomScale);
  holder.visible = placed;
  recenterBtn.hidden = !placed || onScreen();
}

/** Whether the memory is in view (else the "bring it here" button shows). */
function onScreen() {
  const v = holder.position.clone().project(camera);
  return v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
}

// ── Opening a memory ──────────────────────────────────────────────────────────────────────────────────────────────
async function open(m: Memory, from: HTMLImageElement) {
  current = m;
  mode = 'screen';
  askMotion();
  nameEl.textContent = `${m.ar} · ${m.en}`;
  flat.src = asset(m.id + '.jpg');
  flat.style.opacity = '1';
  const show = () => {
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  // The tapped photo grows into the full screen.
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (d.startViewTransition && !reduced) {
    from.style.viewTransitionName = 'mem-photo';
    const vt = d.startViewTransition(() => {
      from.style.viewTransitionName = '';
      flat.style.viewTransitionName = 'mem-photo';
      show();
    });
    void vt.finished.finally(() => (flat.style.viewTransitionName = ''));
  } else show();
  setMode('screen');
  loading.hidden = false;
  ensureRenderer();
  meta = (await fetch(asset(m.id + '.json')).then((r) => r.json())) as Meta;
  if (current !== m) return;
  look.depth = Math.max(1, meta.medianDepth * 0.35);
  look.yaw = look.pitch = 0;
  look.dist = 1;
  look.intro = 0;
  tilt = { yaw: 0, pitch: 0, base: null };
  resize();
  showScene('screen');
  await Promise.all([loadSplat(m.id + '.spz').initialized, loadSplat(m.id + '-room.spz').initialized]);
  if (current !== m) return;
  showScene(mode);
  loading.hidden = true;
  // Once the scene has drawn a couple of frames from the photo's viewpoint, the photo fades away into it.
  requestAnimationFrame(() => requestAnimationFrame(() => (flat.style.opacity = '0')));
}

/** The loaded scene files of the open memory (full and room), kept so switching does not dispose one mid-draw. */
const loaded = new Map<string, SplatMesh>();
function clearSplat() {
  for (const mesh of loaded.values()) {
    holder.remove(mesh);
    mesh.dispose();
  }
  loaded.clear();
  splat = null;
}

function close() {
  current = null;
  stopCamera();
  clearSplat();
  viewer.hidden = true;
  document.body.style.overflow = '';
}

// ── Screen ↔ room ─────────────────────────────────────────────────────────────────────────────────────────────────
function stopCamera() {
  (video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

async function setMode(next: 'screen' | 'room') {
  mode = next;
  if (next === 'room') {
    modeBtn.innerHTML = `${icon.screen} على الشاشة · On screen`;
    hint.textContent = 'تظهر الذكرى أمامك في الغرفة. أدر الهاتف حولها، اسحب لتديرها، واقرص لتكبّرها. · The memory floats in your room: turn the phone around it, drag to turn it, pinch to resize.';
    flat.style.opacity = '0';
    placed = false;
    // The room is seen from the phone itself: back to the origin, whatever looking around on screen did.
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    roomStart = t0;
    roomScale = 1;
    gyro.has = false;
    visual.reset();
    showScene('room');
    try {
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      await video.play();
    } catch {
      hint.textContent = 'لم يُسمح بالكاميرا · The camera was not allowed';
    }
  } else {
    stopCamera();
    modeBtn.innerHTML = `${icon.room} ضعها في غرفتك · Put it in your room`;
    hint.textContent = 'اسحب أو أمِل الهاتف لتنظر حولك، واقرص لتمشي إلى الداخل. · Drag or tilt to look around, pinch to walk in.';
    holder.position.set(0, 0, 0);
    holder.rotation.set(0, 0, 0);
    holder.scale.setScalar(1);
    holder.visible = true;
    recenterBtn.hidden = true;
    showScene('screen');
  }
  resize();
}

/**
 * Both scene files of a memory are loaded when it opens and stay in the scene: the full one for the screen, the
 * trimmed `-room` one (made by memory-splat.py) for the room. Spark drew nothing, or solid black, when a scene was
 * swapped in or out after the first frame, so the one not in use is just shrunk to nothing.
 */
function loadSplat(file: string) {
  let mesh = loaded.get(file);
  if (!mesh) {
    mesh = new SplatMesh({ url: asset(file) });
    mesh.quaternion.set(1, 0, 0, 0); // SHARP's axes (y down, z forward) → three.js (y up, looking down −z)
    hide(mesh);
    loaded.set(file, mesh);
    holder.add(mesh);
  }
  return mesh;
}

const HIDDEN = 1e-6;
/** Shrunk AND moved far below: shrunk alone about the camera it would still draw (each point keeps its line of sight). */
const hide = (mesh: SplatMesh) => {
  mesh.scale.setScalar(HIDDEN);
  mesh.position.set(0, -1e5, 0);
};
/** Shows the full scene (screen) or the room miniature: about 1.2 m wide, its middle part centred on the holder. */
function showScene(which: 'screen' | 'room') {
  if (!current) return;
  const full = loadSplat(current.id + '.spz');
  const room = loadSplat(current.id + '-room.spz');
  if (which === 'screen' || !meta) {
    full.scale.setScalar(1);
    full.position.set(0, 0, 0);
    hide(room);
    splat = full;
    return;
  }
  const [x0, y0, z0] = meta.box.min, [x1, y1, z1] = meta.box.max;
  const s = 1.2 / Math.max(x1 - x0, y1 - y0, z1 - z0);
  // Centre in SHARP's axes, turned to three's (y and z flip with the 180° turn about x).
  const c = new THREE.Vector3((x0 + x1) / 2, -(y0 + y1) / 2, -(z0 + z1) / 2);
  room.scale.setScalar(s);
  room.position.copy(c).multiplyScalar(-s);
  hide(full);
  splat = room;
}

// ── Frame ─────────────────────────────────────────────────────────────────────────────────────────────────────────
let last = performance.now();
function frame(now: number) {
  const real = Math.min(1, (now - last) / 1000);
  const dt = Math.min(0.05, real);
  last = now;
  t0 += real; // real time, so the grow-in keeps its length on a slow phone
  look.intro = Math.min(1, look.intro + Math.max(0, real - dt) / (reduced ? 0.01 : 2.6)); // same for the dolly-zoom
  if (viewer.hidden || !renderer) return;
  if (mode === 'room') roomFrame();
  else placeScreenCamera(dt);
  renderer.render(scene, camera);
}

// ── Touch ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const pointers = new Map<number, { x: number; y: number }>();
let pinch0: { d: number; dist: number; scale: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: look.dist, scale: roomScale };
  }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    const dx = (e.clientX - prev.x) / innerWidth, dy = (e.clientY - prev.y) / innerHeight;
    if (mode === 'room') roomYaw = THREE.MathUtils.clamp(roomYaw + dx * 3, -0.7, 0.7);
    else {
      look.yaw = THREE.MathUtils.clamp(look.yaw - dx * 1.6, -0.45, 0.45);
      look.pitch = THREE.MathUtils.clamp(look.pitch + dy * 1.0, -0.25, 0.25);
    }
  } else if (pointers.size === 2 && pinch0) {
    const [a, b] = [...pointers.values()];
    const k = Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d;
    if (mode === 'room') roomScale = THREE.MathUtils.clamp(pinch0.scale * k, 0.3, 3);
    else look.dist = THREE.MathUtils.clamp(pinch0.dist / k, look.minDist, 1.15); // spread fingers = walk in
  }
});
const lift = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = null;
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);

// ── Buttons ───────────────────────────────────────────────────────────────────────────────────────────────────────
app.querySelectorAll<HTMLButtonElement>('.mem-card').forEach((b) =>
  b.addEventListener('click', () => {
    const m = MEMORIES.find((x) => x.id === b.dataset.id)!;
    void open(m, b.querySelector('img')!);
  })
);
$<HTMLButtonElement>('[data-act="close"]').addEventListener('click', close);
modeBtn.addEventListener('click', () => {
  askMotion();
  void setMode(mode === 'room' ? 'screen' : 'room');
});
recenterBtn.addEventListener('click', () => {
  placeInFront();
  roomStart = t0 - 1.1; // no regrow
});

// For tests: ?debug exposes the state.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window as object, { __mem: { look, holder, camera, get splat() { return splat; }, get mode() { return mode; } } });
