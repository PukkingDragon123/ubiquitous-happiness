// Hermit crabs in borrowed homes (v8). One rig, seven shells; the body is the white-spotted hermit body from crab.ts
// (crabBase, hermit = true) turned to face +x and sat in the shell's mouth, in a palette per shell:
//   hermit          a banded whelk (spiral cone, growth ribs, a pearly flared lip)                  Dardanus red, white spots
//   hermit_moon     a moon snail: a fat glossy globe, low spire, chestnut spiral band, violet callus  orange, white-ringed legs
//   hermit_cap      a red crown bottle cap worn like a helmet (21 crimps, a white star, rust)       blue legs, orange knees
//   hermit_tin      a dented sardine tin on its side, the torn lid bent up like an awning            olive, cream stripes
//   hermit_teacup   a tiny teacup on its side: blue willow band, gold rim, a chip, a tea ring       peach-pink
//   hermit_skull    a little bleached skull: sutures, sockets with its own eyes peeking out, teeth  violet, white-tipped claws
//   hermit_giant    a giant knobbed triton with barnacles and a pink anemone riding on top         deep red
// The rig (m.anim): walk (legs), hide 0..1 (the body pulls back into the shell, legs fold, the big claw plugs the
// mouth), naked 0..1 (the shell lifts off and the soft curled abdomen shows: shell swaps), and the shell rocks as it
// walks. Shell-only copies for the swap event: hermitShellOnly(m) hides the crab.
import * as THREE from 'three';
import { Kit } from './kit';
import { Page, paintSwatch, grad, C, mix, shade } from './page';
import { V3, add, scale, norm, cross } from '../gfx/loft';
import type { FishModel, SpeciesAsset } from './model';
import { paintRect } from './kitutil';
import { crabBase, type CrabPal } from './crab';
import { clamp, damp, hash2 } from '../core/math';

const TAU = Math.PI * 2;
export type ShellKind = 'whelk' | 'moon' | 'cap' | 'tin' | 'teacup' | 'skull' | 'giant';
export const SHELL_SPECIES: Record<ShellKind, string> = {
  whelk: 'hermit', moon: 'hermit_moon', cap: 'hermit_cap', tin: 'hermit_tin', teacup: 'hermit_teacup', skull: 'hermit_skull', giant: 'hermit_giant',
};
export const SHELL_NAME: Record<ShellKind, string> = {
  whelk: 'whelk', moon: 'moon snail', cap: 'bottle cap', tin: 'sardine tin', teacup: 'teacup', skull: 'skull', giant: 'giant triton',
};

const PAL: Record<ShellKind, CrabPal> = {
  whelk: { shell: ['#5a0e0a', '#9a2214', '#c8401e', '#ec7a44'], belly: '#f6d8b8', leg: ['#e0482a', '#b8301c', '#7a1a10'], tip: '#2a1008', gran: '#ffe0c8', eye: '#101010', spots: '#fff4e8', ring: '#1a0806' },
  moon: { shell: ['#4a1a0a', '#8a3a14', '#c8642a', '#f0a060'], belly: '#f8dcc0', leg: ['#f08a3a', '#c8582a', '#7a2a14'], tip: '#2a1408', gran: '#ffe4c8', eye: '#0a0a0a', spots: '#fff0e0', ring: '#a8401a' },
  cap: { shell: ['#0a1a3a', '#1a3a7a', '#2a5ab0', '#5a8ae0'], belly: '#e0e8f8', leg: ['#3a7ae8', '#2050b0', '#10285a'], tip: '#ff8a2a', gran: '#c8e0ff', eye: '#0a0a0a', spots: '#ff9a3a', ring: '#10285a' },
  tin: { shell: ['#1a2a0a', '#3a5a1a', '#5a8a2a', '#9ac04a'], belly: '#eef0d0', leg: ['#8ab84a', '#5a8a2a', '#2a4a10'], tip: '#3a2a10', gran: '#e0f0b0', eye: '#101010', spots: '#f8f8e0', ring: '#2a4a10' },
  teacup: { shell: ['#5a1a2a', '#a04050', '#e07a7a', '#ffb8a8'], belly: '#fff0e8', leg: ['#ff9a8a', '#d0606a', '#80303a'], tip: '#3a1010', gran: '#ffe8e0', eye: '#101010', spots: '#ffffff', ring: '#80303a' },
  skull: { shell: ['#1a0a2a', '#3a1a5a', '#6a3a9a', '#a070d0'], belly: '#e8d8f0', leg: ['#5a3a8a', '#3a2060', '#1a0a30'], tip: '#fff0e0', gran: '#e0c8ff', eye: '#101010', spots: '#d8c0f8', ring: '#1a0a30' },
  giant: { shell: ['#3a0606', '#7a120c', '#b0261a', '#e0583a'], belly: '#f8d0b0', leg: ['#c8301a', '#901a10', '#4a0a06'], tip: '#1a0806', gran: '#ffc8a0', eye: '#0a0a0a', spots: '#ffe0c0', ring: '#4a0a06' },
};

interface ShellOut { geo: THREE.BufferGeometry; tex: ReturnType<Page['textures']>; pos: V3; rot: V3; scl: number; abdomen: { geo: THREE.BufferGeometry }; /** the aperture's centre (shell-local): the body sits in it */ mouth: V3 }

// ============================================================================================ shared bits
/** the soft curled abdomen (pale, ringed) that lives inside every shell: shows when the shell lifts off */
function abdomen(pg: Page, K: Kit, from: V3, k = 1): void {
  const r = pg.alloc(48, 16);
  paintRect(pg, r, (u, v, i) => {
    const top = Math.cos(v * TAU);
    let c = mix(C('#f6c8c0'), C('#e8948a'), 0.5 - top * 0.5);
    if (i % 6 === 0) c = shade(c, 0.82);                 // soft segment creases
    if (top > 0.6 && i % 6 === 2) c = mix(c, C('#fff0ea'), 0.6);
    return [c, 1, 0.6, i % 6 === 0 ? 0 : 0.5];
  });
  const path: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10, a = f * Math.PI * 1.25;
    path.push(add(from, [(-Math.sin(a) * 0.055 - f * 0.02) * k, (0.02 + (1 - Math.cos(a)) * 0.03) * k, Math.sin(a * 0.8) * 0.01 * k]));
  }
  K.lo.tube(path, (t) => (0.03 * (1 - t * 0.7) + 0.004) * k, 8, pg.reg(r), K.newG(), { capEnd: true });
}

