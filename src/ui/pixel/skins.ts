// Painted UI skins, v5 "the diver's kit": every panel and button is painted per pixel at its exact size (cached),
// in FLAT tones only (no noise, no dither, no speckle): a dark lacquered-teal frame with brass corner brackets and
// rivets, a crisp 1 px highlight on top/left and a dark ink outline, around a clean inset (dark oilcloth with a
// stitched border, or flat cream card).
//
//   skin('wood', 160, 90)                       panel canvas
//   btnSkin('green', 'hover', 64, 18)           button canvas (normal | hover | down | disabled | on)
//   PAD.wood                                    content insets [l, t, r, b]
//
// Kinds (old names keep working and map onto the new look):
//   wood / stone   the main panel: lacquered teal frame, brass corners + rivets, dark oilcloth inset (light text)
//   cream          the same frame around a flat cream card inset (dark ink text): notes, summaries, letters
//   dark           a slim brass-trimmed oilcloth card (light text): settings, sub-panels, choice rows
//   paper          a clean cream card with an ink outline and a card edge (dark text): tooltips, tags
//   inset          a flat recessed well to group content inside a panel (dark); insetCream on cream insets
//   slot           a recessed item slot; slotBlue (dashed blueprint slot), slotTv
//   plaque / brass a brass name plate (dark ink text)
//   blueprint / card / cardSel / tv   unchanged structural looks

export type SkinKind = 'wood' | 'stone' | 'blueprint' | 'paper' | 'tv' | 'dark' | 'slot' | 'slotBlue' | 'slotTv' | 'card' | 'cardSel' | 'plaque'
  | 'cream' | 'inset' | 'insetCream' | 'brass';
export type BtnStyle = 'wood' | 'blue' | 'tv' | 'red' | 'green' | 'gold' | 'stone' | 'dark' | 'brass';
export type BtnState = 'normal' | 'hover' | 'down' | 'disabled' | 'on';

export const PAD: Record<SkinKind, [number, number, number, number]> = {
  wood: [9, 9, 9, 9], stone: [9, 9, 9, 9], cream: [10, 10, 10, 10], blueprint: [7, 7, 7, 7], paper: [6, 5, 6, 7], tv: [5, 5, 5, 5],
  dark: [6, 6, 6, 6], slot: [2, 2, 2, 2], slotBlue: [2, 2, 2, 2], slotTv: [2, 2, 2, 2], card: [4, 4, 4, 4], cardSel: [4, 4, 4, 4],
  plaque: [6, 4, 6, 5], brass: [6, 4, 6, 5], inset: [4, 4, 4, 4], insetCream: [4, 4, 4, 4],
};

/** the kit palette (DESIGN-UI.md): use these for anything drawn next to the skins */
export const KIT = {
  ink: '#0b1622', ink2: '#16232f',
  teal: ['#0c2429', '#12333a', '#1d4f55', '#2a6b6f', '#3c8a8c', '#6fb8b0'],
  brass: ['#4a2c0e', '#8a5a24', '#c8913a', '#f2c66d', '#fff1c2'],
  cream: ['#b9a476', '#d9c59b', '#f3e7c9', '#fffaf0'],
  oil: ['#0a1c21', '#102a30', '#173a40', '#2c5c60'],
  kelp: ['#1f4a16', '#3a7a28', '#5fae3f', '#a6e07a'],
  coral: ['#5a1612', '#a8342c', '#e0564a', '#ff9a84'],
  sea: ['#123a62', '#24609e', '#3d8fd6', '#9fd0ff'],
  /** text on dark insets / on cream */
  text: '#f3e7c9', textDim: '#9fb8b4', textInk: '#2a1a0c', textInkDim: '#6a5638',
  good: '#5fae3f', goodLight: '#8ee06a', bad: '#e0564a', badLight: '#ff8a76', info: '#3d8fd6', infoLight: '#8cc4ff', gold: '#f2c66d',
} as const;

