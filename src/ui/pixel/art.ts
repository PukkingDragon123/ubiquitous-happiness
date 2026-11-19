// Hand-placed pixel art for the UI kit: small icons, hotkey keycaps, mouse glyphs and cursors.
//
// v5: icons and cursors are FILL maps (one letter per UI px, a material per letter; lowercase = lit, UPPERCASE = the
// shaded side, 'k' = a deliberate ink line inside the shape) and the painter adds the 1 UI px ink outline itself, then
// shades every material region at texel density with the kit's bevel (a warm rim highlight on top, a lit left edge,
// cool shade on the bottom/right), so an icon has the same weight and detail as the widgets around it.
//
//   icon('hammer')                 -> canvas at 1 texel per UI px (cached; the classic API)
//   iconTex('hammer', ui.hd)       -> the same icon at the UI's density (draw it at iconSize() UI px)
//   keycap('R') / keycap('ESC')    -> a little 3D keycap with the label (classic font, for 3D textures)
//   cursorArt('point')             -> { cv, hx, hy } at 1x;  cursorTex('point', ui.hd) -> + { w, h } in UI px
//   mouseTex('L', ui.hd)           -> a mouse glyph with the left / right button or the wheel lit
import { drawText, measure } from './font';
import { keycapBody } from './skins';
export { keycapBody, closeArt, KEYCAP_H } from './skins';

