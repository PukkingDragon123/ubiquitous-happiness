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


// ------------------------------------------------------------------ interiors (v6): rows, cells, drawers, plates
// The pieces the home panels draw their content on, painted 1x with the same hand-placed detail as the frames:
//
//   rowArt(w, h, state, seed, cubby)   a list row: a dark driftwood plank strip (light text on it) with a recessed
//                                      icon cubby at its left; hover: a paler plank and a teal edge; sel: brass-trimmed
//   cellArt(s, state, gem?)            an item cubby: a wooden rim (shadowed top / left, lit bottom / right), dark water,
//                                      a glass glint, a sand bed; on: a brass rim; gem: a sea-glass gem in that colour
//   drawerArt(w, h)                    a wardrobe drawer: a grey-green plank rim, a teal kelp-paper bed, a lit front lip
//   cushionArt(w, h, state)            a velvet medal cushion with a brass hook (trophy case); on: brass-framed
//   plateArt(w, h)                     a brass-bezelled navy velvet card (the trophy case's detail card)
//   windowArt(s)                       the item display window: a riveted, engraved brass bezel round dark water with
//                                      light shafts and a sand mound to stand a model on
//   emptyChestArt()                    the empty sea chest scene (the stash's empty state)
const small = new Map<string, HTMLCanvasElement>();
function cachedS(key: string, f: () => HTMLCanvasElement) { let c = small.get(key); if (!c) { c = f(); small.set(key, c); if (small.size > 400) { const k = small.keys().next().value; if (k !== undefined) small.delete(k); } } return c; }
const WA = R.water, SA = R.sand, BRS = R.brass, WD = R.wood;
/** a rounded-rect ring index (2 px rounded corners), -1 outside */
function rr(x: number, y: number, w: number, h: number, r = 2) {
  const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
  if (r >= 2 && ((dx === 0 && dy < 2) || (dy === 0 && dx < 2))) return -1;
  if (r >= 1 && dx === 0 && dy === 0) return -1;
  if (r >= 2 && dx === 1 && dy === 1) return 0;
  return Math.min(dx, dy);
}
/** a dark-water cubby into px at (x, y) s x s: ink rim, a wooden lip (shaded top / left, lit bottom / right), water, glint, sand */
function cubby(px: Px, x: number, y: number, s: number, o: { brass?: boolean; lit?: number } = {}) {
  const lit = o.lit ?? 0, rim = o.brass ? BRS : WD;
  const rimW = s >= 20 ? 2 : 1;
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const r = rr(i, j, s, s, s > 12 ? 2 : 1);
    if (r < 0) continue;
    const X = x + i, Y = y + j;
    if (r === 0) { px.set(X, Y, INK); continue; }
    if (r <= rimW) {
      const tl = j < s / 2 ? i <= j || i < s - 1 - j : i < s - 1 - j;
      const g = ((i * 3 + j * 5) % 11) < 2;
      px.set(X, Y, rim[Math.max(0, Math.min(rim.length - 1, (tl ? (r === 1 ? 2 : 3) : r === 1 ? 6 : 5) + lit - (g ? 1 : 0)))]);
      continue;
    }
    const fj = j - rimW - 1, fh = s - 2 * rimW - 2;
    let c: C = WA[Math.min(9, (fj < fh * 0.45 ? 5 : 4) + lit)];
    if (r === rimW + 1 && (j <= rimW + 1 || i <= rimW + 1)) c = WA[1];
    else if (r === rimW + 2 && (j <= rimW + 2 || i <= rimW + 2)) c = WA[2 + lit];
    if (s >= 14 && i + j === rimW * 2 + 6 && j < s * 0.55) c = WA[7 + Math.min(1, lit)];
    if (s >= 14 && i + j === rimW * 2 + 8 && j < s * 0.45) c = WA[6 + Math.min(1, lit)];
    if (s >= 18 && j >= s - rimW - 4) {
      const cr = s - rimW - 4 + (Math.sin(i * 0.8 + s) > 0.2 ? 1 : 0);
      if (j === cr) c = SA[3]; else if (j > cr) c = (i * 2 + j) % 7 === 0 ? SA[1] : SA[2];
    }
    if (o.brass) c = [Math.min(255, c[0] + 22), Math.min(255, c[1] + 12), c[2]];
    px.set(X, Y, c);
  }
}

