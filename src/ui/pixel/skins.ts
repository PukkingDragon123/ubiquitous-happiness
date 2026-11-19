// Painted UI skins, v6 "CHUNKY + DETAILED": every panel, button and small widget is painted at ONE texel per UI
// pixel (PixelUI blows it up 2x at 720p, 3x at 1080p with nearest pixels, so it reads as true chunky pixel art) and
// gets its richness from hand-placed detail at that resolution (decor.ts), never from noise, dither or speckle:
//
//   * frames are weathered ship planks: plank seams with lit end grain, wandering grain lines, knots that the grain
//     wraps round, iron nail heads with rust runs, worm holes, flakes of old white paint, salt-bleached top edges, a
//     sea-worn teal trim chipped back to wood, rope lashing round every corner -- and the sea has moved in: barnacle
//     crowns, a limpet, a periwinkle snail, a scallop, coralline crust, algae films (the grain shows through, a
//     golden diatom fringe), a kelp holdfast with a frond growing up the side, sea-grass tufts, a sea-glass pebble
//   * insets: dark water behind glass (light shafts, a glass reflection, a sand floor with pebbles and grass
//     silhouettes); pressed SEAWEED PAPER (nori / kelp paper: long fibres, a pressed frond with its veins, a cast
//     shadow from the frame); wet sand with ripples and shell grit
//   * buttons: sea-worn painted planks (grain through the paint, worn shiny scuffs, chips back to wood, nail heads, a
//     diatom fringe), bare driftwood planks with a carved label plate, or brushed brass with an engraved groove and
//     verdigris
//   * the ANIMATED part (bubbles, swaying kelp and rope ends, caustics, hover splashes, the pop-in water wobble)
//     lives in PixelUI as small pixel-snapped overlays over these cached skins (ui.ts): no skin repaints per frame.
//
// DENSITY: every painter works at 1 texel per UI px. The `d` argument is kept for API compatibility: d > 1 returns
// the same chunky art blown up d x d (draw it at w x h UI px either way).
//
//   skin('wood', 160, 90)                 panel canvas, 160 x 90 px
//   btnSkin('green', 'hover', 64, 22)     button canvas (normal | hover | down | disabled | on)
//   PAD.wood                              content insets [l, t, r, b] (UI px)
//
// Kinds (old names keep working):
//   wood / stone   ship-plank frame (rope-lashed corners, sea growth, teal trim) around dark water behind glass
//   cream          the same frame around a pressed seaweed-paper inset (dark ink text): notes, letters, summaries
//   dark           a rope-trimmed card over dark water (light text): settings, sub-panels, choice rows
//   paper          a seaweed-paper card with a card edge (dark text): tooltips, tags, objectives
//   sail           a seaweed-paper card with a twisted rope edge (dark text): dialogue speech bubbles
//   inset          a recessed dark-water well inside a panel; insetCream: a wet-sand well (dark text)
//   slot           a recessed item slot; slotBlue (dashed blueprint slot), slotTv
//   plaque         a salt-bleached driftwood plank sign (dark ink text); brass: an engraved brass plate
//   blueprint / card / cardSel / tv   unchanged structural looks
import { Px, R, hx, lerpC, hash, up, stamp, SPR, algae, coralline, kelpBlade, bladePath, holdfast, grass, nail, rivet, type C } from './decor';

export type SkinKind = 'wood' | 'stone' | 'blueprint' | 'paper' | 'tv' | 'dark' | 'slot' | 'slotBlue' | 'slotTv' | 'card' | 'cardSel' | 'plaque'
  | 'cream' | 'inset' | 'insetCream' | 'brass' | 'sail';
export type BtnStyle = 'wood' | 'blue' | 'tv' | 'red' | 'green' | 'gold' | 'stone' | 'dark' | 'brass';
export type BtnState = 'normal' | 'hover' | 'down' | 'disabled' | 'on';

export const PAD: Record<SkinKind, [number, number, number, number]> = {
  wood: [9, 9, 9, 9], stone: [9, 9, 9, 9], cream: [10, 10, 10, 10], blueprint: [7, 7, 7, 7], paper: [6, 5, 6, 7], tv: [5, 5, 5, 5],
  dark: [6, 6, 6, 6], slot: [2, 2, 2, 2], slotBlue: [2, 2, 2, 2], slotTv: [2, 2, 2, 2], card: [4, 4, 4, 4], cardSel: [4, 4, 4, 4],
  plaque: [6, 4, 6, 5], brass: [6, 4, 6, 5], inset: [4, 4, 4, 4], insetCream: [4, 4, 4, 4], sail: [7, 7, 7, 7],
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
  /** text on dark water / on seaweed paper */
  text: '#f3e7c9', textDim: '#9fc0bc', textInk: '#2a1a0c', textInkDim: '#6a5638',
  good: '#5fae3f', goodLight: '#8ee06a', bad: '#e0564a', badLight: '#ff8a76', info: '#3d8fd6', infoLight: '#8cc4ff', gold: '#f2c66d',
} as const;

const INK = R.ink;
const WD = R.wood, SALT = R.salt, TP = R.paint, WA = R.water, SA = R.sand, PA = R.paper, LF = R.leaf, BR = R.brass;
const ramp = (...s: string[]) => s.map(hx);

/** UI-px ring index (distance to the nearest edge) with 2 px rounded corners; -1 = outside */
function ring(x: number, y: number, w: number, h: number, r = 2): number {
  const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
  if (r >= 2 && ((dx === 0 && dy < 2) || (dy === 0 && dx < 2))) return -1;
  if (r >= 1 && dx === 0 && dy === 0) return -1;
  if (r >= 2 && dx === 1 && dy === 1) return 0;
  return Math.min(dx, dy);
}

// ------------------------------------------------------------------ insets
/**
 * dark water behind glass into rect (x0, y0, IW, IH): depth bands with stepped wavy borders, tapering light shafts
 * from the surface, a glass reflection, a cast shadow from the frame above / left, and on big ones a sand floor with
 * pebbles and dark grass silhouettes
 */
function paintWater(px: Px, x0: number, y0: number, IW: number, IH: number, o: { big?: boolean; shadow?: number; alpha?: number; inside?: (x: number, y: number) => boolean } = {}) {
  const big = !!o.big, sh = o.shadow ?? 2, A = o.alpha ?? 255;
  const floor = big && IH > 44;
  const crest = (ix: number) => IH - 5 + Math.round(Math.sin(ix / 15) * 1.4 + Math.sin(ix / 6.3 + 1) * 0.6);
  const SW = SA.map((c) => lerpC(c, WA[4], 0.3));
  // the light shafts: [top x (fraction), width, length (fraction), slope]
  const shafts: [number, number, number, number][] = big ? [[0.18, 9, 0.75, 0.42], [0.46, 6, 0.55, 0.42], [0.74, 11, 0.85, 0.42]] : IW > 30 ? [[0.3, Math.max(3, Math.round(IW * 0.12)), 0.8, 0.4]] : [];
  for (let iy = 0; iy < IH; iy++) for (let ix = 0; ix < IW; ix++) {
    const X = x0 + ix, Y = y0 + iy;
    if (o.inside && !o.inside(X, Y)) continue;
    const k = iy / IH, wv = Math.round(Math.sin(ix / 11 + iy * 0.02) * 1.2);
    let t = iy + wv < IH * 0.12 ? 6 : iy + wv < IH * 0.38 ? 5 : iy + wv < IH * 0.7 ? 4 : 3;
    // shafts: tapering diagonal bands of +1, the brightest at their top
    for (const [fx, w, fl, sl] of shafts) {
      const L = Math.min(IH * fl, 46 + fl * 30); if (iy >= L) continue;
      const c = fx * IW + iy * sl, hw = (w / 2) * (1 - iy / L);
      if (Math.abs(ix + 0.5 - c) <= hw) { t += iy < IH * 0.1 && Math.abs(ix + 0.5 - c) < hw * 0.5 ? 2 : 1; break; }
    }
    // the glass: two parallel reflection streaks in the top-left
    if (big || IW > 40) {
      const s = ix + iy, s1 = Math.round(IW * 0.08) + 2;
      if (iy < IH * 0.5 && ix < IW * 0.4 && (s === s1 || s === s1 + 3 || s === s1 + 4)) t = Math.max(t + 2, 7);
    }
    let c: C = WA[Math.min(9, t)];
    if (floor) {
      const cr = crest(ix);
      if (iy >= cr) {
        const dd = iy - cr;
        c = dd === 0 ? SW[5] : dd === 1 ? SW[4] : dd === 2 ? SW[3] : SW[2];
        // ripple marks: a short dark trough with a lit crest beside it
        const rp = (ix + dd * 3 + 64) % 11;
        if (dd >= 2 && rp < 2) c = SW[1]; else if (dd >= 2 && rp === 2) c = SW[4];
      }
    }
    // the frame's cast shadow onto the water (top rows, left columns)
    if (iy < sh || ix < sh) c = lerpC(c, WA[0], iy < sh && ix < sh ? 0.7 : (iy < sh ? (sh - iy) / sh : (sh - ix) / sh) * 0.6);
    px.set(X, Y, c, A);
  }
  if (floor) {
    // pebbles and dark grass silhouettes on the sand
    const peb = (bx: number, w: number) => {
      const by = y0 + crest(bx - x0) - 1;
      for (let i = 0; i < w; i++) { px.set(bx + i, by, i === 0 ? WA[6] : i === w - 1 ? WA[3] : WA[5], A); px.set(bx + i, by + 1, i === w - 1 ? WA[2] : WA[4], A); }
      px.set(bx + 1, by - 1, WA[7], A); px.set(bx + 2, by - 1, WA[6], A);
      px.set(bx + w, by + 1, SW[1], A); px.set(bx + w, by, SW[2], A);
    };
    peb(x0 + Math.round(IW * 0.12), 5); peb(x0 + Math.round(IW * 0.62), 4);
    for (const [fx, n, hgt] of [[0.86, 4, 9], [0.33, 3, 6]] as const) {
      const gx = x0 + Math.round(IW * fx), gy = y0 + crest(gx - x0) - 1;
      for (let b = 0; b < n; b++) for (let i = 0; i < hgt - b * 2; i++) {
        const X = gx + b * 2 + Math.round(Math.sin(i * 0.4 + b) * 0.8 + i * 0.12 * (b - 1));
        px.set(X, gy - i, i < 2 ? WA[1] : WA[2], A);
      }
    }
  }
}

