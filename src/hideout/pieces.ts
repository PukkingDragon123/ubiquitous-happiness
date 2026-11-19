// The v4 home's art: the ruined stone house shell (hand-laid stone blocks over a dark mortar backing, a broken
// lintel over the front doorway, rafters with a collapsed beam, rubble and sand drifts, algae and coral growth)
// and the models of the pieces you rebuild that the old furniture set does not already have (bed, wardrobe,
// trophy shelf, round window, front door) plus the goal board. Everything is low-poly over clean pixel pages:
// flat tone patches, chips and cracks drawn as shapes, lit top edges, no per-pixel noise.
//
//   const shell = buildShell(); scene.add(shell.group)      shell.rubble / shell.sand fade out as the house is rebuilt
//   pieceModel('bed' | 'wardrobe' | 'trophy' | 'window' | 'door')  -> { group, door?, glass?, light? }
//   const board = new GoalBoard(); board.paint(lines)         the cork board's painted note
//   ghostOf(obj)                                              a translucent blueprint copy (unbuilt spots)
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT, TEX } from './tex';
import { retro } from '../gfx/retro';
import { Px, hex, mix, type RGB } from '../gfx/px';
import { hash2, fbm, TAU } from '../core/math';
import { paintTag, type TagLine } from './tag';

export const IN = { x0: -6, x1: 6, z0: -4.5, z1: 4.5 };
export const WALL_T = 0.5;
export const DOOR_W = 1.7;
const H = (a: number, b: number, s: number) => hash2(a, b, s);

// ------------------------------------------------------------------ pages
function ramp(base: string, n = 5, spread = 0.5): RGB[] {
  const c = hex(base), out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i / (n - 1)) * 2 - 1;
    out.push(k < 0 ? mix(c, [c[0] * 0.35 + 6, c[1] * 0.4 + 10, c[2] * 0.55 + 20], -k * spread * 1.3) : mix(c, [Math.min(255, c[0] * 1.2 + 40), Math.min(255, c[1] * 1.18 + 34), Math.min(255, c[2] * 1.1 + 24)], k * spread));
  }
  return out;
}
function tex(p: Px) { return p.texture({ repeat: true, mip: false }); }
function mat(map: THREE.Texture | null, o: { rough?: number; color?: string; tileM?: number; side?: THREE.Side } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.9, color: o.color ?? '#ffffff', flatShading: true, side: o.side ?? THREE.FrontSide });
  m.userData.tileM = o.tileM ?? 1;
  return retro(m);
}

/** one stone's face (1 m tile): broad tone patches, a lit top band, chips, a hairline crack, lichen or algae */
function stonePage(base: string, moss: number, seed: number): Px {
  const S = 64, p = new Px(S, S), T = ramp(base, 5, 0.45);
  p.fill((x, y) => {
    const n = fbm(x * 0.06 + seed, y * 0.06, 2, seed);
    let k = n < 0.4 ? 1 : n < 0.58 ? 2 : 3;
    if (y % 16 < 2) k = Math.min(4, k + 1); // the lit top lip of each stone course
    if (y % 16 === 15) k = 0;                // the shadow under it
    return T[k];
  });
  // chips: a dark notch with a lit lower edge
  for (let i = 0; i < 7; i++) {
    const cx = Math.floor(H(i, 1, seed) * 60) + 2, cy = Math.floor(H(i, 2, seed) * 60) + 2, r = 1.5 + H(i, 3, seed) * 2;
    p.ellipse(cx, cy, r, r * 0.7, T[0]); p.set(cx, Math.round(cy + r * 0.7), T[3]);
  }
  // hairline cracks
  for (let c = 0; c < 2; c++) {
    let x = Math.floor(H(c, 4, seed) * 50) + 6, y = Math.floor(H(c, 5, seed) * 30);
    for (let j = 0; j < 14; j++) { p.set(x, y, T[0]); p.set(x + 1, y, T[3]); y++; if (H(c, j, seed + 2) > 0.6) x += H(c, j, seed + 3) > 0.5 ? 1 : -1; }
  }
  // algae / lichen creeping down from the tops of the courses
  if (moss > 0) {
    const A = ramp('#3e6a2c', 5, 0.5);
    for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) {
      const g = fbm(x * 0.1 + 40 + seed, y * 0.05, 2, seed + 9);
      const yy = y % 16;
      if (g < moss * 0.62 - yy * 0.035) p.set(x, y, A[yy < 2 ? 3 : g < moss * 0.3 ? 1 : 2]);
    }
    for (let i = 0; i < 10; i++) { const x = Math.floor(H(i, 7, seed) * 62), y = Math.floor(H(i, 8, seed) * 4) * 16 + 2; p.set(x, y, A[4]); p.set(x + 1, y, A[3]); }
  }
  return p;
}
/** big irregular flagstones (2 m tile), sand caught in the joints and drifted over the worn ones */
function flagPage(): Px {
  const S = 128, p = new Px(S, S);
  const T = ramp('#6e6a62', 5, 0.42), T2 = ramp('#7a6c58', 5, 0.42), SAND = ramp('#b8a47c', 4, 0.35);
  // a Voronoi-ish slab layout from jittered seeds
  const seeds: [number, number][] = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) seeds.push([(i + 0.2 + H(i, j, 3) * 0.6) * 25.6, (j + 0.2 + H(i, j, 4) * 0.6) * 25.6]);
  const near = (x: number, y: number) => {
    let a = 1e9, b = 1e9, ai = 0;
    for (let k = 0; k < seeds.length; k++) for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const d = Math.hypot(x - seeds[k][0] - ox, y - seeds[k][1] - oy);
      if (d < a) { b = a; a = d; ai = k; } else if (d < b) b = d;
    }
    return { ai, edge: b - a };
  };
  p.fill((x, y) => {
    const { ai, edge } = near(x, y);
    const R = H(ai, 1, 5) > 0.5 ? T : T2;
    if (edge < 1.6) return SAND[0];
    if (edge < 2.8) return R[1];
    const n = fbm(x * 0.04 + ai * 3, y * 0.04, 2, ai);
    let k = n < 0.45 ? 2 : 3;
    if (edge < 4) k = Math.min(4, k + 1);
    // sand drifted over some slabs
    if (H(ai, 9, 7) > 0.86 && fbm(x * 0.08, y * 0.08, 2, 11) > 0.56) return SAND[n > 0.5 ? 3 : 2];
    return R[k];
  });
  return p;
}

