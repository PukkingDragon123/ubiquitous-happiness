// MATERIALS: line, hooks, shot, cork, kelp, pearls, coral, sea glass, nails, coins, ores, gems, teeth, wood, lenses,
// spines, mana crystals, scrap, shells. Commons look worn (rust, chips, bleaching); uncommons clean; rares cut and glinting.
import * as THREE from 'three';
import { mat, cbox, hull, rock, prism, bipyr, cyl, cone, tube, ext, ball, surf, warp, torus, lathe, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, Pt, type Pal } from './paint';
import { pageMap, jHook, coin, brilliant, stepCut, fanShell } from './parts';
import type { Build } from './types';
import { hash2 } from '../../core/math';

// ------------------------------------------------------------------ shared pages
/** the rock matrix most ores and gems grow out of */
const matrixPage = (key: string, p0: Pal, seed = 1) => tx('matrix:' + key, 48, 48, (p) => { p.stone(0, 0, 48, 48, p0, { cell: 10, seed, cracks: 3 }); });
const rustyIron = () => tx('rustyIron', 64, 16, (p) => {
  p.metal(0, 0, 64, 16, PAL.iron, { b: 2.5, polish: false });
  p.rust(10, 7, 5, 1); p.rust(27, 9, 6, 2); p.rust(41, 5, 4, 3); p.drip(30, 10, 5); p.drip(12, 9, 4);
  p.scratch(46, 4, 6, PAL.iron, 0.2, 2.5);
  // the honed point stays bright steel
  p.R(53, 0, 11, 16, PAL.steel, 3.5); p.R(53, 4, 11, 2, PAL.steel, 5); p.R(53, 12, 11, 2, PAL.steel, 2); p.R(52, 0, 1, 16, PAL.rust, 1);
});

