// A creature's texture page: one colour page (px.ts) plus matching roughness, height (-> normal map) and glow
// layers, with a shelf allocator for regions (body wrap, fins, eye, teeth...). Each region keeps its own id so
// the normal map never differentiates across region borders.
//
// Region convention (shared with the mesh builders): a region's param (u, v) in 0..1 maps u -> left..right,
// v -> top..bottom of the region, sampling texel centres, so painters loop i = 0..w-1 with u = i / (w - 1).
import { Px, RGB, hex, mix, shade, ramp, bayer } from '../gfx/px';
import type { Reg } from '../gfx/loft';
import { hash2 } from '../core/math';

export interface Rect { x: number; y: number; w: number; h: number; id: number }

export class Page {
  W: number; H: number;
  col: Px;
  rough: Float32Array;
  hgt: Float32Array;
  rid: Uint16Array;
  glow: Px | null = null;
  private sx = 0; private sy = 0; private rowH = 0; private nid = 1;
  constructor(W: number, H: number) {
    this.W = W; this.H = H;
    this.col = new Px(W, H);
    this.rough = new Float32Array(W * H).fill(0.6);
    this.hgt = new Float32Array(W * H);
    this.rid = new Uint16Array(W * H);
  }
  /** reserve a w x h pixel rect (2 px gutter) */
  alloc(w: number, h: number): Rect {
    const pad = 2;
    if (this.sx + w + pad > this.W) { this.sx = 0; this.sy += this.rowH + pad; this.rowH = 0; }
    if (this.sy + h > this.H) throw new Error(`page full (${w}x${h} in ${this.W}x${this.H})`);
    const r = { x: this.sx, y: this.sy, w, h, id: this.nid++ };
    this.sx += w + pad; this.rowH = Math.max(this.rowH, h);
    for (let y = r.y; y < r.y + h; y++) for (let x = r.x; x < r.x + w; x++) this.rid[y * this.W + x] = r.id;
    return r;
  }
  /** a full-width band (body wraps) */
  band(h: number): Rect {
    if (this.sx > 0) { this.sx = 0; this.sy += this.rowH + 2; this.rowH = 0; }
    return this.alloc(this.W, h);
  }
  reg(r: Rect): Reg { return { x: (r.x + 0.5) / this.W, y: (r.y + 0.5) / this.H, w: (r.w - 1) / this.W, h: (r.h - 1) / this.H }; }
  /** uv (three convention, v up) of a point (u, v) inside a rect */
  uv(r: Rect, u: number, v: number): [number, number] { return [(r.x + 0.5 + u * (r.w - 1)) / this.W, 1 - (r.y + 0.5 + v * (r.h - 1)) / this.H]; }

  set(x: number, y: number, c: RGB, a = 255, rough = 0.6, h = 0) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    this.col.set(x, y, c, a);
    const i = y * this.W + x;
    this.rough[i] = rough; this.hgt[i] = h;
  }
  setGlow(x: number, y: number, c: RGB, a = 255) {
    if (!this.glow) { this.glow = new Px(this.W, this.H); this.glow.fill(() => [0, 0, 0]); }
    this.glow.set(x, y, c, a);
  }

  textures(normalStrength = 2) {
    const map = this.col.texture();
    const rp = new Px(this.W, this.H);
    for (let i = 0; i < this.W * this.H; i++) { const v = Math.max(0, Math.min(255, this.rough[i] * 255)); rp.d[i * 4] = v; rp.d[i * 4 + 1] = v; rp.d[i * 4 + 2] = v; rp.d[i * 4 + 3] = 255; }
    const roughnessMap = rp.texture({ srgb: false });
    const W = this.W, H = this.H, hg = this.hgt, rid = this.rid;
    const normalMap = Px.normalMap(W, H, (x, y) => hg[y * W + x], normalStrength);
    // re-derive normals per region so borders between regions stay flat
    const d = normalMap.image.data as Uint8Array;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = rid[y * W + x];
      const at = (xx: number, yy: number) => {
        xx = Math.max(0, Math.min(W - 1, xx)); yy = Math.max(0, Math.min(H - 1, yy));
        return rid[yy * W + xx] === id ? hg[yy * W + xx] : hg[y * W + x];
      };
      const dx = (at(x + 1, y) - at(x - 1, y)) * normalStrength, dy = (at(x, y + 1) - at(x, y - 1)) * normalStrength;
      const l = Math.hypot(dx, dy, 1);
      const i = ((H - 1 - y) * W + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    }
    normalMap.needsUpdate = true;
    const emissiveMap = this.glow ? this.glow.texture() : null;
    return { map, roughnessMap, normalMap, emissiveMap };
  }
}

