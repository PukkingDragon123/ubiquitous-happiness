// A human enemy underwater: a DiverRig body driven by a small tactical brain.
//
// Roles (ROLES): harpoon (scuba speargunners who keep range and use cover while reloading), spear (camo free
// divers: fast, hit-and-run, must surface for air), knife (commandos who circle round behind you and plant
// limpet mines on the wreck), net (they throw a net and haul you in), medic (patches wounded squadmates, calls
// reinforcements with a flare), heavy (brass-helmet divers plodding along the seabed with a harpoon cannon,
// breathing through an air hose you can cut), titan (the boss version).
//
// Brain: every human has an objective (the shipwreck) and a focus. They go for the wreck until provoked —
// hurt, the blobfish swimming close, or a squadmate's alert — then hunt the blobfish, falling back to the wreck
// once it's been out of sight for a while. Ranged roles take spread-out flank slots round the target at their
// preferred range, check line of sight through the rocks, lead their shots, duck behind rocks to reload and
// peek out to fire. Wounded divers bleed, retreat to the surface (and come back as nemeses if they make it),
// or wait for the medic. `iq` (0..1, mastery + wave) scales reaction time, aim error, leading, cover use,
// flanking, dodging and retreat discipline.
//
// v3 (souls-like dungeon levels): `mods.souls` switches a human to the duel brain at the bottom of this class.
// It needs no wave director or shipwreck: the human roams round its home (patrol, notice, chase within a
// leash, return) or lives inside an Arena {x0, x1, floor, top} when one is locked. Every attack runs on the
// EnemyCore kit (src/combat/core.ts): a wind-up pose + glint + sound, an active window, a recovery; poise
// breaks stagger them and perfect parries open a riposte.
//   harpoon / spear  keep range; an aimed shot with a red sight line that locks a beat before the trigger
//                    (side-step it, block it, or parry it back at him); a speargun-butt bash up close
//   knife            closes in for 2-3 stab combos (all parryable), then backs off
//   net              a red (unblockable) throw net: dodge it or get wrapped (mash to tear free)
//   heavy            plods the seabed with hyper armour: slow cannon sweeps (blockable, heavy on stamina),
//                    a red grab-and-slam, and a slow cannon bolt at range
//   medic            hangs back, channels a heal on hurt allies (any hit interrupts it), flare-pistol shots
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { Nemesis } from '../meta/meta';
import { makeDiver } from '../humans/diver';
import type { DiverRig, SeverPart, DiverAct } from '../humans/diver';
import type { DiverArch, WeaponKind } from '../humans';
import type { Attacker } from './board';
import { board } from './board';
import type { Target, WaveArea } from './types';
import { damageTarget } from './types';
import { Harpoon, ThrownNet, Flare, hurtPlayer } from './projectiles';
import { LimpetMine } from './limpet';
import { gore, bleed, bubbles, muzzle, silt } from './fx';
import { spawnLimb, spawnProp, chunks } from './gore';
import { bark } from './barks';
import type { BarkEvent } from './barks';
import { FishingLine } from '../fishing/line';
import { clamp, damp } from '../core/math';
import { textSprite, STYLES } from '../ui/text';
import { EnemyCore } from '../combat/core';
import type { MoveDef } from '../combat/core';
import type { Arena } from '../combat/types';
import { AimLine, glint } from '../combat/telegraph';
import { callout } from '../combat/feel';
import { Bolt, Net } from '../combat/projectiles';

export type Role = 'harpoon' | 'spear' | 'knife' | 'net' | 'medic' | 'heavy' | 'titan';
export interface RoleDef {
  arch: DiverArch; weapon: WeaponKind; name: string;
  hp: number; speed: number; range: [number, number]; dmg: number; reload: number; projSpeed: number;
  armor: number; walker: boolean; bounty: number; mass: number; loot: string[];
}
export const ROLES: Record<Role, RoleDef> = {
  harpoon: { arch: 'scuba', weapon: 'speargun', name: 'Harpooner', hp: 7, speed: 2.5, range: [4.5, 7.5], dmg: 1, reload: 2.6, projSpeed: 15, armor: 0, walker: false, bounty: 3, mass: 1, loot: ['rustyHook', 'leadShot', 'lineScrap'] },
  spear: { arch: 'freediver', weapon: 'bandgun', name: 'Spearfisher', hp: 5, speed: 3.5, range: [3, 5.5], dmg: 1, reload: 3.0, projSpeed: 17, armor: 0, walker: false, bounty: 3, mass: 0.9, loot: ['lineScrap', 'cork'] },
  knife: { arch: 'commando', weapon: 'knife', name: 'Frogman', hp: 6, speed: 3.3, range: [0.5, 1.1], dmg: 1, reload: 1.0, projSpeed: 0, armor: 0.1, walker: false, bounty: 4, mass: 1, loot: ['rustyNail', 'leadShot'] },
  net: { arch: 'netDiver', weapon: 'net', name: 'Netter', hp: 8, speed: 2.2, range: [2.5, 4.8], dmg: 0, reload: 7, projSpeed: 7, armor: 0, walker: false, bounty: 4, mass: 1.15, loot: ['lineScrap', 'cork', 'lineScrap'] },
  medic: { arch: 'medic', weapon: 'flaregun', name: 'Medic', hp: 6, speed: 2.7, range: [5, 9], dmg: 0, reload: 2, projSpeed: 0, armor: 0, walker: false, bounty: 4, mass: 1, loot: ['seaGlass', 'cork'] },
  heavy: { arch: 'heavyDiver', weapon: 'cannon', name: 'Hard Hat', hp: 22, speed: 1.05, range: [3, 9], dmg: 2, reload: 3.6, projSpeed: 11, armor: 0.4, walker: true, bounty: 10, mass: 4, loot: ['copperOre', 'ironOre', 'leadShot'] },
  titan: { arch: 'titan', weapon: 'cannon', name: 'Brass Titan', hp: 90, speed: 0.95, range: [3, 11], dmg: 2, reload: 2.1, projSpeed: 12, armor: 0.5, walker: true, bounty: 60, mass: 10, loot: ['copperOre', 'doubloon', 'ironOre'] },
};

/** distinct generated looks per role */
export const VARIANTS = 3;

export interface HumanMods { hpMul?: number; dmgMul?: number; speedMul?: number; reloadMul?: number; iq?: number; elite?: boolean; nemesis?: Nemesis | null; seed?: number; souls?: boolean; arena?: Arena | null }

/** v3 duel moves (see the header) */
const MV: Record<string, MoveDef> = {
  stab1: { id: 'stab1', windup: 0.5, active: 0.13, recover: 0.26, dmg: 1, kind: 'spike' },
  stab2: { id: 'stab2', windup: 0.3, active: 0.13, recover: 0.28, dmg: 1, kind: 'spike' },
  lunge: { id: 'lunge', windup: 0.42, active: 0.17, recover: 0.8, dmg: 1.5, kind: 'spike', knock: 5 },
  shot: { id: 'shot', windup: 1.0, active: 0.1, recover: 0.35, dmg: 1, tellAt: 0.25 },
  bash: { id: 'bash', windup: 0.42, active: 0.12, recover: 0.55, dmg: 1, knock: 6, kind: 'crush' },
  net: { id: 'net', windup: 0.85, active: 0.1, recover: 1.1, dmg: 0, unblockable: true, tellAt: 0.42 },
  sweep: { id: 'sweep', windup: 0.85, active: 0.24, recover: 0.85, dmg: 2, guardDmg: 45, hyper: true, kind: 'crush', knock: 7 },
  grab: { id: 'grab', windup: 0.95, active: 0.2, recover: 1.0, dmg: 1.5, unblockable: true, hyper: true, kind: 'crush', tellAt: 0.45 },
  cannon: { id: 'cannon', windup: 1.2, active: 0.1, recover: 0.6, dmg: 2, hyper: true, tellAt: 0.3 },
  heal: { id: 'heal', windup: 1.3, active: 0.1, recover: 0.4, dmg: 0, tell: 'none' },
  flare: { id: 'flare', windup: 0.75, active: 0.1, recover: 0.8, dmg: 1, tellAt: 0.25 },
};
const POISE: Record<Role, number> = { harpoon: 12, spear: 12, knife: 18, net: 16, medic: 8, heavy: 60, titan: 140 };
/** one squad per world for the duel-brain humans (barks, man-down calls) */
const duelSquads = new WeakMap<World, Squad>();

export class Squad {
  members: Human[] = [];
  flared = false;
  constructor(public id: number) {}
  get alive() { return this.members.filter((m) => m.state !== 'dead' && m.state !== 'escaped'); }
  get losses() { return this.members.filter((m) => m.state === 'dead').length; }
}

type State = 'enter' | 'fight' | 'cover' | 'retreat' | 'breathe' | 'heal' | 'dead' | 'escaped';
const _v = new THREE.Vector3();
let squadCounter = 1;
export const newSquad = () => new Squad(squadCounter++);

/** line of sight through the terrain */
export function los(w: World, ax: number, ay: number, bx: number, by: number) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.4);
  for (let i = 1; i < n; i++) { const t = i / n; if (w.terrain.sdf(ax + (bx - ax) * t, ay + (by - ay) * t) < 0.05) return false; }
  return true;
}

