// NEW RUN: the run config as a pixel panel over the title scene (moved here from the hideout TV): mastery level,
// starting area, and the loadout: drag stash items into the 5 x 5 bag (tap to add / take out, AUTO fills it with
// your best gear), the hideout's station perks, BACK and ENTER THE OCEAN.
//
//   const p = new RunConfigPanel(); p.open(); each frame: const r = p.draw(ui, x, y, dt) -> 'back' | cfg | null
import type { RunConfig } from '../meta/meta';
import { META, saveMeta } from '../meta/meta';
import { PixelUI } from '../ui/pixel/ui';
import { ITEMS, getItem, findSpot, instCells, GRID, RARITY_COLOR, fits } from '../game/items';
import type { ItemInst } from '../game/run';
import { MASTERY, MAX_MASTERY, masteryMods, AREAS, areaThumb } from '../hideout/mastery';
import { stationPerks } from '../hideout/blueprints';
import { audio } from '../audio/audio';

export const CFG_W = 322, CFG_H = 214;
const C = { cyan: '#7ad8ff', yellow: '#ffe07a', white: '#ffffff', dim: '#8a94b0', red: '#ff5a4a', green: '#6aff7a', head: '#ffd27a' };

export class RunConfigPanel {
  mastery = 0;
  area = 0;
  loadout: ItemInst[] = [];
  private t = 0;
  private drag: { it: ItemInst; from: 'stash' | 'bag'; sx: number; sy: number; moved: boolean } | null = null;
  private dropT = new Map<number, number>();
  private lastTarget = '';
  private shake = 0;
  private flash = { text: '', t: 0 };

  open() {
    const lc = META.lastConfig;
    this.mastery = Math.min(META.masteryUnlocked, lc?.mastery ?? META.mastery ?? 0);
    const ai = AREAS.findIndex((a) => a.id === lc?.startArea);
    this.area = ai >= 0 && AREAS[ai].minMastery <= this.mastery ? ai : 0;
    this.loadout = [];
    for (const uid of lc?.loadout ?? []) { const it = META.stash.find((s) => s.uid === uid); if (it) this.addToBag(it, true); }
    this.drag = null; this.t = 0;
  }
  config(): RunConfig { return { mastery: this.mastery, startArea: AREAS[this.area].id, loadout: this.loadout.map((l) => l.uid) }; }

  private addToBag(it: ItemInst, quiet = false): boolean {
    if (!ITEMS[it.id]) return false;
    const copy: ItemInst = { ...it, gx: -1, gy: -1, rot: 0 };
    const spot = findSpot(this.loadout, copy);
    if (!spot) { if (!quiet) { this.flash = { text: 'BAG FULL', t: 1.2 }; audio.play('k_err1', { vol: 0.4, dry: true }); } return false; }
    copy.gx = spot.gx; copy.gy = spot.gy; copy.rot = spot.rot;
    this.loadout.push(copy);
    if (!quiet) audio.play('bag_zip1', { vol: 0.25, dry: true, rate: 1.4 });
    return true;
  }
  private inBag(uid: number) { return this.loadout.some((l) => l.uid === uid); }

