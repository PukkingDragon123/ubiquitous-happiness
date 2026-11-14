// Pixel icons for the cosmetics (wardrobe, achievement rewards, unlock toast), drawn on the v3 icon painter
// (src/backpack/pix.ts): designed on a 32 px grid, cel-shaded from the top-left into hue-shifted ramps, with a
// selective outline, and rasterised crisply at the size asked for.
//
//   cosmeticIcon('kasa')        20 x 20 (the size the wardrobe / toast layouts were built around)
//   cosmeticIcon('kasa', 32)    the full-size design (any size works: 16, 24, 32, 48...)
import { Pix, bez, curve, starPts, ramp, type V2 } from '../backpack/pix';
import { R } from '../backpack/ramps';
import { SKINS } from './skins';

const cache = new Map<string, HTMLCanvasElement>();
type Draw = (p: Pix) => void;

const STRAW = ramp('#2a1a08', '#5a4020', '#866634', '#b08e4c', '#d4b46a', '#f2da98');
const NIGHT = ramp('#08080e', '#16161e', '#22222e', '#30303e', '#4a4a5c', '#6a6a80');
const JELLY = ramp('#2a0a34', '#6a2a7a', '#b060c0', '#e8a8f0', '#fcd8ff', '#ffffff');
const TOQUE = ramp('#3a4452', '#8a96a6', '#c4ccd6', '#e6eaee', '#f8fafc', '#ffffff');
const BAMBOO = ramp('#0e2408', '#2a5a18', '#3a7a28', '#5aa23a', '#8ac858', '#d8f0a0');
const LACQ = ramp('#2a0408', '#6a0a14', '#a81c24', '#d8382e', '#f86a4a', '#ffc0a0');
const STING = ramp('#06203a', '#1a5a8a', '#3a8ac8', '#5ab8f0', '#9ae8ff', '#e8ffff');

/** a little blobfish (side view, facing right) in a skin's ramp */
function blob(p: Pix, rp: string[], extra?: (p: Pix) => void) {
  const r = ramp(...[rp[0], rp[1], rp[3], rp[4], rp[6], rp[7]].map((c) => c ?? '#ffffff'));
  p.ellipse(4, 16, 3, 4.6, r, { rot: 0.2 });
  p.ellipse(15, 17, 12, 9.4, r, { spec: true });
  p.ellipse(25.5, 20.5, 4.4, 3.8, r, { spec: true });
  p.ellipse(13, 24, 4, 2, r, { shade: 'facet', tone: 2, edge: false });
  extra?.(p);
  p.circle(21, 13, 2.2, R.white, { shade: 'facet', tone: 4 });
  p.px(21.5, 13.5, '#0a0a10'); p.px(21.5, 12.5, '#0a0a10'); p.px(20.5, 12.5, '#ffffff');
  p.line([[18, 10], [22, 10]], -1);
}

