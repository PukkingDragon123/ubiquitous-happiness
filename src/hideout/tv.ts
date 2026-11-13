// The TV's pixel UI (a 320 x 240 canvas shown through the CRT material): an idle "nature channel" while you
// lounge, then the main menu (NEW RUN / RESUME / SETTINGS / CREDITS), the run config (mastery, starting area,
// loadout from the stash into a 5x5 bag preview, the big ENTER button), settings and credits.
import type { Input } from '../core/input';
import { PixelUI } from '../ui/pixel/ui';
import { META, saveMeta, resetMeta, type RunConfig } from '../meta/meta';
import { ITEMS, getItem, findSpot, instCells, GRID, RARITY_COLOR } from '../game/items';
import type { ItemInst } from '../game/run';
import { MASTERY, MAX_MASTERY, masteryMods, AREAS, areaThumb } from './mastery';
import { stationPerks } from './blueprints';
import { audio } from '../audio/audio';
import { fits } from '../game/items';
import { drawLogo, logoSize, drawRibbon, blobSprite, fishSprite, oceanLayers } from './tvArt';

export type TvPage = 'idle' | 'main' | 'config' | 'settings' | 'credits' | 'reset';
export const TV_W = 320, TV_H = 240;

const C = { bg: '#04103a', bar: '#000818', cyan: '#3ad8ff', yellow: '#ffe04a', white: '#ffffff', dim: '#7a90c8', red: '#ff5a4a', green: '#6aff7a', ink: '#020818' };

export class TvUI {
  ui = new PixelUI({ fixed: [TV_W, TV_H] });
  page: TvPage = 'idle';
  /** bumped on page changes: the screen turns it into a static burst */
  staticK = 0;
  private sel = 0;
  private t = 0;
  mastery = 0;
  area = 0;
  loadout: ItemInst[] = [];
  private flash = { text: '', t: 0 };
  onEnter?: (cfg: RunConfig) => void;
  onResume?: () => void;
  /** replay the story prologue (set by the hideout from HideoutOpts.onPrologue) */
  onPrologue?: () => void;
  onBack?: () => void;
  private creditsT = 0;
  private resetArm = 0;
  /** boot sequence clock (typed text) and menu slide-in clock */
  private bootT = 9;
  private menuT = 9;
  /** on-screen channel display after tuning in */
  private osdT = 9;
  /** loadout drag & drop */
  private drag: { it: ItemInst; from: 'stash' | 'bag'; sx: number; sy: number; moved: boolean } | null = null;
  private dropT = new Map<number, number>();
  private lastTarget = '';
  private shake = 0;

  constructor() { this.ui.drawCursor = true; }

  go(p: TvPage) {
    if (p === this.page) return;
    if (p === 'main' && this.page === 'idle') { this.bootT = 0; this.osdT = 0; audio.play('k_glitch2', { vol: 0.18, dry: true }); }
    if (p === 'main') this.menuT = this.page === 'idle' ? -1.15 : 0;
    this.drag = null;
    this.page = p; this.sel = 0; this.staticK = 1;
    if (p === 'config') this.loadConfig();
    if (p === 'credits') this.creditsT = 0;
    this.ui.resetList('stash');
    audio.play('static1', { vol: 0.12, dry: true, rate: 1.4 });
  }

  private loadConfig() {
    const lc = META.lastConfig;
    this.mastery = Math.min(META.masteryUnlocked, lc?.mastery ?? META.mastery ?? 0);
    const ai = AREAS.findIndex((a) => a.id === lc?.startArea);
    this.area = ai >= 0 && AREAS[ai].minMastery <= this.mastery ? ai : 0;
    this.loadout = [];
    for (const uid of lc?.loadout ?? []) { const it = META.stash.find((s) => s.uid === uid); if (it) this.addToBag(it, true); }
  }

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

  config(): RunConfig { return { mastery: this.mastery, startArea: AREAS[this.area].id, loadout: this.loadout.map((l) => l.uid) }; }

