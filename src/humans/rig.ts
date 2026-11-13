// Fisherman skeleton, proportions and small geometry / IK helpers.
//
// Ported from Limbophobia's survivor rig (src/limbo/entities/humanModel.ts rigDims + BONES, humanIK.ts) and
// re-proportioned for Blobfish's slightly stylised people: a larger head, bigger hands and feet, chunkier
// forearms, and per-archetype builds (the kid's big head and short legs, the dad's belly, Captain Gaff's
// barrel chest). Conventions are unchanged: bind pose is an "I" pose with every limb bone hanging along its
// local -y, +z is the body's front, +x the body's LEFT, all bone rotations are identity at rest.
import * as THREE from 'three';
import type { V3, Wt } from '../gfx/loft';

export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head', 'belly',
  'uarmL', 'farmL', 'handL', 'fing1L', 'fing2L', 'thumbL',
  'uarmR', 'farmR', 'handR', 'fing1R', 'fing2R', 'thumbR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
] as const;
export type BoneName = typeof BONES[number];
export const BI = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;
export const PARENT: Record<BoneName, BoneName | ''> = {
  hips: '', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', belly: 'spine',
  uarmL: 'chest', farmL: 'uarmL', handL: 'farmL', fing1L: 'handL', fing2L: 'fing1L', thumbL: 'handL',
  uarmR: 'chest', farmR: 'uarmR', handR: 'farmR', fing1R: 'handR', fing2R: 'fing1R', thumbR: 'handR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

/** body build of one character (1 = the reference ~1.78 m adult) */
export interface Build {
  s: number;        // overall scale
  bw: number;       // width (x)
  mass: number;     // girth / depth (z) of trunk and limbs
  belly: number;    // 0..1 pot belly
  chest: number;    // 0..1 barrel chest / big pecs
  fem: number;      // 0..1
  headS: number;    // head size vs the reference head
  legLen: number;   // leg length multiplier
  armLen: number;
  handS: number; footS: number;
  shoulders: number;
  neckLen: number;
  hunch: number;    // 0..1 rest stoop (grandma)
}

export interface Dims {
  b: Build;
  s: number;
  /** local offset of each bone from its parent (bind pose) */
  off: Record<BoneName, V3>;
  /** bind-pose position of each bone in body space (feet on y = 0) */
  rest: Record<BoneName, V3>;
  hipY: number;
  /** head scale (metres per reference head unit) */
  hs: number;
  /** limb lengths (metres) */
  L: { uarm: number; farm: number; thigh: number; shin: number; ankle: number };
  /** shift that maps reference torso heights (Limbophobia body space, hips at 0.94) onto this body */
  ty: (yRef: number) => number;
}

export function rigDims(b: Build): Dims {
  const s = b.s;
  const off = {} as Dims['off'];
  const set = (n: BoneName, x: number, y: number, z: number) => { off[n] = [x, y, z]; };
  const legK = b.legLen;
  const thigh = 0.43 * legK * s, shin = 0.42 * legK * s, ankle = 0.075 * s;
  const hipY = ankle + shin + thigh + 0.02 * s;
  const sh = 0.178 * (0.55 + 0.45 * b.bw) * b.shoulders * (1 - 0.07 * b.fem);
  const hx = 0.084 * (0.6 + 0.4 * b.bw) * (1 + 0.08 * b.fem);
  set('hips', 0, hipY, 0);
  set('spine', 0, 0.07 * s, 0);
  set('chest', 0, 0.2 * s, 0);
  set('neck', 0, 0.27 * s, -0.008 * s);
  set('head', 0, 0.078 * s * b.neckLen, 0.012 * s);
  set('belly', 0, 0.02 * s, 0.07 * s * b.mass);
  const ua = 0.285 * b.armLen * s, fa = 0.25 * b.armLen * s;
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    set(('uarm' + side) as BoneName, k * sh * s, 0.196 * s, -0.012 * s);
    set(('farm' + side) as BoneName, 0, -ua, 0);
    set(('hand' + side) as BoneName, 0, -fa, 0);
    set(('thigh' + side) as BoneName, k * hx * s, -0.02 * s, 0);
    set(('shin' + side) as BoneName, 0, -thigh, 0);
    set(('foot' + side) as BoneName, 0, -shin, 0);
    const hs = s * b.handS;
    set(('fing1' + side) as BoneName, 0, -0.088 * hs, 0);
    set(('fing2' + side) as BoneName, 0, -0.04 * hs, 0);
    set(('thumb' + side) as BoneName, -k * 0.004 * hs, -0.022 * hs, 0.026 * hs);
  }
  const rest = {} as Dims['rest'];
  for (const n of BONES) {
    const p = PARENT[n], o = off[n];
    rest[n] = p ? [rest[p][0] + o[0], rest[p][1] + o[1], rest[p][2] + o[2]] : [o[0], o[1], o[2]];
  }
  return {
    b, s, off, rest, hipY, hs: s * b.headS,
    L: { uarm: ua, farm: fa, thigh, shin, ankle },
    ty: (yRef: number) => hipY + (yRef - 0.94) * s,
  };
}

