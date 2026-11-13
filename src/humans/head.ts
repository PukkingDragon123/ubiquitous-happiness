// The head: skull loft with sculpted anatomy, nose, ears, hair shells and beards.
//
// Ported from Limbophobia (humanModel.ts head(): polar radius tables, faceRelief, nose and ear construction,
// hair shells, facial hair) and reworked for cartoony-realistic faces: the cranium and cheeks are fuller, the
// eye sockets are carved deep and wide to seat real 3D eyeballs (face.ts adds eyes, lids and brows as their own
// meshes on the head bone), and the lips are left flat because the mouth is a swappable decal from the
// page's expression atlas.
import type { V3, Wt } from '../gfx/loft';
import { Loft, usFor } from '../gfx/loft';
import type { Dims } from './rig';
import { BI, ellRing, gauss, vOf, clamp01 } from './rig';
import type { Look } from './looks';
import { R, VMAP, subR } from './page';

// polar radius tables per height (head-local reference metres) at angles 0,22,45,70,95,125,155,180 deg from the face
const HA = [0, 22, 45, 70, 95, 125, 155, 180];
interface HeadRow { y: number; zc: number; r: number[] }
const HEAD_ROWS: HeadRow[] = [
  { y: -0.03, zc: -0.004, r: [0.05, 0.05, 0.048, 0.046, 0.045, 0.044, 0.044, 0.044] },
  { y: -0.013, zc: 0.006, r: [0.08, 0.072, 0.056, 0.048, 0.047, 0.047, 0.047, 0.047] },
  { y: 0.008, zc: 0.006, r: [0.093, 0.086, 0.07, 0.06, 0.057, 0.058, 0.062, 0.066] },
  { y: 0.033, zc: 0.006, r: [0.099, 0.094, 0.082, 0.071, 0.067, 0.069, 0.078, 0.083] },
  { y: 0.058, zc: 0.006, r: [0.101, 0.097, 0.086, 0.077, 0.074, 0.079, 0.092, 0.097] },
  { y: 0.078, zc: 0.006, r: [0.1, 0.097, 0.089, 0.08, 0.076, 0.083, 0.099, 0.104] },
  { y: 0.096, zc: 0.006, r: [0.099, 0.096, 0.089, 0.081, 0.077, 0.085, 0.101, 0.107] },
  { y: 0.114, zc: 0.006, r: [0.101, 0.099, 0.091, 0.083, 0.081, 0.088, 0.102, 0.108] },
  { y: 0.143, zc: 0.004, r: [0.098, 0.095, 0.089, 0.082, 0.081, 0.087, 0.1, 0.106] },
  { y: 0.173, zc: 0.0, r: [0.086, 0.084, 0.079, 0.074, 0.072, 0.078, 0.088, 0.092] },
  { y: 0.199, zc: -0.004, r: [0.06, 0.059, 0.057, 0.054, 0.053, 0.056, 0.062, 0.064] },
];
export const HEAD_ANG = [-180, -155, -125, -95, -70, -45, -22, 0, 22, 45, 70, 95, 125, 155, 180];
const FACE_ROWS = [-0.03, -0.015, 0.0, 0.012, 0.022, 0.032, 0.042, 0.052, 0.062, 0.072, 0.08, 0.087, 0.094, 0.1, 0.106, 0.113, 0.12, 0.128, 0.142, 0.16, 0.18, 0.2];
const FACE_ANG = [-180, -150, -122, -101, -86, -72, -60, -50, -41, -33, -26, -19, -12, -6, 0, 6, 12, 19, 26, 33, 41, 50, 60, 72, 86, 101, 122, 150, 180];

function headR(row: HeadRow, deg: number): number {
  const a = Math.abs(deg);
  for (let i = 0; i + 1 < HA.length; i++) {
    if (a <= HA[i + 1]) {
      const t = (a - HA[i]) / (HA[i + 1] - HA[i]);
      const st = t * t * (3 - 2 * t);
      return row.r[i] + (row.r[i + 1] - row.r[i]) * (0.5 * t + 0.5 * st);
    }
  }
  return row.r[row.r.length - 1];
}
function sampleHead(y: number): HeadRow {
  const Rw = HEAD_ROWS;
  if (y <= Rw[0].y) return Rw[0];
  if (y >= Rw[Rw.length - 1].y) return Rw[Rw.length - 1];
  for (let i = 0; i + 1 < Rw.length; i++) {
    const a = Rw[i], b = Rw[i + 1];
    if (y >= a.y && y <= b.y) { const t = (y - a.y) / (b.y - a.y); return { y, zc: a.zc + (b.zc - a.zc) * t, r: a.r.map((v, j) => v + (b.r[j] - v) * t) }; }
  }
  return Rw[0];
}

