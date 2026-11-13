// Small shared toolkit for the area detail pass (heroes, critters, the deep): face-planar UV remapping into an
// atlas region, ray casts against merged soups (to sit things exactly on sculpted surfaces), soft additive glow
// fans, and the extra painted prop surfaces (marble, clear ice, frost, leaded glass, critter skins).
import * as THREE from 'three';
import { Soup, V3, UVR, v3 } from '../world/lp';
import type { Atlas, Region } from '../world/atlas';
import { hueRamp } from '../world/pixart';
import { cells } from '../world/texlib';
import { hex, RGB } from '../gfx/px';
import { hash2 } from '../core/math';
import { Rng } from '../core/rng';

export const TAU = Math.PI * 2;

/** '#rrggbb' -> [r, g, b] in 0..1 (times k) */
export const rgb01 = (c: string, k = 1): [number, number, number] => { const h = hex(c); return [h[0] / 255 * k, h[1] / 255 * k, h[2] / 255 * k]; };

/**
 * Re-map the UVs of every triangle added to `s` since `from` by box projection at `scale` tiles per metre.
 * Each face keeps the texture at constant density and is shifted to fit inside the region (no wrap smears):
 * a clean, per-facet PS1-style mapping. `pick` chooses the region per face from its normal and centre.
 */
export function faceUV(s: Soup, from: number, pick: UVR | ((n: V3, c: V3) => UVR), scale: number, to = s.count) {
  const P = s.P, UV = s.UV;
  for (let f = from; f + 2 < to; f += 3) {
    const a: V3 = [P[f * 3], P[f * 3 + 1], P[f * 3 + 2]], b: V3 = [P[f * 3 + 3], P[f * 3 + 4], P[f * 3 + 5]], c: V3 = [P[f * 3 + 6], P[f * 3 + 7], P[f * 3 + 8]];
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    const ce: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const r = typeof pick === 'function' ? pick(n, ce) : pick;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const proj = (q: V3): [number, number] => (ay >= ax && ay >= az ? [q[0], q[2]] : ax >= az ? [q[2], q[1]] : [q[0], q[1]]);
    const uvs = [proj(a), proj(b), proj(c)].map(([u, v]) => [u * scale, v * scale]);
    for (const k of [0, 1]) {
      const lo = Math.min(uvs[0][k], uvs[1][k], uvs[2][k]), hi = Math.max(uvs[0][k], uvs[1][k], uvs[2][k]), span = hi - lo;
      if (span > 0.98) { const sq = 0.98 / span; for (const q of uvs) q[k] = (q[k] - lo) * sq + 0.01; continue; }
      // shift into [0, 1) keeping the tile phase where the face fits, else slide it back so it does
      let off = Math.floor(lo);
      if (hi - off > 0.99) off = hi - 0.99;
      for (const q of uvs) q[k] -= off;
    }
    for (let k = 0; k < 3; k++) {
      UV[(f + k) * 2] = r.u0 + (r.u1 - r.u0) * Math.min(1, Math.max(0, uvs[k][0]));
      UV[(f + k) * 2 + 1] = r.v0 + (r.v1 - r.v0) * Math.min(1, Math.max(0, uvs[k][1]));
    }
  }
}

/** per-face vertex colour + glow rewrite since `from`: fn(normal, centre) -> [r, g, b, glow] */
export function faceTone(s: Soup, from: number, fn: (n: V3, c: V3, f: number) => [number, number, number, number]) {
  const P = s.P;
  for (let f = from; f + 2 < s.count; f += 3) {
    const a: V3 = [P[f * 3], P[f * 3 + 1], P[f * 3 + 2]], b: V3 = [P[f * 3 + 3], P[f * 3 + 4], P[f * 3 + 5]], c: V3 = [P[f * 3 + 6], P[f * 3 + 7], P[f * 3 + 8]];
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    const ce: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const [r, g, bl, gl] = fn(n, ce, f);
    for (let k = 0; k < 3; k++) { const i = f + k; s.C[i * 3] *= r; s.C[i * 3 + 1] *= g; s.C[i * 3 + 2] *= bl; s.G[i] = gl < 0 ? s.G[i] : gl; }
  }
}