export class Human implements Entity, Attacker {
  kind: string;
  team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r: number; alive = true;
  hp: number; maxHp: number;
  obj: THREE.Group;
  rig: DiverRig;
  def: RoleDef;
  state: State = 'enter';
  focus: 'wreck' | 'player' = 'wreck';
  callsign: string;
  nemesis: Nemesis | null;
  nemesisId?: string;
  iq: number;
  elite: boolean;
  /** scars this human picked up (carried into a nemesis promotion if he escapes / wins) */
  scars = new Set<string>();
  /** what happened to him this fight (for nemesis memories) */
  events: string[] = [];
  dealt = 0;
  /** false: the body animates in place but the brain is off (previews / cutscenes) */
  ai = true;
  onDeath?: (h: Human, w: World, src: Entity | null, kind: DamageKind | undefined) => void;
  onEscape?: (h: Human, w: World) => void;
  /** set by the director: reinforcements requested by this human's flare */
  onFlare?: (x: number, h: Human) => void;

  private dmgMul: number; private speedMul: number; private reloadMul: number;
  private cool = 1;
  private react = 0.6;
  private provokedUntil = 0;
  private seenT = -99;
  private sawPlayer = false;
  private bleedK = 0;
  private breath = 30;
  private stateT = 0;
  private coverPt: { x: number; y: number } | null = null;
  private healTarget: Human | null = null;
  private dodgeCd = 0;
  private circle = Math.random() < 0.5 ? 1 : -1;
  private hose: FishingLine | null = null;
  private hoseCut = false;
  private disarmed = false;
  private legLoss = 0;
  private deadT = 0;
  private lastBarkT = -99;
  private tag: THREE.Sprite | null = null;
  private plantCd = 0;
  private aimX = 0; private aimY = 0;
  private wantFire = false;
  private ragWorld: { ground(x: number, z: number): number };
  private w: World | null = null;
  // ---- v3 duel brain
  /** the souls-like duel brain is on (dungeon levels) */
  souls = false;
  /** the locked arena (null: roaming round home) */
  arena: Arena | null = null;
  core: EnemyCore | null = null;
  home = { x: 0, y: 0 };
  leash = 11;
  aware = false;
  returning = false;
  private lostT = 0;
  private patrolPh = Math.random() * 6;
  private backoff = 0;
  private comboLeft = 0;
  private lean = 0;
  private aimLine: AimLine | null = null;
  private lockX = 0; private lockY = 0;
  private grabT = 0;
  private healAlly: Entity | null = null;
  private stabbed = false;
  private box: Arena = { x0: 0, x1: 0, floor: 0, top: 0 };
  private pendingBark: { ev: BarkEvent; t: number } | null = null;

  constructor(public role: Role, x: number, y: number, public squad: Squad, public area: WaveArea | null, public objective: Target | null, m: HumanMods = {}) {
    this.def = ROLES[role];
    this.kind = 'human:' + role;
    this.x = x; this.y = y;
    this.nemesis = m.nemesis ?? null;
    this.nemesisId = this.nemesis?.id;
    const nem = this.nemesis;
    const lvl = nem ? nem.level : 0;
    this.iq = clamp((m.iq ?? 0.4) + lvl * 0.12, 0, 1.2);
    this.elite = !!m.elite;
    const hpK = (m.hpMul ?? 1) * (this.elite ? 1.5 : 1) * (1 + lvl * 0.35);
    this.maxHp = this.hp = Math.round(this.def.hp * hpK);
    this.dmgMul = (m.dmgMul ?? 1) * (1 + lvl * 0.15);
    this.speedMul = (m.speedMul ?? 1) * (this.elite ? 1.1 : 1) * (1 + lvl * 0.05);
    this.reloadMul = (m.reloadMul ?? 1) * (this.elite ? 0.8 : 1) * Math.max(0.55, 1 - lvl * 0.1);
    // a few looks per role (model parts are cached per arch + seed, so spawns don't hitch); nemeses are unique
    const seed = nem ? nem.seed : ((m.seed ?? Math.floor(Math.random() * 1e6)) % VARIANTS) + 1;
    const arch = (nem ? (nem.arch.split(':')[0] as DiverArch) : null) ?? this.def.arch;
    this.rig = makeDiver(arch, seed, { weapon: this.def.weapon, scars: nem?.scars ?? [] });
    this.callsign = nem ? nem.name : this.def.name;
    this.obj = this.rig.group;
    this.r = role === 'titan' ? 1.1 : this.def.walker ? 0.7 : 0.55;
    this.rig.facing = x < (objective?.x ?? 0) ? 1 : -1;
    this.rig.onRelease = (a) => this.release(a);
    this.cool = 1 + Math.random() * 1.5;
    if (this.def.walker) this.rig.mode = 'walk';
    this.ragWorld = { ground: () => -1e9 };
    if (nem) this.makeTag();
    squad.members.push(this);
    if (this.elite && !nem) this.callsign = 'Veteran ' + this.def.name;
    if (m.souls) {
      this.souls = true;
      this.kind = role;
      this.arena = m.arena ?? null;
      this.aware = !!this.arena;
      this.focus = 'player';
      this.state = 'fight';
      this.home = { x, y };
      this.core = new EnemyCore(this, { poise: POISE[role] * (this.elite ? 1.5 : 1) * (1 + lvl * 0.25), head: () => { const h = this.rig.headWorld(_v); return { x: h.x, y: h.y + 0.35 }; } });
      this.core.speed = (this.elite ? 1.15 : 1) * (1 + (m.iq ?? 0.4) * 0.15);
      this.core.dmgMul = this.dmgMul;
      this.core.onStagger = (w, k) => { this.rig.play('flinch', true); this.comboLeft = 0; this.aimLine?.hide(); if (k !== 'flinch') this.say(w, 'hurt'); };
      this.react = 0.3;
    }
  }
  /** the duel brain's squad for this world */
  static duelSquad(w: World) { let s = duelSquads.get(w); if (!s) duelSquads.set(w, (s = newSquad())); return s; }

  get busy() { return this.rig.busy; }
  get pivot() { return this.rig.height * 0.5; }
  get dead() { return this.state === 'dead'; }
  /** where the netter's hauling line attaches */
  haulPoint(out: THREE.Vector3) { return this.rig.boneWorld('handR', out); }

