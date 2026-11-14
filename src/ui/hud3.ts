// The dungeon-run HUD (v3): a crisp pixel-art layer on the shared PixelUI density (~360 UI px tall).
//
//   top left      hearts (full / half / empty + blue soul hearts, heartbeat when low), a stamina bar (trailing
//                 drain chip, amber while regen is delayed, red flash when guard-broken / empty), a mana bar,
//                 kelp-tea flask pips (the one being drunk fills up), then pearl / key / bomb counters and
//                 the pack gauge (cells used / total, red when full)
//   top right     the STRIP MINIMAP of the whole side-scrolling level: explored vs fog, the upper water lane,
//                 the seabed profile and caves as vertical band hints, POI glyphs (treasure, Mr. Crab's shop,
//                 post office, challenge, secret, arena lock, boss gate), the blinking player dot; area name
//                 above, floor pips + "FLOOR 1/3" below
//   bottom centre an ornate boss bar: name + title, delayed damage chip, phase notches + pips, poise sliver
//   centre        title cards (floor names) and pickup streaks (item icon + name + one line)
//
// Usage (the dungeon screen owns the data; the HUD only draws it and animates changes):
//
//   const hud = new Hud();                         overlays: [..., hud.layer]
//   resize(w, h)  -> hud.resize(w, h, renderer.getPixelRatio())
//   update(dt)    -> hud.draw(dt, data, game.input)
//                    or, inside your own ui.begin() / ui.end(): hud.drawInto(ui, dt, data)
//   hud.title('SUNLIT REEF', 'FLOOR 1 OF 3')      a centred title card
//   hud.pickup('copperOre')                        an item streak (icon via itemIcon, name + desc from ITEMS)
//   hud.flash('pack')                              shake a counter ('pearls' | 'keys' | 'bombs' | 'pack' | 'hp')
//
// HudData takes K's PlayerCombatHud and BossBar (src/combat/types) as they are, and J's hp in half hearts.
import * as THREE from 'three';
import { PixelUI } from './pixel/ui';
import type { Input } from '../core/input';
import type { PlayerCombatHud, BossBar } from '../combat/types';
import { hudArt } from './hudArt';
import { ITEMS, skillItem } from '../game/items';
import type { SkillHudState } from '../skills/hud';

export type PoiType = 'treasure' | 'shop' | 'post' | 'challenge' | 'secret' | 'boss' | 'arena' | 'start';

export interface StripPoi {
  type: PoiType;
  /** position along the level (same unit as StripMap.length) */
  x: number;
  /** vertical position 0 (top of the level) .. 1 (bottom); default by type */
  y?: number;
  /** false: only hinted (drawn as a dim '?'); default true */
  known?: boolean;
  /** used up / cleared (drawn dimmed) */
  done?: boolean;
}

export interface StripMap {
  /** level length (metres or any unit) */
  length: number;
  /** explored spans [x0, x1] in the same unit (fog elsewhere) */
  explored: [number, number][];
  /** the player's x (same unit) and optional y (0 top .. 1 bottom) */
  player: number; playerY?: number;
  /** vertical band hints: stretches with an upper water lane / with caves under the seabed */
  lanes?: { kind: 'upper' | 'cave'; x0: number; x1: number }[];
  /** seabed height profile (0 top .. 1 bottom), samples evenly spaced along the level; default flat 0.72 */
  seabed?: number[];
  pois: StripPoi[];
  /** 1-based floor number and floor count */
  floor: number; floors: number;
  /** area name shown above the strip */
  name?: string;
}

export interface HudData {
  /** health in HALF hearts (6 = three hearts) and the containers, also in half hearts */
  hp: number; maxHp: number;
  /** blue soul / armour half hearts drawn after the red ones */
  soul?: number;
  /** K's combat HUD: stamina, flasks, drinking, guard, parry flashes */
  combat?: PlayerCombatHud | null;
  mana?: number; maxMana?: number;
  pearls: number; keys: number; bombs: number;
  /** the pack's fill in cells */
  pack?: { used: number; total: number; full?: boolean };
  strip?: StripMap | null;
  /** K's boss bar (drawn while visible) */
  boss?: BossBar | null;
  /** the skill slots (keys 1-4), bottom left: player.skillHud(); replaces the old SkillBar overlay */
  skills?: SkillHudState | null;
  /** hide everything but title cards (cutscenes) */
  hidden?: boolean;
}

