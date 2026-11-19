// v5 "diver's kit" pieces shared by the in-run UI (HUD, run summary, post office, pause card, prompts):
//
//   PAL                          the one palette (ink, lacquered teal, brass, cream, kelp, coral, sea blue)
//   plate(w, h, 'lacquer')       a painted plate canvas at exact UI px (cached): a dark lacquered-teal face in a
//                                brass rim with corner pieces and rivets, a crisp lit top / left edge and an ink
//                                outline. Kinds: lacquer | brass | well (a recessed window) | cream (flat paper) |
//                                ribbon (a title banner). Clean flat tones only: no noise.
//   bigText(ui, '-34 M', x, y, { cap: 18 })   big pixel numerals / titles in Jersey at any size: the Jersey cut and
//                                the integer blow-up that best match the asked cap height (UI px), 1 font px outline
//                                and drop shadow scaled with it, so a numeral is as crisp at 720p as at 4K
//   bar(ui, x, y, w, h, v, ...)  a clean banded fill bar (base / light top row / shadow bottom row, a chip, a flash)
import type { PixelUI } from '../pixel/ui';
import { glyphs, FONTS, capH, type FontName } from '../pixel/font';
import { ramp } from './pixtex';

export const PAL = {
  ink: '#0b1622', ink2: '#070d14',
  teal0: '#0d2329', teal: '#12333a', teal1: '#1d4f55', teal2: '#2c6b70',
  brass0: '#5a3a14', brass1: '#8a5a24', brass: '#c8913a', brass2: '#f2c66d', glint: '#fff4c8',
  cream: '#f3e7c9', cream1: '#d9c59b', cream2: '#b8a074', paper: '#fffaf0',
  kelp: '#5fae3f', kelp1: '#3a7a28', kelp2: '#a8e070',
  coral: '#e0564a', coral1: '#9a2a24', coral2: '#ff9a7a',
  sea: '#3d8fd6', sea1: '#1d5a96', sea2: '#8ac8ff',
  text: '#f3e7c9', dim: '#9ab4b4',
};

// ------------------------------------------------------------------ big text
const JERSEY: FontName[] = ['hd10', 'hd15', 'hd20'];
/** the Jersey cut and integer blow-up whose cap is closest to `cap` canvas px */
function pick(capCanvas: number): [FontName, number] {
  let best: [FontName, number] = ['hd20', 1], err = 1e9;
  for (const f of JERSEY) {
    if (!FONTS[f]) continue;
    const c = capH(f);
    for (let n = 1; n <= 8; n++) {
      // prefer the bigger cut at the same size (more detail per glyph), and slightly under over slightly over
      const d = c * n - capCanvas, e = Math.abs(d) / capCanvas + (d > 0 ? 0.02 : 0) - c * 0.002;
      if (e < err) { err = e; best = [f, n]; }
    }
  }
  return best;
}
export interface BigOpts { cap: number; color?: string; color2?: string; outline?: string | null; shadow?: string | null; align?: 'left' | 'center' | 'right'; alpha?: number }
function hdOf(ui: PixelUI) { return ui.hd || 1; }
/** width (UI px) bigText would draw */
export function bigMeasure(ui: PixelUI, str: string, o: BigOpts): number {
  if (!str) return 0;
  const hd = hdOf(ui), [f, n] = pick(o.cap * hd);
  const g = glyphs(str, { font: f, color: '#fff', outline: o.outline === undefined ? PAL.ink : o.outline, shadow: o.shadow === undefined ? PAL.ink2 : o.shadow });
  return ((g.w - (o.outline !== null ? 2 : 0) - (o.shadow !== null ? 1 : 0)) * n) / hd;
}
/** big crisp pixel text with its cap top at y (UI px); returns the drawn width in UI px */
export function bigText(ui: PixelUI, str: string, x: number, y: number, o: BigOpts): number {
  if (!str) return 0;
  const hd = hdOf(ui), [f, n] = pick(o.cap * hd);
  const outline = o.outline === undefined ? PAL.ink : o.outline, shadow = o.shadow === undefined ? PAL.ink2 : o.shadow;
  const g = glyphs(str, { font: f, color: o.color ?? PAL.text, color2: o.color2, outline, shadow });
  const tw = (g.w - (outline ? 2 : 0) - (shadow ? 1 : 0)) * n;
  const ctx = ui.ctx, m = ctx.getTransform();
  let dx = Math.round(m.a * x + m.e);
  if (o.align === 'center') dx = Math.round(dx - tw / 2);
  else if (o.align === 'right') dx = Math.round(dx - tw);
  const dy = Math.round(m.d * y + m.f);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  if (o.alpha !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, o.alpha));
  ctx.drawImage(g.cv, 0, 0, g.w, g.h, dx + g.ox * n, dy + g.oy * n, g.w * n, g.h * n);
  ctx.restore();
  return tw / hd;
}

