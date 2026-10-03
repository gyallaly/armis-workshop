export interface FitRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Pan/zoom camera over an art-pixel world. Screen = (art - c) * scale + view/2. */
export class Camera {
  scale = 1;
  cx = 0;
  cy = 0;
  viewW = 1;
  viewH = 1;
  fitScale = 1;
  private topInset = 70;
  private bottomInset = 90;
  private anim: { t0: number; dur: number; from: [number, number, number]; to: [number, number, number] } | null = null;

  constructor(
    public worldW: number,
    public worldH: number,
    public fitRect: FitRect,
    public minMul = 0.8,
    public maxMul = 4,
  ) {}

  resize(w: number, h: number, bottomInset = 90) {
    const first = this.viewW <= 1;
    const rel = this.fitScale ? this.scale / this.fitScale : 1;
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.bottomInset = bottomInset;
    const fr = this.fitRect;
    this.fitScale = Math.min(Math.max(1, this.viewW - 48) / (fr.x1 - fr.x0), Math.max(1, this.viewH - this.topInset - this.bottomInset) / (fr.y1 - fr.y0));
    if (first) this.reset();
    else {
      this.scale = this.fitScale * rel;
      this.clamp();
    }
  }

  reset(animate = false, now = 0) {
    const fr = this.fitRect;
    const to: [number, number, number] = [(fr.x0 + fr.x1) / 2, (fr.y0 + fr.y1) / 2 + (this.bottomInset - this.topInset) / (2 * this.fitScale), this.fitScale];
    if (animate) this.animateTo(to[0], to[1], to[2], 350, now);
    else [this.cx, this.cy, this.scale] = to;
  }

  get min() {
    return this.fitScale * this.minMul;
  }
  get max() {
    return this.fitScale * this.maxMul;
  }

  /** Zoom as a percentage of the fitted view. */
  get percent() {
    return Math.round((this.scale / this.fitScale) * 100);
  }

  toScreen(x: number, y: number): [number, number] {
    return [(x - this.cx) * this.scale + this.viewW / 2, (y - this.cy) * this.scale + this.viewH / 2];
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.viewW / 2) / this.scale + this.cx, (sy - this.viewH / 2) / this.scale + this.cy];
  }

  pan(dx: number, dy: number) {
    this.anim = null;
    this.cx -= dx / this.scale;
    this.cy -= dy / this.scale;
    this.clamp();
  }

  zoomAt(factor: number, sx: number, sy: number) {
    this.anim = null;
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.max(this.min, Math.min(this.max, this.scale * factor));
    this.cx = wx - (sx - this.viewW / 2) / this.scale;
    this.cy = wy - (sy - this.viewH / 2) / this.scale;
    this.clamp();
  }

  zoomBy(factor: number, now: number) {
    const s = Math.max(this.min, Math.min(this.max, this.scale * factor));
    this.animateTo(this.cx, this.cy, s, 180, now);
  }

  /** Set from the motion preference each frame: reduced motion jumps instead of easing. */
  static instant = false;

  animateTo(cx: number, cy: number, scale: number, dur: number, now: number) {
    if (Camera.instant) dur = 0;
    this.anim = { t0: now, dur, from: [this.cx, this.cy, this.scale], to: [cx, cy, Math.max(this.min, Math.min(this.max, scale))] };
    if (dur <= 0) this.update(now + 1);
  }

  get animating() {
    return this.anim !== null;
  }

  /** Advances any running animation; returns true while moving. */
  update(now: number): boolean {
    if (!this.anim) return false;
    const { t0, dur, from, to } = this.anim;
    const k = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    this.cx = from[0] + (to[0] - from[0]) * e;
    this.cy = from[1] + (to[1] - from[1]) * e;
    this.scale = from[2] + (to[2] - from[2]) * e;
    this.clamp();
    if (k >= 1) this.anim = null;
    return true;
  }

  clamp() {
    this.cx = Math.max(0, Math.min(this.worldW, this.cx));
    this.cy = Math.max(0, Math.min(this.worldH, this.cy));
  }
}
