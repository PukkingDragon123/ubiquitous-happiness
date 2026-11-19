// Stingrays (Dasyatidae) for the seabed: a thin pectoral disc lofted as contour rings round a raised body hump
// (so the margins undulate in waves from nose to tail, swim mode 2), raised eyes with the spiracles right behind
// them, small pelvic lobes either side of the tail root, and the tail with its serrated venom barb.
//   stingray       honeycomb (leopard) whipray: a rhomboid sandy disc netted with a dark brown reticulation that
//                  breaks into spots at the margins, a band of pale tubercles down the back, a long banded whip
//   stingray_blue  bluespotted ribbontail: an oval olive-tan disc studded with electric-blue spots, golden eyes,
//                  two blue stripes down a shorter tail with a dark-edged fin fold under it
// Top +y, nose +x. Ambient code tilts the model toward the camera to show its back.
import { Kit } from './kit';
import { Page, paintEye, C, mix, shade } from './page';
import type { V3 } from '../gfx/loft';
import type { SpeciesAsset } from './model';
import type { RGB } from '../gfx/px';
import { kitAsset, paintRect, hexCell, pick, cells } from './kitutil';
import { smoothstep } from './curve';
import { clamp } from '../core/math';

const TAU = Math.PI * 2;

interface RayDef {
  name: string;
  DL: number; DW: number;       // disc length, half width
  sq: number;                   // planform squareness (1.5 rhomboid .. 2 oval)
  snout: number;                // snout point
  cx: number;                   // body hump centre (fraction from the nose)
  hump: number;                 // hump height
  tail: number;                 // tail length behind the disc
  tailR: number;
  barbAt: number;               // barb position along the tail (0..1)
  fold?: boolean;               // ventral tail fin fold (ribbontail)
  top: (x: number, z: number, s: number) => RGB;
  tailCol: (t: number, top: boolean) => RGB;
  belly: [string, string];
  eye: { iris: string[]; sclera: string };
  amp: number; freq: number;
}