// ------------------------------------------------------------------ plates
export type PlateKind = 'lacquer' | 'brass' | 'well' | 'cream' | 'ribbon' | 'glass' | 'disc';
type RGB = [number, number, number];
const hx = (s: string): RGB => { const v = parseInt(s.replace('#', '').slice(0, 6), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
class Px {
  d: Uint8ClampedArray; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData;
  constructor(public w: number, public h: number) {
    this.cv = document.createElement('canvas'); this.cv.width = Math.max(1, w); this.cv.height = Math.max(1, h);
    this.ctx = this.cv.getContext('2d')!; this.img = this.ctx.createImageData(this.cv.width, this.cv.height); this.d = this.img.data;
  }
  set(x: number, y: number, c: string | RGB, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = typeof c === 'string' ? hx(c) : c, i = (y * this.w + x) * 4;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: string, a = 255) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a); }
  done() { this.ctx.putImageData(this.img, 0, 0); return this.cv; }
}

export interface PlateOpts {
  /** rim base colour (a 6-tone ramp is built from it); default brass */
  rim?: string;
  /** face tone (lacquer / glass): default deep teal */
  face?: string;
  /** brass corner pieces + rivets (default on for lacquer when big enough) */
  corners?: boolean;
  /** rim width in px (default 2) */
  rimW?: number;
  /** face alpha 0..255 (glass) */
  alpha?: number;
}
const plateCache = new Map<string, HTMLCanvasElement>();
/** a painted plate canvas of exactly w x h UI px (cached) */
export function plate(w: number, h: number, kind: PlateKind = 'lacquer', o: PlateOpts = {}): HTMLCanvasElement {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
  const key = `${kind}|${w}|${h}|${o.rim ?? ''}|${o.face ?? ''}|${o.corners ?? ''}|${o.rimW ?? ''}|${o.alpha ?? ''}`;
  const hit = plateCache.get(key);
  if (hit) return hit;
  const p = new Px(w, h);
  const corner = (x: number, y: number) => (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
  if (kind === 'lacquer' || kind === 'glass') {
    const R = ramp(o.rim ?? PAL.brass), F = ramp(o.face ?? PAL.teal), rw = o.rimW ?? 2, A = o.alpha ?? (kind === 'glass' ? 215 : 255);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (corner(x, y)) continue;
      const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (dm === 0) { p.set(x, y, PAL.ink2); continue; }
      if (dm <= rw) {
        // the rim: lit top / left (the outer row brightest), shaded bottom / right
        const tl = (y === dm && x < w - 1 - dm) || (x === dm && y < h - 1 - dm);
        const outer = dm === 1;
        p.set(x, y, tl ? (outer ? R[5] : R[4]) : (outer ? R[2] : R[1]));
        continue;
      }
      if (dm === rw + 1) { p.set(x, y, y === rw + 1 && x > rw && x < w - rw - 1 ? F[0] : PAL.ink); continue; }
      // the face: a lit top row, two flat tones (upper third a touch lighter), a shadowed bottom row
      const fy = y - rw - 2, fh = h - 2 * (rw + 2);
      const c = fy === 0 ? F[4] : fy === fh - 1 ? F[1] : fy < fh * 0.38 ? F[3] : F[2];
      p.set(x, y, c, A);
    }
    // brass corner pieces (an L of brass with a rivet), only on plates big enough to carry them
    if ((o.corners ?? true) && w >= 40 && h >= 26) {
      const L = Math.min(8, Math.floor(Math.min(w, h) / 5));
      for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
        for (let i = 0; i < L; i++) for (let j = 0; j < 3; j++) {
          const lit = (sy > 0 && j === 0) || (sx > 0 && j === 0);
          p.set(cx + sx * (rw + 1 + i), cy + sy * (rw + 1 + j), j === 2 ? R[1] : lit ? R[4] : R[3]);
          p.set(cx + sx * (rw + 1 + j), cy + sy * (rw + 1 + i), j === 2 ? R[1] : lit ? R[4] : R[3]);
        }
        const rx = cx + sx * (rw + 2), ry = cy + sy * (rw + 2);
        p.set(rx, ry, R[5]); p.set(rx + 1, ry, R[3]); p.set(rx, ry + 1, R[3]); p.set(rx + 1, ry + 1, R[0]);
      }
    }
  } else if (kind === 'brass') {
    const R = ramp(o.rim ?? PAL.brass);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (corner(x, y)) continue;
      const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (dm === 0) { p.set(x, y, PAL.ink2); continue; }
      const fy = y / (h - 1);
      let c = fy < 0.2 ? R[4] : fy > 0.78 ? R[2] : R[3];
      if (y === 1) c = R[5];
      if (y === h - 2) c = R[1];
      if (x === 1) c = R[4];
      if (x === w - 2) c = R[1];
      p.set(x, y, c);
    }
    // a polished band and an engraved inner line
    if (h >= 10) for (let x = 3; x < w - 3; x++) { p.set(x, 3, R[2]); p.set(x, 4, R[5]); p.set(x, h - 4, R[2]); }
    if (w >= 24) for (const rx of [3, w - 5]) { p.set(rx, Math.floor(h / 2) - 1, R[5]); p.set(rx + 1, Math.floor(h / 2) - 1, R[3]); p.set(rx, Math.floor(h / 2), R[3]); p.set(rx + 1, Math.floor(h / 2), R[0]); }
  } else if (kind === 'well') {
    // a recessed window: dark top / left lip (in shadow), a lit bottom / right lip, a flat deep face
    const F = ramp(o.face ?? PAL.ink);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (corner(x, y)) continue;
      const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (dm === 0) { p.set(x, y, y === h - 1 || x === w - 1 ? PAL.teal2 : PAL.ink2); continue; }
      if (dm === 1 && (y === 1 || x === 1)) { p.set(x, y, '#03070b'); continue; }
      p.set(x, y, y < h * 0.45 ? F[2] : F[3], o.alpha ?? 255);
    }
  } else if (kind === 'cream') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (corner(x, y)) continue;
      const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (dm === 0) { p.set(x, y, '#3a2410'); continue; }
      const c = y === 1 ? PAL.paper : y >= h - 3 ? PAL.cream1 : x === 1 ? PAL.paper : x === w - 2 ? PAL.cream1 : PAL.cream;
      p.set(x, y, c);
    }
    // one hand-placed fold line across the card
    if (w > 60) { const fx = Math.round(w * 0.62); for (let y = 2; y < h - 3; y++) { p.set(fx, y, PAL.cream1); p.set(fx + 1, y, PAL.paper); } }
  } else if (kind === 'disc') {
    // a round medallion: ink outline, a brass rim lit top-left, a flat face (two tones)
    const R = ramp(o.rim ?? PAL.brass), F = ramp(o.face ?? PAL.teal);
    const cx = (w - 1) / 2, cy = (h - 1) / 2, r = Math.min(w, h) / 2 - 0.5, rw = o.rimW ?? Math.max(1, Math.round(r / 6));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d > r) continue;
      if (d > r - 1) { p.set(x, y, PAL.ink2); continue; }
      const lit = dx + dy < 0;
      if (d > r - 1 - rw) { p.set(x, y, lit ? R[4] : R[1]); continue; }
      if (d > r - 2 - rw) { p.set(x, y, PAL.ink); continue; }
      p.set(x, y, dy < -r * 0.25 ? F[3] : F[2]);
    }
  } else if (kind === 'ribbon') {
    // a title banner: a cloth band with swallow-tailed ends folded behind
    const R = ramp(o.rim ?? '#a8323a');
    const tail = Math.min(10, Math.floor(h * 0.6));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fy = y / (h - 1);
      // swallow tails at both ends
      const notch = Math.abs(fy - 0.5) * 2; // 0 middle .. 1 edges
      const inL = x >= tail * (1 - notch) * 0.7, inR = w - 1 - x >= tail * (1 - notch) * 0.7;
      if (!inL || !inR) continue;
      const end = x < tail || x > w - 1 - tail;
      const edge = y === 0 || y === h - 1 || !(x - 1 >= tail * (1 - notch) * 0.7) || !(w - 2 - x >= tail * (1 - notch) * 0.7);
      if (edge) { p.set(x, y, PAL.ink2); continue; }
      let c = fy < 0.18 ? R[4] : fy > 0.8 ? R[1] : R[3];
      if (y === 1) c = R[5];
      if (end) c = fy < 0.18 ? R[2] : fy > 0.8 ? R[0] : R[1];
      if (x === tail || x === w - 1 - tail) c = PAL.ink;
      p.set(x, y, c);
    }
    // stitched hems
    for (let x = tail + 3; x < w - tail - 3; x += 3) { p.set(x, 3, R[5]); p.set(x, h - 4, R[2]); }
  }
  const cv = p.done();
  plateCache.set(key, cv);
  if (plateCache.size > 600) plateCache.clear();
  return cv;
}

