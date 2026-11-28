// The KIT WALL props (v7 loadout, src/hideout/packing.ts): everything the gear-up nook at the front door is built
// from. 3D (PS2 low-poly, matte, the hideout's hand-painted pixel pages):
//   buildKitWall()     a driftwood board on two posts left of the door: three battens of bone pegs with twine loops
//                      (the stash hangs from them), a log across the top lashed with rope, kelp draped over it,
//                      barnacles and a starfish on the posts
//   Satchel3D          the leather satchel on its crate: a stitched front pocket with an embroidered blobfish patch,
//                      buckled straps, a flap that throws open / buckles shut, a shoulder strap; it BULGES with how
//                      full the pack is, gulps when something lands in it, and the newest things poke out of its mouth
//   buildCrate()       the driftwood crate it sits on;  buildLantern() the lantern post (its warm light flickers)
//   rayCard() / kelpStrip()   additive light shafts, swaying kelp ribbons (foreground framing)
// 2D (the v8b deep-ink kit, flat):
//   satchelArt(bulge)  the satchel panel: the kit's main panel round the 8 x 6 pocket grid
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT, TEX } from './tex';
import { retro } from '../gfx/retro';
import { damp } from '../core/math';
import { Px, hx, hash, type C } from '../ui/pixel/decor';
import { GRID_W, GRID_H } from '../game/items';
import { skin, C as KC } from '../ui/pixel/skins';

// ------------------------------------------------------------------ 3D helpers
const canvasTex = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
const ROPE = () => MAT.plain('#8c6e38/0.95');
const BONE = () => MAT.plain('#d8cfb6/0.9');
const BRASS = () => MAT.plain('#c8913a/0.7/0.25');
const INKY = () => MAT.plain('#120a08/1');

/** a kelp ribbon `len` m long hanging (dir -1) or growing (dir 1) from its origin, swayable by rotating it */
export function kelpStrip(len: number, w: number, seed: number, dir: 1 | -1 = 1): THREE.Mesh {
  const segs = Math.max(4, Math.round(len * 5));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= segs; j++) {
    const t = j / segs, y = t * len * dir;
    const bend = Math.sin(t * 3 + seed) * 0.08 * t;
    const ww = w * (0.55 + Math.sin(t * Math.PI) * 0.6);
    for (const s of [-1, 1]) { pos.push(bend + (s * ww) / 2, y, Math.sin(t * 5 + seed) * 0.03); uv.push(s < 0 ? 0 : 1, dir > 0 ? t * len * 1.6 : 1 - t * len * 1.6); }
    if (j < segs) { const b = j * 2; idx.push(b, b + 1, b + 3, b, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const t = TEX.kelp().clone(); t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  const m = retro(new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, emissive: '#0a1a04', emissiveIntensity: 0.5 }));
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}

/** an additive light shaft card hanging from its top (TEX.ray), w x h m */
export function rayCard(w: number, h: number, color = '#9fe4ff', opacity = 0.35): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ map: TEX.ray(), color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity, toneMapped: true, side: THREE.DoubleSide });
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 5;
  return mesh;
}

/** a flat five-armed starfish (a pixel page: orange arms, a pale ridge of knobs) */
function starfish(r: number): THREE.Mesh {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * 0.42 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: r * 0.25, bevelEnabled: false });
  const px = new Px(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px.set(x, y, (x + y) % 4 === 0 ? hx('#f6c08a') : (x * 3 + y) % 7 === 0 ? hx('#a8401e') : hx('#e0703a'));
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / r * 0.5 + 0.5, uv.getY(i) / r * 0.5 + 0.5);
  const m = new THREE.Mesh(g, retro(new THREE.MeshStandardMaterial({ map: canvasTex(px.done()), roughness: 0.95, flatShading: true })));
  m.castShadow = true;
  return m;
}

