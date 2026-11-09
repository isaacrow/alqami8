import { useEffect, useState } from 'react';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';
import { coverGuess, MoonRecord, searchRecords } from './moonApi';
import { MoonCardData, readRecord } from './readRecord';
import { toIsbn13 } from './isbn';

/**
 * The objects ALQAMI shows are the ones catalogued in Moon with a 3D model: every published Moon record whose
 * Item (or Instance) links a .glb/.gltf file through bf:electronicLocator. Cataloguing an object in Moon is all
 * it takes for it to appear here.
 *
 * ALQAMI's built-in objects stay until their own Moon record exists; a Moon record carrying an object's ALQAMI
 * identifier (bf:Local, e.g. ALQ-HLM-004) replaces it in place, so the object's look and position stay the same.
 */

const STORE_KEY = 'alqami-moon-objects';
const ISBN_KEY = 'alqami-moon-isbn-index';
const PAGE = 200;

// Every published Moon record, a page at a time (Moon answers at most 200 per page).
async function allPublished(): Promise<MoonRecord[]> {
  const records: MoonRecord[] = [];
  for (let offset = 0; offset < 10000; offset += PAGE) {
    const page = await searchRecords('', PAGE, offset);
    records.push(...page.records);
    if (page.records.length < PAGE || records.length >= page.total) break;
  }
  return records;
}

let published: Promise<MoonRecord[]> | null = null;

/**
 * Moon's published records, fetched once per visit and shared by the gallery and the scanner. Also saves an
 * ISBN index on the device, so a book barcode opens its record without asking Moon (and with no signal).
 */
export function publishedRecords(): Promise<MoonRecord[]> {
  published ??= allPublished().then((records) => {
    const isbns: Record<string, string> = {};
    for (const r of records) for (const isbn of readRecord(r, 'en').isbns) {
      const key = toIsbn13(isbn);
      if (key) isbns[key] = r.id;
    }
    try {
      localStorage.setItem(ISBN_KEY, JSON.stringify(isbns));
    } catch {
      // Storage blocked: barcodes fall back to Moon's search.
    }
    return records;
  });
  published.catch(() => {
    published = null;
  });
  return published;
}

/** The Moon record ID saved on this device for an ISBN (as Moon catalogued it), if any. */
export function savedIsbnRecord(isbn: string): string | undefined {
  try {
    return JSON.parse(localStorage.getItem(ISBN_KEY) || '{}')[isbn];
  } catch {
    return undefined;
  }
}

function toArtifact(record: MoonRecord, ar: MoonCardData, en: MoonCardData, local?: AlqamiArtifact): AlqamiArtifact {
  const pair = (a?: string, b?: string) => ({ ar: a || b || '', en: b || a || '' });
  return {
    id: local?.id ?? `moon:${record.id}`,
    slug: local?.slug ?? record.id,
    title: pair(ar.title, en.title),
    subtitle: ar.subtitle || en.subtitle ? pair(ar.subtitle, en.subtitle) : undefined,
    category: local?.category ?? (en.isObject ? 'artifact' : 'manuscripts'),
    categoryLabel: pair(ar.genres[0], en.genres[0]),
    period: pair(ar.date, en.date),
    creator: pair(ar.responsibility ?? ar.contributors[0]?.label, en.responsibility ?? en.contributors[0]?.label),
    institution: pair(ar.holder, en.holder),
    itemCode: en.shelfMarks[0] ?? en.alqamiId ?? record.id,
    image: local?.image ?? en.coverUrl ?? coverGuess(record.id),
    model: { ...(local?.model ?? {}), glb: en.modelUrl! },
    description: pair(ar.summary, en.summary),
    details: {
      dimensions: en.dimensions ?? '',
      material: { ar: '', en: '' },
      condition: { ar: '', en: '' },
    },
    moonRecordId: record.id,
  };
}

export function merge(records: MoonRecord[]): AlqamiArtifact[] {
  const objects = records
    .map((record) => ({ record, ar: readRecord(record, 'ar'), en: readRecord(record, 'en') }))
    .filter((o) => o.en.modelUrl);
  const byAlqamiId = new Map(objects.filter((o) => o.en.alqamiId).map((o) => [o.en.alqamiId!, o]));
  const local = ALQAMI_ARTIFACTS.map((a) => {
    const o = byAlqamiId.get(a.id);
    return o ? toArtifact(o.record, o.ar, o.en, a) : a;
  });
  const extra = objects.filter((o) => !o.en.alqamiId || !ALQAMI_ARTIFACTS.some((a) => a.id === o.en.alqamiId));
  return [...local, ...extra.map((o) => toArtifact(o.record, o.ar, o.en))];
}

function savedRecords(): MoonRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

let shared: Promise<AlqamiArtifact[]> | null = null;

/** ALQAMI's objects: built-in ones until catalogued, plus everything Moon holds with a 3D model. */
export function useAlqamiArtifacts(): AlqamiArtifact[] {
  const [artifacts, setArtifacts] = useState<AlqamiArtifact[]>(() => {
    const saved = savedRecords();
    return saved.length ? merge(saved) : ALQAMI_ARTIFACTS;
  });

  useEffect(() => {
    let live = true;
    shared =
      shared ??
      publishedRecords()
        .then((records) => {
          // Keep only the records with a 3D model, so a hall with no signal still shows them.
          const withModels = records.filter((r) => readRecord(r, 'en').modelUrl);
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(withModels));
          } catch {
            // Storage full or blocked: the objects still show for this visit.
          }
          return merge(records);
        })
        .catch(() => merge(savedRecords()));
    shared.then((list) => live && setArtifacts(list));
    return () => {
      live = false;
    };
  }, []);

  return artifacts;
}
