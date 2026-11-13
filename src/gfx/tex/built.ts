// Man-made surfaces as deliberate shapes: wood planks (fresh / rotten / painted) with grain lines, knots and nails,
// rusted steel with rust patches and streaks, riveted hull plates with barnacles, rope strands, concrete panels,
// glass, and a neutral chip pattern for tinted debris. ~32 px per metre.
import { Surf, hramp, mixc, hex, type RGB } from './core';

// ------------------------------------------------------------------------------------------------ wood
interface WoodOpts { P: RGB[]; rows: number; nails: boolean; seed: number }
/** boards run along x: bevelled boards with staggered butt joints, 2-3 grain lines each, knots, nails */
function boards(s: Surf, o: WoodOpts) {
  const bh = s.h / o.rows;
  const jointX = (row: number) => Math.floor(s.r(row, 0, o.seed) * s.w);
  s.each((x, y) => {
    const row = Math.floor(y / bh), fy = y - row * bh;
    if (fy < 1) { s.setId(x, y, -1); return; }
    const jx = jointX(row), xx = ((x - jx) % s.w + s.w) % s.w;
    if (xx === 0 || xx === Math.floor(s.w / 2)) { s.setId(x, y, -1); return; }
    s.setId(x, y, row * 2 + (xx < s.w / 2 ? 0 : 1));
  });
  const P = o.P;
  s.bevel(P, (id) => 2 + (s.r(id, 0, o.seed + 1) < 0.4 ? 1 : 0), { gap: P[0], rough: () => 0.85 });
  // grain: long, slightly stepped lines along each board (one tone down), deliberately few
  for (let b = 0; b < o.rows * 2; b++) {
    const row = Math.floor(b / 2);
    for (let g = 0; g < 3; g++) {
      let y = Math.floor(row * bh + 2 + s.r(b, g, o.seed + 2) * (bh - 4));
      const x0 = Math.floor(s.r(b, g + 5, o.seed + 2) * s.w), len = Math.floor(s.w * (0.3 + s.r(b, g + 9, o.seed + 2) * 0.4));
      for (let i = 0; i < len; i++) {
        const x = x0 + i;
        if (s.id(x, y) !== b) continue;
        if (i > 0 && i % 17 === 0) y += s.r(b, i, o.seed + 3) < 0.5 ? 1 : -1;
        if (s.id(x, y) === b) s.set(x, y, P[1]);
      }
    }
  }
  // knots: a dark eye with a ring
  for (let k = 0; k < Math.max(1, Math.round(o.rows * 0.4)); k++) {
    const row = Math.floor(s.r(k, 1, o.seed + 4) * o.rows);
    const cx = Math.floor(s.r(k, 2, o.seed + 4) * s.w), cy = Math.floor(row * bh + bh / 2);
    for (let y = -2; y <= 2; y++) for (let x = -4; x <= 4; x++) {
      const d = (x / 4) ** 2 + (y / 2) ** 2;
      if (d < 0.35) s.set(cx + x, cy + y, P[0]); else if (d < 1 && s.id(cx + x, cy + y) >= 0) s.set(cx + x, cy + y, P[1]);
    }
  }
  if (o.nails) for (let row = 0; row < o.rows; row++) {
    const jx = jointX(row);
    for (const off of [2, Math.floor(s.w / 2) - 3, Math.floor(s.w / 2) + 2, s.w - 3]) for (const dy of [0.3, 0.7]) {
      const x = jx + off, y = Math.floor(row * bh + bh * dy);
      s.set(x, y, hex('#2a2420')); s.set(x + 1, y, hex('#4a4440')); s.set(x, y - 1, hex('#6a6460')); s.addH(x, y, 0.1);
      if (s.r(x, y, o.seed + 5) < 0.5) s.streak(x, y + 1, 3 + Math.floor(s.r(x, y, o.seed + 6) * 3), hex('#6a3a20'), mixc(P[1], hex('#6a3a20'), 0.5));
    }
  }
  return bh;
}

export function planks(s: Surf) {
  boards(s, { P: hramp('#8a6a46', 5, 0.55), rows: 6, nails: true, seed: 10 });
  s.bump = 3;
}

