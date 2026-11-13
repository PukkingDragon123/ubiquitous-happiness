// Water surface simulation, ported from FISHTOP's WaterSim (src/world/watersim.js) and moved into metres.
// Improvements: the domain slides with the camera over an infinite ocean (integer-cell shifts, no popping),
// waves reflect off nothing (open boundaries absorb instead of bouncing), floating bodies get proper
// buoyancy + drag from a submerged-fraction model, and the same Gerstner swell is evaluated on the GPU by
// the surface mesh (SWELL_GLSL) so physics and visuals agree exactly.
//
// Along the waterline (the gameplay plane's x axis):
//   - a damped 1D wave equation on a 0.1 m grid at 120 Hz substeps, with a weak spring back to rest;
//   - layered Gerstner swell (trochoid crests), sized by the weather;
//   - foam that builds where the surface is steep or fast.
//
//   sim.update(dt, centerX)          step + keep the domain centred near the camera
//   sim.disturb(x, strength, radius) an impact (positive pushes down, makes waves travel out)
//   sim.heightAt(x) / slopeAt(x)     waterline lift (m, + up) and slope
//   float(body, dt)                  buoyancy helper for bobbers, boats, bait, debris
import { TAU } from '../../core/math';

export interface Wave { A: number; L: number; c: number; Q: number }
export const SWELLS: Record<string, Wave[]> = {
  calm: [{ A: 0.12, L: 11, c: 1.7, Q: 0.5 }, { A: 0.07, L: 5.3, c: -1.1, Q: 0.45 }, { A: 0.035, L: 2.1, c: 1.4, Q: 0.6 }],
  breeze: [{ A: 0.2, L: 12, c: 2.1, Q: 0.55 }, { A: 0.1, L: 5.6, c: -1.3, Q: 0.5 }, { A: 0.05, L: 2.0, c: 1.8, Q: 0.7 }],
  rough: [{ A: 0.38, L: 15, c: 2.6, Q: 0.65 }, { A: 0.17, L: 7, c: -1.7, Q: 0.6 }, { A: 0.08, L: 2.6, c: 2.2, Q: 0.75 }],
  storm: [{ A: 0.7, L: 19, c: 3.4, Q: 0.75 }, { A: 0.3, L: 8.5, c: -2.1, Q: 0.7 }, { A: 0.13, L: 3.1, c: 2.8, Q: 0.8 }],
};

const SUB = 1 / 120;
const MAX_LIFT = 1.2;

/** analytic swell at (x, z, t): height and horizontal x displacement — mirrors SWELL_GLSL */
export function swellAt(x: number, z: number, t: number, W: Wave[]): { h: number; dx: number } {
  let h = 0, dx = 0;
  for (let i = 0; i < W.length; i++) {
    const w = W[i], k = TAU / w.L, a = (i - 1) * 0.42, cx = Math.cos(a) * Math.sign(w.c || 1), cz = Math.sin(a);
    const th = k * (cx * x + cz * z) - k * Math.abs(w.c) * t + i * 1.7;
    h += w.A * Math.cos(th);
    dx -= cx * (w.Q / (k * W.length)) * Math.sin(th);
  }
  return { h, dx };
}

/** GLSL twin of swellAt; uniforms uSwell[3] = vec4(A, L, c, Q). Returns vec3(dx, h, dz) */
export const SWELL_GLSL = /* glsl */ `
uniform vec4 uSwell[3];
vec3 swellAt(vec2 p, float t) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 w = uSwell[i];
    if (w.x < 0.0005) continue;
    float k = 6.2831853 / w.y;
    float a = (float(i) - 1.0) * 0.42;
    vec2 d = vec2(cos(a) * sign(w.z + 1e-6), sin(a));
    float th = k * dot(d, p) - k * abs(w.z) * t + float(i) * 1.7;
    o.y += w.x * cos(th);
    float q = (w.w / (k * 3.0)) * sin(th);
    o.x -= d.x * q; o.z -= d.y * q;
  }
  return o;
}
`;

