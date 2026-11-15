/**
 * Search over a speaker's recorded lectures (public/characters/<id>-lectures.json, built by
 * scripts/waili-lectures.mjs): passages of about a minute, ranked with BM25 over normalised Arabic words. The live
 * voice calls it as a tool, and the page shows the passages it used with a link to that second of the recording.
 */

export interface LectureHit {
  /** YouTube id and title of the lecture. */
  video: string;
  title: string;
  /** Second of the recording where the passage starts. */
  start: number;
  text: string;
  url: string;
  score: number;
}

interface LectureFile {
  lectures: Array<[string, string]>;
  passages: Array<[number, number, string]>;
}

const STOP = new Set(
  'في من على الى عن ان او ثم ما لا لم لن قد هذا هذه ذلك تلك هو هي هم انا انت نحن كان كانت يكون التي الذي الذين كل بعض اي اذا لو مع عند بين حتى كما لكن بل هل يا و ف ب ل ك شنو هاي هذي اللي هيه هواي يعني ايضا جدا قال له لها لهم به بها فيه فيها منه منها عليه عليها اليه'.split(' ')
);

/** Arabic as one spelling: no diacritics or tatweel; alef forms, taa marbuta, alef maqsura and hamza seats folded. */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

/** Words of a text, each with its common prefixes taken off (و، ف، ب، ك، ل + ال). */
export function words(s: string): string[] {
  const out: string[] = [];
  for (let w of normalizeArabic(s).split(/[^ء-يa-z0-9]+/)) {
    if (!w) continue;
    const m = w.match(/^(?:[وف]?(?:[بكل]?ال|لل))(.{2,})$/);
    if (m) w = m[1];
    else if (/^[وف].{3,}$/.test(w)) w = w.slice(1);
    if (w.length < 2 || STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

export class LectureIndex {
  private postings = new Map<string, number[]>(); // word → [passage, count, passage, count, …]
  private lengths: Uint16Array;
  private avg = 1;
  private titleWords: Array<Set<string>>;

  constructor(private data: LectureFile) {
    const n = data.passages.length;
    this.lengths = new Uint16Array(n);
    let total = 0;
    data.passages.forEach(([, , text], i) => {
      const counts = new Map<string, number>();
      const ws = words(text);
      for (const w of ws) counts.set(w, (counts.get(w) ?? 0) + 1);
      for (const [w, c] of counts) {
        let p = this.postings.get(w);
        if (!p) this.postings.set(w, (p = []));
        p.push(i, c);
      }
      this.lengths[i] = Math.min(65535, ws.length);
      total += ws.length;
    });
    this.avg = total / Math.max(1, n);
    this.titleWords = data.lectures.map(([, t]) => new Set(words(t)));
  }

  get size() {
    return this.data.passages.length;
  }

  /** How many lectures and passages there are. */
  get counts() {
    return { lectures: this.data.lectures.length, passages: this.data.passages.length };
  }

  /**
   * The best passages for a question, at most `perLecture` from one lecture (one for the voice, so its answer draws
   * on several talks; a few for the search window).
   */
  search(query: string, k = 3, perLecture = 1): LectureHit[] {
    const q = [...new Set(words(query))];
    if (!q.length) return [];
    const n = this.data.passages.length;
    const scores = new Map<number, number>();
    const k1 = 1.2;
    const b = 0.75;
    for (const w of q) {
      const p = this.postings.get(w);
      if (!p) continue;
      const df = p.length / 2;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (let j = 0; j < p.length; j += 2) {
        const i = p[j];
        const tf = p[j + 1];
        const s = (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * this.lengths[i]) / this.avg));
        scores.set(i, (scores.get(i) ?? 0) + s);
      }
    }
    // A lecture whose title is about the question (e.g. the verse it explains) counts a little more.
    for (const [i, s] of scores) {
      const tw = this.titleWords[this.data.passages[i][0]];
      const hits = q.filter((w) => tw.has(w)).length;
      if (hits) scores.set(i, s * (1 + 0.25 * hits));
    }
    const ranked = [...scores].sort((a, b2) => b2[1] - a[1]);
    const seen = new Map<number, number>();
    const out: LectureHit[] = [];
    for (const [i, score] of ranked) {
      const [li, start, text] = this.data.passages[i];
      if ((seen.get(li) ?? 0) >= perLecture) continue;
      seen.set(li, (seen.get(li) ?? 0) + 1);
      const [video, title] = this.data.lectures[li];
      out.push({ video, title, start, text, score: +score.toFixed(2), url: `https://www.youtube.com/watch?v=${video}&t=${start}s` });
      if (out.length >= k) break;
    }
    return out;
  }
}

const cache = new Map<string, Promise<LectureIndex>>();
/** Loads and indexes a lectures file once (it is a few MB: only fetched when the conversation first needs it). */
export function loadLectures(url: string): Promise<LectureIndex> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`lectures ${r.status}`);
        return r.json() as Promise<LectureFile>;
      })
      .then((d) => new LectureIndex(d));
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** m:ss or h:mm:ss, for the "listen" link. */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * The part of a passage around the searched words (about `size` words), as pieces to draw, with the searched words
 * marked. Words match after the same normalising as the search (so «الصبر» marks «والصبر» and «صبر»).
 */
export function snippet(text: string, query: string, size = 34): Array<{ t: string; hit: boolean }> {
  const want = new Set(words(query));
  const raw = text.split(/\s+/).filter(Boolean);
  const hit = raw.map((w) => {
    const ws = words(w);
    return ws.length > 0 && ws.some((x) => want.has(x));
  });
  // The window with the most marked words.
  let best = 0;
  let bestAt = 0;
  let cur = 0;
  for (let i = 0; i < raw.length; i++) {
    if (hit[i]) cur++;
    if (i >= size && hit[i - size]) cur--;
    if (cur > best) {
      best = cur;
      bestAt = Math.max(0, i - size + 1);
    }
  }
  const from = Math.max(0, Math.min(bestAt, raw.length - size));
  const to = Math.min(raw.length, from + size);
  const out: Array<{ t: string; hit: boolean }> = [];
  if (from > 0) out.push({ t: '… ', hit: false });
  for (let i = from; i < to; i++) {
    const t = raw[i] + (i < to - 1 ? ' ' : '');
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.t += t;
    else out.push({ t, hit: hit[i] });
  }
  if (to < raw.length) out.push({ t: ' …', hit: false });
  return out;
}

/** A lecture embedded in the page, starting at that second (YouTube's privacy-enhanced player). */
export function embedUrl(video: string, start: number): string {
  return `https://www.youtube-nocookie.com/embed/${video}?start=${start}&autoplay=1&playsinline=1&rel=0&modestbranding=1`;
}