  draw(input: Input | null, dt: number, map?: (x: number, y: number) => [number, number] | null) {
    this.t += dt; this.bootT += dt; this.menuT += dt; this.osdT += dt; this.shake = Math.max(0, this.shake - dt * 3);
    for (const [k, v] of this.dropT) { if (v > 0.6) this.dropT.delete(k); else this.dropT.set(k, v + dt); }
    this.staticK = Math.max(0, this.staticK - dt * 3.2);
    this.flash.t -= dt;
    const ui = this.ui;
    ui.drawCursor = !!input;
    ui.begin(input, dt, map);
    this.background();
    switch (this.page) {
      case 'idle': this.idle(); break;
      case 'main': this.main(); break;
      case 'config': this.cfgPage(); break;
      case 'settings': this.settings(); break;
      case 'credits': this.credits(); break;
      case 'reset': this.reset(); break;
    }
    if (this.page !== 'idle') this.header();
    if (this.page !== 'idle' && this.osdT < 2.2 && Math.floor(this.osdT * 4) % 4 !== 3) ui.text('CH 03', TV_W - 14, 22, { font: 'title', color: '#6aff7a', shadow: '#002200', align: 'right' });
    if (this.flash.t > 0) {
      const w = ui.measure(this.flash.text, 'title') + 16;
      ui.frame('tv', (TV_W - w) / 2, 104, w, 22);
      ui.text(this.flash.text, TV_W / 2, 110, { font: 'title', color: C.red, shadow: '#000', align: 'center' });
    }
    // Esc backs out of the TV pages
    if (input?.keyHit('Escape')) {
      if (this.page === 'main') this.onBack?.();
      else if (this.page !== 'idle') this.go('main');
    }
    ui.end();
  }

  // ---------------------------------------------------------------- pieces
  private background() {
    const ui = this.ui, t = this.t;
    if (this.page === 'main') { this.oceanScene(); return; }
    // flat deep blue with a faint 16 px grid scrolling slowly, and drifting snow pixels
    ui.fill(0, 0, TV_W, TV_H, '#06144a');
    const o = Math.floor(t * 4) % 16;
    for (let x = -o; x < TV_W; x += 16) ui.fill(x, 0, 1, TV_H, '#0a1d5c');
    for (let y = -o; y < TV_H; y += 16) ui.fill(0, y, TV_W, 1, '#0a1d5c');
    for (let i = 0; i < 22; i++) { const x = (i * 97 + Math.floor(Math.sin(t * 0.3 + i) * 4)) % TV_W, y = TV_H - 1 - (Math.floor(i * 53 + t * (6 + (i % 4) * 3)) % TV_H); ui.fill(x, y, 1, 1, i % 3 ? '#5a7ac8' : '#9ab8ff'); }
    if (this.page === 'settings') {
      // a signal trace along the bottom
      for (let x = 8; x < TV_W - 8; x++) ui.fill(x, 200 + Math.round(Math.sin(x * 0.12 + t * 6) * 3 * Math.sin(x * 0.02 + t)), 1, 1, '#2a9ad0');
    }
  }

  /** the main menu backdrop: banded water, light shafts, parallax ridges and kelp, bubbles, fish and a blobfish */
  private oceanScene() {
    const ui = this.ui, t = this.t, ctx = ui.ctx;
    const bands = ['#123290', '#0f2a80', '#0c236e', '#0a1c5c', '#08164a', '#06103a'];
    bands.forEach((c, i) => ui.fill(0, i * 40, TV_W, 40, c));
    // slanted light shafts (flat, one tone lighter)
    ctx.fillStyle = '#18409e';
    for (let i = 0; i < 4; i++) {
      const x0 = ((i * 97 + t * 5) % (TV_W + 120)) - 60;
      for (let y = 0; y < 150; y += 2) ctx.fillRect(Math.round(x0 + y * 0.45), y, 10 - Math.floor(y / 30), 2);
    }
    const L = oceanLayers();
    const par = (img: HTMLCanvasElement, speed: number, y: number) => { const off = Math.floor((t * speed) % 320); ui.img(img, -off, y); ui.img(img, 320 - off, y); };
    par(L[0], 3, TV_H - 70);
    // the blobfish swimming by behind the kelp
    const bx = ((t * 16) % (TV_W + 60)) - 30, by = 150 + Math.round(Math.sin(t * 1.4) * 5);
    ui.img(blobSprite(Math.floor(t * 4)), Math.round(bx), by);
    for (let i = 0; i < 3; i++) if (Math.sin(t * 2 + i) > 0.6) ui.fill(Math.round(bx) + 20, by - 3 - i * 4 - Math.floor((t * 10) % 4), 2, 2, '#9ad8ff');
    par(L[1], 8, TV_H - 60);
    // small fish crossing the other way
    for (let i = 0; i < 4; i++) { const fx = TV_W - ((t * (20 + i * 6) + i * 90) % (TV_W + 40)) + 20; ui.img(fishSprite(i), Math.round(fx), 120 + i * 17 + Math.round(Math.sin(t * 3 + i) * 2), { flipX: true }); }
    par(L[2], 16, TV_H - 110);
    // rising bubbles
    for (let i = 0; i < 10; i++) { const x = (i * 71 + Math.round(Math.sin(t + i) * 3)) % TV_W, y = TV_H - (Math.floor(t * (14 + (i % 3) * 6) + i * 29) % (TV_H + 10)); ui.fill(x, y, 2, 2, '#7ab8ff'); ui.fill(x, y, 1, 1, '#e8f6ff'); }
  }