/** where the facial features sit (head-local reference units / degrees) */
export interface FaceLayout { eyeY: number; eyeA: number; eyeR: number; browY: number; mouthY: number; noseY: number }
export function faceLayout(L: Look): FaceLayout {
  const kid = L.arch === 'kid';
  return {
    eyeY: kid ? 0.094 : 0.1,
    eyeA: 21.5 * L.face.eyeX,
    eyeR: 0.0205 * L.face.eyeR * (kid ? 1.06 : 1),
    browY: kid ? 0.127 : 0.131,
    mouthY: kid ? 0.034 : 0.036,
    noseY: 0.056,
  };
}

const g = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));

/**
 * Anatomy over the base skull (radial offset): brow ridge, the deep sockets the eyeballs sit in, cheekbones
 * and cheeks (fuller than real for the cartoony read), a soft muzzle with the lips left flat for the decal,
 * chin, jaw corners and temples.
 */
function faceRelief(y: number, deg: number, L: Look, F: FaceLayout): number {
  const a = Math.abs(deg);
  if (a > 112 || y < -0.035 || y > 0.16) return 0;
  const fem = L.build.fem, masc = 1 - fem;
  const eR = F.eyeR / 0.0172;
  let r = 0;
  // brow ridge over both eyes, heavier on masculine skulls, fading at the temples
  r += (0.003 + 0.003 * masc) * g(y, F.browY - 0.006, 0.0068) * (a < 46 ? 1 : g(a, 46, 11)) * (0.75 + 0.25 * g(a, 20, 12));
  r -= 0.0015 * g(y, F.browY - 0.016, 0.006) * g(a, 0, 5);
  // the sockets: wide and deep, the eyeball fills them
  r -= 0.0105 * eR * g(y, F.eyeY, 0.0095 * eR) * g(a, F.eyeA, 10.5 * eR);
  // cheekbones and the round apple of the cheek
  r += (0.005 + 0.0015 * fem) * L.face.cheek * g(y, 0.074, 0.009) * g(a, 42, 12);
  r += 0.0035 * L.face.cheek * g(y, 0.06, 0.012) * g(a, 36, 13) * (L.arch === 'kid' ? 1.6 : 1);
  r -= 0.0012 * g(y, 0.046, 0.009) * g(a, 50, 11);
  // the muzzle over the teeth (mouth stays flat for the decal)
  r += 0.0034 * g(y, 0.036, 0.017) * g(a, 0, 26);
  // under the lower lip, the chin, the corners of the jaw
  r -= 0.0016 * g(y, 0.018, 0.004) * g(a, 0, 14);
  r += (0.0034 + 0.0024 * masc) * L.face.chin * g(y, 0.004, 0.009) * g(a, 0, 14);
  r += 0.0018 * masc * L.face.jaw * g(y, 0.008, 0.011) * g(a, 70, 10);
  // temples
  r -= 0.0024 * g(y, 0.128, 0.014) * g(a, 76, 12);
  return r;
}

export interface HeadShape {
  L: Look; d: Dims; F: FaceLayout; hs: number; hp: V3;
  /** point on the skin (head-local reference units), off = metres (reference) out from the skin */
  skull(y: number, deg: number, off?: number, relief?: boolean): V3;
  /** head-local reference -> body space */
  tr(p: V3): V3;
  /** head-local reference -> head-bone space (metres, for meshes parented to the head bone) */
  loc(p: V3): V3;
  /** outward unit normal of the bare skull (no relief) at (y, deg) */
  normal(y: number, deg: number): V3;
}