const PAGES = {
  stone: (() => { let m: THREE.Material | null = null; return () => (m ??= mat(tex(stonePage('#7a7468', 0, 3)), { tileM: 1 })); })(),
  stoneB: (() => { let m: THREE.Material | null = null; return () => (m ??= mat(tex(stonePage('#6a6e72', 0.35, 7)), { tileM: 1 })); })(),
  moss: (() => { let m: THREE.Material | null = null; return () => (m ??= mat(tex(stonePage('#6e6a5a', 0.85, 11)), { tileM: 1 })); })(),
  mortar: (() => { let m: THREE.Material | null = null; return () => (m ??= mat(null, { color: '#1c1814', rough: 1 })); })(),
  floor: (() => { let m: THREE.Material | null = null; return () => (m ??= mat(tex(flagPage()), { tileM: 2.6 })); })(),
};
export const HOUSE_MAT = PAGES;

// ------------------------------------------------------------------ the shell
export interface Shell {
  group: THREE.Group;
  /** debris that clears away as the house is rebuilt (scaled down / hidden by progress) */
  rubble: THREE.Object3D[];
  /** hanging kelp strands that sway */
  sway: { o: THREE.Object3D; amp: number; f: number; ph: number }[];
  /** the shafts of cold light through the broken roof */
  shafts: THREE.Mesh[];
  /** the window hole edge (hidden once the window is built) */
  windowHole: THREE.Object3D;
}

/** wall height profile: x or z along the wall -> top of the stones (a ruin: broken, lower toward the front) */
function wallTop(side: 'n' | 'w' | 'e' | 's', u: number): number {
  const j = (fbm(u * 0.45 + side.charCodeAt(0), 1.3, 2, 5) - 0.5) * 1.1;
  if (side === 'n') return 3.5 + j * 0.8 - (u > 3.6 && u < 5.2 ? 1.1 : 0);
  if (side === 's') return 0.85 + j * 0.45;
  // side walls fall away toward the front (z = +4.5): the cutaway the top-down camera looks over
  const k = (u - IN.z0) / (IN.z1 - IN.z0); // 0 back .. 1 front
  const base = 3.5 - k * 2.6 + j * 0.6;
  return side === 'e' && u > 0.8 && u < 2.8 ? Math.min(base, 0.9) : base;
}

