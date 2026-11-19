// Painted UI skins, v5 "the diver's kit", OCEAN + WOOD pass: every panel, button and small widget is painted per
// texel at its exact size (cached) with hand-placed structure and never noise, dither or speckle. Wood is the main
// material; the sea has been at it:
//   * frames are weathered ship planks / driftwood: chunky grain that follows each board, knots, salt-bleached
//     outer edges, worm-hole clusters, iron nail heads with rust runs, a sea-worn teal paint trim (chipped back to
//     wood), rope lashing wrapped round each corner, barnacles, a scallop shell and a sea-glass gem crusted on
//   * insets: dark water behind glass (light text) with a glass reflection and a sand floor; sailcloth (dark text)
//     with a weave, a sewn seam, a stitched hem, brass grommets and a salt tide line; wet sand with ripples
//   * buttons: sea-worn painted planks (a 7-tone ramp, grain through the paint, chipped corners showing wood), plain
//     wood planks with nail heads and a carved label plate, or brass ship's fittings
//   * the ANIMATED part (bubbles, swaying kelp and rope ends, a caustic shimmer, hover splashes, the pop-in wobble)
//     lives in PixelUI as small overlays drawn over these cached skins (src/ui/pixel/ui.ts): no skin is repainted
//     per frame.
//
// DENSITY: painters take `d` texels per UI px (PixelUI passes its canvas density `hd`: 2 at 720p, 3 at 1080p), so
// silhouettes and outlines stay on the UI pixel grid while fine detail is one texel = one device pixel.
//
//   skin('wood', 160, 90, ui.hd)                 panel canvas (160*d x 90*d)  -> draw it at 160 x 90 UI px
//   btnSkin('green', 'hover', 64, 22, ui.hd)     button canvas (normal | hover | down | disabled | on)
//   PAD.wood                                     content insets [l, t, r, b] (UI px)
//
// Kinds (old names keep working and map onto the new look):
//   wood / stone   ship-plank frame (rope-lashed corners, barnacles, teal trim) around dark water behind glass
//   cream          the same frame around a sailcloth inset (dark ink text): notes, letters, summaries
//   dark           a rope-trimmed card over dark water (light text): settings, sub-panels, choice rows
//   paper          a sailcloth card with a stitched hem and a card edge (dark text): tooltips, tags, objectives
//   inset          a recessed dark-water well inside a panel; insetCream: a wet-sand well (dark text)
//   slot           a recessed item slot; slotBlue (dashed blueprint slot), slotTv
//   plaque         a salt-bleached driftwood plank sign (dark ink text); brass: an engraved brass plate
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

/** the kit palette: use these for anything drawn next to the skins */
export const KIT = {
  ink: '#0b1622', ink2: '#16232f',
  teal: ['#0c2429', '#12333a', '#1d4f55', '#2a6b6f', '#3c8a8c', '#6fb8b0'],
  brass: ['#4a2c0e', '#8a5a24', '#c8913a', '#f2c66d', '#fff1c2'],
  cream: ['#b9a476', '#d9c59b', '#f3e7c9', '#fffaf0'],
  oil: ['#0a1c21', '#102a30', '#173a40', '#2c5c60'],
  wood: ['#33191a', '#4e2a1e', '#6b3c24', '#8a5430', '#a86e3e', '#c48c52', '#dcae74'],
  water: ['#071620', '#0e2834', '#1c4450', '#3a6e74', '#8ac8c0'],
  sand: ['#94764a', '#b8965e', '#d2b47a', '#e6cc96'],
  kelp: ['#1f4a16', '#3a7a28', '#5fae3f', '#a6e07a'],
  coral: ['#5a1612', '#a8342c', '#e0564a', '#ff9a84'],
  sea: ['#123a62', '#24609e', '#3d8fd6', '#9fd0ff'],
  /** text on dark water / on sailcloth */
  text: '#f3e7c9', textDim: '#9fc0bc', textInk: '#2a1a0c', textInkDim: '#6a5638',
  good: '#5fae3f', goodLight: '#8ee06a', bad: '#e0564a', badLight: '#ff8a76', info: '#3d8fd6', infoLight: '#8cc4ff', gold: '#f2c66d',
} as const;

type C = [number, number, number];
const hx = (s: string): C => { const v = parseInt(s.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const ramp = (...s: string[]) => s.map(hx);
const lerpC = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------ hue-shifted ramps (dark -> light)
/** ship planks: plum-brown shadows -> honey highlights */
const WD = ramp('#1e1018', '#33191a', '#4e2a1e', '#6b3c24', '#8a5430', '#a86e3e', '#c48c52', '#dcae74');
/** salt-bleached wood: grey-violet shadow -> bone */
const SALT = ramp('#5e5450', '#857a6e', '#aa9e8a', '#cbc0a8', '#e6dec8');
/** sea-worn teal paint */
const TP = ramp('#0b2a30', '#14454a', '#1f5f5e', '#2f7d76', '#58a494');
const IRON = ramp('#101218', '#262a32', '#444a54', '#6e7680', '#a8b0ba');
const RUST = ramp('#4a1e12', '#7a3a1e', '#a85a2a');
const ROPE = ramp('#2a1c0e', '#54401f', '#82683a', '#b09254', '#d6bc80', '#f0dca6');
const BARN = ramp('#26262c', '#55524f', '#88827a', '#b8b0a0', '#ddd6c6', '#faf6ea');
const SHELL = ramp('#6a2e30', '#b45e5a', '#e08e7a', '#f8bca0', '#ffe4d0');
const GLASS = ramp('#164e4a', '#2f8a7e', '#6ccab4', '#c8fff0');
/** brass: red-brown shadow -> pale butter highlight */
const BR = ramp('#2e140e', '#5a2e16', '#8a5422', '#b47c30', '#d29e44', '#ecc46a', '#fbe29a', '#fff6d6');
const VERD = ramp('#2a5e56', '#3e8a78', '#6cb8a0');
/** dark water behind glass: deep blue-black -> sea-green glint */
const WATER = ramp('#040e16', '#071620', '#0a1e2a', '#0e2834', '#13323e', '#1c4450', '#3a6e74', '#8ac8c0');
const SAIL = ramp('#7a6a52', '#a8967a', '#c8b898', '#ddd0b2', '#ebe2ca', '#f6efdc', '#fffaee');
const SAND = ramp('#6a5232', '#94764a', '#b8965e', '#d2b47a', '#e6cc96', '#f4e2b4');
const INK = hx(KIT.ink);
/** cream (keycaps, checkboxes) and teal lacquer (dark keycaps) for the small widgets */
const CR = ramp('#8a6a46', '#b0925f', '#c9b087', '#dcc79f', '#e9dbb7', '#f2e6c8', '#f9f1dc', '#fffaee');
const TW = ramp('#081620', '#0d2330', '#12333c', '#1a454c', '#22575a', '#2e6d68', '#478c7a', '#79b494');

/** a texel canvas: uw x uh UI px at d texels per UI px */
class Tx {
  W: number; H: number; d: number; uw: number; uh: number; D: Uint8ClampedArray; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData;
  constructor(uw: number, uh: number, d: number) {
    this.uw = uw; this.uh = uh; this.d = d; this.W = uw * d; this.H = uh * d;
    this.cv = document.createElement('canvas'); this.cv.width = Math.max(1, this.W); this.cv.height = Math.max(1, this.H);
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(this.cv.width, this.cv.height);
    this.D = this.img.data;
  }
  set(x: number, y: number, c: C, a = 255) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 4; this.D[i] = c[0]; this.D[i + 1] = c[1]; this.D[i + 2] = c[2]; this.D[i + 3] = a;
  }
  alpha(x: number, y: number) { return x < 0 || y < 0 || x >= this.W || y >= this.H ? 0 : this.D[(y * this.W + x) * 4 + 3]; }
  /** fill one UI pixel */
  setU(ux: number, uy: number, c: C) { for (let j = 0; j < this.d; j++) for (let i = 0; i < this.d; i++) this.set(ux * this.d + i, uy * this.d + j, c); }
  done() { this.ctx.putImageData(this.img, 0, 0); return this.cv; }
}

/** UI-px ring index (distance to the nearest edge) with 2 px rounded corners; -1 = outside */
function ring(x: number, y: number, w: number, h: number, r = 2): number {
  const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
  if (r >= 2 && ((dx === 0 && dy < 2) || (dy === 0 && dx < 2))) return -1;
  if (r >= 1 && dx === 0 && dy === 0) return -1;
  if (r >= 2 && dx === 1 && dy === 1) return 0;
  return Math.min(dx, dy);
}

// ------------------------------------------------------------------ shared motifs
/** a domed rivet / screw head (dia UI px), lit top-left, with an optional slot; (cx, cy) its centre in texels */
function screw(t: Tx, cx: number, cy: number, dia: number, slot: boolean, P: C[] = BR) {
  const r = (dia * t.d) / 2;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dd = Math.hypot(dx, dy);
    if (dd > r) continue;
    let c: C;
    if (dd > r - Math.max(1, t.d * 0.5)) c = P[0];
    else if (slot) { const l = (-dx - dy) / (r * 1.4); c = l > 0.55 ? P[7] : l > 0.25 ? P[6] : l > -0.1 ? P[5] : l > -0.45 ? P[4] : P[2]; }
    else c = dx + dy < -r * 0.55 ? P[7] : dx + dy > r * 0.45 ? P[2] : P[5];
    t.set(x, y, c);
  }
  if (slot && t.d >= 2) {
    const n = Math.max(1, Math.round(r - 1.5));
    for (let i = -n + 1; i < n; i++) { t.set(Math.floor(cx + i), Math.floor(cy - i), P[1]); t.set(Math.floor(cx + i + 1), Math.floor(cy - i), P[6]); }
  }
}