/**
 * pressed seaweed paper into rect (x0, y0, IW, IH): an olive-cream sheet with long wandering fibres (darker and paler
 * strands), short cross fibres, a cast shadow from the frame, and on big sheets a pressed kelp frond with its veins
 */
function paintPaper(px: Px, x0: number, y0: number, IW: number, IH: number, o: { big?: boolean; shadow?: number; base?: number; leaf?: boolean; inside?: (x: number, y: number) => boolean } = {}) {
  const sh = o.shadow ?? 2, base = o.base ?? 5;
  const ok = (X: number, Y: number) => X >= x0 && Y >= y0 && X < x0 + IW && Y < y0 + IH && (!o.inside || o.inside(X, Y));
  for (let iy = 0; iy < IH; iy++) for (let ix = 0; ix < IW; ix++) if (ok(x0 + ix, y0 + iy)) px.set(x0 + ix, y0 + iy, PA[base]);
  // fibres: long strands lying mostly one way (the way the sheet was laid), wavering a pixel, broken on an uneven
  // rhythm, a few tinted green; a sparse lattice of short crossing fibres binds them
  for (let j = 0, y = 2 + Math.round(hash(base, 1) * 3); y < IH - 1; j++, y += 5 + Math.round(hash(j, 77) * 3)) {
    let x = Math.round(hash(j, 3) * 24) - 14;
    const ph = hash(j, 9) * 20, per = 8 + hash(j, 11) * 6;
    while (x < IW) {
      const L = 9 + Math.round(hash(j, x + 40) * 24), gap = 6 + Math.round(hash(x + 7, j) * 14);
      const c: C = hash(j * 7 + 1, x + 3) > 0.84 ? lerpC(PA[base], LF[2], 0.55) : PA[base - 1];
      for (let i = 0; i < L; i++) {
        const X = x0 + x + i, Y = y0 + y + Math.round(Math.sin((x + i + ph) / per) * 1.1);
        if (ok(X, Y)) px.set(X, Y, c);
      }
      x += L + gap;
    }
  }
  for (let j = 0, y = 4; y < IH - 4; j++, y += 9) for (let i = 0, x = 5 + (j % 2) * 8; x < IW - 4; i++, x += 16) {
    if (hash(i + 13, j + 29) > 0.4) continue;
    const dir = hash(i, j + 3) > 0.5 ? 1 : -1;
    for (let q = 0; q < 3; q++) { const X = x0 + x + q, Y = y0 + y + (q === 2 ? dir : 0) + (q === 0 ? -dir : 0); if (ok(X, Y)) px.set(X, Y, PA[base - 1]); }
  }
  // flecks of seaweed pressed into the sheet: little green-brown bits on a sparse lattice
  for (let j = 0, y = 5; y < IH - 3; j++, y += 11) for (let i = 0, x = 9 + (j % 2) * 12; x < IW - 3; i++, x += 25) {
    if (hash(i + 40, j + 40) > 0.7) continue;
    const X = x0 + x + Math.round(hash(i, j + 7) * 6), Y = y0 + y + Math.round(hash(i + 7, j) * 4);
    const dk = lerpC(PA[base], LF[0], 0.55), md = lerpC(PA[base], LF[2], 0.6);
    for (const [dx, dy, c] of [[0, 0, dk], [1, 0, md], [1, -1, md], [2, -1, dk]] as [number, number, C][]) if (ok(X + dx, Y + dy) && (dx < 2 || hash(i, j) > 0.4)) px.set(X + dx, Y + dy, c);
  }
  // a pressed kelp frond in the lower-right corner: translucent green, ruffled margin, midrib and side veins
  if (o.leaf && IW > 90 && IH > 40) pressedFrond(px, x0 + IW - 26, y0 + IH - 12, 34, -0.42, 11, ok);
  // the frame's cast shadow
  for (let iy = 0; iy < IH; iy++) for (let ix = 0; ix < IW; ix++) {
    if (!ok(x0 + ix, y0 + iy) || (iy >= sh && ix >= sh)) continue;
    px.set(x0 + ix, y0 + iy, iy < sh && ix < sh ? PA[2] : PA[Math.min(base, 2 + Math.min(iy, ix) + 1)]);
  }
}

/** a pressed kelp frond (len px along `ang`, `wd` px wide at the middle), drawn as tints over the paper */
function pressedFrond(px: Px, cx: number, cy: number, len: number, ang: number, wd: number, ok: (x: number, y: number) => boolean) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const inLeaf = (x: number, y: number) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (dx * ca + dy * sa) / (len / 2), v = -dx * sa + dy * ca;
    if (Math.abs(u) > 1) return null;
    const hw = (wd / 2) * Math.sqrt(1 - u * u) * (1 + 0.16 * Math.sin(u * 11)) * (u > 0 ? 1 - u * 0.35 : 1);
    return Math.abs(v) <= hw ? { u, v, hw } : null;
  };
  const R0 = Math.ceil(len / 2 + wd);
  for (let y = Math.floor(cy - R0); y <= cy + R0; y++) for (let x = Math.floor(cx - R0); x <= cx + R0; x++) {
    if (!ok(x, y)) continue;
    const L = inLeaf(x, y); if (!L) continue;
    const edge = !inLeaf(x + 1, y) || !inLeaf(x - 1, y) || !inLeaf(x, y + 1) || !inLeaf(x, y - 1);
    let c: C = lerpC(px.get(x, y), LF[3], 0.62);
    if (edge) c = lerpC(px.get(x, y), LF[1], 0.7);
    else if (Math.abs(L.v) < 0.6) c = lerpC(px.get(x, y), LF[0], 0.62);                            // the midrib
    else { const s = (L.u * len / 2) * 1.0 - Math.abs(L.v) * 1.3; if (Math.abs(((s % 4) + 4) % 4 - 2) < 0.5) c = lerpC(px.get(x, y), LF[1], 0.6); } // side veins
    px.set(x, y, c);
  }
  // the stipe: a short stem off the narrow end
  for (let i = 0; i < 6; i++) { const X = Math.round(cx - ca * (len / 2 + i)), Y = Math.round(cy - sa * (len / 2 + i) + (i > 3 ? 1 : 0)); if (ok(X, Y)) px.mix(X, Y, LF[0], 0.55); }
}

