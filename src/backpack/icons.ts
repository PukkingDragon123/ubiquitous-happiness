// Item icons: every item hand-designed as code on the height-field painter (iconPaint.ts). 32 px per grid cell.
// Merge levels add flair: level 2 gets silver glints + pips, level 3 a golden rim, warm sheen and gold pips.
import { Ic, pal, starPoly, bez, bez3, curve, inPoly, polyDist, type Pal } from './iconPaint';
import { Px, hex, mix, type RGB } from '../gfx/px';
import { hash2, fbm } from '../core/math';
import type { ItemDef } from '../game/items';
import { EMIT_MASK } from './voxel';

type V2 = [number, number];

// hue-shifted ramps, darkest -> brightest
export const P = {
  copper: pal('#2b1016', '#62261c', '#a3462a', '#d9773f', '#f5ad6b', '#ffe3b0'),
  patina: pal('#0e2a2a', '#1d5a4e', '#2f8f6e', '#56c08e', '#9be6b4', '#e0fff0'),
  gold: pal('#3a1408', '#7d3c0c', '#c27414', '#f0b02a', '#ffe066', '#fffbe0'),
  iron: pal('#12121e', '#2b2e40', '#4b5266', '#727c92', '#a6b2c4', '#e6eef8'),
  steel: pal('#161a2a', '#363e58', '#5e6a86', '#93a0ba', '#cdd8e8', '#ffffff'),
  stone: pal('#17141c', '#36313d', '#58525c', '#7f7880', '#aaa3a5', '#d9d3cf'),
  darkstone: pal('#0e0c14', '#211d29', '#36303e', '#4d4654', '#6c6470', '#958c94'),
  lead: pal('#14161f', '#2c303e', '#4a5062', '#6c7486', '#959eae', '#c9d1db'),
  ruby: pal('#2a0414', '#650a24', '#ad1630', '#e63946', '#ff8476', '#fff0e2'),
  emerald: pal('#03201d', '#08472f', '#11803e', '#36bd52', '#95ee77', '#effed6'),
  amethyst: pal('#1c0b33', '#3d1868', '#6a33a6', '#9f5fe0', '#d09cff', '#fbefff'),
  aqua: pal('#041c2a', '#08465a', '#11878e', '#2fc7b6', '#8ff1da', '#f0fff8'),
  abyss: pal('#0a0424', '#29105c', '#4a2aa6', '#3a86e8', '#6ff0ff', '#ffffff'),
  cork: pal('#2a1508', '#593219', '#8c582b', '#bf8a4f', '#e6bc81', '#fff0cc'),
  wood: pal('#1f1610', '#45342a', '#73594a', '#a2866f', '#cbb69a', '#f2e6cf'),
  darkwood: pal('#1c0d08', '#3e1f12', '#6a3820', '#99582f', '#c9884e', '#f0c084'),
  redp: pal('#2a0612', '#6b0c1d', '#b51b27', '#ee3d33', '#ff8e6c', '#ffe8d8'),
  whitep: pal('#262640', '#5f6283', '#9ca2bf', '#d3d8e8', '#f2f5ff', '#ffffff'),
  yellow: pal('#3a1904', '#87470a', '#cc8a12', '#f6c21e', '#ffe86a', '#fffbe0'),
  orange: pal('#330f06', '#7a2a0c', '#c45514', '#f08a26', '#ffc066', '#fff0d0'),
  kelp: pal('#0a1a0e', '#183816', '#2c5e20', '#4c8a2a', '#87b83c', '#d6ef82'),
  olive: pal('#1a1606', '#3e360e', '#6a5c1a', '#9a8a2c', '#c8b850', '#f0e8a0'),
  pearl: pal('#2a2238', '#62567a', '#a59cba', '#d9d2e6', '#f6f0ff', '#ffffff'),
  shell: pal('#2e1a1c', '#6e4446', '#b07c74', '#e2b4a2', '#f8dccc', '#fff6ee'),
  coral: pal('#2a0814', '#741a30', '#c3383e', '#ef6c4c', '#ffa882', '#fff0dc'),
  seaglass: pal('#06231f', '#145244', '#2a8a6c', '#5cc29a', '#a6ead0', '#f0fff8'),
  seaglassB: pal('#071a33', '#123f6a', '#2a72a8', '#58a8d8', '#a4dcf4', '#f0faff'),
  rust: pal('#1c0a0a', '#4b1a12', '#7c3418', '#ac5a28', '#d48b49', '#f2c38a'),
  bone: pal('#2b2119', '#62523f', '#9f8e72', '#d3c6a8', '#f1eadb', '#ffffff'),
  leather: pal('#1a0c08', '#3c1f12', '#68391f', '#995a31', '#c88b52', '#efc48e'),
  paper: pal('#3a2a1a', '#76614a', '#b29d7c', '#ddcfaa', '#f3ebd2', '#fffdf0'),
  ink: pal('#0a0614', '#1c1230', '#33215a', '#52388a', '#7e5cbe', '#c3a6f0'),
  glass: pal('#0b2232', '#1d4b5e', '#3d8292', '#74bcc4', '#b6eaea', '#ffffff'),
  pink: pal('#2c0c1a', '#6e2240', '#b44a6e', '#e47c9a', '#ffb6c8', '#fff0f4'),
  green: pal('#08180e', '#123a1e', '#1f6232', '#2f8c46', '#5cbc62', '#b4ec9a'),
  blue: pal('#0a1030', '#162a6a', '#2650a8', '#3f80dc', '#80bcf4', '#e0f4ff'),
  purple: pal('#16081c', '#3a1240', '#66206a', '#963a90', '#c870b8', '#f4c8ee'),
  black: pal('#08080e', '#14141e', '#22222e', '#353548', '#545470', '#8a8aa8'),
  cream: pal('#3a2c20', '#7a6650', '#b8a284', '#e2d4b8', '#f6eedc', '#ffffff'),
  lava: pal('#2a0404', '#7a1404', '#d04008', '#ff8a10', '#ffd040', '#fffbd0'),
  pumice: pal('#16131a', '#332e36', '#544d55', '#7a7277', '#a49b9b', '#d0c8c2'),
  brass: pal('#2e1606', '#683a0e', '#a8661a', '#dca034', '#f8d878', '#fffbe0'),
  rope: pal('#2a1a0c', '#5a3c1c', '#8e6a3a', '#bc9a5e', '#e0c88e', '#fff4d0'),
  mono: pal('#14303c', '#2e6274', '#5fa2b4', '#9cd8e2', '#dcf8fc', '#ffffff'),
  eel: pal('#071612', '#123a2a', '#1e6646', '#2f9a5c', '#6ccc7a', '#d0f4a8'),
  lantern: pal('#1a2a08', '#4a6a10', '#9ac020', '#e0f040', '#fffb9a', '#ffffff'),
  flesh: pal('#120818', '#2a1234', '#44204e', '#62346a', '#8a5290', '#c08ac4'),
  puffer: pal('#2a1404', '#6a3a08', '#b07018', '#e0a830', '#f8d870', '#fffbe0'),
  sail: pal('#060a24', '#101e56', '#1e3c92', '#3264c8', '#64a0ec', '#c0e4ff'),
  carbon: pal('#06060c', '#12121c', '#1e2030', '#30344a', '#4e566e', '#8a94b0'),
  tea: pal('#1a0a04', '#3a1a08', '#5e2e10', '#8a4a1c', '#b8702e', '#e0a050'),
};

const SHINY = { spec: 0.85, shin: 22, dither: 0.25, contrast: 1.3 };
const GEMO = { spec: 1.1, shin: 30, dither: 0.12, contrast: 1.55 };
const METAL = { metal: 0.65, spec: 0.7, shin: 18, dither: 0.3, contrast: 1.2 };
const SOFT = { spec: 0.15, shin: 8, dither: 0.6 };
const MATTE = { spec: 0.06, shin: 6, dither: 0.6 };

const rustify = (c: Ic, g: number, rustM: number, seed: number, amount = 0.5) => {
  c.recolor((x, y) => fbm(x / 5 + seed, y / 5, 3, seed) > 1 - amount * 0.9, rustM, g);
  c.speckle(0.08, seed + 1, (_x, _y, i) => { c.L[i] -= 0.2; }, g);
};