/** a square iron nail head (s UI px) with a rust run beneath it; (ux, uy) its top-left in UI px (fractional ok) */
function nail(t: Tx, ux: number, uy: number, s = 1.5, rust = true) {
  const d = t.d, n = Math.max(2, Math.round(s * d));
  const x0 = Math.round(ux * d), y0 = Math.round(uy * d);
  if (rust) for (let j = n; j < n + Math.max(2, d * 2); j++) for (let i = 1; i < n - (j > n + d ? 1 : 0); i++) t.set(x0 + i, y0 + j, j < n + d ? RUST[1] : RUST[0]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const e = i === 0 || j === 0 || i === n - 1 || j === n - 1;
    let c = IRON[2];
    if (e) c = (i === 0 || j === 0) && !(i === n - 1 || j === n - 1) ? IRON[3] : IRON[0];
    if (i === 1 && j === 1 && n > 2) c = IRON[4];
    if (n >= 4 && i > 1 && j > 1 && i < n - 1 && j < n - 1 && (i + j) % 3 === 0) c = RUST[2];  // a speck of rust on the head
    t.set(x0 + i, y0 + j, c);
  }
}

/** a barnacle (radius in UI px) at (cx, cy) in UI px: a muted, ridged cone with a dark slit opening at its top */
function barnacle(t: Tx, cx: number, cy: number, r: number) {
  const d = t.d, R = r * d, X = cx * d, Y = cy * d;
  for (let y = Math.floor(Y - R - 1); y <= Y + R + 1; y++) for (let x = Math.floor(X - R - 1); x <= X + R + 1; x++) {
    const dx = x + 0.5 - X, dy = y + 0.5 - Y, dd = Math.hypot(dx, dy * 1.15);
    if (dd > R) continue;
    let c: C;
    const a = Math.atan2(dy, dx);
    const slit = Math.abs(dy) < Math.max(0.6, R * 0.13) && Math.abs(dx) < R * 0.36;
    if (dd > R - Math.max(1, d * 0.55)) c = BARN[0];                          // the dark foot where it grips the wood
    else if (slit) c = hx('#241c22');                                         // the closed slit of the opening
    else if (dd < R * 0.5) c = dy < 0 ? BARN[3] : BARN[2];                    // the operculum plates round it
    else {
      // wall plates: radial ridges, lit from the top-left, cooler in shadow
      const ridge = Math.cos(a * 6 + 0.4) > 0.6;
      const l = (-dx - dy) / (R * 1.3);
      c = ridge ? BARN[1] : l > 0.3 ? BARN[3] : l > -0.2 ? BARN[2] : BARN[1];
    }
    t.set(x, y, c);
  }
  t.set(Math.round(X - R * 0.45), Math.round(Y - R * 0.5), BARN[4]);           // one glint
}

/** a small scallop shell (radius UI px), hinge at (cx, cy) UI px, fanning upward */
function scallop(t: Tx, cx: number, cy: number, r: number) {
  const d = t.d, R = r * d, X = cx * d, Y = cy * d;
  for (let y = Math.floor(Y - R - 1); y <= Y + 1; y++) for (let x = Math.floor(X - R - 1); x <= X + R + 1; x++) {
    const dx = x + 0.5 - X, dy = y + 0.5 - Y, dd = Math.hypot(dx, dy);
    if (dd > R || dy > 0.5) continue;
    const a = Math.atan2(-dy, dx);                                           // 0 (right) .. PI (left)
    let c: C;
    if (dd > R - Math.max(1, d * 0.6)) c = SHELL[0];
    else { const rib = Math.abs(Math.sin(a * 4.5)); c = rib < 0.22 ? SHELL[1] : a > Math.PI * 0.55 ? SHELL[3] : SHELL[2]; if (dd < R * 0.25) c = SHELL[4]; }
    t.set(x, y, c);
  }
  // the hinge ears
  for (let i = -Math.round(d * 1.5); i <= Math.round(d * 1.5); i++) t.set(Math.round(X + i), Math.round(Y), SHELL[0]);
}

/** a rounded sea-glass pebble (w x h UI px) at (ux, uy) UI px */
function seaGlass(t: Tx, ux: number, uy: number, w: number, h: number, P: C[] = GLASS) {
  const d = t.d, X = ux * d, Y = uy * d, W = w * d, H = h * d;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x + 0.5) / W * 2 - 1, ny = (y + 0.5) / H * 2 - 1, e = nx * nx + ny * ny;
    if (e > 1) continue;
    let c: C = e > 0.72 ? P[0] : P[1];
    if (e < 0.72 && nx + ny < -0.5) c = P[2];
    if (e < 0.3 && nx < -0.15 && ny < -0.15) c = P[3];
    t.set(X + x, Y + y, c);
  }
}

/**
 * rope lashing round a frame corner: three coils crossing the mitre diagonally, twisted strands, an ink edge.
 * Paints the texels where cornerness (cx + cy, in texels from the corner) falls in the coil band.
 */
function lashing(t: Tx, F: number) {
  const d = t.d, W = t.W, H = t.H;
  const s0 = Math.round(F * d * 0.62), cw = 2 * d, n = 3, lim = (F + 1) * d;
  const edge = Math.max(1, d >> 1);
  for (let y = 0; y < H; y++) {
    const cy = Math.min(y, H - 1 - y);
    if (cy >= lim) continue;
    for (let x = 0; x < W; x++) {
      const cx = Math.min(x, W - 1 - x);
      if (cx >= lim) continue;
      if (ring(Math.floor(x / d), Math.floor(y / d), t.uw, t.uh) < 0) continue;
      const s = cx + cy - s0;
      if (s < 0 || s >= n * cw) continue;
      const u = s % cw;                                   // across one coil
      let c: C;
      if (u < edge || cx === 0 || cy === 0) c = INK;
      else {
        const across = (u - edge) / (cw - edge);
        const tw = ((cx - cy + 4096 + Math.floor(s / cw) * d) % (2 * d)) < d;   // the twist of the strands
        c = across < 0.35 ? (tw ? ROPE[5] : ROPE[4]) : across < 0.75 ? (tw ? ROPE[3] : ROPE[2]) : ROPE[1];
      }
      t.set(x, y, c);
    }
  }
}

