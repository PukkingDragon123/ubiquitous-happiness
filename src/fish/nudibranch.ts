// Sea slugs (nudibranchs, v8), built with the Kit for the side-on camera: nose +x, up +y, near side +z. Each crawls on
// a flat sole (a slow travelling ripple: swim mode 0, vertical), and its frills / cerata / gills / rhinophores carry
// flutter weights so they wave on their own.
//   spanish_dancer  Hexabranchus sanguineus: a plump crimson body ringed by a broad flaring mantle skirt with a cream
//                   rim (it swims by rippling it), red rhinophores with white tips, a rosette of six branched gills
//   blue_dragon     Glaucus atlanticus: a slim silver-blue body floating belly-up, navy side stripes, a long pointed
//                   tail and three pairs of arms each fanned with finger cerata (the stolen stingers glow in them)
//   sea_bunny       Jorunna parva: a plump yellow-cream dome furred with papillae and black speckles, two tall
//                   black-tipped rhinophore "ears" and a white feathery gill "tail"
//   lettuce_slug    Elysia crispata: a green body under two great ruffled parapodia, pale veins, white and lavender
//                   frilled edges, rolled rhinophores
//   glow_dorid      a Chromodoris-like dorid: violet-blue mantle, black lines, a cream margin with a glowing aqua rim
//                   (it lights the dark), orange lamellate rhinophores and an orange plume of eight feathery gills
import * as THREE from 'three';
import { Kit } from './kit';
import { Page, paintSwatch, C, mix, shade, type Rect } from './page';
import { V3, add, scale, norm } from '../gfx/loft';
import type { SpeciesAsset } from './model';
import { kitAsset, paintRect, cells } from './kitutil';
import { smoothstep } from './curve';

const TAU = Math.PI * 2;

/** a slug body lofted tail (-L/2) to head (+L/2) on a flat sole; W / H are the half width / dome height along f */
function slugBody(K: Kit, rect: Rect, L: number, W: (f: number) => number, H: (f: number) => number, o: { n?: number; sole?: number; rings?: number; sq?: number } = {}) {
  const rings: { pts: V3[]; v: number }[] = [];
  const NR = o.rings ?? 22, sole = o.sole ?? 0.22;
  for (let k = 1; k < NR; k++) {
    const f = k / NR, x = -L / 2 + f * L, h = H(f), w = W(f);
    rings.push({ pts: Kit.ring([x, h * sole, 0], [0, 0, 1], [0, 1, 0], w, h * (1 - sole), o.n ?? 18, o.sq ?? 2.2, h * sole), v: f });
  }
  const f0 = H(0.02), f1 = H(0.98);
  return K.loftPart(rings, rect, { start: [-L / 2 - 0.002, f0 * sole, 0], end: [L / 2 + 0.003, f1 * sole + f1 * 0.2, 0] });
}
/** the top of the body at (f, side angle): the point on the dome surface and its outward normal */
function onBody(L: number, W: (f: number) => number, H: (f: number) => number, f: number, th: number, sole = 0.22): { p: V3; n: V3 } {
  const x = -L / 2 + f * L, h = H(f), w = W(f);
  const p: V3 = [x, h * sole + Math.cos(th) * h * (1 - sole), Math.sin(th) * w];
  return { p, n: norm([0, Math.cos(th) / Math.max(1e-3, h), Math.sin(th) / Math.max(1e-3, w)]) };
}
/** a lamellate rhinophore: a stalk and a ringed club (cone), waving gently */
function rhinophore(K: Kit, base: V3, dir: V3, len: number, rad: number, rect: Rect, phase: number) {
  K.tube([base, add(base, scale(dir, len * 0.5)), add(base, scale(dir, len))], (t) => rad * (t < 0.35 ? 0.7 : 1.15 - (t - 0.35) * 1.1), 8, rect, { flutter: 0.35, phase, capEnd: true });
}

