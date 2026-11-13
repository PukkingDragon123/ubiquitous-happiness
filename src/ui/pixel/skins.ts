// Painted UI skins: every panel and button is painted per pixel at its exact size (cached), so plank seams,
// blueprint grid lines and bevels always land on whole pixels and never stretch.
//
//   skin('wood', 160, 90)                       panel canvas
//   btnSkin('blue', 'hover', 64, 18)            button canvas (normal | hover | down | disabled | on)
//   PAD.wood                                    content insets [l, t, r, b]
import { fbm, hash2 } from '../../core/math';

export type SkinKind = 'wood' | 'stone' | 'blueprint' | 'paper' | 'tv' | 'dark' | 'slot' | 'slotBlue' | 'slotTv' | 'card' | 'cardSel' | 'plaque';
export type BtnStyle = 'wood' | 'blue' | 'tv' | 'red' | 'green' | 'gold' | 'stone' | 'dark';
export type BtnState = 'normal' | 'hover' | 'down' | 'disabled' | 'on';

export const PAD: Record<SkinKind, [number, number, number, number]> = {
  wood: [9, 9, 9, 9], stone: [7, 7, 7, 7], blueprint: [7, 7, 7, 7], paper: [5, 5, 5, 5], tv: [5, 5, 5, 5],
  dark: [5, 5, 5, 5], slot: [2, 2, 2, 2], slotBlue: [2, 2, 2, 2], slotTv: [2, 2, 2, 2], card: [4, 4, 4, 4], cardSel: [4, 4, 4, 4], plaque: [6, 4, 6, 5],
};

type C = [number, number, number];
const hx = (s: string): C => { const v = parseInt(s.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const lerpC = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
/** stepped ramp lookup with ordered dither between bands */
function band(cols: C[], t: number, x: number, y: number): C {
  const n = cols.length - 1;
  const q = Math.max(0, Math.min(n, Math.floor(t * n + bay(x, y))));
  return cols[q];
}

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
  get(x: number, y: number): C { const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  alpha(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  done() { this.ctx.putImageData(this.img, 0, 0); return this.cv; }
}

// ------------------------------------------------------------------ palettes
const WOOD_FRAME = ['#4a2412', '#6e3a1c', '#8f5428', '#ad6e38', '#c88a4c', '#e2ac6c'].map(hx);
const WOOD_IN = ['#2c1608', '#3e2010', '#522c16', '#63381e', '#744426'].map(hx);
const OUT = hx('#140a06');
const IRON = ['#1c1c24', '#3a3a46', '#5c5c6c', '#9a9aaa'].map(hx);

function paintWood(w: number, h: number) {
  const im = new Img(w, h);
  const F = 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
    if (corner) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { im.set(x, y, OUT); continue; }
    const dl = x, dt = y, dr = w - 1 - x, db = h - 1 - y;
    const dm = Math.min(dl, dt, dr, db);
    if (dm < F) {
      // frame plank: which side (mitred at the corners)
      const side = dm === dt ? 0 : dm === db ? 2 : dm === dl ? 3 : 1;
      const along = side === 0 || side === 2 ? x : y, across = dm;
      const n = fbm(along / 9, across / 1.6 + side * 7, 3, 11 + side);
      let t = 0.35 + n * 0.55 + Math.sin(along * 0.31 + n * 9) * 0.08;
      if (side === 0) t += 0.18; if (side === 3) t += 0.08; if (side === 2) t -= 0.22; if (side === 1) t -= 0.12;
      if (across === 1) t += side === 2 || side === 1 ? -0.1 : 0.22;
      if (across === F - 1) t -= 0.35;
      // mitre seam
      if ((side === 0 || side === 2) && (Math.abs(dl - across) < 0.5 || Math.abs(dr - across) < 0.5)) t -= 0.3;
      let c = band(WOOD_FRAME, Math.max(0, Math.min(1, t)), x, y);
      if (hash2(along, across, 5 + side) > 0.985) c = WOOD_FRAME[0];
      im.set(x, y, c);
      continue;
    }
    if (dm === F) { im.set(x, y, hx('#1e0e06')); continue; }
    // inner planks (horizontal), with seams every 11 px and a top/left inner shadow
    const py = y - F - 1, row = Math.floor(py / 11), ry = py - row * 11;
    const n = fbm((x + row * 37) / 14, ry / 2.2 + row * 3, 3, 21);
    let t = 0.45 + (n - 0.5) * 0.9 + (hash2(row, 0, 9) - 0.5) * 0.3 + Math.sin(x * 0.18 + n * 6 + row) * 0.08;
    if (ry === 0) t = 0; else if (ry === 1) t += 0.25; else if (ry === 10) t -= 0.25;
    if (dm === F + 1) t -= 0.35; if (dm === F + 2 && (dt === F + 2 || dl === F + 2)) t -= 0.2;
    // board ends (staggered butt joints)
    const joint = ((row * 53) % 70) + 20;
    if (x - F === joint || x - F === joint + 96) t = 0.05;
    im.set(x, y, band(WOOD_IN, Math.max(0, Math.min(1, t)), x, y));
  }
  // iron corner brackets + rivets
  for (const [cx, cy, sx, sy] of [[1, 1, 1, 1], [w - 2, 1, -1, 1], [1, h - 2, 1, -1], [w - 2, h - 2, -1, -1]] as const) {
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
      const px = cx + sx * i, py = cy + sy * j, qx = cx + sx * j, qy = cy + sy * i;
      const k = j === 0 ? 3 : j === 1 ? 2 : 1;
      if (i < 9 - j) { im.set(px, py, IRON[k]); im.set(qx, qy, IRON[k]); }
    }
    im.set(cx + sx * 3, cy + sy * 3, IRON[0]); im.set(cx + sx * 2, cy + sy * 2, IRON[3]);
    im.set(cx + sx * 1, cy + sy * 1, IRON[0]);
  }
  return im.done();
}

const STONE = ['#24242c', '#3a3a44', '#4e4e58', '#64646c', '#7c7a80', '#9a969a'].map(hx);
function paintStone(w: number, h: number) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { im.set(x, y, OUT); continue; }
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    const row = Math.floor(y / 9), off = row % 2 ? 7 : 0, col = Math.floor((x + off) / 15);
    const bx = (x + off) % 15, by = y % 9;
    let t = 0.5 + (fbm(x / 6, y / 6, 3, 31) - 0.5) * 0.8 + (hash2(col, row, 4) - 0.5) * 0.3;
    if (bx === 0 || by === 0) t = 0.05; else if (bx === 1 || by === 1) t += 0.2; else if (bx === 14 || by === 8) t -= 0.2;
    if (dm < 5) t += dm === 1 ? 0.25 : 0.05; else if (dm === 5) t = 0.02;
    if (dm > 5 && hash2(x, y, 3) > 0.97) t -= 0.25;
    let c = band(STONE, Math.max(0, Math.min(1, t)), x, y);
    // moss in the mortar near the bottom
    if ((bx === 0 || by === 0) && fbm(x / 9, y / 5, 2, 8) > 0.58 && y > h * 0.5) c = hx('#3c5a2a');
    im.set(x, y, c);
  }
  return im.done();
}