export function headShape(L: Look, d: Dims): HeadShape {
  const F = faceLayout(L);
  const hs = d.hs, hp = d.rest.head;
  const fem = L.build.fem, Fc = L.face;
  const jaw = (1 - fem * 0.1) * Fc.jaw, chin = (1 - fem * 0.05) * Fc.chin, wide = Fc.wide;
  const kidK = L.arch === 'kid' ? 1 : 0;
  const tweak = (row: HeadRow, deg: number) => {
    let r = headR(row, deg);
    const a = Math.abs(deg);
    const lowFace = row.y < 0.05 ? 1 - Math.max(0, row.y) / 0.05 : 0;
    if (a >= 30 && a <= 110) r *= 1 + (jaw - 1) * lowFace;
    if (a < 30) r *= 1 + (chin - 1) * lowFace;
    if (wide !== 1 && a > 20 && a < 160) r *= 1 + (wide - 1) * Math.sin((a * Math.PI) / 180);
    // cartoon fullness: rounder cheeks and a slightly wider face than life
    r *= 1 + 0.06 * Math.sin(Math.min(Math.PI, (a / 80) * Math.PI)) * clamp01(1 - Math.abs(row.y - 0.06) / 0.07) + 0.03 * Math.sin((Math.min(a, 120) / 120) * Math.PI);
    // kids: a rounder, bigger cranium over a small jaw
    if (kidK) r *= 1 + 0.07 * clamp01((row.y - 0.07) / 0.06) - 0.06 * lowFace;
    return r;
  };
  const longY = (y: number) => (Fc.long !== 1 && y < 0.07 ? 0.07 + (y - 0.07) * Fc.long : y);
  const skull = (y: number, deg: number, off = 0, relief = true): V3 => {
    const row = sampleHead(y);
    const t = (deg * Math.PI) / 180;
    const r = tweak(row, deg) + off + (relief ? faceRelief(y, deg, L, F) : 0);
    return [Math.sin(t) * r, y, row.zc + Math.cos(t) * r];
  };
  const normal = (y: number, deg: number): V3 => {
    const e = 0.002, de = 1.2;
    const p0 = skull(y, deg, 0, false), py = skull(y + e, deg, 0, false), pa = skull(y, deg + de, 0, false);
    const u: V3 = [py[0] - p0[0], py[1] - p0[1], py[2] - p0[2]], v: V3 = [pa[0] - p0[0], pa[1] - p0[1], pa[2] - p0[2]];
    const n: V3 = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  return {
    L, d, F, hs, hp, skull, normal,
    tr: (p) => [hp[0] + p[0] * hs, hp[1] + longY(p[1]) * hs, hp[2] + p[2] * hs],
    loc: (p) => [p[0] * hs, longY(p[1]) * hs, p[2] * hs],
  };
}

/** the head-region uv of a body-space point (cylindrical projection, as the skull rings map) */
export function headUV(S: HeadShape, p: V3): [number, number] {
  const hs = S.hs, hp = S.hp, reg = R('HEAD');
  const lx = (p[0] - hp[0]) / hs, ly0 = (p[1] - hp[1]) / hs, lz = (p[2] - hp[2]) / hs - 0.006;
  const Lk = S.L.face.long;
  const ly = Lk !== 1 && ly0 < 0.07 ? 0.07 + (ly0 - 0.07) / Lk : ly0;
  const a = Math.atan2(lx, lz) / (Math.PI * 2) + 0.5;
  return [reg.x + a * reg.w, reg.y + (1 - vOf(VMAP.HEAD, ly)) * reg.h];
}

// ------------------------------------------------------------------ head build
export function buildHead(B: Loft, S: HeadShape) {
  const { L, tr, skull } = S;
  const H = BI.head;
  const us = FACE_ANG.map((a) => 0.5 + a / 360);
  const rings = FACE_ROWS.map((y, i) => ({
    pts: FACE_ANG.map((a) => tr(skull(y, a))), v: vOf(VMAP.HEAD, y),
    w: (i === 0 ? [H, 0.7, BI.neck, 0.3] : [H, 1]) as Wt,
  }));
  B.loft(rings, us, R('HEAD'), 70, { end: tr([0, 0.214, -0.006]), endW: [H, 1], endV: vOf(VMAP.HEAD, 0.214), start: tr([0, -0.034, -0.01]), startW: [H, 0.6, BI.neck, 0.4], startV: 0, alt: true });
  const vP = (p: V3, gg: number, w: Wt = [H, 1]) => { const [u, v] = headUV(S, p); return B.vert(p, u, v, w, gg); };
  const centre = tr([0, 0.08, 0.0]);

  // nose: root between the brows, a bridge, the (bulbous) tip, wings round the nostrils, the columella
  {
    const N = L.face.nose;
    const sf = (y: number, deg = 0) => skull(y, deg)[2];
    const sx = (y: number, deg: number) => skull(y, deg)[0];
    const kid = L.arch === 'kid';
    const nw = 0.019 * N.w * (1 - L.build.fem * 0.12) * (1 + N.bulb * 0.3);
    const Ln = 0.029 * N.len * (1 - L.build.fem * 0.12) * (kid ? 0.8 : 1);
    const up = N.up * 0.006, bulb = N.bulb;
    const pt = (x: number, y: number, z: number): V3 => tr([x, y, z]);
    const root = pt(0, 0.108, sf(0.108) + 0.0008);
    const brL = pt(nw * 0.42, 0.096, sf(0.096, 7) + 0.0018), brR = pt(-nw * 0.42, 0.096, sf(0.096, -7) + 0.0018);
    const ridge = pt(0, 0.081, sf(0.081) + Ln * 0.36);
    const tipT = pt(0, 0.064 + up * 0.5, sf(0.064) + Ln * (0.9 + bulb * 0.08));
    const tip = pt(0, 0.057 + up, sf(0.057) + Ln * (1 + bulb * 0.1));
    const tipL = pt(nw * (0.45 + bulb * 0.18), 0.058 + up, sf(0.058) + Ln * (0.8 + bulb * 0.08)), tipR = pt(-nw * (0.45 + bulb * 0.18), 0.058 + up, sf(0.058) + Ln * (0.8 + bulb * 0.08));
    const sideL = pt(nw * 0.6, 0.075, sf(0.075, 9) + Ln * 0.25), sideR = pt(-nw * 0.6, 0.075, sf(0.075, -9) + Ln * 0.25);
    const alaL = pt(nw * 1.05, 0.054, Math.max(sf(0.054, 12) + 0.002, sf(0.054) + Ln * 0.24)), alaR = pt(-nw * 1.05, 0.054, Math.max(sf(0.054, -12) + 0.002, sf(0.054) + Ln * 0.24));
    const baseL = pt(sx(0.05, 10) * 0.62, 0.049, sf(0.049, 8) + 0.002), baseR = pt(sx(0.05, -10) * 0.62, 0.049, sf(0.049, -8) + 0.002);
    const col = pt(0, 0.05 + up * 0.5, sf(0.05) + Ln * 0.52);
    const P = [root, brL, brR, ridge, tipT, tip, tipL, tipR, sideL, sideR, alaL, alaR, baseL, baseR, col].map((p) => vP(p, 80));
    const [RT, BL, BR, RG, TT, TP, TL, TR, SL, SR, AL, AR, NL, NR, CO] = P;
    const ins = tr([0, 0.075, sf(0.075) - 0.03]);
    const T = (a: number, b: number, c: number) => B.triOut(a, b, c, ins);
    T(RT, BL, RG); T(RT, RG, BR); T(BL, SL, RG); T(BR, RG, SR);
    T(RG, SL, TT); T(RG, TT, SR); T(SL, TL, TT); T(SR, TT, TR); T(TT, TL, TP); T(TT, TP, TR);
    T(SL, AL, TL); T(SR, TR, AR); T(TL, AL, CO); T(TR, CO, AR); T(TL, CO, TP); T(TR, TP, CO);
    T(AL, NL, CO); T(AR, CO, NR); T(BL, AL, SL); T(BR, SR, AR); T(BL, NL, AL); T(BR, AR, NR);
  }
  // ears: a rim (helix) curling back from the side of the head, the bowl, a lobe; both faces drawn
  for (const k of [1, -1]) {
    const a = k * 95;
    const es = L.face.ears * (L.arch === 'kid' ? 1.22 : 1.12), ym = 0.082;
    const Y = (y: number) => ym + (y - ym) * es;
    const out = 0.022 * es;
    const base = (y: number, back: number) => skull(Y(y), a - k * back, -0.002, false);
    const rim = (y: number, o: number, back: number): V3 => { const p = skull(Y(y), a - k * back, 0, false); return [p[0] + k * o, p[1], p[2]]; };
    const pts: V3[] = [
      base(0.106, 2), base(0.083, 0), base(0.058, 2),
      rim(0.113, out * 0.6, 9), rim(0.109, out * 0.92, 19), rim(0.094, out * 1.05, 26), rim(0.071, out * 0.95, 24), rim(0.055, out * 0.62, 13),
      rim(0.091, out * 0.42, 12), rim(0.074, out * 0.4, 11),
      rim(0.045, out * 0.34, 6),
    ].map((p) => tr(p));
    const Fv = pts.map((p) => vP(p, -1)), Bk = pts.map((p) => vP(p, -1));
    const tris = [[0, 3, 8], [3, 4, 8], [4, 5, 8], [8, 5, 9], [5, 6, 9], [6, 7, 9], [9, 7, 2], [8, 9, 1], [0, 8, 1], [1, 9, 2], [2, 7, 10]];
    const outside = tr([k * 0.2, 0.08, 0.02]);
    for (const t of tris) { B.triOut(Fv[t[0]], Fv[t[1]], Fv[t[2]], centre); B.triOut(Bk[t[0]], Bk[t[1]], Bk[t[2]], outside); }
  }
  buildFacialHair(B, S);
  buildHair(B, S);
}

// ------------------------------------------------------------------ hair
/** the hat line: hair above it is hidden under the hat (head-local y), by angle */
export function hatLine(L: Look, deg: number): number {
  const a = Math.abs(deg);
  switch (L.hat) {
    case 'cap': case 'capBack': return a < 60 ? 0.158 : 0.134 - (a > 120 ? 0.01 : 0);
    case 'beanie': return a < 50 ? 0.152 : 0.122;
    case 'bucket': return 0.142 - (a > 100 ? 0.008 : 0);
    case 'sunhat': return 0.145;
    case 'ushanka': return a < 60 ? 0.158 : 0.06;
    case 'captain': case 'captainBlack': return 0.15 - (a > 100 ? 0.006 : 0);
    default: return 99;
  }
}

function buildHair(B: Loft, S: HeadShape) {
  const { L, tr, skull } = S;
  const st = L.hair.style;
  if (st === 'none') return;
  const H = BI.head;
  const hat = L.hat !== 'none';
  const hairW = (p: V3): Wt => {
    const ly = (p[1] - S.hp[1]) / S.hs;
    if (ly > -0.02) return [H, 1];
    const t = clamp01((-0.02 - ly) / 0.2);
    return [H, 1 - t * 0.75, BI.chest, t * 0.75];
  };
  // hairline height by angle: front, temple, side (over the ear), back
  const line = (deg: number) => {
    const a = Math.abs(deg);
    let front = 0.153, temple = 0.13, side = 0.112, back = 0.02;
    if (st === 'sides') { front = 0.205; temple = 0.19; side = 0.105; back = 0.03; }
    if (st === 'bun') { front = 0.15; temple = 0.128; side = 0.1; back = 0.02; }
    if (st === 'shaggy') { side = 0.07; back = -0.06; temple = 0.12; }
    if (st === 'messy') { front = 0.145; side = 0.1; back = 0.015; }
    if (st === 'long') { side = -0.05; back = -0.16; }
    if (a < 25) return front;
    if (a < 60) return front + (temple - front) * ((a - 25) / 35);
    if (a < 105) return temple + (side - temple) * ((a - 60) / 45);
    return side + (back - side) * Math.min(1, (a - 105) / 55);
  };
  const thick = st === 'sides' ? 0.008 : st === 'bun' ? 0.008 : st === 'shaggy' ? 0.014 : st === 'messy' ? 0.013 : 0.009;
  const ys = [-0.14, -0.08, -0.03, 0.0, 0.035, 0.07, 0.105, 0.14, 0.17, 0.198];
  const minY = Math.min(...HEAD_ANG.map((a) => line(a)));
  const rowYs = ys.filter((y) => y >= minY - 0.03);
  const us = HEAD_ANG.map((a) => 0.5 + a / 360);
  const hh = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7 + (L.seed & 255) * 0.37) * 43758.5453; return x - Math.floor(x); };
  const nA = HEAD_ANG.length - 1;
  const clumpAmp = st === 'messy' || st === 'shaggy' ? 0.01 : 0.006;
  const rings = rowYs.map((y, ri) => {
    const pts = HEAD_ANG.map((a, ci) => {
      const cj = ci % nA;
      let yy = Math.max(y, line(a));
      // tufts poke down at the hairline
      if (ri === 0 && Math.abs(a) < 175 && (cj & 1)) yy -= st === 'messy' || st === 'shaggy' ? 0.016 : 0.008;
      let yc = Math.min(yy, hat ? hatLine(L, a) + 0.004 : 99);
      if (yc < 0 && ri === 0 && (cj & 1)) yc -= 0.02 + hh(cj, 3) * 0.025;
      let p: V3;
      if (yc < 0) {
        const base = skull(0.0, a, thick);
        const drop = -yc;
        const flare = 0.016 * drop / 0.2 + 0.004;
        const t = (a * Math.PI) / 180;
        const back = Math.abs(a) > 100 ? 1 : 0;
        p = [base[0] + Math.sin(t) * flare, yc, base[2] + Math.cos(t) * flare - back * drop * 0.14];
      } else {
        const edge = 0.35 + 0.65 * clamp01((yc - line(a)) / 0.035);
        const clump = (hh(ri, cj) - 0.35) * clumpAmp * clamp01((yc - line(a) + 0.01) / 0.03);
        const sideFluff = st === 'sides' && Math.abs(a) > 70 ? 0.008 * Math.sin(clamp01((yc - 0.105) / 0.06) * Math.PI) : 0;
        p = skull(yc, a, thick * edge + clump + sideFluff + (yc > 0.12 ? 0.003 : 0), false);
      }
      return tr(p);
    });
    return { pts, v: clamp01(0.06 + 0.9 * (ri / Math.max(1, rowYs.length - 1))), w: hairW };
  });
  const capOff = hat ? null : tr([0, 0.214 + thick + (st === 'messy' ? 0.012 : 0), -0.008]);
  const reg = R('HAIR');
  B.loft(rings, us, reg, 110, { end: capOff, endW: [H, 1], endV: 1, alt: true });
  // messy fringe sticking out under a cap brim / over the forehead
  if (st === 'messy' || st === 'shaggy') {
    const ang = [-46, -32, -18, -6, 6, 18, 32, 46];
    const y0 = hat ? Math.min(0.148, hatLine(L, 0)) : 0.15;
    const rr = [
      { pts: ang.map((a) => tr(skull(y0 + 0.012, a, thick + 0.003, false))), v: 0.9, w: [H, 1] as Wt },
      { pts: ang.map((a, i) => tr(skull(y0 - 0.016 - (i % 2) * 0.012 - hh(i, 9) * 0.008, a + (i % 2 ? 4 : -4), thick * 0.5 + 0.006, false))), v: 0.55, w: [H, 1] as Wt },
    ];
    B.loft(rr, ang.map((a) => 0.5 + a / 360), reg, 111, {});
    B.loft(rr, ang.map((a) => 0.5 + a / 360), reg, 112, { flip: true });
  }
  // the bun: a knot on the back of the crown
  if (st === 'bun') {
    const c = skull(0.168, 180, 0.03, false);
    const ysK = [-0.03, -0.016, 0.004, 0.022, 0.032];
    const rr = ysK.map((dy, i) => {
      const r = [0.018, 0.034, 0.038, 0.028, 0.012][i];
      return { pts: ellRing(c[1] + dy, c[0], c[2], r, r * 0.95, r, 10, 2, 1, (th) => Math.sin(th * 5 + dy * 200) * 0.06).map(tr), v: 0.2 + i * 0.18, w: [H, 1] as Wt };
    });
    B.loft(rr, usFor(10), subR(reg, 0, 0, 0.4, 1), 115, { end: tr([c[0], c[1] + 0.036, c[2]]), start: tr([c[0], c[1] - 0.034, c[2] + 0.01]) });
  }
}

