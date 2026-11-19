// v6 "chunky + detailed": the shared 1x pixel-art toolbox of the UI kit. Every UI surface is painted at ONE texel per
// UI pixel (the kit scales it up 2x / 3x with nearest filtering, so it reads as true chunky pixel art) and gets its
// richness from hand-placed detail, never from noise or dither:
//
//   Px                       a 1x canvas you paint per pixel (set / get / shade / mix), then done()
//   R.*                      hue-shifted ramps (dark -> light): wood, salt-bleached wood, sea-worn paint, iron, rust,
//                            rope, barnacle, limpet, coralline, kelp, algae, holdfast, water, sand, seaweed paper ...
//   stamp(px, SPR.barnacleL, x, y)    a hand-drawn sprite decal with a cast shadow down-right onto what is under it
//   algae(px, cx, cy, rx, ry, seed)   an algae film over painted wood: the grain shows through, a diatom fringe edge
//   coralline(px, cx, cy, r, seed)    a lumpy coralline crust (pink, lit top-left, pale growing rims)
//   kelpBlade(px, pts, w)             a kelp frond ribbon (lit edge, midrib, ruffled margin, ink rim)
//   holdfast(px, x, y, dir)           a kelp holdfast clamped to a frame (branching haptera)
//   grass(px, x, y, n, seed)          a sea-grass tuft growing up from (x, y)
//   nail(px, x, y, rust)             a square iron nail head with a rust run
//   up(cv, d)                        a 1x canvas blown up d x d with nearest pixels (API callers that ask for density)
//
// Light comes from the top-left everywhere; every decal casts a 1 px shadow down-right.

