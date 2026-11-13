// Natural surfaces: sand (dry / wet / rippled), rock (granite, basalt, limestone, mossy), coral rock, kelp
// blade, ice, bone. World surfaces are painted at ~32 px per metre (a 64 px tile covers 2 m).
import { Surf, pal, mixc, scl, clamp01, smooth, hex, type RGB } from './core';

// ------------------------------------------------------------------------------------------------ sand
const SAND_DRY = pal('#5f523f', '#76674f', '#8b7b5f', '#9f8f71', '#b2a283', '#c3b594', '#d2c6a8');
const SAND_WET = pal('#2f281f', '#3d3428', '#4b4031', '#5a4d3b', '#6a5b46', '#7b6b53', '#8d7c62');
const GRAINS_DARK = pal('#3a342c', '#2e2a26', '#4a3f34');
const GRAINS_PALE = pal('#cfc4ac', '#d6ccb6', '#c8bca0');
const GRAINS_WARM = pal('#a2765a', '#8a6248', '#b48a64');

function sandBase(s: Surf, P: RGB[], dark: number) {
  s.each((x, y) => {
    const macro = s.n(x, y, 3, 3, 1), meso = s.n(x, y, 10, 2, 2), g = s.r(x, y, 3);
    const t = 0.18 + macro * 0.45 + meso * 0.22 + (g - 0.5) * 0.36 - dark;
    s.set(x, y, s.pick(P, t, x, y, 1.2));
    s.setH(x, y, 0.5 + (macro - 0.5) * 0.3 + (g - 0.5) * 0.12);
  });
}

export function sand(s: Surf) {
  sandBase(s, SAND_DRY, 0);
  s.speckle(GRAINS_DARK, 0.035, 1, -0.04);
  s.speckle(GRAINS_PALE, 0.01, 2, 0.05);
  s.speckle(GRAINS_WARM, 0.012, 3);
  // footprint-less, wind-scoured: a few small pebbles and shell flecks
  for (let k = 0; k < 4; k++) s.bump2(Math.floor(s.r(k, 0, 40) * s.w), Math.floor(s.r(k, 1, 40) * s.h), 1, pal('#4a4038', '#6a6056', '#8a8276', '#aaa496'), 0.25);
  s.cavity(hex('#5a4c3a'), 0.25, 1, 0.1);
  s.each((x, y) => s.R(x, y, 0.92 + s.r(x, y, 8) * 0.06));
  s.bump = 2;
}

export function sandWet(s: Surf) {
  sandBase(s, SAND_WET, 0.02);
  s.speckle(GRAINS_DARK.map((c) => scl(c, 0.8)), 0.04, 1, -0.04);
  s.speckle(GRAINS_PALE.map((c) => scl(c, 0.82)), 0.016, 2, 0.05);
  s.speckle(pal('#2a2c1e', '#30301f'), 0.01, 4); // organic detritus
  // standing film of water in the low spots: darker, glossy
  s.each((x, y) => {
    const m = s.n(x, y, 4, 3, 30);
    const wet = smooth(0.45, 0.65, m);
    if (wet > s.ct(x, y)) { s.shade(x, y, 0.86); s.R(x, y, 0.18); }
    else s.R(x, y, 0.55 + s.r(x, y, 9) * 0.15);
  });
  s.cavity(hex('#2a241c'), 0.35, 1, 0.08);
  s.bump = 2;
}

/** underwater ripple sand: asymmetric ripples (gentle stoss, steep lee), detritus collecting in the troughs */
export function sandRipple(s: Surf) {
  const lam = Math.max(6, Math.round(s.w / Math.round(s.w / 11)));
  const waves = Math.round(s.w / lam);
  s.each((x, y) => {
    const warp = (s.n(x, y, 2, 2, 50) - 0.5) * 2.4 + (s.n(x, y, 5, 2, 51) - 0.5) * 0.7;
    const ph = ((x / s.w) * waves + warp + y / s.h * 0) % 1;
    const f = ((ph % 1) + 1) % 1;
    // asymmetric profile: slow rise, sharp drop
    const prof = f < 0.72 ? Math.sin((f / 0.72) * Math.PI * 0.5) : Math.cos(((f - 0.72) / 0.28) * Math.PI * 0.5);
    const g = s.r(x, y, 3);
    const lit = f < 0.72 ? 0.62 + prof * 0.25 : 0.32 + prof * 0.2; // stoss faces the light
    const t = lit * 0.7 + s.n(x, y, 3, 2, 52) * 0.25 + (g - 0.5) * 0.28 - 0.05;
    s.set(x, y, s.pick(SAND_DRY, t, x, y, 1.1));
    s.setH(x, y, 0.3 + prof * 0.45 + (g - 0.5) * 0.06);
    s.R(x, y, 0.9);
    // troughs collect dark detritus and shell grit
    if (prof < 0.18 && s.r(x, y, 60) < 0.32) s.set(x, y, s.r(x, y, 61) < 0.7 ? hex('#4a4232') : hex('#d8cfbc'));
  });
  s.speckle(GRAINS_DARK, 0.02, 1, -0.03);
  s.speckle(GRAINS_PALE, 0.01, 2, 0.03);
  s.bump = 5;
}

