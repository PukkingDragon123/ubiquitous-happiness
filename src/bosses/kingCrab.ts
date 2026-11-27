// REEF BOSS — KING KRAKKUS, Warlord of the Reef: a giant king crab in a gold crown, a big readable melee
// duel. A crusher claw (near side) and a cutter claw (far side) on jointed arms, six legs, eye stalks.
//
//   Phase 1  jab (white) | double jab (white, white) | overhead CRUSH (white, slow: parry it for a long stagger;
//            whiffed, the claw sticks in the sand) | GUARD (claws up as a shield: light hits clang off and he
//            counter-pinches RED; a heavy breaks the guard)
//   Phase 2  + low claw SWEEP (red: swim up / dodge) + sideways CHARGE (white, parryable; dodge it and he rams
//            the wall and is stunned)
//   Phase 3  enraged (faster, red eyes) + twin-claw SLAM (red) that sends shockwaves along the seabed both ways
// Cycles are fixed per phase (learnable), with range checks.
import * as THREE from 'three';
import type { World, Entity, Team } from '../game/types';
import type { Arena } from '../combat/types';
import type { MoveDef } from '../combat/core';
import { BossBase } from './base';
import { attackPlayer } from '../combat/resolve';
import { dangerZone, glint } from '../combat/telegraph';
import { callout } from '../combat/feel';
import { kitMat } from '../humans/diveGear';
import { band } from '../humans/fabric';
import { clamp, damp } from '../core/math';
import { Loft, ring, usFor, FULL, type V3, type Reg } from '../gfx/loft';

// ------------------------------------------------------------------ materials (clean pixel paint, flat shaded)
const bellyMat = () => kitMat('kkBelly', 32, 32, (x, y) => band([232, 204, 162], 0.9 + (y % 8 === 0 ? -0.14 : y % 8 === 1 ? 0.08 : 0) + (x % 16 === 0 ? -0.06 : 0), x, y), { rough: 0.8 });
const goldMat = () => kitMat('kkGold', 16, 16, (x, y) => band([236, 184, 58], y < 4 ? 1.25 : 0.85 + (x % 5 === 0 ? 0.15 : 0), x, y, 0.08), { rough: 0.35, metal: 0.8 });
const eyeMat = () => kitMat('kkEye', 8, 8, (x, y) => (x < 3 && y < 3 ? [255, 255, 255] : [16, 12, 12]), { rough: 0.2 });

// v8 polish: the lofted king's pages, hand-placed (no noise): a 6-tone hue-shifted crimson ramp, a cream belly ramp.
// Shell page (64 x 64): x runs round the carapace (top at x = 0 / 63, the belly at x = 32), y along it (back -> front).
const KR: [number, number, number][] = [[58, 10, 20], [110, 22, 32], [168, 42, 42], [216, 80, 58], [244, 138, 90], [255, 192, 138]];
const KB: [number, number, number][] = [[122, 90, 72], [176, 140, 108], [216, 188, 148], [240, 220, 180]];
const shellMat2 = () => kitMat('kkShell2', 64, 64, (x, y) => {
  const top = Math.cos((x / 64) * Math.PI * 2);
  if (top < -0.42) {                                                     // the belly plates: cream, segmented
    let k = top < -0.8 ? 2 : 1;
    if (y % 7 === 0) k = 0; else if (y % 7 === 1) k = 3;
    return KB[k];
  }
  let k = top > 0.55 ? 3 : top > 0.1 ? 2 : 1;
  if (top > 0.85 && y > 10 && y < 54) k = 4;                              // the lit crown of the dome
  if (top > -0.1 && top < 0.1) k = 0;                                     // the shadowed rim groove
  // tubercles: a staggered lattice of round knobs (lit top-left pixel, dark lower-right)
  const ox = (Math.floor(y / 6) % 2) * 3, kx = (x + ox) % 6, ky = y % 6;
  if (top > 0.05) { if (kx === 2 && ky === 2) k = Math.min(5, k + 2); else if ((kx === 3 && ky === 3) || (kx === 2 && ky === 3)) k = Math.max(0, k - 1); }
  // two old battle scars (dark groove, pale lip) and a barnacle cluster, hand-placed
  for (const [x0, y0, len] of [[6, 20, 12], [52, 34, 9]]) { const d = x - x0 - (y - y0); if (y >= y0 && y < y0 + len) { if (d === 0) return KR[0]; if (d === -1) return KR[5]; } }
  for (const [bx, by] of [[10, 44], [13, 46], [9, 47], [56, 14], [58, 16]]) { const dx = x - bx, dy = y - by; if (dx >= 0 && dx < 2 && dy >= 0 && dy < 2) return dx === 0 && dy === 0 ? [242, 234, 214] : [196, 184, 160]; if (dx === 2 && dy === 1) return [90, 80, 66]; }
  if (y > 59) k = Math.max(0, k - 1);                                     // the front rim edge
  return KR[k];
}, { rough: 0.62 });
// Claw page (32 x 32): rows 0..15 = palms / limb segments (UV top half), rows 16..31 = fingers and leg tips with the
// black-brown tips at the far end (rows 25+). x runs round each part (the flat facets do the shading).
const clawMat2 = () => kitMat('kkClaw2', 32, 32, (x, y) => {
  let k = x === 16 || x === 17 ? 1 : x < 3 ? 3 : 2;                        // one lit ridge, one seam underneath
  if (y < 16) { if ((x + y * 3) % 11 === 0) k = Math.min(5, k + 2); return KR[k]; }   // pale knob speckle on the limbs
  if (y >= 28) return [[30, 20, 20], [52, 36, 34], [74, 52, 46], [96, 70, 60]][Math.min(3, k)] as [number, number, number];
  if (y >= 25) return [[70, 22, 24], [96, 32, 30], [124, 46, 40], [150, 66, 54]][Math.min(3, k)] as [number, number, number];
  return KR[Math.min(5, k + (y < 19 ? 0 : 0))];
}, { rough: 0.5 });
const LIMB: Reg = { x: 0, y: 0.5, w: 1, h: 0.5 }, TIP: Reg = { x: 0, y: 0, w: 1, h: 0.5 };
/** a tapered spike / tooth: base -> tip along d, slightly curved by `bend` */
function spike(L: Loft, base: V3, d: V3, len: number, r0: number, reg: Reg, bend: V3 = [0, 0, 0]) {
  const m: V3 = [base[0] + d[0] * len * 0.5 + bend[0] * len * 0.15, base[1] + d[1] * len * 0.5 + bend[1] * len * 0.15, base[2] + d[2] * len * 0.5 + bend[2] * len * 0.15];
  const t: V3 = [base[0] + d[0] * len + bend[0] * len * 0.3, base[1] + d[1] * len + bend[1] * len * 0.3, base[2] + d[2] * len + bend[2] * len * 0.3];
  L.tube([base, m, t], (u) => r0 * (1 - u) + 0.004, 5, reg, 0, { capEnd: true });
}
const nrm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