/** a cluster of barnacles (little ridged cones) on a surface facing +z */
function barnacleCluster(k: Kit, x: number, y: number, z: number, n: number, seed: number, face: 'z' | 'y' = 'z') {
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i) * Math.PI * 2, r = 0.02 + hash(seed, i + 9) * 0.06, s = 0.018 + hash(seed, i + 3) * 0.02;
    const cone = new THREE.ConeGeometry(s, s * 1.3, 6, 1, true);
    if (face === 'z') k.add(MAT.plain('#cfc6b4/0.95'), cone, x + Math.cos(a) * r, y + Math.sin(a) * r, z + s * 0.5, { rx: Math.PI / 2 });
    else k.add(MAT.plain('#cfc6b4/0.95'), cone, x + Math.cos(a) * r, y + s * 0.5, z + Math.sin(a) * r);
  }
}

export interface KitWallLayout { x: number; z: number; w: number; h: number; y0: number; cols: number; rows: number }
/** the kit wall: returns the group, the hook points (group-local: where each item's twine loop hangs) and the kelp to sway */
export function buildKitWall(L: KitWallLayout): { group: THREE.Group; hooks: THREE.Vector3[]; sway: THREE.Object3D[] } {
  const g = new THREE.Group();
  const k = new Kit();
  const drift = MAT.wood('drift'), teak = MAT.wood('teak'), pine = MAT.wood('pine');
  const x0 = L.x - L.w / 2, x1 = L.x + L.w / 2, top = L.y0 + L.h;
  // two posts driven into the sand, a little out of true
  for (const [px, lean] of [[x0 - 0.05, 0.03], [x1 + 0.05, -0.025]] as [number, number][]) {
    k.box(drift, 0.12, top + 0.32, 0.12, px, (top + 0.32) / 2, L.z - 0.02, { rz: lean, chamfer: 0.025 });
    k.add(MAT.wood('drift'), new THREE.ConeGeometry(0.075, 0.12, 4), px + lean * 0.5, top + 0.38, L.z - 0.02, { ry: Math.PI / 4 });
    barnacleCluster(k, px, 0.16, L.z + 0.05, 6, Math.round(px * 10));
  }
  // the back: vertical driftwood boards, ragged at the top (salt-bleached ones and a pine one)
  const nb = 7, bw = (L.w + 0.08) / nb;
  for (let i = 0; i < nb; i++) {
    const hgt = L.h + 0.16 + (hash(i, 3) - 0.5) * 0.12 - (i === 4 ? 0.08 : 0);
    k.box(i === 2 ? pine : drift, bw - 0.012, hgt, 0.04, x0 - 0.04 + (i + 0.5) * bw, L.y0 - 0.1 + hgt / 2, L.z - 0.06 + (hash(i, 5) - 0.5) * 0.012, { rz: (hash(i, 7) - 0.5) * 0.012, chamfer: 0.008 });
  }
  // battens: one per row of hooks, pegs into them
  const hooks: THREE.Vector3[] = [];
  const rowH = L.h / L.rows, colW = L.w / L.cols;
  for (let r = 0; r < L.rows; r++) {
    const by = top - r * rowH - 0.07;
    k.box(teak, L.w + 0.16, 0.07, 0.05, L.x, by, L.z - 0.01, { rz: (hash(r, 11) - 0.5) * 0.012, chamfer: 0.012 });
    for (let c = 0; c < L.cols; c++) {
      const hx0 = x0 + (c + 0.5) * colW;
      // a bone peg out of the batten, a twine loop hanging from it
      k.cyl(BONE(), 0.016, 0.022, 0.1, hx0, by, L.z + 0.06, { rx: Math.PI / 2, seg: 6 });
      k.sphere(BONE(), 0.024, hx0, by + 0.004, L.z + 0.11, { w: 6, h: 4 });
      const tw = new THREE.TorusGeometry(0.03, 0.006, 3, 8);
      k.add(ROPE(), tw, hx0, by - 0.035, L.z + 0.09, { rx: 0.2 });
      hooks.push(new THREE.Vector3(hx0, by - 0.06, L.z + 0.1));
    }
  }
  // the top log, lashed to the posts
  k.cyl(MAT.wood('drift'), 0.07, 0.08, L.w + 0.5, L.x, top + 0.12, L.z + 0.02, { rz: Math.PI / 2 + 0.02, seg: 7 });
  for (const px of [x0 - 0.05, x1 + 0.05]) for (let i = 0; i < 4; i++) k.cyl(ROPE(), 0.088, 0.088, 0.018, px + (i - 1.5) * 0.024, top + 0.12, L.z + 0.02, { rz: Math.PI / 2 + 0.6, seg: 8 });
  // a coil of rope hung over the left post
  const coil = new THREE.TorusGeometry(0.16, 0.022, 4, 12);
  k.add(ROPE(), coil, x0 - 0.12, top - 0.16, L.z + 0.1, { ry: 0.2 });
  g.add(k.build());
  const star = starfish(0.07); star.position.set(x1 + 0.06, 0.62, L.z + 0.06); star.rotation.z = 0.4; g.add(star);
  // kelp draped over the log: ribbons hanging down the front and the sides
  const sway: THREE.Object3D[] = [];
  for (const [kx, len, w] of [[x0 + 0.06, 0.9, 0.14], [x0 + 0.38, 0.42, 0.11], [L.x + 0.15, 0.3, 0.1], [x1 - 0.32, 0.55, 0.12], [x1 + 0.02, 1.15, 0.15]] as [number, number, number][]) {
    const piv = new THREE.Group(); piv.position.set(kx, top + 0.15, L.z + 0.1);
    piv.add(kelpStrip(len, w, kx * 7, -1));
    piv.userData.ph = kx * 3.1;
    g.add(piv); sway.push(piv);
  }
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { group: g, hooks, sway };
}

