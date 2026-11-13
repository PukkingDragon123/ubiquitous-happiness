// Fisherman body geometry: one skinned lofted mesh per character, built from superellipse cross-section rings
// (anatomical torso with belly / barrel chest, a neck with its cords, limbs that bend smoothly at elbows and
// knees, hands with fingers and a thumb that curl into a fist round the rod grip, shoe and boot shapes) plus
// the garment shells over it (cardigans, slickers, parkas, the captain's long raincoat, skirts, hoods,
// collars, vest pockets). Ported from Limbophobia's buildBody (humanModel.ts) onto src/gfx/loft.ts.
import * as THREE from 'three';
import type { V3, Wt } from '../gfx/loft';
import { Loft, usFor } from '../gfx/loft';
import type { Dims, Row, BoneName } from './rig';
import { BI, ellRing, superPt, sampleRows, ringYs, gauss, angd, vOf, clamp01 } from './rig';
import type { Look, FeetKind, OuterKind, LegKind } from './looks';
import { R, VMAP, subR } from './page';
import type { RegKey } from './page';
import { buildHead, headShape } from './head';
import type { HeadShape } from './head';

// ------------------------------------------------------------------ profiles (reference body, s = 1)
// a slightly stylised adult: a solid ribcage, softly sloping shoulders, a real waist
const TORSO_ROWS: Row[] = [
  { y: 0.815, rx: 0.064, rf: 0.052, rb: 0.06 },
  { y: 0.86, rx: 0.138, rf: 0.078, rb: 0.09 },
  { y: 0.93, rx: 0.15, rf: 0.082, rb: 0.1 },
  { y: 1.0, rx: 0.14, rf: 0.08, rb: 0.088 },
  { y: 1.08, rx: 0.127, rf: 0.08, rb: 0.076 },
  { y: 1.16, rx: 0.132, rf: 0.086, rb: 0.079 },
  { y: 1.25, rx: 0.143, rf: 0.093, rb: 0.085 },
  { y: 1.32, rx: 0.148, rf: 0.092, rb: 0.088, sq: 2.15 },
  { y: 1.37, rx: 0.152, rf: 0.08, rb: 0.082, sq: 2.3 },
  { y: 1.405, rx: 0.14, rf: 0.068, rb: 0.074, sq: 2.25 },
  { y: 1.44, rx: 0.098, rf: 0.058, rb: 0.064, sq: 2.1 },
  { y: 1.475, rx: 0.057, rf: 0.051, rb: 0.053, cz: -0.006 },
];
// arms: a round deltoid cap, a solid upper arm, the forearm's belly, a firm wrist (cartoon-chunky forearms)
const ARM_ROWS: Row[] = [
  { y: 0.04, rx: 0.014, rf: 0.016, rb: 0.016 },
  { y: 0.03, rx: 0.027, rf: 0.03, rb: 0.03 },
  { y: 0.014, rx: 0.036, rf: 0.039, rb: 0.039 },
  { y: -0.01, rx: 0.041, rf: 0.043, rb: 0.043 },
  { y: -0.055, rx: 0.041, rf: 0.042, rb: 0.042 },
  { y: -0.12, rx: 0.038, rf: 0.04, rb: 0.038 },
  { y: -0.255, rx: 0.031, rf: 0.031, rb: 0.034 },
  { y: -0.3, rx: 0.031, rf: 0.03, rb: 0.036 },
  { y: -0.345, rx: 0.036, rf: 0.038, rb: 0.034 },
  { y: -0.42, rx: 0.03, rf: 0.032, rb: 0.028 },
  { y: -0.485, rx: 0.02, rf: 0.026, rb: 0.024 },
  { y: -0.535, rx: 0.019, rf: 0.026, rb: 0.024 },
];
const LEG_ROWS: Row[] = [
  { y: 0.055, rx: 0.058, rf: 0.06, rb: 0.064 },
  { y: -0.01, rx: 0.074, rf: 0.075, rb: 0.08 },
  { y: -0.1, rx: 0.069, rf: 0.071, rb: 0.072 },
  { y: -0.22, rx: 0.059, rf: 0.061, rb: 0.059 },
  { y: -0.34, rx: 0.048, rf: 0.051, rb: 0.048 },
  { y: -0.405, rx: 0.044, rf: 0.048, rb: 0.043 },
  { y: -0.445, rx: 0.044, rf: 0.049, rb: 0.042 },
  { y: -0.49, rx: 0.041, rf: 0.043, rb: 0.047 },
  { y: -0.57, rx: 0.043, rf: 0.04, rb: 0.055 },
  { y: -0.67, rx: 0.036, rf: 0.035, rb: 0.042 },
  { y: -0.77, rx: 0.026, rf: 0.028, rb: 0.029 },
  { y: -0.83, rx: 0.024, rf: 0.027, rb: 0.026 },
  { y: -0.865, rx: 0.026, rf: 0.031, rb: 0.03 },
];

/** garment geometry derived from a look (reference units) */
export interface Shape {
  waist: number; topHem: number; topThick: number; tuck: boolean;
  sleeveY: number; armThick: number; outerSleeve: boolean;
  outer: OuterKind; outerHem: number; outerThick: number; open: boolean;
  legKind: LegKind; legHem: number; legThick: number; flare: number;
  bootTop: number; bootThick: number; feet: FeetKind; collar: 'roll' | 'camp' | 'crew' | 'shirt' | 'none';
}

export function shapeOf(L: Look): Shape {
  const T = L.top, O = L.outer, G = L.legs;
  const topThick = T.kind === 'sweater' ? 0.01 : T.kind === 'flannel' ? 0.005 : T.kind === 'thermal' ? 0.004 : 0.003;
  const outerSleeve = O.kind !== 'none' && O.sleeve === 'long';
  const sleeve = outerSleeve ? 'long' : T.sleeve;
  const sleeveY = sleeve === 'long' ? -0.515 : sleeve === 'rolled' ? -0.33 : -0.15;
  const legThick = G.kind === 'snowpants' ? 0.02 : G.kind === 'shorts' ? 0.012 : G.kind === 'skirt' ? 0.0015 : G.kind === 'overalls' ? 0.013 : 0.011;
  const f = L.feet.kind;
  return {
    waist: 1.0, topHem: T.hem, topThick, tuck: T.kind === 'sunshirt' || T.kind === 'flannel' || T.kind === 'henley' || T.kind === 'thermal',
    sleeveY, armThick: topThick + (outerSleeve ? O.thick * (O.kind === 'parka' ? 0.75 : 1) : 0), outerSleeve,
    outer: O.kind, outerHem: O.hem, outerThick: O.thick, open: O.open,
    legKind: G.kind, legHem: G.kind === 'skirt' ? -0.95 : G.hem, legThick, flare: G.kind === 'snowpants' ? 0.014 : G.kind === 'pants' || G.kind === 'overalls' ? 0.01 : 0,
    bootTop: f === 'rubber' ? -0.5 : f === 'snow' ? -0.64 : f === 'boot' ? -0.74 : -9, bootThick: f === 'rubber' ? 0.012 : f === 'snow' ? 0.022 : 0.006,
    feet: f,
    collar: T.kind === 'sweater' ? 'roll' : T.kind === 'hawaiian' ? 'camp' : T.kind === 'flannel' || T.kind === 'blouse' ? 'shirt' : T.kind === 'henley' ? 'crew' : 'crew',
  };
}

