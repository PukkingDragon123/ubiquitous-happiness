// The dungeon-run HUD (v8b, "deep ink"): flat 2D readouts in the kit's calm style (src/ui/pixel/skins.ts), read at a
// glance. No 3D instruments any more: every piece is a flat navy panel with a 1 px border, Alagard text and plain bars.
//
//   top left      VITALS: "HP 60 / 60" (the number counts up on a heal, drops on a hit, a -10 / +30 floats off it),
//                 the HP bar (red, a pale chip of what a hit took, ticks every 10 HP), the thin stamina and mana bars,
//                 and the HEAL count on the right (the clams: a small glyph, "x2", the [R] key). Low HP: the number
//                 and the panel's border breathe red.
//                 RESOURCES under it: pearls, keys, bombs and the pack's cells as small mono glyphs + numbers (a +n /
//                 -n floats off on a change; PACK FULL in red)
//   top right     WHERE: the area's name, the stage dots, metres FROM HOME and the DEPTH (with its zone)
//   bottom left   the SKILLS: square slots (keys 1-4), the granting item's icon, a cooldown shade wiping down with the
//                 seconds over it, the selected one in gold
//   bottom centre the BOSS: its name, the health bar (chip + flash), phase ticks, poise as a thin gold line
//   right         PICKUP cards: slide in, the item's icon, the name, the kind in its rarity colour and one stat line
//   centre        TITLE toasts (top centre), BANNERS (a word between two rules) and the AREA card for a new floor
//
// Usage (unchanged): const hud = new Hud(); overlays: [hud.layer]; hud.resize(w, h, pr);
//   hud.draw(dt, data, input)   or hud.drawInto(myUi, dt, data) inside your own ui.begin()/ui.end()
//   hud.title(name, sub) / hud.banner(t, sub, style) / hud.areaCard(name, sub) / hud.pickup(itemId) / hud.codex(name, model)
//   hud.flash('pack' | 'pearls' | 'keys' | 'bombs' | 'hp')
import * as THREE from 'three';
import { PixelUI } from './pixel/ui';
import type { Input } from '../core/input';
import type { PlayerCombatHud, BossBar } from '../combat/types';
import { ITEMS, RARITY_COLOR, statLines, skillItem } from '../game/items';
import type { SkillHudState } from '../skills/hud';
import { UiStage, PlanePool } from './obj/stage';
import { pixelize } from './obj/pixtex';
import { HP_PER, HEAL_ITEM, hpify } from '../combat/types';
import { audio } from '../audio/audio';
import { C } from './pixel/skins';

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

/** v5's strip map of the level. v6 draws NO map (the journey has crossroads with signposts instead): only `name`,
 *  `floor` and `floors` are still read, as a fallback for HudData.area / HudData.stage. */
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
  /** health in the player's internal units (the old half hearts, 6 for a new blobfish); SHOWN as HP = units x HP_PER */
  hp: number; maxHp: number;
  /** extra blue shield units (shown as +HP in sea blue on the HP readout) */
  soul?: number;
  /** K's combat HUD: stamina, the healing clams (flasks / flasksMax / drinking), guard, parry flashes */
  combat?: PlayerCombatHud | null;
  mana?: number; maxMana?: number;
  pearls: number; keys: number; bombs: number;
  /** the pack's fill in cells */
  pack?: { used: number; total: number; full?: boolean };
  /** deprecated (v6 has no map): only its name / floor / floors are read when `area` / `stage` are not given */
  strip?: StripMap | null;
  /** the area's name for the navigation instrument ("Sunlit Reef") */
  area?: string;
  /** the stage gems: 1-based floor and the floor count */
  stage?: { floor: number; floors: number } | null;
  /** J6's journey place (v6 crossroads): the area, the stage, and the route taken at the last fork ('' = the main
   *  way). Read when `area` / `stage` are not given. */
  place?: { name: string; floor?: number; floors?: number; route?: string } | null;
  /** K's boss bar (drawn while visible) */
  boss?: BossBar | null;
  /** the skill slots (keys 1-4), bottom left: player.skillHud(); replaces the old SkillBar overlay */
  skills?: SkillHudState | null;
  /** metres travelled from home (the journey) */
  far?: number;
  /** the diving depth gauge: metres now, the deepest ever (red marker); floorMax = the dial's full scale */
  depth?: { m: number; record: number; floorMax?: number; floorTop?: number; floorBottom?: number; zone?: string; descending?: boolean } | null;
  /** hide everything but title cards (cutscenes) */
  hidden?: boolean;
  /** a menu / panel is up: hide everything, title cards too (they wait their turn) */
  menu?: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
/** HUD strings: drop glyphs the face doesn't carry */
const clean = (s: string) => s.replace(/[✓✔]/g, '').replace(/[^\x20-\x7E·]/g, '').replace(/·/g, '-').trim();
type Counter = 'pearls' | 'keys' | 'bombs' | 'pack' | 'hp';

// ------------------------------------------------------------------ mono glyphs (one tone, 1 texel per UI px)
const GL: Record<string, string[]> = {
  pearl: ['..###..', '.#####.', '###.###', '##.####', '#######', '.#####.', '..###..'],
  key: ['.###....', '#...#...', '#...####', '#...#.#.', '.###..#.'],
  bomb: ['.....#.', '....#..', '.###...', '#####..', '#####..', '#####..', '.###...'],
  pack: ['..###..', '.#...#.', '#######', '#.....#', '#.###.#', '#.....#', '#######'],
  heal: ['...#...', '..###..', '.#.#.#.', '#.#.#.#', '#######', '.#####.'],
  house: ['...#...', '..###..', '.#####.', '#######', '.#...#.', '.#.#.#.', '.#.#.#.'],
  down: ['..#..', '..#..', '..#..', '#####', '.###.', '..#..'],
  book: ['##.##', '#.#.#', '#.#.#', '#.#.#', '#####'],
};
const glCache = new Map<string, HTMLCanvasElement>();
function glyph(name: string, col: string): HTMLCanvasElement {
  const key = name + '|' + col;
  let cv = glCache.get(key);
  if (cv) return cv;
  const rows = GL[name] ?? GL.pearl;
  cv = document.createElement('canvas'); cv.width = Math.max(...rows.map((r) => r.length)); cv.height = rows.length;
  const x = cv.getContext('2d')!; x.fillStyle = col;
  rows.forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) if (r[xx] === '#') x.fillRect(xx, yy, 1, 1); });
  glCache.set(key, cv);
  return cv;
}