/** create the THREE skeleton for a body (bones at rest, identity rotations) */
export function makeSkeleton(d: Dims): { bones: THREE.Bone[]; byName: Record<BoneName, THREE.Bone>; skeleton: THREE.Skeleton } {
  const byName = {} as Record<BoneName, THREE.Bone>;
  const bones = BONES.map((n) => {
    const b = new THREE.Bone(); b.name = n; byName[n] = b;
    const o = d.off[n]; b.position.set(o[0], o[1], o[2]);
    return b;
  });
  for (const n of BONES) { const p = PARENT[n]; if (p) byName[p].add(byName[n]); }
  byName.hips.updateMatrixWorld(true);
  return { bones, byName, skeleton: new THREE.Skeleton(bones) };
}

// ------------------------------------------------------------------ profile rows & rings
export interface Row { y: number; rx: number; rf: number; rb: number; sq?: number; cz?: number }

export function sampleRows(rows: Row[], y: number): Row {
  const asc = rows[0].y < rows[rows.length - 1].y;
  const r = asc ? rows : [...rows].reverse();
  if (y <= r[0].y) return { ...r[0], y };
  if (y >= r[r.length - 1].y) return { ...r[r.length - 1], y };
  for (let i = 0; i + 1 < r.length; i++) {
    const a = r[i], b = r[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      const L = (p: number, q: number) => p + (q - p) * t;
      return { y, rx: L(a.rx, b.rx), rf: L(a.rf, b.rf), rb: L(a.rb, b.rb), sq: L(a.sq ?? 2, b.sq ?? 2), cz: L(a.cz ?? 0, b.cz ?? 0) };
    }
  }
  return { ...r[0], y };
}

/** superellipse ring round a vertical axis, seam at the back (th0 = -PI), th = 0 is the front (+z) */
export function ellRing(y: number, cx: number, cz: number, rx: number, rf: number, rb: number, n: number, sq: number, mirror: number, bump?: (th: number) => number, th0 = -Math.PI): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) pts.push(superPt(th0 + (Math.PI * 2 * i) / n, cx, cz, rx, rf, rb, sq, mirror, 1 + (bump ? bump(th0 + (Math.PI * 2 * i) / n) : 0), y));
  return pts;
}
export function superPt(th: number, cx: number, cz: number, rx: number, rf: number, rb: number, sq: number, mirror: number, kk: number, y: number): V3 {
  const e = 2 / sq;
  const sx = Math.sin(th), cz_ = Math.cos(th);
  const ex = Math.sign(sx) * Math.pow(Math.abs(sx), e), ez = Math.sign(cz_) * Math.pow(Math.abs(cz_), e);
  return [mirror * (cx + ex * rx * kk), y, cz + ez * (cz_ >= 0 ? rf : rb) * kk];
}

/** ring y-list with doubled rings at cloth breaks (hems make a visible step) */
export function ringYs(rows: Row[], breaks: number[], extra: number[] = []): { y: number; eps: number }[] {
  const lo = Math.min(rows[0].y, rows[rows.length - 1].y), hi = Math.max(rows[0].y, rows[rows.length - 1].y);
  const ys = rows.map((r) => ({ y: r.y, eps: 0 }));
  for (const y of extra) if (y > lo && y < hi) ys.push({ y, eps: 0 });
  for (const b of breaks) {
    if (b <= lo + 0.005 || b >= hi - 0.005) continue;
    for (let i = ys.length - 1; i >= 0; i--) if (ys[i].eps === 0 && Math.abs(ys[i].y - b) < 0.012) ys.splice(i, 1);
    ys.push({ y: b, eps: -1 }, { y: b, eps: 1 });
  }
  const desc = rows[0].y > rows[rows.length - 1].y;
  ys.sort((a, b) => (desc ? b.y - a.y || b.eps - a.eps : a.y - b.y || a.eps - b.eps));
  return ys;
}