// ------------------------------------------------------------------ the plank frame
/** the ship-plank frame (F UI px thick) with rope-lashed corners and sea growth, around an inset */
function paintFrame(uw: number, uh: number, inset: 'water' | 'paper') {
  const px = new Px(uw, uh);
  const big = uw >= 60 && uh >= 44, huge = uw >= 110 && uh >= 70;
  const F = big ? 7 : 5;
  const BW = F - 4;                     // board body rows (3 big, 1 small)
  const TR = F - 2;                     // the teal trim ring
  // per side: plank seams, salt-bleached spans, paint flakes, a worm-hole row
  const sides = [0, 1, 2, 3].map((side) => {
    const len = side % 2 === 0 ? uw : uh;
    const seams: number[] = [];
    let a = F + 16 + Math.round(hash(side, 99) * 22), k = 0;
    while (a < len - F - 12) { seams.push(a); a += 36 + Math.round(hash(side, k++) * 28); }
    const plankOf = (along: number) => { let p = 0; for (const s of seams) if (along > s) p++; return p; };
    const salt: [number, number][] = big && side === 0 ? [[0.33, 0.1], [0.6, 0.08]] : big && side === 3 ? [[0.42, 0.12]] : [];
    const flakes: [number, number][] = huge ? (side === 0 ? [[Math.round(len * 0.82), 6]] : side === 1 ? [[Math.round(len * 0.42), 6]] : side === 3 ? [[Math.round(len * 0.34), 5]] : []) : [];
    const worm = huge && (side === 2 || side === 1) ? Math.round(len * (side === 2 ? 0.76 : 0.24)) : -99;
    return { len, seams, plankOf, salt, flakes, worm };
  });
  // knots: one on most long planks
  const knotAt = (side: number, plank: number, s0: number, s1: number) => (s1 - s0 > 30 && hash(side * 13 + plank, 5) > 0.3 ? Math.round(s0 + 8 + hash(side, plank + 50) * (s1 - s0 - 16)) : -99);
  const knots = sides.map((S, side) => { const b = [F, ...S.seams, S.len - F]; return b.slice(0, -1).map((s0, i) => knotAt(side, i, s0, b[i + 1])); });
  // the knot pattern on a 3-row board (rows c 0..2, along da -2..3): tone offsets from base ('.' unchanged; numbers absolute)
  const KN: (string | number)[][] = [
    ['.', -1, 2, 2, -1, '.'],
    [-2, 2, 0, 1, 2, '+2'],
    ['.', -1, 3, 3, '+2', '.'],
  ];
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const r = ring(x, y, uw, uh);
    if (r < 0) continue;
    if (r === 0) { px.set(x, y, INK); continue; }
    if (r >= F) continue;   // the inset, painted below
    const dl = x, dt = y, dr = uw - 1 - x, db = uh - 1 - y;
    const cx = Math.min(dl, dr), cy = Math.min(dt, db);
    // horizontal boards win the corners; the mitre is the diagonal
    const horiz = cy <= cx;
    const side = horiz ? (dt <= db ? 0 : 2) : (dl <= dr ? 3 : 1);
    const lit = side === 0 || side === 3;
    const S = sides[side];
    const along = horiz ? x : y;
    const bleach = S.salt.some(([f, w]) => Math.abs(along / S.len - f) < w / 2);
    if (r === 1) {
      // the outer lip: warm light on the top / left, dark bottom / right, bone where salt bleached it
      const seam = S.seams.includes(along);
      px.set(x, y, lit ? (seam ? WD[3] : bleach ? SALT[6] : WD[7]) : seam ? WD[0] : WD[2]);
      continue;
    }
    if (r === F - 1) { px.set(x, y, INK); continue; }
    if (r === TR) {
      // the sea-worn teal trim, chipped back to wood here and there
      const chip = ((along + side * 37) % 53) < 3 && big;
      const chipEdge = ((along + side * 37) % 53) === 3 && big;
      px.set(x, y, chip ? WD[lit ? 3 : 5] : chipEdge ? TP[1] : lit ? TP[2] : TP[4]);
      continue;
    }
    // the board body: c = 0..BW-1 across (from the outside in)
    const c = r - 2;
    if (cx < F && cy < F && (cx === cy || cx === cy + 1)) { px.set(x, y, cx === cy ? WD[1] : WD[6]); continue; }  // mitre
    const plank = S.plankOf(along);
    const off = [0, 1, -1, 0, 1, 0, -1][(plank * 3 + side * 2) % 7];
    // a rounded beam: the row nearest the light is a tone up, the far row a tone down
    const across = BW >= 3 ? (lit ? 1 - c : c - 1) : 0;
    const base = (lit ? 5 : 4) + off + across;
    let t: number = base;
    // grain: two lines per plank wandering across the rows, broken on a rhythm, a lit lip under each now and then
    if (BW >= 3) {
      for (let g = 0; g < 2; g++) {
        const row = Math.max(0, Math.min(2, Math.round(1 + Math.sin(along / (8 + g * 3) + g * 2.4 + side + plank * 1.7) * 1.25 + (g ? 0.4 : -0.4))));
        const on = ((along * 5 + g * 13 + plank * 7 + side * 3) % 23) < 16;
        if (on && c === row) t = base - 2;
        else if (on && c === row + 1 && ((along + g * 5) % 11) < 4) t = base + 1;
      }
    } else if (((along + side * 5) % 13) < 7) t = base - 1;
    // knots (the grain wraps round them)
    const ka = knots[side][plank] ?? -99, da = along - ka;
    if (BW >= 3 && da >= -2 && da <= 3) {
      const v = KN[c][da + 2];
      if (v !== '.') t = typeof v === 'string' ? base + Number(v) : v < 0 ? base + v : v;
    }
    // worm holes: a short wandering row of three pin holes, each with a lit lower lip
    if (S.worm > 0 && BW >= 3) {
      for (const [ha, hc] of [[0, 1], [2, 0], [4, 1]] as const) {
        if (along === S.worm + ha && c === hc) t = 0;
        else if (along === S.worm + ha && c === hc + 1) t = 7;
      }
    }
    // plank seams: a dark joint, then the next plank's lit end grain
    if (S.seams.includes(along)) t = 1; else if (S.seams.includes(along - 1)) t = 7;
    let col: C = bleach && c === 0 ? SALT[Math.max(1, Math.min(6, t - 1))] : WD[Math.max(0, Math.min(8, t))];
    // flakes of old white paint, a dark lip where the paint stands proud of the wood
    for (const [fa, fl] of S.flakes) {
      const u = along - fa;
      if (u < 0 || u > fl) continue;
      const c0 = u === 0 || u === fl - 1 ? 1 : 0, c1 = u === 0 || u === fl - 1 ? 1 : 2;
      if (u < fl && c >= c0 && c <= c1) col = R.chalk[c === c0 ? (u === 1 ? 4 : 3) : c === c1 ? 2 : (u % 3 === 1 ? 1 : 3)];
      else if (u === fl && c >= 1) col = WD[Math.max(0, base - 2)];
    }
    px.set(x, y, col);
  }
  // ---- the inset
  const IX = F, IY = F, IW = uw - 2 * F, IH = uh - 2 * F;
  const insideInset = (X: number, Y: number) => ring(X, Y, uw, uh) >= F;
  if (inset === 'paper') paintPaper(px, IX, IY, IW, IH, { big, leaf: huge, inside: insideInset });
  else paintWater(px, IX, IY, IW, IH, { big, inside: insideInset });
  // ---- nails at the board ends and beside the seams, with rust runs
  if (big) {
    const mid = 2;
    for (const side of [0, 1, 2, 3]) {
      const S = sides[side], spots = [F + 3, S.len - F - 5, ...S.seams.filter((_, i) => i % 2 === 0).map((s) => s + 2), ...S.seams.filter((_, i) => i % 2 === 1).map((s) => s - 3)];
      for (const a of spots) {
        if (side === 0) nail(px, a, mid, 1);
        else if (side === 2) nail(px, a, uh - 1 - mid - 2, 1);
        else if (side === 3) nail(px, mid, a, 2);
        else nail(px, uw - 1 - mid - 2, a, 2);
      }
    }
  }
  // ---- rope lashing round every corner: three coils across the mitre, twisted strands, dark gaps
  lashing(px, uw, uh, F);
  // ---- the sea has moved in
  if (big) {
    const onFrame = (X: number, Y: number) => { const r = ring(X, Y, uw, uh); return r >= 1 && r < F - 1; };
    // algae films creeping along the bottom board and onto the glass edge (the grain shows through, a diatom fringe)
    const nearFrame = (X: number, Y: number) => { const r = ring(X, Y, uw, uh); return r >= 1 && r <= F + 1; };
    algae(px, uw * 0.4, uh - 4, 7, 2.6, 2.1, { inside: nearFrame });
    algae(px, uw * 0.5, uh - 5, 5, 2.4, 5.3, { inside: nearFrame });
    if (huge) {
      algae(px, uw * 0.84, uh - 4, 6, 2.4, 1.2, { inside: nearFrame });
      algae(px, uw - 4, uh * 0.72, 2.6, 7, 4.2, { inside: nearFrame, brown: true });
      algae(px, 4, uh * 0.3, 2.6, 5, 0.7, { inside: nearFrame, brown: true });
    }
    // barnacles at the top-left, past the lashing; a limpet on the bottom board toward the right
    stamp(px, SPR.barnacleL, F + 12, 1, { onlyOn: true });
    stamp(px, SPR.barnacleM, F + 17, 2, { onlyOn: true });
    stamp(px, SPR.barnacleS, F + 10, 3, { onlyOn: true });
    stamp(px, SPR.barnacleM, 2, F + 13, { onlyOn: true });
    stamp(px, SPR.barnacleS, 3, F + 17, { onlyOn: true });
    stamp(px, SPR.limpet, uw - F - 18, uh - 5, { onlyOn: true });
    if (huge) {
      // coralline crust over the bottom-left lashing, a scallop, a snail on its way, sea grass, a sea-glass pebble
      coralline(px, F + 9, uh - 4, 5, 2.2, 3, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 });
      coralline(px, uw - 4, uh - F - 12, 2.2, 4, 8, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 });
      stamp(px, SPR.star, Math.round(uw * 0.22), uh - 7, { onlyOn: true });
      stamp(px, SPR.snail, Math.round(uw * 0.66), uh - 6, { onlyOn: true });
      grass(px, Math.round(uw * 0.33), uh - 3, 3, 5, 6, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 });
      grass(px, uw - F - 4, uh - 3, 2, 8, 5, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 });
      stamp(px, SPR.glass, Math.round(uw * 0.7), 1, { onlyOn: true });
      // a kelp holdfast clamped to the left board low down, its frond growing up the side
      const hy = uh - F - 7;
      kelpBlade(px, bladePath(3, hy - 1, 0, -1, Math.min(34, Math.round(uh * 0.42)), 1.3, 0.6), 3, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 });
      kelpBlade(px, bladePath(5, hy - 1, 0.35, -1, 12, 0.8, 2.2), 2, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 });
      holdfast(px, 3, hy, 1, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 });
    }
  }
  return px.done();
}