// ------------------------------------------------------------------------------------------- colour helpers
export const C = (s: string) => hex(s);
export const lerpC = (a: RGB, b: RGB, t: number) => mix(a, b, Math.max(0, Math.min(1, t)));
export function rampC(cols: string[], steps = 6, dither = 0.7) { return ramp(cols, steps, dither); }

// ------------------------------------------------------------------------------------------- fin painter
export interface FinPaint {
  col: string[];            // membrane ramp root -> edge
  alpha?: [number, number]; // membrane alpha root -> edge (0..1)
  rays?: number;            // soft ray count
  rayCol?: string;
  spines?: number;          // leading spines (stiff, opaque, membrane notched between)
  spineCol?: string;
  edge?: string; edgeW?: number;  // coloured margin
  edgeA?: number;
  base?: string; baseW?: number;  // a band at the fin root
  spots?: string; spotK?: number; // speckles
  bands?: string; bandN?: number; // cross bands along the rays (pike, grouper)
  notch?: number;           // membrane notch depth between spines (0..1)
  fray?: number;            // ragged edge noise
  cut?: (u: number) => number; // max v (0..1) per u: alpha silhouette
  opaque?: boolean;
  seed?: number;
  rough?: number;
  rayBranch?: boolean;
  glowEdge?: string;        // emissive margin (deep-sea fins)
  /** custom per-pixel overlay (ocelli, stripes): return null to keep */
  over?: (u: number, v: number, c: RGB, i: number, j: number) => RGB | null;
}

/** dithered mix: pixel-art blend between two colours (k quantised to 5 levels with ordered dither) */
export function dmix(a: RGB, b: RGB, k: number, x: number, y: number): RGB {
  const q = Math.round(Math.max(0, Math.min(4, k * 4 + (bayer(x, y) - 0.5) * 0.9))) / 4;
  return mix(a, b, q);
}
/** smooth multi-stop gradient with fine dithered banding (soft hue-shifted ramps) */
export function grad(cols: (string | RGB)[], steps = 14) {
  const r = ramp(cols, steps, 0.55);
  return (t: number, x: number, y: number) => r(t, x, y);
}

