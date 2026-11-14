// The dungeon HUD: the DATA the run exposes every frame (DungeonHudState, for agent L's pretty HUD) and a plain
// placeholder drawer on the PixelUI kit.
//
//   top left     hearts (half hearts), then pearls / keys / bombs counters, kelp-tea flasks + stamina (from K)
//   top right    the floor name and the minimap (minimapData from src/dungeon/minimap.ts)
//   bottom       the boss bar; [key] prompts; banners (ROOM CLEARED, floor titles); PACK FULL
//   modal-ish    the pause menu; the post office's mail picker
import { PixelUI } from '../ui/pixel/ui';
import { audio } from '../audio/audio';
import { ITEMS, getItem } from '../game/items';
import type { ItemInst } from '../game/run';
import type { BossBar, PlayerCombatHud } from '../combat/types';
import type { MinimapData } from './minimap';

export interface HudAnchor { x: number; y: number; on: boolean }
export interface DungeonHudState {
  hp: number; maxHp: number;
  pearls: number; keys: number; bombs: number;
  /** K's combat HUD (stamina, flasks, parry) when the player has one */
  combat: PlayerCombatHud | null;
  floor: { n: number; of: number; name: string; area: string };
  room: { type: string; cleared: boolean; enemies: number };
  minimap: MinimapData;
  boss: BossBar | null;
  prompt: { key: string; label: string; at?: HudAnchor; bad?: boolean } | null;
  pack: { used: number; free: number; total: number; full: boolean };
  paused: boolean;
  /** the post office's mail picker, when open */
  mail: MailState | null;
}
export interface MailState { items: ItemInst[]; picked: Set<number>; capacity: number; used: number }

const C = { white: '#f4f0e6', dim: '#9aa8b8', gold: '#ffd860', red: '#ff5a4a', green: '#7aea6a', cyan: '#8ae8ff', ink: '#06080e', pearl: '#f4ece0' };

// ------------------------------------------------------------------ tiny hand-placed counter art
const PAL: Record<string, string> = { k: '#120a10', R: '#e8304a', D: '#9a1830', W: '#ffd0d8', e: '#3a1a28', E: '#52283a', p: '#f4ece0', P: '#b8ac98', h: '#ffffff', y: '#ffd860', Y: '#b8860e', o: '#e8b040', O: '#8a5a10', f: '#ff8a3a', g: '#5ac8ff', G: '#1a5a8a', s: '#7aea6a', S: '#2a6a2a' };
function paint(rows: string[]): HTMLCanvasElement {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!;
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const c = PAL[r[i]]; if (c) { x.fillStyle = c; x.fillRect(i, y, 1, 1); } } });
  return cv;
}
const HEART = ['.kk...kk.', 'kRRk.kRRk', 'kRWRkRRRk', 'kRRRRRRRk', '.kRRRRDk.', '..kRRDk..', '...kDk...', '....k....'];
export const ART = {
  heart: paint(HEART),
  heartEmpty: paint(HEART.map((r) => r.replace(/[RWD]/g, (c) => (c === 'W' ? 'E' : 'e')))),
  heartHalf: paint(HEART.map((r) => r.split('').map((c, i) => (i >= 5 && 'RWD'.includes(c) ? 'e' : c)).join(''))),
  pearl: paint(['..kkk..', '.kphpk.', 'kphpppk', 'kpppppk', 'kpppPPk', '.kpPPk.', '..kkk..']),
  key: paint(['.kkk.....', 'kyYyk....', 'ky.ykkkkk', 'kyYyyyyyk', '.kkk.kYkY', '.....k.k.']),
  bomb: paint(['....kf.', '...k...', '.kkkk..', 'koooOk.', 'kohooOk', 'kooooOk', 'kOoooOk', '.kOOOk.', '..kkk..']),
  flask: paint(['..kkk..', '..kgk..', '.kgggk.', 'kgGgGgk', 'kgggggk', 'kGgggGk', '.kkkkk.']),
  flaskEmpty: paint(['..kkk..', '..k.k..', '.k...k.', 'k.....k', 'k.....k', 'k.....k', '.kkkkk.']),
};

