// Run critters (v8): hermit crabs and sea slugs living along each floor, with gimmicks of their own.
//
//   HERMIT CRABS   (src/fish/hermit.ts: whelk, moon snail, bottle cap, sardine tin, teacup, skull) potter about on
//                  the seabed. Swim at one fast (a dash, or full speed right up to it) and it slams into its shell
//                  and stays shut until you calm down. Ease up slowly (or let go of the stick) and E / USE trades:
//                  pearls, a small chest, a recipe scroll (teaches a workbench recipe: src/hideout/recipes.ts), a
//                  pearl pouch or a material. Each wants something (a wish: SEA GLASS, CORK...): OFFER it from your
//                  pack and it gives its best (a scroll first), and even a shut crab comes out for one.
//   SHELL SWAP     sometimes three hermits queue by size next to an empty, bigger shell (a vacancy chain). Hang back
//                  and watch: the biggest moves into the new shell, the next into the one it left, and so on down;
//                  the smallest leaves a SPARE SHELL behind for you (+ pearls). Dash in and they all hide.
//   GIANT HERMIT   rare: a huge red hermit in a knobbed triton with barnacles and an anemone. Approach slowly and
//                  it gives you the GIANT HERMIT SHELL it is about to outgrow.
//   SEA SLUGS      (src/fish/nudibranch.ts) Spanish dancer: toxic, stings on contact and flees by swimming (it
//                  ripples its skirt); glow dorid: toxic to bump into, touch it gently (E) for GLOW (a big lantern
//                  light in the dark); sea bunny: pet it (E) for HOP (speed); lettuce slug: nibble it (E) for REGEN;
//                  blue dragon: drifts mid-water and hunts jellyfish, eating them steals their stingers (it glows
//                  brighter) and E takes them: a STING AURA that zaps fish round you. Fish that bite a toxic slug
//                  are poisoned. Crawling slugs leave a slime trail: swim low along it for a SLIPSTREAM (speed).
//   ITEMS          the v8 items' run effects live here too: shell armour tucks in, slug-ink bombs, the pearl
//                  pouch, the sea bunny charm, the nudibranch bait, and reading a recipe scroll.
//
//   const crit = new Critters(host);  crit.build()  (after the level)   each frame: const prompt = crit.update(dt)
//   crit.glowK (0..1, the dungeon brightens the lantern)   crit.dispose()
import * as THREE from 'three';
import type { World, Entity, Team, DamageKind } from '../game/types';
import type { Run } from '../game/run';
import type { Blobfish } from '../player/blobfish';
import { Creature, sfx, SND } from '../creatures/base';
import { buildFish } from '../fish';
import { hermitShellOnly, SHELL_SPECIES, type ShellKind } from '../fish/hermit';
import { Rng } from '../core/rng';
import { clamp, damp } from '../core/math';
import { ITEMS, getItem } from '../game/items';
import { baseOf } from './biomes';
import { isFishKind, type Reward } from './rewards';
import { unknownScrollRecipes, learnRecipe } from '../hideout/recipes';
import { registerCodex } from '../ui/codex';
import type { LevelPlan } from './level';
import type { Prompt, HudAnchor } from './hud';

export type SlugKind = 'spanish_dancer' | 'blue_dragon' | 'sea_bunny' | 'lettuce_slug' | 'glow_dorid';
/** a critter in the floor plan (saved with it): done = traded / eaten / swapped */
export interface CritterPlan { id: number; kind: 'hermit' | 'giant' | 'swap' | 'slug'; x: number; shell?: ShellKind; shells?: ShellKind[]; slug?: SlugKind; wish?: string; done: boolean }

export interface CritterHost {
  world: World & { spawnPickup(kind: 'pearl' | 'item', x: number, y: number, o?: { value?: number; id?: string; vx?: number; vy?: number }): Entity; on(ev: string, fn: (d: Record<string, unknown>) => void): void; off(ev: string, fn: (d: Record<string, unknown>) => void): void };
  plan: LevelPlan;
  run: Run;
  player: Blobfish;
  floorUnder(x: number, fromY: number): number;
  anchor(x: number, y: number, z?: number): HudAnchor;
  rewards(r: Reward[], x: number, y: number, stagger?: boolean): void;
  dropChest(x: number, y: number): void;
  /** a line from the hermit speaker (anchored over `who`) */
  say(who: { x: number; y: number; h: number }, text: string, life?: number): void;
  /** the depth's pearl multiplier */
  pearls(y: number): number;
  /** an arena fight is on (no trading mid-brawl) */
  fighting(): boolean;
  title(name: string, sub: string, col?: string): void;
  hint(text: string, life?: number, key?: string): void;
  /** the pack changed: restat */
  refresh(): void;
  save(): void;
}

const R = (a: number, b: number) => a + Math.random() * (b - a);
const WISHES = ['seaGlass', 'seashell', 'cork', 'coralShard', 'kelp', 'driftwood', 'rustyNail', 'lineScrap', 'copperOre', 'pearl'];
const SHELLS_FOR: Record<string, ShellKind[]> = {
  reef: ['whelk', 'moon', 'teacup', 'cap'], kelp: ['whelk', 'moon', 'tin', 'teacup'], graveyard: ['skull', 'tin', 'cap', 'whelk'],
  arctic: ['moon', 'whelk', 'cap', 'tin'], abyss: ['skull', 'moon', 'tin', 'whelk'],
};
const SLUGS_FOR: Record<string, SlugKind[]> = {
  reef: ['sea_bunny', 'lettuce_slug', 'spanish_dancer', 'glow_dorid', 'blue_dragon'], kelp: ['lettuce_slug', 'sea_bunny', 'glow_dorid', 'spanish_dancer', 'blue_dragon'],
  graveyard: ['glow_dorid', 'spanish_dancer', 'sea_bunny', 'lettuce_slug'], arctic: ['blue_dragon', 'glow_dorid', 'sea_bunny', 'spanish_dancer'],
  abyss: ['glow_dorid', 'blue_dragon', 'spanish_dancer', 'glow_dorid'],
};
const SLUG_SCALE: Record<SlugKind, number> = { spanish_dancer: 3.2, blue_dragon: 3.6, sea_bunny: 5.0, lettuce_slug: 3.9, glow_dorid: 4.1 };
/** critters live just in front of the gameplay plane, in the clear strip between the seabed meadow and the foreground
 *  tufts (src/area/scenery.ts bands), so the grass never hides them (and behind the front cut at z = 3: past it things
 *  sit outside the water) */
export const CRIT_Z = 2.4;
const SLUG_NAME: Record<SlugKind, string> = { spanish_dancer: 'SPANISH DANCER', blue_dragon: 'BLUE DRAGON', sea_bunny: 'SEA BUNNY', lettuce_slug: 'LETTUCE SLUG', glow_dorid: 'GLOW DORID' };
const TOXIC: Record<SlugKind, boolean> = { spanish_dancer: true, blue_dragon: false, sea_bunny: false, lettuce_slug: false, glow_dorid: true };
const TRAIL_COL: Record<SlugKind, string> = { spanish_dancer: '#ff8a9a', blue_dragon: '#9ad0ff', sea_bunny: '#fff2b0', lettuce_slug: '#c8ff9a', glow_dorid: '#9afff0' };

