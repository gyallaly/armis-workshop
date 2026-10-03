import { BUSINESS_BY_ID } from '../core/config';
import {
  box,
  type Ctx,
  glow,
  Iso,
  lcg,
  left,
  leftText,
  makeCanvas,
  mix,
  px,
  right,
  rightText,
  shade,
  stippleTop,
  textWidth,
  top,
} from './pixel';
import { bush, lampPost, stringLights, tree, umbrellaTable } from './sprites';

export type Pt = [number, number];

export interface BuildingHit {
  id: string;
  hull: Pt[];
  label: Pt;
  focus: Pt;
  door: Pt;
}

export interface CampusScene {
  width: number;
  height: number;
  base: HTMLCanvasElement;
  buildings: BuildingHit[];
  /** Art-pixel polylines from HQ to each business entrance. */
  routes: Record<string, Pt[]>;
  drawAmbient(ctx: Ctx, t: number, motion: boolean, taskFlow?: boolean): void;
}

export interface SceneAssets {
  uditusLockup?: HTMLImageElement;
  uditusMark?: HTMLImageElement;
}

const W = 1100;
const H = 760;

const C = {
  bg: '#070b16',
  sky: '#0b1222',
  water: '#0f2340',
  waterHi: '#183456',
  grass: '#16261d',
  grass2: '#1b2e22',
  grass3: '#223a2a',
  stone: '#363946',
  stone2: '#3e4251',
  stoneHi: '#4b5063',
  path: '#42434e',
  pathHi: '#535564',
  bank: '#2a2c36',
  bankDk: '#1d1f28',
  win: '#ffcf6e',
  winHi: '#ffe6a6',
  winDim: '#c98b3e',
  glass: '#142238',
  glassHi: '#22395a',
  cyan: '#3ee6ff',
};

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const HQ: Rect = { x0: 130, y0: 118, x1: 236, y1: 212 };
const UD: Rect = { x0: 92, y0: 300, x1: 186, y1: 392 };
const ET: Rect = { x0: 300, y0: 92, x1: 392, y1: 186 };
const PLAZA: Rect = { x0: 226, y0: 226, x1: 318, y1: 318 };
const HQ_DOOR: Pt = [214, 216];
const UD_DOOR: Pt = [188, 346];
const ET_DOOR: Pt = [346, 188];
const AL: Rect = { x0: 340, y0: 340, x1: 430, y1: 430 };
const AL_DOOR: Pt = [388, 432];

/** World-space route waypoints (on the ground). */
const ROUTES_W: Record<string, Pt[]> = {
  uditus: [HQ_DOOR, [214, 346], UD_DOOR],
  'etsy-studio': [HQ_DOOR, [346, 216], ET_DOOR],
  'aster-ledger': [HQ_DOOR, [214, 326], [328, 326], [328, 444], [388, 444], AL_DOOR],
};