export type C = [number, number, number];
export const hx = (s: string): C => { const v = parseInt(s.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const ramp = (...s: string[]) => s.map(hx);
export const lerpC = (a: C, b: C, t: number): C => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
/** a deterministic 0..1 from integers (where a knot / chip / barnacle goes: placed by rule, the same every time) */
export const hash = (a: number, b = 0) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

/** the kit's hue-shifted ramps, dark -> light */
export const R = {
  ink: hx('#0b1622'),
  /** weathered ship planks: plum shadows -> honey lights (9) */
  wood: ramp('#1a0e14', '#2e1a1c', '#48291f', '#653b27', '#845230', '#a26b3e', '#bd8751', '#d6a76c', '#ecca95'),
  /** salt-bleached driftwood: violet-grey shadows -> bone (7) */
  salt: ramp('#3a3236', '#5a5150', '#7c7268', '#9e9382', '#bdb29b', '#d8cfb6', '#efe8d2'),
  /** sea-worn teal paint (7) */
  paint: ramp('#071d24', '#0e3238', '#164a4a', '#21645c', '#327e70', '#4f9c86', '#7cbfa2'),
  /** old white paint flakes (5) */
  chalk: ramp('#5e6866', '#8e9894', '#b8c0b8', '#dce0d4', '#f4f4e8'),
  iron: ramp('#0c0e14', '#1e2230', '#363c4a', '#56606a', '#848e96', '#bcc4c8'),
  rust: ramp('#33120a', '#5a2414', '#84391c', '#aa5626', '#c87a3a', '#e4a25a'),
  rope: ramp('#1e1309', '#3e2b12', '#644a22', '#8c6e38', '#b49250', '#d6b874', '#efdba4'),
  barn: ramp('#1c1a22', '#38353c', '#5c5759', '#837c76', '#aaa196', '#cec6b6', '#efe9dc'),
  limpet: ramp('#2a1e1a', '#4c3a30', '#73594a', '#9a7c62', '#c0a080', '#e2c8a4', '#f8ead0'),
  snail: ramp('#2a1408', '#5a2e12', '#8a4e1e', '#b8782e', '#dca04a', '#f4c876', '#fff0c0'),
  shell: ramp('#4a1820', '#7e2e30', '#b2513e', '#d8795a', '#f0a27c', '#fccaa6', '#fff0dc'),
  /** coralline crust: deep magenta -> pale pink (7) */
  coral: ramp('#36101f', '#5e1c36', '#8c2f4c', '#b44e66', '#d67486', '#eda2ac', '#fbd2d2'),
  /** kelp fronds (olive-green, warm lights) (7) */
  kelp: ramp('#0c200e', '#183a14', '#28561c', '#3c7426', '#559234', '#78b04a', '#a8d06c'),
  /** algae film: green (6) and the golden-brown diatom fringe (5) */
  algae: ramp('#142410', '#223c16', '#34561e', '#4a7028', '#668c34', '#8aa846'),
  diatom: ramp('#2a1e0c', '#4a3614', '#6c501e', '#8e6c2c', '#b08e44'),
  holdfast: ramp('#160f08', '#2e2210', '#4a3818', '#685022', '#866c32', '#a88c4a'),
  bladder: ramp('#3a3010', '#6e5c1c', '#a08a2c', '#c8b04a', '#ecd878'),
  /** dark water behind glass (10) */
  water: ramp('#030a10', '#06121b', '#0a1a25', '#0e2330', '#122c3a', '#183846', '#204a56', '#346a70', '#5a9a98', '#a2d8cc'),
  sand: ramp('#4a3620', '#6a5232', '#8c7048', '#ae905e', '#caac76', '#e0c690', '#f2deb0'),
  /** pressed seaweed paper (nori / kelp paper), pale olive-cream (8) */
  paper: ramp('#4c4a2c', '#727044', '#99955e', '#b8b47c', '#d0cc98', '#e2deb4', '#eeebcc', '#f8f6e4'),
  /** the pressed leaves and veins in the paper (5) */
  leaf: ramp('#66703a', '#86924c', '#a2ac62', '#bcc47e', '#d2d89c'),
  brass: ramp('#24100a', '#4a240e', '#7a4416', '#a86a24', '#cc9236', '#e8b850', '#f8d880', '#fff4c8'),
  verd: ramp('#163a34', '#2a5e52', '#47866e', '#76b496'),
  glass: ramp('#123e3a', '#21685e', '#3e9c88', '#78d0b6', '#d0fff0'),
  grass: ramp('#0c2010', '#173a18', '#255a22', '#3a7a2c', '#58983a', '#80b850', '#acd676'),
};

/** a 1x canvas painted per pixel */
export class Px {
  readonly w: number; readonly h: number;
  readonly D: Uint8ClampedArray;
  readonly cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  constructor(w: number, h: number) {
    this.w = Math.max(1, Math.round(w)); this.h = Math.max(1, Math.round(h));
    this.cv = document.createElement('canvas'); this.cv.width = this.w; this.cv.height = this.h;
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(this.w, this.h);
    this.D = this.img.data;
  }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, c: C, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (!this.in(x, y)) return;
    const i = (y * this.w + x) * 4; this.D[i] = c[0]; this.D[i + 1] = c[1]; this.D[i + 2] = c[2]; this.D[i + 3] = a;
  }
  a(x: number, y: number) { x = Math.round(x); y = Math.round(y); return this.in(x, y) ? this.D[(y * this.w + x) * 4 + 3] : 0; }
  get(x: number, y: number): C { const i = (Math.round(y) * this.w + Math.round(x)) * 4; return [this.D[i], this.D[i + 1], this.D[i + 2]]; }
  /** recolour an already painted pixel (keeps its alpha) */
  over(x: number, y: number, c: C) { const a = this.a(x, y); if (a) this.set(x, y, c, a); }
  /** darken (k < 1) / lighten an already painted pixel */
  shade(x: number, y: number, k: number) {
    const a = this.a(x, y); if (!a) return;
    const c = this.get(x, y);
    this.set(x, y, k <= 1 ? [c[0] * k, c[1] * k, c[2] * k * 1.04] as C : lerpC(c, [255, 255, 240], k - 1), a);
  }
  /** blend an already painted pixel toward c */
  mix(x: number, y: number, c: C, t: number) { const a = this.a(x, y); if (a) this.set(x, y, lerpC(this.get(x, y), c, t), a); }
  rect(x: number, y: number, w: number, h: number, c: C, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  done() { this.ctx.putImageData(this.img, 0, 0); return this.cv; }
}

/** every sprite stamped on a strip of plank (the style guide zooms it) */
export function spriteSheet(): HTMLCanvasElement {
  const names = Object.keys(SPR) as (keyof typeof SPR)[];
  const W = names.reduce((a, n) => a + SPR[n].w + 3, 3), H = 12;
  const px = new Px(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set(x, y, R.wood[y < 2 ? 7 : y < 5 ? 5 : y < 9 ? 4 : 3]);
  let x = 2;
  for (const n of names) { const s = SPR[n]; stamp(px, s, x, Math.round((H - s.h) / 2)); x += s.w + 3; }
  return px.done();
}

/** a 1x canvas blown up d x d (nearest): for API callers that still ask for a density */
export function up(cv: HTMLCanvasElement, d: number): HTMLCanvasElement {
  if (d <= 1) return cv;
  const o = document.createElement('canvas'); o.width = cv.width * d; o.height = cv.height * d;
  const x = o.getContext('2d')!; x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, o.width, o.height);
  return o;
}

// ------------------------------------------------------------------ sprites
/** a hand-drawn sprite: rows of palette letters ('.' clear) */
export interface Spr { w: number; h: number; px: (C | null)[] }
function spr(rows: string[], pal: Record<string, C>): Spr {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const px: (C | null)[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = rows[y][x] ?? '.'; px.push(ch === '.' || ch === ' ' ? null : pal[ch] ?? null); }
  return { w, h, px };
}
/** a ramp as palette letters '0'..'9' */
const P = (r: C[], extra: Record<string, C> = {}) => { const o: Record<string, C> = { ...extra }; r.forEach((c, i) => { o[String(i)] = c; }); return o; };

/**
 * stamp a sprite at (x, y): a cast shadow first (each pixel darkens what is 1 px down-right of it, where the sprite
 * itself isn't), then the pixels. `onlyOn` keeps it to pixels already painted (never spills past a rounded corner).
 */
export function stamp(px: Px, s: Spr, x: number, y: number, o: { flip?: boolean; shadow?: number; onlyOn?: boolean } = {}) {
  x = Math.round(x); y = Math.round(y);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= s.w || j >= s.h ? null : s.px[j * s.w + (o.flip ? s.w - 1 - i : i)]);
  const sh = o.shadow ?? 0.6;
  if (sh < 1) for (let j = 0; j <= s.h; j++) for (let i = 0; i <= s.w; i++) if (!at(i, j) && at(i - 1, j - 1)) px.shade(x + i, y + j, sh);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const c = at(i, j); if (!c) continue;
    if (o.onlyOn && !px.a(x + i, y + j)) continue;
    px.set(x + i, y + j, c);
  }
}

