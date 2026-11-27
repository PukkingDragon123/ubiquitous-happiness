// v8 CRITTER LOOT: the hermit crabs' and sea slugs' things. A recipe scroll sealed with a claw print, a spare whelk,
// shell armour laced from three shells, a slug-ink bomb, a kelp pearl pouch spilling pearls, a carved sea bunny charm,
// a nudibranch lure on a hook, and the giant hermit's knobbed triton with its barnacles and anemone.
import * as THREE from 'three';
import { B, mat, cbox, hull, cyl, cone, tube, ext, ball, warp, torus, lathe, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, tc, type Pal } from './paint';
import { S } from './shared';
import type { Build } from './types';

const rgb = (p: Pal, t: number) => tc(p, t);

/** a spindle shell (spire up, body whorl, canal down) with whorl steps carved along a helix; returns the group */
function spindle(b: B, key: string, base: Pal, band: Pal, o: { pos?: V3; rot?: V3; scl?: number; knobs?: number; turns?: number; lip?: Pal } = {}) {
  const turns = o.turns ?? 4.2;
  const T = tx('spindle:' + key, 48, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const k = (((x / 48) - (1 - y / 48) * turns) % 1 + 1) % 1;
      p.t(x, y, base, k < 0.08 ? 1.5 : k < 0.22 ? 4.5 : k > 0.8 ? 3 : 4);
      if (k > 0.34 && k < 0.5) p.t(x, y, band, 3);
      if (k > 0.55 && k < 0.7 && (x + Math.floor(y / 3)) % 6 === 0) p.t(x, y, band, 2);
    }
    p.R(0, 42, 48, 6, base, 3);
  });
  const prof: V2[] = [[0, -0.62], [0.05, -0.56], [0.1, -0.36], [0.27, -0.12], [0.31, 0.04], [0.26, 0.2], [0.18, 0.36], [0.1, 0.5], [0.0, 0.66]];
  const kn = o.knobs ?? 0;
  const g = warp(lathe(prof, 14, { side: T.r(0, 0, 48, 48) }), (v) => {
    const a = Math.atan2(v.x, v.z) / TAU, t = ((a - (v.y + 0.62) / 1.28 * turns) % 1 + 1) % 1;
    let k = 1 + 0.16 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) - 0.08;
    if (kn) k += kn * Math.pow(Math.max(0, Math.sin(Math.atan2(v.x, v.z) * 5)), 4) * Math.max(0, 1 - Math.abs(v.y - 0.02) * 3);
    v.x *= k; v.z *= k;
  });
  const sh = b.sub(o.pos ?? [0, 0, 0], o.rot ?? [0.3, 0.6, 0.55], o.scl ?? 1);
  sh.add(g, mat('spindle:' + key, T, { rough: 0.55 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.5 });
  const L = tx('spLip:' + key, 16, 32, (p) => { const lp = o.lip ?? PAL.pink; p.all(lp, 4); p.R(5, 4, 6, 24, lp, 2); p.R(6, 6, 3, 18, lp, 1.5); p.R(1, 2, 2, 20, PAL.white, 5); });
  const lip: V2[] = [[0, 0.24], [0.14, 0.18], [0.2, 0.0], [0.17, -0.24], [0.08, -0.46], [0.0, -0.5], [-0.05, -0.3], [-0.04, 0.0]];
  sh.add(ext(lip, 0.05, 0.015, { rects: L.r(0, 0, 16, 32) }), mat('spLip:' + key, L, { rough: 0.3 }), [0.12, -0.06, 0.24], [0, -0.35, 0]);
  return sh;
}