/**
 * rope bindings beside every corner: the beams are lashed together near each mitre with three wraps of rope across
 * the beam (each wrap 2 px: a lit side and a shaded side, leaning a pixel as it goes round; a dark gap between wraps;
 * the wraps bulge a pixel past the beam's edges)
 */
function lashing(px: Px, uw: number, uh: number, F: number) {
  const P = R.rope;
  const n = 3, a0 = F + 1;
  const wrap = (horiz: boolean, at: number, outer: number, dir: 1 | -1, dim: number) => {
    // `at`: where the binding starts along the beam; `outer`: the beam's outer edge coordinate; dir: inward
    for (let i = 0; i < n; i++) for (let j = -1; j <= F - 1; j++) {
      const lean = j >> 1;
      for (let k = 0; k < 3; k++) {
        const along = at + i * 3 + k + lean, across = outer + dir * j;
        const x = horiz ? along : across, y = horiz ? across : along;
        if (j === -1 || j === F - 1) { if (k < 2 && px.in(x, y)) px.set(x, y, P[k === 0 ? 2 : 1]); continue; }  // the bulge past the edges
        if (j === F - 2 && k === 2) continue;
        const t = k === 2 ? 0 : k === 0 ? (j <= 1 ? 6 : j <= 3 ? 5 : 4) : (j <= 1 ? 4 : j <= 3 ? 3 : 2);
        px.set(x, y, P[Math.max(0, t - dim)]);
      }
    }
  };
  // top-left corner: along the top beam and down the left beam; the others mirrored (shaded sides one tone down)
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const dim = cx + cy > 1 ? 1 : 0;
    const hx0 = cx ? uw - 1 - a0 - n * 3 + 1 : a0, vy0 = cy ? uh - 1 - a0 - n * 3 + 1 : a0;
    wrap(true, hx0, cy ? uh - 1 : 0, cy ? -1 : 1, dim + (cy ? 1 : 0));
    wrap(false, vy0, cx ? uw - 1 : 0, cx ? -1 : 1, dim + (cx ? 1 : 0));
  }
}

// ------------------------------------------------------------------ rope cards (dark / sail)
/** a rope-trimmed card: ink, a 3 px twisted rope, ink, then dark water (or seaweed paper: the speech bubble) */
function paintRopeCard(uw: number, uh: number, inset: 'water' | 'paper') {
  const px = new Px(uw, uh);
  const P = R.rope;
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const r = ring(x, y, uw, uh);
    if (r < 0) continue;
    if (r === 0 || r === 4) { px.set(x, y, INK); continue; }
    if (r <= 3) {
      // twisted strands slanting along the rope; lit on its outer side at the top / left
      const dx = Math.min(x, uw - 1 - x), dy = Math.min(y, uh - 1 - y);
      const horiz = dy <= dx;
      const along = horiz ? x : y, c = r - 1;            // 0 outer .. 2 inner
      const top = horiz ? y < uh / 2 : x < uw / 2;
      const ph = (along + (top ? c : 2 - c)) % 4;
      const strandEdge = ph === 3;
      let t = c === 0 ? 5 : c === 1 ? 4 : 2;
      if (!top) t = c === 0 ? 3 : c === 1 ? 3 : 2;
      if (strandEdge) t = 1; else if (ph === 0 && c !== 2) t += 1;
      px.set(x, y, P[Math.max(0, Math.min(6, t))]);
      continue;
    }
  }
  const IX = 5, IY = 5, IW = uw - 10, IH = uh - 10;
  const inside = (X: number, Y: number) => ring(X, Y, uw, uh) >= 5;
  if (inset === 'paper') paintPaper(px, IX, IY, IW, IH, { shadow: 1, base: 6, inside, leaf: uw > 140 && uh > 50 });
  else paintWater(px, IX, IY, IW, IH, { big: uw > 70 && uh > 50, shadow: 1, alpha: 248, inside });
  // a knot of rope at each corner
  if (uw > 30 && uh > 20) for (const [kx, ky] of [[0, 0], [uw - 6, 0], [0, uh - 6], [uw - 6, uh - 6]]) stamp(px, SPR.knot, kx, ky);
  // a little sea life on the bigger cards
  if (uw > 110 && uh > 56) {
    stamp(px, SPR.barnacleM, uw - 15, uh - 5, { onlyOn: true });
    stamp(px, SPR.barnacleS, uw - 19, uh - 4, { onlyOn: true });
    coralline(px, 13, uh - 3, 4, 1.6, 11, { inside: (X, Y) => ring(X, Y, uw, uh) >= 1 && ring(X, Y, uw, uh) <= 4 });
  }
  return px.done();
}

// ------------------------------------------------------------------ the seaweed-paper card
/** a seaweed-paper card: ink outline, a lit top edge, fibres, a 2 px card edge, a pressed sprig on big cards */
function paintCard(uw: number, uh: number) {
  const px = new Px(uw, uh);
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const r = ring(x, y, uw, uh);
    if (r < 0) continue;
    if (r === 0) { px.set(x, y, INK); continue; }
    const by = uh - 1 - y;
    if (by === 1) { px.set(x, y, x === 1 ? PA[2] : PA[1]); continue; }       // the card's thickness
    if (by === 2) { px.set(x, y, x === 1 ? PA[4] : PA[3]); continue; }
  }
  const inside = (X: number, Y: number) => ring(X, Y, uw, uh) >= 1 && Y < uh - 3;
  paintPaper(px, 1, 1, uw - 2, uh - 4, { shadow: 0, base: 6, inside });
  // lit top edge and left edge, a darker right edge (the sheet curls a touch)
  for (let x = 2; x < uw - 2; x++) px.set(x, 1, PA[7]);
  for (let y = 2; y < uh - 3; y++) { px.set(1, y, PA[7]); px.set(uw - 2, y, PA[4]); }
  // deckled bottom edge: a few torn notches in the card's edge
  for (let x = 5; x < uw - 5; x += 7 + (x % 5)) { px.set(x, uh - 2, INK); px.set(x + 1, uh - 3, PA[2]); }
  // a small pressed frond tucked in the lower-right corner of the bigger cards
  if (uw >= 90 && uh >= 40) pressedFrond(px, uw - 12, uh - 9, 15, -0.55, 5, inside);
  return px.done();
}

/** a recessed well: dark water (light text) or wet sand with ripples and shell grit (dark text) */
function paintInset(uw: number, uh: number, sand: boolean) {
  const px = new Px(uw, uh);
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const r = ring(x, y, uw, uh, 1);
    if (r < 0) continue;
    const tl = y === 0 || x === 0;
    if (r === 0) { px.set(x, y, tl ? (sand ? SA[0] : INK) : sand ? SA[6] : WA[7]); continue; }
    if (!sand) continue;
    // ripples: wavy crests (a lit line, then a shadow line) at a steady spacing; darker wet sand under the rim
    const w = Math.round(Math.sin(x / 7) * 0.9 + Math.sin(x / 2.9 + 2) * 0.3);
    const p = (y + w + 64) % 5;
    let c: C = p === 0 ? SA[2] : p === 1 ? SA[5] : SA[4];
    if (y === 1 || x === 1) c = SA[1]; else if (y === 2 || x === 2) c = lerpC(c, SA[2], 0.6);
    px.set(x, y, c);
  }
  if (!sand) paintWater(px, 1, 1, uw - 2, uh - 2, { shadow: uh > 10 ? 2 : 1, alpha: 240, big: uw > 120 && uh > 60, inside: (X, Y) => ring(X, Y, uw, uh, 1) >= 1 });
  else if (uw > 40 && uh > 14) {
    // shell grit: a pink fragment, a pale one, a dark pebble
    const grit = (gx: number, gy: number, c1: C, c2: C) => { px.set(gx, gy, c1); px.set(gx + 1, gy, c2); px.shade(gx + 1, gy + 1, 0.7); px.shade(gx + 2, gy + 1, 0.75); };
    grit(Math.round(uw * 0.82), uh - 4, R.shell[4], R.shell[2]);
    grit(Math.round(uw * 0.12), uh - 3, SA[6], SA[3]);
    grit(Math.round(uw * 0.55), uh - 4, R.barn[3], R.barn[1]);
  }
  return px.done();
}

