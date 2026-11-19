// v6 home panel frames ("chunky + detailed"): every frame is painted at ONE texel per UI pixel with the kit's sea
// toolbox (src/ui/pixel/decor.ts): heavy weathered planks (long wandering grain, knots the grain wraps round, seams
// with lit end grain, split ends, nail heads with rust runs, worm holes, flakes of old paint), and the sea moved in --
// barnacle clusters, limpets, a snail, a sea star, coralline crust, algae films with their diatom fringe, a kelp
// holdfast with its frond climbing the side, sea-grass tufts. Every detail is placed by rule (never noise):
//
//   panelArt('chest', w, h)      the SEA CHEST: ruddy ship timber, rusty iron straps and corner plates, a dark NORI
//                                lining (pressed seaweed: fibres, flecks)
//   panelArt('bench', w, h)      the WORKBENCH: thick grey driftwood lashed with rope, tool nicks, a stitched leather
//                                work mat with old cut marks
//   panelArt('wardrobe', w, h)   the WARDROBE: sea-worn grey-green driftwood, sea-glass knobs in the top rail, brass corners,
//                                a deep teal kelp-paper back
//   panelArt('trophy', w, h)     the TROPHY CASE: driftwood with brass corners round a navy back strung with net
//   PANEL_IN[kind]               the inner content rect insets [l, t, r, b]
//   wellArt(w, h, tone)          a recessed dark-water well (the kit's inset) or a dark driftwood board (light text)
// Animated life (bubbles, swaying kelp, caustics) is drawn per frame on top by the panels (seaFx.ts).
import { Px, R, hx, hash, stamp, SPR, algae, coralline, kelpBlade, bladePath, holdfast, grass, nail, rivet, planks as band, wraps, type C } from '../ui/pixel/decor';
import { skin } from '../ui/pixel/skins';

export type PanelKind = 'chest' | 'bench' | 'wardrobe' | 'trophy';
export const PANEL_IN: Record<PanelKind, [number, number, number, number]> = { chest: [12, 22, 12, 12], bench: [12, 22, 12, 12], wardrobe: [11, 22, 11, 11], trophy: [12, 22, 12, 12] };

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, f: () => HTMLCanvasElement) { let c = cache.get(key); if (!c) { c = f(); cache.set(key, c); if (cache.size > 60) { const k = cache.keys().next().value; if (k !== undefined) cache.delete(k); } } return c; }
const ramp = (...s: string[]) => s.map(hx);

/** 9-tone wood ramps per panel, dark -> light (hue-shifted: cool shadows, warm lights) */
const TIMBER = ramp('#170a0a', '#2c1210', '#46201a', '#642e22', '#82402a', '#9e5634', '#b87044', '#d08e5a', '#e8b47e');
const DRIFT = ramp('#14100e', '#2a221c', '#40352a', '#584a3a', '#72624c', '#8c7a60', '#a69476', '#c0b090', '#dcceb0');
/** sea-worn grey-green driftwood (the wardrobe: light text sits on its top rail) */
const PALE = ramp('#101412', '#1e2622', '#2e3832', '#3e4a42', '#505c52', '#647064', '#7a8676', '#94a08e', '#b4bea8');
const INK = R.ink;

/** an L-shaped corner plate (iron or brass) over a corner, riveted */
function cornerPlate(px: Px, x: number, y: number, fx: 1 | -1, fy: 1 | -1, metal: C[], L = 11, Wd = 5) {
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
    if (i >= Wd && j >= Wd) continue;
    const X = x + i * fx, Y = y + j * fy;
    const edge = i === 0 || j === 0 || (i === L - 1) || (j === L - 1) || (i === Wd - 1 && j >= Wd) || (j === Wd - 1 && i >= Wd);
    const litE = (fy > 0 && j === 0) || (fx > 0 && i === 0);
    px.set(X, Y, edge ? (litE ? metal[4] : metal[1]) : metal[(i + j) % 5 === 0 ? 2 : 3]);
  }
  for (const [i, j] of [[2, 2], [L - 3, 2], [2, L - 3]]) { const X = x + i * fx - 1, Y = y + j * fy - 1; rivet(px, X, Y, metal.length >= 8 ? metal : R.brass); }
}