  /** returns 'back', a RunConfig (ENTER), or null */
  draw(ui: PixelUI, px: number, py: number, dt: number): 'back' | RunConfig | null {
    this.t += dt; this.shake = Math.max(0, this.shake - dt * 3); this.flash.t -= dt;
    for (const [k, v] of this.dropT) { if (v > 0.6) this.dropT.delete(k); else this.dropT.set(k, v + dt); }
    let res: 'back' | RunConfig | null = null;
    ui.panel('dark', px, py, CFG_W, CFG_H, undefined, { alpha: 0.94 });
    // header strip
    ui.fill(px + 4, py + 4, CFG_W - 8, 15, '#1a0c08', 0.9);
    ui.fill(px + 4, py + 18, CFG_W - 8, 1, '#f0c040');
    ui.text('NEW RUN', px + 9, py + 8, { font: 'title', color: '#fff4dc', color2: '#ffd27a', shadow: '#000' });
    ui.text(`RUNS ${META.runs}  ·  WINS ${META.wins}`, px + CFG_W - 26, py + 9, { font: 'small', color: C.dim, align: 'right' });
    if (ui.iconButton('cfg:x', 'close', px + CFG_W - 22, py + 4, { style: 'red', size: 13, key: 'Escape', keyLabel: '' })) res = 'back';
    // ---- mastery
    let x = px + 6, y = py + 24;
    const LW = 118;
    ui.frame('dark', x, y, LW, 92);
    ui.text('MASTERY', x + 6, y + 6, { font: 'small', color: C.head });
    const d = ui.stepper('mst', `M${this.mastery}`, x + 5, y + 15, LW - 10, { style: 'dark', font: 'body', canL: this.mastery > 0, canR: this.mastery < Math.min(MAX_MASTERY, META.masteryUnlocked) });
    if (d) { this.mastery = Math.max(0, Math.min(Math.min(MAX_MASTERY, META.masteryUnlocked), this.mastery + d)); if (AREAS[this.area].minMastery > this.mastery) this.area = 0; }
    const ml = MASTERY[this.mastery];
    ui.text(ml.name.toUpperCase(), x + LW / 2, y + 36, { font: 'small', color: C.yellow, align: 'center' });
    const mods = masteryMods(this.mastery);
    ui.clip(x + 2, y + 46, LW - 4, 44);
    if (!mods.length) ui.textBox(ml.mod, x + 6, y + 47, LW - 12, { font: 'small', color: C.white });
    else { let yy = y + 47; for (const m of mods.slice(-2)) yy += ui.textBox('· ' + m, x + 6, yy, LW - 12, { font: 'small', color: m === ml.mod ? C.white : '#b0b8d0' }); }
    ui.unclip();
    if (mods.length > 2 && ui.hover(x, y + 44, LW, 46)) ui.tooltip(mods.map((m) => '· ' + m), { maxW: 190 });
    if (this.mastery < MAX_MASTERY && this.mastery === META.masteryUnlocked) ui.icon('lock', x + LW - 12, y + 5);
    // ---- start area
    y = py + 120;
    ui.frame('dark', x, y, LW, 66);
    ui.text('START AREA', x + 6, y + 6, { font: 'small', color: C.head });
    const a = AREAS[this.area];
    const da = ui.stepper('area', '', x + 5, y + 14, LW - 10, { style: 'dark' });
    if (da) { let n = this.area; for (let k = 0; k < AREAS.length; k++) { n = (n + da + AREAS.length) % AREAS.length; if (AREAS[n].minMastery <= this.mastery) break; } this.area = n; }
    let an = a.name.toUpperCase();
    while (ui.measure(an, 'small') > LW - 40 && an.length > 4) an = an.slice(0, -2) + '.';
    ui.text(an, x + LW / 2, y + 18, { font: 'small', color: C.yellow, align: 'center' });
    const th = areaThumb(a.id);
    ui.img(th, x + LW / 2 - Math.round(th.width / 2), y + 33, { h: Math.min(th.height, 30), w: Math.round(th.width * Math.min(1, 30 / th.height)) });
    if (ui.hover(x, y + 30, LW, 34)) ui.tooltip([a.name, { text: a.desc, font: 'small', color: '#3a2810' }]);
    // ---- the bag
    x = px + 128; y = py + 24;
    const cell = 16, gw = cell * GRID;
    ui.frame('dark', x, y, gw + 12, gw + 42);
    ui.text('LOADOUT', x + 6, y + 6, { font: 'small', color: C.head });
    ui.text(`${this.loadout.length}`, x + gw + 6, y + 6, { font: 'small', color: C.yellow, align: 'right' });
    const gx = x + 6 + Math.round(Math.sin(this.t * 70) * 2 * this.shake), gy = y + 16;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) ui.frame('slot', gx + i * cell, gy + j * cell, cell, cell);
    let hoverIt: ItemInst | null = null;
    const dragging = this.drag?.moved ? this.drag : null;
    for (const it of this.loadout) {
      if (dragging && dragging.from === 'bag' && dragging.it.uid === it.uid) continue;
      const d2 = getItem(it.id);
      const cells = instCells(it);
      const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
      const maxX = Math.max(...cells.map((c) => c[0])), maxY = Math.max(...cells.map((c) => c[1]));
      const dt0 = this.dropT.get(it.uid);
      const bounce = dt0 !== undefined ? -Math.round(Math.sin(Math.min(1, dt0 / 0.3) * Math.PI) * 3) : 0;
      const ix = gx + minX * cell, iy = gy + minY * cell + bounce, iw = (maxX - minX + 1) * cell, ih = (maxY - minY + 1) * cell;
      for (const [cx, cy] of cells) ui.fill(gx + cx * cell + 2, gy + cy * cell + 2, cell - 4, cell - 4, RARITY_COLOR[d2.rarity], 0.25);
      if (dt0 !== undefined && dt0 < 0.12) for (const [cx, cy] of cells) ui.rect(gx + cx * cell, gy + cy * cell, cell, cell, '#ffffff');
      ui.item(it.id, ix + 1, iy + 1, iw - 2, ih - 2, it.level ?? 1);
      if (!dragging && cells.some(([cx, cy]) => ui.hover(gx + cx * cell, gy + cy * cell, cell, cell))) hoverIt = it;
    }
    ui.block(gx, gy, gw, gw);
    if (hoverIt && ui.pressed && !this.drag) this.drag = { it: hoverIt, from: 'bag', sx: ui.mx, sy: ui.my, moved: false };
    if (hoverIt && !this.drag) { ui.cursor = 'grab'; ui.tooltip(ui.itemTip(hoverIt.id, hoverIt.level ?? 1, [{ text: 'drag to move · click to take out', font: 'small', color: '#7a2a1a', gap: 2 }])); }
    const bag = { gx, gy, gw, cell };
    if (ui.button('cfg:auto', 'AUTO', x + 6, gy + gw + 4, 40, 16, { style: 'dark', font: 'small', tip: ['Fill the bag with your best gear'] })) this.autoFill();
    if (ui.button('cfg:clear', 'CLEAR', x + gw - 34, gy + gw + 4, 40, 16, { style: 'dark', font: 'small', disabled: !this.loadout.length })) this.loadout = [];
    // perks
    const perks = stationPerks();
    const fit = (s: string, w: number) => { while (ui.measure(s, 'small') > w && s.length > 4) s = s.slice(0, -2) + '.'; return s; };
    ui.text('PERKS', x + 2, y + gw + 46, { font: 'small', color: C.head });
    if (!perks.perks.length) ui.text(fit('none yet', gw - 30), x + 34, y + gw + 46, { font: 'small', color: C.dim });
    else ui.text(fit(perks.perks[0], gw - 30), x + 34, y + gw + 46, { font: 'small', color: '#c8d8ff' });
    if (ui.hover(x, y + gw + 42, gw + 12, 14)) ui.tooltip(perks.perks.length ? perks.perks : ['Build stations in the hideout for perks'], { maxW: 200 });
    // ---- the stash
    x = px + 226; y = py + 24;
    const lw = 90, lh = 162;
    ui.frame('dark', x, y, lw, lh);
    ui.text('STASH', x + 6, y + 6, { font: 'small', color: C.head });
    const stash = META.stash.filter((s) => ITEMS[s.id]);
    if (!stash.length) ui.textBox('Empty. Extract loot on runs to fill it.', x + 6, y + 20, lw - 12, { font: 'small', color: C.dim });
    let tipIt: ItemInst | null = null;
    ui.list('stash', x + 4, y + 16, lw - 6, lh - 20, stash.length, 22, (i, rx, ry, _rw, hov) => {
      const it = stash[i];
      const inb = this.inBag(it.uid);
      ui.frame('slot', rx + 1, ry + 1, 20, 20);
      if (inb) ui.rect(rx + 1, ry + 1, 20, 20, C.yellow);
      if (hov) { ui.rect(rx + 1, ry + 1, 20, 20, C.white); tipIt = it; if (ui.pressed && !this.drag) this.drag = { it, from: 'stash', sx: ui.mx, sy: ui.my, moved: false }; }
      const lifted = this.drag?.moved && this.drag.from === 'stash' && this.drag.it.uid === it.uid;
      ui.item(it.id, rx + 3, ry + 3, 16, 16, it.level ?? 1, lifted ? 0.35 : inb ? 0.55 : 1);
      if ((it.level ?? 1) > 1) ui.text(`+${(it.level ?? 1) - 1}`, rx + 20, ry + 2, { font: 'small', color: C.green, outline: '#000', align: 'right' });
    }, { style: 'dark', cols: 3 });
    if (tipIt && !this.drag?.moved) { const ti = tipIt as ItemInst; ui.tooltip(ui.itemTip(ti.id, ti.level ?? 1, [{ text: this.inBag(ti.uid) ? 'click: take out' : 'click or drag into the bag', font: 'small', color: '#1a4a7a', gap: 2 }])); }
    this.dragDrop(ui, bag);
    // ---- bottom: back + ENTER
    const by = py + CFG_H - 24;
    if (ui.button('cfg:back', 'BACK', px + 6, by, 56, 19, { style: 'dark', key: 'Backspace', keyLabel: '' })) res = 'back';
    const ex = px + 128, ew = CFG_W - 134;
    if (Math.sin(this.t * 5) > 0) ui.fill(ex - 2, by - 2, ew + 4, 23, '#ffd27a', 0.22);
    if (ui.button('cfg:enter', 'ENTER THE OCEAN', ex, by, ew, 19, { style: 'gold', font: 'title', key: 'Enter', sfx: 'k_confirm2' })) {
      META.lastConfig = this.config(); META.mastery = this.mastery; saveMeta();
      res = this.config();
    }
    if (this.flash.t > 0) {
      const w = ui.measure(this.flash.text, 'title') + 16;
      ui.frame('dark', px + (CFG_W - w) / 2, py + 96, w, 22);
      ui.text(this.flash.text, px + CFG_W / 2, py + 102, { font: 'title', color: C.red, shadow: '#000', align: 'center' });
    }
    return res;
  }

  private dragDrop(ui: PixelUI, b: { gx: number; gy: number; gw: number; cell: number }) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(ui.mx - d.sx, ui.my - d.sy) > 3) { d.moved = true; audio.play('k_pluck1', { vol: 0.35, dry: true }); }
    const def = getItem(d.it.id);
    const cx = Math.floor((ui.mx - b.gx) / b.cell), cy = Math.floor((ui.my - b.gy) / b.cell);
    const overBag = ui.mx >= b.gx && ui.my >= b.gy && ui.mx < b.gx + b.gw && ui.my < b.gy + b.gw;
    const probe: ItemInst = { ...d.it, gx: -1, gy: -1, rot: d.from === 'bag' ? d.it.rot : 0 };
    const ok = overBag && fits(this.loadout.filter((l) => l.uid !== d.it.uid), probe, cx, cy, probe.rot);
    if (d.moved) {
      ui.cursor = 'grab';
      if (overBag) {
        const key = `${cx},${cy},${ok}`;
        if (key !== this.lastTarget) { this.lastTarget = key; audio.play('k_tick2', { vol: 0.12, dry: true, rate: ok ? 1.3 : 0.8 }); }
        for (const [x, y] of instCells(probe, probe.rot, cx, cy)) {
          if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
          ui.fill(b.gx + x * b.cell + 1, b.gy + y * b.cell + 1, b.cell - 2, b.cell - 2, ok ? '#2aa84a' : '#a82a2a', 0.55);
          ui.rect(b.gx + x * b.cell, b.gy + y * b.cell, b.cell, b.cell, ok ? '#6aff7a' : C.red);
        }
      }
      const sz = { w: Math.max(...def.shape.map((c) => c[0])) + 1, h: Math.max(...def.shape.map((c) => c[1])) + 1 };
      const w = sz.w * 16, h = sz.h * 16, ix = ui.mx - 8, iy = ui.my - 10;
      ui.fill(ix + 2, iy + 3, w, h, '#000000', 0.45);
      ui.item(d.it.id, ix, iy, w, h, d.it.level ?? 1);
    }
    if (ui.released) {
      if (!d.moved) {
        if (d.from === 'bag' || this.inBag(d.it.uid)) { this.loadout = this.loadout.filter((l) => l.uid !== d.it.uid); audio.play('k_drop2', { vol: 0.3, dry: true }); }
        else this.addToBag(d.it);
      } else if (overBag && ok) {
        this.loadout = this.loadout.filter((l) => l.uid !== d.it.uid);
        this.loadout.push({ ...d.it, gx: cx, gy: cy, rot: probe.rot });
        this.dropT.set(d.it.uid, 0);
        audio.play('box_thud', { vol: 0.35, dry: true, rate: 1.6 }); audio.play('k_drop3', { vol: 0.3, dry: true });
      } else if (overBag) { this.shake = 1; audio.play('k_err1', { vol: 0.35, dry: true }); }
      else if (d.from === 'bag') { this.loadout = this.loadout.filter((l) => l.uid !== d.it.uid); audio.play('k_drop2', { vol: 0.3, dry: true }); }
      this.drag = null; this.lastTarget = '';
    } else if (!ui.down && !ui.pressed) this.drag = null;
  }

  private autoFill() {
    const order = ['ability', 'tool', 'trinket', 'material'];
    const rank = (id: string) => { const d = ITEMS[id]; return order.indexOf(d.kind) * 10 - ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(d.rarity); };
    const pool = META.stash.filter((s) => ITEMS[s.id] && !this.inBag(s.uid)).sort((a, b) => rank(a.id) - rank(b.id) - ((b.level ?? 1) - (a.level ?? 1)) * 0.1);
    let n = 0;
    for (const it of pool) if (this.addToBag(it, true)) n++;
    audio.play(n ? 'bag_zip1' : 'k_err1', { vol: 0.3, dry: true });
  }
}
