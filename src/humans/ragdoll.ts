// Ported from Limbophobia (src/limbo/entities/humanRagdoll.ts) for Blobfish's divers: the same 21-particle
// Verlet body, constraints, hinges and slack, but underwater — bodies sink slowly (weak gravity, a little
// buoyancy from the suit), water drag soaks up the motion, the body is held loosely to the gameplay plane,
// and severed limbs are cut out of the particle graph so a stump swings free.
import * as THREE from 'three';
import type { BoneName, Dims } from './rig';
import type { JName as JointName } from './anim';

/**
 * A lightweight Verlet ragdoll for the survivor rig: 21 particles on the
 * joints (plus head / face / toe / fingertip points), distance constraints
 * for the bones, braces that keep the trunk and skull rigid, hinge rules for
 * knees and elbows and a few anti-folding limits. It collides with the floor
 * (per-tile height, so it slumps down steps) and with walls / solid
 * furniture through the world's own circle collision. It starts from the
 * rig's current pose (so it blends in seamlessly) with the blow's impulse
 * on the part that was hit, and drives the bones back from the particles:
 * pelvis and chest frames from the hip / shoulder pairs, the head from the
 * neck / crown / face points, limbs by swing from their rest direction.
 * It sleeps once it settles; settled, it only re-applies cached rotations.
 *
 * Particles carry mass (a heavy trunk, light hands and feet), so the body
 * swings round its hips and limbs whip; limbs collide with the trunk, the
 * head and each other; the neck and spine bend only so far; dead limbs go
 * slack on the floor (knees fall outward, arms splay, the jaw drops to the
 * chest) and flop over ledges because every particle finds its own floor.
 * A knockdown (one that will get up again) throws the hands out to break the
 * fall and tucks the chin.
 */

export interface RagWorld {
  /** floor height (world y) under a world point */
  ground(x: number, z: number): number;
  /** push a circle (world x / z) out of walls and solid furniture */
  collide?(m: { x: number; z: number; radius: number }): void;
}

