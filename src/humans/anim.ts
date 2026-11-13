// Procedural fishing animation: every state is a pose function of time that writes a flat channel array
// (joint Euler angles, root offset, rod placement, hand IK weights, finger curls, crank speed, hat pop...).
// The controller in fisherman.ts crossfades between them, adds tension lean / mood / breathing / look-at on
// top, then solves the arms onto the rod with two-bone IK. Poses are authored for a right-handed angler
// fishing to his front-right (the fisherman mirrors for the other side), body space: +z front, +x his left.
//
// Rig angle conventions: a limb rotation about x < 0 swings it forward (arms raise forward, thighs lift),
// a knee bends with shin.x > 0, an elbow with farm.x < 0; spine / chest x > 0 leans forward; y > 0 turns
// toward his left; z > 0 on the left arm / leg swings it out sideways (z < 0 on the right side).
import type { ExprName } from './face';

export type State = 'idle' | 'cast' | 'wait' | 'nibble' | 'reel' | 'yank' | 'struggle' | 'snapFall' | 'angry' | 'cheer' | 'surprised' | 'throw' | 'net';
export const STATES: State[] = ['idle', 'cast', 'wait', 'nibble', 'reel', 'yank', 'struggle', 'snapFall', 'angry', 'cheer', 'surprised', 'throw', 'net'];

export const J = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
export type JName = typeof J[number];
const JI = Object.fromEntries(J.map((j, i) => [j, i])) as Record<JName, number>;
export const CH = {
  ROOT: 51, RODW: 54, RODP: 55, RODPITCH: 58, RODYAW: 59, RODROLL: 60, OFFW: 61, OFFT: 62, GRIPR: 63, GRIPL: 64, CRANK: 65,
  HAT: 66, AIR: 67, ITEM: 68, NET: 69, LOOKW: 70, RODIKR: 71, N: 72,
} as const;

export interface Ctx {
  s: number;            // body scale
  hipY: number;
  time: number;
  energy: number; bounce: number; heavy: number;
  tension: number;
  seated: number;       // 0 stand .. 1 sit (bench) ; kayak = 2 (legs straight out)
  kayak: boolean;
  rodLen: number;
  grip: number;
  arm: number;          // arm length (m)
  hunch: number;
  rnd: number;          // per-instance random phase
  /** idle fidget selector (changes every few seconds) */
  fidget: number; fidgetT: number;
}

export interface PoseOut { face: ExprName; dur: number; loop: boolean; next?: State }

/** a pose writer */
export class P {
  a = new Float32Array(CH.N);
  j(n: JName, x: number, y = 0, z = 0) { const i = JI[n] * 3; this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; return this; }
  add(n: JName, x: number, y = 0, z = 0) { const i = JI[n] * 3; this.a[i] += x; this.a[i + 1] += y; this.a[i + 2] += z; return this; }
  root(x: number, y: number, z: number) { this.a[CH.ROOT] = x; this.a[CH.ROOT + 1] = y; this.a[CH.ROOT + 2] = z; return this; }
  addRoot(x: number, y: number, z: number) { this.a[CH.ROOT] += x; this.a[CH.ROOT + 1] += y; this.a[CH.ROOT + 2] += z; return this; }
  /** rod held by IK: grip point (body space, metres), pitch above horizontal, yaw toward his right, roll */
  rod(w: number, x: number, y: number, z: number, pitch: number, yaw: number, roll = 0) {
    const a = this.a; a[CH.RODW] = w; a[CH.RODP] = x; a[CH.RODP + 1] = y; a[CH.RODP + 2] = z; a[CH.RODPITCH] = pitch; a[CH.RODYAW] = yaw; a[CH.RODROLL] = roll; return this;
  }
  set(c: number, v: number) { this.a[c] = v; return this; }
  get(c: number) { return this.a[c]; }
}

const sm = (t: number) => t * t * (3 - 2 * t);
const cl = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const seg = (t: number, a: number, b: number) => sm(cl((t - a) / (b - a)));
const L = (a: number, b: number, t: number) => a + (b - a) * t;
const D = Math.PI / 180;

