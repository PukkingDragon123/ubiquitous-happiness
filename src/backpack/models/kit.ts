// Loot-model GEOMETRY + MATERIAL KIT (v4.1): chunky, deliberate low-poly parts with uvs that land on painted pages.
//
//   const b = new B();
//   b.add(cbox(0.8, 0.3, 0.4, 0.05, { pz: T.r(0, 0, 32, 12) }), mat('box', T), [0, 0.1, 0]);
//
// Geometry helpers return BufferGeometry with uvs (0..1, or remapped into a page rect). B.add() flat-shades every part
// (true PS2 facets) unless a crease angle asks for smoothing (pearls, ducks, cloth), and the template step in
// ../models.ts merges parts by material so a 30-part model is a handful of draw calls.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pixelShade } from '../../ui/obj/pixtex';
import { hash2, TAU } from '../../core/math';
import { FULL, type Tx, type UR } from './paint';

export type V2 = [number, number];
export type V3 = [number, number, number];
export { TAU };

// ------------------------------------------------------------------ materials
export interface MatO { rough?: number; metal?: number; emissive?: string; ek?: number; side?: THREE.Side; opacity?: number; color?: string; noEmap?: boolean; depthWrite?: boolean }
const mats = new Map<string, THREE.MeshStandardMaterial>();
/** a cached pixel-shaded material over a painted page (flat facets come from the geometry, not the material) */
export function mat(key: string, t: Tx | null, o: MatO = {}): THREE.MeshStandardMaterial {
  let m = mats.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    map: t?.tex ?? null, color: o.color ?? '#ffffff', roughness: o.rough ?? 0.8, metalness: o.metal ?? 0,
    side: o.side ?? THREE.FrontSide, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
  });
  if (o.depthWrite !== undefined) m.depthWrite = o.depthWrite;
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ek ?? 0.6; if (t && !o.noEmap) m.emissiveMap = t.tex; }
  pixelShade(m);
  m.userData.shared = true;
  mats.set(key, m);
  return m;
}

// ------------------------------------------------------------------ uv helpers
type Dir = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
export type BoxRects = Partial<Record<Dir | 'side', UR>>;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** remap a geometry's 0..1 uvs into a page rect (in place) */
export function mapUV(g: THREE.BufferGeometry, r: UR = FULL): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(r[0], r[2], uv.getX(i)), lerp(r[1], r[3], uv.getY(i)));
  uv.needsUpdate = true;
  return g;
}

/**
 * box projection fitted to the part's bounds: every triangle takes the page of the axis it faces most, so a box face
 * (or a hull facet) shows the whole page (or its rect) the right way up. Rects per direction: px nx py ny pz nz,
 * `side` = all four sides, a bare rect = every face.
 */
