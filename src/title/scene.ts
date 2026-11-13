// The title screen's 3D set: the blobfish on a rock ledge at the mouth of its hideout, overlooking the open ocean.
// A basalt outcrop with the round brass hatch of the hideout (warm lamplight spilling out, a lantern), a sheer
// drop into the blue, kelp forests swaying up toward the light, two schools of fish, a humpback crossing far off,
// fishing boats at the surface with their lines hanging down, god rays, marine snow and bubbles. Everything is
// low-poly and flat-shaded over clean painted pixel pages; the water optics (fog, scattering, ray-marched shafts)
// come from the post pipeline, so the camera sits in the water like a run's camera.
//
//   const set = new HeroSet(); scene.add(set.group); set.update(dt, t, camera)
//   set.hero (CosmeticPuppet), set.H (where it stands), set.fx (Particles), set.light (Lighting)
import * as THREE from 'three';
import { Loft, type V3 } from '../gfx/loft';
import { Px, worley } from '../gfx/px';
import { Lighting, type Look, LOOKS } from '../gfx/lighting';
import { Particles } from '../gfx/particles';
import { chainKey } from '../gfx/retro';
import { psxMat, facet } from '../player/psx';
import { ctex, T, tone, rect } from '../skills/texkit';
import { fbm, hash2, TAU } from '../core/math';
import { Motes } from '../hideout/ocean';
import { CosmeticPuppet } from '../cosmetics/rig';

/** where the hero stands (the ledge top) and which way it faces (puppet rotation.y) */
export const HERO_AT = new THREE.Vector3(0, -9, 0);
export const HERO_YAW = -2.62;

/** the title look: a deep, clear, cinematic blue with strong shafts and a teal / amber split */
export const TITLE_LOOK: Look = {
  ...LOOKS.reef,
  scatterTop: '#2ab0cc', scatterDeep: '#0a2c5e', rays: 1.35, rayCol: '#e8fff6',
  hemiSky: '#5ec8e0', hemiGround: '#2a3a40', hemi: 0.75, sunI: 3.1,
  depthExt: [0.016, 0.006, 0.003], depthMin: [0.5, 0.65, 0.75], caustic: 1.0,
  saturation: 1.12, contrast: 1.14, exposure: 1.0,
  fogNear: 4, fogK: 0.034, fogDeep: 40, rim: ['#d8f8ff', 0.5], fill: ['#8ad0e8', 0.45],
  split: ['#123c58', '#ffc080', 0.12], bloom: 0.5, vignette: 0.38,
};

// ------------------------------------------------------------------ pages
const ROCK_T = ['#101216', '#1c1e24', '#2a2c32', '#3a3a40', '#4e4c52', '#68646a'];
/**
 * Layered basalt: wavy strata bands (each its own tone, a lit top lip and a dark seam under it), vertical joints
 * that break each band into blocks, a few chipped corners. The moss variant grows algae turf on the band tops,
 * a coralline crust here and there, and barnacles.
 */