/** a flat colour canvas (stretch it: backdrops drawn as planes UNDER a panel's 3D pieces) */
const solidCache = new Map<string, HTMLCanvasElement>();
export function solid(col: string): HTMLCanvasElement {
  let c = solidCache.get(col);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d')!; x.fillStyle = col; x.fillRect(0, 0, 2, 2); solidCache.set(col, c); }
  return c;
}

// ------------------------------------------------------------------ bars
export interface BarOpts {
  /** fill colour (a ramp is built from it) */
  col: string;
  /** the pale "just lost" chip, 0..1 (>= v) */
  chip?: number;
  /** 0..1 whole-fill flash (white) */
  flash?: number;
  /** tick marks every `ticks` fraction (e.g. 0.25) */
  ticks?: number;
  /** a dark trough colour */
  back?: string;
  /** a pale "gain preview" segment up to this (>= v) */
  gain?: number;
  gainCol?: string;
}
/** a crisp banded bar: ink frame, trough, the fill in three tones, a chip, ticks (UI px) */
export function bar(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, o: BarOpts) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const R = ramp(o.col);
  ui.fill(x, y, w, h, PAL.ink2);
  ui.fill(x + 1, y + 1, w - 2, h - 2, o.back ?? '#0a1820');
  ui.fill(x + 1, y + h - 2, w - 2, 1, '#13262e');
  const iw = w - 2, ih = h - 2;
  const fv = Math.round(iw * Math.max(0, Math.min(1, v)));
  if (o.gain !== undefined && o.gain > v) { const gw = Math.round(iw * Math.min(1, o.gain)); ui.fill(x + 1 + fv, y + 1, gw - fv, ih, o.gainCol ?? PAL.brass2, 0.75); }
  if (o.chip !== undefined && o.chip > v) { const cw = Math.round(iw * Math.min(1, o.chip)); ui.fill(x + 1 + fv, y + 1, cw - fv, ih, PAL.cream, 0.9); }
  if (fv > 0) {
    ui.fill(x + 1, y + 1, fv, ih, R[3]);
    if (ih >= 3) { ui.fill(x + 1, y + 1, fv, 1, R[5]); ui.fill(x + 1, y + 1 + ih - 1, fv, 1, R[1]); }
    if (ih >= 6) ui.fill(x + 1, y + 2, fv, Math.max(1, Math.floor(ih * 0.3)) - 1, R[4]);
    // the leading edge
    if (fv < iw) ui.fill(x + fv, y + 1, 1, ih, R[5]);
  }
  if (o.ticks) for (let t = o.ticks; t < 0.999; t += o.ticks) ui.fill(x + 1 + Math.round(iw * t), y + 1, 1, ih, PAL.ink2, 0.55);
  if (o.flash && o.flash > 0) ui.fill(x + 1, y + 1, Math.max(fv, 1), ih, '#ffffff', Math.min(1, o.flash) * 0.8);
}

