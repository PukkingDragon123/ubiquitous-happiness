// The title's 2D logo (v7: no 3D text anywhere): BLOBFISH in chunky 1x pixel art over a driftwood name board that
// reads REEL REBELLION, drawn on the title's PixelUI over the scene.
//
//   - the letters: fat jelly letters in blobfish-flesh pink (a 7-tone plum -> peach ramp, clean bands), a lit top /
//     left rim and a shine stripe, a shaded bottom / right rim, a 5 px plum extrusion below and an ink outline; the
//     O is a brass porthole (riveted ring, dark water behind glass, a little moon jelly pulsing past behind it);
//     hand-placed sea life on them: barnacles on the first B, a coralline crust on the L, an algae film on the second
//     B, a sea star on the F, a whelk snail climbing the I, a limpet on the S, barnacles and algae on the H
//   - the name board: one weathered plank (grain runs, a knot, salt-bleached ends, a chipped corner, nails, rope
//     lashings, barnacles, an algae film, a coralline crust), REEL REBELLION gold-leafed on it in the kit font
//   - live: every letter bobs on its own swell, kelp fronds sway up behind the board, rope ends swing, bubbles rise
//     off the letters, a caustic web slides over them and a glint sweeps across every few seconds; it drops in letter
//     by letter with a splash of bubbles, and a click on it (poke) makes the letters jump and the jelly tumble
//
//   const logo = new Logo();  logo.draw(ui, x, y, { t, appear, alpha });   logo.w / logo.h (UI px);  logo.poke()
import { Px, R, hx, hash, stamp, SPR, algae, coralline, nail, wraps, type C, type Spr } from '../ui/pixel/decor';
import type { PixelUI } from '../ui/pixel/ui';
import { easeOutBack, clamp01 } from '../core/math';
import { jelly } from './seaSprites';

const rampC = (...s: string[]) => s.map(hx);
/** blobfish flesh, plum shadows -> peach lights (7): the PINK letters */
export const FLESH = rampC('#2a0b24', '#5e1a3c', '#93304f', '#c94f66', '#e9767c', '#ffa594', '#ffd6bc');
/** the letters' extrusion (their plum underside, dark -> lit lip) */
const SIDE = rampC('#12081a', '#261028', '#3c1634', '#561e40');
const BSIDE = rampC('#24100a', '#4a240e', '#7a4416', '#a86a24');
const OUTL = hx('#0d0610');
const BR = R.brass, WA = R.water, WD = R.wood, SALT = R.salt;
const KELP = ['#0c200e', '#183a14', '#28561c', '#3c7426', '#559234', '#78b04a', '#a8d06c'];

/** cap height of the letters (UI px), the extrusion depth and the outline pad */
const CAP = 44, EX = 5, PAD = 2;
const WORD = 'BLOBFISH';
/** per-letter tilt (radians) and baseline bounce (px): hand-set so the word jiggles like jelly */
const ROT = [-0.08, 0.06, 0, -0.05, 0.07, -0.03, 0.06, -0.07];
const BOUNCE = [1, -2, 0, 2, -1, 1, -2, 1];

interface Mask { w: number; h: number; m: Uint8Array }
const mget = (k: Mask, x: number, y: number) => x >= 0 && y >= 0 && x < k.w && y < k.h && k.m[y * k.w + x] === 1;

/** a hard on/off mask of one letter in the bubbly display face, rotated, trimmed to its ink */
function glyphMask(ch: string, px: number, rot: number): Mask {
  const S = Math.ceil(px * 2);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d', { willReadFrequently: true })!;
  x.font = `${px}px 'Goofy'`; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
  x.translate(S / 2, S / 2); x.rotate(rot); x.fillText(ch, 0, px * 0.36);
  const d = x.getImageData(0, 0, S, S).data;
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) if (d[(y * S + xx) * 4 + 3] > 110) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return { w: 1, h: 1, m: new Uint8Array(1) };
  const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) m[y * w + xx] = d[((y + y0) * S + xx + x0) * 4 + 3] > 110 ? 1 : 0;
  // fill pinholes (a lone empty pixel with 3+ filled neighbours) so the bevel bands stay clean
  for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
    if (m[y * w + xx]) continue;
    const n = m[y * w + xx - 1] + m[y * w + xx + 1] + m[(y - 1) * w + xx] + m[(y + 1) * w + xx];
    if (n >= 3) m[y * w + xx] = 1;
  }
  return { w, h, m };
}
function diskMask(D: number): Mask {
  const m = new Uint8Array(D * D), r = D / 2;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) m[y * D + x] = (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r ? 1 : 0;
  return { w: D, h: D, m };
}

