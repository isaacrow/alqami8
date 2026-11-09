/**
 * Read-only client for Moon (mooon.site), the catalogue ALQAMI recalls its records from.
 *
 * Uses the same public edge-function API and public key as Moon's own OPAC. ALQAMI never writes to Moon:
 * every call here is a GET for published records only.
 */

const MOON_PROJECT_ID = 'gfbagczwhvxxstbfrfhu';
// Moon's public (anon) key, the same one shipped in mooon.site's own pages. It only grants public reads.
const MOON_PUBLIC_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmYmFnY3p3aHZ4eHN0YmZyZmh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODg4OTksImV4cCI6MjA4NjM2NDg5OX0.Hrib4UwwVvCu0o7K51UAICoSmd2J-0XlkLegdkIqLJk';

export const MOON_API = `https://${MOON_PROJECT_ID}.supabase.co/functions/v1/make-server-49c0e13c`;
export const MOON_SITE = 'https://mooon.site';

export type JsonLdNode = Record<string, any>;

export interface MoonRecord {
  id: string;
  title: string;
  document: { '@graph': JsonLdNode[] };
  metadata?: Record<string, any>;
  version?: number;
  publishedVersion?: number;
  saved?: string;
  coverUrl?: string | null;
}

export interface MoonSearchResult {
  total: number;
  records: MoonRecord[];
}

export interface MoonChange {
  /** Moon record ID the change belongs to (read from the change's own URI). */
  recordId: string;
  type: 'Create' | 'Update' | 'Delete' | string;
  published: string;
}

export class MoonError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

async function moonGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${MOON_API}${path}`, {
    headers: { Authorization: `Bearer ${MOON_PUBLIC_KEY}` },
    signal,
  });
  if (!res.ok) throw new MoonError(`Moon answered ${res.status} for ${path}`, res.status);
  return res.json() as Promise<T>;
}

export function searchRecords(query: string, limit = 20, offset = 0, signal?: AbortSignal): Promise<MoonSearchResult> {
  const qs = new URLSearchParams({ view: 'published', q: query.slice(0, 200), limit: String(limit), offset: String(offset) });
  return moonGet<MoonSearchResult>(`/records/search?${qs}`, signal);
}

/** One published record, or null when Moon has no published record with that ID. */
export async function getRecord(id: string, signal?: AbortSignal): Promise<MoonRecord | null> {
  try {
    return await moonGet<MoonRecord>(`/records/${encodeURIComponent(id)}?view=published`, signal);
  } catch (error) {
    if (error instanceof MoonError && error.status === 404) return null;
    throw error;
  }
}

/** The newest page of Moon's public change feed (ActivityStreams), reduced to what the cache needs. */
export async function getRecentChanges(signal?: AbortSignal): Promise<MoonChange[]> {
  const page = await moonGet<{ orderedItems?: Array<{ id: string; type: string; published: string }> }>(
    '/resource/changes?page=1',
    signal
  );
  return (page.orderedItems || []).flatMap((item) => {
    // https://mooon.site/resource/changes/<record id>/<timestamp>
    const match = /\/resource\/changes\/([^/]+)\/[^/]+$/.exec(item.id || '');
    return match ? [{ recordId: decodeURIComponent(match[1]), type: item.type, published: item.published }] : [];
  });
}

export interface MoonChangeItem {
  recordId: string;
  /** The changed resource's URI (usually the Instance). */
  objectId?: string;
  /** The Work that Instance belongs to. */
  workId?: string;
}

/** Every page of Moon's change feed: which record each published Work and Instance URI belongs to. */
export async function getChangePages(signal?: AbortSignal): Promise<MoonChangeItem[]> {
  const items: MoonChangeItem[] = [];
  for (let page = 1; page <= 200; page++) {
    const res = await moonGet<{ orderedItems?: Array<{ id: string; object?: { id?: string; 'bf:instanceOf'?: string } }>; next?: string }>(
      `/resource/changes?page=${page}`,
      signal
    );
    for (const item of res.orderedItems || []) {
      const match = /\/resource\/changes\/([^/]+)\/[^/]+$/.exec(item.id || '');
      if (match) items.push({ recordId: decodeURIComponent(match[1]), objectId: item.object?.id, workId: item.object?.['bf:instanceOf'] });
    }
    if (!res.next) break;
  }
  return items;
}

/**
 * Where Moon keeps a record's cover. Search results do not say whether a record has one, so callers must
 * cope with a missing image (the full record's coverUrl is the authority).
 */
export function coverGuess(recordId: string): string {
  return `https://${MOON_PROJECT_ID}.supabase.co/storage/v1/object/public/covers/${encodeURIComponent(recordId)}.jpg`;
}

/** Moon's public catalogue page for a record. */
export function opacUrl(recordId: string): string {
  return `${MOON_SITE}/opac.html?work=${encodeURIComponent(recordId)}`;
}
