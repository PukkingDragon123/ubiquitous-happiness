// The RUN SUMMARY (v5): the end of every journey as a real moment. A big stamped result (SENT HOME / SURFACED /
// LOST AT SEA) slams onto the screen, then a kit panel with the run in big numerals that count up with ticks (how
// deep, how far from home, how long, what you beat, the pearls), record badges, and the "MADE IT HOME" shelf: the
// saved loot standing on a brass shelf as turning 3D models (a friendly empty state when nothing made it), and a big
// CONTINUE.
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
import { skin, PAD } from './pixel/skins';
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
  extracted: ['SENT HOME', '#a6e07a', '#2a6a2a', 'The manatee carried it all home.'],
  surfaced: ['SURFACED', '#9fd0ff', '#24609e', 'You swam all the way back up. Everything came home.'],
  lost: ['LOST AT SEA', '#ff9a84', '#8a2a24', 'Your pack sank. What you mailed home is safe.'],
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
    const [word, col, ribbon, line] = RESULT[s.result];
    // the backdrop
    // (a plane, so it sits UNDER the panel and the shelf's models)
    planes.draw(solid(PAL.ink2), 0, 0, { w: ui.w, h: ui.h, alpha: Math.min(0.75, t * 2.5) });
    ui.block(0, 0, ui.w, ui.h);
    // the panel rises in
    const W = Math.min(ui.w - 20, 580), H = Math.min(ui.h - 64, 290);
    const rise = 1 - Math.min(1, Math.max(0, (t - 0.1) * 3.5));
    const x = Math.round((ui.w - W) / 2), y = Math.round(ui.h - H - 12 + rise ** 3 * 40);
    const pa = Math.min(1, Math.max(0, (t - 0.1) * 5));
    planes.draw(skin('wood', W, H), x, y, { alpha: pa, shadow: 4 });
    const P = PAD.wood, pad = P[0] + 6;
    // the result stamp slams down over the panel's top edge
    const st = Math.min(1, Math.max(0, (t - 0.3) / 0.16));
    if (st > 0 && this.landed === 0) { this.landed = 1; audio.play('thud_heavy1', { vol: 0.5, dry: true }); audio.play(s.result === 'lost' ? 'k_bong' : 'jin_good', { vol: 0.4, dry: true }); }
    if (st > 0) {
      const cap = Math.round(26 * (1 + (1 - st) * 0.9));
      const tw = bigMeasure(ui, word, { cap });
      const rw = Math.round(bigMeasure(ui, word, { cap: 26 }) + 70), rh = 40;
      const ry = y - rh / 2 - 6;
      planes.draw(plate(rw, rh, 'ribbon', { rim: ribbon }), Math.round(ui.w / 2 - rw / 2), Math.round(ry), { alpha: st, shadow: 3 });
      bigText(ui, word, ui.w / 2, ry + rh / 2 - cap / 2 - 1, { cap, color: PAL.paper, color2: col, align: 'center', alpha: st });
      void tw;
    }
    // the cause / the line under it
    const la = Math.min(1, Math.max(0, (t - 0.55) * 4));
    ui.text(s.cause ?? line, ui.w / 2, y + 26, { font: 'body', color: PAL.cream, align: 'center', alpha: la });
    // the stats, counting up in turn
    const tiles: Tile[] = [{ key: 'depth', label: 'DEEPEST', value: Math.round(s.depth), fmt: (v) => `-${v} M`, glyph: GLYPH.down(), sub: s.floors ? `${s.floors} STAGE${s.floors > 1 ? 'S' : ''}` : undefined, badge: s.record ? 'NEW RECORD' : undefined }];
    if (s.distance !== undefined) tiles.push({ key: 'far', label: 'FROM HOME', value: Math.round(s.distance), fmt: (v) => `${v} M`, glyph: GLYPH.house() });
    if (s.time !== undefined) tiles.push({ key: 'time', label: 'TIME', value: Math.round(s.time), fmt: (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`, glyph: GLYPH.clock() });
    if (s.kills) tiles.push({ key: 'kills', label: 'FISH BEATEN', value: s.kills.fish, fmt: (v) => String(v), glyph: GLYPH.fish(), sub: s.kills.giants ? `+ ${s.kills.giants} GIANT${s.kills.giants > 1 ? 'S' : ''}` : undefined });
    if (s.pearls !== undefined) tiles.push({ key: 'pearls', label: 'PEARLS', value: s.pearls, fmt: (v) => String(v), glyph: hudArt('pearl') });
    const gap = 6, tw2 = Math.floor((W - pad * 2 - gap * (tiles.length - 1)) / tiles.length), th = 66;
    const ty = y + 44;
    tiles.forEach((tl, i) => {
      const t0 = 0.75 + i * 0.22, k = Math.min(1, Math.max(0, (t - t0) / 0.7));
      const ta = Math.min(1, Math.max(0, (t - t0) * 6));
      if (ta <= 0) return;
      const tx = x + pad + i * (tw2 + gap);
      planes.draw(skin('inset', tw2, th), tx, ty + Math.round((1 - ta) * 6), { alpha: ta });
      // count up with an ease-out, ticking as the number climbs
      const v = Math.round(tl.value * (1 - (1 - k) ** 3));
      if (v !== this.ticked[tl.key] && k < 1 && Math.floor(t * 30) !== Math.floor((t - dt) * 30)) audio.play('k_tick1', { vol: 0.12, dry: true, rate: 0.8 + k * 0.7 });
      if (k >= 1 && this.ticked[tl.key] !== tl.value) audio.play('k_tick2', { vol: 0.3, dry: true });
      this.ticked[tl.key] = v;
      const g = tl.glyph, gs = 2, lyy = ty + 9;
      ui.img(g, tx + 8, lyy + Math.round(ui.cap('small') / 2 - g.height * gs / 2), { w: g.width * gs, h: g.height * gs, alpha: ta });
      ui.text(tl.label, tx + 12 + g.width * gs, lyy, { font: 'small', color: PAL.dim, alpha: ta });
      const land = k >= 1 ? Math.max(0, 1 - (t - t0 - 0.7) * 5) : 0;
      bigText(ui, tl.fmt(v), tx + tw2 / 2, ty + 28 - Math.round(land * 2), { cap: 18, color: land > 0 ? PAL.brass2 : PAL.cream, align: 'center', alpha: ta });
      if (tl.sub) ui.text(tl.sub, tx + tw2 / 2, ty + th - 13, { font: 'small', color: PAL.dim, align: 'center', alpha: ta });
      if (tl.badge && k >= 1) {
        // the record badge: a brass tag pinned on the tile's corner, pulsing
        const bw = ui.measure(tl.badge, 'small') + 18, bx = tx + tw2 - bw + 6, by = ty - 7;
        planes.draw(plate(bw, 14, 'brass'), bx, by);
        ui.img(GLYPH.star(), bx + 4, by + 4);
        ui.text(tl.badge, bx + 13, by + 3, { font: 'small', color: '#2a1a0c', shadow: null });
        if (Math.sin(t * 5) > 0.3) ui.fill(bx + 2, by + 1, bw - 4, 1, PAL.glint, 0.8);
      }
    });
    // MADE IT HOME: the saved loot on a shelf
    const sy = ty + th + 12, sh = H - (sy - y) - 50;
    const sa = Math.min(1, Math.max(0, (t - 1.6) * 4));
    const loot = this.loot;
    ui.text(loot.length ? `MADE IT HOME  -  ${loot.length} THING${loot.length > 1 ? 'S' : ''}` : 'MADE IT HOME', x + pad, sy, { font: 'body', color: PAL.brass2, alpha: sa });
    const shelfY = sy + ui.lh('body') + 2, shelfH = Math.max(40, sh - ui.lh('body') - 2);
    planes.draw(skin('inset', W - pad * 2, shelfH), x + pad, shelfY, { alpha: sa });
    // the shelf board the models stand on
    const boardY = shelfY + shelfH - 12;
    planes.draw(plate(W - pad * 2 - 12, 7, 'brass'), x + pad + 6, boardY, { alpha: sa });
    const kk = stage.ui.scale.x || 1;
    if (loot.length) {
      const slot = 58, per = Math.max(1, Math.floor((W - pad * 2 - 20) / slot));
      const shown = loot.slice(0, loot.length > per ? per - 1 : per);
      while (this.models.length < shown.length) { const m = itemModel(shown[this.models.length]); const c = contactShadow(1.1, 0.5, 0.45); c.position.set(0, -0.48, -0.3); c.rotation.x = -1.2; m.add(c); stage.ui.add(m); this.models.push(m); }
      const rowW = shown.length * slot;
      const x0 = ui.w / 2 - rowW / 2 + slot / 2;
      shown.forEach((id, i) => {
        const m = this.models[i];
        const k = Math.min(1, Math.max(0, (t - 1.75 - i * 0.07) * 5));
        m.visible = k > 0;
        if (!m.visible) return;
        const d = getItem(id);
        const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
        const drop = (1 - k) ** 2 * 26;
        const bounce = k >= 1 ? 0 : Math.sin(k * Math.PI) * 2;
        m.scale.setScalar(((slot - 12) / Math.max(cw, ch) / kk) * (0.7 + 0.3 * k));
        m.rotation.set(0.15, -0.5 + Math.sin(t * 0.9 + i) * 0.45, 0);
        stage.put(m, (x0 + i * slot) / kk, (boardY - (slot - 12) / 2 + 2 - drop - bounce) / kk, 60);
        // a rarity gem pinned to the shelf's front under each piece
        if (k > 0.9) gem(ui, x0 + i * slot, boardY + 3, RARITY_COLOR[d.rarity]);
        if (k > 0 && k < 0.25 && !this.ticked['m' + i]) { this.ticked['m' + i] = 1; audio.play('k_drop2', { vol: 0.2, dry: true, rate: 0.9 + i * 0.03 }); }
      });
      for (let i = shown.length; i < this.models.length; i++) this.models[i].visible = false;
      if (loot.length > shown.length) bigText(ui, `+${loot.length - shown.length}`, x0 + shown.length * slot - 6, boardY - 22, { cap: 12, color: PAL.cream, alpha: sa });
    } else {
      // the empty state: an empty kelp-tea bottle lying on the shelf and one friendly line
      if (!this.emptyProp) { this.emptyProp = hudModel('flaskEmpty'); stage.ui.add(this.emptyProp); }
      this.emptyProp.visible = sa > 0;
      this.emptyProp.scale.setScalar(26 / kk);
      this.emptyProp.rotation.set(0.2, Math.sin(t * 0.8) * 0.3, Math.PI / 2 - 0.15);
      stage.put(this.emptyProp, (x + pad + 40) / kk, (boardY - 9) / kk, 60);
      ui.text('Nothing made it home this time.', x + pad + 70, boardY - 32, { font: 'body', color: PAL.cream, alpha: sa });
      ui.text('Mail loot with the manatee: it stays safe even if you sink.', x + pad + 70, boardY - 32 + ui.lh('body'), { font: 'small', color: PAL.dim, alpha: sa });
    }
    // CONTINUE
    const ready = t > 2.0;
    const bw = 200, bh = 28, bx = Math.round(ui.w / 2 - bw / 2), by = y + H - P[3] - bh - 2;
    const ba = Math.min(1, Math.max(0, (t - 1.9) * 5));
    let go = false;
    if (ba > 0) {
      if (ready && Math.sin(t * 4) > 0.6) ui.fill(bx - 2, by - 2, bw + 4, bh + 4, PAL.brass2, 0.25);
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

/** a tiny cut gem (rarity) on the shelf's edge */
function gem(ui: PixelUI, x: number, y: number, col: string) {
  x = Math.round(x); y = Math.round(y);
  ui.fill(x - 2, y - 1, 5, 3, PAL.ink2); ui.fill(x - 1, y - 2, 3, 5, PAL.ink2);
  ui.fill(x - 1, y - 1, 3, 3, col); ui.fill(x - 1, y - 1, 1, 1, '#ffffff');
}
