// 2D soft body for the blobfish: a ring of point masses around the body outline, held in shape by
// orientation-controlled shape matching (with cartoon squash/stretch along the velocity), edge springs that
// keep the skin wobbly, and an area/pressure term. Points collide with the terrain SDF individually, so the
// blob squishes against rocks, bulges, and bounces back with a jelly wobble.
//
// The renderer reads `disp(theta)`: how far the outline moved from rest at an angle (in body space), and
// bends the 3D mesh to match (vertex shader), so the squish is visible on the actual model.
import { TAU } from '../core/math';

export interface SBPoint { x: number; y: number; vx: number; vy: number; rx: number; ry: number }

export class SoftBody {
  n: number;
  pts: SBPoint[] = [];
  rest: { x: number; y: number }[] = [];   // rest offsets in body space (x forward, y up)
  restAng: number[] = [];
  restR: number[] = [];
  cx = 0; cy = 0; vx = 0; vy = 0;
  angle = 0;           // commanded body angle (pitch), radians
  flip = 1;            // 1 facing right, -1 facing left (mirrors the rest shape)
  stiff = 160;         // shape matching spring
  damp = 7;            // relative damping
  edgeK = 260;
  stretch = 0;         // cartoon stretch along stretchDir (+ stretch, - squash)
  stretchDir = 0;
  inflate = 1;         // uniform scale (puff / bloat)
  restitution = 0.55;
  friction = 0.3;
  contact = 0;         // 0..1: how many points touched solid this step (for squish sounds)
  impact = 0;          // strongest impact speed this frame
  impactNx = 0; impactNy = 0;
  private edgeRest: number[] = [];

