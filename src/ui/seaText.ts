// Sea text (v7): the one look for every word that floats over the world. No 3D text meshes anywhere: words are crisp
// 2D pixel-font text drawn on the screen's UI canvas (src/ui/pixel, the 640x360 grid at canvas density), projected
// from a world point each frame when they belong to something.
//
//   - glyphs: Alagard (the one UI face, v8b) at an INTEGER canvas scale per size tier (never resampled, so always
//     crisp), a clean stepped two-tone fill (no gradient noise, no dither)
//   - a soft dark outline for readability over bright sand and deep water alike: a hard one-font-pixel ring, a
//     see-through one-UI-pixel halo round it and a drop shadow one UI pixel down (flat alpha bands, no blur)
//   - small, real-looking air bubbles as accents (SeaBubbles): round at canvas density, a thin bright rim lit from
//     above, a darker refracting edge low on the far side, a faint body and one soft highlight (matte: no glare), that
//     wobble up off the words, swell a little and POP (a broken ring and a few droplets)
//
//   const art = seaArt('HOME', SEA.title, 'big', ui.hd)        cached edge + fill canvases of a string
//   seaDraw(ui, art, X, Y, 'edge' | 'fill', alpha)              X / Y in CANVAS px (cap top-left of the string)
//   seaWidth('HOME', 'big', ui.hd)                              width in UI px
//   const fx = new SeaBubbles(); fx.add(x, y, { r: 2 }); fx.step(dt); fx.draw(ui)   (UI px)
//   onScreenUI((ui) => ...)    draw on the screen UI that is drawing now, else on the next one to finish a frame
import * as THREE from 'three';
import { glyphs, capH, measure, fontK, type FontName } from './pixel/font';
import { PixelUI } from './pixel/ui';
import { POST } from '../gfx/post';

export interface SeaStyle {
  /** fill: upper / lower part of the glyphs (stepped, with one blended band between) */
  top: string; bottom: string;
  /** the dark outline (the halo and shadow are a deeper shade of it) */
  edge: string;
}

/** a few ready styles (world text styles live in src/ui/text3d.ts T3D, which are SeaStyles too) */
export const SEA = {
  speech: { top: '#f3ecdc', bottom: '#e2d8c2', edge: '#0b111c' },
  title: { top: '#f1e3bd', bottom: '#d4b273', edge: '#14100a' },
  hint: { top: '#e6ebf2', bottom: '#b9c4d4', edge: '#0b111c' },
} satisfies Record<string, SeaStyle>;

/**
 * the size tiers (cap height in UI px, about): small 6.6, body 11, title 15.5, big 22, huge 33, giant 44. Each tier is
 * Alagard 16 at an integer canvas scale (the kit's roles for small..big, then 3x / 4x UI px per font px), so its
 * pixels are always whole.
 */
export type Tier = 'small' | 'body' | 'title' | 'big' | 'huge' | 'giant';
export const TIERS: Tier[] = ['small', 'body', 'title', 'big', 'huge', 'giant'];
const TIER_LH: Record<Tier, number> = { small: 11, body: 15, title: 21, big: 30, huge: 46, giant: 60 };

/** the face and integer canvas px per font px of a tier on a canvas of density hd */
export function tierSpec(tier: Tier, hd: number): { face: FontName; k: number } {
  hd = Math.max(1, Math.round(hd));
  switch (tier) {
    case 'small': case 'body': case 'title': case 'big': return { face: 'body', k: fontK(tier, hd) };
    case 'huge': return { face: 'body', k: hd * 3 };
    case 'giant': return { face: 'body', k: hd * 4 };
  }
}
/** cap height of a tier in UI px */
export function tierCap(tier: Tier, hd: number) { const s = tierSpec(tier, hd); return (capH(s.face) * s.k) / Math.max(1, hd); }
/** line height of a tier in UI px */
export function tierLh(tier: Tier) { return TIER_LH[tier]; }
/** width of a string in UI px */
export function seaWidth(str: string, tier: Tier, hd: number) { const s = tierSpec(tier, hd); return (measure(str, s.face) * s.k) / Math.max(1, hd); }
/** width of a string in CANVAS px (advance, no outline) */
export function seaWidthC(str: string, tier: Tier, hd: number) { const s = tierSpec(tier, hd); return measure(str, s.face) * s.k; }

