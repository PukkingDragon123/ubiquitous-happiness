// The unlock toast: a kit card (ship planks round dark water) with the achievement's medal, "Unlocked: ..." and the
// cosmetic's icon in a slot, a shine sweep and a jingle. Queued; one at a time.
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
import { KIT } from '../ui/pixel/skins';
import { audio } from '../audio/audio';
import { easeOutBack } from '../core/math';
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
    // slide in from the lane's nearest edge with an overshoot, out the same way
    const t = c.t;
    const k = t < IN ? easeOutBack(t / IN, 1.6) : t > IN + HOLD ? 1 - (t - IN - HOLD) / OUT : 1;
    const off = (1 - Math.max(0, k));
    let x = Math.round(c.x), y = Math.round(c.y);
    if (lane.from === 'bottom') y = Math.round(c.y + off * (ui.h - c.y + 6));
    else if (lane.from === 'top') y = Math.round(c.y - off * (c.y + H + 10));
    else if (lane.from === 'right') x = Math.round(c.x + off * (ui.w - c.x + 6));
    else x = Math.round(c.x - off * (c.x + W + 10));
    const ctx = ui.ctx;
    ui.fill(x + 3, y + 3, W, H, '#000000', 0.3);
    ui.frame(lane.compact ? 'dark' : 'wood', x, y, W, H);
    ui.panelFx(lane.compact ? 'dark' : 'wood', x, y, W, H, 'toast');
    // a shine sweep across the inset
    const ins = lane.compact ? 4 : 7;
    const sx = x + ((t * 240) % (W + 90)) - 45;
    ctx.save(); ctx.beginPath(); ctx.rect(x + ins, y + ins, W - 2 * ins, H - 2 * ins); ctx.clip();
    for (let i = 0; i < H; i++) { ui.fill(sx + i * 0.5, y + i, 7, 1, '#ffffff', 0.12); ui.fill(sx + 11 + i * 0.5, y + i, 2, 1, '#ffffff', 0.09); }
    ctx.restore();
    if (lane.compact) {
      // one line: the reward in a little slot, the unlock text
      ui.frame('slot', x + 5, y + 4, 20, 20);
      ui.img(cosmeticIcon(c.reward), x + 5, y + 4, { w: 20, h: 20 });
      ui.text(unlock, x + 30, y + Math.round((H - ui.cap('body')) / 2), { font: 'body', color: KIT.cream[3], outline: KIT.ink });
      return;
    }
    // the medal swinging on the left end, the reward in a recessed slot on the right
    ui.img(medal(a?.emblem ?? 'crown', a?.tier ?? 'gold'), x + 8, y + 6 + Math.round(Math.sin(t * 5) * 1));
    const ix = x + W - 38;
    ui.frame('slot', ix, y + 9, 28, 28);
    ui.img(cosmeticIcon(c.reward), ix + 4, y + 13);
    for (let i = 0; i < 5; i++) {
      const ph = t * 3 + i * 1.7;
      if (Math.sin(ph) > 0.4) { const tx = [x + 6, x + 34, x + 30, ix - 3, ix + 30][i], ty = y + [5, 9, 38, 8, 36][i]; ui.fill(tx, ty - 1, 1, 3, '#fff6c0'); ui.fill(tx - 1, ty, 3, 1, '#fff6c0'); }
    }
    const tx = x + 42;
    ui.text(label, tx, y + 11, { font: 'small', color: KIT.brass[3], outline: KIT.ink });
    ui.text(unlock, tx, y + 24, { font: 'body', color: KIT.cream[3], outline: KIT.ink });
  }
}
