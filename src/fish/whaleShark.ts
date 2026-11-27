// The WHALE SHARK (boss, v8) and its REMORAS, on the lofted fish builder.
//
// Whale shark (Rhincodon typus): a broad, flat, blunt head with a huge terminal mouth right across the front, tiny eyes
// set low at its corners, three long ridges down each side of the back (the lowest runs out into the keel of the tail
// stock), five tall gill slits, big sickle pectorals, a tall heterocercal tail. Blue-grey above, white below, and the
// famous checkerboard: pale vertical stripes and the ridge lines making a grid with a white spot in every cell, smaller
// and denser spots over the head. Matte skin, no scales painted (the dermal denticles are far too small to read).
//
// Remora (sharksucker, Echeneis naucrates): slender, a flat head carrying the striped suction disc on top, a jutting
// lower jaw, a black stripe edged white along each flank. They ride the whale shark and swarm off it as minions.
//
// Authored at true size: the whale shark is 12 m long, a remora 0.7 m.
import type { FishSpec, PaintCtx } from './builder';
import { C, mix, shade, smoothstep, hash2 } from './builder';
import { grad, dmix, paintSwatch } from './page';
import { cells } from './kitutil';
import type { RGB } from '../gfx/px';

const TAU = Math.PI * 2;
/** around-angle folded to one side: 0 dorsal midline .. PI belly midline */
const fold = (a: number) => Math.min(a, TAU - a);

// the three ridges on each side: angle from the dorsal midline (rad), height, where they run (t)
const RIDGES: [number, number, number, number][] = [
  [0.36, 0.046, 0.1, 0.9],
  [0.78, 0.04, 0.14, 0.95],
  [1.2, 0.036, 0.18, 1.0],
];
// the five gill slits (t) and how far up / down each one reaches (yn)
const GILLS: [number, number, number][] = [[0.152, 0.6, -0.5], [0.172, 0.62, -0.52], [0.192, 0.62, -0.52], [0.212, 0.58, -0.48], [0.232, 0.5, -0.42]];

const BACK = grad(['#222b36', '#2a3440', '#323e4c', '#3a4858', '#445466'], 10);
const BELLY = grad(['#f4f2ea', '#e6e4dc', '#d2d4d0', '#bcc2c4'], 8);
const SPOT = C('#eef0e8'), SPOT2 = C('#d6dcd8'), STRIPE = C('#b8c4c8'), SLIT = C('#0c1016'), SLITLIP = C('#6a7a88');

/** the white belly line (yn) at t: low and level along the body, rising a little round the jaw */
const bellyLine = (t: number) => -0.32 + 0.18 * (1 - smoothstep(0.02, 0.14, t)) - 0.08 * smoothstep(0.7, 1, t);

