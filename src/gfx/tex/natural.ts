// Natural surfaces, painted as deliberate shapes with clean 4-6 tone hue-shifted ramps: sand (dry / wet / rippled),
// rock (granite blocks, basalt columns, limestone strata, mossy blocks), coral rock knobs, kelp blade, ice, bone.
// World surfaces are ~32 px per metre (a 64 px tile covers 2 m).
import { Surf, hramp, mixc, hex, type RGB } from './core';

// ------------------------------------------------------------------------------------------------ sand
/** a few hand-placed pebbles and shell flecks (lit upper-left, contact shadow) */
function pebbles(s: Surf, n: number, P: RGB[], seed: number) {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(s.r(k, 1, seed) * s.w), y = Math.floor(s.r(k, 2, seed) * s.h), r = 1 + Math.floor(s.r(k, 3, seed) * 2);
    s.ball(x, y, r + 0.4, r * 0.75 + 0.3, P, { shadow: 0.8, h: 0.25 });
  }
}
function shells(s: Surf, n: number, c: RGB, d: RGB, seed: number) {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(s.r(k, 1, seed) * s.w), y = Math.floor(s.r(k, 2, seed) * s.h);
    s.set(x, y, c); s.set(x + 1, y, c); s.set(x + 2, y + 1, d); s.set(x - 1, y + 1, d);
  }
}

export function sand(s: Surf) {
  const P = hramp('#b5a27c', 5, 0.42);
  // two broad, hard-edged tone zones; faint wind ripples as clean 1 px lines
  s.each((x, y) => {
    const z = s.zone(x, y, 2, 2, 1);
    let k = 2 + z;
    const yy = y + Math.round(Math.sin((x / s.w) * Math.PI * 2 * 2 + Math.floor(y / 9)) * 1.5);
    if (yy % 9 === 0) k = Math.min(4, k + 1); else if (yy % 9 === 1) k = Math.max(1, k - 1);
    s.set(x, y, P[k]);
    s.setH(x, y, yy % 9 === 0 ? 0.6 : 0.5);
    s.R(x, y, 0.95);
  });
  pebbles(s, Math.round(s.w * s.h / 700), hramp('#8a8070', 4, 0.5), 40);
  shells(s, Math.round(s.w * s.h / 900), hex('#e8dfcc'), P[1], 41);
  s.bump = 2;
}

export function sandWet(s: Surf) {
  const P = hramp('#7a6a50', 5, 0.42);
  s.each((x, y) => {
    const z = s.zone(x, y, 2, 2, 3);
    s.set(x, y, P[1 + z]);
    s.setH(x, y, 0.5);
    s.R(x, y, 0.85);
  });
  // standing water: clean puddle shapes, darker inside, a 1 px glint on the far rim
  for (let k = 0; k < 3; k++) {
    const cx = s.r(k, 1, 10) * s.w, cy = s.r(k, 2, 10) * s.h, rx = 4 + s.r(k, 3, 10) * 6, ry = rx * 0.45;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      s.set(x, y, P[0]); s.setH(x, y, 0.42); s.R(x, y, 0.6);
      if (d > 0.7 && y < cy) s.set(x, y, P[3]);
    }
  }
  pebbles(s, Math.round(s.w * s.h / 800), hramp('#5a554c', 4, 0.5), 11);
  shells(s, Math.round(s.w * s.h / 1200), hex('#c8bfac'), P[0], 12);
  s.bump = 2;
}

/** underwater ripple sand: clean asymmetric bands (lit crest, slope, shadowed lee), detritus in the troughs */
export function sandRipple(s: Surf) {
  const P = hramp('#b19d76', 6, 0.45);
  const per = 8;
  s.each((x, y) => {
    const band = Math.floor(y / per);
    const wob = Math.round(Math.sin((x / s.w) * Math.PI * 2 * 2 + band * 1.7) * 1.6 + Math.sin((x / s.w) * Math.PI * 2 + band) * 0.8);
    const f = ((y + wob) % per + per) % per;
    // 0: crest highlight, 1-3: lit stoss slope, 4-5: flat, 6: lee shadow, 7: trough
    const k = [5, 4, 4, 3, 3, 3, 1, 2][f];
    s.set(x, y, P[k]);
    s.setH(x, y, [0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.35, 0.3][f]);
    s.R(x, y, 0.95);
    // detritus collects in the troughs: short dark dashes at hashed spots
    if (f === 7 && s.r(Math.floor(x / 5), band, 20) < 0.3 && x % 5 < 2) s.set(x, y, P[0]);
  });
  shells(s, Math.round(s.w * s.h / 1000), hex('#e8e0cc'), P[1], 21);
  s.bump = 4;
}