export interface BodyBuild {
  geometry: THREE.BufferGeometry;
  head: HeadShape;
  shape: Shape;
  /** sole thickness (m) — feet stand this far above the bone ground line */
  sole: number;
}

// ------------------------------------------------------------------ main build
export function buildBody(L: Look, d: Dims): BodyBuild {
  const B = new Loft(true);
  const sh = shapeOf(L);
  const s = d.s, b = L.build, fem = b.fem, mass = b.mass, bw = b.bw;
  const Rs = d.rest;
  const ty = d.ty;

  // ---------------- torso
  const thick = (y: number) => {
    let t = 0;
    if (y <= sh.waist + (sh.legKind === 'overalls' ? 0.36 : 0) && (sh.tuck || y < sh.topHem || sh.legKind === 'overalls')) t += sh.legThick * 0.8;
    if (y >= sh.topHem) t += sh.topThick;
    if (sh.tuck && y <= sh.waist + 0.005 && y > sh.waist - 0.07) t += 0.004;
    if (sh.legKind === 'skirt' && y <= sh.waist + 0.01) t += 0.006;
    return t;
  };
  const coat = sh.outer !== 'none' ? 0.5 : 0.85;
  const bump = (th: number, y: number) => {
    let k = 0;
    const chest = gauss(y, 1.255, 0.05);
    if (chest > 0.01) k += chest * gauss(Math.abs(angd(th, 0)), 0.48, 0.36) * (fem * 0.2 + (1 - fem) * (0.05 + 0.06 * b.chest) * mass) * coat;
    k -= gauss(y, 1.185, 0.02) * gauss(Math.abs(th), 0.48, 0.35) * fem * 0.05 * coat;
    k += gauss(y, 0.915, 0.05) * gauss(Math.abs(angd(th, Math.PI)), 0.45, 0.4) * (0.05 + fem * 0.06);
    k += gauss(y, 1.31, 0.05) * gauss(Math.abs(angd(th, Math.PI)), 0.6, 0.3) * 0.035 * coat;
    k -= gauss(y, 1.15, 0.2) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.14) * 0.03 * coat;
    // the belly: round and forward, sitting over the belt
    k += gauss(y, 1.05, 0.075) * gauss(th, 0, 0.9) * (b.belly * 0.34 + Math.max(0, mass - 1) * 0.3);
    // barrel chest
    k += gauss(y, 1.27, 0.09) * gauss(Math.abs(th), 0.3, 0.9) * b.chest * 0.07;
    // cloth folds: blousing at a tuck, ripples at a loose hem, folds from the armpits
    const fold = (a: number) => Math.sin(th * 7 + a) * 0.6 + Math.sin(th * 11 + a * 2.3) * 0.4;
    if (sh.tuck) k += gauss(y, sh.waist + 0.035, 0.022) * (0.018 + 0.012 * fold(1.7));
    else k += gauss(y, sh.topHem + 0.035, 0.03) * 0.012 * fold(0.4);
    k += gauss(y, 1.2, 0.05) * gauss(Math.abs(th), 1.25, 0.3) * 0.016 * fold(2.9);
    if (L.top.kind === 'sweater') k += Math.sin(th * 40) * 0.004 * gauss(y, 0.89, 0.025); // ribbed hem
    return k;
  };
  const femX = (y: number) => 1 + fem * (-0.14 * gauss(y, 1.1, 0.07) - 0.08 * gauss(y, 1.33, 0.08) + 0.11 * gauss(y, 0.93, 0.05) + 0.05 * gauss(y, 0.86, 0.04));
  const bellyW = (y: number, th: number) => gauss(y, 1.05, 0.08) * gauss(th, 0, 0.9) * Math.min(1, b.belly + Math.max(0, mass - 1)) * 0.85;
  const wOf = (y: number, th = 0): Wt => {
    let w: Wt;
    if (y < 0.98) w = [BI.hips, 1];
    else if (y < 1.03) { const t = (y - 0.98) / 0.05; w = [BI.hips, 1 - t, BI.spine, t]; }
    else if (y < 1.13) w = [BI.spine, 1];
    else if (y < 1.22) { const t = (y - 1.13) / 0.09; w = [BI.spine, 1 - t, BI.chest, t]; }
    else if (y < 1.47) w = [BI.chest, 1];
    else w = [BI.chest, 0.6, BI.neck, 0.4];
    const bk = bellyW(y, th);
    if (bk > 0.02) { w = w.map((v, i) => (i & 1 ? v * (1 - bk) : v)); w.push(BI.belly, bk); }
    return w;
  };
  const hunchZ = (y: number) => -b.hunch * 0.05 * clamp01((y - 1.1) / 0.35) ** 2;
  const torsoSurf = (y: number, deg: number, off: number): V3 => {
    const r = sampleRows(TORSO_ROWS, y);
    const t = thick(y) + off, fx = femX(y);
    const th = (deg * Math.PI) / 180;
    return superPt(th, 0, ((r.cz ?? 0) + hunchZ(y)) * s, (r.rx * bw * fx + t) * s, (r.rf * mass + t) * s, (r.rb * mass + t) * s, r.sq ?? 2.2, 1, 1 + bump(th, y), ty(y));
  };
  {
    const breaks: number[] = [sh.topHem];
    if (sh.legKind !== 'skirt' && (sh.tuck || sh.topHem > sh.waist)) breaks.push(sh.waist);
    const ys = ringYs(TORSO_ROWS, breaks, [0.96, 1.04, 1.12, 1.2, 1.29]);
    const n = 20;
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(TORSO_ROWS, y);
      const t = thick(y + eps * 0.003);
      const fx = femX(y);
      const pts = ellRing(ty(y), 0, ((r.cz ?? 0) + hunchZ(y)) * s, (r.rx * bw * fx + t) * s, (r.rf * mass + t) * s, (r.rb * mass + t) * s, n, r.sq ?? 2.2, 1, (th) => bump(th, y));
      return { pts, v: vOf(VMAP.TORSO, y), w: (p: V3, j: number) => wOf(y, -Math.PI + (Math.PI * 2 * j) / n) };
    });
    B.loft(rings, usFor(n), R('TORSO'), 1, { start: [0, ty(0.8), -0.005 * s], end: [0, ty(1.5), -0.006 * s], startW: [BI.hips, 1], endW: [BI.chest, 0.5, BI.neck, 0.5], alt: true });
  }

  // ---------------- outer garment shell (cardigan, vest, slicker, parka, raincoat)
  if (sh.outer !== 'none') buildOuter(B, L, d, sh, torsoSurf, wOf);

  // ---------------- neck
  {
    const nr = 0.052 * (0.8 + 0.2 * mass) * (1 - fem * 0.14) * (L.arch === 'captainGaff' ? 1.25 : 1);
    const ys = [1.44, 1.48, 1.52, 1.56, 1.6, 1.625];
    const n = 12;
    const hy = Rs.head[1];
    const rings = ys.map((y) => {
      const yy = Rs.neck[1] + (y - 1.48) * s * b.neckLen;
      const r = nr * (y < 1.47 ? 1.18 : y > 1.58 ? 0.97 : 1);
      const neckK = (th: number) => gauss(y, 1.52, 0.015) * gauss(th, 0, 0.3) * 0.14 * (1 - fem)
        + gauss(Math.abs(th), 0.75 - (y - 1.45) * 4, 0.22) * 0.07 * (1 - fem * 0.5)
        + gauss(Math.abs(angd(th, Math.PI)), 0.55, 0.3) * gauss(y, 1.47, 0.03) * 0.12;
      return {
        pts: ellRing(yy, 0, (-0.008 + hunchZ(1.45)) * s, r * s, r * 1.04 * s, r * 1.02 * s, n, 2.1, 1, neckK), v: vOf(VMAP.NECK, y),
        w: (yy < hy - 0.02 ? [BI.chest, y < 1.47 ? 0.7 : 0.15, BI.neck, y < 1.47 ? 0.3 : 0.85] : [BI.neck, 0.4, BI.head, 0.6]) as Wt,
      };
    });
    B.loft(rings, usFor(n), R('NECK'), 2, { alt: true });
    buildCollar(B, L, d, sh, nr);
  }

  // ---------------- arms + hands
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    const U = BI[('uarm' + side) as BoneName], Fm = BI[('farm' + side) as BoneName], Hn = BI[('hand' + side) as BoneName];
    const ua = Rs[('uarm' + side) as BoneName];
    const al = b.armLen;
    const breaks: number[] = [];
    if (sh.sleeveY < 1) breaks.push(sh.sleeveY);
    const hasGlove = L.hands.kind !== 'bare';
    if (hasGlove) breaks.push(-0.47);
    const harpoon = side === 'L' && !!L.extras.harpoon;
    let ys = ringYs(ARM_ROWS, breaks, sh.sleeveY < -0.3 ? [-0.235, -0.285, -0.32, -0.455, -0.478] : [sh.sleeveY + 0.03]);
    if (harpoon) ys = ys.filter((r) => r.y > -0.44);
    const fm = (1 - fem * 0.12) * (0.66 + 0.34 * mass) * (L.arch === 'captainGaff' ? 1.15 : 1) * 1.2;
    const wOfA = (y: number): Wt => {
      if (y > 0.025) return [U, 0.65, BI.chest, 0.35];
      if (y > -0.25) return [U, 1];
      if (y > -0.33) { const t = (y + 0.25) / -0.08; return [U, 1 - t, Fm, t]; }
      if (y > -0.5 || harpoon) return [Fm, 1];
      const t = clamp01((y + 0.5) / -0.04); return [Fm, 1 - t * 0.5, Hn, t * 0.5];
    };
    const tOf = (yy: number) => {
      let t = 0;
      if (yy > sh.sleeveY) t += sh.armThick * (1 - clamp01((yy - 0.0) / 0.045) * 0.7);
      if (hasGlove && yy < -0.47) t += L.hands.kind === 'mitten' ? 0.008 : 0.004;
      return t;
    };
    const armBump = (th: number, y: number, t: number) => {
      const cloth = t > 0.003 && y > sh.sleeveY;
      let bb = (gauss(y, -0.03, 0.04) * gauss(Math.abs(th), 1.4, 0.7) * 0.07 + gauss(y, -0.13, 0.05) * gauss(th, 0.1, 0.6) * 0.06
        - gauss(y, -0.28, 0.03) * gauss(th, 0, 0.5) * 0.04 + gauss(y, -0.35, 0.04) * gauss(th, 0.6, 0.6) * 0.05) * (cloth ? 0.3 : 1);
      if (cloth) {
        const f = Math.sin(th * 3 + y * 90) * 0.6 + Math.sin(th * 5 - y * 140) * 0.4;
        bb += gauss(y, -0.29, 0.035) * gauss(th, 0, 0.9) * 0.09 * (0.6 + 0.4 * f);
        if (sh.sleeveY < -0.45) bb += gauss(y, -0.475, 0.02) * 0.06 * (0.5 + 0.5 * f);
        if (sh.sleeveY > -0.2) bb += gauss(y, sh.sleeveY + 0.025, 0.02) * 0.08 * (0.6 + 0.4 * f);
        if (sh.outer === 'parka' && sh.outerSleeve) bb += Math.max(0, Math.sin(y * 70)) * 0.06; // quilted
      }
      if (hasGlove && y < -0.47 && L.hands.kind === 'mitten') bb += gauss(y, -0.475, 0.008) * 0.12;
      return bb;
    };
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(ARM_ROWS, y);
      const yy = y + eps * 0.0005;
      const t = tOf(yy);
      const pts = ellRing(ua[1] + y * al * s, 0, ua[2], (r.rx * fm + t) * s, (r.rf * fm + t) * s, (r.rb * fm + t) * s, 10, 2, k, (th) => armBump(th, y, t));
      for (const p of pts) p[0] += ua[0];
      return { pts, v: vOf(VMAP.ARM, y), w: wOfA(y) };
    });
    B.loft(rings, usFor(10), R(('ARM_' + side) as RegKey), 10 + (k > 0 ? 0 : 1), {
      start: [ua[0] - k * 0.022 * s, ua[1] + 0.046 * s, ua[2]], startW: [U, 0.6, BI.chest, 0.4], alt: true,
      ...(harpoon ? { end: [ua[0], ua[1] - 0.45 * al * s, ua[2]], endW: [Fm, 1] as Wt } : {}),
    });
    if (!harpoon) buildHand(B, L, d, side, k);
  }

  // ---------------- legs + feet
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    const T = BI[('thigh' + side) as BoneName], S = BI[('shin' + side) as BoneName], Ft = BI[('foot' + side) as BoneName];
    const thp = Rs[('thigh' + side) as BoneName];
    const ll = b.legLen;
    const breaks: number[] = [];
    const covered = (yy: number) => sh.legKind !== 'skirt' && yy > sh.legHem;
    if (sh.legKind !== 'skirt' && sh.legHem > -0.86) breaks.push(sh.legHem);
    if (sh.bootTop > -0.86) breaks.push(sh.bootTop);
    if (sh.feet === 'sandal' || sh.feet === 'sneaker' || sh.feet === 'shoe') breaks.push(-0.74); // sock top
    const ys = ringYs(LEG_ROWS, breaks, sh.legKind !== 'shorts' ? [-0.72, -0.795] : []);
    const fm = (0.7 + 0.3 * mass) * (L.arch === 'kid' ? 1.08 : 1) * 1.12;
    const femLeg = (y: number) => 1 + fem * (0.09 * gauss(y, -0.08, 0.12) - 0.05 * gauss(y, -0.6, 0.1));
    const legBump = (thx: number, y: number, cov: boolean) => {
      let bb = gauss(y, -0.445, 0.025) * gauss(thx, 0, 0.5) * (cov ? 0.04 : 0.12);
      if (cov && sh.legKind !== 'shorts') {
        const f = Math.sin(thx * 3 + y * 70) * 0.6 + Math.sin(thx * 5 - y * 120) * 0.4;
        bb += gauss(y, -0.46, 0.03) * gauss(Math.abs(angd(thx, Math.PI)), 0, 0.9) * 0.08 * (0.6 + 0.4 * f);
        if (sh.bootTop < -0.8) bb += gauss(y, sh.legHem + 0.05, 0.035) * 0.07 * (0.55 + 0.45 * f);
        else bb += gauss(y, sh.bootTop + 0.04, 0.03) * 0.09 * (0.55 + 0.45 * f);   // trousers bunching over the boot top
        bb += gauss(y, -0.12, 0.05) * gauss(Math.abs(thx), 0.5, 0.4) * 0.03 * f;
        if (sh.legKind === 'snowpants') bb += Math.max(0, Math.sin(y * 60 + thx)) * 0.03;
      } else if (cov) {
        // cargo shorts: side pockets bulge
        bb += gauss(y, -0.12, 0.05) * gauss(Math.abs(thx - Math.PI / 2 * k * 0 - Math.PI / 2), 0, 0.35) * 0.08;
      } else bb -= gauss(y, -0.47, 0.02) * gauss(Math.abs(angd(thx, Math.PI)), 0, 0.5) * 0.05;
      if (y < sh.bootTop && sh.feet === 'rubber') bb += gauss(y, sh.bootTop - 0.01, 0.012) * 0.08; // rolled rim
      if (y < sh.bootTop && sh.feet === 'snow') bb += gauss(y, sh.bootTop - 0.02, 0.02) * 0.18;     // fur cuff
      return bb;
    };
    const wOfL = (y: number): Wt => {
      if (y > 0.02) return [BI.hips, 0.5, T, 0.5];
      if (y > -0.05) { const t = (0.02 - y) / 0.07; return [BI.hips, 0.5 - t * 0.4, T, 0.5 + t * 0.4]; }
      if (y > -0.39) return [BI.hips, y > -0.12 ? 0.1 * (1 - (-0.05 - y) / 0.07) : 0, T, 1];
      if (y > -0.48) { const t = (y + 0.39) / -0.09; return [T, 1 - t, S, t]; }
      if (y > -0.8) return [S, 1];
      const t = clamp01((y + 0.8) / -0.06); return [S, 1 - t * 0.6, Ft, t * 0.6];
    };
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(LEG_ROWS, y);
      const yy = y + eps * 0.0005;
      let t = 0, flare = 0;
      const cov = covered(yy);
      if (cov) {
        t += sh.legThick;
        if (sh.legKind !== 'shorts') flare = Math.max(0, (-0.43 - y) / 0.42) * (0.012 + sh.flare);
        // trousers stuffed into boots bunch over the rim (the step faces down, into shadow)
        if (yy > sh.bootTop && yy < sh.bootTop + 0.06) t += 0.012 * (1 - (yy - sh.bootTop) / 0.06);
      }
      if (yy < sh.bootTop) { t += sh.bootThick + (cov ? 0 : 0.004); flare *= 0.3; }
      else if ((sh.feet === 'sandal' || sh.feet === 'sneaker' || sh.feet === 'shoe') && yy < -0.74 && !cov) t += 0.003;
      if (sh.feet === 'sandal' && yy < -0.74) t += 0.002;
      const fl = femLeg(y);
      const pts = ellRing(thp[1] + y * ll * s, 0, thp[2], (r.rx * fm * fl + t + flare) * s, (r.rf * fm * fl + t + flare) * s, (r.rb * fm * fl + t + flare * 0.6) * s, 10, 2, k, (thx) => legBump(thx, y, cov));
      for (const p of pts) p[0] += thp[0];
      return { pts, v: vOf(VMAP.LEG, y), w: wOfL(y) };
    });
    B.loft(rings, usFor(10), R(('LEG_' + side) as RegKey), 20 + (k > 0 ? 0 : 1),
      { start: [thp[0], thp[1] + 0.07 * s, thp[2]], end: [thp[0], thp[1] - 0.875 * ll * s, thp[2] + 0.004], startW: [BI.hips, 0.6, T, 0.4], endW: [Ft, 1], alt: true });
    buildFoot(B, L, d, side, k, sh);
  }

  // ---------------- skirt / coat tails (double sided, swing with the thighs)
  if (sh.legKind === 'skirt') buildTails(B, L, d, 1.0, 0.94 + (L.legs.hem + 0.02) * b.legLen, 0.012 + sh.legThick, true, false);
  if (sh.outer !== 'none' && sh.outerHem < 0.85) buildTails(B, L, d, 0.9, sh.outerHem, sh.outerThick + sh.topThick + 0.012, false, sh.outer === 'raincoat' || sh.open);

  // ---------------- head, face, hair
  const head = headShape(L, d);
  buildHead(B, head);

  const geometry = B.build();
  // face flush mask: skull + nose + ears (anger reddens the face, not the clothes)
  {
    const nv = B.count, fl = new Float32Array(nv), hp = Rs.head, hs = d.hs;
    for (let i = 0; i < nv; i++) {
      const g = B.G[i];
      const x = (B.P[i * 3] - hp[0]) / hs, y = (B.P[i * 3 + 1] - hp[1]) / hs, z = (B.P[i * 3 + 2] - hp[2]) / hs;
      const near = Math.hypot(x, y - 0.08, z) < 0.16;
      if ((g === 70 || g === 80 || (g === -1 && near)) && y > -0.03) fl[i] = clamp01((z + 0.06) / 0.1) * clamp01((0.17 - y) / 0.04);
    }
    geometry.setAttribute('aFlush', new THREE.BufferAttribute(fl, 1));
  }
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, d.hipY, 0), 1.6 * s);
  const sole = sh.feet === 'rubber' || sh.feet === 'boot' ? 0.03 : sh.feet === 'snow' ? 0.04 : sh.feet === 'sandal' ? 0.02 : 0.022;
  return { geometry, head, shape: sh, sole: sole * s };
}

