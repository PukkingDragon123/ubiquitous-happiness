// The diver: a Limbophobia person in dive kit, posed procedurally for the side-view ocean.
//
// Orientation stack (all rotations, no mirroring, so the 3D body really turns round):
//   group (world x, y) -> yaw (turns through the camera to face left / right) -> tilt (body angle in the
//   plane: 0 = prone heading forward, PI/2 = upright) -> orient (constant: body up -> +x, front -> -y) ->
//   model.root (offset so the pivot sits at the lower chest).
// Modes: 'swim' (prone flutter kick, head up to look ahead), 'tread' (upright scissor kick), 'walk' (the
// heavy diver plodding on the seabed), 'stand' / 'sit' (boat crews). Weapons are held by two-bone IK aimed at
// a world point; one-shot actions layer on top: fire (recoil), reload (left hand drags the shaft back), throw
// (net), stab (knife lunge), flare (fire straight up), signal (point a squadmate round the flank), heal,
// flinch, taunt. Death hands the bones to the underwater ragdoll; sever() cuts a limb off the skinned mesh
// (bone collapse + a gore cap) and returns the limb as its own tumbling skinned gib.
//
//   const d = makeDiver('scuba', 7, { weapon: 'speargun', scars: ['eyepatch'] });
//   scene.add(d.group); d.group.position.set(x, y, 0);
//   each frame: d.facing = 1; d.swimAngle = 0.2; d.speed = 0.8; d.aimAt(tx, ty); d.update(dt);
//   d.act('fire'); d.muzzleWorld(v); d.die(vx, vy); const gib = d.sever('farmR');
import * as THREE from 'three';
import type { Archetype, Look } from './looks';
import { buildModel } from './model';
import type { Model } from './model';
import type { Dims, BoneName } from './rig';
import { twoBone, frameRot, framePos, makeSkeleton, BONES, PARENT, clamp01 } from './rig';
import { J } from './anim';
import type { JName } from './anim';
import type { ExprName } from './face';
import { makeWeapon } from './weapons';
import type { Weapon, WeaponKind } from './weapons';
import { Ragdoll } from './ragdoll';
import type { RagWorld } from './ragdoll';
import { kitMat, steelMat } from './diveGear';
import { Loft, FULL } from '../gfx/loft';
import { band, hh, nz } from './fabric';
import { mix } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';

export type DiverMode = 'swim' | 'tread' | 'walk' | 'stand' | 'sit';
export type DiverAct = 'fire' | 'reload' | 'throw' | 'stab' | 'flare' | 'signal' | 'heal' | 'flinch' | 'taunt';
export const SEVERABLE = ['head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
export type SeverPart = typeof SEVERABLE[number];

const ACT_DUR: Record<DiverAct, number> = { fire: 0.35, reload: 1.1, throw: 0.8, stab: 0.42, flare: 1.0, signal: 1.0, heal: 1.2, flinch: 0.35, taunt: 1.4 };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qU = new THREE.Quaternion(), _qL = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _e = new THREE.Euler();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const ORIENT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)));

// ------------------------------------------------------------------ gore cap (a cut seen end-on)
let capMat: THREE.Material | null = null;
function goreCapMat() {
  // a clean cross-section: torn rim, a fat ring, two tones of muscle split along the fibre bundles, bone + marrow
  return (capMat ??= kitMat('goreCap', 32, 32, (x, y) => {
    const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy) / 16;
    if (d > 1) return null;
    if (d > 0.86) return [74, 14, 12];
    if (d > 0.74) return [214, 182, 112];
    if (d < 0.24) return d < 0.11 ? [140, 26, 24] : [232, 222, 196];
    const ang = Math.atan2(dy, dx);
    return Math.sin(ang * 3 + d * 4) > 0.2 ? [156, 28, 24] : [112, 16, 16];
  }, { rough: 0.3, emissive: 0.15 }));
}
/** a low-poly stump cap: a ragged disc facing local -y with a stub of bone */
function makeCap(r: number): THREE.Mesh {
  const B = new Loft(false);
  const n = 7, ring: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const k = 1 + (i % 2 ? -0.12 : 0.06); ring.push([Math.cos(a) * r * k, 0, Math.sin(a) * r * k]); }
  B.loft([{ pts: ring, v: 0.5 }], Array.from({ length: n + 1 }, (_, i) => 0.5 + Math.cos((i / n) * Math.PI * 2) * 0.5), FULL, 1, { end: [0, -r * 0.25, 0] });
  B.box([0, -r * 0.35, 0], [r * 0.35, r * 0.6, r * 0.35], { x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
  const geo = B.build();
  // planar uvs (the disc texture)
  const pos = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2.2 * r), 0.5 + pos.getZ(i) / (2.2 * r));
  const m = new THREE.Mesh(geo, goreCapMat());
  m.castShadow = true;
  return m;
}
/** the limb radius at a cut (m), for caps */
function cutRadius(part: SeverPart, s: number) {
  if (part === 'head') return 0.06 * s;
  if (part.startsWith('thigh')) return 0.085 * s;
  if (part.startsWith('shin')) return 0.06 * s;
  if (part.startsWith('foot')) return 0.04 * s;
  if (part.startsWith('uarm')) return 0.055 * s;
  if (part.startsWith('farm')) return 0.042 * s;
  return 0.03 * s;
}
/** the bone a part hangs from and the chain of bones it takes with it */
function chainOf(part: SeverPart): BoneName[] {
  const out: BoneName[] = [];
  const add = (b: BoneName) => { out.push(b); for (const c of BONES) if (PARENT[c] === b) add(c); };
  add(part as BoneName);
  return out;
}

