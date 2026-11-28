// The unlock toast (v8b kit): a flat navy card with the achievement's medal, a gold small-caps label, "Unlocked: ..."
// and the cosmetic's icon in a slot, and a jingle. Queued; one at a time.
//
// It never covers interactive UI: before it appears (and a few times a second while it is up) it looks at what the
// screens actually drew this frame -- every screen PixelUI's pixels (panels, buttons, tags, the objective strip,
// key hints, banners) and the 3D objects on their layers (HUD instruments, the avatar, item models) -- and picks the
// free LANE it likes best: bottom-centre above the key hints first, then tucked down the right side under the top
// instruments, then top-centre, then the left side. It slides in from the nearest edge, glides aside if a panel opens
// under it, shrinks to a compact one-line card when nothing full-size fits, and when nothing fits at all (the bag is
// open) it waits -- or ducks out with its clock paused -- until a lane frees up.
import type { Game } from '../game/game';
import { PixelUI } from '../ui/pixel/ui';
import { C } from '../ui/pixel/skins';
import { audio } from '../audio/audio';
import { medal } from './medals';
import { cosmeticIcon } from '../cosmetics/icons';
import { COSMETIC } from '../cosmetics';
import { ACH } from './index';

const IN = 0.4, HOLD = 3.8, OUT = 0.35;
/** occupancy grid cell (UI px) */
const CELL = 4;

interface Lane { x: number; y: number; from: 'top' | 'bottom' | 'left' | 'right'; compact: boolean; cost: number }

export class Toasts {
  ui = new PixelUI({ targetH: 260 });
  private q: { ach: string; reward: string }[] = [];
  private cur: { ach: string; reward: string; t: number; lane: Lane | null; x: number; y: number; checkT: number; started: boolean; wait: number; paused: boolean; vis: number } | null = null;
  private size = '';
  private occCv = document.createElement('canvas');
  private occ = new Uint8Array(0);
  private ow = 0; private oh = 0;
  constructor(private game: Game) {}
  push(ach: string, reward: string) { this.q.push({ ach, reward }); }
  get busy() { return !!this.cur || this.q.length > 0; }

  /** advance + draw; returns the overlay layer while a toast is up */
  frame(dt: number): { scene: import('three').Scene; camera: import('three').Camera } | null {
    if (!this.cur) {
      const n = this.q.shift();
      if (!n) return null;
      this.cur = { ...n, t: 0, lane: null, x: 0, y: 0, checkT: 0, started: false, wait: 0, paused: false, vis: 1 };
    }
    const g = this.game, pr = g.renderer.getPixelRatio();
    const key = `${g.w}x${g.h}@${pr}`;
    if (key !== this.size) { this.size = key; this.ui.resize(g.w, g.h, pr); if (this.cur) this.cur.lane = null; }
    const c = this.cur;
    dt = Math.min(dt, 0.1);
    // it only starts (jingle and all) once there is a free lane (a safety valve after 2 minutes takes the least crowded)
    if (!c.started) {
      c.wait += dt; c.checkT -= dt;
      if (c.checkT > 0) return null;
      c.checkT = 0.3;
      const lane = this.choose(c.ach, c.reward);
      if (lane.cost >= 100 && c.wait < 120) return null;
      c.started = true; c.lane = lane; c.x = lane.x; c.y = lane.y;
      audio.play('jin_rare1', { vol: 0.55, dry: true });
      audio.play('pickup_sparkle1', { vol: 0.35, dry: true, delay: 0.25 });
    }
    // ducked away (a panel opened over every lane): hold the clock, fade out, come back when there is room
    if (!c.paused || c.t < IN) c.t += dt;
    if (c.t > IN + HOLD + OUT) { this.cur = null; this.ui.opacity = 1; return this.q.length ? this.frame(0) : null; }
    c.vis += ((c.paused ? 0 : 1) - c.vis) * (1 - Math.exp(-dt * 12));
    const ui = this.ui;
    ui.opacity = c.vis;
    ui.begin(null, dt);
    this.draw(c, dt);
    ui.end();
    return c.vis > 0.02 ? ui.layer : null;
  }