const ICON: Record<string, Draw> = {
  // ---- hats
  kasa: (p) => {
    p.poly([[1, 22], [16, 6], [31, 22]], STRAW, { shade: 'round', r: 6 });
    for (let k = -3; k <= 3; k++) p.line([[16, 7], [16 + k * 4.6, 21]], -1);
    p.rect(14, 4, 4, 4, R.red, { r: 1 });
    p.stroke([[9, 23], [11, 29]], 0.8, R.red); p.stroke([[23, 23], [21, 29]], 0.8, R.red);
  },
  roninKasa: (p) => {
    p.poly([[1, 22], [16, 6], [31, 22]], NIGHT, { shade: 'round', r: 6 });
    p.rect(1, 20, 30, 3, R.red, { clip: true, edge: false, shade: 'facet', tone: 3 });
    p.rect(14, 4, 4, 4, R.red, { r: 1 });
    p.stroke([[9, 23], [11, 29]], 0.8, R.red); p.stroke([[23, 23], [21, 29]], 0.8, R.red);
  },
  coralCrown: (p) => {
    for (const [x, h] of [[7, 10], [12, 14], [16, 17], [20, 14], [25, 10]] as [number, number][]) p.stroke([[x, 23], [x + (x - 16) * 0.15, 23 - h]], 1.6, R.coral);
    for (const [x, y] of [[9, 16], [23, 16], [14, 12], [18, 12]] as V2[]) p.stroke([[x, y + 3], [x + (x < 16 ? -3 : 3), y]], 1, R.coral);
    p.rect(4, 22, 24, 6, R.coral, { r: 2 });
    for (const x of [8, 16, 24]) p.circle(x, 25, 1.6, R.pearl, { spec: true });
  },
  tricorn: (p) => {
    p.poly([[1, 20], [16, 13], [31, 20], [16, 27]], NIGHT, { shade: 'round', r: 6 });
    p.rect(8, 8, 16, 10, NIGHT, { r: 3 });
    p.line([[2, 20], [16, 26], [30, 20]], '#f0c040');
    p.circle(16, 14, 2, R.white, { spec: true });
    p.stroke(bez([22, 9], [26, 3], [30, 4], 8), 1.2, R.red);
  },
  viking: (p) => {
    p.stroke(bez([7, 18], [1, 14], [2, 5], 10), (t) => 2.4 - t * 1.6, R.bone);
    p.stroke(bez([25, 18], [31, 14], [30, 5], 10), (t) => 2.4 - t * 1.6, R.bone);
    p.ellipse(16, 20, 10, 9, R.steel, { spec: true });
    p.erase((x, y) => y > 22);
    p.rect(5, 20, 22, 4, R.brass, { r: 1 });
    p.rect(15, 11, 3, 10, R.brass, { r: 1 });
    for (const x of [8, 12, 20, 24]) p.px(x, 21.5, '#fffbe0');
  },
  toque: (p) => {
    p.ellipse(16, 9, 10, 6.5, TOQUE, { spec: true });
    p.rect(8, 9, 16, 12, TOQUE, { r: 1 });
    for (const x of [11, 15, 19]) p.line([[x, 11], [x, 20]], -1);
    p.rect(7, 20, 18, 6, TOQUE, { r: 1.5, shade: 'facet', tone: 3 });
  },
  partyCone: (p) => {
    p.poly([[8, 28], [16, 4], [24, 28]], R.pink, { shade: 'round', r: 5 });
    p.shadeWhere((x, y) => Math.floor((y + x * 0.4) / 5) % 2 === 0, -1);
    for (const [y0, c] of [[10, R.yellow], [18, R.teal]] as [number, typeof R.red][]) p.rect(6, y0, 20, 3, c, { clip: true, edge: false, shade: 'facet', tone: 3 });
    p.rect(7, 26, 18, 3, R.yellow, { r: 1 });
    p.circle(16, 4, 3, R.white, { spec: true });
  },
  jellyCap: (p) => {
    for (const x of [9, 14, 18, 23]) p.stroke(curve((t) => [x + Math.sin(t * 6 + x) * 1.2, 16 + t * 13], 10), (t) => 1 - t * 0.5, JELLY);
    p.ellipse(16, 14, 12, 9, JELLY, { spec: true });
    p.erase((x, y) => y > 17 && (x < 3.5 || x > 28.5 || y > 18.5) && y < 19);
    for (const [x, y] of [[12, 10], [19, 9], [16, 13]] as V2[]) p.px(x, y, '#ff9ad8');
  },
  anglerLamp: (p) => {
    p.rect(3, 22, 18, 5, R.leather, { r: 2 });
    p.stroke(bez3x([[9, 22], [9, 10], [18, 4], [24, 8]]), (t) => 1.6 - t * 0.6, R.flesh);
    p.circle(25, 13, 4.4, R.lantern, { spec: true, emit: true, lift: 0.2 });
    for (const a of [0, 1.3, 2.6, 3.9, 5.2]) p.px(25 + Math.cos(a) * 7, 13 + Math.sin(a) * 7, '#e8ffb0', { add: true });
  },
  kabuto: (p) => {
    p.stroke(bez([13, 14], [8, 6], [5, 2], 8), 1.3, R.gold);
    p.stroke(bez([19, 14], [24, 6], [27, 2], 8), 1.3, R.gold);
    p.ellipse(16, 20, 11, 9, R.navy, { spec: true });
    p.erase((x, y) => y > 22);
    p.rect(3, 21, 26, 5, R.navy, { r: 1.5, shade: 'facet', tone: 2 });
    for (let x = 5; x < 28; x += 4) p.px(x, 23, '#d8382e');
    p.rect(6, 19, 20, 2, R.gold, { shade: 'facet', tone: 3 });
    p.circle(16, 15, 1.8, R.red, { spec: true });
  },
  // ---- swords (diagonal, grip bottom-left)
  toothpick: (p) => {
    p.stroke([[6, 26], [28, 4]], (t) => 1.6 - t * 1.1, R.wood);
    p.stroke([[4, 28], [9, 23]], 2.2, R.darkwood);
    for (const [x, y, c] of [[2, 29, '#ff3b5c'], [4, 31, '#ffd23b'], [1, 26, '#3bd1ff']] as [number, number, string][]) p.px(x, y, c, { add: true });
    p.line([[12, 19], [25, 6]], '#f2e6cc');
  },
  bamboo: (p) => {
    p.stroke([[5, 27], [28, 4]], 1.9, BAMBOO);
    for (const t of [0.25, 0.5, 0.75]) { const x = 5 + 23 * t, y = 27 - 23 * t; p.stroke([[x - 1.2, y - 1.2], [x + 1.2, y + 1.2]], 1, BAMBOO, { shade: 'facet', tone: 4 }); }
    p.stroke(bez([8, 24], [3, 22], [2, 17], 6), 0.8, BAMBOO);
    p.ellipse(3, 16, 2.6, 1.2, BAMBOO, { rot: -0.6 });
  },
  chopstick: (p) => {
    p.stroke([[5, 28], [28, 4]], (t) => 1.7 - t * 0.9, LACQ);
    p.stroke([[3, 26], [10, 19]], 2, R.black);
    p.stroke([[10, 19], [11, 18]], 2, R.gold);
  },
  goldPick: (p) => {
    p.stroke([[8, 24], [28, 4]], (t) => 1.7 - t * 1.2, R.gold, { spec: true });
    p.circle(6, 26, 3.6, R.ruby, { spec: true });
    p.line([[11, 20], [25, 6]], '#fffde0');
  },
  sting: (p) => {
    p.stroke([[9, 23], [29, 3]], (t) => 2 - t * 1.6, STING, { spec: true });
    p.stroke([[5, 21], [11, 27]], 1.3, R.silver);
    p.stroke([[3, 29], [8, 24]], 1.8, R.pink);
    p.glint(18, 13, 1, '#e8ffff');
  },
  // ---- scarves
  none: (p) => {
    p.ring(16, 16, 10, 2.4, R.stone);
    p.stroke([[9, 23], [23, 9]], 1.2, R.stone);
  },
  redScarf: (p) => {
    // a knitted scarf: the loop around the neck, two tails with fringes hanging down
    p.stroke(curve((t) => { const a = Math.PI * (0.05 + t * 0.9); return [16 - Math.cos(a) * 12, 10 + Math.sin(a) * 6]; }, 20), 3.4, R.red);
    p.stroke(bez([20, 15], [23, 21], [21, 27], 8), 3, R.red);
    p.stroke(bez([15, 15], [14, 21], [11, 26], 8), 3, R.red);
    for (const [x, y] of [[19, 30], [21, 30], [23, 30], [9, 29], [11, 29], [13, 29]] as V2[]) p.px(x, y, '#f0c090', { add: true });
    for (const t of [0.2, 0.4, 0.6, 0.8]) { const a = Math.PI * (0.05 + t * 0.9); p.px(16 - Math.cos(a) * 12, 10 + Math.sin(a) * 6, '#ffd0b0'); }
  },
  cloak: (p) => {
    p.poly([[7, 5], [25, 5], [30, 28], [24, 26], [19, 29], [13, 26], [8, 29], [2, 28]], R.cloth, { shade: 'round', r: 7 });
    for (const x of [10, 16, 22]) p.line([[x, 9], [x + (x - 16) * 0.3, 26]], -1);
    p.rect(12, 3, 8, 5, R.brass, { r: 2 });
  },
  // ---- trails
  bubbles: (p) => {
    for (const [x, y, r] of [[9, 23, 5], [20, 15, 4], [25, 6, 2.6], [12, 8, 2.2]] as [number, number, number][]) { p.ring(x, y, r, 1.2, R.ice, { shade: 'facet', tone: 4 }); p.px(x - r * 0.45, y - r * 0.45, '#ffffff'); }
  },
  sparkles: (p) => { p.glint(9, 23, 2, '#ffffff', '#fff0a0'); p.glint(20, 13, 2, '#ffffff', '#bff4ff'); p.glint(26, 25, 1, '#ffffff', '#fff0a0'); p.glint(14, 5, 1, '#ffffff', '#bff4ff'); },
  ink: (p) => { for (const [x, y, r] of [[9, 22, 6], [19, 14, 5], [26, 7, 3.4]] as [number, number, number][]) p.ellipse(x, y, r, r * 0.85, R.ink, { spec: true }); },
  hearts: (p) => {
    const heart = (cx: number, cy: number, s: number) => p.poly(curve((t) => { const a = t * Math.PI * 2; return [cx + 16 * Math.sin(a) ** 3 * s, cy - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s]; }, 32), R.red, { shade: 'round', spec: true });
    heart(9, 21, 0.38); heart(21, 11, 0.32); heart(24, 25, 0.24);
  },
  embers: (p) => { for (const [x, y, r] of [[7, 24, 2.4], [12, 16, 2], [18, 10, 1.6], [24, 18, 2], [22, 5, 1.4], [14, 27, 1.6]] as [number, number, number][]) p.circle(x, y, r, R.lava, { spec: true, emit: true, lift: 0.2 }); },
};

