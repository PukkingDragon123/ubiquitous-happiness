// The title logo, BLOBFISH: REEL REBELLION, as chunky pixel art with real depth: the Alagard word is built at 1:1
// (stepped gold bands, a lit top lip, a thick dark outline, a six-step block extrusion going crimson to black, a
// glint of the toothpick behind it) and blitted at 2x so every pixel is a 2 x 2 block. Below it hangs a crimson
// ribbon banner with REEL REBELLION. It drops in with a bounce, then bobs, and a shine sweeps across.
import { glyphs, FONTS } from '../ui/pixel/font';
import type { PixelUI } from '../ui/pixel/ui';

const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hexc = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

interface Built { base: HTMLCanvasElement; mask: HTMLCanvasElement; w: number; h: number }
let cache: Built | null = null;

function build(): Built {
  const g = glyphs('BLOBFISH:', { font: 'big', color: '#ffffff' });
  const gw = g.w, gh = g.h;
  const md = g.cv.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, gw, gh).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh && md[(y * gw + x) * 4 + 3] > 127;
  const P = 3, D = 6;
  const w = gw + P * 2 + D, h = gh + P * 2 + D;
  const base = cv(w, h), mask = cv(w, h);
  const b = base.getContext('2d')!, m = mask.getContext('2d')!;
  const img = b.createImageData(w, h), mi = m.createImageData(w, h);
  const set = (d: ImageData, x: number, y: number, c: number[]) => { const i = (y * w + x) * 4; d.data[i] = c[0]; d.data[i + 1] = c[1]; d.data[i + 2] = c[2]; d.data[i + 3] = 255; };
  const OUT = hexc('#12040a');
  const EXT = ['#8a1a22', '#741420', '#5a0e1a', '#440a14', '#30060e', '#1e040a'].map(hexc);
  const EXTL = ['#b8302a', '#9a2224', '#7a1820', '#5a1018', '#3e0a12', '#28060c'].map(hexc);
  const BANDS = ['#fffbe8', '#ffeaa0', '#ffd25a', '#ffb43a', '#f08a26', '#d0661a'].map(hexc);
  const cap = FONTS.big.cap;
  const fill = (x: number, y: number) => on(x - P, y - P);
  const nearFill = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && fill(x + dx, y + dy)) return true; return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (fill(x, y)) {
      const gy = y - P;
      let c = BANDS[Math.min(BANDS.length - 1, Math.floor((gy / Math.max(1, cap)) * BANDS.length))];
      if (!fill(x, y - 1)) c = BANDS[0];                       // lit top lip
      else if (!fill(x - 1, y)) c = BANDS[Math.max(0, BANDS.indexOf(c) - 1)]; // lit left edge
      if (!fill(x, y + 1)) c = hexc('#a84a12');                // a dark bottom lip
      set(img, x, y, c); set(mi, x, y, [255, 255, 255]);
      continue;
    }
    if (nearFill(x, y)) { set(img, x, y, OUT); continue; }
    // the block extrusion, down-right: the upper face of each step lighter (it catches the light)
    for (let k = 1; k <= D; k++) {
      if (nearFill(x - k, y - k)) { set(img, x, y, nearFill(x - k, y - k + 1) ? EXT[k - 1] : EXTL[k - 1]); break; }
    }
  }
  // close the extrusion with an outline
  const out = b.createImageData(w, h);
  out.data.set(img.data);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x, y - 1) || solid(x - 1, y - 1))) { const i = (y * w + x) * 4; out.data[i] = OUT[0]; out.data[i + 1] = OUT[1]; out.data[i + 2] = OUT[2]; out.data[i + 3] = 255; }
  b.putImageData(out, 0, 0); m.putImageData(mi, 0, 0);
  return { base, mask, w, h };
}

const shine = cv(1, 1);
/** logo size in UI pixels (drawn at 2x) */
export function logoSize() { cache ??= build(); return { w: cache.w * 2, h: cache.h * 2 + 18 }; }

