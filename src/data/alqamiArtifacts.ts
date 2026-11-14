export interface AlqamiArtifact {
  id: string;
  slug: string;
  title: {
    ar: string;
    en: string;
  };
  subtitle?: {
    ar: string;
    en: string;
  };
  category: 'all' | 'artifact' | 'manuscripts' | 'islamic-art' | 'history' | 'heritage' | 'museum' | 'culture';
  categoryLabel: {
    ar: string;
    en: string;
  };
  period: {
    ar: string;
    en: string;
  };
  creator: {
    ar: string;
    en: string;
  };
  institution: {
    ar: string;
    en: string;
  };
  itemCode: string;
  image: string;
  model: {
    glb: string;
    scale?: number;
    /** A leaf or an open book: recognition renders it from the front only (its plain back looks like any paper). */
    flat?: boolean;
    initialOrbit?: { theta: number; phi: number };
  };
  description: {
    ar: string;
    en: string;
  };
  /** The published Moon record this object is catalogued as (mooon.site); Moon is then the source of its details. */
  moonRecordId?: string;
  details: {
    dimensions: string;
    material: { ar: string; en: string };
    condition: { ar: string; en: string };
    binding?: { ar: string; en: string };
    decoration?: { ar: string; en: string };
    seals?: { ar: string; en: string };
    delivery?: { ar: string; en: string };
    assembly?: { ar: string; en: string };
  };
}

