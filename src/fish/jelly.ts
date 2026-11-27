// Mauve stinger (Pelagia noctiluca), upright: bell apex +y, everything hanging down -y.
//   bell        a deep mushroom dome with a 16-lobed scalloped margin (lappets), the faint radial canals, and the
//               nematocyst warts set in neat radial rows (deep mauve dots that thin out toward the apex)
//   subumbrella the paler underside of the bell, the four-cornered mouth stalk in the middle
//   oral arms   four long, twisting, frilly ribbons, mauve with paler ruffled edges, longer than the bell
//   tentacles   eight long, fine marginal tentacles from the notches between the lappets
// Swim mode 1: the bell contracts quickly and relaxes slowly (shader), the arms and tentacles trail and sway.
import * as THREE from 'three';
import { Kit } from './kit';
import { Page, C, mix, shade } from './page';
import { V3 } from '../gfx/loft';
import type { SpeciesAsset } from './model';
import { kitAsset, paintRect } from './kitutil';
import { smoothstep } from './curve';

const TAU = Math.PI * 2;

export function jellyfish(): SpeciesAsset {
  const pg = new Page(256, 256), K = new Kit(pg);
  const R = 0.24, H = 0.22, LAP = 16;
  const bellR = pg.alloc(128, 96), innerR = pg.alloc(64, 48), tentR = pg.alloc(8, 48), armR = pg.alloc(48, 128);
  // ------------------------------------------------------------------------------------------ paint
  // bell: u around (0..1), v apex (0) -> margin (1)
  paintRect(pg, bellR, (u, v) => {
    // a clean 5-tone hue-shifted ramp: blush apex -> mauve shoulder -> deep plum margin band
    let c = mix(C('#fbdcec'), C('#e6a2cc'), smoothstep(0.0, 0.55, v));
    c = mix(c, C('#c8609e'), smoothstep(0.55, 0.86, v));
    let a = 0.62 + v * 0.12, h = 0;
    const lu = (u * LAP) % 1;           // position within a lappet sector
    // 16 radial canals: thin darker lines on the sector borders, fading out toward the apex
    if (Math.abs(lu - 0.5) < 0.05 && v > 0.16 && v < 0.86) { c = mix(c, C('#b0508e'), 0.55); a += 0.1; }
    // nematocyst warts: two small round plum dots per lappet sector, centred between the canals (clean, countable)
    {
      const cu = Math.min(lu, 1 - lu) * (TAU / LAP) * R * Math.sin(Math.min(1, v) * Math.PI * 0.5);
      for (const v0 of [0.7]) {
        const q = Math.hypot(cu / 0.016, (v - v0) / 0.04);
        if (q < 1) { c = mix(c, C('#b04a88'), q < 0.55 ? 0.7 : 0.4); a = 0.9; h = 1; }
      }
    }
    // lappets: the scalloped margin band is a deeper plum with a pale frosted lip
    if (v > 0.86) { c = v > 0.95 ? C('#ffd0ea') : C('#94306e'); a = 0.88; }
    return [c, a, 0.18, h];
  }, (u, v) => (v > 0.86 && v < 0.95 ? [70, 16, 56] : null));
  paintRect(pg, innerR, (u, v) => {
    // subumbrella: pale with four darker gonad crescents and the mouth stalk
    const ang = u * TAU;
    let c = mix(C('#f4c4e0'), C('#c870aa'), v * 0.7);
    const g = Math.abs(Math.sin(ang * 2));
    if (g > 0.75 && v > 0.3 && v < 0.6) c = mix(c, C('#9a3a7c'), 0.55);
    return [c, 0.5, 0.2, 0];
  });
  paintRect(pg, tentR, (u, v, i, j) => [mix(C('#f2a8d8'), C('#b04890'), v), 0.85 - v * 0.2, 0.3, 0], (u, v, i, j) => ((j % 6) === 0 ? [120, 36, 100] : null));
  paintRect(pg, armR, (u, v) => {
    // frilly ribbon: the ruffled edges are cut out with alpha, darker folds run down the middle
    const edge = 0.5 - Math.abs(u - 0.5);
    const frill = 0.07 + 0.05 * Math.sin(v * 64) + 0.025 * Math.sin(v * 21 + 1);
    if (edge < frill * (0.6 + v * 0.6) - 0.05) return [[0, 0, 0], 0, 0.3, 0];
    const fold = Math.sin(v * 64 + u * 3);
    let c = mix(C('#f2a4d6'), C('#9a3080'), smoothstep(0.1, 0.9, v));
    if (edge < frill * (0.6 + v * 0.6) + 0.02) c = mix(c, C('#ffd8f0'), 0.6);
    else if (Math.abs(u - 0.5) < 0.06) c = shade(c, 0.78);
    c = shade(c, 0.94 + fold * 0.08);
    return [c, 0.8, 0.25, fold * 0.3];
  });
  // ------------------------------------------------------------------------------------------ bell
  const NS = LAP * 2, NR = 8;
  const bellPt = (th: number, v: number, k: number): V3 => {
    const lu = ((th / TAU) * LAP) % 1;
    // lappet scallop: margin bulges out mid-lobe, notches in between
    const lap = v > 0.82 ? (Math.sin(Math.PI * lu) - 0.6) * 0.05 * smoothstep(0.82, 1, v) : 0;
    const r = R * k * Math.pow(Math.sin((v * Math.PI) / 2), 0.7) * (1 + lap);
    const y = H * k * Math.pow(Math.cos((v * Math.PI) / 2), 1.0) - (k < 1 ? 0.014 : 0) - (v > 0.9 ? (v - 0.9) * 0.18 * R : 0);
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  };
  for (const [k, rect, flip, nr] of [[1, bellR, false, NR], [0.92, innerR, true, 4]] as [number, typeof bellR, boolean, number][]) {
    const rings: { pts: V3[]; v: number }[] = [];
    for (let i = 1; i <= nr; i++) {
      const v = Math.pow(i / nr, 0.85), pts: V3[] = [];
      for (let j = 0; j <= NS; j++) pts.push(bellPt((TAU * j) / NS, v, k));
      rings.push({ pts, v });
    }
    K.loftPart(rings, rect, { start: [0, H * k - (k < 1 ? 0.014 : 0), 0], flip }, (i, A, p) => {
      A.swim[i * 4] = Math.min(1, Math.hypot(p[0], p[2]) / R); A.ao[i] = flip ? 0.75 : 1;
    });
  }
  // mouth stalk (manubrium): a short four-sided column under the bell
  {
    const rings = [0, 1, 2].map((k) => ({ pts: Kit.ring([0, -0.005 - k * 0.04, 0], [1, 0, 0], [0, 0, 1], 0.035 - k * 0.006, 0.035 - k * 0.006, 4, 1.4), v: k / 2 }));
    K.loftPart(rings, innerR, {}, (i, A) => { A.ao[i] = 0.85; });
  }
  // ------------------------------------------------------------------------------------------ marginal tentacles
  for (let n = 0; n < 8; n++) {
    const th = ((n * 2 + 1) / LAP) * TAU + TAU / LAP * 0.0, L = 1.05 + ((n * 5) % 7) / 7 * 0.45;
    const path: V3[] = [];
    for (let i = 0; i <= 12; i++) { const f = i / 12; const rr = R * (0.95 - f * 0.3); path.push([Math.cos(th) * rr, -0.01 - f * L, Math.sin(th) * rr]); }
    const from = K.lo.count;
    K.lo.tube(path, (t) => 0.005 * (1 - t * 0.6), 3, pg.reg(tentR), K.newG(), { capEnd: true });
    K.tag(from, (i, A) => { const p = K.lo.pos(i); const f = Math.min(1, -p[1] / L); A.swim[i * 4] = 1; A.swim[i * 4 + 1] = n * 1.7; A.swim[i * 4 + 2] = f; A.ao[i] = 1; });
  }
  // ------------------------------------------------------------------------------------------ oral arms
  for (let n = 0; n < 4; n++) {
    const th0 = (n / 4) * TAU + TAU / 8, L = 0.62 + (n % 2) * 0.08;
    const grid: V3[][] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const f = i / N, th = th0 + f * 2.6, w = 0.055 * (1 - f * 0.6) * (0.75 + 0.25 * Math.sin(f * 9 + n));
      const rr = 0.03 + f * 0.035;
      const c: V3 = [Math.cos(th0 + f * 0.6) * rr, -0.08 - f * L, Math.sin(th0 + f * 0.6) * rr];
      const d: V3 = [Math.cos(th) * w, 0.012 * Math.sin(f * 17), Math.sin(th) * w];
      // ruffled edges: the two outer columns curl off the ribbon's plane in alternating frills (a curtain, not a strip)
      const nx = -Math.sin(th), nz = Math.cos(th), fr = 0.022 * (1 - f * 0.4);
      const e1 = Math.sin(f * 38 + n) * fr, e2 = Math.sin(f * 38 + n + 2.2) * fr;
      grid.push([
        [c[0] - d[0] + nx * e1, c[1] - d[1], c[2] - d[2] + nz * e1],
        [c[0] - d[0] * 0.5 + nx * e1 * 0.3, c[1] - d[1] * 0.5, c[2] - d[2] * 0.5 + nz * e1 * 0.3],
        c,
        [c[0] + d[0] * 0.5 + nx * e2 * 0.3, c[1] + d[1] * 0.5, c[2] + d[2] * 0.5 + nz * e2 * 0.3],
        [c[0] + d[0] + nx * e2, c[1] + d[1], c[2] + d[2] + nz * e2],
      ]);
    }
    K.sheetPart(grid, armR, 0, (i, A, u, v) => { A.swim[i * 4] = 1; A.swim[i * 4 + 1] = n * 2.3 + 0.5; A.swim[i * 4 + 2] = 0.12 + v * 0.75; A.ao[i] = 0.92; });
  }
  const { geo } = K.geometry();
  return kitAsset('jellyfish', geo, pg, {
    length: R * 2, mouth: [0, -0.02, 0], eye: [0, H * 0.5, R * 0.6], mode: 1,
    shape: [0, 1, 0, 0], shape2: [1, 2, 0.008, 0], amp: 0, freq: 0.85, freqK: 0.2,
    emissive: 1.2, uwo: { rim: 0.6, rimCol: [1, 0.7, 0.9], sss: [1, 0.6, 0.85], sssK: 0.9, caustics: 0.6 },
    side: THREE.DoubleSide, palette: 16,
  });
}
