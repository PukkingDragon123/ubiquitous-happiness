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

/** v8b: the deep-ink kit palette under the v5 names (see src/ui/pixel/skins.ts for the guide) */
export const PAL = {
  ink: '#0b111c', ink2: '#070b12',
  teal0: '#0e141f', teal: '#131b28', teal1: '#1a2434', teal2: '#3e4b62',
  brass0: '#3d2f17', brass1: '#8a7044', brass: '#b8975a', brass2: '#d4b273', glint: '#efe1bd',
  cream: '#e8dfcb', cream1: '#cdc4ae', cream2: '#a69d8a', paper: '#f6f0e2',
  kelp: '#7c9e80', kelp1: '#4b6a52', kelp2: '#a9c9a6',
  coral: '#c4553f', coral1: '#5a231b', coral2: '#e48a74',
  sea: '#5f80b0', sea1: '#34507a', sea2: '#a9c0e0',
  text: '#e8dfcb', dim: '#9aa3b4',
};

// ------------------------------------------------------------------ big text
/** v8b: big text is Alagard 16 blown up by the integer k whose cap (11 font px) is nearest the asked cap */
function pick(capCanvas: number): [FontName, number] {
  const c = Math.max(1, capH('body'));
  return ['body', Math.max(1, Math.round(capCanvas / c))];
}
void FONTS;
export interface BigOpts { cap: number; color?: string; color2?: string; outline?: string | null; shadow?: string | null; align?: 'left' | 'center' | 'right'; alpha?: number }
function hdOf(ui: PixelUI) { return ui.hd || 1; }
/** (v8b: no outline unless asked; a 1 font px ink drop shadow) */
const outOf = (o: BigOpts) => (o.outline === undefined ? null : o.outline);
const shOf = (o: BigOpts) => (o.shadow === undefined ? PAL.ink2 : o.shadow);
/** width (UI px) bigText would draw */
export function bigMeasure(ui: PixelUI, str: string, o: BigOpts): number {
  if (!str) return 0;
  const hd = hdOf(ui), [f, n] = pick(o.cap * hd);
  const outline = outOf(o), shadow = shOf(o);
  const g = glyphs(str, { font: f, color: '#fff', outline, shadow });
  return ((g.w - (outline ? 2 : 0) - (shadow ? 1 : 0)) * n) / hd;
}
/** big crisp pixel text with its cap top at y (UI px); returns the drawn width in UI px */
export function bigText(ui: PixelUI, str: string, x: number, y: number, o: BigOpts): number {
  if (!str) return 0;
  const hd = hdOf(ui), [f, n] = pick(o.cap * hd);
  const outline = outOf(o), shadow = shOf(o);
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
// Every plate is painted per pixel at its exact size in a few flat tones. The DETAIL is structured and placed on
// purpose, never noise: engraved grooves (a dark line over a light one), milgrain beads, slotted screws, worn edges
// where hands would rub, verdigris only in recesses, a fixed set of scratches, glass streaks, stitched hems.
export type PlateKind = 'lacquer' | 'brass' | 'well' | 'cream' | 'ribbon' | 'glass' | 'disc' | 'nameplate' | 'logbook' | 'iron' | 'board' | 'sign' | 'drum' | 'alcove';
type RGB = [number, number, number];
const hx = (s: string): RGB => { const v = parseInt(s.replace('#', '').slice(0, 6), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
export class Px {
  d: Uint8ClampedArray; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData;
  constructor(public w: number, public h: number) {
    this.cv = document.createElement('canvas'); this.cv.width = Math.max(1, w); this.cv.height = Math.max(1, h);
    this.ctx = this.cv.getContext('2d')!; this.img = this.ctx.createImageData(this.cv.width, this.cv.height); this.d = this.img.data;
  }
  set(x: number, y: number, c: string | RGB, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = typeof c === 'string' ? hx(c) : c, i = (y * this.w + x) * 4;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a;
  }
  /** set only where something is already painted */
  over(x: number, y: number, c: string) { if (this.a(x, y) > 0) this.set(x, y, c, this.a(x, y)); }
  a(x: number, y: number) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  rect(x: number, y: number, w: number, h: number, c: string, a = 255) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a); }
  hline(x0: number, x1: number, y: number, c: string) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x: number, y0: number, y1: number, c: string) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  /** an engraved groove: a dark line with a lit line under / right of it */
  grooveH(x0: number, x1: number, y: number, dark: string, lit: string) { this.hline(x0, x1, y, dark); this.hline(x0 + 1, x1, y + 1, lit); }
  grooveV(x: number, y0: number, y1: number, dark: string, lit: string) { this.vline(x, y0, y1, dark); this.vline(x + 1, y0 + 1, y1, lit); }
  /** a slotted screw head (5x5): ink rim, domed brass lit top-left, a slot at an angle */
  screw(cx: number, cy: number, R: string[], slot = 0) {
    const m = ['.kkk.', 'kabbk', 'kbbck', 'kbccK', '.kKK.'];
    const pal: Record<string, string> = { k: PAL.ink2, K: PAL.ink2, a: R[5], b: R[4], c: R[2] };
    m.forEach((r, y) => { for (let x = 0; x < 5; x++) { const c = pal[r[x]]; if (c) this.set(cx - 2 + x, cy - 2 + y, c); } });
    const sl = [[[-1, 1], [0, 0], [1, -1]], [[-1, 0], [0, 0], [1, 0]], [[0, -1], [0, 0], [0, 1]]][slot % 3];
    for (const [dx, dy] of sl) this.set(cx + dx, cy + dy, R[0]);
  }
  /** a round rivet (3x3) */
  rivet(cx: number, cy: number, R: string[]) { this.set(cx - 1, cy - 1, R[5]); this.set(cx, cy - 1, R[4]); this.set(cx - 1, cy, R[4]); this.set(cx, cy, R[3]); this.set(cx + 1, cy, R[1]); this.set(cx, cy + 1, R[1]); this.set(cx + 1, cy + 1, R[0]); }
  done() { this.ctx.putImageData(this.img, 0, 0); return this.cv; }
}
/** deterministic 0..1 from integers (where a scratch / chip / stain goes: placed by rule, the same every time) */
export const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
export const VERDI = ['#2f5a4e', '#4a8a76', '#78b49a'];

export interface PlateOpts {
  /** rim base colour (a 6-tone ramp is built from it); default brass */
  rim?: string;
  /** face tone (lacquer / glass): default deep teal */
  face?: string;
  /** brass corner pieces + screws (default on for lacquer when big enough) */
  corners?: boolean;
  /** rim width in px (default 3) */
  rimW?: number;
  /** face alpha 0..255 (glass) */
  alpha?: number;
  /** board: x positions (px) of rope lashings round the planks */
  rope?: number[];
  /** board: barnacle clusters on the corners (default on when big enough) */
  barnacles?: boolean;
  /** board: plank height in px (default 13) */
  plank?: number;
  /** board: algae and moss growing along the bottom edge and up the seams (default on when big enough) */
  algae?: boolean;
}
const plateCache = new Map<string, HTMLCanvasElement>();
/** a painted plate canvas of exactly w x h UI px (cached) */
export function plate(w: number, h: number, kind: PlateKind = 'lacquer', o: PlateOpts = {}): HTMLCanvasElement {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
  const key = `${kind}|${w}|${h}|${o.rim ?? ''}|${o.face ?? ''}|${o.corners ?? ''}|${o.rimW ?? ''}|${o.alpha ?? ''}|${o.rope?.join(',') ?? ''}|${o.barnacles ?? ''}|${o.plank ?? ''}|${o.algae ?? ''}`;
  const hit = plateCache.get(key);
  if (hit) return hit;
  const p = new Px(w, h);
  // v8b: every plate is the kit's flat look (a face, a 1 px border, softened corners); the v6 painters below stay
  // for reference / other callers but plate() no longer uses them
  if (FLAT) { const cv = flatPlate(p, w, h, kind, o); plateCache.set(key, cv); if (plateCache.size > 600) plateCache.clear(); return cv; }
  const PAINT: Record<PlateKind, () => void> = {
    // v5 ocean + woody: the instrument plates are DRIFTWOOD boards now ('lacquer' kept as the name callers use)
    lacquer: () => paintBoard(p, o), board: () => paintBoard(p, o), glass: () => paintLacquer(p, o, true), brass: () => paintBrass(p, o),
    well: () => paintWell(p, o), cream: () => paintCream(p), disc: () => paintDisc(p, o), ribbon: () => paintRibbon(p, o),
    nameplate: () => paintNameplate(p, o), logbook: () => paintSign(p, o), sign: () => paintSign(p, o),
    iron: () => paintBoard(p, { ...o, face: o.face ?? '#9a3a30', wood: '#6a4a32' } as PlateOpts),
    drum: () => paintDrum(p, o), alcove: () => paintAlcove(p, o),
  };
  PAINT[kind]();
  const cv = p.done();
  plateCache.set(key, cv);
  if (plateCache.size > 600) plateCache.clear();
  return cv;
}