interface Banner { title: string; sub: string; t: number; life: number; color: string }

export class DungeonHud {
  ui = new PixelUI({ targetH: 240 });
  private banners: Banner[] = [];
  private t = 0;
  private flashes = new Map<string, number>();
  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); }
  banner(title: string, sub = '', color = C.white, life = 2.6) { this.banners = this.banners.filter((b) => b.t < b.life - 0.4); this.banners.push({ title, sub, t: 0, life, color }); }
  /** flash a counter ('pearls' | 'keys' | 'bombs' | 'hp' | 'pack') */
  flash(what: string) { this.flashes.set(what, 1); }

  /** draw everything; returns a UI action: 'resume' | 'bag' | 'quit' | 'mail:send' | 'mail:close' | 'mail:<uid>' */
  draw(dt: number, s: DungeonHudState, input: Parameters<PixelUI['begin']>[0]): string | null {
    const ui = this.ui;
    this.t += dt;
    ui.drawCursor = s.paused || !!s.mail;
    ui.begin(input, dt);
    let out: string | null = null;
    this.hearts(s);
    this.counters(s);
    this.minimap(s);
    if (s.boss?.visible) this.bossBar(s.boss);
    if (s.prompt) this.prompt(s.prompt);
    this.drawBanners(dt);
    if (s.mail) out = this.mailPicker(s.mail);
    if (s.paused) out = this.pauseMenu(s) ?? out;
    ui.end();
    for (const [k, v] of this.flashes) { const n = v - dt * 2.5; if (n <= 0) this.flashes.delete(k); else this.flashes.set(k, n); }
    return out;
  }

  private hearts(s: DungeonHudState) {
    const ui = this.ui, n = Math.ceil(s.maxHp / 2), low = s.hp <= 2 && s.hp > 0;
    for (let i = 0; i < n; i++) {
      const v = s.hp - i * 2;
      const art = v >= 2 ? ART.heart : v === 1 ? ART.heartHalf : ART.heartEmpty;
      const bob = low && v > 0 && Math.floor(this.t * 4 + i) % 4 === 0 ? -1 : 0;
      ui.img(art, 6 + (i % 8) * 10, 6 + Math.floor(i / 8) * 9 + bob);
    }
  }

  private counters(s: DungeonHudState) {
    const ui = this.ui, n = Math.ceil(s.maxHp / 2);
    let y = 6 + Math.ceil(n / 8) * 9 + 4;
    const row = (art: HTMLCanvasElement, v: number, key: string) => {
      const f = this.flashes.get(key) ?? 0;
      ui.img(art, 7, y + (f > 0.5 ? -1 : 0));
      ui.text(String(v).padStart(2, '0'), 18, y, { font: 'small', color: f > 0 ? C.gold : C.white, outline: C.ink });
      y += 10;
    };
    row(ART.pearl, s.pearls, 'pearls');
    row(ART.key, s.keys, 'keys');
    row(ART.bomb, s.bombs, 'bombs');
    const c = s.combat;
    if (c) {
      for (let i = 0; i < c.flasksMax; i++) ui.img(i < c.flasks ? ART.flask : ART.flaskEmpty, 7 + i * 9, y);
      y += 10;
      ui.bar(7, y, 60, 4, c.staminaMax > 0 ? c.stamina / c.staminaMax : 0, c.staminaDelay > 0 ? '#c8a040' : '#7aea6a');
      y += 7;
    }
    // the pack's fill: cells used, red when full
    const pf = this.flashes.get('pack') ?? 0;
    ui.text(`PACK ${s.pack.used}/${s.pack.total}`, 7, y, { font: 'small', color: s.pack.full || pf > 0 ? C.red : C.dim, outline: C.ink });
  }

  private minimap(s: DungeonHudState) {
    const ui = this.ui, m = s.minimap;
    const cw = 9, ch = 7, gap = 1;
    const W = m.w * (cw + gap) + 6, H = m.h * (ch + gap) + 6;
    const x0 = ui.w - W - 6, y0 = 16;
    ui.text(`${s.floor.name.toUpperCase()} ${s.floor.n + 1}/${s.floor.of}`, ui.w - 6, 5, { font: 'small', color: C.white, outline: C.ink, align: 'right' });
    ui.fill(x0, y0, W, H, '#000000', 0.45);
    const col: Record<string, string> = { current: '#ffffff', cleared: '#8a96a8', visited: '#6a7486', seen: '#2e3644' };
    const icon: Record<string, string> = { treasure: C.gold, shop: C.green, post: C.cyan, challenge: C.red, boss: '#ff2a2a', secret: '#c08cff' };
    for (const r of m.rooms) {
      const x = x0 + 3 + r.x * (cw + gap), y = y0 + 3 + r.y * (ch + gap);
      for (const d of r.doors) {
        if (d === 'R') ui.fill(x + cw, y + 3, gap, 1, '#4a5466');
        if (d === 'D') ui.fill(x + 4, y + ch, 1, gap, '#4a5466');
      }
      ui.fill(x, y, cw, ch, col[r.state]);
      if (r.state === 'current') ui.fill(x + 1, y + 1, cw - 2, ch - 2, '#d8e4f4');
      if (r.icon) { ui.fill(x + 3, y + 2, 3, 3, icon[r.icon] ?? C.white); if (r.locked) ui.fill(x + 4, y + 5, 1, 1, C.gold); }
    }
  }

  private bossBar(b: BossBar) {
    const ui = this.ui, w = Math.min(220, ui.w - 40), x = Math.round((ui.w - w) / 2), y = ui.h - 22;
    ui.text(b.name, ui.w / 2, y - 11, { font: 'small', color: '#ffd0c8', outline: C.ink, align: 'center' });
    ui.fill(x - 1, y - 1, w + 2, 7, C.ink);
    ui.bar(x, y, w, 5, b.max > 0 ? b.hp / b.max : 0, '#e8303a', '#3a0a10');
    if (b.phases > 1) for (let i = 1; i < b.phases; i++) ui.fill(x + Math.round((w * i) / b.phases), y, 1, 5, C.ink);
  }

  private prompt(p: NonNullable<DungeonHudState['prompt']>) {
    const ui = this.ui;
    const at = p.at && p.at.on ? p.at : { x: ui.w / 2, y: ui.h - 40, on: true };
    const lw = ui.measure(p.label, 'small');
    const kw = p.key ? ui.keycap(p.key, 0, -100) : 0;
    const w = lw + (kw ? kw + 4 : 0);
    const x = Math.round(at.x - w / 2), y = Math.round(at.y - 18);
    ui.fill(x - 3, y - 2, w + 6, 14, '#000000', 0.5);
    if (kw) ui.keycap(p.key, x, y, true);
    ui.text(p.label, x + (kw ? kw + 4 : 0), y + 3, { font: 'small', color: p.bad ? C.red : C.white, outline: C.ink });
  }

  private drawBanners(dt: number) {
    const ui = this.ui;
    for (const b of this.banners) {
      b.t += dt;
      const k = Math.min(1, b.t * 4) * Math.min(1, (b.life - b.t) * 3);
      if (k <= 0) continue;
      const y = Math.round(ui.h * 0.28 - (1 - Math.min(1, b.t * 4)) * 10);
      ui.text(b.title, ui.w / 2, y, { font: 'big', color: b.color, color2: '#ffb43a', outline: C.ink, shadow: '#000', align: 'center' });
      if (b.sub) ui.text(b.sub, ui.w / 2, y + ui.lh('big') + 1, { font: 'small', color: C.cyan, outline: C.ink, align: 'center' });
    }
    this.banners = this.banners.filter((b) => b.t < b.life);
  }

  private mailPicker(m: MailState): string | null {
    const ui = this.ui;
    const cols = 6, cell = 20;
    const rows = Math.max(1, Math.ceil(m.items.length / cols));
    const w = cols * cell + 24, h = rows * cell + 64;
    const x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2);
    ui.panel('paper', x, y, w, h, 'POST OFFICE');
    ui.text(`MAILBAG ${m.used}/${m.capacity} CELLS`, x + w / 2, y + 16, { font: 'small', color: m.used > m.capacity ? '#c8283a' : '#3a2a1a', align: 'center' });
    let out: string | null = null;
    m.items.forEach((it, i) => {
      const ix = x + 12 + (i % cols) * cell, iy = y + 28 + Math.floor(i / cols) * cell;
      const on = m.picked.has(it.uid);
      ui.fill(ix, iy, cell - 2, cell - 2, on ? '#ffe07a' : '#2a1a10', on ? 0.9 : 0.25);
      ui.item(it.id, ix + 1, iy + 1, cell - 4, cell - 4, it.level ?? 1, 1);
      if ((it.n ?? 1) > 1) ui.text(String(it.n), ix + cell - 3, iy + cell - 9, { font: 'small', color: '#ffffff', outline: '#000', align: 'right' });
      if (ui.mx >= ix && ui.mx < ix + cell - 2 && ui.my >= iy && ui.my < iy + cell - 2) {
        ui.tooltip(ui.itemTip(it.id, it.level ?? 1, [`${getItem(it.id).shape.length} cell${getItem(it.id).shape.length > 1 ? 's' : ''}${ITEMS[it.id]?.kind === 'material' ? ' · goes to your materials' : ' · goes to your stash'}`]));
        if (ui.pressed) { out = 'mail:' + it.uid; audio.play('k_click1', { vol: 0.3, dry: true }); }
      }
    });
    if (!m.items.length) ui.text('YOUR PACK IS EMPTY', x + w / 2, y + 32, { font: 'small', color: '#6a5a4a', align: 'center' });
    const by = y + h - 24;
    if (ui.button('mail:send', `SEND ${m.picked.size} HOME`, x + 10, by, w / 2 - 14, 16, { style: 'green', disabled: !m.picked.size || m.used > m.capacity, key: 'Enter' })) out = 'mail:send';
    if (ui.button('mail:close', 'DONE', x + w / 2 + 4, by, w / 2 - 14, 16, { style: 'wood', key: 'Escape' })) out = 'mail:close';
    return out;
  }

  private pauseMenu(s: DungeonHudState): string | null {
    const ui = this.ui;
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.5);
    const w = 150, h = 112, x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2);
    ui.panel('wood', x, y, w, h, 'PAUSED');
    const ix = x + 14, bw = w - 28;
    let out: string | null = null;
    if (ui.button('p:resume', 'RESUME', ix, y + 18, bw, 20, { style: 'green' })) out = 'resume';
    if (ui.button('p:bag', 'BACKPACK', ix, y + 42, bw, 20, { style: 'wood', key: 'Tab' })) out = 'bag';
    if (ui.button('p:quit', 'QUIT TO HIDEOUT', ix, y + 66, bw, 20, { style: 'red', tip: ['The run is saved: RESUME it from the hideout.'] })) out = 'quit';
    ui.text(`${s.floor.name.toUpperCase()} · FLOOR ${s.floor.n + 1}/${s.floor.of}`, x + w / 2, y + 92, { font: 'small', color: '#ffe7b0', outline: '#140a06', align: 'center' });
    if (out) audio.play('k_click1', { vol: 0.3, dry: true });
    return out;
  }
}
