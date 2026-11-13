// Underwater sand physics: a deformable 1D sand heightfield over the bedrock along the gameplay floor.
//
//   - cells every 0.25 m hold sand thickness over a fixed bedrock profile;
//   - slopes steeper than the angle of repose slump (mass-conserving relaxation, only where something moved);
//   - impacts and explosions dig craters, throw the sand onto the rims and puff silt clouds;
//   - swimming close to the bottom drags sand along and kicks up small puffs;
//   - things registered as buried get uncovered (or covered again) as the sand moves;
//   - the change in height is uploaded to a float texture (ENV.uSand), so the sand strip mesh, the front
//     cross-section and every plant rooted near the gameplay plane ride the sand on the GPU.
//
//   const sand = new SandField(x0, x1, bedFn, sandFn);
//   sand.impact(x, y, 1.5, 1);     // a depth charge
//   sand.stir(x, y, vx, vy);       // the blobfish swimming low
//   sand.step(dt);                 // once per frame
import * as THREE from 'three';
import { ENV } from './mats';

export interface Buried { x: number; y: number; h: number; covered: boolean; onChange?(covered: boolean): void }

export class SandField {
  readonly dx = 0.25;
  x0: number; n: number;
  bed: Float32Array; h: Float32Array; top0: Float32Array;
  /** tan of the angle of repose (wet sand ~32 degrees) */
  repose = 0.62;
  private lo = Infinity; private hi = -Infinity;
  private idle = 0;
  private texData: Float32Array;
  tex: THREE.DataTexture;
  private texDirty = true;
  buried: Buried[] = [];
  /** silt puff callback (x, y, amount 0..1+) */
  onPuff: ((x: number, y: number, k: number) => void) | null = null;
  /** debris callback for big impacts (x, y, k) */
  onSpray: ((x: number, y: number, k: number) => void) | null = null;
  private puffAcc = 0;

