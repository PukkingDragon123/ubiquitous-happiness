// The fixed set pieces of the v3 hideout, built into the nooks carved in the back walls (room.ts NOOKS) and a few
// fixed cells of the floor grid:
//   LOFT       (north wall, raised 0.75 m up two stone steps): the bed (driftwood frame, patchwork quilt, a sock
//              puppet), a jelly-jar night light, glowing anemones, a book stack, fairy lights along the arch
//   TROPHY     (north wall niche): three carved shelves of human junk (boot, soda can, phone, sunglasses, fork,
//              diver's mask, reel, rubber duck, gold watch...) and a medal per unlocked achievement on ribbons
//   MAP ROOM   (west wall, on a plank deck): the PLANNING TABLE (the run config: see table.ts) under a green
//              banker's lamp, the nemesis corkboard on the back wall, a barrel of rolled charts
//   MIRROR     (east wall): a tall oval driftwood mirror with a hat peg beside it (the wardrobe)
//   EASEL      (east wall): a drafting easel holding a blueprint (build mode)
//   HATCH      (west wall, the round dive door from room.ts): kelp swaying either side of it
// plus the cool light shaft through the round window and bioluminescent clusters in the corners.
//
//   const n = new Nooks(); scene.add(n.group); n.update(dt, t)
//   n.spots[id] = { obj, stand, face }  (station pick targets + where the hero stands / faces)
//   floorAt(x, z) -> walkable floor height, or null where the hero cannot stand
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT, TEX } from './tex';
import { retro } from '../gfx/retro';
import { Px } from '../gfx/px';
import { hash2, damp } from '../core/math';
import { oceanFog } from './ocean';
import { HALF_W, HALF_D, PORTHOLE, WINDOW_R, DOOR } from './room';
import { GRID_W, GRID_D, FIXED_CELLS } from './blueprints';
import { META } from '../meta/meta';
import { paintTag } from './tag';

export type FixedId = 'table' | 'hatch' | 'mirror' | 'trophy' | 'build' | 'bed';
export interface Spot { obj: THREE.Object3D; stand: THREE.Vector3; face: THREE.Vector3 }

// ------------------------------------------------------------------ layout (world metres)
export const LOFT = { x0: -4.15, x1: -1.85, z0: -6.3, y: 0.75, steps: [{ z: -3.35, y: 0.25 }, { z: -3.72, y: 0.5 }, { z: -4.08, y: 0.75 }], sx0: -3.85, sx1: -2.15 };
export const MAPROOM = { x0: -7.35, x1: -4.6, z0: -3.4, z1: -0.8, deck: 0.06 };
export const TABLE = { cx: -6.3, cz: -2.1, w: 1.35, l: 2.45, h: 0.95 };
const MIRROR_AT = new THREE.Vector3(4.5, 0, -2.5);
const EASEL_AT = new THREE.Vector3(4.5, 0, 1.5);
/** the mirror and the easel stand angled toward the room's south-west, so they face the hub camera */
const FIXED_FRONT = new THREE.Vector3(-0.42, 0, 0.91).normalize();
const FIXED_YAW = Math.atan2(-FIXED_FRONT.z, FIXED_FRONT.x);
const BED = { cx: -3.0, cz: -5.65, w: 2.0, d: 1.15 };

const plain = (c: string, r = 0.6, m = 0) => MAT.plain(`${c}/${r}/${m}`);
const glowM = (c: string, k = 2.2) => retro(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));

/** the walkable floor height at (x, z): the room, the loft (via its steps) and the map room; null = blocked */
export function floorAt(x: number, z: number, r = 0.28): number | null {
  // the main room
  if (Math.abs(x) <= HALF_W - r && Math.abs(z) <= HALF_D - r) {
    if (z < LOFT.steps[0].z && x > LOFT.sx0 && x < LOFT.sx1) return stepY(z);
    return 0;
  }
  // the loft, up its steps
  if (x > LOFT.x0 + r && x < LOFT.x1 - r && z < -HALF_D + r && z > LOFT.z0 + r) {
    if (z > -HALF_D - 0.2 && (x < LOFT.sx0 + 0.1 || x > LOFT.sx1 - 0.1)) return null;
    // the bed fills the back of the loft
    if (z < BED.cz + BED.d / 2 + r && Math.abs(x - BED.cx) < BED.w / 2 + r) return null;
    return stepY(z);
  }
  // the map room, around the planning table
  if (x > MAPROOM.x0 + r && x < -HALF_W + r + 0.4 && z > MAPROOM.z0 + r && z < MAPROOM.z1 - r) {
    if (Math.abs(x - TABLE.cx) < TABLE.w / 2 + r && Math.abs(z - TABLE.cz) < TABLE.l / 2 + r) return null;
    return MAPROOM.deck;
  }
  return null;
}
function stepY(z: number) { let y = 0; for (const s of LOFT.steps) if (z < s.z) y = s.y; return y; }
/** solid fixed cells of the grid (the stove, the mirror, the easel) as world boxes */
export function fixedBlock(x: number, z: number, r = 0.28) {
  for (const [cx, cz] of FIXED_CELLS) {
    const x0 = cx - GRID_W / 2, z0 = cz - GRID_D / 2;
    if (x > x0 - r && x < x0 + 1 + r && z > z0 - r && z < z0 + 1 + r) return true;
  }
  return false;
}

