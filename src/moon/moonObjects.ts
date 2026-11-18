import { useEffect, useState } from 'react';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';
import { coverGuess, MoonRecord, opacUrl, searchRecords } from './moonApi';
import { MoonCardData, readRecord } from './readRecord';
import { toIsbn13 } from './isbn';

const STORE_KEY = 'alqami-moon-objects';
const ISBN_KEY = 'alqami-moon-isbn-index';
const PAGE = 200;

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

export function publishedRecords(): Promise<MoonRecord[]> {
  published ??= allPublished().then((records) => {
    const isbns: Record<string, string> = {};
    for (const r of records)
      for (const isbn of readRecord(r, 'en').isbns) {
        const key = toIsbn13(isbn);
        if (key) isbns[key] = r.id;
      }
    try {
      localStorage.setItem(ISBN_KEY, JSON.stringify(isbns));
    } catch {
      /* ignore */
    }
    return records;
  });
  published.catch(() => {
    published = null;
  });
  return published;
}

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
    categoryLabel: pair(ar.genres[0] || 'مقتنيات مون', en.genres[0] || 'Moon Catalogue'),
    period: pair(ar.date, en.date),
    creator: pair(ar.responsibility ?? ar.contributors[0]?.label, en.responsibility ?? en.contributors[0]?.label),
    institution: pair(ar.holder || 'mooon.site', en.holder || 'mooon.site'),
    itemCode: en.shelfMarks[0] ?? en.alqamiId ?? record.id,
    uri: local?.uri ?? opacUrl(record.id),
    image: local?.image ?? en.coverUrl ?? coverGuess(record.id),
    model: { ...(local?.model ?? {}), glb: en.modelUrl || '' },
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
          const withModels = records.filter((r) => readRecord(r, 'en').modelUrl);
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(withModels));
          } catch {
            /* ignore */
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

/**
 * All scannable pictures & artifacts for Scan Mode:
 * combines all 196 ALQAMI + Al-Kafeel items AND every published mooon.site record (including photo-only records).
 */
export function useAllScanArtifacts(): AlqamiArtifact[] {
  const [artifacts, setArtifacts] = useState<AlqamiArtifact[]>(() => ALQAMI_ARTIFACTS);

  useEffect(() => {
    let live = true;
    const load = () => {
      publishedRecords()
        .then((records) => {
          if (!live) return;
          const allMoon = records.map((record) => ({ record, ar: readRecord(record, 'ar'), en: readRecord(record, 'en') }));
          const byAlqamiId = new Map(allMoon.filter((o) => o.en.alqamiId).map((o) => [o.en.alqamiId!, o]));
          const local = ALQAMI_ARTIFACTS.map((a) => {
            const o = byAlqamiId.get(a.id);
            return o ? toArtifact(o.record, o.ar, o.en, a) : a;
          });
          const extra = allMoon
            .filter((o) => !o.en.alqamiId || !ALQAMI_ARTIFACTS.some((a) => a.id === o.en.alqamiId))
            .map((o) => toArtifact(o.record, o.ar, o.en));
          setArtifacts([...local, ...extra]);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener('alqami:moon-auth-changed', load);
    return () => {
      live = false;
      window.removeEventListener('alqami:moon-auth-changed', load);
    };
  }, []);

  return artifacts;
}
