// Gameplay terrain on the z = 0 plane: an infinite, deterministic seabed (layered noise + occasional ridges
// and trenches) plus rocks that lines can wrap around. Everything is generated per 24 m chunk from the run
// seed, so revisiting a stretch of ocean gives the same rocks.
import type { Terrain } from '../game/types';
import { fbm, hash1, hash2, noise1, smooth } from '../core/math';
import type { Biome } from './biomes';

export const CHUNK = 24;

export interface Rock { x: number; y: number; r: number; sharp?: boolean; kind: 'boulder' | 'pillar' | 'coral' | 'arch'; seed: number }

export class SeaTerrain implements Terrain {
  seed: number;
  biome: Biome;
  private chunks = new Map<number, Rock[]>();
  /** extra solid circles (boat hulls, pilings, ice) refreshed each frame by the dive */
  dynamic: { x: number; y: number; r: number }[] = [];
  /** flat zone where the floor is smoothed (spawn area) */
  flatX = 0;

  constructor(seed: number, biome: Biome) { this.seed = seed; this.biome = biome; }

  floorAt(x: number): number {
    const b = this.biome, s = this.seed;
    let y = b.floor + (fbm(x * 0.025, 0.5, 4, s) - 0.5) * 2 * b.amp + (fbm(x * 0.12, 3.1, 2, s + 9) - 0.5) * b.detail;
    // ridges and trenches every so often
    const ridge = Math.max(0, noise1(x * 0.012, s + 3) - 0.62) * 9;
    const trench = Math.max(0, noise1(x * 0.009, s + 7) - 0.7) * -12;
    y += ridge * b.amp * 0.6 + trench;
    // keep the start area friendly
    const k = smooth(14, 4, Math.abs(x - this.flatX));
    y = y * (1 - k) + (b.floor) * k;
    return Math.min(y, -2.5);
  }
  slopeAt(x: number) { return (this.floorAt(x + 0.05) - this.floorAt(x - 0.05)) / 0.1; }

  rocksIn(ci: number): Rock[] {
    let r = this.chunks.get(ci);
    if (r) return r;
    r = [];
    const b = this.biome, s = this.seed;
    const n = Math.floor(hash1(ci, s + 11) * 3.2 * b.rocks) + (hash1(ci, s + 12) < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = ci * CHUNK + 2 + hash2(ci, i, s + 13) * (CHUNK - 4);
      if (Math.abs(x - this.flatX) < 5) continue;
      const kindR = hash2(ci, i, s + 14);
      const fl = this.floorAt(x);
      const seed = Math.floor(hash2(ci, i, s + 15) * 1e6);
      if (kindR < 0.18) {
        // pillar: a stack of boulders reaching up — great for wrapping lines
        const h = 2 + hash2(ci, i, s + 16) * 4;
        const base = 0.8 + hash2(ci, i, s + 17) * 0.5;
        for (let k = 0; k * 0.9 < h; k++) r.push({ x: x + Math.sin(k * 1.7 + seed) * 0.25, y: fl + base * 0.5 + k * 0.9, r: base * (1 - k * 0.08), kind: 'pillar', seed: seed + k });
      } else if (kindR < 0.3 && b.corals > 0.5) {
        r.push({ x, y: fl + 0.5, r: 0.7 + hash2(ci, i, s + 18) * 0.4, sharp: true, kind: 'coral', seed });
      } else if (kindR < 0.36) {
        // a floating boulder arch-ish pair
        const rr = 0.8 + hash2(ci, i, s + 19) * 0.6;
        r.push({ x, y: fl + rr * 0.6, r: rr, kind: 'boulder', seed });
        r.push({ x: x + rr * 1.6, y: fl + rr * 1.8, r: rr * 0.8, kind: 'arch', seed: seed + 1 });
      } else {
        const rr = 0.6 + hash2(ci, i, s + 20) * 1.3;
        r.push({ x, y: fl + rr * 0.45, r: rr, kind: 'boulder', seed, sharp: hash2(ci, i, s + 21) < 0.12 });
      }
    }
    this.chunks.set(ci, r);
    return r;
  }

  private rocksNear(x: number): Rock[] {
    const ci = Math.floor(x / CHUNK);
    const a = this.rocksIn(ci), lo = this.rocksIn(ci - 1), hi = this.rocksIn(ci + 1);
    return [...lo, ...a, ...hi];
  }

  sdf(x: number, y: number): number {
    const f = this.floorAt(x);
    const sl = this.slopeAt(x);
    let d = (y - f) / Math.sqrt(1 + sl * sl);
    for (const r of this.rocksNear(x)) {
      if (Math.abs(r.x - x) > r.r + 3) continue;
      d = Math.min(d, Math.hypot(x - r.x, y - r.y) - r.r * 0.92);
    }
    for (const c of this.dynamic) d = Math.min(d, Math.hypot(x - c.x, y - c.y) - c.r);
    return d;
  }

  normal(x: number, y: number) {
    const e = 0.04;
    const dx = this.sdf(x + e, y) - this.sdf(x - e, y), dy = this.sdf(x, y + e) - this.sdf(x, y - e);
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  snags(x0: number, x1: number) {
    const out: { x: number; y: number; r: number; sharp?: boolean }[] = [];
    for (let ci = Math.floor(x0 / CHUNK) - 1; ci <= Math.floor(x1 / CHUNK) + 1; ci++) for (const r of this.rocksIn(ci)) if (r.x >= x0 - r.r && r.x <= x1 + r.r) out.push(r);
    return out;
  }
}
