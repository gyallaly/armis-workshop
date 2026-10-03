import { departmentForStage } from '../core/config';
import type { Business, DepartmentKind } from '../core/types';
import type { Pt, SceneAssets } from './campus';
import { box as rasterBox, type Ctx, glow, Iso, lcg, left, leftText, makeCanvas, mix, px, right, rightText, shade, stippleTop, textWidth, top } from './pixel';
import { navigate, type Obstacle } from './navigation';
import { bush, tree } from './sprites';

export interface Room {
  departmentId: string;
  kind: DepartmentKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  row: 0 | 1;
  /** Doorway point on the corridor side (world). */
  door: Pt;
  center: Pt;
  seats: Seat[];
  /** Floor polygon in art px, for hit testing. */
  hull: Pt[];
  label: Pt;
}

export interface Seat {
  at: Pt;
  /** Job folio on the desk surface, separate from the worker hit area. */
  jobAt: Pt;
  /** Monitor screen rects on plane wy = y: [x, y, width]. */
  monitors: [number, number, number][];
}

export interface LoungeSpot {
  at: Pt;
  pose: 'lounge' | 'coffee' | 'stand';
  flip: boolean;
}

export interface InteriorScene {
  businessId: string;
  width: number;
  height: number;
  base: HTMLCanvasElement;
  iso: Iso;
  rooms: Room[];
  lounge: LoungeSpot[];
  corridorY: number;
  entrance: Pt;
  exit: Pt;
  walk(from: Pt, to: Pt): Pt[];
  drawOccluders(ctx: Ctx, position: Pt): void;
  /** World route between two rooms (or entrance/exit), via doors and corridor. */
  route(from: string, to: string): Pt[];
  toScreen(p: Pt, z?: number): Pt;
  drawAmbient(ctx: Ctx, t: number, motion: boolean): void;
}

interface Solid extends Obstacle { blocking: boolean; alpha: number; canvas: HTMLCanvasElement; sx: number; sy: number }
const solidsByContext = new WeakMap<Ctx, Solid[]>();
function box(...args: Parameters<typeof rasterBox>) {
  rasterBox(...args);
  const [ctx, iso, x0, y0, x1, y1, z0, z1] = args;
  const solids = solidsByContext.get(ctx);
  if (!solids || z1 <= 0) return;
  const sx = Math.floor(iso.x(x0, y1)) - 2;
  const sy = Math.floor(iso.y(x0, y0, z1)) - 2;
  const width = Math.ceil(x1 - x0 + y1 - y0) + 5;
  const height = Math.ceil((x1 - x0 + y1 - y0) / 2 + z1) + 5;
  const layer = makeCanvas(width, height);
  const shifted = new Iso(iso.ox - sx, iso.oy - sy);
  layer.ctx.globalAlpha = ctx.globalAlpha;
  rasterBox(layer.ctx, shifted, x0, y0, x1, y1, z0, z1, args[8]);
  solids.push({ x0, y0, x1, y1, blocking: z0 <= 0, alpha: ctx.globalAlpha, canvas: layer.canvas, sx, sy });
}
const WALL_H = 60;
const PART_H = 36;
const LOW_H = 20;
const CORR_Y0 = 100;
const CORR_Y1 = 132;
const DOOR_Y0 = 44;
const DOOR_Y1 = 64;

interface RoomSpec {
  kind: DepartmentKind;
  x0: number;
  x1: number;
  row: 0 | 1;
}

function layoutFor(b: Business): RoomSpec[] {
  if (b.kind === 'hq') return [
    {kind:'leadership',x0:0,x1:110,row:0}, {kind:'finance',x0:120,x1:230,row:0}, {kind:'efficiency',x0:240,x1:360,row:0},
    {kind:'lounge',x0:0,x1:150,row:1}, {kind:'quality',x0:160,x1:250,row:1}, {kind:'operations',x0:260,x1:360,row:1},
  ];
  return [
    {kind:'leadership',x0:0,x1:100,row:0}, {kind:'research',x0:110,x1:220,row:0}, {kind:'quality',x0:230,x1:360,row:0},
    {kind:'lounge',x0:0,x1:150,row:1}, {kind:'delivery',x0:160,x1:360,row:1},
  ];
}

