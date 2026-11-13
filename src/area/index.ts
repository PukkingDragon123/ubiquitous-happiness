// v2 areas: bounded, layered 2.5D ocean cross-sections the run takes place in.
//
//   const area = buildArea(world, 'kelp', seed);   // builds scenery, sand, terrain (world.terrain = area.terrain),
//                                                  // resource nodes, the shipwreck, the mail buoy + manatee, the ecosystem
//   light.applyLook(area.look); audio.music(area.music)
//   each frame: area.update(dt, camera.position.x)
//   area.shipwreck.needs() / .repair(materials) / .ready / .hp      (emits 'repair' {stage})
//   area.mailbox.ring() / .present / .deposit(items?)               (emits 'extract' {items, counts})
//   area.impact(x, y, r, k)                                         (explosions dig the sand; also on emit('explosion'))
//   area.dispose()
import * as THREE from 'three';
import type { World, Entity } from '../game/types';
import type { Look, LampHandle } from '../gfx/lighting';
import { AREAS, AreaDef, AreaId, areaDef } from './defs';
import { makeShape, Shape } from './shape';
import { Scenery } from './scenery';
import { SandField } from '../world/sand';
import { AreaTerrain } from '../world/areaTerrain';
import { ENV } from '../world/mats';
import { MEADOW, meadowLook } from '../world/meadow';
import { MarineSnow } from '../world/ocean';
import { buildLandmarks } from './landmarks';
import { Shipwreck } from './wreck';
import { MailBuoy } from './manatee';
import { placeNodes, ResourceNode } from './nodes';
import { Ecosystem } from './eco';
import { damp } from '../core/math';

export { AREAS, AREA_IDS } from './defs';
export type { AreaDef, AreaId } from './defs';
export { Shipwreck } from './wreck';
export { MailBuoy, Manatee } from './manatee';
export { ResourceNode } from './nodes';
export { EXTRA_MATERIALS, materialId } from './materials';