  private header() {
    const ui = this.ui;
    // inset from the tube edge (overscan)
    ui.fill(0, 0, TV_W, 16, C.bar);
    ui.fill(0, 16, TV_W, 1, C.cyan);
    ui.text('P100', 12, 6, { font: 'small', color: C.white });
    ui.text('BLOBFISH TV', 38, 6, { font: 'small', color: C.yellow });
    const page = { main: 'MAIN MENU', config: 'RUN CONFIG', settings: 'SETTINGS', credits: 'CREDITS', reset: 'RESET', idle: '' }[this.page];
    ui.text(page, 168, 6, { font: 'small', color: C.cyan, align: 'center' });
    const d = new Date();
    const clock = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    ui.text(clock, TV_W - 12, 6, { font: 'small', color: C.white, align: 'right' });
  }

  private idle() {
    const ui = this.ui, t = this.t;
    // a nature programme: a pixel fish gliding through kelp
    for (let i = 0; i < 6; i++) {
      const x = 20 + i * 55 + Math.sin(t * 0.5 + i) * 3;
      for (let y = 120; y < 240; y += 2) { const xx = x + Math.sin(y * 0.05 + t * 0.8 + i) * 4; ui.fill(xx, y, 3, 2, i % 2 ? '#1a4a2a' : '#2a6a3a'); }
    }
    ui.fill(0, 214, TV_W, 26, '#2a2416');
    for (let x = 0; x < TV_W; x += 3) ui.fill(x, 212 + Math.round(Math.sin(x * 0.3) * 1.5), 3, 3, '#4a3e24');
    const fx = ((t * 22) % (TV_W + 80)) - 40, fy = 110 + Math.sin(t * 0.9) * 14;
    ui.ctx.fillStyle = '#f4a0b4'; ui.ctx.beginPath(); ui.ctx.ellipse(Math.round(fx), Math.round(fy), 16, 11, 0, 0, Math.PI * 2); ui.ctx.fill();
    ui.fill(fx + 8, fy + 2, 10, 6, '#e08098');
    ui.fill(fx + 5, fy - 5, 3, 3, '#1a0a10'); ui.fill(fx + 5, fy - 5, 1, 1, '#ffffff');
    ui.fill(fx - 22, fy - 4 + Math.round(Math.sin(t * 8) * 2), 7, 9, '#e8909a');
    // channel bug + title card
    ui.text('CH 3', TV_W - 8, 8, { font: 'title', color: '#ffffff', shadow: '#000', align: 'right', alpha: 0.85 });
    ui.text('LIVE', 10, 8, { font: 'small', color: '#ff4a4a', shadow: '#000' });
    if (Math.sin(t * 3) > 0) ui.fill(36, 9, 4, 4, '#ff4a4a');
    ui.fill(0, 226, TV_W, 14, '#000818');
    const tick = 'BLOBFISH TV  •  CLICK THE TV TO TUNE IN  •  TONIGHT: HUMANS, WHY?  •  WEATHER: WET  •  ';
    const w = ui.measure(tick, 'small');
    const off = -((t * 30) % w);
    ui.text(tick + tick, Math.round(off), 229, { font: 'small', color: C.yellow });
  }