const BP = { paper: hx('#1b4a8c'), paper2: hx('#163f7a'), grid: hx('#33669f'), grid2: hx('#4b82bf'), line: hx('#e4f2ff'), edge: hx('#0a1f42'), ink: hx('#9cc8f4') };
function paintBlueprint(w: number, h: number, card = false, sel = false) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { im.set(x, y, sel ? hx('#ffe9a0') : BP.edge); continue; }
    const n = fbm(x / 23, y / 23, 3, 41);
    let c = lerpC(BP.paper2, BP.paper, 0.4 + n * 0.8);
    // aged paper: darker toward edges, a few specks and fold creases
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (dm < 4) c = lerpC(c, BP.edge, (4 - dm) * 0.12);
    const gx = (x - 3) % 8, gy = (y - 3) % 8;
    if (gx === 0 || gy === 0) c = lerpC(c, ((x - 3) % 32 === 0 || (y - 3) % 32 === 0) ? BP.grid2 : BP.grid, 0.7);
    if (hash2(x, y, 77) > 0.992) c = lerpC(c, BP.line, 0.25);
    if (!card && Math.abs(x - Math.floor(w * 0.62)) < 1 && fbm(x, y / 9, 2, 3) > 0.45) c = lerpC(c, BP.paper2, 0.5);
    // double frame line
    const fl = card ? 2 : 3;
    if (dm === fl && x >= fl && y >= fl) c = sel ? hx('#fff2c0') : BP.line;
    if (!card && dm === fl + 2) c = lerpC(c, BP.line, 0.35);
    im.set(x, y, c);
  }
  // corner ticks
  if (!card) for (const [cx, cy] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) { im.set(cx, cy, BP.line); im.set(cx - 1, cy, BP.ink); im.set(cx + 1, cy, BP.ink); im.set(cx, cy - 1, BP.ink); im.set(cx, cy + 1, BP.ink); }
  return im.done();
}

