// The infinite ocean scenery: chunks of seabed streamed around the camera. Each chunk has a 3D seabed that
// matches the gameplay floor exactly at z = 0 and rolls away into dunes and cliffs behind, the front
// cross-section wall (strata, ores, fossils) that makes the world read as a miniature diorama, lumpy rocks
// (the same ones lines wrap around), voxel coral / crystals / anemones, swaying kelp, harbour junk and big
// background spires fading into the blue.
import * as THREE from 'three';
import { SeaTerrain, CHUNK } from './terrain';
import type { Biome } from './biomes';
import { groundMaterial, rockMaterial, rockGeometry, strataTex, coralGeo, crystalGeo, kelpGeometry, kelpMaterial, anemoneGeo, swayVoxelMaterial, staticVoxelMaterial, junkObject } from './decor';
import { uw } from '../gfx/shaders/underwater';
import { FRONT_Z } from '../gfx/water/surface';
import { Rng } from '../core/rng';
import { fbm, smooth } from '../core/math';

const ROWS = [FRONT_Z, 2.2, 1.2, 0.4, -0.4, -1.2, -2.2, -3.5, -5, -7, -9.5, -12.5, -16, -20, -25, -31, -38, -46, -56];

interface Chunk { i: number; group: THREE.Group }

export class Ocean {
  group = new THREE.Group();
  terrain: SeaTerrain;
  biome: Biome;
  seed: number;
  private chunks = new Map<number, Chunk>();
  private strataMat: THREE.MeshStandardMaterial;
  snow: MarineSnow;