const TRADE_LINES = ['Slow fins, kind fins. Here, take this.', "Found it in a wreck. Doesn't fit me.", 'Shiny for you, shell for me. Deal.', "Psst. Don't tell the big crab.", 'You swim gently. I like you.', "My cousin wrote this down. I can't read."];
const OFFER_LINES = ['Oooh, {w}! Take my best thing!', 'For {w}? Anything. Here!', '{w}! I have wanted one all my life!'];
const ASK_LINES = ['Got any {w}? I collect it.', 'Psst. {w}. Got any?', "I'd trade my shell for {w}. Not really. But nearly."];
const wname = (id: string) => (ITEMS[id]?.name ?? id).toUpperCase();

// ================================================================================================ plan
/** the critters of a floor (seeded by the plan; placed in quiet stretches away from arenas and the stops) */
export function planCritters(plan: LevelPlan): CritterPlan[] {
  const rng = new Rng((plan.seed ^ 0x5eaf00d) >>> 0);
  const base = baseOf(plan.area);
  const x0 = plan.startX + 12, x1 = plan.bossX0 - 10;
  const bad = (x: number) => x < x0 || x > x1 || plan.arenas.some((a) => x > a.x0 - 7 && x < a.x1 + 7) || plan.pois.some((p) => p.kind !== 'start' && Math.abs(p.x - x) < 8)
    || plan.forks.some((f) => f.kind !== 'end' && f.lanes.some((l) => l.side === 'lower' && x > l.x0 - 2 && x < l.x1 + 2)) || plan.exits.some((e) => x > e.x0 - 4 && x < e.x1 + 4)
    // (boulders, ledges and lids stand in front of the critters' strip: keep clear of them)
    || plan.solids.some((b) => b.kind !== 'wall' && x > b.x0 - 2.5 && x < b.x1 + 2.5);
  const used: [number, number][] = [];
  /** a spot in [lo, hi] whose whole span (x +- half) is clear */
  const place = (lo: number, hi: number, half = 1.5): number | null => {
    for (let k = 0; k < 18; k++) {
      const x = rng.range(lo, hi);
      let ok = used.every(([u, h]) => Math.abs(u - x) > h + half + 4);
      for (let q = -half; ok && q <= half; q += 1) if (bad(x + q)) ok = false;
      if (ok) { used.push([x, half]); return x; }
    }
    return null;
  };
  const out: CritterPlan[] = [];
  let id = 0;
  const shells = SHELLS_FOR[base] ?? SHELLS_FOR.reef, slugs = SLUGS_FOR[base] ?? SLUGS_FOR.reef;
  // a hermit close to the start, so every floor introduces one early; then a spread along the floor
  const nH = 3 + rng.int(0, 1), nS = 4 + rng.int(0, 2);
  const span = Math.max(20, x1 - x0);
  // the big set pieces first (they need room): a shell-swap queue, a rare giant
  if (rng.chance(0.5)) {
    const x = place(x0 + span * 0.2, x0 + span * 0.85, 6);
    if (x !== null) { const ks = [...shells].sort(() => rng.next() - 0.5); out.push({ id: id++, kind: 'swap', x, shells: [ks[0], ks[1 % ks.length], ks[2 % ks.length], rng.pick(['moon', 'whelk'] as ShellKind[])], done: false }); }
  }
  if (rng.chance(0.14 + plan.n * 0.04)) {
    const x = place(x0 + span * 0.3, x1, 3);
    if (x !== null) out.push({ id: id++, kind: 'giant', x, shell: 'giant', done: false });
  }
  const hOff = rng.int(0, shells.length - 1);
  for (let i = 0; i < nH; i++) {
    const x = i === 0 ? place(x0 + 2, x0 + 14) : place(x0 + (span * i) / nH, x0 + (span * (i + 1)) / nH);
    if (x !== null) out.push({ id: id++, kind: 'hermit', x, shell: shells[(i + hOff) % shells.length], wish: rng.pick(WISHES), done: false });
  }
  const off = rng.int(0, slugs.length - 1);
  for (let i = 0; i < nS; i++) {
    const x = i === 0 ? place(x0 + 8, x0 + 26) : place(x0 + (span * i) / nS, x0 + (span * (i + 1)) / nS);
    if (x !== null) out.push({ id: id++, kind: 'slug', x, slug: slugs[(i + off) % slugs.length], done: false });
  }
  return out;
}

