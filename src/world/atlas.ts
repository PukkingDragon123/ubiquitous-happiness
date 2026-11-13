// A painted pixel atlas: one Px page with a shelf allocator. Painters draw into their region in local pixel
// coordinates and get back the UV rect the meshes map into. One atlas per area = one texture, one material,
// one draw call per merged chunk.
//
//   const A = new Atlas(256, 256);
//   const blade = A.paint('kelpBlade', 16, 64, (p, w, h) => { ... p.set(x, y, col) ... });  // UVR
//   const tex = A.texture();
import * as THREE from 'three';
import { Px, RGB } from '../gfx/px';
import type { UVR } from './lp';

export class Atlas {
  px: Px;
  regions = new Map<string, UVR>();
  private sx = 0; private sy = 0; private rowH = 0;
  private tex: THREE.Texture | null = null;
  constructor(public w: number, public h: number) { this.px = new Px(w, h); }

  /** reserve a w x h block (1 px gutter) and return its pixel origin */
  alloc(w: number, h: number): [number, number] {
    if (this.sx + w + 1 > this.w) { this.sx = 0; this.sy += this.rowH + 1; this.rowH = 0; }
    if (this.sy + h > this.h) throw new Error(`atlas full (${this.w}x${this.h}) allocating ${w}x${h}`);
    const o: [number, number] = [this.sx, this.sy];
    this.sx += w + 1; this.rowH = Math.max(this.rowH, h);
    return o;
  }

  /** paint a region; fn gets a view Px-like setter in local coords. Returns the UV rect (v0 = bottom). */
  paint(name: string, w: number, h: number, fn: (p: Region, w: number, h: number) => void): UVR {
    const got = this.regions.get(name);
    if (got) return got;
    const [ox, oy] = this.alloc(w, h);
    const reg = new Region(this.px, ox, oy, w, h);
    fn(reg, w, h);
    // half-texel inset so nearest sampling never bleeds into a neighbour
    const r: UVR = { u0: (ox + 0.5) / this.w, u1: (ox + w - 0.5) / this.w, v0: 1 - (oy + h - 0.5) / this.h, v1: 1 - (oy + 0.5) / this.h };
    this.regions.set(name, r);
    this.tex = null;
    return r;
  }
  get(name: string): UVR { const r = this.regions.get(name); if (!r) throw new Error('no atlas region ' + name); return r; }

  texture(): THREE.Texture {
    if (!this.tex) {
      this.tex = this.px.texture({ mip: true });
      // mipmaps on an alpha-cut atlas: keep coverage by not shrinking too far (handled by alphaTest + A2C)
      this.tex.anisotropy = 4;
    }
    return this.tex;
  }
}

/** a window onto the atlas page in local pixel coordinates */
export class Region {
  constructor(public px: Px, public ox: number, public oy: number, public w: number, public h: number) {}
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, c: RGB | string, a = 255) { x = Math.floor(x); y = Math.floor(y); if (this.in(x, y)) this.px.set(this.ox + x, this.oy + y, c, a); }
  blend(x: number, y: number, c: RGB | string, t: number) { x = Math.floor(x); y = Math.floor(y); if (this.in(x, y)) this.px.blend(this.ox + x, this.oy + y, c, t); }
  alpha(x: number, y: number) { return this.in(x, y) ? this.px.alpha(this.ox + x, this.oy + y) : 0; }
  get(x: number, y: number) { return this.px.get(this.ox + x, this.oy + y); }
  shade(x: number, y: number, k: number) { if (this.in(x, y)) this.px.shadePx(this.ox + x, this.oy + y, k); }
  fill(fn: (x: number, y: number) => RGB | [number, number, number, number] | null) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = fn(x, y);
      if (c) this.set(x, y, [c[0], c[1], c[2]], c.length > 3 ? (c as number[])[3] : 255);
    }
  }
  each(fn: (x: number, y: number, c: [number, number, number, number]) => RGB | null) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.alpha(x, y)) continue;
      const c = fn(x, y, this.get(x, y));
      if (c) { const a = this.alpha(x, y); this.set(x, y, c, a); }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB | string, a = 255) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, a);
  }
  disc(cx: number, cy: number, r: number, c: RGB | string | ((nx: number, ny: number) => RGB | null), a = 255) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r;
      if (nx * nx + ny * ny > 1) continue;
      const col = typeof c === 'function' ? c(nx, ny) : c;
      if (col) this.set(x, y, col, a);
    }
  }
  /** 1 px dark outline around opaque pixels inside the region */
  outline(c: RGB | string, a = 255) {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y)) continue;
      if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, c, a);
  }
  /** darken opaque pixels next to transparency */
  rim(k = 0.75) {
    const r: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.alpha(x, y)) continue;
      if (!this.alpha(x - 1, y) || !this.alpha(x + 1, y) || !this.alpha(x, y - 1) || !this.alpha(x, y + 1)) r.push([x, y]);
    }
    for (const [x, y] of r) this.shade(x, y, k);
  }
}
