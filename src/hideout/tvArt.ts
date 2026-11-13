// Pixel art for the TV: the chunky BLOBFISH logo (extruded block shadow, thick outline, stepped colour bands,
// a moving shine sweep and a ribbon for the subtitle), a 2-frame swimming blobfish sprite, little fish, and the
// parallax ocean layers behind the menu. Everything is flat-coloured pixels at the TV's 1:1 scale.
import { glyphs, FONTS } from '../ui/pixel/font';

type Ctx = CanvasRenderingContext2D;
const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ------------------------------------------------------------------ the logo
interface Logo { base: HTMLCanvasElement; mask: HTMLCanvasElement; w: number; h: number; fx: number; fy: number }
let logoCache: Logo | null = null;

function buildLogo(): Logo {
  const g = glyphs('BLOBFISH', { font: 'big', color: '#ffffff' });
  const gw = g.w, gh = g.h;
  const md = g.cv.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, gw, gh).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh && md[(y * gw + x) * 4 + 3] > 127;
  const P = 3, D = 4; // outline pad, extrusion depth
  const w = gw + P * 2 + D, h = gh + P * 2 + D;
  const base = cv(w, h), mask = cv(w, h);
  const b = base.getContext('2d')!, m = mask.getContext('2d')!;
  const img = b.createImageData(w, h), mi = m.createImageData(w, h);
  const set = (d: ImageData, x: number, y: number, c: number[]) => { const i = (y * w + x) * 4; d.data[i] = c[0]; d.data[i + 1] = c[1]; d.data[i + 2] = c[2]; d.data[i + 3] = 255; };
  const hexc = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const OUT = hexc('#1a0806'), EXT = [hexc('#5a2008'), hexc('#4a1806'), hexc('#3a1204'), hexc('#2a0c02')];
  const BANDS = ['#fffbe0', '#ffe48a', '#ffc23a', '#f59a2a', '#d8701e'].map(hexc);
  const cap = FONTS.big.cap;
  const fill = (x: number, y: number) => on(x - P, y - P);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (fill(x, y)) {
      const gy = y - P;
      // stepped bands top -> bottom, a 1 px lit lip where the pixel above is empty
      let c = BANDS[Math.min(BANDS.length - 1, Math.floor((gy / Math.max(1, cap)) * BANDS.length))];
      if (!fill(x, y - 1)) c = BANDS[0];
      set(img, x, y, c); set(mi, x, y, [255, 255, 255]);
      continue;
    }
    // 2 px outline (4-neighbour, then 8-neighbour)
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && fill(x + dx, y + dy)) { near = true; break; }
    if (near) { set(img, x, y, OUT); continue; }
    // the block extrusion down-right
    for (let k = 1; k <= D; k++) {
      let hit = false;
      for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && fill(x - k + dx, y - k + dy)) { hit = true; break; }
      if (hit) { set(img, x, y, EXT[k - 1]); break; }
    }
  }
  b.putImageData(img, 0, 0); m.putImageData(mi, 0, 0);
  return { base, mask, w, h, fx: P, fy: P };
}

const shineCv = cv(1, 1);
/** draw the logo centred at (cx, y); t drives the shine sweep */
export function drawLogo(ctx: Ctx, cx: number, y: number, t: number) {
  if (!logoCache) logoCache = buildLogo();
  const L = logoCache;
  const x = Math.round(cx - L.w / 2);
  ctx.drawImage(L.base, x, Math.round(y));
  // shine: a slanted 5 px band crossing every 3.2 s, clipped to the glyph fill
  const ph = (t % 3.2) / 3.2;
  const sx = -20 + ph * (L.w + 60);
  if (sx < L.w + 20) {
    if (shineCv.width !== L.w || shineCv.height !== L.h) { shineCv.width = L.w; shineCv.height = L.h; }
    const s = shineCv.getContext('2d')!;
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, L.w, L.h);
    s.fillStyle = '#ffffff';
    for (let yy = 0; yy < L.h; yy++) { const off = Math.round(sx - yy * 0.6); s.fillRect(off, yy, 4, 1); s.fillRect(off + 7, yy, 1, 1); }
    s.globalCompositeOperation = 'destination-in';
    s.drawImage(L.mask, 0, 0);
    ctx.drawImage(shineCv, x, Math.round(y));
  }
}
export function logoSize() { if (!logoCache) logoCache = buildLogo(); return { w: logoCache.w, h: logoCache.h }; }

/** a folded ribbon banner with text (the subtitle) */
export function drawRibbon(ctx: Ctx, cx: number, y: number, text: string) {
  const g = glyphs(text, { font: 'title', color: '#e8fbff', color2: '#7ad8ff', shadow: '#02203a' });
  const w = g.w + 20, h = 15, x = Math.round(cx - w / 2);
  const fill = (c: string, rx: number, ry: number, rw: number, rh: number) => { ctx.fillStyle = c; ctx.fillRect(rx, ry, rw, rh); };
  // folded tails
  for (const side of [-1, 1]) {
    const tx = side < 0 ? x - 10 : x + w;
    fill('#0a2a6a', tx, y + 4, 10, h);
    fill('#020818', tx, y + 3, 10, 1); fill('#020818', tx, y + 4 + h, 10, 1);
    // notch
    for (let k = 0; k < 4; k++) fill('#06144a', side < 0 ? tx + k : tx + 9 - k, y + 4 + 4 + k, 1, h - 8 - k * 2 > 0 ? h - 8 - k * 2 : 1);
    fill('#041038', side < 0 ? x - 2 : x + w, y + h, 2, 4); // fold shadow
  }
  fill('#020818', x - 1, y - 1, w + 2, h + 2);
  fill('#1a4ab0', x, y, w, h);
  fill('#3a7ae0', x, y, w, 1);
  fill('#0c2a6a', x, y + h - 1, w, 1);
  ctx.drawImage(g.cv, Math.round(cx - g.w / 2) + g.ox, y + 3 + g.oy);
}

