// The v4 HOME: the ruined stone house (pieces.ts shell) with its BUILD SPOTS (rebuild.ts PIECES). Each spot is
// either a ghost (a translucent blueprint copy of the piece over a dashed floor outline and a heap of rubble) or the
// finished piece. Also the goal board, the porch outside the front door (where the packing scene happens), the
// lights (cold and sad while ruined, warming up as pieces come back) and the walk grid with A* paths.
//
//   const h = new House(); scene.add(h.group); h.sync()        rebuild the spots from the save
//   h.spots.get(id) -> { piece, ghost, built, rubble, stand, face }   h.walkable(x, z), h.path(from, to)
//   h.update(dt, t)
import * as THREE from 'three';
import { buildProp } from './models';
import { PIECES, isBuilt, homeProgress, type Piece } from './rebuild';
import { buildShell, pieceModel, ghostOf, floorOutline, rubbleHeap, GoalBoard, IN, WALL_T, DOOR_W, type Shell } from './pieces';
import { damp } from '../core/math';

export interface Spot {
  piece: Piece;
  /** the finished piece (built lazily), placed at the spot */
  built: THREE.Group | null;
  /** the blueprint ghost + outline + rubble shown while unbuilt */
  ghost: THREE.Group;
  rubble: THREE.Group;
  /** where the hero stands to use it / build it, and what it faces */
  stand: THREE.Vector3;
  face: THREE.Vector3;
  /** hinged door leaf (the front door), seat (the sofa), lamp lights */
  door?: THREE.Object3D;
  seat?: THREE.Vector3;
  lights: THREE.PointLight[];
  /** 0..1 the build pop (the build scene grows it) */
  grow: number;
}

/** the porch outside the front door, where the packing scene is set */
export const PORCH = { x0: -3.6, x1: 3.6, z0: IN.z1 + WALL_T, z1: 10.2, set: new THREE.Vector3(0, 0, 7.6), stand: new THREE.Vector3(0, 0, 6.15) };
export const BOARD_AT = new THREE.Vector3(-2.3, 0, 3.35);
export const CRAB_HOME = new THREE.Vector3(-3.35, 0, 2.55);

const CELL = 0.25, GX0 = IN.x0 - 0.5, GZ0 = IN.z0 - 0.5, GW = Math.ceil((IN.x1 - IN.x0 + 1) / CELL), GD = Math.ceil((PORCH.z1 - IN.z0 + 0.5) / CELL);

export class House {
  group = new THREE.Group();
  shell: Shell;
  spots = new Map<string, Spot>();
  board = new GoalBoard();
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  warm: THREE.PointLight;
  porchLamp: THREE.PointLight;
  windowShaft: THREE.Mesh;
  private blocked = new Uint8Array(GW * GD);
  private gridDirty = true;
  /** extra solid circles (Mr. Crab) */
  solids: { x: number; z: number; r: number }[] = [];
  private t = 0;
  private progress = -1;

