// Painted UI skins, v5 "the diver's kit": every panel, button and small widget is painted per texel at its exact
// size (cached) with rich, HAND-PLACED structure and never noise, dither or speckle:
//   * frames are teal-lacquered wood: grain lines that follow each board, knots, mitred corner seams, butt joints
//     on long boards, lacquer worn back to warm wood where hands touch, chipped spots on the lit lip
//   * brass: bevel ramps of 6-8 hue-shifted tones (cool shadows, warm highlights), engraved grooves with a catch
//     light, a polished sheen, brushed lines, slotted screws and domed rivets, verdigris patina in the recesses
//   * insets: oilcloth with an ordered twill, a stitched border, a fold crease and a water-stain tide line; cream
//     card with ordered fibre strokes, an aged rim, a fold crease, a coffee ring and a faint anchor watermark
//   * buttons: a banded bevel ramp, a rim highlight, an engraved label plate (brass / dark) or a gloss band (colours)
//
// DENSITY: painters take `d` texels per UI px (PixelUI passes its canvas density `hd`: 2 at 720p, 3 at 1080p), so
// silhouettes and outlines stay on the UI pixel grid while fine detail (grain, engraving, stitches, fibres) is one
// texel = one device pixel. d = 1 (tiny windows) still paints every motif, just coarser.
//
//   skin('wood', 160, 90, ui.hd)                 panel canvas (160*d x 90*d)  -> draw it at 160 x 90 UI px
//   btnSkin('green', 'hover', 64, 22, ui.hd)     button canvas (normal | hover | down | disabled | on)
//   PAD.wood                                     content insets [l, t, r, b] (UI px)
//
// Kinds (old names keep working and map onto the new look):
//   wood / stone   the main panel: lacquered teal wood frame, brass corner brackets + rivets, dark oilcloth inset
//   cream          the same frame around a cream card inset (dark ink text): notes, summaries, letters
//   dark           a slim brass-trimmed oilcloth card (light text): settings, sub-panels, choice rows
//   paper          a cream card with an ink outline and a card edge (dark text): tooltips, tags
//   inset          a recessed oilcloth well to group content inside a panel; insetCream on cream insets
//   slot           a recessed item slot; slotBlue (dashed blueprint slot), slotTv
//   plaque / brass an engraved brass name plate (dark ink text)
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
const ramp = (...s: string[]) => s.map(hx);
const lerpC = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------ hue-shifted ramps (dark -> light)
/** teal-lacquered wood: cool blue shadows -> warm sea-green highlights */
const TW = ramp('#081620', '#0d2330', '#12333c', '#1a454c', '#22575a', '#2e6d68', '#478c7a', '#79b494');
/** wood showing through worn lacquer: plum-brown shadow -> honey highlight */
const WW = ramp('#3a2220', '#5e3a26', '#86582e', '#ad7c40', '#d0a65e');
/** brass: red-brown shadow -> pale butter highlight */
const BR = ramp('#2e140e', '#5a2e16', '#8a5422', '#b47c30', '#d29e44', '#ecc46a', '#fbe29a', '#fff6d6');
const VERD = ramp('#2a5e56', '#3e8a78', '#6cb8a0');
/** oilcloth (dark inset) */
const OL = ramp('#061219', '#0a1d24', '#0e252d', '#112a32', '#152f37', '#1c3a42', '#2a4e52', '#5e8c80');
const TWILL = lerpC(OL[3], OL[5], 0.5);
/** cream card */
const CR = ramp('#8a6a46', '#b0925f', '#c9b087', '#dcc79f', '#e9dbb7', '#f2e6c8', '#f9f1dc', '#fffaee');
const INK = hx(KIT.ink);

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
/** a domed rivet (dia UI px), lit top-left, with an optional screw slot; (cx, cy) its centre in texels */
function screw(t: Tx, cx: number, cy: number, dia: number, slot: boolean, P: C[] = BR) {
  const r = (dia * t.d) / 2;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dd = Math.hypot(dx, dy);
    if (dd > r) continue;
    let c: C;
    if (dd > r - Math.max(1, t.d * 0.5)) c = P[0];                       // the rim in shadow
    else if (slot) {
      const l = (-dx - dy) / (r * 1.4);                                    // light from the top-left
      c = l > 0.55 ? P[7] : l > 0.25 ? P[6] : l > -0.1 ? P[5] : l > -0.45 ? P[4] : P[2];
    } else c = dx + dy < -r * 0.55 ? P[7] : dx + dy > r * 0.45 ? P[2] : P[5]; // a small dome: one glint, one shade
    t.set(x, y, c);
  }
  if (slot && t.d >= 2) {
    // a diagonal slot with a lit lower lip
    const n = Math.max(1, Math.round(r - 1.5));
    for (let i = -n + 1; i < n; i++) { t.set(Math.floor(cx + i), Math.floor(cy - i), P[1]); t.set(Math.floor(cx + i + 1), Math.floor(cy - i), P[6]); }
  }
}