// ------------------------------------------------------------------ panels
/** the ship-plank frame (F UI px thick) with rope-lashed corners and sea crust, around an inset */
function paintFrame(uw: number, uh: number, d: number, inset: 'water' | 'sail') {
  const t = new Tx(uw, uh, d);
  const big = uw >= 60 && uh >= 44;
  const F = big ? 7 : 5;
  const W = t.W, H = t.H;
  const FT = F * d;
  const bw = (F - 4) * d; // board body width (texels)
  // per board (0 top, 1 right, 2 bottom, 3 left): grain lines along its length, salt-bleached spans, worm holes
  const salt: [number, number][][] = [[[0.12, 0.16], [0.6, 0.1]], [[0.35, 0.2]], [[0.48, 0.18], [0.86, 0.08]], [[0.22, 0.12], [0.7, 0.14]]];
  const worms: number[][] = [[0.42], [0.68], [0.28], [0.55]];
  const knots: number[][] = [[0.3], [0.58], [0.7], [0.4]];
  const boards = [0, 1, 2, 3].map((side) => {
    const len = side === 0 || side === 2 ? W : H;
    const pos = new Int16Array(len * 2), on = new Uint8Array(len * 2), bleach = new Uint8Array(len);
    for (let a = 0; a < len; a++) {
      for (let i = 0; i < 2; i++) {
        pos[a * 2 + i] = Math.round(bw * (i * 0.55 + 0.25)) + Math.round(Math.sin(a / (17 * d) + i * 2.4 + side) * d * 0.9 + Math.sin(a / (6.1 * d) + i * 1.3) * d * 0.35);
        on[a * 2 + i] = ((a + i * 23 * d + side * 31 * d) % (52 * d)) < 41 * d ? 1 : 0;
      }
      if (big) for (const [f, w] of salt[side]) if (Math.abs(a / len - f) < w / 2) bleach[a] = Math.abs(a / len - f) < w / 4 ? 2 : 1;
    }
    return { len, pos, on, bleach, worms: big ? worms[side].map((f) => Math.round(f * len)) : [], knots: big ? knots[side].map((f) => Math.round(f * len)) : [] };
  });
  const toneWood = (tone: number, bl: number) => (bl ? SALT[Math.max(0, Math.min(4, tone - 3 + (bl === 2 ? 1 : 0)))] : WD[Math.max(0, Math.min(7, tone))]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, INK); continue; }
    const dl = x, dt = y, dr = W - 1 - x, db = H - 1 - y;
    const m = Math.min(dl, dt, dr, db);
    if (r < F) {
      const side = m === dt ? 0 : m === db ? 2 : m === dl ? 3 : 1;
      const lit = side === 0 || side === 3;
      const along = side === 0 || side === 2 ? x : y;
      const b = boards[side];
      const bl = b.bleach[along];
      if (r === 1) {
        // the outer lip: a warm glint on the lit sides, bleached grey where the salt got at it
        const sub = m - d;
        const tone = lit ? (sub === 0 ? 7 : 6) : sub === d - 1 ? 1 : 2;
        t.set(x, y, toneWood(tone, bl)); continue;
      }
      if (r === F - 1) { t.set(x, y, INK); continue; }
      if (r === F - 2) {
        // a sea-worn teal paint trim along the inner edge, chipped back to wood in places
        const sub = m - (F - 2) * d;
        const chip = big && ((along + side * 37 * d) % (61 * d)) < 5 * d;
        if (chip) t.set(x, y, WD[lit ? 2 : 4]);
        else t.set(x, y, lit ? (sub === d - 1 ? TP[0] : TP[1]) : sub === 0 ? TP[4] : TP[3]);
        continue;
      }
      // the board body; mitre seams in the corners
      const cx = Math.min(dl, dr), cy = Math.min(dt, db);
      if (cx < FT && cy < FT) { const df = cx - cy; if (df === 0) { t.set(x, y, WD[1]); continue; } if (df === 1 && d >= 2) { t.set(x, y, WD[6]); continue; } }
      const c0 = m - 2 * d;
      let tone = side === 0 ? 5 : side === 3 ? 4 : 3;
      for (let i = 0; i < 2; i++) { const k = along * 2 + i; if (b.on[k] && c0 === b.pos[k]) tone -= 2; else if (b.on[k] && d >= 2 && c0 === b.pos[k] - 1 && ((along + i * 13 * d) % (37 * d)) < 15 * d) tone += 1; }
      for (const ka of b.knots) {
        if (Math.abs(along - ka) > 5 * d) continue;
        const e = ((along - ka) / (2.6 * d)) ** 2 + ((c0 - bw / 2) / (1.2 * d)) ** 2;
        if (e < 0.25) tone = 1; else if (e < 0.9) tone = Math.max(1, tone - 2); else if (e < 1.7) tone = Math.min(tone + 1, 7);
      }
      // worm holes: a short wandering row of 3 dark pin holes, each with a lit lower lip
      for (const wa of b.worms) {
        for (let i = 0; i < 3; i++) {
          const ha = wa + i * 2 * d, hc = Math.round(bw / 2) + (i === 1 ? -d : 0);
          const ea = along - ha, ec = c0 - hc;
          if (ea >= 0 && ea < Math.max(1, d >> 1) + (d >= 3 ? 1 : 0) && ec >= 0 && ec < Math.max(1, d >> 1) + (d >= 3 ? 1 : 0)) tone = 0;
          else if (ea >= 0 && ea < Math.max(1, d >> 1) + 1 && ec === Math.max(1, d >> 1) + (d >= 3 ? 1 : 0)) tone = 6;
        }
      }
      // a butt joint on long boards
      const bj = Math.round(b.len * 0.37);
      if (b.len > 150 * d && along === bj) tone = 1;
      if (b.len > 150 * d && along === bj + 1 && d >= 2) tone = 6;
      t.set(x, y, toneWood(tone, bl && c0 < bw * 0.6 ? bl : 0));
      continue;
    }
    // ---- inset
    const ix = x - FT, iy = y - FT, IW = W - 2 * FT, IH = H - 2 * FT;
    t.set(x, y, inset === 'sail' ? sailTex(ix, iy, IW, IH, r - F, d, big) : waterTex(ix, iy, IW, IH, r - F, d, big));
  }
  // iron nails: a pair at each butt joint and one near each end of every board, with rust runs
  if (big) {
    const mid = 2 + (F - 4) / 2 - 0.75;
    for (const [len, horiz] of [[uw, true], [uh, false]] as const) {
      const spots = [F + 5, len - F - 6.5];
      if (len > 150) spots.push(len * 0.37 - 2, len * 0.37 + 1.2);
      for (const p of spots) {
        if (horiz) { nail(t, p, mid, 1.5); nail(t, p, uh - 1 - mid - 1.5, 1.5); } else { nail(t, mid, p, 1.5); nail(t, uw - 1 - mid - 1.5, p, 1.5); }
      }
    }
  }
  // rope lashing round every corner
  lashing(t, F);
  if (big) {
    // sea crust: barnacles at the top-left and bottom-right, a scallop on the bottom board, a sea-glass gem top-right
    // tight clusters (big, medium, small overlapping) read as crust, never as a pair of eyes
    for (const [bx, by, br] of [[F + 3.4, 3.4, 2.1], [F + 6.3, 2.5, 1.4], [F + 5.6, 5.0, 1.0], [3.3, F + 3.6, 1.6], [2.4, F + 6.0, 1.0]] as const) barnacle(t, bx, by, br);
    for (const [bx, by, br] of [[uw - F - 3.6, uh - 3.4, 1.9], [uw - F - 6.4, uh - 2.6, 1.2], [uw - 3.3, uh - F - 3.6, 1.4]] as const) barnacle(t, bx, by, br);
    if (uw > 120) scallop(t, Math.round(uw * 0.22), uh - 1.2, 3.1);
    if (uw > 100) seaGlass(t, Math.round(uw * 0.68), 1.4, 4.2, 3.2);
  }
  return t.done();
}

/** dark water behind glass: banded depth, a sand floor, a glass reflection, an inner shadow */
function waterTex(ix: number, iy: number, IW: number, IH: number, di: number, d: number, big: boolean): C {
  const ux = Math.floor(ix / d), uy = Math.floor(iy / d);
  if (di === 0 && (uy === 0 || ux === 0)) return (iy === 0 || ix === 0) ? WATER[0] : WATER[1];
  const k = iy / IH;
  let c = k < 0.18 ? WATER[5] : k < 0.5 ? WATER[4] : WATER[3];
  // a sand floor along the bottom with a wavy crest (only on big insets)
  if (big && IH > 40 * d) {
    const crest = IH - Math.round(3.2 * d + Math.sin(ix / (9 * d)) * d * 0.9 + Math.sin(ix / (3.7 * d) + 1) * d * 0.4);
    if (iy >= crest) return iy === crest ? SAND[3] : iy < crest + d ? SAND[1] : ((ix + iy) % (5 * d) === 0 ? SAND[1] : SAND[0]);
  }
  // the glass: two parallel reflection streaks in the top-left
  const s = ix + iy * 0.9;
  if (big && iy < IH * 0.55) {
    const s1 = Math.round(IW * 0.1), s2 = s1 + 4 * d;
    if ((s >= s1 && s < s1 + Math.max(1, d)) || (s >= s2 && s < s2 + 2 * d && ix < IW * 0.35)) return lerpC(c, WATER[7], 0.28);
  }
  if (di === 0) return WATER[6];
  return c;
}

