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
  drawAmbient(ctx: Ctx, t: number, motion: boolean): void;
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
  const { canvas, ctx } = makeCanvas(W, H);
  const iso = new Iso(550, 190);
  const lights: { x: number; y: number; c: string; r: number; a: number }[] = [];
  const rnd = lcg(20261002);

  // ---------------------------------------------------------------- ground
  ctx.fillStyle = "#0c1611";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) px(ctx, rnd() * W, rnd() * H, rnd() < 0.5 ? "#101d16" : "#0a130e", 2, 1);
  // water everywhere, ground on top
  top(ctx, iso, -400, -400, 900, 900, -8, C.water);
  stippleTop(ctx, iso, -100, -100, 800, 800, -8, '#10223a', 0.03, 7);
  // far bank (behind the island), dark lawn
  top(ctx, iso, -420, -420, 520, 520, 0, '#111d17');
  // embankment along the front edges of the island
  const E = 520;
  left(ctx, iso, E, -420, E, -8, 0, C.bankDk);
  right(ctx, iso, E, -420, E, -8, 0, C.bank);
  for (let i = -400; i < E; i += 6) {
    left(ctx, iso, E, i, i + 1, -8, 0, '#17181f');
    right(ctx, iso, E, i, i, -8, 0, '#22242d');
  }
  left(ctx, iso, E, -420, E, -1, 0, '#4a4d5c');
  right(ctx, iso, E, -420, E, -1, 0, '#555869');

  // island lawn with texture
  top(ctx, iso, 0, 0, E, E, 0, C.grass);
  stippleTop(ctx, iso, 0, 0, E, E, 0, C.grass2, 0.12, 3);
  stippleTop(ctx, iso, 0, 0, E, E, 0, C.grass3, 0.04, 5);
  stippleTop(ctx, iso, -420, -420, 0, E, 0, '#15241b', 0.05, 9);
  stippleTop(ctx, iso, 0, -420, E, 0, 0, '#15241b', 0.05, 11);

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

  // ------------------------------------------------- back-bank city & trees
  const far: [number, number, number, number, number][] = [];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 20; i++) {
      if (rnd() < 0.3) continue;
      const a = -50 - row * 70 - rnd() * 20;
      const b = -100 + i * 32 + rnd() * 8;
      const dims: [number, number, number] = [18 + rnd() * 14, 18 + rnd() * 14, 14 + rnd() * (row === 0 ? 26 : 50)];
      far.push([a, b, ...dims]);
      if (rnd() < 0.85) far.push([b, a, ...dims]);
    }
  far.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [x, y, w, d, h] of far) {
    const wall = mix('#141a2b', '#1c2335', rnd());
    box(ctx, iso, x, y, x + w, y + d, 0, h, { top: shade(wall, 1.2), left: wall, right: shade(wall, 0.75) });
    for (let z = 6; z < h - 4; z += 7)
      for (let u = 2; u < w - 2; u += 4) {
        if (rnd() < 0.34) {
          left(ctx, iso, y + d, x + u, x + u + 2, z, z + 3, rnd() < 0.7 ? C.winDim : C.win);
          lights.push({ x: iso.x(x + u, y + d), y: iso.y(x + u, y + d, z + 1), c: '#ffb54d', r: 6, a: 0.25 });
        }
      }
    for (let z = 6; z < h - 4; z += 7)
      for (let u = 2; u < d - 2; u += 4) if (rnd() < 0.15) right(ctx, iso, x + w, y + u, y + u + 1, z, z + 3, C.winDim);
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

  // trees: island + back bank
  for (let i = 0; i < 420; i++) {
    const back = i < 260;
    const x = back ? -40 + rnd() * 560 : 6 + rnd() * (E - 40);
    const y = back ? (rnd() < 0.5 ? -40 + rnd() * 36 : -40 + rnd() * 560) : 6 + rnd() * (E - 40);
    if (back && x > -2 && y > -2) continue;
    if (!back && !free(x, y)) continue;
    if (!back && rnd() < 0.35) continue;
    const size = back ? 7 + rnd() * 5 : 6 + rnd() * 5;
    const kind = rnd() < (back ? 0.4 : 0.15) ? 'pine' : rnd() < 0.08 ? 'blossom' : 'round';
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
      props.push({ wx: x, wy: y, draw: () => umbrellaTable(ctx, iso.x(x, y), iso.y(x, y), color) });
      lights.push({ x: iso.x(x, y), y: iso.y(x, y) - 8, c: '#ffcf8a', r: 12, a: 0.35 });
    }
  };
  patio({ x0: UD.x1 + 6, y0: UD.y0 + 0, x1: UD.x1 + 36, y1: UD.y0 + 18 }, '#e8e2d6', 5);
  patio({ x0: UD.x1 + 6, y0: UD.y1 - 30, x1: UD.x1 + 40, y1: UD.y1 - 4 }, '#3c7ab0', 6);
  patio({ x0: ET.x0 + 10, y0: ET.y1 + 6, x1: ET.x0 + 36, y1: ET.y1 + 40 }, '#e08a4f', 7);
  patio({ x0: ET.x1 - 32, y0: ET.y1 + 6, x1: ET.x1 - 4, y1: ET.y1 + 40 }, '#efe2c8', 8);

  // ---------------------------------------------------------------- draw
  const behind = (p: Prop) => [HQ, UD, ET].some((b) => p.wx < b.x1 && p.wy < b.y1 && p.wx > b.x0 - 60 && p.wy > b.y0 - 60);
  props.sort((a, b) => a.wx + a.wy - (b.wx + b.wy));
  for (const p of props) if (behind(p)) p.draw();

  // fountain
  drawFountain(ctx, iso, 272, 272);

  const hits: BuildingHit[] = [];
  hits.push(drawHQ(ctx, iso, lights));
  hits.push(drawShop(ctx, iso, UD, 'uditus', lights, assets));
  hits.push(drawShop(ctx, iso, ET, 'etsy-studio', lights, assets));
  hits.push(drawTrading(ctx, iso, AL, lights));

  for (const p of props) if (!behind(p)) p.draw();

  // bridge over the water (front right)
  drawBridge(ctx, iso, lights);

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
    drawDotted(ctx, routes[id]!, '#1fb8d6', 4);
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
  const stars: Pt[] = [];
  for (let i = 0; i < 60; i++) stars.push([rnd() * W, rnd() * 90]);
  const fountainC: Pt = [iso.x(272, 272), iso.y(272, 272)];

  return {
    width: W,
    height: H,
    base: canvas,
    buildings: hits,
    routes,
    drawAmbient(g, t, motion) {
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
      px(ctx, x, y, color, 2, 1);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d < len; d += 12) glow(ctx, ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len, '#1fd2ff', 7, 0.25);
  }
}

