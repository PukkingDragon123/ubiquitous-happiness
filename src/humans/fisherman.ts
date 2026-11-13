// The fisherman: a skinned, painted, expressive human with a bending rod, driven by a small procedural
// animation state machine. See index.ts for the public API.
//
//   const f = makeFisherman('oldSalt', 3);
//   seat.add(f.group);                    // stands / sits wherever the seat object is (rides the boat's bob)
//   f.setFacing(-1);                      // fish to the left of the screen
//   f.onCastRelease = () => spawnBobber(f.rodTip(v));
//   f.play('cast');                       // -> 'wait' when done
//   f.setTension(k); f.lookAt(fish.x, fish.y); f.update(dt);
import * as THREE from 'three';
import type { Archetype, Look } from './looks';
import { buildModel } from './model';
import type { Model } from './model';
import { Rod } from './rod';
import { pose, P, CH, J, STATES } from './anim';
import type { State, Ctx, JName } from './anim';
import type { ExprName } from './face';
import { twoBone, frameRot, framePos, spring, clamp01 } from './rig';
import { Loft, usFor } from '../gfx/loft';
import { Px } from '../gfx/px';
import { band, metal } from './fabric';
import { ellRing } from './rig';

export type { State } from './anim';
export interface PlayOpts { then?: State; speed?: number }
export type Seating = 'stand' | 'sit' | 'kayak';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qU = new THREE.Quaternion(), _qL = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _e = new THREE.Euler();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

export class Fisherman {
  readonly arch: Archetype;
  readonly seed: number;
  readonly look: Look;
  /** place this in the world (or add it to a boat seat) */
  readonly group = new THREE.Group();
  /** fires at the release frame of 'cast' */
  onCastRelease?: () => void;
  /** fires when a 'throw' lets go (hand position: handWorld('L', v)) */
  onThrowRelease?: () => void;
  state: State = 'idle';
  stateT = 0;

  private flip = new THREE.Group();
  private yawNode = new THREE.Group();
  private model: Model;
  private rod: Rod;
  private P = new P(); private from = new Float32Array(CH.N); private cur = new Float32Array(CH.N);
  private fade = 1; private fadeDur = 0.25;
  private ctx: Ctx;
  private opts: PlayOpts = {};
  private released = false;
  private exprOverride: ExprName | null = null;
  private tension = 0; private tensionS = 0;
  private mood = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0; private lookPitch = 0;
  private facing: 1 | -1 = -1;
  private seating: Seating = 'stand';
  private seatK = 0;
  private hatV = [0, 0];
  private hatY = 0;
  private bodyYaw = -0.78;
  private pullTarget: THREE.Vector3 | null = null;
  private item: THREE.Object3D; private net: THREE.Object3D;
  private crank = 0;
  private dims;

  constructor(arch: Archetype, seed: number) {
    this.arch = arch; this.seed = seed;
    this.model = buildModel(arch, seed);
    this.look = this.model.parts.look;
    this.dims = this.model.parts.dims;
    const L = this.look;
    this.group.name = 'fisherman:' + arch;
    this.group.add(this.flip); this.flip.add(this.yawNode); this.yawNode.add(this.model.root);
    this.rod = new Rod(L);
    this.model.root.add(this.rod.obj);
    this.item = makeCan(this.dims.s); this.model.bones.handL.add(this.item); this.item.visible = false;
    this.net = makeNet(this.dims.s); this.model.bones.handL.add(this.net); this.net.visible = false;
    const d = this.dims;
    this.ctx = {
      s: d.s, hipY: d.hipY, time: Math.random() * 10, energy: L.anim.energy, bounce: L.anim.bounce, heavy: L.anim.heavy, tension: 0,
      seated: 0, kayak: false, rodLen: this.rod.len, grip: this.rod.grip, arm: d.L.uarm + d.L.farm, hunch: L.build.hunch,
      rnd: (seed * 0.618) % 1 * 6.28, fidget: 0, fidgetT: 99,
    };
    this.setFacing(-1);
    this.evalPose(0);
    this.cur.set(this.P.a);
  }

