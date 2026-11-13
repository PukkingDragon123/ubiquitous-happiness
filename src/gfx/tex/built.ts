// Man-made surfaces: wood planks (fresh / rotten / painted), rusted steel, riveted hull plates, rope,
// concrete, glass, plus a neutral grit for tinted debris. ~32 px per metre.
import { Surf, pal, mixc, scl, clamp01, hex, type RGB } from './core';

// ------------------------------------------------------------------------------------------------ wood
interface WoodOpts { P: RGB[]; plank: number; seamCol: RGB; knotP: number; nails: boolean }
/** boards run along x; returns per-pixel plank index + grain value via callback for later passes */
function woodBoards(s: Surf, o: WoodOpts) {
  const ph = o.plank;
  const rows = Math.max(1, Math.round(s.h / ph));
  const bh = s.h / rows;
  s.each((x, y) => {
    const row = Math.floor(y / bh);
    const fy = (y - row * bh) / bh;
    // boards have butt joints at staggered positions (one per row per tile)
    const jx = Math.floor(s.r(row, 0, 11) * s.w);
    const seg = ((x - jx + s.w) % s.w) < s.w * 0.5 ? 0 : 1;
    const board = row * 2 + seg;
    const tone = (s.r(board, 1, 12) - 0.5) * 0.28;
    // grain: stretched noise + growth-ring stripes that wander and pinch around knots
    const warp = (s.na(x, y, 2, rows * 2, 2, 13 + board) - 0.5) * 6;
    const grain = s.na(x, y + warp * 0.3, 3, rows * 5, 3, 14 + board);
    const rings = Math.sin((y + warp + s.r(board, 2, 15) * 30) * 1.4 + grain * 5);
    let t = 0.45 + tone + (grain - 0.5) * 0.5 + rings * 0.09 + (s.r(x, y, 16) - 0.5) * 0.08;
    // slight cupping: board edges a touch darker
    t -= Math.pow(Math.abs(fy - 0.5) * 2, 4) * 0.12;
    s.set(x, y, s.pick(o.P, t, x, y, 0.9));
    s.setH(x, y, 0.55 + rings * 0.04 + (grain - 0.5) * 0.08 - Math.pow(Math.abs(fy - 0.5) * 2, 6) * 0.15);
    s.R(x, y, 0.72 + (grain - 0.5) * 0.15);
    // seams between boards and at the butt joint
    const jd = Math.abs(((x - jx + s.w) % s.w) - 0) ;
    if (Math.floor(y + 1) % Math.round(bh) === 0 || jd < 1 || Math.abs(((x - jx + s.w) % s.w) - s.w * 0.5) < 1) {
      s.set(x, y, o.seamCol); s.setH(x, y, 0.1);
    }
  });
  // knots: dark elliptical whorls with a lighter halo of bent grain
  for (let k = 0; k < (s.w * s.h) / 1400 * o.knotP; k++) {
    const cx = s.r(k, 1, 20) * s.w, cy = s.r(k, 2, 20) * s.h, r = 1.2 + s.r(k, 3, 20) * 1.6;
    for (let y = -r * 2; y <= r * 2; y++) for (let x = -r * 4; x <= r * 4; x++) {
      const d = Math.hypot(x / 2.2, y) / r;
      if (d < 0.7) { s.set(cx + x, cy + y, o.P[0]); s.addH(cx + x, cy + y, -0.08); }
      else if (d < 1.0) s.set(cx + x, cy + y, o.P[1]);
      else if (d < 1.5) s.blend(cx + x, cy + y, o.P[Math.min(o.P.length - 1, 3)], 0.4);
    }
  }
  if (o.nails) {
    for (let row = 0; row < rows; row++) {
      const jx = Math.floor(s.r(row, 0, 11) * s.w);
      for (const off of [3, s.w * 0.5 + 3, -3 + s.w * 0.5, -3]) {
        const x = Math.round(jx + off), y = Math.round(row * bh + bh * 0.5);
        s.set(x, y, hex('#1a1612')); s.set(x, y - 1, hex('#3a3632')); s.addH(x, y, -0.1);
        s.drips(hex('#5a3420'), 1, bh * 1.3, 0.3, row * 7 + off, x, y + 1); // rust bleed
      }
    }
  }
  return { rows, bh };
}