type PDef = [bone: BoneName, x: number, y: number, z: number, r: number];
// particle layout (local offsets are scaled by the rig height)
const P: PDef[] = [
  ['hips', 0, 0, 0, 0.11],       // 0 pelvis
  ['chest', 0, 0.06, 0, 0.13],   // 1 chest
  ['neck', 0, 0, 0, 0.06],       // 2 neck
  ['head', 0, 0.12, -0.01, 0.1], // 3 head
  ['head', 0, 0.1, 0.13, 0.03],  // 4 face
  ['uarmL', 0, 0, 0, 0.06],      // 5 shoulder L
  ['farmL', 0, 0, 0, 0.045],     // 6 elbow L
  ['handL', 0, 0, 0, 0.04],      // 7 wrist L
  ['handL', 0, -0.09, 0, 0.03],  // 8 fingers L
  ['uarmR', 0, 0, 0, 0.06],      // 9
  ['farmR', 0, 0, 0, 0.045],     // 10
  ['handR', 0, 0, 0, 0.04],      // 11
  ['handR', 0, -0.09, 0, 0.03],  // 12
  ['thighL', 0, 0, 0, 0.08],     // 13 hip L
  ['shinL', 0, 0, 0, 0.06],      // 14 knee L
  ['footL', 0, 0, 0, 0.05],      // 15 ankle L
  ['footL', 0, -0.05, 0.15, 0.035], // 16 toe L
  ['thighR', 0, 0, 0, 0.08],     // 17
  ['shinR', 0, 0, 0, 0.06],      // 18
  ['footR', 0, 0, 0, 0.05],      // 19
  ['footR', 0, -0.05, 0.15, 0.035], // 20
];
const N = P.length;
// mass per particle: the trunk is heavy, the head heavy-ish, hands and feet light
const MASS = [4.5, 4, 1.4, 2.2, 0.6, 1.4, 1.1, 0.6, 0.25, 1.4, 1.1, 0.6, 0.25, 2.6, 1.6, 0.9, 0.35, 2.6, 1.6, 0.9, 0.35];
const IM = MASS.map((m) => 1 / m);
/** pairs kept apart by their radii (limbs out of the trunk and out of each other) */
const SELF: [number, number][] = [
  [7, 1], [7, 0], [11, 1], [11, 0], [6, 1], [10, 1], [8, 1], [12, 1], [7, 3], [11, 3], [7, 11], [6, 10],
  [14, 18], [15, 19], [14, 19], [15, 18], [16, 20], [7, 13], [11, 17], [7, 14], [11, 18], [3, 14], [3, 18], [3, 15], [3, 19],
];
// distance constraints: [a, b, stiffness]; rest lengths from the bind pose
const RIGID = 1, BRACE = 0.55;
const CONS: [number, number, number][] = [
  [0, 13, RIGID], [0, 17, RIGID], [13, 17, RIGID], [0, 1, RIGID], [1, 2, RIGID], [2, 5, RIGID], [2, 9, RIGID], [5, 9, RIGID],
  [1, 5, RIGID], [1, 9, RIGID], [2, 3, RIGID], [3, 4, RIGID], [2, 4, RIGID],
  [5, 6, RIGID], [6, 7, RIGID], [7, 8, RIGID], [9, 10, RIGID], [10, 11, RIGID], [11, 12, RIGID],
  [13, 14, RIGID], [14, 15, RIGID], [15, 16, RIGID], [14, 16, 0.8], [17, 18, RIGID], [18, 19, RIGID], [19, 20, RIGID], [18, 20, 0.8],
  [0, 5, BRACE], [0, 9, BRACE], [13, 1, BRACE], [17, 1, BRACE], [13, 5, BRACE * 0.6], [17, 9, BRACE * 0.6], [1, 3, 0.35], [1, 4, 0.3],
  [6, 8, 0.25], [10, 12, 0.25],
];
// minimum distances (fraction of the bind-pose distance): no folding a joint flat, no legs through each other
const MINS: [number, number, number][] = [
  [13, 15, 0.42], [17, 19, 0.42], [5, 7, 0.32], [9, 11, 0.32], [15, 19, 0.0], [14, 18, 0.0], [3, 0, 0.7], [7, 3, 0.0], [11, 3, 0.0],
  [3, 13, 0.75], [3, 17, 0.75],
];
const MIN_ABS: Record<string, number> = { '15,19': 0.13, '14,18': 0.12, '7,3': 0.12, '11,3': 0.12 };

const DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _qd = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _I = new THREE.Quaternion();
const _V = Array.from({ length: 12 }, () => new THREE.Vector3());
const _fz = new THREE.Vector3(), _fy = new THREE.Vector3();
const mover = { x: 0, z: 0, radius: 0.05 };

export class Ragdoll {
  active = false;
  asleep = false;
  /** seconds since it started */
  t = 0;
  private pos = new Float32Array(N * 3);
  private prev = new Float32Array(N * 3);
  private rad = new Float32Array(N);
  private rest = new Float32Array(CONS.length);
  private mins = new Float32Array(MINS.length);
  private calm = 0;
  private acc = 0;
  /** 1 for a death (dead weight), 0 for a knockdown the body will get up from (reflexes) */
  private dead = 1;
  /** which way the knees fall when the body goes slack (-1 / +1 per leg) */
  private kneeOut = [1, -1];
  /** where the blow pushed the body (world, normalised xz) */
  private dir = new THREE.Vector3();
  private grounded = new Uint8Array(N);
  /** local rotations it drives, and the hips position (body space) */
  q = {} as Record<JointName, THREE.Quaternion>;
  hips = new THREE.Vector3();
  private toeRest: Record<'L' | 'R', THREE.Vector3> = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  private dims: Dims | null = null;

  constructor() {
    for (const j of ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as JointName[]) this.q[j] = new THREE.Quaternion();
  }

  private restPos(i: number, d: Dims, out: THREE.Vector3) {
    const [b, x, y, z] = P[i];
    const r = d.rest[b];
    return out.set(r[0] + x * d.s, r[1] + y * d.s, r[2] + z * d.s);
  }

