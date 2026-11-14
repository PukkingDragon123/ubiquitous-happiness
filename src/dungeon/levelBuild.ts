// Builds a floor's side-scrolling level from its plan (src/dungeon/level.ts) with the continuous area builders,
// read-only: Scenery (sand strip, front cross-section, 3D seabed, rocks, flora, the MOLEFORGE meadow, verlet
// kelp) stretched over the whole level with a plan-driven seabed (arenas and POIs flattened, caves and pits cut
// in), the area's landmarks + rock dressing + junk + foreground frame, the Detail layer (critters, abyss life,
// motes), marine snow, and the mail buoy + manatee for the post office. On top: the plan's rock bodies (mid-water
// ledges, cave lids, mounds) as boulders with collision, the arena gates and the secret pits' cracked lids.
//
// Static meshes are merged per 30 m chunk (Scenery), so frustum culling keeps the visible triangles to the few
// chunks around the camera.
//
//   const lvl = new LevelBuild(world, plan);  lvl.bind(world);  each frame lvl.update(dt, camX);  lvl.dispose()
import * as THREE from 'three';
import type { World, Entity } from '../game/types';
import { areaDef, type AreaDef } from '../area/defs';
import type { Shape } from '../area/shape';
import { SEAM_Z } from '../area/shape';
import { Scenery } from '../area/scenery';
import { buildLandmarks, dressRocks, dressJunk, foregroundFrame } from '../area/landmarks';
import { Detail } from '../area/detail';
import { MailBuoy } from '../area/manatee';
import { SandField } from '../world/sand';
import { ENV } from '../world/mats';
import { MEADOW, meadowLook } from '../world/meadow';
import { MarineSnow } from '../world/ocean';
import { Rng } from '../core/rng';
import { Soup, mat4 } from '../world/lp';
import { crustPainter } from '../world/rockgen';
import { hex } from '../gfx/px';
import { fbm, smooth, damp } from '../core/math';
import type { LampHandle } from '../gfx/lighting';
import { LevelTerrain } from './terrain';
import { ArenaGate, CrackedLid } from './gates';
import { bedAt, sandAt, type LevelPlan } from './level';