/** a glossy moon-snail globe: a fat spiral with a chestnut band, the violet callus by the mouth */
function moonBall(b: B, pos: V3, r: number, rot: V3 = [0, 0, 0]) {
  const T = tx('moonGlobe', 48, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const dx = x - 24, dy = y - 24, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      // the spiral suture seen from above: a line winding in to the apex
      const s = ((a / TAU + d / 9) % 1 + 1) % 1;
      let t = d < 4 ? 5 : 4 - d / 24;
      if (s < 0.06) t = 1.5;
      p.t(x, y, PAL.sand, t);
      if (s > 0.4 && s < 0.5 && d > 6) p.t(x, y, PAL.leather, 3);
    }
    p.glint(16, 14, 1);
  });
  const g = b.sub(pos, rot);
  g.add(ball(r, 12, 9), mat('moonGlobe', T, { rough: 0.35 }), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.92], { smooth: 1.1 });
  g.add(ball(r * 0.42, 8, 6), mat('moonCallus', tx('moonCallus', 8, 8, (p) => { p.all(PAL.purple, 2); p.R(1, 1, 3, 2, PAL.purple, 4); }), { rough: 0.3 }), [r * 0.55, -r * 0.55, r * 0.45], [0, 0, 0], [1, 0.8, 0.5], { smooth: 1 });
  return g;
}

