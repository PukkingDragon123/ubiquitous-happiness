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
import { FacePainter, FACES, TH, PT, PB } from './face';
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
const PAGE = 128;
const R_BODY = { x: 0, y: 0, w: 1, h: 0.5 };
const R_NOSE = { x: 0, y: 0.5, w: 0.5, h: 0.25 };
const R_FIN = { x: 0.5, y: 0.5, w: 0.25, h: 0.25 };
const R_TAIL = { x: 0.75, y: 0.5, w: 0.25, h: 0.25 };

let pageCache: { map: THREE.Texture; rock: THREE.Texture } | null = null;
function paintPage() {
  if (pageCache) return pageCache;
  const p = new Px(PAGE, PAGE);
  // soft rose jelly: a hue-shifted ramp (cool plum shadows, warm cream lights), low-contrast mottling,
  // freckles on the back, a pale belly, sagging jowl folds and a little gill slit
  const skin = ramp(['#7e2648', '#b44c70', '#de7e98', '#f4a8b8', '#ffcfd6', '#fff0ea'], 9, 0.6);
  const bh = PAGE * R_BODY.h;
  for (let y = 0; y < bh; y++) for (let x = 0; x < PAGE; x++) {
    const u = x / PAGE, t = 1 - (y + 0.5) / bh;
    const up = -Math.cos(u * TAU);
    const mott = pxNoise(x, y, 14, 3, 5, PAGE);
    const [f1, , cid] = worley(x, y, 8, 3, PAGE);
    const freckle = up > 0.3 && cid > 0.62 && f1 < 1.3 ? 1 : 0;
    let v = 0.6 - up * 0.08 + (mott - 0.5) * 0.16 - freckle * 0.17;
    v += smooth(-0.2, -0.85, up) * 0.13;                     // pale belly
    v -= smooth(0.35, 0.0, t) * 0.12;                         // tail a touch deeper
    // jowl folds: a couple of soft creases curving under the front cheeks
    for (const k of [0, 1]) {
      const ft = 0.8 + k * 0.07, fu = Math.abs(u - 0.5) - 0.38 + k * 0.03;
      if (Math.abs(t - ft - fu * fu * 2) < 0.012 && up < -0.15) v -= 0.16;
    }
    // gill slit: a short dark crescent on each flank
    for (const s of [0.27, 0.73]) { const dx = (u - s) * PAGE, dy = (t - 0.6) * bh; if (Math.abs(dx * dx * 0.08 + dy) < 0.8 && Math.abs(dx) < 4) v -= 0.3; }
    p.set(x, y, skin(v, x, y));
  }
  // nose: warmer, deeper rose with a glossy painted highlight along its top and a few pores
  const nr = ramp(['#8e3054', '#c4567a', '#e8889e', '#ffb8c6', '#ffe8ec'], 8, 0.6);
  const nx0 = 0, ny0 = PAGE * 0.5, nw = PAGE * 0.5, nh = PAGE * 0.25;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const u = x / nw, t = 1 - (y + 0.5) / nh, top = Math.cos(u * TAU);
    const m = pxNoise(x, y, 7, 3, 11, 0);
    const pore = hash2(x, y, 4) > 0.975 && top < 0.6 ? 1 : 0;
    let v = 0.5 + top * 0.16 + (m - 0.5) * 0.12 - pore * 0.14 + smooth(0.2, 0.9, t) * 0.06;
    if (top > 0.82 && t > 0.45 && t < 0.85) v += 0.22; // gloss streak
    p.set(nx0 + x, ny0 + y, nr(v, x, y));
  }
  // pectoral fin: translucent pink membrane with darker rays fanning from the base, scalloped edge
  const fr = ramp(['#8a3452', '#c86888', '#f0a0b6', '#ffd4de'], 5);
  const fx0 = PAGE * 0.5, fy0 = PAGE * 0.5, fw = PAGE * 0.25, fh = PAGE * 0.25;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const u = x / (fw - 1), v = y / (fh - 1);
    const ray = Math.abs(Math.sin(v * Math.PI * 5 + u * 0.5)) < 0.22 ? 1 : 0;
    const edge = u + Math.pow(Math.abs(v - 0.5) * 2, 2.5) * 0.45 + Math.abs(Math.sin(v * Math.PI * 5)) * 0.06;
    if (edge > 1.0) continue;
    const c = fr(0.78 - u * 0.25 - ray * 0.3, x, y);
    p.set(fx0 + x, fy0 + y, edge > 0.9 ? mix(c, hex('#6a2040'), 0.55) : c);
  }
  // tail fin: same membrane, a deeper rim
  const tx0 = PAGE * 0.75, ty0 = PAGE * 0.5;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const u = x / (fw - 1), v = y / (fh - 1);
    const ray = Math.abs(Math.sin((v - 0.5) * Math.PI * 6 / (0.4 + u))) < 0.25 ? 1 : 0;
    const notch = Math.abs(v - 0.5) < 0.12 * u ? 0.25 : 0;
    const edge = u + notch;
    if (edge > 1.0) continue;
    const c = fr(0.75 - u * 0.3 - ray * 0.28, x, y);
    p.set(tx0 + x, ty0 + y, edge > 0.88 ? mix(c, hex('#6a2040'), 0.55) : c);
  }
  const map = p.texture({ mip: false });
  // rock skin for Rock Body: grey granite with flecks + cracks
  const rk = new Px(64, 64);
  const rr = ramp(['#2e2c2a', '#4f4b46', '#77716a', '#a39b90', '#cfc6b8'], 6);
  rk.fill((x, y) => {
    const [f1, f2] = worley(x, y, 10, 7, 64);
    const crack = f2 - f1 < 1.2 ? 1 : 0;
    const n = pxNoise(x, y, 6, 4, 3, 64);
    const fleck = hash2(x, y, 3) > 0.93 ? 0.25 : 0;
    return rr(0.55 + (n - 0.5) * 0.6 + fleck - crack * 0.45, x, y);
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
  const a = base.clone().add(new THREE.Vector3(-0.1, 0.0, 0)), b = base.clone().add(new THREE.Vector3(0.15, 0.01, 0)), c = base.clone().add(new THREE.Vector3(0.12, -0.16, 0));
  const path: V3[] = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const x = (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * b.x + s * s * c.x;
    const y = (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * b.y + s * s * c.y;
    path.push([x, y, 0]);
  }
  const r = (s: number) => {
    const bulb = 0.062 + 0.052 * smooth(0.1, 0.78, s);
    const cap = s > 0.72 ? Math.sqrt(Math.max(0, 1 - ((s - 0.72) / 0.28) ** 2)) : 1;
    return Math.max(0.006, bulb * cap);
  };
  L.tube(path, r, 8, R_NOSE, 1, { capStart: false, capEnd: true });
  const g = L.build();
  // widen the bulb sideways a touch (a blobfish nose is broader than tall)
  const pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * 1.18);
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
    this.bodyMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.35, sheenColor: new THREE.Color('#ffd0dc'), sheenRoughness: 0.5 }), { sss: [1.0, 0.35, 0.42], sssK: 0.6, rim: 0.32, rimCol: [1.0, 0.85, 0.9] });
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
    const noseMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 }), { sss: [1.0, 0.4, 0.45], sssK: 0.6, rim: 0.3, rimCol: [1, 0.85, 0.9] });
    patchBlob(noseMat, this.U, { bend: true, rock: true, key: 'nose' });
    this.nose = new THREE.Mesh(buildNose(nose), noseMat);
    this.nose.castShadow = true;
    this.body.add(this.nose);
    // eyes + mouth anchor points
    for (const th of [26, -26]) {
      const p = face.hit(th, 17, 0.01);
      const g = new THREE.Object3D(); g.position.copy(p);
      this.body.add(g);
      this.eyes.push({ g, rest: p.clone(), ang: sbAngle(p) });
    }
    this.mouthPos.copy(face.hit(12, -36, 0.01));
    // fins + tail
    const finMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide, alphaTest: 0.5 }), { sss: [1.0, 0.4, 0.5], sssK: 0.8 });
    patchBlob(finMat, this.U, { rock: true, key: 'fin' });
    this.finR = new THREE.Mesh(finGeo(0.27, 0.22, 0.04, R_FIN), finMat);
    this.finL = new THREE.Mesh(finGeo(0.27, 0.22, 0.04, R_FIN), finMat);
    this.finR.position.set(...bodyPoint(0.56, 0.19, -0.02)); this.finL.position.set(...bodyPoint(0.56, 0.81, -0.02));
    this.finR.castShadow = this.finL.castShadow = true;
    this.tail = new THREE.Mesh(finGeo(0.3, 0.4, 0.0, R_TAIL), finMat);
    this.tail.position.set(-0.6, 0.03, 0);
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