function wsPaint(c: PaintCtx): RGB {
  const { t, yn } = c, L = c.L, aa = fold(c.a);
  const bl = bellyLine(t);
  let col = BACK(Math.max(0, Math.min(1, (0.95 - yn) / 1.25)), c.px, c.py);
  // the countershade boundary: one blended band, then white
  if (yn < bl) col = BELLY(Math.max(0, Math.min(1, (bl - yn) * 1.2)), c.px, c.py);
  else if (yn < bl + 0.07) col = dmix(col, BELLY(0, 0, 0), 0.5, c.px, c.py);
  const dark = yn > bl + 0.07;
  // ridges: a lit crest line with a shadow just under it
  for (const [ar, , t0, t1] of RIDGES) {
    if (t < t0 || t > t1) continue;
    const d = aa - ar;
    if (Math.abs(d) < 0.026) col = shade(col, 1.2);
    else if (d > 0.026 && d < 0.07) col = shade(col, 0.82);
  }
  if (dark) {
    if (t < 0.135) {
      // the head: small, dense white spots, no stripes
      const q = cells(c.X * 1.0, c.Y + (c.Z > 0 ? 0 : 0.37), 0.02 * L, 0.55, 11);
      if (q.d < 0.3) col = q.id % 5 === 0 ? SPOT2 : SPOT;
    } else if (!(t > 0.14 && t < 0.25 && Math.abs(c.side) > 0.3 && yn < 0.66)) {
      // the checkerboard: pale vertical bars (gently wavy) and the ridge lines between rows of white spots
      const pitch = (0.044 + 0.01 * smoothstep(0.5, 1, t)) * L;
      const xx = c.X + Math.sin(c.Y / L * 30) * 0.004 * L;
      const fr = ((xx / pitch) % 1 + 1) % 1;
      const bar = fr < 0.085 && t < 0.92;
      // spot rows sit between the ridges (and two rows below the lowest); each spot nudged a little off the grid
      const rows = [0.16, 0.56, 0.98, 1.36, 1.7];
      let spot = false;
      const ci = Math.floor(xx / pitch);
      rows.forEach((rr, ri) => {
        const h1 = hash2(ci, ri, 5), h2 = hash2(ci, ri, 9);
        const cx = (ci + 0.56 + (h1 - 0.5) * 0.22) * pitch;
        const dy = (aa - rr - (h2 - 0.5) * 0.1) * Math.max(0.05, Math.hypot(c.Y, c.Z)), dx = xx - cx;
        const R = 0.0098 * L * (t > 0.85 ? 0.75 : 1) * (0.8 + h2 * 0.4) * (ri === 4 ? 0.8 : 1);
        if (Math.hypot(dx, dy) < R) spot = true;
      });
      // a scatter of smaller spots in the bars' gaps low on the flank
      if (!spot && yn < 0.1) { const q = cells(c.X, c.Y + (c.Z > 0 ? 0 : 0.21), 0.028 * L, 0.6, 23); if (q.d < 0.2) spot = true; }
      if (spot) col = SPOT;
      else if (bar && yn > bl + 0.12) col = mix(col, STRIPE, 0.75);
    }
  }
  // the gill slits: tall dark curved slots with a lit trailing lip
  if (Math.abs(c.side) > 0.25) for (const [gt, up, dn] of GILLS) {
    if (yn > up || yn < dn) continue;
    const span = yn >= 0 ? yn / up : yn / dn;
    const dt = (t - gt + 0.006 * span * span) * 1000;
    if (dt > -1.6 && dt < 1.6) col = SLIT;
    else if (dt >= 1.6 && dt < 4.2) col = mix(col, SLITLIP, 0.45);
  }
  return col;
}

/** pale spots on the fins too (they carry the pattern) */
const finSpots = (_u: number, v: number, _c: RGB, i: number, j: number): RGB | null => {
  const gi = Math.floor(i / 12), gj = Math.floor(j / 12);
  const cx = gi * 12 + 3 + hash2(gi, gj, 3) * 6, cy = gj * 12 + 3 + hash2(gi, gj, 4) * 6;
  if (hash2(gi, gj, 7) < 0.7 && Math.hypot(i - cx, j - cy) < 1.9 && v > 0.12 && v < 0.85) return C('#dfe4de');
  return null;
};