/** sailcloth: an ordered weave, a stitched hem, a sewn seam, brass grommets, a salt tide line */
function sailTex(ix: number, iy: number, IW: number, IH: number, di: number, d: number, big: boolean, framed = true): C {
  const ux = Math.floor(ix / d), uy = Math.floor(iy / d);
  if (framed && di === 0) {
    if (uy === 0 || ux === 0) return (iy === 0 || ix === 0) ? SAIL[1] : SAIL[2];
    return SAIL[6];
  }
  let c = SAIL[5];
  if (d >= 2 ? ((iy % 2 === 0 && ix % 4 === 0) || (iy % 2 === 1 && ix % 4 === 2)) : ((ix + iy) % 4 === 0)) c = SAIL[4];   // the weave
  // the hem: a darker band one UI px wide inside the edge, with a running stitch
  const IWu = Math.round(IW / d), IHu = Math.round(IH / d);
  const sx = Math.min(ux, IWu - 1 - ux), sy = Math.min(uy, IHu - 1 - uy);
  const hem = framed ? 1 : 0;
  if (sx === hem || sy === hem) {
    const mid = (sy === hem ? iy : ix) % d === (d >> 1);
    const p = (sy === hem ? ix : iy) % (3 * d);
    return mid && p < 2 * d && d >= 2 ? SAIL[2] : SAIL[3];
  }
  if (!big) return c;
  // a sewn seam across the cloth (two panels of sail)
  const fy = Math.round(IH * 0.46);
  if (iy === fy || iy === fy + 1) return iy === fy ? SAIL[2] : SAIL[3];
  if (iy === fy + 2 && d >= 2) return SAIL[6];
  if ((iy === fy - 2 || iy === fy + 3) && ix % (3 * d) < d) return SAIL[3];
  // brass grommets near the top corners
  for (const gx of [4.5, IWu - 4.5]) {
    const dd = Math.hypot(ix + 0.5 - gx * d, iy + 0.5 - 4.5 * d);
    if (dd < 2.2 * d) return dd < 1.1 * d ? SAIL[1] : dd < 1.5 * d ? BR[(ix + iy) % 2 === 0 && d >= 2 ? 5 : 4] : BR[2];
  }
  // a salt tide line across the lower-left corner
  if (IWu > 90 && IHu > 50) {
    const R = Math.min(IW, IH) * 0.38, cx = -R * 0.25, cy = IH + R * 0.15;
    if (ix < cx + R + 3 * d && iy > cy - R - 3 * d) {
      const ang = Math.atan2(iy - cy, ix - cx);
      const rr = R + Math.sin(ang * 6 + 1.2) * d * 1.1 + Math.sin(ang * 2.5) * d;
      const dd = Math.hypot(ix - cx, iy - cy);
      if (Math.abs(dd - rr) < (d >= 2 ? 1 : 0.5)) return SAIL[3];
      if (dd < rr && dd > rr - 2 * d && c === SAIL[5]) return SAIL[4];
    }
  }
  return c;
}

/** a rope-trimmed card: ink, a 2 UI px twisted rope border, ink, then dark water */
function paintDark(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  const big = uw > 70 && uh > 50;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0 || r === 3) { t.set(x, y, INK); continue; }
    if (r <= 2) {
      // twisted rope round the border: strands slanting along the rope, lit on the outer side
      const m = Math.min(x, y, W - 1 - x, H - 1 - y) - d;  // 0 .. 2d-1 across the rope
      const along = (y === Math.min(y, H - 1 - y) && m === y - d) || H - 1 - y - d === m ? x : y;
      const tw = ((along + m) % (2 * d)) < d;
      const across = m / (2 * d);
      const c = across < 0.3 ? (tw ? ROPE[5] : ROPE[4]) : across < 0.7 ? (tw ? ROPE[3] : ROPE[2]) : ROPE[1];
      t.set(x, y, c); continue;
    }
    t.set(x, y, waterTex(x - 4 * d, y - 4 * d, W - 8 * d, H - 8 * d, r - 4, d, big), 248);
  }
  // knots of rope at the corners
  if (uw > 30 && uh > 20) for (const [cx, cy] of [[2, 2], [uw - 2, 2], [2, uh - 2], [uw - 2, uh - 2]]) {
    const X = cx * d, Y = cy * d, R = 2.4 * d;
    for (let y = Math.floor(Y - R); y <= Y + R; y++) for (let x = Math.floor(X - R); x <= X + R; x++) {
      const dd = Math.hypot(x + 0.5 - X, y + 0.5 - Y);
      if (dd > R) continue;
      t.set(x, y, dd > R - Math.max(1, d * 0.6) ? INK : (x - y + 64 * d) % (2 * d) < d ? ROPE[4] : (x + y) < X + Y - d ? ROPE[5] : ROPE[2]);
    }
  }
  return t.done();
}

/** a sailcloth card: ink outline, a stitched hem, a 2 px card edge (tooltips, tags, objective cards) */
function paintPaper(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, INK); continue; }
    const by = uh - 1 - uy;
    if (by === 1) { t.set(x, y, (y % d) === d - 1 ? SAIL[0] : SAIL[1]); continue; }      // the card's thickness
    if (by === 2) { t.set(x, y, (y % d) === 0 && d >= 2 ? SAIL[3] : SAIL[2]); continue; }
    if (r === 1 && (uy === 1 || ux === 1)) { t.set(x, y, (y === d || x === d) ? SAIL[6] : SAIL[5]); continue; }
    t.set(x, y, sailTex(x - d, y - d, W - 2 * d, H - 4 * d, r - 1, d, false, false));
  }
  return t.done();
}

/** a recessed well: dark water (light text) or wet sand with ripples (dark text) */
function paintInset(uw: number, uh: number, d: number, sand: boolean) {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh, 1);
    if (r < 0) continue;
    const top = uy === 0 || ux === 0;
    if (r === 0) { t.set(x, y, top ? (sand ? SAND[0] : INK) : sand ? SAND[5] : WATER[6]); continue; }
    if (r === 1 && (uy === 1 || ux === 1)) { t.set(x, y, sand ? (x === d || y === d ? SAND[1] : SAND[2]) : x === d || y === d ? WATER[0] : WATER[1]); continue; }
    if (sand) {
      // ripples: wavy crests (a shadow line and a lit line) at a steady spacing
      const w = Math.round(Math.sin(x / (7 * d)) * d * 0.9 + Math.sin(x / (2.9 * d) + 2) * d * 0.3);
      const p = (y + w + 64 * d) % (5 * d);
      t.set(x, y, p === 0 ? SAND[2] : p === 1 && d >= 2 ? SAND[5] : SAND[4]);
    } else t.set(x, y, waterTex(x - d, y - d, W - 2 * d, H - 2 * d, r - 1, d, false), 240);
  }
  return t.done();
}

function paintSlot(uw: number, uh: number, d: number, kind: 'slot' | 'slotBlue' | 'slotTv') {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const dm = Math.min(ux, uy, uw - 1 - ux, uh - 1 - uy);
    if (kind === 'slotBlue') { if (dm === 0) { if (((ux + uy) >> 1) & 1) t.set(x, y, hx('#e6f3ff')); continue; } t.set(x, y, hx('#0b2a5c'), 150); continue; }
    if (kind === 'slotTv') { if (dm === 0) { t.set(x, y, hx('#2a9ad0')); continue; } t.set(x, y, hx('#040c30'), 235); continue; }
    const r = ring(ux, uy, uw, uh, uw > 12 ? 2 : 1);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, INK); continue; }
    const m = Math.min(x, y, W - 1 - x, H - 1 - y) - d;
    if (r === 1) {
      // a wooden rim: in shadow on the top / left (the recess), warm wood catching light bottom / right
      if (uy === 1 || ux === 1) t.set(x, y, m === 0 ? WD[0] : WD[1]);
      else t.set(x, y, m === 0 ? WD[5] : WD[4]);
      continue;
    }
    // the floor: dark water with one glass glint across the top-left corner
    const s = (x - 2 * d) + (y - 2 * d);
    let c = (y - 2 * d) < (H - 4 * d) * 0.4 ? WATER[4] : WATER[3];
    if (r === 2 && (uy === 2 || ux === 2) && m < d + Math.max(1, d >> 1)) c = WATER[1];
    else if (uw >= 16 && s >= Math.round(2.5 * d) && s < Math.round(2.5 * d) + Math.max(1, d >> 1)) c = WATER[6];
    t.set(x, y, c, 246);
  }
  return t.done();
}