type C = [number, number, number];
const hx = (s: string): C => { const v = parseInt(s.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const lerpC = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
class Img {
  w: number; h: number; d: Uint8ClampedArray; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.cv = document.createElement('canvas'); this.cv.width = Math.max(1, w); this.cv.height = Math.max(1, h);
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(this.cv.width, this.cv.height);
    this.d = this.img.data;
  }
  set(x: number, y: number, c: C, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  alpha(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  done() { this.ctx.putImageData(this.img, 0, 0); return this.cv; }
}

const INK = hx(KIT.ink);
const T = KIT.teal.map(hx), B = KIT.brass.map(hx), CR = KIT.cream.map(hx), OIL = KIT.oil.map(hx);

/** distance to the nearest edge, with 2 px rounded corners (-1 = outside the shape) */
function ring(x: number, y: number, w: number, h: number, r = 2): number {
  const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
  if (r >= 2 && ((dx === 0 && dy < 2) || (dy === 0 && dx < 2))) return -1;
  if (r >= 1 && dx === 0 && dy === 0) return -1;
  if (r >= 2 && dx === 1 && dy === 1) return 0; // the rounded corner's outline pixel
  return Math.min(dx, dy);
}

/**
 * a raised brass piece from a mask: ink outline around it, a lit top/left edge, a shaded bottom/right edge and a
 * flat body (generic bevel, so any hand-made shape gets consistent light from the top-left)
 */
function brassPiece(im: Img, mask: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number, pal: C[] = B) {
  const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < im.w && y < im.h && mask(x, y);
  const edge = (x: number, y: number) => inM(x, y) && (!inM(x - 1, y) || !inM(x + 1, y) || !inM(x, y - 1) || !inM(x, y + 1) || x === 0 || y === 0 || x === im.w - 1 || y === im.h - 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inM(x, y)) continue;
    if (edge(x, y)) { im.set(x, y, INK); continue; }
    im.set(x, y, pal[edge(x, y - 1) || edge(x - 1, y) ? 3 : edge(x, y + 1) || edge(x + 1, y) ? 1 : 2]);
  }
}
/** a 2x2 rivet dome */
function rivet(im: Img, x: number, y: number) {
  im.set(x, y, B[4]); im.set(x + 1, y, B[3]); im.set(x, y + 1, B[3]); im.set(x + 1, y + 1, B[1]);
}

// ------------------------------------------------------------------ panels
/** the lacquered teal frame (F px thick) with brass corner brackets around an inset */
function paintLacquer(w: number, h: number, inset: 'oil' | 'cream') {
  const im = new Img(w, h);
  const big = w >= 60 && h >= 44;
  const F = big ? 7 : 5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ring(x, y, w, h);
    if (d < 0) continue;
    if (d === 0) { im.set(x, y, INK); continue; }
    if (d < F) {
      const top = y === d, left = x === d, bot = h - 1 - y === d, right = w - 1 - x === d;
      let c: C;
      if (d === 1) c = top || left ? T[4] : T[1];                    // the crisp 1 px highlight / shade lip
      else if (d === F - 1) c = INK;                                // inner outline
      else if (d === F - 2) c = top || left ? T[1] : T[3];          // inner bevel: the frame steps down into the inset
      else c = top ? T[3] : bot ? T[1] : T[2];                      // lacquer body: lit top band, darker bottom band
      // a long specular streak along the top band (hand placed: the left third), and a short one on the left band
      if (big && d === 2 && top && x > 14 && x < Math.max(20, w * 0.38)) c = T[5];
      if (big && d === 2 && left && y > 14 && y < Math.max(18, h * 0.22)) c = T[4];
      void right;
      im.set(x, y, c);
      continue;
    }
    // inset
    const di = d - F; // 0 at the inset edge
    const ix = x - F, iy = y - F, iw = w - 2 * F, ih = h - 2 * F;
    if (inset === 'cream') {
      let c = CR[2];
      if (di === 0 && (ix === 0 || iy === 0)) c = CR[1];             // inner shadow under the frame (top/left)
      else if (di === 0) c = CR[3];                                  // light catching the bottom/right lip
      im.set(x, y, c);
    } else {
      let c = OIL[1];
      if (di === 0 && (ix === 0 || iy === 0)) c = OIL[0];
      else if (di === 0) c = OIL[2];
      // a stitched border (dashes 3 on / 2 off) two pixels inside the inset
      if (big && di === 3 && ((ix + iy) % 5) < 3 && iw > 20 && ih > 16) c = OIL[3];
      im.set(x, y, c);
    }
  }
  // brass corner brackets (an L of plate 4 px thick) with a rivet, and rivets along long sides
  const C2 = big ? 17 : 9, Tk = F;
  const inL = (x: number, y: number) => {
    const cx = Math.min(x, w - 1 - x), cy = Math.min(y, h - 1 - y);
    if (ring(x, y, w, h) < 0) return false;
    return (cy < Tk && cx < C2) || (cx < Tk && cy < C2);
  };
  brassPiece(im, inL, 0, 0, w - 1, h - 1);
  const ro = big ? 2 : 1; // the corner rivet sits in the middle of the bracket's corner square
  for (const [cx, cy] of [[ro, ro], [w - 2 - ro, ro], [ro, h - 2 - ro], [w - 2 - ro, h - 2 - ro]]) rivet(im, cx, cy);
  if (big) {
    const mid = Math.floor(F / 2) - 1;
    const along = (len: number, put: (p: number) => void) => { const n = Math.floor((len - 2 * C2) / 56); for (let i = 1; i <= n; i++) put(Math.round(C2 + ((len - 2 * C2) * i) / (n + 1)) - 1); };
    along(w, (p) => { rivet(im, p, mid); rivet(im, p, h - 1 - mid - 1); });
    along(h, (p) => { rivet(im, mid, p); rivet(im, w - 1 - mid - 1, p); });
  }
  return im.done();
}

/** a slim card: ink outline, a 1 px brass trim, ink, then the oilcloth inset (dark) */
function paintDark(w: number, h: number) {
  const im = new Img(w, h);
  const big = w > 40 && h > 30;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ring(x, y, w, h);
    if (d < 0) continue;
    if (d === 0 || d === 2) { im.set(x, y, INK); continue; }
    if (d === 1) { const lit = y === 1 || x === 1; im.set(x, y, lit ? B[3] : B[1]); continue; }
    const di = d - 3, ix = x - 3, iy = y - 3;
    let c = OIL[1];
    if (di === 0 && (ix === 0 || iy === 0)) c = OIL[0];
    else if (di === 0) c = OIL[2];
    if (big && di === 2 && ((ix + iy) % 5) < 3) c = OIL[3];
    im.set(x, y, c, 246);
  }
  if (big) for (const [cx, cy] of [[1, 1], [w - 3, 1], [1, h - 3], [w - 3, h - 3]]) rivet(im, cx, cy);
  return im.done();
}