// ------------------------------------------------------------------ hook hand (a nemesis scar)
let hookMat: THREE.Material | null = null;
function makeHook(s: number): THREE.Object3D {
  const B = new Loft(false);
  B.tube([[0, 0.02 * s, 0], [0, -0.05 * s, 0]], () => 0.035 * s, 6, FULL, 1, { capStart: true, capEnd: true });
  const cup = new THREE.Mesh(B.build(), kitMat('hookCup', 16, 16, (x, y) => band([70, 46, 30], 0.9 + (hh(x, y, 9) - 0.5) * 0.2, x, y), { rough: 0.7 }));
  const H = new Loft(false);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; const a = t * Math.PI * 1.2; pts.push([0, -0.05 * s - Math.sin(Math.min(a, Math.PI / 2)) * 0.08 * s - (a > Math.PI / 2 ? 0 : 0), (1 - Math.cos(a)) * 0.04 * s]); }
  H.tube(pts, (t) => 0.009 * s * (1 - t * 0.6), 5, FULL, 1);
  const hook = new THREE.Mesh(H.build(), (hookMat ??= steelMat([186, 190, 196], 0.3)));
  const g = new THREE.Group(); g.add(cup, hook);
  cup.castShadow = hook.castShadow = true;
  return g;
}

export interface DiverOpts { weapon?: WeaponKind; scars?: readonly string[] }

export class DiverRig {
  readonly arch: Archetype;
  readonly look: Look;
  readonly model: Model;
  readonly dims: Dims;
  readonly group = new THREE.Group();
  private yawNode = new THREE.Group();
  private tilt = new THREE.Group();
  private roll = new THREE.Group();
  private orient = new THREE.Group();
  weapon: Weapon;

  // ---- controls (set every frame by the AI)
  mode: DiverMode = 'swim';
  facing: 1 | -1 = 1;
  /** swim heading in the facing frame (radians, + up); ignored when upright */
  swimAngle = 0;
  /** 0..1 kick effort */
  speed = 0.5;
  /** 0..1 blend toward a cower / injured hunch */
  hurt = 0;
  expr: ExprName = 'focus';
  loaded = true;

  private aimPt: THREE.Vector3 | null = null;
  private lookPt: THREE.Vector3 | null = null;
  private yaw = 0;
  private bodyAng = 0;
  private upright = 0;
  private ph = Math.random() * 6;
  private walkPh = 0;
  private time = Math.random() * 10;
  private act: DiverAct | null = null;
  private actT = 0;
  private actFired = false;
  /** called at the action's release frame (fire / throw / stab hit / flare launch) */
  onRelease?: (a: DiverAct) => void;
  private pose = new Float32Array(J.length * 3);
  private aimDir = new THREE.Vector3(0, 1, 0);
  private pivotY: number;
  private severed = new Set<SeverPart>();
  private caps: THREE.Object3D[] = [];
  readonly rag = new Ragdoll();
  dead = false;
  private hookHand: THREE.Object3D | null = null;