const B = R.barn, LI = R.limpet, SN = R.snail, SH = R.shell;
export const SPR = {
  /** barnacles: little volcanoes of ridged wall plates, the dark opening on top, lit from the top-left */
  barnacleL: spr([
    '.354.',
    '46k42',
    '45432',
    '.332.',
  ], P(B, { k: hx('#1a1418') })),
  barnacleM: spr([
    '.54.',
    '4k42',
    '.32.',
  ], P(B, { k: hx('#1a1418') })),
  barnacleS: spr([
    '5k3',
    '.2.',
  ], P(B, { k: hx('#1a1418') })),
  /** a limpet: a low cone with radial ribs */
  limpet: spr([
    '...44...',
    '..5643..',
    '.54r432.',
    '54r4r321',
  ], P(LI, { r: hx('#6a4e3c') })),
  /** a little whelk snail creeping right: an amber shell with its dark spiral, a grey foot, eye stalks up */
  snail: spr([
    '..2442..',
    '.24k542.',
    '.4k33k3.',
    '.3k3k32e',
    '.233322e',
    'ffgggggg',
  ], P(SN, { k: hx('#3a1a0c'), e: hx('#3a3a30'), f: hx('#4c4a3c'), g: hx('#8e8a72') })),
  /** a five-armed sea star, lit top-left */
  star: spr([
    '...4...',
    '..354..',
    '4455432',
    '.35543.',
    '..443..',
    '.33.32.',
    '.2...2.',
  ], P(ramp('#3a1206', '#7a2a10', '#b4461a', '#dc6a2a', '#f08c3c', '#ffb466', '#ffdca0'))),
  /** a small scallop shell (hinge down): ribs fanning out, its own dark tones for an edge */
  scallop: spr([
    '.23432.',
    '2565652',
    '2454542',
    '.24342.',
    '..232..',
    '.12221.',
  ], P(SH)),
  /** a sea-glass pebble */
  glass: spr([
    '.0000.',
    '034420',
    '032210',
    '.0000.',
  ], P(R.glass)),
  /** a rope knot (corners of the rope-trimmed cards) */
  knot: spr([
    '.0000.',
    '056540',
    '054320',
    '064310',
    '043210',
    '.0000.',
  ], P(R.rope)),
  /** a tuft of the seaweed paper's pressed sprig (a small leafy frond) */
  sprig: spr([
    '......1.',
    '..1..12.',
    '.121.1..',
    '..1211..',
    '...21.1.',
    '..1.212.',
    '.12.1...',
    '..1.....',
  ], { 1: R.leaf[1], 2: R.leaf[3] }),
};