export function buildInterior(b: Business, assets: SceneAssets): InteriorScene {
  const W = 760;
  const H = 500;
  const iso = new Iso(300, 110);
  const { canvas, ctx } = makeCanvas(W, H);
  const lights: { x: number; y: number; c: string; r: number; a: number }[] = [];
  const isU = b.id === 'uditus';
  const isHQ = b.kind === 'hq';
  const isL = b.id === 'aster-ledger';
  const accent = b.brand.colors.accent;
  const rnd = lcg(b.id.length * 977 + 13);

  // ------------------------------------------------------------ backdrop
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#060a14');
  sky.addColorStop(1, '#0c1424');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // distant towers
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const w = 14 + rnd() * 30;
    const h = 40 + rnd() * 120;
    ctx.fillStyle = mix('#0b1220', '#121b2e', rnd());
    ctx.fillRect(Math.floor(x), Math.floor(170 - h), Math.floor(w), Math.floor(h + 400));
    for (let y = 170 - h + 4; y < H; y += 6)
      for (let xx = x + 2; xx < x + w - 2; xx += 4) if (rnd() < 0.12) px(ctx, xx, y, rnd() < 0.5 ? '#c98b3e' : '#7a5a2e', 2, 2);
  }
  // ground + trees around the building
  top(ctx, iso, -260, -200, 640, 520, -44, '#0f1a14');
  stippleTop(ctx, iso, -260, -200, 640, 520, -44, '#16261c', 0.05, 4);

  // ------------------------------------------------- building shell (lower)
  const X0 = -8;
  const X1 = 368;
  const Y0 = -8;
  const Y1 = 240;
  const shellWall = isU ? '#1a2840' : isHQ ? '#222839' : isL ? '#14292c' : '#2e2523';
  box(ctx, iso, X0, Y0, X1, Y1, -44, 0, { top: '#2a2a33', left: shade(shellWall, 1.1), right: shade(shellWall, 0.8) });
  // lower-floor windows
  for (let z = -40; z < -6; z += 14) {
    for (let u = X0 + 6; u < X1 - 8; u += 10) {
      const lit = rnd() < 0.45;
      left(ctx, iso, Y1, u, u + 6, z, z + 9, lit ? '#e9b45e' : '#142238');
      if (lit) lights.push({ x: iso.x(u + 3, Y1), y: iso.y(u + 3, Y1, z + 4), c: '#ffb54d', r: 9, a: 0.25 });
    }
    for (let u = Y0 + 6; u < Y1 - 8; u += 10) {
      const lit = rnd() < 0.4;
      right(ctx, iso, X1, u, u + 5, z, z + 9, lit ? '#d9a052' : '#122035');
    }
  }
  // brand on the exterior front-left wall
  if (isU && assets.uditusMark && assets.uditusLockup) {
    const mark = assets.uditusMark;
    const lock = assets.uditusLockup;
    const lw = 120;
    const lh = Math.round((lw * lock.height) / lock.width);
    const xs = 40;
    const zTop = -10;
    left(ctx, iso, Y1, xs - 6, xs + lw + 6, zTop - lh - 8, zTop + 4, b.brand.colors.primary);
    left(ctx, iso, Y1, xs - 6, xs + lw + 6, zTop + 3, zTop + 4, b.brand.colors.accent);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(1, 0.5, 0, 1, iso.ox + xs - Y1, iso.oy + (xs + Y1) / 2 - zTop);
    ctx.drawImage(lock, 0, 0, lw, lh);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    lights.push({ x: iso.x(xs + lw / 2, Y1), y: iso.y(xs + lw / 2, Y1, zTop - lh / 2), c: '#8FB6D6', r: 60, a: 0.45 });
    void mark;
  } else {
    const sign = b.brand.signText;
    const tw = textWidth(sign, 3);
    const xs = 30;
    left(ctx, iso, Y1, xs - 6, xs + tw + 6, -32, -6, isHQ ? '#141828' : isL ? '#0a1a1c' : '#241a17');
    leftText(ctx, iso, Y1, xs, -12, sign, isHQ ? '#f4f2ea' : isL ? '#f2d58a' : '#ffe2c2', 3);
    if (isL) {
      // prominent PAPER plate next to the sign
      const px0 = xs + tw + 14;
      left(ctx, iso, Y1, px0, px0 + 44, -30, -8, '#3a1020');
      leftText(ctx, iso, Y1, px0 + 4, -14, 'PAPER', '#ff9ac8', 2);
      // amber / cyan ticker strip along the exterior
      for (let u = X0 + 2; u < X1 - 2; u += 2) left(ctx, iso, Y1, u, u + 1, -4, -2, (u >> 3) % 3 === 0 ? '#5fe3d0' : '#f2b84b');
    }
    lights.push({ x: iso.x(xs + tw / 2, Y1), y: iso.y(xs + tw / 2, Y1, -18), c: isHQ ? '#9fb8ff' : '#ffb070', r: 50, a: 0.4 });
  }

  // ---------------------------------------------------------------- floor
  top(ctx, iso, X0, Y0, X1, Y1, 0, '#24222b');
  // corridor
  top(ctx, iso, 0, CORR_Y0, 360, CORR_Y1, 0, '#2c2b36');
  stippleTop(ctx, iso, 0, CORR_Y0, 360, CORR_Y1, 0, '#34333f', 0.2, 31);
  for (let x = 0; x < 360; x += 12) top(ctx, iso, x, CORR_Y0 + 14, x + 6, CORR_Y0 + 18, 0, '#3a3946');

  const specs = layoutFor(b);
  const rooms: Room[] = [];
  const solids: Solid[] = [];
  solidsByContext.set(ctx, solids);
  const lounge: LoungeSpot[] = [];

  for (const spec of specs) {
    const dept = b.departments.find((d) => d.kind === spec.kind)!;
    const y0 = spec.row === 0 ? 0 : CORR_Y1;
    const y1 = spec.row === 0 ? CORR_Y0 : 236;
    const { x0, x1 } = spec;
    // wood floor
    const wood = spec.kind === 'lounge' ? '#7c5435' : isL ? (spec.kind === 'audit' ? '#2e4448' : '#3a3440') : '#6c4d36';
    top(ctx, iso, x0, y0, x1, y1, 0, wood);
    for (let x = x0; x < x1; x += 5) top(ctx, iso, x, y0, x + 1, y1, 0, shade(wood, 0.82));
    for (let y = y0 + 3; y < y1; y += 17) for (let x = x0 + ((y * 7) % 10); x < x1; x += 10) top(ctx, iso, x, y, x + 5, y + 1, 0, shade(wood, 0.88));
    stippleTop(ctx, iso, x0, y0, x1, y1, 0, shade(wood, 1.12), 0.04, x0 + y0);
    if (isHQ && spec.kind !== 'lounge') {
      top(ctx, iso, x0, y0, x1, y1, 0, '#334354');
      for (let x = x0; x < x1; x += 16) top(ctx, iso, x, y0, x + 1, y1, 0, '#253442');
      for (let y = y0; y < y1; y += 16) top(ctx, iso, x0, y, x1, y + 1, 0, '#253442');
      top(ctx, iso, x0 + 3, y1 - 7, x1 - 3, y1 - 6, 0, '#ad996c');
    }

    const back = spec.row === 0 ? WALL_H : LOW_H;
    const wallL = isU ? '#6a5643' : isHQ ? '#2f3448' : isL ? '#22383c' : '#5a4636';
    const wallR = isU ? '#857058' : isHQ ? '#3a4058' : isL ? '#2b4549' : '#6e5844';
    const glass = isL && spec.kind === 'audit';
    const cap = '#14161d';
    // back-right wall (plane wy = y0) and back-left wall (plane wx = x0)
    const leftH = x0 === 0 ? back : spec.row === 0 ? PART_H : LOW_H;
    if (glass) {
      // glass audit room: tinted panes with bright mullions, taller than its neighbours
      const gh = PART_H;
      ctx.globalAlpha = 0.35;
      box(ctx, iso, x0, y0-1, (x0+x1)/2-12, y0, 0, gh, {top:'#e6fbff',left:'#7fe7ff',right:'#7fe7ff'});
      box(ctx, iso, (x0+x1)/2+12, y0-1, x1, y0, 0, gh, {top:'#e6fbff',left:'#7fe7ff',right:'#7fe7ff'});
      box(ctx, iso, x0-1, y0, x0, y1, 0, gh, {top:'#e6fbff',left:'#7fe7ff',right:'#7fe7ff'});
      ctx.globalAlpha = 1;
      for (let u = x0; u <= x1; u += 12) if (Math.abs(u-(x0+x1)/2)>=12) left(ctx, iso, y0, u, u + 1, 0, gh, '#c8f6ff');
      for (let u = y0; u <= y1; u += 12) right(ctx, iso, x0, u, u+1, 0, gh, '#c8f6ff');
      left(ctx, iso, y0, x0, x1, gh - 1, gh, '#e6fbff');
      right(ctx, iso, x0, y0, y1, gh - 1, gh, '#e6fbff');
      lights.push({ x: iso.x((x0 + x1) / 2, y0), y: iso.y((x0 + x1) / 2, y0, gh / 2), c: '#5fe3d0', r: 40, a: 0.3 });
    } else {
      if (spec.row === 1) {
        box(ctx, iso, x0 - 3, y0 - 3, (x0+x1)/2-12, y0, 0, back, { top: cap, left: wallR, right: shade(wallR, 0.7) });
        box(ctx, iso, (x0+x1)/2+12, y0 - 3, x1, y0, 0, back, { top: cap, left: wallR, right: shade(wallR, 0.7) });
      } else box(ctx, iso, x0 - 3, y0 - 3, x1, y0, 0, back, { top: cap, left: wallR, right: shade(wallR, 0.7) });
      if (spec.row === 0 && x0 > 0) {
        // doorway in the partition so work flows room to room, as in the mockup
        box(ctx, iso, x0 - 3, y0, x0, DOOR_Y0, 0, leftH, { top: cap, left: shade(wallL, 0.8), right: wallL });
        box(ctx, iso, x0 - 3, DOOR_Y1, x0, y1, 0, leftH, { top: cap, left: shade(wallL, 0.8), right: wallL });
        box(ctx, iso, x0 - 3, DOOR_Y0, x0, DOOR_Y1, leftH - 6, leftH, { top: cap, left: shade(wallL, 0.8), right: shade(wallL, 0.9) });
        top(ctx, iso, x0 - 3, DOOR_Y0, x0, DOOR_Y1, 0, '#3a3946');
      } else {
        box(ctx, iso, x0 - 3, y0, x0, y1, 0, leftH, { top: cap, left: shade(wallL, 0.8), right: wallL });
      }
    }
    // wainscot strip
    if (!glass) {
      if (spec.row === 0) left(ctx, iso, y0, x0, x1, 0, 6, shade(wallR, 0.75));
      right(ctx, iso, x0, y0, y1, 0, 6, shade(wallL, 0.75));
      if (spec.row === 0) left(ctx, iso, y0, x0, x1, 6, 7, shade(wallR, 1.15));
      right(ctx, iso, x0, y0, y1, 6, 7, shade(wallL, 1.15));
    }

    // Responsibility screens, shelves and signage own the back wall.
    // Furnish each room deliberately instead of placing windows behind them.

    const room: Room = {
      departmentId: dept.id,
      kind: spec.kind,
      x0,
      y0,
      x1,
      y1,
      row: spec.row,
      door: spec.row === 0 ? [(x0 + x1) / 2, y1] : [(x0 + x1) / 2, y0],
      center: [(x0 + x1) / 2, (y0 + y1) / 2],
      seats: [],
      hull: [
        [iso.x(x0, y0), iso.y(x0, y0, back)],
        [iso.x(x1, y0), iso.y(x1, y0, back)],
        [iso.x(x1, y1), iso.y(x1, y1)],
        [iso.x(x0, y1), iso.y(x0, y1)],
      ],
      label: [iso.x(x0 + 6, y0), iso.y(x0 + 6, y0, back + 6)],
    };
    furnish(ctx, iso, room, dept.desks, spec.kind, back, lights, lounge, accent, rnd, b);
    if (spec.row === 0 && spec.kind === 'research') wallDecor(ctx, iso, room, back, lights, rnd);
    rooms.push(room);

    // low front ledges (cutaway walls) with a door gap toward the corridor
    const ledge = { top: '#1a1c24', left: shade(wallR, 0.85), right: shade(wallL, 0.65) };
    const [dx] = room.door;
    if (spec.row === 0) {
      box(ctx, iso, x0, y1, dx - 12, y1 + 3, 0, 5, ledge);
      box(ctx, iso, dx + 12, y1, x1, y1 + 3, 0, 5, ledge);
    } else {
      box(ctx, iso, x0, y1, x1, y1 + 3, 0, 5, ledge);
    }
    if (x1 >= 360) box(ctx, iso, x1, y0, x1 + 3, y1 + 3, 0, 5, ledge);
  }
  // row-1 doorways cut into the low walls along the corridor
  for (const r of rooms.filter((r) => r.row === 1)) {
    top(ctx, iso, r.door[0] - 8, r.y0 - 3, r.door[0] + 8, r.y0, 0, '#3a3946');
  }

  // entrance (left end of corridor) and exit (right end)
  const entrance: Pt = [-6, (CORR_Y0 + CORR_Y1) / 2];
  const exit: Pt = [366, CORR_Y0 + 9];
  const rejectPt: Pt = [366, CORR_Y1 - 8];
  right(ctx, iso, 360, CORR_Y0 + 2, CORR_Y0 + 16, 0, 26, '#0f1a10');
  right(ctx, iso, 360, CORR_Y0 + 4, CORR_Y0 + 14, 2, 24, '#1e3a24');
  rightText(ctx, iso, 360, CORR_Y0 + 16, 31, isL ? 'PAPER' : 'READY', '#7dffb0', 1);
  lights.push({ x: iso.x(360, exit[1]), y: iso.y(360, exit[1], 14), c: '#3dff9a', r: 20, a: 0.4 });
  if (isL) {
    right(ctx, iso, 360, CORR_Y1 - 16, CORR_Y1 - 2, 0, 26, '#1a0c0c');
    right(ctx, iso, 360, CORR_Y1 - 14, CORR_Y1 - 4, 2, 24, '#3a1414');
    rightText(ctx, iso, 360, CORR_Y1 - 1, 31, 'REJECT', '#ff8a8a', 1);
    lights.push({ x: iso.x(360, rejectPt[1]), y: iso.y(360, rejectPt[1], 14), c: '#ff4a4a', r: 18, a: 0.35 });
  }

  // trees around the base (in front)
  for (let i = 0; i < 18; i++) {
    const x = -40 + rnd() * 460;
    const y = 252 + rnd() * 40;
    tree(ctx, iso.x(x, y), iso.y(x, y, -44), 8 + rnd() * 5, i * 31 + 7, rnd() < 0.2 ? 'pine' : 'round');
  }
  for (let i = 0; i < 10; i++) {
    const y = -30 + rnd() * 280;
    const x = 380 + rnd() * 40;
    tree(ctx, iso.x(x, y), iso.y(x, y, -44), 8 + rnd() * 5, i * 17 + 3, 'round');
  }

  // warm pools on the floor under every desk, then a vignette toward the edges
  for (const r of rooms) for (const seat of r.seats) glow(ctx, iso.x(seat.at[0], seat.at[1] - 6), iso.y(seat.at[0], seat.at[1] - 6), '#ffbe64', 40, 0.28);
  for (const l of lights) glow(ctx, l.x, l.y, l.c, l.r, l.a);
  const vg = ctx.createRadialGradient(W * 0.48, H * 0.45, H * 0.3, W * 0.48, H * 0.45, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,8,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Preserve the finished art inside each physical silhouette, including keyboard,
  // monitor frames and wall decorations, when repainting in front of a worker.
  for (const solid of solids) {
    if (solid.alpha < 1) continue;
    const finished = makeCanvas(solid.canvas.width, solid.canvas.height);
    finished.ctx.drawImage(canvas, -solid.sx, -solid.sy);
    finished.ctx.globalCompositeOperation = 'destination-in';
    finished.ctx.drawImage(solid.canvas, 0, 0);
    finished.ctx.globalCompositeOperation = 'source-over';
    solid.canvas = finished.canvas;
  }
  const roomById = new Map(rooms.map((r) => [r.departmentId, r]));
  const cy = (CORR_Y0 + CORR_Y1) / 2;
  const endpoint = (id: string): { pt: Pt; door: Pt } => {
    if (id === 'entrance') return { pt: entrance, door: entrance };
    if (id === 'exit') return { pt: exit, door: exit };
    if (id === 'reject') return { pt: rejectPt, door: rejectPt };
    const mapped = departmentForStage(b.id, id.split(':').at(-1)!);
    const r = roomById.get(id) ?? (mapped ? roomById.get(mapped) : undefined);
    if (!r) return { pt: entrance, door: entrance };
    return { pt: r.center, door: r.door };
  };

  return {
    businessId: b.id,
    width: W,
    height: H,
    base: canvas,
    iso,
    rooms,
    lounge,
    corridorY: cy,
    entrance,
    exit,
    walk(from, to) {
      const allowed = ([x,y]: Pt) => (x >= -8 && x <= 370 && y >= CORR_Y0+4 && y <= CORR_Y1-4) || rooms.some((r) => x >= r.x0+4 && x <= r.x1-4 && y >= r.y0+4 && y <= r.y1-4) || rooms.some((r) => Math.abs(x-r.door[0]) <= 8 && Math.abs(y-r.door[1]) <= 10);
      const seatApproach = (p: Pt): Pt => lounge.some((s) => s.pose === 'lounge' && s.at[0] === p[0] && s.at[1] === p[1]) ? [p[0], Math.min(p[1]+12, 231)] : p;
      const start = seatApproach(from); const end = seatApproach(to);
      const path = navigate(start, end, solids.filter((r) => r.blocking).map((r) => ({x0:r.x0-2,y0:r.y0-2,x1:r.x1+2,y1:r.y1+2})), allowed, rooms.flatMap((r): Pt[] => [r.door, [r.door[0], cy], [r.door[0], r.door[1]+(r.row === 0 ? -12 : 12)]]));
      if (!path.length) return [];
      return [...(start === from ? [] : [start]), ...path, ...(end === to ? [] : [to])];
    },
    drawOccluders(g, position) {
      for (const r of solids) if (position[0] < r.x1 && position[1] < r.y1 && position[0]+position[1] < r.x1+r.y1) g.drawImage(r.canvas,r.sx,r.sy);
    },
    route(from, to) {
      const a = endpoint(from);
      const z = endpoint(to);
      return [a.pt, ...this.walk(a.pt, z.pt)];
    },
    toScreen([x, y], z = 0) {
      return [iso.x(x, y), iso.y(x, y, z)];
    },
    drawAmbient(g, t, motion) {
      if (isL) {
        // amber / cyan ticker strips along the top of the trading-floor back walls (decorative)
        const off = motion ? Math.floor(t / 90) : 0;
        for (const r of rooms.filter((r) => r.row === 0)) {
          for (let u = r.x0 + 2; u < r.x1 - 2; u++) {
            const k = (u + off) % 14;
            if (k < 9) left(g, iso, r.y0, u, u + 1, WALL_H - 5, WALL_H - 3, k % 3 === 0 ? '#5fe3d0' : '#f2b84b');
          }
        }
      }
      if (!motion) return;
      // lounge cat tail + coffee steam
      for (const s of lounge) {
        if (s.pose !== 'coffee') continue;
        const [sx, sy] = [iso.x(s.at[0] - 10, s.at[1] - 8), iso.y(s.at[0] - 10, s.at[1] - 8, 14)];
        for (let k = 0; k < 3; k++) {
          const ph = (t / 400 + k * 0.33) % 1;
          px(g, sx + Math.sin(ph * 6 + k) * 1.5, sy - ph * 8, `rgba(230,230,240,${0.6 * (1 - ph)})`);
        }
      }
    },
  };
}

