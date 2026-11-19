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

export type FontName = 'body' | 'small' | 'tiny' | 'title' | 'fancy' | 'big' | 'hd10' | 'hd15' | 'hd20';

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

/**
 * The bundled pixel fonts at their TRUE native sizes: the px size where one font pixel lands on exactly one canvas
 * pixel (measured: zero partially-covered pixels when rasterised). Any other size makes the thresholding below
 * drop or double whole columns, which is what made v2 text look smushed (m6x11plus was drawn at 16 px; its grid
 * is 18 px). These CLASSIC faces are what unregistered canvases (3D textures, sprites, signs) get:
 *   body   m6x11plus 18   cap 11        small / tiny   m5x7 16   cap 7
 *   title  Alagard 16     cap 11        big            Alagard 32 (exact 2x)
 *
 * v5 SCREEN fonts (the "diver's kit"): a PixelUI canvas draws every role in Jersey (OFL) -- never Alagard -- at an
 * INTEGER glyph scale chosen per canvas density (`hd`, canvas px per UI px), so the glyphs are always crisp and each
 * role keeps (almost) the same footprint in UI px at every window size. The UI is ~360 UI px tall (UI_TARGET_H):
 *
 *   role    cap (UI px)  line (UI px)  hd 1 (tiny window)  hd 2 (720p, 1440p)   hd 3 (1080p, 4K)
 *   small   7.5          11            Jersey10 x1 (7)     Jersey15 x1 (7.5)    Jersey20 x1 (6.7)
 *   tiny    = small
 *   body    10           14            Jersey10 x1 (7)     Jersey20 x1 (10)     Jersey15 x2 (10)
 *   title   15           20            Jersey15, one font px = one UI px at every density (chunky headings, numbers)
 *   big     20           26            Jersey20, one font px = one UI px (splash words, the biggest numbers)
 *
 * Line heights are FIXED per role in UI px so layouts are identical everywhere; widths vary by up to ~12% between
 * densities (1080p is the narrowest), so lay out against 1280x720 and test both.
 */
export const FONTS: Record<FontName, PxFont> = {
  body: def('M6x11', 18),
  small: def('M5x7', 16),
  tiny: def('M5x7', 16),
  title: def('Alagard', 16),
  fancy: def('Alagard', 16),
  big: def('Alagard', 32),
  // Jersey 10 / 15 / 20 (Sarah Cadigan-Fried, OFL) at their exact native sizes (cap 7 / 15 / 20 px)
  hd10: def('Jersey10', 56 / 3),
  hd15: def('Jersey15', 27),
  hd20: def('Jersey20', 34),
};

type Face = 'hd10' | 'hd15' | 'hd20';
/** role -> [face, glyph scale in canvas px] per canvas density (index = hd, 1..6) */
const SCREEN: Record<'small' | 'body' | 'title' | 'big', [Face, number][]> = {
  //        hd0 (unused) hd1          hd2           hd3           hd4           hd5           hd6
  small: [['hd10', 1], ['hd10', 1], ['hd15', 1], ['hd20', 1], ['hd15', 2], ['hd15', 2], ['hd15', 3]],
  body: [['hd10', 1], ['hd10', 1], ['hd20', 1], ['hd15', 2], ['hd20', 2], ['hd20', 2], ['hd20', 3]],
  title: [['hd15', 1], ['hd15', 1], ['hd15', 2], ['hd15', 3], ['hd15', 4], ['hd15', 5], ['hd15', 6]],
  big: [['hd20', 1], ['hd20', 1], ['hd20', 2], ['hd20', 3], ['hd20', 4], ['hd20', 5], ['hd20', 6]],
};
/** fixed line heights per role on a PixelUI canvas (UI px) */
const ROLE_LH: Record<'small' | 'body' | 'title' | 'big', number> = { small: 11, body: 14, title: 20, big: 26 };
function roleOf(font: FontName): 'small' | 'body' | 'title' | 'big' {
  switch (font) {
    case 'small': case 'tiny': case 'hd10': case 'hd15': return 'small';
    case 'title': case 'fancy': return 'title';
    case 'big': return 'big';
    default: return 'body';
  }
}
/** the face and integer glyph scale a role is drawn with on a canvas of this density (hd 0 = unregistered) */
function spec(font: FontName, hd: number): { face: FontName; k: number } {
  if (!hd) return { face: font, k: 1 };
  const r = SCREEN[roleOf(font)][Math.min(6, Math.max(1, Math.round(hd)))];
  return { face: r[0], k: r[1] };
}

/**
 * Text density per canvas: PixelUI registers its context with its `hd` (canvas px per UI px). Unregistered canvases
 * (3D textures, sprites) keep the classic fonts at 1:1.
 */
