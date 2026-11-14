import backendRdfJson from '../data/backendRdf.json';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';

export interface RdfParsedMetadata {
  uri: string;
  type: string;
  titleAr: string;
  titleEn: string;
  creatorAr: string;
  creatorEn: string;
  date: string;
  materialsAr: string;
  materialsEn: string;
  dimensions: string;
  publisherAr: string;
  publisherEn: string;
  identifier: string;
  classificationLcc?: string;
  classificationDdc?: string;
  transcriptionAr?: string;
  translationEn?: string;
  summaryAr?: string;
  summaryEn?: string;
  rawTtl: string;
  rawRdf?: string;
  glbModel?: string;
  boundingBox?: {
    widthCm: number;
    heightCm: number;
    depthCm: number;
  };
}

export interface ScannedReferenceObject {
  id: string;
  scanName: string;
  timestamp: number;
  boundingBox: {
    widthCm: number;
    heightCm: number;
    depthCm: number;
  };
  origin: {
    x: number;
    y: number;
    z: number;
  };
  featurePointsCount: number;
  coverageScore: number;
  metadata: RdfParsedMetadata;
  glbModel?: string;
  usdzModel?: string;
  customRdfTurtle?: string;
}

const backendRdf: Record<string, string> = backendRdfJson as Record<string, string>;

// Mapping between artifact ID/slug and its RDF/TTL records
export const ARTIFACT_RDF_MAPPING: Record<
  string,
  {
    ttlFile: string;
    rdfFile?: string;
    dimensionsCm: { widthCm: number; heightCm: number; depthCm: number };
  }