export function boxUV(geo: THREE.BufferGeometry, rects: BoxRects | UR = FULL): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeBoundingBox();
  const bb = g.boundingBox!, mn = bb.min, sz = bb.getSize(new THREE.Vector3());
  const P = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(P.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const R = (d: Dir): UR => {
    if (Array.isArray(rects)) return rects as unknown as UR;
    const r = rects as BoxRects;
    return r[d] ?? (d !== 'pz' ? r.side : undefined) ?? r.pz ?? FULL;
  };
  const nx = (v: number, i: 0 | 1 | 2) => { const s = i === 0 ? sz.x : i === 1 ? sz.y : sz.z, m0 = i === 0 ? mn.x : i === 1 ? mn.y : mn.z; return s > 1e-6 ? (v - m0) / s : 0.5; };
  for (let t = 0; t < P.count; t += 3) {
    a.fromBufferAttribute(P, t); b.fromBufferAttribute(P, t + 1); c.fromBufferAttribute(P, t + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const d: Dir = az >= ax && az >= ay ? (n.z >= 0 ? 'pz' : 'nz') : ax >= ay ? (n.x >= 0 ? 'px' : 'nx') : (n.y >= 0 ? 'py' : 'ny');
    const r = R(d);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u = 0, w = 0;
      switch (d) {
        case 'pz': u = nx(v.x, 0); w = nx(v.y, 1); break;
        case 'nz': u = 1 - nx(v.x, 0); w = nx(v.y, 1); break;
        case 'px': u = 1 - nx(v.z, 2); w = nx(v.y, 1); break;
        case 'nx': u = nx(v.z, 2); w = nx(v.y, 1); break;
        case 'py': u = nx(v.x, 0); w = 1 - nx(v.z, 2); break;
        case 'ny': u = nx(v.x, 0); w = nx(v.z, 2); break;
      }
      uv[(t + k) * 2] = lerp(r[0], r[2], u); uv[(t + k) * 2 + 1] = lerp(r[1], r[3], w);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** planar uvs from the front (x right, y up) fitted to the bounds, into a rect */
export function frontUV(geo: THREE.BufferGeometry, r: UR = FULL): THREE.BufferGeometry {
  const g = geo;
  g.computeBoundingBox();
  const bb = g.boundingBox!, sz = bb.getSize(new THREE.Vector3());
  const P = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[i * 2] = lerp(r[0], r[2], (P.getX(i) - bb.min.x) / Math.max(1e-6, sz.x)); uv[i * 2 + 1] = lerp(r[1], r[3], (P.getY(i) - bb.min.y) / Math.max(1e-6, sz.y)); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------------ geometry
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
/** convex hull of points, box-projected uvs: clean faceted chunks (rocks, gems, teeth, nuggets, wedges) */
export function hull(pts: V3[], rects: BoxRects | UR = FULL): THREE.BufferGeometry {
  return boxUV(new ConvexGeometry(pts.map(v3)), rects);
}
/** a chamfered box (every edge catches a highlight), box-projected uvs */
export function cbox(w: number, h: number, d: number, c = Math.min(w, h, d) * 0.18, rects: BoxRects | UR = FULL): THREE.BufferGeometry {
  const X = w / 2, Y = h / 2, Z = d / 2;
  c = Math.min(c, X * 0.95, Y * 0.95, Z * 0.95);
  const pts: V3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push([sx * X, sy * (Y - c), sz * (Z - c)], [sx * (X - c), sy * Y, sz * (Z - c)], [sx * (X - c), sy * (Y - c), sz * Z]);
  }
  return hull(pts, rects);
}
/** a plain box with per-face page rects */
export function box(w: number, h: number, d: number, rects: BoxRects | UR = FULL): THREE.BufferGeometry {
  return boxUV(new THREE.BoxGeometry(w, h, d), rects);
}
/** a faceted rock: a hull of jittered points on a squashed sphere (no blobby lumps) */
export function rock(seed: number, r: number, s: V3 = [1, 1, 1], n = 16, jag = 0.22, rects: BoxRects | UR = FULL): THREE.BufferGeometry {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - y * y), a = i * 2.39996 + seed;
    const k = r * (1 - jag + hash2(i, 7, seed) * jag * 2);
    pts.push([Math.cos(a) * rr * k * s[0], y * k * s[1], Math.sin(a) * rr * k * s[2]]);
  }
  return hull(pts, rects);
}
/** a crystal: an n-sided prism (radius r at the base, rTop under the tip) with a pointed termination */
export function prism(r: number, h: number, n = 6, tip = 0.3, o: { rTop?: number; base?: number; twist?: number; skew?: number; rects?: BoxRects | UR } = {}): THREE.BufferGeometry {
  const pts: V3[] = [];
  const rt = o.rTop ?? r, yb = o.base ?? 0, tw = o.twist ?? 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + tw;
    pts.push([Math.cos(a) * r, yb, Math.sin(a) * r], [Math.cos(a) * rt, h * (1 - tip), Math.sin(a) * rt]);
  }
  pts.push([o.skew ?? 0, h, 0]);
  return hull(pts, o.rects ?? FULL);
}
/** a double-terminated crystal (both ends pointed) centred on the origin */
export function bipyr(r: number, h: number, n = 6, tip = 0.3, rects: BoxRects | UR = FULL): THREE.BufferGeometry {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; for (const y of [-h / 2 + h * tip, h / 2 - h * tip]) pts.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
  pts.push([0, h / 2, 0], [0, -h / 2, 0]);
  return hull(pts, rects);
}

/**
 * a lathe with real uvs: u around, v by arc length along the profile into `side`; flat rings (caps) take planar uvs
 * into `cap` when given. Non-indexed (ready to facet).
 */