type Lights = { x: number; y: number; c: string; r: number; a: number }[];

function deskAt(ctx: Ctx, iso: Iso, x: number, y: number, monitors: number, lights: Lights, command = false): Seat {
  // desk top
  box(ctx, iso, x, y, x + 18, y + 9, 0, 9, { top: '#8a6544', left: '#6b4a30', right: '#553a25', rim: '#a07a55' });
  box(ctx, iso, x + 1, y + 1, x + 17, y + 8, 0, 8, { top: '#8a6544', left: '#2a1e17', right: '#22180f' });
  top(ctx, iso, x, y, x + 18, y + 9, 9, '#8a6544');
  top(ctx, iso, x, y, x + 18, y + 1, 9, '#a07a55');
  if (command) {
    top(ctx, iso, x, y, x + 18, y + 9, 9, '#52697e');
    top(ctx, iso, x, y, x + 18, y + 1, 9, '#a5b6c6');
    left(ctx, iso, y + 9, x, x + 18, 0, 9, '#2c4054');
    right(ctx, iso, x + 18, y, y + 9, 0, 9, '#203246');
    left(ctx, iso, y + 9, x + 2, x + 16, 7, 8, '#b3a071');
  }
  const mons: [number, number, number][] = [];
  const mw = monitors === 3 ? 5 : 7;
  for (let i = 0; i < monitors; i++) {
    const mx = x + 2 + i * (mw + 1) + (monitors === 1 ? 5 : 0);
    // monitor body (screen faces +wy, drawn dynamically)
    box(ctx, iso, mx, y + 2, mx + mw, y + 3, 9, 17, { top: '#1b1d26', left: '#0b0d14', right: '#15171f' });
    px(ctx, iso.x(mx + mw / 2, y + 3), iso.y(mx + mw / 2, y + 3, 9) - 1, '#2a2d38', 1, 2);
    mons.push([mx, y + 3, mw]);
  }
  // keyboard, mug, papers
  top(ctx, iso, x + 5, y + 5, x + 12, y + 7, 9, '#cfd3dc');
  px(ctx, iso.x(x + 15, y + 6), iso.y(x + 15, y + 6, 9) - 2, '#e8e2d6', 2, 2);
  top(ctx, iso, x + 13, y + 1, x + 17, y + 4, 9, '#efeae0');
  // desk lamp
  const lx = iso.x(x + 1, y + 2);
  const ly = iso.y(x + 1, y + 2, 9);
  px(ctx, lx, ly - 6, '#2a2d38', 1, 6);
  px(ctx, lx - 1, ly - 8, '#ffd88a', 3, 2);
  lights.push({ x: lx, y: ly - 6, c: '#ffbe5c', r: 20, a: 0.55 });
  lights.push({ x: lx + 6, y: ly + 6, c: '#ffcc80', r: 24, a: 0.25 });
  // chair
  const cx = x + 9;
  const cyy = y + 17;
  px(ctx, iso.x(cx, cyy) - 3, iso.y(cx, cyy) - 2, '#1d1f28', 7, 2);
  px(ctx, iso.x(cx, cyy) - 1, iso.y(cx, cyy) - 5, '#2a2d38', 2, 3);
  return { at: [cx, cyy], jobAt: [x + 16, y + 7], monitors: mons };
}

