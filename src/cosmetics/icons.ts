// Pixel icons for the cosmetics (20 x 20, clean: flat tones, a dark outline, one highlight), for the wardrobe
// panels, the achievement grid and the unlock toast.
import { Px, type RGB } from '../gfx/px';
import { SKINS } from './skins';

const S = 20;
const cache = new Map<string, HTMLCanvasElement>();
const OUT = '#0e0a14';

type Paint = (p: Px) => void;
const tri = (p: Px, pts: [number, number][], c: string | ((x: number, y: number) => RGB | null)) => p.poly(pts, c);

/** a little blobfish (side view, facing right) in a skin ramp: dark, mid, light */
function blob(p: Px, r: string[], extra?: (p: Px) => void) {
  const [d, m, l] = [r[1], r[4], r[6]];
  p.ellipse(9, 11, 7.5, 5.5, (_nx, ny) => (ny < -0.35 ? hexC(l) : ny > 0.45 ? hexC(d) : hexC(m)));
  p.ellipse(15.5, 13, 2.6, 2.4, hexC(m));                    // the droopy nose
  p.set(16, 12, l); p.set(15, 12, l);
  p.ellipse(2.5, 10, 1.6, 2.6, hexC(d));                     // tail stub
  extra?.(p);
  p.set(13, 9, '#0a0a10'); p.set(13, 8, '#0a0a10'); p.set(12, 8, '#ffffff');
}
const hexC = (c: string): RGB => { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const STRAW = ['#5a4020', '#866634', '#b08e4c', '#d4b46a', '#f2da98'];

const ICON: Record<string, Paint> = {
  // ---- hats
  kasa: (p) => { tri(p, [[1, 14], [10, 4], [19, 14]], (x, y) => hexC(STRAW[(y + (x >> 2)) % 3 === 0 ? 1 : y < 9 ? 4 : 3])); p.line(1, 14, 19, 14, '#7a3a1a'); p.line(10, 4, 10, 14, STRAW[0]); p.rect(9, 3, 3, 2, '#c8342c'); p.line(5, 15, 6, 18, '#c8342c'); p.line(15, 15, 14, 18, '#c8342c'); },
  roninKasa: (p) => { tri(p, [[1, 14], [10, 4], [19, 14]], (x, y) => hexC(y < 8 ? '#4c4c58' : (x + y) % 5 === 0 ? '#2c2c38' : '#1c1c24')); p.line(1, 14, 19, 14, '#d0342c'); p.line(1, 13, 19, 13, '#981820'); p.rect(9, 3, 3, 2, '#d0342c'); p.line(5, 15, 6, 18, '#d0342c'); p.line(15, 15, 14, 18, '#d0342c'); },
  coralCrown: (p) => { p.rect(3, 14, 14, 3, '#a85a52'); p.rect(3, 14, 14, 1, '#f0c0a0'); for (const [x, h, c] of [[4, 6, '#f07a4a'], [7, 9, '#e08aa0'], [10, 11, '#f07a4a'], [13, 9, '#e08aa0'], [16, 6, '#f07a4a']] as [number, number, string][]) { p.rect(x, 14 - h, 2, h, c); p.set(x - 1, 14 - h + 2, c); p.set(x, 14 - h - 1, '#ffe0c0'); } },
  tricorn: (p) => { tri(p, [[1, 13], [10, 9], [19, 13], [10, 17]], '#1c1c26'); p.rect(5, 6, 10, 6, '#2a2a36'); p.rect(5, 6, 10, 1, '#3c3c4c'); p.line(1, 13, 10, 17, '#f0c040'); p.line(10, 17, 19, 13, '#f0c040'); p.rect(9, 8, 2, 2, '#f4ecd8'); p.line(14, 5, 18, 2, '#d8382e'); p.line(14, 6, 18, 3, '#a81c24'); },
  viking: (p) => { p.ellipse(10, 12, 6.5, 6, (nx, ny) => (ny < 0.45 ? hexC(nx < -0.3 ? '#d6e0ec' : '#94a2b8') : null)); p.rect(4, 13, 13, 2, '#d8a03a'); p.rect(9, 6, 2, 9, '#a86c1c'); p.line(3, 11, 1, 6, '#f4ead0'); p.line(2, 11, 0, 6, '#d4c49a'); p.line(17, 11, 19, 6, '#f4ead0'); p.line(16, 11, 18, 6, '#d4c49a'); p.set(1, 4, '#6a5236'); p.set(19, 4, '#6a5236'); },
  toque: (p) => { p.rect(6, 12, 8, 5, '#e6eaee'); p.rect(6, 15, 8, 1, '#a8aeb6'); for (let x = 6; x < 14; x += 2) p.rect(x, 7, 1, 5, '#ccd2d8'); p.rect(5, 7, 10, 5, '#f8fafc'); for (let x = 6; x < 14; x += 2) p.rect(x, 7, 1, 5, '#ccd2d8'); p.ellipse(10, 5, 6, 3.6, '#f8fafc'); p.set(7, 4, '#ccd2d8'); p.set(12, 3, '#ccd2d8'); },
  partyCone: (p) => { tri(p, [[5, 18], [10, 4], [15, 18]], (x, y) => hexC(['#e0408a', '#f0c020', '#20b8c8'][Math.floor((x + y) / 3) % 3])); p.rect(5, 17, 11, 2, '#f0c040'); p.ellipse(10, 3, 2.4, 2.4, '#ffffff'); p.set(9, 2, '#ff8ac0'); },
  jellyCap: (p) => { p.ellipse(10, 9, 7.5, 6, (nx, ny) => (ny < 0.3 ? hexC(ny < -0.5 ? '#fce0ff' : '#e8a8f0') : null)); for (let x = 3; x < 18; x += 2) p.set(x, 11, '#c070d0'); for (const x of [5, 8, 11, 14]) p.line(x, 12, x + (x % 2 ? 1 : -1), 18, '#f8c8ff'); p.set(9, 7, '#ff9ad8'); p.set(11, 7, '#ff9ad8'); },
  anglerLamp: (p) => { p.rect(2, 15, 12, 3, '#64391a'); p.rect(2, 15, 12, 1, '#b07a44'); p.line(6, 15, 7, 7, '#a88a88'); p.line(7, 7, 11, 3, '#a88a88'); p.line(11, 3, 15, 4, '#a88a88'); p.ellipse(16, 7, 2.8, 2.8, '#aef6ff'); p.set(15, 6, '#ffffff'); },
  kabuto: (p) => { p.ellipse(10, 12, 6.5, 5.5, (nx, ny) => (ny < 0.4 ? hexC(nx < -0.2 ? '#3c4870' : '#1a1e36') : null)); p.rect(2, 13, 16, 3, '#28304e'); for (let x = 3; x < 18; x += 3) p.set(x, 14, '#d8382e'); p.rect(4, 12, 12, 1, '#f0c040'); p.line(9, 10, 5, 2, '#f0c040'); p.line(11, 10, 15, 2, '#f0c040'); p.set(10, 9, '#c8141c'); p.set(10, 10, '#c8141c'); },
  // ---- swords (diagonal, grip bottom-left)
  toothpick: (p) => { p.line(4, 16, 17, 3, '#c49c62'); p.line(5, 16, 17, 4, '#9a7242'); p.rect(3, 15, 3, 3, '#94703e'); for (const [x, y, c] of [[1, 17, '#ff3b5c'], [2, 19, '#ffd23b'], [1, 15, '#3bd1ff']] as [number, number, string][]) p.set(x, y, c); },
  bamboo: (p) => { for (let i = 0; i < 13; i++) { p.set(4 + i, 16 - i, i % 4 === 0 ? '#b8c870' : '#5aa23a'); p.set(5 + i, 16 - i, '#3a7a28'); } p.set(18, 2, '#d8d890'); p.line(3, 16, 1, 13, '#6abc48'); },
  chopstick: (p) => { p.line(3, 17, 17, 3, '#d8382e'); p.line(4, 17, 17, 4, '#a81c24'); p.line(3, 17, 7, 13, '#0c0a10'); p.line(4, 17, 8, 13, '#0c0a10'); p.set(7, 13, '#f0c040'); p.set(8, 13, '#f0c040'); },
  goldPick: (p) => { p.line(5, 15, 17, 3, '#fff0a8'); p.line(6, 15, 17, 4, '#c88a18'); p.ellipse(4, 16, 2.4, 2.4, '#d81c3a'); p.set(3, 15, '#ffd0d8'); },
  sting: (p) => { p.line(5, 15, 18, 2, '#9ae8ff'); p.line(6, 15, 18, 3, '#5ab8f0'); p.set(10, 9, '#e0ffff'); p.set(13, 6, '#e0ffff'); p.rect(2, 15, 4, 3, '#f0a0d8'); p.line(2, 18, 0, 19, '#a04a98'); },
  // ---- scarves
  none: (p) => { p.ellipse(10, 10, 6, 6, (nx, ny) => (Math.hypot(nx, ny) > 0.7 ? hexC('#8a8a96') : null)); p.line(6, 14, 14, 6, '#8a8a96'); },
  redScarf: (p) => { p.rect(3, 5, 14, 4, '#a81c24'); p.rect(3, 5, 14, 1, '#f86a4a'); p.rect(12, 9, 4, 9, '#d8382e'); p.rect(15, 9, 1, 9, '#6e0e1a'); p.rect(8, 9, 3, 7, '#a81c24'); p.set(12, 17, '#e0c090'); p.set(14, 17, '#e0c090'); },
  cloak: (p) => { tri(p, [[4, 4], [16, 4], [19, 18], [1, 18]], (x, y) => hexC((x + y) % 7 === 0 ? '#1e1a16' : x < 10 ? '#40382e' : '#2e2822')); for (const x of [2, 6, 9, 13, 17]) p.set(x, 18, '#000000', 0); p.rect(8, 3, 4, 3, '#977442'); p.set(9, 11, '#000000', 0); },
  // ---- trails
  bubbles: (p) => { for (const [x, y, r] of [[5, 14, 3], [12, 9, 2.4], [15, 4, 1.6], [8, 5, 1.4]] as [number, number, number][]) { p.ellipse(x, y, r, r, (nx, ny) => (Math.hypot(nx, ny) > 0.62 ? hexC('#bfefff') : null)); p.set(Math.round(x - r * 0.4), Math.round(y - r * 0.4), '#ffffff'); } },
  sparkles: (p) => { const st = (x: number, y: number, c: string) => { p.set(x, y, '#ffffff'); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, c); }; st(5, 14, '#fff0a0'); st(12, 8, '#bff4ff'); st(16, 15, '#fff0a0'); st(9, 3, '#bff4ff'); p.set(16, 3, '#ffffff'); },
  ink: (p) => { for (const [x, y, r] of [[6, 13, 4], [12, 9, 3.4], [16, 5, 2.4]] as [number, number, number][]) p.ellipse(x, y, r, r * 0.8, (nx, ny) => hexC(ny < -0.3 ? '#4a3a5a' : '#1e1428')); },
  hearts: (p) => { const h = (x: number, y: number) => { p.rect(x, y, 2, 2, '#e83a3a'); p.rect(x + 3, y, 2, 2, '#e83a3a'); p.rect(x, y + 1, 5, 2, '#e83a3a'); p.rect(x + 1, y + 3, 3, 1, '#e83a3a'); p.set(x + 2, y + 4, '#e83a3a'); p.set(x, y, '#ff8aa8'); }; h(2, 11); h(10, 6); h(13, 14); },
  embers: (p) => { for (const [x, y, c] of [[4, 15, '#ff6a2a'], [7, 11, '#ffb050'], [11, 8, '#ff6a2a'], [14, 4, '#ffd080'], [15, 12, '#ffb050'], [9, 15, '#ffd080']] as [number, number, string][]) { p.rect(x, y, 2, 2, c); p.set(x, y, '#fff0c0'); } },
};