export function buildShell(): Shell {
  const G = new THREE.Group();
  const shell: Shell = { group: G, rubble: [], sway: [], shafts: [], windowHole: new THREE.Group() };
  const k = new Kit();
  const stones = [PAGES.stone(), PAGES.stoneB(), PAGES.moss()];
  // the floor: flagstones inside, extending under the walls and out onto the porch
  const fl = new THREE.PlaneGeometry(IN.x1 - IN.x0 + 1.4, IN.z1 - IN.z0 + 1.4); fl.rotateX(-Math.PI / 2);
  k.add(PAGES.floor(), fl, 0, 0.004, 0);
  // ---- the four walls: courses of hand-laid stones over a dark mortar backing
  const course = 0.42;
  const wall = (side: 'n' | 'w' | 'e' | 's') => {
    const along = side === 'n' || side === 's';
    const L = along ? IN.x1 - IN.x0 + WALL_T * 2 : IN.z1 - IN.z0;
    const c = side === 'n' ? IN.z0 - WALL_T / 2 : side === 's' ? IN.z1 + WALL_T / 2 : side === 'w' ? IN.x0 - WALL_T / 2 : IN.x1 + WALL_T / 2;
    const u0 = -L / 2;
    for (let row = 0; row < 9; row++) {
      const y0 = row * course;
      let u = u0 - (row % 2 ? 0.32 : 0);
      let i = 0;
      while (u < u0 + L) {
        const len = 0.5 + H(row, i, side.charCodeAt(0)) * 0.42;
        const uc = Math.max(u0, u) + Math.min(len, u0 + L - Math.max(u0, u)) / 2;
        const lw = Math.min(len, u0 + L - Math.max(u0, u)) - 0.03;
        u += len; i++;
        if (lw < 0.12) continue;
        const top = wallTop(side, uc);
        if (y0 + course * 0.5 > top) continue;
        // the doorway, the window hole
        if (side === 's' && Math.abs(uc) < DOOR_W / 2 + lw / 2 - 0.05 && y0 < 2.3) continue;
        if (side === 'n' && Math.hypot(uc, y0 + course / 2 - 2.15) < 1.12 + (H(row, i, 9) - 0.3) * 0.3) continue;
        const m = stones[H(row, i, 31 + side.charCodeAt(0)) < (y0 > 1.5 ? 0.35 : 0.15) ? 2 : H(row, i, 7) < 0.5 ? 0 : 1];
        const jy = (H(row, i, 3) - 0.5) * 0.03, jt = (H(row, i, 4) - 0.5) * 0.08;
        const t = WALL_T + jt;
        if (along) k.box(m, lw, course - 0.03, t, uc, y0 + course / 2 + jy, c + (H(row, i, 5) - 0.5) * 0.04, { rz: (H(row, i, 6) - 0.5) * 0.03, chamfer: 0.03 });
        else k.box(m, t, course - 0.03, lw, c + (H(row, i, 5) - 0.5) * 0.04, y0 + course / 2 + jy, uc, { rx: (H(row, i, 6) - 0.5) * 0.03, chamfer: 0.03 });
      }
    }
    // the mortar backing: a thinner dark core under every course (so the joints read as shadow, not as holes)
    for (let s = 0; s < 28; s++) {
      const a = u0 + (s / 28) * L, b = u0 + ((s + 1) / 28) * L, um = (a + b) / 2;
      let top = Math.min(wallTop(side, a), wallTop(side, b)) - 0.12;
      if (side === 's' && Math.abs(um) < DOOR_W / 2 + 0.05) continue;
      if (side === 'n' && Math.abs(um) < 1.15) {
        // under and over the window hole
        k.box(PAGES.mortar(), b - a + 0.01, 0.95, WALL_T * 0.6, um, 0.475, c, { chamfer: 0 });
        const hi = 2.15 + Math.sqrt(Math.max(0, 1.2 * 1.2 - um * um));
        if (top > hi) k.box(PAGES.mortar(), b - a + 0.01, top - hi, WALL_T * 0.6, um, (top + hi) / 2, c, { chamfer: 0 });
        continue;
      }
      top = Math.max(0.2, top);
      if (along) k.box(PAGES.mortar(), b - a + 0.01, top, WALL_T * 0.6, um, top / 2, c, { chamfer: 0 });
      else k.box(PAGES.mortar(), WALL_T * 0.6, top, b - a + 0.01, c, top / 2, um, { chamfer: 0 });
    }
  };
  for (const s of ['n', 'w', 'e', 's'] as const) wall(s);
  // corner posts: big squared stones up the back corners
  for (const [x, z] of [[IN.x0 - WALL_T / 2, IN.z0 - WALL_T / 2], [IN.x1 + WALL_T / 2, IN.z0 - WALL_T / 2]]) for (let r = 0; r < 8; r++) k.box(stones[r % 2], 0.64, 0.42, 0.64, x, r * 0.43 + 0.21, z, { ry: (H(r, x, 3) - 0.5) * 0.1, chamfer: 0.04 });
  // the front doorway: two stone jambs and a cracked lintel (one half sagging)
  // the jambs stand a little proud of the low front wall; the lintel has fallen and lies broken outside
  for (const sx of [-1, 1]) for (let r = 0; r < (sx < 0 ? 4 : 3); r++) k.box(stones[(r + (sx > 0 ? 1 : 0)) % 2], 0.42, 0.4, WALL_T + 0.12, sx * (DOOR_W / 2 + 0.2), r * 0.42 + 0.2, IN.z1 + WALL_T / 2, { chamfer: 0.035 });
  k.box(stones[1], DOOR_W / 2 + 0.3, 0.32, 0.5, -1.9, 0.16, IN.z1 + 1.1, { ry: 0.5, rz: 0.06, chamfer: 0.035 });
  k.box(stones[0], DOOR_W / 2 + 0.2, 0.3, 0.5, 2.0, 0.15, IN.z1 + 1.3, { ry: -0.7, chamfer: 0.035 });
  // the window hole: a rim of rough voussoir stones around the round opening (glass comes with the window piece)
  const hole = new Kit();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    if (i === 3 || i === 9) continue; // two have fallen out
    hole.box(stones[i % 3], 0.34, 0.28, WALL_T + 0.1, Math.cos(a) * 1.2, 2.15 + Math.sin(a) * 1.2, IN.z0 - WALL_T / 2, { rz: a + Math.PI / 2, chamfer: 0.03 });
  }
  shell.windowHole = hole.build();
  G.add(shell.windowHole);
  // ---- the roof: rafters across the back half resting on the walls, one fallen in, broken plank stubs
  const beam = MAT.wood('drift');
  for (const z of [-3.9, -2.4]) k.box(beam, IN.x1 - IN.x0 + 1.0, 0.22, 0.26, 0, 3.55 - (z > -3 ? 0.35 : 0), z, { rz: z > -3 ? 0.03 : -0.01 });
  for (let i = 0; i < 9; i++) { if (i === 2 || i === 6) continue; k.box(MAT.wood('pine'), 0.5, 0.06, 1.3 + H(i, 2, 4) * 0.6, -5.2 + i * 1.3, 3.7, -4.0 + H(i, 3, 4) * 0.2, { rx: 0.18, ry: (H(i, 4, 4) - 0.5) * 0.2 }); }
  G.add(k.build());
  // the fallen beam: one end on the floor in the front-left corner, the other on the west wall (cleared by the door)
  const fb = new Kit();
  fb.box(beam, 0.26, 0.24, 3.6, 0, 0, 0, { chamfer: 0.03 });
  const fallen = fb.build(); fallen.position.set(-4.7, 0.95, 3.0); fallen.rotation.set(-0.48, 0.55, 0.12);
  G.add(fallen); shell.rubble.push(fallen);
  // rubble heaps + scattered planks in the corners (the build spots have their own)
  for (const [x, z, n] of [[-5.2, 3.7, 9], [4.9, 3.6, 7], [5.3, 1.7, 6]] as [number, number, number][]) { const r = rubbleHeap(n, x * 13 + z); r.position.set(x, 0, z); G.add(r); shell.rubble.push(r); }
  // sand drifts banked against the walls (they stay; the house is under the sea)
  const sandM = mat(TEX.sand(), { rough: 1, tileM: 1 });
  for (let i = 0; i < 10; i++) {
    const g = new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, Math.PI / 2); g.scale(0.9 + H(i, 1, 2) * 1.2, 0.18 + H(i, 2, 2) * 0.12, 0.5 + H(i, 3, 2) * 0.4);
    const m = new THREE.Mesh(g, sandM);
    const side = i % 3;
    m.position.set(side === 0 ? IN.x0 + 0.3 : side === 1 ? IN.x1 - 0.3 : -5 + i * 1.1, 0, side === 2 ? IN.z0 + 0.25 : -3.8 + (i * 1.7) % 7.5);
    m.rotation.y = side === 2 ? 0 : Math.PI / 2;
    m.receiveShadow = true;
    G.add(m);
  }
  // algae and coral growing on the ruin; kelp strands hanging from the rafters
  const ak = new Kit();
  const algae = MAT.plain('#4a7a34/0.9'), coral = ['#e8705a', '#c8508a', '#e8a03a'];
  for (let i = 0; i < 22; i++) {
    const side = i % 3, u = H(i, 1, 6);
    const x = side === 0 ? IN.x0 + 0.05 : side === 1 ? IN.x1 - 0.05 : IN.x0 + 0.6 + u * 10.8;
    const z = side === 2 ? IN.z0 + 0.06 : IN.z0 + 0.5 + u * 8;
    if (side === 2 && Math.abs(x) < 1.4) continue;
    const y = 0.15 + H(i, 2, 6) * 0.3;
    if (i % 4 === 0) for (let j = 0; j < 4; j++) ak.cyl(MAT.plain(coral[i % 3] + '/0.7'), 0.02, 0.035, 0.18 + j * 0.06, x + (j - 1.5) * 0.06, y + 0.1 + j * 0.02, z, { rz: (j - 1.5) * 0.25, seg: 5 });
    else ak.sphere(algae, 0.12 + H(i, 3, 6) * 0.1, x, y, z, { w: 6, h: 4, sy: 0.5 });
  }
  G.add(ak.build());
  const strand = retro(new THREE.MeshStandardMaterial({ map: TEX.kelp(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: '#8aa86a', flatShading: true }));
  for (let i = 0; i < 7; i++) {
    const L = 0.8 + H(i, 1, 8) * 1.2, g = new THREE.PlaneGeometry(0.2, L); g.translate(0, -L / 2, 0);
    const m = new THREE.Mesh(g, strand); m.position.set(-4.6 + i * 1.55, 3.45, i % 2 ? -3.9 : -2.4); m.rotation.y = H(i, 2, 8) * 3;
    G.add(m); shell.sway.push({ o: m, amp: 0.12, f: 0.6 + H(i, 3, 8) * 0.4, ph: i });
  }
  // shafts of cold light through the broken roof
  for (let i = 0; i < 4; i++) {
    const h = 5, g = new THREE.PlaneGeometry(0.9 + H(i, 1, 9) * 0.8, h); g.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: TEX.ray(), color: '#8ad8ff', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(-3.6 + i * 2.5, 4.4, -1.2 + (i % 2) * 1.6); m.rotation.set(0, 0.3, -0.22); m.renderOrder = 7;
    G.add(m); shell.shafts.push(m);
  }
  G.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !(m.material as THREE.Material).transparent; m.receiveShadow = true; } });
  return shell;
}