> = {
  'nahj-al-balagha': {
    ttlFile: 'nahj_al_balagha.ttl',
    dimensionsCm: { widthCm: 18.5, heightCm: 25.0, depthCm: 6.2 },
  },
  'ALQ-MSS-006': {
    ttlFile: 'nahj_al_balagha.ttl',
    dimensionsCm: { widthCm: 18.5, heightCm: 25.0, depthCm: 6.2 },
  },
  'old-islamic-gilded-helmet': {
    ttlFile: 'Old_Islamic_Helmet.ttl',
    rdfFile: 'hand.ttl',
    dimensionsCm: { widthCm: 22.0, heightCm: 28.5, depthCm: 22.0 },
  },
  'ALQ-ARM-001': {
    ttlFile: 'Old_Islamic_Helmet.ttl',
    rdfFile: 'hand.ttl',
    dimensionsCm: { widthCm: 22.0, heightCm: 28.5, depthCm: 22.0 },
  },
  'zulfiqar-sword': {
    ttlFile: 'Zulfiqar_Sword.ttl',
    dimensionsCm: { widthCm: 16.0, heightCm: 98.0, depthCm: 8.5 },
  },
  'ALQ-SWD-002': {
    ttlFile: 'Zulfiqar_Sword.ttl',
    dimensionsCm: { widthCm: 16.0, heightCm: 98.0, depthCm: 8.5 },
  },
  'babylonian-map-of-the-world': {
    ttlFile: 'babylonian_map_of_the_world_tablet_-_imago_mundi.ttl',
    rdfFile: 'babylonian_map_of_the_world_tablet_-_imago_mundi.rdf',
    dimensionsCm: { widthCm: 8.2, heightCm: 12.2, depthCm: 3.1 },
  },
  'ALQ-MAP-001': {
    ttlFile: 'babylonian_map_of_the_world_tablet_-_imago_mundi.ttl',
    rdfFile: 'babylonian_map_of_the_world_tablet_-_imago_mundi.rdf',
    dimensionsCm: { widthCm: 8.2, heightCm: 12.2, depthCm: 3.1 },
  },
  'saqakhane-bronze-bowl': {
    ttlFile: 'saqakhane_bowl.ttl',
    dimensionsCm: { widthCm: 21.0, heightCm: 12.0, depthCm: 21.0 },
  },
  'ALQ-BWL-003': {
    ttlFile: 'saqakhane_bowl.ttl',
    dimensionsCm: { widthCm: 21.0, heightCm: 12.0, depthCm: 21.0 },
  },
  'old-babylonian-cuneiform-tablet': {
    ttlFile: 'old-babylonian_cuneiform_tablet_s264.ttl',
    rdfFile: 'old-babylonian_cuneiform_tablet_s264.rdf',
    dimensionsCm: { widthCm: 7.5, heightCm: 10.5, depthCm: 2.8 },
  },
  'ALQ-TAB-004': {
    ttlFile: 'old-babylonian_cuneiform_tablet_s264.ttl',
    rdfFile: 'old-babylonian_cuneiform_tablet_s264.rdf',
    dimensionsCm: { widthCm: 7.5, heightCm: 10.5, depthCm: 2.8 },
  },
  'prayer-niche-mihrab': {
    ttlFile: 'prayer_niche_mihrab.ttl',
    rdfFile: 'prayer_niche_mihrab.rdf',
    dimensionsCm: { widthCm: 65.0, heightCm: 120.0, depthCm: 35.0 },
  },
  'ALQ-MHB-005': {
    ttlFile: 'prayer_niche_mihrab.ttl',
    rdfFile: 'prayer_niche_mihrab.rdf',
    dimensionsCm: { widthCm: 65.0, heightCm: 120.0, depthCm: 35.0 },
  },
  'stela-of-hammurabi': {
    ttlFile: 'stela_of_hammurabi_replica.ttl',
    rdfFile: 'stela_of_hammurabi_replica.rdf',
    dimensionsCm: { widthCm: 65.0, heightCm: 225.0, depthCm: 50.0 },
  },
  'ALQ-STL-007': {
    ttlFile: 'stela_of_hammurabi_replica.ttl',
    rdfFile: 'stela_of_hammurabi_replica.rdf',
    dimensionsCm: { widthCm: 65.0, heightCm: 225.0, depthCm: 50.0 },
  },
  'ancient-ceramic-bowl': {
    ttlFile: 'bowl.ttl',
    rdfFile: 'bowl.rdf',
    dimensionsCm: { widthCm: 19.5, heightCm: 9.5, depthCm: 19.5 },
  },
  'ALQ-BWL-008': {
    ttlFile: 'bowl.ttl',
    rdfFile: 'bowl.rdf',
    dimensionsCm: { widthCm: 19.5, heightCm: 9.5, depthCm: 19.5 },
  },
  'al-qabasat-manuscript': {
    ttlFile: 'alqabasat.ttl',
    rdfFile: 'alqabasat.rdf',
    dimensionsCm: { widthCm: 17.0, heightCm: 24.5, depthCm: 5.5 },
  },
  'ALQ-MSS-009': {
    ttlFile: 'alqabasat.ttl',
    rdfFile: 'alqabasat.rdf',
    dimensionsCm: { widthCm: 17.0, heightCm: 24.5, depthCm: 5.5 },
  },
  'alqami-monolith': {
    ttlFile: 'alqami.ttl',
    rdfFile: 'meshy-model.ttl',
    dimensionsCm: { widthCm: 25.0, heightCm: 60.0, depthCm: 25.0 },
  },
  'ALQ-MON-010': {
    ttlFile: 'alqami.ttl',
    rdfFile: 'meshy-model.ttl',
    dimensionsCm: { widthCm: 25.0, heightCm: 60.0, depthCm: 25.0 },
  },
};

/**
 * Extracts metadata fields from raw Turtle text
 */
function extractTurtleField(ttl: string, predicate: string): string {
  const regex = new RegExp(`${predicate}\\s+"""([\\s\\S]*?)"""|${predicate}\\s+"([^"]*)"`, 'i');
  const match = ttl.match(regex);
  if (match) {
    return (match[1] || match[2] || '').trim();
  }
  return '';
}

