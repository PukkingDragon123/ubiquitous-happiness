// The mail buoy and the mailman manatee. A red-and-white navigation buoy with a little blue post box and a
// brass bell bobs at the surface, chained to a concrete sinker. Every so often (or when the bell is rung:
// ring(), or whack the buoy with the sword) a big, gentle, wrinkly manatee in a postman's cap swims in with
// her mailbag, waits under the buoy (coming up for air now and then, waving at the blobfish), takes whatever
// loot you deposit() and swims off with it: world.emit('extract', { items, counts }).
//
// The manatee is PS1-style: rigid low-poly segments (head + chest, belly, tail paddle, flippers) on pivots,
// painted with a realistic grey-brown hide: wrinkles, algae, old propeller scars, a bristly muzzle.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { ItemInst } from '../game/run';
import type { AreaDef } from './defs';
import type { Scenery } from './scenery';
import { Soup, V3, UVR, mat4 } from '../world/lp';
import { ramp, hex, mix, pxNoise, RGB } from '../gfx/px';
import { hash2, damp, clamp, dampAngle } from '../core/math';
import { ITEMS } from '../game/items';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ art
function paintRegions(scen: Scenery) {
  const A = scen.props.A;
  const skin = A.paint('manateeSkin', 64, 48, (p, w, h) => {
    const R = ramp(['#24221e', '#46423a', '#6a6458', '#8c857a', '#ada698'], 4, 0);
    p.fill((x, y) => {
      const v = y / h;                                   // 0 = back (top of the texture) .. 1 = belly
      const n = pxNoise(x, y, 10, 3, 3, 64);
      let t = 0.42 + v * 0.28 + (n - 0.5) * 0.3;
      // wrinkle creases around the body
      const cr = Math.sin(x * 0.55 + pxNoise(x, y, 6, 2, 5) * 4);
      if (cr > 0.86) t -= 0.18; else if (cr > 0.7) t += 0.05;
      let c: RGB = R(t, x, y);
      // algae on the back
      const al = pxNoise(x, y, 7, 3, 9, 64);
      if (v < 0.4 && al > 0.62) c = mix(c, hex(al > 0.7 ? '#5e6a34' : '#4a5a2a'), 0.55);
      // old propeller scars: pale parallel slashes across the back
      for (let k = 0; k < 3; k++) { const d = Math.abs((x - 20 - k * 4) - (y - 4) * 0.6); if (d < 0.7 && y > 2 && y < 16 && x > 10 && x < 46) c = mix(c, hex('#c8c0b4'), 0.7); }
      return c;
    });
  });
  const muzzle = A.paint('manateeMuzzle', 16, 16, (p, w, h) => {
    const R = ramp(['#3a3630', '#5e584e', '#827a6e', '#a29a8c'], 4, 0);
    p.fill((x, y) => R(0.5 + (pxNoise(x, y, 4, 2, 7) - 0.5) * 0.4 + (y / h) * 0.15, x, y));
    for (let i = 0; i < 26; i++) p.set(hash2(i, 1, 3) * w, 4 + hash2(i, 2, 3) * (h - 6), '#1a1814'); // bristles
  });
  const cap = A.paint('postCap', 16, 16, (p, w, h) => {
    const R = ramp(['#080c1a', '#121c38', '#1e2e58', '#30467a'], 4, 0);
    p.fill((x, y) => R(0.5 + (pxNoise(x, y, 4, 2, 11) - 0.5) * 0.3 + (y < 3 ? 0.2 : 0), x, y));
    for (let x = 0; x < w; x++) { p.set(x, h - 4, '#8a1a1a'); p.set(x, h - 3, '#a82a22'); } // red band
  });
  const visor = A.paint('postVisor', 8, 8, (p) => p.fill((x, y) => (x + y < 4 ? [70, 70, 80] : [16, 16, 20])));
  const badge = A.paint('postBadge', 8, 8, (p) => p.fill((x, y) => { const e = x === 0 || y === 0 || x === 7 || y === 7; const env = y >= 2 && y <= 5 && x >= 1 && x <= 6; return e ? [120, 80, 20] : env ? (y - 2 === Math.floor(Math.abs(x - 3.5)) ? [90, 60, 16] : [250, 240, 200]) : [230, 180, 60]; }));
  const leather = A.paint('mailLeather', 32, 32, (p, w, h) => {
    const R = ramp(['#1e1008', '#3e2414', '#62401e', '#8a5e30', '#a87a44'], 4, 0);
    p.fill((x, y) => {
      let t = 0.5 + (pxNoise(x, y, 6, 3, 13) - 0.5) * 0.35;
      if (x === 2 || x === w - 3 || y === 2 || y === h - 3) t -= 0.2; // stitching line
      if ((x === 2 || x === w - 3 || y === 2 || y === h - 3) && (x + y) % 3 === 0) t += 0.35;
      return R(t, x, y);
    });
  });
  const env = A.paint('envelope', 16, 12, (p, w, h) => p.fill((x, y) => {
    const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (border) return ((x + y) >> 1) % 2 ? [200, 40, 40] : [40, 70, 180];
    if (y === 3 && x > 3 && x < 12) return [120, 120, 130];
    if (y === 5 && x > 3 && x < 10) return [120, 120, 130];
    return x > 11 && y < 5 ? [210, 120, 60] : [240, 236, 222];
  }));
  const eye = A.paint('manateeEye', 4, 4, (p) => p.fill((x, y) => (x === 1 && y === 1 ? [220, 230, 240] : [12, 10, 10])));
  return { skin, muzzle, cap, visor, badge, leather, env, eye };
}

