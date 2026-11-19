// Green sea turtle (Chelonia mydas), built for the side-on camera.
//   carapace   a low teardrop dome, widest ahead of centre, built as contour rings from the apex out to a crisp
//              overhanging rim; 5 vertebral + 4 pairs of costal scutes (hexagonal, juxtaposed) painted with the
//              green turtle's radiating mahogany / amber sunbursts, a band of 11 marginals a side plus the nuchal
//              and two supracaudals, thin pale seams; a healed bite notch, a few barnacles
//   plastron   flat, cream-yellow, paired scutes along the midline seam
//   head       blunt, short snout, horny serrated beak, big dark eye under a heavy lid, the head shields (one long
//              pair of prefrontals, four postorbitals) dark with pale yellow edges; a thick wrinkled neck
//   flippers   long scimitar fore-flippers (two segments, a single claw) that row in slow wing-like strokes
//              (downstroke pronated, the tip lagging), short rounded hind flippers held back as rudders
// Nose +x, up +y, the near side +z. All limbs are child meshes on the instance material (one program).
import * as THREE from 'three';
import { Kit } from './kit';
import { Page, paintEye, C, mix, shade } from './page';
import { V3, add, sub, scale } from '../gfx/loft';
import type { FishModel, SpeciesAsset } from './model';
import type { RGB } from '../gfx/px';
import { kitAsset, paintRect, tiles, hexCell, pick } from './kitutil';
import { cv, smoothstep } from './curve';
import { clamp, damp } from '../core/math';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------- dimensions
const SL = 0.84;          // carapace length
const SW = 0.305;         // carapace half width (widest)
const XA = 0.05;          // apex of the dome (ahead of centre)
const DOME = 0.13;        // dome rise above the rim
const RIMY = 0.035;       // rim height at the widest point
const PLY = -0.074;       // plastron level
const halfW = cv([[0, 0.0], [0.015, 0.36], [0.06, 0.62], [0.16, 0.86], [0.33, 0.99], [0.45, 1.0], [0.62, 0.93], [0.78, 0.76], [0.9, 0.5], [0.97, 0.22], [1, 0.0]]);

/** planform outline (top view) in polar coords from the apex: radius per direction, with a healed bite notch */
const OUT_N = 720;
const outline = (() => {
  // trace the outline (right side then left), then resample radius by angle around the apex
  const pts: [number, number][] = [];
  const nf = 400;
  for (let i = 0; i <= nf; i++) { const f = i / nf; pts.push([SL / 2 - f * SL, halfW(f) * SW]); }
  for (let i = nf; i >= 0; i--) { const f = i / nf; pts.push([SL / 2 - f * SL, -halfW(f) * SW]); }
  const R = new Float32Array(OUT_N);
  for (let k = 0; k < OUT_N; k++) {
    const th = (k / OUT_N) * TAU, dx = Math.cos(th), dz = Math.sin(th);
    // ray from the apex: find the farthest crossing with the polyline
    let best = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const ex = x1 - x0, ez = z1 - z0;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const ax = x0 - XA, az = z0;
      const t = (ax * ez - az * ex) / den, s = (ax * dz - az * dx) / den;
      if (s >= 0 && s <= 1 && t > best) best = t;
    }
    R[k] = best;
  }
  // a bite healed into the right rear marginals (shark or boat): a shallow scalloped notch
  const nc = Math.round((2.35 / TAU) * OUT_N);
  for (let k = -18; k <= 18; k++) { const q = k / 18; const i = (nc + k + OUT_N) % OUT_N; R[i] *= 1 - 0.07 * Math.pow(Math.max(0, 1 - q * q), 1.5); }
  return R;
})();
function rimR(th: number) {
  const f = ((th / TAU) % 1 + 1) % 1 * OUT_N, i = Math.floor(f), t = f - i;
  return outline[i % OUT_N] * (1 - t) + outline[(i + 1) % OUT_N] * t;
}
/** dome height profile, s = 0 apex .. 1 rim; the rear slopes lower (the shell tips down to the tail) */
const domeY = (s: number, x: number) => RIMY + (DOME * Math.pow(Math.max(0, 1 - s * s), 0.62)) - 0.03 * smoothstep(0.0, -SL / 2, x) + 0.012 * smoothstep(SL * 0.1, SL / 2, x);
const shellPt = (th: number, s: number): V3 => {
  const r = rimR(th) * s;
  const x = XA + Math.cos(th) * r, z = Math.sin(th) * r;
  return [x, domeY(s, x), z];
};

