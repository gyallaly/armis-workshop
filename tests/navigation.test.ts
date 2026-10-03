import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearSegment, navigate } from '../src/scene/navigation';

describe('interior navigation', () => {
  const furniture = [{ x0: 20, y0: 20, x1: 40, y1: 40 }];
  const floor = ([x, y]: [number, number]) => x >= 0 && x <= 60 && y >= 0 && y <= 60;
  it('routes around furniture and keeps every segment clear', () => {
    const from: [number, number] = [10, 30];
    const path = navigate(from, [50, 30], furniture, floor);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual([50, 30]);
    for (let i = 0; i < path.length; i++) expect(clearSegment(i === 0 ? from : path[i - 1]!, path[i]!, furniture)).toBe(true);
    expect(navigate(from, [50, 30], furniture, floor)).toEqual(path);
  });
  it('rejects routes through an impassable wall', () => {
    expect(navigate([10, 30], [50, 30], [{ x0: 28, y0: -1, x1: 32, y1: 61 }], floor)).toEqual([]);
  });
  it('uses a real doorway instead of cutting across the wall', () => {
    const walls = [{ x0: 28, y0: -1, x1: 32, y1: 22 }, { x0: 28, y0: 38, x1: 32, y1: 61 }];
    const path = navigate([10, 10], [50, 10], walls, floor, [[30, 30]]);
    expect(path.length).toBeGreaterThan(1);
    let previous: [number, number] = [10, 10];
    for (const p of path) { expect(clearSegment(previous, p, walls)).toBe(true); previous = p; }
  });
  it('does not leave the walkable floor to bypass furniture', () => {
    expect(navigate([10, 30], [50, 30], furniture, ([x, y]) => x >= 0 && x <= 60 && y >= 25 && y <= 35)).toEqual([]);
  });
});


import { buildInterior } from '../src/scene/interior';
import { BUSINESSES } from '../src/core/config';

describe('configured interior clearance', () => {
  beforeAll(() => {
    const gradient = { addColorStop() {} };
    const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient' ? () => gradient : () => {} });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  });
  afterAll(() => vi.unstubAllGlobals());
  for (const business of BUSINESSES) it(business.id + ' connects every seat and lounge spot to the corridor', () => {
    const scene = buildInterior(business, {});
    for (const from of scene.rooms) for (const to of scene.rooms) {
      if (from === to) continue;
      expect(scene.route(from.departmentId, to.departmentId).length, from.kind + " to " + to.kind).toBeGreaterThan(1);
      expect(scene.route(from.departmentId, to.departmentId).at(-1)).toEqual(to.center);
    }
    for (const target of [...scene.rooms.flatMap((r) => r.seats.map((s) => s.at)), ...scene.lounge.map((s) => s.at)]) {
      expect(scene.walk(scene.entrance, target), JSON.stringify(target)).not.toHaveLength(0);
    }
  });
});