/** an item slot: a wooden rim (shadowed top / left, lit bottom / right), dark water, a glass glint, a sand floor */
function paintSlot(uw: number, uh: number, kind: 'slot' | 'slotBlue' | 'slotTv') {
  const px = new Px(uw, uh);
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const dm = Math.min(x, y, uw - 1 - x, uh - 1 - y);
    if (kind === 'slotBlue') { if (dm === 0) { if (((x + y) >> 1) & 1) px.set(x, y, hx('#e6f3ff')); continue; } px.set(x, y, hx('#0b2a5c'), 150); continue; }
    if (kind === 'slotTv') { if (dm === 0) { px.set(x, y, hx('#2a9ad0')); continue; } px.set(x, y, hx('#040c30'), 235); continue; }
    const r = ring(x, y, uw, uh, uw > 12 ? 2 : 1);
    if (r < 0) continue;
    if (r === 0) { px.set(x, y, INK); continue; }
    if (r === 1) {
      const tl = y === 1 || x === 1;
      const g = ((x + y * 3) % 9) < 2;
      px.set(x, y, tl ? (g ? WD[0] : WD[1]) : g ? WD[4] : (y === uh - 2 && x === uw - 2 ? WD[7] : WD[6]));
      continue;
    }
    const fy = y - 2, fh = uh - 4;
    let c: C = fy < fh * 0.42 ? WA[5] : WA[4];
    if (y === 2 || x === 2) c = WA[1];
    else if (y === 3 || x === 3) c = lerpC(c, WA[1], 0.45);
    if (uw >= 16 && x - 2 + y - 2 === 6 && y < uh * 0.6) c = WA[7];
    if (uw >= 16 && x - 2 + y - 2 === 8 && y < uh * 0.5) c = WA[6];
    if (uh >= 20 && y >= uh - 4) {
      const cr = uh - 4 + (Math.sin(x * 0.9) > 0.3 ? 1 : 0);
      if (y === cr) c = SA[3]; else if (y > cr) c = SA[2];
    }
    px.set(x, y, c, 246);
  }
  return px.done();
}

/** a salt-bleached driftwood plank sign: grain, a knot, split ends, nails with rust runs, an algae fringe below */
function paintPlaque(uw: number, uh: number) {
  const px = new Px(uw, uh);
  const S = SALT;
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const r = ring(x, y, uw, uh);
    if (r < 0) continue;
    if (r === 0) { px.set(x, y, INK); continue; }
    const by = uh - 1 - y;
    let t = 4;
    if (y === 1) t = 6; else if (x === 1) t = 5; else if (x === uw - 2) t = 2;
    else if (by === 1) { px.set(x, y, lerpC(S[2], WD[4], 0.4)); continue; }
    else if (by === 2) t = 3;
    else {
      // three grain lines wandering along the plank, broken, a lit lip under each in places
      for (let i = 0; i < 3; i++) {
        const gy = Math.round(uh * (0.3 + i * 0.2) + Math.sin(x / 9 + i * 2) * 0.8);
        const on = ((x + i * 19) % 31) < 22;
        if (on && y === gy) t = 2; else if (on && y === gy + 1 && ((x + i * 7) % 13) < 5) t = 5;
      }
      // a knot two thirds along
      const kx = Math.round(uw * 0.7), ky = Math.round(uh * 0.55);
      if (uw > 40) { const e = ((x - kx) / 2.2) ** 2 + ((y - ky) / 1.1) ** 2; if (e < 0.5) t = 0; else if (e < 1.4) t = 1; else if (e < 2.2 && x > kx) t = 6; }
    }
    px.set(x, y, S[t]);
  }
  // split ends: a crack running in from each end
  const cy = Math.round(uh * 0.45);
  for (let i = 1; i < 5; i++) { px.set(i, cy + (i > 2 ? 1 : 0), S[0]); px.set(uw - 1 - i, cy - 1 + (i > 3 ? 1 : 0), S[0]); }
  // an algae fringe along the lower edge (just under the text)
  if (uw > 30) for (let x = Math.round(uw * 0.18); x < uw * 0.5; x++) {
    const h = ((x * 7) % 5) < 2 ? 2 : 1;
    for (let j = 0; j < h; j++) px.set(x, uh - 2 - j, j === 0 ? R.algae[3] : R.algae[4]);
  }
  if (uw > 24 && uh >= 10) { const ny = Math.round(uh / 2) - 2; nail(px, 3, ny, 2); nail(px, uw - 5, ny, 2); }
  if (uw > 70) stamp(px, SPR.barnacleS, uw - 12, uh - 5, { onlyOn: true });
  return px.done();
}

/** an engraved brass plate: a bevel, an engraved groove, a polished band, verdigris in the recesses, rivets */
function paintBrassPlate(uw: number, uh: number) {
  const px = new Px(uw, uh);
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const r = ring(x, y, uw, uh);
    if (r < 0) continue;
    if (r === 0) { px.set(x, y, INK); continue; }
    const tl = y === 1 || x === 1;
    if (r === 1) { px.set(x, y, tl ? (y === 1 && x < uw * 0.4 ? BR[7] : BR[6]) : BR[2]); continue; }
    let t = y < uh * 0.38 ? 5 : y < uh * 0.75 ? 4 : 3;
    if (y === 2 || y === 3) t = 6;
    if (uh >= 14 && r === 2) t = (y === 2 || x === 2) ? 2 : 6;        // the engraved groove: a dark line, a lit line
    px.set(x, y, BR[t]);
  }
  if (uh >= 14) for (const [vx, vy] of [[2, 2], [uw - 3, 2], [2, uh - 3], [uw - 3, uh - 3]]) { px.set(vx, vy, R.verd[1]); px.set(vx + (vx < 4 ? 1 : -1), vy, R.verd[2]); }
  if (uw > 24 && uh >= 10) { const ry = Math.round(uh / 2) - 1; rivet(px, 3, ry); rivet(px, uw - 6, ry); }
  return px.done();
}

const BP = { edge: hx('#0b2a5c'), paper: hx('#1d4f94'), grid: hx('#2a5fa6'), grid2: hx('#3a74bc'), line: hx('#e6f3ff') };
function paintBlueprint(uw: number, uh: number, card = false, sel = false) {
  const px = new Px(uw, uh);
  const edge = sel ? hx('#ffe9a0') : BP.edge, line = sel ? hx('#fff2c0') : BP.line;
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    if ((x === 0 || x === uw - 1) && (y === 0 || y === uh - 1)) continue;
    const dm = Math.min(x, y, uw - 1 - x, uh - 1 - y);
    if (dm === 0) { px.set(x, y, edge); continue; }
    let c = BP.paper;
    const gx = (x - 3) % 8, gy = (y - 3) % 8;
    if (gx === 0 || gy === 0) c = ((x - 3) % 32 === 0 || (y - 3) % 32 === 0) ? BP.grid2 : BP.grid;
    if (card ? dm === 2 : dm === 3) c = line;
    if (!card && dm === 5) c = BP.grid2;
    px.set(x, y, c);
  }
  if (!card) for (const [cx, cy] of [[8, 8], [uw - 9, 8], [8, uh - 9], [uw - 9, uh - 9]]) { for (let k = -2; k <= 2; k++) { px.set(cx + k, cy, BP.line); px.set(cx, cy + k, BP.line); } }
  return px.done();
}

function paintTv(uw: number, uh: number) {
  const px = new Px(uw, uh);
  const fill = hx('#0b1a66'), cyan = hx('#3ad8ff'), deep = hx('#020818');
  for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const dm = Math.min(x, y, uw - 1 - x, uh - 1 - y);
    const cn = Math.min(x, uw - 1 - x) + Math.min(y, uh - 1 - y);
    if (cn < 2) continue;
    if (dm === 0 || cn === 2) { px.set(x, y, deep); continue; }
    if (dm === 1 || cn === 3) { px.set(x, y, cyan); continue; }
    if (dm === 2) { px.set(x, y, deep); continue; }
    px.set(x, y, fill, 240);
  }
  return px.done();
}

// ------------------------------------------------------------------ cache
const cache = new Map<string, HTMLCanvasElement>();
let cacheTexels = 0;
/** painted canvases, LRU, within a texel budget */
function cached(key: string, fn: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (c) { cache.delete(key); cache.set(key, c); return c; }
  c = fn(); cache.set(key, c); cacheTexels += c.width * c.height;
  while ((cacheTexels > 16e6 || cache.size > 1200) && cache.size > 1) {
    const first = cache.keys().next().value as string;
    const old = cache.get(first)!; cache.delete(first); cacheTexels -= old.width * old.height;
  }
  return c;
}
const clampD = (d: number) => Math.max(1, Math.min(6, Math.round(d)));
/** the 1x painting, blown up for a caller that asked for density d */
function at(key: string, d: number, paint: () => HTMLCanvasElement) {
  const base = cached(key + '|1', paint);
  return d <= 1 ? base : cached(key + '|' + d, () => up(base, d));
}