/** a wanted poster page: a painted face from the seed, name lines */
export function wantedPage(seed: number, faded = false): THREE.Texture {
  const p = new Px(24, 32);
  p.fill(() => (faded ? [196, 186, 160] : [226, 207, 160]));
  for (let x = 2; x < 22; x++) { p.set(x, 2, '#3a1a0a'); p.set(x, 6, '#3a1a0a'); }
  for (let x = 4; x < 20; x += 2) { p.set(x, 4, '#7a1a0a'); p.set(x + 1, 4, '#7a1a0a'); }
  const skin = ['#e8b48a', '#c88a5a', '#8a5a3a', '#f0c8a0'][seed % 4];
  if (faded) { p.ellipse(12, 16, 5, 6, '#a89a7a'); p.set(11, 15, '#5a4a3a'); p.set(13, 15, '#5a4a3a'); p.rect(11, 18, 3, 1, '#5a4a3a'); }
  else {
    p.ellipse(12, 16, 5, 6, skin);
    if (seed % 3 === 0) p.rect(6, 10, 12, 3, '#3a3a4a'); else if (seed % 3 === 1) p.rect(7, 10, 10, 2, '#a83a2a'); else p.rect(8, 9, 8, 2, '#5a3a1a');
    p.set(10, 15, '#1a1010'); p.set(14, 15, '#1a1010');
    if (seed % 5 === 0) { p.rect(13, 14, 3, 2, '#101010'); p.line(9, 13, 17, 14, '#101010'); }
    if (seed % 2 === 0) p.ellipse(12, 20, 4, 2.5, '#5a3a2a');
    p.rect(10, 21, 4, 1, '#6a2a2a');
  }
  p.rect(5, 25, 14, 1, '#3a1a0a'); p.rect(7, 27, 10, 1, '#3a1a0a');
  p.rect(0, 0, 24, 1, '#b89a68'); p.rect(0, 31, 24, 1, '#9a7a48');
  return p.texture({ mip: false });
}

export class Nooks {
  group = new THREE.Group();
  spots = {} as Record<FixedId, Spot>;
  /** the planning table: its top centre (world), the group the run config's props sit in */
  table!: { top: THREE.Vector3; group: THREE.Group };
  /** the nemesis corkboard (world centre, facing +x), the posters are pinned by table.ts */
  board!: THREE.Group;
  /** the trophy medals (one per unlocked achievement) */
  private medals: THREE.Mesh[] = [];
  private medalN = -1;
  private glows: { m: THREE.MeshBasicMaterial; base: THREE.Color; ph: number; f: number }[] = [];
  private sway: { o: THREE.Object3D; amp: number; f: number; ph: number }[] = [];
  private jellyLight: THREE.PointLight;
  private bankLight: THREE.PointLight;
  private windowLight: THREE.SpotLight;
  private shaft: THREE.Mesh;
  private jelly: THREE.Mesh;
  private mirrorGlass!: THREE.MeshBasicMaterial;
  private mirrorGlint = 0;

