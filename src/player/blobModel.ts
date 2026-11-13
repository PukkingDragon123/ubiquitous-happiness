// Blobfish v2: a low-poly PS1-style blobfish that is cute AND cool. A soft gumdrop body (14 sides, a dozen
// rings, Gouraud-shaded jelly) under a 128 px painted skin page, the famous droopy nose as a chunky low-poly bulb,
// stubby fins, and an expressive painted pixel face on a decal wrapped round the front of the head (expressions
// are texture swaps, see face.ts). Gear (weapon, armour, hat, back item) comes from gear.ts; armour and cloth
// hats are skin-tight shells that squish with the 2D soft body (shader bend, blobShape.patchBlob).
//
//   const m = new BlobModel();  m.attach(space)          weapon pivot + cloth ribbons live in `space`
//   m.setGear({ weapon: 'staff', armor: 'robe', hat: 'wizardHat' })
//   m.play('waddle' | 'idle' | 'swim' | 'gearUp' | 'cheer' | 'hurt' | 'die')
//   m.update(dt, { sb, swim, time, vel })                 per frame (the controller / puppet drive the soft body)
//
// Body space: +x nose, +y up, +z toward the camera. The soft body (softbody.ts) bends the mesh via uSB[].
import * as THREE from 'three';
import { Loft, usFor, type V3 } from '../gfx/loft';
import { Px, ramp, hex, mix, worley, pxNoise } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { clamp01, smooth, hash2, TAU, damp } from '../core/math';
import { SB_N, NS, RINGS, prof, bodyPoint, FACE_C, addSB, sbAngle, makeBlobUniforms, patchBlob, type BlobUniforms } from './blobShape';
import { FacePainter, FACES, TH, PT, PB, eyeState } from './face';
import { Ribbon } from './ribbon';
import { buildWeapon, buildArmor, buildHat, buildBack, DEFAULT_GEAR, WEAPON_LEN, type BlobGear, type GearPart, type WeaponId } from './gear';

export { SB_N, outlineAt, prof, bodyPoint } from './blobShape';
/** v1 compat: a body-surface point at length t and angle a (0 = top, +pi/2 = +z side, pi = bottom), pushed `out` */
export function surf(t: number, a: number, out = 0): THREE.Vector3 { return new THREE.Vector3(...bodyPoint(t, 0.5 - a / TAU, out)); }
export { buildSword } from './gear';
export type { BlobGear } from './gear';

export type BlobAnim = 'idle' | 'swim' | 'waddle' | 'gearUp' | 'cheer' | 'hurt' | 'die';
export const BLOB_ANIMS: BlobAnim[] = ['idle', 'swim', 'waddle', 'gearUp', 'cheer', 'hurt', 'die'];
const ONE_SHOT: Partial<Record<BlobAnim, number>> = { hurt: 0.55, gearUp: 2.8 };

// ------------------------------------------------------------------ texture page (128 x 128, PS1 density)
const PAGE = 256;
const R_BODY = { x: 0, y: 0, w: 1, h: 0.5 };
const R_NOSE = { x: 0, y: 0.5, w: 0.5, h: 0.25 };
const R_FIN = { x: 0.5, y: 0.5, w: 0.25, h: 0.25 };
const R_TAIL = { x: 0.75, y: 0.5, w: 0.25, h: 0.25 };