interface Glyph {
  /** the letter, its glint variant (lit two tones up), its silhouette (the drop shadow) */
  cv: HTMLCanvasElement; lit: HTMLCanvasElement; sil: HTMLCanvasElement;
  w: number; h: number;
  /** the porthole's glass (canvas px): centre and radius */
  glass?: [number, number, number];
}

/** shape helpers for a face mask placed at (PAD, PAD) on a canvas with room for the outline and the extrusion */
function shapeOf(F: Mask) {
  const W = F.w + PAD * 2 + 2, H = F.h + PAD * 2 + EX;
  const depth = new Int8Array(W * H);
  const f = (x: number, y: number) => mget(F, x - PAD, y - PAD);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (f(x, y)) { depth[y * W + x] = -1; continue; }
    for (let d = 1; d <= EX; d++) if (f(x - Math.round(d * 0.3), y - d)) { depth[y * W + x] = d; break; }
  }
  const S = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && depth[y * W + x] !== 0;
  const isFace = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && depth[y * W + x] === -1;
  return { W, H, depth, f, S, isFace };
}

/** outline + extrusion for a shape (shared by letters and the porthole) */
function paintShell(px: Px, sh: ReturnType<typeof shapeOf>, side: C[]) {
  const { W, H, depth, S, f } = sh;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (S(x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && S(x + dx, y + dy)) { px.set(x, y, OUTL); dy = 2; break; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = depth[y * W + x]; if (d <= 0) continue;
    const lip = f(x, y - 1) || f(x - 1, y - 1);
    const t = !S(x, y + 1) ? 0 : lip && d <= 1 ? 3 : !S(x - 1, y) ? 2 : (x + d) % 7 === 0 ? 2 : 1;
    px.set(x, y, side[t]);
  }
}

/** distance (1..4, 5 = further) from a face pixel to the outside along a direction */
function run(isFace: (x: number, y: number) => boolean, x: number, y: number, dx: number, dy: number) { for (let k = 1; k <= 4; k++) if (!isFace(x + dx * k, y + dy * k)) return k; return 5; }

/** a sprite stamped only onto the letter face (cast shadow included) */
function stampFace(px: Px, isFace: (x: number, y: number) => boolean, s: Spr, x: number, y: number, flip = false) {
  x = Math.round(x); y = Math.round(y);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= s.w || j >= s.h ? null : s.px[j * s.w + (flip ? s.w - 1 - i : i)]);
  for (let j = 0; j <= s.h; j++) for (let i = 0; i <= s.w; i++) if (!at(i, j) && at(i - 1, j - 1) && isFace(x + i, y + j)) px.shade(x + i, y + j, 0.62);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const c = at(i, j); if (c && isFace(x + i, y + j)) px.set(x + i, y + j, c); }
}

/** the face pixel nearest the bottom of the letter at a fraction u of its width (for decals that sit on a foot) */
function footAt(sh: ReturnType<typeof shapeOf>, F: Mask, u: number): [number, number] {
  const x = PAD + Math.round(F.w * u);
  for (let y = sh.H - 1; y >= 0; y--) if (sh.isFace(x, y)) return [x, y];
  return [x, PAD + F.h - 1];
}

/** a jelly-letter palette: the face ramp (7, dark -> light) and the extrusion ramp (4) */
export interface JellyPal { face: C[]; side: C[] }
export const PINK: JellyPal = { face: FLESH, side: SIDE };
/** sea-glass green (the pause title) */
export const SEAGLASS: JellyPal = { face: rampC('#071e22', '#12403e', '#1f6a5e', '#33927c', '#5cbc98', '#98e0bc', '#dcfcea'), side: rampC('#040e12', '#08191e', '#0e262c', '#15363c') };

