// The RUN SUMMARY (v5, ocean + woody): the end of every journey as a real moment. A SHIP'S SIGN drops in on two
// ropes and swings to rest over the dark sea (thick driftwood planks, a carved border, rope lashings, net trim,
// barnacles and scallop shells on the corners, kelp draped over the top swaying, bubbles rising past it, caustic
// light sliding across). The result is BRANDED into the wood (SENT HOME / SURFACED / LOST AT SEA) between two pieces
// of sea glass in its colour; the run's entries count up with ticks on a stitched sailcloth patch, with a red NEW
// RECORD brand; "MADE IT HOME" is a window of dark water set into the sign where the saved loot sinks in and bobs
// over wet sand (a friendly empty bottle when nothing made it); and a big CONTINUE.
//
//   const card = new RunSummaryCard({ result: 'extracted', depth: 182, distance: 940, time: 412, floors: 3,
//                                     kills: { fish: 31, giants: 2 }, loot: ['amethyst', 'giantClam'], pearls: 37, record: true });
//   each frame inside ui.begin()/end():  if (card.draw(ui, dt) === 'continue') goHome();
//   (pass { stage, planes } of a Hud already on that PixelUI so the shelf's models share its lights)
//
// CONTINUE is the only exit: its button, Enter, Space, Esc or a click anywhere once the stats have landed.
import * as THREE from 'three';
import type { PixelUI } from './pixel/ui';
import { ITEMS, RARITY_COLOR, getItem } from '../game/items';
import { audio } from '../audio/audio';
import { UiStage, PlanePool } from './obj/stage';
import { itemModel, hudModel } from '../backpack/models';
import { pixelize } from './obj/pixtex';
import { PAL, plate, bigText, bigMeasure, GLYPH, solid, caustics, kelp } from './obj/plates';
import { ramp } from './obj/pixtex';
import { hudArt } from './hudArt';

export interface RunSummary {
  result: 'extracted' | 'surfaced' | 'lost' | 'quit';
  /** deepest metre reached */
  depth: number;
  /** metres travelled away from home (the journey) */
  distance?: number;
  /** seconds */
  time?: number;
  floors?: number;
  kills?: { fish: number; giants: number };
  /** item ids that made it home (sent by post or carried up) */
  loot?: string[];
  pearls?: number;
  /** a new depth / distance record */
  record?: boolean;
  /** what ended it ("Reeled in by the Fisherman") */
  cause?: string;
}

/** word, ink colour, ribbon colour, the line under it when no cause is given */
const RESULT: Record<RunSummary['result'], [string, string, string, string]> = {
  extracted: ['SENT HOME', '#a6e07a', '#2a7a2a', 'The manatee carried it all home.'],
  surfaced: ['SURFACED', '#9fd0ff', '#24609e', 'You swam all the way back up. Everything came home.'],
  lost: ['LOST AT SEA', '#ff9a84', '#a8342c', 'Your pack sank. What you mailed home is safe.'],
  quit: ['BACK HOME', '#f3e7c9', '#6a5024', 'You headed home early.'],
};

interface Tile { key: string; label: string; value: number; fmt: (v: number) => string; glyph: HTMLCanvasElement; sub?: string; badge?: string }

export class RunSummaryCard {
  t = 0;
  private landed = 0;
  private ticked: Record<string, number> = {};
  private ownStage: UiStage | null = null;
  private ownPlanes: PlanePool | null = null;
  private models: THREE.Object3D[] = [];
  private emptyProp: THREE.Object3D | null = null;
  private loot: string[];
  constructor(public s: RunSummary) {
    this.loot = (s.loot ?? []).filter((id) => ITEMS[id]);
  }