// ============================================================================================ Spanish dancer
function spanishDancer(): SpeciesAsset {
  const pg = new Page(256, 256), K = new Kit(pg);
  const bodyR = pg.alloc(176, 64), skirtR = pg.alloc(176, 24), rhR = pg.alloc(8, 24), gillR = pg.alloc(8, 16);
  const L = 0.42;
  const W = (f: number) => 0.075 * Math.pow(Math.sin(Math.PI * f), 0.55);
  const H = (f: number) => 0.08 * Math.pow(Math.sin(Math.PI * f), 0.6);
  paintRect(pg, bodyR, (u, v, i, j) => {
    const top = Math.cos(u * TAU);
    let c = mix(C('#7a0a18'), C('#d0283a'), 0.35 + 0.5 * Math.max(0, top));
    // paler rosettes in a jittered lattice (Hexabranchus' mottling), each with a darker heart
    const q = cells(i, j * 1.3, 11, 0.7, 4);
    if (q.d < 0.32 && top > -0.3) c = mix(c, C('#ff6a5a'), 0.55);
    if (q.d < 0.12 && top > -0.3) c = mix(c, C('#8a0a1a'), 0.6);
    if (top < -0.6) c = mix(c, C('#ff9a8a'), 0.5);                   // the pale sole
    return [c, 1, 0.55, q.d < 0.32 ? 0.6 : 0.2];
  });
  paintRect(pg, skirtR, (u, v, i) => {
    // root -> rim (v): crimson with fine white veining, then the cream rim band
    let c = mix(C('#a01020'), C('#e83a40'), v);
    if (i % 9 === 0 && v < 0.7) c = mix(c, C('#ffb0a0'), 0.5);
    if (v > 0.74) c = v > 0.9 ? C('#fff2dc') : C('#ffd8b0');
    return [c, 1, 0.5, v > 0.74 ? 0.8 : 0.2];
  });
  paintSwatch(pg, rhR, ['#fff4e8', '#ff8a7a', '#c01828', '#7a0a18'], 0.5);
  paintSwatch(pg, gillR, ['#fff2e4', '#ffb0a0', '#e03a40', '#900a1a'], 0.5);
  slugBody(K, bodyR, L, W, H, { rings: 24 });
  // the mantle skirt: a closed frilly ring round the body's flanks, flaring out and rippling (flutter grows to the rim)
  const NA = 48, NRr = 5, grid: V3[][] = [];
  for (let r = 0; r <= NRr; r++) {
    const row: V3[] = [], t = r / NRr;
    for (let c = 0; c <= NA; c++) {
      const a = (c / NA) * TAU, f = 0.5 + Math.cos(a) * 0.46, side = Math.sin(a);
      const w = W(f), h = H(f);
      const out = 0.01 + t * 0.06 * (0.75 + 0.25 * Math.abs(side));
      const wav = Math.sin(a * 9) * 0.011 * t * t;
      // ring in the top view: x along the length, z out to the side
      const x = -L / 2 + f * L + Math.cos(a) * out * 0.9;
      const z = side * (w * 0.92 + out);
      row.push([x, h * 0.32 + t * t * 0.04 + wav, z]);
    }
    grid.push(row);
  }
  K.sheetPart(grid, skirtR, 0.004, (i, A, u, v) => { A.swim[i * 4] = v * v * 1.0; A.swim[i * 4 + 1] = u * TAU * 3; });
  // rhinophores and the gill rosette
  for (const s of [-1, 1]) {
    const { p } = onBody(L, W, H, 0.86, s * 0.45);
    rhinophore(K, p, norm([0.35, 1, s * 0.3]), 0.05, 0.007, rhR, s);
  }
  const g = onBody(L, W, H, 0.18, 0).p;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU, d = norm([Math.cos(a) * 0.7 - 0.2, 0.9, Math.sin(a) * 0.7]);
    const b = add(g, [Math.cos(a) * 0.012, 0, Math.sin(a) * 0.012]);
    const mid = add(b, scale(d, 0.022));
    K.tube([b, mid], () => 0.004, 6, gillR, { flutter: 0.4, phase: k });
    for (let q = 0; q < 3; q++) { const qa = a + (q - 1) * 0.7; K.cone(mid, norm([Math.cos(qa) * 0.8, 0.7, Math.sin(qa) * 0.8]), 0.02, 0.004, gillR, 4, { flutter: 0.8, phase: k + q }); }
  }
  // oral tentacles under the head
  for (const s of [-1, 1]) K.cone(onBody(L, W, H, 0.98, s * 1.6).p, [1, -0.2, s * 0.6], 0.025, 0.006, rhR, 4, { flutter: 0.4, phase: s });
  const { geo } = K.geometry();
  return kitAsset('spanish_dancer', geo, pg, {
    length: L, mouth: [L / 2, 0.01, 0], eye: [L / 2 - 0.04, 0.05, 0.03], vertical: true,
    shape: [L / 2, L, 1.4, 0.25], shape2: [1.6, 2.4, 0.045, 0], amp: 0.12, freq: 0.5, freqK: 0.45, palette: 16,
    uwo: { rim: 0.3, sss: [1, 0.5, 0.5], sssK: 0.6 },
  });
}