/** a heap of broken stones, a split plank or two */
export function rubbleHeap(n: number, seed: number): THREE.Group {
  const k = new Kit();
  const stones = [PAGES.stone(), PAGES.stoneB(), PAGES.moss()];
  for (let i = 0; i < n; i++) {
    const a = H(i, 1, seed) * TAU, r = H(i, 2, seed) * 0.55;
    const s = 0.16 + H(i, 3, seed) * 0.18;
    k.box(stones[i % 3], s * 1.4, s, s * 1.1, Math.cos(a) * r, s / 2 + (r < 0.25 ? 0.12 : 0), Math.sin(a) * r, { ry: H(i, 4, seed) * 3, rz: (H(i, 5, seed) - 0.5) * 0.6, chamfer: 0.02 });
  }
  for (let i = 0; i < 2; i++) k.box(MAT.wood('drift'), 0.9 + H(i, 6, seed) * 0.4, 0.05, 0.16, (i - 0.5) * 0.3, 0.07 + i * 0.05, (H(i, 7, seed) - 0.5) * 0.4, { ry: H(i, 8, seed) * 3, rz: 0.15 });
  return k.build();
}

// ------------------------------------------------------------------ piece models (front = +z)
export interface PieceModel { group: THREE.Group; lights: { pos: THREE.Vector3; color: string; intensity: number; dist: number }[]; door?: THREE.Object3D; seat?: THREE.Vector3 }