export function buildCampus(assets: SceneAssets): CampusScene {
  const { canvas, ctx: baseCtx } = makeCanvas(W, H);
  let ctx = baseCtx;
  const iso = new Iso(550, 190);
  const occluders: { canvas: HTMLCanvasElement; x: number; y: number; depth: number }[] = [];
  // Cache physical objects separately so a pedestrian behind a tree or facade
  // can be concealed without rebuilding the city on every animation frame.
  const captureObject = (draw: () => void, x: number, y: number, w: number, h: number, depth: number) => {
    const layer = makeCanvas(w, h);
    const prior = ctx;
    ctx = layer.ctx;
    ctx.translate(-x, -y);
    draw();
    ctx = prior;
    ctx.drawImage(layer.canvas, x, y);
    occluders.push({ canvas: layer.canvas, x, y, depth });
  };
  const lights: { x: number; y: number; c: string; r: number; a: number }[] = [];
  const rnd = lcg(20261002);

  // Open water surrounds a single bounded island. No off-island scenery.
  ctx.fillStyle = C.water;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1900; i++) px(ctx, rnd() * W, rnd() * H, rnd() < 0.5 ? '#102642' : '#122b48', 3, 1);
  const E = 480;
  // Raised seawall grounds the island above the water plane.
  left(ctx, iso, E, 0, E, -8, 0, C.bankDk);
  right(ctx, iso, E, 0, E, -8, 0, C.bank);
  left(ctx, iso, E, 0, E, -1, 0, '#4a4d5c');
  right(ctx, iso, E, 0, E, -1, 0, '#555869');
  top(ctx, iso, 0, 0, E, E, 0, C.grass);
  stippleTop(ctx, iso, 0, 0, E, E, 0, C.grass2, 0.12, 3);
  stippleTop(ctx, iso, 0, 0, E, E, 0, C.grass3, 0.04, 5);
  // A continuous rear shoreline makes the water separation visible.
  top(ctx, iso, 0, 0, E, 6, 0, C.stone);
  top(ctx, iso, 0, 0, 6, E, 0, C.stone);

  // perimeter promenade along the water
  top(ctx, iso, 0, E - 26, E, E, 0, C.stone);
  top(ctx, iso, E - 26, 0, E, E, 0, C.stone);
  stippleTop(ctx, iso, 0, E - 26, E, E, 0, C.stone2, 0.18, 21);
  stippleTop(ctx, iso, E - 26, 0, E, E, 0, C.stone2, 0.18, 23);
  for (let i = 0; i < E; i += 10) {
    top(ctx, iso, i, E - 26, i + 1, E, 0, '#30333f');
    top(ctx, iso, E - 26, i, E, i + 1, 0, '#30333f');
  }
  // railing posts
  for (let i = 4; i < E; i += 8) {
    px(ctx, iso.x(i, E - 1), iso.y(i, E - 1) - 4, '#5a5d6e', 1, 4);
    px(ctx, iso.x(E - 1, i), iso.y(E - 1, i) - 4, '#5a5d6e', 1, 4);
  }
  for (let i = 0; i < E; i++) {
    px(ctx, iso.x(i, E - 1), iso.y(i, E - 1) - 4, '#6a6e80');
    px(ctx, iso.x(E - 1, i), iso.y(E - 1, i) - 4, '#6a6e80');
  }

  // walkways from HQ
  for (const route of Object.values(ROUTES_W)) {
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, ay] = route[i]!;
      const [bx, by] = route[i + 1]!;
      const r = { x0: Math.min(ax, bx) - 7, y0: Math.min(ay, by) - 7, x1: Math.max(ax, bx) + 7, y1: Math.max(ay, by) + 7 };
      top(ctx, iso, r.x0, r.y0, r.x1, r.y1, 0, C.path);
      stippleTop(ctx, iso, r.x0, r.y0, r.x1, r.y1, 0, C.pathHi, 0.15, ax * 31 + by);
      // edging
      top(ctx, iso, r.x0, r.y0, r.x1, r.y0 + 1, 0, '#2c2e38');
      top(ctx, iso, r.x0, r.y0, r.x0 + 1, r.y1, 0, '#2c2e38');
    }
  }
  // promenade connectors to the waterfront
  top(ctx, iso, 270, 318, 284, E - 26, 0, C.path);
  top(ctx, iso, 318, 270, E - 26, 284, 0, C.path);
  stippleTop(ctx, iso, 270, 318, 284, E - 26, 0, C.pathHi, 0.15, 99);
  stippleTop(ctx, iso, 318, 270, E - 26, 284, 0, C.pathHi, 0.15, 98);

  // plaza
  top(ctx, iso, PLAZA.x0, PLAZA.y0, PLAZA.x1, PLAZA.y1, 0, C.stone2);
  for (let i = PLAZA.x0; i <= PLAZA.x1; i += 8) {
    top(ctx, iso, i, PLAZA.y0, i + 1, PLAZA.y1, 0, C.stone);
    top(ctx, iso, PLAZA.x0, i, PLAZA.x1, i + 1, 0, C.stone);
  }
  top(ctx, iso, PLAZA.x0 + 16, PLAZA.y0 + 16, PLAZA.x1 - 16, PLAZA.y1 - 16, 0, C.stoneHi);
  stippleTop(ctx, iso, PLAZA.x0, PLAZA.y0, PLAZA.x1, PLAZA.y1, 0, '#565b70', 0.05, 17);
  // plaza planters at corners
  for (const [x, y] of [
    [PLAZA.x0 + 2, PLAZA.y1 - 14],
    [PLAZA.x1 - 14, PLAZA.y0 + 2],
    [PLAZA.x1 - 14, PLAZA.y1 - 14],
  ] as Pt[]) {
    box(ctx, iso, x, y, x + 12, y + 12, 0, 4, { top: '#1c3324', left: '#4b4e5c', right: '#3a3d49', rim: '#5d6172' });
  }

  // benches with sitters along the plaza edges
  for (const [bx, by] of [
    [PLAZA.x0 + 26, PLAZA.y1 + 2],
    [PLAZA.x0 + 60, PLAZA.y1 + 2],
    [PLAZA.x1 + 2, PLAZA.y0 + 30],
    [PLAZA.x1 + 2, PLAZA.y0 + 64],
  ] as Pt[]) {
    const sx = iso.x(bx, by);
    const sy = iso.y(bx, by);
    px(ctx, sx - 5, sy - 3, '#6b4a2f', 10, 2);
    px(ctx, sx - 5, sy - 5, '#4a321f', 10, 1);
    px(ctx, sx - 4, sy - 1, '#2a2b33', 1, 2);
    px(ctx, sx + 3, sy - 1, '#2a2b33', 1, 2);
    miniPerson(ctx, sx - 2, sy - 2, PEOPLE[(bx + by) % PEOPLE.length]!, true);
  }

  // ------------------------------------------------------------ props list
  type Prop = { wx: number; wy: number; draw: () => void; behind?: boolean };
  const props: Prop[] = [];
  const blocked: Rect[] = [
    { x0: HQ.x0 - 8, y0: HQ.y0 - 8, x1: HQ.x1 + 14, y1: HQ.y1 + 22 },
    { x0: UD.x0 - 8, y0: UD.y0 - 8, x1: UD.x1 + 46, y1: UD.y1 + 14 },
    { x0: ET.x0 - 8, y0: ET.y0 - 8, x1: ET.x1 + 14, y1: ET.y1 + 46 },
    { x0: AL.x0 - 20, y0: AL.y0 - 20, x1: AL.x1 + 14, y1: AL.y1 + 24 },
    { x0: 205, y0: 316, x1: 338, y1: 336 },
    { x0: PLAZA.x0 - 4, y0: PLAZA.y0 - 4, x1: PLAZA.x1 + 4, y1: PLAZA.y1 + 4 },
    { x0: 205, y0: 205, x1: 224, y1: 356 },
    { x0: 205, y0: 205, x1: 356, y1: 224 },
    { x0: 262, y0: 310, x1: 292, y1: E },
    { x0: 310, y0: 262, x1: E, y1: 292 },
    { x0: 0, y0: E - 30, x1: E, y1: E + 10 },
    { x0: E - 30, y0: 0, x1: E + 10, y1: E },
  ];
  const free = (x: number, y: number) => !blocked.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);

  // Trees remain inside the shoreline and clear of structures/routes.
  for (let i = 0; i < 500; i++) {
    const x = 10 + rnd() * (E - 50);
    const y = 10 + rnd() * (E - 50);
    if (!free(x, y) || rnd() < 0.12) continue;
    const size = 6 + rnd() * 5;
    const kind = rnd() < 0.15 ? 'pine' : rnd() < 0.08 ? 'blossom' : 'round';
    const seed = (rnd() * 1e9) | 0;
    props.push({ wx: x, wy: y, draw: () => tree(ctx, iso.x(x, y), iso.y(x, y), size, seed, kind) });
  }
  // blossom trees flanking the plaza front
  for (const [x, y] of [
    [330, 240],
    [198, 300],
  ] as Pt[])
    props.push({ wx: x, wy: y, draw: () => tree(ctx, iso.x(x, y), iso.y(x, y), 10, x * y, 'blossom') });
  // hedges along walkways
  for (let k = 232; k < 340; k += 9) {
    props.push({ wx: 203, wy: k, draw: () => bush(ctx, iso.x(203, k), iso.y(203, k), 5, k, k % 3 === 0 ? '#e6a3d8' : undefined) });
    props.push({ wx: k, wy: 203, draw: () => bush(ctx, iso.x(k, 203), iso.y(k, 203), 5, k * 3, k % 4 === 0 ? '#ffd27a' : undefined) });
  }

  // lamps along routes, plaza and promenade
  const lampAt = (x: number, y: number) => {
    props.push({
      wx: x,
      wy: y,
      draw: () => {
        lampPost(ctx, iso.x(x, y), iso.y(x, y));
      },
    });
    lights.push({ x: iso.x(x, y), y: iso.y(x, y) - 15, c: '#ffb54d', r: 26, a: 0.8 });
    lights.push({ x: iso.x(x, y), y: iso.y(x, y), c: '#ff9c3a', r: 18, a: 0.45 });
  };
  for (let k = 236; k <= 316; k += 26) {
    lampAt(k, 336);
  }
  for (let k = 340; k <= 440; k += 26) lampAt(318, k);
  for (let k = 236; k <= 340; k += 26) {
    lampAt(223, k);
    lampAt(k, 223);
  }
  for (const [x, y] of [
    [PLAZA.x0 + 1, PLAZA.y0 + 1],
    [PLAZA.x1 - 1, PLAZA.y1 - 1],
    [PLAZA.x0 + 1, PLAZA.y1 - 1],
    [PLAZA.x1 - 1, PLAZA.y0 + 1],
  ] as Pt[])
    lampAt(x, y);
  for (let k = 20; k < E - 20; k += 40) {
    lampAt(k, E - 24);
    lampAt(E - 24, k);
  }

  // coffee patios
  const patio = (r: Rect, color: string, seed: number) => {
    top(ctx, iso, r.x0, r.y0, r.x1, r.y1, 0, '#4a3b33');
    for (let i = r.x0; i < r.x1; i += 5) top(ctx, iso, i, r.y0, i + 1, r.y1, 0, '#3e322b');
    const pr = lcg(seed);
    for (let k = 0; k < 4; k++) {
      const x = r.x0 + 8 + pr() * (r.x1 - r.x0 - 16);
      const y = r.y0 + 8 + pr() * (r.y1 - r.y0 - 16);
      props.push({
        wx: x,
        wy: y,
        draw: () => {
          umbrellaTable(ctx, iso.x(x, y), iso.y(x, y), color);
          miniPerson(ctx, iso.x(x, y) - 6, iso.y(x, y) - 1, PEOPLE[(seed + k) % PEOPLE.length]!, true);
          if (pr() < 0.6) miniPerson(ctx, iso.x(x, y) + 6, iso.y(x, y) - 1, PEOPLE[(seed + k + 3) % PEOPLE.length]!, true);
        },
      });
      lights.push({ x: iso.x(x, y), y: iso.y(x, y) - 8, c: '#ffcf8a', r: 12, a: 0.35 });
    }
  };
  patio({ x0: UD.x1 + 6, y0: UD.y0 + 0, x1: UD.x1 + 36, y1: UD.y0 + 18 }, '#e8e2d6', 5);
  patio({ x0: UD.x1 + 6, y0: UD.y1 - 30, x1: UD.x1 + 40, y1: UD.y1 - 4 }, '#3c7ab0', 6);
  patio({ x0: ET.x0 + 10, y0: ET.y1 + 6, x1: ET.x0 + 36, y1: ET.y1 + 40 }, '#e08a4f', 7);
  patio({ x0: ET.x1 - 32, y0: ET.y1 + 6, x1: ET.x1 - 4, y1: ET.y1 + 40 }, '#efe2c8', 8);

  // ---------------------------------------------------------------- draw
  const drawProp = (p: Prop) => captureObject(p.draw, Math.floor(iso.x(p.wx, p.wy)) - 48, Math.floor(iso.y(p.wx, p.wy)) - 76, 96, 96, p.wx + p.wy);

  // fountain
  drawFountain(ctx, iso, 272, 272);

  const hits: BuildingHit[] = [];
  const drawBuilding = (r: Rect, draw: () => BuildingHit) => {
    const x = Math.floor(iso.x(r.x0, r.y1)) - 50;
    const y = Math.floor(iso.y(r.x0, r.y0)) - 220;
    captureObject(() => hits.push(draw()), x, y, r.x1 - r.x0 + r.y1 - r.y0 + 100, 340, r.x1 + r.y1);
  };
  const objects = props.map((p) => ({ depth: p.wx + p.wy, draw: () => drawProp(p) }));
  objects.push(
    { depth: HQ.x1 + HQ.y1, draw: () => drawBuilding(HQ, () => drawHQ(ctx, iso, lights)) },
    { depth: UD.x1 + UD.y1, draw: () => drawBuilding(UD, () => drawShop(ctx, iso, UD, 'uditus', lights, assets)) },
    { depth: ET.x1 + ET.y1, draw: () => drawBuilding(ET, () => drawShop(ctx, iso, ET, 'etsy-studio', lights, assets)) },
    { depth: AL.x1 + AL.y1, draw: () => drawBuilding(AL, () => drawTrading(ctx, iso, AL, lights)) },
  );
  objects.sort((a, b) => a.depth - b.depth);
  for (const object of objects) object.draw();



  // ---------------------------------------------------------------- lights
  for (const l of lights) glow(ctx, l.x, l.y, l.c, l.r, l.a);
  // lamp reflections in the water
  for (let k = 20; k < E - 20; k += 40) {
    for (const [x, y] of [
      [k, E + 8],
      [E + 8, k],
    ] as Pt[]) {
      const sx = iso.x(x, y);
      const sy = iso.y(x, y, -8);
      for (let j = 0; j < 10; j++) px(ctx, sx - 1 + ((j * 3) % 3), sy + j * 2, j % 2 ? '#6b5530' : '#a07a3e', 2 - (j % 2), 1);
    }
  }
  // static route glow (the dotted guide lines)
  const routes: Record<string, Pt[]> = {};
  for (const [id, pts] of Object.entries(ROUTES_W)) {
    routes[id] = pts.map(([x, y]) => [iso.x(x, y), iso.y(x, y)]);
  }

  // water sample points for shimmer
  const shimmer: Pt[] = [];
  for (let i = 0; i < 260; i++) {
    const side = rnd() < 0.5;
    const along = rnd() * 760 - 120;
    const off = 10 + rnd() * 160;
    const [x, y] = side ? [along, E + off] : [E + off, along];
    shimmer.push([iso.x(x, y), iso.y(x, y, -8)]);
  }
  // decorative pedestrians walking the walkways (ambient only - not workers)
  const walkers: { route: Pt[]; speed: number; phase: number; look: Look }[] = [];
  const walkRoutes: Pt[][] = [
    ...Object.values(routes),
    [[iso.x(10, E - 13), iso.y(10, E - 13)], [iso.x(E - 13, E - 13), iso.y(E - 13, E - 13)], [iso.x(E - 13, 10), iso.y(E - 13, 10)]],
    [[iso.x(PLAZA.x0, PLAZA.y1 + 8), iso.y(PLAZA.x0, PLAZA.y1 + 8)], [iso.x(PLAZA.x1 + 8, PLAZA.y1 + 8), iso.y(PLAZA.x1 + 8, PLAZA.y1 + 8)], [iso.x(PLAZA.x1 + 8, PLAZA.y0), iso.y(PLAZA.x1 + 8, PLAZA.y0)]],
  ];
  for (let i = 0; i < 22; i++) walkers.push({ route: walkRoutes[i % walkRoutes.length]!, speed: 0.006 + rnd() * 0.01, phase: rnd(), look: PEOPLE[i % PEOPLE.length]! });
  const stars: Pt[] = [];
  for (let i = 0; i < 60; i++) stars.push([rnd() * W, rnd() * 90]);
  const fountainC: Pt = [iso.x(272, 272), iso.y(272, 272)];

  return {
    width: W,
    height: H,
    base: canvas,
    buildings: hits,
    routes,
    drawAmbient(g, t, motion, taskFlow = true) {
      if (taskFlow) for (const route of Object.values(routes)) drawDotted(g, route, '#3ee6ff', 5);
      const people = walkers.map((w) => {
        const k = motion ? (w.phase + (t / 1000) * w.speed) % 2 : w.phase;
        const along = k > 1 ? 2 - k : k;
        const [x, y] = alongPath(w.route, along);
        return { w, x, y, depth: (y - iso.oy) * 2 };
      }).sort((a, b) => a.depth - b.depth);
      for (const { w, x, y, depth } of people) {
        miniPerson(g, x, y, w.look, false, motion ? Math.floor(t / 220 + w.phase * 10) % 2 : 0);
        g.save();
        g.beginPath();
        g.rect(Math.floor(x) - 5, Math.floor(y) - 14, 11, 16);
        g.clip();
        for (const layer of occluders) {
          if (layer.depth <= depth || layer.x > x + 5 || layer.x + layer.canvas.width < x - 5 || layer.y > y + 2 || layer.y + layer.canvas.height < y - 14) continue;
          g.drawImage(layer.canvas, layer.x, layer.y);
        }
        g.restore();
      }
      if (!motion) return;
      // water shimmer
      for (let i = 0; i < shimmer.length; i++) {
        const ph = (t / 900 + i * 0.37) % 4;
        if (ph < 1.2) {
          const [x, y] = shimmer[i]!;
          px(g, x, y, ph < 0.6 ? '#3a6ea3' : '#28507f', 3, 1);
        }
      }
      // twinkling stars
      for (let i = 0; i < stars.length; i++) {
        if (((t / 600 + i * 1.7) % 6) < 0.5) px(g, stars[i]![0], stars[i]![1], '#cfd8ff');
      }
      // fountain jets
      const [fx, fy] = fountainC;
      for (let j = 0; j < 14; j++) {
        const a = (j / 14) * Math.PI * 2 + t / 700;
        const r = 9 + Math.sin(t / 300 + j) * 1.5;
        px(g, fx + Math.cos(a) * r * 1.6, fy - 3 + Math.sin(a) * r * 0.8, j % 2 ? '#8fe8ff' : '#3ec5ff');
      }
      for (let j = 0; j < 6; j++) {
        const h = (t / 120 + j * 3) % 16;
        px(g, fx - 3 + j, fy - 22 + h * 0.4 - Math.sin((h / 16) * Math.PI) * 6, '#b8f3ff');
      }
    },
  };
}

