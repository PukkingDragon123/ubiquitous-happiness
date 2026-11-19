// GEAR: weapons, armour and hats (the blobfish wears these, but in the pack they are full-size loot): wand, coral staff,
// kelp robe, wizard hat, cutlass, bronze sword, chainmail, turtle plate, plumed helm, cape, trident, tide crown, toy
// pack, pipe wrench, goggles, scuba tank, stingray dagger, eel-skin hood.
import * as THREE from 'three';
import { B, mat, cbox, cyl, cone, tube, ext, ball, surf, warp, torus, lathe, bipyr, frontUV, oval, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, tc, type Pal, type Tx } from './paint';
import { pageMap, brilliant } from './parts';
import { S } from './shared';
import type { Build } from './types';
import { hash2 } from '../../core/math';

const rgb = (p: Pal, t: number) => tc(p, t);

/** a garment laid flat (robe, mail shirt): an outline with soft folds; the front page is painted over the outline */
function garment(b: B, out: V2[], T: Tx, m: THREE.Material, depth = 0.14, folds = 0.05) {
  b.add(warp(ext(out, depth, depth * 0.35, { rects: { pz: T.r(0, 0, T.w, T.h), nz: T.r(0, 0, T.w, T.h), side: T.r(0, 0, T.w, 4) } }), (v) => { v.z += Math.sin(v.x * 9 + v.y * 2) * folds * (v.z > 0 ? 1 : 0.5); }), m);
}
/** an extruded blade with a raised midline (thicker along the spine), facing +z */
function blade(out: V2[], depth: number, T: Tx, rect: [number, number, number, number], spineY = 0) {
  return warp(ext(out, depth, depth * 0.3, { rects: { pz: T.r(...rect), nz: T.r(...rect), side: T.r(rect[0], rect[1] + rect[3] - 2, rect[2], 2) } }), (v) => { v.z *= Math.max(0.35, 1 - Math.abs(v.y - spineY) * 4); });
}