// ------------------------------------------------------------------------------------------------ rock
const GRANITE = pal('#2f2c2b', '#423e3b', '#55504b', '#68625b', '#7b746c', '#8e867d', '#a1998f', '#b6aea3');
function granitePaint(s: Surf, P: RGB[]) {
  // at ~32 px/m the crystals are sub-pixel: granite reads as a fine salt-and-pepper speckle over a soft mottle
  s.each((x, y) => {
    const n = s.n(x, y, 3, 3, 1) * 0.65 + s.n(x, y, 12, 2, 7) * 0.35;
    const base = s.pick(P, 0.22 + n * 0.55 + (s.r(x, y, 2) - 0.5) * 0.3, x, y, 1.2);
    s.setH(x, y, 0.45 + n * 0.25 + s.r(x, y, 4) * 0.08);
    const h = s.r(x, y, 1);
    let c = base;
    if (h < 0.07) c = mixc(base, hex('#b49a8e'), 0.35); // feldspar (pinkish)
    else if (h < 0.1) { c = mixc(base, hex('#d8d4cc'), 0.35); s.addH(x, y, 0.05); } // quartz
    else if (h < 0.17) c = scl(base, 0.62); // biotite / hornblende
    s.set(x, y, c);
    s.R(x, y, 0.8 + s.r(x, y, 5) * 0.12);
  });
  // a few short joints and hairline cracks (nothing spanning the tile: that would show the repeat)
  for (let k = 0; k < 3; k++) s.crack(Math.floor(s.r(k, 2, 31) * s.w), Math.floor(s.r(k, 3, 31) * s.h), 8 + Math.floor(s.r(k, 4, 31) * s.w * 0.25), s.r(k, 5, 31) - 0.5, s.r(k, 6, 31) - 0.5, P[1], P[5], 0.5, 0.18, 7 + k);
  for (let k = 0; k < 4; k++) s.crack(Math.floor(s.r(k, 7, 31) * s.w), Math.floor(s.r(k, 8, 31) * s.h), 3 + Math.floor(s.r(k, 9, 31) * 5), s.r(k, 10, 31) - 0.5, s.r(k, 11, 31) - 0.5, P[2], null, 0.7, 0.08, 20 + k);
}
export function granite(s: Surf) {
  granitePaint(s, GRANITE);
  s.cavity(hex('#1e1c1b'), 0.45, 2, 0.12);
  s.grime(hex('#3a4038'), 0.5, 3, 0.6); // faint biofilm
  s.bump = 3.5;
}

const BASALT = pal('#141416', '#1c1c1f', '#252529', '#2f2f34', '#3a3a3f', '#46454b', '#545258');
export function basalt(s: Surf) {
  // columnar-jointed blocks (voronoi), each a slightly different tone, bevelled edges
  s.each((x, y) => {
    const [f1, f2, id] = s.wor(x, y, 2, 1);
    const e = f2 - f1;
    const n = s.n(x, y, 8, 3, 2), m = s.n(x, y, 3, 3, 6);
    let t = 0.3 + id * 0.2 + (n - 0.5) * 0.45 + (m - 0.5) * 0.3 + (s.r(x, y, 3) - 0.5) * 0.25;
    let h = 0.6 + (n - 0.5) * 0.25;
    if (e < 0.8 && s.r(x, y, 7) < 0.85) { t = 0.04; h = 0.2; } else if (e < 1.8) { t += 0.1; h = 0.55; }
    s.set(x, y, s.pick(BASALT, t, x, y));
    s.setH(x, y, h);
    s.R(x, y, 0.82);
  });
  // vesicles: frozen gas bubbles (dark pit, lit lower rim)
  for (let k = 0; k < (s.w * s.h) / 110; k++) {
    const x = Math.floor(s.r(k, 1, 40) * s.w), y = Math.floor(s.r(k, 2, 40) * s.h);
    s.set(x, y, BASALT[0]); s.addH(x, y, -0.2);
    if (s.r(k, 3, 40) < 0.5) { s.set(x + 1, y, BASALT[0]); s.addH(x + 1, y, -0.2); }
    s.set(x, y + 1, BASALT[5]);
  }
  // iron oxide weathering
  s.grime(hex('#5a3424'), 0.55, 3, 0.62, 3);
  s.speckle(pal('#6a6870', '#585660'), 0.02, 5);
  s.cavity(hex('#0a0a0c'), 0.35, 1, 0.12);
  s.bump = 4;
}

