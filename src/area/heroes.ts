// Hero set pieces, one per area, built into the merged chunk meshes (static, a few draw calls):
//   reef      - a giant brain coral grown into an arch; a toppled colossus: a classical marble head lying on its
//               cheek (brow, nose, lips, carved eyes, curls) crowned with coral, its broken bust and fluted
//               column drums half sunk in the sand, all crusted with barnacles;
//   arctic    - an ice cave: a clean glacier-ice arch with deep blue glowing cores, white frost rims and cornice,
//               embedded bubbles and cracks, hanging icicles and a soft halo of light leaking through;
//   kelp      - the light hall: a nave of giant kelp columns under pointed kelp vaults, god rays down the aisle,
//               sunflecks dancing on the floor, and a sunken coral-crusted rose window glowing at the far end;
//   graveyard - a galleon snapped in two: ribs bared at the break, spilled cannons and shot, a carved figurehead,
//               a stern lantern still burning, a draped sail, rope, and a treasure chest half buried in the silt.
import * as THREE from 'three';
import type { World } from '../game/types';
import type { Scenery } from './scenery';
import { Soup, V3, UVR, mat4, v3, icosphere } from '../world/lp';
import { arch } from '../world/rockgen';
import { Rng } from '../core/rng';
import { hash2, smooth } from '../core/math';
import { additiveMaterial } from '../world/mats';
import { UW } from '../gfx/shaders/underwater';
import { TAU, faceUV, faceTone, glowFan, surfacePoints, alignY, marble, iceClear, iceFrost, stainedGlass, rgb01 } from './kit';

export function heroes(scen: Scenery, group: THREE.Group, w: World) {
  switch (scen.a.id) {
    case 'reef': brainArch(scen); colossus(scen); break;
    case 'arctic': iceCave(scen, group); break;
    case 'kelp': lightHall(scen, group); break;
    case 'graveyard': galleon(scen, group, w); break;
  }
}

const g = (x: number, s: number) => Math.exp(-(x / s) * (x / s));

/** append soup `s` (already in world space) to the chunk prop mesh at x */
function toProp(scen: Scenery, x: number, s: Soup) { scen.chunk(x).prop.append(s, new THREE.Matrix4()); }

/** an additive glow / light-shaft mesh in the area group */
function addGlow(scen: Scenery, group: THREE.Group, pos: number[], col: number[], color = '#ffffff', order = 12) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, additiveMaterial(color));
  m.renderOrder = order; m.frustumCulled = false;
  group.add(m);
  scen.disposables.push(geo, m.material as THREE.Material);
  return m;
}

// ------------------------------------------------------------------ reef: brain-coral arch (unchanged)
function brainArch(scen: Scenery) {
  const sh = scen.shape;
  const x = sh.wreckX + 22, z = -5, y = scen.heightAt(x, z);
  const brainUV = scen.flora.atlas.regions.get('brain0') ?? scen.props.get('rock');
  scen.chunk(x).flora.append(arch(scen.seed + 99, { lintel: 0.32, foot: 1.3 }), mat4(x, y - 0.5, z, 4.5, 5.5, 3.2, 0.15), { uv: brainUV });
}

// ------------------------------------------------------------------ reef: the toppled colossus
/** a colossal classical head, unit height (chin y = 0, crown y = 1, neck down to -0.3), face toward +z */
function headSoup(reg: UVR): Soup {
  const s = new Soup();
  const TAB = [[-0.3, 0.2, 0.2, 0.2], [-0.12, 0.21, 0.21, 0.22], [0, 0.24, 0.28, 0.24], [0.08, 0.3, 0.34, 0.27], [0.16, 0.33, 0.36, 0.3], [0.25, 0.35, 0.37, 0.33], [0.33, 0.37, 0.375, 0.36], [0.42, 0.38, 0.37, 0.39], [0.5, 0.385, 0.365, 0.41], [0.58, 0.39, 0.365, 0.42], [0.66, 0.385, 0.355, 0.43], [0.76, 0.37, 0.33, 0.42], [0.85, 0.33, 0.28, 0.37], [0.93, 0.25, 0.2, 0.27], [0.975, 0.15, 0.12, 0.16]];
  const rad = (v: number) => {
    let i = 0; while (i < TAB.length - 2 && TAB[i + 1][0] < v) i++;
    const a = TAB[i], b = TAB[i + 1], t = Math.min(1, Math.max(0, (v - a[0]) / (b[0] - a[0])));
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  };
  const V = [-0.3, -0.14, 0, 0.05, 0.1, 0.15, 0.185, 0.215, 0.245, 0.28, 0.31, 0.335, 0.37, 0.42, 0.46, 0.5, 0.54, 0.585, 0.63, 0.68, 0.74, 0.8, 0.87, 0.93, 0.975];
  const PH: number[] = [];
  for (let k = 0; k <= 28; k++) PH.push(-1.4 + k * 0.1);
  for (let k = 1; k < 8; k++) PH.push(1.4 + k * (TAU - 2.8) / 8);
  const face = (v: number, f: number) => Math.abs(f) < 0.9 && v < 0.74 && v > -0.02;
  // relief: nose, nostrils, carved eyes, brow, cheekbones, lips, chin; tight curls over the skull
  const relief = (v: number, f: number) => {
    let d = 0, dark = 0;
    if (Math.abs(f) < 1.2) {
      const nv = v < 0.31 ? 0 : v < 0.355 ? (v - 0.31) / 0.045 : v < 0.6 ? 1 - ((v - 0.355) / 0.245) * 0.8 : 0;
      d += 0.13 * nv * g(f, 0.17 - (v - 0.31) * 0.25);
      d += 0.028 * g(v - 0.335, 0.02) * (g(f - 0.15, 0.06) + g(f + 0.15, 0.06));
      const sock = 0.055 * g(v - 0.5, 0.05) * (g(f - 0.33, 0.15) + g(f + 0.33, 0.15));
      d -= sock; dark += sock * 7;
      d += 0.03 * g(v - 0.495, 0.024) * (g(f - 0.33, 0.075) + g(f + 0.33, 0.075));
      d += 0.035 * g(v - 0.585, 0.03) * g(f, 0.6) * (0.6 + 0.4 * (g(f - 0.33, 0.2) + g(f + 0.33, 0.2)));
      d += 0.022 * g(v - 0.42, 0.05) * (g(f - 0.56, 0.2) + g(f + 0.56, 0.2));
      d += 0.026 * g(v - 0.245, 0.02) * g(f, 0.28);
      d += 0.032 * g(v - 0.185, 0.018) * g(f, 0.24);
      const groove = 0.024 * g(v - 0.215, 0.012) * g(f, 0.27);
      d -= groove; dark += groove * 14;
      d += 0.045 * g(v - 0.07, 0.05) * g(f, 0.3);
      dark += 0.35 * g(v - 0.315, 0.015) * g(f, 0.12);                  // shadow under the nose
    }
    if (v > 0.6 && !face(v, f)) { const c = 0.5 + 0.5 * Math.sin(f * 9 + v * 22) * Math.sin(f * 5 - v * 31); d += 0.035 * c * smooth(0.6, 0.7, v); dark += (1 - c) * 0.18; }
    return [d, dark];
  };
  const rings: V3[][] = [], shades: number[][] = [];
  for (const v of V) {
    const [rx, rzF, rzB] = rad(v), ring: V3[] = [], sh: number[] = [];
    for (const f of PH) {
      const a = Math.PI / 2 + f, cx = Math.cos(a), cz = Math.sin(a);
      const [d, dark] = relief(v, f);
      const rz = cz > 0 ? rzF : rzB;
      ring.push([cx * (rx + d), v, cz * (rz + d)]);
      sh.push(Math.max(0.45, 1 - dark));
    }
    rings.push(ring); shades.push(sh);
  }
  const n = PH.length, U = (q: V3) => [q[0], q[1]] as [number, number];
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n, a = rings[j][k], b = rings[j][k2], c = rings[j + 1][k2], d = rings[j + 1][k];
    s.tri(a, d, b, U(a), U(d), U(b), shades[j][k], shades[j + 1][k], shades[j][k2]);
    s.tri(b, d, c, U(b), U(d), U(c), shades[j][k2], shades[j + 1][k], shades[j + 1][k2]);
  }
  const top = rings[rings.length - 1], crown: V3 = [0, 1, -0.02];
  for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; s.tri(top[k2], top[k], crown, U(top[k2]), U(top[k]), [0, 1], 0.9, 0.9, 0.9); }
  // the snapped neck: a rough, paler fracture face
  const bot = rings[0], br: V3 = [0.02, -0.26, 0.01];
  for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; s.tri(bot[k], bot[k2], br, U(bot[k]), U(bot[k2]), [0, 0], 1.15, 1.15, 1.2); }
  // ears
  for (const side of [-1, 1]) {
    const f = s.count;
    s.lathe([[0.01, 0], [0.07, 0.02], [0.085, 0.08], [0.07, 0.15], [0.035, 0.19], [0, 0.2]], 6, reg, { sz: 0.4 });
    s.transformSince(f, mat4(side * 0.375, 0.36, -0.03, 1, 1, 1, Math.PI / 2, 0, -side * 0.2));
  }
  // curls: chunky lumps over the skull and the nape
  const r = new Rng(77);
  for (let i = 0; i < 34; i++) {
    const v = r.range(0.64, 0.97), f = r.chance(0.8) ? r.range(0.8, TAU - 0.8) - Math.PI : r.range(-0.9, 0.9);
    if (face(v, f) && v < 0.76) continue;
    const [rx, rzF, rzB] = rad(v), a = Math.PI / 2 + f, cx = Math.cos(a), cz = Math.sin(a);
    const p: V3 = [cx * (rx - 0.005), v, cz * ((cz > 0 ? rzF : rzB) - 0.005)];
    const ico = icosphere(0), sc = r.range(0.06, 0.085), from = s.count;
    for (let q = 0; q < ico.i.length; q += 3) {
      const P = (ix: number): V3 => [ico.p[ix * 3] * sc + p[0], ico.p[ix * 3 + 1] * sc * 0.8 + p[1], ico.p[ix * 3 + 2] * sc + p[2]];
      s.tri(P(ico.i[q]), P(ico.i[q + 1]), P(ico.i[q + 2]), [0, 0], [1, 0], [1, 1], 0.86, 0.86, 0.86);
    }
    void from;
  }
  return s;
}

