import { searchRecords, MoonRecord } from '../moon/moonApi';

/**
 * "What is this?" for an object the recognition index does not know: one camera frame goes to Gemini (the site's key,
 * the same one Jawahiri talks with), which names the object and gives search words; Moon is then searched with them.
 * The answer is always shown as the AI's guess, never as a catalogue match; a Moon record is only offered as
 * "maybe in the catalogue".
 */
export interface AskAnswer {
  name: string;
  /** For cataloguing: the name in English, maker, material, estimated size (any may be missing). */
  nameEn?: string;
  maker?: string;
  material?: string;
  dimensions?: string;
  description: string;
  period?: string;
  culture?: string;
  /** Moon records found with the AI's search words (best first). */
  records: MoonRecord[];
}

const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_CACHE = 'alqami.ask.model';

/** A fast multimodal model that this key can use (picked from the key's own model list, remembered for the visit). */
async function pickModel(key: string): Promise<string> {
  const cached = sessionStorage.getItem(MODEL_CACHE);
  if (cached) return cached;
  const res = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Gemini models ${res.status}`);
  const { models = [] } = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name)
    .filter((n) => /flash/i.test(n) && !/live|tts|image|audio|embedding|thinking|exp/i.test(n));
  // Newest version first ("gemini-3.1-flash" before "gemini-2.5-flash"), stable before "-preview", full before "-lite".
  const score = (n: string) => {
    const v = /gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1];
    return (v ? Number(v) * 100 : 0) - (/preview/.test(n) ? 5 : 0) - (/lite/.test(n) ? 3 : 0) - (/\d{3,}$/.test(n) ? 1 : 0);
  };
  const model = usable.sort((a, b) => score(b) - score(a))[0];
  if (!model) throw new Error('No Gemini Flash model for this key');
  sessionStorage.setItem(MODEL_CACHE, model);
  return model;
}

function frameJpeg(video: HTMLVideoElement): string {
  const c = document.createElement('canvas');
  const s = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
  c.width = Math.round(video.videoWidth * s);
  c.height = Math.round(video.videoHeight * s);
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}

/** ALQAMI's key keeper (worker/token-worker.js): when set, the site's Gemini key stays on the server. */
const TOKEN_URL = (import.meta.env.VITE_TOKEN_URL as string | undefined)?.replace(/\/+$/, '') || '';

export async function askAboutFrame(video: HTMLVideoElement, key: string, lang: 'ar' | 'en' = 'ar'): Promise<AskAnswer> {
  // Through the key keeper (no key in the browser), unless the visitor typed their own key.
  if (TOKEN_URL && !key) {
    const res = await fetch(`${TOKEN_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: frameJpeg(video), lang }),
    });
    if (!res.ok) throw new Error(`Key keeper ${res.status}`);
    return withRecords(await res.json());
  }
  if (!key) throw new Error('No Gemini key');
  const model = await pickModel(key);
  const prompt =
    'You are a museum guide. Look at the main object in the centre of this photo (a statue, artefact, manuscript, ' +
    'book or work of art). Identify it as precisely as you honestly can; if you are not sure, say what kind of object ' +
    `it is instead of guessing a name. Answer in ${lang === 'ar' ? 'Arabic' : 'English'}, with search words in both ` +
    'Arabic and English for a library catalogue.';
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: frameJpeg(video) } }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          nameEn: { type: 'STRING', description: 'The name in English.' },
          maker: { type: 'STRING', description: 'Maker, workshop or school, if known.' },
          material: { type: 'STRING' },
          dimensions: { type: 'STRING', description: 'Estimated size, if it can be judged.' },
          description: { type: 'STRING', description: 'Two or three sentences.' },
          period: { type: 'STRING' },
          culture: { type: 'STRING' },
          searchTerms: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Up to 4 short catalogue search terms.' },
        },
        required: ['name', 'description', 'searchTerms'],
      },
    },
  };
  const res = await fetch(`${API}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 404) sessionStorage.removeItem(MODEL_CACHE);
    throw new Error(`Gemini ${res.status}`);
  }
  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  return withRecords(JSON.parse(text));
}

type Guess = { name: string; nameEn?: string; maker?: string; material?: string; dimensions?: string; description: string; period?: string; culture?: string; searchTerms?: string[] };

/** Moon, searched with the AI's words: records found by more terms rank first. */
async function withRecords(a: Guess): Promise<AskAnswer> {

  // Moon, with each search term; records found by more terms rank first.
  const hits = new Map<string, { record: MoonRecord; n: number }>();
  for (const term of [a.name, ...(a.searchTerms ?? [])].filter(Boolean).slice(0, 5)) {
    try {
      const r = await searchRecords(term, 5);
      for (const rec of r.records) hits.set(rec.id, { record: rec, n: (hits.get(rec.id)?.n ?? 0) + 1 });
    } catch {
      // Moon unreachable: the AI's answer still shows.
    }
  }
  const records = [...hits.values()].sort((x, y) => y.n - x.n).map((h) => h.record).slice(0, 3);
  return { name: a.name, nameEn: a.nameEn, maker: a.maker, material: a.material, dimensions: a.dimensions, description: a.description, period: a.period, culture: a.culture, records };
}