export type RowState = 'off' | 'hover' | 'sel';
/** a list row (see above); `cubby` = the icon cubby's size (0: none), placed 2 px in from the left / top */
export function rowArt(w: number, h: number, state: RowState, seed = 0, cubbyS = 0): HTMLCanvasElement {
  w = Math.max(16, Math.round(w)); h = Math.max(8, Math.round(h));
  const sd = ((seed % 4) + 4) % 4;
  return cachedS(`row|${w}|${h}|${state}|${sd}|${cubbyS}`, () => {
    const px = new Px(w, h);
    const D = state === 'sel' ? ramp('#120a08', '#26140c', '#3a2210', '#4e3016', '#62401e', '#78522a', '#906838', '#ac844c', '#c8a468')
      : state === 'hover' ? ramp('#0e1414', '#1a2422', '#26332f', '#33433d', '#41534b', '#52645a', '#66786c', '#7e9282', '#9cae9c')
        : ramp('#0c0a08', '#18140f', '#241e17', '#30281f', '#3c3328', '#4a3f32', '#5a4d3d', '#6e5f4b', '#88765e');
    band(px, 1, 1, w - 2, h - 2, true, D, 40 + sd * 7, { lit: -1 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = rr(x, y, w, h);
      if (r < 0) { px.set(x, y, INK, 0); continue; }
      if (r === 0) { px.set(x, y, INK); continue; }
      if (r === 1) {
        const tl = y === 1 || x === 1;
        if (state === 'sel') px.set(x, y, BRS[tl ? 6 : 2]);
        else if (state === 'hover') px.set(x, y, tl ? R.paint[6] : R.paint[2]);
        else px.set(x, y, D[tl ? 7 : 1]);
      }
    }
    if (cubbyS > 0) cubby(px, 2, 2, cubbyS, { brass: state === 'sel', lit: state === 'hover' ? 1 : 0 });
    // a nail at the right end; a little sea life on some rows
    nail(px, w - 6, Math.floor(h / 2) - 1, 1);
    if (sd === 1) stamp(px, SPR.barnacleS, w - 12, h - 4, { onlyOn: true });
    if (sd === 3) algae(px, w * 0.62, h - 2, 6, 1.6, 2 + seed, { inside: (X, Y) => rr(X, Y, w, h) >= 1 });
    return px.done();
  });
}

/** a wooden (or brass) cubby for one item, s px square; state hover lightens it; gem: a rarity gem in the corner */
export function cellArt(s: number, state: 'off' | 'hover' | 'on' = 'off', gem?: string): HTMLCanvasElement {
  s = Math.max(8, Math.round(s));
  return cachedS(`cell|${s}|${state}|${gem ?? ''}`, () => {
    const px = new Px(s, s);
    cubby(px, 0, 0, s, { brass: state === 'on', lit: state === 'hover' ? 1 : 0 });
    if (gem) {
      const g = hx(gem), dk: C = [g[0] * 0.45, g[1] * 0.45, g[2] * 0.5].map(Math.round) as C, lt: C = g.map((v) => Math.round(v + (255 - v) * 0.6)) as C;
      const gx = s - 6, gy = s - 6;
      for (const [i, j, c] of [[1, 0, INK], [2, 0, INK], [0, 1, INK], [3, 1, INK], [0, 2, INK], [3, 2, INK], [1, 3, INK], [2, 3, INK], [1, 1, lt], [2, 1, g], [1, 2, g], [2, 2, dk]] as [number, number, C][]) px.set(gx + i, gy + j, c);
      px.shade(gx + 4, gy + 2, 0.6); px.shade(gx + 3, gy + 3, 0.6); px.shade(gx + 2, gy + 4, 0.6);
    }
    return px.done();
  });
}

/** a wardrobe drawer, w x h: a grey-green plank rim, a teal kelp-paper bed with fibres, a lit front lip, brass brackets */
export function drawerArt(w: number, h: number): HTMLCanvasElement {
  w = Math.max(20, Math.round(w)); h = Math.max(12, Math.round(h));
  return cachedS(`drawer|${w}|${h}`, () => {
    const px = new Px(w, h);
    lining(px, 2, 2, w - 4, h - 6, 'teal');
    band(px, 1, h - 4, w - 2, 3, true, PALE, 77, { lit: 1 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = rr(x, y, w, h);
      if (r < 0) continue;
      if (r === 0) { px.set(x, y, INK); continue; }
      if (r === 1 && y < h - 4) px.set(x, y, y === 1 || x === 1 ? PALE[2] : PALE[5]);
    }
    for (let x = 2; x < w - 2; x++) px.set(x, h - 5, INK);
    // brass corner brackets at the top
    for (const [bx, fx] of [[2, 1], [w - 3, -1]] as const) {
      for (let i = 0; i < 4; i++) { px.set(bx + i * fx, 2, BRS[i === 0 ? 6 : 4]); px.set(bx, 2 + i, BRS[i === 0 ? 6 : 3]); }
      px.set(bx + fx, 3, BRS[2]); px.shade(bx + 4 * fx, 3, 0.6);
    }
    return px.done();
  });
}

const NV = ramp('#070b1c', '#0d1430', '#141c3c', '#1c2650', '#2a3664', '#3e4c84', '#5a6aa8');
/** a velvet medal cushion with a brass hook at its top; hover: a paler cushion; on: framed in brass with rivets */
export function cushionArt(w: number, h: number, state: 'off' | 'hover' | 'on'): HTMLCanvasElement {
  w = Math.max(12, Math.round(w)); h = Math.max(12, Math.round(h));
  return cachedS(`cush|${w}|${h}|${state}`, () => {
    const px = new Px(w, h);
    const lit = state === 'off' ? 0 : 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = rr(x, y, w, h);
      if (r < 0) continue;
      if (state === 'on' && r <= 2) {
        const tl = y < h / 2 ? x <= y || x < w - 1 - y : x < w - 1 - y;
        px.set(x, y, r === 0 ? INK : r === 1 ? BRS[tl ? 6 : 2] : BRS[tl ? 4 : 3]);
        continue;
      }
      if (r === 0) { px.set(x, y, NV[0]); continue; }
      // the velvet: a soft pile, lit at the top, a seam of buttons tufting it
      const k = y / h;
      let t = (k < 0.18 ? 4 : k < 0.6 ? 3 : 2) + lit;
      if (r === 1 && (y === 1 || x === 1)) t = 5 + lit; else if (r === 1) t = 1;
      if (y === Math.round(h * 0.68) && x > 3 && x < w - 4 && x % 6 === 3) t = 1;
      px.set(x, y, NV[Math.max(0, Math.min(6, t))]);
    }
    if (state === 'on') for (const [x, y] of [[2, 2], [w - 5, 2], [2, h - 5], [w - 5, h - 5]]) rivet(px, x, y);
    // the brass hook the medal hangs on
    const cx = Math.floor(w / 2);
    for (const [dx, dy, t] of [[-1, 1, 6], [0, 1, 5], [1, 1, 3], [-1, 2, 5], [1, 2, 2], [-1, 3, 4], [0, 3, 3], [1, 3, 2]] as const) px.set(cx + dx, dy + (state === 'on' ? 2 : 0), BRS[t]);
    px.shade(cx + 2, state === 'on' ? 4 : 2, 0.6); px.shade(cx + 2, state === 'on' ? 5 : 3, 0.6);
    return px.done();
  });
}

/** a brass-bezelled navy velvet card with rivets at its corners and an engraved line inside the bezel */
export function plateArt(w: number, h: number): HTMLCanvasElement {
  w = Math.max(16, Math.round(w)); h = Math.max(16, Math.round(h));
  return cachedS(`plate|${w}|${h}`, () => {
    const px = new Px(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = rr(x, y, w, h);
      if (r < 0) continue;
      const tl = y < h / 2 ? x <= y || x < w - 1 - y : x < w - 1 - y;
      if (r === 0) { px.set(x, y, INK); continue; }
      if (r === 1) { px.set(x, y, BRS[tl ? 7 : 2]); continue; }
      if (r === 2) { px.set(x, y, BRS[tl ? 5 : 3]); continue; }
      if (r === 3) { px.set(x, y, BRS[tl ? 1 : 6]); continue; }
      if (r === 4) { px.set(x, y, INK); continue; }
      const k = (y - 5) / (h - 10);
      let t = k < 0.08 ? 1 : k < 0.3 ? 3 : 2;
      if (x === 5 || y === 5) t = 1;
      if (r === 6 && x > 6 && y > 6) t = 3;
      px.set(x, y, NV[t]);
    }
    for (const [x, y] of [[1, 1], [w - 4, 1], [1, h - 4], [w - 4, h - 4]]) rivet(px, x, y);
    px.set(3, h - 4, R.verd[2]); px.set(w - 3, h - 5, R.verd[1]);
    return px.done();
  });
}

/** the item display window, s px square (drawn 1 px outside the content box): see above */
export function windowArt(s: number): HTMLCanvasElement {
  s = Math.max(16, Math.round(s));
  return cachedS(`win|${s}`, () => {
    const px = new Px(s, s);
    const B = 4; // ink + 3 px of brass
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const r = rr(x, y, s, s, 1);
      if (r < 0) continue;
      const tl = y < s / 2 ? x <= y || x < s - 1 - y : x < s - 1 - y;
      if (r === 0) { px.set(x, y, INK); continue; }
      if (r === 1) { px.set(x, y, BRS[tl ? (y === 1 && x < s * 0.5 ? 7 : 6) : 2]); continue; }
      if (r === 2) { px.set(x, y, tl ? BRS[1] : BRS[6]); continue; }          // the engraved line: dark, lit below
      if (r === 3) { px.set(x, y, BRS[tl ? 2 : 4]); continue; }
      if (r === B) { px.set(x, y, INK); continue; }
      // the back wall: dark water, deeper at the top, two light shafts, a glass streak
      const ix = x - B - 1, iy = y - B - 1, IW = s - 2 * B - 2, IH = IW;
      const k = iy / IH;
      let t = k < 0.25 ? 2 : k < 0.55 ? 3 : 4;
      for (const [fx, wd] of [[0.28, 0.12], [0.62, 0.08]]) { const c = fx * IW + iy * 0.35; if (Math.abs(ix - c) < wd * IW * (1 - k * 0.6) && k < 0.75) { t += 1; break; } }
      if (ix + iy === Math.round(IW * 0.12) && k < 0.4) t = 7;
      if (iy < 2 || ix < 1) t = 1;
      let c: C = WA[t];
      // the sand mound the model stands on
      const my = IH * 0.78, mrx = IW * 0.4, mry = Math.max(3, IH * 0.12);
      const e = ((ix - IW / 2) / mrx) ** 2 + ((iy - my) / mry) ** 2;
      const floor = iy > my + mry * 0.4 + Math.sin(ix * 0.4) * 0.8;
      if (e <= 1 || floor) {
        const SW = SA.map((q) => [Math.round(q[0] * 0.7 + WA[4][0] * 0.3), Math.round(q[1] * 0.7 + WA[4][1] * 0.3), Math.round(q[2] * 0.7 + WA[4][2] * 0.3)] as C);
        const top = e <= 1 && e > 0.72 && iy < my;
        c = top ? SW[5] : e <= 1 ? (iy < my ? SW[4] : SW[3]) : (ix * 2 + iy) % 9 === 0 ? SW[1] : SW[2];
      }
      px.set(x, y, c);
    }
    // rivets in the bezel's corners, verdigris beside them
    for (const [x, y] of [[0, 0], [s - 3, 0], [0, s - 3], [s - 3, s - 3]]) rivet(px, x, y);
    px.set(2, s - 5, R.verd[2]); px.set(s - 5, s - 2, R.verd[1]);
    return px.done();
  });
}