/** a conical spiral shell (whelk / moon snail / triton): a tube wound round a helix, whorls shrinking to the apex */
function spiral(pg: Page, K: Kit, rect: ReturnType<Page['alloc']>, o: { axis: V3; len: number; rho: number; rhoP: number; turns: number; r0: number; rp: number; base?: V3; sides?: number; knob?: (f: number, phi: number) => number; N?: number }) {
  const axis = norm(o.axis), u1 = norm(cross(axis, [0, 0, 1])), u2 = norm(cross(axis, u1));
  const sb = o.base ?? [-0.02, 0.05, 0];
  const N = o.N ?? 40, path: V3[] = [];
  const phiAt = (f: number) => f * o.turns * TAU + 0.6;
  for (let i = 0; i <= N; i++) {
    const f = i / N, phi = phiAt(f);
    const rho = o.rho * Math.pow(1 - f, o.rhoP) + 0.002;
    path.push(add(add(sb, scale(axis, o.len * Math.pow(f, 0.8))), add(scale(u1, Math.cos(phi) * rho), scale(u2, Math.sin(phi) * rho))));
  }
  const ft = K.lo.count;
  K.lo.tube(path, (t) => (o.r0 * Math.pow(1 - t, o.rp) + 0.003) * (1 + (o.knob ? o.knob(t, phiAt(t)) : 0)), o.sides ?? 12, pg.reg(rect), K.newG(), { capEnd: true });
  K.tag(ft, (i, A) => { A.ao[i] = 1; });
  return path;
}
/** the flared lip ring round a spiral's aperture */
function lip(pg: Page, K: Kit, path: V3[], rect: ReturnType<Page['alloc']>, rs: [number, number, number][]) {
  const p0 = path[0], d0 = norm([path[0][0] - path[1][0], path[0][1] - path[1][1], path[0][2] - path[1][2]]);
  const a1 = norm(cross(d0, [0, 0, 1])), a2 = norm(cross(d0, a1));
  const rings = rs.map(([k, rr, off]) => ({ pts: Kit.ring(add(p0, scale(d0, off)), a1, a2, rr, rr, 18), v: k / (rs.length - 1) }));
  K.loftPart(rings, rect);
  // the dark hollow inside the mouth (a shallow cup, so the shell never shows its own inside faces)
  const hole = pg.alloc(16, 16);
  paintRect(pg, hole, (u, v) => [mix(C('#5a3040'), C('#120a10'), v), 1, 0.9, 0]);
  const r0 = rs[0][1];
  K.loftPart([{ pts: Kit.ring(add(p0, scale(d0, 0.002)), a1, a2, r0 * 0.97, r0 * 0.97, 18), v: 0 }, { pts: Kit.ring(add(p0, scale(d0, -r0 * 0.35)), a1, a2, r0 * 0.7, r0 * 0.7, 18), v: 0.6 }], hole, { end: add(p0, scale(d0, -r0 * 0.6)) });
}

// ============================================================================================ the shells
function whelkShell(): ShellOut {
  const pg = new Page(256, 128), K = new Kit(pg);
  const shR = pg.alloc(200, 64), lipR = pg.alloc(32, 16);
  // a banded whelk: cream to warm tan (lit crown), chestnut spiral cords running along the whorl, a violet thread
  // between them, fine growth lines across
  paintRect(pg, shR, (u, v, i, j) => {
    const around = 0.5 + 0.5 * Math.cos(u * TAU);
    let c = grad(['#4a2a2a', '#8a5a4a', '#c89a70', '#ecd2b0', '#fff4e4'])(0.2 + around * 0.72, 0, 0);
    const k = (u * 5 + 0.1) % 1;
    if (k < 0.2) c = mix(c, C('#8a4426'), 0.72);
    else if (k > 0.55 && k < 0.63) c = mix(c, C('#6a4a8a'), 0.4);
    if (j % 5 === 0) c = shade(c, 0.9);
    void i; void v;
    return [c, 1, 0.4, k < 0.2 ? 0.8 : 0.3];
  });
  paintSwatch(pg, lipR, ['#ffe8f0', '#f0b8c8', '#c07890'], 0.2);
  const path = spiral(pg, K, shR, { axis: [-0.75, 0.62, 0], len: 0.17, rho: 0.06, rhoP: 1.1, turns: 3.1, r0: 0.046, rp: 1.2, N: 36, knob: (t) => 0.04 * Math.max(0, Math.sin(t * 120)) });
  lip(pg, K, path, lipR, [[0, 0.058, 0], [1, 0.064, 0.006], [2, 0.05, 0.004]]);
  const geo = K.geometry().geo;
  const AK = new Kit(pg); abdomen(pg, AK, [0, 0, 0]);
  return { geo, tex: pg.textures(2), pos: [0, 0, 0], rot: [0, 0.6, 0], scl: 1.55, abdomen: { geo: AK.geometry().geo }, mouth: path[0] };
}

function moonShell(): ShellOut {
  const pg = new Page(256, 128), K = new Kit(pg);
  const shR = pg.alloc(192, 64), lipR = pg.alloc(32, 16), calR = pg.alloc(24, 24);
  // a smooth glossy globe: cream to warm tan, one chestnut band riding the shoulder, fine growth lines, white base
  paintRect(pg, shR, (u, v, i) => {
    const around = 0.5 + 0.5 * Math.cos(u * TAU);          // 1 on the lit crown, 0 underneath
    let c = grad(['#7a5a4a', '#b08a6a', '#d8b48a', '#f0dcb8', '#fff6e8'])(0.2 + around * 0.7, 0, 0);
    const sh = Math.sin(u * TAU * 1 + 0.9);
    if (sh > 0.72 && sh < 0.9) c = mix(c, C('#8a4a24'), 0.75);      // the chestnut spiral band
    if (sh > 0.9) c = mix(c, C('#c47a44'), 0.45);
    if (around < 0.22) c = mix(c, C('#fff8ee'), 0.6);              // white base
    if (i % 7 === 0) c = shade(c, 0.93);                           // growth lines across the whorl
    return [c, 1, 0.35, i % 7 === 0 ? 0.2 : 0.6];
  });
  paintSwatch(pg, lipR, ['#f6eade', '#d8b8a0', '#8a6a5a'], 0.3);
  paintRect(pg, calR, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    return [d < 0.55 ? C('#5a2a3a') : d < 0.8 ? C('#8a4a5a') : C('#c8a0a0'), 1, 0.3, 1 - d];
  });
  const path = spiral(pg, K, shR, { axis: [-0.5, 0.86, 0], len: 0.075, rho: 0.052, rhoP: 1.5, turns: 2.4, r0: 0.064, rp: 1.7, sides: 14, N: 36, base: [-0.03, 0.045, 0] });
  lip(pg, K, path, lipR, [[0, 0.062, 0], [1, 0.066, 0.004], [2, 0.056, 0.004]]);
  // the violet callus over the umbilicus, on the near side by the mouth
  K.blob(add(path[0], [-0.03, -0.02, 0.05]), [0.018, 0.014, 0.01], calR, { seg: 8 });
  const geo = K.geometry().geo;
  const AK = new Kit(pg); abdomen(pg, AK, [0, 0, 0]);
  return { geo, tex: pg.textures(2), pos: [0, 0, 0], rot: [0, 1.0, 0], scl: 1.45, abdomen: { geo: AK.geometry().geo }, mouth: path[0] };
}

