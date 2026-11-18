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
 * Generates spatial part-attached metadata nodes for any Al-Kafeel or Alqami artifact.
 * Each node anchors directly to a physical region of the artifact (blade, hilt, rim, calligraphy band,
 * finial, colophon, lock mechanism, etc.) and flows outward via an animated leader line.
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
        pos3d: [-0.35, 0.05, 0.05],
        badgeAr: 'المقبض والواقية',
        badgeEn: 'Hilt & Crossguard',
        titleAr: 'قبضة السيف والواقية المتصالبة',
        titleEn: ' ergonomic Hilt & Quillon Guard',
        detailAr: `مصنوعة بدقة لحماية اليد وموازنة النصل • ${dim}`,
        detailEn: `Precision-balanced hilt assembly • ${dim}`,
        metric: periodAr,
        color: '#fbbf24',
      },
      {
        id: 'inscription',
        dx: -0.05,
        dy: -0.14,
        dock: 'top-right',
        pos3d: [0.0, 0.08, 0.06],
        badgeAr: 'النقش والتذهيب',
        badgeEn: 'Gold Damascening',
        titleAr: 'كتابة مذهّبة بتقنية الترصيع (الكفتگاری)',
        titleEn: 'Gold-Inlaid Royal Calligraphic Cartouche',
        detailAr: a.description.ar.slice(0, 120),
        detailEn: a.description.en.slice(0, 120),
        metric: a.itemCode,
        color: '#34d399',
      },
      {
        id: 'blade',
        dx: 0.28,
        dy: 0.14,
        dock: 'bottom-right',
        pos3d: [0.3, -0.1, 0.04],
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
        pos3d: [-0.08, -0.22, 0.04],
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
  if (id.includes('-KSH-') || id.includes('-MTL-') || id.includes('-BWL-') || id.includes('-VAS-') || id.includes('-GLS-') || id.includes('-QRB-')) {
    return [
      {
        id: 'rim',
        dx: -0.12,
        dy: -0.26,
        dock: 'top-left',
        pos3d: [-0.12, 0.25, 0.12],
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
        dx: 0.08,
        dy: -0.04,
        dock: 'top-right',
        pos3d: [0.08, 0.04, 0.28],
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
        dx: 0.34,
        dy: -0.16,
        dock: 'bottom-right',
        pos3d: [0.36, 0.16, 0.08],
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
        dx: -0.04,
        dy: 0.28,
        dock: 'bottom-left',
        pos3d: [-0.04, -0.26, 0.15],
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
        dx: 0.0,
        dy: -0.34,
        dock: 'top-right',
        pos3d: [0.0, 0.35, 0.06],
        badgeAr: 'الأصابع المنقوشة',
        badgeEn: 'Inscribed Digits',
        titleAr: 'أصابع الكف العلوي المذهّبة',
        titleEn: 'Finely Engraved Upper Section',
        detailAr: `مشغولة من ${matAr} بنقوش إسلامية دقيقة`,
        detailEn: `Crafted in ${matEn} with devotional calligraphy`,
        metric: matAr,
        color: '#fbbf24',
      },
      {
        id: 'palm-center',
        dx: -0.04,
        dy: -0.02,
        dock: 'top-left',
        pos3d: [-0.04, 0.02, 0.09],
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
        id: 'socket',
        dx: 0.02,
        dy: 0.34,
        dock: 'bottom-right',
        pos3d: [0.02, -0.34, 0.06],
        badgeAr: 'قاعدة السارية',
        badgeEn: 'Standard Socket Base',
        titleAr: 'جلبة التثبيت على سارية اللواء',
        titleEn: 'Turned Brass Pole Mount & Collar',
        detailAr: `القياسات: ${dim}`,
        detailEn: `Measurements: ${dim}`,
        metric: a.itemCode,
        color: '#38bdf8',
      },
    ];
  }

  // 4. Manuscripts, Stamps, Ziyarat Tablets, Paintings (MSS, STP, ZYR, PNT, QUR, MS)
  if (id.includes('-MSS-') || id.includes('-STP-') || id.includes('-ZYR-') || id.includes('-PNT-') || id.includes('-QUR-') || id.includes('-MS-')) {
    return [
      {
        id: 'header',
        dx: 0.0,
        dy: -0.28,
        dock: 'top-right',
        pos3d: [0.0, 0.28, 0.04],
        badgeAr: 'الترويسة والزخرفة',
        badgeEn: 'Illuminated Headpiece',
        titleAr: 'السرلوح والزخارف المذهّبة العلوية',
        titleEn: 'Gilded Header & Ornamental Border',
        detailAr: `تراث مكتوب على ${matAr} • ${periodAr}`,
        detailEn: `Preserved on ${matEn} • ${periodEn}`,
        metric: periodAr,
        color: '#fbbf24',
      },
      {
        id: 'script',
        dx: -0.06,
        dy: 0.0,
        dock: 'top-left',
        pos3d: [-0.06, 0.0, 0.05],
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
        id: 'margins',
        dx: 0.26,
        dy: 0.18,
        dock: 'bottom-right',
        pos3d: [0.24, -0.18, 0.04],
        badgeAr: 'الحواشي والأختام',
        badgeEn: 'Margins & Seals',
        titleAr: 'الإطار الجانبي وعلامات التوثيق المتحفي',
        titleEn: 'Framing Rule, Marginalia & Archival Seal',
        detailAr: `القياسات: ${dim} • ${a.institution.ar}`,
        detailEn: `Dimensions: ${dim} • ${a.institution.en}`,
        metric: matAr,
        color: '#38bdf8',
      },
    ];
  }

  // 5. Default for Candlesticks, Lanterns, Clocks, Coins, Armor, Shrine Parts, Doors, Chests
  return [
    {
      id: 'crown',
      dx: -0.08,
      dy: -0.28,
      dock: 'top-left',
      pos3d: [-0.08, 0.28, 0.1],
      badgeAr: 'القسم العلوي والزخرفة',
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
      dx: 0.06,
      dy: -0.02,
      dock: 'top-right',
      pos3d: [0.06, 0.02, 0.16],
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
      pos3d: [0.22, -0.2, 0.12],
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
      pos3d: [-0.22, -0.22, 0.1],
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