// ------------------------------------------------------------------ sprites
function paint(rows: string[], pal: Record<string, string>) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = cv(w, h), x = c.getContext('2d')!;
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const col = pal[r[i]]; if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); } } });
  return c;
}
const BLOB_PAL: Record<string, string> = { k: '#3a0e1e', p: '#f4a0b4', P: '#d87090', l: '#ffd0dc', r: '#c8304a', w: '#ffffff', e: '#1a0810', n: '#e08098', b: '#9a1a34' };
const BLOB_A = [
  '..........kkkkkkk.......',
  '.......kkkrrrrrrrkk.....',
  '.....kkrrwrrwrrrwrrk....',
  '....kppprrrrrrrrrrrpk...',
  '...kpllppppppppppplppk..',
  'kk.kplppppppppppewppppk.',
  'kPkkpppppppppppppeepppk.',
  'kPPkpppppppppppppppnnnnk',
  'kPPPPppppppppppppnnnnnnk',
  'kPPkpPppppppppppppnnnnk.',
  'kPkkpPPpppppppppppbbbk..',
  'kk..kPPPppppppppppppk...',
  '.....kkPPPPPPPPPPPkk....',
  '.......kkkkkkkkkkk......',
];
const BLOB_B = [
  '..........kkkkkkk.......',
  '.......kkkrrrrrrrkk.....',
  '.....kkrrwrrwrrrwrrk....',
  '....kppprrrrrrrrrrrpk...',
  '...kpllppppppppppplppk..',
  '...kplppppppppppewppppk.',
  'kk.kpppppppppppppeepppk.',
  'kPkkpppppppppppppppnnnnk',
  'kPPPPppppppppppppnnnnnnk',
  'kPkkpPppppppppppppnnnnk.',
  'kk..pPPpppppppppppbbbk..',
  '....kPPPppppppppppppk...',
  '.....kkPPPPPPPPPPPkk....',
  '.......kkkkkkkkkkk......',
];
let blobFrames: HTMLCanvasElement[] | null = null;
export function blobSprite(frame: number) { blobFrames ??= [paint(BLOB_A, BLOB_PAL), paint(BLOB_B, BLOB_PAL)]; return blobFrames[frame & 1]; }

let fishCv: HTMLCanvasElement[] | null = null;
export function fishSprite(kind: number) {
  fishCv ??= [
    paint(['..kk..', 'kkyyk.', 'kyyyyk', 'kkyyk.', '..kk..'], { k: '#2a1a08', y: '#ffc23a' }),
    paint(['...kk..', 'k.kccck', 'kkccccw', 'k.kccck', '...kk..'], { k: '#06203a', c: '#4ac8ff', w: '#ffffff' }),
  ];
  return fishCv[kind % 2];
}

// ------------------------------------------------------------------ parallax ocean layers (tileable horizontally)
function layer(w: number, h: number, fn: (x: number, y: number) => string | null) {
  const c = cv(w, h), x = c.getContext('2d')!;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const col = fn(xx, yy); if (col) { x.fillStyle = col; x.fillRect(xx, yy, 1, 1); } }
  return c;
}
let layers: HTMLCanvasElement[] | null = null;
/** [far ridge, mid rocks + coral, near kelp] — each 320 px wide, bottom-aligned */
export function oceanLayers() {
  if (layers) return layers;
  const ridge = (x: number, a: number, b: number, c: number) => Math.round(a + Math.sin((x / 320) * Math.PI * 2 * b + c) * 6 + Math.sin((x / 320) * Math.PI * 2 * (b * 3) + c * 2) * 3);
  layers = [
    layer(320, 60, (x, y) => (y > ridge(x, 30, 2, 0.4) ? (y > ridge(x, 30, 2, 0.4) + 1 ? '#0a1d5c' : '#12287a') : null)),
    layer(320, 60, (x, y) => {
      const top = ridge(x, 34, 3, 1.7);
      if (y > top) return y === top + 1 ? '#1e2a5a' : (x + y) % 11 === 0 ? '#16204a' : '#121a40';
      // coral fans on the mid ridge
      const cx = x % 64;
      if (cx > 20 && cx < 30 && y > top - 12 && y <= top && Math.abs(cx - 25) < (y - top + 12) / 2 && (x + y) % 2 === 0) return '#7a2a6a';
      return null;
    }),
    layer(320, 110, (x, y) => {
      // kelp blades rising from the bottom
      for (let i = 0; i < 7; i++) {
        const bx = i * 46 + 12, top = 10 + (i * 37) % 50;
        if (y < top) continue;
        const sway = Math.round(Math.sin(y * 0.08 + i) * 3);
        const dx = x - (bx + sway);
        if (dx >= 0 && dx < 3) return dx === 0 ? '#0e2a14' : dx === 1 ? '#1e4a24' : '#163a1c';
        if (y % 9 === i % 9 && (dx === 3 || dx === 4 || dx === -1 || dx === -2)) return '#1e4a24';
      }
      return null;
    }),
  ];
  return layers;
}
