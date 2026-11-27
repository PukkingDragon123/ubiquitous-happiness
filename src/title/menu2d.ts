// The title's menu (v7): the words float in the water over the scene, 2D, no boxes. Each item is set in the kit's
// biggest face (one font pixel per UI pixel), cream with an ink outline; the chosen one warms to gold, slides out,
// its letters wobble on a running swell and jump in a ripple when it is picked up, a glint sweeps across it, a little
// burst of bubbles rises off it, and a little open scallop with a pearl in it (v8: no 2D blobfish) glides up and down
// the list to rest beside it (its lid lifts now and then to let a bubble go). Activating an item flashes it, bursts
// bubbles and the pearl flashes as the scallop darts off through the word.
//
//   const m = new TitleMenu();                      (TitleMenu<string> for other lists: the in-game pause words)
//   const r = m.draw(ui, x, y, { items, t, appear, live, align? });   r.activate = the item picked this frame (or null)
//   m.sel / m.select(id) / m.rect(id) (UI px) ; m.flash(id) when the screen activates an item itself
import type { PixelUI } from '../ui/pixel/ui';
import type { TextOpts } from '../ui/pixel/font';
import { easeOutBack, clamp01, damp } from '../core/math';
import { audio } from '../audio/audio';
import { pearlClam } from './seaSprites';

export type ItemId = 'new' | 'continue' | 'settings' | 'credits';
export interface MenuItem<T extends string = ItemId> {
  id: T; label: string;
  /** one line for the caption bar */ desc: string;
  /** a warning state: the label is swapped, coral, shaking (NEW GAME over a save: START OVER?) */ warn?: string;
  /** a coral word (QUIT) */ danger?: boolean;
  /** it opens a page over the menu (SETTINGS, CREDITS): the cursor stays put instead of darting off */ stay?: boolean;
}

const ROW = 30;
const IDLE: TextOpts = { font: 'big', color: '#efe4c6', color2: '#c9b48a', outline: '#0b1622', shadow: '#06101a' };
const HOT: TextOpts = { font: 'big', color: '#fff8dc', color2: '#ffc65e', outline: '#2a0b24', shadow: '#12060e' };
const WARN: TextOpts = { font: 'big', color: '#ffe0d6', color2: '#ff7a5c', outline: '#2a0606', shadow: '#120404' };
const DANGER: TextOpts = { font: 'big', color: '#ffd8cc', color2: '#e0705a', outline: '#1a0606', shadow: '#0e0404' };
const GLINT: TextOpts = { font: 'big', color: '#ffffff', outline: null, shadow: null };

interface ItemState { hov: number; selT: number; jump: number }

export class TitleMenu<T extends string = ItemId> {
  /** the selected item */
  sel: T = 'new' as T;
  private st = new Map<T, ItemState>();
  private rects = new Map<T, [number, number, number, number]>();
  private fishX = -1; private fishY = -1; private fishV = 0;
  private nextPuff = 1.2; private puffT = -1;
  private lastM: [number, number] = [-999, -999];
  private flashT = -1; private flashId: T | null = null;
  private lastSel: T | null = null;
  private warnT = 0;

  select(id: T) { this.sel = id; }
  /** the item's hit rect last frame (UI px) */
  rect(id: T) { return this.rects.get(id) ?? null; }
  /** the activation flourish (the screen calls it whatever triggered the activation) */
  flash(id: T) { this.flashT = 0; this.flashId = id; }
  /** forget the per-item motion (the screen re-entered) */
  reset() { this.st.clear(); this.fishX = -1; this.flashT = -1; this.flashId = null; this.lastSel = null; this.lastM = [-999, -999]; }