// ------------------------------------------------------------------ facial hair
function buildFacialHair(B: Loft, S: HeadShape) {
  const { L, tr, skull } = S;
  const fh = L.facial;
  const H = BI.head;
  const reg = R('BEARD');
  const sk = (y: number, a: number, off: number) => skull(y, a, off, true);
  if (fh === 'beard' || fh === 'bigBeard' || fh === 'goatee') {
    const big = fh === 'bigBeard';
    const ang = fh === 'goatee' ? [-30, -16, 0, 16, 30] : [-100, -84, -66, -48, -30, -15, 0, 15, 30, 48, 66, 84, 100];
    // rows from the cheeks / under the mouth down past the chin; a big beard hangs as a full bib
    const ys = fh === 'goatee' ? [0.024, 0.01, -0.006, -0.022, -0.036] : big ? [0.058, 0.03, 0.012, -0.008, -0.03, -0.06, -0.1, -0.15] : [0.05, 0.026, 0.008, -0.012, -0.03, -0.045];
    const top = (a: number) => {
      const aa = Math.abs(a);
      if (fh === 'goatee') return 0.022;
      // leave the mouth open: the beard starts under the lower lip in front, rises along the cheeks to the sideburns
      return aa < 20 ? 0.02 : aa < 36 ? 0.026 + (aa - 20) * 0.0012 : aa < 70 ? 0.046 + (aa - 36) * 0.0012 : 0.1;
    };
    const rr = ys.map((y, i) => {
      const t = i / (ys.length - 1);
      const pts = ang.map((a, ci) => {
        const aa = Math.abs(a);
        const yy = Math.min(y, top(a));
        const onFace = yy > -0.025;
        let p: V3;
        if (onFace) {
          const off = (big ? 0.008 : 0.005) + (yy < 0.01 ? (big ? 0.008 : 0.004) : 0) + (aa < 30 && yy < 0.01 ? 0.005 : 0) + (yy >= top(a) - 0.001 ? -0.002 : 0);
          p = sk(yy, a, off);
        } else {
          // below the chin the beard hangs forward of the neck and throat
          const base = sk(-0.025, a, big ? 0.016 : 0.008);
          const drop = -0.025 - yy;
          const narrow = 1 - clamp01(drop / (big ? 0.15 : 0.04)) * (big ? 0.38 : 0.7);
          p = [base[0] * narrow, yy, base[2] * (0.75 + 0.25 * narrow) + drop * (big ? 0.35 : 0.25) * Math.cos((a * Math.PI) / 180)];
        }
        // ragged tips
        if (i === ys.length - 1) { const j = ((ci * 7919) % 13) / 13; p = [p[0], p[1] - j * (big ? 0.03 : 0.01), p[2]]; }
        return tr(p);
      });
      return { pts, v: 1 - t * 0.92, w: [H, 1] as Wt };
    });
    const uu = ang.map((_, i) => i / (ang.length - 1));
    B.loft(rr, uu, reg, 100, {});
    B.loft(rr, uu, reg, 101, { flip: true });
  }
  if (fh === 'moustache' || fh === 'walrus' || fh === 'beard' || fh === 'bigBeard' || fh === 'goatee') {
    const walrus = fh === 'walrus' || fh === 'bigBeard';
    const ang = walrus ? [-40, -30, -18, -8, 0, 8, 18, 30, 40] : [-32, -22, -11, 0, 11, 22, 32];
    const drop = (a: number) => (walrus ? Math.max(0, Math.abs(a) - 14) * 0.0007 : Math.abs(a) * 0.00028);
    const rows = walrus ? [0.054, 0.045, 0.034] : [0.052, 0.044];
    const rr = rows.map((y, i) => ({
      pts: ang.map((a) => tr(sk(y - drop(a) * (i === rows.length - 1 ? 1.4 : 0.6), a, (walrus ? 0.006 : 0.0045) + (i === 1 ? 0.002 : 0)))),
      v: 1 - i / Math.max(1, rows.length - 1), w: [H, 1] as Wt,
    }));
    const uu = ang.map((_, i) => i / (ang.length - 1));
    const sub = subR(reg, 0, 0.0, 1, 0.3);
    B.loft(rr, uu, sub, 102, { end: null });
    B.loft(rr, uu, sub, 103, { flip: true });
  }
}
