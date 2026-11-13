// The painted icon extruded into a voxel object: every opaque pixel becomes a column whose thickness grows
// with its distance from the silhouette (a stepped, pillowy bevel), front/back faces are greedy-merged into
// rectangles textured with the icon, side walls take each edge pixel's own colour. Rare items carry a gentle
// twinkle. Geometry + material are cached per item/level; each call returns a cheap new Object3D.
import * as THREE from 'three';
import type { ItemDef } from '../game/items';
import { uw } from '../gfx/shaders/underwater';
import { Px } from '../gfx/px';

export const VOXEL_CELL_M = 0.5;
/** emission masks painted alongside icons (set by icons.ts) */
export const EMIT_MASK = new WeakMap<HTMLCanvasElement, Uint8Array>();

interface Built { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; w: number; h: number; spots: [number, number][]; depth: number }
const cache = new Map<string, Built>();

function build(d: ItemDef, level: number, icon: HTMLCanvasElement): Built {
  const W = icon.width, H = icon.height;
  const img = icon.getContext('2d')!.getImageData(0, 0, W, H).data;
  const A = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) A[i] = img[i * 4 + 3] > 20 ? 1 : 0;
  // chamfer distance to transparency (4-neighbour, in pixels)
  const D = new Int16Array(W * H);
  const q: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!A[i]) continue;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || !A[i - 1] || !A[i + 1] || !A[i - W] || !A[i + W];
    if (edge) { D[i] = 1; q.push(i); } else D[i] = 0;
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || !A[j] || D[j]) continue;
      D[j] = D[i] + 1; q.push(j);
    }
  }
  const thick = d.thick ?? 1;
  const maxL = Math.max(1, Math.round(4 * thick));
  const L = new Int8Array(W * H);
  for (let i = 0; i < W * H; i++) if (A[i]) L[i] = Math.min(maxL, 1 + Math.floor((D[i] - 1) / 2));
  const px = VOXEL_CELL_M / 32, dz = px * 0.75;
  const P: number[] = [], N: number[] = [], UV: number[] = [], C: number[] = [], I: number[] = [];
  const X = (x: number) => (x - W / 2) * px, Y = (y: number) => (H / 2 - y) * px;
  const quad = (v: number[][], n: number[], uv: number[][], col: number) => {
    const b = P.length / 3;
    for (let k = 0; k < 4; k++) { P.push(v[k][0], v[k][1], v[k][2]); N.push(n[0], n[1], n[2]); UV.push(uv[k][0], uv[k][1]); C.push(col, col, col); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // front / back: greedy rectangles of equal depth
  const seen = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!A[i] || seen[i]) continue;
    const l = L[i];
    let w = 1; while (x + w < W && A[i + w] && !seen[i + w] && L[i + w] === l) w++;
    let h = 1;
    outer: while (y + h < H) { for (let k = 0; k < w; k++) { const j = (y + h) * W + x + k; if (!A[j] || seen[j] || L[j] !== l) break outer; } h++; }
    for (let yy = 0; yy < h; yy++) for (let k = 0; k < w; k++) seen[(y + yy) * W + x + k] = 1;
    const x0 = X(x), x1 = X(x + w), y0 = Y(y), y1 = Y(y + h), z = l * dz;
    const u0 = x / W, u1 = (x + w) / W, v0 = 1 - y / H, v1 = 1 - (y + h) / H;
    quad([[x0, y1, z], [x1, y1, z], [x1, y0, z], [x0, y0, z]], [0, 0, 1], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], 1);
    quad([[x1, y1, -z], [x0, y1, -z], [x0, y0, -z], [x1, y0, -z]], [0, 0, -1], [[u1, v1], [u0, v1], [u0, v0], [u1, v0]], 0.62);
  }
  const depthAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : L[y * W + x]);
  const wall = (ax: number, ay: number, bx: number, by: number, z0: number, z1: number, n: number[], uvA: number[], uvB: number[], col: number) => {
    // a vertical wall from point a to point b (in pixel coords), spanning z0..z1, facing n
    const A0 = [X(ax), Y(ay)], B0 = [X(bx), Y(by)];
    const v = [[A0[0], A0[1], z0], [B0[0], B0[1], z0], [B0[0], B0[1], z1], [A0[0], A0[1], z1]];
    // wind so the face points along n
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], 0], e2 = [0, 0, z1 - z0];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], 0];
    const ok = cr[0] * n[0] + cr[1] * n[1] >= 0;
    if (ok) quad(v, n, [uvA, uvB, uvB, uvA], col); else quad([v[1], v[0], v[3], v[2]], n, [uvB, uvA, uvA, uvB], col);
  };
  const sideWalls = (dp: number, dn: number, emit: (z0: number, z1: number) => void) => {
    if (dn === 0) emit(-dp * dz, dp * dz);
    else { emit(dn * dz, dp * dz); emit(-dp * dz, -dn * dz); }
  };
  // vertical edges (left / right walls), merged along y
  for (const side of [-1, 1]) for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      const dp = depthAt(x, y), dn = depthAt(x + side, y);
      if (!dp || dp <= dn) { y++; continue; }
      let y1 = y + 1; while (y1 < H && depthAt(x, y1) === dp && depthAt(x + side, y1) === dn) y1++;
      const ex = side > 0 ? x + 1 : x, u = (x + 0.5) / W;
      const col = side < 0 ? 0.86 : 0.7;
      sideWalls(dp, dn, (z0, z1) => wall(ex, y, ex, y1, z0, z1, [side, 0, 0], [u, 1 - y / H], [u, 1 - y1 / H], col));
      y = y1;
    }
  }
  // horizontal edges (top / bottom walls), merged along x
  for (const side of [-1, 1]) for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const dp = depthAt(x, y), dn = depthAt(x, y + side);
      if (!dp || dp <= dn) { x++; continue; }
      let x1 = x + 1; while (x1 < W && depthAt(x1, y) === dp && depthAt(x1, y + side) === dn) x1++;
      const ey = side > 0 ? y + 1 : y, v = 1 - (y + 0.5) / H;
      const col = side < 0 ? 0.95 : 0.62;
      sideWalls(dp, dn, (z0, z1) => wall(x, ey, x1, ey, z0, z1, [0, -side, 0], [x / W, v], [x1 / W, v], col));
      x = x1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();

  // texture: bleed colours into transparent texels so mips never darken the edges
  const bleed = new Px(W, H);
  bleed.d.set(img);
  for (let pass = 0; pass < 3; pass++) {
    const src = bleed.d.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = (yy * W + xx) * 4; if (!src[j + 3]) continue;
        r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
      }
      if (n) { bleed.d[i] = r / n; bleed.d[i + 1] = g / n; bleed.d[i + 2] = b / n; bleed.d[i + 3] = 1; }
    }
  }
  for (let i = 0; i < W * H; i++) if (bleed.d[i * 4 + 3] < 20) bleed.d[i * 4 + 3] = 0; else bleed.d[i * 4 + 3] = 255;
  for (let i = 0; i < W * H; i++) if (!A[i]) bleed.d[i * 4 + 3] = 255; // opaque texture; geometry defines the shape
  const tex = bleed.texture();
  const look = d.look;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, vertexColors: true,
    roughness: look === 'gem' ? 0.38 : look === 'metal' ? 0.5 : look === 'glass' ? 0.3 : look === 'wood' ? 0.92 : look === 'soft' ? 0.78 : 0.68,
    metalness: look === 'metal' ? 0.12 : 0,
  });
  const em = EMIT_MASK.get(icon);
  if (d.glow && em) {
    const ep = new Px(W, H);
    for (let i = 0; i < W * H; i++) if (em[i]) { ep.d[i * 4] = img[i * 4]; ep.d[i * 4 + 1] = img[i * 4 + 1]; ep.d[i * 4 + 2] = img[i * 4 + 2]; }
    for (let i = 0; i < W * H; i++) ep.d[i * 4 + 3] = 255;
    mat.emissiveMap = ep.texture();
    mat.emissive = new THREE.Color(1, 1, 1);
    mat.emissiveIntensity = d.glow;
  } else if (look === 'gem') {
    mat.emissiveMap = tex; mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = 0.05;
  }
  uw(mat, { rim: look === 'gem' || look === 'glass' ? 0.3 : 0.12 });
  // twinkle spots: the brightest opaque pixels
  const spots: [number, number][] = [];
  const lumOf = (i: number) => img[i * 4] * 0.3 + img[i * 4 + 1] * 0.55 + img[i * 4 + 2] * 0.15;
  const cand: number[] = [];
  for (let i = 0; i < W * H; i++) if (A[i] && lumOf(i) > 200) cand.push(i);
  cand.sort((a, b) => lumOf(b) - lumOf(a));
  for (let k = 0; k < Math.min(6, cand.length); k++) { const i = cand[Math.floor((k / 6) * cand.length)]; spots.push([X(i % W + 0.5), Y(((i / W) | 0) + 0.5)]); }
  return { geo, mat, w: W, h: H, spots, depth: maxL * dz };
}

