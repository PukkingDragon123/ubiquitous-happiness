// The RUN SUMMARY (v8b deep-ink kit): the end of every journey as a quiet SCENE, then one calm panel with what it
// came to.
//
//   LOST AT SEA   the blobfish sinks into the dark, tumbling slowly, its straw hat drifting off upward; marine snow
//                 falls and the light fades. The panel rises in beside it.
//   SURFACED      the blobfish rises cheering through lit water
//   SENT HOME     twilight water; the manatee carried it all home
//   (BACK HOME    the quit variant)
//
// The panel is the kit's main panel: the result as a wordmark in bone, the cause under it, the stats as flat tiles
// that count up in turn (value in bone, label in dim, a gold NEW RECORD tag), the loot that made it home turning in
// a recessed well (real 3D models), then a big CONTINUE.
//
//   const card = new RunSummaryCard({ result: 'lost', depth: 182, distance: 940, time: 412, floors: 3,
//                                     kills: { fish: 31, giants: 2 }, loot: ['amethyst'], pearls: 37, record: true });
//   each frame inside ui.begin()/end():  if (card.draw(ui, dt) === 'continue') goHome();
//   (pass { stage, planes } of a Hud already on that PixelUI so the models share its lights)
//
// CONTINUE is the only exit: its button, Enter, Space, Esc or a click anywhere once the stats have landed.
import * as THREE from 'three';
import type { PixelUI } from './pixel/ui';
import { ITEMS, getItem } from '../game/items';
import { audio } from '../audio/audio';
import { UiStage, PlanePool } from './obj/stage';
import { itemModel } from '../backpack/models';
import { pixelize } from './obj/pixtex';
import { C, skin, bubbleArt, RARITY_UI, sectionHead, tag } from './pixel/skins';
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
  /** the water: top and bottom of a calm stepped gradient, and the light from above */
  top: string; bottom: string; shaft: string;
}
const LOOKS: Record<Variant, Look> = {
  lost: { word: 'LOST AT SEA', line: 'Your pack sank with you. What you mailed home is safe.', top: '#16273a', bottom: '#05090f', shaft: '#9fb8d0' },
  surfaced: { word: 'SURFACED', line: 'You swam all the way back up. Everything came home.', top: '#3e6283', bottom: '#14233a', shaft: '#e8eef4' },
  mail: { word: 'SENT HOME', line: 'The manatee carried it all home.', top: '#244259', bottom: '#0c1826', shaft: '#c8dce8' },
  quit: { word: 'BACK HOME', line: 'You headed home early.', top: '#22394f', bottom: '#0b1624', shaft: '#c8d8e8' },
};
const VAR_OF: Record<RunSummary['result'], Variant> = { lost: 'lost', surfaced: 'surfaced', extracted: 'mail', quit: 'quit' };

interface Tile { key: string; label: string; value: number; fmt: (v: number) => string; sub?: string; badge?: string }

/** the soft body the summary's blobfish is driven with: still, with a slow breath */
const STILL = { t: 0, disp(_a: number, out: { x: number; y: number }) { out.x = 0; out.y = 0; return out; } };

export class RunSummaryCard {
  t = 0;
  private v: Variant;
  private L: Look;
  private landed = 0;
  private ticked: Record<string, number> = {};
  private ownStage: UiStage | null = null;
  private ownPlanes: PlanePool | null = null;
  private models: THREE.Object3D[] = [];
  private loot: string[];
  private blob: BlobModel | null = null;
  private hat: THREE.Object3D | null = null;
  private hatV = new THREE.Vector3(); private hatR = new THREE.Euler(); private hatS = 1;
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

    // ------------------------------------------------ the scene behind: calm water, soft light, marine snow
    planes.draw(seaBackdrop(ui.w, ui.h, this.v), 0, 0, { w: ui.w, h: ui.h, alpha: fadeIn });
    const shaftA = lost ? Math.max(0, 1 - t / 2.8) * 0.18 : 0.14 + 0.04 * Math.sin(t * 0.9);
    if (shaftA > 0.01) for (let i = 0; i < 3; i++) {
      const sx = ui.w * (0.14 + i * 0.3) + Math.sin(t * 0.3 + i * 1.7) * 10;
      planes.draw(shaftCanvas(L.shaft, 40 + (i % 2) * 16, ui.h), Math.round(sx), 0, { alpha: shaftA * fadeIn });
    }
    if (lost) planes.draw(solid(C.ink), 0, 0, { w: ui.w, h: ui.h, alpha: Math.min(0.45, t * 0.18) });
    for (let i = 0; i < 22; i++) {
      const lane = (i * 97.31) % ui.w, sp = 6 + (i % 5) * 2;
      const yy = lost ? ((t * sp + i * 41) % (ui.h + 10)) - 5 : ui.h - ((t * sp * 1.2 + i * 41) % (ui.h + 10)) + 5;
      planes.draw(solid(C.bone), Math.round(lane + Math.sin(t * 0.7 + i) * 3), Math.round(yy), { w: 1, h: 1, alpha: 0.35 * fadeIn });
    }