// ============================================================================================ blue dragon
function blueDragon(): SpeciesAsset {
  const pg = new Page(256, 128), K = new Kit(pg);
  const bodyR = pg.alloc(160, 48), cerR = pg.alloc(8, 24), armR = pg.alloc(16, 16), rhR = pg.alloc(8, 16);
  const L = 0.3;
  const W = (f: number) => 0.034 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.25)), 0.7) * (f > 0.85 ? 1 - (f - 0.85) * 2.2 : 1) + 0.002;
  const H = (f: number) => 0.032 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.25)), 0.7) * (f > 0.85 ? 1 - (f - 0.85) * 2.2 : 1) + 0.002;
  // it floats belly-up: the blue sole faces the sky, the silver back faces down; navy stripes along the flanks
  paintRect(pg, bodyR, (u, v, i) => {
    const top = Math.cos(u * TAU);
    let c = top > 0.35 ? mix(C('#2a5ae8'), C('#7ab4ff'), (top - 0.35) * 1.5) : top > -0.2 ? C('#e8f0ff') : C('#b4c4dc');
    if (Math.abs(top - 0.25) < 0.08 || Math.abs(top + 0.3) < 0.06) c = C('#0c1a6a');
    if (top > 0.8 && i % 5 === 0) c = C('#c8e0ff');
    if (v < 0.12) c = mix(c, C('#1a3aa8'), 0.6);                              // the tail tip darker
    return [c, 1, 0.35, Math.abs(top - 0.25) < 0.08 ? 0 : 0.5];
  }, (u, v) => (Math.cos(u * TAU) > 0.6 && v > 0.2 ? C('#0a1a40') : null));
  paintSwatch(pg, cerR, ['#0a1450', '#2a5ae8', '#8ac8ff', '#e8f4ff'], 0.3, ['#3a8aff', '#1a40a0', '#06102a', '#000000']);
  paintSwatch(pg, armR, ['#c8dcff', '#4a7ae8', '#1a3aa8'], 0.4);
  paintSwatch(pg, rhR, ['#e8f0ff', '#6a9aff', '#1a3aa8'], 0.4);
  slugBody(K, bodyR, L, W, H, { rings: 26, sole: 0.4 });
  // three pairs of arms, each a stubby peduncle with a fan of finger cerata
  const arms: [number, number, number][] = [[0.66, 0.066, 9], [0.5, 0.058, 8], [0.36, 0.048, 7]];
  arms.forEach(([f, len, nc], ai) => {
    for (const s of [-1, 1]) {
      const { p } = onBody(L, W, H, f, s * 1.45, 0.4);
      const dir = norm([-0.15, s > 0 ? 0.55 : -0.25, s * 0.85]);
      const tip = add(p, scale(dir, len * 0.45));
      K.tube([p, tip], (t) => 0.006 * (1 - t * 0.3), 6, armR, { capEnd: true });
      for (let k = 0; k < nc; k++) {
        const a = ((k / (nc - 1)) - 0.5) * 2.4;
        const cd = norm([Math.sin(a) * 0.9 + dir[0] * 0.4, dir[1] * 0.9 + Math.cos(a) * 0.4 * (s > 0 ? 1 : -0.6), dir[2] * 0.8]);
        K.cone(tip, cd, len * (0.6 + 0.4 * Math.cos(a * 0.8)), 0.0042, cerR, 4, { flutter: 1, phase: ai * 2 + k * 0.6 + s });
      }
    }
  });
  // head: small rhinophores and oral tentacles
  for (const s of [-1, 1]) {
    K.cone(onBody(L, W, H, 0.93, s * 0.5, 0.4).p, [0.5, 1, s * 0.4], 0.016, 0.003, rhR, 4, { flutter: 0.3, phase: s });
    K.cone(onBody(L, W, H, 0.97, s * 1.4, 0.4).p, [1, -0.2, s * 0.6], 0.02, 0.003, rhR, 4, { flutter: 0.4, phase: s * 2 });
  }
  const { geo } = K.geometry();
  return kitAsset('blue_dragon', geo, pg, {
    length: L, mouth: [L / 2, 0.01, 0], eye: [L / 2 - 0.02, 0.03, 0.02], vertical: true,
    shape: [L / 2, L, 1.2, 0.2], shape2: [1.6, 2.0, 0.02, 0], amp: 0.1, freq: 0.6, freqK: 0.3, emissive: 1.2, palette: 16,
    uwo: { rim: 0.45, sss: [0.6, 0.8, 1], sssK: 0.7 },
  });
}

