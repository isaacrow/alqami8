// alqami3's scan mode, as it was in github.com/isaacrow/alqami3, on its own page (alqami3-scan.html).
//
// MindAR image tracking follows five known pictures (Al-Qabasat, the Qur'an, the Kufic folio, a hand and an ALQAMI
// artefact photo, compiled into targets/manuscript.mind). On each, a holographic 3D card with the record (read from
// its Turtle file) and 3D hotspot pins are anchored to the page itself and move with it; on the hand, the Islamic
// helmet stands in 3D. Tap a pin for its note. The code is alqami3's own (ar-engine.js, ar-card.js, rdf-parser.js,
// speech.js); only this page's wiring is new.
import './styles.css';
import '../shell.css';
import { GLTFLoader } from 'three150/examples/jsm/loaders/GLTFLoader.js';
import { AREngine } from './ar-engine.js';
import { ARCardManager } from './ar-card.js';
import { RDFManuscriptParser } from './rdf-parser.js';
import { ManuscriptSpeechEngine } from './speech.js';
import { publishedRecords } from '../../moon/moonObjects';
import { coverGuess, opacUrl } from '../../moon/moonApi';
import { readRecord } from '../../moon/readRecord';

const BASE = import.meta.env.BASE_URL || './';
const HERE = `${BASE}alqami3/classic/`;
// Per target in manuscript.mind: its record, and its picture (to show on another screen or print, to test).
const TARGETS = [
  { ttl: 'model.ttl', image: 'manuscript.jpg', name: 'مخطوط القبسات · Al-Qabasat' },
  { ttl: 'quran.ttl', image: 'quran.jpg', name: 'القرآن الكريم · The Qur’an' },
  { ttl: 'kufic.ttl', image: 'kufic.jpg', name: 'رق كوفي · Kufic folio' },
  { ttl: 'hand.ttl', image: 'hand.jpg', name: 'اليد ← الخوذة · Hand → helmet' },
  { ttl: 'alqami.ttl', image: 'alqami_artifact.jpg', name: 'قطعة علقمي · ALQAMI artefact' },
];

const $ = (id) => document.getElementById(id);
const status = (found, text) => {
  $('status').classList.toggle('found', found);
  $('status-text').textContent = text;
};

const parser = new RDFManuscriptParser();
const speech = new ManuscriptSpeechEngine();
let engine = null;