const LIME = pal('#5c5649', '#746c5c', '#8a826f', '#9f9781', '#b2aa92', '#c3bca4', '#d2ccb6');
export function limestone(s: Surf) {
  s.each((x, y) => {
    const xx = x + (s.n(x, y, 2, 2, 3) - 0.5) * 8;
    const bed = Math.sin((y / s.h) * Math.PI * 2 * 4 + (s.n(x, y, 3, 2, 4) - 0.5) * 3);
    const n = s.n(x, y, 4, 3, 1);
    const t = 0.32 + n * 0.45 + bed * 0.06 + (s.r(x, y, 2) - 0.5) * 0.2 + Math.sin((xx / s.w) * Math.PI * 14) * 0.04;
    s.set(x, y, s.pick(LIME, t, x, y));
    s.setH(x, y, 0.5 + n * 0.25 + bed * 0.04);
    s.R(x, y, 0.88);
    // thin bedding planes
    if (Math.abs(bed) > 0.985 && s.r(x, y, 5) < 0.8) { s.set(x, y, LIME[1]); s.addH(x, y, -0.12); }
  });
  // fossils: small shell arcs and crinoid discs
  for (let k = 0; k < (s.w * s.h) / 1400; k++) {
    const cx = s.r(k, 1, 50) * s.w, cy = s.r(k, 2, 50) * s.h, r = 1.2 + s.r(k, 3, 50) * 1.6, rot = s.r(k, 4, 50) * 6.28;
    for (let a = 0; a < Math.PI * (s.r(k, 5, 50) < 0.5 ? 1 : 2); a += 0.35) {
      const x = cx + Math.cos(a + rot) * r, y = cy + Math.sin(a + rot) * r * 0.75;
      s.blend(x, y, LIME[6], 0.55); s.blend(x + 1, y + 1, LIME[2], 0.35);
    }
  }
  // solution pits
  for (let k = 0; k < (s.w * s.h) / 160; k++) { const x = Math.floor(s.r(k, 1, 60) * s.w), y = Math.floor(s.r(k, 2, 60) * s.h); s.set(x, y, LIME[0]); s.addH(x, y, -0.25); s.set(x, y + 1, LIME[5]); }
  s.drips(hex('#4a4a3c'), Math.round(s.w / 10), s.h * 0.5, 0.22, 2);
  s.cavity(hex('#3a362c'), 0.4, 2, 0.1);
  s.bump = 3;
}

const MOSS = pal('#13170c', '#1b2110', '#242c14', '#2f3718', '#3b421c', '#494f22', '#585d2a');
export function rockMossy(s: Surf) {
  granitePaint(s, GRANITE.map((c) => mixc(c, hex('#4a5040'), 0.15)));
  s.cavity(hex('#1e1c1b'), 0.4, 2, 0.1);
  // cushion moss / algal turf: domed clumps lit from above, dark crevices
  s.each((x, y) => {
    const m = s.n(x, y, 3, 3, 70) * 0.75 + s.n(x, y, 9, 2, 71) * 0.25;
    const cover = smooth(0.42, 0.6, m);
    if (cover < s.ct(x, y)) return;
    const [f1, f2, id, px, py] = s.wor(x, y, s.w / 4, 72);
    const e = f2 - f1;
    const lit = clamp01(0.55 - ((x - px) + (y - py)) * 0.12 + (id - 0.5) * 0.35);
    s.set(x, y, e < 0.8 ? MOSS[0] : s.pick(MOSS, lit * 0.85 + 0.1, x, y));
    s.setH(x, y, 0.75 + (1 - f1 / 3) * 0.15);
    s.R(x, y, 0.95);
  });
  s.speckle(pal('#6a7036', '#5e6430'), 0.006, 9);
  s.bump = 3.5;
}