  // ---------------------------------------------------------------- per frame
  update(dt: number, w: World) {
    const bb = board(w);
    this.w = w;
    this.stateT += dt;
    if (this.pendingBark && bb.time >= this.pendingBark.t) { this.say(w, this.pendingBark.ev, true); this.pendingBark = null; }
    this.ragWorld.ground = (x: number) => w.terrain.floorAt(x);
    if (this.state === 'dead') { this.corpse(dt, w); return; }
    const p = w.player;
    if (!this.ai) {
      this.rig.mode = this.def.walker ? 'stand' : 'tread';
      this.rig.facing = p.x > this.x ? 1 : -1;
      this.rig.aimAt(p.x, p.y); this.rig.lookAt(p.x, p.y);
      this.rig.update(dt);
      this.rig.group.position.set(this.x, this.y, 0);
      return;
    }
    if (this.souls) { this.duel(dt, w); return; }
    const surf = w.water.heightAt(this.x);
    const floor = w.terrain.floorAt(this.x);
    this.cool -= dt; this.react -= dt; this.dodgeCd -= dt; this.plantCd -= dt;
    // ---- senses
    const dP = Math.hypot(p.x - this.x, p.y - this.y);
    const sight = 8 + this.iq * 5;
    const canSee = p.alive && dP < sight && los(w, this.x, this.y + 0.2, p.x, p.y);
    if (canSee) {
      if (!this.sawPlayer) { this.react = 0.9 - this.iq * 0.6; this.sawPlayer = true; }
      this.seenT = bb.time; bb.seen = { x: p.x, y: p.y, t: bb.time };
    } else this.sawPlayer = false;
    // smart ones sidestep a blobfish dashing straight at them
    if (this.iq > 0.5 && this.dodgeCd <= 0 && !this.def.walker && p.alive && dP < 2.8) {
      const pv = Math.hypot(p.vx, p.vy);
      if (pv > 5.5 && ((this.x - p.x) * p.vx + (this.y - p.y) * p.vy) / (dP * pv) > 0.75) {
        const sx = -p.vy / pv, sy = p.vx / pv, side = Math.sign(sx * (this.x - p.x) + sy * (this.y - p.y)) || 1;
        this.vx += sx * side * 5.5; this.vy += sy * side * 5.5;
        this.dodgeCd = 2.6 - this.iq;
        bubbles(w, this.x, this.y, 6, 0.6);
      }
    }
    const aggroR = 2.6 + this.iq * 3;
    if (canSee && dP < aggroR) this.provoke(w, 'spot');
    if ((bb.alert.get(this.squad.id) ?? -1) > bb.time && this.focus === 'wreck' && this.provokedUntil < bb.time) { this.focus = 'player'; this.provokedUntil = bb.alert.get(this.squad.id)!; }
    const wreckOk = !!this.objective && this.objective.alive && (this.objective.hp ?? 1) > 0;
    if (this.focus === 'player' && this.provokedUntil < bb.time && bb.time - this.seenT > 5 && wreckOk) this.focus = 'wreck';
    if (!wreckOk) this.focus = 'player';
    // ---- bleeding (a blood trail), drowning without the air hose, freediver breath
    if (this.bleedK > 0.05) { if (Math.random() < dt * 6 * this.bleedK) bleed(w, this.x, this.y, this.bleedK * 0.5); this.bleedK = Math.max(0, this.bleedK - dt * 0.03); }
    if (this.hoseCut) { this.hp -= dt * (this.role === 'titan' ? 1.5 : 1.2); if (Math.random() < dt * 20) bubbles(w, this.x, this.y + this.rig.height * 0.4, 2, 1.2); if (this.hp <= 0) { this.die(w, 0, 1, 'crush', null); return; } }
    if (this.role === 'spear') this.breath -= dt;
    // ---- decide
    const hpK = this.hp / this.maxHp;
    if (this.state !== 'retreat' && this.state !== 'breathe' && hpK < 0.34 && this.iq > 0.2 && !this.def.walker && !this.nemesisBoss()) {
      // a medic nearby? hang on for him; else get out
      const medic = this.squad.alive.find((m) => m.role === 'medic' && m !== this && Math.hypot(m.x - this.x, m.y - this.y) < 12);
      if (!medic || this.disarmed) this.setState('retreat', w, 'retreat');
    }
    if (this.disarmed && this.state !== 'retreat') this.setState('retreat', w, 'retreat');
    if (this.role === 'spear' && this.breath < 5 && this.state !== 'breathe' && this.state !== 'retreat') this.setState('breathe', w, 'air');
    if (this.state === 'enter' && (this.focus === 'player' || (this.objective && Math.hypot(this.objective.x - this.x, this.objective.y - this.y) < 16))) this.setState('fight', w);
    if (this.state === 'enter' && !this.objective) this.setState('fight', w);
    // ---- the target this frame
    const tgt: Entity | null = this.focus === 'player' ? p : this.objective;
    let tx = tgt ? tgt.x : this.x, ty = tgt ? tgt.y : this.y;
    if (this.focus === 'player' && !canSee && bb.time - bb.seen.t < 6) { tx = bb.seen.x; ty = bb.seen.y; }
    // ---- where to go
    let gx = this.x, gy = this.y, sprint = 1;
    switch (this.state) {
      case 'enter': { const o = this.objective ?? p; gx = o.x + (this.x < o.x ? -8 : 8); gy = o.y + 2; sprint = 1.5; break; }
      case 'fight': [gx, gy] = this.fightPoint(w, tx, ty, dP, canSee); break;
      case 'cover': {
        if (!this.coverPt || this.stateT > 4 || this.rig.loaded && this.stateT > 1.2) { this.setState('fight', w); break; }
        gx = this.coverPt.x; gy = this.coverPt.y; sprint = 1.25; break;
      }
      case 'retreat': {
        const away = Math.sign(this.x - p.x) || 1;
        gx = this.x + away * 3; gy = surf + 0.5; sprint = 1.25;
        if (this.y > surf - 0.45) { this.escape(w); return; }
        break;
      }
      case 'breathe': {
        gx = this.x + (Math.sign(this.x - p.x) || 1) * 1.5; gy = surf - 0.3;
        if (this.y > surf - 0.7) { this.breath += dt * 10; this.rig.mode = 'tread'; if (this.breath > 28) this.setState('fight', w); }
        sprint = 1.2; break;
      }
      case 'heal': {
        const t = this.healTarget;
        if (!t || t.state === 'dead' || t.state === 'escaped' || t.hp >= t.maxHp * 0.85) { this.healTarget = null; this.setState('fight', w); break; }
        gx = t.x - Math.sign(t.x - this.x) * 0.9; gy = t.y + 0.2;
        if (Math.hypot(t.x - this.x, t.y - this.y) < 1.4 && !this.busy) this.rig.play('heal');
        break;
      }
    }
    // ---- move
    this.steer(dt, w, gx, gy, sprint, surf, floor);
    // ---- face + aim + attack
    const engage = this.state === 'fight' || this.state === 'cover' || this.state === 'heal' || (this.state === 'breathe' && this.y < surf - 1);
    const sp = Math.hypot(this.vx, this.vy);
    const lookX = engage ? tx : this.x + this.vx;
    if (Math.abs(lookX - this.x) > 0.3 && !this.busy) this.rig.facing = lookX > this.x ? 1 : -1;
    this.aimX = tx; this.aimY = ty;
    if (this.focus === 'player' && tgt === p && this.iq > 0.3 && this.def.projSpeed > 0) {
      // lead the target by the projectile's travel time
      const tt = dP / this.def.projSpeed;
      this.aimX += p.vx * tt * Math.min(1, this.iq); this.aimY += p.vy * tt * Math.min(1, this.iq);
    }
    this.rig.aimAt(engage ? this.aimX : null, this.aimY);
    this.rig.lookAt(engage ? tx : null, ty);
    if (engage && tgt) this.attack(w, tgt, tx, ty, dP, canSee);
    // ---- animation mode
    if (this.def.walker) this.rig.mode = sp > 0.15 ? 'walk' : 'stand';
    else if (this.state === 'breathe' && this.y > surf - 0.8) this.rig.mode = 'tread';
    else this.rig.mode = sp > 0.9 || this.state === 'retreat' || this.state === 'enter' ? 'swim' : 'tread';
    this.rig.swimAngle = Math.atan2(this.vy, Math.abs(this.vx) + 0.3);
    this.rig.speed = clamp(sp / (this.def.speed * this.speedMul), 0, 1);
    this.rig.hurt = clamp(1 - hpK * 1.6, 0, 0.8);
    this.rig.expr = this.state === 'retreat' ? 'scared' : this.hoseCut ? 'scared' : this.focus === 'player' ? (this.def.weapon === 'knife' ? 'angry' : 'focus') : 'concentrate';
    this.rig.update(dt);
    this.rig.group.position.set(this.x, this.y, 0);
    if (this.hose) this.updateHose(dt, w);
    if (this.tag) { this.tag.position.set(this.x, this.y + this.rig.height * 0.75 + 0.35, 0.8); this.tag.visible = dP < 9; }
  }

  private nemesisBoss() { return this.role === 'titan' || (this.nemesis?.level ?? 0) >= 3; }

  /** where a fighting human wants to be */
  private fightPoint(w: World, tx: number, ty: number, dP: number, canSee: boolean): [number, number] {
    const [rMin, rMax] = this.def.range;
    let pref = (rMin + rMax) / 2;
    if (this.focus === 'wreck') pref = Math.max(rMin, Math.min(rMax, (this.objective?.r ?? 2) + rMin));
    if (this.role === 'knife') {
      // circle in from behind the blobfish (it faces where it last swam); straight at the wreck to plant charges
      if (this.focus === 'player') {
        const p = w.player;
        const behind = -(p.facing || 1);
        const side = this.iq > 0.45 && dP > 2 ? behind : Math.sign(this.x - tx) || 1;
        return [tx + side * 0.7, ty + this.circle * 0.3];
      }
      return [tx + (this.x < tx ? -1 : 1) * ((this.objective?.r ?? 2) * 0.7), ty + 0.3];
    }
    if (this.role === 'medic') {
      // hang back behind the squad's centre, away from the blobfish
      const al = this.squad.alive.filter((m) => m !== this);
      const cx = al.length ? al.reduce((s, m) => s + m.x, 0) / al.length : this.x;
      const cy = al.length ? al.reduce((s, m) => s + m.y, 0) / al.length : this.y;
      const away = Math.sign(cx - tx) || 1;
      return [cx + away * 2.5, cy + 0.8];
    }
    // ranged: a flank slot round the target at preferred range (spread wider the smarter the squad)
    const mates = this.squad.alive.filter((m) => m.def.projSpeed > 0 && m.role !== 'knife');
    const i = Math.max(0, mates.indexOf(this)), n = Math.max(1, mates.length);
    const base = Math.atan2(this.squad.alive.reduce((s, m) => s + m.y, 0) / Math.max(1, this.squad.alive.length) - ty, this.squad.alive.reduce((s, m) => s + m.x, 0) / Math.max(1, this.squad.alive.length) - tx);
    const spread = (this.iq > 0.4 && this.focus === 'player' ? 1.0 : 0.35) * (n > 1 ? 1 : 0);
    let ang = base + spread * (i - (n - 1) / 2);
    if (this.def.walker) { ang = this.x < tx ? Math.PI : 0; pref = Math.min(pref, 6); }
    let gx = tx + Math.cos(ang) * pref, gy = ty + Math.sin(ang) * pref;
    // no line of sight from there: rise above the rocks
    if (!canSee && this.focus === 'player') gy += 1.5;
    if (this.def.walker) gy = this.y;
    return [gx, gy];
  }

