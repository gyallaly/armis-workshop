/**
 * Pixel-art raster helpers for a 2:1 isometric projection.
 *
 * All drawing happens at "art pixel" resolution on offscreen canvases and is
 * upscaled with nearest-neighbour sampling, which is what gives the scene its
 * 32-bit-era look. Faces are rasterised column by column, so edges are crisp
 * stair-steps rather than anti-aliased polygons.
 */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number, readback = false): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(h);
  const ctx = canvas.getContext('2d', { willReadFrequently: readback })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** World (wx, wy, z) -> art pixel. */
export class Iso {
  constructor(
    public ox: number,
    public oy: number,
  ) {}
  x(wx: number, wy: number): number {
    return this.ox + wx - wy;
  }
  y(wx: number, wy: number, z = 0): number {
    return this.oy + (wx + wy) / 2 - z;
  }
  p(wx: number, wy: number, z = 0): [number, number] {
    return [this.x(wx, wy), this.y(wx, wy, z)];
  }
}

// ------------------------------------------------------------------ colour

export function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgb(r: number, g: number, b: number): string {
  const f = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** Multiply brightness (k < 1 darker, k > 1 lighter). */
export function shade(c: string, k: number): string {
  const [r, g, b] = hex(c);
  if (k <= 1) return rgb(r * k, g * k, b * k);
  const t = k - 1;
  return rgb(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return rgb(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// ------------------------------------------------------------- primitives

export function px(ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

/** Top face of world rect [x0,x1]x[y0,y1] at height z. */
export function top(ctx: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, z: number, c: string) {
  ctx.fillStyle = c;
  for (let u = x0 - y1; u <= x1 - y0; u++) {
    const wyMin = Math.max(y0, x0 - u);
    const wyMax = Math.min(y1, x1 - u);
    if (wyMax < wyMin) continue;
    const t = Math.floor(iso.oy + u / 2 + wyMin - z);
    const b = Math.floor(iso.oy + u / 2 + wyMax - z);
    ctx.fillRect(iso.ox + u, t, 1, Math.max(1, b - t + 1));
  }
}

/** Face in plane wy = y (faces down-left), spanning wx in [x0, x1), z in [z0, z1). */
export function left(ctx: Ctx, iso: Iso, y: number, x0: number, x1: number, z0: number, z1: number, c: string) {
  ctx.fillStyle = c;
  const h = z1 - z0;
  for (let wx = x0; wx < x1; wx++) {
    ctx.fillRect(iso.ox + wx - y, Math.floor(iso.oy + (wx + y) / 2 - z1), 1, h);
  }
}

/** Face in plane wx = x (faces down-right), spanning wy in [y0, y1], z in [z0, z1). */
export function right(ctx: Ctx, iso: Iso, x: number, y0: number, y1: number, z0: number, z1: number, c: string) {
  ctx.fillStyle = c;
  const h = z1 - z0;
  for (let wy = y0; wy <= y1; wy++) {
    ctx.fillRect(iso.ox + x - wy, Math.floor(iso.oy + (x + wy) / 2 - z1), 1, h);
  }
}

export interface BoxColors {
  top: string;
  left: string;
  right: string;
  /** Lighter rim drawn along the visible top edges. */
  rim?: string;
}

/** Solid box [x0,x1]x[y0,y1]x[z0,z1]. */
export function box(ctx: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: BoxColors) {
  left(ctx, iso, y1, x0, x1, z0, z1, c.left);
  right(ctx, iso, x1, y0, y1, z0, z1, c.right);
  top(ctx, iso, x0, y0, x1, y1, z1, c.top);
  if (c.rim) {
    left(ctx, iso, y1, x0, x1, z1 - 1, z1, c.rim);
    right(ctx, iso, x1, y0, y1, z1 - 1, z1, c.rim);
  }
}

/** Dot-stipple a top-face area with a second colour (cheap texture). */
export function stippleTop(ctx: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, z: number, c: string, density: number, seed: number) {
  ctx.fillStyle = c;
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const n = Math.floor((x1 - x0) * (y1 - y0) * density);
  for (let i = 0; i < n; i++) {
    const wx = x0 + rnd() * (x1 - x0);
    const wy = y0 + rnd() * (y1 - y0);
    ctx.fillRect(Math.floor(iso.x(wx, wy)), Math.floor(iso.y(wx, wy, z)), 1, 1);
  }
}

export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// -------------------------------------------------------------- pixel font

/** 4x5 pixel font for in-scene signage (A-Z, 0-9, a few symbols). */
const GLYPHS: Record<string, string> = {
  A: '0110 1001 1111 1001 1001',
  B: '1110 1001 1110 1001 1110',
  C: '0111 1000 1000 1000 0111',
  D: '1110 1001 1001 1001 1110',
  E: '1111 1000 1110 1000 1111',
  F: '1111 1000 1110 1000 1000',
  G: '0111 1000 1011 1001 0111',
  H: '1001 1001 1111 1001 1001',
  I: '111 010 010 010 111',
  J: '0011 0001 0001 1001 0110',
  K: '1001 1010 1100 1010 1001',
  L: '1000 1000 1000 1000 1111',
  M: '10001 11011 10101 10001 10001',
  N: '1001 1101 1011 1001 1001',
  O: '0110 1001 1001 1001 0110',
  P: '1110 1001 1110 1000 1000',
  Q: '0110 1001 1001 1011 0111',
  R: '1110 1001 1110 1010 1001',
  S: '0111 1000 0110 0001 1110',
  T: '11111 00100 00100 00100 00100',
  U: '1001 1001 1001 1001 0110',
  V: '1001 1001 1001 0110 0110',
  W: '10001 10001 10101 11011 10001',
  X: '1001 1001 0110 1001 1001',
  Y: '10001 01010 00100 00100 00100',
  Z: '1111 0010 0100 1000 1111',
  '0': '0110 1011 1101 1001 0110',
  '1': '010 110 010 010 111',
  '2': '1110 0001 0110 1000 1111',
  '3': '1110 0001 0110 0001 1110',
  '4': '1001 1001 1111 0001 0001',
  '5': '1111 1000 1110 0001 1110',
  '6': '0110 1000 1110 1001 0110',
  '7': '1111 0001 0010 0100 0100',
  '8': '0110 1001 0110 1001 0110',
  '9': '0110 1001 0111 0001 0110',
  '-': '000 000 111 000 000',
  '.': '0 0 0 0 1',
  ' ': '00 00 00 00 00',
};

export function glyph(ch: string): string[] {
  return (GLYPHS[ch.toUpperCase()] ?? GLYPHS[' ']!).split(' ');
}

export function textWidth(text: string, scale = 1): number {
  let w = 0;
  for (const ch of text) w += (glyph(ch)[0]!.length + 1) * scale;
  return Math.max(0, w - scale);
}

/** Flat (screen-aligned) pixel text. */
export function text(ctx: Ctx, str: string, x: number, y: number, c: string, scale = 1) {
  ctx.fillStyle = c;
  let cx = Math.floor(x);
  for (const ch of str) {
    const rows = glyph(ch);
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '1') ctx.fillRect(cx + i * scale, Math.floor(y) + j * scale, scale, scale);
    });
    cx += (rows[0]!.length + 1) * scale;
  }
}

/** Calls fn(i, j) for every lit pixel of str, i along the text, j down from the top. */
function eachPixel(str: string, scale: number, fn: (i: number, j: number) => void) {
  let cu = 0;
  for (const ch of str) {
    const rows = glyph(ch);
    const w = rows[0]!.length;
    for (let j = 0; j < rows.length; j++)
      for (let i = 0; i < w; i++)
        if (rows[j]![i] === "1") for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) fn(cu + i * scale + a, j * scale + b);
    cu += (w + 1) * scale;
  }
}

/** Text on a left-facing wall (plane wy = y), from wx = x0 toward larger wx; v = top height. */
export function leftText(ctx: Ctx, iso: Iso, y: number, x0: number, v: number, str: string, c: string, scale = 1) {
  ctx.fillStyle = c;
  eachPixel(str, scale, (i, j) => {
    const wx = x0 + i;
    ctx.fillRect(iso.ox + wx - y, Math.floor(iso.oy + (wx + y) / 2 - v) + j, 1, 1);
  });
}

/** Text on a right-facing wall (plane wx = x), from wy = y0 toward smaller wy; v = top height. */
export function rightText(ctx: Ctx, iso: Iso, x: number, y0: number, v: number, str: string, c: string, scale = 1) {
  ctx.fillStyle = c;
  eachPixel(str, scale, (i, j) => {
    const wy = y0 - i;
    ctx.fillRect(iso.ox + x - wy, Math.floor(iso.oy + (x + wy) / 2 - v) + j, 1, 1);
  });
}

// ------------------------------------------------------------------- glow

const glowCache = new Map<string, HTMLCanvasElement>();

/** Soft radial glow sprite, cached by colour and radius. */
export function glowSprite(color: string, radius: number): HTMLCanvasElement {
  const key = `${color}:${radius}`;
  const hit = glowCache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(radius * 2, radius * 2);
  const [r, g, b] = hex(color);
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  glowCache.set(key, canvas);
  return canvas;
}

export function glow(ctx: Ctx, x: number, y: number, color: string, radius: number, alpha = 1) {
  const prevOp = ctx.globalCompositeOperation;
  const prevA = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = prevA * alpha;
  ctx.drawImage(glowSprite(color, radius), Math.round(x - radius), Math.round(y - radius));
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevA;
}
