// Peacock mantis shrimp (Odontodactylus scyllarus), nose +x, side-on.
//   carapace   a smooth green head shield with leopard spots and an orange rim; the rostral plate between the eyes
//   thorax     three narrow exposed segments, then a broad flattened abdomen of six overlapping segments, each with
//              a pale yellow-green trailing edge and a teal side stripe
//   tail fan   a ridged telson with red marginal spines and two uropods a side (orange, with a blue eye spot)
//   head       stalked eyes (teal, with the dark mid-band), three-branched antennules, antennae with flat orange
//              antennal scales
//   limbs      the folded raptorial appendages (merus + a pink hammer club, animated), three pairs of banded
//              walking legs, little swimmerets under the abdomen
// One painted page and one geometry for the body (cached), two club rigs on top. API matches the old box model:
// buildMantis() -> { body, clubs: Group[] (children[1] = the forearm that folds), mats } (mats flash white / red).
import * as THREE from 'three';
import { Kit } from './kit';
import { Page, paintEye, C, mix, shade } from './page';
import type { V3 } from '../gfx/loft';
import type { RGB } from '../gfx/px';
import { paintRect, cells } from './kitutil';
import { cleanTexture } from './index';
import { smoothstep } from './curve';
import { clamp } from '../core/math';
import { uw } from '../gfx/shaders/underwater';

const TAU = Math.PI * 2;

interface MantisAsset { body: THREE.BufferGeometry; merus: THREE.BufferGeometry; club: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }
let cache: MantisAsset | null = null;

const P = {
  green: [C('#2e5a26'), C('#4a8a34'), C('#76b84a'), C('#b4e070')] as RGB[],
  rim: C('#e8682a'), red: C('#d43a26'), pink: C('#ee6a84'), pinkL: C('#ffc0c8'), teal: C('#2ab0b8'), blue: C('#3a7ae0'),
  orange: C('#f2902a'), yellow: C('#f0d040'), dark: C('#142010'), cream: C('#f4ecd0'),
};

