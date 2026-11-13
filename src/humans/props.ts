// Shared bits for vessels and fishing spots: a shelf-packing texture atlas painted with px.ts, wood / rope /
// rubber / metal painters, rope tubes, tyre fenders, cleats, lanterns, crates, buckets and pixel-font names
// stamped onto painted surfaces (src/ui/text.ts textCanvas).
import * as THREE from 'three';
import type { V3, Reg, Wt } from '../gfx/loft';
import { Loft, usFor } from '../gfx/loft';
import { Px, mix, shade } from '../gfx/px';
import type { RGB } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { textCanvas } from '../ui/text';
import type { TextStyle } from '../ui/text';
import { band, nz, hh, wood, metal } from './fabric';
import { ellRing } from './rig';

export interface PxRect { x: number; y: number; w: number; h: number }

/** regions packed onto one painted page (guillotine packing: best-fitting free rect, split the leftovers) */
export class Atlas {
  P: Px;
  private free: PxRect[];
  constructor(public W: number, public H: number) { this.P = new Px(W, H); this.free = [{ x: 0, y: 0, w: W, h: H }]; }
  alloc(w: number, h: number): PxRect {
    let best = -1, bestA = Infinity;
    for (let i = 0; i < this.free.length; i++) {
      const f = this.free[i];
      if (f.w >= w && f.h >= h && f.w * f.h < bestA) { best = i; bestA = f.w * f.h; }
    }
    if (best < 0) throw new Error('atlas full');
    const f = this.free.splice(best, 1)[0];
    const r = { x: f.x, y: f.y, w, h };
    // split along the shorter leftover axis
    if (f.w - w > f.h - h) { this.free.push({ x: f.x + w, y: f.y, w: f.w - w, h: f.h }, { x: f.x, y: f.y + h, w, h: f.h - h }); }
    else { this.free.push({ x: f.x, y: f.y + h, w: f.w, h: f.h - h }, { x: f.x + w, y: f.y, w: f.w - w, h }); }
    this.free = this.free.filter((q) => q.w > 0 && q.h > 0);
    return r;
  }
  reg(r: PxRect, u0 = 0, v0 = 0, u1 = 1, v1 = 1): Reg {
    const x = r.x + 0.5 + u0 * (r.w - 1), y = r.y + 0.5 + (1 - v1) * (r.h - 1);
    return { x: x / this.W, y: y / this.H, w: ((u1 - u0) * (r.w - 1)) / this.W, h: ((v1 - v0) * (r.h - 1)) / this.H };
  }
  /** paint a rect: fn(u, v (up), x, y) */
  paint(r: PxRect, fn: (u: number, v: number, x: number, y: number) => RGB | null) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const c = fn((x - r.x) / Math.max(1, r.w - 1), 1 - (y - r.y) / Math.max(1, r.h - 1), x, y);
      if (c) this.P.set(x, y, c);
    }
  }
  texture() { return this.P.texture(); }
}

// ------------------------------------------------------------------ painters
/** painted planks running along u (boards stacked in v), with grain, seams, nail heads and worn paint */
export function planks(c: RGB, u: number, v: number, x: number, y: number, n: number, paint: RGB | null = null, wear = 0.3): RGB {
  const k = v * n, i = Math.floor(k), f = k - i;
  const seed = i * 13 + 5;
  let col = wood(mix(c, shade(c, 0.85 + hh(i, 3, 2) * 0.3), 0.6), x + i * 37, y * 0.5, 1, seed, 1.6);
  if (paint) {
    // paint everywhere except where it has flaked off (more wear = more and bigger chips)
    const chip = nz(x * 1.3, y * 0.7, 7, seed) + (hh(x, y, seed) - 0.5) * 0.12;
    const cut = 1 - wear * 0.45;
    if (chip < cut - 0.04) col = band(paint, 0.94 + (nz(x, y * 3, 12, seed + 1) - 0.5) * 0.1 - (chip > cut - 0.08 ? 0.12 : 0), x, y);
    else if (chip < cut) col = band(mix(paint, [240, 236, 220], 0.4), 0.85, x, y);
  }
  if (f < 0.06 || f > 0.96) col = shade(col, 0.55);
  // butt joints and nails
  const seg = Math.floor(u * 3 + hh(i, 1, 7) * 3);
  const fu = u * 3 + hh(i, 1, 7) * 3 - seg;
  if (fu < 0.012) col = shade(col, 0.6);
  if (Math.abs(fu - 0.03) < 0.006 && (Math.abs(f - 0.3) < 0.08 || Math.abs(f - 0.7) < 0.08)) col = metal([90, 84, 78], x, y, 0.9);
  return col;
}
/** marine growth below the waterline: algae fuzz near the top, barnacles + mussel clusters deeper */
export function growth(base: RGB, depth: number, x: number, y: number, seed = 1): RGB {
  let c = base;
  const alg = Math.max(0, 1 - depth / 0.5) * (0.5 + nz(x, y, 6, seed) * 0.8);
  if (depth > 0) {
    const n = nz(x, y, 10, seed + 3);
    if (n > 0.55 - Math.min(0.25, depth * 0.05)) c = mix(c, band([70, 104, 52], 0.85 + nz(x, y, 3, seed) * 0.4, x, y), Math.min(1, (n - 0.5) * 3));
    if (alg > 0.6) c = mix(c, band([96, 132, 60], 0.9 + hh(x, y, seed) * 0.2, x, y), 0.6);
    // barnacles: little pale rings with dark holes
    const cell = 5, gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    // barnacles grow in colonies: clustered by noise, sparse elsewhere
    const colony = nz(x, y, 18, seed + 11);
    if (hh(gx, gy, seed + 9) < (colony > 0.55 ? 0.3 : 0.03) * Math.min(1, 0.4 + depth * 0.3)) {
      const px = (gx + 0.5) * cell, py = (gy + 0.5) * cell, d = Math.hypot(x + 0.5 - px, y + 0.5 - py), r = 1.6 + hh(gx, gy, seed + 2) * 1.2;
      if (d < r) c = d < r * 0.4 ? [40, 36, 34] : band([206, 200, 184], 0.85 + (1 - d / r) * 0.3, x, y);
    }
    // mussels: dark blue-black ovals
    if (depth > 0.6 && hh(gx >> 1, gy >> 1, seed + 4) < 0.12) { const e = ((x % 6) - 3) ** 2 / 9 + ((y % 4) - 2) ** 2 / 4; if (e < 1) c = band([34, 38, 58], 0.8 + (1 - e) * 0.5, x, y); }
  }
  return c;
}
export const ropeCol = (x: number, y: number, c: RGB = [196, 172, 120]) => band(c, ((x + y * 2) % 4 < 2 ? 1.05 : 0.82) + (hh(x, y, 4) - 0.5) * 0.1, x, y);
export const rubber = (x: number, y: number, k = 1) => band([34, 34, 36], k * (0.85 + ((x * 3 + y) % 5 === 0 ? 0.18 : 0) + (nz(x, y, 6, 2) - 0.5) * 0.15), x, y);

