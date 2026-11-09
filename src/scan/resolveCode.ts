import { MOON_SITE, searchRecords, getChangePages } from '../moon/moonApi';
import { readRecord } from '../moon/readRecord';
import { savedIsbnRecord } from '../moon/moonObjects';
import { toIsbn13 } from '../moon/isbn';

export { toIsbn13 };

/**
 * What a scanned code points at. ALQAMI's own labels carry the Moon catalogue link of the record
 * (https://mooon.site/opac.html?work=<record id>), so a plain phone camera opens Moon and ALQAMI opens its card.
 */
export type CodeTarget =
  | { kind: 'moon'; recordId: string }
  | { kind: 'artifact'; id: string }
  | { kind: 'none'; reason: 'not-in-moon' | 'unknown'; text: string };

async function recordForIsbn(isbn13: string): Promise<string | null> {
  // The ISBN index saved on this device answers at once; Moon's search covers records published since.
  const saved = savedIsbnRecord(isbn13);
  if (saved) return saved;
  const { records } = await searchRecords(isbn13, 5);
  // Search matches words anywhere; keep only a record whose own identifiers carry this ISBN.
  const hit = records.find((r) => readRecord(r, 'en').isbns.some((i) => toIsbn13(i) === isbn13));
  return hit?.id ?? null;
}

const URI_INDEX_KEY = 'alqami-moon-uri-index';
const URI_INDEX_MAX_AGE = 24 * 60 * 60 * 1000;
let uriIndex: Promise<Record<string, string>> | null = null;

// Moon URI (work or instance) to record ID, from Moon's change feed, which names both for every record.
// Reading every feed page takes several seconds, so the index is kept on the device for a day.
function loadUriIndex(fresh = false): Promise<Record<string, string>> {
  if (!fresh) {
    try {
      const saved = JSON.parse(localStorage.getItem(URI_INDEX_KEY) || 'null');
      if (saved && Date.now() - saved.at < URI_INDEX_MAX_AGE) return Promise.resolve(saved.map);
    } catch {
      // No saved index: build one.
    }
  }
  return getChangePages().then((items) => {
    const map: Record<string, string> = {};
    for (const item of items) {
      if (item.objectId) map[item.objectId] = item.recordId;
      if (item.workId) map[item.workId] = item.recordId;
    }
    try {
      localStorage.setItem(URI_INDEX_KEY, JSON.stringify({ at: Date.now(), map }));
    } catch {
      // Storage blocked: the index lasts for this visit only.
    }
    return map;
  });
}

async function recordForMoonUri(uri: string): Promise<string | null> {
  const key = uri.replace(/[?#].*$/, '').replace(/\.(jsonld|nt|ttl|rdf)$/, '');
  uriIndex ??= loadUriIndex();
  let found = (await uriIndex)[key];
  if (!found) {
    // A record published after the saved index was built: rebuild once.
    uriIndex = loadUriIndex(true);
    found = (await uriIndex)[key];
  }
  return found ?? null;
}

export async function resolveCode(text: string): Promise<CodeTarget> {
  if (/^[\d\-\sXx]+$/.test(text)) {
    const isbn = toIsbn13(text);
    if (!isbn) return { kind: 'none', reason: 'unknown', text };
    const recordId = await recordForIsbn(isbn);
    return recordId ? { kind: 'moon', recordId } : { kind: 'none', reason: 'not-in-moon', text: isbn };
  }

  let url: URL | null = null;
  try {
    const parsed = new URL(text);
    // "ALQAMI:ALQ-HLM-004" also parses as a URL (scheme "alqami:"); only web links count here.
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed;
  } catch {
    // Not a link: an ALQAMI label or a bare object ID.
  }

  if (url && url.origin === MOON_SITE) {
    const work = url.searchParams.get('work');
    if (work) return { kind: 'moon', recordId: work };
    if (url.pathname.startsWith('/resource/')) {
      const recordId = await recordForMoonUri(`${MOON_SITE}${url.pathname}`);
      if (recordId) return { kind: 'moon', recordId };
    }
    return { kind: 'none', reason: 'not-in-moon', text };
  }

  // ALQAMI's older labels: "ALQAMI:<id>", "?artifact=<id>" links, or a bare ALQ-… object ID.
  const artifactId = url
    ? url.searchParams.get('artifact')
    : /^ALQAMI:/i.test(text) || /^ALQ-[A-Z0-9-]+$/i.test(text)
      ? text.replace(/^ALQAMI:/i, '').trim()
      : null;
  if (artifactId) return { kind: 'artifact', id: artifactId };
  return { kind: 'none', reason: 'unknown', text };
}