function build(): MantisAsset {
  const pg = new Page(256, 256), K = new Kit(pg);
  const shR = pg.alloc(96, 48), abR = pg.alloc(128, 48), legR = pg.alloc(16, 32), scaleR = pg.alloc(24, 24), fanR = pg.alloc(48, 32), eyeR = pg.alloc(24, 24), clubR = pg.alloc(48, 32), merR = pg.alloc(48, 24), antR = pg.alloc(8, 32);
  // ------------------------------------------------------------------------------------------ paint
  // u around the body (0 top), v along (front -> back) for the shield and the abdomen
  paintRect(pg, shR, (u, v) => {
    const top = Math.cos(u * TAU);
    let c = mix(P.green[1], P.green[2], 0.5 + 0.5 * top);
    // leopard spots on the front of the shield
    const q = cells(u * 3, v * 1.4, 0.16, 0.7, 5);
    if (v < 0.55 && q.d < 0.22 && top > -0.3) c = P.dark;
    if (top < -0.45) c = mix(c, P.rim, 0.85);              // orange lateral margin
    if (v > 0.93) c = shade(c, 0.7);
    return [c, 1, 0.35, q.d < 0.22 ? 0 : 0.4];
  });
  paintRect(pg, abR, (u, v) => {
    const top = Math.cos(u * TAU);
    const seg = v * 9, fr = seg % 1, si = Math.floor(seg);
    let c = mix(P.green[0], P.green[2], 0.45 + 0.5 * top);
    if (si < 3) c = mix(c, P.green[1], 0.4);                // thoracic segments
    if (fr > 0.82) c = mix(P.green[3], P.yellow, 0.3);      // pale trailing margin of each segment
    else if (fr < 0.08) c = shade(c, 0.6);                   // overlap shadow
    if (Math.abs(top + 0.1) < 0.12) c = mix(c, P.teal, 0.8); // side stripe
    if (top < -0.55) c = mix(c, P.rim, 0.6);
    return [c, 1, 0.35, fr > 0.82 ? 0.8 : 0.3];
  });
  paintRect(pg, legR, (u, v, i, j) => [((j >> 2) & 1) ? P.red : mix(P.orange, P.cream, 0.3), 1, 0.4, 0]);
  paintRect(pg, scaleR, (u, v) => {
    // antennal scale: orange paddle, red margin, a pale midrib
    const e = Math.abs(u - 0.5) * 2;
    let c = mix(P.orange, P.yellow, 1 - v);
    if (e > 0.75) c = P.red;
    if (e < 0.08) c = P.cream;
    return [c, 1, 0.35, 0];
  });
  paintRect(pg, fanR, (u, v) => {
    // uropods (u < 0.5): orange paddles with a blue eye spot; telson (u > 0.5): green with red spines
    if (u < 0.5) {
      let c = mix(P.orange, P.red, v * 0.6);
      if (Math.hypot(u - 0.25, v - 0.55) < 0.16) c = Math.hypot(u - 0.25, v - 0.55) < 0.1 ? P.blue : P.cream;
      return [c, 1, 0.4, 0];
    }
    let c = mix(P.green[1], P.green[2], v);
    if (v > 0.85) c = P.red;
    if (Math.abs(((u - 0.5) * 6) % 1 - 0.5) < 0.08) c = P.green[0];
    return [c, 1, 0.35, 0.4];
  });
  paintEye(pg, eyeR, { iris: ['#0a3a3a', '#1a7a72', '#3ac0a8', '#9af0d0'], pupil: 0.0, sclera: '#1a6a62', irisR: 0.98, glint: true });
  // the mid-band: three dark horizontal rows across the eye
  for (let j = 0; j < eyeR.h; j++) for (let i = 0; i < eyeR.w; i++) { const v = j / (eyeR.h - 1); if (Math.abs(v - 0.5) < 0.12 && ((j & 1) === 0 || Math.abs(v - 0.5) < 0.04)) pg.set(eyeR.x + i, eyeR.y + j, [18, 30, 34], 255, 0.1, 0); }
  paintRect(pg, clubR, (u, v) => {
    // dactyl club: pink, a bright heel where it strikes, the folded spine darker
    const top = Math.cos(u * TAU);
    let c = mix(P.pink, P.pinkL, 0.4 + 0.4 * top);
    if (v > 0.75) c = mix(P.pinkL, P.cream, 0.5);
    if (top < -0.6) c = shade(P.pink, 0.75);
    return [c, 1, 0.3, 0.3];
  });
  paintRect(pg, merR, (u, v) => {
    // merus: green-olive with cream leopard dots and a red joint
    const top = Math.cos(u * TAU);
    let c = mix(P.green[1], P.green[2], 0.5 + 0.4 * top);
    const q = cells(u * 2.5, v * 1.6, 0.2, 0.7, 9);
    if (q.d < 0.24) c = P.cream;
    if (v > 0.88 || v < 0.06) c = P.red;
    return [c, 1, 0.35, 0.3];
  });
  paintRect(pg, antR, (u, v, i, j) => [((j >> 1) & 1) ? P.orange : P.cream, 1, 0.4, 0]);

  // ------------------------------------------------------------------------------------------ body: shield + segments
  // one loft from the rostrum back to the telson base: x, half width, half height (top / bottom), centre y
  const prof: [number, number, number, number, number][] = [
    [0.47, 0.02, 0.015, 0.012, 0.11], [0.44, 0.07, 0.05, 0.035, 0.1], [0.36, 0.095, 0.075, 0.05, 0.09], [0.24, 0.1, 0.08, 0.055, 0.08],
    [0.17, 0.09, 0.07, 0.05, 0.075],                                              // shield rear edge
    [0.16, 0.07, 0.055, 0.045, 0.07], [0.1, 0.075, 0.055, 0.045, 0.065], [0.04, 0.085, 0.06, 0.045, 0.06], // thorax
  ];
  // abdomen: six broad segments with a step at each overlap
  for (let k = 0; k < 6; k++) {
    const x0 = -0.02 - k * 0.075, w = 0.105 - k * 0.006, h = 0.065 - k * 0.003;
    prof.push([x0, w * 0.96, h * 0.95, 0.045, 0.06 - k * 0.006], [x0 - 0.06, w, h, 0.045, 0.058 - k * 0.006]);
  }
  prof.push([-0.48, 0.06, 0.035, 0.03, 0.02]);
  const rings: { pts: V3[]; v: number }[] = [];
  const NS = 12;
  prof.forEach(([x, w, ht, hb, cy], i) => {
    const pts: V3[] = [];
    for (let j = 0; j <= NS; j++) {
      const a = (j / NS) * TAU, s = Math.sin(a), co = Math.cos(a);
      const ex = Math.sign(s) * Math.pow(Math.abs(s), 0.7), ey = Math.sign(co) * Math.pow(Math.abs(co), 0.8);
      pts.push([x, cy + ey * (co >= 0 ? ht : hb), ex * w]);
    }
    rings.push({ pts, v: i / (prof.length - 1) });
  });
  const fB = K.loftPart(rings, shR, { start: [0.49, 0.11, 0], end: [-0.5, 0.02, 0] });
  const sreg = pg.reg(shR), areg = pg.reg(abR);
  K.tag(fB.from, (i) => {
    if (i >= fB.to) return;
    const p = K.lo.pos(i);
    const rel = i - fB.from, j = rel % (NS + 1);
    const u = rel < prof.length * (NS + 1) ? j / NS : 0.5;
    if (p[0] > 0.165) {
      K.lo.UV[i * 2] = sreg.x + u * sreg.w; K.lo.UV[i * 2 + 1] = 1 - (sreg.y + clamp((0.49 - p[0]) / 0.33, 0, 1) * sreg.h);
    } else {
      K.lo.UV[i * 2] = areg.x + u * areg.w; K.lo.UV[i * 2 + 1] = 1 - (areg.y + clamp((0.165 - p[0]) / 0.665, 0, 1) * areg.h);
    }
  });
  // ------------------------------------------------------------------------------------------ tail fan
  const fan = (pts: V3[][], rect = fanR) => K.sheetPart(pts, rect, 0.004);
  // telson: a ridged shield plate
  fan([[[-0.47, 0.035, -0.05], [-0.47, 0.04, 0], [-0.47, 0.035, 0.05]], [[-0.6, 0.02, -0.045], [-0.62, 0.03, 0], [-0.6, 0.02, 0.045]]]);
  for (const s of [-1, 1]) {
    // two uropods a side, splayed
    fan([[[-0.46, 0.02, s * 0.05], [-0.47, 0.02, s * 0.09]], [[-0.6, 0.0, s * 0.08], [-0.6, 0.0, s * 0.15]]]);
    fan([[[-0.46, 0.015, s * 0.07], [-0.47, 0.012, s * 0.11]], [[-0.56, -0.005, s * 0.13], [-0.55, -0.01, s * 0.18]]]);
  }
  // ------------------------------------------------------------------------------------------ eyes, antennae
  for (const s of [-1, 1]) {
    const base: V3 = [0.47, 0.12, s * 0.02], top: V3 = [0.53, 0.2, s * 0.045];
    K.tube([base, [0.5, 0.165, s * 0.032], top], () => 0.012, 5, merR, { capEnd: false });
    const fe = K.lo.count, er = 0.034;
    K.blob([top[0], top[1] + 0.02, top[2]], [er * 0.75, er, er * 0.75], eyeR, { seg: 10 });
    const ereg = pg.reg(eyeR), ec: V3 = [top[0], top[1] + 0.02, top[2]];
    K.tag(fe, (i) => {
      const p = K.lo.pos(i);
      K.lo.UV[i * 2] = ereg.x + clamp(0.5 + (p[0] - ec[0] + (p[2] - ec[2]) * s) / (2 * er * 0.75), 0, 1) * ereg.w;
      K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - (p[1] - ec[1]) / (2 * er), 0, 1) * ereg.h);
    });
    // antennules: a stalk then three slender flagella, swept forward and up
    const ab: V3 = [0.48, 0.1, s * 0.035], am: V3 = [0.6, 0.16, s * 0.05];
    K.tube([ab, [0.54, 0.14, s * 0.045], am], () => 0.007, 4, antR, { capEnd: false });
    for (let f = 0; f < 3; f++) K.tube([am, [0.72 + f * 0.02, 0.22 + f * 0.03, s * (0.05 + f * 0.02)], [0.86 + f * 0.03, 0.24 + f * 0.06, s * (0.06 + f * 0.03)]], (t) => 0.0035 * (1 - t * 0.6), 3, antR, { capEnd: true, flutter: 0.5, phase: f });
    // antennal scale: a flat orange paddle out to the side
    K.sheetPart([[[0.47, 0.07, s * 0.07], [0.49, 0.07, s * 0.08]], [[0.56, 0.1, s * 0.14], [0.6, 0.1, s * 0.13]], [[0.6, 0.12, s * 0.18], [0.64, 0.11, s * 0.16]]], scaleR, 0.003);
    K.tube([[0.48, 0.07, s * 0.06], [0.62, 0.09, s * 0.1], [0.78, 0.04, s * 0.14]], (t) => 0.004 * (1 - t * 0.5), 3, antR, { capEnd: true, flutter: 0.4, phase: s });
  }
  // ------------------------------------------------------------------------------------------ walking legs + swimmerets
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = 0.12 - k * 0.06, b: V3 = [x, 0.02, s * 0.05];
      K.tube([b, [x + 0.01, -0.05, s * 0.09], [x - 0.02, -0.12, s * 0.1]], (t) => 0.009 * (1 - t * 0.5), 4, legR, { capEnd: true });
    }
    for (let k = 0; k < 5; k++) {
      const x = -0.05 - k * 0.075;
      K.sheetPart([[[x, 0.02, s * 0.035], [x - 0.02, 0.02, s * 0.04]], [[x - 0.01, -0.012, s * 0.05], [x - 0.04, -0.012, s * 0.055]]], legR, 0.002);
    }
  }
  const body = K.geometry().geo;
  // ------------------------------------------------------------------------------------------ raptorial limb (own meshes)
  const MK = new Kit(pg);
  // merus: a thick blade from the shoulder (origin) along +x, 0.22 long
  const mr: { pts: V3[]; v: number }[] = [];
  for (let i = 0; i <= 4; i++) { const f = i / 4, r = 0.026 + 0.012 * Math.sin(Math.PI * f); mr.push({ pts: Kit.ring([f * 0.22, 0, 0], [0, 0, 1], [0, 1, 0], r * 0.6, r, 6), v: f }); }
  MK.loftPart(mr, merR, { start: [-0.01, 0, 0], end: [0.23, 0, 0] });
  const merus = MK.geometry().geo;
  const CK = new Kit(pg);
  // forearm (propodus) + the dactyl club: a swollen hammer at the end
  const cr: { pts: V3[]; v: number }[] = [];
  for (let i = 0; i <= 6; i++) {
    const f = i / 6, x = f * 0.2;
    const r = f < 0.55 ? 0.02 + f * 0.01 : 0.026 + Math.sin(Math.PI * (f - 0.55) / 0.45) * 0.03;
    cr.push({ pts: Kit.ring([x, f > 0.55 ? -(f - 0.55) * 0.05 : 0, 0], [0, 0, 1], [0, 1, 0], r * 0.75, r, 6), v: f });
  }
  CK.loftPart(cr, clubR, { start: [-0.01, 0, 0], end: [0.21, -0.025, 0] });
  // the folded dactyl spine along the club
  CK.cone([0.13, 0.025, 0], [1, 0.25, 0], 0.08, 0.008, legR, 3);
  const club = CK.geometry().geo;
  const tex = pg.textures(2);
  cleanTexture(tex.map, 16);
  const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0, flatShading: true, vertexColors: true });
  mat.normalScale.set(0.5, 0.5);
  uw(mat, { rim: 0.25 });
  return { body, merus, club, mat };
}

/** the mantis shrimp mesh (nose +x): body, two club rigs (children[1] = the folding forearm), per-instance materials */
export function buildMantisModel(): { body: THREE.Group; clubs: THREE.Group[]; mats: THREE.MeshStandardMaterial[] } {
  cache ??= build();
  const a = cache;
  const mat = a.mat.clone();
  mat.emissive = new THREE.Color(0, 0, 0);
  const body = new THREE.Group(), clubs: THREE.Group[] = [];
  const mk = (g: THREE.BufferGeometry) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
  body.add(mk(a.body));
  for (const z of [0.07, -0.07]) {
    const g = new THREE.Group(); g.position.set(0.4, 0.0, z);
    g.add(mk(a.merus));
    const fore = new THREE.Group(); fore.position.set(0.22, 0, 0);
    fore.add(mk(a.club));
    g.add(fore);
    body.add(g); clubs.push(g);
  }
  body.scale.setScalar(1.25);
  void smoothstep;
  return { body, clubs, mats: [mat] };
}