/** the empty sea chest: an open chest on the sand with nothing in it but a little water, a sea star, kelp (~132 x 70) */
export function emptyChestArt(): HTMLCanvasElement {
  return cachedS('emptyChest', () => {
    const W = 132, H = 70, px = new Px(W, H);
    // a soft light pool on the sand (no alpha noise: two flat steps)
    for (let y = 48; y < H; y++) for (let x = 0; x < W; x++) {
      const e = ((x - W / 2) / 64) ** 2 + ((y - 60) / 12) ** 2;
      if (e > 1) continue;
      const cr = 50 + Math.round(Math.sin(x / 13) * 1.2);
      if (y < cr) continue;
      const p = (y + Math.round(Math.sin(x / 9) * 1.4) + 60) % 6;
      let c = e < 0.45 ? SA[3] : SA[2];
      if (p === 0) c = e < 0.45 ? SA[2] : SA[1]; else if (p === 1) c = e < 0.45 ? SA[4] : SA[3];
      if (y === cr) c = e < 0.45 ? SA[5] : SA[4];
      px.set(x, y, c, e > 0.82 ? 150 : 255);
    }
    // the chest's shadow on the sand
    for (let y = 56; y < 63; y++) for (let x = 34; x < 100; x++) { const e = ((x - 66) / 34) ** 2 + ((y - 59) / 3.5) ** 2; if (e < 1) px.shade(x, y, 0.55); }
    // the open lid, tipped back: its inside (dark planks) between iron bands
    const X0 = 42, X1 = 90, LT = 14, LB = 33;
    for (let y = LT; y < LB; y++) {
      const inset = Math.round((LB - y) * 0.18);
      for (let x = X0 + inset; x < X1 - inset; x++) {
        const edge = x === X0 + inset || x === X1 - inset - 1 || y === LT;
        const pl = Math.floor((y - LT) / 5), gr = ((x + pl * 7) % 13) < 2 && (y - LT) % 5 === 2;
        px.set(x, y, edge ? INK : (y - LT) % 5 === 0 ? TIMBER[1] : gr ? TIMBER[1] : y === LT + 1 ? TIMBER[4] : TIMBER[pl % 2 ? 2 : 3]);
      }
    }
    for (const bx of [X0 + 9, X1 - 11]) for (let y = LT + 1; y < LB; y++) { const inset = Math.round((LB - y) * 0.18); const xx = bx + (bx < 66 ? inset : -inset); px.set(xx, y, R.iron[3]); px.set(xx + 1, y, R.iron[2]); px.set(xx + 2, y, R.iron[1]); }
    // the body: planks, iron bands with rivets, a brass lock plate hanging open
    const BT = 33, BB = 57, B0 = 38, B1 = 94;
    band(px, B0 + 1, BT + 4, B1 - B0 - 2, BB - BT - 5, true, TIMBER, 12, { lit: 0 });
    for (let y = BT; y < BB; y++) for (let x = B0; x < B1; x++) {
      const out = x === B0 || x === B1 - 1 || y === BB - 1 || y === BT;
      if (out) { px.set(x, y, INK); continue; }
      if (y < BT + 4) px.set(x, y, y === BT + 1 ? WA[1] : WA[0]);                     // the empty dark inside
    }
    for (let x = B0 + 1; x < B1 - 1; x++) { px.set(x, BT + 4, TIMBER[7]); px.set(x, BT + 3, TIMBER[2]); }
    for (const bx of [B0 + 8, B1 - 11]) {
      for (let y = BT + 3; y < BB - 1; y++) { px.set(bx, y, INK); px.set(bx + 1, y, R.iron[4]); px.set(bx + 2, y, R.iron[3]); px.set(bx + 3, y, R.iron[2]); px.set(bx + 4, y, INK); }
      rivet(px, bx + 1, BT + 7, R.iron.concat([hx('#e0e4e8'), hx('#ffffff')])); rivet(px, bx + 1, BB - 6, R.iron.concat([hx('#e0e4e8'), hx('#ffffff')]));
    }
    const lx = 62;
    for (let y = BT + 4; y < BT + 13; y++) for (let x = lx; x < lx + 9; x++) {
      const e = x === lx || x === lx + 8 || y === BT + 4 || y === BT + 12;
      px.set(x, y, e ? INK : y === BT + 5 ? BRS[7] : x === lx + 1 ? BRS[6] : y === BT + 11 ? BRS[2] : BRS[4]);
    }
    px.set(lx + 4, BT + 8, INK); px.set(lx + 4, BT + 9, INK); px.set(lx + 3, BT + 9, INK);
    // sea life: barnacles on the body, algae along its foot, a sea star and a kelp blade on the sand
    stamp(px, SPR.barnacleM, B0 + 2, BB - 6, { onlyOn: true }); stamp(px, SPR.barnacleS, B0 + 6, BB - 4, { onlyOn: true });
    algae(px, 66, BB - 2, 18, 2, 3.1, { inside: (x, y) => x > B0 && x < B1 - 1 && y < BB - 1 && y > BT + 4 });
    coralline(px, B1 - 4, BT + 14, 2, 4, 9, { inside: (x, y) => x > B0 && x < B1 - 1 && y < BB - 1 });
    stamp(px, SPR.star, 104, 54);
    stamp(px, SPR.scallop, 18, 55);
    kelpBlade(px, bladePath(26, 54, 0.1, -1, 34, 1.6, 0.8), 4, { free: true });
    kelpBlade(px, bladePath(31, 55, 0.25, -1, 22, 1.2, 2.1), 3, { free: true });
    holdfast(px, 27, 55, 1, { free: true });
    grass(px, 112, 59, 4, 5, 8, { free: true });
    return px.done();
  });
}