function part(geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...at); m.scale.set(...scale); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

interface Arm { shoulder: THREE.Group; elbow: THREE.Group; claw: THREE.Group; finger: THREE.Group; tip: THREE.Object3D; big: boolean }
interface Leg { hip: THREE.Group; knee: THREE.Group; ph: number; side: number }

const M: Record<string, MoveDef> = {
  jab: { id: 'jab', windup: 0.55, active: 0.14, recover: 0.45, dmg: 1, kind: 'crush', knock: 4 },
  jab2: { id: 'jab2', windup: 0.32, active: 0.14, recover: 0.6, dmg: 1, kind: 'crush', knock: 4 },
  double: { id: 'double', windup: 0.5, active: 0.14, recover: 0.2, dmg: 1, kind: 'crush', knock: 4 },
  crush: { id: 'crush', windup: 0.95, active: 0.18, recover: 1.0, dmg: 2, kind: 'crush', knock: 8, guardDmg: 60, tellAt: 0.32 },
  guard: { id: 'guard', windup: 0.25, active: 1.7, recover: 0.3, dmg: 0, tell: 'none' },
  counter: { id: 'counter', windup: 0.38, active: 0.14, recover: 0.6, dmg: 1.5, unblockable: true, kind: 'crush', knock: 6, tellAt: 0.3 },
  sweep: { id: 'sweep', windup: 0.8, active: 0.26, recover: 0.7, dmg: 2, unblockable: true, kind: 'crush', knock: 7, tellAt: 0.4 },
  charge: { id: 'charge', windup: 0.75, active: 1.4, recover: 0.6, dmg: 1.5, kind: 'crush', knock: 9, guardDmg: 50 },
  slam: { id: 'slam', windup: 1.0, active: 0.2, recover: 1.0, dmg: 1.5, unblockable: true, kind: 'crush', tellAt: 0.45, hyper: true },
};

/** a shockwave rolling along the seabed (the twin-claw slam): dodge through it or swim over it */
class Shockwave implements Entity {
  kind = 'shockwave'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy = 0; r = 0.5; alive = true;
  obj = new THREE.Group();
  private t = 0; private done = false;
  constructor(x: number, y: number, dir: number, private src: Entity, private dmg: number, private arena: Arena) {
    this.x = x; this.y = y; this.vx = dir * 7.5;
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.x += this.vx * dt;
    if (Math.random() < dt * 40) w.fx.silt(this.x, this.y + 0.1, 2);
    if (Math.random() < dt * 25) w.fx.emit('dust', this.x, this.y + 0.2, { n: 1, size: 0.5, vy: 1.5, life: 0.5, color: '#d8b080' });
    if (Math.random() < dt * 12) w.fx.emit('spark', this.x, this.y + 0.35, { n: 1, color: '#ff5030', life: 0.25 });
    const p = w.player;
    if (!this.done && Math.abs(p.x - this.x) < 0.6 + p.r && p.y - this.y < 1.1) {
      const r = attackPlayer(w, { src: this.src, dmg: this.dmg, x: this.x, y: this.y - 0.5, kind: 'crush', unblockable: true, knock: 6, name: 'shockwave' });
      if (r !== 'dodged' && r !== 'immune') this.done = true;
    }
    if (this.x < this.arena.x0 + 0.3 || this.x > this.arena.x1 - 0.3 || this.t > 4) this.alive = false;
  }
}