/** ring of a fat body section along x: n points around, rx (z) / ry (y), squareness */
function ring(x: number, cy: number, ry: number, rz: number, n: number, sq = 2, flatBelly = 0): V3[] {
  const out: V3[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const e = 2 / sq;
    let y = Math.sign(c) * Math.pow(Math.abs(c), e) * ry, z = Math.sign(s) * Math.pow(Math.abs(s), e) * rz;
    if (y < 0) y *= 1 - flatBelly;
    out.push([x, cy + y, z]);
  }
  return out;
}

/** loft along x (rings counter-clockwise looking from +x) with a cap at either end */
function bodyLoft(s: Soup, rings: V3[][], r: UVR, capFront?: V3, capBack?: V3) {
  // loft() expects rings around +y; ours run along x: build the quads by hand
  const n = rings[0].length;
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const a = rings[j][k], b = rings[j][k2], c = rings[j + 1][k2], d = rings[j + 1][k];
    const u = (q: number) => r.u0 + (r.u1 - r.u0) * (j + q) / (rings.length - 1);
    const v = (kk: number) => r.v1 - (r.v1 - r.v0) * Math.abs(((kk / n) * 2) % 2 - 1); // mirror around: back at the top
    const sh = 0.82 + 0.18 * Math.cos((k / n) * TAU);
    s.tri(a, c, b, [u(0), v(k)], [u(1), v(k2 || n)], [u(0), v(k2 || n)], sh, sh, sh);
    s.tri(a, d, c, [u(0), v(k)], [u(1), v(k)], [u(1), v(k2 || n)], sh, sh, sh);
  }
  if (capFront) { const R = rings[rings.length - 1]; for (let k = 0; k < n; k++) s.tri(R[k], R[(k + 1) % n], capFront, [r.u1, r.v0], [r.u1, r.v1], [r.u1, (r.v0 + r.v1) / 2], 0.9, 0.9, 1); }
  if (capBack) { const R = rings[0]; for (let k = 0; k < n; k++) s.tri(R[(k + 1) % n], R[k], capBack, [r.u0, r.v0], [r.u0, r.v1], [r.u0, (r.v0 + r.v1) / 2], 0.8, 0.8, 0.8); }
}

interface ManateeParts { front: Soup; rear: Soup; tail: Soup; flipper: Soup; cap: Soup; bag: Soup; flap: Soup; eyes: Soup }