function bez3x(pts: V2[]): V2[] { const [a, b, c, d] = pts; return curve((t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]; }, 20); }
void starPts;

/** the icon for a cosmetic id at size x size px (skins draw a tiny blobfish in their ramp) */
export function cosmeticIcon(id: string, size = 20): HTMLCanvasElement {
  const key = id + '|' + size;
  let c = cache.get(key);
  if (c) return c;
  const p = new Pix(size, size, size / 32);
  const sk = SKINS[id];
  if (sk) {
    const rp = sk.ramp ?? ['#4a2232', '#71364a', '#975062', '#bb6f7e', '#d68e96', '#e7abab', '#f2c6bf', '#fae1d6'];
    blob(p, rp, (q) => {
      if (id === 'camo') for (const [x, y] of [[9, 14], [15, 19], [19, 15], [12, 22]] as V2[]) q.ellipse(x, y, 2.2, 1.4, R.olive, { clip: true, edge: false, shade: 'facet', tone: 2 });
      if (id === 'violet') for (const x of [8, 12, 16, 20]) q.px(x, 21, '#9af4ff');
      if (id === 'sunburnt') for (const [x, y] of [[10, 11], [15, 10], [12, 12]] as V2[]) q.px(x, y, '#f8e0d0');
      if (id === 'gold') q.glint(10, 11, 1);
      if (id === 'ghost') q.shadeWhere((_x, y) => y > 23, 1);
    });
  } else (ICON[id] ?? ICON.none)(p);
  c = p.render();
  cache.set(key, c);
  return c;
}

/** every cosmetic id with a hand-made icon (the icon sheet lists them) */
export const COSMETIC_ICON_IDS = [...Object.keys(ICON), ...Object.keys(SKINS)];
