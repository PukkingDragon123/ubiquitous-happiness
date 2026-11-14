// Hand-placed pixel art for the dungeon HUD (src/ui/hud3.ts) and anything else that wants the same symbols
// (pickups, shop price tags, the planning table): hearts, stamina / mana bar caps, kelp-tea flasks, pearls,
// keys, puffer-bombs and the minimap room glyphs. Every sprite is an ASCII map with its own small hue-shifted
// palette: a selective outline (deep hue of the fill, never flat black), a 4-6 tone ramp lit from the top left,
// and a hard white shine. Sizes are in UI pixels (the PixelUI canvas is ~360 px tall).
//
//   hudArt('heart')            13x12 canvas (cached)        names: HUD_ART_NAMES
//   hudArt('heart', 'white')   the same silhouette filled flat (hit flash)
//   hudBig('pearl', 3)         an integer-upscaled copy (for previews / pickups shown big)

type Pal = Record<string, string>;
const cache = new Map<string, HTMLCanvasElement>();

function paint(rows: string[], pal: Pal, flat?: string): HTMLCanvasElement {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!;
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) { x.fillStyle = flat ?? c; x.fillRect(i, y, 1, 1); } } });
  return cv;
}

// ------------------------------------------------------------------ palettes
const HEART: Pal = { k: '#3a0816', D: '#8a1232', d: '#b81c3a', R: '#e8304a', r: '#ff6a6a', P: '#ffb0b0', W: '#ffffff' };
const EMPTY: Pal = { k: '#3a0816', D: '#1c0a14', d: '#24101c', R: '#2e1624', r: '#3e2030', P: '#4e2a3c', W: '#6a3a50' };
const SOUL: Pal = { k: '#0a1440', D: '#1a3a8a', d: '#2456b8', R: '#3a7ae8', r: '#6aacff', P: '#b0dcff', W: '#ffffff' };
const GOLDH: Pal = { k: '#3a1a04', D: '#8a4a08', d: '#b87010', R: '#e8a020', r: '#ffd050', P: '#fff0a0', W: '#ffffff' };
const PEARL: Pal = { k: '#2a2040', D: '#6a5a8a', d: '#9a8cb8', R: '#cfc4e2', r: '#ece6f6', P: '#fff4fa', W: '#ffffff', p: '#ffc8e0' };
const KEY: Pal = { k: '#3a1c04', D: '#8a4a0a', d: '#b8741a', R: '#e8a832', r: '#ffd870', W: '#fffbe0' };
const BOMB: Pal = { k: '#2a1404', D: '#8a4a0c', d: '#c07a18', R: '#eab040', r: '#ffd878', W: '#fffbe0', s: '#5a2a08', e: '#140a04', f: '#9a8a6a', F: '#ff8a2a', Y: '#fff2a0', w: '#ffffff' };
const FLASK: Pal = { k: '#0e2418', g: '#9ad8c8', G: '#5aa894', c: '#c8884a', C: '#7a4a1c', T: '#3a8a2a', t: '#7ac83a', L: '#b8f070', W: '#ffffff', e: '#1a3a30', E: '#24503e' };
const MANA: Pal = { k: '#0c0a3a', D: '#22208a', d: '#3a46d0', R: '#5a8af0', r: '#9ad0ff', W: '#ffffff' };
const STAM: Pal = { k: '#0e2408', D: '#2a6a12', d: '#4aa020', R: '#8ad83a', r: '#d0f878', W: '#ffffff' };
const MAP: Pal = { k: '#06080e', w: '#ffffff', l: '#d8d2c8', y: '#ffd860', Y: '#e09a20', r: '#e83a3a', R: '#8a1424', b: '#7ac8ff', B: '#2a6ad0', g: '#7a7a8a', G: '#44444e', p: '#f4b0c8', o: '#c86a2a', O: '#6a3410', c: '#9ff4ff' };
const SKULL: Pal = { k: '#1a0a0e', w: '#fff6e8', l: '#d8ccb8', d: '#9a8a78', r: '#ff3a3a' };

// ------------------------------------------------------------------ sprites
const HEART_ROWS = [
  '..kkk...kkk..',
  '.kPrRk.krRRk.',
  'kPWWrRkrRRRdk',
  'kPWrRRRRRRRdk',
  'krrRRRRRRRRdk',
  'kRRRRRRRRRddk',
  '.kRRRRRRRddk.',
  '..kRRRRRddk..',
  '...kRRRddk...',
  '....kRdDk....',
  '.....kDk.....',
  '......k......',
];
const halfOf = (rows: string[]) => rows.map((r) => r.split('').map((c, i) => (i >= 7 && c !== 'k' && c !== '.' ? 'E' : c)).join(''));