// ------------------------------------------------------------------ pickup cards / title toasts
interface PickCard { id: string; title: string; sub: string; kind: string; color: string; t: number; life: number; y: number }
interface Toast { title: string; sub: string; color: string; t: number; life: number; area?: boolean; banner?: 'danger' | 'gold'; landed?: boolean }
interface CodexNote { name: string; t: number; y: number }
interface Roll { v: number; old: number; t: number; flash: number; delta: { n: number; t: number }[] }

/** the screen margin and the gap between HUD pieces (UI px) */
const M = 10, G = 4;
/** skill slots: size and gap */
const SS = 30, SG = 6;

export class Hud {
  private pixT = 0;
  ui = new PixelUI();
  get layer(): { scene: THREE.Scene; camera: THREE.Camera } { return this.ui.layer; }
  /** a 3D stage on the HUD's layer: DungeonHud shows the post office's item models on it */
  stage = new UiStage();
  /** flat planes behind the 2D canvas (in UI px): DungeonHud draws its panels here too */
  planes = new PlanePool(this.stage);
  private t = 0;
  private prev: HudData | null = null;
  /** the HP number as shown (counts up on a heal, drops on a hit) and its floating deltas */
  private hpShown = -1; private hpFlash = 0;
  private hpDeltas: { n: number; t: number }[] = [];
  /** the HP bar: shown fraction, the pale chip of what a hit took, the heal pouring in */
  private hpBar = 1; private hpChip = 1; private hpChipHold = 0; private hpPour = 0;
  private stamShown = 1; private stamChip = 1; private stamChipHold = 0; private stamFlash = 0;
  private manaShown = 0; private manaChip = 0;
  private bossShown = 1; private bossChip = 1; private bossChipHold = 0; private bossFlash = 0; private bossIn = 0; private bossName = ''; private bossShake = 0;
  private pop: Record<Counter, number> = { pearls: 0, keys: 0, bombs: 0, pack: 0, hp: 0 };
  private rolls: Record<'pearls' | 'keys' | 'bombs' | 'pack', Roll> = { pearls: this.roll(), keys: this.roll(), bombs: this.roll(), pack: this.roll() };
  private hurtT = 0; private healT = 0;
  private parryFlash = 0;
  private healPop = 0; private lastFlasks = -1;
  private picks: PickCard[] = [];
  private toasts: Toast[] = [];
  private notes: CodexNote[] = [];
  private deathT = 0;
  /** the free span of the top row (between the vitals and the where panel), UI px */
  private topGap: [number, number] = [0, 9999];
  private cdPrev: number[] = [0, 0, 0, 0];
  private readyT: number[] = [9, 9, 9, 9];
  private bossLanded = false;