  /**
   * Begin from the rig's current pose.
   * @param bones   the rig's bones (matrixWorld must be current)
   * @param vel     world velocity of the whole body (m/s)
   * @param imp     extra world velocity for the struck part (m/s)
   * @param part    body part key that was struck ('' = none)
   * @param collapse 0..1 how limply it folds (1: dead weight, knees buckling)
   */
  start(bones: Record<BoneName, THREE.Object3D>, d: Dims, vel: THREE.Vector3, imp: THREE.Vector3, part = '', collapse = 1, dead = true) {
    this.dims = d;
    this.active = true; this.asleep = false; this.t = 0; this.calm = 0; this.acc = 0;
    this.dead = dead ? 1 : 0;
    this.grounded.fill(0);
    this.dir.set(imp.x + vel.x * 0.3, 0, imp.z + vel.z * 0.3);
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, 1); else this.dir.normalize();
    // slack knees fall outward mostly, sometimes both the same way (a body rolling onto its side)
    const r0 = Math.random();
    this.kneeOut = r0 < 0.6 ? [1, -1] : r0 < 0.8 ? [1, 1] : [-1, -1];
    const hitIdx = partParticles(part);
    // the body's forward (hips z axis) and left (x axis) for the collapse: knees buckle forward, the pelvis drops, arms splay
    const he = bones.hips.matrixWorld.elements;
    const fx = he[8], fz = he[10], fl = Math.hypot(fx, fz) || 1;
    const lx = he[0], lz = he[2], ll = Math.hypot(lx, lz) || 1;
    const rnd = (k: number) => (Math.random() - 0.5) * 2 * k;
    for (let i = 0; i < N; i++) {
      const [b, x, y, z, r] = P[i];
      _a.set(x * d.s, y * d.s, z * d.s).applyMatrix4(bones[b].matrixWorld);
      this.pos[i * 3] = _a.x; this.pos[i * 3 + 1] = _a.y; this.pos[i * 3 + 2] = _a.z;
      this.rad[i] = r * d.s;
      // initial velocity: the body's, plus the blow on the part it hit (and a share of it everywhere)
      const k = hitIdx.includes(i) ? 1 : hitIdx.length ? 0.32 : 0.25;
      const h = 1 / 60;
      // the strings are cut: the pelvis drops, the knees go forward, the arms fly loose
      let cx = 0, cy = 0, cz = 0;
      if (i === 0 || i === 13 || i === 17) cy = -1.3 * collapse;
      else if (i === 14 || i === 18) { const kk = (1.1 + rnd(0.5)) * collapse; cx = (fx / fl) * kk + (lx / ll) * rnd(0.4); cz = (fz / fl) * kk + (lz / ll) * rnd(0.4); cy = -0.6 * collapse; }
      else if (i === 6 || i === 7 || i === 10 || i === 11) { const side = i < 9 ? 1 : -1; const kk = (0.6 + rnd(0.5)) * collapse; cx = (lx / ll) * side * kk + rnd(0.4); cz = (lz / ll) * side * kk + rnd(0.4); cy = rnd(0.5); }
      else if (i === 3 || i === 4) cy = -0.4 * collapse;
      this.prev[i * 3] = _a.x - (vel.x + imp.x * k + cx) * h;
      this.prev[i * 3 + 1] = _a.y - (vel.y + imp.y * k + cy) * h;
      this.prev[i * 3 + 2] = _a.z - (vel.z + imp.z * k + cz) * h;
    }
    for (let c = 0; c < CONS.length; c++) { this.restPos(CONS[c][0], d, _a); this.restPos(CONS[c][1], d, _b); this.rest[c] = _a.distanceTo(_b); }
    for (let c = 0; c < MINS.length; c++) {
      const [a, b, f] = MINS[c];
      this.restPos(a, d, _a); this.restPos(b, d, _b);
      this.mins[c] = Math.max(f * _a.distanceTo(_b), (MIN_ABS[a + ',' + b] ?? 0) * d.s);
    }
    for (const S of ['L', 'R'] as const) {
      const ia = S === 'L' ? 15 : 19;
      this.restPos(ia + 1, d, _a); this.restPos(ia, d, _b);
      this.toeRest[S].subVectors(_a, _b).normalize();
    }
  }

  stop() { this.active = false; this.asleep = false; }

  /** advance the simulation */
  step(dt: number, world: RagWorld | null) {
    if (!this.active) return;
    this.t += dt;
    if (this.asleep) return;
    const H = 1 / 60;
    this.acc = Math.min(this.acc + Math.min(dt, 0.1), H * 3);
    let moved = 0;
    while (this.acc >= H) {
      this.acc -= H;
      moved = Math.max(moved, this.sub(H, world));
    }
    if (world?.collide) this.walls(world);
    this.calm = moved < 0.0012 ? this.calm + dt : 0;
    if (this.calm > 0.6 && this.t > 1.4) this.asleep = true;
  }

  /** sinking acceleration (m/s^2): divers with lead belts sink, a corpse in a wetsuit barely */
  sink = 1.6;
  /** severed particles (no constraints, they stay with the trunk invisibly) */
  private cut = new Uint8Array(N);
  /** cut a limb out of the graph from particle i down its chain */
  sever(part: string) {
    for (const i of partChain(part)) this.cut[i] = 1;
  }

  private sub(h: number, world: RagWorld | null): number {
    const p = this.pos, q = this.prev;
    const g = -this.sink * h * h;
    let moved = 0, down = 0;
    for (let i = 0; i < N; i++) down += this.grounded[i];
    // air drag is slight; once most of the body is on the floor it loses energy fast (it settles instead of jittering)
    const damp = down > 10 ? 0.94 : 0.972;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const dk = this.grounded[i] ? damp * 0.985 : damp;
      const vx = (p[o] - q[o]) * dk, vy = (p[o + 1] - q[o + 1]) * dk, vz = (p[o + 2] - q[o + 2]) * dk;
      q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2];
      p[o] += vx; p[o + 1] += vy + g; p[o + 2] += vz - p[o + 2] * 0.02;
      moved = Math.max(moved, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
    }
    this.slack(h, down);
    for (let it = 0; it < 5; it++) {
      for (let c = 0; c < CONS.length; c++) if (!this.cut[CONS[c][0]] && !this.cut[CONS[c][1]]) this.dist(CONS[c][0], CONS[c][1], this.rest[c], CONS[c][2], 0);
      for (let c = 0; c < MINS.length; c++) this.dist(MINS[c][0], MINS[c][1], this.mins[c], 0.8, 1);
      for (let c = 0; c < SELF.length; c++) { const a = SELF[c][0], b = SELF[c][1]; this.dist(a, b, (this.rad[a] + this.rad[b]) * 0.92, 0.7, 1); }
      this.hinge(13, 14, 15, 1); this.hinge(17, 18, 19, 1);
      this.hinge(5, 6, 7, -1); this.hinge(9, 10, 11, -1);
      this.cone(1, 2, 3, 1.05); this.cone(0, 1, 2, 0.75);
      this.floor(world);
    }
    return moved;
  }

  /**
   * What the muscles (no longer) do. Dead: knees sag outward and the legs
   * slide straighter, the arms splay off the trunk, the head lolls. A
   * knockdown: for the first moments the hands shoot out toward the floor in
   * the direction of the fall and the chin tucks in.
   */
  private slack(h: number, down: number) {
    const p = this.pos, t = this.t;
    const push = (i: number, x: number, y: number, z: number) => { const o = i * 3; p[o] += x * h * h; p[o + 1] += y * h * h; p[o + 2] += z * h * h; };
    // trunk frame
    _x.set(p[13 * 3] - p[17 * 3], p[13 * 3 + 1] - p[17 * 3 + 1], p[13 * 3 + 2] - p[17 * 3 + 2]).normalize();
    _y.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]).normalize();
    _z.crossVectors(_x, _y).normalize();
    if (this.dead || t > 0.45) {
      // underwater the limbs drift out and up a little even before the body settles
    const on = Math.max(0.35, Math.min(1, down / 8)) * Math.min(1, t / 0.5) * Math.max(0.25, 1 - Math.max(0, t - 1.3) / 1.2) * (this.dead ? 1 : 0.6);
      if (on > 0) {
        for (const [ki, side] of [[14, this.kneeOut[0]], [18, this.kneeOut[1]]] as const) {
          // the knee falls out to the side, the foot slides away from the hip
          push(ki, _x.x * side * 6 * on, -2 * on, _x.z * side * 6 * on);
          const fi = ki + 1, hi = ki - 1;
          push(fi, (p[fi * 3] - p[hi * 3]) * 6 * on, -1.5 * on, (p[fi * 3 + 2] - p[hi * 3 + 2]) * 6 * on);
        }
        // arms drift off the trunk
        for (const [ei, side] of [[6, 1], [10, -1], [7, 1], [11, -1]] as const) push(ei, _x.x * side * 3 * on, 1.2 * on, _x.z * side * 3 * on);
      }
    }
    if (!this.dead && t < 0.45) {
      // break the fall: hands out and down along the fall, the chin tucked
      const k = 1 - t / 0.45;
      for (const wi of [7, 11, 8, 12]) {
        const si = wi < 9 ? 5 : 9;
        const tx = p[si * 3] + this.dir.x * 0.55, tz = p[si * 3 + 2] + this.dir.z * 0.55, ty = p[si * 3 + 1] - 0.55;
        const o = wi * 3;
        push(wi, (tx - p[o]) * 120 * k, (ty - p[o + 1]) * 120 * k, (tz - p[o + 2]) * 120 * k);
      }
      push(4, -_y.x * 30 * k + _z.x * 20 * k, -_y.y * 30 * k, -_y.z * 30 * k + _z.z * 20 * k);
    }
  }

  /** keep c within maxAng (radians) of the direction a -> b continued (neck on the trunk, chest on the pelvis) */
  private cone(a: number, b: number, c: number, maxAng: number) {
    const p = this.pos;
    _a.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    _b.set(p[c * 3] - p[b * 3], p[c * 3 + 1] - p[b * 3 + 1], p[c * 3 + 2] - p[b * 3 + 2]);
    const la = _a.length(), lb = _b.length();
    if (la < 1e-5 || lb < 1e-5) return;
    _a.divideScalar(la);
    const ang = _a.angleTo(_b);
    if (ang <= maxAng) return;
    // rotate b->c toward the axis until it sits on the cone
    _c.copy(_b).divideScalar(lb);
    const f = (ang - maxAng) / ang;
    _c.lerp(_a, f).normalize().multiplyScalar(lb);
    const o = c * 3, w = IM[c] / (IM[c] + IM[b] * 0.5);
    p[o] += (p[b * 3] + _c.x - p[o]) * w; p[o + 1] += (p[b * 3 + 1] + _c.y - p[o + 1]) * w; p[o + 2] += (p[b * 3 + 2] + _c.z - p[o + 2]) * w;
  }

  private dist(a: number, b: number, L: number, k: number, mode: number) {
    const p = this.pos, A = a * 3, B = b * 3;
    const dx = p[B] - p[A], dy = p[B + 1] - p[A + 1], dz = p[B + 2] - p[A + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    if (mode === 1 && d >= L) return;
    // the lighter end moves more
    const wa = IM[a] / (IM[a] + IM[b]), wb = 1 - wa;
    const f = ((d - L) / d) * k;
    p[A] += dx * f * wa; p[A + 1] += dy * f * wa; p[A + 2] += dz * f * wa;
    p[B] -= dx * f * wb; p[B + 1] -= dy * f * wb; p[B + 2] -= dz * f * wb;
  }

  /** knees bend forward (+1), elbows backward (-1), relative to the trunk's front */
  private hinge(a: number, b: number, c: number, sign: number) {
    const p = this.pos;
    // trunk frame: across from the hips (legs) or shoulders (arms), up along the spine
    const legs = sign > 0;
    const l = legs ? 13 : 5, r = legs ? 17 : 9;
    _x.set(p[l * 3] - p[r * 3], p[l * 3 + 1] - p[r * 3 + 1], p[l * 3 + 2] - p[r * 3 + 2]);
    _y.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
    _z.crossVectors(_x, _y).normalize();
    // the middle joint relative to the line between the ends
    _a.set(p[a * 3], p[a * 3 + 1], p[a * 3 + 2]); _c.set(p[c * 3], p[c * 3 + 1], p[c * 3 + 2]);
    _b.set(p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
    const ex = _c.x - _a.x, ey = _c.y - _a.y, ez = _c.z - _a.z;
    const e2 = ex * ex + ey * ey + ez * ez || 1e-6;
    const t = ((_b.x - _a.x) * ex + (_b.y - _a.y) * ey + (_b.z - _a.z) * ez) / e2;
    const ox = _b.x - (_a.x + ex * t), oy = _b.y - (_a.y + ey * t), oz = _b.z - (_a.z + ez * t);
    const side = (ox * _z.x + oy * _z.y + oz * _z.z) * sign;
    if (side < 0) {
      // bent the wrong way: push the joint back through the line
      const f = -side * 1.1 * sign;
      p[b * 3] += _z.x * f; p[b * 3 + 1] += _z.y * f; p[b * 3 + 2] += _z.z * f;
    }
  }

  private floor(world: RagWorld | null) {
    const p = this.pos, q = this.prev;
    for (let i = 0; i < N; i++) {
      if (this.cut[i]) { const o = i * 3; p[o] = p[0]; p[o + 1] = p[1]; p[o + 2] = p[2]; q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2]; continue; }
      const o = i * 3;
      const gy = (world ? world.ground(p[o], p[o + 2]) : 0) + this.rad[i];
      if (p[o + 1] < gy) {
        const pen = gy - p[o + 1];
        p[o + 1] = gy;
        this.grounded[i] = 1;
        // friction: a hard landing grabs, a slow slide keeps going a little (limbs slide out straight)
        const sx = p[o] - q[o], sz = p[o + 2] - q[o + 2];
        const sp = Math.hypot(sx, sz);
        const keep = sp < 0.0015 ? 0.2 : pen > 0.004 ? 0.45 : sp > 0.012 ? 0.62 : 0.5;
        q[o] = p[o] - sx * keep;
        q[o + 2] = p[o + 2] - sz * keep;
        if (q[o + 1] < p[o + 1]) q[o + 1] = p[o + 1] + (q[o + 1] - p[o + 1]) * -0.18;
      } else if (p[o + 1] > gy + 0.03) this.grounded[i] = 0;
    }
  }

  private walls(world: RagWorld) {
    const p = this.pos, q = this.prev;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      mover.x = p[o]; mover.z = p[o + 2]; mover.radius = Math.max(0.04, this.rad[i]);
      world.collide!(mover);
      if (mover.x !== p[o] || mover.z !== p[o + 2]) {
        const dx = mover.x - p[o], dz = mover.z - p[o + 2];
        p[o] = mover.x; p[o + 2] = mover.z;
        q[o] += dx * 0.6; q[o + 2] += dz * 0.6;
      }
    }
  }

  private v(i: number, out: THREE.Vector3) { return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(_inv); }

  /**
   * Turn the particles into joint rotations (body space = the rig root's
   * local space; the body pivot must be at identity while it drives).
   */
  solve(rootWorld: THREE.Matrix4) {
    if (!this.active || !this.dims) return;
    _inv.copy(rootWorld).invert();
    const Q = this.q;
    // pelvis frame
    const hl = this.v(13, _V[0]), hr = this.v(17, _V[1]);
    this.v(0, this.hips);
    frame(_x.subVectors(hl, hr), this.v(1, _c).sub(this.hips), Q.hips);
    // chest frame, split between spine and chest
    const ch = this.v(1, _V[2]), nk = this.v(2, _V[3]);
    const sl = this.v(5, _V[4]), sr = this.v(9, _V[5]);
    frame(_x.subVectors(sl, sr), _y.subVectors(nk, ch), _qa);
    _qi.copy(Q.hips).invert();
    _qb.multiplyQuaternions(_qi, _qa);
    Q.spine.slerpQuaternions(_I, _qb, 0.5);
    Q.chest.copy(Q.spine);
    _qc.multiplyQuaternions(Q.hips, Q.spine).multiply(Q.chest); // chest world
    // head: up from the neck to the crown, facing the face point
    const hd = this.v(3, _V[6]), fc = this.v(4, _V[7]);
    _y.subVectors(hd, nk).normalize();
    _z.subVectors(fc, hd);
    _x.crossVectors(_y, _z).normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    _qa.setFromRotationMatrix(_m);
    _qi.copy(_qc).invert();
    _qb.multiplyQuaternions(_qi, _qa);
    Q.neck.slerpQuaternions(_I, _qb, 0.4);
    _qi.copy(Q.neck).invert();
    Q.head.multiplyQuaternions(_qi, _qb);
    // limbs
    const qc = _qd.copy(_qc);
    this.limb(qc, 5, 6, 7, 8, Q.uarmL, Q.farmL, Q.handL, null);
    this.limb(qc, 9, 10, 11, 12, Q.uarmR, Q.farmR, Q.handR, null);
    this.limb(Q.hips, 13, 14, 15, 16, Q.thighL, Q.shinL, Q.footL, this.toeRest.L);
    this.limb(Q.hips, 17, 18, 19, 20, Q.thighR, Q.shinR, Q.footR, this.toeRest.R);
  }

  private limb(parent: THREE.Quaternion, a: number, b: number, c: number, e: number, q1: THREE.Quaternion, q2: THREE.Quaternion, q3: THREE.Quaternion, endRest: THREE.Vector3 | null) {
    const A = this.v(a, _V[8]), B = this.v(b, _V[9]), Cc = this.v(c, _V[10]), E = this.v(e, _V[11]);
    _qi.copy(parent).invert();
    _x.subVectors(B, A).normalize().applyQuaternion(_qi);
    q1.setFromUnitVectors(DOWN, _x);
    _qa.multiplyQuaternions(parent, q1);
    _qi.copy(_qa).invert();
    _x.subVectors(Cc, B).normalize().applyQuaternion(_qi);
    q2.setFromUnitVectors(DOWN, _x);
    _qa.multiply(q2);
    _qi.copy(_qa).invert();
    _x.subVectors(E, Cc).normalize().applyQuaternion(_qi);
    q3.setFromUnitVectors(endRest ?? DOWN, _x);
  }

  /** world position of a particle (e.g. for blood pools under the body) */
  pelvisWorld(out: THREE.Vector3) { return out.set(this.pos[0], this.pos[1], this.pos[2]); }
  /** world position of particle i (0 pelvis, 1 chest, 3 head, 7 / 11 wrists, 15 / 19 ankles) */
  point(i: number, out: THREE.Vector3) { return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]); }
  /** shove the body (world m/s) */
  kick(vx: number, vy: number, i = -1) {
    const h = 1 / 60;
    for (let k = 0; k < N; k++) { if (i >= 0 && k !== i && k !== i + 1 && k !== i - 1) continue; this.prev[k * 3] -= vx * h; this.prev[k * 3 + 1] -= vy * h; }
    this.asleep = false; this.calm = 0;
  }
}