/** a clean cream card: ink outline, 1 px light top/left, a shade line and a 2 px card edge at the bottom */
function paintPaper(w: number, h: number) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ring(x, y, w, h);
    if (d < 0) continue;
    if (d === 0) { im.set(x, y, INK); continue; }
    const by = h - 1 - y;
    let c = CR[2];
    if (by === 1 || by === 2) c = by === 1 ? CR[0] : CR[1];        // the card's thickness
    else if (d === 1 && (y === 1 || x === 1)) c = CR[3];
    else if (d === 1) c = CR[1];
    im.set(x, y, c);
  }
  return im.done();
}

/** a flat recessed well (groups content inside a panel) */
function paintInset(w: number, h: number, cream: boolean) {
  const im = new Img(w, h);
  const P = cream ? [CR[0], CR[1], CR[2], CR[3]] : [OIL[0], hx('#0d2328'), OIL[2], OIL[3]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ring(x, y, w, h, 1);
    if (d < 0) continue;
    if (d === 0) { im.set(x, y, y === 0 || x === 0 ? (cream ? CR[0] : INK) : (cream ? CR[3] : P[2])); continue; }
    if (d === 1 && (y === 1 || x === 1)) { im.set(x, y, cream ? CR[1] : P[0]); continue; }
    im.set(x, y, cream ? hx('#e9dbb6') : P[1], cream ? 255 : 235);
  }
  return im.done();
}

function paintSlot(w: number, h: number, kind: 'slot' | 'slotBlue' | 'slotTv') {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (kind === 'slotBlue') {
      if (dm === 0) { if (((x + y) >> 1) & 1) im.set(x, y, hx('#e6f3ff')); continue; }
      im.set(x, y, hx('#0b2a5c'), 150);
      continue;
    }
    if (kind === 'slotTv') {
      if (dm === 0) { im.set(x, y, hx('#2a9ad0')); continue; }
      im.set(x, y, hx('#040c30'), 235);
      continue;
    }
    const d = ring(x, y, w, h, w > 12 ? 2 : 1);
    if (d < 0) continue;
    if (d === 0) { im.set(x, y, INK); continue; }
    if (d === 1) { im.set(x, y, y === 1 || x === 1 ? hx('#071419') : T[2]); continue; }
    im.set(x, y, T[0], 242);
  }
  return im.done();
}