/** the driftwood crate the satchel sits on (origin = floor centre), sx x sy x sz */
export function buildCrate(sx = 0.58, sy = 0.4, sz = 0.46): THREE.Group {
  const k = new Kit();
  const drift = MAT.wood('drift'), teak = MAT.wood('teak'), pine = MAT.wood('pine');
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(teak, 0.06, sy, 0.06, cx * (sx / 2 - 0.03), sy / 2, cz * (sz / 2 - 0.03), { chamfer: 0.012 });
  for (let i = 0; i < 3; i++) {
    const y = 0.07 + i * (sy - 0.08) / 2.6;
    k.box(i === 1 ? pine : drift, sx - 0.02, 0.1, 0.03, 0, y + 0.05, sz / 2 - 0.01, { rz: (hash(i, 2) - 0.5) * 0.03, chamfer: 0.01 });
    k.box(drift, 0.03, 0.1, sz - 0.02, sx / 2 - 0.01, y + 0.05, 0, { chamfer: 0.01 });
    k.box(drift, 0.03, 0.1, sz - 0.02, -sx / 2 + 0.01, y + 0.05, 0, { chamfer: 0.01 });
  }
  for (let i = 0; i < 3; i++) k.box(i === 2 ? pine : drift, sx + 0.03, 0.035, sz / 3 - 0.01, (hash(i, 4) - 0.5) * 0.02, sy + 0.017, -sz / 3 + i * sz / 3, { ry: (hash(i, 6) - 0.5) * 0.04, chamfer: 0.008 });
  // a rope round its middle, barnacles at a foot
  k.box(ROPE(), sx + 0.02, 0.03, 0.012, 0, sy * 0.55, sz / 2 + 0.012, { chamfer: 0 });
  k.box(ROPE(), 0.012, 0.03, sz + 0.02, sx / 2 + 0.012, sy * 0.55, 0, { chamfer: 0 });
  barnacleCluster(k, -sx / 2 + 0.06, 0.08, sz / 2 + 0.01, 5, 31);
  const g = k.build();
  return g;
}