/** the broken bust: shoulders and chest with a toga sash, snapped at the neck and below the chest */
function bustSoup(reg: UVR): Soup {
  const s = new Soup();
  const TAB: [number, number, number][] = [[0, 0.95, 0.45], [0.35, 1.0, 0.5], [0.65, 1.05, 0.5], [0.82, 1.0, 0.46], [0.92, 0.82, 0.4], [0.98, 0.45, 0.32], [1.0, 0.28, 0.27], [1.12, 0.27, 0.26]];
  const n = 18, r = new Rng(31);
  const rings: V3[][] = TAB.map(([y, rx, rz], j) => {
    const ring: V3[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU, c = Math.cos(a), sn = Math.sin(a);
      const e = j >= 3 && j <= 4 ? 0.55 : 0.8;                      // squarer shoulders
      const jag = j === 0 || j === TAB.length - 1 ? r.range(-0.05, 0.05) : 0;
      ring.push([Math.sign(c) * Math.pow(Math.abs(c), e) * rx, y + jag, Math.sign(sn) * Math.pow(Math.abs(sn), e) * rz]);
    }
    return ring;
  });
  s.loft(rings, reg, { base: [0, 0.04, 0], tip: [0, 1.1, 0] });
  // toga: folds slung from the left shoulder across the chest to the right side
  const fold = (o: number) => {
    const path: V3[] = [];
    for (let q = 0; q <= 8; q++) {
      const t = q / 8, x = -0.75 + t * 1.55 + o * 0.12, y = 0.95 - t * 0.85 - o * 0.1;
      path.push([x, y, 0.5 * Math.sqrt(Math.max(0.05, 1 - (x / 1.08) ** 2)) + 0.03 - Math.abs(o) * 0.01]);
    }
    s.tube(path, () => 0.055, 5, reg);
  };
  for (const o of [-1, 0, 1, 2]) fold(o);
  return s;
}

function colossus(scen: Scenery) {
  const sh = scen.shape, r = new Rng(scen.seed ^ 0x57a7), P = scen.props, stone = marble(P.A), shellR = P.get('shell');
  const sx = sh.wreckX - 24, sz = -5, sy = scen.heightAt(sx, sz);
  const S = new Soup();
  // head and shoulders, sunk to mid-chest and toppled a little: three-quarter view, face lifted to the light
  const Sb = 2.2, H = 2.7;
  const bustFrom = S.count;
  S.append(bustSoup(stone), mat4(0, 0, 0, Sb, Sb, Sb));
  const bustTo = S.count;
  S.append(headSoup(stone), mat4(0, 1.0 * Sb + 0.3 * H, 0.06, H, H, H, 0.18, -0.12, 0.04));
  const headTo = S.count;
  S.transformSince(0, mat4(sx, sy - 0.5 * Sb, sz, 1, 1, 1, 0.5, -0.1, 0.2));
  const headFrom = bustTo;
  // fluted column drums and an Ionic capital
  const drum = (x: number, z: number, L: number, ry: number, rz: number, sink: number) => {
    const f = S.count;
    S.lathe([[0.46, 0], [0.42, 0.06], [0.42, L - 0.06], [0.46, L]], 16, stone, { jit: (_j, k) => (k % 2 ? 0.88 : 1), base: true });
    S.lathe([[0.46, L], [0, L + 0.001]], 16, stone);
    S.transformSince(f, mat4(x, scen.heightAt(x, z) + 0.4 - sink, z, 1, 1, 1, ry, 0, rz));
  };
  drum(sx - 3.6, sz + 1.6, 1.7, 0.6, Math.PI / 2, 0.15);
  drum(sx - 5.2, sz - 1.4, 1.4, -0.3, Math.PI / 2 + 0.1, 0.12);
  drum(sx + 5.5, sz - 3.5, 2.6, 0.2, 0.08, 0.9);                    // a standing stump further back
  {
    const cx = sx + 3.2, cz = sz + 1.8, cy = scen.heightAt(cx, cz) - 0.18, f = S.count;
    S.box([-0.62, 0, -0.5], [1.24, 0.22, 1.0], stone);
    S.box([-0.5, 0.22, -0.42], [1.0, 0.18, 0.84], stone);
    for (const side of [-1, 1]) {
      const path: V3[] = [];
      for (let q = 0; q <= 10; q++) { const a = q * 0.62, rr = 0.2 * (1 - q / 13); path.push([side * (0.55 - rr * Math.cos(a) * 0.3), 0.28 + Math.sin(a) * rr, Math.cos(a) * rr - 0.05]); }
      S.tube(path, (t) => 0.07 * (1 - t * 0.4), 5, stone);
    }
    S.transformSince(f, mat4(cx, cy, cz, 1.2, 1.2, 1.2, 0.5, 0.35, 0.22));
  }
  // weathering: marble below, algae and pink coralline on what faces up, silt where it meets the sand
  faceUV(S, 0, stone, 0.75);
  const alg = rgb01('#7e9a68'), cor = rgb01('#d88e9c');
  faceTone(S, 0, (n, c) => {
    const up = Math.max(0, n[1]), patch = hash2(Math.floor(c[0] * 1.7), Math.floor(c[2] * 1.7 + c[1] * 1.3), 5);
    const k = smooth(0.62, 0.95, up) * (patch > 0.45 ? 0.75 : 0.2);
    const tc = patch > 0.7 ? cor : alg;
    const silt = smooth(0.5, 0, c[1] - scen.heightAt(c[0], c[2]));
    const base = [1.06, 1.03, 0.96];
    const col = base.map((b, i) => (b + (tc[i] * 1.1 - b) * k) * (1 - silt * 0.25)) as [number, number, number];
    return [col[0], col[1], col[2], -1];
  });
  // barnacles in clusters on the upper surfaces
  const bar = new Soup();
  bar.lathe([[0.05, 0], [0.05, 0.025], [0.03, 0.05], [0.017, 0.05], [0.011, 0.034], [0, 0.03]], 6, shellR);
  for (const [from, to, n] of [[headFrom, headTo, 22], [bustFrom, bustTo, 14]] as const) {
    for (const q of surfacePoints(S, from, to, n, r, (nrm, p) => nrm[1] > 0.15 && p[1] > scen.heightAt(p[0], p[2]) + 0.2)) {
      for (let k = 0; k < r.int(2, 5); k++) {
        const off = v3.add(q.p, [r.range(-0.18, 0.18), 0, r.range(-0.18, 0.18)]), sc = r.range(0.8, 1.9);
        const m = alignY(q.n, r.range(0, TAU)).scale(new THREE.Vector3(sc, sc, sc)).setPosition(off[0], off[1] - 0.01, off[2]);
        S.append(bar, m, { tint: [0.92, 0.9, 0.86] });
      }
    }
  }
  toProp(scen, sx, S);
  // a crown of coral on the upturned skull, more on the bust
  let topY = -1e9; for (let i = headFrom * 3 + 1; i < headTo * 3; i += 3) topY = Math.max(topY, S.P[i]);
  const crown = surfacePoints(S, headFrom, headTo, 9, r, (nrm, p) => nrm[1] > 0.55 && p[1] > topY - 0.7);
  for (const q of crown) scen.placePlant(r.pick(['staghorn', 'brain', 'seafan', 'softcoral', 'staghorn', 'tubesponge']), q.p[0], q.p[1] - 0.06, q.p[2], r.range(0.55, 0.95));
  for (const q of surfacePoints(S, bustFrom, bustTo, 5, r, (nrm, p) => nrm[1] > 0.75 && p[1] > sy + 0.2)) scen.placePlant(r.pick(['brain', 'anemone', 'softcoral', 'seafan']), q.p[0], q.p[1] - 0.05, q.p[2], r.range(0.6, 1.0));
  scen.reserved.push({ x: sx, r: 3.5, z0: sz - 3, z1: sz + 2.5 });
}