/** a cosy bed: driftwood frame, a fat mattress, a patchwork quilt, a pillow and a sock puppet; head at -x */
function bed(): PieceModel {
  const k = new Kit(), w = 2.0, d = 1.15, frame = MAT.wood('drift');
  k.slab(frame, w, 0.24, d, 0, 0, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.slab(frame, 0.1, sx < 0 ? 0.85 : 0.55, 0.1, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05));
  k.slab(frame, 0.06, 0.5, d, -w / 2 + 0.03, 0.3, 0);
  k.box(frame, 0.08, 0.06, d + 0.06, -w / 2 + 0.03, 0.82, 0);
  k.cushion(MAT.fabric('cream'), w - 0.14, 0.16, d - 0.12, 0, 0.32, 0, { puff: 0.3 });
  k.cushion(MAT.knit('#c8463a/#e8d8b0'), w * 0.6, 0.06, d - 0.04, w * 0.18, 0.44, 0.0, { puff: 0.6 });
  k.cushion(MAT.knit('#3a6ac8/#e8c040'), w * 0.18, 0.06, d - 0.04, -w * 0.06, 0.44, 0, { puff: 0.6 });
  k.box(MAT.knit('#c8463a/#e8d8b0'), 0.04, 0.32, d - 0.04, w * 0.48, 0.3, 0, { chamfer: 0 });
  k.cushion(MAT.fabric('cream'), 0.38, 0.12, 0.66, -w / 2 + 0.3, 0.5, 0, { puff: 0.8 });
  k.box(MAT.knit('#3a8a5a/#e8d8b0'), 0.12, 0.22, 0.1, -w / 2 + 0.55, 0.62, 0.24, { rz: 0.3 });
  k.sphere(MAT.plain('#1a1a1a/0.3'), 0.016, -w / 2 + 0.58, 0.72, 0.29, { w: 4, h: 3 });
  return { group: k.build(), lights: [] };
}
/** a tall wardrobe: two doors (one with a silvered mirror), a carved crown, a spare kasa on top */
function wardrobe(): PieceModel {
  const k = new Kit(), wood = MAT.wood('walnut'), w = 1.25, h = 2.1, d = 0.6;
  k.slab(wood, w, h, d, 0, 0.08, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.slab(wood, 0.1, 0.1, 0.1, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08));
  k.box(wood, w + 0.12, 0.12, d + 0.1, 0, h + 0.14, 0);
  k.box(MAT.wood('oak'), w * 0.6, 0.18, 0.06, 0, h + 0.3, d / 2 - 0.05);
  k.box(MAT.wood('oak'), 0.02, h - 0.2, 0.03, 0, h / 2 + 0.08, d / 2 + 0.01, { chamfer: 0 });
  for (const sx of [-1, 1]) k.sphere(MAT.brass(), 0.03, sx * 0.07, 1.15, d / 2 + 0.03, { w: 5, h: 4 });
  k.box(MAT.wood('oak'), w / 2 - 0.18, h - 0.5, 0.02, w / 4, h / 2 + 0.08, d / 2 + 0.005, { chamfer: 0 });
  const gp = new Px(16, 32);
  gp.fill((x, y) => ((x + y * 0.5) % 11 < 2 ? [214, 230, 240] : y < 16 ? [150, 178, 196] : [120, 146, 168]));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 0.22, h - 0.56), new THREE.MeshBasicMaterial({ map: gp.texture({ mip: false }), color: '#c8d8e8' }));
  glass.position.set(-w / 4, h / 2 + 0.08, d / 2 + 0.012);
  k.add(MAT.plain('#d8b868/0.95'), new THREE.ConeGeometry(0.34, 0.16, 10), 0.2, h + 0.36, 0, { rz: 0.15 });
  const g = k.build(); g.add(glass);
  return { group: g, lights: [] };
}
/** a wall shelf of human junk trophies (boot, soda can, phone, sunglasses, diver's mask, reel, rubber duck...) */
function trophyShelf(): PieceModel {
  const k = new Kit(), plank = MAT.wood('oak'), w = 2.2;
  k.slab(MAT.wood('drift'), w, 2.2, 0.05, 0, 0.1, -0.22);
  for (const sx of [-1, 1]) k.slab(plank, 0.07, 2.25, 0.46, sx * (w / 2 - 0.035), 0, 0);
  const ys = [0.1, 0.8, 1.5, 2.2];
  for (const y of ys) { k.slab(plank, w, 0.06, 0.46, 0, y, 0); k.box(MAT.brass(), w, 0.03, 0.02, 0, y + 0.04, 0.23, { chamfer: 0 }); }
  const P = (c: string, r = 0.6, m = 0) => MAT.plain(`${c}/${r}/${m}`);
  let y = ys[1] + 0.06;
  k.box(MAT.leather('black'), 0.15, 0.32, 0.13, -0.8, y + 0.16, 0); k.box(MAT.leather('black'), 0.28, 0.11, 0.14, -0.73, y + 0.055, 0.01);
  k.cyl(P('#c8242a', 0.35, 0.6), 0.05, 0.05, 0.19, -0.35, y + 0.095, 0, { seg: 8 });
  k.box(P('#1a1a1e', 0.2, 0.4), 0.11, 0.22, 0.02, 0.05, y + 0.11, -0.05, { rx: -0.25 });
  k.box(MAT.glow('#5ab8ff'), 0.09, 0.17, 0.003, 0.05, y + 0.115, -0.035, { rx: -0.25, chamfer: 0 });
  for (const s of [-1, 1]) k.cyl(P('#101014', 0.1, 0.5), 0.045, 0.045, 0.014, 0.45 + s * 0.065, y + 0.05, 0.06, { rx: Math.PI / 2 - 0.3, seg: 8 });
  k.add(MAT.metal('red'), new THREE.TorusGeometry(0.1, 0.02, 5, 10, Math.PI * 1.25), 0.85, y + 0.14, 0, { rz: Math.PI * 0.95 });
  y = ys[2] + 0.06;
  k.box(P('#2a2a2e', 0.5), 0.28, 0.15, 0.08, -0.75, y + 0.09, 0);
  k.box(MAT.plain('#9ad8ff/0.1/0.3'), 0.22, 0.1, 0.02, -0.75, y + 0.09, 0.045);
  k.cyl(P('#b8b8c0', 0.3, 0.8), 0.085, 0.085, 0.065, -0.3, y + 0.09, 0, { rx: Math.PI / 2, seg: 10 });
  k.sphere(P('#ffd820', 0.4), 0.075, 0.12, y + 0.075, 0, { w: 7, h: 5, sx: 1.2, sy: 0.85 });
  k.sphere(P('#ffd820', 0.4), 0.05, 0.18, y + 0.17, 0, { w: 6, h: 4 });
  k.box(P('#ff8a20', 0.5), 0.05, 0.02, 0.04, 0.24, y + 0.16, 0, { chamfer: 0 });
  k.cyl(P('#f0c040', 0.25, 0.9), 0.055, 0.055, 0.02, 0.6, y + 0.065, 0, { rx: Math.PI / 2 - 0.4, seg: 10 });
  y = ys[0] + 0.06;
  k.cyl(MAT.plain('#5ac88a/0.1/0.2'), 0.055, 0.055, 0.2, -0.7, y + 0.1, 0, { seg: 7 });
  k.slab(P('#3a6ac8', 0.4, 0.3), 0.24, 0.07, 0.11, -0.2, y, 0);
  k.cyl(P('#3a6ac8', 0.6), 0.065, 0.075, 0.13, 0.3, y + 0.065, 0, { seg: 7 });
  k.sphere(P('#f0c8a0', 0.6), 0.045, 0.3, y + 0.17, 0, { w: 6, h: 4 });
  k.add(P('#d82a2a', 0.6), new THREE.ConeGeometry(0.055, 0.16, 6), 0.3, y + 0.27, 0);
  k.cyl(P('#c8c8d0', 0.3, 0.8), 0.07, 0.07, 0.05, 0.75, y + 0.025, 0, { seg: 9 });
  return { group: k.build(), lights: [] };
}
/** the round brass window set into the north wall's hole (a sea view, cold light) */
function windowPiece(): PieceModel {
  const k = new Kit(), R = 1.05;
  k.add(MAT.brass(), new THREE.TorusGeometry(R + 0.06, 0.13, 6, 20), 0, 0, 0.12);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; k.sphere(MAT.brass(), 0.045, Math.cos(a) * (R + 0.06), Math.sin(a) * (R + 0.06), 0.24, { w: 5, h: 4 }); }
  for (const r of [0, Math.PI / 2]) k.box(MAT.metal('grey'), R * 2, 0.06, 0.06, 0, 0, 0.1, { rz: r });
  const g = k.build();
  const gp = new Px(48, 48);
  gp.fill((x, y) => { const c = [x - 23.5, y - 23.5], r = Math.hypot(c[0], c[1]) / 24; if (r > 1) return null; const t = y / 48; const kelp = (Math.abs(((x + Math.round(Math.sin(y * 0.3) * 2)) % 12) - 6) < 1 && y > 18); return kelp ? [26, 70, 50] : [Math.round(40 + 60 * (1 - t)), Math.round(120 + 90 * (1 - t)), Math.round(150 + 80 * (1 - t))]; });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(R, 22), new THREE.MeshBasicMaterial({ map: gp.texture({ mip: false }), color: new THREE.Color(1.4, 1.5, 1.6) }));
  glass.position.z = 0.04; g.add(glass);
  return { group: g, lights: [{ pos: new THREE.Vector3(0, -0.3, 1.2), color: '#8ad0ff', intensity: 3, dist: 7 }] };
}
/** a sturdy round-topped plank door with iron bands, a porthole and a brass knob, hinged on its left */
function door(): PieceModel {
  const g = new THREE.Group();
  const leaf = new THREE.Group(); leaf.position.set(-DOOR_W / 2 + 0.05, 0, 0); g.add(leaf);
  const k = new Kit(), wood = MAT.wood('oak'), iron = MAT.metal('grey'), w = DOOR_W - 0.1;
  for (let i = 0; i < 6; i++) k.slab(i % 2 ? MAT.wood('pine') : wood, w / 6 - 0.01, 2.25, 0.09, w / 12 + (i * w) / 6, 0, 0);
  for (const y of [0.4, 1.8]) k.box(iron, w, 0.07, 0.11, w / 2, y, 0);
  for (const y of [0.4, 1.8]) for (let i = 0; i < 5; i++) k.sphere(iron, 0.022, 0.15 + i * (w - 0.3) / 4, y, 0.06, { w: 4, h: 3 });
  k.add(MAT.brass(), new THREE.TorusGeometry(0.17, 0.035, 5, 12), w / 2, 1.42, 0.06);
  k.cyl(MAT.plain('#7ac8e8/0.1/0.3'), 0.15, 0.15, 0.02, w / 2, 1.42, 0.04, { rx: Math.PI / 2, seg: 12 });
  k.sphere(MAT.brass(), 0.05, w - 0.16, 1.0, 0.08, { w: 6, h: 4 });
  leaf.add(k.build());
  return { group: g, lights: [], door: leaf };
}

