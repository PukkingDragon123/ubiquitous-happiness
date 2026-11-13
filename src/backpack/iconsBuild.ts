// Icons for the v2 build items (mage, warrior, summoner/toymaker, tinkerer, rogue + new materials), painted on
// the same height-field pixel painter as every other item (iconPaint.ts): one light, hue-shifted ramps, glints,
// coloured outlines. 32 px per grid cell.
import { Ic, pal, starPoly, bez, bez3, curve, polyDist } from './iconPaint';
import { P, SHINY, GEMO, METAL, SOFT, MATTE, rustify } from './icons';
import { hash2, fbm } from '../core/math';

type V2 = [number, number];
const MANA = pal('#120836', '#2a1a8a', '#4a4ad8', '#6a9aff', '#b8e0ff', '#ffffff');
const ICE = pal('#0a2238', '#1e5a86', '#3a9ad0', '#7ad4f4', '#c8f4ff', '#ffffff');
const EEL = pal('#081a10', '#123a22', '#1e6236', '#3a8a46', '#6ab85a', '#b8e88a');
const BRONZE = pal('#2a1206', '#5a2e0e', '#9a5a1e', '#d08a3a', '#f0c070', '#fff0c8');
const ROBE = pal('#0e1a10', '#1e3a1a', '#2e5e26', '#4a8a36', '#7ab84a', '#c8e888');
const WIZ = pal('#06082a', '#101a5a', '#1e2e90', '#3248c0', '#5a7ae8', '#a8c0ff');
const TIN = pal('#0e1a2e', '#22406a', '#3a6aa0', '#5a96c8', '#9ac8e8', '#e8f6ff');
const TEAL = pal('#04201e', '#0a4a44', '#14786a', '#2aa890', '#6ad8b8', '#c8fff0');
const CAPE = pal('#2a0408', '#5e0a14', '#9a1622', '#d0302e', '#f06a4a', '#ffb090');
const DARK = pal('#04040a', '#0c0e18', '#181c2c', '#262c44', '#3a4262', '#5a6488');
const LION = pal('#2a0a04', '#6a1a0a', '#b03a14', '#e86a2a', '#ffa860', '#fff0d0');
const VENOM = pal('#061a04', '#0e4a0a', '#2a8a16', '#5ad030', '#a8ff6a', '#f0ffd0');
const IVORY = pal('#2a2016', '#6a5a42', '#a8987a', '#d8ccb0', '#f4ecdc', '#ffffff');

const GLOW = (p: ReturnType<typeof pal>, emit = 0.35) => ({ spec: 1, shin: 26, dither: 0.2, contrast: 1.4, emit });