// ------------------------------------------------------------------ procedural growth (deterministic shapes)
/**
 * an algae film over painted pixels inside a lobed ellipse: the existing tone maps onto the algae ramp (so wood grain,
 * knots and seams still show through, greened), with a golden-brown diatom fringe round the edge
 */
export function algae(px: Px, cx: number, cy: number, rx: number, ry: number, seed: number, o: { inside?: (x: number, y: number) => boolean; brown?: boolean } = {}) {
  const G = o.brown ? R.diatom : R.algae;
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    if (!px.a(x, y) || (o.inside && !o.inside(x, y))) continue;
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, ang = Math.atan2(dy, dx);
    const rr = 1 + 0.22 * Math.sin(ang * 3 + seed) + 0.12 * Math.sin(ang * 7 + seed * 2.3);
    const e = Math.hypot(dx, dy) / rr;
    if (e > 1) continue;
    const c = px.get(x, y), L = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
    if (e > 0.78) { const F = R.diatom; px.set(x, y, F[Math.max(0, Math.min(F.length - 1, Math.round(L * 7)))]); continue; }
    px.set(x, y, G[Math.max(0, Math.min(G.length - 1, Math.round(L * 8.5)))]);
  }
}

/**
 * a coralline crust spreading over painted pixels inside a lobed ellipse: pink tones by the luminance of what is under
 * it (so wood grain still shows as ridges), a dark rim on its lower / right edge and a pale growing rim on its upper /
 * left edge, little raised conceptacle bumps on a staggered lattice, and a cast shadow down-right
 */
export function coralline(px: Px, cx: number, cy: number, rx: number, ry: number, seed: number, o: { inside?: (x: number, y: number) => boolean } = {}) {
  const K = R.coral;
  const inBlob = (x: number, y: number) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, ang = Math.atan2(dy, dx);
    return Math.hypot(dx, dy) <= 1 + 0.24 * Math.sin(ang * 4 + seed) + 0.12 * Math.sin(ang * 9 + seed * 1.7);
  };
  const ok = (x: number, y: number) => px.a(x, y) > 0 && (!o.inside || o.inside(x, y));
  const x0 = Math.floor(cx - rx * 1.5 - 1), x1 = Math.ceil(cx + rx * 1.5 + 1), y0 = Math.floor(cy - ry * 1.5 - 1), y1 = Math.ceil(cy + ry * 1.5 + 1);
  for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1 + 1; x++) if (!inBlob(x, y) && inBlob(x - 1, y - 1) && ok(x, y)) px.shade(x, y, 0.62);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inBlob(x, y) || !ok(x, y)) continue;
    const c = px.get(x, y), L = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
    let t = Math.max(2, Math.min(5, Math.round(1.5 + L * 6)));
    if (!inBlob(x + 1, y) || !inBlob(x, y + 1)) t = 1;
    else if (!inBlob(x - 1, y) || !inBlob(x, y - 1)) t = 6;
    else if ((x * 2 + y * 3 + seed) % 7 === 0) t = 6;                          // a conceptacle bump, lit
    else if ((x * 2 + (y - 1) * 3 + seed) % 7 === 0) t = 2;                    // ... and its shadow
    px.set(x, y, K[t]);
  }
}

/**
 * a kelp frond ribbon along a centre line (points in px), `w` px wide at its widest: an ink rim, a lit left margin,
 * a darker right margin, a paler midrib, a ruffled edge (the width steps every few pixels), a tapered tip
 */
