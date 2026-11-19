// BIG ITEMS (3x3 .. 4x4): giant clam, ship's wheel, rusted anchor, sunken chest, harpoon gun. They eat half a pack, so
// each is a centrepiece: more parts, more paint, legendary gold where it is earned.
import * as THREE from 'three';
import { mat, cbox, hull, cyl, cone, tube, ext, ball, surf, warp, torus, lathe, basis, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, tc, type Pal } from './paint';
import { fanShell, coin, brilliant } from './parts';
import { S } from './shared';
import type { Build } from './types';
import { hash2 } from '../../core/math';

const rgb = (p: Pal, t: number) => tc(p, t);

export const BIG_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- a giant clam, gaping: fluted valves, a vivid mantle, a glowing pearl, gold at the hinge
  giantClam(b) {
    const Out = tx('gclamOut', 48, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const rib = Math.floor(x / 4.8) % 2, band = Math.floor((47 - y) / 5) % 2; p.t(x, y, rib ? PAL.bone : pal('#b8a488'), (rib ? 4 : 3) + band * 0.5); }
      for (let y = 3; y < 48; y += 5) for (let x = 1; x < 48; x += 5) { p.R(x, y, 3, 1, PAL.bone, 5); p.t(x + 1, y + 1, PAL.bone, 2); }
      for (const [x, y] of [[6, 20], [30, 12], [40, 34], [16, 40], [24, 28]] as V2[]) { p.t(x, y, PAL.gold, 5); p.t(x + 1, y, PAL.gold, 4); }
      p.R(0, 0, 48, 3, PAL.purple, 3);
    });
    const In = tx('gclamIn', 32, 32, (p) => { p.nacre(0, 0, 32, 32, 3, 0.5); p.R(0, 0, 32, 3, PAL.purple, 3.5); });
    const outer = mat('gclamOut', Out, { rough: 0.55 }), inner = mat('gclamIn', In, { rough: 0.3, emissive: '#3a3a5a', ek: 0.2 });
    // tilted toward us so we look into the gape: the lower valve a fluted bowl, the upper valve thrown open behind
    const c = b.sub([0, 0, 0], [0.62, 0, 0]);
    const th = 1.3;
    fanShell(c, outer, inner, { R: 1.7, spread: 1.15, ribs: 5, dome: 0.5, rib: 0.15, scallop: 0.07, nv: 4, pos: [0, 0, -0.9], rot: [Math.PI / 2, 0, 0] });
    fanShell(c, outer, inner, { R: 1.66, spread: 1.15, ribs: 5, dome: 0.46, rib: 0.15, scallop: 0.07, nv: 4, pos: [0, 0.06, -0.9], rot: [Math.PI / 2 - th, Math.PI, 0] });
    // the mantle: a frilled, spotted sheet of blue and violet filling the bowl
    const Mn = tx('mantle', 48, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) { const k = Math.floor((x + Math.sin(y * 0.5) * 3) / 6) % 3; p.t(x, y, k === 0 ? PAL.blue : k === 1 ? PAL.teal : PAL.purple, 3.5 + (y < 4 ? 1 : 0)); }
      for (let i = 0; i < 30; i++) { const x = Math.floor(hash2(i, 1, 4) * 46), y = 4 + Math.floor(hash2(i, 2, 4) * 26); p.ellipse(x + 1, y, 1.4, 1.4, rgb(PAL.aqua, 5)); }
      p.R(0, 0, 48, 2, PAL.aqua, 5);
    });
    c.add(surf(16, 3, (u, v) => { const a = (u * 2 - 1) * 1.1, r = 0.2 + v * 1.3; return [Math.sin(a) * r, -0.14 + Math.sin(u * TAU * 4) * 0.07 * v, -0.9 + Math.cos(a) * r * 0.92]; }, { uv: Mn.r(0, 0, 48, 32), back: true }), mat('mantle', Mn, { rough: 0.35, emissive: '#1a3a90', ek: 0.45 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.8 });
    // the pearl, big and glowing
    const Pr = tx('gPearl', 32, 16, (p) => { p.all(PAL.pearl, 4); for (let x = 0; x < 32; x++) { p.t(x, 5 + Math.round(Math.sin(x * 0.4) * 1.5), PAL.pink, 5); p.t(x, 11, PAL.yellow, 5); } p.R(0, 13, 32, 3, PAL.pearl, 3); p.R(5, 2, 5, 3, PAL.white, 5); });
    c.add(ball(0.42, 14, 10), mat('gPearl', Pr, { rough: 0.15, metal: 0.1, emissive: '#d8c8a0', ek: 0.55 }), [0.05, 0.22, 0.05], [0.3, 0.5, 0], 1, { smooth: 1.3 });
    // gold encrusting the hinge (legendary)
    const G = S.gold();
    c.add(cbox(0.7, 0.22, 0.3, 0.07), G, [0, -0.02, -1.0]);
    for (const x of [-0.26, 0, 0.26]) c.add(ball(0.07, 6, 4), G, [x, 0.1, -0.94]);
    c.add(brilliant(0.12, 8), mat('gclamGem', tx('gclamGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.aqua, 8)), { rough: 0.1, emissive: '#28b2b8', ek: 0.9 }), [0, 0.06, -0.86], [-Math.PI / 2, 0, 0]);
  },

  // ---------------------------------------------------------------- a ship's wheel: turned oak spokes and handles, a double rim, brass bands and boss
  shipWheel(b) {
    const W = tx('wheelOak', 96, 12, (p) => { p.wood(0, 0, 96, 12, PAL.oak, { seed: 11, knots: 3, lines: 3 }); p.R(0, 0, 96, 1, PAL.oak, 4.5); p.R(0, 11, 96, 1, PAL.oak, 1.5); });
    const oak = mat('wheelOak', W, { rough: 0.7 });
    b.add(torus(1.08, 0.13, 5, 32, TAU, W.r(0, 0, 96, 12)), oak);
    b.add(torus(0.78, 0.07, 4, 24, TAU, W.r(0, 0, 96, 12)), oak);
    const Br = tx('wheelBrass', 32, 8, (p) => { p.metal(0, 0, 32, 8, PAL.brass, { b: 3.5 }); p.R(0, 0, 32, 2, PAL.brass, 5); p.R(0, 6, 32, 2, PAL.brass, 1.5); for (let x = 2; x < 32; x += 6) p.rivet(x, 2, PAL.brass); });
    const brass = mat('wheelBrass', Br, { rough: 0.3, metal: 0.6 });
    const Hd = tx('wheelHandle', 16, 48, (p) => { p.wood(0, 0, 16, 48, pal('#7a4424'), { vertical: true, seed: 4, knots: 0 }); for (const y of [12, 22, 34]) { p.R(0, y, 16, 1, pal('#7a4424'), 1); p.R(0, y + 1, 16, 1, pal('#7a4424'), 4.5); } });
    const hm = mat('wheelHandle', Hd, { rough: 0.6 });
    const prof: V2[] = [[0, 0.0], [0.07, 0.02], [0.06, 0.66], [0.1, 0.88], [0.075, 1.0], [0.12, 1.2], [0.06, 1.42], [0.09, 1.5], [0, 1.6]];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.add(lathe(prof, 5, { side: Hd.r(0, 0, 16, 48) }), hm, [0, 0, 0], [0, 0, a]);
      b.add(cyl(0.16, 0.06, 8), brass, [-Math.sin(a) * 1.08, Math.cos(a) * 1.08, 0], [0, 0, a]);
    }
    // the hub: oak drum, brass boss with a compass rose, an amethyst at the heart (epic)
    b.add(cyl(0.3, 0.34, 12, { ch: 0.05 }), oak, [0, 0, 0], [Math.PI / 2, 0, 0]);
    const Bo = tx('wheelBoss', 32, 32, (p) => {
      p.metal(0, 0, 32, 32, PAL.brass, { b: 3.5, bands: false });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; p.ln(16, 16, 16 + Math.cos(a) * (i % 2 ? 8 : 13), 16 + Math.sin(a) * (i % 2 ? 8 : 13), PAL.brass, i % 2 ? 2 : 1.5); }
      p.ellipse(16, 16, 15, 15, (nx, ny) => (Math.hypot(nx, ny) > 0.88 ? rgb(PAL.brass, nx + ny < 0 ? 5 : 2) : null));
      p.glint(9, 8, 1);
    });
    b.add(cyl(0.22, 0.12, 12, { ch: 0.04, side: Br.r(0, 0, 32, 8), cap: Bo.r(0, 0, 32, 32) }), mat('wheelBoss', Bo, { rough: 0.3, metal: 0.6 }), [0, 0, 0.2], [Math.PI / 2, 0, 0]);
    b.add(brilliant(0.07, 6), mat('purpleGem', tx('purpleGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.amethyst, 6)), { rough: 0.1, emissive: '#8236c0', ek: 0.8 }), [0, 0, 0.28]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + TAU / 16; b.add(torus(1.08, 0.15, 5, 4, 0.16, Br.r(0, 0, 32, 8)), brass, [0, 0, 0], [0, 0, a]); }
  },

  // ---------------------------------------------------------------- a rusted admiralty anchor: ring, stock, shank, curved arms, spade flukes, chain
  rustAnchor(b) {
    const T = tx('anchorIron', 96, 16, (p) => {
      p.metal(0, 0, 96, 16, PAL.iron, { b: 2.5, polish: false });
      for (const [x, y, r, s] of [[8, 8, 5, 1], [26, 6, 6, 2], [44, 10, 4, 3], [62, 7, 6, 4], [80, 9, 5, 5]] as number[][]) p.rust(x, y, r, s);
      for (const x of [12, 30, 64]) p.drip(x, 10, 5);
      p.R(0, 0, 96, 2, PAL.iron, 4); p.R(0, 14, 96, 2, PAL.iron, 1.5);
    });
    const iron = mat('anchorIron', T, { rough: 0.75, metal: 0.3 });
    b.add(torus(0.26, 0.07, 5, 12, TAU, T.r(0, 0, 48, 16)), iron, [0, 1.74, 0]);
    // the stock: an oak bar bound with iron, ball-ended
    const Wd = tx('anchorStock', 64, 16, (p) => { p.wood(0, 0, 64, 16, PAL.dark, { seed: 5, knots: 2 }); for (const x of [8, 30, 52]) { p.R(x, 0, 4, 16, PAL.iron, 2.5); p.R(x, 0, 1, 16, PAL.iron, 4); } p.holes([[20, 6], [42, 9]], PAL.dark); });
    b.add(cbox(2.7, 0.26, 0.26, 0.06, { side: Wd.r(0, 0, 64, 16), pz: Wd.r(0, 0, 64, 16), py: Wd.r(0, 0, 64, 16) }), mat('anchorStock', Wd, { rough: 0.85 }), [0, 1.3, 0]);
    for (const x of [-1.38, 1.38]) b.add(ball(0.15, 7, 5), iron, [x, 1.3, 0]);
    // the shank down to the crown
    b.add(tube([[0, 1.55, 0], [0, 0.5, 0], [0, -0.6, 0], [0, -1.5, 0]], (t) => 0.13 + t * 0.06, { radial: 4, segs: 8, uv: T.r(0, 0, 96, 16) }), iron, [0, 0, 0], [0, Math.PI / 4, 0]);
    b.add(ball(0.24, 8, 6), iron, [0, -1.56, 0], [0, 0, 0], [1.2, 0.8, 0.9]);
    // the arms sweeping up into spade flukes with sharp bills
    for (const s of [-1, 1]) {
      b.add(tube([[0, -1.58, 0], [s * 0.6, -1.66, 0], [s * 1.08, -1.4, 0], [s * 1.32, -0.92, 0]], (t) => 0.15 - t * 0.04, { radial: 5, segs: 12, uv: T.r(0, 0, 96, 16) }), iron);
      const fl: V2[] = [[0, -0.3], [0.26, -0.12], [0.22, 0.2], [0, 0.42], [-0.22, 0.2], [-0.26, -0.12]];
      b.add(warp(ext(fl, 0.1, 0.03, { rects: T.r(0, 0, 32, 16) }), (v) => { v.z *= 1 - Math.abs(v.x) * 2; }), iron, [s * 1.3, -1.02, 0.02], [0, 0, -s * 0.5]);
      b.add(cone(0.06, 0.22, 4), S.point(), [s * 1.43, -0.6, 0.02], [0, 0, -s * 0.45]);
    }
    // barnacles and a drape of chain from the ring
    for (const [x, y, sc] of [[0.12, 0.3, 1], [-0.1, -0.4, 0.8], [0.7, -1.62, 0.9], [-1.0, -1.45, 0.7], [0.6, 1.36, 0.7]] as V3[]) b.add(cone(0.09 * sc, 0.1 * sc, 6), S.barnacle(), [x, y, 0.14], [Math.PI / 2, 0, 0]);
    const linkM = S.iron();
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = 0.25 + Math.sin(t * Math.PI) * 0.55 + t * 0.4, y = 1.62 - t * 2.3;
      b.add(warp(torus(0.1, 0.03, 4, 8), (v) => { v.y *= 1.5; }), linkM, [x, y, 0.2], [0, i % 2 ? Math.PI / 2 : 0, -0.3 + t * 0.5]);
    }
    b.add(brilliant(0.1, 6), S.amethyst(), [0, 1.3, 0.14]);
  },

  // ---------------------------------------------------------------- the sunken chest: iron-banded planks, gold corners and lock, treasure glowing at the gap
  sunkenChest(b) {
    const Pk = tx('chestPlank', 96, 48, (p) => {
      p.wood(0, 0, 96, 48, PAL.oak, { seed: 3, knots: 3, lines: 8 });
      for (const y of [11, 23, 35]) { p.R(0, y, 96, 1, PAL.oak, 0.5); p.R(0, y + 1, 96, 1, PAL.oak, 4.5); }
      p.holes([[14, 6], [60, 18], [82, 40], [36, 30]], PAL.oak);
      p.rust(30, 44, 3, 2, pal('#3a6a3a')); p.rust(70, 4, 3, 5, pal('#3a6a3a'));
    });
    const plank = mat('chestPlank', Pk, { rough: 0.8 });
    const Ir = tx('chestIron', 16, 32, (p) => { p.metal(0, 0, 16, 32, PAL.iron, { b: 2.5, polish: false }); for (let y = 3; y < 32; y += 9) p.rivet(5, y, PAL.iron); p.rust(10, 20, 3, 2); p.R(0, 0, 1, 32, PAL.iron, 4); });
    const iron = mat('chestIron', Ir, { rough: 0.6, metal: 0.4 });
    b.add(cbox(3.4, 1.4, 1.7, 0.06, { pz: Pk.r(0, 0, 96, 48), nz: Pk.r(0, 0, 96, 48), side: Pk.r(0, 0, 48, 48), py: Pk.r(0, 0, 96, 48), ny: Pk.r(0, 0, 96, 48) }), plank, [0, -0.62, 0]);
    // the domed lid, ajar on its back hinge
    const lid = b.sub([0, 0.08, -0.85], [-0.28, 0, 0]);
    const lidG = lathe([[0, -1.7], [0.86, -1.7], [0.86, 1.7], [0, 1.7]], 8, { arc: Math.PI, phase: -Math.PI / 2, side: Pk.r(0, 0, 96, 48), cap: Pk.r(0, 0, 48, 48) });
    const R = basis([0, 0, 1], [1, 0, 0], [0, 1, 0]);
    lid.add(lidG, plank, [0, 0, 0.85], R);
    for (const x of [-1.2, 0, 1.2]) lid.add(lathe([[0.9, -0.1], [0.9, 0.1]], 8, { arc: Math.PI, phase: -Math.PI / 2, side: Ir.r(0, 0, 16, 32) }), iron, [x, 0, 0.85], R);
    for (const x of [-1.2, 0, 1.2]) b.add(cbox(0.2, 1.44, 1.74, 0.03, { pz: Ir.r(0, 0, 16, 32), nz: Ir.r(0, 0, 16, 32), side: Ir.r(0, 0, 16, 32) }), iron, [x, -0.62, 0]);
    // treasure glowing through the gap: a mound of coins, a pearl string draped over the lip
    const Co = tx('coinPile', 32, 32, (p) => { p.all(PAL.gold, 3.5); for (let y = 0; y < 32; y += 5) for (let x = (y % 10 ? 2 : 0); x < 32; x += 5) { p.ellipse(x + 2, y + 2, 2.5, 1.6, rgb(PAL.gold, 4.5)); p.t(x + 1, y + 1, PAL.gold, 5); p.t(x + 3, y + 3, PAL.gold, 2); } });
    b.add(warp(cbox(3.1, 0.3, 1.4, 0.1, Co.r(0, 0, 32, 32)), (v) => { if (v.y > 0) v.y += Math.sin(v.x * 2.4) * 0.08 + 0.08; }), mat('coinPile', Co, { rough: 0.3, metal: 0.5, emissive: '#c88a18', ek: 0.7 }), [0, 0.12, -0.05]);
    const C2 = tx('chestCoin', 32, 36, (p) => { p.ellipse(16, 16, 16, 16, (nx, ny) => rgb(PAL.gold, Math.hypot(nx, ny) > 0.8 ? 2.5 : nx + ny < -0.4 ? 4.5 : 3.5)); p.skull(12, 12, '#7a4006', '#ffe060'); for (let x = 0; x < 32; x++) p.R(x, 32, 1, 4, PAL.gold, x % 2 ? 2 : 3.5); });
    const coinM = mat('chestCoin', C2, { rough: 0.3, metal: 0.6, emissive: '#7a4006', ek: 0.25 });
    coin(b, coinM, C2.r(0, 0, 32, 32), C2.r(0, 32, 32, 4), { r: 0.22, h: 0.06, pos: [0.9, 0.42, 0.55], rot: [0.3, 0.2, -0.5], seed: 1 });
    coin(b, coinM, C2.r(0, 0, 32, 32), C2.r(0, 32, 32, 4), { r: 0.2, h: 0.06, pos: [1.3, -1.32, 0.95], rot: [-1.3, 0, 0.2], seed: 4 });
    coin(b, coinM, C2.r(0, 0, 32, 32), C2.r(0, 32, 32, 4), { r: 0.18, h: 0.05, pos: [1.65, -1.36, 0.6], rot: [-1.0, 0.6, 0], seed: 7 });
    const pearls: V3[] = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pearls.push([-0.9 + t * 1.0, 0.18 - Math.sin(t * Math.PI) * 0.62 + (t > 0.5 ? (t - 0.5) * 0.3 : 0), 0.9 + Math.sin(t * Math.PI) * 0.06]); }
    for (const p of pearls) b.add(ball(0.06, 6, 4), S.pearl(), p, [0, 0, 0], 1, { smooth: 1.2 });
    // the gold lock, hasp and corners (legendary)
    const G = S.gold();
    const Lk = tx('chestLock', 32, 32, (p) => { p.metal(0, 0, 32, 32, PAL.gold, { b: 3.5 }); p.panel(0, 0, 32, 32, PAL.gold, 3.5, { noFill: true, e: 2 }); p.ellipse(16, 13, 4, 4, rgb(PAL.ink, 0)); p.poly([[14, 14], [18, 14], [19, 24], [13, 24]], rgb(PAL.ink, 0)); for (const [x, y] of [[3, 3], [25, 3], [3, 25], [25, 25]] as V2[]) p.rivet(x, y, PAL.gold); p.glint(7, 6, 1); });
    b.add(cbox(0.56, 0.62, 0.12, 0.04, { pz: Lk.r(0, 0, 32, 32), side: Lk.r(0, 0, 8, 32) }), mat('chestLock', Lk, { rough: 0.25, metal: 0.65, emissive: '#7a4006', ek: 0.25 }), [0, -0.3, 0.88]);
    b.add(cbox(0.24, 0.4, 0.08, 0.03), G, [0, 0.1, 0.9], [-0.25, 0, 0]);
    for (const x of [-1, 1]) for (const y of [-1, 1]) b.add(hull([[x * 1.74, y > 0 ? 0.12 : -1.36, 0.88], [x * 1.4, y > 0 ? 0.12 : -1.36, 0.88], [x * 1.74, y > 0 ? -0.22 : -1.02, 0.88], [x * 1.74, y > 0 ? 0.12 : -1.36, 0.5], [x * 1.4, y > 0 ? 0.12 : -1.36, 0.8], [x * 1.74, y > 0 ? -0.22 : -1.02, 0.8]]), G);
    // barnacles, a starfish and a drape of weed
    for (const [x, y, s] of [[-1.5, -1.1, 1], [-1.3, -1.25, 0.7], [1.0, 0.5, 0.8], [-0.6, -1.25, 0.6]] as V3[]) b.add(cone(0.1 * s, 0.1 * s, 6), S.barnacle(), [x, y, 0.88], [Math.PI / 2, 0, 0]);
    const star: V2[] = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.08 : 0.22; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
    b.add(ext(star, 0.06, 0.02), mat('chestStar', tx('chestStar', 16, 16, (p) => { p.all(PAL.orange, 3.5); for (let i = 0; i < 6; i++) p.t(3 + i * 2, 8, PAL.orange, 5); }), { rough: 0.6 }), [-1.2, -0.8, 0.9], [0, 0, 0.3]);
    const weed = mat('chestWeed', tx('chestWeed', 8, 32, (p) => { p.all(PAL.kelp, 3); p.R(3, 0, 1, 32, PAL.kelp, 4.5); p.R(0, 0, 8, 2, PAL.kelp, 4.5); }), { rough: 0.7, side: THREE.DoubleSide });
    for (const [x, l, ph] of [[1.45, 1.0, 0], [1.6, 0.7, 1], [-0.4, 0.5, 2]] as V3[]) b.add(surf(1, 6, (u, v) => [x + u * 0.1 + Math.sin(v * 5 + ph) * 0.06, 0.15 - v * l, 0.9 + v * 0.02]), weed);
  },

  // ---------------------------------------------------------------- the giant's harpoon gun: teak barrel and stock, brass, red slings, a barbed spear
  harpoonGun(b) {
    const Tk = tx('teak', 96, 16, (p) => { p.wood(0, 0, 96, 16, pal('#9a5a2a'), { seed: 6, knots: 2, lines: 4 }); p.R(0, 0, 96, 1, pal('#9a5a2a'), 4.5); p.R(0, 15, 96, 1, pal('#9a5a2a'), 1.5); });
    const teak = mat('teak', Tk, { rough: 0.55 });
    // the barrel along the top row
    b.add(cbox(3.3, 0.3, 0.3, 0.07, { side: Tk.r(0, 0, 96, 16), pz: Tk.r(0, 0, 96, 16), py: Tk.r(0, 0, 96, 16) }), teak, [0.1, 0.52, 0]);
    const brass = S.brass();
    b.add(cbox(0.28, 0.42, 0.44, 0.06), brass, [1.72, 0.55, 0]);
    for (const x of [-0.6, 0.6]) b.add(cbox(0.1, 0.34, 0.34, 0.03), brass, [x, 0.52, 0]);
    // the spear riding on top, barbed tip past the muzzle
    b.add(cyl(0.035, 3.6, 6), S.chrome(), [0.25, 0.72, 0], [0, 0, Math.PI / 2]);
    b.add(ext([[0, 0.0], [0.32, 0.0], [0.18, 0.1], [0.24, 0.13], [0.06, 0.06], [0.0, 0.05]], 0.05, 0.015), S.point(), [2.02, 0.69, 0], [0, 0, 0], [1, 1, 1]);
    b.add(cone(0.06, 0.34, 5), S.point(), [2.18, 0.72, 0], [0, 0, -Math.PI / 2]);
    // the slings: two thick red rubber bands from the muzzle, stretched back to the spear notches
    const Rb = tx('sling', 32, 8, (p) => { p.all(PAL.red, 3); p.R(0, 1, 32, 2, PAL.red, 4.5); p.R(0, 6, 32, 2, PAL.red, 1.5); });
    const sling = mat('sling', Rb, { rough: 0.5 });
    for (const z of [0.2, -0.2]) b.add(tube([[1.74, 0.6, z], [1.0, 0.68, z * 0.6], [0.2, 0.73, z * 0.15]], 0.045, { radial: 5, segs: 8 }), sling);
    b.add(cbox(0.08, 0.1, 0.36, 0.02), S.chrome(), [0.2, 0.74, 0]);
    // the pistol grip, trigger and guard, the shoulder stock down the left
    const grip: V2[] = [[-0.62, 0.38], [-0.3, 0.38], [-0.28, 0.2], [-0.36, -0.4], [-0.42, -0.86], [-0.7, -0.88], [-0.66, -0.4], [-0.62, 0.0]];
    b.add(ext(grip, 0.26, 0.07, { rects: { pz: Tk.r(0, 0, 32, 16), side: Tk.r(0, 0, 32, 16) } }), teak);
    for (let y = -0.75; y < 0.1; y += 0.12) b.add(cbox(0.06, 0.03, 0.27, 0.01), mat('gripLine', tx('gripLine', 8, 8, (p) => p.all(pal('#9a5a2a'), 1.5)), { rough: 0.8 }), [-0.4 - (0.1 - y) * 0.1, y, 0], [0, 0, -0.15]);
    b.add(tube([[-0.24, 0.38, 0], [-0.12, 0.18, 0], [-0.18, 0.04, 0], [-0.32, 0.06, 0]], 0.03, { radial: 4, segs: 8 }), brass);
    b.add(cbox(0.05, 0.2, 0.06, 0.015), S.chrome(), [-0.2, 0.22, 0], [0, 0, 0.3]);
    const stock: V2[] = [[-1.55, 0.38], [-0.9, 0.38], [-1.0, 0.2], [-1.5, -0.2], [-1.62, -0.6], [-1.95, -0.62], [-1.9, -0.2], [-1.75, 0.2]];
    b.add(ext(stock, 0.24, 0.07, { rects: { pz: Tk.r(0, 0, 48, 16), side: Tk.r(0, 0, 48, 16) } }), teak);
    b.add(cbox(0.38, 0.1, 0.26, 0.03), S.rubber(), [-1.78, -0.64, 0], [0, 0, 0.06]);
    // a line reel under the barrel with a few turns of line
    b.add(cyl(0.16, 0.1, 10, { ch: 0.03 }), brass, [0.6, 0.24, 0], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.12, 0.12, 10), S.line(), [0.6, 0.24, 0], [Math.PI / 2, 0, 0]);
    b.add(tube([[0.6, 0.12, 0.08], [1.2, 0.3, 0.1], [1.9, 0.68, 0.06]], 0.012, { radial: 3, segs: 10 }), S.line());
    b.add(brilliant(0.08, 6), S.amethyst(), [-1.3, 0.1, 0.13]);
    b.add(brilliant(0.06, 6), S.amethyst(), [1.72, 0.55, 0.23]);
  },
};
