// The open ocean around the hideout: a gradient water dome, radial "into the blue" fog for everything outside the
// cave (distance from the room, not from the camera, so the narrow-FOV camera never fogs the cosy interior),
// swaying kelp forests, voxel corals, slanted god-ray cards, a circling school of fish, rising bubbles and
// marine snow.
import * as THREE from 'three';
import { retro, chainKey } from '../gfx/retro';
import { Voxels, voxelMaterial } from '../gfx/voxel';
import { Px } from '../gfx/px';
import { TEX, MAT } from './tex';
import { hash2, fbm } from '../core/math';

export const FOG = {
  uFogCol: { value: new THREE.Color('#13597a') },
  uFogDeep: { value: new THREE.Color('#03141f') },
  uFogCenter: { value: new THREE.Vector2(0, 0) },
  uFogR: { value: 7.5 },
  uFogK: { value: 0.085 },
  uFogTime: { value: 0 },
};

/** fade a material into the ocean blue with distance from the room centre (and a cold tint) */
export function oceanFog<T extends THREE.Material>(mat: T, amount = 1, sway = 0): T {
  const ud = mat.userData as Record<string, unknown>;
  if (ud.oceanFog) return mat;
  const local = { uFogAmt: { value: amount }, uSway: { value: sway } };
  ud.oceanFog = local;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, FOG, local);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogW; uniform float uSway; uniform float uFogTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (uSway > 0.0) {
          vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
          float hh = max(0.0, transformed.y);
          float ph = wp0.x * 0.37 + wp0.z * 0.29;
          transformed.x += sin(uFogTime * 0.9 + ph + hh * 0.35) * hh * hh * 0.012 * uSway;
          transformed.z += cos(uFogTime * 0.7 + ph * 1.3 + hh * 0.3) * hh * hh * 0.008 * uSway;
        }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 fp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fp = instanceMatrix * fp;
          #endif
          vFogW = (modelMatrix * fp).xyz;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogW; uniform vec3 uFogCol; uniform vec3 uFogDeep; uniform vec2 uFogCenter; uniform float uFogR; uniform float uFogK; uniform float uFogAmt;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        {
          float fd = length(vFogW.xz - uFogCenter);
          float ff = 1.0 - exp(-max(0.0, fd - uFogR) * uFogK);
          ff = max(ff, smoothstep(-2.0, -14.0, vFogW.y) * 0.9);
          vec3 fc = mix(uFogDeep, uFogCol, clamp(vFogW.y * 0.05 + 0.55, 0.0, 1.0));
          gl_FragColor.rgb = mix(gl_FragColor.rgb * mix(vec3(1.0), vec3(0.75, 0.9, 1.05), min(1.0, ff * 3.0)), fc, ff * uFogAmt);
        }`);
  };
  mat.customProgramCacheKey = chainKey(mat, prev, `|ofog${sway > 0 ? 's' : ''}`);
  mat.needsUpdate = true;
  return mat;
}

/** the water all around: a dome lit from above, matching the fog colour at the horizon */
function waterDome(): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: true,
    uniforms: { uTop: { value: new THREE.Color('#4ab4d0') }, uMid: FOG.uFogCol, uDeep: FOG.uFogDeep, uTime: FOG.uFogTime },
    vertexShader: `varying vec3 vD; void main() { vD = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99; }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uDeep; uniform float uTime; varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float y = vD.y;
        vec3 c = y > 0.0 ? mix(uMid, uTop, pow(clamp(y * 1.4, 0.0, 1.0), 0.8)) : mix(uMid, uDeep, clamp(-y * 3.0, 0.0, 1.0));
        // slow shafts in the dome (angular)
        float a = atan(vD.z, vD.x);
        float s = smoothstep(0.55, 1.0, sin(a * 7.0 + uTime * 0.05) * sin(a * 3.0 - uTime * 0.03 + 1.3)) * smoothstep(-0.1, 0.5, y);
        c += uTop * s * 0.18;
        // banding dither so the gradient steps like a PS1 sky
        float q = 48.0;
        c = floor(c * q + h(gl_FragCoord.xy) ) / q;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const g = new THREE.SphereGeometry(180, 24, 16);
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** a forest of kelp ribbons merged into one swaying mesh */
function kelpForest(spots: [number, number, number][]): THREE.Mesh {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  let base = 0;
  spots.forEach(([x, z, n], si) => {
    for (let i = 0; i < n; i++) {
      const sx = x + (hash2(si, i, 1) - 0.5) * 2.5, sz = z + (hash2(si, i, 2) - 0.5) * 2.5;
      const H = 6 + hash2(si, i, 3) * 9, segs = 10, w = 0.35 + hash2(si, i, 4) * 0.2;
      const a = hash2(si, i, 5) * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= segs; j++) {
        const t = j / segs, y = t * H;
        const bend = Math.sin(t * 3 + i) * 0.4 * t;
        for (const s of [-1, 1]) {
          const ww = w * (0.6 + Math.sin(t * Math.PI) * 0.6) * s;
          pos.push(sx + ca * ww + bend, y, sz + sa * ww);
          nrm.push(-sa, 0, ca);
          uv.push(s < 0 ? 0 : 1, t * H / 2.2);
        }
        if (j < segs) { const b = base + j * 2; idx.push(b, b + 1, b + 3, b, b + 3, b + 2); }
      }
      base += (segs + 1) * 2;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const t = TEX.kelp().clone(); t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  const m = oceanFog(retro(new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, emissive: '#0a1a04', emissiveIntensity: 0.6 })), 1, 1);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

/** voxel corals: staghorn, brain, tube sponge, sea fan */
function coral(kind: number, seed: number): THREE.Mesh {
  const v = new Voxels(14, 16, 14);
  const pal = [[0xe86a8a, 0xff9ab0, 0xc84a6a], [0xe8a03a, 0xffc860, 0xb8701a], [0x9a5ae8, 0xc890ff, 0x6a3ab0], [0x3ac8b0, 0x8af0d8, 0x1a8a7a], [0xe84a3a, 0xff8a6a, 0xa82a1a]][seed % 5];
  if (kind === 0) {
    // staghorn: random branching
    const grow = (x: number, y: number, z: number, dx: number, dz: number, len: number, d: number) => {
      for (let i = 0; i < len; i++) {
        v.set(x, y, z, i > len - 2 ? pal[1] : pal[0]);
        y++; if (hash2(x + i, y, seed) > 0.6) x += dx; if (hash2(z, y + i, seed + 1) > 0.6) z += dz;
        if (d < 3 && hash2(x, y, z + seed) > 0.75) grow(x, y, z, -dx || 1, -dz || 1, len - i - 1, d + 1);
      }
    };
    grow(7, 0, 7, 1, 0, 12, 0); grow(7, 0, 7, -1, 1, 10, 0); grow(7, 0, 7, 0, -1, 11, 0);
  } else if (kind === 1) {
    // brain coral dome with grooves
    v.sphere(7, 0, 7, 6.5, (x, y, z) => (y < 0 ? -1 : (Math.sin(x * 1.3 + Math.sin(z * 0.9) * 2) > 0.2 ? pal[0] : pal[2])));
  } else if (kind === 2) {
    // tube sponges
    for (let k = 0; k < 4; k++) {
      const cx = 4 + (k % 2) * 6, cz = 4 + Math.floor(k / 2) * 6, h = 6 + Math.floor(hash2(k, seed, 3) * 8);
      for (let y = 0; y < h; y++) for (let a = 0; a < 8; a++) v.set(cx + Math.round(Math.cos(a / 8 * 6.28) * 1.6), y, cz + Math.round(Math.sin(a / 8 * 6.28) * 1.6), y === h - 1 ? pal[1] : pal[0]);
    }
  } else {
    // sea fan: a flat lacy disc
    for (let y = 0; y < 15; y++) for (let x = 0; x < 14; x++) {
      const dx = x - 7, dy = y;
      if (dx * dx / 49 + (dy - 8) * (dy - 8) / 64 > 1 && dy > 2) continue;
      if (dy <= 2 && Math.abs(dx) > 0) continue;
      if (fbm(x * 0.5, y * 0.5, 2, seed) > 0.55 && dy > 3) continue;
      v.set(x, y, 7, (x + y) % 3 === 0 ? pal[2] : pal[0]);
    }
  }
  const m = new THREE.Mesh(v.mesh(0.09), oceanFog(retro(voxelMaterial({ roughness: 0.8 })), 1));
  return m;
}

/** a slanted god-ray card (additive) that turns to face the camera around its own axis */
function rayCard(w: number, h: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ map: TEX.ray(), color: new THREE.Color('#9fe4ff').multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6, toneMapped: true });
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 5;
  return mesh;
}