/** the lantern post: a driftwood post, an arm, a hanging iron lantern with a glowing core and its warm light */
export function buildLantern(armDir: 1 | -1 = -1): { group: THREE.Group; light: THREE.PointLight; glow: THREE.Object3D; swing: THREE.Group } {
  const g = new THREE.Group();
  const k = new Kit();
  k.box(MAT.wood('drift'), 0.1, 2.15, 0.1, 0, 1.075, 0, { rz: 0.015 });
  k.box(MAT.wood('drift'), 0.52, 0.07, 0.07, armDir * 0.24, 2.05, 0);
  k.box(MAT.wood('drift'), 0.05, 0.3, 0.05, armDir * 0.08, 1.9, 0, { rz: armDir * -0.75 });
  barnacleCluster(k, 0, 0.12, 0.06, 5, 77);
  g.add(k.build());
  const swing = new THREE.Group(); swing.position.set(armDir * 0.44, 2.02, 0);
  const lk = new Kit();
  lk.cyl(MAT.metal('grey'), 0.006, 0.006, 0.16, 0, -0.08, 0, { seg: 4 });
  lk.cyl(MAT.metal('grey'), 0.05, 0.1, 0.07, 0, -0.19, 0, { seg: 6 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; lk.box(MAT.metal('grey'), 0.014, 0.2, 0.014, Math.cos(a) * 0.085, -0.31, Math.sin(a) * 0.085, { chamfer: 0 }); }
  lk.cyl(MAT.metal('grey'), 0.1, 0.08, 0.04, 0, -0.42, 0, { seg: 6 });
  g.add(swing);
  swing.add(lk.build());
  const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), MAT.glow('#ffd28a'));
  glow.position.set(0, -0.3, 0); swing.add(glow);
  const light = new THREE.PointLight('#ffb468', 2.2, 5, 1.6);
  light.position.set(0, -0.3, 0.05); swing.add(light);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m !== glow) { m.castShadow = true; m.receiveShadow = true; } });
  return { group: g, light, glow, swing };
}

// ------------------------------------------------------------------ the satchel (3D)
/** the pocket's painted front: leather, a stitched border, an embroidered round patch with a little scallop shell */
function pocketPage(): HTMLCanvasElement {
  const W = 36, H = 18, px = new Px(W, H);
  const L = LEATHER;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set(x, y, L[y === 0 ? 5 : y === H - 1 ? 2 : (x * 5 + y * 3) % 23 === 0 ? 3 : 4]);
  for (let x = 2; x < W - 2; x += 2) { px.set(x, 2, THREAD); px.set(x, H - 3, THREAD); }
  for (let y = 3; y < H - 3; y += 2) { px.set(2, y, THREAD); px.set(W - 3, y, THREAD); }
  // the patch: a ring of navy twill, a coral scallop shell stitched on it
  const cx = W / 2 - 0.5, cy = H / 2 - 0.5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 1.05);
    if (d < 6.6) px.set(x, y, d > 5.6 ? hx('#e8d8a8') : d > 4.8 ? hx('#1a2a48') : hx('#2c4a78'));
  }
  // a fan of ribs (light / dark stitches) over two hinge ears
  const SC = ['#f0a27c', '#c8603e', '#fccaa6'];
  const shell: [number, number, number][] = [
    [-1, -2, 2], [0, -2, 2],
    [-2, -1, 0], [-1, -1, 1], [0, -1, 0], [1, -1, 1],
    [-3, 0, 0], [-2, 0, 1], [-1, 0, 0], [0, 0, 1], [1, 0, 0], [2, 0, 1],
    [-2, 1, 0], [-1, 1, 1], [0, 1, 0], [1, 1, 1],
    [-2, 2, 1], [-1, 2, 0], [0, 2, 0], [1, 2, 1],
  ];
  for (const [x, y, c] of shell) px.set(Math.round(cx) + x, Math.round(cy) + y, hx(SC[c]));
  return px.done();
}
const LEATHER: C[] = ['#24100e', '#41201a', '#633322', '#86482c', '#a8653a', '#c88a52', '#e2b278'].map(hx);
const THREAD: C = hx('#ead8a8');