function buildRay(d: RayDef): SpeciesAsset {
  const pg = new Page(512, 256), K = new Kit(pg);
  const topR = pg.alloc(224, 224), botR = pg.alloc(96, 96), tailR = pg.alloc(96, 24), eyeR = pg.alloc(24, 24), barbR = pg.alloc(8, 24), foldR = pg.alloc(64, 16);
  const { DL, DW } = d;
  const HX = DL / 2 - d.cx * DL;   // hump centre x (nose at +DL/2)
  // planform: superellipse round the hump centre with a pointed snout and a squared-off rear edge
  const rimR = (th: number) => {
    const c = Math.cos(th), s = Math.sin(th);
    const front = c > 0 ? d.cx * DL : (1 - d.cx) * DL * 0.98;
    const r = 1 / Math.pow(Math.pow(Math.abs(c) / front, d.sq) + Math.pow(Math.abs(s) / DW, d.sq), 1 / d.sq);
    const sn = c > 0 ? d.snout * Math.pow(Math.max(0, c), 24) * DL : 0;
    // the rear margin tucks in round the tail root
    const rear = c < 0 ? 1 - 0.12 * Math.pow(Math.max(0, -c), 10) : 1;
    return r * rear + sn;
  };
  const prof = (s: number) => d.hump * Math.pow(Math.max(0, 1 - s * s), 1.4) + 0.004 * (1 - s);
  const pt = (th: number, s: number, bottom = false): V3 => {
    const r = rimR(th) * s, x = HX + Math.cos(th) * r, z = Math.sin(th) * r;
    // the eyes sit on a raised head; the disc thins to a knife edge
    const y = bottom ? -0.25 * d.hump * Math.pow(Math.max(0, 1 - s * s), 1.2) - 0.002 : prof(s) + 0.002;
    return [x, y, z];
  };
  const XMIN = HX - rimR(Math.PI) - 0.01, XMAX = HX + rimR(0) + 0.01;
  const ZMAX = DW + 0.01;
  const EYE: V3 = [HX + d.cx * DL * 0.42, prof(0.25) + 0.006, DW * 0.17];
  // ------------------------------------------------------------------------------------------ paint
  paintRect(pg, topR, (u, v) => {
    const x = XMIN + u * (XMAX - XMIN), z = -ZMAX + v * 2 * ZMAX;
    const th = Math.atan2(z, x - HX), s = Math.hypot(x - HX, z) / Math.max(1e-6, rimR(th));
    let c = d.top(x, z, Math.min(1.2, s));
    // spiracles: dark crescents right behind each eye; eye mounds slightly paler
    for (const sz of [-1, 1]) {
      const ex = EYE[0], ez = sz * EYE[2];
      const qs = Math.hypot((x - (ex - 0.045 * DL / 0.7)) / 1.25, z - ez * 1.05);
      if (qs < 0.016) c = qs < 0.011 ? C('#1a120c') : shade(c, 1.15);
      const qe = Math.hypot(x - ex, z - ez);
      if (qe < 0.03) c = shade(c, 0.9 + qe * 4);
    }
    return [c, 1, 0.55, s < 0.95 ? 0.2 : 0];
  });
  paintRect(pg, botR, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    let c = mix(C(d.belly[0]), C(d.belly[1]), smoothstep(0.6, 1, r));
    // gill slits (5 pairs) and the mouth line
    const gx = u - 0.58, gz = Math.abs(v - 0.5);
    if (gz > 0.08 && gz < 0.14 && gx > -0.12 && gx < 0.06 && ((Math.floor((gx + 0.12) * 50) % 2) === 0) && Math.abs(gz - 0.11) < 0.012) c = shade(c, 0.7);
    if (Math.abs(u - 0.74) < 0.008 && gz < 0.07) c = shade(c, 0.6);
    return [c, 1, 0.5, 0];
  });
  // ------------------------------------------------------------------------------------------ disc
  const NA = 34, KS = [0.18, 0.4, 0.6, 0.76, 0.88, 0.96, 1.0];
  const rings: { pts: V3[]; v: number }[] = [];
  for (const s of KS) { const pts: V3[] = []; for (let j = 0; j <= NA; j++) pts.push(pt((j / NA) * TAU, s)); rings.push({ pts, v: s }); }
  for (const s of [0.9, 0.6, 0.3]) { const pts: V3[] = []; for (let j = 0; j <= NA; j++) pts.push(pt((j / NA) * TAU, s, true)); rings.push({ pts, v: 2 - s }); }
  const nTop = KS.length;
  const f0 = K.loftPart(rings, topR, { start: [HX, prof(0) + 0.002, 0], end: [HX, -0.25 * d.hump - 0.002, 0] });
  const treg = pg.reg(topR), breg = pg.reg(botR);
  const NP = NA + 1, nRingV = rings.length * NP;
  K.tag(f0.from, (i) => {
    if (i >= f0.to) return;
    const rel = i - f0.from, p = K.lo.pos(i);
    // ring verts first (ring-major), then the two pole fans (top, bottom)
    const top = rel < nRingV ? Math.floor(rel / NP) < nTop : rel < nRingV + NA;
    if (top) {
      K.lo.UV[i * 2] = treg.x + clamp((p[0] - XMIN) / (XMAX - XMIN), 0, 1) * treg.w;
      K.lo.UV[i * 2 + 1] = 1 - (treg.y + clamp((p[2] + ZMAX) / (2 * ZMAX), 0, 1) * treg.h);
    } else {
      K.lo.UV[i * 2] = breg.x + clamp((p[0] - XMIN) / (XMAX - XMIN), 0, 1) * breg.w;
      K.lo.UV[i * 2 + 1] = 1 - (breg.y + clamp((p[2] + ZMAX) / (2 * ZMAX), 0, 1) * breg.h);
    }
  });
  // ------------------------------------------------------------------------------------------ eyes
  paintEye(pg, eyeR, { iris: d.eye.iris, pupil: 0.42, sclera: d.eye.sclera, irisR: 0.84, slit: -0.6 });
  const ereg = pg.reg(eyeR), er = 0.02;
  for (const s of [-1, 1]) {
    const c: V3 = [EYE[0], EYE[1], s * EYE[2]];
    const fe = K.lo.count;
    K.blob(c, [er, er * 0.85, er * 0.9], eyeR, { seg: 10 });
    K.tag(fe, (i, A) => {
      const q = [K.lo.pos(i)[0] - c[0], K.lo.pos(i)[1] - c[1], K.lo.pos(i)[2] - c[2]];
      // eyes look up and out: map the top-outer hemisphere
      K.lo.UV[i * 2] = ereg.x + clamp(0.5 + q[0] / (2 * er), 0, 1) * ereg.w;
      K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - (q[1] * 0.7 + q[2] * s * 0.7) / (2 * er), 0, 1) * ereg.h);
      A.eye[i * 4] = c[0]; A.eye[i * 4 + 1] = c[1]; A.eye[i * 4 + 2] = c[2]; A.eye[i * 4 + 3] = 1;
    });
  }
  // ------------------------------------------------------------------------------------------ pelvic lobes
  const RX = HX - rimR(Math.PI);
  for (const s of [-1, 1]) {
    const lob: { pts: V3[]; v: number }[] = [];
    for (let k = 0; k <= 3; k++) {
      const f = k / 3, x = RX + 0.05 - f * 0.11, w = 0.045 * Math.sin(Math.PI * (0.15 + f * 0.85)) + 0.005;
      lob.push({ pts: Kit.ring([x, -0.004, s * (0.03 + w * 0.9)], [0, 0, 1], [0, 1, 0], w, 0.006, 6), v: f });
    }
    // the lobes peek out behind the disc: planar top-view uv into the disc paint (sandy, past the rim)
    const fl = K.loftPart(lob, topR, { end: [RX - 0.065, -0.004, s * 0.035] });
    K.tag(fl.from, (i) => {
      if (i >= fl.to) return;
      const p = K.lo.pos(i);
      K.lo.UV[i * 2] = treg.x + clamp((p[0] - XMIN) / (XMAX - XMIN), 0, 1) * treg.w;
      K.lo.UV[i * 2 + 1] = 1 - (treg.y + clamp((p[2] + ZMAX) / (2 * ZMAX), 0, 1) * treg.h);
    });
  }
  // ------------------------------------------------------------------------------------------ tail + barb
  paintRect(pg, tailR, (u, v) => { const top = v < 0.5; return [shade(d.tailCol(u, top), top ? 1 : 0.9), 1, 0.5, 0]; });
  paintRect(pg, barbR, (u, v) => [mix(C('#f4ecd8'), C('#8a7a5a'), v), 1, 0.35, 0]);
  const tp: V3[] = [];
  const T0 = RX + 0.05, TL = d.tail;
  for (let i = 0; i <= 12; i++) { const f = i / 12; tp.push([T0 - f * TL, 0.006 - f * 0.01, 0]); }
  const ft = K.lo.count;
  K.tube(tp, (t) => d.tailR * Math.pow(1 - t, 1.25) + 0.0022, 8, tailR, { tentacle: false, capEnd: true });
  K.tag(ft, (i, A) => {
    const p = K.lo.pos(i), f = clamp((T0 - p[0]) / TL, 0, 1);
    A.swim[i * 4 + 2] = f;
    K.lo.UV[i * 2] = pg.reg(tailR).x + f * pg.reg(tailR).w;
    K.lo.UV[i * 2 + 1] = 1 - (pg.reg(tailR).y + (p[1] > 0.006 - f * 0.01 ? 0.25 : 0.75) * pg.reg(tailR).h);
  });
  // serrated venom barb on top of the tail, lying back
  const bx = T0 - d.barbAt * TL, by = 0.006 - d.barbAt * 0.01 + d.tailR * Math.pow(1 - d.barbAt, 1.25) * 0.8;
  const fb = K.lo.count;
  K.cone([bx, by, 0], [-1, 0.12, 0], 0.075 * DL / 0.7, 0.005, barbR, 4);
  K.cone([bx - 0.012, by + 0.002, 0], [-1, 0.16, 0.05], 0.05 * DL / 0.7, 0.004, barbR, 3);
  K.tag(fb, (i, A) => { A.swim[i * 4 + 2] = d.barbAt; });
  if (d.fold) {
    // ribbontail: a fin fold under the rear half of the tail
    paintRect(pg, foldR, (u, v) => [mix(C('#5a4a2a'), C('#141210'), smoothstep(0.4, 1, v)), v > 0.92 ? 0 : 1, 0.5, 0]);
    const grid: V3[][] = [];
    for (let k = 0; k <= 1; k++) {
      const row: V3[] = [];
      for (let j = 0; j <= 7; j++) {
        const f = 0.4 + (j / 7) * 0.58, x = T0 - f * TL, y = 0.006 - f * 0.01;
        const h = 0.028 * Math.sin(Math.PI * (j / 7)) * (1 - f * 0.3);
        row.push([x, y - k * h, 0]);
      }
      grid.push(row);
    }
    K.sheetPart(grid, foldR, 0, (i, A, u) => { A.swim[i * 4 + 2] = 0.4 + u * 0.58; });
  }
  const { geo } = K.geometry();
  const L = DL + TL;
  return kitAsset(d.name, geo, pg, {
    length: L, mouth: [XMAX - 0.04, -0.02, 0], eye: EYE, eyeR: er,
    mode: 2, shape: [XMAX, DL, 1.0, DW], shape2: [2, 4, 0.0, 0.05], amp: d.amp, freq: d.freq, freqK: 0.6,
    clearcoat: 0.25, clearcoatRough: 0.45, palette: 20,
    uwo: { rim: 0.2, sss: [0.9, 0.85, 0.75], sssK: 0.4 },
  });
}