  constructor(arch: Archetype, seed: number, o: DiverOpts = {}) {
    this.arch = arch;
    this.model = buildModel(arch, seed, o.scars ?? []);
    this.look = this.model.parts.look;
    this.dims = this.model.parts.dims;
    const s = this.dims.s;
    this.group.name = 'diver:' + arch;
    this.group.add(this.yawNode); this.yawNode.add(this.tilt); this.tilt.add(this.roll); this.roll.add(this.orient); this.orient.add(this.model.root);
    this.orient.quaternion.copy(ORIENT);
    this.pivotY = this.dims.hipY + 0.16 * s;
    this.model.root.position.set(0, -this.pivotY, 0);
    this.weapon = makeWeapon(o.weapon ?? 'none', s);
    this.model.root.add(this.weapon.obj);
    if (o.scars?.includes('hookHand')) {
      // the right hand is gone: a leather cup and a steel hook on the forearm
      this.model.bones.handR.scale.setScalar(1e-4);
      this.hookHand = makeHook(s);
      this.hookHand.position.set(0, -this.dims.L.farm, 0);
      this.model.bones.farmR.add(this.hookHand);
    }
    this.group.traverse((ob) => { ob.frustumCulled = false; });
    // wet neoprene catches a sheen; canvas stays matte; underwater lighting (caustics, depth falloff, a wet rim)
    if (this.look.dive?.suit === 'wetsuit') { this.model.mat.roughness = 0.48; this.model.mat.metalness = 0.05; }
    uw(this.model.mat, { rim: 0.45, rimCol: [0.55, 0.85, 1.0] });
    this.upright = this.look.dive?.suit === 'canvas' ? 1 : 0;
  }

