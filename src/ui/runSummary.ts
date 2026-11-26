// The RUN SUMMARY (v6): the end of every journey as a SCENE, then an ornate carved board with what it came to.
//
//   LOST AT SEA   the death moment: deep water in hue-shifted bands, light shafts that fade away as the blobfish SINKS
//                 into the dark, tumbling slowly, eyes shut, a stream of bubbles leaving it and its straw hat drifting
//                 off upward; marine snow falls. It comes to rest on the seabed, and a SUNKEN NAMEBOARD heaves up out of
//                 the silt beside it: waterlogged grey planks, a cracked corner broken away, a rusted iron strap,
//                 heavy algae, barnacle clusters, coral crust and a starfish. The title is CARVED into it letter by
//                 letter (wood chips fly), the stats are inlaid in pale bone in carved recesses and count up.
//   SURFACED      celebratory: sunlit shallows, strong dancing shafts and a glittering surface line; the blobfish
//                 rises cheering, a varnished teak nameboard with gold-leaf inlay drops in on two ropes, sparkles
//   SENT HOME     celebratory, postal: twilight teal, parcels float up past on bubbles, a sea-green painted board
//                 with an airmail stripe border and postmark stamps drops in on ropes
//   (BACK HOME    the quit variant: the SENT HOME board in plain wood)
//
// Every variant: the loot that made it home sinks into a window of dark water set into the board (real 3D models
// bobbing over wet sand; an empty clam shell and one friendly line when nothing came home), then a big CONTINUE.
//
//   const card = new RunSummaryCard({ result: 'lost', depth: 182, distance: 940, time: 412, floors: 3,
//                                     kills: { fish: 31, giants: 2 }, loot: ['amethyst'], pearls: 37, record: true });
//   each frame inside ui.begin()/end():  if (card.draw(ui, dt) === 'continue') goHome();
//   (pass { stage, planes } of a Hud already on that PixelUI so the models share its lights)
//
// CONTINUE is the only exit: its button, Enter, Space, Esc or a click anywhere once the stats have landed.
import * as THREE from 'three';
import type { PixelUI } from './pixel/ui';
import { ITEMS, RARITY_COLOR, getItem } from '../game/items';
import { audio } from '../audio/audio';
import { UiStage, PlanePool } from './obj/stage';
import { itemModel } from '../backpack/models';
import { pixelize, ramp } from './obj/pixtex';
import { PAL, plate, bigText, bigMeasure, GLYPH, solid, caustics, kelp, Px, hash, barnacle, shell, nail, ropeV, ropeH, algaeEdge, ALGAE } from './obj/plates';
import { clamProp } from './obj/clam';
import { hudArt } from './hudArt';
import { BlobModel } from '../player/blobModel';
import { retro } from '../gfx/retro';

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
  /** what ended it ("Taken by the Fisherman") */
  cause?: string;
}

type Variant = 'lost' | 'surfaced' | 'mail' | 'quit';
interface Look {
  word: string; line: string;
  /** the board's wood, the title's inlay (fill, cut / outline), the stat values' inlay */
  wood: string; title: string; titleCut: string; value: string; label: string;
  /** the scene: water bands top -> bottom, the shafts' light, the seabed */
  sea: string[]; shaft: string; bed: string; bedDark: string;
}
const LOOKS: Record<Variant, Look> = {
  lost: {
    word: 'LOST AT SEA', line: 'Your pack sank with you. What you mailed home is safe.',
    wood: '#7a6e5c', title: '#e8dcc0', titleCut: '#1a120a', value: '#efe4c8', label: '#b8ac90',
    sea: ['#1d4a5a', '#183e50', '#143446', '#102a3c', '#0c2232', '#091a28', '#06131e', '#040d16'], shaft: '#9fe0ff', bed: '#3a3a3a', bedDark: '#1a1a20',
  },
  surfaced: {
    word: 'SURFACED', line: 'You swam all the way back up. Everything came home.',
    wood: '#a8642a', title: '#f2c66d', titleCut: '#3a1a06', value: '#ffe8a8', label: '#f0d0a0',
    sea: ['#8ae0f0', '#5ac8e0', '#3ab0d0', '#2a98c0', '#2284b0', '#1a70a0', '#165e8e', '#124e7c'], shaft: '#ffffff', bed: '#e8d0a0', bedDark: '#b89a68',
  },
  mail: {
    word: 'SENT HOME', line: 'The manatee carried it all home.',
    wood: '#8a6a48', title: '#f3e7c9', titleCut: '#1a2a1a', value: '#f8f0d8', label: '#d8c8a0',
    sea: ['#3a9aa0', '#2e8890', '#26787e', '#1f686e', '#1a5a60', '#164c52', '#123e44', '#0e3238'], shaft: '#d8fff0', bed: '#c8aa7a', bedDark: '#8a6a48',
  },
  quit: {
    word: 'BACK HOME', line: 'You headed home early.',
    wood: '#8a6a48', title: '#f3e7c9', titleCut: '#2a1608', value: '#f8f0d8', label: '#d8c8a0',
    sea: ['#3a8aa8', '#2e7898', '#266888', '#1f5a78', '#1a4e6a', '#16425c', '#12384e', '#0e2e42'], shaft: '#d8f4ff', bed: '#c8aa7a', bedDark: '#8a6a48',
  },
};
const VAR_OF: Record<RunSummary['result'], Variant> = { lost: 'lost', surfaced: 'surfaced', extracted: 'mail', quit: 'quit' };

interface Tile { key: string; label: string; value: number; fmt: (v: number) => string; glyph: HTMLCanvasElement; sub?: string; badge?: string }

/** the soft body the summary's blobfish is driven with: still, with a slow breath */
const STILL = { t: 0, disp(_a: number, out: { x: number; y: number }) { out.x = 0; out.y = 0; return out; } };

export class RunSummaryCard {
  t = 0;
  private v: Variant;
  private L: Look;
  private landed = 0;
  private ticked: Record<string, number> = {};
  private carvedN = 0;
  private ownStage: UiStage | null = null;
  private ownPlanes: PlanePool | null = null;
  private models: THREE.Object3D[] = [];
  private emptyProp: THREE.Object3D | null = null;
  private loot: string[];
  private blob: BlobModel | null = null;
  private hat: THREE.Object3D | null = null;
  private hatV = new THREE.Vector3(); private hatR = new THREE.Euler(); private hatS = 1;
  private chips: { x: number; y: number; vx: number; vy: number; t: number; c: string }[] = [];
  private puffs: { x: number; y: number; t: number; r: number }[] = [];
  private vel = new THREE.Vector2();
  constructor(public s: RunSummary) {
    this.loot = (s.loot ?? []).filter((id) => ITEMS[id]);
    this.v = VAR_OF[s.result];
    this.L = LOOKS[this.v];
  }

  /** draw the card; returns 'continue' on the frame the player dismisses it */
  draw(ui: PixelUI, dt: number, o: { stage?: UiStage; planes?: PlanePool } = {}): 'continue' | null {
    this.t += dt;
    const s = this.s, t = this.t, L = this.L, lost = this.v === 'lost';
    // the 3D pieces need a stage and plates under them: a Hud's (shares its lights), else our own on this canvas
    let stage = o.stage, planes = o.planes;
    if (!stage || !planes) {
      if (!this.ownStage) { this.ownStage = new UiStage(); this.ownPlanes = new PlanePool(this.ownStage); }
      stage = this.ownStage; planes = this.ownPlanes!;
      stage.attach(ui); planes.begin();
      stage.ui.scale.setScalar(1);
    }
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) pixelize(stage.ui);
    const kk = stage.ui.scale.x || 1;
    ui.block(0, 0, ui.w, ui.h);
    const fadeIn = Math.min(1, t * 2.5);

