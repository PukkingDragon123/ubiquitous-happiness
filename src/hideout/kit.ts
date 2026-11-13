// Prop kit: builds low-poly furniture from boxes, cylinders, spheres and lathes with world-scaled UVs (a
// constant texel density, so a 1 m texture covers 1 m on every part), then merges everything per material into
// one mesh each. Origin = centre of the footprint on the floor; +z is the front.
//
//   const k = new Kit();
//   k.box(MAT.wood('oak'), 1.2, 0.08, 0.6, 0, 0.7, 0);           // a table top
//   k.cyl(MAT.metal('grey'), 0.03, 0.03, 0.7, 0.5, 0.35, 0.25);   // a leg
//   const g = k.build();
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from '../core/math';

export interface PartOpts { rx?: number; ry?: number; rz?: number; d?: number; uv?: 'box' | 'keep'; shadow?: boolean; jitter?: number }

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
let seq = 0;

/** box-project uvs from positions by the dominant normal axis (texel density d tiles per metre) */
export function boxUv(g: THREE.BufferGeometry, d = 1, off = 0) {
  const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    let u: number, v: number;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z * Math.sign(N.getX(i) || 1); v = y; }
    else { u = -x * Math.sign(N.getZ(i) || 1) * -1; v = y; }
    uv[i * 2] = u * d + off; uv[i * 2 + 1] = v * d + off * 0.7;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private noShadow = new Set<THREE.Material>();
  extras: THREE.Object3D[] = [];

  /** add any geometry (in local space) transformed to (x, y, z) with euler rotation */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    tmpE.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(1, 1, 1));
    g.applyMatrix4(tmpM);
    if ((o.uv ?? 'box') === 'box') boxUv(g, o.d ?? 1, o.jitter ?? hash2(seq++, 7, 3) * 3);
    else if (!g.attributes.uv) boxUv(g, o.d ?? 1);
    g.groups = [];
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
    if (o.shadow === false) this.noShadow.add(mat);
    return g;
  }
  box(mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    return this.add(mat, new THREE.BoxGeometry(sx, sy, sz), x, y, z, o);
  }
  /** a box resting on y (bottom at y) */
  slab(mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, o: PartOpts = {}) { return this.box(mat, sx, sy, sz, x, y + sy / 2, z, o); }
  cyl(mat: THREE.Material, rTop: number, rBot: number, h: number, x = 0, y = 0, z = 0, o: PartOpts & { seg?: number; open?: boolean } = {}) {
    return this.add(mat, new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 8, 1, o.open ?? false), x, y, z, o);
  }
  sphere(mat: THREE.Material, r: number, x = 0, y = 0, z = 0, o: PartOpts & { w?: number; h?: number; sx?: number; sy?: number; sz?: number } = {}) {
    const g = new THREE.SphereGeometry(r, o.w ?? 8, o.h ?? 6);
    g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    return this.add(mat, g, x, y, z, o);
  }
  /** a lathe profile [[r, y], ...] around y */
  lathe(mat: THREE.Material, prof: [number, number][], x = 0, y = 0, z = 0, o: PartOpts & { seg?: number } = {}) {
    const g = new THREE.LatheGeometry(prof.map(([r, yy]) => new THREE.Vector2(r, yy)), o.seg ?? 10);
    return this.add(mat, g, x, y, z, o);
  }
  /** a cushion: a box with its top pushed into a pillow dome (low poly) */
  cushion(mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, o: PartOpts & { puff?: number } = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz, 3, 1, 3);
    const P = g.attributes.position as THREE.BufferAttribute;
    const puff = o.puff ?? 0.35;
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i) / (sx / 2), pz = P.getZ(i) / (sz / 2), py = P.getY(i);
      const k = (1 - px * px * 0.8) * (1 - pz * pz * 0.8);
      if (py > 0) P.setY(i, py + sy * puff * k);
      // pinch the edges in a touch
      P.setX(i, P.getX(i) * (1 - 0.06 * Math.abs(pz)));
      P.setZ(i, P.getZ(i) * (1 - 0.06 * Math.abs(px)));
    }
    g.computeVertexNormals();
    return this.add(mat, g, x, y, z, o);
  }
  /** a flat quad facing +z (posters, screens), centred */
  quad(mat: THREE.Material, w: number, h: number, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    return this.add(mat, new THREE.PlaneGeometry(w, h), x, y, z, { uv: 'keep', ...o });
  }

  build(cast = true): THREE.Group {
    const g = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast && !this.noShadow.has(mat);
      m.receiveShadow = true;
      g.add(m);
    }
    for (const e of this.extras) g.add(e);
    return g;
  }
}
