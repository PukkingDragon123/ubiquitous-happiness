// The title's art kit: painted pixel pages (layered basalt, sand, kelp, fish, whale, brass, god rays, the bright
// surface) and the low-poly geometry built on them (faceted boulders with mossy tops, swaying kelp plants, fish,
// a humpback and its fluke). Shared by the travelling shot (travel.ts) and the signpost (sign.ts).
import * as THREE from 'three';
import { Loft, type V3 } from '../gfx/loft';
import { Px, worley } from '../gfx/px';
import { type Look, LOOKS } from '../gfx/lighting';
import { chainKey } from '../gfx/retro';
import { psxMat, facet } from '../player/psx';
import { ctex, T, tone, rect } from '../skills/texkit';
import { fbm, hash2, TAU } from '../core/math';

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
export function rockPage(moss: boolean) {
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
export const SAND = () => ctex('titleSand', 32, 32, (p) => {
  const S = ['#4a4436', '#6a6250', '#8a8068', '#a89c80'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const r = (y + Math.round(Math.sin(x * 0.4) * 1.5)) % 6; p.set(x, y, tone(S, r === 0 ? 0 : r < 3 ? 2 : r < 5 ? 1 : 3)); }
});
/** kelp: the stipe (left quarter) and a blade (rest): olive-gold with a dark midrib, wrinkles, a ragged edge */
export const KELP = () => ctex('titleKelp', 64, 64, (p) => {
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
export const FISH = () => ctex('titleFish', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y < 5 ? '#2a4a6a' : y < 7 ? '#d8e8f0' : y < 9 ? '#5a90b0' : '#c0d8e4'); rect(p, 0, 7, 16, 1, '#f0c050'); });
export const WHALE = () => ctex('titleWhale', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.slate, y < 18 ? 1 + ((x * 3 + y) % 11 === 0 ? 1 : 0) : y < 20 ? 2 : (x % 3 === 0 ? 2 : 3)));
  for (const [x, y] of [[5, 6], [17, 9], [25, 4], [9, 14]]) { p.set(x, y, tone(T.slate, 3)); p.set(x + 1, y, tone(T.slate, 3)); }
});
export const HULL = () => ctex('titleHull', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.oak, y % 6 === 0 ? 0 : (x + Math.floor(y / 6) * 11) % 23 === 0 ? 1 : 1 + ((y >> 1) % 2))); rect(p, 0, 26, 32, 6, '#1a2a1e'); });
export const SURFACE = () => {
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
export const RAY = () => {
  const p = new Px(16, 64);
  p.fill((x, y) => { const k = Math.max(0, 1 - Math.abs(x - 7.5) / 8) * (1 - y / 64); const s = Math.floor(k * 5) / 5; return [Math.round(255 * s), Math.round(255 * s), Math.round(255 * s)]; });
  const t = p.texture({ mip: false }); t.colorSpace = THREE.NoColorSpace;
  return t;
};
export const BRASS = () => ctex('titleBrass', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(T.brass, x < 3 ? 4 : x > 12 ? 1 : (x + y) % 5 === 0 ? 2 : 3)); });
export const HATCH = () => ctex('titleHatch', 32, 32, (p) => {
  // the round door: iron-banded oak planks, a brass porthole ring painted round the edge
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.oak, x % 8 === 0 ? 0 : (x + y * 3) % 17 === 0 ? 1 : 2 + ((x >> 3) % 2)));
  for (const y of [8, 23]) { rect(p, 0, y, 32, 2, tone(T.iron, 2)); rect(p, 0, y, 32, 1, tone(T.iron, 4)); for (let x = 3; x < 32; x += 7) p.set(x, y + 1, tone(T.iron, 4)); }
});
export const GLOWP = () => ctex('titleGlow', 8, 8, (p) => { p.rect(0, 0, 8, 8, '#ffb860'); p.rect(2, 2, 4, 4, '#fff0c0'); });

// ------------------------------------------------------------------ geometry
const n3 = (x: number, y: number, z: number, s: number) => fbm(x + z * 1.71 + s * 7.3, y - z * 1.33 + s * 3.1, 3, s);
/** a faceted boulder: a displaced icosphere, flat bottom-ish, box-projected uvs; top faces get the mossy page */
export function boulder(seed: number, sx: number, sy: number, sz: number, detail = 1, rough = 0.5, flat: { top?: number; front?: number } = {}) {
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
export function splitByFacing(g: THREE.BufferGeometry, tile: number) {
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
export function kelpGeo(h: number, seed: number) {
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
export const KELP_T = { value: 0 };
/** the swaying kelp material: bends with height (local y), phase from the plant's world position */
export function kelpMat() {
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

export function fishGeo() {
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

export function whaleGeo() {
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
export function flukeGeo() {
  const L = new Loft();
  L.sheet([[[0, 0, -0.2], [0, 0, 0.2]], [[-1.2, 0.05, -1.6], [-1.0, 0.05, 1.6]], [[-1.9, 0.1, -2.6], [-1.6, 0.1, 2.6]]], { x: 0, y: 0, w: 1, h: 1 }, 0);
  return L.build();
}

