// Painted UI skins: every panel and button is painted per pixel at its exact size (cached), so plank seams,
// blueprint grid lines and bevels always land on whole pixels and never stretch.
//
//   skin('wood', 160, 90)                       panel canvas
//   btnSkin('blue', 'hover', 64, 18)            button canvas (normal | hover | down | disabled | on)
//   PAD.wood                                    content insets [l, t, r, b]

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

// ------------------------------------------------------------------ painters (flat tones only: every pixel is part of a shape)
const OUT = hx('#140a06');
/** a small integer hash (deterministic placement of knots, nails, fibres and stains: deliberate, never noise) */
const hh = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const WF = ['#4a2412', '#6e3a1c', '#8f5428', '#b06e38', '#d08c50'].map(hx); // frame planks
const WI = ['#26120a', '#3a1e10', '#4c2a16', '#5e3820'].map(hx);             // inner boards
const IRON = ['#1c1c24', '#3a3a46', '#5c5c6c', '#9a9aaa'].map(hx);

function paintWood(w: number, h: number) {
  const im = new Img(w, h);
  const F = 6;
  const sideBase = [3, 1, 0 + 1, 2]; // top, right, bottom, left
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { im.set(x, y, OUT); continue; }
    const dl = x, dt = y, dr = w - 1 - x, db = h - 1 - y;
    const dm = Math.min(dl, dt, dr, db);
    if (dm < F) {
      const side = dm === dt ? 0 : dm === db ? 2 : dm === dl ? 3 : 1;
      const along = side === 0 || side === 2 ? x : y;
      let t = side === 0 ? 3 : side === 3 ? 2 : side === 1 ? 1 : 1;
      if (dm === 1 && (side === 0 || side === 3)) t = 4;          // lit outer lip
      else if (dm === 1) t = 2;
      else if (dm === F - 1) t = 0;                               // shadow at the inner edge
      else if (dm === 3 && along % 17 < 11) t = Math.max(0, t - 1); // one grain stroke
      // mitre seam at the corners
      const corner = (side === 0 || side === 2) && (dl === dm + 0 && dl < F || dr === dm && dr < F);
      if (corner && dm > 0) t = 0;
      im.set(x, y, WF[t]);
      void sideBase;
      continue;
    }
    if (dm === F) { im.set(x, y, hx('#1e0e06')); continue; }
    if (dm === F + 1 && (dt === F + 1 || dl === F + 1)) { im.set(x, y, WI[0]); continue; }
    // inner boards (horizontal), 11 px tall, staggered butt joints
    const py = y - F - 1, row = Math.floor(py / 11), ry = py - row * 11;
    let t = row % 2 ? 2 : 1;
    if (ry === 0) t = 0; else if (ry === 1) t = 3; else if (ry === 10) t = Math.max(0, t - 1);
    const joint = ((row * 53) % 70) + 22;
    const jx = (x - F) % 120;
    if (jx === joint) t = 0; else if (jx === joint + 1 && ry > 0) t = 3;
    if (ry === 5 && (x + row * 7) % 19 < 8) t = Math.max(0, t - 1); // grain stroke
    im.set(x, y, WI[t]);
  }
  // detail: long grain lines along the frame planks, a few knots, worn (lighter) chips on the lit outer edge,
  // nail heads along the inner boards' joints
  if (w > 40 && h > 30) {
    for (let x = F + 6; x < w - F - 6; x++) {
      if ((x * 7) % 23 < 15) im.set(x, 3, WF[(x >> 3) % 2 ? 2 : 1]);
      if ((x * 5) % 19 < 12) im.set(x, h - 4, WF[0]);
      if (hh(x, 1) < 0.05) { im.set(x, 1, WF[4]); im.set(x + 1, 1, WF[4]); }
    }
    for (let y = F + 6; y < h - F - 6; y++) { if ((y * 7) % 23 < 15) im.set(3, y, WF[1]); if ((y * 5) % 19 < 12) im.set(w - 4, y, WF[0]); if (hh(1, y) < 0.05) im.set(1, y, WF[4]); }
    for (let k = 0; k < Math.floor(w / 70); k++) {
      const kx = Math.floor(F + 14 + hh(k, 7) * (w - 2 * F - 28)), ky = F + 3 + Math.floor(hh(k, 9) * Math.max(1, h - 2 * F - 10));
      for (const [dx, dy, t] of [[0, 0, 0], [1, 0, 0], [-1, 0, 1], [2, 0, 1], [0, -1, 1], [1, 1, 1], [0, 1, 2], [1, -1, 2]] as const) { const px = kx + dx, py = ky + dy; if (px > F && py > F && px < w - F - 1 && py < h - F - 1) im.set(px, py, WI[t]); }
    }
    for (let x = F + 10; x < w - F - 8; x += 40) for (const y of [F + 3, h - F - 4]) { im.set(x, y, hx('#a8a4b0')); im.set(x + 1, y + 1, hx('#2a2830')); im.set(x + 1, y, hx('#5a5866')); im.set(x, y + 1, hx('#5a5866')); }
  }
  // iron corner brackets + rivets
  for (const [cx, cy, sx, sy] of [[1, 1, 1, 1], [w - 2, 1, -1, 1], [1, h - 2, 1, -1], [w - 2, h - 2, -1, -1]] as const) {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
      const k = j === 0 ? 3 : j === 1 ? 2 : 1;
      if (i < 8 - j) { im.set(cx + sx * i, cy + sy * j, IRON[k]); im.set(cx + sx * j, cy + sy * i, IRON[k]); }
    }
    im.set(cx + sx * 3, cy + sy * 3, IRON[0]);
    im.set(cx + sx * 1, cy + sy * 1, IRON[3]);
  }
  return im.done();
}