// ============================================================================================ sea bunny
function seaBunny(): SpeciesAsset {
  const pg = new Page(256, 128), K = new Kit(pg);
  const bodyR = pg.alloc(144, 56), furR = pg.alloc(8, 8), earR = pg.alloc(8, 24), gillR = pg.alloc(8, 16);
  const L = 0.15;
  const W = (f: number) => 0.054 * Math.pow(Math.sin(Math.PI * f), 0.45);
  const H = (f: number) => 0.064 * Math.pow(Math.sin(Math.PI * f), 0.42);
  // cream-yellow fur: a regular lattice of pale caryophyllidia tips over a buttery base, black specks on a sparser one
  paintRect(pg, bodyR, (u, v, i, j) => {
    const top = Math.cos(u * TAU);
    let c = mix(C('#f0d070'), C('#fff4c4'), 0.25 + 0.65 * Math.max(0, top));
    if (top > 0.2 && (i + j * 3) % 11 === 0) c = mix(c, C('#fffdf0'), 0.6);
    const q = cells(i, j, 13, 0.8, 21);
    if (q.d < 0.075 && top > -0.3) c = C('#2a2010');
    if (top < -0.6) c = C('#f4e0a0');
    return [c, 1, 0.9, 0.4];
  });
  paintSwatch(pg, furR, ['#fffbea', '#fff0b8', '#e8c860'], 0.9);
  paintRect(pg, earR, (u, v, i, j) => {
    // v 0 = tip: black tip, then a yellow-cream ear with lamella bands
    // v 0 = the root, 1 = the black tip, lamella bands between
    let c = v > 0.66 ? C('#141008') : (j % 3 === 0 ? C('#e0c060') : C('#fff2c0'));
    if (v > 0.58 && v <= 0.66) c = C('#5a4a20');
    void i;
    return [c, 1, 0.8, j % 3 === 0 ? 0 : 0.6];
  });
  paintSwatch(pg, gillR, ['#ffffff', '#fff4d8', '#e8d090'], 0.8);
  slugBody(K, bodyR, L, W, H, { rings: 18, sole: 0.25 });
  // the fur: short papillae all over the dome in a golden-angle spiral (soft silhouette)
  for (let k = 0; k < 150; k++) {
    const f = 0.1 + ((k * 0.61803) % 1) * 0.8, th = (((k * 0.7548777 + 0.3) % 1) * 2 - 1) * 1.45;
    const { p, n } = onBody(L, W, H, f, th, 0.25);
    K.cone(p, n, 0.008 + (k % 3) * 0.002, 0.0034, furR, 3, { flutter: 0.1, phase: k });
  }
  // the ears: two tall rhinophores, leaning out a little
  for (const s of [-1, 1]) {
    const { p } = onBody(L, W, H, s > 0 ? 0.82 : 0.74, s * 0.5, 0.25);
    K.tube([p, add(p, [0.004 - (s < 0 ? 0.006 : 0), 0.022, s * 0.008]), add(p, [0.002 - (s < 0 ? 0.014 : 0), 0.044, s * 0.016])], (t) => 0.0085 * (t < 0.2 ? 0.8 : 1 - (t - 0.2) * 0.75), 8, earR, { flutter: 0.3, phase: s * 1.3, capEnd: true });
  }
  // the cotton tail: a ring of white feathery gills at the rear
  const g = onBody(L, W, H, 0.17, 0, 0.25).p;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    K.cone(add(g, [Math.cos(a) * 0.006, 0, Math.sin(a) * 0.006]), norm([Math.cos(a) * 0.6 - 0.4, 0.8, Math.sin(a) * 0.6]), 0.018, 0.004, gillR, 4, { flutter: 0.6, phase: k });
  }
  const { geo } = K.geometry();
  return kitAsset('sea_bunny', geo, pg, {
    length: L, mouth: [L / 2, 0.01, 0], eye: [L / 2 - 0.02, 0.04, 0.02], vertical: true,
    shape: [L / 2, L, 1, 0.3], shape2: [1.6, 1.6, 0.015, 0], amp: 0.06, freq: 0.7, freqK: 0.3, palette: 14,
    uwo: { rim: 0.3, sss: [1, 0.95, 0.7], sssK: 0.5 },
  });
}