function paintLetter(F: Mask, i: number, lit: number, pal: JellyPal = PINK, details = true): { cv: HTMLCanvasElement; sh: ReturnType<typeof shapeOf> } {
  const sh = shapeOf(F);
  const { W, H, isFace } = sh;
  const px = new Px(W, H);
  paintShell(px, sh, pal.side);
  const fy0 = PAD, fy1 = PAD + F.h - 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isFace(x, y)) continue;
    const up = run(isFace, x, y, 0, -1), lf = run(isFace, x, y, -1, 0), dn = run(isFace, x, y, 0, 1), rt = run(isFace, x, y, 1, 0);
    const v = (y - fy0) / Math.max(1, fy1 - fy0);
    // the body in three clean bands, lighter at the top
    let t = v < 0.4 ? 4 : 3;
    // the shaded bottom / right rim, two pixels deep
    if (dn === 1 || rt === 1) t = 1;
    else if (dn === 2 || (rt === 2 && dn <= 3)) t = Math.min(t, 2);
    // the lit top / left rim
    if (up === 1 || lf === 1) t = up === 1 && lf > 1 && v < 0.35 ? 6 : 5;
    else if (up === 2 || lf === 2) t = Math.max(t, 4);
    // a shine stripe three pixels in from the top edge on the upper-left of each stroke
    if (up === 3 && lf >= 3 && dn >= 3 && v < 0.42 && x - PAD < F.w * 0.6) t = 6;
    px.set(x, y, pal.face[Math.max(0, Math.min(6, t + lit))]);
  }
  if (!details) return { cv: px.done(), sh };
  // hand-placed sea life (the same on the glint variant, so the sweep only lifts the flesh)
  const ch = WORD[i];
  const seed = 17 + i * 7;
  if (i === 0) { // B: a barnacle cluster on its foot
    const [x, y] = footAt(sh, F, 0.22);
    stampFace(px, isFace, SPR.barnacleL, x - 2, y - 4); stampFace(px, isFace, SPR.barnacleM, x + 4, y - 3); stampFace(px, isFace, SPR.barnacleS, x + 1, y - 7);
  } else if (ch === 'L') { // a coralline crust spreading over the L's foot
    const [x, y] = footAt(sh, F, 0.72);
    coralline(px, x, y - 2, 6, 3, seed, { inside: isFace });
  } else if (i === 3) { // the second B: an algae film on its lower bowl
    const [x, y] = footAt(sh, F, 0.55);
    algae(px, x, y - 1, 8, 4, seed, { inside: isFace });
  } else if (ch === 'F') { // a sea star clinging to the F's top arm
    stampFace(px, isFace, SPR.star, PAD + Math.round(F.w * 0.58), PAD + 2);
  } else if (ch === 'I') { // a whelk snail creeping up the I
    stampFace(px, isFace, SPR.snail, PAD + Math.round(F.w / 2) - 4, PAD + Math.round(F.h * 0.42));
  } else if (ch === 'S') { // a limpet on the S's lower curve
    const [x, y] = footAt(sh, F, 0.3);
    stampFace(px, isFace, SPR.limpet, x - 3, y - 5);
  } else if (ch === 'H') { // barnacles on the H's right foot, algae on its left
    const [x, y] = footAt(sh, F, 0.82);
    stampFace(px, isFace, SPR.barnacleM, x - 2, y - 3); stampFace(px, isFace, SPR.barnacleS, x - 5, y - 2);
    const [ax, ay] = footAt(sh, F, 0.16);
    algae(px, ax, ay - 1, 5, 4, seed, { inside: isFace, brown: true });
  }
  return { cv: px.done(), sh };
}

/** the porthole O: a riveted brass ring round dark water behind glass */
function paintPorthole(lit: number): { cv: HTMLCanvasElement; sh: ReturnType<typeof shapeOf>; glass: [number, number, number] } {
  const D = CAP + 2, F = diskMask(D), sh = shapeOf(F);
  const { W, H, isFace } = sh;
  const px = new Px(W, H);
  paintShell(px, sh, BSIDE);
  const c = PAD + D / 2, ro = D / 2, ri = ro - 7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isFace(x, y)) continue;
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), l = -(dx * 0.6 + dy * 0.8) / Math.max(0.01, r);
    let col: C;
    if (r >= ri) {
      let t: number;
      if (ro - r < 1.3) t = l > 0.2 ? 7 : l > -0.35 ? 5 : 2;                 // outer bevel: lit top-left
      else if (r - ri < 1.3) t = l > 0.2 ? 2 : l > -0.35 ? 3 : 6;            // inner bevel: lit bottom-right
      else if (Math.abs(r - (ri + 3.2)) < 0.55) t = l > 0 ? 3 : 2;           // an engraved groove round the ring
      else t = l > 0.5 ? 6 : l > 0.05 ? 5 : l > -0.45 ? 4 : 3;
      col = BR[Math.max(0, Math.min(7, t + lit))];
    } else {
      // water behind glass: depth bands, the ring's cast shadow on the upper-left, two reflection streaks
      const v = (y - (c - ri)) / (2 * ri);
      let t = v < 0.28 ? 6 : v < 0.6 ? 5 : 4;
      if (r > ri - 2.2 && l > 0.1) t = 3;
      const s = (x - PAD) + (y - PAD);
      if (r < ri - 2 && dx < 0 && dy < 0 && (s === Math.round(D * 0.42) || s === Math.round(D * 0.42) + 1 || s === Math.round(D * 0.42) + 4)) t = 8;
      col = WA[t];
    }
    px.set(x, y, col);
  }
  // eight rivets round the ring
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, rm = (ri + ro) / 2 + 0.3;
    const x = Math.round(c + Math.cos(a) * rm - 1), y = Math.round(c + Math.sin(a) * rm - 1);
    px.set(x, y, BR[7]); px.set(x + 1, y, BR[5]); px.set(x, y + 1, BR[4]); px.set(x + 1, y + 1, BR[1]);
    if (isFace(x + 2, y + 2)) px.shade(x + 2, y + 2, 0.7);
  }
  // a verdigris bloom in the groove at the bottom and a barnacle on the ring
  for (let k = -3; k <= 3; k++) { const a = Math.PI / 2 + k * 0.09; const x = Math.round(c + Math.cos(a) * (ri + 3.2) - 0.5), y = Math.round(c + Math.sin(a) * (ri + 3.2) - 0.5); if (isFace(x, y)) px.set(x, y, R.verd[k % 2 ? 1 : 2]); }
  stampFace(px, isFace, SPR.barnacleS, Math.round(c + ro * 0.55), Math.round(c + ro * 0.58));
  return { cv: px.done(), sh, glass: [c, c, ri - 0.5] };
}

