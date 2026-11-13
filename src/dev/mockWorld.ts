// A minimal dive world for module previews: sky, water, lighting, a sandy seabed with rocks, a stand-in player
// (pink ball, WASD to swim, mouse click = poke) and a working World API. Preview screens extend MockScreen.
//
//   export default (g: Game) => new (class extends MockScreen { setup() { this.world.add(new Piranha(...)) } })(g, 'fish');
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { World, Entity, PlayerLike, Terrain, Team, DamageKind } from '../game/types';
import { makeSky } from '../gfx/sky';
import { WaterFX } from '../gfx/water/water';
import { Lighting, LOOKS } from '../gfx/lighting';
import { uw } from '../gfx/shaders/underwater';
import { Particles } from '../gfx/particles';
import { FloatText } from '../ui/text';
import { Px, ramp, pxNoise } from '../gfx/px';
import { Rng } from '../core/rng';
import { Run } from '../game/run';
import { audio } from '../audio/audio';
import { damp } from '../core/math';

class MockPlayer implements PlayerLike {
  kind = 'player'; team: Team = 'player';
  x = 0; y = -4; vx = 0; vy = 0; r = 0.45; alive = true; hp = 6; maxHp = 6;
  facing = 1; hooked = false; invuln = 0;
  obj: THREE.Mesh;
  constructor() {
    this.obj = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 20), uw(new THREE.MeshStandardMaterial({ color: '#f2a0b6', roughness: 0.4 }), { sss: [1, 0.4, 0.5], sssK: 0.6, rim: 0.4 }));
    this.obj.castShadow = true;
  }
  push(ix: number, iy: number) { this.vx += ix; this.vy += iy; }
  update(dt: number, w: World) {
    const a = w.game.input.axis();
    this.vx = damp(this.vx, a.x * 5, 6, dt); this.vy = damp(this.vy, a.y * 5, 6, dt);
    if (a.x) this.facing = Math.sign(a.x);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const s = w.terrain.sdf(this.x, this.y);
    if (s < this.r) { const n = w.terrain.normal(this.x, this.y); this.x += n.x * (this.r - s); this.y += n.y * (this.r - s); }
    this.y = Math.min(this.y, w.water.heightAt(this.x) - 0.2);
    this.invuln = Math.max(0, this.invuln - dt);
    this.obj.position.set(this.x, this.y, 0);
  }
}

class FlatTerrain implements Terrain {
  floor = -9;
  rocks = [{ x: -6, y: -8.6, r: 1.1 }, { x: 7, y: -8.4, r: 1.4 }, { x: 15, y: -8.8, r: 0.9 }];
  floorAt(x: number) { return this.floor + Math.sin(x * 0.18) * 0.6; }
  sdf(x: number, y: number) {
    let d = y - this.floorAt(x);
    for (const r of this.rocks) d = Math.min(d, Math.hypot(x - r.x, y - r.y) - r.r);
    return d;
  }
  normal(x: number, y: number) {
    const e = 0.05, dx = this.sdf(x + e, y) - this.sdf(x - e, y), dy = this.sdf(x, y + e) - this.sdf(x, y - e);
    const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l };
  }
  snags(x0: number, x1: number) { return this.rocks.filter((r) => r.x > x0 - 2 && r.x < x1 + 2); }
}