function rockPage(moss: boolean) {
  return ctex(moss ? 'titleRockMoss' : 'titleRock', 64, 64, (p) => {
    const wob = (x: number) => Math.round(Math.sin(x * 0.19) * 1.5 + Math.sin(x * 0.07 + 2) * 2);
    const bandAt = (x: number, y: number) => Math.floor((y + wob(x) + 64) / 8);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const b = bandAt(x, y), by = (y + wob(x) + 64) % 8;
      // joints: each band split into blocks of its own length, every other joint left out (no masonry look)
      const P = 12 + Math.floor(hash2(b, 2, 9) * 3) * 6, off = Math.floor(hash2(b, 1, 9) * P);
      let blk = Math.floor((x + off) / P), jx = (x + off) % P;
      if (hash2(b, blk, 23) < 0.5) { jx = 5; blk -= 1; } // this joint is left out: the block before carries on
      let k = 2 + Math.floor(hash2(b, blk, 7) * 2.4);
      if (by === 0) k += 1;                          // the lit upper lip
      if (by === 7) k = 0;                           // the seam under the band
      else if (by === 6) k = Math.max(1, k - 1);
      if (jx === 0) k = 0; else if (jx === 1) k = Math.max(1, k - 1); else if (jx === P - 1) k = Math.min(5, k + 1);
      if (hash2(b, blk, 11) < 0.25 && jx > 10 && by < 3) k = 1; // a chipped corner
      let c = tone(ROCK_T, k);
      if (moss && by < 3 + Math.floor(hash2(b, blk, 13) * 3) && by !== 7 && hash2(b, blk, 17) < 0.7) {
        c = tone(['#14240e', '#22381a', '#345424', '#4a7030', '#6a9040'], by === 0 ? 4 : 2 + ((x + b) % 3 === 0 ? 1 : 0));
      } else if (moss && hash2(b, blk, 19) < 0.12 && by > 2 && by < 6) c = tone(['#3a1a22', '#5a2a38', '#7a4050', '#9a5a68'], by === 3 ? 3 : 2);
      p.set(x, y, c);
    }
    if (moss) for (let i = 0; i < 9; i++) { const x = Math.floor(hash2(i, 1, 5) * 60) + 2, y = Math.floor(hash2(i, 2, 5) * 60) + 2; p.set(x, y, '#d8d0c0'); p.set(x + 1, y, '#a8a090'); p.set(x, y + 1, '#8a8478'); p.set(x + 1, y + 1, '#2a2620'); }
  });
}
const SAND = () => ctex('titleSand', 32, 32, (p) => {
  const S = ['#4a4436', '#6a6250', '#8a8068', '#a89c80'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const r = (y + Math.round(Math.sin(x * 0.4) * 1.5)) % 6; p.set(x, y, tone(S, r === 0 ? 0 : r < 3 ? 2 : r < 5 ? 1 : 3)); }
});
/** kelp: the stipe (left quarter) and a blade (rest): olive-gold with a dark midrib, wrinkles, a ragged edge */
const KELP = () => ctex('titleKelp', 64, 64, (p) => {
  const K = ['#1a1a08', '#34300e', '#524a14', '#74661e', '#9a8a2c', '#c0b04a'];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(K, x < 3 ? 1 : x < 9 ? 3 : 2));
  for (let y = 0; y < 64; y += 9) rect(p, 0, y, 16, 1, tone(K, 1));
  for (let y = 0; y < 64; y++) {
    const edge = 2 + Math.round(Math.abs(Math.sin(y * 0.9)) * 2);
    for (let x = 16; x < 64; x++) {
      const u = x - 16;
      if (u < edge || u > 47 - edge) { p.set(x, y, '#000000', 0); continue; }
      let k = Math.abs(u - 24) < 2 ? 1 : (u + (y >> 2)) % 7 === 0 ? 2 : u < 24 ? 4 : 3;
      if ((y + u) % 13 === 0) k = 5;
      p.set(x, y, tone(K, k));
    }
  }
});
const FISH = () => ctex('titleFish', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y < 5 ? '#2a4a6a' : y < 7 ? '#d8e8f0' : y < 9 ? '#5a90b0' : '#c0d8e4'); rect(p, 0, 7, 16, 1, '#f0c050'); });
const WHALE = () => ctex('titleWhale', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.slate, y < 18 ? 1 + ((x * 3 + y) % 11 === 0 ? 1 : 0) : y < 20 ? 2 : (x % 3 === 0 ? 2 : 3)));
  for (const [x, y] of [[5, 6], [17, 9], [25, 4], [9, 14]]) { p.set(x, y, tone(T.slate, 3)); p.set(x + 1, y, tone(T.slate, 3)); }
});
const HULL = () => ctex('titleHull', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.oak, y % 6 === 0 ? 0 : (x + Math.floor(y / 6) * 11) % 23 === 0 ? 1 : 1 + ((y >> 1) % 2))); rect(p, 0, 26, 32, 6, '#1a2a1e'); });
const SURFACE = () => {
  const p = new Px(64, 64);
  p.fill((x, y) => {
    const [f1, f2] = worley(x, y, 16, 3, 64);
    const e = f2 - f1;
    return e < 1.2 ? [235, 255, 255] : e < 2.6 ? [150, 225, 240] : f1 < 4 ? [70, 170, 200] : [50, 140, 180];
  });
  const t = p.texture({ repeat: true, mip: false });
  t.repeat.set(26, 26);
  return t;
};
const RAY = () => {
  const p = new Px(16, 64);
  p.fill((x, y) => { const k = Math.max(0, 1 - Math.abs(x - 7.5) / 8) * (1 - y / 64); const s = Math.floor(k * 5) / 5; return [Math.round(255 * s), Math.round(255 * s), Math.round(255 * s)]; });
  const t = p.texture({ mip: false }); t.colorSpace = THREE.NoColorSpace;
  return t;
};
const BRASS = () => ctex('titleBrass', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(T.brass, x < 3 ? 4 : x > 12 ? 1 : (x + y) % 5 === 0 ? 2 : 3)); });
const HATCH = () => ctex('titleHatch', 32, 32, (p) => {
  // the round door: iron-banded oak planks, a brass porthole ring painted round the edge
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.oak, x % 8 === 0 ? 0 : (x + y * 3) % 17 === 0 ? 1 : 2 + ((x >> 3) % 2)));
  for (const y of [8, 23]) { rect(p, 0, y, 32, 2, tone(T.iron, 2)); rect(p, 0, y, 32, 1, tone(T.iron, 4)); for (let x = 3; x < 32; x += 7) p.set(x, y + 1, tone(T.iron, 4)); }
});
const GLOWP = () => ctex('titleGlow', 8, 8, (p) => { p.rect(0, 0, 8, 8, '#ffb860'); p.rect(2, 2, 4, 4, '#fff0c0'); });