function drawFountain(ctx: Ctx, iso: Iso, cx: number, cy: number) {
  const sx = iso.x(cx, cy);
  const sy = iso.y(cx, cy);
  // basin ellipse (rim + water)
  for (let y = -14; y <= 14; y++)
    for (let x = -30; x <= 30; x++) {
      const d = (x / 30) ** 2 + (y / 14) ** 2;
      if (d > 1) continue;
      const c = d > 0.8 ? '#6a6f84' : d > 0.68 ? '#4b5063' : mix('#0f5a8a', '#1a86c2', 1 - d);
      px(ctx, sx + x, sy + y, c);
    }
  // rim front thickness
  for (let x = -30; x <= 30; x++) {
    const y = Math.round(14 * Math.sqrt(Math.max(0, 1 - (x / 30) ** 2)));
    px(ctx, sx + x, sy + y, '#3b3f4e', 1, 3);
  }
  glow(ctx, sx, sy, '#38b6ff', 34, 0.7);
  // pedestal
  px(ctx, sx - 3, sy - 10, '#7d8296', 6, 10);
  px(ctx, sx - 5, sy - 11, '#9aa0b5', 10, 2);
  // globe (wireframe sphere)
  const gy = sy - 22;
  for (let y = -9; y <= 9; y++)
    for (let x = -9; x <= 9; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > 9) continue;
      const onRim = d > 8;
      const lat = Math.abs(y) % 4 === 0;
      const lon = Math.abs(Math.round(x / Math.cos(Math.asin(Math.min(1, Math.abs(y) / 9.5))))) % 4 === 0;
      if (onRim || lat || lon) px(ctx, sx + x, gy + y, onRim ? '#bfe9ff' : '#58c4ff');
      else px(ctx, sx + x, gy + y, '#123a66');
    }
  px(ctx, sx - 11, gy - 1, '#d9a441', 22, 1);
  px(ctx, sx - 1, gy - 12, '#d9a441', 2, 3);
  glow(ctx, sx, gy, '#58c4ff', 30, 0.9);
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
        if (!lit) left(ctx, iso, plane, u + 1, u + 2, z + 2, z + wh - 2, C.glassHi);
        if (lit) lights.push({ x: iso.x(u + ww / 2, plane), y: iso.y(u + ww / 2, plane, z + wh / 2), c: '#ffbf5a', r: 10, a: 0.3 });
      } else {
        right(ctx, iso, plane, u, u + ww - 1, z, z + wh, c);
        right(ctx, iso, plane, u, u + ww - 1, z + wh - 1, z + wh, lit ? '#fff1c9' : C.glassHi);
        if (lit && r() < 0.5) right(ctx, iso, plane, u + 2, u + 2, z, z + 3, '#3a2a1e');
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
  const wall = { top: '#323a52', left: '#2a3046', right: '#1d2133', rim: '#4a5578' };
  const { x0, y0, x1, y1 } = HQ;
  // podium
  box(ctx, iso, x0, y0, x1, y1, 0, 10, { top: '#3a4158', left: '#30364a', right: '#232838', rim: '#565f80' });
  // wings
  const wingL: Rect = { x0: x0 + 4, y0: y0 + 50, x1: x0 + 52, y1: y1 - 4 };
  const wingR: Rect = { x0: x0 + 56, y0: y0 + 4, x1: x1 - 4, y1: y0 + 46 };
  const tower: Rect = { x0: x0 + 10, y0: y0 + 8, x1: x0 + 62, y1: y0 + 58 };
  for (const [wr, h, seed] of [
    [wingR, 64, 11],
    [wingL, 64, 12],
  ] as [Rect, number, number][]) {
    box(ctx, iso, wr.x0, wr.y0, wr.x1, wr.y1, 10, h, wall);
    windowGrid(ctx, iso, 'left', wr.y1, wr.x0, wr.x1, 10, 4, 13, seed, lights, { w: 7, gap: 2, litP: 0.7, tall: true });
    windowGrid(ctx, iso, 'right', wr.x1, wr.y0, wr.y1, 10, 4, 13, seed + 1, lights, { w: 7, gap: 2, litP: 0.65, tall: true });
    for (let z = 23; z < h; z += 13) {
      left(ctx, iso, wr.y1, wr.x0, wr.x1, z, z + 1, '#4a5578');
      right(ctx, iso, wr.x1, wr.y0, wr.y1, z, z + 1, '#3a4360');
    }
    // roof garden
    top(ctx, iso, wr.x0 + 3, wr.y0 + 3, wr.x1 - 3, wr.y1 - 3, h, '#1d3324');
    stippleTop(ctx, iso, wr.x0 + 3, wr.y0 + 3, wr.x1 - 3, wr.y1 - 3, h, '#2e5a37', 0.25, seed);
    for (let k = 0; k < 5; k++) {
      const bx = wr.x0 + 8 + ((k * 13 + seed) % (wr.x1 - wr.x0 - 14));
      const by = wr.y0 + 8 + ((k * 17 + seed * 3) % (wr.y1 - wr.y0 - 14));
      bush(ctx, iso.x(bx, by), iso.y(bx, by, h), 4, k + seed, k % 2 ? '#ffd27a' : undefined);
    }
    stringLights(ctx, iso.x(wr.x0, wr.y1), iso.y(wr.x0, wr.y1, h + 6), iso.x(wr.x1, wr.y1), iso.y(wr.x1, wr.y1, h + 6), 3);
    stringLights(ctx, iso.x(wr.x1, wr.y1), iso.y(wr.x1, wr.y1, h + 6), iso.x(wr.x1, wr.y0), iso.y(wr.x1, wr.y0, h + 6), 3);
    lights.push({ x: iso.x(wr.x1, wr.y1), y: iso.y(wr.x1, wr.y1, h + 4), c: '#ffd27a', r: 22, a: 0.35 });
  }
  // tower
  const th = 118;
  box(ctx, iso, tower.x0, tower.y0, tower.x1, tower.y1, 10, th, { top: '#363f5a', left: '#2c3349', right: '#1f2436', rim: '#55618a' });
  windowGrid(ctx, iso, 'left', tower.y1, tower.x0, tower.x1, 64, 4, 13, 21, lights, { w: 8, gap: 2, litP: 0.75, tall: true });
  windowGrid(ctx, iso, 'right', tower.x1, tower.y0, tower.y1, 64, 4, 13, 22, lights, { w: 8, gap: 2, litP: 0.7, tall: true });
  for (let z = 64; z < th; z += 13) {
    left(ctx, iso, tower.y1, tower.x0, tower.x1, z, z + 1, '#55618a');
    right(ctx, iso, tower.x1, tower.y0, tower.y1, z, z + 1, '#404a6a');
  }
  // provisional winged emblem on the tower's left face (pixel art, gold)
  const ex = (tower.x0 + tower.x1) / 2;
  const ez = 50;
  const gold = '#e2a83a';
  const goldHi = '#ffd77a';
  left(ctx, iso, tower.y1, ex - 1, ex + 1, ez - 22, ez + 6, gold);
  for (let k = 0; k < 14; k++) {
    const len = 14 - k;
    left(ctx, iso, tower.y1, ex - 2 - len, ex - 2, ez - k * 0.9, ez - k * 0.9 + 1, k % 3 ? gold : goldHi);
    left(ctx, iso, tower.y1, ex + 2, ex + 2 + len, ez - k * 0.9, ez - k * 0.9 + 1, k % 3 ? gold : goldHi);
  }
  for (let k = 0; k < 6; k++) {
    left(ctx, iso, tower.y1, ex - 3 + (k % 2) * 4, ex - 1 + (k % 2) * 4, ez - 6 - k * 3, ez - 4 - k * 3, goldHi);
  }
  left(ctx, iso, tower.y1, ex - 2, ex + 2, ez + 6, ez + 9, goldHi);
  lights.push({ x: iso.x(ex, tower.y1), y: iso.y(ex, tower.y1, ez - 4), c: '#ffc04a', r: 36, a: 0.9 });
  // roof: dish + antenna + parapet
  top(ctx, iso, tower.x0 + 2, tower.y0 + 2, tower.x1 - 2, tower.y1 - 2, th, '#2a3045');
  box(ctx, iso, tower.x0 + 6, tower.y0 + 6, tower.x0 + 16, tower.y0 + 16, th, th + 6, { top: '#5a6382', left: '#454d68', right: '#353b52' });
  const dx = iso.x(tower.x0 + 30, tower.y0 + 26);
  const dy = iso.y(tower.x0 + 30, tower.y0 + 26, th);
  px(ctx, dx, dy - 10, '#5b6380', 2, 10);
  for (let yy = -10; yy <= 10; yy++)
    for (let xx = -12; xx <= 12; xx++) {
      const d = (xx / 12) ** 2 + (yy / 10) ** 2;
      if (d <= 1 && xx - yy * 0.6 > -4) px(ctx, dx + xx, dy - 24 + yy, d > 0.75 ? '#c7cede' : mix('#9aa3bb', '#e8edf7', (xx + 12) / 24));
    }
  px(ctx, dx - 6, dy - 30, '#ff5a5a', 2, 2);
  lights.push({ x: dx - 5, y: dy - 29, c: '#ff4a4a', r: 8, a: 0.8 });
  px(ctx, iso.x(tower.x1 - 8, tower.y0 + 10), iso.y(tower.x1 - 8, tower.y0 + 10, th) - 26, '#6a7392', 1, 26);
  // sign over the entrance (podium, left face): provisional "HERMES HQ"
  const sign = BUSINESS_BY_ID['hermes-hq']!.brand.signText;
  const tw = textWidth(sign, 2);
  const sx0 = HQ_DOOR[0] - tw / 2;
  left(ctx, iso, y1, sx0 - 4, sx0 + tw + 4, 26, 42, '#141828');
  left(ctx, iso, y1, sx0 - 4, sx0 + tw + 4, 41, 42, '#5a6690');
  leftText(ctx, iso, y1 + 0, sx0, 38, sign, '#f4f2ea', 2);
  lights.push({ x: iso.x(HQ_DOOR[0], y1), y: iso.y(HQ_DOOR[0], y1, 34), c: '#9fb8ff', r: 26, a: 0.35 });
  // entrance: glass lobby + stairs
  left(ctx, iso, y1, HQ_DOOR[0] - 14, HQ_DOOR[0] + 14, 0, 22, '#ffd98f');
  for (let u = HQ_DOOR[0] - 14; u < HQ_DOOR[0] + 14; u += 5) left(ctx, iso, y1, u, u + 1, 0, 22, '#7a5a2e');
  left(ctx, iso, y1, HQ_DOOR[0] - 5, HQ_DOOR[0] + 5, 0, 14, '#fff0c8');
  lights.push({ x: iso.x(HQ_DOOR[0], y1), y: iso.y(HQ_DOOR[0], y1, 6), c: '#ffc860', r: 34, a: 0.9 });
  for (let s = 0; s < 4; s++) {
    box(ctx, iso, HQ_DOOR[0] - 16, y1 + s * 2, HQ_DOOR[0] + 16, y1 + s * 2 + 2, 0, 8 - s * 2, {
      top: '#5c6176',
      left: '#454a5c',
      right: '#383c4b',
    });
  }
  // podium windows on right face
  windowGrid(ctx, iso, 'right', x1, y0, y1, 0, 1, 10, 31, lights, { w: 6, gap: 3, litP: 0.8 });
  const hull = hullOf(iso, HQ, th + 30);
  return {
    id: 'hermes-hq',
    hull,
    label: [iso.x(tower.x0, tower.y0), iso.y(tower.x0, tower.y0, th + 34)],
    focus: [iso.x((x0 + x1) / 2, (y0 + y1) / 2), iso.y((x0 + x1) / 2, (y0 + y1) / 2, 50)],
    door: [iso.x(...HQ_DOOR), iso.y(...HQ_DOOR)],
  };
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
  windowGrid(ctx, iso, 'left', r.y1, r.x0, r.x1, 2, 1, 12, isU ? 41 : 51, lights, { w: 9, gap: 2, litP: 0.95, tall: true });
  windowGrid(ctx, iso, 'right', r.x1, r.y0, r.y1, 2, 1, 12, isU ? 42 : 52, lights, { w: 9, gap: 2, litP: 0.95, tall: true });
  windowGrid(ctx, iso, 'left', r.y1, r.x0, r.x1, 14, floors - 1, fh, isU ? 43 : 53, lights, { w: 6, gap: 3, litP: 0.6 });
  windowGrid(ctx, iso, 'right', r.x1, r.y0, r.y1, 14, floors - 1, fh, isU ? 44 : 54, lights, { w: 6, gap: 3, litP: 0.55 });
  left(ctx, iso, r.y1, r.x0, r.x1, 13, 14, wall.rim);
  right(ctx, iso, r.x1, r.y0, r.y1, 13, 14, wall.rim);
  // awning
  const aw = isU ? '#1B4F80' : '#a85a35';
  const aw2 = isU ? '#3C7AB0' : '#d98a55';
  for (let u = r.x0 + 2; u < r.x1 - 2; u++) left(ctx, iso, r.y1 + 3, u, u + 1, 12, 14, (u >> 2) % 2 ? aw : aw2);
  for (let u = r.y0 + 2; u < r.y1 - 2; u++) right(ctx, iso, r.x1 + 3, u, u, 12, 14, (u >> 2) % 2 ? aw : aw2);
  // door
  if (frontFace === 'right') {
    right(ctx, iso, r.x1, UD_DOOR[1] - 5, UD_DOOR[1] + 5, 0, 11, '#fff0c8');
  } else {
    left(ctx, iso, r.y1, ET_DOOR[0] - 5, ET_DOOR[0] + 5, 0, 11, '#fff0c8');
  }
  // roof
  top(ctx, iso, r.x0 + 2, r.y0 + 2, r.x1 - 2, r.y1 - 2, h, shade(wall.top, 0.8));
  box(ctx, iso, r.x0 + 8, r.y0 + 8, r.x0 + 20, r.y0 + 18, h, h + 6, { top: '#596079', left: '#454b60', right: '#343849' });
  box(ctx, iso, r.x0 + 26, r.y0 + 8, r.x0 + 34, r.y0 + 16, h, h + 4, { top: '#596079', left: '#454b60', right: '#343849' });
  // roof terrace with string lights + plants
  top(ctx, iso, r.x0 + 40, r.y0 + 40, r.x1 - 4, r.y1 - 4, h, '#4a3b33');
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
    ctx.setTransform(1, -0.5, 0, 1, ox, oy);
    ctx.drawImage(img, 0, 0, signW, signH);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    lights.push({ x: iso.x(r.x1, ys - signW / 2), y: iso.y(r.x1, ys - signW / 2, zTop - 4), c: '#8FB6D6', r: 40, a: 0.55 });
  } else if (isU) {
    rightText(ctx, iso, r.x1, r.y1 - 14, h - 8, brand.signText, '#ffffff', 2);
  } else {
    const tw = textWidth(brand.signText, 2);
    const sx0 = r.x0 + (r.x1 - r.x0 - tw) / 2;
    left(ctx, iso, r.y1, sx0 - 4, sx0 + tw + 4, h - 20, h - 4, '#241a17');
    leftText(ctx, iso, r.y1, sx0, h - 8, brand.signText, '#ffe2c2', 2);
    // provisional neutral emblem: a stitched tag
    const ex = sx0 - 14;
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
    ctx.setTransform(1, 0.5, 0, 1, ox, oy);
    ctx.drawImage(img, 0, 0, s, Math.round((s * img.height) / img.width));
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
  const door = isU ? UD_DOOR : ET_DOOR;
  return {
    id,
    hull: hullOf(iso, r, h + 14),
    label: [iso.x((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), iso.y((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, h + 34)],
    focus: [iso.x((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), iso.y((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 20)],
    door: [iso.x(...door), iso.y(...door)],
  };
}

function drawBridge(ctx: Ctx, iso: Iso, lights: { x: number; y: number; c: string; r: number; a: number }[]) {
  const y0 = 384;
  const y1 = 404;
  for (let x = 520; x < 700; x += 2) {
    const arch = Math.sin(((x - 520) / 180) * Math.PI) * 6;
    top(ctx, iso, x, y0, x + 2, y1, arch, '#5a4a3d');
    left(ctx, iso, y1, x, x + 2, arch - 5, arch, '#3e3229');
    if (x % 8 === 0) top(ctx, iso, x, y0, x + 1, y1, arch, '#4a3d33');
    // railings
    px(ctx, iso.x(x, y0), iso.y(x, y0, arch + 5), '#7a6a5a');
    px(ctx, iso.x(x, y1), iso.y(x, y1, arch + 5), '#8a7a6a');
    if (x % 20 === 0) {
      px(ctx, iso.x(x, y1), iso.y(x, y1, arch + 5), '#6a5a4a', 1, 5);
      px(ctx, iso.x(x, y0), iso.y(x, y0, arch + 5), '#6a5a4a', 1, 5);
    }
    if (x % 60 === 20) {
      lampPost(ctx, iso.x(x, y1), iso.y(x, y1, arch), 12);
      lights.push({ x: iso.x(x, y1), y: iso.y(x, y1, arch + 13), c: '#ffb54d', r: 22, a: 0.7 });
    }
  }
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

/** Aster Ledger: a glassy trading-floor building (provisional identity, PAPER trading only). */
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
  // amber / cyan ticker band
  for (let u = r.x0; u < r.x1; u += 2) left(ctx, iso, r.y1, u, u + 1, h - 8, h - 5, (u >> 2) % 3 === 0 ? '#5fe3d0' : '#f2b84b');
  for (let u = r.y0; u <= r.y1; u += 2) right(ctx, iso, r.x1, u, u, h - 8, h - 5, (u >> 2) % 3 === 0 ? '#5fe3d0' : '#f2b84b');
  lights.push({ x: iso.x(r.x1, r.y1), y: iso.y(r.x1, r.y1, h - 6), c: '#f2b84b', r: 34, a: 0.45 });
  // entrance
  left(ctx, iso, r.y1, AL_DOOR[0] - 6, AL_DOOR[0] + 6, 0, 12, '#fff0c8');
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
    label: [iso.x((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), iso.y((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, h + 40)],
    focus: [iso.x((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), iso.y((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 24)],
    door: [iso.x(...AL_DOOR), iso.y(...AL_DOOR)],
  };
}