function showRecord(meta) {
  if (!meta) return;
  $('rec-title').textContent = meta.titleArabic || meta.title || '—';
  $('rec-sub').textContent = meta.titleArabic && meta.title && meta.title !== meta.titleArabic ? meta.title : '';
  const rows = [
    ['المؤلف أو الصانع · Creator', meta.creator],
    ['التاريخ · Date', meta.date],
    ['المادة · Material', meta.material],
    ['الحجم · Extent', meta.dimensions || meta.extent],
    ['الجهة الحافظة · Held at', meta.publisher],
    ['المعرّف الموحد · URI', meta.uri],
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

function openHotspot(h) {
  $('pin-title').textContent = h.label || '';
  $('pin-folio').textContent = h.folio || '';
  $('pin-text').textContent = h.description || '';
  $('pin').hidden = false;
  speech.speak(`${h.label}. ${h.description || ''}`, 'en');
}

async function start() {
  $('start').hidden = true;
  status(false, 'وجّه الكاميرا إلى إحدى الصور · Point at one of the pictures');
  try {
    engine = new AREngine($('ar'), `${HERE}targets/manuscript.mind`);
    const { camera, renderer, anchors } = await engine.init();
    const cards = anchors.map((a) => new ARCardManager(a.group));
    let helmet = null;
    if (anchors[3]) {
      new GLTFLoader().load(`${BASE}models/Old_Islamic_Helmet.glb`, (gltf) => {
        helmet = gltf.scene;
        helmet.scale.set(3.5, 3.5, 3.5);
        helmet.position.set(0, 0, 0.2);
        anchors[3].group.add(helmet);
      });
    }
    engine.onTargetFound = async (i) => {
      status(true, `${TARGETS[i]?.name ?? i} · متابَع Tracked`);
      try {
        const data = await parser.loadFromUrl(`${HERE}${TARGETS[i]?.ttl ?? TARGETS[0].ttl}`);
        showRecord(data.metadata);
        cards[i]?.createHolographicCard(data.metadata);
        cards[i]?.createHotspots(data.hotspots);
      } catch (e) {
        console.warn('Record for target', i, e);
      }
    };
    engine.onTargetLost = () => {
      status(false, 'وجّه الكاميرا إلى إحدى الصور · Point at one of the pictures');
      $('record').hidden = true;
    };
    engine.onError = () => status(false, 'تعذّر فتح الكاميرا · Camera unavailable');
    let last = performance.now();
    await engine.start(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      cards.forEach((c) => c.update(dt));
      if (helmet) {
        helmet.rotation.y += dt * 0.5;
        helmet.rotation.x = Math.sin(now * 0.001) * 0.1;
      }
    });
    renderer.domElement.addEventListener('click', (e) => {
      for (const c of cards) {
        const hit = c.checkRaycast(camera, e.clientX, e.clientY, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
        if (hit) return openHotspot(hit);
      }
    });
  } catch (e) {
    console.error(e);
    status(false, 'تعذّر تشغيل التتبع · Tracking could not start');
    $('start').hidden = false;
  }
}

// The pictures to point at (on another screen, or printed), plus Al-Kafeel Museum 3D treasures.
for (const t of TARGETS) {
  const fig = document.createElement('figure');
  fig.innerHTML = `<img src="${HERE}${t.image}" alt=""><figcaption></figcaption>`;
  fig.querySelector('figcaption').textContent = t.name;
  $('targets-list').append(fig);
}
fetch(`${BASE}data/alkafeel-catalogue.json`)
  .then((r) => (r.ok ? r.json() : []))
  .then((items) => {
    // Also add an on-screen floating quick-test bar at the bottom of alqami3-scan.html
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:84px;z-index:25;display:flex;gap:6px;overflow-x:auto;padding:6px 10px;border-radius:999px;background:rgba(12,10,9,0.78);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.16);scrollbar-width:none;';
    const lbl = document.createElement('span');
    lbl.textContent = 'متحف الكفيل 3D:';
    lbl.style.cssText = 'color:#ffd60a;font-size:11.5px;font-weight:700;white-space:nowrap;align-self:center;padding:0 4px;';
    bar.append(lbl);

    const activateItem = (item) => {
      $('targets').hidden = true;
      showRecord({
        titleArabic: item.title.ar,
        title: item.title.en,
        creator: item.creator?.ar,
        date: item.period?.ar,
        material: item.details?.material?.ar,
        dimensions: item.details?.dimensions,
        publisher: item.institution?.ar,
        uri: item.uri,
      });
      status(true, `${item.title.ar} · متحف الكفيل 3D`);
      speech.speak(item.description?.ar || item.title.ar, 'ar');
    };

    for (const item of items) {
      const fig = document.createElement('figure');
      fig.style.cursor = 'pointer';
      const imgUrl = `${BASE}${item.image.replace(/^\.?\//, '')}`;
      fig.innerHTML = `<img src="${imgUrl}" loading="lazy" alt=""><figcaption></figcaption>`;
      fig.querySelector('figcaption').textContent = `${item.title.ar} · 3D`;
      fig.addEventListener('click', () => activateItem(item));
      $('targets-list').append(fig);

      const chip = document.createElement('button');
      chip.textContent = item.title.ar.replace(/\s*\(متحف.*$/, '').replace(/\s*—.*$/, '');
      chip.style.cssText =
        'flex-shrink:0;height:28px;padding:0 11px;border-radius:999px;background:rgba(255,255,255,0.14);color:#fff;border:1px solid rgba(255,255,255,0.18);font-size:11.5px;cursor:pointer;white-space:nowrap;';
      chip.addEventListener('click', () => activateItem(item));
      bar.append(chip);
    }
    document.body.append(bar);

    // Also append all mooon.site records & covers to "Pictures it tracks"
    publishedRecords()
      .then((records) => {
        for (const r of records) {
          const ar = readRecord(r, 'ar');
          const en = readRecord(r, 'en');
          const img = en.coverUrl || coverGuess(r.id);
          const fig = document.createElement('figure');
          fig.style.cursor = 'pointer';
          fig.innerHTML = `<img src="${img}" loading="lazy" alt=""><figcaption></figcaption>`;
          fig.querySelector('figcaption').textContent = `${ar.title || en.title || r.id} · mooon.site`;
          fig.addEventListener('click', () =>
            activateItem({
              title: { ar: ar.title || en.title || r.id, en: en.title || ar.title || r.id },
              creator: { ar: ar.responsibility || ar.contributors[0]?.label },
              period: { ar: ar.date || en.date },
              details: { dimensions: en.dimensions },
              institution: { ar: ar.holder || 'mooon.site' },
              uri: opacUrl(r.id),
              description: { ar: ar.summary || ar.title },
            })
          );
          $('targets-list').append(fig);
        }
      })
      .catch(() => {});
  })
  .catch(() => {});
$('start').addEventListener('click', start);
$('show-targets').addEventListener('click', () => ($('targets').hidden = false));
$('close-targets').addEventListener('click', () => ($('targets').hidden = true));
$('close-pin').addEventListener('click', () => ($('pin').hidden = true));
$('back').href = `${BASE}index.html`;
