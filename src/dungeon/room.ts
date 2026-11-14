// One dungeon room: a side-view 2.5D arena of ROOM_W x ROOM_H metres dressed with its area's art, composed from
// the area builders (read-only): Scenery (sand strip, front cross-section, 3D seabed, rocks, flora, MOLEFORGE
// meadow, verlet kelp), the area's landmarks + rock dressing + foreground frame, the Detail layer (critters,
// abyss life, motes) and marine snow. On top of that this file adds the room's own shell:
//   walls   - stacked boulders framing x = ±HALF_W, with the side door gaps (lintel rocks over a passage);
//   ceiling - hanging rock (stalactites) for cave rooms, a broken lip with skylights for open-water rooms;
//   back    - a rock wall far behind the arena (with windows into the deep in open rooms);
//   arena   - per-layout obstacle rocks with collision (combat rooms), the bottom shaft as a pit in the sand;
//   gates   - the door gates (src/dungeon/doors.ts) are added by the run screen.
//
//   const room = new RoomBuild(world, floor, node);   // builds now (~a frame or three); world.terrain = room.terrain
//   room.bind(world)                                  // re-point the shared shader uniforms (sand, meadow light)
//   room.update(dt, camX); room.impact(x, y, r, k); room.dispose()
import * as THREE from 'three';
import type { World, Entity } from '../game/types';
import type { Arena } from '../combat/types';
import { areaDef, type AreaDef } from '../area/defs';
import type { Shape } from '../area/shape';
import { SEAM_Z } from '../area/shape';
import { Scenery } from '../area/scenery';
import { buildLandmarks, dressRocks, foregroundFrame } from '../area/landmarks';
import { Detail } from '../area/detail';
import { SandField } from '../world/sand';
import { ENV } from '../world/mats';
import { MEADOW, meadowLook } from '../world/meadow';
import { MarineSnow } from '../world/ocean';
import { Soup, mat4 } from '../world/lp';
import { crustPainter } from '../world/rockgen';
import { Rng } from '../core/rng';
import { fbm, smooth, damp, hash2 } from '../core/math';
import { hex } from '../gfx/px';
import type { LampHandle } from '../gfx/lighting';
import { RoomTerrain, ROOM_H, HALF_W, DOOR_Y0, DOOR_Y1, SHAFT_HW, TUNNEL } from './terrain';
import type { Floor, RoomNode, Dir } from './floor';
import { doorOpenable } from './floor';

/** the seabed level rooms sit on, per area (the area looks were tuned for these depths) */
export const ROOM_FLOOR: Record<string, number> = { reef: -14, kelp: -15, graveyard: -16, arctic: -15.5, abyss: -24 };
const SX0 = -36, SX1 = 36;

const rgb = (c: string, k = 1): [number, number, number] => { const h = hex(c); return [h[0] / 255 * k, h[1] / 255 * k, h[2] / 255 * k]; };

/** which doors the room has, and which of them are real openings (cracked walls only once bombed) */
export function roomDoors(rm: RoomNode): Record<Dir, boolean> {
  return { L: rm.doors.L !== undefined, R: rm.doors.R !== undefined, U: rm.doors.U !== undefined, D: rm.doors.D !== undefined };
}