/** a panel of the given kind at exactly w x h UI px (1 texel per UI px; d > 1 returns it blown up d x d) */
export function skin(kind: SkinKind, w: number, h: number, d = 1): HTMLCanvasElement {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h)); d = clampD(d);
  return at(`${kind}|${w}|${h}`, d, () => {
    switch (kind) {
      case 'wood': case 'stone': return paintFrame(w, h, 'water');
      case 'cream': return paintFrame(w, h, 'paper');
      case 'blueprint': return paintBlueprint(w, h);
      case 'card': return paintBlueprint(w, h, true);
      case 'cardSel': return paintBlueprint(w, h, true, true);
      case 'paper': return paintCard(w, h);
      case 'tv': return paintTv(w, h);
      case 'dark': return paintRopeCard(w, h, 'water');
      case 'sail': return paintRopeCard(w, h, 'paper');
      case 'plaque': return paintPlaque(w, h);
      case 'brass': return paintBrassPlate(w, h);
      case 'inset': return paintInset(w, h, false);
      case 'insetCream': return paintInset(w, h, true);
      default: return paintSlot(w, h, kind);
    }
  });
}

// ------------------------------------------------------------------ buttons
/**
 * Button palette. `text`/`textSh` are the label colour and its outline (or, on brass, its light emboss).
 * Green = go / confirm, red = close / danger, wood = neutral (a plank), brass / gold = ship's fittings, dark =
 * secondary (teal-painted plank), blue = info. `ramp` is the face's 7-tone hue-shifted ramp (dark -> light).
 * `mat`: 'paint' = sea-worn paint over wood (grain through the paint, chips back to wood), 'wood' = a bare plank with
 * nail heads, 'brass' = brushed metal. `plate` styles get a carved / engraved label plate.
 */
interface BtnPal { face: string; hi: string; lo: string; lip: string; out: string; text: string; textSh: string; ramp: string[]; plate: boolean; mat: 'paint' | 'wood' | 'brass' }
const BRASS_RAMP = ['#4a240e', '#7a4416', '#a86a24', '#cc9236', '#e8b850', '#f8d880', '#fff4c8'];
export const BTN: Record<BtnStyle, BtnPal> = {
  wood: { face: '#a86e3e', hi: '#dcae74', lo: '#6b3c24', lip: '#33191a', out: KIT.ink, text: '#fff4dc', textSh: '#2a140c', ramp: ['#2e1a1c', '#48291f', '#653b27', '#845230', '#a26b3e', '#bd8751', '#dcae74'], plate: true, mat: 'wood' },
  brass: { face: '#c8913a', hi: '#f2c66d', lo: '#9e6a2a', lip: '#5a2e16', out: KIT.ink, text: '#2a1606', textSh: '#f8dc8a', ramp: BRASS_RAMP, plate: true, mat: 'brass' },
  gold: { face: '#f2c66d', hi: '#fff1c2', lo: '#c8913a', lip: '#7a4a1a', out: KIT.ink, text: '#2a1606', textSh: '#fff6d6', ramp: ['#6a3a12', '#a06a22', '#d0a03c', '#e8bc58', '#f6d47e', '#ffe9ac', '#fffae6'], plate: true, mat: 'brass' },
  green: { face: '#5fae3f', hi: '#a6e07a', lo: '#3f8a2a', lip: '#173a2a', out: KIT.ink, text: '#ffffff', textSh: '#123a14', ramp: ['#14301e', '#225a30', '#367e32', '#55a23c', '#7ec04c', '#addc6c', '#dcf2a0'], plate: false, mat: 'paint' },
  red: { face: '#e0564a', hi: '#ff9a84', lo: '#b03a30', lip: '#4a1226', out: KIT.ink, text: '#ffffff', textSh: '#4a0e12', ramp: ['#3e0e20', '#721a2a', '#a8302e', '#d44c42', '#ec7058', '#fc9c78', '#ffcca4'], plate: false, mat: 'paint' },
  blue: { face: '#3d8fd6', hi: '#9fd0ff', lo: '#2a6aaa', lip: '#142a5a', out: KIT.ink, text: '#ffffff', textSh: '#0c2440', ramp: ['#10244e', '#1a4482', '#2864aa', '#3a88d0', '#5eaae6', '#94cef4', '#d2f0ff'], plate: false, mat: 'paint' },
  dark: { face: '#1f5f5e', hi: '#58a494', lo: '#14454a', lip: '#081620', out: KIT.ink, text: '#f3e7c9', textSh: '#06141a', ramp: ['#071d24', '#0e3238', '#164a4a', '#21645c', '#327e70', '#4f9c86', '#82c2a6'], plate: false, mat: 'paint' },
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
  const inset = (BTN[style].mat === 'wood' || BTN[style].mat === 'brass') && w >= 60 ? 7 : 4;
  return [inset, ft + 2, w - 2 * inset, fh - 4];
}

function grey(c: C): C { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return lerpC(c, [l, l, l * 1.04], 0.82).map((v) => Math.round(v * 0.66)) as C; }