/** waterlogged, rotten planks: grey-brown, long splits along the grain, a broken end, algae on the seams */
export function planksRotten(s: Surf) {
  const P = hramp('#5a5040', 5, 0.55);
  const bh = boards(s, { P, rows: 6, nails: true, seed: 20 });
  const G = hramp('#3e4a26', 3, 0.4);
  // algae film on the top edge of every board
  s.each((x, y) => { const fy = y % bh; if (fy >= 1 && fy < 2.5 && s.id(x, y) >= 0 && (x + Math.floor(y / bh) * 7) % 11 < 7) s.set(x, y, G[fy < 2 ? 2 : 1]); });
  // splits: long dark lines along the grain with a lit lower lip
  for (let k = 0; k < 4; k++) {
    const y = Math.floor(s.r(k, 1, 21) * s.h), x = Math.floor(s.r(k, 2, 21) * s.w), len = 8 + Math.floor(s.r(k, 3, 21) * 16);
    s.crack([[x, y], [x + len * 0.5, y + (s.r(k, 4, 21) < 0.5 ? 1 : 0)], [x + len, y]], hex('#0e0c08'), P[3], 0.3);
  }
  // a broken board end: a ragged dark notch
  const row = Math.floor(s.r(2, 2, 22) * 6), cx = Math.floor(s.r(2, 3, 22) * s.w), cy = Math.floor(row * bh + 1);
  for (let y = 0; y < bh - 2; y++) { const w = Math.max(0, 4 - Math.abs(y - 2) + (y % 2)); for (let x = 0; x < w; x++) { s.set(cx + x, cy + y, hex('#0a0806')); s.setH(cx + x, cy + y, 0.1); } s.set(cx + w, cy + y, P[3]); }
  s.bump = 4;
}

/** painted planks: boat paint (teal-green by default, or `tint`) chipped to bare grey wood along edges and ends */
export function planksPainted(s: Surf, tint?: string) {
  const W = hramp('#7a6e5c', 5, 0.5);
  const bh = boards(s, { P: W, rows: 6, nails: true, seed: 30 });
  const PA = hramp(tint ?? '#3f7a72', 5, 0.5);
  // chip shapes: clean blobs hugging board edges and ends, bare wood inside, a pale paint lip around them
  const chips: [number, number, number, number][] = [];
  for (let k = 0; k < 9; k++) chips.push([s.r(k, 1, 31) * s.w, Math.floor(s.r(k, 2, 31) * 6) * bh + (s.r(k, 3, 31) < 0.5 ? 1 : bh - 1), 2 + s.r(k, 4, 31) * 5, 1.5 + s.r(k, 5, 31) * 2]);
  const inChip = (x: number, y: number, pad: number) => chips.some(([cx, cy, rx, ry]) => {
    let dx = x + 0.5 - cx; dx -= Math.round(dx / s.w) * s.w;
    let dy = y + 0.5 - cy; dy -= Math.round(dy / s.h) * s.h;
    return (dx / (rx + pad)) ** 2 + (dy / (ry + pad)) ** 2 < 1;
  });
  s.each((x, y) => {
    const a = s.id(x, y);
    if (a < 0 || inChip(x, y, 0)) return;
    const fy = y % bh;
    let k = fy < 2 ? 3 : (fy > bh - 2 ? 1 : 2);
    if (inChip(x, y, 1)) k = 4; // lifted paint lip
    s.set(x, y, PA[k]);
    s.R(x, y, 0.8);
  });
  s.bump = 3;
}

// ------------------------------------------------------------------------------------------------ metal
/** an irregular blob (7-point polygon, wrap-aware) membership test */
function blobAt(s: Surf, cx: number, cy: number, r: number, seed: number) {
  return (x: number, y: number) => {
    let dx = x + 0.5 - cx; dx -= Math.round(dx / s.w) * s.w;
    let dy = y + 0.5 - cy; dy -= Math.round(dy / s.h) * s.h;
    const a = Math.atan2(dy, dx), seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 7);
    const rr = r * (0.7 + s.r(seg, seed, 50) * 0.5);
    return Math.hypot(dx, dy) / rr;
  };
}

