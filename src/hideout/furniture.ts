// Placed furniture: builds a model per META.built placement, keeps them in sync, validates placements on the
// floor grid (bounds, overlap per layer, wall-backed pieces, the door, uniqueness, and that the hero can still
// walk from the door to every core piece), hands the warm light pool to lamps, and finds walking paths (A*).
import * as THREE from 'three';
import { META, saveMeta, type Placement } from '../meta/meta';
import { BLUEPRINTS, GRID_W, GRID_D, DOOR_CELLS, FIXED_CELLS, footprint, cellsOf, placementCentre, type Blueprint } from './blueprints';
import { buildProp, type Prop } from './models';
import type { Room } from './room';
import { damp } from '../core/math';

export interface Placed { p: Placement; prop: Prop; obj: THREE.Group; pop: number }

const idx = (x: number, z: number) => z * GRID_W + x;

export class Furniture {
  group = new THREE.Group();
  items = new Map<number, Placed>();
  constructor(private room: Room) {}

  sync() {
    const live = new Set(META.built.map((p) => p.uid));
    for (const [uid, it] of this.items) if (!live.has(uid)) { this.dispose(it); this.items.delete(uid); }
    for (const p of META.built) {
      const it = this.items.get(p.uid);
      if (!it) this.add(p, false);
      else { it.p = p; this.place(it); }
    }
    this.assignLights();
  }

  add(p: Placement, pop = true): Placed {
    const prop = buildProp(p.bp);
    const obj = new THREE.Group();
    obj.add(prop.group);
    obj.userData.uid = p.uid;
    const it: Placed = { p, prop, obj, pop: pop ? 0 : 1 };
    this.items.set(p.uid, it);
    this.group.add(obj);
    this.place(it);
    return it;
  }
  private dispose(it: Placed) {
    it.obj.removeFromParent();
    it.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  }
  remove(uid: number) { const it = this.items.get(uid); if (it) { this.dispose(it); this.items.delete(uid); } this.assignLights(); }

  place(it: Placed) {
    const [cx, cz] = placementCentre(it.p);
    it.obj.position.set(cx, 0, cz);
    it.obj.rotation.y = (it.p.rot * Math.PI) / 2;
  }

  byBp(id: string): Placed | undefined { for (const it of this.items.values()) if (it.p.bp === id) return it; return undefined; }

  /** world-space forward (front) direction of a placement */
  static front(rot: number) { return new THREE.Vector3(Math.sin((rot * Math.PI) / 2), 0, Math.cos((rot * Math.PI) / 2)); }

  /** the cell just in front of a placement (where the hero stands to use it), world xz */
  standPoint(it: Placed, out = new THREE.Vector3()) {
    const bp = BLUEPRINTS[it.p.bp];
    const [, d] = bp.size;
    const f = Furniture.front(it.p.rot);
    return out.copy(it.obj.position).addScaledVector(f, d / 2 + 0.55);
  }

  assignLights() {
    const lights: { pos: THREE.Vector3; l: Prop['lights'][0]; it: Placed }[] = [];
    for (const it of this.items.values()) {
      it.obj.updateMatrixWorld(true);
      for (const l of it.prop.lights) lights.push({ pos: l.pos.clone().applyMatrix4(it.obj.matrixWorld), l, it });
    }
    // the first key light (main lamp) gets the shadow-casting spot
    const key = lights.find((L) => L.l.key);
    const kl = this.room.keyLamp;
    if (key) {
      kl.position.copy(key.pos); kl.target.position.copy(key.pos).add(new THREE.Vector3(0.15, -1, 0.1));
      kl.color.set(key.l.color); kl.userData.base = 5 * key.l.intensity; kl.userData.src = key.l;
    } else { kl.userData.base = 0; kl.userData.src = null; kl.intensity = 0; }
    // brightest first
    lights.sort((a, b) => b.l.intensity - a.l.intensity);
    this.room.pool.forEach((pl, i) => {
      const L = lights[i];
      if (!L) { pl.intensity = 0; pl.userData.src = null; return; }
      pl.position.copy(L.pos); pl.color.set(L.l.color); pl.distance = L.l.dist;
      pl.userData.src = L.l; pl.userData.base = L.l.intensity * (L.l.key ? 0.9 : 2.6);
    });
  }

