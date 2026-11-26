// scripts/alkafeel-records.mjs
// Rewrites the text of the 183 Al-Kafeel Museum objects from the museum's own item pages, word for word:
//   node scripts/alkafeel-records.mjs <folder of saved museum.alkafeel.net/subjects/<id>.html pages>
// Keeps each object's id, slug, picture and 3D model; replaces its title, description and fields. Nothing is made up:
// the description and every value are the museum's Arabic text; English is given only for labels and names
// (scripts/alkafeel-terms.mjs), and an English description is left empty until a person writes or checks one.
// Save the pages slowly (the museum's server answers 429 to fast requests), e.g. one every 3 seconds.

import fs from 'node:fs';
import path from 'node:path';
import { ARRIVALS, HALLS, LABELS, SECTIONS, SINGULAR, normaliseLabel } from './alkafeel-terms.mjs';

const pagesDir = process.argv[2];
if (!pagesDir || !fs.existsSync(pagesDir)) {
  console.error('Usage: node scripts/alkafeel-records.mjs <folder with <id>.html pages>');
  process.exit(1);
}

const TS = path.resolve('src/data/alkafeelArtifacts.ts');
const JSON_OUT = path.resolve('public/data/alkafeel-catalogue.json');
const src = fs.readFileSync(TS, 'utf8');
const old = JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));

const clean = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** One item page: its hall, section, labelled fields in page order, description and full-size photo. */
function parse(html) {
  const a = html.indexOf('overScroll');
  const b = html.indexOf('اخر نفائس القسم');
  if (a < 0 || b < 0) return null;
  const block = html.slice(a, b);
  const head = html.slice(0, a);
  const h3 = [...block.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => clean(m[1]));
  const fields = [];
  let description = '';
  for (let i = 0; i < h3.length; i++) {
    if (!/:\s*$/.test(h3[i]) || i + 1 >= h3.length || /:\s*$/.test(h3[i + 1])) continue;
    const label = normaliseLabel(h3[i].replace(/\s*:\s*$/, ''));
    const value = h3[++i];
    if (!value) continue;
    if (label === 'وصف القطعة') description = value;
    else fields.push([label, value]);
  }
  const hallMatch = head.match(/nafessPage\/(\d+)">([^<]+)<\/a>\s*<\/h4>/);
  const section = clean([...head.matchAll(/<h4[^>]*>([^<]*)<\/h4>/g)].map((m) => m[1]).pop() || '');
  const photo = (block.match(/data-fancybox="gallery" href="([^"]+)"/) || [])[1] || '';
  return { hallId: hallMatch ? +hallMatch[1] : 0, hall: hallMatch ? clean(hallMatch[2]) : '', section, fields, description, photo };
}

const field = (p, ...labels) => {
  for (const l of labels) {
    const f = p.fields.find(([k]) => k === l);
    if (f) return f[1];
  }
  return '';
};

// Empty, not a filler sentence: the voice then says "the record does not say", and pages skip the row.
const missing = { ar: '', en: '' };
const unknownLabels = new Set();
let updated = 0;
const out = old.map((art) => {
  const id = (art.uri || '').match(/subjects\/(\d+)/)?.[1];
  const file = id && path.join(pagesDir, `${id}.html`);
  if (!file || !fs.existsSync(file)) {
    console.warn('No saved page for', art.id, '- kept as it was');
    return art;
  }
  const p = parse(fs.readFileSync(file, 'utf8'));
  if (!p) {
    console.warn('Could not read the page for', art.id, '- kept as it was');
    return art;
  }
  updated++;

  const museumNo = field(p, 'الرقم المتحفي');
  const serial = field(p, 'التسلسل') || id;
  const type = field(p, 'نوع القطعة');
  const [oneAr, oneEn] = SINGULAR[p.section] || [p.section || p.hall, SECTIONS[p.section] || HALLS[p.hallId] || 'Object'];
  const numAr = museumNo ? `رقم ${museumNo}` : `تسلسل ${serial}`;
  const numEn = museumNo ? `No. ${museumNo}` : `Serial ${serial}`;
  const hallEn = HALLS[p.hallId] || p.hall;
  const sectionEn = SECTIONS[p.section] || p.section;
  const sectionPart = (ar, en) => (p.section && p.section !== p.hall ? { ar: `${p.hall} • ${ar}`, en: `${hallEn} • ${en}` } : { ar: p.hall, en: hallEn });
  const where = sectionPart(p.section, sectionEn);

  const year = field(p, 'سنة الصنع', 'تاريخ الصنع', 'الفترة الزمنية', 'سنة الإصدار', 'تاريخ الإصدار', 'سنة الضرب', 'عمر السجادة التقريبي');
  const maker = field(p, 'اسم الصانع');
  const arrival = field(p, 'جهة الورود');
  const materials = field(p, 'المواد المستعملة في صناعة القطعة', 'نوع المادة', 'نوع المعدن');
  const sizeLabels = Object.keys(LABELS).filter((l) => /طول|عرض|سمك|ارتفاع|قطر|قياس|الأبعاد|القياس|وزن|الوزن/.test(l));
  const dimensions = p.fields
    .filter(([k]) => sizeLabels.includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join(' • ');

  const facts = p.fields.map(([k, v]) => {
    if (!LABELS[k]) unknownLabels.add(k);
    return { label: { ar: k, en: LABELS[k] || '' }, value: v };
  });

  return {
    ...art,
    title: { ar: type || `${oneAr} · ${numAr}`, en: type ? `${oneEn} · ${numEn}` : `${oneEn} · ${numEn}` },
    subtitle: { ar: `${where.ar} • ${numAr}`, en: `${where.en} • ${numEn}` },
    categoryLabel: { ar: `متحف الكفيل • ${where.ar}`, en: `Al-Kafeel Museum • ${where.en}` },
    period: year ? { ar: year, en: year } : missing,
    creator: maker ? { ar: maker, en: maker } : missing,
    institution: {
      ar: 'متحف الكفيل للنفائس والمخطوطات • العتبة العباسية المقدسة، كربلاء',
      en: 'Al-Kafeel Museum of Treasures and Manuscripts • al-Abbas Holy Shrine, Karbala',
    },
    description: { ar: p.description || art.description.ar, en: '' },
    details: {
      dimensions,
      material: { ar: materials, en: '' },
      condition: { ar: '', en: '' },
      ...(arrival ? { delivery: { ar: arrival, en: ARRIVALS[arrival] || '' } } : {}),
    },
    facts,
    source: {
      name: { ar: 'متحف الكفيل للنفائس والمخطوطات', en: 'Al-Kafeel Museum' },
      url: `https://museum.alkafeel.net/subjects/${id}`,
      photo: p.photo,
    },
    modelKind: 'ai-from-photo',
  };
});

const header =
  '// Made by scripts/alkafeel-records.mjs from the Al-Kafeel Museum item pages (museum.alkafeel.net/subjects/<id>).\n' +
  '// Descriptions and values are the museum\'s own Arabic text; English is labels and names only. The 3D models are\n' +
  '// AI reconstructions from one photo each (modelKind "ai-from-photo"), not scans. Do not edit by hand.\n';
fs.writeFileSync(
  TS,
  `${header}import type { AlqamiArtifact } from './alqamiArtifacts';\n\nexport const ALKAFEEL_ARTIFACTS: AlqamiArtifact[] = ${JSON.stringify(out, null, 2)};\n`,
);
fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
console.log(`Updated ${updated} of ${old.length} objects from saved pages.`);
if (unknownLabels.size) console.log('Labels with no English yet:', [...unknownLabels].join(' | '));