/** the tier whose cap is nearest (in ratio) to capUI, among the allowed range */
export function pickTier(capUI: number, hd: number, min: Tier = 'small', max: Tier = 'giant'): Tier {
  const i0 = TIERS.indexOf(min), i1 = TIERS.indexOf(max);
  let best: Tier = min, bd = 1e9;
  for (let i = i0; i <= i1; i++) {
    const d = Math.abs(Math.log(Math.max(0.5, capUI) / tierCap(TIERS[i], hd)));
    if (d < bd) { bd = d; best = TIERS[i]; }
  }
  return best;
}

// ------------------------------------------------------------------ colour helpers
type RGB = [number, number, number];
function hex(c: string): RGB {
  let s = c.replace('#', '');
  if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('');
  return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
}
function mixC(a: RGB, b: RGB, k: number): RGB { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k].map(Math.round) as RGB; }
const toHex = (c: RGB) => '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
const lum = (c: RGB) => (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15) / 255;
/** a colour lifted until it reads as light text on the dark outline (name tags in a speaker's colour) */
export function readable(c: string, min = 0.62): string {
  let v = hex(c);
  for (let i = 0; i < 12 && lum(v) < min; i++) v = mixC(v, [255, 248, 236], 0.18);
  return toHex(v);
}
/** a light pair (top, bottom) for a single fill colour */
export function lightPair(c: string): [string, string] { const v = hex(readable(c, 0.6)); return [toHex(mixC(v, [255, 252, 244], 0.35)), toHex(v)]; }

// ------------------------------------------------------------------ glyph art
export interface SeaArt {
  /** the soft dark outline: hard ring + halo + drop shadow (draw first, under every fill) */
  edge: HTMLCanvasElement;
  /** the glyphs themselves */
  fill: HTMLCanvasElement;
  /** canvas px from the art's origin to the string's cap top-left (the art is drawn at X - pad, Y - pad) */
  pad: number;
  /** advance width in canvas px */
  adv: number;
  /** cap height in canvas px */
  cap: number;
}
const artCache = new Map<string, SeaArt>();

/** the outline / fill canvases of a string at a tier, for a canvas of density hd (cached) */
export function seaArt(str: string, st: SeaStyle, tier: Tier, hd: number): SeaArt {
  hd = Math.max(1, Math.round(hd));
  const key = [str, st.top, st.bottom, st.edge, tier, hd].join('|');
  const hit = artCache.get(key);
  if (hit) return hit;
  const { face, k } = tierSpec(tier, hd);
  const cap = Math.max(1, capH(face));
  const adv = measure(str, face) * k;
  const g = glyphs(str || ' ', { font: face, color: '#ffffff' });
  const gw = g.w, gh = g.h;
  const src = g.cv.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, gw, gh).data;
  const on = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) on[i] = src[i * 4 + 3] > 127 ? 1 : 0;
  // the hard ring: one FONT pixel round the glyphs (8-neighbour), on the glyph grid so it stays chunky
  const isOn = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh && on[y * gw + x] === 1;
  const halo = Math.max(1, hd), shadow = Math.max(1, hd);
  const pad = k + halo + shadow + 1;
  const W = gw * k + pad * 2, H = gh * k + pad * 2;
  // core (glyph + ring) in canvas px
  const core = new Uint8Array(W * H);
  const fillC = document.createElement('canvas'); fillC.width = W; fillC.height = H;
  const edgeC = document.createElement('canvas'); edgeC.width = W; edgeC.height = H;
  const fctx = fillC.getContext('2d')!, ectx = edgeC.getContext('2d')!;
  const FI = fctx.createImageData(W, H), EI = ectx.createImageData(W, H);
  const top = hex(st.top), bot = hex(st.bottom), mid = mixC(top, bot, 0.5);
  const edge = hex(st.edge), deep = mixC(edge, [2, 6, 10], 0.55);
  const blockK = (gx: number, gy: number, fn: (x: number, y: number) => void) => {
    for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) fn(pad + gx * k + xx, pad + gy * k + yy);
  };
  for (let gy = -1; gy <= gh; gy++) for (let gx = -1; gx <= gw; gx++) {
    if (isOn(gx, gy)) {
      const c = gy < cap * 0.42 ? top : gy < cap * 0.64 ? mid : bot;
      blockK(gx, gy, (x, y) => { const i = (y * W + x) * 4; FI.data[i] = c[0]; FI.data[i + 1] = c[1]; FI.data[i + 2] = c[2]; FI.data[i + 3] = 255; core[y * W + x] = 2; });
      continue;
    }
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isOn(gx + dx, gy + dy)) { near = true; break; }
    if (near) { blockK(gx, gy, (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) core[y * W + x] = Math.max(core[y * W + x], 1); }); }
  }
  // edge: the ring (dense), then the halo (a rounded one-UI-px band) and the drop shadow (one UI px down), flat alphas
  const put = (x: number, y: number, c: RGB, a: number) => {
    const i = (y * W + x) * 4;
    if (EI.data[i + 3] >= a) return;
    EI.data[i] = c[0]; EI.data[i + 1] = c[1]; EI.data[i + 2] = c[2]; EI.data[i + 3] = a;
  };
  const R = halo + 0.35, R2 = R * R, ri = Math.ceil(R);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = core[y * W + x];
    if (c === 1) { put(x, y, edge, 238); continue; }
    if (c === 2) continue;
    // shadow: the core one UI px higher lands here
    const sy = y - shadow;
    if (sy >= 0 && core[sy * W + x]) { put(x, y, deep, 150); continue; }
    // halo: within R of the core
    let hit = false;
    for (let dy = -ri; dy <= ri && !hit; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > R2) continue;
        const xx = x + dx; if (xx < 0 || xx >= W) continue;
        if (core[yy * W + xx]) { hit = true; break; }
      }
    }
    if (hit) put(x, y, deep, 92);
  }
  fctx.putImageData(FI, 0, 0); ectx.putImageData(EI, 0, 0);
  const out: SeaArt = { edge: edgeC, fill: fillC, pad, adv, cap: cap * k };
  artCache.set(key, out);
  if (artCache.size > 1800) artCache.clear();
  return out;
}

