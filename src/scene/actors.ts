import { displayStatus } from '../core/selectors';
import { hash32 } from '../core/rng';
import type { Worker, WorkerState, WorkshopState } from '../core/types';
import type { Pt } from './campus';
import type { InteriorScene, Room } from './interior';
import { type Ctx, glow, left, px } from './pixel';
import { CHAR_H, CHAR_W, characterSprite, type IconKind, iconSprite, type Pose, type Tint } from './sprites';

/**
 * Visual-only worker positions. Where a worker is drawn and how it animates is
 * derived every frame from `displayStatus` - the same function the panels use -
 * so an offline or stale worker can never be drawn typing.
 */

interface Actor {
  id: string;
  pos: Pt;
  path: Pt[];
  targetKey: string;
  pose: Pose;
  flip: boolean;
  tint: Tint;
  icon: IconKind | null;
  state: WorkerState;
  animated: boolean;
  seat: { room: Room; index: number } | null;
}

export interface ActorDraw {
  id: string;
  screen: Pt; // art px, feet
  state: WorkerState;
}

const SPEED = 42; // world units per second

export class ActorSystem {
  private actors = new Map<string, Actor>();
  private lastT = 0;

  constructor(private scene: InteriorScene) {}

  private roomAt(p: Pt): Room | undefined {
    return this.scene.rooms.find((r) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1);
  }

  private routeTo(from: Pt, to: Pt): Pt[] {
    const a = this.roomAt(from);
    const b = this.roomAt(to);
    if (a && b && a === b) return [to];
    const cy = this.scene.corridorY;
    const pts: Pt[] = [];
    if (a) pts.push(a.door);
    pts.push([a ? a.door[0] : from[0], cy]);
    if (b) {
      pts.push([b.door[0], cy]);
      pts.push(b.door);
    }
    pts.push(to);
    return pts;
  }