export const ALQAMI_ARTIFACTS: AlqamiArtifact[] = [
  {
    id: 'ALQ-MSS-006',
    slug: 'nahj-al-balagha',
    title: {
      ar: 'مخطوط نهج البلاغة',
      en: 'Nahj al-Balagha Manuscript',
    },
    subtitle: {
      ar: 'الشيخ الرضي - الشريف الرضي (1022 هـ)',
      en: 'Al-Sharif al-Radi (1022 AH / 1613 CE)',
    },
    category: 'manuscripts',
    categoryLabel: {
      ar: 'المخطوطات والنوادر',
      en: 'Manuscripts',
    },
    period: {
      ar: '1022 هـ / 1613 م (العصر الصفوي)',
      en: '1022 AH / 1613 CE',
    },
    creator: {
      ar: 'الشريف الرضي (ت 406 هـ) • الناسخ: شمس الدين علي الشيرازي',
      en: 'Al-Sharif al-Radi • Scribe: Shams al-Din Ali al-Shirazi',
    },
    institution: {
      ar: 'مكتبة العتبة الرضوية المقدسة (1861) • مستودع علقمي الرقمي',
      en: 'Central Library of Astan Quds Razavi • Alqami Repository',
    },
    itemCode: '1022 هـ / هـ',
    image: '/images/model-nahj_al_balagha.png',
    model: {
      glb: '/models/nahj_al_balagha.glb',
      scale: 1.0,
      initialOrbit: { theta: 25, phi: 70 },
    },
    description: {
      ar: 'نسخة خطية من مخطوط نهج البلاغة، تُنسب إلى الشريف الرضي الذي جمعها وشرحها، تتميز هذه النسخة بخط جميل وواضح، وتحتوي على زخارف وهامش مذهب، وهي من أقدم النسخ المحفوظة التي تحمل هذا النص القيّم.',
      en: 'Illuminated manuscript of Nahj al-Balagha compiled by Al-Sharif al-Radi, transcribed in 1022 AH with ornate gold borders, intricate arabesque frontispiece, and red ink chapter markings.',
    },
    details: {
      dimensions: '28.5 × 18.2 سم (477 ورقة)',
      material: {
        ar: 'ورق مجدول ومذهب، حبر أسود، مداد أحمر، خط النسخ الأصيل',
        en: 'Gold-ruled paper, carbon ink, cinnabar rubrication, Naskh script',
      },
      condition: {
        ar: 'نادرة ومحفوظة بعناية فائقة مع تجليد إسلامي أصيل ومحكم',
        en: 'Extremely rare, well-preserved in historic Islamic binding',
      },
      binding: {
        ar: 'تجليد جلدي إسلامي أصيل مزخرف بنقوش هندسية مذهبة ومحكمة',
        en: 'Authentic Islamic leather binding with gilded geometric tooling',
      },
      decoration: {
        ar: 'النسخة مجدولة بالذهب، وأولها لوحة فنية مذهبة بديعة وعناوين بالمداد الأحمر',
        en: 'Gold-illuminated borders, gilded frontispiece, and rubricated chapter headers',
      },
      seals: {
        ar: 'تحتوي على قيود تملكية وأختام مكتبة العتبة الرضوية المقدسة برقم 1861',
        en: 'Bears historic ownership seals and endowment inscription no. 1861',
      },
      delivery: {
        ar: 'شحن آمن في حافظة حرارية مضادة للصدمات مع شهادة توثيق رقمية NFT.',
        en: 'Shipped in climate-controlled archival case with digital museum NFT certificate.',
      },
      assembly: {
        ar: 'لا تتطلب تجميع؛ جاهزة للعرض المكتبي أو التثبيت في منصة العرض المتحفي الزجاجية.',
        en: 'No assembly required; ready for tabletop display or archival museum vitrine.',
      },
    },
  },
  {
    id: 'ALQ-HLM-004',
    slug: 'old-islamic-helmet',
    title: {
      ar: 'خوذة إسلامية حربية مذهبة',
      en: 'Old Islamic Gilded Helmet',
    },
    subtitle: {
      ar: 'خوذة خيالة عثمانية مصفحة مع أنفية ودرع زرد (القرن 15 م)',
      en: 'Ottoman cavalry helmet with mail aventail, 15th century.',
    },
    category: 'artifact',
    categoryLabel: {
      ar: 'الأسلحة والقطع الحربية',
      en: 'Artifact',
    },
    period: {
      ar: 'القرن الخامس عشر الميلادي',
      en: '15th century',
    },
    creator: {
      ar: 'حدادو البلاط السلطاني العثماني',
      en: 'Imperial Ottoman Armory',
    },
    institution: {
      ar: 'المتحف العسكري • مستودع علقمي الرقمي',
      en: 'Military Museum Collection • Alqami',
    },
    itemCode: 'HLM-OTT-15',
    image: '/images/model-Old_Islamic_Helmet.png',
    model: {
      glb: '/models/Old_Islamic_Helmet.glb',
      scale: 1.1,
      initialOrbit: { theta: 30, phi: 80 },
    },
    description: {
      ar: 'خوذة حربية مخروطية الشكل مصنوعة من الفولاذ الصلب المنقوش بآيات النصر والفتح ومكفتة بخيوط الذهب، مع درع زردي متدلي لحماية العنق والرقبة وقضيب حماية الأنف المتحرك.',
      en: 'Conical Ottoman turban helmet of forged steel, inscribed with calligraphic cartouches in gold damascening, complete with nasal bar and interlocking steel mail aventail.',
    },
    details: {
      dimensions: 'الارتفاع: 34 سم • القطر: 22 سم • الوزن: 1.8 كجم',
      material: {
        ar: 'فولاذ كربوني مقسى، تذهيب مكفت عيار 24، حلقات حديد مشبك',
        en: 'Tempered carbon steel, 24k gold inlay, riveted iron mail rings',
      },
      condition: {
        ar: 'تحفة متحفية بحالة استثنائية مع لمعان النحاس والذهب الأصلي',
        en: 'Museum grade with intact mail aventail and original gilt sheen',
      },
      delivery: {
        ar: 'شحن دولي مصفح مع قاعدة عرض معدنية مكسوة بالمخمل الأسود.',
        en: 'Armored dispatch with velvet-lined steel pedestal.',
      },
      assembly: {
        ar: 'تأتي مثبتة على عمود العرض المخملي مع إمكانية الفك السريع.',
        en: 'Pre-assembled on museum display pole.',
      },
    },
  },
  {
    id: 'ALQ-SWD-002',
    slug: 'zulfiqar-sword',
    title: {
      ar: 'سيف ذو الفقار التاريخي',
      en: 'Zulfiqar Sword Artifact',
    },
    subtitle: {
      ar: 'سيف عثماني مرصع بالذهب (القرن 16-17 م)',
      en: 'Ottoman ceremonial sword, 16th–17th century.',
    },
    category: 'artifact',
    categoryLabel: {
      ar: 'الأسلحة والقطع الحربية',
      en: 'Artifact',
    },
    period: {
      ar: 'القرن السادس عشر - السابع عشر الميلادي',
      en: '16th–17th century',
    },
    creator: {
      ar: 'صناع السلاح الإمبراطوري في إسطنبول',
      en: 'Imperial Armoury Craftsmen',
    },
    institution: {
      ar: 'مجموعة الأسلحة الإسلامية • علقمي',
      en: 'Alqami Islamic Arms & Armour Collection',
    },
    itemCode: 'SWD-OTT-16',
    image: '/images/model-Zulfiqar_Sword.png',
    model: {
      glb: '/models/Zulfiqar_Sword.glb',
      scale: 1.2,
      initialOrbit: { theta: 45, phi: 65 },
    },
    description: {
      ar: 'سيف تاريخي احتفالي مستوحى من طراز ذي الفقار الشهير، مصوغ من الفولاذ الدمشقي الجوهري، مع مقبض مطعم بالعاج ونصل منقوش بآيات قرآنية مطلية بالذهب الخالص.',
      en: 'Historic ceremonial curved scimitar forged from folded Damascus crucible steel, decorated with Quranic calligraphic cartouches inlaid with 24k gold, and ivory hilt.',
    },
    details: {
      dimensions: 'الطول الكلي: 96 سم • وزن النصل: 980 غرام',
      material: {
        ar: 'فولاذ دمشقي ووتز، ذهب عيار 24 مطروق، عاج طبيعي',
        en: 'Pattern-welded Wootz steel, 24k gold koftgari inlay, ivory',
      },
      condition: {
        ar: 'حد السيف ناصع، خالي من الأكسدة، الغمد الخشبي مكسو بالجلد المخملي',
        en: 'Mint preserved blade edge, wood scabbard bound in crimson velvet',
      },
      delivery: {
        ar: 'شحن مؤمّن برقم تتبع خاص وصندوق خشبي مبطن بالساتان.',
        en: 'Insured courier dispatch in satin-lined hardwood chest.',
      },
      assembly: {
        ar: 'مرفق بحامل حائطي مغناطيسي معتمد للعرض الأفقي أو المائل.',
        en: 'Supplied with magnetic spatial wall mounting brackets.',
      },
    },
  },
  {
    id: 'ALQ-MAP-001',
    slug: 'babylonian-map-of-the-world',
    title: {
      ar: 'خريطة بابل للعالم (إيماجو موندي)',
      en: 'Babylonian Map of the World',
    },
    subtitle: {
      ar: 'أقدم خريطة جغرافية وفلكية في تاريخ البشرية (القرن 6 ق.م)',
      en: 'Earliest known world map tablet, 6th century BCE.',
    },
    category: 'history',
    categoryLabel: {
      ar: 'تراث بلاد الرافدين',
      en: 'History',
    },
    period: {
      ar: 'القرن السادس قبل الميلاد (بابل)',
      en: '6th century BCE',
    },
    creator: {
      ar: 'كاهن بابلي فلكي مجهول',
      en: 'Babylonian Astronomer-Priest',
    },
    institution: {
      ar: 'المتحف البريطاني (BM 92687) • مستودع علقمي',
      en: 'British Museum • Alqami Spatial Vault',
    },
    itemCode: 'MAP-BAB-001',
    image: '/images/model-babylonian_map_of_the_world_tablet_-_imago_mundi.png',
    model: {
      glb: '/models/babylonian_map_of_the_world_tablet_-_imago_mundi.glb',
      scale: 1.3,
    },
    description: {
      ar: 'لوح طيني تاريخي فريد يمثل خريطة بابل للعالم القديم، حيث تظهر بابل كمستطيل في المركز يمر به نهر الفرات، وتحيط بها الدائرة المائية المحيطية المسماة "نهر المرارة" وجزر أسطورية مثلثة.',
      en: 'The Imago Mundi clay tablet from ancient Mesopotamia. Depicts Babylon as the center of the world bisected by the Euphrates and encircled by the Bitter Ocean.',
    },
    details: {
      dimensions: '12.2 × 8.2 × 2.4 سم',
      material: {
        ar: 'طين بابلي مفخور طبيعي، خط مسماري محفور بدقة',
        en: 'Baked alluvial clay, incised cuneiform inscription',
      },
      condition: {
        ar: 'سليمة جزئياً مع ثبات كامل للهيكل الطيني التاريخي',
        en: 'Partially intact with stable clay substrate',
      },
      delivery: {
        ar: 'شحن في كبسولة مبطنة بطبقات الرغوة العازلة مع رصد الرطوبة.',
        en: 'Dispatched in humidity-monitored archival vault.',
      },
      assembly: {
        ar: 'حامل تثبيت شفاف يعرض الوجهين الأمامي والخلفي للوح.',
        en: 'Double-sided transparent display bracket.',
      },
    },
  },
  {
    id: 'ALQ-TAB-005',
    slug: 'old-babylonian-cuneiform-tablet',
    title: {
      ar: 'لوح مسماري بابلي قديم (S264)',
      en: 'Old Babylonian Cuneiform Tablet',
    },
    subtitle: {
      ar: 'لوح عقود ومعاملات اقتصادية من طين الرافدين (1900 ق.م)',
      en: 'Administrative Cuneiform Tablet, c. 1900 BCE',
    },
    category: 'history',
    categoryLabel: {
      ar: 'تراث بلاد الرافدين',
      en: 'History',
    },
    period: {
      ar: '1900–1600 قبل الميلاد (العصر البابلي القديم)',
      en: 'c. 1900–1600 BCE',
    },
    creator: {
      ar: 'كاتب سومري بابلي رسمي',
      en: 'Royal Scribe of Larsa',
    },
    institution: {
      ar: 'مجموعة المسماريات البابلية • علقمي',
      en: 'Mesopotamian Collection • Alqami',
    },
    itemCode: 'TAB-BAB-S264',
    image: '/images/model-old-babylonian_cuneiform_tablet_s264.png',
    model: {
      glb: '/models/old-babylonian_cuneiform_tablet_s264.glb',
      scale: 1.2,
    },
    description: {
      ar: 'لوح طيني مفخور بحجم قبضة اليد يوثق حسابات القمح والزيوت مع أختام أسطوانية ضاغطة على الجوانب، مكتوب بالخط المسماري البابلي القديم الواضح.',
      en: 'Hand-sized baked clay administrative tablet recording grain and oil disbursements, impressed with royal cylinder seal rolling.',
    },
    details: {
      dimensions: '8.5 × 5.2 × 2.0 سم',
      material: {
        ar: 'طين نيلي مفخور، حفر بقلم القصب المسماري',
        en: 'Baked clay, reed stylus cuneiform script',
      },
      condition: {
        ar: 'كامل الأحرف والرموز بحالة ممتازة دون كسور',
        en: 'Intact inscriptions with pristine seal rollings',
      },
      delivery: {
        ar: 'كبسولة أرشيفية مفرغة من الأكسجين لحفظ الطين القديم.',
        en: 'Nitrogen-flushed archival display capsule.',
      },
      assembly: {
        ar: 'حامل مكتبي مائل للعرض ثلاثي الأبعاد.',
        en: 'Angled desktop presentation easel.',
      },
    },
  },
  {
    id: 'ALQ-BWL-006',
    slug: 'saqakhane-sacred-bowl',
    title: {
      ar: 'طاسة سقاخانة برونزية أثرية',
      en: 'Saqakhane Sacred Bronze Bowl',
    },
    subtitle: {
      ar: 'وعاء ماء تراثي منقوش بآيات الشفاء والأدعية (القرن 18 م)',
      en: 'Engraved Bronze Water Vessel, 18th Century',
    },
    category: 'artifact',
    categoryLabel: {
      ar: 'المعادن الإسلامية',
      en: 'Artifact',
    },
    period: {
      ar: 'القرن الثامن عشر الميلادي',
      en: '18th Century',
    },
    creator: {
      ar: 'حرفيو النحاس والبرونز في أصفهان',
      en: 'Isfahan Bronze Masters',
    },
    institution: {
      ar: 'مجموعة الأواني الإسلامية • علقمي',
      en: 'Islamic Metalwork Collection • Alqami',
    },
    itemCode: 'BWL-SAQ-18',
    image: '/images/model-saqakhane_bowl.png',
    model: {
      glb: '/models/saqakhane_bowl.glb',
      scale: 1.0,
    },
    description: {
      ar: 'وعاء برونزي مقدس من أروقة السقاخانة، محفور من الداخل والخارج بآيات الشفاء وسور قرآنية بخط الثلث المتقن، مع مركز يحمل قبة شمسية بارزة.',
      en: 'Historic bronze drinking bowl used at public water fountains (Saqakhane), engraved inside and out with Quranic healing verses and central boss.',
    },
    details: {
      dimensions: 'القطر: 18.5 سم • العمق: 6.2 سم',
      material: {
        ar: 'برونز مسبوك ومطروق يدوياً، حفر إزميل دقيق',
        en: 'Hand-chiseled cast bronze with natural patina',
      },
      condition: {
        ar: 'برونز أصيل مع طبقة زنجار خضراء تاريخية طبيعية',
        en: 'Pristine historic bronze patina and crisp inscriptions',
      },
      delivery: {
        ar: 'حقيبة مبطنة بالحرير للمحافظة على معدن البرونز.',
        en: 'Silk-lined presentation box.',
      },
      assembly: {
        ar: 'حلقة تثبيت دائرية ثلاثية الأبعاد.',
        en: 'Circular museum ring mount.',
      },
    },
  },
  {
    id: 'ALQ-MHR-007',
    slug: 'prayer-niche-mihrab',
    title: {
      ar: 'محراب الصلاة الإسلامي المقرنص',
      en: 'Prayer Niche Mihrab',
    },
    subtitle: {
      ar: 'محراب مزخرف بالفسيفساء الخزفية والخط الثلث (القرن 14 م)',
      en: 'Glazed Ceramic Architectural Mihrab, 14th Century',
    },
    category: 'islamic-art',
    categoryLabel: {
      ar: 'العمارة والفنون الإسلامية',
      en: 'Islamic Art',
    },
    period: {
      ar: 'القرن الرابع عشر الميلادي (العصر الإيلخاني)',
      en: '14th Century',
    },
    creator: {
      ar: 'أساتذة الخزف في كاشان',
      en: 'Kashan Master Ceramists',
    },
    institution: {
      ar: 'متحف الفن الإسلامي • مستودع علقمي',
      en: 'Museum of Islamic Art Collection',
    },
    itemCode: 'MHR-KAS-14',
    image: '/images/model-prayer_niche_mihrab.png',
    model: {
      glb: '/models/prayer_niche_mihrab.glb',
      scale: 0.85,
    },
    description: {
      ar: 'تحفة معمارية إسلامية من بلاط الفسيفساء الخزفي المزجج بلوني الفيروزي واللازوردي مع آية الكرسي بخط الثلث المورق حول إطار القوس المعقود المقرنص.',
      en: 'Architectural prayer niche adorned with turquoise and cobalt glazed mosaic tiles, framed with Quranic Ayatul Kursi in floriated Thuluth calligraphy.',
    },
    details: {
      dimensions: 'الارتفاع: 110 سم • العرض: 65 سم',
      material: {
        ar: 'خزف مزجج بريق معدني، أصباغ كوبالت وفيروز، جبس تراثي',
        en: 'Luster-glazed ceramic, cobalt and turquoise oxides',
      },
      condition: {
        ar: 'البريق المعدني والزخارف النباتية الهندسية بحالة ممتازة',
        en: 'Luster glaze and arabesque flora in superb preservation',
      },
      delivery: {
        ar: 'نقل مع حماية مضاعفة في صندوق خشبي معزول ومؤمّن.',
        en: 'Crated in shock-absorbing timber frame.',
      },
      assembly: {
        ar: 'قابل للتعليق على الحائط أو التثبيت العمودي في الفضاء الحقيقي.',
        en: 'Can be wall-mounted or anchored spatially in room AR.',
      },
    },
  },
  {
    id: 'ALQ-STL-008',
    slug: 'stela-of-hammurabi',
    title: {
      ar: 'مسلة شريعة حمورابي البابلية',
      en: 'Stela of Hammurabi Code',
    },
    subtitle: {
      ar: 'أقدم شريعة قانونية متكاملة مكتوبة في التاريخ (1750 ق.م)',
      en: 'Old Babylonian Law Code Replica, c. 1750 BCE',
    },
    category: 'history',
    categoryLabel: {
      ar: 'تراث بلاد الرافدين',
      en: 'History',
    },
    period: {
      ar: '1792–1750 قبل الميلاد (بابل)',
      en: 'c. 1750 BCE',
    },
    creator: {
      ar: 'نحاتو القصر الملكي البابلي في عهد الملك حمورابي',
      en: 'Royal Sculptors of King Hammurabi',
    },
    institution: {
      ar: 'مستودع علقمي للمنحوتات الأثرية',
      en: 'Alqami Antiquities Vault',
    },
    itemCode: 'STL-HAM-1750',
    image: '/images/model-stela_of_hammurabi_replica.png',
    model: {
      glb: '/models/stela_of_hammurabi_replica.glb',
      scale: 0.9,
    },
    description: {
      ar: 'منحوتة تاريخية شامخة من حجر الديوريت الأسود، يظهر في أعلاها الملك حمورابي وهو يتلقى شريعة العدل من إله الشمس شمش، وتحتها 282 مادة قانونية بليغة.',
      en: 'Monumental black diorite stela depicting King Hammurabi receiving laws from Shamash the sun god, inscribed with 282 legal edicts in cuneiform.',
    },
    details: {
      dimensions: 'الارتفاع: 75 سم • القاعدة: 25 × 20 سم',
      material: {
        ar: 'ديوريت أسود مصقول، نقش مسماري أكدي غائر',
        en: 'Polished black basalt/diorite, incised Akkadian cuneiform',
      },
      condition: {
        ar: 'نسخة متحفية ملموسة بنقوش واضحة مطابقة للأصلية',
        en: 'Museum-grade replica with crisp relief sculpture',
      },
      delivery: {
        ar: 'شحن مصفح على منصة خشبية محمية.',
        en: 'Heavy-duty palletized courier transport.',
      },
      assembly: {
        ar: 'قاعدة تثبيت حجرية مانعة للانزلاق.',
        en: 'Weighted stone anti-slip plinth.',
      },
    },
  },
  {
    id: 'ALQ-BWL-009',
    slug: 'ancient-ceramic-bowl',
    title: {
      ar: 'وعاء خزفي إسلامي أثري',
      en: 'Ancient Ceramic Slipware Bowl',
    },
    subtitle: {
      ar: 'خزف نيسابوري مزجج بحروف كوفية مذهبة (القرن 10 م)',
      en: 'Nishapur Calligraphic Ceramic Bowl, 10th Century',
    },
    category: 'islamic-art',
    categoryLabel: {
      ar: 'الخزف والفنون الإسلامية',
      en: 'Islamic Art',
    },
    period: {
      ar: 'القرن العاشر الميلادي (العصر الساماني)',
      en: '10th Century',
    },
    creator: {
      ar: 'خزافو نيسابور وسمرقند',
      en: 'Nishapur Slipware Potters',
    },
    institution: {
      ar: 'المتحف الوطني للفنون الخزفية • علقمي',
      en: 'National Ceramic Arts Museum • Alqami',
    },
    itemCode: 'BWL-NIS-10',
    image: '/images/model-bowl.png',
    model: {
      glb: '/models/bowl.glb',
      scale: 1.1,
    },
    description: {
      ar: 'وعاء خزفي ناصع البياض مزجج بطلاء رائق، محلى بحافة خط كوفي أندلسي يحمل حكم وأمثال في الكرم والأدب باللون البني المحروق.',
      en: 'Elegantly proportioned white earthenware bowl painted in dark slip with floriated Kufic aphorism on generosity and good manners.',
    },
    details: {
      dimensions: 'القطر: 21.4 سم • الارتفاع: 7.0 سم',
      material: {
        ar: 'طين خزفي أبيض، طلاء زجاجي رصاصي شفاف',
        en: 'White earthenware, underglaze slip, clear lead glaze',
      },
      condition: {
        ar: 'سليم وخالٍ من الشروخ مع رنين نقي للقطعة',
        en: 'Intact with fine micro-crazing and resonant ring',
      },
      delivery: {
        ar: 'كبسولة رغوية محكمة ضد الصدمات.',
        en: 'Custom form-fitted high density foam casing.',
      },
      assembly: {
        ar: 'حامل ثلاثي الأرجل لعرض الوجه الداخلي.',
        en: 'Three-point acrylic bowl stand.',
      },
    },
  },
  {
    id: 'ALQ-MS-003',
    slug: 'al-qabasat-mir-damad',
    title: {
      ar: 'مخطوط القبسات — الميرداماد',
      en: 'Al-Qabasat Manuscript — Mir Damad',
    },
    subtitle: {
      ar: 'تراث الحكمة والفلسفة الإسلامية المتعالية (1650 م)',
      en: 'Safavid Philosophical Codex, 1650 CE',
    },
    category: 'manuscripts',
    categoryLabel: {
      ar: 'المخطوطات والنوادر',
      en: 'Manuscripts',
    },
    period: {
      ar: '1650 م [1061 هـ]',
      en: '1650 CE [1061 AH]',
    },
    creator: {
      ar: 'الميرداماد محمد باقر بن محمد الحسيني الإسترآبادي (ت 1041 هـ)',
      en: 'Mir Damad, Muhammad Baqir ibn Muhammad al-Husayni al-Astarabadi (d. 1041 AH)',
    },
    institution: {
      ar: 'مكتبة مجلس الشورى، طهران (4662) • مصورة في مكتبة العتبة العباسية المقدسة',
      en: 'Majlis Library, Tehran (4662) • digital copy at the Library of al-Abbas Holy Shrine',
    },
    itemCode: 'MSS-QAB-1650',
    image: '/images/model-model.png',
    model: {
      glb: '/models/model.glb',
      scale: 1.0,
    },
    description: {
      ar: 'كتاب في الفلسفة الإسلامية للميرداماد في حدوث العالم والدهر والزمان. أوله: «الحمد لله الواحد الأحد الصمد المصمود مهيمن كل وجود وجاعل كل موجود...». ذكره الطهراني في الذريعة إلى تصانيف الشيعة (17: 32، رقم 183).',
      en: 'A work of Islamic philosophy by Mir Damad on the origination of the world, perpetuity (dahr) and time. Listed in al-Dhari\'a ila Tasanif al-Shi\'a (vol. 17, p. 32, no. 183).',
    },
    details: {
      dimensions: '344 ورقة (18 سطرًا)',
      material: {
        ar: 'ورق، حبر أسود، خط النستعليق',
        en: 'Paper, black ink, Nasta\'liq script',
      },
      condition: {
        ar: 'النسخة مجدولة ومرتبة بنظام التعقيبات، والورقة الأولى عليها زخرفة.',
        en: 'Ruled, with catchwords; the first leaf is illuminated.',
      },
      binding: { ar: 'جلد أحمر', en: 'Red leather' },
      seals: { ar: 'في أولها مجموعة أختام', en: 'A group of seals at the beginning' },
      delivery: {
        ar: 'تغليف حراري مفرغ من الرطوبة مع بطاقة الأرشفة.',
        en: 'Hermetic humidity-monitored archival delivery.',
      },
      assembly: {
        ar: 'جاهز للمعاينة ثلاثية الأبعاد في الغرفة.',
        en: 'Ready for spatial room exploration.',
      },
    },
  },
  {
    id: 'ALQ-QUR-011',
    slug: 'quran-1009ah-haydar-ali',
    title: {
      ar: 'القرآن الكريم — نسخة حيدر علي (1009 هـ)',
      en: 'The Holy Qur\'an — copied by Haydar Ali (1009 AH)',
    },
    subtitle: {
      ar: 'نُسخت في حائر الإمام الحسين عليه السلام',
      en: 'Copied at the shrine of Imam al-Husayn (peace be upon him)',
    },
    category: 'manuscripts',
    categoryLabel: {
      ar: 'المخطوطات والنوادر',
      en: 'Manuscripts',
    },
    period: {
      ar: '1009 هـ / 1600 م',
      en: '1009 AH / 1600 CE',
    },
    creator: {
      ar: 'الناسخ: حيدر علي',
      en: 'Scribe: Haydar Ali',
    },
    institution: {
      ar: 'مكتبة مجلس الشورى، طهران (4175) • مصورة في مكتبة العتبة العباسية المقدسة',
      en: 'Majlis Library, Tehran (4175) • digital copy at the Library of al-Abbas Holy Shrine',
    },
    itemCode: 'MSS-QUR-1009',
    image: '/images/quran-1009ah-haydar-ali.jpg',
    model: {
      glb: '/models/quran-1009ah-haydar-ali.glb',
      scale: 1.0,
      flat: true,
    },
    description: {
      ar: 'مصحف بخط النسخ في 294 ورقة، مجدول بعدة ألوان، والصفحتان الأولى والثانية مزخرفتان. في صدر كل سورة لوحة ذهبية، وفي الهوامش دوائر مزخرفة لبيان الأحزاب وبداية الأجزاء.',
      en: 'A Qur\'an in Naskh script on 294 leaves, ruled in several colours, with the first two pages illuminated. Each sura opens with a gold panel; decorated roundels in the margins mark the hizb and juz\' divisions.',
    },
    details: {
      dimensions: '294 ورقة (15 سطرًا)',
      material: {
        ar: 'ورق، حبر أسود، خط النسخ',
        en: 'Paper, black ink, Naskh script',
      },
      condition: {
        ar: 'لم تُذكر حالة النسخة في الفهرسة.',
        en: 'Condition not stated in the catalogue record.',
      },
      binding: { ar: 'غلاف لاكي', en: 'Lacquer binding' },
      decoration: {
        ar: 'الصفحتان الأوليان مذهبتان مزخرفتان، ولوحة ذهبية في صدر كل سورة',
        en: 'Illuminated opening double page; a gold panel at the head of each sura',
      },
    },
  },
  {
    id: 'ALQ-QUR-012',
    slug: 'kufic-quran-leaves',
    title: {
      ar: 'القرآن الكريم — أوراق بالخط الكوفي على الرق',
      en: 'The Holy Qur\'an — Kufic leaves on parchment',
    },
    subtitle: {
      ar: 'ينسب نسخها للإمام علي بن الحسين زين العابدين عليه السلام',
      en: 'Attributed to Imam Ali ibn al-Husayn Zayn al-Abidin (peace be upon him)',
    },
    category: 'manuscripts',
    categoryLabel: {
      ar: 'المخطوطات والنوادر',
      en: 'Manuscripts',
    },
    period: {
      ar: '[200–299 هـ] / [800–899 م]',
      en: '[200–299 AH] / [800–899 CE]',
    },
    creator: {
      ar: 'الناسخ (نسبةً): الإمام علي بن الحسين زين العابدين عليه السلام (38–95 هـ)',
      en: 'Scribe (attributed): Imam Ali ibn al-Husayn Zayn al-Abidin (38–95 AH)',
    },
    institution: {
      ar: 'مكتبة العتبة العباسية المقدسة، كربلاء',
      en: 'Library of al-Abbas Holy Shrine, Karbala',
    },
    itemCode: 'MSS-QUR-KUF',
    image: '/images/kufic-quran-leaf.jpg',
    model: {
      glb: '/models/kufic-quran-leaf.glb',
      scale: 1.0,
      flat: true,
    },
    description: {
      ar: 'أوراق متفرقة من ثلاثة مصاحف جُمعت في مجلد واحد، بالخط الكوفي القديم على الرق بحبر أسود مائل إلى القهوائي. أُدخلت النقاط الحمراء للإعراب لاحقًا، وفُصل بين الآيات بوردة أو ورقة منقوشة بماء الذهب. الورقة المعروضة آخر المجلد، وتنتهي بقوله تعالى: «مَا شَاءَ اللَّهُ لَا قُوَّةَ إِلَّا بِاللَّهِ إِن تَرَنِ» (الكهف 39).',
      en: 'Scattered leaves from three Qur\'ans bound in one volume, in early Kufic script on parchment in black ink turning brown. The red vowel dots were added later; verses are separated by gold rosettes or leaves. The leaf shown is the last of the volume and ends at Surat al-Kahf 18:39.',
    },
    details: {
      dimensions: '26.5 × 37 سم • 40 ورقة (7 أسطر)',
      material: {
        ar: 'رق غزال أصفر فاتح، حبر أسود وأحمر وماء الذهب، خط كوفي قديم',
        en: 'Light yellow gazelle parchment; black and red ink and gold; early Kufic script',
      },
      condition: {
        ar: 'أوراق من ثلاثة مصاحف؛ في الورقة المعروضة ثقوب وتآكل في الحواف.',
        en: 'Leaves from three manuscripts; the leaf shown has holes and worn edges.',
      },
      binding: {
        ar: 'جلد وكارتون أحمر مؤطر بالذهب، ذو زخرفة غائرة مذهبة',
        en: 'Red leather and board, gold-framed, with blind-tooled gilt decoration',
      },
      decoration: {
        ar: 'فواصل آيات بماء الذهب، ودوائر مزخرفة في الهوامش للأحزاب ومواضع السجود',
        en: 'Gold verse separators; decorated roundels in the margins for hizb divisions and prostrations (sajda)',
      },
      seals: {
        ar: 'تملك السلطان فتح علي شاه القاجاري (ت 1250 هـ)؛ تملك الفياض الأقدس؛ بلاغ بتاريخ 20 رجب 1200 هـ',
        en: 'Ownership notes of Fath Ali Shah Qajar (d. 1250 AH) and al-Fayyad al-Aqdas; a collation note dated 20 Rajab 1200 AH',
      },
    },
  },
  {
    id: 'ALQ-MSH-010',
    slug: 'alqami-3d-heritage-sculpture',
    title: {
      ar: 'مجسم تحفة علقمي التراثي',
      en: 'Alqami 3D Heritage Sculpture',
    },
    subtitle: {
      ar: 'منحوتة هندسية ثلاثية الأبعاد تمثل الهوية الحضارية والمتحفية',
      en: 'Spatial 3D Cultural Geometry Monolith',
    },
    category: 'culture',
    categoryLabel: {
      ar: 'الهوية الثقافية',
      en: 'Culture',
    },
    period: {
      ar: 'العصر الحديث والتراث المتجدد',
      en: 'Contemporary Spatial Heritage',
    },
    creator: {
      ar: 'استوديو علقمي للنمذجة الرقمية التراثية',
      en: 'Alqami Spatial Heritage Labs',
    },
    institution: {
      ar: 'مستودع علقمي الرقمي السحابي',
      en: 'Alqami Cloud Repository',
    },
    itemCode: 'MSH-ALQ-3D',
    image: '/images/model-meshy-model.png',
    model: {
      glb: '/models/meshy-model.glb',
      scale: 1.0,
    },
    description: {
      ar: 'مجسم فراغي ثلاثي الأبعاد مصمم بأعلى دقة PBR ليجسد تناغم الفنون الإسلامية والزخارف الهندسية المعقدة في فضاء الواقع المعزز المكاني.',
      en: 'A high-fidelity spatial 3D artifact celebrating Islamic geometric harmony, designed with photorealistic PBR textures for visionOS augmented reality.',
    },
    details: {
      dimensions: '35 × 35 × 45 سم',
      material: {
        ar: 'راتنج بولي صلب، طلاء ميتاليك نحاسي وذهبي معتق',
        en: 'High-density composite resin, antique bronze-gold patina',
      },
      condition: {
        ar: 'تحفة جديدة مصنوعة بدقة ميكرونية فائقة',
        en: 'Pristine new condition with museum seal',
      },
      delivery: {
        ar: 'صندوق أسود فاخر مع قفل مغناطيسي وشهادة الأصالة.',
        en: 'Luxury presentation case with magnetic closure.',
      },
      assembly: {
        ar: 'قاعدة دائرية متوازنة مع إضاءة حافة خافتة.',
        en: 'Integrated weighted circular plinth.',
      },
    },
  },
];