function giantShell(): ShellOut {
  const pg = new Page(256, 256), K = new Kit(pg);
  const shR = pg.alloc(224, 80), lipR = pg.alloc(48, 16), barR = pg.alloc(16, 16), barI = pg.alloc(8, 8), anR = pg.alloc(32, 32), tenR = pg.alloc(8, 24), toothR = pg.alloc(8, 8);
  // triton (Charonia): cream with chestnut crescents per whorl, knobbed shoulders, a dark varix now and then
  paintRect(pg, shR, (u, v, i, j) => {
    const around = 0.5 + 0.5 * Math.cos(u * TAU);
    let c = grad(['#4a2a1a', '#8a5a3a', '#c89a6a', '#ecd2a8', '#fff4e0'])(0.15 + around * 0.75, 0, 0);
    // crescent marks: half-moons in a staggered lattice along the whorl
    const cx = (j * 0.25 + (Math.floor(i / 12) % 2) * 6) % 12, cy = i % 12;
    const dd = Math.hypot(cx - 6, cy - 6);
    if (dd < 4.5 && cy < 7 && around > 0.25) c = mix(c, C('#6a3418'), 0.8);
    else if (dd < 5.5 && cy < 7 && around > 0.25) c = mix(c, C('#a0603a'), 0.5);
    if (i % 28 === 0) c = shade(c, 0.7);                              // a varix (old lip) every few turns
    if (i % 4 === 0) c = shade(c, 0.94);
    return [c, 1, 0.5, (i % 4 === 0 ? 0 : 0.5) + (dd < 4.5 ? 0.3 : 0)];
  });
  paintRect(pg, lipR, (u, v, i) => {
    // the aperture: orange inside, a white lip with dark-gapped teeth
    let c = v < 0.5 ? mix(C('#ff9a4a'), C('#d85a20'), v * 2) : C('#fff4e4');
    if (v >= 0.5 && i % 6 < 2) c = C('#5a2a1a');
    return [c, 1, 0.3, v >= 0.5 && i % 6 >= 2 ? 1 : 0];
  });
  paintRect(pg, barR, (u, v) => [mix(C('#f0ece0'), C('#9a948a'), v), 1, 0.7, Math.abs(Math.sin(u * TAU * 3)) * 0.8]);
  paintSwatch(pg, barI, ['#3a3a40', '#1a1a20'], 0.9);
  paintRect(pg, anR, (u, v) => [mix(C('#ff9ac0'), C('#c04a7a'), v), 1, 0.5, (Math.floor(u * 8) % 2) * 0.4]);
  paintSwatch(pg, tenR, ['#ffe0f0', '#ff8ab8', '#d0407a', '#902050'], 0.5);
  paintSwatch(pg, toothR, ['#fff8ec', '#e8d8c0'], 0.3);
  const path = spiral(pg, K, shR, {
    axis: [-0.82, 0.57, 0], len: 0.24, rho: 0.058, rhoP: 1.0, turns: 3.7, r0: 0.052, rp: 1.05, sides: 14, N: 48,
    // knobbed shoulders: nodules round each whorl, fading toward the apex
    knob: (t, phi) => 0.16 * Math.pow(Math.max(0, Math.sin(phi * 4.5)), 3) * (1 - t * 0.6),
  });
  lip(pg, K, path, lipR, [[0, 0.06, 0], [1, 0.07, 0.008], [2, 0.064, 0.012], [3, 0.05, 0.008]]);
  // barnacles: little volcano cones in a cluster on the body whorl, each with a dark slit on top
  const bars: [number, number][] = [[6, 0.9], [8, 2.1], [10, 1.4], [5, 2.6], [12, 0.3], [14, 1.9], [9, 3.2]];
  for (const [pi, a] of bars) {
    const c = path[pi], n = norm([Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.6]);
    const p = add(c, scale(n, 0.045));
    const hb = 0.008 + hash2(pi, 3, 7) * 0.006;
    K.cone(p, n, hb * 1.6, hb, barR, 4);
    K.blob(add(p, scale(n, hb * 1.3)), [hb * 0.45, hb * 0.2, hb * 0.45], barI, { seg: 6 });
  }
  // a pink anemone riding on top (a real hermit trick: it stings what pokes the crab), tentacles waving
  const ap = add(path[10], [0.0, 0.055, 0.0]);
  K.tube([ap, add(ap, [0.004, 0.02, 0]), add(ap, [0.002, 0.036, 0])], (t) => 0.016 + t * 0.006, 10, anR, { capEnd: true });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU, top = add(ap, [0.002, 0.036, 0]);
    const tip = add(top, [Math.cos(a) * 0.04, 0.018 + Math.sin(k * 1.7) * 0.008, Math.sin(a) * 0.04]);
    K.tube([add(top, [Math.cos(a) * 0.016, 0, Math.sin(a) * 0.016]), add(top, [Math.cos(a) * 0.03, 0.014, Math.sin(a) * 0.03]), tip], (t) => 0.0045 * (1 - t * 0.7), 6, tenR, { flutter: 1.2, phase: k * 0.9, capEnd: true });
  }
  // a few white teeth inside the lip
  for (let k = 0; k < 5; k++) { const a = -0.9 + k * 0.45; K.blob(add(path[0], [0.012, Math.sin(a) * 0.05, Math.cos(a) * 0.05]), [0.006, 0.004, 0.004], toothR, { seg: 5 }); }
  const geo = K.geometry().geo;
  const AK = new Kit(pg); abdomen(pg, AK, [0, 0, 0]);
  return { geo, tex: pg.textures(2), pos: [0, 0, 0], rot: [0, 0.6, 0], scl: 1.6, abdomen: { geo: AK.geometry().geo }, mouth: path[0] };
}