// ------------------------------------------------------------------------------------------------ rock
/** irregular stone blocks from a coarse voronoi: dark joints, bevelled edges, one base tone per block */
function blocks(s: Surf, cells: number, seed: number, gapW = 1.1) {
  s.each((x, y) => {
    const [f1, f2, id] = s.wor(x, y, cells, seed);
    s.setId(x, y, f2 - f1 < gapW ? -1 : id);
  });
}
/** mineral flecks on a coarse grid (one deliberate 1-2 px cluster per cell), only inside blocks */
function flecks(s: Surf, step: number, cols: RGB[], seed: number) {
  for (let gy = 0; gy < s.h; gy += step) for (let gx = 0; gx < s.w; gx += step) {
    const x = gx + Math.floor(s.r(gx, gy, seed) * step), y = gy + Math.floor(s.r(gx, gy, seed + 1) * step);
    if (s.id(x, y) < 0) continue;
    const c = cols[Math.floor(s.r(gx, gy, seed + 2) * cols.length)];
    s.set(x, y, c); if (s.r(gx, gy, seed + 3) < 0.5) s.set(x + 1, y, c);
  }
}

export function granite(s: Surf) {
  const P = hramp('#7a736a', 6, 0.55);
  blocks(s, 3, 1);
  s.bevel(P, (id) => 2 + Math.floor(s.r(id, 0, 2) * 2), { gap: P[0], rough: () => 0.85 });
  flecks(s, 5, [P[0], hex('#c4b4a6'), hex('#b8b0a6')], 3);
  // two deliberate cracks
  for (let k = 0; k < 2; k++) s.crack(s.jag(s.r(k, 1, 4) * s.w, s.r(k, 2, 4) * s.h, s.r(k, 3, 4) * 6.28, 6, 2.5, 1.2, k), P[0], P[4]);
  s.bump = 4;
}

export function basalt(s: Surf) {
  const P = hramp('#3e3e44', 6, 0.6, 0.02);
  // columns: vertical strips of irregular width, each broken by horizontal joints at its own heights
  const cols = Math.max(4, Math.round(s.w / 11));
  const cw = s.w / cols;
  s.each((x, y) => {
    const c = Math.floor(x / cw), fx = x - c * cw;
    if (fx < 1) { s.setId(x, y, -1); return; }
    const rows = 2 + Math.floor(s.r(c, 0, 5) * 2), off = s.r(c, 1, 5) * s.h;
    const yy = (y + off) % s.h, rh = s.h / rows, row = Math.floor(yy / rh);
    if (yy - row * rh < 1) { s.setId(x, y, -1); return; }
    s.setId(x, y, c * 8 + row);
  });
  s.bevel(P, (id) => 2 + Math.floor(s.r(id, 0, 6) * 2), { gap: P[0], rough: () => 0.85 });
  // vesicles: deliberate pits (dark pixel, lit lower lip)
  for (let gy = 2; gy < s.h; gy += 7) for (let gx = 2; gx < s.w; gx += 6) {
    if (s.r(gx, gy, 7) < 0.45) continue;
    const x = gx + Math.floor(s.r(gx, gy, 8) * 4), y = gy + Math.floor(s.r(gx, gy, 9) * 4);
    if (s.id(x, y) < 0) continue;
    s.set(x, y, P[0]); s.set(x, y + 1, P[4]); s.addH(x, y, -0.2);
  }
  s.bump = 4;
}