/** blit one pass of a string's art: X / Y = canvas px of the string's cap top-left */
export function seaDraw(ctx: CanvasRenderingContext2D, art: SeaArt, X: number, Y: number, pass: 'edge' | 'fill', alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(pass === 'edge' ? art.edge : art.fill, Math.round(X) - art.pad, Math.round(Y) - art.pad);
}

/** run fn with the UI's canvas in raw canvas px (identity transform, no smoothing), restoring it after */
export function rawCanvas(ui: PixelUI, fn: (ctx: CanvasRenderingContext2D, hd: number) => void) {
  const ctx = ui.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  try { fn(ctx, Math.max(1, ui.hd)); } finally { ctx.restore(); }
}

/** a whole string, outline then fill (UI px; y = cap top) with an optional alignment; returns its width (UI px) */
export function seaText(ui: PixelUI, str: string, x: number, y: number, st: SeaStyle, tier: Tier, o: { align?: 'left' | 'center' | 'right'; alpha?: number } = {}) {
  const hd = Math.max(1, ui.hd);
  const art = seaArt(str, st, tier, hd);
  let X = Math.round(x * hd);
  if (o.align === 'center') X -= Math.round(art.adv / 2); else if (o.align === 'right') X -= art.adv;
  const Y = Math.round(y * hd);
  rawCanvas(ui, (ctx) => { seaDraw(ctx, art, X, Y, 'edge', o.alpha ?? 1); seaDraw(ctx, art, X, Y, 'fill', o.alpha ?? 1); });
  return art.adv / hd;
}

// ------------------------------------------------------------------ air bubbles
/**
 * small bubbles are hand-placed (a computed circle that small reads as a diamond): ' ' outside, '.' the nearly clear
 * body, 'o' the rim where the light from above catches it, 'm' the rim at the sides, 'd' the darker refracting rim low
 * on the far side, 'h' the soft highlight, 'i' the faint inner band (the bubble's thickness, refracted)
 */