function paintPaper(w: number, h: number) {
  const im = new Img(w, h);
  const base = hx('#efdfb4'), dark = hx('#c8a874'), ink = hx('#2a1808');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    // ragged deckle edge
    const rag = hash2(x * 3 + y, x + y * 5, 9) > 0.86 ? 1 : 0;
    if (dm < rag) continue;
    if ((x <= 1 || x >= w - 2) && (y <= 1 || y >= h - 2)) { if (dm === 0) continue; }
    if (dm === 0 || (dm === 1 && rag)) { im.set(x, y, ink); continue; }
    const n = fbm(x / 11, y / 11, 3, 51);
    let c = lerpC(dark, base, Math.min(1, 0.55 + n * 0.6 + Math.min(dm, 6) * 0.04));
    if (hash2(x, y, 52) > 0.985) c = lerpC(c, dark, 0.6);
    if (dm === 1) c = lerpC(c, hx('#fff6dc'), 0.6);
    im.set(x, y, c);
  }
  return im.done();
}

function paintTv(w: number, h: number) {
  const im = new Img(w, h);
  const fill = hx('#0b1a66'), fill2 = hx('#08134c'), cyan = hx('#3ad8ff'), deep = hx('#020818');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    const cn = Math.min(x, w - 1 - x) + Math.min(y, h - 1 - y);
    if (cn < 2) continue;
    if (dm === 0 || cn === 2) { im.set(x, y, deep); continue; }
    if (dm === 1 || cn === 3) { im.set(x, y, cyan); continue; }
    if (dm === 2) { im.set(x, y, deep); continue; }
    im.set(x, y, (y & 1) ? fill2 : fill, 236);
  }
  return im.done();
}

function paintDark(w: number, h: number) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (dm === 0) { im.set(x, y, hx('#02040a')); continue; }
    if (dm === 1) { im.set(x, y, y === 1 ? hx('#5a6a84') : y === h - 2 ? hx('#0a0e16') : hx('#2c3648')); continue; }
    im.set(x, y, lerpC(hx('#121a28'), hx('#0a0f18'), y / h), 226);
  }
  return im.done();
}

function paintSlot(w: number, h: number, kind: 'slot' | 'slotBlue' | 'slotTv') {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (kind === 'slotBlue') {
      const dash = ((x + y) >> 1) & 1;
      if (dm === 0) { if (dash) im.set(x, y, BP.line, 220); continue; }
      im.set(x, y, BP.paper2, 120);
      continue;
    }
    if (kind === 'slotTv') {
      if (dm === 0) { im.set(x, y, hx('#2a9ad0')); continue; }
      im.set(x, y, hx('#040c30'), 230);
      continue;
    }
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    if (dm === 0) { im.set(x, y, hx('#0e0a12')); continue; }
    if (x === 1 || y === 1) { im.set(x, y, hx('#0a070c')); continue; }
    if (x === w - 2 || y === h - 2) { im.set(x, y, hx('#5a4a50')); continue; }
    const n = fbm(x / 5, y / 5, 2, 61);
    im.set(x, y, lerpC(hx('#1c1519'), hx('#2a2026'), n), 240);
  }
  return im.done();
}

function paintPlaque(w: number, h: number) {
  // brass name plaque with screws
  const im = new Img(w, h);
  const R = ['#3a2408', '#6a4612', '#a87a24', '#d8aa44', '#f4dc8a'].map(hx);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (dm === 0) { im.set(x, y, OUT); continue; }
    let t = 0.55 + (fbm(x / 14, y / 3, 2, 71) - 0.5) * 0.5 - y / h * 0.25;
    if (dm === 1) t = y === 1 || x === 1 ? 0.95 : 0.15;
    if (dm === 2) t -= 0.1;
    im.set(x, y, band(R, Math.max(0, Math.min(1, t)), x, y));
  }
  for (const sx of [3, w - 4]) { const sy = Math.floor(h / 2); im.set(sx, sy, R[0]); im.set(sx - 1, sy, R[4]); im.set(sx + 1, sy, R[1]); im.set(sx, sy - 1, R[4]); im.set(sx, sy + 1, R[1]); }
  return im.done();
}

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, fn: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (!c) { c = fn(); cache.set(key, c); if (cache.size > 600) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); } }
  return c;
}

/** a panel of the given kind at exactly w x h pixels */
export function skin(kind: SkinKind, w: number, h: number): HTMLCanvasElement {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
  return cached(`${kind}|${w}|${h}`, () => {
    switch (kind) {
      case 'wood': return paintWood(w, h);
      case 'stone': return paintStone(w, h);
      case 'blueprint': return paintBlueprint(w, h);
      case 'card': return paintBlueprint(w, h, true);
      case 'cardSel': return paintBlueprint(w, h, true, true);
      case 'paper': return paintPaper(w, h);
      case 'tv': return paintTv(w, h);
      case 'dark': return paintDark(w, h);
      case 'plaque': return paintPlaque(w, h);
      default: return paintSlot(w, h, kind);
    }
  });
}

