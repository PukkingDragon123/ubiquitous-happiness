// Sculpted low-poly rocks, ported from Oddworld's rocks.ts to PS1 density: an icosphere (level 1-2) swollen by
// 3D noise, flattened underneath and cut by planar fractures that leave crisp facets; spires as bedded lathes;
// natural arches as a swept boxy section; icebergs as cut crystals; pillow lava as squashed lumps. Each shape is
// a unit-sized Soup (base at y = 0, |x|,|z| <= 1, top at y = 1) with cavity occlusion in the vertex colour, so
// placement just scales it and appends it into a merged chunk mesh.
import { Soup, icosphere, cavity, addIndexed, V3, v3 } from './lp';
import { Rng } from '../core/rng';
import { hash2 } from '../core/math';

/** cheap 3D value noise */
function n3(x: number, y: number, z: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a: number, b: number, c: number) => hash2(a + c * 157, b - c * 113, s);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
export function fbm3(x: number, y: number, z: number, oct: number, s: number) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { a += (n3(x * f, y * f, z * f, s + i * 31) - 0.5) * amp; n += amp; amp *= 0.5; f *= 2.07; }
  return a / n * 2;
}

export interface BoulderOpts { level?: number; rough?: number; cuts?: number; cutLo?: number; flat?: number; box?: number; layers?: number; recess?: number; ao?: number }

/** weathered boulder in the unit box */
export function boulder(seed: number, o: BoulderOpts = {}): Soup {
  const r = new Rng(seed);
  const src = icosphere(o.level ?? 1), n = src.p.length / 3, p = new Float32Array(n * 3);
  const ox = r.range(-50, 50), oy = r.range(-50, 50), oz = r.range(-50, 50);
  const rough = o.rough ?? 0.35, flat = o.flat ?? 0.35;
  const cuts: [V3, number][] = [];
  for (let k = 0; k < (o.cuts ?? 4); k++) {
    const a = r.range(0, Math.PI * 2), el = r.range(-0.2, 1.1);
    cuts.push([[Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)], r.range(o.cutLo ?? 0.62, (o.cutLo ?? 0.62) + 0.22)]);
  }
  for (let v = 0; v < n; v++) {
    let x = src.p[v * 3], y = src.p[v * 3 + 1], z = src.p[v * 3 + 2];
    if (o.box) { const e = o.box; x = Math.sign(x) * Math.pow(Math.abs(x), e); y = Math.sign(y) * Math.pow(Math.abs(y), e); z = Math.sign(z) * Math.pow(Math.abs(z), e); }
    const f = 1 + fbm3(x * 1.3 + ox, y * 1.3 + oy, z * 1.3 + oz, 3, seed) * rough;
    x *= f; y *= f; z *= f;
    if (y < 0) y *= flat;
    for (const [c, d] of cuts) { const s = x * c[0] + y * c[1] + z * c[2]; if (s > d) { const k = (s - d) * 0.92; x -= c[0] * k; y -= c[1] * k; z -= c[2] * k; } }
    p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
  }
  normalise(p, o.layers, o.recess);
  const ao = cavity(p, src.i, o.ao ?? 4);
  return addIndexed(new Soup(), p, src.i, ao);
}

/** fit positions into |x|,|z| <= 1, y 0..1, with optional bedding recesses */
function normalise(p: Float32Array, layers?: number, recess = 0.08) {
  const n = p.length / 3;
  let y0 = 1e9, y1 = -1e9, xm = 0, zm = 0;
  for (let v = 0; v < n; v++) { y0 = Math.min(y0, p[v * 3 + 1]); y1 = Math.max(y1, p[v * 3 + 1]); xm = Math.max(xm, Math.abs(p[v * 3])); zm = Math.max(zm, Math.abs(p[v * 3 + 2])); }
  for (let v = 0; v < n; v++) {
    let y = (p[v * 3 + 1] - y0) / (y1 - y0 || 1), s = 1;
    if (layers) { const b = Math.floor(y * layers), fr = y * layers - b; s = 1 - recess * (hash2(b, 3, 7) * 0.8 + 0.2) * Math.sqrt(Math.sin(Math.PI * fr)); }
    p[v * 3] = p[v * 3] / (xm || 1) * s; p[v * 3 + 2] = p[v * 3 + 2] / (zm || 1) * s; p[v * 3 + 1] = y;
  }
}