const FLAT = true;
/** the flat plate (v8b): kinds map onto the kit's surfaces */
function flatPlate(p: Px, w: number, h: number, kind: PlateKind, o: PlateOpts): HTMLCanvasElement {
  let face = '#131b28', border = '#3e4b62', fa = 245;
  switch (kind) {
    case 'brass': face = '#d4b273'; border = '#8a7044'; fa = 255; break;
    case 'cream': face = '#ddd3bd'; border = '#8f8572'; fa = 255; break;
    case 'well': case 'drum': case 'alcove': face = o.face && o.face !== '#2a1a0c' ? '#0e141f' : '#0e141f'; border = '#222c3e'; fa = 240; break;
    case 'ribbon': border = '#d4b273'; break;
    case 'nameplate': border = '#c4553f'; break;
    case 'glass': fa = o.alpha ?? 200; break;
    default: break;
  }
  if (o.rim && kind !== 'brass') border = o.rim === '#c8913a' ? '#3e4b62' : o.rim;
  if (kind === 'disc') {
    const r = Math.min(w, h) / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2);
      if (d > r) continue;
      p.set(x, y, d > r - 1 ? border : face, d > r - 1 ? 255 : fa);
    }
    return p.done();
  }
  p.rect(0, 0, w, h, face, fa);
  p.hline(0, w - 1, 0, border); p.hline(0, w - 1, h - 1, border); p.vline(0, 0, h - 1, border); p.vline(w - 1, 0, h - 1, border);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.set(x, y, '#000000', 0);
  return p.done();
}

/** rounded-rect distance to the edge (-1 outside; corners cut by r px) */
function edgeD(x: number, y: number, w: number, h: number, r = 2) {
  const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
  if (dx + dy < r - 0) return -1;
  if (dx + dy === r) return 0;
  return Math.min(dx, dy);
}

// ------------------------------------------------------------------ driftwood, rope, nails, barnacles, shells
const WOOD = '#9a7a58';
/** a barnacle seen from above: a cream cone with ridges, a dark mouth (7 px big / 5 px small) */
export function barnacle(p: Px, cx: number, cy: number, big = true) {
  const rows = big
    ? ['..kkk..', '.kwwlk.', 'kwlrlsk', 'kwrddsk', 'klldssk', '.kssak.', '..kkk..']
    : ['.kkk.', 'kwlsk', 'kldsk', 'klssk', '.kkk.'];
  const pal: Record<string, string> = { k: '#3a3328', w: '#f6eedc', l: '#d8cdb0', r: '#ece2c8', s: '#a89c80', a: '#8a7e64', d: '#241c14' };
  const o = big ? 3 : 2;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) p.set(cx - o + x, cy - o + y, c); } });
}
/** a scallop shell: a fan with ribs, pink-cream, an ink edge (9x8) */
export function shell(p: Px, cx: number, cy: number) {
  const rows = ['...kkk...', '..kwpwk..', '.kwpwpwk.', 'kpwpwpwpk', 'kwpwpwpwk', '.kpwpwpk.', '..kkkkk..', '..kpkpk..'];
  const pal: Record<string, string> = { k: '#5a2a24', w: '#ffe8d8', p: '#e8a89a' };
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) p.set(cx - 4 + x, cy - 4 + y, c); } });
}
/** an iron nail head with a rust streak running down from it */
export function nail(p: Px, cx: number, cy: number, streak = 3) {
  p.set(cx, cy, '#5a5a62'); p.set(cx + 1, cy, '#3a3a42'); p.set(cx, cy + 1, '#3a3a42'); p.set(cx + 1, cy + 1, '#1a1a20'); p.set(cx, cy, '#9a9aa6');
  for (let k = 0; k < streak; k++) p.over(cx + (k > 1 ? 1 : 0), cy + 2 + k, k === streak - 1 ? '#8a5a3a' : '#7a3a1a');
}
/** a vertical rope lashing at column x: twisted strands (diagonal two-tone stripes) inside an ink outline */
export function ropeV(p: Px, x: number, y0: number, y1: number, wd = 5) {
  for (let y = y0; y <= y1; y++) for (let k = 0; k < wd; k++) {
    if (k === 0 || k === wd - 1) { p.set(x + k, y, '#2a1a0c'); continue; }
    const ph = (y + k) % 4;
    p.set(x + k, y, ph === 0 ? '#6a4a24' : ph === 1 ? '#f0d49a' : ph === 2 ? '#d8b878' : '#b08a52');
  }
}
/** a horizontal rope along row y */
export function ropeH(p: Px, x0: number, x1: number, y: number, ht = 4) {
  for (let x = x0; x <= x1; x++) for (let k = 0; k < ht; k++) {
    if (k === 0 || k === ht - 1) { p.set(x, y + k, '#2a1a0c'); continue; }
    const ph = (x + k) % 4;
    p.set(x, y + k, ph === 0 ? '#6a4a24' : ph === 1 ? '#f0d49a' : ph === 2 ? '#d8b878' : '#b08a52');
  }
}

/**
 * a DRIFTWOOD board: weathered planks (salt-bleached top edges, long wavy grain, a knot each, dark seams), a rim of
 * sea-worn teal paint chipped back to the wood in places, nails with rust streaks at the plank ends, optional rope
 * lashings, barnacles on two corners. Detail is placed by rule (sines of the position, a fixed hash), never noise.
 */
function paintBoard(p: Px, o: PlateOpts & { wood?: string }) {
  const { w, h } = p;
  const W = ramp((o as { wood?: string }).wood ?? WOOD), T = ramp(o.face ?? PAL.teal1);
  const n = Math.max(1, Math.round((h - 4) / (o.plank ?? 13)));
  const ph = (h - 4) / n;
  const plankOf = (y: number) => Math.min(n - 1, Math.floor((y - 2) / ph));
  const seam = (y: number) => { const i = plankOf(y); return y - 2 - Math.round(i * ph); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeD(x, y, w, h, 2);
    if (d < 0) continue;
    if (d === 0) { p.set(x, y, '#1a0e06'); continue; }
    const tl = (y === d && x < w - 1 - d) || (x === d && y < h - 1 - d);
    // the sea-worn paint rim, chipped (chips at fixed places along the edge)
    if (d <= 2) {
      const along = y === d || y === h - 1 - d ? x : y;
      const chip = hash(Math.floor(along / 5), w + h + (y > h / 2 ? 1 : 0) + (x > w / 2 ? 2 : 0)) < 0.3;
      if (chip) p.set(x, y, d === 1 ? (tl ? W[4] : W[1]) : W[2]);
      else p.set(x, y, d === 1 ? (tl ? T[4] : T[1]) : (tl ? T[3] : T[2]));
      continue;
    }
    if (d === 3) { p.set(x, y, '#2a1608'); continue; }
    // the planks
    const i = plankOf(y), sy = seam(y), plH = Math.round((i + 1) * ph) - Math.round(i * ph);
    if (i > 0 && sy === 0) { p.set(x, y, '#2a1608'); continue; }
    let c = W[3];
    if (sy === 1 || (i === 0 && y === 4)) c = W[5];                       // salt-bleached lit edge
    else if (sy === 2) c = W[4];
    else if (sy >= plH - 1) c = W[1];
    // two long wavy grain lines per plank, broken into runs
    const g1 = Math.round(plH * 0.38 + Math.sin(x * 0.09 + i * 2.1) * 1.4), g2 = Math.round(plH * 0.7 + Math.sin(x * 0.06 + i * 1.3 + 1) * 1.2);
    if (sy === g1 && (x + i * 11) % 31 < 23) c = W[2];
    if (sy === g2 && (x + i * 7) % 27 < 15) c = W[2];
    if (sy === g1 + 1 && (x + i * 11) % 31 < 9) c = W[4];
    p.set(x, y, c);
  }
  // a knot per plank (where the grain would bend), placed by rule
  for (let i = 0; i < n; i++) {
    if (w < 40) break;
    const kx = Math.round(12 + hash(i + 3, w) * (w - 24)), ky = Math.round(2 + i * ph + ph * 0.55);
    p.set(kx - 2, ky, W[1]); p.set(kx - 1, ky - 1, W[1]); p.set(kx, ky - 1, W[1]); p.set(kx + 1, ky - 1, W[1]); p.set(kx + 2, ky, W[1]);
    p.set(kx - 1, ky + 1, W[1]); p.set(kx, ky + 1, W[1]); p.set(kx + 1, ky + 1, W[1]);
    p.set(kx - 1, ky, W[0]); p.set(kx, ky, '#3a2410'); p.set(kx + 1, ky, W[0]); p.set(kx, ky - 2, W[4]);
  }
  // nails at the plank ends, rust running down
  if (w >= 40) for (let i = 0; i < n; i++) { const ny = Math.round(2 + i * ph + ph / 2) - 1; nail(p, 6, ny, Math.min(3, Math.floor(ph / 3))); nail(p, w - 8, ny, Math.min(3, Math.floor(ph / 3))); }
  // rope lashings
  for (const rx of o.rope ?? []) ropeV(p, Math.round(rx), 1, h - 2);
  // algae: a fringe of moss and weed along the bottom edge, thickest at the corners, creeping up the seams
  if ((o.algae ?? true) && w >= 60 && h >= 24) algaeEdge(p, 3, w - 4, h - 4, ph);
  // barnacles on two corners
  if ((o.barnacles ?? true) && w >= 48 && h >= 22) {
    barnacle(p, w - 7, h - 7); barnacle(p, w - 13, h - 5, false); barnacle(p, w - 5, h - 13, false);
    barnacle(p, 6, 6, false);
  }
}