// ------------------------------------------------------------------ outer garments
function buildOuter(B: Loft, L: Look, d: Dims, sh: Shape, torsoSurf: (y: number, deg: number, off: number) => V3, wOf: (y: number, th?: number) => Wt) {
  const top = 1.46, hem = Math.max(0.84, sh.outerHem);
  const kind = sh.outer;
  const t0 = sh.outerThick;
  const n = 28;
  const ys: number[] = [];
  const nr = Math.max(6, Math.round((top - hem) / 0.035));
  for (let i = 0; i <= nr; i++) ys.push(top - ((top - hem) * i) / nr);
  // the open front: a gap at deg ~0 (V-neck for cardigans, a narrow slot for slickers)
  const gap = (y: number) => {
    if (!sh.open) return 0;
    if (kind === 'cardigan') return 9 + 30 * clamp01((y - 1.0) / 0.42) ** 1.3;
    return 5 + 12 * clamp01((y - 1.3) / 0.16);
  };
  const quilt = kind === 'parka';
  const offAt = (y: number, deg: number) => {
    let o = t0 * (kind === 'vest' ? 0.7 : 1);
    if (quilt) o += Math.max(0, Math.sin(((y - hem) / 0.075) * Math.PI)) * 0.012 - 0.004;
    if (kind === 'raincoat' || kind === 'slicker') o += Math.sin(deg * 0.11 + y * 30) * 0.0025;
    // the coat hangs off the belly and chest instead of clinging under them
    if (y < 1.05) o += 0.006 * clamp01((1.05 - y) / 0.12);
    void deg;
    return o;
  };
  // columns: the left half runs from the back seam to the left edge of the front gap, the right half from the
  // right edge round to the back again; the quad between the halves (the gap) is skipped
  const h = n / 2;
  const colAt = (j: number, gp: number) => (j <= h ? -180 + (180 - gp) * (j / h) : gp + (180 - gp) * ((j - h - 1) / h));
  const rings = ys.map((y) => {
    const gp = gap(y);
    const pts: V3[] = [];
    for (let j = 0; j <= n + 1; j++) { const deg = colAt(j, gp); pts.push(torsoSurf(y, deg, offAt(y, deg))); }
    return { pts, v: vOf(VMAP.TORSO, y), w: (_p: V3, j: number) => wOf(y, (colAt(j, gp) * Math.PI) / 180) };
  });
  // u follows the angle at the hem so the painter can place buttons and pockets by angle
  const gp0 = gap(hem);
  const us = Array.from({ length: n + 2 }, (_, j) => 0.5 + colAt(j, gp0) / 360);
  const skip = (j: number) => j === h;
  B.loft(rings, us, R('OUTER'), 5, { skip, alt: true });
  // the lining: the same surface facing inward (darker), seen through the open front and under the hem
  B.loft(rings.map((r) => ({ ...r, c: 0.5 })), us, R('OUTER'), 6, { skip, flip: true });
  // parka / slicker hood bunched behind the neck
  if (kind === 'parka' || kind === 'slicker' || kind === 'raincoat') {
    const s = d.s;
    const hy = [1.42, 1.47, 1.52, 1.555];
    const hr = kind === 'parka' ? [0.075, 0.092, 0.082, 0.045] : kind === 'raincoat' ? [0.07, 0.07, 0.068, 0.064] : [0.066, 0.078, 0.07, 0.038];
    const zc = kind === 'raincoat' ? -0.004 : -0.07;
    const rr = hy.map((y, i) => {
      const yy = d.ty(y);
      const rx = (kind === 'raincoat' ? hr[i] * 1.18 : hr[i] * 1.55) * s * L.build.bw;
      return {
        pts: ellRing(yy, 0, zc * s, rx, (kind === 'raincoat' ? hr[i] * 1.0 : hr[i] * 0.62) * s, hr[i] * s, 14, 2.2, 1, (th) => (kind === 'parka' ? Math.sin(th * 9) * 0.05 * (i > 0 ? 1 : 0) : 0)),
        v: i / 3, w: (i < 2 ? [BI.chest, 1] : [BI.chest, 0.7, BI.neck, 0.3]) as Wt,
      };
    });
    const reg = R('COLLAR');
    if (kind === 'raincoat') {
      // a tall stand-up collar open at the front
      B.loft(rr, usFor(14), reg, 7, { skip: (j) => j === 6 || j === 7 });
      B.loft(rr.map((r) => ({ ...r, c: 0.5 })), usFor(14), reg, 8, { skip: (j) => j === 6 || j === 7, flip: true });
    } else B.loft(rr, usFor(14), reg, 7, { end: [0, d.ty(1.565), zc * s] });
  }
}