/** a bedded spire / sea stack (lathe), radius 1 at the base, height 1 */
export function spire(seed: number, o: { sides?: number; rings?: number; waist?: number; cap?: number; lean?: number } = {}): Soup {
  const r = new Rng(seed);
  const NS = o.sides ?? 7, NR = o.rings ?? 7;
  const ox = r.range(-50, 50), beds = r.range(3, 6);
  const rings: V3[][] = [];
  for (let j = 0; j <= NR; j++) {
    const t = j / NR, bed = Math.floor(t * beds), fr = t * beds - bed;
    const prof = (1 - t * 0.62) * (1 - (o.waist ?? 0.2) * Math.sin(Math.PI * t)) + (o.cap ?? 0) * Math.max(0, t - 0.8) * 4 + (fbm3(ox, t * 2.5, 0, 2, seed + 5)) * 0.25;
    const ring: V3[] = [];
    for (let k = 0; k < NS; k++) {
      const a = (k / NS) * Math.PI * 2 + (j % 2) * (Math.PI / NS);
      let rr = prof * (1 + fbm3(Math.cos(a) * 1.3 + ox, t * 4, Math.sin(a) * 1.3, 3, seed) * 0.55);
      rr *= 1 - 0.12 * hash2(bed, 5, seed) * Math.sqrt(Math.sin(Math.PI * fr));
      const lean = (o.lean ?? 0) * t * t;
      ring.push([Math.cos(a) * rr + lean, t, Math.sin(a) * rr]);
    }
    rings.push(ring);
  }
  const s = new Soup();
  s.loft(rings, undefined, { tip: [(o.lean ?? 0), 1.04, 0] });
  shadeByCavity(s, 0);
  return s;
}