export const whaleShark: FishSpec = {
  name: 'whaleShark', L: 12, body: 0.84, page: [1024, 512], bodyH: 256, rings: 72, seg: 120,
  top: [[0, 0.0], [0.004, 0.022], [0.02, 0.032], [0.06, 0.04], [0.12, 0.056], [0.22, 0.074], [0.34, 0.086], [0.48, 0.084], [0.62, 0.068], [0.76, 0.045], [0.9, 0.028], [1, 0.022]],
  bot: [[0, 0.0], [0.004, 0.02], [0.02, 0.028], [0.06, 0.037], [0.12, 0.054], [0.24, 0.07], [0.38, 0.074], [0.52, 0.066], [0.66, 0.048], [0.8, 0.03], [1, 0.019]],
  wid: [[0, 0.0], [0.006, 0.058], [0.025, 0.082], [0.07, 0.096], [0.16, 0.1], [0.3, 0.098], [0.46, 0.086], [0.62, 0.064], [0.78, 0.042], [0.9, 0.032], [1, 0.028]],
  cy: [[0, -0.004], [0.1, 0], [1, 0.006]],
  sq: [[0, 2.8], [0.1, 2.5], [0.4, 2.15], [0.85, 2.3], [1, 2.7]],
  noseRound: 0.004, tailCap: 0.5,
  bump: (t, a) => {
    const aa = fold(a);
    let k = 0;
    for (const [ar, h, t0, t1] of RIDGES) {
      const on = smoothstep(t0, t0 + 0.08, t) * (1 - smoothstep(t1 - 0.06, t1 + 0.001, t));
      k += h * on * Math.exp(-(((aa - ar) / 0.1) ** 2));
    }
    return k;
  },
  mouth: { t: 0.085, th: [[0, 0.5], [0.085, 0.54]], open: 0.95, idle: 0.06, lip: 0.07, lipCol: '#8e9aa2', interior: '#3a0c16', crease: '#10141a' },
  eye: { t: 0.1, y: 0.02, r: 0.0062, fwd: 0.12, up: 0.0, lid: 'none', bulge: 0.55, socket: 1,
    paint: { iris: ['#06080a', '#141c22', '#28343c', '#4a5862'], pupil: 0.6, ring: '#8aa0aa', sclera: '#2a3036', irisR: 0.84 } },
  rough: 0.92, sheen: 0, normal: 1.2,
  paint: wsPaint,
  fins: [
    { type: 'dorsal', t0: 0.49, t1: 0.62, h: [[0, 0.04], [0.25, 0.088], [0.55, 0.082], [1, 0.012]], sweep: 0.62, lean: [[0, 0], [0.4, 0.06], [1, 0.45]], col: ['#323e4c', '#2a3440', '#222b36'], rays: 0, opaque: true, thick: 0.004, px: [128, 64], over: finSpots },
    { type: 'dorsal', t0: 0.79, t1: 0.845, h: [[0, 0.018], [0.4, 0.03], [1, 0.006]], sweep: 0.6, col: ['#323e4c', '#2a3440'], rays: 0, opaque: true, thick: 0.003, px: [48, 32] },
    { type: 'anal', t0: 0.8, t1: 0.845, h: [[0, 0.016], [0.4, 0.026], [1, 0.006]], sweep: 0.6, col: ['#3a4858', '#2a3440'], rays: 0, opaque: true, thick: 0.003, px: [48, 32] },
    { type: 'caudal', shape: 'heterocercal', t0: 0.97, len: 0.17, span: 0.155, col: ['#34404e', '#2a3440', '#222b36'], rays: 0, opaque: true, thick: 0.006, px: [128, 112],
      ext: (u) => (u < 0.5 ? 0.5 + 0.5 * Math.pow(1 - 2 * u, 0.7) : 0.42 + 0.36 * Math.pow(2 * u - 1, 0.9)), over: finSpots },
    { type: 'pectoral', t: 0.27, y: -0.7, len: 0.155, baseLen: 0.07, span: 0.34, angle: 26, shape: 'pointed', col: ['#3a4858', '#2a3440', '#222b36'], rays: 0, opaque: true, thick: 0.01, out: 0.5, flutter: 0.025, px: [96, 64], over: finSpots },
    { type: 'pelvic', t: 0.6, len: 0.05, angle: 50, shape: 'pointed', col: ['#3a4858', '#2a3440'], rays: 0, opaque: true, thick: 0.004, out: 0.35, flutter: 0.02 },
  ],
  extras: (b) => {
    // GILL FLAPS: the trailing lip of every slit is its own thin flap that pumps open and shut (fin flutter, staggered
    // phase front to back), so the gills visibly breathe
    const L = b.L;
    const rect = b.pg.alloc(16, 32);
    paintSwatch(b.pg, rect, ['#3e4c5c', '#34404e', '#2a3440', '#10141a'], 0.9);
    GILLS.forEach(([gt, up, dn], k) => {
      for (const side of [1, -1]) {
        const rows = 5, grid: [number, number, number][][] = [];
        for (let i = 0; i < rows; i++) {
          const v = i / (rows - 1);
          const yf = up + (dn - up) * v;
          const span = yf >= 0 ? yf / up : yf / dn;
          const tt = gt - 0.006 * span * span + 0.0015;
          const y = b.yAt(tt, yf * 0.98);
          const a = b.angleAtY(tt, y);
          const p0 = b.surf(tt, a), p1 = b.surf(tt + 0.0065, a);
          const out = 0.0022 * L;
          grid.push([[p0[0], p0[1], (p0[2] + out * 0.4) * side], [p1[0], p1[1], (p1[2] + out) * side]]);
        }
        b.sheetPart(grid, rect, 0.0015 * L, (i, A, u) => {
          A.ao[i] = 0.85;
          A.swim[i * 4] = 0.55 * u; A.swim[i * 4 + 1] = k * 0.5 + (side > 0 ? 0 : 1.2);
        });
      }
    });
    // the mouth's corner pads (the filter plates show as pale bars just inside the lips)
    const pad = b.pg.alloc(16, 16);
    paintSwatch(b.pg, pad, ['#d0b8b0', '#a88a86', '#6a4a4e'], 0.8);
    for (const side of [1, -1]) {
      const p = b.surf(0.035, Math.PI * 0.5);
      b.blob([p[0], p[1] - 0.004 * L, p[2] * side * 0.92], [0.012 * L, 0.006 * L, 0.006 * L], pad, { ao: 0.7 });
    }
    b.anchors.gill = b.surf(0.19, Math.PI * 0.45);
    b.anchors.flank = b.surf(0.42, Math.PI * 0.5);
    b.anchors.back = b.surf(0.42, 0.05);
    b.anchors.belly = b.surf(0.36, Math.PI * 0.82);
    b.anchors.tailBase = b.surf(0.9, Math.PI * 0.5);
  },
  swim: { k: 0.62, a0: 0.008, pow: 2.6, amp: 0.075, freq: 0.3, freqK: 0.55, flutter: [1.1, 0.0075], ripple: 0.004 },
  uwo: { rim: 0.32, sss: [0.85, 0.88, 0.9], sssK: 0.4 },
};