  // ---------------------------------------------------------------- public API
  play(state: State, o: PlayOpts = {}) {
    if (!STATES.includes(state)) return;
    this.from.set(this.cur);
    this.fade = 0;
    this.fadeDur = state === 'snapFall' || state === 'surprised' || state === 'yank' ? 0.08 : state === 'cast' ? 0.18 : 0.28;
    this.state = state; this.stateT = 0; this.opts = o; this.released = false;
    this.exprOverride = null;
  }
  /** rod bend / lean back / strain, 0..1 */
  setTension(k: number) { this.tension = clamp01(k); }
  /** where the line pulls the rod tip toward (world point, usually the hook); null = straight down */
  pullToward(x: number | null, y = 0) { if (x === null) this.pullTarget = null; else (this.pullTarget ??= new THREE.Vector3()).set(x, y, 0); }
  /** look at a world point on the gameplay plane (null to stop) */
  lookAt(x: number | null, y = 0) { if (x === null) this.lookTarget = null; else (this.lookTarget ??= new THREE.Vector3()).set(x, y, 0); }
  /** -1 grumpy .. 1 cheerful: idle expressions and posture */
  setMood(k: number) { this.mood = Math.max(-1, Math.min(1, k)); }
  /** force an expression until the next play() (null = back to the state's own) */
  expression(name: ExprName | null) { this.exprOverride = name; }
  /** -1 fishes to the left of the screen, 1 to the right */
  setFacing(dir: number) {
    this.facing = dir >= 0 ? 1 : -1;
    this.flip.scale.x = this.facing === 1 ? -1 : 1;
  }
  get facingDir() { return this.facing; }
  /** stand on the spot, sit on a bench, or sit legs-out in a kayak */
  setSeating(k: Seating) { this.seating = k; this.ctx.kayak = k === 'kayak'; }
  /** world position of the (bent) rod tip: the fishing line attaches here */
  rodTip(out: THREE.Vector3): THREE.Vector3 { return this.rod.tipWorld(out); }
  /** world position of a hand */
  handWorld(side: 'L' | 'R', out: THREE.Vector3) { const b = side === 'L' ? this.model.bones.handL : this.model.bones.handR; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }
  /** world position of the head (for speech bubbles / hit tests) */
  headWorld(out: THREE.Vector3) { const b = this.model.bones.head; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }
  /** height of the model (m) */
  get height() { return this.dims.rest.head[1] + 0.23 * this.dims.hs; }
  /** Gaff's harpoon muzzle (world) or null */
  harpoonTip(out: THREE.Vector3): THREE.Vector3 | null { const t = this.model.gear.harpoonTip; if (!t) return null; t.updateWorldMatrix(true, false); return out.setFromMatrixPosition(t.matrixWorld); }
  dispose() { this.group.removeFromParent(); }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    dt = Math.min(dt, 0.05);
    const c = this.ctx;
    c.time += dt;
    this.stateT += dt * (this.opts.speed ?? 1) * (0.85 + 0.15 * this.look.anim.speed);
    this.tensionS += (this.tension - this.tensionS) * (1 - Math.exp(-dt * 8));
    c.tension = this.tensionS;
    this.seatK += ((this.seating === 'stand' ? 0 : 1) - this.seatK) * (1 - Math.exp(-dt * 6));
    c.seated = this.seatK;
    // fidgets for idle / wait
    c.fidgetT += dt;
    if (c.fidgetT > 3 + ((c.rnd * 7) % 3)) { c.fidgetT = 0; c.fidget = Math.random() < 0.45 ? 0 : 1 + Math.floor(Math.random() * 4); }
    const out = this.evalPose(this.stateT);
    // events
    if (!this.released) {
      if (this.state === 'cast' && this.stateT / out.dur >= 0.53) { this.released = true; this.onCastRelease?.(); }
      if (this.state === 'throw' && this.stateT / out.dur >= 0.52) { this.released = true; this.onThrowRelease?.(); }
    }
    if (!out.loop && out.dur > 0 && this.stateT >= out.dur) {
      const nx = this.opts.then ?? out.next;
      if (nx) this.play(nx);
    }
    // crossfade
    this.fade = Math.min(1, this.fade + dt / this.fadeDur);
    const f = this.fade * this.fade * (3 - 2 * this.fade);
    for (let i = 0; i < CH.N; i++) this.cur[i] = this.from[i] + (this.P.a[i] - this.from[i]) * f;
    this.applyPose(dt, out.face);
  }

  private evalPose(t: number) { return pose(this.state, t, this.P, this.ctx); }

  private applyPose(dt: number, face: ExprName) {
    const a = this.cur, M = this.model, B = M.bones, d = this.dims, s = d.s, c = this.ctx;
    const k = this.tensionS;
    // ---- layers on top of the state pose: tension lean, mood posture, boat-roll balance
    const leanT = this.state === 'struggle' || this.state === 'snapFall' ? 0 : k;
    const add = (n: JName, x: number, y = 0, z = 0) => { const i = J.indexOf(n) * 3; a[i] += x; a[i + 1] += y; a[i + 2] += z; };
    add('hips', -0.1 * leanT); add('spine', -0.08 * leanT); add('chest', -0.06 * leanT);
    add('shinL', 0.15 * leanT * (1 - c.seated)); add('shinR', 0.2 * leanT * (1 - c.seated)); add('thighR', -0.1 * leanT * (1 - c.seated));
    add('chest', -this.mood * 0.05); add('neck', -this.mood * 0.04);
    // keep the head level while the seat rolls with the waves
    this.group.updateWorldMatrix(true, false);
    const roll = Math.atan2(this.group.matrixWorld.elements[1], this.group.matrixWorld.elements[5]) * this.flip.scale.x;
    add('spine', 0, 0, roll * 0.3); add('neck', 0, 0, roll * 0.35);
    // look at a point: yaw / pitch distributed over neck and head
    let ly = 0, lp = 0;
    if (this.lookTarget && a[CH.LOOKW] > 0.01) {
      _v.copy(this.lookTarget);
      M.root.updateWorldMatrix(true, false);
      M.root.worldToLocal(_v);
      framePos(B.head, M.mesh, _v2);
      _v.sub(_v2);
      ly = THREE.MathUtils.clamp(Math.atan2(_v.x, _v.z), -1.15, 1.15);
      lp = THREE.MathUtils.clamp(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.5, 0.65);
    }
    const kl = 1 - Math.exp(-dt * 6);
    this.lookYaw += (ly - this.lookYaw) * kl; this.lookPitch += (lp - this.lookPitch) * kl;
    const lw = a[CH.LOOKW];
    add('neck', this.lookPitch * 0.35 * lw, this.lookYaw * 0.4 * lw); add('head', this.lookPitch * 0.45 * lw, this.lookYaw * 0.5 * lw);
    // body yaw toward the water (more side-on for big efforts)
    const wantYaw = -0.74 - (this.state === 'cast' || this.state === 'struggle' || this.state === 'yank' ? 0.12 : 0) + (this.state === 'cheer' || this.state === 'angry' || this.state === 'surprised' || this.state === 'snapFall' ? 0.42 : 0);
    this.bodyYaw += (wantYaw - this.bodyYaw) * (1 - Math.exp(-dt * 5));
    this.yawNode.rotation.y = this.bodyYaw;

    // ---- FK
    const setJ = (n: JName, bone: THREE.Bone) => { const i = J.indexOf(n) * 3; bone.quaternion.setFromEuler(_e.set(a[i], a[i + 1], a[i + 2], 'XYZ')); };
    for (const n of J) setJ(n, B[n]);
    const r = d.rest.hips;
    B.hips.position.set(r[0] + a[CH.ROOT], r[1] + a[CH.ROOT + 1], r[2] + a[CH.ROOT + 2]);
    // ground lock: keep the lower foot on the floor unless airborne / seated
    const air = clamp01(a[CH.AIR]);
    if (air < 1) {
      framePos(B.footL, M.mesh, _v); framePos(B.footR, M.mesh, _v2);
      const lo = Math.min(_v.y, _v2.y);
      B.hips.position.y += (d.L.ankle - lo) * (1 - air);
    }
    // ---- rod placement (body space): IK pose or riding the right hand
    const rod = this.rod;
    const rodW = clamp01(a[CH.RODW]);
    // the hand-held transform
    frameRot(B.handR, M.mesh, _q); framePos(B.handR, M.mesh, _v);
    const hs = s * this.look.build.handS;
    // rod in hand: rod y -> hand z, rod z -> hand y; grip point at the fist centre
    _m.makeBasis(_x.set(-1, 0, 0), _y.set(0, 0, 1), _z.set(0, 1, 0));
    _q2.setFromRotationMatrix(_m);
    const qHand = _q.clone().multiply(_q2);
    const fist = _v3.set(0.024 * hs, -0.1 * hs, 0.004 * hs).applyQuaternion(_q).add(_v);
    const pHand = fist.clone().sub(_v4.set(0, rod.grip, 0).applyQuaternion(qHand));
    // the posed transform
    const pitch = a[CH.RODPITCH], yaw = a[CH.RODYAW], rollR = a[CH.RODROLL];
    const dir = _v.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    _z.set(0, 1, 0).addScaledVector(dir, -dir.y);
    if (_z.lengthSq() < 1e-6) _z.set(0, 0, -1);
    _z.normalize().applyAxisAngle(dir, rollR);
    _x.crossVectors(dir, _z).normalize();
    _m.makeBasis(_x, dir, _z);
    const qPose = new THREE.Quaternion().setFromRotationMatrix(_m);
    const gripP = _v2.set(a[CH.RODP], a[CH.RODP + 1], a[CH.RODP + 2]);
    const pPose = gripP.clone().sub(_v4.set(0, rod.grip, 0).applyQuaternion(qPose));
    rod.obj.position.copy(pHand).lerp(pPose, rodW);
    rod.obj.quaternion.copy(qHand).slerp(qPose, rodW);
    rod.obj.updateMatrix();
    // ---- arm IK
    const arms = (side: 'L' | 'R', w: number, target: THREE.Vector3, axis: THREE.Vector3) => {
      if (w <= 0.001) return;
      const U = side === 'L' ? B.uarmL : B.uarmR, F = side === 'L' ? B.farmL : B.farmR, H = side === 'L' ? B.handL : B.handR;
      const kk = side === 'L' ? 1 : -1;
      const sh = framePos(U, M.mesh, new THREE.Vector3());
      const qChest = frameRot(B.chest, M.mesh, new THREE.Quaternion());
      // hand orientation: thumb (z) along the rod, the wrist toward the elbow
      const zH = axis.clone().normalize();
      const elbowGuess = sh.clone().add(new THREE.Vector3(kk * 0.08 * s, -d.L.uarm * 0.85, -0.06 * s));
      const yH = elbowGuess.sub(target);
      yH.addScaledVector(zH, -yH.dot(zH));
      if (yH.lengthSq() < 1e-6) yH.set(0, 1, 0);
      yH.normalize();
      const xH = new THREE.Vector3().crossVectors(yH, zH).normalize();
      const qH = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(xH, yH, zH));
      const wrist = target.clone().sub(new THREE.Vector3(-kk * 0.024 * hs, -0.1 * hs, 0.004 * hs).applyQuaternion(qH));
      const pole = new THREE.Vector3(-kk * 0.35, 0.45, 1).normalize();
      twoBone(sh, wrist, pole, d.L.uarm, d.L.farm, _qU, _qL);
      _q3.copy(qChest).invert().multiply(_qU); U.quaternion.slerp(_q3, w);
      // re-read the actual upper-arm rotation after blending for the children
      const qUa = frameRot(U, M.mesh, new THREE.Quaternion());
      _q3.copy(qUa).invert().multiply(_qL); F.quaternion.slerp(_q3, w);
      const qFa = frameRot(F, M.mesh, new THREE.Quaternion());
      _q3.copy(qFa).invert().multiply(qH); H.quaternion.slerp(_q3, w);
    };
    const qRod = rod.obj.quaternion;
    const rodDir = new THREE.Vector3(0, 1, 0).applyQuaternion(qRod);
    const rodAt = (y: number) => new THREE.Vector3(0, y, 0).applyQuaternion(qRod).add(rod.obj.position);
    arms('R', rodW, rodAt(rod.grip), rodDir);
    // off hand: fore grip or the crank knob (spinning with the reel)
    this.crank += a[CH.CRANK] * dt;
    rod.crankAngle = this.crank;
    const offW = clamp01(a[CH.OFFW]);
    if (offW > 0.001) {
      const fore = rodAt(rod.grip + (rod.spec.foreGrip ? (rod.spec.foreGrip[0] + rod.spec.foreGrip[1]) / 2 - rod.grip : 0.12));
      const knob = rod.knobLocal(new THREE.Vector3()).applyQuaternion(qRod).add(rod.obj.position);
      const tt = clamp01(a[CH.OFFT]);
      const tgt = fore.lerp(knob, tt);
      const ax = rodDir.clone().lerp(new THREE.Vector3(-1, 0, 0).applyQuaternion(qRod), tt * 0.6).normalize();
      arms('L', offW, tgt, ax);
    }
    // fingers: curl round the grip
    const curl = (side: 'L' | 'R', g: number) => {
      const kk = side === 'L' ? 1 : -1;
      const f1 = side === 'L' ? B.fing1L : B.fing1R, f2 = side === 'L' ? B.fing2L : B.fing2R, th = side === 'L' ? B.thumbL : B.thumbR;
      f1.rotation.set(0, 0, -kk * g * 1.2); f2.rotation.set(0, 0, -kk * g * 1.35); th.rotation.set(-g * 0.25, kk * g * 0.3, -kk * g * 0.95);
    };
    curl('R', clamp01(a[CH.GRIPR]) * 0.85 + 0.15); curl('L', clamp01(a[CH.GRIPL]) * 0.85 + 0.15);
    // belly jiggle on jumps / stomps
    {
      const hy = B.hips.position.y;
      const acc = (hy - this.hatY) / Math.max(dt, 1e-3);
      this.hatY = hy;
      const bj = spring(B.belly.position.y - d.off.belly[1], this.hatV, 1, -acc * 0.004 * (this.look.build.belly + 0.2), 30, dt, 0.25);
      B.belly.position.y = d.off.belly[1] + THREE.MathUtils.clamp(bj, -0.04 * s, 0.04 * s);
    }
    // hat hop / tip
    const hat = M.gear.hat;
    if (hat) {
      const want = a[CH.HAT] * 0.09 * s;
      const hy = spring(hat.position.y - M.gear.hatRest.y, this.hatV, 0, want, 18, dt, 0.45);
      hat.position.set(M.gear.hatRest.x, M.gear.hatRest.y + Math.max(0, hy), M.gear.hatRest.z - Math.max(0, hy) * 0.3);
      hat.rotation.set(-Math.max(0, hy) * 3.5, 0, Math.max(0, hy) * 2.2 * Math.sin(this.ctx.rnd * 3));
    }
    // props
    this.item.visible = a[CH.ITEM] > 0.5;
    this.net.visible = a[CH.NET] > 0.5;
    // ---- rod bend toward the line
    rod.tension = this.tensionS * (this.state === 'yank' ? 1.3 : 1);
    // the pull direction in body space (through the full inverse matrix so a mirrored fisherman stays right)
    M.root.updateWorldMatrix(true, false);
    rod.obj.updateMatrixWorld();
    rod.tipWorld(_v);
    if (this.pullTarget) _v2.copy(this.pullTarget); else _v2.copy(_v).add(_v3.set(0, -1, 0));
    M.root.worldToLocal(_v); M.root.worldToLocal(_v2);
    rod.pull.copy(_v2.sub(_v)).normalize();
    rod.update(dt);
    // ---- face
    const F = M.face;
    let ex: ExprName = this.exprOverride ?? face;
    if (!this.exprOverride && (this.state === 'idle' || this.state === 'wait')) {
      if (this.mood > 0.45) ex = 'happy'; else if (this.mood < -0.45) ex = 'angry'; else if (this.mood > 0.15 && ex === 'neutral') ex = 'smug';
    }
    F.set(ex);
    F.strain = this.state === 'reel' || this.state === 'struggle' || this.state === 'wait' || this.state === 'nibble' ? this.tensionS * 0.8 : 0;
    F.setDazed(this.state === 'snapFall' && this.stateT > 0.6 ? 1 : 0);
    // gaze: toward the look target, else toward the rod tip / water
    if (this.lookTarget) {
      this.model.mesh.updateMatrixWorld(true);
      _v.copy(this.lookTarget);
      B.head.worldToLocal(_v);
      F.gaze.copy(_v).normalize();
    } else F.gaze.set(-0.25, -0.15, 1).normalize();
    F.update(dt, this.ctx.time);
  }
}

