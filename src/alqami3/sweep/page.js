// The scan mode of the local alqami3 copy (alqami3-local), on its own page (alqami3-360.html).
//
// Closed-set recognition from every side: MobileNetV2 features of the camera (several crops, background masked
// out) are matched against each registered object's multi-angle signatures (seed-artifacts.json: the golden
// astronaut, the Prague box, Al-Qabasat, the Zulfiqar sword, the Saqqakhana bowl, the Kufic folio, plus a bank of
// background views that must never match), confirmed over several frames. A confirmed object gets its 3D model and
// holographic card floating on it, turned to the side the camera sees. The test panel sets the threshold, captures a
// side live, or sweeps 360° to teach an object. The code is the local copy's own; only this page's wiring is new.
import './styles.css';
import '../shell.css';
import { XRArtifactDeployer } from './recognition/xr-artifact-deployer.js';
import { ClosedSetRecognitionEngine } from './recognition/recognition-engine.js';
import { TestInspectorHUD } from './admin/test-inspector-hud.js';
import { RDFManuscriptParser } from './rdf-parser.js';
import { ManuscriptSpeechEngine } from './speech.js';

const BASE = import.meta.env.BASE_URL || './';
const HERE = `${BASE}alqami3/sweep/`;
const $ = (id) => document.getElementById(id);
const status = (found, text) => {
  $('status').classList.toggle('found', found);
  $('status-text').textContent = text;
};

const parser = new RDFManuscriptParser();
const speech = new ManuscriptSpeechEngine();
let spoken = null;

function showRecord(meta, match) {
  $('rec-title').textContent = match.title || meta?.titleArabic || meta?.title || '—';
  $('rec-sub').textContent = `${match.id} · ${Math.round(match.similarity * 100)}%${match.matchedView ? ` · ${match.matchedView}` : ''}`;
  const a = match.artifact || {};
  const rows = [
    ['المؤلف أو الصانع · Creator', meta?.creator],
    ['التاريخ · Date', meta?.date || a.date],
    ['المادة · Material', meta?.material || (a.materials || []).join('، ')],
    ['الحجم · Size', meta?.dimensions || a.dimensions],
    ['الجهة · Institution', a.institution || meta?.publisher],
  ].filter(([, v]) => v);
  $('rec-rows').innerHTML = '';
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    $('rec-rows').append(dt, dd);
  }
  $('record').hidden = false;
}

async function start() {
  $('start').hidden = true;
  status(false, 'يجهّز التعرّف… · Getting ready…');
  try {
    const deployer = new XRArtifactDeployer($('xr'));
    await deployer.init();
    deployer.start();
    const btn = $('anim');
    deployer.onAnimationStateChange = (s) => {
      btn.hidden = !s.hasAnimation;
      btn.textContent = s.isOpen ? 'أغلق المخطوط · Close' : 'افتح المخطوط · Open';
    };
    btn.addEventListener('click', () => deployer.toggleBookAnimation());

    const engine = new ClosedSetRecognitionEngine($('video'), $('canvas'));
    engine.init().catch((e) => console.warn('Engine init:', e));
    const hud = new TestInspectorHUD(
      $('hud'),
      (t) => engine.setThreshold(t),
      (id, title, angle) => engine.captureLiveAngle(id, title, angle),
      (id, title, onProgress) => engine.startAutoSweep360(id, title, onProgress)
    );
    engine.onEvaluation = (report) => {
      hud.update(report);
      if (deployer.isConfirmed && report.roi) {
        deployer._compute3DPositionFromROI(report.roi);
        if (report.bestCandidate?.matchedView) deployer.syncDetectedAngle(report.bestCandidate.matchedView);
      }
    };
    engine.onArtifactConfirmed = async (match) => {
      status(true, `✓ ${match.title}`);
      let meta = null;
      try {
        meta = (await parser.loadFromUrl(`${HERE}${match.artifact.bibframe?.ttlPath || 'alqabasat.ttl'}`)).metadata;
      } catch (e) {
        console.warn('Record:', e);
      }
      showRecord(meta, match);
      deployer.deployArtifactXR(match.artifact, meta, match.roi, match.matchedView, Math.round(match.similarity * 100));
      if (spoken !== match.id) {
        spoken = match.id;
        speech.speak(`تم التعرف على القطعة: ${match.title}`, 'ar');
      }
    };
    engine.onArtifactLost = () => {
      status(false, 'وجّه الكاميرا إلى قطعة · Point at an object');
      deployer.collapseArtifactXR();
      $('record').hidden = true;
      btn.hidden = true;
      spoken = null;
    };
    await engine.start();
    status(false, 'وجّه الكاميرا إلى قطعة · Point at an object');
  } catch (e) {
    console.error(e);
    status(false, 'تعذّر فتح الكاميرا · Camera unavailable');
    $('start').hidden = false;
  }
}