/** sea-green algae ramp (dark to light), a slimy olive and a red weed accent */
export const ALGAE = ['#173a1a', '#25562a', '#3a7a34', '#5fa040', '#9ad060', '#d0f090'];
/**
 * algae grown along a bottom edge (rows above y): a mossy crust whose height swells and thins along the edge (two
 * sines: placed, never random), weed blades poking up out of it, a few red weed fronds, and moss creeping up into the
 * plank seams near both ends. Painted only over pixels that already exist (it never spills off the board).
 */
export function algaeEdge(p: Px, x0: number, x1: number, y: number, seamEvery = 0) {
  const A = ALGAE;
  const span = x1 - x0;
  for (let x = x0; x <= x1; x++) {
    const u = (x - x0) / Math.max(1, span);
    const corner = Math.max(0, 1 - Math.min(u, 1 - u) * 5);           // thick at the ends
    const hgt = Math.max(0, Math.round(1.2 + corner * 4 + Math.sin(x * 0.31) * 1.4 + Math.sin(x * 0.083 + 1.3) * 1.6));
    for (let k = 0; k < hgt; k++) {
      const c = k === hgt - 1 ? A[4] : k === hgt - 2 ? A[3] : k === 0 ? A[1] : A[2];
      p.over(x, y - k, c);
    }
    if (hgt > 0) p.over(x, y - hgt, A[0]);                               // the crust's dark top edge
    // weed blades: every so often a blade of two or three tones leans up out of the crust
    if ((x * 7 + 3) % 23 === 0 && hgt > 1) for (let k = 0; k < 4 + (x % 3); k++) { p.over(x + (k > 2 ? 1 : 0), y - hgt - k, k < 2 ? A[3] : A[4]); p.over(x + 1 + (k > 2 ? 1 : 0), y - hgt - k, A[1]); }
    if ((x * 5 + 11) % 41 === 0 && hgt > 0) for (let k = 0; k < 3; k++) { p.over(x, y - hgt - k, k === 2 ? '#e88a7a' : '#b8443a'); p.over(x + 1, y - hgt - k + 1, '#6a1e1a'); }
  }
  // moss creeping up the seams near the ends
  if (seamEvery > 4) for (const sx of [x0 + 2, x1 - 9]) for (let yy = y - 6; yy > y - seamEvery * 2.2 && yy > 4; yy--) {
    const k = y - yy;
    if (k % 5 === 0) for (let j = 0; j < 7 - Math.floor(k / 6); j++) p.over(sx + j, yy, j % 3 === 0 ? A[3] : A[2]);
  }
}

/**
 * an odometer drum cell (w x h): a cream number wheel seen through a slot: cylinder shading top to bottom in five
 * tones, ink jambs left and right, brass bezel lips above and below, a glass glint. The digit is drawn on top.
 */
function paintDrum(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const C = ramp(o.face ?? '#e8d8b0'), B = ramp(o.rim ?? PAL.brass);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fy = (y - 1) / Math.max(1, h - 3);
    let c = fy < 0.12 ? C[1] : fy < 0.26 ? C[2] : fy < 0.42 ? C[4] : fy < 0.7 ? C[3] : fy < 0.86 ? C[2] : C[1];
    if (y === 0) c = B[5]; else if (y === h - 1) c = B[1];
    if (x === 0 || x === w - 1) c = PAL.ink2;
    else if (x === 1) c = y === 0 || y === h - 1 ? c : C[2];
    else if (x === w - 2) c = y === 0 || y === h - 1 ? c : C[1];
    p.set(x, y, c);
  }
  // the glass glint: a short bright diagonal at the top left of the slot
  if (w >= 6 && h >= 8) { p.set(2, 2, '#ffffff', 200); p.set(3, 2, '#ffffff', 140); p.set(2, 3, '#ffffff', 120); }
}

/**
 * a recessed alcove in the driftwood (the heal clam's nook): a dark wet hollow with a lit lower lip, a carved arch at
 * the top, pale sand in the bottom, a pebble and a curl of weed. Lets a 3D prop sit IN the board.
 */
function paintAlcove(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const F = ramp(o.face ?? '#1d4f55'), W = ramp(WOOD), A = ALGAE;
  const arch = Math.min(6, Math.floor(w / 5));
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const dx = Math.min(x, w - 1 - x);
    return y >= Math.max(0, arch - Math.round(Math.sqrt(Math.max(0, arch * arch - (arch - Math.min(arch, dx)) ** 2))));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || y === h - 1;
    if (edge) { p.set(x, y, '#1a0e06'); continue; }
    const e2 = !inside(x - 2, y) || !inside(x, y - 2) || !inside(x + 2, y);
    const fy = y / h;
    let c = fy < 0.3 ? F[0] : fy < 0.62 ? F[1] : F[2];
    if (e2) c = x < w / 2 || !inside(x, y - 2) ? '#05090c' : W[4];          // deep shade on the top/left lip, lit right lip
    if (y >= h - 5) c = y === h - 5 ? '#e2c898' : y === h - 2 ? '#a88a5a' : '#c8aa7a'; // sand
    p.set(x, y, c);
  }
  // a pebble and shell grit on the sand, a curl of weed growing from the corner
  const sy = h - 4;
  for (const [dx, c] of [[3, '#7a7a8a'], [4, '#9a9aaa'], [5, '#5a5a6a']] as [number, string][]) p.over(dx, sy, c);
  p.over(w - 6, sy, '#f6eedc'); p.over(w - 5, sy, '#d8cdb0');
  for (let k = 0; k < Math.min(10, h - 8); k++) { const xx = w - 3 - Math.round(Math.sin(k * 0.5) * 1.5); p.over(xx, sy - 1 - k, k > 6 ? A[4] : A[3]); p.over(xx - 1, sy - 1 - k, A[1]); }
}

/**
 * a faceted gem pip on a PixelUI (centre x, y, radius r in UI px): an ink outline, four facets lit from the top
 * left (light / base / shadow / deep), a table highlight and a white glint. `on` false: a dark empty socket.
 */
export function gem(ui: PixelUI, x: number, y: number, r: number, col: string, on = true, alpha = 1) {
  const R = Math.max(2, Math.round(r)), cx = Math.round(x), cy = Math.round(y);
  const G = on ? ramp(col) : ['#05090c', '#0d1a20', '#13262e', '#1a3038', '#22404a', '#2c5058'];
  for (let i = -R - 1; i <= R + 1; i++) { const wd = R + 1 - Math.abs(i); ui.fill(cx - wd, cy + i, wd * 2 + 1, 1, PAL.ink2, alpha); }
  for (let i = -R; i <= R; i++) {
    const wd = R - Math.abs(i);
    for (let j = -wd; j <= wd; j++) {
      const c = i < 0 && j <= 0 ? G[4] : i < 0 ? G[3] : j <= 0 ? G[2] : G[1];
      ui.fill(cx + j, cy + i, 1, 1, c, alpha);
    }
  }
  if (R >= 3) { ui.fill(cx - 1, cy - 1, 2, 1, G[5], alpha); ui.fill(cx, cy, 1, 1, G[3], alpha); }
  if (on) ui.fill(cx - Math.max(1, R - 2), cy - 1, 1, 1, '#ffffff', alpha);
}

/**
 * the run summary's SHIP'S SIGN: a big board of thick driftwood planks with a carved border groove, heavy rope
 * lashings at both ends, barnacle clusters and scallop shells on the corners, a band of net trim along the bottom
 */