// ------------------------------------------------------------------ arctic: the ice cave
function iceCave(scen: Scenery, group: THREE.Group) {
  const sh = scen.shape, r = new Rng(scen.seed ^ 0x1ce), P = scen.props;
  const ice = iceClear(P.A), frost = iceFrost(P.A);
  const x = sh.wreckX - 26, z = -6.5, y0 = scen.heightAt(x, z) - 0.6;
  const H = Math.min(7.2, -y0 - 3.2), half = 5.4;
  const S = new Soup();
  // a swept, irregular section along a slightly pointed arch: thick feet, a thinner lintel where light leaks through
  const NA = 20, NS = 9;
  const path: V3[] = [];
  for (let j = 0; j <= NA; j++) { const u = j / NA, a = Math.PI * (1 - u); path.push([Math.cos(a) * half * (1 + 0.08 * Math.sin(a * 3)), Math.pow(Math.sin(a), 0.85) * H, 0]); }
  const rings: V3[][] = [];
  for (let j = 0; j <= NA; j++) {
    const a = path[Math.max(0, j - 1)], b = path[Math.min(NA, j + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, u = j / NA, foot = Math.pow(Math.abs(u - 0.5) * 2, 2.4);
    const rv = 0.75 + foot * 1.3, rz = 1.5 + foot * 0.9;
    const ring: V3[] = [];
    for (let k = 0; k < NS; k++) {
      const an = (k / NS) * TAU + (j % 2) * (Math.PI / NS);
      const jit = 0.82 + hash2(j, k, scen.seed % 101) * 0.36;
      const c = Math.cos(an), sn = Math.sin(an);
      ring.push([path[j][0] + nx * c * rv * jit, Math.max(-0.4, path[j][1] + ny * c * rv * jit), sn * rz * jit]);
    }
    rings.push(ring);
  }
  // close the feet into the gravel
  S.loft(rings, ice, { base: [path[0][0], -0.3, 0], tip: [path[NA][0], -0.3, 0] });
  const loftTo = S.count;
  // a frost cornice humped along the top, lumpy ice boulders heaped at the feet
  const lumps = scen.shapes('boulder');
  for (let j = 3; j <= NA - 3; j += 3) {
    const p = path[j], u = j / NA, foot = Math.pow(Math.abs(u - 0.5) * 2, 2.4), rv = 0.75 + foot * 1.3;
    const a = path[Math.max(0, j - 1)], b = path[Math.min(NA, j + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl;
    if (ny < 0.3) continue;
    S.append(r.pick(lumps), mat4(p[0] + nx * rv * 0.5, p[1] + ny * rv * 0.5 - 0.05, r.range(-0.4, 0.4), r.range(0.7, 1.0), r.range(0.3, 0.45), r.range(1.0, 1.3), r.range(0, TAU)));
  }
  const corniceTo = S.count;
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) S.append(r.pick(lumps), mat4(side * (half + r.range(-0.6, 1.8)), -0.3, r.range(-2, 2.2), r.range(0.6, 1.3), r.range(0.5, 1.1), r.range(0.6, 1.3), r.range(0, TAU)));
  const bodyTo = S.count;
  // icicles under the lintel
  for (let k = 0; k < 13; k++) {
    const u = r.range(0.25, 0.75), j = Math.round(u * NA), p = path[j], L = r.range(0.5, 1.6) * (1 - Math.abs(u - 0.5)), f = S.count;
    S.lathe([[0.14, 0], [0.09, L * 0.45], [0.04, L * 0.85], [0, L]], 6, ice);
    S.transformSince(f, mat4(p[0] + r.range(-0.3, 0.3), p[1] - (0.62 + 0.12) + 0.05, r.range(-1.1, 1.1), 1, 1, 1, r.range(0, TAU), Math.PI, r.range(-0.08, 0.08)));
  }
  // shards: clear crystal prisms broken off at the feet
  for (let k = 0; k < 7; k++) {
    const f = S.count, L = r.range(0.8, 2.0), xx = r.sign() * r.range(half - 1.5, half + 3.5);
    S.lathe([[0.28, 0], [0.32, L * 0.7], [0, L]], 5, ice);
    S.transformSince(f, mat4(xx, -0.25, r.range(-2.5, 2.8), 1, 1, 1, r.range(0, TAU), r.range(-0.5, 0.5), r.range(-0.6, 0.6)));
  }
  // place it, then paint it: frost on everything facing up, clear blue cores facing out, luminous thin rims
  S.transformSince(0, mat4(x, y0, z, 1, 1, 1, 0.12));
  faceUV(S, 0, (n, c) => (n[1] > 0.55 || (c[1] > y0 + H * 0.9 && n[1] > 0.2) ? frost : ice), 0.5);
  faceUV(S, loftTo, frost, 0.5, corniceTo);
  const lintelY = y0 + H * 0.82;
  faceTone(S, 0, (n, c, f) => {
    const up = n[1], face = Math.abs(n[2]);
    const thin = smooth(y0 + H * 0.45, lintelY, c[1]);           // the thin upper span lets the most light through
    if (f >= bodyTo) return [0.9, 1.0, 1.05, 0.6 + thin * 0.5];   // icicles + shards glow
    if (f >= loftTo && f < corniceTo) return [1.04, 1.06, 1.08, 0.1]; // the snow cornice
    if (up > 0.55) return [1.04, 1.06, 1.08, 0.1 + thin * 0.15]; // frost
    if (face < 0.42) return [0.98, 1.04, 1.08, 0.38 + thin * 0.3]; // thin rims scatter the light: pale
    const deep = 1 - thin;                                         // the thick feet hold the deepest blue
    return [0.74 - deep * 0.22, 0.9 - deep * 0.12, 1.04, 0.42 + thin * 0.5];  // clear deep cores
  });
  toProp(scen, x, S);
  // light leaking through: soft halos in the opening and under the span, a cold glow on the gravel
  const pos: number[] = [], col: number[] = [];
  glowFan(pos, col, [x, y0 + H * 0.45, z + 0.2], half * 0.75, H * 0.55, [0.07, 0.16, 0.24], 12);
  glowFan(pos, col, [x, y0 + H * 0.8, z + 1.8], half * 0.9, 1.2, [0.08, 0.15, 0.2], 10);
  for (const side of [-1, 1]) glowFan(pos, col, [x + side * half * 0.9, y0 + 1.2, z + 2.0], 1.6, 1.4, [0.05, 0.11, 0.16], 8);
  const halo = addGlow(scen, group, pos, col);
  const hm = halo.material as THREE.MeshBasicMaterial;
  scen.updaters.push((_dt, _cx, t) => { hm.opacity = 0.85 + Math.sin(t * 0.7) * 0.1 + Math.sin(t * 2.3) * 0.05; });
  scen.glowPts.push({ x, y: y0 + H * 0.5, z: z + 1.5, col: '#8ad8ff' });
  scen.reserved.push({ x, r: half + 2, z0: z - 3, z1: z + 3 });
}

// ------------------------------------------------------------------ kelp: the light hall
function lightHall(scen: Scenery, group: THREE.Group) {
  const sh = scen.shape, r = new Rng(scen.seed ^ 0x4a11), hx = sh.hallX;
  const SR = scen.simR, half = 3.4;
  const cols = [-2.4, -5.0, -7.6, -10.2];
  const kelpV = scen.flora.get('giantkelp', 3, 0), kelpFar = scen.flora.get('giantkelp', 2, 1);
  // a twisted cable of stipes: the column shaft
  const cable = (s: Soup, x: number, y: number, top: number, sd: number) => {
    for (let k = 0; k < 3; k++) {
      const path: V3[] = [];
      for (let q = 0; q <= 12; q++) { const t = q / 12, a = sd + k * (TAU / 3) + t * 2.6; path.push([Math.cos(a) * 0.22, t * (top - y), Math.sin(a) * 0.22]); }
      s.flex(0).tube(path, (t) => 0.17 * (1 - t * 0.4), 5, SR.stipe, { flex: (t) => t * t * 0.3 });
    }
  };
  for (const cz of cols) for (const side of [-1, 1]) {
    const x = hx + side * half + r.range(-0.15, 0.15), z = cz + r.range(-0.2, 0.2), y = scen.heightAt(x, z);
    const top = -1.0 - r.range(0, 0.5);
    const ch = scen.chunk(x), far = z < -7;
    const c = new Soup(); cable(c, x, y, top, r.range(0, TAU));
    (far ? ch.floraFar : ch.flora).append(c, mat4(x, y - 0.1, z, 1, 1, 1), { sway: true, flexAbs: 1 });
    // fronds: giant kelp around the shaft
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + r.range(0, 1), xx = x + Math.cos(a) * 0.35, zz = z + Math.sin(a) * 0.3, yy = scen.heightAt(xx, zz);
      const reach = -yy - r.range(0.3, 0.9);
      (far ? ch.floraFar : ch.flora).append(r.pick(far ? kelpFar : kelpV), mat4(xx, yy - 0.05, zz, r.range(1.0, 1.3), reach / 10, r.range(1.0, 1.3), r.range(0, TAU)), { sway: true, tint: [1.05, 1.03, 0.95] });
    }
    // the holdfast: a root mass like a column plinth
    for (let k = 0; k < 3; k++) scen.addRock(r.pick(scen.shapes('boulder')), x + r.range(-0.4, 0.4), y - 0.25, z + r.range(-0.4, 0.4), r.range(0.4, 0.65), r.range(0.3, 0.5), r.range(0.4, 0.65), r.range(0, TAU), { tint: 0.62, topK: 0.4 });
  }
  // pointed vaults: kelp strands arching over the aisle from column to column, blades hanging from them
  for (const cz of cols) {
    const ys = Math.min(-6.5, -1.4 - 1.732 * half), s = new Soup();
    for (const side of [-1, 1]) for (let strand = 0; strand < 2; strand++) {
      // an equilateral (pointed) arch: each half is an arc centred on the opposite springing
      const path: V3[] = [];
      for (let q = 0; q <= 12; q++) {
        const ph = Math.PI - (q / 12) * (Math.PI / 3), xx = half + 2 * half * Math.cos(ph);
        path.push([side < 0 ? xx : -xx, 2 * half * Math.sin(ph) + strand * 0.12 * Math.sin(q), Math.sin(q * 0.9 + strand * 2) * 0.12]);
      }
      s.flex(0).tube(path, (t) => 0.11 * (1 - t * 0.3), 4, SR.stipe, { flex: (t) => 0.15 + t * 0.5 });
      for (let q = 2; q <= 11; q += 2) {
        const p = path[q], L = r.range(0.6, 1.4), bp: V3[] = [];
        for (let k = 0; k <= 4; k++) bp.push([p[0] + Math.sin(k * 0.8) * 0.08, p[1] - (k / 4) * L, p[2] + k * 0.05]);
        s.ribbon(bp, (t) => 0.2 * (1 - t * 0.6), SR.blade, { side: [1, 0, 0.3], flex: (t) => 0.3 + t * 0.9, twist: r.range(-1, 1) });
      }
    }
    const ch = scen.chunk(hx);
    (cz < -7 ? ch.floraFar : ch.flora).append(s, mat4(hx, ys, cz, 1, 1, 1), { sway: true, flexAbs: 0.35 });
  }
  // god rays down the nave
  {
    const pos: number[] = [], col: number[] = [];
    const sheet = (x0: number, z: number, wdt: number, k: number, lean: number) => {
      const bot = scen.heightAt(x0, z);
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI, dx = Math.cos(a) * wdt * 0.5, dz = Math.sin(a) * wdt * 0.5, xb = x0 + (0 - bot) * lean;
        const Pq: V3[] = [[x0 - dx, 0, z - dz], [x0 + dx, 0, z + dz], [xb + dx * 1.5, bot, z + dz * 1.5], [xb - dx * 1.5, bot, z - dz * 1.5]];
        const C = [1, 1, 0.12, 0.12];
        for (const tri of [[0, 1, 2], [0, 2, 3]]) for (const i of tri) { pos.push(...Pq[i]); col.push(C[i] * k, C[i] * k * 0.96, C[i] * k * 0.8); }
      }
    };
    for (const [cz, dx] of [[-1.3, -1.8], [-3.7, 1.4], [-6.3, -1.0], [-8.9, 1.9], [-11.4, -2.4]]) sheet(hx + dx + r.range(-0.3, 0.3), cz, r.range(1.0, 1.7), r.range(0.16, 0.24), 0.16);
    const m = addGlow(scen, group, pos, col, '#fff2c8');
    const mat = m.material as THREE.MeshBasicMaterial;
    scen.updaters.push((_dt, _cx, t) => { mat.opacity = 0.72 + Math.sin(t * 0.37) * 0.16 + Math.sin(t * 1.21 + 1) * 0.08; });
  }
  roseWindow(scen, group, hx, -12.6, r);
  sunflecks(scen, group, hx, half);
}

/** a sunken rose window: coral-crusted stone tracery round leaded glass, glowing with the light behind it */
function roseWindow(scen: Scenery, group: THREE.Group, x: number, z: number, r: Rng) {
  const P = scen.props, stone = P.get('rock');
  const base = scen.heightAt(x, z), R = 3.0, cy = base + R + 1.4;
  const S = new Soup();
  const ring = (rad: number, tr: number, n = 28) => { const path: V3[] = []; for (let q = 0; q <= n; q++) { const a = (q / n) * TAU; path.push([Math.cos(a) * rad, Math.sin(a) * rad, 0]); } S.tube(path, () => tr, 6, stone); };
  ring(R, 0.32); ring(R + 0.48, 0.16, 32); ring(R * 0.3, 0.16, 14);
  const NSp = 12;
  for (let k = 0; k < NSp; k++) {
    const a = (k / NSp) * TAU;
    S.tube([[Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, 0], [Math.cos(a) * R, Math.sin(a) * R, 0]], () => 0.09, 4, stone);
    // cusped foils between the spokes near the rim
    const am = a + Math.PI / NSp, fr = R * 0.2, fc: V3 = [Math.cos(am) * R * 0.74, Math.sin(am) * R * 0.74, 0];
    const path: V3[] = [];
    for (let q = 0; q <= 6; q++) { const b = am - Math.PI / 2 + (q / 6) * Math.PI; path.push([fc[0] + Math.cos(b) * fr, fc[1] + Math.sin(b) * fr, 0]); }
    S.tube(path, () => 0.06, 4, stone);
  }
  // glass: annular panes in jewel colours, a few broken out; a golden boss in the middle
  const glass = [stainedGlass(P.A, 'glassRuby', '#c0283a'), stainedGlass(P.A, 'glassAmber', '#e0a020'), stainedGlass(P.A, 'glassSapph', '#2a5ad0'), stainedGlass(P.A, 'glassEmer', '#2aa060'), stainedGlass(P.A, 'glassViolet', '#8a3ac0')];
  const pick = [0, 2, 1, 4, 0, 3, 2, 1, 0, 4, 2, 3];
  const glassFrom = S.count;
  for (let k = 0; k < NSp; k++) {
    if (k === 3 || k === 8) continue;
    const a0 = (k / NSp) * TAU, a1 = ((k + 1) / NSp) * TAU, gr = glass[pick[k]];
    for (let band = 0; band < 2; band++) {
      const r0 = R * (0.3 + band * 0.35), r1 = R * (0.65 + band * 0.35);
      const q = (rr: number, a: number): V3 => [Math.cos(a) * rr, Math.sin(a) * rr, -0.04];
      S.quad(q(r0, a1), q(r0, a0), q(r1, a0), q(r1, a1), band ? gr : glass[(pick[k] + 2) % 5]);
      S.quad(q(r0, a0), q(r0, a1), q(r1, a1), q(r1, a0), band ? gr : glass[(pick[k] + 2) % 5]);
    }
  }
  for (let k = 0; k < 8; k++) { const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU, rr = R * 0.3; const gr = glass[1]; S.tri([0, 0, -0.03], [Math.cos(a1) * rr, Math.sin(a1) * rr, -0.03], [Math.cos(a0) * rr, Math.sin(a0) * rr, -0.03], [gr.u0, gr.v0], [gr.u1, gr.v0], [gr.u1, gr.v1]); S.tri([0, 0, -0.05], [Math.cos(a0) * rr, Math.sin(a0) * rr, -0.05], [Math.cos(a1) * rr, Math.sin(a1) * rr, -0.05], [gr.u0, gr.v0], [gr.u1, gr.v0], [gr.u1, gr.v1]); }
  const glassTo = S.count;
  // the ruined facade: a pointed hood moulding springing from two piers
  const hood: V3[] = [], Rh = R + 0.9;
  for (let q = 0; q <= 14; q++) {
    const side = q <= 7 ? -1 : 1, u = q <= 7 ? q / 7 : (14 - q) / 7, ph = Math.PI - u * (Math.PI / 3), xx = Rh + 2 * Rh * Math.cos(ph);
    hood.push([side < 0 ? xx : -xx, 0.2 + 2 * Rh * Math.sin(ph) * 0.62, 0.15]);
  }
  S.tube(hood, () => 0.26, 5, stone);
  S.transformSince(0, mat4(x, cy, z, 1, 1, 1, 0.04, 0, 0.05));
  faceUV(S, 0, stone, 0.6, glassFrom); faceUV(S, glassTo, stone, 0.6);
  const crust = rgb01('#c87a8a');
  faceTone(S, 0, (n, _c, f) => {
    if (f >= glassFrom && f < glassTo) return [1.15, 1.15, 1.15, 1.35];
    const up = smooth(0.3, 0.8, n[1]);
    return [0.9 + (crust[0] - 0.9) * up, 0.88 + (crust[1] - 0.88) * up, 0.86 + (crust[2] - 0.86) * up, 0];
  });
  toProp(scen, x, S);
  // piers of tumbled masonry and a sill
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
    const px = x + side * (R + 0.85) + r.range(-0.15, 0.15), py = base + k * 1.75 - 0.2;
    scen.addRock(r.pick(scen.shapes('slab')), px, py, z + r.range(-0.2, 0.2), r.range(0.7, 0.85) - k * 0.06, 1.8, 0.75, r.range(-0.2, 0.2), { tint: 0.95, topK: 1.2 });
  }
  scen.addRock(r.pick(scen.shapes('slab')), x, base - 0.3, z + 0.2, R + 0.6, 1.4, 1.0, 0, { topK: 1.3 });
  for (let k = 0; k < 9; k++) { const a = r.range(0.15, Math.PI - 0.15), rr = R + 0.4; scen.placePlant(r.pick(['redweed', 'anemone', 'softcoral', 'redweed']), x + Math.cos(a) * rr, cy + Math.sin(a) * rr + 0.1, z + 0.1, r.range(0.5, 0.8)); }
  // the glow behind it and coloured light falling through it toward the nave
  const pos: number[] = [], col: number[] = [];
  glowFan(pos, col, [x, cy, z - 0.6], R * 1.5, R * 1.5, [0.2, 0.17, 0.1], 14);
  glowFan(pos, col, [x, cy, z + 0.1], R * 1.05, R * 1.05, [0.1, 0.09, 0.06], 14);
  const tint: [number, number, number][] = [[0.9, 0.2, 0.25], [0.95, 0.7, 0.2], [0.25, 0.4, 0.95], [0.25, 0.8, 0.45], [0.6, 0.3, 0.85]];
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.32, sx = x + Math.cos(a) * R * 0.6, sy = cy + Math.sin(a) * R * 0.6, ex = x + (k - 2) * 1.3, ez = z + 5.5, ey = scen.heightAt(ex, ez) + 0.05;
    const c = tint[k], w = 0.35, w2 = 1.0;
    const Pq: V3[] = [[sx - w, sy, z + 0.1], [sx + w, sy, z + 0.1], [ex + w2, ey, ez], [ex - w2, ey, ez]], C = [0.16, 0.16, 0.02, 0.02];
    for (const tri of [[0, 1, 2], [0, 2, 3]]) for (const i of tri) { pos.push(...Pq[i]); col.push(c[0] * C[i], c[1] * C[i], c[2] * C[i]); }
  }
  const m = addGlow(scen, group, pos, col);
  const mat = m.material as THREE.MeshBasicMaterial;
  scen.updaters.push((_dt, _cx, t) => { mat.opacity = 0.85 + Math.sin(t * 0.5) * 0.12; });
}