// ------------------------------------------------------------------ props: a tin can to throw, a landing net
let canMat: THREE.Material | null = null;
function makeCan(s: number): THREE.Object3D {
  if (!canMat) {
    const p = new Px(32, 32);
    p.fill((x, y) => (y < 3 || y > 28 ? metal([200, 200, 205], x, y, 1 - Math.abs(x - 16) / 40) : band(y > 10 && y < 21 ? [240, 210, 60] : [200, 40, 40], 0.85 + Math.sin((x / 32) * Math.PI) * 0.3, x, y)));
    canMat = new THREE.MeshStandardMaterial({ map: p.texture(), roughness: 0.35, metalness: 0.4 });
  }
  const B = new Loft(false);
  const r = 0.033 * s, h = 0.12 * s;
  const rings = [0, 0.05, 0.95, 1].map((t, i) => ({ pts: ellRing(-h / 2 + t * h, 0, 0, r * (i === 0 || i === 3 ? 0.9 : 1), r * (i === 0 || i === 3 ? 0.9 : 1), r * (i === 0 || i === 3 ? 0.9 : 1), 12, 2, 1), v: t }));
  B.loft(rings, usFor(12), { x: 0, y: 0, w: 1, h: 1 }, 1, { start: [0, -h / 2, 0], end: [0, h / 2, 0] });
  const m = new THREE.Mesh(B.build(), canMat);
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m);
  m.rotation.x = Math.PI / 2;
  g.position.set(0.005 * s, -0.085 * s, 0.01 * s);
  return g;
}
let netMats: THREE.Material[] | null = null;
function makeNet(s: number): THREE.Object3D {
  if (!netMats) {
    const p = new Px(64, 64);
    p.fill((x, y) => { const a = (x + y) % 8, b = (x - y + 64) % 8; return a === 0 || b === 0 ? [220, 214, 190, 255] : null; });
    const tex = p.texture(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 2);
    netMats = [new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.8 }), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 })];
  }
  const g = new THREE.Group();
  const L = 1.25 * s, R = 0.22 * s;
  const B = new Loft(false);
  B.tube([[0, 0.06 * s, 0], [0, -L, 0]], () => 0.012 * s, 8, { x: 0, y: 0, w: 1, h: 1 }, 1, { capStart: true });
  const hoop: [number, number, number][] = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; hoop.push([Math.sin(a) * R, -L - R - Math.cos(a) * R, 0]); }
  B.tube(hoop, () => 0.008 * s, 6, { x: 0, y: 0, w: 1, h: 1 }, 2);
  const pole = new THREE.Mesh(B.build(), netMats[0]); pole.castShadow = true;
  // the bag
  const NB = new Loft(false);
  const rings = [0, 0.4, 0.8, 1].map((t, i) => ({ pts: Array.from({ length: 17 }, (_, j) => { const a = (j / 16) * Math.PI * 2, rr = R * (1 - t * 0.75); return [Math.sin(a) * rr, -L - R - Math.cos(a) * rr, t * 0.38 * s] as [number, number, number]; }), v: i / 3 }));
  NB.loft(rings, usFor(16), { x: 0, y: 0, w: 1, h: 1 }, 1, { end: [0, -L - R, 0.4 * s] });
  const bag = new THREE.Mesh(NB.build(), netMats[1]);
  g.add(pole, bag);
  g.position.set(0.01 * s, -0.08 * s, 0);
  g.rotation.x = Math.PI / 2 - 0.3;
  return g;
}

export function makeFisherman(arch: Archetype, seed: number): Fisherman { return new Fisherman(arch, seed); }
export { STATES };