let activeDeployer = null;
for (const [img, name] of [
  ['astronaut_front.jpg', 'رائد الفضاء · Astronaut (front)'],
  ['astronaut_left.jpg', 'رائد الفضاء · Astronaut (left)'],
  ['astronaut_right.jpg', 'رائد الفضاء · Astronaut (right)'],
  ['praha_front.jpg', 'صندوق براغ · Prague box'],
]) {
  const fig = document.createElement('figure');
  fig.innerHTML = `<img src="${HERE}${img}" alt=""><figcaption></figcaption>`;
  fig.querySelector('figcaption').textContent = name;
  $('targets-list').append(fig);
}
fetch(`${BASE}data/alkafeel-catalogue.json`)
  .then((r) => (r.ok ? r.json() : []))
  .then((items) => {
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:84px;z-index:25;display:flex;gap:6px;overflow-x:auto;padding:6px 10px;border-radius:999px;background:rgba(12,10,9,0.78);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.16);scrollbar-width:none;';
    const lbl = document.createElement('span');
    lbl.textContent = 'نشر مجسّم 360° 3D:';
    lbl.style.cssText = 'color:#14b8a6;font-size:11.5px;font-weight:700;white-space:nowrap;align-self:center;padding:0 4px;';
    bar.append(lbl);

    const deployItem = async (item) => {
      $('targets').hidden = true;
      if (!activeDeployer) {
        activeDeployer = new XRArtifactDeployer($('xr'));
        await activeDeployer.init();
        activeDeployer.start();
      }
      const glbUrl = `${BASE}${item.model.glb.replace(/^\.?\//, '')}`;
      const meta = {
        titleArabic: item.title.ar,
        title: item.title.en,
        creator: item.creator?.ar,
        date: item.period?.ar,
        material: item.details?.material?.ar,
        dimensions: item.details?.dimensions,
        publisher: item.institution?.ar,
      };
      const match = {
        id: item.id,
        title: item.title.ar,
        similarity: 0.98,
        matchedView: 'front-3d',
        artifact: {
          id: item.id,
          title: item.title.ar,
          date: item.period?.ar,
          materials: [item.details?.material?.ar],
          dimensions: item.details?.dimensions,
          institution: item.institution?.ar,
          model3d: { glbPath: glbUrl, scale: 1.1 },
        },
      };
      status(true, `✓ ${item.title.ar}`);
      showRecord(meta, match);
      activeDeployer.deployArtifactXR(match.artifact, meta, { x: 0.5, y: 0.5, width: 0.3, height: 0.3 }, 'front', 98);
      speech.speak(`تم التعرف على القطعة من متحف الكفيل: ${item.title.ar}`, 'ar');
    };

    for (const item of items.slice(0, 14)) {
      const fig = document.createElement('figure');
      fig.style.cursor = 'pointer';
      const imgUrl = `${BASE}${item.image.replace(/^\.?\//, '')}`;
      fig.innerHTML = `<img src="${imgUrl}" alt=""><figcaption></figcaption>`;
      fig.querySelector('figcaption').textContent = `${item.title.ar} · 3D`;
      fig.addEventListener('click', () => deployItem(item));
      $('targets-list').append(fig);

      const chip = document.createElement('button');
      chip.textContent = item.title.ar.replace(/\s*\(متحف.*$/, '').replace(/\s*—.*$/, '');
      chip.style.cssText =
        'flex-shrink:0;height:28px;padding:0 11px;border-radius:999px;background:rgba(20,184,166,0.18);color:#fff;border:1px solid rgba(20,184,166,0.4);font-size:11.5px;cursor:pointer;white-space:nowrap;';
      chip.addEventListener('click', () => deployItem(item));
      bar.append(chip);
    }
    document.body.append(bar);
  })
  .catch(() => {});
$('start').addEventListener('click', start);
$('show-targets').addEventListener('click', () => ($('targets').hidden = false));
$('close-targets').addEventListener('click', () => ($('targets').hidden = true));
$('back').href = `${BASE}index.html`;
