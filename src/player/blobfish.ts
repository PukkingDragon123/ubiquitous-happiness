// The player: a squishy, bouncy blobfish adventurer (v2: low-poly PS1 model with a painted face and build gear).
//
// Movement is Hungry-Shark-like free swimming (WASD / arrows). Combat is the souls-like moveset in
// src/combat/moveset.ts (blob.combat): J / left mouse light combo (hold to charge a heavy), K / right mouse
// parry (hold: block), Space dodge (i-frames, stamina), R / H kelp-tea flask. Skills sit in slots 1-4 (keys
// 1-4) and spend mana; Q / L cycles the HUD selection. Physics is a 2D soft body (softbody.ts): the body
// squishes against rocks and bounces back, and the 3D mesh bends to match. Near the surface a blobfish
// decompresses: it sags, bloats and weakens.
//
// The fishing system (src/fishing) talks to the player through: hook (set while hooked), applyForce(),
// intent (swim input), mouthWorld(), and the struggle inputs (struggleTap / struggleHold).
// Build visuals: setGear({ weapon, armor, hat, back }) (also applied from stats.gear by setStats), play(anim).
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { AbilityId, Stats } from '../game/run';
import { SoftBody } from './softbody';
import { BlobModel, outlineAt, SB_N, type BlobAnim } from './blobModel';
import { type BlobGear } from './gear';
import { SlashTrail } from './slashTrail';
import { clamp, damp, dampAngle, smooth, TAU, segDist } from '../core/math';
import { audio } from '../audio/audio';
import { POST } from '../gfx/post';
import { buildHook } from '../fishing/bait';
import type { SkillCaster } from '../skills/types';
import { SKILLS, skillSlotsFor } from '../skills/registry';
import { skillMods, strike } from '../skills/combat';
import { FX } from '../skills/fx';
import { PlayerCombat } from '../combat/moveset';

export interface HookLink {
  /** where the line pulls toward (next line node) */
  pullX: number; pullY: number;
  /** pull strength (m/s^2 at the player) */
  tension: number;
  line: Entity;
}