let starTex: THREE.Texture | null = null;
function star(): THREE.Texture {
  if (starTex) return starTex;
  const p = new Px(16, 16);
  for (let i = -7; i <= 7; i++) { const a = 255 * Math.pow(1 - Math.abs(i) / 8, 1.5); p.set(8 + i, 8, '#fff8e0', a); p.set(8, 8 + i, '#fff8e0', a); }
  for (let i = -2; i <= 2; i++) { p.set(8 + i, 8 + i, '#ffffff', 120); p.set(8 + i, 8 - i, '#ffffff', 120); }
  p.rect(7, 7, 2, 2, '#ffffff');
  starTex = p.texture({ mip: false });
  return starTex;
}

const RARE = new Set(['rare', 'epic', 'legendary']);

export function voxelMesh(d: ItemDef, level: number, icon: HTMLCanvasElement): THREE.Object3D {
  const key = d.id + '|' + level;
  let b = cache.get(key);
  if (!b) { b = build(d, level, icon); cache.set(key, b); }
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(b.geo, b.mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
  g.userData = { id: d.id, level, w: b.w / 32, h: b.h / 32, mesh, depth: b.depth };
  if ((RARE.has(d.rarity) || level >= 2) && b.spots.length) {
    const spots = b.spots, z = b.depth + 0.01;
    const n = d.rarity === 'legendary' || level >= 3 ? 3 : d.rarity === 'epic' || level >= 2 ? 2 : 1;
    const col = level >= 3 ? '#ffe7a0' : d.rarity === 'epic' ? '#f0d0ff' : '#e8f8ff';
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star(), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const phase = Math.random() * 10, rate = 0.45 + Math.random() * 0.3;
      let spot = spots[k % spots.length];
      let lastCycle = -1;
      s.renderOrder = 30;
      s.onBeforeRender = () => {
        const t = performance.now() / 1000 * rate + phase + k * 0.37;
        const cyc = Math.floor(t);
        if (cyc !== lastCycle) { lastCycle = cyc; spot = spots[Math.floor(Math.random() * spots.length)]; s.position.set(spot[0], spot[1], z); }
        const f = t - cyc;
        const a = f < 0.35 ? Math.sin((f / 0.35) * Math.PI) : 0;
        const sz = 0.16 * a + 0.0001;
        s.scale.set(sz, sz, 1);
        s.material.opacity = a;
        s.material.rotation = f * 1.5;
      };
      s.position.set(spot[0], spot[1], z);
      g.add(s);
    }
  }
  return g;
}