let pageCache: { map: THREE.Texture; rock: THREE.Texture } | null = null;
// Real blobfish skin, painted as clean indexed pixel art (no dithering, no noise fill): translucent rose flesh,
// greyer on the back and paler on the belly, soft mottled blotches and freckles, the neck crease and sagging
// jowl folds with a lit lip above each crease, gill slits, the lateral line of pores, faint veins on the flanks
// and sparse wet glints along the back. The flat-shaded facets do the lighting; the page only carries the skin.
const SKIN = ['#4a2232', '#71364a', '#975062', '#bb6f7e', '#d68e96', '#e7abab', '#f2c6bf', '#fae1d6'].map((c) => hex(c));
const NOSE_SK = ['#55202f', '#813348', '#a94c60', '#ca6b7a', '#e08b93', '#eda9a9', '#f7c9c1', '#fde4da'].map((c) => hex(c));
const FIN_SK = ['#5a2436', '#8a4258', '#b8687a', '#d88d98', '#ecaeb0', '#f8d0c8'].map((c) => hex(c));
function paintPage() {
  if (pageCache) return pageCache;
  const p = new Px(PAGE, PAGE);
  const bw = PAGE, bh = PAGE * R_BODY.h;
  const idx = new Int8Array(bw * bh);
  const I = (x: number, y: number) => ((y * bw) + (((x % bw) + bw) % bw));
  const add = (x: number, y: number, d: number) => { if (y >= 0 && y < bh) idx[I(Math.round(x), Math.round(y))] += d; };
  const setI = (x: number, y: number, v: number) => { if (y >= 0 && y < bh) idx[I(Math.round(x), Math.round(y))] = v; };
  // base tone + blotches
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const u = x / bw, t = 1 - (y + 0.5) / bh, up = -Math.cos(u * TAU);
    let v = 4.2 - up * 0.5;                                // greyer back, paler belly
    if (up < -0.55) v += 0.6;
    v -= smooth(0.3, 0.02, t) * 1.3;                        // the tail stalk is deeper, more translucent
    v += smooth(0.9, 1, t) * 0.4;                           // the face is a touch paler
    // organic blotches on the back and flanks (domain-warped cells, two clean tones)
    const wx = x + Math.sin(y * 0.13) * 5, wy = y + Math.sin(x * 0.11 + 1.7) * 4;
    const [f1, , id] = worley(wx, wy, 22, 5, 0);
    if (up > -0.35 && id < 0.42 && f1 < 6.5 + id * 6) v -= 1;
    const [g1, , gid] = worley(x, y, 9, 11, 0);
    if (up > -0.1 && gid < 0.16 && g1 < 1.4) v -= 1.6;       // freckles
    idx[y * bw + x] = Math.round(v);
  }
  // neck crease (t = 0.6) and a shorter fold behind it: dark groove with a lit lip on the head side
  const crease = (t0: number, amp: number, minUp: number, dark: number) => {
    for (let x = 0; x < bw; x++) {
      const u = x / bw, up = -Math.cos(u * TAU);
      if (up < minUp) continue;
      const y = (1 - t0) * bh + Math.sin(u * TAU * 2) * amp;
      setI(x, y, dark); add(x, y - 1, 1);
    }
  };
  crease(0.6, 1.5, -0.45, 2);
  crease(0.645, 1, 0.25, 3);
  // jowl folds: curved creases round the lower cheeks, dipping toward the sides
  for (const [t0, dark] of [[0.8, 3], [0.87, 3], [0.925, 4]] as const) for (let x = 0; x < bw; x++) {
    const u = x / bw, up = -Math.cos(u * TAU);
    if (up > -0.05) continue;
    const y = (1 - t0) * bh + Math.pow(Math.sin(u * TAU), 2) * 4;
    setI(x, y, dark); add(x, y - 1, 1);
  }
  // loose-skin wrinkles on the head: short curved creases (dark groove, lit lip), hand-placed in rows
  for (let i = 0; i < 46; i++) {
    const u0 = hash2(i, 5, 61), t0 = 0.64 + hash2(i, 6, 61) * 0.3;
    const up0 = -Math.cos(u0 * TAU);
    if (up0 < -0.5) continue;
    const L = 5 + Math.floor(hash2(i, 7, 61) * 7), bend = (hash2(i, 8, 61) - 0.5) * 0.5;
    const x0 = u0 * bw, y0 = (1 - t0) * bh;
    for (let k = 0; k < L; k++) {
      const x = x0 + k - L / 2, y = y0 + (k - L / 2) * (k - L / 2) * bend * 0.12;
      setI(x, y, 3); add(x, y - 1, 1);
    }
  }
  // translucent jelly: paler soft patches where the flesh is thin (cheeks, flanks)
  for (let i = 0; i < 18; i++) {
    const cx = hash2(i, 1, 71) * bw, cy = (0.2 + hash2(i, 2, 71) * 0.7) * bh, rx = 5 + hash2(i, 3, 71) * 8, ry = 3 + hash2(i, 4, 71) * 4;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + Math.sin(x * 0.9 + y * 0.7) * 0.15;
      if (d < 1 && y >= 0 && y < bh && idx[I(x, y)] >= 3 && idx[I(x, y)] <= 4) add(x, y, 1);
    }
  }
  // gill slits: a bowed dark slit low on each flank with a pale rim behind it
  for (const s of [0.23, 0.77]) for (let k = -7; k <= 7; k++) {
    const x = s * bw + k, y = (1 - 0.665) * bh - (k * k) * 0.05;
    setI(x, y, 1); setI(x, y + 1, 6);
  }
  // lateral line: a dotted row of pores along each flank from the gill to the tail
  for (const s of [0.29, 0.71]) for (let y = Math.round((1 - 0.62) * bh); y < (1 - 0.12) * bh; y += 3) {
    const x = s * bw + Math.sin(y * 0.2) * 1.2;
    setI(x, y, 3);
  }
  // faint veins on the lower flanks: short wandering lines
  for (let i = 0; i < 10; i++) {
    let x = (i % 2 ? 0.17 : 0.83) * bw + (hash2(i, 1, 3) - 0.5) * 20, y = (0.25 + hash2(i, 2, 3) * 0.4) * bh;
    let a = (hash2(i, 3, 3) - 0.5) * 2;
    for (let n = 0; n < 14; n++) { add(x, y, -1); a += (hash2(n, i, 9) - 0.5) * 0.8; x += Math.cos(a); y += Math.sin(a) * 0.6; }
  }
  // pores clustered on the face and cheeks
  for (let y = 0; y < (1 - 0.82) * bh; y += 3) for (let x = 0; x < bw; x += 3) {
    if (hash2(x, y, 21) < 0.2) add(x + Math.floor(hash2(x, y, 22) * 2), y + 1, -1);
  }
  // wet glints along the back (where the key light catches the slime)
  for (let y = 4; y < bh - 8; y += 7) for (let x = 0; x < bw; x += 9) {
    const u = x / bw, up = -Math.cos(u * TAU);
    if (up < 0.55 || hash2(x, y, 31) > 0.3) continue;
    const gx = x + Math.floor(hash2(x, y, 32) * 5);
    setI(gx, y, 7); setI(gx + 1, y, 7); setI(gx, y + 1, 6);
  }
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) p.set(x, y, SKIN[Math.max(0, Math.min(7, idx[y * bw + x]))]);

  // nose: redder toward the tip, a glossy streak along the top, pores
  const nx0 = 0, ny0 = PAGE * 0.5, nw = PAGE * 0.5, nh = PAGE * 0.25;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const u = x / nw, t = 1 - (y + 0.5) / nh, top = Math.cos(u * TAU);
    let v = 3.9 + top * 0.5 - smooth(0.55, 1, t) * 0.9;
    const [f1, , id] = worley(x + Math.sin(y * 0.3) * 2, y, 12, 41, 0);
    if (id < 0.3 && f1 < 4) v -= 1;
    if (hash2(x >> 1, y >> 1, 43) < 0.07 && top < 0.7) v -= 1;
    if (top > 0.9 && t > 0.35 && t < 0.7 && hash2(x >> 1, y >> 1, 47) < 0.35) v = 6;
    p.set(nx0 + x, ny0 + y, NOSE_SK[Math.max(0, Math.min(7, Math.round(v)))]);
  }
  // pectoral fin: translucent membrane, rays fanning from the base, a dark scalloped rim (alpha-cut outside)
  const fx0 = PAGE * 0.5, fy0 = PAGE * 0.5, fw = PAGE * 0.25, fh = PAGE * 0.25;
  const fin = (x0: number, y0: number, tail: boolean) => {
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const u = x / (fw - 1), v = y / (fh - 1);
      const ang = (v - 0.5) * (tail ? 6 : 5) / (0.35 + u);
      const ray = Math.abs(Math.sin(ang * Math.PI)) < 0.2 && u > 0.08;
      const scal = Math.abs(Math.sin(v * Math.PI * (tail ? 6 : 5))) * 0.07;
      const notch = tail ? (Math.abs(v - 0.5) < 0.1 * u ? 0.12 : 0) : 0;
      const edge = u + Math.pow(Math.abs(v - 0.5) * 2, 2.4) * (tail ? 0.2 : 0.45) + scal + notch;
      if (edge > 1) continue;
      let k = 4 - u * 1.4;
      if (ray) k -= 1.2;
      if (edge > 0.93) k = 1;
      else if (u < 0.07) k = 2;
      p.set(x0 + x, y0 + y, FIN_SK[Math.max(0, Math.min(5, Math.round(k)))]);
    }
  };
  fin(fx0, fy0, false);
  fin(PAGE * 0.75, PAGE * 0.5, true);
  const map = p.texture({ mip: false });
  // rock skin for Rock Body: granite blocks with clean cracks
  const rk = new Px(64, 64);
  const RK = ['#2e2c2a', '#4f4b46', '#77716a', '#a39b90', '#cfc6b8'].map((c) => hex(c));
  rk.fill((x, y) => {
    const [f1, f2, id] = worley(x, y, 12, 7, 64);
    if (f2 - f1 < 1.1) return RK[0];
    let k = 2 + Math.round(id * 1.6 - f1 / 14);
    if (f2 - f1 < 2.2) k -= 1;
    return RK[Math.max(1, Math.min(4, k))];
  });
  pageCache = { map, rock: rk.texture({ repeat: true }) };
  return pageCache;
}