/** dancing sunflecks: crisp dappled light patches on the floor of the hall, coloured near the window */
function sunflecks(scen: Scenery, group: THREE.Group, hx: number, half: number) {
  const x0 = hx - half - 2.5, x1 = hx + half + 2.5, z0 = -12, z1 = 1.2, st = 0.5;
  const pos: number[] = [], idx: number[] = [];
  const nx = Math.round((x1 - x0) / st) + 1, nz = Math.round((z1 - z0) / st) + 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * st, z = z0 + j * st; pos.push(x, scen.heightAt(x, z) + 0.035, z); }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: UW.uTime, uC: { value: new THREE.Vector3(hx, half, 0) } },
    vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uT; uniform vec3 uC; varying vec3 vW;
      void main() {
        vec2 p = vW.xz * vec2(1.0, 1.3);
        float t = uT;
        // three drifting interference layers, thresholded into crisp blobs (no gradients, no dither)
        float a = sin(p.x * 1.7 + t * 0.9 + sin(p.y * 1.1 + t * 0.5)) * sin(p.y * 1.9 - t * 0.7 + sin(p.x * 0.8 - t * 0.4));
        float b = sin(p.x * 2.9 - t * 1.3 + p.y * 0.7) * sin(p.y * 2.5 + t * 1.1 - p.x * 0.4);
        float f = a * 0.65 + b * 0.45;
        float d = abs(vW.x - uC.x) / (uC.y + 1.5);
        float th = 0.42 + d * d * 0.5;
        float lit = step(th, f) + step(th + 0.3, f) * 0.6;
        float edge = smoothstep(-12.0, -10.8, vW.z) * (1.0 - smoothstep(0.2, 1.2, vW.z));
        vec3 col = vec3(1.0, 0.93, 0.7) * 0.42;
        // coloured light from the rose window pools on the floor in front of it
        float near = 1.0 - smoothstep(-8.5, -5.5, vW.z);
        float hue = floor((vW.x - uC.x) * 0.8 + 2.5);
        vec3 tint = hue < 1.0 ? vec3(1.0, 0.3, 0.35) : hue < 2.0 ? vec3(1.0, 0.75, 0.3) : hue < 3.0 ? vec3(0.4, 0.55, 1.0) : hue < 4.0 ? vec3(0.4, 0.95, 0.55) : vec3(0.75, 0.45, 1.0);
        col = mix(col, tint * 0.38, near);
        float k = lit * clamp(edge, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.25, d));
        if (k <= 0.0) discard;
        gl_FragColor = vec4(col * k, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3; m.frustumCulled = false;
  group.add(m);
  scen.disposables.push(geo, mat);
}