/** a brass name plate: flat body, lit top, shaded bottom, a rivet at each end */
function paintPlaque(w: number, h: number) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ring(x, y, w, h);
    if (d < 0) continue;
    if (d === 0) { im.set(x, y, INK); continue; }
    let c = B[2];
    if (d === 1) c = y === 1 ? B[4] : x === 1 ? B[3] : B[1];
    else if (y === 2) c = B[3];
    else if (h - 1 - y === 2) c = hx('#a8742e');
    im.set(x, y, c);
  }
  if (w > 24 && h >= 10) { const ry = Math.floor(h / 2) - 1; rivet(im, 3, ry); rivet(im, w - 5, ry); }
  return im.done();
}

const BP = { edge: hx('#0b2a5c'), paper: hx('#1d4f94'), grid: hx('#2a5fa6'), grid2: hx('#3a74bc'), line: hx('#e6f3ff') };
function paintBlueprint(w: number, h: number, card = false, sel = false) {
  const im = new Img(w, h);
  const edge = sel ? hx('#ffe9a0') : BP.edge, line = sel ? hx('#fff2c0') : BP.line;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (dm === 0) { im.set(x, y, edge); continue; }
    let c = BP.paper;
    const gx = (x - 3) % 8, gy = (y - 3) % 8;
    if (gx === 0 || gy === 0) c = ((x - 3) % 32 === 0 || (y - 3) % 32 === 0) ? BP.grid2 : BP.grid;
    if (card ? dm === 2 : dm === 3) c = line;
    if (!card && dm === 5) c = BP.grid2;
    im.set(x, y, c);
  }
  if (!card) for (const [cx, cy] of [[8, 8], [w - 9, 8], [8, h - 9], [w - 9, h - 9]]) { for (let k = -2; k <= 2; k++) { im.set(cx + k, cy, BP.line); im.set(cx, cy + k, BP.line); } }
  return im.done();
}

function paintTv(w: number, h: number) {
  const im = new Img(w, h);
  const fill = hx('#0b1a66'), cyan = hx('#3ad8ff'), deep = hx('#020818');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    const cn = Math.min(x, w - 1 - x) + Math.min(y, h - 1 - y);
    if (cn < 2) continue;
    if (dm === 0 || cn === 2) { im.set(x, y, deep); continue; }
    if (dm === 1 || cn === 3) { im.set(x, y, cyan); continue; }
    if (dm === 2) { im.set(x, y, deep); continue; }
    im.set(x, y, fill, 240);
  }
  return im.done();
}

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, fn: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (!c) { c = fn(); cache.set(key, c); if (cache.size > 900) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); } }
  return c;
}

/** a panel of the given kind at exactly w x h pixels */
export function skin(kind: SkinKind, w: number, h: number): HTMLCanvasElement {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
  return cached(`${kind}|${w}|${h}`, () => {
    switch (kind) {
      case 'wood': case 'stone': return paintLacquer(w, h, 'oil');
      case 'cream': return paintLacquer(w, h, 'cream');
      case 'blueprint': return paintBlueprint(w, h);
      case 'card': return paintBlueprint(w, h, true);
      case 'cardSel': return paintBlueprint(w, h, true, true);
      case 'paper': return paintPaper(w, h);
      case 'tv': return paintTv(w, h);
      case 'dark': return paintDark(w, h);
      case 'plaque': case 'brass': return paintPlaque(w, h);
      case 'inset': return paintInset(w, h, false);
      case 'insetCream': return paintInset(w, h, true);
      default: return paintSlot(w, h, kind);
    }
  });
}

// ------------------------------------------------------------------ buttons
/**
 * Button palette. `text`/`textSh` are the label colour and its outline. Green = go / confirm, red = close / danger,
 * wood (= brass) = neutral, gold = a brighter brass for the one important neutral, dark = secondary (lacquer),
 * blue = info.
 */