function roomShape(a: AreaDef, F: number, rm: RoomNode): Shape {
  const s = rm.seed % 9973;
  const hasD = rm.doors.D !== undefined;
  const bedRaw = (x: number) => {
    const ax = Math.abs(x);
    let y = F - 0.5 + (fbm(x * 0.16, 1.3, 2, s) - 0.5) * 0.5;
    // the arena floor dips a touch in the middle and rises into the walls' feet
    y += smooth(HALF_W - 3, HALF_W + 0.5, ax) * 0.25;
    // past the walls: the passage floors, then rising rock
    y += smooth(HALF_W + TUNNEL - 1, HALF_W + TUNNEL + 6, ax) * 6;
    return y;
  };
  const bed = (x: number) => {
    let y = bedRaw(x);
    if (hasD) { const k = smooth(SHAFT_HW + 0.5, SHAFT_HW - 0.2, Math.abs(x)); y = y * (1 - k) + (F - 9) * k; }
    return y;
  };
  const sand0 = (x: number) => {
    let t = 0.55 + fbm(x * 0.07, 7.7, 2, s + 21) * 0.4;
    if (hasD) t *= smooth(SHAFT_HW + 0.4, SHAFT_HW + 1.8, Math.abs(x));
    return Math.max(0, t);
  };
  const open = rm.roof === 'open';
  const back = (x: number, z: number) => {
    const seam = bed(x) + sand0(x);
    const k = smooth(SEAM_Z, -10, z);
    const rise = smooth(-5, -20, z);
    let b = F - 0.2 + rise * 2.2 * (0.6 + 0.8 * fbm(x * 0.03, z * 0.04, 2, s + 31));
    b += (fbm(x * 0.09, z * 0.11, 3, s + 32) - 0.5) * 1.1;
    // open rooms: the seabed falls away into the blue behind the back wall
    if (open) b -= smooth(-20, -48, z) * 7;
    else b += smooth(-22, -40, z) * 5;
    if (a.id === 'abyss') b -= smooth(-18, -44, z) * 6;
    const h = seam * (1 - k) + b * k;
    return Math.min(h, F + ROOM_H - 1.5);
  };
  return { X0: SX0, X1: SX1, bed, sand0, back, wreckX: 999, buoyX: 1999, spawnX: -1999, hallX: 0, galleonX: -6 };
}

export interface RoomOpts {
  /** skip the heavy landmark set pieces (galleons, colossi) */
  light?: boolean;
  /** called before the scenery finishes (props that paint into the scenery's atlases, e.g. the manatee) */
  prefinish?: (scen: Scenery, room: RoomBuild) => void;
}

export class RoomBuild {
  a: AreaDef;
  F: number;
  top: number;
  group = new THREE.Group();
  scen: Scenery;
  sand: SandField;
  terrain: RoomTerrain;
  detail: Detail;
  snow: MarineSnow;
  arena: Arena;
  /** the area's lighting look */
  get look() { return this.a.look; }
  /** extra updaters (props, gates, crab, manatee) */
  updaters: ((dt: number, t: number) => void)[] = [];
  disposers: (() => void)[] = [];
  /** solid circles inside the arena (obstacle rocks) */
  obstacles: { x: number; y: number; r: number }[] = [];
  /** world entities owned by the room (plant field) */
  owned: Entity[] = [];
  private t = 0;
  private glowLamps: LampHandle[] = [];
  private near: { x: number; y: number; z: number; col: string; k: number; d: number }[] = [];
  private onBoom: (d: Record<string, unknown>) => void;
  buildMs = 0;