export function rustSteel(s: Surf) {
  const S = hramp('#6a6e72', 5, 0.45, 0.02);
  const R = hramp('#8a4a24', 6, 0.55, 0.05);
  // plate: two flat tone zones, a faint seam with rivets along the top
  s.each((x, y) => {
    s.set(x, y, S[2 + s.zone(x, y, 2, 2, 1) - (y === 0 ? 1 : 0)]);
    s.setH(x, y, 0.5); s.R(x, y, 0.65); s.M(x, y, 0.2);
  });
  for (let x = 3; x < s.w; x += 8) { s.set(x, 2, S[4]); s.set(x + 1, 3, S[0]); s.set(x, 3, S[1]); s.addH(x, 2, 0.2); }
  // rust patches: dark core, mid body, bright fresh rim
  for (let k = 0; k < 3; k++) {
    const cx = s.r(k, 1, 40) * s.w, cy = s.r(k, 2, 40) * s.h, r = 4 + s.r(k, 3, 40) * 6;
    const f = blobAt(s, cx, cy, r, k);
    for (let y = Math.floor(cy - r * 1.3); y <= cy + r * 1.3; y++) for (let x = Math.floor(cx - r * 1.3); x <= cx + r * 1.3; x++) {
      const d = f(x, y);
      if (d > 1) continue;
      s.set(x, y, d > 0.8 ? R[4] : d > 0.45 ? R[2] : R[1]);
      s.setH(x, y, 0.55 + (1 - d) * 0.1); s.R(x, y, 0.95); s.M(x, y, 0);
    }
    // streaks bleeding down from the patch
    for (let i = 0; i < 3; i++) s.streak(Math.round(cx - r * 0.5 + i * r * 0.5), Math.round(cy + r * 0.7), 5 + Math.floor(s.r(k, i, 41) * 9), R[3], R[2]);
  }
  // two bright scratches
  for (let k = 0; k < 2; k++) { const x = Math.floor(s.r(k, 5, 42) * s.w), y = Math.floor(s.r(k, 6, 42) * s.h); for (let i = 0; i < 7; i++) s.set(x + i, y + Math.floor(i / 3), S[4]); }
  s.bump = 3;
}

/** riveted hull plating of a long-sunk ship: big lapped plates, rivet lines, faded red-black paint islands over
 *  rust, rust streaks from the rivets, barnacle clusters */
export function hullPlates(s: Surf) {
  const R = hramp('#7a4628', 6, 0.55, 0.05);
  const PA = hramp('#5a2a22', 4, 0.45);
  const B = hramp('#b8b0a0', 4, 0.5);
  const ph = s.h / 2;
  s.each((x, y) => {
    const row = Math.floor(y / ph), off = row * Math.floor(s.w / 2), fy = y - row * ph;
    const fx = ((x + off) % s.w + s.w) % s.w;
    if (fy < 1 || fx < 1) { s.setId(x, y, -1); return; }
    s.setId(x, y, row);
  });
  s.bevel(R, () => 2, { gap: R[0], rough: () => 0.9 });
  // paint islands: big clean blobs of faded paint, a rust ring at their edge
  for (let k = 0; k < 3; k++) {
    const cx = s.r(k, 1, 60) * s.w, cy = s.r(k, 2, 60) * s.h, r = 6 + s.r(k, 3, 60) * 7;
    const f = blobAt(s, cx, cy, r, k + 10);
    for (let y = Math.floor(cy - r * 1.3); y <= cy + r * 1.3; y++) for (let x = Math.floor(cx - r * 1.3); x <= cx + r * 1.3; x++) {
      if (s.id(x, y) < 0) continue;
      const d = f(x, y);
      if (d < 0.88) s.set(x, y, PA[(y % ph) < 2 ? 3 : 2]); else if (d < 1) s.set(x, y, R[4]);
    }
  }
  // rivet lines along every seam; rust streaks from some rivets
  for (let row = 0; row < 2; row++) {
    const y = Math.floor(row * ph + 3);
    for (let x = 2; x < s.w; x += 5) {
      s.set(x, y, R[4]); s.set(x + 1, y, R[2]); s.set(x, y + 1, R[1]); s.set(x + 1, y + 1, R[0]); s.addH(x, y, 0.25);
      if (s.r(x, row, 61) < 0.35) s.streak(x, y + 2, 4 + Math.floor(s.r(x, row, 62) * 8), R[3], R[2]);
    }
  }
  // barnacle clusters: little cones (pale rim, dark opening)
  for (let k = 0; k < 3; k++) {
    const cx = Math.floor(s.r(k, 4, 63) * s.w), cy = Math.floor(s.r(k, 5, 63) * s.h);
    for (let i = 0; i < 5; i++) {
      const x = cx + Math.floor((s.r(k, i, 64) - 0.5) * 8), y = cy + Math.floor((s.r(k, i, 65) - 0.5) * 6);
      s.ball(x, y, 1.6, 1.6, B, { shadow: 0.75, h: 0.4 });
      s.set(x, y, hex('#2a2620'));
    }
  }
  s.bump = 3.5;
}