// ------------------------------------------------------------------ geometry
function buildBody(): THREE.BufferGeometry {
  const L = new Loft();
  const us = usFor(NS);
  const rings = RINGS.map((t) => ({ pts: us.map((u) => bodyPoint(t, u)), v: t }));
  const p0 = prof(0), p1 = prof(1);
  L.loft(rings, us, R_BODY, 0, { start: [p0.x - 0.01, p0.cy, 0], end: [p1.x + 0.01, p1.cy, 0], alt: true, startV: 0, endV: 1 });
  return addSB(L.build());
}

/** project a face-canvas direction (yaw th, pitch ph, degrees) from FACE_C */
const faceDir = (th: number, ph: number) => {
  const a = (th * Math.PI) / 180, b = (ph * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a));
};

function buildFace(body: THREE.BufferGeometry): { geo: THREE.BufferGeometry; hit: (th: number, ph: number, off?: number) => THREE.Vector3 } {
  const tmp = new THREE.Mesh(body, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  tmp.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const hit = (th: number, ph: number, off = 0) => {
    const d = faceDir(th, ph);
    rc.set(FACE_C, d);
    const h = rc.intersectObject(tmp, false)[0];
    if (!h) return FACE_C.clone().addScaledVector(d, 0.4);
    const n = h.face!.normal.clone();
    if (n.dot(d) < 0) n.negate();
    return h.point.clone().addScaledVector(n.lerp(d, 0.3).normalize(), off);
  };
  const NU = 18, NV = 12;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const th = (i / NU - 0.5) * 2 * TH, ph = PT - (j / NV) * (PT - PB);
    const p = hit(th, ph, 0.008);
    pos.push(p.x, p.y, p.z);
    uv.push(i / NU, 1 - j / NV);
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 2, d = a + NU + 1;
    // wind so the decal faces outward (+x toward the viewer of the face)
    idx.push(a, b, c, a, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // make sure normals point out of the head
  const nn = geo.attributes.normal as THREE.BufferAttribute;
  const c0 = new THREE.Vector3(), n0 = new THREE.Vector3();
  let flip = 0;
  for (let i = 0; i < nn.count; i++) { c0.fromBufferAttribute(geo.attributes.position as THREE.BufferAttribute, i).sub(FACE_C); n0.fromBufferAttribute(nn, i); flip += c0.dot(n0) < 0 ? 1 : -1; }
  if (flip > 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
  return { geo: addSB(geo), hit };
}

function buildNose(base: THREE.Vector3): THREE.BufferGeometry {
  // a droopy bulb: from inside the forehead, forward, then hanging down over the mouth
  const L = new Loft();
  const a = base.clone().add(new THREE.Vector3(-0.12, 0.03, 0)), b = base.clone().add(new THREE.Vector3(0.16, 0.0, 0)), c = base.clone().add(new THREE.Vector3(0.1, -0.27, 0));
  const path: V3[] = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const x = (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * b.x + s * s * c.x;
    const y = (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * b.y + s * s * c.y;
    path.push([x, y, 0]);
  }
  const r = (s: number) => {
    const bulb = 0.075 + 0.085 * smooth(0.15, 0.8, s);
    const cap = s > 0.72 ? Math.sqrt(Math.max(0, 1 - ((s - 0.72) / 0.28) ** 2)) : 1;
    return Math.max(0.006, bulb * cap);
  };
  L.tube(path, r, 7, R_NOSE, 1, { capStart: false, capEnd: true });
  const g = L.build();
  // widen the bulb sideways a touch (a blobfish nose is broader than tall)
  const pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * 1.28);
  g.computeVertexNormals();
  return addSB(g);
}

function finGeo(len: number, wid: number, cup: number, reg: { x: number; y: number; w: number; h: number }): THREE.BufferGeometry {
  const L = new Loft();
  const grid: V3[][] = [];
  const R = 3, C = 4;
  for (let i = 0; i < R; i++) {
    const v = i / (R - 1);
    const row: V3[] = [];
    for (let j = 0; j < C; j++) {
      const u = j / (C - 1);
      row.push([u * len, (v - 0.5) * wid * (0.45 + u * 0.75), Math.sin(u * Math.PI) * cup * (0.5 - Math.abs(v - 0.5))]);
    }
    grid.push(row);
  }
  L.sheet(grid, reg, 0);
  return L.build();
}

// ------------------------------------------------------------------ eyes
// Round, simple, real: a glossy black bead (faceted icosahedron) sunk in a fleshy socket rim, a tiny fixed
// catchlight, and an upper eyelid (a skin dome) that rolls down over the bead to blink or squint.
interface EyeRig { root: THREE.Group; ball: THREE.Mesh; glint: THREE.Mesh; lid: THREE.Mesh; r: number }
const EYE_R = 0.066;
let eyeMatCache: { ball: THREE.Material; skin: THREE.Material; glint: THREE.Material } | null = null;
function eyeMaterials() {
  if (eyeMatCache) return eyeMatCache;
  const ball = uw(new THREE.MeshPhysicalMaterial({ color: '#0c0a10', flatShading: true, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 }), { caustics: 0.15, rim: 0.2, rimCol: [0.55, 0.7, 0.9] });
  const skin = uw(new THREE.MeshPhysicalMaterial({ color: '#d99a9e', flatShading: true, roughness: 0.72, clearcoat: 0.12, clearcoatRoughness: 0.5 }), { sss: [1, 0.42, 0.42], sssK: 0.55, rim: 0.14, rimCol: [1, 0.86, 0.86] });
  const glint = new THREE.MeshBasicMaterial({ color: '#fff8f0' });
  eyeMatCache = { ball, skin, glint };
  return eyeMatCache;
}
function buildEye(M: { ball: THREE.Material; skin: THREE.Material; glint: THREE.Material }): EyeRig {
  const r = EYE_R;
  const root = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), M.ball);
  ball.position.z = -r * 0.3;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.34, 4, 9), M.skin);
  rim.position.z = -r * 0.12;
  const glint = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.2, 0), M.glint);
  glint.position.set(-r * 0.28, r * 0.36, r * 0.58);
  // upper lid: a skin dome hinged on the eye's horizontal axis
  const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2), M.skin);
  lid.position.z = -r * 0.3;
  for (const m of [ball, rim, lid]) { m.castShadow = true; m.receiveShadow = true; }
  root.add(ball, rim, glint, lid);
  return { root, ball, glint, lid, r };
}
/** open 0..1 rolls the lid down; scale bulges the bead; gaze nudges the bead (the catchlight stays put) */
function setEye(e: EyeRig, open: number, scale: number, gx: number, gy: number) {
  e.lid.rotation.x = -1.32 + (1 - open) * (Math.PI / 2 + 1.32);
  e.ball.scale.setScalar(scale);
  e.ball.rotation.set(-gy * 0.25, gx * 0.25, 0);
  e.glint.visible = open > 0.35;
}

