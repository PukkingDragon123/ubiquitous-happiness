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
  onBack?: () => void;
  private creditsT = 0;
  private resetArm = 0;

  constructor() { this.ui.drawCursor = true; }

  go(p: TvPage) {
    if (p === this.page) return;
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
    this.t += dt;
    this.staticK = Math.max(0, this.staticK - dt * 4);
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
    const ctx = ui.ctx;
    // deep-sea gradient in hard bands
    for (let y = 0; y < TV_H; y += 4) {
      const k = y / TV_H;
      const r = Math.round(4 + 6 * (1 - k)), g = Math.round(16 + 40 * (1 - k)), b = Math.round(58 + 50 * (1 - k));
      ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, y, TV_W, 4);
    }
    // drifting light shafts (dithered)
    ctx.fillStyle = 'rgba(120,220,255,0.07)';
    for (let i = 0; i < 5; i++) {
      const x0 = ((i * 83 + t * 6) % (TV_W + 80)) - 60;
      for (let y = 0; y < TV_H; y += 2) ctx.fillRect(Math.round(x0 + y * 0.35), y, 18 - y * 0.05, 1);
    }
    // marine snow
    ctx.fillStyle = 'rgba(200,240,255,0.5)';
    for (let i = 0; i < 26; i++) { const x = (i * 97 + Math.sin(t * 0.3 + i) * 6) % TV_W, y = (i * 53 + t * (4 + (i % 3))) % TV_H; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
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

  private title(y: number) {
    const ui = this.ui, t = this.t;
    const bob = Math.round(Math.sin(t * 1.5) * 2);
    ui.text('BLOBFISH', TV_W / 2, y + bob, { font: 'big', color: '#fff6c8', color2: '#ffb43a', outline: '#3a1400', shadow: '#000', align: 'center' });
    ui.text('REEL REBELLION', TV_W / 2, y + 30 + bob, { font: 'title', color: '#bff4ff', color2: '#4ac8ff', outline: '#02203a', align: 'center' });
  }

  private main() {
    const ui = this.ui;
    this.title(30);
    const items: [string, () => void, boolean][] = [
      ['NEW RUN', () => this.go('config'), true],
      ['RESUME', () => this.onResume?.(), !!META.activeRun],
      ['SETTINGS', () => this.go('settings'), true],
      ['CREDITS', () => this.go('credits'), true],
      ['BACK TO HIDEOUT', () => this.onBack?.(), true],
    ];
    const inp = ui.input;
    if (inp?.keyHit('ArrowDown') || inp?.keyHit('KeyS')) { this.sel = (this.sel + 1) % items.length; audio.play('k_tick1', { vol: 0.2, dry: true }); }
    if (inp?.keyHit('ArrowUp') || inp?.keyHit('KeyW')) { this.sel = (this.sel + items.length - 1) % items.length; audio.play('k_tick1', { vol: 0.2, dry: true }); }
    const bw = 136, x = (TV_W - bw) / 2;
    items.forEach(([label, fn, en], i) => {
      const y = 92 + i * 22;
      const hot = i === this.sel;
      if (ui.hover(x, y, bw, 18) && en) this.sel = i;
      if (hot) { const a = Math.round(Math.sin(this.t * 6) * 1.5); ui.icon('play', x - 10 + a, y + 5); }
      const clicked = ui.button('m' + i, label, x, y, bw, 19, { style: i === 0 ? 'gold' : 'tv', disabled: !en, on: hot && en && i !== 0 });
      if (clicked || (hot && en && inp?.keyHit('Enter'))) fn();
    });
    ui.text(`MASTERY ${META.masteryUnlocked}  ·  RUNS ${META.runs}  ·  WINS ${META.wins}  ·  NEMESES ${META.nemeses.length}`, TV_W / 2, 210, { font: 'small', color: C.dim, align: 'center' });
    if (Math.sin(this.t * 4) > -0.2) ui.text('↑↓ + ENTER  OR CLICK', TV_W / 2, 222, { font: 'small', color: C.cyan, align: 'center' });
  }

  private cfgPage() {
    const ui = this.ui;
    // ---- mastery
    let x = 6, y = 20;
    ui.frame('tv', x, y, 112, 100);
    ui.text('MASTERY', x + 6, y + 6, { font: 'small', color: C.cyan });
    const d = ui.stepper('mst', `M${this.mastery}`, x + 6, y + 16, 100, { style: 'tv', canL: this.mastery > 0, canR: this.mastery < Math.min(MAX_MASTERY, META.masteryUnlocked) });
    if (d) { this.mastery = Math.max(0, Math.min(Math.min(MAX_MASTERY, META.masteryUnlocked), this.mastery + d)); if (AREAS[this.area].minMastery > this.mastery) this.area = 0; }
    const ml = MASTERY[this.mastery];
    ui.text(ml.name.toUpperCase(), x + 56, y + 38, { font: 'small', color: C.yellow, align: 'center' });
    const mods = masteryMods(this.mastery);
    if (!mods.length) ui.textBox(ml.mod, x + 6, y + 50, 100, { font: 'small', color: C.white });
    else {
      let yy = y + 50;
      const shown = mods.slice(-4);
      if (mods.length > 4) { ui.text(`+${mods.length - 4} more...`, x + 6, yy, { font: 'small', color: C.dim }); yy += 9; }
      for (const m of shown) { yy += ui.textBox('• ' + m, x + 6, yy, 100, { font: 'small', color: m === ml.mod ? C.white : '#a8b8e0' }); if (yy > y + 96) break; }
    }
    if (this.mastery < MAX_MASTERY && this.mastery === META.masteryUnlocked) { ui.icon('lock', x + 100, y + 5); }
    // ---- start area
    y = 124;
    ui.frame('tv', x, y, 112, 88);
    ui.text('START AREA', x + 6, y + 6, { font: 'small', color: C.cyan });
    const a = AREAS[this.area];
    const da = ui.stepper('area', '', x + 6, y + 15, 100, { style: 'tv' });
    if (da) { let n = this.area; for (let k = 0; k < AREAS.length; k++) { n = (n + da + AREAS.length) % AREAS.length; if (AREAS[n].minMastery <= this.mastery) break; } this.area = n; }
    ui.text(a.name.toUpperCase(), x + 56, y + 19, { font: 'small', color: C.yellow, align: 'center' });
    ui.img(areaThumb(a.id), x + 24, y + 35);
    ui.textBox(a.desc, x + 6, y + 77, 100, { font: 'tiny', color: '#c8d8ff' });
    // ---- loadout: the 5x5 bag
    x = 124; y = 20;
    const cell = 17, gw = cell * GRID;
    ui.frame('tv', x, y, gw + 12, gw + 44);
    ui.text('LOADOUT', x + 6, y + 6, { font: 'small', color: C.cyan });
    ui.text(`${this.loadout.length}`, x + gw + 6, y + 6, { font: 'small', color: C.yellow, align: 'right' });
    const gx = x + 6, gy = y + 16;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) ui.frame('slotTv', gx + i * cell, gy + j * cell, cell, cell);
    let hoverIt: ItemInst | null = null;
    for (const it of this.loadout) {
      const d2 = getItem(it.id);
      const cells = instCells(it);
      const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
      const maxX = Math.max(...cells.map((c) => c[0])), maxY = Math.max(...cells.map((c) => c[1]));
      const px = gx + minX * cell, py = gy + minY * cell, pw = (maxX - minX + 1) * cell, ph = (maxY - minY + 1) * cell;
      for (const [cx, cy] of cells) ui.fill(gx + cx * cell + 1, gy + cy * cell + 1, cell - 2, cell - 2, RARITY_COLOR[d2.rarity], 0.18);
      ui.item(it.id, px + 1, py + 1, pw - 2, ph - 2, it.level ?? 1);
      if (cells.some(([cx, cy]) => ui.hover(gx + cx * cell, gy + cy * cell, cell, cell))) hoverIt = it;
    }
    if (hoverIt) {
      ui.cursor = 'remove';
      ui.tooltip(ui.itemTip(hoverIt.id, hoverIt.level ?? 1, [{ text: 'click: take out', font: 'small', color: '#7a2a1a', gap: 2 }]));
      if (ui.released && ui.hover(gx, gy, gw, gw)) { this.loadout = this.loadout.filter((l) => l !== hoverIt); audio.play('k_drop2', { vol: 0.3, dry: true }); }
    }
    ui.block(gx, gy, gw, gw);
    if (ui.button('auto', 'AUTO', x + 6, gy + gw + 4, 44, 16, { style: 'tv', font: 'small', tip: ['Fill the bag with your best gear'] })) this.autoFill();
    if (ui.button('clear', 'CLEAR', x + gw - 38, gy + gw + 4, 44, 16, { style: 'tv', font: 'small', disabled: !this.loadout.length })) this.loadout = [];
    // station perks summary
    const perks = stationPerks();
    ui.frame('tv', x, y + gw + 48, gw + 12, 40);
    ui.text('HIDEOUT PERKS', x + 6, y + gw + 54, { font: 'small', color: C.cyan });
    if (!perks.perks.length) ui.text('build stations for perks', x + 6, y + gw + 66, { font: 'tiny', color: C.dim });
    else perks.perks.slice(0, 2).forEach((p, i) => ui.text(p.length > 30 ? p.slice(0, 29) + '…' : p, x + 6, y + gw + 64 + i * 9, { font: 'tiny', color: '#c8d8ff' }));
    if (perks.perks.length > 2 && ui.hover(x, y + gw + 48, gw + 12, 40)) ui.tooltip(perks.perks, { maxW: 200 });
    // ---- stash list
    x = 238; y = 20;
    const lw = 76, lh = 170;
    ui.frame('tv', x, y, lw, lh + 16);
    ui.text('STASH', x + 6, y + 6, { font: 'small', color: C.cyan });
    const stash = META.stash.filter((s) => ITEMS[s.id]);
    if (!stash.length) ui.textBox('Empty. Extract loot on runs to fill it.', x + 6, y + 20, lw - 10, { font: 'tiny', color: C.dim });
    let tipIt: ItemInst | null = null;
    const clicked = ui.list('stash', x + 4, y + 16, lw - 6, lh - 4, stash.length, 17, (i, rx, ry, rw, hov) => {
      const it = stash[i];
      const inb = this.inBag(it.uid);
      if (inb) ui.fill(rx, ry, rw, 16, '#1a4a8a');
      if (hov) { ui.fill(rx, ry, rw, 16, '#2a6ad0', 0.6); tipIt = it; }
      ui.item(it.id, rx + 1, ry + 1, 14, 14, it.level ?? 1);
      const nm = getItem(it.id).name;
      const short = ui.measure(nm, 'tiny') > rw - 20 ? nm.slice(0, Math.max(3, Math.floor((rw - 22) / 4))) + '.' : nm;
      ui.text(short, rx + 17, ry + 3, { font: 'tiny', color: inb ? C.yellow : C.white });
      if ((it.level ?? 1) > 1) ui.text(`+${(it.level ?? 1) - 1}`, rx + 17, ry + 10, { font: 'tiny', color: C.green });
      if (inb) ui.icon('check', rx + rw - 10, ry + 4);
    }, { style: 'tv' });
    if (tipIt) { const ti = tipIt as ItemInst; ui.tooltip(ui.itemTip(ti.id, ti.level ?? 1, [{ text: this.inBag(ti.uid) ? 'click: take out' : 'click: pack it', font: 'small', color: '#1a4a7a', gap: 2 }])); }
    if (clicked >= 0) {
      const it = stash[clicked];
      if (this.inBag(it.uid)) { this.loadout = this.loadout.filter((l) => l.uid !== it.uid); audio.play('k_drop2', { vol: 0.3, dry: true }); }
      else this.addToBag(it);
    }
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
