// Gameplay terrain for a side-scrolling level: the area's deformable sand floor over the bedrock (AreaTerrain:
// sand heightfield, rock circles, hard walls at the level ends, an optional ice ceiling) plus rock bodies on the
// gameplay plane: ledges, cave lids, mounds, cracked secret lids and the arena gates (rounded boxes that can be
// switched on and off). Bodies are bucketed by x so sdf() stays cheap.
import { AreaTerrain } from '../world/areaTerrain';
import type { SandField } from '../world/sand';

export interface Body {
  x0: number; x1: number; y0: number; y1: number;
  /** corner rounding */
  r: number;
  /** false = not solid right now (an open gate, a bombed lid) */
  on: () => boolean;
  tag?: string;
}

const BUCKET = 8;

/** signed distance to a rounded box (negative inside) */
function boxSdf(b: Body, x: number, y: number) {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const hx = (b.x1 - b.x0) / 2 - b.r, hy = (b.y1 - b.y0) / 2 - b.r;
  const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - b.r;
}

export class LevelTerrain extends AreaTerrain {
  bodies: Body[] = [];
  private bgrid = new Map<number, Body[]>();
  constructor(sand: SandField, x0: number, x1: number) { super(sand, x0, x1); }

  addBody(b: Body) {
    this.bodies.push(b);
    for (let k = Math.floor((b.x0 - 1) / BUCKET); k <= Math.floor((b.x1 + 1) / BUCKET); k++) { const l = this.bgrid.get(k) ?? []; l.push(b); this.bgrid.set(k, l); }
    return b;
  }

  sdf(x: number, y: number): number {
    let d = super.sdf(x, y);
    const k = Math.floor(x / BUCKET);
    for (let i = k - 1; i <= k + 1; i++) {
      const l = this.bgrid.get(i);
      if (!l) continue;
      for (const b of l) {
        if (x < b.x0 - 3 || x > b.x1 + 3 || !b.on()) continue;
        const s = boxSdf(b, x, y);
        if (s < d) d = s;
      }
    }
    return d;
  }

  /** the walkable floor under x: the sand, or the top of a solid body below `fromY` (ledges, lids) */
  floorUnder(x: number, fromY: number): number {
    let f = this.sand.heightAt(x);
    const l = this.bgrid.get(Math.floor(x / BUCKET));
    if (l) for (const b of l) if (b.on() && x > b.x0 && x < b.x1 && b.y1 <= fromY + 0.3 && b.y1 > f) f = b.y1;
    return f;
  }
}