/** a brass piece from a UI-px mask: ink silhouette (1 UI px), a texel bevel ramp, a polished sheen and brushed lines,
 *  an engraved groove with a catch light, and verdigris patina at the given UI px spots */
function brassPlate(t: Tx, inMask: (ux: number, uy: number) => boolean, box: [number, number, number, number], o: { band?: 'h' | 'diag'; groove?: boolean; patina?: [number, number][] } = {}) {
  const d = t.d;
  const inM = (ux: number, uy: number) => ux >= 0 && uy >= 0 && ux < t.uw && uy < t.uh && inMask(ux, uy);
  const edgeU = (ux: number, uy: number) => inM(ux, uy) && (!inM(ux - 1, uy) || !inM(ux + 1, uy) || !inM(ux, uy - 1) || !inM(ux, uy + 1));
  const [bx0, by0, bx1, by1] = box;
  for (let uy = by0; uy <= by1; uy++) for (let ux = bx0; ux <= bx1; ux++) {
    if (!inM(ux, uy)) continue;
    if (edgeU(ux, uy)) { t.setU(ux, uy, INK); continue; }
    const eU = edgeU(ux, uy - 1), eL = edgeU(ux - 1, uy), eD = edgeU(ux, uy + 1), eR = edgeU(ux + 1, uy);
    for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
      const x = ux * d + i, y = uy * d + j;
      let c: C;
      if (eU || eL) c = (eU && j === 0) || (eL && i === 0) ? BR[7] : BR[6];          // lit bevel (top / left)
      else if (eD || eR) c = (eD && j === d - 1) || (eR && i === d - 1) ? BR[1] : BR[2]; // shaded bevel (bottom / right)
      else {
        c = BR[4];
        if (o.band === 'diag' && ((x + y) % (11 * d)) < 2 * d) c = BR[5];          // a polished diagonal sheen
        if (o.band === 'h' && y >= t.H * 0.22 && y < t.H * 0.22 + Math.max(1, d)) c = BR[5];
        if (d >= 2 && y % 3 === 1 && c === BR[4]) c = lerpC(BR[4], BR[3], 0.4);     // brushed lines
      }
      t.set(x, y, c);
    }
  }
  if (o.groove) {
    // an engraved groove 2 UI px inside the silhouette: a dark texel line with a catch light on its lower / right side
    for (let uy = by0; uy <= by1; uy++) for (let ux = bx0; ux <= bx1; ux++) {
      if (!inM(ux, uy) || edgeU(ux, uy)) continue;
      if (edgeU(ux - 1, uy) || edgeU(ux + 1, uy) || edgeU(ux, uy - 1) || edgeU(ux, uy + 1)) continue;
      const gx = ux * d, gy = uy * d;
      const top = edgeU(ux, uy - 2) || (edgeU(ux - 1, uy - 2) && edgeU(ux + 1, uy - 2)), bot = edgeU(ux, uy + 2);
      const lef = edgeU(ux - 2, uy), rig = edgeU(ux + 2, uy);
      if (top) for (let i = 0; i < d; i++) { t.set(gx + i, gy, BR[1]); if (d >= 2) t.set(gx + i, gy + 1, BR[6]); }
      if (bot) for (let i = 0; i < d; i++) { t.set(gx + i, gy + d - 1, BR[1]); if (d >= 2) t.set(gx + i, gy + d - 2, BR[2]); }
      if (lef) for (let j = 0; j < d; j++) { t.set(gx, gy + j, BR[1]); if (d >= 2) t.set(gx + 1, gy + j, BR[6]); }
      if (rig) for (let j = 0; j < d; j++) { t.set(gx + d - 1, gy + j, BR[1]); if (d >= 2) t.set(gx + d - 2, gy + j, BR[2]); }
    }
  }
  for (const [ux, uy] of o.patina ?? []) if (inM(ux, uy) && !edgeU(ux, uy)) for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) if ((i + j) % 2 === 0 || d === 1) t.set(ux * d + i, uy * d + j, (i + j) === 0 ? VERD[0] : VERD[1]);
}

/** ordered fibre strokes for paper (staggered short dashes; never random): -1 darker, 1 lighter, 0 none */
function fibre(ix: number, iy: number, d: number): number {
  const rowP = 2 * d + 1;
  if (iy % rowP !== 0) return 0;
  const row = Math.floor(iy / rowP);
  const p = (ix + row * 7 * d) % (17 * d);
  if (p < 2 * d) return -1;
  if (p >= 9 * d && p < 10 * d) return 1;
  return 0;
}