// ---------------------------------------------------------------------------------------------- species
/** honeycomb whipray: sandy disc netted in dark brown, the net breaking into spots toward the margin */
export const stingrayHoneycomb = () => buildRay({
  name: 'stingray', DL: 0.7, DW: 0.38, sq: 1.6, snout: 0.05, cx: 0.4, hump: 0.07, tail: 0.95, tailR: 0.02, barbAt: 0.22,
  amp: 0.035, freq: 0.55,
  belly: ['#f6f2e8', '#d8d0c0'],
  eye: { iris: ['#2a2010', '#6a5a30', '#a89058', '#d8c890'], sclera: '#3a3428' },
  top: (x, z, s) => {
    const sand = mix(C('#c9a777'), C('#a88454'), smoothstep(0.3, 0.95, s) * 0.5);
    let c = sand;
    if (s > 1) return C('#a88454');
    // reticulation: a dark brown net of irregular polygons (leopard-like), finer toward the margins, breaking up
    // into separate spots near the edge
    // (fixed cell sizes per zone: a size that varied with s would slide the lattice and moire into rings)
    const h = cells(x + 2, z + 2, s < 0.8 ? 0.044 : 0.03, 0.8, s < 0.8 ? 3 : 4);
    if (s < 0.7) { if (h.seam < 0.12) c = mix(C('#462a14'), C('#5a3a1c'), pick(h.id, 1) * 0.6); else if (h.d < 0.18 && s < 0.55) c = mix(c, C('#b08a5a'), 0.6); }
    else if (s < 0.8) { if (h.seam < 0.11 && pick(h.id, 4) < 0.75) c = C('#4e3218'); }
    else if (h.d < 0.3 && s < 0.96) c = C('#56381c');
    // the pale rim
    if (s > 0.96) c = mix(c, C('#d8c09a'), 0.6);
    // a band of pale tubercles down the middle of the back
    if (Math.abs(z) < 0.018 && s < 0.55 && x < 0.08) {
      const b = hexCell(x * 1.0, z, 0.016);
      if (b.d < 0.5) c = C('#e8d8b0');
    }
    return c;
  },
  tailCol: (t, top) => {
    // sandy and netted to the barb, then dark / pale banded whip
    if (t < 0.24) return top ? (Math.floor(t * 60) % 3 === 0 ? C('#4e3218') : C('#b89466')) : C('#e8e0d0');
    const band = Math.floor((t - 0.24) * 26) % 2;
    return band ? C('#1e1610') : C('#d6ccb4');
  },
});