  private boot() {
    const ui = this.ui;
    ui.fill(0, 0, TV_W, TV_H, '#020818');
    const lines = ['BLOBFISH TV  OS 2.6', '> TUNING CH 03 ........', '> SIGNAL LOCKED', '> LOADING MENU'];
    const chars = Math.floor(this.bootT * 60);
    let n = 0, y = 60;
    for (const l of lines) {
      const show = l.slice(0, Math.max(0, chars - n));
      n += l.length + 4;
      if (show) ui.text(show, 40, y, { font: 'body', color: y === 60 ? C.yellow : '#6aff7a' });
      if (show.length < l.length) { if (Math.floor(this.t * 4) % 2 === 0) ui.fill(40 + ui.measure(show, 'body') + 1, y - 1, 5, 9, '#6aff7a'); break; }
      y += 16;
    }
  }

  private main() {
    const ui = this.ui;
    if (this.bootT < 1.15) { this.boot(); return; }
    const ls = logoSize();
    const bob = Math.round(Math.sin(this.t * 1.5) * 2);
    drawLogo(ui.ctx, TV_W / 2, 22 + bob, this.t);
    drawRibbon(ui.ctx, TV_W / 2, 24 + ls.h - 4 + bob, 'REEL REBELLION');
    const items: [string, () => void, boolean][] = [
      ['NEW RUN', () => this.go('config'), true],
      ['RESUME', () => this.onResume?.(), !!META.activeRun],
      ['SETTINGS', () => this.go('settings'), true],
      ['CREDITS', () => this.go('credits'), true],
      ['PROLOGUE', () => this.onPrologue?.(), !!this.onPrologue],
      ['BACK TO HIDEOUT', () => this.onBack?.(), true],
    ];
    const inp = ui.input;
    if (inp?.keyHit('ArrowDown') || inp?.keyHit('KeyS')) { this.sel = (this.sel + 1) % items.length; audio.play('k_tick1', { vol: 0.2, dry: true }); }
    if (inp?.keyHit('ArrowUp') || inp?.keyHit('KeyW')) { this.sel = (this.sel + items.length - 1) % items.length; audio.play('k_tick1', { vol: 0.2, dry: true }); }
    const bw = 136, x0 = (TV_W - bw) / 2;
    items.forEach(([label, fn, en], i) => {
      // buttons slide in one after another
      const k = Math.min(1, Math.max(0, (this.menuT - i * 0.06) / 0.22));
      const x = Math.round(x0 + (1 - k * k * (3 - 2 * k)) * 220);
      const y = 88 + i * 20;
      const hot = i === this.sel;
      if (ui.hover(x, y, bw, 18) && en) this.sel = i;
      if (hot && k >= 1) { const a = Math.round(Math.sin(this.t * 6) * 1.5); ui.icon('play', x - 10 + a, y + 5); }
      const clicked = ui.button('m' + i, label, x, y, bw, 19, { style: i === 0 ? 'gold' : 'tv', disabled: !en, on: hot && en && i !== 0 });
      if (k >= 1 && (clicked || (hot && en && inp?.keyHit('Enter')))) fn();
    });
    ui.fill(40, 210, TV_W - 80, 24, '#020818', 0.85);
    ui.text(`MASTERY ${META.masteryUnlocked}  \u00b7  RUNS ${META.runs}  \u00b7  WINS ${META.wins}  \u00b7  NEMESES ${META.nemeses.length}`, TV_W / 2, 213, { font: 'small', color: C.dim, align: 'center' });
    const prompt = 'CLICK OR PRESS ENTER';
    const pw = ui.text(prompt, TV_W / 2 - 4, 224, { font: 'small', color: C.cyan, align: 'center' });
    if (Math.floor(this.t * 2.5) % 2 === 0) ui.fill(Math.round(TV_W / 2 - 4 + pw / 2) + 2, 223, 5, 8, C.cyan); // blinking block cursor
  }