function paintSign(p: Px, o: PlateOpts) {
  const { w, h } = p;
  paintBoard(p, { ...o, barnacles: false, face: o.face ?? '#2a6b6f', plank: 26 });
  const W = ramp(WOOD);
  // the carved border: a groove (dark cut, lit lower lip) inset from the rim
  const e = 9;
  p.grooveH(e, w - e - 2, e, W[0], W[5]); p.grooveH(e, w - e - 2, h - e - 2, W[0], W[5]);
  p.grooveV(e, e, h - e - 2, W[0], W[5]); p.grooveV(w - e - 2, e, h - e - 2, W[0], W[5]);
  // heavy rope lashings wrapped round both ends
  for (const rx of [18, w - 25]) { ropeV(p, rx, 0, h - 1, 7); for (let y = 6; y < h - 6; y += 11) { p.hline(rx - 1, rx + 7, y, '#2a1a0c'); } }
  // net trim along the bottom edge: a diamond mesh of tarred twine
  const ny0 = h - 13;
  for (let x = 30; x < w - 32; x++) for (let k = 0; k < 8; k++) {
    if ((x + k) % 8 === 0 || (x - k + 64) % 8 === 0) p.set(x, ny0 + k, '#3a2a18');
  }
  ropeH(p, 30, w - 33, ny0 - 3, 4);
  // barnacle clusters and shells on the corners
  for (const [cx, cy] of [[w - 13, h - 12], [11, 12]] as [number, number][]) { barnacle(p, cx, cy); barnacle(p, cx + 7, cy - 4); barnacle(p, cx - 7, cy + 3, false); barnacle(p, cx - 1, cy + 7, false); }
  shell(p, w - 13, 12); shell(p, 13, h - 13);
  barnacle(p, w - 22, 8, false); barnacle(p, 21, h - 8, false);
}

// ------------------------------------------------------------------ caustics (a tiled light web, animated by UV offset)
let causticCv: HTMLCanvasElement | null = null;
/**
 * a 64 px tileable caustic web: thin bright lines where two warped sine fields cross zero (integer frequencies so it
 * tiles; maths, not noise). Draw it with PlanePool.drawTiled at low alpha and slide its offset over time.
 */
export function caustics(): HTMLCanvasElement {
  if (causticCv) return causticCv;
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!, img = x.createImageData(S, S), D = img.data;
  const TAU = Math.PI * 2;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = py / S;
    const a = Math.sin(TAU * 2 * u + 1.4 * Math.sin(TAU * v)) + Math.sin(TAU * 2 * v + 1.2 * Math.sin(TAU * u + 0.7));
    const b = Math.sin(TAU * 3 * (u + v) * 0.5 * 2 / 2 + 1.1 * Math.sin(TAU * 2 * u)) ;
    const m = Math.min(Math.abs(a), Math.abs(b) * 1.6);
    const al = m < 0.12 ? 150 : m < 0.24 ? 70 : 0;
    const i = (py * S + px) * 4; D[i] = 220; D[i + 1] = 250; D[i + 2] = 255; D[i + 3] = al;
  }
  x.putImageData(img, 0, 0);
  causticCv = c;
  return c;
}

/** the instrument plate: an ink outline, a brass rim with a milgrain bead, a lacquered face with an engraved inner
 *  border, a sheen streak, worn chips on the edges and brass corner brackets with slotted screws */
function paintLacquer(p: Px, o: PlateOpts, glass: boolean) {
  const { w, h } = p;
  const R = ramp(o.rim ?? PAL.brass), F = ramp(o.face ?? PAL.teal), A = o.alpha ?? (glass ? 220 : 255);
  const rw = o.rimW ?? (Math.min(w, h) >= 22 ? 3 : 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeD(x, y, w, h, 2);
    if (d < 0) continue;
    if (d === 0) { p.set(x, y, PAL.ink2); continue; }
    const tl = (y === d && x < w - 1 - d) || (x === d && y < h - 1 - d);
    if (d <= rw) {
      // the rim: outer lip brightest, a milgrain bead in the middle row, a shaded inner row
      let c = d === 1 ? (tl ? R[5] : R[2]) : d === rw ? (tl ? R[3] : R[1]) : (tl ? R[4] : R[2]);
      if (rw >= 3 && d === 2) { const along = x === d || x === w - 1 - d ? y : x; if (along % 3 === 0) c = tl ? R[5] : R[3]; else if (along % 3 === 1) c = tl ? R[3] : R[1]; }
      p.set(x, y, c); continue;
    }
    if (d === rw + 1) { p.set(x, y, PAL.ink2); continue; }
    // the face: a lit top row, the upper third a step lighter, a shaded bottom row
    const fy = y - rw - 2, fh = h - 2 * (rw + 2);
    let c = fy === 0 ? F[4] : fy === fh - 1 ? F[1] : fy < fh * 0.36 ? F[3] : F[2];
    if (x === rw + 2 && fy > 0) c = F[3];
    p.set(x, y, c, A);
  }
  const i0 = rw + 2, iw = w - 2 * i0, ih = h - 2 * i0;
  if (iw < 8 || ih < 8) return;
  // an engraved border inset in the face
  if (iw >= 80 && ih >= 40) {
    const e = 3;
    p.grooveH(i0 + e, i0 + iw - e - 2, i0 + e, F[0], F[4]); p.grooveH(i0 + e, i0 + iw - e - 2, i0 + ih - e - 2, F[0], F[4]);
    p.grooveV(i0 + e, i0 + e, i0 + ih - e - 2, F[0], F[4]); p.grooveV(i0 + iw - e - 2, i0 + e, i0 + ih - e - 2, F[0], F[4]);
  }
  // the lacquer's sheen: two short diagonal streaks near the top left (a reflection, hand placed)
  if (iw >= 50 && ih >= 16) for (const [sx, len] of [[i0 + 10, 7], [i0 + 15, 4]] as [number, number][]) for (let k = 0; k < len; k++) p.set(sx + k, i0 + 1 + Math.floor(k / 2), F[5], A);
  // worn chips on the lacquer where hands rub: the brass shows through on the inner edge
  const chips = Math.max(1, Math.floor((w + h) / 70));
  for (let i = 0; i < chips; i++) {
    const t = 0.15 + 0.7 * hash(w + i * 7, h + i * 13), side = i % 2;
    const cx = side ? Math.round(i0 + t * iw) : i0, cy = side ? i0 + ih - 1 : Math.round(i0 + t * ih);
    if (side) { p.set(cx, cy, R[3]); p.set(cx + 1, cy, R[4]); p.set(cx + 2, cy, R[2]); p.set(cx + 1, cy - 1, F[1]); }
    else { p.set(cx, cy, R[3]); p.set(cx, cy + 1, R[4]); p.set(cx + 1, cy + 1, F[1]); }
  }
  // brass corner brackets with a scrolled tip and a slotted screw
  if ((o.corners ?? true) && w >= 40 && h >= 24) {
    const L = Math.min(11, Math.floor(Math.min(w, h) / 3.2));
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ox = sx > 0 ? i0 - 1 : w - i0, oy = sy > 0 ? i0 - 1 : h - i0;
      for (let i = 0; i < L; i++) for (let j = 0; j < 3; j++) {
        const lit = j === 0;
        const c = j === 2 ? R[0] : lit ? (sy > 0 ? R[4] : R[3]) : R[3];
        p.set(ox + sx * i, oy + sy * j, c);
        const c2 = j === 2 ? R[0] : lit ? (sx > 0 ? R[4] : R[3]) : R[3];
        p.set(ox + sx * j, oy + sy * i, c2);
      }
      // scrolled tips: a curl at each arm's end
      const tx = ox + sx * L, ty = oy + sy * 1;
      p.set(tx, ty, R[4]); p.set(tx, ty - sy, R[2]); p.set(tx + sx, ty, R[0]);
      const ux = ox + sx * 1, uy = oy + sy * L;
      p.set(ux, uy, R[4]); p.set(ux - sx, uy, R[2]); p.set(ux, uy + sy, R[0]);
      p.screw(ox + sx * 3, oy + sy * 3, R, (sx + sy + 2) % 3);
      // a fleck of verdigris in the bracket's inside corner
      p.set(ox + sx * 5, oy + sy * 5, VERDI[1]); p.set(ox + sx * 6, oy + sy * 5, VERDI[0]);
    }
  }
}

