// The RUN SUMMARY (v5): the end of every journey as a real moment, written up in the diver's LOGBOOK. A page slides
// onto the table (blue ruled lines, a red margin, punched holes, a coffee ring, a water stain, brass tacks, a dog-eared
// corner); the result is a rubber STAMP slammed onto it (SENT HOME / SURFACED / LOST AT SEA); the run's entries count
// up with ticks in big ink numerals (how deep, how far from home, how long, what you beat, the pearls) with a red
// NEW RECORD stamp; "MADE IT HOME" stands the saved loot on a brass rule as turning 3D models (a friendly empty state
// when nothing made it); and a big CONTINUE.
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
import { UiStage, PlanePool, contactShadow } from './obj/stage';
import { itemModel, hudModel } from '../backpack/models';
import { pixelize } from './obj/pixtex';
import { PAL, plate, bigText, bigMeasure, GLYPH, solid } from './obj/plates';
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
    const [word, , inkCol, line] = RESULT[s.result];
    // the backdrop (a plane, so it sits UNDER the page and the shelf's models)
    planes.draw(solid(PAL.ink2), 0, 0, { w: ui.w, h: ui.h, alpha: Math.min(0.78, t * 2.5) });
    ui.block(0, 0, ui.w, ui.h);
    // the logbook page slides up onto the table
    const W = Math.min(ui.w - 24, 560), H = Math.min(ui.h - 22, 322);
    const rise = 1 - Math.min(1, Math.max(0, t * 3.2));
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2 + 2 + rise ** 3 * 50);
    const pa = Math.min(1, t * 5);
    planes.draw(plate(W, H, 'logbook'), x, y, { alpha: pa, shadow: 4 });
    const lx = x + 36, rx = x + W - 16; // writing area: right of the red margin
    ui.text('VOYAGE LOG', lx, y + 12, { font: 'small', color: INK_DIM, shadow: null, alpha: pa });
    if (s.floors) ui.text(`${s.floors} STAGE${s.floors > 1 ? 'S' : ''}`, rx - 4, y + 12, { font: 'small', color: INK_DIM, shadow: null, align: 'right', alpha: pa });
    // the result: a rubber stamp slammed onto the page (big, then it lands), double-ruled, a little worn
    const st = Math.min(1, Math.max(0, (t - 0.35) / 0.14));
    if (st > 0 && this.landed === 0) { this.landed = 1; audio.play('thud_heavy1', { vol: 0.55, dry: true }); audio.play(s.result === 'lost' ? 'k_bong' : 'jin_good', { vol: 0.4, dry: true }); }
    if (st > 0) {
      const cap = Math.round(24 * (1 + (1 - st) * 0.8));
      const tw = bigMeasure(ui, word, { cap: 24, outline: null, shadow: null });
      const sw = Math.round(tw + 34), sh = 42;
      const sx = Math.round(ui.w / 2 - sw / 2), sy = y + 26;
      const a = st * pa;
      ui.img(stampFrame(sw, sh, inkCol), sx, sy, { alpha: a * 0.92 });
      bigText(ui, word, ui.w / 2, sy + sh / 2 - cap / 2, { cap, color: inkCol, outline: null, shadow: null, align: 'center', alpha: a * 0.92 });
      // an ink splat beside it from the slam (fixed shape)
      if (st >= 1) for (const [dx, dy, r] of [[-12, 34, 1], [-8, 38, 0], [sw + 6, 8, 1]] as [number, number, number][]) ui.fill(sx + dx, sy + dy, 1 + r, 1 + r, inkCol, 0.7 * pa);
    }
    // the cause / the line under it, in pen
    const la = Math.min(1, Math.max(0, (t - 0.6) * 4));
    ui.text(s.cause ?? line, ui.w / 2, y + 74, { font: 'body', color: INK, shadow: null, align: 'center', alpha: la });
    // the entries, counting up in turn, written on the ruled lines
    const tiles: Tile[] = [{ key: 'depth', label: 'DEEPEST', value: Math.round(s.depth), fmt: (v) => `-${v} M`, glyph: GLYPH.down(), badge: s.record ? 'NEW RECORD' : undefined }];
    if (s.distance !== undefined) tiles.push({ key: 'far', label: 'FROM HOME', value: Math.round(s.distance), fmt: (v) => `${v} M`, glyph: GLYPH.house() });
    if (s.time !== undefined) tiles.push({ key: 'time', label: 'TIME', value: Math.round(s.time), fmt: (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`, glyph: GLYPH.clock() });
    if (s.kills) tiles.push({ key: 'kills', label: 'FISH BEATEN', value: s.kills.fish, fmt: (v) => String(v), glyph: GLYPH.fish(), sub: s.kills.giants ? `+ ${s.kills.giants} GIANT${s.kills.giants > 1 ? 'S' : ''}` : undefined });
    if (s.pearls !== undefined) tiles.push({ key: 'pearls', label: 'PEARLS', value: s.pearls, fmt: (v) => String(v), glyph: hudArt('pearl') });
    const colW = Math.floor((rx - lx) / tiles.length), ty = y + 92;
    tiles.forEach((tl, i) => {
      const t0 = 0.8 + i * 0.22, k = Math.min(1, Math.max(0, (t - t0) / 0.7));
      const ta = Math.min(1, Math.max(0, (t - t0) * 6));
      const cx = lx + i * colW;
      // pencil rules between the columns
      if (i > 0) for (let yy = ty + 2; yy < ty + 58; yy += 3) ui.fill(cx - 2, yy, 1, 2, '#c8b48a', pa);
      if (ta <= 0) return;
      const v = Math.round(tl.value * (1 - (1 - k) ** 3));
      if (v !== this.ticked[tl.key] && k < 1 && Math.floor(t * 30) !== Math.floor((t - dt) * 30)) audio.play('k_tick1', { vol: 0.12, dry: true, rate: 0.8 + k * 0.7 });
      if (k >= 1 && this.ticked[tl.key] !== tl.value) audio.play('k_tick2', { vol: 0.3, dry: true });
      this.ticked[tl.key] = v;
      const g = tl.glyph, gs = 2, lyy = ty + 2;
      const lw = g.width * gs + 4 + ui.measure(tl.label, 'small');
      const gx0 = cx + colW / 2 - lw / 2;
      ui.img(g, gx0, lyy + Math.round(ui.cap('small') / 2 - g.height * gs / 2), { w: g.width * gs, h: g.height * gs, alpha: ta });
      ui.text(tl.label, gx0 + g.width * gs + 4, lyy, { font: 'small', color: INK_DIM, shadow: null, alpha: ta });
      const land = k >= 1 ? Math.max(0, 1 - (t - t0 - 0.7) * 5) : 0;
      bigText(ui, tl.fmt(v), cx + colW / 2, ty + 17 - Math.round(land * 2), { cap: 19, color: land > 0 ? '#8a5a24' : INK, outline: null, shadow: '#d9c59b', align: 'center', alpha: ta });
      if (tl.sub) ui.text(tl.sub, cx + colW / 2, ty + 42, { font: 'small', color: INK_DIM, shadow: null, align: 'center', alpha: ta });
      if (tl.badge && k >= 1) {
        // the record: a little red ink stamp under the number, pulsing once
        const bw = ui.measure(tl.badge, 'small') + 16, bx = Math.round(cx + colW / 2 - bw / 2), by = ty + 41;
        const pulse = Math.max(0, 1 - (t - t0 - 0.7) * 2);
        ui.img(stampFrame(bw, 13, '#a8342c'), bx, by - Math.round(pulse * 2));
        ui.img(GLYPH.star(), bx + 3, by + 3 - Math.round(pulse * 2));
        ui.text(tl.badge, bx + 12, by + 3 - Math.round(pulse * 2), { font: 'small', color: '#a8342c', shadow: null });
      }
    });
    // MADE IT HOME: the saved loot standing on a brass rule pinned across the page
    const sy = ty + 62;
    const sa = Math.min(1, Math.max(0, (t - 1.7) * 4));
    const loot = this.loot;
    ui.text(loot.length ? `MADE IT HOME - ${loot.length} THING${loot.length > 1 ? 'S' : ''}` : 'MADE IT HOME', lx, sy, { font: 'body', color: INK, shadow: null, alpha: sa });
    ui.fill(lx, sy + ui.cap('body') + 3, ui.measure(loot.length ? `MADE IT HOME - ${loot.length} THING${loot.length > 1 ? 'S' : ''}` : 'MADE IT HOME', 'body'), 1, '#8a6a44', sa);
    const boardY = y + H - 62;
    planes.draw(plate(rx - lx, 7, 'brass'), lx, boardY, { alpha: sa });
    const kk = stage.ui.scale.x || 1;
    if (loot.length) {
      const slot = 60, per = Math.max(1, Math.floor((rx - lx - 10) / slot));
      const shown = loot.slice(0, loot.length > per ? per - 1 : per);
      while (this.models.length < shown.length) { const m = itemModel(shown[this.models.length]); const c = contactShadow(1.1, 0.5, 0.35); c.position.set(0, -0.48, -0.3); c.rotation.x = -1.2; m.add(c); stage.ui.add(m); this.models.push(m); }
      const rowW = shown.length * slot;
      const x0 = (lx + rx) / 2 - rowW / 2 + slot / 2;
      shown.forEach((id, i) => {
        const m = this.models[i];
        const k = Math.min(1, Math.max(0, (t - 1.85 - i * 0.07) * 5));
        m.visible = k > 0;
        if (!m.visible) return;
        const d = getItem(id);
        const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
        const drop = (1 - k) ** 2 * 26;
        const bounce = k >= 1 ? 0 : Math.sin(k * Math.PI) * 2;
        m.scale.setScalar(((slot - 10) / Math.max(cw, ch) / kk) * (0.7 + 0.3 * k));
        m.rotation.set(0.15, -0.5 + Math.sin(t * 0.9 + i) * 0.45, 0);
        stage.put(m, (x0 + i * slot) / kk, (boardY - (slot - 10) / 2 + 2 - drop - bounce) / kk, 60);
        if (k > 0.9) gem(ui, x0 + i * slot, boardY + 3, RARITY_COLOR[d.rarity]);
        if (k > 0 && k < 0.25 && !this.ticked['m' + i]) { this.ticked['m' + i] = 1; audio.play('k_drop2', { vol: 0.2, dry: true, rate: 0.9 + i * 0.03 }); }
      });
      for (let i = shown.length; i < this.models.length; i++) this.models[i].visible = false;
      if (loot.length > shown.length) bigText(ui, `+${loot.length - shown.length}`, x0 + shown.length * slot - 10, boardY - 24, { cap: 12, color: INK, outline: null, shadow: null, alpha: sa });
    } else {
      // the empty state: an empty kelp-tea bottle lying on the rule and one friendly line
      if (!this.emptyProp) { this.emptyProp = hudModel('flaskEmpty'); stage.ui.add(this.emptyProp); }
      this.emptyProp.visible = sa > 0;
      this.emptyProp.scale.setScalar(26 / kk);
      this.emptyProp.rotation.set(0.2, Math.sin(t * 0.8) * 0.3, Math.PI / 2 - 0.15);
      stage.put(this.emptyProp, (lx + 34) / kk, (boardY - 9) / kk, 60);
      ui.text('Nothing made it home this time.', lx + 66, boardY - 30, { font: 'body', color: INK, shadow: null, alpha: sa });
      ui.text('Mail loot with the manatee: it stays safe even if you sink.', lx + 66, boardY - 30 + ui.lh('body'), { font: 'small', color: INK_DIM, shadow: null, alpha: sa });
    }
    // CONTINUE
    const ready = t > 2.0;
    const bw = 200, bh = 28, bx = Math.round(ui.w / 2 - bw / 2), by = y + H - bh - 14;
    const ba = Math.min(1, Math.max(0, (t - 1.9) * 5));
    let go = false;
    if (ba > 0) {
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
