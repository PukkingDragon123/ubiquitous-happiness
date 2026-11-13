// The dive: one fishing spot of the infinite ocean. Builds the world for a map node (biome, anglers, creatures),
// runs the gameplay loop, frames the camera, and when every angler has given up, a crossroads current opens
// that carries you back to the map.
import * as THREE from 'three';
import type { Game, Screen } from './game';
import type { World, Entity, Team, DamageKind } from './types';
import { Run } from './run';
import { makeSky } from '../gfx/sky';
import { WaterFX } from '../gfx/water/water';
import { Lighting, LOOKS } from '../gfx/lighting';
import { Particles } from '../gfx/particles';
import { FloatText, textSprite, STYLES } from '../ui/text';
import { Hud } from '../ui/hud';
import { Rng } from '../core/rng';
import { Blobfish } from '../player/blobfish';
import { FishingSystem } from '../fishing/angler';
import { Ocean } from '../world/ocean';
import { biomeOf, Biome } from '../world/biomes';
import { audio } from '../audio/audio';
import { clamp, damp, smooth } from '../core/math';
import { POST } from '../gfx/post';
import { UW } from '../gfx/shaders/underwater';
import { Pickup, pickupHooks } from './pickup';
import { Current } from './current';
import { spotLayout } from './spots';
import { eventLayout } from './events';
import { setupBoss } from '../fishing/boss';

export interface DiveNode { type: string; spot: string; biome: string; difficulty: number; name?: string; id?: number }

export class DiveScreen implements Screen {
  name = 'dive';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
  overlay = new THREE.Scene();
  hud = new Hud();
  overlays = [{ scene: this.overlay, camera: this.camera as THREE.Camera }, { scene: this.hud.scene, camera: this.hud.camera as THREE.Camera }];
  world!: DiveWorld;
  light = new Lighting();
  run!: Run;
  node!: DiveNode;
  ocean!: Ocean;
  biome!: Biome;
  fishing!: FishingSystem;
  player!: Blobfish;
  private camPos = new THREE.Vector3(0, -4, 16);
  private camLook = new THREE.Vector3(0, -4, 0);
  private camDist = 16;
  private cleared = false;
  private deadT = -1;
  private ambience: ReturnType<typeof audio.loop> | null = null;
  private heartbeat = 0;
  private introT = 0;
  onExit?: (result: 'cleared' | 'dead', run: Run) => void;
  /** creature spawner installed by the creatures module integration */
  static populate?: (w: World, biome: Biome, node: DiveNode, x0: number, x1: number) => void;
  static ambientSpawn?: (w: World, biome: Biome, camX: number, dt: number) => void;
  /** spawns `n` hostile creatures; calls done() once they're all gone */
  static ambush?: (w: World, x: number, y: number, n: number, done: () => void) => void;
  /** sets up a boss fight for a boss node; calls done() on victory */
  static boss?: (w: World, node: DiveNode, fishing: FishingSystem, done: () => void) => void;

