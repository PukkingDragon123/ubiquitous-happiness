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

/** a keyboard keycap glyph with a label ('R', 'ESC', 'TAB'...), cached */
export function keycap(label: string, dark = false): HTMLCanvasElement {
  const key = 'kc|' + label + dark;
  let c = iconCache.get(key);
  if (c) return c;
  const tw = measure(label, 'small');
  const w = Math.max(11, tw + 6), h = 12;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const face = dark ? '#2e3442' : '#e8e2d4', side = dark ? '#161a22' : '#9a9284', top = dark ? '#4a5266' : '#ffffff';
  x.fillStyle = '#0e0a14'; x.fillRect(1, 0, w - 2, h); x.fillRect(0, 1, w, h - 2);
  x.fillStyle = side; x.fillRect(1, 1, w - 2, h - 2);
  x.fillStyle = face; x.fillRect(1, 1, w - 2, h - 4);
  x.fillStyle = top; x.fillRect(2, 1, w - 4, 1);
  drawText(x, label, w / 2, 3, { font: 'small', color: dark ? '#e8e2d4' : '#2a2430', align: 'center' });
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