// ------------------------------------------------------------------ geometry helpers
export function tubeRing(B: Loft, path: V3[], r: number, reg: Reg, g: number, sides = 6, cap = true) {
  B.tube(path, () => r, sides, reg, g, { capStart: cap, capEnd: cap });
}
/** a torus (tyre fender / life ring) round axis */
export function torus(B: Loft, c: V3, axis: 'x' | 'y' | 'z', R: number, r: number, reg: Reg, g: number, n = 16, m = 8, squash = 1) {
  const rings = Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const pts: V3[] = [];
    for (let j = 0; j <= m; j++) {
      const b = (j / m) * Math.PI * 2;
      const rr = R + Math.cos(b) * r, h = Math.sin(b) * r * squash;
      const p: V3 = axis === 'z' ? [Math.cos(a) * rr, Math.sin(a) * rr, h] : axis === 'x' ? [h, Math.cos(a) * rr, Math.sin(a) * rr] : [Math.cos(a) * rr, h, Math.sin(a) * rr];
      pts.push([c[0] + p[0], c[1] + p[1], c[2] + p[2]]);
    }
    return { pts, v: i / n };
  });
  // loft along the ring: transpose so each "ring" is a cross-section circle
  B.loft(rings, usFor(m), reg, g, {});
}
/** a cylinder between two points */
export function cyl(B: Loft, a: V3, b: V3, r0: number, r1: number, reg: Reg, g: number, n = 10, caps = true, w?: Wt) {
  B.tube([a, b], (t) => r0 + (r1 - r0) * t, n, reg, g, { capStart: caps, capEnd: caps, w: w ? () => w : undefined });
}
export function bucket(B: Loft, c: V3, r: number, h: number, reg: Reg, rimReg: Reg, g: number) {
  const rings = [0, 0.1, 0.9, 1].map((t, i) => ({ pts: ellRing(c[1] + t * h, c[0], c[2], r * (0.8 + t * 0.2), r * (0.8 + t * 0.2), r * (0.8 + t * 0.2), 12, 2, 1), v: t }));
  B.loft(rings, usFor(12), reg, g, { start: [c[0], c[1], c[2]] });
  torus(B, [c[0], c[1] + h, c[2]], 'y', r, 0.008, rimReg, g + 1, 16, 5);
}

// ------------------------------------------------------------------ text names
/** stamp pixel-font text into an atlas painter: returns a sampler (px in text space -> RGB | null) */
export function textSampler(text: string, st: TextStyle): { w: number; h: number; at(px: number, py: number): RGB | null } {
  const tc = textCanvas(text, st);
  const ctx = tc.canvas.getContext('2d')!;
  const d = ctx.getImageData(0, 0, tc.w, tc.h).data;
  return {
    w: tc.w, h: tc.h,
    at(px: number, py: number) {
      const x = Math.floor(px), y = Math.floor(py);
      if (x < 0 || y < 0 || x >= tc.w || y >= tc.h) return null;
      const i = (y * tc.w + x) * 4;
      return d[i + 3] > 128 ? [d[i], d[i + 1], d[i + 2]] : null;
    },
  };
}
export const HULL_TEXT: TextStyle = { font: 'Alagard', px: 16, fill: ['#fbf6e8', '#efe6cc'], outline: '#1c1a1e' };
export const HULL_TEXT_GOLD: TextStyle = { font: 'Alagard', px: 16, fill: ['#ffe9a0', '#d8a440'], outline: '#2a1606' };

// ------------------------------------------------------------------ materials
const shared = new Map<string, THREE.Material>();
export function glassMat(): THREE.Material {
  let m = shared.get('glass');
  if (!m) { m = new THREE.MeshStandardMaterial({ color: 0x29404c, roughness: 0.06, metalness: 0.7, emissive: 0x0a1418 }); shared.set('glass', m); }
  return m;
}
export function lampMat(col = 0xffd88a): THREE.Material {
  const key = 'lamp' + col;
  let m = shared.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.2, roughness: 0.3 }); shared.set(key, m); }
  return m;
}
/** the vessel / spot material: painted page, lit like water below the surface (uw does nothing above y = 0) */
export function spotMat(tex: THREE.Texture, rough = 0.78): THREE.MeshStandardMaterial {
  return uw(new THREE.MeshStandardMaterial({ map: tex, roughness: rough, vertexColors: true }), { caustics: 1, rim: 0 });
}
export { band, nz, hh, wood, metal, mix, shade };