// ============================================================================================ lettuce slug
function lettuceSlug(): SpeciesAsset {
  const pg = new Page(256, 128), K = new Kit(pg);
  const bodyR = pg.alloc(128, 40), frR = pg.alloc(160, 32), rhR = pg.alloc(8, 16);
  const L = 0.24;
  const W = (f: number) => 0.022 * Math.pow(Math.sin(Math.PI * f), 0.6) + 0.004;
  const H = (f: number) => 0.026 * Math.pow(Math.sin(Math.PI * f), 0.6) + 0.003;
  paintRect(pg, bodyR, (u, v, i) => {
    const top = Math.cos(u * TAU);
    let c = mix(C('#3a8a2a'), C('#9ad84a'), 0.4 + 0.5 * Math.max(0, top));
    if (i % 7 === 0) c = mix(c, C('#e0ffc0'), 0.35);
    if (top < -0.6) c = C('#c8f090');
    return [c, 1, 0.5, 0.3];
  });
  // the parapodia: green with pale branching veins toward the rim, a white edge and a lavender-blue trim
  paintRect(pg, frR, (u, v, i) => {
    let c = mix(C('#2a6a1a'), C('#7ac83a'), v * 0.9);
    const vein = Math.abs(((i + Math.floor(v * 6)) % 10) - 5) < 0.6 && v > 0.2 && v < 0.78;
    if (vein) c = mix(c, C('#dcffc0'), 0.6);
    if (v > 0.78) c = v > 0.9 ? C('#ffffff') : C('#b8a8ff');
    return [c, 1, 0.5, vein ? 0.6 : v > 0.78 ? 0.9 : 0.2];
  });
  paintSwatch(pg, rhR, ['#ffffff', '#c8f090', '#4a9a2a'], 0.5);
  slugBody(K, bodyR, L, W, H, { rings: 20 });
  // two parapodia rising off the back, ruffled into many folds (the ruffle and flutter grow to the edge)
  for (const s of [-1, 1]) {
    const NR = 4, NC = 30, grid: V3[][] = [];
    for (let r = 0; r <= NR; r++) {
      const t = r / NR, row: V3[] = [];
      for (let c = 0; c <= NC; c++) {
        const f = 0.12 + (c / NC) * 0.72;
        const { p } = onBody(L, W, H, f, s * 1.1);
        const env = Math.sin(Math.PI * (c / NC));
        const up = t * 0.05 * env + 0.002, outw = t * 0.03 * env;
        const ruf = Math.sin(c * 1.9) * 0.012 * t * t * env;
        row.push([p[0] + Math.sin(c * 1.9 + 1) * 0.004 * t * env, p[1] + up + ruf * 0.3, p[2] + s * (outw + ruf)]);
      }
      grid.push(row);
    }
    K.sheetPart(grid, frR, 0.003, (i, A, u, v) => { A.swim[i * 4] = v * v * 0.8; A.swim[i * 4 + 1] = u * 12 + s; });
  }
  for (const s of [-1, 1]) rhinophore(K, onBody(L, W, H, 0.95, s * 0.6).p, norm([0.6, 0.8, s * 0.35]), 0.022, 0.0045, rhR, s);
  const { geo } = K.geometry();
  return kitAsset('lettuce_slug', geo, pg, {
    length: L, mouth: [L / 2, 0.01, 0], eye: [L / 2 - 0.02, 0.03, 0.02], vertical: true, side: THREE.DoubleSide,
    shape: [L / 2, L, 1.2, 0.2], shape2: [1.6, 1.4, 0.03, 0], amp: 0.06, freq: 0.6, freqK: 0.3, palette: 14,
    uwo: { rim: 0.35, sss: [0.7, 1, 0.6], sssK: 0.7 },
  });
}