/** the icon for a cosmetic id (skins draw a tiny blobfish in their ramp) */
export function cosmeticIcon(id: string): HTMLCanvasElement {
  let c = cache.get(id);
  if (c) return c;
  const p = new Px(S, S);
  const sk = SKINS[id];
  if (sk) {
    const ramp = sk.ramp ?? ['#4a2232', '#71364a', '#975062', '#bb6f7e', '#d68e96', '#e7abab', '#f2c6bf', '#fae1d6'];
    blob(p, ramp, (q) => {
      if (id === 'camo') for (const [x, y] of [[5, 9], [9, 12], [12, 10], [7, 14]]) { q.set(x, y, '#222e16'); q.set(x + 1, y, '#222e16'); }
      if (id === 'violet') for (const x of [4, 7, 10, 13]) q.set(x, 13, '#9af4ff');
      if (id === 'sunburnt') for (const [x, y] of [[6, 7], [10, 7], [8, 8]]) q.set(x, y, '#f8e0d0');
      if (id === 'gold') { q.set(6, 8, '#ffffff'); q.set(7, 8, '#ffffff'); }
    });
  } else (ICON[id] ?? ICON.none)(p);
  p.outline(OUT, 255, false);
  c = p.canvas();
  cache.set(id, c);
  return c;
}
