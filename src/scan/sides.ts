/**
 * Which side of an object the visitor is looking at, from the azimuth of the rendered view that matched
 * (scripts/render-object-views.mjs: 0 = the model's front, 90 = its left side, 180 its back).
 *
 * Per-side notes are written by the cataloguer in Moon as ordinary notes in this form (moon3 itself is unchanged):
 *   AR 180°: النقش المسماري على الظهر
 *   AR 90: Inscription on the left side
 * A note shows when the visitor's view is within 50° of its angle.
 */
export type Side = 'front' | 'left' | 'back' | 'right';

export const SIDE_NAMES: Record<Side, { ar: string; en: string }> = {
  front: { ar: 'الوجه الأمامي', en: 'the front' },
  left: { ar: 'الجانب الأيسر', en: 'its left side' },
  back: { ar: 'الظهر', en: 'the back' },
  right: { ar: 'الجانب الأيمن', en: 'its right side' },
};

const norm = (a: number) => ((a % 360) + 360) % 360;

/** `front` is the azimuth of the object's front in its model (e.g. the 3D viewer's starting angle); default 0. */
export function sideOf(angle: number, front = 0): Side {
  const rel = norm(angle - front);
  if (rel < 45 || rel >= 315) return 'front';
  if (rel < 135) return 'left';
  if (rel < 225) return 'back';
  return 'right';
}

const AR_NOTE = /^\s*AR\s*(\d{1,3})\s*°?\s*[:：\-–]\s*(.+)$/i;

/** The catalogue's notes for the side in view. */
export function sideNotes(notes: string[], angle: number, front = 0): string[] {
  const rel = norm(angle - front);
  return notes
    .map((n) => AR_NOTE.exec(n))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .filter((m) => {
      const d = Math.abs(norm(Number(m[1]) - rel));
      return Math.min(d, 360 - d) <= 50;
    })
    .map((m) => m[2].trim());
}

/** Notes without the AR side notes (those are shown on the label instead). */
export const plainNotes = (notes: string[]) => notes.filter((n) => !AR_NOTE.test(n));