// ------------------------------------------------------------------------------------------------ coral
const CORAL = pal('#4a423a', '#62584c', '#7c705f', '#968a76', '#ada28c', '#c2b8a0', '#d6cdb6');
const CORALLINE = pal('#5e3a40', '#74484e', '#8a5a5e', '#9e6e70', '#b08484');
const TURF = pal('#2e3418', '#3e4620', '#4e582a', '#626c34');
/** dead reef rock: knobbly bleached limestone (old coral heads), pitted with corallite cups and borer holes, muted
 *  coralline crust on the knob tops, green-brown turf algae settling in the hollows */
export function coralRock(s: Surf) {
  const hk = new Float32Array(s.w * s.h);
  s.each((x, y) => {
    const [f1] = s.wor(x, y, 4, 1), [g1] = s.wor(x, y, 9, 2);
    const k1 = Math.max(0, 1 - f1 / (s.w / 4 * 0.75)), k2 = Math.max(0, 1 - g1 / (s.w / 9 * 0.7));
    hk[y * s.w + x] = Math.sqrt(k1) * 0.65 + Math.sqrt(k2) * 0.25 + s.n(x, y, 8, 2, 3) * 0.1;
  });
  const Hh = (x: number, y: number) => hk[s.i(x, y)];
  s.each((x, y) => {
    const h = Hh(x, y);
    const lit = clamp01(0.5 + ((Hh(x - 1, y - 1) - Hh(x + 1, y + 1)) * 3.2) + (h - 0.5) * 0.4);
    const [p1] = s.wor(x, y, s.w / 4.5, 4);
    let t = lit * 0.75 + 0.12 + (s.r(x, y, 5) - 0.5) * 0.18;
    let c: RGB = s.pick(CORAL, t, x, y, 1.1);
    s.setH(x, y, h);
    s.R(x, y, 0.92);
    if (p1 < 1.0 && h > 0.25) { c = s.pick(CORAL, t - 0.45, x, y); s.addH(x, y, -0.15); } // corallite cups
    // coralline crust on the tops, turf in the hollows
    const cr = s.n(x, y, 3, 3, 80);
    if (h > 0.55 && cr > 0.58 && (cr - 0.58) * 6 > s.ct(x, y)) { c = s.pick(CORALLINE, lit * 0.8 + 0.1, x, y); s.R(x, y, 0.75); }
    if (h < 0.32 && s.n(x, y, 4, 2, 82) > 0.45) { c = s.pick(TURF, lit * 0.7 + s.r(x, y, 83) * 0.2, x, y); s.R(x, y, 0.98); }
    s.set(x, y, c);
  });
  for (let k = 0; k < (s.w * s.h) / 300; k++) { const x = Math.floor(s.r(k, 1, 90) * s.w), y = Math.floor(s.r(k, 2, 90) * s.h); s.set(x, y, hex('#1a1612')); s.addH(x, y, -0.35); s.blend(x + 1, y + 1, CORAL[5], 0.5); }
  s.cavity(hex('#2a241e'), 0.45, 1, 0.12);
  s.bump = 4;
}

// ------------------------------------------------------------------------------------------------ kelp
const KELP = pal('#1c180a', '#2a240e', '#3a3212', '#4c4216', '#5e521c', '#726424', '#88782e', '#a08e3a');
/** giant kelp blade: x across the blade, y along it. Bullate corrugations, darker edges, a pale midrib */
export function kelp(s: Surf) {
  s.each((x, y) => {
    const u = x / s.w;
    const edge = 1 - Math.abs(u - 0.5) * 2;
    const wav = Math.sin((y / s.h) * Math.PI * 2 * 6 + (s.n(x, y, 2, 2, 1) - 0.5) * 3 + Math.abs(u - 0.5) * 6);
    const n = s.n(x, y, 3, 3, 2);
    const t = 0.28 + wav * 0.14 + n * 0.3 + edge * 0.18 + (s.r(x, y, 3) - 0.5) * 0.12 + s.na(x, y, 16, 2, 2, 4) * 0.12;
    s.set(x, y, s.pick(KELP, t, x, y));
    s.setH(x, y, 0.5 + wav * 0.2);
    s.R(x, y, 0.38 + s.r(x, y, 4) * 0.1);
    // translucent glow toward the middle: kelp is backlit, warmer gold where thin
    if (Math.abs(u - 0.5) < 0.03) { s.set(x, y, KELP[6]); s.addH(x, y, 0.1); }
  });
  // bryozoan crusts (pale lacy patches) and small dark rot spots
  for (let k = 0; k < Math.max(2, s.w / 20); k++) {
    const cx = s.r(k, 1, 30) * s.w, cy = s.r(k, 2, 30) * s.h, r = 2 + s.r(k, 3, 30) * 3;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) / r; if (d < 1 && (1 - d) * 1.4 > s.ct(cx + x, cy + y)) s.blend(cx + x, cy + y, hex('#a8a48e'), 0.55); }
  }
  for (let k = 0; k < s.w / 12; k++) { const x = s.r(k, 1, 40) * s.w, y = s.r(k, 2, 40) * s.h; s.set(x, y, KELP[0]); s.blend(x + 1, y, KELP[1], 0.6); s.blend(x, y + 1, KELP[1], 0.6); }
  s.bump = 2.5;
}