    // ------------------------------------------------ the panel: fades in and rises 6 px
    const W = Math.min(ui.w - 110, 500), H = Math.min(ui.h - 28, 300);
    const bx0 = Math.round((ui.w - W) / 2 + 26), byRest = Math.round((ui.h - H) / 2) + 2;
    const appear = lost ? 1.4 : 0.6;
    const k = Math.max(0, Math.min(1, (t - appear) / 0.35));
    const e = 1 - (1 - k) ** 3;
    const bx = bx0, by = byRest + Math.round((1 - e) * 6);
    if (k >= 1 && this.landed === 0) {
      this.landed = 1;
      audio.play(lost ? 'k_bong' : this.v === 'surfaced' ? 'jin_record' : 'jin_good', { vol: 0.35, dry: true });
    }

    // ------------------------------------------------ the blobfish
    this.drawBlob(ui, dt, stage, planes, kk, bx0, byRest, W, H);
    if (k <= 0) { this.hideModels(); return null; }
    planes.draw(skin('wood', W, H), bx, by, { alpha: e, shadow: 3 });
    const T0 = appear + 0.35;

    // ------------------------------------------------ the result, as a wordmark, and the cause under it
    const word = L.word, wa = Math.min(1, Math.max(0, (t - T0 + 0.2) * 4));
    const wy = by + 18;
    ui.text(word, bx + W / 2, wy, { size: 2, color: lost ? C.bone : C.gold2, shadow: C.ink, align: 'center', alpha: wa });
    const capW = Math.round(ui.cap('body', 2));
    const ry = wy + capW + 10, rw = 120;
    ui.fill(bx + W / 2 - rw / 2, ry, rw, 1, C.line2, wa);
    ui.fill(bx + W / 2 - 1, ry - 1, 3, 3, lost ? C.red : C.gold, wa);
    const titleEnd = T0 + 0.2, titleDone = t - titleEnd;
    const la = Math.min(1, Math.max(0, (titleDone - 0.05) * 4));
    ui.text(s.cause ?? L.line, bx + W / 2, ry + 7, { font: 'body', color: C.dim, shadow: null, align: 'center', alpha: la });