// ---------------------------------------------------------------------------------------------- scute layout
// top view in (x, z); seeds are hand placed so the plates read like a real green turtle's
const VERT: [number, number][] = [[0.27, 0], [0.13, 0], [-0.01, 0], [-0.15, 0], [-0.28, 0]];
const COST: [number, number][] = [[0.2, 0.17], [0.05, 0.2], [-0.1, 0.19], [-0.24, 0.13]];
const SEEDS: [number, number][] = [...VERT, ...COST, ...COST.map(([x, z]) => [x, -z] as [number, number])];
const SEEDW = [0.012, 0.012, 0.012, 0.012, 0.008, 0, 0, 0, 0, 0, 0, 0, 0];
/** growth centre (areola) of each scute: the radiating streaks start here */
const AREOLA: [number, number][] = SEEDS.map(([x, z], i) => (i < 5 ? [x - 0.03, z] : [x - 0.035, z * 0.72]));

const pal = {
  seam: C('#d6c48a'), seamDk: C('#1c140a'),
  dk: C('#2a1a0c'), mahog: C('#4a2814'), brown: C('#6a4220'), olive: C('#5e5a26'), amber: C('#9a7028'), gold: C('#c39a42'),
  marg: [C('#3a2812'), C('#6a4a1e'), C('#9a7a34')],
  plast: [C('#ecd48c'), C('#d2b26a'), C('#a08044')],
  skinDk: C('#3a3624'), skinMid: C('#5e5a3a'), skinEdge: C('#d8cc96'), skinPale: C('#e6dcb6'),
  barn: [C('#f2eee0'), C('#c8c2b0'), C('#6a645a')],
};

/** carapace colour at a top-view point; s = contour param (marginal band near 1) */
function carapaceCol(x: number, z: number, th: number, s: number): [RGB, number] {
  const MS = 0.85;
  if (s > MS) {
    // marginal band: 11 a side + nuchal + 2 supracaudals, seams radial
    const a = ((th / TAU) % 1 + 1) % 1;        // 0 front, 0.5 back
    const side = a < 0.5 ? a / 0.5 : (1 - a) / 0.5;
    const n = side < 0.035 ? -1 : side > 0.965 ? 12 : Math.floor((side - 0.035) / 0.93 * 12);
    const fr = side < 0.035 ? side / 0.035 : side > 0.965 ? (side - 0.965) / 0.035 : ((side - 0.035) / 0.93 * 12) % 1;
    const seam = Math.min(fr, 1 - fr) * (side < 0.035 || side > 0.965 ? 0.07 : 0.93 / 12) * rimR(th) * TAU * 0.5;
    const t = (s - MS) / (1 - MS);
    // radiating streaks toward the outer edge, alternating amber / mahogany
    const id = n + (a < 0.5 ? 0 : 40);
    const ray = Math.floor(fr * 5 + pick(id, 3) * 2) % 2;
    let c = mix(ray ? pal.marg[2] : pal.marg[1], pal.marg[0], smoothstep(0.55, 1, t) * 0.6);
    if (t < 0.12) c = shade(c, 0.78);
    if (seam < 0.004) c = pal.seam; else if (seam < 0.007) c = pal.seamDk;
    if (t < 0.07) c = pal.seamDk;
    return [c, seam < 0.007 ? 0 : 0.35 + t * 0.3];
  }
  const T = tiles(x, z, SEEDS, SEEDW);
  const [ax, az] = AREOLA[T.i];
  const dx = x - ax, dz = z - az, d = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  // sunburst: 14 wedge rays with slight per-scute twist; light rays widen outward
  const rays = 19 + (T.i % 4);
  const ra = (ang / TAU + 1 + pick(T.i, 1) * 0.3) * rays;
  const w = ra % 1, ri = Math.floor(ra);
  // streaks fan out from the areola: light ones are wedge-shaped and only some reach the plate edge
  const widen = 0.3 + 0.16 * Math.min(1, d / 0.1);
  const reach = 0.05 + pick(T.i * 31 + ri, 2) * 0.09;
  const light = Math.abs(w - 0.5) < widen * 0.5 && d < reach + 0.03 + (ri % 2) * 0.05;
  const alt = (ri + T.i) % 4;
  let c: RGB;
  if (d < 0.01) c = pal.olive;
  else if (light) c = alt === 0 ? pal.gold : alt === 3 ? mix(pal.amber, pal.olive, 0.5) : pal.amber;
  else c = alt === 1 ? pal.dk : alt === 2 ? pal.mahog : pal.brown;
  // growth annuli near the plate edge
  if (T.seam < 0.02 && T.seam > 0.014) c = shade(c, 0.86);
  // lit centre, darker toward the seams (domed plates)
  c = shade(c, 0.92 + 0.12 * Math.min(1, T.seam / 0.05));
  if (T.seam < 0.0028) c = pal.seam;
  else if (T.seam < 0.0055) c = pal.seamDk;
  // inner edge of the marginal band
  if (s > MS - 0.02) c = pal.seamDk;
  // a healed scrape across the rear left costal (pale scar)
  const scar = Math.abs((x + 0.2) * 0.6 + (z + 0.12) * 0.8);
  if (scar < 0.004 && x < -0.13 && x > -0.27 && z < 0) c = mix(c, C('#cfc4a4'), 0.8);
  return [c, T.seam < 0.0055 ? 0 : 0.25 + 0.5 * Math.min(1, T.seam / 0.04)];
}

