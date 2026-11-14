// v3 item icons: each item hand-designed on the Pix painter (src/backpack/pix.ts) on a 32-px-per-cell grid,
// lit from the top left, cel-shaded into hue-shifted ramps (src/backpack/ramps.ts), selectively outlined.
// A design draws into its own box (`size` in cells, default the item's shape); paintIcon fits it to the item's
// real shape, and the same design re-rasterises crisply at 16 / 24 px for lists and the HUD.
import { Pix, bez, bez3, curve, ngon, starPts, type V2 } from './pix';
import { R } from './ramps';

export interface IconDesign { size?: [number, number]; draw: (p: Pix) => void }

// ------------------------------------------------------------------ shared motifs
/** a faceted gem: an n-gon crown with a table; facet tones from the light direction */
export function gem(p: Pix, cx: number, cy: number, rx: number, ry: number, n: number, rp: typeof R.ruby, o: { rot?: number; table?: number; emit?: boolean } = {}) {
  const outer = ngon(cx, cy, rx, ry, n, o.rot ?? -Math.PI / 2);
  const tk = o.table ?? 0.55;
  const inner = ngon(cx, cy - ry * 0.06, rx * tk, ry * tk, n, o.rot ?? -Math.PI / 2);
  p.poly(outer, rp, { shade: 'facet', tone: 2, emit: o.emit });
  for (let i = 0; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n], c = inner[(i + 1) % n], d = inner[i];
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    const l = Math.hypot(mx, my) || 1;
    const lit = (-mx / l) * 0.62 + (-my / l) * 0.78;
    const tone = lit > 0.55 ? 4 : lit > 0.05 ? 3 : lit > -0.55 ? 2 : 1;
    p.poly([a, b, c, d], rp, { shade: 'facet', tone, edge: false, emit: o.emit });
  }
  p.poly(inner, rp, { shade: 'facet', tone: 4, edge: false, emit: o.emit });
  // a lit wedge on the table, top-left
  p.poly([inner[n - 1], inner[0], [cx - rx * 0.05, cy - ry * 0.06]], rp, { shade: 'facet', tone: 5, edge: false, emit: o.emit });
}

/** a crystal prism pointing along ang: lit face / shaded face split down the middle */
export function crystal(p: Pix, bx: number, by: number, ang: number, len: number, w: number, rp: typeof R.mana, o: { emit?: boolean } = {}) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const tip: V2 = [bx + dx * len, by + dy * len];
  const sh = len - w * 1.1;
  const l0: V2 = [bx + nx * w, by + ny * w], r0: V2 = [bx - nx * w, by - ny * w];
  const l1: V2 = [l0[0] + dx * sh, l0[1] + dy * sh], r1: V2 = [r0[0] + dx * sh, r0[1] + dy * sh];
  const m0: V2 = [bx - nx * w * 0.1, by - ny * w * 0.1], m1: V2 = [m0[0] + dx * (sh + w * 0.3), m0[1] + dy * (sh + w * 0.3)];
  // which side faces the light (top-left)?
  const leftLit = nx * -0.62 + ny * -0.78 > 0;
  p.poly([l0, l1, tip, r1, r0], rp, { shade: 'facet', tone: 2, emit: o.emit });
  p.poly([l0, l1, tip, m1, m0], rp, { shade: 'facet', tone: leftLit ? 4 : 2, edge: false, emit: o.emit });
  p.poly([m0, m1, tip, r1, r0], rp, { shade: 'facet', tone: leftLit ? 2 : 4, edge: false, emit: o.emit });
  p.line([m0, m1], 1);
  p.px(tip[0] - dx * 2 + (leftLit ? nx : -nx), tip[1] - dy * 2 + (leftLit ? ny : -ny), rp[5]);
}

/** a stack of n coin edges or a round coin face */
export function coin(p: Pix, cx: number, cy: number, r: number, rp: typeof R.gold) {
  p.circle(cx, cy, r, rp, { spec: true, flat: 0.45 });
  p.ring(cx, cy, r - 2.6, 1.2, rp, { shade: 'facet', tone: 2, edge: false });
}

function inPolyD(P: V2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) c = !c; }
  return c;
}

/** an upright book: cover in `rp`, metal corners in `mt`, an emblem drawn by `emblem(cx, cy)` */
function tome(p: Pix, rp: typeof R.ice, mt: typeof R.brass, emblem: (cx: number, cy: number) => void) {
  p.rect(25, 5, 4, 54, R.paper, { r: 1 });
  for (let y = 8; y < 58; y += 3) p.px(27, y, '#b29c7c');
  p.rect(3, 3, 24, 58, rp, { r: 2, bevel: 2 });
  p.rect(3, 3, 5, 58, rp, { r: 2, shade: 'facet', tone: 2 });
  for (const y of [10, 52]) p.line([[4, y], [7, y]], 1);
  for (const [x, y] of [[23, 4], [23, 56]] as V2[]) p.rect(x, y, 4, 4, mt, { r: 1 });
  p.rect(26, 28, 5, 8, mt, { r: 1.5 });
  emblem(16, 30);
}