/** a black silhouette of the whole shape grown by a pixel (the drop shadow) */
function silOf(sh: ReturnType<typeof shapeOf>): HTMLCanvasElement {
  const b = new Px(sh.W, sh.H);
  const black: C = [0, 0, 0];
  for (let y = 0; y < sh.H; y++) for (let x = 0; x < sh.W; x++) {
    let s = sh.S(x, y);
    for (let dy = -1; dy <= 1 && !s; dy++) for (let dx = -1; dx <= 1 && !s; dx++) s = sh.S(x + dx, y + dy);
    if (s) b.set(x, y, black);
  }
  return b.done();
}

/** the driftwood name board, w x h (UI px), with room around it for the rope lashings */
function paintBoard(w: number, h: number): HTMLCanvasElement {
  const M = 2, W = w + M * 2, H = h + M * 2 + 1;
  const px = new Px(W, H);
  // the board's outline: rounded ends, a chipped top-right corner, a split bottom-left end
  const endL = [3, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3, 4, 5, 6, 7];
  const endR = [6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 2, 3, 4, 5];
  const inB = (x: number, y: number) => {
    if (y < 0 || y >= h) return false;
    const k = Math.min(endL.length - 1, Math.round((y / (h - 1)) * (endL.length - 1)));
    return x >= endL[k] && x < w - endR[k];
  };
  const set = (x: number, y: number, c: C) => px.set(x + M, y + M, c);
  // ink outline (and a soft shadow line under the board)
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (inB(x, y)) continue;
    if (inB(x - 1, y) || inB(x + 1, y) || inB(x, y - 1) || inB(x, y + 1)) set(x, y, R.ink);
  }
  const knotX = Math.round(w * 0.31), knotY = Math.round(h * 0.55);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inB(x, y)) continue;
    // across the board: a lit top edge, a rounded face, a shaded lower edge
    let t = y === 0 ? 7 : y === 1 ? 6 : y >= h - 1 ? 2 : y >= h - 2 ? 3 : 5;
    if (!inB(x - 1, y)) t = Math.max(t, 6); else if (!inB(x + 1, y)) t = Math.min(t, 3);
    // grain runs every ~4 px, wandering a pixel, broken unevenly, with a lit lip under some
    for (let g = 3; g < h - 2; g += 4) {
      const row = g + Math.round(Math.sin((x + g * 13) / (11 + g)) * 1.1);
      const on = hash(Math.floor((x + g * 5) / 13), g) > 0.25;
      if (on && y === row) t -= 2;
      else if (on && y === row + 1 && hash(Math.floor(x / 5), g + 99) > 0.55) t += 1;
    }
    // a knot with the grain wrapping round it
    const e = ((x - knotX) / 3.2) ** 2 + ((y - knotY) / 1.6) ** 2;
    if (e < 0.35) t = 0; else if (e < 1) t = 2; else if (e < 2.1) t = Math.max(1, t - 1);
    if (e >= 0.6 && e < 1.5 && x > knotX && y > knotY) t = 7;
    t = Math.max(0, Math.min(8, t));
    let col = WD[t];
    // salt-bleached ends: the wood greys toward driftwood
    const endD = Math.min(x, w - 1 - x);
    if (endD < 4 || (endD < 9 && t >= 5) || (endD < 13 && t >= 7)) col = SALT[Math.max(0, Math.min(6, t - 1))];
    set(x, y, col);
  }
  // nails beside the lashings and in the middle
  for (const [nx, ny] of [[13, 3], [13, h - 6], [w - 15, 3], [w - 15, h - 6], [Math.round(w / 2) - 1, 2]] as const) nail(px, nx + M, ny + M, 2);
  // rope lashings near both ends
  wraps(px, 5 + M, M, h, true, 2);
  wraps(px, w - 12 + M, M, h, true, 2);
  // barnacles on the lower-left, an algae film creeping up the lower-right, a coralline crust on the top-left corner
  const onB = (x: number, y: number) => inB(x - M, y - M);
  stamp(px, SPR.barnacleM, 16 + M, h - 4 + M, { onlyOn: true }); stamp(px, SPR.barnacleS, 21 + M, h - 3 + M, { onlyOn: true }); stamp(px, SPR.barnacleS, 18 + M, h - 6 + M, { onlyOn: true });
  algae(px, w - 26 + M, h - 1 + M, 12, 4, 5, { inside: onB });
  coralline(px, 3 + M, 2 + M, 4, 3, 9, { inside: onB });
  stamp(px, SPR.scallop, w - 30 + M, 2 + M, { onlyOn: true });
  return px.done();
}

