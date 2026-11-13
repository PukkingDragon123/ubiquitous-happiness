// The player: a squishy, bouncy blobfish adventurer with a toothpick sword.
//
// Movement is Hungry-Shark-like free swimming (WASD / arrows), Space dashes, J / left mouse slashes toward
// the mouse (3-hit combo, the third a spinning flourish), K / right mouse uses the equipped ability, Q cycles
// abilities. Physics is a 2D soft body (softbody.ts): the body squishes against rocks and bounces back, and
// the 3D mesh bends to match. Near the surface a blobfish decompresses: it sags, bloats and weakens.
//
// The fishing system (src/fishing) talks to the player through: hook (set while hooked), applyForce(),
// intent (swim input), mouthWorld(), and the struggle inputs (struggleTap / struggleHold).
import * as THREE from 'three';
import type { Entity, PlayerLike, World, Team, DamageKind } from '../game/types';
import type { AbilityId, Stats } from '../game/run';
import { SoftBody } from './softbody';
import { BlobModel, buildSword, outlineAt, SB_N } from './blobModel';
import { SlashTrail } from './slashTrail';
import { clamp, damp, dampAngle, smooth, angDiff, TAU, segDist } from '../core/math';
import { audio } from '../audio/audio';
import { POST } from '../gfx/post';
import { buildHook } from '../fishing/bait';

export interface HookLink {
  /** where the line pulls toward (next line node) */
  pullX: number; pullY: number;
  /** pull strength (m/s^2 at the player) */
  tension: number;
  line: Entity;
}

const ABILITY_CD: Record<AbilityId, number> = { rockBody: 7, laserEyes: 0, bubbleShield: 10, inkCloud: 9, zap: 6, puff: 8, magnet: 0, dash: 0 };

export class Blobfish implements PlayerLike {
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
  sb = new SoftBody(outlineAt, SB_N);
  stats!: Stats;
  intent = { x: 0, y: 0 };
  struggleTap = false;
  struggleHold = false;
  aim = new THREE.Vector2(1, 0);
  /** 0 deep .. 1 at the surface: decompression weakness */
  pressure = 0;
  outOfWater = false;
  // sword
  sword: THREE.Group;
  private swordPivot = new THREE.Group();
  private trail = new SlashTrail();
  private swing = { t: 0, dur: 0, from: 0, to: 0, combo: 0, hitSet: new Set<Entity>(), reach: 0.9, spin: false };
  private comboTimer = 0;
  private swordAng = 0.4;
  private lastTip = new THREE.Vector3();
  attackCd = 0;
  // dash
  private dashCd = 0;
  private dashT = 0;
  // abilities
  ability: AbilityId | null = null;
  cds: Partial<Record<AbilityId, number>> = {};
  rock = 0; rockT = 0;
  laserOn = false; laserEnergy = 1; private laser: THREE.Group;
  shield = 0; private shieldMesh: THREE.Mesh;
  puffT = 0;
  private flipK = 1;
  private flash = 0;
  private bounceSnd = 0;
  private exprHold = 0;
  private extForce = new THREE.Vector2();
  private tmpV = new THREE.Vector3();
  private bodyAngle = 0;
  private hurtCount = 0;
  carried: ((dt: number) => void) | null = null;
  private lipHook = buildHook();
  onDeath?: () => void;