/** a salt-bleached driftwood plank sign: grain, a knot, iron nails at the ends */
function paintPlaque(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, INK); continue; }
    if (r === 1) { const top = uy === 1, left = ux === 1; t.set(x, y, top ? (y === d ? SALT[4] : SALT[4]) : left ? SALT[4] : SALT[1]); continue; }
    let c = SALT[3];
    for (let i = 0; i < 3; i++) {
      const gy = Math.round(H * (0.28 + i * 0.22) + Math.sin(x / (11 * d) + i * 2) * d * 0.7);
      if (y === gy && ((x + i * 19 * d) % (40 * d)) < 30 * d) c = SALT[2];
      else if (y === gy + 1 && d >= 2 && ((x + i * 7 * d) % (40 * d)) < 12 * d) c = SALT[4];
    }
    // the lower edge a shade warmer: the wood under the salt
    if (uh - 1 - uy === 1) c = y % d === d - 1 ? WD[3] : lerpC(SALT[2], WD[5], 0.35);
    // a knot two thirds along
    const kx = W * 0.68, ky = H * 0.5, e = ((x - kx) / (2.4 * d)) ** 2 + ((y - ky) / (1.1 * d)) ** 2;
    if (uw > 40 && e < 1) c = e < 0.3 ? SALT[0] : SALT[1];
    t.set(x, y, c);
  }
  if (uw > 24 && uh >= 10) { const ny = uh / 2 - 0.9; nail(t, 2.4, ny, 1.6, false); nail(t, uw - 4, ny, 1.6, false); }
  return t.done();
}

/** an engraved brass plate (ship's fitting) */
function paintBrass(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, INK); continue; }
    const m = Math.min(x, y, W - 1 - x, H - 1 - y) - d;
    if (r === 1) { const lit = uy === 1 || ux === 1; t.set(x, y, lit ? (m === 0 ? BR[7] : BR[6]) : m === d - 1 ? BR[1] : BR[2]); continue; }
    let c = BR[4];
    if (y >= H * 0.22 && y < H * 0.22 + Math.max(1, d)) c = BR[5];
    if (d >= 2 && y % 3 === 1 && c === BR[4]) c = lerpC(BR[4], BR[3], 0.4);
    if (r === 2 && uh >= 14 && d >= 2) { if (m === d) c = BR[1]; else if (m === d + 1) c = BR[6]; }
    t.set(x, y, c);
  }
  if (uh >= 14) for (const [px, py] of [[2, 2], [uw - 3, 2], [2, uh - 3], [uw - 3, uh - 3]]) t.setU(px, py, VERD[1]);
  if (uw > 24 && uh >= 10) { const cy = (uh / 2) * d; const dia = Math.min(3.2, uh * 0.22); screw(t, 4.5 * d, cy, dia, d >= 2); screw(t, (uw - 4.5) * d, cy, dia, d >= 2); }
  return t.done();
}

const BP = { edge: hx('#0b2a5c'), paper: hx('#1d4f94'), grid: hx('#2a5fa6'), grid2: hx('#3a74bc'), line: hx('#e6f3ff') };
function paintBlueprint(uw: number, uh: number, d: number, card = false, sel = false) {
  const t = new Tx(uw, uh, d);
  const edge = sel ? hx('#ffe9a0') : BP.edge, line = sel ? hx('#fff2c0') : BP.line;
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    if ((x === 0 || x === uw - 1) && (y === 0 || y === uh - 1)) continue;
    const dm = Math.min(x, y, uw - 1 - x, uh - 1 - y);
    if (dm === 0) { t.setU(x, y, edge); continue; }
    let c = BP.paper;
    const gx = (x - 3) % 8, gy = (y - 3) % 8;
    if (gx === 0 || gy === 0) c = ((x - 3) % 32 === 0 || (y - 3) % 32 === 0) ? BP.grid2 : BP.grid;
    if (card ? dm === 2 : dm === 3) c = line;
    if (!card && dm === 5) c = BP.grid2;
    t.setU(x, y, c);
  }
  if (!card) for (const [cx, cy] of [[8, 8], [uw - 9, 8], [8, uh - 9], [uw - 9, uh - 9]]) { for (let k = -2; k <= 2; k++) { t.setU(cx + k, cy, BP.line); t.setU(cx, cy + k, BP.line); } }
  return t.done();
}

function paintTv(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const fill = hx('#0b1a66'), cyan = hx('#3ad8ff'), deep = hx('#020818');
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const dm = Math.min(x, y, uw - 1 - x, uh - 1 - y);
    const cn = Math.min(x, uw - 1 - x) + Math.min(y, uh - 1 - y);
    if (cn < 2) continue;
    if (dm === 0 || cn === 2) { t.setU(x, y, deep); continue; }
    if (dm === 1 || cn === 3) { t.setU(x, y, cyan); continue; }
    if (dm === 2) { t.setU(x, y, deep); continue; }
    for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) t.set(x * d + i, y * d + j, fill, 240);
  }
  return t.done();
}

const cache = new Map<string, HTMLCanvasElement>();
let cacheTexels = 0;
/** painted canvases, LRU, within a texel budget (~24 M texels, about 96 MB) */
function cached(key: string, fn: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (c) { cache.delete(key); cache.set(key, c); return c; }
  c = fn(); cache.set(key, c); cacheTexels += c.width * c.height;
  while ((cacheTexels > 24e6 || cache.size > 900) && cache.size > 1) {
    const first = cache.keys().next().value as string;
    const old = cache.get(first)!; cache.delete(first); cacheTexels -= old.width * old.height;
  }
  return c;
}
const clampD = (d: number) => Math.max(1, Math.min(5, Math.round(d)));

/** a panel of the given kind at exactly w x h UI px, painted at d texels per UI px (canvas: w*d x h*d) */
export function skin(kind: SkinKind, w: number, h: number, d = 1): HTMLCanvasElement {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h)); d = clampD(d);
  return cached(`${kind}|${w}|${h}|${d}`, () => {
    switch (kind) {
      case 'wood': case 'stone': return paintFrame(w, h, d, 'water');
      case 'cream': return paintFrame(w, h, d, 'sail');
      case 'blueprint': return paintBlueprint(w, h, d);
      case 'card': return paintBlueprint(w, h, d, true);
      case 'cardSel': return paintBlueprint(w, h, d, true, true);
      case 'paper': return paintPaper(w, h, d);
      case 'tv': return paintTv(w, h, d);
      case 'dark': return paintDark(w, h, d);
      case 'plaque': return paintPlaque(w, h, d);
      case 'brass': return paintBrass(w, h, d);
      case 'inset': return paintInset(w, h, d, false);
      case 'insetCream': return paintInset(w, h, d, true);
      default: return paintSlot(w, h, d, kind);
    }
  });
}

// ------------------------------------------------------------------ buttons
/**
 * Button palette. `text`/`textSh` are the label colour and its outline (or, on brass, its light emboss).
 * Green = go / confirm, red = close / danger, wood = neutral (a plank), brass / gold = ship's fittings, dark =
 * secondary (teal-painted plank), blue = info. `ramp` is the face's 7-tone hue-shifted bevel ramp (dark -> light).
 * `mat`: 'paint' = sea-worn paint over wood (grain through the paint, chipped corners showing wood), 'wood' = a bare
 * plank with nail heads, 'brass' = brushed metal. `plate` styles get a carved / engraved label plate.
 */