type Rig = { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null;

function levelShape(a: AreaDef, plan: LevelPlan, hallX: number, galleonX: number): Shape {
  const s = plan.seed % 9973;
  const bed = (x: number) => bedAt(plan, x);
  const sand0 = (x: number) => sandAt(plan, x);
  const edge = (x: number) => smooth(6, -16, x) * 16 + smooth(plan.W - 6, plan.W + 16, x) * 16;
  const back = (x: number, z: number) => {
    // the seam follows the strip; caves and pits don't show behind (the seabed behind stays at the floor level)
    const seam = Math.max(bed(x), plan.base - 1.2) + sand0(x);
    const k = smooth(SEAM_Z, -16, z);
    const rise = smooth(-6, -48, z);
    let b = plan.base + a.backRise * rise * (0.55 + 0.9 * fbm(x * 0.018, z * 0.03, 3, s + 31));
    b += (fbm(x * 0.07, z * 0.09, 3, s + 32) - 0.5) * 1.6 * (1 - rise * 0.5);
    b += Math.max(0, fbm(x * 0.025, z * 0.04, 3, s + 33) - 0.55) * 16 * smooth(-12, -36, z);
    if (a.id === 'abyss') b -= smooth(-14, -40, z) * 10;
    if (a.id === 'graveyard') b += Math.max(0, fbm(x * 0.05, z * 0.05, 2, s + 34) - 0.6) * 4;
    b += edge(x) * 1.3;
    let h = seam * (1 - k) + b * k;
    const cap = a.ice ? -4.5 : -3.2;
    if (h > cap - 2) h = cap - 2 * Math.exp(-(h - (cap - 2)) / 2);
    return h;
  };
  return { X0: 0, X1: plan.W, bed, sand0, back, wreckX: plan.W * 0.5, buoyX: 1e5, spawnX: plan.startX, hallX, galleonX };
}

export interface LevelOptsB { light?: boolean }

export class LevelBuild {
  a: AreaDef;
  group = new THREE.Group();
  scen: Scenery;
  sand: SandField;
  terrain: LevelTerrain;
  detail: Detail;
  snow: MarineSnow;
  mailbox: MailBuoy | null = null;
  gates = new Map<number, ArenaGate[]>();
  lids = new Map<number, CrackedLid>();
  owned: Entity[] = [];
  buildMs = 0;
  private t = 0;
  private glowLamps: LampHandle[] = [];
  private near: { x: number; y: number; z: number; col: string; k: number; d: number }[] = [];
  private onBoom: (d: Record<string, unknown>) => void;
  get look() { return this.a.look; }

  constructor(public world: World, public plan: LevelPlan, o: LevelOptsB = {}) {
    const t0 = performance.now();
    const a = this.a = areaDef(plan.area);
    const r = new Rng(plan.seed ^ 0x1e7e1);
    // hero set pieces go in a quiet travel stretch, away from the arenas and POIs
    const busy = (x: number, pad: number) => plan.flats.some(([x0, x1]) => x > x0 - pad && x < x1 + pad);
    let hallX = plan.W * 0.35, galleonX = plan.W * 0.6;
    for (let k = 0; k < 40 && busy(hallX, 6); k++) hallX = r.range(30, plan.W - 40);
    for (let k = 0; k < 40 && busy(galleonX, 4); k++) galleonX = r.range(30, plan.W - 40);
    const shape = levelShape(a, plan, hallX, galleonX);
    const sand = this.sand = new SandField(shape.X0 - 30, shape.X1 + 30, shape.bed, shape.sand0);
    const terrain = this.terrain = new LevelTerrain(sand, 0.4, plan.W - 0.4);
    const scen = this.scen = new Scenery(a, shape, sand, terrain, plan.seed);
    // replace the area builder's reservations (wreck, buoy, spawn) with the level's own
    scen.reserved.length = 0;
    if (a.id === 'kelp') scen.reserved.push({ x: hallX, r: 5.2, z0: -16, z1: -1.3 });
    if (a.id === 'graveyard') scen.reserved.push({ x: galleonX + 1, r: 14, z0: -15, z1: -3.2 });
    for (const ar of plan.arenas) scen.reserved.push({ x: (ar.x0 + ar.x1) / 2, r: (ar.x1 - ar.x0) / 2 + 2, z0: -0.45, z1: 0.35 });
    for (const p of plan.pois) {
      if (p.kind === 'shop') scen.reserved.push({ x: p.x, r: 7, z0: -5.5, z1: 1.6 });
      else if (p.kind === 'post') scen.reserved.push({ x: p.x, r: 3, z0: -3, z1: 3 });
      else if (p.kind === 'start') scen.reserved.push({ x: p.x, r: 4, z0: -1.5, z1: 3 });
    }
    for (const b of plan.solids) scen.reserved.push({ x: (b.x0 + b.x1) / 2, r: (b.x1 - b.x0) / 2 + 1.5, z0: -1.8, z1: 1.8 });
    for (const d of plan.dips) if (d.depth > 4) scen.reserved.push({ x: (d.x0 + d.x1) / 2, r: (d.x1 - d.x0) / 2, z0: -1.2, z1: 1.2 });
    scen.build();
    if (!o.light) buildLandmarks(scen, this.group, world);
    else { dressRocks(scen); dressJunk(scen, world); foregroundFrame(scen); }
    terrain.ceiling = a.ice ? terrain.ceiling : null;
    this.buildBodies(r);
    // the post office: the mail buoy and its manatee paint into the scenery's prop atlas, so before finish()
    const post = plan.pois.find((p) => p.kind === 'post');
    if (post) {
      const mb = this.mailbox = new MailBuoy(a, scen, post.x, world);
      // she keeps office hours: already waiting under the buoy, and never leaves
      mb.window = 1e6; mb.interval = 6; mb.eta = 1e6;
      mb.manatee.arrive(post.x + 3, post.x); mb.manatee.state = 'waiting'; mb.waitLeft = 1e6;
      mb.manatee.x = post.x - 1.6; mb.manatee.y = -2.8;
      this.owned.push(mb);
    }
    this.detail = new Detail(scen, world, plan.seed);
    scen.finish();
    this.group.name = `level:${a.id}:${plan.n}`;
    this.group.add(scen.group, this.detail.group);
    this.flushRoof();
    if (this.mailbox) this.group.add(this.mailbox.obj);
    // gates + lids
    const sandCol = a.pal.sand[2];
    for (const ar of plan.arenas) {
      const gs: ArenaGate[] = [];
      const kind = ar.kind;
      const sides = ar.kind === 'boss' ? [ar.x0 - 0.8] : [ar.x0 - 0.8, ar.x1 + 0.8];
      for (const gx of sides) {
        const g = new ArenaGate(world, terrain, gx, sand.heightAt(gx), ar.top, a.id, kind, sandCol);
        this.group.add(g.group);
        gs.push(g);
      }
      this.gates.set(ar.id, gs);
    }
    for (const b of plan.solids) {
      if (b.kind !== 'cracked' || b.poi === undefined) continue;
      const p = plan.pois[b.poi];
      const lid = new CrackedLid(world, terrain, b.x0, b.x1, b.y0, b.y1, a.id, a.pal.silt, !!p.opened);
      this.group.add(lid.group);
      this.lids.set(p.id, lid);
    }
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
    const silt = new THREE.Color(a.pal.silt);
    sand.onPuff = (x, y, k) => {
      const n = Math.round(3 + k * 7);
      world.fx.emit('ink', x, y + 0.1, { n, spread: 0.25 + k * 0.25, vy: 0.25 + k * 0.2, speed: 0.4 + k * 0.6, life: 2.2 + k, size: 0.35 + k * 0.15, size1: 0.9 + k * 0.6, color: silt, alpha: 0.5, grav: 0.05, drag: 2.2 });
    };
    sand.onSpray = (x, y, k) => { world.fx.debrisBurst(x, y, Math.round(6 + k * 8), a.pal.sand[2], 3 + k * 2, 0.05); };
    this.onBoom = (d) => { if (typeof d.x === 'number' && typeof d.y === 'number') this.impact(d.x, d.y, (d.r as number) ?? 1.6, (d.k as number) ?? 1); };
    this.buildMs = performance.now() - t0;
  }

  /** the plan's rock bodies: boulders on the gameplay plane, each with a rounded-box body in the terrain */
  private buildBodies(r: Rng) {
    const scen = this.scen, T = this.terrain, plan = this.plan;
    const shapes = (k: 'boulder' | 'bigboulder' | 'slab' | 'spire') => scen.shapes(k);
    for (const b of plan.solids) {
      if (b.kind === 'cracked') {
        // just the rims of the pit; the lid itself is a CrackedLid
        for (const ex of [b.x0 - 0.6, b.x1 + 0.6]) scen.addRock(r.pick(shapes('boulder')), ex, plan.base - 1.6, r.range(-1, 0.6), 1.1, 1.8, 1.3, r.range(0, 6), { tilt: 0.3 });
        continue;
      }
      T.addBody({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, r: Math.min(0.5, (b.y1 - b.y0) * 0.3), on: () => true, tag: b.kind });
      const L = b.x1 - b.x0, H = b.y1 - b.y0;
      if (b.kind === 'mound') {
        const R = L / 2;
        scen.addRock(r.pick(shapes('bigboulder')), (b.x0 + b.x1) / 2, b.y0, r.range(-0.4, 0.2), R * 1.05, H * 1.05, R * 1.3, r.range(0, 6), { tilt: 0.25, topK: 1 });
        for (const s of [-1, 1]) scen.addRock(r.pick(shapes('boulder')), (b.x0 + b.x1) / 2 + s * R * 0.9, b.y0 + 0.2, r.range(-1.2, 1), R * 0.45, H * 0.55, R * 0.5, r.range(0, 6), { tilt: 0.4 });
        continue;
      }
      // ledges and lids: a run of flat slabs (with a ragged underside) covering the body, front to back
      const n = Math.max(2, Math.round(L / 2.6));
      for (let i = 0; i < n; i++) {
        const cx = b.x0 + (i + 0.5) * (L / n);
        for (const z of [-1.6, 0.2, 1.7]) {
          scen.addRock(r.pick(shapes('slab')), cx + r.range(-0.4, 0.4), b.y0 - 0.15, z + r.range(-0.3, 0.3), L / n * 0.75 + 0.4, H * 1.12, 1.2, r.range(-0.3, 0.3), { tilt: 0.12, topK: 1.1 });
        }
        if (r.chance(0.6)) scen.addRock(r.pick(shapes('boulder')), cx + r.range(-0.8, 0.8), b.y1 - 0.3, r.range(-1.4, 0.3), r.range(0.5, 0.9), r.range(0.4, 0.8), r.range(0.5, 0.9), r.range(0, 6), { tilt: 0.5 });
      }
      if (b.kind === 'ledge') {
        // a ledge grows off a pillar behind the play plane, so it doesn't float
        const px = r.chance(0.5) ? b.x0 + 1.5 : b.x1 - 1.5, fl = this.sand.bedAt(px);
        scen.addRock(r.pick(shapes('spire')), px, fl - 0.4, -3.0, 1.4, b.y0 - fl + 1.2, 1.6, r.range(0, 6), { topK: 0.8 });
        scen.addRock(r.pick(shapes('bigboulder')), px, fl - 0.6, -2.2, 2.0, 1.8, 1.6, r.range(0, 6), { tilt: 0.2 });
      } else {
        // stalactites under the lid (off the play plane, so they frame the cave without blocking it)
        for (let x = b.x0 + 0.8; x < b.x1 - 0.5; x += r.range(1.2, 2.4)) {
          const z = r.chance(0.5) ? r.range(-2.8, -1.3) : r.range(1.3, 2.6);
          this.hang(r, x, b.y0 + 0.25, z, r.range(0.25, 0.5), r.range(0.8, 2.2));
        }
        // a cave lid: boulders piled on the roof, and the cave's back wall behind the play plane
        for (let x = b.x0 - 3; x < b.x1 + 3; x += r.range(3, 5)) {
          const fl = this.sand.bedAt(x);
          scen.addRock(r.pick(shapes('bigboulder')), x, fl - 0.5, r.range(-4.2, -3.2), r.range(1.6, 2.4), b.y1 - fl + 0.5, 1.6, r.range(0, 6), { tilt: 0.2, tint: 0.7 });
        }
      }
    }
  }

  private roof = new Soup();
  /** a stalactite hanging from y = top (a flipped spire), into the level's own soup */
  private hang(r: Rng, x: number, top: number, z: number, rad: number, L: number) {
    const from = this.roof.count;
    this.roof.append(r.pick(this.scen.shapes('spire')), mat4(x, top, z, rad, L, rad * 1.1, r.range(0, 6), Math.PI, 0));
    const t = r.range(0.75, 0.95), c = hex(this.a.pal.rockTop);
    crustPainter([t, t, t], [c[0] / 255, c[1] / 255, c[2] / 255], 0.2, from, this.roof);
  }
  private flushRoof() {
    if (!this.roof.count) return;
    const g = this.roof.geometry();
    const m = new THREE.Mesh(g, this.scen.mats.rock);
    m.castShadow = false; m.receiveShadow = true;
    this.group.add(m);
    this.roofGeo = g;
  }
  private roofGeo: THREE.BufferGeometry | null = null;

  /** make this level the live one: terrain, shared uniforms, events, owned entities */
  bind(world: World) {
    (world as { terrain: unknown }).terrain = this.terrain;
    world.fx.floorAt = (x) => this.terrain.floorAt(x);
    this.sand.bind();
    const L = this.a.look;
    meadowLook(L.sun, L.sunI, L.hemiSky, L.hemiGround, L.hemi);
    world.run.on('explosion', this.onBoom);
    for (const e of this.owned) { e.alive = true; if (!world.entities.includes(e)) world.add(e); }
    if (!this.group.parent) world.scene.add(this.group);
  }

  setLighting(rig: Rig) {
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
      if (!e.alive || !e.obj || e.kind === 'plants' || e.kind === 'pickup' || e.kind === 'mailbuoy' || Math.abs(e.x - camX) > 14) continue;
      pu[k++].set(e.x, e.y, Math.max(0.25, Math.min(1.5, e.r)), Math.min(1.1, 0.4 + Math.hypot(e.vx, e.vy) / 4));
    }
    for (; k < pu.length; k++) pu[k].set(0, -999, 0, 0);
    this.scen.sim.update(dt, w, camX);
    this.scen.update(dt, camX, t);
    this.detail.update(dt, camX);
    this.snow.update(camX, p.y, t);
    for (const gs of this.gates.values()) for (const g of gs) g.update(dt);
    if (this.glowLamps.length) {
      let nn = 0;
      const near = this.near;
      const put = (g: { x: number; y: number; z: number; col: string }, kk: number, d: number) => { const o = near[nn] ?? (near[nn] = { x: 0, y: 0, z: 0, col: '', k: 0, d: 0 }); o.x = g.x; o.y = g.y; o.z = g.z; o.col = g.col; o.k = kk; o.d = d; nn++; };
      for (const g of this.scen.glowPts) if (Math.abs(g.x - camX) < 12) put(g, 1, Math.abs(g.x - camX));
      for (const g of this.scen.glowDyn) put(g, g.k, Math.abs(g.x - camX) + 1.5);
      near.length = nn;
      near.sort((a, b) => a.d - b.d);
      this.glowLamps.forEach((l, i) => {
        const g = near[i];
        if (!g) { l.light.intensity = 0; return; }
        l.set(g.x, g.y, g.z); l.light.color.set(g.col);
        l.light.intensity = 4.5 * g.k * (0.8 + 0.2 * Math.sin(t * 1.7 + i * 2));
        l.light.distance = g.k < 1 ? 5 : 7;
      });
    }
  }

  dispose() {
    const l = this.world.run.hooks.get('explosion'); if (l) this.world.run.hooks.set('explosion', l.filter((f) => f !== this.onBoom));
    for (const lp of this.glowLamps) lp.release();
    this.glowLamps.length = 0;
    for (const gs of this.gates.values()) for (const g of gs) g.dispose();
    for (const lid of this.lids.values()) lid.dispose();
    for (const e of this.owned) e.alive = false;
    this.mailbox?.dispose();
    this.roofGeo?.dispose();
    this.detail.dispose();
    this.scen.sim.dispose();
    this.scen.dispose();
    this.sand.dispose();
    this.snow.points.geometry.dispose();
    (this.snow.points.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