  private cfgPage() {
    const ui = this.ui;
    // ---- mastery
    let x = 6, y = 20;
    ui.frame('tv', x, y, 112, 96);
    ui.text('MASTERY', x + 6, y + 6, { font: 'small', color: C.cyan });
    const d = ui.stepper('mst', `M${this.mastery}`, x + 6, y + 16, 100, { style: 'tv', font: 'body', canL: this.mastery > 0, canR: this.mastery < Math.min(MAX_MASTERY, META.masteryUnlocked) });
    if (d) { this.mastery = Math.max(0, Math.min(Math.min(MAX_MASTERY, META.masteryUnlocked), this.mastery + d)); if (AREAS[this.area].minMastery > this.mastery) this.area = 0; }
    const ml = MASTERY[this.mastery];
    ui.text(ml.name.toUpperCase(), x + 56, y + 38, { font: 'small', color: C.yellow, align: 'center' });
    const mods = masteryMods(this.mastery);
    if (!mods.length) ui.textBox(ml.mod, x + 6, y + 50, 100, { font: 'small', color: C.white });
    else {
      let yy = y + 50;
      const shown = mods.slice(-4);
      if (mods.length > 4) { ui.text(`+${mods.length - 4} more...`, x + 6, yy, { font: 'small', color: C.dim }); yy += 9; }
      ui.clip(x + 2, yy, 108, Math.max(1, y + 94 - yy));
      for (const m of shown.slice(-3)) { yy += ui.textBox('• ' + m, x + 6, yy, 100, { font: 'small', color: m === ml.mod ? C.white : '#a8b8e0' }); }
      ui.unclip();
    }
    if (this.mastery < MAX_MASTERY && this.mastery === META.masteryUnlocked) { ui.icon('lock', x + 100, y + 5); }
    // ---- start area
    y = 120;
    ui.frame('tv', x, y, 112, 92);
    ui.text('START AREA', x + 6, y + 6, { font: 'small', color: C.cyan });
    const a = AREAS[this.area];
    const da = ui.stepper('area', '', x + 6, y + 14, 100, { style: 'tv' });
    if (da) { let n = this.area; for (let k = 0; k < AREAS.length; k++) { n = (n + da + AREAS.length) % AREAS.length; if (AREAS[n].minMastery <= this.mastery) break; } this.area = n; }
    let an = a.name.toUpperCase();
    while (ui.measure(an, 'small') > 70 && an.length > 4) an = an.slice(0, -2) + '.';
    ui.text(an, x + 56, y + 18, { font: 'small', color: C.yellow, align: 'center' });
    ui.img(areaThumb(a.id), x + 24, y + 33);
    let ad = a.desc;
    while (ui.measure(ad, 'small') > 100 && ad.length > 4) ad = ad.slice(0, -2) + '.';
    ui.text(ad, x + 6, y + 78, { font: 'small', color: '#c8d8ff' });
    // ---- loadout: the 5x5 bag
    x = 122; y = 20;
    const cell = 18, gw = cell * GRID;
    ui.frame('tv', x, y, gw + 12, gw + 44);
    ui.text('LOADOUT', x + 6, y + 6, { font: 'small', color: C.cyan });
    ui.text(`${this.loadout.length}`, x + gw + 6, y + 6, { font: 'small', color: C.yellow, align: 'right' });
    const gx = x + 6 + Math.round(Math.sin(this.t * 70) * 2 * this.shake), gy = y + 16;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) ui.frame('slotTv', gx + i * cell, gy + j * cell, cell, cell);
    let hoverIt: ItemInst | null = null;
    const dragging = this.drag?.moved ? this.drag : null;
    for (const it of this.loadout) {
      if (dragging && dragging.from === 'bag' && dragging.it.uid === it.uid) continue; // lifted out
      const d2 = getItem(it.id);
      const cells = instCells(it);
      const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
      const maxX = Math.max(...cells.map((c) => c[0])), maxY = Math.max(...cells.map((c) => c[1]));
      // a little bounce right after it lands
      const dt0 = this.dropT.get(it.uid);
      const bounce = dt0 !== undefined ? -Math.round(Math.sin(Math.min(1, dt0 / 0.3) * Math.PI) * 3) : 0;
      const px = gx + minX * cell, py = gy + minY * cell + bounce, pw = (maxX - minX + 1) * cell, ph = (maxY - minY + 1) * cell;
      for (const [cx, cy] of cells) ui.fill(gx + cx * cell + 2, gy + cy * cell + 2, cell - 4, cell - 4, RARITY_COLOR[d2.rarity], 0.25);
      if (dt0 !== undefined && dt0 < 0.12) for (const [cx, cy] of cells) ui.rect(gx + cx * cell, gy + cy * cell, cell, cell, '#ffffff');
      ui.item(it.id, px + 1, py + 1, pw - 2, ph - 2, it.level ?? 1);
      if (!dragging && cells.some(([cx, cy]) => ui.hover(gx + cx * cell, gy + cy * cell, cell, cell))) hoverIt = it;
    }
    ui.block(gx, gy, gw, gw);
    // press on a bag item: pick it up (a tap without moving takes it out)
    if (hoverIt && ui.pressed && !this.drag) { this.drag = { it: hoverIt, from: 'bag', sx: ui.mx, sy: ui.my, moved: false }; }
    if (hoverIt && !this.drag) { ui.cursor = 'grab'; ui.tooltip(ui.itemTip(hoverIt.id, hoverIt.level ?? 1, [{ text: 'drag to move \u00b7 click to take out', font: 'small', color: '#7a2a1a', gap: 2 }])); }
    const bagRect = { gx, gy, gw, cell };
    if (ui.button('auto', 'AUTO', x + 6, gy + gw + 4, 44, 16, { style: 'tv', font: 'small', tip: ['Fill the bag with your best gear'] })) this.autoFill();
    if (ui.button('clear', 'CLEAR', x + gw - 38, gy + gw + 4, 44, 16, { style: 'tv', font: 'small', disabled: !this.loadout.length })) this.loadout = [];
    // station perks summary
    const perks = stationPerks();
    ui.frame('tv', x, y + gw + 48, gw + 12, 40);
    ui.text('HIDEOUT PERKS', x + 6, y + gw + 54, { font: 'small', color: C.cyan });
    const fit = (t: string, w: number) => { while (ui.measure(t, 'small') > w && t.length > 4) t = t.slice(0, -2) + '.'; return t; };
    if (!perks.perks.length) ui.text(fit('Build stations for perks', gw), x + 6, y + gw + 66, { font: 'small', color: C.dim });
    else perks.perks.slice(0, 2).forEach((p, i) => ui.text(fit(p, gw), x + 6, y + gw + 64 + i * 10, { font: 'small', color: '#c8d8ff' }));
    if (perks.perks.length > 2 && ui.hover(x, y + gw + 48, gw + 12, 40)) ui.tooltip(perks.perks, { maxW: 200 });
    // ---- stash list
    x = 238; y = 20;
    const lw = 76, lh = 170;
    ui.frame('tv', x, y, lw, lh + 16);
    ui.text('STASH', x + 6, y + 6, { font: 'small', color: C.cyan });
    const stash = META.stash.filter((s) => ITEMS[s.id]);
    if (!stash.length) ui.textBox('Empty. Extract loot on runs to fill it.', x + 6, y + 20, lw - 10, { font: 'tiny', color: C.dim });
    let tipIt: ItemInst | null = null;
    const clicked = ui.list('stash', x + 4, y + 16, lw - 6, lh - 4, stash.length, 22, (i, rx, ry, _rw, hov) => {
      const it = stash[i];
      const inb = this.inBag(it.uid);
      ui.frame('slotTv', rx + 1, ry + 1, 20, 20);
      if (inb) ui.rect(rx + 1, ry + 1, 20, 20, C.yellow);
      if (hov) { ui.rect(rx + 1, ry + 1, 20, 20, C.white); tipIt = it; if (ui.pressed && !this.drag) this.drag = { it, from: 'stash', sx: ui.mx, sy: ui.my, moved: false }; }
      const lifted = this.drag?.moved && this.drag.from === 'stash' && this.drag.it.uid === it.uid;
      ui.item(it.id, rx + 3, ry + 3, 16, 16, it.level ?? 1, lifted ? 0.35 : 1);
      if ((it.level ?? 1) > 1) ui.text(`+${(it.level ?? 1) - 1}`, rx + 20, ry + 2, { font: 'small', color: C.green, outline: '#000', align: 'right' });
    }, { style: 'tv', cols: 3 });
    if (tipIt && !this.drag?.moved) { const ti = tipIt as ItemInst; ui.tooltip(ui.itemTip(ti.id, ti.level ?? 1, [{ text: this.inBag(ti.uid) ? 'click: take out' : 'click or drag into the bag', font: 'small', color: '#1a4a7a', gap: 2 }])); }
    void clicked;
    this.dragDrop(bagRect);
    // ---- bottom bar: back + ENTER
    if (ui.button('back', 'BACK', 6, 216, 60, 19, { style: 'tv', key: 'Backspace', keyLabel: '' })) this.go('main');
    const pulse = Math.sin(this.t * 5) > 0;
    const ex = 124, ew = 190;
    if (pulse) ui.fill(ex - 2, 214, ew + 4, 23, '#6aff7a', 0.25);
    if (ui.button('enter', 'ENTER THE OCEAN', ex, 216, ew, 19, { style: 'green', font: 'title', key: 'Enter', sfx: 'k_confirm2' })) {
      META.lastConfig = this.config(); META.mastery = this.mastery; saveMeta();
      this.onEnter?.(this.config());
    }
  }

  /** the loadout drag & drop: lift, preview the target cells, drop with a thunk (or bounce back) */
  private dragDrop(b: { gx: number; gy: number; gw: number; cell: number }) {
    const ui = this.ui, d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(ui.mx - d.sx, ui.my - d.sy) > 3) { d.moved = true; audio.play('k_pluck1', { vol: 0.35, dry: true }); }
    const def = getItem(d.it.id);
    // origin cell under the cursor (the grab point sits in the item's first cell)
    const cx = Math.floor((ui.mx - b.gx) / b.cell), cy = Math.floor((ui.my - b.gy) / b.cell);
    const overBag = ui.mx >= b.gx && ui.my >= b.gy && ui.mx < b.gx + b.gw && ui.my < b.gy + b.gw;
    const probe: ItemInst = { ...d.it, gx: -1, gy: -1, rot: d.from === 'bag' ? d.it.rot : 0 };
    const ok = overBag && fits(this.loadout, probe, cx, cy, probe.rot);
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
      // the lifted item follows the cursor, raised with a hard shadow
      const sz = { w: Math.max(...def.shape.map((c) => c[0])) + 1, h: Math.max(...def.shape.map((c) => c[1])) + 1 };
      const w = sz.w * 16, h = sz.h * 16;
      const ix = ui.mx - 8, iy = ui.my - 10;
      ui.fill(ix + 2, iy + 3, w, h, '#000000', 0.45);
      ui.item(d.it.id, ix, iy, w, h, d.it.level ?? 1);
    }
    if (ui.released) {
      if (!d.moved) {
        // a tap: toggle
        if (d.from === 'bag' || this.inBag(d.it.uid)) { this.loadout = this.loadout.filter((l) => l.uid !== d.it.uid); audio.play('k_drop2', { vol: 0.3, dry: true }); }
        else this.addToBag(d.it);
      } else if (overBag && ok) {
        this.loadout = this.loadout.filter((l) => l.uid !== d.it.uid);
        this.loadout.push({ ...d.it, gx: cx, gy: cy, rot: probe.rot });
        this.dropT.set(d.it.uid, 0);
        audio.play('box_thud', { vol: 0.35, dry: true, rate: 1.6 }); audio.play('k_drop3', { vol: 0.3, dry: true });
      } else if (overBag) {
        this.shake = 1; audio.play('k_err1', { vol: 0.35, dry: true });
      } else if (d.from === 'bag') {
        this.loadout = this.loadout.filter((l) => l.uid !== d.it.uid);
        audio.play('k_drop2', { vol: 0.3, dry: true });
      }
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

  private settings() {
    const ui = this.ui;
    const x = 40, w = 240;
    ui.frame('tv', x, 24, w, 186);
    let y = 36;
    const row = (label: string) => { ui.text(label, x + 12, y + 1, { font: 'small', color: C.cyan }); };
    row('MASTER VOLUME');
    const v = ui.slider('vol', audio.volume.master, x + 110, y, 110, { style: 'tv' });
    if (v !== audio.volume.master) { audio.volume.master = v; META.settings.volume = v; audio.setVolumes(); saveMeta(); }
    y += 22; row('MUSIC');
    const mu = ui.slider('mus', audio.volume.music, x + 110, y, 110, { style: 'tv' });
    if (mu !== audio.volume.music) { audio.volume.music = mu; META.settings.music = mu; audio.setVolumes(); saveMeta(); }
    y += 22; row('MOTION BLUR');
    const mb = ui.slider('mb', META.settings.motionBlur, x + 110, y, 110, { style: 'tv', step: 0.25 });
    if (mb !== META.settings.motionBlur) { META.settings.motionBlur = mb; saveMeta(); }
    y += 24;
    const lq = ui.toggle('lq', META.settings.lowQuality, 'LOW QUALITY (needs reload)', x + 12, y, { style: 'tv', font: 'small' });
    if (lq !== META.settings.lowQuality) { META.settings.lowQuality = lq; try { localStorage.setItem('blobfish.lq', lq ? '1' : '0'); } catch { /* ignore */ } saveMeta(); }
    y += 26;
    ui.text('CONTROLS', x + 12, y, { font: 'small', color: C.cyan });
    y += 12;
    let hx = x + 12;
    hx += ui.hint('RMB', 'orbit', hx, y, { color: '#c8d8ff' });
    hx += ui.hint('LMB', 'pan / use', hx, y, { color: '#c8d8ff' });
    ui.hint('MMB', 'zoom', hx, y, { color: '#c8d8ff' });
    y += 16; hx = x + 12;
    hx += ui.hint('Q', 'turn', hx, y, { color: '#c8d8ff' });
    hx += ui.hint('B', 'build', hx, y, { color: '#c8d8ff' });
    ui.hint('ESC', 'back', hx, y, { color: '#c8d8ff' });
    if (ui.button('reset', 'RESET SAVE', x + 12, 186, 90, 18, { style: 'red', font: 'small' })) this.go('reset');
    if (ui.button('back', 'BACK', x + w - 72, 186, 60, 18, { style: 'tv' })) this.go('main');
  }

  private credits() {
    const ui = this.ui;
    this.creditsT += 1 / 60;
    const lines: [string, string][] = [
      ['BLOBFISH: REEL REBELLION', C.yellow], ['', ''], ['Made with three.js', C.white], ['', ''],
      ['FONTS', C.cyan], ['Alagard — Hewett Tsoi', C.white], ['m6x11plus, m5x7 — Daniel Linssen', C.white], ['Jacquard 24, Tiny5, Pixelify Sans — OFL', C.white], ['TBME Goofy — from Chewy (Apache 2.0)', C.white], ['', ''],
      ['SOUND & MUSIC', C.cyan], ['CC0 / public domain recordings', C.white], ['Kenney, rubberduck, Memoraphile', C.white], ['cynicmusic, joth, TAD, umplix', C.white], ['OpenGameArt.org contributors', C.white], ['US National Park Service', C.white], ['', ''],
      ['ALSO', C.cyan], ['Water from FISHTOP', C.white], ['People from Limbophobia', C.white], ['Every texture painted in code', C.white], ['', ''],
      ['Full list in CREDITS.md', C.dim], ['', ''], ['thanks for playing', C.yellow],
    ];
    const H = lines.length * 11;
    const off = (this.creditsT * 14) % (H + 200);
    ui.clip(0, 14, TV_W, 196);
    lines.forEach(([l, c], i) => { const y = 210 - off + i * 11; if (y > 0 && y < TV_H) ui.text(l, TV_W / 2, y, { font: i === 0 ? 'title' : 'small', color: c || C.white, align: 'center', shadow: '#000' }); });
    ui.unclip();
    if (ui.button('back', 'BACK', (TV_W - 60) / 2, 216, 60, 19, { style: 'tv' })) this.go('main');
  }

  private reset() {
    const ui = this.ui;
    ui.frame('tv', 50, 70, 220, 100);
    ui.text('ERASE EVERYTHING?', TV_W / 2, 82, { font: 'title', color: C.red, align: 'center', shadow: '#000' });
    ui.textBox('Your stash, materials, hideout, mastery and every nemesis will be forgotten.', 62, 102, 196, { font: 'small', color: C.white, align: 'center' });
    this.resetArm = Math.max(0, this.resetArm - 1 / 60);
    if (ui.button('yes', this.resetArm > 0 ? 'REALLY?' : 'ERASE', 70, 144, 80, 18, { style: 'red' })) {
      if (this.resetArm > 0) { resetMeta(); audio.play('k_glitch1', { vol: 0.5, dry: true }); location.reload(); }
      else this.resetArm = 3;
    }
    if (ui.button('no', 'KEEP IT', 170, 144, 80, 18, { style: 'tv' })) this.go('settings');
  }
}