export class Logo {
  w = 0; h = 0;
  private built = false;
  private glyphs: (Glyph & { x: number; y: number })[] = [];
  private board!: HTMLCanvasElement;
  private boardX = 0; private boardY = 0; private boardW = 0; private boardH = 0;
  private pokeT = 9;
  private nextBubble = 0;
  private landed = new Set<number>();
  /** where the letters' area ends (the board's top) */
  private lettersH = 0;
  readonly sub = 'REEL REBELLION';

  /** build the art now (its size is known from here on) */
  prepare(ui: PixelUI) { if (!this.built) this.build(ui); }
  private build(ui: PixelUI) {
    this.built = true;
    // size the display face so an H is CAP px tall
    const probe = glyphMask('H', 60, 0);
    const fpx = Math.round((60 * CAP) / Math.max(1, probe.h));
    let x = 0;
    WORD.split('').forEach((ch, i) => {
      let g: Glyph;
      if (ch === 'O') {
        const a = paintPorthole(0), b = paintPorthole(2);
        g = { cv: a.cv, lit: b.cv, sil: silOf(a.sh), w: a.sh.W, h: a.sh.H, glass: a.glass };
      } else {
        const F = glyphMask(ch, fpx * (i === 0 ? 1.08 : 1), ROT[i]);
        const a = paintLetter(F, i, 0), b = paintLetter(F, i, 2);
        g = { cv: a.cv, lit: b.cv, sil: silOf(a.sh), w: a.sh.W, h: a.sh.H };
      }
      // letters stand on a common baseline (their face bottoms), bounced a little each
      const faceH = g.h - PAD * 2 - EX;
      const y = CAP + 2 - faceH + BOUNCE[i] + (i === 0 ? 0 : 0);
      this.glyphs.push({ ...g, x, y });
      x += g.w - PAD * 2 - 3 + (ch === 'O' ? 1 : 0);
    });
    const lw = x + PAD * 2 + 3;
    const top = Math.min(...this.glyphs.map((g) => g.y));
    for (const g of this.glyphs) g.y -= top;
    this.lettersH = Math.max(...this.glyphs.map((g) => g.y + g.h));
    // the name board under the letters (they stand on its top edge)
    const tw = Math.ceil(ui.measure(this.sub, 'title'));
    this.boardW = Math.max(tw + 54, Math.round(lw * 0.7));
    this.boardH = 27;
    this.board = paintBoard(this.boardW, this.boardH);
    const W = Math.max(lw, this.boardW + 8);
    const ox = Math.round((W - lw) / 2);
    for (const g of this.glyphs) g.x += ox + 4;
    this.boardX = Math.round((W - this.boardW) / 2) + 4 - 2;
    // the letters' extrusions overlap the board's top edge by a few px; the words sit below them
    this.boardY = this.lettersH - 7;
    this.w = W + 8;
    this.h = this.boardY + this.boardH + 18;
  }

  /** the letters jump in a wave and the porthole fish spins (a click on the logo) */
  poke() { this.pokeT = 0; }

  /** the rect the logo covers at (x, y) (for hit tests) */
  rect(x: number, y: number): [number, number, number, number] { return [x, y, this.w, this.boardY + this.boardH + 2]; }

