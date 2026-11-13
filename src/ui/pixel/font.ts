// Crisp pixel-font text for the 2D pixel UI. Glyphs are rasterised once per string at the font's native pixel
// size, thresholded to hard on/off pixels (never anti-aliased), then cached as small canvases per colour /
// outline / shadow combination and blitted at integer coordinates.
//
//   drawText(ctx, 'NEW RUN', x, y, { font: 'title', color: '#ffe07a', shadow: '#0008' })   -> width in px
//   measure('Copper Nugget', 'body')       width in px (no outline)
//   wrap(longText, 'body', 120)            lines that fit
//   FONTS.body.lh                          line height in px
//
// `y` is the top of the cap height, so text lines up with boxes regardless of the font's internal metrics.

export type FontName = 'body' | 'small' | 'tiny' | 'title' | 'fancy' | 'big';

export interface PxFont {
  family: string;
  px: number;
  /** pixels from the canvas top (at baseline y = px) to the cap top, measured at runtime */
  capTop: number;
  /** cap height in px */
  cap: number;
  /** descender depth below the baseline */
  desc: number;
  /** line height */
  lh: number;
  /** extra letter spacing (px) */
  track: number;
}

const def = (family: string, px: number, track = 0): PxFont => ({ family, px, capTop: 0, cap: Math.round(px * 0.6), desc: 2, lh: px, track });

/** the bundled pixel fonts at their native (1:1) sizes */
export const FONTS: Record<FontName, PxFont> = {
  body: def('M6x11', 16),     // m6x11plus: the workhorse
  small: def('M5x7', 16),     // m5x7: compact labels, counts
  tiny: def('M5x7', 16),      // compact labels on cards (m5x7: chunkier and more readable than Tiny5)
  title: def('Alagard', 16),  // Alagard: headings, numbers
  fancy: def('Jacquard', 24), // Jacquard 24: big blackletter names
  big: def('Alagard', 32),    // Alagard x2 for splash titles
};

let calibrated = false;
const meas = (() => { const c = document.createElement('canvas'); c.width = c.height = 4; return c.getContext('2d')!; })();

/** measure each font's cap top / height / descent by rasterising 'H' and 'g' (call after fonts load) */
export function calibrateFonts() {
  for (const f of Object.values(FONTS)) {
    const W = f.px * 3, H = f.px * 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.font = `${f.px}px '${f.family}'`; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
    const rows = (s: string) => {
      x.clearRect(0, 0, W, H); x.fillText(s, 2, f.px);
      const d = x.getImageData(0, 0, W, H).data;
      let top = H, bot = -1;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (d[(yy * W + xx) * 4 + 3] > 127) { top = Math.min(top, yy); bot = Math.max(bot, yy); }
      return [top, bot];
    };
    const [ht, hb] = rows('H');
    const [, gb] = rows('gjpqy');
    if (hb >= 0) {
      f.capTop = ht; f.cap = hb - ht + 1; f.desc = Math.max(1, gb - hb);
      f.lh = f.cap + f.desc + Math.max(2, Math.round(f.cap * 0.25));
    }
  }
  calibrated = true;
  cache.clear();
}

export interface TextOpts {
  font?: FontName;
  color?: string;
  /** 1 px drop shadow down-right */
  shadow?: string | null;
  /** 1 px outline (4-neighbour) */
  outline?: string | null;
  align?: 'left' | 'center' | 'right';
  /** optional second colour: the lower half of the glyphs (stepped two-tone like old console fonts) */
  color2?: string;
  alpha?: number;
}

interface Glyphs { cv: HTMLCanvasElement; w: number; h: number; ox: number; oy: number }
const cache = new Map<string, Glyphs>();
const masks = new Map<string, { m: Uint8Array; w: number; h: number }>();

function fontOf(n: FontName | undefined) { return FONTS[n ?? 'body']; }

export function measure(str: string, font: FontName = 'body'): number {
  if (!str) return 0;
  const f = fontOf(font);
  meas.font = `${f.px}px '${f.family}'`;
  return Math.ceil(meas.measureText(str).width) + f.track * Math.max(0, str.length - 1);
}
export function lineH(font: FontName = 'body') { if (!calibrated) calibrateFonts(); return fontOf(font).lh; }
export function capH(font: FontName = 'body') { if (!calibrated) calibrateFonts(); return fontOf(font).cap; }