function drawDotted(ctx: Ctx, pts: Pt[], color: string, gap: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d < len; d += gap) {
      const x = ax + ((bx - ax) * d) / len;
      const y = ay + ((by - ay) * d) / len;
      px(ctx, x - 1, y - 1, color, 3, 2);
      px(ctx, x, y - 1, '#c8fbff', 1, 1);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d < len; d += 8) glow(ctx, ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len, '#1fd2ff', 10, 0.45);
  }
}

function drawFountain(ctx: Ctx, iso: Iso, cx: number, cy: number) {
  const sx = iso.x(cx, cy);
  const sy = iso.y(cx, cy);
  // basin ellipse (rim + water)
  for (let y = -20; y <= 20; y++)
    for (let x = -42; x <= 42; x++) {
      const d = (x / 42) ** 2 + (y / 20) ** 2;
      if (d > 1) continue;
      const c = d > 0.8 ? '#6a6f84' : d > 0.68 ? '#4b5063' : mix('#0f5a8a', '#1a86c2', 1 - d);
      px(ctx, sx + x, sy + y, c);
    }
  // rim front thickness
  for (let x = -42; x <= 42; x++) {
    const y = Math.round(20 * Math.sqrt(Math.max(0, 1 - (x / 42) ** 2)));
    px(ctx, sx + x, sy + y, '#3b3f4e', 1, 3);
  }
  glow(ctx, sx, sy, '#38b6ff', 52, 0.85);
  // pedestal
  px(ctx, sx - 3, sy - 14, '#7d8296', 6, 14);
  px(ctx, sx - 6, sy - 15, '#9aa0b5', 12, 2);
  // globe (wireframe sphere)
  const gy = sy - 28;
  for (let y = -13; y <= 13; y++)
    for (let x = -13; x <= 13; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > 13) continue;
      const onRim = d > 12;
      const lat = Math.abs(y) % 4 === 0;
      const lon = Math.abs(Math.round(x / Math.cos(Math.asin(Math.min(1, Math.abs(y) / 13.5))))) % 4 === 0;
      if (onRim || lat || lon) px(ctx, sx + x, gy + y, onRim ? '#bfe9ff' : '#58c4ff');
      else px(ctx, sx + x, gy + y, '#123a66');
    }
  px(ctx, sx - 16, gy - 1, '#d9a441', 32, 1);
  px(ctx, sx - 1, gy - 17, '#d9a441', 2, 4);
  glow(ctx, sx, gy, '#58c4ff', 44, 1);
}