  /**
   * draw at (x, y) UI px. t: the screen clock (s); appear: seconds since the logo started showing (>= 1.6 = fully in);
   * alpha: an overall fade (leaving).
   */
  draw(ui: PixelUI, x: number, y: number, o: { t: number; appear: number; alpha?: number }) {
    if (!this.built) this.build(ui);
    const t = o.t, ap = o.appear, A = o.alpha ?? 1, dt = ui.dt;
    if (A <= 0.01) return;
    this.pokeT += dt;
    x = Math.round(x); y = Math.round(y);
    const ctx = ui.ctx;
    // ---- where each letter is this frame: dropped in one by one, then bobbing on its own swell (whole pixels)
    const pos = this.glyphs.map((g, i) => {
      const k = clamp01((ap - 0.15 - i * 0.085) / 0.42);
      if (k <= 0) return null;
      let dy = -Math.round((1 - easeOutBack(k, 2.6)) * 26);
      if (k >= 1 && !this.landed.has(i)) {
        this.landed.add(i);
        for (let b = 0; b < 3; b++) ui.bubble(x + g.x + 6 + b * Math.round(g.w / 4), y + g.y + g.h - 8, { r: 1 + (b % 2), vy: -14 - b * 5, delay: b * 0.04 });
      }
      if (k < 1) this.landed.delete(i);
      dy += Math.round(Math.sin(t * 1.7 - i * 0.62) * 1.3);
      if (this.pokeT < 1.2) { const p = this.pokeT - i * 0.05; if (p > 0) dy -= Math.round(Math.max(0, Math.sin(p * 9)) * 6 * Math.exp(-p * 3.2)); }
      return { x: x + g.x, y: y + g.y + dy, a: Math.min(1, k * 3) * A };
    });
    const boardK = clamp01((ap - 0.05) / 0.5);
    const bdy = Math.round((1 - easeOutBack(boardK, 2)) * 10), bA = boardK * A;
    const bx = x + this.boardX, by = y + this.boardY + bdy;
    // ---- kelp swaying up behind the board (it grows in as the logo appears)
    const grow = clamp01(ap / 1.1);
    if (bA > 0) {
      const g0 = this.glyphs[0], gn = this.glyphs[this.glyphs.length - 1];
      const lx = Math.min(bx + 6, x + g0.x + 4), rx = Math.max(bx + this.boardW - 6, x + gn.x + gn.w - 6);
      this.kelpUp(ui, lx, by + this.boardH + 8, Math.round(84 * grow), t, 0.3, -1);
      this.kelpUp(ui, lx + 9, by + this.boardH + 8, Math.round(46 * grow), t, 2.1, -1);
      this.kelpUp(ui, rx, by + this.boardH + 8, Math.round(78 * grow), t, 4.2, 1);
      this.kelpUp(ui, rx - 10, by + this.boardH + 8, Math.round(38 * grow), t, 1.3, 1);
    }
    // ---- soft drop shadows (letters and board) on the scene behind
    pos.forEach((p, i) => { if (p) ui.img(this.glyphs[i].sil, p.x + 2, p.y + 3, { alpha: 0.32 * p.a }); });
    if (bA > 0) ui.fill(bx + 3, by + this.boardH + 3, this.boardW - 4, 2, '#000000', 0.25 * bA);
    // ---- the name board and its gold-leafed words
    if (bA > 0) {
      ui.img(this.board, bx - 2, by - 2, { alpha: bA });
      // rope ends dangling from the lashings
      ui.ropeEnd(bx + 8, by + this.boardH, 4, 0.4);
      ui.ropeEnd(bx + this.boardW - 9, by + this.boardH, 5, 2.2);
      const tx = bx + Math.round(this.boardW / 2), ty = by + 7 + Math.round((this.boardH - 7 - ui.cap('title')) / 2);
      // carved: a dark groove up-left, the gold leaf, a lit lower edge
      ui.text(this.sub, tx + 1, ty + 1, { font: 'title', color: '#ecca95', shadow: null, align: 'center', alpha: bA * 0.55 });
      ui.text(this.sub, tx, ty, { font: 'title', color: '#fff0b0', color2: '#e8b850', shadow: '#2e1a1c', align: 'center', alpha: bA });
    }
    // ---- the letters
    pos.forEach((p, i) => { if (p) ui.img(this.glyphs[i].cv, p.x, p.y, { alpha: p.a }); });
    // ---- the porthole jelly (behind the glass, drawn over the water, under the glass streaks): it drifts across the
    // window, pulsing its bell, and tumbles when the logo is poked
    const oi = WORD.indexOf('O'), op = pos[oi], og = this.glyphs[oi];
    if (op && og.glass && ui.deco) {
      const [gx, gy, gr] = og.glass;
      const cx = op.x + gx, cy = op.y + gy;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, gr - 0.5, 0, Math.PI * 2); ctx.clip();
      const spin = this.pokeT < 1.1;
      // the bell squeezes (a quick pulse), then glides up a little and sinks back
      const pulse = (t * 1.6) % 1, ph = pulse < 0.12 ? 1 : pulse < 0.24 ? 2 : pulse < 0.36 ? 3 : 0;
      const sx = Math.sin(t * 0.42) * (gr - 7), lift = pulse < 0.4 ? -pulse * 4 : -1.6 + (pulse - 0.4) * 2.6;
      const fish = jelly(ph);
      const fx = Math.round(cx + sx - fish.width / 2), fy = Math.round(cy - fish.height / 2 + lift + Math.sin(t * 0.7) * 1.5 + 1);
      ctx.globalAlpha = op.a;
      if (spin) {
        // a tumble when the logo is poked
        ctx.translate(Math.round(cx), Math.round(cy)); ctx.rotate(this.pokeT * 9); ctx.drawImage(fish, -Math.round(fish.width / 2), -Math.round(fish.height / 2));
      } else ctx.drawImage(fish, fx, fy);
      ctx.restore();
      // the glass catches the light over him
      const s0 = Math.round(gr * 0.42);
      for (let k = 0; k < 5; k++) ui.fill(cx - s0 + k - 3, cy - s0 - k + 1, 1, 1, '#a2d8cc', 0.55 * op.a);
      // a bead of air rises past it now and then
      if (!spin && (t % 3.1) < dt) ui.bubble(fx + fish.width - 2, fy + 2, { r: 1, vy: -10, life: 0.8 });
    }
    // ---- a glint sweeping across the word every few seconds (the lit variant, clipped to a slanted band)
    const per = 5.5, g0 = (t + 2) % per;
    if (g0 < 1.0 && ap > 1.4) {
      const bandX = x - 30 + (this.w + 60) * (g0 / 1.0), bw = 9, sl = 0.45;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bandX, y - 4); ctx.lineTo(bandX + bw, y - 4); ctx.lineTo(bandX + bw - this.h * sl, y + this.h); ctx.lineTo(bandX - this.h * sl, y + this.h); ctx.closePath();
      ctx.clip();
      pos.forEach((p, i) => { if (p) ui.img(this.glyphs[i].lit, p.x, p.y, { alpha: p.a * 0.85 }); });
      ctx.restore();
    }
    // ---- bubbles rising off the letters
    if (ap > 1 && t >= this.nextBubble && ui.deco) {
      const n = Math.floor(t * 7.3);
      const i = n % this.glyphs.length, p = pos[i];
      if (p) ui.bubble(p.x + 4 + (n * 13) % Math.max(1, this.glyphs[i].w - 8), p.y + 4, { r: 1 + (n % 3 === 0 ? 1 : 0), vy: -12 - (n % 4) * 3, life: 1.6 });
      this.nextBubble = t + 0.35 + ((n * 7) % 10) / 14;
    }
    // ---- a kelp frond draped over the board's right end, in front
    if (bA > 0.5) ui.kelp(bx + this.boardW - 3, by + 4, 1, 9, 1.7);
  }

  /**
   * a giant-kelp frond rising from (x, base) `len` px tall, swaying more toward its tip: a ruffled stipe (ink rim, a
   * lit left margin, a paler midrib, a shaded right margin), long blades peeling off it on alternating sides, each
   * from a little gas bladder, trailing in the swell (all on whole UI pixels)
   */
  private kelpUp(ui: PixelUI, x: number, base: number, len: number, t: number, ph: number, lean: -1 | 1) {
    if (len < 4) return;
    const rows: [number, number, number][] = [];
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const sway = Math.sin(t * 1.2 + ph - i * 0.07) * Math.pow(k, 1.2) * 5 + Math.sin(t * 0.55 + ph * 1.7) * k * 2.5 + lean * k * k * 9;
      const w = k > 0.92 ? 1 : k > 0.8 ? 2 : 3;
      rows.push([Math.round(x + sway - w / 2), base - i, w]);
    }
    // blades: [stipe row, side, length]
    const blades: [number, number, number][] = [];
    for (let i = 7, n = 0; i < len - 5; i += 6 + (n % 3), n++) blades.push([i, n % 2 ? 1 : -1, 9 + ((n * 5) % 5)]);
    const bladePts = blades.map(([i, side, L]) => {
      const [rx, ry, w] = rows[i];
      const sx = side < 0 ? rx - 1 : rx + w;
      const pts: [number, number, number][] = [];
      for (let j = 0; j < L; j++) {
        const droop = Math.round(j * 0.45 + Math.sin(t * 1.6 + ph + i * 0.4 + j * 0.3) * j * 0.12);
        pts.push([sx + side * j, ry + droop, j === 0 || j >= L - 2 ? 1 : 2]);
      }
      return pts;
    });
    // ink rims first (stipe + blades), then the fills
    for (const [rx, ry, w] of rows) ui.fill(rx - 1, ry - 1, w + 2, 3, KELP[0]);
    for (const pts of bladePts) for (const [bx, by, th] of pts) ui.fill(bx - 1, by - 1, 3, th + 2, KELP[0]);
    for (const pts of bladePts) pts.forEach(([bx, by, th], j) => { ui.fill(bx, by, 1, 1, j % 4 === 1 ? KELP[6] : KELP[5]); if (th > 1) ui.fill(bx, by + 1, 1, 1, KELP[3]); });
    rows.forEach(([rx, ry, w], i) => {
      if (w === 1) { ui.fill(rx, ry, 1, 1, KELP[4]); return; }
      ui.fill(rx, ry, w, 1, KELP[3]);
      ui.fill(rx, ry, 1, 1, KELP[5]);
      ui.fill(rx + w - 1, ry, 1, 1, KELP[2]);
      if (w >= 3) ui.fill(rx + 1, ry, 1, 1, (i >> 1) % 3 === 0 ? KELP[6] : KELP[4]);
    });
    // a gas bladder where each blade leaves the stipe
    for (const pts of bladePts) {
      const [bx, by] = pts[0];
      ui.fill(bx - 1, by - 1, 3, 3, KELP[0]);
      ui.fill(bx, by, 1, 1, '#c8b04a'); ui.fill(bx, by - 1 + 1, 1, 1, '#c8b04a');
      ui.fill(bx, by, 1, 1, '#ecd878');
    }
  }
}