// ------------------------------------------------------------------ panels
/** the lacquered teal wood frame (F UI px thick) with brass corner brackets around an inset */
function paintFrame(uw: number, uh: number, d: number, inset: 'oil' | 'cream') {
  const t = new Tx(uw, uh, d);
  const big = uw >= 60 && uh >= 44;
  const F = big ? 7 : 5;
  const W = t.W, H = t.H;
  const FT = F * d;
  const bw = (F - 4) * d;
  // grain lines per board: 3 wavy lines across the board width, broken into long strokes, a lit edge on some
  // per board (0 top, 1 right, 2 bottom, 3 left), precomputed along its length: 3 wavy grain lines broken into long
  // strokes (the middle one darker), a lit edge on some strokes, worn spans and chip spots
  const knots: number[][] = [[0.31], [0.62], [0.71], [0.44]];
  const wear: [number, number][][] = [[[0.18, 0.1], [0.55, 0.07]], [[0.4, 0.06]], [[0.62, 0.12]], [[0.3, 0.08], [0.82, 0.05]]];
  const boards = [0, 1, 2, 3].map((side) => {
    const len = side === 0 || side === 2 ? W : H;
    const pos = new Int16Array(len * 3), on = new Uint8Array(len * 3), lit = new Uint8Array(len * 3), worn = new Uint8Array(len);
    for (let a = 0; a < len; a++) {
      for (let i = 0; i < 3; i++) {
        pos[a * 3 + i] = Math.round(bw * (i + 0.5) / 3) + Math.round(Math.sin(a / (13 * d) + i * 2.1 + side * 1.3) * d * 0.6 + Math.sin(a / (5.3 * d) + i) * 0.4);
        on[a * 3 + i] = ((a + i * 17 * d + side * 29 * d) % (44 * d)) < 33 * d ? 1 : 0;
        lit[a * 3 + i] = d >= 2 && ((a + i * 11 * d) % (60 * d)) < 18 * d ? 1 : 0;
      }
      if (big) for (const [f, wdt] of wear[side]) { if (Math.abs(a / len - f) < wdt / 2) worn[a] = 1; if (Math.abs(a - Math.round(f * len)) < d * 1.5) worn[a] = 2; }
    }
    return { len, pos, on, lit, worn, knots: big ? knots[side].map((f) => Math.round(f * len)) : [] };
  });
  const grain = (a: number, c: number, side: number): number => {
    const b = boards[side];
    let tone = 0;
    for (let i = 0; i < 3; i++) {
      const k = a * 3 + i;
      if (!b.on[k]) continue;
      if (c === b.pos[k]) tone = i === 1 ? -2 : -1;
      else if (b.lit[k] && c === b.pos[k] - 1) tone = 1;
    }
    return tone;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, INK); continue; }
    const dl = x, dt = y, dr = W - 1 - x, db = H - 1 - y;
    const m = Math.min(dl, dt, dr, db);
    if (r < F) {
      const side = m === dt ? 0 : m === db ? 2 : m === dl ? 3 : 1; // 0 top, 1 right, 2 bottom, 3 left
      const lit = side === 0 || side === 3;
      const along = side === 0 || side === 2 ? x : y, len = side === 0 || side === 2 ? W : H;
      const wv = boards[side].worn[along];
      const wearHere = wv > 0, chip = wv === 2;
      if (r === 1) {
        // the lip: a warm glint row on the lit sides, worn back to honey wood in places, chipped
        const sub = m - d;
        let c: C = lit ? (sub === 0 ? TW[7] : TW[6]) : sub === d - 1 ? TW[0] : TW[1];
        if (wearHere) c = lit ? (sub === 0 ? WW[4] : WW[3]) : WW[1];
        if (chip && sub === 0) c = WW[0];
        t.set(x, y, c); continue;
      }
      if (r === F - 1) { t.set(x, y, INK); continue; }
      if (r === F - 2) {
        // the inner bevel: top/left slopes face down into the inset (shade), bottom/right face up (lit)
        const sub = m - (F - 2) * d;
        t.set(x, y, lit ? (sub === d - 1 ? TW[0] : TW[1]) : sub === 0 ? TW[5] : TW[4]); continue;
      }
      // the board body; mitre seams in the corners (a dark diagonal with a lit texel beside it)
      const cx = Math.min(dl, dr), cy = Math.min(dt, db);
      if (cx < FT && cy < FT) { const df = cx - cy; if (df === 0) { t.set(x, y, TW[1]); continue; } if (df === 1 && d >= 2) { t.set(x, y, TW[6]); continue; } }
      const c0 = m - 2 * d;
      let tone = side === 0 ? 5 : side === 3 ? 4 : 3;
      tone += grain(along, c0, side);
      // a knot: dark heart, a ring, the grain swirling round it as a lit halo
      for (const ka of boards[side].knots) {
        if (Math.abs(along - ka) > 5 * d) continue;
        const kc = Math.floor(bw / 2);
        const e = ((along - ka) / (2.4 * d)) ** 2 + ((c0 - kc) / (1.1 * d)) ** 2;
        if (e < 0.25) tone = 2; else if (e < 1) tone = Math.max(2, tone - 1); else if (e < 1.8) tone = Math.min(tone + 1, 6);
      }
      // a butt joint on long boards
      const bj = Math.round(len * 0.37);
      if (len > 150 * d && along === bj) tone = 1;
      if (len > 150 * d && along === bj + 1 && d >= 2) tone = 6;
      let c = TW[Math.max(0, Math.min(7, tone))];
      if (wearHere && c0 < Math.max(1, d >> 1)) c = WW[2];                    // wear creeping onto the board edge
      t.set(x, y, c);
      continue;
    }
    // ---- inset
    const ix = x - FT, iy = y - FT, IW = W - 2 * FT, IH = H - 2 * FT;
    const di = r - F;
    t.set(x, y, inset === 'cream' ? creamTex(ix, iy, IW, IH, di, d, big) : oilTex(ix, iy, IW, IH, di, d, big));
  }
  // brass corner brackets: an L of plate as thick as the frame, engraved, with a slotted screw and patina
  const C2 = big ? 17 : 9;
  const inL = (ux: number, uy: number) => {
    const cx = Math.min(ux, uw - 1 - ux), cy = Math.min(uy, uh - 1 - uy);
    if (ring(ux, uy, uw, uh) < 0) return false;
    return (cy < F && cx < C2) || (cx < F && cy < C2);
  };
  const pat: [number, number][] = big ? [[F - 2, F - 2], [uw - F + 1, F - 2], [F - 2, uh - F + 1], [uw - F + 1, uh - F + 1], [C2 - 3, 2], [2, C2 - 3], [uw - C2 + 2, uh - 3]] : [];
  brassPlate(t, inL, [0, 0, uw - 1, uh - 1], { band: 'diag', groove: big && d >= 2, patina: pat });
  const sr = big ? 2.8 : 1.8;
  for (const [cx, cy] of [[F / 2, F / 2], [uw - F / 2, F / 2], [F / 2, uh - F / 2], [uw - F / 2, uh - F / 2]]) screw(t, cx * d, cy * d, sr, big);
  if (big) {
    // domed rivets along long sides
    const along = (len: number, put: (p: number) => void) => { const n = Math.floor((len - 2 * C2) / 56); for (let i = 1; i <= n; i++) put(Math.round(C2 + ((len - 2 * C2) * i) / (n + 1)) + 0.5); };
    const mid = 3.5;
    along(uw, (p) => { screw(t, p * d, mid * d, 1.8, false); screw(t, p * d, (uh - mid) * d, 1.8, false); });
    along(uh, (p) => { screw(t, mid * d, p * d, 1.8, false); screw(t, (uw - mid) * d, p * d, 1.8, false); });
  }
  return t.done();
}