/** nearest hit t of the ray o + d t against the triangles of `s` (optionally only [from, to)); null if none */
export function castSoup(s: Soup, o: V3, d: V3, maxT = 50, from = 0, to = s.count): number | null {
  const P = s.P;
  let best: number | null = null;
  const ex = o[0] + d[0] * maxT, ey = o[1] + d[1] * maxT, ez = o[2] + d[2] * maxT;
  const bx0 = Math.min(o[0], ex) - 0.01, bx1 = Math.max(o[0], ex) + 0.01, bz0 = Math.min(o[2], ez) - 0.01, bz1 = Math.max(o[2], ez) + 0.01, by0 = Math.min(o[1], ey) - 0.01, by1 = Math.max(o[1], ey) + 0.01;
  for (let f = from; f + 2 < to; f += 3) {
    const i = f * 3;
    const ax = P[i], ay = P[i + 1], az = P[i + 2], bx = P[i + 3], by = P[i + 4], bz = P[i + 5], cx = P[i + 6], cy = P[i + 7], cz = P[i + 8];
    if (Math.max(ax, bx, cx) < bx0 || Math.min(ax, bx, cx) > bx1 || Math.max(az, bz, cz) < bz0 || Math.min(az, bz, cz) > bz1 || Math.max(ay, by, cy) < by0 || Math.min(ay, by, cy) > by1) continue;
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det, tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 0 && t < maxT && (best === null || t < best)) best = t;
  }
  return best;
}

/** a soft additive glow disc (centre bright, rim black) facing +z, as a coloured fan */
export function glowFan(pos: number[], col: number[], c: V3, rx: number, ry: number, k: [number, number, number], n = 10, a0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, b = a0 + ((i + 1) / n) * TAU;
    pos.push(c[0], c[1], c[2], c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry, c[2], c[0] + Math.cos(b) * rx, c[1] + Math.sin(b) * ry, c[2]);
    col.push(k[0], k[1], k[2], 0, 0, 0, 0, 0, 0);
  }
}

/** a soup point on a triangle surface (random barycentric) + its normal, for scattering barnacles etc. */
export function surfacePoints(s: Soup, from: number, to: number, n: number, r: Rng, ok: (nrm: V3, p: V3) => boolean): { p: V3; n: V3 }[] {
  const out: { p: V3; n: V3 }[] = [];
  const faces = Math.floor((to - from) / 3);
  for (let tries = 0; tries < n * 12 && out.length < n && faces > 0; tries++) {
    const f = from + r.int(0, faces - 1) * 3, P = s.P;
    const a: V3 = [P[f * 3], P[f * 3 + 1], P[f * 3 + 2]], b: V3 = [P[f * 3 + 3], P[f * 3 + 4], P[f * 3 + 5]], c: V3 = [P[f * 3 + 6], P[f * 3 + 7], P[f * 3 + 8]];
    const nrm = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    let u = r.next(), w = r.next(); if (u + w > 1) { u = 1 - u; w = 1 - w; }
    const p = v3.add(a, v3.add(v3.mul(v3.sub(b, a), u), v3.mul(v3.sub(c, a), w)));
    if (ok(nrm, p)) out.push({ p, n: nrm });
  }
  return out;
}

/** rotation matrix taking +y onto the unit vector n (for things growing out of a surface) */
export function alignY(n: V3, spin = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n[0], n[1], n[2]).normalize());
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin);
  return new THREE.Matrix4().makeRotationFromQuaternion(q.multiply(q2));
}

// ------------------------------------------------------------------ painted surfaces (prop atlas)
type Fill = (x: number, y: number) => RGB;