export function lathe(prof: V2[], n = 8, o: { side?: UR; cap?: UR; capB?: UR; phase?: number; arc?: number } = {}): THREE.BufferGeometry {
  const side = o.side ?? FULL, cap = o.cap, ph = o.phase ?? 0, arc = o.arc ?? TAU;
  const isCap = (j: number) => !!cap && Math.abs(prof[j + 1][1] - prof[j][1]) < 1e-6;
  // v runs by arc length over the side segments only (caps are planar), so the whole side page is used
  const L: number[] = [0];
  for (let j = 1; j < prof.length; j++) L.push(L[j - 1] + (isCap(j - 1) ? 0 : Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1])));
  const tot = L[L.length - 1] || 1;
  const rMax = Math.max(...prof.map((p) => p[0])) || 1;
  const yMid = (Math.min(...prof.map((p) => p[1])) + Math.max(...prof.map((p) => p[1]))) / 2;
  const P: number[] = [], U: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = ph + (i / n) * arc, a1 = ph + ((i + 1) / n) * arc;
    for (let j = 0; j < prof.length - 1; j++) {
      const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
      const flat = isCap(j), top = y0 > yMid, cr = flat ? (!top && o.capB ? o.capB : cap!) : cap;
      const pt = (r: number, y: number, a: number): V3 => [Math.sin(a) * r, y, Math.cos(a) * r];
      const q = [pt(r0, y0, a0), pt(r0, y0, a1), pt(r1, y1, a1), pt(r1, y1, a0)];
      const uvq = flat
        ? q.map((p) => [lerp(cr![0], cr![2], p[0] / rMax / 2 + 0.5), lerp(cr![1], cr![3], (top ? -p[2] : p[2]) / rMax / 2 + 0.5)])
        : [[i / n, L[j] / tot], [(i + 1) / n, L[j] / tot], [(i + 1) / n, L[j + 1] / tot], [i / n, L[j + 1] / tot]].map(([u, v]) => [lerp(side[0], side[2], u), lerp(side[1], side[3], v)]);
      // two triangles (skip the degenerate one at a pole), wound to face outward for a bottom-to-top profile
      const tri = (A: number, Bi: number, C: number) => {
        const a = q[A], b = q[Bi], c = q[C];
        if ((a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) || (b[0] === c[0] && b[1] === c[1] && b[2] === c[2]) || (a[0] === c[0] && a[1] === c[1] && a[2] === c[2])) return;
        P.push(...a, ...b, ...c); U.push(...uvq[A], ...uvq[Bi], ...uvq[C]);
      };
      tri(0, 1, 2); tri(0, 2, 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}
/** a cylinder / frustum with optional chamfered rims; sides into `side`, caps planar into `cap` */
export function cyl(r: number, h: number, n = 8, o: { rTop?: number; ch?: number; side?: UR; cap?: UR; capB?: UR; phase?: number; open?: boolean } = {}): THREE.BufferGeometry {
  const rt = o.rTop ?? r, c = o.ch ?? 0, y0 = -h / 2, y1 = h / 2;
  const prof: V2[] = [];
  if (!o.open) prof.push([0, y0]);
  if (c > 0) prof.push([r - c, y0], [r, y0 + c], [rt, y1 - c], [rt - c, y1]); else prof.push([r, y0], [rt, y1]);
  if (!o.open) prof.push([0, y1]);
  return lathe(prof, n, { side: o.side, cap: o.cap ?? o.side, capB: o.capB, phase: o.phase ?? Math.PI / n });
}
/** a cone (pointing up +y), base at -h/2 */
export function cone(r: number, h: number, n = 6, o: { side?: UR; cap?: UR } = {}) {
  return lathe([[0, -h / 2], [r, -h / 2], [0, h / 2]], n, { side: o.side, cap: o.cap ?? o.side, phase: Math.PI / n });
}

/**
 * a swept tube along a smooth path with a radius profile (taper, bulges): u along the path, v around, into `uv`.
 * Capped ends. `sx` squashes the section (flat straps, blades).
 */
export function tube(pts: V3[], r: number | ((t: number) => number), o: { radial?: number; segs?: number; uv?: UR; closed?: boolean; sx?: number; caps?: boolean; tension?: number } = {}): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(v3), !!o.closed, 'catmullrom', o.tension ?? 0.5);
  const S = o.segs ?? Math.max(4, pts.length * 2), Rn = o.radial ?? 5, uvr = o.uv ?? FULL, sx = o.sx ?? 1;
  const fr = curve.computeFrenetFrames(S, !!o.closed);
  const rf = typeof r === 'number' ? () => r : r;
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S, c = curve.getPointAt(t), N = fr.normals[i], Bn = fr.binormals[i], rr = rf(t);
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j <= Rn; j++) { const a = (j / Rn) * TAU; ring.push(c.clone().addScaledVector(N, Math.cos(a) * rr * sx).addScaledVector(Bn, Math.sin(a) * rr)); }
    rings.push(ring);
  }
  const P: number[] = [], U: number[] = [];
  const uvp = (i: number, j: number) => [lerp(uvr[0], uvr[2], i / S), lerp(uvr[1], uvr[3], j / Rn)];
  for (let i = 0; i < S; i++) for (let j = 0; j < Rn; j++) {
    const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1];
    P.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    U.push(...uvp(i, j), ...uvp(i, j + 1), ...uvp(i + 1, j), ...uvp(i + 1, j), ...uvp(i, j + 1), ...uvp(i + 1, j + 1));
  }
  if (o.caps !== false && !o.closed) for (const [i, flip] of [[0, true], [S, false]] as [number, boolean][]) {
    const c = curve.getPointAt(i / S);
    if (rf(i / S) < 1e-4) continue;
    for (let j = 0; j < Rn; j++) {
      const a = rings[i][j], b = rings[i][j + 1];
      if (flip) P.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z); else P.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
      const u = lerp(uvr[0], uvr[2], i / S), v = lerp(uvr[1], uvr[3], 0.5);
      U.push(u, v, u, v, u, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}

/** an extruded outline (x right, y up) with chamfered edges, centred on z; holes cut through; box-projected uvs */
export function ext(outline: V2[], depth: number, bev = 0.02, o: { holes?: V2[][]; rects?: BoxRects | UR } = {}): THREE.BufferGeometry {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of o.holes ?? []) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, depth - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -(depth - bev * 2) / 2);
  return boxUV(g, o.rects ?? FULL);
}
/** points on an arc (for outlines) */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
/** an ellipse outline */
export const oval = (cx: number, cy: number, rx: number, ry: number, n = 10): V2[] => arc(cx, cy, rx, ry, 0, TAU * (1 - 1 / n), n - 1);