  constructor(public world: World, public floor: Floor, public node: RoomNode, o: RoomOpts = {}) {
    const t0 = performance.now();
    const a = this.a = areaDef(floor.area);
    const F = this.F = ROOM_FLOOR[a.id] ?? -14;
    this.top = F + ROOM_H;
    const shape = roomShape(a, F, node);
    const sand = this.sand = new SandField(shape.X0 - 30, shape.X1 + 30, shape.bed, shape.sand0);
    const terrain = this.terrain = new RoomTerrain(sand, F, -HALF_W - TUNNEL - 1, HALF_W + TUNNEL + 1);
    for (const d of ['L', 'R', 'U', 'D'] as Dir[]) terrain.doors[d] = { dir: d, exists: doorOpenable(node, d), shut: () => 1 };
    this.arena = { x0: -HALF_W, x1: HALF_W, floor: F, top: this.top };
    const seed = node.seed;
    const scen = this.scen = new Scenery(a, shape, sand, terrain, seed);
    // keep the arena's play band free of the scenery's random collision rocks (the grass still grows)
    scen.reserved.push({ x: 0, r: HALF_W + TUNNEL + 2, z0: -0.4, z1: 0.3 });
    // and the door passages / shafts clear of flora
    for (const s of [-1, 1]) scen.reserved.push({ x: s * (HALF_W + 1.5), r: 3.2, z0: -1.8, z1: 1.7 });
    scen.reserved.push({ x: 0, r: SHAFT_HW + 1.2, z0: -1.6, z1: 1.6 });
    scen.build();
    const r = new Rng(seed ^ 0x77e11);
    this.buildShell(r);
    if (!o.light) buildLandmarks(scen, this.group, world);
    else { dressRocks(scen); foregroundFrame(scen); }
    this.buildObstacles(r);
    this.flushShell();
    this.detail = new Detail(scen, world, seed);
    o.prefinish?.(scen, this);
    scen.finish();
    this.group.name = `room:${a.id}:${node.id}`;
    this.group.add(scen.group, this.detail.group);
    // the abyss / arctic landmark builders may install their own ceiling; the room's box is the ceiling
    terrain.ceiling = null;
    this.snow = new MarineSnow(a.snow, a.snowCol);
    this.group.add(this.snow.points);
    this.snow.setScale(world.game.h * Math.min(devicePixelRatio || 1, 1.5), world.camera.fov);
    // swords cut the seaweed
    const plantField: Entity = {
      kind: 'plants', team: 'neutral', x: 0, y: 0, vx: 0, vy: 0, r: 0, alive: true, update() {},
      slash(ax: number, ay: number, bx: number, by: number) { return scen.sim.cut(ax, ay, bx, by) > 0; },
    };
    this.owned.push(plantField);
    scen.sim.onCut = (x, y) => { world.fx.burst('bubble', x, y, 4, 1); world.fx.debrisBurst(x, y, 4, '#8a7224', 1.5, 0.04); world.sfx('sw_swish1', x, 0.4, 1.4); };
    // silt + sand spray
    const silt = new THREE.Color(a.pal.silt);
    sand.onPuff = (x, y, k) => {
      const n = Math.round(3 + k * 7);
      world.fx.emit('ink', x, y + 0.1, { n, spread: 0.25 + k * 0.25, vy: 0.25 + k * 0.2, speed: 0.4 + k * 0.6, life: 2.2 + k, size: 0.35 + k * 0.15, size1: 0.9 + k * 0.6, color: silt, alpha: 0.5, grav: 0.05, drag: 2.2 });
    };
    sand.onSpray = (x, y, k) => { world.fx.debrisBurst(x, y, Math.round(6 + k * 8), a.pal.sand[2], 3 + k * 2, 0.05); };
    this.onBoom = (d) => { if (typeof d.x === 'number' && typeof d.y === 'number') this.impact(d.x, d.y, (d.r as number) ?? 1.6, (d.k as number) ?? 1); };
    this.buildMs = performance.now() - t0;
  }

  /** make this room the live one: terrain, shared uniforms, events */
  bind(world: World) {
    (world as { terrain: unknown }).terrain = this.terrain;
    world.fx.floorAt = (x) => this.terrain.floorAt(x);
    this.sand.bind();
    const L = this.a.look;
    meadowLook(L.sun, L.sunI, L.hemiSky, L.hemiGround, L.hemi);
    world.run.on('explosion', this.onBoom);
    for (const e of this.owned) { e.alive = true; if (!world.entities.includes(e)) world.entities.push(e); }
    if (!this.group.parent) world.scene.add(this.group);
  }
  /** the room is no longer live (cached or about to be disposed) */
  unbind(world: World) {
    const l = world.run.hooks.get('explosion'); if (l) world.run.hooks.set('explosion', l.filter((f) => f !== this.onBoom));
    for (const e of this.owned) e.alive = false;
    this.group.removeFromParent();
    this.setLighting(null);
  }