export function kelpBlade(px: Px, pts: [number, number][], w: number, o: { inside?: (x: number, y: number) => boolean; K?: C[]; free?: boolean } = {}) {
  const K = o.K ?? R.kelp;
  const on = (x: number, y: number) => (o.free ? px.in(x, y) : px.a(x, y) > 0) && (!o.inside || o.inside(x, y));
  const n = pts.length;
  const cells = new Map<number, number>(); // key -> tone
  const key = (x: number, y: number) => y * 4096 + x;
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const k = i / Math.max(1, n - 1);
    const ww = Math.max(1, Math.round(w * Math.min(1, k * 4 + 0.35) * (k > 0.75 ? (1 - k) / 0.25 * 0.8 + 0.2 : 1) + ((i >> 1) % 3 === 0 ? 1 : 0) - 0.4));
    const x0 = Math.round(x - ww / 2);
    for (let j = 0; j < ww; j++) {
      const t = ww === 1 ? 3 : j === 0 ? 5 : j === ww - 1 ? 2 : j === Math.floor(ww / 2) ? 4 : 3;
      const kk = key(x0 + j, Math.round(y));
      cells.set(kk, Math.max(cells.get(kk) ?? 0, t));
    }
  }
  const has = (x: number, y: number) => cells.has(key(x, y));
  // rim + cast shadow
  for (const kk of cells.keys()) {
    const x = kk % 4096, y = Math.floor(kk / 4096);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has(x + dx, y + dy) && on(x + dx, y + dy)) px.set(x + dx, y + dy, K[0]);
    if (!has(x + 1, y + 1) && !has(x + 2, y + 1) && px.a(x + 2, y + 1) && (!o.inside || o.inside(x + 2, y + 1))) px.shade(x + 2, y + 1, 0.7);
  }
  for (const [kk, t] of cells) { const x = kk % 4096, y = Math.floor(kk / 4096); if (on(x, y)) px.set(x, y, K[t]); }
}

/** points along a wavy kelp blade from (x, y) running (dx, dy) for len px */
export function bladePath(x: number, y: number, dx: number, dy: number, len: number, amp: number, ph: number): [number, number][] {
  const out: [number, number][] = [];
  const nx = -dy, ny = dx;
  for (let i = 0; i < len; i++) {
    const s = Math.sin(i * 0.32 + ph) * amp * Math.min(1, i / 5);
    out.push([x + dx * i + nx * s, y + dy * i + ny * s]);
  }
  return out;
}

/** a kelp holdfast clamped on at (x, y): a knot with branching haptera reaching out (dir -1 / 1 = left / right) */
export function holdfast(px: Px, x: number, y: number, dir: 1 | -1, o: { inside?: (x: number, y: number) => boolean; free?: boolean } = {}) {
  const H = R.holdfast;
  const roots: [number, number][][] = [
    [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]],
    [[0, 0], [1, 2], [1, 3], [2, 4]],
    [[0, 0], [-1, 1], [-2, 2], [-2, 3]],
    [[1, 1], [2, 3], [3, 4]],
    [[0, 0], [2, 0], [3, 0], [4, 1], [5, 1]],
  ];
  const ok = (X: number, Y: number) => (o.free ? px.in(X, Y) : px.a(X, Y) > 0) && (!o.inside || o.inside(X, Y));
  const pts: [number, number][] = [];
  for (const r of roots) for (const [rx, ry] of r) pts.push([x + rx * dir, y + ry]);
  for (const [X, Y] of pts) if (ok(X + 1, Y + 1) && !pts.some(([a, b]) => a === X + 1 && b === Y + 1)) px.shade(X + 1, Y + 1, 0.6);
  pts.forEach(([X, Y], i) => { if (ok(X, Y)) px.set(X, Y, H[i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 2]); });
  // the knot the stipe rises from
  for (const [dx, dy, t] of [[0, -1, 5], [1, -1, 4], [-1, 0, 4], [0, 0, 3], [1, 0, 2], [0, 1, 1], [1, 1, 1]] as const) if (ok(x + dx * dir, y + dy)) px.set(x + dx * dir, y + dy, H[t]);
}