// ------------------------------------------------------------------ geometry
const n3 = (x: number, y: number, z: number, s: number) => fbm(x + z * 1.71 + s * 7.3, y - z * 1.33 + s * 3.1, 3, s);
/** a faceted boulder: a displaced icosphere, flat bottom-ish, box-projected uvs; top faces get the mossy page */
function boulder(seed: number, sx: number, sy: number, sz: number, detail = 1, rough = 0.5, flat: { top?: number; front?: number } = {}) {
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const P = ico.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const d = 1 + (n3(v.x * 1.4, v.y * 1.4, v.z * 1.4, seed) - 0.5) * rough * 1.6;
    v.multiplyScalar(d);
    if (v.y < -0.55) v.y = -0.55 - (v.y + 0.55) * 0.3;
    if (flat.top !== undefined && v.y > flat.top) v.y = flat.top + (v.y - flat.top) * 0.12;
    if (flat.front !== undefined && v.z > flat.front) v.z = flat.front + (v.z - flat.front) * 0.15;
    P.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  return splitByFacing(facet(ico), 1.1);
}
/** box-project uvs per face (tile metres per texture) and group faces: 0 = sides / underside, 1 = tops (moss) */
function splitByFacing(g: THREE.BufferGeometry, tile: number) {
  const P = g.attributes.position as THREE.BufferAttribute;
  const n = P.count / 3;
  const side: number[] = [], top: number[] = [], sUv: number[] = [], tUv: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    a.fromBufferAttribute(P, f * 3); b.fromBufferAttribute(P, f * 3 + 1); c.fromBufferAttribute(P, f * 3 + 2);
    nn.copy(c).sub(b).cross(a.clone().sub(b)).normalize();
    const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    const isTop = nn.y > 0.62;
    const pos = isTop ? top : side, uv = isTop ? tUv : sUv;
    for (const q of [a, b, c]) {
      pos.push(q.x, q.y, q.z);
      if (ay >= ax && ay >= az) uv.push(q.x / tile, q.z / tile); else if (ax >= az) uv.push(q.z / tile, q.y / tile); else uv.push(q.x / tile, q.y / tile);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute([...side, ...top], 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute([...sUv, ...tUv], 2));
  out.computeVertexNormals();
  out.addGroup(0, side.length / 3, 0);
  out.addGroup(side.length / 3, top.length / 3, 1);
  return out;
}

/** a kelp plant: a wavy stipe with blades alternating up it and gold gas bladders; local y = height */
function kelpGeo(h: number, seed: number) {
  const L = new Loft();
  const path: V3[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; path.push([Math.sin(t * 5 + seed) * 0.18 * t, t * h, Math.cos(t * 4 + seed * 2) * 0.14 * t]); }
  L.tube(path, (t) => 0.055 - t * 0.025, 4, { x: 0, y: 0, w: 0.25, h: 1 }, 0, { capStart: false, capEnd: true });
  const nb = Math.floor((h - 1.2) / 0.62);
  for (let i = 0; i < nb; i++) {
    const t = (0.9 + i * 0.62) / h, y = t * h;
    const sp = path[Math.min(10, Math.round(t * 10))];
    const ph = i * 2.39996 + seed, dir: V3 = [Math.cos(ph), 0, Math.sin(ph)];
    const len = 0.9 + hash2(i, seed, 3) * 0.5 - t * 0.25, w = 0.12 + hash2(i, seed, 4) * 0.06;
    const rows: V3[][] = [];
    for (let k = 0; k <= 4; k++) {
      const s = k / 4, r = len * s;
      const up = Math.sin(0.75) * r - s * s * 0.25 * len;
      const cx = sp[0] + dir[0] * Math.cos(0.75) * r, cz = sp[2] + dir[2] * Math.cos(0.75) * r;
      const ww = w * Math.sin(Math.min(1, s * 1.3 + 0.15) * Math.PI) + 0.01;
      rows.push([[cx - dir[2] * ww, y + up, cz + dir[0] * ww], [cx + dir[2] * ww, y + up, cz - dir[0] * ww]]);
    }
    L.sheet(rows, { x: 0.25, y: 0, w: 0.75, h: 1 }, 1);
  }
  return L.build();
}
const KELP_T = { value: 0 };
/** the swaying kelp material: bends with height (local y), phase from the plant's world position */
function kelpMat() {
  const m = psxMat(KELP(), { rough: 0.8, side: THREE.DoubleSide, alphaTest: 0.5, sss: [0.8, 1, 0.4], sssK: 0.6 });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uKelpT = KELP_T;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uKelpT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 o0 = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float hh = max(0.0, position.y), ph = o0.x * 0.37 + o0.z * 0.29;
          transformed.x += (sin(uKelpT * 0.55 + ph + hh * 0.16) * 0.7 + sin(uKelpT * 1.3 + ph * 2.0 + hh * 0.4) * 0.15) * hh * hh * 0.0065;
          transformed.z += cos(uKelpT * 0.42 + ph * 1.3 + hh * 0.13) * hh * hh * 0.0045;
        }`);
  };
  m.customProgramCacheKey = chainKey(m, prev, '|kelpSway');
  return m;
}

function fishGeo() {
  const g = new THREE.BufferGeometry();
  const P: number[] = [
    0.18, 0, 0, 0, 0.05, 0, 0, 0, 0.025, 0.18, 0, 0, 0, 0, 0.025, 0, -0.05, 0, 0.18, 0, 0, 0, -0.05, 0, 0, 0, -0.025, 0.18, 0, 0, 0, 0, -0.025, 0, 0.05, 0,
    0, 0.05, 0, -0.14, 0, 0, 0, 0, 0.025, 0, 0, 0.025, -0.14, 0, 0, 0, -0.05, 0, 0, -0.05, 0, -0.14, 0, 0, 0, 0, -0.025, 0, 0, -0.025, -0.14, 0, 0, 0, 0.05, 0,
    -0.12, 0, 0, -0.22, 0.06, 0, -0.22, -0.06, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const uv: number[] = [];
  for (let i = 0; i < P.length / 3; i++) uv.push(0.5 - P[i * 3] * 2, 0.5 + P[i * 3 + 1] * 7);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function whaleGeo() {
  const L = new Loft();
  const prof: [number, number, number][] = [[-7, 0.15, 0.1], [-5.5, 0.55, 0.45], [-3.5, 1.1, 0.9], [-1, 1.5, 1.3], [1.5, 1.55, 1.35], [3.5, 1.3, 1.1], [5.2, 0.9, 0.75], [6.4, 0.45, 0.4], [7, 0.1, 0.1]];
  const rings = prof.map(([x, ry, rz], i) => {
    const pts: V3[] = [];
    for (let j = 0; j <= 8; j++) { const a = (j / 8) * TAU; pts.push([x, Math.cos(a) * ry * (Math.cos(a) < 0 ? 0.85 : 1), Math.sin(a) * rz]); }
    return { pts, v: i / (prof.length - 1) };
  });
  L.loft(rings, Array.from({ length: 9 }, (_, j) => j / 8), { x: 0, y: 0, w: 1, h: 1 }, 0);
  // long humpback flippers
  for (const s of [-1, 1]) L.sheet([[[2.5, -0.6, s * 1.1], [1.6, -0.7, s * 1.2]], [[1.2, -1.4, s * 3.6], [0.4, -1.4, s * 3.7]], [[0.2, -1.9, s * 5.0], [-0.3, -1.9, s * 5.0]]], { x: 0, y: 0, w: 1, h: 1 }, 1);
  return L.build();
}
function flukeGeo() {
  const L = new Loft();
  L.sheet([[[0, 0, -0.2], [0, 0, 0.2]], [[-1.2, 0.05, -1.6], [-1.0, 0.05, 1.6]], [[-1.9, 0.1, -2.6], [-1.6, 0.1, 2.6]]], { x: 0, y: 0, w: 1, h: 1 }, 0);
  return L.build();
}

// ------------------------------------------------------------------ the set
interface School { mesh: THREE.InstancedMesh; c: THREE.Vector3; r: number; sp: number; ph: number; fish: { a: number; o: THREE.Vector3; s: number }[] }

export class HeroSet {
  group = new THREE.Group();
  hero: CosmeticPuppet;
  H = HERO_AT.clone();
  light = new Lighting(1024, 4);
  fx = new Particles();
  snow = new Motes(320, 'dot', '#b8dce4');
  bubbles = new Motes(160, 'bubble', '#d8f8ff');
  private rays: { m: THREE.Mesh; ph: number; base: number }[] = [];
  private schools: School[] = [];
  private whale = new THREE.Group();
  private fluke = new THREE.Group();
  private boats: { g: THREE.Group; x0: number; sp: number; lines: THREE.Line[] }[] = [];
  private surfTex: THREE.Texture;
  private lamp: ReturnType<Lighting['lamp']> = null;
  private lantern: THREE.Mesh;
  private interior: THREE.MeshBasicMaterial;
  private hatchVents: THREE.Vector3[] = [];
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private s = new THREE.Vector3();
  whaleT = 38;
  /** the whale just sang (screen plays a call) */
  onWhale?: () => void;

  constructor() {
    const G = this.group, H = this.H;
    G.add(this.light.group, this.fx.object, this.snow.points, this.bubbles.points);
    const rockM = [psxMat(rockPage(false), { rough: 0.95 }), psxMat(rockPage(true), { rough: 0.95, sss: [0.6, 1, 0.5], sssK: 0.15 })];
    // rocks get only a hint of the play-plane rim light (it made them look like glass)
    for (const m of rockM) (m.userData.uw as { uMatRimG: { value: number } }).uMatRimG.value = 0.12;
    const rock = (seed: number, at: V3, s: V3, detail = 1, rough = 0.5, rotY = 0, flat: { top?: number; front?: number } = {}, shadow = true) => {
      const m = new THREE.Mesh(boulder(seed, s[0], s[1], s[2], detail, rough, flat), rockM);
      m.position.set(H.x + at[0], H.y + at[1], H.z + at[2]); m.rotation.y = rotY;
      m.castShadow = shadow; m.receiveShadow = true;
      G.add(m); return m;
    };
    // ---- the outcrop: the hideout's rock mass behind and right, the ledge under the hero, a column down into the blue
    rock(1, [0.5, -0.4, -0.7], [2.5, 0.7, 2.2], 2, 0.3, 0.2, { top: 0.55 });           // the ledge slab: a flat shelf at the hero's feet
    rock(2, [1.7, 1.2, -4.3], [3.2, 3.2, 2.1], 2, 0.35, 0, { front: 0.6 });         // the hideout's face, the hatch set in it
    rock(3, [5.2, 1.6, -2.9], [2.4, 3.4, 2.4], 2, 0.4, 0.6);
    rock(4, [1.6, 4.0, -5.4], [3.2, 2.0, 2.6], 1, 0.4, 1.2);
    rock(6, [-1.4, 3.0, -5.6], [2.0, 2.6, 1.8], 1, 0.4, 0.4);
    rock(7, [0.7, -3.0, -1.6], [2.3, 2.6, 2.0], 1, 0.35, 0, {}, false);               // the column below the ledge
    rock(8, [1.8, -7.4, -2.6], [3.4, 3.4, 3.0], 1, 0.4, 1, {}, false);
    rock(9, [4.6, -0.7, 0.9], [1.5, 1.2, 1.3], 1, 0.4, 2);
    rock(11, [1.75, 0.02, 0.75], [0.26, 0.18, 0.24], 1, 0.4, 1);          // a pebble on the lip
    rock(12, [2.75, 0.18, -1.6], [0.62, 0.5, 0.55], 1, 0.4, 2);
    // far pinnacles and the seafloor fading into the blue
    for (let i = 0; i < 9; i++) {
      const a = -2.4 + i * 0.42 + hash2(i, 1, 4) * 0.2, r = 26 + hash2(i, 2, 4) * 30;
      const hgt = 8 + hash2(i, 3, 4) * 14;
      rock(20 + i, [Math.cos(a) * r, -14 + hgt * 0.4, Math.sin(a) * r - 10], [2.4 + hash2(i, 4, 4) * 3, hgt, 2.4 + hash2(i, 5, 4) * 3], 1, 0.6, i, {}, false);
    }
    const floor = new THREE.PlaneGeometry(220, 220, 22, 22);
    floor.rotateX(-Math.PI / 2);
    const FP = floor.attributes.position as THREE.BufferAttribute, FU = floor.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < FP.count; i++) { const x = FP.getX(i), z = FP.getZ(i); FP.setY(i, (fbm(x * 0.05, z * 0.05, 3, 9) - 0.5) * 5); FU.setXY(i, x / 3, z / 3); }
    floor.computeVertexNormals();
    const sand = psxMat(SAND(), { rough: 1 });
    (sand.map as THREE.Texture).wrapS = (sand.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
    const fl = new THREE.Mesh(facet(floor), sand); fl.position.set(H.x - 10, H.y - 15, H.z - 20); fl.receiveShadow = true;
    G.add(fl);

    // ---- the hideout hatch in the rock face: a dark round recess, warm light inside, the round door swung open
    const door = new THREE.Group();
    door.position.set(H.x + 1.35, H.y + 0.92, H.z - 2.62);
    door.rotation.y = -0.12;
    G.add(door);
    this.interior = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(1.6) });
    const recess = new THREE.Mesh(new THREE.CircleGeometry(0.78, 10), this.interior); recess.position.z = -0.25; door.add(recess);
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.8, 0.5, 10, 1, true), psxMat(rockPage(false), { rough: 0.95, side: THREE.BackSide }));
    tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -0.02; door.add(tunnel);
    const ring = new THREE.Mesh(facet(new THREE.TorusGeometry(0.84, 0.08, 4, 12)), psxMat(BRASS(), { metal: 0.3, rough: 0.6, color: '#8a7458' }));
    ring.position.z = 0.1; ring.castShadow = true; door.add(ring);
    // a rough stone collar round the ring so it sits in the rock face
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.2; const st = new THREE.Mesh(boulder(40 + i, 0.32, 0.26, 0.22, 0, 0.4), rockM); st.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, -0.02); st.rotation.z = a; door.add(st); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const b = new THREE.Mesh(facet(new THREE.OctahedronGeometry(0.045, 0)), psxMat(BRASS(), { metal: 0.35, rough: 0.5 })); b.position.set(Math.cos(a) * 0.84, Math.sin(a) * 0.84, 0.17); door.add(b); }
    const hinge = new THREE.Group(); hinge.position.set(0.86, 0, 0.14); hinge.rotation.y = 1.75; door.add(hinge);
    const leaf = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.76, 0.76, 0.1, 12)), [psxMat(HATCH(), { rough: 0.8 }), psxMat(HATCH(), { rough: 0.8 }), psxMat(HATCH(), { rough: 0.8 })]);
    leaf.rotation.x = Math.PI / 2; leaf.position.x = -0.78; leaf.castShadow = true; hinge.add(leaf);
    const wheel = new THREE.Mesh(facet(new THREE.TorusGeometry(0.2, 0.035, 4, 8)), psxMat(BRASS(), { metal: 0.7, rough: 0.35 }));
    wheel.position.set(-0.78, 0, 0.08); hinge.add(wheel);
    // a lantern on a bracket beside the hatch
    const lantern = new THREE.Group(); lantern.position.set(H.x + 2.55, H.y + 1.5, H.z - 2.3); G.add(lantern);
    const cage = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.11, 0.13, 0.26, 6)), psxMat(null, { color: '#2a2622', metal: 0.4, rough: 0.5 }));
    cage.scale.set(1, 1, 1); lantern.add(cage);
    this.lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.2, 6), new THREE.MeshBasicMaterial({ map: GLOWP(), color: new THREE.Color(2.2, 1.6, 0.9) }));
    lantern.add(this.lantern);
    const cap = new THREE.Mesh(facet(new THREE.ConeGeometry(0.15, 0.12, 6)), psxMat(BRASS(), { metal: 0.6, rough: 0.4 })); cap.position.y = 0.18; lantern.add(cap);
    this.lamp = this.light.lamp(H.x + 1.2, H.y + 1.05, H.z - 1.9, '#ffa850', 4, 6);
    for (let i = 0; i < 3; i++) this.hatchVents.push(new THREE.Vector3(H.x + 1.0 + i * 0.35, H.y + 1.9, H.z - 2.5));

    // ---- kelp: a forest rising from the slope below and the far shelf, a few near the camera
    const km = kelpMat();
    const kelp = (x: number, y: number, z: number, h: number, seed: number) => { const m = new THREE.Mesh(kelpGeo(h, seed), km); m.position.set(x, y, z); G.add(m); };
    const KS: [number, number, number, number][] = [
      [-5.5, -16, -2.5, 15], [-7.2, -17, -5.5, 16], [-4.2, -15, -7.5, 13], [-9.5, -18, -3, 17], [-11, -18, -9, 16], [-6.5, -16, 2.2, 13],
      [-14, -20, -14, 18], [-18, -20, -6, 17], [-20, -21, -18, 18], [-24, -21, -10, 19], [-9, -19, -16, 16], [-3.2, -14, -10, 12],
      [9.5, -16, -6, 12], [12, -18, -9, 14], [-2.6, -12.5, 3.6, 9],
    ];
    KS.forEach(([x, y, z, h], i) => kelp(H.x + x, y, H.z + z, h, i * 1.7));

    // ---- fish schools
    const fm = psxMat(FISH(), { rough: 0.35, metal: 0.3, side: THREE.DoubleSide });
    const school = (n: number, c: V3, r: number, sp: number) => {
      const mesh = new THREE.InstancedMesh(fishGeo(), fm, n);
      mesh.frustumCulled = false;
      const fish = Array.from({ length: n }, (_, i) => ({ a: hash2(i, 1, n) * TAU, o: new THREE.Vector3((hash2(i, 2, n) - 0.5) * 1.6, (hash2(i, 3, n) - 0.5) * 1.1, (hash2(i, 4, n) - 0.5) * 1.6), s: 0.8 + hash2(i, 5, n) * 0.5 }));
      this.schools.push({ mesh, c: new THREE.Vector3(H.x + c[0], H.y + c[1], H.z + c[2]), r, sp, ph: c[0], fish });
      G.add(mesh);
    };
    school(46, [-7, 2.5, -6], 3.2, 0.32);
    school(60, [-18, 5, -24], 6, -0.18);
    school(24, [6, 4.5, -9], 2.2, 0.45);

    // ---- a humpback crossing far off
    const wm = psxMat(WHALE(), { rough: 0.8 });
    const body = new THREE.Mesh(whaleGeo(), wm);
    this.fluke.add(new THREE.Mesh(flukeGeo(), psxMat(WHALE(), { rough: 0.8, side: THREE.DoubleSide })));
    this.fluke.position.x = -7;
    this.whale.add(body, this.fluke);
    this.whale.scale.setScalar(1.25);
    G.add(this.whale);

    // ---- the surface far above: bright rippling light, boat hulls with their lines hanging into the deep
    this.surfTex = SURFACE();
    this.surfTex.repeat.set(14, 14);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: this.surfTex, color: new THREE.Color(1.25, 1.35, 1.4), side: THREE.DoubleSide }));
    surf.rotation.x = Math.PI / 2; surf.position.set(H.x, 0.05, H.z - 40);
    G.add(surf);
    const hullM = psxMat(HULL(), { rough: 0.85 });
    const boat = (x: number, z: number, len: number, sp: number) => {
      const g = new THREE.Group();
      const hull = new THREE.SphereGeometry(1, 10, 4, 0, TAU, Math.PI / 2, Math.PI / 2);
      hull.scale(len / 2, 0.9, len / 6.5);
      const m = new THREE.Mesh(facet(hull), hullM); g.add(m);
      const keel = new THREE.Mesh(facet(new THREE.BoxGeometry(len * 0.8, 0.35, 0.12)), hullM); keel.position.y = -0.95; g.add(keel);
      const lines: THREE.Line[] = [];
      for (let k = 0; k < 2; k++) {
        const depth = 6 + k * 4.5 + hash2(x, k, 3) * 3;
        const lg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(0, -(i / 8) * depth, 0)));
        const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#d8e8e0', transparent: true, opacity: 0.7 }));
        ln.position.set(len * (k ? 0.3 : -0.25), 0, len * 0.12);
        const hook = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 0.9) }));
        hook.position.y = -depth; ln.add(hook);
        g.add(ln); lines.push(ln);
      }
      g.position.set(x, -0.1, z);
      G.add(g);
      this.boats.push({ g, x0: x, sp, lines });
    };
    boat(H.x - 6, H.z - 14, 6.5, 0.25);
    boat(H.x + 9, H.z - 20, 8, -0.15);
    boat(H.x - 24, H.z - 34, 7, 0.2);

    // ---- god ray cards (the post pipeline marches its own shafts too)
    const rt = RAY();
    for (let i = 0; i < 6; i++) {
      const w = 1.6 + hash2(i, 1, 6) * 2.2, h = 24 + hash2(i, 2, 6) * 10;
      const mat = new THREE.MeshBasicMaterial({ map: rt, color: '#d8fff4', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.geometry.translate(0, -h / 2, 0);
      m.position.set(H.x - 14 + i * 4.6 + hash2(i, 3, 6) * 2, 0, H.z - 5 - hash2(i, 4, 6) * 16);
      m.rotation.z = -0.3;
      m.renderOrder = 8;
      G.add(m);
      this.rays.push({ m, ph: hash2(i, 5, 6) * 10, base: 0.12 + hash2(i, 6, 6) * 0.12 });
    }

    // ---- the hero
    this.hero = new CosmeticPuppet();
    this.hero.root.position.copy(H);
    this.hero.root.rotation.y = HERO_YAW;
    this.hero.play('idle');
    this.hero.setExpression('cool');
    this.hero.current.set(-4.2, -0.7);
    this.hero.model.weaponCtl = 'external';
    this.hero.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    G.add(this.hero.root);

    // lights: the key from the surface (upper left, behind), a cool fill from the camera side, warm hatch light
    const L = this.light;
    L.sun.position.copy(H).addScaledVector(new THREE.Vector3(-0.45, 1, 0.25).normalize(), 40);
    L.sun.target.position.copy(H); L.sun.target.updateMatrixWorld();
    const sc = L.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.updateProjectionMatrix();
    L.fill.position.copy(H).add(new THREE.Vector3(-8, 4, 14)); L.fill.target.position.copy(H); L.fill.target.updateMatrixWorld();
    for (let i = 0; i < 260; i++) this.snow.emit(H.x + (Math.random() - 0.5) * 24, H.y + (Math.random() - 0.3) * 16, H.z + (Math.random() - 0.6) * 22, { life: 6 + Math.random() * 12, size: 0.03 + Math.random() * 0.035 });
  }

  /** sun direction for the shafts, in air (applied by the screen with the look) */
  static SUN_AIR = new THREE.Vector3(-0.38, 0.62, -0.42);

  update(dt: number, t: number, cam: THREE.Camera) {
    const H = this.H;
    KELP_T.value = t;
    this.fx.update(dt);
    this.light.tick();
    // shafts breathe and turn to the camera around their long axis
    for (const r of this.rays) {
      r.m.rotation.y = Math.atan2(cam.position.x - r.m.position.x, cam.position.z - r.m.position.z);
      (r.m.material as THREE.MeshBasicMaterial).opacity = r.base * (0.6 + 0.4 * Math.sin(t * 0.3 + r.ph));
    }
    this.surfTex.offset.set(t * 0.004, t * 0.0025);
    // fish schools: a swirling loop round a drifting centre
    for (const sc of this.schools) {
      const c = this.v.set(sc.c.x + Math.sin(t * 0.07 + sc.ph) * 2.5, sc.c.y + Math.sin(t * 0.11 + sc.ph) * 0.8, sc.c.z + Math.cos(t * 0.06 + sc.ph) * 2);
      sc.fish.forEach((f, i) => {
        const a = f.a + t * sc.sp;
        const x = c.x + Math.cos(a) * sc.r + f.o.x, y = c.y + Math.sin(a * 2 + i) * 0.3 + f.o.y, z = c.z + Math.sin(a) * sc.r * 0.6 + f.o.z;
        const dx = -Math.sin(a) * sc.sp, dz = Math.cos(a) * sc.r * 0.6 / sc.r * sc.sp;
        this.e.set(0, Math.atan2(-dz, dx), Math.sin(t * 9 + i) * 0.15);
        this.q.setFromEuler(this.e);
        this.m4.compose(this.s.set(x, y, z), this.q, new THREE.Vector3(f.s, f.s, f.s));
        sc.mesh.setMatrixAt(i, this.m4);
      });
      sc.mesh.instanceMatrix.needsUpdate = true;
    }
    // the whale: a slow pass far off, fluke beating
    this.whaleT += dt;
    const wk = (this.whaleT % 150) / 150;
    this.whale.position.set(H.x - 75 + wk * 120, H.y + 4 + Math.sin(wk * Math.PI) * 3, H.z - 40);
    this.whale.rotation.set(0, 0.08, Math.sin(this.whaleT * 0.4) * 0.03);
    this.fluke.rotation.z = Math.sin(this.whaleT * 0.9) * 0.35;
    if (Math.abs((this.whaleT % 150) - 55) < dt) this.onWhale?.();
    // boats bob and drift; lines sway
    for (const b of this.boats) {
      b.g.position.x = b.x0 + Math.sin(t * 0.02 * Math.sign(b.sp) + b.x0) * 6;
      b.g.rotation.z = Math.sin(t * 0.7 + b.x0) * 0.04; b.g.rotation.x = Math.sin(t * 0.5 + b.x0) * 0.03;
      b.lines.forEach((l, k) => { l.rotation.z = Math.sin(t * 0.4 + k + b.x0) * 0.06; l.rotation.x = Math.cos(t * 0.33 + k) * 0.05; });
    }
    // warm hatch light flickers, the lantern glows, bubbles leak from the rock
    const fl = 0.85 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 17);
    if (this.lamp) this.lamp.light.intensity = 4 * fl;
    (this.lantern.material as THREE.MeshBasicMaterial).color.setRGB(2.2 * fl, 1.6 * fl, 0.9 * fl);
    this.interior.color.setRGB(1.6 * fl, 1.05 * fl, 0.55 * fl);
    for (const p of this.hatchVents) if (Math.random() < dt * 1.2) this.bubbles.emit(p.x + (Math.random() - 0.5) * 0.4, p.y, p.z, { vy: 0.25, life: 7, size: 0.04 + Math.random() * 0.06 });
    if (Math.random() < dt * 2) this.bubbles.emit(H.x - 3 + Math.random() * 6, H.y - 6, H.z - 4 + Math.random() * 4, { vy: 0.4, life: 9, size: 0.05 + Math.random() * 0.05 });
    // marine snow keeps falling around the hero
    if (Math.random() < dt * 22) this.snow.emit(H.x + (Math.random() - 0.5) * 24, H.y + 8 + Math.random() * 3, H.z + (Math.random() - 0.6) * 22, { life: 14, size: 0.03 + Math.random() * 0.035 });
    this.snow.update(dt, t, 'drift');
    this.bubbles.update(dt, t, 'rise');
  }

  setScale(px: number) { this.snow.setScale(px); this.bubbles.setScale(px); }
  dispose() { this.lamp?.release(); }
}