// ============================================================================================ glow dorid
function glowDorid(): SpeciesAsset {
  const pg = new Page(256, 128), K = new Kit(pg);
  const bodyR = pg.alloc(160, 56), rhR = pg.alloc(8, 24), gillR = pg.alloc(8, 16), rimR = pg.alloc(160, 12);
  const L = 0.22;
  const W = (f: number) => 0.046 * Math.pow(Math.sin(Math.PI * f), 0.42);
  const H = (f: number) => 0.046 * Math.pow(Math.sin(Math.PI * f), 0.5);
  paintRect(pg, bodyR, (u, v, i) => {
    const top = Math.cos(u * TAU), side = Math.abs(Math.sin(u * TAU));
    let c = mix(C('#3a2aa8'), C('#7a6af0'), 0.3 + 0.5 * Math.max(0, top));
    if (top > 0.85 && v > 0.12 && v < 0.88) c = mix(c, C('#f4f0ff'), 0.5);            // the pale midline ridge
    if (Math.abs(top - 0.45) < 0.06 && v > 0.1 && v < 0.9) c = C('#0a0820');            // black lines either side
    if (top < 0.2 && top > -0.25) c = C('#fff4e0');                                     // the cream margin
    if (top < -0.05 && top > -0.25) c = C('#ffc040');                                   // yellow edge
    if (top < -0.25) c = C('#e8e0ff');
    if (i % 9 === 0 && top > 0.2) c = shade(c, 1.12);
    void side;
    return [c, 1, 0.45, Math.abs(top - 0.45) < 0.06 ? 0 : 0.5];
  }, (u) => { const top = Math.cos(u * TAU); return top < -0.05 && top > -0.25 ? C('#40e8d8') : null; });
  paintSwatch(pg, rhR, ['#fff0c0', '#ff9a30', '#e05a10', '#8a2a08'], 0.5);
  paintSwatch(pg, gillR, ['#fff4d0', '#ffaa40', '#e06010', '#8a3008'], 0.5);
  paintSwatch(pg, rimR, ['#c0fff4', '#40e8d8', '#1a9a90'], 0.3, ['#80fff0', '#30c8c0', '#106a66']);
  slugBody(K, bodyR, L, W, H, { rings: 22, sole: 0.3, sq: 2.6 });
  // a thin glowing frill round the mantle edge
  const NA = 40, grid: V3[][] = [];
  for (let r = 0; r <= 2; r++) {
    const row: V3[] = [], t = r / 2;
    for (let c = 0; c <= NA; c++) {
      const a = (c / NA) * TAU, f = 0.5 + Math.cos(a) * 0.47, side = Math.sin(a);
      const w = W(f), h = H(f);
      row.push([-L / 2 + f * L + Math.cos(a) * t * 0.008, h * 0.3 + Math.sin(a * 7) * 0.003 * t, side * (w * 0.98 + t * 0.012)]);
    }
    grid.push(row);
  }
  K.sheetPart(grid, rimR, 0.002, (i, A, u, v) => { A.swim[i * 4] = v * 0.5; A.swim[i * 4 + 1] = u * TAU * 2; });
  for (const s of [-1, 1]) rhinophore(K, onBody(L, W, H, 0.86, s * 0.42, 0.3).p, norm([0.3, 1, s * 0.25]), 0.034, 0.0062, rhR, s);
  // the gill plume: eight feathery gills in a circle near the rear, each a stem with little side cones
  const g = onBody(L, W, H, 0.2, 0, 0.3).p;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, d = norm([Math.cos(a) * 0.55 - 0.25, 0.9, Math.sin(a) * 0.55]);
    const b = add(g, [Math.cos(a) * 0.01, 0, Math.sin(a) * 0.01]);
    K.tube([b, add(b, scale(d, 0.016)), add(b, scale(d, 0.03))], (t) => 0.003 * (1 - t * 0.6), 6, gillR, { flutter: 0.7, phase: k, capEnd: true });
    for (let q = 0; q < 2; q++) K.cone(add(b, scale(d, 0.012 + q * 0.009)), norm([d[0] + Math.cos(a + 1.6) * 0.6, d[1] * 0.4, d[2] + Math.sin(a + 1.6) * 0.6]), 0.009, 0.002, gillR, 3, { flutter: 0.9, phase: k + q });
  }
  const { geo } = K.geometry();
  return kitAsset('glow_dorid', geo, pg, {
    length: L, mouth: [L / 2, 0.01, 0], eye: [L / 2 - 0.02, 0.03, 0.02], vertical: true,
    shape: [L / 2, L, 1.2, 0.2], shape2: [1.6, 1.8, 0.02, 0], amp: 0.06, freq: 0.6, freqK: 0.3, emissive: 1.4, palette: 16,
    uwo: { rim: 0.35, sss: [0.7, 0.6, 1], sssK: 0.6 },
  });
}
void smoothstep;

export const NUDI_SPECIALS: Record<string, () => SpeciesAsset> = {
  spanish_dancer: spanishDancer, blue_dragon: blueDragon, sea_bunny: seaBunny, lettuce_slug: lettuceSlug, glow_dorid: glowDorid,
};
export const NUDI_SPECIES = Object.keys(NUDI_SPECIALS);