    // ------------------------------------------------ the scene behind
    planes.draw(seaBackdrop(ui.w, ui.h, this.v), 0, 0, { w: ui.w, h: ui.h, alpha: fadeIn });
    // light shafts from the surface: they sway, and on a death they fade away as the blobfish sinks into the dark
    const shaftA = lost ? Math.max(0, 1 - t / 2.8) * 0.55 : 0.45 + 0.12 * Math.sin(t * 0.9);
    if (shaftA > 0.01) for (let i = 0; i < 4; i++) {
      const sx = ui.w * (0.12 + i * 0.24) + Math.sin(t * 0.4 + i * 1.7) * 14;
      planes.draw(shaftCanvas(L.shaft, 46 + (i % 2) * 18, ui.h), Math.round(sx), 0, { alpha: shaftA * fadeIn * (0.6 + 0.4 * Math.sin(t * 1.3 + i * 2.1)) });
    }
    // the dark closing in (a death): an ink veil thickening over the water
    if (lost) planes.draw(solid('#02060a'), 0, 0, { w: ui.w, h: ui.h, alpha: Math.min(0.55, t * 0.2) });
    planes.drawTiled(caustics(), 0, 0, ui.w, ui.h * 0.7, { tile: 160, ox: t * 0.012, oy: t * 0.008, alpha: (lost ? Math.max(0, 0.07 - t * 0.025) : 0.08) * fadeIn });
    // marine snow drifting down (a death) / sparkling motes rising (a win)
    for (let i = 0; i < 26; i++) {
      const lane = (i * 97.31) % ui.w, sp = 8 + (i % 5) * 3;
      const yy = lost ? ((t * sp + i * 41) % (ui.h + 10)) - 5 : ui.h - ((t * sp * 1.4 + i * 41) % (ui.h + 10)) + 5;
      const xx = lane + Math.sin(t * 0.7 + i) * 4;
      planes.draw(solid(lost ? '#a8c0c8' : '#ffffff'), Math.round(xx), Math.round(yy), { w: 1 + (i % 3 === 0 ? 1 : 0), h: 1, alpha: (lost ? 0.5 : 0.7) * fadeIn });
    }

