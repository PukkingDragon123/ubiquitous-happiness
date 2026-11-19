// v5 home panel frames, each with the material of the thing you opened (flat tones; every detail is a placed shape:
// plank seams, grain lines on a fixed rhythm, knots, iron straps and rivets, lacquer bevels, gold trim, velvet pleats;
// never random noise):
//
//   panelArt('chest', w, h)      the SEA CHEST: red-brown planks, iron corner straps and rivets, a quilted velvet lining
//   panelArt('bench', w, h)      the WORKBENCH: an oak top with long grain, knots, tool nicks and iron brackets
//   panelArt('wardrobe', w, h)   the WARDROBE: a green-black lacquered door, gold trim, bevelled panels, rosettes
//   panelArt('trophy', w, h)     the TROPHY CASE: a brass frame round a navy velvet back with pleats
//   PANEL_IN[kind]               the inner content rect insets [l, t, r, b]
//   wellArt(w, h, tone)          a recessed well for lists / details inside those panels
import { K } from './itemCard';

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
/** a deterministic 0..1 for placing details (a hash, used to pick from fixed rhythms, not as noise) */
const hsh = (a: number, b: number) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
function rivet(f: Fill, x: number, y: number, pal = { o: '#1a1418', d: '#4a4a54', b: '#8a8a96', l: '#d8d8e0' }) { f(x - 1, y - 1, 4, 4, pal.o); f(x, y, 3, 3, pal.d); f(x, y, 2, 2, pal.b); f(x, y, 1, 1, pal.l); }
const brassRivet = (f: Fill, x: number, y: number) => rivet(f, x, y, { o: '#2e1404', d: '#8a5a14', b: '#d8a038', l: '#fffbe0' });

/** wooden planks running along an edge band: seams every `pl` px, two grain lines per plank, a knot now and then */
function planks(f: Fill, x0: number, y0: number, w: number, h: number, horiz: boolean, R: string[], seed: number, pl = 34) {
  // R: [outline, dark, mid-dark, base, light, highlight]
  f(x0, y0, w, h, R[3]);
  const L = horiz ? w : h, T = horiz ? h : w;
  const at = (u: number, v: number, ww: number, hh: number, c: string) => horiz ? f(x0 + u, y0 + v, ww, hh, c) : f(x0 + v, y0 + u, hh, ww, c);
  let u = 0, k = 0;
  while (u < L) {
    const len = Math.min(L - u, pl + Math.round(hsh(seed, k) * 18) - 9);
    // grain: two long lines at fixed depths, broken where the line "dives"
    for (const [v, c] of [[Math.round(T * 0.3), R[2]], [Math.round(T * 0.68), R[4]]] as [number, string][]) {
      if (v <= 0 || v >= T - 1) continue;
      for (let i = 2; i < len - 2; i++) if ((i + k * 5) % 13 < 9) at(u + i, v + (((i + k) >> 4) & 1), 1, 1, c);
    }
    // a knot on some planks
    if (hsh(k, seed + 7) > 0.55 && len > 16 && T >= 6) { const kx = u + 6 + Math.round(hsh(seed, k + 3) * (len - 12)), kv = Math.round(T / 2) - 1; at(kx - 2, kv, 5, 2, R[1]); at(kx - 1, kv, 3, 2, R[2]); at(kx, kv, 1, 1, R[0]); at(kx + 3, kv, 1, 1, R[4]); }
    // the seam: a dark line and the next plank's lit lip
    if (u + len < L) { at(u + len - 1, 0, 1, T, R[1]); at(u + len, 0, 1, T, R[4]); }
    u += len; k++;
  }
}