function buildCollar(B: Loft, L: Look, d: Dims, sh: Shape, nr: number) {
  const s = d.s;
  const reg = R('COLLAR');
  const ny = (y: number) => d.rest.neck[1] + (y - 1.48) * s * L.build.neckLen;
  if (sh.collar === 'roll') {
    // a thick rolled sweater neck
    const ys = [1.44, 1.47, 1.505, 1.53];
    const rr = ys.map((y, i) => ({ pts: ellRing(ny(y), 0, -0.008 * s, (nr + [0.018, 0.024, 0.022, 0.012][i]) * s, (nr + [0.02, 0.026, 0.024, 0.012][i]) * s, (nr + [0.018, 0.022, 0.02, 0.012][i]) * s, 14, 2.1, 1, (th) => Math.sin(th * 28) * 0.03), v: i / 3, w: (i < 2 ? [BI.chest, 0.8, BI.neck, 0.2] : [BI.chest, 0.3, BI.neck, 0.7]) as Wt }));
    B.loft(rr, usFor(14), subR(reg, 0, 0, 1, 0.5), 3, {});
  } else if (sh.collar === 'shirt' || sh.collar === 'camp') {
    // folded collar: a flared ring open at the front (camp collars lie wide and flat)
    const camp = sh.collar === 'camp';
    const cr = nr + 0.012 + (camp ? 0.006 : 0);
    const cy0 = 1.46, cy1 = camp ? 1.5 : 1.53;
    const rr = [
      { pts: ellRing(ny(cy0), 0, -0.012 * s, (cr + (camp ? 0.03 : 0.014)) * s, (cr + (camp ? 0.03 : 0.022)) * s, (cr + 0.008) * s, 12, 2, 1), v: 0.0, w: [BI.chest, 1] as Wt },
      { pts: ellRing(ny(cy1), 0, -0.014 * s, (cr + 0.004) * s, (cr + 0.008) * s, (cr + 0.004) * s, 12, 2, 1), v: 1.0, w: [BI.chest, 0.6, BI.neck, 0.4] as Wt },
    ];
    const sk = (j: number) => j === 5 || j === 6;
    B.loft(rr, usFor(12), subR(reg, 0, 0.5, 1, 1), 3, { skip: sk });
    B.loft(rr.map((r) => ({ ...r, c: 0.65 })), usFor(12), subR(reg, 0, 0.5, 1, 1), 4, { skip: sk, flip: true });
  } else if (sh.collar === 'crew') {
    const rr = [1.445, 1.465].map((y, i) => ({ pts: ellRing(ny(y), 0, -0.008 * s, (nr + 0.012 - i * 0.004) * s, (nr + 0.014 - i * 0.004) * s, (nr + 0.012 - i * 0.004) * s, 12, 2.1, 1), v: i, w: [BI.chest, 0.8, BI.neck, 0.2] as Wt }));
    B.loft(rr, usFor(12), subR(reg, 0, 0, 1, 0.25), 3, {});
  }
  // scarf (ice fisher)
  if (L.extras.scarf) {
    const ry = [1.42, 1.46, 1.51, 1.56];
    const rr = ry.map((y, i) => ({ pts: ellRing(ny(y), 0, -0.004 * s, (nr + 0.034 + (i === 1 ? 0.008 : 0)) * s, (nr + 0.04) * s, (nr + 0.032) * s, 14, 2.3, 1, (th) => Math.sin(th * 5 + i) * 0.04), v: i / 3, w: [BI.neck, i < 1 ? 0.4 : 1, BI.chest, i < 1 ? 0.6 : 0] as Wt }));
    B.loft(rr, usFor(14), subR(R('EXTRA'), 0, 0.7, 0.5, 1), 9, {});
    // hanging tail
    B.box([0.05 * s, ny(1.33), (nr + 0.08) * s * L.build.mass], [0.07 * s, 0.22 * s, 0.02 * s], subR(R('EXTRA'), 0.5, 0.7, 0.62, 1), [BI.chest, 1], new THREE.Matrix4().makeRotationZ(0.1).multiply(new THREE.Matrix4().makeRotationX(0.25)));
  }
}