export class KingCrab extends BossBase {
  cycles = [
    ['jab', 'jab', 'crush', 'guard', 'double', 'crush'],
    ['double', 'sweep', 'crush', 'charge', 'jab', 'sweep', 'guard'],
    ['double', 'slam', 'charge', 'sweep', 'crush', 'slam', 'double'],
  ];
  moves = M;
  private root = new THREE.Group();
  private bodyG = new THREE.Group();
  private arms: Arm[] = [];
  private legs: Leg[] = [];
  private eyes: THREE.Group[] = [];
  private eyeBalls: THREE.Mesh[] = [];
  private walkPh = 0;
  private lean = 0; private bob = 0; private yaw = 0;
  private chargeDir = 1; private stuck = 0; private jabTilt = 0;
  private enraged = false;
  private shellMats: THREE.MeshStandardMaterial[] = [];
  // pose targets (radians) per arm: [shoulder z, shoulder y, elbow z, finger open]
  private pose = [[0.3, 0.25, -0.6, 0.2], [0.3, -0.25, -0.6, 0.2]];
  private cur = [[0.3, 0.25, -0.6, 0.2], [0.3, -0.25, -0.6, 0.2]];

  constructor(arena: Arena) {
    super('kingCrab', arena, { name: 'KING KRAKKUS', title: 'Warlord of the Reef', hp: 90, poise: 120, r: 1.5 });
    this.y = arena.floor + 1.95;
    this.build();
  }