export class MockScreen implements Screen {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 900);
  overlay = new THREE.Scene();
  overlays = [{ scene: this.overlay, camera: this.camera as THREE.Camera }];
  light = new Lighting();
  world: World;
  camTarget = new THREE.Vector3(0, -4, 0);
  camDist = 16;
  camYOff = 0.8;
  followPlayer = true;
  protected terrainObj: THREE.Group;

  constructor(public game: Game, public name: string, look = 'reef') {
    const water = new WaterFX(), fx = new Particles(), text = new FloatText();
    const terrain = new FlatTerrain();
    const player = new MockPlayer();
    this.scene.add(makeSky(), water.group, this.light.group, fx.object, player.obj);
    this.overlay.add(text.group);
    this.light.applyLook(LOOKS[new URLSearchParams(location.search).get('look') || look]);
    fx.waterAt = (x) => water.heightAt(x);
    fx.floorAt = (x) => terrain.floorAt(x);
    const entities: Entity[] = [];
    const self = this;
    const run = new Run(1);
    this.world = {
      game, run, scene: this.scene, camera: this.camera, time: 0, water, fx, text, rng: new Rng(7), player, terrain, entities,
      add<T extends Entity>(e: T) { entities.push(e); if (e.obj && !e.obj.parent) self.scene.add(e.obj); return e; },
      hurtPlayer(dmg: number, fx_: number, fy: number, kind?: DamageKind) {
        if (player.invuln > 0) return;
        player.hp = Math.max(0, (player.hp ?? 6) - dmg); player.invuln = 0.8;
        const dx = player.x - fx_, dy = player.y - fy, l = Math.hypot(dx, dy) || 1;
        player.push((dx / l) * 6, (dy / l) * 6);
        text.pop('-' + dmg, player.x, player.y + 0.6, 'damage');
        game.addShake(0.15);
        void kind;
      },
      sfx(id: string, x?: number, vol?: number, rate?: number) { audio.play(id, { x, vol, rate }); },
      near(x: number, y: number, r: number, team?: Team) { return entities.filter((e) => e.alive && (!team || e.team === team) && Math.hypot(e.x - x, e.y - y) < r + e.r); },
      drop(x: number, y: number, what: { coins?: number; item?: string }) { text.pop(what.item ?? `+${what.coins ?? 0}`, x, y, 'gold'); },
      emit(ev: string, data?: Record<string, unknown>) { run.fire(ev, data); },
    };
    // seabed: sand with a few voxel-ish rocks
    this.terrainObj = new THREE.Group();
    const sand = new Px(128, 128);
    const r = ramp(['#4a3a2c', '#7a6248', '#a08460', '#c0a478'], 5);
    sand.fill((x, y) => r(pxNoise(x, y, 18, 4, 3, 128) * 0.8 + pxNoise(x, y, 4, 2, 9, 128) * 0.3, x, y));
    const st = sand.texture({ repeat: true }); st.repeat.set(40, 20);
    const g = new THREE.PlaneGeometry(240, 120, 160, 80);
    g.rotateX(-Math.PI / 2);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i) - 57; pa.setY(i, terrain.floorAt(x) + (z < 0 ? Math.sin(x * 0.11 + z * 0.2) * 0.8 - z * 0.02 : 0)); }
    g.translate(0, 0, -57);
    g.computeVertexNormals();
    const floor = new THREE.Mesh(g, uw(new THREE.MeshStandardMaterial({ map: st, roughness: 0.95 })));
    floor.receiveShadow = true;
    this.terrainObj.add(floor);
    for (const rk of terrain.rocks) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rk.r, 2), uw(new THREE.MeshStandardMaterial({ color: '#6a6458', roughness: 0.9, flatShading: true })));
      m.position.set(rk.x, rk.y, 0); m.castShadow = m.receiveShadow = true;
      this.terrainObj.add(m);
    }
    this.scene.add(this.terrainObj);
    this.setup();
  }

  /** override: add your entities / models */
  setup() {}
  /** override: per-frame extras */
  tick(_dt: number) {}

  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.world.fx.setPixelScale(h * Math.min(devicePixelRatio, 1.5), this.camera.fov);
  }
  enter() {}
  exit() {}
  update(dt: number) {
    const w = this.world;
    w.time += dt;
    w.player.update(dt, w);
    for (const e of w.entities) if (e.alive) e.update(dt, w);
    for (let i = w.entities.length - 1; i >= 0; i--) {
      const e = w.entities[i];
      if (!e.alive) { e.dispose?.(w); if (e.obj) e.obj.removeFromParent(); w.entities.splice(i, 1); }
    }
    this.tick(dt);
    if (this.followPlayer) this.camTarget.set(w.player.x, w.player.y, 0);
    const sh = this.game.shakeOffset();
    this.camera.position.set(this.camTarget.x + sh.x, this.camTarget.y + this.camYOff + sh.y, this.camDist);
    this.camera.lookAt(this.camTarget.x + sh.x, this.camTarget.y + this.camYOff + sh.y, 0);
    this.light.follow(this.camTarget.x, this.camTarget.y);
    w.water.update(this.game.renderer, dt, this.camTarget.x);
    w.fx.update(dt);
    w.text.update(dt);
    audio.listenerX = this.camTarget.x;
  }
}