// ================================================================================================ the hermit crab
type HState = 'wander' | 'hide' | 'idle' | 'naked' | 'walkTo' | 'settle';
export class RunHermit extends Creature {
  codexPage: string;
  state: HState = 'wander';
  hideK = 0; nakedK = 0;
  /** seconds the blobfish has been calm round it (it comes back out) */
  calm = 0;
  scared = 0;
  homeX: number;
  shell: ShellKind;
  size: number;
  /** the swap event drives it (the controller sets the target) */
  target: number | null = null;
  private wT = R(0.5, 2); private wDir = 0;
  asked = false;
  constructor(x: number, y: number, shell: ShellKind, size: number, public plan: CritterPlan | null, public giant = false) {
    super(giant ? 'giantHermit' : 'hermitCrab', SHELL_SPECIES[shell], x, y, { team: 'neutral', hp: 99, scale: size, speed: giant ? 0.7 : 1.1, r: 0.16 * size, coins: [0, 0] });
    this.homeX = x; this.shell = shell; this.size = size;
    this.codexPage = giant ? 'giant_hermit' : 'hermit_crab';
    this.avoidTerrain = false;
    this.pivot.position.z = giant ? CRIT_Z - 0.6 : CRIT_Z;
  }
  /** the top of the shell (for words) */
  get h() { return this.size * 0.2; }
  /** swap into another shell (rebuild the model) */
  setShell(kind: ShellKind, size: number) {
    this.pivot.remove(this.model.group);
    this.model.dispose();
    this.model = buildFish(SHELL_SPECIES[kind], (Math.random() * 1000) | 0);
    this.model.group.scale.setScalar(size);
    this.pivot.add(this.model.group);
    this.shell = kind; this.size = size; this.baseScale = size; this.r = 0.16 * size;
  }
  /** something scary happened: shut the door */
  scare(w: World, k = 2.5) {
    if (this.state === 'naked' || this.state === 'walkTo') return;
    if (this.state !== 'hide') {
      sfx(w, ['clank1', 'crab_click1'], this.x, 0.5, 1.4 - this.size * 0.05);
      w.fx.emit('silt', this.x, this.y - 0.05, { n: 6, spread: 0.3 * this.size / 2, speed: 0.6, life: 1, size: 0.3, size1: 0.7, alpha: 0.5, drag: 2 });
      if (Math.random() < 0.6) w.text.pop(Math.random() < 0.5 ? '!' : 'EEP!', this.x, this.y + this.h + 0.3, 'shout', { size: 0.24, life: 0.8 });
      if (this.giant) w.game.addShake(0.15);
    }
    this.state = 'hide'; this.scared = Math.max(this.scared, k); this.calm = 0;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x;
    const T = w.terrain as World['terrain'] & { floorUnder?: (x: number, y: number) => number };
    const fl = T.floorUnder ? T.floorUnder(this.x, this.y + 1) : T.floorAt(this.x);
    const legY = fl + 0.06 * this.size;
    const anim = this.model.anim;
    const d = Math.hypot(dx, p.y - this.y), spd = Math.hypot(p.vx, p.vy);
    // the blobfish rushing at it (a dash anywhere near, or full speed right up to it)
    const near = d < 2.2 + this.size * 0.35;
    const threat = p.alive && ((spd > 6.2 && d < 5.5 + this.size * 0.3) || (spd > 4.3 && near && (dx * p.vx + (p.y - this.y) * p.vy) < 0));
    if (threat && this.state !== 'naked' && this.state !== 'walkTo') this.scare(w);
    this.scared -= dt;
    if (this.state === 'hide') {
      this.calm = spd < 2.8 || d > 7 ? this.calm + dt : 0;
      if (this.scared <= 0 && this.calm > 1.1) { this.state = 'wander'; sfx(w, SND.click, this.x, 0.35, 1.3); }
    }
    this.hideK = damp(this.hideK, this.state === 'hide' ? 1 : 0, this.state === 'hide' ? 16 : 3, dt);
    this.nakedK = damp(this.nakedK, this.state === 'naked' || this.state === 'walkTo' ? 1 : 0, 7, dt);
    anim.hide = this.hideK; anim.naked = this.nakedK;
    let vx = 0;
    switch (this.state) {
      case 'wander': {
        // potter back and forth round home, stopping to pick at the sand; turn to watch the blobfish when it's close
        this.wT -= dt;
        if (this.wT <= 0) { this.wT = R(1.2, 3.2); this.wDir = Math.random() < 0.4 ? 0 : (this.x > this.homeX + 1.5 ? -1 : this.x < this.homeX - 1.5 ? 1 : Math.random() < 0.5 ? -1 : 1); }
        vx = d < 3.5 ? 0 : this.wDir * this.speedMax * 0.6;
        anim.pinch = Math.max(0, Math.sin(this.t * 3)) > 0.95 ? 1 : 0;
        break;
      }
      case 'idle': anim.pinch = 0; break;
      case 'walkTo': case 'settle': {
        if (this.target !== null) { const tx = this.target - this.x; vx = Math.abs(tx) > 0.08 ? Math.sign(tx) * this.speedMax * 0.9 : 0; }
        break;
      }
      default: break;
    }
    if (this.state === 'hide' || this.state === 'naked') vx = 0;
    // a wall or a drop ahead: turn back
    if (vx && (T.sdf(this.x + Math.sign(vx) * 0.5, legY + 0.3) < 0.1 || Math.abs((T.floorUnder ? T.floorUnder(this.x + Math.sign(vx) * 0.6, this.y + 1) : fl) - fl) > 0.5)) { vx = 0; this.wDir = -this.wDir; }
    this.vx = damp(this.vx, vx, 6, dt);
    this.x += this.vx * dt;
    this.y = damp(this.y, legY, 10, dt);
    anim.walk = this.vx / Math.max(0.5, this.size * 0.4);
    if (this.state !== 'hide') this.faceToward(this.state === 'walkTo' ? (this.target ?? this.x) - this.x : Math.abs(this.vx) > 0.05 ? this.vx : d < 6 ? dx : this.facing, dt, 5);
    if (this.state !== 'hide') this.lookAtWorld(p.x, p.y);
    this.pose(dt, 0, false);
    // a hidden shell rocks once, then sits like a stone
    this.obj.position.y = this.y + (this.state === 'hide' ? Math.max(0, Math.sin(Math.min(1, this.hideK) * Math.PI)) * 0.02 * this.size : 0);
  }
  hit(_d: number, dx: number, _dy: number, w: World, _s: Entity | null, _k?: DamageKind): boolean {
    this.model.flash(0.5); this.squashV += 5; this.vx += dx * 0.5;
    this.scare(w, 4);
    return false;
  }
}

// ================================================================================================ an empty shell
class ShellProp implements Entity {
  kind = 'emptyShell'; team: Team = 'neutral'; vx = 0; vy = 0; r = 0.2; alive = true;
  obj = new THREE.Group();
  m: ReturnType<typeof buildFish>;
  private t = Math.random() * 5;
  constructor(public x: number, public y: number, public shell: ShellKind, public size: number, facing: number) {
    this.m = buildFish(SHELL_SPECIES[shell], 7);
    hermitShellOnly(this.m);
    this.m.group.scale.setScalar(size);
    this.m.setFlip(facing < 0);
    this.obj.add(this.m.group);
    this.obj.position.set(x, y, CRIT_Z);
  }
  update(dt: number) { this.t += dt; this.m.update(dt, 0, 0); this.obj.position.set(this.x, this.y + Math.sin(this.t * 1.2) * 0.004, CRIT_Z); }
  dispose() { this.m.dispose(); }
}

