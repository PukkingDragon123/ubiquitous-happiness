// Low-poly modelling helpers for the PS2 blocky look: hard facets, few sides, chunky silhouettes.
//
//   facet(geo)                       -> non-indexed copy with flat (per-face) normals
//   jitter(geo, 0.08, seed)          -> displace vertices (shared corners move together, so no cracks)
//   chamferBox(w, h, d, 0.06)        -> box with bevelled edges (catches a highlight on every edge)
//   lpCyl(r, h, 6, rTop?)            -> 5-8 sided prism / frustum
//   lpRock(seed, r, detail?)         -> jittered, squashed icosahedron (detail 0 = chunky, 1 = boulder)
//   lpSphere(r, detail?)             -> faceted ball (icosahedron)
//   lpCone(r, h, sides)              -> faceted cone
// All return BufferGeometry ready for a uw()/retro() material (which flat-shades by default anyway; facet() also
// makes the facets survive smooth materials and gives clean per-face UVs for box-projected textures).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { hash2 } from '../core/math';

/** non-indexed copy with flat normals (every triangle owns its vertices) */
export function facet(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** displace vertices by a hashed offset keyed on their position (coincident vertices move together) */
export function jitter(geo: THREE.BufferGeometry, amt: number, seed = 1, axes: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const kx = Math.round(x * 997), ky = Math.round(y * 991), kz = Math.round(z * 983);
    const h = (k: number) => (hash2(kx + kz * 31 + k * 7, ky - kz * 17, seed * 131 + k) - 0.5) * 2 * amt;
    p.setXYZ(i, x + h(1) * axes[0], y + h(2) * axes[1], z + h(3) * axes[2]);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** box planar UVs per face (box projection) so pixel textures tile at `texel` metres per repeat */
export function boxUV(geo: THREE.BufferGeometry, scale = 0.5): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    // one projection per triangle (by its face normal) so facets never smear
    const nx = Math.abs(n.getX(i) + n.getX(i + 1) + n.getX(i + 2)), ny = Math.abs(n.getY(i) + n.getY(i + 1) + n.getY(i + 2)), nz = Math.abs(n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2));
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      const [u, v] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** box with chamfered (bevelled) edges: a convex hull of the 8 corners pulled in along each axis */
export function chamferBox(w: number, h: number, d: number, c = Math.min(w, h, d) * 0.12): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const x = (sx * w) / 2, y = (sy * h) / 2, z = (sz * d) / 2;
    pts.push(new THREE.Vector3(x - sx * c, y, z - sz * c), new THREE.Vector3(x, y - sy * c, z - sz * c), new THREE.Vector3(x - sx * c, y - sy * c, z));
  }
  const g = new ConvexGeometry(pts);
  return boxUV(g, 1 / Math.max(w, h, d));
}

/** a 5-8 sided prism / frustum, faceted */
export function lpCyl(r: number, h: number, sides = 6, rTop = r, heightSegs = 1): THREE.BufferGeometry {
  return facet(new THREE.CylinderGeometry(rTop, r, h, Math.max(3, Math.min(12, Math.round(sides))), heightSegs));
}

/** a faceted cone */
export function lpCone(r: number, h: number, sides = 6): THREE.BufferGeometry {
  return facet(new THREE.ConeGeometry(r, h, Math.max(3, sides), 1));
}

/** a faceted ball */
export function lpSphere(r: number, detail = 1): THREE.BufferGeometry {
  return facet(new THREE.IcosahedronGeometry(r, detail));
}

/** a chunky rock: jittered, squashed icosahedron (detail 0 = chunky, 1 = boulder), faceted with box UVs */
export function lpRock(seed = 1, r = 1, detail = 1, o: { squash?: number; jag?: number } = {}): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  jitter(g, r * (o.jag ?? (detail ? 0.16 : 0.22)), seed);
  const sq = o.squash ?? 0.72 + hash2(seed, 3, 9) * 0.2;
  g.scale(1 + hash2(seed, 1, 9) * 0.25, sq, 0.85 + hash2(seed, 2, 9) * 0.25);
  // flatten the base a little so it sits on the ground
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -r * sq * 0.55) p.setY(i, -r * sq * 0.55);
  return boxUV(facet(g), 0.5 / r);
}