export function limestone(s: Surf) {
  const P = hramp('#b0a68e', 6, 0.5);
  // strata of varying thickness; vertical joints break each layer into blocks
  const layers: number[] = [];
  let y0 = 0;
  while (y0 < s.h) { const t = 6 + Math.floor(s.r(layers.length, 0, 10) * 7); layers.push(y0); y0 += t; }
  const layerOf = (y: number) => { let l = 0; for (let i = 0; i < layers.length; i++) if (y >= layers[i]) l = i; return l; };
  s.each((x, y) => {
    const l = layerOf(y);
    if (y === layers[l]) { s.setId(x, y, -1); return; }
    const joints = 2 + Math.floor(s.r(l, 1, 11) * 2), off = s.r(l, 2, 11) * s.w, jw = s.w / joints;
    const xx = (x + off) % s.w;
    if (xx % jw < 1) { s.setId(x, y, -1); return; }
    s.setId(x, y, l * 8 + Math.floor(xx / jw));
  });
  s.bevel(P, (id) => (Math.floor(id / 8) % 2 === 0 ? 3 : 2) + (s.r(id, 0, 12) < 0.3 ? -1 : 0), { gap: P[0], rough: () => 0.9 });
  // a fossil shell and two solution pits per tile, all hand-placed
  const fx = Math.floor(s.r(1, 1, 13) * s.w), fy = Math.floor(s.r(1, 2, 13) * s.h);
  for (let a = 0; a < 6.0; a += 0.5) { const r = 1 + a * 0.35; s.set(fx + Math.round(Math.cos(a) * r), fy + Math.round(Math.sin(a) * r * 0.8), P[1]); }
  for (let k = 0; k < 2; k++) { const x = Math.floor(s.r(k, 3, 13) * s.w), y = Math.floor(s.r(k, 4, 13) * s.h); s.set(x, y, P[0]); s.set(x + 1, y, P[1]); s.set(x, y + 1, P[4]); }
  // dark water stains running down from two joints
  for (let k = 0; k < 2; k++) { const x = Math.floor(s.r(k, 5, 13) * s.w), y = layers[Math.floor(s.r(k, 6, 13) * layers.length)]; s.streak(x, y + 1, 8, P[1], P[2], 2); }
  s.bump = 3;
}

export function rockMossy(s: Surf) {
  const P = hramp('#6e6c62', 6, 0.55);
  const M = hramp('#56662e', 5, 0.5, 0.05);
  blocks(s, 3, 21);
  s.bevel(P, (id) => 2 + Math.floor(s.r(id, 0, 22) * 2), { gap: P[0], rough: () => 0.88 });
  // moss caps on the upper surface of every block: a band below its top edge, ragged in clean steps
  s.each((x, y) => {
    const a = s.id(x, y);
    if (a < 0) return;
    let up = 0;
    while (up < 7 && s.id(x, y - up - 1) === a) up++;
    const depth = 2 + Math.floor(s.r(a, Math.floor(x / 3), 23) * 3);
    if (up < depth) {
      s.set(x, y, up === 0 ? M[4] : up === depth - 1 ? M[1] : M[2 + (up === 1 ? 1 : 0)]);
      s.setH(x, y, 0.75); s.R(x, y, 0.97);
    } else if (up === depth && s.r(x, a, 24) < 0.25) s.set(x, y, M[0]); // a drip of moss hanging over the edge
  });
  flecks(s, 6, [P[0], P[5]], 25);
  s.bump = 4;
}

// ------------------------------------------------------------------------------------------------ coral
/** dead reef rock: packed knobs (old coral heads) ball-lit, polyp cups on a grid, coralline crust and turf */
export function coralRock(s: Surf) {
  const P = hramp('#b0a48c', 6, 0.55);
  const C = hramp('#9a6a72', 4, 0.45);
  const T = hramp('#4e5428', 4, 0.5);
  s.each((x, y) => { s.set(x, y, T[0]); s.setH(x, y, 0.2); s.R(x, y, 0.95); });
  // knobs from a voronoi: each cell's point is a knob centre, radius from its nearest neighbour gap
  const cells = Math.max(3, Math.round(s.w / 13));
  const cw = s.w / cells;
  for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) {
    const cx = (gx + 0.5 + (s.r(gx, gy, 31) - 0.5) * 0.6) * cw, cy = (gy + 0.5 + (s.r(gx, gy, 32) - 0.5) * 0.6) * cw;
    const r = cw * (0.45 + s.r(gx, gy, 33) * 0.2);
    const pal_ = s.r(gx, gy, 34) < 0.3 ? C : P;
    for (const [ox, oy] of [[0, 0], [s.w, 0], [-s.w, 0], [0, s.h], [0, -s.h]]) s.ball(cx + ox, cy + oy, r, r * 0.9, pal_, { rim: pal_[0], h: 0.5 });
    // polyp cups: dark pixel + lit lip, on a small grid inside the knob
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if ((i + j) % 2 !== 0) continue;
      const px = Math.round(cx + i * r * 0.45), py = Math.round(cy + j * r * 0.45);
      s.set(px, py, pal_[0]); s.set(px + 1, py + 1, pal_[Math.min(pal_.length - 1, 4)]); s.addH(px, py, -0.2);
    }
  }
  s.bump = 5;
}

