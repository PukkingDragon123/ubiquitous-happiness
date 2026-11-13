// Hideout surface textures: small, clean, deliberate pixel art (32-64 px tiles, nearest filtering) in 4-6 flat
// tones per material, with the light baked into the shapes (1 px lit top/left edges, 1 px shadowed bottom/right
// edges, darker mortar / seams as ambient occlusion). No per-pixel noise, no dither speckle: every pixel is part
// of a shape (a plank, a stone, a weave cell, a rivet).
//
//   TEX.rock() / TEX.floor() / TEX.wood('pine') ...   cached THREE textures (repeat-wrapped, nearest)
//   MAT.wood('pine') ...                              cached, flat-shaded, retro-patched MeshStandardMaterials
import * as THREE from 'three';
import { Px, hex, mix, type RGB } from '../gfx/px';
import { hash2, clamp01 } from '../core/math';
import { retro } from '../gfx/retro';

const memo = <T>(fn: () => T) => { let v: T | undefined; return () => (v ??= fn()); };
const memoK = <T>(fn: (k: string) => T) => { const m = new Map<string, T>(); return (k: string) => { let v = m.get(k); if (!v) { v = fn(k); m.set(k, v); } return v; }; };

/** n flat tones from dark to light around a base colour (shadows cool, lights warm) */
function tones(base: string, n = 5, spread = 0.55): RGB[] {
  const c = hex(base);
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i / (n - 1)) * 2 - 1; // -1..1
    if (k < 0) out.push(mix(c, [c[0] * 0.35 + 6, c[1] * 0.38 + 8, c[2] * 0.5 + 18], -k * spread * 1.3));
    else out.push(mix(c, [Math.min(255, c[0] * 1.25 + 40), Math.min(255, c[1] * 1.2 + 34), Math.min(255, c[2] * 1.1 + 20)], k * spread));
  }
  return out;
}
const H = (a: number, b: number, s: number) => hash2(a, b, s);

// ------------------------------------------------------------------ painters
/** cave rock (2 m tile): layered strata bands with a few clean fractures, lit lips and shadowed undersides */
function paintRock(outside: boolean): Px {
  const S = 64, p = new Px(S, S);
  const T = tones(outside ? '#4a4c56' : '#5a4636', 5, 0.6);
  // band boundaries (rows) with per-band tone, a gentle deterministic wave
  const bands: { y: number; t: number }[] = [];
  let y = 0, i = 0;
  while (y < S) { const h = 6 + Math.floor(H(i, 1, 7) * 9); bands.push({ y, t: 1 + Math.floor(H(i, 2, 7) * 3) }); y += h; i++; }
  const bandAt = (x: number, yy: number) => {
    const w = Math.round(Math.sin((x / S) * Math.PI * 2 + 0.7) * 1.5);
    let k = 0; for (let j = 0; j < bands.length; j++) if (((yy - w) % S + S) % S >= bands[j].y) k = j;
    return k;
  };
  p.fill((x, yy) => {
    const k = bandAt(x, yy), kUp = bandAt(x, yy - 1), kDn = bandAt(x, yy + 1);
    if (k !== kUp) return T[0];          // the seam: deep shadow
    if (k !== bandAt(x, yy - 2)) return T[4]; // lit lip just under the seam
    if (k !== kDn) return T[Math.max(0, bands[k].t - 1)]; // underside in shadow
    return T[bands[k].t];
  });
  // vertical fractures through a band: dark line + lit right edge
  for (let f = 0; f < 7; f++) {
    const x0 = Math.floor(H(f, 3, 9) * S), y0 = Math.floor(H(f, 4, 9) * S), len = 4 + Math.floor(H(f, 5, 9) * 8);
    for (let j = 0; j < len; j++) { const xx = (x0 + (j > len / 2 ? 1 : 0)) % S, yy = (y0 + j) % S; p.set(xx, yy, T[0]); p.set((xx + 1) % S, yy, T[3]); }
  }
  if (outside) {
    // clean coralline crust patches (pink) on a few band tops
    for (let c = 0; c < 6; c++) {
      const cx = Math.floor(H(c, 6, 3) * S), cy = Math.floor(H(c, 7, 3) * S), w = 4 + Math.floor(H(c, 8, 3) * 6);
      for (let j = 0; j < w; j++) { p.set((cx + j) % S, cy, '#b05a7a'); p.set((cx + j) % S, (cy + 1) % S, j % 3 ? '#8a3a5a' : '#b05a7a'); }
    }
  }
  return p;
}