/** a natural arch spanning x in [-1, 1], height 1, thickness ~0.35 (z) */
export function arch(seed: number, o: { lintel?: number; foot?: number; sides?: number; seg?: number } = {}): Soup {
  const r = new Rng(seed);
  const NA = o.seg ?? 12, NS = o.sides ?? 6, lintel = o.lintel ?? r.range(0.18, 0.26), ox = r.range(-50, 50);
  const path: V3[] = [[-1.12, -0.15, 0]];
  for (let j = 0; j <= NA; j++) { const a = Math.PI - (j / NA) * Math.PI; path.push([Math.cos(a) * 0.82, Math.sin(a) * (1 - lintel * 0.6), 0]); }
  path.push([1.12, -0.15, 0]);
  const rings: V3[][] = [];
  for (let j = 0; j < path.length; j++) {
    const a = path[Math.max(0, j - 1)], b = path[Math.min(path.length - 1, j + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, u = j / (path.length - 1), foot = Math.pow(Math.abs(u - 0.5) * 2, 2.2) * (o.foot ?? 1);
    const rv = lintel * 0.5 + foot * 0.32, rz = 0.3 * (0.8 + foot * 0.8);
    const ring: V3[] = [];
    for (let k = 0; k < NS; k++) {
      const a2 = (k / NS) * Math.PI * 2 + (j % 2) * Math.PI / NS, c = Math.sign(Math.cos(a2)) * Math.pow(Math.abs(Math.cos(a2)), 0.5), sn = Math.sign(Math.sin(a2)) * Math.pow(Math.abs(Math.sin(a2)), 0.5);
      const q: V3 = [path[j][0] + nx * c * rv, path[j][1] + ny * c * rv, sn * rz];
      const f = 1 + fbm3(q[0] * 1.6 + ox, q[1] * 1.6, q[2] * 1.6, 3, seed) * 0.35;
      ring.push([path[j][0] + (q[0] - path[j][0]) * f, Math.max(-0.15, path[j][1] + (q[1] - path[j][1]) * f), q[2] * f]);
    }
    rings.push(ring);
  }
  const s = new Soup();
  s.loft(rings);
  shadeByCavity(s, 0);
  return s;
}

/** a floating iceberg / ice keel: a cut crystal, waterline at y = 1 (top), keel hanging down to y = 0 */
export function iceberg(seed: number): Soup {
  const r = new Rng(seed);
  const src = icosphere(1), n = src.p.length / 3, p = new Float32Array(n * 3);
  const cuts: [V3, number][] = [];
  for (let k = 0; k < 7; k++) { const a = r.range(0, Math.PI * 2), el = r.range(-1.2, 0.4); cuts.push([[Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)], r.range(0.45, 0.75)]); }
  for (let v = 0; v < n; v++) {
    let x = src.p[v * 3], y = src.p[v * 3 + 1], z = src.p[v * 3 + 2];
    if (y > 0.3) y = 0.3 + (y - 0.3) * 0.2; // flat top at the surface
    else y *= 1.6;                            // deep keel
    for (const [c, d] of cuts) { const s = x * c[0] + y * c[1] + z * c[2]; if (s > d) { x -= c[0] * (s - d); y -= c[1] * (s - d); z -= c[2] * (s - d); } }
    p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
  }
  normalise(p);
  return addIndexed(new Soup(), p, src.i, cavity(p, src.i, 2));
}

/** a cluster of pillow-lava lumps (abyss) in the unit box */
export function pillows(seed: number): Soup {
  const r = new Rng(seed);
  const s = new Soup();
  const k = r.int(3, 5);
  for (let i = 0; i < k; i++) {
    const b = boulder(seed * 7 + i, { level: 1, rough: 0.2, cuts: 1, flat: 0.5 });
    const sc = r.range(0.35, 0.6);
    const x = r.range(-0.6, 0.6), z = r.range(-0.6, 0.6), y = i === 0 ? 0 : r.range(0, 0.4);
    for (let q = 0; q < b.count; q++) {
      s.vert([b.P[q * 3] * sc * 1.3 + x, b.P[q * 3 + 1] * sc * 0.8 + y, b.P[q * 3 + 2] * sc + z], b.UV[q * 2], b.UV[q * 2 + 1], [b.C[q * 3], b.C[q * 3 + 1], b.C[q * 3 + 2]]);
    }
  }
  return s;
}

/** darken low / downward faces a little (ambient occlusion for lofted shapes without a cavity pass) */
function shadeByCavity(s: Soup, from: number) {
  s.paintSince(from, (p, n, c) => {
    const k = 0.72 + 0.28 * Math.max(0, n[1] * 0.5 + 0.5) + Math.min(0.1, p[1] * 0.1);
    return [c[0] * k, c[1] * k, c[2] * k];
  });
}

/** vertex tint for placed rock faces: palette jitter, cavity, top crust (algae / coralline / snow / sulfur) */
export function crustPainter(base: [number, number, number], top: [number, number, number], topK: number, from: number, s: Soup) {
  s.paintSince(from, (p, n, c) => {
    const up = Math.max(0, n[1]);
    const k = Math.pow(Math.max(0, (up - 0.55) / 0.45), 1.4) * topK * (0.7 + 0.6 * hash2(Math.floor(p[0] * 2), Math.floor(p[2] * 2), 3));
    const r = c[0] * (base[0] + (top[0] - base[0]) * k), g = c[1] * (base[1] + (top[1] - base[1]) * k), b = c[2] * (base[2] + (top[2] - base[2]) * k);
    return [r, g, b];
  });
}

export { v3 };