function plant(ctx: Ctx, iso: Iso, x: number, y: number, seed: number, big = false) {
  box(ctx, iso, x - 3, y - 3, x + 3, y + 3, 0, 6, { top: '#3a2a20', left: '#b8643c', right: '#8d4a2b' });
  const sx = iso.x(x, y);
  const sy = iso.y(x, y, 6);
  if (big) tree(ctx, sx, sy + 2, 7, seed, 'round');
  else bush(ctx, sx, sy, 6, seed);
}

function shelf(ctx: Ctx, iso: Iso, y0: number, x: number, w: number, z0: number, z1: number, rnd: () => number) {
  left(ctx, iso, y0, x, x + w, z0, z1, '#3b2a1f');
  for (let z = z0 + 2; z < z1 - 2; z += 7) {
    for (let u = x + 1; u < x + w - 1; u++) {
      const c = rnd() < 0.15 ? '#3b2a1f' : ['#a8433a', '#3c7ab0', '#d9a441', '#4f8a50', '#8a5aa8', '#d8d2c4'][Math.floor(rnd() * 6)]!;
      left(ctx, iso, y0, u, u + 1, z, z + 4 + Math.floor(rnd() * 2), c);
    }
    left(ctx, iso, y0, x, x + w, z - 1, z, '#5a4030');
  }
}