  constructor() {
    const G = this.group;
    this.buildLoft();
    this.buildTrophies();
    this.buildMapRoom();
    this.buildMirror();
    this.buildEasel();
    this.buildHatchKelp();
    this.buildGlowPlants();
    this.buildChalkboard();
    // ---- the cool light pouring through the round window, with a dusty shaft card
    this.windowLight = new THREE.SpotLight('#7ac8ff', 26, 9, 0.62, 0.7, 1.4);
    this.windowLight.position.set(PORTHOLE.x + 0.4, PORTHOLE.y + 0.9, PORTHOLE.z - 1.6);
    this.windowLight.target.position.set(PORTHOLE.x - 0.6, 0, PORTHOLE.z + 3.2);
    G.add(this.windowLight, this.windowLight.target);
    const sh = new THREE.PlaneGeometry(WINDOW_R * 1.7, 3.6); sh.translate(0, -1.8, 0);
    this.shaft = new THREE.Mesh(sh, new THREE.MeshBasicMaterial({ map: TEX.ray(), color: '#7ad8ff', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.shaft.position.set(PORTHOLE.x, PORTHOLE.y + 0.2, PORTHOLE.z + 0.35);
    this.shaft.rotation.x = -0.62;
    this.shaft.renderOrder = 7;
    G.add(this.shaft);
    // lights the nooks own
    this.jellyLight = new THREE.PointLight('#c8a0ff', 2.6, 4.5, 1.6);
    this.jellyLight.position.set(-2.05, 1.35, -5.6);
    this.bankLight = new THREE.PointLight('#ffd08a', 3.2, 4.5, 1.6);
    this.bankLight.position.set(TABLE.cx - 0.4, 1.65, TABLE.cz + 0.4);
    G.add(this.jellyLight, this.bankLight);
    this.jelly = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glowM('#e0c8ff', 1.8));
    this.jelly.position.set(-2.05, 1.12, -5.6);
    G.add(this.jelly);
  }

  // ---------------------------------------------------------------- the bed loft
  private buildLoft() {
    const k = new Kit();
    const stone = MAT.rock();
    // the loft floor: a rock shelf with plank decking
    k.slab(stone, LOFT.x1 - LOFT.x0 + 0.5, LOFT.y - 0.06, -HALF_D - LOFT.z0 + 0.3, (LOFT.x0 + LOFT.x1) / 2, 0, (LOFT.z0 - 0.3 - HALF_D) / 2 - 0.05);
    for (let i = 0; i < 6; i++) k.slab(MAT.wood('drift'), LOFT.x1 - LOFT.x0 + 0.3, 0.06, 0.4, (LOFT.x0 + LOFT.x1) / 2, LOFT.y - 0.06, -HALF_D - 0.25 - i * 0.41);
    // two carved stone steps up into it
    LOFT.steps.slice(0, 2).forEach((s, i) => {
      k.slab(stone, LOFT.sx1 - LOFT.sx0 + (1 - i) * 0.1, s.y, Math.abs(LOFT.steps[i + 1].z - s.z) + 0.02, (LOFT.sx0 + LOFT.sx1) / 2, 0, (s.z + LOFT.steps[i + 1].z) / 2);
    });
    // the bed: a driftwood frame, a mattress, a patchwork quilt, a pillow and a sock puppet
    const y = LOFT.y, bx = BED.cx, bz = BED.cz;
    const frame = MAT.wood('drift');
    k.slab(frame, BED.w, 0.22, BED.d, bx, y, bz);
    for (const sx of [-1, 1]) { k.slab(frame, 0.1, 0.75, 0.1, bx + sx * (BED.w / 2 - 0.05), y, bz - BED.d / 2 + 0.05); k.slab(frame, 0.1, 0.5, 0.1, bx + sx * (BED.w / 2 - 0.05), y, bz + BED.d / 2 - 0.05); }
    k.slab(frame, BED.w, 0.32, 0.06, bx, y + 0.35, bz - BED.d / 2 + 0.03);
    k.cushion(MAT.fabric('cream'), BED.w - 0.14, 0.14, BED.d - 0.12, bx, y + 0.29, bz, { puff: 0.3 });
    k.cushion(MAT.knit('#c8463a/#e8d8b0'), BED.w * 0.62, 0.06, BED.d - 0.06, bx + BED.w * 0.17, y + 0.4, bz + 0.02, { puff: 0.6 });
    k.cushion(MAT.knit('#3a6ac8/#e8c040'), BED.w * 0.2, 0.06, BED.d - 0.06, bx - BED.w * 0.06, y + 0.4, bz + 0.02, { puff: 0.6 });
    k.cushion(MAT.fabric('cream'), 0.42, 0.1, 0.62, bx - BED.w / 2 + 0.32, y + 0.45, bz, { puff: 0.8 });
    k.box(MAT.knit('#3a8a5a/#e8d8b0'), 0.12, 0.22, 0.1, bx - BED.w / 2 + 0.5, y + 0.58, bz + 0.2, { rz: 0.3 });
    k.sphere(plain('#1a1a1a', 0.3), 0.015, bx - BED.w / 2 + 0.53, y + 0.68, bz + 0.25, { w: 4, h: 3 });
    // a crate night stand with a book stack and the jelly-jar night light
    k.slab(MAT.wood('pine'), 0.42, 0.42, 0.42, -2.05, y, -5.6);
    for (let i = 0; i < 3; i++) k.slab(plain(['#8a2a2a', '#2a4a8a', '#c8a03a'][i], 0.8), 0.24 - i * 0.02, 0.05, 0.17, -2.06, y + 0.42 + i * 0.05, -5.48, { ry: i * 0.3 });
    k.cyl(MAT.plain('#c8f0ff/0.1/0.2'), 0.1, 0.1, 0.22, -2.05, y + 0.37 + 0.11 + 0.15 - 0.05, -5.6, { seg: 8 });
    k.cyl(MAT.brass(), 0.105, 0.105, 0.03, -2.05, y + 0.37 + 0.26, -5.6, { seg: 8 });
    // a hanging fishing-net canopy over the bed, with shells and a glass float
    const strand = plain('#c8b890', 0.9);
    for (let i = 0; i <= 8; i++) { const xx = LOFT.x0 + 0.2 + i * ((LOFT.x1 - LOFT.x0 - 0.4) / 8); k.box(strand, 0.012, 0.6 + Math.sin(i * 0.9) * 0.2, 0.012, xx, 2.55, -5.1 - (i % 3) * 0.3, { chamfer: 0 }); }
    k.box(strand, LOFT.x1 - LOFT.x0 - 0.3, 0.012, 0.012, (LOFT.x0 + LOFT.x1) / 2, 2.82, -5.2, { chamfer: 0 });
    k.sphere(plain('#3a9a8a', 0.1, 0.2), 0.08, -3.6, 2.25, -5.3, { w: 6, h: 4 });
    const g = k.build();
    this.group.add(g);
    // fairy lights along the loft's arch
    const bulbG = new THREE.SphereGeometry(0.04, 5, 4);
    const cols = ['#ffcf6a', '#ff8a5a', '#ffe9b0', '#ffb34a'];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, x = LOFT.x0 - 0.1 + u * (LOFT.x1 - LOFT.x0 + 0.2);
      const p = new THREE.Vector3(x, 2.95 - Math.sin(u * Math.PI) * 0.25 + Math.abs(u - 0.5) * -0.4, -HALF_D + 0.15);
      pts.push(p);
      if (i % 2) { const m = new THREE.Mesh(bulbG, glowM(cols[i % 4], 2.2)); m.position.copy(p).y -= 0.05; this.group.add(m); this.glows.push({ m: m.material as THREE.MeshBasicMaterial, base: new THREE.Color(cols[i % 4]).multiplyScalar(2.2), ph: i * 1.3, f: 2 }); }
    }
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#1a1410' })));
    this.spots.bed = { obj: g, stand: new THREE.Vector3(BED.cx + 0.3, LOFT.y, -4.55), face: new THREE.Vector3(BED.cx, LOFT.y + 0.4, BED.cz) };
  }

  // ---------------------------------------------------------------- the trophy niche
  private buildTrophies() {
    const k = new Kit();
    const x0 = 1.55, x1 = 4.05, zb = -HALF_D - 0.9, zf = -HALF_D + 0.06;
    const plank = MAT.wood('oak');
    const shelves = [0.72, 1.42, 2.12];
    for (const y of shelves) { k.slab(plank, x1 - x0, 0.06, zf - zb, (x0 + x1) / 2, y, (zb + zf) / 2); k.box(MAT.brass(), x1 - x0, 0.03, 0.02, (x0 + x1) / 2, y + 0.03, zf + 0.005, { chamfer: 0 }); }
    for (const sx of [x0 + 0.04, x1 - 0.04]) k.slab(plank, 0.08, 2.2, zf - zb, sx, 0.4, (zb + zf) / 2);
    k.slab(plank, x1 - x0, 0.32, zf - zb, (x0 + x1) / 2, 0.4, (zb + zf) / 2);
    const zc = (zb + zf) / 2 + 0.08;
    // ---- shelf 1: a rubber boot, a soda can, a smartphone, sunglasses
    let y = shelves[0] + 0.06;
    k.box(MAT.leather('black'), 0.16, 0.34, 0.14, 1.85, y + 0.17, zc); k.box(MAT.leather('black'), 0.3, 0.12, 0.15, 1.92, y + 0.06, zc + 0.01);
    k.box(plain('#d8c040', 0.6), 0.31, 0.02, 0.16, 1.92, y + 0.01, zc + 0.01, { chamfer: 0 });
    k.cyl(plain('#c8242a', 0.35, 0.6), 0.055, 0.055, 0.2, 2.35, y + 0.1, zc, { seg: 8 });
    k.cyl(plain('#d8d8e0', 0.3, 0.8), 0.045, 0.055, 0.02, 2.35, y + 0.21, zc, { seg: 8 });
    k.box(plain('#e8e8f0', 0.6), 0.112, 0.06, 0.003, 2.35, y + 0.12, zc + 0.055, { chamfer: 0 });
    k.box(plain('#1a1a1e', 0.2, 0.4), 0.12, 0.24, 0.02, 2.75, y + 0.12, zc - 0.06, { rx: -0.25 });
    k.box(glowM('#5ab8ff', 1.2), 0.1, 0.19, 0.002, 2.75, y + 0.125, zc - 0.045, { rx: -0.25, chamfer: 0 });
    for (const s of [-1, 1]) k.cyl(plain('#101014', 0.1, 0.5), 0.05, 0.05, 0.015, 3.2 + s * 0.07, y + 0.06, zc + 0.05, { rx: Math.PI / 2 - 0.3, seg: 8 });
    k.box(plain('#101014', 0.3, 0.5), 0.3, 0.015, 0.015, 3.2, y + 0.07, zc + 0.06, { chamfer: 0 });
    k.add(MAT.metal('red'), new THREE.TorusGeometry(0.11, 0.022, 5, 10, Math.PI * 1.25), 3.72, y + 0.15, zc, { rz: Math.PI * 0.95 });
    k.cyl(MAT.metal('red'), 0.022, 0.022, 0.25, 3.83, y + 0.3, zc, { seg: 6 });
    // ---- shelf 2: a diver's mask, a fishing reel, a rubber duck, a fork, a gold watch
    y = shelves[1] + 0.06;
    k.box(plain('#2a2a2e', 0.5), 0.3, 0.16, 0.08, 1.9, y + 0.1, zc);
    k.box(MAT.plain('#9ad8ff/0.1/0.3'), 0.24, 0.11, 0.02, 1.9, y + 0.1, zc + 0.045);
    k.box(plain('#1a1a1a', 0.6), 0.36, 0.03, 0.03, 1.9, y + 0.12, zc - 0.04, { chamfer: 0 });
    k.cyl(plain('#b8b8c0', 0.3, 0.8), 0.09, 0.09, 0.07, 2.4, y + 0.1, zc, { rx: Math.PI / 2, seg: 10 });
    k.cyl(plain('#2a2a2e', 0.3, 0.5), 0.02, 0.02, 0.18, 2.47, y + 0.1, zc + 0.02, { rz: 1.2, seg: 5 });
    k.sphere(plain('#ffd820', 0.4), 0.08, 2.86, y + 0.08, zc, { w: 7, h: 5, sx: 1.2, sy: 0.85 });
    k.sphere(plain('#ffd820', 0.4), 0.055, 2.93, y + 0.18, zc, { w: 6, h: 4 });
    k.box(plain('#ff8a20', 0.5), 0.06, 0.02, 0.04, 2.99, y + 0.17, zc, { chamfer: 0 });
    k.box(plain('#c8c8d0', 0.3, 0.8), 0.25, 0.015, 0.03, 3.3, y + 0.01, zc + 0.08, { ry: 0.5, chamfer: 0 });
    for (let i = 0; i < 3; i++) k.box(plain('#c8c8d0', 0.3, 0.8), 0.08, 0.012, 0.008, 3.43 + Math.cos(0.5) * 0.04, y + 0.012, zc + 0.02 + i * 0.012, { ry: 0.5, chamfer: 0 });
    k.cyl(plain('#f0c040', 0.25, 0.9), 0.06, 0.06, 0.02, 3.75, y + 0.07, zc, { rx: Math.PI / 2 - 0.4, seg: 10 });
    k.cyl(plain('#e8e8f0', 0.2), 0.045, 0.045, 0.004, 3.75, y + 0.07, zc + 0.012, { rx: Math.PI / 2 - 0.4, seg: 10 });
    // ---- shelf 3: a bottle with a message, a toy car, a gnome, a lure collection
    y = shelves[2] + 0.06;
    k.cyl(MAT.plain('#5ac88a/0.1/0.2'), 0.06, 0.06, 0.22, 1.85, y + 0.11, zc, { seg: 7 });
    k.cyl(MAT.plain('#5ac88a/0.1/0.2'), 0.025, 0.04, 0.08, 1.85, y + 0.26, zc, { seg: 6 });
    k.box(plain('#e8dcb0', 0.9), 0.05, 0.15, 0.04, 1.85, y + 0.1, zc, { chamfer: 0 });
    k.slab(plain('#3a6ac8', 0.4, 0.3), 0.26, 0.07, 0.12, 2.35, y + 0.03, zc);
    k.slab(plain('#9ad8ff', 0.1, 0.3), 0.14, 0.05, 0.1, 2.33, y + 0.1, zc);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(plain('#1a1a1a', 0.6), 0.03, 0.03, 0.02, 2.35 + sx * 0.08, y + 0.03, zc + sz * 0.065, { rx: Math.PI / 2, seg: 6 });
    k.cyl(plain('#3a6ac8', 0.6), 0.07, 0.08, 0.14, 2.85, y + 0.07, zc, { seg: 7 });
    k.sphere(plain('#f0c8a0', 0.6), 0.05, 2.85, y + 0.18, zc, { w: 6, h: 4 });
    k.sphere(plain('#ffffff', 0.8), 0.06, 2.85, y + 0.15, zc + 0.03, { w: 5, h: 4, sy: 1.3 });
    k.add(plain('#d82a2a', 0.6), new THREE.ConeGeometry(0.06, 0.17, 6), 2.85, y + 0.29, zc);
    for (let i = 0; i < 5; i++) {
      k.box(plain(['#ff5a3a', '#f0c040', '#3ac8a0', '#c84aff', '#ffffff'][i], 0.4, 0.3), 0.04, 0.12, 0.03, 3.3 + i * 0.13, y + 0.2, zc - 0.05, { chamfer: 0.008 });
      k.add(plain('#c8c8d0', 0.3, 0.8), new THREE.TorusGeometry(0.02, 0.005, 3, 6, Math.PI * 1.3), 3.3 + i * 0.13, y + 0.12, zc - 0.05);
    }
    k.box(plain('#c8b890', 0.9), 0.7, 0.01, 0.01, 3.56, y + 0.27, zc - 0.05, { chamfer: 0 });
    const g = k.build();
    this.group.add(g);
    // medals on ribbons along the top shelf edge: one per unlocked achievement (synced in update)
    const ribbonCols = ['#c8242a', '#2a5ac8', '#e8c040', '#3a9a5a'];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Group() as unknown as THREE.Mesh;
      const mk = new Kit();
      mk.box(plain(ribbonCols[i % 4], 0.8), 0.05, 0.16, 0.008, 0, -0.08, 0, { chamfer: 0 });
      mk.cyl(MAT.plain(['#f0c040/0.25/0.9', '#c8ccd8/0.25/0.9', '#d8884a/0.3/0.8'][i % 3]), 0.055, 0.055, 0.012, 0, -0.2, 0, { rx: Math.PI / 2, seg: 8 });
      (m as unknown as THREE.Group).add(mk.build());
      m.position.set(1.72 + i * 0.15, shelves[2] - 0.0, zf + 0.03);
      m.visible = false;
      this.group.add(m);
      this.medals.push(m);
      this.sway.push({ o: m, amp: 0.08, f: 1.3 + (i % 3) * 0.2, ph: i });
    }
    this.spots.trophy = { obj: g, stand: new THREE.Vector3(2.8, 0, -3.15), face: new THREE.Vector3(2.8, 1.4, -4.6) };
  }

