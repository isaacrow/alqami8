/**
 * Turns similarity scores into one of three answers, so ALQAMI never shows a wrong record with confidence:
 * a match (only after the same answer holds for several frames), "is it one of these?" with the closest
 * candidates, or nothing.
 */

export interface IndexEntry {
  /** "moon:<record id>" or "artifact:<ALQAMI id>". */
  key: string;
  /** Unit-length reference embeddings (several views of the same object or cover). */
  views: Float32Array[];
  /** Below this score the entry is never a match (set per entry when the index is built). */
  threshold: number;
}

export interface Candidate {
  key: string;
  score: number;
}

export type Decision =
  | { kind: 'match'; key: string; score: number }
  | { kind: 'unsure'; candidates: Candidate[] }
  | { kind: 'none' };

export interface DecideOptions {
  /** The best entry must beat the runner-up by this much. */
  margin: number;
  /** Frames in a row the same entry must win before it counts as a match. */
  steadyFrames: number;
  /** Scores above this, for an entry that fails the other rules, make it an "is it one of these?" candidate. */
  candidateFloor: number;
}

// Measured on scanner-like views of Moon's covers (DINOv2-small CLS, 7 views per cover): a score of at least 0.76
// (the per-entry threshold) and a gap of at least 0.06 answered 61% of single frames with no wrong answer and no
// unknown image accepted; 3 steady frames on top. Below that, candidates above 0.6 are offered as "is it one of these?".
export const DEFAULT_DECIDE: DecideOptions = { margin: 0.06, steadyFrames: 3, candidateFloor: 0.6 };

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Every entry's best view score for one query embedding, best first. */
export function rank(query: Float32Array, entries: IndexEntry[]): Candidate[] {
  return entries
    .map((e) => ({ key: e.key, score: Math.max(...e.views.map((v) => dot(query, v))) }))
    .sort((a, b) => b.score - a.score);
}

/** Holds the last few frames' winners and decides over them. */
export class Decider {
  private streak: { key: string; count: number } | null = null;

  constructor(
    private entries: IndexEntry[],
    private options: DecideOptions = DEFAULT_DECIDE
  ) {}

  next(query: Float32Array): Decision {
    const ranked = rank(query, this.entries);
    const [best, second] = ranked;
    if (!best) return { kind: 'none' };
    const entry = this.entries.find((e) => e.key === best.key)!;
    const clear = best.score >= entry.threshold && best.score - (second?.score ?? 0) >= this.options.margin;

    if (clear) {
      this.streak = this.streak?.key === best.key ? { key: best.key, count: this.streak.count + 1 } : { key: best.key, count: 1 };
      if (this.streak.count >= this.options.steadyFrames) return { kind: 'match', key: best.key, score: best.score };
      return { kind: 'none' };
    }

    this.streak = null;
    const candidates = ranked.slice(0, 3).filter((c) => c.score >= this.options.candidateFloor);
    return candidates.length ? { kind: 'unsure', candidates } : { kind: 'none' };
  }

  reset() {
    this.streak = null;
  }
}