/** stone block floor (2 m tile): running-bond blocks, dark mortar (AO), lit top-left edges, shadowed bottom-right */
function paintFloor(): Px {
  const S = 64, p = new Px(S, S);
  const sets = [tones('#7a6c5a', 5, 0.5), tones('#6c665e', 5, 0.5), tones('#7c6450', 5, 0.5)];
  const mortar = hex('#241c14'), mortarL = hex('#3a3024');
  const rowH = 16;
  for (let r = 0; r < S / rowH; r++) {
    const off = r % 2 ? 11 : 0;
    // block widths in this row (wrap)
    const cuts: number[] = [];
    let x = off;
    let k = 0;
    while (x < S + off) { cuts.push(x % S); x += 18 + Math.floor(H(r, k, 5) * 3) * 7; k++; }
    for (let yy = 0; yy < rowH; yy++) for (let xx = 0; xx < S; xx++) {
      const gy = r * rowH + yy;
      // which block: last cut <= xx (wrapping)
      let bi = -1, bx = 0;
      for (let c = 0; c < cuts.length; c++) { const d = ((xx - cuts[c]) % S + S) % S; if (bi < 0 || d < bx) { bi = c; bx = d; } }
      const T = sets[Math.floor(H(r, bi, 11) * 3)];
      const base = 2 + (H(r, bi, 13) > 0.6 ? 1 : 0);
      const nextCut = cuts[(bi + 1) % cuts.length];
      const bw = ((nextCut - cuts[bi]) % S + S) % S || S;
      let c: RGB;
      if (yy === 0 || bx === 0) c = mortar;
      else if (yy === rowH - 1 || bx === bw - 1) c = mortarL;
      else if (yy === 1 || bx === 1) c = T[base + 2 > 4 ? 4 : base + 2];
      else if (yy === rowH - 2 || bx === bw - 2) c = T[base - 2 < 0 ? 0 : base - 2];
      else c = T[base];
      p.set(xx, gy, c);
    }
    // a deliberate crack in some blocks
    if (H(r, 99, 3) > 0.4) { const cx = Math.floor(H(r, 98, 3) * (S - 10)) + 4; for (let j = 0; j < 6; j++) p.set(cx + j, r * rowH + 5 + Math.floor(j / 2), mortarL); }
  }
  return p;
}

/** seabed sand: flat with clean ripple lines */
function paintSand(): Px {
  const S = 32, p = new Px(S, S);
  const T = tones('#9a8c70', 4, 0.45);
  p.fill((x, y) => {
    const w = (y + Math.round(Math.sin((x / S) * Math.PI * 4) * 2) + S) % 8;
    return w === 0 ? T[1] : w === 1 ? T[3] : T[2];
  });
  return p;
}

const WOODS: Record<string, string> = { pine: '#a8723c', walnut: '#4e3020', oak: '#8a6236', drift: '#8a8478', red: '#7a3020', teak: '#6e4a26' };
/** planks (1 m tile at 64 px/m): 4 boards with clean grain strokes, lit/shaded edges, gaps and nail heads */
function paintWood(kind: string): Px {
  const S = 64, p = new Px(S, S);
  const T = tones(WOODS[kind] ?? WOODS.pine, 5, 0.5);
  const bw = 16;
  for (let b = 0; b < 4; b++) {
    const base = H(b, 1, 3) > 0.5 ? 2 : 3;
    const end = Math.floor(H(b, 5, 3) * S);
    for (let y = 0; y < S; y++) for (let i = 0; i < bw; i++) {
      const x = b * bw + i;
      let c = T[base];
      if (i === 0) c = T[0];
      else if (i === 1) c = T[4];
      else if (i === bw - 1) c = T[1];
      else {
        // two grain strokes per board, gently wavy (deterministic)
        for (const g of [5, 10]) { const gx = g + Math.round(Math.sin((y + b * 13 + g * 7) * 0.12) * 1.5); if (i === gx && (y + g * 3) % 23 < 17) c = T[base - 1]; }
      }
      if (y === end) c = T[0];
      else if (y === (end + 1) % S && i > 0) c = T[4];
      p.set(x, y, c);
    }
    // nails at the board end
    for (const nx of [4, 11]) { const ny = (end + 3) % S; p.set(b * bw + nx, ny, '#1c1a18'); p.set(b * bw + nx + 1, ny, '#7a7470'); p.set(b * bw + nx, ny + 1, '#3a3632'); p.set(b * bw + nx + 1, ny + 1, '#1c1a18'); }
  }
  return p;
}

