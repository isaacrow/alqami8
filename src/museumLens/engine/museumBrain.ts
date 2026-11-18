import { AlqamiArtifact } from '../../data/alqamiArtifacts';
import { getSpatialPartsForArtifact } from '../../kafeelScan/partAnatomy';
import { forceWasmBackend, sightBackend, WASM_BACKEND } from '../../recognize/backend';
import { IndexEntry, rank } from '../../recognize/decide';
import { Embedder } from '../../recognize/embedder';
import { EnrolledObject, listEnrolled, removeEnrolled, saveEnrolled } from '../../recognize/localEnrol';
import { encodeView, loadRecognitionIndex } from '../../recognize/recognitionIndex';
import { loadSettings } from '../../character/liveVoice';
import { captureHighResJpeg, renderEnhancedCrop } from './frameQuality';

export interface MuseumHotspot {
  id: string;
  labelAr: string;
  labelEn: string;
  noteAr: string;
  noteEn: string;
  /** Normalized position inside the tracked bounding box (0..1) */
  x: number;
  y: number;
}

export type DetectSource = 'dinov2' | 'ai-vision' | 'qr' | 'taught' | 'catalog';

export interface MuseumScanResult {
  id: string;
  titleAr: string;
  titleEn: string;
  subtitleAr?: string;
  subtitleEn?: string;
  category?: string;
  periodAr?: string;
  periodEn?: string;
  makerAr?: string;
  makerEn?: string;
  materialAr?: string;
  materialEn?: string;
  dimensions?: string;
  descriptionAr: string;
  descriptionEn: string;
  inscriptionReading?: string;
  confidence: number;
  source: DetectSource;
  angle: number | null;
  imageUrl?: string;
  artifact?: AlqamiArtifact;
  hotspots: MuseumHotspot[];
}

export interface LiveCandidate {
  key: string;
  score: number;
  angle: number | null;
  titleAr: string;
  titleEn: string;
  imageUrl?: string;
  isTaught: boolean;
  artifact?: AlqamiArtifact;
}

export interface CustomTaughtMeta {
  key: string;
  titleAr: string;
  titleEn: string;
  period?: string;
  material?: string;
  description?: string;
  thumbDataUrl?: string;
  createdAt: string;
}

const CUSTOM_META_KEY = 'alqami.museumLens.customMeta.v1';
const GEMINI_OVERRIDE_KEY = 'alqami.museumLens.geminiKey';
const MODEL_CACHE_KEY = 'alqami.museumLens.geminiModel';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const TOKEN_URL = (import.meta.env.VITE_TOKEN_URL as string | undefined)?.replace(/\/+$/, '') || '';

