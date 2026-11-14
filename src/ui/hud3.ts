// The dungeon-run HUD (v3): a crisp pixel-art layer on the shared PixelUI density (~360 UI px tall).
//
//   top left      hearts (full / half / empty + blue soul hearts), a stamina bar (with a trailing drain chip
//                 and an exhausted flash), a mana bar, kelp-tea flask pips, then pearl / key / bomb counters
//   top right     an Isaac-style minimap: room tiles (unknown / visited / cleared / current) with glyphs for
//                 treasure, shop, boss, post office, secret, challenge; the floor name under it
//   bottom centre an ornate boss bar: name plate, delayed damage chip, phase pips
//   centre        title cards (floor names, pickups: icon + name + one line)
//
// Usage (the dungeon screen owns the data, the HUD only draws it):
//
//   const hud = new Hud();                      overlays: [..., hud.layer]
//   resize(w, h)  -> hud.resize(w, h, renderer.getPixelRatio())
//   update(dt)    -> hud.draw(dt, state, game.input)       (or hud.drawInto(myUi, dt, state) inside your own
//                                                           ui.begin()/ui.end() if the screen has a PixelUI)
//   hud.title('SUNLIT REEF', 'FLOOR 1')         a centred title card
//   hud.pickup('pearl', 'Pearl', 'An oyster spent years on this.')   an item streak (id -> icon via itemIcon)
//
// Changes in hearts / counters / stamina are detected frame to frame and animated (bounce, flash, chip), so
// the screen only has to feed numbers.
import * as THREE from 'three';
import { PixelUI } from './pixel/ui';
import type { Input } from '../core/input';
import { hudArt } from './hudArt';
import { ITEMS } from '../game/items';

export type RoomType = 'start' | 'combat' | 'treasure' | 'shop' | 'post' | 'challenge' | 'secret' | 'boss';
export type RoomState = 'unknown' | 'visited' | 'cleared';

export interface MiniRoom {
  /** grid cell of the room's top-left corner (x right, y down) */
  x: number; y: number;
  /** size in cells (big rooms), default 1 x 1 */
  w?: number; h?: number;
  type: RoomType;
  /** unknown = known to exist (seen through a door / mapped) but never entered */
  state: RoomState;
  current?: boolean;
  /** optional door nubs to draw toward neighbours */
  doors?: { l?: boolean; r?: boolean; u?: boolean; d?: boolean };
}

export interface BossBar {
  name: string;
  hp: number; maxHp: number;
  /** 1-based current phase and the number of phases (pips) */
  phase?: number; phases?: number;
  /** optional subtitle under the name ("the Harpoon King") */
  sub?: string;
}

export interface HudData {
  /** health in hearts, half steps allowed (2.5 = two and a half) */
  hearts: number;
  maxHearts: number;
  /** blue soul / armour hearts drawn after the red ones (half steps allowed) */
  soulHearts?: number;
  /** stamina now / max (any unit); `exhausted` flashes the bar red */
  stamina: number; maxStamina: number; exhausted?: boolean;
  /** kelp-tea heal flasks left / max */
  flasks: number; maxFlasks: number;
  mana?: number; maxMana?: number;
  pearls: number; keys: number; bombs: number;
  /** minimap rooms (only the ones the player may know about) */
  rooms?: MiniRoom[];
  /** small label under the minimap ("REEF 1-2") */
  floor?: string;
  boss?: BossBar | null;
  /** hide everything (cutscenes) */
  hidden?: boolean;
}

const C = { white: '#f6f1e6', dim: '#9aa8b8', gold: '#ffd860', red: '#ff5a4a', ink: '#06080e', shadow: '#000000' };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface Card { title: string; sub: string; icon?: string; t: number; life: number; color: string }