/** hard-pixel glyph mask for a string; row 0 is the cap top */
function mask(str: string, font: FontName) {
  const key = font + '|' + str;
  const hit = masks.get(key);
  if (hit) return hit;
  if (!calibrated) calibrateFonts();
  const f = fontOf(font);
  const w = Math.max(1, measure(str, font) + 2);
  const h = f.cap + f.desc + 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h + 4;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.font = `${f.px}px '${f.family}'`; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
  // baseline lands at row cap (cap top at row 0), +2 rows headroom for accents we then drop
  const by = f.cap + 2;
  if (f.track) { let cx = 0; for (const ch of str) { x.fillText(ch, cx, by); cx += Math.ceil(x.measureText(ch).width) + f.track; } }
  else x.fillText(str, 0, by);
  const d = x.getImageData(0, 2, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  const out = { m, w, h };
  masks.set(key, out);
  if (masks.size > 3000) masks.clear();
  return out;
}

function rgba(c: string): [number, number, number, number] {
  let s = c.replace('#', '');
  if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
}

/** a coloured, outlined, shadowed text canvas (cached) */
export function glyphs(str: string, o: TextOpts = {}): Glyphs {
  const font = o.font ?? 'body';
  const key = [str, font, o.color, o.color2, o.shadow, o.outline].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const mk = mask(str, font);
  const pad = o.outline ? 1 : 0;
  const sh = o.shadow ? 1 : 0;
  const w = mk.w + pad * 2 + sh, h = mk.h + pad * 2 + sh;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const D = img.data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < mk.w && y < mk.h && mk.m[y * mk.w + x] === 1;
  const put = (x: number, y: number, c: [number, number, number, number]) => { const i = (y * w + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = c[3]; };
  const col = rgba(o.color ?? '#ffffff'), col2 = o.color2 ? rgba(o.color2) : col;
  const oc = o.outline ? rgba(o.outline) : null, sc = o.shadow ? rgba(o.shadow) : null;
  const half = Math.ceil(fontOf(font).cap * 0.55);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = x - pad, gy = y - pad;
    if (on(gx, gy)) { put(x, y, gy >= half ? col2 : col); continue; }
    if (oc && (on(gx - 1, gy) || on(gx + 1, gy) || on(gx, gy - 1) || on(gx, gy + 1))) { put(x, y, oc); continue; }
    if (sc) {
      const sx = gx - 1, sy = gy - 1;
      const hitS = on(sx, sy) || (oc && (on(sx - 1, sy) || on(sx + 1, sy) || on(sx, sy - 1) || on(sx, sy + 1)));
      if (hitS) put(x, y, sc);
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { cv, w, h, ox: -pad, oy: -pad };
  cache.set(key, out);
  if (cache.size > 2500) cache.clear();
  return out;
}

/** draw text with its cap top at y; returns the drawn width */
export function drawText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts = {}): number {
  if (!str) return 0;
  const g = glyphs(str, o);
  const tw = g.w - (o.outline ? 2 : 0) - (o.shadow ? 1 : 0);
  let dx = Math.round(x);
  if (o.align === 'center') dx = Math.round(x - tw / 2);
  else if (o.align === 'right') dx = Math.round(x - tw);
  if (o.alpha !== undefined && o.alpha < 1) { const a = ctx.globalAlpha; ctx.globalAlpha = a * o.alpha; ctx.drawImage(g.cv, dx + g.ox, Math.round(y) + g.oy); ctx.globalAlpha = a; }
  else ctx.drawImage(g.cv, dx + g.ox, Math.round(y) + g.oy);
  return tw;
}

/** greedy word wrap to maxW pixels (explicit \n respected) */
export function wrap(str: string, font: FontName, maxW: number): string[] {
  const out: string[] = [];
  for (const para of str.split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (measure(t, font) > maxW && cur) { out.push(cur); cur = word; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}
