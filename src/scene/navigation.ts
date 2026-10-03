import type { Pt } from './campus';

export interface Obstacle { x0: number; y0: number; x1: number; y1: number }

export function clearSegment(a: Pt, b: Pt, obstacles: Obstacle[]): boolean {
  return obstacles.every((r) => {
    let lo = 0; let hi = 1;
    for (let axis = 0; axis < 2; axis++) {
      const min = axis === 0 ? r.x0 : r.y0;
      const max = axis === 0 ? r.x1 : r.y1;
      const d = b[axis]! - a[axis]!;
      if (Math.abs(d) < 1e-8) { if (a[axis]! <= min || a[axis]! >= max) return true; }
      else { const t0 = (min - a[axis]!) / d; const t1 = (max - a[axis]!) / d; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
    }
    return lo >= hi || hi <= 0 || lo >= 1;
  });
}

/** Deterministic visibility graph; corners provide routes around furniture. */
export function navigate(from: Pt, to: Pt, obstacles: Obstacle[], allowed: (p: Pt) => boolean, waypoints: Pt[] = []): Pt[] {
  const contains = (r: Obstacle, p: Pt) => p[0] > r.x0 && p[0] < r.x1 && p[1] > r.y0 && p[1] < r.y1;
  // Seats can be inside sofas; their small footprint is permitted at endpoints.
  const blocks = obstacles.filter((r) => !contains(r, from) && !contains(r, to));
  const nodes: Pt[] = [from, to, ...waypoints];
  for (const r of blocks) for (const x of [r.x0 - 0.5, r.x1 + 0.5]) for (const y of [r.y0 - 0.5, r.y1 + 0.5]) {
    const p: Pt = [x, y]; if (allowed(p) && !blocks.some((o) => contains(o, p))) nodes.push(p);
  }
  const distance = nodes.map(() => Infinity); distance[0] = 0;
  const prev = nodes.map(() => -1); const done = new Set<number>();
  while (done.size < nodes.length) {
    let i = -1; for (let j = 0; j < nodes.length; j++) if (!done.has(j) && (i < 0 || distance[j]! < distance[i]!)) i = j;
    if (i < 0 || !Number.isFinite(distance[i]!)) break;
    if (i === 1) { const path: Pt[] = []; for (let k = 1; k !== 0; k = prev[k]!) path.unshift(nodes[k]!); return path; }
    done.add(i);
    for (let j = 0; j < nodes.length; j++) {
      if (done.has(j) || !clearSegment(nodes[i]!, nodes[j]!, blocks)) continue;
      const a = nodes[i]!; const b = nodes[j]!;
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
      if (Array.from({ length: steps + 1 }, (_, k) => k / Math.max(1, steps)).some((t) => !allowed([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))) continue;
      const cost = distance[i]! + Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (cost < distance[j]!) { distance[j] = cost; prev[j] = i; }
    }
  }
  return [];
}