interface BtnPal { face: string; hi: string; lo: string; lip: string; out: string; text: string; textSh: string; ramp: string[]; plate: boolean; mat: 'paint' | 'wood' | 'brass' }
const BRASS_RAMP = ['#5a2e16', '#8a5422', '#b47c30', '#d29e44', '#ecc46a', '#fbe29a', '#fff6d6'];
export const BTN: Record<BtnStyle, BtnPal> = {
  wood: { face: '#a86e3e', hi: '#dcae74', lo: '#6b3c24', lip: '#33191a', out: KIT.ink, text: '#fff4dc', textSh: '#2a140c', ramp: ['#33191a', '#4e2a1e', '#6b3c24', '#8a5430', '#a86e3e', '#c48c52', '#e8be86'], plate: true, mat: 'wood' },
  brass: { face: '#c8913a', hi: '#f2c66d', lo: '#9e6a2a', lip: '#5a2e16', out: KIT.ink, text: '#2a1606', textSh: '#f8dc8a', ramp: BRASS_RAMP, plate: true, mat: 'brass' },
  gold: { face: '#f2c66d', hi: '#fff1c2', lo: '#c8913a', lip: '#7a4a1a', out: KIT.ink, text: '#2a1606', textSh: '#fff6d6', ramp: ['#7a4a1a', '#b07a2a', '#d8a440', '#eec060', '#f8d886', '#ffecb4', '#fffae6'], plate: true, mat: 'brass' },
  green: { face: '#5fae3f', hi: '#a6e07a', lo: '#3f8a2a', lip: '#173a2a', out: KIT.ink, text: '#ffffff', textSh: '#123a14', ramp: ['#173a2a', '#24603a', '#3a8a36', '#5fae3f', '#86c84e', '#b8e070', '#e6f6a6'], plate: false, mat: 'paint' },
  red: { face: '#e0564a', hi: '#ff9a84', lo: '#b03a30', lip: '#4a1226', out: KIT.ink, text: '#ffffff', textSh: '#4a0e12', ramp: ['#4a1226', '#7e1e2c', '#b0342e', '#e0564a', '#f27a5a', '#ffa47a', '#ffd2a6'], plate: false, mat: 'paint' },
  blue: { face: '#3d8fd6', hi: '#9fd0ff', lo: '#2a6aaa', lip: '#142a5a', out: KIT.ink, text: '#ffffff', textSh: '#0c2440', ramp: ['#142a5a', '#1c4a8a', '#2a6ab0', '#3d8fd6', '#62b0e8', '#9cd4f4', '#d6f2ff'], plate: false, mat: 'paint' },
  dark: { face: '#1f5f5e', hi: '#58a494', lo: '#14454a', lip: '#081620', out: KIT.ink, text: '#f3e7c9', textSh: '#06141a', ramp: ['#081620', '#0b2a30', '#14454a', '#1f5f5e', '#2f7d76', '#58a494', '#8ccab4'], plate: false, mat: 'paint' },
  stone: { face: '#5c6670', hi: '#a0aab4', lo: '#46505a', lip: '#1c2230', out: KIT.ink, text: '#f3f0e8', textSh: '#14181e', ramp: ['#1c2230', '#2e3644', '#46505a', '#5c6670', '#7a8490', '#a0aab4', '#d0d6dc'], plate: true, mat: 'paint' },
  tv: { face: '#1a3cb0', hi: '#6ae6ff', lo: '#0c2070', lip: '#040c38', out: '#01040e', text: '#ffffff', textSh: '#040c38', ramp: ['#040c38', '#0c2070', '#14309a', '#1a3cb0', '#2a5ad0', '#46a8f0', '#6ae6ff'], plate: false, mat: 'paint' },
};
/** the lip (dark side) under a resting button face; a resting face also leaves 1 px of headroom for the hover lift */
export const LIP = 2;
/**
 * where a button's face sits for a state, relative to its box: [top offset, face height] in UI px. Resting faces
 * start 2 px down (1 px headroom + the outline), hover lifts 1 px, down sinks 2 px, on (toggled) sits 1 px down.
 * The face is h - 5 tall.
 */
export function btnFace(state: BtnState, h: number): [number, number] {
  const top = state === 'hover' ? 1 : state === 'down' ? 4 : state === 'on' ? 3 : 2;
  return [top, h - 5];
}
/** the carved / engraved label plate inside a face (UI px, relative to the box), or null */
export function btnPlate(style: BtnStyle, state: BtnState, w: number, h: number): [number, number, number, number] | null {
  const [ft, fh] = btnFace(state, h);
  if (!BTN[style].plate || w < 34 || fh < 12) return null;
  const inset = BTN[style].mat === 'wood' && w >= 60 ? 7 : 4;
  return [inset, ft + 2, w - 2 * inset, fh - 4];
}

function grey(c: C): C { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return lerpC(c, [l, l, l * 1.04], 0.82).map((v) => v * 0.66) as C; }

function paintBtn(style: BtnStyle, state: BtnState, uw: number, uh: number, d: number) {
  const P = BTN[style];
  const R0 = P.ramp.map(hx);
  let R = R0;
  if (state === 'hover') R = R0.map((c, i) => (i > 0 ? lerpC(c, R0[Math.min(6, i + 1)], 0.5) : c));
  if (state === 'down') R = R0.map((c, i) => (i < 6 ? lerpC(c, R0[Math.max(0, i - 1)], 0.45) : lerpC(c, R0[5], 0.5)));
  const dis = state === 'disabled';
  if (dis) R = R0.map(grey);
  const WDc = dis ? WD.map(grey) : WD;
  const t = new Tx(uw, uh, d);
  const [ft, fh] = btnFace(state, uh);
  const T0 = ft - 1;
  const bh = uh - T0;
  const faceT = ft * d, faceB = (ft + fh) * d, FH = fh * d;
  const plate = btnPlate(style, state, uw, uh);
  const W = t.W, out = hx(P.out);
  const hd2 = Math.max(1, d >> 1);
  // grain lines running along the plank (wood, and faintly through paint)
  const grainY = [0.34, 0.7].map((f) => Math.round(FH * f));
  const grainAt = (x: number, fy: number) => grainY.some((g, i) => fy === g + Math.round(Math.sin(x / (9 * d) + i * 2.2) * d * 0.5) && ((x + i * 17 * d) % (34 * d)) < 25 * d);
  // chipped paint: hand-placed nicks at the top-left and bottom-right corners and one along the top
  const chip = (x: number, fy: number) => P.mat === 'paint' && ((x < 3 * d && fy < 2 * d && x + fy < 3 * d) || (W - 1 - x < 4 * d && FH - 1 - fy < 2 * d && (W - 1 - x) + (FH - 1 - fy) < 4 * d) || (uw > 50 && fy < d && Math.abs(x - W * 0.62) < d * 1.5));
  for (let y = T0 * d; y < t.H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy - T0, uw, bh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, out); continue; }
    if (y >= faceB) {
      // the lip: the plank's edge, a seam then a two-tone dark side
      const ly = y - faceB;
      t.set(x, y, ly === 0 ? R[0] : ly < d ? R[1] : R[0]);
      continue;
    }
    const fy = y - faceT, fx = x - d, fw = W - 2 * d;
    let c: C;
    if (fy === 0) c = R[6];                                                    // the rim highlight
    else if (fy < hd2 + (d >= 3 ? 1 : 0)) c = R[5];
    else if (fx < hd2) c = fx === 0 ? R[5] : R[4];                             // a lit left bevel
    else if (fx >= fw - hd2) c = fx === fw - 1 ? R[1] : R[2];                   // a shaded right bevel
    else if (fy >= FH - hd2) c = fy === FH - 1 ? R[1] : R[2];                   // a shaded bottom bevel
    else {
      const k = fy / FH;
      c = k < 0.3 ? R[4] : k < 0.78 ? R[3] : lerpC(R[3], R[2], 0.5);
      if (P.mat === 'paint' && k < 0.42) c = k < 0.12 ? R[5] : lerpC(R[4], R[5], 0.3);
      if (P.mat !== 'brass' && grainAt(x, fy)) c = P.mat === 'wood' ? R[1] : lerpC(c, R[2], 0.45);
      if (P.mat === 'brass' && d >= 2 && y % 3 === 1) c = lerpC(c, R[2], 0.25);   // brushed brass
    }
    if (chip(x, fy) && fy < FH - hd2) c = fy === 0 || x === d ? WDc[6] : WDc[4];  // paint chipped back to wood
    t.set(x, y, c);
  }
  // the carved label plate: a recess one tone darker, shadowed top/left, catching light bottom/right
  if (plate) {
    const [px, py, pw, ph] = plate;
    const x0 = px * d, y0 = py * d, x1 = (px + pw) * d - 1, y1 = (py + ph) * d - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let c = lerpC(R[3], R[2], 0.55);
      if (y === y0 || x === x0) c = R[1];
      else if (y === y1 || x === x1) c = R[5];
      else if (d >= 2 && (y === y0 + 1 || x === x0 + 1)) c = R[2];
      t.set(x, y, c);
    }
  }
  // nail heads at the ends of long wooden planks; tiny pins on long brass plates
  if (P.mat === 'wood' && uw >= 60) { const ny = ft + fh / 2 - 0.75; nail(t, 2.2, ny, 1.5, false); nail(t, uw - 3.7, ny, 1.5, false); }
  if (P.mat === 'brass' && plate && uw >= 70 && d >= 2) for (const sx of [plate[0] - 2, plate[0] + plate[2] + 1]) { const cx = sx * d + (d >> 1), cy = Math.round((plate[1] + plate[3] / 2) * d); t.set(cx, cy - 1, R[6]); t.set(cx, cy, R[1]); }
  // a specular glint in the lit corner
  if (!dis && uw > 10) { const gx = 2 * d, gy = faceT + d; t.set(gx, gy, R[6]); t.set(gx + 1, gy, R[6]); t.set(gx, gy + 1, R[6]); if (d >= 2) t.set(gx + 2, gy, R[5]); }
  return t.done();
}