// ------------------------------------------------------------------------------------------------ ice
const ICE = pal('#23404e', '#335a6a', '#4a7486', '#6690a2', '#86acbc', '#a8c8d4', '#cce2ea', '#ecf6fa');
export function ice(s: Surf) {
  s.each((x, y) => {
    const deep = s.n(x, y, 2, 3, 1), n = s.n(x, y, 6, 2, 2);
    const t = 0.25 + deep * 0.45 + n * 0.2 + (s.r(x, y, 3) - 0.5) * 0.08;
    s.set(x, y, s.pick(ICE, t, x, y, 0.8));
    s.setH(x, y, 0.5 + (n - 0.5) * 0.15);
    s.R(x, y, 0.12 + (1 - deep) * 0.2);
    s.A(x, y, 0.82 + deep * 0.18);
  });
  // fracture planes: straight bright lines with a dark twin
  for (let k = 0; k < 5; k++) {
    let x = s.r(k, 1, 20) * s.w, y = s.r(k, 2, 20) * s.h;
    const a = s.r(k, 3, 20) * Math.PI, L = s.w * (0.3 + s.r(k, 4, 20) * 0.5);
    for (let i = 0; i < L; i++) { s.blend(x, y, ICE[7], 0.7); s.blend(x + 1, y + 1, ICE[1], 0.4); x += Math.cos(a); y += Math.sin(a); }
  }
  // trapped bubbles (strings of white dots) and frost bloom
  for (let k = 0; k < (s.w * s.h) / 90; k++) {
    const x = Math.floor(s.r(k, 1, 30) * s.w), y = Math.floor(s.r(k, 2, 30) * s.h);
    s.set(x, y, ICE[7]); if (s.r(k, 3, 30) < 0.4) s.set(x, y - 1, ICE[6]);
  }
  s.grime(ICE[7], 0.6, 4, 0.66, 5, 0.65);
  s.bump = 1.5;
}

// ------------------------------------------------------------------------------------------------ bone
const BONE = pal('#4a4234', '#655b48', '#80755e', '#9a8f76', '#b2a78c', '#c8bea2', '#dcd4ba');
/** aged bone: longitudinal fibrous grain along x, porous patches, brown stains, hairline cracks */
export function bone(s: Surf) {
  s.each((x, y) => {
    const fib = s.na(x, y, 3, 18, 3, 1);
    const n = s.n(x, y, 3, 3, 2);
    const t = 0.45 + (fib - 0.5) * 0.5 + (n - 0.5) * 0.4 + (s.r(x, y, 3) - 0.5) * 0.12;
    s.set(x, y, s.pick(BONE, t, x, y));
    s.setH(x, y, 0.5 + (fib - 0.5) * 0.2);
    s.R(x, y, 0.62);
    // cancellous pores
    const p = s.n(x, y, 4, 2, 4);
    if (p > 0.64 && s.r(x, y, 5) < (p - 0.64) * 3) { s.set(x, y, BONE[1]); s.addH(x, y, -0.2); }
  });
  s.grime(hex('#6a4a2a'), 0.6, 3, 0.58, 2);
  for (let k = 0; k < 3; k++) s.crack(s.r(k, 1, 9) * s.w, s.r(k, 2, 9) * s.h, s.w * 0.3, 1, (s.r(k, 3, 9) - 0.5) * 0.4, BONE[1], null, 0.4, 0.15, k);
  s.cavity(hex('#3a3024'), 0.4, 1, 0.12);
  s.bump = 2.5;
}