/** keyframe track: [[t, v], ...] smoothstep between keys */
function track(t: number, keys: number[][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) return L(v0, v1, sm((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

/** standing hold: relaxed knees, feet apart, the rod held out front-right at waist height */
function stand(p: P, c: Ctx) {
  const s = c.s, h = c.hunch;
  p.j('hips', 0, -0.12, 0).j('spine', 0.04 + h * 0.15, 0.04).j('chest', 0.03 + h * 0.2, 0.06).j('neck', -0.02 - h * 0.25).j('head', 0.02 - h * 0.1, -0.12);
  p.j('thighL', -0.06, 0.12, 0.09).j('shinL', 0.12).j('footL', -0.06, 0, -0.09);
  p.j('thighR', -0.1, -0.2, -0.07).j('shinR', 0.16).j('footR', -0.06, 0, 0.07);
  p.j('uarmL', -0.25, 0, 0.15).j('farmL', -0.6).j('handL', 0, 0, 0);
  p.j('uarmR', -0.35, 0, -0.18).j('farmR', -0.9).j('handR', 0, 0, 0);
  p.rod(1, -0.21 * s, c.hipY + 0.1 * s, 0.33 * s, 32 * D, 42 * D);
  p.set(CH.OFFW, 1).set(CH.OFFT, 0).set(CH.GRIPR, 1).set(CH.GRIPL, 1).set(CH.LOOKW, 1);
}

/** seated (bench / kayak): legs and root only; torso and rod come from the state */
function seatLegs(p: P, c: Ctx) {
  if (c.seated <= 0) return;
  const k = Math.min(1, c.seated);
  const s = c.s;
  const kay = c.kayak;
  const mix = (n: JName, x: number, y: number, z: number) => {
    const i = JI[n] * 3; p.a[i] = L(p.a[i], x, k); p.a[i + 1] = L(p.a[i + 1], y, k); p.a[i + 2] = L(p.a[i + 2], z, k);
  };
  if (kay) { mix('thighL', -1.45, 0.05, 0.1); mix('shinL', 0.25, 0, 0); mix('footL', -0.3, 0, 0); mix('thighR', -1.45, -0.05, -0.1); mix('shinR', 0.25, 0, 0); mix('footR', -0.3, 0, 0); }
  else { mix('thighL', -1.45, 0.1, 0.12); mix('shinL', 1.35, 0, 0); mix('footL', 0.05, 0, 0); mix('thighR', -1.4, -0.1, -0.12); mix('shinR', 1.3, 0, 0); mix('footR', 0.05, 0, 0); }
  // drop the hips onto the seat (the group origin is the seat surface)
  p.a[CH.ROOT + 1] = L(p.a[CH.ROOT + 1], -(c.hipY - 0.09 * s), k);
  p.a[CH.ROOT + 2] = L(p.a[CH.ROOT + 2], -0.02 * s, k);
  p.a[CH.AIR] = Math.max(p.a[CH.AIR], k); // feet are not ground-locked
}

const breath = (p: P, c: Ctx, amp = 1) => { const b = Math.sin(c.time * 1.9 + c.rnd) * 0.018 * amp; p.add('chest', b).add('neck', -b * 0.6).add('uarmL', 0, 0, b * 0.3).add('uarmR', 0, 0, -b * 0.3); };

/**
 * Write the pose of `st` at time t (seconds into the state). o = per-play options (dir, strength).
 */
export function pose(st: State, t: number, p: P, c: Ctx): PoseOut {
  const s = c.s, E = c.energy, sp = 1;
  p.a.fill(0);
  stand(p, c);
  let out: PoseOut = { face: 'neutral', dur: 0, loop: true };
  switch (st) {
    case 'idle': {
      // rod held upright by the hip, weight shifting from foot to foot, looking about
      const sw = Math.sin(c.time * 0.7 + c.rnd);
      p.rod(1, -0.24 * s, c.hipY + 0.04 * s, 0.2 * s, 72 * D, 20 * D, 0);
      p.set(CH.OFFW, 0);
      p.j('uarmL', -0.06, 0, 0.1).j('farmL', -0.35);
      p.addRoot(sw * 0.025 * s, 0, 0).add('hips', 0, 0, sw * 0.04).add('spine', 0, 0, -sw * 0.03).add('thighL', 0, 0, -sw * 0.04).add('thighR', 0, 0, -sw * 0.04);
      p.add('head', Math.sin(c.time * 0.31 + c.rnd) * 0.08, Math.sin(c.time * 0.23 + c.rnd * 2) * 0.35, Math.sin(c.time * 0.4) * 0.04);
      breath(p, c, 1.2);
      fidget(p, c, true);
      out = { face: 'neutral', dur: 0, loop: true };
      break;
    }
    case 'wait': {
      // rod out over the water, relaxed; boredom fidgets
      const sw = Math.sin(c.time * 0.5 + c.rnd);
      p.rod(1, -0.21 * s, c.hipY + 0.09 * s, 0.34 * s, 26 * D + sw * 2 * D, 44 * D);
      p.add('spine', 0.04).add('chest', 0.03).addRoot(sw * 0.015 * s, 0, 0).add('hips', 0, 0, sw * 0.025);
      p.add('head', 0.05 + Math.sin(c.time * 0.27) * 0.04, -0.15 + Math.sin(c.time * 0.19 + c.rnd) * 0.2);
      breath(p, c, 1);
      fidget(p, c, false);
      out = { face: c.fidget === 2 ? 'sleepy' : 'bored', dur: 0, loop: true };
      break;
    }
    case 'nibble': {
      // alert, leaning in, the tip twitching in little bursts
      const burst = Math.max(0, Math.sin(t * 2.6)) ** 3;
      const tw = Math.sin(t * 47) * burst * 3.5 * D;
      p.rod(1, -0.2 * s, c.hipY + 0.13 * s, 0.37 * s, 24 * D + tw, 44 * D);
      p.add('spine', 0.12).add('chest', 0.08).add('neck', 0.08).add('head', 0.12, -0.25);
      p.add('thighL', -0.08).add('shinL', 0.14).add('thighR', -0.12).add('shinR', 0.18);
      p.addRoot(0, -0.02 * s, 0.02 * s);
      out = { face: burst > 0.3 ? 'ooh' : 'focus', dur: 0, loop: true };
      break;
    }
    case 'cast': {
      const d = 1.25 / sp;
      const u = t / d;
      const pitch = track(u, [[0, 32], [0.36, 112], [0.44, 116], [0.56, 30], [0.62, 14], [0.75, 24], [1, 28]]) * D;
      const yaw = track(u, [[0, 42], [0.36, 18], [0.5, 30], [0.62, 44], [1, 44]]) * D;
      const gx = track(u, [[0, -0.16], [0.36, -0.12], [0.56, -0.15], [1, -0.15]]) * s;
      const gy = c.hipY + track(u, [[0, 0.06], [0.36, 0.42], [0.5, 0.36], [0.62, 0.16], [1, 0.07]]) * s;
      const gz = track(u, [[0, 0.26], [0.36, 0.02], [0.5, 0.2], [0.62, 0.36], [1, 0.27]]) * s;
      p.rod(1, gx, gy, gz, pitch, yaw);
      const tw = track(u, [[0, 0], [0.36, 0.45], [0.5, -0.1], [0.62, -0.32], [1, -0.05]]);
      const lean = track(u, [[0, 0], [0.36, -0.14], [0.52, 0.12], [0.62, 0.2], [1, 0.05]]);
      p.add('spine', lean * 0.5, tw * 0.4).add('chest', lean * 0.6, tw * 0.6).add('hips', 0, tw * 0.3);
      p.add('head', -lean * 0.4, -tw * 0.5 - 0.15);
      // weight back, then a step onto the front foot
      const step = track(u, [[0, 0], [0.36, -0.06], [0.56, 0.08], [1, 0.02]]);
      p.addRoot(-step * 0.4 * s, -Math.abs(step) * 0.2 * s, step * s);
      p.add('thighR', -step * 3.2, 0, 0).add('shinR', Math.max(0, step) * 2).add('thighL', step * 1.4).add('shinL', Math.max(0, -step) * 3);
      p.set(CH.OFFW, track(u, [[0, 1], [0.3, 1], [0.42, 0.3], [0.7, 0.3], [1, 1]])).set(CH.OFFT, 0);
      p.j('uarmL', track(u, [[0, -0.3], [0.36, -1.6], [0.56, -0.6], [1, -0.3]]), 0, 0.3).j('farmL', -1.2);
      out = { face: u < 0.4 ? 'focus' : u < 0.7 ? 'strain' : 'smug', dur: d, loop: false, next: 'wait' };
      break;
    }
    case 'reel': {
      const k = c.tension;
      const cr = c.time * (9 + E * 4) * (1 - k * 0.35);
      p.set(CH.CRANK, (9 + E * 4) * (1 - k * 0.35));
      p.rod(1, -0.21 * s, c.hipY + (0.14 + k * 0.06) * s, 0.32 * s, (40 + k * 18) * D + Math.sin(cr) * 1.5 * D, 40 * D);
      p.set(CH.OFFW, 1).set(CH.OFFT, 1);
      p.add('chest', Math.sin(cr) * 0.02, Math.sin(cr) * 0.04).add('spine', -k * 0.1).add('head', 0.1, -0.2);
      p.add('thighL', -0.05).add('shinL', 0.1 + k * 0.2).add('thighR', -0.1 - k * 0.15).add('shinR', 0.15 + k * 0.25);
      p.addRoot(0, -k * 0.04 * s, -k * 0.05 * s);
      out = { face: k > 0.55 ? 'strain' : c.energy > 1.3 ? 'concentrate' : 'focus', dur: 0, loop: true };
      break;
    }
    case 'yank': {
      const d = 0.9;
      const u = t / d;
      const pitch = track(u, [[0, 34], [0.13, 96], [0.45, 92], [1, 50]]) * D;
      p.rod(1, -0.14 * s, c.hipY + track(u, [[0, 0.08], [0.13, 0.42], [0.45, 0.4], [1, 0.16]]) * s, track(u, [[0, 0.28], [0.13, 0.12], [1, 0.22]]) * s, pitch, 36 * D);
      const lean = track(u, [[0, 0.08], [0.13, -0.3], [0.45, -0.25], [1, -0.05]]);
      p.add('spine', lean * 0.6).add('chest', lean * 0.7).add('hips', lean * 0.3).add('head', -lean * 0.3, -0.2);
      p.addRoot(0, 0, lean * 0.18 * s);
      p.add('thighL', 0.1 * -lean).add('shinL', -lean * 0.3).add('thighR', lean * 0.6).add('shinR', -lean * 0.4);
      p.set(CH.OFFW, 1).set(CH.OFFT, 0);
      p.set(CH.HAT, track(u, [[0, 0], [0.13, 0.6], [0.4, 0]]));
      out = { face: u < 0.5 ? 'yell' : 'focus', dur: d, loop: false, next: 'reel' };
      break;
    }
    case 'struggle': {
      // pulled toward the water: lurch, stumble a step, dig in and lean back hard
      const per = 1.5 / (0.8 + c.energy * 0.2);
      const cyc = (t + c.rnd) / per, ph = cyc - Math.floor(cyc), n = Math.floor(cyc);
      const lurch = track(ph, [[0, 0], [0.18, 1], [0.38, 0.75], [1, 0]]);
      const side = n % 2 ? 1 : -1;
      const k = Math.max(0.6, c.tension);
      p.rod(1, -0.18 * s - lurch * 0.06 * s, c.hipY + (0.12 - lurch * 0.06) * s, (0.38 + lurch * 0.12) * s, (12 - lurch * 10 + Math.sin(c.time * 23) * 1.5) * D, 46 * D);
      p.set(CH.OFFW, 1).set(CH.OFFT, 0);
      const lean = -0.32 * k + lurch * 0.55;
      p.add('hips', lean * 0.4).add('spine', lean * 0.5).add('chest', lean * 0.5).add('neck', -lean * 0.3).add('head', -lean * 0.2 + 0.1, -0.15);
      p.addRoot(-lurch * 0.08 * s, -0.06 * s * k, (-0.1 * k + lurch * 0.22) * s);
      // the stumbling step: alternate feet pop forward during the lurch
      const st = track(ph, [[0, 0], [0.12, 1], [0.3, 0.3], [0.5, 0]]);
      if (side > 0) p.add('thighR', -st * 0.9).add('shinR', st * 0.9); else p.add('thighL', -st * 0.9).add('shinL', st * 0.9);
      p.add('thighL', 0.15 * k - lurch * 0.1).add('shinL', 0.4 * k).add('thighR', -0.3 * k).add('shinR', 0.5 * k).add('footL', -0.2 * k).add('footR', -0.1 * k);
      // wobble
      p.add('chest', 0, Math.sin(c.time * 9) * 0.04 * k, Math.sin(c.time * 7) * 0.04 * k);
      out = { face: lurch > 0.4 ? 'scared' : 'strain', dur: 0, loop: true };
      break;
    }
    case 'snapFall': {
      // the line goes slack: flung backward, flailing, onto the butt with legs in the air, then dazed
      const u = t;
      const fall = track(u, [[0, 0], [0.12, 0.15], [0.42, 1], [0.5, 0.94], [0.58, 1]]);
      const legsUp = track(u, [[0, 0], [0.2, 0.4], [0.45, 1], [0.6, 0.55], [0.75, 0.75], [1.0, 0.6]]);
      const back = track(u, [[0, 0], [0.15, 0.3], [0.45, 0.65], [0.6, 0.35], [0.8, 0.45], [1.1, 0.25]]);
      p.set(CH.RODW, track(u, [[0, 1], [0.1, 0]]));
      p.set(CH.OFFW, 0).set(CH.AIR, 1);
      p.root(0.02 * s, -fall * (c.hipY - 0.1 * s), -track(u, [[0, 0], [0.4, 0.28]]) * s);
      p.j('hips', -back * 0.9, 0, 0).j('spine', -back * 0.3).j('chest', -back * 0.2 + 0.1).j('neck', back * 0.4).j('head', back * 0.25 + Math.sin(c.time * 3) * 0.08 * cl(u - 0.8), Math.sin(c.time * 2.3) * 0.2 * cl(u - 0.8));
      p.j('thighL', -0.2 - legsUp * 1.55, 0.1, 0.2).j('shinL', 0.5 - legsUp * 0.35).j('footL', -0.2);
      p.j('thighR', -0.3 - legsUp * 1.4 + Math.sin(u * 30) * 0.15 * cl(1 - u * 1.5), -0.1, -0.2).j('shinR', 0.6 - legsUp * 0.3).j('footR', -0.2);
      // arms fling up and out, then flop to prop him up
      const fl = track(u, [[0, 0], [0.12, 1], [0.45, 0.8], [0.7, 0]]);
      const flap = Math.sin(u * 28) * 0.3 * fl;
      p.j('uarmL', -0.4 - fl * 2.3 + flap, 0, 0.3 + fl * 0.7).j('farmL', -0.4 - fl * 0.5);
      p.j('uarmR', -0.6 - fl * 2.0 - flap, 0, -0.3 - fl * 0.5).j('farmR', -0.7 - fl * 0.3);
      if (u > 0.6) { const k = cl((u - 0.6) * 3); p.add('uarmL', k * 0.9, 0, k * 0.2).add('farmL', k * 0.2); }
      p.set(CH.HAT, track(u, [[0, 0], [0.1, 1.4], [0.5, 1.6], [0.7, 0.4]]));
      out = { face: u < 0.5 ? 'scared' : 'dazed', dur: 0, loop: true };
      break;
    }
    case 'angry': {
      // stomping, shaking a fist and the rod
      const per = 0.55 / (0.8 + c.energy * 0.2);
      const cyc = t / per, ph = cyc - Math.floor(cyc), n = Math.floor(cyc);
      const lift = Math.sin(ph * Math.PI) ** 2;
      const stomp = n % 2 ? 1 : -1;
      if (stomp > 0) p.add('thighL', -lift * 0.9).add('shinL', lift * 1.3).add('footL', lift * 0.2); else p.add('thighR', -lift * 0.9).add('shinR', lift * 1.3).add('footR', lift * 0.2);
      p.addRoot(-stomp * 0.03 * s * lift, lift * 0.03 * s, 0).add('hips', 0, 0, stomp * lift * 0.08);
      const shake = Math.sin(c.time * 22) * 0.18;
      p.set(CH.RODW, 0).set(CH.OFFW, 0);
      p.j('uarmL', -2.3 + shake * 0.5, 0.3, 0.35).j('farmL', -1.4 + shake).j('handL', 0, 0, 0.3);
      p.j('uarmR', -1.2 + Math.sin(c.time * 11) * 0.35, 0, -0.35).j('farmR', -1.1 + Math.sin(c.time * 11 + 1) * 0.3);
      p.add('chest', 0.15, Math.sin(c.time * 6) * 0.08).add('spine', 0.1).add('head', 0.05 + Math.sin(c.time * 13) * 0.06, -0.1);
      out = { face: 'furious', dur: 0, loop: true };
      break;
    }
    case 'cheer': {
      // jumping for joy, arms (and rod) high
      const per = 0.75 / (0.8 + c.bounce * 0.2);
      const cyc = (t + 0.25) / per, ph = cyc - Math.floor(cyc);
      const jump = Math.max(0, Math.sin(ph * Math.PI * 2)) * c.bounce;
      const crouch = Math.max(0, -Math.sin(ph * Math.PI * 2));
      p.set(CH.RODW, 0).set(CH.OFFW, 0).set(CH.AIR, 1);
      p.addRoot(0, (jump * 0.22 - crouch * 0.06) * s, 0);
      p.add('thighL', -crouch * 0.5 + jump * 0.1).add('shinL', crouch * 0.9 + jump * 0.3).add('thighR', -crouch * 0.5 - jump * 0.2).add('shinR', crouch * 0.9 + jump * 0.5);
      const pump = Math.sin(c.time * 9) * 0.2;
      p.j('uarmL', -2.75 + pump, 0, 0.35).j('farmL', -0.3 - pump).j('uarmR', -2.6 - pump, 0, -0.3).j('farmR', -0.4 + pump);
      p.add('chest', -0.12).add('head', -0.15, Math.sin(c.time * 4) * 0.2);
      p.set(CH.HAT, jump * 0.5);
      out = { face: ph < 0.5 ? 'laugh' : 'grin', dur: 0, loop: true };
      break;
    }
    case 'surprised': {
      const u = t;
      const j = track(u, [[0, 0], [0.12, 1], [0.32, 0], [0.4, 0]]);
      const arms = track(u, [[0, 0], [0.1, 1], [0.6, 0.85], [1.2, 0.55]]);
      p.set(CH.RODW, track(u, [[0, 1], [0.08, 0]])).set(CH.OFFW, 0).set(CH.AIR, j > 0.05 ? 1 : 0);
      p.addRoot(0, j * 0.14 * s, -track(u, [[0, 0], [0.3, 0.12]]) * s);
      p.add('spine', -arms * 0.15).add('chest', -arms * 0.15).add('head', -arms * 0.1, -0.15);
      p.j('uarmL', -0.5 - arms * 0.9, 0, 0.2 + arms * 0.9).j('farmL', -0.3 - arms * 1.4).j('uarmR', -0.7 - arms * 0.8, 0, -0.2 - arms * 0.8).j('farmR', -0.6 - arms * 1.2);
      p.add('thighL', -j * 0.3).add('shinL', j * 0.5).add('thighR', -j * 0.4).add('shinR', j * 0.6);
      p.set(CH.HAT, track(u, [[0, 0], [0.12, 1.3], [0.5, 0]]));
      out = { face: 'surprised', dur: 0, loop: true };
      break;
    }
    case 'throw': {
      const d = 1.15;
      const u = t / d;
      p.rod(track(u, [[0, 1], [0.1, 0.6]]), -0.2 * s, c.hipY + 0.0 * s, 0.12 * s, 60 * D, 20 * D);
      p.set(CH.OFFW, 0);
      const arm = track(u, [[0, -0.4], [0.38, -2.9], [0.46, -2.95], [0.58, -0.9], [0.75, -0.3], [1, -0.4]]);
      const elbow = track(u, [[0, -0.6], [0.38, -2.0], [0.48, -1.6], [0.58, -0.15], [1, -0.5]]);
      const tw = track(u, [[0, 0], [0.4, 0.55], [0.6, -0.35], [1, 0]]);
      p.j('uarmL', arm, track(u, [[0, 0], [0.38, -0.5], [0.6, 0.3], [1, 0]]), track(u, [[0, 0.2], [0.38, 0.5], [0.6, 0.1], [1, 0.2]])).j('farmL', elbow);
      p.add('spine', track(u, [[0, 0], [0.4, -0.15], [0.6, 0.25], [1, 0]]), tw * 0.4).add('chest', 0, tw * 0.6).add('hips', 0, tw * 0.25);
      p.add('head', 0, -tw * 0.6 - 0.2);
      const step = track(u, [[0, 0], [0.4, -0.05], [0.6, 0.1], [1, 0.02]]);
      p.addRoot(0, -Math.abs(step) * 0.2 * s, step * s).add('thighL', -step * 3).add('shinL', Math.max(0, step) * 2);
      p.set(CH.ITEM, u < 0.52 ? 1 : 0).set(CH.GRIPL, u < 0.52 ? 0.7 : 0.1);
      out = { face: u < 0.5 ? 'angry' : 'yell', dur: d, loop: false, next: 'wait' };
      break;
    }
    case 'net': {
      const d = 1.9;
      const u = t / d;
      // rod held high out of the way, the landing net swept down into the water and scooped up
      p.rod(1, -0.18 * s, c.hipY + 0.32 * s, 0.1 * s, 75 * D, 30 * D);
      p.set(CH.OFFW, 0).set(CH.NET, 1);
      const reach = track(u, [[0, 0], [0.35, 1], [0.6, 1], [0.8, 0.4], [1, 0]]);
      const scoop = track(u, [[0, 0], [0.35, 0], [0.62, 1], [1, 1]]);
      p.j('uarmL', -0.8 - reach * 0.6 - scoop * 0.5 * (1 - reach * 0.4), 0.2, 0.25 + reach * 0.15).j('farmL', -0.5 + reach * 0.3 - scoop * 0.5);
      p.add('spine', reach * 0.35).add('chest', reach * 0.3, reach * 0.25).add('head', reach * 0.2, -0.1);
      p.add('thighL', -reach * 0.35).add('shinL', reach * 0.6).add('thighR', -reach * 0.3).add('shinR', reach * 0.6);
      p.addRoot(0, -reach * 0.1 * s, reach * 0.06 * s);
      p.set(CH.GRIPL, 1);
      out = { face: u < 0.6 ? 'concentrate' : 'happy', dur: d, loop: false, next: 'wait' };
      break;
    }
  }
  seatLegs(p, c);
  return out;
}

/** idle / wait fidgets: scratch the head, check the watch, stretch, yawn */
function fidget(p: P, c: Ctx, idle: boolean) {
  const f = c.fidget, t = c.fidgetT;
  const env = track(t, [[0, 0], [0.4, 1], [2.2, 1], [2.8, 0]]);
  if (env <= 0) return;
  switch (f) {
    case 1: // scratch head with the free hand
      p.set(CH.OFFW, L(p.get(CH.OFFW), 0, env));
      p.add('uarmL', -2.1 * env, 0.3 * env, 0.6 * env).add('farmL', -1.6 * env + Math.sin(c.time * 18) * 0.15 * env);
      p.add('head', 0.12 * env, 0, -0.12 * env);
      break;
    case 2: // yawn and stretch the back
      p.add('spine', -0.12 * env).add('chest', -0.1 * env).add('head', -0.25 * env);
      if (idle) { p.set(CH.OFFW, L(p.get(CH.OFFW), 0, env)); p.add('uarmL', -2.4 * env, 0, 0.4 * env).add('farmL', -0.8 * env); }
      break;
    case 3: // check the watch
      p.set(CH.OFFW, L(p.get(CH.OFFW), 0, env));
      p.add('uarmL', -0.7 * env, -0.4 * env, 0.25 * env).add('farmL', -1.8 * env).add('head', 0.35 * env, 0.35 * env);
      break;
    case 4: // look around over the shoulder
      p.add('head', -0.05 * env, 0.8 * env).add('chest', 0, 0.2 * env);
      break;
  }
}
