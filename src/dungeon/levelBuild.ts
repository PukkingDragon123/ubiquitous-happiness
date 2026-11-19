// Builds a floor's side-scrolling level from its plan (src/dungeon/level.ts) with the continuous area builders,
// read-only: Scenery (sand strip, front cross-section, 3D seabed, rocks, flora, the MOLEFORGE meadow, verlet
// kelp) stretched over the whole level with a plan-driven seabed (arenas and POIs flattened, caves and pits cut
// in), the area's landmarks + rock dressing + junk + foreground frame, the Detail layer (critters, abyss life,
// motes), marine snow, and the mail buoy + manatee for the post office. On top: the plan's rock bodies (mid-water
// ledges, cave lids, mounds) as boulders with collision, the arena gates and the secret pits' cracked lids.
//
// v6 crossroads: the forks' signposts (one board per lane: the place, the danger, the reward), the bars that seal
// a lane not taken (raised on choose()), every exit pit with its own grate and, at an end-of-floor crossroads, the
// look of where it leads (the destination's bars as doorposts, a coloured glow rising out of it, drifting motes),
// the CURRENTS pointing the way on (src/dungeon/currents.ts) and the dead-end signs.
//
// Static meshes are merged per 30 m chunk (Scenery), so frustum culling keeps the visible triangles to the few
// chunks around the camera.
//
//   const lvl = new LevelBuild(world, plan);  lvl.bind(world);  each frame lvl.update(dt, camX);  lvl.dispose()
import * as THREE from 'three';
import type { World, Entity } from '../game/types';
import type { AreaDef } from '../area/defs';
import { biomeDef, baseOf, isHadal } from './biomes';
import type { Shape } from '../area/shape';
import { SEAM_Z } from '../area/shape';
import { Scenery } from '../area/scenery';
import { buildLandmarks, dressRocks, dressJunk, foregroundFrame } from '../area/landmarks';
import { Detail } from '../area/detail';
import { Manatee } from '../area/manatee';
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
import { bedAt, sandAt, shelfAt, depthOf, type LevelPlan, type ForkPlan, type ForkLane, type CurrentPlan } from './level';
import { grateModel, ropeModel, postBox, signpostModel, disposeModel, forkSignModel, arenaGateModel, logBeam, type ForkSign, type SignBoardSpec, type SignDir, type SignIconKind } from './models';
import { Currents } from './currents';
import { additiveMaterial } from '../world/mats';

