// Tiny PS1-style modelling kit shared by the blobfish gear, summons, gadgets and the megalodon: faceted
// low-poly primitives with box-projected or lofted UVs onto small painted pixel pages (nearest filtering),
// and a material maker that runs everything through the underwater patch (and agent A's retro patch, if it
// is there). Hard surfaces are flat shaded (facets catch the light like PS1 models); soft ones Gouraud.
import * as THREE from 'three';
import { Px, ramp, hex, type RGB } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import * as GFX from '../gfx/px';

export interface PsxMatOpts {
  flat?: boolean; rough?: number; metal?: number; emissive?: THREE.ColorRepresentation; emissiveK?: number; side?: THREE.Side;
  alphaTest?: number; sss?: [number, number, number]; sssK?: number; rim?: number; color?: THREE.ColorRepresentation; emissiveMap?: THREE.Texture | null;
  vertexColors?: boolean;
}

type RetroFn = (m: THREE.Material, o?: unknown) => THREE.Material;
let retroPatch: RetroFn | null | undefined;
/** agent A's retro material patch (src/gfx/retro.ts), when it exists; resolved lazily at runtime */
export function setRetroPatch(fn: RetroFn | null) { retroPatch = fn; }

export function psxMat(map: THREE.Texture | null, o: PsxMatOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map, flatShading: o.flat ?? true, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide,
    alphaTest: o.alphaTest ?? 0, color: o.color ?? '#ffffff', vertexColors: !!o.vertexColors,
  });
  if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveK ?? 1; if (o.emissiveMap) m.emissiveMap = o.emissiveMap; }
  uw(m, { sss: o.sss, sssK: o.sssK, rim: o.rim ?? 0.12 });
  if (retroPatch) retroPatch(m);
  return m;
}

/** a page painted by fn with Px, uploaded crisp */
export function page(w: number, h: number, fn: (p: Px) => void, o: { repeat?: boolean } = {}): THREE.Texture {
  const p = new Px(w, h);
  fn(p);
  return p.texture({ repeat: o.repeat });
}

/** flat-shaded geometry: unshare vertices so every facet has its own normal (true PS1 facets) */
export function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

/** box-project UVs from a direction (cheap planar mapping for props): uv = (p.dot(ax)*s + o) */
export function planarUV(g: THREE.BufferGeometry, ax: THREE.Vector3, ay: THREE.Vector3, s = 1, ox = 0.5, oy = 0.5) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); uv[i * 2] = v.dot(ax) * s + ox; uv[i * 2 + 1] = v.dot(ay) * s + oy; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** remap a geometry's 0..1 uvs into a sub-rectangle of a page (x, y from the top-left like the painter) */
export function uvTo(g: THREE.BufferGeometry, x: number, y: number, w: number, h: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, x + uv.getX(i) * w, 1 - y - h + uv.getY(i) * h);
  uv.needsUpdate = true;
  return g;
}

/** merge geometries (all must share attribute sets: position/normal/uv) */
export function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    P.set((g.attributes.position as THREE.BufferAttribute).array as Float32Array, o * 3);
    if (g.attributes.normal) N.set((g.attributes.normal as THREE.BufferAttribute).array as Float32Array, o * 3);
    if (g.attributes.uv) U.set((g.attributes.uv as THREE.BufferAttribute).array as Float32Array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere();
  return out;
}

/** a transformed copy of a geometry */
export function xf(g: THREE.BufferGeometry, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scl: [number, number, number] | number = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), typeof scl === 'number' ? new THREE.Vector3(scl, scl, scl) : new THREE.Vector3(...scl));
  return g.clone().applyMatrix4(m);
}

/** a mesh with shadows on */
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = shadow; me.receiveShadow = shadow;
  return me;
}

// ------------------------------------------------------------------ painting helpers for small pages
export const rampOf = (cs: string[], steps = 5, dither = 0.6) => ramp(cs, steps, dither);
/** fill a rect of a page with a dithered ramp driven by fn(x, y) -> 0..1 */
export function fillRect(p: Px, x0: number, y0: number, w: number, h: number, R: (t: number, x?: number, y?: number) => RGB, fn: (x: number, y: number) => number) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x0 + x, y0 + y, R(fn(x, y), x0 + x, y0 + y));
}
export { hex, GFX };