/** oilcloth texel: an ordered twill, an inner shadow, a stitched border, a fold crease, a water-stain tide line */
function oilTex(ix: number, iy: number, IW: number, IH: number, di: number, d: number, big: boolean): C {
  const ux = Math.floor(ix / d), uy = Math.floor(iy / d);
  if (di === 0) {
    // the frame's shadow on the cloth (top / left) and a lit lip (bottom / right)
    if (uy === 0 || ux === 0) return (iy === 0 || ix === 0) ? OL[0] : OL[1];
    return OL[5];
  }
  let c = OL[3];
  const P = Math.max(4, 3 * d);
  if ((ix + iy) % P === 0) c = TWILL;                                            // ordered twill
  if (!big) return c;
  const IWu = Math.round(IW / d), IHu = Math.round(IH / d);
  // a stitched border 3 UI px in: dashes 2 UI long, a hole shadow after each, a lit thread texel at the start
  const sx = Math.min(ux, IWu - 1 - ux), sy = Math.min(uy, IHu - 1 - uy);
  const st = 3, mid = Math.floor(d / 2);
  const onRow = sy === st && sx >= st && (uy === st ? iy % d === mid : (IH - 1 - iy) % d === mid);
  const onCol = sx === st && sy >= st && (ux === st ? ix % d === mid : (IW - 1 - ix) % d === mid);
  if (onRow || onCol) {
    const p = (onRow ? ix : iy) % (3 * d);
    if (p < 2 * d) return p === 0 ? OL[7] : lerpC(OL[7], OL[6], 0.55);
    if (p === 2 * d) return OL[0];
  }
  if (sx <= st || sy <= st) return c;
  // a fold crease across the cloth (between the stitches)
  const fy = Math.round(IH * 0.42);
  if (iy === fy) return OL[1];
  if (iy === fy + 1 && d >= 2) return OL[5];
  // a water stain creeping in from the lower-right corner: a wavy tide line (an arc centred off the corner) with
  // a slightly lighter band just inside it
  if (IWu > 110 && IHu > 70) {
    const R = Math.min(IW, IH) * 0.42, cx = IW + R * 0.25, cy = IH + R * 0.2;
    if (ix > cx - R - 3 * d && iy > cy - R - 3 * d) {
      const ang = Math.atan2(iy - cy, ix - cx);
      const rr = R + Math.sin(ang * 7 + 0.7) * d * 1.1 + Math.sin(ang * 3) * d * 1.4;
      const dd = Math.hypot(ix - cx, iy - cy);
      if (Math.abs(dd - rr) < (d >= 2 ? 1 : 0.5)) return OL[5];
      if (dd < rr && dd > rr - d * 2 && c === OL[3]) return OL[4];
    }
  }
  return c;
}