/** a brass bar: a polished band, an engraved border, slotted screws at the ends, a few fixed scratches, worn corners */
function paintBrass(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const R = ramp(o.rim ?? PAL.brass);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeD(x, y, w, h, 2);
    if (d < 0) continue;
    if (d === 0) { p.set(x, y, PAL.ink2); continue; }
    const fy = y / (h - 1);
    let c = fy < 0.22 ? R[4] : fy > 0.74 ? R[2] : R[3];
    if (y === 1) c = R[5];
    if (y === h - 2) c = R[1];
    if (x === 1) c = R[4];
    if (x === w - 2) c = R[1];
    p.set(x, y, c);
  }
  if (h >= 12 && w >= 24) {
    // the polished band, the engraved border
    p.hline(3, w - 4, 3, R[5]);
    p.grooveH(5, w - 7, 4, R[1], R[5]); p.grooveH(5, w - 7, h - 6, R[1], R[5]);
    p.grooveV(4, 5, h - 6, R[1], R[5]); p.grooveV(w - 7, 5, h - 6, R[1], R[5]);
    // scratches: short hairlines in fixed places (a lit line with its shadow)
    const n = Math.floor(w / 46);
    for (let i = 0; i < n; i++) {
      const sx = Math.round(10 + hash(w, i) * (w - 24)), sy = Math.round(6 + hash(i, w) * (h - 13)), len = 3 + Math.round(hash(i + 3, w) * 4);
      for (let k = 0; k < len; k++) { p.over(sx + k, sy - Math.floor(k / 2), R[5]); p.over(sx + k, sy - Math.floor(k / 2) + 1, R[2]); }
    }
    // the screws at the ends with a fleck of verdigris in the recess
    const cy = Math.floor(h / 2);
    p.screw(8, cy, R, 0); p.screw(w - 9, cy, R, 1);
    p.set(10, cy + 2, VERDI[1]); p.set(w - 11, cy + 2, VERDI[1]); p.set(10, cy + 1, VERDI[0]);
    // the corners rubbed bright
    for (const [cx, cy2] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) p.set(cx, cy2, R[5]);
    // barnacles settled on the brass at two corners
    if (w >= 60) { barnacle(p, w - 5, h - 5, false); barnacle(p, w - 9, h - 4, false); barnacle(p, 4, 4, false); }
  }
}

/** a recessed glass window: a deep inner shadow top / left, a lit lip bottom / right, a dark face, glass streaks */
function paintWell(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const F = ramp(o.face ?? PAL.ink);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeD(x, y, w, h, 1);
    if (d < 0) continue;
    if (d === 0) { p.set(x, y, y === h - 1 || x === w - 1 ? PAL.brass : PAL.ink2); continue; }
    if (d === 1 && (y === 1 || x === 1)) { p.set(x, y, '#03070b'); continue; }
    if (d === 1 && (y === h - 2 || x === w - 2)) { p.set(x, y, F[1]); continue; }
    p.set(x, y, y < h * 0.42 ? F[2] : F[3], o.alpha ?? 255);
  }
  // the glass: a long thin streak and a short one, diagonal, top-left (placed, low contrast)
  if (w >= 14 && h >= 10) {
    const st = Math.min(w, h) - 5;
    for (let k = 0; k < Math.min(st, 5); k++) p.set(2 + k, 2 + k, F[3]);
    for (let k = 0; k < 2; k++) p.set(5 + k, 2 + k, F[3]);
  }
}

/** flat cream card: a lit top edge, a darker card edge at the bottom, one fold line */
function paintCream(p: Px) {
  const { w, h } = p;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeD(x, y, w, h, 2);
    if (d < 0) continue;
    if (d === 0) { p.set(x, y, '#3a2410'); continue; }
    p.set(x, y, y === 1 ? PAL.paper : y >= h - 3 ? PAL.cream1 : x === 1 ? PAL.paper : x === w - 2 ? PAL.cream1 : PAL.cream);
  }
  if (w > 60) { const fx = Math.round(w * 0.62); for (let y = 2; y < h - 3; y++) { p.set(fx, y, PAL.cream1); p.set(fx + 1, y, PAL.paper); } }
}

/** a round medallion: a brass ring with an engraved line and four screw points, a domed lacquer face */
function paintDisc(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const R = ramp(o.rim ?? PAL.brass), F = ramp(o.face ?? PAL.teal);
  const cx = (w - 1) / 2, cy = (h - 1) / 2, r = Math.min(w, h) / 2 - 0.5, rw = o.rimW ?? Math.max(2, Math.round(r / 4));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > r) continue;
    if (d > r - 1) { p.set(x, y, PAL.ink2); continue; }
    const lit = (dx + dy) / (d || 1);
    if (d > r - 1 - rw) {
      const mid = Math.abs(d - (r - 1 - rw / 2)) < 0.5;
      p.set(x, y, mid ? (lit < 0 ? R[2] : R[1]) : lit < -0.4 ? R[5] : lit < 0.3 ? R[4] : lit < 0.8 ? R[2] : R[1]);
      continue;
    }
    if (d > r - 2 - rw) { p.set(x, y, PAL.ink); continue; }
    p.set(x, y, dy < -r * 0.3 ? F[3] : dx + dy > r * 0.6 ? F[1] : F[2]);
  }
  // a crescent highlight on the dome
  for (let a = 3.6; a < 4.5; a += 0.12) p.set(cx + Math.cos(a) * (r - rw - 3.5), cy + Math.sin(a) * (r - rw - 3.5), F[5]);
}

/** a cloth title ribbon: swallow-tailed ends folded behind, a sheen band, stitched hems */
function paintRibbon(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const R = ramp(o.rim ?? '#a8323a');
  const tail = Math.min(12, Math.floor(h * 0.6));
  const inside = (x: number, y: number) => { const fy = y / (h - 1), notch = Math.abs(fy - 0.5) * 2; return x >= tail * (1 - notch) * 0.7 && w - 1 - x >= tail * (1 - notch) * 0.7 && y >= 0 && y < h; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const fy = y / (h - 1);
    const end = x < tail || x > w - 1 - tail;
    const edge = y === 0 || y === h - 1 || !inside(x - 1, y) || !inside(x + 1, y);
    if (edge) { p.set(x, y, PAL.ink2); continue; }
    let c = fy < 0.2 ? R[4] : fy > 0.78 ? R[1] : R[3];
    if (y === 1) c = R[5];
    if (end) c = fy < 0.2 ? R[2] : fy > 0.78 ? R[0] : R[1];
    if (x === tail || x === w - 1 - tail) c = PAL.ink;
    if (x === tail + 1 || x === w - 2 - tail) c = R[0];
    p.set(x, y, c);
  }
  // the hems: a dashed stitch line top and bottom, the cloth's woven sheen band
  for (let x = tail + 4; x < w - tail - 4; x += 3) { p.set(x, 3, R[5]); p.set(x + 1, 3, R[5]); p.set(x, h - 4, R[2]); p.set(x + 1, h - 4, R[2]); }
  // fold creases on the tails
  for (const sx of [tail - 3, w - tail + 2]) for (let y = 3; y < h - 3; y += 2) p.over(sx, y, R[0]);
}

/** the boss's name plate: an engraved brass plaque with scrolled ends, a double border, rivets and a dark inset
 *  for the name, a red enamel gem at each end */
function paintNameplate(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const R = ramp(o.rim ?? PAL.brass), G = ramp(o.face ?? '#c8303a');
  const cap = Math.min(16, Math.floor(h * 0.75));
  const cy = (h - 1) / 2;
  // the outline: a long plate with pointed, scrolled ends
  const inside = (x: number, y: number) => {
    const ex = Math.min(x, w - 1 - x);
    if (ex >= cap) return y >= 2 && y <= h - 3;
    const k = ex / cap; // 0 at the tip .. 1 where the body starts
    const half = 2 + (cy - 2) * Math.min(1, k * 1.6);
    return Math.abs(y - cy) <= half;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) { p.set(x, y, PAL.ink2); continue; }
    const top = !inside(x, y - 2) || !inside(x - 2, y), bot = !inside(x, y + 2) || !inside(x + 2, y);
    p.set(x, y, top ? R[5] : bot ? R[1] : y < cy - 2 ? R[4] : R[3]);
  }
  // the double engraved border just inside the body
  const bx0 = cap - 2, bx1 = w - cap + 1;
  p.grooveH(bx0, bx1, 4, R[1], R[5]); p.grooveH(bx0, bx1, h - 6, R[1], R[5]);
  // the dark inset for the name
  const ix0 = cap + 3, ix1 = w - cap - 4, iy0 = 7, iy1 = h - 9;
  for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
    const e = x === ix0 || x === ix1 || y === iy0 || y === iy1;
    p.set(x, y, e ? (y === iy1 || x === ix1 ? R[5] : PAL.ink2) : y === iy0 + 1 ? '#2a1418' : '#1a0c10');
  }
  // milgrain beads along the top and bottom bands
  for (let x = cap + 2; x < w - cap - 2; x += 4) { p.set(x, 2 + 1, R[5]); p.set(x, h - 4, R[2]); }
  // the scrolls at both ends: a curl of engraved line and a red enamel gem
  for (const s of [1, -1]) {
    const ex = s > 0 ? cap - 4 : w - cap + 3;
    const gx = s > 0 ? 7 : w - 8;
    for (let a = 0; a < Math.PI * 1.6; a += 0.25) p.set(gx + Math.cos(a) * 4 * s, cy + Math.sin(a) * 4, R[1]);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2) p.set(gx + dx, cy + dy, Math.abs(dx) + Math.abs(dy) === 2 ? PAL.ink2 : dy < 0 || dx < 0 ? G[4] : G[2]);
    p.set(gx - 1, cy - 1, '#ffffff');
    p.rivet(ex, 5, R); p.rivet(ex, h - 7, R);
  }
  if (w >= 80) { barnacle(p, w - cap + 2, h - 6, false); barnacle(p, w - cap - 2, h - 5, false); }
}