  constructor(biome: Biome, seed: number) {
    this.biome = biome; this.seed = seed;
    this.terrain = new SeaTerrain(seed, biome);
    const st = strataTex(biome);
    this.strataMat = uw(new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.nrm, roughness: 0.95 }), { caustics: 0.4 });
    this.snow = new MarineSnow(biome.snow, biome.glow ? '#9fe8ff' : '#e8f4ec');
    this.group.add(this.snow.points);
    this.group.name = 'ocean';
  }

  /** seabed height anywhere on the 3D diorama (z = 0 is the exact gameplay floor) */
  heightAt(x: number, z: number): number {
    const f = this.terrain.floorAt(x);
    if (z >= -1.5) return f;
    const b = this.biome;
    const k = smooth(-1.5, -14, z);
    const bg = b.floor + (fbm(x * 0.05, z * 0.07, 4, this.seed + 5) - 0.5) * b.amp * 3 + Math.max(0, -z - 22) * 0.32 + Math.max(0, fbm(x * 0.02, z * 0.02, 2, this.seed + 8) - 0.55) * 14;
    const h = f * (1 - k) + bg * k;
    // the back of the diorama rises into canyon walls but never breaks the surface
    const cap = -7.5;
    return h > cap - 2 ? cap - 2 * Math.exp(-(h - (cap - 2)) / 2) : h;
  }

  update(camX: number, camY: number, time: number) {
    const ci = Math.floor(camX / CHUNK);
    for (let i = ci - 2; i <= ci + 2; i++) if (!this.chunks.has(i)) this.build(i);
    for (const [i, c] of this.chunks) if (Math.abs(i - ci) > 3) { this.disposeChunk(c); this.chunks.delete(i); }
    this.snow.update(camX, camY, time);
  }

  private build(i: number) {
    const g = new THREE.Group();
    const b = this.biome, T = this.terrain;
    const x0 = i * CHUNK, x1 = x0 + CHUNK;
    const rng = new Rng((this.seed ^ Math.imul(i + 1013, 0x9e3779b1)) >>> 0);
    // ---- seabed surface
    const cols = 61;
    const pos: number[] = [], idx: number[] = [];
    for (let r = 0; r < ROWS.length; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + (c / (cols - 1)) * CHUNK, z = ROWS[r];
      pos.push(x, this.heightAt(x, z), z);
    }
    for (let r = 0; r < ROWS.length - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, bb = a + 1, cc = a + cols, d = cc + 1;
      idx.push(a, bb, cc, bb, d, cc);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const guv = new Float32Array((pos.length / 3) * 2);
    for (let k = 0; k < pos.length / 3; k++) { guv[k * 2] = pos[k * 3] * 0.22; guv[k * 2 + 1] = pos[k * 3 + 2] * 0.22; }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(guv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, groundMaterial(b));
    ground.receiveShadow = true;
    g.add(ground);
    // ---- the front cross-section wall
    const fp: number[] = [], fuv: number[] = [], fi: number[] = [];
    const depth = 18;
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c / (cols - 1)) * CHUNK, top = T.floorAt(x);
      fp.push(x, top, FRONT_Z, x, top - depth, FRONT_Z);
      fuv.push(x / 4.6, 1, x / 4.6, 1 - depth / 9);
    }
    for (let c = 0; c < cols - 1; c++) { const a = c * 2; fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    fg.setIndex(fi);
    fg.computeVertexNormals();
    const front = new THREE.Mesh(fg, this.strataMat);
    front.receiveShadow = true;
    g.add(front);
    // ---- gameplay rocks
    for (const rk of T.rocksIn(i)) {
      const m = new THREE.Mesh(rockGeometry(rk.seed), rockMaterial(b));
      m.position.set(rk.x, rk.y, 0);
      m.scale.set(rk.r, rk.r * (rk.kind === 'pillar' ? 0.75 : 0.85), rk.r * 1.25);
      m.rotation.y = (rk.seed % 100) * 0.06;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      if (rk.kind === 'coral' || rk.sharp) {
        const cm = new THREE.Mesh(coralGeo(b, 0), swayVoxelMaterial(b, 0.01));
        cm.position.set(rk.x, rk.y + rk.r * 0.6, 0.2);
        cm.scale.setScalar(rk.r * 0.9);
        cm.castShadow = true;
        g.add(cm);
      }
      // a ring of small boulders at the base anchors it visually
      for (let k = 0; k < 2; k++) {
        const s = new THREE.Mesh(rockGeometry(rk.seed + k + 3), rockMaterial(b));
        const ox = (k ? 1 : -1) * rk.r * (0.8 + rng.next() * 0.3);
        s.position.set(rk.x + ox, T.floorAt(rk.x + ox) + 0.1, rng.range(-0.8, 0.8));
        s.scale.setScalar(rk.r * rng.range(0.25, 0.4));
        s.castShadow = s.receiveShadow = true;
        g.add(s);
      }
    }
    // ---- decor
    const place = (obj: THREE.Object3D, x: number, z: number, scale: number, sink = 0.05) => {
      obj.position.set(x, this.heightAt(x, z) - sink, z);
      obj.scale.multiplyScalar(scale);
      obj.rotation.y += rng.range(0, Math.PI * 2);
      g.add(obj);
    };
    const zBand = () => (rng.chance(0.35) ? rng.range(0.9, 2.6) : rng.range(-16, -0.9));
    for (let k = 0; k < Math.round(12 * b.corals); k++) {
      const v = rng.int(0, 7);
      const m = new THREE.Mesh(coralGeo(b, v), swayVoxelMaterial(b, v % 4 === 3 ? 0.04 : 0.012));
      m.castShadow = true;
      const z = zBand();
      place(m, rng.range(x0, x1), z, rng.range(1.3, 2.4) * (z > 0.5 ? 1.15 : 1));
    }
    for (let k = 0; k < Math.round(4 * b.crystals); k++) {
      const m = new THREE.Mesh(crystalGeo(b, rng.int(0, 5)), staticVoxelMaterial());
      m.castShadow = true;
      place(m, rng.range(x0, x1), zBand(), rng.range(1.0, 1.8));
    }
    for (let k = 0; k < Math.round(5 * b.anemones); k++) {
      const m = new THREE.Mesh(anemoneGeo(b, rng.int(0, 4)), swayVoxelMaterial(b, 0.06));
      place(m, rng.range(x0, x1), zBand(), rng.range(1.2, 2.0));
    }
    for (let k = 0; k < Math.round(3 * b.junk); k++) place(junkObject(rng.int(0, 3), b), rng.range(x0, x1), zBand(), rng.range(0.8, 1.2), 0.02);
    // kelp forest (instanced)
    const nk = Math.round(18 * b.kelp);
    if (nk > 0) {
      const km = new THREE.InstancedMesh(kelpGeometry(), kelpMaterial(b), nk);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
      for (let k = 0; k < nk; k++) {
        const x = rng.range(x0, x1), z = rng.chance(0.25) ? rng.range(1, 2.6) : rng.range(-22, -1);
        const y = this.heightAt(x, z);
        // kelp reaches toward the light but never pierces the surface
        const maxH = Math.max(0.15, (-y - 1.4) / 10);
        sv.set(rng.range(0.8, 1.4), Math.min(maxH, rng.range(0.45, 1.25)), 1);
        m4.compose(pv.set(x, y - 0.1, z), q.setFromEuler(e.set(0, rng.range(-0.8, 0.8), 0)), sv);
        km.setMatrixAt(k, m4);
      }
      km.castShadow = true;
      km.instanceMatrix.needsUpdate = true;
      km.computeBoundingSphere();
      g.add(km);
    }
    // background spires and boulders fading into the blue
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(rockGeometry(rng.int(0, 9)), rockMaterial(b));
      const z = rng.range(-34, -56), x = rng.range(x0, x1);
      const base = this.heightAt(x, z);
      const s = rng.range(3, 7);
      const sy = Math.min(s * rng.range(0.8, 2.0), Math.max(1.5, (-8 - base) / 0.75));
      m.position.set(x, base + sy * 0.25, z);
      m.scale.set(s, sy, s);
      g.add(m);
    }
    this.group.add(g);
    this.chunks.set(i, { i, group: g });
  }

  private disposeChunk(c: Chunk) {
    c.group.traverse((o) => {
      const m = o as THREE.Mesh;
      // shared (memoised) geometries stay; per-chunk ground/front/instanced ones are freed
      if (m.isMesh && (m.geometry.userData.shared !== true) && (m.material === this.strataMat || (m as THREE.InstancedMesh).isInstancedMesh || m.geometry.attributes.position.count > 1000)) {
        if (!(m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
      }
    });
    c.group.removeFromParent();
  }

  dispose() { for (const c of this.chunks.values()) this.disposeChunk(c); this.chunks.clear(); this.snow.points.removeFromParent(); }
}

/** drifting marine snow: an infinite wrap-around field of specks around the camera */
export class MarineSnow {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  constructor(density: number, color: string) {
    const n = Math.round(2200 * density);
    const p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { p[i * 3] = Math.random() * 44; p[i * 3 + 1] = Math.random() * 26; p[i * 3 + 2] = Math.random() * 34; s[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uCol: { value: new THREE.Color(color) }, uScale: { value: 500 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform vec3 uCam; uniform float uT; uniform float uScale; varying float vA; varying float vS;
        void main() {
          vec3 box = vec3(44.0, 26.0, 34.0);
          vec3 drift = vec3(sin(uT * 0.2 + aSeed * 30.0) * 0.6 + uT * 0.12, -uT * (0.08 + aSeed * 0.1), cos(uT * 0.15 + aSeed * 11.0) * 0.4);
          vec3 p = mod(position + drift - uCam + box * 0.5, box) - box * 0.5 + uCam;
          p.z -= 10.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float sz = (0.025 + aSeed * 0.035);
          gl_PointSize = max(1.0, sz * uScale / -mv.z);
          float tw = 0.6 + 0.4 * sin(uT * (1.0 + aSeed * 3.0) + aSeed * 40.0);
          vA = tw * smoothstep(60.0, 8.0, -mv.z) * (p.y < 0.0 ? 1.0 : 0.0);
          vS = aSeed;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA; varying float vS;
        void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(uCol * vA * (1.0 - d * 1.6) * 0.55, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 15;
  }
  update(cx: number, cy: number, t: number) { this.mat.uniforms.uCam.value.set(cx, cy, 0); this.mat.uniforms.uT.value = t; }
  setScale(h: number, fov: number) { this.mat.uniforms.uScale.value = h / (2 * Math.tan((fov * Math.PI) / 360)); }
}