// ------------------------------------------------------------------------------------------------ kelp
/** giant kelp blade: x across, y along. Golden-brown, pale midrib, lighter vein bands, darker ruffled edges */
export function kelp(s: Surf) {
  const P = hramp('#7a6a2a', 6, 0.55, 0.05);
  const mid = s.w / 2;
  s.each((x, y) => {
    const u = Math.abs(x + 0.5 - mid) / mid; // 0 at the midrib, 1 at the edge
    // bullations: diagonal bands between veins (chevrons pointing up the blade)
    const ch = (y + Math.floor(u * mid * 0.6)) % 8;
    let k = ch < 3 ? 3 : ch < 6 ? 2 : 4;
    if (u > 0.82) k = 1;                                  // thin, darker ruffled edge
    if (u > 0.92 && (y % 4) < 2) k = 0;
    if (u < 0.05) k = 5;                                  // midrib
    else if (u < 0.09) k = 4;
    s.set(x, y, P[k]);
    s.setH(x, y, ch < 3 ? 0.6 : 0.5);
    s.R(x, y, 0.75);
  });
  // a pale bryozoan crust patch and two small rot spots, hand-placed
  const bx = Math.floor(s.w * 0.7), by = Math.floor(s.r(1, 1, 5) * s.h);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) if ((i + j) % 2 === 0 || (i > 0 && i < 4 && j > 0 && j < 3)) s.set(bx + i, by + j, hex('#a8a48a'));
  for (let k = 0; k < 2; k++) { const x = Math.floor(s.w * (0.25 + k * 0.1)), y = Math.floor(s.r(k, 2, 5) * s.h); s.rect(x, y, 2, 2, P[0]); }
  s.bump = 2;
}

// ------------------------------------------------------------------------------------------------ ice
export function ice(s: Surf) {
  const P = hramp('#7cb4cc', 6, 0.5, 0.02);
  // big fracture planes: straight lines split the tile into shards; each shard a flat tone, deeper ones bluer
  const lines: [number, number, number][] = [];
  for (let k = 0; k < 4; k++) lines.push([s.r(k, 1, 3) * Math.PI, s.r(k, 2, 3) * s.w, s.r(k, 3, 3) * s.h]);
  s.each((x, y) => {
    let id = 0;
    lines.forEach(([a, lx, ly], k) => { if ((x - lx) * Math.sin(a) - (y - ly) * Math.cos(a) > 0) id |= 1 << k; });
    s.setId(x, y, id);
  });
  s.bevel(P, (id) => 2 + (id % 3), { hi: 2, rough: () => 0.6 });
  s.each((x, y) => s.A(x, y, 0.85 + (s.id(x, y) % 3) * 0.05));
  // trapped bubble strings: 1 px pale rings
  for (let k = 0; k < 4; k++) {
    let x = s.r(k, 4, 3) * s.w, y = s.r(k, 5, 3) * s.h;
    for (let i = 0; i < 4; i++) { s.set(x, y, P[5]); s.set(x + 1, y, P[4]); y -= 2 + s.r(k, i, 6) * 2; x += s.r(k, i, 7) < 0.5 ? 1 : 0; }
  }
  s.bump = 1.5;
}

// ------------------------------------------------------------------------------------------------ bone
/** aged bone: long grain lines along x, porous ends, a brown stain, a hairline crack */
export function bone(s: Surf) {
  const P = hramp('#c2b494', 6, 0.5);
  const lines = Array.from({ length: 6 }, (_, k) => Math.floor(s.r(k, 0, 1) * s.h));
  s.each((x, y) => {
    let k = 3 + s.zone(x, y, 2, 2, 2) - 1;
    for (const ly of lines) if (y === ly && (x + ly * 3) % 23 < 15) k -= 1;
    s.set(x, y, P[Math.max(1, k + 1)]);
    s.setH(x, y, 0.5);
    s.R(x, y, 0.8);
  });
  // pores: a few deliberate clusters
  for (let k = 0; k < 4; k++) {
    const cx = Math.floor(s.r(k, 1, 2) * s.w), cy = Math.floor(s.r(k, 2, 2) * s.h);
    for (const [dx, dy] of [[0, 0], [2, 1], [1, 3], [-1, 2]]) { s.set(cx + dx, cy + dy, P[1]); s.addH(cx + dx, cy + dy, -0.2); }
  }
  // stain: a clean blob one ramp step browner
  const st = mixc(P[2], hex('#7a5a3a'), 0.4);
  const sx = s.r(3, 3, 2) * s.w, sy = s.r(3, 4, 2) * s.h;
  for (let y = -3; y <= 3; y++) for (let x = -6; x <= 6; x++) if ((x / 6) ** 2 + (y / 3) ** 2 < 1) s.set(sx + x, sy + y, st);
  s.crack(s.jag(s.r(5, 1, 2) * s.w, s.r(5, 2, 2) * s.h, 0.1, 6, 3, 0.8, 9), P[0], P[4], 0.15);
  s.bump = 2;
}