function windowGrid(
  ctx: Ctx,
  iso: Iso,
  face: 'left' | 'right',
  plane: number,
  a0: number,
  a1: number,
  z0: number,
  floors: number,
  floorH: number,
  seed: number,
  lights: { x: number; y: number; c: string; r: number; a: number }[],
  opts: { w?: number; gap?: number; litP?: number; tall?: boolean } = {},
) {
  const r = lcg(seed);
  const ww = opts.w ?? 6;
  const gap = opts.gap ?? 3;
  const wh = opts.tall ? floorH - 4 : floorH - 6;
  for (let f = 0; f < floors; f++) {
    const z = z0 + f * floorH + 3;
    for (let u = a0 + 3; u + ww <= a1 - 2; u += ww + gap) {
      const lit = r() < (opts.litP ?? 0.6);
      const c = lit ? (r() < 0.3 ? C.winHi : C.win) : C.glass;
      if (face === 'left') {
        left(ctx, iso, plane, u, u + ww, z, z + wh, c);
        left(ctx, iso, plane, u, u + ww, z + wh - 1, z + wh, lit ? '#fff1c9' : C.glassHi);
        if (lit && r() < 0.5) left(ctx, iso, plane, u + 2, u + 3, z, z + 3, '#3a2a1e');
        if (lit && r() < 0.55) left(ctx, iso, plane, u + ww - 3, u + ww - 1, z + 1, z + 3, '#5ad1ff');
        if (!lit) left(ctx, iso, plane, u + 1, u + 2, z + 2, z + wh - 2, C.glassHi);
        if (lit) lights.push({ x: iso.x(u + ww / 2, plane), y: iso.y(u + ww / 2, plane, z + wh / 2), c: '#ffbf5a', r: 10, a: 0.3 });
      } else {
        right(ctx, iso, plane, u, u + ww - 1, z, z + wh, c);
        right(ctx, iso, plane, u, u + ww - 1, z + wh - 1, z + wh, lit ? '#fff1c9' : C.glassHi);
        if (lit && r() < 0.5) right(ctx, iso, plane, u + 2, u + 2, z, z + 3, '#3a2a1e');
        if (lit && r() < 0.55) right(ctx, iso, plane, u + ww - 3, u + ww - 2, z + 1, z + 3, '#5ad1ff');
        if (!lit) right(ctx, iso, plane, u + 4, u + 4, z + 2, z + wh - 2, C.glassHi);
        if (lit) lights.push({ x: iso.x(plane, u + ww / 2), y: iso.y(plane, u + ww / 2, z + wh / 2), c: '#ffbf5a', r: 10, a: 0.25 });
      }
    }
  }
}

function hullOf(iso: Iso, r: Rect, h: number): Pt[] {
  return [
    [iso.x(r.x0, r.y0), iso.y(r.x0, r.y0, h)],
    [iso.x(r.x1, r.y0), iso.y(r.x1, r.y0, h)],
    [iso.x(r.x1, r.y0), iso.y(r.x1, r.y0)],
    [iso.x(r.x1, r.y1), iso.y(r.x1, r.y1)],
    [iso.x(r.x0, r.y1), iso.y(r.x0, r.y1)],
    [iso.x(r.x0, r.y1), iso.y(r.x0, r.y1, h)],
  ];
}