const ABILITY_CD: Record<AbilityId, number> = { rockBody: 7, laserEyes: 0, bubbleShield: 10, inkCloud: 9, zap: 6, puff: 8, magnet: 0, dash: 0 };
const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export class Blobfish implements SkillCaster {
  kind = 'player'; team: Team = 'player';
  x = 0; y = -4; vx = 0; vy = 0; r = 0.42;
  alive = true;
  hp = 6; maxHp = 6;
  facing = 1;
  hooked = false;
  hook: HookLink | null = null;
  invuln = 0;
  obj = new THREE.Group();
  model = new BlobModel();
  /** 0..1 soft self-glow in dark water (set by the dungeon screen from depth) */
  ambientGlow = 0;
  sb = new SoftBody(outlineAt, SB_N);
  stats!: Stats;
  intent = { x: 0, y: 0 };
  struggleTap = false;
  struggleHold = false;
  aim = new THREE.Vector2(1, 0);
  /** 0 deep .. 1 at the surface: decompression weakness */
  pressure = 0;
  outOfWater = false;
  // weapon + souls-like moveset (stamina, parry, dodge, flasks: src/combat/moveset.ts)
  private trail = new SlashTrail();
  private goldTrail = new SlashTrail(new THREE.Color('#ffe070'));
  combat: PlayerCombat;
  attackCd = 0;
  private dashT = 0;
  // legacy abilities (ability cores)
  ability: AbilityId | null = null;
  /** ability core levels from merging (1..3) */
  abilityLv: Partial<Record<AbilityId, number>> = {};
  cds: Partial<Record<AbilityId, number>> = {};
  rock = 0; rockT = 0;
  laserOn = false; laserEnergy = 1; private laser: THREE.Group;
  shield = 0; private shieldMesh: THREE.Mesh;
  puffT = 0;
  // skills
  mana = 20; maxMana = 20;
  /** skill ids in slots 1-4 */
  slots: (string | null)[] = [null, null, null, null];
  /** selected slot (right mouse / K) */
  sel = 0;
  /** remaining / full cooldown per skill id */
  skillCd: Record<string, number> = {};
  skillCdMax: Record<string, number> = {};
  /** skill levels (from the granting items); set by the dive via skillLevels(run) or left at 1 */
  skillLv: Record<string, number> = {};
  /** summons + gadgets this player owns */
  owned: Entity[] = [];
  dmgMul = 1; private dmgT = 0; private spdMul = 1; private spdT = 0;
  private flipK = 1;
  private flash = 0;
  private bounceSnd = 0;
  private exprHold = 0;
  private extForce = new THREE.Vector2();
  private tmpV = new THREE.Vector3();
  private bodyAngle = 0;
  private hurtCount = 0;
  private noManaT = 0;
  carried: ((dt: number) => void) | null = null;
  riding = false;
  private lipHook = buildHook();
  onDeath?: () => void;

  constructor(x = 0, y = -4) {
    this.x = x; this.y = y;
    this.combat = new PlayerCombat(this);
    this.sb.place(x, y);
    this.obj.add(this.model.root);
    this.model.attach(this.obj);
    this.model.weaponCtl = 'external';
    this.model.weaponZ = 0.95;
    this.obj.add(this.trail.mesh, this.goldTrail.mesh);
    // laser beams (two eye beams converge)
    this.laser = new THREE.Group();
    // opaque HDR beams: the post fog is depth-based, so solid depth-writing beams read right (and bloom)
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a7a').multiplyScalar(2.2) });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0f4').multiplyScalar(3) });
    for (const [r, m] of [[0.06, beamMat], [0.03, coreMat]] as const) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6, 1, true), m);
      c.geometry.translate(0, 0.5, 0); c.geometry.rotateZ(-Math.PI / 2);
      this.laser.add(c);
    }
    this.laser.visible = false;
    this.obj.add(this.laser);
    // bubble shield: a low-poly fresnel soap bubble
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.74, 2), new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vP = position; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.5); vec3 irid = 0.5 + 0.5 * cos(6.2831 * (f * 1.3 + vP.y * 0.8 + uT * 0.2 + vec3(0.0, 0.33, 0.67)));
        float hl = smoothstep(0.92, 0.97, dot(vN, normalize(vec3(-0.4, 0.6, 0.7))));
        gl_FragColor = vec4((irid * f * 1.2 + hl * 1.5), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.shieldMesh.visible = false;
    this.obj.add(this.shieldMesh);
    this.lipHook.visible = false;
    this.obj.add(this.lipHook);
  }

  setStats(s: Stats) {
    this.stats = s;
    this.maxHp = s.maxHp;
    if (!this.ability || !s.abilities.includes(this.ability)) this.ability = s.abilities.find((a) => a !== 'magnet' && a !== 'dash') ?? null;
    this.maxMana = s.maxMana ?? 20;
    this.mana = Math.min(this.mana, this.maxMana);
    const prev = this.slots.join(',');
    this.slots = skillSlotsFor(s);
    if (this.slots.join(',') !== prev) this.sel = Math.max(0, this.slots.findIndex((x) => !!x));
    if (s.gear && Object.keys(s.gear).length) this.setGear(s.gear as BlobGear);
  }
  /** dress the blobfish (weapon / armour / hat / back item) */
  setGear(g: BlobGear) { this.model.setGear(g); }
  /** play a body animation: 'idle' | 'swim' | 'waddle' | 'gearUp' | 'cheer' | 'hurt' | 'die' (swim is the default) */
  play(a: BlobAnim) { this.model.play(a, true); }
  playAnim(a: string) { this.play(a as BlobAnim); }

  push(ix: number, iy: number) { this.sb.accel(ix / 0.016, iy / 0.016, 0.016); this.sb.poke(-ix, -iy, Math.hypot(ix, iy) * 0.4); }
  applyForce(fx: number, fy: number) { this.extForce.x += fx; this.extForce.y += fy; }
  lunge(dx: number, dy: number, power: number) { const l = Math.hypot(dx, dy) || 1; this.sb.accel((dx / l) * power / 0.016 * 0.6, (dy / l) * power / 0.016 * 0.6, 0.016); this.sb.stretch = 0.35; this.sb.stretchDir = Math.atan2(dy, dx); }
  buff(kind: 'dmg' | 'speed', mul: number, dur: number) { if (kind === 'dmg') { this.dmgMul = Math.max(this.dmgMul, mul); this.dmgT = Math.max(this.dmgT, dur); } else { this.spdMul = Math.max(this.spdMul, mul); this.spdT = Math.max(this.spdT, dur); } }
  mouthWorld(out = new THREE.Vector3()) { return this.model.mouthWorld(out); }
  tip(out = new THREE.Vector3()) { return this.model.weaponTip(out); }
  get swimming() { return Math.hypot(this.intent.x, this.intent.y) > 0.1; }

  setExpr(name: string, hold = 0.4) { this.model.setExpression(name); this.exprHold = hold; }

  update(dt: number, w: World) {
    const inp = w.game.input;
    const s = this.stats;
    if (!this.alive) { this.deadUpdate(dt, w); return; }
    // ---- input
    const ax = inp.axis();
    this.intent.x = ax.x; this.intent.y = ax.y;
    this.struggleTap = inp.hit('dash');
    this.struggleHold = inp.held('dash');
    const mw = w.game.mouseWorld(w.camera);
    const mouseRecent = performance.now() - inp.lastMouse < 2500 || inp.lastMouse > inp.lastKeyboard;
    if (mouseRecent) { this.aim.set(mw.x - this.x, mw.y - this.y); if (this.aim.lengthSq() < 0.01) this.aim.set(this.facing, 0); this.aim.normalize(); }
    else if (Math.hypot(ax.x, ax.y) > 0.1) this.aim.set(ax.x, ax.y).normalize();
    // ---- environment
    const surfY = w.water.heightAt(this.x);
    this.outOfWater = this.y > surfY + 0.05;
    this.pressure = smooth(-6.5, -0.4, this.y) * (1 - s.pressureResist);
    const weak = 1 - this.pressure * 0.45;
    // ---- buffs
    this.dmgT -= dt; if (this.dmgT <= 0) this.dmgMul = 1;
    this.spdT -= dt; if (this.spdT <= 0) this.spdMul = 1;
    // ---- combat moveset: input, buffering, move timelines (before swimming so it can slow / lock it)
    this.combat.update(dt, w);
    // ---- swimming
    const rocky = this.rock > 0.5;
    const speed = s.speed * weak * (rocky ? 0.35 : 1) * (this.puffT > 0 ? 0.6 : 1) * this.spdMul * this.combat.moveMul();
    let accel = s.accel * weak * this.spdMul;
    if (this.outOfWater || this.riding) accel = 0;
    const tvx = ax.x * speed, tvy = ax.y * speed;
    let fx = (tvx - this.sb.vx) * (accel / Math.max(0.5, speed)), fy = (tvy - this.sb.vy) * (accel / Math.max(0.5, speed));
    if (!this.swimming || this.riding) { fx = this.riding ? 0 : -this.sb.vx * 1.2; fy = this.riding ? 0 : -this.sb.vy * 1.2; }
    // buoyancy: blobfish are almost neutrally buoyant; rock sinks; puff floats; air drops you
    if (this.outOfWater) fy -= 18;
    else if (rocky) fy -= 14;
    else if (this.puffT > 0) fy += 2.5;
    else fy -= 0.35 + Math.sin(w.time * 1.3) * 0.25;
    // the surface pushes back gently unless dashing up hard
    if (!this.outOfWater && this.y > surfY - 0.45 && !this.hooked && this.dashT <= 0) fy -= (this.y - (surfY - 0.45)) * 30;
    fx += this.extForce.x; fy += this.extForce.y;
    this.extForce.set(0, 0);
    this.carried?.(dt);
    // ---- dodge (the moveset starts it: see dodged()); rogue 6-set dash-stab
    this.dashT -= dt;
    if (this.dashStab > 0) {
      this.dashStab -= dt;
      for (const e of w.near(this.x, this.y, 0.7, 'enemy')) if (!this.stabbed.has(e)) { this.stabbed.add(e); strike(w, this, e, s.swordDmg * 2, this.vx, this.vy, 'sword', { gore: 0.6 }); }
      if (this.dashStab <= 0) this.stabbed.clear();
    }
    // ---- soft body step
    this.sb.accel(fx, fy, dt);
    const sdf = (x: number, y: number) => w.terrain.sdf(x, y);
    const nrm = (x: number, y: number) => w.terrain.normal(x, y);
    const drag = this.outOfWater ? 0.15 : 1.4;
    this.sb.accel(-this.sb.vx * drag, -this.sb.vy * drag, dt);
    // body orientation follows swim direction (pitch), facing flips through a squash; moves face the aim
    const vel = Math.hypot(this.sb.vx, this.sb.vy);
    if (this.combat.faceAim && Math.abs(this.aim.x) > 0.15 && !this.hooked) this.facing = Math.sign(this.aim.x);
    else if (Math.abs(ax.x) > 0.2 && !this.hooked) this.facing = Math.sign(ax.x);
    const pitchTarget = vel > 0.6 ? clamp(Math.atan2(this.sb.vy, Math.abs(this.sb.vx) + 0.5) * this.facing, -0.75, 0.75) : 0;
    this.bodyAngle = dampAngle(this.bodyAngle, pitchTarget + (this.hooked ? Math.sin(w.time * 18) * 0.12 : 0), 6, dt);
    this.sb.angle = this.bodyAngle;
    this.flipK = damp(this.flipK, this.facing, 14, dt);
    this.sb.flip = this.flipK >= 0 ? 1 : -1;
    this.sb.stretch = damp(this.sb.stretch, clamp(vel / 22, 0, 0.18), 8, dt);
    if (vel > 0.5) this.sb.stretchDir = Math.atan2(this.sb.vy, this.sb.vx);
    this.sb.inflate = damp(this.sb.inflate, (this.puffT > 0 ? 1.45 : 1) + this.pressure * 0.08, 10, dt);
    this.sb.restitution = rocky ? 0.1 : 0.6;
    this.sb.stiff = rocky ? 600 : 150;
    this.sb.step(dt, sdf, nrm);
    // water surface: out of water you flop; re-entry splashes
    const wasOut = this.outOfWater;
    this.x = this.sb.cx; this.y = this.sb.cy; this.vx = this.sb.vx; this.vy = this.sb.vy;
    const nowOut = this.y > w.water.heightAt(this.x) + 0.05;
    if (wasOut !== nowOut) {
      w.water.disturb(this.x, Math.min(4, Math.abs(this.vy) * 0.6 + 0.5), 0.6);
      w.fx.splash(this.x, Math.min(3, Math.abs(this.vy) * 0.3 + 0.4));
      w.sfx(Math.abs(this.vy) > 4 ? 'splash_b' : 'splash_s', this.x, 0.8);
    }
    // bounce feedback
    this.bounceSnd -= dt;
    if (this.sb.impact > 2.2 && this.bounceSnd <= 0) {
      this.bounceSnd = 0.18;
      const k = Math.min(1, this.sb.impact / 9);
      w.sfx(rocky ? 'rock_hit' : this.sb.impact > 5 ? 'boing' : 'squish', this.x, 0.35 + k * 0.5, rocky ? 0.8 : 1.1 - k * 0.2);
      w.fx.emit('dust', this.x - this.sb.impactNx * 0.4, this.y - this.sb.impactNy * 0.4, { n: Math.round(3 + k * 8), spread: 0.3, speed: 1 + k * 2 });
      if (k > 0.5) { this.setExpr('dizzy', 0.35); w.game.addShake(0.05 * k); }
      if (rocky && k > 0.4) this.crush(w, k);
    }
    // ---- weapon: the moveset animates the blade and sweeps it for hits
    const hand = this.model.handWorld(this.tmpV.clone());
    this.combat.updateBlade(dt, w, hand);
    this.trail.update(dt); this.goldTrail.update(dt);
    this.model.weaponVisible = this.rock < 0.5;
    // ---- skills + legacy abilities
    this.updateSkills(dt, w);
    this.updateAbilities(dt, w);
    // ---- timers + visuals
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.model.flash = this.flash * 0.9 + (this.invuln > 0 && this.hurtCount > 0 ? (Math.sin(w.time * 40) > 0 ? 0.25 : 0) : 0);
    this.model.bloat = damp(this.model.bloat, this.pressure * (this.hooked ? 1.2 : 0.55) + (this.outOfWater ? 0.6 : 0), 4, dt);
    this.model.squeeze = damp(this.model.squeeze, this.hooked ? 0.6 + Math.sin(w.time * 20) * 0.3 : 0, 8, dt);
    this.exprHold -= dt;
    if (this.exprHold <= 0) {
      this.model.setExpression(this.hooked ? 'strain' : this.outOfWater ? 'scared' : this.combat.blocking ? 'focus' : this.combat.attacking ? 'attack' : this.hp <= 2 ? 'sad' : 'brave');
    }
    // the eyes look where you aim
    this.model.look.set(this.aim.x * this.facing, this.aim.y);
    this.place(w);
  }
  private dashStab = 0;
  private stabbed = new Set<Entity>();

  private place(w: World) {
    const root = this.model.root;
    root.position.set(this.x, this.y, 0);
    // a 3/4 view: yawed toward the camera, mirrored for facing; the flip passes through a squash
    const f = this.flipK, fs = Math.sign(f || 1);
    // combat pose layer (moveset): lean back / into a blow, coil squash, spin-slash yaw, riposte / dodge roll
    const c = this.combat, sq = c.squash;
    root.scale.set(fs * Math.max(0.12, Math.abs(f)) * (1 + sq * 0.5), 1 - sq, 1 + sq * 0.5);
    root.rotation.set(0, -0.55 * fs * Math.abs(f) + c.spin * fs, c.roll);
    this.model.body.rotation.set(0, 0, this.bodyAngle * fs - c.lean);
    root.updateMatrixWorld(true);
    this.model.facingSign = fs;
    this.model.update(w.game.dt, { sb: this.sb, swim: clamp(Math.hypot(this.vx, this.vy) / 5, 0, 1), time: w.time, vel: new THREE.Vector2(this.vx, this.vy) });
    // the thrust: the toothpick slides out along its own axis
    if (c.thrust) { const a = this.model.weaponAng; this.model.weaponPivot.position.x += Math.cos(a) * c.thrust; this.model.weaponPivot.position.y += Math.sin(a) * c.thrust; }
    // the hook in the lip, pointing along the line
    this.lipHook.visible = this.hooked;
    if (this.hooked && this.hook) {
      const m = this.model.mouthWorld(new THREE.Vector3());
      this.lipHook.position.set(m.x, m.y, m.z + 0.05);
      this.lipHook.rotation.set(0, 0, Math.atan2(this.hook.pullY - m.y, this.hook.pullX - m.x) - Math.PI / 2 + Math.PI);
    }
    this.shieldMesh.position.set(this.x, this.y, 0);
    this.shieldMesh.visible = this.shield > 0;
    this.shieldMesh.scale.setScalar(1 + Math.sin(w.time * 6) * 0.03);
    (this.shieldMesh.material as THREE.ShaderMaterial).uniforms.uT.value = w.time;
  }

  // ------------------------------------------------------------------ weapon hooks (the moveset drives the blade)
  /** start a whirlwind (warrior skill): spin the weapon for dur seconds */
  whirl(dur: number, dmgMul: number) { this.combat.whirl(dur, dmgMul); }
  /** a trail segment along the blade (gold for ripostes / full-charge heavies) */
  trailPush(base: THREE.Vector3, tip: THREE.Vector3, gold = false) { (gold ? this.goldTrail : this.trail).push(base, tip); }
  /** the moveset started a dodge */
  dodged(_w: World) {
    this.dashT = 0.22;
    // rogue 6-set: dashing through an enemy backstabs it
    if ((this.stats.sets?.rogue ?? 0) >= 6) this.dashStab = 0.25;
  }

  // ------------------------------------------------------------------ skills
  private updateSkills(dt: number, w: World) {
    const inp = w.game.input, s = this.stats;
    // mana regen
    this.mana = Math.min(this.maxMana, this.mana + (s.manaRegen ?? 2.5) * dt);
    for (const k of Object.keys(this.skillCd)) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
    this.noManaT -= dt;
    this.owned = this.owned.filter((e) => e.alive);
    if (this.hooked || this.outOfWater) return;
    // number keys cast their slot; right mouse / K casts the selected one; Q / L cycles
    for (let i = 0; i < 4; i++) if (inp.keyHit(SLOT_KEYS[i]) && this.slots[i]) { this.sel = i; this.cast(this.slots[i]!, w); }
    if (inp.hit('ability2')) {
      const filled = this.slots.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
      if (filled.length > 1) {
        const at = filled.indexOf(this.sel);
        this.sel = filled[(at + 1) % filled.length];
        const id = this.slots[this.sel]!;
        w.text.pop(SKILLS[id]?.name ?? id, 0, 0.95, 'magic', { size: 0.32, follow: () => ({ x: this.x, y: this.y }) });
        w.sfx('k_select1', this.x, 0.5);
      }
    }
    // (right mouse / K is the parry / block now: src/combat/moveset.ts)
    const selId = this.slots[this.sel];
    // keep the legacy HUD in sync with the selected slot
    this.ability = selId && selId in ABILITY_CD ? (selId as AbilityId) : null;
  }

  /** cast a skill by id (from a slot, or programmatically: previews, cinematics) */
  cast(id: string, w: World, aimX?: number, aimY?: number): boolean {
    const def = SKILLS[id];
    if (!def) return false;
    if (def.hold) return false; // channelled skills are handled by their own update (laser)
    if ((this.skillCd[id] ?? 0) > 0) { w.sfx('k_err1', this.x, 0.25); return false; }
    const mods = skillMods(this, def.tags);
    let cost = (def.mana ?? 0) * mods.manaK;
    // mage 6-set: 30% of spells are free
    if (cost > 0 && (this.stats.sets?.mage ?? 0) >= 6 && Math.random() < 0.3) { cost = 0; w.text.pop('FREE!', this.x, this.y + 0.9, 'magic', { size: 0.26 }); }
    if (cost > this.mana) {
      if (this.noManaT <= 0) { w.text.pop('NO MANA', this.x, this.y + 0.9, 'hint', { size: 0.28 }); w.sfx('k_err2', this.x, 0.4); this.noManaT = 0.6; }
      return false;
    }
    const mw = w.game.mouseWorld(w.camera);
    const tx = aimX ?? (Math.hypot(mw.x - this.x, mw.y - this.y) < 14 ? mw.x : this.x + this.aim.x * 6);
    const ty = aimY ?? (Math.hypot(mw.x - this.x, mw.y - this.y) < 14 ? mw.y : this.y + this.aim.y * 6);
    if (aimX !== undefined && aimY !== undefined) { this.aim.set(aimX - this.x, aimY - this.y); if (this.aim.lengthSq() > 1e-4) this.aim.normalize(); }
    const ok = def.cast(w, this, tx, ty, this.skillLv[id] ?? this.abilityLv[id as AbilityId] ?? 1);
    if (ok === false) return false;
    this.mana -= cost;
    const cd = def.cooldown * mods.cd;
    this.skillCd[id] = cd; this.skillCdMax[id] = cd;
    if (def.tags.includes('legacy')) this.cds[id as AbilityId] = cd;
    w.emit('cast', { id, tags: def.tags, x: this.x, y: this.y });
    return true;
  }
  /** for HUDs: everything the skill bar needs */
  skillHud() {
    return {
      slots: this.slots.map((id) => (id ? { id, name: SKILLS[id]?.name ?? id, cd: this.skillCd[id] ?? 0, cdMax: this.skillCdMax[id] || SKILLS[id]?.cooldown || 1, mana: SKILLS[id]?.mana ?? 0, color: SKILLS[id]?.color ?? '#ffffff' } : null)),
      sel: this.sel, mana: this.mana, maxMana: this.maxMana,
    };
  }

  // ------------------------------------------------------------------ legacy abilities (ability cores)
  private updateAbilities(dt: number, w: World) {
    const inp = w.game.input;
    for (const k of Object.keys(this.cds) as AbilityId[]) this.cds[k] = Math.max(0, (this.cds[k] ?? 0) - dt);
    // laser: hold the slot key (or right mouse with it selected)
    const li = this.slots.indexOf('laserEyes');
    const held = li >= 0 && inp.key(SLOT_KEYS[li]);
    this.laserOn = held && this.laserEnergy > 0.02 && !this.outOfWater;
    if (this.laserOn) this.laserEnergy = Math.max(0, this.laserEnergy - dt / (2.8 * (1 + 0.4 * ((this.abilityLv.laserEyes ?? 1) - 1)))); else this.laserEnergy = Math.min(1, this.laserEnergy + dt / 4);
    this.updateLaser(dt, w);
    if (this.rockT > 0) { this.rockT -= dt; if (this.rockT <= 0) { w.sfx('rock_crumble', this.x, 0.5, 1.3); w.fx.debrisBurst(this.x, this.y, 14, '#8a8378', 3); } }
    this.rock = damp(this.rock, this.rockT > 0 ? 1 : 0, 9, dt);
    this.model.U.uRock.value = this.rock;
    if (this.puffT > 0) {
      this.puffT -= dt;
      for (const e of w.near(this.x, this.y, 0.85, 'enemy')) if (e.hit) { e.hit(1, Math.sign(e.x - this.x), 0.5, w, this, 'spike'); FX.sparks(w, e.x, e.y, 5, undefined, 3); }
    }
    // laser eyes + a soft self-glow set by the screen in dark water (so the hero always reads against the deep)
    const ag = this.ambientGlow;
    this.model.U.uGlow.value.setRGB((this.laserOn ? 0.5 : 0) + ag * 0.17, (this.laserOn ? 0.05 : 0) + ag * 0.08, (this.laserOn ? 0.1 : 0) + ag * 0.09);
  }

  /** run a legacy ability core (called by its SKILLS entry) */
  legacy(id: string, w: World) { this.useAbility(id as AbilityId, w); }

  private useAbility(ab: AbilityId, w: World) {
    const lv = this.abilityLv[ab] ?? 1;
    this.cds[ab] = ABILITY_CD[ab] * (1 - 0.18 * (lv - 1));
    switch (ab) {
      case 'rockBody':
        this.rockT = 2.6 * (1 + 0.3 * (lv - 1));
        w.sfx('rock_hit', this.x, 0.8, 0.7); w.sfx('thud_heavy', this.x, 0.5);
        w.text.pop('ROCK BODY!', this.x, this.y + 0.9, 'shout', { size: 0.38 });
        w.fx.debrisBurst(this.x, this.y, 8, '#9a9184', 2);
        w.game.addShake(0.12);
        w.emit('ability', { id: ab });
        break;
      case 'bubbleShield':
        this.shield = 1; w.sfx('bubbles_a', this.x, 0.8); w.sfx('inflate1', this.x, 0.5, 1.4);
        w.fx.emit('bubble', this.x, this.y, { n: 16, spread: 0.6, speed: 1 });
        break;
      case 'inkCloud':
        for (let i = 0; i < 26; i++) w.fx.emit('ink', this.x, this.y, { n: 1, spread: 0.5, speed: 2.4, life: 3, size: 1.1 + Math.random() * 0.8, color: '#3a2a5a', alpha: 0.95 });
        w.sfx('gloop', this.x, 0.8, 0.7); w.sfx('squish', this.x, 0.5, 0.6);
        w.emit('ink', { x: this.x, y: this.y, r: 3.5 });
        this.invuln = Math.max(this.invuln, 1.2);
        break;
      case 'zap': {
        w.sfx('zap', this.x, 0.9); w.sfx('buzz', this.x, 0.5);
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; w.fx.emit('zap', this.x + Math.cos(a) * 1.2, this.y + Math.sin(a) * 1.2, { n: 1, size: 0.5, life: 0.3, color: '#bff4ff', add: true }); }
        w.fx.emit('glow', this.x, this.y, { n: 1, size: 3.2, size1: 4.5, life: 0.3, color: '#7fe8ff', add: true });
        for (const e of w.entities) {
          if (!e.alive || e === (this as Entity)) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (e.slash && d < 6) { for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; e.slash(this.x, this.y, this.x + Math.cos(a) * 2.2, this.y + Math.sin(a) * 2.2, 6, w); } }
          else if (e.team === 'enemy' && e.hit && d < 2.4 + lv * 0.5 + e.r) e.hit(1 + lv, Math.sign(e.x - this.x), 0.4, w, this, 'zap');
        }
        w.game.flash('#cff6ff', 0.25); w.game.addShake(0.12);
        break;
      }
      case 'puff':
        this.puffT = 2.5 * (1 + 0.3 * (lv - 1)); w.sfx('inflate1', this.x, 0.9); w.text.pop('PUFF!', this.x, this.y + 1, 'shout', { size: 0.34 });
        break;
      default: break;
    }
  }

  private updateLaser(dt: number, w: World) {
    this.laser.visible = this.laserOn;
    if (!this.laserOn) { this.laserLoop?.stop(0.1); this.laserLoop = null; return; }
    if (!this.laserLoop) { this.laserLoop = audio.loop('laser_beam1', 0.4); w.sfx('laser_shot1', this.x, 0.6); }
    const eye = this.model.eyeWorld(0, this.tmpV.clone());
    const dir = this.aim;
    let len = 0;
    for (; len < 12; len += 0.15) if (w.terrain.sdf(eye.x + dir.x * len, eye.y + dir.y * len) < 0) break;
    const ex = eye.x + dir.x * len, ey = eye.y + dir.y * len;
    this.laser.position.set(eye.x, eye.y, eye.z + 0.05);
    this.laser.rotation.set(0, 0, Math.atan2(dir.y, dir.x));
    this.laser.scale.set(len, 1 + Math.sin(w.time * 60) * 0.15, 1 + Math.sin(w.time * 60) * 0.15);
    w.fx.emit('ember', ex, ey, { n: 2, speed: 2.5, life: 0.4, color: '#ffb0c0', add: true });
    if (Math.random() < 0.3) w.fx.emit('glow', ex, ey, { n: 1, size: 0.6, life: 0.12, color: '#ff4070', add: true });
    for (const e of w.entities) {
      if (!e.alive || e === (this as Entity)) continue;
      if (e.slash) { e.slash(eye.x, eye.y, ex, ey, this.stats.lineCut * 6 * dt, w); continue; }
      if (e.team !== 'enemy' || !e.hit) continue;
      const sd = segDist(e.x, e.y, eye.x, eye.y, ex, ey);
      if (sd.d < e.r + 0.1) { this.laserTick = (this.laserTick ?? 0) + dt; if (this.laserTick > 0.15) { this.laserTick = 0; e.hit(1, dir.x, dir.y, w, this, 'laser'); } }
    }
    POST.uFlash.value.set(1, 0.3, 0.4, Math.max(POST.uFlash.value.w, 0.02));
  }
  private laserLoop: ReturnType<typeof audio.loop> | null = null;
  private laserTick?: number;

  private crush(w: World, k: number) {
    for (const e of w.near(this.x, this.y - 0.4, 1.2)) if (e.team === 'enemy' && e.hit) e.hit(2 * k + 1, 0, -1, w, this, 'crush');
    w.fx.debrisBurst(this.x, this.y - 0.4, Math.round(6 + k * 10), '#7d756b', 2 + k * 3);
    w.game.addShake(0.1 + k * 0.15);
    w.emit('rockSlam', { x: this.x, y: this.y, k });
  }

  // ------------------------------------------------------------------ damage
  hit(dmg: number, dirX: number, dirY: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    return this.damage(dmg, this.x - dirX, this.y - dirY, w, kind);
  }

  damage(dmg: number, fromX: number, fromY: number, w: World, kind?: DamageKind): boolean {
    if (!this.alive || this.invuln > 0) return false;
    // dodge i-frames / parry / block (hits routed through attackPlayer were already checked)
    if (this.combat.legacyDefend(w, dmg, fromX, fromY, kind)) return false;
    const dx = this.x - fromX, dy = this.y - fromY, l = Math.hypot(dx, dy) || 1;
    if (this.shield > 0) {
      this.shield = 0; this.invuln = 0.6;
      w.sfx('pop', this.x, 0.9); w.fx.emit('bubble', this.x, this.y, { n: 24, spread: 0.7, speed: 3 });
      w.text.pop('POP!', this.x, this.y + 0.8, 'hint', { size: 0.3 });
      this.cds.bubbleShield = ABILITY_CD.bubbleShield;
      return false;
    }
    if (this.rock > 0.5 && kind !== 'explosion') { w.sfx('rock_hit', this.x, 0.7); FX.sparks(w, this.x, this.y, 6, undefined, 3); return false; }
    if (Math.random() < this.stats.armor) { w.text.pop('BLOCK', this.x, this.y + 0.8, 'hint', { size: 0.3 }); w.sfx('sw_clang', this.x, 0.5); this.invuln = 0.4; return false; }
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.8;
    this.combat.onHurt(w);
    this.hurtCount++;
    this.flash = 1;
    this.sb.poke(dx / l, dy / l, 9);
    this.sb.accel((dx / l) * 7 / 0.016, (dy / l) * 7 / 0.016, 0.016);
    this.setExpr('hurt', 0.6);
    this.model.play('hurt', true);
    w.sfx('hit_squish1', this.x, 0.9); w.sfx('squeak', this.x, 0.5, 0.8);
    w.fx.emit('goo', this.x, this.y, { n: 8, speed: 3, life: 0.8, size: 0.12 });
    w.fx.emit('heart', this.x, this.y + 0.5, { n: 1, vy: 1.2, life: 0.8, size: 0.25, grav: 0 });
    w.game.addShake(0.22); w.game.freeze(0.08); w.game.flash('#ff2040', 0.18);
    w.emit('hurt', { dmg });
    if (this.hp <= 0) this.die(w);
    return true;
  }

  heal(n: number, w: World) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.hp > before) {
      w.fx.emit('heart', this.x, this.y + 0.4, { n: 3, spread: 0.3, vy: 1.4, life: 1, size: 0.22, grav: 0 });
      w.sfx('shimmer1', this.x, 0.5);
      this.setExpr('happy', 0.8);
    }
  }

  private deadT = 0;
  private die(w: World) {
    this.alive = false;
    this.deadT = 0;
    this.model.play('die');
    w.sfx('deflate1', this.x, 1); w.sfx('boing', this.x, 0.5, 0.6);
    w.game.timeScale = 0.35;
    this.onDeath?.();
  }
  private deadUpdate(dt: number, w: World) {
    this.deadT += dt;
    w.game.timeScale = Math.min(1, 0.35 + this.deadT * 0.3);
    this.sb.accel(0, 1.2, dt);
    this.sb.accel(-this.sb.vx * 1.5, -this.sb.vy * 1.5, dt);
    this.sb.angle = damp(this.sb.angle, 0, 1.5, dt);
    this.bodyAngle = this.sb.angle;
    this.sb.step(dt, (x, y) => w.terrain.sdf(x, y), (x, y) => w.terrain.normal(x, y));
    this.x = this.sb.cx; this.y = Math.min(this.sb.cy, w.water.heightAt(this.x) - 0.3);
    this.model.weaponVisible = false;
    this.laserOn = false; this.laser.visible = false; this.laserLoop?.stop(0.1); this.laserLoop = null;
    if (Math.random() < dt * 4) w.fx.emit('bubble', this.x, this.y + 0.3, { n: 1 });
    this.place(w);
  }

  dispose() { this.laserLoop?.stop(); }
}

export const ABILITY_NAMES: Record<AbilityId, string> = {
  rockBody: 'Rock Body', laserEyes: 'Laser Eyes', bubbleShield: 'Bubble Shield', inkCloud: 'Ink Cloud', zap: 'Eel Zap', puff: 'Puffer Puff', magnet: 'Lodestone', dash: 'Dash',
};