function buildManatee(scen: Scenery): ManateeParts {
  const R = paintRegions(scen);
  const P: ManateeParts = { front: new Soup(), rear: new Soup(), tail: new Soup(), flipper: new Soup(), cap: new Soup(), bag: new Soup(), flap: new Soup(), eyes: new Soup() };
  const N = 9;
  // front: chest -> head -> muzzle (pivot at x = 0)
  const fr = [ring(0, 0, 0.56, 0.6, N, 2.2, 0.15), ring(0.45, 0.02, 0.54, 0.56, N, 2.2, 0.12), ring(0.85, 0.05, 0.42, 0.44, N, 2.3), ring(1.12, 0.06, 0.3, 0.31, N, 2.4), ring(1.32, 0.02, 0.24, 0.26, N, 3)];
  bodyLoft(P.front, fr, R.skin);
  // the muzzle: a squarish, bristly block with a cleft upper lip
  const mz = [ring(1.32, 0.02, 0.24, 0.26, N, 3), ring(1.46, -0.01, 0.22, 0.25, N, 3.4), ring(1.53, -0.03, 0.17, 0.22, N, 3.4)];
  bodyLoft(P.front, mz, R.muzzle, [1.56, -0.02, 0]);
  // nostrils
  for (const z of [-0.07, 0.07]) P.front.box([1.46, 0.17, z - 0.03], [0.06, 0.02, 0.05], R.eye);
  // eyes (tiny, a glint)
  for (const z of [-0.29, 0.29]) { const from = P.eyes.count; P.eyes.lathe([[0.04, -0.035], [0.045, 0], [0, 0.035]], 5, R.eye); P.eyes.transformSince(from, mat4(1.08, 0.13, z, 1, 1, 1, 0, 0, Math.PI / 2)); }
  // rear: belly -> tail stock (pivot at x = 0, extends to -x)
  const rr = [ring(-1.15, 0.03, 0.22, 0.26, N, 2.2), ring(-0.8, 0.0, 0.42, 0.46, N, 2.2, 0.1), ring(-0.4, -0.01, 0.54, 0.58, N, 2.2, 0.15), ring(0.02, 0, 0.56, 0.6, N, 2.2, 0.15)];
  bodyLoft(P.rear, rr, R.skin);
  // tail paddle: a big rounded spatula (pivot at its root)
  const tailPts: V3[] = [];
  const TN = 12;
  for (let i = 0; i <= TN; i++) { const a = -Math.PI / 2 + (i / TN) * Math.PI; tailPts.push([-0.15 - Math.cos(a) * 0.62, 0, Math.sin(a) * 0.5]); }
  const tc: V3 = [-0.35, 0.05, 0], tb: V3 = [-0.35, -0.05, 0];
  const uvAt = (q: V3): [number, number] => [R.skin.u0 + (R.skin.u1 - R.skin.u0) * (0.5 - q[0] * 0.5), R.skin.v0 + (R.skin.v1 - R.skin.v0) * (0.5 + q[2])];
  for (let i = 0; i < TN; i++) {
    const a = tailPts[i], b = tailPts[i + 1];
    P.tail.tri(tc, b, a, uvAt(tc), uvAt(b), uvAt(a), 1, 0.95, 0.95);
    P.tail.tri(tb, a, b, uvAt(tb), uvAt(a), uvAt(b), 0.7, 0.7, 0.7);
  }
  const root = [ring(0.05, 0, 0.2, 0.24, 6), ring(-0.2, 0, 0.06, 0.4, 6)];
  bodyLoft(P.tail, root, R.skin);
  // flipper: a paddle with three nails (pivot at the shoulder)
  const fl: V3[] = [[0, 0, 0], [-0.08, -0.22, 0.04], [0.02, -0.46, 0.06], [0.16, -0.5, 0.05], [0.2, -0.3, 0.02], [0.12, -0.05, 0]];
  const fc: V3 = [0.07, -0.25, 0.07];
  for (let i = 0; i < fl.length; i++) {
    const a = fl[i], b = fl[(i + 1) % fl.length];
    P.flipper.tri(a, b, fc, [R.skin.u0, R.skin.v0], [R.skin.u1, R.skin.v0], [R.skin.u1, R.skin.v1], 0.9, 0.9, 1);
    const ab: V3 = [a[0], a[1], -0.03], bb: V3 = [b[0], b[1], -0.03];
    P.flipper.tri(b, a, ab, [R.skin.u0, R.skin.v0], [R.skin.u1, R.skin.v0], [R.skin.u1, R.skin.v1], 0.7, 0.7, 0.7);
    P.flipper.tri(b, ab, bb, [R.skin.u0, R.skin.v0], [R.skin.u1, R.skin.v1], [R.skin.u0, R.skin.v1], 0.7, 0.7, 0.7);
  }
  for (let i = 0; i < 3; i++) P.flipper.box([0.02 + i * 0.055, -0.5, 0.04], [0.035, 0.03, 0.03], R.visor);
  // the postman's cap: a navy kepi with a red band, black visor and a brass envelope badge
  P.cap.lathe([[0.2, 0], [0.21, 0.1], [0.24, 0.17], [0.23, 0.2], [0, 0.21]], 8, R.cap);
  const vz = 0.24;
  const vis: V3[] = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI; vis.push([Math.cos(a) * 0.3, 0.015 - Math.cos(a) * 0.02, Math.sin(a) * vz]); }
  for (let i = 0; i < 6; i++) P.cap.tri([0.05, 0.02, 0], vis[i + 1], vis[i], [R.visor.u0, R.visor.v0], [R.visor.u1, R.visor.v1], [R.visor.u1, R.visor.v0], 1, 0.9, 0.9);
  for (let i = 0; i < 6; i++) P.cap.tri([0.05, 0.0, 0], vis[i], vis[i + 1], [R.visor.u0, R.visor.v0], [R.visor.u1, R.visor.v1], [R.visor.u1, R.visor.v0], 0.6, 0.6, 0.6);
  P.cap.glow(0.15).quad([0.215, 0.07, -0.05], [0.215, 0.07, 0.05], [0.22, 0.15, 0.05], [0.22, 0.15, -0.05], R.badge);
  P.cap.glow(0);
  // the mailbag: a leather satchel with a strap and envelopes peeking out (hangs on the +z flank)
  P.bag.box([-0.25, -0.2, 0], [0.5, 0.38, 0.16], R.leather);
  P.bag.box([-0.03, 0.02, 0.165], [0.06, 0.08, 0.02], scen.props.get('brass'));
  for (let i = 0; i < 3; i++) { const x = -0.18 + i * 0.13; P.bag.quad([x, 0.12, 0.06 + i * 0.02], [x + 0.16, 0.12, 0.06 + i * 0.02], [x + 0.16 + 0.02 * i, 0.28, 0.06 + i * 0.02], [x + 0.02 * i, 0.28, 0.06 + i * 0.02], R.env); }
  // strap: a loop over the back
  const strap: V3[] = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; strap.push([0.1, Math.sin(a) * 0.62 - 0.02, Math.cos(a) * 0.64]); }
  P.bag.tube(strap.map((q) => [q[0] - 0.0, q[1], q[2] - 0.64 * 0] as V3).map((q) => [q[0], q[1] - 0.0, q[2]] as V3), () => 0.025, 3, R.leather);
  P.flap.box([-0.26, -0.02, 0.0], [0.52, 0.04, 0.2], R.leather);
  return P;
}

