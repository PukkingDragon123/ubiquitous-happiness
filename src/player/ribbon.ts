// A verlet cloth strip in world space (bandana tails, capes): a chain anchored at a point on the model that
// streams away from the swim direction, sags, and flutters. Rendered as a thick low-poly strip whose vertices are
// written in the local space of whatever the mesh is parented to, so it works under a moving puppet root too.
import * as THREE from 'three';

export interface RibbonOpts {
  n?: number; seg?: number;
  /** width at the root and at the tip (metres) */
  w0?: number; w1?: number;
  /** 'plane': the strip's width lies in the swim plane (tails); 'axis': along a given world axis (capes) */
  mode?: 'plane' | 'axis';
  gravity?: number; drag?: number; flutter?: number;
  /** uv rectangle on the material's page (x, y, w, h from the top-left) */
  uv?: [number, number, number, number];
  thick?: number;
}

export class Ribbon {
  pts: THREE.Vector3[] = [];
  prev: THREE.Vector3[] = [];
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  axis = new THREE.Vector3(0, 0, 1);
  private o: Required<RibbonOpts>;
  private inited = false;
  private tmp = new THREE.Vector3();
  private inv = new THREE.Matrix4();

  constructor(mat: THREE.Material, o: RibbonOpts = {}) {
    this.o = { n: 8, seg: 0.055, w0: 0.05, w1: 0.03, mode: 'plane', gravity: 0.0007, drag: 0.86, flutter: 0.0016, uv: [0.76, 0.02, 0.22, 0.2], thick: 0.012, ...o };
    const N = this.o.n;
    for (let i = 0; i < N; i++) { this.pts.push(new THREE.Vector3()); this.prev.push(new THREE.Vector3()); }
    const geo = new THREE.BufferGeometry();
    const nv = N * 5;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const uv = new Float32Array(nv * 2);
    const [ux, uy, uw, uh] = this.o.uv;
    for (let i = 0; i < N; i++) for (let j = 0; j < 5; j++) { uv[(i * 5 + j) * 2] = ux + (i / (N - 1)) * uw; uv[(i * 5 + j) * 2 + 1] = 1 - (uy + (j / 4) * uh); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 1, c = a + 6, d = a + 5; idx.push(a, b, c, a, c, d); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
  }

  reset() { this.inited = false; }

  /** anchor: world point; vel: world velocity of the wearer; facing: +-1; wind: extra world drift per step */
  update(anchor: THREE.Vector3, vel: THREE.Vector2, facing: number, time: number, k = 0, back?: THREE.Vector3) {
    const o = this.o, P = this.pts, Q = this.prev, N = o.n;
    if (!this.inited) {
      for (let i = 0; i < N; i++) { P[i].copy(anchor); if (back) P[i].addScaledVector(back, i * o.seg); else P[i].x -= facing * i * o.seg; Q[i].copy(P[i]); }
      this.inited = true;
    }
    P[0].copy(anchor);
    for (let i = 1; i < N; i++) {
      const p = P[i], q = Q[i];
      const vx = (p.x - q.x) * o.drag, vy = (p.y - q.y) * o.drag, vz = (p.z - q.z) * o.drag;
      q.copy(p);
      // water drag: stream away from the swim direction, sag, flutter
      p.x += vx - vel.x * 0.0009 - facing * 0.0012 + (back ? back.x * 0.0012 : 0);
      p.y += vy - vel.y * 0.0009 - o.gravity + Math.sin(time * 9 + i * 0.9 + k * 2) * o.flutter * (i / 6);
      p.z += vz + (back ? back.z * 0.0012 : 0);
    }
    for (let it = 0; it < 3; it++) for (let i = 1; i < N; i++) {
      const a = P[i - 1], b = P[i];
      const d = this.tmp.copy(b).sub(a), l = d.length() || 1e-6;
      b.copy(a).addScaledVector(d, o.seg / l);
    }
    // write the strip in the mesh parent's local space
    const parent = this.mesh.parent;
    if (parent) this.inv.copy(parent.matrixWorld).invert(); else this.inv.identity();
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const p = P[i];
      dir.copy(P[Math.min(N - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
      const f = i / (N - 1);
      const wv = (o.w0 + (o.w1 - o.w0) * f);
      let sx: number, sy: number, sz: number;
      if (o.mode === 'plane') { sx = -dir.y * wv; sy = dir.x * wv; sz = 0; }
      else { sx = this.axis.x * wv; sy = this.axis.y * wv; sz = this.axis.z * wv; }
      const tw = o.mode === 'plane' ? Math.sin(i * 0.9 + time * 3 + k) * 0.6 : Math.sin(i * 0.7 + time * 2.5 + k) * 0.25 * f;
      const cz = Math.cos(tw), szn = Math.sin(tw);
      const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]];
      for (let j = 0; j < 5; j++) {
        const [a, b] = corners[j];
        const th = o.thick;
        if (o.mode === 'plane') v.set(p.x + sx * a * cz, p.y + sy * a * cz, p.z + wv * a * szn + th * b + 0.03 * k);
        else v.set(p.x + sx * a + dir.y * th * b * 0, p.y + sy * a + szn * wv * a * 0.3 + th * b, p.z + sz * a);
        v.applyMatrix4(this.inv);
        pos.setXYZ(i * 5 + j, v.x, v.y, v.z);
      }
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