  // ---------------------------------------------------------------- the map room + planning table
  private buildMapRoom() {
    const k = new Kit();
    const { x0, x1, z0, z1 } = MAPROOM;
    // the plank deck
    const deckW = -HALF_W + 0.25 - (x0 - 0.35), deckX = (x0 - 0.35 - HALF_W + 0.25) / 2;
    for (let i = 0; i < 8; i++) k.slab(MAT.wood('oak'), deckW, MAPROOM.deck, (z1 - z0 + 0.7) / 8 - 0.02, deckX, 0, z0 - 0.35 + (i + 0.5) * ((z1 - z0 + 0.7) / 8));
    // the table: a heavy chart table, legs, a rail round the top, a drawer
    const T = TABLE, ty = MAPROOM.deck;
    const wood = MAT.wood('walnut');
    k.slab(wood, T.w, 0.08, T.l, T.cx, ty + T.h - 0.08, T.cz);
    k.box(MAT.wood('oak'), T.w - 0.06, 0.012, T.l - 0.06, T.cx, ty + T.h + 0.006, T.cz, { chamfer: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.slab(wood, 0.12, T.h - 0.08, 0.12, T.cx + sx * (T.w / 2 - 0.1), ty, T.cz + sz * (T.l / 2 - 0.1));
    for (const sx of [-1, 1]) k.box(wood, 0.04, 0.05, T.l, T.cx + sx * (T.w / 2 - 0.02), ty + T.h + 0.02, T.cz);
    for (const sz of [-1, 1]) k.box(wood, T.w, 0.05, 0.04, T.cx, ty + T.h + 0.02, T.cz + sz * (T.l / 2 - 0.02));
    k.slab(wood, 0.04, 0.22, T.l - 0.3, T.cx + T.w / 2 - 0.04, ty + T.h - 0.32, T.cz);
    k.box(MAT.brass(), 0.03, 0.04, 0.16, T.cx + T.w / 2 - 0.01, ty + T.h - 0.21, T.cz);
    k.slab(wood, T.w - 0.2, 0.05, T.l - 0.2, T.cx, ty + 0.18, T.cz);
    // rolled charts in a barrel, a lantern-hook rope from the arch
    k.lathe(MAT.wood('oak'), [[0.001, 0], [0.22, 0], [0.25, 0.28], [0.22, 0.55], [0.001, 0.55]], x0 + 0.35, ty, z1 - 0.3, { seg: 8 });
    for (let i = 0; i < 5; i++) k.cyl(plain(['#e8dcb0', '#d8c898', '#c8b888'][i % 3], 0.9), 0.04, 0.04, 0.8, x0 + 0.3 + (i % 3) * 0.06, ty + 0.75, z1 - 0.38 + Math.floor(i / 3) * 0.1, { rz: (i - 2) * 0.08, seg: 6 });
    const LX = T.cx - 0.52, LZ = T.cz + 0.62, LY = 1.78;
    k.box(plain('#9a7a4a', 1), 0.02, 1.4, 0.02, LX, LY + 0.86, LZ, { chamfer: 0 });
    // the green banker's lamp hanging over the table's far corner
    k.lathe(plain('#1e5a32', 0.4, 0.3), [[0.04, 0.13], [0.14, 0.05], [0.24, 0], [0.24, -0.02], [0.001, -0.02]], LX, LY, LZ, { seg: 8 });
    k.sphere(glowM('#fff0c0', 2.0), 0.05, LX, LY - 0.03, LZ, { w: 6, h: 4 });
    const g = k.build();
    this.group.add(g);
    // the table group the run config dresses (chart, dial, bag, lever, compass)
    const tg = new THREE.Group(); tg.position.set(T.cx, ty + T.h + 0.012, T.cz);
    this.group.add(tg);
    this.table = { top: tg.position.clone(), group: tg };
    // the nemesis corkboard on the back wall
    const board = new THREE.Group(); board.position.set(x0 + 0.02, 1.85, T.cz); board.rotation.y = Math.PI / 2;
    const bk = new Kit();
    bk.box(plain('#9a7448', 0.95), 2.1, 1.05, 0.05, 0, 0, 0);
    bk.box(MAT.wood('walnut'), 2.2, 0.07, 0.09, 0, 0.55, 0.01); bk.box(MAT.wood('walnut'), 2.2, 0.07, 0.09, 0, -0.55, 0.01);
    for (const sx of [-1.07, 1.07]) bk.box(MAT.wood('walnut'), 0.07, 1.15, 0.09, sx, 0, 0.01);
    board.add(bk.build());
    this.group.add(board);
    this.board = board;
    this.spots.table = { obj: g, stand: new THREE.Vector3(-4.95, MAPROOM.deck, T.cz), face: new THREE.Vector3(T.cx, 1, T.cz) };
  }

  // ---------------------------------------------------------------- the wardrobe mirror
  private buildMirror() {
    const k = new Kit();
    const P = MIRROR_AT;
    const frame = MAT.wood('drift');
    // an oval driftwood frame on two feet, a hat peg rail beside it
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, a2 = ((i + 1) / 14) * Math.PI * 2;
      const p1 = new THREE.Vector2(Math.cos(a) * 0.42, 1.2 + Math.sin(a) * 0.72), p2 = new THREE.Vector2(Math.cos(a2) * 0.42, 1.2 + Math.sin(a2) * 0.72);
      const d = p2.clone().sub(p1);
      k.box(frame, 0.08, d.length() + 0.04, 0.09, 0, (p1.y + p2.y) / 2, (p1.x + p2.x) / 2, { rx: -Math.atan2(d.x, d.y) });
    }
    for (const sz of [-0.3, 0.3]) { k.slab(frame, 0.45, 0.08, 0.1, -0.05, 0, sz); k.box(frame, 0.08, 0.6, 0.08, 0.05, 0.3, sz * 0.9); }
    k.sphere(MAT.plain('#e85a8a/0.6'), 0.07, 0.02, 1.98, 0, { w: 6, h: 4 });
    for (let i = 0; i < 5; i++) k.sphere(MAT.plain('#d8d0c0/0.85'), 0.03, 0.0, 1.2 + Math.sin(i * 1.3) * 0.6, Math.cos(i * 1.3) * 0.4, { w: 5, h: 3 });
    // the peg rail with a spare kasa and a scarf
    k.box(MAT.wood('oak'), 0.06, 0.08, 0.5, -0.12, 2.25, 0.62);
    for (let i = 0; i < 2; i++) k.cyl(MAT.wood('oak'), 0.02, 0.02, 0.14, -0.05, 2.25, 0.5 + i * 0.25, { rz: Math.PI / 2, seg: 5 });
    k.add(MAT.plain('#d8b868/0.95'), new THREE.ConeGeometry(0.24, 0.12, 10), 0.0, 2.16, 0.5, { rz: 1.3 });
    k.box(MAT.knit('#c8463a/#e8d8b0'), 0.04, 0.5, 0.1, 0.0, 1.98, 0.76, { chamfer: 0 });
    const g = k.build();
    g.position.copy(P); g.rotation.y = FIXED_YAW;
    // the glass: a cool silvered oval that glints
    const gp = new Px(24, 40);
    gp.fill((x, y) => { const d = Math.hypot((x - 11.5) / 12, (y - 19.5) / 20); if (d > 1) return null; const k2 = (x + y * 0.4) % 9 < 2 ? 1 : 0; const t2 = y / 40; return [Math.round(150 + 60 * (1 - t2) + k2 * 30), Math.round(180 + 50 * (1 - t2) + k2 * 30), Math.round(205 + 40 * (1 - t2) + k2 * 20)]; });
    const glass = new THREE.MeshBasicMaterial({ map: gp.texture({ mip: false }), transparent: true, alphaTest: 0.5, color: new THREE.Color(0.75, 0.8, 0.9) });
    this.mirrorGlass = glass;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.42), glass);
    gm.position.set(0.05, 1.2, 0); gm.rotation.y = Math.PI / 2;
    g.add(gm);
    this.group.add(g);
    this.spots.mirror = { obj: g, stand: P.clone().addScaledVector(FIXED_FRONT, 1.05), face: new THREE.Vector3(P.x, 1.1, P.z) };
  }

  // ---------------------------------------------------------------- the blueprint easel
  private buildEasel() {
    const k = new Kit();
    const P = EASEL_AT;
    const wood = MAT.wood('pine');
    k.box(wood, 0.06, 1.7, 0.06, 0.0, 0.82, -0.35, { rx: 0.12, rz: 0.1 });
    k.box(wood, 0.06, 1.7, 0.06, 0.0, 0.82, 0.35, { rx: -0.12, rz: 0.1 });
    k.box(wood, 0.06, 1.55, 0.06, -0.32, 0.72, 0, { rz: -0.28 });
    k.box(wood, 0.08, 0.05, 0.9, 0.12, 0.62, 0);
    // the board + blueprint sheet (blue with white line drawings) clipped on, leaning back
    k.box(MAT.wood('oak'), 0.04, 0.85, 0.95, 0.02, 1.08, 0, { rz: 0.12 });
    const bp = new Px(32, 30);
    bp.fill((x, y) => ((x % 4 === 0 || y % 4 === 0) ? [44, 92, 160] : [28, 74, 140]));
    const W2 = '#e4f2ff';
    bp.rect(6, 8, 14, 10, W2); bp.rect(7, 9, 12, 8, '#1c4a8c'); bp.line(6, 8, 13, 3, W2); bp.line(13, 3, 20, 8, W2); bp.rect(11, 12, 4, 6, W2); bp.rect(12, 13, 2, 5, '#1c4a8c');
    bp.line(23, 6, 23, 22, W2); bp.line(22, 6, 24, 6, W2); bp.line(22, 22, 24, 22, W2); bp.rect(4, 24, 18, 1, W2); bp.rect(4, 26, 10, 1, '#9cc8f4');
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.72), retro(new THREE.MeshStandardMaterial({ map: bp.texture({ mip: false }), roughness: 0.9, emissive: '#1a3a6a', emissiveIntensity: 0.25 })));
    sheet.rotation.y = Math.PI / 2;
    const tilt = new THREE.Group(); tilt.position.set(0.05, 1.1, 0); tilt.rotation.z = 0.12; tilt.add(sheet);
    k.box(MAT.brass(), 0.03, 0.04, 0.1, -0.02, 1.47, 0, { rz: 0.12 });
    // a jar of pencils on a stool beside it
    k.slab(wood, 0.3, 0.45, 0.3, 0.1, 0, 0.62);
    k.cyl(MAT.plain('#c8e8f0/0.1/0.2'), 0.06, 0.06, 0.14, 0.1, 0.52, 0.62, { seg: 7 });
    for (let i = 0; i < 4; i++) k.cyl(plain(['#f0c040', '#d84a3a', '#3a8ac8', '#3ac85a'][i], 0.6), 0.012, 0.012, 0.22, 0.08 + (i % 2) * 0.04, 0.62, 0.6 + (i >> 1) * 0.04, { rz: (i - 1.5) * 0.12, seg: 5 });
    const g = k.build();
    g.add(tilt);
    g.position.copy(P); g.rotation.y = FIXED_YAW;
    this.group.add(g);
    this.spots.build = { obj: g, stand: P.clone().addScaledVector(FIXED_FRONT, 1.0), face: new THREE.Vector3(P.x, 1.1, P.z) };
  }

  // ---------------------------------------------------------------- kelp swaying at the dive hatch
  private buildHatchKelp() {
    const mat = oceanFog(retro(new THREE.MeshStandardMaterial({ map: TEX.kelp(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, flatShading: true, color: '#9ab86a' })), 0, 1.6);
    for (const [z, n] of [[DOOR.z - 1.2, 3], [DOOR.z + 1.2, 3]] as const) for (let i = 0; i < n; i++) {
      const h = 1.6 + hash2(z * 10, i, 3) * 1.4;
      const g = new THREE.PlaneGeometry(0.26, h, 1, 6); g.translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, mat);
      m.position.set(-HALF_W + 0.22 + (i % 2) * 0.12, 0, z + (i - 1) * 0.14);
      m.rotation.y = Math.PI / 2 + (i - 1) * 0.5;
      this.group.add(m);
    }
    // a few rocks the kelp holds onto, and the hatch spot
    const k = new Kit();
    for (let i = 0; i < 6; i++) k.sphere(MAT.rock(), 0.12 + hash2(i, 1, 9) * 0.1, -HALF_W + 0.25, 0.05, DOOR.z + (i < 3 ? -1.2 : 1.2) + (i % 3 - 1) * 0.16, { w: 5, h: 4, sy: 0.6 });
    const g = k.build();
    this.group.add(g);
    this.spots.hatch = { obj: g, stand: new THREE.Vector3(-HALF_W + 1.05, 0, DOOR.z), face: new THREE.Vector3(DOOR.x, DOOR.y, DOOR.z) };
  }

  // ---------------------------------------------------------------- the chalkboard by the hatch (how to get about)
  private buildChalkboard() {
    const k = new Kit();
    const wood = MAT.wood('drift');
    // an A-frame sandwich board
    for (const s of [-1, 1]) { k.box(wood, 0.05, 1.05, 0.05, s * 0.38, 0.5, 0.06, { rx: -0.16 }); k.box(wood, 0.05, 1.05, 0.05, s * 0.38, 0.5, -0.18, { rx: 0.16 }); }
    k.box(wood, 0.7, 0.05, 0.05, 0, 1.0, -0.04);
    k.box(wood, 0.82, 0.66, 0.04, 0, 0.62, 0.035, { rx: -0.16 });
    const g = k.build();
    const cv = paintTag([{ text: 'HOME RULES', font: 'title', color: '#f0e8d0' }, { text: 'walk', key: 'WASD', color: '#e8e8d8', gap: 2 }, { text: 'use', key: 'E', color: '#e8e8d8' }, { text: 'turn', key: 'RMB', color: '#e8e8d8' }, { text: 'menu', key: 'ESC', color: '#e8e8d8' }], 'slate', 120, 5);
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(cv.width * 0.0058, cv.height * 0.0058), retro(new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })));
    face.position.set(0, 0.63, 0.06); face.rotation.x = -0.16;
    g.add(face);
    g.position.set(-4.35, 0, 3.45); g.rotation.y = Math.PI / 4;
    this.group.add(g);
  }

  // ---------------------------------------------------------------- bioluminescence
  private buildGlowPlants() {
    const spots: [number, number, number, string][] = [
      [-3.95, LOFT.y, -4.45, '#7af0ff'], [-1.95, LOFT.y, -4.4, '#c87aff'], [-4.65, 0, 3.75, '#7aff9a'], [-4.7, 0, 0.6, '#7af0ff'],
      [1.4, 0, -3.65, '#c87aff'], [4.65, 0, 3.6, '#7af0ff'], [-7.0, MAPROOM.deck, -3.1, '#7aff9a'], [4.65, 0, 0.6, '#ff9ae0'],
    ];
    spots.forEach(([x, y, z, c], si) => {
      const k = new Kit();
      const stalk = MAT.plain('#2a3a4a/0.8');
      for (let i = 0; i < 5; i++) {
        const a = hash2(si, i, 3) * Math.PI * 2, r = 0.05 + hash2(si, i, 4) * 0.16, h = 0.12 + hash2(si, i, 5) * 0.3;
        k.cyl(stalk, 0.012, 0.02, h, x + Math.cos(a) * r, y + h / 2, z + Math.sin(a) * r, { seg: 4 });
      }
      this.group.add(k.build());
      for (let i = 0; i < 5; i++) {
        const a = hash2(si, i, 3) * Math.PI * 2, r = 0.05 + hash2(si, i, 4) * 0.16, h = 0.12 + hash2(si, i, 5) * 0.3;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.035 + hash2(si, i, 6) * 0.03, 5, 4), glowM(c, 1.6));
        m.position.set(x + Math.cos(a) * r, y + h + 0.02, z + Math.sin(a) * r);
        this.group.add(m);
        this.glows.push({ m: m.material as THREE.MeshBasicMaterial, base: new THREE.Color(c).multiplyScalar(1.8), ph: si * 2 + i, f: 0.9 + hash2(si, i, 7) });
      }
    });
  }

  /** the mirror flashes a glint (equip) */
  glint() { this.mirrorGlint = 1; }

  update(dt: number, t: number) {
    for (const g of this.glows) { const k = 0.55 + 0.45 * Math.sin(t * g.f + g.ph); g.m.color.copy(g.base).multiplyScalar(k); }
    for (const s of this.sway) s.o.rotation.x = Math.sin(t * s.f + s.ph) * s.amp;
    const jl = 0.8 + 0.2 * Math.sin(t * 0.9);
    this.jellyLight.intensity = 2.6 * jl;
    this.jelly.position.y = LOFT.y + 0.52 + Math.sin(t * 0.7) * 0.03;
    this.bankLight.intensity = 3.2 * (0.95 + 0.05 * Math.sin(t * 13) * Math.sin(t * 5.3));
    (this.shaft.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.05 * Math.sin(t * 0.4);
    this.windowLight.intensity = 26 * (0.9 + 0.1 * Math.sin(t * 0.5));
    this.mirrorGlint = Math.max(0, this.mirrorGlint - dt * 1.5);
    const mg = 0.75 + this.mirrorGlint * 1.2 + Math.max(0, Math.sin(t * 0.7)) * 0.08;
    this.mirrorGlass.color.setRGB(mg, mg * 1.05, mg * 1.15);
    // medals: one per unlocked achievement
    const n = Math.min(this.medals.length, META.achievements.unlocked.length);
    if (n !== this.medalN) { this.medalN = n; this.medals.forEach((m, i) => { m.visible = i < n; }); }
    void damp;
  }
}