  /** draw the card; returns 'continue' on the frame the player dismisses it */
  draw(ui: PixelUI, dt: number, o: { stage?: UiStage; planes?: PlanePool } = {}): 'continue' | null {
    this.t += dt;
    const s = this.s, t = this.t;
    // the 3D shelf needs a stage and plates under it: a Hud's (shares its lights), else our own on this canvas
    let stage = o.stage, planes = o.planes;
    if (!stage || !planes) {
      if (!this.ownStage) { this.ownStage = new UiStage(); this.ownPlanes = new PlanePool(this.ownStage); }
      stage = this.ownStage; planes = this.ownPlanes!;
      stage.attach(ui); planes.begin();
      stage.ui.scale.setScalar(1);
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) pixelize(stage.ui);
    }
    const [word, glassCol, , line] = RESULT[s.result];
    // the sea behind (a plane, so it sits UNDER the sign and the window's models)
    planes.draw(solid('#06141c'), 0, 0, { w: ui.w, h: ui.h, alpha: Math.min(0.8, t * 2.5) });
    ui.block(0, 0, ui.w, ui.h);
    const ba = Math.min(1, t * 5);
    // bubbles rising up the sides of the screen (behind the sign's edges, never over its text)
    for (let i = 0; i < 10; i++) {
      const lane = i % 2 ? ui.w - 10 - ((i * 23) % 26) : 6 + ((i * 17) % 24);
      const ph = (t * (0.08 + (i % 3) * 0.025) + i * 0.137) % 1;
      const g = i % 3 ? GLYPH.bubbleS() : GLYPH.bubble();
      ui.img(g, Math.round(lane + Math.sin(t * 2 + i) * 2), Math.round(ui.h + 6 - ph * (ui.h + 12)), { alpha: 0.7 * ba });
    }
    // the ship's sign drops in on its ropes and settles with a little swing
    const W = Math.min(ui.w - 40, 560), H = Math.min(ui.h - 26, 318);
    const drop = 1 - Math.min(1, Math.max(0, t * 3.2));
    const swing = Math.sin(t * 1.3) * Math.max(0, 1 - t * 0.4) * 2 + Math.sin(t * 0.9) * 0.5;
    const x = Math.round((ui.w - W) / 2 + swing), y = Math.round((ui.h - H) / 2 + 4 - drop ** 2 * 60);
    // the hanging ropes, from above the screen to the sign's top
    for (const rx of [x + 40, x + W - 46]) for (let yy = -2; yy < y + 3; yy++) {
      const ph2 = (yy + Math.floor(t * 0)) % 4;
      ui.fill(rx, yy, 1, 1, '#2a1a0c', ba); ui.fill(rx + 5, yy, 1, 1, '#2a1a0c', ba);
      ui.fill(rx + 1, yy, 4, 1, ph2 === 0 ? '#6a4a24' : ph2 === 1 ? '#f0d49a' : ph2 === 2 ? '#d8b878' : '#b08a52', ba);
    }
    planes.draw(plate(W, H, 'sign'), x, y, { alpha: ba, shadow: 5 });
    planes.drawTiled(caustics(), x + 4, y + 4, W - 8, H - 8, { tile: 72, ox: t * 0.02, oy: t * 0.012, alpha: 0.2 * ba });
    // the result: BRANDED into the wood (burnt letters in a burnt frame), a sea-glass gem in its colour either side
    const st = Math.min(1, Math.max(0, (t - 0.35) / 0.14));
    if (st > 0 && this.landed === 0) { this.landed = 1; audio.play('thud_heavy1', { vol: 0.55, dry: true }); audio.play(s.result === 'lost' ? 'k_bong' : 'jin_good', { vol: 0.4, dry: true }); }
    const BURN = '#2a1206', SCORCH = '#6a3a18';
    if (st > 0) {
      const cap = Math.round(24 * (1 + (1 - st) * 0.8));
      const tw = bigMeasure(ui, word, { cap: 24, outline: null, shadow: null });
      const sw = Math.round(tw + 36), sh = 42;
      const sx = Math.round(x + W / 2 - sw / 2), sy = y + 18;
      const a = st * ba;
      ui.img(stampFrame(sw, sh, SCORCH), sx - 1, sy - 1, { alpha: a * 0.5 });
      ui.img(stampFrame(sw, sh, BURN), sx, sy, { alpha: a });
      bigText(ui, word, x + W / 2, sy + sh / 2 - cap / 2, { cap, color: BURN, outline: SCORCH, shadow: null, align: 'center', alpha: a });
      if (st >= 1) for (const gx of [sx - 16, sx + sw + 6]) seaGlass(ui, gx, sy + sh / 2 - 5, glassCol);
    }
    // the cause / the line under it, carved
    const la = Math.min(1, Math.max(0, (t - 0.6) * 4));
    carved(ui, s.cause ?? line, x + W / 2, y + 68, 'body', la);
    // the entries, written on a stitched sailcloth patch, counting up in turn
    const tiles: Tile[] = [{ key: 'depth', label: 'DEEPEST', value: Math.round(s.depth), fmt: (v) => `-${v} M`, glyph: GLYPH.down(), sub: s.floors ? `${s.floors} STAGE${s.floors > 1 ? 'S' : ''}` : undefined, badge: s.record ? 'NEW RECORD' : undefined }];
    if (s.distance !== undefined) tiles.push({ key: 'far', label: 'FROM HOME', value: Math.round(s.distance), fmt: (v) => `${v} M`, glyph: GLYPH.house() });
    if (s.time !== undefined) tiles.push({ key: 'time', label: 'TIME', value: Math.round(s.time), fmt: (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`, glyph: GLYPH.clock() });
    if (s.kills) tiles.push({ key: 'kills', label: 'FISH BEATEN', value: s.kills.fish, fmt: (v) => String(v), glyph: GLYPH.fish(), sub: s.kills.giants ? `+ ${s.kills.giants} GIANT${s.kills.giants > 1 ? 'S' : ''}` : undefined });
    if (s.pearls !== undefined) tiles.push({ key: 'pearls', label: 'PEARLS', value: s.pearls, fmt: (v) => String(v), glyph: hudArt('pearl') });
    const lx = x + 34, rx = x + W - 34, ty = y + 86, th = 66;
    planes.draw(sailcloth(rx - lx, th), lx, ty, { alpha: Math.min(1, Math.max(0, (t - 0.6) * 5)) * ba });
    const colW = Math.floor((rx - lx) / tiles.length);
    tiles.forEach((tl, i) => {
      const t0 = 0.85 + i * 0.22, k = Math.min(1, Math.max(0, (t - t0) / 0.7));
      const ta = Math.min(1, Math.max(0, (t - t0) * 6));
      const cx = lx + i * colW;
      if (i > 0) for (let yy = ty + 6; yy < ty + th - 6; yy += 3) ui.fill(cx, yy, 1, 2, '#b8a07a', ba);
      if (ta <= 0) return;
      const v = Math.round(tl.value * (1 - (1 - k) ** 3));
      if (v !== this.ticked[tl.key] && k < 1 && Math.floor(t * 30) !== Math.floor((t - dt) * 30)) audio.play('k_tick1', { vol: 0.12, dry: true, rate: 0.8 + k * 0.7 });
      if (k >= 1 && this.ticked[tl.key] !== tl.value) audio.play('k_tick2', { vol: 0.3, dry: true });
      this.ticked[tl.key] = v;
      const g = tl.glyph, gs = 2, lyy = ty + 7;
      const lw = g.width * gs + 4 + ui.measure(tl.label, 'small');
      const gx0 = cx + colW / 2 - lw / 2;
      ui.img(g, gx0, lyy + Math.round(ui.cap('small') / 2 - g.height * gs / 2), { w: g.width * gs, h: g.height * gs, alpha: ta });
      ui.text(tl.label, gx0 + g.width * gs + 4, lyy, { font: 'small', color: INK_DIM, shadow: null, alpha: ta });
      const land = k >= 1 ? Math.max(0, 1 - (t - t0 - 0.7) * 5) : 0;
      bigText(ui, tl.fmt(v), cx + colW / 2, ty + 22 - Math.round(land * 2), { cap: 19, color: land > 0 ? '#8a5a24' : INK, outline: null, shadow: '#d9c59b', align: 'center', alpha: ta });
      if (tl.badge && k >= 1) {
        // the record: a red brand under the number, pulsing once
        const bw = ui.measure(tl.badge, 'small') + 16, bx = Math.round(cx + colW / 2 - bw / 2), by = ty + 47;
        const pulse = Math.max(0, 1 - (t - t0 - 0.7) * 2);
        ui.img(stampFrame(bw, 13, '#a8342c'), bx, by - Math.round(pulse * 2));
        ui.img(GLYPH.star(), bx + 3, by + 3 - Math.round(pulse * 2));
        ui.text(tl.badge, bx + 12, by + 3 - Math.round(pulse * 2), { font: 'small', color: '#a8342c', shadow: null });
      } else if (tl.sub) ui.text(tl.sub, cx + colW / 2, ty + 48, { font: 'small', color: INK_DIM, shadow: null, align: 'center', alpha: ta });
    });
    // MADE IT HOME: a window of dark water set into the sign, the saved loot bobbing in it over wet sand, bubbles
    const wy = ty + th + 8, wh = Math.max(56, y + H - 52 - wy);
    const sa = Math.min(1, Math.max(0, (t - 1.7) * 4));
    planes.draw(plate(rx - lx, wh, 'well', { face: '#123a44' }), lx, wy, { alpha: sa * ba });
    planes.draw(solid('#c8aa7a'), lx + 2, wy + wh - 9, { w: rx - lx - 4, h: 7, alpha: sa * ba });
    planes.draw(solid('#e2c898'), lx + 2, wy + wh - 9, { w: rx - lx - 4, h: 1, alpha: sa * ba });
    planes.drawTiled(caustics(), lx + 2, wy + 2, rx - lx - 4, wh - 4, { tile: 84, ox: -t * 0.025, oy: t * 0.016, alpha: 0.16 * sa * ba });
    const loot = this.loot;
    const lbl = loot.length ? `MADE IT HOME - ${loot.length} THING${loot.length > 1 ? 'S' : ''}` : 'MADE IT HOME';
    const pw = ui.measure(lbl, 'small') + 18;
    planes.draw(plate(pw + 8, 18, 'brass'), lx + 10, wy - 9, { alpha: sa * ba });
    ui.text(lbl, lx + 23, wy - 9 + Math.round((18 - ui.cap('small')) / 2), { font: 'small', color: '#2a1a0c', shadow: null, alpha: sa });
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.18 + i * 0.173) % 1, bx2 = lx + 16 + ((i * 97) % Math.max(1, rx - lx - 32));
      ui.img(i % 2 ? GLYPH.bubbleS() : GLYPH.bubble(), Math.round(bx2 + Math.sin(t * 2 + i) * 2), Math.round(wy + wh - 10 - ph * (wh - 14)), { alpha: 0.6 * sa });
    }
    const kk = stage.ui.scale.x || 1;
    const floorY = wy + wh - 8;
    if (loot.length) {
      const slot = 60, per = Math.max(1, Math.floor((rx - lx - 10) / slot));
      const shown = loot.slice(0, loot.length > per ? per - 1 : per);
      while (this.models.length < shown.length) { const m = itemModel(shown[this.models.length]); stage.ui.add(m); this.models.push(m); }
      const rowW = shown.length * slot;
      const x0 = (lx + rx) / 2 - rowW / 2 + slot / 2;
      shown.forEach((id, i) => {
        const m = this.models[i];
        const k = Math.min(1, Math.max(0, (t - 1.85 - i * 0.07) * 4));
        m.visible = k > 0;
        if (!m.visible) return;
        const d = getItem(id);
        const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
        const size = Math.min(slot - 12, wh - 18);
        // they sink in from the top of the window and bob as they settle
        const sink = (1 - k) ** 2 * (wh * 0.6), bob = Math.sin(t * 1.4 + i * 0.9) * 2;
        m.scale.setScalar((size / Math.max(cw, ch) / kk) * (0.75 + 0.25 * k));
        m.rotation.set(0.15, -0.5 + Math.sin(t * 0.7 + i) * 0.5, Math.sin(t * 1.1 + i) * 0.08);
        stage.put(m, (x0 + i * slot) / kk, (floorY - size / 2 - 3 - sink + bob) / kk, 60);
        if (k > 0.9) seaGlass(ui, x0 + i * slot - 3, floorY - 1, RARITY_COLOR[d.rarity], true);
        if (k > 0 && k < 0.25 && !this.ticked['m' + i]) { this.ticked['m' + i] = 1; audio.play('k_drop2', { vol: 0.2, dry: true, rate: 0.9 + i * 0.03 }); }
      });
      for (let i = shown.length; i < this.models.length; i++) this.models[i].visible = false;
      if (loot.length > shown.length) bigText(ui, `+${loot.length - shown.length}`, x0 + shown.length * slot - 14, floorY - 26, { cap: 12, color: PAL.cream, alpha: sa });
    } else {
      // the empty state: an empty kelp-tea bottle lying on the sand and one friendly line
      if (!this.emptyProp) { this.emptyProp = hudModel('flaskEmpty'); stage.ui.add(this.emptyProp); }
      this.emptyProp.visible = sa > 0;
      this.emptyProp.scale.setScalar(24 / kk);
      this.emptyProp.rotation.set(0.2, Math.sin(t * 0.8) * 0.3, Math.PI / 2 - 0.15);
      stage.put(this.emptyProp, (lx + 34) / kk, (floorY - 8 + Math.sin(t * 1.2)) / kk, 60);
      ui.text('Nothing made it home this time.', lx + 64, floorY - 34, { font: 'body', color: PAL.cream, alpha: sa });
      ui.text('Mail loot with the manatee: it stays safe even if you sink.', lx + 64, floorY - 34 + ui.lh('body'), { font: 'small', color: PAL.dim, alpha: sa });
    }
    // kelp draped over the sign's top corners, swaying (drawn last: it hangs in front)
    kelp(ui, x + 6, y - 2, 58, t, 0, ba);
    kelp(ui, x + 13, y - 1, 34, t, 1.7, ba);
    kelp(ui, x + W - 10, y - 2, 46, t, 3.1, ba);
    kelp(ui, x + W - 17, y - 1, 24, t, 4.4, ba);
    // CONTINUE
    const ready = t > 2.0;
    const bw = 200, bh = 28, bx = Math.round(x + W / 2 - bw / 2), by = y + H - bh - 14;
    const bba = Math.min(1, Math.max(0, (t - 1.9) * 5));
    let go = false;
    if (bba > 0) {
      if (ready && Math.sin(t * 4) > 0.6) ui.fill(bx - 2, by - 2, bw + 4, bh + 4, PAL.brass2, 0.35);
      go = ui.button('runsum:continue', 'CONTINUE', bx, by, bw, bh, { style: 'green', key: 'Enter', disabled: !ready, font: 'title' });
    }
    if (ready && (go || ui.input?.keyHit('Space') || ui.input?.keyHit('Escape') || (ui.pressed && !ui.hover(bx, by, bw, bh)))) {
      for (const m of this.models) m.removeFromParent();
      this.emptyProp?.removeFromParent();
      this.ownStage?.detach();
      return 'continue';
    }
    return null;
  }
}

/** carved text: a dark cut with a lit lower lip, centred */
function carved(ui: PixelUI, str: string, x: number, y: number, font: 'body' | 'small' | 'title', alpha: number) {
  ui.text(str, x + 1, y + 1, { font, color: '#e8cc98', shadow: null, align: 'center', alpha });
  ui.text(str, x, y, { font, color: '#24120a', shadow: null, align: 'center', alpha });
}
/** a rounded piece of sea glass (a pebble of the colour, frosted rim, a glint) */
function seaGlass(ui: PixelUI, x: number, y: number, col: string, small = false) {
  const R = ramp(col);
  x = Math.round(x); y = Math.round(y);
  if (small) { ui.fill(x + 1, y, 4, 4, PAL.ink2); ui.fill(x, y + 1, 6, 2, PAL.ink2); ui.fill(x + 1, y + 1, 4, 2, R[3]); ui.fill(x + 1, y + 1, 2, 1, R[5]); return; }
  // a worn pebble: rounded, frosted (a lighter rim inside the outline), a deeper lower half, one glint
  const rows = ['...kkkkk...', '.kkfffffkk.', 'kffllllllfk', 'kfllwlllllk', 'kflllllllmk', 'kfmmmmmmmmk', '.kmmddddmk.', '..kkkkkkk..'];
  const pal: Record<string, string> = { k: PAL.ink2, f: R[4], l: R[3], m: R[2], d: R[1], w: '#ffffff' };
  rows.forEach((r, yy) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) ui.fill(x + i, y + yy + 1, 1, 1, c); } });
}
/** a sailcloth patch: plain canvas in two flat tones, a stitched hem, one crease */
const clothCache = new Map<string, HTMLCanvasElement>();
function sailcloth(w: number, h: number): HTMLCanvasElement {
  const key = `${w}|${h}`;
  let c = clothCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const f = (px: number, py: number, ww: number, hh: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, ww, hh); };
  f(1, 0, w - 2, h, '#3a2410'); f(0, 1, w, h - 2, '#3a2410');
  f(1, 1, w - 2, h - 2, '#e8dcbc'); f(1, 1, w - 2, 1, '#f6eed8'); f(1, h - 3, w - 2, 2, '#cfc0a0');
  for (let px = 4; px < w - 4; px += 4) { f(px, 3, 2, 1, '#a08a64'); f(px, h - 5, 2, 1, '#a08a64'); }
  for (let py = 5; py < h - 5; py += 4) { f(3, py, 1, 2, '#a08a64'); f(w - 4, py, 1, 2, '#a08a64'); }
  const cx = Math.round(w * 0.58); for (let py = 4; py < h - 4; py++) { f(cx, py, 1, 1, '#d6c8a6'); f(cx + 1, py, 1, 1, '#f6eed8'); }
  clothCache.set(key, c);
  return c;
}

const INK = '#2a1a0c', INK_DIM = '#6a5638';
/** a rubber stamp's frame in ink: a double rule with clipped corners and a few worn gaps (fixed places) */
const stampCache = new Map<string, HTMLCanvasElement>();
function stampFrame(w: number, h: number, col: string): HTMLCanvasElement {
  const key = `${w}|${h}|${col}`;
  let c = stampCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = col;
  const rule = (o: number, th: number) => {
    x.fillRect(o + 2, o, w - 2 * o - 4, th); x.fillRect(o + 2, h - o - th, w - 2 * o - 4, th);
    x.fillRect(o, o + 2, th, h - 2 * o - 4); x.fillRect(w - o - th, o + 2, th, h - 2 * o - 4);
    x.fillRect(o + 1, o + 1, th, th); x.fillRect(w - o - 1 - th, o + 1, th, th); x.fillRect(o + 1, h - o - 1 - th, th, th); x.fillRect(w - o - 1 - th, h - o - 1 - th, th, th);
  };
  rule(0, h >= 24 ? 2 : 1);
  if (h >= 24) rule(4, 1);
  // worn gaps where the rubber didn't take
  x.clearRect(Math.round(w * 0.23), 0, 3, 1); x.clearRect(Math.round(w * 0.71), h - 1, 4, 1); x.clearRect(w - 1, Math.round(h * 0.4), 1, 3); x.clearRect(Math.round(w * 0.5), 1, 2, 1);
  stampCache.set(key, c);
  return c;
}

/** a tiny cut gem (rarity) on the shelf's edge */
function gem(ui: PixelUI, x: number, y: number, col: string) {
  x = Math.round(x); y = Math.round(y);
  ui.fill(x - 2, y - 1, 5, 3, PAL.ink2); ui.fill(x - 1, y - 2, 3, 5, PAL.ink2);
  ui.fill(x - 1, y - 1, 3, 3, col); ui.fill(x - 1, y - 1, 1, 1, '#ffffff');
}