/** a red crown cap worn like a helmet over the abdomen, tipped back */
function capShell(): ShellOut {
  const pg = new Page(256, 128), K = new Kit(pg);
  const topR = pg.alloc(64, 64), skR = pg.alloc(168, 12), inR = pg.alloc(48, 48);
  const R0 = 0.088, H = 0.042;
  paintRect(pg, topR, (u, v) => {
    const x = u * 2 - 1, y = v * 2 - 1, d = Math.hypot(x, y);
    let c = d > 0.9 ? C('#a01818') : x + y < -0.7 ? C('#f04a3a') : C('#d42a24');
    if (d > 0.62 && d < 0.74) c = C('#fff2e0');                           // the white ring
    // a five-point star
    const a = Math.atan2(y, x) + Math.PI / 2, k = ((a / TAU) * 5 % 1 + 1) % 1, rr = 0.48 * (0.45 + 0.55 * Math.abs(k * 2 - 1) ** 1.6);
    if (d < 0.5 && d < 0.2 + (1 - Math.abs(k * 2 - 1)) * 0.3) c = C('#fff8ee');
    void rr;
    // rust blooms near the rim, and a scuffed patch
    if (Math.hypot(x - 0.55, y - 0.45) < 0.14 && d > 0.75) c = C('#b8642a');
    if (Math.hypot(x + 0.62, y + 0.1) < 0.1) c = C('#8a3a18');
    return [c, 1, 0.35, d > 0.62 && d < 0.74 ? 0.6 : 0.3];
  });
  paintRect(pg, skR, (u, v, i) => {
    // the crimped skirt: alternating lit / shaded flutes, a silver lower edge
    let c = i % 8 < 4 ? C('#e03a30') : C('#9a1a16');
    if (v > 0.7) c = i % 8 < 4 ? C('#d8dce4') : C('#8a909c');
    if ((i * 7) % 41 < 3 && v < 0.5) c = C('#b8642a');
    return [c, 1, 0.3, i % 8 < 4 ? 1 : 0];
  });
  paintRect(pg, inR, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    let c = d > 0.86 ? C('#8a909c') : C('#e8dcc0');                      // the cork liner, faded print
    if (d < 0.86 && Math.abs(v - 0.46) < 0.06 && Math.abs(u - 0.5) < 0.3 && Math.floor(u * 24) % 2 === 0) c = C('#c03a2a');
    return [c, 1, 0.8, 0];
  });
  const N = 42, crimp = (a: number, k: number) => 1 + 0.07 * Math.cos(a * 21) * k;
  const ringAt = (y: number, r: number, ck: number) => {
    const pts: V3[] = [];
    for (let j = 0; j <= N; j++) { const a = (j / N) * TAU, rr = r * crimp(a, ck); pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]); }
    return pts;
  };
  // top face (planar uvs), the skirt (around), the liner inside (planar)
  const f0 = K.lo.count;
  K.loftPart([{ pts: ringAt(H, R0 * 0.55, 0), v: 0 }, { pts: ringAt(H - 0.002, R0 * 0.9, 0), v: 1 }], topR, { start: [0, H + 0.002, 0] });
  const treg = pg.reg(topR);
  K.tag(f0, (i) => { const p = K.lo.pos(i); K.lo.UV[i * 2] = treg.x + clamp(p[0] / R0 / 2 + 0.5, 0, 1) * treg.w; K.lo.UV[i * 2 + 1] = 1 - (treg.y + clamp(p[2] / R0 / 2 + 0.5, 0, 1) * treg.h); });
  K.loftPart([{ pts: ringAt(H - 0.002, R0 * 0.9, 0), v: 0 }, { pts: ringAt(H - 0.012, R0 * 0.99, 0.6), v: 0.35 }, { pts: ringAt(0.004, R0 * 1.02, 1), v: 0.8 }, { pts: ringAt(0, R0 * 1.0, 1), v: 1 }], skR);
  const f2 = K.lo.count;
  K.loftPart([{ pts: ringAt(0, R0 * 0.94, 1), v: 0 }, { pts: ringAt(H - 0.008, R0 * 0.86, 0.3), v: 1 }], inR, { end: [0, H - 0.008, 0], flip: true });
  const ireg = pg.reg(inR);
  K.tag(f2, (i) => { const p = K.lo.pos(i); K.lo.UV[i * 2] = ireg.x + clamp(p[0] / R0 / 2 + 0.5, 0, 1) * ireg.w; K.lo.UV[i * 2 + 1] = 1 - (ireg.y + clamp(p[2] / R0 / 2 + 0.5, 0, 1) * ireg.h); });
  const geo = K.geometry().geo;
  const AK = new Kit(pg); abdomen(pg, AK, [0, 0, 0], 0.9);
  // worn tipped back on the crab's rear, open side down-forward
  return { geo, tex: pg.textures(2), pos: [0, 0, 0], rot: [0, 0.7, 1.25], scl: 1.1, abdomen: { geo: AK.geometry().geo }, mouth: [0, 0.006, 0] };
}