  private steer(dt: number, w: World, gx: number, gy: number, sprint: number, surf: number, floor: number) {
    const maxV = this.def.speed * this.speedMul * sprint * (1 - this.legLoss * 0.35) * (this.hoseCut ? 1.25 : 1);
    if (this.def.walker) {
      // plod along the seabed
      const dx = gx - this.x;
      const want = Math.abs(dx) > 0.4 ? Math.sign(dx) * maxV * Math.min(1, Math.abs(dx) / 1.5) : 0;
      this.vx += (want - this.vx) * (1 - Math.exp(-dt * 2.5));
      if (w.terrain.sdf(this.x + Math.sign(this.vx) * 0.8, floor + this.pivot) < 0.2) this.vx *= 0.2;
      this.x += this.vx * dt;
      const fl = w.terrain.floorAt(this.x);
      this.y += (fl + this.rig.pivotHeight - this.y) * (1 - Math.exp(-dt * 10));
      this.vy = 0;
      if (Math.abs(this.vx) > 0.3 && Math.random() < dt * 3) silt(w, this.x, fl + 0.05, 2);
      this.clampX();
      return;
    }
    let dx = gx - this.x, dy = gy - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const arrive = Math.min(1, d / 1.4);
    let wx = (dx / d) * maxV * arrive, wy = (dy / d) * maxV * arrive;
    // separation from squadmates
    for (const m of this.squad.members) {
      if (m === this || m.state === 'dead') continue;
      const sx = this.x - m.x, sy = this.y - m.y, sd = Math.hypot(sx, sy);
      if (sd < 1.5 && sd > 1e-3) { wx += (sx / sd) * (1.5 - sd) * 2; wy += (sy / sd) * (1.5 - sd) * 2; }
    }
    // rocks: steer round anything ahead
    const ahead = w.terrain.sdf(this.x + this.vx * 0.5, this.y + this.vy * 0.5);
    if (ahead < 0.8) { const n = w.terrain.normal(this.x, this.y); wx += n.x * (0.8 - ahead) * 5; wy += n.y * (0.8 - ahead) * 5; }
    this.vx += (wx - this.vx) * (1 - Math.exp(-dt * 2.6));
    this.vy += (wy - this.vy) * (1 - Math.exp(-dt * 2.6));
    this.x += this.vx * dt; this.y += this.vy * dt;
    // water column limits
    const top = this.state === 'retreat' || this.state === 'breathe' ? surf - 0.1 : surf - 0.8;
    if (this.y > top) { this.y = top; this.vy = Math.min(0, this.vy); }
    if (this.y < floor + 0.6) { this.y = floor + 0.6; this.vy = Math.max(0, this.vy); }
    const s = w.terrain.sdf(this.x, this.y);
    if (s < 0.45) { const n = w.terrain.normal(this.x, this.y); this.x += n.x * (0.45 - s); this.y += n.y * (0.45 - s); }
    this.clampX();
    // exhaled bubbles from the regulator every few breaths
    if (this.role !== 'spear' && Math.random() < dt * 0.6) bubbles(w, this.x + this.rig.facing * 0.3, this.y + 0.3, 3, 0.8);
  }
  private clampX() {
    const b = this.area?.bounds;
    if (!b) return;
    if (this.state === 'enter') return;
    this.x = clamp(this.x, b.x0 + 0.5, b.x1 - 0.5);
  }