/** a riveted iron band (the boss's bar housing): dark plates with rivets every 18 px and a lit top lip */
function paintIron(p: Px, o: PlateOpts) {
  const { w, h } = p;
  const I = ramp(o.face ?? '#3a4048'), R = ramp(o.rim ?? '#b04a3a');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeD(x, y, w, h, 2);
    if (d < 0) continue;
    if (d === 0) { p.set(x, y, PAL.ink2); continue; }
    if (d === 1) { p.set(x, y, y === 1 || x === 1 ? R[4] : R[1]); continue; }
    if (d === 2) { p.set(x, y, y === 2 || x === 2 ? R[3] : R[0]); continue; }
    if (d === 3) { p.set(x, y, PAL.ink2); continue; }
    p.set(x, y, y < h * 0.35 ? I[2] : y > h - 6 ? I[0] : I[1]);
  }
  // plate seams with rivets either side, every 34 px
  for (let x = 20; x < w - 16; x += 34) { p.vline(x, 4, h - 5, I[0]); p.vline(x + 1, 4, h - 5, I[3]); p.rivet(x - 3, 6, I); p.rivet(x + 4, h - 7, I); }
  p.rivet(6, Math.floor(h / 2), R); p.rivet(w - 7, Math.floor(h / 2), R);
}

/** a page of the diver's logbook: cream paper with blue ruled lines, a red double margin, punched holes, a coffee
 *  ring and a water stain at the edges, a dog-eared corner, the stacked page edges underneath */
function paintLogbook(p: Px) {
  const { w, h } = p;
  const pw = w - 3, ph = h - 3; // the page; 3 px of stacked page edges below / right
  const dog = Math.min(16, Math.floor(Math.min(pw, ph) / 8));
  // the corner the dog-ear folds away, for every sheet
  const cut = (x: number, y: number, ox: number, oy: number) => (x - ox - (pw - dog)) + (y - oy - (ph - dog)) > dog;
  // the pages underneath
  for (let k = 3; k >= 1; k--) for (let y = k; y < ph + k; y++) for (let x = k; x < pw + k; x++) {
    if (cut(x, y, k, k)) continue;
    const e = x === k || y === k || x === pw + k - 1 || y === ph + k - 1 || cut(x + 1, y + 1, k, k);
    p.set(x, y, e ? '#3a2410' : k === 1 ? PAL.cream1 : PAL.cream2);
  }
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    if (cut(x, y, 0, 0)) continue;
    const d = Math.min(x, y, pw - 1 - x, ph - 1 - y);
    if (d === 0 || cut(x + 1, y + 1, 0, 0)) { p.set(x, y, '#3a2410'); continue; }
    let c = y === 1 || x === 1 ? PAL.paper : PAL.cream;
    // ruled lines (pale blue) every 14 px under a header band, and the red double margin
    if (y > 30 && (y - 30) % 14 === 0 && x > 2) c = '#b9cfd6';
    if (x === 26 || x === 28) c = y > 2 ? '#e09a8a' : c;
    p.set(x, y, c);
  }
  // the folded flap lies on the page: the paper's back in a darker cream, lit along the fold, inked on its edges
  for (let i = 1; i <= dog; i++) for (let j = 1; j <= dog - i; j++) {
    // (i, j): distance back from the corner along x / y; the flap is the mirror of the cut across the fold
    const x = pw - dog - 1 + i, y = ph - dog - 1 + j;
    if (cut(x, y, 0, 0)) continue;
    const edge = i === 1 || j === 1;
    const fold = cut(x + 1, y + 1, 0, 0);
    p.set(x, y, fold ? PAL.paper : edge ? '#3a2410' : PAL.cream1);
  }
  // punched holes down the left margin
  for (let y = 40; y < ph - 20; y += 60) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const r2 = dx * dx + dy * dy; if (r2 > 5) continue;
    p.set(12 + dx, y + dy, r2 > 2 ? '#8a7450' : '#2a1a10');
  }
  // a coffee ring near the top right (an arc of two tones, broken where the cup lifted) and a water stain along
  // the bottom edge (one flat darker tone with a tide line)
  const rx = pw - 58, ry = 24, rr = 15;
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    if (a > 4.1 && a < 4.9) continue;
    const x = rx + Math.cos(a) * rr, y = ry + Math.sin(a) * rr * 0.9;
    p.over(x, y, '#cfa877'); if (a > 0.3 && a < 2.4) p.over(x + 1, y, '#dcbc8c');
  }
  for (let x = 60; x < Math.min(pw - dog - 8, 200); x++) {
    const tide = Math.round(4 + 3 * Math.sin(x * 0.11) + 2 * Math.sin(x * 0.037));
    for (let y = ph - 2 - tide; y < ph - 1; y++) p.over(x, y, y === ph - 2 - tide ? '#c8ab7a' : '#e6d5ae');
  }
  // brass tacks pinning the top corners
  for (const tx of [6, pw - 7]) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const r2 = dx * dx + dy * dy; if (r2 > 5) continue; p.set(tx + dx, 6 + dy, r2 > 3 ? PAL.ink2 : dx + dy < 0 ? PAL.brass2 : PAL.brass1); }
    p.set(tx - 1, 5, PAL.glint);
  }
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
/** a flat bar (v8b): a 1 px ink border, a dark trough, a flat fill, a pale chip, a gain preview, quiet ticks (UI px) */
export function bar(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, o: BarOpts) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ui.fill(x, y, w, h, PAL.ink);
  ui.fill(x + 1, y + 1, w - 2, h - 2, o.back && o.back !== '#0a1820' ? o.back : '#0e141f');
  const iw = w - 2, ih = h - 2;
  const fv = Math.round(iw * Math.max(0, Math.min(1, v)));
  if (o.gain !== undefined && o.gain > v) { const gw = Math.round(iw * Math.min(1, o.gain)); ui.fill(x + 1 + fv, y + 1, gw - fv, ih, o.gainCol ?? PAL.brass2, 0.6); }
  if (o.chip !== undefined && o.chip > v) { const cw = Math.round(iw * Math.min(1, o.chip)); ui.fill(x + 1 + fv, y + 1, cw - fv, ih, PAL.cream, 0.55); }
  if (fv > 0) ui.fill(x + 1, y + 1, fv, ih, o.col);
  if (o.ticks) for (let t = o.ticks; t < 0.999; t += o.ticks) ui.fill(x + 1 + Math.round(iw * t), y + 1, 1, ih, PAL.ink, 0.5);
  if (o.flash && o.flash > 0) ui.fill(x + 1, y + 1, Math.max(fv, 1), ih, '#ffffff', Math.min(1, o.flash) * 0.4);
}

export interface TubeOpts {
  /** the liquid's colour (a ramp is built from it) */
  col: string;
  /** the pale "just spent" chip, 0..1 (>= v) */
  chip?: number;
  /** 0..1 white flash over the liquid */
  flash?: number;
  /** engraved marks on the glass every `ticks` (e.g. 0.25) */
  ticks?: number;
  /** seconds (moves the bubbles and the meniscus) */
  t?: number;
  /** a faceted crystal vial (mana) instead of round glass with brass collars */
  crystal?: boolean;
  /** a heal pouring in: a glowing segment from v up to `gain` (0..1), in `gainCol` */
  gain?: number; gainCol?: string;
  /** a bright band travelling along the liquid (a heartbeat), 0..1 strength */
  pulse?: number;
}
/**
 * a GLASS TUBE gauge (UI px): brass collars with a screw at both ends (or cut-crystal caps), the glass with its
 * back wall, a long highlight streak and engraved marks, the liquid in three tones with a curved meniscus at its
 * front and bubbles rising through it, the chip of what was just spent. Every element is a placed shape.
 */