/** a dented sardine tin on its side, open end forward, the torn lid bent up over it */
function tinShell(): ShellOut {
  const pg = new Page(256, 128), K = new Kit(pg);
  const sideR = pg.alloc(160, 48), endR = pg.alloc(32, 32), inR = pg.alloc(64, 24), lidR = pg.alloc(32, 32);
  const L = 0.13, Rr = 0.05, x0 = -0.11, x1 = x0 + L;
  // the side: silver ends, a paper label (teal band, a cream panel with a red fish, the brand stripe), rust where it rubs
  paintRect(pg, sideR, (u, v, i, j) => {
    const top = Math.cos(u * TAU);
    let c: [number, number, number];
    if (v < 0.12 || v > 0.9) c = top > 0.3 ? C('#d8dee8') : top > -0.3 ? C('#a8b0bc') : C('#6a7280');
    else {
      c = top > 0.2 ? C('#2a8a9a') : C('#1a5a6a');                      // teal label
      if (v > 0.3 && v < 0.72 && Math.abs(u - 0.25) < 0.16) {
        c = C('#f4e8c8');                                                // the cream panel facing the camera
        const fx = (u - 0.25) / 0.16, fy = (v - 0.51) / 0.21;
        if (fx * fx * 1.4 + fy * fy * 3.2 < 0.5 && fx > -0.75) c = C('#d84a2a');                 // a sardine
        if (fx < -0.62 && Math.abs(fy) < (-0.62 - fx) * 1.6 && fx > -0.95) c = C('#d84a2a');   // its tail
        if (Math.hypot(fx - 0.4, fy + 0.12) < 0.08) c = C('#1a1010');                          // its eye
      }
      if (Math.abs(v - 0.21) < 0.03 || Math.abs(v - 0.81) < 0.03) c = C('#f0c040');           // gold pinstripes
    }
    if (j > 0 && (Math.abs(v - 0.12) < 0.02 || Math.abs(v - 0.9) < 0.02)) c = shade(c, 0.7);  // beads
    // rust blooms on the belly and a scrape
    if (top < -0.2 && (Math.hypot(u * 160 - 110, v * 48 - 30) < 7 || Math.hypot(u * 160 - 60, v * 48 - 16) < 5)) c = C('#a85a24');
    if (top < -0.2 && Math.hypot(u * 160 - 110, v * 48 - 30) < 3.5) c = C('#6a2a10');
    return [c, 1, v < 0.12 || v > 0.9 ? 0.25 : 0.6, (v < 0.12 || v > 0.9) && i % 3 === 0 ? 0.5 : 0];
  });
  paintRect(pg, endR, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    let c = C('#b8c0cc');
    if (Math.abs(d - 0.7) < 0.08 || Math.abs(d - 0.4) < 0.06) c = C('#7a8290');      // pressed rings
    if (d > 0.92) c = C('#e0e6ee');
    if (Math.hypot(u - 0.3, v - 0.7) < 0.12) c = C('#a85a24');
    return [c, 1, 0.3, Math.abs(d - 0.7) < 0.08 ? 1 : 0.3];
  });
  paintRect(pg, inR, (u, v) => [mix(C('#c8ccd4'), C('#2a2e38'), v), 1, 0.4, 0]);
  paintRect(pg, lidR, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    let c = d > 0.86 ? C('#e8ecf2') : C('#c4ccd6');
    if (Math.abs(d - 0.62) < 0.07) c = C('#8a929e');
    if (Math.hypot(u - 0.62, v - 0.36) < 0.1) c = C('#f0f4f8');          // the ring pull
    if (Math.hypot(u - 0.62, v - 0.36) < 0.05) c = C('#6a727e');
    return [c, 1, 0.25, Math.abs(d - 0.62) < 0.07 ? 1 : 0.3];
  });
  // a dent: the rings pressed in on the upper back
  const dent = (x: number, a: number) => 1 - 0.14 * Math.max(0, 1 - Math.hypot((x + 0.07) / 0.03, (a - 1.2) / 0.6));
  const ringX = (x: number, r: number) => {
    const pts: V3[] = [];
    for (let j = 0; j <= 20; j++) { const a = (j / 20) * TAU; const rr = r * dent(x, ((a % TAU) + TAU) % TAU); pts.push([x, Math.cos(a) * rr, Math.sin(a) * rr]); }
    return pts;
  };
  const sideRings: { pts: V3[]; v: number }[] = [];
  const xs: [number, number][] = [[x0, 0.96], [x0 + 0.006, 1.0], [x0 + 0.016, 1.0], [x0 + 0.02, 0.97], [x0 + 0.026, 1.0], [x1 - 0.026, 1.0], [x1 - 0.02, 0.97], [x1 - 0.016, 1.0], [x1 - 0.004, 1.02], [x1, 1.04]];
  for (const [x, k] of xs) sideRings.push({ pts: ringX(x, Rr * k), v: (x - x0) / L });
  // closed back end (start pole), open front: then the rim folds inside and runs back to a dark inner bottom
  const f0 = K.lo.count;
  K.loftPart([{ pts: ringX(x0 - 0.002, Rr * 0.6), v: 0 }, { pts: ringX(x0, Rr * 0.96), v: 1 }], endR, { start: [x0 - 0.003, 0, 0] });
  const ereg = pg.reg(endR);
  K.tag(f0, (i) => { const p = K.lo.pos(i); K.lo.UV[i * 2] = ereg.x + clamp(p[2] / Rr / 2 + 0.5, 0, 1) * ereg.w; K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - p[1] / Rr / 2, 0, 1) * ereg.h); });
  K.loftPart(sideRings, sideR);
  K.loftPart([{ pts: ringX(x1, Rr * 1.04), v: 0 }, { pts: ringX(x1 - 0.003, Rr * 0.95), v: 0.2 }, { pts: ringX(x0 + 0.01, Rr * 0.9), v: 1 }], inR, { end: [x0 + 0.01, 0, 0], flip: true });
  // the torn lid, hinged at the top of the mouth and bent up and back like an awning (a ragged edge on the far side)
  const lg: V3[][] = [];
  for (let r = 0; r <= 6; r++) {
    const row: V3[] = [];
    for (let c = 0; c <= 6; c++) {
      const s = (c / 6) * 2 - 1, t = r / 6;                       // s across, t from hinge to the torn edge
      const w = Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2)) * Rr * 0.95 * (r === 6 && c % 2 ? 0.8 : 1);
      const bend = t * 1.9;
      const len = t * Rr * 1.9;
      row.push([x1 + 0.004 + Math.sin(bend) * len * 0.5, Rr * 1.0 + (1 - Math.cos(bend)) * len * 0.35 + len * 0.55, s * w]);
    }
    lg.push(row);
  }
  K.sheetPart(lg, lidR, 0.003);
  const geo = K.geometry().geo;
  const AK = new Kit(pg); abdomen(pg, AK, [0, 0, 0], 0.95);
  return { geo, tex: pg.textures(2), pos: [0, 0, 0], rot: [0, 0, 0.12], scl: 1.25, abdomen: { geo: AK.geometry().geo }, mouth: [x1 - 0.01, -0.005, 0] };
}