/**
 * Extracts localized fields from Turtle: dc:title "نهج البلاغة"@ar, "Nahj al-Balagha"@en
 */
function extractLocalizedField(ttl: string, predicate: string, lang: 'ar' | 'en'): string {
  const regex = new RegExp(`"${predicate}"?[^"]*?"([^"]+)"@${lang}|${predicate}\\s+.*?\\s+"([^"]+)"@${lang}`, 'i');
  const match = ttl.match(regex);
  if (match) {
    return (match[1] || match[2] || '').trim();
  }
  // Try generic match
  const genRegex = new RegExp(`"${predicate}"?[^"]*?"([^"]+)"`, 'i');
  const genMatch = ttl.match(genRegex);
  return genMatch ? genMatch[1].trim() : '';
}

/**
 * Returns full parsed RDF metadata for an artifact by id or slug
 */
export function getArtifactRdfMetadata(idOrSlug: string): RdfParsedMetadata {
  const mapping = ARTIFACT_RDF_MAPPING[idOrSlug];
  const artifact = ALQAMI_ARTIFACTS.find((a) => a.id === idOrSlug || a.slug === idOrSlug) || ALQAMI_ARTIFACTS[0];

  // Without its own RDF file an object uses its own catalogue data (it used to borrow Nahj al-Balagha's file, so other
  // objects showed its English title and URI).
  const ttlFileName = mapping?.ttlFile;
  const rdfFileName = mapping?.rdfFile;

  const rawTtl = (ttlFileName && (backendRdf as Record<string, string>)[ttlFileName]) || '';
  const rawRdf = rdfFileName ? backendRdf[rdfFileName] : undefined;

  // Extract URI
  const uriMatch = rawTtl.match(/<([^>]+)>\s+a\s+/);
  const uri = uriMatch ? uriMatch[1] : `https://alqami.net/artifact/${artifact.slug}`;

  // Extract titles
  const titleAr = extractLocalizedField(rawTtl, 'dc:title', 'ar') || artifact.title.ar;
  const titleEn = extractLocalizedField(rawTtl, 'dc:title', 'en') || artifact.title.en;

  // Extract creator
  const creatorAr = extractLocalizedField(rawTtl, 'dc:creator', 'ar') || artifact.creator.ar;
  const creatorEn = extractLocalizedField(rawTtl, 'dc:creator', 'en') || artifact.creator.en;

  // Extract date
  const date = extractTurtleField(rawTtl, 'dc:date') || artifact.period.ar;

  // Extract materials
  const materialsAr = extractLocalizedField(rawTtl, 'schema:material', 'ar') || artifact.details.material.ar;
  const materialsEn = extractLocalizedField(rawTtl, 'schema:material', 'en') || artifact.details.material.en;

  // Extract dimensions / extent
  const dimensions = extractTurtleField(rawTtl, 'schema:extent') || artifact.details.dimensions;

  // Extract publisher / institution
  const publisherAr = extractLocalizedField(rawTtl, 'schema:publisher', 'ar') || artifact.institution.ar;
  const publisherEn = extractLocalizedField(rawTtl, 'schema:publisher', 'en') || artifact.institution.en;

  // Extract transcription & translation
  const transcriptionAr = extractTurtleField(rawTtl, 'ms:transcriptionArabic') || artifact.description.ar;
  const translationEn = extractTurtleField(rawTtl, 'ms:translationEnglish') || artifact.description.en;

  // Extract identifier
  const identifier = extractTurtleField(rawTtl, 'dc:identifier') || artifact.itemCode;

  // Extract type
  let type = 'schema:Manuscript, crm:E22_Human-Made_Object';
  if (rawTtl.includes('schema:CreativeWork')) type = 'schema:CreativeWork';
  else if (rawTtl.includes('schema:VisualArtwork')) type = 'schema:VisualArtwork';

  return {
    uri,
    type,
    titleAr,
    titleEn,
    creatorAr,
    creatorEn,
    date,
    materialsAr,
    materialsEn,
    dimensions,
    publisherAr,
    publisherEn,
    identifier,
    transcriptionAr,
    translationEn,
    summaryAr: artifact.description.ar,
    summaryEn: artifact.description.en,
    rawTtl,
    rawRdf,
    glbModel: artifact.model.glb,
    boundingBox: mapping?.dimensionsCm || { widthCm: 20, heightCm: 25, depthCm: 15 },
  };
}