  /**
   * draw the list with its top-left at (x, y). appear: seconds since the menu started showing (staggered slide-in);
   * live: takes mouse / keys. Returns the item activated this frame and the one the pointer is over.
   */
  draw(ui: PixelUI, x: number, y: number, o: { items: MenuItem<T>[]; t: number; appear: number; live: boolean; align?: 'left' | 'center'; idPrefix?: string }): { activate: T | null; over: T | null } {
    const { items, t } = o, dt = ui.dt, input = ui.input, center = o.align === 'center';
    if (!items.some((it) => it.id === this.sel)) this.sel = items[0]?.id ?? this.sel;
    let activate: T | null = null, over: T | null = null;
    // ---- mouse: hovering selects (only once the pointer moves, so a resting cursor doesn't steal the keys' choice)
    const moved = ui.mx !== this.lastM[0] || ui.my !== this.lastM[1];
    this.lastM = [ui.mx, ui.my];
    if (o.live) {
      items.forEach((it, i) => {
        const r = this.rects.get(it.id);
        if (!r) return;
        ui.mark((o.idPrefix ?? 'title:') + it.id, r[0], r[1], r[2], r[3]);
        if (!ui.hover(r[0], r[1], r[2], r[3])) return;
        over = it.id; ui.cursor = 'point';
        if (moved || ui.pressed) this.sel = it.id;
        if (ui.pressed) activate = it.id;
        void i;
      });
      // ---- keys
      const idx = items.findIndex((it) => it.id === this.sel);
      const step = (d: number) => { this.sel = items[(idx + d + items.length) % items.length].id; audio.play('k_tick1', { vol: 0.22, dry: true, rate: 1.1 + (d > 0 ? 0 : 0.1) }); };
      if (input?.keyHit('ArrowDown') || input?.keyHit('KeyS')) step(1);
      else if (input?.keyHit('ArrowUp') || input?.keyHit('KeyW')) step(-1);
      if (!activate && (input?.keyHit('Enter') || input?.keyHit('Space') || input?.keyHit('NumpadEnter'))) activate = this.sel;
    }
    if (this.sel !== this.lastSel) {
      const s = this.state(this.sel); s.selT = 0;
      if (this.lastSel) audio.play('bubble' + (1 + Math.floor((t * 7) % 3)), { vol: 0.16, rate: 1.3 + Math.random() * 0.3 });
      this.lastSel = this.sel;
    }
    if (activate) this.flash(activate);
    // ---- the words
    this.flashT = this.flashT >= 0 ? this.flashT + dt : -1;
    let selY = y, selX = x;
    items.forEach((it, i) => {
      const s = this.state(it.id), on = it.id === this.sel;
      s.hov = damp(s.hov, on ? 1 : 0, 14, dt);
      s.selT += dt;
      const k = clamp01((o.appear - i * 0.09) / 0.4);
      if (k <= 0) { this.rects.delete(it.id); return; }
      const slide = Math.round((1 - easeOutBack(k, 1.8)) * -34);
      const flashing = this.flashId === it.id && this.flashT >= 0 && this.flashT < 0.6;
      const label = it.warn ?? it.label;
      const st = it.warn ? WARN : on ? HOT : it.danger ? DANGER : IDLE;
      if (it.warn) this.warnT += dt; else if (on) this.warnT = 0;
      const w = Math.ceil(ui.measure(label, 'big'));
      const x0 = center ? x - Math.round(w / 2) : x;
      const wx = x0 + (center ? 0 : slide + Math.round(s.hov * 10)) + (it.warn ? Math.round(Math.sin(t * 38) * 1.6 * Math.exp(-this.warnT * 3)) : 0);
      const wy = y + i * ROW + Math.round(Math.sin(t * 1.4 + i * 1.3) * (on ? 0 : 1)) + (center ? Math.round((1 - k) * 10) : 0);
      this.rects.set(it.id, center ? [x0 - 34, y + i * ROW - 5, w + 68, ROW] : [x - 34, y + i * ROW - 5, Math.max(w + 54, 150), ROW]);
      if (on) { selY = wy; selX = wx; }
      // per-letter wobble on the chosen word, a ripple jump when it is first picked, a bigger hop when activated
      let cx = wx;
      const glint = on && s.selT < 0.45 ? s.selT / 0.45 : flashing ? this.flashT / 0.6 : -1;
      const chars = [...label];
      const pos: [string, number, number][] = [];
      chars.forEach((ch, j) => {
        let dy = 0;
        if (on) {
          dy = Math.round(Math.sin(t * 6.5 - j * 0.75) * 1.2 * s.hov);
          const p = s.selT * 13 - j * 0.9;
          if (p > 0 && p < Math.PI) dy -= Math.round(Math.sin(p) * 3);
        }
        if (flashing && !it.warn) { const p = this.flashT * 16 - j * 0.8; if (p > 0 && p < Math.PI) dy -= Math.round(Math.sin(p) * 5); }
        pos.push([ch, cx, wy + dy]);
        cx += ui.measure(ch, 'big');
      });
      const a = k * (on || it.warn ? 1 : 0.88);
      for (const [ch, px, py] of pos) ui.text(ch, px, py, { ...st, alpha: a });
      // the glint: the word again in white, inside a slanted band sweeping left to right
      if (glint >= 0 && glint < 1 && ui.deco) {
        const bx = wx - 12 + (w + 24) * glint, ctx = ui.ctx;
        ctx.save(); ctx.beginPath();
        ctx.moveTo(bx, wy - 3); ctx.lineTo(bx + 6, wy - 3); ctx.lineTo(bx + 6 - 12, wy + 24); ctx.lineTo(bx - 12, wy + 24); ctx.closePath(); ctx.clip();
        for (const [ch, px, py] of pos) ui.text(ch, px, py, { ...GLINT, alpha: 0.75 });
        ctx.restore();
      }
      // a burst of bubbles off the word the moment it is chosen, a bigger one (and a splash) when it is activated
      if (on && s.selT === dt) for (let b = 0; b < 6; b++) ui.bubble(wx + 4 + ((b * 37 + i * 11) % Math.max(1, w - 6)), wy + 14, { r: 1 + (b % 3 === 0 ? 1 : 0), vy: -18 - (b % 3) * 7, delay: b * 0.03, life: 0.9 });
      if (flashing && this.flashT === dt) {
        for (let b = 0; b < 14; b++) ui.bubble(wx + ((b * 23) % Math.max(1, w)), wy + 6 + (b % 4) * 3, { r: 1 + (b % 2), vy: -26 - (b % 4) * 8, delay: b * 0.02, life: 1.1 });
        ui.splash(wx + w / 2, wy + 2, 6);
      }
      // a running bead of light along the chosen word's underline: a wavy ripple of water under it
      if (on && s.hov > 0.6 && !it.warn) {
        for (let u = 0; u < w; u += 2) {
          const yy = wy + 22 + Math.round(Math.sin(u * 0.35 - t * 5) * 0.8);
          const lit = ((u + Math.floor(t * 40)) % 24) < 4;
          ui.fill(wx + u, yy, 1, 1, lit ? '#e6fbff' : '#8fd0dc', (lit ? 0.9 : 0.35) * s.hov);
        }
      }
    });
    // ---- the pearl in its scallop that glides up and down to rest beside the chosen word
    if (o.appear > 0.25) {
      const tx = selX - 32 + Math.round(Math.sin(t * 2.1) * 1.5), ty = selY - 1;
      if (this.fishX < 0) { this.fishX = tx - 30; this.fishY = ty; }
      const fi = items.find((q) => q.id === this.flashId);
      const darting = this.flashT >= 0 && this.flashT < 1.2 && !fi?.stay && !fi?.warn;
      if (darting) { this.fishV += dt * 900; this.fishX += this.fishV * dt; }
      else { this.fishV = 0; this.fishX = damp(this.fishX, tx, 9, dt); }
      const vy = (ty - this.fishY);
      this.fishY = damp(this.fishY, ty, 10, dt);
      // the lid lifts, then a bubble rises out of the shell, every couple of seconds
      if (!darting && t > this.nextPuff) { this.puffT = 0; this.nextPuff = t + 1.8 + ((t * 13) % 1.4); }
      if (this.puffT >= 0) { this.puffT += dt; if (this.puffT > 0.32) { this.puffT = -1; ui.bubble(this.fishX + 14, this.fishY + 4, { r: 2, vy: -14, life: 1.3 }); ui.bubble(this.fishX + 11, this.fishY + 2, { r: 1, vy: -18, delay: 0.12 }); } }
      const glint = (t % 4.3) < 0.18 || darting;
      const spr = pearlClam({ open: this.puffT >= 0 ? Math.min(1, this.puffT * 6) : 0, glint });
      const tilt = Math.round(Math.max(-2, Math.min(2, vy * 0.15)));
      const fa = darting ? Math.max(0, 1 - this.flashT * 1.2) : clamp01((o.appear - 0.25) * 3);
      if (fa > 0) {
        ui.img(spr, Math.round(this.fishX) + 1, Math.round(this.fishY) + 2 + tilt, { alpha: 0.28 * fa, w: spr.width, h: spr.height });
        ui.img(spr, Math.round(this.fishX), Math.round(this.fishY) + tilt, { alpha: fa });
        // a wake of tiny bubbles while it swims
        if (Math.abs(vy) > 2 || darting) if ((t * 20) % 1 < dt * 20) ui.bubble(this.fishX + 1, this.fishY + 9, { r: 1, vy: -8, life: 0.6 });
      }
    }
    return { activate, over };
  }

  private state(id: T) { let s = this.st.get(id); if (!s) { s = { hov: 0, selT: 9, jump: 0 }; this.st.set(id, s); } return s; }
}