export const GEAR_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- a driftwood wand, a mana crystal lashed to the tip, sparkles
  apprenticeWand(b) {
    const W = tx('wandWood', 64, 12, (p) => { p.wood(0, 0, 64, 12, PAL.drift, { seed: 5, knots: 2, lines: 3 }); p.R(0, 0, 18, 12, PAL.leather, 3); for (let x = 1; x < 18; x += 3) p.R(x, 0, 1, 12, PAL.leather, 1.5); p.R(0, 1, 18, 1, PAL.leather, 4.5); });
    b.add(tube([[-0.95, -0.12, 0], [-0.5, -0.06, 0.02], [-0.05, 0.0, -0.02], [0.4, 0.06, 0.02], [0.7, 0.1, 0]], (t) => 0.075 - t * 0.03 + Math.sin(t * 20) * 0.006, { radial: 6, segs: 16, uv: W.r(0, 0, 64, 12) }), mat('wandWood', W, { rough: 0.8 }));
    b.add(ball(0.05, 6, 4), mat('wandWood', W), [-0.2, -0.02, 0.06]);
    const M2 = PAL.mana;
    const C = tx('wandCrystal', 16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.t(x, y, M2, Math.abs(x - 7.5) < 2 ? 5 : 3.5 - Math.abs(y - 16) / 16); p.glint(5, 8, 1); });
    b.add(bipyr(0.1, 0.42, 6, 0.35), mat('wandCrystal', C, { rough: 0.15, emissive: '#5a6cf4', ek: 1.0 }), [0.84, 0.13, 0], [0, 0, -1.35]);
    b.add(cyl(0.065, 0.12, 6), S.twine(), [0.66, 0.1, 0], [0, 0, -1.4]);
    const sp = mat('sparkle', tx('sparkle', 8, 8, (p) => { p.all(M2, 5); p.R(3, 0, 2, 8, PAL.white, 5); p.R(0, 3, 8, 2, PAL.white, 5); }), { emissive: '#b0c8ff', ek: 1.6 });
    for (const [x, y, s] of [[1.0, 0.35, 1], [0.78, 0.4, 0.7], [1.08, -0.05, 0.6]] as V3[]) { b.add(bipyr(0.025 * s, 0.14 * s, 4, 0.5), sp, [x, y, 0.05]); b.add(bipyr(0.025 * s, 0.14 * s, 4, 0.5), sp, [x, y, 0.05], [0, 0, Math.PI / 2]); }
  },

  // ---------------------------------------------------------------- a staff of twisted fire coral cradling a magma pearl
  coralStaff(b) {
    const C = PAL.coral;
    const T = tx('staffCoral', 64, 12, (p) => { p.all(C, 3); for (let x = 0; x < 64; x += 4) for (let y = (x % 8 ? 1 : 4); y < 12; y += 6) { p.t(x, y, C, 5); p.t(x + 1, y + 1, C, 1); } p.R(0, 0, 64, 1, C, 4.5); });
    const coral = mat('staffCoral', T, { rough: 0.6 });
    const twist = (ph: number): V3[] => { const out: V3[] = []; for (let i = 0; i <= 12; i++) { const t = i / 12, y = -1.38 + t * 2.3, a = t * TAU * 2.2 + ph; out.push([Math.cos(a) * 0.05, y, Math.sin(a) * 0.05]); } return out; };
    b.add(tube(twist(0), (t) => 0.06 - t * 0.012, { radial: 4, segs: 20, uv: T.r(0, 0, 64, 12) }), coral);
    b.add(tube(twist(Math.PI), (t) => 0.055 - t * 0.012, { radial: 4, segs: 20, uv: T.r(0, 0, 64, 12) }), coral);
    // the claw of branches round the pearl
    for (const [a, z] of [[0, 0.09], [2.1, -0.06], [4.2, 0.02]] as V2[]) {
      const pts: V3[] = [[0, 0.88, 0], [Math.cos(a) * 0.18, 1.0, z], [Math.cos(a) * 0.26, 1.2, z * 1.4], [Math.cos(a) * 0.16, 1.36, z]];
      b.add(tube(pts, (t) => 0.05 - t * 0.032, { radial: 5, segs: 9, uv: T.r(0, 0, 32, 12) }), coral);
      b.add(ball(0.03, 5, 4), S.coralTip(), pts[3]);
    }
    const Lv = tx('magmaPearl', 32, 16, (p) => { p.all(PAL.lava, 4); for (let x = 0; x < 32; x += 5) p.ln(x, 0, x + 3, 15, PAL.lava, 2.5); p.R(0, 0, 32, 3, PAL.lava, 5); p.R(5, 3, 4, 2, PAL.white, 5); });
    b.add(ball(0.2, 10, 8), mat('magmaPearl', Lv, { rough: 0.3, emissive: '#ff7a20', ek: 1.3 }), [0, 1.14, 0.02], [0, 0, 0], 1, { smooth: 1.1 });
    // a leather grip and a brass ferrule
    b.add(cyl(0.09, 0.42, 7), S.strap(), [0.0, 0.0, 0], [0, 0, 0]);
    b.add(cone(0.075, 0.2, 6), S.brass(), [0, -1.45, 0], [Math.PI, 0, 0]);
  },

  // ---------------------------------------------------------------- a kelpweave robe laid flat: hood, sleeves, a mana-gem belt, wavy hem
  kelpRobe(b) {
    const out: V2[] = [[-0.3, 0.72], [-0.92, 0.42], [-0.98, 0.1], [-0.8, 0.02], [-0.5, 0.3], [-0.52, -0.2], [-0.72, -0.92], [-0.36, -0.86], [0, -0.94], [0.36, -0.86], [0.72, -0.92], [0.52, -0.2], [0.5, 0.3], [0.8, 0.02], [0.98, 0.1], [0.92, 0.42], [0.3, 0.72], [0.12, 0.6], [0, 0.48], [-0.12, 0.6]];
    const W = 64, H = 64, f = pageMap(out, W, H);
    const K = pal('#3e7a3a');
    const T = tx('kelpRobe', W, H, (p) => {
      p.weave(0, 0, W, H, K, { b: 3, fold: 9 });
      for (let x = 2; x < W; x += 7) for (let y = 0; y < H; y += 1) if ((y + x) % 9 < 5) p.t(x + Math.round(Math.sin(y * 0.3) * 1), y, K, 4);
      // the wavy hem and cuffs in pale kelp
      const [, hy] = f([0, -0.86]);
      for (let x = 0; x < W; x++) { const y = hy - 6 + Math.round(Math.sin(x * 0.5) * 1.5); p.R(x, y, 1, 3, PAL.kelp, 4.5); p.t(x, y, PAL.kelp, 5); p.t(x, y + 3, K, 1); }
      for (const sx of [-1, 1]) { const [cx, cy] = f([sx * 0.92, 0.22]); p.R(cx - 4, cy - 6, 8, 12, PAL.kelp, 4); p.R(cx - 4, cy - 6, 8, 1, PAL.kelp, 5); }
      // the belt with a mana-gem clasp
      const [, by] = f([0, -0.12]);
      p.R(0, by, W, 4, PAL.leather, 3); p.R(0, by, W, 1, PAL.leather, 4.5); p.stitch(0, by + 2, W - 1, by + 2, '#e8c890', '#2a1408');
      const [nx, ny] = f([0, 0.5]); p.R(nx - 1, ny, 2, by - ny, K, 1.5);
      for (let y = ny + 3; y < by; y += 4) { p.R(nx - 3, y, 2, 1, PAL.gold, 4); p.R(nx + 2, y, 2, 1, PAL.gold, 4); }
    });
    garment(b, out, T, mat('kelpRobe', T, { rough: 0.8 }), 0.16, 0.05);
    // the hood behind the collar
    b.add(warp(ext(oval(0, 0, 0.32, 0.22, 12), 0.12, 0.05), (v) => { v.z -= 0.03; }), mat('kelpRobe', T), [0, 0.7, -0.08]);
    b.add(brilliant(0.09, 6), mat('robeGem', tx('robeGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.mana, 6)), { rough: 0.1, emissive: '#5a6cf4', ek: 0.9 }), [0, -0.12, 0.1]);
    b.add(cbox(0.24, 0.18, 0.05, 0.02), S.gold(), [0, -0.12, 0.07]);
  },

  // ---------------------------------------------------------------- a tall starry hat with a bent tip, a broad brim and a buckled band
  wizardHat(b) {
    const N = pal('#2c3a8a');
    const T = tx('wizHat', 48, 64, (p) => {
      p.all(N, 3);
      for (let y = 0; y < 64; y += 4) p.R(0, y, 48, 1, N, 2.5);
      for (let i = 0; i < 14; i++) { const x = 3 + Math.floor(hash2(i, 1, 2) * 42), y = 4 + Math.floor(hash2(i, 2, 2) * 50); if (i % 4 === 0) p.star(x, y, 3.2, rgb(PAL.gold, 4.5)); else { p.t(x, y, PAL.gold, 5); p.t(x + 1, y, PAL.gold, 3.5); p.t(x, y + 1, PAL.gold, 3.5); } }
      p.ellipse(20, 30, 5, 5, rgb(PAL.gold, 4.5)); p.ellipse(22, 29, 4, 4, rgb(N, 3));
    });
    const felt = mat('wizHat', T, { rough: 0.85 });
    const g = warp(lathe([[0.36, -0.42], [0.3, -0.1], [0.22, 0.25], [0.13, 0.55], [0.06, 0.78], [0, 0.9]], 10, { side: T.r(0, 0, 48, 64) }), (v) => { const t = Math.max(0, v.y - 0.3); v.x += t * t * 0.9; v.y -= t * t * 0.4; });
    b.add(g, felt, [-0.08, 0.15, 0]);
    b.add(lathe([[0.36, -0.03], [0.72, -0.06], [0.8, 0.02], [0.74, 0.0], [0.36, 0.04]], 14, { side: T.r(0, 50, 48, 14) }), felt, [-0.08, -0.28, 0], [0.12, 0, 0]);
    b.add(cyl(0.37, 0.12, 10, { rTop: 0.35, side: [0, 0, 1, 1] }), mat('hatBand', tx('hatBand', 32, 8, (p) => { p.all(PAL.purple, 3); p.R(0, 0, 32, 2, PAL.purple, 4.5); p.R(0, 6, 32, 2, PAL.purple, 1.5); }), { rough: 0.6 }), [-0.08, -0.2, 0], [0.12, 0, 0]);
    b.add(cbox(0.16, 0.14, 0.06, 0.02), S.gold(), [-0.06, -0.19, 0.36]);
    b.add(cbox(0.08, 0.07, 0.07, 0.01), S.dark(), [-0.06, -0.19, 0.37]);
    // a tiny gold star dangling off the tip
    b.add(ext(Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.045 : 0.1; return [Math.cos(a) * r, Math.sin(a) * r] as V2; }), 0.04, 0.012), S.gold(), [0.42, 0.46, 0.02], [0, 0, 0.2]);
    b.add(brilliant(0.045, 6), S.sapphire(), [-0.06, -0.19, 0.39]);
  },

  // ---------------------------------------------------------------- a sunken cutlass: curved blade with barnacles, a brass basket guard
  cutlass(b) {
    const T = tx('cutlass', 96, 24, (p) => {
      p.metal(0, 0, 96, 24, PAL.steel, { b: 3 });
      p.R(0, 19, 96, 3, PAL.steel, 5); p.R(0, 22, 96, 2, PAL.steel, 1.5); p.R(0, 3, 96, 1, PAL.steel, 2);
      p.rust(20, 9, 4, 1); p.rust(52, 12, 3, 2); p.rust(70, 8, 3.5, 3); p.drip(53, 14, 4);
      p.scratch(30, 6, 12, PAL.steel, 0.1);
    });
    const out: V2[] = [[-0.6, 0.06], [0.2, 0.1], [0.8, 0.16], [1.2, 0.3], [1.45, 0.42], [1.42, 0.26], [1.1, 0.06], [0.6, -0.08], [-0.1, -0.12], [-0.6, -0.1]];
    b.add(blade(out, 0.06, T, [0, 0, 96, 24], 0.02), mat('cutlass', T, { rough: 0.3, metal: 0.6 }), [0, 0, 0]);
    const barn = S.barnacle();
    for (const [x, y, s] of [[0.5, 0.0, 1], [0.62, 0.04, 0.7], [0.9, 0.12, 0.85], [0.2, -0.03, 0.6]] as V3[]) b.add(cone(0.06 * s, 0.07 * s, 6), barn, [x, y, 0.035], [Math.PI / 2, 0, 0]);
    // the hilt: brass shell guard, knuckle bow, wire-wrapped grip, pommel
    const brass = S.brass();
    b.add(warp(ext(oval(0, 0, 0.12, 0.22, 10), 0.06, 0.02), (v) => { v.z += (v.x * v.x + v.y * v.y) * 1.5; }), brass, [-0.66, 0, 0.02], [0, 0.3, 0]);
    b.add(tube([[-0.66, 0.2, 0], [-0.86, 0.3, 0.02], [-1.12, 0.28, 0.02], [-1.32, 0.14, 0.01], [-1.36, 0.02, 0]], 0.03, { radial: 5, segs: 12 }), brass);
    const G = tx('grip', 32, 8, (p) => { p.all(PAL.leather, 3); for (let x = 0; x < 32; x += 3) { p.R(x, 0, 1, 8, PAL.brass, 4); } p.R(0, 0, 32, 1, PAL.leather, 4.5); });
    b.add(cyl(0.065, 0.55, 7, { side: G.r(0, 0, 32, 8) }), mat('grip', G, { rough: 0.6 }), [-1.0, 0.0, 0], [0, 0, Math.PI / 2]);
    b.add(ball(0.08, 7, 5), brass, [-1.33, 0.0, 0]);
    b.add(brilliant(0.06, 6), S.sapphire(), [-1.33, 0.0, 0.07]);
  },

  // ---------------------------------------------------------------- a leaf-bladed bronze shortsword with a verdigris bloom
  bronzeBlade(b) {
    const T = tx('bronze', 64, 24, (p) => {
      p.metal(0, 0, 64, 24, PAL.copper, { b: 3.5 });
      p.R(0, 11, 64, 2, PAL.copper, 5); p.R(0, 13, 64, 1, PAL.copper, 2);
      p.rust(14, 8, 4, 1, PAL.patina); p.rust(40, 16, 3, 2, PAL.patina); p.rust(52, 6, 2.5, 3, PAL.patina);
      p.R(0, 0, 64, 1, PAL.copper, 5); p.R(0, 23, 64, 1, PAL.copper, 5);
    });
    const out: V2[] = [[-0.2, 0.06], [0.1, 0.1], [0.45, 0.15], [0.7, 0.12], [0.92, 0.05], [1.0, 0.0], [0.92, -0.05], [0.7, -0.12], [0.45, -0.15], [0.1, -0.1], [-0.2, -0.06]];
    b.add(blade(out, 0.07, T, [0, 0, 64, 24], 0), mat('bronze', T, { rough: 0.3, metal: 0.6 }), [0, 0, 0]);
    b.add(cbox(0.1, 0.42, 0.14, 0.03), mat('bronze', T), [-0.22, 0, 0]);
    b.add(cyl(0.06, 0.45, 7, { side: [0, 0, 1, 1] }), mat('cordGrip', tx('cordGrip', 16, 16, (p) => { p.rope(0, 0, 16, 16, PAL.leather, { pitch: 4 }); }), { rough: 0.8 }), [-0.5, 0, 0], [0, 0, Math.PI / 2]);
    b.add(cyl(0.12, 0.06, 9, { ch: 0.02 }), mat('bronze', T), [-0.76, 0, 0], [0, 0, Math.PI / 2]);
  },

  // ---------------------------------------------------------------- a mail shirt of rusted rings, barnacles at the hem, leather trim
  chainmail(b) {
    const out: V2[] = [[-0.3, 0.72], [-0.88, 0.5], [-0.96, 0.08], [-0.66, 0.0], [-0.55, 0.28], [-0.56, -0.86], [0, -0.92], [0.56, -0.86], [0.55, 0.28], [0.66, 0.0], [0.96, 0.08], [0.88, 0.5], [0.3, 0.72], [0.14, 0.58], [0, 0.54], [-0.14, 0.58]];
    const W = 64, H = 64, f = pageMap(out, W, H);
    const T = tx('mail', W, H, (p) => {
      p.all(PAL.iron, 1.5);
      for (let y = 0; y < H; y += 3) for (let x = (y % 6 ? 1 : 0) - 1; x < W; x += 3) {
        p.t(x, y, PAL.steel, 4.5); p.t(x + 1, y, PAL.steel, 4); p.t(x, y + 1, PAL.steel, 3.5); p.t(x + 1, y + 1, PAL.iron, 2);
      }
      p.rust(14, 40, 6, 1); p.rust(48, 22, 5, 2); p.rust(30, 54, 5, 3); p.drip(15, 44, 6);
      // leather trim at the collar and hem
      const [, hy] = f([0, -0.86]);
      p.R(0, hy - 3, W, 5, PAL.leather, 3); p.R(0, hy - 3, W, 1, PAL.leather, 4.5); p.stitch(0, hy - 1, W - 1, hy - 1, '#e8c890', '#2a1408');
      const [cx, cy] = f([0, 0.6]); p.ellipse(cx, cy - 2, 12, 5, (nx, ny) => (Math.hypot(nx, ny) > 0.6 ? rgb(PAL.leather, ny < 0 ? 4 : 3) : null));
    });
    garment(b, out, T, mat('mail', T, { rough: 0.45, metal: 0.55 }), 0.14, 0.04);
    const barn = S.barnacle();
    for (const [x, y, s] of [[-0.42, -0.78, 1], [-0.3, -0.7, 0.7], [0.36, -0.8, 0.9], [0.48, -0.6, 0.6], [-0.84, 0.18, 0.7]] as V3[]) b.add(cone(0.07 * s, 0.08 * s, 6), barn, [x, y, 0.09], [Math.PI / 2, 0, 0]);
  },

  // ---------------------------------------------------------------- a turtle carapace worn as plate: scutes, straps, gold buckles
  turtleShell(b) {
    const seeds: V2[] = [[0, -0.6], [0, -0.3], [0, 0], [0, 0.3], [0, 0.6]];
    for (const y of [-0.42, -0.14, 0.14, 0.42]) seeds.push([0.48, y], [-0.48, y]);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; seeds.push([Math.cos(a) * 0.98, Math.sin(a) * 0.98]); }
    const Tp = pal('#6a7a3a');
    const T = tx('carapace', 64, 64, (p) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const px = (x + 0.5) / 32 - 1, py = 1 - (y + 0.5) / 32;
        let d1 = 9, d2 = 9, k = 0;
        seeds.forEach(([sx, sy], i) => { const d = Math.hypot(px - sx, (py - sy) * 1.15); if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d; });
        const e = d2 - d1, ring = Math.floor(e * 26) % 2;
        const P2 = k >= 13 ? pal('#5a4a2a') : Tp;
        p.t(x, y, P2, e < 0.035 ? 0.5 : e < 0.07 ? 2 : 3 + ring * 0.5 + (px < -py ? 0.5 : 0));
      }
    });
    const dome = surf(16, 5, (u, v) => { const a = u * TAU, r = v; return [Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.86, Math.sqrt(Math.max(0, 1 - r * r)) * 0.42]; }, { back: true });
    b.add(frontUV(dome, T.r(0, 0, 64, 64)), mat('carapace', T, { rough: 0.45 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.5 });
    // the scalloped rim
    const rim: V2[] = []; for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU, r = i % 2 ? 0.96 : 1.02; rim.push([Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.86]); }
    b.add(ext(rim, 0.08, 0.02, { holes: [oval(0, 0, 0.84, 0.78, 16).reverse()] }), mat('carapaceRim', tx('carapaceRim', 16, 16, (p) => { p.all(pal('#5a4a2a'), 3); p.R(0, 0, 16, 3, pal('#5a4a2a'), 4.5); }), { rough: 0.6 }), [0, 0, -0.02]);
    // two leather straps across with gold buckles and brass rivets
    for (const y of [0.32, -0.36]) {
      b.add(surf(10, 1, (u, v) => { const x = -0.98 + u * 1.96, r = Math.min(1, Math.hypot(x / 0.92, y / 0.86)); return [x, y - 0.06 + v * 0.14, Math.sqrt(Math.max(0, 1 - r * r)) * 0.42 + 0.025]; }, { uv: [0, 0, 1, 1] }), S.strap());
      b.add(cbox(0.2, 0.2, 0.06, 0.02), S.gold(), [0.36, y + 0.01, Math.sqrt(Math.max(0, 1 - (0.36 / 0.92) ** 2 - (y / 0.86) ** 2)) * 0.42 + 0.05]);
      b.add(cbox(0.1, 0.1, 0.07, 0.01), S.dark(), [0.36, y + 0.01, Math.sqrt(Math.max(0, 1 - (0.36 / 0.92) ** 2 - (y / 0.86) ** 2)) * 0.42 + 0.06]);
    }
  },

  // ---------------------------------------------------------------- a bronze helm: T-slot face, cheek guards, a pink sea-pen plume
  plumedHelm(b) {
    const T = tx('helm', 48, 32, (p) => {
      p.metal(0, 0, 48, 32, PAL.copper, { b: 3.5 });
      p.R(0, 28, 48, 4, PAL.copper, 4.5); p.R(0, 27, 48, 1, PAL.copper, 1.5);
      p.rust(10, 12, 4, 1, PAL.patina); p.rust(34, 18, 3, 2, PAL.patina);
      for (let x = 2; x < 48; x += 6) p.rivet(x, 23, PAL.copper);
    });
    const bronze = mat('helm', T, { rough: 0.3, metal: 0.55 });
    b.add(lathe([[0.36, -0.12], [0.37, 0.05], [0.33, 0.22], [0.22, 0.36], [0.1, 0.42], [0, 0.43]], 12, { side: T.r(0, 0, 48, 32) }), bronze, [0, -0.02, 0], [0, 0, 0], 1, { smooth: 0.5 });
    // the face plate with its T-slot
    const face: V2[] = [[-0.34, 0.06], [0.34, 0.06], [0.33, -0.46], [0.12, -0.5], [0.0, -0.42], [-0.12, -0.5], [-0.33, -0.46]];
    const slot: V2[] = [[-0.26, -0.04], [-0.06, -0.08], [-0.05, -0.36], [0.05, -0.36], [0.06, -0.08], [0.26, -0.04], [0.24, -0.14], [0.08, -0.17], [-0.08, -0.17], [-0.24, -0.14]];
    b.add(warp(ext(face, 0.06, 0.02, { holes: [slot.reverse()], rects: T.r(0, 0, 48, 32) }), (v) => { v.z += -v.x * v.x * 1.2; }), bronze, [0, -0.02, 0.33]);
    b.add(cbox(0.6, 0.4, 0.05, 0.02), S.dark(), [0, -0.2, 0.22]);
    // the crest ridge and sea-pen plume
    b.add(cbox(0.06, 0.1, 0.6, 0.02), bronze, [0, 0.44, 0]);
    const Pl = tx('plume', 8, 32, (p) => { for (let y = 0; y < 32; y++) p.R(0, y, 8, 1, PAL.pink, y < 6 ? 5 : y % 4 === 0 ? 2.5 : 4); p.R(3, 0, 1, 32, PAL.pink, 2); });
    const plume = mat('plume', Pl, { rough: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const t = i / 6, z = -0.36 + t * 0.66, y = 0.48 + Math.sin(t * Math.PI) * 0.1;
      b.add(warp(ext([[0, 0], [0.1, 0.1], [0.09, 0.3], [0, 0.4], [-0.09, 0.3], [-0.1, 0.1]], 0.025, 0.008, { rects: Pl.r(0, 0, 8, 32) }), (v) => { v.z += v.y * v.y * 0.5; }), plume, [0, y, z * 0.85], [-0.9 + t * 1.2, Math.PI / 2, 0]);
    }
  },

  // ---------------------------------------------------------------- a billowing red cape: gold-lined, fur collar, a gold clasp and chain
  heroCape(b) {
    const R = tx('cape', 48, 64, (p) => {
      p.weave(0, 0, 48, 64, PAL.red, { b: 3, fold: 8 });
      p.R(0, 58, 48, 6, PAL.gold, 3.5); p.R(0, 58, 48, 1, PAL.gold, 5); p.R(0, 63, 48, 1, PAL.gold, 2);
      p.stitch(0, 56, 47, 56, '#ffe060', '#5a0c1c');
    });
    const Li = tx('capeLining', 16, 16, (p) => { p.weave(0, 0, 16, 16, PAL.yellow, { b: 3.5 }); });
    const cape = (u: number, v: number, back: boolean): V3 => { const w = 0.3 + v * 0.18, x = (u * 2 - 1) * w, y = 0.68 - v * 1.6; return [x + Math.sin(v * 2.5) * 0.06 * v, y, Math.sin(u * TAU * 2.2 + v * 1.5) * 0.06 * (0.3 + v) + v * v * 0.12 - (back ? 0.02 : 0)]; };
    b.add(surf(8, 6, (u, v) => cape(u, v, false), { uv: R.r(0, 0, 48, 64), back: true }), mat('cape', R, { rough: 0.75 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.9 });
    b.add(surf(8, 6, (u, v) => cape(u, v, true), { uv: Li.r(0, 0, 16, 16) }), mat('capeLining', Li, { rough: 0.7 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.9 });
    const fur = mat('fur', tx('fur', 32, 8, (p) => { p.all(PAL.bone, 4); for (let x = 0; x < 32; x += 3) { p.R(x, 0, 2, 3, PAL.bone, 5); p.R(x + 1, 5, 1, 3, PAL.bone, 2.5); } }), { rough: 1 });
    b.add(warp(torus(0.3, 0.09, 5, 10, Math.PI), (v) => { v.y *= 0.5; }), fur, [0, 0.68, 0.02], [0, 0, Math.PI]);
    for (const x of [-0.24, 0.24]) b.add(cyl(0.08, 0.05, 8, { ch: 0.015 }), S.gold(), [x, 0.66, 0.12], [Math.PI / 2, 0, 0]);
    b.add(tube([[-0.22, 0.64, 0.14], [0, 0.56, 0.18], [0.22, 0.64, 0.14]], 0.018, { radial: 3, segs: 8 }), S.gold());
    b.add(brilliant(0.05, 6), S.sapphire(), [0, 0.56, 0.2]);
  },

  // ---------------------------------------------------------------- the tidecaller trident: barbed silver head, aquamarine, wrapped haft
  tideTrident(b) {
    const T = tx('trident', 48, 48, (p) => {
      p.metal(0, 0, 48, 48, PAL.silver, { b: 3 });
      for (let i = 0; i < 48; i++) { p.t(i, 47 - Math.round(i * 0.4), PAL.teal, 4); }
      p.R(0, 0, 48, 2, PAL.silver, 5);
    });
    const silver = mat('trident', T, { rough: 0.25, metal: 0.65 });
    const head: V2[] = [
      [-0.06, -0.12], [-0.3, -0.06], [-0.36, 0.1], [-0.34, 0.42], [-0.42, 0.34], [-0.36, 0.6], [-0.29, 0.38], [-0.24, 0.12], [-0.08, 0.1],
      [-0.06, 0.62], [-0.13, 0.54], [0.0, 0.86], [0.13, 0.54], [0.06, 0.62],
      [0.08, 0.1], [0.24, 0.12], [0.29, 0.38], [0.36, 0.6], [0.42, 0.34], [0.34, 0.42], [0.36, 0.1], [0.3, -0.06], [0.06, -0.12],
    ];
    b.add(warp(ext(head, 0.08, 0.025, { rects: T.r(0, 0, 48, 48) }), (v) => { v.z *= 1 - Math.min(0.6, Math.abs(v.x) * 0.8); }), silver, [0, 0.56, 0]);
    const haft = tx('haft', 16, 64, (p) => { p.metal(0, 0, 16, 64, PAL.teal, { b: 2.5 }); for (let y = 24; y < 44; y += 3) p.R(0, y, 16, 2, PAL.leather, 3); p.R(4, 0, 2, 64, PAL.teal, 4.5); });
    b.add(cyl(0.055, 1.9, 7, { side: haft.r(0, 0, 16, 64) }), mat('haft', haft, { rough: 0.4, metal: 0.4 }), [0, -0.42, 0]);
    b.add(cone(0.06, 0.18, 6), silver, [0, -1.44, 0], [Math.PI, 0, 0]);
    b.add(cyl(0.09, 0.12, 8, { ch: 0.03 }), silver, [0, 0.42, 0]);
    b.add(brilliant(0.11, 8), mat('aquaGem', tx('aquaGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.aqua, 8)), { rough: 0.1, emissive: '#28b2b8', ek: 0.8 }), [0, 0.5, 0.05]);
  },

  // ---------------------------------------------------------------- a tiny tide crown: gold band, wave crests tipped with pearls, an aquamarine
  tideCrown(b) {
    const G = tx('crownBand', 64, 16, (p) => {
      p.metal(0, 0, 64, 16, PAL.gold, { b: 3.5 });
      for (let x = 0; x < 64; x++) { const y = 8 + Math.round(Math.sin(x * 0.4) * 2); p.R(x, y, 1, 3, PAL.teal, 3.5); p.t(x, y, PAL.teal, 5); }
      p.R(0, 0, 64, 2, PAL.gold, 5); p.R(0, 14, 64, 2, PAL.gold, 2);
    });
    const gold = mat('crownBand', G, { rough: 0.25, metal: 0.65, emissive: '#7a4006', ek: 0.2 });
    const g = b.sub([0, -0.05, 0], [0.42, 0, 0]);
    g.add(lathe([[0.36, -0.12], [0.38, -0.1], [0.38, 0.1], [0.36, 0.12], [0.32, 0.1], [0.32, -0.1], [0.36, -0.12]], 16, { side: G.r(0, 0, 64, 16) }), gold);
    const wave: V2[] = [[-0.11, 0], [0.11, 0], [0.1, 0.12], [0.04, 0.24], [-0.06, 0.32], [-0.14, 0.3], [-0.08, 0.24], [-0.03, 0.18], [-0.07, 0.1]];
    const pearl = S.pearl();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const k = g.sub([Math.sin(a) * 0.35, 0.1, Math.cos(a) * 0.35], [0, a, 0]);
      k.add(ext(wave, 0.05, 0.015, { rects: G.r(0, 0, 16, 16) }), gold, [0, 0, 0], [0, 0, 0]);
      k.add(ball(0.045, 5, 4), pearl, [-0.1, 0.32, 0.01], [0, 0, 0], 1, { smooth: 1 });
    }
    g.add(brilliant(0.1, 8), mat('aquaGem', tx('aquaGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.aqua, 8)), { rough: 0.1, emissive: '#28b2b8', ek: 0.8 }), [0, 0, 0.4]);
    const coral = S.coral();
    for (const [x, a] of [[-0.24, 0.6], [0.26, -0.5]] as V2[]) g.add(tube([[x, -0.08, 0.3], [x + Math.sin(a) * 0.06, 0.02, 0.33], [x + Math.sin(a) * 0.1, 0.1, 0.32]], 0.022, { radial: 4, segs: 4 }), coral);
  },

  // ---------------------------------------------------------------- a toymaker's canvas pack: pockets, buckles, tools poking out
  toyPack(b) {
    const C = pal('#8a7a46');
    const T = tx('canvas', 64, 64, (p) => {
      p.weave(0, 0, 64, 64, C, { b: 3 });
      p.panel(0, 0, 64, 64, C, 3, { noFill: true, e: 2 });
      p.stitch(3, 3, 60, 3, '#e8d8a8', '#2a2010'); p.stitch(3, 60, 60, 60, '#e8d8a8', '#2a2010');
      // a sewn-on fish patch
      p.ellipse(48, 14, 9, 7, rgb(PAL.navy, 3)); p.poly([[42, 14], [50, 10], [54, 14], [50, 18]], rgb(PAL.orange, 4)); p.poly([[54, 14], [57, 11], [57, 17]], rgb(PAL.orange, 4)); p.t(45, 13, PAL.ink, 0);
      for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; p.t(48 + Math.cos(a) * 9, 14 + Math.sin(a) * 7, PAL.paper, 4); }
    });
    const canvas = mat('canvas', T, { rough: 0.85 });
    b.add(cbox(1.2, 1.3, 0.62, 0.14, { pz: T.r(0, 0, 64, 64), side: T.r(0, 0, 32, 64), py: T.r(0, 0, 64, 32) }), canvas, [0, -0.15, 0]);
    // the top flap, front pocket, side pockets
    b.add(warp(cbox(1.26, 0.5, 0.7, 0.12, T.r(0, 32, 64, 32)), (v) => { v.y += (1 - v.x * v.x * 2) * 0.06; }), canvas, [0, 0.45, 0.02]);
    b.add(cbox(0.9, 0.62, 0.22, 0.08, T.r(0, 16, 64, 48)), canvas, [0, -0.42, 0.38]);
    for (const x of [-0.68, 0.68]) b.add(cbox(0.2, 0.62, 0.42, 0.06, T.r(0, 0, 16, 48)), canvas, [x, -0.38, 0.02]);
    for (const x of [-0.24, 0.24]) { b.add(cbox(0.14, 0.5, 0.04, 0.015), S.strap(), [x, 0.3, 0.37]); b.add(cbox(0.16, 0.12, 0.05, 0.02), S.brass(), [x, 0.08, 0.39]); }
    b.add(tube([[-0.2, 0.68, 0], [-0.12, 0.84, 0], [0.12, 0.84, 0], [0.2, 0.68, 0]], 0.04, { radial: 5, segs: 8 }), S.strap());
    // tools poking out: a screwdriver, a wrench, a wind-up key on the side
    b.add(cyl(0.06, 0.32, 7, { ch: 0.02 }), mat('sdHandle', tx('sdHandle', 16, 16, (p) => { p.all(PAL.yellow, 4); for (let x = 0; x < 16; x += 4) p.R(x, 0, 2, 16, PAL.yellow, 2.5); }), { rough: 0.4 }), [-0.36, 0.84, -0.05], [0, 0, 0.3]);
    b.add(cyl(0.02, 0.3, 4), S.chrome(), [-0.31, 0.58, -0.05], [0, 0, 0.3]);
    b.add(cbox(0.06, 0.42, 0.04, 0.01), S.chrome(), [0.4, 0.78, -0.08], [0, 0, -0.35]);
    b.add(ext([[0, 0], [0.1, 0.04], [0.14, 0.14], [0.08, 0.2], [0.06, 0.12], [-0.06, 0.12], [-0.08, 0.2], [-0.14, 0.14], [-0.1, 0.04]], 0.04, 0.01), S.chrome(), [0.47, 0.96, -0.08], [0, 0, -0.35]);
    const key = b.sub([0.82, -0.15, 0.05], [0, Math.PI / 2, 0]);
    key.add(cyl(0.02, 0.14, 5), S.brass(), [0, 0, 0.05], [Math.PI / 2, 0, 0]);
    key.add(ext([[-0.16, 0.04], [-0.04, 0.02], [0.04, 0.02], [0.16, 0.04], [0.16, -0.04], [0.04, -0.02], [-0.04, -0.02], [-0.16, -0.04]], 0.03, 0.01), S.brass(), [0, 0, 0.14]);
  },

  // ---------------------------------------------------------------- a red pipe wrench: hook jaw, knurled nut, chipped paint
  pipeWrench(b) {
    const T = tx('wrench', 96, 24, (p) => {
      p.all(PAL.red, 3); p.R(0, 0, 96, 4, PAL.red, 4.5); p.R(0, 20, 96, 4, PAL.red, 2);
      p.R(10, 8, 70, 8, PAL.red, 2.5); p.R(10, 8, 70, 1, PAL.red, 1.5); p.R(10, 15, 70, 1, PAL.red, 4);
      for (const [x, y, w] of [[20, 2, 6], [60, 18, 8], [84, 4, 5], [40, 12, 4]] as V3[]) { p.R(x, y, w, 3, PAL.iron, 3.5); p.R(x, y, w, 1, PAL.iron, 5); }
      p.text('24', 48, 9, rgb(PAL.red, 4.5));
      p.ellipse(6, 12, 3, 3, rgb(PAL.ink, 0.5));
    });
    const red = mat('wrench', T, { rough: 0.55, metal: 0.3 });
    // the red I-beam handle with its hanging hole
    b.add(cbox(1.5, 0.26, 0.14, 0.04, { pz: T.r(0, 0, 96, 24), nz: T.r(0, 0, 96, 24), side: T.r(0, 0, 96, 4) }), red, [-0.25, -0.2, 0], [0, 0, 0.05]);
    const J = tx('jaw', 32, 32, (p) => { p.metal(0, 0, 32, 32, PAL.iron, { b: 3 }); p.panel(0, 0, 32, 32, PAL.iron, 3, { noFill: true }); p.rust(22, 22, 3, 2); });
    const jaw = mat('jaw', J, { rough: 0.45, metal: 0.5 });
    const teeth = (x0: number, x1: number, y: number, dir: 1 | -1): V2[] => { const out: V2[] = []; for (let x = x0; x <= x1 + 1e-6; x += 0.06) out.push([x, y], [x + 0.03, y + dir * 0.04]); return out; };
    // the heel jaw on the handle end (teeth up) and the frame it slides in
    b.add(ext([[0.42, -0.34], [0.98, -0.34], [0.98, 0.0], ...teeth(0.62, 0.92, 0.0, 1).reverse(), [0.6, 0.0], [0.6, 0.26], [0.42, 0.26]], 0.2, 0.03, { rects: J.r(0, 0, 32, 32) }), jaw);
    // the hook jaw: a shank up through the frame, a heavy beak with teeth down
    b.add(ext([[0.66, 0.08], [0.82, 0.08], [0.82, 0.5], [1.02, 0.5], [1.08, 0.62], ...teeth(0.64, 0.98, 0.16, -1).map(([x, y]) => [x, y + 0.34] as V2).reverse().slice(0, 0), [1.02, 0.78], [0.56, 0.78], [0.5, 0.66], [0.66, 0.6]], 0.16, 0.03, { rects: J.r(0, 0, 32, 32) }), jaw, [0, 0, 0.02]);
    for (let x = 0.84; x <= 1.02; x += 0.06) b.add(cone(0.025, 0.06, 3), jaw, [x, 0.47, 0.02], [Math.PI, 0, 0]);
    const K = tx('knurl', 32, 16, (p) => { p.all(PAL.steel, 3); for (let x = 0; x < 32; x += 2) p.R(x, 0, 1, 16, PAL.steel, 1.5); p.R(0, 0, 32, 2, PAL.steel, 5); });
    b.add(cyl(0.14, 0.14, 12, { ch: 0.02, side: K.r(0, 0, 32, 16) }), mat('knurl', K, { rough: 0.35, metal: 0.6 }), [0.74, 0.36, 0.0]);
  },

  // ---------------------------------------------------------------- brass goggles: ribbed cups, amber lenses, a leather strap
  brassGoggles(b) {
    const T = tx('goggleCup', 32, 16, (p) => { p.metal(0, 0, 32, 16, PAL.brass, { b: 3.5 }); for (let y = 2; y < 16; y += 5) { p.R(0, y, 32, 1, PAL.brass, 1.5); p.R(0, y + 1, 32, 1, PAL.brass, 5); } for (let x = 2; x < 32; x += 8) p.rivet(x, 10, PAL.brass); });
    const cup = mat('goggleCup', T, { rough: 0.3, metal: 0.6 });
    const Lx = tx('goggleLens', 32, 32, (p) => { p.ellipse(16, 16, 16, 16, (nx, ny) => rgb(PAL.orange, Math.hypot(nx, ny) > 0.85 ? 2.5 : 4)); p.R(8, 7, 7, 3, PAL.white, 5); p.R(7, 10, 3, 4, PAL.white, 5); p.R(20, 22, 4, 2, PAL.yellow, 5); });
    const lens = mat('goggleLens', Lx, { rough: 0.1, metal: 0.2, emissive: '#b04a10', ek: 0.45 });
    for (const sx of [-1, 1]) {
      const g = b.sub([sx * 0.3, 0.02, 0], [Math.PI / 2, sx * 0.15, 0]);
      g.add(lathe([[0.2, -0.12], [0.22, -0.1], [0.22, 0.06], [0.24, 0.1], [0.22, 0.14], [0.17, 0.14], [0.17, -0.12]], 12, { side: T.r(0, 0, 32, 16) }), cup);
      g.add(cyl(0.18, 0.02, 12, { cap: Lx.r(0, 0, 32, 32) }), lens, [0, 0.11, 0]);
    }
    b.add(tube([[-0.12, 0.06, 0.02], [0, 0.12, 0.02], [0.12, 0.06, 0.02]], 0.03, { radial: 4, segs: 6 }), S.brass());
    b.add(tube([[-0.5, 0.0, -0.05], [-0.62, -0.02, -0.25], [-0.4, -0.06, -0.48], [0, -0.08, -0.55], [0.4, -0.06, -0.48], [0.62, -0.02, -0.25], [0.5, 0.0, -0.05]], 0.05, { radial: 4, segs: 20, sx: 0.4 }), S.strap());
  },

  // ---------------------------------------------------------------- a yellow scuba tank: valve, black handwheel, hose, AIR band, boot
  scubaTank(b) {
    const T = tx('tank', 48, 64, (p) => {
      p.metal(0, 0, 48, 64, PAL.yellow, { b: 3.5 });
      p.R(0, 22, 48, 14, PAL.white, 4.5); p.R(0, 22, 48, 1, PAL.white, 5); p.R(0, 35, 48, 1, PAL.white, 3);
      p.text('AIR', 6, 26, rgb(PAL.green, 2.5)); p.text('AIR', 30, 26, rgb(PAL.green, 2.5));
      p.R(0, 14, 48, 3, PAL.ink, 2); p.R(4, 0, 3, 64, PAL.yellow, 5);
      p.scratch(30, 44, 10, PAL.yellow, 0.2); p.rust(36, 54, 3, 2);
    });
    b.add(lathe([[0, -0.82], [0.27, -0.82], [0.3, -0.76], [0.3, 0.42], [0.24, 0.62], [0.1, 0.72], [0.07, 0.75], [0, 0.75]], 12, { side: T.r(0, 0, 48, 64) }), mat('tank', T, { rough: 0.35, metal: 0.35 }), [0, -0.05, 0], [0, 0.4, 0], 1, { smooth: 0.5 });
    b.add(cyl(0.31, 0.22, 12, { ch: 0.03 }), S.rubber(), [0, -0.8, 0]);
    b.add(cyl(0.31, 0.08, 12), S.strap(), [0, 0.12, 0]);
    b.add(cbox(0.14, 0.12, 0.06, 0.02), S.chrome(), [0.0, 0.12, 0.3]);
    const ch = S.chrome();
    b.add(cbox(0.14, 0.18, 0.14, 0.03), ch, [0, 0.8, 0]);
    b.add(cyl(0.04, 0.24, 6), ch, [0.12, 0.84, 0], [0, 0, Math.PI / 2]);
    b.add(torus(0.1, 0.03, 4, 10), S.rubber(), [0, 0.84, 0.14]);
    b.add(cyl(0.035, 0.16, 6), S.rubber(), [0, 0.84, 0.08], [Math.PI / 2, 0, 0]);
    b.add(tube([[0.24, 0.84, 0], [0.4, 0.78, 0.05], [0.42, 0.5, 0.12], [0.34, 0.2, 0.2], [0.38, -0.1, 0.22]], 0.04, { radial: 5, segs: 14 }), S.rubber());
    b.add(cbox(0.12, 0.16, 0.12, 0.03), ch, [0.38, -0.18, 0.22]);
  },

  // ---------------------------------------------------------------- a dagger made from a stingray barb: serrated, venom-green grooves
  stingrayBarb(b) {
    const out: V2[] = [[-0.1, 0.07]];
    for (let i = 0; i < 9; i++) { const x = -0.05 + i * 0.12; out.push([x, 0.09 - i * 0.008], [x + 0.06, 0.13 - i * 0.011]); }
    out.push([1.08, 0.0]);
    for (let i = 8; i >= 0; i--) { const x = -0.05 + i * 0.12; out.push([x + 0.06, -0.13 + i * 0.011], [x, -0.09 + i * 0.008]); }
    out.push([-0.1, -0.07]);
    const T = tx('barb', 64, 16, (p) => {
      p.all(pal('#7a6a5a'), 3); p.R(0, 0, 64, 3, pal('#7a6a5a'), 4.5); p.R(0, 13, 64, 3, pal('#7a6a5a'), 2);
      p.R(0, 6, 64, 4, PAL.venom, 3); p.R(0, 7, 64, 1, PAL.venom, 5); p.R(0, 9, 64, 1, PAL.venom, 1.5);
      for (let x = 2; x < 64; x += 7) p.t(x, 2, pal('#7a6a5a'), 5);
    });
    b.add(blade(out, 0.07, T, [0, 0, 64, 16], 0), mat('barb', T, { rough: 0.35, emissive: '#2a6a10', ek: 0.3 }), [-0.05, 0, 0]);
    b.add(cbox(0.08, 0.3, 0.14, 0.03), S.bone(), [-0.18, 0, 0]);
    const G = tx('barbGrip', 32, 8, (p) => { p.all(PAL.black, 3); for (let x = 0; x < 32; x += 4) { p.R(x, 0, 2, 8, PAL.venom, 3); p.R(x, 0, 2, 1, PAL.venom, 5); } });
    b.add(cyl(0.065, 0.55, 7, { side: G.r(0, 0, 32, 8) }), mat('barbGrip', G, { rough: 0.6 }), [-0.5, 0, 0], [0, 0, Math.PI / 2]);
    b.add(ball(0.085, 7, 5), S.bone(), [-0.8, 0, 0]);
    b.add(tube([[-0.8, -0.05, 0.02], [-0.86, -0.18, 0.04], [-0.82, -0.3, 0.02]], 0.018, { radial: 3, segs: 5 }), S.thread());
    b.add(brilliant(0.05, 6), S.sapphire(), [-0.86, 0, 0.0], [0, -Math.PI / 2, 0]);
  },

  // ---------------------------------------------------------------- an eel-skin hood: a deep cowl, two eyes glinting out of the dark
  shadowHood(b) {
    const out: V2[] = [[0, 0.48], [0.18, 0.36], [0.34, 0.12], [0.4, -0.16], [0.44, -0.42], [0.2, -0.36], [0, -0.4], [-0.2, -0.36], [-0.44, -0.42], [-0.4, -0.16], [-0.34, 0.12], [-0.18, 0.36]];
    const W = 48, H = 48, f = pageMap(out, W, H);
    const E = pal('#3a3a5a');
    const T = tx('eelHood', W, H, (p) => {
      p.all(E, 3);
      for (let y = 0; y < H; y += 4) for (let x = (y % 8 ? 2 : 0); x < W; x += 4) { p.t(x, y, E, 4); p.t(x + 1, y + 1, E, 2); }
      for (let i = 0; i < 8; i++) { const x = Math.floor(hash2(i, 1, 7) * 44), y = Math.floor(hash2(i, 2, 7) * 44); p.ellipse(x + 2, y + 2, 1.5, 1.2, rgb(PAL.venom, 2)); }
      p.creases(0, 26, 48, 20, E, 6, 3);
      const [cx, cy] = f([0, 0.48]); p.ln(cx, cy, cx, cy + 14, E, 1.5); p.ln(cx + 1, cy + 1, cx + 1, cy + 14, E, 4.5);
    });
    const skin = mat('eelHood', T, { rough: 0.35, metal: 0.15 });
    b.add(warp(ext(out, 0.36, 0.08, { holes: [oval(0, -0.06, 0.24, 0.27, 12).reverse()], rects: { pz: T.r(0, 0, W, H), nz: T.r(0, 0, W, H), side: T.r(0, 0, W, 4) } }), (v) => { v.z -= (v.x * v.x) * 0.8; if (v.y > 0.2) v.z -= (v.y - 0.2) * 0.4; }), skin);
    b.add(cbox(0.52, 0.6, 0.06, 0.05), mat('hoodDark', tx('hoodDark', 8, 8, (p) => { p.all(PAL.black, 0.5); p.R(0, 0, 8, 2, PAL.black, 1.5); }), { rough: 1 }), [0, -0.06, -0.12]);
    const eye = mat('hoodEye', tx('hoodEye', 8, 8, (p) => { p.all(PAL.venom, 5); p.R(0, 0, 3, 3, PAL.white, 5); }), { emissive: '#a8ff5a', ek: 2 });
    for (const x of [-0.09, 0.09]) b.add(warp(ball(0.045, 6, 4), (v) => { v.x *= 1.5; v.y *= 0.6; }), eye, [x, -0.02, 0.0]);
    // the drape across the shoulders
    b.add(warp(cbox(1.0, 0.18, 0.4, 0.08, T.r(0, 32, 48, 16)), (v) => { v.y -= v.x * v.x * 0.15; }), skin, [0, -0.44, -0.05]);
  },
};