/**
 * Generates an RDF/Turtle metadata record for a newly registered catalog item.
 */
export function generateCustomTurtle(
  data: {
    uri?: string;
    titleAr: string;
    titleEn?: string;
    creatorAr?: string;
    creatorEn?: string;
    date?: string;
    materialsAr?: string;
    materialsEn?: string;
    dimensions?: string;
    transcriptionAr?: string;
    notes?: string;
  },
  _originUrl = typeof window !== 'undefined' ? window.location.origin : ''
): string {
  const itemUri = data.uri || `urn:alqami:artifact:${Date.now()}`;
  const literal = (value: string) => JSON.stringify(value);
  const titleEn = data.titleEn ? `, ${literal(data.titleEn)}@en` : '';
  const creatorEn = data.creatorEn ? `, ${literal(data.creatorEn)}@en` : '';
  const transcription = data.transcriptionAr || data.notes || 'لا يوجد وصف مدخل.';
  return `@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix schema: <http://schema.org/> .
@prefix crm: <http://www.cidoc-crm.org/cidoc-crm/> .
@prefix ms: <https://w3id.org/manuscript-ar/ontology#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<${itemUri}>
    a schema:CreativeWork, crm:E22_Human-Made_Object ;
    dc:title ${literal(data.titleAr)}@ar${titleEn} ;
    dc:creator ${literal(data.creatorAr || 'غير معروف')}@ar${creatorEn} ;
    dc:date ${literal(data.date || 'غير مسجل')} ;
    schema:material ${literal(data.materialsAr || 'غير مسجل')}@ar ;
    schema:extent ${literal(data.dimensions || 'غير مسجل')} ;
    schema:publisher "مستودع علقمي" ;
    ms:transcriptionArabic ${literal(transcription)}@ar .
`;
}


const STORAGE_KEY = 'alqami_custom_scanned_objects_v1';

export function getCustomScannedObjects(): ScannedReferenceObject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load custom scanned objects:', err);
    return [];
  }
}

export function saveCustomScannedObject(obj: ScannedReferenceObject): void {
  try {
    const list = getCustomScannedObjects().filter((item) => item.id !== obj.id);
    list.unshift(obj);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to save custom scanned object:', err);
  }
}

export function deleteCustomScannedObject(id: string): void {
  try {
    const list = getCustomScannedObjects().filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to delete custom scanned object:', err);
  }
}

/**
 * Returns all detectable reference objects (Built-in authentic artifacts + user scanned objects)
 */
export function getAllReferenceObjects() {
  const builtIns = ALQAMI_ARTIFACTS.map((art) => {
    const meta = getArtifactRdfMetadata(art.id);
    return {
      id: art.id,
      slug: art.slug,
      name: art.title.ar,
      nameEn: art.title.en,
      image: art.image,
      metadata: meta,
      glb: art.model.glb,
      defaultBox: meta.boundingBox || { widthCm: 22, heightCm: 28, depthCm: 22 },
      isCustom: false,
    };
  });

  const custom = getCustomScannedObjects().map((obj) => ({
    id: obj.id,
    slug: obj.id,
    name: obj.metadata.titleAr,
    nameEn: obj.metadata.titleEn,
    image: '',
    metadata: obj.metadata,
    glb: obj.glbModel,
    defaultBox: obj.boundingBox,
    isCustom: true,
  }));

  return [...builtIns, ...custom];
}
