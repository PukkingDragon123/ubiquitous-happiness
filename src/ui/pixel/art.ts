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
import { up } from './decor';
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
 * paint a fill map at 1 texel per UI px (v6: the kit is chunky; d > 1 callers get it blown up). Every filled region
 * gets a 1 px outline (sel-out: on the lit top / left of a shape the outline is the material's own deepest tone, ink
 * elsewhere), and per-pixel shading from the light: a highlight where both the top and left are open, a lit band
 * along top / left edges, shade along bottom / right edges, a deeper core shadow in the bottom-right corner of each
 * region and a specular pixel at its top-left. Uppercase = the shaded side of a shape, 'k' = a deliberate ink line.
 * `shadow` adds a soft drop shadow 1 px down-right.
 */
function paintMap(rows: string[], shadow = false): HTMLCanvasElement {
  const mw = Math.max(...rows.map((r) => r.length)), mh = rows.length;
  const pad = 1, sh = shadow ? 1 : 0;
  const W = mw + 2 * pad + sh, H = mh + 2 * pad + sh;
  const at = (gx: number, gy: number) => { const r = rows[gy - pad]; const ch = r?.[gx - pad]; return ch && ch !== '.' ? ch : ''; };
  const mat = (ch: string) => (ch && ch !== 'k' ? ch.toLowerCase() : '');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H), D = img.data;
  const put = (x: number, y: number, c: C, a = 255) => { const i = (y * W + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = a; };
  const mix = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const solid = new Uint8Array(W * H);
  const seen = new Set<string>();
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const ch = at(gx, gy), m = mat(ch);
    if (!m) {
      if (ch === 'k') { put(gx, gy, INK); solid[gy * W + gx] = 1; continue; }
      // the auto outline: ink, or the neighbouring material's deepest tone on the lit (top / left) side of a shape
      let near = '', litSide = false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const n = mat(at(gx + i, gy + j)); if ((i || j) && n) { near = near || n; if (i >= 0 && j >= 0 && (i || j)) litSide = true; } }
      if (!near) continue;
      const below = mat(at(gx, gy + 1)) || mat(at(gx + 1, gy));
      const dr = mat(at(gx - 1, gy)) || mat(at(gx, gy - 1));
      put(gx, gy, litSide && below && !dr ? mix(INK, (MAT[near] ?? MAT.c)[0], 0.75) : INK);
      solid[gy * W + gx] = 1;
      continue;
    }
    solid[gy * W + gx] = 1;
    const R = MAT[m] ?? MAT.c;
    const upper = ch !== ch.toUpperCase();
    const same = (dx: number, dy: number) => mat(at(gx + dx, gy + dy)) === m;
    const up = !same(0, -1), dn = !same(0, 1), lf = !same(-1, 0), rt = !same(1, 0);
    let tone = upper ? 2 : 1;
    if (up && lf) tone += 2; else if (up || lf) tone += 1;
    else if (!same(-1, -1)) tone += 1;
    if (dn && rt) tone -= 2; else if (dn || rt) tone -= 1;
    else if (!same(1, 1) && !upper) tone -= 1;
    // the first lit pixel of each region (top-left most) is the specular
    const key = m + (upper ? 'U' : 'L');
    let c = R[Math.max(0, Math.min(4, tone))];
    if (up && lf && !seen.has(key)) { seen.add(key); c = mix(R[4], [255, 255, 255], 0.5); }
    put(gx, gy, c);
  }
  if (shadow) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (D[i + 3]) continue;
      const sx = x - 1, sy = y - 1;
      if (sx >= 0 && sy >= 0 && solid[sy * W + sx]) { D[i] = 0; D[i + 1] = 0; D[i + 2] = 0; D[i + 3] = 110; }
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
  mail: ['ccccccccC', 'ckcccckcC', 'cckcckccC', 'cccrrcccC', 'cccRRcccC', 'CCCCCCCCC'],
  crown: ['y...y...y', 'yy.yyy.yy', 'yyyyyyyyY', 'yyrybyryY', 'YYYYYYYYY'],
  '?': ['.cccc.', 'cc..cc', '....cc', '...cc.', '..cc..', '......', '..cc..'],
};

const iconCache = new Map<string, HTMLCanvasElement>();
/** a named UI icon (1 texel per UI px; d > 1 blows it up), unknown names give a '?': ~10-13 UI px with its outline and
 *  its cast shadow */
export function iconTex(name: string, d = 1): HTMLCanvasElement {
  d = Math.max(1, Math.min(6, Math.round(d)));
  const key = name + '|' + d;
  let c = iconCache.get(key);
  if (!c) { c = d > 1 ? up(iconTex(name, 1), d) : paintMap(ICONS[name] ?? ICONS['?'], true); iconCache.set(key, c); }
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
  d = Math.max(1, Math.min(6, Math.round(d)));
  const key = 'mouse|' + btn + '|' + d;
  let c = iconCache.get(key);
  if (c) return c;
  if (d > 1) { c = up(mouseTex(btn, 1), d); iconCache.set(key, c); return c; }
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
  ]);
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
/**
 * v8b: cursors are FLAT: one bone fill, a 1 px ink outline (8-neighbour), a 1 px soft shadow down-right; 'y' cells
 * are the gold accent (the busy glass), everything else is bone. No bevel, no shading.
 */
function paintFlat(rows: string[]): HTMLCanvasElement {
  const mw = Math.max(...rows.map((r) => r.length)), mh = rows.length;
  const W = mw + 3, H = mh + 3;
  const on = (x: number, y: number) => { const ch = rows[y - 1]?.[x - 1]; return !!ch && ch !== '.'; };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const put = (x: number, y: number, c: string, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  const edge = (x: number, y: number) => !on(x, y) && [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].some(([dx, dy]) => on(x + dx, y + dy));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!on(x, y) && !edge(x, y) && (on(x - 1, y - 1) || edge(x - 1, y - 1))) put(x, y, '#000000', 0.3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (edge(x, y)) { put(x, y, '#0b111c'); continue; }
    if (!on(x, y)) continue;
    const ch = rows[y - 1][x - 1];
    put(x, y, ch === 'k' ? '#0b111c' : ch === 'y' || ch === 'Y' ? '#d4b273' : ch === 'b' || ch === 'B' ? '#56637a' : '#efe7d4');
  }
  ctx.globalAlpha = 1;
  return cv;
}
/** a cursor at d texels per UI px: { cv, hx, hy (hot spot, UI px), w, h (UI px) } */
export function cursorTex(name: CursorName, d = 1) {
  d = Math.max(1, Math.min(6, Math.round(d)));
  const key = name + '|' + d;
  let c = curCache.get(key);
  if (!c) { const def = CURSORS[name] ?? CURSORS.arrow; const base = paintFlat(def.rows); c = { cv: up(base, d), hx: def.hx, hy: def.hy, w: base.width, h: base.height }; curCache.set(key, c); }
  return c;
}
/** a cursor at 1x (classic API): { cv, hx, hy } */
export function cursorArt(name: CursorName) { return cursorTex(name, 1); }