export const BUILD_PAINT: Record<string, (c: Ic) => void> = {
  // ================================================================ materials
  manaCrystal(c) {
    const rock = c.mat(P.darkstone, MATTE), m = c.mat(MANA, GLOW(MANA, 0.3));
    c.slab([[4, 29], [8, 24], [16, 23], [25, 24], [29, 29], [5, 30]], rock, { h: 3, bevel: 1, round: true });
    c.crystal(16, 26, -1.57, 22, 4.4, m, { z: 3 });
    c.crystal(10, 27, -2.1, 14, 3.2, m, { z: 3 });
    c.crystal(22, 27, -1.0, 13, 3, m, { z: 4 });
    c.glint(15, 8, 1); c.glint(23, 16, 0, '#d8f0ff');
  },
  scrap(c) {
    const ir = c.mat(P.iron, METAL), rust = c.mat(P.rust, MATTE), br = c.mat(P.brass, METAL);
    const g = c.slab([[3, 12], [18, 5], [27, 9], [24, 22], [10, 26], [4, 20]], ir, { h: 2.5, bevel: 1.2 });
    c.bump((x, y) => (Math.abs(x - y * 0.8 - 2) < 1.5 ? 1.2 : null), g);
    rustify(c, g, rust, 3, 0.55);
    for (const [x, y] of [[8, 12], [20, 9], [19, 19]] as V2[]) c.dome(x, y, 1.6, 1.6, br, { z: 2 });
    const pipe = c.tube([[14, 29], [28, 21]], 2.6, ir, { z: 3 });
    rustify(c, pipe, rust, 7, 0.4);
    c.glint(12, 8, 0);
  },
  seashell(c) {
    const sh = c.mat(P.shell, { ...SOFT, spec: 0.35, irid: 0.12 });
    const fan: V2[] = [[16, 27], ...curve((t) => { const a = Math.PI * (1.08 + t * 0.84); return [16 + Math.cos(a) * 13, 24 + Math.sin(a) * 18]; }, 24)];
    const g = c.slab(fan, sh, { h: 4, round: true });
    for (let k = 0; k < 9; k++) { const a = Math.PI * (1.15 + (k / 8) * 0.7); c.groove([[16, 26], [16 + Math.cos(a) * 13, 24 + Math.sin(a) * 18]], 0.8, 0.6, 0.18, g); }
    c.paint((x, y) => (y > 22 ? -0.15 : null), g);
    c.dome(16, 27, 3.6, 2.4, c.mat(P.shell, SOFT), { z: 2 });
    c.glint(11, 11, 0);
  },
  // ================================================================ mage
  apprenticeWand(c) {
    const wd = c.mat(P.wood, SOFT), gold = c.mat(P.gold, METAL), m = c.mat(MANA, GLOW(MANA, 0.35));
    const st = c.tube(bez3([3, 25], [18, 22], [32, 20], [47, 15]), (t) => 2.3 - t * 0.7, wd);
    c.paint((x, y) => (Math.sin(x * 0.8 + y) > 0.75 ? -0.18 : null), st);
    c.ring(47, 15, 1.6, 2.6, 1.4, gold, { z: 2 });
    c.crystal(48, 15, -0.32, 13, 3.4, m, { z: 2 });
    for (const [x, y] of [[58, 5], [54, 2], [61, 12]] as V2[]) c.glint(x, y, 1, '#c8e0ff');
    c.tube([[8, 24], [12, 23.4]], 2.6, c.mat(P.rope, SOFT), { z: 1.5 });
  },
  coralStaff(c) {
    const wd = c.mat(P.darkwood, SOFT), coral = c.mat(P.coral, { ...SOFT, spec: 0.3 }), orb = c.mat(P.lava, GLOW(P.lava, 0.45));
    const st = c.tube(bez3([16, 94], [13, 70], [19, 46], [16, 22]), (t) => 2.4 - t * 0.5, wd);
    c.paint((x, y) => (Math.sin(y * 0.7 + x) > 0.8 ? -0.2 : null), st);
    c.dome(16, 15, 7.5, 7.5, orb, { h: 6, z: 1 });
    for (const [pts, r] of [[bez([16, 24], [6, 20], [7, 8]), 1.8], [bez([16, 24], [27, 21], [25, 9]), 1.8], [bez([15, 26], [10, 14], [15, 4]), 1.4], [bez([9, 15], [4, 12], [3, 7]), 1.1], [bez([24, 14], [29, 11], [28, 5]), 1.1]] as [V2[], number][]) {
      const g = c.tube(pts, (t) => r * (1 - t * 0.55), coral, { z: 2 });
      c.speckle(0.12, 3, (_x, _y, i) => { c.L[i] += 0.25; }, g);
    }
    c.tube([[14, 52], [18, 52]], 2.9, c.mat(P.rope, SOFT), { z: 1 });
    c.glint(13, 12, 1, '#fff6c0');
  },
  frostTome(c) {
    const cov = c.mat(ICE, { spec: 0.4, shin: 12, dither: 0.4 }), pg = c.mat(P.paper, MATTE), st = c.mat(P.steel, METAL), ice = c.mat(ICE, GLOW(ICE, 0.25));
    c.slab([[6, 6], [28, 4], [28, 60], [6, 62]], pg, { h: 3, bevel: 1 });
    const g = c.slab([[3, 4], [25, 3], [25, 60], [3, 61]], cov, { h: 4, bevel: 1.2, z: 1 });
    c.paint((x, y) => (x < 6 ? -0.25 : null), g);
    for (const y of [12, 52]) c.groove([[3, y], [25, y]], 0.7, 0.8, 0.25, g);
    c.gem(14, 32, 7, 9, 6, ice, { z: 4, table: 0.4 });
    for (const [x, y] of [[4, 5], [24, 4], [4, 59], [24, 59]] as V2[]) c.dome(x, y, 2.4, 2.4, st, { z: 4 });
    c.speckle(0.04, 9, (_x, _y, i) => { c.L[i] += 0.35; }, g);
    c.glint(11, 27, 1, '#ffffff');
    for (let y = 8; y < 58; y += 3) c.px(27, y, '#c8b88a');
  },
  stormTome(c) {
    const cov = c.mat(EEL, { spec: 0.6, shin: 16, dither: 0.4, irid: 0.1 }), pg = c.mat(P.paper, MATTE), br = c.mat(P.brass, METAL), bolt = c.mat(P.yellow, GLOW(P.yellow, 0.4));
    c.slab([[6, 6], [28, 4], [28, 60], [6, 62]], pg, { h: 3, bevel: 1 });
    const g = c.slab([[3, 4], [25, 3], [25, 60], [3, 61]], cov, { h: 4, bevel: 1.2, z: 1 });
    c.speckle(0.06, 4, (x, y, i) => { if ((x + y) % 3 === 0) c.L[i] -= 0.25; }, g);
    c.paint((x, y) => (x < 6 ? -0.25 : null), g);
    c.slab([[16, 18], [9, 33], [14, 33], [11, 46], [20, 28], [15, 28], [19, 18]], bolt, { h: 1, z: 5 });
    for (const [x, y] of [[4, 5], [24, 4], [4, 59], [24, 59]] as V2[]) c.dome(x, y, 2.4, 2.4, br, { z: 4 });
    c.line(21, 14, 24, 10, '#fffbc0'); c.line(7, 50, 4, 54, '#fffbc0');
    for (let y = 8; y < 58; y += 3) c.px(27, y, '#c8b88a');
  },
  bubblePipe(c) {
    const sh = c.mat(P.shell, { ...SOFT, spec: 0.5, irid: 0.2 }), wd = c.mat(P.darkwood, SOFT), film = c.mat(P.glass, { glass: 1, spec: 0.8, shin: 10, dither: 0.25, irid: 0.65, contrast: 0.5 });
    c.tube(bez([6, 28], [24, 26], [40, 22]), 2, wd);
    const g = c.dome(46, 19, 9, 10, sh, { pinch: 0.3, h: 7 });
    c.ring(46, 11, 6, 2.2, 1.2, sh, { z: 6 });
    c.groove(curve((t) => [46 + Math.cos(t * 9) * (8 - t * 6), 19 + Math.sin(t * 9) * (8 - t * 6)], 30), 0.6, 0.6, 0.2, g);
    for (const [x, y, r] of [[30, 9, 4], [20, 5, 2.6], [13, 13, 2]] as number[][]) { c.dome(x, y, r, r, film, { h: 1.5 }); c.px(x - r * 0.4, y - r * 0.4, '#ffffff'); }
    c.glint(43, 13, 0);
  },
  kelpRobe(c) {
    const m = c.mat(ROBE, { spec: 0.15, shin: 8, dither: 0.55 }), gold = c.mat(P.gold, METAL), rune = c.mat(MANA, GLOW(MANA, 0.4));
    const body: V2[] = [[22, 6], [42, 6], [48, 14], [58, 26], [52, 30], [46, 24], [50, 60], [14, 60], [18, 24], [12, 30], [6, 26], [16, 14]];
    const g = c.slab(body, m, { h: 3, bevel: 0.8, round: true });
    c.paint((x, y) => (Math.sin(x * 0.55 + Math.sin(y * 0.2) * 2) > 0.7 ? -0.2 : null), g);
    c.tube([[22, 7], [32, 14], [42, 7]], 1.8, gold, { z: 3 });
    c.tube([[32, 14], [32, 58]], 1.2, gold, { z: 3 });
    c.tube([[15, 58], [49, 58]], 1.6, gold, { z: 3 });
    for (const [x, y] of [[24, 34], [40, 42], [26, 50]] as V2[]) { c.dome(x, y, 2.2, 2.2, rune, { z: 3 }); }
    c.glint(28, 18, 0);
  },
  wizardHat(c) {
    const m = c.mat(WIZ, { spec: 0.15, shin: 8, dither: 0.5 }), band = c.mat(P.gold, METAL), star = c.mat(P.yellow, GLOW(P.yellow, 0.5));
    c.slab([[1, 54], [16, 49], [31, 54], [26, 60], [6, 60]], m, { h: 3, round: true });
    const cone = c.slab([[6, 52], [12, 30], [14, 14], [20, 4], [27, 8], [22, 12], [20, 30], [26, 52]], m, { h: 4, round: true, z: 2 });
    c.paint((x, y) => (x > 19 ? -0.15 : null), cone);
    c.slab([[6, 46], [26, 46], [27, 51], [5, 51]], band, { h: 1.5, z: 5 });
    c.gem(16, 48.5, 2.4, 2.4, 4, c.mat(P.ruby, GEMO), { z: 6 });
    for (const [x, y, s] of [[13, 36, 3], [18, 24, 2], [11, 42, 1.6], [25, 7, 2.6]] as number[][]) c.slab(starPoly(x, y, s, s * 0.45, 5), star, { h: 1, z: 6 });
  },
  manaGeode(c) {
    const rock = c.mat(P.stone, { ...MATTE, contrast: 1.2 }), crust = c.mat(P.darkstone, MATTE), m = c.mat(MANA, GLOW(MANA, 0.3)), am = c.mat(P.amethyst, GEMO);
    c.dome(32, 34, 29, 26, rock, { lumpy: 0.12, h: 10 });
    c.dome(32, 34, 22, 19, crust, { z: 6, h: 2 });
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2, r = 18;
      c.crystal(32 + Math.cos(a) * r, 34 + Math.sin(a) * r * 0.85, a + Math.PI, 8 + hash2(k, 1, 3) * 6, 2.6, k % 3 ? m : am, { z: 7 });
    }
    c.dome(32, 34, 6, 5, c.mat(MANA, GLOW(MANA, 0.7)), { z: 9, h: 2 });
    c.glint(30, 31, 2, '#ffffff'); c.glint(20, 22, 0); c.glint(44, 40, 0, '#c8e0ff');
  },
  // ================================================================ warrior
  cutlass(c) {
    const st = c.mat(P.steel, METAL), br = c.mat(P.brass, METAL), lt = c.mat(P.leather, SOFT);
    const blade = c.slab([...curve((t) => [26 + t * 66, 14 - Math.pow(t, 1.6) * 9], 16), [94, 4], ...curve((t) => [92 - t * 66, 6 + (1 - Math.pow(1 - t, 1.3)) * 14 + t * 1], 16)], st, { h: 2, bevel: 0.9 });
    c.paint((x, y) => (Math.abs(y - (12 - Math.pow((x - 26) / 66, 1.6) * 9)) < 0.7 ? -0.3 : null), blade);
    c.paint((x, y) => (Math.abs(y - (19 - Math.pow((x - 26) / 66, 1.2) * 13)) < 0.6 ? 0.35 : null), blade);
    c.tube([[10, 16], [24, 16]], 2.6, lt);
    c.slab([[22, 7], [27, 7], [27, 25], [22, 25]], br, { h: 3, z: 2 });
    c.tube(bez([24, 24], [10, 30], [6, 18]), 1.3, br, { z: 2 });
    c.dome(6, 16, 3.2, 3.2, br, { z: 2 });
    c.glint(60, 9, 1);
  },
  bronzeBlade(c) {
    const bz = c.mat(BRONZE, METAL), lt = c.mat(P.leather, SOFT), br = c.mat(P.brass, METAL);
    const blade = c.slab([[22, 16], [30, 10], [46, 9], [58, 13], [62, 16], [58, 19], [46, 23], [30, 22]], bz, { h: 2.4, bevel: 0.9 });
    c.paint((x, y) => (Math.abs(y - 16) < 0.6 && x > 24 && x < 58 ? 0.35 : null), blade);
    c.tube([[6, 16], [19, 16]], 2.3, lt);
    c.slab([[18, 9], [23, 9], [23, 23], [18, 23]], br, { h: 3, z: 2 });
    c.dome(5, 16, 3, 3, br, { z: 2 });
    c.glint(42, 12, 1);
  },
  chainmail(c) {
    const m = c.mat(P.iron, { ...METAL, metal: 0.5, dither: 0.4 }), dk = c.mat(P.lead, METAL), lt = c.mat(P.leather, SOFT), barn = c.mat(P.bone, SOFT);
    const shirt: V2[] = [[20, 6], [44, 6], [58, 18], [52, 28], [46, 22], [48, 58], [16, 58], [18, 22], [12, 28], [6, 18]];
    const g = c.slab(shirt, m, { h: 3, bevel: 1, round: true });
    // ring pattern: little bright arcs on a dark weave
    c.paint((x, y) => { const row = y >> 1; const xx = (x + (row & 1)) % 3; return xx === 0 ? -0.35 : (y & 1) === 0 ? 0.2 : null; }, g);
    c.recolor((x, y) => y > 55 || (y < 9 && x > 22 && x < 42), dk, g);
    c.tube([[18, 34], [46, 34]], 1.6, lt, { z: 3 });
    c.dome(32, 34, 2.4, 2.4, c.mat(P.brass, METAL), { z: 4 });
    for (const [x, y, r] of [[22, 46, 2.6], [26, 49, 1.8], [41, 19, 2.2]] as number[][]) c.dome(x, y, r, r, barn, { z: 3, lumpy: 0.2 });
  },
  turtleShell(c) {
    const sh = c.mat(pal('#141408', '#2e2a0c', '#5a4a18', '#8a7428', '#bca048', '#e8d48a'), { spec: 0.45, shin: 12, dither: 0.4 }), rim = c.mat(P.olive, SOFT), lt = c.mat(P.leather, SOFT);
    c.dome(32, 33, 29, 27, rim, { h: 8, flat: 0.3 });
    const g = c.dome(32, 32, 25, 23, sh, { h: 11, z: 3 });
    const cells: V2[] = [[32, 32], [32, 18], [32, 46], [20, 25], [44, 25], [20, 39], [44, 39]];
    c.paint((x, y) => {
      const ds = cells.map(([cx, cy]) => Math.hypot(x - cx, (y - cy) * 1.1)).sort((a, b) => a - b);
      return ds[1] - ds[0] < 1.4 ? -0.45 : ds[0] < 3 ? 0.18 : -ds[0] / 40;
    }, g);
    c.tube([[2, 22], [8, 24]], 2.4, lt, { z: 1 }); c.tube([[56, 24], [62, 22]], 2.4, lt, { z: 1 });
    c.glint(22, 14, 1);
  },
  clamShield(c) {
    const sh = c.mat(pal('#1a1a24', '#3a3a52', '#6a6a88', '#a0a0c0', '#d8d8f0', '#ffffff'), { spec: 0.6, shin: 14, dither: 0.4, irid: 0.15 }), lt = c.mat(P.leather, SOFT), pearl = c.mat(P.pearl, { spec: 0.9, shin: 16, irid: 0.3 });
    const out: V2[] = [[16, 61], ...curve((t) => { const a = Math.PI * (1.0 + t); return [16 + Math.cos(a) * 14, 34 + Math.sin(a) * 30]; }, 24)];
    const g = c.slab(out, sh, { h: 5, round: true });
    for (let k = 0; k < 9; k++) { const a = Math.PI * (1.08 + (k / 8) * 0.84); c.groove([[16, 58], [16 + Math.cos(a) * 14, 34 + Math.sin(a) * 30]], 1, 0.8, 0.2, g); }
    c.paint((x, y) => { const r = Math.hypot(x - 16, (y - 58) * 0.5); return Math.sin(r * 1.2) > 0.7 ? -0.12 : null; }, g);
    c.tube([[10, 30], [22, 30]], 1.5, lt, { z: 5 });
    c.dome(16, 50, 3, 3, pearl, { z: 5 });
    c.glint(10, 12, 1);
  },
  plumedHelm(c) {
    const st = c.mat(P.steel, METAL), br = c.mat(P.brass, METAL), red = c.mat(CAPE, { spec: 0.2, dither: 0.5 });
    for (let k = 0; k < 6; k++) c.tube(bez([16, 10], [20 - k, 2], [27 - k * 0.6, 5 + k * 1.6]), 1.6, red, { z: 4 - k * 0.3 });
    const g = c.dome(16, 20, 12, 10, st, { h: 8 });
    c.recolor((x, y) => y > 22 && Math.abs(x - 16) > 3 && Math.abs(x - 16) < 9 && y < 26, c.mat(P.black, MATTE), g);
    c.slab([[4, 24], [28, 24], [29, 28], [3, 28]], br, { h: 2, z: 6 });
    c.slab([[14.5, 20], [17.5, 20], [17, 31], [15, 31]], st, { h: 2, z: 7 });
    for (const x of [7, 25]) c.dome(x, 26, 1.2, 1.2, c.mat(P.gold, METAL), { z: 8 });
    c.glint(10, 14, 1);
  },
  warConch(c) {
    const sh = c.mat(pal('#3a1a14', '#7a3a2a', '#c87a5a', '#f0b090', '#ffd8c0', '#fff6ee'), { spec: 0.55, shin: 14, dither: 0.4 }), lip = c.mat(P.pink, { ...SHINY, spec: 0.7 }), br = c.mat(P.brass, METAL);
    // spire (left, pointed) widening into the body whorl, knobbly shoulder, flared pink lip (right)
    const body = c.slab([[6, 15], [20, 6], [40, 3], [54, 6], [60, 14], [56, 24], [40, 29], [22, 25]], sh, { h: 8, round: true });
    for (let k = 0; k < 4; k++) c.groove(bez([10 + k * 9, 8 + k * 0.5], [14 + k * 9, 16], [10 + k * 9, 24]), 0.7, 0.9, 0.3, body);
    c.paint((x, y) => (y > 18 ? -0.12 : null), body);
    for (let k = 0; k < 6; k++) c.dome(22 + k * 6, 5 + Math.abs(k - 3) * 0.6, 2.2, 2.6, sh, { z: 6 });
    c.slab([[42, 14], [58, 8], [63, 18], [58, 29], [46, 27]], lip, { h: 4, round: true, z: 4 });
    c.dome(53, 19, 4, 5, c.mat(P.coral, SOFT), { z: 6, h: 1 });
    c.tube([[2, 15], [8, 15]], 2.2, br, { z: 2 }); c.ring(2, 15, 1.4, 3, 1, br, { z: 3 });
    c.glint(30, 7, 1);
  },
  heroCape(c) {
    const m = c.mat(CAPE, { spec: 0.25, shin: 10, dither: 0.5 }), gold = c.mat(P.gold, METAL);
    const cape: V2[] = [[8, 6], [24, 6], [28, 34], [31, 60], [24, 57], [18, 61], [11, 57], [3, 61], [5, 34]];
    const g = c.slab(cape, m, { h: 3, round: true });
    c.paint((x, y) => (Math.sin(x * 0.7 + y * 0.05) > 0.55 ? -0.25 : Math.sin(x * 0.7 + y * 0.05) < -0.7 ? 0.15 : null), g);
    c.recolor((x, y) => y > 55 || x < 6 || x > 27, gold, g);
    c.tube([[6, 7], [26, 7]], 2.4, gold, { z: 3 });
    c.gem(16, 7, 4, 4, 6, c.mat(P.ruby, GEMO), { z: 5 });
    c.glint(14, 5, 0);
  },
  // ================================================================ summoner / toymaker
  windUpMegalodon(c) {
    const tin = c.mat(TIN, { ...METAL, metal: 0.45, spec: 0.8 }), wh = c.mat(P.whitep, SHINY), red = c.mat(P.redp, SHINY), br = c.mat(P.brass, METAL), dk = c.mat(P.black, MATTE);
    // tail + fins
    c.slab([[4, 6], [12, 15], [5, 26], [10, 16]], tin, { h: 2 });
    c.slab([[26, 10], [30, 2], [36, 10]], tin, { h: 2 });
    const body = c.dome(34, 17, 26, 9, tin, { h: 8, pinch: -0.15 });
    c.recolor((x, y) => y > 18 + (x - 34) * 0.05, wh, body);
    c.slab([[30, 22], [37, 22], [26, 30]], tin, { h: 2, z: 6 });
    // open toothy mouth
    c.slab([[48, 18], [60, 15], [61, 21], [50, 23]], red, { h: 1, z: 8 });
    for (let k = 0; k < 5; k++) { c.px(50 + k * 2.2, 18 - k * 0.5, '#ffffff'); c.px(51 + k * 2.2, 22 - k * 0.2, '#ffffff'); }
    c.dome(50, 13, 1.6, 1.6, dk, { z: 9 }); c.px(49, 12, '#ffffff');
    for (const x of [22, 30, 38]) c.px(x, 13, '#d8e8f8');
    // the wind-up key
    c.tube([[30, 8], [30, 3]], 0.9, br, { z: 9 });
    c.ring(26.5, 2.5, 3, 2.2, 1, br, { z: 9 }); c.ring(33.5, 2.5, 3, 2.2, 1, br, { z: 9 });
    c.glint(24, 11, 0);
  },
  piranhaJar(c) {
    const glass = c.mat(P.glass, { glass: 1, spec: 0.9, shin: 18, dither: 0.25, contrast: 0.6 }), water = c.mat(TEAL, { spec: 0.3, dither: 0.5 }), fish = c.mat(LION, SHINY), back = c.mat(P.iron, SHINY), cork = c.mat(P.cork, MATTE);
    const jar = c.slab([[6, 16], [26, 16], [28, 22], [28, 58], [24, 62], [8, 62], [4, 58], [4, 22]], glass, { h: 5, round: true });
    c.recolor((x, y) => y > 24, water, jar);
    c.paint((x, y) => (x < 8 ? 0.35 : null), jar);
    const f = c.dome(17, 40, 8, 6, back, { z: 6, h: 4 });
    c.recolor((x, y) => y > 41, fish, f);
    c.slab([[9, 40], [4, 35], [4, 45]], back, { h: 1, z: 6 });
    c.px(21, 38, '#000000'); c.px(22, 38, '#f0d020');
    for (let k = 0; k < 4; k++) c.px(20 + k, 43, '#ffffff');
    c.slab([[8, 8], [24, 8], [25, 16], [7, 16]], cork, { h: 3, z: 2 });
    c.tube([[6, 14], [26, 14]], 0.9, c.mat(P.rope, SOFT), { z: 4 });
    c.glint(9, 26, 1);
  },
  petCrab(c) {
    const m = c.mat(P.coral, { spec: 0.5, shin: 12, dither: 0.4 }), dk = c.mat(P.black, SHINY);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) c.tube([[16 + s * 7, 21 + k * 2], [16 + s * (11 + k), 25 + k * 2], [16 + s * (13 + k), 30]], 1.1, m);
    for (const s of [-1, 1]) {
      c.tube([[16 + s * 8, 16], [16 + s * 12, 10]], 1.6, m, { z: 1 });
      const cl = c.dome(16 + s * 12, 7, 4, 3.4, m, { z: 2 });
      c.paint((x, y) => (y < 6 && Math.abs(x - (16 + s * 12)) < 1 ? -0.5 : null), cl);
    }
    const b = c.dome(16, 20, 10.5, 7.5, m, { h: 6, z: 2 });
    c.speckle(0.08, 4, (_x, _y, i) => { c.L[i] += 0.25; }, b);
    for (const s of [-1, 1]) { c.tube([[16 + s * 3, 14], [16 + s * 4, 10]], 0.8, m, { z: 5 }); c.dome(16 + s * 4, 9, 2, 2, dk, { z: 6 }); c.px(16 + s * 4 - 0.5, 8, '#ffffff'); }
    c.line(13, 23, 19, 23, '#5a1408');
    c.glint(11, 16, 0);
  },
  octopusPal(c) {
    const m = c.mat(pal('#2a0a2e', '#5a1a5a', '#9a3a8a', '#d06ab0', '#f8a8d8', '#fff0f8'), { spec: 0.6, shin: 14, dither: 0.4 }), eye = c.mat(P.cream, SHINY);
    for (let k = 0; k < 6; k++) {
      const x0 = 14 + k * 7;
      c.tube(curve((t) => [x0 + Math.sin(t * 5 + k) * 3 + t * (k - 2.5) * 3, 18 + t * 12 - Math.max(0, t - 0.7) * 10 * (k % 2 ? 1 : -0.3)], 12), (t) => 2.4 * (1 - t * 0.7), m, { z: 1 });
    }
    const head = c.dome(32, 12, 13, 10, m, { h: 8, z: 3 });
    c.speckle(0.07, 9, (_x, _y, i) => { c.L[i] -= 0.3; }, head);
    for (const s of [-1, 1]) { c.dome(32 + s * 5, 15, 3, 3.4, eye, { z: 10 }); c.slab([[32 + s * 5 - 2, 15], [32 + s * 5 + 2, 15], [32 + s * 5 + 2, 16.5], [32 + s * 5 - 2, 16.5]], c.mat(P.black, MATTE), { h: 0.5, z: 12 }); }
    c.px(25, 20, '#ff8ab0'); c.px(39, 20, '#ff8ab0');
    c.glint(26, 6, 1);
  },
  tideTrident(c) {
    const g = c.mat(P.gold, METAL), wd = c.mat(P.darkwood, SOFT), rope = c.mat(P.rope, SOFT), pe = c.mat(P.aqua, GEMO);
    c.tube([[16, 94], [16, 26]], 2.1, wd);
    c.tube([[15, 70], [17, 70]], 2.8, rope, { z: 1 }); c.tube([[15, 62], [17, 62]], 2.8, rope, { z: 1 });
    c.slab([[6, 22], [26, 22], [24, 28], [8, 28]], g, { h: 3, z: 2 });
    c.tube([[16, 23], [16, 2]], 1.7, g, { z: 3 }); c.slab([[13, 6], [16, 0], [19, 6]], g, { h: 2, z: 4 });
    for (const s of [-1, 1]) { c.tube(bez([16 + s * 8, 24], [16 + s * 11, 16], [16 + s * 9, 6]), 1.5, g, { z: 3 }); c.slab([[16 + s * 9 - 2.5, 9], [16 + s * 9, 3], [16 + s * 9 + 2.5, 9]], g, { h: 2, z: 4 }); }
    c.gem(16, 25, 3, 3, 6, pe, { z: 5 });
    c.glint(13, 10, 1);
  },
  brassKey(c) {
    const br = c.mat(P.brass, METAL);
    c.tube([[16, 30], [16, 15]], 1.8, br);
    c.ring(9, 10, 6, 5, 2, br, { z: 1 }); c.ring(23, 10, 6, 5, 2, br, { z: 1 });
    c.dome(16, 13, 3, 3, br, { z: 2 });
    for (const y of [24, 28]) c.slab([[16, y], [20, y], [20, y + 2], [16, y + 2]], br, { h: 1.5 });
    c.glint(7, 6, 0); c.glint(21, 6, 0);
  },
  chumBucket(c) {
    const tin = c.mat(P.iron, METAL), gore = c.mat(P.redp, { spec: 0.7, shin: 14, dither: 0.4 }), fish = c.mat(P.mono, SHINY);
    const b = c.slab([[5, 11], [27, 11], [24, 30], [8, 30]], tin, { h: 5, round: true });
    rustify(c, b, c.mat(P.rust, MATTE), 5, 0.3);
    c.paint((x, y) => (y === 15 || y === 25 ? -0.3 : null), b);
    c.dome(16, 11, 11, 3, gore, { z: 5, lumpy: 0.3 });
    c.slab([[18, 10], [26, 2], [28, 7], [22, 11]], fish, { h: 2, z: 7 });
    c.slab([[25, 3], [30, 0], [31, 6], [27, 6]], fish, { h: 1, z: 8 });
    c.ring(16, 8, 12, 9, 0.9, tin, { a0: Math.PI * 1.05, a1: Math.PI * 1.95, z: 2 });
    c.glint(8, 14, 0);
  },
  tideCrown(c) {
    const g = c.mat(P.gold, METAL), r = c.mat(P.ruby, GEMO), b = c.mat(P.aqua, GEMO), pe = c.mat(P.pearl, { spec: 0.9, irid: 0.3 });
    c.slab([[4, 28], [4, 12], [9, 19], [12, 8], [16, 17], [20, 8], [23, 19], [28, 12], [28, 28]], g, { h: 3, bevel: 1 });
    c.slab([[3, 23], [29, 23], [29, 29], [3, 29]], g, { h: 4, z: 1 });
    c.gem(16, 26, 2.6, 2.4, 6, r, { z: 5 }); c.gem(8, 26, 1.8, 1.8, 4, b, { z: 5 }); c.gem(24, 26, 1.8, 1.8, 4, b, { z: 5 });
    for (const [x, y] of [[4, 11], [12, 7], [20, 7], [28, 11]] as V2[]) c.dome(x, y, 1.8, 1.8, pe, { z: 4 });
    c.glint(11, 16, 0);
  },
  toyPack(c) {
    const lt = c.mat(P.leather, SOFT), fl = c.mat(P.darkwood, SOFT), br = c.mat(P.brass, METAL), red = c.mat(P.redp, SHINY), st = c.mat(P.steel, METAL), yl = c.mat(P.yellow, SHINY);
    // tools poking out the top
    c.tube([[20, 18], [16, 2]], 1.6, red); c.tube([[16, 4], [15, 0]], 0.6, st);
    c.tube([[38, 18], [44, 3]], 1.4, yl); c.slab([[42, 0], [47, 1], [46, 5], [41, 4]], st, { h: 1.5 });
    c.tube([[30, 18], [30, 6]], 1.2, st); c.ring(30, 5, 2.4, 2.4, 1, st);
    const bag = c.slab([[10, 16], [54, 16], [58, 24], [56, 60], [8, 60], [6, 24]], lt, { h: 6, round: true, z: 2 });
    c.paint((x, y) => (Math.sin(x * 0.5) > 0.9 ? -0.15 : null), bag);
    c.slab([[8, 16], [56, 16], [54, 32], [10, 32]], fl, { h: 3, z: 6 });
    c.slab([[14, 40], [28, 40], [28, 54], [14, 54]], lt, { h: 2, z: 7 }); c.slab([[36, 40], [50, 40], [50, 54], [36, 54]], lt, { h: 2, z: 7 });
    for (const [x, y] of [[32, 31], [21, 41], [43, 41]] as V2[]) c.slab([[x - 2, y - 1.5], [x + 2, y - 1.5], [x + 2, y + 1.5], [x - 2, y + 1.5]], br, { h: 1.5, z: 9 });
    c.glint(14, 20, 0);
  },
  // ================================================================ tinkerer
  junkTurret(c) {
    const wd = c.mat(P.wood, SOFT), can = c.mat(P.redp, { ...SHINY, spec: 0.5 }), st = c.mat(P.iron, METAL), lbl = c.mat(P.cream, MATTE), bat = c.mat(P.black, SHINY);
    for (const [a, b] of [[[30, 38], [10, 62]], [[34, 38], [54, 62]], [[32, 38], [34, 62]]] as [V2, V2][]) c.tube([a, b], 2.2, wd);
    const body = c.dome(30, 30, 14, 11, can, { h: 9, z: 2 });
    c.recolor((x, y) => Math.abs(y - 30) < 3, lbl, body);
    c.paint((x, y) => (Math.abs(y - 30) < 3 && x % 4 === 0 ? -0.5 : null), body);
    c.tube([[40, 26], [61, 20]], 3, st, { z: 5 });
    c.ring(61, 20, 1.6, 3.6, 1.2, st, { z: 6 });
    c.slab([[12, 14], [26, 14], [26, 24], [12, 24]], bat, { h: 3, z: 6 });
    c.slab([[13, 12], [16, 12], [16, 14], [13, 14]], c.mat(P.redp, SHINY), { h: 1, z: 8 });
    c.tube(bez([24, 16], [34, 8], [38, 22]), 0.8, c.mat(P.yellow, SOFT), { z: 7 });
    c.dome(30, 18, 2, 2, c.mat(P.green, GLOW(P.green, 0.6)), { z: 10 });
    c.glint(24, 24, 0);
  },
  netTrap(c) {
    const net = c.mat(P.rope, SOFT), cork = c.mat(P.cork, MATTE), lead = c.mat(P.lead, METAL);
    const g = c.dome(32, 18, 26, 11, net, { h: 6, lumpy: 0.15 });
    c.paint((x, y) => ((x + y) % 5 === 0 || (x - y + 60) % 5 === 0 ? 0.25 : -0.25), g);
    c.erase((x, y) => polyDist([[6, 18], [58, 18]], x, y) > 11.5 && Math.hypot((x - 32) / 26, (y - 18) / 11) < 1 && ((x | 0) + (y | 0)) % 5 === 2 && ((x | 0) - (y | 0) + 60) % 5 === 2);
    for (const [x, y] of [[10, 10], [24, 6], [40, 6], [54, 10]] as V2[]) c.dome(x, y, 3, 2.4, cork, { z: 6 });
    for (const [x, y] of [[12, 27], [32, 29], [52, 27]] as V2[]) c.drop(x, y - 3, y + 2, 2.4, lead, { z: 6 });
    c.glint(20, 14, 0);
  },
  seaMine(c) {
    const m = c.mat(P.darkstone, { ...METAL, metal: 0.4 }), rust = c.mat(P.rust, MATTE), sp = c.mat(P.iron, METAL), red = c.mat(P.redp, GLOW(P.redp, 0.7));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; c.tube([[16 + Math.cos(a) * 8, 17 + Math.sin(a) * 8], [16 + Math.cos(a) * 14, 17 + Math.sin(a) * 14]], (t) => 1.6 * (1 - t * 0.6), sp); }
    const g = c.dome(16, 17, 10, 10, m, { h: 9, z: 1 });
    rustify(c, g, rust, 4, 0.35);
    c.ring(16, 17, 10, 3, 1, sp, { z: 3, a0: 0, a1: Math.PI });
    c.dome(16, 10, 2.2, 2, red, { z: 9 });
    c.glint(12, 12, 0);
  },
  harpoonBallista(c) {
    const wd = c.mat(P.wood, SOFT), dk = c.mat(P.darkwood, SOFT), ir = c.mat(P.iron, METAL), rope = c.mat(P.mono, SOFT);
    // bow across the top row, string drawn back
    c.tube(bez3([10, 4], [26, 22], [70, 22], [86, 4]), 2.4, dk, { z: 1 });
    c.tube([[10, 4], [48, 22]], 0.6, rope, { z: 2 }); c.tube([[86, 4], [48, 22]], 0.6, rope, { z: 2 });
    // the stock + harpoon
    c.slab([[40, 12], [56, 12], [56, 26], [40, 26]], wd, { h: 3, z: 3 });
    const h = c.tube([[14, 17], [84, 17]], 1.5, wd, { z: 5 });
    c.paint((x) => (x > 70 ? 0.1 : null), h);
    c.slab([[84, 12], [94, 17], [84, 22], [86, 17]], ir, { h: 2, z: 6 });
    c.slab([[78, 13], [82, 9], [83, 14]], ir, { h: 1, z: 6 }); c.slab([[78, 21], [82, 25], [83, 20]], ir, { h: 1, z: 6 });
    // post + sled in the bottom cell
    c.tube([[48, 26], [48, 52]], 3, wd, { z: 2 });
    c.slab([[34, 52], [62, 52], [64, 60], [32, 60]], dk, { h: 3, z: 2 });
    c.tube([[40, 52], [48, 40]], 1.4, wd, { z: 1 }); c.tube([[56, 52], [48, 40]], 1.4, wd, { z: 1 });
    c.dome(48, 19, 2.6, 2.6, ir, { z: 7 });
    c.glint(88, 15, 0);
  },
  pipeWrench(c) {
    const red = c.mat(P.redp, { ...SHINY, spec: 0.45 }), st = c.mat(P.iron, METAL), rust = c.mat(P.rust, MATTE);
    const h = c.slab([[4, 16], [8, 13], [40, 14], [40, 19], [8, 19]], red, { h: 3, round: true });
    c.speckle(0.08, 5, (x, y, i) => { c.M[i] = rust; }, h);
    const jaw = c.slab([[38, 10], [52, 9], [60, 4], [62, 10], [54, 14], [54, 18], [38, 22]], st, { h: 3, bevel: 1 });
    c.slab([[50, 18], [60, 20], [62, 26], [52, 24]], st, { h: 3, z: 1 });
    c.paint((x, y) => (x > 54 && y > 10 && y < 20 && (y & 1) === 0 ? -0.4 : null), jaw);
    c.tube([[44, 20], [44, 27]], 2.2, c.mat(P.brass, METAL), { z: 2 });
    c.paint((x, y) => (y > 21 && (y % 2 === 0) && Math.abs(x - 44) < 2 ? -0.4 : null));
    c.ring(6, 16, 1.6, 1.6, 0.7, st, { z: 4 });
    c.glint(48, 12, 0);
  },
  brassGoggles(c) {
    const br = c.mat(P.brass, METAL), lt = c.mat(P.leather, SOFT), gl = c.mat(TEAL, { glass: 0.8, spec: 1, shin: 20, dither: 0.25, contrast: 0.8 });
    c.tube(bez([1, 20], [16, 28], [31, 20]), 2.2, lt);
    for (const x of [9, 23]) { c.dome(x, 16, 7, 7, br, { h: 5, z: 1 }); c.dome(x, 16, 5, 5, gl, { z: 5, h: 2 }); c.px(x - 2, 13, '#ffffff'); c.px(x - 1, 13, '#e0ffff'); }
    c.tube([[14, 16], [18, 16]], 1.4, br, { z: 3 });
    for (const [x, y] of [[4, 11], [14, 11], [18, 11], [28, 11]] as V2[]) c.px(x, y, '#fff2a0');
  },
  scubaTank(c) {
    const y = c.mat(P.yellow, { ...SHINY, spec: 0.6 }), st = c.mat(P.steel, METAL), bl = c.mat(P.black, SHINY);
    const t = c.slab([[6, 16], [26, 16], [27, 58], [24, 62], [8, 62], [5, 58]], y, { h: 7, round: true });
    c.paint((x) => (x < 10 ? 0.25 : x > 23 ? -0.25 : null), t);
    c.dome(16, 16, 10.5, 6, y, { z: 0.5 });
    c.recolor((x, yy) => yy > 36 && yy < 41, bl, t);
    c.tube([[16, 11], [16, 4]], 2.4, st, { z: 3 });
    c.slab([[10, 4], [22, 4], [22, 7], [10, 7]], st, { h: 2, z: 4 });
    c.dome(24, 6, 2.6, 2.6, c.mat(P.black, MATTE), { z: 5 });
    c.tube(bez([24, 6], [31, 12], [29, 24]), 1, bl, { z: 4 });
    c.glint(9, 22, 1);
  },
  clockworkHeart(c) {
    const br = c.mat(P.brass, METAL), cu = c.mat(P.copper, METAL), glass = c.mat(P.redp, GLOW(P.redp, 0.45)), st = c.mat(P.steel, METAL);
    const heart = c.slab(curve((t) => { const a = t * Math.PI * 2; const x = 16 * Math.pow(Math.sin(a), 3), y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); return [32 + x * 1.7, 30 - y * 1.75]; }, 48), br, { h: 7, round: true });
    c.paint((x, y) => (polyDist([[32, 8], [32, 58]], x, y) < 0.6 ? -0.3 : null), heart);
    c.dome(32, 30, 9, 9, glass, { z: 7, h: 3 });
    for (const [x, y, r] of [[18, 22, 7], [46, 20, 6], [42, 44, 5]] as number[][]) { const g = c.slab(starPoly(x, y, r, r * 0.78, 9), cu, { h: 2, z: 7 }); c.dome(x, y, r * 0.35, r * 0.35, st, { z: 9 }); void g; }
    for (const [x, y] of [[10, 14], [54, 14], [32, 54]] as V2[]) c.dome(x, y, 1.5, 1.5, st, { z: 8 });
    c.glint(29, 27, 1, '#fff0f0'); c.glint(14, 12, 0);
  },
  // ================================================================ rogue
  stingrayBarb(c) {
    const bone = c.mat(P.bone, { ...SHINY, spec: 0.45 }), dk = c.mat(P.darkstone, SHINY), wrap = c.mat(P.purple, SOFT), gem = c.mat(P.amethyst, GEMO);
    const top: V2[] = [], bot: V2[] = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, x = 22 + t * 40, y = 16 - Math.sin(t * Math.PI) * 3; const w = 5 * (1 - t * 0.9); top.push([x, y - w - (k % 2 ? 1.5 * (1 - t) : 0)]); bot.push([x, y + w + (k % 2 ? 0 : 1.2 * (1 - t))]); }
    const b = c.slab([...top, ...bot.reverse()], bone, { h: 2.4, bevel: 0.9 });
    c.recolor((x) => x > 52, dk, b);
    c.paint((x, y) => (Math.abs(y - (16 - Math.sin(((x - 22) / 40) * Math.PI) * 3)) < 0.6 ? 0.3 : null), b);
    c.tube([[6, 17], [20, 16]], 2.6, wrap);
    c.paint((x, y) => (x < 20 && (x + y) % 3 === 0 ? -0.35 : null));
    c.slab([[19, 10], [23, 10], [23, 22], [19, 22]], c.mat(P.leather, SOFT), { h: 2, z: 2 });
    c.gem(5, 17, 3, 3, 6, gem, { z: 3 });
    c.glint(40, 12, 0);
  },
  venomVial(c) {
    const glass = c.mat(P.glass, { glass: 1, spec: 0.9, shin: 18, dither: 0.25, contrast: 0.6 }), v = c.mat(VENOM, GLOW(VENOM, 0.4)), cork = c.mat(P.cork, MATTE), lab = c.mat(LION, SOFT);
    const b = c.dome(16, 21, 10, 9.5, glass, { h: 7 });
    c.recolor((x, y) => y > 16 + Math.sin(x * 0.6) * 0.8, v, b);
    c.slab([[12, 4], [20, 4], [20, 13], [12, 13]], glass, { h: 3, z: 1 });
    c.slab([[11, 1], [21, 1], [21, 6], [11, 6]], cork, { h: 3, z: 3 });
    c.slab([[9, 22], [23, 22], [23, 28], [9, 28]], lab, { h: 1, z: 7 });
    c.paint((x, y) => (y > 21 && y < 29 && x > 8 && x < 24 && x % 3 === 0 ? -0.5 : null));
    for (const [x, y] of [[13, 19], [19, 15]] as V2[]) c.px(x, y, '#e8ffd0');
    c.glint(10, 15, 1);
  },
  inkBomb(c) {
    const m = c.mat(P.ink, { spec: 1, shin: 16, dither: 0.3 }), cap = c.mat(P.iron, METAL), fuse = c.mat(P.rope, SOFT), sk = c.mat(P.cream, SHINY);
    c.dome(15, 19, 11.5, 11.5, m, { h: 10 });
    c.slab([[11, 5], [19, 5], [19, 9], [11, 9]], cap, { h: 3, z: 6 });
    c.tube(bez([15, 5], [17, 0], [23, 2]), 0.9, fuse, { z: 8 });
    c.glint(24, 2, 1, '#ffd060'); c.px(25, 1, '#fff6c0'); c.px(26, 3, '#ff8a30');
    // a little squid stamp
    c.dome(15, 19, 3.5, 4, sk, { z: 11, h: 1 });
    for (let k = -1; k <= 1; k++) c.tube([[15 + k * 1.6, 22], [15 + k * 2.4, 26]], 0.6, sk, { z: 11 });
    c.px(14, 18, '#1a1030'); c.px(16, 18, '#1a1030');
    c.glint(9, 13, 1);
  },
  shadowHood(c) {
    const m = c.mat(DARK, { spec: 0.2, shin: 8, dither: 0.5 }), lin = c.mat(P.purple, SOFT);
    const hood: V2[] = [[16, 2], [26, 8], [30, 22], [28, 30], [4, 30], [2, 22], [6, 8]];
    c.slab(hood, m, { h: 5, round: true });
    c.dome(16, 21, 9, 8, lin, { z: 4, h: 2 });
    c.dome(16, 22, 7.5, 6.5, c.mat(P.black, MATTE), { z: 6, h: 1 });
    for (const x of [12, 20]) { c.px(x, 21, '#ff6ad8'); c.px(x + 1, 21, '#ffd0f0'); }
    c.glint(10, 8, 0);
  },
  cutpursePouch(c) {
    const lt = c.mat(P.leather, SOFT), gold = c.mat(P.gold, METAL), rope = c.mat(P.rope, SOFT);
    const b = c.dome(15, 20, 11, 10, lt, { h: 8, lumpy: 0.12 });
    c.paint((x, y) => (y < 14 && (x % 3 === 0) ? -0.25 : null), b);
    c.slab([[9, 6], [21, 6], [19, 12], [11, 12]], lt, { h: 3, z: 3 });
    c.tube([[9, 11], [21, 11]], 1.3, rope, { z: 5 });
    for (const [x, y] of [[25, 26], [28, 29], [22, 29]] as V2[]) { c.dome(x, y, 3, 2.2, gold, { z: 6, h: 1.5 }); c.px(x - 1, y - 1, '#fffbe0'); }
    c.glint(9, 16, 0);
  },
  boneDice(c) {
    const m = c.mat(IVORY, { spec: 0.4, shin: 10, dither: 0.4 });
    const d1 = c.slab([[3, 12], [14, 8], [19, 18], [8, 23]], m, { h: 4, bevel: 1.2 });
    const d2 = c.slab([[16, 16], [27, 14], [30, 26], [18, 29]], m, { h: 4, bevel: 1.2, z: 2 });
    void d1; void d2;
    for (const [x, y] of [[8, 13], [11, 15], [14, 17], [21, 19], [25, 18], [23, 23], [27, 22], [21, 25], [25, 25]] as V2[]) { c.px(x, y, '#2a1a10'); c.px(x + 1, y, '#5a4030'); }
    c.glint(7, 10, 0);
  },
};
void fbm; void SHINY;