function paintBtn(style: BtnStyle, state: BtnState, uw: number, uh: number) {
  const P = BTN[style];
  const R0 = P.ramp.map(hx);
  let Q = R0;
  if (state === 'hover') Q = R0.map((c, i) => (i > 0 ? lerpC(c, R0[Math.min(6, i + 1)], 0.5) : c));
  if (state === 'down') Q = R0.map((c, i) => (i < 6 ? lerpC(c, R0[Math.max(0, i - 1)], 0.45) : lerpC(c, R0[5], 0.5)));
  const dis = state === 'disabled';
  if (dis) Q = R0.map(grey);
  const W = dis ? WD.map(grey) : WD;
  const px = new Px(uw, uh);
  const [ft, fh] = btnFace(state, uh);
  const T0 = ft - 1, bh = uh - T0, faceB = ft + fh;
  const plate = btnPlate(style, state, uw, uh);
  const out = hx(P.out);
  const fw = uw - 2;
  const wide = uw >= 50;
  // grain lines along the plank (strong on bare wood, a ghost through paint)
  const grainRow = (x: number, g: number) => Math.round(fh * (g ? 0.68 : 0.36) + Math.sin(x / (9 + g * 4) + g * 2.2) * 1.1);
  // long grain runs, broken at uneven places (a short gap after each run)
  const grainOn = (x: number, g: number) => { let a = (g * 7) % 11 - 4, k = 0; while (a <= x) { const run = 12 + Math.round(hash(k + g * 31, uw) * 18), gap = 2 + Math.round(hash(k, g + 5) * 3); if (x < a + run) return true; a += run + gap; k++; } return false; };
  for (let y = T0; y < uh; y++) for (let x = 0; x < uw; x++) {
    const r = ring(x, y - T0, uw, bh);
    if (r < 0) continue;
    if (r === 0) { px.set(x, y, out); continue; }
    if (y >= faceB) {
      // the lip: the plank's edge (a grain line runs along it), then the dark underside
      const ly = y - faceB;
      px.set(x, y, ly === 0 ? (x === 1 ? Q[2] : hash(Math.floor(x / 5), uw) > 0.72 ? Q[0] : Q[1]) : Q[0]);
      continue;
    }
    const fy = y - ft, fx = x - 1;
    let t: number;
    if (fy === 0) t = 6;                                              // the rim highlight
    else if (fx === 0) t = fy < fh - 1 ? 5 : 3;                      // a lit left bevel
    else if (fx === fw - 1) t = 1;                                   // a shaded right bevel
    else if (fy === fh - 1) t = 1;                                   // a shaded bottom bevel
    else if (fy === fh - 2) t = 2;
    else {
      const k = fy / fh;
      t = P.mat === 'brass' ? (fy <= 2 ? 5 : k < 0.5 ? 4 : 3) : k < 0.34 ? 4 : 3;
      if (fy === 1 && P.mat !== 'brass') t = 5;
      if (P.mat !== 'brass') for (let g = 0; g < 2; g++) if (grainOn(x, g) && fy === grainRow(x, g)) t = P.mat === 'wood' ? t - 2 : t - 1;
      if (P.mat === 'wood' && fy === grainRow(x, 0) + 1 && ((x + 3) % 13) < 4) t += 1;          // a lit lip under the grain
      if (P.mat === 'brass' && fy > 2 && fy % 2 === 0 && ((x * 7 + fy) % 19) < 12) t -= 1;     // brushed streaks
    }
    let c: C = Q[Math.max(0, Math.min(6, t))];
    // worn-shiny scuffs along the top where hands rub the paint
    if (P.mat === 'paint' && !dis && (fy === 1 || fy === 2) && fx > 2 && fx < fw - 3) {
      const u = (fx * 7 + fy * 3) % 37;
      if (u < (fy === 1 ? 5 : 2)) c = Q[6];
    }
    px.set(x, y, c);
  }
  // paint chipped back to wood: hand-placed chips at the top-left, bottom-right, and one along the top
  if (P.mat === 'paint') {
    const chip = (pts: [number, number, number][], edge: [number, number][]) => {
      for (const [cx, cy, wt] of pts) px.set(cx, ft + cy, W[wt]);
      for (const [ex, ey] of edge) px.set(ex, ft + ey, Q[0]);
    };
    chip([[1, 1, 7], [2, 1, 6], [1, 2, 6]], [[3, 1], [2, 2], [1, 3]]);
    chip([[uw - 3, fh - 2, 5], [uw - 4, fh - 2, 4], [uw - 3, fh - 3, 4]], [[uw - 5, fh - 2], [uw - 4, fh - 3], [uw - 3, fh - 4]]);
    if (wide) { const mx = Math.round(uw * 0.63); chip([[mx, 1, 6], [mx + 1, 1, 5]], [[mx, 2], [mx + 1, 2], [mx + 2, 1]]); }
    // a golden diatom fringe along the bottom-left (it has been in the water a while)
    if (wide && !dis) for (let i = 0; i < 8; i++) { const hh = [1, 2, 1, 1, 2, 2, 1, 1][i]; for (let j = 0; j < hh; j++) px.set(3 + i, ft + fh - 2 - j, j === 0 ? R.diatom[3] : R.diatom[4]); }
  }
  // the carved / engraved label plate: a recess one tone darker, shadowed top / left, catching light bottom / right
  if (plate) {
    const [pxl, py, pw, ph] = plate;
    for (let y = py; y < py + ph; y++) for (let x = pxl; x < pxl + pw; x++) {
      let c = lerpC(Q[3], Q[2], 0.5);
      if (y === py || x === pxl) c = Q[1];
      else if (y === py + ph - 1 || x === pxl + pw - 1) c = Q[5];
      else if (P.mat === 'wood' && (y === py + 2 + Math.round(Math.sin(x / 6) * 0.6) || y === py + ph - 4 + Math.round(Math.sin(x / 8 + 2) * 0.6)) && ((x * 3 + y * 5) % 17) < 11) c = Q[1];
      else if (P.mat === 'wood' && y === py + 3 + Math.round(Math.sin(x / 6) * 0.6) && ((x * 3) % 13) < 4) c = lerpC(Q[3], Q[4], 0.5);
      else if (P.mat === 'brass' && (y - py) % 2 === 0) c = lerpC(Q[3], Q[2], 0.3);
      px.set(x, y, c);
    }
    if (P.mat === 'brass' && !dis) { px.set(pxl + 1, py + ph - 2, R.verd[2]); px.set(pxl + 1, py + 1, R.verd[1]); px.set(pxl + pw - 2, py + ph - 2, R.verd[1]); }
  }
  // nail heads at the ends of long wooden planks and painted planks; rivets on long brass
  const ny = ft + Math.floor(fh / 2) - 1;
  if ((P.mat === 'wood' && uw >= 60) || (P.mat === 'paint' && uw >= 70)) { nail(px, 2, ny, 1); nail(px, uw - 4, ny, 1); }
  if (P.mat === 'brass' && plate && uw >= 60) { rivet(px, 2, ny); rivet(px, uw - 5, ny); }
  // end checks: a crack running in from each end of a bare plank
  if (P.mat === 'wood' && uw >= 40) for (let i = 0; i < 3; i++) { px.set(1 + i, ft + fh - 4, Q[1]); px.set(uw - 2 - i, ft + 3, Q[1]); }
  // a specular glint in the lit corner
  if (!dis && uw > 10) { const g = lerpC(Q[6], hx('#ffffff'), 0.6); px.set(2, ft + 1, g); px.set(3, ft + 1, Q[6]); px.set(2, ft + 2, Q[6]); }
  if (state === 'on' && !dis) for (let x = 2; x < uw - 2; x++) px.set(x, ft + 1, lerpC(Q[6], hx('#ffffff'), 0.35));
  return px.done();
}

export function btnSkin(style: BtnStyle, state: BtnState, w: number, h: number, d = 1): HTMLCanvasElement {
  w = Math.max(6, Math.round(w)); h = Math.max(8, Math.round(h)); d = clampD(d);
  return at(`btn|${style}|${state}|${w}|${h}`, d, () => paintBtn(style, state, w, h));
}

// ------------------------------------------------------------------ small widget art
export const KEYCAP_H = 13;
/** cream (bleached shell) and teal-lacquer ramps for keycaps */
const CR = ramp('#7a5e40', '#a4875c', '#c4ac80', '#d8c49c', '#e8d9b8', '#f2e8cc', '#faf3e0', '#fffcf0');
const TW = ramp('#06141c', '#0b2129', '#103038', '#174248', '#1f5856', '#2c6e66', '#46907c', '#78b498');

/** a chunky keycap (no label): a dished face with a 6-tone bevel, a 2 px side, an ink outline */
export function keycapBody(w: number, h = KEYCAP_H, dark = false, down = false, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`kcb|${w}|${h}|${dark}|${down}`, d, () => {
    const px = new Px(w, h);
    const K = dark ? TW : CR;
    const top = down ? 2 : 0, side = down ? 0 : 2;
    const faceT = top + 1, faceB = h - 1 - side;
    for (let y = top; y < h; y++) for (let x = 0; x < w; x++) {
      const r = ring(x, y - top, w, h - top, 1);
      if (r < 0) continue;
      if (r === 0) { px.set(x, y, INK); continue; }
      if (y >= faceB) { px.set(x, y, y === faceB ? K[2] : x === 1 ? K[2] : K[1]); continue; }
      const fy = y - faceT, fx = x - 1, fw = w - 2, fhh = faceB - faceT;
      let t: number;
      if (fy === 0) t = 7;
      else if (fx === 0) t = 6;
      else if (fx === fw - 1) t = 3;
      else if (fy === fhh - 1) t = 4;
      else t = fy / fhh > 0.55 ? 5 : 6;                 // the dish: the lower half a step darker
      px.set(x, y, K[t]);
    }
    if (!down) px.set(2, faceT + 1, dark ? K[7] : hx('#ffffff'));
    return px.done();
  });
}

/**
 * the close widget: a coral key in an engraved brass bezel with a bevelled cream X. The canvas is `size` wide and
 * size + 3 tall (UI px): the plate rests 1 px down on a 2 px lip, lifts on hover and sinks on press.
 */
export function closeArt(size: number, state: 'normal' | 'hover' | 'down' | 'disabled', d = 1): HTMLCanvasElement {
  const S = Math.max(11, Math.round(size));
  d = clampD(d);
  return at(`close|${S}|${state}`, d, () => {
    const px = new Px(S, S + 3);
    const dis = state === 'disabled';
    const F0 = ramp('#3e0e20', '#721a2a', '#a8302e', '#d44c42', '#ec7058', '#fc9c78', '#ffcca4');
    let FR = F0;
    if (state === 'hover') FR = F0.map((c, i) => lerpC(c, F0[Math.min(6, i + 1)], 0.45));
    if (state === 'down') FR = F0.map((c, i) => lerpC(c, F0[Math.max(0, i - 1)], 0.4));
    if (dis) FR = F0.map(grey);
    const B2 = dis ? BR.map(grey) : BR;
    const top = state === 'hover' ? 0 : state === 'down' ? 3 : 1;
    const lip = state === 'down' ? 0 : state === 'hover' ? 3 : 2;
    const bz = S >= 18 ? 2 : 1;
    const ringOf = (ux: number, uy: number) => {
      const dx = Math.min(ux, S - 1 - ux), dy = Math.min(uy, S - 1 - uy);
      if ((dx === 0 && dy < 2) || (dy === 0 && dx < 2)) return -1;
      if (dx === 1 && dy === 1) return 0;
      return Math.min(dx, dy);
    };
    // the lip: the plate's silhouette, lower, in dark brass
    if (lip) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const rr = ringOf(x, y); if (rr >= 0) px.set(x, y + top + lip, rr === 0 ? INK : (x * 3 + y) % 7 < 2 ? B2[0] : B2[1]); }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const rr = ringOf(x, y);
      if (rr < 0) continue;
      const Y = y + top;
      if (rr === 0) { px.set(x, Y, INK); continue; }
      const tl = y < S / 2 ? x <= y || x < S - 1 - y : x < S - 1 - y;
      if (rr <= bz) {
        // the brass bezel: lit top / left, shaded bottom / right; an engraved line round it on big keys
        let c: C = tl ? (rr === 1 ? B2[7] : B2[5]) : rr === 1 ? B2[2] : B2[3];
        if (bz === 2 && rr === 2) c = tl ? B2[2] : B2[5];
        px.set(x, Y, c); continue;
      }
      if (rr === bz + 1) { px.set(x, Y, INK); continue; }
      // the coral face: a ramp with a gloss band in the upper third
      const fy = y - (bz + 2), fh = S - 2 * (bz + 2), fx = x - (bz + 2);
      const k = fy / fh;
      let c: C = k < 0.12 ? FR[6] : k < 0.4 ? FR[4] : k < 0.85 ? FR[3] : FR[2];
      if (fx === 0) c = lerpC(c, FR[5], 0.5);
      if (fx === fh - 1) c = FR[2];
      px.set(x, Y, c);
    }
    // verdigris in the bezel's lower corners
    if (bz === 2 && !dis) { px.set(2, top + S - 3, R.verd[2]); px.set(S - 3, top + S - 3, R.verd[1]); px.set(S - 4, top + S - 3, R.verd[2]); }
    // the X: two bevelled strokes (a lit edge, the body, a dark drop shadow)
    const a = bz + 2, n = S - 2 * a, mg = Math.max(1, Math.round(n * 0.2)), len = n - 2 * mg;
    const th = S >= 16 ? 2 : 1;
    const cream = dis ? hx('#d8d4cc') : hx('#fffaee'), cream2 = dis ? hx('#a8a49c') : hx('#e9dbb7'), shadow = dis ? hx('#3a3836') : FR[0];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < len; i++) for (const dir of [1, -1]) {
      const X = a + mg + i, Y = (dir > 0 ? a + mg + i : a + mg + len - 1 - i) + top;
      for (let k = 0; k < th; k++) {
        if (pass === 0) px.set(X + k + 1, Y + 1, shadow);
        else px.set(X + k, Y, k === th - 1 ? cream2 : cream);
      }
    }
    return px.done();
  });
}

