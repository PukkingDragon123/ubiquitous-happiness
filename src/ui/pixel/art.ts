// Hand-placed pixel art for the UI kit: small icons, hotkey keycaps, mouse glyphs and cursors, written as
// ASCII maps with a per-icon palette so every pixel is deliberate.
//
//   icon('hammer')                 -> canvas (cached)
//   keycap('R') / keycap('ESC')    -> a little 3D keycap with the label
//   cursor('hammer')               -> { cv, hx, hy } (hot spot)
import { drawText, measure } from './font';

type Pal = Record<string, string>;
const P: Pal = {
  k: '#0e0a14', // outline
  w: '#fffaf0', W: '#ffffff', l: '#d9d4cc', g: '#9a948c', d: '#5a5560',
  y: '#ffd860', Y: '#ffb02e', o: '#e0761c', r: '#e83a3a', R: '#9a1c2a', p: '#ff8aa8',
  b: '#5ac8ff', B: '#2a6ad0', n: '#16306a', c: '#9ff4ff', t: '#3ad0b0', G: '#5ad04a', v: '#2a8a3a',
  m: '#b06a3a', M: '#6a3a1a', s: '#c8a070', u: '#c87aff', U: '#6a2aa8', '.': '',
};

function paint(rows: string[], pal: Pal = P): HTMLCanvasElement {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!;
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) { x.fillStyle = c; x.fillRect(i, y, 1, 1); } } });
  return cv;
}

const ICONS: Record<string, string[]> = {
  hammer: [
    '..kkkkk...',
    '.kllllgk..',
    'kwllllgdk.',
    '.kkkMkkkk.',
    '....kMk...',
    '....kmk...',
    '....kMk...',
    '....kmk...',
    '....kMk...',
    '.....k....',
  ],
  close: [
    'kk....kk',
    'krk..krk',
    '.krkkrk.',
    '..krrk..',
    '..krrk..',
    '.krkkrk.',
    'krk..krk',
    'kk....kk',
  ],
  check: [
    '.......kk',
    '......kGk',
    'kk...kGk.',
    'kGk.kGk..',
    '.kGkGk...',
    '..kGk....',
    '...k.....',
  ],
  left: ['...kk', '..kwk', '.kwwk', 'kwwwk', '.kwwk', '..kwk', '...kk'],
  right: ['kk...', 'kwk..', 'kwwk.', 'kwwwk', 'kwwk.', 'kwk..', 'kk...'],
  up: ['...k...', '..kwk..', '.kwwwk.', 'kwwwwwk', 'kkkkkkk'],
  down: ['kkkkkkk', 'kwwwwwk', '.kwwwk.', '..kwk..', '...k...'],
  rotate: [
    '..kkkk.k.',
    '.kwwwwkwk',
    'kwk..kwwk',
    'kwk.kwwwk',
    'kwk..kkkk',
    'kwk......',
    '.kwk..k..',
    '..kwwwk..',
    '...kkk...',
  ],
  trash: [
    '...kkk...',
    'kkkkkkkkk',
    'kllllllgk',
    'kkkkkkkkk',
    '.klglglk.',
    '.klglglk.',
    '.klglglk.',
    '.klglglk.',
    '..kkkkk..',
  ],
  move: [
    '....k....',
    '...kwk...',
    '..kkwkk..',
    '.k..w..k.',
    'kwwwwwwwk',
    '.k..w..k.',
    '..kkwkk..',
    '...kwk...',
    '....k....',
  ],
  chest: [
    '.kkkkkkkk.',
    'kmMmmmmMmk',
    'kMyyyyyyMk',
    'kkkkYYkkkk',
    'kmMmkYkmMk',
    'kmMmmmmmMk',
    'kMyyyyyyMk',
    '.kkkkkkkk.',
  ],
  gear: [
    '...kk...',
    '.kkllkk.',
    '.kllllk.',
    'klllgllk',
    'kllgkllk',
    '.kllllk.',
    '.kkllkk.',
    '...kk...',
  ],
  tv: [
    '..k...k..',
    '...k.k...',
    'kkkkkkkkk',
    'kbbbbbbmk',
    'kbcbbbbmk',
    'kbbbbbbyk',
    'kbbbbbbmk',
    'kkkkkkkkk',
    '.k.....k.',
  ],
  star: ['...k...', '..kyk..', 'kkkykkk', 'kyyyyyk', '.kyyyk.', '.kykyk.', 'kk...kk'],
  lock: ['.kkk.', 'k...k', 'k...k', 'kkkkk', 'kyYyk', 'kykyk', 'kkkkk'],
  skull: [
    '.kkkkk.',
    'kwwwwwk',
    'kwkwkwk',
    'kwkwkwk',
    'kwwkwwk',
    '.kwwwk.',
    '.kwkwk.',
    '..kkk..',
  ],
  play: ['kk...', 'kwk..', 'kwwk.', 'kwwwk', 'kwwk.', 'kwk..', 'kk...'],
  cog: [
    '..k.k.k..',
    '.kwkwkwk.',
    'kwwwwwwwk',
    '.kwkkkwk.',
    'kwwk.kwwk',
    '.kwkkkwk.',
    'kwwwwwwwk',
    '.kwkwkwk.',
    '..k.k.k..',
  ],
  heart: ['.kk.kk.', 'krrkrrk', 'krprrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'],
  mana: ['..k..', '.kuk.', 'kuWuk', 'kuuUk', 'kuUUk', '.kUk.', '..k..'],
  sword: ['......kk', '.....kwk', '....kwk.', 'k..kwk..', 'kk.kwk..', '.kMk....', 'kMkk....', 'kk......'],
  wrench: ['.kk..kk.', 'klk..klk', 'kllkkllk', '.kllllk.', '..kllk..', '..klgk..', '..klgk..', '..klgk..', '...kk...'],
  plus: ['..kkk..', '..kGk..', 'kkkGkkk', 'kGGGGGk', 'kkkGkkk', '..kGk..', '..kkk..'],
  minus: ['kkkkkkk', 'krrrrrk', 'kkkkkkk'],
  bubble: ['.kkk.', 'kcwbk', 'kwbbk', 'kbbbk', '.kkk.'],
  door: ['.kkkk.', 'kmMMmk', 'kMmmMk', 'kMmmyk', 'kMmmMk', 'kMmmMk', 'kkkkkk'],
};