const STONE = ['#26262e', '#3a3a44', '#50505a', '#686670', '#86848c'].map(hx);
function paintStone(w: number, h: number) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { im.set(x, y, OUT); continue; }
    const row = Math.floor(y / 9), off = row % 2 ? 8 : 0, col = Math.floor((x + off) / 16);
    const bx = (x + off) % 16, by = y % 9;
    let t = (row * 3 + col) % 3 === 0 ? 2 : 3;
    if (bx === 0 || by === 0) t = 0; else if (bx === 1 || by === 1) t = 4; else if (bx === 15 || by === 8) t = 1;
    im.set(x, y, STONE[t]);
  }
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

function paintPaper(w: number, h: number) {
  const im = new Img(w, h);
  const base = hx('#efdfb4'), lit = hx('#fff6dc'), sh = hx('#c8a874'), ink = hx('#2a1808');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    // dog-eared top-right corner
    const fx = w - 1 - x, fy = y;
    if (fx + fy < 5) continue;
    if (fx + fy === 5) { im.set(x, y, ink); continue; }
    if (fx + fy < 9 && fx < 5 && fy < 5) { im.set(x, y, sh); continue; }
    if (dm === 0) { im.set(x, y, ink); continue; }
    if (x === 1 || y === 1) { im.set(x, y, lit); continue; }
    if (x === w - 2 || y === h - 2) { im.set(x, y, sh); continue; }
    // torn bottom edge: a few bites out of the paper
    if (y >= h - 3 && hh(x >> 1, 3) < 0.18) continue;
    // scorched corners
    const cd = Math.min(x + y, (w - 1 - x) + (h - 1 - y), x + (h - 1 - y));
    if (cd < 6) { im.set(x, y, cd < 3 ? hx('#6a4a24') : hx('#b48a54')); continue; }
    im.set(x, y, base);
  }
  // fibres (short horizontal strands) and two faint tea stains as rings
  for (let i = 0; i < Math.floor((w * h) / 90); i++) { const fx = 3 + Math.floor(hh(i, 11) * (w - 8)), fy = 3 + Math.floor(hh(i, 13) * (h - 6)), len = 2 + Math.floor(hh(i, 17) * 3); for (let k = 0; k < len; k++) if (im.alpha(fx + k, fy)) im.set(fx + k, fy, hh(i, 19) < 0.5 ? hx('#e4d09e') : hx('#f8ecca')); }
  if (w > 50 && h > 30) for (const [sx, sy, r] of [[w * 0.72, h * 0.3, 7], [w * 0.2, h * 0.75, 5]]) for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; const px = Math.round(sx + Math.cos(t) * r), py = Math.round(sy + Math.sin(t) * r * 0.7); if (im.alpha(px, py)) im.set(px, py, hx('#dcc28e')); }
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

