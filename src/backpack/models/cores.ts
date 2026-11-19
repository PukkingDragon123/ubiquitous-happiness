// ABILITY CORES: pumice heart, laser lens, bubble wand, ink sac, eel battery, puffer spines, lodestone, sailfish fin.
import * as THREE from 'three';
import { mat, cbox, hull, rock, cyl, cone, tube, ext, ball, warp, torus, lathe, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, tc, type Pal } from './paint';
import { pageMap, coin } from './parts';
import { S } from './shared';
import type { Build } from './types';
import { hash2 } from '../../core/math';

const rgb = (p: Pal, t: number) => tc(p, t);

export const CORE_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- a pumice heart: porous stone, lava in the cracks, bound in gold
  pumiceHeart(b) {
    const Pm = pal('#9c9a94');
    const T = tx('pumice', 64, 64, (p) => {
      p.all(Pm, 3.5);
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(hash2(i, 1, 9) * 62), y = Math.floor(hash2(i, 2, 9) * 62), r = hash2(i, 3, 9) > 0.8 ? 2 : 1;
        p.R(x, y, r + 1, r, Pm, 1.5); p.R(x, y + r, r + 1, 1, Pm, 5); p.t(x, y - 1, Pm, 2.5);
      }
      for (const pts of [[[4, 20], [14, 24], [20, 34], [30, 36], [36, 46], [44, 50]], [[60, 14], [50, 20], [44, 30], [36, 36]], [[24, 4], [26, 14], [20, 22]]] as V2[][]) {
        for (let k = 0; k < pts.length - 1; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; p.ln(x0, y0 - 1, x1, y1 - 1, PAL.lava, 2); p.ln(x0, y0, x1, y1, PAL.lava, 5); p.ln(x0, y0 + 1, x1, y1 + 1, PAL.lava, 3.5); }
      }
    });
    const stone = mat('pumice', T, { rough: 0.9, emissive: '#ff6a1a', ek: 0.9 });
    b.add(rock(41, 0.45, [1, 1, 0.78], 16, 0.12), stone, [-0.3, 0.2, 0]);
    b.add(rock(42, 0.45, [1, 1, 0.78], 16, 0.12), stone, [0.3, 0.2, 0]);
    b.add(hull([[-0.68, 0.16, 0.18], [-0.68, 0.16, -0.18], [0.68, 0.16, 0.18], [0.68, 0.16, -0.18], [-0.5, -0.3, 0.28], [0.5, -0.3, 0.28], [-0.5, -0.3, -0.24], [0.5, -0.3, -0.24], [0, -0.86, 0.06], [0, -0.82, -0.08], [0, 0.1, 0.38], [0, 0.1, -0.32]]), stone, [0, 0, 0]);
    // the gold binding: a band round its middle, studs, capped vessels on top
    const G = S.gold();
    b.add(warp(torus(0.62, 0.05, 4, 16), (v) => { v.y *= 0.72; v.z *= 0.62; }), G, [0, -0.02, 0], [0, 0, 0.08]);
    for (const [x, y] of [[-0.42, 0.42], [0.42, 0.42], [0, -0.52]] as V2[]) b.add(ball(0.06, 6, 4), G, [x, y, 0.3]);
    const vessel = mat('vessel', tx('vessel', 16, 16, (p) => { p.all(Pm, 3); p.R(0, 0, 16, 3, Pm, 4.5); p.R(0, 10, 16, 6, Pm, 2); }), { rough: 0.85 });
    for (const [x, h, a] of [[-0.12, 0.3, 0.25], [0.12, 0.24, -0.3], [0.32, 0.2, -0.7]] as V3[]) {
      b.add(cyl(0.09, h, 7), vessel, [x + Math.sin(-a) * h * 0.5, 0.5 + Math.cos(a) * h * 0.5, -0.05], [0, 0, a]);
      b.add(torus(0.09, 0.03, 4, 8), G, [x + Math.sin(-a) * h, 0.5 + Math.cos(a) * h, -0.05], [Math.PI / 2, 0, a]);
    }
    b.add(ball(0.11, 8, 6), mat('heartGem', tx('heartGem', 16, 16, (p) => { p.facets(0, 0, 16, 16, PAL.ruby, 6); }), { rough: 0.1, emissive: '#ff3a2a', ek: 0.8 }), [0, 0.02, 0.4], [0, 0, 0], [1, 1, 0.6]);
  },

  // ---------------------------------------------------------------- an anodized laser pointer: knurled grip, red button, clip, a red beam
  laserLens(b) {
    const A = PAL.purple;
    const T = tx('laserBody', 32, 64, (p) => {
      p.metal(0, 0, 32, 64, A, { b: 3 });
      for (let y = 34; y < 54; y += 2) for (let x = 0; x < 32; x += 2) { p.t(x, y, A, 1.5); p.t(x + 1, y + 1, A, 4.5); }
      p.R(0, 32, 32, 1, A, 1); p.R(0, 54, 32, 1, A, 1);
      p.poly([[16, 10], [22, 22], [10, 22]], rgb(PAL.yellow, 4)); p.R(15, 13, 2, 5, PAL.ink, 1); p.t(15, 20, PAL.ink, 1); p.t(16, 20, PAL.ink, 1);
      p.text('CLASS', 6, 24, rgb(A, 5)); p.R(4, 0, 2, 64, A, 5);
    });
    const body = mat('laserBody', T, { rough: 0.3, metal: 0.55 });
    b.add(cyl(0.13, 1.3, 10, { ch: 0.03, side: T.r(0, 0, 32, 64) }), body, [0, -0.25, 0]);
    b.add(cyl(0.16, 0.2, 10, { ch: 0.03, rTop: 0.18 }), S.chrome(), [0, 0.47, 0]);
    b.add(cyl(0.11, 0.06, 10), mat('laserLens', tx('laserLens', 16, 16, (p) => { p.all(PAL.red, 4); p.ellipse(8, 8, 6, 6, (nx, ny) => rgb(PAL.red, Math.hypot(nx, ny) > 0.6 ? 3.5 : 5)); p.R(4, 4, 3, 2, PAL.white, 5); }), { rough: 0.1, emissive: '#ff2020', ek: 1.6 }), [0, 0.58, 0]);
    b.add(cone(0.1, 0.5, 8), mat('laserBeam', tx('laserBeam', 8, 8, (p) => { p.all(PAL.red, 4.5); p.R(3, 0, 2, 8, PAL.white, 5); }), { emissive: '#ff3030', ek: 1.8, opacity: 0.55, depthWrite: false }), [0, 0.86, 0], [Math.PI, 0, 0]);
    b.add(cbox(0.1, 0.07, 0.08, 0.02), mat('laserBtn', tx('laserBtn', 8, 8, (p) => { p.all(PAL.red, 3.5); p.R(0, 0, 8, 2, PAL.red, 5); }), { rough: 0.3, emissive: '#801010', ek: 0.4 }), [0, 0.12, 0.14]);
    b.add(cbox(0.06, 0.7, 0.04, 0.015), S.chrome(), [0.0, 0.0, -0.17]);
    b.add(cbox(0.08, 0.1, 0.12, 0.02), S.chrome(), [0, 0.32, -0.12]);
    b.add(cyl(0.135, 0.1, 10, { ch: 0.03 }), S.chrome(), [0, -0.92, 0]);
  },

  // ---------------------------------------------------------------- a bubble wand: a coral handle, a rainbow film in the loop, bubbles
  bubbleWand(b) {
    const H = tx('wandGrip', 16, 64, (p) => { p.all(PAL.pink, 3.5); for (let y = 30; y < 64; y += 4) { p.R(0, y, 16, 2, PAL.pink, 2.5); p.R(0, y, 16, 1, PAL.pink, 4.5); } p.R(3, 0, 2, 64, PAL.pink, 5); });
    b.add(cyl(0.065, 1.2, 8, { ch: 0.02, rTop: 0.05, side: H.r(0, 0, 16, 64) }), mat('wandGrip', H, { rough: 0.35 }), [0, -0.42, 0]);
    b.add(torus(0.3, 0.05, 6, 16), mat('wandRing', tx('wandRing', 32, 8, (p) => { p.all(PAL.pink, 3.5); p.R(0, 1, 32, 2, PAL.pink, 5); for (let x = 0; x < 32; x += 4) p.t(x, 6, PAL.pink, 2); }), { rough: 0.3 }), [0, 0.48, 0]);
    const F = tx('soapFilm', 32, 32, (p) => {
      const bands: Pal[] = [PAL.pink, PAL.yellow, PAL.green, PAL.aqua, PAL.purple];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const k = Math.floor((x + y + Math.sin(y * 0.3) * 4) / 5) % 5; p.t(x, y, bands[(k + 5) % 5], 4.5); }
      p.R(6, 6, 6, 2, PAL.white, 5); p.R(6, 8, 2, 4, PAL.white, 5);
    });
    const film = mat('soapFilm', F, { rough: 0.1, opacity: 0.5, emissive: '#7a7aff', ek: 0.3, side: THREE.DoubleSide, depthWrite: false });
    b.add(cyl(0.28, 0.01, 14, { cap: F.r(0, 0, 32, 32) }), film, [0, 0.48, 0], [Math.PI / 2, 0, 0]);
    const Bb = tx('bubble', 16, 16, (p) => { p.all(PAL.aqua, 4.5); p.R(0, 12, 16, 4, PAL.purple, 4.5); p.R(3, 3, 4, 3, PAL.white, 5); });
    const bub = mat('bubble', Bb, { rough: 0.1, opacity: 0.5, emissive: '#5ad2be', ek: 0.4, depthWrite: false });
    for (const [x, y, r] of [[0.3, 0.9, 0.12], [-0.22, 0.95, 0.08], [0.1, 1.08, 0.06]] as V3[]) b.add(ball(r, 10, 7), bub, [x, y, 0.05], [0, 0, 0], 1, { smooth: 1.4 });
  },

  // ---------------------------------------------------------------- a squid ink sac: a glossy black pouch, veins, a tied duct, a drip
  inkSac(b) {
    const I = pal('#5a3a8e');
    const T = tx('inkSac', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) p.R(0, y, 32, 1, I, y < 6 ? 3.5 : y > 24 ? 1.5 : 2.5);
      for (const [x0, pts] of [[6, [[2, 6], [-1, 12], [3, 18], [1, 26]]], [20, [[-2, 8], [2, 14], [-1, 22]]]] as [number, V2[]][]) { let x = x0, y = 2; for (const [dx, dy] of pts) { p.ln(x, y, x0 + dx, dy, PAL.purple, 4); x = x0 + dx; y = dy; } }
      p.R(4, 4, 6, 3, PAL.white, 5); p.R(5, 7, 3, 2, I, 5);
    });
    const sac = mat('inkSac', T, { rough: 0.15, metal: 0.1, emissive: '#3a1868', ek: 0.45 });
    b.add(lathe([[0, -0.4], [0.2, -0.36], [0.32, -0.18], [0.33, 0.02], [0.24, 0.2], [0.12, 0.32], [0.07, 0.4], [0, 0.42]], 12), sac, [0, -0.02, 0], [0.15, 0, -0.18], [1, 1, 0.82], { smooth: 1.0 });
    b.add(tube([[0.08, 0.38, 0], [0.12, 0.5, 0.02], [0.2, 0.56, 0.02]], (t) => 0.05 - t * 0.02, { radial: 5, segs: 6 }), sac);
    b.add(torus(0.045, 0.018, 3, 8), S.twine(), [0.1, 0.44, 0], [Math.PI / 2, 0, -0.4]);
    const drop = mat('inkDrop', tx('inkDrop', 8, 8, (p) => { p.all(PAL.ink, 1); p.R(1, 1, 2, 2, PAL.purple, 5); }), { rough: 0.1, metal: 0.2 });
    b.add(lathe([[0, -0.06], [0.05, -0.04], [0.05, 0.0], [0.02, 0.05], [0, 0.08]], 6), drop, [0.22, 0.42, 0.05], [0, 0, 0], 1, { smooth: 1.2 });
    b.add(cyl(0.18, 0.015, 9), drop, [-0.08, -0.43, 0.05], [0, 0, 0], [1.3, 1, 0.8]);
  },

  // ---------------------------------------------------------------- a D-cell wrapped in eel skin: bolt label, terminals, sparks
  eelBattery(b) {
    const E = pal('#9ab83a');
    const T = tx('eelSkin', 64, 32, (p) => {
      p.all(E, 3);
      for (let i = 0; i < 26; i++) { const x = Math.floor(hash2(i, 1, 4) * 60), y = Math.floor(hash2(i, 2, 4) * 28); p.ellipse(x + 2, y + 2, 2 + (i % 2), 1.5, rgb(PAL.kelp, 1.5)); }
      p.R(0, 0, 64, 2, E, 4.5); p.R(0, 30, 64, 2, E, 1.5);
      p.R(18, 7, 28, 18, PAL.black, 2); p.R(18, 7, 28, 1, PAL.black, 4); p.bolt(24, 8, 16, 16, rgb(PAL.yellow, 4.5)); p.bolt(25, 9, 14, 13, rgb(PAL.yellow, 5));
      p.text('+', 50, 13, rgb(PAL.red, 4)); p.text('-', 10, 13, rgb(PAL.ink, 1));
    });
    const g = b.sub([0, 0, 0], [0, 0, Math.PI / 2]);
    g.add(cyl(0.32, 1.42, 14, { ch: 0.04, side: T.r(0, 0, 64, 32), cap: T.r(0, 0, 1, 1) }), mat('eelSkin', T, { rough: 0.35, emissive: '#3a5a10', ek: 0.25 }), [0, 0, 0], [0, 0.5, 0]);
    const term = mat('terminal', tx('terminal', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.copper, { b: 3.5 }); p.ellipse(8, 8, 6, 6, (nx, ny) => (Math.hypot(nx, ny) > 0.8 ? rgb(PAL.copper, 2) : null)); p.glint(5, 5, 1); }), { rough: 0.25, metal: 0.7 });
    g.add(cyl(0.3, 0.06, 14, { ch: 0.015 }), term, [0, -0.73, 0]);
    g.add(cyl(0.3, 0.06, 14, { ch: 0.015 }), term, [0, 0.73, 0]);
    g.add(cyl(0.12, 0.1, 10, { ch: 0.03 }), term, [0, 0.81, 0]);
    // sparks crackling off the + end
    const spark = mat('spark', tx('spark', 8, 8, (p) => { p.all(PAL.yellow, 5); p.R(2, 0, 3, 8, PAL.white, 5); }), { emissive: '#fff060', ek: 2 });
    for (const [x, y, a, s] of [[-0.98, 0.18, 0.4, 1], [-0.95, -0.2, -0.6, 0.8], [-1.0, 0.0, 0.0, 0.7]] as number[][]) {
      const k = b.sub([x, y, 0.05], [0, 0, a], s);
      k.add(hull([[0, 0, 0.02], [0, 0, -0.02], [-0.12, 0.06, 0], [-0.08, 0.02, 0], [-0.2, 0.04, 0]]), spark);
      k.add(hull([[-0.08, 0.02, 0.02], [-0.08, 0.02, -0.02], [-0.2, -0.04, 0], [-0.3, 0.0, 0]]), spark);
    }
  },

  // ---------------------------------------------------------------- an angry inflated puffer: spines, scowl, little fins
  pufferSpines(b) {
    const T = tx('puffer', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) p.R(0, y, 32, 1, y > 20 ? PAL.white : PAL.yellow, y > 20 ? 4.5 : y < 6 ? 4.5 : 3.5);
      for (let i = 0; i < 14; i++) { const x = Math.floor(hash2(i, 1, 3) * 30), y = Math.floor(hash2(i, 2, 3) * 18); p.ellipse(x + 1, y + 1, 1.6, 1.6, rgb(PAL.leather, 2.5)); }
    });
    const body = mat('puffer', T, { rough: 0.45 });
    b.add(ball(0.36, 12, 9), body, [0, 0, 0], [0, 0, 0], 1, { smooth: 1.2 });
    const sp = mat('pufSpine', tx('pufSpine', 8, 16, (p) => { p.all(PAL.bone, 4.5); p.R(0, 0, 8, 5, PAL.leather, 2); p.R(1, 0, 1, 16, PAL.white, 5); }), { rough: 0.4 });
    const n = 30;
    for (let i = 0; i < n; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n), th = i * 2.39996;
      const d = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      if (d.z > 0.75 && d.x < 0) continue;
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      b.add(cone(0.04, 0.2, 4), sp, [d.x * 0.42, d.y * 0.42, d.z * 0.42], [e.x, e.y, e.z]);
    }
    // the face (front-left): big eyes under angry brows, a small pursed mouth
    const eye = mat('pufEye', tx('pufEye', 16, 16, (p) => { p.all(PAL.white, 5); p.ellipse(9, 9, 4, 4, rgb(PAL.ink, 0)); p.R(7, 6, 2, 2, PAL.white, 5); p.R(0, 0, 16, 5, PAL.yellow, 3); }), { rough: 0.2 });
    for (const [x, z] of [[-0.2, 0.28], [0.08, 0.33]] as V2[]) {
      b.add(ball(0.09, 8, 6, [0, 0, 1, 1]), eye, [x, 0.1, z], [0, -0.3, 0], [1, 1, 0.6]);
      b.add(cbox(0.15, 0.035, 0.05, 0.01), mat('brow', tx('brow', 8, 8, (p) => p.all(PAL.leather, 1.5)), { rough: 0.8 }), [x, 0.21, z + 0.03], [0, 0, x < 0 ? -0.45 : 0.45]);
    }
    b.add(torus(0.035, 0.018, 4, 8), mat('pufLip', tx('pufLip', 8, 8, (p) => p.all(PAL.orange, 3.5)), { rough: 0.4 }), [-0.08, -0.08, 0.37]);
    const fin = mat('pufFin', tx('pufFin', 16, 16, (p) => { p.all(PAL.yellow, 4); for (let x = 1; x < 16; x += 3) p.R(x, 0, 1, 16, PAL.yellow, 2.5); }), { rough: 0.5, side: THREE.DoubleSide });
    b.add(ext([[0, 0], [0.14, 0.08], [0.18, 0], [0.14, -0.08]], 0.02, 0.005), fin, [0.34, -0.02, 0.18], [0, -0.5, 0.2]);
    b.add(ext([[0, 0], [0.16, 0.12], [0.2, 0], [0.16, -0.12]], 0.02, 0.005), fin, [0.38, 0.0, -0.1], [0, 0, 0]);
  },

  // ---------------------------------------------------------------- a lodestone: black magnetite, painted poles, nails and a hook stuck fast
  lodestone(b) {
    const T = tx('magnetite', 48, 48, (p) => {
      p.stone(0, 0, 48, 48, pal('#4a4a5a'), { cell: 9, seed: 12, cracks: 2, b: 2.5 });
      for (const [x, y] of [[10, 12], [30, 8], [22, 30], [38, 34], [8, 38]] as V2[]) { p.R(x, y, 3, 1, PAL.steel, 5); p.t(x + 1, y + 1, PAL.steel, 3); }
      p.R(2, 18, 9, 9, PAL.red, 3); p.R(2, 18, 9, 1, PAL.red, 4.5); p.text('N', 5, 20, rgb(PAL.white, 5));
      p.glint(26, 12, 1);
    });
    b.add(rock(51, 0.38, [1.25, 0.88, 0.9], 16, 0.18), mat('magnetite', T, { rough: 0.35, metal: 0.55 }), [0, -0.06, 0]);
    // iron filings bristling in tufts where the field is strongest
    const fil = mat('filings', tx('filings', 4, 8, (p) => { p.all(PAL.iron, 3.5); p.R(0, 0, 4, 2, PAL.steel, 5); }), { rough: 0.5, metal: 0.5 });
    for (const [cx, cy, cz] of [[-0.42, 0.0, 0.1], [0.44, -0.04, 0.08], [0.06, 0.3, 0.12]] as V3[]) for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, d = new THREE.Vector3(cx * 2 + Math.cos(a) * 0.35, cy * 2 + 0.3 + Math.sin(a) * 0.35, cz + 0.4).normalize();
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      b.add(cone(0.016, 0.12 + (i % 3) * 0.04, 3), fil, [cx + Math.cos(a) * 0.05, cy + Math.sin(a) * 0.05, cz + 0.12], [e.x, e.y, e.z]);
    }
    // stuck fast: a nail across the top, a little hook, a coin on its face
    b.add(cyl(0.03, 0.56, 4), S.iron(), [0.02, 0.3, 0.12], [0.3, 0, 1.3]);
    b.add(cyl(0.065, 0.025, 6), S.iron(), [-0.26, 0.24, 0.05], [0.3, 0, 1.3]);
    b.add(tube([[0.2, 0.08, 0.32], [0.24, -0.08, 0.37], [0.16, -0.18, 0.39], [0.06, -0.12, 0.37], [0.06, -0.04, 0.35]], (t) => 0.024 * (t > 0.85 ? 0.5 : 1), { radial: 4, segs: 8 }), S.wire());
    b.add(torus(0.035, 0.012, 3, 7), S.wire(), [0.2, 0.12, 0.31]);
    const C = tx('lodeCoin', 16, 18, (p) => { p.ellipse(8, 8, 8, 8, (nx, ny) => rgb(PAL.copper, Math.hypot(nx, ny) > 0.8 ? 2 : nx + ny < -0.4 ? 4.5 : 3.5)); p.text('1', 7, 6, rgb(PAL.copper, 1.5)); p.R(0, 16, 16, 2, PAL.copper, 2.5); });
    coin(b, mat('lodeCoin', C, { rough: 0.3, metal: 0.6 }), C.r(0, 0, 16, 16), C.r(0, 16, 16, 2), { r: 0.13, h: 0.035, pos: [-0.16, -0.16, 0.33], rot: [-0.3, -0.3, 0.2], seed: 2 });
  },

  // ---------------------------------------------------------------- a sailfish dorsal fin: tall spotted sail on spines, a chunk of silver hide
  sailFin(b) {
    // spine tips fan from the base; the membrane notches in between them, so the trailing edge is spiky
    const tips: V2[] = [[-0.12, 0.98], [0.1, 0.9], [0.24, 0.7], [0.34, 0.44], [0.4, 0.16], [0.44, -0.12], [0.46, -0.36]];
    const root: V2 = [-0.32, -0.5];
    const out: V2[] = [[-0.42, -0.55], [-0.38, 0.1], [-0.3, 0.6]];
    tips.forEach((t, i) => { out.push(t); const n = tips[i + 1]; if (n) out.push([(t[0] + n[0]) / 2 - 0.06, (t[1] + n[1]) / 2 - 0.05]); });
    out.push([0.44, -0.55]);
    const W = 32, H = 64, f = pageMap(out, W, H);
    const B2 = pal('#2e44c0');
    const T = tx('sail', W, H, (p) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.t(x, y, B2, 3 + (Math.floor((x + y * 0.3) / 6) % 2 ? 0.5 : 0) - (y > 54 ? 1 : 0));
      const [rx, ry] = f(root);
      for (const t of tips) { const [x1, y1] = f(t); p.ln(rx, ry, x1, y1, PAL.navy, 1); p.ln(rx + 1, ry, x1 + 1, y1, B2, 5); }
      for (let i = 0; i < 9; i++) { const x = 6 + Math.floor(hash2(i, 1, 6) * 22), y = 10 + Math.floor(hash2(i, 2, 6) * 38); p.ellipse(x, y, 2, 2, rgb(PAL.navy, 0.5)); p.t(x - 1, y - 1, B2, 4); }
      p.R(0, 0, 4, H, B2, 1.5);
    });
    const sail = mat('sail', T, { rough: 0.4, side: THREE.DoubleSide, emissive: '#1a2a6a', ek: 0.25 });
    const fin = b.sub([0.04, 0.08, 0], [0, 0, -0.16]);
    fin.add(warp(ext(out, 0.035, 0.01, { rects: { pz: T.r(0, 0, W, H), nz: T.r(0, 0, W, H), side: T.r(0, 0, W, 2) } }), (v) => { v.z += Math.sin((v.x + 0.4) * 9) * 0.04; }), sail, [0, 0.12, 0]);
    const spine = mat('finSpine', tx('finSpine', 4, 16, (p) => { p.all(PAL.navy, 2); p.R(0, 0, 4, 4, PAL.ice, 4.5); p.R(1, 0, 1, 16, PAL.navy, 4); }), { rough: 0.5 });
    for (const [x1, y1] of tips) { const l = Math.hypot(x1 - root[0], y1 - root[1]) + 0.1; fin.add(cone(0.028, l, 4), spine, [(root[0] + x1) / 2 + 0.01, (root[1] + y1) / 2 + 0.14, 0.03], [0, 0, -Math.atan2(x1 - root[0], y1 - root[1])]); }
    const hide = tx('sailHide', 32, 16, (p) => { p.all(PAL.silver, 3.5); p.R(0, 0, 32, 4, PAL.navy, 3); for (let x = 0; x < 32; x += 4) p.R(x, 6, 2, 1, PAL.silver, 5); p.R(0, 13, 32, 3, PAL.flesh, 3.5); });
    b.add(warp(cbox(1.0, 0.2, 0.3, 0.07, { side: hide.r(0, 0, 32, 16), pz: hide.r(0, 0, 32, 16), py: hide.r(0, 0, 32, 6) }), (v) => { v.y -= v.x * v.x * 0.2; }), mat('sailHide', hide, { rough: 0.3, metal: 0.4 }), [0.02, -0.52, 0]);
  },
};