/** a dark lining sheet into the inner rect: nori (pressed seaweed), wardrobe kelp paper, or the leather mat */
function lining(px: Px, x: number, y: number, w: number, h: number, kind: 'nori' | 'teal' | 'leather') {
  const N = kind === 'nori' ? ramp('#070d0a', '#0d1612', '#132019', '#1a2b21', '#24392b', '#30483a')
    : kind === 'teal' ? ramp('#050f0e', '#0a1a18', '#0f2522', '#16312d', '#20403a', '#2e544b')
      : ramp('#0e1012', '#15181b', '#1c2024', '#252a2f', '#30363c', '#4a5258');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px.set(x + i, y + j, N[2]);
  if (kind !== 'leather') {
    // fibres: long strands, wavering, broken unevenly; a few paler; seaweed flecks
    for (let j = 0, yy = 3; yy < h - 1; j++, yy += 4 + Math.round(hash(j, 5) * 3)) {
      let xx = Math.round(hash(j, 3) * 20) - 12;
      const ph = hash(j, 9) * 20;
      while (xx < w) {
        const L = 8 + Math.round(hash(j, xx + 40) * 22), gap = 5 + Math.round(hash(xx + 7, j) * 12);
        const c = hash(j * 3, xx) > 0.8 ? N[4] : N[3];
        for (let i = 0; i < L; i++) { const X = xx + i; if (X >= 0 && X < w) { const Y = yy + Math.round(Math.sin((X + ph) / 10) * 1.1); if (Y >= 0 && Y < h) px.set(x + X, y + Y, c); } }
        xx += L + gap;
      }
    }
    for (let j = 0, yy = 6; yy < h - 3; j++, yy += 13) for (let i = 0, xx = 8 + (j % 2) * 14; xx < w - 3; i++, xx += 29) {
      if (hash(i + 40, j + 40) > 0.6) continue;
      px.set(x + xx, y + yy, N[5]); px.set(x + xx + 1, y + yy, N[4]); px.set(x + xx + 1, y + yy - 1, N[4]); px.set(x + xx + 2, y + yy - 1, N[1]);
    }
  } else {
    // the leather mat: a stitched border 3 px in, a few old knife cuts
    for (let i = 4; i < w - 4; i++) if (i % 4 < 2) { px.set(x + i, y + 3, N[5]); px.set(x + i, y + h - 4, N[5]); }
    for (let j = 4; j < h - 4; j++) if (j % 4 < 2) { px.set(x + 3, y + j, N[5]); px.set(x + w - 4, y + j, N[5]); }
    for (let k = 0; k < 5; k++) {
      const cx = x + 12 + Math.round(hash(k, 1) * (w - 30)), cy = y + 10 + Math.round(hash(k, 2) * (h - 24)), L = 4 + Math.round(hash(k, 3) * 5), dir = hash(k, 4) > 0.5 ? 1 : -1;
      for (let i = 0; i < L; i++) { px.set(cx + i, cy + Math.round(i * 0.5) * dir, N[0]); px.set(cx + i, cy + Math.round(i * 0.5) * dir + 1, N[4]); }
    }
  }
  // the frame's cast shadow over the top and the left
  for (let i = 0; i < w; i++) { px.shade(x + i, y, 0.45); px.shade(x + i, y + 1, 0.7); }
  for (let j = 0; j < h; j++) { px.shade(x, y + j, 0.55); px.shade(x + 1, y + j, 0.8); }
}