export const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
export const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const vOf = (range: readonly number[], y: number) => (y - range[0]) / (range[1] - range[0]);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerpW = (a: Wt, b: Wt, t: number): Wt => [...a.map((v, i) => (i & 1 ? v * (1 - t) : v)), ...b.map((v, i) => (i & 1 ? v * t : v))];

// ------------------------------------------------------------------ IK + springs (allocation-free)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion();

/**
 * Two-bone limb solve in one common frame (body space). base = shoulder / hip joint, target = wrist / ankle,
 * pole = direction the bend should open toward (the side the lower bone swings to: forward for elbows,
 * backward for knees; knee = true keeps the thigh's front facing the kneecap). Writes world-frame rotations of both bones into qUpper / qLower (bones hang along -y,
 * the hinge is their shared local x).
 */
export function twoBone(base: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, L1: number, L2: number, qUpper: THREE.Quaternion, qLower: THREE.Quaternion, elbow?: THREE.Vector3, knee = false) {
  _a.subVectors(target, base);
  let dist = _a.length();
  if (dist < 1e-5) { _a.set(0, -1, 0); dist = 1e-5; } else _a.multiplyScalar(1 / dist);
  const reach = (L1 + L2) * 0.999;
  dist = Math.min(reach, Math.max(Math.abs(L1 - L2) + 1e-3, dist));
  // n: unit vector perpendicular to the base->target line toward the pole
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a));
  if (_b.lengthSq() < 1e-8) { _b.set(0, 0, 1).addScaledVector(_a, -_a.z); if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0); }
  _b.normalize();
  let ca = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  ca = ca > 1 ? 1 : ca < -1 ? -1 : ca;
  const sa = Math.sqrt(1 - ca * ca);
  // the middle joint sits AWAY from the pole so the lower bone swings toward it
  _c.copy(base).addScaledVector(_a, ca * L1).addScaledVector(_b, -sa * L1);
  if (elbow) elbow.copy(_c);
  // upper bone: -y along base->elbow, +z toward the bend side (pole)
  _y.subVectors(base, _c).normalize();
  _z.copy(_b).addScaledVector(_y, -_b.dot(_y)).normalize();
  if (knee) _z.negate();   // a thigh's front faces the knee, not the way the shin swings
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z); qUpper.setFromRotationMatrix(_m);
  // lower bone: same hinge x, -y along elbow->target
  _y.subVectors(_c, target).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z); qLower.setFromRotationMatrix(_m);
}

/** set a bone's local quaternion so its frame-space rotation becomes q (parentQ = parent's frame-space rotation) */
export function setFrameRot(bone: THREE.Object3D, parentQ: THREE.Quaternion, q: THREE.Quaternion, w = 1) {
  _qp.copy(parentQ).invert().multiply(q);
  if (w >= 1) bone.quaternion.copy(_qp); else bone.quaternion.slerp(_qp, w);
}

/** frame-space (body space) rotation of a bone: walks up to (but not including) `root`'s parent */
export function frameRot(bone: THREE.Object3D, stop: THREE.Object3D, out: THREE.Quaternion) {
  out.identity();
  let o: THREE.Object3D | null = bone;
  const chain: THREE.Object3D[] = [];
  while (o && o !== stop) { chain.push(o); o = o.parent; }
  for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i].quaternion);
  return out;
}
/** frame-space position of a bone origin (same walk as frameRot), assuming unit scales */
export function framePos(bone: THREE.Object3D, stop: THREE.Object3D, out: THREE.Vector3) {
  const chain: THREE.Object3D[] = [];
  let o: THREE.Object3D | null = bone;
  while (o && o !== stop) { chain.push(o); o = o.parent; }
  out.set(0, 0, 0); _q.identity();
  for (let i = chain.length - 1; i >= 0; i--) {
    _c.copy(chain[i].position).applyQuaternion(_q);
    out.add(_c);
    _q.multiply(chain[i].quaternion);
  }
  return out;
}

/** critically damped spring (value, velocity in v[i]) toward target */
export function spring(x: number, v: Float32Array | number[], i: number, target: number, omega: number, dt: number, zeta = 1): number {
  const k = omega * omega, c = 2 * zeta * omega;
  let vel = v[i];
  const n = dt > 0.02 ? Math.ceil(dt / 0.02) : 1, h = dt / n;
  for (let s = 0; s < n; s++) { vel += (-(x - target) * k - vel * c) * h; x += vel * h; }
  v[i] = vel;
  return x;
}