// ------------------------------------------------------------------ buttons
interface BtnPal { face: string; hi: string; lo: string; lip: string; out: string; text: string; textSh: string }
export const BTN: Record<BtnStyle, BtnPal> = {
  wood: { face: '#a8703c', hi: '#e2b072', lo: '#6a3c1c', lip: '#3a1e0c', out: '#140a06', text: '#fff2d6', textSh: '#3a1e0c' },
  blue: { face: '#2a62a8', hi: '#9ad0ff', lo: '#173d74', lip: '#0a2046', out: '#06122a', text: '#f2f8ff', textSh: '#0a2046' },
  tv: { face: '#1a3cb0', hi: '#6ae6ff', lo: '#0c2070', lip: '#040c38', out: '#01040e', text: '#ffffff', textSh: '#040c38' },
  red: { face: '#b8342c', hi: '#ff9a7a', lo: '#7a1a18', lip: '#3e0808', out: '#120204', text: '#fff0e8', textSh: '#3e0808' },
  green: { face: '#3a9a3a', hi: '#aaf08a', lo: '#1e5e24', lip: '#0c2c10', out: '#040e04', text: '#f4ffe8', textSh: '#0c2c10' },
  gold: { face: '#d8a020', hi: '#fff0a0', lo: '#8a5a08', lip: '#4a2a02', out: '#140a00', text: '#3a1e00', textSh: '#fff4c0' },
  stone: { face: '#5c5a64', hi: '#a8a6b0', lo: '#34323c', lip: '#1a1820', out: '#08080c', text: '#f0eef4', textSh: '#1a1820' },
  dark: { face: '#202a3a', hi: '#5a6a84', lo: '#121822', lip: '#06080e', out: '#000000', text: '#e8eef8', textSh: '#000000' },
};
export const LIP = 2;

function shiftC(c: C, k: number): C { return k >= 0 ? lerpC(c, [255, 250, 235], k) : lerpC(c, [10, 8, 30], -k); }

function paintBtn(style: BtnStyle, state: BtnState, w: number, h: number) {
  const P = BTN[style];
  const im = new Img(w, h);
  let face = hx(P.face), hi = hx(P.hi), lo = hx(P.lo);
  const lip = hx(P.lip), out = hx(P.out);
  if (state === 'hover') { face = shiftC(face, 0.16); hi = shiftC(hi, 0.2); }
  if (state === 'on') { face = shiftC(face, 0.08); }
  if (state === 'down') { face = shiftC(face, -0.12); }
  if (state === 'disabled') { const g = (c: C): C => { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return lerpC(c, [l, l, l * 1.05], 0.75).map((v) => v * 0.7) as C; }; face = g(face); hi = g(hi); lo = g(lo); }
  const down = state === 'down' || state === 'on';
  const top = down ? LIP : 0; // pressed buttons sit lower (lip hidden)
  const bot = h - 1;
  for (let y = top; y <= bot; y++) for (let x = 0; x < w; x++) {
    const lx = x, ly = y - top, lw = w, lh = h - top;
    const corner = (lx === 0 || lx === lw - 1) && (ly === 0 || ly === lh - 1);
    if (corner) continue;
    if (lx === 0 || ly === 0 || lx === lw - 1 || ly === lh - 1) { im.set(x, y, out); continue; }
    const faceH = down ? lh - 1 : lh - 1 - LIP;
    if (!down && ly >= faceH) { im.set(x, y, ly === faceH ? out : lip); continue; }
    if (ly === 1) { im.set(x, y, down ? lo : hi); continue; }
    if (lx === 1) { im.set(x, y, down ? lo : shiftC(hi, -0.15)); continue; }
    if (ly === faceH - 1 || lx === lw - 2) { im.set(x, y, down ? face : lo); continue; }
    // subtle vertical gradient + texture per style
    let c = lerpC(shiftC(face, 0.06), shiftC(face, -0.06), ly / faceH);
    if (style === 'wood') c = shiftC(c, (fbm(x / 7, y / 1.5, 2, 81) - 0.5) * 0.35);
    if (style === 'stone') c = shiftC(c, (fbm(x / 4, y / 4, 2, 82) - 0.5) * 0.3);
    if (style === 'tv' && (y & 1)) c = shiftC(c, -0.08);
    im.set(x, y, c);
  }
  // state 'on' gets a lit pip in the corner
  if (state === 'on') { im.set(w - 4, top + 3, hx('#fff6a0')); im.set(w - 5, top + 3, hx('#ffd040')); im.set(w - 4, top + 4, hx('#ffd040')); }
  return im.done();
}

export function btnSkin(style: BtnStyle, state: BtnState, w: number, h: number): HTMLCanvasElement {
  w = Math.max(6, Math.round(w)); h = Math.max(6, Math.round(h));
  return cached(`btn|${style}|${state}|${w}|${h}`, () => paintBtn(style, state, w, h));
}