// ------------------------------------------------------------------ graveyard: the galleon broken in two
interface HullCfg { L: number; B: number; D: number }
const HB = (t: number, c: HullCfg) => (t < 0.2 ? 0.8 + 0.2 * Math.sin((t / 0.2) * Math.PI / 2) : t < 0.66 ? 1 : Math.pow(Math.cos(((t - 0.66) / 0.34) * Math.PI / 2), 0.7)) * c.B;
const DY = (t: number, c: HullCfg) => c.D * (1 + 0.45 * (t - 0.45) ** 2);
const KY = (t: number, c: HullCfg) => 0.3 * c.D * Math.abs((t - 0.5) * 2) ** 4 + Math.max(0, t - 0.88) * c.D * 3.2;
const SECT: [number, number][] = [[1, 0.86], [0.62, 1], [0.34, 0.97], [0.13, 0.8], [0.04, 0.42]];
function hullRing(t: number, c: HullCfg, jag = 0, r?: Rng): V3[] {
  const x = (t - 0.5) * c.L, hb = Math.max(0.05, HB(t, c)), dy = DY(t, c), ky = KY(t, c);
  const ring: V3[] = [];
  const J = () => (r ? r.range(-jag, jag) : 0);
  for (const [h, w] of SECT) ring.push([x + J(), ky + (dy - ky) * h, hb * w]);
  ring.push([x + J(), ky, 0]);
  for (let k = SECT.length - 1; k >= 0; k--) ring.push([x + J(), ky + (dy - ky) * SECT[k][0], -hb * SECT[k][1]]);
  return ring;
}

