// Instanced schools: many fish of one species in a single draw call. Each instance carries its own swim phase,
// amplitude, turn, flash and look via instanced attributes read by the swim shader (FISH_INST).
//
//   const s = new FishSchool('sardine', 24); scene.add(s.mesh);
//   s.set(i, x, y, z, yaw, pitch, scale, phase, amp, turn); ... s.commit();
import * as THREE from 'three';
import { speciesAsset } from './index';
import { swimMaterial } from './swim';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YZX'), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class FishSchool {
  mesh: THREE.InstancedMesh;
  count: number;
  length: number;
  private sw: THREE.InstancedBufferAttribute;
  private fx: THREE.InstancedBufferAttribute;
  constructor(species: string, count: number) {
    const a = speciesAsset(species);
    this.count = count; this.length = a.length;
    const geo = new THREE.BufferGeometry();
    for (const k in a.geo.attributes) geo.setAttribute(k, a.geo.attributes[k]);
    geo.setIndex(a.geo.index);
    this.sw = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.fx = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInstSwim', this.sw);
    geo.setAttribute('aInstFx', this.fx);
    const mat = new THREE.MeshPhysicalMaterial({
      map: a.map, normalMap: a.normalMap, roughnessMap: a.roughnessMap, roughness: 1, metalness: 0, vertexColors: true,
      alphaToCoverage: true, clearcoat: a.clearcoat ?? 0.5, clearcoatRoughness: a.clearcoatRough ?? 0.3,
    });
    mat.normalScale.set(a.normalScale, a.normalScale);
    swimMaterial(mat, a.uni, null, { ...a.flags, inst: true }, a.uwo);
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = a.depthMat;
  }
  /** place instance i (yaw 0 = nose +x, -PI = nose -x; pitch = nose up) */
  set(i: number, x: number, y: number, z: number, yaw: number, pitch: number, scale: number, phase: number, amp: number, turn = 0, flash = 0, lookYaw = 0) {
    _e.set(0, yaw, pitch, 'YZX'); _q.setFromEuler(_e);
    _p.set(x, y, z); _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    const k = i * 4;
    const s = this.sw.array as Float32Array, f = this.fx.array as Float32Array;
    s[k] = phase; s[k + 1] = amp; s[k + 2] = turn; s[k + 3] = 0;
    f[k] = flash; f[k + 1] = 0; f[k + 2] = lookYaw; f[k + 3] = 0;
  }
  hide(i: number) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }
  commit() { this.mesh.instanceMatrix.needsUpdate = true; this.sw.needsUpdate = true; this.fx.needsUpdate = true; }
  // the geometry shares the species buffers: only the material + instance buffers belong to the school
  dispose() { (this.mesh.material as THREE.Material).dispose(); this.mesh.dispose(); }
}