    // sent home: parcels drifting up past on little bubble floats, toward the manatee's route home
    if (this.v === 'mail') for (let i = 0; i < 5; i++) {
      const ph = (t * 0.06 + i * 0.21) % 1, px = (i * 0.23 + 0.06) * ui.w + Math.sin(t * 0.8 + i) * 8, py = ui.h + 10 - ph * (ui.h + 30);
      const g = GLYPH.parcel(), b2 = GLYPH.bubble();
      planes.draw(b2, Math.round(px + 4), Math.round(py - 8), { w: b2.width * 2, h: b2.height * 2, alpha: 0.8 * fadeIn });
      planes.draw(g, Math.round(px), Math.round(py), { w: g.width * 2, h: g.height * 2, alpha: fadeIn });
    }
    // ------------------------------------------------ the board's place
    const W = Math.min(ui.w - 110, 500), H = Math.min(ui.h - 28, 300);
    const bx0 = Math.round((ui.w - W) / 2 + 26), byRest = Math.round((ui.h - H) / 2) + 2;
    // lost: it heaves up out of the silt; the others drop in on ropes and swing to rest
    const appear = lost ? 1.5 : 0.7;
    const k = Math.max(0, Math.min(1, (t - appear) / (lost ? 0.85 : 0.4)));
    const settle = lost ? 1 - (1 - k) ** 3 + Math.sin(Math.min(1, k) * Math.PI) * 0.04 : 1 - (1 - k) ** 2;
    const swing = lost ? 0 : Math.sin(t * 1.3) * Math.max(0, 1 - (t - appear) * 0.4) * 2 + Math.sin(t * 0.9) * 0.5;
    const bx = Math.round(bx0 + swing);
    const by = lost ? Math.round(byRest + (1 - settle) * (H + 40)) : Math.round(byRest - (1 - settle) * (byRest + H + 10));
    if (k >= 1 && this.landed === 0) {
      this.landed = 1;
      audio.play('thud_heavy1', { vol: 0.55, dry: true });
      audio.play(lost ? 'k_bong' : this.v === 'surfaced' ? 'jin_record' : 'jin_good', { vol: 0.4, dry: true });
      if (lost) for (let i = 0; i < 14; i++) this.puffs.push({ x: bx + 10 + (i / 13) * (W - 20), y: byRest + H - 4, t: -i * 0.02, r: 6 + (i % 4) * 3 });
      // a win: a burst of gold-leaf flecks and sea sparkles off the board as it lands
      else for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; this.chips.push({ x: bx + W / 2 + Math.cos(a) * 60, y: byRest + 40 + Math.sin(a) * 14, vx: Math.cos(a) * (90 + (i % 5) * 30), vy: -120 - (i % 7) * 25, t: -0.0, c: i % 3 === 0 ? '#ffffff' : this.v === 'surfaced' ? '#f2c66d' : i % 3 === 1 ? '#e0564a' : '#8ac8ff' }); }
    }
    const ba = k > 0 ? 1 : 0;

    // ------------------------------------------------ the blobfish
    this.drawBlob(ui, dt, stage, planes, kk, bx0, byRest, W, H);

    // ------------------------------------------------ the board
    if (ba > 0) {
      if (!lost) for (const rx of [bx + 44, bx + W - 50]) ropeDown(ui, rx, by + 3);
      planes.draw(nameboard(W, H, this.v), bx, by, { shadow: 5 });
      planes.drawTiled(caustics(), bx + 6, by + 6, W - 12, H - 12, { tile: 72, ox: t * 0.02, oy: t * 0.012, alpha: lost ? 0.1 : 0.2 });
    }
    // the silt the board heaves up (a death): sand puffs rolling out along its foot
    for (const p of this.puffs) {
      p.t += dt; if (p.t < 0) continue;
      const a = Math.max(0, 1 - p.t / 1.2), r = p.r * (0.6 + p.t * 0.9);
      silt(ui, p.x, p.y - p.t * 6, r, a * 0.8);
    }
    this.puffs = this.puffs.filter((p) => p.t < 1.2);
    if (ba <= 0) { this.hideModels(); return null; }
    const T0 = appear + (lost ? 0.85 : 0.4);

    // ------------------------------------------------ the title, carved letter by letter
    const word = L.word, cap = 24;
    const tw = bigMeasure(ui, word, { cap, outline: null, shadow: null });
    const tyy = by + 20;
    const letters = [...word];
    let lx = bx + W / 2 - tw / 2;
    letters.forEach((ch, i) => {
      const lt = t - T0 - 0.1 - i * 0.06;
      const w2 = bigMeasure(ui, ch === ' ' ? 'I' : ch, { cap, outline: null, shadow: null });
      if (lt > 0 && ch !== ' ') {
        if (i + 1 > this.carvedN) { this.carvedN = i + 1; this.chipBurst(lx + w2 / 2, tyy + cap / 2, L.wood); if (i % 2 === 0) audio.play('k_tick1', { vol: 0.16, dry: true, rate: 0.6 + i * 0.03 }); }
        const pop = Math.max(0, 1 - lt * 8);
        carve(ui, ch, lx, tyy - pop * 3, cap, L, Math.min(1, lt * 10));
      }
      lx += ch === ' ' ? w2 * 0.7 : w2;
    });
    // the wood chips the carving throws off
    for (const c of this.chips) {
      c.t += dt; c.vy += dt * 160; c.vx *= 1 - dt * 1.5; c.x += c.vx * dt + Math.sin(c.t * 9 + c.vx) * 0.3; c.y += c.vy * dt;
      const life = lost ? 0.6 : 1.4, a = Math.max(0, 1 - c.t / life), tw = Math.floor(c.t * 12 + c.vx) % 2 === 0;
      ui.fill(Math.round(c.x), Math.round(c.y), tw ? 2 : 1, tw ? 1 : 2, c.c, a); ui.fill(Math.round(c.x) + (tw ? 0 : 1), Math.round(c.y) + 1, 1, 1, ramp(c.c)[1], a);
    }
    this.chips = this.chips.filter((c) => c.t < (lost ? 0.6 : 1.4));
    // sea-glass gems / gold studs either side of the title once it is cut
    const titleEnd = T0 + 0.1 + letters.length * 0.06, titleDone = t - titleEnd;
    if (titleDone > 0) for (const gx of [bx + W / 2 - tw / 2 - 20, bx + W / 2 + tw / 2 + 8]) seaGlass(ui, gx, tyy + cap / 2 - 5, lost ? '#7ab8c8' : this.v === 'surfaced' ? '#f2c66d' : '#a6e07a');
    // the cause / the line under it, carved small
    const la = Math.min(1, Math.max(0, (titleDone - 0.05) * 4));
    carvedLine(ui, s.cause ?? L.line, bx + W / 2, by + 52, la, L);

    // ------------------------------------------------ the stats, inlaid in carved recesses, counting up in turn
    const tiles: Tile[] = [{ key: 'depth', label: 'DEEPEST', value: Math.round(s.depth), fmt: (v) => `-${v} M`, glyph: GLYPH.down(), sub: s.floors ? `${s.floors} STAGE${s.floors > 1 ? 'S' : ''}` : undefined, badge: s.record ? 'NEW RECORD' : undefined }];
    if (s.distance !== undefined) tiles.push({ key: 'far', label: 'FROM HOME', value: Math.round(s.distance), fmt: (v) => `${v} M`, glyph: GLYPH.house() });
    if (s.time !== undefined) tiles.push({ key: 'time', label: 'TIME', value: Math.round(s.time), fmt: (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`, glyph: GLYPH.clock() });
    if (s.kills) tiles.push({ key: 'kills', label: 'FISH BEATEN', value: s.kills.fish, fmt: (v) => String(v), glyph: GLYPH.fish(), sub: s.kills.giants ? `+ ${s.kills.giants} GIANT${s.kills.giants > 1 ? 'S' : ''}` : undefined });
    if (s.pearls !== undefined) tiles.push({ key: 'pearls', label: 'PEARLS', value: s.pearls, fmt: (v) => String(v), glyph: hudArt('pearl') });
    const lx0 = bx + 30, rx0 = bx + W - 30, ty = by + 68, th = 60, gap = 5;
    const colW = Math.floor((rx0 - lx0 + gap) / tiles.length);
    tiles.forEach((tl, i) => {
      const t0 = titleEnd + 0.25 + i * 0.2, kk2 = Math.min(1, Math.max(0, (t - t0) / 0.7));
      const ta = Math.min(1, Math.max(0, (t - t0) * 6));
      const cx = lx0 + i * colW, cw = colW - gap;
      // the recess is cut first (it pops in), then the value counts up
      if (t > t0 - 0.12) planes.draw(recess(cw, th, this.v), cx, ty, { alpha: Math.min(1, (t - t0 + 0.12) * 8) });
      if (ta <= 0) return;
      const v = Math.round(tl.value * (1 - (1 - kk2) ** 3));
      if (v !== this.ticked[tl.key] && kk2 < 1 && Math.floor(t * 30) !== Math.floor((t - dt) * 30)) audio.play('k_tick1', { vol: 0.12, dry: true, rate: 0.8 + kk2 * 0.7 });
      if (kk2 >= 1 && this.ticked[tl.key] !== tl.value) audio.play('k_tick2', { vol: 0.3, dry: true });
      this.ticked[tl.key] = v;
      // the label with its glyph (the glyph steps back to 1x, then out, when the recess is narrow)
      const g = tl.glyph, tw0 = ui.measure(tl.label, 'small'), lyy = ty + 7;
      const gs = g.width * 2 + 4 + tw0 <= cw - 10 ? 2 : g.width + 3 + tw0 <= cw - 8 ? 1 : 0;
      const lw = (gs ? g.width * gs + 4 : 0) + tw0;
      const gx0 = Math.round(cx + cw / 2 - lw / 2);
      if (gs) ui.img(g, gx0, lyy + Math.round(ui.cap('small') / 2 - g.height * gs / 2), { w: g.width * gs, h: g.height * gs, alpha: ta });
      ui.text(tl.label, gx0 + (gs ? g.width * gs + 4 : 0), lyy, { font: 'small', color: L.label, shadow: '#0a0604', alpha: ta });
      const land = kk2 >= 1 ? Math.max(0, 1 - (t - t0 - 0.7) * 5) : 0;
      const vs = tl.fmt(v), vcap = bigMeasure(ui, tl.fmt(tl.value), { cap: 18 }) > cw - 8 ? 14 : 18;
      bigText(ui, vs, cx + cw / 2, ty + 23 + (18 - vcap) / 2 - Math.round(land * 2), { cap: vcap, color: land > 0 ? '#ffffff' : L.value, color2: lost ? '#c8bca0' : undefined, outline: '#140a04', shadow: '#000000', align: 'center', alpha: ta });
      if (tl.badge && kk2 >= 1) {
        // the record: a red wax seal under the number, pressed in with a bounce
        const bw = Math.min(cw - 2, ui.measure(tl.badge, 'small') + 18), bxx = Math.round(cx + cw / 2 - bw / 2), byy = ty + 44;
        const pulse = Math.max(0, 1 - (t - t0 - 0.7) * 2);
        planes.draw(plate(bw, 13, 'ribbon', { rim: '#b8342c' }), bxx, byy - Math.round(pulse * 2));
        ui.img(GLYPH.star(), bxx + 4, byy + 3 - Math.round(pulse * 2));
        ui.text(tl.badge, bxx + 14, byy + 3 - Math.round(pulse * 2), { font: 'small', color: '#fff0e0', shadow: '#3a0a08' });
      } else if (tl.sub) ui.text(tl.sub, cx + cw / 2, ty + 45, { font: 'small', color: L.label, shadow: '#0a0604', align: 'center', alpha: ta });
    });

    // ------------------------------------------------ MADE IT HOME: a window of dark water set into the board
    const T2 = titleEnd + 0.35 + tiles.length * 0.2 + 0.3;
    const wy = ty + th + 17, wh = Math.max(50, by + H - 50 - wy);
    const sa = Math.min(1, Math.max(0, (t - T2) * 4));
    planes.draw(plate(rx0 - lx0 + 8, wh + 8, 'brass'), lx0 - 4, wy - 4, { alpha: sa });
    planes.draw(plate(rx0 - lx0, wh, 'well', { face: '#123a44' }), lx0, wy, { alpha: sa });
    planes.draw(solid('#c8aa7a'), lx0 + 2, wy + wh - 9, { w: rx0 - lx0 - 4, h: 7, alpha: sa });
    planes.draw(solid('#e2c898'), lx0 + 2, wy + wh - 9, { w: rx0 - lx0 - 4, h: 1, alpha: sa });
    planes.draw(solid('#a88a5a'), lx0 + 2, wy + wh - 4, { w: rx0 - lx0 - 4, h: 1, alpha: sa });
    planes.drawTiled(caustics(), lx0 + 2, wy + 2, rx0 - lx0 - 4, wh - 4, { tile: 150, ox: -t * 0.018, oy: t * 0.012, alpha: 0.08 * sa });
    const loot = this.loot;
    const lbl = loot.length ? `MADE IT HOME - ${loot.length} THING${loot.length > 1 ? 'S' : ''}` : 'MADE IT HOME';
    const pw = ui.measure(lbl, 'small') + 28;
    planes.draw(plate(pw, 18, 'brass'), lx0 + 10, wy - 13, { alpha: sa });
    ui.text(lbl, lx0 + 24, wy - 13 + Math.round((18 - ui.cap('small')) / 2), { font: 'small', color: '#2a1608', shadow: null, alpha: sa });
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.18 + i * 0.173) % 1, bx2 = lx0 + 16 + ((i * 97) % Math.max(1, rx0 - lx0 - 32));
      ui.img(i % 2 ? GLYPH.bubbleS() : GLYPH.bubble(), Math.round(bx2 + Math.sin(t * 2 + i) * 2), Math.round(wy + wh - 10 - ph * (wh - 14)), { alpha: 0.6 * sa });
    }
    const floorY = wy + wh - 8;
    if (loot.length) {
      const slot = 56, per = Math.max(1, Math.floor((rx0 - lx0 - 10) / slot));
      const shown = loot.slice(0, loot.length > per ? per - 1 : per);
      while (this.models.length < shown.length) { const m = itemModel(shown[this.models.length]); stage.ui.add(m); this.models.push(m); }
      const rowW = shown.length * slot;
      const x0 = (lx0 + rx0) / 2 - rowW / 2 + slot / 2;
      shown.forEach((id, i) => {
        const m = this.models[i];
        const k3 = Math.min(1, Math.max(0, (t - T2 - 0.15 - i * 0.07) * 4));
        m.visible = k3 > 0;
        if (!m.visible) return;
        const d = getItem(id);
        const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
        const size = Math.min(slot - 12, wh - 18);
        const sink = (1 - k3) ** 2 * (wh * 0.6), bob = Math.sin(t * 1.4 + i * 0.9) * 2;
        m.scale.setScalar((size / Math.max(cw, ch) / kk) * (0.75 + 0.25 * k3));
        m.rotation.set(0.15, -0.5 + Math.sin(t * 0.7 + i) * 0.5, Math.sin(t * 1.1 + i) * 0.08);
        stage.put(m, (x0 + i * slot) / kk, (floorY - size / 2 - 3 - sink + bob) / kk, 60);
        if (k3 > 0.9) seaGlass(ui, x0 + i * slot - 3, floorY - 1, RARITY_COLOR[d.rarity], true);
        if (k3 > 0 && k3 < 0.25 && !this.ticked['m' + i]) { this.ticked['m' + i] = 1; audio.play('k_drop2', { vol: 0.2, dry: true, rate: 0.9 + i * 0.03 }); }
      });
      for (let i = shown.length; i < this.models.length; i++) this.models[i].visible = false;
      if (loot.length > shown.length) bigText(ui, `+${loot.length - shown.length}`, x0 + shown.length * slot - 14, floorY - 26, { cap: 12, color: PAL.cream, alpha: sa });
    } else {
      // the empty state: an empty clam shell on the sand and one friendly line
      if (!this.emptyProp) { this.emptyProp = clampEmpty(); stage.ui.add(this.emptyProp); }
      this.emptyProp.visible = sa > 0;
      this.emptyProp.scale.setScalar(40 / kk);
      this.emptyProp.rotation.set(0.1, 0.4 + Math.sin(t * 0.8) * 0.15, 0);
      stage.put(this.emptyProp, (lx0 + 40) / kk, (floorY - 12 + Math.sin(t * 1.2)) / kk, 60);
      ui.text('Nothing made it home this time.', lx0 + 74, floorY - 32, { font: 'body', color: PAL.cream, alpha: sa });
      ui.text('Mail loot with the manatee: it stays safe even if you sink.', lx0 + 74, floorY - 32 + ui.lh('body'), { font: 'small', color: PAL.dim, alpha: sa });
    }
    // kelp draped over the board's top corners, swaying (drawn last: it hangs in front)
    kelp(ui, bx + 8, by - 2, lost ? 70 : 52, t, 0, 1);
    kelp(ui, bx + 15, by - 1, lost ? 44 : 30, t, 1.7, 1);
    kelp(ui, bx + W - 12, by - 2, lost ? 56 : 40, t, 3.1, 1);
    if (lost) kelp(ui, bx + W - 19, by - 1, 30, t, 4.4, 1);

    // ------------------------------------------------ CONTINUE
    const T3 = T2 + 0.35;
    const ready = t > T3 + 0.1;
    const bw = 200, bh = 28, bxx = Math.round(bx + W / 2 - bw / 2), byy = by + H - bh - 14;
    const bba = Math.min(1, Math.max(0, (t - T3) * 5));
    let go = false;
    if (bba > 0) {
      if (ready && Math.sin(t * 4) > 0.6) ui.fill(bxx - 2, byy - 2, bw + 4, bh + 4, PAL.brass2, 0.3);
      go = ui.button('runsum:continue', 'CONTINUE', bxx, byy, bw, bh, { style: 'green', key: 'Enter', disabled: !ready, font: 'title' });
    }
    // impatient? a press during the reveal jumps straight to the finished card (the next press continues)
    if (!ready && t > 0.6 && (ui.input?.keyHit('Enter') || ui.input?.keyHit('Space') || ui.input?.keyHit('Escape') || ui.pressed)) this.t = Math.max(this.t, T3 + 0.12);
    if (ready && (go || ui.input?.keyHit('Space') || ui.input?.keyHit('Escape') || (ui.pressed && !ui.hover(bxx, byy, bw, bh)))) {
      for (const m of this.models) m.removeFromParent();
      this.emptyProp?.removeFromParent();
      this.blob?.root.removeFromParent(); this.hat?.removeFromParent();
      this.ownStage?.detach();
      return 'continue';
    }
    return null;
  }

  private hideModels() { for (const m of this.models) m.visible = false; if (this.emptyProp) this.emptyProp.visible = false; }

  private chipBurst(x: number, y: number, wood: string) {
    const W = ramp(wood);
    for (let i = 0; i < 6; i++) this.chips.push({ x: x + (i - 2.5) * 2, y, vx: (i - 2.5) * 22, vy: -40 - (i % 3) * 18, t: 0, c: W[4 + (i % 2)] });
  }

  /** the blobfish of the scene: sinking dead (its hat drifting off) or rising / bobbing happily */
  private drawBlob(ui: PixelUI, dt: number, stage: UiStage, planes: PlanePool, kk: number, bx0: number, byRest: number, W: number, H: number) {
    const t = this.t, lost = this.v === 'lost';
    if (!this.blob) {
      try {
        const m = new BlobModel({ weapon: 'toothpick', armor: 'none', hat: 'kasa', back: 'none' });
        m.weaponVisible = false;
        m.play(lost ? 'idle' : 'cheer');
        m.root.traverse((ob) => { const me = ob as THREE.Mesh; if (!me.isMesh) return; for (const mt of Array.isArray(me.material) ? me.material : [me.material]) retro(mt, { snap: 0 }); });
        m.root.userData.noPixel = true;
        this.blob = m;
      } catch (e) { console.warn('[summary] blob failed', e); }
    }
    const m = this.blob;
    if (!m) return;
    // the path (UI px): a death sinks from the top into the dark beside the board and settles on the seabed; a win
    // rises from below to bob beside the board near the light
    const restX = Math.max(26, bx0 - 30), restY = lost ? ui.h - 36 : byRest + 46;
    const startX = ui.w * 0.42, startY = lost ? -30 : ui.h + 40;
    const k = Math.min(1, t / (lost ? 2.9 : 1.6));
    const e = lost ? 1 - (1 - k) ** 2 : 1 - (1 - k) ** 3;
    const sway = lost ? Math.sin(t * 1.3) * 18 * (1 - k) : Math.sin(t * 2.2) * 3;
    const x = startX + (restX - startX) * e + sway;
    const y = startY + (restY - startY) * e + (lost ? 0 : Math.sin(t * 2.6) * 3);
    const size = lost ? 34 + 6 * k : 36;
    m.root.scale.setScalar(size / kk);
    // tumbling as it sinks, lying on its side at rest; a win faces out, cheering
    if (lost) { m.root.rotation.set(0, -0.62 + Math.sin(t * 0.6) * 0.35 * (1 - k), (1 - k) * Math.sin(t * 0.9) * 0.7 + k * 0.55); m.setExpression('dead'); m.bloat = 0.4 + k * 0.6; }
    else { m.root.rotation.set(0, -0.62, Math.sin(t * 2.2) * 0.08); m.setExpression('cheer'); }
    if (lost && k >= 1 && !this.ticked.rest) { this.ticked.rest = 1; audio.play('k_drop2', { vol: 0.25, dry: true, rate: 0.6 }); for (let i = 0; i < 6; i++) this.puffs.push({ x: x - 16 + i * 6, y: y + 14, t: -i * 0.03, r: 5 }); }
    STILL.t = t;
    m.update(dt, { sb: STILL, swim: lost ? 0 : 0.6, time: t, vel: this.vel });
    stage.put(m.root, x / kk, y / kk, 120);
    m.root.visible = true;
    // the hat drifts off (a death): it lifts away from the head, tumbling slowly up and aside
    if (lost && t > 0.7 && !this.hat && m.parts.hat) {
      const h = m.parts.hat.root;
      m.root.updateMatrixWorld(true);
      stage.ui.attach(h);
      // (the model no longer drives it: its gear pop-in would reset the scale every frame)
      delete m.parts.hat;
      h.userData.noPixel = true;
      this.hat = h; this.hatV.set(-16, 30, 0); this.hatR.copy(h.rotation); this.hatS = h.scale.x;
    }
    if (this.hat) {
      const h = this.hat;
      this.hatV.y = Math.max(5, this.hatV.y - dt * 4); this.hatV.x *= 1 - dt * 0.4;
      h.position.x += (this.hatV.x + Math.sin(t * 1.6) * 10) * dt / kk;
      h.position.y += this.hatV.y * dt / kk;
      // a lazy rocking tumble (never flipping over), shrinking a little as it drifts off into the distance
      h.rotation.z = this.hatR.z + Math.sin(t * 0.9) * 0.5; h.rotation.x = this.hatR.x + Math.sin(t * 0.6) * 0.35;
      h.scale.setScalar(this.hatS * Math.max(0.6, 1 - (t - 0.7) * 0.08));
      h.visible = -h.position.y * kk > -30;
    }
    // bubbles leaving it: a stream while it sinks (thinning out), a happy trail when it rises
    const n = lost ? Math.round(10 * Math.max(0, 1 - t / 3.5)) + 1 : 6;
    for (let i = 0; i < n; i++) {
      const ph = (t * (0.5 + (i % 3) * 0.12) + i * 0.37) % 1;
      const bxx = x + 6 + Math.sin(t * 3 + i * 1.3) * 3 + (i % 2) * 4, byy = y - 8 - ph * (lost ? 70 : 50);
      const g = i % 3 === 0 ? GLYPH.bubble() : GLYPH.bubbleS();
      planes.draw(g, Math.round(bxx), Math.round(byy), { alpha: (1 - ph) * 0.85, z: -200 });
    }
  }
}

// ------------------------------------------------------------------ painted pieces
/** the sea behind: hue-shifted bands with wavy stepped edges, a seabed silhouette (rocks, kelp, a wreck's ribs) */
const seaCache = new Map<string, HTMLCanvasElement>();
function seaBackdrop(w: number, h: number, v: Variant): HTMLCanvasElement {
  const key = `${w}|${h}|${v}`;
  let c = seaCache.get(key);
  if (c) return c;
  const L = LOOKS[v], p = new Px(w, h), S = L.sea;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = (y + Math.round(Math.sin(x * 0.045 + y * 0.01) * 3 + Math.sin(x * 0.013) * 4)) / h;
    const i = Math.max(0, Math.min(S.length - 1, Math.floor(f * S.length)));
    p.set(x, y, S[i]);
  }
  // the surface (a win): a glittering wavy line of light along the top
  if (v !== 'lost') for (let x = 0; x < w; x++) { const yy = 4 + Math.round(Math.sin(x * 0.09) * 2 + Math.sin(x * 0.031) * 2); p.set(x, yy, '#ffffff'); p.set(x, yy + 1, ramp(S[0])[4]); if (x % 7 < 3) p.set(x, yy - 1, '#e8fcff'); }
  // the seabed: a sand profile, rocks with lit tops, kelp silhouettes, and a sunken wreck's ribs on a death
  const B = ramp(L.bed), D = ramp(L.bedDark);
  const bedY = (x: number) => Math.round(h - 18 - Math.sin(x * 0.02) * 5 - Math.sin(x * 0.057 + 1) * 3);
  for (let x = 0; x < w; x++) { const by = bedY(x); for (let y = by; y < h; y++) p.set(x, y, y === by ? B[4] : y < by + 3 ? B[3] : (x + y) % 9 === 0 ? B[1] : B[2]); }
  for (const [rx, rw, rh] of [[0.08, 34, 18], [0.3, 22, 12], [0.7, 40, 22], [0.92, 26, 14]] as [number, number, number][]) {
    const cx = Math.round(rx * w);
    for (let dx = -rw; dx <= rw; dx++) { const top = Math.round(rh * Math.sqrt(Math.max(0, 1 - (dx / rw) ** 2))); const base = bedY(cx + dx) + 3; for (let k = 0; k < top; k++) p.set(cx + dx, base - k, k === top - 1 ? D[4] : k > top - 4 ? D[3] : dx > rw * 0.3 ? D[1] : D[2]); }
  }
  if (v === 'lost') {
    // the wreck: a broken hull's ribs curving out of the sand, dark against the deep
    for (let r = 0; r < 5; r++) {
      const rx = Math.round(w * 0.55 + r * 16);
      for (let k = 0; k < 40 - r * 4; k++) { const xx = rx + Math.round(Math.sin(k * 0.05) * 10), yy = bedY(rx) + 2 - k; p.set(xx, yy, D[1]); p.set(xx + 1, yy, D[0]); p.set(xx + 2, yy, D[0]); }
    }
  }
  const K = v === 'lost' ? ['#0a1a14', '#12281e'] : ['#1f4a16', '#3a7a28'];
  for (let i = 0; i < 9; i++) {
    const kx = Math.round((i * 0.113 + 0.04) * w), len = 26 + (i * 13) % 30;
    for (let k = 0; k < len; k++) { const xx = kx + Math.round(Math.sin(k * 0.18 + i) * 3); p.set(xx, bedY(kx) - k, K[0]); p.set(xx + 1, bedY(kx) - k, K[1]); if (k % 6 === 2) { p.set(xx + 2, bedY(kx) - k, K[1]); p.set(xx - 1, bedY(kx) - k - 1, K[0]); } }
  }
  c = p.done();
  seaCache.set(key, c);
  return c;
}
/** a light shaft: a slanted beam in three translucent bands, fading toward the bottom (stepped, not smooth) */
const shaftCache = new Map<string, HTMLCanvasElement>();
function shaftCanvas(col: string, w: number, h: number): HTMLCanvasElement {
  const key = `${col}|${w}|${h}`;
  let c = shaftCache.get(key);
  if (c) return c;
  const p = new Px(w + Math.round(h * 0.35), h);
  for (let y = 0; y < h; y++) {
    const off = Math.round(y * 0.35), fade = 1 - y / h, a = Math.round(fade * 4) / 4;
    for (let x = 0; x < w; x++) {
      const e = Math.min(x, w - 1 - x) / (w / 2);
      const al = e < 0.25 ? 18 : e < 0.6 ? 34 : 52;
      p.set(x + off, y, col, Math.round(al * a));
    }
  }
  c = p.done();
  shaftCache.set(key, c);
  return c;
}
/** a little sand puff (silt) on the UI canvas */
function silt(ui: PixelUI, x: number, y: number, r: number, a: number) {
  const R = Math.max(2, Math.round(r));
  for (let dy = -R; dy <= R; dy++) { const wd = Math.round(Math.sqrt(R * R - dy * dy)); ui.fill(Math.round(x - wd), Math.round(y + dy), wd * 2, 1, dy < -R / 3 ? '#d8c8a0' : '#b8a47a', a * (dy < 0 ? 0.6 : 0.8)); }
}
/** a hanging rope from the top of the screen down to y */
function ropeDown(ui: PixelUI, rx: number, y: number) {
  for (let yy = -2; yy < y; yy++) {
    const ph = ((yy % 4) + 4) % 4;
    ui.fill(rx, yy, 1, 1, '#2a1a0c'); ui.fill(rx + 5, yy, 1, 1, '#2a1a0c');
    ui.fill(rx + 1, yy, 4, 1, ph === 0 ? '#6a4a24' : ph === 1 ? '#f0d49a' : ph === 2 ? '#d8b878' : '#b08a52');
  }
}

/** a carved letter: the cut (a dark recess, its upper-left wall in shadow), the inlay / paint in it, a lit lower lip */
function carve(ui: PixelUI, ch: string, x: number, y: number, cap: number, L: Look, a: number) {
  bigText(ui, ch, x + 1, y + 1, { cap, color: ramp(L.wood)[5], outline: ramp(L.wood)[4], shadow: null, alpha: a });
  bigText(ui, ch, x - 1, y - 1, { cap, color: L.titleCut, outline: L.titleCut, shadow: null, alpha: a });
  bigText(ui, ch, x, y, { cap, color: L.title, color2: ramp(L.title)[2], outline: L.titleCut, shadow: null, alpha: a });
}
/** a carved line of small text: a dark cut with a lit lower lip, centred */
function carvedLine(ui: PixelUI, str: string, x: number, y: number, alpha: number, L: Look) {
  ui.text(str, x + 1, y + 1, { font: 'body', color: ramp(L.wood)[5], shadow: null, align: 'center', alpha });
  ui.text(str, x, y, { font: 'body', color: L.titleCut, shadow: null, align: 'center', alpha });
}
/** a rounded piece of sea glass (a pebble of the colour, frosted rim, a glint) */
function seaGlass(ui: PixelUI, x: number, y: number, col: string, small = false) {
  const R = ramp(col);
  x = Math.round(x); y = Math.round(y);
  if (small) { ui.fill(x + 1, y, 4, 4, PAL.ink2); ui.fill(x, y + 1, 6, 2, PAL.ink2); ui.fill(x + 1, y + 1, 4, 2, R[3]); ui.fill(x + 1, y + 1, 2, 1, R[5]); return; }
  const rows = ['...kkkkk...', '.kkfffffkk.', 'kffllllllfk', 'kfllwlllllk', 'kflllllllmk', 'kfmmmmmmmmk', '.kmmddddmk.', '..kkkkkkk..'];
  const pal: Record<string, string> = { k: PAL.ink2, f: R[4], l: R[3], m: R[2], d: R[1], w: '#ffffff' };
  rows.forEach((r, yy) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) ui.fill(x + i, y + yy + 1, 1, 1, c); } });
}
function clampEmpty() { const g = clamProp('empty'); return g; }

/**
 * a carved RECESS for one stat: cut into the board (a deep shadow along the top / left walls, a lit lip along the
 * bottom / right), its floor in the board's wood a few steps darker with two grain lines, a pale inlay rule near the
 * top under the label, and small brass pins in the corners
 */
const recessCache = new Map<string, HTMLCanvasElement>();
function recess(w: number, h: number, v: Variant): HTMLCanvasElement {
  const key = `${w}|${h}|${v}`;
  let c = recessCache.get(key);
  if (c) return c;
  const L = LOOKS[v], W = ramp(L.wood), F = ramp(ramp(L.wood)[1]), p = new Px(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    let col: string;
    if (d === 0) col = y === h - 1 || x === w - 1 ? W[5] : '#0a0604';
    else if (d === 1 && (y === 1 || x === 1)) col = '#120a04';
    else if (d === 2 && (y === 2 || x === 2)) col = F[0];
    else if (d === 1) col = W[4];
    else {
      col = y < h * 0.35 ? F[2] : F[3];
      const g1 = Math.round(h * 0.55 + Math.sin(x * 0.12) * 2), g2 = Math.round(h * 0.8 + Math.sin(x * 0.08 + 2) * 1.5);
      if (y === g1 && x % 23 < 16) col = F[1]; else if (y === g2 && x % 19 < 9) col = F[1]; else if (y === g1 + 1 && x % 23 < 6) col = F[4];
    }
    p.set(x, y, col);
  }
  // an inlay rule under the label
  const ry = 19;
  for (let x = 8; x < w - 8; x++) { p.set(x, ry, v === 'lost' ? '#8a8270' : v === 'surfaced' ? '#c8913a' : '#b8a074'); p.set(x, ry + 1, F[0]); }
  // brass pins in the corners
  for (const [px, py] of [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5]]) { p.set(px, py, v === 'lost' ? '#8a6a3a' : '#f2c66d'); p.set(px + 1, py, '#5a3a14'); p.set(px, py + 1, '#5a3a14'); }
  if (v === 'lost') { barnacle(p, w - 6, h - 6, false); for (let x = 3; x < w - 3; x++) if ((x * 7) % 11 < 5) p.over(x, h - 3, ALGAE[2]); }
  c = p.done();
  recessCache.set(key, c);
  return c;
}

/** a coral crust: a cluster of rounded knobs in a hue-shifted coral ramp, each lit top-left with a dark pore */
function coral(p: Px, cx: number, cy: number, col: string, n = 6) {
  const C = ramp(col);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, r = 2 + (i % 3), ox = Math.round(Math.cos(a) * (2 + i * 1.4)), oy = Math.round(Math.sin(a) * (1.5 + i));
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d > r * r + 1) continue;
      const c = d > r * r - r ? C[0] : dx + dy < -r * 0.6 ? C[5] : dx + dy < 0 ? C[4] : dx + dy > r * 0.8 ? C[2] : C[3];
      p.set(cx + ox + dx, cy + oy + dy, c);
    }
    p.set(cx + ox, cy + oy, C[1]);
  }
}
/** a five-armed starfish, ramp-shaded with dotted ridges */
function starfish(p: Px, cx: number, cy: number, col = '#e8803a') {
  const C = ramp(col);
  for (let arm = 0; arm < 5; arm++) {
    const a = -Math.PI / 2 + arm * (Math.PI * 2 / 5) + 0.2;
    for (let r = 0; r < 9; r++) {
      const wd = Math.max(0, 2.6 - r * 0.28);
      for (let k = -Math.ceil(wd); k <= Math.ceil(wd); k++) {
        const x = cx + Math.cos(a) * r - Math.sin(a) * k, y = cy + Math.sin(a) * r + Math.cos(a) * k;
        const edge = Math.abs(k) >= wd - 0.3;
        p.set(x, y, edge ? C[0] : k < 0 ? C[4] : C[3]);
      }
      if (r % 2 === 1 && r < 8) p.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, C[5]);
    }
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) p.set(cx + dx, cy + dy, dx + dy < 0 ? C[4] : C[3]);
  p.set(cx, cy, C[1]);
}

/**
 * the NAMEBOARD (W x H): three to four thick planks with deep wavy grain, knots and dark seams, a carved border
 * groove with a rope-twist moulding, and per variant:
 *   lost      waterlogged grey wood, a split plank and the top-right corner broken away in a jagged bite, a rusted
 *             iron strap with rivets over both ends, heavy algae along the bottom and up the left, barnacle clusters,
 *             coral crusts and a starfish, a snagged rope end
 *   surfaced  bright varnished teak, a gold-leaf double inlay border, brass corner caps with screws, a little kelp
 *   mail      a sea-green painted border with an airmail stripe, two postmark stamps on the top corners, brass caps
 */
const boardCache = new Map<string, HTMLCanvasElement>();
function nameboard(w: number, h: number, v: Variant): HTMLCanvasElement {
  const key = `${w}|${h}|${v}`;
  let cv = boardCache.get(key);
  if (cv) return cv;
  const L = LOOKS[v], p = new Px(w, h), W = ramp(L.wood);
  const PW = [ramp(ramp(L.wood)[4]), W, ramp(ramp(L.wood)[2])].map((r, k) => (k === 1 ? r : r.map((c, j) => (j === 0 ? W[0] : c))));
  const lost = v === 'lost';
  const n = 4, ph = (h - 6) / n;
  // the broken corner (lost): a jagged bite out of the top right
  const bite = (x: number, y: number) => lost && x > w - 70 && y < 46 && (x - (w - 70)) * 0.62 + (46 - y) * 0.9 + Math.round(Math.sin(x * 0.9) * 3 + Math.sin(y * 1.3) * 2) > 52;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !((x < 3 || x > w - 4) && (y < 3 || y > h - 4) && Math.min(x, w - 1 - x) + Math.min(y, h - 1 - y) < 3) && !bite(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) { p.set(x, y, '#140a04'); continue; }
    if (!inside(x - 2, y) || !inside(x, y - 2)) { p.set(x, y, W[5]); continue; }
    if (!inside(x + 2, y) || !inside(x, y + 2)) { p.set(x, y, W[1]); continue; }
    const i = Math.min(n - 1, Math.floor((y - 3) / ph)), sy = y - 3 - Math.round(i * ph), plH = Math.round((i + 1) * ph) - Math.round(i * ph);
    if (i > 0 && sy === 0) { p.set(x, y, '#1a0e06'); continue; }
    if (i > 0 && sy === 1) { p.set(x, y, W[1]); continue; }
    // each plank its own board: alternate planks a step lighter / darker (a different log)
    const P = i % 2 ? W : PW[i % 3];
    let c = sy === 2 ? P[5] : sy === 3 ? P[4] : sy >= plH - 2 ? P[2] : P[3];
    // deep wavy grain: six lines per plank, broken into long runs, a lit line riding some of them
    for (let g = 0; g < 6; g++) {
      const gy = Math.round(plH * (0.16 + g * 0.14) + Math.sin(x * (0.03 + g * 0.009) + i * 2.3 + g * 1.7) * 2.6 + Math.sin(x * 0.011 + g) * 1.5);
      const run = (x + i * 31 + g * 17) % (41 + g * 7);
      if (sy === gy && run < 30) c = g % 3 === 1 ? P[1] : P[2];
      else if (sy === gy + 1 && run < 11 && g % 2 === 0) c = P[4];
    }
    // the sea's stain (lost): the lower part of the board soaked darker below a wavy tide line
    if (lost) {
      const tide = Math.round(h * 0.62 + Math.sin(x * 0.04) * 6 + Math.sin(x * 0.13) * 2);
      if (y > tide) c = c === P[5] || c === P[4] ? P[3] : c === P[3] ? P[2] : P[1];
      else if (y === tide) c = P[1];
      else if (y === tide - 1 && x % 5 < 3) c = P[4];
    }
    p.set(x, y, c);
  }
  // knots: an eye with rings the grain bends round
  for (let i = 0; i < n; i++) {
    const kx = Math.round(40 + hash(i + 3, w) * (w - 80)), ky = Math.round(3 + i * ph + ph * 0.5);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx / 2, dy);
      if (d > 3.2) continue;
      p.over(kx + dx, ky + dy, d < 0.9 ? '#1a0e06' : d < 1.7 ? W[0] : d < 2.4 ? W[1] : W[2]);
    }
    p.over(kx - 1, ky - 1, W[4]);
  }
  // a split running along one plank (lost): a dark gap with a lit lower lip and two short branches
  if (lost) {
    const sy0 = Math.round(3 + ph * 1.5);
    for (let x = Math.round(w * 0.3); x < Math.round(w * 0.68); x++) {
      const yy = sy0 + Math.round(Math.sin(x * 0.05) * 3 + Math.sin(x * 0.19) * 0.8), thick = x > w * 0.36 && x < w * 0.6 ? 2 : 1;
      for (let k = 0; k < thick; k++) p.over(x, yy + k, '#0e0804');
      p.over(x, yy + thick, W[5]); p.over(x, yy - 1, W[1]);
    }
    for (const [x0, dir] of [[Math.round(w * 0.42), -1], [Math.round(w * 0.55), 1]] as [number, number][]) for (let k = 0; k < 9; k++) p.over(x0 + k, sy0 + Math.round(Math.sin(x0 * 0.05) * 3) + dir * Math.round(k * 0.6), '#140a04');
    // shipworm holes: little bored pits in loose clusters (dark, a lit lower rim)
    for (let n2 = 0; n2 < 14; n2++) {
      const cx = Math.round(50 + hash(n2, 7) * (w - 100)), cy = Math.round(20 + hash(7, n2) * (h - 50));
      for (let m = 0; m < 4; m++) { const hx2 = cx + ((m * 5) % 9) - 4, hy2 = cy + ((m * 3) % 5) - 2; p.over(hx2, hy2, '#120a04'); p.over(hx2 + 1, hy2, W[1]); p.over(hx2, hy2 + 1, W[4]); }
    }
  } else {
    // nails at every plank end, a little rust run under each
    for (let i = 0; i < n; i++) { const ny = Math.round(3 + i * ph + ph / 2); nail(p, 22, ny, 2); nail(p, w - 24, ny, 2); }
  }
  // the carved border groove with a rope-twist moulding inside it
  const e = 11;
  for (let x = e; x < w - e; x++) for (const yy of [e, h - e - 4]) {
    if (!inside(x, yy)) continue;
    const tw = (x + yy) % 4;
    p.over(x, yy, '#140a04'); p.over(x, yy + 1, tw < 2 ? W[4] : W[2]); p.over(x, yy + 2, tw < 2 ? W[2] : W[4]); p.over(x, yy + 3, W[5]);
  }
  for (let y = e; y < h - e - 1; y++) for (const xx of [e, w - e - 4]) {
    if (!inside(xx, y)) continue;
    const tw = (y + xx) % 4;
    p.over(xx, y, '#140a04'); p.over(xx + 1, y, tw < 2 ? W[4] : W[2]); p.over(xx + 2, y, tw < 2 ? W[2] : W[4]); p.over(xx + 3, y, W[5]);
  }
  if (v === 'surfaced') {
    // gold-leaf inlay: a double line just inside the moulding, with diamond lozenges at the midpoints
    const G = ramp('#e8b048');
    for (const o of [e + 7, e + 10]) {
      for (let x = o; x < w - o; x++) { p.over(x, o, G[o === e + 7 ? 4 : 3]); p.over(x, h - o - 1, G[2]); }
      for (let y = o; y < h - o; y++) { p.over(o, y, G[4]); p.over(w - o - 1, y, G[2]); }
    }
    for (const [lx, ly] of [[w / 2, e + 8.5], [w / 2, h - e - 9.5]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -6; dx <= 6; dx++) if (Math.abs(dx) / 6 + Math.abs(dy) / 4 <= 1) p.set(lx + dx, ly + dy, Math.abs(dx) / 6 + Math.abs(dy) / 4 > 0.75 ? G[1] : dy < 0 ? G[5] : G[3]);
  }
  if (v === 'mail' || v === 'quit') {
    // the airmail border: red / cream / blue diagonal stripes along the moulding (mail) or a plain cream rule (quit)
    for (let x = e + 5; x < w - e - 5; x++) for (const yy of [e + 5, h - e - 9]) for (let k = 0; k < 3; k++) {
      const st = Math.floor((x + k) / 4) % 3;
      p.over(x, yy + k, v === 'quit' ? '#d8c8a0' : st === 0 ? '#c8443a' : st === 1 ? '#f3e7c9' : '#3d6fb6');
    }
  }
  // brass corner caps (not lost) / rusted iron straps over both ends (lost)
  if (!lost) {
    const B = ramp(PAL.brass);
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const ox = sx ? w - 1 : 0, oy = sy ? h - 1 : 0, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
      for (let i = 0; i < 18; i++) for (let j = 0; j < 18 - i; j++) {
        const x = ox + dx * i, y = oy + dy * j;
        if (!inside(x, y)) continue;
        const edge = i + j === 17 || i === 0 || j === 0;
        p.set(x, y, edge ? '#2a1606' : i + j < 6 ? B[5] : (dx > 0) === (dy > 0) ? B[4] : B[3]);
      }
      p.screw(ox + dx * 5, oy + dy * 5, B, sx + sy);
    }
  } else {
    const I = ramp('#6a4a3a');
    for (const sx of [26, w - 40]) {
      for (let y = 0; y < h; y++) for (let k = 0; k < 12; k++) {
        const x = sx + k;
        if (!inside(x, y)) continue;
        const rust = hash(Math.floor(y / 3), x) > 0.72;
        p.set(x, y, k === 0 || k === 11 ? '#140a04' : k === 1 ? I[4] : k === 10 ? I[1] : rust ? '#9a4a1a' : y % 23 === 0 ? I[2] : I[3]);
      }
      for (let y = 10; y < h - 10; y += 26) { p.rivet(sx + 4, y, I); p.rivet(sx + 8, y + 13, I); for (let k = 2; k < 6; k++) p.over(sx + 5 + (k % 2), y + k, '#8a3a12'); }
    }
  }
  // the sea's growth
  if (lost) {
    algaeEdge(p, 4, w - 5, h - 4, 0);
    algaeEdge(p, 4, w - 5, h - 9, 0);
    for (let y = 30; y < h - 10; y++) for (let k = 0; k < 3 + Math.round(Math.sin(y * 0.2) * 2 + 2); k++) p.over(3 + k, y, k === 0 ? ALGAE[1] : (y + k) % 4 === 0 ? ALGAE[4] : ALGAE[2]);
    for (const [cx, cy] of [[w - 22, h - 20], [18, h - 16], [w - 80, 52], [60, 14]] as [number, number][]) { barnacle(p, cx, cy); barnacle(p, cx + 7, cy - 4); barnacle(p, cx - 6, cy + 3, false); barnacle(p, cx + 2, cy + 6, false); barnacle(p, cx - 9, cy - 3, false); }
    coral(p, 30, h - 22, '#e8705a', 8); coral(p, w - 62, h - 14, '#f0a040', 7); coral(p, w - 76, 50, '#d85a8a', 6);
    starfish(p, w - 38, h - 34);
    shell(p, 44, h - 12);
    // a snagged rope end trailing across the bottom-left corner
    ropeH(p, 8, 70, h - 30, 4); ropeV(p, 70, h - 30, h - 6, 4);
    nail(p, 72, h - 31, 3);
  } else {
    algaeEdge(p, 6, w - 7, h - 4, 0);
    barnacle(p, w - 24, h - 9, false); barnacle(p, w - 30, h - 6, false); barnacle(p, 22, h - 8, false);
    shell(p, w - 34, 12); if (v !== 'surfaced') shell(p, 36, h - 12);
  }
  if (v === 'mail') {
    // two postmark stamps on the top corners: a perforated stamp with a little whale, a wavy cancel over it
    for (const [sx, sy] of [[24, 22], [w - 54, 22]] as [number, number][]) {
      for (let y = 0; y < 22; y++) for (let x = 0; x < 26; x++) {
        const perf = (x === 0 || x === 25 || y === 0 || y === 21) && (x + y) % 2 === 0;
        if (perf) continue;
        p.set(sx + x, sy + y, x < 2 || x > 23 || y < 2 || y > 19 ? '#f6eedc' : y < 11 ? '#8ac8e8' : '#3d8fd6');
      }
      for (let x = 7; x < 19; x++) for (let y = 9; y < 14; y++) if (((x - 13) / 6) ** 2 + ((y - 11.5) / 2.5) ** 2 <= 1) p.set(sx + x, sy + y, y < 11 ? '#5a6a8a' : '#3a4a6a');
      p.set(sx + 19, sy + 10, '#3a4a6a'); p.set(sx + 20, sy + 9, '#3a4a6a'); p.set(sx + 10, sy + 10, '#ffffff');
      for (let x = -4; x < 30; x++) for (const o of [6, 12]) p.set(sx + x, sy + o + Math.round(Math.sin(x * 0.6) * 1.5), '#2a1a1a');
    }
  }
  cv = p.done();
  boardCache.set(key, cv);
  if (boardCache.size > 12) boardCache.clear();
  return cv;
}
