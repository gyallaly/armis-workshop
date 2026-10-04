import { afterEach, expect, it, vi } from 'vitest';
import { buildCampus, CAMPUS_FOOTPRINTS, CAMPUS_ORIGIN, pointInPoly } from '../src/scene/campus';
import { Iso, type Ctx } from '../src/scene/pixel';
import { CAMPUS_FIT, CORE_CENTER, POWER_ROUTES } from '../src/scene/powerLayout';
import { drawReservedIsland, RESERVED_ISLAND, reservedIslandSkirt } from '../src/scene/reservedIsland';

const iso = new Iso(...CAMPUS_ORIGIN);
afterEach(() => vi.unstubAllGlobals());

function canvasDocument() {
  const gradient = { addColorStop() {} };
  vi.stubGlobal('document', { createElement: () => ({
    width: 0, height: 0,
    getContext: () => new Proxy({}, {
      get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient' ? () => gradient : () => {},
    }),
  }) });
}

it('reserves a jagged, level, offshore footprint away from campus and Core supply routes', () => {
  expect(RESERVED_ISLAND.elevation).toBe(0);
  expect(RESERVED_ISLAND.waterElevation).toBe(-8);
  expect(RESERVED_ISLAND.outline.length).toBeGreaterThan(12);
  expect(pointInPoly(RESERVED_ISLAND.center, RESERVED_ISLAND.outline)).toBe(true);
  for (const [x, y] of reservedIslandSkirt()) {
    expect(x).toBeGreaterThan(520); // Open water beyond campus shoreline rocks.
    expect(Math.hypot(x - CORE_CENTER[0], y - CORE_CENTER[1])).toBeGreaterThan(82);
  }
  for (const route of Object.values(POWER_ROUTES)) {
    for (const p of route) expect(pointInPoly(p, reservedIslandSkirt())).toBe(false);
  }
  // Concave notches distinguish the shoreline from a regular oval or rectangle.
  const turns = RESERVED_ISLAND.outline.map((a, i, outline) => {
    const b = outline[(i + 1) % outline.length]!, c = outline[(i + 2) % outline.length]!;
    return Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
  });
  expect(turns).toContain(-1);
  expect(turns).toContain(1);
});

it('fits the complete island and apron inside existing fit and minimap art bounds', () => {
  for (const [points, z] of [[RESERVED_ISLAND.outline, RESERVED_ISLAND.elevation], [reservedIslandSkirt(), RESERVED_ISLAND.waterElevation]] as const) {
    for (const [x, y] of points) {
      const [px, py] = iso.p(x, y, z);
      expect(px).toBeGreaterThan(CAMPUS_FIT.x0 + 1);
      expect(px).toBeLessThan(CAMPUS_FIT.x1 - 1);
      expect(py).toBeGreaterThan(CAMPUS_FIT.y0 + 1);
      expect(py).toBeLessThan(CAMPUS_FIT.y1 - 1);
      expect(px).toBeGreaterThan(0);
      expect(px).toBeLessThan(1100);
      expect(py).toBeGreaterThan(0);
      expect(py).toBeLessThan(760);
    }
  }
});

it('keeps the reserve above the collapsed chat overlay at the campus fit', () => {
  for (const [x,y] of reservedIslandSkirt()) {
    expect(iso.p(x,y,-8)[1]).toBeLessThan(625);
  }
});

it('renders the apron, rock faces and uninterrupted flat top without buildings or props', () => {
  const polygons: [number, number][][] = [];
  let path: [number, number][] = [];
  const ctx = {
    save: vi.fn(), restore: vi.fn(),
    beginPath() { path = []; },
    moveTo(x: number, y: number) { path.push([x, y]); },
    lineTo(x: number, y: number) { path.push([x, y]); },
    closePath() {}, fill() { polygons.push([...path]); }, stroke() {},
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  drawReservedIsland(ctx as unknown as Ctx, iso);
  expect(polygons).toHaveLength(RESERVED_ISLAND.outline.length + 2);
  expect(polygons[0]).toEqual(reservedIslandSkirt().map(([x, y]) => iso.p(x, y, -8)));
  expect(polygons.at(-1)).toEqual(RESERVED_ISLAND.outline.map(([x, y]) => iso.p(x, y, 0)));
  expect(ctx.save).toHaveBeenCalledOnce();
  expect(ctx.restore).toHaveBeenCalledOnce();
});

it('adds no interactive building, entrance or operational route to the campus', () => {
  canvasDocument();
  const campus = buildCampus({});
  expect(campus.buildings.map(({ id }) => id).sort()).toEqual(Object.keys(CAMPUS_FOOTPRINTS).sort());
  expect(Object.keys(campus.routes).sort()).toEqual(['aster-ledger', 'etsy-studio', 'uditus']);
  const point = iso.p(...RESERVED_ISLAND.center);
  expect(campus.buildings.some(({ hull }) => pointInPoly(point, hull))).toBe(false);
});

it('keeps animated water shimmer off the reserved rock surface', () => {
  canvasDocument();
  const campus = buildCampus({});
  const samples: [number, number][] = [];
  const ctx = { fillRect(x: number, y: number) { samples.push([x, y]); } };
  for (const t of [0, 900, 1800, 2700]) campus.drawAmbient(ctx as unknown as Ctx, t, true);
  expect(samples.length).toBeGreaterThan(200);
  for (const [x, y] of samples) {
    // Inverse shared isometric projection at the water plane.
    const sum = 2 * (y - iso.oy - 8), difference = x - iso.ox;
    expect(pointInPoly([(sum + difference) / 2, (sum - difference) / 2], reservedIslandSkirt())).toBe(false);
  }
  samples.length = 0;
  campus.drawAmbient(ctx as unknown as Ctx, 900, false);
  expect(samples).toHaveLength(0);
});