const PINE = pal('#3c2a1c', '#4f3824', '#62472e', '#755738', '#876742', '#97774e', '#a6885e');
export function planks(s: Surf) {
  woodBoards(s, { P: PINE, plank: 8, seamCol: hex('#22160c'), knotP: 1, nails: true });
  s.grime(hex('#3a2a1a'), 0.5, 3, 0.62, 1);
  s.cavity(hex('#1e140c'), 0.35, 1, 0.12);
  s.bump = 3;
}

const ROT = pal('#17140f', '#221d15', '#2e271c', '#3b3224', '#493e2d', '#584c38', '#685a44');
/** waterlogged, rotten planks: grey-brown, deep checks along the grain, shipworm holes, algae in the seams */
export function planksRotten(s: Surf) {
  const { bh } = woodBoards(s, { P: ROT, plank: 8, seamCol: hex('#0a0806'), knotP: 1.5, nails: true });
  // deep checks along the grain
  for (let k = 0; k < (s.w * s.h) / 180; k++) {
    const x = s.r(k, 1, 30) * s.w, y = s.r(k, 2, 30) * s.h;
    s.crack(x, y, 4 + s.r(k, 3, 30) * 14, 1, (s.r(k, 4, 30) - 0.5) * 0.1, hex('#0c0a07'), scl(ROT[4], 1.1), 0.15, 0.25, k);
  }
  // missing chunks at board ends
  for (let k = 0; k < 3; k++) {
    const cx = s.r(k, 1, 40) * s.w, cy = Math.floor(s.r(k, 2, 40) * (s.h / bh)) * bh + 1, r = 2 + s.r(k, 3, 40) * 3;
    for (let y = 0; y < r; y++) for (let x = -r * 1.5; x < r * 1.5; x++) if (Math.hypot(x / 1.5, y) < r * (0.7 + s.r(x | 0, y, 41) * 0.3)) { s.set(cx + x, cy + y, hex('#0a0806')); s.setH(cx + x, cy + y, 0.05); }
  }
  // shipworm holes (dark dots with pale calcareous lining)
  for (let k = 0; k < (s.w * s.h) / 140; k++) { const x = s.r(k, 1, 50) * s.w, y = s.r(k, 2, 50) * s.h; s.set(x, y, hex('#060504')); s.addH(x, y, -0.3); s.blend(x + 1, y, hex('#9a9480'), 0.5); }
  // green-black algae film, salt bloom
  s.grime(hex('#1e2a16'), 0.8, 3, 0.5, 2, 0.95);
  s.grime(hex('#8a8a78'), 0.35, 5, 0.7, 3);
  s.cavity(hex('#050403'), 0.5, 1, 0.1);
  s.each((x, y) => s.R(x, y, 0.92));
  s.bump = 4;
}

/** painted planks: boat paint (teal-green by default, or `tint`) chipped and peeling to grey wood */
export function planksPainted(s: Surf, tint?: string) {
  const { rows, bh } = woodBoards(s, { P: pal('#3a3026', '#4a3e30', '#5a4c3a', '#6a5a46', '#7a6a54', '#8a7a62'), plank: 8, seamCol: hex('#120e0a'), knotP: 0.6, nails: true });
  const base = hex(tint ?? '#3f6e68');
  const PAINT = [scl(base, 0.55), scl(base, 0.72), scl(base, 0.86), base, mixc(base, hex('#e8e4d8'), 0.18), mixc(base, hex('#f0ece0'), 0.32)];
  s.each((x, y) => {
    const row = Math.floor(y / bh);
    const wear = s.n(x, y, 4, 3, 60) * 0.7 + s.n(x, y, 14, 2, 61) * 0.3;
    // paint wears first along board edges and in patches
    const fy = (y - row * bh) / bh;
    const edgeWear = Math.pow(Math.abs(fy - 0.5) * 2, 3) * 0.25;
    const chip = wear + edgeWear;
    if (chip > 0.66) return; // bare wood
    const old = s.get(x, y);
    if (old[0] < 30 && old[1] < 30) return; // keep seams
    const t = 0.45 + (s.n(x, y, 3, 2, 62) - 0.5) * 0.35 + (s.r(x, y, 63) - 0.5) * 0.12 - (s.na(x, y, 3, rows * 5, 2, 64) - 0.5) * 0.2;
    s.set(x, y, s.pick(PAINT, t, x, y));
    s.addH(x, y, 0.06);
    s.R(x, y, 0.55);
    // peeling lip: lighter edge where the paint lifts
    if (chip > 0.6) { s.set(x, y, PAINT[5]); s.addH(x, y, 0.04); }
  });
  s.grime(hex('#2a2a20'), 0.55, 3, 0.6, 1);
  s.drips(hex('#5a3a22'), Math.round(s.w / 12), bh * 2, 0.25, 4);
  s.cavity(hex('#14100c'), 0.4, 1, 0.08);
  s.bump = 3;
}