const BUB_MAPS: Record<number, string[]> = {
  3: [' o ', 'o.m', ' d '],
  4: [' oo ', 'oh.m', 'o..d', ' md '],
  5: [' ooo ', 'oh..m', 'o...m', 'm..id', ' mdd '],
  6: [' oooo ', 'oh...m', 'oh...m', 'o...id', 'm..iid', ' mddd '],
  7: ['  ooo  ', ' oh..m ', 'oh....m', 'o.....m', 'm....id', ' m..id ', '  ddd  '],
  8: ['  oooo  ', ' oh...m ', 'ohh....m', 'oh.....m', 'o......d', 'm.....id', ' m...id ', '  dddd  '],
};
const BUB_COL: Record<string, [string, number]> = {
  o: ['#dcf6f8', 228], m: ['#9fd6e0', 208], d: ['#4f8fa2', 205], h: ['#eefbfc', 196], i: ['#b8e6ec', 96], '.': ['#a6d8e2', 34],
};
const bubCache = new Map<number, HTMLCanvasElement>();
/**
 * a real-looking air bubble about D canvas px across: an almost clear body with a faint sea tint, a thin rim that is
 * bright where the light from above catches it and darker (refracting) low on the far side, a soft highlight up-left
 * and, on bigger ones, a small secondary glint low-right. Hard pixels, flat alphas, matte (no white glare).
 */
export function bubbleSprite(D: number): HTMLCanvasElement {
  D = Math.max(3, Math.round(D));
  const hit = bubCache.get(D);
  if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = D; cv.height = D;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(D, D);
  const put = (x: number, y: number, ch: string) => {
    const c = BUB_COL[ch]; if (!c) return;
    const v = hex(c[0]), i = (y * D + x) * 4; img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = c[1];
  };
  const map = BUB_MAPS[D];
  if (map) {
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) put(x, y, map[y][x] ?? ' ');
  } else {
    const c0 = (D - 1) / 2, R = D / 2;
    const hx = c0 - R * 0.42, hy = c0 - R * 0.44, hr = Math.max(0.8, R * 0.24);
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const dx = x - c0, dy = y - c0, d = Math.hypot(dx, dy);
      if (d > R - 0.25) continue;
      // light from above-left: +1 on the lit side, -1 on the far side
      const lit = d > 0 ? (-dx * 0.55 - dy * 0.83) / d : 0;
      if (d > R - 1.25) { put(x, y, lit > 0.25 ? 'o' : lit > -0.45 ? 'm' : 'd'); continue; }
      if (d > R - 2.25 && lit < -0.2) { put(x, y, 'i'); continue; }
      if (Math.hypot(x - hx, y - hy) <= hr) { put(x, y, 'h'); continue; }
      if (D >= 12 && Math.hypot(x - (c0 + R * 0.42), y - (c0 + R * 0.44)) <= Math.max(0.7, R * 0.11)) { put(x, y, 'i'); continue; }
      put(x, y, '.');
    }
  }
  ctx.putImageData(img, 0, 0);
  bubCache.set(D, cv);
  return cv;
}

interface Bub {
  x: number; y: number; vx: number; vy: number;
  /** radius (UI px) when fully out, the current one grows to it */
  r: number; t: number; life: number; ph: number; delay: number;
  /** >= 0: popping, seconds since */
  pop: number;
}