// ------------------------------------------------------------------ the manatee
type MState = 'away' | 'arriving' | 'waiting' | 'leaving';

export class Manatee {
  root = new THREE.Group();
  private yawG = new THREE.Group();
  private front = new THREE.Group();
  private rear = new THREE.Group();
  private tail = new THREE.Group();
  private flipL = new THREE.Group();
  private flipR = new THREE.Group();
  private cap = new THREE.Group();
  private flap = new THREE.Group();
  x = 0; y = -3; z = -1.1; vx = 0; vy = 0;
  state: MState = 'away';
  private t = 0;
  private phase = 0;
  private yaw = 0;
  private roll = 0; private rollT = 0;
  private wave = 0;
  private breathe = 0;
  private flapOpen = 0;
  private happy = 0;
  private meshes: THREE.Mesh[] = [];

  constructor(scen: Scenery) {
    const P = buildManatee(scen);
    const mat = scen.mats.prop;
    const mk = (s: Soup, parent: THREE.Object3D) => { const m = new THREE.Mesh(s.geometry(), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); this.meshes.push(m); return m; };
    mk(P.front, this.front); mk(P.eyes, this.front);
    mk(P.rear, this.rear);
    mk(P.tail, this.tail);
    this.tail.position.set(-1.12, 0.03, 0);
    this.rear.add(this.tail);
    mk(P.flipper, this.flipL); mk(P.flipper, this.flipR);
    this.flipR.position.set(0.55, -0.3, 0.5); this.flipL.position.set(0.55, -0.3, -0.5); this.flipL.scale.z = -1;
    this.front.add(this.flipL, this.flipR);
    mk(P.cap, this.cap);
    this.cap.position.set(0.82, 0.42, 0); this.cap.rotation.set(0.12, 0, -0.18);
    this.front.add(this.cap);
    const bag = new THREE.Group(); mk(P.bag, bag);
    mk(P.flap, this.flap); this.flap.position.set(0, 0.18, 0.0); bag.add(this.flap);
    bag.position.set(0.15, -0.12, 0.5); bag.rotation.set(0.15, 0, 0.1);
    this.front.add(bag);
    this.yawG.add(this.front, this.rear);
    this.yawG.scale.setScalar(0.9);
    this.root.add(this.yawG);
    this.root.visible = false;
  }