// ------------------------------------------------------------------------------------------- remora
const REM_BACK = grad(['#1c1e22', '#26282e', '#30333a', '#3c4048'], 8);
export const remora: FishSpec = {
  name: 'remora', L: 0.7, body: 0.83, seg: 44, rings: 44, page: [256, 256],
  top: [[0, 0.0], [0.02, 0.018], [0.08, 0.03], [0.2, 0.038], [0.4, 0.046], [0.6, 0.046], [0.8, 0.032], [1, 0.022]],
  bot: [[0, 0.0], [0.02, 0.026], [0.08, 0.04], [0.2, 0.05], [0.4, 0.056], [0.6, 0.05], [0.8, 0.03], [1, 0.02]],
  wid: [[0, 0.0], [0.03, 0.04], [0.12, 0.058], [0.3, 0.056], [0.6, 0.044], [1, 0.016]],
  cy: [[0, -0.008], [0.2, 0], [1, 0.004]],
  sq: [[0, 2.6], [0.3, 2.5], [1, 2.1]],
  mouth: { t: 0.075, th: [[0, 0.4], [0.075, 0.5]], open: 0.5, idle: 0.1, lip: 0.04, lipCol: '#5a5a5e', interior: '#4a1420', crease: '#0a0a0c',
    teeth: { upper: 5, lower: 6, size: 0.008, style: 'tri', inset: 0.9, t0: 0.01 } },
  eye: { t: 0.11, y: 0.42, r: 0.017, fwd: 0.25, up: 0.15, lid: 'angry', lidCol: '#26282e', lidLine: '#08080a', lidTilt: 0.5, lidLevel: 0.25, bulge: 0.62,
    paint: { iris: ['#3a2a10', '#8a6a20', '#d0b040', '#f8e080'], pupil: 0.5, ring: '#ffe8a0', sclera: '#a8a898', irisR: 0.86 } },
  rough: 0.7, sheen: 0,
  paint: (c) => {
    const { t, yn } = c;
    let col = REM_BACK(Math.max(0, Math.min(1, (1 - yn) / 1.6)), c.px, c.py);
    if (yn < -0.35) col = grad(['#9a9a92', '#b8b6ac', '#cac8be'])(Math.min(1, -yn - 0.35), c.px, c.py);
    // the black flank stripe, edged white, from the snout through the eye to the tail
    const sy = 0.05 - t * 0.05;
    if (Math.abs(c.side) > 0.2 && t > 0.02) {
      const d = yn - sy;
      if (Math.abs(d) < 0.16) col = C('#0a0a0c');
      else if (Math.abs(d) < 0.27) col = C('#e8e8e0');
    }
    // the suction disc: an oval of laminae across the flat top of the head
    if (yn > 0.62 && t > 0.03 && t < 0.3) {
      const k = (t - 0.03) / 0.27, half = 0.38 + 0.6 * Math.sin(k * Math.PI);
      if (Math.abs(c.side) < half * 0.62) col = (Math.floor(t * 150) % 2) ? C('#5a5a62') : C('#2a2a30');
      else if (Math.abs(c.side) < half * 0.62 + 0.12) col = C('#7a7a80');
    }
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.5, t1: 0.86, h: [[0, 0.05], [0.2, 0.045], [1, 0.02]], sweep: 0.3, col: ['#2a2c32', '#1c1e22'], rays: 12, rayCol: '#101012', edge: '#d8d8d0', edgeW: 0.12, alpha: [0.95, 0.85], px: [64, 24] },
    { type: 'anal', t0: 0.5, t1: 0.86, h: [[0, 0.05], [0.2, 0.045], [1, 0.02]], sweep: 0.3, col: ['#2a2c32', '#1c1e22'], rays: 12, rayCol: '#101012', edge: '#d8d8d0', edgeW: 0.12, alpha: [0.95, 0.85], px: [64, 24] },
    { type: 'caudal', shape: 'emarginate', len: 0.13, span: 0.075, col: ['#2a2c32', '#1c1e22', '#101012'], rays: 10, rayCol: '#08080a', edge: '#e8e8e0', edgeW: 0.16, alpha: [0.95, 0.85], px: [48, 40] },
    { type: 'pectoral', t: 0.24, y: 0.0, len: 0.1, angle: 20, col: ['#3a3c42', '#26282e'], rays: 8, alpha: [0.9, 0.7], flutter: 0.06, out: 0.6 },
  ],
  extras: (b) => {
    // the disc stands a little proud of the head
    const L = b.L, r = b.pg.alloc(16, 16);
    paintSwatch(b.pg, r, ['#5a5a62', '#3a3a42', '#2a2a30', '#5a5a62'], 0.7);
    const p = b.surf(0.15, 0.0);
    b.blob([p[0], p[1] + 0.002 * L, 0], [0.1 * L, 0.006 * L, 0.03 * L], r, { ao: 0.85 });
    b.anchors.disc = [p[0], p[1] + 0.006 * L, 0];
  },
  swim: { k: 0.9, a0: 0.03, pow: 2.2, amp: 0.1, freq: 1.4, freqK: 1.1, flutter: [6, 0.02], ripple: 0.01 },
};

export const WHALE_SPECS: Record<string, FishSpec> = { whaleShark, remora };