function sideShelf(ctx: Ctx, iso: Iso, x0: number, y: number, w: number, z0: number, z1: number, rnd: () => number) {
  right(ctx, iso, x0, y, y + w, z0, z1, '#33241a');
  for (let z = z0 + 2; z < z1 - 2; z += 7) {
    for (let u = y + 1; u < y + w; u++) {
      const c = rnd() < 0.2 ? '#33241a' : ['#a8433a', '#3c7ab0', '#d9a441', '#4f8a50', '#d8d2c4'][Math.floor(rnd() * 5)]!;
      right(ctx, iso, x0, u, u, z, z + 4, c);
    }
    right(ctx, iso, x0, y, y + w, z - 1, z, '#4a3426');
  }
}

function wallSign(ctx: Ctx, iso: Iso, room: Room, label: string, color: string, lights: Lights, z: number) {
  // painted onto the wall (not a neon box), with a soft wash of light
  const scale = textWidth(label, 2) <= room.x1 - room.x0 - 18 && z >= 28 ? 2 : 1;
  const tw = textWidth(label, scale);
  const x = room.x1 - tw - 10;
  ctx.globalAlpha = 0.85;
  leftText(ctx, iso, room.y0, x + 1, z - 1, label, '#2a2018', scale);
  leftText(ctx, iso, room.y0, x, z, label, mix(color, '#e8dcc0', 0.55), scale);
  ctx.globalAlpha = 1;
  lights.push({ x: iso.x(x + tw / 2, room.y0), y: iso.y(x + tw / 2, room.y0, z - 5), c: '#ffcf8a', r: 22, a: 0.3 });
}