  /** outline(theta) -> radius in body space; n points */
  constructor(outline: (a: number) => { x: number; y: number }, n = 18) {
    this.n = n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const p = outline(a);
      this.rest.push(p);
      this.restAng.push(Math.atan2(p.y, p.x));
      this.restR.push(Math.hypot(p.x, p.y));
      this.pts.push({ x: p.x, y: p.y, vx: 0, vy: 0, rx: p.x, ry: p.y });
    }
    for (let i = 0; i < n; i++) { const a = this.rest[i], b = this.rest[(i + 1) % n]; this.edgeRest.push(Math.hypot(b.x - a.x, b.y - a.y)); }
  }

  place(x: number, y: number) {
    this.cx = x; this.cy = y;
    for (let i = 0; i < this.n; i++) { const t = this.target(i); this.pts[i].x = t.x; this.pts[i].y = t.y; this.pts[i].vx = 0; this.pts[i].vy = 0; }
  }

  /** world-space target for point i given the centroid, angle, flip, stretch */
  target(i: number) {
    let qx = this.rest[i].x * this.flip, qy = this.rest[i].y;
    // squash & stretch in the stretch frame (volume preserving)
    if (this.stretch !== 0) {
      const c = Math.cos(this.stretchDir - this.angle), s = Math.sin(this.stretchDir - this.angle);
      const a = qx * c + qy * s, b = -qx * s + qy * c;
      const k = 1 + this.stretch, a2 = a * k, b2 = b / Math.sqrt(k);
      qx = a2 * c - b2 * s; qy = a2 * s + b2 * c;
    }
    qx *= this.inflate; qy *= this.inflate;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return { x: this.cx + qx * c - qy * s, y: this.cy + qx * s + qy * c };
  }

  /** apply an acceleration to every point (swimming, gravity, currents) */
  accel(ax: number, ay: number, dt: number) { for (const p of this.pts) { p.vx += ax * dt; p.vy += ay * dt; } }

  /** a localized poke: points facing (dx, dy) get pushed inward — hits, bumps */
  poke(dx: number, dy: number, strength: number) {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    for (const p of this.pts) {
      const ox = p.x - this.cx, oy = p.y - this.cy, ol = Math.hypot(ox, oy) || 1;
      const facing = Math.max(0, -(ox * ux + oy * uy) / ol);
      p.vx += ux * strength * (0.4 + facing * 1.6);
      p.vy += uy * strength * (0.4 + facing * 1.6);
    }
  }

  step(dt: number, sdf: ((x: number, y: number) => number) | null, normal: ((x: number, y: number) => { x: number; y: number }) | null) {
    const sub = 4, h = dt / sub;
    this.impact = 0;
    let touching = 0;
    for (let s = 0; s < sub; s++) {
      // centroid + mean velocity
      let cx = 0, cy = 0, vx = 0, vy = 0;
      for (const p of this.pts) { cx += p.x; cy += p.y; vx += p.vx; vy += p.vy; }
      cx /= this.n; cy /= this.n; vx /= this.n; vy /= this.n;
      this.cx = cx; this.cy = cy; this.vx = vx; this.vy = vy;
      // shape matching + damping relative to the body
      for (let i = 0; i < this.n; i++) {
        const p = this.pts[i], t = this.target(i);
        p.vx += ((t.x - p.x) * this.stiff - (p.vx - vx) * this.damp) * h;
        p.vy += ((t.y - p.y) * this.stiff - (p.vy - vy) * this.damp) * h;
      }
      // edge springs
      for (let i = 0; i < this.n; i++) {
        const a = this.pts[i], b = this.pts[(i + 1) % this.n];
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1e-6;
        const f = (l - this.edgeRest[i] * this.inflate) * this.edgeK * h, ux = dx / l, uy = dy / l;
        a.vx += ux * f * 0.5; a.vy += uy * f * 0.5; b.vx -= ux * f * 0.5; b.vy -= uy * f * 0.5;
      }
      // integrate + collide
      for (const p of this.pts) {
        p.x += p.vx * h; p.y += p.vy * h;
        if (sdf && normal) {
          const d = sdf(p.x, p.y);
          if (d < 0) {
            const nn = normal(p.x, p.y);
            p.x -= nn.x * d; p.y -= nn.y * d;
            const vn = p.vx * nn.x + p.vy * nn.y;
            if (vn < 0) {
              if (-vn > this.impact) { this.impact = -vn; this.impactNx = nn.x; this.impactNy = nn.y; }
              const tx = p.vx - vn * nn.x, ty = p.vy - vn * nn.y;
              p.vx = tx * (1 - this.friction) - vn * nn.x * this.restitution;
              p.vy = ty * (1 - this.friction) - vn * nn.y * this.restitution;
            }
            touching++;
          }
        }
      }
    }
    this.contact = touching / (this.n * sub);
    let cx = 0, cy = 0, vx = 0, vy = 0;
    for (const p of this.pts) { cx += p.x; cy += p.y; vx += p.vx; vy += p.vy; }
    this.cx = cx / this.n; this.cy = cy / this.n; this.vx = vx / this.n; this.vy = vy / this.n;
    // rest-relative offsets in body space for rendering
    const c = Math.cos(-this.angle), s = Math.sin(-this.angle);
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      const ox = p.x - this.cx, oy = p.y - this.cy;
      p.rx = (ox * c - oy * s) * this.flip; p.ry = ox * s + oy * c;
    }
  }

  /** displacement of the outline from rest, in body space, at body-space angle a (interpolated) */
  disp(a: number, out: { x: number; y: number }) {
    // find the two rest points bracketing angle a
    let best = 0, bd = 1e9;
    for (let i = 0; i < this.n; i++) { let d = a - this.restAng[i]; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < bd) { bd = Math.abs(d); best = i; } }
    const i0 = best;
    let d0 = a - this.restAng[i0]; d0 = Math.atan2(Math.sin(d0), Math.cos(d0));
    const i1 = (i0 + (d0 >= 0 ? 1 : this.n - 1)) % this.n;
    let span = this.restAng[i1] - this.restAng[i0]; span = Math.abs(Math.atan2(Math.sin(span), Math.cos(span))) || 1e-3;
    const t = Math.min(1, Math.abs(d0) / span);
    const p0 = this.pts[i0], p1 = this.pts[i1];
    const dx0 = p0.rx - this.rest[i0].x, dy0 = p0.ry - this.rest[i0].y;
    const dx1 = p1.rx - this.rest[i1].x, dy1 = p1.ry - this.rest[i1].y;
    out.x = dx0 + (dx1 - dx0) * t; out.y = dy0 + (dy1 - dy0) * t;
    return out;
  }
}