export interface Area {
  id: AreaId;
  name: string;
  def: AreaDef;
  /** playable span (the camera and player should stay inside x0..x1), seabed and surface heights */
  bounds: { x0: number; x1: number; floor: number; surface: number; top: number };
  /** lighting / water optics for Lighting.applyLook (lookId names the nearest LOOKS preset) */
  look: Look; lookId: string;
  music: string; ambience: string; swell: string;
  terrain: AreaTerrain;
  sand: SandField;
  shipwreck: Shipwreck;
  mailbox: MailBuoy;
  nodes: ResourceNode[];
  eco: Ecosystem;
  /** where things come from: boat x positions on the surface, diver entry points, the player's arrival */
  spawns: { surface: number[]; entries: { x: number; y: number; side: -1 | 1 }[]; player: { x: number; y: number } };
  group: THREE.Group;
  update(dt: number, cameraX: number): void;
  /** dig the sand / shake the plants at (x, y): explosions, ground pounds, big impacts */
  impact(x: number, y: number, r?: number, k?: number): void;
  /** hand the area the scene's Lighting rig so lanterns / vents cast real (pooled) point light */
  setLighting(rig: { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null): void;
  dispose(): void;
}

export function buildArea(world: World, areaId: string, seed: number): Area {
  const a = areaDef(areaId);
  const shape: Shape = makeShape(a, seed);
  const sand = new SandField(shape.X0 - 30, shape.X1 + 30, shape.bed, shape.sand0);
  const terrain = new AreaTerrain(sand, shape.X0, shape.X1);
  world.terrain = terrain;
  world.fx.floorAt = (x) => sand.heightAt(x);
  const scen = new Scenery(a, shape, sand, terrain, seed);
  scen.build();
  const group = new THREE.Group();
  group.name = 'area:' + a.id;
  group.add(scen.group);
  buildLandmarks(scen, group, world);
  const shipwreck = new Shipwreck(a, scen, shape.wreckX, world);
  const mailbox = new MailBuoy(a, scen, shape.buoyX, world);
  const nodes = placeNodes(a, scen, world, seed);
  scen.finish();
  world.add(shipwreck);
  world.add(mailbox);
  for (const n of nodes) world.add(n);
  const eco = new Ecosystem(a, scen, world, seed);
  meadowLook(a.look.sun, a.look.sunI, a.look.hemiSky, a.look.hemiGround, a.look.hemi);
  // swords and harpoons cut seaweed: a field entity whose slash() the blade sweep calls
  const plantField: Entity = {
    kind: 'plants', team: 'neutral', x: 0, y: 0, vx: 0, vy: 0, r: 0, alive: true,
    update() {},
    slash(ax: number, ay: number, bx: number, by: number) { return scen.sim.cut(ax, ay, bx, by) > 0; },
  };
  world.add(plantField);
  scen.sim.onCut = (x, y) => { world.fx.burst('bubble', x, y, 4, 1); world.fx.debrisBurst(x, y, 4, '#8a7224', 1.5, 0.04); world.sfx('sw_swish1', x, 0.4, 1.4); };
  group.add(eco.group);
  const snow = new MarineSnow(a.snow, a.snowCol);
  group.add(snow.points);
  snow.setScale(world.game.h * Math.min(devicePixelRatio || 1, 1.5), world.camera.fov);
  world.scene.add(group);

  // silt puffs + sand spray from the sand field
  const silt = new THREE.Color(a.pal.silt);
  sand.onPuff = (x, y, k) => {
    const n = Math.round(3 + k * 7);
    world.fx.emit('ink', x, y + 0.1, { n, spread: 0.25 + k * 0.25, vy: 0.25 + k * 0.2, speed: 0.4 + k * 0.6, life: 2.2 + k, size: 0.35 + k * 0.15, size1: 0.9 + k * 0.6, color: silt, alpha: 0.5, grav: 0.05, drag: 2.2 });
    world.fx.emit('dust', x, y + 0.05, { n: Math.round(2 + k * 5), spread: 0.3, vy: 0.6, speed: 1 + k, life: 1.6, size: 0.06, color: silt, grav: -1.2, drag: 1.5 });
  };
  sand.onSpray = (x, y, k) => { world.fx.debrisBurst(x, y, Math.round(6 + k * 8), a.pal.sand[2], 3 + k * 2, 0.05); };

  const y0 = sand.heightAt(shape.spawnX);
  const surface = [shape.X0 + 14, shape.X0 + 40, shape.wreckX - 16, shape.wreckX + 18, shape.X1 - 40, shape.X1 - 14].filter((x) => Math.abs(x - shape.buoyX) > 6);
  const entries: Area['spawns']['entries'] = [
    { x: shape.X0 + 3, y: (y0 + 0) * 0.5, side: -1 }, { x: shape.X0 + 3, y: y0 + 2, side: -1 },
    { x: shape.X1 - 3, y: (y0 + 0) * 0.5, side: 1 }, { x: shape.X1 - 3, y: y0 + 2, side: 1 },
  ];
  let t = 0, blastAge = 99;
  const glowLamps: LampHandle[] = [];
  const impact = (x: number, y: number, r = 1.5, k = 1) => {
    sand.impact(x, y, r, k);
    ENV.uBlast.value.set(x, y, 0, Math.min(1.5, k));
    scen.sim.impulse(x, y, r, k);
    blastAge = 0;
    for (const n of nodes) if (n.alive && Math.abs(n.x - x) < r + 1.5) n.shake(k);
    eco.scare(x, y, r * 3);
  };
  // anything that emits an explosion digs the sand
  const onBoom = (d: Record<string, unknown>) => { if (typeof d.x === 'number' && typeof d.y === 'number') impact(d.x, d.y, (d.r as number) ?? 1.6, (d.k as number) ?? 1); };
  world.run.on('explosion', onBoom);
  const onKill = (d: Record<string, unknown>) => { if (typeof d.x === 'number' && typeof d.y === 'number') eco.remains(d.x, d.y); };
  world.run.on('kill', onKill);

  const area: Area = {
    id: a.id, name: a.name, def: a,
    bounds: { x0: shape.X0 + 8, x1: shape.X1 - 8, floor: a.floor, surface: 0, top: a.ice ? -1.2 : 0 },
    look: a.look, lookId: a.lookId, music: a.music, ambience: a.ambience, swell: a.swell,
    terrain, sand, shipwreck, mailbox, nodes, eco,
    spawns: { surface, entries, player: { x: shape.spawnX, y: y0 + 3 } },
    group,
    update(dt: number, cameraX: number) {
      t += dt;
      const p = world.player;
      // the blobfish stirs the sand and brushes the plants
      sand.stir(p.x, p.y, p.vx, p.vy, p.r, dt);
      ENV.uPush.value.set(p.x, p.y, 1.4, Math.min(1, Math.hypot(p.vx, p.vy) / 4 + 0.35));
      blastAge += dt; ENV.uBlast.value.z = blastAge;
      ENV.uCurrent.value = damp(ENV.uCurrent.value, 0.18 + Math.sin(t * 0.13) * 0.12, 1, dt);
      sand.step(dt);
      // pushers for the meadow: the player and the nearest moving things
      const pu = MEADOW.uPushers.value;
      pu[0].set(p.x, p.y, p.r, Math.min(1.2, 0.5 + Math.hypot(p.vx, p.vy) / 4));
      let k = 1;
      for (const e of world.entities) {
        if (k >= pu.length) break;
        if (!e.alive || !e.obj || e.kind === 'resource' || e.kind === 'shipwreck' || e.kind === 'mailbuoy' || e.kind === 'plants' || Math.abs(e.x - cameraX) > 14) continue;
        pu[k++].set(e.x, e.y, Math.max(0.25, Math.min(1.5, e.r)), Math.min(1.1, 0.4 + Math.hypot(e.vx, e.vy) / 4));
      }
      for (; k < pu.length; k++) pu[k].set(0, -999, 0, 0);
      scen.sim.update(dt, world, cameraX);
      if (glowLamps.length) {
        const near = scen.glowPts.filter((g) => Math.abs(g.x - cameraX) < 11).sort((a, b) => Math.abs(a.x - cameraX) - Math.abs(b.x - cameraX));
        glowLamps.forEach((l, i) => {
          const g = near[i];
          if (!g) { l.light.intensity = 0; return; }
          l.set(g.x, g.y, g.z);
          l.light.color.set(g.col);
          l.light.intensity = 4.5 * (0.8 + 0.2 * Math.sin(t * 1.7 + i * 2));
          l.light.distance = 7;
        });
      }
      scen.update(dt, cameraX, t);
      eco.update(dt, cameraX);
      snow.update(cameraX, p.y, t);
    },
    impact,
    setLighting(rig) {
      shipwreck.setLighting(rig);
      // bioluminescence: pooled point lights hang on the glow sources nearest the camera
      for (const l of glowLamps) l.release();
      glowLamps.length = 0;
      if (rig && scen.glowPts.length) for (let i = 0; i < 3; i++) { const l = rig.lamp(0, -999, 0, '#5af0ff', 0, 7); if (l) glowLamps.push(l); }
    },
    dispose() {
      for (const [ev, fn] of [['explosion', onBoom], ['kill', onKill]] as const) {
        const l = world.run.hooks.get(ev); if (l) world.run.hooks.set(ev, l.filter((f) => f !== fn));
      }
      for (const l of glowLamps) l.release();
      eco.dispose();
      for (const n of nodes) n.alive = false;
      shipwreck.alive = false; mailbox.alive = false; plantField.alive = false;
      scen.sim.dispose();
      scen.dispose();
      sand.dispose();
      group.removeFromParent();
    },
  };
  sand.bind();
  return area;
}