export interface Floater { x: number; y: number; vy: number; roll: number; rollV: number; half: number; mass: number; draft: number; drag?: number; splash?: number }

export class WaterSim {
  cell = 0.1;
  c = 3.6;        // wave speed m/s
  damp = 0.9945;  // velocity kept per substep
  spring = 2.2;   // pull back to rest
  n: number;
  x0 = 0;          // world x of cell 0
  t = 0;
  acc = 0;
  h: Float32Array; v: Float32Array; foam: Float32Array; lift: Float32Array;
  swell: Wave[] = SWELLS.calm.map((w) => ({ ...w }));
  swellTo = 'calm';
  swellMul = 1;

  constructor(width = 90) {
    this.n = Math.ceil(width / this.cell) + 2;
    this.h = new Float32Array(this.n); this.v = new Float32Array(this.n);
    this.foam = new Float32Array(this.n); this.lift = new Float32Array(this.n);
    this.x0 = -width / 2;
  }
  get width() { return (this.n - 1) * this.cell; }

  /** keep the domain centred on cx, shifting the arrays by whole cells */
  recenter(cx: number) {
    const want = Math.round((cx - this.width / 2) / this.cell);
    const have = Math.round(this.x0 / this.cell);
    const s = want - have;
    if (s === 0) return;
    const shift = (a: Float32Array) => {
      if (Math.abs(s) >= this.n) { a.fill(0); return; }
      if (s > 0) { a.copyWithin(0, s); a.fill(0, this.n - s); } else { a.copyWithin(-s, 0, this.n + s); a.fill(0, 0, -s); }
    };
    shift(this.h); shift(this.v); shift(this.foam);
    this.x0 = want * this.cell;
  }

  idx(x: number) { return Math.max(0, Math.min(this.n - 1, Math.round((x - this.x0) / this.cell))); }