/** draw the logo with its top-left at (x, y); t = seconds since the title appeared */
export function drawTitleLogo(ui: PixelUI, x: number, y: number, t: number) {
  cache ??= build();
  const L = cache, ctx = ui.ctx;
  // drop in with a bounce, then a slow bob
  const k = Math.min(1, t / 0.7);
  const drop = k < 1 ? -(1 - k) * (1 - k) * 90 + Math.sin(k * Math.PI) * 6 : 0;
  const bob = Math.round(Math.sin(t * 1.3) * 1.2) * 2;
  const yy = Math.round(y + drop) + bob;
  if (t < 0.05) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(L.base, Math.round(x), yy, L.w * 2, L.h * 2);
  // shine: a slanted band crossing every 4 s, clipped to the gold face
  const ph = ((t + 1.2) % 4) / 4;
  const sx = -20 + ph * (L.w + 80);
  if (sx < L.w + 20) {
    if (shine.width !== L.w || shine.height !== L.h) { shine.width = L.w; shine.height = L.h; }
    const s = shine.getContext('2d')!;
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, L.w, L.h);
    s.fillStyle = '#ffffff';
    for (let r = 0; r < L.h; r++) { const off = Math.round(sx - r * 0.6); s.fillRect(off, r, 3, 1); s.fillRect(off + 6, r, 1, 1); }
    s.globalCompositeOperation = 'destination-in';
    s.drawImage(L.mask, 0, 0);
    ctx.drawImage(shine, Math.round(x), yy, L.w * 2, L.h * 2);
  }
  // the ribbon unfurls after the drop
  const rk = Math.max(0, Math.min(1, (t - 0.6) / 0.45));
  if (rk > 0) ribbon(ui, Math.round(x + L.w - 2), yy + L.h * 2 - 8, rk);
}

function ribbon(ui: PixelUI, cx: number, y: number, k: number) {
  const text = 'REEL REBELLION';
  const g = glyphs(text, { font: 'title', color: '#fff4dc', color2: '#ffd27a', outline: '#2a0408' });
  const full = g.w + 26, w = Math.max(8, Math.round(full * (1 - Math.pow(1 - k, 3)))), h = 17;
  const x = Math.round(cx - w / 2);
  // folded tails
  for (const side of [-1, 1]) {
    const tx = side < 0 ? x - 12 : x + w;
    for (let i = 0; i < h; i++) {
      const notch = Math.round(5 * (1 - Math.abs(i - (h - 1) / 2) / ((h - 1) / 2)));
      const ww = 12 - notch;
      const col = i === 0 || i === h - 1 ? '#12040a' : i === 1 ? '#c8342c' : '#7a1018';
      ui.fill(side < 0 ? tx + notch : tx, y + 4 + i, ww, 1, col);
    }
    ui.fill(side < 0 ? x - 2 : x + w, y + h, 2, 4, '#3a0610');
  }
  ui.fill(x - 1, y - 1, w + 2, h + 2, '#12040a');
  ui.fill(x, y, w, h, '#a81c24');
  ui.fill(x, y, w, 1, '#f86a4a');
  ui.fill(x, y + 1, w, 1, '#d8382e');
  ui.fill(x, y + h - 2, w, 1, '#7a1018');
  ui.fill(x, y + h - 1, w, 1, '#4a0810');
  // gold stitching along the edges
  for (let i = 3; i < w - 3; i += 4) { ui.fill(x + i, y + 2, 2, 1, '#f0c040'); ui.fill(x + i, y + h - 3, 2, 1, '#f0c040'); }
  if (k > 0.85) {
    ui.ctx.save(); ui.ctx.beginPath(); ui.ctx.rect(x, y, w, h); ui.ctx.clip();
    ui.ctx.drawImage(g.cv, Math.round(cx - g.w / 2) + g.ox, y + 4 + g.oy);
    ui.ctx.restore();
  }
}