  // ---------------------------------------------------------------- queries
  get scale() { return this.dims.s; }
  /** height of the body pivot above the soles (walkers stand at floor + this) */
  get pivotHeight() { return this.pivotY + this.model.parts.body.sole; }
  get height() { return this.dims.rest.head[1] + 0.23 * this.dims.hs; }
  get busy() { return this.act !== null; }
  get action() { return this.act; }
  /** world position of the weapon muzzle / blade tip */
  muzzleWorld(out: THREE.Vector3) { this.weapon.muzzle.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.weapon.muzzle.matrixWorld); }
  /** world direction the weapon points */
  muzzleDir(out: THREE.Vector3) { this.weapon.obj.updateWorldMatrix(true, false); return out.set(0, 0, 1).transformDirection(this.weapon.obj.matrixWorld); }
  boneWorld(b: BoneName, out: THREE.Vector3) { const bo = this.model.bones[b]; bo.updateWorldMatrix(true, false); return out.setFromMatrixPosition(bo.matrixWorld); }
  headWorld(out: THREE.Vector3) {
    if (this.dead && this.rag.active) return this.rag.point(3, out);
    return this.boneWorld('head', out).add(_v4.set(0, 0.08 * this.dims.hs, 0));
  }
  /** air-hose / valve point (heavy divers: the helmet gooseneck) */
  hoseWorld(out: THREE.Vector3): THREE.Vector3 | null { const h = this.model.dive.hoseOut; if (!h) return null; h.updateWorldMatrix(true, false); return out.setFromMatrixPosition(h.matrixWorld); }
  isSevered(p: SeverPart) { return this.severed.has(p); }

  // ---------------------------------------------------------------- controls
  aimAt(x: number | null, y = 0) { if (x === null) this.aimPt = null; else (this.aimPt ??= new THREE.Vector3()).set(x, y, 0); }
  lookAt(x: number | null, y = 0) { if (x === null) this.lookPt = null; else (this.lookPt ??= new THREE.Vector3()).set(x, y, 0.5); }
  setWeapon(kind: WeaponKind) {
    this.weapon.obj.removeFromParent();
    this.weapon = makeWeapon(kind, this.dims.s);
    this.model.root.add(this.weapon.obj);
    this.weapon.obj.traverse((o) => { o.frustumCulled = false; });
  }
  /** start a one-shot action (ignored while another runs unless force) */
  play(a: DiverAct, force = false) {
    if (this.dead || (this.act && !force)) return false;
    this.act = a; this.actT = 0; this.actFired = false;
    return true;
  }
  /** drop the held weapon into the world (returns it, positioned in world space) */
  dropWeapon(): THREE.Object3D | null {
    const o = this.weapon.obj;
    if (!o.parent || this.weapon.kind === 'none') return null;
    o.updateWorldMatrix(true, false);
    o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    o.removeFromParent();
    this.weapon = makeWeapon('none');
    return o;
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, ragWorld?: RagWorld) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const M = this.model;
    if (this.dead) {
      if (this.rag.active) {
        this.rag.step(dt, ragWorld ?? null);
        this.model.root.updateWorldMatrix(true, false);
        this.rag.solve(this.model.root.matrixWorld);
        for (const j of J) M.bones[j].quaternion.copy(this.rag.q[j]);
        M.bones.hips.position.copy(this.rag.hips);
      }
      M.face.update(dt, this.time);
      return;
    }
    // ---- orientation
    const wantUp = this.mode === 'swim' ? 0 : 1;
    this.upright += (wantUp - this.upright) * (1 - Math.exp(-dt * 4));
    const wantYaw = this.facing > 0 ? 0 : -Math.PI;
    this.yaw += (wantYaw - this.yaw) * (1 - Math.exp(-dt * 7));
    // upright: a 3/4 view so faces read; prone: rolled a little so the camera sees the back and the tank
    const cy = Math.cos(this.yaw);
    this.yawNode.rotation.y = this.yaw - 0.55 * cy * this.upright;
    this.roll.rotation.x = 0.4 * cy * (1 - this.upright);
    const swimA = THREE.MathUtils.clamp(this.swimAngle, -1.3, 1.3);
    const target = swimA + (Math.PI / 2 - swimA) * this.upright;
    this.bodyAng += (target - this.bodyAng) * (1 - Math.exp(-dt * 5));
    this.tilt.rotation.z = this.bodyAng + (this.mode === 'swim' ? Math.sin(this.ph * 0.5) * 0.03 : 0);
    // ---- action clock
    let ak = 0;
    if (this.act) {
      this.actT += dt;
      const dur = ACT_DUR[this.act];
      ak = this.actT / dur;
      const rel = this.act === 'reload' ? 0.75 : this.act === 'throw' ? 0.45 : this.act === 'stab' ? 0.4 : this.act === 'flare' ? 0.55 : this.act === 'heal' ? 0.6 : 0.05;
      if (!this.actFired && ak >= rel) { this.actFired = true; if (this.act === 'reload') this.loaded = true; if (this.act === 'fire') this.loaded = false; this.onRelease?.(this.act); }
      if (ak >= 1) { this.act = null; ak = 0; }
    }
    this.weapon.setLoaded(this.loaded && !(this.act === 'reload' && ak < 0.75) && !(this.act === 'throw' && ak > 0.45));
    // ---- base pose
    this.writePose(dt, ak);
    const a = this.pose;
    for (let i = 0; i < J.length; i++) M.bones[J[i]].quaternion.setFromEuler(_e.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2], 'XYZ'));
    const r = this.dims.rest.hips;
    let bob = 0;
    if (this.mode === 'walk') bob = -Math.abs(Math.sin(this.walkPh)) * 0.04 * this.dims.s;
    M.bones.hips.position.set(r[0], r[1] + bob, r[2]);
    // ---- weapon + arm IK
    this.aimWeapon(dt, ak);
    // ---- face
    const F = M.face;
    F.set(this.act === 'throw' || this.act === 'stab' ? 'yell' : this.act === 'taunt' ? 'grin' : this.act === 'flinch' ? 'scared' : this.expr);
    F.strain = this.act === 'reload' ? 0.6 : this.hurt * 0.5;
    const lp = this.lookPt ?? this.aimPt;
    if (lp) { M.mesh.updateMatrixWorld(true); _v.copy(lp); M.bones.head.worldToLocal(_v); F.gaze.copy(_v).normalize(); }
    F.update(dt, this.time);
    // helmet port glint
    for (const pg of M.dive.ports) (pg.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + Math.max(0, Math.sin(this.time * 1.7 + this.ph)) * 0.25;
  }

  /** joint Euler pose: legs and trunk from the mode, arms from the weapon (IK refines them after) */
  private writePose(dt: number, ak: number) {
    const a = this.pose; a.fill(0);
    const set = (n: JName, x: number, y = 0, z = 0) => { const i = J.indexOf(n) * 3; a[i] = x; a[i + 1] = y; a[i + 2] = z; };
    const addJ = (n: JName, x: number, y = 0, z = 0) => { const i = J.indexOf(n) * 3; a[i] += x; a[i + 1] += y; a[i + 2] += z; };
    const up = this.upright, sp = clamp01(this.speed);
    const heavy = this.look.anim.heavy;
    if (this.mode === 'walk' || this.mode === 'stand') {
      // heavy boots on the seabed: slow plodding steps, arms busy with the gun
      this.walkPh += dt * (this.mode === 'walk' ? 2.2 + sp * 2.2 : 0) * (1.2 - heavy * 0.4);
      const w = this.mode === 'walk' ? Math.min(1, 0.35 + sp) : 0;
      const sL = Math.sin(this.walkPh), sR = Math.sin(this.walkPh + Math.PI);
      set('hips', 0, Math.sin(this.walkPh) * 0.08 * w, 0);
      set('spine', 0.08 + heavy * 0.06, -Math.sin(this.walkPh) * 0.06 * w); set('chest', 0.04);
      set('thighL', -sL * 0.42 * w - 0.08, 0.04, 0.05); set('shinL', 0.12 + Math.max(0, Math.sin(this.walkPh - 1.1)) * 0.75 * w);
      set('thighR', -sR * 0.42 * w - 0.08, -0.04, -0.05); set('shinR', 0.12 + Math.max(0, Math.sin(this.walkPh + Math.PI - 1.1)) * 0.75 * w);
      set('footL', sL * 0.25 * w - 0.05); set('footR', sR * 0.25 * w - 0.05);
      set('neck', -0.05); set('head', 0.0);
    } else if (this.mode === 'sit') {
      set('thighL', -1.45, 0.1, 0.12); set('shinL', 1.35); set('thighR', -1.4, -0.1, -0.12); set('shinR', 1.3);
      set('spine', 0.1); set('neck', -0.05);
    } else {
      // flutter kick from the hips, knees soft, toes pointed so the fins extend the legs
      this.ph += dt * (2.6 + sp * 6.5) * (1 - up * 0.45);
      const amp = 0.12 + sp * 0.32;
      const sL = Math.sin(this.ph), sR = Math.sin(this.ph + Math.PI);
      const tread = up;
      set('hips', 0, 0, 0);
      set('spine', -0.07 * (1 - tread) + 0.04 * tread + this.hurt * 0.25);
      set('chest', -0.06 * (1 - tread) + this.hurt * 0.15);
      set('neck', -0.55 * (1 - tread) - 0.05 * tread, 0, 0);
      set('head', -0.38 * (1 - tread) + 0.04 * tread);
      set('thighL', sL * amp - 0.3 * tread + 0.08, 0.03, 0.04 + 0.08 * tread); set('shinL', 0.22 + 0.4 * tread + Math.max(0, Math.sin(this.ph + 1.3)) * 0.38 * (0.4 + sp));
      set('thighR', sR * amp - 0.3 * tread + 0.08, -0.03, -0.04 - 0.08 * tread); set('shinR', 0.22 + 0.4 * tread + Math.max(0, Math.sin(this.ph + Math.PI + 1.3)) * 0.38 * (0.4 + sp));
      const toe = 1.25 - tread * 0.45;
      set('footL', toe + sL * 0.2); set('footR', toe + sR * 0.2);
    }
    // arms default: trailing along the body when swimming hard, out to the sides treading
    const trail = this.mode === 'swim' ? 1 - up : 0;
    set('uarmL', 0.25 * trail - 0.4 * (1 - trail), 0, 0.12 + 0.25 * (1 - trail)); set('farmL', -0.25 - 0.5 * (1 - trail));
    set('uarmR', 0.25 * trail - 0.4 * (1 - trail), 0, -0.12 - 0.25 * (1 - trail)); set('farmR', -0.25 - 0.5 * (1 - trail));
    if (!(this.mode === 'swim')) {
      // sculling hands while treading
      const sc = Math.sin(this.time * 3.1) * 0.25 * (this.mode === 'tread' ? 1 : 0);
      addJ('uarmL', 0, sc, 0); addJ('uarmR', 0, -sc, 0);
    }
    // actions on the trunk
    if (this.act === 'fire') { const k = Math.max(0, 1 - ak * 3); addJ('chest', -0.12 * k); addJ('neck', -0.1 * k); }
    if (this.act === 'flinch') { const k = Math.sin(Math.min(1, ak) * Math.PI); addJ('spine', -0.25 * k, 0.2 * k); addJ('neck', -0.3 * k); addJ('head', -0.2 * k); }
    if (this.act === 'throw') { const k = ak < 0.45 ? ak / 0.45 : 1 - (ak - 0.45) / 0.55; addJ('chest', (ak < 0.45 ? -0.25 : 0.35) * k, (ak < 0.45 ? 0.35 : -0.4) * k); }
    if (this.act === 'stab') { const k = Math.sin(Math.min(1, ak) * Math.PI); addJ('chest', 0.2 * k, -0.3 * k); addJ('spine', 0.1 * k); }
    if (this.act === 'taunt') { const k = Math.sin(Math.min(1, ak) * Math.PI); addJ('chest', -0.15 * k); addJ('neck', -0.2 * k); addJ('head', Math.sin(ak * 20) * 0.08 * k); }
  }

  /** place the weapon along the aim and pull the hands onto it */
  private aimWeapon(dt: number, ak: number) {
    const M = this.model, B = M.bones, s = this.dims.s, d = this.dims;
    const W = this.weapon;
    const root = M.root;
    root.updateWorldMatrix(true, false);
    _m.copy(root.matrixWorld).invert();
    // body-space chest point and the forward axis for this mode
    framePos(B.chest, M.mesh, _v);
    const chestP = _v.clone().add(_v2.set(0, 0.12 * s, 0));
    const fwd = _v3.set(0, 1 - this.upright, this.upright).normalize();
    let want: THREE.Vector3;
    if (this.aimPt) {
      _v4.copy(this.aimPt).applyMatrix4(_m).sub(chestP);
      want = _v4.lengthSq() > 1e-6 ? _v4.normalize() : fwd.clone();
      // keep it in a forward cone: a diver turns round to shoot behind him
      const dp = want.dot(fwd);
      if (dp < 0.25) want.addScaledVector(fwd, 0.25 - dp).normalize();
    } else {
      want = fwd.clone();
      if (this.mode === 'swim') want.add(_v2.set(0, 0, 0.25)).normalize();
    }
    if (this.act === 'flare' && ak > 0.15) { _v2.set(0, 1, 0).transformDirection(_m); want.lerp(_v2, Math.min(1, (ak - 0.15) * 4)).normalize(); }
    this.aimDir.lerp(want, 1 - Math.exp(-dt * 10)).normalize();
    const dir = this.aimDir;
    const upHint = new THREE.Vector3(0, this.upright, -(1 - this.upright)).normalize();
    const kind = W.kind;
    const twoHanded = kind === 'speargun' || kind === 'bandgun' || kind === 'cannon' || kind === 'polespear';
    // grip position: in front of the chest along the aim, a little low and to the right; swimming prone the
    // arms push the gun out past the head
    const prone = 1 - this.upright;
    let reach = (twoHanded ? 0.34 : 0.4) * s + prone * 0.14 * s;
    let lift = -0.07 * s;
    if (kind === 'cannon') { reach = 0.36 * s; lift = -0.16 * s; }
    if (kind === 'polespear') reach = 0.24 * s + prone * 0.1 * s;
    // recoil / stab lunge / throw swing / reload drag offsets
    let kick = 0;
    if (this.act === 'fire') kick = -Math.max(0, 1 - ak * 3) * 0.08 * s;
    if (this.act === 'stab') kick = Math.sin(Math.min(1, ak / 0.55) * Math.PI) * 0.32 * s;
    const grip = chestP.clone().addScaledVector(dir, reach + kick);
    const wRight = new THREE.Vector3().crossVectors(dir, upHint).normalize();
    const wUp = new THREE.Vector3().crossVectors(wRight, dir).normalize();
    grip.addScaledVector(wUp, lift).addScaledVector(wRight, 0.05 * s);
    let wq = new THREE.Quaternion().setFromRotationMatrix(_m2.makeBasis(wRight.clone().negate(), wUp, dir));
    if (this.act === 'throw') {
      // wind back over the shoulder, then whip forward
      const k = ak < 0.45 ? ak / 0.45 : 1 - (ak - 0.45) / 0.55;
      const back = ak < 0.45 ? k : -k * 0.4;
      grip.addScaledVector(dir, -back * 0.45 * s).addScaledVector(wUp, k * 0.3 * s);
    }
    if (this.act === 'reload' && twoHanded) {
      // muzzle tipped up while the left hand drags the shaft home
      const k = Math.sin(Math.min(1, ak) * Math.PI);
      wq = wq.multiply(_q.setFromAxisAngle(_v4.set(1, 0, 0), -0.5 * k));
    }
    if (this.act === 'heal') grip.addScaledVector(wUp, -0.12 * s);
    W.obj.position.copy(grip);
    W.obj.quaternion.copy(wq);
    W.obj.visible = kind !== 'none';
    // hands
    const qChest = frameRot(B.chest, M.mesh, new THREE.Quaternion());
    const solve = (side: 'L' | 'R', target: THREE.Vector3, w = 1) => {
      if (this.severed.has(('uarm' + side) as SeverPart)) return;
      const U = side === 'L' ? B.uarmL : B.uarmR, Fm = side === 'L' ? B.farmL : B.farmR, H = side === 'L' ? B.handL : B.handR;
      const kk = side === 'L' ? 1 : -1;
      const sh = framePos(U, M.mesh, new THREE.Vector3());
      const pole = dir.clone().multiplyScalar(0.4).addScaledVector(wUp, 0.8).add(new THREE.Vector3(-kk * 0.4, 0, 0));
      const wrist = target.clone().addScaledVector(dir, -0.05 * s).addScaledVector(wUp, 0.04 * s);
      twoBone(sh, wrist, pole, d.L.uarm, d.L.farm, _qU, _qL);
      _q3.copy(qChest).invert().multiply(_qU); U.quaternion.slerp(_q3, w);
      const qUa = frameRot(U, M.mesh, new THREE.Quaternion());
      _q3.copy(qUa).invert().multiply(_qL); Fm.quaternion.slerp(_q3, w);
      // hand along the weapon, fingers round it
      const hz = dir.clone(), hy = wUp.clone().negate().addScaledVector(dir, 0.6).normalize();
      const hx = new THREE.Vector3().crossVectors(hy, hz).normalize(); hz.crossVectors(hx, hy).normalize();
      const qH = _q2.setFromRotationMatrix(_m2.makeBasis(hx, hy, hz));
      const qFa = frameRot(Fm, M.mesh, new THREE.Quaternion());
      _q3.copy(qFa).invert().multiply(qH); H.quaternion.slerp(_q3, w * 0.8);
    };
    if (kind === 'none') return;
    solve('R', grip);
    if (twoHanded && W.fore) {
      let fore = W.fore.clone().applyQuaternion(wq).add(grip);
      if (this.act === 'reload') {
        // hand to the muzzle, then back down the barrel dragging the shaft
        const k = Math.min(1, ak / 0.75);
        const muz = W.muzzle.position.clone().applyQuaternion(wq).add(grip);
        fore = k < 0.4 ? fore.lerp(muz, k / 0.4) : muz.lerp(grip.clone().addScaledVector(dir, 0.12 * s), (k - 0.4) / 0.6);
      }
      solve('L', fore);
    } else if (this.act === 'signal') {
      // point the left arm at the aim / look target (a squadmate's flank)
      const k = Math.sin(Math.min(1, ak) * Math.PI);
      solve('L', chestP.clone().addScaledVector(dir, 0.65 * s).addScaledVector(wUp, 0.2 * s), k);
    } else if (this.act === 'heal' || this.act === 'taunt') {
      const k = Math.sin(Math.min(1, ak) * Math.PI);
      solve('L', chestP.clone().addScaledVector(dir, 0.3 * s).addScaledVector(wUp, this.act === 'taunt' ? 0.35 * s : -0.05 * s), k);
    }
  }

  // ---------------------------------------------------------------- death, ragdoll, severing
  /** go limp: the ragdoll takes the bones from the current pose (world velocity + an impulse) */
  die(vx = 0, vy = 0, ix = 0, iy = 0) {
    if (this.dead) return;
    this.dead = true;
    this.act = null;
    this.model.face.set('dazed');
    this.model.face.setDazed(1);
    this.group.updateMatrixWorld(true);
    const bones = this.model.bones as unknown as Record<BoneName, THREE.Object3D>;
    this.rag.start(bones, this.dims, _v.set(vx, vy, 0), _v2.set(ix, iy, 0), '', 1, true);
    this.rag.sink = this.look.dive?.suit === 'canvas' ? 5 : this.look.dive?.belt ? 1.4 : 0.8;
    for (const p of this.severed) this.rag.sever(p);
  }

  /**
   * Cut a limb off: the body's bone collapses (a gore cap seals the stump) and the limb comes back as its
   * own skinned gib in world space (add it to the scene and tumble it). Returns null if already gone.
   */
  sever(part: SeverPart): THREE.Object3D | null {
    if (this.severed.has(part)) return null;
    for (const p of this.severed) if (chainOf(p).includes(part as BoneName)) return null;
    const M = this.model, s = this.dims.s;
    this.group.updateMatrixWorld(true);
    const gib = this.makeGib(part);
    this.severed.add(part);
    if (this.rag.active) this.rag.sever(part);
    const bone = M.bones[part as BoneName];
    bone.scale.setScalar(1e-4);
    // stump cap on the parent at the joint, facing down the lost bone (local -y)
    const parent = M.bones[PARENT[part as BoneName] as BoneName];
    const cap = makeCap(cutRadius(part, s));
    cap.position.copy(bone.position);
    cap.quaternion.copy(bone.quaternion);
    parent.add(cap);
    this.caps.push(cap);
    if (part === 'handR' || part === 'farmR' || part === 'uarmR') this.dropWeapon();
    return gib;
  }

  private makeGib(part: SeverPart): THREE.Object3D {
    const M = this.model, s = this.dims.s;
    const { byName, skeleton } = makeSkeleton(this.dims);
    const mesh = new THREE.SkinnedMesh(M.mesh.geometry, M.mat);
    mesh.add(byName.hips);
    mesh.bind(skeleton);
    const chain = chainOf(part);
    for (const b of chain) { byName[b].quaternion.copy(M.bones[b].quaternion); byName[b].scale.copy(M.bones[b].scale); }
    // the chain root, re-hung from the mesh at its current body-space transform
    const root = byName[part as BoneName];
    const p = framePos(M.bones[part as BoneName], M.mesh, new THREE.Vector3());
    const q = frameRot(M.bones[part as BoneName], M.mesh, new THREE.Quaternion());
    mesh.add(root); root.position.copy(p); root.quaternion.copy(q); root.scale.set(1, 1, 1);
    byName.hips.position.copy(p); byName.hips.scale.setScalar(1e-4);
    // gear riding on the chain (fins, mask / helmet, the hook) goes with it
    for (const b of chain) {
      for (const ch of [...M.bones[b].children]) {
        if ((ch as THREE.Bone).isBone || this.caps.includes(ch)) continue;
        if (ch === M.face.group) { byName[b].add(ch.clone()); continue; }
        byName[b].add(ch.clone());
      }
    }
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    // a cap on the gib's cut end too (facing back up the bone)
    const cap = makeCap(cutRadius(part, s));
    cap.rotation.x = Math.PI;
    root.add(cap);
    // hold it from a pivot at the limb's middle so it tumbles about its centre
    M.mesh.updateWorldMatrix(true, false);
    const holder = new THREE.Group();
    const childBone = chain.length > 1 ? M.bones[chain[1]] : null;
    const a0 = this.boneWorld(part as BoneName, new THREE.Vector3());
    const a1 = childBone ? childBone.getWorldPosition(new THREE.Vector3()) : a0.clone().add(new THREE.Vector3(0, -0.1 * s, 0));
    const c = part === 'head' ? a0.clone().add(new THREE.Vector3(0, 0.1 * this.dims.hs, 0).applyQuaternion(M.bones.head.getWorldQuaternion(new THREE.Quaternion()))) : a0.clone().lerp(a1, 0.5);
    holder.position.copy(c);
    _m.copy(M.mesh.matrixWorld).premultiply(_m2.makeTranslation(-c.x, -c.y, -c.z));
    _m.decompose(mesh.position, mesh.quaternion, mesh.scale);
    holder.add(mesh);
    holder.userData.radius = part === 'head' ? 0.13 * s : part.startsWith('thigh') ? 0.4 * s : 0.2 * s;
    return holder;
  }

  dispose() {
    this.group.removeFromParent();
    // gibs share the body material: only free it when nothing was cut off
    if (!this.severed.size) this.model.mat.dispose();
  }
}

export function makeDiver(arch: Archetype, seed: number, o: DiverOpts = {}): DiverRig { return new DiverRig(arch, seed, o); }
export type { RagWorld };