const density = new WeakMap<CanvasRenderingContext2D, number>();
export function setTextDensity(ctx: CanvasRenderingContext2D, hd: number) { density.set(ctx, hd); }
/** the face actually used for a role on a canvas of this density (0 = unregistered) */
export function screenFont(font: FontName = 'body', hd = 0): FontName { return spec(font, hd).face; }

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

export function measure(str: string, font: FontName = 'body', hd = 0): number {
  if (!str) return 0;
  if (hd) { const sp = spec(font, hd); return (measure(str, sp.face) * sp.k) / hd; }
  const f = fontOf(font);
  meas.font = `${f.px}px '${f.family}'`;
  return Math.ceil(meas.measureText(str).width) + f.track * Math.max(0, str.length - 1);
}
export function lineH(font: FontName = 'body', hd = 0) { if (!calibrated) calibrateFonts(); return hd ? ROLE_LH[roleOf(font)] : fontOf(font).lh; }
export function capH(font: FontName = 'body', hd = 0) { if (!calibrated) calibrateFonts(); if (!hd) return fontOf(font).cap; const sp = spec(font, hd); return (fontOf(sp.face).cap * sp.k) / hd; }

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
export function glyphs(str: string, o: TextOpts = {}, sd = 1): Glyphs {
  const font = o.font ?? 'body';
  const key = [str, font, o.color, o.color2, o.shadow, o.outline, sd].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const mk = mask(str, font);
  const pad = o.outline ? 1 : 0;
  const sh = o.shadow ? sd : 0;
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
    if (oc && (on(gx - 1, gy) || on(gx + 1, gy) || on(gx, gy - 1) || on(gx, gy + 1) || on(gx - 1, gy - 1) || on(gx + 1, gy - 1) || on(gx - 1, gy + 1) || on(gx + 1, gy + 1))) { put(x, y, oc); continue; }
    if (sc) {
      const sx = gx - sd, sy = gy - sd;
      const hitS = on(sx, sy) || (oc && (on(sx - 1, sy) || on(sx + 1, sy) || on(sx, sy - 1) || on(sx, sy + 1) || on(sx - 1, sy - 1) || on(sx + 1, sy - 1) || on(sx - 1, sy + 1) || on(sx + 1, sy + 1)));
      if (hitS) put(x, y, sc);
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { cv, w, h, ox: -pad, oy: -pad };
  cache.set(key, out);
  if (cache.size > 2500) cache.clear();
  return out;
}

/**
 * Light text with no shadow/outline given gets an automatic 1 px drop shadow in a deep shade of its own hue, so
 * it always separates from busy 3D behind it (pass shadow: null to opt out). Dark text (on paper) gets none.
 */
function withAutoShadow(o: TextOpts): TextOpts {
  if (o.shadow !== undefined || o.outline !== undefined) return o;
  const [r, g, b] = rgba(o.color ?? '#ffffff');
  if (r * 0.3 + g * 0.55 + b * 0.15 < 120) return o;
  const k = 0.16;
  const sh = '#' + [r, g, b].map((v) => Math.round(v * k + 6).toString(16).padStart(2, '0')).join('');
  return { ...o, shadow: sh };
}

/** draw text with its cap top at y; returns the drawn width (UI px on a PixelUI canvas) */
export function drawText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts = {}): number {
  if (!str) return 0;
  const hd = density.get(ctx);
  if (hd) {
    // a screen font: rasterise at the face's native size, then blit at an integer glyph scale k onto the canvas
    // (map the UI position through the current transform, draw untransformed), so every glyph pixel is k x k
    // canvas pixels. The drop shadow is ~1 UI px whatever k is.
    const sp = spec(o.font ?? 'body', hd);
    const o2 = withAutoShadow({ ...o, font: sp.face });
    const sd = o2.shadow ? Math.max(1, Math.floor(hd / sp.k)) : 1;
    const g = glyphs(str, o2, sd);
    const twF = g.w - (o2.outline ? 2 : 0) - (o2.shadow ? sd : 0);
    const tw = (twF * sp.k) / hd;
    let ux = x;
    if (o.align === 'center') ux = x - tw / 2; else if (o.align === 'right') ux = x - tw;
    const m = ctx.getTransform();
    const X = Math.round(m.a * Math.round(ux) + m.e) + g.ox * sp.k, Y = Math.round(m.d * Math.round(y) + m.f) + g.oy * sp.k;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha *= Math.max(0, o.alpha);
    ctx.drawImage(g.cv, X, Y, g.w * sp.k, g.h * sp.k);
    ctx.restore();
    return tw;
  }
  return drawText1(ctx, str, x, y, o);
}
function drawText1(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts): number {
  o = withAutoShadow(o);
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
export function wrap(str: string, font: FontName, maxW: number, hd = 0): string[] {
  const out: string[] = [];
  for (const para of str.split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (measure(t, font, hd) > maxW && cur) { out.push(cur); cur = word; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}