/** each painter draws into an Ic sized to its shape (32 px per cell) */
const PAINT: Record<string, (c: Ic) => void> = {
  // ================================================================ materials
  lineScrap(c) {
    const m = c.mat(P.mono, { spec: 0.6, shin: 14, dither: 0.3 });
    const loops: [number, number, number, number, number][] = [[15, 14, 10, 6, 0.5], [17, 17, 8, 9, -0.3], [13, 18, 9, 5, 1.4], [18, 13, 6, 8, 2.2], [16, 16, 11, 4, -1.1]];
    loops.forEach(([x, y, rx, ry, rot], k) => {
      c.tube(curve((t) => { const a = t * Math.PI * 2 * 0.92 + k; const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry; return [x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot)]; }, 40), 0.95, m, { z: k * 1.2 });
    });
    c.tube(bez3([20, 22], [24, 26], [21, 29], [27, 30]), 0.95, m, { z: 6 });
    c.dome(16, 16, 2.4, 2.2, c.mat(P.mono, SHINY), { z: 7 });
    const hk = c.mat(P.steel, METAL);
    c.tube(curve((t) => { const a = Math.PI * (0.1 + t * 1.1); return [27 - Math.cos(a) * 2.2, 27.5 + Math.sin(a) * 2.2]; }, 10), 0.8, hk, { z: 6 });
    c.tube([[27, 30.5], [27.5, 28]], 0.8, hk, { z: 6 });
  },
  rustyHook(c) {
    const iron = c.mat(P.iron, METAL), rust = c.mat(P.rust, { spec: 0.15, dither: 0.6 });
    const g = c.ring(20, 5, 3.2, 3.2, 1.4, iron);
    const path: V2[] = [[20, 8.5], [20, 21], ...curve((t) => { const a = t * Math.PI; return [14 + Math.cos(a) * 6, 21 + Math.sin(a) * 7]; }, 16).slice(1), [8, 13]];
    const g2 = c.tube(path, (t) => (t > 0.86 ? 2.1 - (t - 0.86) / 0.14 * 1.4 : 2.1), iron);
    c.slab([[8, 10], [12.5, 16.5], [9.4, 16.5]], iron, { h: 1.8, group: g2 });
    rustify(c, g2, rust, 3, 0.55); rustify(c, g, rust, 4, 0.4);
    c.glint(21, 13, 0, '#e8f0ff');
  },
  leadShot(c) {
    const m = c.mat(P.lead, { ...METAL, metal: 0.4 });
    for (const [x, y, r] of [[21, 17, 6.5], [15, 10, 5.5], [11, 20, 6]] as [number, number, number][]) {
      const g = c.dome(x, y, r, r * 0.95, m, { h: r * 0.85 });
      c.groove([[x - r, y + 0.5], [x + r, y - 0.5]], 1.0, 2.2, 0.35, g);
    }
    c.glint(9, 17, 0); c.glint(19, 14, 0);
  },
  cork(c) {
    const m = c.mat(P.cork, MATTE), top = c.mat(P.cork, { ...MATTE, contrast: 0.8 });
    c.tube([[10, 23], [21, 11]], (t) => 7.2 - t * 0.9, m, { hk: 0.8 });
    c.dome(21.5, 10.5, 5.6, 4.2, top, { rot: -0.83, h: 1.2, z: 7 });
    c.paint((x, y) => (hash2(x, y, 4) < 0.16 ? -0.35 : hash2(x, y, 5) < 0.1 ? 0.15 : null));
    c.paint((x, y) => (Math.hypot(x - 21.5, y - 10.5) > 3.6 && Math.hypot(x - 21.5, y - 10.5) < 4.6 ? -0.18 : null));
  },
  kelp(c) {
    const m = c.mat(P.kelp, SOFT), stipe = c.mat(P.olive, SOFT), bl = c.mat(P.olive, { ...SHINY, spec: 0.4 });
    const st = bez3([16, 62], [11, 46], [21, 26], [15, 4], 30);
    c.tube(st, (t) => 2.2 - t * 0.9, stipe);
    const leaf = (bx: number, by: number, ang: number, len: number, wid: number, seed: number) => {
      const L: V2[] = [], R: V2[] = [];
      const mid: V2[] = [];
      for (let k = 0; k <= 18; k++) {
        const t = k / 18, a = ang + Math.sin(t * 2.4 + seed) * 0.35;
        const cx = bx + Math.cos(ang) * len * t + Math.cos(a) * 0, cy = by + Math.sin(ang) * len * t + Math.sin(t * 3 + seed) * 2;
        const w = Math.sin(Math.min(1, t * 1.1) * Math.PI) * wid * (1 + Math.sin(t * 20 + seed) * 0.14);
        mid.push([cx, cy]);
        L.push([cx - Math.sin(ang) * w, cy + Math.cos(ang) * w]); R.push([cx + Math.sin(ang) * w, cy - Math.cos(ang) * w]);
      }
      const g = c.slab([...L, ...R.reverse()], m, { h: 2.4, bevel: 0.8, round: true });
      c.paint((x, y) => (polyDist(mid, x + 0.5, y + 0.5) < 0.7 ? 0.2 : null), g);
      c.paint((x, y) => (Math.sin((x + y * 0.5) * 1.3 + seed) > 0.85 ? -0.12 : null), g);
      c.dome(bx, by, 2.6, 2.6, bl, { z: 2.2 });
    };
    leaf(15, 48, -2.6, 15, 5.5, 1); leaf(17, 36, -0.55, 15, 5.5, 2); leaf(15, 24, -2.5, 14, 5, 3); leaf(16, 12, -0.7, 13, 4.5, 4); leaf(15.5, 6, -1.9, 9, 3.4, 5);
  },
  pearl(c) {
    const sh = c.mat(P.shell, { ...SOFT, irid: 0.18 }), pm = c.mat(P.pearl, { spec: 0.9, shin: 16, dither: 0.3, irid: 0.32, contrast: 1.0 });
    const fan: V2[] = [[3, 25], ...curve((t) => { const a = Math.PI * (1 + t); return [16 + Math.cos(a) * 13, 25 + Math.sin(a) * 9]; }, 20), [29, 25], [24, 29], [8, 29]];
    const g = c.slab(fan, sh, { h: 2.6, round: true });
    c.paint((x, y) => { const a = Math.atan2(y - 29, x - 16); return Math.sin(a * 22) > 0.6 ? -0.2 : null; }, g);
    c.dome(16, 17, 8.5, 8.3, pm, { z: 2 });
    c.glint(13, 13, 1);
  },
  coralShard(c) {
    const m = c.mat(P.coral, { ...SOFT, spec: 0.3 }), tip = c.mat(P.coral, { ...SOFT, contrast: 0.9 });
    const g = c.newGroup();
    const br = (pts: V2[], r0: number, r1: number) => c.tube(pts, (t) => r0 + (r1 - r0) * t, m, { group: g });
    br(bez([15, 30], [16, 24], [15, 17]), 3.4, 2.6);
    br(bez([15, 18], [11, 14], [8, 7]), 2.5, 1.8);
    br(bez([15.5, 19], [21, 15], [23, 6]), 2.6, 1.8);
    br(bez([10, 12], [6, 13], [4, 14]), 1.7, 1.5);
    br(bez([21, 13], [25, 14], [27, 11]), 1.7, 1.4);
    br(bez([15, 18], [16, 12], [15, 8]), 2.0, 1.6);
    for (const [x, y] of [[8, 6.5], [23, 5.5], [4, 14], [27, 10.5], [15, 7.5]] as V2[]) c.dome(x, y, 2.1, 2.0, tip, { z: 1.5, group: g });
    c.speckle(0.12, 7, (_x, _y, i) => { c.L[i] += 0.22; }, g);
  },
  seaGlass(c) {
    const a = c.mat(P.seaglass, { glass: 0.7, spec: 0.5, shin: 10, dither: 0.4, contrast: 0.8 });
    const b = c.mat(P.seaglassB, { glass: 0.7, spec: 0.5, shin: 10, dither: 0.4, contrast: 0.8 });
    c.dome(21, 12, 6.5, 5, b, { rot: 0.5, lumpy: 0.2, seed: 3, h: 3 });
    c.dome(12, 19, 9, 6.5, a, { rot: -0.35, lumpy: 0.18, seed: 7, h: 3.5 });
    c.paint((x, y) => (fbm(x / 3, y / 3, 2, 9) - 0.5) * 0.25);
    c.glint(9, 15, 0); c.px(10, 15, '#f0fff8'); c.glint(19, 9, 0);
  },
  rustyNail(c) {
    const iron = c.mat(P.iron, METAL), rust = c.mat(P.rust, { spec: 0.12, dither: 0.6 });
    const g = c.tube([[7, 7], [24, 24], [28.5, 28.5]], (t) => (t < 0.78 ? 2.1 : 2.1 * (1 - (t - 0.78) / 0.22) + 0.3), iron);
    const h = c.dome(6.5, 6.5, 2.4, 5.2, iron, { rot: -0.785, h: 1.6, z: 1.5 });
    c.paint((x, y) => (Math.abs((x - y)) < 1 && x > 10 && x < 13 ? -0.25 : null), g);
    rustify(c, g, rust, 11, 0.6); rustify(c, h, rust, 12, 0.35);
  },
  doubloon(c) {
    const m = c.mat(P.gold, { ...METAL, metal: 0.55, spec: 0.9 });
    const g = c.shape(3, 3, 29, 29, (x, y) => { const r = Math.hypot(x - 16, y - 16); return r > 12.6 ? null : Math.min(3, (12.6 - r) * 1.4); }, m);
    c.bump((x, y) => { const r = Math.hypot(x - 16, y - 16); return r > 9 && r < 10.2 ? -1.1 : null; }, g);
    // crossbones + skull relief
    c.bump((x, y) => (polyDist([[10, 21], [22, 11]], x, y) < 1.3 || polyDist([[10, 11], [22, 21]], x, y) < 1.3 ? 1.1 : null), g);
    c.bump((x, y) => (Math.hypot(x - 16, y - 15) < 4 ? 1.4 : null), g);
    c.paint((x, y) => (Math.hypot(x - 14.5, y - 15) < 1 || Math.hypot(x - 17.5, y - 15) < 1 ? -0.5 : null), g);
    c.paint((x, y) => { const a = Math.atan2(y - 16, x - 16), r = Math.hypot(x - 16, y - 16); return r > 10.5 && Math.sin(a * 24) > 0.7 ? -0.15 : null; }, g);
    c.glint(10, 8, 1);
  },
  copperOre(c) {
    const m = c.mat(P.copper, { ...METAL, metal: 0.45 }), pt = c.mat(P.patina, SOFT);
    for (const [x, y, rx, ry, s] of [[21, 14, 7, 6, 2], [12, 20, 8.5, 7, 5], [14, 10, 4.8, 4.2, 8]] as number[][]) {
      const g = c.dome(x, y, rx, ry, m, { lumpy: 0.32, seed: s });
      c.recolor((px, py) => py > y + ry * 0.2 && fbm(px / 3, py / 3, 2, s) > 0.6, pt, g);
    }
    c.glint(10, 16, 0); c.glint(19, 11, 0);
  },
  ironOre(c) {
    const rock = c.mat(P.darkstone, MATTE), vein = c.mat(P.iron, { ...METAL, metal: 0.8, spec: 1 });
    const poly: V2[] = [[5, 18], [9, 8], [17, 4], [26, 8], [29, 17], [25, 27], [13, 29], [6, 25]];
    const g = c.slab(poly, rock, { h: 6, bevel: 0.9 });
    c.bump((x, y) => (fbm(x / 5, y / 5, 3, 21) - 0.5) * 3, g);
    c.recolor((x, y) => { const v = fbm(x / 6, y / 6, 3, 33); return Math.abs(v - 0.5) < 0.05; }, vein, g);
    c.speckle(0.06, 9, (x, y, i) => { c.M[i] = vein; }, g);
    c.glint(13, 10, 0);
  },
  riverStone(c) {
    const m = c.mat(P.stone, { spec: 0.22, shin: 9, dither: 0.5 });
    const a = c.dome(23, 10, 6.5, 5.2, m, { rot: 0.4, lumpy: 0.08, seed: 2, h: 4 });
    const b = c.dome(14, 19, 11.5, 8.2, m, { rot: 0.18, lumpy: 0.08, seed: 5, h: 5.5 });
    c.paint((x, y) => (polyDist([[5, 22], [14, 18], [24, 17]], x + 0.5, y + 0.5) < 0.9 ? 0.3 : null), b);
    c.speckle(0.07, 3, (_x, _y, i) => { c.L[i] -= 0.12; });
    void a;
  },
  amethyst(c) {
    const rock = c.mat(P.stone, MATTE), m = c.mat(P.amethyst, GEMO);
    c.slab([[3, 28], [6, 22], [14, 20], [24, 21], [29, 26], [27, 30], [5, 30]], rock, { h: 3, bevel: 1, round: true });
    c.crystal(21, 25, -1.15, 15, 3.6, m, { z: 2 });
    c.crystal(9, 26, -2.05, 13, 3.4, m, { z: 2 });
    c.crystal(15, 26, -1.62, 22, 4.6, m, { z: 3 });
    c.crystal(25, 26, -0.75, 8, 2.6, m, { z: 4 });
    c.crystal(5, 27, -2.5, 6, 2.2, m, { z: 4 });
    c.glint(13, 9, 1); c.glint(22, 15, 0);
  },
  emerald(c) {
    const m = c.mat(P.emerald, GEMO);
    const poly: V2[] = [[8, 4], [24, 4], [29, 9], [29, 23], [24, 28], [8, 28], [3, 23], [3, 9]];
    c.shape(2, 3, 30, 29, (x, y) => {
      if (!inPoly(poly, x, y)) return null;
      const d = Math.min(...poly.map((_, k) => { const a = poly[k], b = poly[(k + 1) % poly.length]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / l; }));
      return d < 3 ? d * 1.5 : d < 6.5 ? 4.5 + (d - 3) * 0.55 : 6.4;
    }, m);
    c.glint(9, 8, 1); c.px(11, 8, '#ffffff'); c.px(12, 8, '#ffffff'); c.glint(24, 24, 0, '#d8ffd0');
  },
  goldNugget(c) {
    const m = c.mat(P.gold, { ...METAL, metal: 0.5, spec: 1.1, shin: 20 });
    c.dome(9, 10, 6.5, 5.5, m, { lumpy: 0.35, seed: 4 });
    c.dome(17, 18, 13.5, 10.5, m, { lumpy: 0.36, seed: 9 });
    c.glint(12, 14, 1); c.glint(22, 19, 0);
  },
  aquamarine(c) {
    const m = c.mat(P.aqua, GEMO);
    c.crystal(21, 30, -1.45, 21, 4.2, m, { tip: 0.28 });
    c.crystal(5, 28, -0.98, 30, 6, m, { tip: 0.25, z: 2 });
    c.glint(14, 12, 1); c.glint(21, 17, 0);
  },
  ruby(c) {
    const m = c.mat(P.ruby, GEMO);
    c.gem(16, 16, 14, 13.5, 8, m, { rot: Math.PI / 8, table: 0.48, slope: 0.85 });
    c.paint((x, y) => { const a = Math.atan2(y - 16.5, x - 16), r = Math.hypot(x - 16, y - 16.5); return r > 7 && r < 8 && Math.sin(a * 8) > 0.2 ? 0.2 : null; });
    c.glint(11, 11, 1); c.px(13, 11, '#ffffff'); c.glint(21, 21, 0, '#ffd0c0');
  },
  abyssCrystal(c) {
    const rock = c.mat(P.darkstone, MATTE), m = c.mat(P.abyss, { ...GEMO, emit: 0.32 });
    c.slab([[2, 60], [6, 53], [14, 51], [24, 52], [30, 57], [28, 62], [4, 62]], rock, { h: 3, round: true });
    c.crystal(23, 56, -1.24, 30, 4.2, m, { z: 2 });
    c.crystal(9, 57, -1.95, 26, 4, m, { z: 2 });
    c.crystal(16, 57, -1.6, 46, 6, m, { z: 3, tip: 0.24 });
    c.crystal(4, 58, -2.4, 9, 2.4, m, { z: 4 });
    c.crystal(27, 58, -0.6, 7, 2.2, m, { z: 4 });
    c.paint((x, y) => (y < 40 ? (40 - y) / 40 * 0.25 : null));
    c.glint(13, 18, 2); c.glint(24, 34, 1); c.glint(7, 42, 0);
  },
  sharkTooth(c) {
    const m = c.mat(P.bone, { spec: 0.6, shin: 14, dither: 0.35 }), root = c.mat(P.cream.map((p) => mix(p, P.darkwood[3], 0.35)) as Pal, MATTE);
    const L: V2[] = [], R: V2[] = [];
    for (let k = 0; k <= 14; k++) { const t = k / 14; const s = k % 2 ? 1.1 : 0; L.push([16 - 12.5 * t - s + Math.sin(t * 3) * 1.6, 2 + 22 * t]); R.push([16 + 12.5 * t + s - Math.sin(t * 3) * 0.8, 2 + 22 * t]); }
    c.slab([...L, ...R.reverse()], m, { h: 4.5, bevel: 0.7, round: true });
    c.slab([[4, 23], [28, 23], [26, 29], [21, 27], [16, 30], [11, 27], [6, 29]], root, { h: 3.5, round: true });
    c.paint((x, y) => (polyDist([[16, 4], [15, 20]], x + 0.5, y + 0.5) < 0.6 ? 0.2 : null));
    c.glint(11, 11, 1);
  },
  driftwood(c) {
    const m = c.mat(P.wood, MATTE), end = c.mat(P.wood, { ...MATTE, contrast: 0.6 });
    const g = c.tube(bez([5, 20], [30, 13], [57, 15], 20), (t) => 6.4 - t * 1.4, m, { hk: 0.8 });
    c.tube(bez([26, 14], [28, 8], [33, 4]), (t) => 2.6 - t, m, { group: g });
    c.tube(bez([44, 18], [47, 23], [52, 26]), (t) => 2.0 - t * 0.6, m, { group: g, z: 0.5 });
    c.dome(57.5, 15, 3.6, 5, end, { h: 1.5, z: 4 });
    c.paint((x, y) => { const r = Math.hypot((x - 57.5) / 0.7, y - 15); return r < 3.6 && Math.sin(r * 2.6) > 0.5 ? -0.2 : null; });
    c.paint((x, y) => Math.sin(y * 1.7 + Math.sin(x * 0.25) * 2.4 + fbm(x / 9, y / 3, 2, 3) * 5) > 0.75 ? -0.22 : null, g);
    c.paint((x, y) => (Math.hypot((x - 18) / 2.6, y - 17) < 1.4 ? -0.45 : Math.hypot((x - 18) / 2.6, y - 17) < 2.2 ? -0.18 : null), g);
    c.paint((x, y) => (Math.hypot((x - 40) / 2, y - 18) < 1.2 ? -0.45 : null), g);
  },
  glassLens(c) {
    const brass = c.mat(P.brass, METAL), gl = c.mat(P.glass, { glass: 0.9, spec: 0.8, shin: 12, dither: 0.3, contrast: 0.7 });
    c.dome(16, 16, 10, 10, gl, { h: 2.5 });
    c.ring(16, 16, 11, 11, 2.3, brass, { z: 1 });
    c.tube([[24, 24], [28.5, 28.5]], 1.6, brass, { z: 1 });
    c.line(10, 20, 14, 16, '#f6ffff'); c.line(14, 16, 13, 13, '#f6ffff'); c.line(14, 16, 19, 15, '#e0f8ff'); c.line(19, 15, 22, 11, '#e0f8ff');
    c.line(10, 10, 12, 8, '#ffffff'); c.px(9, 12, '#ffffff');
  },
  urchinSpine(c) {
    const m = c.mat(P.purple, { spec: 0.4, shin: 12, dither: 0.4 }), tie = c.mat(P.rope, SOFT);
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k - 4) * 0.17 + (hash2(k, 1, 4) - 0.5) * 0.08;
      const L = 19 + hash2(k, 2, 4) * 7;
      c.tube([[16 + (k - 4) * 0.6, 28], [16 + Math.cos(a) * L, 28 + Math.sin(a) * L]], (t) => 1.6 * (1 - t) + 0.3, m, { z: (k % 3) * 0.6 });
    }
    c.tube([[10.5, 23], [21.5, 23]], 1.7, tie, { z: 3 });
    c.tube(bez([21, 23], [25, 25], [24, 29]), 1.1, tie, { z: 3 });
  },

  // ================================================================ tools
  scissors(c) {
    const st = c.mat(P.steel, METAL), rust = c.mat(P.rust, MATTE), red = c.mat(P.redp, { ...SHINY, spec: 0.5 }), br = c.mat(P.brass, METAL);
    const b1 = c.slab([[28, 14.5], [61, 9.5], [60, 12], [30, 18.5]], st, { h: 2, bevel: 0.9 });
    const b2 = c.slab([[28, 17.5], [61, 22.5], [60, 20], [30, 13.5]], st, { h: 2, bevel: 0.9, z: 1 });
    c.paint((x, y) => (y === 11 || y === 21 ? 0.3 : null), b1); c.paint((x, y) => (y === 21 ? 0.3 : null), b2);
    rustify(c, b1, rust, 5, 0.3); rustify(c, b2, rust, 6, 0.25);
    c.ring(15, 10, 8.5, 6, 2.3, red); c.ring(15, 23, 8.5, 6, 2.3, red, { z: 0.5 });
    c.tube([[22, 12], [30, 15.5]], 2.2, st); c.tube([[22, 21], [30, 16.5]], 2.2, st, { z: 0.5 });
    c.dome(30, 16, 2.6, 2.6, br, { z: 2.5 });
    c.glint(48, 12, 0);
  },
  whetstone(c) {
    const fine = c.mat(P.seaglassB.map((p, k) => mix(P.stone[k], p, 0.25)) as Pal, { ...MATTE, flat: 0.4, contrast: 1.4 }), coarse = c.mat(P.rust.map((p, k) => mix(P.stone[k], p, 0.3)) as Pal, { ...MATTE, flat: 0.4, contrast: 1.4 });
    const top = c.slab([[7, 8], [60, 8], [57, 13], [4, 13]], fine, { h: 2, bevel: 2 });
    const front = c.slab([[4, 13], [57, 13], [57, 27], [4, 27]], fine, { h: 3, bevel: 1.5 });
    const side = c.slab([[57, 13], [60, 8], [60, 22], [57, 27]], fine, { h: 2, bevel: 2 });
    c.paint(() => 0.3, top); c.paint(() => -0.3, side);
    c.recolor((x) => x > 31, coarse);
    c.paint((x, y) => (hash2(x, y, 7) < (x > 31 ? 0.35 : 0.15) ? -0.18 : hash2(x, y, 8) < 0.1 ? 0.15 : null));
    c.paint((x, y) => (x > 12 && x < 26 && y > 8 && y < 11 && (x + y) % 5 === 0 ? 0.5 : null), top);
    c.dome(44, 10, 2.4, 1.6, c.mat(P.glass, { glass: 1, spec: 1 }), { z: 2.2 });
    void front;
  },
  leadSinker(c) {
    const m = c.mat(P.lead, { ...METAL, metal: 0.4 }), br = c.mat(P.brass, METAL);
    c.drop(16, 8, 30, 9.5, m, { h: 8 });
    c.ring(16, 5, 2.8, 3, 1.25, br, { z: 1 });
    c.tube([[16, 8], [16, 11]], 1.2, br, { z: 6 });
    c.groove([[16, 13], [16, 28]], 0.8, 1.2, 0.15);
    c.paint((x, y) => (Math.hypot(x - 20, y - 22) < 2.5 ? -0.12 : null));
    c.glint(11, 18, 0);
  },
  corkBobber(c) {
    const quill = c.mat(P.cream, { ...SHINY, spec: 0.4 }), red = c.mat(P.redp, SHINY), wh = c.mat(P.whitep, SHINY), ck = c.mat(P.cork, MATTE);
    c.tube([[16, 2], [16, 62]], (t) => 1.5 - t * 0.6, quill);
    const g = c.dome(16, 33, 10, 15.5, ck, { z: 1, h: 9 });
    c.recolor((x, y) => y < 28, red, g); c.recolor((x, y) => y >= 28 && y < 32, wh, g);
    c.paint((x, y) => (hash2(x, y, 3) < 0.15 && y > 32 ? -0.3 : null), g);
    c.tube([[16, 1], [16, 19]], 1.4, quill, { z: 8 });
    c.ring(16, 61, 1.6, 1.6, 0.9, c.mat(P.steel, METAL), { z: 2 });
    c.glint(12, 23, 1);
  },
  luckyLure(c) {
    const gold = c.mat(P.gold, { ...METAL, metal: 0.5, spec: 1 }), red = c.mat(P.redp, SHINY), lip = c.mat(P.glass, { glass: 1, spec: 0.8 }), hk = c.mat(P.steel, METAL);
    c.slab([[50, 15], [61, 8], [59, 15], [61, 22]], red, { h: 2, round: true });
    const body = c.dome(31, 14.5, 21, 8.5, gold, { z: 1, h: 6 });
    c.paint((x, y) => { const u = (x - 31) / 3, v = (y - 14) / 3; return Math.abs(((u + v) % 2 + 2) % 2 - 1) < 0.25 && y > 9 ? -0.18 : null; }, body);
    c.recolor((x, y) => y > 17.5, c.mat(P.yellow, SHINY), body);
    c.paint((x, y) => (Math.abs(Math.hypot(x - 18, y - 14) - 5) < 0.8 && x > 18 ? 0 : null), body);
    c.recolor((x, y) => Math.abs(Math.hypot(x - 17, y - 14.5) - 5.5) < 0.9 && x > 17, red, body);
    c.slab([[11, 16], [4, 21], [3, 25], [8, 23], [13, 19]], lip, { h: 1.5, z: 0 });
    for (const [x, y] of [[13, 13], [14, 13], [13, 12], [14, 12]] as V2[]) c.px(x - 2, y, '#141018');
    c.px(11, 12, '#ffffff'); c.ring(12, 12.5, 2.6, 2.6, 0.6, c.mat(P.whitep, SHINY), { z: 7 });
    for (const hx of [26, 44]) {
      c.ring(hx, 23.5, 1.4, 1.4, 0.7, hk, { z: 0 });
      c.tube(curve((t) => { const a = Math.PI * 0.1 + t * Math.PI * 1.1; return [hx - 3 + Math.cos(a) * 3, 27 + Math.sin(a) * 3]; }, 10), 0.9, hk);
      c.tube(curve((t) => { const a = Math.PI * -0.2 + t * Math.PI * 1.1; return [hx + 3 - Math.cos(a) * 3, 27 + Math.sin(a) * 3]; }, 10), 0.9, hk);
      c.tube([[hx, 24.5], [hx, 27]], 0.9, hk);
    }
    c.glint(30, 9, 1); c.glint(42, 10, 0);
  },
  reelGear(c) {
    const br = c.mat(P.brass, { ...METAL, metal: 0.55 }), st = c.mat(P.steel, METAL);
    const g = c.slab(starPoly(16, 16, 14, 11.2, 12, 0, 0).map(([x, y], k, arr) => [x, y] as V2), br, { h: 3.5, bevel: 1.2 });
    // square-ish teeth: re-shape the star into a cog by clipping
    c.erase((x, y) => { const r = Math.hypot(x - 16, y - 16), a = Math.atan2(y - 16, x - 16); const tooth = Math.cos(a * 12) > -0.1; return r > 12.2 && !tooth; });
    c.bump((x, y) => { const r = Math.hypot(x - 16, y - 16); return r < 9.5 && r > 8.2 ? -1.2 : null; }, g);
    c.erase((x, y) => { for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; if (Math.hypot(x - 16 - Math.cos(a) * 5.6, y - 16 - Math.sin(a) * 5.6) < 2.3) return true; } return false; });
    c.dome(16, 16, 3.4, 3.4, st, { z: 3.5 });
    c.px(16, 16, '#1a1a2a'); c.px(15, 16, '#1a1a2a');
    c.glint(9, 8, 0);
  },
  grappleHook(c) {
    const ir = c.mat(P.iron, METAL), rope = c.mat(P.rope, SOFT);
    const coil: V2[] = curve((t) => { const a = t * Math.PI * 2 * 2.6 + 0.6; const r = 9 - t * 2.5; return [47 + Math.cos(a) * r * 1.15, 18 + Math.sin(a) * r * 0.75 + t * 3]; }, 80);
    const rg = c.tube([[34, 8], [40, 6], ...coil], 1.9, rope);
    c.paint((x, y) => (Math.sin((x + y) * 1.4) > 0.3 ? -0.18 : 0.06), rg);
    c.tube(bez([46, 26], [49, 36], [56, 40]), 1.8, rope, { group: rg });
    const sg = c.tube([[30, 13], [30, 44]], 2.9, ir, { z: 2 });
    c.ring(30, 9.5, 4.2, 4, 1.7, ir, { z: 3 });
    const prong = (dir: number) => {
      const pts = bez3([30, 43], [30 + dir * 8, 50], [30 + dir * 17, 50], [30 + dir * 19, 36], 20);
      c.tube(pts, (t) => 2.8 - t * 1.6, ir, { z: 1 });
      c.slab([[30 + dir * 19, 31], [30 + dir * 21.5, 38], [30 + dir * 17, 37]], ir, { h: 1.6, z: 1 });
    };
    prong(-1); prong(1);
    c.tube(bez([30, 44], [31, 53], [30, 58]), (t) => 3 - t * 1.4, ir, { z: 2.5 });
    c.slab([[28, 56], [30, 61], [32, 56]], ir, { h: 1.5, z: 2.5 });
    c.dome(30, 44, 4, 3.4, ir, { z: 3 });
    c.glint(28, 22, 1); c.glint(17, 46, 0);
    void sg;
  },
  netShard(c) {
    const rope = c.mat(P.rope, SOFT), knot = c.mat(P.rope, { ...SOFT, contrast: 1.4 }), ck = c.mat(P.orange, SHINY), ck2 = c.mat(P.cork, MATTE);
    const torn: V2[] = [[3, 5], [20, 2], [36, 6], [52, 3], [61, 9], [60, 24], [55, 30], [44, 31], [32, 33], [31, 46], [33, 58], [24, 61], [11, 60], [3, 55], [6, 38], [2, 21]];
    const mask = (x: number, y: number) => inPoly(torn, x + 0.5, y + 0.5);
    const S = 11;
    for (let k = -8; k < 14; k++) {
      c.tube(curve((t) => [k * S - 6 + t * 70, -3 + t * 70 + Math.sin(t * 9 + k) * 1.2], 30), 1.0, rope, { mask });
      c.tube(curve((t) => [k * S + 70 - t * 70, -3 + t * 70 + Math.sin(t * 8 + k) * 1.2], 30), 1.0, rope, { mask, z: 0.6 });
    }
    for (let k = -8; k < 14; k++) for (let j = -8; j < 14; j++) {
      const x = 32 + (k - j) * S / 2 + 0.5, y = -3 + (k + j) * S / 2 + 35 - 32;
      if (mask(x, y)) c.dome(x, y, 1.7, 1.6, knot, { z: 1.5 });
    }
    c.paint((x, y) => (hash2(x, y, 3) < 0.25 ? -0.15 : null));
    c.tube([[43, 12], [55, 16]], 4.6, ck, { z: 3 });
    c.recolor((x, y) => x > 47 && x < 51, ck2);
    c.paint((x, y) => (x === 49 ? 0.25 : null));
  },
  tackleBox(c) {
    const gr = c.mat(P.green, { ...METAL, metal: 0.35, spec: 0.5 }), lid = c.mat(P.green, { ...METAL, metal: 0.35, spec: 0.6 });
    const blk = c.mat(P.black, SHINY), br = c.mat(P.brass, METAL), wh = c.mat(P.whitep, SOFT), rust = c.mat(P.rust, MATTE), st = c.mat(P.steel, METAL);
    const body = c.slab([[6, 27], [90, 27], [90, 60], [6, 60]], gr, { h: 4, bevel: 1.2 });
    const lg = c.slab([[5, 14], [91, 14], [91, 28], [5, 28]], lid, { h: 5, bevel: 1.2, z: 0.5 });
    c.paint((x, y) => (y === 15 ? 0.25 : null), lg);
    c.tube(bez([36, 14], [48, 0], [60, 14]), 2.3, blk, { z: 3 });
    c.slab([[33, 11], [39, 11], [39, 16], [33, 16]], blk, { h: 2, z: 4 }); c.slab([[57, 11], [63, 11], [63, 16], [57, 16]], blk, { h: 2, z: 4 });
    c.slab([[42, 23], [54, 23], [54, 34], [42, 34]], br, { h: 2.2, z: 5, bevel: 1 });
    c.dome(48, 31, 1.6, 1.6, st, { z: 7 });
    for (const [x, y] of [[9, 31], [87, 31], [9, 56], [87, 56], [9, 18], [87, 18]] as V2[]) c.dome(x, y, 1.5, 1.5, br, { z: 5 });
    c.speckle(0.03, 4, (_x, _y, i) => { c.M[i] = rust; }, body);
    c.paint((x, y) => (polyDist([[14, 46], [22, 42]], x + 0.5, y + 0.5) < 0.8 ? 0.35 : polyDist([[14, 47], [22, 43]], x + 0.5, y + 0.5) < 0.8 ? -0.3 : null), body);
    c.paint((x, y) => (y > 57 || x < 8 || x > 88 ? -0.15 : null), body);
    // fish sticker
    const stk = c.slab([[62, 38], [84, 38], [84, 52], [62, 52]], wh, { h: 0.6, z: 4.2 });
    c.paint((x, y) => (hash2(x, y, 9) < 0.06 ? -0.1 : null), stk);
    const fishM = c.mat(P.blue, SOFT);
    c.dome(71, 45, 6, 3.6, fishM, { z: 4.8, h: 0.6 }); c.slab([[76, 45], [81, 41], [81, 49]], fishM, { h: 0.6, z: 4.8 });
    c.px(68, 44, '#ffffff');
    // a lure tail sneaking out from under the lid
    c.tube(bez([20, 27], [18, 33], [22, 38]), 1, st, { z: 6 });
    c.tube(bez([22, 38], [25, 40], [24, 36]), 0.8, st, { z: 6 });
    c.dome(19, 27, 2.5, 2, c.mat(P.redp, SHINY), { z: 6 });
  },
  rodTip(c) {
    const cb = c.mat(P.carbon, { ...SHINY, spec: 0.7 }), st = c.mat(P.steel, METAL), wrap = c.mat(P.redp, SOFT), ck = c.mat(P.cork, MATTE);
    const path = bez([17, 93], [12, 50], [15, 4], 30);
    const g = c.tube(path, (t) => 2.7 - t * 1.6, cb);
    c.erase((x, y) => y > 92 && (Math.floor(x) % 2 === 0 || y > 94));
    for (const [y, r] of [[80, 3.2], [58, 2.8], [38, 2.4], [20, 2]] as V2[]) {
      const p = path.reduce((a, b) => (Math.abs(b[1] - y) < Math.abs(a[1] - y) ? b : a));
      c.recolor((x, yy) => Math.abs(yy - y) < 2.2, wrap, g);
      c.ring(p[0] + r + 1.4, y, r, r * 1.1, 0.8, st, { z: 1 });
      c.tube([[p[0] + 1, y], [p[0] + 1.6, y]], 0.9, st, { z: 2 });
    }
    c.ring(path[path.length - 1][0], 3.5, 1.8, 1.8, 0.8, st, { z: 1 });
    c.tube([[16.6, 86], [16.6, 93]], 3.6, ck, { z: 1 });
    c.paint((x, y) => (hash2(x, y, 2) < 0.2 ? -0.3 : null));
  },
  pliers(c) {
    const st = c.mat(P.steel, METAL), red = c.mat(P.redp, { ...SOFT, spec: 0.35 });
    c.slab([[33, 13.5], [62, 15.2], [62, 16.2], [33, 15.6]], st, { h: 2, bevel: 1 });
    c.slab([[33, 16.4], [62, 16.6], [62, 17.4], [33, 18.6]], st, { h: 2, bevel: 1, z: 0.4 });
    c.tube(bez([33, 14.5], [24, 10], [5, 7]), (t) => 1.8 + t * 1.6, st);
    c.tube(bez([33, 17.5], [24, 22], [5, 25]), (t) => 1.8 + t * 1.6, st, { z: 0.5 });
    c.tube(bez([26, 11], [18, 8], [4, 7]), (t) => 2.4 + t * 1.3, red, { z: 1, caps: true });
    c.tube(bez([26, 21], [18, 24], [4, 25]), (t) => 2.4 + t * 1.3, red, { z: 1.5 });
    c.dome(33, 16, 3.4, 3.4, st, { z: 2.5 });
    c.px(33, 16, '#20243a');
    c.glint(45, 14, 0);
  },
  spinnerSpoon(c) {
    const st = c.mat(P.steel, METAL), gold = c.mat(P.gold, { ...METAL, metal: 0.7, spec: 1.2 }), red = c.mat(P.redp, SHINY), fth = c.mat(P.redp, SOFT);
    c.tube([[6, 3], [21, 27]], 0.8, st);
    c.ring(6, 3.5, 1.6, 1.6, 0.7, st);
    const sp = c.shape(1, 1, 26, 28, (x, y) => {
      const dx = x - 13, dy = y - 13, a = -0.55, u = (dx * Math.cos(a) + dy * Math.sin(a)) / 7, v = (-dx * Math.sin(a) + dy * Math.cos(a)) / 11;
      const r = Math.hypot(u * (1 + v * 0.35), v); return r > 1 ? null : 1.5 + r * r * 3;
    }, gold, { z: 1 });
    c.paint((x, y) => (Math.hypot(x - 11, y - 9) < 2.3 ? 0.4 : null), sp);
    for (const [x, y] of [[16.5, 20], [18.3, 23]] as V2[]) c.dome(x, y, 1.8, 1.8, red, { z: 2 });
    for (let k = 0; k < 5; k++) c.tube(bez([21, 27], [22 + k * 0.6, 29], [19 + k * 2, 31]), 0.7, fth);
    c.tube(curve((t) => { const a = Math.PI * 0.2 + t * Math.PI; return [24 + Math.cos(a) * 2.6, 27 + Math.sin(a) * 2.6]; }, 10), 0.8, st, { z: 2 });
    c.glint(10, 8, 1);
  },
  filletKnife(c) {
    const st = c.mat(P.steel, { ...METAL, spec: 1 }), wd = c.mat(P.darkwood, { ...SOFT, spec: 0.3 }), br = c.mat(P.brass, METAL);
    const bl = c.slab([[37, 10], [66, 10.5], [84, 12.5], [94, 15.5], [84, 17.5], [62, 20], [37, 21]], st, { h: 2.2, bevel: 0.7 });
    c.paint((x, y) => (y >= 18 && y <= 21 ? 0.25 : y <= 11 ? -0.1 : null), bl);
    c.paint((x, y) => (polyDist([[42, 13], [80, 14]], x + 0.5, y + 0.5) < 0.6 ? 0.35 : null), bl);
    const h = c.slab([[4, 10], [33, 9], [36, 11], [36, 21], [33, 23], [5, 22], [3, 16]], wd, { h: 4, bevel: 1.2, round: true });
    c.paint((x, y) => (Math.sin(y * 1.9 + x * 0.12 + fbm(x / 6, y / 2, 2, 4) * 4) > 0.7 ? -0.25 : null), h);
    c.slab([[34, 8.5], [39, 8.5], [39, 22.5], [34, 22.5]], st, { h: 4, bevel: 1.5, z: 0.5 });
    for (const x of [10, 19, 28]) c.dome(x, 16, 1.7, 1.7, br, { z: 3.6 });
    c.glint(70, 12, 0); c.glint(50, 12, 0);
  },
  harpoonTip(c) {
    const ir = c.mat(P.iron, { ...METAL, spec: 0.9 }), wd = c.mat(P.darkwood, SOFT), rope = c.mat(P.rope, SOFT);
    const sh = c.tube([[16, 62], [16, 26]], 3, wd);
    c.paint((x, y) => (Math.sin(x * 2 + y * 0.3) > 0.7 ? -0.25 : null), sh);
    c.slab([[16, 2], [23.5, 16], [19.5, 15.5], [19.5, 30], [12.5, 30], [12.5, 15.5], [8.5, 16]], ir, { h: 3.5, bevel: 0.9, z: 1 });
    c.slab([[12.8, 20], [6, 29], [7, 30], [12.8, 25]], ir, { h: 2, bevel: 1, z: 1 });
    c.slab([[19.2, 20], [26, 29], [25, 30], [19.2, 25]], ir, { h: 2, bevel: 1, z: 1 });
    c.groove([[16, 5], [16, 28]], 0.7, 0.8, -0.2);
    const r = c.tube([[12.5, 33], [19.5, 33]], 2, rope, { z: 3 });
    for (const y of [36, 39]) c.tube([[12.5, y], [19.5, y]], 1.8, rope, { z: 3, group: r });
    c.paint((x, y) => ((x + y) % 3 === 0 ? -0.2 : null), r);
    c.glint(14, 12, 1);
  },
  wormCan(c) {
    const tin = c.mat(P.steel, { ...METAL, metal: 0.5 }), lab = c.mat(P.cream, SOFT), red = c.mat(P.redp, SOFT), worm = c.mat(P.pink, { spec: 0.6, shin: 10, dither: 0.35 });
    c.tube(bez([12, 13], [8, 7], [11, 3]), 2, worm, { z: 0 });
    c.tube(bez([20, 13], [25, 8], [21, 4]), 2, worm, { z: 0 });
    const can = c.shape(6, 11, 26, 30, (x, y) => { const u = (x - 16) / 9.8; return Math.abs(u) > 1 || y < 12 || y > 30 ? null : Math.sqrt(1 - u * u) * 7 + 1; }, tin, { z: 1 });
    c.recolor((x, y) => y >= 16 && y <= 26, lab, can); c.recolor((x, y) => y >= 16 && y <= 18, red, can); c.recolor((x, y) => y >= 25 && y <= 26, red, can);
    c.paint((x, y) => (y === 13 || y === 29 ? 0.25 : y === 14 || y === 28 ? -0.25 : null), can);
    c.dome(16, 12.2, 9.8, 2.6, c.mat(P.darkstone, MATTE), { z: 8, h: 0.4 });
    c.tube(bez([15, 13], [14, 6], [17, 5]), 2.1, worm, { z: 9 });
    c.paint((x, y) => (Math.sin(y * 2.2) > 0.6 ? -0.2 : null));
    c.px(16, 4, '#140810'); c.px(18, 4, '#140810');
    c.tube(curve((t) => [10 + t * 12, 21 + Math.sin(t * 10) * 1.3], 20), 0.9, worm, { z: 9 });
    c.slab([[3, 9], [9, 3], [11, 6], [6, 11]], tin, { h: 0.8, z: 2 });
  },
  lineSpool(c) {
    const pl = c.mat(P.blue, SHINY), line = c.mat(P.mono, { spec: 0.6, shin: 10, dither: 0.3 });
    c.dome(8, 16, 4, 13, pl, { h: 3 });
    const core = c.shape(8, 6, 24, 26, (x, y) => { const v = (y - 16) / 10; return Math.abs(v) > 1 || x < 8 || x > 24 ? null : Math.sqrt(1 - v * v) * 5 + 1; }, line, { z: 2 });
    c.paint((x, y) => (Math.sin(y * 3.3 + x * 0.6) > 0.55 ? -0.18 : null), core);
    c.dome(24, 16, 4, 13, pl, { h: 3, z: 4 });
    c.dome(24, 16, 1.8, 2.5, c.mat(P.steel, METAL), { z: 7 });
    c.tube(bez([18, 24], [22, 30], [29, 28]), 0.85, line, { z: 7 });
    c.glint(6, 8, 0); c.glint(22, 7, 0);
  },

  // ================================================================ trinkets
  bottleCap(c) {
    const m = c.mat(P.redp, { ...METAL, metal: 0.3, spec: 0.9 }), wh = c.mat(P.whitep, SHINY);
    const g = c.slab(starPoly(16, 16, 13.4, 11.6, 21), m, { h: 3.5, bevel: 1 });
    c.bump((x, y) => { const r = Math.hypot(x - 16, y - 16); return r < 9.5 ? 0.8 : null; }, g);
    c.recolor((x, y) => inPoly(starPoly(16, 16, 6.5, 2.8, 5), x + 0.5, y + 0.5), wh, g);
    c.paint((x, y) => { const r = Math.hypot(x - 16, y - 16); return r > 9.5 && r < 10.5 ? -0.3 : null; }, g);
    c.glint(10, 9, 1);
  },
  rubberDuck(c) {
    const y = c.mat(P.yellow, { spec: 0.7, shin: 12, dither: 0.35 }), o = c.mat(P.orange, SHINY);
    c.slab([[25, 18], [30, 7], [31.5, 12], [28, 22]], y, { h: 3, round: true });
    c.dome(17, 22, 13.5, 8.5, y, { h: 8 });
    c.dome(11.5, 11, 7.6, 7.2, y, { h: 6.5, z: 2 });
    c.dome(21, 20, 7, 4.2, y, { h: 2, z: 7, rot: -0.3 });
    c.dome(3.8, 13.5, 4, 2.4, o, { z: 6, h: 2 });
    c.px(2, 14, P.orange[1]); c.px(3, 15, P.orange[1]); c.px(4, 15, P.orange[1]);
    for (const [ex, ey] of [[10, 9], [11, 9], [10, 10], [11, 10]] as V2[]) c.px(ex, ey, '#141018');
    c.px(10, 9, '#ffffff');
    c.glint(15, 6, 0);
  },
  bottleMessage(c) {
    const gl = c.mat(P.seaglass, { glass: 0.85, spec: 0.9, shin: 14, dither: 0.3, contrast: 0.75 });
    const paperIn = c.mat(P.paper.map((p) => mix(p, P.seaglass[3], 0.35)) as Pal, { spec: 0.2, contrast: 0.8 });
    const ck = c.mat(P.cork, MATTE), rib = c.mat(P.redp.map((p) => mix(p, P.seaglass[3], 0.3)) as Pal, SOFT);
    const body = c.tube([[11, 18], [40, 14.5]], 9.5, gl, { hk: 0.5 });
    c.tube([[40, 14.5], [46, 13.5], [54, 12.8]], (t) => 7.5 - t * 4.3, gl, { group: body, hk: 0.5 });
    c.ring(54, 12.8, 1.2, 3.8, 1.2, gl, { z: 3 });
    c.tube([[55, 12.8], [61, 12.4]], 3.1, ck, { z: 2 });
    const sc = c.tube([[15, 18.5], [37, 15.2]], 4.3, paperIn, { z: 1.5 });
    c.recolor((x) => x > 25 && x < 28, rib, sc);
    c.line(14, 10, 36, 7, '#e6fff6'); c.line(14, 11, 26, 9.4, '#c8f4e4'); c.px(44, 10, '#ffffff');
  },
  compass(c) {
    const br = c.mat(P.brass, { ...METAL, metal: 0.55 }), face = c.mat(P.paper, { ...MATTE, flat: 0.7 }), red = c.mat(P.redp, SHINY), wh = c.mat(P.whitep, SHINY);
    c.ring(16, 4.5, 3, 2.8, 1.3, br);
    c.dome(16, 8, 2.5, 2, br, { z: 1 });
    c.dome(16, 18, 12.5, 12, br, { h: 5 });
    c.dome(16, 18, 9.2, 8.8, face, { h: 1, z: 3 });
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, r = k % 4 === 0 ? 7 : 7.8; c.px(16 + Math.cos(a) * r, 18 + Math.sin(a) * r, '#4a3424'); }
    c.slab([[16, 18], [20.5, 11], [17.5, 17]], red, { h: 1.2, z: 4.2 });
    c.slab([[16, 18], [11.5, 25], [14.5, 19]], wh, { h: 1.2, z: 4.2 });
    c.dome(16, 18, 1.4, 1.4, br, { z: 5.5 });
    c.line(10, 13, 12, 11, '#ffffff'); c.px(9, 15, '#ffffff');
  },
  sharkNecklace(c) {
    const cord = c.mat(P.darkwood, SOFT), tooth = c.mat(P.bone, { spec: 0.6, shin: 14, dither: 0.35 }), br = c.mat(P.brass, METAL);
    const beads = [c.mat(P.aqua, SHINY), c.mat(P.coral, SHINY), c.mat(P.bone, SHINY)];
    const arc = curve((t) => [4 + t * 56, 4 + Math.sin(t * Math.PI) * 14], 40);
    c.tube(arc, 1.1, cord);
    for (let k = 1; k < 10; k++) { if (k === 5) continue; const p = arc[k * 4]; c.dome(p[0], p[1], 2.4, 2.4, beads[k % 3], { z: 1 }); }
    c.slab([[25, 17], [39, 17], [36, 22], [32, 31], [29, 22]], tooth, { h: 3.2, bevel: 0.8, round: true, z: 1 });
    c.tube([[27, 18.5], [37, 18.5]], 1.3, br, { z: 3.5 });
    c.ring(32, 16.5, 1.8, 1.6, 0.8, br, { z: 2 });
    c.glint(30, 21, 0);
  },
  anglerLantern(c) {
    const fl = c.mat(P.flesh, { spec: 0.4, shin: 10, dither: 0.4 }), bulb = c.mat(P.lantern, { spec: 1, shin: 10, dither: 0.3, emit: 0.55, contrast: 0.8 });
    c.dome(9, 58, 7, 5, fl, { h: 3 });
    const st = c.tube(bez3([8, 58], [3, 34], [10, 10], [22, 12], 30), (t) => 3.4 - t * 1.6, fl);
    c.speckle(0.12, 5, (_x, _y, i) => { c.L[i] += 0.3; }, st);
    c.tube([[22, 12], [22.5, 16]], 1.5, fl, { z: 1 });
    c.drop(22.5, 14, 33, 8.5, bulb, { z: 2, h: 7, point: 0.6 });
    for (let k = 0; k < 4; k++) c.tube(bez([18 + k * 3, 31], [17 + k * 3.5, 36], [19 + k * 2.6, 41]), 0.75, bulb, { z: 1 });
    c.paint((x, y) => (Math.hypot(x - 21.5, y - 24) < 3.2 ? 0.45 : null));
    c.glint(19, 19, 1);
  },
  mermaidScale(c) {
    const m = c.mat(P.aqua, { spec: 0.9, shin: 16, dither: 0.3, irid: 0.5, contrast: 1.1 });
    const poly: V2[] = [...curve((t) => { const a = Math.PI * (1 + t); return [16 + Math.cos(a) * 12.5, 15 + Math.sin(a) * 11]; }, 24), [27, 19], [16, 30], [5, 19]];
    const g = c.slab(poly, m, { h: 4, bevel: 0.8, round: true });
    c.paint((x, y) => { const r = Math.hypot(x - 16, (y - 30) * 0.9); return Math.sin(r * 1.2) > 0.75 ? 0.18 : null; }, g);
    c.paint((x, y) => (polyDist([[16, 6], [16, 27]], x + 0.5, y + 0.5) < 0.7 ? 0.2 : null), g);
    c.glint(10, 9, 1);
  },
  starfish(c) {
    const m = c.mat(P.orange, { spec: 0.3, shin: 8, dither: 0.5 }), bump = c.mat(P.orange, { ...SOFT, contrast: 0.8 });
    const g = c.slab(starPoly(16, 17, 14.5, 5.8, 5, -Math.PI / 2, 0.12, 4), m, { h: 5, bevel: 0.9, round: true });
    c.speckle(0.18, 6, (x, y, i) => { c.L[i] += 0.28; c.M[i] = bump; }, g);
    c.dome(16, 17, 3.2, 3.2, m, { z: 4.5, h: 1.2 });
    c.px(16, 17, P.orange[1]);
  },
  crabClaw(c) {
    const m = c.mat(P.redp, { spec: 0.6, shin: 12, dither: 0.4 }), tip = c.mat(P.black, SHINY), belly = c.mat(P.orange, SOFT);
    c.tube([[2, 30], [8, 25]], (t) => 3.6 - t * 0.6, m);
    const fx = c.tube(bez3([14, 15], [18, 9], [22, 5], [27, 2.5], 20), (t) => 5.2 - t * 4.2, m, { z: 1 });
    const mv = c.tube(bez3([18, 21], [25, 20], [29, 15], [30, 9], 20), (t) => 4.4 - t * 3.6, m, { z: 2 });
    const pg = c.dome(13, 21, 10, 8, m, { rot: -0.65, z: 3, h: 7 });
    c.recolor((x, y) => y > 23 && x > 9, belly, pg);
    c.recolor((x, y) => y < 6 && x > 22, tip, fx); c.recolor((x, y) => y < 13 && x > 27, tip, mv);
    for (let k = 0; k < 4; k++) c.dome(22 + k * 1.6, 12 - k * 2, 1.1, 1.1, m, { z: 1.5 });
    c.speckle(0.1, 2, (_x, _y, i) => { c.L[i] += 0.25; });
    c.glint(9, 17, 1);
  },
  oldBoot(c) {
    const lea = c.mat(P.leather, { spec: 0.25, shin: 8, dither: 0.5 }), sole = c.mat(P.black, SOFT), lace = c.mat(P.cream, SOFT), br = c.mat(P.brass, METAL), dark = c.mat(P.black, MATTE), kelp = c.mat(P.kelp, SOFT);
    c.tube(bez([12, 10], [8, 4], [12, 0.5]), 1.6, kelp);
    c.tube(bez([20, 10], [24, 3], [28, 2]), 1.4, kelp);
    const b = c.slab([[8, 8], [31, 7], [32, 36], [46, 38], [56, 42], [59, 50], [57, 55], [7, 55], [5, 30]], lea, { h: 6, bevel: 1, round: true });
    c.paint((x, y) => (fbm(x / 6, y / 6, 3, 5) > 0.62 ? 0.18 : fbm(x / 4, y / 4, 2, 9) < 0.3 ? -0.15 : null), b);
    c.dome(19.5, 8, 11.5, 2.8, dark, { z: 5.5, h: 0.5 });
    c.slab([[6, 53], [58, 53], [59, 57], [57, 61], [7, 61], [5, 57]], sole, { h: 3, bevel: 1, z: 1 });
    c.slab([[6, 53], [20, 53], [20, 62], [6, 62]], sole, { h: 4, bevel: 1, z: 1.5 });
    for (let k = 0; k < 5; k++) {
      const y = 13 + k * 5.5;
      c.dome(25, y, 1.3, 1.3, br, { z: 6 }); c.dome(31, y + 1, 1.3, 1.3, br, { z: 6 });
      c.tube([[25, y], [31, y + 6]], 0.9, lace, { z: 6.5 }); c.tube([[31, y + 1], [25, y + 5.5]], 0.9, lace, { z: 6.8 });
    }
    c.tube(bez([28, 12], [36, 8], [38, 16]), 0.9, lace, { z: 7 });
    c.paint((x, y) => (Math.hypot(x - 50, y - 46) < 2.2 ? -0.6 : null), b);
    c.paint((x, y) => (y === 51 && x % 3 === 0 && x > 8 && x < 56 ? 0.35 : null), b);
  },
  spiralShell(c) {
    const m = c.mat(P.shell, { spec: 0.5, shin: 12, dither: 0.45 }), ap = c.mat(P.pink, SHINY), band = c.mat(P.darkwood, SOFT);
    const whorls: number[][] = [[21, 4.5, 2.6, 2], [20, 8, 5, 3.4], [18.5, 13.5, 8, 5], [16, 21, 12.5, 8]];
    whorls.forEach(([x, y, rx, ry], k) => c.dome(x, y, rx, ry, m, { z: (3 - k) * 1.6, h: ry * 1.1 }));
    c.paint((x, y) => (Math.sin(x * 0.9 + y * 0.35) > 0.78 ? -0.16 : null));
    c.recolor((x, y) => hash2(Math.floor(x / 3), Math.floor(y / 2), 7) < 0.18 && y > 9, band);
    c.dome(10, 23, 5.5, 6.5, ap, { rot: 0.5, z: 7, h: 2.5 });
    c.paint((x, y) => (Math.hypot((x - 10.5) / 0.8, y - 23.5) < 2.6 ? -0.5 : null));
    c.glint(13, 16, 0); c.glint(18, 7, 0);
  },
  teacup(c) {
    const pc = c.mat(P.whitep, { spec: 0.7, shin: 16, dither: 0.3 }), tea = c.mat(P.tea, { spec: 0.6, flat: 0.8 }), blue = c.mat(P.blue, SOFT);
    c.dome(16, 27.5, 14.5, 3.4, pc, { h: 1.4 });
    c.ring(26, 16.5, 4, 4.2, 1.5, pc, { z: 1 });
    const cup = c.shape(5, 10, 27, 28, (x, y) => {
      if (y < 10.5 || y > 27) return null; const v = (y - 10.5) / 16.5; const hw = 10.5 * (1 - v * v * 0.45);
      const u = (x - 16) / hw; return Math.abs(u) > 1 ? null : Math.sqrt(1 - u * u) * 6 + 1;
    }, pc, { z: 2 });
    c.dome(16, 11, 10.2, 2.4, tea, { z: 7.5, h: 0.3 });
    c.speckle(0.05, 3, (x, y, i) => { if (y > 14 && y < 24) c.M[i] = blue; }, cup);
    c.recolor((x, y) => (y === 15 || y === 16) && x % 4 === 0, blue, cup);
    c.erase((x, y) => Math.hypot(x - 7.5, y - 10.5) < 2.2);
    c.glint(10, 15, 0);
  },

  // ================================================================ ability cores
  pumiceHeart(c) {
    const m = c.mat(P.pumice, MATTE), lava = c.mat(P.lava, { spec: 0.4, dither: 0.3, emit: 0.55, contrast: 0.7 });
    const poly = curve((t) => { const a = t * Math.PI * 2; return [32 + 16 * Math.pow(Math.sin(a), 3) * 1.65, 29 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 1.6]; }, 80);
    const g = c.slab(poly, m, { h: 9, bevel: 0.9, round: true });
    c.bump((x, y) => (fbm(x / 6, y / 6, 3, 2) - 0.5) * 3, g);
    c.speckle(0.16, 4, (_x, _y, i) => { c.L[i] -= 0.38; }, g);
    c.speckle(0.06, 5, (_x, _y, i) => { c.L[i] -= 0.6; }, g);
    const cracks: V2[][] = [[[32, 18], [29, 26], [34, 32], [30, 40], [32, 50]], [[29, 26], [20, 28], [14, 24]], [[34, 32], [44, 30], [50, 24]], [[30, 40], [23, 42]], [[44, 30], [46, 38]]];
    for (const cr of cracks) c.recolor((x, y) => polyDist(cr, x + 0.5, y + 0.5) < 1.3, lava, g);
    c.paint((x, y) => (cracks.some((cr) => polyDist(cr, x + 0.5, y + 0.5) < 0.6) ? 0.35 : null));
    c.glint(31, 33, 1, '#fffbd0'); c.glint(19, 14, 0, '#e8e0dc');
  },
  laserLens(c) {
    const bd = c.mat(P.black, { ...METAL, metal: 0.4, spec: 0.8 }), st = c.mat(P.steel, METAL), red = c.mat(P.ruby, { ...GEMO, emit: 0.45 }), btn = c.mat(P.redp, SHINY);
    const b = c.tube([[16, 18], [16, 58]], (t) => 5 - t * 0.6, bd);
    c.recolor((x, y) => (y > 21 && y < 24) || (y > 50 && y < 53), st, b);
    c.dome(16, 32, 2.2, 2.6, btn, { z: 5 });
    c.slab([[21, 22], [24, 22], [24, 44], [22, 46], [21, 44]], st, { h: 1.5, z: 3 });
    c.tube([[16, 11], [16, 19]], 5.6, st, { z: 1 });
    c.dome(16, 9.5, 4.2, 3.4, red, { z: 3 });
    for (const [dx, dy] of [[0, -1], [-0.6, -1], [0.6, -1]] as V2[]) c.line(16 + dx * 5, 5 + dy, 16 + dx * 9, 1, '#ff6a5a');
    c.glint(14, 8, 0, '#ffe0d8');
  },
  bubbleWand(c) {
    const pl = c.mat(P.pink, SHINY), film = c.mat(P.glass, { glass: 1, spec: 0.8, shin: 10, dither: 0.25, irid: 0.65, contrast: 0.5 });
    const st = c.tube([[16, 62], [16, 25]], 1.9, pl);
    c.paint((x, y) => (Math.sin((y + x) * 0.9) > 0.5 ? 0.25 : null), st);
    c.dome(16, 15, 8.5, 8.5, film, { h: 1 });
    c.ring(16, 15, 9.4, 9.4, 2, pl, { z: 1 });
    for (const [x, y, r] of [[26, 33, 3.5], [7, 40, 2.6], [24, 46, 2]] as number[][]) { c.dome(x, y, r, r, film, { h: 1.5 }); c.px(x - r * 0.4, y - r * 0.4, '#ffffff'); }
    c.glint(12, 11, 1);
  },
  inkSac(c) {
    const m = c.mat(P.ink, { spec: 1, shin: 14, dither: 0.3, irid: 0.15 }), rope = c.mat(P.rope, SOFT);
    const g = c.dome(16, 17, 10.5, 11, m, { pinch: 0.35, h: 8 });
    c.paint((x, y) => (polyDist(bez([10, 10], [12, 18], [9, 24]), x + 0.5, y + 0.5) < 0.6 || polyDist(bez([20, 9], [23, 16], [21, 23]), x + 0.5, y + 0.5) < 0.6 ? 0.25 : null), g);
    c.tube([[13, 5.5], [19, 5.5]], 1.5, rope, { z: 4 });
    c.tube(bez([16, 5], [12, 1], [10, 3]), 0.9, rope, { z: 4 }); c.tube(bez([16, 5], [20, 1], [22, 3]), 0.9, rope, { z: 4 });
    c.drop(19, 26, 31.5, 2.6, m, { z: 1 });
    c.glint(11, 11, 1); c.px(12, 13, '#ffffff');
  },
  eelBattery(c) {
    const body = c.mat(P.eel, { ...SHINY, spec: 0.55 }), cu = c.mat(P.copper, METAL), st = c.mat(P.steel, METAL), yl = c.mat(P.yellow, { ...SHINY, emit: 0.4 });
    const cyl = (x0: number, x1: number, r: number, m: number, z = 0) => c.shape(x0, 16 - r, x1, 16 + r, (x, y) => { const v = (y - 16) / r; return Math.abs(v) > 1 ? null : Math.sqrt(1 - v * v) * r * 0.8 + 0.5; }, m, { z });
    const b = cyl(6, 52, 10, body);
    c.speckle(0.05, 3, (x, y, i) => { if (Math.abs(y - 16) < 8) c.M[i] = yl; }, b);
    cyl(20, 38, 10.2, cu, 0.3);
    c.slab([[30, 9], [26, 16.5], [29.5, 16.5], [27, 23.5], [33, 14.5], [29.5, 14.5], [32, 9]], yl, { h: 1, z: 9 });
    cyl(4, 8, 9.4, st, 0.5); cyl(51, 54, 9.6, st, 0.5);
    cyl(54, 59, 4, st, 0.6);
    c.line(60, 9, 62, 6, '#a0f8ff'); c.line(62, 6, 60, 4, '#a0f8ff'); c.line(60, 23, 62, 26, '#a0f8ff');
    c.glint(14, 9, 0);
  },
  pufferSpines(c) {
    const m = c.mat(P.puffer, { spec: 0.4, shin: 10, dither: 0.45 }), sp = c.mat(P.bone, SOFT), wh = c.mat(P.whitep, SHINY);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.2;
      c.tube([[16 + Math.cos(a) * 9, 17 + Math.sin(a) * 9], [16 + Math.cos(a) * 14.5, 17 + Math.sin(a) * 14.5]], (t) => 1.7 * (1 - t) + 0.25, sp);
    }
    const g = c.dome(16, 17, 10.5, 10, m, { z: 1, h: 8 });
    c.recolor((x, y) => y > 20, c.mat(P.cream, SOFT), g);
    c.speckle(0.08, 5, (x, y, i) => { if (y < 17) c.L[i] -= 0.3; }, g);
    c.dome(12, 14, 2.8, 2.8, wh, { z: 8 }); c.dome(20, 14, 2.8, 2.8, wh, { z: 8 });
    c.px(12, 14, '#141018'); c.px(13, 14, '#141018'); c.px(20, 14, '#141018'); c.px(21, 14, '#141018');
    c.px(16, 20, '#6a2a10'); c.px(16, 21, '#6a2a10');
  },
  lodestone(c) {
    const red = c.mat(P.redp, { ...SHINY, spec: 0.6 }), st = c.mat(P.steel, METAL), fil = c.mat(P.iron, METAL), rock = c.mat(P.darkstone, MATTE);
    // a horseshoe magnet carved from lodestone, its tips banded in steel
    const arc = curve((t) => { const a = Math.PI * (1 - t); return [16 + Math.cos(a) * 9, 12 - Math.sin(a) * 8.5]; }, 24);
    const g = c.tube([[7, 27], [7, 12], ...arc.slice(1, -1), [25, 12], [25, 27]], 4.2, rock);
    c.speckle(0.14, 4, (_x, _y, i) => { c.L[i] += 0.22; }, g);
    c.recolor((x, y) => y > 15 && y < 21, red, g);
    c.recolor((x, y) => y >= 21, st, g);
    c.paint((x, y) => (y === 21 || y === 15 ? -0.3 : null), g);
    for (let k = 0; k < 9; k++) {
      const x = 4 + k * 3 + (hash2(k, 1, 2) - 0.5);
      if (x > 11 && x < 21) continue;
      c.tube([[x, 31.5], [x + (hash2(k, 2, 2) - 0.5) * 3, 31.5 - 2 - hash2(k, 3, 2) * 1.5]], 0.5, fil, { z: 2 });
    }
    c.tube([[12, 30.5], [20, 25]], 0.9, st, { z: 4 }); c.dome(20.5, 24.5, 1.8, 1.1, st, { z: 4.5, rot: -0.6 });
    c.glint(5, 9, 0); c.glint(12, 5, 0);
  },
  sailFin(c) {
    const m = c.mat(P.sail, { spec: 0.35, shin: 10, dither: 0.4, irid: 0.1, contrast: 1.0 }), ray = c.mat(P.blue, { ...SHINY, contrast: 1.3 }), base = c.mat(P.sail, SOFT);
    // rays fan up from the base; the membrane hangs between them in scallops
    const N = 9, tips: V2[] = [], bases: V2[] = [];
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      bases.push([6 + t * 21, 60]);
      tips.push([7 + t * 20 + Math.sin(t * Math.PI) * 3, 3 + Math.pow(t, 1.25) * 44]);
    }
    const edge: V2[] = [];
    for (let k = 0; k < N; k++) {
      edge.push(tips[k]);
      if (k + 1 < N) { const a = tips[k], b = tips[k + 1]; edge.push([(a[0] + b[0]) / 2 - 1.2, (a[1] + b[1]) / 2 + 3]); }
    }
    const poly: V2[] = [[4, 61], [3, 40], [5, 14], ...edge, [30, 61]];
    const g = c.slab(poly, m, { h: 2, bevel: 1, round: true });
    c.paint((x, y) => (y > 50 ? -0.05 : -0.12), g);
    for (const [x, y, r] of [[11, 22, 2.2], [15, 33, 2], [10, 41, 1.8], [20, 45, 1.6], [16, 52, 1.5], [24, 54, 1.3]] as number[][]) c.paint((px, py) => (Math.hypot(px - x, py - y) < r ? -0.4 : null), g);
    for (let k = 0; k < N; k++) {
      const [bx, by] = bases[k], [tx, ty] = tips[k];
      const dx = tx - bx, dy = ty - by, l = Math.hypot(dx, dy);
      c.tube([[bx, by], [tx + (dx / l) * 1.5, ty + (dy / l) * 1.5]], (u) => 1.4 - u * 0.9, ray, { z: 1.2 });
    }
    c.tube([[3, 60], [31, 60]], 2.4, base, { z: 2 });
    c.glint(8, 10, 0);
  },
};