  private build() {
    // v8 polish: lofted carapace, jointed limb segments, swollen crusher palm, curved toothed fingers and walking-leg
    // daggers (was icosahedra, cylinders and cones). The rig (groups, pivots, tip marker) is unchanged.
    const S = shellMat2(), C = clawMat2(), G = goldMat(), E = eyeMat();
    const B = bellyMat();
    // the shell materials get their own emissive for the hit flash (clones so other crabs don't flash)
    const shell = (S as THREE.MeshStandardMaterial).clone(); const claw = (C as THREE.MeshStandardMaterial).clone();
    shell.emissive = new THREE.Color(0, 0, 0); claw.emissive = new THREE.Color(0, 0, 0);
    this.shellMats.push(shell, claw);
    const b = this.bodyG;
    // ---- the carapace: a broad dome with a raised rim shelf, narrowing to a horned rostrum at the front
    {
      const L = new Loft(), NA = 22, NR = 16;
      const rz = (f: number) => 1.1 * Math.pow(Math.sin(Math.PI * f), 0.42) * (1 - 0.14 * Math.max(0, (f - 0.7) / 0.3));
      const ryT = (f: number) => 0.84 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.08)), 0.62) + 0.04;
      const ryB = (f: number) => 0.46 * Math.pow(Math.sin(Math.PI * f), 0.5) + 0.03;
      const shelf = (th: number) => { const a = Math.min(th, Math.PI * 2 - th); return 0.07 * Math.exp(-(((a - 1.42) / 0.22) ** 2)) - 0.03 * Math.exp(-(((a - 1.75) / 0.2) ** 2)); };
      const rings = [];
      for (let i = 1; i < NR; i++) { const f = i / NR; rings.push({ pts: ring([-1.15 + f * 2.3, -0.02, 0], [0, 0, 1], [0, 1, 0], rz(f), ryT(f), ryB(f), NA, 2.3, shelf), v: f }); }
      L.loft(rings, usFor(NA), FULL, 0, { start: [-1.2, 0.0, 0], end: [1.2, 0.02, 0] });
      // rim spikes along the shelf (seven a side, curving up and out), tubercle spines on the dome, rostrum horns
      const rimAt = (f: number, side: number): V3 => { const a = 1.42, k = 1 + shelf(a); return [-1.15 + f * 2.3, -0.02 + Math.cos(a) * ryT(f) * k, side * Math.sin(a) * rz(f) * k]; };
      for (const side of [1, -1]) for (let i = 0; i < 7; i++) {
        const f = 0.16 + i * 0.105, p = rimAt(f, side);
        spike(L, p, nrm([(f - 0.5) * 0.9, 0.45, side]), 0.3 + (i === 3 ? 0.08 : 0) - Math.abs(i - 3) * 0.02, 0.075, FULL, [0, 1, 0]);
      }
      for (const [f, a] of [[0.4, 0.5], [0.55, -0.55], [0.3, -0.35], [0.66, 0.4], [0.48, 0]] as [number, number][]) {
        const p: V3 = [-1.15 + f * 2.3, -0.02 + Math.cos(a) * ryT(f), Math.sin(a) * rz(f)];
        spike(L, p, nrm([0.2, 1, Math.sin(a) * 0.6]), 0.14, 0.05, FULL);
      }
      for (const side of [1, -1]) spike(L, [1.12, 0.12, side * 0.12], nrm([1, 0.45, side * 0.35]), 0.26, 0.06, FULL, [0, 1, 0]);
      b.add(part(L.build(), shell, [0, 0, 0]));
    }
    // ---- the sternum plate underneath and the mouthparts (maxillipeds) at the front
    {
      const L = new Loft(), NA = 14;
      const rings = [];
      for (let i = 1; i < 8; i++) { const f = i / 8, w = 0.82 * Math.pow(Math.sin(Math.PI * f), 0.5); rings.push({ pts: ring([-0.8 + f * 1.7, -0.36, 0], [0, 0, 1], [0, 1, 0], w, 0.1, 0.12, NA, 2.6), v: f }); }
      L.loft(rings, usFor(NA), FULL, 0, { start: [-0.82, -0.36, 0], end: [0.92, -0.34, 0] });
      for (const side of [1, -1]) L.tube([[1.0, -0.02, side * 0.1], [1.12, -0.16, side * 0.12], [1.14, -0.32, side * 0.09]], (t) => 0.07 - t * 0.03, 5, FULL, 0, { capStart: true, capEnd: true });
      b.add(part(L.build(), B, [0, 0, 0]));
    }
    // a gold crown on top (five points) and its sea-glass gem
    b.add(part(new THREE.CylinderGeometry(0.34, 0.42, 0.2, 10), G, [0.1, 0.8, 0]));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.add(part(new THREE.ConeGeometry(0.07, 0.26, 4), G, [0.1 + Math.cos(a) * 0.33, 1.0, Math.sin(a) * 0.33])); }
    b.add(part(new THREE.OctahedronGeometry(0.08), new THREE.MeshStandardMaterial({ color: '#3ad0ff', emissive: '#1080c0', roughness: 0.6, flatShading: true }), [0.44, 0.84, 0]));
    // eye stalks: a jointed stalk, a socket collar and the bead
    for (const z of [0.28, -0.28]) {
      const g = new THREE.Group(); g.position.set(0.98, 0.36, z);
      const L = new Loft();
      L.tube([[0, -0.04, 0], [0.02, 0.2, 0], [0.04, 0.4, 0]], (t) => 0.075 - t * 0.025, 6, LIMB, 0, { capStart: true });
      L.tube([[0.04, 0.37, 0], [0.04, 0.42, 0]], () => 0.075, 6, LIMB, 0, { capStart: true });
      g.add(part(L.build(), shell, [0, 0, 0]));
      const eye = part(new THREE.IcosahedronGeometry(0.11, 1), E, [0.05, 0.48, 0]);
      g.add(eye); this.eyeBalls.push(eye);
      b.add(g); this.eyes.push(g);
    }
    // arms: crusher (near, z+) and cutter (far, z-)
    for (const [z, big] of [[0.9, true], [-0.9, false]] as const) {
      const k = big ? 1.25 : 0.95;
      const shoulder = new THREE.Group(); shoulder.position.set(0.75, -0.05, z);
      {
        const L = new Loft();
        L.tube([[-0.05, 0, 0], [0.4, 0.04 * k, 0], [0.84, 0, 0]], (t) => (0.15 + 0.05 * Math.sin(Math.PI * t)) * k, 7, LIMB, 0, { capStart: true, capEnd: true });
        for (let i = 0; i < 3; i++) spike(L, [0.2 + i * 0.22, 0.17 * k, 0], nrm([0.4, 1, 0]), 0.1 * k, 0.035 * k, TIP);
        shoulder.add(part(L.build(), claw, [0, 0, 0]));
      }
      const elbow = new THREE.Group(); elbow.position.set(0.8, 0, 0);
      {
        const L = new Loft();
        L.tube([[-0.06, 0, 0], [0.35, 0.03 * k, 0], [0.74, 0, 0]], (t) => (0.17 - 0.03 * t + 0.03 * Math.sin(Math.PI * t)) * k, 7, LIMB, 0, { capStart: true, capEnd: true });
        for (let i = 0; i < 2; i++) spike(L, [0.2 + i * 0.25, 0.18 * k, 0.04 * k], nrm([0.5, 1, 0.3]), 0.09 * k, 0.03 * k, TIP);
        elbow.add(part(L.build(), claw, [0, 0, 0]));
      }
      const c = new THREE.Group(); c.position.set(0.7, 0, 0);
      {
        // the palm (propodus): swollen, ridged on top; the fixed finger (pollex) curving up, toothed on its inner edge
        const L = new Loft(), NA = 14;
        const rings = [];
        for (let i = 0; i <= 8; i++) {
          const f = i / 8, pp = 0.55 + 0.45 * Math.sin(Math.PI * f * 0.8);
          rings.push({ pts: ring([f * 0.78 * k, 0, 0], [0, 0, 1], [0, 1, 0], 0.27 * k * pp * (big ? 1 : 0.85), 0.34 * k * pp, 0.3 * k * pp, NA, 2.2, (th) => 0.06 * Math.exp(-((Math.min(th, Math.PI * 2 - th) / 0.35) ** 2))), v: f });
        }
        L.loft(rings, usFor(NA), LIMB, 0, { start: [-0.04 * k, 0, 0], end: [0.82 * k, 0.02 * k, 0] });
        const pol: V3[] = [[0.6 * k, -0.1 * k, 0], [0.95 * k, -0.15 * k, 0], [1.25 * k, -0.1 * k, 0], [1.4 * k, 0.03 * k, 0]];
        L.tube(pol, (t) => 0.16 * k * Math.pow(1 - t, 0.7) + 0.008, 6, TIP, 0, { capEnd: true });
        for (let i = 0; i < 4; i++) spike(L, [(0.82 + i * 0.13) * k, (-0.07 + i * 0.01) * k, 0], nrm([0.25, 1, 0]), 0.07 * k, 0.03 * k, TIP);
        c.add(part(L.build(), claw, [0, 0, 0]));
      }
      const finger = new THREE.Group(); finger.position.set(0.55 * k, 0.16 * k, 0);
      {
        // the movable finger (dactyl): hooked down at the tip, teeth on its lower edge
        const L = new Loft();
        L.tube([[-0.02 * k, 0, 0], [0.35 * k, 0.05 * k, 0], [0.66 * k, -0.01 * k, 0], [0.82 * k, -0.14 * k, 0]], (t) => 0.13 * k * Math.pow(1 - t, 0.7) + 0.008, 6, TIP, 0, { capStart: true, capEnd: true });
        for (let i = 0; i < 3; i++) spike(L, [(0.25 + i * 0.14) * k, -0.07 * k, 0], nrm([0.2, -1, 0]), 0.06 * k, 0.026 * k, TIP);
        finger.add(part(L.build(), claw, [0, 0, 0]));
      }
      c.add(finger);
      const tip = new THREE.Object3D(); tip.position.set(1.2 * k, 0, 0); c.add(tip);
      elbow.add(c); shoulder.add(elbow);
      b.add(shoulder);
      this.arms.push({ shoulder, elbow, claw: c, finger, tip, big });
    }
    // legs: three per side, splayed; a thick upper segment and a long dagger-tipped lower one
    for (const side of [1, -1]) for (let i = 0; i < 3; i++) {
      const hip = new THREE.Group(); hip.position.set(0.35 - i * 0.48, -0.2, side * 0.8);
      hip.rotation.set(side * 0.5, 0, 0);
      {
        const L = new Loft();
        L.tube([[0, -0.02, 0], [0.02, 0.38, 0], [0, 0.78, 0]], (t) => 0.1 + 0.025 * Math.sin(Math.PI * t) - t * 0.02, 6, LIMB, 0, { capStart: true, capEnd: true });
        spike(L, [0.08, 0.5, 0], nrm([1, 0.6, 0]), 0.08, 0.025, TIP);
        hip.add(part(L.build(), shell, [0, 0, 0]));
      }
      const knee = new THREE.Group(); knee.position.set(0, 0.72, 0);
      {
        const L = new Loft();
        L.tube([[0, 0.06, 0], [0.04, -0.45, 0], [0.03, -0.98, 0], [-0.05, -1.46, 0]], (t) => 0.095 * Math.pow(1 - t, 0.55) + 0.012, 6, TIP, 0, { capStart: true, capEnd: true });
        knee.add(part(L.build(), claw, [0, 0, 0]));
      }
      hip.add(knee);
      b.add(hip);
      this.legs.push({ hip, knee, ph: i * 2.1 + (side > 0 ? 0 : 1.05), side });
    }
    this.root.add(b);
    this.obj.add(this.root);
  }

  protected tellPoint() { const m = this.core.move; const a = this.arms[m?.id === 'jab2' || m?.id === 'counter' ? 1 : 0]; return this.tipWorld(a); }
  private tipWorld(a: Arm) { this.obj.updateMatrixWorld(true); const v = a.tip.getWorldPosition(new THREE.Vector3()); return { x: v.x, y: v.y }; }

  protected want(id: string, w: World): boolean {
    const p = w.player, dx = Math.abs(p.x - this.x);
    switch (id) {
      case 'charge': return dx > 3 || this.st > 2;
      case 'slam': return dx < 7;
      case 'guard': return dx < 4.5;
      case 'crush': return dx < 3.4;
      default: return dx < 3.2;
    }
  }
  protected approach(dt: number, w: World, next: string) {
    const p = w.player, a = this.arena;
    const want = next === 'charge' ? (Math.abs(p.x - this.x) < 3 ? -1 : 0) : Math.abs(p.x - this.x) > 2.6 ? 1 : Math.abs(p.x - this.x) < 1.6 ? -0.6 : 0;
    const sp = (this.enraged ? 3 : 2.2) * want * Math.sign(p.x - this.x);
    this.vx = damp(this.vx, sp, 4, dt);
    this.x = clamp(this.x + this.vx * dt, a.x0 + 1.6, a.x1 - 1.6);
    // idle claws: up and snapping
    this.pose[0] = [0.35 + Math.sin(this.st * 2) * 0.05, 0.25, -0.7, 0.15 + Math.max(0, Math.sin(this.st * 3)) * 0.4];
    this.pose[1] = [0.25, -0.25, -0.6, 0.2];
    this.lean = 0; this.yaw = 0;
  }

  protected started(w: World, m: MoveDef) {
    this.stuck = 0;
    if (m.id === 'charge') { this.chargeDir = Math.sign(w.player.x - this.x) || 1; w.sfx('scuttle', this.x, 0.9, 0.7); }
    if (m.id === 'slam') { dangerZone(w, this.x + this.facing * 1.5, this.arena.floor + 0.2, 1.6, m.windup / this.core.speed, true); w.sfx('boss_growl', this.x, 0.7, 1.1); }
    if (m.id === 'sweep') w.sfx('grunt', this.x, 0.6, 0.6);
    if (m.id === 'crush') w.sfx('creak', this.x, 0.7, 0.6);
    if (m.id === 'guard') { w.sfx('clank', this.x, 0.6, 0.7); this.core.guard = 'front'; }
    w.sfx('crab_click', this.x, 0.8, 0.7);
  }

  protected run(dt: number, w: World) {
    const c = this.core, m = c.move!, p = w.player, f = this.facing, k = c.k;
    const ph = c.phase;
    if (!m) return;
    this.vx = damp(this.vx, 0, 6, dt);
    switch (m.id) {
      case 'jab': case 'jab2': case 'double': case 'counter': {
        const i = m.id === 'jab2' || m.id === 'counter' ? 1 : 0;
        const o = 1 - i;
        // the jab is aimed: the arm tilts down at a blobfish on the seabed, up at one above
        if (ph === 'windup' && k < 0.8) this.jabTilt = clamp(Math.atan2(p.y - (this.y - 0.1), Math.max(1, Math.abs(p.x - this.x) - 0.6)), -0.75, 0.6);
        const tl = this.jabTilt;
        if (ph === 'windup') { this.pose[i] = [0.55 + tl * 0.5, (i ? -0.5 : 0.5), -1.6 * Math.min(1, k * 1.6), 0.9]; this.lean = -0.1 * k; }
        else if (ph === 'active') {
          this.pose[i] = [0.05 + tl, (i ? -0.1 : 0.1), 0.05, k < 0.5 ? 1 : 0]; this.lean = 0.12;
          if (c.justEntered('active')) { this.x += f * 0.35; w.sfx('swish_c', this.x, 0.8, 0.7); }
          const t = this.tipWorld(this.arms[i]);
          const r = this.hitCircle(w, t.x, t.y, 0.75);
          if (r === 'hit') w.sfx('crab_snip', this.x, 1, 0.6);
        } else if (ph === 'recover') {
          this.pose[i] = [0.3, (i ? -0.25 : 0.25), -0.5, 0.1];
          if (m.id === 'double' && k > 0.2) { c.start(M.jab2); glint(w, this.tipWorld(this.arms[1]).x, this.tipWorld(this.arms[1]).y, { size: 1.2 }); }
        }
        this.pose[o] = [0.25, o ? -0.3 : 0.3, -0.8, 0.1];
        break;
      }
      case 'crush': {
        if (ph === 'windup') { this.pose[0] = [1.5 * Math.min(1, k * 1.3), 0.2, -1.0, 1.0]; this.lean = -0.18 * k; this.bob = 0.15 * k; }
        else if (ph === 'active') {
          this.pose[0] = [-0.55, 0.1, -0.15, 0.1]; this.lean = 0.2; this.bob = -0.1;
          const t = this.tipWorld(this.arms[0]);
          const r = this.hitCircle(w, t.x, Math.max(t.y, this.arena.floor + 0.4), 1.0, { knock: 8 });
          if (c.justEntered('active')) { w.sfx('thud_heavy', this.x, 1, 0.7); w.sfx('rock_hit', this.x, 0.7, 0.6); }
          if (k > 0.6 && c.t - dt < m.active * 0.6) { w.game.addShake(0.3); w.fx.silt(t.x, this.arena.floor + 0.1, 16); w.fx.shockwave(t.x, this.arena.floor + 0.2, 1.4, '#ffd0a0'); }
          void r;
        } else { this.pose[0] = [-0.5 + k * 0.6, 0.1, -0.2, 0.1]; this.lean = 0.2 * (1 - k); this.bob = -0.1 * (1 - k); if (k < 0.7 && Math.random() < dt * 6) w.fx.silt(this.tipWorld(this.arms[0]).x, this.arena.floor + 0.1, 2); }
        this.pose[1] = [0.2, -0.3, -0.7, 0.2];
        break;
      }
      case 'guard': {
        this.pose[0] = [0.9, 0.55, -1.9, 0]; this.pose[1] = [0.8, -0.55, -1.9, 0];
        this.lean = -0.08;
        c.guard = ph === 'active' || ph === 'windup' ? 'front' : 'none';
        // a blow clanged off the shield: snap back with a red counter-pinch
        if (ph === 'active' && w.time - c.lastBlocked < 0.06) { c.guard = 'none'; c.start(M.counter); callout(w, 'COUNTER', this.x, this.y + 2, 'danger', 0.45); }
        if (ph === 'recover') c.guard = 'none';
        break;
      }
      case 'sweep': {
        if (ph === 'windup') { this.pose[0] = [-0.35, 0.9 * Math.min(1, k * 1.5), -0.4, 1]; this.lean = -0.15; this.yaw = 0.5 * k; this.bob = -0.25 * k; }
        else if (ph === 'active') {
          this.pose[0] = [-0.45, -0.9, -0.1, 0.3]; this.yaw = 0.5 - 1.3 * k; this.lean = 0.1; this.bob = -0.25;
          if (c.justEntered('active')) { w.sfx('swish_c', this.x, 1, 0.5); w.fx.silt(this.x + f * 2, this.arena.floor + 0.1, 12); }
          if (!c.landed && Math.abs(p.x - (this.x + f * 1.6)) < 2.0 && p.y < this.arena.floor + 1.5) c.strike(w, { x: this.x + f * 1.6, y: this.arena.floor + 0.4, knock: 7 });
        } else { this.pose[0] = [0.1, 0.2, -0.5, 0.2]; this.yaw = -0.8 * (1 - k); this.bob = -0.25 * (1 - k); }
        this.pose[1] = [0.15, -0.3, -0.6, 0.2];
        break;
      }
      case 'charge': {
        this.pose[0] = [0.6, 0.6, -1.6, 0.6]; this.pose[1] = [0.6, -0.6, -1.6, 0.6];
        if (ph === 'windup') { this.lean = -0.15; if (Math.random() < dt * 20) w.fx.silt(this.x - this.chargeDir * 1, this.arena.floor + 0.1, 2); this.x += Math.sin(c.t * 60) * 0.01; }
        else if (ph === 'active') {
          if (this.stuck > 0) break;
          this.vx = this.chargeDir * (this.enraged ? 11 : 9);
          this.x += this.vx * dt; this.walkPh += dt * 30;
          if (Math.random() < dt * 25) w.fx.silt(this.x - this.chargeDir, this.arena.floor + 0.1, 2);
          const r = this.hitCircle(w, this.x + this.chargeDir * 0.9, this.y, 1.3, { knock: 9 });
          if (r === 'parried' || r === 'blocked') { this.vx = 0; c.cancel(); }
          // the wall: stunned
          if (this.x < this.arena.x0 + 1.4 || this.x > this.arena.x1 - 1.4) {
            this.x = clamp(this.x, this.arena.x0 + 1.4, this.arena.x1 - 1.4);
            this.stuck = 1; this.vx = 0;
            w.game.addShake(0.45); w.sfx('rock_hit', this.x, 1, 0.5); w.sfx('thud_heavy', this.x, 1, 0.6);
            w.fx.debrisBurst(this.x + this.chargeDir * 1.3, this.y + 0.5, 14, '#7a7268', 4);
            callout(w, 'STUNNED', this.x, this.y + 2, 'gold', 0.5);
            this.core.stagger(w, 2.2, 'broken');
          }
        }
        break;
      }
      case 'slam': {
        if (ph === 'windup') { this.pose[0] = [1.6 * Math.min(1, k * 1.2), 0.3, -0.9, 1]; this.pose[1] = [1.6 * Math.min(1, k * 1.2), -0.3, -0.9, 1]; this.lean = -0.2 * k; this.bob = 0.3 * k; }
        else if (ph === 'active') {
          this.pose[0] = [-0.6, 0.2, -0.1, 0]; this.pose[1] = [-0.6, -0.2, -0.1, 0]; this.lean = 0.2; this.bob = -0.15;
          if (c.justEntered('active')) {
            w.game.addShake(0.5); w.game.freeze(0.06); w.sfx('boom_uw', this.x, 0.9, 0.7); w.sfx('thud_heavy', this.x, 1, 0.5);
            const fl = this.arena.floor;
            w.fx.silt(this.x + f * 1.5, fl + 0.1, 24);
            for (const dir of [1, -1]) w.add(new Shockwave(this.x + f * 1.5, fl + 0.05, dir, this, m.dmg * c.dmgMul, this.arena));
          }
          this.hitCircle(w, this.x + f * 1.6, this.arena.floor + 0.5, 1.3);
        } else { this.pose[0] = [-0.5 + k * 0.7, 0.2, -0.3, 0.2]; this.pose[1] = [-0.5 + k * 0.7, -0.2, -0.3, 0.2]; this.lean = 0.2 * (1 - k); this.bob = -0.15 * (1 - k); }
        break;
      }
    }
    if (ph !== 'windup' && ph !== 'active' && m.id !== 'guard') c.guard = 'none';
  }

  protected staggerPose(dt: number, _w: World) {
    const t = this.core.t;
    this.pose[0] = [-0.3, 0.4, -0.2, 0.6]; this.pose[1] = [-0.3, -0.4, -0.2, 0.6];
    this.lean = -0.15 + Math.sin(t * 14) * 0.04; this.bob = -0.2; this.yaw = 0;
    this.core.guard = 'none';
    void dt;
  }
  protected idlePose(_dt: number, _w: World) { this.pose[0] = [0.1, 0.3, -0.4, 0.1]; this.pose[1] = [0.1, -0.3, -0.4, 0.1]; this.bob = -0.15 + Math.sin(this.st) * 0.03; }
  protected introPose(_dt: number, w: World, k: number) {
    // rises, raises both claws and clacks them; the eyes swivel to the player
    this.bob = -0.15 + Math.min(1, k * 3) * 0.3;
    const up = k > 0.3 ? 1 : k / 0.3;
    const clack = Math.max(0, Math.sin(this.st * 14)) * (k > 0.4 ? 1 : 0);
    this.pose[0] = [1.3 * up, 0.5, -1.3, clack]; this.pose[1] = [1.2 * up, -0.5, -1.3, 1 - clack];
    if (k > 0.4 && Math.random() < 0.12) w.sfx('crab_snip', this.x, 0.6, 0.6);
    this.facing = w.player.x >= this.x ? 1 : -1;
  }
  protected transitionPose(_dt: number, w: World, k: number) {
    this.pose[0] = [1.5, 0.6, -0.6, 1]; this.pose[1] = [1.5, -0.6, -0.6, 1]; this.lean = -0.25; this.bob = 0.2 + Math.sin(k * 30) * 0.03;
    if (Math.random() < 0.3) w.fx.emit('bubble', this.x + (Math.random() - 0.5) * 2, this.y + 1, { n: 2, speed: 2 });
  }
  protected dyingPose(_dt: number, _w: World, k: number) {
    this.pose[0] = [-0.6 * k, 0.6, 0.2, 1]; this.pose[1] = [-0.6 * k, -0.6, 0.2, 1];
    this.lean = -0.4 * k; this.bob = -0.6 * k; this.yaw = Math.sin(this.st * 9) * 0.05 * (1 - k);
  }
  protected onPhase(w: World, n: number) {
    if (n === 3) { this.enraged = true; this.core.speed = 1.22; this.core.dmgMul = 1.25; for (const e of this.eyeBalls) e.material = new THREE.MeshStandardMaterial({ color: '#ff2a10', emissive: '#ff2a10', emissiveIntensity: 1.5, flatShading: true }); }
    void w;
  }
  protected onHurt(w: World) { w.sfx('clank', this.x, 0.5, 0.7 + Math.random() * 0.2); }
  get armoured() { return true; }

  protected place(dt: number, w: World) {
    const a = this.arena;
    const walking = Math.abs(this.vx) > 0.2;
    if (walking) this.walkPh += dt * (4 + Math.abs(this.vx) * 2.5);
    this.y = a.floor + 1.95 + this.bob + (walking ? Math.abs(Math.sin(this.walkPh)) * 0.06 : 0);
    // smooth the arms toward their pose
    for (let i = 0; i < 2; i++) {
      const P = this.pose[i], C = this.cur[i], arm = this.arms[i];
      const rate = this.core.phase === 'active' ? 30 : 12;
      for (let j = 0; j < 4; j++) C[j] = damp(C[j], P[j], rate, dt);
      arm.shoulder.rotation.set(0, C[1], C[0]);
      arm.elbow.rotation.set(0, 0, -C[2] * 0.85);
      arm.claw.rotation.set(0, 0, C[2] * 0.45 - C[0] * 0.25);
      arm.finger.rotation.set(0, 0, C[3] * 0.6);
    }
    for (const L of this.legs) {
      const s = walking || this.core.is('charge') ? Math.sin(this.walkPh + L.ph) : 0;
      L.hip.rotation.set(L.side * (0.55 + s * 0.15), 0, s * 0.35);
      L.knee.rotation.set(L.side * (-1.1 - Math.max(0, s) * 0.3), 0, 0);
    }
    for (const e of this.eyes) e.rotation.set(0, 0, Math.sin(this.st * 1.3) * 0.1 + (this.core.phase === 'stagger' ? Math.sin(this.st * 20) * 0.3 : 0));
    // flash on hits; the enrage glows
    const fl = this.flash * 0.6 + (this.core.phase === 'windup' && this.core.move?.unblockable ? (Math.floor(this.core.t * 10) % 2 ? 0.35 : 0) : 0);
    for (const m of this.shellMats) m.emissive.setRGB(fl * (this.core.move?.unblockable ? 1 : 1), fl * (this.core.move?.unblockable && this.core.phase === 'windup' ? 0.1 : 1), fl * (this.core.move?.unblockable && this.core.phase === 'windup' ? 0.05 : 1));
    this.root.scale.set(this.facing * 1.35, 1.35, 1.35);
    this.root.rotation.set(0, -0.45 * this.facing + this.yaw * this.facing, -this.lean * this.facing);
    this.obj.position.set(this.x, this.y, -0.4);
    void w;
  }
}