  update(state: WorkshopState, t: number, motion: boolean) {
    const dt = Math.min(0.25, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    const biz = this.scene.businessId;
    const workers = Object.values(state.workers)
      .filter((w) => w.businessId === biz)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const seatUse = new Map<string, number>();
    const usedSpots = new Set<number>();
    const lounge = this.scene.lounge;
    const roomById = new Map(this.scene.rooms.map((r) => [r.departmentId, r]));

    // Workers at desks first so seat assignment is stable.
    const plans: { w: Worker; target: Pt; key: string; pose: Pose; flip: boolean; seat: Actor['seat']; d: ReturnType<typeof displayStatus> }[] = [];
    const seatFor = (w: Worker, deptId: string) => {
      const room = roomById.get(deptId) ?? roomById.get(w.homeDepartmentId);
      if (!room || !room.seats.length) return null;
      const home = workers.filter((x) => x.homeDepartmentId === room.departmentId);
      let index = home.findIndex((x) => x.id === w.id);
      const used = seatUse.get(room.departmentId) ?? 0;
      if (index < 0 || index >= room.seats.length) index = Math.min(room.seats.length - 1, used);
      seatUse.set(room.departmentId, used + 1);
      return { room, index };
    };

    for (const w of workers) {
      const d = displayStatus(state, w);
      const atDesk = d.state !== 'idle';
      if (atDesk) {
        const dept = d.state === 'unknown' || d.state === 'offline' ? w.homeDepartmentId : d.departmentId;
        const seat = seatFor(w, dept);
        if (seat) {
          const pose: Pose = d.state === 'active' ? 'type' : d.state === 'failed' ? 'slump' : 'sit';
          plans.push({ w, target: seat.room.seats[seat.index]!.at, key: `seat:${seat.room.departmentId}:${seat.index}`, pose, flip: false, seat, d });
          continue;
        }
      }
      // idle: pick a lounge spot that rotates over time (coffee, sofa, standing)
      const bucket = Math.floor((t + (hash32(w.id) % 40_000)) / 45_000);
      let idx = (hash32(w.id) + bucket * 3) % Math.max(1, lounge.length);
      for (let k = 0; k < lounge.length && usedSpots.has(idx); k++) idx = (idx + 1) % lounge.length;
      usedSpots.add(idx);
      const spot = lounge[idx];
      if (spot) plans.push({ w, target: spot.at, key: `lounge:${idx}`, pose: spot.pose, flip: spot.flip, seat: null, d });
    }

    for (const p of plans) {
      let a = this.actors.get(p.w.id);
      if (!a) {
        a = {
          id: p.w.id,
          pos: [...p.target] as Pt,
          path: [],
          targetKey: p.key,
          pose: p.pose,
          flip: p.flip,
          tint: 'none',
          icon: null,
          state: p.d.state,
          animated: false,
          seat: p.seat,
        };
        this.actors.set(p.w.id, a);
      }
      if (a.targetKey !== p.key) {
        a.targetKey = p.key;
        a.path = motion ? this.routeTo(a.pos, p.target) : [];
        if (!motion) a.pos = [...p.target] as Pt;
      }
      a.seat = p.seat;
      a.state = p.d.state;
      const s = p.d.state;
      a.tint = s === 'offline' ? 'ghost' : s === 'unknown' ? 'grey' : 'none';
      a.icon =
        s === 'waiting_provider'
          ? 'hourglass'
          : s === 'waiting_approval'
            ? 'hand'
            : s === 'failed'
              ? 'alert'
              : s === 'offline'
                ? 'plug'
                : s === 'unknown'
                  ? 'question'
                  : null;
      // move along path
      if (a.path.length) {
        let budget = SPEED * dt;
        while (budget > 0 && a.path.length) {
          const [tx, ty] = a.path[0]!;
          const dx = tx - a.pos[0];
          const dy = ty - a.pos[1];
          const dist = Math.hypot(dx, dy);
          if (Math.abs(dx - dy) > 0.01) a.flip = dx - dy < 0;
          if (dist <= budget) {
            a.pos = [tx, ty];
            a.path.shift();
            budget -= dist;
          } else {
            a.pos = [a.pos[0] + (dx / dist) * budget, a.pos[1] + (dy / dist) * budget];
            budget = 0;
          }
        }
        a.pose = 'walk';
        a.animated = true;
      } else {
        a.pose = p.pose;
        a.flip = p.flip;
        // Only genuinely active or idle-moving workers animate.
        a.animated = motion && (s === 'active' || (s === 'idle' && p.pose === 'coffee'));
      }
    }
    for (const id of [...this.actors.keys()]) if (!plans.some((p) => p.w.id === id)) this.actors.delete(id);
  }

  /** Draws monitor screens for every seat: lit only when its worker is active. */
  drawMonitors(ctx: Ctx, t: number, motion: boolean) {
    const iso = this.scene.iso;
    const seated = new Map<string, Actor>();
    for (const a of this.actors.values()) if (a.seat && !a.path.length) seated.set(`${a.seat.room.departmentId}:${a.seat.index}`, a);
    for (const room of this.scene.rooms) {
      room.seats.forEach((seat, i) => {
        const a = seated.get(`${room.departmentId}:${i}`);
        const st = a?.state;
        for (const [mx, my, mw] of seat.monitors) {
          let c = '#0b1220';
          if (st === 'active') c = '#2fa8d8';
          else if (st === 'waiting_provider' || st === 'waiting_approval') c = '#a0782e';
          else if (st === 'failed') c = '#a8343a';
          left(ctx, iso, my, mx, mx + mw, 10, 16, c);
          if (st === 'active') {
            const lines = 3;
            for (let k = 0; k < lines; k++) {
              const off = motion ? Math.floor(t / 300 + k * 2 + mx) % 4 : k;
              left(ctx, iso, my, mx + 1, mx + 1 + Math.max(1, mw - 2 - off), 14 - k * 2, 15 - k * 2, '#bdf3ff');
            }
            glow(ctx, iso.x(mx + mw / 2, my), iso.y(mx + mw / 2, my, 13), '#38c8ff', 14, 0.5);
          } else if (st === 'failed') {
            left(ctx, iso, my, mx + 2, mx + mw - 2, 12, 14, '#ffb3b3');
            glow(ctx, iso.x(mx + mw / 2, my), iso.y(mx + mw / 2, my, 13), '#ff4a4a', 12, 0.4);
          } else if (st === 'waiting_provider' || st === 'waiting_approval') {
            glow(ctx, iso.x(mx + mw / 2, my), iso.y(mx + mw / 2, my, 13), '#ffb54d', 10, 0.3);
          }
        }
      });
    }
  }

  draw(ctx: Ctx, state: WorkshopState, t: number, selected: string | null, hover: string | null): ActorDraw[] {
    const out: ActorDraw[] = [];
    const list = [...this.actors.values()].sort((a, b) => a.pos[0] + a.pos[1] - (b.pos[0] + b.pos[1]));
    for (const a of list) {
      const w = state.workers[a.id];
      if (!w) continue;
      const [sx, sy] = this.scene.toScreen(a.pos);
      const frame = a.animated ? Math.floor(t / (a.pose === 'walk' ? 160 : 260)) % 2 : 0;
      const outline = a.id === selected ? '#3ee6ff' : a.id === hover ? '#d6f7ff' : undefined;
      const spr = characterSprite(w.id, w.appearance, a.pose, frame, a.flip, a.tint, outline);
      const seatedLift = a.pose === 'sit' || a.pose === 'type' || a.pose === 'slump' ? 2 : 0;
      const x = Math.round(sx - CHAR_W / 2);
      const y = Math.round(sy - CHAR_H + seatedLift);
      if (a.id === selected) glow(ctx, sx, sy - 10, '#3ee6ff', 20, 0.6);
      // soft shadow
      px(ctx, sx - 4, sy - 1, 'rgba(0,0,0,0.35)', 8, 2);
      ctx.drawImage(spr, x, y);
      if (a.icon) {
        const ic = iconSprite(a.icon);
        const bob = a.icon === 'hourglass' && a.animated ? Math.floor(t / 500) % 2 : 0;
        ctx.drawImage(ic, Math.round(sx - 5), y - 13 - bob);
      }
      if (a.pose === 'coffee' && a.animated) {
        for (let k = 0; k < 2; k++) {
          const ph = (t / 500 + k * 0.5) % 1;
          px(ctx, sx + (a.flip ? -4 : 4) + Math.sin(ph * 6) * 1, y + 10 - ph * 6, `rgba(235,235,245,${0.7 * (1 - ph)})`);
        }
      }
      out.push({ id: a.id, screen: [sx, sy], state: a.state });
    }
    return out;
  }

  /** Art-px hit test against sprite bounds. */
  hit(p: Pt): string | null {
    let best: string | null = null;
    let bestDepth = -Infinity;
    for (const a of this.actors.values()) {
      const [sx, sy] = this.scene.toScreen(a.pos);
      if (p[0] >= sx - 7 && p[0] <= sx + 7 && p[1] >= sy - CHAR_H - 2 && p[1] <= sy + 1) {
        const depth = a.pos[0] + a.pos[1];
        if (depth > bestDepth) {
          bestDepth = depth;
          best = a.id;
        }
      }
    }
    return best;
  }

  screenOf(id: string): Pt | null {
    const a = this.actors.get(id);
    return a ? this.scene.toScreen(a.pos) : null;
  }
}