type C = [number, number, number];
const hx = (s: string): C => { const v = parseInt(s.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const ramp = (...s: string[]) => s.map(hx);
const INK = hx('#0b1622');

/** material ramps (5 tones, dark -> light, hue-shifted: cool shadows, warm highlights) */
const MAT: Record<string, C[]> = {
  m: ramp('#262c3a', '#4a5466', '#7c8898', '#b6c2cc', '#eef4f2'),   // steel
  b: ramp('#5a2e16', '#8a5422', '#c8913a', '#ecc46a', '#fff1c2'),   // brass
  w: ramp('#33191a', '#6b3c24', '#a86e3e', '#d09a5c', '#f0c88e'),   // wood
  r: ramp('#4a1226', '#a8342c', '#e0564a', '#ff9a84', '#ffd8c0'),   // coral red
  g: ramp('#173a2a', '#3a7a28', '#5fae3f', '#a6e07a', '#e6f6a6'),   // kelp green
  c: ramp('#6a5a48', '#b4a68c', '#e2d8c0', '#f8f2e2', '#ffffff'),   // cream / bone
  u: ramp('#142a5a', '#2a6ab0', '#3d8fd6', '#9cd4f4', '#e6f8ff'),   // sea blue
  p: ramp('#2a0c4a', '#6a2aa8', '#9a5ae0', '#c88aff', '#f0d8ff'),   // mana purple
  y: ramp('#7a4a1a', '#d8a440', '#f2c66d', '#ffe9a0', '#fffae6'),   // gold
  t: ramp('#081620', '#1a454c', '#2e6d68', '#5fb0a0', '#bfeee0'),   // teal glass
  s: ramp('#2a1c0e', '#82683a', '#b09254', '#d6bc80', '#f0dca6'),   // rope
};

/**
 * paint a fill map at d texels per UI px: an auto ink outline (8-neighbour) one UI px round every filled region,
 * explicit 'k' ink, and a per-texel bevel per material region. `shadow` adds a soft drop shadow 1 UI px down-right.
 */
function paintMap(rows: string[], d: number, shadow = false): HTMLCanvasElement {
  const mw = Math.max(...rows.map((r) => r.length)), mh = rows.length;
  const pad = 1, sh = shadow ? 1 : 0;
  const W = mw + 2 * pad + sh, H = mh + 2 * pad + sh;
  const at = (gx: number, gy: number) => { const r = rows[gy - pad]; const ch = r?.[gx - pad]; return ch && ch !== '.' ? ch : ''; };
  const mat = (ch: string) => (ch && ch !== 'k' ? ch.toLowerCase() : '');
  const cv = document.createElement('canvas'); cv.width = W * d; cv.height = H * d;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(cv.width, cv.height), D = img.data;
  const put = (x: number, y: number, c: C, a = 255) => { const i = (y * cv.width + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = a; };
  // which UI cells are ink (explicit or the auto outline) and which are material
  const ink = (gx: number, gy: number) => {
    const ch = at(gx, gy);
    if (ch === 'k') return true;
    if (ch) return false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && mat(at(gx + i, gy + j))) return true;
    return false;
  };
  const solid = new Uint8Array(W * H);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const ch = at(gx, gy), m = mat(ch);
    if (ink(gx, gy)) solid[gy * W + gx] = 1;
    if (!m) { if (solid[gy * W + gx]) for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) put(gx * d + i, gy * d + j, INK); continue; }
    solid[gy * W + gx] = 1;
    const R = MAT[m] ?? MAT.c;
    const base = ch === ch.toUpperCase() ? 1 : 2;
    const same = (dx: number, dy: number) => mat(at(gx + dx, gy + dy)) === m;
    const up = !same(0, -1), dn = !same(0, 1), lf = !same(-1, 0), rt = !same(1, 0);
    for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
      let tone = base;
      if (d === 1) { if (up) tone += 1; else if (dn) tone -= 1; }
      else if (up && j === 0) tone += 2;
      else if (up && j === 1 && d >= 3) tone += 1;
      else if (lf && i === 0) tone += 1;
      else if (dn && j === d - 1) tone -= 1;
      else if (rt && i === d - 1) tone -= 1;
      put(gx * d + i, gy * d + j, R[Math.max(0, Math.min(4, tone))]);
    }
  }
  if (shadow) {
    for (let y = 0; y < H * d; y++) for (let x = 0; x < W * d; x++) {
      const i = (y * cv.width + x) * 4;
      if (D[i + 3]) continue;
      const sx = x - d, sy = y - d;
      if (sx >= 0 && sy >= 0 && D[(sy * cv.width + sx) * 4 + 3] === 255 && solid[Math.floor(sy / d) * W + Math.floor(sx / d)]) { D[i] = 0; D[i + 1] = 0; D[i + 2] = 0; D[i + 3] = 96; }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** a left-pointing chunky arrow; the others are mirrors / transposes of it */
const LEFT = ['....c', '...cc', '..ccc', '.cccc', 'ccccc', '.CCCC', '..CCC', '...CC', '....C'];
const mirror = (rows: string[]) => rows.map((r) => [...r.padEnd(Math.max(...rows.map((q) => q.length)), '.')].reverse().join(''));
const transpose = (rows: string[]) => { const w = Math.max(...rows.map((r) => r.length)); return Array.from({ length: w }, (_, x) => rows.map((r) => r[x] ?? '.').join('')); };

/** fill maps (auto outline). 9-ish UI px fills -> 11-ish px icons */
const ICONS: Record<string, string[]> = {
  hammer: ['.mmmmmmM.', 'mmmmmmmMM', '.MMMwWMM.', '....wW...', '....wW...', '....wW...', '....wW...', '....wW...', '....WW...'],
  close: ['rr....RR', 'rrr..RRR', '.rrrRRR.', '..rrRR..', '..rrRR..', '.rrrRRR.', 'rrr..RRR', 'rr....RR'],
  check: ['......gg', '.....ggG', 'gg..ggG.', 'Gggggg..', '.Gggg...', '..GG....'],
  left: LEFT,
  right: mirror(LEFT),
  up: transpose(LEFT),
  down: transpose(LEFT).slice().reverse(),
  rotate: [
    '..cccc.c.',
    '.cc..cccc',
    'cc....ccc',
    'cc...cccc',
    'cc.......',
    'cc.......',
    'Cc....cC.',
    '.CC..CC..',
    '..CCCC...',
  ],
  trash: ['...mMm...', 'mmmmmmmMM', 'kkkkkkkkk', '.mmkmkmM.', '.mmkmkmM.', '.mmkmkmM.', '.mmkmkmM.', '.MMkMkMM.'],
  move: ['....c....', '...ccc...', '....c....', '.c..c..c.', 'ccccccccc', '.C..C..C.', '....C....', '...CCC...', '....C....'],
  chest: ['.wwwwwwww.', 'wwwwwwwwwW', 'bbbbyybbbB', 'wwwwbBwwwW', 'wwwwwwwwwW', 'WWWWWWWWWW', 'bBbbbbbbbB'],
  gear: [
    '...mm....',
    '.m.mm.m..',
    '..mmmmm..',
    'mmmkkmmMM',
    'mmmk.kmMM',
    '..mmkMM..',
    '.M.MM.M..',
    '...MM....',
  ],
  tv: ['..k...k...', '...k.k....', 'wwwwwwwwwW', 'wtttttTwbW', 'wtttttTwWW', 'wTTTTTTwbW', 'WWWWWWWWWW'],
  star: ['....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyY.', '..yyyyY..', '.yyyYYYY.', '.yY...YY.'],
  lock: ['..mmm..', '.m...M.', '.m...M.', 'bbbbbbB', 'bbbkbbB', 'bbbkbbB', 'BBBBBBB'],
  skull: ['.ccccc.', 'ccccccC', 'ckkckkC', 'ckkckkC', 'cccKcCC', '.cCcCC.', '.ckCkC.'],
  play: ['g.....', 'gg....', 'ggg...', 'gggg..', 'ggggg.', 'GGGG..', 'GGG...', 'GG....', 'G.....'],
  cog: [
    '...bb....',
    '.b.bb.b..',
    '..bbbbb..',
    'bbbkkbbBB',
    'bbbk.kbBB',
    '..bbkBB..',
    '.B.BB.B..',
    '...BB....',
  ],
  heart: ['.rrr.rrR.', 'rrcrrrrRR', 'rrrrrrrRR', 'rrrrrrRRR', '.rrrrRRR.', '..rrRRR..', '...rRR...', '....R....'],
  mana: ['...p...', '..ppp..', '.ppppp.', '.pcppP.', 'ppcpppP', 'ppppppP', 'pppppPP', '.pPPPP.', '..PPP..'],
  sword: ['........mm', '.......mmM', '......mmM.', '.....mmM..', 'bb..mmM...', '.bbmmM....', '..bbM.....', '.wWbbb....', 'wW..bb....', 'W.........'],
  wrench: ['.mm...mm.', 'mmm...mmM', 'mmmmmmmMM', '.mmmmmMM.', '...mmM...', '...mmM...', '...mmM...', '...mmM...', '...MMM...'],
  plus: ['..gG..', '..gG..', 'gggggG', 'GGGGGG', '..gG..', '..GG..'],
  minus: ['rrrrrR', 'RRRRRR'],
  bubble: ['..uuu..', '.ucuuu.', 'ucuuuuU', 'uuuuuuU', 'uuuuuUU', '.uuUUU.', '..UUU..'],
  door: ['.wwwww.', 'wwwkwwW', 'wwwkwwW', 'wwwkwbW', 'wwwkwwW', 'wwwkwwW', 'WWWkWWW'],
  '?': ['.cccc.', 'cc..cc', '....cc', '...cc.', '..cc..', '......', '..cc..'],
};

const iconCache = new Map<string, HTMLCanvasElement>();
/** a named UI icon at d texels per UI px (unknown names give a '?'): ~9-12 UI px with its outline */
export function iconTex(name: string, d = 1): HTMLCanvasElement {
  d = Math.max(1, Math.min(5, Math.round(d)));
  const key = name + '|' + d;
  let c = iconCache.get(key);
  if (!c) { c = paintMap(ICONS[name] ?? ICONS['?'], d); iconCache.set(key, c); }
  return c;
}
/** a named UI icon (1 texel per UI px; the classic API) */
export function icon(name: string): HTMLCanvasElement { return iconTex(name, 1); }
/** an icon's size in UI px */
export function iconSize(name: string): [number, number] { const c = icon(name); return [c.width, c.height]; }
export const ICON_NAMES = Object.keys(ICONS).filter((n) => n !== '?');

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

/** a mouse glyph (fill map, auto outline) with the left / right button or the wheel lit in gold */
export function mouseTex(btn: 'L' | 'R' | 'M', d = 1): HTMLCanvasElement {
  d = Math.max(1, Math.min(5, Math.round(d)));
  const key = 'mouse|' + btn + '|' + d;
  let c = iconCache.get(key);
  if (c) return c;
  const A = btn === 'L' ? 'y' : 'c', B = btn === 'R' ? 'y' : 'c', M = btn === 'M' ? 'y' : 'k';
  c = paintMap([
    `.${A}${A}k${B}${B}.`,
    `${A}${A}${A}${M}${B}${B}${B}`,
    `${A}${A}${A}${M}${B}${B}${B}`,
    'kkkkkkk',
    'cccccCC',
    'cccccCC',
    'ccccCCC',
    '.cCCCC.',
  ], d);
  iconCache.set(key, c);
  return c;
}
/** mouse glyph at 1x (classic API) */
export function mouseGlyph(btn: 'L' | 'R' | 'M'): HTMLCanvasElement { return mouseTex(btn, 1); }

// ------------------------------------------------------------------ cursors
export type CursorName = 'arrow' | 'point' | 'grab' | 'hammer' | 'rotate' | 'remove' | 'busy';
/** cursor fill maps (auto outline + a drop shadow); hot spots in UI px of the painted canvas (map + 1) */
const CURSORS: Record<CursorName, { rows: string[]; hx: number; hy: number }> = {
  arrow: { hx: 1, hy: 1, rows: [
    'c.......',
    'cc......',
    'ccc.....',
    'cccc....',
    'ccccc...',
    'cccccc..',
    'ccccccc.',
    'cccccccc',
    'ccccCC..',
    'ccC.cc..',
    'cC..cCC.',
    'C....cC.',
    '.....cC.',
  ] },
  point: { hx: 5, hy: 1, rows: [
    '....cc......',
    '....cc......',
    '....cc......',
    '....cckcc...',
    '....cckcckcc',
    'cc..cccccccc',
    'ccc.cccccccC',
    '.ccccccccccC',
    '..cccccccccC',
    '..ccccccccCC',
    '...cccccccC.',
    '....cccccC..',
    '....CCCCCC..',
  ] },
  grab: { hx: 6, hy: 5, rows: [
    '..cckcckcc.',
    '.cccccccccc',
    'cccccccccCC',
    'ccccccccccC',
    '.cccccccccC',
    '..ccccccccC',
    '...ccccccC.',
    '...CCCCCC..',
  ] },
  hammer: { hx: 2, hy: 2, rows: ICONS.hammer },
  rotate: { hx: 5, hy: 5, rows: ICONS.rotate },
  remove: { hx: 4, hy: 4, rows: ICONS.close },
  busy: { hx: 4, hy: 5, rows: ['bbbbbbb', '.ccccc.', '..cyc..', '...y...', '..cyc..', '.cyyyc.', 'BBBBBBB'] },
};
const curCache = new Map<string, { cv: HTMLCanvasElement; hx: number; hy: number; w: number; h: number }>();
/** a cursor at d texels per UI px: { cv, hx, hy (hot spot, UI px), w, h (UI px) } */
export function cursorTex(name: CursorName, d = 1) {
  d = Math.max(1, Math.min(5, Math.round(d)));
  const key = name + '|' + d;
  let c = curCache.get(key);
  if (!c) { const def = CURSORS[name] ?? CURSORS.arrow; const cv = paintMap(def.rows, d, true); c = { cv, hx: def.hx, hy: def.hy, w: cv.width / d, h: cv.height / d }; curCache.set(key, c); }
  return c;
}
/** a cursor at 1x (classic API): { cv, hx, hy } */
export function cursorArt(name: CursorName) { return cursorTex(name, 1); }