// ------------------------------------------------------------------ level flair + composition
function levelFlair(p: Px, level: number) {
  if (level <= 1) return p;
  const gold = level >= 3;
  const rimC = hex(gold ? '#ffd65a' : '#cfe8ff');
  // warm/cool sheen
  p.map((c) => { const k: RGB = gold ? [1.08, 1.04, 0.92] : [1.0, 1.03, 1.08]; return [c[0] * k[0], c[1] * k[1], c[2] * k[2]]; });
  {
    // a rim outside the outline: dotted silver at level 2, solid gold at level 3
    const add: [number, number][] = [];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (p.alpha(x, y)) continue;
      if (p.alpha(x - 1, y) || p.alpha(x + 1, y) || p.alpha(x, y - 1) || p.alpha(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) { if (!gold && (x + y) & 1) continue; p.set(x, y, gold ? mix(rimC, [120, 60, 10], ((x + y) & 3) === 0 ? 0.45 : 0) : rimC); }
  }
  // sparkles near the top-right of the silhouette
  const opaque: [number, number][] = [];
  for (let y = 2; y < p.h - 2; y++) for (let x = 2; x < p.w - 2; x++) if (p.alpha(x, y)) opaque.push([x, y]);
  opaque.sort((a, b) => (b[0] - b[1] * 1.2) - (a[0] - a[1] * 1.2));
  const n = gold ? 3 : 2;
  for (let k = 0; k < n && opaque.length; k++) {
    const [x, y] = opaque[Math.min(opaque.length - 1, Math.floor(opaque.length * (0.02 + k * 0.22)))];
    const c = gold ? '#fff6c0' : '#ffffff';
    p.set(x, y, c); p.set(x - 1, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x, y + 1, c);
    if (gold && k === 0) { p.set(x - 2, y, '#ffe27a'); p.set(x + 2, y, '#ffe27a'); p.set(x, y - 2, '#ffe27a'); p.set(x, y + 2, '#ffe27a'); }
  }
  // level pips bottom-left (tiny diamonds)
  const pc = hex(gold ? '#ffd040' : '#d8ecff'), po = hex(gold ? '#5a2a00' : '#1a2a4a');
  for (let k = 0; k < level; k++) {
    const cx = 3 + k * 5, cy = p.h - 4;
    for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
      const edge = Math.abs(dx) + Math.abs(dy) === 2;
      p.set(cx + dx, cy + dy, edge ? po : dx + dy < 0 ? [255, 255, 255] : pc);
    }
  }
  return p;
}