  impulse(x: number, vel: number, radius = 0.4) {
    if (!Number.isFinite(x) || !Number.isFinite(vel)) return;
    const r = Math.max(this.cell, radius);
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / this.cell)), i1 = Math.min(this.n - 1, Math.ceil((x + r - this.x0) / this.cell));
    for (let i = i0; i <= i1; i++) {
      const d = (this.x0 + i * this.cell - x) / r;
      if (d * d >= 1) continue;
      const k = (1 - d * d) ** 2;
      this.v[i] += vel * k;
      this.foam[i] = Math.min(1, this.foam[i] + Math.abs(vel) * 0.12 * k);
    }
  }

  /** strength 1 ~ bait plopping in, 3+ ~ a blobfish breaching; negative sucks the surface up */
  disturb(x: number, strength = 1, radius = 0.4) {
    const s = Math.max(-5, Math.min(5, strength));
    this.impulse(x, -s * 1.6, Math.max(0.15, radius));
  }

  setSwell(id: string, mul = 1) { this.swellTo = id; this.swellMul = mul; }

  /** t: shared clock (UW.uTime) so the GPU swell matches; defaults to integrating dt */
  update(dt: number, cx: number, t?: number) {
    dt = Math.min(0.1, Math.max(0, dt));
    this.t = t ?? this.t + dt;
    this.recenter(cx);
    const target = SWELLS[this.swellTo] || SWELLS.calm;
    const kb = 1 - Math.exp(-dt * 0.4);
    for (let i = 0; i < 3; i++) {
      const s = this.swell[i], g = target[i];
      s.A += (g.A * this.swellMul - s.A) * kb; s.L += (g.L - s.L) * kb; s.c += (g.c - s.c) * kb; s.Q += (g.Q - s.Q) * kb;
    }
    this.step(dt);
    for (let i = 0; i < this.n; i++) this.lift[i] = this.h[i] + swellAt(this.x0 + i * this.cell, 0, this.t, this.swell).h;
  }

  private step(dt: number) {
    this.acc = Math.min(0.1, this.acc + dt);
    const { h, v, n, foam } = this;
    const c2 = (this.c * this.c) / (this.cell * this.cell), dmp = this.damp, sp = this.spring;
    while (this.acc >= SUB) {
      this.acc -= SUB;
      for (let i = 0; i < n; i++) {
        const l = h[i > 0 ? i - 1 : 0], r = h[i < n - 1 ? i + 1 : n - 1];
        v[i] = (v[i] + ((l + r - 2 * h[i]) * c2 - h[i] * sp) * SUB) * dmp;
      }
      for (let i = 0; i < n; i++) {
        let y = h[i] + v[i] * SUB;
        if (y > MAX_LIFT) { y = MAX_LIFT; v[i] *= -0.25; } else if (y < -MAX_LIFT) { y = -MAX_LIFT; v[i] *= -0.25; }
        h[i] = y;
      }
      // absorbing edges (fade the outer 5%) so waves leave the domain instead of bouncing back
      const e = Math.floor(n * 0.05);
      for (let i = 0; i < e; i++) { const k = 0.97 + 0.03 * (i / e); h[i] *= k; v[i] *= k; h[n - 1 - i] *= k; v[n - 1 - i] *= k; }
    }
    const fd = Math.exp(-dt * 1.4);
    for (let i = 0; i < n; i++) {
      const s = Math.abs(h[i < n - 1 ? i + 1 : i] - h[i > 0 ? i - 1 : i]) / (this.cell * 2);
      foam[i] = Math.min(1, Math.max(foam[i] * fd, s > 0.35 ? (s - 0.35) * 1.2 : 0, Math.abs(v[i]) > 2.2 ? 0.6 : 0));
    }
  }

  heightAt(x: number): number {
    const f = (x - this.x0) / this.cell;
    if (f <= 0 || f >= this.n - 1) return swellAt(x, 0, this.t, this.swell).h;
    const i = Math.floor(f), k = f - i;
    return this.lift[i] + (this.lift[i + 1] - this.lift[i]) * k;
  }
  slopeAt(x: number) { return (this.heightAt(x + 0.15) - this.heightAt(x - 0.15)) / 0.3; }
  velocityAt(x: number) { return this.v[this.idx(x)]; }
  foamAt(x: number) { return this.foam[this.idx(x)]; }

  /** write lift samples into a Float32Array for the GPU (r = lift, g = foam), covering [x0, x0 + width] */
  fill(out: Float32Array, samples: number) {
    for (let s = 0; s < samples; s++) {
      const x = this.x0 + (s / (samples - 1)) * this.width;
      out[s * 4] = this.heightAt(x) - swellAt(x, 0, this.t, this.swell).h; // sim part only (swell is analytic on GPU)
      out[s * 4 + 1] = this.foamAt(x);
      out[s * 4 + 2] = 0; out[s * 4 + 3] = 1;
    }
  }
}

/**
 * Buoyancy for something floating at the waterline: springs toward the averaged surface under it (scaled by
 * the submerged fraction), rolls with the slope, and reports body.splash when it slaps down hard.
 */
export function float(b: Floater, dt: number, sim: WaterSim) {
  const a = sim.heightAt(b.x - b.half), c = sim.heightAt(b.x), d = sim.heightAt(b.x + b.half);
  const surf = (a + 2 * c + d) / 4;
  const target = surf - b.draft;
  const m = Math.max(0.2, b.mass);
  const prev = b.vy;
  const sub = Math.max(0, Math.min(1, (surf - (b.y - b.draft)) / (b.draft * 2 + 0.05)));
  const g = -9.8 * (1 - sub);
  b.vy += (g + (target - b.y) * (60 / m) * sub - b.vy * (b.drag ?? 4) * (0.3 + sub)) * dt;
  b.y += b.vy * dt;
  const rt = Math.atan((d - a) / (b.half * 2));
  b.rollV += ((rt - b.roll) * (40 / m) - b.rollV * 5) * dt;
  b.roll += b.rollV * dt;
  b.splash = prev < -1.5 && b.vy > prev * 0.4 ? -prev : 0;
  return b;
}
