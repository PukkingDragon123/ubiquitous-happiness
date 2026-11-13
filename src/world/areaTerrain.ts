// Gameplay terrain for a bounded v2 area on the z = 0 plane: the deformable sand floor (SandField over the
// bedrock), static rock circles lines can wrap around, dynamic solids (wreck hulls, ice keels) refreshed by
// whoever owns them, an optional ice ceiling and hard walls at the area ends.
import type { Terrain } from '../game/types';
import type { SandField } from './sand';

export interface SolidCircle { x: number; y: number; r: number; sharp?: boolean }

const BUCKET = 4;

export class AreaTerrain implements Terrain {
  sand: SandField;
  x0: number; x1: number;
  rocks: SolidCircle[] = [];
  private grid = new Map<number, SolidCircle[]>();
  /** extra solid circles refreshed by their owners (wreck hull, icebergs, boats) */
  dynamic: SolidCircle[] = [];
  /** optional solid ceiling (ice shelf underside): y of the ceiling at x, or null where open */
  ceiling: ((x: number) => number | null) | null = null;

  constructor(sand: SandField, x0: number, x1: number) { this.sand = sand; this.x0 = x0; this.x1 = x1; }

  addRock(c: SolidCircle) {
    this.rocks.push(c);
    const b0 = Math.floor((c.x - c.r) / BUCKET), b1 = Math.floor((c.x + c.r) / BUCKET);
    for (let b = b0; b <= b1; b++) { const l = this.grid.get(b) ?? []; l.push(c); this.grid.set(b, l); }
  }

  floorAt(x: number): number { return this.sand.heightAt(x); }

  sdf(x: number, y: number): number {
    const f = this.sand.heightAt(x);
    const sl = (this.sand.heightAt(x + 0.2) - this.sand.heightAt(x - 0.2)) / 0.4;
    let d = (y - f) / Math.sqrt(1 + sl * sl);
    const b = Math.floor(x / BUCKET);
    for (let k = b - 1; k <= b + 1; k++) {
      const l = this.grid.get(k);
      if (l) for (const c of l) { const dd = Math.hypot(x - c.x, y - c.y) - c.r; if (dd < d) d = dd; }
    }
    for (const c of this.dynamic) { if (Math.abs(c.x - x) > c.r + 4) continue; const dd = Math.hypot(x - c.x, y - c.y) - c.r; if (dd < d) d = dd; }
    if (this.ceiling) { const cy = this.ceiling(x); if (cy !== null) d = Math.min(d, cy - y); }
    // hard walls just outside the playable span
    d = Math.min(d, x - (this.x0 - 1), (this.x1 + 1) - x);
    return d;
  }

  normal(x: number, y: number) {
    const e = 0.04;
    const dx = this.sdf(x + e, y) - this.sdf(x - e, y), dy = this.sdf(x, y + e) - this.sdf(x, y - e);
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  snags(x0: number, x1: number) {
    const out: SolidCircle[] = [];
    for (const r of this.rocks) if (r.x >= x0 - r.r && r.x <= x1 + r.r) out.push(r);
    return out;
  }
}