/** weathered marble: pale warm stone in big flat grains, a lit seam on some, faint grey veins */
export function marble(A: Atlas): UVR {
  return A.paint('marble', 32, 32, (p, w, h) => {
    const T = hueRamp('#dcd4c4', 5, { spread: 0.7 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells(x, y, 16, 41, 32), e = c.f2 - c.f1, l = Math.hypot(c.dx, c.dy) || 1;
      let t = c.id > 0.6 ? 3 : 2 + (c.id > 0.3 ? 1 : 0);
      if (e < 0.9 && (c.dx / l) * -0.6 + (c.dy / l) * -0.8 > 0.3) t = 4;
      p.set(x, y, T[t]);
    }
    for (const [y0, k] of [[9, 0.5], [24, -0.3]] as const) for (let x = 0; x < w; x++) { const y = Math.round(y0 + Math.sin(x * 0.3 + y0) * 2 + x * k * 0.2); p.set(x, ((y % h) + h) % h, T[2]); }
  });
}

/** clear glacier ice: big soft-edged grains in a few close blues (lit seams only), embedded bubbles, white cracks */
export function iceClear(A: Atlas): UVR {
  return A.paint('iceClear', 64, 64, (p, w, h) => {
    const T = hueRamp('#4aa6d8', 6, { spread: 1.1, lo: 0.26 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells(x, y, 32, 57, 64), e = c.f2 - c.f1, l = Math.hypot(c.dx, c.dy) || 1;
      let t = c.id > 0.5 ? 3 : 2;                                          // clear cores in two close blues
      if (e < 1.1 && (c.dx / l) * -0.6 + (c.dy / l) * -0.8 > 0.2) t = 4;    // one lit seam per grain, no dark lines
      p.set(x, y, T[t]);
    }
    const r = new Rng(91);
    // cracks: a bright fracture line with a soft deeper shadow beside it
    for (let k = 0; k < 2; k++) {
      let x = r.range(0, w), y = r.range(0, h), a = r.range(0, TAU);
      for (let i = 0; i < 40; i++) {
        a += r.range(-0.45, 0.45);
        x += Math.cos(a); y += Math.sin(a) * 0.7;
        const xi = ((Math.round(x) % w) + w) % w, yi = ((Math.round(y) % h) + h) % h;
        p.set(xi, yi, T[5]); p.set(xi, (yi + 1) % h, T[1]);
      }
    }
    // embedded bubbles: a light rim, a clear core, one hot highlight pixel (top left)
    for (let k = 0; k < 14; k++) {
      const cx = Math.floor(r.range(2, w - 3)), cy = Math.floor(r.range(2, h - 3)), rr = r.chance(0.3) ? 2 : 1;
      if (rr === 2) { for (const [dx, dy] of [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [0, 2], [1, 2]]) p.set(cx + dx, cy + dy, T[4]); for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) p.set(cx + dx, cy + dy, T[2]); p.set(cx - 1, cy - 1, T[5]); }
      else { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) p.set(cx + dx, cy + dy, T[4]); p.set(cx, cy, T[3]); p.set(cx - 1, cy - 1, T[5]); }
    }
  });
}

/** hoar frost / snow crust: pale blue-white with tiny lit crystal flecks */
export function iceFrost(A: Atlas): UVR {
  return A.paint('iceFrost', 32, 32, (p, w, h) => {
    const T = hueRamp('#c8e4f4', 5, { spread: 0.9 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells(x, y, 8, 63, 32), e = c.f2 - c.f1;
      p.set(x, y, T[e < 0.7 ? 2 : c.id > 0.5 ? 3 : 4]);
    }
    for (let k = 0; k < 14; k++) { const x = Math.floor(hash2(k, 1, 77) * w), y = Math.floor(hash2(k, 2, 77) * h); p.set(x, y, T[4]); p.set(x + 1, y, '#ffffff'); p.set(x, y + 1, T[1]); }
  });
}

/** leaded stained glass: bold panes in a jewel colour with dark lead cames, a lit corner per pane */
export function stainedGlass(A: Atlas, name: string, base: string): UVR {
  return A.paint(name, 32, 32, (p, w, h) => {
    const T = hueRamp(base, 5, { spread: 1.2 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells(x, y, 16, name.length * 13, 32), e = c.f2 - c.f1, l = Math.hypot(c.dx, c.dy) || 1;
      if (e < 1.4) { p.set(x, y, [24, 20, 26]); continue; }
      const lit = (c.dx / l) * -0.6 + (c.dy / l) * -0.8;
      p.set(x, y, T[c.id > 0.7 ? 4 : lit > 0.55 && e < 3.2 ? 4 : c.id > 0.3 ? 3 : 2]);
    }
  });
}

/** neutral critter skin (tinted by vertex / instance colours): small clean plates with a lit edge */
export function critterSkin(A: Atlas): UVR {
  return A.paint('critterSkin', 16, 16, (p, w, h) => {
    const T = hueRamp('#d8d4cc', 5, { spread: 0.7 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells(x, y, 5, 29, 16), e = c.f2 - c.f1, l = Math.hypot(c.dx, c.dy) || 1;
      p.set(x, y, T[e < 0.8 ? ((c.dx / l) * -0.6 + (c.dy / l) * -0.8 > 0.1 ? 4 : 2) : 3]);
    }
  });
}

/** a flat colour swatch region (vertex colours do the work) */
export function swatch(A: Atlas, name: string, c: string): UVR {
  return A.paint(name, 4, 4, (p: Region) => p.fill(() => hex(c)));
}