  /** swim toward (tx, ty) */
  private swim(dt: number, tx: number, ty: number, speed: number) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1e-6;
    const s = speed * Math.min(1, d / 2.5);
    this.vx = damp(this.vx, (dx / d) * s, 1.2, dt);
    this.vy = damp(this.vy, (dy / d) * s, 1.2, dt);
    return d;
  }

  update(dt: number, w: World, buoyX: number, buoyY: number) {
    this.t += dt;
    if (this.state === 'away') { this.root.visible = false; return; }
    this.root.visible = true;
    const p = w.player;
    const waitX = buoyX - 1.6, waitY = Math.min(-2.4, buoyY - 2.6);
    if (this.state === 'arriving') { if (this.swim(dt, waitX, waitY, 2.2) < 0.4) this.state = 'waiting'; }
    else if (this.state === 'waiting') {
      // hang under the buoy; come up for air every so often; turn to face the blobfish
      this.breathe -= dt;
      const ty = this.breathe < 0 && this.breathe > -3 ? -0.75 : waitY;
      if (this.breathe < -3) this.breathe = 9 + Math.random() * 6;
      if (this.breathe < 0 && this.breathe > -0.1) { w.fx.splash(this.x + 1.3, 0.6); w.sfx('splash_s', this.x, 0.4); }
      this.swim(dt, waitX + Math.sin(this.t * 0.3) * 0.6, ty + Math.sin(this.t * 0.7) * 0.15, 0.9);
      const near = Math.hypot(p.x - this.x, p.y - this.y) < 4.5;
      if (near && this.wave <= 0 && Math.random() < dt * 0.5) this.wave = 2;
    } else if (this.state === 'leaving') {
      const out = this.leaveDir * 60 + buoyX;
      this.swim(dt, out, -6 + Math.sin(this.t) * 0.5, 2.6);
      if (Math.abs(this.x - out) < 3 || Math.abs(this.x - buoyX) > 45) this.state = 'away';
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.y = Math.min(this.y, -0.55);
    const fl = w.terrain.floorAt(this.x) + 0.9;
    if (this.y < fl) { this.y = fl; this.vy = Math.max(0, this.vy); }
    // facing: turn slowly, through the camera
    const sp = Math.hypot(this.vx, this.vy);
    let face = this.vx;
    if (this.state === 'waiting' && sp < 0.6) face = p.x - this.x;
    const tgt = face >= 0 ? 0 : Math.PI;
    if (Math.abs(face) > 0.05) this.yaw = dampAngle(this.yaw, tgt, 1.6, dt);
    // swim cycle: the tail paddle beats up and down, the body follows; flippers scull
    const beat = 0.5 + Math.min(1.4, sp * 0.6);
    this.phase += dt * beat * 2.2;
    const amp = 0.12 + Math.min(0.25, sp * 0.1);
    this.rear.rotation.z = Math.sin(this.phase) * amp * 0.45;
    this.tail.rotation.z = Math.sin(this.phase - 0.9) * amp * 1.6;
    this.front.rotation.z = Math.sin(this.phase + 0.6) * amp * 0.12 + clamp(this.vy * 0.15, -0.25, 0.3) + (this.breathe < 0 && this.breathe > -3 ? 0.35 : 0);
    // flippers: slow sculling; one waves hello
    this.wave = Math.max(0, this.wave - dt);
    this.flipL.rotation.set(0.3 + Math.sin(this.phase * 0.5) * 0.25, 0, Math.sin(this.phase * 0.5 + 1) * 0.4);
    if (this.wave > 0) this.flipR.rotation.set(-0.9 - Math.sin(this.t * 9) * 0.4, 0, -1.1);
    else this.flipR.rotation.set(-0.3 - Math.sin(this.phase * 0.5) * 0.25, 0, Math.sin(this.phase * 0.5) * 0.4);
    // happy barrel roll after a delivery
    this.happy = Math.max(0, this.happy - dt);
    this.rollT = this.happy > 0 ? Math.min(1, this.rollT + dt / 1.8) : 0;
    this.roll = this.happy > 0 ? this.rollT * TAU : damp(this.roll, 0, 3, dt);
    this.flapOpen = damp(this.flapOpen, this.happy > 0.8 ? 1 : 0, 6, dt);
    this.flap.rotation.x = -this.flapOpen * 1.2;
    this.cap.rotation.z = -0.18 + Math.sin(this.t * 1.3) * 0.05;
    this.yawG.rotation.set(this.roll, this.yaw, 0);
    this.root.position.set(this.x, this.y + Math.sin(this.t * 0.9) * 0.05, this.z);
  }
  private leaveDir = 1;

  arrive(fromX: number, buoyX: number) {
    this.state = 'arriving';
    this.x = fromX; this.y = -5; this.vx = Math.sign(buoyX - fromX) * 2; this.vy = 0;
    this.yaw = this.vx > 0 ? 0 : Math.PI;
    this.leaveDir = Math.sign(fromX - buoyX) || 1;
    this.breathe = 6;
  }
  leave() { if (this.state !== 'away') this.state = 'leaving'; }
  celebrate() { this.happy = 2.2; this.rollT = 0; }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); }
}