// the blue spots on the ribbontail: a jittered lattice of hand-tuned sizes
const BLUE_GRID = 0.042;
function blueSpot(x: number, z: number, s: number): number {
  const gx = Math.floor(x / BLUE_GRID), gz = Math.floor(z / BLUE_GRID);
  let best = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const id = (gx + i) * 131 + (gz + j) * 7;
    if (pick(id, 9) < 0.18) continue;
    const cx = (gx + i + 0.25 + pick(id, 1) * 0.5) * BLUE_GRID, cz = (gz + j + 0.25 + pick(id, 2) * 0.5) * BLUE_GRID;
    const r = (0.006 + pick(id, 3) * 0.009) * (1 - 0.35 * smoothstep(0.6, 1, s));
    best = Math.min(best, Math.hypot(x - cx, z - cz) / r);
  }
  return best;
}
/** bluespotted ribbontail: oval olive-tan disc, electric-blue spots, golden eyes */
export const stingrayBlue = () => buildRay({
  name: 'stingray_blue', DL: 0.72, DW: 0.33, sq: 2.0, snout: 0.0, cx: 0.42, hump: 0.07, tail: 0.68, tailR: 0.024, barbAt: 0.4, fold: true,
  amp: 0.03, freq: 0.6,
  belly: ['#f2f0e6', '#cfd2cc'],
  eye: { iris: ['#3a2a08', '#8a6a18', '#e0b040', '#ffe080'], sclera: '#4a4028' },
  top: (x, z, s) => {
    let c = mix(C('#b49a52'), C('#8c7438'), smoothstep(0.0, 0.9, s) * 0.7);
    if (s > 1) return C('#6a5628');
    // darker olive saddle over the body
    if (s < 0.45) c = mix(c, C('#7e6a34'), 0.35);
    const q = blueSpot(x, z, s);
    if (q < 1) c = q < 0.55 ? C('#68d8ff') : C('#2a8ae0');
    else if (q < 1.25) c = shade(c, 0.82);
    if (s > 0.95) c = mix(c, C('#3a6aa8'), 0.5);
    return c;
  },
  tailCol: (t, top) => {
    if (!top) return C('#d8d0b8');
    // two bright blue stripes along the upper sides
    return t < 0.95 ? (Math.floor(t * 40) % 5 === 0 ? C('#9a8448') : C('#2a8ae0')) : C('#1a1410');
  },
});