  constructor(public game: Game) {}

  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.hud.resize(w, h);
    const ph = h * Math.min(devicePixelRatio || 1, 1.5);
    this.world?.fx.setPixelScale(ph, this.camera.fov);
    this.ocean?.snow.setScale(ph, this.camera.fov);
  }

  enter(data?: unknown) {
    const d = data as { run: Run; node: DiveNode };
    this.run = d.run; this.node = d.node;
    this.biome = biomeOf(this.node.biome);
    this.build();
  }

  private build() {
    // fresh scene graph per dive
    this.scene.clear(); this.overlay.clear();
    const b = this.biome;
    const seed = (this.run.seed ^ Math.imul((this.node.id ?? this.run.depth) + 1, 2654435761)) >>> 0;
    this.light = new Lighting();
    this.light.applyLook(LOOKS[b.look] ?? LOOKS.reef);
    const water = new WaterFX();
    water.sim.setSwell(b.swell);
    const fx = new Particles();
    const text = new FloatText();
    this.ocean = new Ocean(b, seed);
    this.ocean.terrain.flatX = -18;
    this.player = new Blobfish(-18, -4.5);
    this.player.setStats(this.run.stats());
    this.player.hp = Math.min(this.run.hp, this.run.stats().maxHp);
    this.scene.add(makeSky(), water.group, this.light.group, fx.object, this.ocean.group, this.player.obj);
    this.overlay.add(text.group);
    fx.waterAt = (x) => water.heightAt(x);
    fx.floorAt = (x) => this.ocean.terrain.floorAt(x);
    fx.onSurfacePop = (x) => { if (Math.random() < 0.3) water.disturb(x, 0.15, 0.1); };
    this.world = new DiveWorld(this.game, this.run, this.scene, this.camera, water, fx, text, new Rng(seed), this.player, this.ocean);
    this.fishing = new FishingSystem();
    this.overlay.add(this.fishing.qte.group);
    this.fishing.onAllDefeated = () => this.spotCleared();
    this.player.onDeath = () => { this.deadT = 0; };
    pickupHooks(this.world);
    // the spot: anglers, vessels, set dressing — or an event / a boss
    const t = this.node.type;
    if (t === 'shop' || t === 'rest' || t === 'treasure' || t === 'mystery') {
      eventLayout(this.world, this.node, () => this.spotCleared(t === 'shop' || t === 'rest' ? 'quiet' : 'loud'), (x, y, n) => {
        if (DiveScreen.ambush) DiveScreen.ambush(this.world, x, y, n, () => this.spotCleared('loud'));
        else this.spotCleared('loud');
      });
    } else if (t === 'boss') {
      (DiveScreen.boss ?? setupBoss)(this.world, this.node, this.fishing, () => this.spotCleared('boss'));
    } else spotLayout(this.world, this.fishing, this.node);
    DiveScreen.populate?.(this.world, b, this.node, -30, 40);
    this.cleared = false; this.deadT = -1; this.introT = 0;
    this.camPos.set(this.player.x, this.player.y + 1, 16);
    this.camLook.set(this.player.x, this.player.y, 0);
    this.resize(this.game.w, this.game.h);
    // arrival: you burst out of a current from the left
    this.player.sb.accel(9 / 0.016, 0, 0.016);
    fx.emit('bubbleBig', this.player.x - 1, this.player.y, { n: 18, spread: 0.8, speed: 2 });
    const title = this.node.name ?? spotName(this.node.spot);
    text.pop(title.toUpperCase(), 0, 2.2, 'title', { size: 0.8, life: 3.4, vy: 0.15, follow: () => ({ x: this.camLook.x, y: this.camLook.y }) });
    const n = this.fishing.anglers.length;
    if (n) setTimeout(() => text.pop(`Snap their lines! ${n} angler${n > 1 ? 's' : ''} left`, 0, 1.3, 'hint', { size: 0.34, life: 3, vy: 0.1, follow: () => ({ x: this.camLook.x, y: this.camLook.y }) }), 900);
    audio.music(b.music);
    this.ambience?.stop(); this.ambience = audio.loop(b.ambience, 0.35);
    POST.uPulse.value = 0; POST.uDesat.value = 0;
    this.game.timeScale = 1;
  }

  exit() { this.ambience?.stop(); this.ambience = null; this.player?.dispose(); this.fishing?.qte.cancel(); }

  private spotCleared(kind: 'loud' | 'quiet' | 'boss' = 'loud') {
    if (this.cleared) return;
    this.cleared = true;
    const w = this.world;
    if (kind !== 'quiet') {
      w.text.pop(kind === 'boss' ? 'VICTORY!' : 'SPOT CLEARED!', this.player.x, this.player.y + 1.8, 'title', { size: kind === 'boss' ? 0.9 : 0.7, life: 3 });
      w.sfx(kind === 'boss' ? 'jin_legend' : 'jin_good', this.player.x, 0.8);
    }
    this.run.depth++;
    // the crossroads current opens a little ahead of you
    setTimeout(() => {
      const c = new Current(this.player.x + 7, Math.max(this.ocean.terrain.floorAt(this.player.x + 7) + 3, Math.min(-2.5, this.player.y)), () => this.leave('cleared'));
      w.add(c);
      w.text.pop('A current stirs...', c.x, c.y + 1.6, 'hint', { size: 0.34, life: 3 });
    }, 1600);
  }

  private leave(result: 'cleared' | 'dead') {
    this.run.hp = this.player.hp;
    this.onExit?.(result, this.run);
  }

  update(dt: number) {
    const w = this.world, p = this.player, inp = this.game.input;
    this.game.cursor = 'aim';
    w.time += dt; this.introT += dt;
    this.run.time += dt;
    // stats can change mid-dive (pickups)
    if (w.statsDirty) { const hp = p.hp; p.setStats(this.run.stats()); p.hp = Math.min(hp, p.maxHp); w.statsDirty = false; }
    // dynamic colliders: boat hulls, pilings
    this.ocean.terrain.dynamic = this.fishing.colliders();
    p.update(dt, w);
    this.fishing.update(dt, w);
    for (let i = 0; i < w.entities.length; i++) { const e = w.entities[i]; if (e.alive) e.update(dt, w); }
    for (let i = w.entities.length - 1; i >= 0; i--) {
      const e = w.entities[i];
      if (!e.alive) { e.dispose?.(w); e.obj?.removeFromParent(); w.entities.splice(i, 1); }
    }
    DiveScreen.ambientSpawn?.(w, this.biome, this.camLook.x, dt);
    w.emit('tick', { dt });
    // ---- camera
    let tx = p.x + clamp(p.vx * 0.35, -2.5, 2.5), ty = p.y + clamp(p.vy * 0.25, -1.5, 1.5);
    let dist = 15.5;
    const hookedA = p.hooked ? this.fishing.anglers.find((a) => a.line && p.hook?.line === a.line) : null;
    if (hookedA?.line) {
      // frame both the fish and the fisherman's rod tip
      tx = (p.x + hookedA.line.tip.x) / 2; ty = (p.y + hookedA.line.tip.y) / 2 - 0.5;
      dist = clamp(Math.hypot(p.x - hookedA.line.tip.x, p.y - hookedA.line.tip.y) * 1.1 + 8, 14, 24);
    } else if (p.y > -4.5) { ty = damp(ty, p.y + 1.2, 1, 1); }
    const floor = this.ocean.terrain.floorAt(tx);
    ty = clamp(ty, floor + 3.2, 2.2);
    this.camDist = damp(this.camDist, dist, 2.5, dt);
    this.camLook.x = damp(this.camLook.x, tx, 4, dt); this.camLook.y = damp(this.camLook.y, ty, 4, dt);
    const sh = this.game.shakeOffset();
    this.camPos.set(this.camLook.x + sh.x, this.camLook.y + 0.6 + sh.y, this.camDist);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook.x + sh.x * 0.5, this.camLook.y + sh.y * 0.5, 0);
    this.light.follow(this.camLook.x, this.camLook.y);
    // ---- world systems
    w.water.update(this.game.renderer, dt, this.camLook.x);
    this.ocean.update(this.camLook.x, this.camLook.y, w.time);
    w.fx.update(dt);
    w.text.update(dt);
    // ---- audio
    audio.listenerX = this.camLook.x;
    audio.setUnderwater(this.camera.position.y < 0.2 ? 0.55 : 0.15);
    // ---- feedback: low-health heartbeat, decompression desaturation
    const low = p.alive && p.hp <= 2;
    this.heartbeat -= dt;
    if (low && this.heartbeat <= 0) { this.heartbeat = 1.0; audio.play('heartbeat1', { vol: 0.5 }); POST.uPulse.value = 1; }
    POST.uPulse.value *= Math.exp(-dt * 3);
    POST.uDesat.value = damp(POST.uDesat.value, p.hooked ? p.pressure * 0.6 : 0, 3, dt);
    // ---- HUD
    this.run.hp = p.hp;
    this.hud.update(dt, w.time, { hp: p.hp, maxHp: p.maxHp, coins: this.run.coins, ability: p.ability, cooldown: p.ability ? p.cds[p.ability] ?? 0 : 0, energy: p.laserEnergy });
    // ---- menus
    if (inp.hit('bag') && this.game.get('backpack') && !p.hooked) {
      this.game.openModal('backpack', { run: this.run, onClose: () => { this.game.closeModal(); w.statsDirty = true; } });
    }
    if (inp.hit('pause') && this.game.get('pause')) this.game.openModal('pause', { run: this.run, onClose: () => this.game.closeModal() });
    // ---- death
    if (this.deadT >= 0) {
      this.deadT += dt;
      POST.uDesat.value = Math.min(1, this.deadT * 0.5);
      if (this.deadT > 3.2) { this.deadT = -1; this.leave('dead'); }
    }
    void smooth; void UW;
  }
}