  /** sample the screen and pick the best lane, full size first, compact when nothing full-size is free */
  private choose(ach: string, reward: string): Lane {
    const { full, small } = this.sizes(ach, reward);
    this.sample();
    let lane = this.pick(full.W, full.H, false);
    if (lane.cost >= 100) { const l2 = this.pick(small.W, small.H, true); if (l2.cost < lane.cost) lane = l2; }
    return lane;
  }
  private sizes(ach: string, reward: string) {
    const ui = this.ui;
    const a = ACH[ach], cd = COSMETIC[reward];
    const label = `ACHIEVEMENT · ${(a?.name ?? 'ACHIEVEMENT').toUpperCase()}`, unlock = `Unlocked: ${cd?.name ?? reward}`;
    return {
      label, unlock,
      full: { W: Math.min(ui.w - 24, Math.max(220, Math.ceil(Math.max(ui.measure(label, 'small'), ui.measure(unlock, 'body')) + 46 + 44))), H: 46 },
      small: { W: Math.min(ui.w - 24, Math.ceil(ui.measure(unlock, 'body')) + 44), H: 28 },
    };
  }

  // ---------------------------------------------------------------- where it may go
  /** rasterise what every screen UI drew last frame into a coarse occupancy grid (CELL UI px per cell) */
  private sample() {
    const ui = this.ui;
    const ow = Math.ceil(ui.w / CELL), oh = Math.ceil(ui.h / CELL);
    const cv = this.occCv;
    if (cv.width !== ow || cv.height !== oh) { cv.width = ow; cv.height = oh; }
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, ow, oh);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const now = performance.now();
    const rects: [number, number, number, number][] = [];
    for (const [u, t] of PixelUI.lastDrawn) {
      if (u === ui || now - t > 250 || u.w !== ui.w || u.h !== ui.h) continue;
      ctx.drawImage(u.cv, 0, 0, ow, oh);
      rects.push(...u.objectRects());
    }
    const d = ctx.getImageData(0, 0, ow, oh).data;
    const occ = new Uint8Array(ow * oh);
    for (let i = 0; i < ow * oh; i++) occ[i] = d[i * 4 + 3] > 14 ? 1 : 0;
    for (const [x, y, w, h] of rects) {
      if (w <= 0 || h <= 0 || w > ui.w * 0.9 || h > ui.h * 0.9) continue; // a full-screen backdrop is not UI
      const x0 = Math.max(0, Math.floor(x / CELL)), y0 = Math.max(0, Math.floor(y / CELL));
      const x1 = Math.min(ow - 1, Math.floor((x + w) / CELL)), y1 = Math.min(oh - 1, Math.floor((y + h) / CELL));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) occ[yy * ow + xx] = 1;
    }
    this.occ = occ; this.ow = ow; this.oh = oh;
  }
  /** occupied cells under a rect (with a 3 px breathing margin) */
  private covered(x: number, y: number, w: number, h: number) {
    const m = 3;
    const x0 = Math.max(0, Math.floor((x - m) / CELL)), y0 = Math.max(0, Math.floor((y - m) / CELL));
    const x1 = Math.min(this.ow - 1, Math.floor((x + w + m) / CELL)), y1 = Math.min(this.oh - 1, Math.floor((y + h + m) / CELL));
    let n = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) n += this.occ[yy * this.ow + xx];
    return n;
  }
  /** the best lane for a W x H card: free first, then by preference (bottom-centre, right side, top-centre, left) */
  private pick(W: number, H: number, compact: boolean): Lane {
    const ui = this.ui, M = 8;
    let best: Lane | null = null;
    const consider = (x: number, y: number, from: Lane['from'], pref: number) => {
      x = Math.round(Math.max(M, Math.min(ui.w - W - M, x))); y = Math.round(Math.max(M, Math.min(ui.h - H - M, y)));
      const cost = this.covered(x, y, W, H) * 100 + pref;
      if (!best || cost < best.cost) best = { x, y, from, compact, cost };
    };
    const cx = (ui.w - W) / 2;
    // bottom-centre, climbing up over the key hints
    for (let y = ui.h - H - M, i = 0; y >= ui.h * 0.45; y -= 6, i++) consider(cx, y, 'bottom', i * 0.6);
    // down the right side (under the top-right instruments)
    for (let y = M, i = 0; y <= ui.h - H - M; y += 6, i++) consider(ui.w - W - M, y, 'right', 6 + i * 0.4);
    // top-centre, stepping down
    for (let y = M, i = 0; y <= ui.h * 0.4; y += 6, i++) consider(cx, y, 'top', 10 + i * 0.6);
    // the left side
    for (let y = M, i = 0; y <= ui.h - H - M; y += 6, i++) consider(M, y, 'left', 16 + i * 0.4);
    return best!;
  }

  // ---------------------------------------------------------------- drawing
  private draw(c: NonNullable<Toasts['cur']>, dt: number) {
    const ui = this.ui;
    const a = ACH[c.ach];
    const { label, unlock, full, small } = this.sizes(c.ach, c.reward);
    // re-check the lane a few times a second: glide aside when something opens under it, duck out when nothing is free
    c.checkT -= dt;
    if (c.checkT <= 0) {
      c.checkT = 0.3;
      const cur = c.lane!;
      const sz = cur.compact ? small : full;
      this.sample();
      if (this.covered(cur.x, cur.y, sz.W, sz.H) > 0) {
        const lane = this.choose(c.ach, c.reward);
        if (lane.cost < 100) { c.lane = lane; c.paused = false; } else c.paused = true;
      } else c.paused = false;
    }
    const lane = c.lane!;
    const { W, H } = lane.compact ? small : full;
    // glide toward the lane (snaps on the first frame)
    const kk = 1 - Math.exp(-dt * 10);
    c.x += (lane.x - c.x) * kk; c.y += (lane.y - c.y) * kk;
    // the kit's calm motion: a 6 px rise (from its lane's edge) and a fade in; a fade out
    const t = c.t;
    const kIn = Math.min(1, t / IN), e = 1 - (1 - kIn) ** 3;
    const fade = t > IN + HOLD ? Math.max(0, 1 - (t - IN - HOLD) / OUT) : e;
    const off = Math.round((1 - e) * 6);
    let x = Math.round(c.x), y = Math.round(c.y);
    if (lane.from === 'bottom') y += off; else if (lane.from === 'top') y -= off; else if (lane.from === 'right') x += off; else x -= off;
    const al = fade;
    ui.fill(x + 2, y + 3, W, H, '#000000', 0.22 * al);
    ui.fill(x, y, W, H, C.navy, 0.97 * al);
    ui.rect(x, y, W, H, C.line2);
    ui.fill(x, y + 2, 2, H - 4, C.gold, al);
    if (lane.compact) {
      // one line: the reward in a little slot, the unlock text
      ui.frame('slot', x + 6, y + 4, 20, 20, al);
      ui.img(cosmeticIcon(c.reward), x + 6, y + 4, { w: 20, h: 20, alpha: al });
      ui.text(unlock, x + 32, y + Math.round((H - ui.cap('body')) / 2), { font: 'body', color: C.bone2, shadow: C.ink, alpha: al });
      return;
    }
    // the medal on the left, the reward in a slot on the right
    ui.img(medal(a?.emblem ?? 'crown', a?.tier ?? 'gold'), x + 9, y + 9, { alpha: al });
    const ix = x + W - 38;
    ui.frame('slot', ix, y + 9, 28, 28, al);
    ui.img(cosmeticIcon(c.reward), ix + 4, y + 13, { alpha: al });
    const tx = x + 44;
    ui.text(label, tx, y + 11, { font: 'small', color: C.gold, shadow: null, alpha: al });
    ui.text(unlock, tx, y + 24, { font: 'body', color: C.bone2, shadow: C.ink, alpha: al });
  }
}