// ================================================================================================ sea slugs
export class RunSlug extends Creature {
  codexPage: string;
  sp: SlugKind;
  homeX: number; homeY: number;
  /** blue dragon: stolen stingers (glows) */
  charged: boolean;
  /** pet / touched already (one buff per slug) */
  used = false;
  swimT = 0;
  private wT = R(1, 3); private wDir = Math.random() < 0.5 ? -1 : 1;
  private prey: Entity | null = null; private eatT = 0;
  constructor(x: number, y: number, sp: SlugKind, public plan: CritterPlan) {
    super('seaSlug', sp, x, y, { team: 'neutral', hp: 99, scale: SLUG_SCALE[sp], speed: sp === 'blue_dragon' ? 1.2 : sp === 'spanish_dancer' ? 0.5 : 0.3, coins: [0, 0] });
    this.sp = sp; this.codexPage = sp; this.homeX = x; this.homeY = y;
    this.avoidTerrain = sp === 'blue_dragon';
    this.charged = sp === 'blue_dragon' && Math.random() < 0.5;
    this.pivot.position.z = CRIT_Z;
  }
  get h() { return this.L * 0.35; }
  get toxic() { return TOXIC[this.sp] || (this.sp === 'blue_dragon' && this.charged); }
  get crawling() { return this.sp !== 'blue_dragon' && this.swimT <= 0; }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, d = Math.hypot(dx, p.y - this.y), spd = Math.hypot(p.vx, p.vy);
    const T = w.terrain as World['terrain'] & { floorUnder?: (x: number, y: number) => number };
    const fl = T.floorUnder ? T.floorUnder(this.x, this.y + 1.5) : T.floorAt(this.x);
    if (this.sp === 'blue_dragon') this.drift(dt, w, fl);
    else if (this.swimT > 0) {
      // the Spanish dancer swims: big skirt ripples, rising away from the threat, then settles back down
      this.swimT -= dt;
      const away = Math.sign(this.x - p.x) || 1;
      this.steer(away * 1.4, this.swimT > 1.2 ? 1.1 : -0.6, 2.2, dt);
      this.integrate(dt, 0.8);
      this.avoid(w, dt);
      if (this.y < fl + 0.02) { this.y = fl + 0.02; this.vy = Math.max(0, this.vy); }
      this.faceToward(this.vx, dt, 3);
    } else {
      // crawl: slow along the floor, pausing; turn at walls, drops and home's edge
      this.wT -= dt;
      if (this.wT <= 0) { this.wT = R(2, 5); if (Math.random() < 0.35) this.wDir = -this.wDir; }
      let vx = this.wT > 1 ? this.wDir * this.speedMax : 0;
      if (Math.abs(this.x + vx - this.homeX) > 3.5 && Math.sign(this.x - this.homeX) === Math.sign(vx)) { this.wDir = -this.wDir; vx = 0; }
      const ahead = T.floorUnder ? T.floorUnder(this.x + this.wDir * 0.5, this.y + 1.5) : fl;
      if (T.sdf(this.x + this.wDir * 0.4, fl + 0.2) < 0.05 || Math.abs(ahead - fl) > 0.45) { this.wDir = -this.wDir; vx = 0; }
      this.vx = damp(this.vx, vx, 3, dt); this.vy = 0;
      this.x += this.vx * dt;
      this.y = damp(this.y, fl + 0.01, 8, dt);
      if (Math.abs(this.vx) > 0.02) this.faceToward(this.vx, dt, 2);
      if (this.sp === 'spanish_dancer' && p.alive && spd > 4.8 && d < 4.5) { this.swimT = 3.2; this.vy = 1.5; sfx(w, SND.swish, this.x, 0.4, 0.7); w.text.pop('SWISH!', this.x, this.y + 0.6, 'danger', { size: 0.22, life: 0.8 }); }
    }
    // contact: toxic ones sting a blobfish that bumps into them
    if (this.toxic && p.alive && this.hitCd <= 0 && d < this.L * 0.45 + p.r && (spd > 2.4 || this.sp === 'spanish_dancer')) {
      this.hitCd = 1.4;
      w.hurtPlayer(this.sp === 'blue_dragon' ? 0.5 : 0.5, this.x, this.y, 'spike');
      w.fx.poison(p.x, p.y, 8);
      w.text.pop('STING!', p.x, p.y + 0.9, 'danger', { size: 0.26, life: 0.8 });
    }
    // swim speed for the ripple: crawling ripples slowly, swimming flaps the skirt
    const sp = this.swimT > 0 ? this.L * 4 : Math.abs(this.vx) * 3 + this.L * 0.4;
    this.pose(dt, sp, this.swimT > 0 || this.sp === 'blue_dragon');
    // the blue dragon's stolen stingers glow in its cerata
    if (this.sp === 'blue_dragon') { this.model.material.emissiveIntensity = damp(this.model.material.emissiveIntensity, this.charged ? 2.2 + Math.sin(this.t * 4) * 0.4 : 0.25, 3, dt); if (this.charged && Math.random() < dt * 3) w.fx.emit('glow', this.x + R(-0.3, 0.3), this.y + R(-0.1, 0.2), { n: 1, size: 0.35, life: 0.5, color: '#6ab4ff', alpha: 0.6 }); }
    if (this.sp === 'glow_dorid' && Math.random() < dt * 1.5) w.fx.emit('glow', this.x + R(-0.25, 0.25), this.y + 0.1, { n: 1, size: 0.3, life: 0.6, color: '#40e8d8', alpha: 0.5 });
  }
  /** the blue dragon: drifts mid-water, bobbing; hunts the nearest jellyfish and eats it (stealing its stingers) */
  private drift(dt: number, w: World, fl: number) {
    if (!this.prey || !this.prey.alive || (this.prey.hp ?? 1) <= 0) {
      this.prey = null;
      for (const e of w.near(this.x, this.y, 7, 'enemy')) if (e.kind === 'jelly' && (e.hp ?? 1) > 0) { this.prey = e; break; }
    }
    const prey = this.prey;
    if (prey) {
      this.seek(prey.x, prey.y, 1.8, 2, dt, 0.3);
      if (Math.hypot(prey.x - this.x, prey.y - this.y) < prey.r + 0.4) {
        this.eatT -= dt;
        if (this.eatT <= 0) {
          this.eatT = 0.45;
          prey.hit?.(1.2, Math.sign(prey.x - this.x), 0.2, w, this, 'zap');
          w.fx.zaps(prey.x, prey.y, 2);
          if (!prey.alive || (prey.hp ?? 1) <= 0) {
            this.charged = true; this.prey = null;
            w.text.pop('STINGERS STOLEN!', this.x, this.y + 0.7, 'magic', { size: 0.24, life: 1.4 });
            sfx(w, ['shimmer1', 'magic1'], this.x, 0.6, 1.2);
          }
        }
      }
    } else {
      const ty = Math.max(fl + 2.2, this.homeY) + Math.sin(this.t * 0.5) * 0.6;
      this.seek(this.homeX + Math.sin(this.t * 0.17) * 3, ty, 0.6, 0.8, dt, 1);
    }
    this.integrate(dt, 0.6);
    this.avoid(w, dt);
    this.faceToward(this.vx, dt, 2);
  }
  hit(_d: number, dx: number, dy: number, w: World): boolean {
    this.vx += dx * 0.8; this.vy += dy * 0.8; this.model.flash(0.4); this.squashV += 4;
    if (this.sp === 'spanish_dancer' && this.swimT <= 0) { this.swimT = 3; this.vy = 1.4; }
    void w;
    return false;
  }
}

// ================================================================================================ poison + ink cloud
/** poison on an enemy: ticks of damage (and a green puff), fish only */
class Poison implements Entity {
  kind = 'poisonTick'; team: Team = 'neutral'; x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true;
  private t = 0; private n = 0;
  constructor(private e: Entity, private ticks: number, private dmg = 1) {}
  update(dt: number, w: World) {
    this.t += dt;
    const e = this.e;
    if (!e.alive || (e.hp ?? 1) <= 0) { this.alive = false; return; }
    if (Math.random() < dt * 6) w.fx.emit('poison', e.x + R(-0.3, 0.3), e.y + R(-0.2, 0.3), { n: 1 });
    if (this.t > 0.8 * (this.n + 1)) {
      this.n++;
      e.hit?.(this.dmg, 0, 0.2, w, null, 'spike');
      w.text.pop('POISON', e.x, e.y + 0.8, 'magic', { size: 0.22, life: 0.6 });
      if (this.n >= this.ticks) this.alive = false;
    }
  }
}
export function poisonEnemy(w: World, e: Entity, ticks: number, dmg = 1) { w.add(new Poison(e, ticks, dmg)); }

/** the slug-ink bomb's violet cloud: fish inside are poisoned (once each) */
class InkCloud implements Entity {
  kind = 'slugInk'; team: Team = 'neutral'; vx = 0; vy = 0; r = 2.6; alive = true;
  private t = 0; private got = new WeakSet<Entity>();
  constructor(public x: number, public y: number, private ticks: number) {}
  update(dt: number, w: World) {
    this.t += dt;
    if (Math.random() < dt * 14) w.fx.emit('ink', this.x + R(-1.6, 1.6), this.y + R(-1, 1.2), { n: 1, spread: 0.3, speed: 0.4, drag: 2.5, drift: 1, life: 1.8, color: '#6a2a9a' });
    if (Math.random() < dt * 6) w.fx.emit('poison', this.x + R(-1.4, 1.4), this.y + R(-0.8, 1), { n: 1 });
    for (const e of w.near(this.x, this.y, this.r, 'enemy')) {
      if (this.got.has(e) || e.kind === 'hurtbox' || e.kind === 'weakpoint') continue;
      this.got.add(e);
      poisonEnemy(w, e, this.ticks);
    }
    if (this.t > 3.2) this.alive = false;
  }
}