/** a tiny anchor watermark (UI px map) for cream cards */
const ANCHOR = ['....##....', '...#..#...', '....##....', '....##....', '.########.', '....##....', '....##....', '#...##...#', '##..##..##', '.##.##.##.', '..######..'];

/** cream-card texel: fibres, an aged rim, a fold crease, a coffee ring, an anchor watermark */
function creamTex(ix: number, iy: number, IW: number, IH: number, di: number, d: number, big: boolean): C {
  const ux = Math.floor(ix / d), uy = Math.floor(iy / d);
  const IWu = Math.round(IW / d), IHu = Math.round(IH / d);
  if (di === 0) {
    if (uy === 0 || ux === 0) return (iy === 0 || ix === 0) ? CR[2] : CR[3];
    return CR[7];
  }
  let c = CR[5];
  const f = fibre(ix, iy, d);
  if (f < 0) c = CR[4]; else if (f > 0) c = CR[6];
  if (di === 1) c = f < 0 ? CR[3] : CR[4];                                      // an aged rim
  if (!big) return c;
  // a fold crease (a vertical valley: shade + light)
  const fx = Math.round(IW * 0.36);
  if (ix === fx) return CR[3];
  if (ix === fx + 1 && d >= 2) return CR[7];
  // a coffee ring in the top right (a tide line and a fainter inner arc)
  if (IWu > 90 && IHu > 50 && Math.abs(ix - IW * 0.86) < Math.min(IW, IH) * 0.2 + 3 * d && Math.abs(iy - IH * 0.22) < Math.min(IW, IH) * 0.2 + 3 * d) {
    const cx = IW * 0.86, cy = IH * 0.22, R = Math.min(IW, IH) * 0.2;
    const ang = Math.atan2(iy - cy, ix - cx);
    const dd = Math.hypot(ix - cx, iy - cy);
    const rr = R + Math.sin(ang * 3 + 1) * d * 0.8;
    if (Math.abs(dd - rr) < (d >= 2 ? 1 : 0.5) && Math.sin(ang * 2) > -0.7) return CR[3];
    if (Math.abs(dd - (rr - 2.5 * d)) < 0.5 && Math.sin(ang * 3) > 0.2) return CR[4];
  }
  // the anchor watermark, bottom right
  if (IWu > 100 && IHu > 70) {
    const px = ux - (IWu - 18), py = uy - (IHu - 18);
    if (py >= 0 && py < ANCHOR.length && px >= 0 && px < 10 && ANCHOR[py][px] === '#') return CR[4];
  }
  return c;
}

/** a slim card: ink outline, a 1 UI px brass trim (bevel ramp, a polished band), ink, the oilcloth inset; screws */
function paintDark(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const big = uw > 40 && uh > 30;
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0 || r === 2) { t.set(x, y, INK); continue; }
    if (r === 1) {
      const m = Math.min(x, y, W - 1 - x, H - 1 - y) - d;
      const lit = uy === 1 || ux === 1;
      let c = lit ? (m === 0 ? BR[7] : m === d - 1 ? BR[4] : BR[6]) : (m === 0 ? BR[3] : m === d - 1 ? BR[1] : BR[2]);
      if (uy === 1 && x > W * 0.12 && x < W * 0.3 && m === (d >> 1)) c = BR[7];       // a polished band on the top trim
      t.set(x, y, c, 250); continue;
    }
    t.set(x, y, oilTex(x - 3 * d, y - 3 * d, W - 6 * d, H - 6 * d, r - 3, d, big && uw > 70 && uh > 50), 246);
  }
  if (big) for (const [cx, cy] of [[1.5, 1.5], [uw - 1.5, 1.5], [1.5, uh - 1.5], [uw - 1.5, uh - 1.5]]) screw(t, cx * d, cy * d, 2.4, d >= 3);
  return t.done();
}