/** a sea-grass tuft: n blades fanning up from (x, y), lit on their left edges, swaying lean per blade */
export function grass(px: Px, x: number, y: number, n: number, seed: number, maxH = 8, o: { inside?: (x: number, y: number) => boolean; free?: boolean } = {}) {
  const G = R.grass;
  const ok = (X: number, Y: number) => (o.free ? px.in(X, Y) : px.a(X, Y) > 0) && (!o.inside || o.inside(X, Y));
  for (let b = 0; b < n; b++) {
    const bx = x + b * 2 - n + 1 + (b % 2), h = Math.max(3, Math.round(maxH * (0.55 + hash(seed, b) * 0.45)));
    const lean = (b - (n - 1) / 2) * 0.55 + (hash(seed, b + 9) - 0.5);
    for (let i = 0; i < h; i++) {
      const k = i / h;
      const X = Math.round(bx + lean * k * k * h * 0.4), Y = y - i;
      if (!ok(X, Y)) continue;
      const t = k > 0.8 ? 6 : k > 0.5 ? 5 : k > 0.2 ? 4 : 3;
      if (ok(X + 1, Y + 1) && i > 0) px.shade(X + 1, Y + 1, 0.72);
      px.set(X, Y, G[t]);
      if (i < h * 0.45 && ok(X + 1, Y)) px.set(X + 1, Y, G[2]);
    }
  }
}

/** a square iron nail head (2 x 2) with a short rust run below it (rust: run length in px, 0 = none) */
export function nail(px: Px, x: number, y: number, rust = 2, vertical = true) {
  x = Math.round(x); y = Math.round(y);
  for (let i = 0; i < rust; i++) {
    if (vertical) { px.set(x, y + 2 + i, R.rust[i === 0 ? 2 : 1]); if (i === 0) px.set(x + 1, y + 2, R.rust[1]); }
    else { px.set(x + 2 + i, y + 1, R.rust[i === 0 ? 2 : 1]); }
  }
  px.shade(x + 2, y + 1, 0.6); px.shade(x + 1, y + 2, 0.6); px.shade(x + 2, y + 2, 0.55);
  px.set(x, y, R.iron[5]); px.set(x + 1, y, R.iron[3]); px.set(x, y + 1, R.iron[3]); px.set(x + 1, y + 1, R.iron[1]);
}

/**
 * a band of planks (len along, T across) at (x0, y0): each plank a rounded board (lit leading edge, shaded trailing
 * edge), long grain runs that wander a pixel and break at uneven places with a lit lip under them, a knot with the
 * grain wrapping round it, dark seams with lit end grain, split ends, worm holes. Bands over 15 px across are two
 * boards. Returns the plank seams (for nails).
 */