/** a folder tab (open at the bottom): a wooden plank tab with grain and nail heads; on = a teal painted cap */
export function tabSkin(state: 'on' | 'hover' | 'off', w: number, h: number, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`tab|${state}|${w}|${h}`, d, () => {
    const px = new Px(w, h);
    const base = state === 'on' ? 5 : state === 'hover' ? 4 : 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x);
      if (y === 0 && dx < 2) continue;
      if (y === 1 && dx === 0) continue;
      if (y === 0 || dx === 0 || (y === 1 && dx === 1)) { px.set(x, y, INK); continue; }
      if (state === 'on' && y <= 2) {
        // a teal painted cap, worn: a lit edge, a chip at the left
        const chipped = (x === 3 || x === 4) && y === 2;
        px.set(x, y, chipped ? WD[6] : y === 1 ? TP[x < 4 ? 6 : 5] : TP[3]); continue;
      }
      if (dx === 1) { px.set(x, y, x < w / 2 ? WD[Math.min(8, base + 2)] : WD[Math.max(0, base - 2)]); continue; }
      let t = base;
      for (const f of [0.45, 0.76]) { const gy = Math.round(f * h + Math.sin(x / 7 + f * 5) * 0.8); if (y === gy && ((x + Math.round(f * 40)) % 23) < 16) t = base - 2; }
      if (y === 1 && state !== 'on') t = base + 2;
      if (state === 'on' && y === 3) t = base - 1;      // the cap's shadow on the wood
      px.set(x, y, WD[Math.max(0, Math.min(8, t))]);
    }
    if (w >= 28 && h >= 14) { const ny = state === 'on' ? 4 : 3; nail(px, 3, ny, 1); nail(px, w - 5, ny, 1); }
    return px.done();
  });
}

/** the slider knob: a brass lozenge with a 7-tone bevel and three grip grooves, a cast shadow under it */
export function knobArt(state: 'normal' | 'hover' | 'down', d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`knob|${state}`, d, () => {
    const px = new Px(9, 14);
    const top = state === 'down' ? 1 : 0;
    const Q = state === 'hover' ? BR.map((c, i) => lerpC(c, BR[Math.min(7, i + 1)], 0.5)) : BR;
    if (state !== 'down') for (let x = 1; x < 8; x++) px.set(x, 13, hx('#000000'), 120);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 9; x++) {
      if ((x === 0 || x === 8) && (y === 0 || y === 12)) continue;
      const e = Math.min(x, y, 8 - x, 12 - y);
      if (e === 0) { px.set(x, y + top, INK); continue; }
      let t = 4;
      if (y === 1) t = 7; else if (y === 2) t = 6; else if (x === 1) t = 6; else if (x === 7) t = 2; else if (y === 11) t = 1; else if (y === 10) t = 3;
      if (x >= 2 && x <= 6 && (y === 4 || y === 6 || y === 8)) t = 1;
      if (x >= 3 && x <= 6 && (y === 5 || y === 7 || y === 9)) t = 6;
      px.set(x, y + top, Q[t]);
    }
    px.set(2, 10 + top, R.verd[2]); px.set(2, 1 + top, hx('#ffffff'));
    return px.done();
  });
}

/** a checkbox: a recessed seaweed-paper box with a bold bevelled kelp tick */
export function checkArt(on: boolean, hover: boolean, down: boolean, S = 13, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`chk|${on}|${hover}|${down}|${S}`, d, () => {
    const px = new Px(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = ring(x, y, S, S, 1);
      if (r < 0) continue;
      if (r === 0) { px.set(x, y, INK); continue; }
      if (r === 1 && (y === 1 || x === 1)) { px.set(x, y, down ? PA[2] : PA[3]); continue; }
      if (r === 1) { px.set(x, y, PA[7]); continue; }
      let c = hover ? PA[7] : PA[6];
      if ((y === 2 || x === 2) && !down) c = PA[4];
      if (y === Math.round(S * 0.6) && x > 3 && x < S - 3 && x % 5 !== 0) c = hover ? PA[6] : PA[5];   // a fibre
      px.set(x, y, c);
    }
    if (on) {
      const K = R.kelp;
      // the tick: a short stroke down-right, a long one up-right, 2 px thick, lit top edge, a dark shadow
      const sc = S / 13;
      const pts: [number, number][] = [];
      const seg = (x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) pts.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)]); };
      seg(Math.round(2 * sc), Math.round(6 * sc), Math.round(5 * sc), Math.round(9 * sc));
      seg(Math.round(5 * sc), Math.round(9 * sc), Math.round(10 * sc), Math.round(2 * sc));
      const set = new Set<string>();
      for (const [x, y] of pts) { set.add(x + ',' + y); set.add(x + ',' + (y + 1)); }
      for (const k of set) { const [x, y] = k.split(',').map(Number); if (!set.has((x + 1) + ',' + (y + 1))) px.set(x + 1, y + 1, K[0]); }
      for (const k of set) { const [x, y] = k.split(',').map(Number); px.set(x, y, !set.has(x + ',' + (y - 1)) ? K[6] : !set.has(x + ',' + (y + 1)) ? K[2] : K[4]); }
    }
    return px.done();
  });
}

// ------------------------------------------------------------------ animation sprites (PixelUI draws these over cached skins)
const BUB: Record<number, string[]> = {
  1: ['.L.', 'Lwm', '.m.'],
  2: ['.LLm.', 'Lw..m', 'L...m', 'm...d', '.mdd.'],
  3: ['..LLm..', '.Lw..m.', 'Lw....m', 'L.....m', 'm.....d', '.m...d.', '..mdd..'],
};
/** a bubble (radius r UI px), hand-drawn: a lit rim top-left, a darker rim bottom-right, a faint body, a glint */
export function bubbleArt(r: number, d = 1): HTMLCanvasElement {
  d = clampD(d); r = Math.max(1, Math.min(3, Math.round(r)));
  return at(`bub|${r}`, d, () => {
    const rows = BUB[r], S = rows.length, px = new Px(S, S);
    const col: Record<string, [C, number]> = { L: [hx('#e6fbff'), 235], m: [hx('#8fd0dc'), 220], d: [hx('#4a90a8'), 210], w: [hx('#ffffff'), 255] };
    const R2 = (S - 1) / 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ch = rows[y][x];
      if (col[ch]) { px.set(x, y, col[ch][0], col[ch][1]); continue; }
      if (ch === '.' && Math.hypot(x - R2, y - R2) < R2) px.set(x, y, hx('#7fc8d8'), 50);
    }
    return px.done();
  });
}

/**
 * a seamless caustic-light tile (96 UI px square, 1 texel per UI px): the bright web that sunlight through waves
 * throws on the seabed, from two crossing sine fields (smooth deterministic curves, no noise). Transparent except the
 * lines, which are a chunky 1 px wide.
 */
export function causticTile(d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at('caustic', d, () => {
    const N = 96, px = new Px(N, N), k = (2 * Math.PI) / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = Math.sin(x * k * 3 + Math.sin(y * k * 2) * 1.8 + Math.sin(x * k) * 0.9);
      const b = Math.sin(y * k * 3 + Math.sin(x * k * 2) * 1.6 + Math.sin(y * k * 1) * 1.1 + 1.3);
      const v = Math.abs(a + b);
      if (v < 0.07) px.set(x, y, hx('#c8fff4'), 255);
      else if (v < 0.16) px.set(x, y, hx('#8fe6e0'), 110);
    }
    return px.done();
  });
}