function buildTails(B: Loft, L: Look, d: Dims, top: number, bot: number, tk: number, skirt: boolean, open: boolean) {
  const s = d.s, b = L.build;
  const n = 20;
  const nr = Math.max(3, Math.round((top - bot) / 0.08));
  const splitY = 0.82;
  const ys = Array.from({ length: nr + 1 }, (_, i) => top - ((top - bot) * i) / nr).filter((y, i) => i === 0 || i === nr || Math.abs(y - splitY) > 0.015);
  if (splitY < top - 0.015 && splitY > bot + 0.015) { ys.push(splitY); ys.sort((p, q) => q - p); }
  const rTop = sampleRows(TORSO_ROWS, top);
  const belly = b.belly * 0.05 + Math.max(0, b.mass - 1) * 0.04;
  const rings = ys.map((y) => {
    const f = (top - y) / (top - bot);
    const hip = sampleRows(TORSO_ROWS, Math.max(0.86, y));
    const flareK = skirt ? 0.07 : 0.06;
    const rx = (Math.max(rTop.rx, hip.rx) * b.bw * (1 + b.fem * 0.08) + tk + f * flareK) * s;
    const rf = (Math.max(rTop.rf, 0.09) * b.mass + tk + belly * (1 - f) + f * (skirt ? 0.05 : 0.05)) * s;
    const rb = (Math.max(rTop.rb, 0.108) * b.mass + tk + f * (skirt ? 0.06 : 0.05)) * s;
    const ww = (p: V3): Wt => {
      const kk = Math.min(0.85, f * 0.9 + 0.05);
      const l = clamp01(0.5 + (p[0] / (rx * 0.9)) * 0.5);
      return [BI.hips, 1 - kk, BI.thighL, kk * l, BI.thighR, kk * (1 - l)];
    };
    const pleat = (th: number) => (Math.sin(th * (skirt ? 9 : 6) + 0.4) * 0.6 + Math.sin(th * 4 + 1.9) * 0.4) * (skirt ? 0.05 : 0.035) * f;
    return { pts: ellRing(d.ty(y), 0, 0, rx, rf, rb, n, 2.2, 1, pleat), v: vOf(VMAP.TAILS, y), w: ww };
  });
  // coats split at the front from the hem up; the split columns are skipped
  const skipF = open ? (j: number) => (j === n / 2 - 1 || j === n / 2) : undefined;
  const ringsA = rings.map((r, i) => ({ ...r, i }));
  const reg = R('TAILS');
  const tailsTop = ringsA.filter((_, i) => ys[i] >= splitY);
  const tailsBot = ringsA.filter((_, i) => ys[i] <= splitY + 1e-6);
  if (tailsTop.length > 1) { B.loft(tailsTop, usFor(n), reg, 30, { alt: true }); B.loft(tailsTop.map((r) => ({ ...r, c: 0.55 })), usFor(n), reg, 31, { flip: true }); }
  if (tailsBot.length > 1) { B.loft(tailsBot, usFor(n), reg, 30, { skip: skipF, alt: true }); B.loft(tailsBot.map((r) => ({ ...r, c: 0.55 })), usFor(n), reg, 31, { skip: skipF, flip: true }); }
}

