// The run HUD: a small, mostly diegetic pixel-art layer (B's PixelUI kit) over the wave-defense run.
//   top left    hearts (half hearts) + the area plaque
//   top centre  wave counter / intermission timer (hold ENTER to start early) / AREA CLEAR
//   top right   the mailman manatee's schedule
//   bottom left the loot bag: icons + counts (lost on death until it goes home)
//   in world    the wreck's hp + stage pips + what the next repair needs (above the hull), [E] prompts over the
//               blobfish, off-screen arrows to the mail buoy and the wreck, rising "SENT HOME" receipts
//   the skill bar + mana crystal is E's SkillBar (its own overlay); the pause menu and banners live here too.
import { PixelUI } from '../ui/pixel/ui';
import { ITEMS, getItem } from './items';
import { audio } from '../audio/audio';

export interface HudAnchor { x: number; y: number; on: boolean; behind?: boolean }

export interface HudState {
  hp: number; maxHp: number;
  areaName: string; areaIdx: number; areaCount: number;
  phase: string;
  wave: number; waves: number; remaining: number; boss: boolean;
  interT: number; interMax: number; holdK: number;
  bag: [string, number][];
  loose: string[];
  manatee: { state: string; eta: number; wait: number };
  wreck: { hp: number; maxHp: number; stage: number; stages: number; stageName: string; needs: Record<string, number>; ready: boolean; at: HudAnchor; dist: number };
  buoy: { at: HudAnchor; dist: number };
  player: HudAnchor;
  prompt: { key: string; label: string; k?: number } | null;
  have: Record<string, number>;
  paused: boolean;
}

// ------------------------------------------------------------------ hand-placed art
const PAL: Record<string, string> = {
  k: '#1a0610', R: '#e8304a', D: '#9a1830', W: '#ffd0d8', e: '#3a1a28', E: '#52283a',
  s: '#6a4a2a', S: '#8a6a3a', w: '#e8dcc0', r: '#c0342a', b: '#2a5ab0', B: '#5a9ae8', y: '#ffd860', g: '#5a5460', l: '#d9d4cc',
};
function paint(rows: string[]): HTMLCanvasElement {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!;
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const c = PAL[r[i]]; if (c) { x.fillStyle = c; x.fillRect(i, y, 1, 1); } } });
  return cv;
}
const HEART = [
  '.kk...kk.',
  'kRRk.kRRk',
  'kRWRkRRRk',
  'kRRRRRRRk',
  '.kRRRRDk.',
  '..kRRDk..',
  '...kDk...',
  '....k....',
];
const ART = {
  heart: paint(HEART),
  heartEmpty: paint(HEART.map((r) => r.replace(/[RWD]/g, (c) => (c === 'W' ? 'E' : 'e')))),
  heartHalf: paint(HEART.map((r) => r.split('').map((c, i) => (i >= 5 && 'RWD'.includes(c) ? 'e' : c)).join(''))),
  ship: paint([
    '.....k.....',
    '....kwk....',
    '....kwwk...',
    '....kwwwk..',
    '....kkkkkk.',
    'kkkkkkkkkkk',
    'kSSSSSSSSSk',
    '.kssssssk..',
    '..kkkkkkk..',
  ]),
  mail: paint([
    'kkkkkkkkk',
    'kwwwwwwwk',
    'krwwwwwbk',
    'kwkwwwkwk',
    'kwwkwkwwk',
    'kwwwkwwwk',
    'kkkkkkkkk',
  ]),
  bell: paint([
    '...kk...',
    '..kyyk..',
    '.kyyyyk.',
    '.kyyyyk.',
    'kyyyyyyk',
    'kkkkkkkk',
    '...kk...',
  ]),
};

const C = { white: '#f4f0e6', dim: '#9aa8b8', gold: '#ffd860', red: '#ff5a4a', green: '#7aea6a', cyan: '#8ae8ff', ink: '#06080e' };
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmt = (s: number) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

interface Floater { text: string; icons: [string, number][]; at: () => HudAnchor; t: number; life: number; color: string }
interface Banner { title: string; sub: string; t: number; life: number; color: string; small: boolean }

