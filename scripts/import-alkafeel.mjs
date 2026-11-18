// scripts/import-alkafeel.mjs
// Crawls ALL 28 sections (~178 items) of Al-Kafeel Museum (https://museum.alkafeel.net/nafessPage),
// downloads all photos locally to public/images/alkafeel/ and enrol/alkafeel__<id>/,
// and writes public/data/alkafeel-catalogue.json + src/data/alkafeelArtifacts.ts.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const HALLS = [
  { catId: 2, hallAr: 'الأسلحة البيضاء (السيوف)', hallEn: 'Bladed Weapons (Swords)', appCat: 'artifact', prefix: 'SWD', fallbackGlb: './models/alkafeel/kfl-2126.glb?v=tex3' },
  { catId: 3, hallAr: 'الأسلحة النارية', hallEn: 'Historical Firearms', appCat: 'artifact', prefix: 'GUN', fallbackGlb: './models/alkafeel/kfl-2127.glb?v=tex3' },
  { catId: 4, hallAr: 'المخطوطات والنوادر', hallEn: 'Manuscripts & Rare Texts', appCat: 'manuscripts', prefix: 'MSS', fallbackGlb: './models/alkafeel/kfl-2198.glb?v=tex3' },
  { catId: 5, hallAr: 'المسكوكات والنقود', hallEn: 'Coins & Numismatics', appCat: 'history', prefix: 'CON', fallbackGlb: './models/alkafeel/kfl-2149.glb?v=tex3' },
  { catId: 6, hallAr: 'الكشاكيل التراثية', hallEn: 'Heritage Engraved Kashkuls', appCat: 'islamic-art', prefix: 'KSH', fallbackGlb: './models/alkafeel/kfl-2165.glb?v=tex3' },
  { catId: 7, hallAr: 'الشمعدانات التراثية', hallEn: 'Heritage Candlesticks', appCat: 'islamic-art', prefix: 'CND', fallbackGlb: './models/alkafeel/kfl-2151.glb?v=tex3' },
  { catId: 8, hallAr: 'الكفوف العباسية', hallEn: 'Sacred Shrine Hands (Kuffuf)', appCat: 'heritage', prefix: 'KUF', fallbackGlb: './models/alkafeel/kfl-2144.glb?v=tex3' },
  { catId: 11, hallAr: 'الطوابع التاريخية', hallEn: 'Historical Postage Stamps', appCat: 'history', prefix: 'STP', fallbackGlb: './models/alkafeel/kfl-2224.glb?v=tex3' },
  { catId: 13, hallAr: 'الحلي والمجوهرات', hallEn: 'Jewelry & Precious Ornaments', appCat: 'islamic-art', prefix: 'JWL', fallbackGlb: './models/alkafeel/kfl-2229.glb?v=tex3' },
  { catId: 16, hallAr: 'الأواني المعدنية', hallEn: 'Inlaid Metalware & Vessels', appCat: 'islamic-art', prefix: 'MTL', fallbackGlb: './models/alkafeel/kfl-2239.glb?v=tex3' },
  { catId: 18, hallAr: 'الزجاجيات الأثرية', hallEn: 'Antique Glassware', appCat: 'islamic-art', prefix: 'GLS', fallbackGlb: './models/alkafeel/kfl-2243.glb?v=tex3' },
  { catId: 19, hallAr: 'الساعات الأثرية', hallEn: 'Antique Clocks & Timepieces', appCat: 'artifact', prefix: 'CLK', fallbackGlb: './models/alkafeel/kfl-2139.glb?v=tex3' },
  { catId: 20, hallAr: 'المزهريات التراثية', hallEn: 'Heritage Vases', appCat: 'islamic-art', prefix: 'VAS', fallbackGlb: './models/alkafeel/kfl-2239.glb?v=tex3' },
  { catId: 21, hallAr: 'المنسوجات والسجاد', hallEn: 'Textiles & Sacred Carpets', appCat: 'islamic-art', prefix: 'TXT', fallbackGlb: './models/alkafeel/kfl-2136.glb?v=tex3' },
  { catId: 22, hallAr: 'الأقفال التراثية', hallEn: 'Historical Shrine Locks', appCat: 'artifact', prefix: 'LCK', fallbackGlb: './models/alkafeel/kfl-2243.glb?v=tex3' },
  { catId: 23, hallAr: 'ألواح الزيارات', hallEn: 'Sacred Ziyarat Tablets', appCat: 'heritage', prefix: 'ZYR', fallbackGlb: './models/alkafeel/kfl-2198.glb?v=tex3' },
  { catId: 24, hallAr: 'حاملات المصاحف', hallEn: 'Illuminated Quran Holders', appCat: 'heritage', prefix: 'QHL', fallbackGlb: './models/alkafeel/kfl-2300.glb?v=tex3' },
  { catId: 25, hallAr: 'القرب التراثية', hallEn: 'Heritage Water Flasks (Qirab)', appCat: 'heritage', prefix: 'QRB', fallbackGlb: './models/alkafeel/kfl-2165.glb?v=tex3' },
  { catId: 26, hallAr: 'الأوسمة والنياشين', hallEn: 'Historical Medals & Orders', appCat: 'history', prefix: 'MDL', fallbackGlb: './models/alkafeel/kfl-2149.glb?v=tex3' },
  { catId: 27, hallAr: 'القناديل والمشكاة', hallEn: 'Shrine Lanterns & Lamps', appCat: 'islamic-art', prefix: 'LNT', fallbackGlb: './models/alkafeel/kfl-2247.glb?v=tex3' },
  { catId: 28, hallAr: 'الصولجانات', hallEn: 'Ceremonial Maces & Scepters', appCat: 'artifact', prefix: 'SCP', fallbackGlb: './models/alkafeel/kfl-2151.glb?v=tex3' },
  { catId: 29, hallAr: 'اللوحات التراثية', hallEn: 'Heritage Paintings & Calligraphy', appCat: 'islamic-art', prefix: 'PNT', fallbackGlb: './models/alkafeel/kfl-2198.glb?v=tex3' },
  { catId: 30, hallAr: 'الأسلحة الدفاعية والدروع', hallEn: 'Defensive Armor & Shields', appCat: 'artifact', prefix: 'ARM', fallbackGlb: './models/alkafeel/kfl-2130.glb?v=tex3' },
  { catId: 31, hallAr: 'الأبواب التراثية', hallEn: 'Historical Sanctuary Doors', appCat: 'heritage', prefix: 'DOR', fallbackGlb: './models/alkafeel/kfl-2289.glb?v=tex3' },
  { catId: 32, hallAr: 'أجزاء الضريح المقدس', hallEn: 'Sacred Shrine Architecture Parts', appCat: 'heritage', prefix: 'SHR', fallbackGlb: './models/alkafeel/kfl-2289.glb?v=tex3' },
  { catId: 33, hallAr: 'المتفرقات التراثية', hallEn: 'Miscellaneous Museum Relics', appCat: 'artifact', prefix: 'MSC', fallbackGlb: './models/alkafeel/kfl-2239.glb?v=tex3' },
  { catId: 34, hallAr: 'رأس السارية والعلم', hallEn: 'Sacred Standard Finials (Alam)', appCat: 'heritage', prefix: 'FIN', fallbackGlb: './models/alkafeel/kfl-2144.glb?v=tex3' },
  { catId: 35, hallAr: 'الصناديق التراثية', hallEn: 'Heritage Sanctuary Chests', appCat: 'heritage', prefix: 'CST', fallbackGlb: './models/alkafeel/kfl-2300.glb?v=tex3' },
];