export function tube(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, o: TubeOpts) {
  // v8b: the glass tube is retired: a flat bar in the liquid's colour
  bar(ui, x, y, w, Math.max(4, h), v, { col: o.col, chip: o.chip, flash: o.flash, ticks: o.ticks, gain: o.gain, gainCol: o.gainCol });
}
export function tubeV6(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, o: TubeOpts) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.max(5, Math.round(h));
  const L = ramp(o.col), B = ramp(PAL.brass), t = o.t ?? 0;
  const cap = o.crystal ? Math.max(4, Math.round(h * 0.7)) : Math.max(5, Math.round(h * 0.85));
  const gx = x + cap, gw = w - cap * 2;
  // the glass: ink outline, a pale rim, the dark back wall (two tones)
  ui.fill(gx - 1, y, gw + 2, h, PAL.ink2);
  ui.fill(gx, y + 1, gw, h - 2, '#0c1c24');
  ui.fill(gx, y + 1 + Math.ceil((h - 2) / 2), gw, Math.floor((h - 2) / 2), '#0a161c');
  const iy = y + 1, ih = h - 2;
  const fv = Math.round(gw * Math.max(0, Math.min(1, v)));
  if (o.chip !== undefined && o.chip > v) { const cw = Math.round(gw * Math.min(1, o.chip)); ui.fill(gx + fv, iy + 1, cw - fv, ih - 1, PAL.cream, 0.85); }
  if (o.gain !== undefined && o.gain > v) {
    // the heal pouring in: a glowing segment with sparkling pixels drifting along it
    const G = ramp(o.gainCol ?? '#ff8ac0'), gw2 = Math.round(gw * Math.min(1, o.gain));
    ui.fill(gx + fv, iy, gw2 - fv, ih, G[3], 0.9); ui.fill(gx + fv, iy, gw2 - fv, 1, G[5], 0.9); ui.fill(gx + fv, iy + ih - 1, gw2 - fv, 1, G[1], 0.9);
    for (let i = 0; i < 4; i++) { const sx = gx + fv + Math.round((((t * 1.7 + i * 0.27) % 1)) * Math.max(1, gw2 - fv - 1)); ui.fill(sx, iy + 1 + (i % Math.max(1, ih - 2)), 1, 1, '#ffffff', 0.9); }
  }
  if (fv > 0) {
    // the liquid: a bright surface row, a light band, the base, a shaded bottom
    ui.fill(gx, iy, fv, ih, L[3]);
    ui.fill(gx, iy, fv, 1, L[5]);
    if (ih >= 5) ui.fill(gx, iy + 1, fv, Math.max(1, Math.floor(ih * 0.3)), L[4]);
    ui.fill(gx, iy + ih - 1, fv, 1, L[1]);
    if (ih >= 6) ui.fill(gx, iy + ih - 2, fv, 1, L[2]);
    // the meniscus: the front of the liquid bulges (top and bottom rows lag a pixel), a bright lip and a glint
    if (fv < gw) {
      ui.fill(gx + fv - 1, iy, 1, 1, '#0c1c24'); ui.fill(gx + fv - 1, iy + ih - 1, 1, 1, '#0a161c');
      ui.fill(gx + fv - 1, iy + 1, 1, ih - 2, L[5]);
      ui.fill(gx + fv, iy + 1 + Math.floor((ih - 2) / 3), 1, Math.max(1, ih - 2 - Math.floor((ih - 2) / 3) * 2), L[4]);
      const wob = Math.round(Math.sin(t * 6) * 0.6);
      ui.fill(gx + fv - 2, iy + 1 + Math.max(0, wob), 1, 1, '#ffffff', 0.8);
    }
    // bubbles: a few rising through the liquid on fixed lanes, wrapping round
    if (ih >= 5 && fv > 8) for (let i = 0; i < Math.max(2, Math.floor(fv / 18)); i++) {
      const lane = ((i * 37) % 97) / 97, sp = 0.6 + ((i * 53) % 7) / 10;
      const bx = gx + 2 + Math.round(((lane + t * 0.04 * sp) % 1) * (fv - 5));
      const by = iy + ih - 2 - Math.round(((t * sp * 0.9 + lane * 3) % 1) * (ih - 2));
      ui.fill(bx, by, 1, 1, L[5]);
      if (i % 2 === 0 && ih >= 7) { ui.fill(bx + 1, by, 1, 1, L[4]); ui.fill(bx, by + 1, 1, 1, L[4]); }
    }
  }
  // a heartbeat: a bright band sweeping along the liquid
  if (o.pulse && o.pulse > 0.01 && fv > 4) { const px = gx + Math.round(((t * 0.9) % 1) * fv); for (let k = -2; k <= 2; k++) if (px + k >= gx && px + k < gx + fv) ui.fill(px + k, iy, 1, ih, k === 0 ? L[5] : L[4], o.pulse * (1 - Math.abs(k) * 0.3)); }
  // engraved marks on the glass, a long highlight streak (broken once) and a short one
  if (o.ticks) for (let k = o.ticks; k < 0.999; k += o.ticks) { const tx = gx + Math.round(gw * k); ui.fill(tx, iy + ih - 2, 1, 2, PAL.ink2, 0.7); ui.fill(tx, iy, 1, 1, '#ffffff', 0.25); }
  if (ih >= 4) { ui.fill(gx + 2, iy + 1, Math.round(gw * 0.55), 1, '#ffffff', 0.35); ui.fill(gx + Math.round(gw * 0.6), iy + 1, Math.round(gw * 0.12), 1, '#ffffff', 0.35); }
  if (o.flash && o.flash > 0) ui.fill(gx, iy, Math.max(fv, 1), ih, '#ffffff', Math.min(1, o.flash) * 0.75);
  // the end caps
  for (const side of [0, 1]) {
    const cx = side ? gx + gw : x;
    if (o.crystal) {
      // a cut-crystal point: a faceted wedge, lit facet top, shaded facet bottom
      const C = ramp('#9a8cff');
      for (let i = 0; i < cap; i++) {
        const k = side ? i : cap - 1 - i; // columns toward the tip
        const half = Math.max(1, Math.round(((h - 1) / 2) * (1 - k / (cap + 1))));
        const mid = y + Math.floor(h / 2);
        const xx = side ? cx + i : cx + i;
        ui.fill(xx, mid - half, 1, half * 2 + 1, PAL.ink2);
        if (half > 1) { ui.fill(xx, mid - half + 1, 1, half - 1, C[4]); ui.fill(xx, mid, 1, half - 1 + 1, C[2]); ui.fill(xx, mid, 1, 1, C[5]); }
      }
      continue;
    }
    // a brass collar: a cylinder (lit top band, base, shaded bottom), a raised ring and a screw dot
    ui.fill(cx, y - 1, cap, h + 2, PAL.ink2);
    ui.fill(cx + 1, y, cap - 2, h, B[3]);
    ui.fill(cx + 1, y, cap - 2, Math.max(1, Math.round(h * 0.3)), B[4]);
    ui.fill(cx + 1, y, cap - 2, 1, B[5]);
    ui.fill(cx + 1, y + h - 1, cap - 2, 1, B[1]);
    const rx = side ? cx + 1 : cx + cap - 3;
    ui.fill(rx, y, 1, h, B[5]); ui.fill(rx + 1, y, 1, h, B[1]);
    const sx = side ? cx + cap - 3 : cx + 2, sy = y + Math.floor(h / 2);
    if (cap >= 5) { ui.fill(sx - 1, sy - 1, 2, 2, B[1]); ui.fill(sx - 1, sy - 1, 1, 1, B[5]); }
  }
}