const iconCache = new Map<string, HTMLCanvasElement>();
/** a named UI icon (pixel art, ~7-10 px); unknown names give a small '?' box */
export function icon(name: string): HTMLCanvasElement {
  let c = iconCache.get(name);
  if (!c) { c = paint(ICONS[name] ?? ['kkkkk', 'kwwwk', 'k.k.k', 'kwwwk', 'kkkkk']); iconCache.set(name, c); }
  return c;
}
export const ICON_NAMES = Object.keys(ICONS);

/** a keyboard keycap glyph with a label ('R', 'ESC', 'TAB'...), cached. (Classic font, for 3D textures; a PixelUI
 *  draws its keycaps with keycapBody() + its screen font instead, see PixelUI.keycap.) */
export function keycap(label: string, dark = false): HTMLCanvasElement {
  const key = 'kc|' + label + dark;
  let c = iconCache.get(key);
  if (c) return c;
  const tw = measure(label, 'small');
  const w = Math.max(11, tw + 6), h = 12;
  c = keycapBody(w, h, dark);
  drawText(c.getContext('2d')!, label, w / 2, 3, { font: 'small', color: dark ? '#f3e7c9' : '#0b1622', align: 'center', shadow: null });
  iconCache.set(key, c);
  return c;
}

/** v5 keycap art (no label): a chunky cream key (or dark lacquer) with a 2 px side, ink outline, rounded corners */
export const KEYCAP_H = 13;
export function keycapBody(w: number, h = KEYCAP_H, dark = false, down = false): HTMLCanvasElement {
  const key = `kcb|${w}|${h}|${dark}|${down}`;
  let c = iconCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const ink = '#0b1622';
  const face = dark ? '#2a4a52' : '#f3e7c9', top = dark ? '#4a7a80' : '#fffaf0', side = dark ? '#0c2429' : '#b9a476', shade = dark ? '#1d3a40' : '#d9c59b';
  const t0 = down ? 2 : 0;
  // outline with 1 px rounded corners
  x.fillStyle = ink; x.fillRect(1, t0, w - 2, h - t0); x.fillRect(0, t0 + 1, w, h - t0 - 2);
  x.fillStyle = side; x.fillRect(1, t0 + 1, w - 2, h - t0 - 2);
  x.fillStyle = face; x.fillRect(1, t0 + 1, w - 2, h - t0 - 4 + (down ? 2 : 0));
  x.fillStyle = shade; x.fillRect(w - 2, t0 + 2, 1, h - t0 - 5 + (down ? 2 : 0)); x.fillRect(2, h - 4 + (down ? 2 : 0), w - 4, 1);
  x.fillStyle = top; x.fillRect(2, t0 + 1, w - 4, 1); x.fillRect(1, t0 + 2, 1, Math.max(1, h - t0 - 6));
  iconCache.set(key, c);
  return c;
}