/** the colour a destination is painted / lit in at a crossroads (a band on its board, the glow out of its pit) */
export function placeTint(area: string): string {
  if (isHadal(area)) return biomeDef(area).pal.rockTop;
  return ({ reef: '#ff8a5a', kelp: '#9ad84a', graveyard: '#d8a050', arctic: '#a8e4ff', abyss: '#4ae8ff' } as Record<string, string>)[baseOf(area)] ?? '#f0d8a8';
}
/** the dark wash inside a cave under a lid: solid in the middle, fading at both mouths, a touch lighter at the floor */
let shadeTex: THREE.Texture | null = null;
function caveShadeTex(): THREE.Texture {
  if (shadeTex) return shadeTex;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
  const x = cv.getContext('2d')!, img = x.createImageData(64, 32);
  for (let j = 0; j < 32; j++) for (let i = 0; i < 64; i++) {
    const ex = Math.min(1, Math.min(i, 63 - i) / 7), v = j / 31;
    const a = ex * ex * (0.6 + 0.28 * (1 - v)) * (j > 29 ? (31 - j) / 2 : 1);
    const k = (j * 64 + i) * 4; img.data[k] = 4; img.data[k + 1] = 9; img.data[k + 2] = 14; img.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  shadeTex = new THREE.CanvasTexture(cv); shadeTex.colorSpace = THREE.SRGBColorSpace;
  return shadeTex;
}
/** a soft round glow (additive) */
let discTex: THREE.Texture | null = null;
function glowDiscTex(): THREE.Texture {
  if (discTex) return discTex;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const x = cv.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  discTex = new THREE.CanvasTexture(cv);
  return discTex;
}
/** a fork lane's board */
function laneBoard(f: ForkPlan, l: ForkLane, dir: SignDir): SignBoardSpec {
  const tint = l.area ? placeTint(l.area) : l.side === 'upper' ? '#9fe8ff' : f.kind === 'den' ? '#ff6a4a' : '#9ad84a';
  return { title: l.name, note: l.note, danger: l.danger, giant: l.giant, icons: l.reward as SignIconKind[], dir, tint };
}

type Rig = { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null;

function levelShape(a: AreaDef, plan: LevelPlan, hallX: number, galleonX: number): Shape {
  const s = plan.seed % 9973;
  const bed = (x: number) => bedAt(plan, x);
  const sand0 = (x: number) => sandAt(plan, x);
  const edge = (x: number) => smooth(6, -16, x) * 16 + smooth(plan.W - 6, plan.W + 16, x) * 16;
  const back = (x: number, z: number) => {
    // the seam follows the strip; caves and pits don't show behind (the seabed behind stays at the floor level)
    const sh = shelfAt(plan, x);
    const seam = Math.max(bed(x), sh - 1.2) + sand0(x);
    const k = smooth(SEAM_Z, -16, z);
    const rise = smooth(-6, -48, z);
    // the background follows the terraces (a little smoothed, so the far seabed reads as one long slope down)
    const shB = (shelfAt(plan, x - 6) + sh + shelfAt(plan, x + 6)) / 3;
    let b = shB + a.backRise * rise * (0.55 + 0.9 * fbm(x * 0.018, z * 0.03, 3, s + 31));
    b += (fbm(x * 0.07, z * 0.09, 3, s + 32) - 0.5) * 1.6 * (1 - rise * 0.5);
    b += Math.max(0, fbm(x * 0.025, z * 0.04, 3, s + 33) - 0.55) * 16 * smooth(-12, -36, z);
    if (a.id === 'abyss') b -= smooth(-14, -40, z) * 10;
    if (a.id === 'graveyard') b += Math.max(0, fbm(x * 0.05, z * 0.05, 2, s + 34) - 0.6) * 4;
    b += edge(x) * 1.3;
    let h = seam * (1 - k) + b * k;
    const cap = Math.min(a.ice ? -4.5 : -3.2, plan.top - 1.5);
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
  /** the post office's manatee (waits by her pillar box on a shelf) */
  manatee: Manatee | null = null;
  postX = 0; postY = 0;
  /** the exit pit's grate (opens when the boss falls) and the surface rope (final floors) */
  exitOpen = false;
  grate: { root: THREE.Group; leaves: THREE.Group[] } | null = null;
  rope: { root: THREE.Group; lamp: THREE.Mesh } | null = null;
  /** additive god-ray sheets from the landmarks: dimmed with depth */
  shafts: THREE.Mesh[] = [];
  private grateA = 0;
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
    const a = this.a = biomeDef(plan.area);
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
    for (const st of plan.steps) scen.reserved.push({ x: (st.x0 + st.x1) / 2, r: (st.x1 - st.x0) / 2 + 1.2, z0: -0.5, z1: 0.4 });
    for (const ex of plan.exits) scen.reserved.push({ x: (ex.x0 + ex.x1) / 2, r: 4.6, z0: -2.4, z1: 2.4 });
    for (const sg of plan.signs) if (sg.kind === 'fork' || sg.kind === 'lane' || sg.kind === 'dead') scen.reserved.push({ x: sg.x, r: 1.8, z0: -2.2, z1: 1.6 });
    for (const d of plan.dips) if (d.depth > 4) scen.reserved.push({ x: (d.x0 + d.x1) / 2, r: (d.x1 - d.x0) / 2, z0: -1.2, z1: 1.2 });
    scen.build();
    if (!o.light) buildLandmarks(scen, this.group, world);
    else { dressRocks(scen); dressJunk(scen, world); foregroundFrame(scen); }
    // the first floor opens to the surface (or its ice); deeper floors have dark water overhead and a hard top
    const deep = plan.top < -2.9;
    terrain.ceiling = deep ? () => plan.top : a.ice ? terrain.ceiling : null;
    this.buildBodies(r);
    for (const ex of plan.exits) this.dressExit(r, ex);
    // the post office: the manatee paints into the scenery's prop atlas, so she's built before finish()
    const post = plan.pois.find((p) => p.kind === 'post');
    if (post) {
      this.postX = post.x; this.postY = sand.heightAt(post.x);
      const m = this.manatee = new Manatee(scen);
      // she keeps office hours beside her pillar box, low over the sand (not drifting up into the water column)
      m.station(post.x + 1.4, this.postY + 2.3, plan.top - 1.4);
    }
    this.detail = new Detail(scen, world, plan.seed);
    scen.finish();
    this.group.name = `level:${a.id}:${plan.n}`;
    this.group.add(scen.group, this.detail.group);
    this.flushRoof();
    if (this.manatee) {
      this.group.add(this.manatee.root);
      const box = postBox(); box.position.set(this.postX - 3.4, this.postY - 0.05, -0.9); box.scale.setScalar(1.35);
      this.group.add(box); this.props3d.push(box);
    }
    // the exit pits' grates and, on a floor that ends the planned run, the rope up to the surface
    for (const ex of plan.exits) {
      const gr = grateModel(ex.x1 - ex.x0 + 0.8);
      gr.root.position.set((ex.x0 + ex.x1) / 2, ex.top - 0.2, 0);
      this.group.add(gr.root);
      this.grates.push(gr);
      terrain.addBody({ x0: ex.x0 - 0.8, x1: ex.x1 + 0.8, y0: ex.top - 0.7, y1: ex.top + 0.25, r: 0.1, on: () => !this.exitOpen, tag: 'grate' });
    }
    this.grate = this.grates[0] ?? null;
    this.buildCrossroads(r);
    if (plan.ropeX !== null) {
      const fl = sand.heightAt(plan.ropeX), h = plan.top + 6 - fl;
      this.rope = ropeModel(h);
      this.rope.root.position.set(plan.ropeX, fl + 1.2, -0.3);
      this.group.add(this.rope.root);
    }
    // signposts: how far from home, which way is onward (distances burnt into the boards)
    for (const sg of plan.signs) {
      if (sg.kind === 'fork' || sg.kind === 'lane' || sg.kind === 'dead') continue;
      const far = Math.round((plan.far0 + sg.x) / 5) * 5;
      const d = Math.round(depthOf(plan, sg.y));
      const boards: { text: string; dir: -1 | 0 | 1 }[] = sg.kind === 'home'
        ? [{ text: 'HOME', dir: -1 }, { text: 'THE DEEP', dir: 1 }]
        : sg.kind === 'mile' ? [{ text: `HOME ${far} M`, dir: -1 }, { text: a.name.toUpperCase(), dir: 1 }]
          : [{ text: `HOME ${far} M`, dir: -1 }, { text: `DEEPER  -${d + 6} M`, dir: 1 }];
      const sp = signpostModel(boards);
      sp.position.set(sg.x, sand.heightAt(sg.x) - 0.1, -1.3);
      sp.rotation.y = 0.12;
      this.group.add(sp); this.props3d.push(sp);
      this.signLamps.push(sp.getObjectByName('lamp') as THREE.Mesh);
    }
    // god-ray sheets (landmark shafts): remembered so the depth can dim them
    // (not the crossroads' own glows and current chevrons: those keep their colour, userData.keep)
    this.group.traverse((o) => { const m = o as THREE.Mesh; const mt = m.material as THREE.MeshBasicMaterial; if (m.isMesh && mt.blending === THREE.AdditiveBlending && mt.isMeshBasicMaterial && !mt.userData.shared && !mt.userData.keep) this.shafts.push(m); });
    // gates + lids
    const sandCol = a.pal.sand[2];
    for (const ar of plan.arenas) {
      const gs: ArenaGate[] = [];
      const kind = ar.kind;
      const sides = ar.kind === 'boss' ? [ar.x0 - 0.8] : [ar.x0 - 0.8, ar.x1 + 0.8];
      for (const gx of sides) {
        const g = new ArenaGate(world, terrain, gx, sand.heightAt(gx), ar.top, a.id, kind, sandCol, plan.top + 3);
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
    // marine snow thickens with depth
    const dep = depthOf(plan, plan.base);
    // ...and down in the dark it's half bioluminescent plankton
    const snowCol = dep > 140 ? '#' + new THREE.Color(a.snowCol).lerp(new THREE.Color('#3aa8c0'), Math.min(0.6, (dep - 140) / 220)).multiplyScalar(dep > 220 ? 0.75 : 1).getHexString() : a.snowCol;
    this.snow = new MarineSnow(Math.min(2.4, a.snow * (1 + dep / 400)), snowCol);
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
      world.fx.emit('silt', x, y + 0.1, { n, spread: 0.25 + k * 0.25, vy: 0.25 + k * 0.2, speed: 0.4 + k * 0.6, life: 2.2 + k, size: 0.35 + k * 0.15, size1: 0.9 + k * 0.6, color: silt, alpha: 0.5, grav: 0.05, drag: 2.2 });
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
      if (b.kind === 'grate') continue;
      if (b.kind === 'wall') {
        // the entry shaft's side: a column of big boulders, front to back
        T.addBody({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, r: 0.6, on: () => true, tag: 'wall' });
        for (let y = b.y0 - 1; y < b.y1; y += r.range(1.8, 2.6)) for (const z of [-3.2, -0.8, 1.6]) {
          const R = (b.x1 - b.x0) / 2 + r.range(0.3, 0.9);
          scen.addRock(r.pick(shapes('bigboulder')), (b.x0 + b.x1) / 2 + r.range(-0.4, 0.4), y, z + r.range(-0.4, 0.4), R, r.range(2.2, 3), z > 1 ? 1.1 : 1.6, r.range(0, 6), { tilt: 0.25, tint: z > 1 ? 0.6 : undefined });
        }
        continue;
      }
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
        for (const z of [-1.7, 0.1, 1.3]) {
          scen.addRock(r.pick(shapes('slab')), cx + r.range(-0.4, 0.4), b.y0 - 0.15, z + r.range(-0.2, 0.2), L / n * 0.75 + 0.4, H * 1.12, z > 1 ? 0.9 : 1.2, r.range(-0.3, 0.3), { tilt: 0.12, topK: 1.1 });
        }
        if (r.chance(0.6)) scen.addRock(r.pick(shapes('boulder')), cx + r.range(-0.8, 0.8), b.y1 - 0.3, r.range(-1.4, 0.3), r.range(0.5, 0.9), r.range(0.4, 0.8), r.range(0.5, 0.9), r.range(0, 6), { tilt: 0.5 });
      }
      if (b.kind === 'lip') continue; // the overhang of a shaft: anchored to the cliff it overhangs
      if (b.kind === 'ledge') {
        // a ledge grows off a pillar behind the play plane, so it doesn't float
        const px = r.chance(0.5) ? b.x0 + 1.5 : b.x1 - 1.5, fl = this.sand.bedAt(px);
        scen.addRock(r.pick(shapes('spire')), px, fl - 0.4, -3.0, 1.4, b.y0 - fl + 1.2, 1.6, r.range(0, 6), { topK: 0.8 });
        scen.addRock(r.pick(shapes('bigboulder')), px, fl - 0.6, -2.2, 2.0, 1.8, 1.6, r.range(0, 6), { tilt: 0.2 });
      } else {
        // stalactites under the lid (off the play plane, so they frame the cave without blocking it)
        for (let x = b.x0 + 0.8; x < b.x1 - 0.5; x += r.range(1.2, 2.4)) {
          // (none in front over the cave's mouth: the low lane's board hangs there)
          const z = r.chance(0.5) || x < b.x0 + 6.5 ? r.range(-2.8, -1.3) : r.range(1.3, 2.6);
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

  private props3d: THREE.Object3D[] = [];
  private signLamps: THREE.Mesh[] = [];
  /** every exit pit's grate (grate = the first, for older callers) */
  grates: { root: THREE.Group; leaves: THREE.Group[] }[] = [];
  /** per fork: each lane's board (lane index), the seal bars per lane */
  forkSigns = new Map<number, { sign: ForkSign; lane: number }[]>();
  /** each lane board's world rect (centre x / y, size): the HUD tag shows the route when you swim up to one */
  laneBoards: { fork: number; lane: number; x: number; y: number; w: number; h: number }[] = [];
  seals = new Map<number, ArenaGate[][]>();
  currents: Currents | null = null;
  /** the glow rising out of each crossroads pit (lit by the pooled lamps when near) */
  private pitGlows: { x: number; y: number; z: number; col: string; k: number; mesh: THREE.Mesh; area: string; exit: number }[] = [];
  /** the boss is down: the grates swing open over the pits */
  openExit() { this.exitOpen = true; }

  /** the forks: signposts, the bars that close a lane not taken, the pits' looks; the currents and the dead ends */
  private buildCrossroads(r: Rng) {
    const plan = this.plan, sand = this.sand, a = this.a, world = this.world;
    const signAt = (x: number, sign: ForkSign, z = -0.95) => {
      sign.root.position.set(x, sand.heightAt(x) - 0.12, z);
      sign.root.rotation.y = 0.06;
      this.group.add(sign.root); this.props3d.push(sign.root);
      if (sign.lamp) this.signLamps.push(sign.lamp);
    };
    // (v6.1) every lane is signposted at its own mouth, big: the place, the arrow, the danger, the reward (the
    // route words show in a HUD tag when you swim up to a board). Plan sign entries only place the end-of-floor
    // overview post and the dead ends, so older v6 saves rebuild the same way.
    const keep = (f: ForkPlan, sign: ForkSign, lane: number) => { const list = this.forkSigns.get(f.id) ?? []; list.push({ sign, lane }); this.forkSigns.set(f.id, list); };
    const board = (f: ForkPlan, lane: number, sign: ForkSign) => {
      const r = sign.rects[0], o = sign.root.position;
      this.laneBoards.push({ fork: f.id, lane, x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h });
    };
    for (const sg of plan.signs) {
      if (sg.kind === 'dead') { const sign = forkSignModel([{ title: 'DEAD END', dir: -1 }], { lantern: false }); signAt(sg.x, sign, -0.8); continue; }
      if (sg.kind !== 'fork' || sg.fork === undefined) continue;
      const f = plan.forks[sg.fork];
      if (!f || f.kind !== 'end') continue;
      // the end of a floor: a short post at the way in (CROSSROADS, how far from home), the pits carry the rest
      const sign = forkSignModel([{ title: `HOME ${Math.round((plan.far0 + sg.x) / 5) * 5} M`, dir: -1 }, { title: 'CROSSROADS', dir: 0, hang: 1 }], { row: true });
      signAt(sg.x, sign);
    }
    for (const f of plan.forks) {
      f.lanes.forEach((l, i) => {
        if (f.kind === 'end') return;
        if (l.side === 'upper') {
          // the high lane: a post on the lid's near end, the board pointing on along the top
          // (a tall post: the lower lane's board and its HUD tag fit between the two)
          const sign = forkSignModel([laneBoard(f, l, 1)], { lantern: false, lift: 1.2 });
          sign.root.position.set(l.x0 + 0.7, l.y0 - 0.06, -0.75); sign.root.rotation.y = 0.05;
          this.group.add(sign.root); this.props3d.push(sign.root);
          keep(f, sign, i); board(f, i, sign);
        } else {
          // the low lane: a board hung on ropes from the lid's underside, over the cave's mouth
          const sign = forkSignModel([laneBoard(f, l, 1)], { hang: 2.15 });
          sign.root.position.set(l.x0 + 2.2, l.y1 + 0.02, -0.65);
          this.group.add(sign.root); this.props3d.push(sign.root);
          keep(f, sign, i); board(f, i, sign);
        }
      });
    }
    // the bars that close the lanes not taken (down in the sand until a lane is chosen)
    const sandCol = a.pal.sand[2];
    for (const f of plan.forks) {
      const per: ArenaGate[][] = f.lanes.map((l) => l.seals.map((sl) => {
        // on a lid (the upper lane) the bars stand on its top; in a cave they come up out of the sand
        const sandY = this.sand.heightAt(sl.x), fl = sl.floor > sandY + 1 ? sl.floor : sandY;
        const g = new ArenaGate(world, this.terrain, sl.x, fl, sl.top, a.id, 'arena', sandCol, sl.bodyTop, { bodyBottom: sl.bodyBottom ?? fl - 3, glow: false });
        this.group.add(g.group);
        return g;
      }));
      this.seals.set(f.id, per);
      if (f.chosen >= 0) this.choose(f.id, f.chosen, true);
    }
    // a mid-floor fork's lower lane reads as a hollow you can see into: a dark wash under the lid (the back wall stays
    // in the gloom) and, deep inside, the light of what's there (a champion's ember red / the grotto's kelp green)
    for (const f of plan.forks) {
      if (f.kind === 'end') continue;
      const lo = f.lanes.find((l) => l.side === 'lower');
      if (!lo) continue;
      const lid0 = lo.x0 - 1, lid1 = lo.x1 + 1, cave = lo.y0 + 4, ly0 = lo.y1;
      const w = lid1 - lid0 + 1.2, h = ly0 - cave + 1.6;
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: caveShadeTex(), transparent: true, depthWrite: false, fog: false, color: '#ffffff' }));
      shade.position.set((lid0 + lid1) / 2, cave - 1 + h / 2, -0.8);
      shade.renderOrder = 2;
      this.group.add(shade); this.props3d.push(shade);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), new THREE.MeshBasicMaterial({ map: glowDiscTex(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: f.kind === 'den' ? '#ff5a30' : '#a8e060' }));
      inner.position.set((lid0 + lid1) / 2, cave + 2.2, -1.0);
      (inner.material as THREE.Material).userData.keep = true;
      inner.renderOrder = 3;
      this.group.add(inner); this.props3d.push(inner);
    }
    // an end-of-floor crossroads: each pit dressed in the look of where it leads
    const end = plan.forks.find((f) => f.kind === 'end' && f.lanes.length > 1);
    if (end) for (const l of end.lanes) {
      const ex = l.exit !== undefined ? plan.exits[l.exit] : null;
      if (!ex || !l.area) continue;
      const base = baseOf(l.area), col = placeTint(l.area);
      for (const sx of [ex.x0 - 1.7, ex.x1 + 1.7]) {
        const post = arenaGateModel(base, 'arena', l.route === 'deep' ? 5 : 4.6);
        post.root.position.set(sx, sand.heightAt(sx) - 0.3, -0.2);
        post.root.scale.set(0.8, 1, 0.55);
        this.group.add(post.root); this.props3d.push(post.root);
      }
      // a beam across the doorposts and, hung from it over the pit's mouth, the pit's nameplate (big, low)
      const bx0 = ex.x0 - 1.7, bx1 = ex.x1 + 1.7, by = ex.top + 4.4;
      const beam = logBeam(bx1 - bx0 + 0.5);
      beam.position.set((bx0 + bx1) / 2, by + 0.1, -0.35);
      this.group.add(beam); this.props3d.push(beam);
      const plateSign = forkSignModel([laneBoard(end, l, 'down')], { hang: 3.15 });
      plateSign.root.position.set((ex.x0 + ex.x1) / 2, by, -0.35);
      this.group.add(plateSign.root); this.props3d.push(plateSign.root);
      keep(end, plateSign, end.lanes.indexOf(l)); board(end, end.lanes.indexOf(l), plateSign);
      // the light out of the pit: a soft additive column in the destination's colour rising off the lip (the shaft
      // itself is behind its rock lining), brightest at the lip, narrowing and fading as it rises
      const H = 7.5, w0 = ex.x1 - ex.x0 + 0.4, geo = new THREE.PlaneGeometry(w0, H, 2, 8);
      const pos = geo.attributes.position as THREE.BufferAttribute, vc = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const v = (pos.getY(i) + H / 2) / H, edge = Math.abs(pos.getX(i)) / (w0 / 2);
        pos.setX(i, pos.getX(i) * (1 - 0.35 * v));
        const k = (v < 0.12 ? 0.6 + 0.4 * (v / 0.12) : Math.max(0, 1 - (v - 0.12) / 0.88) ** 1.7) * (edge > 0.99 ? 0.25 : 1);
        vc[i * 3] = k; vc[i * 3 + 1] = k; vc[i * 3 + 2] = k;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
      const glow = new THREE.Mesh(geo, additiveMaterial(col, { opacity: 0.5 }));
      glow.material.userData.keep = true;
      glow.position.set((ex.x0 + ex.x1) / 2, ex.top - 0.9 + H / 2, -0.9);
      glow.renderOrder = 3;
      this.group.add(glow);
      this.pitGlows.push({ x: (ex.x0 + ex.x1) / 2, y: ex.top + 0.6, z: 0.8, col, k: l.route === 'deep' ? 0.55 : 0.85, mesh: glow, area: l.area, exit: l.exit! });
    }
    // the currents pointing the way on
    const cur = this.currents = new Currents(plan.currents, plan.depth0 > 150 ? '#9fe8ff' : '#dff8ff');
    this.group.add(cur.group);
    void r;
  }

  /** is a current flowing now (an exit's only once the grates are open; a lane's until another lane is taken) */
  private flowing = (c: CurrentPlan) => {
    if (c.exit !== undefined) {
      if (!this.exitOpen) return false;
      const end = this.plan.forks.find((f) => f.kind === 'end');
      return !end || end.chosen < 0 || end.lanes[end.chosen]?.exit === c.exit;
    }
    if (c.fork !== undefined) { const f = this.plan.forks[c.fork]; return !f || f.chosen < 0 || f.chosen === c.lane; }
    return true;
  };

  /**
   * a lane is taken: its board is stamped, the other boards are boarded up and the bars rise across the other lanes
   * (instant: rebuilding a fork already decided, e.g. on RESUME)
   */
  choose(forkId: number, lane: number, instant = false) {
    const f = this.plan.forks[forkId];
    if (!f) return;
    for (const { sign, lane: of } of this.forkSigns.get(forkId) ?? []) {
      if (of < 0) continue;
      if (of === lane) sign.stamp(0, instant); else sign.cross(0, instant);
    }
    (this.seals.get(forkId) ?? []).forEach((gs, i) => { if (i !== lane) for (const g of gs) g.raise(instant); });
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

  /** rock lining the exit shaft (behind and in front of the play plane) so it reads as a shaft, not a cut */
  private dressExit(r: Rng, ex = this.plan.exit) {
    const scen = this.scen;
    for (const side of [-1, 1]) {
      const wx = side < 0 ? ex.x0 - 1.2 : ex.x1 + 1.2;
      for (let y = ex.bottom - 2; y < ex.top - 0.5; y += r.range(1.6, 2.4)) {
        for (const z of [-2.6, 1.9]) scen.addRock(r.pick(scen.shapes('bigboulder')), wx + side * r.range(0, 0.6), y, z + r.range(-0.4, 0.4), r.range(1.2, 1.7), r.range(1.8, 2.6), z > 0 ? 0.9 : 1.4, r.range(0, 6), { tilt: 0.2, tint: z > 0 ? 0.55 : 0.8 });
      }
    }
    // the shaft's back wall
    for (let y = ex.bottom - 2; y < ex.top; y += 2.4) scen.addRock(r.pick(scen.shapes('bigboulder')), (ex.x0 + ex.x1) / 2, y, -3.6, (ex.x1 - ex.x0) / 2 + 1.5, 2.6, 1.2, r.range(0, 6), { tilt: 0.2, tint: 0.6 });
  }

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
    const deep = depthOf(this.plan, this.plan.base) > 150;
    const n = Math.max(this.a.glow || deep ? 3 : this.scen.glowPts.length ? 1 : 0, this.pitGlows.length ? 2 : 0);
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
    for (const per of this.seals.values()) for (const gs of per) for (const g of gs) g.update(dt);
    for (const list of this.forkSigns.values()) for (const s of list) s.sign.update(dt);
    this.currents?.update(dt, camX, t, w.fx, this.flowing);
    // the crossroads pits breathe their colour (brighter once the grates open) and shed the motes of where they lead
    for (const g of this.pitGlows) {
      const open = this.exitOpen ? 1 : 0.35, end = this.plan.forks.find((f) => f.kind === 'end');
      const taken = !end || end.chosen < 0 || end.lanes[end.chosen]?.exit === g.exit ? 1 : 0.25;
      const m = g.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = (g.k * 0.55) * open * taken * (0.85 + Math.sin(t * 1.3 + g.x) * 0.15);
      if (Math.abs(g.x - camX) < 14 && Math.random() < dt * 6 * open * taken) {
        const b = baseOf(g.area), x = g.x + (Math.random() - 0.5) * 4.6, y = g.y - 2 - Math.random() * 3;
        if (b === 'kelp') w.fx.emit('leaf', x, y, { vy: 0.9, vx: (Math.random() - 0.5) * 0.4, life: 3, drag: 0.4, z: -0.6, color: '#7ab83a' });
        else if (b === 'graveyard') w.fx.emit('dust', x, y, { vy: 0.5, life: 2.4, size: 0.4, color: '#8a6a3a', z: -0.6 });
        else if (b === 'arctic') w.fx.emit('snow', x, y + 4, { vy: -0.4, vx: (Math.random() - 0.5) * 0.3, life: 4, size: 0.09, color: '#e8f8ff', z: -0.6 });
        else w.fx.emit('mote', x, y, { vy: 0.7, life: 3, color: g.col, z: -0.6, drift: 0.3 });
      }
    }
    // the manatee keeps office hours by her post box (well clear of the ceiling)
    const m = this.manatee;
    if (m) {
      m.update(dt, w, this.postX + 1.6, this.postY + 6.8);
    }
    if (this.grates.length) {
      this.grateA += ((this.exitOpen ? 1 : 0) - this.grateA) * (1 - Math.exp(-dt * 2.2));
      for (const gr of this.grates) { const [l, r] = gr.leaves; l.rotation.z = -this.grateA * 1.7; r.rotation.z = this.grateA * 1.7; }
    }
    for (const [i, l] of this.signLamps.entries()) if (l) { const k = 0.8 + Math.sin(t * 2.3 + i) * 0.15 + Math.sin(t * 7.1 + i * 3) * 0.05; (l.material as THREE.MeshBasicMaterial).color.setRGB(2.2 * k, 1.8 * k, 1.1 * k); }
    if (this.rope) { this.rope.root.rotation.z = Math.sin(t * 0.7) * 0.02; const k = 0.75 + Math.sin(t * 3) * 0.25; (this.rope.lamp.material as THREE.MeshBasicMaterial).color.setRGB(2.4 * k, 2.0 * k, 1.3 * k); }
    if (this.glowLamps.length) {
      let nn = 0;
      const near = this.near;
      const put = (g: { x: number; y: number; z: number; col: string }, kk: number, d: number) => { const o = near[nn] ?? (near[nn] = { x: 0, y: 0, z: 0, col: '', k: 0, d: 0 }); o.x = g.x; o.y = g.y; o.z = g.z; o.col = g.col; o.k = kk; o.d = d; nn++; };
      for (const g of this.scen.glowPts) if (Math.abs(g.x - camX) < 12) put(g, 1, Math.abs(g.x - camX));
      for (const g of this.scen.glowDyn) put(g, g.k, Math.abs(g.x - camX) + 1.5);
      for (const g of this.pitGlows) if (Math.abs(g.x - camX) < 16) put(g, g.k * (this.exitOpen ? 1 : 0.4), Math.abs(g.x - camX) + 0.5);
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
    this.manatee?.dispose();
    for (const o of this.props3d) disposeModel(o);
    for (const gr of this.grates) disposeModel(gr.root);
    for (const per of this.seals.values()) for (const gs of per) for (const g of gs) g.dispose();
    this.currents?.dispose();
    for (const g of this.pitGlows) { g.mesh.geometry.dispose(); (g.mesh.material as THREE.Material).dispose(); }
    if (this.rope) disposeModel(this.rope.root);
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
