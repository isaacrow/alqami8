/**
 * Verified institutional profile of Al-Kafeel Museum of Treasures & Manuscripts
 * (متحف الكفيل للنفائس والمخطوطات — العتبة العباسية المقدسة، كربلاء المقدسة).
 *
 * Compiled from official Al-Kafeel Museum & Al-Abbas Holy Shrine publications
 * (https://museum.alkafeel.net/ , https://alkafeel.net/).
 */

export interface MuseumMilestone {
  yearAr: string;
  yearEn: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
}

export interface MuseumDivision {
  id: string;
  nameAr: string;
  nameEn: string;
  tagAr: string;
  tagEn: string;
  summaryAr: string;
  summaryEn: string;
  highlightsAr: string[];
  highlightsEn: string[];
}

export interface MuseumHallDirectoryItem {
  prefix: string;
  count: number;
  nameAr: string;
  nameEn: string;
  eraAr: string;
  eraEn: string;
  sampleId?: string;
}

export const ALKAFEEL_MUSEUM_INFO = {
  nameAr: 'متحف الكفيل للنفائس والمخطوطات',
  nameEn: 'Al-Kafeel Museum of Treasures & Manuscripts',
  parentAr: 'العتبة العباسية المقدسة · كربلاء المقدسة، العراق',
  parentEn: 'Al-Abbas Holy Shrine · Karbala, Iraq',
  officialUrl: 'https://museum.alkafeel.net/',
  catalogUrl: 'https://museum.alkafeel.net/nafessPage',
  foundedAr: '٥ جمادى الأولى ١٤٣١ هـ / ١ أيار ٢٠٠٩ م',
  foundedEn: '5 Jumada al-Ula 1431 AH / May 1, 2009 CE',
  departmentUpgradeAr: '٢٠١٤ م (قسم مستقل في العتبة العباسية المقدسة)',
  departmentUpgradeEn: '2014 CE (Independent Department of the Al-Abbas Holy Shrine)',
  taglineAr: 'أول متحف يُؤسَّس داخل العتبات المقدسة في العراق لصون النفائس والمخطوطات التراثية وفق المعايير المتحفية الدولية.',
  taglineEn: 'The first museum established within the Holy Shrines of Iraq, preserving sacred heritage, royal manuscripts, and historic craftsmanship to international conservation standards.',
  overviewAr:
    'يُعدّ متحف الكفيل للنفائس والمخطوطات في العتبة العباسية المقدسة بكربلاء صرحاً حضارياً وتراثياً رائداً؛ إذ افتُتحت قاعته الأولى تيمّناً بذكرى ولادة السيدة زينب الكبرى (عليها السلام) في الأول من أيار عام ٢٠٠٩، ثم تطوّر عام ٢٠١٤ ليصبح قسماً مستقلاً يضم مختبرات علمية متخصصة لصيانة وترميم المعادن والمنسوجات والأخشاب والمخطوطات، ومخازن أرشيفية مضبوطة الحرارة والرطوبة، إلى جانب مشروع مبنى المتحف العصري الجديد.',
  overviewEn:
    'Located within the Al-Abbas Holy Shrine in Karbala, the Al-Kafeel Museum of Treasures and Manuscripts is Iraq’s pioneering Holy Shrine museum. Its inaugural exhibition hall opened on May 1, 2009 (5 Jumada al-Ula 1431 AH), and in 2014 it became an independent department encompassing scientific conservation laboratories, climate-controlled archival repositories, digital documentation units, and a dedicated modern museum building project.',
  stats: [
    { valueAr: '٢٠٠٩', valueEn: '2009', labelAr: 'سنة التأسيس', labelEn: 'Established' },
    { valueAr: '١٨٣', valueEn: '183', labelAr: 'قطعة موثّقة 3D هنا', labelEn: '3D Digitized Relics' },
    { valueAr: '٢٨', valueEn: '28', labelAr: 'قاعة وتصنيفاً متحفياً', labelEn: 'Curated Halls' },
    { valueAr: '٥', valueEn: '5', labelAr: 'شُعب علمية ومختبرية', labelEn: 'Core Divisions' },
  ],
  milestones: [
    {
      yearAr: '١٤٣١ هـ / ٢٠٠٩ م',
      yearEn: '2009 CE',
      titleAr: 'افتتاح أول قاعة عرض متحفي في العتبات المقدسة',
      titleEn: 'Inauguration of the First Holy Shrine Museum Hall in Iraq',
      bodyAr:
        'افتُتح المتحف رسمياً في ٥ جمادى الأولى ١٤٣١ هـ (١ أيار ٢٠٠٩ م) ليكون أول متحف متخصص يُنشأ داخل العتبات المقدسة في العراق، عارضاً نفائس أُهديت للعتبة العباسية المقدسة عبر قرون متعاقبة.',
      bodyEn:
        'Officially inaugurated on May 1, 2009 (coinciding with the birth anniversary of Lady Zaynab, peace be upon her), establishing the first specialized museum inside the Holy Shrines of Iraq.',
    },
    {
      yearAr: '٢٠١١ – ٢٠١٣ م',
      yearEn: '2011–2013',
      titleAr: 'تأسيس المختبر العلمي للصيانة والترميم والمخزن الأرشيفي',
      titleEn: 'Scientific Conservation Laboratory & Climate Repositories',
      bodyAr:
        'استقطاب كوادر أكاديمية متخصصة في الآثار والكيمياء والترميم وتجهيز مختبر علمي لمعالجة السيوف الدمشقية والمنسوجات والسجاد اليدوي والأخشاب المطعّمة والمخطوطات النادرة.',
      bodyEn:
        'Established dedicated laboratories for preventive conservation and restoration of Damascus-steel weaponry, hand-knotted carpets, historic textiles, inlaid wood, and rare illuminated manuscripts.',
    },
    {
      yearAr: '٢٠١٤ م',
      yearEn: '2014 CE',
      titleAr: 'الارتقاء إلى «قسم متحف الكفيل للنفائس والمخطوطات»',
      titleEn: 'Elevation to an Independent Museum Department',
      bodyAr:
        'نظراً لاتساع المقتنيات وتطوّر العمل العلمي والبحثي، تحوّل المتحف إلى قسم مستقل في الهيكل التنظيمي للعتبة العباسية المقدسة وبدأ مشاركاته في المعارض والمؤتمرات الدولية للمتاحف (ICOM).',
      bodyEn:
        'Upgraded to a full independent department within the Al-Abbas Holy Shrine, expanding international academic collaborations, museum symposia, and digital cataloguing.',
    },
    {
      yearAr: 'المشروع العصري والرقمنة المكانية',
      yearEn: 'Modern Building & Spatial 3D Digitization',
      titleAr: 'مبنى المتحف الجديد والأرشفة ثلاثية الأبعاد (AR / XR)',
      titleEn: 'New Museum Building & Volumetric 3D / XR Archive',
      bodyAr:
        'تشييد مبنى متحفي عصري متكامل يضم قاعات عرض دولية ومختبرات متقدمة، بالتوازي مع التوثيق الرقمي ثلاثي الأبعاد والواقع المعزز لتمكين الباحثين والزوار من فحص النفائس بدقة عالية.',
      bodyEn:
        'Constructing a state-of-the-art museum complex alongside high-resolution 3D reconstruction, AR spatial scanning, and interactive digital accessibility for scholars and visitors worldwide.',
    },
  ] as MuseumMilestone[],
  divisions: [
    {
      id: 'exhibition',
      nameAr: 'شعبة القاعة المتحفية والعرض',
      nameEn: 'Exhibition Hall & Curatorial Display Division',
      tagAr: 'العرض المتحفي',
      tagEn: 'Curatorial',
      summaryAr:
        'تتولى تصميم سيناريو العرض المتحفي داخل خزائن زجاجية مؤمَّنة بإضاءة باردة خالية من الأشعة فوق البنفسجية، مع إرشاد الزائرين والوفود الأكاديمية باللغتين العربية والإنجليزية.',
      summaryEn:
        'Designs museum-grade curatorial showcases with UV-free conservation lighting, environmental sensors, and guided scholarly tours for pilgrims and international delegations.',
      highlightsAr: [
        'خزائن عرض معيارية مضبوطة الإضاءة والرطوبة',
        'بطاقات تعريفية تاريخية وفنية ثنائية اللغة',
        'استقبال الوفود الأكاديمية والمؤسسات التراثية',
      ],
      highlightsEn: [
        'Climate-buffered showcases with UV-filtered museum lighting',
        'Bilingual historical and technical curatorial labels',
        'Guided visits for researchers and international museum delegations',
      ],
    },
    {
      id: 'lab',
      nameAr: 'شعبة المختبر العلمي للصيانة والترميم',
      nameEn: 'Conservation & Restoration Laboratory Division',
      tagAr: 'المختبر العلمي',
      tagEn: 'Conservation Lab',
      summaryAr:
        'القلب العلمي للمتحف؛ تضم وحدات متخصصة لصيانة المعادن والأسلحة التاريخية، وترميم السجاد والمنسوجات، ومعالجة الأخشاب والزجاج والمخطوطات وفق قواعد الصيانة الوقائية الدولية.',
      summaryEn:
        'The scientific core of the museum, housing specialized units for metals and arms conservation, textile and carpet stabilization, wood/glass treatment, and non-invasive material analysis.',
      highlightsAr: [
        'فحص مجهري وطيفي لسبائك الجوهر الدمشقي والذهب والفضة',
        'تنظيف ميكانيكي وكيميائي دقيق للسجاد التراثي والمنسوجات',
        'توثيق فوتوغرافي وعلمي شامل قبل وبعد الترميم',
      ],
      highlightsEn: [
        'Microscopic and metallurgical analysis of Wootz steel, gold, and silver inlays',
        'Micro-mechanical and solvent stabilization for antique carpets and textiles',
        'Full before-and-after conservation condition reporting',
      ],
    },
    {
      id: 'storage',
      nameAr: 'شعبة المخزن الأرشيفي',
      nameEn: 'Archival Storage & Preventive Repository Division',
      tagAr: 'الحفظ الوقائي',
      tagEn: 'Archival Storage',
      summaryAr:
        'تدير المستودعات المركزية لآلاف النفائس غير المعروضة مؤقتاً داخل خزائن مبطّنة بمواد خالية من الأحماض مع مراقبة مستمرة لدرجات الحرارة والرطوبة النسبية والجرد السنوي الدقيق.',
      summaryEn:
        'Maintains climate- and humidity-regulated archival vaults with acid-free mounts, pest-prevention protocols, and systematic annual inventory verification for thousands of reserve relics.',
      highlightsAr: [
        'ضبط آلي للحرارة والرطوبة النسبية على مدار الساعة',
        'حفظ المقتنيات في أغلفة وخزائن خالية من الأحماض',
        'نظام ترميز وجرد رقمي دقيق لكل قطعة متحفية',
      ],
      highlightsEn: [
        '24/7 automated temperature and relative humidity regulation',
        'Acid-free archival shelving and custom conservation cradles',
        'Unique museum accession numbering and annual inventory audits',
      ],
    },
    {
      id: 'documentation',
      nameAr: 'شعبة التوثيق والأرشفة الرقمية',
      nameEn: 'Documentation & Digital Archiving Division',
      tagAr: 'الأرشفة الرقمية',
      tagEn: 'Digital Archive',
      summaryAr:
        'توثّق الأبعاد والمواد والنقوش والخطوط والتواريخ الهجرية والميلادية لكل نفيسة، وتبني قواعد البيانات الرقمية والكتالوجات العلمية والمجسمات ثلاثية الأبعاد.',
      summaryEn:
        'Records exact dimensions, inscriptions, metallurgy, provenance, and Hijri/Gregorian dates for every artifact, powering digital databases, scholarly catalogues, and 3D heritage models.',
      highlightsAr: [
        'قراءة وتوثيق النقوش والخطوط العربية والعثمانية والفارسية',
        'التصوير الفوتوغرافي المعياري والمسح ثلاثي الأبعاد',
        'إصدار الفهارس والموسوعات التراثية المحكّمة',
      ],
      highlightsEn: [
        'Epigraphic transcription of Arabic, Ottoman, and Persian inscriptions',
        'High-resolution archival photography and 3D volumetric capture',
        'Publication of peer-reviewed heritage catalogues and monographs',
      ],
    },
    {
      id: 'media',
      nameAr: 'شعبة الإعلام والعلاقات والمبنى الجديد',
      nameEn: 'Museum Media, Outreach & New Building Project',
      tagAr: 'التواصل الدولي',
      tagEn: 'Outreach',
      summaryAr:
        'تُعرّف بالتراث الكربلائي والإسلامي محلياً وعالمياً عبر المعارض المتنقلة والمؤتمرات الدولية والموقع الرسمي للمتحف، وتشرف على متطلبات العرض لمشروع مبنى المتحف الحديث.',
      summaryEn:
        'Promotes Karbala and Islamic material heritage globally through exhibitions, international conferences, digital platforms, and curatorial planning for the new modern museum complex.',
      highlightsAr: [
        'تنظيم مؤتمرات وورش دولية في علوم المتاحف والترميم',
        'منصة إلكترونية مفتوحة لعرض نفائس المتحف للباحثين',
        'التخطيط المتحفي لمبنى متحف الكفيل العصري الجديد',
      ],
      highlightsEn: [
        'International museology and conservation conferences and workshops',
        'Open digital portal showcasing Al-Kafeel treasures worldwide',
        'Architectural & curatorial planning for the new Al-Kafeel Museum building',
      ],
    },
  ] as MuseumDivision[],
  halls: [
    { prefix: 'KFL-SWD', count: 31, nameAr: 'الأسلحة البيضاء (السيوف)', nameEn: 'Bladed Weapons (Swords)', eraAr: 'عثماني · صفوي · قاجاري', eraEn: 'Ottoman · Safavid · Qajar', sampleId: 'KFL-SWD-2126' },
    { prefix: 'KFL-TXT', count: 18, nameAr: 'المنسوجات والسجاد التراثي', nameEn: 'Textiles & Sacred Carpets', eraAr: 'حياكة يدوية نادرة', eraEn: 'Rare Hand-Knotted Silk & Wool' },
    { prefix: 'KFL-GUN', count: 14, nameAr: 'الأسلحة النارية التاريخية', nameEn: 'Historical Firearms', eraAr: 'القرنان ١٨ – ١٩ م', eraEn: '18th–19th Century' },
    { prefix: 'KFL-MTL', count: 10, nameAr: 'الأواني المعدنية المطعّمة', nameEn: 'Inlaid Metalware & Vessels', eraAr: 'نحاس وفضة منقوشة', eraEn: 'Chased Brass & Silver' },
    { prefix: 'KFL-ARM', count: 10, nameAr: 'الأسلحة الدفاعية والدروع', nameEn: 'Defensive Armor & Shields', eraAr: 'فولاذ منقوش ومذهّب', eraEn: 'Gilded & Etched Steel' },
    { prefix: 'KFL-CON', count: 9, nameAr: 'المسكوكات والنقود', nameEn: 'Coins & Numismatics', eraAr: 'عباسي · عثماني · إسلامي', eraEn: 'Abbasid · Ottoman · Islamic' },
    { prefix: 'KFL-JWL', count: 9, nameAr: 'الحلي والمجوهرات', nameEn: 'Jewelry & Precious Ornaments', eraAr: 'أحجار كريمة ومعادن نفيسة', eraEn: 'Precious Gems & Filigree' },
    { prefix: 'KFL-CND', count: 7, nameAr: 'الشمعدانات التراثية', nameEn: 'Heritage Candlesticks', eraAr: 'إضاءة الحرم التراثية', eraEn: 'Sanctuary Illumination' },
    { prefix: 'KFL-CST', count: 7, nameAr: 'الصناديق التراثية', nameEn: 'Heritage Sanctuary Chests', eraAr: 'خشب مطعّم بالصدف والنحاس', eraEn: 'Inlaid Wood & Brass' },
    { prefix: 'KFL-KSH', count: 6, nameAr: 'الكشاكيل التراثية', nameEn: 'Heritage Engraved Kashkuls', eraAr: 'جوز بحري ومعادن منقوشة', eraEn: 'Coco-de-Mer & Chased Metal', sampleId: 'KFL-KSH-2165' },
    { prefix: 'KFL-MSC', count: 6, nameAr: 'المتفرقات التراثية', nameEn: 'Miscellaneous Museum Relics', eraAr: 'تحف نادرة متنوعة', eraEn: 'Diverse Heritage Relics' },
    { prefix: 'KFL-MSS', count: 5, nameAr: 'المخطوطات والنوادر', nameEn: 'Manuscripts & Rare Texts', eraAr: 'مصاحف ومخطوطات مذهّبة', eraEn: 'Illuminated Qurans & Codices' },
    { prefix: 'KFL-KUF', count: 5, nameAr: 'الكفوف العباسية', nameEn: 'Sacred Shrine Hands (Kuffuf)', eraAr: 'رموز العتبة العباسية المقدسة', eraEn: 'Al-Abbas Shrine Emblems' },
    { prefix: 'KFL-STP', count: 5, nameAr: 'الطوابع التاريخية', nameEn: 'Historical Postage Stamps', eraAr: 'تاريخ العراق البريدي', eraEn: 'Iraqi Postal History' },
    { prefix: 'KFL-ZYR', count: 5, nameAr: 'ألواح الزيارات', nameEn: 'Sacred Ziyarat Tablets', eraAr: 'نقوش خطية مذهّبة', eraEn: 'Gilded Calligraphic Plaques' },
    { prefix: 'KFL-SCP', count: 4, nameAr: 'الصولجانات', nameEn: 'Ceremonial Maces & Scepters', eraAr: 'حرفية معدنية ملكية', eraEn: 'Ceremonial Metalwork' },
    { prefix: 'KFL-SHR', count: 4, nameAr: 'أجزاء الضريح المقدس', nameEn: 'Sacred Shrine Architecture Parts', eraAr: 'تراث العمارة المقدسة', eraEn: 'Historic Sanctuary Architecture' },
    { prefix: 'KFL-FIN', count: 4, nameAr: 'رأس السارية والعلم', nameEn: 'Sacred Standard Finials (Alam)', eraAr: 'أعلام ومواكب تراثية', eraEn: 'Historic Processional Finials' },
    { prefix: 'KFL-CLK', count: 3, nameAr: 'الساعات الأثرية', nameEn: 'Antique Clocks & Timepieces', eraAr: 'ساعات ميكانيكية نادرة', eraEn: 'Rare Mechanical Clocks' },
    { prefix: 'KFL-LCK', count: 3, nameAr: 'الأقفال التراثية', nameEn: 'Historical Shrine Locks', eraAr: 'أقفال منقوشة ومفاتيح', eraEn: 'Inscribed Locks & Keys' },
    { prefix: 'KFL-QRB', count: 3, nameAr: 'القرب التراثية', nameEn: 'Heritage Water Flasks (Qirab)', eraAr: 'رمزية السقاية والتراث', eraEn: 'Traditional Water Vessels' },
    { prefix: 'KFL-MDL', count: 3, nameAr: 'الأوسمة والنياشين', nameEn: 'Historical Medals & Orders', eraAr: 'أوسمة تاريخية نادرة', eraEn: 'Historic State Orders' },
    { prefix: 'KFL-PNT', count: 3, nameAr: 'اللوحات التراثية', nameEn: 'Heritage Paintings & Calligraphy', eraAr: 'خط عربي وتذهيب', eraEn: 'Calligraphy & Fine Art' },
    { prefix: 'KFL-VAS', count: 2, nameAr: 'المزهريات التراثية', nameEn: 'Heritage Vases', eraAr: 'خزف وبورسلين مطلي', eraEn: 'Painted Porcelain & Ceramic' },
    { prefix: 'KFL-QHL', count: 2, nameAr: 'حاملات المصاحف', nameEn: 'Illuminated Quran Holders', eraAr: 'خشب محفور ومطعّم', eraEn: 'Carved & Inlaid Rahles' },
    { prefix: 'KFL-LNT', count: 2, nameAr: 'القناديل والمشكاة', nameEn: 'Shrine Lanterns & Lamps', eraAr: 'زجاج ومعادن مزخرفة', eraEn: 'Ornate Sanctuary Lamps' },
    { prefix: 'KFL-DOR', count: 2, nameAr: 'الأبواب التراثية', nameEn: 'Historical Sanctuary Doors', eraAr: 'خشب ساج مكسو بالفضة', eraEn: 'Silver-Clad Teakwood Doors' },
    { prefix: 'KFL-GLS', count: 1, nameAr: 'الزجاجيات الأثرية', nameEn: 'Antique Glassware', eraAr: 'زجاج منفوخ ومذهب', eraEn: 'Gilded Blown Glass' },
  ] as MuseumHallDirectoryItem[],
};