/** paint a fin membrane into a rect: u runs along the fin base (front -> back), v root -> tip */
export function paintFin(pg: Page, r: Rect, f: FinPaint) {
  const memb = ramp(f.col, 10, 0.9);
  const [a0, a1] = f.alpha ?? [0.8, 0.5];
  const rays = Math.max(1, f.rays ?? 10), spines = f.spines ?? 0;
  const rayC = f.rayCol ? C(f.rayCol) : null;
  const spC = C(f.spineCol ?? f.rayCol ?? '#d8d0c0');
  const edgeC = f.edge ? C(f.edge) : null, baseC = f.base ? C(f.base) : null;
  const bandC = f.bands ? C(f.bands) : null, spotC = f.spots ? C(f.spots) : null;
  const seed = f.seed ?? 3;
  const total = rays + spines;
  const pitch = r.w / total; // px between rays
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const u = (i + 0.5) / r.w, v = j / (r.h - 1);
    const fu = u * total, k = Math.min(total - 1, Math.floor(fu)), fr = fu - k;
    const isSpine = k < spines;
    const cutV = f.cut ? f.cut(u) : 1;
    let vmax = cutV;
    if (f.notch && (isSpine || spines === 0)) vmax = Math.min(vmax, 1 - f.notch * Math.pow(Math.sin(Math.PI * fr), 0.8));
    if (f.fray) vmax -= f.fray * hash2(i >> 1, 7, seed) * (0.5 + 0.5 * hash2(i, 3, seed));
    const dRay = Math.abs(fr - 0.5) * pitch; // px distance to the ray line
    let onRay = false;
    if (f.rays !== 0 || isSpine) {
      if (isSpine) onRay = dRay < 0.75;
      else if ((f.rayBranch ?? true) && v > 0.5 && pitch > 3.2) {
        const off = (v - 0.5) * 0.28;
        onRay = Math.abs(fr - 0.5 - off) * pitch < 0.5 || Math.abs(fr - 0.5 + off) * pitch < 0.5;
      } else onRay = dRay < 0.5;
    }
    const spineTip = isSpine && onRay && v <= cutV;
    if (v > vmax && !spineTip) { pg.set(r.x + i, r.y + j, [0, 0, 0], 0, 0.6, 0); continue; }
    let c = memb(v / Math.max(0.3, vmax), i, j);
    let a = a0 + (a1 - a0) * v;
    let h = 0;
    if (bandC && f.bandN) { const b = Math.sin((v * f.bandN + (k % 2) * 0.12) * Math.PI * 2); if (b > 0.4) c = mix(c, bandC, 0.7); }
    if (spotC && !onRay) {
      const sx = Math.floor(i / 3), sy = Math.floor(j / 3);
      if (hash2(sx, sy, seed + 11) < (f.spotK ?? 0.12) && ((i % 3) + (j % 3)) < 3) { c = spotC; a = Math.max(a, 0.9); }
    }
    if (baseC && v < (f.baseW ?? 0.15)) c = dmix(c, baseC, 1 - v / (f.baseW ?? 0.15) * 0.5, i, j);
    if (edgeC && v > vmax - (f.edgeW ?? 0.12)) { c = mix(c, edgeC, 0.9); a = Math.max(a, f.edgeA ?? 0.85); }
    if (onRay) {
      if (isSpine) { c = shade(spC, 1.04 - v * 0.1); a = 1; h = 1; }
      else {
        // soft ray: darker line, segmented (a lit joint every few px), fading toward the tip
        const joint = (j + (k & 1) * 2) % 5 === 0;
        c = rayC ? mix(c, rayC, 0.45 * (1 - v * 0.4)) : shade(c, 0.86 + v * 0.06);
        if (joint) c = shade(c, 1.12);
        a = Math.min(1, Math.max(a, a0 * 0.9) + 0.12); h = 0.6;
      }
    } else {
      // membrane: slightly brighter mid-way between rays, a lit pixel line beside each ray
      c = shade(c, 0.97 + 0.06 * Math.sin(fr * Math.PI));
      if (dRay < 1.5 && dRay >= 0.5) { c = shade(c, 1.06); h = 0.3; }
      a *= 0.92 + 0.08 * Math.cos(fr * Math.PI * 2);
    }
    if (f.over) { const o = f.over(u, v, c, i, j); if (o) { c = o; a = Math.max(a, 0.9); } }
    if (f.opaque) a = 1;
    // soft tip: last pixel row of membrane fades
    if (!onRay && v > vmax - 0.03) a *= 0.7;
    a = Math.max(0, Math.min(1, a));
    if (f.glowEdge && v > vmax - 0.1) pg.setGlow(r.x + i, r.y + j, C(f.glowEdge));
    pg.set(r.x + i, r.y + j, c, Math.round(a * 255), f.rough ?? 0.5, h);
  }
}