export function spotName(spot: string) {
  return ({ pier: 'Creaky Pier', rowboatCove: 'Rowboat Cove', kelpForest: 'Kelp Forest', harbor: 'Grimy Harbor', reef: 'Coral Shallows', iceHole: 'Ice Hole', trawlerLane: 'Trawler Lane', sunsetBay: 'Sunset Bay', boss: 'The Big Catch' } as Record<string, string>)[spot] ?? 'Open Water';
}

// ------------------------------------------------------------------ the World implementation for a dive
export class DiveWorld implements World {
  entities: Entity[] = [];
  time = 0;
  statsDirty = false;
  terrain;
  private listeners = new Map<string, ((d: Record<string, unknown>) => void)[]>();
  constructor(public game: Game, public run: Run, public scene: THREE.Scene, public camera: THREE.PerspectiveCamera, public water: WaterFX, public fx: Particles, public text: FloatText, public rng: Rng, public player: Blobfish, public ocean: Ocean) {
    this.terrain = ocean.terrain;
  }
  add<T extends Entity>(e: T): T { this.entities.push(e); if (e.obj && !e.obj.parent) this.scene.add(e.obj); return e; }
  hurtPlayer(dmg: number, fx: number, fy: number, kind?: DamageKind) { this.player.damage(dmg, fx, fy, this, kind); }
  sfx(id: string, x?: number, vol?: number, rate?: number) { audio.play(id, { x, vol, rate }); }
  near(x: number, y: number, r: number, team?: Team) {
    const out: Entity[] = [];
    for (const e of this.entities) if (e.alive && (!team || e.team === team) && Math.abs(e.x - x) < r + e.r + 2 && Math.hypot(e.x - x, e.y - y) < r + e.r) out.push(e);
    return out;
  }
  drop(x: number, y: number, what: { coins?: number; item?: string; heal?: number }) {
    if (what.coins) { const n = Math.min(8, Math.ceil(what.coins / 3)); for (let i = 0; i < n; i++) this.add(new Pickup(x, y, { coins: Math.ceil(what.coins / n) })); }
    if (what.item) this.add(new Pickup(x, y, { item: what.item }));
    if (what.heal) this.add(new Pickup(x, y, { heal: what.heal }));
  }
  on(ev: string, fn: (d: Record<string, unknown>) => void) { const l = this.listeners.get(ev) || []; l.push(fn); this.listeners.set(ev, l); }
  emit(ev: string, data: Record<string, unknown> = {}) {
    this.run.fire(ev, data);
    for (const fn of this.listeners.get(ev) || []) fn(data);
    if (ev === 'heal') this.player.heal((data.amount as number) ?? 1, this);
  }
}

export { textSprite, STYLES };