const SPRITES: Record<string, { rows: string[]; pal: Pal }> = {
  heart: { rows: HEART_ROWS, pal: HEART },
  heartEmpty: { rows: HEART_ROWS, pal: EMPTY },
  heartHalf: { rows: halfOf(HEART_ROWS), pal: { ...HEART, E: EMPTY.R } },
  heartSoul: { rows: HEART_ROWS, pal: SOUL },
  heartSoulHalf: { rows: halfOf(HEART_ROWS), pal: { ...SOUL, E: EMPTY.R } },
  heartGold: { rows: HEART_ROWS, pal: GOLDH },
  pearl: { pal: PEARL, rows: [
    '..kkkkk..',
    '.kPWrRRk.',
    'kPWWrRRdk',
    'kPWrRRRdk',
    'krrRRRddk',
    'kRRRRRddk',
    'kpRRRddDk',
    '.kdddDDk.',
    '..kkkkk..',
  ] },
  key: { pal: KEY, rows: [
    '..kkkk..',
    '.kWrrRk.',
    'kWrkkRdk',
    'krk..kdk',
    'kRk..kdk',
    'kRdkkddk',
    '.kRddDk.',
    '..kRDk..',
    '..kRDkk.',
    '..kRDrDk',
    '..kRDkk.',
    '..kRDrDk',
    '..kRDDk.',
    '...kkk..',
  ] },
  bomb: { pal: BOMB, rows: [
    '........Yw..',
    '.......YFY..',
    '......kfk...',
    '..k.kkfk.k..',
    '.kRkrrRRkRk.',
    '..kWrRRRRdk.',
    '.krWrRRRRRdk',
    'kRrrRRekReRdk'.slice(0, 12),
    '.kRRRRRRRRdk',
    '.kdRRRssRRdk',
    '..kdRRRRddk.',
    '.kDkdddddkDk',
    '..k.kkkkk.k.',
  ] },
  flask: { pal: FLASK, rows: [
    '..kkk..',
    '..kck..',
    '..kCk..',
    '.kkkkk.',
    '..kgk..',
    '.kgLTk.',
    'kgWtTTk',
    'kgtTTTk',
    'kGtTTTk',
    'kGTTTTk',
    '.kkkkk.',
  ] },
  flaskEmpty: { pal: FLASK, rows: [
    '..kkk..',
    '..kck..',
    '..kCk..',
    '.kkkkk.',
    '..kgk..',
    '.kgeEk.',
    'kgWeeEk',
    'kgeeeEk',
    'kGeeeEk',
    'kGEEEEk',
    '.kkkkk.',
  ] },
  manaGem: { pal: MANA, rows: [
    '...k...',
    '..kWk..',
    '.kWrRk.',
    'kWrRRdk',
    'krRRddk',
    '.kRddk.',
    '..kDk..',
    '...k...',
  ] },
  stamLeaf: { pal: STAM, rows: [
    '....kk.',
    '..kkrRk',
    '.krWrRk',
    'krWrRdk',
    'krrRddk',
    'kRRdDk.',
    'kkkkk..',
    'k......',
  ] },
  // ---- minimap glyphs (7x7, drawn on the room tiles)
  mTreasure: { pal: MAP, rows: [
    '.......',
    'y.y.y.y',
    'yyyyyyy',
    'yyYyYyy',
    'yyyyyyy',
    '.YYYYY.',
    '.......',
  ] },
  mShop: { pal: MAP, rows: [
    '..kkk..',
    '.kyyyk.',
    'kyyYyyk',
    'kyYyYyk',
    'kyyYyyk',
    '.kYYYk.',
    '..kkk..',
  ] },
  mBoss: { pal: SKULL, rows: [
    '.kkkkk.',
    'kwwwwlk',
    'kwkwkdk',
    'kwkwkdk',
    'kwwlwdk',
    '.kwkdk.',
    '..kkk..',
  ] },
  mPost: { pal: MAP, rows: [
    '.......',
    'kkkkkkk',
    'kwlllwk',
    'klwlwlk',
    'kllwllk',
    'kkkkkkk',
    '.......',
  ] },
  mSecret: { pal: MAP, rows: [
    '..kkk..',
    '.kcbck.',
    '.kbkbk.',
    '...kbk.',
    '..kbk..',
    '.......',
    '..kbk..',
  ] },
  mChallenge: { pal: MAP, rows: [
    'lk...kl',
    'klk.klk',
    '.klklk.',
    '..klk..',
    '.kOkOk.',
    'kOk.kOk',
    'kk...kk',
  ] },
  mStart: { pal: MAP, rows: [
    '.......',
    '...w...',
    '..www..',
    '.wwwww.',
    '..www..',
    '...w...',
    '.......',
  ] },
  mYou: { pal: MAP, rows: [
    '.kkk.',
    'kpppk',
    'kpwpk',
    'kpppk',
    '.kkk.',
  ] },
  // ---- boss bar emblem
  skull: { pal: SKULL, rows: [
    '..kkkkk..',
    '.kwwwwlk.',
    'kwwwwwldk',
    'kwkkwkkdk',
    'kwkrwkrdk',
    'kwwwlwwdk',
    '.kwlklldk',
    '..kwdwdk.',
    '..kkkkk..',
  ] },
  pip: { pal: { k: '#1a0606', y: '#ffe070', Y: '#d08a14', W: '#ffffff' }, rows: ['..k..', '.kWk.', 'kyyYk', '.kYk.', '..k..'] },
  pipOff: { pal: { k: '#1a0606', y: '#4a3a3a', Y: '#2a2020', W: '#5a4a4a' }, rows: ['..k..', '.kWk.', 'kyyYk', '.kYk.', '..k..'] },
};

export type HudArtName = keyof typeof SPRITES;
export const HUD_ART_NAMES = Object.keys(SPRITES) as HudArtName[];

/** a HUD sprite (cached). `flat` paints every pixel one colour (hit flashes, silhouettes) */
export function hudArt(name: HudArtName | string, flat?: string): HTMLCanvasElement {
  const key = name + '|' + (flat ?? '');
  let c = cache.get(key);
  if (!c) {
    const sp = SPRITES[name] ?? SPRITES.pearl;
    c = paint(sp.rows, sp.pal, flat);
    cache.set(key, c);
  }
  return c;
}

/** an integer-upscaled copy (nearest) */
export function hudBig(name: HudArtName | string, k: number): HTMLCanvasElement {
  const key = name + '|x' + k;
  let c = cache.get(key);
  if (!c) {
    const s = hudArt(name);
    c = document.createElement('canvas'); c.width = s.width * k; c.height = s.height * k;
    const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, c.width, c.height);
    cache.set(key, c);
  }
  return c;
}
