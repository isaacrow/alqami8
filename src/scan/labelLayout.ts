/**
 * Places the scanner's tag labels so they never cover each other: each label starts just above its object; labels
 * that overlap push each other apart (along the axis where they overlap least), up to 40 rounds per frame, and stay on
 * screen below the top bar. Positions glide from frame to frame instead of jumping. A label's point is the middle of
 * its bottom edge, where the leader line to the object starts.
 */
export interface Anchor {
  key: string;
  x: number;
  y: number;
}

const LABEL_W = 176;
const LABEL_H = 46;
const LIFT = 46;
const GAP = 6;

export class LabelLayout {
  private last = new Map<string, { x: number; y: number }>();

  place(anchors: Anchor[], width: number, height: number, top = 110): Map<string, { x: number; y: number }> {
    const pts = anchors.map((a) => ({ key: a.key, ax: a.x, x: a.x, y: a.y - LIFT }));
    const clamp = (p: { x: number; y: number }) => {
      p.x = Math.min(width - LABEL_W / 2 - 6, Math.max(LABEL_W / 2 + 6, p.x));
      p.y = Math.min(height - 120, Math.max(top + LABEL_H, p.y));
    };
    pts.forEach(clamp);
    for (let round = 0; round < 40; round++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i];
          const b = pts[j];
          const ox = LABEL_W + GAP - Math.abs(a.x - b.x);
          const oy = LABEL_H + GAP - Math.abs(a.y - b.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          // Push along the smaller overlap; the label whose object is further left goes left, the higher one goes up.
          if (ox < oy) {
            const d = (ox / 2) * (a.x < b.x || (a.x === b.x && a.ax <= b.ax) ? -1 : 1);
            a.x += d;
            b.x -= d;
          } else {
            const d = (oy / 2) * (a.y <= b.y ? -1 : 1);
            a.y += d;
            b.y -= d;
          }
          clamp(a);
          clamp(b);
        }
      if (!moved) break;
    }
    const out = new Map<string, { x: number; y: number }>();
    for (const p of pts) {
      const prev = this.last.get(p.key);
      const next = prev ? { x: prev.x + (p.x - prev.x) * 0.35, y: prev.y + (p.y - prev.y) * 0.35 } : { x: p.x, y: p.y };
      out.set(p.key, next);
    }
    this.last = out;
    return out;
  }
}
