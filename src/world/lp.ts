// Low-poly mesh soup: the PS1-style geometry kit every v2 environment model is built with. Triangles are stored
// unindexed so every face keeps its own flat normal (faceted shading), with per-vertex UV into a painted pixel
// atlas, a colour (tint x baked cavity occlusion), a sway channel (plant base position + flex amplitude in
// metres, read by the sway shader) and a glow weight (bioluminescence).
//
//   const s = new Soup();
//   s.color(0.8, 0.9, 1).lathe([[0.4, 0], [0.3, 1.2], [0, 1.4]], 6, reg);   // a 6-sided sponge
//   chunkSoup.append(s, matrix, { tint, sway: true });                         // place it in a merged chunk mesh
//   const geo = chunkSoup.geometry();
import * as THREE from 'three';

export type V3 = [number, number, number];
export type V2 = [number, number];
/** a UV rectangle inside an atlas, in 0..1 texture units, (u0, v0) bottom-left */
export interface UVR { u0: number; v0: number; u1: number; v1: number }
export const UV_ALL: UVR = { u0: 0, v0: 0, u1: 1, v1: 1 };

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

export const v3 = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a: V3) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]),
  norm: (a: V3): V3 => { const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export interface AppendOpts {
  /** multiply vertex colours */
  tint?: [number, number, number];
  /** write the sway base (the placed origin) and scale the flex channel */
  sway?: boolean; flexK?: number;
  /** extra glow added to every vertex */
  glow?: number;
  /** remap the source UVs into a sub-rect (for re-skinning a shared shape) */
  uv?: UVR;
}

export class Soup {
  P: number[] = []; UV: number[] = []; C: number[] = []; S: number[] = []; G: number[] = [];
  private c: [number, number, number] = [1, 1, 1];
  private fl = 0;
  private gl = 0;

  get count() { return this.P.length / 3; }
  color(r: number, g: number, b: number) { this.c = [r, g, b]; return this; }
  /** flex amplitude (m) for the following vertices: 0 = rooted */
  flex(f: number) { this.fl = f; return this; }
  glow(g: number) { this.gl = g; return this; }

  vert(p: V3, u: number, v: number, col?: [number, number, number] | number, flex?: number) {
    this.P.push(p[0], p[1], p[2]);
    this.UV.push(u, v);
    const c = col === undefined ? this.c : typeof col === 'number' ? [this.c[0] * col, this.c[1] * col, this.c[2] * col] : col;
    this.C.push(c[0], c[1], c[2]);
    this.S.push(0, 0, 0, flex ?? this.fl);
    this.G.push(this.gl);
  }
  tri(a: V3, b: V3, c: V3, ua: V2, ub: V2, uc: V2, ka = 1, kb = 1, kc = 1, fa?: number, fb?: number, fc?: number) {
    this.vert(a, ua[0], ua[1], ka, fa); this.vert(b, ub[0], ub[1], kb, fb); this.vert(c, uc[0], uc[1], kc, fc);
  }
  /** quad a-b-c-d (counter-clockwise seen from the front) with uv rect corners (a = u0v0, b = u1v0, c = u1v1, d = u0v1) */
  quad(a: V3, b: V3, c: V3, d: V3, r: UVR = UV_ALL, k: [number, number, number, number] = [1, 1, 1, 1], f?: [number, number, number, number]) {
    this.tri(a, b, c, [r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], k[0], k[1], k[2], f?.[0], f?.[1], f?.[2]);
    this.tri(a, c, d, [r.u0, r.v0], [r.u1, r.v1], [r.u0, r.v1], k[0], k[2], k[3], f?.[0], f?.[2], f?.[3]);
  }

  /**
   * Loft rings (each `n` points, not closed) into a tube, uv u around (wrapped once), v along rings.
   * cap: close the last ring to a point (tip) or the first ring (base).
   */
  loft(rings: V3[][], r: UVR = UV_ALL, o: { tip?: V3; base?: V3; flex?: (j: number) => number; shade?: (j: number) => number; uWrap?: number } = {}) {
    const n = rings[0].length, R = rings.length, uw = o.uWrap ?? 1;
    const U = (k: number) => r.u0 + (r.u1 - r.u0) * ((k / n) * uw % 1.0001);
    const V = (j: number) => r.v0 + (r.v1 - r.v0) * (j / Math.max(1, R - 1 + (o.tip ? 1 : 0)));
    for (let j = 0; j < R - 1; j++) {
      const fa = o.flex?.(j), fb = o.flex?.(j + 1), sa = o.shade?.(j) ?? 1, sb = o.shade?.(j + 1) ?? 1;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const u0 = U(k), u1 = k2 === 0 ? r.u0 + (r.u1 - r.u0) * Math.min(1, uw) : U(k2);
        const a = rings[j][k], b = rings[j][k2], c = rings[j + 1][k2], d = rings[j + 1][k];
        const alt = (j + k) & 1;
        // wound so a ring running counter-clockwise (seen from the tip) faces outward
        if (alt) {
          this.tri(a, c, b, [u0, V(j)], [u1, V(j + 1)], [u1, V(j)], sa, sb, sa, fa, fb, fa);
          this.tri(a, d, c, [u0, V(j)], [u0, V(j + 1)], [u1, V(j + 1)], sa, sb, sb, fa, fb, fb);
        } else {
          this.tri(a, d, b, [u0, V(j)], [u0, V(j + 1)], [u1, V(j)], sa, sb, sa, fa, fb, fa);
          this.tri(b, d, c, [u1, V(j)], [u0, V(j + 1)], [u1, V(j + 1)], sa, sb, sb, fa, fb, fb);
        }
      }
    }
    if (o.tip) {
      const j = R - 1, ft = o.flex?.(R) ?? o.flex?.(j), fa = o.flex?.(j), st = o.shade?.(R) ?? 1, sa = o.shade?.(j) ?? 1;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        this.tri(rings[j][k2], rings[j][k], o.tip, [U(k2) || r.u1, V(j)], [U(k), V(j)], [(U(k) + (U(k2) || r.u1)) / 2, r.v1], sa, sa, st, fa, fa, ft);
      }
    }
    if (o.base) {
      const fa = o.flex?.(0);
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        this.tri(rings[0][k], rings[0][k2], o.base, [U(k), r.v0], [U(k2), r.v0], [(U(k) + U(k2)) / 2, r.v0], 0.7, 0.7, 0.6, fa, fa, fa);
      }
    }
    return this;
  }

  /** a ring of n points around (cx, y, cz) in the xz plane, radius rx/rz, rotated by a0 */
  static ringXZ(cx: number, y: number, cz: number, rx: number, rz: number, n: number, a0 = 0, jit?: (k: number) => number): V3[] {
    const out: V3[] = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU, j = jit ? jit(k) : 1;
      out.push([cx + Math.cos(a) * rx * j, y, cz + Math.sin(a) * rz * j]);
    }
    return out;
  }

  /** lathe a profile [[radius, y], ...] bottom to top with n sides; closes the top if the last radius is 0 */
  lathe(profile: V2[], n: number, r: UVR = UV_ALL, o: { flexTop?: number; a0?: number; jit?: (j: number, k: number) => number; base?: boolean; sx?: number; sz?: number } = {}) {
    const top = profile[profile.length - 1];
    const closed = top[0] < 1e-4;
    const body = closed ? profile.slice(0, -1) : profile;
    const sx = o.sx ?? 1, sz = o.sz ?? 1;
    const y0 = profile[0][1], y1 = top[1];
    const rings = body.map(([rad, y], j) => Soup.ringXZ(0, y, 0, rad * sx, rad * sz, n, o.a0 ?? 0, o.jit ? (k) => o.jit!(j, k) : undefined));
    const fT = o.flexTop ?? 0;
    const flex = (j: number) => { const y = j >= body.length ? y1 : body[j][1]; const t = (y - y0) / ((y1 - y0) || 1); return fT * t * t; };
    return this.loft(rings, r, { tip: closed ? [0, y1, 0] : undefined, base: o.base ? [0, y0, 0] : undefined, flex });
  }

  /** a tapered tube along a path (n sides), radius per point; tip closes to a point */
  tube(path: V3[], rad: (t: number) => number, n: number, r: UVR = UV_ALL, o: { flex?: (t: number) => number; tip?: boolean; base?: boolean; shade?: (t: number) => number } = {}) {
    const rings: V3[][] = [];
    const L = path.length;
    let prevSide: V3 = [1, 0, 0];
    for (let j = 0; j < L; j++) {
      const a = path[Math.max(0, j - 1)], b = path[Math.min(L - 1, j + 1)];
      const t = v3.norm(v3.sub(b, a));
      let side = v3.cross(t, [0, 0, 1]);
      if (v3.len(side) < 0.2) side = v3.cross(t, [1, 0, 0]);
      side = v3.norm(side);
      if (v3.dot(side, prevSide) < 0) side = v3.mul(side, -1);
      prevSide = side;
      const up = v3.norm(v3.cross(side, t));
      const rr = rad(j / (L - 1));
      const ring: V3[] = [];
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * TAU;
        ring.push(v3.add(path[j], v3.add(v3.mul(side, Math.cos(ang) * rr), v3.mul(up, Math.sin(ang) * rr))));
      }
      rings.push(ring);
    }
    const last = path[L - 1], dir = v3.norm(v3.sub(last, path[L - 2]));
    const tipP = o.tip ? v3.add(last, v3.mul(dir, rad(1) * 1.5 + 0.001)) : undefined;
    return this.loft(rings, r, { tip: tipP, base: o.base ? path[0] : undefined, flex: o.flex ? (j) => o.flex!(Math.min(1, j / (L - 1))) : undefined, shade: o.shade ? (j) => o.shade!(Math.min(1, j / (L - 1))) : undefined });
  }

  /**
   * A ribbon (kelp blade, grass, streamer) along a path. width per t, `twist` turns the blade around the path,
   * the side vector starts along `side`. u across the width, v along the length.
   */
  ribbon(path: V3[], width: (t: number) => number, r: UVR, o: { side?: V3; twist?: number; flex?: (t: number) => number; shade?: (t: number) => number; ruffle?: number } = {}) {
    const L = path.length;
    let side = v3.norm(o.side ?? [1, 0, 0]);
    const lefts: V3[] = [], rights: V3[] = [];
    for (let j = 0; j < L; j++) {
      const t = j / (L - 1);
      const a = path[Math.max(0, j - 1)], b = path[Math.min(L - 1, j + 1)];
      const tan = v3.norm(v3.sub(b, a));
      // keep the side perpendicular to the tangent, then twist around it
      side = v3.norm(v3.sub(side, v3.mul(tan, v3.dot(side, tan))));
      const tw = (o.twist ?? 0) * t;
      const nrm = v3.cross(tan, side);
      const s2 = v3.add(v3.mul(side, Math.cos(tw)), v3.mul(nrm, Math.sin(tw)));
      const w = width(t) * 0.5;
      const ruf = o.ruffle ? v3.mul(nrm, Math.sin(j * 2.3) * o.ruffle * w) : [0, 0, 0] as V3;
      lefts.push(v3.add(v3.add(path[j], v3.mul(s2, -w)), ruf));
      rights.push(v3.sub(v3.add(path[j], v3.mul(s2, w)), ruf));
    }
    for (let j = 0; j < L - 1; j++) {
      const t0 = j / (L - 1), t1 = (j + 1) / (L - 1);
      const va = r.v0 + (r.v1 - r.v0) * t0, vb = r.v0 + (r.v1 - r.v0) * t1;
      const f0 = o.flex?.(t0) ?? this.fl, f1 = o.flex?.(t1) ?? this.fl;
      const s0 = o.shade?.(t0) ?? 1, s1 = o.shade?.(t1) ?? 1;
      this.tri(lefts[j], rights[j], rights[j + 1], [r.u0, va], [r.u1, va], [r.u1, vb], s0, s0, s1, f0, f0, f1);
      this.tri(lefts[j], rights[j + 1], lefts[j + 1], [r.u0, va], [r.u1, vb], [r.u0, vb], s0, s1, s1, f0, f1, f1);
    }
    return this;
  }

  /** an upright card (alpha sprite plant) of w x h facing +z, rotated by yaw, base at p */
  card(p: V3, w: number, h: number, yaw: number, r: UVR, flexTop = 0, lean = 0) {
    const cx = Math.cos(yaw) * w * 0.5, cz = -Math.sin(yaw) * w * 0.5;
    const top: V3 = [p[0] + lean, p[1] + h, p[2]];
    this.quad([p[0] - cx, p[1], p[2] - cz], [p[0] + cx, p[1], p[2] + cz], [top[0] + cx, top[1], top[2] + cz], [top[0] - cx, top[1], top[2] - cz], r, [0.75, 0.75, 1, 1], [0, 0, flexTop, flexTop]);
    return this;
  }
  /** two crossed cards */
  cross(p: V3, w: number, h: number, yaw: number, r: UVR, flexTop = 0) { this.card(p, w, h, yaw, r, flexTop); this.card(p, w, h, yaw + Math.PI / 2, r, flexTop); return this; }

  /** an axis-aligned box (min corner, size), uv per face from one rect */
  box(min: V3, size: V3, r: UVR = UV_ALL, shade = [0.85, 0.85, 1, 0.55, 0.95, 0.75]) {
    const [x, y, z] = min, [w, h, d] = size;
    const X = x + w, Y = y + h, Z = z + d;
    this.quad([X, y, Z], [X, y, z], [X, Y, z], [X, Y, Z], r, [shade[0], shade[0], shade[0], shade[0]]);
    this.quad([x, y, z], [x, y, Z], [x, Y, Z], [x, Y, z], r, [shade[1], shade[1], shade[1], shade[1]]);
    this.quad([x, Y, Z], [X, Y, Z], [X, Y, z], [x, Y, z], r, [shade[2], shade[2], shade[2], shade[2]]);
    this.quad([x, y, z], [X, y, z], [X, y, Z], [x, y, Z], r, [shade[3], shade[3], shade[3], shade[3]]);
    this.quad([x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z], r, [shade[4], shade[4], shade[4], shade[4]]);
    this.quad([X, y, z], [x, y, z], [x, Y, z], [X, Y, z], r, [shade[5], shade[5], shade[5], shade[5]]);
    return this;
  }

  /** apply a matrix to the vertices added since `from` */
  transformSince(from: number, m: THREE.Matrix4) {
    for (let i = from; i < this.count; i++) {
      _v.set(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]).applyMatrix4(m);
      this.P[i * 3] = _v.x; this.P[i * 3 + 1] = _v.y; this.P[i * 3 + 2] = _v.z;
    }
    return this;
  }

  /** append another soup transformed by m */
  append(s: Soup, m: THREE.Matrix4, o: AppendOpts = {}) {
    const n = s.count;
    const e = m.elements;
    const ox = e[12], oy = e[13], oz = e[14];
    // flex scales with the placed size (a 2x kelp sways twice as far)
    const sc = Math.cbrt(Math.abs(m.determinant())) || 1;
    const fk = (o.flexK ?? 1) * sc;
    const t = o.tint ?? [1, 1, 1];
    const uvr = o.uv;
    for (let i = 0; i < n; i++) {
      _v.set(s.P[i * 3], s.P[i * 3 + 1], s.P[i * 3 + 2]).applyMatrix4(m);
      this.P.push(_v.x, _v.y, _v.z);
      let u = s.UV[i * 2], v = s.UV[i * 2 + 1];
      if (uvr) { u = uvr.u0 + (uvr.u1 - uvr.u0) * u; v = uvr.v0 + (uvr.v1 - uvr.v0) * v; }
      this.UV.push(u, v);
      this.C.push(s.C[i * 3] * t[0], s.C[i * 3 + 1] * t[1], s.C[i * 3 + 2] * t[2]);
      if (o.sway) this.S.push(ox, oy, oz, s.S[i * 4 + 3] * fk);
      else this.S.push(s.S[i * 4], s.S[i * 4 + 1], s.S[i * 4 + 2], s.S[i * 4 + 3]);
      this.G.push(s.G[i] + (o.glow ?? 0));
    }
    return this;
  }

  /** recolour every vertex added since `from` with fn(position, faceNormal) -> multiplier */
  paintSince(from: number, fn: (p: V3, n: V3, c: [number, number, number]) => [number, number, number]) {
    for (let f = from; f + 2 < this.count; f += 3) {
      const a: V3 = [this.P[f * 3], this.P[f * 3 + 1], this.P[f * 3 + 2]];
      const b: V3 = [this.P[f * 3 + 3], this.P[f * 3 + 4], this.P[f * 3 + 5]];
      const c: V3 = [this.P[f * 3 + 6], this.P[f * 3 + 7], this.P[f * 3 + 8]];
      const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
      for (let k = 0; k < 3; k++) {
        const i = f + k;
        const col = fn([this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]], n, [this.C[i * 3], this.C[i * 3 + 1], this.C[i * 3 + 2]]);
        this.C[i * 3] = col[0]; this.C[i * 3 + 1] = col[1]; this.C[i * 3 + 2] = col[2];
      }
    }
  }

  /** non-indexed BufferGeometry with flat face normals */
  geometry(o: { sway?: boolean; glow?: boolean } = {}): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    // drop degenerate faces (zero-area triangles make NaN normals, and NaN pixels poison the bloom chain)
    const keep: number[] = [];
    const P = this.P;
    for (let f = 0; f + 2 < this.count; f += 3) {
      const ax = P[f * 3], ay = P[f * 3 + 1], az = P[f * 3 + 2];
      const ux = P[f * 3 + 3] - ax, uy = P[f * 3 + 4] - ay, uz = P[f * 3 + 5] - az;
      const vx = P[f * 3 + 6] - ax, vy = P[f * 3 + 7] - ay, vz = P[f * 3 + 8] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz > 1e-14 && Number.isFinite(nx + ny + nz)) keep.push(f);
    }
    const n = keep.length * 3;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const sw = new Float32Array(n * 4), gl = new Float32Array(n);
    let o3 = 0;
    for (const f of keep) {
      for (let k = 0; k < 3; k++) {
        const i = f + k, d = o3 + k;
        pos[d * 3] = P[i * 3]; pos[d * 3 + 1] = P[i * 3 + 1]; pos[d * 3 + 2] = P[i * 3 + 2];
        uv[d * 2] = this.UV[i * 2]; uv[d * 2 + 1] = this.UV[i * 2 + 1];
        col[d * 3] = this.C[i * 3]; col[d * 3 + 1] = this.C[i * 3 + 1]; col[d * 3 + 2] = this.C[i * 3 + 2];
        sw[d * 4] = this.S[i * 4]; sw[d * 4 + 1] = this.S[i * 4 + 1]; sw[d * 4 + 2] = this.S[i * 4 + 2]; sw[d * 4 + 3] = this.S[i * 4 + 3];
        gl[d] = this.G[i];
      }
      const ax = pos[o3 * 3], ay = pos[o3 * 3 + 1], az = pos[o3 * 3 + 2];
      const ux = pos[o3 * 3 + 3] - ax, uy = pos[o3 * 3 + 4] - ay, uz = pos[o3 * 3 + 5] - az;
      const vx = pos[o3 * 3 + 6] - ax, vy = pos[o3 * 3 + 7] - ay, vz = pos[o3 * 3 + 8] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { nor[(o3 + k) * 3] = nx; nor[(o3 + k) * 3 + 1] = ny; nor[(o3 + k) * 3 + 2] = nz; }
      o3 += 3;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (o.sway !== false) g.setAttribute('aSway', new THREE.BufferAttribute(sw, 4));
    if (o.glow !== false) g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ------------------------------------------------------------------ icospheres + sculpted shapes
const ICO: { p: Float32Array; i: Uint32Array }[] = [];
/** unit icosphere at a subdivision level (cached) */
export function icosphere(level: number) {
  if (ICO[level]) return ICO[level];
  const t = (1 + Math.sqrt(5)) / 2;
  const P: number[] = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let I = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let v = 0; v < P.length; v += 3) { const l = Math.hypot(P[v], P[v + 1], P[v + 2]); P[v] /= l; P[v + 1] /= l; P[v + 2] /= l; }
  for (let s = 0; s < level; s++) {
    const cache = new Map<number, number>(), NI: number[] = [];
    const mid = (a: number, b: number) => {
      const k = a < b ? a * 100000 + b : b * 100000 + a;
      let m = cache.get(k);
      if (m === undefined) {
        const x = P[a * 3] + P[b * 3], y = P[a * 3 + 1] + P[b * 3 + 1], z = P[a * 3 + 2] + P[b * 3 + 2], l = Math.hypot(x, y, z);
        m = P.length / 3; P.push(x / l, y / l, z / l); cache.set(k, m);
      }
      return m;
    };
    for (let f = 0; f < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      NI.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    I = NI;
  }
  return (ICO[level] = { p: Float32Array.from(P), i: Uint32Array.from(I) });
}

/** cavity occlusion (umbrella operator): vertices below their neighbours' average sit in a crevice */
export function cavity(p: ArrayLike<number>, idx: ArrayLike<number>, k: number): Float32Array {
  const n = p.length / 3, sum = new Float32Array(n * 3), cnt = new Float32Array(n), nor = new Float32Array(n * 3);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const pairs = [[a, b], [b, c], [c, a]];
    for (const [u, v] of pairs) {
      sum[u * 3] += p[v * 3]; sum[u * 3 + 1] += p[v * 3 + 1]; sum[u * 3 + 2] += p[v * 3 + 2]; cnt[u]++;
      sum[v * 3] += p[u * 3]; sum[v * 3 + 1] += p[u * 3 + 1]; sum[v * 3 + 2] += p[u * 3 + 2]; cnt[v]++;
    }
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz; }
  }
  const out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const c = Math.max(1, cnt[v]);
    const dx = sum[v * 3] / c - p[v * 3], dy = sum[v * 3 + 1] / c - p[v * 3 + 1], dz = sum[v * 3 + 2] / c - p[v * 3 + 2];
    const nl = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1;
    const conc = (dx * nor[v * 3] + dy * nor[v * 3 + 1] + dz * nor[v * 3 + 2]) / nl;
    out[v] = Math.max(0.4, Math.min(1.08, 1 - conc * k));
  }
  return out;
}