  constructor(x0: number, x1: number, bed: (x: number) => number, sand: (x: number) => number) {
    this.x0 = x0;
    this.n = Math.ceil((x1 - x0) / this.dx) + 1;
    this.bed = new Float32Array(this.n); this.h = new Float32Array(this.n); this.top0 = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { const x = x0 + i * this.dx; this.bed[i] = bed(x); this.h[i] = Math.max(0, sand(x)); }
    // settle the initial profile so it starts at rest
    this.lo = 0; this.hi = this.n - 1;
    for (let k = 0; k < 60; k++) this.relax(1);
    this.lo = Infinity; this.hi = -Infinity;
    for (let i = 0; i < this.n; i++) this.top0[i] = this.bed[i] + this.h[i];
    this.texData = new Float32Array(this.n);
    this.tex = new THREE.DataTexture(this.texData, this.n, 1, THREE.RedFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.bind();
  }

  /** make this field the one the materials displace by */
  bind() {
    ENV.uSand.value = this.tex;
    ENV.uSandBox.value.set(this.x0, this.dx, this.n, 1);
  }

  get x1() { return this.x0 + (this.n - 1) * this.dx; }
  idx(x: number) { return Math.max(0, Math.min(this.n - 1, Math.round((x - this.x0) / this.dx))); }
  top(i: number) { return this.bed[i] + this.h[i]; }
  heightAt(x: number) {
    const f = (x - this.x0) / this.dx;
    if (f <= 0) return this.top(0);
    if (f >= this.n - 1) return this.top(this.n - 1);
    const i = Math.floor(f), t = f - i;
    return this.top(i) * (1 - t) + this.top(i + 1) * t;
  }
  bedAt(x: number) {
    const f = Math.max(0, Math.min(this.n - 1.001, (x - this.x0) / this.dx)), i = Math.floor(f), t = f - i;
    return this.bed[i] * (1 - t) + this.bed[i + 1] * t;
  }
  thicknessAt(x: number) { return this.heightAt(x) - this.bedAt(x); }
  /** the initial (undisturbed) sand top */
  restAt(x: number) {
    const f = Math.max(0, Math.min(this.n - 1.001, (x - this.x0) / this.dx)), i = Math.floor(f), t = f - i;
    return this.top0[i] * (1 - t) + this.top0[i + 1] * t;
  }

  private wake(i0: number, i1: number) {
    this.lo = Math.max(0, Math.min(this.lo, i0 - 2));
    this.hi = Math.min(this.n - 1, Math.max(this.hi, i1 + 2));
    this.idle = 0;
    this.texDirty = true;
  }

  /** add (or remove, k < 0) sand around x with a smooth bump of half-width r */
  deposit(x: number, amount: number, r: number) {
    const i0 = this.idx(x - r), i1 = this.idx(x + r);
    let wsum = 0;
    for (let i = i0; i <= i1; i++) { const d = (this.x0 + i * this.dx - x) / r; wsum += Math.max(0, 1 - d * d); }
    if (wsum <= 0) return;
    for (let i = i0; i <= i1; i++) {
      const d = (this.x0 + i * this.dx - x) / r, w = Math.max(0, 1 - d * d) / wsum;
      this.h[i] = Math.max(0, this.h[i] + amount * w / this.dx * this.dx);
    }
    this.wake(i0, i1);
  }

  /**
   * An impact at (x, y) with radius r: digs a crater where the blast sphere cuts the sand and throws the sand
   * onto the rims (mass is conserved). Returns the sand volume moved (m² in the cross-section).
   */
  impact(x: number, y: number, r: number, k = 1): number {
    const i0 = this.idx(x - r), i1 = this.idx(x + r);
    let moved = 0;
    for (let i = i0; i <= i1; i++) {
      const cx = this.x0 + i * this.dx, dxx = cx - x;
      const half = Math.sqrt(Math.max(0, r * r - dxx * dxx));
      const bottom = y - half * Math.min(1.2, k);   // the blast sphere's lower surface
      const t = this.top(i);
      if (t <= bottom) continue;
      const dig = Math.min(this.h[i], (t - bottom) * 0.85 * Math.min(1, k));
      if (dig <= 0) continue;
      this.h[i] -= dig;
      moved += dig * this.dx;
    }
    if (moved <= 0.0005) return 0;
    // throw it outward: most lands just beyond the crater, a little further
    const rim = r * 1.15;
    this.deposit(x - rim, moved * 0.42, r * 0.7);
    this.deposit(x + rim, moved * 0.42, r * 0.7);
    this.deposit(x - rim * 1.8, moved * 0.08, r);
    this.deposit(x + rim * 1.8, moved * 0.08, r);
    this.wake(this.idx(x - rim * 2.8), this.idx(x + rim * 2.8));
    const fy = this.heightAt(x);
    this.onPuff?.(x, fy + 0.1, Math.min(3, moved * 2 + 0.4));
    if (moved > 0.2) this.onSpray?.(x, fy + 0.1, Math.min(2, moved));
    return moved;
  }

  /**
   * Something moving close above the sand (vx, vy in m/s, size r): pushes a little sand downstream and puffs
   * silt. Cheap; call it for the player and big creatures every frame.
   */
  stir(x: number, y: number, vx: number, vy: number, r = 0.5, dt = 1 / 60) {
    const fy = this.heightAt(x);
    const gap = y - fy;
    if (gap > r * 2.4 || gap < -0.5) return;
    const sp = Math.hypot(vx, vy);
    if (sp < 0.8) return;
    const near = 1 - Math.max(0, gap - r * 0.3) / (r * 2.1);
    const flow = Math.min(1, (sp - 0.8) / 6) * near;
    // diving into the sand digs harder than skimming over it
    const down = Math.max(0, -vy) / (sp || 1);
    const amt = flow * dt * (0.06 + down * 0.25);
    const i = this.idx(x);
    const take = Math.min(this.h[i], amt);
    if (take > 0) {
      this.h[i] -= take;
      const j = this.idx(x + Math.sign(vx || 1) * (r + 0.4));
      this.h[j] += take * 0.7;
      const j2 = this.idx(x - Math.sign(vx || 1) * (r + 0.3));
      this.h[j2] += take * 0.3;
      this.wake(Math.min(i, j, j2), Math.max(i, j, j2));
    }
    this.puffAcc += flow * dt * 6 * (this.h[i] > 0.02 ? 1 : 0.2);
    if (this.puffAcc > 1) { this.puffAcc = 0; this.onPuff?.(x - vx * 0.05, fy + 0.05, 0.25 + flow * 0.5); }
  }

  /** register something that can be covered / uncovered by the sand (y = its base, h = its height) */
  bury(b: Buried) { b.covered = this.heightAt(b.x) > b.y + b.h * 0.7; this.buried.push(b); return b; }
  unbury(b: Buried) { const i = this.buried.indexOf(b); if (i >= 0) this.buried.splice(i, 1); }

  /** mass-conserving relaxation over the active range; returns the mass moved */
  private relax(rate: number): number {
    const maxd = this.repose * this.dx;
    let moved = 0;
    const flip = (this.idle & 1) === 1;
    for (let s = this.lo; s < this.hi; s++) {
      const i = flip ? this.hi - 1 - (s - this.lo) : s;
      const a = this.top(i), b = this.top(i + 1), d = a - b;
      if (d > maxd) {
        const m = Math.min(this.h[i], (d - maxd) * 0.5 * rate);
        this.h[i] -= m; this.h[i + 1] += m; moved += m;
      } else if (d < -maxd) {
        const m = Math.min(this.h[i + 1], (-d - maxd) * 0.5 * rate);
        this.h[i + 1] -= m; this.h[i] += m; moved += m;
      }
    }
    return moved;
  }

  step(dt: number) {
    if (this.lo <= this.hi) {
      let moved = 0;
      for (let k = 0; k < 3; k++) moved += this.relax(Math.min(1, dt * 22));
      // a gentle current slowly smooths sharp little ripples (below repose) back toward rest
      const kk = Math.min(1, dt * 0.15);
      for (let i = Math.max(1, this.lo); i < Math.min(this.n - 1, this.hi); i++) {
        const lap = (this.top(i - 1) + this.top(i + 1)) * 0.5 - this.top(i);
        if (lap > 0) { const m = Math.min(lap * kk, this.h[i - 1] * 0.5, this.h[i + 1] * 0.5); this.h[i] += m * 2; this.h[i - 1] -= m; this.h[i + 1] -= m; }
      }
      this.texDirty = true;
      if (moved < 1e-4) { this.idle++; if (this.idle > 90) { this.lo = Infinity; this.hi = -Infinity; } }
      // buried things in range
      for (const b of this.buried) {
        const i = this.idx(b.x);
        if (i < this.lo - 4 || i > this.hi + 4) continue;
        const cov = this.heightAt(b.x) > b.y + b.h * 0.7;
        if (cov !== b.covered) { b.covered = cov; b.onChange?.(cov); }
      }
    }
    if (this.texDirty) {
      for (let i = 0; i < this.n; i++) this.texData[i] = this.top(i) - this.top0[i];
      this.tex.needsUpdate = true;
      this.texDirty = false;
    }
  }

  dispose() { this.tex.dispose(); if (ENV.uSand.value === this.tex) ENV.uSandBox.value.w = 0; }
}