interface BtnPal { face: string; hi: string; lo: string; lip: string; out: string; text: string; textSh: string }
export const BTN: Record<BtnStyle, BtnPal> = {
  wood: { face: '#c8913a', hi: '#f2c66d', lo: '#9e6a2a', lip: '#6a4214', out: KIT.ink, text: '#2a1606', textSh: '#f2c66d' },
  brass: { face: '#c8913a', hi: '#f2c66d', lo: '#9e6a2a', lip: '#6a4214', out: KIT.ink, text: '#2a1606', textSh: '#f2c66d' },
  gold: { face: '#f2c66d', hi: '#fff1c2', lo: '#c8913a', lip: '#8a5a24', out: KIT.ink, text: '#2a1606', textSh: '#fff1c2' },
  green: { face: '#5fae3f', hi: '#a6e07a', lo: '#3f8a2a', lip: '#24561a', out: KIT.ink, text: '#ffffff', textSh: '#173f10' },
  red: { face: '#e0564a', hi: '#ff9a84', lo: '#b03a30', lip: '#6e1a14', out: KIT.ink, text: '#ffffff', textSh: '#4a0e0a' },
  blue: { face: '#3d8fd6', hi: '#9fd0ff', lo: '#2a6aaa', lip: '#163e6a', out: KIT.ink, text: '#ffffff', textSh: '#0c2440' },
  dark: { face: '#1d4f55', hi: '#3c8a8c', lo: '#163f44', lip: '#0c2429', out: KIT.ink, text: '#f3e7c9', textSh: '#06141a' },
  stone: { face: '#5c6670', hi: '#a0aab4', lo: '#46505a', lip: '#262c34', out: KIT.ink, text: '#f3f0e8', textSh: '#14181e' },
  tv: { face: '#1a3cb0', hi: '#6ae6ff', lo: '#0c2070', lip: '#040c38', out: '#01040e', text: '#ffffff', textSh: '#040c38' },
};
/** the lip (dark side) under a resting button face; a resting face also leaves 1 px of headroom for the hover lift */
export const LIP = 2;
/**
 * where a button's face sits for a state, relative to its box: [top offset, face height]. Resting faces start 1 px
 * down (room to lift), hover lifts 1 px, down sinks 2 px, on (toggled) sits 1 px down. The face is h - 5 tall.
 */
export function btnFace(state: BtnState, h: number): [number, number] {
  const top = state === 'hover' ? 1 : state === 'down' ? 4 : state === 'on' ? 3 : 2;
  return [top, h - 5];
}

function shiftC(c: C, k: number): C { return k >= 0 ? lerpC(c, [255, 250, 235], k) : lerpC(c, [10, 8, 30], -k); }

function paintBtn(style: BtnStyle, state: BtnState, w: number, h: number) {
  const P = BTN[style];
  const im = new Img(w, h);
  let face = hx(P.face), hi = hx(P.hi), lo = hx(P.lo), lip = hx(P.lip);
  const out = hx(P.out);
  if (state === 'hover') { face = shiftC(face, 0.1); hi = shiftC(hi, 0.15); }
  if (state === 'down') { face = shiftC(face, -0.1); hi = shiftC(hi, -0.12); }
  if (state === 'disabled') { const g = (c: C): C => { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return lerpC(c, [l, l, l * 1.05], 0.8).map((v) => v * 0.62) as C; }; face = g(face); hi = g(hi); lo = g(lo); lip = g(lip); }
  const [ft, fh] = btnFace(state, h);
  const T0 = ft - 1;                 // the box's top outline row
  const lipRows = h - 1 - (ft + fh); // rows between the face and the bottom outline
  const bw = w, bh = h - T0;
  for (let y = T0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ring(x, y - T0, bw, bh);
    if (d < 0) continue;
    if (d === 0) { im.set(x, y, out); continue; }
    const fy = y - ft;               // row within the face
    if (fy >= fh) { im.set(x, y, fy === fh && lipRows > 1 ? shiftC(lip, 0.12) : lip); continue; }
    let c = face;
    if (fy === 0) c = hi;                                     // the lit top edge
    else if (x === 1) c = shiftC(hi, -0.18);                  // lit left edge
    else if (fy === fh - 1 || x === w - 2) c = lo;            // shaded bottom / right edge of the face
    im.set(x, y, c);
  }
  // hand-placed shine: two bright pixels in the lit corner; toggled buttons get a lit pip
  if (state !== 'disabled' && w > 10) { im.set(2, ft + 1, shiftC(hi, 0.5)); im.set(3, ft + 1, shiftC(hi, 0.25)); im.set(2, ft + 2, shiftC(hi, 0.25)); }
  return im.done();
}

export function btnSkin(style: BtnStyle, state: BtnState, w: number, h: number): HTMLCanvasElement {
  w = Math.max(6, Math.round(w)); h = Math.max(8, Math.round(h));
  return cached(`btn|${style}|${state}|${w}|${h}`, () => paintBtn(style, state, w, h));
}
