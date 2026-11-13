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
import { clamp } from '../core/math';
import { textSprite, STYLES } from '../ui/text';

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

export interface HumanMods { hpMul?: number; dmgMul?: number; speedMul?: number; reloadMul?: number; iq?: number; elite?: boolean; nemesis?: Nemesis | null; seed?: number }

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
  }

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
    if (this.def.walker && k === 'sword' && Math.random() < 0.35) { d *= 0.3; w.sfx('sw_clang', this.x, 0.6); w.text.pop('CLANG', this.x, this.y + 1, 'hint', { size: 0.26 }); }
    this.hp -= d;
    const mass = this.def.mass;
    this.vx += dirX * 3 / mass; this.vy += dirY * 2 / mass;
    gore(w, this.x - dirX * 0.2, this.y - dirY * 0.2 + 0.1, 0.25 + Math.min(1.2, (d / this.maxHp) * 2.5), dirX, dirY);
    this.bleedK = Math.min(1, this.bleedK + (d / this.maxHp) * 1.6);
    if (!this.def.walker || d > 3) this.rig.play('flinch', !this.busy || this.rig.action === 'reload');
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
    w.emit('kill', { kind: 'human:' + this.role, x: this.x, y: this.y, nemesis: this.nemesisId ?? null });
    // loot: coins + a material or two
    w.drop(this.x, this.y, { coins: this.def.bounty * (this.elite ? 2 : 1) });
    if (Math.random() < 0.6 || this.elite) w.drop(this.x + 0.3, this.y, { item: this.def.loot[Math.floor(Math.random() * this.def.loot.length)] });
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
    if (this.hose) this.hose.alive = false;
    this.rig.dispose();
    void w;
  }
}

// nemesis-specific lines (filled by nemesis.ts to avoid a cycle)
let nemesisLines: (n: Nemesis, ev: BarkEvent) => string[] | null = () => null;
export function setNemesisLines(f: typeof nemesisLines) { nemesisLines = f; }
export { damageTarget };