const FAB: Record<string, string> = { mustard: '#b8862a', teal: '#2a6a6a', rust: '#94402a', plum: '#6a3058', olive: '#5a6430', navy: '#2e3e66', cream: '#c8bc9e' };
/** upholstery: a clean 2 x 2 basket weave with a stitched seam every 16 px */
function paintFabric(kind: string): Px {
  const S = 16, p = new Px(S, S);
  const T = tones(FAB[kind] ?? FAB.mustard, 4, 0.4);
  p.fill((x, y) => {
    if (y === 15) return T[0];
    if (y === 14 && x % 3 === 0) return T[3];
    const cell = ((x >> 1) + (y >> 1)) & 1;
    const inCell = cell ? (x & 1) : (y & 1);
    return cell ? (inCell ? T[2] : T[1]) : (inCell ? T[1] : T[2]);
  });
  return p;
}

/** chunky knit: rows of V stitches in stripes */
function paintKnit(a: string, b: string): Px {
  const S = 16, p = new Px(S, S);
  const A = tones(a, 3, 0.5), B = tones(b, 3, 0.5);
  p.fill((x, y) => {
    const row = Math.floor(y / 4), sx = x % 4, sy = y % 4;
    const T = row % 4 === 3 ? B : A;
    if (sy === 3) return T[0];
    if (sx === 0 || sx === 3) return sy === 0 ? T[1] : T[0];
    return sy === 0 ? T[2] : T[1];
  });
  return p;
}

/** a Persian rug (96 x 128, flat colours): fringe, guard stripes, a border of rosettes and vines, a lattice
 *  field, corner spandrels and a stepped central medallion with a star */
function paintRug(kind: string): Px {
  const W = 96, Hh = 128, p = new Px(W, Hh);
  const pal = kind === 'blue'
    ? { field: '#1e2c5a', field2: '#16224a', border: '#7a1e1e', border2: '#5a1414', motif: '#e0cfa2', ink: '#0c0e1e', accent: '#d89a2e', green: '#2e5a3a' }
    : { field: '#8a1c1c', field2: '#701616', border: '#1e2c5a', border2: '#16224a', motif: '#e8d6a8', ink: '#1a0808', accent: '#d89a2e', green: '#2e5a3a' };
  const C = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof pal, RGB>;
  const F = 4; // fringe rows
  p.fill((x, y) => {
    const dy0 = Math.min(y, Hh - 1 - y);
    if (dy0 < F) return x % 2 === 0 ? hex(dy0 === 0 ? '#c8bc9a' : '#e8dcc0') : null;
    const dx = Math.min(x, W - 1 - x), dy = dy0 - F;
    const d = Math.min(dx, dy);
    const along = dx < dy ? y : x;
    // outer guards
    if (d === 0) return C.ink;
    if (d === 1 || d === 2) return (along >> 1) % 2 ? C.accent : C.border2;
    if (d === 3) return C.ink;
    // main border band (d 4..13): rosettes every 12 px on a dark ground, joined by a vine
    if (d <= 13) {
      const bd = d - 4, u = along % 12;
      const cxu = Math.abs(u - 6), cyb = Math.abs(bd - 4.5);
      const ros = cxu + cyb;
      if (ros < 1.6) return C.accent;
      if (ros < 3.1) return (cxu + cyb) % 2 < 1 ? C.motif : C.green;
      if (ros < 4) return C.ink;
      if (bd === 4 || bd === 5) return (u + bd) % 3 === 0 ? C.motif : C.border;
      return C.border;
    }
    if (d === 14) return C.ink;
    if (d === 15 || d === 16) return (along + d) % 4 < 2 ? C.motif : C.accent;
    if (d === 17) return C.ink;
    // field
    const fx = x - W / 2 + 0.5, fy = y - Hh / 2 + 0.5;
    // stepped medallion (lozenge with 2 px steps)
    const md = Math.floor(Math.abs(fx) / 2) * 2 / 22 + Math.floor(Math.abs(fy) / 2) * 2 / 32;
    if (md < 1) {
      if (md > 0.92) return C.ink;
      if (md > 0.84) return C.motif;
      if (md > 0.78) return C.ink;
      const inner = Math.abs(fx) / 9 + Math.abs(fy) / 13;
      if (inner < 1) {
        // eight-point star
        const star = Math.min(Math.abs(fx) + Math.abs(fy) * 0.7, Math.max(Math.abs(fx), Math.abs(fy) * 0.7) * 1.3);
        if (star < 3) return C.accent;
        if (star < 5) return C.ink;
        return inner > 0.85 ? C.ink : C.motif;
      }
      return (Math.abs(fx) + Math.abs(fy)) % 6 < 1 ? C.accent : C.border;
    }
    // corner spandrels (quarter medallions)
    const sx = Math.abs(fx) - (W / 2 - 18), sy = Math.abs(fy) - (Hh / 2 - 22);
    if (sx > 0 && sy > 0) { const q = (W / 2 - 18 + 18 - Math.abs(fx)) / 18 + (Hh / 2 - 22 + 18 - Math.abs(fy)) / 18; void q; }
    const cxs = (W / 2 - 18) - Math.abs(fx), cys = (Hh / 2 - 22) - Math.abs(fy);
    if (cxs < 0 && cys < 0) { const r = -cxs - cys; if (r < 3) return C.ink; return r % 4 < 2 ? C.border : C.motif; }
    // lattice field: small diamonds with dot centres
    const lx = ((x - 18) % 10 + 10) % 10, ly = ((y - 22) % 12 + 12) % 12;
    const dd = Math.abs(lx - 5) + Math.abs(ly - 6);
    if (dd === 4) return C.motif;
    if (dd === 0) return C.accent;
    if (dd === 1) return C.ink;
    return (Math.floor(y / 3) + Math.floor(x / 4)) % 9 === 0 ? C.field2 : C.field;
  });
  return p;
}