export function btnSkin(style: BtnStyle, state: BtnState, w: number, h: number, d = 1): HTMLCanvasElement {
  w = Math.max(6, Math.round(w)); h = Math.max(8, Math.round(h)); d = clampD(d);
  return cached(`btn|${style}|${state}|${w}|${h}|${d}`, () => paintBtn(style, state, w, h, d));
}

// ------------------------------------------------------------------ small widget art (texel density too)
export const KEYCAP_H = 13;
/** a chunky keycap (no label): cream (or dark lacquer) dished face with a bevel ramp, a 2 px side, an ink outline */
export function keycapBody(w: number, h = KEYCAP_H, dark = false, down = false, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return cached(`kcb|${w}|${h}|${dark}|${down}|${d}`, () => {
    const t = new Tx(w, h, d);
    const top = down ? 2 : 0;
    const sideU = down ? 0 : 2;
    const faceT = (top + 1) * d, faceB = (h - 1 - sideU) * d;
    const hd2 = Math.max(1, d >> 1);
    for (let y = top * d; y < t.H; y++) for (let x = 0; x < t.W; x++) {
      const ux = Math.floor(x / d), uy = Math.floor(y / d);
      const r = ring(ux, uy - top, w, h - top, 1);
      if (r < 0) continue;
      if (r === 0) { t.set(x, y, INK); continue; }
      if (y >= faceB) { const sy = y - faceB; t.set(x, y, sy === 0 ? (dark ? TW[0] : CR[0]) : sy < d ? (dark ? TW[2] : CR[2]) : dark ? TW[1] : CR[1]); continue; }
      const fy = y - faceT, fx = x - d, fw = t.W - 2 * d;
      let c: C;
      if (fy < hd2) c = dark ? TW[6] : CR[7];
      else if (fx < hd2) c = dark ? TW[5] : CR[6];
      else if (fx >= fw - hd2) c = dark ? TW[2] : CR[3];
      else if (y >= faceB - hd2) c = dark ? TW[2] : CR[4];
      else c = (y - faceT) / (faceB - faceT) > 0.55 ? (dark ? TW[3] : CR[5]) : dark ? TW[4] : CR[6]; // the dish: lower half a step darker
      t.set(x, y, c);
    }
    return t.done();
  });
}

/**
 * the close widget: a coral key in an engraved brass bezel with a bevelled cream X. The canvas is `size` wide and
 * size + 3 tall (UI px): the plate rests 1 px down on a 2 px lip, lifts on hover and sinks on press.
 */
export function closeArt(size: number, state: 'normal' | 'hover' | 'down' | 'disabled', d = 1): HTMLCanvasElement {
  const S = Math.max(11, Math.round(size));
  d = clampD(d);
  return cached(`close|${S}|${state}|${d}`, () => {
    const t = new Tx(S, S + 3, d);
    const dis = state === 'disabled';
    const F0 = ramp('#4a1226', '#7e1e2c', '#b0342e', '#e0564a', '#f27a5a', '#ffa47a', '#ffd2a6');
    let FR = F0;
    if (state === 'hover') FR = F0.map((c, i) => lerpC(c, F0[Math.min(6, i + 1)], 0.45));
    if (state === 'down') FR = F0.map((c, i) => lerpC(c, F0[Math.max(0, i - 1)], 0.4));
    if (dis) FR = F0.map(grey);
    const B2 = dis ? BR.map(grey) : BR;
    const top = state === 'hover' ? 0 : state === 'down' ? 3 : 1;
    const lip = state === 'down' ? 0 : state === 'hover' ? 3 : 2;
    const bz = S >= 18 ? 2 : 1;
    const Sd = S * d;
    const ringOf = (ux: number, uy: number) => {
      const dx = Math.min(ux, S - 1 - ux), dy = Math.min(uy, S - 1 - uy);
      if ((dx === 0 && dy < 2) || (dy === 0 && dx < 2)) return -1;
      if (dx === 1 && dy === 1) return 0;
      return Math.min(dx, dy);
    };
    // the lip: the plate's silhouette, lower, in dark brass
    if (lip) for (let y = 0; y < Sd; y++) for (let x = 0; x < Sd; x++) { const rr = ringOf(Math.floor(x / d), Math.floor(y / d)); if (rr >= 0) t.set(x, y + (top + lip) * d, rr === 0 ? INK : B2[1]); }
    for (let y = 0; y < Sd; y++) for (let x = 0; x < Sd; x++) {
      const rr = ringOf(Math.floor(x / d), Math.floor(y / d));
      if (rr < 0) continue;
      const Y = y + top * d;
      if (rr === 0) { t.set(x, Y, INK); continue; }
      const dl = x - d, dt = y - d, dr = Sd - 1 - d - x, db = Sd - 1 - d - y;
      const m = Math.min(dl, dt, dr, db);
      if (rr <= bz) {
        // the brass bezel: lit top/left, shaded bottom/right, an engraved line round its middle on big keys
        const lit = m === dt || m === dl;
        let c: C = lit ? (m === 0 ? B2[7] : B2[5]) : m === 0 ? B2[1] : B2[3];
        if (bz === 2 && d >= 2 && m === d) c = B2[1];
        if (bz === 2 && d >= 2 && m === d + 1) c = B2[6];
        t.set(x, Y, c); continue;
      }
      if (rr === bz + 1) { t.set(x, Y, INK); continue; }
      // the coral face: a ramp with a gloss band in the upper third
      const fy = y - (bz + 2) * d, fh = (S - 2 * (bz + 2)) * d, fx = x - (bz + 2) * d;
      const k = fy / fh;
      let c: C = k < 0.1 ? FR[6] : k < 0.38 ? FR[4] : k < 0.85 ? FR[3] : FR[2];
      if (fx < Math.max(1, d >> 1)) c = lerpC(c, FR[5], 0.5);
      if (fx >= fh - Math.max(1, d >> 1)) c = FR[2];
      t.set(x, Y, c);
    }
    // the X: two bevelled strokes (a lit edge, the body, a dark drop shadow) in texels
    const a = (bz + 2) * d, n = Sd - 2 * a, mg = Math.max(d, Math.round(n * 0.2)), len = n - 2 * mg;
    const th = Math.max(2, Math.round(d * (S >= 16 ? 1.7 : 1.1)));
    const sh = Math.max(1, d >> 1);
    const cream = dis ? hx('#d8d4cc') : hx('#fffaee'), cream2 = dis ? hx('#a8a49c') : hx('#e9dbb7'), shadow = dis ? hx('#3a3836') : FR[0];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < len; i++) for (const dir of [1, -1]) {
      const px = a + mg + i, py = dir > 0 ? a + mg + i : a + mg + len - 1 - i;
      for (let k = 0; k < th; k++) {
        if (pass === 0) t.set(px + k + sh, py + sh + top * d, shadow);
        else t.set(px + k, py + top * d, k === th - 1 ? cream2 : cream);
      }
    }
    return t.done();
  });
}