/** the frame of a panel of a kind, exactly w x h */
export function panelArt(kind: PanelKind, w: number, h: number): HTMLCanvasElement {
  w = Math.max(40, Math.round(w)); h = Math.max(40, Math.round(h));
  return cached(`${kind}|${w}|${h}`, () => {
    const px = new Px(w, h);
    const [il, it, ir, ib] = PANEL_IN[kind];
    const ix = il, iy = it, iw = w - il - ir, ih = h - it - ib;
    const W = kind === 'chest' ? TIMBER : kind === 'wardrobe' ? PALE : DRIFT;
    const seed = kind.length * 7 + (kind === 'trophy' ? 3 : 0);
    // the bands: the top rail and bottom rail run the full width; the sides between them
    const sTop = band(px, 1, 1, w - 2, it - 3, true, W, seed, { lit: 1, flakes: kind !== 'chest' });
    const sBot = band(px, 1, h - ib + 1, w - 2, ib - 2, true, W, seed + 3, { lit: -1 });
    band(px, 1, it - 2, h - it - ib + 3, il - 1, false, W, seed + 5, { lit: 0 });
    band(px, w - ir, it - 2, h - it - ib + 3, ir - 1, false, W, seed + 9, { lit: -1 });
    // the outline, the outer lit edge / dark edge, a dark seam where the sides meet the rails
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
      if ((dx === 0 && dy < 2) || (dy === 0 && dx < 2)) continue;
      if (dx === 0 || dy === 0 || (dx === 1 && dy === 1)) { px.set(x, y, INK); continue; }
    }
    for (let x = 2; x < w - 2; x++) { px.set(x, 1, W[8]); px.set(x, h - 2, W[1]); }
    for (let y = 2; y < h - 2; y++) { px.set(1, y, W[7]); px.set(w - 2, y, W[2]); }
    for (let x = 2; x < il; x++) px.shade(x, it - 3, 0.5);
    for (let x = w - ir; x < w - 2; x++) px.shade(x, it - 3, 0.5);
    // the inner well, sunk into the frame: a dark lip on top / left, a lit lip below / right
    for (let x = ix - 2; x < ix + iw + 2; x++) { px.set(x, iy - 2, INK); px.set(x, iy + ih + 1, W[6]); }
    for (let y = iy - 2; y < iy + ih + 2; y++) { px.set(ix - 2, y, INK); px.set(ix + iw + 1, y, W[5]); }
    for (let x = ix - 1; x < ix + iw + 1; x++) { px.set(x, iy - 1, INK); px.set(x, iy + ih, INK); }
    for (let y = iy - 1; y < iy + ih + 1; y++) { px.set(ix - 1, y, INK); px.set(ix + iw, y, INK); }
    if (kind === 'chest') lining(px, ix, iy, iw, ih, 'nori');
    else if (kind === 'bench') lining(px, ix, iy, iw, ih, 'leather');
    else if (kind === 'wardrobe') lining(px, ix, iy, iw, ih, 'teal');
    else {
      // a navy back strung with fishing net: diagonal cords knotted where they cross
      const NV = ramp('#070b1c', '#0d1430', '#141c3c', '#1c2650', '#2a3664', '#3e4c84');
      for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
        const P = 16, a = (x + y) % P, b = (x - y + 8 * P) % P;
        px.set(ix + x, iy + y, a === 0 || b === 0 ? NV[3] : a === 1 || b === 15 ? NV[1] : NV[2]);
      }
      for (let y = 8; y < ih; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < iw; x += 16) if (x > 0 && x < iw - 1) { px.set(ix + x - 1, iy + y - 1, NV[5]); px.set(ix + x, iy + y - 1, NV[4]); px.set(ix + x - 1, iy + y, NV[4]); px.set(ix + x, iy + y, NV[1]); }
      for (let i = 0; i < iw; i++) { px.shade(ix + i, iy, 0.45); px.shade(ix + i, iy + 1, 0.7); }
    }
    // nails at the plank ends of the rails (pairs on the double top rail), with rust runs
    for (const s of sTop) for (const a of s.at) { nail(px, 1 + a + 2, 1 + s.b + 2, 2); nail(px, 1 + a - 4, 1 + s.b + 2, 2); }
    for (const s of sBot) for (const a of s.at) nail(px, 1 + a + 2, h - ib + 3, 2);
    for (const y of [it + 8, h - ib - 10]) { nail(px, 4, y, 2); nail(px, w - ir + 4, y, 2); }
    // ---- fittings per kind
    if (kind === 'chest') {
      // rusty iron straps over the rails, riveted; iron corner plates
      const I = ramp('#140c0a', '#2e1a14', '#4a2a1e', '#6a3c28', '#8e5034', '#ac6c48', '#c88a60', '#e0aa80');
      for (const sx of [Math.round(w * 0.25), Math.round(w * 0.75)]) for (const [sy, sh] of [[1, it - 3], [h - ib + 1, ib - 2]]) {
        for (let y = sy; y < sy + sh; y++) for (let x = sx - 4; x <= sx + 4; x++) {
          const e = x === sx - 4 || x === sx + 4;
          px.set(x, y, e ? INK : x === sx - 3 ? I[5] : x === sx + 3 ? I[1] : (y + x) % 7 === 0 ? I[2] : I[3]);
        }
        rivet(px, sx - 1, sy + 2, I); rivet(px, sx - 1, sy + sh - 5, I);
      }
      cornerPlate(px, 1, 1, 1, 1, I); cornerPlate(px, w - 2, 1, -1, 1, I); cornerPlate(px, 1, h - 2, 1, -1, I); cornerPlate(px, w - 2, h - 2, -1, -1, I);
    } else if (kind === 'bench') {
      // rope wraps lashing the rails to the sides; tool nicks along the bottom rail
      wraps(px, il + 2, 1, it - 3, true); wraps(px, w - ir - 11, 1, it - 3, true);
      wraps(px, 1, h - ib - 12, il - 1, false); wraps(px, w - ir, h - ib - 12, ir - 1, false);
      for (let i = 0; i < 6; i++) { const nx = Math.round(w * (0.14 + i * 0.13)), ny = h - ib + 4; px.set(nx, ny, W[1]); px.set(nx + 1, ny, W[1]); px.set(nx + 1, ny + 1, W[7]); px.set(nx + 2, ny + 1, W[7]); }
    } else {
      // brass corner plates
      for (const [cx, cy, fx, fy] of [[1, 1, 1, 1], [w - 2, 1, -1, 1], [1, h - 2, 1, -1], [w - 2, h - 2, -1, -1]] as const) cornerPlate(px, cx, cy, fx, fy, R.brass);
      if (kind === 'wardrobe') {
        // sea-glass knobs set into the top rail
        for (const [gx, gi] of [[0.3, 0], [0.5, 1], [0.7, 2]] as const) {
          const G = [R.glass, ramp('#16305a', '#2a5a9a', '#5a92d6', '#a8d4ff', '#f0faff'), ramp('#2a4a16', '#4a7a2a', '#86b85a', '#c4e8a0', '#f4ffe4')][gi];
          const x = Math.round(w * gx) - 3, y = 6;
          for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) {
            const e = ((i - 3) / 3.5) ** 2 + ((j - 2.5) / 3) ** 2; if (e > 1) continue;
            px.set(x + i, y + j, e > 0.7 ? G[0] : i + j < 4 ? G[3] : i + j > 8 ? G[1] : G[2]);
          }
          px.set(x + 2, y + 1, G[4]); px.shade(x + 7, y + 4, 0.6); px.shade(x + 6, y + 6, 0.6);
        }
      }
    }
    // ---- the sea moved in
    const onFrame = (X: number, Y: number) => X >= 1 && Y >= 1 && X < w - 1 && Y < h - 1 && !(X >= ix - 2 && X < ix + iw + 2 && Y >= iy - 2 && Y < iy + ih + 2);
    const nearFrame = (X: number, Y: number) => X >= 1 && Y >= 1 && X < w - 1 && Y < h - 1 && !(X >= ix + 2 && X < ix + iw - 2 && Y >= iy + 2 && Y < iy + ih - 2);
    algae(px, w * 0.38, h - ib / 2, 9, 3.2, seed, { inside: nearFrame });
    algae(px, w * 0.52, h - ib / 2 - 1, 6, 2.8, seed + 2.3, { inside: nearFrame });
    algae(px, w * 0.86, h - ib / 2, 7, 3, seed + 1.1, { inside: nearFrame });
    algae(px, w - ir / 2, h * 0.68, 3.6, 10, seed + 4.2, { inside: nearFrame, brown: true });
    algae(px, il / 2, h * 0.42, 3.4, 8, seed + 0.7, { inside: nearFrame, brown: true });
    coralline(px, 20, h - ib / 2, 7, 3, seed + 3, { inside: onFrame });
    coralline(px, w - ir / 2 + 1, h - ib - 22, 3, 5, seed + 8, { inside: onFrame });
    // barnacles crusted on the top rail past the left corner and on the bottom rail at the right
    for (const [sp, x, y] of [[SPR.barnacleL, 18, 4], [SPR.barnacleM, 23, 6], [SPR.barnacleS, 16, 8], [SPR.barnacleM, 27, 3], [SPR.barnacleL, w - 34, h - ib + 4], [SPR.barnacleS, w - 28, h - ib + 6], [SPR.barnacleM, 4, it + 22], [SPR.barnacleS, 5, it + 27]] as const) stamp(px, sp, x, y, { onlyOn: true });
    stamp(px, SPR.limpet, Math.round(w * 0.56), h - ib + 3, { onlyOn: true });
    stamp(px, SPR.limpet, w - ir + 2, Math.round(h * 0.4), { onlyOn: true });
    stamp(px, SPR.star, Math.round(w * 0.2), h - ib + 2, { onlyOn: true });
    stamp(px, SPR.snail, Math.round(w * 0.7), h - ib + 2, { onlyOn: true });
    stamp(px, SPR.scallop, Math.round(w * 0.9), h - ib + 3, { onlyOn: true });
    grass(px, Math.round(w * 0.31), h - ib + 2, 4, seed, 8, { inside: (X, Y) => X > 0 && Y > 0 && X < w - 1 && Y < h - 1 });
    grass(px, Math.round(w * 0.79), h - ib + 2, 3, seed + 4, 6, { inside: (X, Y) => X > 0 && Y > 0 && X < w - 1 && Y < h - 1 });
    // a kelp holdfast clamped low on the left side, its frond climbing the side
    const hy = h - ib - 6;
    kelpBlade(px, bladePath(5, hy - 1, 0, -1, Math.min(48, Math.round(h * 0.4)), 1.6, seed), 4, { inside: (X, Y) => X > 0 && Y > 0 && X < il + 1 });
    kelpBlade(px, bladePath(8, hy - 1, 0.3, -1, 16, 1, seed + 2), 3, { inside: (X, Y) => X > 0 && Y > 0 && X < il + 1 });
    holdfast(px, 5, hy, 1);
    return px.done();
  });
}