/**
 * any word in the logo's jelly letters (no sea-life decals): the pause screen's title and the like. Letters bob on
 * their own swell and drop in one by one.
 *   const jw = new JellyWord('PAUSED', 30, SEAGLASS);  jw.draw(ui, x, y, t, appear)   (jw.w / jw.h once drawn)
 */
export class JellyWord {
  w = 0; h = 0;
  private gl: { cv: HTMLCanvasElement; sil: HTMLCanvasElement; x: number; y: number; w: number }[] = [];
  constructor(readonly word: string, readonly cap = 30, readonly pal: JellyPal = PINK) {}
  private build() {
    const probe = glyphMask('H', 60, 0);
    const fpx = Math.round((60 * this.cap) / Math.max(1, probe.h));
    let x = 0;
    [...this.word].forEach((ch, i) => {
      if (ch === ' ') { x += Math.round(this.cap * 0.4); return; }
      const F = glyphMask(ch, fpx, ROT[i % ROT.length] * 0.8);
      const a = paintLetter(F, i, 0, this.pal, false);
      const faceH = a.sh.H - PAD * 2 - EX;
      this.gl.push({ cv: a.cv, sil: silOf(a.sh), x, y: this.cap + 2 - faceH + Math.round(BOUNCE[i % BOUNCE.length] * 0.7), w: a.sh.W });
      x += a.sh.W - PAD * 2 - 3;
    });
    const top = Math.min(...this.gl.map((g) => g.y));
    for (const g of this.gl) g.y -= top;
    this.w = x + PAD * 2 + 3;
    this.h = Math.max(...this.gl.map((g) => g.y + g.cv.height));
  }
  /** measure without drawing */
  size(): [number, number] { if (!this.gl.length) this.build(); return [this.w, this.h]; }
  draw(ui: PixelUI, x: number, y: number, t: number, appear = 9, alpha = 1) {
    if (!this.gl.length) this.build();
    this.gl.forEach((g, i) => {
      const k = clamp01((appear - i * 0.06) / 0.35);
      if (k <= 0) return;
      const dy = -Math.round((1 - easeOutBack(k, 2.4)) * 16) + Math.round(Math.sin(t * 1.8 - i * 0.6) * 1.2);
      ui.img(g.sil, Math.round(x + g.x) + 2, Math.round(y + g.y + dy) + 3, { alpha: 0.3 * k * alpha });
      ui.img(g.cv, Math.round(x + g.x), Math.round(y + g.y + dy), { alpha: Math.min(1, k * 3) * alpha });
    });
  }
}