  setLighting(rig: { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null) {
    for (const l of this.glowLamps) l.release();
    this.glowLamps.length = 0;
    const n = this.a.glow ? 3 : this.scen.glowPts.length ? 1 : 0;
    if (rig) for (let i = 0; i < n; i++) { const l = rig.lamp(0, -999, 0, '#5af0ff', 0, 7); if (l) this.glowLamps.push(l); }
  }

  impact(x: number, y: number, r = 1.5, k = 1) {
    this.sand.impact(x, y, r, k);
    ENV.uBlast.value.set(x, y, 0, Math.min(1.5, k));
    this.scen.sim.impulse(x, y, r, k);
    this.detail.scare(x, y, r * 3);
  }

  update(dt: number, camX: number) {
    this.t += dt;
    const w = this.world, p = w.player, t = this.t;
    this.sand.stir(p.x, p.y, p.vx, p.vy, p.r, dt);
    ENV.uPush.value.set(p.x, p.y, 1.4, Math.min(1, Math.hypot(p.vx, p.vy) / 4 + 0.35));
    ENV.uBlast.value.z += dt;
    ENV.uCurrent.value = damp(ENV.uCurrent.value, 0.18 + Math.sin(t * 0.13) * 0.12, 1, dt);
    this.sand.step(dt);
    const pu = MEADOW.uPushers.value;
    pu[0].set(p.x, p.y, p.r, Math.min(1.2, 0.5 + Math.hypot(p.vx, p.vy) / 4));
    let k = 1;
    for (const e of w.entities) {
      if (k >= pu.length) break;
      if (!e.alive || !e.obj || e.kind === 'plants' || e.kind === 'pickup') continue;
      pu[k++].set(e.x, e.y, Math.max(0.25, Math.min(1.5, e.r)), Math.min(1.1, 0.4 + Math.hypot(e.vx, e.vy) / 4));
    }
    for (; k < pu.length; k++) pu[k].set(0, -999, 0, 0);
    this.scen.sim.update(dt, w, camX);
    this.scen.update(dt, camX, t);
    this.detail.update(dt, camX);
    this.snow.update(camX, p.y, t);
    for (const u of this.updaters) u(dt, t);
    if (this.glowLamps.length) {
      let nn = 0;
      const near = this.near;
      const put = (g: { x: number; y: number; z: number; col: string }, kk: number, d: number) => { const o = near[nn] ?? (near[nn] = { x: 0, y: 0, z: 0, col: '', k: 0, d: 0 }); o.x = g.x; o.y = g.y; o.z = g.z; o.col = g.col; o.k = kk; o.d = d; nn++; };
      for (const g of this.scen.glowPts) if (Math.abs(g.x - camX) < 13) put(g, 1, Math.abs(g.x - camX));
      for (const g of this.scen.glowDyn) put(g, g.k, Math.abs(g.x - camX) + 1.5);
      near.length = nn;
      near.sort((a, b) => a.d - b.d);
      this.glowLamps.forEach((l, i) => {
        const g = near[i];
        if (!g) { l.light.intensity = 0; return; }
        l.set(g.x, g.y, g.z); l.light.color.set(g.col);
        l.light.intensity = 4.5 * g.k * (0.8 + 0.2 * Math.sin(t * 1.7 + i * 2));
        l.light.distance = 7;
      });
    }
  }

  dispose() {
    this.setLighting(null);
    for (const d of this.disposers) d();
    this.detail.dispose();
    this.scen.sim.dispose();
    this.scen.dispose();
    this.sand.dispose();
    this.snow.points.geometry.dispose();
    (this.snow.points.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }

  // ------------------------------------------------------------------ the rock shell
  private soups = { near: new Soup(), far: new Soup(), roof: new Soup(), fg: new Soup() };

  private rock(soup: Soup, kind: 'boulder' | 'bigboulder' | 'spire' | 'slab', x: number, y: number, z: number, sx: number, sy: number, sz: number, o: { flip?: boolean; ry?: number; tint?: number; topK?: number } = {}) {
    const r = this.scen.rng;
    const from = soup.count;
    const shp = r.pick(this.scen.shapes(kind === 'slab' ? 'slab' : kind));
    const ry = o.ry ?? r.range(0, 6);
    if (o.flip) soup.append(shp, mat4(x, y + sy, z, sx, sy, sz, ry, Math.PI, 0));
    else soup.append(shp, mat4(x, y, z, sx, sy, sz, ry, (r.next() - 0.5) * 0.2, (r.next() - 0.5) * 0.2));
    const t = o.tint ?? r.range(0.85, 1.1);
    crustPainter([t, t * r.range(0.97, 1.03), t * r.range(0.96, 1.04)], rgb(this.a.pal.rockTop, 1.25), o.topK ?? 0.6, from, soup);
  }

  private buildShell(r: Rng) {
    const F = this.F, top = this.top, node = this.node;
    const S = this.soups;
    const hasDoor = (d: Dir) => node.doors[d] !== undefined;
    const g0 = F + DOOR_Y0, g1 = F + DOOR_Y1;
    // ---- side walls: columns of boulders, each wall face just outside x = ±HALF_W
    for (const side of [-1, 1]) {
      const door = hasDoor(side < 0 ? 'L' : 'R');
      for (let zi = 0; zi < 5; zi++) {
        const z = [-9, -5.5, -2.6, 0.2, 2.6][zi];
        const nearZ = z > -4;
        for (let y = F - 1.5; y < top + 2; ) {
          const R = r.range(1.4, 2.3);
          const H = r.range(1.6, 2.8);
          // the door gap: no wall rock from the sand up to the lintel for the passage rows
          if (door && nearZ && y + H > g0 - 1.2 && y < g1) { y = g1; continue; }
          const inset = zi === 4 ? 0.9 : zi === 0 ? -0.6 : 0.15;
          const x = side * (HALF_W + R * 0.9 + inset + r.range(0, 0.4));
          this.rock(nearZ ? S.near : S.far, 'bigboulder', x, y, z + r.range(-0.5, 0.5), R, H, r.range(1.4, 2.2), { tint: zi === 4 ? 0.55 : undefined });
          y += H * r.range(0.62, 0.8);
        }
      }
      if (door) {
        // the passage: a lintel slab over the gap running out to the tunnel's end, and a dark back plate
        for (let k = 0; k < 3; k++) {
          const x = side * (HALF_W + 0.6 + k * 2.2);
          this.rock(S.near, 'slab', x, g1 - 0.1, r.range(-1.5, 1.5), 1.6, 1.4, 2.4, { ry: 0 });
        }
        for (let k = 0; k < 3; k++) {
          const x = side * (HALF_W + 1.2 + k * 2.2);
          this.rock(S.far, 'bigboulder', x, F - 1, -3.4, 1.4, g1 - F + 1.5, 1.2, { tint: 0.5 });
          this.rock(S.fg, 'bigboulder', x + side * 0.4, F - 1, 2.9, 1.5, g1 - F + 1.6, 0.8, { tint: 0.3, topK: 0.2 });
        }
      }
    }
    // ---- ceiling: hanging rock along the top; open rooms leave skylights, cave rooms grow stalactites
    const open = node.roof === 'open';
    const up = hasDoor('U');
    for (let x = -HALF_W - 4; x < HALF_W + 4; ) {
      const R = r.range(1.6, 2.6);
      if (up && Math.abs(x) < SHAFT_HW + R * 0.6) { x = SHAFT_HW + R * 0.75; continue; }
      const skylight = open && r.chance(0.35) && Math.abs(x) < HALF_W - 2;
      if (!skylight) {
        for (const z of [-6, -2.2, 1.2]) {
          const sy = r.range(2.2, 3.4);
          this.rock(S.roof, 'bigboulder', x + r.range(-0.6, 0.6), top - r.range(0.2, 0.7), z + r.range(-0.6, 0.6), R, sy, r.range(1.6, 2.4), { flip: true, topK: 0.1 });
        }
        if (!open && r.chance(0.45) && Math.abs(x) < HALF_W - 1.5) {
          const L = r.range(1.0, 2.4);
          this.rock(S.roof, 'spire', x + r.range(-0.4, 0.4), top - L - 0.2, r.range(-1.8, -0.4), r.range(0.35, 0.6), L, r.range(0.35, 0.6), { flip: true, topK: 0 });
        }
      }
      x += R * r.range(1.1, 1.5);
    }
    if (up) {
      // the shaft walls going up
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) this.rock(S.roof, 'bigboulder', s * (SHAFT_HW + 1.3), top - 0.3 + k * 2.2, r.range(-2, 1.5), 1.4, 2.4, 1.6);
    }
    // ---- the back wall, far behind the arena (windows into the deep in open rooms)
    for (let x = -HALF_W - 10; x < HALF_W + 10; ) {
      const R = r.range(2.6, 4.2);
      const window = open && Math.abs(x) < HALF_W - 3 && r.chance(0.4);
      const z = r.range(-17, -13.5);
      if (!window) for (let y = F - 2; y < top + 2; y += R * 1.1) this.rock(S.far, 'bigboulder', x, y, z, R, R * 1.3, R);
      else this.rock(S.far, 'bigboulder', x, F - 2, z, R, R * 0.9, R);
      x += R * r.range(1.2, 1.5);
    }
    // ---- foreground: dark rocks framing the bottom corners and a lip under the ceiling
    for (const s of [-1, 1]) {
      this.rock(S.fg, 'bigboulder', s * (HALF_W - 1.2 + r.range(-0.5, 0.5)), F - 1.4, 3.0, r.range(1.8, 2.6), r.range(1.6, 2.4), 0.9, { tint: 0.28, topK: 0.2 });
      this.rock(S.fg, 'bigboulder', s * (HALF_W - 0.8), top - 1.3, 3.1, r.range(2.2, 3.0), r.range(2.6, 3.4), 0.9, { tint: 0.22, topK: 0 });
    }
  }

  /** merge the shell soups into meshes (after the obstacles have been added) */
  private flushShell() {
    const S = this.soups;
    const mat = this.scen.mats.rock;
    const add = (s: Soup, cast: boolean) => {
      if (!s.count) return;
      const g = s.geometry();
      if (g.boundingSphere) g.boundingSphere.radius += 1;
      const m = new THREE.Mesh(g, mat);
      m.castShadow = cast; m.receiveShadow = true;
      this.group.add(m);
      this.disposers.push(() => g.dispose());
    };
    // the roof casts no shadow: the sun still dapples the arena through it (a cave lit from the front)
    add(S.near, true); add(S.far, false); add(S.roof, false); add(S.fg, false);
  }

  // ------------------------------------------------------------------ arena obstacles (with collision)
  private buildObstacles(r: Rng) {
    const node = this.node, F = this.F;
    if (node.type !== 'combat' && node.type !== 'challenge') return;
    const scen = this.scen, T = this.terrain;
    const keepOut = (x: number, y: number, R: number) => {
      const ax = Math.abs(x);
      if (ax + R > HALF_W - 3.2 && y < F + DOOR_Y1 + 1) return true; // side doors
      if (ax - R < SHAFT_HW + 1.2 && (node.doors.U !== undefined || node.doors.D !== undefined)) return true;
      return false;
    };
    const boulder = (x: number, R: number, H: number) => {
      if (keepOut(x, F + H * 0.5, R)) return;
      const fl = this.sand.bedAt(x);
      scen.addRock(r.pick(scen.shapes('bigboulder')), x, fl - R * 0.3, r.range(-0.4, 0.1), R, H, R * r.range(1.1, 1.5), r.range(0, 6), { tilt: 0.25 });
      const c1 = { x, y: fl - R * 0.3 + H * 0.45, r: Math.min(R, H) * 0.66 };
      T.addRock(c1); this.obstacles.push(c1);
      if (R > 1.2) for (const s of [-1, 1]) { const c = { x: x + s * R * 0.5, y: fl + H * 0.18, r: R * 0.42 }; T.addRock(c); this.obstacles.push(c); }
    };
    const pillar = (x: number, H: number) => {
      if (keepOut(x, F + H * 0.5, 1)) return;
      const fl = this.sand.bedAt(x), SR = r.range(0.8, 1.1);
      scen.addRock(r.pick(scen.shapes('spire')), x, fl - 0.3, r.range(-0.5, -0.2), SR, H, SR * 1.2, r.range(0, 6), { topK: 0.9 });
      for (let y = 0.5; y < H - 0.4; y += 0.8) { const c = { x, y: fl + y, r: SR * (1 - (y / H) * 0.55) * 0.85 }; T.addRock(c); this.obstacles.push(c); }
    };
    const hang = (x: number, L: number) => {
      if (keepOut(x, this.top - L, 0.8)) return;
      const SR = r.range(0.6, 0.9);
      this.rock(this.soups.near, 'spire', x, this.top - L + 0.2, r.range(-0.5, -0.2), SR, L, SR * 1.2, { flip: true, topK: 0 });
      for (let y = 0.4; y < L - 0.3; y += 0.7) { const c = { x, y: this.top - y, r: SR * (1 - (y / L) * 0.6) * 0.8 }; T.addRock(c); this.obstacles.push(c); }
    };
    switch (node.layout) {
      case 1: boulder(-6, 1.5, 1.8); boulder(6.2, 1.3, 1.5); break;
      case 2: pillar(-5, 5.5); pillar(5, 4.5); break;
      case 3: boulder(-4.5, 1.0, 1.2); boulder(4.5, 1.0, 1.2); hang(-7, 3.2); hang(7, 2.8); break;
      case 4: boulder(-7.5, 2.0, 2.2); hang(4, 3.6); break;
      case 5: pillar(-7, 4); boulder(3.5, 1.1, 1.3); boulder(7.5, 0.9, 1.1); break;
      case 6: hang(-4, 4); hang(4, 4); break;
      case 7: for (const x of [-8, -3.5, 3.5, 8]) boulder(x + r.range(-0.6, 0.6), r.range(0.6, 0.9), r.range(0.7, 1.0)); break;
      default: break;
    }
    void hash2;
  }
}