/** a soft bag body: a box whose bottom corners round in and whose front and back bulge out in the middle */
function bagGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 6, 4, 3);
  const P = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = (y + h / 2) / h, ax = Math.abs(x) / (w / 2);
    const bx = 1 - 0.2 * Math.pow(1 - ny, 2.4);
    const bz = 1 + 0.26 * Math.sin(Math.PI * Math.min(1, ny * 1.05)) * (1 - ax * ax * 0.7) - 0.1 * Math.pow(1 - ny, 3);
    P.setXYZ(i, x * bx, y + h / 2, z * bz);
  }
  g.computeVertexNormals();
  return g;
}

export class Satchel3D {
  root = new THREE.Group();
  /** squashes and bulges */
  body = new THREE.Group();
  flap = new THREE.Group();
  /** the newest packed things poking out of the mouth */
  peek = new THREE.Group();
  /** world point of the mouth, for flights (call after updateMatrixWorld) */
  mouth = new THREE.Object3D();
  private sq = 0; private sqV = 0; private fillK = 0; private flapA = 0; private t = 0; private wob = 0;
  constructor() {
    const k = new Kit();
    const lea = MAT.leather('brown'), dark = MAT.leather('black');
    k.add(lea, bagGeo(0.5, 0.29, 0.25), 0, 0.03, 0);
    k.box(dark, 0.52, 0.05, 0.28, 0, 0.03, 0, { chamfer: 0.015 });
    // the rolled rim round the mouth, the dark lining inside
    k.box(dark, 0.5, 0.03, 0.025, 0, 0.32, 0.12, { chamfer: 0.008 });
    k.box(dark, 0.5, 0.03, 0.025, 0, 0.32, -0.12, { chamfer: 0.008 });
    k.box(dark, 0.025, 0.03, 0.24, 0.24, 0.32, 0, { chamfer: 0.008 });
    k.box(dark, 0.025, 0.03, 0.24, -0.24, 0.32, 0, { chamfer: 0.008 });
    k.box(INKY(), 0.45, 0.01, 0.21, 0, 0.318, 0, { chamfer: 0 });
    // the front pocket, two buckled straps
    k.box(lea, 0.38, 0.17, 0.05, 0, 0.14, 0.14, { chamfer: 0.02 });
    for (const sx of [-0.12, 0.12]) { k.box(dark, 0.045, 0.22, 0.012, sx, 0.17, 0.172, { chamfer: 0 }); k.box(BRASS(), 0.055, 0.04, 0.018, sx, 0.2, 0.18, { chamfer: 0.006 }); }
    // side rings for the shoulder strap
    for (const sx of [-1, 1]) k.add(BRASS(), new THREE.TorusGeometry(0.028, 0.008, 4, 8), sx * 0.255, 0.26, 0, { ry: Math.PI / 2 });
    // the shoulder strap arching over
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.26, 0.25, 0), new THREE.Vector3(-0.2, 0.52, -0.04), new THREE.Vector3(0, 0.62, -0.06), new THREE.Vector3(0.2, 0.52, -0.04), new THREE.Vector3(0.26, 0.25, 0)]);
    k.add(dark, new THREE.TubeGeometry(curve, 12, 0.016, 4), 0, 0, 0);
    this.body.add(k.build());
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.165), retro(new THREE.MeshStandardMaterial({ map: canvasTex(pocketPage()), roughness: 0.9 })));
    page.position.set(0, 0.14, 0.1655); this.body.add(page);
    // the flap: hinged at the back of the mouth; closed it lies over the top and folds down the front
    this.flap.position.set(0, 0.33, -0.13);
    const fk = new Kit();
    fk.box(dark, 0.52, 0.022, 0.29, 0, 0.011, 0.145, { chamfer: 0.008 });
    fk.box(dark, 0.52, 0.1, 0.022, 0, -0.04, 0.285, { chamfer: 0.008 });
    fk.box(lea, 0.06, 0.13, 0.014, 0, -0.07, 0.3, { chamfer: 0 });
    fk.box(BRASS(), 0.07, 0.045, 0.016, 0, -0.12, 0.305, { chamfer: 0.006 });
    this.flap.add(fk.build());
    this.body.add(this.flap);
    this.peek.position.set(0, 0.31, 0);
    this.body.add(this.peek);
    this.mouth.position.set(0, 0.34, 0);
    this.body.add(this.mouth);
    this.root.add(this.body);
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  }
  /** something landed in it: a squash and a wobble */
  gulp(k = 1) { this.sqV -= 5.5 * k; this.wob = Math.min(1, this.wob + 0.6 * k); }
  /** full and refusing: a shake */
  strain() { this.wob = 1; }
  update(dt: number, fill: number, open: boolean) {
    this.t += dt;
    this.fillK = damp(this.fillK, fill, 6, dt);
    // the squash spring, sub-stepped (stable at any frame rate / time scale)
    const n = Math.min(40, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i++) { const h = dt / n; this.sqV += (-this.sq * 220 - this.sqV * 12) * h; this.sq += this.sqV * h; }
    this.sq = Math.max(-0.8, Math.min(0.8, this.sq));
    this.wob = Math.max(0, this.wob - dt * 2.2);
    const f = this.fillK, s = this.sq;
    this.body.scale.set((1 + f * 0.12) * (1 - s * 0.14), (1 + f * 0.1) * (1 + s * 0.22), (1 + f * 0.42) * (1 - s * 0.14));
    this.body.rotation.z = Math.sin(this.t * 22) * this.wob * 0.06;
    this.flapA = damp(this.flapA, open ? -2.75 : 0, open ? 7 : 11, dt);
    this.flap.rotation.x = this.flapA;
    this.peek.visible = this.flapA < -0.6;
    this.peek.children.forEach((c, i) => { c.position.y = 0.02 + Math.sin(this.t * 2 + i * 2) * 0.008 + f * 0.03; });
  }
  get flapOpen() { return this.flapA < -2.4; }
}