export function pieceModel(id: string): PieceModel | null {
  switch (id) {
    case 'bed': return bed();
    case 'wardrobe': return wardrobe();
    case 'trophy': return trophyShelf();
    case 'window': return windowPiece();
    case 'door': return door();
  }
  return null;
}

// ------------------------------------------------------------------ the goal board
/** a cork board on an easel with a painted paper note (the next build); repaint when the goal changes */
export class GoalBoard {
  group = new THREE.Group();
  private face: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private key = '';
  constructor() {
    const k = new Kit(), wood = MAT.wood('drift');
    for (const s of [-1, 1]) { k.box(wood, 0.06, 1.6, 0.06, s * 0.55, 0.78, 0.05, { rx: -0.12 }); k.box(wood, 0.06, 1.6, 0.06, s * 0.55, 0.78, -0.3, { rx: 0.14 }); }
    k.box(MAT.plain('#9a7448/0.95'), 1.24, 0.92, 0.05, 0, 1.08, 0.06, { rx: -0.12 });
    k.box(MAT.wood('walnut'), 1.32, 0.07, 0.08, 0, 1.56, 0.0, { rx: -0.12 });
    k.box(MAT.wood('walnut'), 1.32, 0.07, 0.08, 0, 0.6, 0.12, { rx: -0.12 });
    for (const [x, y] of [[-0.5, 1.42], [0.5, 1.42]]) k.sphere(MAT.plain('#d82020/0.3'), 0.025, x, y, 0.12, { w: 5, h: 4 });
    this.group.add(k.build());
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), retro(this.mat));
    this.face.position.set(0, 1.08, 0.095); this.face.rotation.x = -0.12;
    this.group.add(this.face);
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  paint(lines: TagLine[]) {
    const key = JSON.stringify(lines);
    if (key === this.key) return;
    this.key = key;
    const cv = paintTag(lines, 'paper', 170, 7);
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    this.mat.map?.dispose(); this.mat.map = t; this.mat.needsUpdate = true;
    const s = Math.min(1.12 / cv.width, 0.82 / cv.height);
    this.face.scale.set(cv.width * s, cv.height * s, 1);
  }
}