export const MATERIAL_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- a snarl of snapped monofilament
  lineScrap(b) {
    const T = tx('line', 32, 8, (p) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) { const k = (x + y * 2) % 6; p.t(x, y, PAL.teal, k < 2 ? 4.5 : k < 4 ? 3.5 : 3); }
      p.R(0, 0, 32, 1, PAL.teal, 5);
    });
    const line = mat('line', T, { rough: 0.3, emissive: '#1a6a5a', ek: 0.3 });
    const kp: V3[] = [];
    for (let i = 0; i < 15; i++) { const t = (i / 15) * TAU; kp.push([(Math.sin(t) + 2 * Math.sin(2 * t)) * 0.125, (Math.cos(t) - 2 * Math.cos(2 * t)) * 0.115, -Math.sin(3 * t) * 0.14]); }
    b.add(tube(kp, 0.026, { closed: true, radial: 4, segs: 45 }), line, [0, 0.04, 0], [0.35, 0.25, 0.3]);
    b.add(tube([[-0.05, -0.05, 0.1], [0.12, -0.12, 0.16], [0.26, -0.08, 0.1], [0.3, 0.06, 0.02], [0.18, 0.12, -0.05]], 0.024, { radial: 4, segs: 14, closed: false }), line);
    // the snapped tails, one frayed into three hairs
    b.add(tube([[0.2, -0.18, 0.05], [0.32, -0.3, 0.1], [0.42, -0.33, 0.04]], 0.022, { radial: 4, segs: 8 }), line);
    for (const [dx, dy] of [[0.08, 0.02], [0.07, -0.04], [0.05, -0.07]] as V2[]) b.add(tube([[0.42, -0.33, 0.04], [0.42 + dx, -0.33 + dy, 0.05]], 0.008, { radial: 3, segs: 2 }), line);
    b.add(tube([[-0.24, 0.24, 0], [-0.36, 0.38, 0.05], [-0.42, 0.44, 0.1]], 0.022, { radial: 4, segs: 8 }), line);
    // a red-and-white bead float still threaded on, and a split shot crimped beside it
    const bead = tx('lineBead', 16, 16, (p) => { p.R(0, 0, 16, 8, PAL.red, 3.5); p.R(0, 8, 16, 8, PAL.white, 4); p.R(0, 7, 16, 2, PAL.ink, 2); p.R(2, 2, 3, 2, PAL.red, 5); });
    b.add(ball(0.085, 8, 6), mat('lineBead', bead, { rough: 0.3 }), [-0.42, 0.44, 0.1], [0.3, 0, -0.5], 1, { smooth: 1.2 });
    b.add(ball(0.05, 6, 4), mat('lead', leadPage(), { rough: 0.6, metal: 0.3 }), [0.3, -0.3, 0.09]);
  },

  // ---------------------------------------------------------------- the J-hook: eye, shank, bend, point, a big barb
  rustyHook(b) {
    const T = rustyIron();
    const iron = mat('rustyIron', T, { rough: 0.75, metal: 0.25 });
    const point = mat('hookPoint', tx('hookPt', 8, 8, (p) => { p.all(PAL.steel, 3.5); p.R(0, 0, 8, 2, PAL.steel, 5); p.R(0, 6, 8, 2, PAL.steel, 2); p.glint(3, 3, 1); }), { rough: 0.3, metal: 0.6 });
    jHook(b, iron, point, { r: 0.04 });
    // a whipping of red thread at the eye with a tag end, and a curl of line
    const thread = mat('redThread', tx('redThread', 16, 8, (p) => p.rope(0, 0, 16, 8, PAL.red, { pitch: 3 })), { rough: 0.8 });
    b.add(cyl(0.05, 0.08, 6), thread, [0.06, 0.29, 0]);
    b.add(tube([[0.06, 0.25, 0.04], [0.16, 0.18, 0.08], [0.2, 0.05, 0.06], [0.16, -0.02, 0.04]], 0.014, { radial: 3, segs: 9 }), thread);
  },

  // ---------------------------------------------------------------- split shot: three lead balls, slits facing out
  leadShot(b) {
    const m = mat('lead', leadPage(), { rough: 0.6, metal: 0.3 });
    const slit = mat('leadSlit', tx('leadSlit', 8, 8, (p) => p.all(PAL.ink, 1)), { rough: 1 });
    const shot = (pos: V3, r: number, rot: V3) => {
      const s = b.sub(pos, rot);
      const half = lathe([[0, 0.012], [r * 0.7, 0.012], [r * 0.95, r * 0.3], [r * 0.95, r * 0.55], [r * 0.7, r * 0.82], [r * 0.38, r * 0.97], [0, r]], 9, { cap: [0, 0, 1, 1] });
      s.add(half, m);
      s.add(half, m, [0, 0, 0], [Math.PI, 0, 0]);
      s.add(cyl(r * 0.93, 0.03, 9), slit);
    };
    shot([-0.16, -0.13, 0.05], 0.2, [0.25, 0, 0.45]);
    shot([0.19, -0.1, -0.02], 0.18, [-0.2, 0.3, -0.35]);
    shot([0.0, 0.2, -0.05], 0.17, [0.5, 0, 0.1]);
    // a scrap of line crimped through two of them
    const line = mat('line', null);
    b.add(tube([[-0.45, -0.3, 0.02], [-0.16, -0.13, 0.05], [0.19, -0.1, -0.02], [0.44, 0.05, 0.02]], 0.014, { radial: 3, segs: 12 }), line);
  },

  // ---------------------------------------------------------------- a wine cork: pores, a wine-stained end, a stamp
  cork(b) {
    const C = pal('#bc8a50');
    const T = tx('cork', 64, 48, (p) => {
      p.all(C, 3);
      for (let y = 1; y < 32; y += 3) for (let x = (y * 7) % 5; x < 64; x += 5 + ((y >> 1) % 3)) {
        const l = 1 + Math.floor(hash2(x, y, 3) * 2);
        p.R(x, y, l, 1, C, 1); p.t(x, y + 1, C, 4); if (hash2(x, y, 4) > 0.6) p.t(x + l, y, C, 2);
      }
      // the wine end: a purple-red band with a wavy edge
      for (let x = 0; x < 64; x++) { const h = 5 + Math.round(Math.sin(x * 0.4) * 1.2 + Math.sin(x * 0.17) * 1); p.R(x, 0, 1, h, PAL.ruby, 1.5); p.t(x, h, PAL.ruby, 2.5); }
      p.text('VINO', 24, 15, '#4a2a12'); p.R(22, 13, 18, 1, '#5a3418'); p.R(22, 21, 18, 1, '#5a3418');
      p.R(0, 31, 64, 1, C, 1.5);
      // caps: the wine-soaked end (left) and the corkscrew end (right)
      p.ellipse(8, 40, 8, 8, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.8 ? PAL.ruby[1] as unknown as null : null; });
      p.ellipse(8, 40, 8, 8, (nx, ny) => { const d = Math.hypot(nx, ny); const c = d > 0.82 ? 2 : (nx + ny < -0.4 ? 2.5 : 1.5); return hexOf(PAL.ruby, c); });
      p.ellipse(32, 40, 8, 8, (nx, ny) => { const d = Math.hypot(nx, ny); return hexOf(C, d > 0.82 ? 2 : (nx + ny < -0.3 ? 4 : 3)); });
      for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 1 + i * 0.4; p.t(32 + Math.cos(a) * r, 40 + Math.sin(a) * r, C, 0); }
    });
    const m = mat('cork', T, { rough: 0.95 });
    b.add(cyl(0.2, 0.7, 10, { rTop: 0.18, ch: 0.035, side: T.r(0, 0, 64, 32), cap: T.r(24, 32, 16, 16) }), m, [0, 0, 0], [0, 0, -0.85]);
    b.add(cyl(0.2, 0.012, 10, { side: T.r(0, 32, 16, 16), cap: T.r(0, 32, 16, 16) }), m, [0.3 * Math.sin(0.85) * 1.17, -0.3 * Math.cos(0.85) * 1.17, 0], [0, 0, -0.85]);
  },

  // ---------------------------------------------------------------- a kelp frond: stipe, ruffled blades, gas bladders
  kelp(b) {
    const K = PAL.kelp;
    const blade = tx('kelpBlade', 16, 64, (p) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) { const e = Math.abs(x - 7.5) / 8; p.t(x, y, K, e > 0.85 ? 1.5 : e > 0.6 ? 2.5 : 3 + (y < 20 ? 0.5 : 0)); }
      p.R(7, 0, 2, 64, K, 4.5); p.R(9, 0, 1, 64, K, 2);
      for (let y = 4; y < 62; y += 6) { for (let i = 0; i < 5; i++) { p.t(1 + i, y + (i >> 1), K, 2); p.t(14 - i, y + (i >> 1), K, 2); p.t(1 + i, y - 1 + (i >> 1), K, 4); p.t(14 - i, y - 1 + (i >> 1), K, 4); } }
      for (let y = 0; y < 64; y += 3) { p.t(0, y, K, 0); p.t(15, y + 1, K, 0); }
    });
    const bm = mat('kelpBlade', blade, { rough: 0.6, side: THREE.DoubleSide });
    const stem = mat('kelpStem', tx('kelpStem', 32, 8, (p) => { p.all(PAL.kelp, 2); p.R(0, 2, 32, 2, PAL.kelp, 3.5); for (let x = 3; x < 32; x += 7) p.R(x, 0, 1, 8, PAL.kelp, 1); }), { rough: 0.7 });
    const bladder = mat('kelpBladder', tx('kelpBladder', 16, 16, (p) => { p.all(pal('#a88e2a'), 3); p.R(0, 10, 16, 6, pal('#a88e2a'), 2); p.R(3, 3, 4, 3, pal('#a88e2a'), 5); p.glint(4, 4, 1); }), { rough: 0.3 });
    b.add(tube([[0, -0.92, 0], [0.04, -0.45, 0.02], [-0.02, 0.05, 0], [0.04, 0.55, -0.02], [0.0, 0.8, 0]], (t) => 0.04 - t * 0.015, { radial: 5, segs: 14 }), stem);
    const leaf = (L: number, W: number, seed: number): V2[] => {
      const out: V2[] = [], n = 9;
      for (let i = 0; i <= n; i++) { const y = (i / n) * L, w = W * Math.pow(Math.sin((i / n) * Math.PI * 0.94 + 0.08), 0.8) * (1 + 0.18 * Math.sin(i * 2.1 + seed)); out.push([w, y]); }
      for (let i = n; i >= 0; i--) { const y = (i / n) * L, w = W * Math.pow(Math.sin((i / n) * Math.PI * 0.94 + 0.08), 0.8) * (1 + 0.18 * Math.sin(i * 2.4 + seed + 1)); out.push([-w, y]); }
      return out;
    };
    const blades: [number, number, number, number, number][] = [[-0.5, -0.55, 0.78, 0.12, 1], [-0.12, 0.6, 0.8, 0.12, 2], [0.22, -0.5, 0.66, 0.11, 3], [0.55, 0.12, 0.42, 0.1, 4]];
    for (const [y, rz, L, W, sd] of blades) {
      const g = warp(ext(leaf(L, W, sd), 0.02, 0.006), (v) => { v.z += Math.sin((v.y / L) * Math.PI) * 0.1 * (sd % 2 ? 1 : -1) + Math.abs(v.x) * 0.4; });
      b.add(g, bm, [0, y + 0.04, 0], [0, 0, rz]);
      b.add(ball(0.075, 7, 5), bladder, [Math.sin(-rz) * 0.04, y, 0.02], [0, 0, rz], [1, 1.25, 1], { smooth: 1 });
    }
    // the holdfast: little claw roots
    const root = mat('kelpRoot', tx('kelpRoot', 16, 8, (p) => { p.all(pal('#5a4020'), 2.5); p.R(0, 1, 16, 2, pal('#5a4020'), 4); }), { rough: 0.9 });
    for (const [dx, dz] of [[-0.18, 0.05], [-0.06, 0.12], [0.1, 0.1], [0.2, -0.02], [0.02, -0.12]] as V2[]) b.add(tube([[0, -0.86, 0], [dx * 0.6, -0.9, dz * 0.6], [dx, -0.98, dz]], (t) => 0.03 * (1 - t * 0.6), { radial: 4, segs: 5 }), root);
  },

  // ---------------------------------------------------------------- a giant pearl in an open oyster half
  pearl(b) {
    const outerT = tx('oysterOut', 32, 32, (p) => {
      const O = pal('#7a6a72');
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const ring = Math.floor((y + Math.sin(x * 0.6) * 1.5) / 4); p.t(x, y, O, 2.5 + (ring % 2) * 0.5 + (y > 26 ? 1 : 0)); }
      for (let y = 3; y < 32; y += 4) for (let x = 0; x < 32; x++) if ((x + y) % 3) p.t(x, y + Math.round(Math.sin(x * 0.6) * 1.5), O, 1);
      p.R(0, 29, 32, 3, O, 4);
    });
    const innerT = tx('oysterIn', 32, 32, (p) => { p.nacre(0, 0, 32, 32, 3, 0.7); p.R(0, 28, 32, 4, PAL.pearl, 4.5); p.ellipse(16, 8, 5, 3, (nx, ny) => hexOf(PAL.purple, Math.hypot(nx, ny) > 0.7 ? 3 : 4)); });
    const out = mat('oysterOut', outerT, { rough: 0.85 }), inn = mat('oysterIn', innerT, { rough: 0.35, emissive: '#2a2a3a', ek: 0.25 });
    const S = (u: number, v: number, inside: boolean): V3 => {
      const a = u * TAU, R = 0.46 * (1 + 0.09 * Math.sin(a * 7) + 0.06 * Math.sin(a * 3 + 1));
      const y = 0.2 * v * v + 0.035 * Math.sin(a * 9) * v * v * v - (inside ? 0 : 0.07 * (1 - v * v));
      return [Math.cos(a) * R * v * 1.1, y, Math.sin(a) * R * v * 0.85];
    };
    const sh = b.sub([0, -0.16, 0], [0.95, 0, 0]);
    sh.add(surf(18, 3, (u, v) => S(u, v, true), { back: true }), inn);
    sh.add(surf(18, 3, (u, v) => S(u, v, false)), out);
    const pearlT = tx('pearl', 32, 16, (p) => {
      p.all(PAL.pearl, 3.5);
      for (let x = 0; x < 32; x++) { p.t(x, 4 + Math.round(Math.sin(x * 0.4) * 1.5), PAL.pink, 4.5); p.t(x, 11 + Math.round(Math.sin(x * 0.3 + 2)), PAL.nacre, 4); }
      p.R(0, 13, 32, 3, PAL.pearl, 2.5);
      p.R(5, 3, 4, 3, PAL.pearl, 5); p.glint(6, 4, 1);
    });
    b.add(ball(0.27, 12, 9), mat('pearl', pearlT, { rough: 0.2, metal: 0.1, emissive: '#4a3a5a', ek: 0.35 }), [0.0, 0.08, 0.12], [0.3, 0.5, 0], 1, { smooth: 1.3 });
  },

  // ---------------------------------------------------------------- a snapped branch of fire coral (L footprint)
  coralShard(b) {
    const C = PAL.coral;
    const T = tx('coral', 32, 16, (p) => {
      p.all(C, 3);
      for (let y = 1; y < 16; y += 4) for (let x = (y % 8 === 1 ? 0 : 2); x < 32; x += 4) { p.t(x, y, C, 5); p.t(x + 1, y, C, 4); p.t(x, y + 1, C, 4); p.t(x + 1, y + 1, C, 1); }
      p.R(26, 0, 6, 16, C, 4); for (let y = 1; y < 16; y += 3) p.t(28, y, PAL.yellow, 5);
      p.R(0, 0, 3, 16, C, 2);
    });
    const m = mat('coral', T, { rough: 0.7 });
    const tip = mat('coralTip', tx('coralTip', 8, 8, (p) => { p.all(PAL.yellow, 4); p.R(0, 5, 8, 3, PAL.coral, 4); p.R(1, 1, 2, 2, PAL.yellow, 5); }), { rough: 0.5, emissive: '#a03a10', ek: 0.35 });
    const br = (pts: V3[], r0: number, r1: number) => { b.add(tube(pts, (t) => r0 + (r1 - r0) * t, { radial: 5, segs: pts.length * 3 }), m); b.add(ball(r1 * 1.25, 6, 4), tip, pts[pts.length - 1]); };
    br([[-0.55, -0.82, 0], [-0.5, -0.4, 0.04], [-0.56, 0.1, 0], [-0.48, 0.5, -0.03], [-0.42, 0.86, 0]], 0.12, 0.05);
    br([[-0.52, -0.48, 0.02], [-0.15, -0.36, 0.06], [0.3, -0.4, 0.02], [0.84, -0.3, 0]], 0.09, 0.045);
    br([[-0.54, 0.16, 0], [-0.75, 0.38, 0.03], [-0.86, 0.6, 0.02]], 0.06, 0.035);
    br([[-0.5, 0.32, 0], [-0.24, 0.48, 0.05], [-0.14, 0.7, 0.03]], 0.055, 0.035);
    br([[0.18, -0.39, 0.03], [0.3, -0.18, 0.06], [0.36, -0.06, 0.04]], 0.05, 0.032);
    br([[0.58, -0.36, 0.01], [0.7, -0.56, 0.04], [0.78, -0.72, 0.02]], 0.045, 0.03);
    // the snapped base: white skeleton showing through
    b.add(cyl(0.12, 0.03, 7, { side: [0, 0, 0.1, 1] }), mat('coralBone', tx('coralBone', 16, 16, (p) => { p.all(PAL.bone, 4); p.rings(8, 8, 8, PAL.bone, 2.5, 4); }), { rough: 0.9 }), [-0.555, -0.84, 0]);
  },

  // ---------------------------------------------------------------- three frosted sea-glass pebbles
  seaGlass(b) {
    const glass = (key: string, c: string) => {
      const P = pal(c);
      const T = tx('sg:' + key, 32, 32, (p) => {
        p.all(P, 3);
        p.ellipse(16, 17, 13, 12, (nx, ny) => hexOf(P, Math.hypot(nx, ny) > 0.7 ? 3 : 2.5));
        p.R(0, 0, 32, 3, P, 4.5); p.R(0, 0, 3, 32, P, 4); p.R(0, 29, 32, 3, P, 2);
        for (const [x, y] of [[9, 12], [20, 21], [14, 25], [23, 9]] as V2[]) { p.t(x, y, P, 5); p.t(x + 1, y + 1, P, 1.5); }
        p.R(6, 5, 5, 2, P, 5); p.glint(7, 6, 1);
      });
      return mat('sg:' + key, T, { rough: 0.45, emissive: c, ek: 0.28 });
    };
    b.add(rock(5, 0.25, [1.25, 0.6, 0.85], 12, 0.14), glass('green', '#4ab07a'), [-0.04, -0.13, 0.12], [0.6, 0.2, 0.2], 1, { smooth: 0.6 });
    b.add(rock(6, 0.2, [1.1, 0.65, 0.9], 11, 0.16), glass('blue', '#3a7ad8'), [-0.2, 0.17, -0.08], [0.5, 0.6, -0.4], 1, { smooth: 0.6 });
    b.add(rock(7, 0.17, [1.2, 0.6, 0.9], 10, 0.16), glass('amber', '#d8902a'), [0.25, 0.15, -0.02], [0.7, -0.4, 0.5], 1, { smooth: 0.6 });
  },

  // ---------------------------------------------------------------- a bent, square-cut nail, rusted through
  rustyNail(b) {
    const T = tx('nail', 48, 8, (p) => {
      p.all(PAL.rust, 2.5);
      for (let x = 0; x < 48; x += 7) { p.R(x, 0, 3, 8, PAL.iron, 2.5); p.t(x + 1, 2, PAL.iron, 4); }
      p.rust(10, 4, 3, 1); p.rust(30, 4, 3.5, 2); p.R(0, 0, 48, 1, PAL.rust, 4); p.R(0, 7, 48, 1, PAL.rust, 1);
      p.R(42, 0, 6, 8, PAL.iron, 3);
    });
    const m = mat('nail', T, { rough: 0.85, metal: 0.2 });
    const path: V3[] = [[0.32, 0.36, 0], [0.12, 0.13, 0.01], [0.0, -0.02, 0.03], [-0.05, -0.17, 0.02], [-0.18, -0.3, 0], [-0.33, -0.38, 0]];
    b.add(tube(path, (t) => (t < 0.72 ? 0.042 : 0.042 * Math.max(0.12, 1 - (t - 0.72) / 0.28)), { radial: 4, segs: 16 }), m);
    b.add(cyl(0.1, 0.045, 7, { ch: 0.012 }), mat('nailHead', tx('nailHead', 16, 16, (p) => { p.all(PAL.rust, 2.5); p.ellipse(8, 8, 6, 6, (nx, ny) => hexOf(PAL.rust, nx + ny < -0.3 ? 3.5 : 2)); p.rust(10, 9, 3, 4); }), { rough: 0.85, metal: 0.2 }), [0.335, 0.375, 0], [0, 0, 0.76]);
  },

  // ---------------------------------------------------------------- a pirate doubloon (the skull winks)
  doubloon(b) {
    const G = PAL.gold;
    const T = tx('doubloon', 48, 56, (p) => {
      p.all(G, 2.5);
      p.ellipse(24, 24, 24, 24, (nx, ny) => { const d = Math.hypot(nx, ny), l = -nx * 0.6 - ny * 0.8; return hexOf(G, d > 0.86 ? (l > 0.2 ? 4.5 : l < -0.2 ? 1.5 : 3) : d > 0.8 ? (l > 0 ? 1.5 : 4) : 2.5 + (l > 0.3 ? 0.5 : 0)); });
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; p.t(24 + Math.cos(a) * 17.5, 24 + Math.sin(a) * 17.5, G, 4); p.t(24 + Math.cos(a) * 17.5 + 1, 24 + Math.sin(a) * 17.5 + 1, G, 1); }
      // crossbones behind the skull
      for (let i = -9; i <= 9; i++) { for (const s of [1, -1]) { p.t(24 + i + 1, 26 + i * s + 1, G, 1); p.t(24 + i, 26 + i * s, G, 4); p.t(24 + i + 1, 26 + i * s, G, 4); } }
      for (const [x, y] of [[14, 16], [33, 16], [14, 35], [33, 35]] as V2[]) { p.dome(x + 1, y + 1, 2.2, 2.2, G, 4); }
      // the skull: dome, sockets (one winking), nose, teeth
      p.ellipse(25, 22, 8, 7.5, hexOf(G, 1)); p.ellipse(24, 21, 8, 7.5, (nx, ny) => hexOf(G, nx + ny < -0.4 ? 5 : 4));
      p.R(19, 27, 11, 4, G, 4); p.R(20, 31, 9, 1, G, 1); for (let x = 20; x < 29; x += 2) p.t(x, 29, G, 1.5);
      p.ellipse(21, 21, 2.2, 2.4, hexOf(G, 0.5)); p.R(25, 21, 5, 1, G, 0.5); p.t(24, 20, G, 1); p.t(30, 20, G, 1);
      p.t(24, 25, G, 1); p.t(25, 25, G, 1);
      p.glint(14, 10, 2);
      // the rim band: reeded
      for (let x = 0; x < 48; x++) p.R(x, 48, 1, 8, G, x % 2 ? 2 : 3.5);
      p.R(0, 48, 48, 1, G, 4.5); p.R(0, 55, 48, 1, G, 1);
    });
    const m = mat('doubloon', T, { rough: 0.3, metal: 0.6, emissive: '#6a3a04', ek: 0.18 });
    coin(b, m, T.r(0, 0, 48, 48), T.r(0, 48, 48, 8), { r: 0.36, h: 0.09, pos: [0.04, 0.05, 0.05], rot: [0, -0.18, 0], seed: 2 });
    coin(b, m, T.r(0, 0, 48, 48), T.r(0, 48, 48, 8), { r: 0.26, h: 0.07, pos: [-0.22, -0.3, -0.12], rot: [-1.15, 0.2, 0.3], seed: 5 });
  },

  // ---------------------------------------------------------------- copper nuggets breaking out of rock
  copperOre(b) {
    b.add(rock(3, 0.38, [1.15, 0.82, 0.95], 18, 0.2), mat('matrix:cu', matrixPage('cu', pal('#6e5e58'), 3), { rough: 0.9 }), [0, -0.06, 0]);
    const T = tx('copper', 32, 32, (p) => {
      p.all(PAL.copper, 3);
      p.R(0, 0, 32, 4, PAL.copper, 4.5); p.R(0, 0, 4, 32, PAL.copper, 4); p.R(0, 28, 32, 4, PAL.copper, 2); p.R(28, 0, 4, 32, PAL.copper, 2);
      p.ln(6, 14, 18, 18, PAL.copper, 1); p.ln(18, 18, 24, 26, PAL.copper, 1);
      p.rust(22, 9, 4, 3, PAL.patina); p.rust(9, 24, 3, 5, PAL.patina);
      p.R(8, 6, 6, 2, PAL.copper, 5); p.glint(9, 7, 1);
    });
    const cu = mat('copper', T, { rough: 0.35, metal: 0.55 });
    for (const [x, y, z, r, s] of [[0.08, 0.2, 0.16, 0.16, 31], [-0.22, 0.08, 0.22, 0.13, 32], [0.27, -0.04, 0.2, 0.12, 33], [-0.02, -0.12, 0.3, 0.11, 34], [-0.12, 0.27, -0.05, 0.1, 35]] as number[][]) {
      b.add(rock(s, r, [1, 0.85, 0.9], 9, 0.36), cu, [x, y, z], [s, s * 2, 0]);
    }
  },

  // ---------------------------------------------------------------- banded iron with cubic crystals
  ironOre(b) {
    const T = tx('bif', 48, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const yy = y + Math.sin(x * 0.25) * 1.6 + Math.sin(x * 0.07) * 2.5, band = Math.floor(yy / 4) % 3;
        p.t(x, y, band === 0 ? PAL.rust : band === 1 ? PAL.iron : pal('#6a3a32'), band === 0 ? 2 : band === 1 ? 2.5 : 3);
        if (Math.floor(yy) % 4 === 0) p.t(x, y, PAL.iron, 4);
      }
      p.ln(8, 6, 16, 20, PAL.ink, 1); p.ln(30, 30, 40, 44, PAL.ink, 1);
    });
    b.add(rock(9, 0.38, [1.2, 0.8, 0.95], 16, 0.22), mat('bif', T, { rough: 0.85 }), [0, -0.08, 0]);
    const X = tx('ironX', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.steel, { b: 3 }); p.panel(0, 0, 16, 16, PAL.steel, 3, { noFill: true }); p.R(9, 9, 4, 4, PAL.rust, 2.5); p.glint(4, 4, 1); });
    const m = mat('ironX', X, { rough: 0.3, metal: 0.65 });
    for (const [x, y, z, s, r] of [[0.02, 0.2, 0.12, 0.24, 0.3], [-0.2, 0.12, 0.2, 0.17, 0.9], [0.22, 0.06, 0.22, 0.15, 1.6], [0.08, -0.04, 0.3, 0.12, 2.3]] as number[][]) b.add(cbox(s, s, s, s * 0.08), m, [x, y, z], [r, r * 0.7, r * 0.4]);
  },

  // ---------------------------------------------------------------- a smooth grey pebble with a white quartz band
  riverStone(b) {
    const S = pal('#7a7a86');
    const T = tx('pebble', 48, 48, (p) => {
      p.all(S, 3);
      for (let x = 0; x < 48; x++) { const y = 22 + Math.round(Math.sin(x * 0.15) * 3 + x * 0.12); p.R(x, y - 3, 1, 5, PAL.white, 4); p.t(x, y - 3, PAL.white, 5); p.t(x, y + 2, S, 2); }
      for (const [x, y] of [[8, 8], [36, 12], [14, 36], [38, 38], [26, 6]] as V2[]) { p.t(x, y, S, 1.5); p.t(x + 2, y + 1, S, 1.5); p.t(x + 1, y + 3, S, 4); }
      p.R(6, 4, 8, 2, S, 4.5);
    });
    b.add(rock(7, 0.4, [1.25, 0.7, 0.9], 26, 0.07), mat('pebble', T, { rough: 0.55 }), [0, 0, 0], [0.2, 0.3, 0.15], 1, { smooth: 0.75 });
  },

  // ---------------------------------------------------------------- an amethyst cluster on a geode chip
  amethyst(b) {
    b.add(rock(4, 0.36, [1.25, 0.5, 0.95], 14, 0.2), mat('matrix:geo', matrixPage('geo', pal('#5a5660'), 4), { rough: 0.9 }), [0, -0.27, 0]);
    crystals(b, 'amethyst', PAL.amethyst, [[0, 0.04, 0.66, 0.12, 0, 0], [-0.17, 0.06, 0.46, 0.095, 0.45, 0.1], [0.19, 0.03, 0.52, 0.1, -0.42, 0], [0.06, 0.15, 0.3, 0.075, -0.15, 0.55], [-0.06, -0.12, 0.42, 0.08, 0.2, -0.45], [0.31, 0.09, 0.22, 0.06, -0.85, 0.2], [-0.3, 0.1, 0.2, 0.055, 0.9, 0.3]], -0.32, 0.2);
  },

  // ---------------------------------------------------------------- an emerald, step cut and smug about it
  emerald(b) {
    const E = PAL.emerald;
    const T = tx('emerald', 48, 56, (p) => {
      const oct = (i: number) => { const s = 1 - i * 0.16; return { w: 24 * s, h: 28 * s, c: 7 * s }; };
      for (let y = 0; y < 56; y++) for (let x = 0; x < 48; x++) {
        const dx = Math.abs(x + 0.5 - 24), dy = Math.abs(y + 0.5 - 28);
        let ring = 0;
        for (let i = 0; i < 6; i++) { const o = oct(i); if (dx < o.w && dy < o.h && dx + dy < o.w + o.h - o.c) ring = i; }
        const lit = (x < 24 ? 0.5 : -0.5) + (y < 28 ? 0.5 : -0.5);
        p.t(x, y, E, [2, 3.5, 2.5, 4, 3, 3.5][ring] + lit * (ring < 5 ? 0.5 : 0));
      }
      for (let i = 0; i < 10; i++) { p.t(16 + i, 18 + i, E, 5); p.t(17 + i, 18 + i, E, 4.5); }
      p.R(20, 24, 8, 1, E, 1.5); p.R(20, 31, 8, 1, E, 1.5);
      p.glint(14, 12, 2);
    });
    b.add(stepCut(0.27, 0.36, 0.09, 0.42), mat('emerald', T, { rough: 0.15, metal: 0.15, emissive: '#0e6e36', ek: 0.35 }), [0, 0, 0], [0.08, -0.2, 0.18]);
  },

  // ---------------------------------------------------------------- a lumpy gold nugget with a quartz crumb
  goldNugget(b) {
    const T = tx('gold', 32, 32, (p) => {
      p.all(PAL.gold, 3);
      p.R(0, 0, 32, 5, PAL.gold, 4); p.R(0, 0, 5, 32, PAL.gold, 4); p.R(0, 27, 32, 5, PAL.gold, 2); p.R(27, 0, 5, 32, PAL.gold, 2);
      p.ln(8, 20, 14, 16, PAL.gold, 1); p.ln(14, 16, 22, 18, PAL.gold, 1); p.ln(20, 6, 24, 12, PAL.gold, 1.5);
      p.R(6, 6, 5, 3, PAL.gold, 5); p.glint(8, 7, 1); p.glint(22, 22, 1);
    });
    const m = mat('gold', T, { rough: 0.28, metal: 0.65, emissive: '#7a4006', ek: 0.15 });
    b.add(rock(11, 0.27, [1.15, 0.85, 0.9], 11, 0.32), m, [0, 0.02, 0]);
    b.add(rock(12, 0.2, [1, 0.85, 0.9], 10, 0.34), m, [-0.24, -0.1, 0.05]);
    b.add(rock(13, 0.17, [1, 0.9, 0.9], 9, 0.34), m, [0.22, 0.12, -0.05]);
    b.add(rock(14, 0.1, [1, 0.8, 1], 8, 0.3), mat('quartz', tx('quartz', 16, 16, (p) => { p.all(PAL.white, 4); p.R(0, 12, 16, 4, PAL.white, 2.5); p.R(2, 2, 3, 2, PAL.white, 5); }), { rough: 0.5 }), [0.18, -0.17, 0.12]);
  },

  // ---------------------------------------------------------------- aquamarine: long flat-topped beryl prisms
  aquamarine(b) {
    const A = PAL.aqua;
    const T = tx('aqua', 24, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 24; x++) p.t(x, y, A, 2.5 + y / 48 * -0.5 + (y < 8 ? 1.5 : 0) + ([4, 10, 17].includes(x) ? -0.5 : [5, 11, 18].includes(x) ? 1 : 0));
      for (const [x, y, l] of [[7, 14, 6], [14, 26, 8], [20, 10, 5]] as V3[]) p.R(x, y, 1, l, A, 5);
      p.R(0, 0, 24, 2, A, 5); p.glint(5, 5, 1);
    });
    const m = mat('aqua', T, { rough: 0.15, metal: 0.1, emissive: '#127a8a', ek: 0.3 });
    b.add(prism(0.12, 0.92, 6, 0.06, { rTop: 0.1 }), m, [0.0, -0.42, 0.05], [0, 0.3, -0.55]);
    b.add(prism(0.09, 0.62, 6, 0.07, { rTop: 0.075 }), m, [-0.08, -0.38, -0.06], [0, 0.6, 0.5]);
    b.add(prism(0.06, 0.32, 6, 0.08, { rTop: 0.05 }), m, [0.1, -0.36, 0.1], [0.4, 0, -0.1]);
    b.add(rock(16, 0.18, [1.3, 0.6, 1], 10, 0.25), mat('feldspar', tx('feldspar', 24, 24, (p) => p.stone(0, 0, 24, 24, pal('#d8ccb8'), { cell: 7, seed: 3, cracks: 1 })), { rough: 0.85 }), [0, -0.38, 0]);
  },

  // ---------------------------------------------------------------- a brilliant-cut ruby on volcanic glass with lava cracks
  ruby(b) {
    const L = tx('basalt', 48, 48, (p) => {
      p.stone(0, 0, 48, 48, PAL.black, { cell: 11, seed: 7, cracks: 0, b: 3 });
      for (const [x0, y0, pts] of [[2, 30, [[8, -4], [16, -2], [24, -9], [32, -6], [44, -12]]], [10, 6, [[6, 8], [14, 10], [20, 18], [28, 22]]]] as [number, number, V2[]][]) {
        let x = x0, y = y0;
        for (const [dx, dy] of pts) { const nx = x0 + dx, ny = y0 + dy; p.ln(x, y, nx, ny, PAL.lava, 4); p.ln(x, y + 1, nx, ny + 1, PAL.lava, 2.5); p.ln(x, y - 1, nx, ny - 1, PAL.lava, 1.5); x = nx; y = ny; }
      }
    });
    b.add(rock(21, 0.36, [1.2, 0.72, 1], 15, 0.22), mat('basalt', L, { rough: 0.85, emissive: '#ff5a10', ek: 0.9 }), [0, -0.16, 0]);
    const T = tx('ruby', 40, 40, (p) => { p.facets(0, 0, 40, 40, PAL.ruby, 8); p.R(13, 13, 14, 14, PAL.ruby, 3.5); p.R(13, 13, 14, 1, PAL.ruby, 5); p.R(13, 26, 14, 1, PAL.ruby, 1.5); p.glint(11, 9, 2); });
    b.add(brilliant(0.27, 8), mat('ruby', T, { rough: 0.12, metal: 0.15, emissive: '#c01030', ek: 0.4 }), [0.02, 0.12, 0.14], [-0.35, 0.15, 0.2]);
  },

  // ---------------------------------------------------------------- an abyssal crystal spire, glowing from the core
  abyssCrystal(b) {
    const A = PAL.abyss;
    const T = tx('abyss', 32, 64, (p) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) { const c = Math.abs(x - 15.5); p.t(x, y, A, (c < 2 ? 4.5 : c < 5 ? 3.5 : 2) + (y < 10 ? 0.5 : y > 54 ? -1 : 0)); }
      for (let y = 6; y < 60; y += 11) { p.R(14, y, 4, 1, A, 5); p.R(15, y + 1, 2, 3, A, 5); p.R(13, y + 4, 6, 1, A, 5); }
      for (const x of [4, 26]) p.R(x, 0, 1, 64, A, 1);
      p.glint(9, 6, 1);
    });
    const m = mat('abyss', T, { rough: 0.2, metal: 0.1, emissive: '#3a5aff', ek: 1.0 });
    b.add(prism(0.17, 1.5, 6, 0.24, { rTop: 0.13 }), m, [0, -0.72, 0], [0.04, 0.4, -0.05]);
    b.add(prism(0.09, 0.72, 6, 0.3), m, [-0.17, -0.74, 0.05], [0.1, 0, 0.45]);
    b.add(prism(0.085, 0.58, 6, 0.3), m, [0.18, -0.74, 0.02], [0, 0.5, -0.5]);
    b.add(prism(0.06, 0.34, 5, 0.35), m, [0.06, -0.74, 0.16], [0.6, 0, -0.2]);
    b.add(rock(17, 0.3, [1.2, 0.45, 0.9], 12, 0.22), mat('abyssRock', tx('abyssRock', 32, 32, (p) => { p.stone(0, 0, 32, 32, PAL.black, { cell: 8, seed: 5, b: 3 }); p.ln(4, 20, 28, 12, PAL.purple, 4); p.ln(4, 21, 28, 13, PAL.purple, 2); }), { rough: 0.9, emissive: '#6a34aa', ek: 0.5 }), [0, -0.8, 0]);
    for (const [x, y, z, s, r] of [[0.32, 0.42, 0.08, 1, 0.5], [-0.3, 0.12, -0.04, 0.8, -0.7], [0.26, -0.1, 0.12, 0.6, 1.3]] as number[][]) b.add(bipyr(0.05 * s, 0.2 * s, 5, 0.4), m, [x, y, z], [r, r * 0.5, r]);
  },

  // ---------------------------------------------------------------- a serrated shark tooth (white crown, grey band, root)
  sharkTooth(b) {
    const out: V2[] = [];
    const edge = (x0: number, y0: number, x1: number, y1: number, n: number, side: number) => {
      for (let i = 0; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; out.push([x, y]); const t2 = (i + 0.5) / n; out.push([x0 + (x1 - x0) * t2 + side * 0.028, y0 + (y1 - y0) * t2 + 0.012]); }
    };
    edge(-0.31, -0.1, -0.02, 0.44, 7, -1);
    out.push([0.0, 0.47]);
    edge(0.03, 0.44, 0.31, -0.1, 7, 1);
    out.push([0.35, -0.2], [0.3, -0.38], [0.14, -0.31], [0.0, -0.25], [-0.14, -0.31], [-0.3, -0.38], [-0.35, -0.2]);
    const W = 40, H = 48, f = pageMap(out, W, H);
    const T = tx('tooth', W, H + 8, (p) => {
      p.all(PAL.sand, 2.5);
      p.poly(f.poly(out.slice(0, 31)), hexOf(PAL.bone, 4));
      p.poly(f.poly([[-0.31, -0.1], [-0.02, 0.44], [0.0, 0.47], [0.0, -0.1]]), hexOf(PAL.bone, 4.5));
      const [ax, ay] = f([0, 0.47]);
      p.ln(ax, ay + 2, ax, ay + 26, PAL.bone, 5); p.ln(ax + 1, ay + 4, ax + 1, ay + 26, PAL.bone, 3);
      for (let i = 0; i < 31; i += 2) { const [x, y] = f(out[i]); p.t(x, y, PAL.bone, 2); }
      const [, by] = f([0, -0.1]);
      for (let x = 0; x < W; x++) { const yy = by + Math.round(Math.abs(x - W / 2) * -0.25) + 2; p.R(x, yy, 1, 3, PAL.stone, 2.5); p.t(x, yy, PAL.stone, 4); }
      for (let y = by + 6; y < H; y += 3) for (let x = 6 + (y % 2) * 2; x < W - 6; x += 5) p.t(x, y, PAL.sand, 1);
      p.glint(Math.round(ax - 6), Math.round(ay + 12), 1);
      p.R(0, H, W, 8, PAL.bone, 3);
    });
    const g = warp(ext(out, 0.14, 0.035, { rects: { pz: T.r(0, 0, W, H), nz: T.r(0, 0, W, H), side: T.r(0, H, W, 8) } }), (v) => { v.z *= 1 - 0.55 * Math.abs(v.x) / 0.35; if (v.y > -0.1) v.z -= 0.16 * (v.y + 0.1) * (v.y + 0.1); });
    b.add(g, mat('tooth', T, { rough: 0.35 }), [0, 0, 0], [0.15, -0.2, -0.15]);
  },

  // ---------------------------------------------------------------- a twisted, sea-bleached branch
  driftwood(b) {
    const D = PAL.drift;
    const T = tx('drift', 96, 24, (p) => {
      p.wood(0, 0, 96, 24, D, { seed: 4, knots: 2, lines: 6 });
      p.holes([[20, 8], [52, 15], [70, 6], [84, 17]], D);
      p.R(0, 0, 3, 24, D, 1.5); p.R(93, 0, 3, 24, D, 1.5);
    });
    const m = mat('drift', T, { rough: 0.9 });
    b.add(tube([[-0.95, -0.12, 0], [-0.55, 0.0, 0.05], [-0.15, -0.06, -0.03], [0.25, 0.05, 0.04], [0.62, -0.02, 0], [0.95, 0.08, -0.02]], (t) => 0.15 * (0.7 + 0.3 * Math.sin(t * Math.PI)) * (1 + 0.16 * Math.sin(t * 19 + 1)), { radial: 6, segs: 22 }), m);
    b.add(tube([[0.18, 0.05, 0.02], [0.32, 0.22, 0.05], [0.42, 0.36, 0.02]], (t) => 0.085 - t * 0.04, { radial: 5, segs: 6, uv: [0.2, 0, 0.4, 1] }), m);
    b.add(tube([[-0.5, 0.02, 0.02], [-0.62, -0.18, 0.06], [-0.66, -0.3, 0.05]], (t) => 0.06 - t * 0.03, { radial: 5, segs: 5, uv: [0.5, 0, 0.7, 1] }), m);
    b.add(ball(0.07, 6, 4), m, [-0.25, 0.08, 0.09], [0, 0, 0], [1, 0.8, 0.6]);
  },

  // ---------------------------------------------------------------- a cracked spectacle lens in its wire rim
  glassLens(b) {
    const brass = mat('brassWire', tx('brassWire', 32, 8, (p) => { p.all(PAL.brass, 3); p.R(0, 1, 32, 2, PAL.brass, 4.5); p.R(0, 6, 32, 2, PAL.brass, 1.5); for (let x = 2; x < 32; x += 8) p.t(x, 2, PAL.brass, 5); }), { rough: 0.3, metal: 0.6 });
    b.add(torus(0.31, 0.035, 4, 18), brass, [0, 0, 0]);
    const G = tx('lens', 48, 48, (p) => {
      p.all(PAL.ice, 3.5);
      p.ellipse(24, 24, 22, 22, (nx, ny) => hexOf(PAL.ice, Math.hypot(nx, ny) > 0.85 ? 4.5 : 3.5));
      for (let i = 0; i < 16; i++) { p.t(8 + i, 26 - i, PAL.ice, 5); p.t(9 + i, 26 - i, PAL.ice, 5); p.t(12 + i, 32 - i, PAL.ice, 5); }
      const cx = 30, cy = 30;
      for (const [dx, dy, l] of [[1, -0.6, 16], [-1, -0.3, 18], [0.2, 1, 14], [-0.6, 0.8, 12], [1, 0.4, 13]] as V3[]) for (let i = 0; i < l; i++) { const x = cx + dx * i + Math.sin(i) * 0.6, y = cy + dy * i; p.t(x, y, PAL.white, 5); p.t(x + 1, y + 1, PAL.ice, 1.5); }
      p.ellipse(cx, cy, 2.5, 2.5, '#ffffff');
    });
    b.add(cyl(0.3, 0.045, 18, { ch: 0.012, side: G.r(0, 0, 48, 4), cap: G.r(0, 0, 48, 48) }), mat('lens', G, { rough: 0.1, metal: 0.1, opacity: 0.68, emissive: '#3a7aa0', ek: 0.35 }), [0, 0, 0], [Math.PI / 2, 0, 0]);
    // the bridge stub and a bent temple arm
    b.add(tube([[0.3, 0.08, 0], [0.38, 0.14, 0.02], [0.44, 0.13, 0.03]], 0.024, { radial: 4, segs: 5 }), brass);
    b.add(tube([[-0.28, 0.14, 0], [-0.4, 0.16, -0.06], [-0.45, 0.1, -0.28], [-0.42, -0.05, -0.36]], 0.022, { radial: 4, segs: 10 }), brass);
    b.add(hull([[0.16, -0.3, 0.01], [0.28, -0.24, 0.01], [0.2, -0.42, 0.0], [0.16, -0.3, -0.01], [0.28, -0.24, -0.01]]), mat('lens', G), [0.02, -0.06, 0.06], [0.3, 0, 0.4]);
  },

  // ---------------------------------------------------------------- a prickly bouquet of urchin spines tied with twine
  urchinSpine(b) {
    const P = PAL.purple;
    const T = tx('spine', 8, 32, (p) => {
      for (let y = 0; y < 32; y++) p.R(0, y, 8, 1, P, y < 6 ? 4.5 - y * 0.2 : (Math.floor(y / 4) % 2 ? 1.5 : 2.5));
      p.R(0, 0, 8, 2, P, 5); p.R(1, 0, 1, 32, P, 3.5);
    });
    const m = mat('spine', T, { rough: 0.45 });
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) * 0.16, l = 0.72 - Math.abs(i - 4) * 0.04 + (i % 2) * 0.06;
      b.add(cone(0.03, l, 4), m, [Math.sin(a) * l * 0.5, -0.3 + Math.cos(a) * l * 0.5, (i % 3 - 1) * 0.05], [(i % 3 - 1) * 0.25, 0, -a]);
    }
    b.add(ball(0.11, 8, 5, [0, 0, 1, 1]), mat('urchinTest', tx('urchinTest', 16, 16, (p) => { p.all(P, 2); for (let y = 2; y < 16; y += 4) for (let x = (y % 8 === 2 ? 0 : 2); x < 16; x += 4) { p.t(x, y, P, 4.5); p.t(x + 1, y + 1, P, 0.5); } }), { rough: 0.6 }), [0, -0.38, 0], [0, 0, 0], [1.3, 0.7, 1.1]);
    b.add(torus(0.07, 0.026, 4, 10), mat('twine', tx('twine', 32, 8, (p) => p.rope(0, 0, 32, 8, pal('#c8a46a'))), { rough: 0.9 }), [0, -0.2, 0], [Math.PI / 2, 0, 0]);
    b.add(tube([[0.05, -0.2, 0.07], [0.14, -0.27, 0.1], [0.2, -0.36, 0.08]], 0.016, { radial: 3, segs: 5 }), mat('twine', null));
  },

  // ---------------------------------------------------------------- a double-terminated mana crystal, floating, with chips
  manaCrystal(b) {
    const M2 = PAL.mana;
    const T = tx('mana', 24, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 24; x++) { const c = Math.abs(x - 11.5), e = Math.abs(y - 24) / 24; p.t(x, y, M2, (c < 2 ? 5 : c < 5 ? 4 : 3) - e * 1.5); }
      for (const y of [12, 24, 36]) p.R(4, y, 16, 1, M2, 4.5);
      p.glint(7, 10, 1);
    });
    const m = mat('mana', T, { rough: 0.15, metal: 0.1, emissive: '#5a6cf4', ek: 0.9 });
    b.add(bipyr(0.2, 0.86, 6, 0.32), m, [0, 0, 0], [0.1, 0.3, 0.28]);
    b.add(bipyr(0.06, 0.22, 5, 0.4), m, [0.3, 0.28, 0.05], [0.4, 0, -0.5]);
    b.add(bipyr(0.05, 0.18, 5, 0.4), m, [-0.28, -0.24, 0.1], [0.2, 0.4, 0.7]);
    b.add(torus(0.36, 0.012, 3, 20), mat('manaRing', tx('manaRing', 16, 4, (p) => { p.all(M2, 4); for (let x = 0; x < 16; x += 4) p.R(x, 0, 2, 4, M2, 5); }), { emissive: '#7aa8ff', ek: 1.2 }), [0, 0, 0], [1.25, 0.2, 0.3]);
  },

  // ---------------------------------------------------------------- scrap: a bent, riveted hull plate, a pipe stub, a bolt
  scrap(b) {
    const T = tx('scrap', 64, 32, (p) => {
      p.all(PAL.red, 2.5);
      p.R(0, 0, 64, 2, PAL.red, 3.5);
      p.R(0, 10, 64, 4, PAL.white, 4); p.R(0, 10, 64, 1, PAL.white, 5); p.R(0, 14, 64, 1, PAL.red, 1);
      for (const [x, y, w, h] of [[6, 18, 10, 6], [30, 4, 8, 5], [44, 20, 12, 7], [20, 26, 6, 4]] as number[][]) { p.R(x, y, w, h, PAL.steel, 3); p.R(x, y, w, 1, PAL.steel, 4.5); p.R(x, y + h - 1, w, 1, PAL.red, 1); }
      p.rust(50, 22, 4, 1); p.rust(12, 6, 3, 2); p.drip(51, 25, 6); p.drip(26, 15, 5);
      for (let x = 3; x < 64; x += 10) p.rivet(x, 26, PAL.iron);
      p.scratch(34, 22, 9, PAL.steel, 0.2);
    });
    const m = mat('scrap', T, { rough: 0.7, metal: 0.3 });
    const A: V2[] = [[-0.9, -0.3], [0.0, -0.33], [0.0, 0.3], [-0.6, 0.32], [-0.75, 0.22], [-0.92, 0.26]];
    b.add(ext(A, 0.05, 0.012, { rects: { pz: T.r(0, 0, 32, 32), side: T.r(0, 30, 64, 2) } }), m, [0.05, 0, 0], [0.05, 0.2, 0]);
    const Bp: V2[] = [[0, -0.33], [0.62, -0.3], [0.7, -0.18], [0.64, -0.05], [0.74, 0.08], [0.66, 0.2], [0.72, 0.3], [0, 0.3]];
    b.add(ext(Bp, 0.05, 0.012, { rects: { pz: T.r(32, 0, 32, 32), side: T.r(0, 30, 64, 2) } }), m, [0.05, 0, 0], [0.05, -0.55, 0]);
    const iron = mat('mp:ironParts', tx('ironParts', 32, 16, (p) => { p.metal(0, 0, 32, 16, PAL.iron, { b: 3 }); p.rust(8, 8, 4, 2); p.R(0, 0, 32, 1, PAL.iron, 5); }), { rough: 0.6, metal: 0.4 });
    for (let i = 0; i < 4; i++) b.add(cyl(0.035, 0.03, 6), iron, [-0.8 + i * 0.22, -0.24 + 0.012 * i, 0.1], [Math.PI / 2 + 0.05, 0, 0]);
    b.add(cyl(0.09, 0.42, 8, { ch: 0.01 }), iron, [-0.35, 0.32, 0.12], [0, 0, 1.35]);
    b.add(cyl(0.12, 0.05, 8), iron, [-0.15, 0.35, 0.12], [0, 0, 1.35]);
    b.add(cyl(0.065, 0.06, 6), iron, [0.5, -0.12, 0.08], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.028, 0.2, 5), iron, [0.5, -0.12, 0.15], [Math.PI / 2, 0, 0]);
  },

  // ---------------------------------------------------------------- a cockle shell: ribs, bands, growth lines
  seashell(b) {
    const S = PAL.shell;
    const T = tx('cockle', 36, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 36; x++) {
        const rib = x % 2 ? 4 : 2.5, band = Math.floor((31 - y) / 5) % 2 ? 0 : -0.5;
        p.t(x, y, (Math.floor((31 - y) / 7) % 2) ? S : PAL.orange, rib + band);
      }
      for (let y = 4; y < 32; y += 5) p.R(0, y, 36, 1, S, 1.5);
      p.R(0, 0, 36, 2, PAL.leather, 2);
      p.R(0, 28, 36, 4, PAL.purple, 2.5);
    });
    const I = tx('cockleIn', 16, 16, (p) => { p.all(PAL.bone, 4.5); p.R(0, 10, 16, 6, PAL.purple, 3); p.rings(8, 16, 14, PAL.bone, 3, 4); });
    fanShell(b, mat('cockle', T, { rough: 0.6 }), mat('cockleIn', I, { rough: 0.5 }), { R: 0.8, spread: 1.15, ribs: 9, dome: 0.24, rib: 0.035, pos: [0, -0.4, 0], rot: [0.15, 0, 0] });
  },
};