/** a tiny painted glyph from rows ('k' ink, 'w' white, 'b' brass, ...), cached, for labels like the house mark */
const glyphCache = new Map<string, HTMLCanvasElement>();
export function pixGlyph(name: string, rows: string[], pal: Record<string, string>): HTMLCanvasElement {
  let c = glyphCache.get(name);
  if (c) return c;
  const p = new Px(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const col = pal[r[x]]; if (col) p.set(x, y, col); } });
  c = p.done(); glyphCache.set(name, c);
  return c;
}
export const GLYPH = {
  house: () => pixGlyph('house', ['....k....', '...kbk...', '..kbbbk..', '.kbbbbbk.', 'kkbbbbbkk', '.kbkkkbk.', '.kbkwkbk.', '.kbkwkbk.', '.kkkkkkk.'], { k: PAL.ink2, b: PAL.cream, w: PAL.brass2 }),
  down: () => pixGlyph('down', ['kkkkkkk', 'kbbbbbk', '.kbbbk.', '..kbk..', '...k...'], { k: PAL.ink2, b: PAL.sea2 }),
  skull: () => pixGlyph('skull', ['.kkkkk.', 'kwwwwwk', 'kwkwkwk', 'kwwwwwk', '.kwkwk.', '..kkk..'], { k: PAL.ink2, w: PAL.cream }),
  clock: () => pixGlyph('clock', ['..kkk..', '.kwwwk.', 'kwwkwwk', 'kwwkkwk', 'kwwwwwk', '.kwwwk.', '..kkk..'], { k: PAL.ink2, w: PAL.cream }),
  fish: () => pixGlyph('fish', ['...kkk...k', '.kkwwwk.kk', 'kwkwwwwkwk', 'kwwwwwwwwk', '.kkwwwk.kk', '...kkk...k'], { k: PAL.ink2, w: PAL.sea2 }),
  star: () => pixGlyph('star', ['...k...', '..kwk..', 'kkwwwkk', '.kwwwk.', '.kwkwk.', 'kk...kk'], { k: PAL.ink2, w: PAL.brass2 }),
  check: () => pixGlyph('check', ['......kk', '.....kgk', 'kk..kgk.', 'kgkkgk..', '.kggk...', '..kk....'], { k: PAL.ink2, g: PAL.kelp2 }),
  parcel: () => pixGlyph('parcel', ['kkkkkkkkk', 'kbbbrbbbk', 'kbbbrbbbk', 'krrrrrrrk', 'kbbbrbbbk', 'kbbbrbbbk', 'kkkkkkkkk'], { k: PAL.ink2, b: '#c8a070', r: PAL.coral }),
  parcelOff: () => pixGlyph('parcelOff', ['k.k.k.k.k', '.........', 'k.......k', '.........', 'k.......k', '.........', 'k.k.k.k.k'], { k: '#6fb8b0' }),
};