/** add an indexed mesh (positions + indices + per-vertex shade) to a soup, flat faces, uv from a planar projection */
export function addIndexed(s: Soup, p: ArrayLike<number>, idx: ArrayLike<number>, shade?: ArrayLike<number>, r: UVR = UV_ALL, uvScale = 0.5) {
  for (let f = 0; f < idx.length; f += 3) {
    const vs = [idx[f], idx[f + 1], idx[f + 2]];
    // pick the projection plane from the face normal (box mapping)
    const a: V3 = [p[vs[0] * 3], p[vs[0] * 3 + 1], p[vs[0] * 3 + 2]], b: V3 = [p[vs[1] * 3], p[vs[1] * 3 + 1], p[vs[1] * 3 + 2]], c: V3 = [p[vs[2] * 3], p[vs[2] * 3 + 1], p[vs[2] * 3 + 2]];
    const n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uv = (q: V3): V2 => {
      let u: number, v: number;
      if (ay >= ax && ay >= az) { u = q[0]; v = q[2]; } else if (ax >= az) { u = q[2]; v = q[1]; } else { u = q[0]; v = q[1]; }
      u = (u * uvScale) % 1; v = (v * uvScale) % 1; if (u < 0) u += 1; if (v < 0) v += 1;
      return [r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v];
    };
    s.tri(a, b, c, uv(a), uv(b), uv(c), shade ? shade[vs[0]] : 1, shade ? shade[vs[1]] : 1, shade ? shade[vs[2]] : 1);
  }
  return s;
}

export const mat4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