// ------------------------------------------------------------------ helpers
function leadPage() {
  return tx('lead', 32, 32, (p) => {
    p.all(PAL.lead, 3);
    for (let y = 0; y < 32; y += 6) p.R(0, y, 32, 1, PAL.lead, 2.5);
    p.R(0, 0, 32, 4, PAL.lead, 4); p.R(0, 26, 32, 6, PAL.lead, 2);
    for (const [x, y] of [[8, 12], [11, 12], [22, 18], [25, 18]] as V2[]) { p.t(x, y, PAL.lead, 1); p.t(x, y + 1, PAL.lead, 4.5); }
    p.scratch(4, 8, 7, PAL.lead, 0.25); p.scratch(18, 24, 6, PAL.lead, -0.2);
    p.R(5, 5, 4, 2, PAL.lead, 5);
  });
}
/** a palette tone as an RGB for ellipse / poly callbacks */
function hexOf(p: Pal, t: number) { return tcRGB(p, t); }
import { tc as tcRGB } from './paint';

/** crystal points rising from a base: [x, z, h, r, tiltZ, tiltX] */
function crystals(b: import('./kit').B, key: string, P: Pal, cs: number[][], base: number, glow: number) {
  const T = tx('xtal:' + key, 32, 48, (p: Pt) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.t(x, y, P, y > 40 ? 1.5 : y > 28 ? 2.5 : y > 12 ? 3 : 4);
    for (const x of [5, 13, 21, 28]) p.R(x, 10, 1, 34, P, 2);
    for (let i = 0; i < 8; i++) { p.t(8 + i, 8 + i, P, 5); p.t(23 - i, 8 + i, P, 5); }
    p.R(0, 0, 32, 3, P, 5); p.glint(7, 5, 1);
  });
  const m = mat('xtal:' + key, T, { rough: 0.15, metal: 0.1, emissive: P[3], ek: glow });
  for (const [x, z, h, r, tz, tx2] of cs) b.add(prism(r, h, 6, 0.3, { rTop: r * 0.92 }), m, [x, base, z], [tx2, x * 3, tz]);
}
void cbox; void TAU;