// ------------------------------------------------------------------ the buoy
export class MailBuoy implements Entity {
  kind = 'mailbuoy'; team: Team = 'friend';
  x: number; y = 0; vx = 0; vy = 0; r = 0.8; alive = true;
  obj = new THREE.Group();
  manatee: Manatee;
  /** seconds between visits */
  interval = 70;
  /** how long she waits at the buoy */
  window = 32;
  /** seconds until the next arrival (while away) */
  eta: number;
  /** seconds left at the buoy (while waiting) */
  waitLeft = 0;
  private float = new THREE.Group();
  private bell = new THREE.Group();
  private chain: THREE.Mesh;
  private bellT = 0;
  private t = 0;
  private floorY: number;
  private world: World;
  private deliveries = 0;

  constructor(public a: AreaDef, public scen: Scenery, x: number, w: World) {
    this.x = x; this.world = w;
    this.floorY = scen.sand.restAt(x);
    this.eta = 12;
    const P = scen.props;
    const s = new Soup();
    // float: a red can with a white band, flat deck on top
    s.lathe([[0.42, -0.9], [0.55, -0.6], [0.55, 0.15], [0.5, 0.25]], 8, P.get('buoyRed'));
    const fb = s.count; s.lathe([[0.555, -0.25], [0.555, -0.02]], 8, P.get('buoyWhite')); void fb;
    s.lathe([[0.5, 0.25], [0.48, 0.27], [0, 0.28]], 8, P.get('buoyWhite'));
    // the tower: four legs + a ring
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; s.tube([[Math.cos(a) * 0.38, 0.25, Math.sin(a) * 0.38], [Math.cos(a) * 0.14, 1.5, Math.sin(a) * 0.14]], () => 0.03, 3, P.get('iron')); }
    // the blue post box on the deck
    s.box([-0.22, 0.28, -0.18], [0.44, 0.5, 0.36], P.get('postBlue'));
    s.box([-0.24, 0.78, -0.2], [0.48, 0.06, 0.4], P.get('postBlue'));
    s.box([-0.12, 0.62, 0.181], [0.24, 0.04, 0.01], P.get('black'));       // the slot
    s.box([0.24, 0.5, -0.02], [0.02, 0.32, 0.04], P.get('iron'));           // the little flag post
    s.box([0.26, 0.72, -0.01], [0.16, 0.1, 0.02], P.get('buoyRed'));        // the flag
    // radar reflector / topmark
    s.lathe([[0.16, 1.5], [0, 1.75]], 4, P.get('buoyRed'));
    const g = new THREE.Mesh(s.geometry(), scen.mats.prop);
    g.castShadow = true;
    this.float.add(g);
    // the bell swings inside the tower
    const b = new Soup();
    b.lathe([[0.14, -0.2], [0.12, -0.12], [0.08, 0.0], [0.03, 0.04], [0, 0.05]], 7, P.get('brass'));
    b.tube([[0, -0.2, 0], [0, -0.28, 0]], () => 0.02, 3, P.get('iron'));
    const bm = new THREE.Mesh(b.geometry(), scen.mats.prop);
    this.bell.add(bm); this.bell.position.set(0, 1.35, 0);
    this.float.add(this.bell);
    this.obj.add(this.float);
    // chain to the sinker (rebuilt as the buoy bobs)
    this.chain = new THREE.Mesh(new THREE.BufferGeometry(), scen.mats.prop);
    this.obj.add(this.chain);
    const sk = new Soup(); sk.box([-0.4, 0, -0.4], [0.8, 0.45, 0.8], P.get('rock'));
    const sinker = new THREE.Mesh(sk.geometry(), scen.mats.prop);
    sinker.position.set(x - 1.4, this.floorY - 0.2, -0.6);
    sinker.rotation.y = 0.4;
    this.obj.add(sinker);
    this.manatee = new Manatee(scen);
    this.obj.add(this.manatee.root);
    this.float.position.set(x, 0, -0.6);
  }

  /** the manatee is at the buoy and will take loot */
  get present() { return this.manatee.state === 'waiting'; }
  /** close enough to hand over loot */
  canDeposit(px: number, py: number) { return this.present && Math.hypot(px - this.manatee.x, py - this.manatee.y) < 3.5; }

  /** ring the bell: calls the manatee early */
  ring() {
    this.bellT = 2.5;
    this.world.sfx('bell', this.x, 0.8);
    if (this.manatee.state === 'away') this.eta = Math.min(this.eta, 4);
    else if (this.present) this.waitLeft = Math.max(this.waitLeft, 12);
  }

  /**
   * Hand loot to the manatee. items: ids, ItemInsts or a { id: n } bag; omit to send every material item the
   * run carries (they are removed from run.items). Emits 'extract' {items: string[], counts}. Returns the ids
   * extracted (empty when she is not here).
   */
  deposit(items?: (string | ItemInst)[] | Record<string, number>): string[] {
    if (!this.present) return [];
    const w = this.world;
    let ids: string[] = [];
    if (!items) {
      const take = w.run.items.filter((it) => ITEMS[it.id]?.kind === 'material');
      ids = take.map((it) => it.id);
      w.run.items = w.run.items.filter((it) => !take.includes(it));
    } else if (Array.isArray(items)) ids = items.map((i) => (typeof i === 'string' ? i : i.id));
    else for (const [id, n] of Object.entries(items)) for (let k = 0; k < n; k++) ids.push(id);
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    w.emit('extract', { items: ids, counts, x: this.manatee.x, y: this.manatee.y });
    const m = this.manatee;
    m.celebrate();
    this.deliveries++;
    w.fx.burst('heart', m.x + 0.8, m.y + 0.6, 6 + Math.min(10, ids.length), 1.5, { vy: 1.2, life: 1.6 });
    w.fx.burst('bubble', m.x, m.y, 10, 1.5);
    w.sfx('cute1', m.x, 0.8); w.sfx('jin_catch1', m.x, 0.6);
    w.text.pop(ids.length ? 'Special delivery!' : 'Nothing today?', m.x, m.y + 1.4, 'magic', { size: 0.32, life: 1.8 });
    // she heads home with the parcel a little after the roll
    this.waitLeft = Math.min(this.waitLeft, 3);
    return ids;
  }

  hit(_d: number, _dx: number, _dy: number, w: World, _src: Entity | null, _k?: DamageKind): boolean {
    // whacking the buoy rings the bell
    this.ring();
    w.fx.burst('spark', this.x, this.y + 1.2, 6, 2.5);
    return true;
  }

  update(dt: number, w: World) {
    this.t += dt;
    const m = this.manatee;
    // bob on the waves
    const wy = w.water.heightAt(this.x);
    this.y = wy - 0.1;
    const tilt = (w.water.heightAt(this.x + 0.5) - w.water.heightAt(this.x - 0.5)) * 0.6;
    this.float.position.set(this.x, this.y + Math.sin(this.t * 1.3) * 0.05, -0.6);
    this.float.rotation.set(Math.sin(this.t * 0.9) * 0.05, 0, -tilt + Math.sin(this.t * 1.1) * 0.04);
    this.bellT = Math.max(0, this.bellT - dt);
    this.bell.rotation.z = Math.sin(this.t * 14) * 0.5 * Math.min(1, this.bellT) + Math.sin(this.t * 1.2) * 0.05;
    this.rebuildChain();
    // the visit schedule
    if (m.state === 'away') {
      this.eta -= dt;
      if (this.eta <= 0) {
        const side = this.x > 0 ? 1 : -1;
        m.arrive(this.x + side * 34, this.x);
        this.waitLeft = this.window;
        w.sfx('honk1', this.x, 0.5);
        w.emit('manatee', { state: 'arriving', x: this.x });
      }
    } else if (m.state === 'waiting') {
      this.waitLeft -= dt;
      if (this.waitLeft <= 0) { m.leave(); this.eta = this.interval; w.emit('manatee', { state: 'leaving', x: this.x }); }
    }
    m.update(dt, w, this.x, this.y);
    if (m.state === 'waiting' && this.waitLeft > this.window - 0.05) w.emit('manatee', { state: 'waiting', x: this.x });
  }

  private chainT = 0;
  private rebuildChain() {
    this.chainT -= 1;
    if (this.chainT > 0) return;
    this.chainT = 3;
    const top: V3 = [this.x, this.y - 0.85, -0.6], bot: V3 = [this.x - 1.4, this.floorY + 0.2, -0.6];
    const path: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      path.push([top[0] + (bot[0] - top[0]) * t + Math.sin(t * Math.PI) * 0.8 + Math.sin(this.t * 0.7 + t * 3) * 0.1, top[1] + (bot[1] - top[1]) * t, -0.6]);
    }
    const s = new Soup();
    s.tube(path, () => 0.035, 3, this.scen.props.get('iron'));
    this.chain.geometry.dispose();
    this.chain.geometry = s.geometry({ sway: false, glow: false });
  }

  dispose() { this.manatee.dispose(); this.chain.geometry.dispose(); }
}