// ================================================================================================ slime trails
const TRAIL_MAX = 360;
class Trails {
  mesh: THREE.InstancedMesh;
  pts: { x: number; y: number; t: number; c: THREE.Color }[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  constructor() {
    const g = new THREE.CircleGeometry(0.5, 8);
    // a wet, matte sheen on the sand (lit like the seabed, never glowing)
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, mat, TRAIL_MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
  }
  add(x: number, y: number, col: string) {
    if (this.pts.length >= TRAIL_MAX) this.pts.shift();
    this.pts.push({ x, y, t: 0, c: new THREE.Color(col) });
  }
  update(dt: number) {
    for (const q of this.pts) q.t += dt;
    while (this.pts.length && this.pts[0].t > 16) this.pts.shift();
    this.pts.forEach((q, i) => {
      const k = Math.max(0, 1 - q.t / 16), w = 0.22 * (0.6 + 0.4 * k);
      this.m.compose(this.p.set(q.x, q.y + 0.015, CRIT_Z), this.q, this.s.set(w * 2.2, w * 1.2, 1));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, new THREE.Color().copy(q.c).multiplyScalar(0.4 + 0.6 * k));
    });
    this.mesh.count = this.pts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  /** is (x, y) riding low along a fresh stretch of trail? */
  on(x: number, y: number): boolean {
    for (let i = this.pts.length - 1; i >= 0; i--) { const q = this.pts[i]; if (q.t < 14 && Math.abs(q.x - x) < 0.45 && y - q.y > -0.2 && y - q.y < 1.3) return true; }
    return false;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

// ================================================================================================ the controller
type BuffId = 'hop' | 'regen' | 'glow' | 'sting';
const BUFF_NAME: Record<BuffId, string> = { hop: 'HOP', regen: 'REGEN', glow: 'GLOW', sting: 'STING AURA' };
const BUFF_COL: Record<BuffId, string> = { hop: '#fff2b0', regen: '#9aff9a', glow: '#40e8d8', sting: '#6ab4ff' };
interface Swap { plan: CritterPlan; crabs: RunHermit[]; shells: ShellProp[]; empty: ShellProp; step: number; phase: 'queue' | 'out' | 'walk' | 'in' | 'gift' | 'done'; t: number; watch: number; next: number }

export class Critters {
  plans: CritterPlan[] = [];
  ents = new Map<number, Entity[]>();
  swaps: Swap[] = [];
  buffs: Partial<Record<BuffId, number>> = {};
  /** 0..1: the glow buff (the dungeon brightens the blobfish's lantern) */
  glowK = 0;
  trails = new Trails();
  /** the hermit talking (the dialogue speaker's anchor) */
  talker: { x: number; y: number; h: number } | null = null;
  private regenT = 0; private stingT = 0; private slipT = 0; private bunT = 0; private trailT = 0;
  private listeners: [string, (d: Record<string, unknown>) => void][] = [];
  constructor(public host: CritterHost) {}

  /** after the level is built: plan (once per floor, saved) and listen for the item effects */
  build(scene: THREE.Scene) {
    const plan = this.host.plan as LevelPlan & { critters?: CritterPlan[] };
    plan.critters ??= planCritters(plan);
    this.plans = plan.critters;
    scene.add(this.trails.mesh);
    const on = (ev: string, fn: (d: Record<string, unknown>) => void) => { this.host.world.on(ev, fn); this.listeners.push([ev, fn]); };
    on('hurt', () => this.onHurt());
    on('explosion', (d) => { const l = this.placed('slugInk'); if (l && d.bomb) this.host.world.add(new InkCloud(d.x as number, d.y as number, l + 1)); });
    on('chestOpened', (d) => {
      const l = this.placed('pearlPouch');
      if (!l) return;
      for (let k = 0; k < l; k++) this.host.world.spawnPickup('pearl', (d.x as number) + R(-0.3, 0.3), (d.y as number) + 1.2, { value: 1, vy: 3 + k * 0.4, vx: R(-1.5, 1.5) });
      this.host.world.text.pop(`POUCH +${l}`, d.x as number, (d.y as number) + 1.6, 'gold', { size: 0.24, life: 1 });
    });
    on('itemPicked', (d) => { if (d.id === 'recipeScroll') this.readScroll(); });
  }

  /** the level of a placed v8 item (0 = none in the pack's grid) */
  placed(id: string): number {
    let l = 0;
    for (const it of this.host.run.items) if (it.id === id && it.gx >= 0) l = Math.max(l, it.level || 1);
    return l;
  }
  private has(id: string) { return this.host.run.items.some((i) => i.id === id); }
  /** take one of an item out of the pack */
  private take(id: string): boolean {
    const items = this.host.run.items;
    const i = items.findIndex((q) => q.id === id);
    if (i < 0) return false;
    const it = items[i];
    if ((it.n ?? 1) > 1) it.n = (it.n ?? 1) - 1; else items.splice(i, 1);
    this.host.refresh();
    return true;
  }

  // -------------------------------------------------------------------------- item effects
  private onHurt() {
    const w = this.host.world, p = this.host.player;
    const sh = Math.max(this.placed('shellArmor') ? 0.15 * this.placed('shellArmor') : 0, this.placed('giantShell') ? 0.15 + 0.1 * this.placed('giantShell') : 0);
    if (sh && Math.random() < sh) {
      setTimeout(() => { if (p.alive) { p.heal(1, w); w.text.pop('TUCKED IN!', p.x, p.y + 1, 'heal', { size: 0.26, life: 1 }); } }, 250);
    }
    const bait = this.placed('nudiBait');
    if (bait) {
      let best: Entity | null = null, bd = 2.6;
      for (const e of w.near(p.x, p.y, 2.6, 'enemy')) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd && isFishKind(e.kind)) { bd = d; best = e; } }
      if (best) { poisonEnemy(w, best, bait + 1); w.text.pop('BAITED!', best.x, best.y + 1, 'magic', { size: 0.24, life: 0.9 }); }
    }
  }
  private readScroll() {
    const left = unknownScrollRecipes();
    const w = this.host.world, p = this.host.player;
    if (!left.length) { this.host.title('AN OLD SCROLL', 'YOU KNOW EVERY HERMIT RECIPE: +3 PEARLS', '#f6f0e2'); for (let k = 0; k < 3; k++) w.spawnPickup('pearl', p.x, p.y + 0.5, { value: 1, vy: 2.5, vx: R(-1.5, 1.5) }); return; }
    const id = left[Math.floor(Math.random() * left.length)];
    learnRecipe(id);
    this.host.title('RECIPE LEARNED', `${getItem(id).name.toUpperCase()}: CRAFT IT AT THE WORKBENCH`, '#efe1bd');
    sfx(w, ['page1', 'jin_rare1'], p.x, 0.6);
    w.fx.burst('star', p.x, p.y + 0.6, 14, 2.4, { color: '#fff2b0' });
  }
  private buff(id: BuffId, dur: number) {
    const w = this.host.world, p = this.host.player;
    this.buffs[id] = Math.max(this.buffs[id] ?? 0, dur);
    w.text.pop(`${BUFF_NAME[id]} ${Math.round(dur)}S`, p.x, p.y + 1.1, id === 'sting' ? 'magic' : id === 'regen' ? 'heal' : 'gold', { size: 0.3, life: 1.6, follow: () => ({ x: p.x, y: p.y + 1.1 }) });
    w.fx.burst('sparkle', p.x, p.y + 0.3, 16, 2, { color: BUFF_COL[id] });
    sfx(w, ['powerup1', 'shimmer1'], p.x, 0.5);
  }
  private updateBuffs(dt: number) {
    const w = this.host.world, p = this.host.player;
    for (const k of Object.keys(this.buffs) as BuffId[]) {
      const before = this.buffs[k]!;
      this.buffs[k] = before - dt;
      if (before > 3 && this.buffs[k]! <= 3) w.text.pop(`${BUFF_NAME[k]} FADING`, p.x, p.y + 1, 'hint', { size: 0.22, life: 1.2, follow: () => ({ x: p.x, y: p.y + 1 }) });
      if (this.buffs[k]! <= 0) delete this.buffs[k];
    }
    if (!p.alive) return;
    const B = this.buffs;
    if (B.hop) { p.buff('speed', 1.4, 0.25); if (Math.random() < dt * 8) w.fx.emit('bubbleS', p.x - p.vx * 0.05, p.y, { n: 1, spread: 0.2, vy: 0.6, life: 0.8 }); }
    if (B.regen) { this.regenT -= dt; if (this.regenT <= 0) { this.regenT = 2; if (p.hp < p.maxHp) { p.heal(1, w); w.fx.heal(p.x, p.y + 0.4, 2); } } if (Math.random() < dt * 4) w.fx.emit('sparkle', p.x + R(-0.4, 0.4), p.y + R(-0.2, 0.5), { n: 1, color: '#9aff9a', life: 0.7 }); }
    this.glowK = damp(this.glowK, B.glow ? 1 : 0, 2, dt);
    if (B.glow && Math.random() < dt * 5) w.fx.emit('glow', p.x + R(-0.7, 0.7), p.y + R(-0.5, 0.8), { n: 1, size: 0.3, life: 0.9, color: '#40e8d8', alpha: 0.6 });
    if (B.sting) {
      if (Math.random() < dt * 7) { const a = Math.random() * Math.PI * 2; w.fx.emit('spark', p.x + Math.cos(a) * 1.1, p.y + Math.sin(a) * 1.1, { n: 1, color: '#9ad8ff', life: 0.25 }); }
      this.stingT -= dt;
      if (this.stingT <= 0) {
        this.stingT = 0.55;
        for (const e of w.near(p.x, p.y, 2, 'enemy')) { if (!e.hit || e.kind === 'hurtbox') continue; e.hit(0.6, Math.sign(e.x - p.x), 0.2, w, p, 'zap'); w.fx.zaps(e.x, e.y, 1); }
      }
    }
    // the sea bunny charm: a little heal now and then
    const bc = this.placed('bunnyCharm');
    if (bc) { this.bunT += dt; if (this.bunT > 30 / bc) { this.bunT = 0; if (p.hp < p.maxHp) { p.heal(1, w); w.text.pop('BUN BUN!', p.x, p.y + 1, 'heal', { size: 0.24, life: 1 }); } } }
  }

  // -------------------------------------------------------------------------- spawning
  private spawn(c: CritterPlan) {
    const H = this.host, w = H.world;
    const fl = H.floorUnder(c.x, H.plan.top);
    const list: Entity[] = [];
    if (c.kind === 'hermit' || c.kind === 'giant') {
      const giant = c.kind === 'giant';
      const e = new RunHermit(c.x, fl + 0.1, c.shell ?? 'whelk', giant ? 8.5 : R(3.6, 4.2), c, giant);
      w.add(e); list.push(e);
      if (c.done) e.state = 'wander';
    } else if (c.kind === 'slug') {
      const sp = c.slug ?? 'sea_bunny';
      const y = sp === 'blue_dragon' ? Math.min(H.plan.top - 1.5, fl + 3) : fl + 0.02;
      const e = new RunSlug(c.x, y, sp, c);
      if (c.done) e.used = true;
      w.add(e); list.push(e);
    } else if (c.kind === 'swap') {
      // a queue by size, smallest at the back, the empty shell ahead of the biggest
      const ks = c.shells ?? ['teacup', 'cap', 'moon', 'whelk'];
      const sizes = [2.6, 3.2, 3.9, 4.6];
      const crabs: RunHermit[] = [], shells: ShellProp[] = [];
      for (let i = 0; i < 3; i++) {
        const x = c.x - 5 + i * 2, f = H.floorUnder(x, H.plan.top);
        const e = new RunHermit(x, f + 0.1, ks[i], sizes[i], c);
        e.state = 'idle'; e.facing = 1; e.yaw = 0; e.homeX = x;
        w.add(e); crabs.push(e); list.push(e);
      }
      const ex = c.x + 1.9, ef = H.floorUnder(ex, H.plan.top);
      const empty = new ShellProp(ex, ef + 0.06 * sizes[3], ks[3], sizes[3], -1);
      w.add(empty); list.push(empty);
      if (!c.done) this.swaps.push({ plan: c, crabs, shells, empty, step: 2, phase: 'queue', t: 0, watch: 0, next: 0 });
      else { for (const e of crabs) e.state = 'wander'; empty.alive = false; }
    }
    this.ents.set(c.id, list);
  }

  // -------------------------------------------------------------------------- the shell swap
  private updateSwap(s: Swap, dt: number) {
    const H = this.host, w = H.world, p = H.player;
    const d = Math.hypot(p.x - s.plan.x, p.y - H.floorUnder(s.plan.x, H.plan.top));
    const spooked = s.crabs.some((c) => c.state === 'hide');
    s.t += dt;
    if (s.phase === 'queue') {
      // the biggest pokes at the empty shell with its claws now and then
      const big = s.crabs[2];
      if (big.state === 'idle') { big.model.anim.raise = Math.max(0, Math.sin(s.t * 1.3)) * 0.8; big.model.anim.pinch = Math.sin(s.t * 9) > 0.6 ? 1 : 0; }
      s.watch = d < 8.5 && !spooked && Math.hypot(p.vx, p.vy) < 4 ? s.watch + dt : Math.max(0, s.watch - dt);
      if (s.watch > 1.4 && !H.fighting()) {
        s.phase = 'out'; s.t = 0; s.step = 2;
        H.title('SHELL SWAP', 'HERMIT CRABS QUEUE BY SIZE FOR A BIGGER HOME', '#efe1bd');
        sfx(w, ['crab_click1', 'click1'], s.plan.x, 0.6, 1.2);
      }
      for (const c of s.crabs) if (c.state === 'wander') c.state = 'idle';
      return;
    }
    if (spooked) { s.t = Math.min(s.t, 0.2); return; }       // wait for calm
    const c = s.crabs[s.step];
    const target = s.step === 2 ? s.empty : s.shells[s.step + 1];
    switch (s.phase) {
      case 'out':
        // out of the old shell: it lifts off, the soft abdomen shows; the old shell stays where it was
        if (s.t < 0.05) { c.state = 'naked'; c.model.anim.raise = 0; }
        if (s.t > 0.7) {
          const sh = new ShellProp(c.x, c.y, c.shell, c.size, c.facing);
          w.add(sh); s.shells[s.step] = sh; this.ents.get(s.plan.id)?.push(sh);
          c.model.anim.naked = 1;
          c.state = 'walkTo'; c.target = target.x - 0.05;
          s.phase = 'walk'; s.t = 0;
          w.text.pop(s.step === 2 ? 'MINE!' : 'MY TURN!', c.x, c.y + c.h + 0.3, 'shout', { size: 0.22, life: 0.9 });
          sfx(w, SND.click, c.x, 0.5, 1.4);
        }
        break;
      case 'walk':
        c.target = target.x;
        if (Math.abs(c.x - target.x) < 0.1 || s.t > 6) {
          // in: the crab takes the shell (its size), the shell prop goes
          c.setShell(target.shell, target.size);
          c.model.anim.naked = 1; c.nakedK = 1;
          target.alive = false;
          c.state = 'settle'; c.target = target.x;
          s.phase = 'in'; s.t = 0;
          w.fx.emit('silt', c.x, c.y, { n: 8, spread: 0.4, speed: 0.7, life: 1.2, size: 0.3, size1: 0.8, alpha: 0.5, drag: 2 });
          sfx(w, ['gravel1', 'uw_thud1'], c.x, 0.5, 1.2);
        }
        break;
      case 'in':
        if (s.t > 0.8) {
          c.state = 'idle'; c.target = null;
          w.fx.burst('star', c.x, c.y + c.h, 6, 1.6, { color: '#fff4c0' });
          if (s.step > 0) { s.step--; s.phase = 'out'; s.t = 0; }
          else { s.phase = 'gift'; s.t = 0; }
        }
        break;
      case 'gift': {
        // the smallest shell is left over: a spare for the blobfish (and pearls from the happy queue)
        const left = s.shells[0];
        if (left) {
          left.alive = false;
          w.spawnPickup('item', left.x, left.y + 0.3, { id: 'spareShell', vy: 3, vx: 0.5 });
          H.rewards([{ kind: 'pearl', value: H.pearls(left.y) }, { kind: 'pearl', value: H.pearls(left.y) }, { kind: 'pearl', value: H.pearls(left.y) }], left.x, left.y + 0.4, true);
          w.text.pop('A SPARE SHELL!', left.x, left.y + 1, 'gold', { size: 0.3, life: 1.6 });
        }
        for (const cr of s.crabs) { cr.state = 'wander'; cr.homeX = cr.x; }
        s.plan.done = true; s.phase = 'done';
        H.save();
        break;
      }
      default: break;
    }
  }

  // -------------------------------------------------------------------------- trades
  private gift(c: RunHermit, offered: boolean) {
    const H = this.host, w = H.world, pv = H.pearls(c.y), x = c.x + c.facingDir() * 0.6 * c.size / 2, y = c.y + c.h + 0.2;
    const pearls = (n: number): Reward[] => Array.from({ length: n }, () => ({ kind: 'pearl', value: pv }));
    const scroll = unknownScrollRecipes().length > 0;
    let out: Reward[] = [];
    if (c.giant) {
      out = [{ kind: 'item', id: 'giantShell' }, ...pearls(6)];
      H.say(c, 'Too small for me now. Take it, little blob.', 3.2);
    } else if (offered) {
      out = [{ kind: 'item', id: scroll ? 'recipeScroll' : Math.random() < 0.5 ? 'pearlPouch' : 'bunnyCharm' }, ...pearls(3 + Math.floor(Math.random() * 3))];
      if (Math.random() < 0.4) H.dropChest(c.x - c.facingDir() * 1.4, c.y);
      H.say(c, OFFER_LINES[Math.floor(Math.random() * OFFER_LINES.length)].replace('{w}', wname(c.plan?.wish ?? 'seaGlass').toLowerCase()), 2.8);
    } else {
      const k = Math.random();
      if (k < 0.32) out = pearls(3 + Math.floor(Math.random() * 4));
      else if (k < 0.52) { H.dropChest(c.x - c.facingDir() * 1.4, c.y); out = pearls(1); }
      else if (k < 0.78) out = [{ kind: 'item', id: scroll ? 'recipeScroll' : 'pearlPouch' }];
      else if (k < 0.9) out = [{ kind: 'item', id: ['seashell', 'pearl', 'seaGlass', 'spareShell'][Math.floor(Math.random() * 4)] }, ...pearls(1)];
      else out = [{ kind: 'item', id: 'pearlPouch' }];
      H.say(c, TRADE_LINES[Math.floor(Math.random() * TRADE_LINES.length)], 2.6);
    }
    H.rewards(out, x, y, true);
    c.model.anim.raise = 1;
    setTimeout(() => { c.model.anim.raise = 0; }, 700);
    sfx(w, ['crab_click1', 'click1'], c.x, 0.6, 1.3);
    w.emit('hermitTrade', { shell: c.shell, offered, giant: c.giant });
    if (c.plan) c.plan.done = true;
    H.save();
  }

  // -------------------------------------------------------------------------- slugs
  private touchSlug(s: RunSlug) {
    const H = this.host, w = H.world, p = H.player;
    switch (s.sp) {
      case 'sea_bunny': this.buff('hop', 20); H.say({ x: s.x, y: s.y, h: s.h }, '*happy squeak*', 1.6); s.squashV += 8; break;
      case 'lettuce_slug':
        this.buff('regen', 14);
        s.dying = 0.5; s.alive = false; s.plan.done = true;
        w.fx.burst('sparkle', s.x, s.y + 0.2, 12, 1.6, { color: '#9aff9a' });
        sfx(w, SND.bite, s.x, 0.6);
        break;
      case 'glow_dorid': this.buff('glow', 45); s.squashV += 6; break;
      case 'blue_dragon': this.buff('sting', 25); s.charged = false; w.fx.zaps(p.x, p.y, 3); break;
      default: break;
    }
    s.used = true;
    if (s.sp !== 'lettuce_slug') s.plan.done = true;
    w.emit('slugTouched', { species: s.sp });
    H.save();
  }

  // -------------------------------------------------------------------------- per frame
  update(dt: number, interact: boolean): Prompt | null {
    const H = this.host, w = H.world, p = H.player;
    // spawn what's near (never despawned: each floor keeps its little residents)
    for (const c of this.plans) if (!this.ents.has(c.id) && Math.abs(p.x - c.x) < 30 && !(c.kind === 'slug' && c.done && c.slug === 'lettuce_slug')) this.spawn(c);
    for (const s of this.swaps) if (s.phase !== 'done') this.updateSwap(s, dt);
    this.updateBuffs(dt);
    this.trails.update(dt);
    this.trailT -= dt; this.slipT -= dt;
    let prompt: Prompt | null = null, best = 1e9;
    const spd = Math.hypot(p.vx, p.vy);
    for (const list of this.ents.values()) for (const e of list) {
      if (!e.alive) continue;
      // fish that bite a toxic slug get poisoned (the slug is gone)
      if (e instanceof RunSlug) {
        if (this.trailT <= 0 && e.crawling && Math.abs(e.vx) > 0.05) this.trails.add(e.x - e.facingDir() * e.L * 0.4, e.y, TRAIL_COL[e.sp]);
        if (e.toxic) for (const f of w.near(e.x, e.y, e.L * 0.4, 'enemy')) {
          if (!isFishKind(f.kind) || (f.hp ?? 1) <= 0) continue;
          poisonEnemy(w, f, 4, 1);
          w.text.pop('POISONED!', f.x, f.y + 1, 'magic', { size: 0.28, life: 1.2 });
          w.fx.poison(e.x, e.y, 10);
          e.alive = false; e.plan.done = true;
          break;
        }
      }
      if (!p.alive || H.fighting()) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (e instanceof RunHermit) {
        const reach = 1.5 + e.size * 0.35;
        if (d > reach + 1.5 || e.state === 'naked' || e.state === 'walkTo' || e.state === 'settle') continue;
        const inSwap = this.swaps.some((s) => s.crabs.includes(e) && s.phase !== 'done');
        if (inSwap) { if (d < reach && d < best) { best = d; prompt = { key: '', label: 'SHH: A SHELL QUEUE. HANG BACK AND WATCH', at: H.anchor(e.x, e.y + e.h + 0.9, CRIT_Z) }; } continue; }
        if (e.plan?.done) continue;
        if (d > reach || d >= best) continue;
        best = d;
        const wish = e.plan?.wish, can = !e.giant && !!wish && this.has(wish);
        if (!e.asked && !e.giant && wish && e.state !== 'hide') { e.asked = true; H.say(e, ASK_LINES[Math.floor(Math.random() * ASK_LINES.length)].replace('{w}', wname(wish).toLowerCase()), 2.6); }
        const at = H.anchor(e.x, e.y + e.h + 0.9, CRIT_Z);
        if (e.state === 'hide') {
          if (can) { prompt = { key: 'E', label: `OFFER: ${wname(wish!)} TO COAX IT OUT`, at }; if (interact && this.take(wish!)) { e.state = 'wander'; e.scared = 0; this.gift(e, true); } }
          else prompt = { key: '', label: e.giant ? 'HIDING: SLOW DOWN. SLOWER.' : `HIDING: EASE OFF AND WAIT${wish ? `, OR BRING ${wname(wish)}` : ''}`, at, bad: true };
        } else if (spd < 4.3) {
          prompt = { key: 'E', label: can ? `OFFER: ${wname(wish!)} FOR ITS BEST GIFT` : e.giant ? 'GREET: GENTLY, THE GIANT HERMIT' : `TRADE: IT WANTS ${wname(wish ?? 'seaGlass')}, BUT TAKES A SMILE`, at };
          if (interact) { if (can && this.take(wish!)) this.gift(e, true); else this.gift(e, false); }
        }
      } else if (e instanceof RunSlug) {
        const reach = 1.4 + e.L * 0.45;
        if (d > reach || d >= best) continue;
        best = d;
        const at = H.anchor(e.x, e.y + e.h + 0.8, CRIT_Z);
        if (e.sp === 'spanish_dancer') prompt = { key: '', label: 'TOXIC: SPANISH DANCERS STING. FISH THAT EAT THEM GET POISONED', at, bad: true };
        else if (e.used) prompt = null;
        else if (e.sp === 'blue_dragon' && !e.charged) prompt = { key: '', label: 'NO STINGERS: THE BLUE DRAGON HUNTS JELLYFISH FOR THEM', at, bad: true };
        else {
          const label = e.sp === 'sea_bunny' ? 'PET: THE SEA BUNNY (SPEED)' : e.sp === 'lettuce_slug' ? 'NIBBLE: THE LETTUCE SLUG (REGEN)' : e.sp === 'glow_dorid' ? 'TOUCH: THE GLOW DORID, GENTLY (LIGHT)' : 'TAKE: ITS STOLEN STINGERS (STING AURA)';
          prompt = { key: 'E', label, at };
          if (interact) this.touchSlug(e);
        }
      }
    }
    if (this.trailT <= 0) this.trailT = 0.28;
    // the slipstream: swimming low along fresh slime
    if (p.alive && spd > 1.5 && this.trails.on(p.x, p.y)) {
      p.buff('speed', 1.5, 0.4);
      if (Math.random() < 0.5) w.fx.emit('bubbleS', p.x - p.vx * 0.06, p.y - 0.2, { n: 1, spread: 0.1, vy: 0.4, life: 0.6 });
      if (this.slipT <= 0) { this.slipT = 6; w.text.pop('SLIPSTREAM!', p.x, p.y + 0.9, 'hint', { size: 0.24, life: 0.9 }); }
    }
    // the talker for the speech anchor: the nearest hermit
    return prompt;
  }

  dispose() {
    for (const [ev, fn] of this.listeners) this.host.world.off(ev, fn);
    this.listeners = [];
    this.trails.dispose();
    this.ents.clear(); this.swaps = [];
  }
}

// ================================================================================================ codex
let codexDone = false;
export function registerCritterCodex() {
  if (codexDone) return;
  codexDone = true;
  const F = (id: string, name: string, desc: string, danger: number, habitat: string, model: () => THREE.Object3D) => registerCodex({ id, kind: 'fish', name, desc, danger, habitat, model });
  F('hermit_crab', 'Hermit Crab', 'Lives in whatever fits: whelks, moon snails, bottle caps, sardine tins, teacups, skulls. Swim up slowly and it trades; dash at it and the door slams.', 1, 'every seabed', () => buildFish('hermit_teacup', 3).group);
  F('giant_hermit', 'Giant Hermit Crab', 'Old, enormous, and about to move house. Wears an anemone as a hat. Be very, very gentle.', 1, 'rarely, anywhere', () => buildFish('hermit_giant', 3).group);
  F('spanish_dancer', 'Spanish Dancer', 'A crimson sea slug that swims by rippling its skirt. Toxic: it stings what touches it, and poisons what eats it.', 2, 'reefs and kelp', () => buildFish('spanish_dancer', 3).group);
  F('blue_dragon', 'Blue Dragon', 'Floats belly-up and eats jellyfish, keeping their stingers for itself. Take them off its hands, carefully.', 1, 'open water', () => buildFish('blue_dragon', 3).group);
  F('sea_bunny', 'Sea Bunny', 'A fluffy little slug with black-tipped ears. Not a bunny. Pet it anyway: you will feel faster.', 1, 'shallow reefs', () => buildFish('sea_bunny', 3).group);
  F('lettuce_slug', 'Lettuce Slug', 'Steals chloroplasts from algae and runs on sunlight. Tastes of salad. Heals you, a little.', 1, 'reefs and kelp', () => buildFish('lettuce_slug', 3).group);
  F('glow_dorid', 'Glow Dorid', 'Its rim glows in the dark. Toxic to bump into; touch it gently and some of the glow rubs off on you.', 2, 'the twilight and deeper', () => buildFish('glow_dorid', 3).group);
}
void clamp;

// the codex knows these pages from the start (the field journal shows their silhouettes before you meet them)
registerCritterCodex();