// ------------------------------------------------------------------ 2D: the satchel panel
/** the satchel panel's layout (UI px): grid origin, cell, the pocket band's top */
export const SAT = { w: 176, h: 174, cell: 17, gx: 20, gy: 30, pocketY: 138 } as const;
const artCache = new Map<string, HTMLCanvasElement>();

/** the satchel panel (v8b kit, flat): the kit's main panel with the 8 x 6 pocket grid in a well; `bulge` widens it
 *  by 2 * bulge px as it fills (a quiet hint that it is getting full) */
export function satchelArt(bulge: number): HTMLCanvasElement {
  const key = `sat|${bulge}`;
  const hit = artCache.get(key); if (hit) return hit;
  const b = bulge, W = SAT.w + b * 2, H = SAT.h;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  const f = (px: number, py: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  x.drawImage(skin('wood', W, H - 6), 0, 6);
  const c = SAT.cell, gx0 = SAT.gx + b, gy0 = SAT.gy, gw = GRID_W * c, gh = GRID_H * c;
  f(gx0 - 2, gy0 - 2, gw + 4, gh + 4, KC.line); f(gx0 - 1, gy0 - 1, gw + 2, gh + 2, '#0c121c');
  for (let j = 0; j < GRID_H; j++) for (let i = 0; i < GRID_W; i++) { f(gx0 + i * c + 1, gy0 + j * c + 1, c - 1, c - 1, '#1f2939'); f(gx0 + i * c + 2, gy0 + j * c + 2, c - 3, c - 3, KC.well); }
  artCache.set(key, cv);
  return cv;
}