  private roll(): Roll { return { v: -1, old: -1, t: 1, flash: 0, delta: [] }; }

  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); }

  /** a title toast at the top centre (area changes, secrets, "SENT HOME") */
  title(title: string, sub = '', color: string = C.bone2, life = 3) {
    this.toasts = this.toasts.filter((c) => c.area || c.banner);
    this.toasts.push({ title: clean(title), sub: clean(sub), t: 0, life, color });
  }
  /**
   * a big moment across the middle of the screen (boss intro, CHALLENGE, CLEARED, VICTORY, SURFACING): the word
   * between two thin rules ('danger': red, 'gold': the gold accent), the sub line under it. A newer banner replaces
   * an older one.
   */
  banner(title: string, sub = '', style: 'danger' | 'gold' = 'gold', life = 2.8) {
    this.toasts = this.toasts.filter((c) => !c.banner);
    this.toasts.push({ title: clean(title).toUpperCase(), sub: clean(sub).toUpperCase(), t: 0, life, color: style === 'danger' ? C.red2 : C.gold2, banner: style });
  }
  /** a creature met for the first time: a small note slides into the right-hand lane under the pickup cards (the
   *  model argument is accepted for compatibility; the v8b HUD is flat 2D). Notes queue. */
  codex(name: string, model: THREE.Object3D | null = null) {
    void model;
    if (this.notes.length >= 4) this.notes.splice(1, 1);
    this.notes.push({ name: clean(name), t: 0, y: -1 });
  }
  /** the big card for a new floor: the area's name across the upper screen between two gold rules, a sub line */
  areaCard(name: string, sub = '', color: string = C.bone2, life = 4.2) {
    this.toasts = this.toasts.filter((c) => !c.area);
    this.toasts.push({ title: clean(name).toUpperCase(), sub: clean(sub).toUpperCase(), t: 0, life, color, area: true });
    audio.play('thud_heavy1', { vol: 0.25, dry: true });
  }
  /** an item pickup card: slides in on the right: the item's icon, its name, the kind and the first stat line */
  pickup(itemId: string, name?: string, sub?: string) {
    const d = ITEMS[itemId];
    if (this.picks.length >= 3) this.picks.shift();
    const col = d ? RARITY_COLOR[d.rarity] : C.bone;
    const line = hpify(sub ?? (d ? (statLines(itemId, 1)[0]?.text ?? d.desc) : ''));
    const y0 = this.picks.length ? this.picks[this.picks.length - 1].y + 40 : 84;
    this.picks.push({ id: itemId, title: clean(name ?? d?.name ?? itemId), sub: clean(line), kind: d ? `${d.rarity} ${d.kind}`.toUpperCase() : '', t: 0, life: 3.8, color: col, y: y0 });
  }
  /** bounce / flash a counter ('hp': the HP number flashes) */
  flash(what: Counter) { this.pop[what] = 1; if (what !== 'hp') this.rolls[what].flash = 1; else this.hpFlash = 1; }

  /** begin + draw + end on the HUD's own PixelUI */
  draw(dt: number, s: HudData, input: Input | null = null) {
    this.ui.begin(input, dt);
    this.drawInto(this.ui, dt, s);
    this.ui.end();
  }

  /** draw into any PixelUI between its begin() and end() (the planes pool restarts here: add panels after it) */
  drawInto(ui: PixelUI, dt: number, s: HudData) {
    this.t += dt;
    this.stage.attach(ui);
    this.planes.begin();
    this.stage.ui.scale.setScalar(Math.max(0.75, ui.h / 360));
    if ((this.pixT -= dt) <= 0) { this.pixT = 0.5; pixelize(this.stage.ui); }
    this.animate(dt, s);
    const on = !s.hidden;
    for (const o of this.stage.ui.children) o.visible = on;
    // the death moment: the dark closes in from the edges
    this.deathT = on && s.hp <= 0 && s.maxHp > 0 ? this.deathT + dt : 0;
    if (this.deathT > 0) this.planes.draw(vignette(ui.w, ui.h), 0, 0, { w: ui.w, h: ui.h, alpha: Math.min(0.9, this.deathT * 0.45), back: true });
    if (on) {
      const vit = this.vitals(ui, s);
      this.resources(ui, s, vit.bottom + G);
      const navL = this.nav(ui, dt, s);
      this.topGap = [vit.right, navL];
      const skR = this.skills(ui, dt, s.skills ?? null);
      this.bossBar(ui, s.boss && s.boss.visible !== false ? s.boss : null, skR);
      this.pickups(ui, dt);
    } else for (const p of this.picks) p.t += dt;
    // (behind a menu the title cards wait: their clocks stop until it closes)
    if (!s.menu) this.toastsDraw(ui, dt, !on);
    this.prev = { ...s, combat: s.combat ? { ...s.combat } : s.combat };
  }

  // ---------------------------------------------------------------- change detection / easing
  private animate(dt: number, s: HudData) {
    const p = this.prev;
    if (p) {
      const tot = s.hp + (s.soul ?? 0), ptot = p.hp + (p.soul ?? 0);
      if (tot < ptot) {
        // a hit: the number drops at once and a -n floats off, the bar keeps a pale chip of what was lost a moment
        this.hurtT = 1;
        this.hpDeltas.push({ n: -(ptot - tot), t: 0 });
        const was = p.maxHp > 0 ? clamp01(p.hp / p.maxHp) : 0;
        this.hpChip = Math.max(this.hpChip, was); this.hpChipHold = 0.55; this.hpFlash = 0.7;
      } else if (s.hp > p.hp) {
        this.healT = 1;
        this.hpDeltas.push({ n: s.hp - p.hp, t: 0 }); this.hpPour = 1;
      }
      if (s.combat?.lastParry && s.combat.lastParryAge < (p.combat?.lastParryAge ?? 99)) this.parryFlash = s.combat.lastParry === 'perfect' ? 1 : 0.5;
    }
    this.hurtT = Math.max(0, this.hurtT - dt * 1.6); this.healT = Math.max(0, this.healT - dt * 1.2);
    const hpNow = Math.max(0, s.hp) * HP_PER;
    if (this.hpShown < 0 || hpNow < this.hpShown) this.hpShown = hpNow;
    else this.hpShown = Math.min(hpNow, this.hpShown + Math.max(1, (hpNow - this.hpShown) * 6) * dt * 6);
    for (const d of this.hpDeltas) d.t += dt;
    this.hpDeltas = this.hpDeltas.filter((d) => d.t < 1.2).slice(-3);
    this.hpFlash = Math.max(0, this.hpFlash - dt * 2.4);
    const hf = s.maxHp > 0 ? clamp01(Math.max(0, s.hp) / s.maxHp) : 0;
    if (hf < this.hpBar) this.hpBar = hf; else this.hpBar = lerp(this.hpBar, hf, 1 - Math.exp(-dt * 5));
    if (this.hpChipHold > 0) this.hpChipHold -= dt; else this.hpChip = Math.max(this.hpBar, this.hpChip - dt * 0.7);
    this.hpPour = Math.max(0, this.hpPour - dt * 1.4);
    // a clam came back (a new floor refills them): its count pops
    const fl = s.combat?.flasks ?? -1;
    if (this.lastFlasks >= 0 && fl !== this.lastFlasks) this.healPop = 1;
    this.lastFlasks = fl;
    this.healPop = Math.max(0, this.healPop - dt * 2.5);
    for (const k of Object.keys(this.pop) as Counter[]) this.pop[k] = Math.max(0, this.pop[k] - dt * 3.5);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 3);
    // counters change, flash and float a +n / -n
    const vals = { pearls: s.pearls, keys: s.keys, bombs: s.bombs, pack: s.pack?.used ?? 0 };
    for (const k of Object.keys(this.rolls) as (keyof typeof vals)[]) {
      const r = this.rolls[k], v = vals[k];
      if (r.v < 0) { r.v = r.old = v; continue; }
      if (v !== r.v) { r.delta.push({ n: v - r.v, t: 0 }); r.old = r.v; r.v = v; r.t = 0; r.flash = 1; this.pop[k] = 1; }
      r.t = Math.min(1, r.t + dt * 6); r.flash = Math.max(0, r.flash - dt * 2.2);
      for (const d of r.delta) d.t += dt;
      r.delta = r.delta.filter((d) => d.t < 1.1).slice(-3);
    }
    const c = s.combat;
    const st = c && c.staminaMax > 0 ? clamp01(c.stamina / c.staminaMax) : 1;
    if (st < this.stamShown - 0.002) { this.stamChip = Math.max(this.stamChip, this.stamShown); this.stamChipHold = 0.4; this.stamShown = st; }
    else { if (st > this.stamShown + 0.15 && st >= 0.999) this.stamFlash = 0.6; this.stamShown = lerp(this.stamShown, st, 1 - Math.exp(-dt * 12)); }
    if (this.stamChipHold > 0) this.stamChipHold -= dt; else this.stamChip = Math.max(this.stamShown, this.stamChip - dt * 0.8);
    this.stamFlash = Math.max(this.parryFlash, this.stamFlash - dt * 2.5);
    const mn = s.maxMana ? clamp01((s.mana ?? 0) / s.maxMana) : 0;
    if (mn < this.manaShown - 0.01) this.manaChip = Math.max(this.manaChip, this.manaShown);
    this.manaShown = lerp(this.manaShown, mn, 1 - Math.exp(-dt * 10));
    this.manaChip = Math.max(this.manaShown, this.manaChip - dt * 0.6);
    const b = s.boss && s.boss.visible !== false ? s.boss : null;
    if (b) {
      if (b.name !== this.bossName) { this.bossName = b.name; this.bossIn = 0; this.bossShown = this.bossChip = 1; this.bossLanded = false; }
      this.bossIn = Math.min(1, this.bossIn + dt * 1.6);
      const v = b.max > 0 ? clamp01(b.hp / b.max) : 0;
      if (v < this.bossShown - 0.0005) { const hit = this.bossShown - v; this.bossChip = Math.max(this.bossChip, this.bossShown); this.bossChipHold = 0.6; this.bossFlash = Math.min(1, this.bossFlash + hit * 12); this.bossShake = Math.min(1, this.bossShake + hit * 20); this.bossShown = v; }
      else this.bossShown = lerp(this.bossShown, v, 1 - Math.exp(-dt * 6));
      if (this.bossChipHold > 0) this.bossChipHold -= dt; else this.bossChip = Math.max(this.bossShown, this.bossChip - dt * 0.3);
      this.bossFlash = Math.max(0, this.bossFlash - dt * 7);
      this.bossShake = Math.max(0, this.bossShake - dt * 5);
    } else { this.bossName = ''; this.bossIn = 0; }
  }

  // ---------------------------------------------------------------- shared bits
  /** a flat panel (the kit's 'dark' skin) with an optional coloured border over it */
  private box(ui: PixelUI, x: number, y: number, w: number, h: number, a = 1, border?: string, ba = 1) {
    ui.fill(x + 1, y + 2, w, h, '#000000', 0.2 * a);
    ui.frame('dark', x, y, w, h, a);
    if (border) { ui.fill(x + 1, y, w - 2, 1, border, ba * a); ui.fill(x + 1, y + h - 1, w - 2, 1, border, ba * a); ui.fill(x, y + 1, 1, h - 2, border, ba * a); ui.fill(x + w - 1, y + 1, 1, h - 2, border, ba * a); }
  }
  /** a flat bar: ink border, dark trough, a pale chip, a gain segment, the fill, quiet ticks */
  private meter(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, col: string, o: { chip?: number; chipCol?: string; gain?: number; gainCol?: string; ticks?: number; flash?: number } = {}) {
    ui.fill(x, y, w, h, C.ink);
    ui.fill(x + 1, y + 1, w - 2, h - 2, C.well);
    const iw = w - 2, ih = h - 2, fv = Math.round(iw * clamp01(v));
    if (o.gain !== undefined && o.gain > v) ui.fill(x + 1 + fv, y + 1, Math.round(iw * clamp01(o.gain)) - fv, ih, o.gainCol ?? C.sage, 0.7);
    if (o.chip !== undefined && o.chip > v) ui.fill(x + 1 + fv, y + 1, Math.round(iw * clamp01(o.chip)) - fv, ih, o.chipCol ?? C.bone, 0.45);
    if (fv > 0) ui.fill(x + 1, y + 1, fv, ih, col);
    if (o.ticks && o.ticks > 1 && o.ticks <= 40) for (let i = 1; i < o.ticks; i++) ui.fill(x + 1 + Math.round((iw * i) / o.ticks), y + 1, 1, ih, C.ink, 0.45);
    if (o.flash && o.flash > 0) ui.fill(x + 1, y + 1, Math.max(1, fv), ih, '#ffffff', Math.min(1, o.flash) * 0.35);
  }

  // ---------------------------------------------------------------- top left: HP, stamina, mana, the heal count
  private vitals(ui: PixelUI, s: HudData): { right: number; bottom: number } {
    const c = s.combat;
    const units = Math.max(0, s.hp), maxU = Math.max(1, s.maxHp);
    const frac = clamp01(units / maxU);
    const crit = units > 0 && (frac <= 0.3 || units <= 1);
    const hasStam = !!c && c.staminaMax > 0, hasMana = !!s.maxMana;
    const nF = c?.flasksMax ?? 0;
    const capT = Math.round(ui.cap('title')), capS = Math.round(ui.cap('small'));
    const W = 184;
    const H = 9 + capT + 7 + 6 + (hasStam ? 7 : 0) + (hasMana ? 7 : 0) + 9;
    const shake = this.hurtT > 0.6 ? Math.round(Math.sin(this.t * 55) * 1) : 0;
    const x = M + shake, y = M;
    const pulse = crit ? 0.5 + 0.5 * Math.sin(this.t * 6) : 0;
    this.box(ui, x, y, W, H, 1, crit || units <= 0 ? C.red : undefined, crit ? 0.35 + 0.5 * pulse : 1);
    // --- "HP" and the number
    const shown = Math.round(this.hpShown), maxShown = Math.round(maxU * HP_PER);
    const ty = y + 9;
    const heal = this.hpDeltas.some((d) => d.n > 0 && d.t < 0.8);
    const numCol = units <= 0 ? C.red : crit ? lerpHex(C.bone2, C.red2, pulse) : this.hpFlash > 0 ? lerpHex(C.bone2, heal ? C.sage2 : C.red2, this.hpFlash) : C.bone2;
    const lw = ui.text('HP', x + 9, ty + capT - capS, { font: 'small', color: C.dim, shadow: null });
    const nx = x + 9 + Math.ceil(lw) + 6;
    const nw = ui.text(String(shown), nx, ty, { font: 'title', color: numCol, shadow: C.ink });
    const mw = ui.text(`/ ${maxShown}`, nx + Math.ceil(nw) + 4, ty + capT - capS, { font: 'small', color: crit ? C.red2 : C.dim, shadow: null });
    if (s.soul && s.soul > 0) ui.text(`+${Math.round(s.soul * HP_PER)}`, nx + Math.ceil(nw) + 8 + Math.ceil(mw), ty + capT - capS, { font: 'small', color: C.steel2, shadow: null });
    // the deltas rise off the number and fade
    for (const d of this.hpDeltas) {
      const a = 1 - clamp01((d.t - 0.7) / 0.5), up = Math.round(easeOut(d.t * 1.5) * 8);
      ui.text((d.n > 0 ? '+' : '') + Math.round(d.n * HP_PER), nx + Math.ceil(nw) / 2, ty - 6 - up, { font: 'small', color: d.n > 0 ? C.sage2 : C.red2, shadow: C.ink, align: 'center', alpha: a });
    }
    // --- the heal count on the right: glyph, xN, the key
    if (nF > 0 && c) {
      const has = c.flasks > 0, eating = c.drinking > 0 && c.drinking < 1;
      let rx = x + W - 9;
      if (!PixelUI.touch) { const kw = ui.keycapW(HEAL_ITEM.key); ui.keycap(HEAL_ITEM.key, rx - kw, ty + Math.round((capT - 13) / 2), true, eating); rx -= kw + 6; }
      const cnt = String(Math.max(0, c.flasks));
      const cw = Math.ceil(ui.measure(cnt, 'body'));
      const bump = Math.round(Math.sin(this.healPop * Math.PI) * 2);
      ui.text(cnt, rx - cw, ty + capT - Math.round(ui.cap('body')) - bump, { font: 'body', color: has ? C.bone2 : C.red2, shadow: C.ink });
      rx -= cw + 3;
      const g = glyph('heal', eating ? C.gold2 : has ? C.gold : C.red);
      ui.img(g, rx - g.width, ty + capT - g.height - 1);
    }
    // --- the bars
    let by = ty + capT + 7;
    const bw = W - 18;
    const hpCol = units <= 0 ? C.red0 : crit ? lerpHex(C.red, C.red2, pulse * 0.6) : C.red;
    const tickN = Math.round(maxU * HP_PER / 10);
    this.meter(ui, x + 9, by, bw, 6, this.hpBar, hpCol, { chip: this.hpChip, chipCol: C.red2, gain: frac > this.hpBar + 0.002 ? frac : undefined, ticks: tickN, flash: this.hurtT > 0.7 ? (this.hurtT - 0.7) * 3 : 0 });
    by += 6;
    if (hasStam && c) {
      by += 2;
      const broken = c.guard === 'guardBroken' || (c.stamina <= 0 && Math.sin(this.t * 20) > 0);
      const col = broken ? C.red : this.stamFlash > 0.3 ? C.gold2 : c.guard === 'riposte' ? C.gold : '#b9b2a2';
      by += 1;
      this.meter(ui, x + 9, by, bw, 4, this.stamShown, col, { chip: this.stamChip });
      by += 4;
    }
    if (hasMana) { by += 3; this.meter(ui, x + 9, by, bw, 4, this.manaShown, C.steel, { chip: this.manaChip }); by += 4; }
    return { right: x + W, bottom: y + H };
  }

  // ---------------------------------------------------------------- the resources: pearls, keys, bombs, the pack
  private resources(ui: PixelUI, s: HudData, top: number) {
    const capB = Math.round(ui.cap('body'));
    const h = capB + 12, y = top;
    type Cell = { k: 'pearls' | 'keys' | 'bombs' | 'pack'; g: string; num: string; sub?: string; bad?: boolean };
    const cells: Cell[] = [
      { k: 'pearls', g: 'pearl', num: String(Math.max(0, s.pearls)) },
      { k: 'keys', g: 'key', num: String(Math.max(0, s.keys)) },
      { k: 'bombs', g: 'bomb', num: String(Math.max(0, s.bombs)) },
    ];
    const full = !!s.pack && (s.pack.full || s.pack.used >= s.pack.total);
    if (s.pack) cells.push({ k: 'pack', g: 'pack', num: String(s.pack.used), sub: `/${s.pack.total}`, bad: full });
    const ws = cells.map((c) => glyph(c.g, C.dim).width + 4 + Math.max(Math.ceil(ui.measure(c.num, 'body')), Math.ceil(ui.measure('00', 'body'))) + (c.sub ? Math.ceil(ui.measure(c.sub, 'small')) + 2 : 0));
    const W = ws.reduce((a, b) => a + b, 0) + (cells.length - 1) * 12 + 18;
    this.box(ui, M, y, W, h);
    let cx = M + 9;
    cells.forEach((c, i) => {
      const r = this.rolls[c.k];
      const g = glyph(c.g, c.bad ? C.red : r.flash > 0.3 ? C.gold : C.dim);
      ui.img(g, cx, y + Math.round((h - g.height) / 2));
      const nx = cx + g.width + 4, ny = y + Math.round((h - capB) / 2) - Math.round(Math.sin(this.pop[c.k] * Math.PI) * 2);
      const col = c.bad ? C.red2 : r.flash > 0 ? lerpHex(C.bone2, C.gold2, r.flash) : C.bone2;
      const nw = ui.text(c.num, nx, ny, { font: 'body', color: col, shadow: C.ink });
      if (c.sub) ui.text(c.sub, nx + Math.ceil(nw) + 2, ny + capB - Math.round(ui.cap('small')), { font: 'small', color: c.bad ? C.red2 : C.dim, shadow: null });
      if (c.bad && Math.sin(this.t * 5) > -0.3) ui.text('PACK FULL', M + W + 6, y + Math.round((h - ui.cap('small')) / 2), { font: 'small', color: C.red2, shadow: C.ink });
      for (const d of r.delta) {
        const a = 1 - clamp01((d.t - 0.6) / 0.5);
        ui.text((d.n > 0 ? '+' : '') + d.n, nx + 3, y + h + 2 + Math.round(d.t * 6), { font: 'small', color: d.n > 0 ? C.sage2 : C.red2, shadow: C.ink, align: 'center', alpha: a });
      }
      cx += ws[i] + 12;
    });
    return y + h;
  }

  // ---------------------------------------------------------------- top right: where you are (no map)
  private nav(ui: PixelUI, dt: number, s: HudData): number {
    const d = s.depth ?? null;
    const far = s.far ?? (s.strip as { far?: number } | null | undefined)?.far;
    const area = (s.area ?? s.place?.name ?? s.strip?.name ?? '').toUpperCase();
    const stage = s.stage ?? (s.place?.floors ? { floor: s.place.floor ?? 1, floors: s.place.floors } : null) ?? (s.strip ? { floor: s.strip.floor, floors: s.strip.floors } : null);
    const route = (s.place?.route ?? '').toUpperCase();
    if (!area && !d && far === undefined) return ui.w;
    const capB = Math.round(ui.cap('body')), capS = Math.round(ui.cap('small'));
    const rowH = capB + 6;
    const rows = (far !== undefined ? 1 : 0) + (d ? 1 : 0);
    // as wide as its widest row (the area + stage squares; a glyph, the number, the unit and the label)
    const zoneL = d ? ((d.zone ?? '').toUpperCase() ? (d.zone ?? '').toUpperCase() + ' ZONE' : 'DEPTH') : '';
    const rowW = (num: string, unit: string, label: string) => 7 + 6 + Math.ceil(ui.measure(num, 'body')) + 3 + Math.ceil(ui.measure(unit, 'small')) + 14 + Math.ceil(ui.measure(label, 'small'));
    const rw = Math.max(far !== undefined ? rowW(String(Math.round(Math.max(far, this.farShown))), 'M', 'FROM HOME') : 0, d ? rowW(String(Math.round(Math.max(d.m, this.depthShown))), 'M DEEP', zoneL) : 0);
    const W = Math.max(176, Math.min(260, Math.max(rw + 18, Math.ceil(ui.measure(area, 'body')) + 18 + (stage ? stage.floors * 8 + 8 : 0))));
    const H = 9 + (area ? capB + 9 : 0) + rows * rowH + 5;
    const x = ui.w - M - W, y = M;
    this.box(ui, x, y, W, H);
    let yy = y + 9;
    if (area) {
      ui.clip(x + 9, yy - 2, W - 18 - (stage ? stage.floors * 8 + 6 : 0), capB + 6);
      ui.text(area, x + 9, yy, { font: 'body', color: C.gold2, shadow: C.ink });
      ui.unclip();
      // the stage: one square per floor (done / here / to come)
      if (stage && stage.floors > 0) for (let i = 0; i < stage.floors; i++) {
        const sx = x + W - 9 - (stage.floors - i) * 8 + 3, sy = yy + Math.round((capB - 5) / 2);
        const done = i < stage.floor - 1, cur = i === stage.floor - 1;
        if (done) ui.fill(sx, sy, 5, 5, C.gold0);
        else if (cur) ui.fill(sx, sy, 5, 5, C.gold);
        else { ui.rect(sx, sy, 5, 5, C.line2); }
      }
      yy += capB + 4;
      ui.fill(x + 9, yy, W - 18, 1, C.line);
      yy += 5;
    }
    const row = (g: HTMLCanvasElement, num: string, unit: string, label: string, col: string) => {
      ui.img(g, x + 9, yy + Math.round((capB - g.height) / 2));
      const nw = ui.text(num, x + 9 + g.width + 6, yy, { font: 'body', color: col, shadow: C.ink });
      ui.text(unit, x + 9 + g.width + 6 + Math.ceil(nw) + 3, yy + capB - capS, { font: 'small', color: C.dim, shadow: null });
      ui.text(label, x + W - 9, yy + capB - capS, { font: 'small', color: C.dim, shadow: null, align: 'right' });
      yy += rowH;
    };
    if (far !== undefined) {
      this.farShown = this.farShown < 0 ? far : lerp(this.farShown, far, 1 - Math.exp(-dt * 4));
      row(glyph('house', C.dim), String(Math.round(this.farShown)), 'M', 'FROM HOME', C.bone2);
    }
    if (d) {
      this.depthShown = this.depthShown < 0 ? d.m : lerp(this.depthShown, d.m, 1 - Math.exp(-dt * 8));
      const zone = (d.zone ?? '').toUpperCase();
      row(glyph('down', d.descending ? C.steel : C.dim), String(Math.round(this.depthShown)), 'M DEEP', zone ? zone + ' ZONE' : 'DEPTH', d.descending ? C.steel2 : C.bone2);
    }
    if (route) ui.text('VIA ' + route, x + W - 2, y + H + 4, { font: 'small', color: C.dim, shadow: C.ink, align: 'right' });
    return x;
  }
  private farShown = -1; private depthShown = -1;

  // ---------------------------------------------------------------- bottom left: the skill slots
  private skills(ui: PixelUI, dt: number, sk: SkillHudState | null): number {
    if (!sk) return M;
    let right = M;
    sk.slots.forEach((sl, i) => {
      if (!sl) return;
      const x = M + i * (SS + SG), y = ui.h - M - SS;
      right = x + SS;
      const cd = sl.cdMax > 0 ? clamp01(sl.cd / sl.cdMax) : 0;
      const noMana = sl.mana > sk.mana;
      const sel = i === sk.sel;
      const pressed = !!ui.input?.down.has('Digit' + (i + 1));
      if (this.cdPrev[i] > 0 && cd <= 0) this.readyT[i] = 0;
      this.cdPrev[i] = cd;
      this.readyT[i] += dt;
      const ready = clamp01(1 - this.readyT[i] / 0.5);
      ui.fill(x + 1, y + 2, SS, SS, '#000000', 0.2);
      ui.fill(x, y, SS, SS, C.navy, 0.95);
      const it = skillItem(sl.id);
      if (it) ui.item(it.id, x + 3, y + 3, SS - 6, SS - 6, 1, cd > 0 || noMana ? 0.55 : 1);
      else ui.fill(x + 6, y + 6, SS - 12, SS - 12, sl.color);
      // the cooldown shade drains downward; the seconds over it
      if (cd > 0) {
        const sh = Math.round((SS - 2) * cd);
        ui.fill(x + 1, y + 1 + (SS - 2 - sh), SS - 2, sh, C.ink, 0.72);
        ui.text(String(Math.ceil(sl.cd)), x + SS / 2, y + Math.round((SS - ui.cap('body')) / 2), { font: 'body', color: C.bone2, shadow: C.ink, align: 'center' });
      } else if (noMana) {
        ui.fill(x + 1, y + 1, SS - 2, SS - 2, C.ink, 0.6);
        if (ui.measure('MANA', 'small') <= SS - 4) ui.text('MANA', x + SS / 2, y + Math.round((SS - ui.cap('small')) / 2), { font: 'small', color: C.steel2, shadow: C.ink, align: 'center' });
        ui.fill(x + 2, y + SS - 4, SS - 4, 2, C.steel);
      }
      const border = pressed ? C.bone2 : sel ? C.gold : ready > 0 ? lerpHex(C.line2, C.gold2, ready) : C.line2;
      ui.rect(x, y, SS, SS, border);
      if (sel) ui.fill(x + 4, y - 4, SS - 8, 1, C.gold);
      // the slot's key (not on a touch screen: its button says it)
      if (!PixelUI.touch) ui.text(String(i + 1), x + 3, y + 3, { font: 'small', color: sel ? C.gold2 : C.dim, shadow: C.ink });
    });
    return right;
  }

  // ---------------------------------------------------------------- bottom centre: the boss
  private bossBar(ui: PixelUI, b: BossBar | null, leftLimit: number) {
    if (!b) return;
    const fade = clamp01(this.bossIn * 3), rise = Math.round((1 - easeOut(this.bossIn * 1.5)) * 8);
    let BW = Math.max(180, Math.min(300, ui.w - 2 * 200));
    let cx = Math.round(ui.w / 2);
    if (cx - BW / 2 < leftLimit + 16) { BW = Math.max(120, Math.min(300, ui.w - leftLimit - 40)); cx = Math.round(Math.max(leftLimit + 16 + BW / 2, (leftLimit + ui.w) / 2)); }
    const shake = Math.round(Math.sin(this.t * 70) * this.bossShake * 1.5);
    const bx = Math.round(cx - BW / 2) + shake, by = ui.h - M - 8 + rise;
    const name = clean(b.name).toUpperCase();
    const capT = Math.round(ui.cap('title'));
    const ny = by - 6 - capT;
    ui.text(name, cx + shake, ny, { font: 'title', color: C.bone2, shadow: C.ink, align: 'center', alpha: fade });
    if (b.title) ui.text(clean(b.title).toUpperCase(), cx, ny - 4 - Math.round(ui.cap('small')), { font: 'small', color: C.dim, shadow: C.ink, align: 'center', alpha: fade });
    ui.fill(bx - 1, by - 1, BW + 2, 10, '#000000', 0.25 * fade);
    ui.fill(bx, by, BW, 8, C.ink, fade);
    ui.fill(bx + 1, by + 1, BW - 2, 6, C.well, fade);
    const iw = BW - 2, fv = Math.round(iw * this.bossShown), cw = Math.round(iw * this.bossChip);
    if (cw > fv) ui.fill(bx + 1 + fv, by + 1, cw - fv, 6, C.red2, 0.45 * fade);
    if (fv > 0) ui.fill(bx + 1, by + 1, fv, 6, C.red, fade);
    if (this.bossFlash > 0) ui.fill(bx + 1, by + 1, Math.max(1, fv), 6, '#ffffff', this.bossFlash * 0.4 * fade);
    // the phase thresholds: a notch at each, the poise as a thin gold line under the bar
    if (b.phases > 1) for (let i = 1; i < b.phases; i++) { const px = bx + 1 + Math.round(iw * (1 - i / b.phases)); ui.fill(px, by - 2, 1, 12, i < b.phase ? C.line2 : C.gold, fade); }
    if (b.poise > 0) ui.fill(bx + 1, by + 9, Math.round(iw * clamp01(b.poise)), 1, C.gold, fade);
    if (!this.bossLanded && this.bossIn > 0.3) { this.bossLanded = true; audio.play('thud_heavy1', { vol: 0.3, dry: true }); }
  }

  // ---------------------------------------------------------------- right: pickup cards, codex notes
  private pickups(ui: PixelUI, dt: number) {
    for (const c of this.picks) c.t += dt;
    this.picks = this.picks.filter((c) => c.t < c.life);
    let ty = Math.max(84, this.topGap[1] < ui.w ? 92 : 12);
    const capB = Math.round(ui.cap('body')), capS = Math.round(ui.cap('small'));
    for (const c of this.picks) {
      c.y = lerp(c.y, ty, 1 - Math.exp(-dt * 10));
      const maxW = Math.min(230, Math.round(ui.w * 0.36));
      let sub = c.sub;
      while (sub.length > 4 && ui.measure(sub, 'small') > maxW - 46) sub = sub.slice(0, -2).trimEnd();
      if (sub !== c.sub) sub = sub.replace(/[ .,]*$/, '') + '...';
      const cw = Math.round(Math.max(150, Math.min(maxW, Math.max(ui.measure(c.title, 'body'), ui.measure(c.kind, 'small'), ui.measure(sub, 'small')) + 50)));
      const ch = 9 + capB + 4 + capS + (sub ? 4 + capS : 0) + 8;
      const inK = easeOut(c.t * 4), outK = clamp01((c.t - c.life + 0.35) / 0.35);
      const x = Math.round(ui.w - M - cw + (1 - inK) * 16 + outK * 16), y = Math.round(c.y);
      const a = Math.min(inK, 1 - outK);
      this.box(ui, x, y, cw, ch, a);
      ui.fill(x + 1, y + 1, 2, ch - 2, c.color, a);
      // the icon in a slot
      const sz = 28, ix = x + 8, iy = y + Math.round((ch - sz) / 2);
      ui.frame('slot', ix, iy, sz, sz, a);
      if (ITEMS[c.id]) ui.item(c.id, ix + 2, iy + 2, sz - 4, sz - 4, 1, a);
      const tx = ix + sz + 8;
      let yy = y + 9;
      ui.text(c.title, tx, yy, { font: 'body', color: C.bone2, shadow: C.ink, alpha: a }); yy += capB + 4;
      if (c.kind) ui.text(c.kind, tx, yy, { font: 'small', color: lerpHex(c.color, C.bone, 0.25), shadow: null, alpha: a });
      yy += capS + 4;
      if (sub) ui.text(sub, tx, yy, { font: 'small', color: C.dim, shadow: null, alpha: a });
      ty += ch + G;
    }
    this.codexNotes(ui, dt, ty);
  }
  private codexNotes(ui: PixelUI, dt: number, ty: number) {
    const n = this.notes[0];
    if (!n) return;
    n.t += dt;
    const life = this.notes.length > 1 ? 2.2 : 3;
    if (n.t >= life) { this.notes.shift(); return; }
    if (n.y < 0) n.y = ty;
    n.y = lerp(n.y, ty, 1 - Math.exp(-dt * 10));
    const head = 'NEW IN THE CODEX';
    const capB = Math.round(ui.cap('body')), capS = Math.round(ui.cap('small'));
    const cw = Math.round(Math.max(150, Math.max(ui.measure(n.name, 'body'), ui.measure(head, 'small') + 12) + 22)), ch = 9 + capS + 5 + capB + 9;
    const inK = easeOut(n.t * 4), outK = clamp01((n.t - life + 0.35) / 0.35);
    const x = Math.round(ui.w - M - cw + (1 - inK) * 16 + outK * 16), y = Math.round(n.y), a = Math.min(inK, 1 - outK);
    this.box(ui, x, y, cw, ch, a);
    const g = glyph('book', C.gold);
    ui.img(g, x + 9, y + 9 + Math.round((capS - g.height) / 2), { alpha: a });
    ui.text(head, x + 9 + g.width + 5, y + 9, { font: 'small', color: C.gold, shadow: null, alpha: a });
    ui.text(n.name, x + 9, y + 9 + capS + 5, { font: 'body', color: C.bone2, shadow: C.ink, alpha: a });
  }

  // ---------------------------------------------------------------- title toasts, banners, the floor's area card
  private toastsDraw(ui: PixelUI, dt: number, hidden: boolean) {
    for (const c of this.toasts) c.t += dt;
    this.toasts = this.toasts.filter((c) => c.t < c.life);
    const capBig = Math.round(ui.cap('big')), capB = Math.round(ui.cap('body')), capS = Math.round(ui.cap('small'));
    for (const c of this.toasts) {
      const outK = clamp01((c.t - c.life + 0.45) / 0.45);
      if (c.area) {
        // the area's name between two gold rules, letters arriving one by one (a 3 px rise + fade), the sub under it
        const cy = Math.round(Math.max(ui.h * 0.28, 104));
        const tw = Math.ceil(ui.measure(c.title, 'big'));
        let lx = Math.round(ui.w / 2 - tw / 2);
        [...c.title].forEach((ch, i) => {
          const k = clamp01((c.t - 0.15 - i * 0.035) * 5);
          const w = ui.measure(ch, 'big');
          if (k > 0 && ch !== ' ') ui.text(ch, lx, cy - Math.round((1 - easeOut(k)) * 3) - outK * 4, { font: 'big', color: c.color, shadow: C.ink, alpha: k * (1 - outK) });
          lx += w;
        });
        const ra = clamp01((c.t - 0.3) * 3) * (1 - outK), rl = Math.round(Math.min(60, (ui.w - tw) / 2 - 24) * easeOut((c.t - 0.3) * 2));
        const ry = cy + Math.round(capBig / 2);
        if (rl > 0) {
          ui.fill(Math.round(ui.w / 2 - tw / 2 - 14 - rl), ry, rl, 1, C.gold, ra); ui.fill(Math.round(ui.w / 2 - tw / 2 - 16), ry - 1, 2, 3, C.gold, ra);
          ui.fill(Math.round(ui.w / 2 + tw / 2 + 14), ry, rl, 1, C.gold, ra); ui.fill(Math.round(ui.w / 2 + tw / 2 + 14), ry - 1, 2, 3, C.gold, ra);
        }
        const sa = clamp01((c.t - 0.6) * 3) * (1 - outK);
        if (c.sub && sa > 0) ui.text(c.sub, ui.w / 2, cy + capBig + 10, { font: 'small', color: C.bone, shadow: C.ink, align: 'center', alpha: sa });
        continue;
      }
      if (c.banner) {
        // the word between two thin rules; lower when the floor's area card is still up, so they never stack
        const cy = Math.round(ui.h * (this.toasts.some((q) => q.area) ? 0.5 : 0.36));
        if (c.t > 0.12 && !c.landed) { c.landed = true; audio.play('thud_heavy1', { vol: c.banner === 'danger' ? 0.35 : 0.2, dry: true }); }
        const a = clamp01(c.t * 6) * (1 - outK);
        const drop = Math.round((1 - easeOut(c.t * 5)) * -6) - Math.round(outK * 6);
        const tw = Math.ceil(ui.measure(c.title, 'big'));
        const rw = tw + 64, rx = Math.round(ui.w / 2 - rw / 2);
        const col = c.banner === 'danger' ? C.red : C.gold;
        ui.fill(rx - 8, cy - 10 + drop, rw + 16, capBig + 20, C.ink, 0.45 * a);
        ui.fill(rx, cy - 8 + drop, rw, 1, col, a); ui.fill(rx, cy + capBig + 8 + drop, rw, 1, col, a);
        ui.text(c.title, ui.w / 2, cy + drop, { font: 'big', color: c.color, shadow: C.ink, align: 'center', alpha: a });
        const sa = clamp01((c.t - 0.3) * 4) * (1 - outK);
        if (c.sub && sa > 0) ui.text(c.sub, ui.w / 2, cy + capBig + 16 + drop, { font: 'small', color: C.bone, shadow: C.ink, align: 'center', alpha: sa });
        continue;
      }
      // the toast: a small panel drops in at the top centre
      const inK = easeOut(c.t * 5);
      const tw = Math.ceil(ui.measure(c.title, 'body')), sw = c.sub ? Math.ceil(ui.measure(c.sub, 'small')) : 0;
      const rw = Math.max(tw, sw) + 28, rh = 9 + capB + (c.sub ? 5 + capS : 0) + 8;
      const [gl, gr] = this.topGap, fits = hidden || (ui.w / 2 - rw / 2 > gl + 6 && ui.w / 2 + rw / 2 < gr - 6);
      const x = Math.round(ui.w / 2 - rw / 2), y = Math.round((hidden ? 14 : fits ? M : 110) - (1 - inK) * 8 - outK * 8);
      const a = clamp01(c.t * 5) * (1 - outK);
      this.box(ui, x, y, rw, rh, a);
      ui.fill(x + Math.round(rw / 2) - 6, y, 12, 1, C.gold, a);
      ui.text(c.title, ui.w / 2, y + 9, { font: 'body', color: c.color, shadow: C.ink, align: 'center', alpha: a });
      if (c.sub) ui.text(c.sub, ui.w / 2, y + 9 + capB + 5, { font: 'small', color: C.dim, shadow: null, align: 'center', alpha: a });
    }
  }
}

/** a dark vignette (UI px): the deep closing in from the edges in five stepped bands, clear in the middle */
const vigCache = new Map<string, HTMLCanvasElement>();
function vignette(w: number, h: number): HTMLCanvasElement {
  const key = `${w}|${h}`;
  let c = vigCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!, img = x.createImageData(w, h), D = img.data;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const dx = (px - w / 2) / (w * 0.62), dy = (py - h / 2) / (h * 0.66), d = Math.hypot(dx, dy);
    const band = Math.max(0, Math.min(5, Math.floor((d - 0.38) * 14)));
    const i = (py * w + px) * 4; D[i] = 6; D[i + 1] = 9; D[i + 2] = 16; D[i + 3] = [0, 60, 110, 160, 205, 240][band];
  }
  x.putImageData(img, 0, 0);
  vigCache.set(key, c);
  if (vigCache.size > 6) vigCache.clear();
  return c;
}
function lerpHex(a: string, b: string, t: number) {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return '#' + A.lerp(B, clamp01(t)).getHexString();
}