const KELP_OFF = true;
/** a strand of kelp hanging from (x, y), `len` px, swaying from its root (drawn per frame: a few dozen pixels) */
export function kelp(ui: PixelUI, x: number, y: number, len: number, t: number, ph: number, alpha: number) {
  // v8b: retired (no kelp in the kit)
  if (KELP_OFF) return;
  const K = ['#1f4a16', '#3a7a28', '#5fae3f', '#a6e07a'];
  let px = x;
  for (let k = 0; k < len; k++) {
    const sway = Math.sin(t * 1.3 + k * 0.12 + ph) * (k / len) * 4;
    px = x + Math.round(sway);
    const wd = k < len - 6 ? 3 : 2;
    ui.fill(px - 1, y + k, wd + 2, 1, K[0], alpha);
    ui.fill(px, y + k, wd, 1, K[2], alpha);
    ui.fill(px, y + k, 1, 1, K[3], alpha);
    // a blade every 7 px, alternating sides
    if (k % 7 === 3) { const sd = (Math.floor(k / 7) % 2) ? 1 : -1; for (let j = 1; j <= 4; j++) { ui.fill(px + (sd > 0 ? wd + j - 1 : -j), y + k + Math.floor(j / 2), 1, 2, j === 4 ? K[0] : K[1], alpha); } }
  }
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
/**
 * SEA GRAPES (the shop's / the seabed's instant heal, v6): a sprig of glassy green bead-weed (Caulerpa) on a curling
 * runner, 18 x 18. Every bead is a little lit sphere: an ink rim, a shadowed lower-right, a light upper-left, a white
 * glint; a few beads at the back a step darker.
 */
let grapeCv: HTMLCanvasElement | null = null;
export function seaGrapeIcon(): HTMLCanvasElement {
  if (grapeCv) return grapeCv;
  const p = new Px(18, 18);
  const G = ['#0e2a12', '#1d4a1e', '#2f7a2c', '#4fa83a', '#86d05a', '#c8f09a'];
  // the runner: a curling stem from the bottom left, and two side sprigs
  const stem: [number, number][] = [[3, 17], [4, 16], [5, 15], [6, 14], [7, 13], [8, 12], [8, 11], [9, 10], [9, 9], [9, 8], [10, 7], [10, 6], [10, 5]];
  for (const [x, y] of stem) { p.set(x, y, G[1]); p.set(x + 1, y, G[0]); }
  for (const [x, y] of [[8, 12], [7, 11], [6, 10], [5, 10]] as [number, number][]) p.set(x - 1, y, G[1]);
  for (const [x, y] of [[10, 9], [11, 9], [12, 8], [13, 8]] as [number, number][]) p.set(x, y, G[1]);
  const bead = (cx: number, cy: number, back = false) => {
    const o = back ? 1 : 0;
    const rows = ['.kkk.', 'kLHmk', 'kLmdk', 'kmddk', '.kkk.'];
    const pal: Record<string, string> = { k: G[0], H: back ? G[4] : '#ffffff', L: G[4 - o], m: G[3 - o], d: G[2 - o] };
    rows.forEach((r, y) => { for (let x = 0; x < 5; x++) { const c = pal[r[x]]; if (c) p.set(cx - 2 + x, cy - 2 + y, c); } });
  };
  for (const [x, y] of [[12, 3], [7, 3], [14, 6], [5, 7], [15, 10]] as [number, number][]) bead(x, y, true);
  for (const [x, y] of [[10, 2], [8, 6], [12, 6], [3, 9], [7, 9], [13, 11], [10, 12], [16, 13]] as [number, number][]) bead(x, y);
  grapeCv = p.done();
  return grapeCv;
}

/** v6: every small glyph is a little hand-shaded sprite: an ink outline, 4-5 hue-shifted tones lit from the top left */
const GI = '#140a06';
export const GLYPH = {
  // a stilt hut on the reef: a thatched roof in three tones, plank walls, a lit window, a dark door
  house: () => pixGlyph('house6', [
    '.....kk.....',
    '....kTTk....',
    '...kTTRrk...',
    '..kTRRRrrk..',
    '.kTRRRRRrrk.',
    'kkkkkkkkkkkk',
    '.kWWwwWwdkk.',
    '.kWyywWodkk.',
    '.kWyhwWodkk.',
    '.kwwwwwodkk.',
    '.kkkkkkkkk..',
    '..k.....k...',
  ], { k: GI, T: '#f0c070', R: '#c07a34', r: '#7a4420', W: '#f0d49a', w: '#c8a070', d: '#8a6a40', y: '#ffe890', h: '#fff8d0', o: '#3a2010' }),
  // the depth arrow: a sea-glass chevron in four blues with a lit edge
  down: () => pixGlyph('down6', [
    'kkkkkkkkk',
    'kHHLLLLmk',
    '.kHLLLmdk',
    '..kLLmdk.',
    '...kmdk..',
    '....kk...',
  ], { k: GI, H: '#e8f8ff', L: '#8ac8ff', m: '#3d8fd6', d: '#1d5a96' }),
  skull: () => pixGlyph('skull6', ['.kkkkk.', 'kWwwwwk', 'kwkwkdk', 'kwwwwdk', '.kwkdk.', '..kkk..'], { k: GI, W: '#ffffff', w: PAL.cream, d: PAL.cream2 }),
  // a brass pocket watch: a domed rim in four tones, a cream face, the hands at ten past
  clock: () => pixGlyph('clock6', [
    '...kkk...',
    '..kBBbk..',
    '.kBccccdk',
    'kBcckccdk',
    'kBcckkcdk',
    'kbcccccdk',
    '.kbdcccdk',
    '..kkdddk.',
    '...kkkk..',
  ], { k: GI, B: '#f2c66d', b: '#c8913a', c: '#fff4dc', d: '#b8a074' }),
  // a little reef fish: a lit back, a striped flank, a pale belly, an eye with a glint, a forked tail
  fish: () => pixGlyph('fish6', [
    '....kkkk...kk',
    '..kkHHHLk.kLk',
    '.kHLsLLmmkLmk',
    'kwkLsLmmmmmdk',
    'kLLLsmmmddkmk',
    '.kbbbbbddk.kk',
    '..kkkkkkk....',
  ], { k: GI, H: '#d8f0ff', L: '#8ac8ff', m: '#3d8fd6', d: '#1d5a96', s: '#f2c66d', b: '#c8e8f0', w: '#ffffff' }),
  star: () => pixGlyph('star6', ['....k....', '...kHk...', 'kkkkHLkkk', 'kHHLLLmmk', '.kLLLLmk.', '.kLmkmmk.', 'kLmk.kmdk', 'kkk...kkk'], { k: GI, H: '#fff4c8', L: '#f2c66d', m: '#c8913a', d: '#8a5a24' }),
  check: () => pixGlyph('check6', ['.......kk', '......kHk', 'kk...kLmk', 'kHk.kLmk.', '.kLkLmk..', '..kLmk...', '...kk....'], { k: GI, H: '#d8f8a0', L: PAL.kelp2, m: PAL.kelp }),
  // a glassy bubble: a two-tone rim (lit top left, teal-shadowed bottom right), a highlight, a hint of reflection
  bubble: () => pixGlyph('bubble6', ['.kkk.', 'kw.lk', 'k...d', 'l..rd', '.ddd.'], { k: '#e6faff', l: '#b8e4ec', d: '#6ab0bc', w: '#ffffff', r: '#9ad4dc' }),
  bubbleS: () => pixGlyph('bubbleS6', ['.k.', 'kwd', '.d.'], { k: '#e6faff', w: '#ffffff', d: '#6ab0bc' }),
  book: () => pixGlyph('book6', ['.kkkk.kkkk.', 'kWwwwkwwwdk', 'kwbbwkwbbdk', 'kwwwwkwwwdk', 'kwbbwkwbbdk', 'kwwwddwwddk', 'kkkkkkkkkkk', '.rR.....rR.'], { k: '#3a2410', W: PAL.paper, w: PAL.cream, d: PAL.cream1, b: '#a08a64', r: PAL.coral, R: PAL.coral1 }),
  // a parcel in kraft paper: lit top face, shaded side, a red string tied over it, a stamp in the corner
  parcel: () => pixGlyph('parcel6', ['.kkkkkkkk.', 'kHHHrHHHLk', 'kLLLrLLsSk', 'krrrRrrrrk', 'kLLLrLLLdk', 'kddLrLddDk', '.kkkkkkkk.'], { k: GI, H: '#f0d0a0', L: '#c8a070', d: '#9a7448', D: '#6a4a2a', r: '#e0564a', R: '#9a2a24', s: '#3d8fd6', S: '#8ac8ff' }),
  parcelOff: () => pixGlyph('parcelOff6', ['.k.k.k.k.', 'k........', '........k', 'k........', '........k', 'k........', '.k.k.k.k.'], { k: '#6fb8b0' }),
  // a scallop shell pip for the heal clam's charges (full / spent)
  clamPip: () => pixGlyph('clamPip', ['..kkkkk..', '.kHLsLLk.', 'kHLsLsLmk', 'kLsLsLsmk', '.kmsmsmk.', '..kVVVk..', '...kkk...'], { k: GI, H: '#ffd8cc', L: '#f0a090', s: '#c0443e', m: '#b86a6a', V: '#9a5a86' }),
  clamPipOff: () => pixGlyph('clamPipOff', ['..kkkkk..', '.kddddek.', 'kdeedeedk', 'kdedededk', '.kededek.', '..keeek..', '...kkk...'], { k: '#0a141a', d: '#2a3a40', e: '#1a282e' }),
};