/** a tiny teacup on its side: blue willow band, gold rim, a chip out of the lip, a tea ring inside */
function teacupShell(): ShellOut {
  const pg = new Page(256, 128), K = new Kit(pg);
  const outR = pg.alloc(160, 40), inR = pg.alloc(96, 24), footR = pg.alloc(32, 32), hR = pg.alloc(32, 8);
  const prof: [number, number][] = [[-0.075, 0.03], [-0.072, 0.034], [-0.066, 0.036], [-0.05, 0.046], [-0.03, 0.055], [-0.01, 0.06], [0.004, 0.062]];
  paintRect(pg, outR, (u, v, i) => {
    const top = Math.cos(u * TAU);
    let c = top > 0.4 ? C('#ffffff') : top > -0.2 ? C('#eef0f6') : C('#c8ccdc');
    // the blue band: a scalloped border over a row of little five-dot flowers, between two thin lines
    if (v > 0.45 && v < 0.84) {
      const k = i % 16, fx = k - 8, fy = (v - 0.66) * 40;
      const petal = [[0, -2.2], [2.1, -0.7], [1.3, 1.8], [-1.3, 1.8], [-2.1, -0.7]].some(([px, py]) => Math.hypot(fx - px, fy - py) < 1.3);
      const scallop = v > 0.47 && v < 0.53 + 0.04 * Math.cos((k / 16) * TAU);
      if (petal || scallop) c = top > -0.2 ? C('#2a4aa8') : C('#1a2a6a');
      if (Math.hypot(fx, fy) < 0.9) c = C('#f8d060');
    }
    if (Math.abs(v - 0.42) < 0.025 || Math.abs(v - 0.86) < 0.025) c = top > -0.2 ? C('#3a5ab8') : C('#203a80');
    if (v > 0.95) c = top > 0 ? C('#f8d060') : C('#b08a30');                       // gold rim
    return [c, 1, 0.25, 0];
  });
  paintRect(pg, inR, (u, v) => {
    let c = mix(C('#fbfbff'), C('#c4c8d8'), Math.min(1, v * 1.4));
    if (Math.abs(v - 0.45) < 0.05) c = C('#c8a070');                                 // the tea ring
    return [c, 1, 0.25, 0];
  });
  paintRect(pg, footR, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    let c = d > 0.8 ? C('#d8dce8') : C('#f4f4fa');
    if (d < 0.36 && Math.abs(v - 0.5) < 0.06) c = C('#2a4aa8');                       // the maker's mark
    return [c, 1, 0.3, d > 0.8 ? 0.6 : 0];
  });
  paintRect(pg, hR, (u, v) => [Math.abs(v - 0.5) < 0.18 ? C('#f8d060') : Math.cos(u * TAU) > 0 ? C('#ffffff') : C('#d8dce8'), 1, 0.25, 0]);
  const ringX = (x: number, r: number, chip = false) => {
    const pts: V3[] = [];
    for (let j = 0; j <= 22; j++) { const a = (j / 22) * TAU; const rr = r * (chip && Math.abs(((a + TAU) % TAU) - 4.2) < 0.32 ? 0.9 : 1); pts.push([x, Math.cos(a) * rr, Math.sin(a) * rr]); }
    return pts;
  };
  const f0 = K.lo.count;
  K.loftPart([{ pts: ringX(-0.077, 0.02), v: 0 }, { pts: ringX(-0.076, 0.03), v: 1 }], footR, { start: [-0.078, 0, 0] });
  const freg = pg.reg(footR);
  K.tag(f0, (i) => { const p = K.lo.pos(i); K.lo.UV[i * 2] = freg.x + clamp(p[2] / 0.06 + 0.5, 0, 1) * freg.w; K.lo.UV[i * 2 + 1] = 1 - (freg.y + clamp(0.5 - p[1] / 0.06, 0, 1) * freg.h); });
  K.loftPart(prof.map(([x, r], k) => ({ pts: ringX(x, r, k === prof.length - 1), v: k / (prof.length - 1) })), outR);
  K.loftPart([{ pts: ringX(0.004, 0.062, true), v: 0 }, { pts: ringX(0.0, 0.056, true), v: 0.1 }, { pts: ringX(-0.03, 0.05), v: 0.5 }, { pts: ringX(-0.062, 0.03), v: 1 }], inR, { end: [-0.064, 0, 0], flip: true });
  // the handle: a looped ear on top
  const hp: V3[] = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; hp.push([-0.04 + Math.cos(a) * 0.022, 0.05 + Math.sin(a) * 0.03, 0]); }
  K.tube(hp, () => 0.007, 8, hR, { capEnd: true });
  const geo = K.geometry().geo;
  const AK = new Kit(pg); abdomen(pg, AK, [0, 0, 0], 0.9);
  return { geo, tex: pg.textures(2), pos: [0, 0, 0], rot: [0, -0.55, 0.18], scl: 1.35, abdomen: { geo: AK.geometry().geo }, mouth: [-0.004, -0.006, 0] };
}

/** a little bleached skull, turned three-quarters to the camera: domed cranium, brow, cheekbones, sutures, deep sockets
 *  with the crab's own eyes peeking out, a nose hole and a row of upper teeth (the crab underneath is the jaw) */