// ------------------------------------------------------------------ pose (procedural animation)
interface Pose { y: number; roll: number; pitch: number; yaw: number; sq: number; finR: number; finL: number; finAmp: number; tail: number; wpn: number | null; expr: string | null; bloat: number; flash: number; lift: number }
const ZERO: Pose = { y: 0, roll: 0, pitch: 0, yaw: 0, sq: 0, finR: 0, finL: 0, finAmp: 1, tail: 0, wpn: null, expr: null, bloat: 0, flash: 0, lift: 0 };
const ease = (k: number) => k * k * (3 - 2 * k);
const elastic = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.cos(k * Math.PI * 2.5) * Math.exp(-k * 5));

export type BlobEvent = 'step' | 'land' | 'pop' | 'twirl' | 'jump';

export class BlobModel {
  root = new THREE.Group();      // world-placed by the owner (position, flip, 3/4 yaw)
  animG = new THREE.Group();     // procedural animation (hop, rock, squash)
  body = new THREE.Group();      // pitch (set by the controller)
  U: BlobUniforms;
  bodyMat: THREE.MeshPhysicalMaterial;
  faceMat: THREE.MeshStandardMaterial;
  face = new FacePainter();
  finL: THREE.Mesh; finR: THREE.Mesh; tail: THREE.Mesh; nose: THREE.Mesh;
  /** eye markers (body space, follow the soft body) */
  eyes: { g: THREE.Object3D; rest: THREE.Vector3; ang: number }[] = [];
  private eyeRigs: EyeRig[] = [];
  private eyeOpen = 1;
  mouthPos = new THREE.Vector3();
  look = new THREE.Vector2(1, 0);
  facingSign = 1;
  blink = 0;
  private blinkT = 2;
  expr = 'brave';
  /** extra flash set by the owner (0..1) */
  flash = 0;
  /** decompression bloat set by the owner (0..1.5) */
  bloat = 0;
  /** cheek squeeze (straining on a line) set by the owner */
  squeeze = 0;
  // gear
  gear: Required<BlobGear> = { ...DEFAULT_GEAR };
  parts: Partial<Record<'weapon' | 'armor' | 'hat' | 'back', GearPart>> = {};
  weaponPivot = new THREE.Group();
  weapon: THREE.Group | null = null;
  /** world-plane angle of the weapon in the attach space; the controller sets it, auto when animating */
  weaponAng = 0.9;
  weaponCtl: 'auto' | 'external' = 'auto';
  /** z of the weapon in the attach space (null: at the hand) */
  weaponZ: number | null = null;
  weaponVisible = true;
  /** extra z offset (toward the viewer side) of the weapon when weaponZ is null */
  weaponOut = 0.3;
  private ribbons: { r: Ribbon; anchor: THREE.Object3D; k: number; axis: boolean; slot: string }[] = [];
  private space: THREE.Object3D | null = null;
  private headAnchor: THREE.Vector3; private backAnchor: THREE.Vector3;
  private headAng: number; private backAng: number;
  // animation
  anim: BlobAnim = 'swim';
  animT = 0;
  private baseAnim: BlobAnim = 'swim';
  private pose: Pose = { ...ZERO };
  private popK: Record<string, number> = { weapon: 1, armor: 1, hat: 1, back: 1 };
  private lastHop = 0;
  private lookT = 0; private lookTarget = new THREE.Vector2(0.3, 0);
  onEvent?: (e: BlobEvent, slot?: string) => void;
  onAnimDone?: (a: BlobAnim) => void;
  private sbTmp = { x: 0, y: 0 };
  private tmpV = new THREE.Vector3();