// ------------------------------------------------------------------ hands
function buildHand(B: Loft, L: Look, d: Dims, side: 'L' | 'R', k: number) {
  const H = BI[('hand' + side) as BoneName], F1 = BI[('fing1' + side) as BoneName], F2 = BI[('fing2' + side) as BoneName], TH = BI[('thumb' + side) as BoneName];
  const Fm = BI[('farm' + side) as BoneName];
  const hp = d.rest[('hand' + side) as BoneName];
  const reg = R(('HAND_' + side) as RegKey);
  const kind = L.hands.kind;
  const gl = kind === 'glove' ? 0.004 : kind === 'mitten' ? 0.009 : 0;
  const hs = d.s * L.build.handS * (1 - L.build.fem * 0.08) * (0.9 + 0.1 * L.build.mass);
  const tr = (p: V3): V3 => [hp[0] + p[0], hp[1] + p[1], hp[2] + p[2]];
  const prow = [
    { y: 0.004, rx: 0.019, rf: 0.028, rb: 0.026, v: 1, w: [Fm, 0.4, H, 0.6] },
    { y: -0.026, rx: 0.022, rf: 0.043, rb: 0.038, v: 0.82, w: [H, 1] },
    { y: -0.06, rx: 0.02, rf: 0.047, rb: 0.043, v: 0.66, w: [H, 1] },
    { y: -0.084, rx: 0.02, rf: 0.048, rb: 0.044, v: 0.56, w: [H, 0.65, F1, 0.35] },
  ];
  const knuckle = (th: number) => Math.max(0, Math.sin(th)) * 0.05;
  const rings = prow.map((r, ri) => ({ pts: ellRing(r.y * hs, 0, 0.002, (r.rx + gl) * hs, (r.rf + gl) * hs, (r.rb + gl) * hs, 6, 2.6, k, ri === 3 ? knuckle : undefined, -Math.PI + Math.PI / 6).map(tr), v: r.v, w: r.w as Wt }));
  B.loft(rings, usFor(6), reg, 40 + (k > 0 ? 0 : 1), { end: kind === 'mitten' ? null : tr([0, -0.092 * hs, 0.002]), endW: [H, 0.6, F1, 0.4], alt: true });
  if (kind === 'mitten') {
    // the mitten paddle: all four fingers in one rounded pouch that still curls
    const z = 0.001 * hs;
    const ring = (y: number, rx: number, rz: number) => ellRing(y, 0, z, rx, rz, rz, 8, 2.4, k, undefined, -Math.PI).map(tr);
    const rr = [
      { pts: ring(-0.084 * hs, (0.02 + gl) * hs, (0.046 + gl) * hs), v: 0.55, w: [H, 0.6, F1, 0.4] as Wt },
      { pts: ring(-0.115 * hs, (0.021 + gl) * hs, (0.047 + gl) * hs), v: 0.35, w: [F1, 0.8, F2, 0.2] as Wt },
      { pts: ring(-0.145 * hs, (0.019 + gl) * hs, (0.042 + gl) * hs), v: 0.18, w: [F2, 1] as Wt },
      { pts: ring(-0.165 * hs, (0.014 + gl) * hs, (0.03 + gl) * hs), v: 0.06, w: [F2, 1] as Wt },
    ];
    B.loft(rr, usFor(8), reg, 42 + (k > 0 ? 0 : 1), { end: tr([0, -0.172 * hs, z]), endW: [F2, 1], endV: 0 });
  } else {
    const fz = [0.03, 0.0102, -0.0098, -0.0285], fl = [0.077, 0.085, 0.08, 0.064], fr = [0.0108, 0.0114, 0.0107, 0.0094];
    for (let i = 0; i < 4; i++) {
      const Lf = fl[i] * hs, r = (fr[i] + gl * 0.6) * hs, z = fz[i] * hs;
      const y0 = -0.08 * hs, ym = -0.088 * hs - 0.04 * hs, yd = ym - (Lf - 0.048 * hs) * 0.55, y1 = -0.082 * hs - Lf;
      const fr4 = (y: number, rr: number) => ellRing(y, 0, z, rr * 1.08, rr, rr, 4, 2, k, undefined, -Math.PI + Math.PI / 4).map(tr);
      const rr = [
        { pts: fr4(y0, r * 1.08), v: 0.55, w: [H, 0.3, F1, 0.7] as Wt },
        { pts: fr4(ym + 0.005 * hs, r * 1.0), v: 0.32, w: [F1, 0.7, F2, 0.3] as Wt },
        { pts: fr4(ym - 0.004 * hs, r * 1.02), v: 0.26, w: [F1, 0.3, F2, 0.7] as Wt },
        { pts: fr4(yd, r * 0.9), v: 0.14, w: [F2, 1] as Wt },
        { pts: fr4(y1 + 0.007 * hs, r * 0.82), v: 0.04, w: [F2, 1] as Wt },
      ];
      B.loft(rr, usFor(4), reg, 42 + i * 2 + (k > 0 ? 0 : 1), { end: tr([0, y1, z + 0.0005]), endW: [F2, 1], endV: 0 });
    }
  }
  // thumb: a tube along a diagonal from the heel of the palm
  {
    const base: V3 = [-k * 0.004 * hs, -0.024 * hs, 0.028 * hs];
    const dir = nrm([-k * 0.22, -0.72, 0.62]);
    const side2 = nrm(crs(dir, [k, 0, 0]));
    const up = nrm(crs(side2, dir));
    const ring = (t: number, r: number): V3[] => {
      const c = [base[0] + dir[0] * t, base[1] + dir[1] * t, base[2] + dir[2] * t];
      const out: V3[] = [];
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI + (Math.PI * 2 * i) / 5;
        out.push(tr([c[0] + (Math.cos(a) * up[0] + Math.sin(a) * side2[0]) * r, c[1] + (Math.cos(a) * up[1] + Math.sin(a) * side2[1]) * r, c[2] + (Math.cos(a) * up[2] + Math.sin(a) * side2[2]) * r]));
      }
      return out;
    };
    const Lt = 0.066 * hs, r = (0.0135 + gl * 0.7) * hs;
    const rr = [
      { pts: ring(-0.004 * hs, r * 1.45), v: 0.5, w: [H, 0.6, TH, 0.4] as Wt },
      { pts: ring(Lt * 0.42, r * 1.05), v: 0.3, w: [TH, 1] as Wt },
      { pts: ring(Lt * 0.62, r * 1.02), v: 0.2, w: [TH, 1] as Wt },
      { pts: ring(Lt * 0.92, r * 0.84), v: 0.05, w: [TH, 1] as Wt },
    ];
    const tip = tr([base[0] + dir[0] * Lt, base[1] + dir[1] * Lt, base[2] + dir[2] * Lt]);
    B.loft(rr, usFor(5), reg, 50 + (k > 0 ? 0 : 1), { end: tip, endW: [TH, 1], endV: 0 });
  }
}
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ------------------------------------------------------------------ feet & shoes
interface FootRow { z: number; rx: number; top: number }
const FOOT_BARE: FootRow[] = [
  { z: -0.062, rx: 0.022, top: -0.03 }, { z: -0.048, rx: 0.029, top: -0.005 }, { z: -0.015, rx: 0.033, top: 0.022 },
  { z: 0.08, rx: 0.043, top: -0.026 }, { z: 0.122, rx: 0.046, top: -0.043 }, { z: 0.158, rx: 0.042, top: -0.05 }, { z: 0.178, rx: 0.03, top: -0.056 },
];
function shoeRows(kind: FeetKind): { rows: FootRow[]; soleH: number; lip: number } {
  switch (kind) {
    case 'sneaker': return { soleH: 0.028, lip: 0.006, rows: [
      { z: -0.074, rx: 0.032, top: -0.012 }, { z: -0.06, rx: 0.038, top: 0.018 }, { z: -0.02, rx: 0.043, top: 0.032 },
      { z: 0.085, rx: 0.054, top: -0.016 }, { z: 0.13, rx: 0.056, top: -0.032 }, { z: 0.168, rx: 0.051, top: -0.04 }, { z: 0.192, rx: 0.036, top: -0.048 }] };
    case 'boot': return { soleH: 0.03, lip: 0.007, rows: [
      { z: -0.07, rx: 0.034, top: 0.02 }, { z: -0.055, rx: 0.04, top: 0.04 }, { z: -0.02, rx: 0.045, top: 0.05 },
      { z: 0.085, rx: 0.053, top: -0.012 }, { z: 0.13, rx: 0.056, top: -0.03 }, { z: 0.165, rx: 0.052, top: -0.038 }, { z: 0.188, rx: 0.039, top: -0.046 }] };
    case 'rubber': return { soleH: 0.028, lip: 0.005, rows: [
      { z: -0.074, rx: 0.04, top: 0.04 }, { z: -0.058, rx: 0.046, top: 0.05 }, { z: -0.02, rx: 0.05, top: 0.05 },
      { z: 0.085, rx: 0.056, top: -0.006 }, { z: 0.13, rx: 0.058, top: -0.024 }, { z: 0.168, rx: 0.054, top: -0.034 }, { z: 0.196, rx: 0.04, top: -0.044 }] };
    case 'snow': return { soleH: 0.04, lip: 0.009, rows: [
      { z: -0.08, rx: 0.046, top: 0.05 }, { z: -0.064, rx: 0.054, top: 0.06 }, { z: -0.02, rx: 0.058, top: 0.06 },
      { z: 0.085, rx: 0.062, top: 0.0 }, { z: 0.13, rx: 0.064, top: -0.02 }, { z: 0.17, rx: 0.06, top: -0.03 }, { z: 0.2, rx: 0.046, top: -0.04 }] };
    case 'shoe': return { soleH: 0.018, lip: 0.003, rows: [
      { z: -0.068, rx: 0.028, top: -0.015 }, { z: -0.054, rx: 0.034, top: 0.008 }, { z: -0.018, rx: 0.038, top: 0.02 },
      { z: 0.085, rx: 0.046, top: -0.024 }, { z: 0.135, rx: 0.046, top: -0.04 }, { z: 0.172, rx: 0.038, top: -0.048 }, { z: 0.192, rx: 0.024, top: -0.053 }] };
    case 'sandal': return { soleH: 0.022, lip: 0.007, rows: FOOT_BARE.map((r) => ({ ...r, rx: r.rx + 0.004, top: r.top + 0.004 })) };
  }
}

