// Renders every catalogued 3D object from all around, so "scan by sight" knows statues and objects from any side
// without anyone photographing them first.
//
// For each object with a .glb (the built-in ALQAMI objects, and every published Moon record whose holdings link a
// .glb), 12 directions around (every 30°) × 3 heights (5°, 20°, 35° above) are rendered in headless Chrome with
// three.js, on varied backgrounds and light, with the object filling the scanner's guide square. Files land in
// renders/<key>/az<deg>_el<deg>.jpg (key "artifact:ALQ-…" or "moon:<id>", ":" written "__"), where
// scripts/build-recognition-index.mjs picks them up together with the angle.
//
// Azimuth 0 is the model's front (+Z); 90 is the object's left side, 180 its back.
//
//   node scripts/render-object-views.mjs [--only <key substring>]
//   Test set (unseen angles, other backgrounds): --out renders-test --az 15,75,135,195,255,315 --el 12,28 --seed 99
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const OUT = join(ROOT, arg('--out') || 'renders');
const MOON_API = 'https://gfbagczwhvxxstbfrfhu.supabase.co/functions/v1/make-server-49c0e13c';
const MOON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmYmFnY3p3aHZ4eHN0YmZyZmh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODg4OTksImV4cCI6MjA4NjM2NDg5OX0.Hrib4UwwVvCu0o7K51UAICoSmd2J-0XlkLegdkIqLJk';
const AZIMUTHS = arg('--az')?.split(',').map(Number) ?? Array.from({ length: 12 }, (_, i) => i * 30);
const ELEVATIONS = arg('--el')?.split(',').map(Number) ?? [5, 20, 35];
const SEED = Number(arg('--seed') || 7);
const only = arg('--only');

// Built-in objects: id and model path from src/data/alqamiArtifacts.ts.
function builtInObjects() {
  const src = readFileSync(join(ROOT, 'src/data/alqamiArtifacts.ts'), 'utf8');
  const out = [];
  // Each object: its id, then (before the next id) its model's glb path.
  const ids = [...src.matchAll(/\bid: '(ALQ-[^']+)'/g)];
  ids.forEach((m, i) => {
    const block = src.slice(m.index, ids[i + 1]?.index ?? src.length);
    const glb = /\bglb: '([^']+)'/.exec(block)?.[1];
    if (glb) out.push({ key: `artifact:${m[1]}`, url: glb.replace(/^\.?\//, '/') });
  });
  return out;
}

// Moon records whose JSON mentions a .glb or .gltf link.
async function moonObjects() {
  const out = [];
  const headers = { Authorization: `Bearer ${MOON_KEY}` };
  for (let offset = 0; ; offset += 200) {
    const res = await fetch(`${MOON_API}/records/search?view=published&limit=200&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`Moon search ${res.status}`);
    const page = await res.json();
    // Ten records at a time.
    for (let i = 0; i < page.records.length; i += 10) {
      await Promise.all(
        page.records.slice(i, i + 10).map(async (r) => {
          const full = await fetch(`${MOON_API}/records/${encodeURIComponent(r.id)}?view=published`, { headers }).then((x) => (x.ok ? x.text() : ''));
          const link = /https?:\/\/[^"\s]+?\.(?:glb|gltf)(?:\?[^"\s]*)?/i.exec(full)?.[0];
          if (link) out.push({ key: `moon:${r.id}`, url: link });
        })
      );
    }
    if (page.records.length < 200) break;
  }
  return out;
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const SIZE = 448;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
let seed = __SEED__;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// Backgrounds a visitor might see behind an object: museum walls, plinths, dark galleries, daylight.
const BACKS = [['#d8d2c6', '#a59d90'], ['#3b3a38', '#1d1c1b'], ['#e9e6df', '#cfc8bb'], ['#6d7b86', '#3f4a52'], ['#8a6e52', '#4d3b2b'], ['#f2f2f0', '#bdbdbd']];
function backdrop() {
  const [a, b] = BACKS[Math.floor(rand() * BACKS.length)];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, a); grad.addColorStop(1, b); g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
window.renderViews = async (url, azimuths, elevations) => {
  const draco = new DRACOLoader().setDecoderPath('/node_modules/three/examples/jsm/libs/draco/gltf/');
  const gltf = await new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const obj = gltf.scene;
  const box = new THREE.Box3().setFromObject(obj);
  const centre = box.getCenter(new THREE.Vector3());
  // Half the largest side: tall objects (stelae, statues) then fill the frame by their height.
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2 || 1;
  obj.position.sub(centre);
  const out = [];
  for (const el of elevations) for (const az of azimuths) {
    const scene = new THREE.Scene();
    scene.background = backdrop();
    scene.environment = envTex;
    scene.environmentIntensity = 0.4 + rand() * 0.5;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.6 + rand() * 0.8));
    const key = new THREE.DirectionalLight(0xfff3e0, 1.2 + rand() * 1.6);
    key.position.set(rand() * 4 - 2, 2 + rand() * 2, rand() * 4 - 2);
    scene.add(key, obj);
    // Fill 55–80% of the frame, as an object inside the scanner's guide square does.
    const fill = 0.55 + rand() * 0.25;
    const fov = 40;
    const dist = radius / Math.tan(THREE.MathUtils.degToRad(fov / 2)) / fill + radius;
    const camera = new THREE.PerspectiveCamera(fov, 1, dist / 100, dist * 10);
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    camera.position.set(Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, Math.cos(a) * Math.cos(e) * dist);
    camera.lookAt(0, 0, 0);
    camera.rotateZ((rand() - 0.5) * 0.12); // a slightly tilted phone
    renderer.render(scene, camera);
    out.push({ az, el, data: renderer.domElement.toDataURL('image/jpeg', 0.85) });
    scene.background.dispose();
    scene.remove(obj);
  }
  return out;
};
window.ready = true;
</script>`;

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE.replace('__SEED__', String(SEED)));
  const file = resolve(ROOT, path.startsWith('/node_modules/') ? '.' + path : join('public', path));
  if (!file.startsWith(ROOT) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, ok));
const port = server.address().port;

const targets = [...builtInObjects(), ...(await moonObjects().catch((e) => (console.warn(`Moon objects skipped: ${e.message}`), [])))].filter(
  (t) => !only || t.key.includes(only)
);
console.log(`Rendering ${targets.length} objects × ${AZIMUTHS.length * ELEVATIONS.length} views…`);

// The installed Chrome (GitHub's Ubuntu runners have it too); headless WebGL runs on SwiftShader.
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.warn('page:', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.ready === true);

let done = 0;
for (const t of targets) {
  const url = t.url.startsWith('/') ? `http://localhost:${port}${t.url}` : t.url;
  try {
    const views = await page.evaluate(([u, az, el]) => window.renderViews(u, az, el), [url, AZIMUTHS, ELEVATIONS]);
    const dir = join(OUT, t.key.replace(':', '__'));
    mkdirSync(dir, { recursive: true });
    for (const v of views) writeFileSync(join(dir, `az${String(v.az).padStart(3, '0')}_el${String(v.el).padStart(2, '0')}.jpg`), Buffer.from(v.data.split(',')[1], 'base64'));
    done++;
    console.log(`  ${t.key}: ${views.length} views`);
  } catch (e) {
    console.warn(`  ${t.key}: not rendered (${e.message.split('\n')[0]})`);
  }
}
await browser.close();
server.close();
console.log(`Rendered ${done} of ${targets.length} objects into renders/.`);