  /** fire / stab / throw / heal / flare when ready */
  private attack(w: World, tgt: Entity, tx: number, ty: number, dP: number, canSee: boolean) {
    if (this.busy || this.disarmed || this.react > 0) return;
    const bb = board(w);
    const dT = Math.hypot(tx - this.x, ty - this.y);
    const [, rMax] = this.def.range;
    const clear = this.focus === 'wreck' || canSee;
    // medic: heal the worst-off squadmate first; flare for help when the squad is getting hurt
    if (this.role === 'medic') {
      const hurt = this.squad.alive.filter((m) => m !== this && m.hp < m.maxHp * 0.7).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && this.state !== 'heal') { this.healTarget = hurt; this.setState('heal', w, 'heal'); return; }
      if (!this.squad.flared && (this.squad.losses >= 1 || this.focus === 'player') && this.cool <= 0 && this.iq > 0.25) { this.rig.play('flare'); this.squad.flared = true; this.say(w, 'flare', true); }
      return;
    }
    if (this.cool > 0) return;
    if (this.role === 'knife') {
      if (this.focus === 'wreck') {
        if (dT < (this.objective?.r ?? 2) + 1.4 && this.plantCd <= 0) { this.rig.play('stab'); this.plantCd = 9; }
      } else if (dP < 1.35) { this.rig.play('stab'); this.cool = this.def.reload * this.reloadMul; }
      return;
    }
    if (this.role === 'net') {
      if (this.focus === 'player' && dP < rMax + 1 && canSee && !bb.netOn) { this.rig.play('throw'); this.cool = this.def.reload * this.reloadMul; this.say(w, 'net'); }
      return;
    }
    // guns
    if (!this.rig.loaded) { if (!this.busy) this.reload(w); return; }
    if (clear && dT < rMax * 1.35) {
      this.rig.play('fire');
      this.cool = this.def.reload * this.reloadMul;
    }
  }

  private reload(w: World) {
    this.rig.play('reload');
    // smart shooters duck behind a rock while they re-cock
    if (this.iq > 0.25 && this.focus === 'player' && !this.def.walker && this.state === 'fight') {
      const c = this.findCover(w);
      if (c) { this.coverPt = c; this.setState('cover', w, 'cover'); return; }
    }
    if (Math.random() < 0.3) this.say(w, 'reload');
  }

  private findCover(w: World): { x: number; y: number } | null {
    const p = w.player;
    let best: { x: number; y: number } | null = null, bd = 7;
    for (const r of w.terrain.snags(this.x - 7, this.x + 7)) {
      const ax = r.x - p.x, ay = r.y - p.y, al = Math.hypot(ax, ay) || 1;
      const cx = r.x + (ax / al) * (r.r + 0.7), cy = Math.max(r.y + (ay / al) * (r.r + 0.7), w.terrain.floorAt(r.x) + 0.7);
      if (w.terrain.sdf(cx, cy) < 0.35) continue;
      const d = Math.hypot(cx - this.x, cy - this.y);
      if (d < bd && !los(w, cx, cy, p.x, p.y)) { bd = d; best = { x: cx, y: cy }; }
    }
    return best;
  }

  /** the action's release frame (from the rig) */
  private release(a: DiverAct) {
    const w = this.w;
    if (!w || this.state === 'dead') return;
    if (this.souls) { this.duelRelease(a, w); return; }
    const m = this.rig.muzzleWorld(_v);
    const mx = m.x, my = m.y;
    const p = w.player;
    switch (a) {
      case 'fire': {
        const err = (0.32 - Math.min(1, this.iq) * 0.28) * (Math.random() - 0.5) * 2;
        const ang = Math.atan2(this.aimY - my, this.aimX - mx) + err;
        const sp = this.def.projSpeed;
        const big = this.def.weapon === 'cannon';
        w.add(new Harpoon(mx, my, Math.cos(ang) * sp, Math.sin(ang) * sp, Math.max(1, Math.round(this.def.dmg * this.dmgMul)), this, this.focus === 'wreck' ? this.objective : null, big));
        muzzle(w, mx, my, ang, big ? 1.2 : 0.6);
        w.sfx(big ? 'thud_heavy' : 'rope_twang', mx, big ? 0.8 : 0.6, big ? 0.7 : 1.6);
        w.game.addShake(big ? 0.08 : 0.02);
        break;
      }
      case 'throw': {
        const tt = Math.hypot(p.x - mx, p.y - my) / this.def.projSpeed;
        const ax = p.x + p.vx * tt * this.iq, ay = p.y + p.vy * tt * this.iq;
        const ang = Math.atan2(ay - my, ax - mx);
        w.add(new ThrownNet(mx, my, Math.cos(ang) * this.def.projSpeed, Math.sin(ang) * this.def.projSpeed + 0.6, this, 1 + this.iq));
        w.sfx('net', mx, 0.7);
        break;
      }
      case 'stab': {
        if (this.focus === 'wreck' && this.objective) {
          // a limpet mine slapped onto the hull
          w.add(new LimpetMine(mx, my, this.objective, this, 6 * this.dmgMul));
          this.say(w, 'wreck');
          break;
        }
        if (Math.hypot(p.x - mx, p.y - my) < p.r + 0.45) {
          if (hurtPlayer(w, Math.max(1, Math.round(this.def.dmg * this.dmgMul)), this.x, this.y, 'spike', this, 'knife')) { gore(w, p.x, p.y, 0.4); this.dealt++; }
        } else w.sfx('swish_b', mx, 0.4);
        break;
      }
      case 'heal': {
        const t = this.healTarget;
        if (t && t.state !== 'dead') {
          t.hp = Math.min(t.maxHp, t.hp + Math.max(3, t.maxHp * 0.45)); t.bleedK = 0;
          w.text.pop('+', t.x, t.y + 0.9, 'heal', { size: 0.4 });
          if (t.state === 'retreat') t.setState('fight', w);
        }
        break;
      }
      case 'flare': {
        w.add(new Flare(mx, my, this.squad.id, (x) => this.onFlare?.(x, this)));
        muzzle(w, mx, my, Math.PI / 2, 0.8);
        w.sfx('laser_shot', mx, 0.5, 0.6);
        break;
      }
    }
  }


  setState(s: State, w: World, ev?: BarkEvent) {
    if (this.state === s || this.state === 'dead') return;
    this.state = s; this.stateT = 0;
    if (ev) this.say(w, ev, s === 'retreat');
  }

  /** shout, rate-limited per human */
  say(w: World, ev: BarkEvent, force = false) {
    const t = board(w).time;
    if (!force && t - this.lastBarkT < 7) return;
    const lines = this.nemesis ? nemesisLines(this.nemesis, ev) : null;
    if (bark(w, lines ?? ev, this.x, this.y, { force, follow: () => ({ x: this.x, y: this.y + this.rig.height * 0.2 }), style: this.nemesis ? 'danger' : 'body' })) this.lastBarkT = t;
  }

  /** the blobfish made it personal: switch to it and alert the squad */
  provoke(w: World, why: 'spot' | 'hit') {
    const bb = board(w);
    const was = this.focus === 'player' && this.provokedUntil > bb.time;
    this.focus = 'player';
    this.provokedUntil = bb.time + 8 + this.iq * 8;
    bb.alert.set(this.squad.id, Math.max(bb.alert.get(this.squad.id) ?? 0, bb.time + 6 + this.iq * 6));
    if (!was) {
      this.say(w, why === 'hit' ? 'hurt' : 'spot', true);
      // the leader waves a squadmate round the flank
      if (this.iq > 0.45 && this.squad.alive.length > 2 && !this.busy && this.role !== 'net') { this.rig.play('signal'); this.pendingBark = { ev: 'flank', t: bb.time + 1.8 }; }
    }
  }

  // ---------------------------------------------------------------- damage
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (this.state === 'escaped') return false;
    if (this.state === 'dead') return this.hitCorpse(dmg, dirX, dirY, w, kind);
    const k = kind ?? 'sword';
    let d = dmg * (1 - this.def.armor) * (k === 'explosion' ? 1.25 : 1);
    if (this.souls) {
      if (!this.aware) this.notice(w, 'hit');
      d = this.core!.receive(w, d, dirX, dirY, k);
      if (d < 0) return false;
      if (this.core!.attacking && this.healAlly && this.core!.is('heal')) { callout(w, 'INTERRUPTED', this.x, this.y + 1.2, 'gold', 0.4); this.core!.stagger(w, 0.9, 'broken'); }
    } else if (this.def.walker && k === 'sword' && Math.random() < 0.35) { d *= 0.3; w.sfx('sw_clang', this.x, 0.6); w.text.pop('CLANG', this.x, this.y + 1, 'hint', { size: 0.26 }); }
    this.hp -= d;
    const mass = this.def.mass;
    this.vx += dirX * 3 / mass; this.vy += dirY * 2 / mass;
    gore(w, this.x - dirX * 0.2, this.y - dirY * 0.2 + 0.1, 0.25 + Math.min(1.2, (d / this.maxHp) * 2.5), dirX, dirY);
    this.bleedK = Math.min(1, this.bleedK + (d / this.maxHp) * 1.6);
    if (this.souls) { if (!this.core!.attacking && !this.def.walker) this.rig.play('flinch', !this.busy || this.rig.action === 'reload'); this.lean += (this.rig.facing * dirX < 0 ? 1 : -1) * 0.25 * this.rig.facing; }
    else if (!this.def.walker || d > 3) this.rig.play('flinch', !this.busy || this.rig.action === 'reload');
    if (src && (src.team === 'player' || src === (w.player as Entity))) this.provoke(w, 'hit');
    else if (k !== 'explosion') this.provoke(w, 'hit');
    if (k === 'bite') { chunks(w, this.x, this.y, 2, 2); this.scars.add('bite'); this.events.push('bitten'); }
    if (k === 'zap' || k === 'laser' || k === 'explosion') this.scars.add('burns');
    if (k === 'sword' && d >= 1) this.scars.add(Math.random() < 0.5 ? 'scar' : 'stitches');
    if (this.hp <= 0) { this.die(w, dirX, dirY, k, src); return true; }
    // dismemberment on heavy blows: an arm or a leg comes off and he probably runs
    const severK = k === 'sword' || k === 'bite' || k === 'explosion' || k === 'crush' ? d / this.maxHp : 0;
    if (severK > 0.28 && Math.random() < severK * 1.2) {
      const part = this.nearestLimb(src ?? { x: this.x - dirX, y: this.y - dirY } as Entity, false);
      if (part) this.cut(w, part, dirX, dirY);
    }
    return true;
  }

  /** sever a part: gib into the world, disable what it carried */
  cut(w: World, part: SeverPart, dx = 0, dy = 0) {
    const gib = this.rig.sever(part);
    if (!gib) return;
    w.scene.add(gib);
    spawnLimb(w, gib, this.vx + dx * 3 + (Math.random() - 0.5) * 2, this.vy + dy * 3 + 1, part === 'head');
    if (part === 'handR' || part === 'farmR' || part === 'uarmR') {
      this.disarmed = this.state !== 'dead';
      this.scars.add('hookHand');
      this.events.push('lost his hand');
    }
    if (part.endsWith('L') && (part.startsWith('hand') || part.startsWith('farm') || part.startsWith('uarm'))) { this.scars.add('bandage'); this.events.push('lost an arm'); }
    if (part.startsWith('thigh') || part.startsWith('shin') || part.startsWith('foot')) { this.legLoss++; this.scars.add('bandage'); this.events.push('lost a leg'); }
    w.sfx('crunch', this.x, 0.8); w.sfx('hit_squish1', this.x, 0.7, 0.8);
    w.game.freeze(0.05);
    if (this.state !== 'dead') this.say(w, 'hurt', true);
  }

  private nearestLimb(from: { x: number; y: number }, lethal: boolean): SeverPart | null {
    const cands: SeverPart[] = lethal ? ['head', 'uarmL', 'uarmR', 'thighL', 'thighR', 'farmL', 'farmR', 'shinL', 'shinR'] : ['farmL', 'farmR', 'handR', 'shinL', 'shinR', 'footL', 'footR'];
    let best: SeverPart | null = null, bd = 1e9;
    for (const c of cands) {
      if (this.rig.isSevered(c)) continue;
      const p = this.rig.boneWorld(c === 'head' ? 'head' : c, _v);
      const d = Math.hypot(p.x - from.x, p.y - from.y) + Math.random() * 0.25;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  die(w: World, dx: number, dy: number, kind: DamageKind, src: Entity | null) {
    if (this.state === 'dead') return;
    this.state = 'dead'; this.stateT = 0;
    this.team = 'neutral';
    this.kind = 'corpse';
    this.hp = 0;
    this.rig.die(this.vx, this.vy, dx * 3, dy * 3);
    const wpn = this.rig.dropWeapon();
    if (wpn) { const h = new THREE.Group(); h.position.copy(wpn.position); wpn.position.set(0, 0, 0); h.add(wpn); h.userData.radius = 0.15; w.scene.add(h); spawnProp(w, h, this.vx, this.vy); }
    gore(w, this.x, this.y, 1.2, dx, dy);
    chunks(w, this.x, this.y, kind === 'explosion' ? 8 : 2, kind === 'explosion' ? 5 : 2);
    if (kind === 'explosion') { for (let i = 0; i < 2; i++) { const pt = this.nearestLimb({ x: this.x + (Math.random() - 0.5) * 3, y: this.y + (Math.random() - 0.5) * 3 }, true); if (pt && pt !== 'head') this.cut(w, pt, dx, dy); } }
    else if ((kind === 'sword' || kind === 'bite') && Math.random() < 0.55) { const pt = this.nearestLimb(src ?? { x: this.x - dx, y: this.y - dy }, true); if (pt) this.cut(w, pt, dx, dy); }
    if (this.hose && !this.hose.snapped) this.hose.alive = false;
    this.tag?.removeFromParent();
    w.sfx('hit_squish1', this.x, 0.8, 0.7); w.sfx('bubbles_a', this.x, 0.6);
    bubbles(w, this.x, this.y + 0.3, 14, 1.4);
    this.aimLine?.hide();
    if (this.grabT > 0) { this.grabT = 0; w.player.hooked = false; }
    if (this.souls) {
      // v3: the dungeon drops the loot; we only report the kill
      w.emit('kill', { kind: this.role, x: this.x, y: this.y, elite: this.elite, nemesis: this.nemesisId ?? null });
    } else {
      w.emit('kill', { kind: 'human:' + this.role, x: this.x, y: this.y, nemesis: this.nemesisId ?? null });
      // loot: coins + a material or two
      w.drop(this.x, this.y, { coins: this.def.bounty * (this.elite ? 2 : 1) });
      if (Math.random() < 0.6 || this.elite) w.drop(this.x + 0.3, this.y, { item: this.def.loot[Math.floor(Math.random() * this.def.loot.length)] });
    }
    // someone notices
    const mate = this.squad.alive.find((m) => m !== this && Math.hypot(m.x - this.x, m.y - this.y) < 10);
    if (mate) mate.say(w, 'manDown', true);
    this.onDeath?.(this, w, src, kind);
  }

  private hitCorpse(dmg: number, dx: number, dy: number, w: World, kind?: DamageKind): boolean {
    gore(w, this.x, this.y, 0.6, dx, dy);
    chunks(w, this.x, this.y, 1, 2);
    this.rig.rag.kick(dx * 3, dy * 3 + 1);
    if ((kind === 'sword' || kind === 'bite' || kind === 'explosion') && Math.random() < 0.5 + dmg * 0.1) {
      const pt = this.nearestLimb({ x: this.x - dx, y: this.y - dy }, true);
      if (pt) this.cut(w, pt, dx, dy);
    }
    return true;
  }

  private corpse(dt: number, w: World) {
    this.deadT += dt;
    this.rig.update(dt, this.ragWorld);
    this.rig.rag.pelvisWorld(_v);
    if (this.rig.rag.active) { this.x = _v.x; this.y = _v.y; }
    if (this.deadT < 5 && Math.random() < dt * 3) bleed(w, this.x, this.y, 0.25);
    if (this.deadT > 35) { this.rig.group.position.y -= dt * 0.1; }
    if (this.deadT > 45) this.alive = false;
  }

  private escape(w: World) {
    this.state = 'escaped';
    this.alive = false;
    w.fx.splash(this.x, 1);
    w.sfx('splash_s', this.x, 0.6);
    this.say(w, 'escape', true);
    this.events.push('escaped');
    w.emit('escaped', { kind: 'human:' + this.role, x: this.x, nemesis: this.nemesisId ?? null });
    this.onEscape?.(this, w);
  }

  // ================================================================ v3: the souls-like duel brain
  /** lock into an arena (J's encounter lock) or go back to roaming round where it stands (null) */
  bindArena(a: Arena | null) { this.arena = a; if (a) { this.aware = true; this.returning = false; } else this.home = { x: this.x, y: this.y }; }
  /** become aware of the blobfish (and wake allies nearby) */
  notice(w: World, why: 'sight' | 'hit' | 'ally' = 'sight') {
    if (!this.souls || this.aware || this.state === 'dead') return;
    this.aware = true; this.returning = false; this.lostT = 0;
    this.react = Math.max(this.react, 0.5 - this.iq * 0.3);
    if (why !== 'ally') {
      w.text.pop('!', this.x, this.y + this.rig.height * 0.6 + 0.3, 'danger', { size: 0.45, life: 0.7 });
      this.say(w, 'spot', true);
      for (const e of w.near(this.x, this.y, 8, 'enemy')) (e as unknown as { notice?: (w: World, why: string) => void }).notice?.(w, 'ally');
    }
  }
  private duelBox(w: World): Arena {
    if (this.arena) return this.arena;
    const b = this.box;
    b.x0 = this.home.x - this.leash; b.x1 = this.home.x + this.leash;
    b.floor = w.terrain.floorAt(this.x); b.top = w.water.heightAt(this.x) - 0.8;
    return b;
  }
  private floorY(w: World) { return Math.max(this.arena ? this.arena.floor : -1e9, w.terrain.floorAt(this.x)); }
  /** where the glint shows: the weapon */
  private tellPoint() { const m = this.rig.muzzleWorld(_v); return { x: m.x, y: m.y }; }

  private duel(dt: number, w: World) {
    const bb = board(w);
    bb.time = Math.max(bb.time, w.time);
    const p = w.player, c = this.core!;
    const box = this.duelBox(w);
    this.cool -= dt; this.react -= dt; this.backoff -= dt;
    const dP = Math.hypot(p.x - this.x, p.y - this.y);
    const canSee = p.alive && dP < 11 && los(w, this.x, this.y + 0.2, p.x, p.y);
    // ---- awareness: an arena means a fight; roaming, they notice, chase within the leash, and give up
    if (this.arena) this.aware = true;
    else if (!this.aware) { if (canSee && dP < 7 + this.iq * 3) this.notice(w); }
    else {
      const out = Math.abs(p.x - this.home.x) > this.leash + 3 || !p.alive;
      this.lostT = canSee ? 0 : this.lostT + dt;
      if ((out || this.lostT > 5) && !c.attacking) { this.aware = false; this.returning = true; this.aimLine?.hide(); }
    }
    if (this.bleedK > 0.05) { if (Math.random() < dt * 6 * this.bleedK) bleed(w, this.x, this.y, this.bleedK * 0.5); this.bleedK = Math.max(0, this.bleedK - dt * 0.05); }
    c.facing = this.rig.facing;
    c.update(dt, w, () => this.tellPoint());
    if (this.grabT > 0) this.updateGrab(dt, w);
    // ---- where to be
    let gx = this.x, gy = this.y, sprint = 1;
    const side = Math.sign(this.x - p.x) || 1;
    if (!this.aware) {
      if (this.returning) {
        gx = this.home.x; gy = this.home.y; sprint = 1.1;
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12 * dt);
        if (Math.hypot(this.home.x - this.x, this.home.y - this.y) < 0.8) this.returning = false;
      } else { this.patrolPh += dt * 0.3; gx = this.home.x + Math.sin(this.patrolPh) * 3.5; gy = this.home.y + Math.sin(this.patrolPh * 1.7) * 0.4; sprint = 0.45; }
    } else if (c.phase === 'stagger' || this.grabT > 0) { gx = this.x; gy = this.y; sprint = 0; }
    else [gx, gy, sprint] = this.duelGoal(w, dP, side);
    if (c.attacking && c.phase !== 'recover') sprint *= 0.15;
    this.duelSteer(dt, w, gx, gy, sprint, box);
    // ---- face + aim
    const sp = Math.hypot(this.vx, this.vy);
    const lockFace = c.phase === 'active' || (c.phase === 'windup' && c.k > 0.75) || c.phase === 'stagger';
    if (!lockFace) {
      const lookX = this.aware ? p.x : this.x + this.vx;
      if (Math.abs(lookX - this.x) > 0.3) this.rig.facing = lookX > this.x ? 1 : -1;
    }
    if (this.aware && !this.busy) { this.rig.aimAt(p.x, p.y); this.rig.lookAt(p.x, p.y); }
    else if (!this.aware) { this.rig.aimAt(null); this.rig.lookAt(null); }
    // ---- attack
    if (this.aware && !c.busy && this.cool <= 0 && this.react <= 0 && p.alive && this.grabT <= 0 && !this.disarmed) {
      const m = this.pickMove(w, dP, canSee);
      if (m) { c.start(m); this.moveStart(w, m); }
    }
    if (this.souls && !c.busy && !this.rig.loaded && !this.busy && (this.role === 'harpoon' || this.role === 'spear' || this.role === 'heavy')) this.rig.play('reload');
    this.runMove(dt, w, dP);
    // ---- body
    this.lean = damp(this.lean, this.leanTarget(c), 10, dt);
    this.rig.group.rotation.z = this.lean;
    if (this.def.walker) this.rig.mode = sp > 0.15 ? 'walk' : 'stand';
    else this.rig.mode = !this.aware && sp > 0.6 ? 'swim' : sp > 2.2 && !c.attacking ? 'swim' : 'tread';
    this.rig.swimAngle = Math.atan2(this.vy, Math.abs(this.vx) + 0.3);
    this.rig.speed = clamp(sp / (this.def.speed * this.speedMul), 0, 1);
    this.rig.hurt = clamp(1 - (this.hp / this.maxHp) * 1.6, 0, 0.8);
    this.rig.expr = c.phase === 'stagger' ? 'scared' : !this.aware ? 'concentrate' : this.def.weapon === 'knife' || c.phase === 'windup' ? 'angry' : 'focus';
    this.rig.update(dt);
    this.rig.group.position.set(this.x, this.y, 0);
    if (this.tag) { this.tag.position.set(this.x, this.y + this.rig.height * 0.75 + 0.35, 0.8); this.tag.visible = dP < 9; }
  }

  private leanTarget(c: EnemyCore) {
    const f = this.rig.facing;
    if (c.phase === 'windup') return (this.core!.move?.id === 'sweep' || this.core!.move?.id === 'grab' ? 0.35 : 0.22) * f * Math.min(1, c.k * 1.5);
    if (c.phase === 'active') return -0.3 * f;
    if (c.phase === 'stagger') return 0.3 * f + Math.sin(c.t * 18) * 0.06;
    return 0;
  }

  /** the spot a fighting human wants, per role: [x, y, sprint] */
  private duelGoal(w: World, dP: number, side: number): [number, number, number] {
    const p = w.player;
    switch (this.role) {
      case 'knife':
        if (this.backoff > 0) return [p.x + side * 3, p.y + 0.6, 1.1];
        return [p.x + side * 1.05, p.y + this.circle * 0.15, 1.2];
      case 'net': return [p.x + side * (dP < 2.5 ? 5 : 4), p.y + 0.8, 1];
      case 'heavy': case 'titan': return [p.x + side * 1.6, this.y, 1];
      case 'medic': {
        const al = w.entities.filter((e) => e.team === 'enemy' && e !== (this as Entity) && e.alive && Math.abs(e.x - this.x) < 12);
        if (!al.length) return [p.x + side * 7, p.y + 1.5, 1];
        const cx = al.reduce((s, e) => s + e.x, 0) / al.length, cy = al.reduce((s, e) => s + e.y, 0) / al.length;
        const away = Math.sign(cx - p.x) || side;
        if (this.healAlly && this.core!.is('heal')) return [this.healAlly.x + away * 0.9, this.healAlly.y + 0.3, 1.2];
        return [cx + away * 2.8, cy + 1, 1];
      }
      default: // harpoon / spear: keep range, a little above, back off when it closes in
        return [p.x + side * (dP < 2.6 ? 6.5 : 5.8), p.y + 1.1, dP < 2.6 ? 1.3 : 1];
    }
  }

  private pickMove(w: World, dP: number, canSee: boolean): MoveDef | null {
    const p = w.player;
    const front = Math.sign(p.x - this.x) === this.rig.facing || Math.abs(p.x - this.x) < 0.5;
    switch (this.role) {
      case 'knife':
        if (dP < 1.75 && this.backoff <= 0) { this.comboLeft = this.elite || Math.random() < 0.45 ? 2 : 1; return MV.stab1; }
        return null;
      case 'net':
        if (canSee && dP < 6.5 && dP > 1.5 && !board(w).netOn) { this.say(w, 'net'); return MV.net; }
        if (dP < 1.4 && front) return MV.bash;
        return null;
      case 'heavy': case 'titan':
        if (dP < 2.2 && front) return Math.random() < (this.elite ? 0.4 : 0.28) ? MV.grab : MV.sweep;
        if (dP > 4.5 && canSee && this.rig.loaded) return MV.cannon;
        return null;
      case 'medic': {
        const hurt = w.entities.filter((e) => e.team === 'enemy' && e !== (this as Entity) && e.alive && e.hp !== undefined && e.maxHp !== undefined && e.hp < e.maxHp * 0.7 && Math.hypot(e.x - this.x, e.y - this.y) < 9)
          .sort((a, b) => a.hp! / a.maxHp! - b.hp! / b.maxHp!)[0];
        if (hurt) { this.healAlly = hurt; this.say(w, 'heal'); return MV.heal; }
        if (canSee && dP < 9) return MV.flare;
        return null;
      }
      default:
        if (dP < 1.6 && front) return MV.bash;
        if (canSee && this.rig.loaded && dP < 11 && dP > 2) return MV.shot;
        return null;
    }
  }

  private moveStart(w: World, m: MoveDef) {
    this.stabbed = false;
    const p = w.player;
    switch (m.id) {
      case 'shot': case 'cannon': case 'flare': {
        this.aimLine ??= new AimLine(w.scene);
        this.lockX = p.x; this.lockY = p.y;
        w.sfx('k_tick', this.x, 0.5, 0.7); w.sfx('rope_creak', this.x, 0.4, 1.4);
        break;
      }
      case 'sweep': case 'grab': w.sfx('grunt', this.x, 0.7, 0.75); w.sfx('creak', this.x, 0.5, 0.6); break;
      case 'net': w.sfx('rope_creak', this.x, 0.6, 1.1); break;
      case 'heal': {
        w.sfx('shimmer', this.x, 0.5, 0.8);
        const a = this.healAlly;
        if (a) w.add(new HealLink(this, a, m.windup / this.core!.speed));
        break;
      }
      default: w.sfx('cloth', this.x, 0.5, 1.4); break;
    }
  }

  /** per-frame move logic: aim lines, lunges, hitboxes, chains */
  private runMove(dt: number, w: World, dP: number) {
    const c = this.core!, m = c.move, p = w.player, f = this.rig.facing;
    if (!m) { this.aimLine?.hide(); return; }
    const left = m.windup / c.speed - c.t;
    switch (m.id) {
      case 'stab1': case 'stab2': case 'lunge': {
        if (c.phase === 'windup') {
          this.rig.aimAt(p.x, p.y);
          if (left <= 0.12 && !this.stabbed) { this.stabbed = true; this.rig.play('stab', true); }
        }
        if (c.phase === 'active') {
          if (c.justEntered('active')) { this.vx += f * (m.id === 'lunge' ? 6 : 3.5); w.sfx('swish_b', this.x, 0.6, m.id === 'lunge' ? 0.9 : 1.2); }
          const tip = this.rig.muzzleWorld(_v);
          const reach = m.id === 'lunge' ? 0.7 : 0.55;
          if (Math.hypot(p.x - tip.x, p.y - tip.y) < reach + p.r || (Math.abs(p.y - this.y) < 0.9 && (p.x - this.x) * f > 0 && (p.x - this.x) * f < 1.4)) {
            const r = c.strike(w, { x: this.x, y: this.y, kind: 'spike' });
            if (r === 'hit') { gore(w, p.x, p.y, 0.4); this.dealt++; }
          }
        }
        if (c.phase === 'recover' && c.k > 0.3 && this.comboLeft > 0) {
          if (dP < 2.3) { this.comboLeft--; c.start(this.comboLeft === 0 && m.id !== 'stab1' || (this.comboLeft === 0 && this.elite) ? MV.lunge : MV.stab2); this.stabbed = false; }
          else this.comboLeft = 0;
        }
        if (c.phase === 'recover' && this.comboLeft === 0 && c.k > 0.8) { this.backoff = 1.1; this.cool = 0.9 + Math.random() * 0.8; }
        break;
      }
      case 'shot': case 'cannon': case 'flare': {
        const mz = this.rig.muzzleWorld(_v);
        if (c.phase === 'windup') {
          // the sight tracks (with a little lead) until it locks a beat before the trigger
          if (c.k < 0.78) {
            const tt = Math.hypot(p.x - mz.x, p.y - mz.y) / 15;
            this.lockX = damp(this.lockX, p.x + p.vx * tt * Math.min(1, this.iq), 10, dt); this.lockY = damp(this.lockY, p.y + p.vy * tt * Math.min(1, this.iq), 10, dt);
          } else if (c.t - dt < (m.windup / c.speed) * 0.78) w.sfx('click', this.x, 0.6, 1.6);
          this.rig.aimAt(this.lockX, this.lockY);
          const dx = this.lockX - mz.x, dy = this.lockY - mz.y, l = Math.hypot(dx, dy) || 1;
          const L = m.id === 'flare' ? Math.min(l, 6) : Math.min(14, l + 4);
          this.aimLine?.show(mz.x, mz.y, mz.x + (dx / l) * L, mz.y + (dy / l) * L, c.k, w.time);
        } else this.aimLine?.hide();
        if (c.justEntered('active')) {
          const ang = Math.atan2(this.lockY - mz.y, this.lockX - mz.x);
          const spd = m.id === 'cannon' ? 13 : m.id === 'flare' ? 11 : 17;
          w.add(new Bolt(mz.x, mz.y, Math.cos(ang) * spd, Math.sin(ang) * spd + 0.4, Math.max(1, m.dmg * this.dmgMul), this, m.id === 'cannon' ? 'bolt' : m.id === 'flare' ? 'flare' : 'shaft'));
          if (m.id !== 'flare') this.rig.play('fire', true); else this.rig.loaded = true;
          muzzle(w, mz.x, mz.y, ang, m.id === 'cannon' ? 1.2 : 0.6);
          w.sfx(m.id === 'cannon' ? 'thud_heavy' : m.id === 'flare' ? 'laser_shot' : 'rope_twang', mz.x, 0.7, m.id === 'cannon' ? 0.7 : m.id === 'flare' ? 0.6 : 1.6);
          w.game.addShake(m.id === 'cannon' ? 0.1 : 0.03);
          this.cool = m.id === 'flare' ? 1.4 : 0.6;
        }
        break;
      }
      case 'bash': {
        if (c.phase === 'windup') this.rig.aimAt(this.x + f, this.y + 0.6);
        if (c.phase === 'active') {
          this.rig.aimAt(this.x + f * 2, this.y - 0.2);
          if (c.justEntered('active')) { this.vx += f * 3; w.sfx('swish_a', this.x, 0.5, 0.9); }
          if (Math.abs(p.y - this.y) < 1 && (p.x - this.x) * f > -0.2 && (p.x - this.x) * f < 1.5) c.strike(w, { x: this.x, y: this.y, kind: 'crush' });
        }
        if (c.phase === 'recover' && c.k > 0.9) this.cool = 0.8;
        break;
      }
      case 'net': {
        if (c.phase === 'windup') { this.rig.aimAt(p.x, p.y + 0.5); if (left <= 0.36 && !this.stabbed) { this.stabbed = true; this.rig.play('throw', true); } }
        if (c.phase === 'recover' && c.k > 0.9) this.cool = 3.5;
        break;
      }
      case 'sweep': case 'grab': {
        // the cannon swung like a club: cocked up behind, then a low arc through the front
        const hy = this.y + this.rig.height * 0.1;
        if (c.phase === 'windup') this.rig.aimAt(this.x - f * 1.2, hy + 2.2 * Math.min(1, c.k * 1.4));
        else if (c.phase === 'active') {
          this.rig.aimAt(this.x + f * (m.id === 'grab' ? 1.8 : 2.4 * c.k), hy + (m.id === 'grab' ? 0 : 1.8 - 3 * c.k));
          if (c.justEntered('active')) { w.sfx('swish_c', this.x, 0.8, 0.6); this.vx += f * 1.5; }
          const reach = m.id === 'grab' ? 1.7 : 2.3;
          if ((p.x - this.x) * f > -0.4 && (p.x - this.x) * f < reach && Math.abs(p.y - hy) < 1.7) {
            const r = c.strike(w, { x: this.x, y: hy, kind: 'crush' });
            if (r === 'hit' && m.id === 'grab') { this.grabT = 1.0; p.hooked = true; callout(w, 'GRABBED!', p.x, p.y + 1, 'danger', 0.45); w.sfx('grunt', this.x, 0.8, 0.7); }
            if (r === 'hit' && m.id === 'sweep') { w.game.addShake(0.2); }
          }
        } else if (c.phase === 'recover') this.rig.aimAt(this.x + f * 1.5, hy - 0.5 + c.k * 0.5);
        if (c.phase === 'recover' && c.k > 0.9) this.cool = 0.9;
        break;
      }
      case 'heal': {
        const a = this.healAlly;
        if (!a || !a.alive || (a as unknown as { dead?: boolean }).dead) { c.cancel(); this.healAlly = null; break; }
        if (c.phase === 'windup') { this.rig.aimAt(a.x, a.y); if (!this.busy) this.rig.play('heal'); if (Math.random() < dt * 10) w.fx.emit('sparkle', a.x + (Math.random() - 0.5) * 0.6, a.y + (Math.random() - 0.5) * 0.8, { n: 1, color: '#7dff9a', life: 0.5 }); }
        if (c.justEntered('active')) {
          a.hp = Math.min(a.maxHp ?? a.hp ?? 1, (a.hp ?? 0) + Math.max(2, (a.maxHp ?? 4) * 0.4));
          if (a instanceof Human) a.bleedK = 0;
          w.text.pop('+', a.x, a.y + 0.9, 'heal', { size: 0.5 });
          w.fx.heal(a.x, a.y, 4);
          w.sfx('shimmer', a.x, 0.6, 1.3);
          this.healAlly = null;
          this.cool = 3;
        }
        break;
      }
    }
  }

  /** rig release frames in duel mode (the net leaves the hand here; shots are fired by the move) */
  private duelRelease(a: DiverAct, w: World) {
    if (a !== 'throw') return;
    const p = w.player, mz = this.rig.muzzleWorld(_v);
    const spd = 9;
    const tt = Math.hypot(p.x - mz.x, p.y - mz.y) / spd;
    const ax = p.x + p.vx * tt * Math.min(1, this.iq), ay = p.y + p.vy * tt * Math.min(1, this.iq);
    const ang = Math.atan2(ay - mz.y, ax - mz.x);
    w.add(new Net(mz.x, mz.y, Math.cos(ang) * spd, Math.sin(ang) * spd + 0.7, this, 1 + this.iq));
    w.sfx('net', mz.x, 0.7);
  }

  /** the heavy's grab: hold the blobfish at the hand, then slam it down and away */
  private updateGrab(dt: number, w: World) {
    const p = w.player as Entity & { hooked: boolean; push(x: number, y: number): void; applyForce?(x: number, y: number): void; invuln: number };
    this.grabT -= dt;
    const hp = this.rig.boneWorld('handR', _v);
    if (p.applyForce) p.applyForce((hp.x - p.x) * 60 - p.vx * 8, (hp.y - p.y) * 60 - p.vy * 8);
    if (this.grabT <= 0 || !p.alive || this.core?.phase === 'stagger') {
      this.grabT = 0;
      p.hooked = false;
      if (p.alive && this.core?.phase !== 'stagger') {
        p.push(this.rig.facing * 9, -5);
        w.game.addShake(0.3); w.game.freeze(0.08);
        w.sfx('thud_heavy', p.x, 0.9, 0.8); silt(w, p.x, this.floorY(w) + 0.1, 12);
        callout(w, 'SLAM', p.x, p.y + 0.8, 'danger', 0.4);
      }
    }
  }

  /** move toward (gx, gy) inside the box; walkers stay on the seabed */
  private duelSteer(dt: number, w: World, gx: number, gy: number, sprint: number, box: Arena) {
    const maxV = this.def.speed * this.speedMul * sprint * (1 - this.legLoss * 0.35);
    gx = clamp(gx, box.x0 + 0.6, box.x1 - 0.6);
    if (this.def.walker) {
      const dx = gx - this.x;
      const want = Math.abs(dx) > 0.4 ? Math.sign(dx) * maxV * Math.min(1, Math.abs(dx) / 1.5) : 0;
      this.vx += (want - this.vx) * (1 - Math.exp(-dt * 3));
      this.x += this.vx * dt;
      this.x = clamp(this.x, box.x0 + 0.6, box.x1 - 0.6);
      const fl = this.floorY(w);
      this.y += (fl + this.rig.pivotHeight - this.y) * (1 - Math.exp(-dt * 10));
      this.vy = 0;
      if (Math.abs(this.vx) > 0.3 && Math.random() < dt * 3) silt(w, this.x, fl + 0.05, 2);
      return;
    }
    gy = clamp(gy, box.floor + 0.7, box.top - 0.4);
    const dx = gx - this.x, dy = gy - this.y, d = Math.hypot(dx, dy) || 1;
    const arrive = Math.min(1, d / 1.2);
    let wx = (dx / d) * maxV * arrive, wy = (dy / d) * maxV * arrive;
    for (const m of w.near(this.x, this.y, 1.4, 'enemy')) {
      if (m === (this as Entity)) continue;
      const sx = this.x - m.x, sy = this.y - m.y, sd = Math.hypot(sx, sy);
      if (sd > 1e-3) { wx += (sx / sd) * (1.4 - sd) * 2.5; wy += (sy / sd) * (1.4 - sd) * 2.5; }
    }
    // don't stand inside the blobfish
    const p = w.player, px = this.x - p.x, py = this.y - p.y, pd = Math.hypot(px, py);
    if (p.alive && pd < 1.25 && pd > 1e-3) { wx += (px / pd) * (1.25 - pd) * 9; wy += (py / pd) * (1.25 - pd) * 4; }
    const ahead = w.terrain.sdf(this.x + this.vx * 0.5, this.y + this.vy * 0.5);
    if (ahead < 0.8) { const n = w.terrain.normal(this.x, this.y); wx += n.x * (0.8 - ahead) * 5; wy += n.y * (0.8 - ahead) * 5; }
    this.vx += (wx - this.vx) * (1 - Math.exp(-dt * 3));
    this.vy += (wy - this.vy) * (1 - Math.exp(-dt * 3));
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, box.x0 + 0.5, box.x1 - 0.5);
    this.y = clamp(this.y, Math.max(box.floor, w.terrain.floorAt(this.x)) + 0.6, box.top - 0.3);
    const s = w.terrain.sdf(this.x, this.y);
    if (s < 0.45) { const n = w.terrain.normal(this.x, this.y); this.x += n.x * (0.45 - s); this.y += n.y * (0.45 - s); }
    if (Math.random() < dt * 0.6) bubbles(w, this.x + this.rig.facing * 0.3, this.y + 0.3, 3, 0.8);
  }

  // ---------------------------------------------------------------- the heavy diver's air hose
  attachHose(w: World) {
    if (this.hose) return;
    const h = new FishingLine({ hp: this.role === 'titan' ? 10 : 5, breaking: 999, drag: 999, k: 4, color: '#2e2c28', name: 'air hose' });
    const top = this.hoseTop(w);
    h.reset(top.x, top.y, this.x, this.y + 1, Math.hypot(top.x - this.x, top.y - this.y) * 1.2);
    h.onSnap = () => { this.hoseCut = true; this.say(w, 'hose', true); this.events.push('his air hose was cut'); this.scars.add('burns'); };
    this.hose = h;
    w.add(h);
  }
  private hoseTop(w: World) { return { x: this.x + (this.rig.facing > 0 ? -3 : 3), y: w.water.heightAt(this.x) + 0.4 }; }
  private updateHose(dt: number, w: World) {
    const h = this.hose!;
    if (h.snapped || !h.alive) return;
    const top = this.hoseTop(w);
    h.tip.set(h.tip.x + (top.x - h.tip.x) * Math.min(1, dt * 0.5), top.y);
    const hp = this.rig.hoseWorld(_v);
    if (hp) h.end = { x: hp.x, y: hp.y };
    h.restLen = Math.hypot(h.tip.x - this.x, h.tip.y - this.y) * 1.15;
  }

  // ---------------------------------------------------------------- nemesis name tag
  private makeTag() {
    const n = this.nemesis!;
    this.tag = textSprite(`${n.name.toUpperCase()}`, STYLES.danger, 0.28);
    this.tag.renderOrder = 90;
    this.rig.group.parent?.add(this.tag);
  }
  /** the tag must live in the scene (not on the rotating rig) */
  mountTag(scene: THREE.Object3D) { if (this.tag) scene.add(this.tag); }

  dispose(w: World) {
    this.tag?.removeFromParent();
    this.aimLine?.dispose();
    if (this.hose) this.hose.alive = false;
    this.rig.dispose();
    void w;
  }
}