  constructor(x = 0, y = -4) {
    this.x = x; this.y = y;
    this.sb.place(x, y);
    this.obj.add(this.model.root);
    this.sword = buildSword();
    this.swordPivot.add(this.sword);
    this.sword.scale.setScalar(1.1);
    this.obj.add(this.swordPivot, this.trail.mesh, ...this.model.tailMeshes);
    // laser beams (two eye beams converge)
    this.laser = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ff5a7a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: '#fff0f4', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [r, m] of [[0.07, beamMat], [0.025, coreMat]] as const) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10, 1, true), m);
      c.geometry.translate(0, 0.5, 0); c.geometry.rotateZ(-Math.PI / 2);
      this.laser.add(c);
    }
    this.laser.visible = false;
    this.obj.add(this.laser);
    // bubble shield: fresnel soap bubble
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 20), new THREE.ShaderMaterial({
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
    if (!this.ability || !s.abilities.includes(this.ability)) this.ability = s.abilities[0] ?? null;
  }

  push(ix: number, iy: number) { this.sb.accel(ix / 0.016, iy / 0.016, 0.016); this.sb.poke(-ix, -iy, Math.hypot(ix, iy) * 0.4); }
  applyForce(fx: number, fy: number) { this.extForce.x += fx; this.extForce.y += fy; }
  mouthWorld(out = new THREE.Vector3()) { return this.model.mouthWorld(out); }
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
    // ---- swimming
    const rocky = this.rock > 0.5;
    const speed = s.speed * weak * (rocky ? 0.35 : 1) * (this.puffT > 0 ? 0.6 : 1);
    let accel = s.accel * weak;
    if (this.outOfWater) accel = 0;
    const tvx = ax.x * speed, tvy = ax.y * speed;
    let fx = (tvx - this.sb.vx) * (accel / speed), fy = (tvy - this.sb.vy) * (accel / speed);
    if (!this.swimming) { fx = -this.sb.vx * 1.2; fy = -this.sb.vy * 1.2; }
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
    // ---- dash
    this.dashCd -= dt; this.dashT -= dt;
    if (inp.hit('dash') && this.dashCd <= 0 && !this.hooked && !this.outOfWater) {
      const d = Math.hypot(ax.x, ax.y) > 0.1 ? new THREE.Vector2(ax.x, ax.y).normalize() : this.aim.clone();
      const p = s.dashPower * weak;
      this.sb.accel(d.x * p / dt * 0.6, d.y * p / dt * 0.6, dt);
      this.dashCd = 0.55; this.dashT = 0.22; this.invuln = Math.max(this.invuln, 0.18);
      this.sb.stretch = 0.35; this.sb.stretchDir = Math.atan2(d.y, d.x);
      w.fx.emit('bubble', this.x - d.x * 0.4, this.y - d.y * 0.4, { n: 10, spread: 0.25, speed: 1.2 });
      w.sfx('swish_a', this.x, 0.5, 1.3);
      w.emit('dash', {});
    }
    // ---- soft body step
    this.sb.accel(fx, fy, dt);
    const sdf = (x: number, y: number) => w.terrain.sdf(x, y);
    const nrm = (x: number, y: number) => w.terrain.normal(x, y);
    // drag (water) / air
    const drag = this.outOfWater ? 0.15 : 1.4;
    this.sb.accel(-this.sb.vx * drag, -this.sb.vy * drag, dt);
    // body orientation follows swim direction (pitch), facing flips through a squash
    const vel = Math.hypot(this.sb.vx, this.sb.vy);
    if (Math.abs(ax.x) > 0.2 && !this.hooked) this.facing = Math.sign(ax.x);
    else if (this.swing.t > 0 && Math.abs(this.aim.x) > 0.3) this.facing = Math.sign(this.aim.x);
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
    // ---- sword
    this.updateSword(dt, w);
    // ---- abilities
    this.updateAbilities(dt, w);
    // ---- timers + visuals
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.model.U.uFlash.value = this.flash * 0.9 + (this.invuln > 0 && this.hurtCount > 0 ? (Math.sin(w.time * 40) > 0 ? 0.25 : 0) : 0);
    this.model.U.uBloat.value = damp(this.model.U.uBloat.value, this.pressure * (this.hooked ? 1.2 : 0.55) + (this.outOfWater ? 0.6 : 0), 4, dt);
    this.model.U.uSqueeze.value = damp(this.model.U.uSqueeze.value, this.hooked ? 0.6 + Math.sin(w.time * 20) * 0.3 : 0, 8, dt);
    this.exprHold -= dt;
    if (this.exprHold <= 0) {
      this.model.setExpression(this.hooked ? 'strain' : this.outOfWater ? 'scared' : this.hp <= 2 ? 'sad' : this.swing.t > 0 ? 'attack' : 'brave');
    }
    // the eyes look where you aim
    this.model.look.set(this.aim.x * this.facing, this.aim.y);
    this.place(w);
  }

  private place(w: World) {
    const root = this.model.root;
    root.position.set(this.x, this.y, 0);
    // a 3/4 view: yawed toward the camera, mirrored for facing; the flip passes through a squash
    const f = this.flipK;
    root.scale.set(Math.sign(f || 1) * Math.max(0.12, Math.abs(f)), 1, 1);
    root.rotation.set(0, -0.55 * Math.sign(f || 1) * Math.abs(f), 0);
    this.model.body.rotation.set(0, 0, this.bodyAngle * Math.sign(f || 1));
    this.model.body.position.set(-0.02 * 0, 0, 0);
    root.updateMatrixWorld(true);
    this.model.facingSign = Math.sign(f || 1);
    this.model.update(w.game.dt, { sb: this.sb, swim: clamp(Math.hypot(this.vx, this.vy) / 5, 0, 1), time: w.time, worldMatrix: root.matrixWorld, vel: new THREE.Vector2(this.vx, this.vy) });
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

  // ------------------------------------------------------------------ sword
  private updateSword(dt: number, w: World) {
    const inp = w.game.input, s = this.stats;
    this.attackCd -= dt; this.comboTimer -= dt;
    const hand = this.model.handWorld(this.tmpV.clone());
    hand.z = 0.6;
    const aimAng = Math.atan2(this.aim.y, this.aim.x);
    if (inp.hit('attack') && this.attackCd <= 0 && !this.outOfWater && this.rock < 0.5) {
      const combo = this.comboTimer > 0 ? (this.swing.combo + 1) % 3 : 0;
      const spin = combo === 2;
      const dir = combo === 1 ? -1 : 1;
      const arc = spin ? TAU : 2.5;
      this.swing = { t: 0, dur: (spin ? 0.34 : 0.22) / Math.max(0.5, s.swordRate / 2.6), from: aimAng + (arc / 2) * dir * (spin ? 0 : 1), to: aimAng - (arc / 2) * dir * (spin ? 0 : 1) - (spin ? TAU * this.facing : 0), combo, hitSet: new Set(), reach: s.swordReach * (spin ? 1.25 : 1), spin };
      if (spin) this.swing.from = aimAng;
      this.attackCd = this.swing.dur + 0.06;
      this.comboTimer = this.swing.dur + 0.45;
      // lunge a little into the swing
      this.sb.accel(this.aim.x * 3.5 / dt * 0.3, this.aim.y * 3.5 / dt * 0.3, dt);
      w.sfx(spin ? 'sw_swish' : 'sw_swish', this.x, 0.55, spin ? 0.85 : 1.1 + combo * 0.08);
      this.setExpr('attack', this.swing.dur + 0.25);
      this.lastTip.set(hand.x + Math.cos(this.swing.from) * this.swing.reach, hand.y + Math.sin(this.swing.from) * this.swing.reach, 0);
    }
    let ang: number;
    if (this.swing.t < this.swing.dur && this.swing.dur > 0) {
      this.swing.t += dt;
      const k = Math.min(1, this.swing.t / this.swing.dur);
      const e = 1 - Math.pow(1 - k, 3);
      ang = this.swing.from + (this.swing.to - this.swing.from) * e;
      const reach = this.swing.reach;
      const tip = new THREE.Vector3(hand.x + Math.cos(ang) * reach, hand.y + Math.sin(ang) * reach, 0.6);
      this.trail.push(new THREE.Vector3(hand.x + Math.cos(ang) * 0.18, hand.y + Math.sin(ang) * 0.18, 0.6), tip);
      this.hitArc(w, hand.x, hand.y, this.lastTip.x, this.lastTip.y, tip.x, tip.y, ang);
      this.lastTip.copy(tip);
      this.swordAng = ang;
    } else {
      // idle: held up and forward, bobbing, pointing roughly where you aim
      const idle = Math.atan2(this.aim.y * 0.6 + 0.35, this.aim.x * 0.6 + this.facing * 0.5);
      this.swordAng = dampAngle(this.swordAng, idle + Math.sin(w.time * 2.2) * 0.08, 10, dt);
      ang = this.swordAng;
    }
    this.trail.update(dt);
    this.swordPivot.position.copy(hand);
    this.swordPivot.rotation.set(0, 0, ang);
    this.swordPivot.visible = this.rock < 0.5;
  }

  /** sweep test for the blade between last and current tip */
  private hitArc(w: World, hx: number, hy: number, px: number, py: number, tx: number, ty: number, ang: number) {
    const s = this.stats;
    for (const e of w.entities) {
      if (!e.alive || e === (this as Entity)) continue;
      // lines (and anything else with a slash handler) get the exact blade sweep
      if (e.slash) {
        if (e.slash(hx, hy, tx, ty, s.lineCut, w) || e.slash(px, py, tx, ty, s.lineCut, w)) {
          w.fx.burst('spark', tx, ty, 6, 3);
        }
        continue;
      }
      if (e.team === 'player' || this.swing.hitSet.has(e) || !e.hit) continue;
      const d1 = segDist(e.x, e.y, hx, hy, tx, ty).d, d2 = segDist(e.x, e.y, px, py, tx, ty).d;
      if (Math.min(d1, d2) < e.r + 0.08) {
        this.swing.hitSet.add(e);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const dmg = s.swordDmg * (this.swing.spin ? 1.5 : 1);
        if (e.hit(dmg, e.x - this.x === 0 ? dx : Math.sign(e.x - this.x), 0.3, w, this, 'sword')) {
          w.fx.burst('spark', e.x - (e.x - tx) * 0.5, e.y - (e.y - ty) * 0.5, 8, 4);
          w.fx.emit('star', tx, ty, { n: 2, speed: 2, life: 0.4, size: 0.18 });
          w.sfx('sw_slash', e.x, 0.6);
          w.game.freeze(0.045);
          w.game.addShake(0.06);
          w.emit('hit', { target: e.kind, dmg });
        }
      }
    }
  }

  // ------------------------------------------------------------------ abilities
  private updateAbilities(dt: number, w: World) {
    const inp = w.game.input, s = this.stats;
    for (const k of Object.keys(this.cds) as AbilityId[]) this.cds[k] = Math.max(0, (this.cds[k] ?? 0) - dt);
    if (inp.hit('ability2') && s.abilities.length > 1) {
      const i = s.abilities.indexOf(this.ability ?? s.abilities[0]);
      this.ability = s.abilities[(i + 1) % s.abilities.length];
      w.text.pop(ABILITY_NAMES[this.ability], 0, 0.95, 'magic', { size: 0.32, follow: () => ({ x: this.x, y: this.y }) });
      w.sfx('k_select1', this.x, 0.5);
    }
    const ab = this.ability;
    const ready = ab && (this.cds[ab] ?? 0) <= 0;
    if (ab && inp.hit('ability') && ready) this.useAbility(ab, w);
    // laser: hold
    this.laserOn = ab === 'laserEyes' && inp.held('ability') && this.laserEnergy > 0.02 && !this.outOfWater;
    if (this.laserOn) this.laserEnergy = Math.max(0, this.laserEnergy - dt / 2.8); else this.laserEnergy = Math.min(1, this.laserEnergy + dt / 4);
    this.updateLaser(dt, w);
    // rock
    if (this.rockT > 0) { this.rockT -= dt; if (this.rockT <= 0) { w.sfx('rock_crumble', this.x, 0.5, 1.3); w.fx.debrisBurst(this.x, this.y, 14, '#8a8378', 3); } }
    this.rock = damp(this.rock, this.rockT > 0 ? 1 : 0, 9, dt);
    this.model.U.uRock.value = this.rock;
    // puff: spiky contact damage
    if (this.puffT > 0) {
      this.puffT -= dt;
      for (const e of w.near(this.x, this.y, 0.85, 'enemy')) if (e.hit && !this.swing.hitSet.has(e)) { e.hit(1, Math.sign(e.x - this.x), 0.5, w, this, 'spike'); w.fx.burst('spark', e.x, e.y, 5, 3); }
    }
    this.model.U.uGlow.value.setRGB(this.laserOn ? 0.5 : 0, this.laserOn ? 0.05 : 0, this.laserOn ? 0.1 : 0);
  }

  private useAbility(ab: AbilityId, w: World) {
    this.cds[ab] = ABILITY_CD[ab];
    switch (ab) {
      case 'rockBody':
        this.rockT = 2.6;
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
          if (e.slash && d < 6) {
            // zap snaps any line segment that passes within reach
            for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; e.slash(this.x, this.y, this.x + Math.cos(a) * 2.2, this.y + Math.sin(a) * 2.2, 6, w); }
          } else if (e.team === 'enemy' && e.hit && d < 2.4 + e.r) e.hit(2, Math.sign(e.x - this.x), 0.4, w, this, 'zap');
        }
        w.game.flash('#cff6ff', 0.25); w.game.addShake(0.12);
        break;
      }
      case 'puff':
        this.puffT = 2.5; w.sfx('inflate1', this.x, 0.9); w.text.pop('PUFF!', this.x, this.y + 1, 'shout', { size: 0.34 });
        break;
      default: break;
    }
  }

  private updateLaser(dt: number, w: World) {
    this.laser.visible = this.laserOn;
    if (!this.laserOn) { this.laserLoop?.stop(0.1); this.laserLoop = null; return; }
    if (!this.laserLoop) { this.laserLoop = audio.loop('laser_beam1', 0.4); w.sfx('laser_shot1', this.x, 0.6); }
    const eye = this.model.eyes[0].g.getWorldPosition(this.tmpV.clone());
    const dir = this.aim;
    // march to the first solid
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
    const dx = this.x - fromX, dy = this.y - fromY, l = Math.hypot(dx, dy) || 1;
    if (this.shield > 0) {
      this.shield = 0; this.invuln = 0.6;
      w.sfx('pop', this.x, 0.9); w.fx.emit('bubble', this.x, this.y, { n: 24, spread: 0.7, speed: 3 });
      w.text.pop('POP!', this.x, this.y + 0.8, 'hint', { size: 0.3 });
      this.cds.bubbleShield = ABILITY_CD.bubbleShield;
      return false;
    }
    if (this.rock > 0.5 && kind !== 'explosion') { w.sfx('rock_hit', this.x, 0.7); w.fx.burst('spark', this.x, this.y, 6, 3); return false; }
    if (Math.random() < this.stats.armor) { w.text.pop('BLOCK', this.x, this.y + 0.8, 'hint', { size: 0.3 }); this.invuln = 0.4; return false; }
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 1.0;
    this.hurtCount++;
    this.flash = 1;
    this.sb.poke(dx / l, dy / l, 9);
    this.sb.accel((dx / l) * 7 / 0.016, (dy / l) * 7 / 0.016, 0.016);
    this.setExpr('hurt', 0.6);
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
    this.model.setExpression('sleep');
    w.sfx('deflate1', this.x, 1); w.sfx('boing', this.x, 0.5, 0.6);
    w.game.timeScale = 0.35;
    this.onDeath?.();
  }
  private deadUpdate(dt: number, w: World) {
    this.deadT += dt;
    w.game.timeScale = Math.min(1, 0.35 + this.deadT * 0.3);
    this.sb.accel(0, 1.2, dt);
    this.sb.accel(-this.sb.vx * 1.5, -this.sb.vy * 1.5, dt);
    this.sb.angle = damp(this.sb.angle, Math.PI * 0.95, 1.5, dt);
    this.bodyAngle = this.sb.angle;
    this.sb.step(dt, (x, y) => w.terrain.sdf(x, y), (x, y) => w.terrain.normal(x, y));
    this.x = this.sb.cx; this.y = Math.min(this.sb.cy, w.water.heightAt(this.x) - 0.3);
    this.swordPivot.visible = false;
    if (Math.random() < dt * 4) w.fx.emit('bubble', this.x, this.y + 0.3, { n: 1 });
    this.place(w);
  }

  dispose() { this.laserLoop?.stop(); }
}

export const ABILITY_NAMES: Record<AbilityId, string> = {
  rockBody: 'Rock Body', laserEyes: 'Laser Eyes', bubbleShield: 'Bubble Shield', inkCloud: 'Ink Cloud', zap: 'Eel Zap', puff: 'Puffer Puff', magnet: 'Lodestone', dash: 'Dash',
};
void angDiff;