function skullShell(): ShellOut {
  const pg = new Page(256, 128), K = new Kit(pg);
  const boneR = pg.alloc(160, 64), toothR = pg.alloc(8, 8), eyeR = pg.alloc(16, 16), sockR = pg.alloc(16, 16), arcR = pg.alloc(32, 8);
  const L = 0.15, X0 = -0.085;
  // sockets and the nose on the upper front of the face (u: 0 top, 0.25 near side; v: back -> front)
  const sockAt = (u: number, v: number) => { const side = Math.sin(u * TAU), top = Math.cos(u * TAU); return Math.min(Math.hypot((v - 0.84) / 0.11, (side - 0.48) / 0.34, Math.max(0, 0.1 - top) / 0.5), Math.hypot((v - 0.84) / 0.11, (side + 0.48) / 0.34, Math.max(0, 0.1 - top) / 0.5)); };
  paintRect(pg, boneR, (u, v, i) => {
    const top = Math.cos(u * TAU), side = Math.sin(u * TAU);
    let c = grad(['#6a5a40', '#a8946c', '#d8c8a0', '#f0e6cc', '#fffaee'])(0.2 + (top * 0.5 + 0.5) * 0.75, 0, 0);
    if (top < -0.6) c = mix(c, C('#6a8a4a'), 0.45);                                  // algae along the bottom
    const zz = (Math.floor(i / 2) % 2) ? 1 : 0;
    if (Math.abs(side) < 0.03 + zz * 0.03 && top > 0 && v < 0.7) c = shade(c, 0.6);      // the sagittal suture (zigzag)
    if (Math.abs(v - 0.5 - zz * 0.012) < 0.012 && top > 0.15) c = shade(c, 0.6);          // the coronal suture
    if (v < 0.3 && Math.abs(top - 0.4 - v * 1.2) < 0.03 && side > 0) c = shade(c, 0.5);   // a hairline crack
    if (Math.abs(v - 0.78) < 0.02 && top > 0.35) c = shade(c, 1.1);                      // the brow catches light
    const sk = sockAt(u, v);
    if (sk < 1) c = sk < 0.72 ? C('#1a120c') : C('#5a4a34');
    const nz = Math.hypot((v - 0.95) / 0.04, side / 0.14);
    if (nz < 1 && top > -0.4 && top < 0.5) c = nz < 0.7 ? C('#1a120c') : C('#5a4a34');
    return [c, 1, 0.75, sk < 1 ? -0.6 : top > 0.9 ? 0.2 : 0.6];
  });
  paintSwatch(pg, toothR, ['#fffbee', '#e8dcc0', '#b0a080'], 0.5);
  paintRect(pg, eyeR, (u, v) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2; return [d < 0.34 && u < 0.5 && v < 0.5 ? C('#ffffff') : C('#0c0a08'), 1, 0.1, 0]; });
  paintSwatch(pg, sockR, ['#2a1c12', '#140c08'], 0.9);
  paintRect(pg, arcR, (u, v) => [mix(C('#fff4dc'), C('#a8946c'), v), 1, 0.7, 0]);
  const prof = (f: number) => {
    // cranium big and round at the back, the brow, then a narrower lower face dropping toward the teeth
    const dome = Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + f * 0.92)), 0.5);
    const ry = 0.066 * dome * (f > 0.72 ? 1 - (f - 0.72) * 1.3 : 1);
    const rz = 0.058 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + f * 0.92)), 0.42) * (f > 0.82 ? 1 - (f - 0.82) * 1.6 : 1) * (f > 0.62 && f < 0.82 ? 1.05 : 1);
    const cy = f > 0.75 ? -(f - 0.75) * 0.05 : 0;
    return { ry, rz, cy };
  };
  const rings: { pts: V3[]; v: number }[] = [];
  for (let k = 1; k < 18; k++) {
    const f = k / 18, x = X0 + f * L, q = prof(f);
    rings.push({ pts: Kit.ring([x, q.cy, 0], [0, 0, 1], [0, 1, 0], q.rz, q.ry, 20, 2.1, q.ry * 0.55), v: f });
  }
  K.loftPart(rings, boneR, { start: [X0 - 0.002, 0.004, 0], end: [X0 + L + 0.002, prof(1).cy - 0.012, 0] });
  // the cheekbones: an arch from under each socket back along the side
  for (const s of [-1, 1]) {
    const q = prof(0.8);
    K.tube([[X0 + L * 0.86, q.cy - q.ry * 0.25, s * q.rz * 0.8], [X0 + L * 0.72, q.cy - q.ry * 0.32, s * q.rz * 1.05], [X0 + L * 0.56, -0.012, s * 0.055]], (t) => 0.007 - t * 0.002, 6, arcR, { capEnd: true });
  }
  // the crab's own eyes peeking out of the sockets (aEye: they look around)
  const ereg = pg.reg(eyeR);
  for (const s of [-1, 1]) {
    // a dark socket disc where a blob breaks the surface, the eye sitting in it
    const f = 0.84, q = prof(f), th = 0.78;
    const surf: V3 = [X0 + L * f, q.cy + Math.cos(th) * q.ry, s * Math.sin(th) * q.rz];
    K.blob([surf[0] + 0.002, q.cy + (surf[1] - q.cy) * 0.9, surf[2] * 0.9], [0.016, 0.017, 0.015], sockR, { seg: 9 });
    const ec: V3 = [surf[0] + 0.004, q.cy + (surf[1] - q.cy) * 0.97, surf[2] * 0.97];
    const fe = K.lo.count;
    K.blob(ec, [0.0085, 0.0095, 0.0085], eyeR, { seg: 9 });
    K.tag(fe, (i, A) => {
      const p = K.lo.pos(i);
      K.lo.UV[i * 2] = ereg.x + clamp(0.5 + (p[2] - ec[2]) * s / 0.017 * -1 + (p[0] - ec[0]) / 0.04, 0, 1) * ereg.w;
      K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - (p[1] - ec[1]) / 0.019, 0, 1) * ereg.h);
      A.eye[i * 4] = ec[0]; A.eye[i * 4 + 1] = ec[1]; A.eye[i * 4 + 2] = ec[2]; A.eye[i * 4 + 3] = 1;
    });
  }
  // upper teeth along the front edge under the nose
  const qe = prof(0.95);
  for (let k = 0; k < 8; k++) {
    const a = -1 + (k / 7) * 2, x = X0 + L * 0.95 - a * a * 0.012;
    K.lo.box([x, qe.cy - qe.ry * 0.5 - 0.006, a * qe.rz * 0.85], [0.008, 0.013, 0.007], pg.reg(toothR));
  }
  const geo = K.geometry().geo;
  const AK = new Kit(pg); abdomen(pg, AK, [0, 0, 0], 0.95);
  return { geo, tex: pg.textures(2), pos: [0, 0, 0], rot: [0, -0.75, 0.08], scl: 1.25, abdomen: { geo: AK.geometry().geo }, mouth: [X0 + L * 0.5, -0.04, 0] };
}

const SHELLS: Record<ShellKind, () => ShellOut> = { whelk: whelkShell, moon: moonShell, cap: capShell, tin: tinShell, teacup: teacupShell, skull: skullShell, giant: giantShell };