function furnish(
  ctx: Ctx,
  iso: Iso,
  room: Room,
  desks: number,
  kind: DepartmentKind,
  wallH: number,
  lights: Lights,
  lounge: LoungeSpot[],
  accent: string,
  rnd: () => number,
  b: Business,
) {
  const { x0, y0, x1, y1 } = room;
  // ceiling light pools
  for (let x = x0 + 25; x < x1; x += 45) lights.push({ x: iso.x(x, (y0 + y1) / 2), y: iso.y(x, (y0 + y1) / 2), c: '#ffcf8a', r: 30, a: 0.22 });


  if (kind === 'lounge') {
    // rug
    const rx0 = x0 + 20;
    const ry0 = y0 + 18;
    top(ctx, iso, rx0, ry0, rx0 + 70, ry0 + 50, 0, '#5a2f3a');
    top(ctx, iso, rx0 + 3, ry0 + 3, rx0 + 67, ry0 + 47, 0, '#7a4250');
    stippleTop(ctx, iso, rx0 + 3, ry0 + 3, rx0 + 67, ry0 + 47, 0, '#8e5363', 0.1, 4);
    // sofa along back
    const sofa = { top: '#3d4f7a', left: '#33416a', right: '#283353', rim: '#5468a0' };
    box(ctx, iso, rx0 + 6, ry0 - 10, rx0 + 54, ry0 - 2, 0, 7, sofa);
    box(ctx, iso, rx0 + 6, ry0 - 14, rx0 + 54, ry0 - 10, 0, 14, sofa);
    box(ctx, iso, rx0 + 2, ry0 - 14, rx0 + 6, ry0 - 2, 0, 11, sofa);
    box(ctx, iso, rx0 + 54, ry0 - 14, rx0 + 58, ry0 - 2, 0, 11, sofa);
    // armchair (side)
    box(ctx, iso, rx0 - 14, ry0 + 14, rx0 - 4, ry0 + 28, 0, 7, sofa);
    box(ctx, iso, rx0 - 18, ry0 + 14, rx0 - 14, ry0 + 28, 0, 14, sofa);
    // coffee table
    box(ctx, iso, rx0 + 20, ry0 + 14, rx0 + 42, ry0 + 28, 0, 6, { top: '#7a5536', left: '#5a3d26', right: '#4a321f', rim: '#9a7350' });
    px(ctx, iso.x(rx0 + 28, ry0 + 20), iso.y(rx0 + 28, ry0 + 20, 6) - 2, '#efeae0', 2, 2);
    px(ctx, iso.x(rx0 + 34, ry0 + 22), iso.y(rx0 + 34, ry0 + 22, 6) - 2, '#efeae0', 2, 2);
    // coffee counter + machine on the left wall
    box(ctx, iso, x0, y0 + 8, x0 + 10, y0 + 40, 0, 12, { top: '#5a5d6e', left: '#3a3d4a', right: '#2e313c', rim: '#7a7e92' });
    box(ctx, iso, x0 + 2, y0 + 14, x0 + 8, y0 + 22, 12, 22, { top: '#2b2d38', left: '#c0392b', right: '#8e2a20' });
    px(ctx, iso.x(x0 + 8, y0 + 18), iso.y(x0 + 8, y0 + 18, 16), '#5aff9a', 1, 1);
    lights.push({ x: iso.x(x0 + 8, y0 + 18), y: iso.y(x0 + 8, y0 + 18, 16), c: '#ff9a5a', r: 14, a: 0.4 });
    // bookshelf + lamp + plants
    if (room.row === 1) shelf(ctx, iso, y0, x1 - 50, 28, 2, LOW_H - 1, rnd);
    const fl: Pt = [x1 - 14, y0 + 12];
    px(ctx, iso.x(...fl), iso.y(...fl) - 22, '#2a2d38', 1, 22);
    px(ctx, iso.x(...fl) - 3, iso.y(...fl) - 26, '#ffd88a', 7, 4);
    lights.push({ x: iso.x(...fl), y: iso.y(...fl) - 20, c: '#ffbe5c', r: 34, a: 0.75 });
    plant(ctx, iso, x0 + 8, y1 - 10, 5, true);
    plant(ctx, iso, x1 - 10, y1 - 10, 6);
    // cat (sleeping) on the rug
    const [cx, cy] = [iso.x(rx0 + 50, ry0 + 34), iso.y(rx0 + 50, ry0 + 34)];
    px(ctx, cx - 4, cy - 3, '#d98a3c', 8, 3);
    px(ctx, cx - 5, cy - 4, '#d98a3c', 3, 2);
    px(ctx, cx - 5, cy - 5, '#d98a3c', 1, 1);
    px(ctx, cx - 3, cy - 5, '#d98a3c', 1, 1);
    px(ctx, cx + 3, cy - 2, '#b06a28', 3, 1);
    px(ctx, cx - 2, cy - 3, '#b06a28', 1, 2);
    px(ctx, cx + 1, cy - 3, '#b06a28', 1, 2);
    // spots
    lounge.push({ at: [rx0 + 18, ry0 - 4], pose: 'lounge', flip: false });
    lounge.push({ at: [rx0 + 42, ry0 - 4], pose: 'lounge', flip: false });
    lounge.push({ at: [x0 + 115, y0 + 24], pose: 'lounge', flip: false });
    lounge.push({ at: [rx0 - 9, ry0 + 22], pose: 'lounge', flip: false });
    lounge.push({ at: [x0 + 18, y0 + 20], pose: 'lounge', flip: false });
    lounge.push({ at: [x0 + 16, y0 + 80], pose: 'lounge', flip: false });
    lounge.push({ at: [x0 + 125, y0 + 70], pose: 'lounge', flip: false });
    lounge.push({ at: [x0 + 75, y0 + 90], pose: 'lounge', flip: false });
    // Each permanent rest location has an actual chair, including the reading
    // corner and coffee nook. Their front approaches remain clear.
    for (const [x, y] of [[x0+115,y0+24],[x0+18,y0+20],[x0+16,y0+80],[x0+125,y0+70],[x0+75,y0+90]] as Pt[]) {
      const cloth = b.kind === 'hq' ? '#56647c' : b.id === 'etsy-studio' ? '#9c6856' : b.id === 'aster-ledger' ? '#426665' : '#68628a';
      const chair = {top:cloth,left:shade(cloth,0.8),right:shade(cloth,0.65)};
      box(ctx,iso,x-7,y-9,x+7,y-4,0,6,chair);
      box(ctx,iso,x-7,y-12,x+7,y-9,0,13,chair);
      box(ctx,iso,x-9,y-10,x-7,y-3,0,9,chair);
      box(ctx,iso,x+7,y-10,x+9,y-3,0,9,chair);
    }
    // Open book in the reading corner and cups beside the coffee station.
    top(ctx,iso,x1-43,y0+5,x1-34,y0+11,0,'#ddd4b7');
    top(ctx,iso,x1-39,y0+5,x1-38,y0+11,0,'#a59071');
    top(ctx,iso,x0+2,y0+27,x0+8,y0+33,12,'#d9d2ba');
    if (x1 - x0 > 200) {
      // HQ lounge is wide: second sofa group
      const r2 = x0 + 200;
      box(ctx, iso, r2, y0 + 8, r2 + 48, y0 + 16, 0, 7, sofa);
      box(ctx, iso, r2, y0 + 4, r2 + 48, y0 + 8, 0, 14, sofa);
      lounge.push({ at: [r2 + 14, y0 + 14], pose: 'lounge', flip: false });
      lounge.push({ at: [r2 + 30, y0 + 14], pose: 'lounge', flip: true });
      wallSign(ctx, iso, room, 'LOUNGE', '#ffcf8a', lights, LOW_H - 3);
    }
    return;
  }

  // ------------------------------------------------- work rooms: decor
  if (room.row === 0) {
    if (kind === 'research') {
      shelf(ctx, iso, y0, x0 + 4, 26, 2, 40, rnd);
      sideShelf(ctx, iso, x0, y0 + 30, 30, 2, 40, rnd);
      // whiteboard
      left(ctx, iso, y0, x0 + 34, x0 + 64, 24, 42, '#d8dbe2');
      left(ctx, iso, y0, x0 + 34, x0 + 64, 41, 42, '#8a8f9e');
      for (let k = 0; k < 7; k++) left(ctx, iso, y0, x0 + 37 + k * 3, x0 + 39 + k * 3, 28 + (k % 3) * 4, 29 + (k % 3) * 4, k % 2 ? '#3c7ab0' : '#c0392b');
    } else if (kind === 'creation') {
      // pinboard with sketches
      left(ctx, iso, y0, x0 + 6, x0 + 46, 20, 42, '#9a7350');
      for (let k = 0; k < 10; k++) {
        const u = x0 + 8 + ((k * 7) % 36);
        const z = 23 + ((k * 5) % 14);
        left(ctx, iso, y0, u, u + 4, z, z + 4, ['#ffd27a', '#ff9ac2', '#9ad8ff', '#b6f29a', '#efeae0'][k % 5]!);
      }
      sideShelf(ctx, iso, x0, y0 + 50, 24, 2, 26, rnd);
      // hologram cube prop
      const hx = iso.x(x1 - 18, y0 + 20);
      const hy = iso.y(x1 - 18, y0 + 20, 14);
      box(ctx, iso, x1 - 22, y0 + 16, x1 - 14, y0 + 24, 0, 10, { top: '#2b2d38', left: '#1d1f28', right: '#15171f' });
      for (let k = 0; k < 8; k++) px(ctx, hx - 4 + k, hy - 8 + ((k * 3) % 8), '#ff9ac2');
      lights.push({ x: hx, y: hy - 5, c: '#ff7ac2', r: 16, a: 0.6 });
    } else if (kind === 'audit') {
      // filing cabinets on the side wall
      for (let k = 0; k < 3; k++) box(ctx, iso, x0, y0 + 30 + k * 10, x0 + 8, y0 + 39 + k * 10, 0, 18, { top: '#5a5d6e', left: '#454857', right: '#3a3d4a', rim: '#7a7e92' });
      wallSign(ctx, iso, room, 'AUDIT', '#ffd27a', lights, 42);
      // scales emblem
      const sx = room.x1 - 52;
      left(ctx, iso, y0, sx, sx + 1, 26, 40, '#ffd27a');
      left(ctx, iso, y0, sx - 6, sx + 7, 38, 39, '#ffd27a');
      left(ctx, iso, y0, sx - 7, sx - 4, 32, 34, '#ffd27a');
      left(ctx, iso, y0, sx + 5, sx + 8, 32, 34, '#ffd27a');
      shelf(ctx, iso, y0, x0 + 6, 22, 2, 40, rnd);
    } else if (kind === 'dispatch') {
      // Declared network topology, not invented runtime values.
      left(ctx, iso, y0, x0 + 14, x1 - 14, 12, 38, '#526b82');
      left(ctx, iso, y0, x0 + 16, x1 - 16, 14, 36, '#102336');
      const mid = (x0 + x1) / 2;
      left(ctx, iso, y0, mid - 1, mid + 1, 21, 31, '#728f9e');
      left(ctx, iso, y0, x0 + 31, x1 - 31, 21, 22, '#728f9e');
      left(ctx, iso, y0, mid - 5, mid + 5, 29, 33, '#d7bd82');
      for (const u of [x0 + 31, mid, x1 - 31]) {
        left(ctx, iso, y0, u, u + 1, 17, 22, '#728f9e');
        left(ctx, iso, y0, u - 4, u + 4, 16, 19, '#71aaa9');
      }
      leftText(ctx, iso, y0, x0 + 20, 34, 'ROUTING', '#7893a5', 1);
      lights.push({ x: iso.x(x0 + 55, y0), y: iso.y(x0 + 55, y0, 30), c: '#3ee6ff', r: 34, a: 0.4 });
      wallSign(ctx, iso, room, 'DISPATCH', '#9fb8ff', lights, 55);
    } else if (kind === 'capacity') {
      // wall of status screens (generic glyphs - real values live in the panel)
      for (let k = 0; k < 4; k++) {
        const u = x0 + 14 + k * 30;
        left(ctx, iso, y0, u, u + 24, 14, 36, '#0c1a2e');
        left(ctx, iso, y0, u + 2, u + 22, 17, 18, '#3d4d6e');
        left(ctx, iso, y0, u + 3, u + 6, 21, 32, '#2c3f63');
        left(ctx, iso, y0, u + 8, u + 11, 21, 32, '#2c3f63');
        left(ctx, iso, y0, u + 13, u + 16, 21, 32, '#2c3f63');
      }
      wallSign(ctx, iso, room, 'AI CAPACITY', '#9fb8ff', lights, 55);
    }
    if (kind === 'dispatch' || kind === 'capacity') {
      // Recessed wall panelling and brass trim stay clear of the sign band.
      right(ctx, iso, x0, y0 + 5, y1 - 5, 8, 9, '#9a8961');
      for (let u = y0 + 12; u < y1 - 8; u += 14) right(ctx, iso, x0, u, u + 1, 10, Math.min(wallH - 4, 34), '#45586d');
      left(ctx, iso, y0, x0 + 4, x1 - 4, 6, 7, '#9a8961');
    }
  } else if (kind === 'fixes') {
    wallSign(ctx, iso, room, 'FIXES', '#ffb070', lights, LOW_H - 3);
    // workbench along the back, shelving and a rug so the room reads as a workshop
    box(ctx, iso, x0 + 30, y0 + 70, x0 + 90, y0 + 80, 0, 9, { top: '#8a6544', left: '#6b4a30', right: '#553a25', rim: '#a07a55' });
    for (let k = 0; k < 5; k++) px(ctx, iso.x(x0 + 36 + k * 11, y0 + 74), iso.y(x0 + 36 + k * 11, y0 + 74, 9) - 2, k % 2 ? '#c7cede' : '#d9a441', 3, 2);
    top(ctx, iso, x1 - 80, y0 + 60, x1 - 20, y0 + 96, 0, '#3a4a5a');
    top(ctx, iso, x1 - 77, y0 + 63, x1 - 23, y0 + 93, 0, '#465a6e');
    plant(ctx, iso, x0 + 14, y0 + 90, 21, true);
    plant(ctx, iso, x1 - 12, y0 + 50, 23);
    // toolbox + workbench clutter
    box(ctx, iso, x1 - 30, y0 + 6, x1 - 18, y0 + 12, 0, 8, { top: '#c0392b', left: '#9a2a20', right: '#7a2018', rim: '#e05a4a' });
    box(ctx, iso, x0 + 4, y0 + 40, x0 + 12, y0 + 60, 0, 16, { top: '#5a5d6e', left: '#454857', right: '#3a3d4a' });
    // pegboard tools on the side wall
    right(ctx, iso, x0, y0 + 8, y0 + 34, 4, LOW_H - 1, '#6b5a45');
    for (let k = 0; k < 5; k++) right(ctx, iso, x0, y0 + 10 + k * 5, y0 + 11 + k * 5, 7, 15, k % 2 ? '#c7cede' : '#d9a441');
  }

  if (['leadership','finance','efficiency','quality','operations','delivery'].includes(kind)) {
    const title = kind === 'quality' && b.kind === 'hq' ? 'AUDIT' : kind === 'delivery' ? (b.id === 'uditus' ? 'PRODUCT STUDIO' : b.id === 'etsy-studio' ? 'MERCHANDISING' : 'RESEARCH FLOOR') : ({leadership:'CEO',finance:'CFO',efficiency:'EFFICIENCY',quality:'QUALITY',operations:'OPERATIONS'} as Record<string,string>)[kind]!;
    const z = room.row === 0 ? 54 : LOW_H - 2;
    wallSign(ctx, iso, room, title, b.brand.colors.accent, lights, z);
    if (room.row === 0) {
      left(ctx, iso, y0, x0 + 12, x1 - 12, 12, 34, '#132637');
      left(ctx, iso, y0, x0 + 12, x1 - 12, 33, 34, '#668197');
      // Decorative diagram of responsibility, not invented live metrics.
      for (let u = x0 + 18; u < x1 - 16; u += 14) {
        left(ctx, iso, y0, u, u + 7, 20, 24, '#667e8d');
        left(ctx, iso, y0, u, u + 10, 16, 17, '#394f62');
      }
    }
  }

  // desks
  const n = Math.max(1, desks);
  const spanX = x1 - x0 - 16;
  const command = b.kind === 'hq';
  const step = Math.min(command ? 60 : 30, spanX / n);
  const startX = x0 + 10 + (spanX - step * n) / 2 + (step - 18) / 2;
  const deskY = room.row === 0 ? y0 + (command ? 36 : 22) : y0 + 26;
  for (let i = 0; i < n; i++) {
    const monitors = kind === 'audit' ? 3 : 2;
    room.seats.push(deskAt(ctx, iso, startX + i * step, deskY, monitors, lights, command));
  }
  identityEquipment(ctx, iso, room, b);
  // filing cabinet, plants and lamps
  if (kind !== 'audit') box(ctx, iso, x1 - 22, y0 + 3, x1 - 12, y0 + 10, 0, 16, { top: '#5a5d6e', left: '#454857', right: '#3a3d4a', rim: '#7a7e92' });
  plant(ctx, iso, x1 - 8, y1 - 12, x0 + 3, true);
  if (x1 - x0 > 130) plant(ctx, iso, x0 + 10, y1 - 12, x0 + 9);
  void accent;
  void b;
  void rnd;
  void wallH;
}