export function planks(px: Px, x0: number, y0: number, len: number, T: number, horiz: boolean, W: C[], seed: number, o: { lit?: number; flakes?: boolean } = {}) {
  const lit = o.lit ?? 0;
  const boards = T >= 16 ? [[0, Math.floor(T / 2)], [Math.floor(T / 2), T - Math.floor(T / 2)]] : [[0, T]];
  const seams: { b: number; at: number[] }[] = [];
  boards.forEach(([b0, bt], bi) => {
    const at: number[] = [];
    let a = -Math.round(hash(seed, bi + 1) * 30), k = 0;
    while (a < len) {
      const pl = 38 + Math.round(hash(seed + bi * 7, k) * 30);
      const s0 = Math.max(0, a), s1 = Math.min(len, a + pl);
      if (a + pl < len) at.push(a + pl);
      const off = [0, 1, -1, 0, 1, -1][(k + bi * 2 + seed) % 6] + lit;
      const knot = s1 - s0 > 26 && bt >= 5 && hash(seed + k, bi + 40) > 0.35 ? { a: s0 + 8 + Math.round(hash(k, seed + bi) * (s1 - s0 - 16)), c: Math.round(bt / 2) - 0.5 + (hash(k + 3, seed) > 0.5 ? 1 : -1) * Math.min(1, bt / 6) } : null;
      const split = hash(seed + 5, k + bi) > 0.55 ? Math.round(bt * (0.3 + hash(k, 7) * 0.4)) : -1;
      for (let u = s0; u < s1; u++) for (let c = 0; c < bt; c++) {
        // the board's own shading across: a lit leading edge, a shaded trailing edge
        let t = 4 + off + (c === 0 ? 2 : c === 1 ? 1 : c === bt - 1 ? -2 : c === bt - 2 ? -1 : 0);
        // grain: a run every ~3 px across, wandering, broken unevenly
        for (let g = 1; g < bt - 1; g += 3) {
          const row = g + Math.round(Math.sin((u + seed * 7 + g * 13) / (9 + g)) * 1.1);
          const on = hash(Math.floor((u + g * 5 + seed) / 11), g + k * 3 + bi) > 0.22;
          if (on && c === row) t -= 2;
          else if (on && c === row + 1 && hash(Math.floor((u + g) / 4), g + 99) > 0.6) t += 1;
        }
        // a knot, and the grain wrapping round it
        if (knot) {
          const e = ((u - knot.a) / 2.6) ** 2 + ((c - knot.c) / 1.4) ** 2;
          if (e < 0.35) t = 0; else if (e < 1) t = 2; else if (e < 1.9) t = Math.max(1, t - 1);
          if (e >= 0.6 && e < 1.4 && u > knot.a && c > knot.c) t = 7;
        }
        // a split running in from the plank's end
        if (split >= 0 && c === split && u - s0 < 7 && u > s0) t = 1;
        // the seams: a dark joint, the next plank's lit end grain
        if (u === s0 && a >= 0) t = 1; else if (u === s0 + 1 && a >= 0) t = 7;
        const X = horiz ? x0 + u : x0 + b0 + c, Y = horiz ? y0 + b0 + c : y0 + u;
        px.set(X, Y, W[Math.max(0, Math.min(8, t))]);
      }
      // a flake of old white paint on some planks: an irregular patch standing proud (lit top, a shadow under it)
      if (o.flakes && hash(seed + k, 61) > 0.72 && s1 - s0 > 20 && bt >= 5) {
        const fa = s0 + 6 + Math.round(hash(k, 62) * (s1 - s0 - 14)), fc = 1 + Math.round(hash(k, 64) * (bt - 4));
        const shape = [[1, 1], [0, 2], [0, 2], [1, 2], [0, 1], [1, 1]];
        shape.forEach(([c0, c1], u) => {
          for (let c = c0; c <= c1; c++) {
            const X = horiz ? x0 + fa + u : x0 + b0 + fc + c, Y = horiz ? y0 + b0 + fc + c : y0 + fa + u;
            px.set(X, Y, R.chalk[c === c0 ? 3 : c === c1 ? 1 : 2]);
          }
          const X = horiz ? x0 + fa + u : x0 + b0 + fc + c1 + 1, Y = horiz ? y0 + b0 + fc + c1 + 1 : y0 + fa + u;
          px.shade(X, Y, 0.7);
        });
      }
      a += pl; k++;
    }
    // a seam between the two boards
    if (bi === 1) for (let u = 0; u < len; u++) { const X = horiz ? x0 + u : x0 + b0 - 1, Y = horiz ? y0 + b0 - 1 : y0 + u; px.shade(X, Y, 0.55); }
    seams.push({ b: b0, at });
  });
  return seams;
}

/** rope wraps across a band near a corner: n wraps, each 2 px rope (a lit side, a shaded side) and a dark gap */
export function wraps(px: Px, x: number, y: number, T: number, horiz: boolean, n = 3) {
  const P = R.rope;
  for (let i = 0; i < n; i++) for (let j = -1; j <= T; j++) for (let k = 0; k < 3; k++) {
    const along = i * 3 + k + (j >> 1), X = horiz ? x + along : x + j, Y = horiz ? y + j : y + along;
    if (j === -1 || j === T) { if (k < 2) px.set(X, Y, P[k === 0 ? 2 : 1]); continue; }
    const f = j / T;
    px.set(X, Y, k === 2 ? P[0] : P[k === 0 ? (f < 0.3 ? 6 : f < 0.7 ? 5 : 4) : (f < 0.3 ? 4 : f < 0.7 ? 3 : 2)]);
  }
}

/** a domed brass rivet (3 x 3), lit top-left */
export function rivet(px: Px, x: number, y: number, Br: C[] = R.brass) {
  x = Math.round(x); y = Math.round(y);
  const m = [[6, 5, 3], [5, 4, 2], [3, 2, 1]];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (!((i === 0 || i === 2) && (j === 0 || j === 2)) || (i + j) < 3) px.set(x + i, y + j, Br[m[j][i]]);
  px.set(x + 2, y + 2, Br[0]); px.set(x, y, Br[7]);
  px.shade(x + 3, y + 2, 0.6); px.shade(x + 2, y + 3, 0.6);
}