/** a simple low-poly fish silhouette geometry, nose +x */
function fishGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const P = [
    0.5, 0, 0, 0, 0.18, 0, -0.35, 0, 0, 0, -0.14, 0, 0, 0, 0.08, 0, 0, -0.08, -0.35, 0, 0, -0.6, 0.18, 0, -0.6, -0.18, 0,
  ];
  const I = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 5, 1, 1, 5, 2, 2, 5, 3, 3, 5, 0, 6, 7, 8, 6, 8, 7];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

interface Mote { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number }

/** cheap pixel point sprites (bubbles, marine snow, dust motes, sparkles) updated on the CPU */
export class Motes {
  points: THREE.Points;
  private list: Mote[] = [];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array; private sz: Float32Array; private al: Float32Array;
  constructor(private cap: number, sprite: 'bubble' | 'dot' | 'spark', color: string, additive = false) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.sz = new Float32Array(cap); this.al = new Float32Array(cap);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1));
    const p = new Px(8, 8);
    if (sprite === 'bubble') { p.ellipse(4, 4, 3.5, 3.5, (nx, ny) => (Math.hypot(nx, ny) > 0.62 ? [220, 248, 255] : null)); p.set(3, 2, '#ffffff'); p.set(2, 3, '#ffffff'); }
    else if (sprite === 'spark') { for (let i = 1; i < 7; i++) { p.set(i, 4, '#ffffff', i === 4 ? 255 : 160); p.set(4, i, '#ffffff', i === 4 ? 255 : 160); } p.set(3, 3, '#ffffff'); }
    else p.ellipse(4, 4, 2, 2, '#ffffff');
    const tex = p.texture({ mip: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uCol: { value: new THREE.Color(color) }, uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(2.0, floor(aSize * uScale / -mv.z)); }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uCol; varying float vA;
        void main() { vec4 t = texture2D(uTex, gl_PointCoord); if (t.a < 0.5 || vA <= 0.01) discard; gl_FragColor = vec4(uCol * t.rgb, vA); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }
  setScale(px: number) { ((this.points.material as THREE.ShaderMaterial).uniforms.uScale.value as number) = px; (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px; }
  emit(x: number, y: number, z: number, o: { vx?: number; vy?: number; vz?: number; life?: number; size?: number; spread?: number } = {}) {
    if (this.list.length >= this.cap) this.list.shift();
    const s = o.spread ?? 0;
    this.list.push({ x: x + (Math.random() - 0.5) * s, y, z: z + (Math.random() - 0.5) * s, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, life: 0, max: o.life ?? 4, size: o.size ?? 0.08 });
  }
  update(dt: number, t: number, kind: 'rise' | 'drift' | 'burst') {
    const out: Mote[] = [];
    for (const m of this.list) {
      m.life += dt;
      if (m.life > m.max) continue;
      if (kind === 'rise') { m.vy += dt * 0.8; m.vy = Math.min(m.vy, 1.6); m.x += Math.sin(t * 5 + m.max * 9) * dt * 0.15; }
      else if (kind === 'drift') { m.x += Math.sin(t * 0.3 + m.max * 7) * dt * 0.05; m.vy = -0.04; }
      else { m.vx *= Math.exp(-dt * 3); m.vz *= Math.exp(-dt * 3); m.vy = m.vy * Math.exp(-dt * 3) - dt * 0.5; }
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      out.push(m);
    }
    this.list = out;
    for (let i = 0; i < this.cap; i++) {
      const m = this.list[i];
      if (!m) { this.al[i] = 0; continue; }
      this.pos[i * 3] = m.x; this.pos[i * 3 + 1] = m.y; this.pos[i * 3 + 2] = m.z;
      this.sz[i] = m.size;
      const k = m.life / m.max;
      this.al[i] = Math.min(1, m.life * 4) * (k > 0.8 ? (1 - k) * 5 : 1);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
  get count() { return this.list.length; }
}

export class OceanOutside {
  group = new THREE.Group();
  private rays: { m: THREE.Mesh; ph: number; base: number }[] = [];
  private school: THREE.InstancedMesh;
  private fish: { a: number; r: number; y: number; sp: number; ph: number; cx: number; cz: number }[] = [];
  bubbles = new Motes(260, 'bubble', '#d8f8ff');
  snow = new Motes(220, 'dot', '#a8d0d8');
  private vents: [number, number, number][] = [];
  private t = 0;

  constructor() {
    this.group.add(waterDome());
    // seabed: a wide sand disc that slopes away into the deep
    const sand = new THREE.CircleGeometry(90, 40, 0, Math.PI * 2);
    sand.rotateX(-Math.PI / 2);
    const P = sand.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x, z); P.setY(i, -0.02 - Math.max(0, d - 12) * 0.12 + (fbm(x * 0.08, z * 0.08, 3, 4) - 0.5) * Math.min(1, d / 15) * 2.5); }
    sand.computeVertexNormals();
    const uvA = sand.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, P.getX(i) / 2, P.getZ(i) / 2);
    const sandM = oceanFog(retro(new THREE.MeshStandardMaterial({ map: TEX.sand(), roughness: 1 })), 1);
    const sandMesh = new THREE.Mesh(sand, sandM);
    sandMesh.receiveShadow = true;
    this.group.add(sandMesh);
    // kelp forests in a ring outside the outcrop
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + hash2(i, 1, 7) * 0.3, r = 13 + hash2(i, 2, 7) * 9; spots.push([Math.cos(a) * r, Math.sin(a) * r, 3 + Math.floor(hash2(i, 3, 7) * 5)]); }
    // a few tall strands right behind the back walls so they peek over
    spots.push([-9.5, -3, 3], [-2, -8.5, 3], [4, -9, 2], [-9, 4, 2]);
    this.group.add(kelpForest(spots));
    // corals and sponges scattered on the sand and rocks
    for (let i = 0; i < 26; i++) {
      const a = hash2(i, 9, 2) * Math.PI * 2, r = 8.5 + hash2(i, 10, 2) * 10;
      const c = coral(i % 4, i);
      c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      c.rotation.y = hash2(i, 11, 2) * 6.28;
      c.scale.setScalar(0.7 + hash2(i, 12, 2) * 1.0);
      this.group.add(c);
    }
    // god rays falling around (and into) the hideout
    for (let i = 3; i < 14; i++) {
      const inside = i < 3;
      const m = rayCard(inside ? 2.2 : 3 + hash2(i, 1, 3) * 4, inside ? 13 : 26 + hash2(i, 2, 3) * 10);
      const a = -Math.PI * 0.75 + (hash2(i, 3, 3) - 0.5) * 3.2, r = inside ? 1 + i * 1.8 : 11 + hash2(i, 4, 3) * 16;
      m.position.set(inside ? -3 + i * 2.6 : Math.cos(a) * r, inside ? 12.5 : 24, inside ? -1.5 + i * 0.8 : Math.sin(a) * r);
      m.rotation.z = 0.22;
      (m.material as THREE.MeshBasicMaterial).opacity = inside ? 0.22 : 0.3;
      this.group.add(m);
      this.rays.push({ m, ph: hash2(i, 5, 3) * 10, base: (m.material as THREE.MeshBasicMaterial).opacity });
    }
    // a school of small fish circling far out
    const fm = oceanFog(retro(new THREE.MeshStandardMaterial({ color: '#5a8aa0', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide, flatShading: true })), 1);
    const N = 70;
    this.school = new THREE.InstancedMesh(fishGeo(), fm, N);
    this.school.frustumCulled = false;
    for (let i = 0; i < N; i++) {
      const g = i < 50 ? 0 : 1;
      this.fish.push({ a: hash2(i, 1, 5) * 0.9 + (g ? 3 : 0), r: (g ? 16 : 13) + hash2(i, 2, 5) * 2.5, y: (g ? 9 : 6) + hash2(i, 3, 5) * 2.5, sp: (g ? -0.05 : 0.06) * (0.9 + hash2(i, 4, 5) * 0.2), ph: hash2(i, 5, 5) * 6.28, cx: g ? 3 : -2, cz: g ? -4 : 2 });
    }
    this.group.add(this.school);
    this.group.add(this.bubbles.points, this.snow.points);
    for (let i = 0; i < 7; i++) { const a = hash2(i, 1, 8) * Math.PI * 2, r = 8 + hash2(i, 2, 8) * 8; this.vents.push([Math.cos(a) * r, 0.2, Math.sin(a) * r]); }
    for (let i = 0; i < 160; i++) this.snow.emit((Math.random() - 0.5) * 50, Math.random() * 18, (Math.random() - 0.5) * 50, { life: 6 + Math.random() * 10, size: 0.05 + Math.random() * 0.04 });
  }

  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private s = new THREE.Vector3(1, 1, 1);
  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const t = this.t;
    FOG.uFogTime.value = t;
    // rays face the camera around their long axis and breathe
    const cp = cam.position;
    for (const r of this.rays) {
      r.m.rotation.y = Math.atan2(cp.x - r.m.position.x, cp.z - r.m.position.z);
      const near = Math.hypot(cp.x - r.m.position.x, cp.z - r.m.position.z);
      (r.m.material as THREE.MeshBasicMaterial).opacity = r.base * (0.65 + 0.35 * Math.sin(t * 0.35 + r.ph)) * Math.min(1, Math.max(0, (near - 12) / 10));
    }
    // fish
    this.fish.forEach((f, i) => {
      f.a += f.sp * dt;
      const wob = Math.sin(t * 0.5 + f.ph) * 0.8;
      const x = f.cx + Math.cos(f.a) * (f.r + wob), z = f.cz + Math.sin(f.a) * (f.r + wob), y = f.y + Math.sin(t * 0.7 + f.ph) * 0.4;
      this.e.set(0, -f.a - (f.sp > 0 ? Math.PI / 2 : -Math.PI / 2), Math.sin(t * 9 + f.ph) * 0.12);
      this.q.setFromEuler(this.e);
      this.s.setScalar(0.55 + (i % 5) * 0.06);
      this.m4.compose(this.v.set(x, y, z), this.q, this.s);
      this.school.setMatrixAt(i, this.m4);
    });
    this.school.instanceMatrix.needsUpdate = true;
    // bubbles from vents, snow refresh
    for (const [x, y, z] of this.vents) if (Math.random() < dt * 3) this.bubbles.emit(x, y, z, { spread: 0.4, life: 7, size: 0.06 + Math.random() * 0.08, vy: 0.3 });
    if (Math.random() < dt * 14) this.snow.emit((Math.random() - 0.5) * 50, 14 + Math.random() * 4, (Math.random() - 0.5) * 50, { life: 12, size: 0.05 + Math.random() * 0.04 });
    this.bubbles.update(dt, t, 'rise');
    this.snow.update(dt, t, 'drift');
  }
  setScale(px: number) { this.bubbles.setScale(px); this.snow.setScale(px); }
}

export { MAT as _MAT };
