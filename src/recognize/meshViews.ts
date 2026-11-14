import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeObject, downscaleTextures, getDracoLoader } from '../utils/modelMemory';

/**
 * A 3D scan of an object as its recognition "clue": the mesh (from Scaniverse, Polycam, Reality Composer's Object
 * Capture…) is rendered on the phone from 12 directions × 3 heights, on varied backgrounds and light, with the object
 * filling the scanner's square, as scripts/render-object-views.mjs does for the catalogue in CI. Each view is then
 * learnt like a photo, with its angle, so the object is recognised from any side and the side in view is known.
 *
 * Azimuth 0 is the model's front (+Z).
 */
export interface MeshView {
  canvas: HTMLCanvasElement;
  azimuth: number;
}

const AZIMUTHS = Array.from({ length: 12 }, (_, i) => i * 30);
const ELEVATIONS = [5, 20, 35];
// Close views too (visitors stand near and frame part of an object, e.g. a bust's face): the upper part and the middle,
// filling more than the frame, from every side at eye height.
const CLOSE: Array<{ el: number; aimY: number; fill: number }> = [
  { el: 8, aimY: 0.28, fill: 1.5 },
  { el: 8, aimY: 0.0, fill: 1.25 },
];
const SIZE = 448;
const BACKS = [
  ['#d8d2c6', '#a59d90'],
  ['#3b3a38', '#1d1c1b'],
  ['#e9e6df', '#cfc8bb'],
  ['#6d7b86', '#3f4a52'],
  ['#8a6e52', '#4d3b2b'],
  ['#f2f2f0', '#bdbdbd'],
];

async function loadMesh(file: File): Promise<THREE.Object3D> {
  const url = URL.createObjectURL(file);
  try {
    if (/\.usdz$/i.test(file.name)) {
      // three.js reads USDZ files written as text (usda); binary ones (most of Apple's) need exporting as GLB.
      const group = await new USDZLoader().loadAsync(url);
      let meshes = 0;
      group.traverse((o) => ((o as THREE.Mesh).isMesh ? meshes++ : 0));
      if (!meshes) throw new Error('usdz-binary');
      return group;
    }
    const gltf = await new GLTFLoader().setDRACOLoader(getDracoLoader()).setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    return gltf.scene;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** All views of the mesh; `onProgress` gets 0..1. The renderer is released afterwards. */
export async function renderMeshViews(file: File, onProgress?: (f: number) => void): Promise<MeshView[]> {
  const object = await loadMesh(file);
  // Phones: textures down to 2048 px keep the renderer within memory.
  downscaleTextures(object, 2048);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) throw new Error('empty');
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2 || 1;
  object.position.sub(centre);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const out: MeshView[] = [];
  const total = AZIMUTHS.length * (ELEVATIONS.length + CLOSE.length);
  const shots = [
    ...ELEVATIONS.flatMap((el) => AZIMUTHS.map((az) => ({ az, el, aimY: 0, fill: 0 }))),
    ...CLOSE.flatMap((c) => AZIMUTHS.map((az) => ({ az, el: c.el, aimY: c.aimY, fill: c.fill }))),
  ];
  try {
    for (const { az, el, aimY, fill: closeFill } of shots) {
      {
        const scene = new THREE.Scene();
        const [a, b] = BACKS[Math.floor(rand() * BACKS.length)];
        const bg = document.createElement('canvas');
        bg.width = bg.height = 64;
        const g = bg.getContext('2d')!;
        const grad = g.createLinearGradient(0, 0, 0, 64);
        grad.addColorStop(0, a);
        grad.addColorStop(1, b);
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        const bgTex = new THREE.CanvasTexture(bg);
        bgTex.colorSpace = THREE.SRGBColorSpace;
        scene.background = bgTex;
        scene.environment = env;
        scene.environmentIntensity = 0.4 + rand() * 0.5;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.6 + rand() * 0.8));
        const key = new THREE.DirectionalLight(0xfff3e0, 1.2 + rand() * 1.6);
        key.position.set(rand() * 4 - 2, 2 + rand() * 2, rand() * 4 - 2);
        scene.add(key, object);
        // The object fills 55–80% of the view (as inside the scanner's square), or more for the close views.
        const fill = closeFill || 0.55 + rand() * 0.25;
        const fov = 40;
        const dist = radius / Math.tan(THREE.MathUtils.degToRad(fov / 2)) / fill + radius;
        const camera = new THREE.PerspectiveCamera(fov, 1, dist / 100, dist * 10);
        const ra = THREE.MathUtils.degToRad(az);
        const re = THREE.MathUtils.degToRad(el);
        const aim = aimY * size.y;
        camera.position.set(Math.sin(ra) * Math.cos(re) * dist, Math.sin(re) * dist + aim, Math.cos(ra) * Math.cos(re) * dist);
        camera.lookAt(0, aim, 0);
        camera.rotateZ((rand() - 0.5) * 0.12);
        renderer.render(scene, camera);
        const c = document.createElement('canvas');
        c.width = c.height = SIZE;
        c.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
        out.push({ canvas: c, azimuth: az });
        scene.remove(object);
        bgTex.dispose();
        onProgress?.(out.length / total);
        // Let the page breathe between renders.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    disposeObject(object);
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}