// ------------------------------------------------------------------------------------------------ metal
const STEEL = pal('#2a2c2e', '#383b3e', '#474a4e', '#575a5e', '#686b6f', '#7a7d80');
const RUST = pal('#24140c', '#3a1e10', '#542814', '#6e3418', '#88441e', '#a05a28', '#b87036', '#c88a4a');
function rustField(s: Surf, x: number, y: number, bias: number) {
  return s.n(x, y, 3, 4, 10) * 0.7 + s.n(x, y, 12, 2, 11) * 0.3 + bias;
}
export function rustSteel(s: Surf) {
  s.each((x, y) => {
    const n = s.n(x, y, 4, 3, 1), brush = s.na(x, y, 2, 40, 2, 2);
    s.set(x, y, s.pick(STEEL, 0.3 + n * 0.4 + (brush - 0.5) * 0.3, x, y, 0.8));
    s.setH(x, y, 0.5);
    s.R(x, y, 0.38 + n * 0.2); s.M(x, y, 0.85);
    const r = rustField(s, x, y, 0);
    if (r > 0.52) {
      const t = (r - 0.52) / 0.48;
      if (t * 2.2 > s.ct(x, y) * 0.9) {
        // rust: flaky, blistered, darker at the core of a patch, bright orange at its fresh edge
        const k = clamp01(0.62 - t * 0.55 + (s.r(x, y, 12) - 0.5) * 0.35 + (s.n(x, y, 16, 2, 13) - 0.5) * 0.4);
        s.set(x, y, s.pick(RUST, k, x, y, 1.2));
        s.setH(x, y, 0.55 + t * 0.25 + s.r(x, y, 14) * 0.08);
        s.R(x, y, 0.92); s.M(x, y, 0.05);
      }
    }
  });
  // pitting and scratches
  for (let k = 0; k < (s.w * s.h) / 70; k++) { const x = s.r(k, 1, 20) * s.w, y = s.r(k, 2, 20) * s.h; s.shade(x, y, 0.6); s.addH(x, y, -0.12); }
  for (let k = 0; k < s.w / 10; k++) {
    let x = s.r(k, 1, 30) * s.w, y = s.r(k, 2, 30) * s.h; const a = (s.r(k, 3, 30) - 0.5) * 0.6, L = 4 + s.r(k, 4, 30) * 10;
    for (let i = 0; i < L; i++) { s.blend(x, y, STEEL[5], 0.6); x += Math.cos(a); y += Math.sin(a); }
  }
  s.drips(RUST[4], Math.round(s.w / 7), s.h * 0.6, 0.35, 5);
  s.cavity(RUST[0], 0.35, 1, 0.1);
  s.bump = 3;
}

const HULL_PAINT = pal('#24100c', '#341812', '#442018', '#562a20', '#683428');
const BARN = pal('#5a564c', '#7e786a', '#a29a8a', '#c4bcac', '#ddd6c8');
/**
 * Riveted hull plating of a long-sunk ship: big lapped plates (~2 x 1 m: one plate across a 64 px tile, two
 * rows), rivet lines along every seam, the steel mostly rust-brown with islands of faded red-black paint,
 * rust bleeding down from rivets, a grey-green growth film and barnacle clusters.
 */