export const CRITTER_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- a rolled kelp-paper scroll, a red claw-print seal, twine
  recipeScroll(b) {
    const P = tx('hScroll', 64, 32, (p) => {
      p.all(PAL.paper, 4);
      for (let x = 0; x < 64; x += 8) p.R(x, 0, 1, 32, PAL.paper, 3.5);
      p.R(0, 0, 64, 2, PAL.paper, 5); p.R(0, 29, 64, 3, PAL.paper, 2.5);
      // ink: a little hermit crab drawing and recipe lines
      p.ellipse(14, 15, 6, 5, (nx, ny) => (Math.hypot(nx, ny) > 0.75 ? rgb(PAL.ink, 1.5) : null));
      p.ln(9, 18, 6, 22, PAL.ink, 1.5); p.ln(12, 19, 11, 23, PAL.ink, 1.5); p.ln(19, 17, 22, 13, PAL.ink, 1.5);
      for (let i = 0; i < 4; i++) p.ln(28, 8 + i * 5, 54 - (i % 2) * 8, 8 + i * 5, PAL.ink, 2);
      p.R(28, 24, 4, 3, PAL.red, 3);
    });
    const paper = mat('hScroll', P, { rough: 0.9 });
    const g = b.sub([0, 0, 0], [0.1, 0.2, 0.62]);
    g.add(cyl(0.17, 0.9, 10, { side: P.r(0, 0, 64, 32), cap: P.r(0, 28, 8, 4) }), paper, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.8 });
    g.add(cyl(0.12, 0.92, 10, { side: P.r(40, 0, 24, 32) }), paper, [0.08, 0, 0.08]);
    // the unrolled tongue hanging off one side with the ink on it
    const tongue = warp(cbox(0.5, 0.02, 0.62, 0.008, P.r(0, 0, 64, 32)), (v) => { v.y -= v.x * v.x * 0.4; });
    g.add(tongue, paper, [0.36, -0.12, 0.05], [0.2, 0, -0.5]);
    // the twine and the claw-print seal
    g.add(torus(0.18, 0.025, 4, 12), S.twine(), [0, 0.12, 0], [Math.PI / 2, 0, 0]);
    const W = tx('clawSeal', 16, 16, (p) => {
      p.ellipse(8, 8, 8, 8, (nx, ny) => rgb(PAL.red, Math.hypot(nx, ny) > 0.82 ? 2 : nx + ny < -0.5 ? 4.5 : 3.5));
      p.ln(5, 11, 7, 5, PAL.red, 1.5); p.ln(7, 5, 10, 7, PAL.red, 1.5); p.ln(10, 7, 9, 11, PAL.red, 1.5);
    });
    g.add(cyl(0.11, 0.04, 9, { side: W.r(0, 7, 16, 2), cap: W.r(0, 0, 16, 16) }), mat('clawSeal', W, { rough: 0.35 }), [0.0, 0.12, 0.17], [Math.PI / 2, 0, 0]);
  },

  // ---------------------------------------------------------------- a small cream-and-orange whelk with a pink mouth
  spareShell(b) {
    spindle(b, 'spare', PAL.bone, PAL.orange, { rot: [0.25, 0.5, 0.7], scl: 1.05 });
  },

  // ---------------------------------------------------------------- shell armour: a moon snail boss flanked by two whelks, laced on leather
  shellArmor(b) {
    const Lt = tx('shellStrap', 32, 16, (p) => { p.all(PAL.leather, 3); p.R(0, 0, 32, 2, PAL.leather, 4.5); p.R(0, 14, 32, 2, PAL.leather, 1.5); p.stitch(1, 3, 30, 3); p.stitch(1, 12, 30, 12); });
    const leather = mat('shellStrap', Lt, { rough: 0.8 });
    // the leather backing: a rounded shield shape
    const back: V2[] = [[-0.82, 0.5], [-0.4, 0.78], [0.4, 0.78], [0.82, 0.5], [0.86, -0.2], [0.5, -0.74], [0, -0.86], [-0.5, -0.74], [-0.86, -0.2]];
    b.add(ext(back, 0.1, 0.04, { rects: Lt.r(0, 0, 32, 16) }), leather, [0, 0, -0.12]);
    // shoulder straps with buckles
    for (const s of [-1, 1]) {
      b.add(cbox(0.18, 0.5, 0.06, 0.02, Lt.r(0, 0, 32, 16)), leather, [s * 0.52, 0.78, -0.1], [0, 0, s * 0.25]);
      b.add(torus(0.07, 0.018, 4, 8), S.brass(), [s * 0.58, 0.95, -0.04], [0, 0, 0]);
    }
    moonBall(b, [0, -0.05, 0.12], 0.46, [0.2, 0, 0]);
    spindle(b, 'armL', PAL.bone, PAL.leather, { pos: [-0.62, 0.0, 0.05], rot: [0.2, 0.4, 0.35], scl: 0.62 });
    spindle(b, 'armR', PAL.bone, PAL.coral, { pos: [0.62, 0.02, 0.05], rot: [0.2, -0.4, -0.35], scl: 0.62 });
    // kelp lacing criss-crossed between them
    const kelpT = mat('lacing', tx('lacing', 16, 8, (p) => p.rope(0, 0, 16, 8, PAL.kelp, { pitch: 3 })), { rough: 0.8 });
    for (const s of [-1, 1]) {
      b.add(tube([[s * 0.2, 0.36, 0.38], [s * 0.42, 0.22, 0.3], [s * 0.62, 0.32, 0.24]], 0.025, { radial: 4, segs: 6 }), kelpT);
      b.add(tube([[s * 0.2, -0.4, 0.38], [s * 0.42, -0.28, 0.3], [s * 0.6, -0.34, 0.24]], 0.025, { radial: 4, segs: 6 }), kelpT);
    }
  },

  // ---------------------------------------------------------------- a slug-ink bomb: a violet puffer skin full of ink, spines, a fuse
  slugInk(b) {
    const V = pal('#6a2a9a');
    const T = tx('slugInk', 48, 32, (p) => {
      for (let y = 0; y < 32; y++) p.R(0, y, 48, 1, V, y < 6 ? 4 : y > 24 ? 1.5 : 2.5);
      // nudibranch spots: orange rims round white dots in a neat lattice
      for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { const x = 4 + i * 8 + (j % 2) * 4, y = 4 + j * 7; p.dome(x, y, 2.2, 2.2, PAL.orange, 3); p.t(x, y, PAL.white, 5); }
      p.R(6, 3, 5, 2, PAL.white, 5);
    });
    const skin = mat('slugInk', T, { rough: 0.3, emissive: '#3a1868', ek: 0.4 });
    b.add(ball(0.4, 12, 9), skin, [0, -0.08, 0], [0, 0, 0], 1, { smooth: 1.1 });
    const sp = mat('inkSpine', tx('inkSpine', 8, 16, (p) => { p.all(PAL.orange, 3.5); p.R(0, 0, 8, 5, PAL.white, 4.5); p.R(0, 12, 8, 4, V, 2); }), { rough: 0.5 });
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996, y = 1 - (2 * (i + 0.5)) / 14, rr = Math.sqrt(1 - y * y);
      const n: V3 = [Math.cos(a) * rr, y, Math.sin(a) * rr];
      if (n[1] > 0.85) continue;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
      const e = new THREE.Euler().setFromQuaternion(q);
      b.add(cone(0.05, 0.2, 4), sp, [n[0] * 0.44, -0.08 + n[1] * 0.44, n[2] * 0.44], [e.x, e.y, e.z]);
    }
    // the cork stopper and a twisted fuse with a spark
    b.add(cyl(0.1, 0.12, 8, { rTop: 0.12 }), mat('inkCork', tx('inkCork', 16, 8, (p) => { p.all(PAL.cloth, 4); for (let i = 0; i < 6; i++) p.t(i * 3, 3, PAL.cloth, 2.5); }), { rough: 0.9 }), [0, 0.36, 0]);
    b.add(tube([[0, 0.42, 0], [0.06, 0.56, 0.02], [0.16, 0.62, 0.0], [0.24, 0.58, 0.02]], 0.022, { radial: 4, segs: 8 }), S.twine());
    b.add(ball(0.05, 6, 4), mat('inkSpark', tx('inkSpark', 4, 4, (p) => p.all(PAL.yellow, 5)), { emissive: '#ffcc44', ek: 1.2 }), [0.25, 0.58, 0.02]);
    // a drip of ink
    b.add(lathe([[0, -0.07], [0.05, -0.04], [0.05, 0.0], [0.02, 0.05], [0, 0.08]], 6), mat('inkDripV', tx('inkDripV', 8, 8, (p) => { p.all(V, 1.5); p.R(1, 1, 2, 2, V, 4.5); }), { rough: 0.1 }), [-0.24, -0.5, 0.12], [0, 0, 0], 1, { smooth: 1.2 });
  },

  // ---------------------------------------------------------------- a kelp-leather drawstring purse spilling pearls
  pearlPouch(b) {
    const K = tx('pouch', 32, 32, (p) => {
      p.all(PAL.kelp, 3);
      for (let y = 0; y < 32; y += 4) p.R(0, y, 32, 1, PAL.kelp, 2);
      for (let x = 2; x < 32; x += 6) p.R(x, 0, 1, 32, PAL.kelp, 3.5);
      p.R(0, 0, 32, 5, PAL.kelp, 4);
      p.creases(0, 8, 32, 22, PAL.kelp, 5, 3, 3);
    });
    const kelp = mat('pouch', K, { rough: 0.8 });
    b.add(lathe([[0, -0.46], [0.24, -0.42], [0.38, -0.24], [0.4, -0.02], [0.3, 0.16], [0.16, 0.26], [0.2, 0.34], [0.26, 0.42], [0, 0.4]], 12, { side: K.r(0, 0, 32, 32) }), kelp, [-0.08, -0.04, 0], [0, 0, 0.12], 1, { smooth: 0.9 });
    b.add(torus(0.17, 0.03, 4, 10), S.rope(), [-0.05, 0.27, 0], [Math.PI / 2, 0, 0.12]);
    b.add(tube([[0.1, 0.27, 0.12], [0.2, 0.12, 0.2], [0.24, -0.06, 0.2]], 0.02, { radial: 4, segs: 6 }), S.rope());
    b.add(ball(0.045, 6, 4), S.brass(), [0.24, -0.08, 0.2]);
    const pearl = mat('pouchPearl', tx('pouchPearl', 16, 16, (p) => { p.nacre(0, 0, 16, 16, 3.5); p.R(3, 3, 3, 2, PAL.white, 5); }), { rough: 0.2 });
    for (const [x, y, z, r] of [[0.3, 0.42, 0.06, 0.1], [0.42, 0.28, 0.2, 0.09], [0.5, -0.36, 0.22, 0.1], [0.38, -0.46, -0.04, 0.08]] as [number, number, number, number][]) b.add(ball(r, 9, 7), pearl, [x, y, z], [0, 0, 0], 1, { smooth: 1.2 });
  },

  // ---------------------------------------------------------------- a sea bunny carved in pale pumice on a twine loop
  bunnyCharm(b) {
    const F = tx('bunnyFur', 32, 32, (p) => {
      p.all(PAL.paper, 4.5);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { if ((x + (y % 2) * 2) % 4 === 0 && y % 2 === 0) p.t(x, y, PAL.paper, 5); }
      for (const [x, y] of [[6, 10], [14, 6], [22, 12], [10, 20], [24, 22], [17, 15]]) p.R(x, y, 2, 2, PAL.ink, 0.5);
      p.R(0, 26, 32, 6, PAL.yellow, 4);
    });
    const fur = mat('bunnyFur', F, { rough: 0.95 });
    b.add(ball(0.36, 12, 9), fur, [0, -0.12, 0], [0, 0, 0], [1.25, 0.82, 0.9], { smooth: 1.2 });
    // little papillae for the fuzz
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39996, y = 0.15 + (i / 22) * 0.85, rr = Math.sqrt(1 - y * y);
      b.add(cone(0.03, 0.07, 3), fur, [Math.cos(a) * rr * 0.44, -0.12 + y * 0.29, Math.sin(a) * rr * 0.32], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6 * rr]);
    }
    // the two black-tipped ears and the white gill tuft (the tail)
    const E = tx('bunnyEar', 32, 8, (p) => { p.all(PAL.paper, 4.5); for (let x = 2; x < 20; x += 3) p.R(x, 0, 1, 8, PAL.yellow, 3); p.R(21, 0, 11, 8, PAL.ink, 1); p.R(21, 0, 11, 3, PAL.ink, 2.5); });
    for (const s of [-1, 1]) b.add(tube([[0.26, 0.1, s * 0.12], [0.32, 0.3, s * 0.16], [0.3 + s * 0.03, 0.5, s * 0.2]], (t) => 0.075 * (1 - t * 0.4), { radial: 6, segs: 6, uv: E.r(0, 0, 32, 8) }), mat('bunnyEar', E, { rough: 0.8 }));
    const G = mat('bunnyTail', tx('bunnyTail', 8, 8, (p) => { p.all(PAL.white, 5); p.R(0, 5, 8, 3, PAL.white, 3.5); }), { rough: 0.9 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(cone(0.035, 0.14, 3), G, [-0.38 + Math.cos(a) * 0.03, 0.02, Math.sin(a) * 0.05], [Math.sin(a) * 0.5, 0, 0.6 + Math.cos(a) * 0.3]); }
    // the twine loop and a bead
    b.add(torus(0.12, 0.018, 4, 10), S.twine(), [0.0, 0.32, 0], [0, 0, 0]);
    b.add(ball(0.06, 7, 5), mat('bunnyBead', tx('bunnyBead', 8, 8, (p) => { p.all(PAL.aqua, 3.5); p.R(1, 1, 3, 2, PAL.aqua, 5); }), { rough: 0.2 }), [0, 0.18, 0.02]);
  },

  // ---------------------------------------------------------------- a nudibranch lure on a J hook: orange rhinophores, blue body, gills
  nudiBait(b) {
    const N = tx('nudiLure', 48, 16, (p) => {
      for (let y = 0; y < 16; y++) p.R(0, y, 48, 1, PAL.purple, y < 4 ? 4.5 : y > 12 ? 2 : 3.5);
      p.R(0, 5, 48, 1, PAL.ink, 0.5); p.R(0, 10, 48, 1, PAL.ink, 0.5);
      p.R(0, 0, 48, 2, PAL.white, 5); p.R(0, 14, 48, 2, PAL.yellow, 4.5);
    });
    const body = mat('nudiLure', N, { rough: 0.35, emissive: '#2a1a6a', ek: 0.3 });
    b.add(tube([[-0.42, -0.02, 0], [-0.2, 0.06, 0], [0.1, 0.06, 0], [0.38, -0.02, 0]], (t) => 0.13 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.94)), 0.6), { radial: 8, segs: 12, uv: N.r(0, 0, 48, 16) }), body, [0, -0.08, 0], [0, 0, 0], 1, { smooth: 0.9 });
    const O = mat('nudiOrange', tx('nudiOrange', 8, 16, (p) => { p.all(PAL.orange, 3.5); for (let y = 2; y < 16; y += 3) p.R(0, y, 8, 1, PAL.orange, 2); p.R(0, 0, 8, 2, PAL.yellow, 5); }), { rough: 0.5 });
    for (const s of [-1, 1]) b.add(tube([[0.26, 0.06, s * 0.05], [0.3, 0.2, s * 0.07], [0.32, 0.3, s * 0.08]], (t) => 0.035 * (1 - t * 0.5), { radial: 5, segs: 5 }), O);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(cone(0.03, 0.16, 3), O, [-0.24 + Math.cos(a) * 0.04, 0.08, Math.sin(a) * 0.04], [Math.sin(a) * 0.5, 0, 0.3 + Math.cos(a) * 0.4]); }
    // the J hook through it: a steel shank down from an eye, the bend and a barbed point
    b.add(torus(0.05, 0.016, 4, 8), S.wire(), [0.02, 0.5, 0], [0, 0, 0]);
    b.add(tube([[0.02, 0.45, 0], [0.02, 0.05, 0.0], [0.0, -0.34, 0], [-0.16, -0.46, 0], [-0.3, -0.36, 0], [-0.32, -0.2, 0]], 0.02, { radial: 4, segs: 12 }), S.point());
    b.add(hull([[-0.32, -0.2, 0.02], [-0.32, -0.2, -0.02], [-0.3, -0.12, 0], [-0.26, -0.24, 0]]), S.point());
    b.add(cyl(0.035, 0.04, 6), S.thread(), [0.02, 0.36, 0]);
  },

  // ---------------------------------------------------------------- the giant hermit's triton: knobbed, barnacled, an anemone on top
  giantShell(b) {
    const g = spindle(b, 'giant', PAL.sand, PAL.leather, { pos: [0, -0.05, 0], rot: [0.25, 0.45, 0.95], scl: 1.55, knobs: 0.12, turns: 4.6, lip: PAL.orange });
    const bar = mat('barnacle', tx('barnacle', 16, 16, (p) => { p.all(PAL.stone, 4); for (let x = 0; x < 16; x += 3) p.R(x, 0, 1, 16, PAL.stone, 3); p.R(0, 0, 16, 4, PAL.white, 4.5); p.R(6, 0, 4, 2, PAL.stone, 2); }), { rough: 0.9 });
    for (const [x, y, z, r] of [[0.18, 0.12, 0.22, 0.06], [0.08, 0.26, 0.2, 0.05], [0.24, -0.02, 0.18, 0.045], [-0.06, 0.18, 0.24, 0.04]] as [number, number, number, number][]) g.add(cyl(r, r * 1.2, 6, { rTop: r * 0.5 }), bar, [x, y, z], [Math.PI / 2 - 0.4, 0, 0]);
    const an = mat('anemone', tx('anemone', 8, 16, (p) => { for (let y = 0; y < 16; y++) p.R(0, y, 8, 1, PAL.pink, y < 4 ? 5 : y < 10 ? 4 : 3); }), { rough: 0.6 });
    const top = g.sub([0.02, 0.2, 0.2], [0.9, 0, -0.2], 0.7);
    top.add(cyl(0.08, 0.16, 8, { rTop: 0.1 }), an);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; top.add(tube([[Math.cos(a) * 0.07, 0.08, Math.sin(a) * 0.07], [Math.cos(a) * 0.15, 0.16, Math.sin(a) * 0.15], [Math.cos(a) * 0.2, 0.14 + (i % 2) * 0.05, Math.sin(a) * 0.2]], 0.022, { radial: 4, segs: 5 }), an); }
  },
};