/** a folder tab (open at the bottom): a wooden plank tab; on = lighter wood with a sea-worn teal painted cap */
export function tabSkin(state: 'on' | 'hover' | 'off', w: number, h: number, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return cached(`tab|${state}|${w}|${h}|${d}`, () => {
    const t = new Tx(w, h, d);
    const base = state === 'on' ? 5 : state === 'hover' ? 4 : 3;
    for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W; x++) {
      const ux = Math.floor(x / d), uy = Math.floor(y / d);
      const dx = Math.min(ux, w - 1 - ux);
      if (uy === 0 && dx < 2) continue;
      if (uy === 1 && dx === 0) continue;
      if (uy === 0 || dx === 0 || (uy === 1 && dx === 1)) { t.set(x, y, INK); continue; }
      if (state === 'on' && uy <= 2) {
        // a teal painted cap, worn: a lit edge, a chip at the left
        const chipped = x < 4 * d && x > 2 * d && uy === 2;
        t.set(x, y, chipped ? WD[5] : uy === 1 ? (y === d ? TP[4] : TP[3]) : (y % d === d - 1 ? TP[0] : TP[2])); continue;
      }
      if (dx === 1) { t.set(x, y, x < t.W / 2 ? WD[Math.min(7, base + 2)] : WD[Math.max(0, base - 2)]); continue; }
      // the plank: grain lines running along the tab
      let tone = base;
      for (const f of [0.42, 0.74]) { const gy = Math.round(f * t.H + Math.sin(x / (9 * d) + f * 5) * d * 0.6); if (y === gy && ((x + Math.round(f * 40) * d) % (30 * d)) < 22 * d) tone = base - 2; }
      if (uy === 1 && state !== 'on') tone = base + 2;
      t.set(x, y, WD[Math.max(0, Math.min(7, tone))]);
    }
    return t.done();
  });
}

/** the slider knob: a brass lozenge with a bevel ramp and a grip groove */
export function knobArt(state: 'normal' | 'hover' | 'down', d = 1): HTMLCanvasElement {
  d = clampD(d);
  return cached(`knob|${state}|${d}`, () => {
    const t = new Tx(9, 14, d);
    const top = state === 'down' ? 1 : 0;
    const R = state === 'hover' ? BR.map((c, i) => lerpC(c, BR[Math.min(7, i + 1)], 0.5)) : BR;
    const hd2 = Math.max(1, d >> 1);
    for (let y = top * d; y < (13 + top) * d; y++) for (let x = 0; x < 9 * d; x++) {
      const ux = Math.floor(x / d), uy = Math.floor(y / d) - top;
      if ((ux === 0 || ux === 8) && (uy === 0 || uy === 12)) continue;
      const e = Math.min(ux, uy, 8 - ux, 12 - uy);
      if (e === 0) { t.set(x, y, INK); continue; }
      const ty = y - (top + 1) * d, tx = x - d;
      let c: C = R[4];
      if (ty < hd2) c = R[7];
      else if (ty < d) c = R[6];
      else if (tx < hd2) c = R[6];
      else if (uy >= 10) c = uy === 11 && y % d === d - 1 ? R[1] : R[2];
      else if (ux === 7) c = R[2];
      if (ux === 4 && uy > 3 && uy < 9) c = x % d === 0 ? R[1] : R[2];
      if (ux === 5 && uy > 3 && uy < 9 && x % d === 0) c = R[6];
      t.set(x, y, c);
    }
    if (state !== 'down') for (let x = d; x < 8 * d; x++) for (let j = 0; j < d; j++) t.set(x, 13 * d + j, hx('#000000'), 150);
    return t.done();
  });
}

/** a checkbox: a recessed sailcloth box (bevel, weave) with a bold bevelled kelp tick */
export function checkArt(on: boolean, hover: boolean, down: boolean, S = 13, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return cached(`chk|${on}|${hover}|${down}|${S}|${d}`, () => {
    const t = new Tx(S, S, d);
    for (let y = 0; y < S * d; y++) for (let x = 0; x < S * d; x++) {
      const ux = Math.floor(x / d), uy = Math.floor(y / d);
      const r = ring(ux, uy, S, S, 1);
      if (r < 0) continue;
      if (r === 0) { t.set(x, y, INK); continue; }
      if (r === 1 && (uy === 1 || ux === 1)) { t.set(x, y, down ? CR[1] : (x === d || y === d) ? CR[2] : CR[3]); continue; }
      if (r === 1) { t.set(x, y, CR[7]); continue; }
      const wv = d >= 2 ? (y % 2 === 0 && x % 4 === 0) || (y % 2 === 1 && x % 4 === 2) : false;   // a sailcloth weave
      t.set(x, y, hover ? (wv ? CR[5] : CR[7]) : wv ? CR[5] : CR[6]);
    }
    if (on) {
      const K = ramp('#0e2a12', '#1f4a16', '#3a7a28', '#5fae3f', '#86c84e', '#c6ec8a');
      const pts: [number, number][] = [[2.8, 6.6], [5.4, 9.3], [10.4, 3.2]];
      const w2 = 1.3 * d * (S / 13);
      const sc = (d * S) / 13;
      const seg = (px: number, py: number): number => {
        let best = 1e9;
        for (let i = 0; i < 2; i++) {
          const Ax = pts[i][0] * sc, Ay = pts[i][1] * sc, Bx = pts[i + 1][0] * sc, By = pts[i + 1][1] * sc;
          const vx = Bx - Ax, vy = By - Ay, l2 = vx * vx + vy * vy;
          const k = Math.max(0, Math.min(1, ((px - Ax) * vx + (py - Ay) * vy) / l2));
          best = Math.min(best, Math.hypot(px - Ax - vx * k, py - Ay - vy * k));
        }
        return best;
      };
      const o = Math.max(1, d >> 1);
      for (let y = 0; y < S * d; y++) for (let x = 0; x < S * d; x++) {
        const dd = seg(x + 0.5, y + 0.5);
        if (dd <= w2) { const edgeTop = seg(x + 0.5, y + 0.5 + o) > w2 - 0.2 ? false : seg(x + 0.5, y + 0.5 - o) > w2; t.set(x, y, edgeTop ? K[5] : dd > w2 - 0.9 ? K[2] : K[3]); }
        else if (seg(x + 0.5 - o, y + 0.5 - o) <= w2) t.set(x, y, K[0]);
      }
    }
    return t.done();
  });
}

// ------------------------------------------------------------------ animation sprites (PixelUI draws these over cached skins)
/** a bubble (radius r UI px): a thin light rim, a faint tinted body, a glint top-left */
export function bubbleArt(r: number, d = 1): HTMLCanvasElement {
  d = clampD(d); r = Math.max(1, Math.round(r));
  return cached(`bub|${r}|${d}`, () => {
    const S = 2 * r + 1, t = new Tx(S, S, d);
    const R = (S * d) / 2, rim = Math.max(1, d * 0.75);
    for (let y = 0; y < S * d; y++) for (let x = 0; x < S * d; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R, dd = Math.hypot(dx, dy);
      if (dd > R) continue;
      if (dd > R - rim) t.set(x, y, dx + dy < 0 ? hx('#e6fbff') : hx('#8fd0dc'), 235);
      else t.set(x, y, hx('#7fc8d8'), 55);
    }
    const g = Math.max(1, Math.round(d * 0.8));
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) t.set(Math.round(R * 0.55) + i, Math.round(R * 0.55) + j, hx('#ffffff'), 255);
    return t.done();
  });
}

/**
 * a seamless caustic-light tile (96 UI px square): the bright web that sunlight through waves throws on the
 * seabed, from two crossing sine fields (smooth deterministic curves, no noise). Transparent except the lines.
 */
export function causticTile(d = 1): HTMLCanvasElement {
  d = clampD(d);
  return cached(`caustic|${d}`, () => {
    const U = 96, t = new Tx(U, U, d), N = U * d, k = (2 * Math.PI) / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = Math.sin(x * k * 3 + Math.sin(y * k * 2) * 1.8 + Math.sin(x * k) * 0.9);
      const b = Math.sin(y * k * 3 + Math.sin(x * k * 2) * 1.6 + Math.sin(y * k * 1) * 1.1 + 1.3);
      const v = Math.abs(a + b);
      const w = 0.09 + 0.05 / d;
      if (v < w) t.set(x, y, hx('#c8fff4'), 255);
      else if (v < w * 1.9) t.set(x, y, hx('#8fe6e0'), 120);
    }
    return t.done();
  });
}