const C = { white: '#f6f1e6', dim: '#9aa8b8', gold: '#ffd860', red: '#ff5a4a', ink: '#06080e' };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
type Counter = 'pearls' | 'keys' | 'bombs' | 'pack' | 'hp';

interface Card { title: string; sub: string; icon?: string; t: number; life: number; color: string }

export class Hud {
  ui = new PixelUI();
  get layer(): { scene: THREE.Scene; camera: THREE.Camera } { return this.ui.layer; }
  private t = 0;
  private prev: HudData | null = null;
  private heartBump: number[] = [];
  private heartFlash = 0; private heartFlashAt = -1;
  private stamShown = 1; private stamChip = 1; private stamChipHold = 0; private stamFull = 0;
  private manaShown = 0;
  private bossShown = 1; private bossChip = 1; private bossChipHold = 0; private bossFlash = 0; private bossIn = 0; private bossName = '';
  private pop: Record<Counter, number> = { pearls: 0, keys: 0, bombs: 0, pack: 0, hp: 0 };
  private parryFlash = 0;
  private prevCd: number[] = [];
  private slotFlash: number[] = [];
  private cards: Card[] = [];

  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); }

  /** a centred title card (floor / area names) */
  title(title: string, sub = '', color = C.white, life = 3) { this.cards = this.cards.filter((c) => c.icon); this.cards.push({ title, sub, t: 0, life, color }); }
  /** an item pickup streak: icon + name + one line (defaults from ITEMS) */
  pickup(itemId: string, name?: string, sub?: string) {
    const d = ITEMS[itemId];
    this.cards = this.cards.filter((c) => !c.icon);
    this.cards.push({ title: name ?? d?.name ?? itemId, sub: sub ?? d?.desc ?? '', icon: itemId, t: 0, life: 3.2, color: '#fff2c8' });
  }
  /** bounce / flash a counter */
  flash(what: Counter) { this.pop[what] = 1; }

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
      let y = this.hearts(ui, 6, 6, s);
      y = this.bars(ui, 7, y + 3, s);
      y = this.flasks(ui, 7, y + 3, s);
      this.counters(ui, 7, y + 4, s);
      if (s.strip) this.strip(ui, s.strip);
      if (s.boss && s.boss.visible !== false) this.bossBar(ui, s.boss);
      if (s.skills) this.skillRow(ui, s.skills);
    }
    this.drawCards(ui, dt);
    this.prev = { ...s, combat: s.combat ? { ...s.combat } : s.combat };
  }

  // ---------------------------------------------------------------- change detection / easing
  private animate(dt: number, s: HudData) {
    const p = this.prev;
    const n = Math.ceil(s.maxHp / 2) + Math.ceil((s.soul ?? 0) / 2);
    while (this.heartBump.length < n) this.heartBump.push(0);
    if (p) {
      const tot = s.hp + (s.soul ?? 0), ptot = p.hp + (p.soul ?? 0);
      if (tot < ptot) {
        this.heartFlash = 1;
        this.heartFlashAt = s.hp < p.hp ? Math.floor(Math.max(0, s.hp) / 2) : Math.ceil(s.maxHp / 2) + Math.floor((s.soul ?? 0) / 2);
        if (this.heartBump[this.heartFlashAt] !== undefined) this.heartBump[this.heartFlashAt] = 1;
      } else if (s.hp > p.hp) {
        for (let i = Math.floor(p.hp / 2); i < Math.ceil(s.hp / 2); i++) if (this.heartBump[i] !== undefined) this.heartBump[i] = 1;
      }
      for (const k of ['pearls', 'keys', 'bombs'] as const) if (s[k] !== p[k]) this.pop[k] = 1;
      if (s.pack && p.pack && s.pack.used !== p.pack.used) this.pop.pack = Math.max(this.pop.pack, 0.6);
      if (s.combat?.lastParry && s.combat.lastParryAge < (p.combat?.lastParryAge ?? 99)) this.parryFlash = s.combat.lastParry === 'perfect' ? 1 : 0.5;
    }
    if (s.skills) s.skills.slots.forEach((sl, i) => { const cd = sl?.cd ?? 0; if ((this.prevCd[i] ?? 0) > 0 && cd <= 0) this.slotFlash[i] = 1; this.prevCd[i] = cd; this.slotFlash[i] = Math.max(0, (this.slotFlash[i] ?? 0) - dt * 3); });
    for (let i = 0; i < this.heartBump.length; i++) this.heartBump[i] = Math.max(0, this.heartBump[i] - dt * 3);
    this.heartFlash = Math.max(0, this.heartFlash - dt * 4);
    for (const k of Object.keys(this.pop) as Counter[]) this.pop[k] = Math.max(0, this.pop[k] - dt * 3.5);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 3);
    // stamina: the fill drops at once, a pale chip lingers where it was, then drains after it
    const c = s.combat;
    const st = c && c.staminaMax > 0 ? clamp01(c.stamina / c.staminaMax) : 1;
    if (st < this.stamShown - 0.002) { this.stamChip = Math.max(this.stamChip, this.stamShown); this.stamChipHold = 0.4; this.stamShown = st; }
    else this.stamShown = lerp(this.stamShown, st, 1 - Math.exp(-dt * 12));
    if (this.stamChipHold > 0) this.stamChipHold -= dt; else this.stamChip = Math.max(this.stamShown, this.stamChip - dt * 0.8);
    if (st >= 0.999 && p?.combat && p.combat.staminaMax > 0 && p.combat.stamina / p.combat.staminaMax < 0.999) this.stamFull = 1;
    this.stamFull = Math.max(0, this.stamFull - dt * 3);
    const mn = s.maxMana ? clamp01((s.mana ?? 0) / s.maxMana) : 0;
    this.manaShown = lerp(this.manaShown, mn, 1 - Math.exp(-dt * 10));
    // boss
    const b = s.boss && s.boss.visible !== false ? s.boss : null;
    if (b) {
      if (b.name !== this.bossName) { this.bossName = b.name; this.bossIn = 0; this.bossShown = this.bossChip = 1; }
      this.bossIn = Math.min(1, this.bossIn + dt * 1.4);
      const v = b.max > 0 ? clamp01(b.hp / b.max) : 0;
      if (v < this.bossShown - 0.0005) { this.bossChip = Math.max(this.bossChip, this.bossShown); this.bossChipHold = 0.6; this.bossFlash = Math.min(1, this.bossFlash + (this.bossShown - v) * 12); this.bossShown = v; }
      else this.bossShown = lerp(this.bossShown, v, 1 - Math.exp(-dt * 6));
      if (this.bossChipHold > 0) this.bossChipHold -= dt; else this.bossChip = Math.max(this.bossShown, this.bossChip - dt * 0.3);
      this.bossFlash = Math.max(0, this.bossFlash - dt * 7);
    } else { this.bossName = ''; this.bossIn = 0; }
  }

  // ---------------------------------------------------------------- top left
  /** hearts; returns the y below them */
  private hearts(ui: PixelUI, x0: number, y0: number, s: HudData): number {
    const red = Math.ceil(Math.max(0, s.maxHp) / 2), soul = Math.ceil(Math.max(0, s.soul ?? 0) / 2);
    const per = 10, W = 14, H = 13, total = red + soul;
    const low = s.hp > 0 && s.hp <= 2;
    const lastRed = Math.ceil(s.hp / 2) - 1;
    for (let i = 0; i < total; i++) {
      const cx = x0 + (i % per) * W, cy = y0 + Math.floor(i / per) * H;
      let name: string;
      if (i < red) { const v = s.hp - i * 2; name = v >= 2 ? 'heart' : v === 1 ? 'heartHalf' : 'heartEmpty'; }
      else { const v = (s.soul ?? 0) - (i - red) * 2; name = v >= 2 ? 'heartSoul' : 'heartSoulHalf'; }
      const b = this.heartBump[i] ?? 0;
      const beat = low && i === lastRed ? Math.max(0, Math.sin(this.t * 7.5)) ** 8 : 0;
      const dy = -Math.round(Math.sin(b * Math.PI) * 3);
      const shake = i === this.heartFlashAt && this.heartFlash > 0 ? Math.round(Math.sin(this.t * 90) * this.heartFlash * 1.5) : 0;
      ui.img(hudArt(name, '#00000070'), cx + 1 + shake, cy + 1 + dy);
      if (beat > 0.4) { ui.img(hudArt(name, '#ff4a5a'), cx - 1 + shake, cy + dy, { alpha: 0.5 }); ui.img(hudArt(name, '#ff4a5a'), cx + 1 + shake, cy + dy, { alpha: 0.5 }); }
      ui.img(hudArt(name), cx + shake, cy + dy);
      if (i === this.heartFlashAt && this.heartFlash > 0.45) ui.img(hudArt(name, '#ffffff'), cx + shake, cy + dy, { alpha: 0.9 });
    }
    return y0 + Math.max(1, Math.ceil(total / per)) * H;
  }

  /** a framed bar with a 1 px top shine; returns the y below it */
  private bar(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, chip: number, ramp: [string, string, string, string]) {
    ui.fill(x + 1, y + 1, w, h, '#00000066');
    ui.fill(x, y, w, h, '#0a0c14');
    ui.fill(x + 1, y + 1, w - 2, h - 2, '#221c26');
    const iw = w - 2, fw = Math.round(iw * clamp01(v)), cw = Math.round(iw * clamp01(chip));
    if (cw > fw) ui.fill(x + 1 + fw, y + 1, cw - fw, h - 2, '#fff0c8', 0.9);
    if (fw > 0) {
      ui.fill(x + 1, y + 1, fw, h - 2, ramp[1]);
      ui.fill(x + 1, y + 1, fw, 1, ramp[2]);
      if (h > 4) ui.fill(x + 1, y + h - 2, fw, 1, ramp[0]);
      ui.fill(x + 2, y + 1, Math.max(0, Math.min(fw - 2, 2)), 1, ramp[3]);
    }
    for (let i = 12; i < iw; i += 12) ui.fill(x + 1 + i, y + 2, 1, h - 4, '#00000050');
    return y + h;
  }

  private bars(ui: PixelUI, x: number, y: number, s: HudData): number {
    const c = s.combat;
    let yy = y;
    if (c && c.staminaMax > 0) {
      const sw = Math.round(36 + Math.min(64, c.staminaMax * 0.5));
      const broken = c.guard === 'guardBroken' || (c.stamina <= 0 && Math.sin(this.t * 20) > 0);
      const ramp: [string, string, string, string] = broken ? ['#6a0a10', '#d0302a', '#ff8a6a', '#ffffff']
        : c.staminaDelay > 0 ? ['#6a4a08', '#c89a28', '#f0d060', '#ffffff'] : ['#235c10', '#62b828', '#b0ec5c', '#ffffff'];
      ui.img(hudArt('stamLeaf'), x - 1, yy);
      this.bar(ui, x + 8, yy + 1, sw, 6, this.stamShown, this.stamChip, ramp);
      if (this.stamFull > 0) ui.fill(x + 9, yy + 2, sw - 2, 4, '#ffffff', this.stamFull * 0.65);
      if (c.guard === 'riposte') ui.rect(x + 7, yy, sw + 2, 8, Math.sin(this.t * 16) > 0 ? '#ffe070' : '#ff9a2a');
      if (this.parryFlash > 0) ui.rect(x + 7, yy, sw + 2, 8, '#ffffff');
      yy += 8;
    }
    if (s.maxMana) {
      const mw = Math.round(30 + Math.min(84, s.maxMana * 0.6));
      ui.img(hudArt('manaGem'), x, yy + 2);
      this.bar(ui, x + 8, yy + 3, mw, 5, this.manaShown, this.manaShown, ['#1a2a8a', '#3a6ae8', '#8ac0ff', '#ffffff']);
      const gx = ((this.t * 36) % (mw + 50)) - 25;
      if (gx > 0 && gx < (mw - 3) * this.manaShown) ui.fill(x + 9 + Math.round(gx), yy + 4, 2, 1, '#ffffff', 0.7);
      yy += 9;
    }
    return yy;
  }

  private flasks(ui: PixelUI, x: number, y: number, s: HudData): number {
    const c = s.combat;
    if (!c || !c.flasksMax) return y;
    for (let i = 0; i < c.flasksMax; i++) {
      const full = i < c.flasks;
      const drinkingThis = c.drinking > 0 && i === c.flasks; // the charge being drunk (already spent)
      const n = full ? 'flask' : 'flaskEmpty';
      const fx = x + i * 10;
      ui.img(hudArt(n, '#00000066'), fx + 1, y + 1);
      ui.img(hudArt(n), fx, y);
      if (drinkingThis) {
        // the liquid level drops as it's drunk
        const lvl = Math.round((1 - c.drinking) * 6);
        if (lvl > 0) ui.fill(fx + 2, y + 10 - lvl, 4, lvl, '#5cb830', 0.9);
        ui.rect(fx - 1, y - 1, 10, 14, '#b8f070');
      }
    }
    return y + 12;
  }

  private counters(ui: PixelUI, x: number, y: number, s: HudData) {
    const rows: [Exclude<Counter, 'pack' | 'hp'>, string][] = [['pearls', 'pearl'], ['keys', 'key'], ['bombs', 'bomb']];
    let yy = y;
    const icon = (art: string, k: Counter, yy2: number) => {
      const ic = hudArt(art), pop = this.pop[k];
      const ix = x + Math.round((12 - ic.width) / 2), iy = yy2 + Math.round((14 - ic.height) / 2) - Math.round(Math.sin(pop * Math.PI) * 2);
      ui.img(hudArt(art, '#00000066'), ix + 1, iy + 1);
      ui.img(ic, ix, iy);
    };
    for (const [k, art] of rows) {
      icon(art, k, yy);
      const pop = this.pop[k];
      const v = String(Math.max(0, Math.min(99, s[k]))).padStart(2, '0');
      ui.text(v, x + 15, yy + 2 - Math.round(Math.sin(pop * Math.PI) * 2), { font: 'body', color: pop > 0.25 ? '#fff6b0' : C.white, outline: '#0a0810' });
      yy += 15;
    }
    if (s.pack) {
      icon('pack', 'pack', yy);
      const full = s.pack.full || s.pack.used >= s.pack.total;
      const shake = full && this.pop.pack > 0 ? Math.round(Math.sin(this.t * 70) * 2) : 0;
      ui.text(`${s.pack.used}/${s.pack.total}`, x + 15 + shake, yy + 4, { font: 'small', color: full ? '#ff6a5a' : '#d8d0c0', outline: '#0a0810' });
    }
  }

  // ---------------------------------------------------------------- top right: the strip minimap
  private strip(ui: PixelUI, m: StripMap) {
    const IW = Math.max(150, Math.min(240, Math.round(ui.w * 0.3))), IH = 28;
    const PW = IW + 6, PH = IH + 6;
    const px = ui.w - PW - 6, py = 16;
    const ix = px + 3, iy = py + 3;
    const L = Math.max(1e-6, m.length);
    const X = (v: number) => ix + Math.round(clamp01(v / L) * (IW - 1));
    // frame: brass rim around dark glass
    ui.fill(px + 1, py + 1, PW, PH, '#00000070');
    ui.fill(px, py, PW, PH, '#1e1206');
    ui.fill(px + 1, py + 1, PW - 2, PH - 2, '#b07c34');
    ui.fill(px + 1, py + 1, PW - 2, 1, '#f0c870');
    ui.fill(px + 2, py + 2, PW - 4, PH - 4, '#3a2410');
    // water column: lit near the top, deep at the bottom
    const water = ['#3a8ab8', '#2e74a4', '#25608e', '#1d4e78', '#163e64', '#103052'];
    for (let r = 0; r < IH; r++) ui.fill(ix, iy + r, IW, 1, water[Math.min(water.length - 1, Math.floor((r / IH) * water.length))]);
    // upper lane hint: a lighter band along the top where the level has one
    for (const ln of m.lanes ?? []) if (ln.kind === 'upper') { const a = X(ln.x0), b = X(ln.x1); ui.fill(a, iy + 1, b - a + 1, 6, '#6ac0e0'); ui.fill(a, iy + 7, b - a + 1, 1, '#2a6a98'); }
    // seabed + caves
    const sb = m.seabed ?? [0.72];
    const bedAt = (cx: number) => { const t = clamp01((cx - ix) / Math.max(1, IW - 1)) * (sb.length - 1); const i = Math.floor(t), f = t - i; return lerp(sb[i], sb[Math.min(sb.length - 1, i + 1)], f); };
    for (let cx = ix; cx < ix + IW; cx++) {
      const by = iy + Math.round(clamp01(bedAt(cx)) * (IH - 1));
      ui.fill(cx, by, 1, iy + IH - by, '#c8a868');
      ui.fill(cx, by, 1, 1, '#f0d8a0');
      if (by + 2 < iy + IH) ui.fill(cx, by + 2, 1, iy + IH - by - 2, '#7a5a34');
    }
    for (const ln of m.lanes ?? []) if (ln.kind === 'cave') {
      const a = X(ln.x0), b = X(ln.x1);
      for (let cx = a; cx <= b; cx++) {
        const by = iy + Math.round(clamp01(bedAt(cx)) * (IH - 1));
        const top = by + 3, bot = iy + IH - 2;
        if (bot > top) { ui.fill(cx, top, 1, bot - top, '#3a2a22'); ui.fill(cx, Math.round((top + bot) / 2), 1, 2, '#140c0a'); }
      }
    }
    // fog over unexplored stretches (dark, with a dotted edge)
    const spans = [...m.explored].sort((a, b) => a[0] - b[0]);
    let cur = 0;
    const fog = (a: number, b: number) => { if (b <= a) return; const xa = X(a), xb = X(b); ui.fill(xa, iy, xb - xa + 1, IH, '#060a12', 0.78); for (let yy = iy; yy < iy + IH; yy += 2) { ui.fill(xa, yy, 1, 1, '#3a4a5a'); ui.fill(xb, yy, 1, 1, '#3a4a5a'); } };
    for (const [a, b] of spans) { if (a > cur) fog(cur, a); cur = Math.max(cur, b); }
    if (cur < L) fog(cur, L);
    // POIs
    const defY: Record<PoiType, number> = { treasure: 0.62, shop: 0.5, post: 0.45, challenge: 0.5, secret: 0.8, boss: 0.5, arena: 0.5, start: 0.5 };
    const glyph: Record<PoiType, string> = { treasure: 'mTreasure', shop: 'mShop', post: 'mPost', challenge: 'mChallenge', secret: 'mSecret', boss: 'mBoss', arena: 'mArena', start: 'mStart' };
    for (const p of m.pois) {
      const known = p.known !== false;
      const ic = hudArt(known ? glyph[p.type] : 'mSecret');
      const gx = Math.max(ix, Math.min(ix + IW - ic.width, X(p.x) - Math.floor(ic.width / 2)));
      const gy = Math.max(iy, Math.min(iy + IH - ic.height, iy + Math.round(clamp01(p.y ?? defY[p.type]) * (IH - 1)) - Math.floor(ic.height / 2)));
      if (p.type === 'boss') { ui.fill(gx - 1, iy, 1, IH, '#8a1424'); }
      ui.img(ic, gx, gy, { alpha: !known ? 0.55 : p.done ? 0.45 : 1 });
    }
    // the player: a pink dot + a caret on the frame above it
    const plx = X(m.player), ply = iy + Math.round(clamp01(m.playerY ?? 0.5) * (IH - 1));
    const on = Math.sin(this.t * 6) > -0.4;
    ui.fill(plx - 2, ply - 2, 5, 5, '#2a0a18');
    ui.fill(plx - 1, ply - 1, 3, 3, on ? '#ffb0c8' : '#e87aa0');
    ui.fill(plx - 1, ply - 1, 1, 1, '#ffffff');
    ui.fill(plx - 2, py - 3, 5, 1, '#ffd0e0'); ui.fill(plx - 1, py - 2, 3, 1, '#ffd0e0'); ui.fill(plx, py - 1, 1, 1, '#ffd0e0');
    // rivets
    for (const [cx, cy] of [[px + 1, py + 1], [px + PW - 2, py + 1], [px + 1, py + PH - 2], [px + PW - 2, py + PH - 2]]) ui.fill(cx, cy, 1, 1, '#fff4c0');
    // labels: area name above (left), floor pips + FLOOR n/m below
    if (m.name) ui.text(m.name.toUpperCase(), px + 1, py - 13, { font: 'small', color: '#f0e6d0', outline: C.ink });
    const fl = `FLOOR ${m.floor}/${m.floors}`;
    const tw = ui.measure(fl, 'small');
    ui.text(fl, px + PW - 1, py + PH + 3, { font: 'small', color: '#e8e0d0', outline: C.ink, align: 'right' });
    for (let i = 0; i < m.floors; i++) ui.img(hudArt(i < m.floor ? 'pip' : 'pipOff'), px + PW - tw - 8 - (m.floors - i) * 7, py + PH + 3);
  }

  // ---------------------------------------------------------------- bottom centre: boss bar
  private bossBar(ui: PixelUI, b: BossBar) {
    const ease = 1 - (1 - this.bossIn) ** 3;
    const W = Math.min(300, Math.round(ui.w * 0.56)), H = 9;
    const x = Math.round((ui.w - W) / 2), y = Math.round(ui.h - 24 + (1 - ease) * 34);
    const name = b.name.toUpperCase();
    ui.text(name, ui.w / 2, y - 16, { font: 'title', color: '#ffe8d0', color2: '#ff9a7a', outline: '#1a0606', align: 'center', alpha: ease });
    if (b.title) {
      const nw = ui.measure(name, 'title');
      ui.text(b.title, ui.w / 2 + nw / 2 + 6, y - 12, { font: 'small', color: '#c8b8a8', outline: '#1a0606', alpha: ease });
    }
    // frame: dark iron, bronze rim, gold end caps
    ui.fill(x - 3, y - 2, W + 6, H + 6, '#00000077');
    ui.fill(x - 3, y - 3, W + 6, H + 6, '#1a0e0a');
    ui.fill(x - 2, y - 2, W + 4, H + 4, '#6a4a2a');
    ui.fill(x - 2, y - 2, W + 4, 1, '#c89a5a');
    ui.fill(x - 1, y - 1, W + 2, H + 2, '#140a0a');
    const fw = Math.round(W * this.bossShown), cw = Math.round(W * this.bossChip);
    ui.fill(x, y, W, H, '#2a0c10');
    if (cw > fw) ui.fill(x + fw, y, cw - fw, H, '#ffd8a0');
    if (fw > 0) {
      ui.fill(x, y, fw, H, '#b8182a');
      ui.fill(x, y, fw, 2, '#ff5a4a');
      ui.fill(x, y + 2, fw, 1, '#e8303a');
      ui.fill(x, y + H - 2, fw, 2, '#7a0a1a');
      if (this.bossFlash > 0) ui.fill(x, y, fw, H, '#ffffff', Math.min(0.6, this.bossFlash * 0.6));
    }
    // poise: a thin gold sliver under the bar
    if (b.poise !== undefined && b.poise < 0.999) ui.fill(x, y + H + 1, Math.round(W * clamp01(b.poise)), 1, '#ffd860');
    const n = Math.max(1, b.phases ?? 1), ph = Math.max(1, Math.min(n, b.phase ?? 1));
    for (let i = 1; i < n; i++) { const nx = x + Math.round(W * (1 - i / n)); ui.fill(nx, y - 1, 1, H + 2, '#1a0606'); ui.fill(nx + 1, y, 1, H, '#ff8a7a', 0.5); }
    for (const cx of [x - 6, x + W + 1]) { ui.fill(cx, y - 4, 5, H + 8, '#3a1e06'); ui.fill(cx + 1, y - 3, 3, H + 6, '#e0a830'); ui.fill(cx + 1, y - 3, 1, H + 6, '#fff0a0'); ui.fill(cx + 3, y - 3, 1, H + 6, '#8a5a10'); }
    const sk = hudArt('skull');
    ui.img(sk, x - 9 - sk.width + 2, y + Math.round((H - sk.height) / 2));
    if (n > 1) { const pw = n * 7 - 2, px0 = Math.round(ui.w / 2 - pw / 2); for (let i = 0; i < n; i++) ui.img(hudArt(i < ph ? 'pip' : 'pipOff'), px0 + i * 7, y + H + 4); }
  }

  // ---------------------------------------------------------------- bottom left: skill slots
  private skillRow(ui: PixelUI, s: SkillHudState) {
    const S = 26, gap = 4, x0 = 8, y0 = ui.h - S - 8;
    s.slots.forEach((sl, i) => {
      const x = x0 + i * (S + gap), sel = i === s.sel && !!sl;
      const y = y0 - (sel ? 2 : 0);
      ui.fill(x + 1, y + 1, S, S, '#00000066');
      ui.fill(x, y, S, S, '#0a0610');
      ui.fill(x + 1, y + 1, S - 2, S - 2, sel ? '#f0c040' : '#8a6a3a');
      ui.fill(x + 1, y + 1, S - 2, 1, sel ? '#fff2a0' : '#c8a060'); ui.fill(x + 1, y + 1, 1, S - 2, sel ? '#fff2a0' : '#c8a060');
      ui.fill(x + 1, y + S - 2, S - 2, 1, sel ? '#a06a10' : '#4a3418'); ui.fill(x + S - 2, y + 1, 1, S - 2, sel ? '#a06a10' : '#4a3418');
      ui.fill(x + 3, y + 3, S - 6, S - 6, '#1c2230');
      ui.fill(x + 3, y + 3, S - 6, 1, '#0c1018');
      if (sl) {
        const it = skillItem(sl.id);
        if (it) ui.item(it.id, x + 3, y + 3, S - 6, S - 6);
        else ui.fill(x + 8, y + 8, S - 16, S - 16, sl.color);
        const k = sl.cdMax > 0 ? clamp01(sl.cd / sl.cdMax) : 0;
        if (k > 0) {
          const hh = Math.ceil((S - 6) * k);
          ui.fill(x + 3, y + 3, S - 6, hh, '#060810', 0.78);
          ui.fill(x + 3, y + 3 + hh, S - 6, 1, '#8a9ab8');
          ui.text(String(Math.ceil(sl.cd)), x + S / 2, y + S / 2 - 5, { font: 'body', color: '#ffffff', outline: '#06080e', align: 'center' });
        } else if (sl.mana > s.mana) ui.fill(x + 3, y + 3, S - 6, S - 6, '#14286a', 0.55);
        if ((this.slotFlash[i] ?? 0) > 0) ui.fill(x + 3, y + 3, S - 6, S - 6, '#ffffff', this.slotFlash[i] * 0.8);
        if (sl.mana > 0) { ui.img(hudArt('manaGem'), x + S - 7, y + S - 8, { alpha: sl.mana > s.mana ? 0.4 : 1 }); }
      }
      // key plate
      ui.fill(x - 2, y - 3, 9, 10, '#0a0610');
      ui.fill(x - 1, y - 2, 7, 8, sel ? '#fff2a0' : '#d8c8a0');
      ui.text(String(i + 1), x + 2.5, y - 1, { font: 'small', color: '#2a1a0a', shadow: null, align: 'center' });
    });
  }

  // ---------------------------------------------------------------- title cards / pickup streaks
  private drawCards(ui: PixelUI, dt: number) {
    for (const c of this.cards) c.t += dt;
    this.cards = this.cards.filter((c) => c.t < c.life);
    for (const c of this.cards) {
      const a = clamp01(Math.min(c.t * 5, (c.life - c.t) * 2.5));
      const slide = Math.round((1 - Math.min(1, c.t * 5)) ** 2 * 14);
      if (c.icon) {
        const y = Math.round(ui.h * 0.22);
        const sub = c.sub.length > 64 ? c.sub.slice(0, 62) + '…' : c.sub;
        const tw = Math.max(ui.measure(c.title, 'title'), ui.measure(sub, 'small'));
        const w = Math.min(ui.w - 20, tw + 58), x = Math.round((ui.w - w) / 2);
        ui.fill(x, y, w, 40, '#06080e', 0.75 * a);
        ui.fill(x, y, w, 1, '#ffd860', 0.85 * a); ui.fill(x, y + 39, w, 1, '#ffd860', 0.85 * a);
        ui.item(c.icon, x + 5, y + 4, 32, 32, 1, a);
        ui.text(c.title, x + 44 - slide, y + 8, { font: 'title', color: c.color, outline: '#1a0e04', alpha: a });
        if (sub) ui.text(sub, x + 44 + slide, y + 25, { font: 'small', color: '#d8d0c0', alpha: a });
      } else {
        const y = Math.round(ui.h * 0.3);
        ui.text(c.title, ui.w / 2, y - slide, { font: 'big', color: c.color, color2: '#ffc860', outline: '#140a04', align: 'center', alpha: a });
        if (c.sub) ui.text(c.sub, ui.w / 2, y + 30 + slide, { font: 'body', color: '#e8e0d0', outline: '#06080e', align: 'center', alpha: a });
      }
    }
  }
}