  tick(t: number, dt: number) {
    for (const it of this.items.values()) {
      it.prop.tick?.(t, dt);
      if (it.pop < 1) {
        it.pop = Math.min(1, it.pop + dt * 3.2);
        const k = it.pop, s = 1 + Math.sin(k * Math.PI) * 0.18 * (1 - k * 0.5);
        it.prop.group.scale.set(s * (0.6 + 0.4 * Math.min(1, k * 2)), Math.min(1, k * 1.6) * (2 - s), s * (0.6 + 0.4 * Math.min(1, k * 2)));
      } else it.prop.group.scale.set(1, 1, 1);
      // hinged parts drift back closed unless held open
      for (const d of it.prop.doors ?? []) {
        const tgt = (d.pivot.userData.open ?? 0) as number;
        const cur = (d.pivot.userData.cur ?? 0) as number;
        const nv = damp(cur, tgt, 5, dt);
        d.pivot.userData.cur = nv;
        if (d.axis === 'y') d.pivot.rotation.y = nv * d.open; else d.pivot.rotation.x = nv * d.open;
      }
    }
    for (const pl of [...this.room.pool, this.room.keyLamp]) {
      const src = pl.userData.src as Prop['lights'][0] | null;
      if (!src) continue;
      const f = src.flicker ?? 0;
      const n = f ? 1 - f * 0.25 * (0.5 + 0.5 * Math.sin(t * 17 + pl.id) * Math.sin(t * 7.3 + pl.id * 2)) - (Math.random() < f * 0.02 ? 0.2 : 0) : 1;
      pl.intensity = (pl.userData.base as number) * n;
    }
  }

  /** open/close the hinged parts of a piece (0..1) */
  setOpen(it: Placed, k: number) { for (const d of it.prop.doors ?? []) d.pivot.userData.open = k; }