/** quaternion of a frame with x along `across` and y roughly along `up` */
function frame(across: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion) {
  const X = across.normalize();
  const Z = _fz.crossVectors(X, up).normalize();
  const Y = _fy.crossVectors(Z, X).normalize();
  _m.makeBasis(X, Y, Z);
  out.setFromRotationMatrix(_m);
}

/** particles that hang off a cut at `part` (the part and everything distal) */
function partChain(part: string): number[] {
  switch (part) {
    case 'head': case 'neck': return [3, 4];
    case 'uarmL': return [6, 7, 8]; case 'farmL': return [7, 8]; case 'handL': return [8];
    case 'uarmR': return [10, 11, 12]; case 'farmR': return [11, 12]; case 'handR': return [12];
    case 'thighL': return [14, 15, 16]; case 'shinL': return [15, 16]; case 'footL': return [16];
    case 'thighR': return [18, 19, 20]; case 'shinR': return [19, 20]; case 'footR': return [20];
    default: return [];
  }
}

/** particles a blow on a body part shoves */
function partParticles(part: string): number[] {
  switch (part) {
    case 'head': case 'neck': return [3, 4, 2];
    case 'torso_u': return [1, 2, 5, 9];
    case 'torso_l': case 'groin': return [0, 1, 13, 17];
    case 'uarm_l': return [5, 6]; case 'farm_l': return [6, 7]; case 'hand_l': return [7, 8];
    case 'uarm_r': return [9, 10]; case 'farm_r': return [10, 11]; case 'hand_r': return [11, 12];
    case 'thigh_l': return [13, 14]; case 'shin_l': return [14, 15]; case 'foot_l': return [15, 16];
    case 'thigh_r': return [17, 18]; case 'shin_r': return [18, 19]; case 'foot_r': return [19, 20];
    case 'wrist_l': return [6, 7, 8];
    default: return [];
  }
}
