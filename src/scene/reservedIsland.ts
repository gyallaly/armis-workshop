import { Iso, type Ctx } from './pixel';

type Point = [number, number];

/** Decorative land reserve only: no business, building, route or hit target. */
export const RESERVED_ISLAND = {
  center: [600, 290] as Point,
  elevation: 0,
  waterElevation: -8,
  outline: [
    [554, 244], [574, 238], [584, 246], [606, 230], [621, 241],
    [639, 240], [650, 262], [642, 277], [665, 294], [653, 309],
    [655, 326], [632, 334], [618, 347], [601, 338], [578, 350],
    [565, 331], [543, 322], [551, 301], [535, 287], [545, 270],
  ] as Point[],
};

/** The submerged apron and flat top share one jagged world-space footprint. */
export function reservedIslandSkirt(): Point[] {
  const [cx, cy] = RESERVED_ISLAND.center;
  return RESERVED_ISLAND.outline.map(([x, y]) => [cx + (x - cx) * 1.06, cy + (y - cy) * 1.06]);
}

export function drawReservedIsland(ctx: Ctx, iso: Iso): void {
  const { outline, elevation, waterElevation } = RESERVED_ISLAND;
  const top = outline.map(([x, y]) => iso.p(x, y, elevation));
  const skirt = reservedIslandSkirt().map(([x, y]) => iso.p(x, y, waterElevation));
  const polygon = (points: Point[]) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
  };

  ctx.save();
  // Dark submerged apron grounds the slab without adding tall coastal boulders.
  polygon(skirt);
  ctx.fillStyle = '#1d3041';
  ctx.fill();
  ctx.strokeStyle = 'rgba(134,178,192,.23)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const edges = outline.map(([x, y], i) => ({
    i, depth: x + y + outline[(i + 1) % outline.length]![0] + outline[(i + 1) % outline.length]![1],
  })).sort((a, b) => a.depth - b.depth);
  for (const { i } of edges) {
    const next = (i + 1) % outline.length;
    polygon([top[i]!, top[next]!, skirt[next]!, skirt[i]!]);
    ctx.fillStyle = outline[next]![0] > outline[i]![0] ? '#394d5f' : '#263746';
    ctx.fill();
  }

  // One uninterrupted level surface leaves room for a future building.
  const ys = top.map(([, y]) => y);
  const material = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  material.addColorStop(0, '#516171');
  material.addColorStop(1, '#394d5f');
  polygon(top);
  ctx.fillStyle = material;
  ctx.fill();
  ctx.strokeStyle = 'rgba(162,196,203,.25)';
  ctx.lineWidth = .65;
  ctx.stroke();
  ctx.restore();
}