/** the medic's heal channel: a pulsing green line + rings from medic to patient (the tell; any hit breaks it) */
class HealLink implements Entity {
  kind = 'fx'; team: Team = 'neutral'; x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true;
  obj: THREE.Line; private t = 0;
  constructor(private medic: Human, private ally: Entity, private dur: number) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.obj = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color('#6dff8a').multiplyScalar(1.8) }));
    this.obj.frustumCulled = false;
  }
  update(dt: number, w: World) {
    this.t += dt;
    const c = this.medic.core;
    if (this.t > this.dur + 0.1 || !c?.is('heal') || !this.ally.alive || this.medic.dead) { this.alive = false; return; }
    const pa = this.obj.geometry.attributes.position as THREE.BufferAttribute;
    pa.setXYZ(0, this.medic.x, this.medic.y + 0.2, 0.3); pa.setXYZ(1, this.ally.x, this.ally.y, 0.3); pa.needsUpdate = true;
    if (Math.random() < dt * 4) w.fx.emit('ring', this.ally.x, this.ally.y, { size: 0.3, size1: 1.2, life: 0.4, color: '#6dff8a', add: true, spread: 0 });
    if (this.t > this.dur - 0.3 && this.t - dt <= this.dur - 0.3) glint(w, this.medic.x, this.medic.y + 0.5, { size: 0.7, sound: false });
  }
  dispose() { this.obj.geometry.dispose(); (this.obj.material as THREE.Material).dispose(); }
}

// nemesis-specific lines (filled by nemesis.ts to avoid a cycle)
let nemesisLines: (n: Nemesis, ev: BarkEvent) => string[] | null = () => null;
export function setNemesisLines(f: typeof nemesisLines) { nemesisLines = f; }
export { damageTarget };