// barnacles: hand-placed in shell coords (th, s)
const BARN: [number, number, number][] = [[2.62, 0.7, 0.018], [2.75, 0.62, 0.012], [2.68, 0.79, 0.01], [3.95, 0.9, 0.014], [3.82, 0.93, 0.01], [1.2, 0.93, 0.011]];

export function seaTurtle(): SpeciesAsset {
  const pg = new Page(512, 512), K = new Kit(pg);
  const shR = pg.alloc(256, 224), plR = pg.alloc(128, 96), headR = pg.alloc(160, 96), neckR = pg.alloc(96, 64);
  const flR = pg.alloc(192, 112), hfR = pg.alloc(96, 80), eyeR = pg.alloc(32, 32), barnR = pg.alloc(16, 16), clawR = pg.alloc(8, 12);

  // ---------------------------------------------------------------------------------- carapace (top dome)
  const X0 = -SL / 2 - 0.01, X1 = SL / 2 + 0.01, Z0 = -SW - 0.01;
  const topUV = (x: number, z: number): [number, number] => [(x - X0) / (X1 - X0), (z - Z0) / (2 * -Z0)];
  paintRect(pg, shR, (u, v) => {
    const x = X0 + u * (X1 - X0), z = Z0 + v * 2 * -Z0;
    const th = Math.atan2(z, x - XA), r = Math.hypot(x - XA, z);
    const s = r / Math.max(1e-6, rimR(th));
    if (s > 1.02) return [pal.marg[0], 1, 0.6, 0];
    const [c, h] = carapaceCol(x, z, th, Math.min(1, s));
    // barnacles painted as scars / bases under the geometry
    return [c, 1, 0.62, h];
  });
  const NA = 26, KS = [0.0, 0.2, 0.42, 0.62, 0.78, 0.9, 1.0];
  const topRings: { pts: V3[]; v: number }[] = [];
  for (let k = 1; k < KS.length; k++) {
    const pts: V3[] = [];
    for (let j = 0; j <= NA; j++) pts.push(shellPt((j / NA) * TAU, KS[k]));
    topRings.push({ pts, v: KS[k] });
  }
  const apex: V3 = [XA, domeY(0, XA), 0];
  const fTop = K.loftPart(topRings, shR, { start: apex });
  const sreg = pg.reg(shR);
  K.tag(fTop.from, (i, A) => {
    if (i >= fTop.to) return;
    const p = K.lo.pos(i), [u, v] = topUV(p[0], p[2]);
    K.lo.UV[i * 2] = sreg.x + clamp(u, 0, 1) * sreg.w; K.lo.UV[i * 2 + 1] = 1 - (sreg.y + clamp(v, 0, 1) * sreg.h);
    A.ao[i] = 1;
  });

  // ---------------------------------------------------------------------------------- rim lip, bridge, plastron
  paintRect(pg, plR, (u, v, i, j) => {
    // v 0..0.3: underside of the rim + bridge skin; 0.3..1 plastron (planar from below)
    if (v < 0.25) {
      const c = v < 0.1 ? mix(pal.marg[0], pal.marg[1], 0.4) : mix(C('#2e281a'), C('#7a6a40'), smoothstep(0.12, 0.25, v));
      return [c, 1, 0.75, 0];
    }
    const q = (v - 0.25) / 0.75; // 0 rim .. 1 midline
    const x = u;                  // 0 back .. 1 front
    let c = mix(pal.plast[2], pal.plast[0], smoothstep(0, 0.6, q));
    // midline seam + transverse seams (gular, humeral, pectoral, abdominal, femoral, anal) + inframarginals
    const cuts = [0.12, 0.3, 0.52, 0.7, 0.86];
    let seam = q > 0.96 ? 1 : 0;
    for (const cc of cuts) if (Math.abs(x - cc - (1 - q) * 0.03) < 0.008 && q > 0.35) seam = 1;
    if (Math.abs(q - 0.35) < 0.025 && x > 0.15 && x < 0.85) seam = 1;
    if (seam) c = mix(c, C('#8a7246'), 0.7);
    return [c, 1, 0.66, seam ? 0 : 0.3];
  });
  const plreg = pg.reg(plR);
  // rim edge -> lip -> under the overhang -> bridge skin -> plastron (planar from below)
  const UND: [number, number][] = [[1.0, 0], [1.0, -0.014], [0.955, -0.022], [0.88, -0.03], [0.82, -0.075], [0.66, 1], [0.33, 2]];
  const underRings: { pts: V3[]; v: number }[] = [];
  for (const [s, dy] of UND) {
    const pts: V3[] = [];
    for (let j = 0; j <= NA; j++) {
      const th = (j / NA) * TAU, rim = shellPt(th, 1), r = rimR(th) * s;
      const y = dy === 1 ? PLY + 0.004 : dy === 2 ? PLY - 0.006 : dy < -0.05 ? Math.max(PLY + 0.025, rim[1] + dy) : rim[1] + dy;
      pts.push([XA + Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    underRings.push({ pts, v: s });
  }
  const fUnd = K.loftPart(underRings, plR, { end: [XA - 0.02, PLY - 0.012, 0] });
  const RV = [0.0, 0.03, 0.08, 0.14, 0.2];
  K.tag(fUnd.from, (i, A) => {
    if (i >= fUnd.to) return;
    const p = K.lo.pos(i);
    const ringI = Math.floor((i - fUnd.from) / (NA + 1));
    const u = clamp((p[0] + SL / 2) / SL, 0, 1);
    const hw = Math.max(0.02, halfW(clamp((SL / 2 - p[0]) / SL, 0, 1)) * SW * 0.82);
    const v = ringI < RV.length ? RV[ringI] : 0.25 + 0.75 * clamp(1 - Math.abs(p[2]) / hw, 0, 1);
    K.lo.UV[i * 2] = plreg.x + u * plreg.w; K.lo.UV[i * 2 + 1] = 1 - (plreg.y + v * plreg.h);
    A.ao[i] = ringI < 3 ? 0.65 : ringI < 5 ? 0.8 : 0.9;
  });

  // ---------------------------------------------------------------------------------- barnacles
  paintRect(pg, barnR, (u, v) => {
    // v 0 crater .. 1 base; plates around with dark sutures
    const plate = Math.floor(u * 6) % 2;
    let c = v < 0.25 ? pal.barn[2] : mix(pal.barn[0], pal.barn[1], plate * 0.6 + (1 - v) * 0.2);
    if (Math.abs((u * 6) % 1 - 0.5) > 0.42 && v > 0.25) c = pal.barn[2];
    return [c, 1, 0.8, v < 0.25 ? 0 : 0.8];
  });
  for (const [th, s, r] of BARN) {
    const p = shellPt(th, s), up: V3 = [0, 1, 0];
    const rings = [0, 1].map((k) => ({ pts: Kit.ring(add(p, scale(up, k ? r * 0.75 : -0.004)), [1, 0, 0], [0, 0, 1], k ? r * 0.55 : r, k ? r * 0.55 : r, 5), v: k ? 0.25 : 1 }));
    K.loftPart(rings, barnR, { start: add(p, scale(up, r * 0.45)) });
  }

  // ---------------------------------------------------------------------------------- tail
  paintRect(pg, neckR, (u, v) => skinCol(u * 12, v * 8, 1.0));
  K.tube([[-SL / 2 + 0.06, -0.02, 0], [-SL / 2 - 0.02, -0.035, 0], [-SL / 2 - 0.07, -0.05, 0]], (t) => 0.03 * (1 - t * 0.85), 6, neckR, { capEnd: true });
  const body = K.geometry().geo;

  // ---------------------------------------------------------------------------------- head + neck (own pivot)
  const HK = new Kit(pg);
  const NX = SL / 2 - 0.13, HL = 0.3;            // neck base (inside the shell) -> snout
  const headProf = (f: number) => {
    // f 0 neck base .. 1 snout tip: half height / half width / centre y
    const hh = f < 0.4 ? 0.068 - f * 0.03 : f < 0.62 ? 0.056 + (f - 0.4) * 0.07 : 0.0714 - Math.pow((f - 0.62) / 0.38, 2.6) * 0.046;
    const hw = f < 0.4 ? 0.072 - f * 0.04 : f < 0.62 ? 0.056 + (f - 0.4) * 0.03 : 0.0626 - Math.pow((f - 0.62) / 0.38, 2.4) * 0.038;
    const cy = 0.0 + f * 0.035 - Math.pow(Math.max(0, f - 0.85) / 0.15, 2) * 0.012;
    return { hh, hw, cy };
  };
  const HN = 12, HR = 12;
  const hRings: { pts: V3[]; v: number }[] = [];
  for (let k = 0; k <= HR; k++) {
    const f = k / HR, { hh, hw, cy } = headProf(f), x = NX + f * HL;
    const pts: V3[] = [];
    for (let j = 0; j <= HN; j++) {
      const a = (j / HN) * TAU, s = Math.sin(a), co = Math.cos(a);
      // flat crown, rounded cheeks, deep beak / jaw
      const ey = co >= 0 ? Math.pow(co, 0.8) * hh * 0.92 : -Math.pow(-co, 0.9) * hh * 1.06;
      const ex = Math.sign(s) * Math.pow(Math.abs(s), 0.75) * hw;
      pts.push([x, cy + ey, ex]);
    }
    hRings.push({ pts, v: f });
  }
  paintRect(pg, headR, (u, v) => headCol(u, v));
  const fHead = HK.loftPart(hRings, headR, { end: [NX + HL + 0.008, headProf(1).cy - 0.008, 0] });
  const hreg = pg.reg(headR);
  HK.tag(fHead.from, (i, A) => {
    if (i >= fHead.to) return;
    const p = HK.lo.pos(i);
    const f = clamp((p[0] - NX) / HL, 0, 1), { cy } = headProf(f);
    let a = Math.atan2(Math.abs(p[2]), p[1] - cy); // 0 top .. PI bottom
    if (!isFinite(a)) a = 0;
    HK.lo.UV[i * 2] = hreg.x + f * hreg.w; HK.lo.UV[i * 2 + 1] = 1 - (hreg.y + clamp(a / Math.PI, 0, 1) * hreg.h);
  });
  // eyes + heavy upper lids
  paintEye(pg, eyeR, { iris: ['#120a04', '#3a220c', '#6a4418', '#8a6224'], pupil: 0.55, sclera: '#3a3220', irisR: 0.9, limbus: '#0a0604' });
  const ereg = pg.reg(eyeR);
  const EF = 0.68, EX = NX + HL * EF, EY = headProf(EF).cy + 0.024, ER = 0.02;
  for (const s of [-1, 1]) {
    const c: V3 = [EX, EY, s * (headProf(EF).hw * 0.86)];
    const fe = HK.lo.count;
    HK.blob(c, [ER, ER * 0.9, ER * 0.7], eyeR, { seg: 10 });
    HK.tag(fe, (i, A) => {
      const q = sub(HK.lo.pos(i), c);
      HK.lo.UV[i * 2] = ereg.x + clamp(0.5 + q[0] / (2 * ER), 0, 1) * ereg.w;
      HK.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - q[1] / (2 * ER * 0.9), 0, 1) * ereg.h);
      A.eye[i * 4] = c[0]; A.eye[i * 4 + 1] = c[1]; A.eye[i * 4 + 2] = c[2]; A.eye[i * 4 + 3] = 1;
    });
    // lid: a shallow cap over the top of the eye, skin coloured
    const lid: { pts: V3[]; v: number }[] = [];
    for (let k = 0; k < 2; k++) {
      const pts: V3[] = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6, ang = Math.PI * (0.05 + 0.9 * t);
        const rr = ER * (k ? 1.2 : 1.32);
        pts.push([c[0] + Math.cos(ang) * rr * 1.05, c[1] + Math.sin(ang) * rr * (k ? 0.55 : 0.75) + 0.002, c[2] + s * (k ? ER * 0.9 : ER * 0.2)]);
      }
      lid.push({ pts, v: k });
    }
    HK.loftPart(lid, neckR);
  }
  const headGeo = HK.geometry().geo;

  // ---------------------------------------------------------------------------------- flippers
  // airfoil lofted along the span (+z), leading edge +x; top and bottom map to the two halves of the rect so the
  // dark scaled top and the pale underside each get their own paint
  paintRect(pg, flR, (u, v) => flipperCol(u, v, true));
  paintRect(pg, hfR, (u, v) => flipperCol(u, v, false));
  paintRect(pg, clawR, (u, v) => [mix(C('#e8dcb0'), C('#6a5a3a'), v), 1, 0.4, 0]);
  type Seg = { geo: THREE.BufferGeometry; len: number };
  const foil = (rect: typeof flR, t0: number, t1: number, len: number, N: number, chord: (t: number) => number, le: (t: number) => number, thick: (t: number) => number, droop: (t: number) => number, claw = -1): Seg => {
    const FK = new Kit(pg);
    const n = 5; // per side
    const z0 = t0 * len;
    const rings: { pts: V3[]; v: number }[] = [];
    for (let k = 0; k <= N; k++) {
      const t = t0 + (t1 - t0) * (k / N), c = chord(t), x0 = le(t), th = thick(t), z = t * len - z0, y0 = droop(t);
      const pts: V3[] = [];
      // top: LE -> TE, bottom: TE -> LE (duplicated edge points)
      for (let j = 0; j <= n; j++) { const q = j / n; const yy = th * Math.sin(Math.PI * Math.pow(q, 0.6)) * 0.55 * (1 - q * 0.4); pts.push([x0 - q * c, y0 + yy, z]); }
      for (let j = 0; j <= n; j++) { const q = 1 - j / n; const yy = -th * Math.sin(Math.PI * Math.pow(q, 0.6)) * 0.35; pts.push([x0 - q * c, y0 + yy, z]); }
      pts.push([...pts[0]] as V3);
      rings.push({ pts, v: t });
    }
    const reg = pg.reg(rect), NP = 2 * (n + 1) + 1;
    const f = FK.loftPart(rings, rect, { start: null, end: [le(t1) - chord(t1) * 0.3, droop(t1), t1 * len - z0 + 0.004] });
    FK.tag(f.from, (i) => {
      if (i >= f.to) return;
      const rel = i - f.from, ring = Math.floor(rel / NP), j = rel % NP;
      const p = FK.lo.pos(i);
      const t = ring <= N ? t0 + (t1 - t0) * (ring / N) : t1;
      const top = ring > N ? true : j <= n || j === NP - 1;
      const q = ring > N ? 0.3 : j <= n ? j / n : j === NP - 1 ? 0 : 1 - (j - n - 1) / n;
      void p;
      FK.lo.UV[i * 2] = reg.x + clamp(t, 0, 1) * reg.w;
      FK.lo.UV[i * 2 + 1] = 1 - (reg.y + (top ? q * 0.5 : 0.5 + q * 0.5) * reg.h);
    });
    if (claw >= 0) {
      const z = claw * len - z0, x = le(claw) + 0.004;
      FK.cone([x, droop(claw) + thick(claw) * 0.2, z], [0.8, 0.15, 0.4], 0.022, 0.006, clawR, 4);
    }
    return { geo: FK.geometry().geo, len: (t1 - t0) * len };
  };
  const FL = 0.5;
  const fChord = (t: number) => 0.15 * (0.78 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t)) * (1 - Math.pow(t, 3)) + 0.012;
  const fLE = (t: number) => 0.035 - 0.11 * Math.pow(t, 1.5) + 0.03 * Math.sin(Math.PI * t);
  const fThick = (t: number) => 0.036 * (1 - t * 0.8);
  const fDroop = (t: number) => -0.02 * t * t;
  const WR = 0.3;
  const foreIn = foil(flR, 0, WR + 0.02, FL, 3, fChord, fLE, fThick, fDroop);
  const foreOut = foil(flR, WR, 1, FL, 7, fChord, fLE, fThick, fDroop, WR + 0.08);
  const HLn = 0.2;
  const hChord = (t: number) => 0.13 * Math.sqrt(Math.max(0.04, 1 - Math.pow(t, 2.2))) + 0.008;
  const hind = foil(hfR, 0, 1, HLn, 5, hChord, (t) => 0.06 - 0.02 * t, (t) => 0.028 * (1 - t * 0.7), () => 0);

  const parts = (m: FishModel) => {
    const rig = new THREE.Group();
    rig.add(m.mesh);
    const mk = (g: THREE.BufferGeometry) => { const ms = new THREE.Mesh(g, m.material); ms.castShadow = true; ms.customDepthMaterial = m.asset.depthMat; return ms; };
    const neck = new THREE.Object3D();
    neck.position.set(NX + 0.03, 0.0, 0);
    const head = mk(headGeo); head.position.x = -(NX + 0.03);
    neck.add(head); rig.add(neck);
    const fore: { sh: THREE.Object3D; wr: THREE.Object3D; s: number }[] = [];
    const hindL: { sh: THREE.Object3D; s: number }[] = [];
    for (const s of [1, -1]) {
      // fore-flipper: shoulder (flap / sweep / feather) -> wrist (flex)
      const sh = new THREE.Object3D(); sh.rotation.order = 'YXZ';
      sh.position.set(SL * 0.24, -0.035, s * SW * 0.62);
      const a = mk(foreIn.geo); const wr = new THREE.Object3D(); wr.rotation.order = 'YXZ';
      wr.position.z = WR * FL;
      wr.add(mk(foreOut.geo));
      sh.add(a, wr);
      if (s < 0) sh.scale.z = -1;
      rig.add(sh); fore.push({ sh, wr, s });
      // hind flipper: a rudder trailing back and out
      const hs = new THREE.Object3D(); hs.rotation.order = 'YXZ';
      hs.position.set(-SL * 0.36, -0.045, s * SW * 0.42);
      hs.add(mk(hind.geo));
      if (s < 0) hs.scale.z = -1;
      rig.add(hs); hindL.push({ sh: hs, s });
    }
    m.group.add(rig);
    (m as unknown as { turtle: unknown }).turtle = { rig, neck, fore, hind: hindL };
    m.anim.stroke = m.seed * 1.7; m.anim.glide = 0;
  };
  const animate = (m: FishModel, dt: number) => {
    const T = (m as unknown as { turtle?: { rig: THREE.Group; neck: THREE.Object3D; fore: { sh: THREE.Object3D; wr: THREE.Object3D; s: number }[]; hind: { sh: THREE.Object3D; s: number }[] } }).turtle;
    if (!T) return;
    const sp = Math.abs(m.speed);
    // stroke rate rises with speed; the amplitude eases down to a slow glide when idle
    const k = clamp(sp / 2.2, 0, 1);
    m.anim.glide = damp(m.anim.glide ?? 0, 0.45 + 0.55 * k, 2, dt);
    m.anim.stroke = (m.anim.stroke ?? 0) + dt * TAU * (0.32 + 0.3 * k);
    const ph = m.anim.stroke, g = m.anim.glide;
    // skewed phase: a quicker power downstroke, a slower recovery
    const th = ph + 0.38 * Math.sin(ph);
    const turn = m.turnK;
    for (const f of T.fore) {
      // (the far flipper is mirrored in z, so its flap and sweep angles flip sign)
      const flap = (0.12 + 0.72 * Math.cos(th)) * g;        // + tip up
      const sweep = 0.6 + (0.6 * (1 - Math.cos(th)) * 0.5 + 0.15 * Math.sin(th)) * g + turn * f.s * 0.15;
      const feather = -0.55 * Math.sin(th) * g;             // leading edge down on the downstroke
      f.sh.rotation.set(flap * f.s, -sweep * f.s, feather);
      f.wr.rotation.set((0.36 * Math.sin(th) * g - 0.06) * f.s, -0.15 * g * f.s, 0);
    }
    for (const h of T.hind) {
      // rudders: trail back, steer into turns, a lazy paddle in time with the stroke
      const yaw = 1.15 - turn * h.s * 0.35 + 0.08 * Math.sin(th + 1.2) * g;
      h.sh.rotation.set((-0.25 + 0.12 * Math.sin(th + 2) * g) * h.s, -yaw * h.s, 0.55);
    }
    // the body lifts a touch on each downstroke; the head bobs and counters
    T.rig.position.y = -0.012 * Math.cos(th) * g;
    T.rig.rotation.z = 0.025 * Math.sin(th) * g;
    T.neck.rotation.z = -0.04 * Math.sin(th - 0.6) * g + 0.03;
    T.neck.rotation.y = clamp(-m.lookYaw * 0.4, -0.2, 0.2);
  };
  const L = 1.25;
  return kitAsset('sea_turtle', body, pg, {
    length: L, mouth: [NX + HL + 0.005, headProf(1).cy - 0.01, 0], eye: [EX, EY, headProf(EF).hw * 0.86], eyeR: ER,
    amp: 0, freq: 0.5, parts, animate, clearcoat: 0.18, clearcoatRough: 0.55, palette: 24,
    anchors: { back: [0, RIMY + DOME + 0.04, 0] },
    uwo: { rim: 0.12, sss: [0.85, 0.82, 0.7], sssK: 0.3 },
  });
}