  /** raycast the furniture; returns the placed piece hit */
  pick(ray: THREE.Raycaster): Placed | null {
    const hits = ray.intersectObject(this.group, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.uid === undefined) o = o.parent;
      if (o) { const it = this.items.get(o.userData.uid as number); if (it) return it; }
    }
    return null;
  }

  // ---------------------------------------------------------------- the grid
  occupancy(skipUid = -1) {
    const obj = new Int32Array(GRID_W * GRID_D), floor = new Int32Array(GRID_W * GRID_D);
    for (const p of META.built) {
      if (p.uid === skipUid) continue;
      const bp = BLUEPRINTS[p.bp]; if (!bp) continue;
      for (const [x, z] of cellsOf(p)) if (x >= 0 && z >= 0 && x < GRID_W && z < GRID_D) (bp.floor ? floor : obj)[idx(x, z)] = p.uid;
    }
    return { obj, floor };
  }

  canPlace(bpId: string, x: number, z: number, rot: number, skipUid = -1): { ok: boolean; reason: string; cells: [number, number][] } {
    const bp = BLUEPRINTS[bpId];
    const cells = cellsOf({ uid: -1, bp: bpId, x, z, rot });
    const fail = (reason: string) => ({ ok: false, reason, cells });
    if (!bp) return fail('unknown');
    const [w, d] = footprint(bp, rot);
    if (x < 0 || z < 0 || x + w > GRID_W || z + d > GRID_D) return fail('Out of the room');
    const occ = this.occupancy(skipUid);
    const layer = bp.floor ? occ.floor : occ.obj;
    for (const [cx, cz] of cells) if (layer[idx(cx, cz)]) return fail('Something is in the way');
    if (!bp.floor) for (const [cx, cz] of cells) if (DOOR_CELLS.some(([a, b]) => a === cx && b === cz)) return fail('Keep the door clear');
    for (const [cx, cz] of cells) if (FIXED_CELLS.some(([a, b]) => a === cx && b === cz)) return fail('The vent stove lives there');
    if (bp.wall) {
      const backOk = rot === 0 ? z === 0 : rot === 1 ? x === 0 : rot === 2 ? z + d === GRID_D : x + w === GRID_W;
      if (!backOk) return fail('Must back onto a wall (R to turn)');
    }
    if (bp.unique && META.built.some((p) => p.bp === bpId && p.uid !== skipUid)) return fail('You already have one');
    // the hero must still reach the door and every core piece
    if (!bp.floor) {
      const block = new Uint8Array(GRID_W * GRID_D);
      for (let i = 0; i < block.length; i++) block[i] = occ.obj[i] ? 1 : 0;
      for (const [fx, fz] of FIXED_CELLS) block[idx(fx, fz)] = 1;
      for (const [cx, cz] of cells) block[idx(cx, cz)] = 1;
      const reach = flood(block, DOOR_CELLS[0]);
      const targets = META.built.filter((p) => p.uid !== skipUid && BLUEPRINTS[p.bp]?.core).map((p) => ({ bp: p.bp, x: p.x, z: p.z, rot: p.rot }));
      if (BLUEPRINTS[bpId].core) targets.push({ bp: bpId, x, z, rot });
      for (const t of targets) {
        const sp = standCell(t);
        if (!sp || !reach[idx(sp[0], sp[1])]) return fail(`That would block the ${BLUEPRINTS[t.bp].name.toLowerCase()}`);
      }
    }
    return { ok: true, reason: '', cells };
  }

  /** A* over free cells from world point a to world point b (returns world xz waypoints, smoothed) */
  path(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
    const occ = this.occupancy();
    const block = new Uint8Array(GRID_W * GRID_D);
    for (let i = 0; i < block.length; i++) block[i] = occ.obj[i] ? 1 : 0;
    for (const [fx, fz] of FIXED_CELLS) block[idx(fx, fz)] = 1;
    const toCell = (v: THREE.Vector3): [number, number] => [Math.max(0, Math.min(GRID_W - 1, Math.floor(v.x + GRID_W / 2))), Math.max(0, Math.min(GRID_D - 1, Math.floor(v.z + GRID_D / 2)))];
    const s = toCell(a), e = toCell(b);
    block[idx(s[0], s[1])] = 0; block[idx(e[0], e[1])] = 0;
    const N = GRID_W * GRID_D;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open: number[] = [idx(s[0], s[1])];
    g[open[0]] = 0;
    const H = (i: number) => Math.hypot((i % GRID_W) - e[0], Math.floor(i / GRID_W) - e[1]);
    const goal = idx(e[0], e[1]);
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (g[open[i]] + H(open[i]) < g[open[bi]] + H(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      closed[cur] = 1;
      const cx = cur % GRID_W, cz = Math.floor(cur / GRID_W);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_D) continue;
        const ni = idx(nx, nz);
        if (block[ni] || closed[ni]) continue;
        if (dx && dz && (block[idx(cx + dx, cz)] || block[idx(cx, cz + dz)])) continue; // no corner cutting
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; if (!open.includes(ni)) open.push(ni); }
      }
    }
    const cells: number[] = [];
    let c = goal;
    if (came[c] < 0 && c !== idx(s[0], s[1])) return [a.clone(), b.clone()];
    while (c >= 0) { cells.unshift(c); c = came[c]; }
    const pts = cells.map((i) => new THREE.Vector3((i % GRID_W) - GRID_W / 2 + 0.5, 0, Math.floor(i / GRID_W) - GRID_D / 2 + 0.5));
    pts[0] = a.clone(); pts.push(b.clone());
    // string-pull: drop waypoints with line of sight
    const free = (p: THREE.Vector3, q: THREE.Vector3) => {
      const n = Math.ceil(p.distanceTo(q) * 4);
      for (let k = 1; k < n; k++) { const v = p.clone().lerp(q, k / n); const [x, z] = toCell(v); if (block[idx(x, z)] && !(x === e[0] && z === e[1]) && !(x === s[0] && z === s[1])) return false; }
      return true;
    };
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !free(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    return out;
  }

  persist() { saveMeta(); }
}

/** flood fill from a cell over unblocked cells */
function flood(block: Uint8Array, start: [number, number]): Uint8Array {
  const seen = new Uint8Array(GRID_W * GRID_D);
  const q = [start];
  seen[idx(start[0], start[1])] = 1;
  while (q.length) {
    const [x, z] = q.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_D) continue;
      const i = idx(nx, nz);
      if (seen[i] || block[i]) continue;
      seen[i] = 1; q.push([nx, nz]);
    }
  }
  return seen;
}
/** the grid cell in front of a placement (null if outside) */
export function standCell(p: { bp: string; x: number; z: number; rot: number }): [number, number] | null {
  const bp: Blueprint = BLUEPRINTS[p.bp];
  const [w, d] = footprint(bp, p.rot);
  const cx = p.x + Math.floor((w - 1) / 2), cz = p.z + Math.floor((d - 1) / 2);
  const r = p.rot % 4;
  const c: [number, number] = r === 0 ? [cx, p.z + d] : r === 1 ? [p.x + w, cz] : r === 2 ? [cx, p.z - 1] : [p.x - 1, cz];
  if (c[0] < 0 || c[1] < 0 || c[0] >= GRID_W || c[1] >= GRID_D) return null;
  return c;
}