const PAINT: Record<string, string> = { green: '#3a6a58', red: '#9a3226', yellow: '#b88e22', grey: '#5a6266' };
/** a painted steel panel (0.5 m tile): bevelled edges, corner rivets, one clean rust run */
function paintMetal(kind: string): Px {
  const S = 32, p = new Px(S, S);
  const T = tones(PAINT[kind] ?? PAINT.green, 5, 0.45);
  const R = tones('#8a4a1e', 3, 0.5);
  p.fill((x, y) => {
    if (x === 0 || y === 0) return T[4];
    if (x === S - 1 || y === S - 1) return T[0];
    if (x === 1 || y === 1) return T[3];
    if (x === S - 2 || y === S - 2) return T[1];
    // a rust run from the top rivet
    if (x >= 6 && x <= 7 && y > 4 && y < 12 + (x - 6) * 4) return x === 6 ? R[1] : R[0];
    return T[2];
  });
  for (const [rx, ry] of [[3, 3], [S - 4, 3], [3, S - 4], [S - 4, S - 4]]) { p.set(rx, ry, T[4]); p.set(rx + 1, ry, T[2]); p.set(rx, ry + 1, T[1]); p.set(rx + 1, ry + 1, T[0]); }
  return p;
}

/** polished brass: clean horizontal bands with a hot highlight line */
function paintBrass(): Px {
  const S = 16, p = new Px(S, S);
  const T = tones('#b88a2e', 5, 0.55);
  const band = [1, 2, 2, 3, 4, 4, 3, 2, 2, 1, 1, 2, 3, 3, 2, 0];
  p.fill((_x, y) => T[band[y]]);
  return p;
}

/** tufted leather: diamond tufting with buttons and creases (Chesterfield) */
function paintLeather(kind: string): Px {
  const S = 16, p = new Px(S, S);
  const T = tones(kind === 'black' ? '#2e2626' : '#7a3a22', 5, 0.45);
  p.fill((x, y) => {
    const u = (x + y) % 16, v = (x - y + 32) % 16;
    if (u === 0 || v === 0) return T[0];
    if (u === 1 || v === 1) return T[3];
    const du = Math.min(u, 16 - u), dv = Math.min(v, 16 - v);
    return du + dv > 9 ? T[3] : T[2];
  });
  for (const [bx, by] of [[0, 0], [8, 8]]) { p.set(bx, by, T[4]); p.set((bx + 1) % S, by, T[1]); }
  return p;
}

/** CRT TV cabinet: walnut veneer with clean flowing grain strokes */
const paintVeneer = () => {
  const S = 32, p = new Px(S, S);
  const T = tones('#5a3418', 5, 0.45);
  p.fill((x, y) => {
    const g = (y + Math.round(Math.sin(x * 0.2) * 2 + Math.sin(x * 0.05) * 3) + S) % 8;
    return g === 0 ? T[1] : g === 4 ? T[3] : T[2];
  });
  return p;
};