export class Hud {
  ui = new PixelUI();
  get layer(): { scene: THREE.Scene; camera: THREE.Camera } { return this.ui.layer; }
  private t = 0;
  // animation state
  private prev: HudData | null = null;
  private heartBump: number[] = [];
  private heartFlash = 0;
  private stamShown = 1; private stamChip = 1; private stamChipHold = 0; private stamFullFlash = 0;
  private manaShown = 1;
  private bossShown = 1; private bossChip = 1; private bossChipHold = 0; private bossFlash = 0; private bossIn = 0; private bossName = '';
  private count = { pearls: 0, keys: 0, bombs: 0 };
  private countPop = { pearls: 0, keys: 0, bombs: 0 };
  private cards: Card[] = [];

  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); }

  /** a centred title card (floor / room names) */
  title(title: string, sub = '', color = C.white, life = 3) { this.cards = this.cards.filter((c) => c.icon); this.cards.push({ title, sub, t: 0, life, color }); }
  /** an item pickup streak: icon + name + one line of flavour */
  pickup(itemId: string, name?: string, sub?: string) {
    const d = ITEMS[itemId];
    this.cards = this.cards.filter((c) => !c.icon);
    this.cards.push({ title: name ?? d?.name ?? itemId, sub: sub ?? d?.desc ?? '', icon: itemId, t: 0, life: 3.2, color: '#fff2c8' });
  }

  /** begin + draw + end on the HUD's own PixelUI */
  draw(dt: number, s: HudData, input: Input | null = null) {
    this.ui.begin(input, dt);
    this.drawInto(this.ui, dt, s);
    this.ui.end();
  }

  /** draw into any PixelUI between its begin() and end() */
  drawInto(ui: PixelUI, dt: number, s: HudData) {
    this.t += dt;
    this.animate(dt, s);
    if (!s.hidden) {
      const y = this.hearts(ui, 6, 6, s);
      let yy = this.bars(ui, 7, y + 2, s);
      yy = this.flasks(ui, 7, yy + 2, s);
      this.counters(ui, 7, yy + 4, s);
      this.minimap(ui, s);
      if (s.boss) this.bossBar(ui, s.boss);
    }
    this.drawCards(ui, dt);
    this.prev = { ...s };
  }

  // ---------------------------------------------------------------- change detection / easing
  private animate(dt: number, s: HudData) {
    const p = this.prev;
    const n = Math.ceil(s.maxHearts) + Math.ceil(s.soulHearts ?? 0);
    while (this.heartBump.length < n) this.heartBump.push(0);
    if (p) {
      if (s.hearts < p.hearts || (s.soulHearts ?? 0) < (p.soulHearts ?? 0)) {
        this.heartFlash = 1;
        const i = Math.max(0, Math.ceil(s.hearts) - (s.hearts % 1 ? 1 : 0));
        if (this.heartBump[i] !== undefined) this.heartBump[i] = 1;
      } else if (s.hearts > p.hearts) {
        for (let i = Math.floor(p.hearts); i < Math.ceil(s.hearts); i++) if (this.heartBump[i] !== undefined) this.heartBump[i] = 1;
      }
      for (const k of ['pearls', 'keys', 'bombs'] as const) if (s[k] !== p[k]) this.countPop[k] = 1;
    }
    for (let i = 0; i < this.heartBump.length; i++) this.heartBump[i] = Math.max(0, this.heartBump[i] - dt * 3);
    this.heartFlash = Math.max(0, this.heartFlash - dt * 4);
    for (const k of ['pearls', 'keys', 'bombs'] as const) { this.countPop[k] = Math.max(0, this.countPop[k] - dt * 4); this.count[k] = s[k]; }
    // stamina: the fill eases, a pale chip lingers where it was and then drains after it
    const st = s.maxStamina > 0 ? clamp01(s.stamina / s.maxStamina) : 0;
    if (st < this.stamShown - 0.001) { if (this.stamChip < this.stamShown) this.stamChip = this.stamShown; this.stamChipHold = 0.35; }
    this.stamShown = st < this.stamShown ? st : lerp(this.stamShown, st, 1 - Math.exp(-dt * 14));
    if (this.stamChipHold > 0) this.stamChipHold -= dt; else this.stamChip = Math.max(this.stamShown, this.stamChip - dt * 0.9);
    if (st >= 0.999 && this.stamShown < 0.995) this.stamFullFlash = 1;
    this.stamFullFlash = Math.max(0, this.stamFullFlash - dt * 3);
    const mn = s.maxMana ? clamp01((s.mana ?? 0) / s.maxMana) : 0;
    this.manaShown = lerp(this.manaShown, mn, 1 - Math.exp(-dt * 10));
    // boss
    if (s.boss) {
      if (s.boss.name !== this.bossName) { this.bossName = s.boss.name; this.bossIn = 0; this.bossShown = this.bossChip = 1; }
      this.bossIn = Math.min(1, this.bossIn + dt * 1.6);
      const b = s.boss.maxHp > 0 ? clamp01(s.boss.hp / s.boss.maxHp) : 0;
      if (b < this.bossShown - 0.0005) { if (this.bossChip < this.bossShown) this.bossChip = this.bossShown; this.bossChipHold = 0.55; this.bossFlash = 1; }
      this.bossShown = b < this.bossShown ? b : lerp(this.bossShown, b, 1 - Math.exp(-dt * 6));
      if (this.bossChipHold > 0) this.bossChipHold -= dt; else this.bossChip = Math.max(this.bossShown, this.bossChip - dt * 0.35);
      this.bossFlash = Math.max(0, this.bossFlash - dt * 6);
    } else { this.bossName = ''; this.bossIn = 0; }
  }

  // ---------------------------------------------------------------- top left
  /** hearts; returns the y below them */
  private hearts(ui: PixelUI, x0: number, y0: number, s: HudData): number {
    const red = Math.max(0, Math.ceil(s.maxHearts));
    const soul = Math.max(0, Math.ceil(s.soulHearts ?? 0));
    const per = 10, W = 14, H = 13;
    const total = red + soul;
    const low = s.hearts <= 1 && s.hearts > 0;
    for (let i = 0; i < total; i++) {
      const cx = x0 + (i % per) * W, cy = y0 + Math.floor(i / per) * H;
      let name: string;
      if (i < red) { const v = s.hearts - i; name = v >= 1 ? 'heart' : v >= 0.5 ? 'heartHalf' : 'heartEmpty'; }
      else { const v = (s.soulHearts ?? 0) - (i - red); name = v >= 1 ? 'heartSoul' : 'heartSoulHalf'; }
      const b = this.heartBump[i] ?? 0;
      // heartbeat on the last heart when low
      const beat = low && i === Math.ceil(s.hearts) - 1 ? Math.max(0, Math.sin(this.t * 7)) ** 6 : 0;
      const dy = -Math.round(Math.sin(b * Math.PI) * 3) - Math.round(beat * 1);
      ui.img(hudArt(name, '#00000066'), cx + 1, cy + 1 + dy);
      ui.img(hudArt(name), cx, cy + dy);
      if (this.heartFlash > 0.5 && i === Math.max(0, Math.ceil(s.hearts) - (Number.isInteger(s.hearts) ? 0 : 1))) ui.img(hudArt(name, '#ffffff'), cx, cy + dy, { alpha: 0.85 });
    }
    return y0 + Math.ceil(Math.max(1, total) / per) * H;
  }

  /** a framed bar with a 1 px top shine; returns the y below it */
  private bar(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, chip: number, ramp: [string, string, string, string], frame = '#0a0c14') {
    ui.fill(x + 1, y + 1, w, h, '#00000066'); // drop shadow
    ui.fill(x, y, w, h, frame);
    ui.fill(x + 1, y + 1, w - 2, h - 2, '#1a1620');
    const iw = w - 2, fw = Math.round(iw * clamp01(v)), cw = Math.round(iw * clamp01(chip));
    if (cw > fw) ui.fill(x + 1 + fw, y + 1, cw - fw, h - 2, '#fff2d0', 0.85);
    if (fw > 0) {
      ui.fill(x + 1, y + 1, fw, h - 2, ramp[1]);
      ui.fill(x + 1, y + 1, fw, 1, ramp[2]);
      if (h > 4) ui.fill(x + 1, y + h - 2, fw, 1, ramp[0]);
      ui.fill(x + 2, y + 1, Math.max(0, Math.min(fw - 2, 3)), 1, ramp[3]);
    }
    // segment ticks every 10 px read as "chunks"
    for (let i = 10; i < iw; i += 10) ui.fill(x + 1 + i, y + 2, 1, h - 4, '#00000055');
    return y + h;
  }

  private bars(ui: PixelUI, x: number, y: number, s: HudData): number {
    const sw = Math.round(40 + Math.min(80, s.maxStamina * 0.8));
    const ex = s.exhausted && Math.sin(this.t * 22) > 0;
    const ramp: [string, string, string, string] = ex ? ['#7a1010', '#d8302a', '#ff8a6a', '#ffffff'] : ['#2a6a12', '#6ac02a', '#b8f060', '#ffffff'];
    ui.img(hudArt('stamLeaf'), x - 1, y);
    let yy = this.bar(ui, x + 8, y + 1, sw, 6, this.stamShown, this.stamChip, ramp);
    if (this.stamFullFlash > 0) ui.fill(x + 9, y + 2, sw - 2, 4, '#ffffff', this.stamFullFlash * 0.6);
    if (s.maxMana) {
      const mw = Math.round(30 + Math.min(80, s.maxMana * 0.6));
      ui.img(hudArt('manaGem'), x, yy + 2);
      yy = this.bar(ui, x + 8, yy + 3, mw, 5, this.manaShown, this.manaShown, ['#1a2a8a', '#3a6ae8', '#8ac0ff', '#ffffff']);
      // a slow glint sweeping along the mana
      const gx = ((this.t * 40) % (mw + 40)) - 20;
      if (gx > 0 && gx < (mw - 2) * this.manaShown) ui.fill(x + 9 + Math.round(gx), yy - 4, 2, 3, '#ffffff', 0.5);
    }
    return yy;
  }

  private flasks(ui: PixelUI, x: number, y: number, s: HudData): number {
    if (!s.maxFlasks) return y;
    for (let i = 0; i < s.maxFlasks; i++) {
      const full = i < s.flasks;
      const n = full ? 'flask' : 'flaskEmpty';
      ui.img(hudArt(n, '#00000066'), x + i * 9 + 1, y + 1);
      ui.img(hudArt(n), x + i * 9, y);
    }
    return y + 11;
  }

  private counters(ui: PixelUI, x: number, y: number, s: HudData) {
    const rows: [keyof typeof this.count, string][] = [['pearls', 'pearl'], ['keys', 'key'], ['bombs', 'bomb']];
    let yy = y;
    for (const [k, art] of rows) {
      const ic = hudArt(art);
      const pop = this.countPop[k];
      const ix = x + Math.round((12 - ic.width) / 2), iy = yy + Math.round((14 - ic.height) / 2);
      ui.img(hudArt(art, '#00000066'), ix + 1, iy + 1);
      ui.img(ic, ix, iy - Math.round(Math.sin(pop * Math.PI) * 2));
      const v = String(Math.max(0, Math.min(99, s[k]))).padStart(2, '0');
      ui.text(v, x + 14, yy + 2 - Math.round(Math.sin(pop * Math.PI) * 2), { font: 'body', color: pop > 0.3 ? '#fff6b0' : C.white, outline: '#0a0810' });
      yy += 15;
    }
  }

  // ---------------------------------------------------------------- top right: minimap
  private minimap(ui: PixelUI, s: HudData) {
    const rooms = s.rooms ?? [];
    if (!rooms.length) return;
    const TW = 11, TH = 9, GX = 13, GY = 11; // tile size and pitch (2 px gutters)
    const PW = GX * 7 + 6, PH = GY * 5 + 6;  // a 7 x 5 room window
    const px = ui.w - PW - 6, py = 6;
    // frame: dark glass with a brass rim
    ui.fill(px + 1, py + 1, PW, PH, '#00000066');
    ui.fill(px, py, PW, PH, '#2a1a0a');
    ui.fill(px + 1, py + 1, PW - 2, PH - 2, '#c08a3a');
    ui.fill(px + 2, py + 2, PW - 4, PH - 4, '#4a2e12');
    ui.fill(px + 3, py + 3, PW - 6, PH - 6, '#0a1420', 0.82);
    ui.fill(px + 2, py + 2, PW - 4, 1, '#f0c870');
    const cur = rooms.find((r) => r.current) ?? rooms[0];
    const ccx = cur.x + ((cur.w ?? 1) - 1) / 2, ccy = cur.y + ((cur.h ?? 1) - 1) / 2;
    const ox = px + Math.round(PW / 2 - (ccx + 0.5) * GX + 1), oy = py + Math.round(PH / 2 - (ccy + 0.5) * GY + 1);
    ui.clip(px + 3, py + 3, PW - 6, PH - 6);
    const blink = Math.sin(this.t * 5) > -0.3;
    // door nubs first (under the tiles)
    for (const r of rooms) {
      if (!r.doors || r.state === 'unknown') continue;
      const rx = ox + r.x * GX, ry = oy + r.y * GY, rw = (r.w ?? 1) * GX - 2, rh = (r.h ?? 1) * GY - 2;
      const col = '#8a8a98';
      if (r.doors.r) ui.fill(rx + rw, ry + Math.floor(rh / 2) - 1, 2, 3, col);
      if (r.doors.l) ui.fill(rx - 2, ry + Math.floor(rh / 2) - 1, 2, 3, col);
      if (r.doors.d) ui.fill(rx + Math.floor(rw / 2) - 1, ry + rh, 3, 2, col);
      if (r.doors.u) ui.fill(rx + Math.floor(rw / 2) - 1, ry - 2, 3, 2, col);
    }
    for (const r of rooms) {
      const rx = ox + r.x * GX, ry = oy + r.y * GY, rw = (r.w ?? 1) * GX - 2, rh = (r.h ?? 1) * GY - 2;
      void TW; void TH;
      let face: string, edge: string, hi: string;
      if (r.current) { face = blink ? '#f4f0e6' : '#d8d2c8'; edge = '#06080e'; hi = '#ffffff'; }
      else if (r.state === 'cleared') { face = '#9a9aac'; edge = '#14141c'; hi = '#c8c8d8'; }
      else if (r.state === 'visited') { face = '#5e5e70'; edge = '#0c0c14'; hi = '#7a7a8e'; }
      else { face = '#22222c'; edge = '#4a4a5a'; hi = '#2c2c38'; }
      ui.fill(rx, ry, rw, rh, edge);
      ui.fill(rx + 1, ry + 1, rw - 2, rh - 2, face);
      ui.fill(rx + 1, ry + 1, rw - 2, 1, hi);
      if (r.type === 'boss' && r.state !== 'unknown' && !r.current) ui.rect(rx, ry, rw, rh, '#8a1424');
      const g = GLYPH[r.type];
      if (g) {
        const ic = hudArt(g);
        const gx = rx + Math.round((rw - ic.width) / 2), gy = ry + Math.round((rh - ic.height) / 2);
        ui.img(ic, gx, gy, { alpha: r.state === 'unknown' ? 0.75 : 1 });
      }
      if (r.current) { const m = hudArt('mYou'); if (!g) ui.img(m, rx + Math.round((rw - m.width) / 2), ry + Math.round((rh - m.height) / 2)); }
    }
    ui.unclip();
    // corner rivets
    for (const [cx, cy] of [[px + 2, py + 2], [px + PW - 3, py + 2], [px + 2, py + PH - 3], [px + PW - 3, py + PH - 3]]) ui.fill(cx, cy, 1, 1, '#fff0b0');
    if (s.floor) ui.text(s.floor, px + PW / 2, py + PH + 4, { font: 'small', color: '#e8e0d0', outline: '#06080e', align: 'center' });
  }

  // ---------------------------------------------------------------- bottom centre: boss bar
  private bossBar(ui: PixelUI, b: BossBar) {
    const k = this.bossIn;
    const ease = 1 - (1 - k) ** 3;
    const W = Math.min(300, Math.round(ui.w * 0.56)), H = 9;
    const x = Math.round((ui.w - W) / 2), y = Math.round(ui.h - 22 + (1 - ease) * 30);
    // name plate
    const name = b.name.toUpperCase();
    ui.text(name, ui.w / 2, y - 15, { font: 'title', color: '#ffe8d0', color2: '#ff9a7a', outline: '#1a0606', align: 'center', alpha: ease });
    // frame: iron with gold caps
    ui.fill(x - 3, y - 3 + 1, W + 6, H + 6, '#00000077');
    ui.fill(x - 3, y - 3, W + 6, H + 6, '#1a0e0a');
    ui.fill(x - 2, y - 2, W + 4, H + 4, '#6a4a2a');
    ui.fill(x - 2, y - 2, W + 4, 1, '#c89a5a');
    ui.fill(x - 1, y - 1, W + 2, H + 2, '#140a0a');
    // fill
    const iw = W, fw = Math.round(iw * this.bossShown), cw = Math.round(iw * this.bossChip);
    ui.fill(x, y, iw, H, '#2a0c10');
    if (cw > fw) ui.fill(x + fw, y, cw - fw, H, '#ffd8a0');
    if (fw > 0) {
      ui.fill(x, y, fw, H, '#b8182a');
      ui.fill(x, y, fw, 2, '#ff5a4a');
      ui.fill(x, y + 2, fw, 1, '#e8303a');
      ui.fill(x, y + H - 2, fw, 2, '#7a0a1a');
      if (this.bossFlash > 0) ui.fill(x, y, fw, H, '#ffffff', this.bossFlash * 0.7);
    }
    // phase thresholds as notches + pips under the name
    const n = Math.max(1, b.phases ?? 1), ph = Math.max(1, Math.min(n, b.phase ?? 1));
    for (let i = 1; i < n; i++) { const nx = x + Math.round(iw * (1 - i / n)); ui.fill(nx, y - 1, 1, H + 2, '#1a0606'); ui.fill(nx + 1, y, 1, H, '#ff8a7a', 0.5); }
    if (n > 1) {
      const pw = n * 7 - 2, px0 = Math.round(ui.w / 2 - pw / 2);
      for (let i = 0; i < n; i++) ui.img(hudArt(i < ph ? 'pip' : 'pipOff'), px0 + i * 7, y + H + 4);
    }
    // gold end caps with the skull emblem on the left
    for (const cx of [x - 6, x + W + 1]) { ui.fill(cx, y - 4, 5, H + 8, '#3a1e06'); ui.fill(cx + 1, y - 3, 3, H + 6, '#e0a830'); ui.fill(cx + 1, y - 3, 1, H + 6, '#fff0a0'); ui.fill(cx + 3, y - 3, 1, H + 6, '#8a5a10'); }
    const sk = hudArt('skull');
    ui.img(sk, x - 8 - sk.width + 3, y + Math.round((H - sk.height) / 2));
    if (b.sub) ui.text(b.sub, ui.w / 2, y - 24, { font: 'small', color: '#c8b8a8', align: 'center', alpha: ease });
  }

  // ---------------------------------------------------------------- title cards
  private drawCards(ui: PixelUI, dt: number) {
    for (const c of this.cards) c.t += dt;
    this.cards = this.cards.filter((c) => c.t < c.life);
    for (const c of this.cards) {
      const a = Math.min(1, c.t * 4, (c.life - c.t) * 2.5);
      const slide = Math.round((1 - Math.min(1, c.t * 5)) ** 2 * 12);
      if (c.icon) {
        // pickup streak: a dark ribbon across the upper third with the icon at 1:1
        const y = Math.round(ui.h * 0.2);
        const tw = Math.max(ui.measure(c.title, 'title'), ui.measure(c.sub, 'small'));
        const w = Math.min(ui.w - 20, tw + 56), x = Math.round((ui.w - w) / 2);
        ui.fill(x, y, w, 38, '#06080e', 0.72 * a);
        ui.fill(x, y, w, 1, '#ffd860', 0.8 * a); ui.fill(x, y + 37, w, 1, '#ffd860', 0.8 * a);
        ui.item(c.icon, x + 6, y + 3, 32, 32, 1, a);
        ui.text(c.title, x + 44 - slide, y + 7, { font: 'title', color: c.color, outline: '#1a0e04', alpha: a });
        if (c.sub) ui.text(c.sub, x + 44 + slide, y + 23, { font: 'small', color: '#d8d0c0', alpha: a });
      } else {
        const y = Math.round(ui.h * 0.3);
        ui.text(c.title, ui.w / 2, y - slide, { font: 'big', color: c.color, color2: '#ffc860', outline: '#140a04', align: 'center', alpha: a });
        if (c.sub) ui.text(c.sub, ui.w / 2, y + 30 + slide, { font: 'body', color: '#e8e0d0', outline: '#06080e', align: 'center', alpha: a });
      }
    }
  }
}

const GLYPH: Partial<Record<RoomType, string>> = {
  treasure: 'mTreasure', shop: 'mShop', boss: 'mBoss', post: 'mPost', secret: 'mSecret', challenge: 'mChallenge',
};