/** Equipment is illustrative architecture; screens carry no invented metrics. */
function identityEquipment(ctx: Ctx, iso: Iso, r: Room, b: Business) {
  const {x0,x1,y0,y1,kind} = r;
  const plinth = (x: number,y: number,w: number,c: string) => box(ctx,iso,x,y,x+w,y+10,0,10,{top:c,left:shade(c,0.72),right:shade(c,0.6),rim:shade(c,1.2)});
  const sheet = (x:number,y:number,c:string) => {
    top(ctx,iso,x,y,x+8,y+6,10,'#d8d8ca');
    top(ctx,iso,x+1,y+2,x+7,y+3,10,c);
    top(ctx,iso,x+1,y+4,x+5,y+5,10,c);
  };
  if (b.kind === 'hq') {
    const x = x0+10, y = y1-29;
    // Each command wall has its own symbolic diagram below the sign band.
    if(r.row===0) {
      left(ctx,iso,y0,x0+13,x1-13,13,32,'#132637');
      if(kind==='leadership') {
        const mid=(x0+x1)/2;
        left(ctx,iso,y0,mid-4,mid+4,26,30,'#c2ad76');
        left(ctx,iso,y0,mid,mid+1,20,26,'#7c959d');
        left(ctx,iso,y0,x0+28,x1-28,20,21,'#7c959d');
        for(const u of [x0+28,mid,x1-28]) {
          left(ctx,iso,y0,u,u+1,17,21,'#7c959d');
          left(ctx,iso,y0,u-4,u+4,15,18,'#91afba');
        }
      } else if(kind==='finance') {
        for(let k=0;k<3;k++) {
          const u=x0+19+k*24;
          left(ctx,iso,y0,u,u+16,27,29,'#b4ab82');
          for(let z=16;z<26;z+=4) left(ctx,iso,y0,u,u+12-(z%3),z,z+1,'#779e91');
        }
      } else if(kind==='efficiency') {
        for(let k=0;k<4;k++) {
          const u=x0+19+k*22;
          left(ctx,iso,y0,u,u+12,20,27,k===3?'#b4b28b':'#7dada8');
          if(k<3) left(ctx,iso,y0,u+12,u+22,23,24,'#7b9199');
        }
      }
    }
    if (kind === 'leadership') {
      // Brass-edged strategy table with a miniature island organization model.
      plinth(x,y,30,'#58667a');
      top(ctx,iso,x+2,y+2,x+28,y+8,10,'#304b57');
      for (const [dx,dy,h] of [[13,2,8],[4,5,4],[22,5,4]] as [number,number,number][]) box(ctx,iso,x+dx,y+dy,x+dx+4,y+dy+3,10,10+h,{top:'#c9b486',left:'#7d8b95',right:'#526477'});
    } else if (kind === 'finance') {
      plinth(x,y,27,'#756549');
      for (let k=0;k<3;k++) sheet(x+2+k*8,y+2,'#729a82');
      box(ctx,iso,x1-36,y0+70,x1-24,y0+82,0,22,{top:'#5b6773',left:'#384858',right:'#2a3745'});
      left(ctx,iso,y0+82,x1-34,x1-26,8,18,'#6f8390');
      left(ctx,iso,y0+82,x1-31,x1-29,11,13,'#c2ad76');
    } else if (kind === 'efficiency') {
      plinth(x,y,32,'#42656a');
      for (let k=0;k<4;k++) {
        top(ctx,iso,x+3+k*7,y+2,x+7+k*7,y+7,10,k===3?'#b9bc8c':'#86aaa4');
        if(k<3) top(ctx,iso,x+7+k*7,y+4,x+10+k*7,y+5,10,'#c6c8b2');
      }
      // Process cards and a clock on the side wall, below the sign band.
      right(ctx,iso,x0,y0+12,y0+31,12,28,'#476275');
      for(let k=0;k<3;k++) right(ctx,iso,x0,y0+14+k*5,y0+17+k*5,16,22,'#cfbc8a');
    } else if (kind === 'quality') {
      plinth(x,y,27,'#647087');
      sheet(x+2,y+2,'#7b8977'); sheet(x+15,y+2,'#a17563');
      // Evidence archive and magnifying lens on a grounded inspection bench.
      box(ctx,iso,x+10,y+3,x+13,y+6,10,15,{top:'#b4d0cf',left:'#759896',right:'#4e6b73'});
      right(ctx,iso,x0,y0+12,y0+32,4,17,'#4d5d70');
      for(let k=0;k<4;k++) right(ctx,iso,x0,y0+14+k*4,y0+16+k*4,6,15,'#bea87b');
    } else if (kind === 'operations') {
      // Dispatch rack and a routing table; no decorative live status lights.
      plinth(x,y,29,'#466075');
      for(let k=0;k<3;k++) sheet(x+2+k*8,y+2,'#758daa');
      box(ctx,iso,x1-34,y1-38,x1-22,y1-26,0,23,{top:'#5e7287',left:'#283d51',right:'#1b2d40'});
      for(let z=5;z<22;z+=5) left(ctx,iso,y1-26,x1-32,x1-24,z,z+2,'#8394a5');
    }
    return;
  }
  if (kind !== 'research' && kind !== 'delivery') return;
  const x=x0+14, y=y1-32;
  if (b.id === 'uditus') {
    // Product studio: prototype devices, wireframe board and component tray.
    plinth(x,y,36,'#657784');
    for(let k=0;k<3;k++) {
      box(ctx,iso,x+3+k*11,y+2,x+9+k*11,y+7,10,14,{top:'#283e56',left:'#354d63',right:'#26354b'});
      top(ctx,iso,x+4+k*11,y+3,x+8+k*11,y+6,14,'#8abdc7');
    }
    if(kind==='delivery') {
      right(ctx,iso,x0,y0+8,y0+35,3,18,'#ccd4c9');
      for(let k=0;k<4;k++) right(ctx,iso,x0,y0+10+k*6,y0+14+k*6,6,14,k%2?'#698398':'#789a8d');
    }
  } else if (b.id === 'etsy-studio') {
    // Merchandising: textile swatches, product display and packing bench.
    plinth(x,y,42,'#a27b55');
    for(let k=0;k<5;k++) top(ctx,iso,x+3+k*7,y+2,x+9+k*7,y+8,10,['#c78573','#d7b875','#8caaa0','#9686af','#d5c5a9'][k]!);
    if(kind==='delivery') {
      box(ctx,iso,x1-53,y1-37,x1-39,y1-24,0,12,{top:'#c39c69',left:'#987248',right:'#775935'});
      top(ctx,iso,x1-47,y1-37,x1-45,y1-24,12,'#e0c399');
      right(ctx,iso,x0,y0+8,y0+36,3,18,'#805d47');
      for(let k=0;k<4;k++) right(ctx,iso,x0,y0+11+k*6,y0+15+k*6,6,15,['#c78573','#d7b875','#8caaa0','#d5c5a9'][k]!);
    }
  } else if (b.id === 'aster-ledger') {
    // Research: reference atlas, instrument console and paper comparison trays.
    plinth(x,y,38,'#4c7471');
    sheet(x+3,y+2,'#527d87'); sheet(x+24,y+2,'#b59b5f');
    box(ctx,iso,x+15,y+2,x+21,y+8,10,18,{top:'#a2b9b3',left:'#567977',right:'#385b60'});
    if(kind==='delivery') {
      right(ctx,iso,x0,y0+8,y0+37,3,18,'#163637');
      for(let k=0;k<4;k++) right(ctx,iso,x0,y0+11+k*6,y0+13+k*6,6,14,'#89a8a0');
    }
  }
}