// ------------------------------------------------------------------------------------------------ rope
/** three-strand laid rope: x along the rope, y around it (wraps). Each strand a rounded band, fibre dashes */
export function rope(s: Surf) {
  const P = hramp('#9a845e', 5, 0.55);
  const per = s.h / 3;
  s.each((x, y) => {
    const u = (((y + x * 0.9) % per) + per) % per / per;
    const k = u < 0.08 ? 0 : u < 0.25 ? 1 : u < 0.55 ? 3 : u < 0.75 ? 2 : 1;
    s.set(x, y, P[k]);
    s.setH(x, y, Math.sin(u * Math.PI) * 0.7);
    s.R(x, y, 0.95);
    // fibre dashes along the strand crown
    if (k === 3 && ((x + y * 3) % 7) === 0) s.set(x, y, P[4]);
  });
  s.bump = 4;
}

// ------------------------------------------------------------------------------------------------ concrete
export function concrete(s: Surf) {
  const P = hramp('#8a8a82', 5, 0.45, 0.02);
  // cast panels (formwork) with bevelled seams, two tone zones, bug holes on a grid, one crack, water stains
  const pw = s.w / 2, ph = s.h / 3;
  s.each((x, y) => {
    if (x % pw < 1 || y % ph < 1) { s.setId(x, y, -1); return; }
    s.setId(x, y, Math.floor(x / pw) + Math.floor(y / ph) * 2);
  });
  s.bevel(P, (id) => 2 + (s.r(id, 0, 1) < 0.35 ? 1 : 0), { gap: P[0], rough: () => 0.95 });
  for (let gy = 2; gy < s.h; gy += 6) for (let gx = 2; gx < s.w; gx += 7) {
    if (s.r(gx, gy, 2) < 0.6) continue;
    const x = gx + Math.floor(s.r(gx, gy, 3) * 4), y = gy + Math.floor(s.r(gx, gy, 4) * 3);
    if (s.id(x, y) < 0) continue;
    s.set(x, y, P[0]); s.set(x, y + 1, P[3]); s.addH(x, y, -0.2);
  }
  s.crack(s.jag(s.r(1, 1, 5) * s.w, 2, 1.5, 7, 3, 1.0, 3), P[0], P[3]);
  for (let k = 0; k < 3; k++) s.streak(Math.floor(s.r(k, 2, 6) * s.w), Math.floor(Math.floor(s.r(k, 3, 6) * 3) * ph + 1), 10, P[1], P[2], 2);
  s.bump = 2.5;
}

// ------------------------------------------------------------------------------------------------ glass
/** grimy glass: banded dark tint, two clean diagonal reflection streaks, a grime band low down, scratches */
export function glass(s: Surf) {
  const P = hramp('#2c4a4e', 5, 0.5, 0.02);
  s.each((x, y) => {
    const band = Math.floor((y / s.h) * 4);
    let k = 1 + (band % 2);
    const d = ((x + y) % s.w + s.w) % s.w;
    if (d > s.w * 0.15 && d < s.w * 0.15 + 3) k = 4;
    if (d > s.w * 0.15 + 5 && d < s.w * 0.15 + 6) k = 3;
    s.set(x, y, P[k]);
    s.R(x, y, 0.6); s.A(x, y, k >= 3 ? 0.7 : 0.38);
    s.setH(x, y, 0.5);
    if (y > s.h * 0.82) { s.set(x, y, mixc(P[2], hex('#5a6448'), 0.5)); s.A(x, y, 0.85); s.R(x, y, 0.9); }
  });
  for (let k = 0; k < 3; k++) { const x = Math.floor(s.r(k, 1, 7) * s.w), y = Math.floor(s.r(k, 2, 7) * s.h * 0.7); for (let i = 0; i < 6; i++) { s.set(x + i, y + (i >> 1), P[4]); s.A(x + i, y + (i >> 1), 0.8); } }
  s.bump = 1;
}

// ------------------------------------------------------------------------------------------------ grit
/** neutral grey chips (tinted per instance for debris) */
export function grit(s: Surf) {
  const P = hramp('#b4b4b4', 5, 0.35, 0);
  s.each((x, y) => { const [f1, f2, id] = s.wor(x, y, 4, 1); s.setId(x, y, f2 - f1 < 1 ? -1 : id); });
  s.bevel(P, (id) => 2 + (s.r(id, 0, 2) < 0.5 ? 1 : 0), { gap: P[0], rough: () => 0.9 });
  s.bump = 3;
}
