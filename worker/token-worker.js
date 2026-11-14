// ALQAMI's key keeper: a Cloudflare Worker that holds the Gemini API key, so it is never sent to a visitor's browser.
//
//   GET  /token  → a short-lived Live API token (1 session, 30 min, locked to Jawahiri's model), for the character.
//   POST /ask    → "What is this?": one camera frame in, the AI's guess out (fixed prompt and model on this side).
//
// Only ALQAMI's own pages may call it (Origin check), and each visitor (IP) is limited to a few calls a minute.
// Deploy: see docs/security-token-worker.md. Secret: GEMINI_API_KEY. Variable: ALLOWED_ORIGINS (comma separated).

const API = 'https://generativelanguage.googleapis.com/v1beta';
const LIVE_MODEL = 'models/gemini-3.8-live';
const PER_MINUTE = 6;
const hits = new Map(); // ip -> [timestamps]; per Worker instance, a light brake (Cloudflare rate limiting can be added)

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > PER_MINUTE;
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function liveToken(env) {
  const now = Date.now();
  const res = await fetch(`${API}/auth_tokens`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
      liveConnectConstraints: { model: LIVE_MODEL },
    }),
  });
  if (!res.ok) throw new Error(`auth_tokens ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { token: data.name, model: LIVE_MODEL, expiresAt: new Date(now + 30 * 60_000).toISOString() };
}

let askModel = null;
async function pickAskModel(env) {
  if (askModel) return askModel;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  const { models = [] } = await res.json();
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name)
    .filter((n) => /flash/i.test(n) && !/live|tts|image|audio|embedding|thinking|exp/i.test(n));
  const score = (n) => {
    const v = /gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1];
    return (v ? Number(v) * 100 : 0) - (/preview/.test(n) ? 5 : 0) - (/lite/.test(n) ? 3 : 0);
  };
  askModel = usable.sort((a, b) => score(b) - score(a))[0];
  if (!askModel) throw new Error('no Flash model');
  return askModel;
}

async function ask(env, body) {
  const { image, lang } = body;
  if (typeof image !== 'string' || image.length > 1_500_000) throw new Error('bad image');
  const model = await pickAskModel(env);
  const prompt =
    'You are a museum guide. Look at the main object in the centre of this photo (a statue, artefact, manuscript, ' +
    'book or work of art). Identify it as precisely as you honestly can; if you are not sure, say what kind of object ' +
    `it is instead of guessing a name. Answer in ${lang === 'en' ? 'English' : 'Arabic'}, with search words in both ` +
    'Arabic and English for a library catalogue.';
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: image } }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            nameEn: { type: 'STRING' },
            maker: { type: 'STRING' },
            material: { type: 'STRING' },
            dimensions: { type: 'STRING' },
            description: { type: 'STRING' },
            period: { type: 'STRING' },
            culture: { type: 'STRING' },
            searchTerms: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['name', 'description', 'searchTerms'],
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`generateContent ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}';
  return JSON.parse(text);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://isaacrow.github.io').split(',').map((s) => s.trim());
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (limited(ip)) return json({ error: 'slow down' }, 429, headers);

    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/token' && request.method === 'GET') return json(await liveToken(env), 200, headers);
      if (pathname === '/ask' && request.method === 'POST') return json(await ask(env, await request.json()), 200, headers);
      return json({ error: 'not found' }, 404, headers);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, headers);
    }
  },
};