/** a row of book spines (64 x 32): varied colours, heights, gilt bands */
function paintBooks(): Px {
  const p = new Px(64, 32);
  const cols = ['#7a1e1e', '#1e3a6a', '#2a5a2a', '#6a4a1a', '#4a1e5a', '#1e5a5a', '#8a6a2a', '#3a3a3a', '#a04a20'];
  p.fill(() => hex('#1a120c'));
  let x = 0, k = 0;
  while (x < 64) {
    const w = 3 + Math.floor(H(k, 1, 4) * 4), h = 20 + Math.floor(H(k, 2, 4) * 11);
    const c = hex(cols[Math.floor(H(k, 3, 4) * cols.length)]);
    for (let i = 0; i < w && x + i < 64; i++) for (let j = 32 - h; j < 32; j++) {
      let cc: RGB = i === 0 ? mix(c, [0, 0, 0], 0.45) : i === 1 ? mix(c, [255, 240, 220], 0.25) : c;
      if (j === 32 - h + 3 || j === 29) cc = hex('#d8b04a');
      if (j === 32 - h) cc = hex('#e8dcc0');
      p.set(x + i, j, cc);
    }
    x += w; k++;
  }
  return p;
}

/** pegboard: brown board with a grid of holes (each hole lit on the lower lip) */
function paintPegboard(): Px {
  const S = 16, p = new Px(S, S);
  const T = tones('#7a5a34', 4, 0.4);
  p.fill((x, y) => (x % 8 === 3 && y % 8 === 3 ? T[0] : x % 8 === 3 && y % 8 === 4 ? T[3] : T[2]));
  return p;
}

/** one flat colour */
function paintPlain(col: string): Px { const p = new Px(4, 4); const c = hex(col); p.fill(() => c); return p; }

/** a kelp blade (alpha cut-out): ruffled edge, midrib, gas bladder at the base */
function paintKelp(): Px {
  const W = 16, Hh = 64, p = new Px(W, Hh);
  const T = tones('#5a7a20', 5, 0.5);
  for (let y = 0; y < Hh; y++) {
    const half = Math.round(3 + Math.abs(Math.sin(y * 0.4)) * 1.5 + 2 * Math.min(1, y / 10));
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - W / 2);
      if (dx > half) continue;
      p.set(x, y, dx < 1 ? T[4] : dx > half - 1 ? T[0] : (y % 6 === 0 && dx > 1) ? T[1] : T[2]);
    }
  }
  p.ellipse(W / 2, Hh - 4, 3, 3.5, (nx, ny) => (nx + ny < -0.4 ? hex('#d8c060') : hex('#9a8a28')));
  return p;
}

/** soft vertical streak for god-ray cards (white, banded alpha) */
function paintRay(): Px {
  const W = 32, Hh = 64, p = new Px(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = y / Hh;
    const s = Math.pow(Math.sin(u * Math.PI), 2.5) * (0.8 + 0.2 * Math.sin(x * 0.9));
    const fade = Math.pow(1 - v, 0.6) * Math.min(1, v * 6 + 0.3);
    p.set(x, y, [255, 255, 255], Math.round(clamp01(s * fade) * 4) / 4 * 255);
  }
  return p;
}

/** a small framed painting (a blobfish portrait / a sunset / a whale) */
function paintPainting(kind: string): Px {
  const W = 32, Hh = 24, p = new Px(W, Hh);
  if (kind === 'whale') {
    p.fill((_x, y) => (y < 8 ? hex('#4aa0c8') : y < 16 ? hex('#2a6a9a') : hex('#1a3a6a')));
    p.ellipse(15, 13, 10, 4, '#2a3a52'); p.poly([[24, 12], [30, 8], [29, 15]], '#2a3a52'); p.ellipse(13, 15, 7, 2, '#c8ccd0');
    p.set(9, 12, '#ffffff');
  } else if (kind === 'sunset') {
    p.fill((_x, y) => (y < 5 ? hex('#ffcc6a') : y < 10 ? hex('#f08a5a') : y < 14 ? hex('#c8487a') : y < 19 ? hex('#2a4a8a') : hex('#0e1a3a')));
    p.circle(16, 14, 5, '#fff2b0');
    for (let y = 15; y < 24; y += 2) p.rect(12 + (y % 3), y, 8 - (y - 15) / 2, 1, '#ffdc8a');
  } else {
    p.fill((_x, y) => (y < 12 ? hex('#3a2a4a') : hex('#2a1a3a')));
    p.ellipse(16, 14, 9, 8, (nx, ny) => (ny < -0.3 ? hex('#ffc8d4') : nx + ny > 0.6 ? hex('#c86a88') : hex('#f4a0b4')));
    p.ellipse(18, 18, 4, 3, '#e090a8');
    p.set(13, 11, '#1a0a10'); p.set(19, 11, '#1a0a10'); p.set(13, 10, '#ffffff');
    p.rect(14, 21, 5, 1, '#6a2a3a');
  }
  p.outline('#1a0c06');
  return p;
}