// ------------------------------------------------------------------ ghosts (unbuilt spots)
const GHOST = new THREE.MeshBasicMaterial({ color: '#7ad8ff', transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
const GHOST_HOT = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
const EDGE = new THREE.LineBasicMaterial({ color: '#9ae4ff', transparent: true, opacity: 0.7, toneMapped: false });
const EDGE_HOT = new THREE.LineBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 1, toneMapped: false });
/** a translucent blueprint copy of a model (shares geometry); setGhostHot(g, true) warms it */
export function ghostOf(obj: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const c = new THREE.Mesh(m.geometry, GHOST);
    c.matrixAutoUpdate = false;
    c.matrix.copy(inv).multiply(m.matrixWorld);
    c.renderOrder = 5;
    g.add(c);
  });
  // a blueprint frame: the model's bounding box drawn in bright lines
  const box = new THREE.Box3();
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrix); if (b.max.y - b.min.y > 0.06) box.union(b); } });
  if (!box.isEmpty()) {
    const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz.x, sz.y, sz.z)), EDGE);
    e.position.copy(c); e.userData.edge = true;
    g.add(e);
  }
  return g;
}
export function setGhostHot(g: THREE.Object3D, hot: boolean) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.LineSegments).isLineSegments && o.userData.edge) (o as THREE.LineSegments).material = hot ? EDGE_HOT : EDGE;
    else if (m.isMesh) m.material = hot ? GHOST_HOT : GHOST;
  });
}
/** a dashed blueprint outline on the floor (w x d, centred) */
export function floorOutline(w: number, d: number): THREE.LineSegments {
  const pts: number[] = [];
  const dash = 0.18;
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(L / (dash * 2)));
    for (let i = 0; i < n; i++) { const a = (i * 2 * dash) / L, b = Math.min(1, ((i * 2 + 1) * dash) / L); pts.push(x0 + (x1 - x0) * a, 0.03, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, 0.03, z0 + (z1 - z0) * b); }
  };
  edge(-w / 2, -d / 2, w / 2, -d / 2); edge(w / 2, -d / 2, w / 2, d / 2); edge(w / 2, d / 2, -w / 2, d / 2); edge(-w / 2, d / 2, -w / 2, -d / 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#9ae4ff', transparent: true, opacity: 0.85, toneMapped: false }));
}

// ------------------------------------------------------------------ hover outlines
const OUTLINE = new THREE.MeshBasicMaterial({ color: '#ffe08a', side: THREE.BackSide, toneMapped: false });
/** an inverted-hull outline of an object (shares geometry), slightly grown about its centre; add it as a sibling */
export function outlineOf(obj: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const grow = new THREE.Vector3(1 + 0.07 / Math.max(0.2, sz.x), 1 + 0.07 / Math.max(0.2, sz.y), 1 + 0.07 / Math.max(0.2, sz.z));
  const toC = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z), back = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), sc = new THREE.Matrix4().makeScale(grow.x, grow.y, grow.z);
  const pre = back.clone().multiply(sc).multiply(toC);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m.material as THREE.Material).transparent) return;
    const cm = new THREE.Mesh(m.geometry, OUTLINE);
    cm.matrixAutoUpdate = false;
    cm.matrix.copy(pre).multiply(m.matrixWorld);
    g.add(cm);
  });
  g.userData.noPick = true;
  return g;
}