/** a cream card: ink outline, a lit top/left, an aged rim and handled corners, fibres, a 2 px card edge (no fold or
 *  stain: tooltips and tags are dense with text) */
function paintPaper(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, INK); continue; }
    const by = uh - 1 - uy;
    if (by === 1) { t.set(x, y, (y % d) === d - 1 ? CR[0] : CR[1]); continue; }      // the card's thickness
    if (by === 2) { t.set(x, y, (y % d) === 0 && d >= 2 ? CR[3] : CR[2]); continue; }
    if (r === 1 && (uy === 1 || ux === 1)) { t.set(x, y, (y === d || x === d) ? CR[7] : CR[6]); continue; }
    if (r === 1) { t.set(x, y, CR[3]); continue; }
    let c = CR[5];
    const f = fibre(x, y, d);
    if (f < 0) c = CR[4]; else if (f > 0) c = CR[6];
    const cd = Math.min(ux + uy, uw - 1 - ux + uy, ux + uh - 1 - uy, uw - 1 - ux + uh - 1 - uy);
    if (cd < 6) c = f < 0 ? CR[3] : CR[4];                                         // corners handled more
    t.set(x, y, c);
  }
  return t.done();
}

/** a recessed well (groups content inside a panel) */
function paintInset(uw: number, uh: number, d: number, cream: boolean) {
  const t = new Tx(uw, uh, d);
  const W = t.W, H = t.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy, uw, uh, 1);
    if (r < 0) continue;
    const top = uy === 0 || ux === 0;
    if (r === 0) { t.set(x, y, top ? (cream ? CR[1] : INK) : cream ? CR[7] : OL[6]); continue; }
    if (r === 1 && (uy === 1 || ux === 1)) { t.set(x, y, cream ? (x === d || y === d ? CR[2] : CR[3]) : x === d || y === d ? OL[0] : OL[1]); continue; }
    if (cream) { const f = fibre(x, y, d); t.set(x, y, f < 0 ? CR[3] : CR[4]); }
    else t.set(x, y, (x + y) % Math.max(4, 3 * d) === 0 ? OL[3] : OL[2], 238);
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
      // a recess: a deep shadow ramp top / left, a teal lit lip bottom / right
      if (uy === 1 || ux === 1) t.set(x, y, m === 0 ? hx('#040e14') : hx('#08171e'));
      else t.set(x, y, m === 0 ? TW[4] : TW[3]);
      continue;
    }
    if (r === 2 && (uy === 2 || ux === 2) && m < d + Math.max(1, d >> 1)) { t.set(x, y, hx('#0b1c23'), 244); continue; }
    // the floor: dark teal with a faint ordered weave
    t.set(x, y, (x + y) % Math.max(4, 3 * d) === 0 ? hx('#132c33') : hx('#0f252c'), 244);
  }
  return t.done();
}

/** an engraved brass name plate */
function paintPlaque(uw: number, uh: number, d: number) {
  const t = new Tx(uw, uh, d);
  const big = uh >= 14 && uw >= 30;
  brassPlate(t, (ux, uy) => ring(ux, uy, uw, uh) >= 0, [0, 0, uw - 1, uh - 1], { band: 'h', groove: big && d >= 2, patina: big ? [[2, 2], [uw - 3, 2], [2, uh - 3], [uw - 3, uh - 3]] : [] });
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
      case 'wood': case 'stone': return paintFrame(w, h, d, 'oil');
      case 'cream': return paintFrame(w, h, d, 'cream');
      case 'blueprint': return paintBlueprint(w, h, d);
      case 'card': return paintBlueprint(w, h, d, true);
      case 'cardSel': return paintBlueprint(w, h, d, true, true);
      case 'paper': return paintPaper(w, h, d);
      case 'tv': return paintTv(w, h, d);
      case 'dark': return paintDark(w, h, d);
      case 'plaque': case 'brass': return paintPlaque(w, h, d);
      case 'inset': return paintInset(w, h, d, false);
      case 'insetCream': return paintInset(w, h, d, true);
      default: return paintSlot(w, h, d, kind);
    }
  });
}

// ------------------------------------------------------------------ buttons
/**
 * Button palette. `text`/`textSh` are the label colour and its outline (or, on brass, its light emboss).
 * Green = go / confirm, red = close / danger, wood (= brass) = neutral, gold = the important neutral, dark =
 * secondary (lacquer), blue = info. `ramp` is the face's 7-tone hue-shifted bevel ramp (dark -> light); `plate`
 * styles get an engraved label plate, the others a gloss band.
 */