const IMG_DIR = path.resolve('public/images/alkafeel');
const ENROL_DIR = path.resolve('enrol');
const HELDOUT_DIR = path.resolve('enrol_heldout');
const DATA_DIR = path.resolve('public/data');
fs.mkdirSync(IMG_DIR, { recursive: true });
fs.mkdirSync(ENROL_DIR, { recursive: true });
fs.mkdirSync(HELDOUT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function cleanHtml(str) {
  return (str || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AlqamiMuseumSync/2.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function downloadBuffer(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function parseSubjectHtml(html, subjectId) {
  const cut = html.indexOf('اخر نفائس القسم');
  const mainHtml = cut !== -1 ? html.slice(0, cut) : html;

  const idx = mainHtml.indexOf('overScroll');
  const block = idx !== -1 ? mainHtml.slice(idx) : mainHtml;

  const pairs = {};
  const pairRegex = /<h3[^>]*>\s*([^<]+?)\s*<\/h3>\s*<\/div>\s*<div[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = pairRegex.exec(block)) !== null) {
    const k = cleanHtml(m[1]).replace(/\s*:\s*$/, '');
    const v = cleanHtml(m[2]);
    if (k && v) pairs[k] = v;
  }

  let descAr = pairs['وصف القطعة'] || '';
  if (!descAr) {
    const descMatch = block.match(/وصف القطعة\s*:?\s*<\/h3>[\s\S]{0,450}?<(?:p|h3|div)[^>]*>([\s\S]*?)<\/(?:p|h3|div)>/i);
    if (descMatch) descAr = cleanHtml(descMatch[1]);
  }

  // Extract all photos belonging to THIS item (before اخر نفائس القسم)
  const allImgs = [...new Set([...mainHtml.matchAll(/https:\/\/museum\.alkafeel\.net\/upload\/large\/(?:720\/)?img\d+\.[a-zA-Z]+/gi)].map((x) => x[0]))];
  // Prefer 720p for fast thumbnail & full large/ for enrolment variations
  const img720 = allImgs.filter((u) => u.includes('/720/'));
  const imgFull = allImgs.filter((u) => !u.includes('/720/'));
  const primaryUrl = img720[0] || imgFull[0] || '';
  const extraUrls = [...new Set([...imgFull, ...img720])].filter((u) => u !== primaryUrl);

  return { subjectId, pairs, descAr, primaryUrl, extraUrls };
}

function translateMetadataToEn(hall, parsed) {
  const { pairs, descAr, subjectId } = parsed;
  const rawType = pairs['نوع القطعة'] || pairs['اسم القطعة'] || pairs['العنوان'] || pairs['الفئة'] || hall.hallAr;
  const museumNo = pairs['الرقم المتحفي'] || subjectId;
  const materialAr =
    pairs['المواد المستعملة في صناعة القطعة'] ||
    pairs['المادة'] ||
    pairs['مادة الصنع'] ||
    pairs['المعدن'] ||
    'مواد تراثية أثرية';
  const periodAr =
    pairs['تاريخ الصناعة'] ||
    pairs['سنة الإصدار'] ||
    pairs['العهد'] ||
    pairs['القرن'] ||
    pairs['التاريخ'] ||
    'تراث العتبة العباسية المقدسة';

  const matMap = [
    [/حديد الجوهر|سبيكة الجوهر/g, 'Damascus Wootz Steel'],
    [/ذهب/g, 'Gold'],
    [/فضة|الفضة/g, 'Silver'],
    [/نحاس|النحاس/g, 'Copper/Brass'],
    [/خشب|الخشب/g, 'Wood'],
    [/جلد|الجلد/g, 'Leather'],
    [/ورق|الورق/g, 'Handmade Paper'],
    [/زجاج|الزجاج/g, 'Glass'],
    [/صوف|الصوف/g, 'Wool'],
    [/حرير|الحرير/g, 'Silk'],
    [/مينا|المينا/g, 'Enamel'],
    [/فولاذ|الفولاذ/g, 'Steel'],
    [/برونز|البرونز/g, 'Bronze'],
  ];
  const materialEn = [];
  for (const [rx, en] of matMap) {
    if (rx.test(materialAr + ' ' + descAr)) materialEn.push(en);
  }
  const materialEnStr = materialEn.length ? materialEn.join(' / ') : 'Authentic Heritage Material';

  const dimParts = [];
  for (const [k, v] of Object.entries(pairs)) {
    if (/طول|عرض|قطر|سمك|وزن|قياس|ارتفاع/.test(k) && v && v !== 'مفقود') {
      dimParts.push(`${k}: ${v}`);
    }
  }
  const dimensions = dimParts.slice(0, 4).join(' • ') || 'قياسات متحفية معيارية';

  let titleEn = `${hall.hallEn.replace(/\s*\(.*\)/, '')} (#${museumNo})`;
  if (/سليم خان/.test(rawType + descAr)) titleEn = `Sword of Ottoman Sultan Selim Khan (#${museumNo})`;
  else if (/جعفر خان/.test(rawType + descAr)) titleEn = `Sword of Sultan Jafar Khan Zand (#${museumNo})`;
  else if (/سيف/.test(rawType)) titleEn = `Historical Damascus Steel Sword (#${museumNo})`;
  else if (/كشكول/.test(rawType + descAr)) titleEn = `Engraved Heritage Kashkul (#${museumNo})`;
  else if (/طابع/.test(rawType + descAr)) titleEn = `Historical Iraqi Postage Stamp (#${museumNo})`;
  else if (/مخطوط|قرآن|مصحف/.test(rawType + descAr)) titleEn = `Illuminated Heritage Manuscript (#${museumNo})`;
  else if (/شمعدان/.test(rawType + descAr)) titleEn = `Antique Shrine Candlestick (#${museumNo})`;
  else if (/كف/.test(rawType + descAr)) titleEn = `Sacred Abbasid Standard Hand — Kaff (#${museumNo})`;
  else if (/ساعة/.test(rawType + descAr)) titleEn = `Antique Shrine Timepiece (#${museumNo})`;
  else if (/سجاد|بساط/.test(rawType + descAr)) titleEn = `Hand-Knotted Heritage Carpet (#${museumNo})`;
  else if (/قنديل|مشكاة/.test(rawType + descAr)) titleEn = `Gilded Shrine Lantern (#${museumNo})`;
  else if (/درع|خوذة/.test(rawType + descAr)) titleEn = `Historical Defensive Armor (#${museumNo})`;
  else if (/ضريح|شباك|باب/.test(rawType + descAr)) titleEn = `Sacred Shrine Architectural Relic (#${museumNo})`;
  else if (/صندوق/.test(rawType + descAr)) titleEn = `Inlaid Sanctuary Chest (#${museumNo})`;

  const descEn = `Authentic heritage artifact preserved in the Al-Kafeel Museum of Treasures and Manuscripts at the Al-Abbas Holy Shrine in Karbala (Serial #${subjectId}, Museum No. ${museumNo}). Section: ${hall.hallEn}. Materials: ${materialEnStr}.`;

  return {
    rawType,
    museumNo,
    materialAr,
    materialEn: materialEnStr,
    periodAr,
    periodEn: periodAr.replace(/م/g, 'CE').replace(/هـ/g, 'AH'),
    dimensions,
    titleEn,
    descEn,
  };
}

async function processInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const out = await Promise.all(batch.map((it) => fn(it).catch(() => null)));
    results.push(...out.filter(Boolean));
  }
  return results;
}

async function main() {
  const tasks = [];
  const seenSubjects = new Set();

  for (const hall of HALLS) {
    try {
      const catHtml = await fetchHtml(`https://museum.alkafeel.net/nafessPage/${hall.catId}`);
      // Match each card on /nafessPage/<catId>: subject link + card image + summary paragraph
      const cardRegex = /<a\s+href=["']https:\/\/museum\.alkafeel\.net\/subjects\/(\d+)["'][^>]*>\s*<img\s+src=["']([^"']+)["'][^>]*>\s*<\/a>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
      let cm;
      while ((cm = cardRegex.exec(catHtml)) !== null) {
        const sid = cm[1];
        if (seenSubjects.has(sid)) continue;
        seenSubjects.add(sid);
        tasks.push({ hall, sid, cardImg: cm[2].trim(), cardSummary: cleanHtml(cm[3]) });
      }
      // Also catch any subject links not matched by cardRegex
      const subjectIds = [...new Set([...catHtml.matchAll(/https:\/\/museum\.alkafeel\.net\/subjects\/(\d+)/g)].map((m) => m[1]))];
      for (const sid of subjectIds) {
        if (seenSubjects.has(sid)) continue;
        seenSubjects.add(sid);
        tasks.push({ hall, sid, cardImg: '', cardSummary: '' });
      }
    } catch (err) {
      console.warn(`⚠️ Skipping hall ${hall.catId}:`, err.message);
    }
  }

  console.log(`🏛️ Found ${tasks.length} unique Al-Kafeel Museum items across 28 halls. Fetching details & enrolment photos...`);

  const artifacts = await processInBatches(tasks, 5, async ({ hall, sid, cardImg, cardSummary }) => {
    const sHtml = await fetchHtml(`https://museum.alkafeel.net/subjects/${sid}`).catch(() => '');
    const parsed = sHtml ? parseSubjectHtml(sHtml, sid) : { subjectId: sid, pairs: {}, descAr: cardSummary, primaryUrl: cardImg, extraUrls: [] };
    if (!parsed.primaryUrl && cardImg) parsed.primaryUrl = cardImg;
    if (!parsed.descAr && cardSummary) parsed.descAr = cardSummary;
    if (!parsed.primaryUrl) return null;

    const localImgName = `kfl-${sid}.jpg`;
    const localImgPath = path.join(IMG_DIR, localImgName);

    let primaryBuf = null;
    if (fs.existsSync(localImgPath) && fs.statSync(localImgPath).size > 1000) {
      primaryBuf = fs.readFileSync(localImgPath);
    } else {
      const dl = await downloadBuffer(parsed.primaryUrl);
      if (!dl) return null;
      primaryBuf = await sharp(dl).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
      fs.writeFileSync(localImgPath, primaryBuf);
    }

    const id = `KFL-${hall.prefix}-${sid}`;
    const slug = `alkafeel-${hall.prefix.toLowerCase()}-${sid}`;

    // Save enrolment folder enrol/alkafeel__<sid>/scan.jpg (and held-out test view if extra photo exists!)
    const enrolFolder = path.join(ENROL_DIR, `alkafeel__${sid}`);
    fs.mkdirSync(enrolFolder, { recursive: true });
    const enrolScanPath = path.join(enrolFolder, 'scan.jpg');
    if (!fs.existsSync(enrolScanPath)) {
      fs.writeFileSync(enrolScanPath, primaryBuf);
    }

    // If the item has additional photos (e.g. full-res or second angle), save one held back in enrol_heldout/alkafeel__<sid>.jpg
    // for the 0.76 / 0.06 threshold benchmark test!
    const heldOutPath = path.join(HELDOUT_DIR, `alkafeel__${sid}.jpg`);
    if (!fs.existsSync(heldOutPath) && parsed.extraUrls.length > 0) {
      const extraBuf = await downloadBuffer(parsed.extraUrls[0]).catch(() => null);
      if (extraBuf && extraBuf.length > 1000) {
        fs.writeFileSync(heldOutPath, extraBuf);
      }
    }

    const meta = translateMetadataToEn(hall, parsed);
    const rawTypeClean = parsed.pairs['نوع القطعة'] ? parsed.pairs['نوع القطعة'].trim() : '';
    const titleAr =
      rawTypeClean && rawTypeClean.length > 3
        ? `${rawTypeClean} (متحف الكفيل #${meta.museumNo})`
        : `${hall.hallAr.replace(/\s*\(.*\)/, '')} — رقم متحفي ${meta.museumNo}`;

    // Use dedicated TripoSR 3D GLB if built for this sid, else hall's TripoSR 3D GLB
    const ownGlbPath = path.resolve(`public/models/alkafeel/kfl-${sid}.glb`);
    const glbUrl = fs.existsSync(ownGlbPath) ? `./models/alkafeel/kfl-${sid}.glb?v=tex3` : hall.fallbackGlb;

    return {
      id,
      slug,
      title: {
        ar: titleAr,
        en: meta.titleEn,
      },
      subtitle: {
        ar: `${hall.hallAr} • التسلسل ${sid} • الرقم المتحفي ${meta.museumNo}`,
        en: `${hall.hallEn} • Serial #${sid} • Museum No. ${meta.museumNo}`,
      },
      category: hall.appCat,
      categoryLabel: {
        ar: `متحف الكفيل • ${hall.hallAr}`,
        en: `Al-Kafeel • ${hall.hallEn}`,
      },
      period: {
        ar: meta.periodAr,
        en: meta.periodEn,
      },
      creator: {
        ar: parsed.pairs['الصانع'] || parsed.pairs['الناسخ'] || parsed.pairs['جهة الورود'] || 'دار صناعة تراثية (مقتنيات متحف الكفيل)',
        en: 'Heritage Master Artisan (Al-Kafeel Museum Collection)',
      },
      institution: {
        ar: 'متحف الكفيل للنفائس والمخطوطات • العتبة العباسية المقدسة (كربلاء)',
        en: 'Al-Kafeel Museum of Treasures & Manuscripts • Al-Abbas Holy Shrine',
      },
      itemCode: `alkafeel:${sid}`,
      image: `./images/alkafeel/${localImgName}`,
      model: {
        glb: glbUrl,
        scale: 1.0,
      },
      description: {
        ar:
          parsed.descAr ||
          `قطعة أثرية أصيلة محفوظة في متحف الكفيل للنفائس والمخطوطات في العتبة العباسية المقدسة ضمن قسم (${hall.hallAr})، رقم التسلسل (${sid}) والرقم المتحفي (${meta.museumNo}).`,
        en: meta.descEn,
      },
      details: {
        dimensions: meta.dimensions,
        material: {
          ar: meta.materialAr,
          en: meta.materialEn,
        },
        condition: {
          ar: 'معروضة ومحفوظة في قاعة متحف الكفيل للنفائس والمخطوطات',
          en: 'Preserved & exhibited at Al-Kafeel Museum Hall',
        },
        decoration: parsed.descAr
          ? {
              ar: parsed.descAr,
              en: meta.descEn,
            }
          : undefined,
      },
    };
  });

  const jsonPath = path.join(DATA_DIR, 'alkafeel-catalogue.json');
  fs.writeFileSync(jsonPath, JSON.stringify(artifacts, null, 2), 'utf8');

  const tsContent = `// Auto-generated by scripts/import-alkafeel.mjs from https://museum.alkafeel.net/nafessPage (${artifacts.length} items)
import type { AlqamiArtifact } from './alqamiArtifacts';

export const ALKAFEEL_ARTIFACTS: AlqamiArtifact[] = ${JSON.stringify(artifacts, null, 2)};
`;
  fs.writeFileSync(path.resolve('src/data/alkafeelArtifacts.ts'), tsContent, 'utf8');

  console.log(`\n🎉 Successfully imported ${artifacts.length} Al-Kafeel Museum treasures with enrolment folders (enrol/alkafeel__<id>/)!`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