// ------------------------------------------------------------------ designs
export const ICON_ART: Record<string, IconDesign> = {
  // ================================================================ materials
  pearl: { draw(p) {
    // a little shell cup under a big lustrous pearl
    p.ellipse(16, 25, 12, 4.5, R.shell, { shade: 'round', flat: 0.3 });
    p.poly([[5, 24], [9, 21], [16, 20], [23, 21], [27, 24], [16, 26]], R.shell, { tone: 2, shade: 'facet', edge: false });
    p.circle(16, 15, 10, R.pearl, { spec: true });
    // reflected pink light on the lower right
    p.shadeWhere((x, y) => { const d = Math.hypot(x - 16, y - 15); return d > 7.6 && d < 10 && x + y > 33; }, 1);
    p.px(13, 9, '#ffffff'); p.px(12, 10, '#ffffff'); p.px(13, 10, '#ffffff'); p.px(11, 11, '#fff4fa');
    p.px(20, 20, '#ffd0e4'); p.px(21, 19, '#ffd0e4');
  } },

  copperOre: { draw(p) {
    p.circle(9, 22, 5.5, R.copper, { spec: true });
    p.poly([[6, 17], [8, 10], [14, 6], [21, 6], [26, 10], [27, 17], [24, 23], [17, 26], [11, 24]], R.copper, { shade: 'round', spec: true });
    p.circle(22, 23, 4.5, R.copper, { spec: true });
    // dents
    p.line([[13, 14], [16, 13]], -1); p.line([[19, 17], [21, 19]], -1);
    // patina
    for (const [x, y] of [[10, 12], [11, 12], [10, 13], [23, 14], [24, 14], [24, 15], [8, 24], [7, 24]] as V2[]) p.px(x, y, '#4ab88a');
    p.px(11, 11, '#a8f0c8'); p.px(24, 13, '#a8f0c8');
    p.glint(15, 9);
  } },

  ironOre: { draw(p) {
    p.poly([[4, 20], [7, 11], [14, 6], [23, 7], [28, 13], [27, 22], [20, 27], [10, 27]], R.iron, { shade: 'flat', bevel: 3 });
    p.poly([[7, 11], [14, 6], [16, 13], [9, 16]], R.iron, { shade: 'facet', tone: 4, edge: false });
    p.poly([[16, 13], [23, 7], [28, 13], [21, 17]], R.iron, { shade: 'facet', tone: 3, edge: false });
    p.poly([[9, 16], [16, 13], [21, 17], [20, 27], [10, 27], [4, 20]], R.iron, { shade: 'facet', tone: 2, edge: false });
    p.poly([[21, 17], [28, 13], [27, 22], [20, 27]], R.iron, { shade: 'facet', tone: 1, edge: false });
    p.line([[9, 16], [16, 13], [21, 17], [20, 27]], 1);
    for (const [x, y] of [[12, 19], [17, 22], [23, 12], [11, 10]] as V2[]) { p.px(x, y, '#e8f0ff'); p.px(x + 1, y, '#9aa8c0'); }
  } },

  kelp: { draw(p) {
    const st = bez3([16, 62], [11, 46], [21, 26], [15, 4], 30);
    p.stroke(st, (t) => 2.1 - t * 0.9, R.olive);
    const at = (t: number) => st[Math.round(t * (st.length - 1))];
    const blades: [number, number][] = [[0.12, -1], [0.28, 1], [0.44, -1], [0.6, 1], [0.76, -1], [0.9, 1]];
    for (const [t, side] of blades) {
      const [x, y] = at(t);
      const len = 15 - t * 7;
      const tip: V2 = [x + side * len, y - len * 0.75];
      const mid: V2 = [x + side * len * 0.55, y - len * 0.15];
      const path = bez([x, y], mid, tip, 14);
      p.stroke(path, (u) => Math.sin(Math.PI * Math.min(1, u * 1.08)) * (3.6 - t * 1.4) + 0.4, R.kelp, { caps: true });
      p.line(path.slice(1, 11), -1);
      p.ellipse(x + side * 1.5, y + 0.5, 2.1, 2.3, R.olive, { spec: true });
    }
  } },

  manaCrystal: { draw(p) {
    p.poly([[3, 29], [7, 23], [15, 22], [24, 23], [29, 29], [16, 30]], R.darkstone, { shade: 'flat', bevel: 2 });
    crystal(p, 10, 27, -2.05, 15, 3.2, R.mana, { emit: true });
    crystal(p, 22, 27, -1.05, 14, 3, R.mana, { emit: true });
    crystal(p, 16, 26, -1.57, 23, 4.4, R.mana, { emit: true });
    p.glint(14, 8, 1);
    p.px(25, 11, '#d8f0ff');
  } },

  lineScrap: { draw(p) {
    // a neat coil of monofilament with a loose tail, a split shot and a tiny hook
    const loops: [number, number, number, number, number][] = [[15, 15, 10, 7, 0.4], [16, 16, 9, 8, -0.5], [15, 16, 11, 6, 1.3]];
    for (const [x, y, rx, ry, rot] of loops) p.ring(x, y, rx, 1.7, R.mono, { ry, a0: rot, a1: rot + Math.PI * 1.96 });
    p.stroke(bez3([24, 20], [27, 24], [22, 27], [27, 29], 14), 0.85, R.mono);
    p.circle(27.5, 29, 1.9, R.lead, { spec: true });
    p.stroke(curve((t) => { const a = Math.PI * (0.15 + t * 1.15); return [6 + Math.cos(a) * 2.4, 25 + Math.sin(a) * 2.6]; }, 10), 0.8, R.steel);
    p.stroke([[8.2, 23.5], [8.5, 19]], 0.8, R.steel);
    p.glint(10, 9);
  } },

  rustyHook: { draw(p) {
    p.ring(18, 5.5, 3, 2.6, R.iron);
    const path: V2[] = [[18, 8.5], [18, 20], ...curve((t) => { const a = t * Math.PI; return [12 + Math.cos(a) * 6, 20 + Math.sin(a) * 7.5]; }, 16).slice(1), [6, 12]];
    p.stroke(path, (t) => (t > 0.86 ? 2.2 - ((t - 0.86) / 0.14) * 1.5 : 2.2), R.iron);
    p.poly([[6, 9.5], [10.5, 15.5], [7.6, 15.5]], R.iron, { shade: 'facet', tone: 3 });
    for (const [x, y, r] of [[18, 14, 2.6], [15, 27, 3.2], [7, 21, 2.2], [20, 5, 1.6]] as [number, number, number][]) p.circle(x, y, r, R.rust, { clip: true, edge: false });
    p.px(19, 11, '#e8f0ff'); p.px(19, 12, '#c8d4ea');
  } },

  leadShot: { draw(p) {
    for (const [x, y, r] of [[20, 19, 7], [11, 11, 5.6], [10, 23, 5.4]] as [number, number, number][]) {
      p.circle(x, y, r, R.lead, { spec: true });
      p.line([[x - r + 1.5, y + 0.5], [x + r - 1.5, y - 0.5]], -2);
      p.px(x - r * 0.45, y - r * 0.5, '#e8eef6');
    }
  } },

  cork: { draw(p) {
    // a wine cork, lying diagonally: a tapered barrel with a lighter end face
    p.stroke([[9, 24], [21, 11]], (t) => 7 - t * 1, R.cork);
    p.ellipse(21.5, 10.5, 5.6, 4, R.cork, { rot: -0.83, shade: 'facet', tone: 4 });
    p.ellipse(21.5, 10.5, 3.2, 2, R.cork, { rot: -0.83, shade: 'facet', tone: 3, edge: false });
    for (const [x, y] of [[8, 21], [12, 24], [11, 18], [15, 20], [14, 15], [18, 16], [9, 26], [17, 22], [20, 19]] as V2[]) p.setTone(x, y, 1);
    p.px(20, 9, '#fff0cc');
  } },

  coralShard: { size: [2, 2], draw(p) {
    // a branching fire coral filling the L (left column + bottom right), growing from a rock bottom right
    const br = (pts: V2[], r0: number, r1: number) => p.stroke(pts, (t) => r0 + (r1 - r0) * t, R.coral);
    br(bez3([46, 58], [40, 50], [28, 48], [20, 40], 18), 4.6, 3.4);
    br(bez([20, 41], [13, 28], [16, 15], 14), 3.4, 2);
    br(bez([16, 16], [13, 9], [9, 4], 8), 2, 1.1);
    br(bez([16, 16], [21, 10], [23, 3], 8), 1.9, 1.1);
    br(bez([19, 38], [8, 35], [6, 22], 12), 2.6, 1.3);
    br(bez([7, 26], [3, 20], [4, 14], 8), 1.4, 1);
    br(bez([15, 27], [25, 24], [27, 15], 10), 2.1, 1.1);
    br(bez([40, 51], [52, 46], [57, 35], 12), 3, 1.4);
    br(bez([51, 46], [46, 40], [45, 34], 8), 1.8, 1.1);
    br(bez([30, 47], [28, 40], [32, 34], 8), 2, 1.1);
    p.ellipse(46, 61, 10, 3.4, R.stone, { flat: 0.4 });
    for (const [x, y] of [[9, 5], [22, 4], [5, 15], [27, 16], [57, 36], [45, 35], [32, 35], [14, 30], [24, 44], [36, 50], [50, 50]] as V2[]) p.px(x, y, '#ffe0c8');
  } },

  seaGlass: { draw(p) {
    p.poly([[16, 18], [25, 15], [29, 22], [24, 28], [17, 26]], R.seaglassB, { bevel: 2 });
    p.poly([[4, 14], [10, 6], [18, 8], [20, 16], [12, 21], [5, 19]], R.seaglass, { bevel: 2.2 });
    p.poly([[5, 23], [11, 21], [14, 27], [8, 30]], R.orange, { bevel: 1.5 });
    p.line([[8, 9], [13, 8]], '#f0fff8'); p.px(7, 10, '#f0fff8');
    p.line([[19, 17], [23, 16]], '#f0faff');
  } },

  rustyNail: { draw(p) {
    p.stroke([[9, 9], [21, 21], [26, 27]], (t) => (t > 0.85 ? 1.6 - (t - 0.85) * 9 : 1.6), R.iron);
    p.ellipse(8, 8, 4.8, 2.4, R.iron, { rot: -2.36, spec: true });
    for (const [x, y, r] of [[13, 13, 2], [20, 20, 1.8], [8, 7, 2.2]] as [number, number, number][]) p.circle(x, y, r, R.rust, { clip: true, edge: false });
    p.px(6, 6, '#eef4fc');
  } },

  doubloon: { draw(p) {
    coin(p, 16, 16, 12.5, R.gold);
    // an embossed skull: lit face, shaded underside
    const sk = ['.###.', '#####', '#.#.#', '#####', '.#.#.'];
    sk.forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#') { p.px(14 + x, 13 + y, '#8a4a0c'); p.px(13 + x, 12 + y, '#fff4a8'); } });
    sk.forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '.' && y > 1 && y < 4) p.px(13 + x, 12 + y, '#7a3a08'); });
    p.glint(9, 8, 1);
  } },

  riverStone: { draw(p) {
    p.ellipse(22, 12, 6, 4.5, R.stone, { flat: 0.2 });
    p.ellipse(14, 19, 11.5, 8, R.stone, { rot: -0.15, flat: 0.25 });
    p.line(curve((t) => [5 + t * 18, 21 - t * 7 + Math.sin(t * 3) * 1.2], 12), '#e8e2da');
    p.px(10, 14, '#f0eae4'); p.px(11, 14, '#f0eae4');
  } },

  amethyst: { draw(p) {
    p.ellipse(16, 26, 13, 4.5, R.darkstone, { flat: 0.4 });
    crystal(p, 8, 26, -2.2, 12, 2.6, R.amethyst);
    crystal(p, 24, 26, -0.95, 13, 2.8, R.amethyst);
    crystal(p, 12, 25, -1.85, 17, 3.2, R.amethyst);
    crystal(p, 19, 25, -1.3, 19, 3.4, R.amethyst);
    p.glint(15, 9);
  } },

  goldNugget: { draw(p) {
    p.circle(10, 19, 6.5, R.gold, { spec: true });
    p.circle(22, 20, 6, R.gold, { spec: true });
    p.poly([[6, 14], [12, 8], [20, 8], [26, 13], [27, 20], [22, 26], [12, 26], [5, 21]], R.gold, { shade: 'round', spec: true, edge: false });
    p.line([[14, 15], [17, 13]], -1); p.line([[19, 20], [21, 22]], -1); p.line([[9, 21], [11, 22]], -1);
    p.glint(12, 11, 1); p.px(23, 15, '#fffde0');
  } },

  aquamarine: { draw(p) {
    crystal(p, 11, 28, -1.2, 25, 4.2, R.aqua);
    crystal(p, 21, 29, -1.75, 20, 3.6, R.aqua);
    p.glint(14, 9);
  } },

  abyssCrystal: { draw(p) {
    p.poly([[2, 60], [6, 52], [16, 49], [27, 52], [30, 60], [16, 62]], R.darkstone, { bevel: 2 });
    crystal(p, 9, 56, -2.0, 18, 3.2, R.abyss, { emit: true });
    crystal(p, 24, 56, -1.1, 22, 3.4, R.abyss, { emit: true });
    crystal(p, 16, 55, -1.57, 50, 6, R.abyss, { emit: true });
    for (const [x, y] of [[13, 20], [19, 34], [12, 42]] as V2[]) p.px(x, y, '#e0ffff');
    p.glint(14, 10, 2, '#ffffff', '#9ff4ff');
  } },

  sharkTooth: { draw(p) {
    const edge: V2[] = [[16, 3]];
    for (let i = 1; i <= 8; i++) edge.push([16 + i * 1.3 + (i % 2) * 0.9, 3 + i * 2.6]);
    const right: V2[] = edge; const left: V2[] = edge.map(([x, y]) => [32 - x, y] as V2).reverse();
    p.poly([...right, [26, 27], [22, 29], [16, 27], [10, 29], [6, 27], ...left.slice(0, -1)], R.ivory, { shade: 'round' });
    p.poly([[6, 25], [26, 25], [26, 27], [22, 29], [16, 27], [10, 29], [6, 27]], R.bone, { shade: 'facet', tone: 2 });
    p.line([[14, 8], [11, 21]], '#ffffff');
  } },

  driftwood: { draw(p) {
    const main = bez3([4, 22], [20, 16], [42, 20], [60, 10], 24);
    p.stroke(main, (t) => 5.2 - t * 2.2, R.drift);
    p.stroke(bez([30, 18], [36, 26], [44, 28], 10), (t) => 2.4 - t * 1.2, R.drift);
    p.stroke(bez([46, 14], [48, 8], [54, 5], 8), (t) => 1.8 - t * 0.8, R.drift);
    p.ellipse(4, 22, 2.2, 4.6, R.drift, { rot: -0.3, shade: 'facet', tone: 4 });
    p.line(main.slice(3, 20).map(([x, y]) => [x, y - 1.6] as V2), -1);
    p.line(main.slice(6, 22).map(([x, y]) => [x, y + 2] as V2), -1);
    p.ellipse(22, 18.5, 1.6, 1.1, R.drift, { shade: 'facet', tone: 1, edge: false });
    p.px(4, 21, '#6a6056');
  } },

  glassLens: { draw(p) {
    p.stroke(bez([26, 22], [29, 26], [31, 30], 8), 1.1, R.brass);
    p.circle(15, 15, 11, R.brass, { spec: true });
    p.circle(15, 15, 8.4, R.glass, { shade: 'flat', bevel: 1 });
    p.shadeWhere((x, y) => Math.abs(x - y + 2) < 2.2, 2);
    p.line([[11, 10], [15, 16], [13, 21]], '#ffffff'); p.line([[15, 16], [20, 17]], '#e0ffff');
    p.px(23, 8, '#fffbe0');
  } },

  urchinSpine: { draw(p) {
    // a bouquet of long violet spines tied with twine
    for (const a of [-2.75, -2.45, -2.15, -1.85, -1.57, -1.3, -1.0, -0.7, -0.4]) {
      const x0 = 16 + Math.cos(a) * 3, y0 = 24 + Math.sin(a) * 2;
      p.stroke([[x0, y0], [16 + Math.cos(a) * 15, 24 + Math.sin(a) * 21]], (t) => 1.5 - t * 1.0, R.purple);
    }
    p.stroke([[16, 23], [16, 30]], 3.2, R.purple);
    p.rect(11.5, 22, 9, 3, R.rope, { r: 1 });
    p.stroke(bez([13, 24], [9, 28], [8, 31], 6), 0.7, R.rope);
    for (const a of [-2.45, -1.57, -0.7]) p.px(16 + Math.cos(a) * 14, 24 + Math.sin(a) * 19.5, '#f4c8ee');
  } },

  scrap: { draw(p) {
    // bent boat plating: a dented sheet, a rusty bracket, bolts and a spring
    p.poly([[4, 10], [26, 4], [40, 9], [36, 24], [10, 28], [3, 20]], R.iron, { bevel: 2 });
    p.shadeWhere((x, y) => y > 6 + x * 0.12 && y < 10 + x * 0.12 && x < 38, -1);
    p.poly([[30, 14], [52, 8], [60, 16], [58, 27], [36, 29]], R.steel, { bevel: 2 });
    p.poly([[44, 6], [52, 4], [56, 8], [48, 12]], R.rust, { bevel: 1 });
    for (const [x, y, r] of [[14, 12, 3], [22, 22, 2.6], [50, 22, 3], [9, 22, 2]] as [number, number, number][]) p.circle(x, y, r, R.rust, { clip: true, edge: false });
    for (const [x, y] of [[9, 13], [33, 10], [40, 25], [55, 15]] as V2[]) { p.circle(x, y, 1.6, R.brass, { spec: true }); }
    p.stroke(curve((t) => [18 + t * 12, 30 - Math.abs(Math.sin(t * Math.PI * 4)) * 3.2], 30), 0.8, R.steel);
  } },

  seashell: { draw(p) {
    // a cockle: a fan with radiating ribs and hinge ears
    const fan = curve((t) => { const a = Math.PI * (1.08 + t * 0.84); return [16 + Math.cos(a) * 13, 24 + Math.sin(a) * 18]; }, 30);
    p.poly([[11, 27], ...fan, [21, 27], [16, 29]], R.shell, { shade: 'round', r: 10 });
    p.poly([[9, 25], [12, 23], [13, 28], [10, 29]], R.shell, { tone: 2, shade: 'facet' });
    p.poly([[23, 25], [20, 23], [19, 28], [22, 29]], R.shell, { tone: 2, shade: 'facet' });
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1.16 + (i / 6) * 0.68); p.line([[16 + Math.cos(a) * 3, 25 + Math.sin(a) * 4], [16 + Math.cos(a) * 12, 24 + Math.sin(a) * 16.5]], -1); }
    p.px(10, 11, '#fff6ee'); p.px(11, 10, '#fff6ee');
  } },

  // ================================================================ tools
  scissors: { draw(p) {
    p.ring(10, 9.5, 5.6, 3.6, R.rubber);
    p.ring(11, 22.5, 5.6, 3.6, R.rubber);
    p.poly([[15, 12], [24, 14], [61, 7], [62, 9], [26, 18], [16, 15]], R.steel, { bevel: 1.5 });
    p.poly([[16, 20], [26, 15], [62, 24], [61, 26], [24, 19], [15, 22]], R.steel, { bevel: 1.5 });
    p.line([[28, 15], [60, 8]], '#ffffff');
    for (const [x, y, r] of [[40, 13, 2.2], [48, 21, 2], [34, 17, 1.6]] as [number, number, number][]) p.circle(x, y, r, R.rust, { clip: true, edge: false });
    p.circle(25, 16.5, 2.2, R.brass, { spec: true });
    p.px(7, 6, '#ffb090');
  } },

  whetstone: { draw(p) {
    // a two-grit stone: coarse grey half, fine tan half, on a little wooden tray
    p.rect(3, 18, 58, 10, R.darkwood, { r: 2 });
    p.poly([[6, 12], [58, 12], [58, 22], [6, 22]], R.stone, { bevel: 2 });
    p.poly([[32, 12], [58, 12], [58, 22], [32, 22]], R.sand, { bevel: 2 });
    p.line([[7, 13], [56, 13]], 1);
    p.line([[32, 12], [32, 21]], -1);
    for (const [x, y] of [[10, 16], [15, 18], [20, 15], [25, 18], [13, 20], [27, 15]] as V2[]) p.setTone(x, y, 2);
    p.line([[36, 14], [50, 14]], '#fff6e0');
  } },

  leadSinker: { draw(p) {
    p.ring(16, 6, 3.2, 1.8, R.brass);
    p.poly(curve((t) => { const a = t * Math.PI * 2; const r = 1 - 0.55 * Math.max(0, -Math.sin(a)); return [16 + Math.cos(a) * 9 * r, 19 + Math.sin(a) * 10 * (Math.sin(a) < 0 ? 1 : 0.85)]; }, 40), R.lead, { shade: 'round', spec: true });
    p.line([[16, 10], [16, 27]], -1);
    p.px(12, 15, '#e8eef6'); p.px(12, 16, '#c0c8d4');
  } },

  corkBobber: { draw(p) {
    p.stroke([[16, 2], [16, 16]], 1.1, R.wood);
    p.stroke([[16, 48], [16, 60]], 1.1, R.wood);
    p.ring(16, 61, 1.6, 1.2, R.steel);
    p.ellipse(16, 32, 10, 17, R.white, { spec: true });
    p.ellipse(16, 32, 10, 17, R.red, { clip: true, edge: false, light: [-0.6, -0.8] });
    p.shadeWhere((x, y) => y > 33, -9);
    p.ellipse(16, 40.5, 10.4, 8.7, R.white, { clip: true });
    p.rect(5, 31, 22, 2.4, R.black, { clip: true, edge: false, tone: 3, shade: 'facet' });
    p.glint(11, 23, 1);
  } },

  luckyLure: { draw(p) {
    // a gold crankbait: fish body, clear diving lip, big eye, two trebles
    const body = curve((t) => { const a = t * Math.PI * 2; return [30 + Math.cos(a) * 22, 14 + Math.sin(a) * (Math.cos(a) > 0 ? 7.5 : 6.5)]; }, 40);
    p.poly([[52, 14], [62, 6], [60, 14], [62, 22]], R.red, { shade: 'facet', tone: 3 });
    p.poly(body, R.gold, { shade: 'round', spec: true });
    p.poly([[8, 15], [2, 21], [4, 23], [11, 18]], R.glass, { shade: 'facet', tone: 4 });
    p.circle(15, 12, 3, R.white, { spec: true });
    p.circle(15.5, 12, 1.6, R.black, { shade: 'facet', tone: 1 });
    for (let x = 22; x < 48; x += 5) p.line([[x, 10], [x + 2, 12], [x, 14]], -1);
    p.line([[14, 18], [48, 18]], -1);
    for (const hx of [24, 42]) {
      p.stroke([[hx, 21], [hx, 25]], 0.7, R.steel);
      p.stroke(curve((t) => { const a = Math.PI * t; return [hx - 3 + Math.cos(a) * -3, 27 + Math.sin(a) * 3]; }, 8), 0.7, R.steel);
      p.stroke(curve((t) => { const a = Math.PI * t; return [hx + 3 + Math.cos(a) * 3, 27 + Math.sin(a) * 3]; }, 8), 0.7, R.steel);
    }
    p.glint(24, 9, 1);
  } },

  reelGear: { draw(p) {
    const n = 10, pts: V2[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      for (const [da, r] of [[0, 10.4], [0.12, 13.4], [0.5, 13.4], [0.62, 10.4]] as [number, number][]) { const a = a0 + da * (Math.PI * 2 / n); pts.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r]); }
    }
    p.poly(pts, R.brass, { shade: 'flat', bevel: 2 });
    p.ring(16, 16, 7.6, 1.4, R.brass, { shade: 'facet', tone: 2, edge: false });
    p.circle(16, 16, 4.6, R.brass, { spec: true });
    p.circle(16, 16, 1.8, R.black, { shade: 'facet', tone: 1 });
    p.glint(9, 8);
  } },

  grappleHook: { draw(p) {
    // a big three-pronged grapple bottom left; its rope coils up to the top right
    p.ring(49, 13, 10, 2.6, R.rope, { ry: 7, a0: 0.4, a1: 5.9 });
    p.ring(48, 15, 7, 2.4, R.rope, { ry: 5, a0: 3.4, a1: 8.8 });
    p.stroke(bez3([40, 18], [36, 20], [42, 24], [38, 27], 10), 1.4, R.rope);
    p.stroke([[37, 28], [22, 44]], 3.2, R.steel);
    p.ring(38.5, 26.5, 3.4, 2, R.steel);
    const c: V2 = [21, 45];
    for (const [ang, bend] of [[3.3, 1], [2.36, 1], [1.42, -1]] as [number, number][]) {
      const d: V2 = [Math.cos(ang), Math.sin(ang)];
      const mid: V2 = [c[0] + d[0] * 17, c[1] + d[1] * 17];
      const back = ang - bend * 2.3;
      const tip: V2 = [mid[0] + Math.cos(back) * 11, mid[1] + Math.sin(back) * 11];
      p.stroke([c, mid], 3, R.steel);
      p.stroke(bez(mid, [mid[0] + d[0] * 4, mid[1] + d[1] * 4], tip, 10), (t) => 3 - t * 2.4, R.steel);
    }
    p.circle(21, 45, 4.8, R.steel, { spec: true });
    p.px(31, 34, '#ffffff'); p.px(32, 33, '#ffffff');
  } },

  netShard: { draw(p) {
    // a torn piece of trawl net over the L, knotted, with an orange float
    const clipPoly: V2[] = [[3, 4], [40, 2], [62, 6], [60, 28], [40, 30], [30, 34], [28, 60], [6, 62], [2, 36]];
    const inL = (x: number, y: number) => (x < 32 || y < 32);
    for (let k = -64; k < 80; k += 9) {
      const a: V2 = [k, 0], b: V2 = [k + 64, 64];
      const c2: V2 = [k + 64, 0], d: V2 = [k, 64];
      p.stroke([a, b], 0.95, R.rope, { edge: false });
      p.stroke([c2, d], 0.95, R.rope, { edge: false });
    }
    p.erase((x, y) => !inL(x, y) || !inPolyD(clipPoly, x, y));
    for (let gx = -64; gx < 128; gx += 9) for (let gy = 0; gy < 64; gy += 9) {
      const x = gx + gy * 0, y = gy;
      void x; void y;
    }
    p.ellipse(50, 16, 7, 5, R.orange, { spec: true });
    p.rect(42, 15, 16, 2, R.white, { clip: true, edge: false, shade: 'facet', tone: 4 });
    p.glint(47, 13);
  } },

  tackleBox: { draw(p) {
    p.stroke([[38, 10], [38, 6], [58, 6], [58, 10]], 1.6, R.black);
    p.rect(4, 12, 88, 14, R.green, { r: 2 });
    p.rect(4, 26, 88, 34, R.green, { r: 2 });
    p.line([[6, 26], [90, 26]], -2);
    p.line([[6, 14], [90, 14]], 1);
    for (const x of [14, 82]) { p.rect(x - 4, 22, 8, 9, R.steel, { r: 1 }); p.px(x, 25, '#ffffff'); }
    p.rect(44, 22, 8, 7, R.brass, { r: 1 });
    p.px(48, 25, '#3a1404');
    // a sticker: a little white fish on a blue tag
    p.rect(60, 38, 24, 14, R.white, { r: 1 });
    p.poly([[64, 45], [70, 41], [77, 45], [70, 49]], R.blue, { shade: 'facet', tone: 3 });
    p.poly([[77, 45], [81, 42], [81, 48]], R.blue, { shade: 'facet', tone: 3 });
    p.px(67, 44, '#ffffff');
    for (const [x, y] of [[20, 44], [30, 50], [12, 52]] as V2[]) p.line([[x, y], [x + 5, y - 2]], 1);
    p.line([[8, 30], [8, 54]], 1);
  } },

  rodTip: { draw(p) {
    p.stroke([[16, 2], [16, 90]], (t) => 1.0 + t * 1.6, R.carbon);
    for (const [y, r] of [[8, 2], [26, 2.4], [46, 2.8], [66, 3.2]] as [number, number][]) {
      p.rect(14, y - 1.5, 4.2, 3, R.red, { shade: 'facet', tone: 3, edge: false });
      p.ring(16 + r + 2.4, y, r, 1.1, R.steel);
    }
    p.ring(16, 2.6, 1.8, 1, R.steel);
    // the snapped end: splinters
    p.poly([[13, 88], [19, 88], [20, 94], [17, 91], [16, 95], [14, 91], [12, 94]], R.carbon, { shade: 'facet', tone: 3 });
    p.line([[15, 10], [15, 86]], '#8a94b0');
  } },

  pliers: { draw(p) {
    p.poly([[3, 7], [22, 12], [24, 15], [4, 13]], R.red, { shade: 'round' });
    p.poly([[3, 25], [22, 20], [24, 17], [4, 19]], R.red, { shade: 'round' });
    p.poly([[22, 11], [30, 14], [62, 15], [62, 16], [30, 17], [22, 21], [21, 16]], R.steel, { bevel: 1.5 });
    p.line([[30, 16], [61, 16]], -2);
    p.circle(25, 16, 2.6, R.steel, { spec: true });
    p.line([[6, 9], [18, 12]], '#ffb090');
    p.line([[32, 14], [58, 15]], '#ffffff');
  } },

  spinnerSpoon: { draw(p) {
    p.stroke([[16, 2], [16, 22]], 0.6, R.steel);
    p.ring(16, 2.5, 1.6, 0.9, R.steel);
    p.ellipse(11, 14, 6, 10, R.silver, { rot: 0.35, spec: true });
    p.ellipse(11, 14, 3.6, 7, R.silver, { rot: 0.35, shade: 'facet', tone: 4, edge: false });
    p.circle(16, 21, 2, R.red, { spec: true });
    p.circle(16, 24.5, 1.6, R.yellow, { spec: true });
    p.stroke([[16, 26], [16, 28]], 0.6, R.steel);
    for (const sx of [-1, 1]) p.stroke(curve((t) => { const a = Math.PI * t; return [16 + sx * (2.4 - Math.cos(a) * 2.4), 28 + Math.sin(a) * 2.8]; }, 8), 0.7, R.steel);
    p.glint(9, 9);
  } },

  harpoonTip: { draw(p) {
    p.stroke([[16, 63], [16, 30]], 3.6, R.darkwood);
    for (let y = 30; y < 40; y += 2) p.stroke([[11.5, y], [20.5, y + 1]], 1, R.rope, { edge: false });
    p.stroke([[16, 30], [16, 14]], 2, R.iron);
    p.poly([[16, 1], [22, 13], [16, 11], [10, 13]], R.iron, { bevel: 1.5 });
    p.poly([[10, 13], [16, 11], [8, 21]], R.iron, { shade: 'facet', tone: 2 });
    p.poly([[22, 13], [16, 11], [24, 21]], R.iron, { shade: 'facet', tone: 3 });
    p.line([[15, 3], [12, 11]], '#eef4fc');
    p.ellipse(16, 62, 4, 2, R.darkwood, { shade: 'facet', tone: 2 });
  } },

  lineSpool: { draw(p) {
    p.ellipse(8, 16, 4.5, 13, R.darkwood, { shade: 'round' });
    p.rect(8, 6, 16, 20, R.mono, { shade: 'round', r: 0 });
    for (let x = 9; x < 24; x += 2) p.line([[x, 6.5], [x + 1, 25.5]], -1);
    p.ellipse(24, 16, 4.5, 13, R.darkwood, { shade: 'round' });
    p.ellipse(24, 16, 2, 2.4, R.black, { shade: 'facet', tone: 1 });
    p.stroke(bez3([20, 25], [26, 30], [30, 26], [30, 30], 10), 0.7, R.mono);
    p.line([[10, 8], [22, 8]], '#ffffff');
  } },

  // ================================================================ trinkets
  bottleCap: { draw(p) {
    p.poly(starPts(16, 16, 13.4, 11.6, 21), R.red, { shade: 'round', r: 6, flat: 0.3, spec: true });
    p.ring(16, 16, 9, 1.2, R.red, { shade: 'facet', tone: 2, edge: false });
    p.circle(16, 16, 8.2, R.red, { shade: 'round', flat: 0.6, lift: 0.1, edge: false });
    p.star(16, 16, 5.2, 2.2, 5, R.yellow, { spec: true });
    p.glint(9, 9);
  } },

  rubberDuck: { draw(p) {
    p.ellipse(17, 21, 12.5, 8, R.duck);
    p.poly([[25, 17], [30, 10], [30, 16]], R.duck, { shade: 'round' });
    p.circle(11, 11, 7, R.duck, { spec: true });
    p.poly([[3, 12], [6, 10], [7, 15], [3, 15]], R.orange, { shade: 'round' });
    p.line([[4, 13], [6, 13]], -1);
    p.circle(11, 9.5, 1.3, R.black, { shade: 'facet', tone: 1 });
    p.px(10, 8, '#ffffff');
    p.stroke(bez([13, 21], [18, 17], [23, 20], 8), 1.1, R.duck, { shade: 'facet', tone: 2, edge: false });
    p.glint(8, 7);
  } },

  bottleMessage: { draw(p) {
    p.rect(4, 7, 40, 19, R.seaglass, { r: 7 });
    p.poly([[42, 11], [50, 13], [50, 20], [42, 22]], R.seaglass, { bevel: 1.5 });
    p.rect(50, 12, 4, 9, R.seaglass, { r: 1 });
    p.rect(54, 13, 7, 7, R.cork, { r: 1.5 });
    // the scroll inside
    p.rect(11, 12, 27, 9, R.paper, { r: 2 });
    p.ellipse(11, 16.5, 2, 4.5, R.paper, { shade: 'facet', tone: 2 });
    p.line([[15, 15], [33, 15]], -2); p.line([[15, 18], [30, 18]], -2);
    p.stroke([[24, 12], [24, 21]], 0.7, R.red, { edge: false });
    p.line([[8, 9], [40, 9]], '#f0fff8'); p.line([[7, 10], [7, 13]], '#c8fff0');
  } },

  sharkNecklace: { draw(p) {
    p.stroke(curve((t) => [3 + t * 58, 5 + Math.sin(t * Math.PI) * 14], 30), 0.9, R.rope);
    for (const t of [0.12, 0.24, 0.36, 0.64, 0.76, 0.88]) { const x = 3 + t * 58, y = 5 + Math.sin(t * Math.PI) * 14; p.circle(x, y, 2, t > 0.5 ? R.aqua : R.coral, { spec: true }); }
    p.poly([[25, 18], [39, 18], [36, 23], [32, 31], [28, 23]], R.ivory, { shade: 'round' });
    p.rect(26, 16, 12, 3.4, R.bone, { r: 1, shade: 'facet', tone: 2 });
    p.line([[29, 20], [31, 27]], '#ffffff');
    for (const y of [21, 24, 27]) { p.setTone(34.5 - (y - 21) * 0.4, y, 2); }
  } },

  anglerLantern: { draw(p) {
    p.stroke(bez3([6, 62], [4, 30], [14, 6], [24, 14], 26), (t) => 2.6 - t * 1.4, R.flesh);
    for (const a of [0, 1.05, 2.1, 3.15, 4.2, 5.25]) p.line([[23 + Math.cos(a) * 8, 26 + Math.sin(a) * 8], [23 + Math.cos(a) * 11, 26 + Math.sin(a) * 11]], '#d8f0a0', { add: true });
    p.stroke([[24, 14], [23, 19]], 1.1, R.flesh);
    p.circle(23, 26, 7, R.lantern, { spec: true, emit: true, lift: 0.15 });
    p.circle(21, 24, 2.6, R.lantern, { shade: 'facet', tone: 5, edge: false, emit: true });
    for (const [x, y] of [[20, 33], [23, 34], [26, 33]] as V2[]) p.stroke([[x, y], [x, y + 3]], 0.6, R.lantern, { emit: true });
  } },

  mermaidScale: { draw(p) {
    // a big iridescent scale: round top, pointed bottom, ridges parallel to the top edge
    const sh: V2[] = [...curve((t) => { const a = Math.PI * (1 + t); return [16 + Math.cos(a) * 13, 14 + Math.sin(a) * 11]; }, 20), [29, 16], [16, 30], [3, 16]];
    p.poly(sh, R.aqua, { shade: 'round', spec: true, r: 9 });
    p.ellipse(16, 27, 14, 9, R.pink, { clip: true, edge: false, flat: 0.2 });
    p.ellipse(16, 6, 10, 5, R.mana, { clip: true, edge: false, lift: 0.25, flat: 0.3 });
    for (const k of [4.5, 8.5]) p.line(curve((t) => { const a = Math.PI * (1.1 + t * 0.8); return [16 + Math.cos(a) * (13 - k), 15 + Math.sin(a) * (11 - k * 0.8) + k * 0.4]; }, 14), -1);
    p.glint(10, 7, 1);
  } },

  starfish: { draw(p) {
    p.poly(starPts(16, 17, 14.5, 6.2, 5).map(([x, y]) => [x, y] as V2), R.orange, { shade: 'round', r: 6 });
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      for (const d of [4, 7, 10]) p.px(16 + Math.cos(a) * d, 17 + Math.sin(a) * d, '#ffe0a0');
    }
    p.circle(16, 17, 2, R.orange, { shade: 'facet', tone: 4, edge: false });
  } },

  crabClaw: { draw(p) {
    p.stroke(bez([4, 29], [8, 24], [12, 22], 8), 3.2, R.red);
    p.poly([[10, 25], [8, 16], [12, 9], [20, 5], [28, 6], [24, 10], [17, 13], [17, 18], [22, 22], [15, 27]], R.red, { shade: 'round', spec: true });
    p.poly([[17, 15], [24, 12], [29, 13], [27, 16], [21, 19]], R.red, { shade: 'round', spec: true });
    for (const [x, y] of [[20, 11], [23, 9], [21, 15], [24, 14]] as V2[]) p.px(x, y, '#fff0dc');
    p.glint(12, 13);
  } },

  oldBoot: { draw(p) {
    // a cracked leather boot: shaft up the left column, foot along the bottom right
    p.poly([[6, 4], [28, 4], [29, 40], [52, 42], [61, 50], [61, 60], [6, 60]], R.leather, { bevel: 3 });
    p.rect(4, 56, 58, 6, R.black, { r: 2 });
    p.rect(5, 2, 25, 6, R.leather, { r: 2, shade: 'facet', tone: 4 });
    for (let y = 12; y < 40; y += 6) { p.line([[10, y], [24, y + 2]], '#e8dcc0'); p.line([[10, y + 2], [24, y]], '#c8b8a0'); }
    p.poly([[36, 46], [44, 45], [46, 52], [38, 53]], R.cloth, { bevel: 1 });
    p.line([[37, 47], [44, 51]], -1);
    p.line([[8, 44], [12, 50], [10, 54]], -2);
    // a tiny fish peeking from the top
    p.ellipse(18, 3, 5, 2.6, R.blue, { spec: true });
    p.poly([[22, 3], [26, 0], [26, 6]], R.blue, { shade: 'facet', tone: 3 });
    p.px(15, 2, '#ffffff');
  } },

  spiralShell: { draw(p) {
    // a snail-type spiral: a round whorl with the spiral groove, the pink mouth bottom left
    p.circle(18, 14, 12, R.shell, { spec: true });
    p.ellipse(9, 24, 7, 5.4, R.shell, { rot: -0.5 });
    p.ellipse(8.5, 24.5, 4.4, 3, R.pink, { rot: -0.5, shade: 'round' });
    p.ellipse(8, 25, 2.2, 1.4, R.pink, { rot: -0.5, shade: 'facet', tone: 1, edge: false });
    p.line(curve((t) => { const a = t * Math.PI * 3.4 + 0.6; const r = 1 + t * 10.2; return [18 + Math.cos(a) * r, 14 + Math.sin(a) * r]; }, 60), -2);
    for (const [x, y] of [[13, 7], [12, 8], [21, 11]] as V2[]) p.px(x, y, '#fff6ee');
  } },

  teacup: { draw(p) {
    p.ellipse(16, 26, 14, 4, R.white, { flat: 0.4 });
    p.ring(26, 16, 3.6, 2, R.white);
    p.poly([[4, 10], [28, 10], [26, 21], [21, 25], [11, 25], [6, 21]], R.white, { shade: 'round', r: 10 });
    p.ellipse(16, 10, 12, 3, R.white, { shade: 'facet', tone: 4 });
    p.ellipse(16, 10.5, 10, 2, R.tea, { shade: 'facet', tone: 3, edge: false });
    p.rect(5, 15, 22, 3, R.blue, { clip: true, edge: false, shade: 'facet', tone: 3 });
    for (let x = 7; x < 26; x += 4) p.px(x, 16, '#e0f4ff');
    // the chip
    p.erase((x, y) => x > 18 && x < 23 && y < 12 - (x - 18) * 0.2);
    p.line([[7, 13], [9, 20]], '#ffffff');
  } },

  cutpursePouch: { draw(p) {
    p.ellipse(16, 21, 11.5, 9.5, R.leather, { spec: false });
    p.poly([[9, 13], [23, 13], [26, 6], [21, 9], [16, 5], [11, 9], [6, 6]], R.leather, { shade: 'round' });
    p.rect(9, 12, 14, 3, R.rope, { r: 1, shade: 'round' });
    p.stroke(bez3([22, 13], [28, 14], [27, 20], [29, 23], 10), 0.8, R.rope);
    p.circle(12, 6, 2.6, R.gold, { spec: true }); p.circle(18, 5, 2.4, R.gold, { spec: true });
    p.line([[10, 19], [12, 26]], -1); p.line([[21, 18], [20, 26]], -1);
    p.px(9, 17, '#efc48e'); p.px(10, 17, '#efc48e');
  } },

  boneDice: { draw(p) {
    const die = (x: number, y: number, s: number, pips: V2[][]) => {
      const top: V2[] = [[x, y], [x + s, y - s * 0.5], [x + s * 2, y], [x + s, y + s * 0.5]];
      const left: V2[] = [[x, y], [x + s, y + s * 0.5], [x + s, y + s * 1.6], [x, y + s * 1.1]];
      const right: V2[] = [[x + s, y + s * 0.5], [x + s * 2, y], [x + s * 2, y + s * 1.1], [x + s, y + s * 1.6]];
      p.poly(top, R.bone, { shade: 'facet', tone: 4 });
      p.poly(left, R.bone, { shade: 'facet', tone: 3, edge: false });
      p.poly(right, R.bone, { shade: 'facet', tone: 2, edge: false });
      for (const face of pips) for (const [px, py] of face) p.px(px, py, '#2a1a10');
    };
    die(2, 12, 7, [[[9, 12]], [[5, 17], [6, 21]], [[12, 16], [14, 15], [13, 20], [15, 19]]]);
    die(14, 18, 7, [[[19, 18], [23, 17]], [[17, 23], [19, 25], [18, 27]], [[24, 23], [26, 22], [25, 25], [24, 28], [26, 27]]]);
  } },

  clockworkHeart: { draw(p) {
    const heart = curve((t) => { const a = t * Math.PI * 2; const x = 16 * Math.sin(a) ** 3; const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); return [30 + x * 1.6, 34 + y * 1.6]; }, 64);
    p.poly(heart, R.brass, { shade: 'round', r: 12, spec: true });
    p.circle(30, 34, 9, R.red, { shade: 'round', spec: true, emit: true });
    p.ring(30, 34, 9.5, 2, R.brass, { shade: 'facet', tone: 4 });
    // a cog on the top right lobe, the wind-up key on top
    const n = 8, gp: V2[] = [];
    for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2; for (const [da, r] of [[0, 6], [0.15, 8], [0.5, 8], [0.65, 6]] as [number, number][]) { const a = a0 + da * (Math.PI * 2 / n); gp.push([47 + Math.cos(a) * r, 20 + Math.sin(a) * r]); } }
    p.poly(gp, R.steel, { bevel: 1.5 });
    p.circle(47, 20, 2.2, R.black, { shade: 'facet', tone: 2 });
    p.stroke([[22, 14], [22, 6]], 1.4, R.brass);
    p.ellipse(18, 4, 4, 2.6, R.brass, { spec: true }); p.ellipse(26, 4, 4, 2.6, R.brass, { spec: true });
    for (const [x, y] of [[14, 30], [44, 34], [30, 52], [20, 44], [40, 44]] as V2[]) p.px(x, y, '#fffbe0');
    p.glint(14, 20);
  } },

  warConch: { draw(p) {
    // a conch: knobbed body, the spire to the right ending in a brass mouthpiece, the pink flared lip bottom left
    p.poly([[4, 22], [8, 12], [18, 6], [30, 6], [44, 9], [56, 13], [60, 16], [52, 20], [38, 25], [24, 29], [12, 29]], R.shell, { shade: 'round', r: 9, spec: true });
    for (const [x, y] of [[16, 6], [24, 4], [32, 5], [40, 7]] as V2[]) p.poly([[x - 3, y + 3], [x, y - 3], [x + 3, y + 3]], R.shell, { shade: 'facet', tone: 4 });
    p.poly([[3, 23], [8, 15], [16, 18], [20, 28], [10, 30]], R.pink, { shade: 'round' });
    p.poly([[8, 19], [14, 20], [16, 27], [10, 27]], R.pink, { shade: 'facet', tone: 1, edge: false });
    for (const x of [44, 50, 55]) p.line([[x, 10], [x - 2, 20]], -1);
    p.rect(58, 13, 5, 6, R.brass, { r: 1.5 });
    p.stroke(bez([22, 28], [40, 32], [56, 20], 12), 0.8, R.leather);
    p.line([[20, 9], [30, 9]], '#fff6ee');
  } },

  manaGeode: { draw(p) {
    p.circle(32, 33, 28, R.stone, { flat: 0.3 });
    p.circle(32, 33, 21, R.amethyst, { shade: 'facet', tone: 1, edge: false });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const bx = 32 + Math.cos(a) * 20, by = 33 + Math.sin(a) * 20;
      crystal(p, bx, by, a + Math.PI, 9 + (i % 3) * 2.5, 2.4, R.mana, { emit: true });
    }
    p.circle(32, 33, 6, R.mana, { spec: true, emit: true, lift: 0.3 });
    p.ring(32, 33, 25, 1.4, R.stone, { shade: 'facet', tone: 4, edge: false, a0: 3.4, a1: 4.6 });
    for (const [x, y] of [[12, 20], [52, 46], [16, 50], [50, 14]] as V2[]) p.setTone(x, y, 2);
    p.glint(30, 30, 2, '#ffffff', '#b8e2ff');
  } },

  // ================================================================ abilities
  laserLens: { draw(p) {
    // a laser pointer pen pointing up, the red lens glowing
    for (let y = 2; y < 12; y += 3) p.line([[16, 11 - y * 0.0], [16, 11 - y]], '#ff6a5a', { add: true });
    p.rect(11, 12, 10, 48, R.steel, { r: 3 });
    p.rect(11, 12, 10, 6, R.black, { r: 2 });
    p.circle(16, 12, 3.6, R.red, { spec: true, emit: true, lift: 0.2 });
    p.rect(21, 20, 3, 18, R.silver, { r: 1 });
    p.rect(13.5, 30, 5, 6, R.red, { r: 1.5 });
    p.rect(11, 50, 10, 10, R.black, { r: 2 });
    for (let y = 52; y < 59; y += 2) p.line([[12, y], [20, y]], 1);
    p.line([[13, 20], [13, 48]], '#ffffff');
    p.glint(16, 5, 2, '#ffffff', '#ff8a7a');
  } },

  bubbleWand: { draw(p) {
    p.stroke([[16, 62], [16, 26]], 1.8, R.pink);
    p.ring(16, 19, 7, 2.2, R.pink);
    p.ring(16, 19, 4.6, 1, R.glass, { shade: 'facet', tone: 4 });
    for (const [x, y, r] of [[25, 8, 4.2], [7, 7, 2.6], [26, 31, 2.2], [6, 33, 1.6]] as [number, number, number][]) {
      p.ring(x, y, r, 1, R.glass, { shade: 'facet', tone: 3 });
      p.px(x - r * 0.5, y - r * 0.5, '#ffffff');
    }
    p.line([[15, 30], [15, 60]], '#fff0f4');
  } },

  inkSac: { draw(p) {
    p.poly(curve((t) => { const a = t * Math.PI * 2; const r = 1 + 0.35 * Math.max(0, Math.sin(a)); return [16 + Math.sin(a) * 10.5 * r, 18 - Math.cos(a) * 11 * (Math.cos(a) > 0 ? 1.05 : 0.8)]; }, 40), R.ink, { shade: 'round', spec: true });
    p.stroke(bez([16, 7], [17, 3], [21, 3], 8), 1.6, R.flesh);
    p.ellipse(25, 27, 2.2, 2.8, R.ink, { spec: true });
    p.ellipse(28, 21, 1.4, 1.8, R.ink, { spec: true });
    p.px(11, 11, '#ffffff'); p.px(12, 11, '#e4d4ff'); p.px(11, 12, '#e4d4ff');
  } },

  eelBattery: { draw(p) {
    p.rect(4, 7, 50, 19, R.eel, { r: 3 });
    p.rect(54, 11, 5, 11, R.brass, { r: 1.5 });
    p.rect(2, 9, 4, 15, R.brass, { r: 1.5 });
    p.rect(4, 7, 9, 19, R.black, { clip: true, edge: false, shade: 'round' });
    p.poly([[30, 8], [24, 17], [29, 17], [25, 25], [35, 14], [30, 14], [34, 8]], R.yellow, { shade: 'facet', tone: 4 });
    for (let x = 16; x < 52; x += 6) { p.px(x, 21, '#d0f4a8'); p.px(x + 3, 23, '#6ccc7a'); }
    p.line([[14, 9], [52, 9]], '#d0f4a8');
    for (const [x, y] of [[60, 8], [62, 12], [61, 24]] as V2[]) p.glint(x, y, 1, '#ffffff', '#fff07a');
  } },

  pufferSpines: { draw(p) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      p.stroke([[16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9], [16 + Math.cos(a) * 14.5, 16 + Math.sin(a) * 14.5]], (t) => 1.4 - t * 1.0, R.yellow);
    }
    p.circle(16, 16, 10.5, R.yellow, { spec: true });
    p.ellipse(16, 21, 8, 4.5, R.cream, { clip: true, edge: false, flat: 0.4 });
    p.circle(11, 13, 2.6, R.white, { spec: true });
    p.circle(11.4, 13.4, 1.3, R.black, { shade: 'facet', tone: 1 });
    p.ellipse(7, 19, 1.6, 1.2, R.orange, { shade: 'facet', tone: 3 });
    p.poly([[20, 17], [26, 14], [25, 21]], R.orange, { shade: 'facet', tone: 3, edge: false });
    for (const [x, y] of [[18, 9], [22, 12], [19, 12], [14, 9]] as V2[]) p.px(x, y, '#8a4a08');
  } },

  lodestone: { draw(p) {
    p.poly([[4, 18], [8, 9], [17, 5], [26, 8], [29, 17], [25, 26], [14, 28], [6, 25]], R.carbon, { bevel: 2.5 });
    p.line([[9, 12], [16, 9], [22, 11]], 1);
    // stuck on: two nails and a coin, with tiny field arcs
    p.stroke([[22, 21], [30, 30]], 0.9, R.steel); p.ellipse(21.5, 20.5, 2.2, 1.2, R.steel, { rot: -2.36 });
    p.stroke([[7, 9], [1, 2]], 0.9, R.steel); p.ellipse(7.5, 9.5, 2.2, 1.2, R.steel, { rot: 0.78 });
    coin(p, 9, 24, 4.6, R.gold);
    for (const [x, y] of [[13, 13], [20, 17], [11, 19]] as V2[]) p.px(x, y, '#c8d0f0');
    p.line(curve((t) => [17 + Math.cos(-2.4 + t * 1.6) * 15, 14 + Math.sin(-2.4 + t * 1.6) * 13], 10), '#7ab8ff', { add: true });
  } },

  sailFin: { draw(p) {
    p.poly([[5, 60], [4, 30], [8, 8], [14, 2], [22, 10], [28, 26], [30, 46], [27, 60]], R.sail, { shade: 'round', r: 10 });
    for (const x of [8, 13, 18, 23]) p.line([[x - 2, 58], [x + (x - 14) * 0.2, 12 + Math.abs(x - 13) * 1.6]], -2);
    for (const [x, y] of [[10, 30], [17, 24], [21, 38], [12, 46], [24, 50], [15, 14]] as V2[]) { p.px(x, y, '#c0e4ff'); p.px(x + 1, y, '#64a0ec'); }
    p.rect(3, 57, 26, 5, R.flesh, { r: 2 });
  } },

  windUpMegalodon: { draw(p) {
    // a tin toy shark: riveted grey body, white belly, big teeth, a wind-up key, little wheels
    const body = curve((t) => { const a = t * Math.PI * 2; return [28 + Math.cos(a) * 22, 15 + Math.sin(a) * (Math.sin(a) > 0 ? 8 : 9)]; }, 40);
    p.poly([[48, 15], [61, 4], [58, 15], [61, 26]], R.steel, { shade: 'facet', tone: 3 });
    p.poly([[24, 7], [32, 0], [36, 8]], R.steel, { shade: 'facet', tone: 4 });
    p.poly(body, R.steel, { shade: 'round', spec: true });
    p.ellipse(24, 21, 18, 4.5, R.white, { clip: true, edge: false, flat: 0.5 });
    p.poly([[7, 16], [20, 18], [7, 21]], R.black, { shade: 'facet', tone: 1 });
    for (let x = 9; x < 20; x += 3) { p.px(x, 17, '#ffffff'); p.px(x + 1, 20, '#ffffff'); }
    p.circle(13, 11, 1.8, R.black, { shade: 'facet', tone: 1 }); p.px(12, 10, '#ffffff');
    p.line([[30, 7], [30, 23]], -1);
    for (const y of [10, 14, 18]) p.px(31, y, '#ffffff');
    for (const x of [20, 40]) { p.circle(x, 27.5, 2.6, R.black, { spec: true }); p.px(x, 27, '#8a90ac'); }
    p.stroke([[38, 6], [38, 2]], 1, R.brass);
    p.ellipse(34.5, 1.8, 3, 1.8, R.brass, { spec: true }); p.ellipse(41.5, 1.8, 3, 1.8, R.brass, { spec: true });
  } },

  piranhaJar: { draw(p) {
    p.rect(5, 14, 22, 46, R.glass, { r: 5 });
    p.rect(7, 22, 18, 36, R.blue, { clip: true, edge: false, r: 3, lift: 0.1 });
    p.rect(4, 8, 24, 7, R.brass, { r: 2 });
    for (let x = 6; x < 27; x += 3) p.line([[x, 9], [x, 13]], -1);
    // the piranha: grey back, red belly, white teeth
    p.ellipse(16, 40, 8.5, 6.5, R.steel, { spec: true });
    p.ellipse(16, 44, 7, 3, R.red, { clip: true, edge: false });
    p.poly([[23, 40], [27, 35], [27, 45]], R.steel, { shade: 'facet', tone: 3 });
    p.poly([[8, 41], [12, 41], [10, 43]], R.white, { shade: 'facet', tone: 5 });
    p.circle(11, 37, 1.4, R.yellow, { spec: true }); p.px(11, 37, '#000000');
    for (const [x, y] of [[20, 26], [9, 30], [22, 52]] as V2[]) p.ring(x, y, 1.2, 0.8, R.glass, { shade: 'facet', tone: 5, edge: false });
    p.line([[8, 18], [8, 54]], '#ffffff');
  } },

  petCrab: { draw(p) {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) p.stroke([[16 + sx * 7, 21 + i * 2], [16 + sx * 12, 24 + i * 2.2], [16 + sx * 14, 29]], 0.8, R.red);
      p.stroke(bez([16 + sx * 7, 17], [16 + sx * 12, 14], [16 + sx * 11, 9], 8), 1.4, R.red);
      p.poly([[16 + sx * 8, 10], [16 + sx * 13, 3], [16 + sx * 15, 8], [16 + sx * 12, 12]], R.red, { shade: 'round', spec: true });
      p.poly([[16 + sx * 11, 6], [16 + sx * 9, 3], [16 + sx * 11, 3]], R.red, { shade: 'facet', tone: 3 });
    }
    p.ellipse(16, 21, 9.5, 6.5, R.red, { spec: true });
    for (const sx of [-1, 1]) { p.stroke([[16 + sx * 3, 16], [16 + sx * 3.5, 12]], 0.7, R.red); p.circle(16 + sx * 3.5, 11.5, 1.6, R.white, { spec: true }); p.px(16 + sx * 3.5, 11.5, '#000000'); }
    p.line([[13, 24], [16, 25], [19, 24]], -2);
  } },

  octopusPal: { draw(p) {
    // a purple octopus: big head on the left, four fat arms curling out to the right, an ink puff
    const arm = (pts: V2[]) => { p.stroke(pts, (t) => 3.2 - t * 2.2, R.purple); for (let i = 2; i < pts.length - 2; i += 3) p.px(pts[i][0], pts[i][1] + 2, '#f4c8ee'); };
    arm(bez3([20, 22], [30, 30], [42, 30], [46, 22], 16));
    arm(bez3([18, 25], [24, 31], [32, 31], [34, 28], 12));
    arm(bez3([22, 18], [34, 20], [44, 14], [52, 18], 16));
    arm(bez3([12, 25], [10, 29], [14, 31], [18, 30], 8));
    p.ellipse(15, 13, 11.5, 10.5, R.purple, { spec: true });
    for (const [x, y] of [[9, 7], [19, 5], [7, 14]] as V2[]) p.px(x, y, '#f4c8ee');
    for (const sx of [11, 20]) { p.circle(sx, 15, 3, R.white, { spec: true }); p.circle(sx + 0.6, 15.6, 1.5, R.black, { shade: 'facet', tone: 1 }); }
    p.line([[13, 21], [16, 22], [19, 21]], -2);
    p.circle(57, 7, 4, R.ink, { spec: true }); p.circle(61, 13, 2.4, R.ink, { spec: true }); p.circle(52, 3, 1.8, R.ink, { spec: true });
  } },

  junkTurret: { draw(p) {
    // a sardine-can turret on stilts with a pipe barrel and a strapped car battery
    for (const [a, b] of [[[18, 40], [8, 60]], [[32, 42], [32, 61]], [[46, 40], [56, 60]]] as [V2, V2][]) p.stroke([a, b], 1.6, R.iron);
    p.rect(10, 26, 44, 18, R.silver, { r: 3 });
    p.rect(10, 26, 44, 4, R.red, { clip: true, edge: false, shade: 'facet', tone: 3 });
    p.poly([[18, 33], [26, 30], [34, 33], [26, 36]], R.blue, { shade: 'facet', tone: 3 });
    p.stroke([[36, 22], [60, 10]], 3.2, R.iron);
    p.ellipse(60, 10, 2.4, 3.4, R.iron, { rot: 1.1, shade: 'facet', tone: 1 });
    p.circle(34, 23, 6, R.steel, { spec: true });
    p.rect(4, 8, 22, 14, R.black, { r: 2 });
    p.rect(7, 5, 4, 4, R.red, { r: 1 }); p.rect(19, 5, 4, 4, R.lead, { r: 1 });
    p.stroke([[4, 15], [26, 15]], 0.8, R.rope, { edge: false });
    p.stroke(bez([9, 8], [12, 1], [30, 18], 10), 0.6, R.red);
    p.px(8, 6, '#ffffff'); p.glint(57, 6, 1, '#ffffff', '#ffd860');
  } },

  netTrap: { draw(p) {
    p.ellipse(32, 17, 26, 11, R.rope, { flat: 0.3 });
    for (let k = -30; k < 70; k += 6) p.line([[k, 4], [k + 14, 30]], -2);
    for (let k = -10; k < 90; k += 6) p.line([[k, 4], [k - 14, 30]], -1);
    for (const x of [8, 22, 42, 56]) p.circle(x, 27, 2.6, R.lead, { spec: true });
    for (const x of [14, 34, 50]) { p.ellipse(x, 7, 3.4, 2.6, R.orange, { spec: true }); }
    p.stroke(bez([56, 12], [62, 8], [60, 2], 6), 0.9, R.rope);
  } },

  harpoonBallista: { draw(p) {
    // a crossbow ballista across the top row, a harpoon bolt loaded, a post in the bottom-middle cell
    p.stroke([[48, 30], [48, 62]], 3, R.darkwood);
    p.stroke([[40, 62], [56, 62]], 2, R.darkwood);
    p.rect(16, 13, 64, 7, R.darkwood, { r: 2 });
    p.stroke(bez([22, 16], [14, 4], [4, 2], 10), (t) => 2.6 - t * 1.2, R.wood);
    p.stroke(bez([22, 17], [14, 28], [4, 30], 10), (t) => 2.6 - t * 1.2, R.wood);
    p.stroke([[4, 2], [30, 16], [4, 30]], 0.6, R.cream);
    p.stroke([[24, 16], [84, 16]], 1.3, R.steel);
    p.poly([[95, 16], [84, 10], [86, 16], [84, 22]], R.steel, { bevel: 1.5 });
    p.poly([[86, 13], [80, 8], [83, 13]], R.steel, { shade: 'facet', tone: 3 });
    p.poly([[86, 19], [80, 24], [83, 19]], R.steel, { shade: 'facet', tone: 2 });
    p.rect(42, 20, 12, 10, R.brass, { r: 2 });
    p.circle(48, 25, 2, R.iron, { spec: true });
    p.line([[18, 14], [78, 14]], '#f0c082');
  } },

  venomVial: { draw(p) {
    p.rect(12, 3, 8, 5, R.cork, { r: 1.5 });
    p.rect(13, 7, 6, 5, R.glass, { r: 1 });
    p.poly(curve((t) => { const a = t * Math.PI * 2; return [16 + Math.sin(a) * 9.5, 21 - Math.cos(a) * (Math.cos(a) > 0 ? 8 : 9)]; }, 32), R.glass, { shade: 'round' });
    p.ellipse(16, 23.5, 8, 6, R.venom, { clip: true, edge: false, emit: true, lift: 0.1 });
    p.rect(8, 18, 16, 5, R.orange, { clip: true, edge: false, shade: 'facet', tone: 3 });
    for (let x = 9; x < 24; x += 3) p.line([[x, 18], [x + 1, 22]], '#fff0d0');
    p.px(11, 14, '#ffffff'); p.px(10, 15, '#ffffff');
    p.circle(19, 26, 1, R.venom, { shade: 'facet', tone: 5, edge: false });
  } },

  // ================================================================ weapons, armour, mage gear
  apprenticeWand: { draw(p) {
    p.stroke(bez([4, 27], [24, 20], [44, 12], 14), (t) => 2.4 - t * 0.8, R.drift);
    for (let k = 0; k < 3; k++) p.stroke([[38 + k * 1.6, 10 + k * 0.4], [40 + k * 1.6, 17 + k * 0.4]], 0.6, R.rope, { edge: false });
    crystal(p, 44, 13, -0.45, 16, 3.4, R.mana, { emit: true });
    p.glint(58, 3, 1); p.glint(52, 20, 1, '#d8f0ff'); p.px(62, 12, '#b8e2ff');
    p.line([[8, 24], [30, 17]], '#f6f0e4');
  } },

  coralStaff: { draw(p) {
    p.stroke(curve((t) => [16 + Math.sin(t * 14) * 1.2, 94 - t * 66], 30), 2.4, R.coral);
    for (let y = 36; y < 92; y += 7) p.line([[14, y], [18, y + 3]], -1);
    p.stroke(bez([16, 30], [6, 24], [8, 10], 10), 1.7, R.coral);
    p.stroke(bez([16, 30], [26, 24], [24, 10], 10), 1.7, R.coral);
    p.stroke(bez([16, 28], [17, 18], [15, 4], 10), 1.4, R.coral);
    p.circle(16, 17, 6.4, R.lava, { spec: true, emit: true, lift: 0.15 });
    for (const [x, y] of [[8, 9], [24, 9], [15, 3]] as V2[]) p.circle(x, y, 1.8, R.coral, { spec: true });
    p.stroke([[16, 90], [16, 95]], 2.6, R.brass);
    p.glint(13, 14, 1, '#fffbd0');
  } },

  frostTome: { draw(p) { tome(p, R.ice, R.silver, (cx, cy) => {
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; p.line([[cx, cy], [cx + Math.cos(a) * 7, cy + Math.sin(a) * 7]], '#ffffff'); p.px(cx + Math.cos(a) * 5 + Math.cos(a + 1) * 1.5, cy + Math.sin(a) * 5 + Math.sin(a + 1) * 1.5, '#c8f4ff'); }
    p.px(cx, cy, '#ffffff');
  }); } },

  stormTome: { draw(p) { tome(p, R.eel, R.brass, (cx, cy) => {
    p.poly([[cx + 1, cy - 9], [cx - 5, cy + 1], [cx - 1, cy + 1], [cx - 3, cy + 9], [cx + 5, cy - 2], [cx + 1, cy - 2], [cx + 4, cy - 9]], R.yellow, { shade: 'facet', tone: 4, emit: true });
    for (let y = 8; y < 56; y += 5) for (let x = 9; x < 27; x += 5) p.setTone(x + ((y / 5) % 2) * 2.5, y, 2);
  }); } },

  bubblePipe: { draw(p) {
    p.stroke(bez([20, 22], [40, 26], [60, 18], 12), (t) => 1.8 - t * 0.5, R.shell);
    p.poly([[6, 12], [22, 12], [21, 24], [16, 29], [10, 28], [6, 22]], R.shell, { shade: 'round', r: 7 });
    p.ellipse(14, 12, 8, 2.6, R.shell, { shade: 'facet', tone: 4 });
    p.ellipse(14, 12.3, 6, 1.6, R.ink, { shade: 'facet', tone: 2, edge: false });
    for (let i = 0; i < 3; i++) p.line([[9 + i * 4, 16], [10 + i * 4, 26]], -1);
    for (const [x, y, r] of [[14, 5, 2.8], [22, 3, 1.8], [8, 2, 1.4]] as [number, number, number][]) { p.ring(x, y, r, 0.9, R.glass, { shade: 'facet', tone: 4 }); p.px(x - 1, y - 1, '#ffffff'); }
  } },

  kelpRobe: { draw(p) {
    p.poly([[22, 4], [42, 4], [56, 12], [62, 30], [54, 32], [48, 20], [50, 60], [14, 60], [16, 20], [10, 32], [2, 30], [8, 12]], R.kelp, { shade: 'round', r: 14 });
    p.poly([[24, 4], [32, 14], [40, 4]], R.olive, { shade: 'facet', tone: 2 });
    p.rect(15, 30, 34, 5, R.rope, { r: 1.5, shade: 'round' });
    p.circle(32, 32.5, 2.6, R.mana, { spec: true });
    for (let x = 18; x < 48; x += 4) p.line([[x, 36], [x - 1, 58]], -1);
    for (let y = 40; y < 58; y += 5) p.line([[16, y], [48, y]], 1);
    p.line([[32, 14], [32, 29]], -1);
    for (const [x, y] of [[12, 16], [52, 16], [22, 22]] as V2[]) p.px(x, y, '#d8f082');
  } },

  wizardHat: { draw(p) {
    p.ellipse(16, 56, 15, 5, R.navy, { flat: 0.3 });
    p.poly([[4, 55], [12, 30], [16, 12], [22, 4], [28, 8], [22, 14], [22, 32], [28, 55]], R.navy, { shade: 'round', r: 9 });
    p.rect(6, 47, 21, 5, R.gold, { clip: true, edge: false, shade: 'facet', tone: 3 });
    for (const [x, y, r] of [[13, 38, 2.6], [20, 24, 2], [17, 44, 1.6]] as [number, number, number][]) p.star(x, y, r * 1.6, r * 0.6, 5, R.yellow, { spec: true });
    p.circle(28, 8, 2, R.yellow, { spec: true });
    p.px(11, 34, '#a8c0ff');
  } },

  cutlass: { draw(p) {
    p.ring(9, 16, 7, 2, R.brass, { a0: 1.6, a1: 4.9 });
    p.rect(8, 13, 14, 7, R.leather, { r: 2 });
    for (let x = 10; x < 21; x += 3) p.line([[x, 13], [x + 1, 19]], -1);
    p.circle(5, 16.5, 2.6, R.brass, { spec: true });
    p.rect(21, 9, 4, 15, R.brass, { r: 1 });
    p.poly([[25, 12], [60, 11], [80, 9], [93, 4], [90, 12], [78, 18], [56, 21], [25, 21]], R.steel, { bevel: 1.6 });
    p.poly([[25, 12], [60, 11], [80, 9], [93, 4], [86, 10], [74, 13], [56, 15], [25, 15]], R.steel, { shade: 'facet', tone: 4, edge: false });
    for (const [x, y, r] of [[44, 17, 2], [66, 15, 1.8]] as [number, number, number][]) p.circle(x, y, r, R.rust, { clip: true, edge: false });
    p.line([[28, 13], [58, 12.5]], '#ffffff');
  } },

  bronzeBlade: { draw(p) {
    p.circle(4, 16, 3, R.bronze, { spec: true });
    p.rect(6, 13, 10, 7, R.darkwood, { r: 2 });
    p.rect(16, 8, 4, 17, R.bronze, { r: 1.5 });
    p.poly([[20, 13], [36, 11], [50, 12], [62, 16], [50, 21], [36, 22], [20, 20]], R.bronze, { bevel: 1.6, spec: true });
    p.line([[22, 16], [58, 16]], -1);
    p.line([[22, 14], [54, 14]], '#fff0c8');
  } },

  chainmail: { draw(p) {
    p.poly([[20, 4], [44, 4], [58, 12], [62, 30], [52, 30], [48, 20], [48, 60], [16, 60], [16, 20], [12, 30], [2, 30], [6, 12]], R.steel, { shade: 'round', r: 14 });
    p.poly([[24, 4], [32, 11], [40, 4]], R.leather, { shade: 'facet', tone: 2 });
    // the ring weave: every other pixel row offset, a dark hole in each ring
    for (let y = 9; y < 54; y += 3) for (let x = 4; x < 62; x += 3) { const ox = x + ((y / 3) % 2) * 1.5; if (p.has(Math.floor(p.X(ox)), Math.floor(p.Y(y)))) { p.setTone(ox, y, 1); p.setTone(ox + 1, y - 1, 4); } }
    p.rect(16, 54, 32, 6, R.rust, { clip: true, edge: false, shade: 'round' });
    for (const [x, y] of [[20, 24], [42, 36], [26, 46], [50, 16]] as V2[]) { p.circle(x, y, 2.2, R.white, { spec: true }); p.px(x, y, '#5e6282'); }
  } },

  turtleShell: { draw(p) {
    p.ellipse(32, 33, 28, 25, R.olive, { flat: 0.25 });
    p.ellipse(32, 31, 23, 20, R.green, { spec: true });
    const hex = (cx: number, cy: number, r: number) => p.poly(ngon(cx, cy, r, r * 0.9, 6, 0), R.kelp, { shade: 'round', flat: 0.4, edge: true });
    hex(32, 30, 7.6);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; hex(32 + Math.cos(a) * 14, 30 + Math.sin(a) * 12.6, 6.6); }
    for (const [x, y] of [[4, 22], [60, 22], [4, 44], [60, 44]] as V2[]) p.rect(x - 3, y - 2, 6, 4, R.leather, { r: 1 });
    p.glint(22, 14);
  } },

  clamShield: { draw(p) {
    // half a giant clam as a shield: a round scalloped, ribbed shell, the hinge, a leather-wrapped grip below
    p.rect(13, 40, 6, 22, R.darkwood, { r: 2 });
    for (let y = 44; y < 61; y += 3) p.line([[13, y], [18, y + 1]], -1);
    p.circle(16, 61, 2.6, R.brass, { spec: true });
    const fan: V2[] = [];
    for (let i = 0; i <= 56; i++) { const t = i / 56, a = Math.PI * (0.92 + t * 1.16); const r = 1 - 0.06 * Math.abs(Math.sin(t * Math.PI * 8)); fan.push([16 + Math.cos(a) * 15.8 * r, 38 + Math.sin(a) * 34 * r]); }
    p.poly([...fan, [20, 42], [12, 42]], R.shell, { shade: 'round', r: 11, spec: true });
    p.shadeWhere((x, y) => { const a = Math.atan2(y - 40, x - 16); return Math.floor(((a + Math.PI) / Math.PI) * 16) % 2 === 0 && y < 38; }, -1);
    p.poly([[6, 38], [11, 35], [12, 43], [6, 43]], R.shell, { shade: 'facet', tone: 2 });
    p.poly([[26, 38], [21, 35], [20, 43], [26, 43]], R.shell, { shade: 'facet', tone: 2 });
    p.line([[8, 10], [4, 22]], '#fff6ee');
  } },

  plumedHelm: { draw(p) {
    p.stroke(bez3([14, 10], [10, 2], [22, 0], [29, 6], 14), (t) => 3 - t * 1.4, R.pink);
    for (let k = 0; k < 6; k++) { const t = k / 5; p.px(12 + t * 15, 4 - Math.sin(t * Math.PI) * 3, '#fff0f4'); }
    p.poly([[5, 26], [6, 14], [11, 8], [21, 8], [26, 14], [27, 26], [21, 30], [19, 18], [13, 18], [11, 30]], R.bronze, { shade: 'round', spec: true, r: 7 });
    p.rect(13, 17, 6, 2, R.black, { shade: 'facet', tone: 1 });
    p.line([[16, 19], [16, 26]], '#2a1006');
    p.glint(10, 12);
  } },

  tideCrown: { draw(p) {
    p.poly([[4, 24], [4, 12], [9, 17], [12, 7], [16, 14], [20, 7], [23, 17], [28, 12], [28, 24]], R.gold, { shade: 'round', spec: true, r: 6 });
    p.rect(4, 21, 24, 6, R.gold, { r: 1.5, shade: 'round' });
    for (const [x, y] of [[9, 24], [16, 24], [23, 24]] as V2[]) gem(p, x, y, 2.2, 2, 6, R.aqua);
    for (const [x, y] of [[12, 6], [20, 6], [4, 11], [28, 11]] as V2[]) p.circle(x, y, 1.6, R.pearl, { spec: true });
    p.glint(9, 15);
  } },

  pipeWrench: { draw(p) {
    p.rect(2, 12, 40, 8, R.red, { r: 3 });
    p.line([[4, 14], [38, 14]], 1);
    p.ellipse(4, 16, 1.6, 2, R.black, { shade: 'facet', tone: 1 });
    p.poly([[38, 10], [54, 10], [54, 14], [46, 14], [46, 18], [54, 18], [54, 22], [38, 22]], R.iron, { bevel: 1.5 });
    p.poly([[48, 2], [62, 2], [62, 9], [56, 9], [52, 13], [48, 9]], R.iron, { bevel: 1.5 });
    p.rect(46, 13, 12, 6, R.steel, { r: 2.5 });
    for (let x = 47; x < 58; x += 2) p.line([[x, 13], [x, 18]], -1);
    for (let x = 50; x < 62; x += 2) p.px(x, 8, '#2a2c40');
  } },

  brassGoggles: { draw(p) {
    p.stroke(bez3([2, 18], [-2, 26], [34, 30], [30, 18], 20), 1.4, R.leather);
    for (const cx of [9, 23]) {
      p.circle(cx, 15, 7, R.brass, { spec: true });
      p.circle(cx, 15, 4.6, R.orange, { shade: 'flat', bevel: 1, lift: 0.1 });
      p.line([[cx - 2, 12], [cx - 3, 14]], '#fff0d0');
    }
    p.rect(14, 13, 4, 3, R.brass, { r: 1 });
    for (const [x, y] of [[4, 10], [28, 10], [9, 21], [23, 21]] as V2[]) p.px(x, y, '#fffbe0');
  } },

  scubaTank: { draw(p) {
    p.rect(10, 4, 12, 5, R.silver, { r: 1.5 });
    p.rect(14, 8, 4, 5, R.silver, { r: 1 });
    p.stroke(bez3([22, 6], [30, 6], [30, 16], [26, 20], 10), 1.2, R.black);
    p.rect(5, 12, 22, 49, R.yellow, { r: 9, spec: true });
    for (const y of [24, 46]) p.rect(5, y, 22, 3, R.black, { clip: true, edge: false, shade: 'round' });
    p.rect(9, 30, 14, 9, R.white, { r: 1, clip: true, edge: false, shade: 'facet', tone: 4 });
    p.line([[11, 33], [21, 33]], '#5e6282'); p.line([[11, 36], [18, 36]], '#5e6282');
    p.line([[8, 16], [8, 56]], '#fffbe0');
  } },

  stingrayBarb: { draw(p) {
    p.rect(2, 13, 16, 7, R.rope, { r: 2 });
    for (let x = 4; x < 17; x += 3) p.line([[x, 13], [x + 1, 19]], -1);
    const top: V2[] = [], bot: V2[] = [];
    for (let i = 0; i <= 10; i++) { const x = 18 + i * 4.3, w = 4.4 - i * 0.4; top.push([x, 16.5 - w - (i % 2) * 1.2]); bot.push([x, 16.5 + w + (i % 2) * 1.2]); }
    p.poly([...top, [63, 16.5], ...bot.reverse()], R.drift, { shade: 'round', r: 3 });
    p.line([[20, 16], [58, 16]], -1);
    p.line([[22, 14], [50, 15]], '#f6f0e4');
  } },

  shadowHood: { draw(p) {
    p.poly([[16, 2], [26, 8], [29, 20], [27, 30], [5, 30], [3, 20], [6, 8]], R.eel, { shade: 'round', r: 10 });
    p.poly([[16, 7], [23, 13], [24, 24], [8, 24], [9, 13]], R.black, { shade: 'facet', tone: 1 });
    p.px(12, 18, '#a8ff6a'); p.px(13, 18, '#e8ffd0'); p.px(19, 18, '#a8ff6a'); p.px(20, 18, '#e8ffd0');
    p.poly([[5, 28], [27, 28], [24, 31], [8, 31]], R.eel, { shade: 'facet', tone: 2 });
    p.line([[10, 5], [6, 14]], '#d0f4a8');
  } },

  chumBucket: { draw(p) {
    p.stroke(curve((t) => { const a = Math.PI * (1 + t); return [16 + Math.cos(a) * 12, 10 + Math.sin(a) * 8]; }, 16), 0.9, R.steel);
    p.poly([[4, 10], [28, 10], [25, 30], [7, 30]], R.silver, { shade: 'round', r: 8 });
    p.ellipse(16, 10, 12, 3, R.silver, { shade: 'facet', tone: 4 });
    p.ellipse(16, 10.5, 10.4, 2.2, R.flesh, { shade: 'facet', tone: 2, edge: false });
    for (const [x, y] of [[12, 10], [17, 9], [21, 11]] as V2[]) p.circle(x, y, 1.6, R.red, { spec: true });
    p.poly([[18, 9], [22, 1], [26, 2], [23, 8]], R.steel, { shade: 'round' });
    p.poly([[22, 1], [20, -2], [27, -1]], R.steel, { shade: 'facet', tone: 3 });
    for (const y of [16, 24]) p.line([[6, y], [26, y]], -1);
    p.line([[8, 13], [9, 28]], '#ffffff');
  } },

  wormCan: { draw(p) {
    // an opened tin, lid peeled back, three pink worms waving out
    p.rect(5, 12, 22, 18, R.silver, { r: 2 });
    p.rect(5, 17, 22, 8, R.red, { clip: true, edge: false, shade: 'round' });
    p.poly([[11, 19], [16, 18], [21, 20], [16, 23]], R.cream, { shade: 'facet', tone: 4 });
    p.ellipse(16, 12, 11, 3, R.silver, { shade: 'facet', tone: 4 });
    p.ellipse(16, 12.4, 9.4, 2, R.tea, { shade: 'facet', tone: 2, edge: false });
    p.poly([[18, 11], [26, 3], [30, 5], [24, 12]], R.silver, { bevel: 1 });
    for (const [x, ph, h] of [[10, 0, 9], [15, 1.5, 11], [20, 3, 8]] as [number, number, number][]) {
      const pts = curve((t) => [x + Math.sin(t * 5 + ph) * 2, 12 - t * h], 12);
      p.stroke(pts, 1.3, R.pink);
      p.px(pts[12][0] - 0.5, pts[12][1], '#3a0c1a');
    }
    p.line([[7, 15], [7, 28]], '#ffffff');
  } },

  compass: { draw(p) {
    p.ring(16, 4, 2.6, 1.6, R.brass);
    p.rect(14, 5, 4, 3, R.brass, { r: 1 });
    p.circle(16, 18, 12.5, R.brass, { spec: true });
    p.circle(16, 18, 9.6, R.paper, { shade: 'flat', bevel: 1 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const r = k % 2 ? 7.6 : 8.4; p.px(16 + Math.cos(a) * r, 18 + Math.sin(a) * r, '#766048'); }
    p.poly([[16, 10], [18, 18], [14, 18]], R.red, { shade: 'facet', tone: 3 });
    p.poly([[16, 26], [18, 18], [14, 18]], R.steel, { shade: 'facet', tone: 3 });
    p.circle(16, 18, 1.4, R.brass, { spec: true });
    p.line([[10, 13], [12, 11]], '#ffffff');
  } },

  heroCape: { draw(p) {
    // a red captain's cape hanging from a gold rod, folds catching the light, a gold hem
    p.poly([[5, 6], [27, 6], [29, 40], [30, 58], [24, 55], [19, 60], [13, 55], [8, 60], [2, 56], [4, 40]], R.red, { shade: 'round', r: 10 });
    for (const x of [9, 15, 21]) { p.shadeWhere((xx, yy) => Math.abs(xx - x - (yy - 8) * 0.05) < 1.2 && yy > 9, -2); p.shadeWhere((xx, yy) => Math.abs(xx - x - 2.4 - (yy - 8) * 0.05) < 0.9 && yy > 9, 1); }
    p.poly([[2, 52], [30, 54], [30, 58], [24, 55], [19, 60], [13, 55], [8, 60], [2, 56]], R.gold, { clip: true, edge: false, shade: 'facet', tone: 3 });
    p.rect(2, 3, 28, 4, R.gold, { r: 2, spec: true });
    p.circle(16, 5, 2.6, R.ruby, { spec: true });
  } },

  toyPack: { draw(p) {
    // a toymaker's satchel: patched canvas, pockets, a wind-up key and screwdrivers poking out
    p.stroke(bez([16, 12], [32, -2], [48, 12], 12), 2, R.leather);
    for (const [x, c] of [[22, R.red], [28, R.yellow], [40, R.blue]] as [number, typeof R.red][]) { p.stroke([[x, 14], [x + 2, 2]], 1, R.steel); p.rect(x - 1, 8, 4, 6, c, { r: 1 }); }
    p.rect(6, 12, 52, 48, R.leather, { r: 6 });
    p.rect(6, 12, 52, 16, R.leather, { r: 6, shade: 'facet', tone: 4 });
    p.line([[8, 28], [56, 28]], -2);
    p.rect(12, 34, 18, 18, R.darkwood, { r: 2 });
    p.rect(34, 34, 18, 18, R.darkwood, { r: 2 });
    for (const x of [21, 43]) { p.rect(x - 2, 33, 4, 5, R.brass, { r: 1 }); }
    p.poly([[40, 40], [48, 42], [46, 48], [38, 46]], R.cloth, { bevel: 1 });
    for (let x = 10; x < 56; x += 4) p.px(x, 14, '#efc48e');
    p.stroke([[54, 20], [62, 14]], 1, R.brass); p.ellipse(61, 11, 2.6, 1.6, R.brass, { spec: true }); p.ellipse(63, 16, 1.6, 2.4, R.brass, { spec: true });
  } },

  ruby: { draw(p) { gem(p, 16, 16, 12, 11, 8, R.ruby, { rot: -Math.PI / 2 + Math.PI / 8 }); p.glint(11, 9, 1); } },
  emerald: { draw(p) {
    // step cut: an octagon with clipped corners and concentric steps
    const o: V2[] = [[8, 5], [24, 5], [28, 9], [28, 23], [24, 27], [8, 27], [4, 23], [4, 9]];
    p.poly(o, R.emerald, { shade: 'facet', tone: 2 });
    const i1: V2[] = [[10, 9], [22, 9], [24, 11], [24, 21], [22, 23], [10, 23], [8, 21], [8, 11]];
    p.poly([o[0], o[1], i1[1], i1[0]], R.emerald, { shade: 'facet', tone: 4, edge: false });
    p.poly([o[7], o[0], i1[0], i1[7]], R.emerald, { shade: 'facet', tone: 4, edge: false });
    p.poly([o[6], o[7], i1[7], i1[6]], R.emerald, { shade: 'facet', tone: 3, edge: false });
    p.poly([o[1], o[2], i1[2], i1[1]], R.emerald, { shade: 'facet', tone: 3, edge: false });
    p.poly([o[2], o[3], i1[3], i1[2]], R.emerald, { shade: 'facet', tone: 2, edge: false });
    p.poly([o[3], o[4], i1[4], i1[3]], R.emerald, { shade: 'facet', tone: 1, edge: false });
    p.poly([o[4], o[5], i1[5], i1[4]], R.emerald, { shade: 'facet', tone: 1, edge: false });
    p.poly([o[5], o[6], i1[6], i1[5]], R.emerald, { shade: 'facet', tone: 2, edge: false });
    p.poly(i1, R.emerald, { shade: 'facet', tone: 3, edge: false });
    p.poly([[11, 12], [21, 12], [21, 20], [11, 20]], R.emerald, { shade: 'facet', tone: 4, edge: false });
    p.line([[12, 13], [16, 13]], '#f0ffd8'); p.px(12, 14, '#f0ffd8');
    p.glint(9, 7);
  } },

  brassKey: { draw(p) {
    // a wind-up toy key: butterfly bow, a short shaft into a square drive
    p.stroke([[17, 17], [26, 26]], 2, R.brass);
    p.rect(24, 24, 5, 5, R.brass, { r: 1 });
    p.ellipse(9.5, 11, 6, 4.5, R.brass, { rot: -0.75, spec: true });
    p.ellipse(15, 5.5, 4.5, 6, R.brass, { rot: -0.75, spec: true });
    p.ellipse(9.5, 11, 3, 1.8, R.brass, { rot: -0.75, shade: 'facet', tone: 1 });
    p.ellipse(15, 5.5, 1.8, 3, R.brass, { rot: -0.75, shade: 'facet', tone: 1 });
    p.circle(15.5, 15.5, 3.4, R.brass, { spec: true });
    p.px(14, 14, '#fffbe0');
  } },

  inkBomb: { draw(p) {
    p.circle(15, 18, 10.5, R.ink, { spec: true });
    p.rect(12, 5, 7, 5, R.brass, { r: 1 });
    p.stroke(bez([16, 5], [18, 1], [23, 2], 8), 1, R.rope);
    p.glint(24, 2, 1, '#fff6a0', '#ff9a2a');
    // ink drips
    p.ellipse(9, 28, 2.2, 2.6, R.ink, { spec: true });
    p.px(10, 13, '#e8dcff'); p.px(11, 12, '#e8dcff'); p.px(10, 12, '#ffffff');
  } },

  seaMine: { draw(p) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      p.stroke([[16 + Math.cos(a) * 9, 15 + Math.sin(a) * 9], [16 + Math.cos(a) * 13.2, 15 + Math.sin(a) * 13.2]], 1.6, R.iron);
    }
    p.circle(16, 15, 10, R.iron, { spec: true });
    p.line([[7, 15], [25, 15]], -1);
    p.stroke([[16, 25], [16, 30]], 1.2, R.rust);
    p.ring(16, 30.5, 1.4, 1.2, R.rust);
    p.glint(12, 10);
  } },

  tideTrident: { draw(p) {
    // a fork trident: wooden haft, brass collar, three steel prongs with barbs
    p.stroke([[16, 92], [16, 30]], 2.2, R.darkwood);
    p.stroke([[16, 92], [16, 88]], 2.6, R.brass);
    for (const x of [8, 24]) p.stroke(bez([16, 28], [x, 27], [x, 12], 10), 1.7, R.steel);
    p.stroke([[16, 30], [16, 4]], 1.9, R.steel);
    p.poly([[16, 0], [19, 6], [13, 6]], R.steel, { shade: 'facet', tone: 4 });
    for (const x of [8, 24]) p.poly([[x, 4], [x + 3, 11], [x - 3, 11]], R.steel, { shade: 'facet', tone: x < 16 ? 4 : 3 });
    p.rect(12, 28, 8, 5, R.brass, { r: 1.5 });
    gem(p, 16, 38, 3.4, 3.4, 6, R.aqua);
    for (let y = 46; y < 86; y += 6) p.line([[15, y], [17, y + 2]], -1);
  } },

  pumiceHeart: { draw(p) {
    const heart = curve((t) => { const a = t * Math.PI * 2; const x = 16 * Math.sin(a) ** 3; const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); return [32 + x * 1.62, 30 + y * 1.62]; }, 64);
    p.poly(heart, R.pumice, { shade: 'round', r: 13 });
    // pores: small dark clusters
    for (const [x, y] of [[20, 18], [42, 20], [26, 34], [38, 40], [30, 24], [46, 30], [18, 28]] as V2[]) { p.px(x, y, '#2e2830'); p.px(x + 1, y, '#3e363e'); p.px(x, y + 1, '#3e363e'); }
    // glowing lava cracks
    const crack = (pts: V2[]) => { p.stroke(pts, 0.9, R.lava, { emit: true, edge: false, shade: 'none', tone: 4 }); };
    crack([[32, 16], [29, 24], [34, 30], [30, 38], [32, 48]]);
    crack([[34, 30], [42, 28], [47, 22]]);
    crack([[29, 24], [21, 22]]);
    p.glint(17, 14);
  } },

  filletKnife: { draw(p) {
    // handle: wood with brass rivets; blade: long, thin, curved spine
    p.rect(3, 11, 30, 10, R.darkwood, { r: 4 });
    p.rect(30, 10, 4, 12, R.steel, { r: 1 });
    p.poly([[34, 11], [70, 12], [86, 14], [93, 17], [86, 19], [60, 20], [34, 21]], R.steel, { shade: 'flat', bevel: 2 });
    p.poly([[34, 11], [70, 12], [86, 14], [93, 17], [86, 16], [60, 15], [34, 15]], R.steel, { shade: 'facet', tone: 4, edge: false });
    p.line([[36, 15], [84, 16]], 1);
    for (const x of [10, 18, 26]) { p.px(x, 15, '#fff0a0'); p.px(x, 16, '#c08a2a'); }
    p.line([[6, 13], [27, 13]], 1);
    p.glint(80, 13);
  } },
};
