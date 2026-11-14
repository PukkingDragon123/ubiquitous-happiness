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