function wallDecor(ctx: Ctx, iso: Iso, room: Room, wallH: number, lights: Lights, rnd: () => number) {
  const { x0, x1, y0, y1 } = room;
  const frames = ['#d9a441', '#3c7ab0', '#a8433a', '#4f8a50', '#efeae0'];
  // posters high on the back wall
  for (let u = x0 + 10; u < x1 - 16; u += 34) {
    const w = 10 + Math.floor(rnd() * 6);
    const z0 = wallH - 16;
    left(ctx, iso, y0, u, u + w, z0, z0 + 11, '#2a2018');
    left(ctx, iso, y0, u + 1, u + w - 1, z0 + 1, z0 + 10, frames[Math.floor(rnd() * frames.length)]!);
    left(ctx, iso, y0, u + 3, u + w - 3, z0 + 3, z0 + 7, '#f4ede0');
  }
  // sconces with light pools
  for (let u = x0 + 26; u < x1 - 8; u += 40) {
    left(ctx, iso, y0, u, u + 2, wallH - 26, wallH - 23, '#ffe0a0');
    lights.push({ x: iso.x(u + 1, y0), y: iso.y(u + 1, y0, wallH - 24), c: '#ffcc80', r: 26, a: 0.45 });
  }
  // side-wall frames
  for (let v = y0 + 10; v < y1 - 14; v += 30) {
    right(ctx, iso, x0, v, v + 9, wallH - 22 - (x0 > 0 ? 24 : 0), wallH - 12 - (x0 > 0 ? 24 : 0), '#2a2018');
    right(ctx, iso, x0, v + 1, v + 8, wallH - 21 - (x0 > 0 ? 24 : 0), wallH - 13 - (x0 > 0 ? 24 : 0), frames[Math.floor(rnd() * frames.length)]!);
  }
}
