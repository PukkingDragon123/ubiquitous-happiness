// Voxel models: a sparse voxel grid with per-voxel colours, greedy-meshed into quads with baked per-face
// shading and per-vertex ambient occlusion (the classic 0fps AO), for coral, crystals, shells, debris, items.
//
//   const v = new Voxels(16, 24, 16);
//   v.set(x, y, z, 0xff6a88);
//   const geo = v.mesh(0.06);      // BufferGeometry with position, normal, color (centred on x/z, base at y=0)
import * as THREE from 'three';

const FACE_SHADE = [0.82, 0.82, 1.0, 0.6, 0.92, 0.88]; // +x -x +y -y +z -z

export class Voxels {
  w: number; h: number; d: number;
  c: Int32Array; // -1 empty, else 0xRRGGBB
  emissive: Uint8Array;
  constructor(w: number, h: number, d: number) {
    this.w = w; this.h = h; this.d = d;
    this.c = new Int32Array(w * h * d).fill(-1);
    this.emissive = new Uint8Array(w * h * d);
  }
  i(x: number, y: number, z: number) { return (y * this.d + z) * this.w + x; }
  in(x: number, y: number, z: number) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  set(x: number, y: number, z: number, col: number, glow = 0) { x |= 0; y |= 0; z |= 0; if (!this.in(x, y, z)) return; this.c[this.i(x, y, z)] = col; this.emissive[this.i(x, y, z)] = glow; }
  get(x: number, y: number, z: number) { return this.in(x, y, z) ? this.c[this.i(x, y, z)] : -1; }
  solid(x: number, y: number, z: number) { return this.get(x, y, z) >= 0; }
  sphere(cx: number, cy: number, cz: number, r: number, col: (x: number, y: number, z: number) => number | -1) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 > r * r) continue;
      const k = col(x, y, z); if (k >= 0) this.set(x, y, z, k);
    }
  }
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, col: number | ((t: number) => number)) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 2) + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = typeof col === 'function' ? col(t) : col;
      this.sphere(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, r, () => c);
    }
  }

  /** greedy mesh; s = voxel size in metres. Geometry is centred on x/z with its base at y = 0. */
  mesh(s: number): THREE.BufferGeometry {
    const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [], emi: number[] = [];
    const dims = [this.w, this.h, this.d];
    const ox = -this.w / 2, oz = -this.d / 2;
    const tmp = new THREE.Color();
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const x = [0, 0, 0], q = [0, 0, 0];
      q[axis] = 1;
      const mask = new Int32Array(dims[u] * dims[v]);
      const aoMask = new Int32Array(dims[u] * dims[v]);
      for (const dir of [1, -1]) {
        for (x[axis] = 0; x[axis] < dims[axis]; x[axis]++) {
          let n = 0;
          for (x[v] = 0; x[v] < dims[v]; x[v]++) for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
            const a = this.get(x[0], x[1], x[2]);
            const b = this.get(x[0] + q[0] * dir, x[1] + q[1] * dir, x[2] + q[2] * dir);
            if (a >= 0 && b < 0) {
              mask[n] = a + 1;
              // ambient occlusion: count solid neighbours around the face (4 bits per corner packed)
              const px = x[0] + q[0] * dir, py = x[1] + q[1] * dir, pz = x[2] + q[2] * dir;
              let ao = 0;
              const du = [0, 0, 0], dv = [0, 0, 0]; du[u] = 1; dv[v] = 1;
              const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
              for (let k = 0; k < 4; k++) {
                const [cu, cv] = corners[k];
                const s1 = this.solid(px + du[0] * cu, py + du[1] * cu, pz + du[2] * cu) ? 1 : 0;
                const s2 = this.solid(px + dv[0] * cv, py + dv[1] * cv, pz + dv[2] * cv) ? 1 : 0;
                const sc = this.solid(px + du[0] * cu + dv[0] * cv, py + du[1] * cu + dv[1] * cv, pz + du[2] * cu + dv[2] * cv) ? 1 : 0;
                const occ = s1 && s2 ? 3 : s1 + s2 + sc;
                ao |= occ << (k * 2);
              }
              aoMask[n] = ao | (this.emissive[this.i(x[0], x[1], x[2])] << 8);
            } else { mask[n] = 0; aoMask[n] = 0; }
          }
          // greedy merge rectangles of identical colour + AO
          n = 0;
          for (let j = 0; j < dims[v]; j++) for (let i = 0; i < dims[u];) {
            const m = mask[n];
            if (!m) { i++; n++; continue; }
            const ao = aoMask[n];
            let w = 1; while (i + w < dims[u] && mask[n + w] === m && aoMask[n + w] === ao) w++;
            let h = 1, done = false;
            while (j + h < dims[v] && !done) {
              for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== m || aoMask[n + k + h * dims[u]] !== ao) { done = true; break; }
              if (!done) h++;
            }
            const base = [0, 0, 0]; base[u] = i; base[v] = j; base[axis] = x[axis] + (dir > 0 ? 1 : 0);
            const du = [0, 0, 0], dv = [0, 0, 0]; du[u] = w; dv[v] = h;
            const vi = pos.length / 3;
            const quad = [base, [base[0] + du[0], base[1] + du[1], base[2] + du[2]], [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]], [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]]];
            const shade = FACE_SHADE[axis * 2 + (dir > 0 ? 0 : 1)];
            tmp.setHex(m - 1).convertSRGBToLinear();
            const glow = (ao >> 8) & 255;
            const aoK = [0, 1, 2, 3].map((k) => 1 - ((ao >> (k * 2)) & 3) * 0.17);
            for (let k = 0; k < 4; k++) {
              pos.push((quad[k][0] + ox) * s, quad[k][1] * s, (quad[k][2] + oz) * s);
              const nn = [0, 0, 0]; nn[axis] = dir; nor.push(nn[0], nn[1], nn[2]);
              const kk = shade * aoK[k];
              col.push(tmp.r * kk, tmp.g * kk, tmp.b * kk);
              emi.push(glow / 255);
            }
            // flip the quad diagonal to follow AO (avoids anisotropy artefacts)
            const flip = aoK[0] + aoK[2] < aoK[1] + aoK[3];
            if ((dir > 0) !== (axis === 1 ? false : false)) {
              if (flip) idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi); else idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            } else if (flip) idx.push(vi + 1, vi + 3, vi + 2, vi + 1, vi, vi + 3); else idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
            for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) { mask[n + k + l * dims[u]] = 0; }
            i += w; n += w;
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(emi, 1));
    g.setIndex(idx);
    // fix winding per face normal (robust against the axis/direction permutations above)
    const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(P, idx[t]); b.fromBufferAttribute(P, idx[t + 1]); c.fromBufferAttribute(P, idx[t + 2]);
      nn.fromBufferAttribute(N, idx[t]);
      const cr = b.sub(a).cross(c.sub(a));
      if (cr.dot(nn) < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
    }
    g.setIndex(idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** a vertex-coloured material for voxel meshes with emissive glow from the aGlow attribute */
export function voxelMaterial(o: { roughness?: number; metalness?: number; glow?: THREE.ColorRepresentation } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.75, metalness: o.metalness ?? 0 });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * 2.5;');
  };
  return m;
}