/**
 * the v5 close widget: a coral key in a brass bezel with a bold cream X. The canvas is `size` wide and size + 3 tall:
 * the plate (size x size) rests 1 px down on a 2 px lip, lifts on hover and sinks on press, like a button.
 */
export function closeArt(size: number, state: 'normal' | 'hover' | 'down' | 'disabled'): HTMLCanvasElement {
  const S = Math.max(11, Math.round(size));
  const key = `close|${S}|${state}`;
  let c = iconCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = S; c.height = S + 3;
  const x = c.getContext('2d')!;
  const dis = state === 'disabled';
  const P = dis
    ? { ink: '#0b1622', b4: '#b8b2a6', b3: '#9a9488', b2: '#7a756c', b1: '#55514a', lip: '#33302c', f3: '#9a9690', f2: '#77736e', f1: '#57534f', xs: '#3a3836', x: '#d8d4cc' }
    : { ink: '#0b1622', b4: '#fff1c2', b3: '#f2c66d', b2: state === 'hover' ? '#dba552' : '#c8913a', b1: '#8a5a24', lip: '#5a3810', f3: '#ff9a84', f2: state === 'hover' ? '#f0685a' : state === 'down' ? '#c8463c' : '#e0564a', f1: '#a8342c', xs: '#6e1a14', x: '#fffaf0' };
  const px = (xx: number, yy: number, col: string) => { x.fillStyle = col; x.fillRect(xx, yy, 1, 1); };
  const top = state === 'hover' ? 0 : state === 'down' ? 3 : 1;
  const lip = state === 'down' ? 0 : state === 'hover' ? 3 : 2;
  const bz = S >= 18 ? 2 : 1;
  const ringOf = (xx: number, yy: number) => {
    const dx = Math.min(xx, S - 1 - xx), dy = Math.min(yy, S - 1 - yy);
    if ((dx === 0 && dy < 2) || (dy === 0 && dx < 2)) return -1;
    if (dx === 1 && dy === 1) return 0;
    return Math.min(dx, dy);
  };
  // the lip: the plate's silhouette, lower, in dark brass
  if (lip) for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const d = ringOf(xx, yy); if (d >= 0) px(xx, yy + top + lip, d === 0 ? P.ink : P.lip); }
  for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
    const d = ringOf(xx, yy);
    if (d < 0) continue;
    const Y = yy + top;
    if (d === 0) { px(xx, Y, P.ink); continue; }
    if (d <= bz) {
      const lit = yy === d || xx === d, shade = S - 1 - yy === d || S - 1 - xx === d;
      px(xx, Y, d === 1 ? (lit ? P.b4 : shade ? P.b1 : P.b2) : lit ? P.b3 : shade ? P.b1 : P.b2);
      continue;
    }
    if (d === bz + 1) { px(xx, Y, P.ink); continue; }
    const fy = yy - (bz + 2), fh = S - 2 * (bz + 2);
    px(xx, Y, fy === 0 ? P.f3 : fy === fh - 1 ? P.f1 : P.f2);
  }
  // the X: two strokes (2 px thick on big keys) with a dark shadow down-right
  const a = bz + 2, n = S - 2 * a, m = Math.max(1, Math.round(n * 0.2)), len = n - 2 * m, thick = S >= 16;
  for (const [col, o] of [[P.xs, 1], [P.x, 0]] as const) {
    for (let i = 0; i < len; i++) {
      const p = a + m + i;
      for (const qy of [a + m + i, a + m + len - 1 - i]) {
        px(p + o, qy + top + o, col);
        if (thick) px(p + o + (qy === a + m + i ? 1 : -1) * 0 + 1, qy + top + o, col);
      }
    }
  }
  iconCache.set(key, c);
  return c;
}

