// A creature's texture page: one colour page (px.ts) plus matching roughness, height (-> normal map) and glow
// layers, with a shelf allocator for regions (body wrap, fins, eye, teeth...). Each region keeps its own id so
// the normal map never differentiates across region borders.
//
// Region convention (shared with the mesh builders): a region's param (u, v) in 0..1 maps u -> left..right,
// v -> top..bottom of the region, sampling texel centres, so painters loop i = 0..w-1 with u = i / (w - 1).
import * as THREE from 'three';
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
}

/** paint a fin membrane into a rect: u runs along the fin base (front -> back), v root -> tip */
export function paintFin(pg: Page, r: Rect, f: FinPaint) {
  const memb = ramp(f.col, 5, 0.8);
  const [a0, a1] = f.alpha ?? [0.85, 0.55];
  const rays = f.rays ?? 10, spines = f.spines ?? 0;
  const rayC = C(f.rayCol ?? f.col[Math.max(0, f.col.length - 2)]);
  const spC = C(f.spineCol ?? f.rayCol ?? '#d8d0c0');
  const edgeC = f.edge ? C(f.edge) : null, baseC = f.base ? C(f.base) : null;
  const bandC = f.bands ? C(f.bands) : null, spotC = f.spots ? C(f.spots) : null;
  const seed = f.seed ?? 3;
  const total = rays + spines;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const u = i / (r.w - 1), v = j / (r.h - 1);
    // ray layout: spines first (front), then soft rays
    const fu = u * total, k = Math.min(total - 1, Math.floor(fu)), fr = fu - k;
    const isSpine = k < spines;
    let vmax = f.cut ? f.cut(u) : 1;
    if (isSpine && f.notch) vmax = Math.min(vmax, 1 - f.notch * Math.sin(Math.PI * fr) ** 0.7);
    if (f.fray) vmax -= f.fray * hash2(i >> 1, 7, seed) * (0.5 + 0.5 * hash2(i, 3, seed));
    const rayCentre = Math.abs(fr - 0.5) * (r.w / total); // px distance to ray line
    const rayW = isSpine ? 0.9 : 0.6 - v * 0.15;
    let onRay = rayCentre < rayW;
    // soft rays branch toward the tip
    if (!isSpine && (f.rayBranch ?? true) && v > 0.55 && r.w / total > 4) {
      const off = (v - 0.55) * 0.35;
      onRay = Math.abs(fr - 0.5 - off) * (r.w / total) < 0.5 || Math.abs(fr - 0.5 + off) * (r.w / total) < 0.5;
    }
    const spineTip = isSpine && onRay && v <= (f.cut ? f.cut(u) : 1);
    if (v > vmax && !spineTip) { pg.col.set(r.x + i, r.y + j, [0, 0, 0], 0); continue; }
    let c = memb(v, i, j);
    let a = a0 + (a1 - a0) * v;
    let h = 0;
    if (bandC && f.bandN) { const b = Math.sin((v * f.bandN + hash2(k, 1, seed) * 0.3) * Math.PI * 2); if (b > 0.35) c = mix(c, bandC, 0.75); }
    if (spotC && hash2(i, j, seed + 11) < (f.spotK ?? 0.06) && !onRay) c = spotC;
    if (baseC && v < (f.baseW ?? 0.15)) c = mix(c, baseC, 0.8);
    if (edgeC && v > vmax - (f.edgeW ?? 0.12)) { c = mix(c, edgeC, 0.9); a = Math.max(a, f.edgeA ?? 0.9); }
    if (onRay) {
      c = isSpine ? shade(spC, 1.0 + (1 - v) * 0.1) : mix(c, rayC, 0.75);
      a = isSpine ? 1 : Math.max(a, 0.92);
      h = isSpine ? 1 : 0.6;
      // light-side highlight pixel beside the ray
    } else if (rayCentre < rayW + 1.2) { c = shade(c, 1.08); h = 0.25; }
    // membrane ripple shading between rays
    if (!onRay) c = shade(c, 0.94 + 0.08 * Math.cos(fr * Math.PI * 2));
    if (f.opaque) a = 1;
    // dithered alpha quantisation keeps the pixel look under alpha-to-coverage
    a = Math.max(0, Math.min(1, a + (bayer(i, j) - 0.5) * 0.12));
    if (f.glowEdge && v > vmax - 0.1) pg.setGlow(r.x + i, r.y + j, C(f.glowEdge));
    pg.set(r.x + i, r.y + j, c, Math.round(a * 255), f.rough ?? 0.55, h);
  }
}

// ------------------------------------------------------------------------------------------- eye painter
export interface EyePaint {
  iris: string[];        // outer -> inner ramp
  pupil?: number;        // pupil radius fraction
  pupilCol?: string;
  ring?: string;         // thin ring around the iris (gold, red...)
  sclera?: string;       // mammals: white/grey around the iris
  irisR?: number;        // iris radius fraction of the disc (with sclera)
  slit?: number;         // vertical slit pupil squash (0 round)
  glint?: boolean;
}
export function paintEye(pg: Page, r: Rect, e: EyePaint) {
  const iris = ramp(e.iris, 5, 0.7);
  const pr = e.pupil ?? 0.42, ir = e.irisR ?? 1;
  const pc = C(e.pupilCol ?? '#06070c');
  const ringC = e.ring ? C(e.ring) : null, scl = e.sclera ? C(e.sclera) : null;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const nx = ((i + 0.5) / r.w) * 2 - 1, ny = ((j + 0.5) / r.h) * 2 - 1;
    const d = Math.hypot(nx, ny);
    let c: RGB, h = 0;
    if (scl && d > ir) c = shade(scl, 1 - (d - ir) * 0.8);
    else {
      const dd = d / ir;
      const px = nx / ir, py = ny / ir;
      const dp = Math.hypot(px / (1 - (e.slit ?? 0) * 0.8), py);
      if (dp < pr) { c = pc; if (dp > pr - 0.08) c = mix(pc, [40, 40, 60], 0.5); }
      else {
        c = iris((dd - pr) / (1 - pr), i, j);
        // radial iris fibres + darker limbal ring
        const ang = Math.atan2(py, px);
        c = shade(c, 0.9 + 0.12 * Math.sin(ang * 14 + hash2(i, j, 4) * 1.5));
        if (dd > 0.86) c = shade(c, 0.6);
        if (ringC && dd > pr && dd < pr + 0.12) c = mix(c, ringC, 0.8);
        // top shadow from the socket
        if (py < -0.55) c = shade(c, 0.82);
      }
    }
    pg.set(r.x + i, r.y + j, c, 255, 0.08, 0);
  }
  if (e.glint !== false) {
    // painted highlights: a big glint up-front and a small one down-back
    const gx = r.x + Math.round(r.w * 0.64), gy = r.y + Math.round(r.h * 0.3), gs = Math.max(1, Math.round(r.w / 10));
    for (let y = 0; y < gs + 1; y++) for (let x = 0; x < gs + 1; x++) if (x + y <= gs + 0.5) pg.set(gx + x - 1, gy + y - 1, [255, 255, 255], 255, 0.05);
    pg.set(r.x + Math.round(r.w * 0.34), r.y + Math.round(r.h * 0.68), [200, 230, 255], 255, 0.05);
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
export const tex2: (t: THREE.Texture) => THREE.Texture = (t) => t;
