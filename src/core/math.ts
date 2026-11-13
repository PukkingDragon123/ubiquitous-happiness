// Small math helpers shared by every system. World convention: metres, +x right, +y up,
// gameplay plane z = 0, water surface at y = 0 (see WATER_Y).
export const TAU = Math.PI * 2;
export const WATER_Y = 0;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a || 1));
export const smooth = (a: number, b: number, v: number) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
export const remap = (v: number, a: number, b: number, c: number, d: number) => c + (d - c) * invLerp(a, b, v);
/** frame-rate independent exponential approach: k = responsiveness per second */
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
export const dampAngle = (a: number, b: number, k: number, dt: number) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));
export const len2 = (x: number, y: number) => Math.sqrt(x * x + y * y);
export const easeOutBack = (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeOutElastic = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** distance from point p to segment ab (2D) and the param t along ab */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number; x: number; y: number } {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  const x = ax + dx * t, y = ay + dy * t;
  return { d: Math.hypot(px - x, py - y), t, x, y };
}

/** do segments ab and cd intersect (2D)? */
export function segHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// ------------------------------------------------------------------ hashing / noise (deterministic)
export function hash2(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash1(x: number, s = 0): number { return hash2(x, 0x5bd1e995, s); }
export function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 4, s = 0): number {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { a += vnoise(x * f, y * f, s + i * 17) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return a / n;
}
export function noise1(x: number, s = 0): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash1(i, s) * (1 - u) + hash1(i + 1, s) * u;
}
