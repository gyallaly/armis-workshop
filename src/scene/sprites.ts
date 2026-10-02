import type { Appearance } from '../core/types';
import { type Ctx, hex, lcg, makeCanvas, mix, px, shade } from './pixel';

/**
 * Original procedural sprites, drawn in code at art-pixel resolution. No
 * third-party artwork is used; see ASSETS.md.
 */

const OUTLINE = '#0a0c14';

/** Adds a 1px dark outline around every opaque pixel of a sprite canvas. */
function outline(canvas: HTMLCanvasElement, color = OUTLINE) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]!);
  const [r, g, b] = hex(color);
  const out = ctx.createImageData(w, h);
  out.data.set(img.data);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (a(x, y) > 0) continue;
      if (a(x - 1, y) > 0 || a(x + 1, y) > 0 || a(x, y - 1) > 0 || a(x, y + 1) > 0) {
        const i = (y * w + x) * 4;
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        out.data[i + 3] = 255;
      }
    }
  ctx.putImageData(out, 0, 0);
}

// -------------------------------------------------------------- characters

export type Pose = 'stand' | 'walk' | 'coffee' | 'lounge' | 'sit' | 'type' | 'slump';
export type Tint = 'none' | 'ghost' | 'grey';

export const CHAR_W = 14;
export const CHAR_H = 24;

const spriteCache = new Map<string, HTMLCanvasElement>();

