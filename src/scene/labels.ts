export interface LabelRect { x: number; y: number; width: number; height: number }
export interface LabelRequest { id: string; x: number; y: number; width: number; height: number }
export function overlaps(a: LabelRect, b: LabelRect, gap = 8): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** Nearest available placement; dimensions are measured in CSS pixels, independent of zoom. */
export function placeLabels(labels: LabelRequest[], bounds: LabelRect, obstacles: LabelRect[] = []): Map<string, LabelRect> {
  const occupied = [...obstacles];
  const result = new Map<string, LabelRect>();
  for (const label of labels) {
    const clampX = (x: number) => Math.max(bounds.x, Math.min(bounds.x + bounds.width - label.width, x));
    const clampY = (y: number) => Math.max(bounds.y, Math.min(bounds.y + bounds.height - label.height, y));
    const preferred = { x: clampX(label.x - label.width / 2), y: clampY(label.y - label.height), width: label.width, height: label.height };
    const candidates = [preferred];
    const xs = [bounds.x, bounds.x + bounds.width - label.width, preferred.x];
    const ys = [bounds.y, bounds.y + bounds.height - label.height, preferred.y];
    for (const o of occupied) { xs.push(o.x - label.width - 8, o.x + o.width + 8); ys.push(o.y - label.height - 8, o.y + o.height + 8); }
    for (const x of xs) for (const y of ys) candidates.push({ ...preferred, x: clampX(x), y: clampY(y) });
    candidates.sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y));
    const chosen = candidates.find((r) => r.width <= bounds.width && r.height <= bounds.height && !occupied.some((o) => overlaps(r, o)));
    if (chosen) { occupied.push(chosen); result.set(label.id, chosen); }
  }
  return result;
}