/** a recessed well (the kit's dark-water inset), or a dark driftwood board of three planks (light text) */
export function wellArt(w: number, h: number, tone: 'dark' | 'plank' = 'dark'): HTMLCanvasElement {
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  if (tone === 'dark') return skin('inset', w, h);
  return cached(`well|${tone}|${w}|${h}`, () => {
    const px = new Px(w, h);
    const D = ramp('#0c0a08', '#1a1612', '#28221c', '#352d25', '#433a2f', '#53483a', '#655847', '#7c6c58', '#958470');
    const ph = Math.ceil((h - 2) / 3);
    for (let i = 0; i < 3; i++) band(px, 1, 1 + i * ph, w - 2, Math.min(ph, h - 2 - i * ph), true, D, 31 + i * 5, { lit: -1 });
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
      if ((dx === 0 && dy < 2) || (dy === 0 && dx < 2)) { px.set(x, y, INK, 0); continue; }
      if (dx === 0 || dy === 0 || (dx === 1 && dy === 1)) px.set(x, y, INK);
    }
    for (let x = 2; x < w - 2; x++) { px.set(x, 1, D[7]); px.set(x, h - 2, D[1]); }
    for (const x of [6, w - 8]) for (let i = 0; i < 3; i++) if (h > 20) nail(px, x, 1 + i * ph + Math.floor(ph / 2) - 1, 1);
    if (w > 60 && h > 24) {
      stamp(px, SPR.barnacleM, w - 14, h - 6, { onlyOn: true }); stamp(px, SPR.barnacleS, w - 18, h - 5, { onlyOn: true });
      algae(px, 14, h - 3, 7, 2.2, 1.3, { inside: (X, Y) => X > 0 && Y > 0 && X < w - 1 && Y < h - 1 });
      coralline(px, w * 0.62, h - 3, 4, 1.6, 6, { inside: (X, Y) => X > 0 && Y > 0 && X < w - 1 && Y < h - 1 });
    }
    return px.done();
  });
}