/** mouse glyph: which button is highlighted ('L', 'R', 'M' wheel) */
export function mouseGlyph(btn: 'L' | 'R' | 'M'): HTMLCanvasElement {
  const L = btn === 'L' ? 'y' : 'l', R = btn === 'R' ? 'y' : 'l', M = btn === 'M' ? 'y' : 'g';
  return paint([
    '.kkkkk.',
    `k${L}${L}k${R}${R}k`,
    `k${L}${L}${M}${R}${R}k`,
    `k${L}${L}k${R}${R}k`,
    'kkkkkkk',
    'kllllgk',
    'kllllgk',
    'kllllgk',
    '.kgggk.',
    '..kkk..',
  ].map((r) => r));
}

export type CursorName = 'arrow' | 'point' | 'grab' | 'hammer' | 'rotate' | 'remove' | 'busy';
const CURSORS: Record<CursorName, { rows: string[]; hx: number; hy: number }> = {
  arrow: { hx: 1, hy: 1, rows: [
    'k..........',
    'kk.........',
    'kwk........',
    'kwwk.......',
    'kwwwk......',
    'kwwwwk.....',
    'kwwwwwk....',
    'kwwwwwwk...',
    'kwwwwwwwk..',
    'kwwwwkkkkk.',
    'kwwkwk.....',
    'kwk.kwk....',
    'kk..kwk....',
    'k....kwk...',
    '.....kk....',
  ] },
  point: { hx: 5, hy: 1, rows: [
    '....kk......',
    '...kwwk.....',
    '...kwwk.....',
    '...kwwk.....',
    '...kwwkkk...',
    '...kwwkwwkk.',
    '.kkkwwkwwkwk',
    'kwwkwwwwwkwk',
    'kwwwwwwwwwwk',
    '.kwwwwwwwwwk',
    '..kwwwwwwwk.',
    '..kwwwwwwwk.',
    '...kwwwwwk..',
    '...kkkkkkk..',
  ] },
  grab: { hx: 6, hy: 6, rows: [
    '............',
    '............',
    '...kk.kk.kk.',
    '..kwwkwwkwwk',
    '.kkwwwwwwwwk',
    'kwwkwwwwwwwk',
    'kwwwwwwwwwwk',
    '.kwwwwwwwwwk',
    '..kwwwwwwwk.',
    '..kwwwwwwwk.',
    '...kwwwwwk..',
    '...kkkkkkk..',
  ] },
  hammer: { hx: 2, hy: 2, rows: [
    '.kkkkkk.....',
    'kwlllllk....',
    'kllllllgk...',
    '.kkkMkkkk...',
    '....kMk.....',
    '.....kMk....',
    '......kmk...',
    '.......kMk..',
    '........kmk.',
    '.........kMk',
    '..........kk',
  ] },
  rotate: { hx: 6, hy: 6, rows: [
    '...kkkkk.k..',
    '..kwwwwwkwk.',
    '.kwkkkkkwwk.',
    'kwk...kwwwk.',
    'kwk....kkkk.',
    'kwk.........',
    'kwk.....kk..',
    '.kwk...kwk..',
    '..kwwwwwk...',
    '...kkkkk....',
  ] },
  remove: { hx: 5, hy: 5, rows: [
    'kk......kk',
    'krk....krk',
    '.krk..krk.',
    '..krkkrk..',
    '...krrk...',
    '...krrk...',
    '..krkkrk..',
    '.krk..krk.',
    'krk....krk',
    'kk......kk',
  ] },
  busy: { hx: 5, hy: 7, rows: [
    'kkkkkkkkkk',
    'kyyyyyyyyk',
    '.kwwwwwwk.',
    '..kwwwwk..',
    '...kyyk...',
    '...kyyk...',
    '..kwwwwk..',
    '.kwwyywwk.',
    'kwyyyyyywk',
    'kkkkkkkkkk',
  ] },
};
const curCache = new Map<string, { cv: HTMLCanvasElement; hx: number; hy: number }>();
export function cursorArt(name: CursorName) {
  let c = curCache.get(name);
  if (!c) { const d = CURSORS[name]; c = { cv: paint(d.rows), hx: d.hx, hy: d.hy }; curCache.set(name, c); }
  return c;
}
