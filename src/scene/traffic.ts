import type { TrafficDot } from '../core/types';
import type { Pt } from './campus';
import { type Ctx, glow, px } from './pixel';

export const DOT_STYLE: Record<TrafficDot['outcome'], { color: string; core: string; label: string; shape: 'dot' | 'diamond' | 'plus' | 'square' }> = {
  dispatched: { color: '#ffd36b', core: '#fff3c4', label: 'Dispatched by HQ', shape: 'square' },
  handoff: { color: '#3ee6ff', core: '#c8fbff', label: 'Handoff', shape: 'dot' },
  failed_audit: { color: '#c77dff', core: '#f0d6ff', label: 'Failed audit -> Fixes', shape: 'diamond' },
  repaired: { color: '#c77dff', core: '#f0d6ff', label: 'Repaired -> re-audit', shape: 'diamond' },
  ready: { color: '#5dff9e', core: '#d9ffe8', label: 'Ready (not sent)', shape: 'plus' },
  rejected: { color: '#ff6b6b', core: '#ffd0d0', label: 'Rejected (explicit)', shape: 'diamond' },
};

export interface PlacedDot {
  dot: TrafficDot;
  at: Pt;
  progress: number;
}

function polyLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  return l;
}

export function pointAlong(pts: Pt[], k: number): Pt {
  const total = polyLength(pts);
  let d = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const seg = Math.hypot(bx - ax, by - ay);
    if (d <= seg || i === pts.length - 2) {
      const t = seg ? Math.min(1, d / seg) : 0;
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    d -= seg;
  }
  return pts[pts.length - 1] ?? [0, 0];
}

/** Draws travelling dots. Reduced motion pins each dot at its destination. */
export function drawDots(ctx: Ctx, dots: { dot: TrafficDot; route: Pt[] }[], now: number, motion: boolean, selected: string | null): PlacedDot[] {
  const placed: PlacedDot[] = [];
  for (const { dot, route } of dots) {
    if (route.length < 2) continue;
    const k = (now - dot.startedAt) / dot.durationMs;
    if (k < 0 || k > 1.25) continue;
    const prog = motion ? Math.min(1, k) : 1;
    const at = pointAlong(route, prog);
    const st = DOT_STYLE[dot.outcome];
    const fade = k > 1 ? 1 - (k - 1) / 0.25 : 1;
    ctx.globalAlpha = fade;
    if (motion && k <= 1) {
      for (let j = 1; j <= 4; j++) {
        const tail = pointAlong(route, Math.max(0, prog - j * 0.018));
        px(ctx, tail[0] - 1, tail[1] - 1, st.color, 2, 2);
      }
    }
    glow(ctx, at[0], at[1], st.color, dot.id === selected ? 24 : 16, 1);
    const [x, y] = [Math.round(at[0]), Math.round(at[1])];
    switch (st.shape) {
      case 'diamond':
        px(ctx, x - 1, y - 3, st.core, 2, 1);
        px(ctx, x - 2, y - 2, st.core, 4, 1);
        px(ctx, x - 3, y - 1, st.core, 6, 2);
        px(ctx, x - 2, y + 1, st.core, 4, 1);
        px(ctx, x - 1, y + 2, st.core, 2, 1);
        break;
      case 'plus':
        px(ctx, x - 1, y - 3, st.core, 2, 6);
        px(ctx, x - 3, y - 1, st.core, 6, 2);
        break;
      case 'square':
        px(ctx, x - 2, y - 2, st.core, 4, 4);
        break;
      default:
        px(ctx, x - 2, y - 1, st.core, 4, 2);
        px(ctx, x - 1, y - 2, st.core, 2, 4);
    }
    if (dot.id === selected) {
      px(ctx, x - 5, y - 5, '#ffffff', 2, 1);
      px(ctx, x - 5, y - 5, '#ffffff', 1, 2);
      px(ctx, x + 4, y - 5, '#ffffff', 2, 1);
      px(ctx, x + 5, y - 5, '#ffffff', 1, 2);
      px(ctx, x - 5, y + 5, '#ffffff', 2, 1);
      px(ctx, x - 5, y + 4, '#ffffff', 1, 2);
      px(ctx, x + 4, y + 5, '#ffffff', 2, 1);
      px(ctx, x + 5, y + 4, '#ffffff', 1, 2);
    }
    ctx.globalAlpha = 1;
    placed.push({ dot, at, progress: k });
  }
  return placed;
}

export function drawGuide(ctx: Ctx, route: Pt[], color: string, t: number, motion: boolean) {
  const total = polyLength(route);
  const off = motion ? (t / 60) % 6 : 0;
  for (let d = off; d < total; d += 6) {
    const [x, y] = pointAlong(route, d / total);
    px(ctx, x - 1, y - 1, color, 3, 2);
  }
  for (let d = off; d < total; d += 12) {
    const [x, y] = pointAlong(route, d / total);
    glow(ctx, x, y, color, 8, 0.35);
  }
  // arrowheads
  for (const k of [0.33, 0.66, 0.97]) {
    const a = pointAlong(route, k);
    const b = pointAlong(route, k - 0.01);
    const ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
    for (let j = 1; j <= 3; j++) {
      px(ctx, a[0] - Math.cos(ang - 0.6) * j, a[1] - Math.sin(ang - 0.6) * j, color);
      px(ctx, a[0] - Math.cos(ang + 0.6) * j, a[1] - Math.sin(ang + 0.6) * j, color);
    }
  }
}