const SIZE = (d: ItemDef) => {
  const w = Math.max(...d.shape.map((c) => c[0])) + 1, h = Math.max(...d.shape.map((c) => c[1])) + 1;
  return { w: w * 32, h: h * 32 };
};

export function paintIcon(d: ItemDef, level = 1): HTMLCanvasElement {
  const { w, h } = SIZE(d);
  let seed = 0; for (const ch of d.id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const c = new Ic(w, h, Math.abs(seed) % 997);
  const fn = PAINT[d.id];
  if (fn) fn(c);
  else c.dome(w / 2, h / 2, w / 2 - 3, h / 2 - 3, c.mat(P.stone));
  // keep art inside the item's own cells (L-shapes)
  const cells = new Set(d.shape.map(([x, y]) => x + ',' + y));
  c.erase((x, y) => !cells.has(Math.floor(x / 32) + ',' + Math.floor(y / 32)) && !nearCell(cells, x, y));
  const p = c.render();
  levelFlair(p, level);
  const cv = p.canvas();
  const em = new Uint8Array(w * h);
  let any = false;
  for (let i = 0; i < w * h; i++) { const m = c.M[i]; if (m >= 0 && c.mats[m].emit > 0) { em[i] = 1; any = true; } }
  if (any) EMIT_MASK.set(cv, em);
  return cv;
}

/** allow art to bleed 2 px across an internal cell boundary (but not into empty cells' interiors) */
function nearCell(cells: Set<string>, x: number, y: number): boolean {
  const cx = Math.floor(x / 32), cy = Math.floor(y / 32);
  const fx = x - cx * 32, fy = y - cy * 32;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (!cells.has(cx + dx + ',' + (cy + dy))) continue;
    if ((dx === -1 && fx < 2) || (dx === 1 && fx > 30) || (dy === -1 && fy < 2) || (dy === 1 && fy > 30)) return true;
  }
  return false;
}