/** the frame of a panel of a kind, exactly w x h */
export function panelArt(kind: PanelKind, w: number, h: number): HTMLCanvasElement {
  w = Math.max(40, Math.round(w)); h = Math.max(40, Math.round(h));
  return cached(`${kind}|${w}|${h}`, () => {
    const [cv, f] = make(w, h);
    const [il, it, ir, ib] = PANEL_IN[kind];
    const ix = il, iy = it, iw = w - il - ir, ih = h - it - ib;
    if (kind === 'chest' || kind === 'bench') {
      const R = kind === 'chest' ? ['#1a0806', '#3a1410', '#5a2018', '#7a2e20', '#9a4430', '#c06a48'] : ['#1a0e06', '#3e2812', '#5e3e1e', '#7e5630', '#a07444', '#c8985e'];
      f(0, 0, w, h, R[0]);
      // top / bottom bands run across, the sides run down (mitred at the corners by drawing order)
      planks(f, 1, 1, w - 2, it - 1, true, R, kind === 'chest' ? 3 : 11);
      planks(f, 1, h - ib, w - 2, ib - 1, true, R, kind === 'chest' ? 5 : 13);
      planks(f, 1, it, il - 1, h - it - ib, false, R, 17);
      planks(f, w - ir, it, ir - 1, h - it - ib, false, R, 19);
      f(1, 1, w - 2, 1, R[5]); f(1, 1, 1, h - 2, R[4]); f(1, h - 2, w - 2, 1, R[1]); f(w - 2, 1, 1, h - 2, R[1]);
      if (kind === 'chest') {
        // iron straps over the corners and down the sides, riveted
        const I = { o: '#14141a', d: '#2e2e36', b: '#4e4e5a', l: '#8a8a98' };
        for (const sx of [Math.round(w * 0.25), Math.round(w * 0.75)]) for (const [sy, sh] of [[0, it], [h - ib, ib]]) {
          f(sx - 4, sy, 9, sh, I.o); f(sx - 3, sy + 1, 7, sh - 2, I.b); f(sx - 3, sy + 1, 1, sh - 2, I.l); f(sx + 3, sy + 1, 1, sh - 2, I.d);
          rivet(f, sx - 1, sy + Math.round(sh / 2) - 1);
        }
        for (const [cx, cy, dx, dy] of [[1, 1, 1, 1], [w - 2, 1, -1, 1], [1, h - 2, 1, -1], [w - 2, h - 2, -1, -1]]) {
          for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
            if (i > 4 && j > 4) continue;
            const edge = i === 13 || j === 13 || (i === 4 && j > 4) || (j === 4 && i > 4);
            f(cx + dx * i, cy + dy * j, 1, 1, edge ? I.o : i + j < 3 ? I.l : I.b);
          }
          rivet(f, cx + dx * 2 - (dx < 0 ? 2 : 0), cy + dy * 2 - (dy < 0 ? 2 : 0));
        }
      } else {
        // the bench top: tool nicks along the front edge, iron brackets at the corners
        for (let i = 0; i < 6; i++) { const nx = Math.round(w * (0.12 + i * 0.15)), ny = h - ib + 3; f(nx, ny, 3, 1, R[1]); f(nx + 1, ny + 1, 2, 1, R[4]); }
        const I = { o: '#14141a', d: '#2e2e36', b: '#5a5a66', l: '#9a9aa8' };
        for (const [cx, cy, dx, dy] of [[2, 2, 1, 1], [w - 3, 2, -1, 1], [2, h - 3, 1, -1], [w - 3, h - 3, -1, -1]]) {
          for (let i = 0; i < 11; i++) { f(cx + dx * i, cy, 1, 1, I.b); f(cx, cy + dy * i, 1, 1, I.b); f(cx + dx * i, cy + dy, 1, 1, I.d); f(cx + dx, cy + dy * i, 1, 1, I.d); }
          f(cx, cy, 1, 1, I.l);
          rivet(f, cx + dx * 6 - (dx < 0 ? 2 : 0), cy + dy * 1 - (dy < 0 ? 2 : 0), I);
        }
      }
      // the inner well
      f(ix - 2, iy - 2, iw + 4, ih + 4, R[0]);
      f(ix - 1, iy + ih, iw + 2, 1, R[5]);
      if (kind === 'chest') {
        // a quilted velvet lining: diamond stitch lines with a button at each crossing
        const V = { d: '#240c10', b: '#30121a', l: '#3e1a22', st: '#5a2a30', bt: '#c8913a' };
        f(ix - 1, iy - 1, iw + 2, ih + 2, V.b);
        const P = 22;
        for (let yy = 0; yy < ih; yy++) for (let xx = 0; xx < iw; xx++) {
          const a = (xx + yy) % P, b = (xx - yy + 4 * P) % P;
          if (a === 0 || b === 0) f(ix + xx, iy + yy, 1, 1, V.st);
          else if (a === 1 || b === 1) f(ix + xx, iy + yy, 1, 1, V.l);
        }
        for (let yy = 0; yy <= ih; yy += P) for (let xx = (yy / P) % 2 ? P / 2 : 0; xx <= iw; xx += P) if (yy > 0 && yy < ih && xx > 0 && xx < iw) { f(ix + xx - 1, iy + yy - 1, 3, 3, V.d); f(ix + xx - 1, iy + yy - 1, 2, 2, V.bt); }
        f(ix - 1, iy - 1, iw + 2, 2, V.d);
      } else {
        // a dark leather work mat, stitched round its edge
        f(ix - 1, iy - 1, iw + 2, ih + 2, '#1c2226');
        f(ix - 1, iy - 1, iw + 2, 2, '#121619');
        for (let i = 3; i < iw - 3; i += 4) { f(ix + i, iy + 2, 2, 1, '#4a5258'); f(ix + i, iy + ih - 3, 2, 1, '#4a5258'); }
        for (let i = 3; i < ih - 3; i += 4) { f(ix + 2, iy + i, 1, 2, '#4a5258'); f(ix + iw - 3, iy + i, 1, 2, '#4a5258'); }
      }
    } else if (kind === 'wardrobe') {
      // a green-black lacquered door: bevelled frame, a gold trim line, rosettes in the corners
      const L = { o: '#060c0a', d: '#0e1a16', b: '#16281f', m: '#1f3a2c', l: '#2c5040', h: '#4a7a60' };
      f(0, 0, w, h, L.o);
      f(1, 1, w - 2, h - 2, L.b);
      f(1, 1, w - 2, 1, L.h); f(1, 1, 1, h - 2, L.l); f(1, h - 2, w - 2, 1, L.d); f(w - 2, 1, 1, h - 2, L.d);
      // a long lacquer highlight streak along the top rail (a placed reflection)
      for (let i = 0; i < w * 0.4; i++) f(Math.round(w * 0.1) + i, 4, 1, 1, i % 9 < 6 ? L.l : L.m);
      // the gold trim, 4 px in, with its corner rosettes
      const G = [K.brass0, K.brass1, K.brass2];
      f(5, 5, w - 10, 1, G[1]); f(5, h - 6, w - 10, 1, G[0]); f(5, 5, 1, h - 10, G[1]); f(w - 6, 5, 1, h - 10, G[0]);
      for (const [cx, cy] of [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]]) { f(cx - 2, cy - 2, 5, 5, L.o); f(cx - 1, cy - 2, 3, 5, G[1]); f(cx - 2, cy - 1, 5, 3, G[1]); f(cx, cy, 1, 1, G[2]); f(cx - 1, cy - 1, 1, 1, K.brassW); }
      // the inner panel: bevelled (lit bottom-right edge, dark top-left: it is recessed)
      f(ix - 3, iy - 3, iw + 6, ih + 6, L.o);
      f(ix - 2, iy - 2, iw + 4, ih + 4, L.d);
      f(ix - 2, iy + ih + 1, iw + 4, 1, L.l); f(ix + iw + 1, iy - 2, 1, ih + 4, L.l);
      f(ix - 1, iy - 1, iw + 2, ih + 2, '#0c1814');
    } else {
      // the trophy case: a polished brass frame round a navy velvet back with vertical pleats
      const B = ['#2e1404', '#5a3208', '#8a5a14', '#c8913a', '#e8b860', '#fff1c2'];
      f(0, 0, w, h, B[0]);
      for (let i = 1; i < 9; i++) { const c = i === 1 ? B[5] : i === 2 ? B[4] : i < 5 ? B[3] : i < 7 ? B[2] : B[1]; f(i, i, w - i * 2, 1, c); f(i, i, 1, h - i * 2, c); }
      for (let i = 1; i < 9; i++) { const c = i < 3 ? B[1] : i < 6 ? B[2] : B[3]; f(i, h - 1 - i, w - i * 2, 1, c); f(w - 1 - i, i, 1, h - i * 2, c); }
      f(9, 9, w - 18, h - 18, B[2]);
      // engraved line and corner screws
      f(4, 4, w - 8, 1, B[2]); f(4, h - 5, w - 8, 1, B[1]);
      for (const [cx, cy] of [[3, 3], [w - 6, 3], [3, h - 6], [w - 6, h - 6]]) brassRivet(f, cx, cy);
      const N = { d: '#0c0f26', b: '#141a3c', p: '#1b2350', l: '#24306a' };
      f(ix - 2, iy - 2, iw + 4, ih + 4, B[0]);
      f(ix - 1, iy - 1, iw + 2, ih + 2, N.b);
      for (let xx = 6; xx < iw; xx += 12) { f(ix + xx, iy, 1, ih, N.p); f(ix + xx + 1, iy, 1, ih, N.l); f(ix + xx - 1, iy, 1, ih, N.d); }
      f(ix - 1, iy - 1, iw + 2, 3, N.d);
    }
    return cv;
  });
}