// ------------------------------------------------------------------ textures
function tx(p: Px, repeat = true) {
  const t = p.texture({ repeat, mip: false });
  return t;
}

export const TEX = {
  rock: memo(() => tx(paintRock(false))),
  rockOut: memo(() => tx(paintRock(true))),
  floor: memo(() => tx(paintFloor())),
  sand: memo(() => tx(paintSand())),
  wood: memoK((k) => tx(paintWood(k))),
  fabric: memoK((k) => tx(paintFabric(k))),
  knit: memoK((k) => { const [a, b] = k.split('/'); return tx(paintKnit(a, b)); }),
  rug: memoK((k) => tx(paintRug(k), false)),
  metal: memoK((k) => tx(paintMetal(k))),
  brass: memo(() => tx(paintBrass())),
  leather: memoK((k) => tx(paintLeather(k))),
  veneer: memo(() => tx(paintVeneer())),
  books: memo(() => tx(paintBooks())),
  pegboard: memo(() => tx(paintPegboard())),
  plain: memoK((k) => tx(paintPlain(k))),
  kelp: memo(() => { const t = paintKelp().texture({ mip: false }); return t; }),
  ray: memo(() => { const t = paintRay().texture({ mip: false }); t.colorSpace = THREE.NoColorSpace; return t; }),
  painting: memoK((k) => tx(paintPainting(k), false)),
};

// ------------------------------------------------------------------ materials (all flat shaded: hard PS2 facets)
type MatOpts = { tileM?: number; rough?: number; metal?: number; emissive?: string; emissiveI?: number; side?: THREE.Side; color?: string; alphaTest?: number; flat?: boolean; snap?: number };
function std(map: THREE.Texture | null, o: MatOpts = {}) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, color: o.color ?? '#ffffff', alphaTest: o.alphaTest ?? 0, flatShading: o.flat ?? true });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveI ?? 1; }
  // metres covered by one texture tile (the prop kit maps uvs to keep a constant texel density)
  m.userData.tileM = o.tileM ?? 1;
  return retro(m, { snap: o.snap ?? 1 });
}
export const MAT = {
  rock: memo(() => std(TEX.rock(), { rough: 0.95, tileM: 2 })),
  rockOut: memo(() => std(TEX.rockOut(), { rough: 0.95, tileM: 2 })),
  floor: memo(() => std(TEX.floor(), { rough: 0.85, tileM: 2 })),
  sand: memo(() => std(TEX.sand(), { rough: 1, tileM: 1 })),
  wood: memoK((k) => std(TEX.wood(k), { rough: 0.8 })),
  fabric: memoK((k) => std(TEX.fabric(k), { rough: 0.95, tileM: 0.25 })),
  knit: memoK((k) => std(TEX.knit(k), { rough: 1, tileM: 0.25 })),
  rug: memoK((k) => std(TEX.rug(k), { rough: 1, alphaTest: 0.5, side: THREE.DoubleSide })),
  metal: memoK((k) => std(TEX.metal(k), { rough: 0.6, metal: 0.25, tileM: 0.5 })),
  brass: memo(() => std(TEX.brass(), { rough: 0.4, metal: 0.7, tileM: 0.25 })),
  leather: memoK((k) => std(TEX.leather(k), { rough: 0.65, tileM: 0.25 })),
  veneer: memo(() => std(TEX.veneer(), { rough: 0.55, tileM: 0.5 })),
  books: memo(() => std(TEX.books(), { rough: 0.85 })),
  pegboard: memo(() => std(TEX.pegboard(), { rough: 0.9, tileM: 0.25 })),
  plain: memoK((k) => { const [col, r, m] = k.split('/'); return std(TEX.plain(col), { rough: r ? +r : 0.6, metal: m ? +m : 0 }); }),
  glow: memoK((k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(k).multiplyScalar(2.2), toneMapped: true }); return retro(m); }),
  painting: memoK((k) => std(TEX.painting(k), { rough: 0.7 })),
  dark: memo(() => std(null, { color: '#0a0806', rough: 1, side: THREE.DoubleSide })),
};