  constructor(gear: BlobGear = {}) {
    const pg = paintPage();
    this.U = makeBlobUniforms(pg.rock);
    this.bodyMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, flatShading: true, roughness: 0.72, clearcoat: 0.12, clearcoatRoughness: 0.5 }), { sss: [1.0, 0.42, 0.42], sssK: 0.55, rim: 0.14, rimCol: [1.0, 0.86, 0.86] });
    patchBlob(this.bodyMat, this.U, { bend: true, rock: true });
    const bodyGeo = buildBody();
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    body.name = 'blobBody';
    this.body.add(body);
    this.animG.add(this.body);
    this.root.add(this.animG);
    // the painted face, wrapped on a decal over the front of the head
    const face = buildFace(bodyGeo);
    this.faceMat = uw(new THREE.MeshStandardMaterial({ map: this.face.tex, roughness: 0.4, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { sss: [1, 0.4, 0.5], sssK: 0.5, rim: 0.2 });
    patchBlob(this.faceMat, this.U, { bend: true, key: 'face' });
    const fm = new THREE.Mesh(face.geo, this.faceMat);
    fm.name = 'blobFace';
    this.body.add(fm);
    // the nose
    const nose = face.hit(0, 3, -0.02);
    const noseMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, flatShading: true, roughness: 0.68, clearcoat: 0.12, clearcoatRoughness: 0.5 }), { sss: [1.0, 0.42, 0.42], sssK: 0.6, rim: 0.14, rimCol: [1, 0.86, 0.86] });
    patchBlob(noseMat, this.U, { bend: true, rock: true, key: 'nose' });
    this.nose = new THREE.Mesh(buildNose(nose), noseMat);
    this.nose.castShadow = true;
    this.body.add(this.nose);
    // eyes + mouth anchor points
    const eyeMats = eyeMaterials();
    for (const th of [30, -30]) {
      const p = face.hit(th, 19, 0);
      const g = new THREE.Object3D(); g.position.copy(p);
      const n = p.clone().sub(FACE_C).normalize();
      const eye = buildEye(eyeMats);
      eye.root.lookAt(n);
      g.add(eye.root);
      this.body.add(g);
      this.eyes.push({ g, rest: p.clone(), ang: sbAngle(p) });
      this.eyeRigs.push(eye);
    }
    this.mouthPos.copy(face.hit(0, -36, 0.01));
    // fins + tail
    const finMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, flatShading: true, roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.5 }), { sss: [1.0, 0.45, 0.45], sssK: 0.9 });
    patchBlob(finMat, this.U, { rock: true, key: 'fin' });
    this.finR = new THREE.Mesh(finGeo(0.33, 0.3, 0.05, R_FIN), finMat);
    this.finL = new THREE.Mesh(finGeo(0.33, 0.3, 0.05, R_FIN), finMat);
    this.finR.position.set(...bodyPoint(0.6, 0.18, -0.03)); this.finL.position.set(...bodyPoint(0.6, 0.82, -0.03));
    this.finR.castShadow = this.finL.castShadow = true;
    this.tail = new THREE.Mesh(finGeo(0.26, 0.34, 0.0, R_TAIL), finMat);
    this.tail.position.set(-0.6, 0.04, 0);
    this.tail.castShadow = true;
    this.body.add(this.finR, this.finL, this.tail);
    this.headAnchor = new THREE.Vector3(...bodyPoint(0.8, 0.5, 0));
    this.backAnchor = new THREE.Vector3(...bodyPoint(0.36, 0.5, 0));
    this.headAng = sbAngle(this.headAnchor); this.backAng = sbAngle(this.backAnchor);
    this.weaponPivot.name = 'weaponPivot';
    this.setGear({ ...DEFAULT_GEAR, ...gear }, true);
  }

  /** put the weapon pivot and cloth ribbons into `space` (usually the object that holds `root`) */
  attach(space: THREE.Object3D) {
    this.space = space;
    space.add(this.weaponPivot);
    for (const r of this.ribbons) space.add(r.r.mesh);
  }

  /** cloth meshes (bandana tails, capes): the owner adds them if it doesn't call attach() */
  get tailMeshes() { return this.ribbons.map((r) => r.r.mesh); }

  setExpression(name: string) { if (FACES[name]) this.expr = name; }

  // ---------------------------------------------------------------- gear
  setGear(g: BlobGear, force = false) {
    const next = { ...this.gear, ...g } as Required<BlobGear>;
    const patch = (m: THREE.Material, bend: boolean) => patchBlob(m, this.U, { bend, key: bend ? 'gearB' : 'gear' });
    for (const slot of ['armor', 'hat', 'back'] as const) {
      if (!force && next[slot] === this.gear[slot] && this.parts[slot]) continue;
      this.dropPart(slot);
      const part = slot === 'armor' ? buildArmor(next.armor, patch) : slot === 'hat' ? buildHat(next.hat, patch) : buildBack(next.back, patch);
      this.parts[slot] = part;
      this.body.add(part.root);
      for (const rb of part.ribbons ?? []) {
        const r = new Ribbon(patch(rb.mat, false), rb.opts);
        this.ribbons.push({ r, anchor: rb.anchor, k: rb.k, axis: !!rb.axis, slot });
        if (this.space) this.space.add(r.mesh);
      }
    }
    if (force || next.weapon !== this.gear.weapon || !this.weapon) {
      if (this.weapon) this.weaponPivot.remove(this.weapon);
      this.weapon = buildWeapon(next.weapon);
      this.weaponPivot.add(this.weapon);
    }
    this.gear = next;
  }
  private dropPart(slot: 'armor' | 'hat' | 'back') {
    const p = this.parts[slot];
    if (!p) return;
    p.root.removeFromParent();
    this.ribbons = this.ribbons.filter((r) => { if (r.slot === slot) { r.r.mesh.removeFromParent(); return false; } return true; });
    delete this.parts[slot];
  }
  get weaponId(): WeaponId { return this.gear.weapon; }
  /** world position of the weapon tip (bolts, sparks, trails) */
  weaponTip(out = new THREE.Vector3()) { this.weaponPivot.updateMatrixWorld(); return this.weaponPivot.localToWorld(out.set(WEAPON_LEN[this.gear.weapon], 0, 0)); }

  // ---------------------------------------------------------------- animation
  /** play an animation; loops (idle/swim/waddle/cheer) become the base pose, one-shots return to it */
  play(a: BlobAnim, restart = false) {
    if (a === this.anim && !restart) return;
    if (!ONE_SHOT[a] && a !== 'die') this.baseAnim = a;
    this.anim = a; this.animT = 0;
    if (a === 'gearUp') for (const k of Object.keys(this.popK)) this.popK[k] = 0;
  }

  private computePose(dt: number, swim: number): Pose {
    const t = this.animT, P: Pose = { ...ZERO };
    switch (this.anim) {
      case 'idle': {
        P.y = Math.sin(t * 2) * 0.012; P.roll = Math.sin(t * 1.3) * 0.03; P.sq = Math.sin(t * 2.2) * 0.02;
        P.finR = Math.sin(t * 2.4) * 0.25; P.finL = Math.sin(t * 2.4 + 1) * 0.25; P.finAmp = 0.4; P.tail = 0.3; P.wpn = 0.75 + Math.sin(t * 1.5) * 0.06;
        break;
      }
      case 'swim': P.finAmp = 0.6 + swim; P.tail = 0.4 + swim; P.wpn = null; break;
      case 'waddle': {
        const ph = (t / 0.46) * TAU, hop = Math.abs(Math.sin(ph));
        P.y = hop * 0.075; P.roll = Math.sin(ph) * 0.2; P.pitch = -0.07 - hop * 0.05; P.yaw = Math.sin(ph) * 0.08;
        P.sq = Math.pow(1 - hop, 4) * 0.13 - hop * 0.04;
        P.finR = Math.sin(ph) * 0.9 - 0.2; P.finL = -Math.sin(ph) * 0.9 - 0.2; P.finAmp = 0.15; P.tail = 0.8; P.wpn = 0.8 + Math.sin(ph * 2) * 0.08;
        if (hop < 0.15 && this.lastHop >= 0.15) this.onEvent?.('step');
        this.lastHop = hop;
        break;
      }
      case 'cheer': {
        const ph = (t / 0.72) * TAU, s = Math.sin(ph), jump = Math.max(0, s);
        P.y = jump * 0.24; P.sq = s < 0 ? -s * 0.13 : -jump * 0.07; P.roll = Math.sin(ph * 0.5) * 0.08;
        P.finR = -1.5 + Math.sin(t * 15) * 0.35; P.finL = -1.5 + Math.sin(t * 15 + 1.5) * 0.35; P.finAmp = 0; P.tail = 1;
        P.wpn = Math.PI / 2 - 0.2 + Math.sin(t * 7) * 0.3; P.expr = 'cheer'; P.lift = 1;
        if (s > 0.05 && this.lastHop <= 0.05) this.onEvent?.('jump');
        this.lastHop = s;
        break;
      }
      case 'gearUp': {
        // crouch -> leap + spin (gear pops on) -> land -> twirl the weapon -> hero pose
        if (t < 0.35) { const k = t / 0.35; P.sq = ease(k) * 0.17; P.expr = 'focus'; P.finR = 0.5 * k; P.finL = 0.5 * k; P.wpn = 0.6; }
        else if (t < 1.05) {
          const k = (t - 0.35) / 0.7;
          P.y = Math.sin(k * Math.PI) * 0.34; P.yaw = ease(k) * TAU; P.sq = -Math.sin(k * Math.PI) * 0.08; P.expr = 'focus';
          P.finR = -1 + Math.sin(k * 12) * 0.3; P.finL = -1 - Math.sin(k * 12) * 0.3; P.wpn = 1.2;
        } else if (t < 1.3) { const k = (t - 1.05) / 0.25; P.sq = Math.sin(k * Math.PI) * 0.16; P.expr = 'brave'; P.wpn = 1.0; }
        else {
          const k = Math.min(1, (t - 1.3) / 0.6);
          P.wpn = 0.9 + ease(k) * TAU + 0.35; P.expr = t > 2.0 ? 'cool' : 'brave'; P.lift = ease(Math.min(1, (t - 1.3) / 0.4));
          P.finR = -0.9 * P.lift; P.y = Math.sin(Math.min(1, (t - 1.9) / 0.5) * Math.PI) * 0.03 * (t > 1.9 ? 1 : 0);
          P.pitch = t > 2.2 ? Math.sin((t - 2.2) * 8) * 0.06 * Math.exp(-(t - 2.2) * 4) : 0;
          if (t - dt < 1.32 && t >= 1.32) this.onEvent?.('twirl');
        }
        P.finAmp = 0.2; P.tail = 0.6;
        const pops: [string, number][] = [['armor', 0.45], ['hat', 0.62], ['back', 0.78], ['weapon', 0.95]];
        for (const [slot, at] of pops) {
          const k = (t - at) / 0.3;
          if (t - dt < at && t >= at) this.onEvent?.('pop', slot);
          this.popK[slot] = elastic(clamp01(k));
        }
        if (t - dt < 1.05 && t >= 1.05) this.onEvent?.('land');
        break;
      }
      case 'hurt': {
        const k = clamp01(t / 0.55);
        P.roll = Math.sin(t * 55) * 0.12 * (1 - k); P.sq = 0.16 * (1 - k) * (1 - k); P.y = -0.03 * (1 - k); P.expr = 'hurt'; P.flash = (1 - k) * 0.8;
        P.finR = 0.6 * (1 - k); P.finL = 0.6 * (1 - k); P.wpn = 0.3; P.tail = 0.3;
        break;
      }
      case 'die': {
        const k = ease(clamp01(t / 1.4));
        P.roll = k * Math.PI; P.y = -k * 0.08 + Math.sin(t * 1.4) * 0.02 * k; P.sq = k * 0.08; P.bloat = k * 0.8; P.expr = 'dead';
        P.finR = 0.7 * k + Math.sin(t * 1.2) * 0.1; P.finL = 0.7 * k; P.finAmp = 0.1 * (1 - k); P.tail = 0.1 * (1 - k); P.wpn = -1.1;
        break;
      }
    }
    return P;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, o: { sb: { disp(a: number, out: { x: number; y: number }): { x: number; y: number } }; swim: number; time: number; worldMatrix?: THREE.Matrix4; vel: THREE.Vector2 }) {
    const disp = this.sbTmp;
    for (let i = 0; i < SB_N; i++) {
      o.sb.disp((i / SB_N) * TAU, disp);
      this.U.uSB.value[i].set(disp.x, disp.y);
    }
    for (const e of this.eyes) { o.sb.disp(e.ang, disp); e.g.position.set(e.rest.x + disp.x * 0.9, e.rest.y + disp.y * 0.9, e.rest.z); }
    // anim clock + one-shots
    this.animT += dt;
    const dur = ONE_SHOT[this.anim];
    if (dur && this.animT >= dur) { const a = this.anim; this.anim = this.baseAnim; this.animT = 0; if (a === 'gearUp') for (const k of Object.keys(this.popK)) this.popK[k] = 1; this.onAnimDone?.(a); }
    const P = this.computePose(dt, o.swim);
    // smooth toward the pose (snappy so hops stay crisp)
    const S = this.pose, k = 1 - Math.exp(-dt * 22);
    for (const key of ['y', 'roll', 'pitch', 'sq', 'finR', 'finL', 'finAmp', 'tail', 'bloat', 'lift'] as const) S[key] += (P[key] - S[key]) * k;
    S.yaw = P.yaw; S.flash = P.flash; S.expr = P.expr;
    if (P.wpn !== null) S.wpn = S.wpn === null ? P.wpn : S.wpn + (P.wpn - S.wpn) * (1 - Math.exp(-dt * 16)); else S.wpn = null;
    this.animG.position.set(0, S.y, 0);
    this.animG.rotation.set(S.roll, S.yaw, S.pitch);
    this.animG.scale.set(1 + S.sq * 0.5, 1 - S.sq, 1 + S.sq * 0.5);
    this.U.uFlash.value = Math.max(this.flash, S.flash);
    this.U.uFlashCol.value.set(S.flash > this.flash ? '#ff3050' : '#fff2f2');
    // gear pop-in scale + rigid gear following the skin
    for (const slot of ['armor', 'hat', 'back'] as const) {
      const part = this.parts[slot]; if (!part) continue;
      const s = this.popK[slot];
      part.root.scale.setScalar(Math.max(0.001, s));
      part.root.visible = s > 0.01;
      const rig = part.root.getObjectByName(slot === 'hat' ? 'hatRig' : 'backRig');
      if (rig) {
        const anchor = slot === 'hat' ? this.headAnchor : this.backAnchor;
        o.sb.disp(slot === 'hat' ? this.headAng : this.backAng, disp);
        rig.position.set(anchor.x + disp.x * 0.9, anchor.y + disp.y * 0.9, anchor.z);
      }
    }
    // expression: blink + gaze
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 1.8 + Math.random() * 3.2; }
    this.blink = Math.max(0, this.blink - dt * 7);
    let gx = this.look.x, gy = this.look.y;
    if (this.anim === 'idle' || this.anim === 'waddle') {
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookT = 1 + Math.random() * 2.5; this.lookTarget.set(Math.random() * 1.6 - 0.6, Math.random() * 1.2 - 0.5); }
      gx = this.lookTarget.x; gy = this.lookTarget.y;
    }
    // the face looks a touch toward the viewer: forward gaze pulls the pupils to the near side of each eye
    this.face.draw(S.expr ?? this.expr, -gx * 0.9 + 0.35, gy, this.blink, o.time);
    const es = eyeState(S.expr ?? this.expr, this.blink);
    this.eyeOpen += (es.open - this.eyeOpen) * (1 - Math.exp(-dt * 30));
    for (const e of this.eyeRigs) setEye(e, this.eyeOpen, es.scale, gx, gy);
    // fins + tail
    const flap = o.time * (6 + o.swim * 10);
    const fa = S.finAmp;
    this.finR.rotation.set(-0.5 + Math.sin(flap) * (0.25 + o.swim * 0.35) * fa + S.finR * 0.4, -0.6 - S.finR * 0.25, -0.35 + S.finR - S.lift * 0.6);
    this.finL.rotation.set(0.5 - Math.sin(flap + 0.6) * (0.25 + o.swim * 0.35) * fa - S.finL * 0.4, 0.6 + S.finL * 0.25, -0.35 + S.finL);
    this.tail.rotation.set(0, Math.PI + Math.sin(o.time * (5 + o.swim * 9)) * (0.35 + o.swim * 0.35) * (0.4 + S.tail * 0.8), Math.sin(o.time * 2.1) * 0.08);
    this.U.uWag.value += dt * (4 + o.swim * 9 + S.tail * 4);
    this.U.uWagAmp.value = 0.02 + o.swim * 0.035 + S.tail * 0.012;
    this.U.uBloat.value = Math.max(this.bloat, S.bloat);
    this.U.uSqueeze.value = this.squeeze;
    this.root.updateMatrixWorld(true);
    // weapon in the attach space
    if (this.space && this.weapon) {
      const hand = this.handWorld(this.tmpV);
      this.space.updateMatrixWorld();
      this.space.worldToLocal(hand);
      if (this.weaponZ !== null) hand.z = this.weaponZ; else hand.z += this.weaponOut;
      this.weaponPivot.position.copy(hand);
      const auto = this.weaponCtl === 'auto' || this.anim === 'cheer' || this.anim === 'gearUp' || this.anim === 'die';
      if (auto && S.wpn !== null) { const f = this.facingSign; this.weaponAng = f >= 0 ? S.wpn : Math.PI - S.wpn; }
      this.weaponPivot.rotation.set(0, 0, this.weaponAng);
      const ps = this.popK.weapon;
      this.weaponPivot.scale.set(ps, ps * (this.facingSign >= 0 ? 1 : -1), ps);
      this.weaponPivot.visible = this.weaponVisible && ps > 0.01;
      for (const m of this.weapon.children) if (m.name === 'glow') { const mm = (m as THREE.Mesh).material as THREE.MeshStandardMaterial; mm.emissiveIntensity = 1.2 + Math.sin(o.time * 5) * 0.4; }
    }
    // cloth
    for (const rb of this.ribbons) {
      const s = this.popK[rb.slot] ?? 1;
      rb.r.mesh.visible = s > 0.5;
      if (!rb.r.mesh.visible) { rb.r.reset(); continue; }
      const a = rb.anchor.getWorldPosition(this.tmpV);
      let back: THREE.Vector3 | undefined;
      if (rb.axis) {
        // capes: width across the back (body z in world), flowing backward along the body
        rb.r.axis.set(0, 0, 1).transformDirection(this.body.matrixWorld);
        back = new THREE.Vector3(-1, -0.25, 0).transformDirection(this.body.matrixWorld);
      }
      rb.r.update(a.clone().add(new THREE.Vector3(0, 0, rb.axis ? 0 : (rb.k - 0.5) * 0.04)), o.vel, this.facingSign, o.time, rb.k, back);
    }
  }

  /** world position of the mouth (the hook attaches here) */
  mouthWorld(out = new THREE.Vector3()) { return out.copy(this.mouthPos).applyMatrix4(this.body.matrixWorld); }
  /** world position of the weapon hand (the +z pectoral fin tip) */
  handWorld(out = new THREE.Vector3()) { return out.set(0.17, -0.02, 0.05).applyMatrix4(this.finR.matrixWorld); }
  eyeWorld(i: number, out = new THREE.Vector3()) { return this.eyes[i].g.getWorldPosition(out); }
}

/** smoothing helper re-exported for owners */
export { damp };