// ---------------------------------------------------------------------------------------------- skin painters
/** neck / tail skin: small regular scales, dark centres, pale edges, transverse folds */
function skinCol(x: number, y: number, k: number): [RGB, number, number, number] {
  const h = hexCell(x, y, 1);
  let c = h.edge < 0.12 ? pal.skinEdge : mix(pal.skinMid, pal.skinDk, 0.25 + pick(h.id, 4) * 0.5);
  if (h.edge < 0.12 && ((h.id & 3) === 0)) c = shade(c, 0.8);
  return [shade(c, k), 1, 0.75, h.edge < 0.12 ? 0 : 0.5];
}

// hand-placed head shields in (f along the head 0 neck .. 1 snout, a = angle 0 crown .. 1 throat)
const HS: [number, number][] = [
  [0.6, 0.03], [0.72, 0.02], [0.82, 0.04], [0.9, 0.1],          // frontoparietal, frontal, the long prefrontal pair, snout
  [0.5, 0.06], [0.52, 0.17], [0.64, 0.14], [0.76, 0.16],        // parietals, supraoculars
  [0.84, 0.24], [0.9, 0.3],                                     // loreal, nasal
  [0.56, 0.3], [0.56, 0.4], [0.58, 0.5], [0.62, 0.58],          // four postorbitals behind the eye
  [0.48, 0.28], [0.47, 0.42], [0.49, 0.56], [0.53, 0.68],       // temporals
  [0.42, 0.14], [0.4, 0.32], [0.4, 0.5], [0.43, 0.66],          // nape
  [0.6, 0.76], [0.7, 0.72], [0.66, 0.88], [0.78, 0.86], [0.52, 0.86], // jaw shields
];
const HSW = HS.map(([f, a]) => (a < 0.2 && f > 0.55 ? 0.012 : 0));
function headCol(f: number, a: number): [RGB, number, number, number] {
  // beak (horn) at the snout below the nostril line, the tomium dark
  const beakEdge = 0.86 + (a - 0.55) * 0.18;
  if (f > beakEdge && a > 0.42) {
    const cut = Math.abs(a - 0.62) < 0.035;
    let c = mix(C('#e2d4a0'), C('#a88c52'), smoothstep(0.42, 1, a));
    if (cut) c = C('#2a1c0c');
    return [c, 1, 0.45, cut ? 0 : 0.3];
  }
  if (f < 0.34) {
    // neck: wrinkled pale skin with scattered dark scales
    const [c, al, ro, h] = skinCol(f * 34, a * 12, 0.95 + 0.1 * a);
    const fold = Math.abs(((f * 9) % 1) - 0.5) < 0.05 && a < 0.8;
    return [fold ? shade(c, 0.72) : a > 0.7 ? mix(c, pal.skinPale, 0.6) : c, al, ro, h];
  }
  const T = tiles(f, a, HS, HSW, 1, 0.55);
  let c = mix(C('#4e3c1c'), C('#2c200e'), pick(T.i, 2) * 0.7);
  if (a > 0.74) c = mix(c, C('#c8b880'), 0.5);
  // shields: dark, lit centres; thin pale yellow seams
  c = shade(c, 0.92 + 0.18 * Math.min(1, T.seam / 0.03));
  const seam = T.seam < 0.0055;
  if (seam) c = C('#d4c488');
  // nostril
  if (Math.hypot(f - 0.95, (a - 0.32) * 0.5) < 0.012) c = C('#120c06');
  return [c, 1, 0.55, seam ? 0 : 0.5];
}
/** flipper paint: u along the span (root -> tip), v 0..0.5 top (LE -> TE), 0.5..1 underside (LE -> TE) */
function flipperCol(u: number, v: number, fore: boolean): [RGB, number, number, number] {
  const top = v < 0.5, q = top ? v / 0.5 : (v - 0.5) / 0.5;
  // large plates along the leading edge, smaller toward the trailing edge and the tip
  const span = fore ? 0.5 : 0.2, chord = fore ? 0.15 : 0.13;
  const size = (0.036 - 0.014 * q) * (1 - u * 0.3) * (fore ? 1 : 0.9);
  const h = hexCell(u * span, q * chord, size);
  if (!top) {
    let c = mix(C('#d8c48e'), C('#a8925c'), q * 0.6 + u * 0.2);
    if (h.edge < 0.1) c = shade(c, 0.84);
    return [c, 1, 0.7, 0];
  }
  let c = mix(C('#4a3a1a'), C('#22180a'), q * 0.4 + pick(h.id, 5) * 0.35);
  if (u < 0.1) c = mix(C('#8a7e52'), c, u / 0.1);
  // the trailing margin is a pale scalloped band
  if (q > 0.9) c = mix(c, C('#d8cc96'), 0.75);
  c = shade(c, 0.92 + 0.16 * Math.min(1, h.edge / 0.3));
  const seam = h.edge < 0.09;
  if (seam) c = C('#d8c88c');
  return [c, 1, 0.62, seam ? 0 : 0.6];
}