    // ------------------------------------------------ the stats: flat tiles counting up in turn
    const tiles: Tile[] = [{ key: 'depth', label: 'DEEPEST', value: Math.round(s.depth), fmt: (v) => `-${v} m`, sub: s.floors ? `${s.floors} stage${s.floors > 1 ? 's' : ''}` : undefined, badge: s.record ? 'NEW RECORD' : undefined }];
    if (s.distance !== undefined) tiles.push({ key: 'far', label: 'FROM HOME', value: Math.round(s.distance), fmt: (v) => `${v} m` });
    if (s.time !== undefined) tiles.push({ key: 'time', label: 'TIME', value: Math.round(s.time), fmt: (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}` });
    if (s.kills) tiles.push({ key: 'kills', label: 'FISH BEATEN', value: s.kills.fish, fmt: (v) => String(v), sub: s.kills.giants ? `+ ${s.kills.giants} giant${s.kills.giants > 1 ? 's' : ''}` : undefined });
    if (s.pearls !== undefined) tiles.push({ key: 'pearls', label: 'PEARLS', value: s.pearls, fmt: (v) => String(v) });
    const lx0 = bx + 18, rx0 = bx + W - 18, ty = ry + 26, th = 64, gap = 6;
    const colW = Math.floor((rx0 - lx0 + gap) / tiles.length);
    tiles.forEach((tl, i) => {
      const t0 = titleEnd + 0.2 + i * 0.15, kk2 = Math.min(1, Math.max(0, (t - t0) / 0.6));
      const ta = Math.min(1, Math.max(0, (t - t0 + 0.1) * 6));
      const cx = lx0 + i * colW, cw = colW - gap;
      if (ta <= 0) return;
      ui.fill(cx, ty, cw, th, C.well, ta); ui.rect(cx, ty, cw, th, C.line);
      const v = Math.round(tl.value * (1 - (1 - kk2) ** 3));
      if (v !== this.ticked[tl.key] && kk2 < 1 && Math.floor(t * 30) !== Math.floor((t - dt) * 30)) audio.play('k_tick1', { vol: 0.1, dry: true, rate: 0.8 + kk2 * 0.7 });
      if (kk2 >= 1 && this.ticked[tl.key] !== tl.value) audio.play('k_tick2', { vol: 0.25, dry: true });
      this.ticked[tl.key] = v;
      ui.text(tl.label, cx + cw / 2, ty + 7, { font: 'small', color: C.dim, shadow: null, align: 'center', alpha: ta });
      const vs = tl.fmt(v), big = ui.measure(tl.fmt(tl.value), 'big') <= cw - 10;
      ui.text(vs, cx + cw / 2, ty + (big ? 20 : 23), { font: big ? 'big' : 'title', color: C.bone2, shadow: C.ink, align: 'center', alpha: ta });
      if (tl.badge && kk2 >= 1) {
        const bw = Math.ceil(ui.measure(tl.badge, 'small')) + 8;
        tag(ui, tl.badge, Math.round(cx + cw / 2 - bw / 2), ty + th - 18, 'gold');
      } else if (tl.sub) ui.text(tl.sub, cx + cw / 2, ty + th - 15, { font: 'small', color: C.faint, shadow: null, align: 'center', alpha: ta });
    });

    // ------------------------------------------------ MADE IT HOME: the loot turning in a recessed well
    const T2 = titleEnd + 0.3 + tiles.length * 0.15 + 0.2;
    const sa = Math.min(1, Math.max(0, (t - T2) * 4));
    const byy = by + H - 26 - 14;
    const hy = ty + th + 14;
    const loot = this.loot;
    const lbl = loot.length ? `MADE IT HOME  ·  ${loot.length} THING${loot.length > 1 ? 'S' : ''}` : 'MADE IT HOME';
    if (sa > 0) sectionHead(ui, lbl, lx0, hy, rx0 - lx0, { alpha: sa });
    const wy2 = hy + 13, wh = Math.max(40, byy - 12 - wy2);
    planes.draw(skin('inset', rx0 - lx0, wh), lx0, wy2, { alpha: sa });
    const floorY = Math.min(wy2 + wh - 6, wy2 + Math.round(wh / 2) + 26);
    if (loot.length) {
      const slot = 56, per = Math.max(1, Math.floor((rx0 - lx0 - 10) / slot));
      const shown = loot.slice(0, loot.length > per ? per - 1 : per);
      while (this.models.length < shown.length) { const m = itemModel(shown[this.models.length]); stage.ui.add(m); this.models.push(m); }
      const rowW = shown.length * slot;
      const x0 = (lx0 + rx0) / 2 - rowW / 2 + slot / 2;
      shown.forEach((id, i) => {
        const m = this.models[i];
        const k3 = Math.min(1, Math.max(0, (t - T2 - 0.1 - i * 0.06) * 4));
        m.visible = k3 > 0;
        if (!m.visible) return;
        const d = getItem(id);
        const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
        const size = Math.min(slot - 14, wh - 16);
        const rise = (1 - k3) * 6, bob = Math.sin(t * 1.2 + i * 0.9) * 1;
        m.scale.setScalar((size / Math.max(cw, ch) / kk) * (0.85 + 0.15 * k3));
        m.rotation.set(0.15, -0.5 + Math.sin(t * 0.6 + i) * 0.4, 0);
        stage.put(m, (x0 + i * slot) / kk, (floorY - size / 2 - 4 + rise + bob) / kk, 60);
        // its rarity as a small pip under it
        if (k3 > 0.9) { ui.fill(x0 + i * slot - 3, floorY - 1, 5, 3, C.ink); ui.fill(x0 + i * slot - 2, floorY, 3, 1, RARITY_UI[d.rarity]); }
        if (k3 > 0 && k3 < 0.25 && !this.ticked['m' + i]) { this.ticked['m' + i] = 1; audio.play('k_drop2', { vol: 0.16, dry: true, rate: 0.9 + i * 0.03 }); }
      });
      for (let i = shown.length; i < this.models.length; i++) this.models[i].visible = false;
      if (loot.length > shown.length) ui.text(`+${loot.length - shown.length}`, x0 + shown.length * slot - 14, floorY - 22, { font: 'title', color: C.dim, shadow: null, alpha: sa });
    } else if (sa > 0) {
      ui.text('Nothing made it home this time.', (lx0 + rx0) / 2, wy2 + wh / 2 - 12, { font: 'body', color: C.bone, shadow: null, align: 'center', alpha: sa });
      ui.text('Mail loot with the manatee: it stays safe even if you sink.', (lx0 + rx0) / 2, wy2 + wh / 2 + 5, { font: 'small', color: C.dim, shadow: null, align: 'center', alpha: sa });
    }

    // ------------------------------------------------ CONTINUE
    const T3 = T2 + 0.3;
    const ready = t > T3 + 0.1;
    const bw = 200, bh = 26, bxx = Math.round(bx + W / 2 - bw / 2);
    const bba = Math.min(1, Math.max(0, (t - T3) * 5));
    let go = false;
    if (bba > 0) go = ui.button('runsum:continue', 'CONTINUE', bxx, byy, bw, bh, { style: 'green', key: 'Enter', disabled: !ready, font: 'title' });
    // impatient? a press during the reveal jumps straight to the finished card (the next press continues)
    if (!ready && t > 0.6 && (ui.input?.keyHit('Enter') || ui.input?.keyHit('Space') || ui.input?.keyHit('Escape') || ui.pressed)) this.t = Math.max(this.t, T3 + 0.12);
    if (ready && (go || ui.input?.keyHit('Space') || ui.input?.keyHit('Escape') || (ui.pressed && !ui.hover(bxx, byy, bw, bh)))) {
      for (const m of this.models) m.removeFromParent();
      this.blob?.root.removeFromParent(); this.hat?.removeFromParent();
      this.ownStage?.detach();
      return 'continue';
    }
    return null;
  }

  private hideModels() { for (const m of this.models) m.visible = false; }

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
    if (lost && k >= 1 && !this.ticked.rest) { this.ticked.rest = 1; audio.play('k_drop2', { vol: 0.25, dry: true, rate: 0.6 }); }
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
    // a few bubbles leaving it: a thinning stream while it sinks, a short trail when it rises
    const n = lost ? Math.round(5 * Math.max(0, 1 - t / 3.5)) + 1 : 3;
    for (let i = 0; i < n; i++) {
      const ph = (t * (0.5 + (i % 3) * 0.12) + i * 0.37) % 1;
      const bxx = x + 6 + Math.sin(t * 3 + i * 1.3) * 3 + (i % 2) * 4, byy = y - 8 - ph * (lost ? 70 : 50);
      planes.draw(bubbleArt(i % 3 === 0 ? 2 : 1), Math.round(bxx), Math.round(byy), { alpha: (1 - ph) * 0.6, z: -200 });
    }
  }
}

// ------------------------------------------------------------------ painted pieces
const cache = new Map<string, HTMLCanvasElement>();
function canvas(key: string, w: number, h: number, paint: (x: CanvasRenderingContext2D) => void) {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
  paint(c.getContext('2d')!);
  cache.set(key, c);
  if (cache.size > 40) { const f = cache.keys().next().value; if (f !== undefined) cache.delete(f); }
  return c;
}
/** a 1 x 1 canvas of a colour (stretched by the plane pool) */
function solid(col: string) { return canvas('solid|' + col, 1, 1, (x) => { x.fillStyle = col; x.fillRect(0, 0, 1, 1); }); }
/** the water behind: a calm gradient in 8 flat steps, top to bottom (no texture) */
function seaBackdrop(_w: number, _h: number, v: Variant): HTMLCanvasElement {
  const L = LOOKS[v];
  return canvas(`sea|${v}`, 1, 8, (x) => {
    const a = parseInt(L.top.slice(1), 16), b = parseInt(L.bottom.slice(1), 16);
    for (let i = 0; i < 8; i++) {
      const k = i / 7, ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
      x.fillStyle = `rgb(${ch(16)},${ch(8)},${ch(0)})`; x.fillRect(0, i, 1, 1);
    }
  });
}
/** a soft light shaft: a slanted beam in two flat bands, fading toward the bottom */
function shaftCanvas(col: string, w: number, h: number): HTMLCanvasElement {
  return canvas(`shaft|${col}|${w}|${h}`, w + Math.round(h * 0.3), h, (x) => {
    x.fillStyle = col;
    for (let y = 0; y < h; y += 2) {
      const off = Math.round(y * 0.3), fade = 1 - y / h;
      x.globalAlpha = Math.round(fade * 3) / 3 * 0.5; x.fillRect(off, y, w, 2);
      x.globalAlpha = Math.round(fade * 3) / 3; x.fillRect(off + Math.round(w * 0.3), y, Math.round(w * 0.4), 2);
    }
    x.globalAlpha = 1;
  });
}