function paintDark(w: number, h: number) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (dm === 0) { im.set(x, y, hx('#02040a')); continue; }
    if (dm === 1) { im.set(x, y, y === 1 ? hx('#4a5a74') : y === h - 2 ? hx('#0a0e16') : hx('#26303f')); continue; }
    if (dm === 3 && w > 30 && h > 20) { im.set(x, y, (x + y) % 2 ? hx('#8a6a32') : hx('#6a5024'), 235); continue; }
    im.set(x, y, y < 8 ? hx('#162236') : hx('#111a28'), 232);
  }
  if (w > 30 && h > 20) for (const [cx, cy] of [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4]]) { im.set(cx, cy, hx('#f0d080')); im.set(cx + 1, cy, hx('#a07a30')); im.set(cx, cy + 1, hx('#a07a30')); im.set(cx + 1, cy + 1, hx('#4a3410')); }
  return im.done();
}

function paintSlot(w: number, h: number, kind: 'slot' | 'slotBlue' | 'slotTv') {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (kind === 'slotBlue') {
      if (dm === 0) { if (((x + y) >> 1) & 1) im.set(x, y, BP.line); continue; }
      im.set(x, y, BP.edge, 150);
      continue;
    }
    if (kind === 'slotTv') {
      if (dm === 0) { im.set(x, y, hx('#2a9ad0')); continue; }
      im.set(x, y, hx('#040c30'), 235);
      continue;
    }
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    if (dm === 0) { im.set(x, y, hx('#0e0a12')); continue; }
    if (x === 1 || y === 1) { im.set(x, y, hx('#08060a')); continue; }
    if (x === w - 2 || y === h - 2) { im.set(x, y, hx('#4a3c44')); continue; }
    im.set(x, y, hx('#221a20'), 240);
  }
  return im.done();
}

function paintPlaque(w: number, h: number) {
  const im = new Img(w, h);
  const R = ['#3a2408', '#7a5214', '#b0822a', '#d8aa44', '#f4dc8a'].map(hx);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    const dm = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (dm === 0) { im.set(x, y, OUT); continue; }
    let t = y < h / 2 ? 3 : 2;
    if (dm === 1) t = y === 1 || x === 1 ? 4 : 1;
    if (y === 3) t = 4;                                                    // polished highlight band
    if (dm === 2 && h > 10) t = (x + y) % 2 ? 1 : 2;                       // engraved dotted border
    im.set(x, y, R[t]);
    if (dm === 2 && h > 10 && (x + y) % 6 === 0) im.set(x, y, hx('#5a8a6a')); // patina in the engraving
  }
  for (const sx of [4, w - 5]) { const sy = Math.floor(h / 2); im.set(sx, sy, R[4]); im.set(sx + 1, sy, R[1]); im.set(sx, sy + 1, R[1]); im.set(sx + 1, sy + 1, R[0]); }
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
    im.set(x, y, face);
  }
  // detail: a polished band under the top lip; wood faces get a grain stroke; long buttons get end rivets
  const fy = top + 3;
  if (h > 12) for (let x = 3; x < w - 3; x++) if ((x * 3) % 7 < 5) im.set(x, fy, shiftC(face, 0.12));
  if (style === 'wood' && h > 14) { const gy = top + Math.floor((h - LIP - top) * 0.62); for (let x = 4; x < w - 4; x++) if ((x * 5) % 17 < 11) im.set(x, gy, shiftC(face, -0.12)); }
  if (w > 50 && h > 14) for (const rx of [3, w - 5]) { const ry = top + Math.floor((h - LIP - top) / 2); im.set(rx, ry, shiftC(hi, 0.3)); im.set(rx + 1, ry + 1, lo); }
  // state 'on' gets a lit pip in the corner
  if (state === 'on') { im.set(w - 4, top + 3, hx('#fff6a0')); im.set(w - 5, top + 3, hx('#ffd040')); im.set(w - 4, top + 4, hx('#ffd040')); }
  return im.done();
}

export function btnSkin(style: BtnStyle, state: BtnState, w: number, h: number): HTMLCanvasElement {
  w = Math.max(6, Math.round(w)); h = Math.max(6, Math.round(h));
  return cached(`btn|${style}|${state}|${w}|${h}`, () => paintBtn(style, state, w, h));
}