function drawHQ(ctx: Ctx, iso: Iso, lights: { x: number; y: number; c: string; r: number; a: number }[]): BuildingHit {
  const { x0, y0, x1, y1 } = HQ;
  const stone = { top: '#3c465c', left: '#303a50', right: '#212c40', rim: '#6b7a96' };
  const tower = { x0: x0 + 22, y0: y0 + 12, x1: x1 - 22, y1: y0 + 62 };
  const th = 124;
  // Continuous grounded podium, with a reserved sign band above its lobby.
  box(ctx, iso, x0, y0, x1, y1, 0, 28, stone);
  storefront(ctx, iso, 'left', y1, x0 + 5, x1 - 5, lights, 31, 14);
  storefront(ctx, iso, 'right', x1, y0 + 5, y1 - 5, lights, 32, 14);
  for (const z of [2, 15, 26]) {
    left(ctx, iso, y1, x0, x1, z, z + 1, '#697b96');
    right(ctx, iso, x1, y0, y1, z, z + 1, '#4a5b77');
  }
  // Roof terrace belongs to the podium; no freestanding/floating wings.
  top(ctx, iso, x0 + 3, y0 + 3, x1 - 3, y1 - 3, 28, '#253448');
  for (let u = x0 + 5; u < x1 - 4; u += 8) top(ctx, iso, u, y0 + 64, u + 1, y1 - 4, 28, '#33465b');
  for (const u of [x0 + 8, x1 - 12]) {
    box(ctx, iso, u, y1 - 16, u + 7, y1 - 8, 28, 32, { top: '#244335', left: '#45536a', right: '#2f3c50' });
    bush(ctx, iso.x(u + 3, y1 - 12), iso.y(u + 3, y1 - 12, 32), 4, u);
  }
  // Central command tower. Horizontal blank band is reserved for the emblem.
  box(ctx, iso, tower.x0, tower.y0, tower.x1, tower.y1, 28, th, stone);
  for (const z of [32, 44, 56, 94, 106]) {
    windowGrid(ctx, iso, 'left', tower.y1, tower.x0 + 4, tower.x1 - 4, z, 1, 12, z, lights, { w: 6, gap: 3, litP: 0.72, tall: true });
    windowGrid(ctx, iso, 'right', tower.x1, tower.y0 + 4, tower.y1 - 4, z, 1, 12, z + 3, lights, { w: 6, gap: 3, litP: 0.62, tall: true });
  }
  for (const z of [29, 42, 54, 66, 90, 104, 116, 123]) {
    left(ctx, iso, tower.y1, tower.x0, tower.x1, z, z + 1, '#687c9a');
    right(ctx, iso, tower.x1, tower.y0, tower.y1, z, z + 1, '#435773');
  }
  for (const u of [tower.x0 + 1, tower.x1 - 2]) left(ctx, iso, tower.y1, u, u + 1, 29, th, '#9aabc1');
  for (const u of [tower.y0 + 1, tower.y1 - 2]) right(ctx, iso, tower.x1, u, u + 1, 29, th, '#6c829e');
  const ex = (tower.x0 + tower.x1) / 2;
  left(ctx, iso, tower.y1, tower.x0 + 4, tower.x1 - 4, 69, 88, '#17283e');
  left(ctx, iso, tower.y1, ex - 1, ex + 1, 71, 85, '#f2c56b');
  for (let k = 0; k < 7; k++) {
    const len = 13 - k;
    left(ctx, iso, tower.y1, ex - len - 2, ex - 2, 83 - k * 1.5, 84 - k * 1.5, '#f2c56b');
    left(ctx, iso, tower.y1, ex + 2, ex + len + 2, 83 - k * 1.5, 84 - k * 1.5, '#ffe2a1');
  }
  rightText(ctx, iso, tower.x1, tower.y1 - 5, 83, 'ARMIS', '#b5cee7', 1);
  lights.push({ x: iso.x(ex, tower.y1), y: iso.y(ex, tower.y1, 78), c: '#efbd67', r: 24, a: 0.5 });
  // Stepped crown, grounded equipment and an architectural beacon.
  box(ctx, iso, tower.x0 - 1, tower.y0 - 1, tower.x1 + 1, tower.y1 + 1, th, th + 3, { top: '#677d97', left: '#9db3cc', right: '#607994' });
  box(ctx, iso, tower.x0 + 7, tower.y0 + 7, tower.x1 - 7, tower.y1 - 7, th + 3, th + 9, { top: '#283b50', left: '#3d526a', right: '#24394e', rim: '#b49b63' });
  box(ctx, iso, ex - 4, tower.y0 + 19, ex + 4, tower.y0 + 27, th + 9, th + 18, { top: '#e5cd91', left: '#ad8b4e', right: '#806839' });
  const bx = iso.x(ex, tower.y0 + 23), by = iso.y(ex, tower.y0 + 23, th + 18);
  px(ctx, bx, by - 8, '#9eb3c9', 1, 8);
  px(ctx, bx - 1, by - 10, '#e8d39d', 3, 2);
  lights.push({ x: bx, y: by - 9, c: '#edcf83', r: 13, a: 0.5 });
  // Facade sign stays within the podium instead of spilling past its edge.
  const sign = BUSINESS_BY_ID['hermes-hq']!.brand.signText;
  const tw = textWidth(sign, 1), sx = x0 + (x1 - x0 - tw) / 2;
  left(ctx, iso, y1, sx - 4, sx + tw + 4, 17, 25, '#172638');
  leftText(ctx, iso, y1, sx, 24, sign, '#e5d5ab', 1);
  // Warm double-door lobby with a supported canopy; entry route stays at grade.
  left(ctx, iso, y1, HQ_DOOR[0] - 7, HQ_DOOR[0] + 7, 0, 14, '#adbdbe');
  left(ctx, iso, y1, HQ_DOOR[0] - 6, HQ_DOOR[0] + 6, 1, 13, '#ecd8a7');
  left(ctx, iso, y1, HQ_DOOR[0], HQ_DOOR[0] + 1, 0, 14, '#47576c');
  top(ctx, iso, HQ_DOOR[0] - 10, y1, HQ_DOOR[0] + 10, y1 + 5, 15, '#53687f');
  for (const u of [HQ_DOOR[0] - 10, HQ_DOOR[0] + 9]) left(ctx, iso, y1 + 5, u, u + 1, 0, 15, '#71869c');
  top(ctx, iso, HQ_DOOR[0] - 8, y1, HQ_DOOR[0] + 8, y1 + 8, 0, '#59697b');
  lights.push({ x: iso.x(HQ_DOOR[0], y1), y: iso.y(HQ_DOOR[0], y1, 7), c: '#e8c884', r: 22, a: 0.65 });
  return { id: 'hermes-hq', hull: hullOf(iso, HQ, th + 28),
    label: [iso.x(tower.x0, tower.y0), iso.y(tower.x0, tower.y0, th + 8)],
    focus: [iso.x((x0 + x1) / 2, (y0 + y1) / 2), iso.y((x0 + x1) / 2, (y0 + y1) / 2, 55)],
    door: [iso.x(...HQ_DOOR), iso.y(...HQ_DOOR)] };
}

