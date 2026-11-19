// v5 home panel frames ("ocean, woody"): every frame is weathered DRIFTWOOD (ship planks, chunky grain, split ends,
// nail heads), lashed with rope at the corners, with barnacles and a shell grown on, around an inner suited to the
// thing you opened. Flat tones; every detail is a placed shape (never noise):
//
//   panelArt('chest', w, h)      the SEA CHEST: warm ship timber, rusty iron straps, a dark sailcloth lining
//   panelArt('bench', w, h)      the WORKBENCH: thick driftwood, tool nicks, a dark leather work mat
//   panelArt('wardrobe', w, h)   the WARDROBE: pale driftwood with sea-glass knobs set in the top rail
//   panelArt('trophy', w, h)     the TROPHY CASE: driftwood round a navy back strung with fishing net
//   PANEL_IN[kind]               the inner content rect insets [l, t, r, b]
//   wellArt(w, h, tone)          a recessed well (dark) or a driftwood plaque (plank) inside / beside them
// Animated life (bubbles, swaying kelp, caustics) is drawn per frame on top by the panels (seaFx.ts).

export type PanelKind = 'chest' | 'bench' | 'wardrobe' | 'trophy';
export const PANEL_IN: Record<PanelKind, [number, number, number, number]> = { chest: [12, 22, 12, 12], bench: [12, 22, 12, 12], wardrobe: [11, 22, 11, 11], trophy: [12, 22, 12, 12] };

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, f: () => HTMLCanvasElement) { let c = cache.get(key); if (!c) { c = f(); cache.set(key, c); if (cache.size > 60) { const k = cache.keys().next().value; if (k !== undefined) cache.delete(k); } } return c; }
type Fill = (x: number, y: number, w: number, h: number, c: string) => void;
function make(w: number, h: number): [HTMLCanvasElement, Fill] {
  const cv = document.createElement('canvas'); cv.width = Math.max(1, w); cv.height = Math.max(1, h);
  const x = cv.getContext('2d')!; x.imageSmoothingEnabled = false;
  return [cv, (px, py, ww, hh, c) => { x.fillStyle = c; x.fillRect(px, py, ww, hh); }];
}
/** a deterministic 0..1 for placing details on a fixed rhythm */
const hsh = (a: number, b: number) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

/** wood ramps: [outline, dark, mid-dark, base, light, highlight] */
const DRIFT = ['#16110c', '#3a3026', '#5a4c3c', '#7c6c58', '#a09078', '#c8b89a'];
const TIMBER = ['#1a0e08', '#3e2614', '#5e3e24', '#7e5836', '#a0744a', '#c49464'];
const PALE = ['#1a1612', '#4a4236', '#6e6452', '#948870', '#b8ac90', '#ddd2b6'];

function nail(f: Fill, x: number, y: number) { f(x, y, 2, 2, '#2a2420'); f(x, y, 1, 1, '#9a948c'); }

/** planks running along an edge band: seams, chunky grain (two lines and a split), knots, nails at plank ends */
function planks(f: Fill, x0: number, y0: number, w: number, h: number, horiz: boolean, R: string[], seed: number, pl = 38) {
  f(x0, y0, w, h, R[3]);
  const L = horiz ? w : h, T = horiz ? h : w;
  const at = (u: number, v: number, ww: number, hh: number, c: string) => horiz ? f(x0 + u, y0 + v, ww, hh, c) : f(x0 + v, y0 + u, hh, ww, c);
  let u = 0, k = 0;
  while (u < L) {
    const len = Math.min(L - u, pl + Math.round(hsh(seed, k) * 20) - 10);
    // the plank's own tone (alternate planks a step lighter or darker: weathered unevenly, deliberately)
    if (k % 3 === 1) at(u, 1, len, T - 2, R[4]);
    // grain: long lines that wander a pixel, broken on a rhythm
    for (const [v, c] of [[Math.round(T * 0.28), R[2]], [Math.round(T * 0.62), R[2]], [Math.round(T * 0.45), R[5]]] as [number, string][]) {
      if (v <= 0 || v >= T - 1) continue;
      for (let i = 2; i < len - 2; i++) if ((i * 3 + k * 7 + v) % 17 < 12) at(u + i, v + (((i + k * 5) >> 3) & 1), 1, 1, c);
    }
    // a split running in from the plank's end
    if (k % 2 === 0 && len > 14) { const sv = Math.round(T * 0.5); for (let i = 0; i < Math.min(10, len / 3); i++) at(u + 1 + i, sv, 1, 1, R[1]); }
    // a knot
    if (hsh(k, seed + 7) > 0.5 && len > 18 && T >= 7) { const kx = u + 8 + Math.round(hsh(seed, k + 3) * (len - 16)), kv = Math.round(T / 2) - 1; at(kx - 2, kv - 1, 5, 4, R[1]); at(kx - 1, kv, 3, 2, R[2]); at(kx, kv, 1, 1, R[0]); at(kx - 2, kv + 3, 4, 1, R[5]); }
    // nail heads at both ends, the seam (dark line + the next plank's lit lip)
    if (T >= 6) { const a = horiz ? [u + 3, 2] : [2, u + 3]; nail(f, x0 + a[0], y0 + a[1]); const b = horiz ? [u + 3, T - 4] : [T - 4, u + 3]; nail(f, x0 + b[0], y0 + b[1]); }
    if (u + len < L) { at(u + len - 1, 0, 1, T, R[0]); at(u + len, 0, 1, T, R[5]); }
    u += len; k++;
  }
}