  constructor() {
    this.shell = buildShell();
    this.group.add(this.shell.group);
    // the goal board stands inside by the front door, facing the room's front (the camera)
    this.board.group.position.copy(BOARD_AT); this.board.group.rotation.y = 0.18;
    this.group.add(this.board.group);
    // ---- lights: a cold key through the broken roof, the water's hemisphere, a warm fill that grows with the home
    this.hemi = new THREE.HemisphereLight('#2e5470', '#1a1410', 0.9);
    this.sun = new THREE.DirectionalLight('#8ac8e8', 1.6);
    this.sun.position.set(2.5, 14, 4); this.sun.target.position.set(0, 0, 0.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 2; sc.far = 30;
    this.sun.shadow.bias = -0.0006;
    this.warm = new THREE.PointLight('#ffb070', 0, 11, 1.4);
    this.warm.position.set(0, 2.6, 0);
    this.porchLamp = new THREE.PointLight('#ffb468', 3.5, 7, 1.5);
    this.porchLamp.position.set(2.5, 1.9, 7.0);
    this.group.add(this.hemi, this.sun, this.sun.target, this.warm, this.porchLamp, new THREE.AmbientLight('#1a2030', 0.35));
    // the window's cold shaft of light (shown once the window is built)
    const g = new THREE.PlaneGeometry(1.9, 4.4); g.translate(0, -2.2, 0);
    this.windowShaft = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#7ad8ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.windowShaft.position.set(0, 2.5, IN.z0 + 0.3); this.windowShaft.rotation.x = -0.75; this.windowShaft.renderOrder = 7;
    this.group.add(this.windowShaft);
    // ---- the porch: flat stepping stones out of the door, a lantern post
    const porch = new THREE.Group();
    this.group.add(porch);
    for (const s of PIECES) this.makeSpot(s);
  }

  // ---------------------------------------------------------------- spots
  private place(o: THREE.Object3D, p: Piece) {
    o.position.set(p.x, p.wall ?? 0, p.z);
    o.rotation.y = p.yaw;
  }
  private model(p: Piece): { group: THREE.Group; door?: THREE.Object3D; seat?: THREE.Vector3; lights: { pos: THREE.Vector3; color: string; intensity: number; dist: number }[] } {
    const custom = pieceModel(p.id);
    if (custom) return custom;
    const bp = p.id === 'stash' ? 'storage' : p.id === 'lampA' || p.id === 'lampB' ? 'lamp' : p.id;
    const prop = buildProp(bp);
    if (p.id === 'sofa') {
      // the sofa comes with its rug
      const rug = buildProp('rug');
      rug.group.position.set(0, 0, -0.9); rug.group.scale.set(0.8, 1, 0.8);
      prop.group.add(rug.group);
    }
    return { group: prop.group, seat: prop.seat, lights: prop.lights };
  }
  private makeSpot(p: Piece) {
    // the ghost: a blueprint copy of the model at the spot, a dashed outline on the floor, rubble on it
    const m = this.model(p);
    const ghost = new THREE.Group();
    const gh = ghostOf(m.group);
    ghost.add(gh);
    if (!p.wall) { const ol = floorOutline(p.w + 0.2, p.d + 0.2); ghost.add(ol); }
    this.place(ghost, p);
    ghost.userData.spot = p.id;
    this.group.add(ghost);
    const rubble = rubbleHeap(p.wall ? 4 : 6, p.x * 7 + p.z * 3);
    rubble.position.set(p.x + (p.wall !== undefined && p.id !== 'door' ? 0 : 0.2), 0, p.wall !== undefined ? p.z + (p.z < 0 ? 0.55 : -0.55) : p.z + 0.1);
    rubble.scale.setScalar(p.wall ? 0.7 : 0.85);
    this.group.add(rubble);
    // where to stand: in front of the piece (its +z front turned by yaw), 0.75 m out; wall pieces from the room side
    const f = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const reach = (p.wall !== undefined ? 0.6 : p.d / 2 + 0.55);
    const stand = new THREE.Vector3(p.x, 0, p.z).addScaledVector(f, reach);
    if (p.id === 'door') stand.set(0, 0, IN.z1 - 0.7);
    if (p.id === 'window') stand.set(0.9, 0, IN.z0 + 0.95);
    if (p.id === 'trophy') stand.set(p.x, 0, IN.z0 + 1.05);
    const face = new THREE.Vector3(p.x, (p.wall ?? 0) + 0.8, p.z);
    const spot: Spot = { piece: p, built: null, ghost, rubble, stand, face, lights: [], grow: 0 };
    this.spots.set(p.id, spot);
  }
  /** build the finished model for a spot (once) */
  private ensureBuilt(s: Spot) {
    if (s.built) return;
    const m = this.model(s.piece);
    const g = new THREE.Group(); g.add(m.group);
    this.place(g, s.piece);
    g.userData.spot = s.piece.id;
    g.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = true; } });
    this.group.add(g);
    s.built = g; s.door = m.door; s.seat = m.seat;
    for (const L of m.lights) {
      const l = new THREE.PointLight(L.color, 0, L.dist, 1.5);
      g.updateMatrixWorld(true);
      l.position.copy(L.pos.clone().applyMatrix4(g.matrixWorld));
      l.userData.base = L.intensity * 2.2;
      this.group.add(l); s.lights.push(l);
    }
  }
  /** show every spot as built or as a ghost, from the save */
  sync() {
    for (const s of this.spots.values()) {
      const b = isBuilt(s.piece.id);
      if (b) { this.ensureBuilt(s); s.grow = Math.max(s.grow, 1); }
      if (s.built) s.built.visible = b;
      s.ghost.visible = !b; s.rubble.visible = !b;
    }
    this.shell.windowHole.visible = !isBuilt('window');
    this.gridDirty = true;
  }
  /** the build scene: show the piece growing in (0..1) and the ghost / rubble going */
  setGrow(id: string, k: number) {
    const s = this.spots.get(id); if (!s) return;
    this.ensureBuilt(s);
    s.grow = k;
    const b = s.built!;
    b.visible = k > 0.02;
    const e = k < 1 ? Math.min(1, k * 1.15) : 1, over = Math.sin(Math.min(1, k) * Math.PI) * 0.12;
    b.scale.set(e + over, Math.max(0.02, e), e + over);
    s.ghost.visible = k < 0.3;
    s.rubble.visible = k < 0.15;
    if (k >= 1) { b.scale.set(1, 1, 1); this.gridDirty = true; }
  }

  // ---------------------------------------------------------------- walking
  private rebuildGrid() {
    this.gridDirty = false;
    const B = this.blocked;
    B.fill(0);
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
      const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (j + 0.5) * CELL;
      const inside = x > IN.x0 + 0.3 && x < IN.x1 - 0.3 && z > IN.z0 + 0.35 && z < IN.z1 - 0.3;
      const doorway = Math.abs(x) < DOOR_W / 2 - 0.2 && z >= IN.z1 - 0.4 && z <= IN.z1 + WALL_T + 0.3;
      const porch = x > PORCH.x0 && x < PORCH.x1 && z > IN.z1 + WALL_T - 0.05 && z < PORCH.z1;
      if (!inside && !doorway && !porch) { B[j * GW + i] = 1; continue; }
      // the packing set on the porch
      if (porch && Math.abs(x - PORCH.set.x) < 2.3 && Math.abs(z - PORCH.set.z) < 0.75) B[j * GW + i] = 1;
    }
    const box = (cx: number, cz: number, w: number, d: number, yaw: number, pad = 0.18) => {
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hw = (w * c + d * s) / 2 + pad, hd = (w * s + d * c) / 2 + pad;
      for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
        const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (j + 0.5) * CELL;
        if (Math.abs(x - cx) < hw && Math.abs(z - cz) < hd) B[j * GW + i] = 1;
      }
    };
    for (const s of this.spots.values()) {
      const p = s.piece;
      if (p.wall !== undefined && p.id !== 'trophy') continue;
      if (isBuilt(p.id) || s.grow > 0.5) box(p.x, p.z, p.w, p.d, p.yaw);
    }
    box(BOARD_AT.x, BOARD_AT.z, 1.3, 0.5, 0.18);
    // the fallen beam and the corner heaps while the house is a ruin
    if (this.shell.rubble[0]?.visible) { box(-4.7, 3.0, 1.5, 2.2, 0); box(4.9, 3.6, 1.1, 1.1, 0); box(5.3, 1.7, 1.0, 1.0, 0); }
  }
  private cellOf(x: number, z: number): [number, number] { return [Math.floor((x - GX0) / CELL), Math.floor((z - GZ0) / CELL)]; }
  private free(i: number, j: number) { return i >= 0 && j >= 0 && i < GW && j < GD && !this.blocked[j * GW + i]; }
  /** can the hero (radius r) stand at (x, z) */
  walkable(x: number, z: number, r = 0.26): boolean {
    if (this.gridDirty) this.rebuildGrid();
    for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) { const [i, j] = this.cellOf(x + dx, z + dz); if (!this.free(i, j)) return false; }
    for (const s of this.solids) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
    return true;
  }
  /** the nearest walkable point to (x, z) (a spiral search), or null */
  nearestWalkable(x: number, z: number): THREE.Vector3 | null {
    if (this.walkable(x, z)) return new THREE.Vector3(x, 0, z);
    for (let r = CELL; r < 3; r += CELL) for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
      if (this.walkable(px, pz)) return new THREE.Vector3(px, 0, pz);
    }
    return null;
  }
  /** A* over the walk grid (8-way, no corner cutting), string-pulled; [] when unreachable */
  path(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
    if (this.gridDirty) this.rebuildGrid();
    const s = this.cellOf(a.x, a.z), e = this.cellOf(b.x, b.z);
    const ok = (i: number, j: number) => this.free(i, j) && this.walkable(GX0 + (i + 0.5) * CELL, GZ0 + (j + 0.5) * CELL);
    if (!ok(e[0], e[1])) return [];
    const N = GW * GD, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const si = s[1] * GW + s[0], ei = e[1] * GW + e[0];
    if (si < 0 || si >= N) return [];
    const open = [si]; g[si] = 0;
    const H = (i: number) => Math.hypot((i % GW) - e[0], Math.floor(i / GW) - e[1]);
    let found = false, iter = 0;
    while (open.length && iter++ < 6000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + H(open[k]) < g[open[bi]] + H(open[bi])) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === ei) { found = true; break; }
      closed[cur] = 1;
      const cx = cur % GW, cz = Math.floor(cur / GW);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!ok(nx, nz)) continue;
        const ni = nz * GW + nx;
        if (closed[ni]) continue;
        if (dx && dz && (!ok(cx + dx, cz) || !ok(cx, cz + dz))) continue;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; if (!open.includes(ni)) open.push(ni); }
      }
    }
    if (!found) return [];
    const cells: number[] = [];
    for (let c = ei; c >= 0; c = came[c]) { cells.unshift(c); if (c === si) break; }
    const pts = cells.map((i) => new THREE.Vector3(GX0 + ((i % GW) + 0.5) * CELL, 0, GZ0 + (Math.floor(i / GW) + 0.5) * CELL));
    pts[0] = a.clone().setY(0); pts.push(b.clone().setY(0));
    // string-pull
    const clear = (p: THREE.Vector3, q: THREE.Vector3) => { const n = Math.ceil(p.distanceTo(q) / (CELL * 0.5)); for (let k = 1; k < n; k++) { const v = p.clone().lerp(q, k / n); if (!this.walkable(v.x, v.z, 0.22)) return false; } return true; };
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clear(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    return out;
  }

  /** the lighting warms as the home comes back (ruined: cold blue and sad; rebuilt: cosy amber) */
  update(dt: number, t: number) {
    this.t = t;
    const pr = homeProgress();
    if (this.progress < 0) this.progress = pr;
    this.progress = damp(this.progress, pr, 2, dt);
    const k = this.progress;
    this.hemi.color.setRGB(0.18 + k * 0.12, 0.33 + k * 0.05, 0.44 - k * 0.08);
    this.hemi.groundColor.setRGB(0.1 + k * 0.2, 0.08 + k * 0.12, 0.06 + k * 0.04);
    this.hemi.intensity = 0.8 + k * 0.35;
    this.sun.intensity = 1.7 - k * 0.5;
    this.warm.intensity = k * 6 * (0.95 + 0.05 * Math.sin(t * 7) * Math.sin(t * 3.1));
    for (const s of this.shell.shafts) (s.material as THREE.MeshBasicMaterial).opacity = (0.16 - k * 0.07) * (0.7 + 0.3 * Math.sin(t * 0.4 + s.position.x));
    for (const s of this.shell.sway) s.o.rotation.z = Math.sin(t * s.f + s.ph) * s.amp;
    for (const r of this.shell.rubble) r.visible = k < 0.55;
    const win = isBuilt('window');
    this.windowShaft.visible = win;
    (this.windowShaft.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.04 * Math.sin(t * 0.5);
    for (const s of this.spots.values()) for (const l of s.lights) l.intensity = s.built?.visible ? (l.userData.base as number) * Math.min(1, s.grow) * (0.92 + 0.08 * Math.sin(t * 9 + l.id) * Math.sin(t * 3.7)) : 0;
    this.porchLamp.intensity = 3.5 * (0.9 + 0.1 * Math.sin(t * 6.3) * Math.sin(t * 2.9));
  }
  get rubbleGone() { return !this.shell.rubble[0]?.visible; }
}