function galleon(scen: Scenery, group: THREE.Group, w: World) {
  const sh = scen.shape, r = new Rng(scen.seed ^ 0x6a11), P = scen.props;
  const pl = P.get('planksOld'), plH = P.get('planksHoles'), deck = P.get('deck'), wood = P.get('planksOld'), ir = P.get('iron'), brass = P.get('brass'), rope = P.get('rope');
  const black = P.get('black'), lit = P.get('glassLit'), lamp = P.get('lamp'), bone = P.get('bone'), gold = P.get('gold');
  const C: HullCfg = { L: 22, B: 3.1, D: 4.2 };
  const X = sh.galleonX, Z = -9;
  const half = (t0: number, t1: number, ts: number[], breakAtEnd: boolean) => {
    const S = new Soup();
    const rings = ts.map((t, j) => hullRing(t, C, (breakAtEnd ? j === ts.length - 1 : j === 0) ? 0.55 : 0, r));
    // outer planking + a darker inner skin (the break lets you see in)
    for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < rings[j].length - 1; k++) {
      const a = rings[j][k], b = rings[j + 1][k], c = rings[j + 1][k + 1], d = rings[j][k + 1];
      const reg = hash2(j, k, 41) > 0.78 ? plH : pl;
      const ua: [number, number] = [reg.u0, reg.v0], ub: [number, number] = [reg.u1, reg.v0], uc: [number, number] = [reg.u1, reg.v1], ud: [number, number] = [reg.u0, reg.v1];
      // u along the ship so the planks run lengthwise; outer skin outward, inner skin dark and inward
      S.tri(a, d, c, ua, ud, uc, 0.92, 0.92, 0.92); S.tri(a, c, b, ua, uc, ub, 0.92, 0.92, 0.92);
      S.tri(a, b, c, ua, ub, uc, 0.42, 0.42, 0.42); S.tri(a, c, d, ua, uc, ud, 0.42, 0.42, 0.42);
    }
    // ribs: frames inside every station, and bare frames standing past the planks at the break
    const frame = (ring: V3[], cut: number, rr: number) => { const path = ring.slice(0, Math.max(2, ring.length - cut)).map((q) => [q[0], q[1], q[2] * 0.96] as V3); S.tube(path, () => rr, 4, wood); };
    for (let j = 1; j < rings.length - 1; j++) frame(hullRing(ts[j], C), 0, 0.09);
    const tb = breakAtEnd ? ts[ts.length - 1] : ts[0], dir = breakAtEnd ? 1 : -1;
    for (let i = 1; i <= 4; i++) frame(hullRing(tb + dir * i * 0.016, C), r.int(0, 5), 0.12);
    // the keel timber, splintered out past the break
    S.tube([[(t0 - 0.5) * C.L - (breakAtEnd ? 0 : 1.4), KY(t0, C) - 0.05, 0], [(t1 - 0.5) * C.L + (breakAtEnd ? 1.4 : 0), KY(t1, C) - 0.05, 0]], () => 0.2, 4, wood);
    // deck, broken through in places
    for (let j = 0; j < rings.length - 1; j++) {
      if (hash2(j, 3, 43) > 0.7) continue;
      const a = rings[j][0], b = rings[j + 1][0], c = rings[j + 1][rings[j].length - 1], d = rings[j][rings[j].length - 1];
      S.quad(a, b, c, d, deck); S.quad(a, d, c, b, deck, [0.4, 0.4, 0.4, 0.4]);
    }
    // gunports on both sides; muzzles run out of some
    for (const t of ts.slice(0, -1)) for (const side of [-1, 1]) {
      const tt = t + 0.03; if (tt < t0 + 0.03 || tt > t1 - 0.03) continue;
      const x = (tt - 0.5) * C.L, y = KY(tt, C) + (DY(tt, C) - KY(tt, C)) * 0.66, zz = side * HB(tt, C) * 1.0 + side * 0.03;
      const q = (dx: number, dy: number): V3 => [x + dx, y + dy, zz];
      if (side > 0) S.quad(q(-0.3, -0.28), q(0.3, -0.28), q(0.3, 0.28), q(-0.3, 0.28), black); else S.quad(q(0.3, -0.28), q(-0.3, -0.28), q(-0.3, 0.28), q(0.3, 0.28), black);
      if (hash2(Math.round(tt * 100), side, 47) > 0.5) { const f = S.count; S.lathe([[0.16, 0], [0.14, 0.5], [0.12, 1.1], [0.15, 1.15], [0.15, 1.25]], 7, ir); S.transformSince(f, mat4(x, y, zz - side * 0.4, 1, 1, 1, 0, side * Math.PI / 2, 0)); }
    }
    return S;
  };
  // ---- stern half: sterncastle, gallery windows, the lantern
  const stern = half(0, 0.47, [0, 0.06, 0.13, 0.21, 0.29, 0.37, 0.43, 0.47], true);
  {
    const x0 = -0.5 * C.L, dy = DY(0, C), hb = HB(0.02, C);
    // transom
    const tr = hullRing(0, C);
    for (let k = 0; k < tr.length - 2; k++) stern.tri(tr[0], tr[k + 2], tr[k + 1], [pl.u0, pl.v0], [pl.u1, pl.v1], [pl.u1, pl.v0], 0.7, 0.7, 0.7);
    // sterncastle: two stacked decks with a gallery of glowing windows across the stern
    stern.box([x0 - 0.15, dy, -hb * 0.92], [4.6, 1.5, hb * 1.84], wood);
    stern.box([x0 - 0.35, dy + 1.5, -hb * 0.86], [3.2, 1.25, hb * 1.72], wood);
    stern.box([x0 - 0.45, dy + 2.75, -hb * 0.95], [3.5, 0.14, hb * 1.9], deck);
    for (let k = 0; k < 4; k++) {
      const zz = -hb * 0.62 + k * hb * 0.41, f = stern.count;
      stern.glow(k === 1 ? 0.25 : 0.9).box([0, 0, -0.17], [0.05, 0.7, 0.34], k === 1 ? black : lit).glow(0);
      stern.box([0, -0.08, -0.22], [0.08, 0.08, 0.44], brass); stern.box([0, 0.7, -0.22], [0.08, 0.08, 0.44], brass);
      stern.transformSince(f, mat4(x0 - 0.42, dy + 1.95, zz, 1, 1, 1));
      const f2 = stern.count;
      stern.glow(0.7).box([0, 0, -0.15], [0.05, 0.6, 0.3], k === 2 ? black : lit).glow(0);
      stern.transformSince(f2, mat4(x0 - 0.22, dy + 0.55, zz, 1, 1, 1));
    }
    // mainmast stump, snapped
    const mx = -0.04 * C.L;
    stern.tube([[mx, KY(0.46, C), 0], [mx, dy + 2.6, 0], [mx + 0.2, dy + 3.1, 0.1]], (t) => 0.34 * (1 - t * 0.3), 6, wood, { tip: true });
    stern.tube([[mx, dy + 1.8, 0], [mx + 1.6, dy - 0.2, hb * 1.0]], () => 0.035, 3, rope);
    stern.tube([[mx, dy + 2.2, 0], [mx - 2.4, dy - 0.1, -hb]], () => 0.035, 3, rope);
    // the stern lantern on its bracket, still burning
    const lx = x0 - 0.9, ly = dy + 3.0;
    stern.tube([[x0 - 0.3, dy + 2.6, 0], [lx, dy + 3.55, 0]], () => 0.07, 4, ir);
    const f = stern.count;
    stern.lathe([[0.32, 0], [0.38, 0.1], [0.32, 0.16]], 6, brass);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; stern.tube([[Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3], [Math.cos(a) * 0.3, 0.86, Math.sin(a) * 0.3]], () => 0.035, 3, brass); }
    stern.lathe([[0.36, 0.84], [0.3, 0.98], [0.12, 1.15], [0.05, 1.3], [0, 1.32]], 6, brass);
    stern.glow(3.2).lathe([[0.22, 0.14], [0.26, 0.5], [0.22, 0.84], [0, 0.86]], 6, lamp).glow(0);
    stern.transformSince(f, mat4(lx, ly - 0.55, 0, 1.15, 1.15, 1.15));
  }
  // ---- bow half: forecastle, beakhead, figurehead, snapped bowsprit and foremast
  const bow = half(0.53, 1, [0.53, 0.58, 0.65, 0.73, 0.81, 0.88, 0.94, 0.98, 1.0], false);
  {
    const xb = 0.5 * C.L, dy = DY(0.97, C), hb = HB(0.86, C);
    bow.box([0.33 * C.L, DY(0.86, C), -hb * 0.9], [2.6, 1.0, hb * 1.8], wood);
    bow.tube([[0.2 * C.L, KY(0.7, C), 0], [0.2 * C.L, dy + 1.8, 0], [0.2 * C.L - 0.15, dy + 2.3, 0.1]], (t) => 0.28 * (1 - t * 0.3), 6, wood, { tip: true });
    bow.tube([[xb - 0.6, dy + 0.3, 0], [xb + 3.2, dy + 2.1, 0], [xb + 3.6, dy + 2.15, 0.1]], (t) => 0.2 * (1 - t * 0.5), 5, wood, { tip: true });
    bow.tube([[xb + 3.2, dy + 2.1, 0], [xb + 2.6, KY(1, C) + 1.2, 0]], () => 0.03, 3, rope);
    // the figurehead: a robed woman leaning out under the bowsprit, gilt flaking off her robe
    const fh = new Soup();
    fh.lathe([[0.26, 0], [0.3, 0.35], [0.24, 0.75], [0.19, 0.98], [0.22, 1.12], [0.17, 1.26], [0.08, 1.33]], 7, bone, { sz: 0.8 });
    const hd = fh.count; fh.lathe([[0.08, 0], [0.12, 0.06], [0.13, 0.16], [0.1, 0.26], [0, 0.29]], 6, bone); fh.transformSince(hd, mat4(0.02, 1.32, 0, 1, 1, 1));
    fh.tube([[-0.04, 1.6, 0], [-0.16, 1.42, 0], [-0.24, 1.1, 0], [-0.3, 0.8, 0]], (t) => 0.11 * (1 - t * 0.6), 5, brass);  // hair streaming back
    for (const side of [-1, 1]) fh.tube([[0, 1.2, side * 0.2], [0.18, 1.0, side * 0.24], [0.28, 1.12, side * 0.06]], () => 0.05, 4, bone); // arms folded
    fh.tube([[0.2, 0.2, -0.28], [0.26, 0.6, 0], [0.2, 1.0, 0.25]], () => 0.05, 4, brass);  // a gilt sash
    bow.append(fh, mat4(xb + 0.3, KY(1, C) + 0.9, 0, 1.35, 1.35, 1.35, 0, 0, -0.75));
  }
  // ---- pose both halves: the stern settled and listing, the bow wrenched up, its broken end buried
  const ys = scen.heightAt(X - 6, Z), yb = scen.heightAt(X + 6, Z);
  const mS = mat4(X - 1.6, ys - 1.1, Z, 1, 1, 1, 0.12, 0.26, 0.04), mB = mat4(X + 3.6, yb - 1.4, Z + 0.8, 1, 1, 1, -0.3, -0.38, 0.32);
  const ch = scen.chunk(X);
  ch.prop.append(stern, mS);
  ch.prop.append(bow, mB);
  // lamp point (world): the lantern centre through the stern pose
  const lv = new THREE.Vector3(-0.5 * C.L - 0.9, DY(0, C) + 3.0, 0).applyMatrix4(mS);
  scen.glowPts.push({ x: lv.x, y: lv.y, z: lv.z + 0.8, col: '#ffb050' });
  {
    const pos: number[] = [], col: number[] = [];
    glowFan(pos, col, [lv.x, lv.y, lv.z + 0.3], 1.6, 1.6, [0.3, 0.2, 0.08], 10);
    glowFan(pos, col, [lv.x, lv.y, lv.z + 0.4], 0.55, 0.55, [0.35, 0.25, 0.1], 8);
    const m = addGlow(scen, group, pos, col);
    const mat = m.material as THREE.MeshBasicMaterial;
    scen.updaters.push((_dt, _cx, t) => { mat.opacity = 0.8 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1) * 0.06; });
  }
  // ---- the fallen mainmast across the silt toward us, its yard and torn sail draped over it
  const D = new Soup(), cloth = new Soup();
  const m0: V3 = [X - 2, scen.heightAt(X - 2, Z + 2) + 0.25, Z + 2], m1: V3 = [X + 4.5, scen.heightAt(X + 4.5, Z + 6.5) + 0.2, Z + 6.5];
  D.tube([m0, m1], (t) => 0.3 * (1 - t * 0.4), 6, wood, { tip: true });
  const yc = v3.lerp(m0, m1, 0.55);
  D.tube([[yc[0] - 2.2, yc[1] + 0.25, yc[2] - 1.5], [yc[0] + 2.4, yc[1] + 0.1, yc[2] + 1.4]], () => 0.12, 5, wood);
  {
    const sail = P.get('sailTorn');
    const NU = 6, NV = 4, a: V3 = [yc[0] - 2.1, yc[1] + 0.3, yc[2] - 1.4], b: V3 = [yc[0] + 2.3, yc[1] + 0.15, yc[2] + 1.3];
    const grid: V3[][] = [];
    for (let i = 0; i <= NU; i++) {
      const row: V3[] = [], p = v3.lerp(a, b, i / NU);
      for (let j = 0; j <= NV; j++) { const t = j / NV; row.push([p[0] + t * 0.6, Math.max(scen.heightAt(p[0], p[2] + t * 2.2) + 0.06, p[1] - t * 1.6 + Math.sin(i * 1.3) * 0.2 * t), p[2] + t * 2.2]); }
      grid.push(row);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const u0 = sail.u0 + (sail.u1 - sail.u0) * (i / NU), u1 = sail.u0 + (sail.u1 - sail.u0) * ((i + 1) / NU), v0 = sail.v1 - (sail.v1 - sail.v0) * (j / NV), v1 = sail.v1 - (sail.v1 - sail.v0) * ((j + 1) / NV);
      cloth.flex(0).quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1], { u0, u1, v0, v1 }, [0.85, 0.85, 0.85, 0.85], [0.05 * j, 0.05 * j, 0.05 * (j + 1), 0.05 * (j + 1)]);
    }
  }
  // spilled cannons, a carriage on its side, shot everywhere, rope, and the chest
  const cannon = (x: number, z: number, ry: number, rz: number, sink: number) => {
    const f = D.count;
    D.lathe([[0.26, 0], [0.24, 0.25], [0.27, 0.3], [0.21, 0.9], [0.17, 1.8], [0.2, 1.85], [0.2, 2.0], [0.14, 2.02]], 8, ir, { base: true });
    D.lathe([[0.14, 2.02], [0.08, 2.0]], 8, black);
    D.transformSince(f, mat4(x, scen.heightAt(x, z) + 0.22 - sink, z, 1, 1, 1, ry, 0, rz));
  };
  cannon(X + 0.6, Z + 3.2, 0.4, Math.PI / 2 - 0.1, 0.05);
  cannon(X + 1.8, Z + 4.4, 2.2, Math.PI / 2 + 0.05, 0.1);
  cannon(X - 0.8, Z + 5.4, -0.7, Math.PI / 2 + 0.15, 0.12);
  cannon(X + 2.6, Z + 1.0, 1.1, 1.0, 0.7);
  cannon(X - 4.5, Z + 6.8, 2.8, Math.PI / 2, 0.08);
  {
    const cx = X + 0.2, cz = Z + 6.6, f = D.count;
    D.box([-0.6, 0.18, -0.38], [1.2, 0.35, 0.76], wood);
    for (const [wx, wz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) { const f2 = D.count; D.lathe([[0.2, -0.05], [0.2, 0.05]], 8, wood, { base: true }); D.transformSince(f2, mat4(wx, 0.2, wz, 1, 1, 1, 0, Math.PI / 2, 0)); }
    D.transformSince(f, mat4(cx, scen.heightAt(cx, cz) + 0.1, cz, 1, 1, 1, 0.5, 1.2, 0));
  }
  const ball = (x: number, z: number, rr = 0.15) => { const y = scen.heightAt(x, z) + rr * 0.6; const ico = icosphere(1); for (let q = 0; q < ico.i.length; q += 3) { const Pt = (i: number): V3 => [ico.p[i * 3] * rr + x, ico.p[i * 3 + 1] * rr + y, ico.p[i * 3 + 2] * rr + z]; D.tri(Pt(ico.i[q]), Pt(ico.i[q + 1]), Pt(ico.i[q + 2]), [ir.u0, ir.v0], [ir.u1, ir.v0], [ir.u1, ir.v1]); } };
  for (let k = 0; k < 16; k++) ball(X + r.range(-6, 7), Z + r.range(1.5, 8.5));
  // a shot pyramid that held its shape
  { const px = X - 3.2, pz = Z + 4.2, rr = 0.15; for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) for (let j = 0; j < 3 - l - i; j++) { const bx = px + (i + j * 0.5 + l * 0.5) * rr * 2, bz = pz + j * rr * 1.73 + l * rr * 0.58; const y = scen.heightAt(px, pz) + rr * 0.6 + l * rr * 1.63; const ico = icosphere(1); for (let q = 0; q < ico.i.length; q += 3) { const Pt = (ii: number): V3 => [ico.p[ii * 3] * rr + bx, ico.p[ii * 3 + 1] * rr + y, ico.p[ii * 3 + 2] * rr + bz]; D.tri(Pt(ico.i[q]), Pt(ico.i[q + 1]), Pt(ico.i[q + 2]), [ir.u0, ir.v0], [ir.u1, ir.v0], [ir.u1, ir.v1]); } } }
  // rope: a coil and a loose length snaking over the silt
  {
    const cx = X - 1.4, cz = Z + 7.4, cy = scen.heightAt(cx, cz) + 0.06, path: V3[] = [];
    for (let q = 0; q <= 40; q++) { const a = q * 0.5, rr = 0.42 - q * 0.0055; path.push([cx + Math.cos(a) * rr, cy + q * 0.004, cz + Math.sin(a) * rr]); }
    D.tube(path, () => 0.045, 4, rope);
    const lp: V3[] = [];
    for (let q = 0; q <= 14; q++) { const x = cx + 0.4 + q * 0.42, z = cz + Math.sin(q * 0.7) * 0.6 - q * 0.08; lp.push([x, scen.heightAt(x, z) + 0.05, z]); }
    D.tube(lp, () => 0.04, 4, rope);
  }
  // the treasure chest, half buried by the play plane, lid sprung, coins spilling
  const tx = X + 7.5, tz = -1.7, ty = scen.heightAt(tx, tz);
  {
    const f = D.count;
    D.box([-0.5, 0, -0.32], [1.0, 0.56, 0.64], wood);
    for (const bx of [-0.36, 0.3]) D.box([bx, -0.01, -0.34], [0.07, 0.58, 0.68], brass);
    D.box([-0.06, 0.38, 0.32], [0.12, 0.14, 0.04], brass);
    // heaped gold inside
    const gf = D.count;
    D.glow(0.45).lathe([[0.42, 0], [0.32, 0.12], [0.12, 0.2], [0, 0.22]], 7, gold, { sx: 1.05, sz: 0.68 }).glow(0);
    D.transformSince(gf, mat4(0, 0.46, 0, 1, 1, 1));
    // the lid, sprung open on its hinges
    const lf = D.count;
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI, a1 = ((k + 1) / 6) * Math.PI;
      const A: V3 = [0.5, Math.sin(a0) * 0.3, Math.cos(a0) * 0.32], B: V3 = [-0.5, Math.sin(a0) * 0.3, Math.cos(a0) * 0.32], Cc: V3 = [-0.5, Math.sin(a1) * 0.3, Math.cos(a1) * 0.32], Dd: V3 = [0.5, Math.sin(a1) * 0.3, Math.cos(a1) * 0.32];
      D.quad(A, B, Cc, Dd, wood); D.quad(A, Dd, Cc, B, wood, [0.5, 0.5, 0.5, 0.5]);
    }
    for (const bx of [-0.36, 0.3]) for (let k = 0; k < 6; k++) { const a0 = (k / 6) * Math.PI, a1 = ((k + 1) / 6) * Math.PI; D.quad([bx + 0.07, Math.sin(a0) * 0.31, Math.cos(a0) * 0.33], [bx, Math.sin(a0) * 0.31, Math.cos(a0) * 0.33], [bx, Math.sin(a1) * 0.31, Math.cos(a1) * 0.33], [bx + 0.07, Math.sin(a1) * 0.31, Math.cos(a1) * 0.33], brass); }
    D.transformSince(lf, new THREE.Matrix4().makeTranslation(0, 0.56, 0).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.32)).multiply(new THREE.Matrix4().makeRotationX(-1.1)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.32)));
    D.transformSince(f, mat4(tx, ty - 0.26, tz, 1, 1, 1, 0.35, 0.12, -0.18));
    for (let k = 0; k < 18; k++) {
      const cf = D.count, a = r.range(-0.6, 1.4), d = r.range(0.45, 1.3), cx = tx + Math.cos(a) * d, cz = tz + Math.sin(a) * d * 0.6;
      D.glow(0.3).lathe([[0.07, 0], [0.07, 0.015], [0, 0.016]], 6, gold, { base: true }).glow(0);
      D.transformSince(cf, mat4(cx, scen.heightAt(cx, cz) + 0.01, cz, 1, 1, 1, r.range(0, TAU), r.range(-0.4, 0.4), r.range(-0.4, 0.4)));
    }
  }
  // skeleton of a sailor slumped by the chest
  {
    const f = D.count, bx = tx - 1.3, bz = tz - 0.4;
    D.lathe([[0.1, 0], [0.13, 0.08], [0.12, 0.18], [0.06, 0.26], [0, 0.27]], 6, bone);
    D.transformSince(f, mat4(bx, scen.heightAt(bx, bz) + 0.05, bz, 1, 1, 1, 0.4, 0.3, 1.2));
    for (let k = 0; k < 5; k++) { const yy = scen.heightAt(bx + 0.4, bz) + 0.05; D.tube([[bx + 0.3 + k * 0.08, yy, bz - 0.15], [bx + 0.32 + k * 0.08, yy + 0.08, bz], [bx + 0.3 + k * 0.08, yy, bz + 0.15]], () => 0.015, 3, bone); }
    D.tube([[bx + 0.25, scen.heightAt(bx, bz) + 0.06, bz], [bx + 0.85, scen.heightAt(bx, bz) + 0.05, bz + 0.05]], () => 0.02, 3, bone);
  }
  toProp(scen, X, D);
  const cm = new THREE.Mesh(cloth.geometry(), scen.mats.cloth);
  cm.castShadow = true;
  group.add(cm);
  scen.disposables.push(cm.geometry);
  // growth and rubble on the halves
  for (let k = 0; k < 10; k++) scen.placePlant(r.pick(['plumose', 'hydroid', 'plumose', 'seawhip']), X + r.range(-9, 9), scen.heightAt(X, Z) + r.range(0.3, 2.5), Z + r.range(-0.6, 2.4), r.range(0.6, 1.0));
  // coins glint now and then
  scen.updaters.push((dt, camX) => { if (Math.abs(camX - tx) < 14 && Math.random() < dt * 0.9) w.fx.glint(tx + r.range(-0.5, 1.1), ty + r.range(0.05, 0.4), 1, tz + 0.3); });
  scen.reserved.push({ x: X, r: 13, z0: Z - 5, z1: Z + 8 }, { x: tx, r: 1.8, z0: tz - 1, z1: tz + 1 });
}