/** rope lashed round a corner: three diagonal wraps */
function lashing(f: Fill, cx: number, cy: number, dx: number, dy: number) {
  const C = ['#2a1e0e', '#8a6a3a', '#c8a464', '#ecd29a'];
  for (let w = 0; w < 3; w++) for (let i = 0; i < 9; i++) {
    const x = cx + dx * (2 + w * 3 + i), y = cy + dy * (9 - i + w * 0);
    f(x, y, 2, 1, i === 0 || i === 8 ? C[0] : i % 3 === 0 ? C[3] : i % 3 === 1 ? C[2] : C[1]);
  }
}
/** barnacles and a scallop shell grown on a corner (12 x 9) */
function barn(f: Fill, x: number, y: number) {
  const B = ['#2e2a24', '#7a7266', '#b8aea0', '#ece4d6'];
  const cone = (cx: number, cy: number, r: number) => { f(cx - r, cy, r * 2 + 1, r, B[0]); f(cx - r + 1, cy, r * 2 - 1, r - 1, B[2]); f(cx - r + 1, cy, r, 1, B[3]); f(cx - 1, cy, 3, 1, B[0]); };
  cone(x + 3, y + 2, 3); cone(x + 8, y + 3, 2); cone(x + 4, y + 6, 2);
  f(x + 9, y + 6, 5, 3, '#6e3e3a'); f(x + 10, y + 5, 3, 1, '#6e3e3a'); f(x + 10, y + 6, 3, 2, '#f0b8a0'); f(x + 11, y + 6, 1, 2, '#c08070');
}