interface BtnPal { face: string; hi: string; lo: string; lip: string; out: string; text: string; textSh: string; ramp: string[]; plate: boolean }
const BRASS_RAMP = ['#5a2e16', '#8a5422', '#b47c30', '#d29e44', '#ecc46a', '#fbe29a', '#fff6d6'];
export const BTN: Record<BtnStyle, BtnPal> = {
  wood: { face: '#c8913a', hi: '#f2c66d', lo: '#9e6a2a', lip: '#5a2e16', out: KIT.ink, text: '#2a1606', textSh: '#f8dc8a', ramp: BRASS_RAMP, plate: true },
  brass: { face: '#c8913a', hi: '#f2c66d', lo: '#9e6a2a', lip: '#5a2e16', out: KIT.ink, text: '#2a1606', textSh: '#f8dc8a', ramp: BRASS_RAMP, plate: true },
  gold: { face: '#f2c66d', hi: '#fff1c2', lo: '#c8913a', lip: '#7a4a1a', out: KIT.ink, text: '#2a1606', textSh: '#fff6d6', ramp: ['#7a4a1a', '#b07a2a', '#d8a440', '#eec060', '#f8d886', '#ffecb4', '#fffae6'], plate: true },
  green: { face: '#5fae3f', hi: '#a6e07a', lo: '#3f8a2a', lip: '#173a2a', out: KIT.ink, text: '#ffffff', textSh: '#123a14', ramp: ['#173a2a', '#24603a', '#3a8a36', '#5fae3f', '#86c84e', '#b8e070', '#e6f6a6'], plate: false },
  red: { face: '#e0564a', hi: '#ff9a84', lo: '#b03a30', lip: '#4a1226', out: KIT.ink, text: '#ffffff', textSh: '#4a0e12', ramp: ['#4a1226', '#7e1e2c', '#b0342e', '#e0564a', '#f27a5a', '#ffa47a', '#ffd2a6'], plate: false },
  blue: { face: '#3d8fd6', hi: '#9fd0ff', lo: '#2a6aaa', lip: '#142a5a', out: KIT.ink, text: '#ffffff', textSh: '#0c2440', ramp: ['#142a5a', '#1c4a8a', '#2a6ab0', '#3d8fd6', '#62b0e8', '#9cd4f4', '#d6f2ff'], plate: false },
  dark: { face: '#1d4f55', hi: '#3c8a8c', lo: '#163f44', lip: '#081620', out: KIT.ink, text: '#f3e7c9', textSh: '#06141a', ramp: ['#081620', '#0d2330', '#153a42', '#1d4f55', '#2a6668', '#428a80', '#76b498'], plate: true },
  stone: { face: '#5c6670', hi: '#a0aab4', lo: '#46505a', lip: '#1c2230', out: KIT.ink, text: '#f3f0e8', textSh: '#14181e', ramp: ['#1c2230', '#2e3644', '#46505a', '#5c6670', '#7a8490', '#a0aab4', '#d0d6dc'], plate: true },
  tv: { face: '#1a3cb0', hi: '#6ae6ff', lo: '#0c2070', lip: '#040c38', out: '#01040e', text: '#ffffff', textSh: '#040c38', ramp: ['#040c38', '#0c2070', '#14309a', '#1a3cb0', '#2a5ad0', '#46a8f0', '#6ae6ff'], plate: false },
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
/** the engraved label plate inside a face (UI px, relative to the box), or null for styles / sizes without one */
export function btnPlate(style: BtnStyle, state: BtnState, w: number, h: number): [number, number, number, number] | null {
  const [ft, fh] = btnFace(state, h);
  if (!BTN[style].plate || w < 34 || fh < 12) return null;
  return [4, ft + 2, w - 8, fh - 4];
}

function grey(c: C): C { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return lerpC(c, [l, l, l * 1.04], 0.82).map((v) => v * 0.66) as C; }

function paintBtn(style: BtnStyle, state: BtnState, uw: number, uh: number, d: number) {
  const P = BTN[style];
  const R0 = P.ramp.map(hx);
  let R = R0;
  if (state === 'hover') R = R0.map((c, i) => (i > 0 ? lerpC(c, R0[Math.min(6, i + 1)], 0.5) : c));
  if (state === 'down') R = R0.map((c, i) => (i < 6 ? lerpC(c, R0[Math.max(0, i - 1)], 0.45) : lerpC(c, R0[5], 0.5)));
  if (state === 'disabled') R = R0.map(grey);
  const t = new Tx(uw, uh, d);
  const [ft, fh] = btnFace(state, uh);
  const T0 = ft - 1;
  const bh = uh - T0;
  const faceT = ft * d, faceB = (ft + fh) * d, FH = fh * d;
  const plate = btnPlate(style, state, uw, uh);
  const W = t.W, out = hx(P.out);
  const hd2 = Math.max(1, d >> 1);
  for (let y = T0 * d; y < t.H; y++) for (let x = 0; x < W; x++) {
    const ux = Math.floor(x / d), uy = Math.floor(y / d);
    const r = ring(ux, uy - T0, uw, bh);
    if (r < 0) continue;
    if (r === 0) { t.set(x, y, out); continue; }
    if (y >= faceB) {
      // the lip: a seam, then a two-tone dark side
      const ly = y - faceB;
      t.set(x, y, ly === 0 ? R[0] : ly < d ? R[1] : R[0]);
      continue;
    }
    const fy = y - faceT, fx = x - d, fw = W - 2 * d;
    let c: C;
    if (fy === 0) c = R[6];                                                   // the rim highlight
    else if (fy < hd2 + (d >= 3 ? 1 : 0)) c = R[5];
    else if (fx < hd2) c = fx === 0 ? R[5] : R[4];                            // a lit left bevel
    else if (fx >= fw - hd2) c = fx === fw - 1 ? R[1] : R[2];                  // a shaded right bevel
    else if (fy >= FH - hd2) c = fy === FH - 1 ? R[1] : R[2];                  // a shaded bottom bevel
    else {
      // the face: a banded ramp; colour styles get a gloss band over the upper part with a crisp lower edge
      const k = fy / FH;
      c = k < 0.3 ? R[4] : k < 0.78 ? R[3] : lerpC(R[3], R[2], 0.5);
      if (!P.plate && k < 0.45) c = k < 0.12 ? R[5] : lerpC(R[4], R[5], 0.35);
      if (!P.plate && fy === Math.round(FH * 0.45)) c = R[3];
    }
    t.set(x, y, c);
  }
  // the engraved label plate: a recess one tone darker, shadowed top/left, catching light bottom/right
  if (plate) {
    const [px, py, pw, ph] = plate;
    const x0 = px * d, y0 = py * d, x1 = (px + pw) * d - 1, y1 = (py + ph) * d - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let c = lerpC(R[3], R[2], 0.5);
      if (y === y0 || x === x0) c = R[1];
      else if (y === y1 || x === x1) c = R[5];
      else if (d >= 2 && (y === y0 + 1 || x === x0 + 1)) c = R[2];
      t.set(x, y, c);
    }
    // tiny pins at the plate's ends on long buttons
    if (uw >= 70 && d >= 2) for (const sx of [px - 2, px + pw + 1]) { const cx = sx * d + (d >> 1), cy = Math.round((py + ph / 2) * d); t.set(cx, cy - 1, R[6]); t.set(cx, cy, R[1]); }
  }
  // a specular glint in the lit corner
  if (state !== 'disabled' && uw > 10) { const gx = 2 * d, gy = faceT + d; t.set(gx, gy, R[6]); t.set(gx + 1, gy, R[6]); t.set(gx, gy + 1, R[6]); if (d >= 2) t.set(gx + 2, gy, R[5]); }
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

/** a folder tab (open at the bottom): on = lacquered wood with an engraved brass cap, hover / off = darker */
export function tabSkin(state: 'on' | 'hover' | 'off', w: number, h: number, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return cached(`tab|${state}|${w}|${h}|${d}`, () => {
    const t = new Tx(w, h, d);
    const base = state === 'on' ? 4 : state === 'hover' ? 3 : 2;
    for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W; x++) {
      const ux = Math.floor(x / d), uy = Math.floor(y / d);
      const dx = Math.min(ux, w - 1 - ux);
      if (uy === 0 && dx < 2) continue;
      if (uy === 1 && dx === 0) continue;
      if (uy === 0 || dx === 0 || (uy === 1 && dx === 1)) { t.set(x, y, INK); continue; }
      if (state === 'on' && uy <= 2) {
        // a brass cap along the top: a ramp with an engraved line
        t.set(x, y, uy === 1 ? (y === d ? BR[7] : BR[6]) : (y % d === d - 1 ? BR[1] : y % d === 0 ? BR[2] : BR[4])); continue;
      }
      if (dx === 1) { t.set(x, y, x < t.W / 2 ? TW[Math.min(7, base + 2)] : TW[Math.max(0, base - 2)]); continue; }
      // the board: grain lines running along the tab
      let tone = base;
      for (const f of [0.38, 0.7]) { const gy = Math.round(f * t.H + Math.sin(x / (9 * d) + f * 5) * d * 0.6); if (y === gy && ((x + Math.round(f * 40) * d) % (30 * d)) < 22 * d) tone = base - 1; }
      if (uy === 1 && state !== 'on') tone = base + 2;
      t.set(x, y, TW[Math.max(0, Math.min(7, tone))]);
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

/** a checkbox: a recessed cream box (bevel, fibres) with a bold bevelled kelp tick */
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
      const f = fibre(x, y, d);
      t.set(x, y, hover ? (f < 0 ? CR[5] : CR[7]) : f < 0 ? CR[4] : CR[6]);
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