/** a low-poly sphere (native uvs into a rect) */
export function ball(r: number, ws = 8, hs = 6, uv: UR = FULL): THREE.BufferGeometry { return mapUV(new THREE.SphereGeometry(r, ws, hs), uv); }
/** an icosphere-ish faceted ball */
export function ico(r: number, det = 1, rects: BoxRects | UR = FULL): THREE.BufferGeometry { return boxUV(new THREE.IcosahedronGeometry(r, det), rects); }
/** a torus (native uvs: u around the ring, v around the tube) */
export function torus(R: number, r: number, rs = 5, ts = 10, arcA = TAU, uv: UR = FULL): THREE.BufferGeometry { return mapUV(new THREE.TorusGeometry(R, r, rs, ts, arcA), uv); }

/**
 * a parametric surface: f(u, v) for u, v in 0..1 on an nu x nv grid (shells, leaves, cloth, hats). uv = (u, v) into
 * `uv`. `back` flips the winding (the inside / underside of a sheet).
 */
export function surf(nu: number, nv: number, f: (u: number, v: number) => V3, o: { uv?: UR; back?: boolean } = {}): THREE.BufferGeometry {
  const r = o.uv ?? FULL, P: number[] = [], U: number[] = [];
  const pt = (i: number, j: number) => f(i / nu, j / nv);
  const uv = (i: number, j: number) => [lerp(r[0], r[2], i / nu), lerp(r[1], r[3], j / nv)];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as const;
    const tris = o.back ? [[0, 2, 1], [0, 3, 2]] : [[0, 1, 2], [0, 2, 3]];
    for (const t of tris) for (const k of t) { P.push(...pt(q[k][0], q[k][1])); U.push(...uv(q[k][0], q[k][1])); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}

/** scale every vertex by a function of its position (bulges, tapers, dents) */
export function warp(g: THREE.BufferGeometry, f: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const P = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); f(v); P.setXYZ(i, v.x, v.y, v.z); }
  P.needsUpdate = true;
  return g;
}

// ------------------------------------------------------------------ the builder
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function xform(g: THREE.BufferGeometry, pos: V3, rot: V3, scl: V3 | number) {
  tmpM.compose(tmpP.set(...pos), tmpQ.setFromEuler(tmpE.set(...rot)), typeof scl === 'number' ? tmpS.set(scl, scl, scl) : tmpS.set(...scl));
  const c = g.clone(); c.applyMatrix4(tmpM);
  return c;
}
export interface AddO { smooth?: number; shadow?: boolean }
/** a part builder: add(geometry, material, position, rotation (xyz), scale). sub() nests a transformed group. */
export class B {
  g = new THREE.Group();
  add(geo: THREE.BufferGeometry, m: THREE.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 | number = 1, o: AddO = {}): THREE.Mesh {
    let g = xform(geo.index ? geo.toNonIndexed() : geo, pos, rot, scl);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (o.smooth) g = toCreasedNormals(g, o.smooth); else { g.deleteAttribute('normal'); g.computeVertexNormals(); }
    const me = new THREE.Mesh(g, m);
    me.castShadow = o.shadow !== false; me.receiveShadow = true;
    this.g.add(me);
    return me;
  }
  /** a nested builder at a transform (compound parts: a scissor half, a crossbow arm) */
  sub(pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 | number = 1): B {
    const b = new B();
    b.g.position.set(...pos); b.g.rotation.set(...rot);
    if (typeof scl === 'number') b.g.scale.setScalar(scl); else b.g.scale.set(...scl);
    this.g.add(b.g);
    return b;
  }
  /** mirror a builder across x (the same parts, flipped): for symmetric pairs */
  mirror(fn: (b: B, s: 1 | -1) => void) { fn(this, 1); fn(this, -1); }
}

/** the Euler rotation that sends local x, y, z to the given world directions (orthonormal) */
export function basis(x: V3, y: V3, z: V3): V3 {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
  const e = new THREE.Euler().setFromRotationMatrix(m);
  return [e.x, e.y, e.z];
}
