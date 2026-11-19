// Small-stage portraits of a species (the HUD's codex medallion, the codex book's photo): the HUD sizes a model to
// fit by its longest axis, so a 2 m moray became a 1 px sliver on a 27 px medallion. Long-bodied species are
// cropped to head-and-shoulders (jaws open, so the teeth read) and jellies to the bell and the top of the arms;
// compact ones come back whole. The crop is an index filter on the shared buffers plus a matching bounding box,
// so Box3.setFromObject() frames only what is drawn.
import * as THREE from 'three';
import { buildFish } from './index';

/** keep triangles whose centroid lies inside this model-space box (nose +x, centred) */
interface Crop { x0?: number; x1?: number; y0?: number; y1?: number; jaw?: number }
const CROP: Record<string, (L: number) => Crop> = {
  moray: (L) => ({ x0: L / 2 - 0.44, jaw: 0.75 }),
  barracuda: (L) => ({ x0: L / 2 - 0.62, jaw: 0.5 }),
  pike: (L) => ({ x0: L / 2 - 0.55, jaw: 0.4 }),
  jellyfish: () => ({ y0: -0.5 }),
  // the walking legs splay wider than the crab is tall: frame the shell and the raised claws
  crab: () => ({ x0: -0.3, x1: 0.3 }),
};

export function fishPortrait(species: string, seed = 3): THREE.Object3D {
  const m = buildFish(species, seed);
  // the UI stages are lit by bright studio lights and never tone-mapped: drop the underwater fresnel rim, the
  // light-through-flesh wrap and most of the wet clearcoat, or a pale creature washes out to a white blur
  for (const mt of [m.material, ...m.extraMats]) {
    const u = (mt.userData as { uw?: { uRim: { value: number }; uSssK: { value: number }; uMatRimG: { value: number } } }).uw;
    if (u) { u.uRim.value = 0; u.uSssK.value = 0; u.uMatRimG.value = 0; }
    const ph = mt as THREE.MeshPhysicalMaterial;
    if (ph.isMeshPhysicalMaterial) ph.clearcoat = Math.min(ph.clearcoat, 0.12);
  }
  // crabs strike the threat pose (claws up): a taller, readable silhouette than the flat walking stance
  if (species === 'crab' || species === 'hermit') { m.anim.raise = 1; m.anim.pinch = 0; m.update(1 / 60, 0, 0); }
  const c = CROP[species]?.(m.length);
  if (!c) return m.group;
  if (c.jaw) m.inst.uSwim.value.w = c.jaw;
  const x0 = c.x0 ?? -1e9, x1 = c.x1 ?? 1e9, y0 = c.y0 ?? -1e9, y1 = c.y1 ?? 1e9;
  m.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(m.group.matrixWorld).invert();
  const meshes: THREE.Mesh[] = [];
  m.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
  for (const me of meshes) {
    const g = me.geometry, pos = g.getAttribute('position') as THREE.BufferAttribute, idx = g.getIndex();
    if (!pos || !idx) continue;
    const toGroup = new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld);
    const keep: number[] = [];
    const box = new THREE.Box3();
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), d = idx.getX(t + 2);
      p.fromBufferAttribute(pos, a).applyMatrix4(toGroup); q.fromBufferAttribute(pos, b).applyMatrix4(toGroup); r.fromBufferAttribute(pos, d).applyMatrix4(toGroup);
      const cx = (p.x + q.x + r.x) / 3, cy = (p.y + q.y + r.y) / 3;
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      keep.push(a, b, d);
      box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, a)).expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, b)).expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, d));
    }
    if (!keep.length) { me.removeFromParent(); continue; }
    const ng = new THREE.BufferGeometry();
    for (const k in g.attributes) ng.setAttribute(k, g.attributes[k]);
    ng.setIndex(keep);
    ng.boundingBox = box;
    ng.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    me.geometry = ng;
  }
  m.group.userData.portrait = species;
  return m.group;
}