// ============================================================================================ the rig
/** where the body's pivot sits in the model (the shell is placed round it) */
const BODY_X = 0.05, BODY_Y = 0.02;
interface HermitRig { body: THREE.Group; shell: THREE.Mesh; abd: THREE.Mesh; legs: THREE.Object3D[][]; claws: THREE.Object3D[][]; sy: number; sx: number; srz: number; bs: number }
const rigOf = (m: FishModel) => (m as unknown as { hermit?: HermitRig }).hermit;

/** a hermit crab in a shell of `kind` (a SpeciesAsset for the fish library) */
export function hermitAsset(kind: ShellKind): SpeciesAsset {
  const base = crabBase(SHELL_SPECIES[kind] + '_body', PAL[kind], true);
  const sh = SHELLS[kind]();
  const parts0 = base.parts!, anim0 = base.animate!;
  const BS = kind === 'giant' ? 1.05 : 0.85;
  base.parts = (m: FishModel) => {
    // the crab body faces the camera by default; turn it to face +x and sit it in the shell mouth
    const body = new THREE.Group();
    body.add(m.mesh);
    parts0(m);
    const kids = m.group.children.filter((o) => o !== body);
    for (const o of kids) body.add(o);
    const pivot = new THREE.Group();
    body.rotation.y = Math.PI / 2;
    pivot.add(body);
    // the shell is placed so its mouth sits just behind the carapace's middle: the rear of the body is inside,
    // the head, claws and walking legs out; the front is lifted a little (hermits hold their heads up)
    const mw = new THREE.Vector3(...sh.mouth).multiplyScalar(sh.scl).applyEuler(new THREE.Euler(...sh.rot));
    const sp: V3 = [BODY_X - 0.022 - mw.x, BODY_Y + 0.014 - mw.y, -mw.z];
    pivot.position.set(BODY_X, BODY_Y, 0);
    pivot.rotation.z = 0.32;
    m.group.add(pivot);
    const sm = m.makeMaterial({ map: sh.tex.map, normalMap: sh.tex.normalMap, roughnessMap: sh.tex.roughnessMap, emissiveMap: null });
    sm.side = THREE.DoubleSide;                     // open mouths, lids and rims: both faces of every sheet
    const shell = new THREE.Mesh(sh.geo, sm);
    shell.castShadow = true;
    shell.position.set(...sp); shell.rotation.set(...sh.rot); shell.scale.setScalar(sh.scl);
    m.group.add(shell);
    // the soft abdomen curls back from the carapace into the shell (only seen naked)
    const abd = new THREE.Mesh(sh.abdomen.geo, sm);
    abd.position.set(-0.085, 0.0, 0); abd.visible = false;
    pivot.add(abd);
    m.parts.shell = shell; m.parts.body = pivot;
    const cr = (m as unknown as { crab: { legs: THREE.Object3D[][]; claws: THREE.Object3D[][] } }).crab;
    // the walking legs swing fore and aft (the side camera sees them step) instead of straight out at the camera
    cr.legs.forEach(([root], i) => { const k = i % 3, s = i < 3 ? -1 : 1; root.rotation.y = s > 0 ? [-0.85, -0.3, 0.35][k] : Math.PI + [0.85, 0.3, -0.35][k]; });
    pivot.scale.set(BS * 0.58, BS * 0.95, BS * 0.95);
    (m as unknown as { hermit: HermitRig }).hermit = { body: pivot, shell, abd, legs: cr.legs, claws: cr.claws, sy: sp[1], sx: sp[0], srz: sh.rot[2], bs: BS };
    m.anim.hide = 0; m.anim.naked = 0; m.anim.rock = 0;
  };
  base.animate = (m: FishModel, dt: number) => {
    anim0(m, dt);
    const r = rigOf(m);
    if (!r) return;
    const hide = clamp(m.anim.hide ?? 0, 0, 1), naked = clamp(m.anim.naked ?? 0, 0, 1);
    const w = Math.min(1, Math.abs(m.anim.walk ?? 0) * 3);
    const ph = m.anim.walkPhase ?? 0;
    // the body pulls back into the mouth and shrinks; legs fold up; the big claw comes across like a door
    r.body.position.set(BODY_X - hide * 0.06, BODY_Y - hide * 0.012, 0);
    r.body.rotation.z = 0.32 * (1 - hide);
    r.body.scale.set(r.bs * 0.58 * (1 - hide * 0.38), r.bs * 0.95 * (1 - hide * 0.38), r.bs * 0.95 * (1 - hide * 0.38));
    if (hide > 0.01) {
      for (const [, a, b, c] of r.legs) { a.rotation.z += (1.5 - a.rotation.z) * hide; b.rotation.z += (-2.0 - b.rotation.z) * hide; c.rotation.z += (-1.0 - c.rotation.z) * hide; }
      for (const [, ar, pv] of r.claws) { ar.rotation.z += (1.1 - ar.rotation.z) * hide; pv.rotation.z += (0.5 - pv.rotation.z) * hide; }
    }
    // the shell rocks and bobs as it walks; on a swap it lifts off and the soft abdomen shows
    m.anim.rock = damp(m.anim.rock ?? 0, w, 6, dt);
    const rk = m.anim.rock;
    r.shell.position.set(r.sx - naked * 0.03, r.sy + Math.abs(Math.sin(ph)) * 0.006 * rk + naked * 0.09 - hide * 0.006, 0);
    r.shell.rotation.z = r.srz + Math.sin(ph) * 0.06 * rk + naked * 0.5;
    r.shell.visible = naked < 0.98;
    r.abd.visible = naked > 0.05;
    r.abd.rotation.z = Math.sin(ph * 0.7) * 0.15 * naked;
  };
  base.name = SHELL_SPECIES[kind];
  base.length = kind === 'giant' ? 0.44 : kind === 'tin' ? 0.3 : 0.36;
  base.mouth.set(0.14, 0.02, 0); base.eye.set(0.12, 0.06, 0.02);
  return base;
}

/** an empty shell: the crab hidden (for shell-swap leftovers and the giant's cast-off) */
export function hermitShellOnly(m: FishModel) {
  const r = rigOf(m);
  if (!r) return;
  r.body.visible = false;
  r.abd.visible = false;
}

export const HERMIT_SPECIALS: Record<string, () => SpeciesAsset> = Object.fromEntries((Object.keys(SHELLS) as ShellKind[]).map((k) => [SHELL_SPECIES[k], () => hermitAsset(k)]));
