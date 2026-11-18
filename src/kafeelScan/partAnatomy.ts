import { AlqamiArtifact } from '../data/alqamiArtifacts';

export interface SpatialPartNode {
  id: string;
  /** Offset from object center as fraction of object bounding box (-0.45 .. +0.45) */
  dx: number;
  dy: number;
  /** Preferred side for the floating metadata card ('top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top' | 'bottom') */
  dock: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top' | 'bottom';
  /** 3D coordinate on the normalized unit GLB mesh */
  pos3d: [number, number, number];
  badgeAr: string;
  badgeEn: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  metric?: string;
  color: string;
}

/**
 * Generates 4 precision spatial part-attached metadata nodes for any Al-Kafeel or Alqami artifact.
 * Each node anchors directly to a physical 3D region of the artifact (blade, hilt, rim, calligraphy band,
 * finial, colophon, armor dome, lock mechanism, etc.) and flows outward via an animated SVG bezier leader line.
 */
export function getSpatialPartsForArtifact(a: AlqamiArtifact): SpatialPartNode[] {
  const id = a.id.toUpperCase();
  const matAr = a.details?.material?.ar || 'معدن تراثي أصيل';
  const matEn = a.details?.material?.en || 'Authentic Heritage Material';
  const dim = a.details?.dimensions || 'قياسات متحفية معيارية';
  const periodAr = a.period?.ar || 'تراث العتبة العباسية المقدسة';
  const periodEn = a.period?.en || 'Al-Abbas Holy Shrine Heritage';

  // 1. Swords & Bladed Weapons (SWD)
  if (id.includes('-SWD-')) {
    return [
      {
        id: 'hilt',
        dx: -0.34,
        dy: -0.06,
        dock: 'top-left',
        pos3d: [-0.34, 0.06, 0.08],
        badgeAr: 'المقبض والواقية',
        badgeEn: 'Hilt & Crossguard',
        titleAr: 'قبضة السيف والواقية المتصالبة',
        titleEn: 'Ergonomic Hilt & Quillon Guard',
        detailAr: `مصنوعة بدقة لحماية اليد وموازنة النصل • ${dim}`,
        detailEn: `Precision-balanced hilt assembly • ${dim}`,
        metric: periodAr,
        color: '#fbbf24',
      },
      {
        id: 'inscription',
        dx: -0.04,
        dy: -0.14,
        dock: 'top-right',
        pos3d: [0.02, 0.12, 0.09],
        badgeAr: 'النقش والتذهيب',
        badgeEn: 'Gold Damascening',
        titleAr: 'كتابة مذهّبة بتقنية الترصيع (الكفتگاری)',
        titleEn: 'Gold-Inlaid Royal Calligraphic Cartouche',
        detailAr: a.description.ar.slice(0, 125),
        detailEn: a.description.en.slice(0, 125),
        metric: a.itemCode,
        color: '#34d399',
      },
      {
        id: 'blade',
        dx: 0.28,
        dy: 0.14,
        dock: 'bottom-right',
        pos3d: [0.3, -0.1, 0.07],
        badgeAr: 'نصل الجوهر',
        badgeEn: 'Wootz Steel Blade',
        titleAr: `نصل مقوّس من ${matAr}`,
        titleEn: `Curved Blade (${matEn})`,
        detailAr: 'تموجات فولاذ الجوهر الدمشقي عالية الصلابة والمرونة',
        detailEn: 'High-carbon watered crucible wootz steel pattern',
        metric: matAr,
        color: '#38bdf8',
      },
      {
        id: 'scabbard',
        dx: -0.08,
        dy: 0.22,
        dock: 'bottom-left',
        pos3d: [-0.1, -0.22, 0.07],
        badgeAr: 'الغمد والحليات',
        badgeEn: 'Scabbard & Mounts',
        titleAr: 'الغمد التراثي وحلقات التعليق',
        titleEn: 'Fitted Scabbard with Gilded Lockets',
        detailAr: `محفوظ في ${a.institution.ar}`,
        detailEn: `Preserved at ${a.institution.en}`,
        metric: 'متحف الكفيل',
        color: '#c084fc',
      },
    ];
  }

  // 2. Kashkuls & Vessels & Bowls (KSH, MTL, BWL, VAS, GLS, QRB)
  if (
    id.includes('-KSH-') ||
    id.includes('-MTL-') ||
    id.includes('-BWL-') ||
    id.includes('-VAS-') ||
    id.includes('-GLS-') ||
    id.includes('-QRB-')
  ) {
    return [
      {
        id: 'rim',
        dx: -0.14,
        dy: -0.26,
        dock: 'top-left',
        pos3d: [-0.14, 0.24, 0.14],
        badgeAr: 'الفوهة والحافة',
        badgeEn: 'Scalloped Rim',
        titleAr: 'فوهة الوعاء المزخرفة بالنقوش النباتية',
        titleEn: 'Ornamented Rim & Upper Lip',
        detailAr: `حافة مشغولة يدويًا من ${matAr}`,
        detailEn: `Hand-worked rim crafted from ${matEn}`,
        metric: matAr,
        color: '#fbbf24',
      },
      {
        id: 'calligraphy-band',
        dx: 0.1,
        dy: -0.04,
        dock: 'top-right',
        pos3d: [0.1, 0.05, 0.22],
        badgeAr: 'شريط المخطوطات والنقش',
        badgeEn: 'Epigraphic Register',
        titleAr: 'إفريز الكتابات والأبيات المحفورة',
        titleEn: 'Engraved Calligraphic & Floral Register',
        detailAr: a.description.ar.slice(0, 125),
        detailEn: a.description.en.slice(0, 125),
        metric: periodAr,
        color: '#34d399',
      },
      {
        id: 'chains',
        dx: 0.32,
        dy: -0.14,
        dock: 'bottom-right',
        pos3d: [0.32, -0.08, 0.12],
        badgeAr: 'الحلقات والسلاسل',
        badgeEn: 'Suspension Rings',
        titleAr: 'عروة التعليق والسلسلة المضفورة',
        titleEn: 'Forged Lug Ring & Braided Chain',
        detailAr: `تثبيت متوازن لحمل القطعة • ${dim}`,
        detailEn: `Balanced twin suspension mounts • ${dim}`,
        metric: a.itemCode,
        color: '#38bdf8',
      },
      {
        id: 'base',
        dx: -0.08,
        dy: 0.26,
        dock: 'bottom-left',
        pos3d: [-0.08, -0.25, 0.15],
        badgeAr: 'البدن والقاعدة',
        badgeEn: 'Vessel Body & Base',
        titleAr: 'تقعير البدن السفلي المتناظر',
        titleEn: 'Hand-Hammered Lower Hull & Base',
        detailAr: a.details.condition.ar,
        detailEn: a.details.condition.en,
        metric: 'حفظ متحفي',
        color: '#c084fc',
      },
    ];
  }

  // 3. Sacred Hands / Kuffuf & Finials / Standards (KUF, FIN, SCP)
  if (id.includes('-KUF-') || id.includes('-FIN-') || id.includes('-SCP-')) {
    return [
      {
        id: 'fingers',
        dx: -0.08,
        dy: -0.32,
        dock: 'top-left',
        pos3d: [-0.08, 0.32, 0.08],
        badgeAr: 'الأصابع المنقوشة',
        badgeEn: 'Inscribed Digits',
        titleAr: 'أصابع الكف العلوي المذهّبة',
        titleEn: 'Finely Engraved Upper Digits',
        detailAr: `مشغولة من ${matAr} بنقوش إسلامية دقيقة`,
        detailEn: `Crafted in ${matEn} with devotional calligraphy`,
        metric: matAr,
        color: '#fbbf24',
      },
      {
        id: 'palm-center',
        dx: 0.08,
        dy: -0.04,
        dock: 'top-right',
        pos3d: [0.08, 0.04, 0.12],
        badgeAr: 'قلب الكف والمأثورات',
        badgeEn: 'Central Medallion',
        titleAr: 'الطرّة المركزية والنقوش المباركة',
        titleEn: 'Central Epigraphic Cartouche',
        detailAr: a.description.ar.slice(0, 125),
        detailEn: a.description.en.slice(0, 125),
        metric: periodAr,
        color: '#34d399',
      },
      {
        id: 'wrist-cuff',
        dx: 0.14,
        dy: 0.18,
        dock: 'bottom-right',
        pos3d: [0.14, -0.16, 0.09],
        badgeAr: 'طوق المعصم الزخرفي',
        badgeEn: 'Ornamental Wrist Collar',
        titleAr: 'الإفريز الزخرفي الفاصل حول المعصم',
        titleEn: 'Chased Floral Collar & Rim Band',
        detailAr: `زخارف نباتية وهندسية متناظرة • ${dim}`,
        detailEn: `Symmetrical floral & geometric chasing • ${dim}`,
        metric: a.itemCode,
        color: '#38bdf8',
      },
      {
        id: 'socket',
        dx: -0.06,
        dy: 0.34,
        dock: 'bottom-left',
        pos3d: [-0.06, -0.34, 0.08],
        badgeAr: 'قاعدة السارية',
        badgeEn: 'Standard Socket Base',
        titleAr: 'جلبة التثبيت الأسطوانية على السارية',
        titleEn: 'Turned Cylindrical Pole Mount',
        detailAr: a.details.condition.ar,
        detailEn: a.details.condition.en,
        metric: 'متحف الكفيل',
        color: '#c084fc',
      },
    ];
  }

  // 4. Manuscripts, Qur'ans, Stamps, Tablets (MSS, STP, ZYR, PNT, QUR, MS, TAB, MAP)
  if (
    id.includes('-MSS-') ||
    id.includes('-STP-') ||
    id.includes('-ZYR-') ||
    id.includes('-PNT-') ||
    id.includes('-QUR-') ||
    id.includes('-MS-') ||
    id.includes('-TAB-') ||
    id.includes('-MAP-')
  ) {
    return [
      {
        id: 'header',
        dx: -0.12,
        dy: -0.28,
        dock: 'top-left',
        pos3d: [-0.12, 0.28, 0.07],
        badgeAr: 'السرلوح والترويسة',
        badgeEn: 'Illuminated Headpiece',
        titleAr: 'السرلوح والزخارف المذهّبة العلوية',
        titleEn: 'Gilded Header & Ornamental Frontispiece',
        detailAr: `تراث مكتوب على ${matAr} • ${periodAr}`,
        detailEn: `Preserved on ${matEn} • ${periodEn}`,
        metric: periodAr,
        color: '#fbbf24',
      },
      {
        id: 'script',
        dx: 0.08,
        dy: -0.04,
        dock: 'top-right',
        pos3d: [0.08, 0.04, 0.09],
        badgeAr: 'متن الخط والنص',
        badgeEn: 'Calligraphic Script',
        titleAr: 'الخط التاريخي المتقن ومداد الكتابة',
        titleEn: 'Main Calligraphic Text & Ink Pigments',
        detailAr: a.description.ar.slice(0, 125),
        detailEn: a.description.en.slice(0, 125),
        metric: a.itemCode,
        color: '#34d399',
      },
      {
        id: 'borders',
        dx: 0.24,
        dy: 0.18,
        dock: 'bottom-right',
        pos3d: [0.24, -0.16, 0.07],
        badgeAr: 'الجداول والتذهيب',
        badgeEn: 'Gold-Ruled Borders',
        titleAr: 'جداول الذهب والإطار الهندسي المحيط',
        titleEn: 'Gilded Ruling Lines & Marginal Frame',
        detailAr: `القياسات: ${dim}`,
        detailEn: `Dimensions: ${dim}`,
        metric: matAr,
        color: '#38bdf8',
      },
      {
        id: 'seals',
        dx: -0.18,
        dy: 0.26,
        dock: 'bottom-left',
        pos3d: [-0.18, -0.26, 0.07],
        badgeAr: 'الأختام والوقفية',
        badgeEn: 'Seals & Colophon',
        titleAr: 'علامات الوقف والتوثيق المتحفي',
        titleEn: 'Endowment Seals & Archival Provenance',
        detailAr: a.institution.ar,
        detailEn: a.institution.en,
        metric: a.id,
        color: '#c084fc',
      },
    ];
  }

  // 5. Helmets, Shields, Armor, Maces, Axes & Firearms (ARM, HLM)
  if (id.includes('-ARM-') || id.includes('-HLM-')) {
    return [
      {
        id: 'dome',
        dx: -0.1,
        dy: -0.26,
        dock: 'top-left',
        pos3d: [-0.1, 0.26, 0.14],
        badgeAr: 'القبة والبدن الفولاذي',
        badgeEn: 'Forged Steel Dome',
        titleAr: 'البدن المطروق من الفولاذ الدمشقي',
        titleEn: 'Hand-Forged Steel Crown & Boss',
        detailAr: `مشغول من ${matAr} بصلابة دفاعية عالية`,
        detailEn: `Forged from ${matEn} for battle protection`,
        metric: matAr,
        color: '#fbbf24',
      },
      {
        id: 'inlay',
        dx: 0.12,
        dy: -0.04,
        dock: 'top-right',
        pos3d: [0.12, 0.04, 0.18],
        badgeAr: 'الترصيع والآيات',
        badgeEn: 'Gold Inlay & Epigraphy',
        titleAr: 'أشرطة النقوش المذهّبة والزخارف الإسلامية',
        titleEn: 'Gold-Damascened Calligraphic Bands',
        detailAr: a.description.ar.slice(0, 125),
        detailEn: a.description.en.slice(0, 125),
        metric: periodAr,
        color: '#34d399',
      },
      {
        id: 'guards',
        dx: 0.24,
        dy: 0.18,
        dock: 'bottom-right',
        pos3d: [0.24, -0.18, 0.12],
        badgeAr: 'الحواف والواقيات',
        badgeEn: 'Rim & Protective Guards',
        titleAr: 'الأجزاء الواقية ومسامير التثبيت',
        titleEn: 'Reinforced Rim & Riveted Mounts',
        detailAr: `القياسات: ${dim}`,
        detailEn: `Measurements: ${dim}`,
        metric: a.itemCode,
        color: '#38bdf8',
      },
      {
        id: 'provenance',
        dx: -0.18,
        dy: 0.26,
        dock: 'bottom-left',
        pos3d: [-0.18, -0.26, 0.11],
        badgeAr: 'الحفظ المتحفي',
        badgeEn: 'Museum Conservation',
        titleAr: 'قاعة السلاح التراثي في متحف الكفيل',
        titleEn: 'Al-Kafeel Museum Arms & Armor Hall',
        detailAr: a.details.condition.ar,
        detailEn: a.details.condition.en,
        metric: a.id,
        color: '#c084fc',
      },
    ];
  }

  // 6. Lanterns, Candlesticks, Clocks, Coins, Shrine Parts & Chests (LNT, CND, CLK, CON, SHR, CST, etc.)
  return [
    {
      id: 'crown',
      dx: -0.1,
      dy: -0.28,
      dock: 'top-left',
      pos3d: [-0.1, 0.28, 0.12],
      badgeAr: 'القسم العلوي والتاج',
      badgeEn: 'Upper Crown & Finial',
      titleAr: 'التاج العلوي والزخارف البارزة',
      titleEn: 'Upper Crown & Sculpted Relief',
      detailAr: `مصنوع من ${matAr} بحرفية تراثية عالية`,
      detailEn: `Crafted from ${matEn} with fine relief work`,
      metric: matAr,
      color: '#fbbf24',
    },
    {
      id: 'core',
      dx: 0.1,
      dy: -0.02,
      dock: 'top-right',
      pos3d: [0.1, 0.02, 0.18],
      badgeAr: 'القلب والنقش المركزي',
      badgeEn: 'Central Motif & Inscription',
      titleAr: a.title.ar,
      titleEn: a.title.en,
      detailAr: a.description.ar.slice(0, 130),
      detailEn: a.description.en.slice(0, 130),
      metric: periodAr,
      color: '#34d399',
    },
    {
      id: 'structure',
      dx: 0.24,
      dy: 0.2,
      dock: 'bottom-right',
      pos3d: [0.22, -0.2, 0.13],
      badgeAr: 'البنية والقياسات',
      badgeEn: 'Structure & Dimensions',
      titleAr: 'الهيكل الهندسي وقاعدة الارتكاز',
      titleEn: 'Structural Frame & Base Plinth',
      detailAr: `${dim} • ${a.subtitle?.ar || a.categoryLabel.ar}`,
      detailEn: `${dim} • ${a.subtitle?.en || a.categoryLabel.en}`,
      metric: a.itemCode,
      color: '#38bdf8',
    },
    {
      id: 'provenance',
      dx: -0.22,
      dy: 0.24,
      dock: 'bottom-left',
      pos3d: [-0.22, -0.22, 0.11],
      badgeAr: 'التوثيق المتحفي',
      badgeEn: 'Museum Provenance',
      titleAr: a.institution.ar,
      titleEn: a.institution.en,
      detailAr: a.details.condition.ar,
      detailEn: a.details.condition.en,
      metric: a.id,
      color: '#c084fc',
    },
  ];
}