export function loadCustomTaughtMeta(): Record<string, CustomTaughtMeta> {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_META_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveCustomTaughtMeta(meta: CustomTaughtMeta): void {
  try {
    const all = loadCustomTaughtMeta();
    all[meta.key] = meta;
    localStorage.setItem(CUSTOM_META_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function deleteCustomTaughtMeta(key: string): void {
  try {
    const all = loadCustomTaughtMeta();
    delete all[key];
    localStorage.setItem(CUSTOM_META_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function getSavedGeminiKey(): string {
  try {
    const custom = localStorage.getItem(GEMINI_OVERRIDE_KEY);
    if (custom && custom.trim().length > 10) return custom.trim();
  } catch {
    /* ignore */
  }
  return loadSettings().geminiKey || '';
}

export function saveCustomGeminiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(GEMINI_OVERRIDE_KEY, key.trim());
    else localStorage.removeItem(GEMINI_OVERRIDE_KEY);
    sessionStorage.removeItem(MODEL_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasAiVisionCapability(): boolean {
  return Boolean(TOKEN_URL || getSavedGeminiKey());
}

/** Finds an AlqamiArtifact from any index key (alkafeel:2126, artifact:..., moon:..., KFL-..., numeric serial). */
export function findCatalogArtifact(rawKey: string, catalog: AlqamiArtifact[]): AlqamiArtifact | undefined {
  const needle = rawKey.trim().toLowerCase();
  if (!needle) return undefined;
  const stripped = needle.replace(/^(?:alkafeel:|alkafeel__|artifact:|moon:|kfl-[a-z]+-|kfl-)/i, '');
  return catalog.find(
    (a) =>
      a.id.toLowerCase() === needle ||
      a.itemCode.toLowerCase() === needle ||
      a.slug.toLowerCase() === needle ||
      (a.moonRecordId && a.moonRecordId.toLowerCase() === stripped) ||
      (stripped && /^\d+$/.test(stripped) && a.id.toLowerCase().endsWith(`-${stripped}`))
  );
}

/** Converts an AlqamiArtifact into a full MuseumScanResult with spatial hotspots. */
export function resultFromArtifact(
  art: AlqamiArtifact,
  confidence: number,
  source: DetectSource,
  angle: number | null = null
): MuseumScanResult {
  const spatialParts = getSpatialPartsForArtifact(art);
  const presets = [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.34 },
    { x: 0.32, y: 0.68 },
    { x: 0.68, y: 0.72 },
  ];
  const hotspots: MuseumHotspot[] = spatialParts.slice(0, 4).map((p, idx) => ({
    id: p.id,
    labelAr: p.titleAr,
    labelEn: p.titleEn,
    noteAr: p.detailAr,
    noteEn: p.detailEn,
    x: Math.max(0.15, Math.min(0.85, 0.5 + (p.dx ?? (presets[idx % presets.length].x - 0.5)))),
    y: Math.max(0.15, Math.min(0.85, 0.5 + (p.dy ?? (presets[idx % presets.length].y - 0.5)))),
  }));

  return {
    id: art.id,
    titleAr: art.title.ar || art.title.en,
    titleEn: art.title.en || art.title.ar,
    subtitleAr: art.subtitle?.ar,
    subtitleEn: art.subtitle?.en,
    category: art.categoryLabel?.en || art.category,
    periodAr: art.period?.ar,
    periodEn: art.period?.en,
    makerAr: art.creator?.ar,
    makerEn: art.creator?.en,
    materialAr: art.details?.material?.ar,
    materialEn: art.details?.material?.en,
    dimensions: art.details?.dimensions,
    descriptionAr: art.description?.ar || art.description?.en || '',
    descriptionEn: art.description?.en || art.description?.ar || '',
    confidence,
    source,
    angle,
    imageUrl: art.image,
    artifact: art,
    hotspots,
  };
}

export function resultFromTaught(meta: CustomTaughtMeta, confidence: number): MuseumScanResult {
  return {
    id: meta.key,
    titleAr: meta.titleAr || meta.titleEn,
    titleEn: meta.titleEn || meta.titleAr,
    category: 'Taught Real Object',
    periodAr: meta.period || 'مقتنى متحفي مُسجَّل ميدانياً',
    periodEn: meta.period || 'Field-Enrolled Museum Artifact',
    materialAr: meta.material || 'قطعة حقيقية متعددة الزوايا',
    materialEn: meta.material || 'Real 3D Multi-Angle Object',
    descriptionAr:
      meta.description ||
      'قطعة متحفية حقيقية تم تدريب عدسة علقمي عليها مباشرة من زوايا متعددة للتعرّف الفوري داخل القاعة.',
    descriptionEn:
      meta.description ||
      'Real-life museum artifact enrolled directly on this device across multiple viewing angles for instant live recognition.',
    confidence,
    source: 'taught',
    angle: null,
    imageUrl: meta.thumbDataUrl,
    hotspots: [
      {
        id: 'taught-core',
        labelAr: 'توقيع بصري مُعتمد',
        labelEn: 'Verified Visual Signature',
        noteAr: 'تم التعرّف على هذه القطعة عبر البصمة العصبية DINOv2 المحفوظة محلياً.',
        noteEn: 'Recognized via locally enrolled multi-angle DINOv2 visual embeddings.',
        x: 0.5,
        y: 0.45,
      },
    ],
  };
}

/**
 * Real-Life Calibrated Multi-Scale DINOv2 Visual Sight Engine.
 * Supports WebGPU FP16 (15ms/frame) & WASM INT8, hot-reloading taught objects,
 * and 5-window high-accuracy offline deep snapshots.
 */
export class MuseumSightEngine {
  private embedder: Embedder | null = null;
  private entries: IndexEntry[] = [];
  private backendKey = 'dinov2s';
  private readyPromise: Promise<void> | null = null;
  private cropCanvas = document.createElement('canvas');
  private ema = new Map<string, number>();
  private streak: { key: string; count: number } | null = null;

  backendLabel = '';
  entryCount = 0;

  constructor() {
    this.cropCanvas.width = 224;
    this.cropCanvas.height = 224;
  }

  async prepare(): Promise<void> {
    this.readyPromise ??= (async () => {
      let b = await sightBackend();
      let embedder = new Embedder(b.device, b.dtype);
      try {
        await embedder.load();
      } catch (err) {
        await embedder.dispose().catch(() => {});
        if (b.device === 'webgpu') {
          forceWasmBackend();
          b = WASM_BACKEND;
          embedder = new Embedder(b.device, b.dtype);
          await embedder.load();
        } else {
          throw err;
        }
      }
      this.backendKey = b.key;
      this.backendLabel = b.device === 'webgpu' ? 'WebGPU FP16' : 'WASM INT8';
      this.embedder = embedder;
      await this.reloadIndex();
    })();
    return this.readyPromise;
  }

  async reloadIndex(): Promise<void> {
    if (!this.embedder) return;
    const embedder = this.embedder;
    const reembed = async (photos: Blob[]) => {
      const out: string[] = [];
      for (const p of photos) {
        const bmp = await createImageBitmap(p);
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext('2d')!.drawImage(bmp, 0, 0);
        const v = await embedder.embed(c, 1.0);
        if (v) out.push(encodeView(v));
      }
      return out;
    };
    const { entries } = await loadRecognitionIndex(this.backendKey, reembed);
    this.entries = entries;
    this.entryCount = entries.length;
    this.resetTemporal();
  }

  resetTemporal(): void {
    this.ema.clear();
    this.streak = null;
  }

  /**
   * Evaluates a single enhanced ROI crop and applies EMA temporal consensus.
   */
  async scanCrop(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    catalog: AlqamiArtifact[],
    opts: {
      cx?: number;
      cy?: number;
      scale?: number;
      enhance?: boolean;
      autoLockThreshold: number;
      candidateFloor?: number;
    }
  ): Promise<{
    locked: MuseumScanResult | null;
    candidates: LiveCandidate[];
    latencyMs: number;
  }> {
    await this.prepare();
    const t0 = performance.now();
    const ok = renderEnhancedCrop(
      source,
      this.cropCanvas,
      opts.cx ?? 0.5,
      opts.cy ?? 0.48,
      opts.scale ?? 0.78,
      opts.enhance ?? true
    );
    if (!ok || !this.embedder) {
      return { locked: null, candidates: [], latencyMs: 0 };
    }

    const query = await this.embedder.embed(this.cropCanvas, 1.0);
    const latencyMs = Math.max(8, Math.round(performance.now() - t0));
    if (!query) return { locked: null, candidates: [], latencyMs };

    const ranked = rank(query, this.entries).slice(0, 6);
    const customMeta = loadCustomTaughtMeta();
    const candidateFloor = opts.candidateFloor ?? 0.44;

    const scored: LiveCandidate[] = [];
    for (const r of ranked) {
      const prev = this.ema.get(r.key) ?? r.score;
      const smooth = prev * 0.38 + r.score * 0.62;
      this.ema.set(r.key, smooth);

      const taught = customMeta[r.key];
      const art = taught ? undefined : findCatalogArtifact(r.key, catalog);
      if (!taught && !art) continue;

      scored.push({
        key: r.key,
        score: smooth,
        angle: r.angle ?? null,
        titleAr: taught ? taught.titleAr : art!.title.ar || art!.title.en,
        titleEn: taught ? taught.titleEn : art!.title.en || art!.title.ar,
        imageUrl: taught ? taught.thumbDataUrl : art!.image,
        isTaught: Boolean(taught),
        artifact: art,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const visibleCandidates = scored.filter((c) => c.score >= candidateFloor).slice(0, 3);

    const [best, second] = scored;
    if (best) {
      const margin = best.score - (second?.score ?? 0);
      const instantHit = best.score >= Math.max(0.72, opts.autoLockThreshold + 0.08) && margin >= 0.025;
      const steadyHit = best.score >= opts.autoLockThreshold && margin >= 0.03;

      if (instantHit) {
        const res = best.isTaught
          ? resultFromTaught(customMeta[best.key], best.score)
          : resultFromArtifact(best.artifact!, best.score, 'dinov2', best.angle);
        return { locked: res, candidates: visibleCandidates, latencyMs };
      }

      if (steadyHit) {
        this.streak =
          this.streak?.key === best.key
            ? { key: best.key, count: this.streak.count + 1 }
            : { key: best.key, count: 1 };
        if (this.streak.count >= 2) {
          const res = best.isTaught
            ? resultFromTaught(customMeta[best.key], best.score)
            : resultFromArtifact(best.artifact!, best.score, 'dinov2', best.angle);
          return { locked: res, candidates: visibleCandidates, latencyMs };
        }
      } else {
        this.streak = null;
      }
    }

    return { locked: null, candidates: visibleCandidates, latencyMs };
  }

  /**
   * 5-Window Deep Offline Visual Ensemble (used on shutter tap when offline or alongside AI Vision).
   * Evaluates 5 crops (center tight, center medium, full frame, upper-center, lower-center) and averages top scores.
   */
  async deepEnsembleSnapshot(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    catalog: AlqamiArtifact[]
  ): Promise<LiveCandidate[]> {
    await this.prepare();
    if (!this.embedder) return [];

    const windows = [
      { cx: 0.5, cy: 0.48, scale: 0.60 },
      { cx: 0.5, cy: 0.48, scale: 0.80 },
      { cx: 0.5, cy: 0.50, scale: 0.96 },
      { cx: 0.42, cy: 0.46, scale: 0.68 },
      { cx: 0.58, cy: 0.46, scale: 0.68 },
    ];

    const bestByKey = new Map<string, { max: number; sum: number; count: number; angle: number | null }>();

    for (const w of windows) {
      if (!renderEnhancedCrop(source, this.cropCanvas, w.cx, w.cy, w.scale, true)) continue;
      const q = await this.embedder.embed(this.cropCanvas, 1.0);
      if (!q) continue;
      for (const r of rank(q, this.entries).slice(0, 8)) {
        const cur = bestByKey.get(r.key) ?? { max: -1, sum: 0, count: 0, angle: r.angle ?? null };
        if (r.score > cur.max) {
          cur.max = r.score;
          cur.angle = r.angle ?? null;
        }
        cur.sum += r.score;
        cur.count += 1;
        bestByKey.set(r.key, cur);
      }
    }

    const customMeta = loadCustomTaughtMeta();
    const out: LiveCandidate[] = [];
    for (const [key, stat] of bestByKey.entries()) {
      const blended = stat.max * 0.7 + (stat.sum / stat.count) * 0.3;
      const taught = customMeta[key];
      const art = taught ? undefined : findCatalogArtifact(key, catalog);
      if (!taught && !art) continue;
      out.push({
        key,
        score: blended,
        angle: stat.angle,
        titleAr: taught ? taught.titleAr : art!.title.ar || art!.title.en,
        titleEn: taught ? taught.titleEn : art!.title.en || art!.title.ar,
        imageUrl: taught ? taught.thumbDataUrl : art!.image,
        isTaught: Boolean(taught),
        artifact: art,
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /**
   * Computes a normalized DINOv2 embedding directly from an enhanced crop of the live camera.
   * Used by the 360° Teach Real Object flow.
   */
  async embedSnapshot(source: HTMLVideoElement | HTMLCanvasElement): Promise<{ vec: Float32Array; blob: Blob; thumb: string } | null> {
    await this.prepare();
    if (!this.embedder) return null;
    if (!renderEnhancedCrop(source, this.cropCanvas, 0.5, 0.48, 0.78, true)) return null;
    const vec = await this.embedder.embed(this.cropCanvas, 1.0);
    if (!vec) return null;

    const blob = await new Promise<Blob>((resolve) =>
      this.cropCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.85)
    );
    const thumb = this.cropCanvas.toDataURL('image/jpeg', 0.72);
    return { vec, blob, thumb };
  }

  /** Saves a real-life museum object (multi-angle DINOv2 embeddings + metadata) and hot-reloads the index. */
  async enrollRealObject(params: {
    titleAr: string;
    titleEn?: string;
    period?: string;
    material?: string;
    description?: string;
    samples: Array<{ vec: Float32Array; blob: Blob; thumb: string }>;
  }): Promise<CustomTaughtMeta> {
    const slug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const key = `artifact:real-${slug}`;
    const entry: EnrolledObject = {
      key,
      title: params.titleAr || params.titleEn || 'Museum Object',
      views: params.samples.map((s) => encodeView(s.vec)),
      model: this.backendKey,
      photos: params.samples.map((s) => s.blob),
      savedAt: new Date().toISOString(),
    };
    await saveEnrolled(entry);
    const meta: CustomTaughtMeta = {
      key,
      titleAr: params.titleAr || params.titleEn || 'قطعة متحفية',
      titleEn: params.titleEn || params.titleAr || 'Museum Artifact',
      period: params.period,
      material: params.material,
      description: params.description,
      thumbDataUrl: params.samples[0]?.thumb,
      createdAt: entry.savedAt,
    };
    saveCustomTaughtMeta(meta);
    await this.reloadIndex();
    return meta;
  }

  async deleteTaughtObject(key: string): Promise<void> {
    await removeEnrolled(key);
    deleteCustomTaughtMeta(key);
    await this.reloadIndex();
  }

  async listTaughtObjects(): Promise<Array<{ meta: CustomTaughtMeta; viewsCount: number }>> {
    const enrolled = await listEnrolled().catch(() => []);
    const metas = loadCustomTaughtMeta();
    return enrolled
      .filter((e) => Boolean(metas[e.key]))
      .map((e) => ({ meta: metas[e.key], viewsCount: e.views.length }));
  }

  async dispose(): Promise<void> {
    this.readyPromise = null;
    await this.embedder?.dispose();
    this.embedder = null;
  }
}

async function pickGeminiFlashModel(apiKey: string): Promise<string> {
  const cached = sessionStorage.getItem(MODEL_CACHE_KEY);
  if (cached) return cached;
  const res = await fetch(`${GEMINI_API}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`Gemini models ${res.status}`);
  const { models = [] } = (await res.json()) as {
    models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
  };
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name)
    .filter((n) => /flash/i.test(n) && !/live|tts|image|audio|embedding|thinking|exp/i.test(n));
  const score = (n: string) => {
    const v = /gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1];
    return (v ? Number(v) * 100 : 0) - (/preview/.test(n) ? 5 : 0) - (/lite/.test(n) ? 3 : 0);
  };
  const best = usable.sort((a, b) => score(b) - score(a))[0] || 'models/gemini-2.5-flash';
  sessionStorage.setItem(MODEL_CACHE_KEY, best);
  return best;
}

/**
 * Cross-links an AI Vision identification with the 183 Al-Kafeel Museum catalogue items
 * by museum number, Arabic/English keywords, or category.
 */
function crossLinkCatalog(
  ai: {
    museumNumber?: string;
    titleAr?: string;
    titleEn?: string;
    searchKeywords?: string[];
  },
  catalog: AlqamiArtifact[]
): AlqamiArtifact | undefined {
  // 1. Exact museum/serial number match (e.g. #997, 2126, 2165)
  const numMatch = (ai.museumNumber || '').match(/\d{3,5}/)?.[0];
  if (numMatch) {
    const exact = catalog.find(
      (a) =>
        a.id.includes(numMatch) ||
        a.title.ar.includes(numMatch) ||
        a.title.en.includes(numMatch) ||
        (a.subtitle?.ar || '').includes(numMatch)
    );
    if (exact) return exact;
  }

  // 2. Keyword overlap scoring across Arabic & English titles
  const terms = [ai.titleAr, ai.titleEn, ...(ai.searchKeywords || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/[\s,،.\-/#()]+/)
    .filter((t) => t.length >= 3);

  if (terms.length === 0) return undefined;

  let bestArt: AlqamiArtifact | undefined;
  let bestHits = 0;
  for (const art of catalog) {
    const hay = `${art.title.ar} ${art.title.en} ${art.categoryLabel?.ar || ''} ${art.categoryLabel?.en || ''} ${art.details?.material?.ar || ''} ${art.details?.material?.en || ''}`.toLowerCase();
    let hits = 0;
    for (const term of terms) {
      if (hay.includes(term)) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestArt = art;
    }
  }
  return bestHits >= 3 ? bestArt : undefined;
}

/**
 * Deep AI Museum Curator: identifies ANY real-life museum object from a camera/photo frame,
 * reads visible inscriptions or plaque numbers, generates 3–4 interactive AR hotspots,
 * and automatically upgrades to the verified Al-Kafeel 3D GLB model if matched in the catalogue.
 */
export async function identifyRealObjectWithAI(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  catalog: AlqamiArtifact[],
  lang: 'ar' | 'en' = 'ar',
  topVisualCandidates: LiveCandidate[] = []
): Promise<MuseumScanResult> {
  const jpeg = captureHighResJpeg(source, 1024, 0.86);
  const apiKey = getSavedGeminiKey();

  // Path A: Cloudflare Key Keeper (when no custom browser key is entered)
  if (TOKEN_URL && !apiKey) {
    const res = await fetch(`${TOKEN_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: jpeg, lang }),
    });
    if (!res.ok) throw new Error(`Vision service ${res.status}`);
    const g = (await res.json()) as {
      name?: string;
      nameEn?: string;
      maker?: string;
      material?: string;
      dimensions?: string;
      description?: string;
      period?: string;
      culture?: string;
      searchTerms?: string[];
    };
    const linked = crossLinkCatalog(
      { titleAr: g.name, titleEn: g.nameEn, searchKeywords: g.searchTerms },
      catalog
    );
    if (linked) {
      return resultFromArtifact(linked, 0.94, 'ai-vision', 0);
    }
    return {
      id: `ai-${Date.now().toString(36)}`,
      titleAr: g.name || g.nameEn || 'قطعة متحفية',
      titleEn: g.nameEn || g.name || 'Museum Object',
      category: g.culture || 'Museum Artifact',
      periodAr: g.period,
      periodEn: g.period,
      makerAr: g.maker,
      makerEn: g.maker,
      materialAr: g.material,
      materialEn: g.material,
      dimensions: g.dimensions,
      descriptionAr: g.description || '',
      descriptionEn: g.description || '',
      confidence: 0.9,
      source: 'ai-vision',
      angle: null,
      hotspots: [
        {
          id: 'ai-center',
          labelAr: 'التحليل المتحفي',
          labelEn: 'Curator Insight',
          noteAr: g.description || g.name || '',
          noteEn: g.description || g.nameEn || '',
          x: 0.5,
          y: 0.46,
        },
        ...(g.material
          ? [
              {
                id: 'ai-mat',
                labelAr: 'المادة والصناعة',
                labelEn: 'Material & Craft',
                noteAr: g.material,
                noteEn: g.material,
                x: 0.72,
                y: 0.64,
              },
            ]
          : []),
      ],
    };
  }

  if (!apiKey) {
    throw new Error('NO_AI_KEY');
  }

  const model = await pickGeminiFlashModel(apiKey);
  const candidateHint =
    topVisualCandidates.length > 0
      ? `\nVisual similarity hints from the Al-Kafeel Museum catalogue (ONLY use if the photo genuinely matches one of them):\n${topVisualCandidates
          .slice(0, 3)
          .map((c, i) => `${i + 1}. ${c.titleAr} / ${c.titleEn} (${Math.round(c.score * 100)}%)`)
          .join('\n')}`
      : '';

  const prompt =
    'You are an expert museum curator, art historian, and Islamic/ancient heritage specialist analyzing a live visitor photo taken in a real museum or gallery (possibly behind glass).\n' +
    'Identify the main real-life object in the center of the photo accurately and honestly. Read any visible museum plaque numbers, Arabic/Kufic/Ottoman/Latin inscriptions if present. Provide rich bilingual (Arabic & English) museum metadata AND 3-4 spatial hotspot pins pointing to notable visual parts of the object (with normalized x,y coordinates between 0.15 and 0.85 inside the central object frame).' +
    candidateHint;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: jpeg } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          titleAr: { type: 'STRING' },
          titleEn: { type: 'STRING' },
          category: { type: 'STRING' },
          periodAr: { type: 'STRING' },
          periodEn: { type: 'STRING' },
          makerAr: { type: 'STRING' },
          makerEn: { type: 'STRING' },
          materialAr: { type: 'STRING' },
          materialEn: { type: 'STRING' },
          dimensions: { type: 'STRING' },
          descriptionAr: { type: 'STRING', description: '2-3 rich museum-grade sentences in Arabic.' },
          descriptionEn: { type: 'STRING', description: '2-3 rich museum-grade sentences in English.' },
          inscriptionReading: { type: 'STRING', description: 'Transcription or translation of visible inscriptions/plaques, or empty.' },
          museumNumber: { type: 'STRING', description: 'Any visible museum catalogue number, or empty.' },
          confidence: { type: 'NUMBER', description: '0.5 to 0.99' },
          searchKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
          hotspots: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                labelAr: { type: 'STRING' },
                labelEn: { type: 'STRING' },
                noteAr: { type: 'STRING' },
                noteEn: { type: 'STRING' },
                x: { type: 'NUMBER' },
                y: { type: 'NUMBER' },
              },
              required: ['labelAr', 'labelEn', 'noteAr', 'noteEn', 'x', 'y'],
            },
          },
        },
        required: ['titleAr', 'titleEn', 'descriptionAr', 'descriptionEn', 'hotspots'],
      },
    },
  };

  const res = await fetch(`${GEMINI_API}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 404) sessionStorage.removeItem(MODEL_CACHE_KEY);
    throw new Error(`Gemini Vision ${res.status}`);
  }
  const data = await res.json();
  const rawText: string =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}';
  const parsed = JSON.parse(rawText);

  const linked = crossLinkCatalog(parsed, catalog);
  const aiHotspots: MuseumHotspot[] = (parsed.hotspots || []).slice(0, 4).map((h: any, i: number) => ({
    id: `ai-pin-${i}`,
    labelAr: h.labelAr || h.labelEn,
    labelEn: h.labelEn || h.labelAr,
    noteAr: h.noteAr || h.noteEn,
    noteEn: h.noteEn || h.noteAr,
    x: Math.max(0.16, Math.min(0.84, Number(h.x) || 0.5)),
    y: Math.max(0.16, Math.min(0.84, Number(h.y) || 0.5)),
  }));

  if (linked) {
    const base = resultFromArtifact(linked, Math.max(0.86, Number(parsed.confidence) || 0.92), 'ai-vision', 0);
    return {
      ...base,
      inscriptionReading: parsed.inscriptionReading || undefined,
      hotspots: aiHotspots.length ? aiHotspots : base.hotspots,
    };
  }

  return {
    id: `ai-${Date.now().toString(36)}`,
    titleAr: parsed.titleAr || parsed.titleEn || 'قطعة متحفية',
    titleEn: parsed.titleEn || parsed.titleAr || 'Museum Object',
    category: parsed.category || 'Museum Artifact',
    periodAr: parsed.periodAr,
    periodEn: parsed.periodEn,
    makerAr: parsed.makerAr,
    makerEn: parsed.makerEn,
    materialAr: parsed.materialAr,
    materialEn: parsed.materialEn,
    dimensions: parsed.dimensions,
    descriptionAr: parsed.descriptionAr || '',
    descriptionEn: parsed.descriptionEn || '',
    inscriptionReading: parsed.inscriptionReading || undefined,
    confidence: Math.max(0.65, Math.min(0.99, Number(parsed.confidence) || 0.88)),
    source: 'ai-vision',
    angle: null,
    hotspots: aiHotspots,
  };
}