// ------------------------------------------------------------------------------------------- eye painter
export interface EyePaint {
  iris: string[];        // outer -> inner ramp
  pupil?: number;        // pupil radius fraction of the iris
  pupilCol?: string;
  ring?: string;         // thin bright ring around the pupil (gold, red...)
  sclera?: string;       // a visible eye-white / silver ring outside the iris
  irisR?: number;        // iris radius fraction of the disc (with sclera)
  slit?: number;         // vertical/horizontal slit pupil squash (0 round, >0 vertical, <0 horizontal)
  glint?: boolean;
  limbus?: string;       // dark rim around the iris
  fleck?: string;        // iris flecks colour
}
export function paintEye(pg: Page, r: Rect, e: EyePaint) {
  const iris = ramp(e.iris, 10, 0.8);
  const pr = e.pupil ?? 0.48, ir = e.irisR ?? 0.92;
  const pc = C(e.pupilCol ?? '#05060a');
  const ringC = e.ring ? C(e.ring) : null, scl = C(e.sclera ?? '#d8e0e4');
  const limb = C(e.limbus ?? '#0a0a12');
  const fleck = e.fleck ? C(e.fleck) : null;
  const sl = e.slit ?? 0;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const nx = ((i + 0.5) / r.w) * 2 - 1, ny = ((j + 0.5) / r.h) * 2 - 1;
    const d = Math.hypot(nx, ny);
    let c: RGB;
    if (d > ir) {
      // sclera: shaded darker toward the top (socket shadow) and the rim
      c = shade(scl, 1.02 - (d - ir) * 0.9 - Math.max(0, -ny) * 0.25);
    } else {
      const px = nx / ir, py = ny / ir, dd = d / ir;
      const dp = Math.hypot(px / (1 - Math.max(0, sl) * 0.75), py / (1 + Math.min(0, sl) * 0.75));
      if (dp < pr) {
        // pupil: deep blue-black with a faint lens reflection
        c = mix(pc, [26, 34, 58], Math.max(0, (dp / pr) - 0.55) * 0.9);
      } else {
        const t = (dd - pr) / Math.max(0.05, 1 - pr);
        c = iris(1 - t, i, j);
        const ang = Math.atan2(py, px);
        c = shade(c, 0.94 + 0.1 * Math.sin(ang * 11 + Math.sin(ang * 3) * 1.3));
        if (fleck && hash2(i, j, 21) < 0.12) c = mix(c, fleck, 0.6);
        if (ringC && dp < pr + 0.13) c = mix(c, ringC, 0.85);
        if (dd > 0.88) c = mix(c, limb, 0.8);
        // upper iris in the lid shadow
        c = shade(c, 1 - Math.max(0, -py - 0.2) * 0.35);
      }
    }
    pg.set(r.x + i, r.y + j, c, 255, 0.04, 0);
  }
  if (e.glint !== false) {
    // catchlights: a big soft-cornered window glint up-front, a small one low-back
    const R = r.w / 2;
    const gx = r.x + R + R * 0.28, gy = r.y + R - R * 0.38, gs = Math.max(1.6, R * 0.22);
    for (let y = -Math.ceil(gs); y <= Math.ceil(gs); y++) for (let x = -Math.ceil(gs); x <= Math.ceil(gs); x++) {
      const q = Math.hypot(x, y * 1.1) / gs;
      if (q <= 1) pg.set(Math.round(gx + x), Math.round(gy + y), q > 0.75 ? [215, 235, 255] : [255, 255, 255], 255, 0.02);
    }
    const g2x = r.x + R - R * 0.34, g2y = r.y + R + R * 0.36;
    pg.set(Math.round(g2x), Math.round(g2y), [190, 225, 255], 255, 0.02);
    pg.set(Math.round(g2x) + 1, Math.round(g2y), [150, 200, 240], 255, 0.02);
  }
}

/** flat little swatch (teeth, lure, gums...) painted with a vertical ramp: v = 0 tip, v = 1 root */
export function paintSwatch(pg: Page, r: Rect, cols: string[], rough = 0.4, glow?: string[]) {
  const rr = ramp(cols, 4, 0.6);
  const gr = glow ? ramp(glow, 4, 0.6) : null;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const v = j / Math.max(1, r.h - 1);
    pg.set(r.x + i, r.y + j, rr(v, i, j), 255, rough, 0);
    if (gr) pg.setGlow(r.x + i, r.y + j, gr(v, i, j));
  }
}

/** a lid / skin swatch with a dark lash line at the bottom (v = 1) */
export function paintLid(pg: Page, r: Rect, skin: string, line: string) {
  const s = C(skin), l = C(line);
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const v = j / (r.h - 1);
    const c = v > 0.8 ? l : shade(s, 0.85 + (1 - v) * 0.2);
    pg.set(r.x + i, r.y + j, c, 255, 0.45, v > 0.8 ? 0 : 0.4);
  }
}

export { hex, mix, shade, ramp, bayer };
export type { RGB };
