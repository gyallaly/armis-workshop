import { describe, expect, it } from 'vitest';
import { overlaps, placeLabels } from '../src/scene/labels';
import { Camera } from '../src/scene/camera';

describe('screen labels', () => {
  it('keeps crowded city labels separated inside the safe viewport', () => {
    const bounds = { x: 12, y: 18, width: 820, height: 450 };
    const obstacle = { x: 12, y: 330, width: 180, height: 124 };
    const labels = Array.from({ length: 5 }, (_, i) => ({ id: String(i), x: 280 + i * 18, y: i === 0 ? -100 : 200, width: 210, height: 48 }));
    const result = [...placeLabels(labels, bounds, [obstacle]).values()];
    expect(result).toHaveLength(5);
    result.forEach((r, i) => {
      expect(r.x).toBeGreaterThanOrEqual(bounds.x);
      expect(r.y).toBeGreaterThanOrEqual(bounds.y);
      expect(r.x + r.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(r.y + r.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(overlaps(r, obstacle)).toBe(false);
      result.slice(i + 1).forEach((other) => expect(overlaps(r, other)).toBe(false));
    });
  });
  it('never stacks a label when a viewport cannot contain it', () => {
    expect(placeLabels([{ id: 'large', x: 0, y: 0, width: 200, height: 60 }], { x: 0, y: 0, width: 100, height: 100 }).size).toBe(0);
  });
});

describe('fitted camera', () => {
  it('reserves top label clearance and the actual bottom toolbar height', () => {
    const camera = new Camera(1000, 800, { x0: 100, y0: 100, x1: 700, y1: 500 });
    camera.resize(900, 600, 110);
    expect(camera.toScreen(100, 100)[1]).toBeGreaterThanOrEqual(70);
    expect(camera.toScreen(700, 500)[1]).toBeLessThanOrEqual(490);
    const point = camera.toScreen(340, 200);
    expect(camera.toWorld(...point)).toEqual([340, 200]);
  });
});