export function hullPlates(s: Surf) {
  const pw = s.w, ph = s.h / 2;
  s.each((x, y) => {
    const row = Math.floor(y / ph), off = (row & 1) * pw * 0.5;
    const fx = (((x + off) % pw) + pw) % pw / pw, fy = (y % ph) / ph;
    const n = s.n(x, y, 3, 3, 1);
    // base: corroded steel
    let t = 0.36 + (n - 0.5) * 0.5 + (s.r(x, y, 3) - 0.5) * 0.18 - fy * 0.1;
    let c = s.pick(RUST, 0.18 + t * 0.7, x, y);
    s.setH(x, y, 0.5 - fy * 0.08 + s.r(x, y, 4) * 0.05);
    s.R(x, y, 0.9);
    // surviving paint islands (flat, slightly raised, crazed edges)
    const pnt = s.n(x, y, 3, 3, 20) * 0.75 + s.n(x, y, 10, 2, 21) * 0.25;
    if (pnt > 0.5 && (pnt - 0.5) * 6 > s.ct(x, y) * 0.9) {
      t = 0.35 + (s.n(x, y, 6, 2, 22) - 0.5) * 0.5 + (s.r(x, y, 23) - 0.5) * 0.15;
      c = s.pick(HULL_PAINT, t, x, y); s.addH(x, y, 0.05); s.R(x, y, 0.75);
      if (pnt < 0.53) c = mixc(c, RUST[6], 0.5); // rust creeping under the paint edge
    }
    s.set(x, y, c);
    // seams: the lower plate's top edge lit, a dark lap shadow under the plate above
    if (fy > 1 - 1.5 / ph) { s.set(x, y, hex('#0e0605')); s.setH(x, y, 0.2); }
    else if (fy < 1 / ph) { s.blend(x, y, hex('#9a6a4a'), 0.35); s.setH(x, y, 0.6); }
    if (fx < 1 / pw) { s.set(x, y, hex('#120806')); s.setH(x, y, 0.3); }
    else if (fx < 2 / pw) s.blend(x, y, hex('#8a5a40'), 0.25);
  });
  // rivet lines along every seam
  const RIV = pal('#1a0e0a', '#3a2016', '#5a3422', '#7a4a32', '#946048');
  for (let row = 0; row < 2; row++) {
    const off = (row & 1) * pw * 0.5;
    for (let x = 2; x < s.w; x += 5) { s.bump2(x, Math.round(row * ph + 2), 0, RIV, 0.25); s.bump2(x, Math.round(row * ph + ph - 4), 0, RIV, 0.25); }
    for (let y = Math.round(row * ph + 6); y < row * ph + ph - 5; y += 5) { s.bump2(Math.round(-off + 3), y, 0, RIV, 0.25); s.bump2(Math.round(-off + 3 + pw), y, 0, RIV, 0.25); }
  }
  // rust bleed down from the rivet lines, silt / growth film, barnacles clustered in patches
  s.drips(RUST[5], Math.round(s.w / 3), ph * 1.2, 0.3, 7);
  s.grime(hex('#4a4c3e'), 0.55, 3, 0.56, 2, 0.95);
  for (let k = 0; k < (s.w * s.h) / 140; k++) {
    const x = Math.round(s.r(k, 1, 80) * s.w), y = Math.round(s.r(k, 2, 80) * s.h);
    if (s.n(x, y, 3, 2, 81) < 0.58) continue;
    s.bump2(x, y, s.r(k, 3, 80) < 0.75 ? 1 : 2, BARN, 0.45);
    s.set(x, y, hex('#1c1a16')); // opening
  }
  s.cavity(hex('#0e0806'), 0.4, 1, 0.1);
  s.bump = 3.5;
}

// ------------------------------------------------------------------------------------------------ rope
const HEMP = pal('#2a2318', '#3e3424', '#524631', '#66583e', '#7a6a4c', '#8e7e5e', '#a29272');
/** three-strand laid rope: x along the rope, y around it (wraps). Diagonal strands with fibre detail */
export function rope(s: Surf) {
  const period = s.h / 3;
  s.each((x, y) => {
    const u = ((y + x * 0.9) % period + period) % period / period; // strand phase
    const round = Math.sin(u * Math.PI); // strand cross-section
    const fib = s.na(x - y * 0.9, y + x * 0.9, 24, 6, 2, 1);
    const t = 0.1 + round * 0.62 + (fib - 0.5) * 0.35 + (s.r(x, y, 2) - 0.5) * 0.12;
    s.set(x, y, s.pick(HEMP, t, x, y));
    s.setH(x, y, round * 0.7 + fib * 0.1);
    s.R(x, y, 0.95);
    if (u < 0.06) s.set(x, y, HEMP[0]);
  });
  s.speckle(pal('#c0aa7a', '#ccb888'), 0.02, 3, 0.05); // stray fibres
  s.grime(hex('#2a2a1e'), 0.6, 3, 0.55, 2);
  s.bump = 4;
}