function buildFoot(B: Loft, L: Look, d: Dims, side: 'L' | 'R', k: number, sh: Shape) {
  const s = d.s;
  const Ft = BI[('foot' + side) as BoneName];
  const fp = d.rest[('foot' + side) as BoneName];
  const reg = R(('FOOT_' + side) as RegKey);
  const spec = shoeRows(sh.feet);
  const fs = s * L.build.footS * (1 - L.build.fem * 0.08);
  const ground = -d.L.ankle;
  const sole = spec.soleH;
  const AN = [-180, -125, -91, -89, -45, 0, 45, 89, 91, 125, 180];
  const us = AN.map((a) => 0.5 + a / 360);
  const rings = spec.rows.map((r, i) => {
    const toeLift = r.z > 0.15 ? (r.z - 0.15) * 0.3 : 0;
    const yb = ground + toeLift * s;
    const ym = yb + sole * fs;
    const yt = Math.max(ym + 0.014 * s, r.top * fs + (sh.feet === 'sandal' ? -0.004 : 0));
    const rx = r.rx * fs, rl = rx + spec.lip * fs;
    const pts: V3[] = AN.map((a) => {
      const t = (a * Math.PI) / 180;
      if (Math.abs(a) < 90) {
        const sx = Math.sin(t), cy = Math.cos(t);
        return [k * Math.sign(sx) * Math.pow(Math.abs(sx), 0.85) * rx, ym + Math.pow(Math.max(0, cy), 0.8) * (yt - ym), r.z * fs];
      }
      const sx = Math.sin(t), cy = -Math.cos(t);
      return [k * Math.sign(sx) * Math.pow(Math.abs(sx), 0.35) * rl, ym - Math.pow(Math.max(0, cy), 0.3) * (ym - yb), r.z * fs];
    });
    for (const p of pts) { p[0] += fp[0]; p[1] += fp[1]; p[2] += fp[2]; }
    return { pts, v: 0.04 + 0.66 * (i / (spec.rows.length - 1)), w: [Ft, 1] as Wt };
  });
  const last = spec.rows[spec.rows.length - 1];
  B.loft(rings, us, reg, 60 + (k > 0 ? 0 : 1), {
    start: [fp[0], fp[1] + ground + 0.03 * s, fp[2] + (spec.rows[0].z - 0.006) * fs],
    end: [fp[0], fp[1] + ground + (sole + 0.012) * fs, fp[2] + (last.z + 0.012) * fs], endV: 0.72, startV: 0.0, alt: true,
  });
  // laces across the instep, the tongue standing proud above them (sneakers and boots)
  if (sh.feet === 'sneaker' || sh.feet === 'boot') {
    const topAt = (z: number) => {
      const Rw = spec.rows;
      let i = 0; while (i < Rw.length - 2 && Rw[i + 1].z < z) i++;
      const a = Rw[i], bb = Rw[i + 1], f = clamp01((z - a.z) / (bb.z - a.z || 1));
      return { top: (a.top + (bb.top - a.top) * f) * fs, rx: (a.rx + (bb.rx - a.rx) * f) * fs };
    };
    const n = sh.feet === 'boot' ? 5 : 4;
    const z0 = sh.feet === 'boot' ? -0.01 : 0.015, z1 = 0.105;
    const lace = subR(reg, 0.46, 0.75, 0.54, 0.8);
    for (let i = 0; i < n; i++) {
      const z = z0 + ((z1 - z0) * i) / Math.max(1, n - 1);
      const h0 = topAt(z - 0.012), h1 = topAt(z + 0.012);
      const slope = Math.atan2(h0.top - h1.top, 0.024 * fs);
      const c: V3 = [fp[0], fp[1] + topAt(z).top + 0.0035 * s, fp[2] + z * fs];
      B.box(c, [topAt(z).rx * 0.9, 0.0045 * s, 0.0075 * s], lace, [Ft, 1], new THREE.Matrix4().makeRotationX(slope).multiply(new THREE.Matrix4().makeRotationY(i & 1 ? 0.18 : -0.18)));
    }
  }
  // sandal straps over the sock
  if (sh.feet === 'sandal') {
    const strap = subR(reg, 0.0, 0.8, 0.2, 1);
    for (const [z, w] of [[0.1, 0.05], [0.02, 0.04]] as [number, number][]) {
      B.box([fp[0], fp[1] - 0.045 * s + (z < 0.05 ? 0.012 : 0), fp[2] + z * fs], [w * fs * 2.1, 0.008 * s, 0.018 * s], strap, [Ft, 1], new THREE.Matrix4().makeRotationX(0.3));
    }
  }
}

export { TORSO_ROWS, ARM_ROWS, LEG_ROWS };