/** a little system of air bubbles in UI px: they rise, wobble, swell a touch and pop */
export class SeaBubbles {
  list: Bub[] = [];
  max = 140;
  /** release a bubble at (x, y) UI px (r 0.8..4 UI px) */
  add(x: number, y: number, o: { r?: number; vx?: number; vy?: number; life?: number; delay?: number } = {}) {
    if (this.list.length >= this.max) return;
    const r = o.r ?? 1.5;
    this.list.push({ x, y, vx: o.vx ?? 0, vy: o.vy ?? -(9 + r * 4 + Math.random() * 5), r, t: 0, life: o.life ?? 0.9 + Math.random() * 0.9, ph: Math.random() * 6.28, delay: o.delay ?? 0, pop: -1 });
  }
  /** just a pop (ring + droplets) at (x, y) */
  burst(x: number, y: number, r = 2) { if (this.list.length < this.max) this.list.push({ x, y, vx: 0, vy: 0, r, t: 0, life: 0, ph: 0, delay: 0, pop: 0 }); }
  clear() { this.list.length = 0; }
  get count() { return this.list.length; }
  step(dt: number) {
    for (const b of this.list) {
      if (b.delay > 0) { b.delay -= dt; continue; }
      if (b.pop >= 0) { b.pop += dt; continue; }
      b.t += dt;
      b.vy -= 6 * dt; // buoyancy: a slow speed-up
      b.vx *= Math.exp(-dt * 3);
      b.x += (b.vx + Math.sin(b.t * 6.5 + b.ph) * (2 + b.r)) * dt;
      b.y += b.vy * dt;
      if (b.t >= b.life) b.pop = 0;
    }
    this.list = this.list.filter((b) => b.pop < 0.16);
  }
  /** draw every bubble (optionally clipped to rows [top, bottom) UI px, e.g. inside the letterbox) */
  draw(ui: PixelUI, clip?: [number, number]) {
    if (!this.list.length) return;
    rawCanvas(ui, (ctx, hd) => {
      if (clip) { ctx.beginPath(); ctx.rect(0, clip[0] * hd, ui.w * hd, (clip[1] - clip[0]) * hd); ctx.clip(); }
      for (const b of this.list) {
        if (b.delay > 0) continue;
        const X = b.x * hd, Y = b.y * hd;
        if (b.pop >= 0) {
          // the pop: a broken ring flung out and a few droplets, gone in a blink
          const k = b.pop / 0.16, R = b.r * hd * (1 + k * 0.9);
          ctx.globalAlpha = (1 - k) * 0.85;
          ctx.fillStyle = '#d6f4f8';
          const n = 8, dot = Math.max(1, Math.round(hd * 0.5));
          for (let i = 0; i < n; i++) {
            if ((i + (k > 0.5 ? 1 : 0)) % 2 && k > 0.25) continue;
            const a = (i / n) * Math.PI * 2 + b.ph;
            ctx.fillRect(Math.round(X + Math.cos(a) * R), Math.round(Y + Math.sin(a) * R), dot, dot);
          }
          ctx.fillStyle = '#a6dce6';
          for (let i = 0; i < 3; i++) {
            const a = b.ph + i * 2.1, d = (b.r + 1.5 + k * 4) * hd;
            ctx.fillRect(Math.round(X + Math.cos(a) * d), Math.round(Y + Math.sin(a) * d - k * 2 * hd), dot, dot);
          }
          continue;
        }
        // emerge (swell from a speck), then a slow growth as it rises (less pressure)
        const grow = Math.min(1, b.t / 0.14) * (1 + Math.min(0.25, b.t * 0.12));
        const D = Math.max(3, Math.round(b.r * 2 * hd * grow));
        const cv = bubbleSprite(D);
        ctx.globalAlpha = Math.min(1, b.t / 0.06 + 0.3);
        ctx.drawImage(cv, Math.round(X - D / 2), Math.round(Y - D / 2));
      }
      ctx.globalAlpha = 1;
    });
  }
}

// ------------------------------------------------------------------ screen helpers
/** letterbox bar height in UI px (cinematic bars; world words stay off them) */
export function letterboxBar(ui: PixelUI) {
  const k = POST.uLetterbox.value * Math.max(0, 1 - (ui.w / ui.h) / 2.39) * 0.5;
  return Math.ceil(ui.h * k);
}

/** a screen UI (not an off-screen canvas) finished a frame within `ms` */
export function screenUIAlive(ms = 400) {
  const now = performance.now();
  for (const [u, t] of PixelUI.lastDrawn) if (!u.fixed && now - t < ms) return true;
  return false;
}

/** draw on the screen UI that is drawing right now; otherwise on the next screen UI to finish a frame */
export function onScreenUI(draw: (ui: PixelUI) => void) {
  const ui = PixelUI.current;
  if (ui) draw(ui); else PixelUI.overlay.push(draw);
}

const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
/** a world point on a UI: UI px, whether it is in front of the camera, and the world size of one UI px there */
export function project(ui: PixelUI, cam: THREE.Camera, p: THREE.Vector3): { x: number; y: number; behind: boolean; perPx: number } {
  cam.updateMatrixWorld();
  const v = _p.copy(p).project(cam);
  const behind = v.z > 1 || v.z < -1;
  const x = (v.x * 0.5 + 0.5) * ui.w, y = (1 - (v.y * 0.5 + 0.5)) * ui.h;
  let perPx = 0.02;
  const pc = cam as THREE.PerspectiveCamera, oc = cam as THREE.OrthographicCamera;
  if (pc.isPerspectiveCamera) {
    const d = Math.max(0.05, _c.setFromMatrixPosition(cam.matrixWorld).distanceTo(p));
    perPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / Math.max(1, ui.h) / Math.max(0.01, pc.zoom);
  } else if (oc.isOrthographicCamera) perPx = (oc.top - oc.bottom) / Math.max(0.001, oc.zoom) / Math.max(1, ui.h);
  return { x, y, behind, perPx };
}