// ------------------------------------------------------------------------------------------------ concrete
const CON = pal('#3e3e3a', '#4e4e49', '#5e5e58', '#6e6e67', '#7e7e76', '#8e8d85', '#9e9d94');
export function concrete(s: Surf) {
  s.each((x, y) => {
    const n = s.n(x, y, 3, 3, 1), m = s.n(x, y, 10, 2, 2);
    const form = Math.abs(((y / s.h) * 4) % 1 - 0.5) < 0.02 ? -0.12 : 0; // formwork lines
    const t = 0.35 + n * 0.35 + m * 0.18 + (s.r(x, y, 3) - 0.5) * 0.2 + form;
    s.set(x, y, s.pick(CON, t, x, y, 1.1));
    s.setH(x, y, 0.5 + (m - 0.5) * 0.1);
    s.R(x, y, 0.9);
  });
  // exposed aggregate pebbles and bug holes
  for (let k = 0; k < (s.w * s.h) / 120; k++) {
    const x = Math.round(s.r(k, 1, 10) * s.w), y = Math.round(s.r(k, 2, 10) * s.h);
    const c = [hex('#6a645a'), hex('#8a8478'), hex('#5a5650'), hex('#a09a8c')][Math.floor(s.r(k, 3, 10) * 4)];
    s.set(x, y, c); if (s.r(k, 4, 10) < 0.4) s.set(x + 1, y, scl(c, 0.85));
  }
  for (let k = 0; k < (s.w * s.h) / 220; k++) { const x = s.r(k, 1, 20) * s.w, y = s.r(k, 2, 20) * s.h; s.set(x, y, hex('#1e1e1c')); s.addH(x, y, -0.3); s.blend(x, y + 1, CON[6], 0.5); }
  s.crack(s.r(0, 1, 30) * s.w, 0, s.h, 0.1, 1, hex('#1a1a18'), CON[5], 0.7, 0.3);
  s.grime(hex('#c8c8b8'), 0.4, 4, 0.66, 1); // efflorescence
  s.grime(hex('#2e3424'), 0.55, 3, 0.6, 2, 0.95); // marine growth
  s.drips(hex('#3a3a32'), Math.round(s.w / 9), s.h * 0.5, 0.25, 3);
  s.cavity(hex('#1e1e1c'), 0.35, 1, 0.1);
  s.bump = 2.5;
}

// ------------------------------------------------------------------------------------------------ glass
/** grimy glass (portholes, bottles, dive masks): smudges, scratches and a scum ring; alpha: clean = clear */
export function glass(s: Surf) {
  const G = pal('#0e1a1c', '#16272a', '#20353a', '#2c464a', '#3e5c60', '#5a7a7c');
  s.each((x, y) => {
    const n = s.n(x, y, 2, 3, 1);
    const smudge = s.n(x, y, 5, 3, 2);
    const t = 0.3 + n * 0.3 + (y / s.h) * 0.1;
    s.set(x, y, s.pick(G, t, x, y, 0.7));
    s.R(x, y, 0.06); s.A(x, y, 0.32 + n * 0.1);
    s.setH(x, y, 0.5);
    if (smudge > 0.6) { const k = (smudge - 0.6) * 2.5; s.blend(x, y, hex('#6a7468'), k * 0.6); s.R(x, y, 0.06 + k * 0.6); s.A(x, y, 0.4 + k * 0.5); }
  });
  for (let k = 0; k < s.w / 6; k++) {
    let x = s.r(k, 1, 30) * s.w, y = s.r(k, 2, 30) * s.h; const a = s.r(k, 3, 30) * 6.28, L = 3 + s.r(k, 4, 30) * 12;
    for (let i = 0; i < L; i++) { s.blend(x, y, hex('#a8c4c4'), 0.55); s.A(x, y, 0.7); x += Math.cos(a); y += Math.sin(a); }
  }
  s.drips(hex('#4a5040'), Math.round(s.w / 10), s.h * 0.4, 0.3, 4);
  s.bump = 1;
}

// ------------------------------------------------------------------------------------------------ grit
/** neutral grey grit (tinted per instance for debris chunks) */
export function grit(s: Surf) {
  const G = pal('#8c8c8c', '#a0a0a0', '#b4b4b4', '#c6c6c6', '#d6d6d6', '#e4e4e4');
  s.each((x, y) => {
    const n = s.n(x, y, 3, 3, 1);
    s.set(x, y, s.pick(G, 0.3 + n * 0.5 + (s.r(x, y, 2) - 0.5) * 0.4, x, y));
    s.setH(x, y, 0.5 + n * 0.3 + s.r(x, y, 3) * 0.1);
    s.R(x, y, 0.9);
  });
  s.speckle(pal('#5a5a5a', '#6a6a6a'), 0.05, 1, -0.1);
  s.cavity(hex('#606060'), 0.4, 1, 0.1);
  s.bump = 3;
}