export function characterSprite(id: string, app: Appearance, pose: Pose, frame: number, flip: boolean, tint: Tint = 'none', outlineColor?: string): HTMLCanvasElement {
  const key = `${id}|${pose}|${frame}|${flip}|${tint}|${outlineColor ?? ''}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(CHAR_W, CHAR_H, true);
  let a = app;
  if (tint === 'grey') a = { ...app, skin: '#7d8590', hair: '#5a616c', shirt: '#6b7280', pants: '#4b5260' };
  if (flip) {
    ctx.translate(CHAR_W, 0);
    ctx.scale(-1, 1);
  }
  const back = pose === 'sit' || pose === 'type' || pose === 'slump';
  if (back) drawBack(ctx, a, pose, frame);
  else drawFront(ctx, a, pose, frame);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  outline(canvas, outlineColor ?? OUTLINE);
  if (outlineColor) outline(canvas, outlineColor);
  if (tint === 'ghost') {
    const g = canvas.getContext('2d')!;
    const img = g.getImageData(0, 0, CHAR_W, CHAR_H);
    for (let i = 0; i < img.data.length; i += 4) {
      const l = 0.3 * img.data[i]! + 0.59 * img.data[i + 1]! + 0.11 * img.data[i + 2]!;
      img.data[i] = l * 0.55 + 20;
      img.data[i + 1] = l * 0.6 + 24;
      img.data[i + 2] = l * 0.7 + 34;
      img.data[i + 3] = img.data[i + 3]! * 0.75;
    }
    g.putImageData(img, 0, 0);
  }
  spriteCache.set(key, canvas);
  return canvas;
}

// Column origin: head spans x 4..9 (6 wide) in a 14-wide sprite.
const HX = 4;

function head(ctx: Ctx, a: Appearance, y: number, front: boolean) {
  const skin = a.skin;
  const skinS = shade(skin, 0.82);
  const hair = a.hair;
  const hairH = shade(hair, 1.35);
  // face block
  px(ctx, HX, y + 1, skin, 6, 5);
  px(ctx, HX + 5, y + 1, skinS, 1, 5);
  px(ctx, HX + 1, y + 6, skin, 4, 1);
  if (front) {
    px(ctx, HX + 1, y + 3, '#1b1b25');
    px(ctx, HX + 4, y + 3, '#1b1b25');
    px(ctx, HX + 2, y + 5, shade(skin, 0.7), 2, 1);
  }
  const style = a.hairStyle;
  const hairTop = () => {
    px(ctx, HX, y, hair, 6, 2);
    px(ctx, HX + 1, y - 1, hair, 4, 1);
    px(ctx, HX + 1, y - 1, hairH, 2, 1);
  };
  switch (style) {
    case 'bald':
      px(ctx, HX + 1, y - 1, skin, 4, 1);
      px(ctx, HX, y, skin, 6, 1);
      px(ctx, HX + 1, y, shade(skin, 1.25), 1, 1);
      break;
    case 'mohawk':
      px(ctx, HX + 2, y - 2, hair, 2, 3);
      px(ctx, HX + 2, y - 2, hairH, 1, 1);
      px(ctx, HX, y, shade(skin, 0.9), 2, 1);
      px(ctx, HX + 4, y, shade(skin, 0.9), 2, 1);
      break;
    case 'curly':
      hairTop();
      px(ctx, HX - 1, y, hair, 1, 3);
      px(ctx, HX + 6, y, hair, 1, 3);
      px(ctx, HX, y - 1, hair, 1, 1);
      px(ctx, HX + 5, y - 1, hair, 1, 1);
      px(ctx, HX + 2, y - 2, hair, 2, 1);
      px(ctx, HX, y + 2, hair, 1, 1);
      px(ctx, HX + 5, y + 2, hair, 1, 1);
      break;
    case 'long':
      hairTop();
      px(ctx, HX - 1, y + 1, hair, 1, 8);
      px(ctx, HX + 6, y + 1, hair, 1, 8);
      px(ctx, HX, y + 1, hair, 1, 3);
      px(ctx, HX + 5, y + 1, hair, 1, 3);
      break;
    case 'bob':
      hairTop();
      px(ctx, HX - 1, y + 1, hair, 1, 5);
      px(ctx, HX + 6, y + 1, hair, 1, 5);
      px(ctx, HX, y + 1, hair, 6, 1);
      break;
    case 'bun':
      hairTop();
      px(ctx, HX + 2, y - 3, hair, 2, 2);
      px(ctx, HX + 2, y - 3, hairH, 1, 1);
      px(ctx, HX, y + 1, hair, 1, 2);
      px(ctx, HX + 5, y + 1, hair, 1, 2);
      break;
    default:
      hairTop();
      px(ctx, HX, y + 1, hair, 1, 2);
      px(ctx, HX + 5, y + 1, hair, 1, 2);
  }
  if (!front) {
    // back of the head is hair (or skin for bald/mohawk)
    const backC = style === 'bald' ? skin : style === 'mohawk' ? shade(skin, 0.9) : hair;
    px(ctx, HX, y + 1, backC, 6, 5);
    px(ctx, HX + 1, y + 6, backC, 4, 1);
    if (style === 'mohawk') px(ctx, HX + 2, y, hair, 2, 6);
    if (style === 'long') px(ctx, HX - 1, y + 1, hair, 8, 9);
  }
  if (a.accessory === 'glasses' && front) {
    px(ctx, HX, y + 3, '#11131a', 6, 1);
    px(ctx, HX + 1, y + 3, '#8ad1ff');
    px(ctx, HX + 4, y + 3, '#8ad1ff');
  }
  if (a.accessory === 'headphones') {
    px(ctx, HX, y - 1, '#2a2d38', 6, 1);
    px(ctx, HX - 1, y + 2, '#3a3f50', 1, 3);
    px(ctx, HX + 6, y + 2, '#3a3f50', 1, 3);
    px(ctx, HX + 6, y + 2, '#38d6f5', 1, 1);
  }
  if (a.accessory === 'beanie') {
    px(ctx, HX, y - 1, '#b8483d', 6, 2);
    px(ctx, HX + 1, y - 2, '#b8483d', 4, 1);
    px(ctx, HX, y + 1, '#8f3129', 6, 1);
    px(ctx, HX + 2, y - 3, '#e8d8c8', 2, 1);
  }
}

function drawFront(ctx: Ctx, a: Appearance, pose: Pose, frame: number) {
  const shirt = a.shirt;
  const shirtS = shade(shirt, 0.78);
  const shirtH = shade(shirt, 1.18);
  const pants = a.pants;
  const shoe = '#16161d';
  const sitting = pose === 'lounge';
  const bob = pose === 'walk' && frame % 2 === 1 ? 1 : 0;
  const top = 3 + bob + (sitting ? 3 : 0);
  head(ctx, a, top, true);
  const ty = top + 8; // torso top
  // neck
  px(ctx, HX + 2, ty - 1, shade(a.skin, 0.85), 2, 1);
  // torso
  px(ctx, HX, ty, shirt, 6, 6);
  px(ctx, HX + 4, ty, shirtS, 2, 6);
  px(ctx, HX + 1, ty, shirtH, 2, 1);
  // arms
  const swing = pose === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;
  px(ctx, HX - 1, ty + 1 + Math.max(0, swing), shirt, 1, 4);
  px(ctx, HX - 1, ty + 5 + Math.max(0, swing), a.skin, 1, 1);
  if (pose === 'coffee') {
    px(ctx, HX + 6, ty + 1, shirtS, 1, 2);
    px(ctx, HX + 6, ty + 3, a.skin, 1, 1);
    // mug
    px(ctx, HX + 7, ty + 2, '#f2efe8', 2, 3);
    px(ctx, HX + 7, ty + 2, '#6b3f22', 2, 1);
    px(ctx, HX + 9, ty + 3, '#d8d2c4', 1, 1);
  } else {
    px(ctx, HX + 6, ty + 1 + Math.max(0, -swing), shirtS, 1, 4);
    px(ctx, HX + 6, ty + 5 + Math.max(0, -swing), a.skin, 1, 1);
  }
  const ly = ty + 6;
  if (sitting) {
    // thighs forward then shins down
    px(ctx, HX, ly, pants, 6, 2);
    px(ctx, HX + 4, ly, shade(pants, 0.8), 2, 2);
    px(ctx, HX, ly + 2, pants, 2, 3);
    px(ctx, HX + 4, ly + 2, shade(pants, 0.8), 2, 3);
    px(ctx, HX - 1, ly + 5, shoe, 3, 1);
    px(ctx, HX + 4, ly + 5, shoe, 3, 1);
    return;
  }
  const spread = pose === 'walk' && frame % 2 === 0;
  if (spread) {
    px(ctx, HX - 1, ly, pants, 3, 5);
    px(ctx, HX + 4, ly, shade(pants, 0.8), 3, 5);
    px(ctx, HX - 2, ly + 5, shoe, 3, 1);
    px(ctx, HX + 5, ly + 5, shoe, 3, 1);
  } else {
    px(ctx, HX, ly, pants, 3, 6 - bob);
    px(ctx, HX + 3, ly, shade(pants, 0.8), 3, 6 - bob);
    px(ctx, HX + 2, ly + 1, shade(pants, 0.6), 1, 5 - bob);
    px(ctx, HX - 1, ly + 6 - bob, shoe, 3, 1);
    px(ctx, HX + 4, ly + 6 - bob, shoe, 3, 1);
  }
}

function drawBack(ctx: Ctx, a: Appearance, pose: Pose, frame: number) {
  const shirt = a.shirt;
  const slump = pose === 'slump' ? 1 : 0;
  const top = 6 + slump;
  head(ctx, a, top, false);
  const ty = top + 8;
  px(ctx, HX, ty, shirt, 6, 6);
  px(ctx, HX, ty, shade(shirt, 0.85), 1, 6);
  px(ctx, HX + 5, ty, shade(shirt, 0.75), 1, 6);
  px(ctx, HX + 2, ty + 1, shade(shirt, 0.9), 2, 4);
  const lift = pose === 'type' ? (frame % 2 === 0 ? 1 : 0) : 0;
  const rlift = pose === 'type' ? (frame % 2 === 1 ? 1 : 0) : 0;
  px(ctx, HX - 1, ty + 1 - lift, shirt, 1, slump ? 5 : 3);
  px(ctx, HX + 6, ty + 1 - rlift, shirt, 1, slump ? 5 : 3);
  if (!slump) {
    px(ctx, HX - 1, ty + 4 - lift, a.skin, 1, 1);
    px(ctx, HX + 6, ty + 4 - rlift, a.skin, 1, 1);
  }
  // seat of the trousers on the chair
  px(ctx, HX, ty + 6, a.pants, 6, 2);
}

// ------------------------------------------------------------- state icons

export type IconKind = 'hourglass' | 'hand' | 'alert' | 'plug' | 'question' | 'coffee' | 'zzz';

const iconCache = new Map<string, HTMLCanvasElement>();

/** 11x11 speech-bubble icons. Paired with text in the UI, never colour alone. */
export function iconSprite(kind: IconKind): HTMLCanvasElement {
  const hit = iconCache.get(kind);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(11, 12, true);
  const bg: Record<IconKind, string> = {
    hourglass: '#ffd36b',
    hand: '#ffb86b',
    alert: '#ff6b6b',
    plug: '#9aa3b5',
    question: '#c7cedb',
    coffee: '#f0e2c8',
    zzz: '#b9c7ff',
  };
  px(ctx, 1, 0, bg[kind], 9, 9);
  px(ctx, 0, 1, bg[kind], 11, 7);
  px(ctx, 4, 9, bg[kind], 3, 1);
  px(ctx, 5, 10, bg[kind], 1, 1);
  const ink = '#1a1d29';
  switch (kind) {
    case 'hourglass':
      px(ctx, 3, 1, ink, 5, 1);
      px(ctx, 3, 7, ink, 5, 1);
      px(ctx, 4, 2, ink, 3, 1);
      px(ctx, 5, 3, ink, 1, 3);
      px(ctx, 4, 6, ink, 3, 1);
      break;
    case 'hand':
      px(ctx, 3, 2, ink, 1, 4);
      px(ctx, 4, 1, ink, 1, 5);
      px(ctx, 5, 1, ink, 1, 5);
      px(ctx, 6, 2, ink, 1, 4);
      px(ctx, 7, 4, ink, 1, 2);
      px(ctx, 4, 6, ink, 3, 1);
      break;
    case 'alert':
      px(ctx, 5, 1, '#fff', 1, 4);
      px(ctx, 5, 6, '#fff', 1, 1);
      break;
    case 'plug':
      px(ctx, 3, 2, ink, 1, 2);
      px(ctx, 6, 2, ink, 1, 2);
      px(ctx, 2, 4, ink, 6, 2);
      px(ctx, 4, 6, ink, 2, 2);
      px(ctx, 8, 1, '#c0392b', 1, 1);
      px(ctx, 2, 7, '#c0392b', 1, 1);
      break;
    case 'question':
      px(ctx, 3, 1, ink, 4, 1);
      px(ctx, 7, 2, ink, 1, 2);
      px(ctx, 5, 4, ink, 2, 1);
      px(ctx, 5, 5, ink, 1, 1);
      px(ctx, 5, 7, ink, 1, 1);
      break;
    case 'coffee':
      px(ctx, 3, 3, '#6b3f22', 4, 4);
      px(ctx, 7, 4, '#6b3f22', 1, 2);
      px(ctx, 4, 1, '#ffffff', 1, 1);
      px(ctx, 5, 2, '#ffffff', 1, 1);
      break;
    case 'zzz':
      px(ctx, 3, 2, ink, 4, 1);
      px(ctx, 5, 3, ink, 1, 1);
      px(ctx, 4, 4, ink, 1, 1);
      px(ctx, 3, 5, ink, 4, 1);
      break;
  }
  outline(canvas);
  iconCache.set(kind, canvas);
  return canvas;
}

// ------------------------------------------------------------------- props

export function tree(ctx: Ctx, x: number, y: number, size: number, seed: number, kind: 'round' | 'pine' | 'blossom' = 'round') {
  const r = lcg(seed);
  const trunk = '#3b2a1f';
  const th = Math.round(size * 0.45);
  px(ctx, x - 1, y - th, trunk, 2, th);
  px(ctx, x, y - th, shade(trunk, 0.7), 1, th);
  if (kind === 'pine') {
    const base = '#163322';
    const mid = '#1f4430';
    const hi = '#2f6143';
    const h = size * 1.6;
    for (let i = 0; i < h; i++) {
      const w = Math.round((i / h) * size * 0.75) + 1;
      const yy = Math.round(y - th - h + i);
      px(ctx, x - w, yy, base, w * 2, 1);
      px(ctx, x - w, yy, mid, Math.max(1, w - 1), 1);
      if (i % 4 === 0) px(ctx, x - w + 1, yy, hi, Math.max(1, Math.floor(w / 2)), 1);
    }
    return;
  }
  const cols =
    kind === 'blossom'
      ? ['#4a2350', '#6e3478', '#9a4fa3', '#c97bd0', '#f0b6ef']
      : ['#13281b', '#1b3a26', '#24502f', '#33683d', '#4f8a50'];
  const cy = y - th - size * 0.7;
  const blobs: [number, number, number][] = [];
  const nb = 5 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const ang = r() * Math.PI * 2;
    const d = r() * size * 0.45;
    blobs.push([x + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.7, size * (0.42 + r() * 0.25)]);
  }
  blobs.push([x, cy, size * 0.6]);
  const R = Math.ceil(size * 1.3);
  for (let yy = Math.floor(cy - R); yy <= cy + R; yy++) {
    for (let xx = Math.floor(x - R); xx <= x + R; xx++) {
      let best = -1;
      let lightTerm = 0;
      for (const [bx, by, br] of blobs) {
        const dx = xx - bx;
        const dy = (yy - by) * 1.15;
        const d = Math.sqrt(dx * dx + dy * dy) / br;
        if (d <= 1 && (best < 0 || d < best)) {
          best = d;
          lightTerm = (-dx - dy) / br; // light from upper-left
        }
      }
      if (best < 0) continue;
      let k = 1.4 + lightTerm * 1.3 - best * 0.8 + (((xx * 7 + yy * 13) & 3) === 0 ? 0.5 : 0);
      k = Math.max(0, Math.min(cols.length - 1, Math.round(k)));
      px(ctx, xx, yy, cols[k]!);
    }
  }
}

export function bush(ctx: Ctx, x: number, y: number, w: number, seed: number, flowers?: string) {
  const r = lcg(seed);
  const cols = ['#142a1c', '#1d3b27', '#285233', '#3b6e43'];
  const h = Math.max(3, Math.round(w * 0.55));
  for (let yy = 0; yy < h; yy++)
    for (let xx = -w; xx <= w; xx++) {
      const nx = xx / w;
      const ny = (h - yy) / h;
      if (nx * nx + ny * ny * 1.2 > 1.05 - r() * 0.15) continue;
      const k = Math.max(0, Math.min(3, Math.round(1 + ny * 1.5 - nx * 0.8 + (r() < 0.2 ? 1 : 0))));
      px(ctx, x + xx, y - yy, cols[k]!);
      if (flowers && r() < 0.06) px(ctx, x + xx, y - yy, flowers);
    }
}

export function lampPost(ctx: Ctx, x: number, y: number, h = 14) {
  px(ctx, x - 1, y - 1, '#1c1d26', 3, 1);
  px(ctx, x, y - h, '#2b2d3a', 1, h);
  px(ctx, x - 1, y - h - 3, '#2b2d3a', 3, 1);
  px(ctx, x - 1, y - h - 2, '#ffe6a8', 3, 2);
  px(ctx, x, y - h - 2, '#fff6dc', 1, 1);
}

export function bench(ctx: Ctx, x: number, y: number, flip = false) {
  const wood = '#6b4a2f';
  const dk = '#4a321f';
  const s = flip ? -1 : 1;
  for (let i = 0; i < 8; i++) {
    px(ctx, x + s * i, y - 3 + Math.floor((i * s < 0 ? -i : i) / 2) * (flip ? 1 : 1) * 0, wood, 1, 1);
  }
  px(ctx, x - 4, y - 3, wood, 8, 1);
  px(ctx, x - 4, y - 5, dk, 8, 1);
  px(ctx, x - 4, y - 2, '#2a2b33', 1, 2);
  px(ctx, x + 3, y - 2, '#2a2b33', 1, 2);
}

export function umbrellaTable(ctx: Ctx, x: number, y: number, canopy: string) {
  // chairs
  px(ctx, x - 6, y - 3, '#3a3340', 2, 3);
  px(ctx, x + 5, y - 3, '#3a3340', 2, 3);
  // table
  px(ctx, x - 3, y - 5, '#7a5a3c', 7, 1);
  px(ctx, x, y - 4, '#3b2b20', 1, 4);
  px(ctx, x - 1, y - 6, '#f2efe8', 1, 1);
  px(ctx, x + 2, y - 6, '#f2efe8', 1, 1);
  // pole + canopy
  px(ctx, x, y - 16, '#2a2a30', 1, 10);
  const c2 = shade(canopy, 0.75);
  for (let i = 0; i < 5; i++) {
    const w = 2 + i * 2;
    px(ctx, x - w, y - 20 + i, i % 2 ? canopy : c2, w * 2 + 1, 1);
  }
  px(ctx, x - 10, y - 15, mix(canopy, '#ffffff', 0.3), 21, 1);
}

export function stringLights(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, sag = 3) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(Math.PI * t) * sag;
    px(ctx, x, y, i % 2 ? '#ffd27a' : '#ffefc2');
  }
}