/** a recessed well inside a panel (lists, the detail pane): dark, with a lit bottom lip */
export function wellArt(w: number, h: number, tone: 'dark' | 'paper' = 'dark'): HTMLCanvasElement {
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  return cached(`well|${tone}|${w}|${h}`, () => {
    const [cv, f] = make(w, h);
    if (tone === 'paper') {
      // a cream card with fibre lines on a fixed rhythm, a fold crease and a tacked corner
      f(0, 0, w, h, '#6a5434'); f(1, 1, w - 2, h - 2, '#efe2c0');
      f(1, 1, w - 2, 1, '#fffaf0'); f(1, h - 2, w - 2, 1, '#d6c49a');
      for (let yy = 6; yy < h - 4; yy += 5) for (let xx = 4; xx < w - 4; xx++) if ((xx * 7 + yy * 3) % 23 < 6) f(xx, yy, 1, 1, '#e6d6b0');
      const fx = Math.round(w * 0.62); for (let yy = 2; yy < h - 2; yy++) f(fx, yy, 1, 1, '#e0cfa6');
      f(w - 7, 2, 4, 4, '#5a3a10'); f(w - 6, 3, 2, 2, '#c8913a'); f(w - 6, 3, 1, 1, '#fff1c2');
    } else {
      f(0, 0, w, h, '#05090c'); f(1, 1, w - 2, h - 2, '#0f2228');
      f(1, 1, w - 2, 2, '#081418'); f(1, 1, 1, h - 2, '#0a181c');
      f(1, h - 2, w - 2, 1, '#1d3c42');
    }
    return cv;
  });
}