export class RunHud {
  ui = new PixelUI({ targetH: 240 });
  private floaters: Floater[] = [];
  private banners: Banner[] = [];
  private bagFlash = new Map<string, number>();
  private arrows: [number, number][] = [];
  private t = 0;

  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); }

  /** a rising receipt at a world anchor: "SENT HOME" + the item icons */
  receipt(text: string, icons: [string, number][], at: () => HudAnchor, color = C.gold) { this.floaters.push({ text, icons, at, t: 0, life: 2.8, color }); }
  /** a big centred title card (area names, AREA CLEAR, WAVE n) */
  banner(title: string, sub = '', color = C.white, life = 3, small = false) { this.banners = this.banners.filter((b) => b.t < b.life - 0.4); this.banners.push({ title, sub, t: 0, life, color, small }); }
  flashBag(id: string) { this.bagFlash.set(id, 1); }

  /**
   * draw the HUD; returns the pause menu's choice when paused ('resume' | 'quit' | 'bag'), else null
   */
  draw(dt: number, s: HudState, input: Parameters<PixelUI['begin']>[0]): string | null {
    const ui = this.ui;
    this.t += dt;
    ui.drawCursor = s.paused;
    ui.begin(input, dt);
    let choice: string | null = null;
    if (s.phase !== 'dead' && s.phase !== 'fade' && s.phase !== 'sailing') {
      this.inWorld(s);
      this.hearts(s);
      this.waveBox(s);
      this.manatee(s);
      this.bag(s);
    }
    this.drawFloaters(dt);
    this.drawBanners(dt);
    if (s.paused) choice = this.pauseMenu(s);
    ui.end();
    for (const [k, v] of this.bagFlash) { const n = v - dt * 2; if (n <= 0) this.bagFlash.delete(k); else this.bagFlash.set(k, n); }
    return choice;
  }

  // ---------------------------------------------------------------- top left: hearts + area
  private hearts(s: HudState) {
    const ui = this.ui;
    const n = Math.ceil(s.maxHp / 2);
    const low = s.hp <= 2 && s.hp > 0;
    for (let i = 0; i < n; i++) {
      const v = s.hp - i * 2;
      const art = v >= 2 ? ART.heart : v === 1 ? ART.heartHalf : ART.heartEmpty;
      const bob = low && v > 0 && Math.floor(this.t * 4 + i) % 4 === 0 ? -1 : 0;
      ui.img(art, 5 + (i % 10) * 10, 5 + Math.floor(i / 10) * 9 + bob);
    }
    const y = 5 + Math.ceil(n / 10) * 9 + 2;
    // the area's name when there's room beside the wave counter, else just the count
    const name = ui.w >= 400 ? s.areaName.toUpperCase() : 'AREA';
    const aw = ui.text(name, 5, y, { font: 'small', color: C.white, outline: C.ink });
    ui.text(` ${s.areaIdx + 1}/${s.areaCount}`, 5 + aw, y, { font: 'small', color: C.dim, outline: C.ink });
  }

  // ---------------------------------------------------------------- top centre: waves
  private waveBox(s: HudState) {
    const ui = this.ui, cx = Math.round(ui.w / 2);
    let y = 4;
    const title = s.phase === 'cleared' || s.phase === 'sailing' ? 'AREA CLEAR' : `WAVE ${Math.min(s.waves, s.wave + 1)}/${s.waves}`;
    ui.text(title, cx, y, { font: 'title', color: s.boss && s.phase === 'wave' ? C.red : C.white, color2: s.boss && s.phase === 'wave' ? '#ff9a7a' : '#ffd860', outline: C.ink, align: 'center' });
    y += ui.lh('title');
    if (s.phase === 'wave') {
      ui.text(s.boss ? `BOSS WAVE · ${s.remaining} LEFT` : `${s.remaining} LEFT`, cx, y, { font: 'small', color: s.boss ? C.red : C.dim, outline: C.ink, align: 'center' });
    } else if (s.phase === 'intermission') {
      // one row: the ENTER keycap (fills while held) + the countdown
      const label = `NEXT WAVE ${fmt(s.interT)}`;
      const kw = ui.keycap('ENTER', 0, -100);
      const lw = ui.measure(label, 'small');
      const x0 = cx - Math.round((kw + 4 + lw) / 2);
      ui.text(label, x0, y + 3, { font: 'small', color: s.interT < 6 ? C.gold : C.cyan, outline: C.ink });
      ui.keycap('ENTER', x0 + lw + 4, y, true);
      if (s.holdK > 0) ui.fill(x0 + lw + 5, y + 10, Math.round((kw - 2) * s.holdK), 1, C.gold);
      ui.fill(cx - 30, y + 14, Math.round(60 * Math.max(0, s.interT / Math.max(1, s.interMax))), 1, '#5ac8ff', 0.8);
    } else if (s.phase === 'cleared') {
      const msg = s.wreck.ready ? 'SET SAIL AT THE WRECK' : 'REPAIR THE WRECK';
      ui.text(msg, cx, y, { font: 'small', color: Math.floor(this.t * 2) % 2 ? C.gold : C.white, outline: C.ink, align: 'center' });
    }
  }

  // ---------------------------------------------------------------- top right: the manatee
  private manatee(s: HudState) {
    const ui = this.ui, m = s.manatee;
    let label: string, col: string;
    if (m.state === 'waiting') { label = `HERE ${fmt(m.wait)}`; col = C.green; }
    else if (m.state === 'arriving') { label = 'COMING'; col = C.cyan; }
    else if (m.state === 'leaving') { label = 'GONE'; col = C.dim; }
    else { label = `IN ${fmt(m.eta)}`; col = C.dim; }
    const tw = ui.measure(label, 'small');
    const x = ui.w - 5 - tw - ART.mail.width - 3;
    const blink = m.state === 'waiting' && Math.floor(this.t * 3) % 2 === 0;
    ui.img(ART.mail, x, 5 + (blink ? -1 : 0));
    ui.text(label, x + ART.mail.width + 3, 6, { font: 'small', color: col, outline: C.ink });
    ui.text('MANATEE', ui.w - 5, 6 + ui.lh('small'), { font: 'small', color: '#6a7888', outline: C.ink, align: 'right' });
  }

  // ---------------------------------------------------------------- bottom left: the loot bag
  private bag(s: HudState) {
    const ui = this.ui;
    const stacks: [string, number][] = [...s.bag, ...s.loose.map((id) => [id, 1] as [string, number])];
    const cell = 18, cols = 6;
    const shown = stacks.slice(0, cols * 2);
    const rows = Math.ceil(shown.length / cols);
    const w = rows ? cols * cell + 8 : ui.measure('BAG', 'small') + ui.measure('empty', 'small') + 16, h = rows * cell + (rows ? 18 : 15);
    const x = 4, y = ui.h - h - 4;
    ui.frame('dark', x, y, w, h, 0.85);
    ui.text('BAG', x + 5, y + 5, { font: 'small', color: C.gold, outline: C.ink });
    if (!stacks.length) ui.text('empty', x + w - 5, y + 5, { font: 'small', color: '#5a6878', outline: C.ink, align: 'right' });
    else ui.text('lost if you die', x + w - 5, y + 5, { font: 'small', color: '#6a7888', outline: C.ink, align: 'right' });
    shown.forEach(([id, n], i) => {
      const cx = x + 4 + (i % cols) * cell, cy = y + 14 + Math.floor(i / cols) * cell;
      const f = this.bagFlash.get(id) ?? 0;
      ui.frame('slot', cx, cy, cell, cell);
      if (f > 0) ui.fill(cx + 1, cy + 1, cell - 2, cell - 2, '#fff2a0', f * 0.6);
      if (ITEMS[id]) ui.item(id, cx + 1, cy + 1 - (f > 0.5 ? 1 : 0), 16, 16);
      if (n > 1) ui.text(String(n), cx + cell - 1, cy + cell - 8, { font: 'small', color: C.white, outline: C.ink, align: 'right' });
      if (ui.hover(cx, cy, cell, cell) && ITEMS[id]) ui.tooltip([{ text: getItem(id).name, color: '#2a1808' }, { text: ITEMS[id].kind === 'material' ? 'material: extract or repair' : 'gear: TAB to equip, or extract', font: 'small', color: '#5a4a3a' }]);
    });
    if (stacks.length > shown.length) ui.text(`+${stacks.length - shown.length}`, x + w - 4, y + h - 9, { font: 'small', color: C.gold, outline: C.ink, align: 'right' });
  }

  // ---------------------------------------------------------------- in-world widgets
  private inWorld(s: HudState) {
    const ui = this.ui;
    // ---- the wreck: hp, stage pips and the next repair's needs, floating above the hull
    const wk = s.wreck, wa = wk.at;
    if (wa.on) {
      const needs = Object.entries(wk.needs);
      const near = wk.dist < 14;
      const cw = near && needs.length ? ui.costWidth(wk.needs, { have: s.have, size: 12, showHave: true, gap: 3 }) : 0;
      const w = Math.max(52, cw + 8), h = near && needs.length ? 26 : 13;
      const x = Math.round(clampN(wa.x - w / 2, 2, ui.w - w - 2)), y = Math.round(clampN(wa.y - h, 32, ui.h - 60));
      ui.fill(x, y, w, h, '#06080e', 0.6);
      ui.rect(x, y, w, h, '#2a3040');
      // stage pips (gold = repaired) + hp
      for (let i = 0; i < wk.stages; i++) ui.fill(x + 3 + i * 5, y + 3, 4, 3, i < wk.stage ? C.gold : '#3a3a4a');
      const k = wk.hp / Math.max(1, wk.maxHp);
      ui.bar(x + 4 + wk.stages * 5, y + 3, w - 7 - wk.stages * 5, 4, k, k > 0.5 ? '#5ad04a' : k > 0.25 ? '#e8b030' : '#e83a3a');
      if (wk.ready) ui.text('SEAWORTHY', x + w / 2, y + 9, { font: 'small', color: C.green, outline: C.ink, align: 'center' });
      else if (near && needs.length) ui.costRow(wk.needs, x + 4, y + 11, { have: s.have, size: 12, showHave: true, gap: 3, font: 'small' });
    } else this.edgeArrow(wa, ART.ship, wk.dist, wk.hp / Math.max(1, wk.maxHp));
    // ---- the buoy (only an arrow when it is off screen)
    if (!s.buoy.at.on) this.edgeArrow(s.buoy.at, ART.mail, s.buoy.dist, -1, s.manatee.state === 'waiting');
    this.arrows.length = 0;
    // ---- the interaction prompt over the blobfish
    if (s.prompt && s.player.on) {
      const p = s.prompt;
      const kw = ui.keycap(p.key, 0, -100);
      const lw = ui.measure(p.label, 'small');
      const w = kw + 3 + lw, x = Math.round(s.player.x - w / 2), y = Math.round(s.player.y - 34 + Math.sin(this.t * 4) * 1.5);
      ui.fill(x - 3, y - 2, w + 6, 16, '#000000', 0.45);
      ui.keycap(p.key, x, y);
      if (p.k !== undefined && p.k > 0) ui.fill(x + 1, y + 10, Math.round((kw - 2) * p.k), 1, C.gold);
      ui.text(p.label, x + kw + 3, y + 3, { font: 'small', color: C.white, outline: C.ink });
    }
  }

  /** an arrow pinned to the screen edge pointing at an off-screen anchor, with an icon and the distance */
  private edgeArrow(a: HudAnchor, art: HTMLCanvasElement, dist: number, hpK = -1, pulse = false) {
    const ui = this.ui;
    const cx = ui.w / 2, cy = ui.h / 2;
    let dx = a.x - cx, dy = a.y - cy;
    if (a.behind) { dx = -dx; dy = -dy; }
    const m = 14;
    const sx = (ui.w / 2 - m) / Math.max(1e-3, Math.abs(dx)), sy = (ui.h / 2 - m - 18) / Math.max(1e-3, Math.abs(dy));
    const k = Math.min(sx, sy);
    const x = Math.round(cx + dx * k);
    let y = Math.round(cy + dy * k);
    // two arrows on the same edge: stack them
    for (const o of this.arrows) if (Math.abs(o[0] - x) < 24 && Math.abs(o[1] - y) < 28) y = o[1] + (o[1] > ui.h / 2 ? -30 : 30);
    this.arrows.push([x, y]);
    const ang = Math.atan2(dy, dx);
    // arrow head: a filled pixel triangle
    const tipX = x + Math.cos(ang) * 9, tipY = y + Math.sin(ang) * 9;
    for (let i = 0; i <= 5; i++) {
      const bx = x + Math.cos(ang) * (9 - i), by = y + Math.sin(ang) * (9 - i);
      const half = i * 0.7;
      for (let j = -half; j <= half; j += 0.5) ui.fill(bx - Math.sin(ang) * j, by + Math.cos(ang) * j, 1, 1, pulse && Math.floor(this.t * 4) % 2 ? C.green : C.gold);
    }
    ui.fill(tipX, tipY, 1, 1, '#ffffff');
    ui.fill(x - art.width / 2 - 2, y - art.height / 2 - 2, art.width + 4, art.height + 4, '#000000', 0.5);
    ui.img(art, x - Math.floor(art.width / 2), y - Math.floor(art.height / 2));
    ui.text(`${Math.round(dist)}m`, x, y + art.height / 2 + 3, { font: 'small', color: C.white, outline: C.ink, align: 'center' });
    if (hpK >= 0) ui.bar(x - 10, y - art.height / 2 - 6, 20, 3, hpK, hpK > 0.5 ? '#5ad04a' : hpK > 0.25 ? '#e8b030' : '#e83a3a');
  }

  private drawFloaters(dt: number) {
    const ui = this.ui;
    for (const f of this.floaters) {
      f.t += dt;
      const a = f.at();
      if (!a.on) continue;
      const rise = f.t * 10;
      const alpha = f.t > f.life - 0.6 ? Math.max(0, (f.life - f.t) / 0.6) : 1;
      const y = Math.round(a.y - 20 - rise);
      ui.text(f.text, a.x, y, { font: 'title', color: f.color, color2: '#ffffff', outline: C.ink, align: 'center', alpha });
      const icons = f.icons.slice(0, 8);
      const iw = icons.length * 14;
      icons.forEach(([id, n], i) => {
        const ix = Math.round(a.x - iw / 2 + i * 14), iy = y + ui.lh('title');
        if (ITEMS[id]) ui.item(id, ix, iy, 12, 12, 1, alpha);
        if (n > 1) ui.text(String(n), ix + 13, iy + 6, { font: 'small', color: C.white, outline: C.ink, align: 'right', alpha });
      });
    }
    this.floaters = this.floaters.filter((f) => f.t < f.life);
  }

  private drawBanners(dt: number) {
    const ui = this.ui;
    const b = this.banners[this.banners.length - 1];
    for (const x of this.banners) x.t += dt;
    this.banners = this.banners.filter((x) => x.t < x.life);
    if (!b || b.t >= b.life) return;
    const a = Math.min(1, b.t * 4, (b.life - b.t) * 2);
    const font = b.small || ui.measure(b.title, 'big') > ui.w - 16 ? 'title' : 'big';
    const y = Math.round(ui.h * (b.small ? 0.36 : 0.3) - (1 - Math.min(1, b.t * 3)) * 6);
    const bw = Math.max(ui.measure(b.title, font), ui.measure(b.sub, 'small')) + 24;
    ui.fill(Math.round((ui.w - bw) / 2), y - 4, bw, ui.lh(font) + (b.sub ? ui.lh('small') + 2 : 0) + 6, '#000000', 0.3 * a);
    ui.text(b.title, ui.w / 2, y, { font, color: b.color, color2: '#ffb43a', outline: '#1a0a04', shadow: '#000', align: 'center', alpha: a });
    if (b.sub) ui.text(b.sub, ui.w / 2, y + ui.lh(font) + 1, { font: 'small', color: C.cyan, outline: C.ink, align: 'center', alpha: a });
  }

  // ---------------------------------------------------------------- pause
  private pauseMenu(s: HudState): string | null {
    const ui = this.ui;
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.5);
    const w = 150, h = 112, x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2);
    ui.panel('wood', x, y, w, h, 'PAUSED');
    const ix = x + 14, bw = w - 28;
    let out: string | null = null;
    if (ui.button('p:resume', 'RESUME', ix, y + 18, bw, 20, { style: 'green', keyLabel: 'ESC' })) out = 'resume';
    if (ui.button('p:bag', 'BACKPACK', ix, y + 42, bw, 20, { style: 'wood', key: 'Tab' })) out = 'bag';
    if (ui.button('p:quit', 'QUIT TO HIDEOUT', ix, y + 66, bw, 20, { style: 'red', tip: ['The run is saved: RESUME it from the TV.'] })) out = 'quit';
    ui.text(`${s.areaName} · wave ${s.wave}/${s.waves}`, x + w / 2, y + 92, { font: 'small', color: '#3a2408', align: 'center' });
    if (out) audio.play('k_click1', { vol: 0.3, dry: true });
    return out;
  }
}

export { ART as HUD_ART };