function drawShop(
  ctx: Ctx,
  iso: Iso,
  r: Rect,
  id: 'uditus' | 'etsy-studio',
  lights: { x: number; y: number; c: string; r: number; a: number }[],
  assets: SceneAssets,
): BuildingHit {
  const brand = BUSINESS_BY_ID[id]!.brand;
  const isU = id === 'uditus';
  const wall = isU
    ? { top: '#24344f', left: '#1f2d45', right: '#152036', rim: '#3c5a86' }
    : { top: '#3d3330', left: '#352c2a', right: '#271f1e', rim: '#6b554a' };
  const h = 50;
  const floors = 3;
  const fh = 13;
  box(ctx, iso, r.x0, r.y0, r.x1, r.y1, 0, h, wall);
  // ground-floor storefront
  const frontFace: 'left' | 'right' = isU ? 'right' : 'left';
  storefront(ctx, iso, 'left', r.y1, r.x0, r.x1, lights, isU ? 41 : 51);
  storefront(ctx, iso, 'right', r.x1, r.y0, r.y1, lights, isU ? 42 : 52);
  windowGrid(ctx, iso, 'left', r.y1, r.x0, r.x1, 14, floors - 1, fh, isU ? 43 : 53, lights, { w: 6, gap: 3, litP: 0.6 });
  windowGrid(ctx, iso, 'right', r.x1, r.y0, r.y1, 14, floors - 1, fh, isU ? 44 : 54, lights, { w: 6, gap: 3, litP: 0.55 });
  left(ctx, iso, r.y1, r.x0, r.x1, 13, 14, wall.rim);
  right(ctx, iso, r.x1, r.y0, r.y1, 13, 14, wall.rim);
  // Continuous cornice and structural piers give each studio a grounded facade.
  for (const z of [1, 27, h - 2]) {
    left(ctx, iso, r.y1, r.x0, r.x1, z, z + 2, wall.rim);
    right(ctx, iso, r.x1, r.y0, r.y1, z, z + 2, shade(wall.rim, 0.8));
  }
  for (const u of [r.x0 + 1, r.x1 - 3]) left(ctx, iso, r.y1, u, u + 2, 0, h, shade(wall.rim, 1.2));
  for (const u of [r.y0 + 1, r.y1 - 3]) right(ctx, iso, r.x1, u, u + 2, 0, h, wall.rim);
  // awning
  const aw = isU ? '#1B4F80' : '#a85a35';
  const aw2 = isU ? '#3C7AB0' : '#d98a55';
  for (let u = r.x0 + 2; u < r.x1 - 2; u++) left(ctx, iso, r.y1 + 3, u, u + 1, 12, 14, (u >> 2) % 2 ? aw : aw2);
  for (let u = r.y0 + 2; u < r.y1 - 2; u++) right(ctx, iso, r.x1 + 3, u, u, 12, 14, (u >> 2) % 2 ? aw : aw2);
  // door
  if (frontFace === 'right') {
    right(ctx, iso, r.x1, UD_DOOR[1] - 7, UD_DOOR[1] + 7, 0, 12, '#63829c');
    right(ctx, iso, r.x1, UD_DOOR[1] - 5, UD_DOOR[1] + 5, 0, 11, '#e9d6ad');
    right(ctx, iso, r.x1, UD_DOOR[1], UD_DOOR[1] + 1, 0, 11, '#41546c');
  } else {
    left(ctx, iso, r.y1, ET_DOOR[0] - 7, ET_DOOR[0] + 7, 0, 12, '#b27d51');
    left(ctx, iso, r.y1, ET_DOOR[0] - 5, ET_DOOR[0] + 5, 0, 11, '#e9d6ad');
    left(ctx, iso, r.y1, ET_DOOR[0], ET_DOOR[0] + 1, 0, 11, '#70523c');
  }
  // roof
  top(ctx, iso, r.x0 + 2, r.y0 + 2, r.x1 - 2, r.y1 - 2, h, shade(wall.top, 0.8));
  box(ctx, iso, r.x0 + 8, r.y0 + 8, r.x0 + 20, r.y0 + 18, h, h + 6, { top: '#596079', left: '#454b60', right: '#343849' });
  box(ctx, iso, r.x0 + 26, r.y0 + 8, r.x0 + 34, r.y0 + 16, h, h + 4, { top: '#596079', left: '#454b60', right: '#343849' });
  // setback upper tier (penthouse) with its own windows
  const tier: Rect = { x0: r.x0 + 6, y0: r.y0 + 6, x1: r.x0 + 40, y1: r.y0 + 44 };
  box(ctx, iso, tier.x0, tier.y0, tier.x1, tier.y1, h, h + 18, { ...wall, rim: wall.rim });
  windowGrid(ctx, iso, 'left', tier.y1, tier.x0, tier.x1, h, 1, 16, isU ? 61 : 71, lights, { w: 7, gap: 2, litP: 0.8, tall: true });
  windowGrid(ctx, iso, 'right', tier.x1, tier.y0, tier.y1, h, 1, 16, isU ? 62 : 72, lights, { w: 7, gap: 2, litP: 0.75, tall: true });
  // roof terrace with string lights + plants
  top(ctx, iso, r.x0 + 40, r.y0 + 40, r.x1 - 4, r.y1 - 4, h, '#4a3b33');
  for (let k = 0; k < 3; k++) umbrellaTableAt(ctx, iso, r.x0 + 52 + k * 14, r.y1 - 16, h, k % 2 ? '#3c7ab0' : '#e8e2d6');
  for (let k = 0; k < 6; k++) {
    const bx = r.x0 + 44 + ((k * 11) % (r.x1 - r.x0 - 50));
    const by = r.y0 + 44 + ((k * 7) % (r.y1 - r.y0 - 50));
    bush(ctx, iso.x(bx, by), iso.y(bx, by, h), 4, k * 5 + (isU ? 1 : 2), k % 2 ? '#ffd27a' : undefined);
  }
  stringLights(ctx, iso.x(r.x0 + 40, r.y1 - 4), iso.y(r.x0 + 40, r.y1 - 4, h + 8), iso.x(r.x1 - 4, r.y1 - 4), iso.y(r.x1 - 4, r.y1 - 4, h + 8), 3);
  stringLights(ctx, iso.x(r.x1 - 4, r.y1 - 4), iso.y(r.x1 - 4, r.y1 - 4, h + 8), iso.x(r.x1 - 4, r.y0 + 40), iso.y(r.x1 - 4, r.y0 + 40, h + 8), 3);
  lights.push({ x: iso.x(r.x1 - 20, r.y1 - 20), y: iso.y(r.x1 - 20, r.y1 - 20, h + 6), c: '#ffd27a', r: 26, a: 0.4 });

  // signage
  if (isU && assets.uditusLockup) {
    // Real Uditus lockup (white on navy), sheared onto the right-facing wall.
    const img = assets.uditusLockup;
    const signW = 66;
    const signH = Math.round((signW * img.height) / img.width);
    const ys = r.y1 - 14; // start of sign along wy (runs toward smaller wy)
    const zTop = h - 6;
    // navy panel
    right(ctx, iso, r.x1, ys - signW - 4, ys + 4, zTop - signH - 6, zTop + 2, brand.colors.primary);
    right(ctx, iso, r.x1, ys - signW - 4, ys + 4, zTop + 1, zTop + 2, brand.colors.accent);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // map image (u along sign, v down) to wall: x = ox + x1 - wy, y = oy + (x1 + wy)/2 - z
    const ox = iso.ox + r.x1 - ys;
    const oy = iso.oy + (r.x1 + ys) / 2 - zTop + 2;
    ctx.transform(1, -0.5, 0, 1, ox, oy);
    ctx.drawImage(img, 0, 0, signW, signH);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    lights.push({ x: iso.x(r.x1, ys - signW / 2), y: iso.y(r.x1, ys - signW / 2, zTop - 4), c: '#8FB6D6', r: 40, a: 0.55 });
  } else if (isU) {
    rightText(ctx, iso, r.x1, r.y1 - 14, h - 8, brand.signText, '#eaf0f4', 1);
  } else {
    const tw = textWidth(brand.signText, 1);
    const sx0 = r.x0 + (r.x1 - r.x0 - tw) / 2;
    left(ctx, iso, r.y1, sx0 - 4, sx0 + tw + 4, h - 16, h - 4, '#241a17');
    left(ctx, iso, r.y1, sx0 - 4, sx0 + tw + 4, h - 5, h - 4, '#b8875c');
    leftText(ctx, iso, r.y1, sx0, h - 7, brand.signText, '#ffe2c2', 1);
    // provisional neutral emblem: a stitched tag
    const ex = r.x0 + 5;
    left(ctx, iso, r.y1, ex, ex + 8, h - 18, h - 6, '#e08a4f');
    left(ctx, iso, r.y1, ex + 2, ex + 6, h - 16, h - 8, '#3a2a22');
    left(ctx, iso, r.y1, ex + 3, ex + 5, h - 13, h - 11, '#ffe2c2');
    lights.push({ x: iso.x(sx0 + tw / 2, r.y1), y: iso.y(sx0 + tw / 2, r.y1, h - 12), c: '#ffb070', r: 40, a: 0.55 });
  }
  if (isU && assets.uditusMark) {
    // the mark again on the left wall, flat-sheared
    const img = assets.uditusMark;
    const s = 16;
    const xs = r.x0 + 14;
    const zTop = h - 8;
    left(ctx, iso, r.y1, xs - 3, xs + s + 3, zTop - s - 3, zTop + 3, brand.colors.primary);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const ox = iso.ox + xs - r.y1;
    const oy = iso.oy + (xs + r.y1) / 2 - zTop;
    ctx.transform(1, 0.5, 0, 1, ox, oy);
    ctx.drawImage(img, 0, 0, s, Math.round((s * img.height) / img.width));
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
  const door = isU ? UD_DOOR : ET_DOOR;
  return {
    id,
    hull: hullOf(iso, r, h + 24),
    label: [iso.x((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), iso.y((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, h + 34)],
    focus: [iso.x((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), iso.y((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 20)],
    door: [iso.x(...door), iso.y(...door)],
  };
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function drawTrading(ctx: Ctx, iso: Iso, r: Rect, lights: { x: number; y: number; c: string; r: number; a: number }[]): BuildingHit {
  const brand = BUSINESS_BY_ID['aster-ledger']!.brand;
  const h = 58;
  box(ctx, iso, r.x0, r.y0, r.x1, r.y1, 0, h, { top: '#1c3438', left: '#17302f', right: '#0f2224', rim: '#3f7a80' });
  // full-height glass curtain wall with screens glowing through
  for (let z = 4; z < h - 6; z += 12) {
    for (let u = r.x0 + 3; u < r.x1 - 3; u += 7) {
      const lit = ((u * 7 + z * 3) % 5) !== 0;
      left(ctx, iso, r.y1, u, u + 6, z, z + 9, lit ? (((u + z) >> 3) % 3 === 0 ? '#5fe3d0' : '#2f8f96') : '#0c1c22');
      if (lit && (u + z) % 3 === 0) left(ctx, iso, r.y1, u + 1, u + 5, z + 6, z + 7, '#f2b84b');
    }
    for (let u = r.y0 + 3; u < r.y1 - 3; u += 7) {
      const lit = ((u * 5 + z) % 4) !== 0;
      right(ctx, iso, r.x1, u, u + 5, z, z + 9, lit ? '#246a70' : '#0b1a1e');
    }
    left(ctx, iso, r.y1, r.x0, r.x1, z + 10, z + 11, '#3f7a80');
    right(ctx, iso, r.x1, r.y0, r.y1, z + 10, z + 11, '#2f6066');
  }
  lights.push({ x: iso.x((r.x0 + r.x1) / 2, r.y1), y: iso.y((r.x0 + r.x1) / 2, r.y1, 24), c: '#5fe3d0', r: 60, a: 0.45 });
  // Slim bronze mullions frame the trading hall rather than floating over it.
  for (let u = r.x0 + 2; u < r.x1; u += 14) left(ctx, iso, r.y1, u, u + 1, 0, h - 9, '#73918b');
  for (let u = r.y0 + 2; u < r.y1; u += 14) right(ctx, iso, r.x1, u, u + 1, 0, h - 9, '#476d6d');
  left(ctx, iso, r.y1, r.x0, r.x1, 1, 3, '#526f6b');
  right(ctx, iso, r.x1, r.y0, r.y1, 1, 3, '#365653');
  // amber / cyan ticker band
  for (let u = r.x0; u < r.x1; u += 2) left(ctx, iso, r.y1, u, u + 1, h - 8, h - 5, (u >> 2) % 3 === 0 ? '#5fe3d0' : '#f2b84b');
  for (let u = r.y0; u <= r.y1; u += 2) right(ctx, iso, r.x1, u, u, h - 8, h - 5, (u >> 2) % 3 === 0 ? '#5fe3d0' : '#f2b84b');
  lights.push({ x: iso.x(r.x1, r.y1), y: iso.y(r.x1, r.y1, h - 6), c: '#f2b84b', r: 34, a: 0.45 });
  // entrance
  left(ctx, iso, r.y1, AL_DOOR[0] - 8, AL_DOOR[0] + 8, 0, 14, '#6f9b95');
  left(ctx, iso, r.y1, AL_DOOR[0] - 6, AL_DOOR[0] + 6, 0, 12, '#e0d3a6');
  left(ctx, iso, r.y1, AL_DOOR[0], AL_DOOR[0] + 1, 0, 12, '#3f615c');
  lights.push({ x: iso.x(AL_DOOR[0], r.y1), y: iso.y(AL_DOOR[0], r.y1, 5), c: '#ffc860', r: 26, a: 0.7 });
  // roof: market board billboard + antenna
  top(ctx, iso, r.x0 + 2, r.y0 + 2, r.x1 - 2, r.y1 - 2, h, '#13272a');
  box(ctx, iso, r.x0 + 10, r.y0 + 10, r.x0 + 70, r.y0 + 14, h, h + 22, { top: '#2b4549', left: '#061214', right: '#0f2224', rim: '#5fe3d0' });
  for (let k = 0; k < 6; k++) left(ctx, iso, r.y0 + 14, r.x0 + 14 + k * 9, r.x0 + 20 + k * 9, h + 6 + (k % 3) * 4, h + 8 + (k % 3) * 4, k % 2 ? '#f2b84b' : '#5fe3d0');
  lights.push({ x: iso.x(r.x0 + 40, r.y0 + 14), y: iso.y(r.x0 + 40, r.y0 + 14, h + 12), c: '#5fe3d0', r: 30, a: 0.5 });
  px(ctx, iso.x(r.x1 - 12, r.y0 + 12), iso.y(r.x1 - 12, r.y0 + 12, h) - 24, '#6a7392', 1, 24);
  px(ctx, iso.x(r.x1 - 12, r.y0 + 12) - 1, iso.y(r.x1 - 12, r.y0 + 12, h) - 26, '#ff5a5a', 3, 2);
  // sign + prominent PAPER plate
  const sign = brand.signText;
  const tw = textWidth(sign, 1);
  const ys = r.y1 - 8;
  right(ctx, iso, r.x1, ys - tw - 6, ys + 2, h - 22, h - 11, '#061214');
  rightText(ctx, iso, r.x1, ys - 2, h - 14, sign, '#f2d58a', 1);
  right(ctx, iso, r.x1, ys - 30, ys - 4, h - 34, h - 25, '#3a1020');
  rightText(ctx, iso, r.x1, ys - 7, h - 27, 'PAPER', '#ff9ac8', 1);
  // provisional emblem: a pixel star on the left wall
  const ex = r.x0 + 14;
  const ez = h - 14;
  left(ctx, iso, r.y1, ex - 6, ex + 7, ez - 12, ez + 2, '#0a1a1c');
  left(ctx, iso, r.y1, ex, ex + 1, ez - 10, ez, '#f2b84b');
  left(ctx, iso, r.y1, ex - 4, ex + 5, ez - 6, ez - 4, '#f2b84b');
  left(ctx, iso, r.y1, ex - 2, ex + 3, ez - 8, ez - 2, '#f2b84b');
  return {
    id: 'aster-ledger',
    hull: hullOf(iso, r, h + 26),
    label: [iso.x(r.x1 + 10, r.y0 + 20), iso.y(r.x1 + 10, r.y0 + 20, h + 6)],
    focus: [iso.x((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), iso.y((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 24)],
    door: [iso.x(...AL_DOOR), iso.y(...AL_DOOR)],
  };
}

interface Look {
  skin: string;
  top: string;
  legs: string;
  hair: string;
}

const PEOPLE: Look[] = [
  { skin: '#e0ac82', top: '#3c7ab0', legs: '#22283a', hair: '#2b1d14' },
  { skin: '#8d5a3b', top: '#c0703a', legs: '#2a2420', hair: '#111111' },
  { skin: '#f1c7a3', top: '#7a5c8f', legs: '#2c2533', hair: '#8a3b1f' },
  { skin: '#a8714a', top: '#4f7a52', legs: '#1f2229', hair: '#3b2416' },
  { skin: '#efc9a8', top: '#d8d2c4', legs: '#353b52', hair: '#c98b3a' },
  { skin: '#6b4126', top: '#a8433a', legs: '#22201e', hair: '#1a1a1a' },
];

/** Tiny decorative campus figure (5x10 art px), feet at (x, y). */
function miniPerson(ctx: Ctx, x: number, y: number, l: Look, sitting: boolean, frame = 0) {
  const X = Math.round(x) - 2;
  const Y = Math.round(y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(X - 1, Y - 1, 6, 1);
  if (sitting) {
    px(ctx, X + 1, Y - 3, l.legs, 3, 2);
    px(ctx, X, Y - 7, l.top, 5, 4);
    px(ctx, X + 1, Y - 10, l.skin, 3, 3);
    px(ctx, X + 1, Y - 11, l.hair, 3, 1);
    return;
  }
  px(ctx, X + (frame ? 0 : 1), Y - 4, l.legs, 1, 4);
  px(ctx, X + (frame ? 3 : 2), Y - 4, l.legs, 1, 4);
  px(ctx, X, Y - 8, l.top, 5, 4);
  px(ctx, X + 1, Y - 11, l.skin, 3, 3);
  px(ctx, X + 1, Y - 12, l.hair, 3, 1);
}

function alongPath(pts: Pt[], k: number): Pt {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  let d = k * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const seg = Math.hypot(bx - ax, by - ay);
    if (d <= seg) return [ax + ((bx - ax) * d) / seg, ay + ((by - ay) * d) / seg];
    d -= seg;
  }
  return pts[pts.length - 1]!;
}

function umbrellaTableAt(ctx: Ctx, iso: Iso, x: number, y: number, z: number, color: string) {
  umbrellaTable(ctx, iso.x(x, y), iso.y(x, y, z), color);
}

/**
 * Ground-floor glass curtain wall: warm lit panes with desk, monitor and
 * person silhouettes, so you can see into the building as in the mockup.
 */
function storefront(ctx: Ctx, iso: Iso, face: 'left' | 'right', plane: number, a0: number, a1: number, lights: { x: number; y: number; c: string; r: number; a: number }[], seed: number, h = 12) {
  const r = lcg(seed);
  const paneW = 12;
  const fill = (u0: number, u1: number, z0: number, z1: number, c: string) =>
    face === 'left' ? left(ctx, iso, plane, u0, u1, z0, z1, c) : right(ctx, iso, plane, u0, u1 - 1, z0, z1, c);
  for (let u = a0 + 2; u + paneW <= a1 - 1; u += paneW + 1) {
    fill(u, u + paneW, 1, h, '#f3c46a');
    fill(u, u + paneW, h - 2, h, '#ffe2a6');
    // interior: desk, glowing monitor, a seated person
    fill(u + 2, u + 9, 2, 4, '#5a3d26');
    if (r() < 0.8) fill(u + 4, u + 7, 4, 7, '#1b2433');
    if (r() < 0.8) fill(u + 5, u + 6, 5, 6, '#5ad1ff');
    if (r() < 0.6) {
      fill(u + 8, u + 10, 2, 6, '#2b2230');
      fill(u + 8, u + 10, 6, 8, '#3a2a1e');
    }
    // mullion
    fill(u + paneW, u + paneW + 1, 0, h, '#3a3f4e');
    const mid = u + paneW / 2;
    lights.push(face === 'left' ? { x: iso.x(mid, plane), y: iso.y(mid, plane, h / 2), c: '#ffbf5a', r: 16, a: 0.35 } : { x: iso.x(plane, mid), y: iso.y(plane, mid, h / 2), c: '#ffbf5a', r: 16, a: 0.3 });
  }
}