/** the frame of a panel of a kind, exactly w x h */
export function panelArt(kind: PanelKind, w: number, h: number): HTMLCanvasElement {
  w = Math.max(40, Math.round(w)); h = Math.max(40, Math.round(h));
  return cached(`${kind}|${w}|${h}`, () => {
    const [cv, f] = make(w, h);
    const [il, it, ir, ib] = PANEL_IN[kind];
    const ix = il, iy = it, iw = w - il - ir, ih = h - it - ib;
    const R = kind === 'chest' ? TIMBER : kind === 'wardrobe' ? PALE : DRIFT;
    f(0, 0, w, h, R[0]);
    planks(f, 1, 1, w - 2, it - 1, true, R, kind.length * 3);
    planks(f, 1, h - ib, w - 2, ib - 1, true, R, kind.length * 5);
    planks(f, 1, it, il - 1, h - it - ib, false, R, 17);
    planks(f, w - ir, it, ir - 1, h - it - ib, false, R, 19);
    f(1, 1, w - 2, 1, R[5]); f(1, 1, 1, h - 2, R[4]); f(1, h - 2, w - 2, 1, R[1]); f(w - 2, 1, 1, h - 2, R[1]);
    // the inner well, sunk into the frame (a dark lip on top, a lit lip below)
    f(ix - 2, iy - 2, iw + 4, ih + 4, R[0]);
    f(ix - 1, iy + ih, iw + 2, 1, R[4]);
    if (kind === 'chest') {
      // rusty iron straps over the bands, riveted; a dark sailcloth lining with stitched seams
      const I = ['#1a1210', '#4a2e22', '#7a4a34', '#a8705a'];
      for (const sx of [Math.round(w * 0.25), Math.round(w * 0.75)]) for (const [sy, sh] of [[0, it], [h - ib, ib]]) {
        f(sx - 4, sy, 9, sh, I[0]); f(sx - 3, sy + 1, 7, sh - 2, I[2]); f(sx - 3, sy + 1, 1, sh - 2, I[3]); f(sx + 3, sy + 1, 1, sh - 2, I[1]);
        f(sx - 1, sy + Math.round(sh / 2) - 1, 3, 3, I[0]); f(sx - 1, sy + Math.round(sh / 2) - 1, 2, 2, I[3]);
      }
      f(ix - 1, iy - 1, iw + 2, ih + 2, '#18262a');
      for (let yy = 22; yy < ih - 4; yy += 46) for (let xx = 4; xx < iw - 4; xx += 3) f(ix + xx, iy + yy, 2, 1, '#26383c');
      f(ix - 1, iy - 1, iw + 2, 2, '#0e171a');
    } else if (kind === 'bench') {
      // tool nicks along the front edge; a dark leather work mat, stitched round its edge
      for (let i = 0; i < 6; i++) { const nx = Math.round(w * (0.12 + i * 0.15)), ny = h - ib + 4; f(nx, ny, 3, 1, R[1]); f(nx + 1, ny + 1, 2, 1, R[5]); }
      f(ix - 1, iy - 1, iw + 2, ih + 2, '#1c2226');
      f(ix - 1, iy - 1, iw + 2, 2, '#121619');
      for (let i = 3; i < iw - 3; i += 4) { f(ix + i, iy + 2, 2, 1, '#4a5258'); f(ix + i, iy + ih - 3, 2, 1, '#4a5258'); }
      for (let i = 3; i < ih - 3; i += 4) { f(ix + 2, iy + i, 1, 2, '#4a5258'); f(ix + iw - 3, iy + i, 1, 2, '#4a5258'); }
    } else if (kind === 'wardrobe') {
      // sea-glass knobs set into the top rail; a deep teal inner
      for (const [gx, col] of [[Math.round(w * 0.3), '#6fd0b8'], [Math.round(w * 0.5), '#8fc8ff'], [Math.round(w * 0.7), '#b8e8a0']] as [number, string][]) {
        f(gx - 3, 6, 7, 6, R[0]); f(gx - 2, 7, 5, 4, col); f(gx - 2, 7, 2, 1, '#ffffff'); f(gx + 1, 10, 2, 1, '#2a6a6a');
      }
      f(ix - 1, iy - 1, iw + 2, ih + 2, '#0e1e1e');
      f(ix - 1, iy - 1, iw + 2, 2, '#081414');
    } else {
      // a navy back strung with fishing net: diagonal cords knotted where they cross
      f(ix - 1, iy - 1, iw + 2, ih + 2, '#121838');
      const P = 16;
      for (let yy = 0; yy < ih; yy++) for (let xx = 0; xx < iw; xx++) {
        const a = (xx + yy) % P, b = (xx - yy + 8 * P) % P;
        if (a === 0 || b === 0) f(ix + xx, iy + yy, 1, 1, '#2a3460');
      }
      for (let yy = 0; yy <= ih; yy += P / 2) for (let xx = (yy / (P / 2)) % 2 ? P / 2 : 0; xx <= iw; xx += P) if (yy > 0 && yy < ih && xx > 0 && xx < iw) f(ix + xx - 1, iy + yy - 1, 2, 2, '#3e4a80');
      f(ix - 1, iy - 1, iw + 2, 2, '#0a0e24');
    }
    // rope lashed round the top corners, barnacles on a bottom corner and a shell on the other
    lashing(f, 1, 1, 1, 1); lashing(f, w - 2, 1, -1, 1);
    barn(f, 3, h - 11); barn(f, w - 17, h - 11);
    return cv;
  });
}

/** a recessed well (dark), or a driftwood plaque with rope at its top corners (plank: light text) */
export function wellArt(w: number, h: number, tone: 'dark' | 'plank' = 'dark'): HTMLCanvasElement {
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  return cached(`well|${tone}|${w}|${h}`, () => {
    const [cv, f] = make(w, h);
    if (tone === 'plank') {
      f(0, 0, w, h, DRIFT[0]);
      // three planks stacked, each grained, nailed at the ends
      const ph = Math.ceil((h - 2) / 3);
      for (let i = 0; i < 3; i++) planks(f, 1, 1 + i * ph, w - 2, Math.min(ph, h - 2 - i * ph), true, [DRIFT[0], '#2e261e', '#4a3e30', '#5e5040', '#76664e', '#9a8a6c'], 31 + i, w);
      for (let i = 1; i < 3; i++) f(1, 1 + i * ph, w - 2, 1, DRIFT[0]);
      f(1, 1, w - 2, 1, DRIFT[5]); f(1, h - 2, w - 2, 1, DRIFT[1]);
      barn(f, w - 17, h - 11);
    } else {
      f(0, 0, w, h, '#05090c'); f(1, 1, w - 2, h - 2, '#0f2228');
      f(1, 1, w - 2, 2, '#081418'); f(1, 1, 1, h - 2, '#0a181c');
      f(1, h - 2, w - 2, 1, '#1d3c42');
    }
    return cv;
  });
}
