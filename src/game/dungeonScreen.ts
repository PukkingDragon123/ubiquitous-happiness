// The v3 RUN: a Binding-of-Isaac style dungeon crawl (replaces runScreen.ts's wave defense as the run).
//
//   floors follow the areas from cfg.startArea down the progression (reef > kelp > graveyard > arctic > abyss);
//   3 floors at mastery 0 (floorsForMastery). Each floor is a seeded grid of 10-14 rooms (src/dungeon/floor.ts):
//   start, combat, treasure (locked: key), Mr. Crab's shop, the manatee's post office, a challenge, a secret room
//   (bomb the cracked wall) and the boss. Swim through a door: a quick slide + fade into the next room, entering
//   from the matching side. Uncleared combat rooms slam their gates and spawn K's enemies (src/combat); clearing
//   opens them and drops an Isaac-style reward. Every item pickup goes into the backpack grid (src/dungeon/pack.ts);
//   pearls, keys, bombs and hearts are counters. The boss drops a pedestal item and opens the hatch down.
//   Death loses the pack (mailed items are safe); beating the last boss brings the pack home.
//
//   const ds = new DungeonScreen(game); game.register(ds);
//   game.go('dungeon', { cfg })            a new run from a RunConfig (loadout uids come out of the stash)
//   game.go('dungeon', { resume: true })   continue the saved run (loadDungeonSave())
//   game.go('dungeon')                     dev: from the URL (?preview=dungeon&floor=reef&room=boss&god=1&mastery=0
//                                          &floorIdx=0&seed=N&rich=1&reveal=1&keys=N&bombs=N&pearls=N)
//   The run end goes to (window).flow.runEnded(result) when flow has it, else hideout + the result card.
//
// World events (besides K's and the v2 ones): 'roomEnter' {type, id}, 'roomCleared' {type}, 'floorCleared' {n},
// 'bossDefeated' {id} (if the boss didn't), 'extract' {items, counts} (mail), 'itemPicked' {id}, 'packFull' {id}.
import * as THREE from 'three';
import type { Game, Screen } from './game';
import { Run, type ItemInst } from './run';
import { makeSky } from '../gfx/sky';
import { WaterFX } from '../gfx/water/water';
import { Lighting } from '../gfx/lighting';
import { Particles } from '../gfx/particles';
import { POST } from '../gfx/post';
import { Text3DLayer, Float3D, T3D, type T3DStyle } from '../ui/text3d';
import type { Entity } from './types';
import { Rng } from '../core/rng';
import { clamp, damp } from '../core/math';
import { audio } from '../audio/audio';
import { Blobfish } from '../player/blobfish';
import { SkillBar } from '../skills/hud';
import { ITEMS, installItemSystem, skillLevels, abilityLevels, findSpot, getItem, expandIds } from './items';
import { META, saveMeta, addMaterials, stashItem, takeFromStash, returnToStash, type RunConfig, type RunResult, type RunTally } from '../meta/meta';
import { AREAS as AREA_LIST, masteryScalars, MAX_MASTERY } from '../hideout/mastery';
import { stationsBuilt } from '../hideout/blueprints';
import { spawnEnemy, ENEMIES_FOR, spawnBoss, setArena, type BossEntity, type EnemyKind, type PlayerCombatHud } from '../combat';
import { roomBudget } from '../combat/index';
import { board } from '../waves/board';
import { Dialogue } from '../story/dialogue';
import { genFloor, reveal, floorAreas, floorsForMastery, DIRS, OPP, type Floor, type RoomNode, type Dir } from '../dungeon/floor';
import { RoomBuild, ROOM_FLOOR } from '../dungeon/room';
import { HALF_W, DOOR_Y0, DOOR_Y1, SHAFT_HW, ROOM_H } from '../dungeon/terrain';
import { Door } from '../dungeon/doors';
import type { GateKind } from '../dungeon/models';
import { DungeonWorld } from '../dungeon/world';
import { Pickup } from '../dungeon/pickups';
import { PufferBomb } from '../dungeon/bomb';
import { packAdd, packCells, packTotals, packLoose, packFits } from '../dungeon/pack';
import { rollClearReward, rollGear, rollMaterial, rollShop, type Reward } from '../dungeon/rewards';
import { minimapData } from '../dungeon/minimap';
import { DungeonHud, type DungeonHudState, type HudAnchor, type MailState } from '../dungeon/hud';
import { Pedestal, ShopStock, ChestProp, ExitHatch, PostOffice, type ShopStand } from '../dungeon/contents';

// ------------------------------------------------------------------ save / resume
export interface DungeonTally extends RunTally { rooms: number; floors: number; pearls: number }
export interface DungeonSave {
  v: 3;
  cfg: RunConfig; seed: number;
  floors: string[]; floorIdx: number; floor: Floor; roomId: number;
  hp: number; items: ItemInst[]; nextUid: number;
  pearls: number; keys: number; bombs: number;
  tally: DungeonTally; mailed: string[];
}
const SAVE_KEY = 'blobfish.dungeon.v3';
export function loadDungeonSave(): DungeonSave | null {
  try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const s = JSON.parse(raw) as DungeonSave; return s && s.v === 3 ? s : null; } catch { return null; }
}
export const hasDungeonSave = () => !!loadDungeonSave();
export function clearDungeonSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* blocked */ } }

/** the run's end, for flow / the result card: RunResult (the v2 card reads it) + the dungeon's own fields */
export interface DungeonResult extends RunResult {
  won: boolean;
  /** 0-based floor reached / floors in the run */
  floor: number; floors: number;
  kills: number;
  /** ids lost with the pack (death) */
  packLost: string[];
  /** ids mailed home during the run (safe either way) */
  mailed: string[];
  /** ids brought home by a victory */
  broughtHome: string[];
}

export interface DungeonEnter { cfg?: RunConfig; resume?: boolean | DungeonSave }

type Phase = 'play' | 'trans' | 'dead' | 'descend' | 'done';
type Fight = 'calm' | 'arming' | 'fight' | 'boss';

const AREA_NAME = (id: string) => AREA_LIST.find((a) => a.id === id)?.name ?? id;
const ENTRY_GAP = 1.3;

export class DungeonScreen implements Screen {
  name = 'dungeon';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
  overlay = new THREE.Scene();
  hud = new DungeonHud();
  bar = new SkillBar();
  t3d = new Text3DLayer();
  overlays: { scene: THREE.Scene; camera: THREE.Camera }[] = [
    { scene: this.overlay, camera: this.camera },
    { scene: this.bar.scene, camera: this.bar.camera },
    this.hud.ui.layer,
  ];
  /** the run ended (META already updated); default: flow.runEnded, else hideout + result card */
  onEnd?: (r: DungeonResult) => void;
  /** paused -> quit (the run is saved) */
  onQuit?: () => void;

  run!: Run;
  cfg: RunConfig = { mastery: 0, startArea: 'reef', loadout: [] };
  seed = 1;
  floors: string[] = [];
  floorIdx = 0;
  floor!: Floor;
  roomId = 0;
  keys = 1; bombs = 1;
  tally: DungeonTally = { kills: 0, time: 0, waves: 0, extracted: 0, repairs: 0, bosses: 0, rooms: 0, floors: 0, pearls: 0 };
  mailed: string[] = [];
  world!: DungeonWorld;
  player!: Blobfish;
  room: RoomBuild | null = null;
  doors: Partial<Record<Dir, Door>> = {};
  phase: Phase = 'play';
  fight: Fight = 'calm';
  paused = false;
  light = new Lighting();
  private water = new WaterFX();
  private fx = new Particles();
  private text!: Float3D;
  private dlg!: Dialogue;
  private cache = new Map<number, RoomBuild>();
  private props: { update(dt: number, ...a: unknown[]): void; dispose(): void; group: THREE.Object3D }[] = [];
  private pedestal: Pedestal | null = null;
  private shop: ShopStock | null = null;
  private chest: ChestProp | null = null;
  private hatch: ExitHatch | null = null;
  private post: PostOffice | null = null;
  private boss: BossEntity | null = null;
  private bossDeadT = -1;
  private bossDone = false;
  private pending: { t: number; kind: EnemyKind; x: number; y: number; elite: boolean }[] = [];
  private clearT = 0;
  private trans: { dir: Dir; t: number; swapped: boolean; to: number } | null = null;
  private camOff = new THREE.Vector2();
  private camLook = new THREE.Vector3();
  private camDist = 19.5;
  private seq: { t: number; fn: () => void }[] = [];
  private deadT = -1;
  private ended = false;
  private god = false;
  private dev: URLSearchParams | null = null;
  private scal = masteryScalars(0);
  private perks = new Set<string>();
  private mail: MailState | null = null;
  private heartbeat = 0;
  private wakeT = 0;
  private ambience: ReturnType<typeof audio.loop> | null = null;
  private v = new THREE.Vector3();
  private hpSeen = new WeakMap<Entity, number>();
  private dmgAcc = new Map<Entity, number>();
  private dmgT = 0;
  private critPending = false;
  private stuck = new WeakMap<Entity, number>();
  private killer: RunResult['killer'] = null;
  private fullPopT = 0;

  constructor(public game: Game) {
    (window as unknown as { dungeon: DungeonScreen }).dungeon = this;
  }

  // ================================================================ Screen
  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.hud.resize(w, h, this.game.renderer.getPixelRatio());
    this.bar.resize(w, h);
    this.fx.setPixelScale(h * Math.min(devicePixelRatio || 1, 1.5), this.camera.fov);
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as DungeonEnter;
    this.ended = false; this.paused = false; this.seq = []; this.deadT = -1; this.killer = null; this.mail = null;
    this.game.timeScale = 1;
    POST.uDesat.value = 0; POST.uPulse.value = 0; POST.uFade.value = 0;
    const q = new URLSearchParams(location.search);
    this.dev = !d.cfg && !d.resume ? q : null;
    this.god = q.get('god') === '1';
    this.perks = new Set(stationsBuilt());
    this.setupWorld();
    const save = d.resume === true ? loadDungeonSave() : d.resume || null;
    if (save) this.restore(save);
    else this.fresh(d.cfg ?? this.devConfig(q));
    this.save();
  }

  exit() {
    this.ambience?.stop(); this.ambience = null;
    this.teardownRoom(true);
    for (const r of this.cache.values()) r.dispose();
    this.cache.clear();
    this.world?.clear();
    this.player?.dispose();
    this.scene.clear(); this.overlay.clear(); this.t3d.clear();
    this.game.timeScale = 1;
    POST.uDesat.value = 0; POST.uPulse.value = 0; POST.uFade.value = 0; POST.uLetterbox.value = 0;
    this.game.cursor = 'normal';
  }

  // ================================================================ setup
  private devConfig(q: URLSearchParams): RunConfig {
    return { mastery: Number(q.get('mastery') || 0), startArea: q.get('floor') || q.get('area') || 'reef', loadout: [] };
  }

  private setupWorld() {
    this.scene.clear(); this.overlay.clear(); this.t3d.clear();
    this.light = new Lighting();
    this.water = new WaterFX(); this.fx = new Particles(); this.text = new Float3D(this.t3d);
    this.player?.dispose();
    this.player = new Blobfish(0, -10);
    this.run = new Run(1);
    const w = this.world = new DungeonWorld(this.game, this.run, this.scene, this.camera, this.water, this.fx, this.text, new Rng(1), this.player);
    w.god = this.god;
    w.collect = (p) => this.collect(p);
    this.scene.add(makeSky(), this.water.group, this.light.group, this.fx.object, this.player.obj, this.t3d.group);
    this.overlay.add(this.text.group);
    this.fx.waterAt = (x) => this.water.heightAt(x);
    this.player.onDeath = () => this.die();
    this.dlg = new Dialogue(this.hud.ui, () => this.camera);
    this.dlg.speaker({ id: 'crab', name: 'MR. CRAB', color: '#e8603a', voice: 'crab_click', pitch: 0.9, anchor: () => this.shop?.head() ?? null });
    this.dlg.speaker({ id: 'manatee', name: 'MAUDE', color: '#8ab8e8', voice: 'whale', pitch: 1.6, vol: 0.25, anchor: () => this.post ? new THREE.Vector3(this.post.at.x, this.post.at.y + 1.2, -1) : null });
    this.wire();
    this.resize(this.game.w, this.game.h);
  }

  private fresh(cfg: RunConfig) {
    this.cfg = { ...cfg, loadout: [...cfg.loadout] };
    const dev = this.dev;
    this.seed = dev ? Number(dev.get('seed') || 12345) : (Math.random() * 1e9) | 0;
    this.run.seed = this.seed; this.run.rng = new Rng(this.seed);
    this.world.rng = new Rng(this.seed ^ 0xd00d);
    // the loadout leaves the stash and goes into the pack
    const items = dev ? [] : takeFromStash(cfg.loadout);
    let uid = 1;
    for (const it of items) uid = Math.max(uid, it.uid + 1);
    this.run.nextUid = uid;
    for (const it of items) {
      const inst: ItemInst = { ...it, gx: -1, gy: -1, rot: it.rot ?? 0 };
      const spot = findSpot(this.run.items, inst);
      if (spot) { inst.gx = spot.gx; inst.gy = spot.gy; inst.rot = spot.rot; }
      this.run.items.push(inst);
    }
    this.scal = masteryScalars(this.cfg.mastery);
    this.floors = floorAreas(this.cfg.startArea, floorsForMastery(this.cfg.mastery, this.scal as { floors?: number }));
    this.floorIdx = dev ? clamp(Number(dev.get('floorIdx') || 0), 0, this.floors.length - 1) : 0;
    this.keys = dev?.get('keys') ? Number(dev.get('keys')) : 1;
    this.bombs = dev?.get('bombs') ? Number(dev.get('bombs')) : 1;
    this.run.coins = dev?.get('pearls') ? Number(dev.get('pearls')) : 0;
    this.tally = { kills: 0, time: 0, waves: 0, extracted: 0, repairs: 0, bosses: 0, rooms: 0, floors: 0, pearls: 0 };
    this.mailed = [];
    this.installStats();
    this.run.hp = this.run.stats().maxHp;
    if (dev?.get('rich') === '1') for (const id of ['copperOre', 'driftwood', 'coralShard', 'kelp', 'scrap', 'seashell', 'ironOre', 'pearl']) for (let k = 0; k < 4; k++) packAdd(this.run, id);
    if (!dev) { META.runs++; saveMeta(); }
    this.startFloor(this.floorIdx, true);
  }

  private restore(s: DungeonSave) {
    this.cfg = { ...s.cfg, loadout: [...s.cfg.loadout] };
    this.seed = s.seed;
    this.run.seed = s.seed; this.run.rng = new Rng(s.seed);
    this.world.rng = new Rng((s.seed ^ 0xd00d ^ s.roomId * 977) >>> 0);
    this.run.items = s.items.filter((i) => ITEMS[i.id]).map((i) => ({ ...i }));
    this.run.nextUid = s.nextUid;
    this.run.coins = s.pearls; this.keys = s.keys; this.bombs = s.bombs;
    this.floors = [...s.floors]; this.floorIdx = s.floorIdx; this.floor = s.floor;
    this.tally = { ...s.tally }; this.mailed = [...s.mailed];
    this.scal = masteryScalars(this.cfg.mastery);
    this.installStats();
    this.run.hp = s.hp;
    this.applyLook();
    this.enterRoom(s.roomId, null);
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, s.hp));
  }

  /** the pack's item system + hideout station perks + the dungeon's rules (no pressure weakness in rooms) */
  private installStats() {
    installItemSystem(this.run);
    const inner = this.run.statFn!;
    const P = this.perks;
    this.run.statFn = (base, r) => {
      const s = inner(base, r);
      if (P.has('bunk')) s.maxHp += 1;
      if (P.has('fridge')) s.biteHeal += 1;
      if (P.has('weaponRack')) s.swordDmg += 0.25;
      if (P.has('dummy')) s.swordDmg *= 1.05;
      s.pressureResist = 1;
      return s;
    };
  }
  private applyStats() {
    const p = this.player, st = this.run.stats();
    const hp = p.hp;
    p.setStats(st);
    p.skillLv = skillLevels(this.run);
    p.abilityLv = abilityLevels(this.run);
    p.hp = Math.min(hp, p.maxHp);
    this.world.magnet = st.magnet;
  }

  // ================================================================ floors
  private startFloor(i: number, first = false) {
    this.floorIdx = i;
    const area = this.floors[i];
    const seed = (this.seed ^ Math.imul(i + 1, 0x2c1b3c6d)) >>> 0;
    this.floor = genFloor({ n: i, area, seed, rooms: 10 + Math.min(4, i + Math.floor(this.cfg.mastery / 3)) });
    if (this.dev?.get('reveal') === '1') for (const r of this.floor.rooms) r.seen = true;
    for (const r of this.cache.values()) r.dispose();
    this.cache.clear();
    this.applyLook();
    // a fresh floor: the flasks refill, a breather heal
    (this.player as unknown as { combat?: { refill?: () => void } }).combat?.refill?.();
    if (!first) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
    let start = this.floor.start, from: Dir | null = null;
    const want = this.dev?.get('room');
    if (want && first) {
      const tgt = this.floor.rooms.find((r) => r.type === want);
      if (tgt) {
        start = tgt.id;
        const d = (Object.keys(tgt.doors) as Dir[]).find((k) => !tgt.cracked[k]);
        from = d ?? null;
        if (tgt.type === 'treasure' || tgt.type === 'secret') for (const r of this.floor.rooms) for (const k of DIRS) if (r.doors[k] === tgt.id) r.opened[k] = true;
      }
    }
    this.enterRoom(start, from);
    this.after(0.6, () => this.title3d(AREA_NAME(area).toUpperCase(), `FLOOR ${i + 1} OF ${this.floors.length}`, T3D.title, 3.6));
    this.world.emit('enterNode', { type: 'floor', n: i });
    audio.play('jin_biome', { vol: 0.5 });
  }

  private applyLook() {
    const area = this.floors[this.floorIdx];
    const def = AREA_LIST.find((a) => a.id === area);
    void def;
  }

  // ================================================================ rooms
  private teardownRoom(all = false) {
    const r = this.room;
    for (const d of Object.values(this.doors)) d?.dispose();
    this.doors = {};
    for (const p of this.props) p.dispose();
    this.props = [];
    this.pedestal = null; this.shop = null; this.chest = null; this.hatch = null; this.post = null;
    this.boss = null; this.bossDeadT = -1; this.bossDone = false;
    this.pending = [];
    this.t3d.clear();
    this.dmgAcc.clear();
    if (!r) return;
    // remember the pickups left lying here
    const node = this.floor.rooms[this.roomId];
    if (node) {
      const floorLoot: NonNullable<NonNullable<RoomNode['loot']>['floor']> = [];
      for (const e of this.world.entities) if (e instanceof Pickup && e.alive) floorLoot.push({ kind: e.pk, id: e.id, x: e.x, y: e.y, n: e.pk === 'item' ? e.n : e.value, level: e.level });
      node.loot = { ...(node.loot ?? {}), floor: floorLoot };
    }
    this.world.clearRoom();
    r.unbind(this.world);
    if (all) { r.dispose(); this.room = null; return; }
    // keep the room built: going back is instant (two rooms cached)
    this.cache.set(this.roomId, r);
    while (this.cache.size > 2) { const [k, v] = this.cache.entries().next().value as [number, RoomBuild]; v.dispose(); this.cache.delete(k); }
    this.room = null;
  }

  private enterRoom(id: number, from: Dir | null) {
    this.teardownRoom();
    const node = this.floor.rooms[id];
    this.roomId = id;
    const first = !node.visited;
    reveal(this.floor, id);
    // ---- build (or reuse) the room
    let r = this.cache.get(id);
    if (r) this.cache.delete(id);
    else {
      r = new RoomBuild(this.world, this.floor, node, {
        light: this.game.lowQuality || node.type === 'boss' ? false : false,
        prefinish: node.type === 'post' ? (scen, room) => { this.post = new PostOffice(scen, this.world, 1, room.sand.heightAt(1)); } : undefined,
      });
      if (r.buildMs > 60) console.info(`[dungeon] built room ${id} (${node.type}) in ${r.buildMs.toFixed(0)} ms`);
    }
    if (node.type === 'post' && !this.post) {
      // a cached post office room: rebuild the manatee is not possible after finish(); rebuild the room
      r.dispose();
      r = new RoomBuild(this.world, this.floor, node, { prefinish: (scen, room) => { this.post = new PostOffice(scen, this.world, 1, room.sand.heightAt(1)); } });
    }
    this.room = r;
    r.bind(this.world);
    r.setLighting(this.light);
    this.light.applyLook(r.look);
    this.fx.ambient(r.a.id);
    this.water.sim.setSwell(r.a.swell);
    POST.uExposure.value = r.look.exposure * (1 - this.scal.darkness);
    setArena(this.world, r.arena);
    audio.music(node.type === 'boss' && !node.cleared ? 'mu_volcano' : r.a.music);
    if (!this.ambience) this.ambience = audio.loop(r.a.ambience, 0.35);
    // ---- doors
    for (const d of DIRS) {
      if (node.doors[d] === undefined) continue;
      const nb = this.floor.rooms[node.doors[d]!];
      let kind: GateKind = 'normal';
      if (node.cracked[d] && !node.opened[d]) kind = 'secret';
      else if (nb.type === 'treasure' && !node.opened[d] && node.type !== 'treasure') kind = 'locked';
      else if (nb.type === 'boss' || node.type === 'boss') kind = 'boss';
      else if (nb.type === 'challenge' || node.type === 'challenge') kind = 'challenge';
      const door = new Door(this.world, r, d, kind);
      this.doors[d] = door;
      const gap = r.terrain.doors[d];
      gap.exists = kind !== 'secret';
      gap.shut = () => door.shut;
    }
    // ---- the player arrives
    const p = this.player;
    const spot = this.entrySpot(from);
    p.sb.place(spot.x, spot.y); p.x = spot.x; p.y = spot.y;
    if (spot.vx || spot.vy) p.sb.accel(spot.vx / 0.016, spot.vy / 0.016, 0.016);
    if (p.obj.parent !== this.scene) this.scene.add(p.obj);
    this.applyStats();
    // ---- contents
    this.fight = 'calm';
    this.buildContents(node, first);
    const fights = !node.cleared && (node.type === 'combat' || node.type === 'challenge' || node.type === 'boss');
    for (const [d, door] of Object.entries(this.doors) as [Dir, Door][]) {
      if (door.cracked || door.locked) continue;
      if (fights) { if (d === from) door.open(true); else door.close(true); }
      else door.open(true);
    }
    if (fights) this.arm(node);
    // ---- restore what was left lying here
    for (const it of node.loot?.floor ?? []) {
      if (it.kind === 'item' && it.id && ITEMS[it.id]) this.world.spawnPickup('item', it.x, it.y, { id: it.id, level: it.level, n: it.n, vx: 0, vy: 0, hold: 0.6 });
      else if (it.kind !== 'item') this.world.spawnPickup(it.kind as 'pearl', it.x, it.y, { value: it.n, vx: 0, vy: 0 });
    }
    if (node.loot) node.loot.floor = [];
    // ---- camera snap
    const look = this.camTarget();
    this.camLook.copy(look);
    this.world.emit('roomEnter', { type: node.type, id });
    if (first && node.type === 'start' && this.floorIdx === 0 && META.runs <= 2) this.after(2.2, () => this.text.pop('Swim through a door. Clear rooms, grab loot, find the boss.', p.x + 2, p.y + 1.8, 'hint', { size: 0.3, life: 5 }));
    this.save();
  }

  private entrySpot(from: Dir | null): { x: number; y: number; vx: number; vy: number } {
    const r = this.room!, F = r.F;
    switch (from) {
      case 'L': return { x: -HALF_W + ENTRY_GAP, y: F + 1.6, vx: 4, vy: 0 };
      case 'R': return { x: HALF_W - ENTRY_GAP, y: F + 1.6, vx: -4, vy: 0 };
      case 'U': return { x: 0, y: F + ROOM_H - 1.4, vx: 0, vy: -3 };
      case 'D': return { x: 0, y: F + 1.2, vx: 0, vy: 4 };
      default: return { x: r.node.type === 'boss' ? -8 : -3, y: F + 2.5, vx: 0, vy: 0 };
    }
  }

  private buildContents(node: RoomNode, first: boolean) {
    const r = this.room!, w = this.world, rng = new Rng((node.seed ^ 0xc0ffee) >>> 0);
    const luck = this.run.stats().luck;
    const fl = (x: number) => r.sand.heightAt(x);
    node.loot ??= {};
    const L = node.loot;
    const centreX = node.doors.D !== undefined ? -4.5 : 0;
    switch (node.type) {
      case 'treasure': {
        if (L.pedestal === undefined) L.pedestal = rollGear(rng, luck, 'treasure');
        this.addPedestal(centreX, L.pedestalTaken ? null : L.pedestal);
        break;
      }
      case 'secret': {
        if (L.pedestal === undefined) L.pedestal = rng.chance(0.55) ? rollGear(rng, luck + 1, 'treasure') : '';
        if (L.pedestal) this.addPedestal(centreX, L.pedestalTaken ? null : L.pedestal);
        if (first) for (let i = 0; i < 6; i++) w.spawnPickup('pearl', centreX + 2.5 + (i % 3) * 0.6, r.F + 1.5, { value: i === 0 ? 5 : 1, vx: (rng.next() - 0.5) * 2 });
        break;
      }
      case 'shop': {
        L.shop ??= rollShop(rng, luck, this.floorIdx);
        const shop = this.shop = new ShopStock(w, this.t3d, L.shop, fl, r.a.id);
        r.group.add(shop.group);
        shop.setLighting(this.light);
        this.props.push({ update: (dt: number) => shop.update(dt), dispose: () => shop.dispose(), group: shop.group });
        if (first) this.after(0.8, () => this.dlg.bark('crab', rng.pick(["Pearls on the counter, kid. Let's see 'em.", 'Mind the merchandise. Breaks? Buys.', "Back again? Swim slow, I'm old."]), 3.2));
        break;
      }
      case 'post': {
        const po = this.post;
        if (po) {
          r.group.add(po.group);
          this.props.push({ update: (dt: number) => po.update(dt, r.top), dispose: () => po.dispose(), group: po.group });
          if (first) this.after(1, () => this.dlg.bark('manatee', 'Parcels home? Pop them in my bag, dear.', 3));
        }
        break;
      }
      case 'boss': {
        if (node.cleared) this.bossRewards(node, false);
        break;
      }
      case 'challenge': {
        if (node.cleared) this.addChest(L.chest?.open ?? false);
        break;
      }
    }
  }

  private addPedestal(x: number, id: string | null) {
    const r = this.room!;
    const p = this.pedestal = new Pedestal(r.a.id, x, r.sand.heightAt(x), id);
    r.group.add(p.group);
    this.props.push({ update: (dt: number) => p.update(dt, this.world), dispose: () => p.dispose(), group: p.group });
  }
  private addChest(opened: boolean) {
    const r = this.room!;
    const c = this.chest = new ChestProp(2, r.sand.heightAt(2), opened);
    r.group.add(c.group);
    this.props.push({ update: (dt: number) => c.update(dt), dispose: () => c.dispose(), group: c.group });
  }

  // ================================================================ fights
  private difficulty(node: RoomNode) { return this.floorIdx * 0.25 + this.cfg.mastery * 0.08 + Math.min(0.2, node.depth * 0.03); }

  /** lock the doors and queue the room's enemies */
  private arm(node: RoomNode) {
    const r = this.room!, rng = new Rng((node.seed ^ 0xe7e7) >>> 0);
    this.fight = 'arming';
    this.clearT = 0;
    // the gate behind the player slams shut a beat after they're in
    this.after(0.45, () => { for (const d of Object.values(this.doors)) d?.close(); });
    if (node.type === 'boss') {
      this.after(1.2, () => {
        if (this.room !== r) return;
        const b = this.boss = spawnBoss(this.world, this.floors[this.floorIdx], r.arena);
        if (b.hp !== undefined) { b.hp *= this.scal.enemyHp; if (b.maxHp) b.maxHp *= this.scal.enemyHp; }
        b.onDefeated = () => this.bossDown();
        this.fight = 'boss';
        const info = b.bar?.();
        this.title3d(info?.name ?? 'THE BOSS', info?.title ?? '', T3D.danger, 3.2, { x: 0, y: r.F + 8.5 });
        audio.play('boss_growl', { vol: 0.7 }); audio.play('roar1', { vol: 0.4 });
        this.game.addShake(0.4);
      });
      return;
    }
    const dif = this.difficulty(node) + (node.type === 'challenge' ? 0.35 : 0);
    const kinds = ENEMIES_FOR(this.floors[this.floorIdx], dif);
    const [lo, hi] = roomBudget(dif);
    let n = rng.int(lo, hi) + this.scal.extraPerWave;
    const list: { kind: EnemyKind; elite: boolean }[] = [];
    if (node.type === 'challenge') {
      const big: EnemyKind = kinds.includes('heavy') ? 'heavy' : kinds.includes('moray') ? 'moray' : kinds[0];
      list.push({ kind: big, elite: true });
      n = 2 + this.scal.extraPerWave;
    }
    for (let i = 0; i < n; i++) list.push({ kind: rng.pick(kinds), elite: rng.chance(0.06 + this.floorIdx * 0.05) });
    const p = this.player;
    list.forEach((e, i) => {
      const pos = this.spawnPoint(rng, e.kind, p.x);
      this.pending.push({ t: 0.7 + i * 0.12, kind: e.kind, x: pos.x, y: pos.y, elite: e.elite });
      // a swirl of silt where each one will appear
      this.after(0.25 + i * 0.12, () => { if (this.room === r) this.world.fx.emit('ink', pos.x, pos.y, { n: 10, spread: 0.6, speed: 0.6, life: 1.4, size: 0.5, size1: 1.3, color: new THREE.Color(r.a.pal.silt), alpha: 0.55, drag: 2 }); });
    });
  }

  private spawnPoint(rng: Rng, kind: EnemyKind, px: number): { x: number; y: number } {
    const r = this.room!, F = r.F, T = r.terrain;
    const floorKind = kind === 'crab' || kind === 'moray' || kind === 'heavy';
    for (let k = 0; k < 30; k++) {
      const x = rng.range(-HALF_W + 2.5, HALF_W - 2.5);
      if (Math.abs(x - px) < 5.5) continue;
      const y = floorKind ? T.floorAt(x) + 0.7 : rng.range(F + 2.2, F + ROOM_H - 2.2);
      if (T.sdf(x, y) < 1.0) continue;
      return { x, y };
    }
    return { x: px > 0 ? -7 : 7, y: F + 4 };
  }

  private updateFight(dt: number) {
    const node = this.floor.rooms[this.roomId];
    // queued spawns
    for (const s of this.pending) s.t -= dt;
    const due = this.pending.filter((s) => s.t <= 0);
    this.pending = this.pending.filter((s) => s.t > 0);
    for (const s of due) {
      const e = spawnEnemy(this.world, s.kind, s.x, s.y, { elite: s.elite, difficulty: this.difficulty(node), arena: this.room!.arena });
      if (e.hp !== undefined) { e.hp *= this.scal.enemyHp; if (e.maxHp) e.maxHp *= this.scal.enemyHp; }
      this.world.fx.emit('bubbleBig', s.x, s.y, { n: 8, spread: 0.5, speed: 1.6 });
      this.world.sfx('gloop1', s.x, 0.4);
      if (this.fight === 'arming') this.fight = 'fight';
    }
    if (this.fight === 'fight') {
      const alive = this.liveEnemies(dt);
      if (alive === 0 && !this.pending.length) { this.clearT += dt; if (this.clearT > 0.6) this.roomCleared(); } else this.clearT = 0;
    }
    if (this.fight === 'boss' && this.boss) {
      const b = this.boss;
      if (!this.bossDone && (b.hp ?? 1) <= 0) { if (this.bossDeadT < 0) this.bossDeadT = 0; this.bossDeadT += dt; if (this.bossDeadT > 2.5) this.bossDown(); }
      if (!this.bossDone && !b.alive) this.bossDown();
    }
  }

  /** living enemies (and the stuck-escapee safety: a diver pinned to the ceiling trying to surface counts as gone) */
  private liveEnemies(dt: number): number {
    const top = this.room!.top;
    let n = 0;
    for (const e of this.world.entities) {
      if (!e.alive || e.team !== 'enemy') continue;
      const st = (e as unknown as { state?: string }).state;
      if (st === 'retreat' || st === 'breathe') {
        const t = (this.stuck.get(e) ?? 0) + (e.y > top - 2 ? dt : 0);
        this.stuck.set(e, t);
        if (t > 3) { e.alive = false; this.world.fx.burst('bubble', e.x, e.y, 14, 2); this.world.emit('escaped', { kind: e.kind, x: e.x, y: e.y }); continue; }
      }
      n++;
    }
    return n;
  }

  private roomCleared() {
    const node = this.floor.rooms[this.roomId];
    if (node.cleared) return;
    node.cleared = true;
    this.fight = 'calm';
    this.tally.rooms++; this.tally.waves++;
    for (const d of Object.values(this.doors)) d?.open();
    audio.play('jin_good', { vol: 0.45 });
    this.hud.banner('ROOM CLEARED', '', '#fff6c8', 1.8);
    this.world.emit('roomCleared', { type: node.type, id: node.id });
    const r = this.room!, rng = this.world.rng;
    if (node.type === 'challenge') {
      this.addChest(false);
      node.loot ??= {};
      node.loot.chest = { open: false, items: [rollGear(rng, this.run.stats().luck + 1, 'treasure'), rollGear(rng, this.run.stats().luck, 'room')] };
    } else if (node.type === 'combat') {
      const rewards = rollClearReward(rng, r.a.id, this.run.stats().luck, this.scal.lootBonus);
      this.spawnRewards(rewards, 0, r.F + 3);
    }
    this.save();
  }

  private spawnRewards(rewards: Reward[], x: number, y: number) {
    rewards.forEach((rw, i) => {
      const xx = x + (i - (rewards.length - 1) / 2) * 0.7;
      if (rw.kind === 'item') this.world.spawnPickup('item', xx, y, { id: rw.id, vy: 3 });
      else if (rw.kind === 'pearl' || rw.kind === 'heart') this.world.spawnPickup(rw.kind, xx, y, { value: rw.value, vy: 3 });
      else this.world.spawnPickup(rw.kind, xx, y, { vy: 3 });
    });
    if (rewards.length) { this.world.fx.emit('glow', x, y, { n: 2, size: 2, life: 0.5, color: '#ffe8a0' }); this.world.sfx('pickup_sparkle1', x, 0.4); }
  }

  private bossDown() {
    if (this.bossDone) return;
    this.bossDone = true;
    const node = this.floor.rooms[this.roomId], b = this.boss;
    this.tally.bosses++;
    if (b) this.world.emit('bossDefeated', { id: b.bossId, floor: this.floorIdx, byDungeon: true });
    this.roomCleared();
    this.title3d('VICTORY', this.floorIdx >= this.floors.length - 1 ? 'THE SEA IS YOURS' : 'THE WAY DOWN IS OPEN', T3D.gold, 3.5, { x: 0, y: this.room!.F + 8 });
    audio.music(this.room!.a.music, 2);
    audio.play('jin_legend', { vol: 0.6 });
    this.bossRewards(node, true);
  }

  private bossRewards(node: RoomNode, fresh: boolean) {
    const r = this.room!;
    node.loot ??= {};
    if (node.loot.pedestal === undefined) node.loot.pedestal = rollGear(this.world.rng, this.run.stats().luck, 'boss');
    this.addPedestal(-4, node.loot.pedestalTaken ? null : node.loot.pedestal);
    const h = this.hatch = new ExitHatch(this.world, 4.5, r.sand.heightAt(4.5));
    r.group.add(h.group);
    this.props.push({ update: (dt: number) => h.update(dt), dispose: () => h.dispose(), group: h.group });
    if (fresh) this.after(1.6, () => h.activate()); else h.activate();
    if (fresh) this.spawnRewards([{ kind: 'heart', value: 2 }, { kind: 'pearl', value: 5 }], 0, r.F + 4);
  }

  // ================================================================ pickups -> counters / the pack
  private collect(p: Pickup): boolean {
    const w = this.world, pl = this.player;
    switch (p.pk) {
      case 'pearl':
        this.run.coins += p.value; this.tally.pearls += p.value;
        this.hud.flash('pearls');
        w.sfx(p.value > 1 ? 'coins_pile1' : 'coin_a', p.x, 0.5, 1.1 + Math.random() * 0.2);
        this.text.pop(`+${p.value}`, p.x, p.y + 0.5, 'gold', { size: 0.3, life: 0.9 });
        return true;
      case 'heart':
        if (pl.hp >= pl.maxHp) return false;
        pl.heal(p.value, w);
        this.hud.flash('hp');
        return true;
      case 'key': this.keys++; this.hud.flash('keys'); w.sfx('hook_clink1', p.x, 0.6, 1.3); w.sfx('k_confirm2', p.x, 0.3); return true;
      case 'bomb': this.bombs++; this.hud.flash('bombs'); w.sfx('inflate1', p.x, 0.4, 1.4); return true;
      default: {
        const res = packAdd(this.run, p.id!, p.level, p.n);
        if (!res) { this.packFull(p.id!, p.x, p.y); return false; }
        if (res.left > 0) { p.n = res.left; this.packFull(p.id!, p.x, p.y); }
        const d = getItem(p.id!);
        this.text.pop(d.name, p.x, p.y + 0.6, 'item', { size: 0.32, life: 1.4, vy: 0.5 });
        w.sfx('pickup_sparkle1', p.x, 0.5); w.sfx('jin_catch', p.x, 0.3);
        w.emit('itemPicked', { id: p.id });
        this.hud.flash('pack');
        this.installStats(); this.applyStats();
        return res.left <= 0;
      }
    }
  }
  private packFull(id: string, x: number, y: number) {
    if (this.fullPopT > 0) return;
    this.fullPopT = 1.6;
    this.text.pop('PACK FULL', x, y + 0.7, 'danger', { size: 0.3, life: 1.2 });
    this.world.sfx('k_err1', x, 0.4);
    this.hud.flash('pack');
    this.world.emit('packFull', { id });
  }

  // ================================================================ interactions
  private interact(): DungeonHudState['prompt'] {
    const p = this.player, inp = this.game.input, w = this.world, r = this.room!;
    if (!p.alive || this.phase !== 'play') return null;
    const E = inp.hit('interact');
    // a locked door: touch it with a key
    for (const [d, door] of Object.entries(this.doors) as [Dir, Door][]) {
      if (!door.locked) continue;
      const near = (d === 'L' || d === 'R') ? Math.abs(p.x - (d === 'L' ? -HALF_W : HALF_W)) < 1.8 && p.y < r.F + DOOR_Y1 + 0.6 : Math.abs(p.x) < SHAFT_HW + 0.5 && Math.abs(p.y - (d === 'U' ? r.top : r.F)) < 1.8;
      if (!near) continue;
      if (this.keys > 0) {
        if (E || this.fight === 'calm') { this.keys--; this.hud.flash('keys'); door.unlock(); this.markOpened(d); this.save(); }
        return { key: 'E', label: 'UNLOCK', at: this.anchor(p.x, p.y + 0.6) };
      }
      return { key: '', label: 'LOCKED: NEEDS A KEY', at: this.anchor(p.x, p.y + 0.6), bad: true };
    }
    // the pedestal
    const ped = this.pedestal;
    if (ped?.id && Math.abs(p.x - ped.x) < 1.1 && Math.abs(p.y - ped.itemY) < 1.3) {
      if (packFits(this.run, ped.id)) {
        const id = ped.id;
        packAdd(this.run, id);
        ped.setItem(null);
        const node = this.floor.rooms[this.roomId]; if (node.loot) node.loot.pedestalTaken = true;
        const d = getItem(id);
        this.hud.banner(d.name.toUpperCase(), d.desc, '#ffffff', 3.2);
        w.fx.burst('star', ped.x, ped.itemY, 18, 2.6, { color: '#fff2b0' });
        audio.play('treasure1', { vol: 0.6 }); audio.play('jin_rare1', { vol: 0.4 });
        w.emit('itemPicked', { id, pedestal: true });
        this.installStats(); this.applyStats();
        this.save();
      } else { this.packFull(ped.id, ped.x, ped.itemY); return { key: 'TAB', label: 'PACK FULL: MAKE ROOM', at: this.anchor(ped.x, ped.itemY + 0.5), bad: true }; }
    }
    // the chest
    const ch = this.chest, node = this.floor.rooms[this.roomId];
    if (ch && !ch.open && Math.abs(p.x - ch.x) < 1.6 && p.y < ch.y + 2.2) {
      if (E || true) {
        ch.open = true;
        if (node.loot?.chest) node.loot.chest.open = true;
        audio.play('chest_creak', { vol: 0.7 }); audio.play('treasure1', { vol: 0.5 });
        const items = node.loot?.chest?.items ?? [];
        this.after(0.5, () => this.spawnRewards([...items.map((id) => ({ kind: 'item' as const, id })), { kind: 'pearl', value: 5 }], ch.x, ch.y + 1));
        this.save();
      }
    }
    // the shop
    if (this.shop) {
      let best: ShopStand | null = null;
      for (const st of this.shop.stands) if (!st.slot.sold && Math.abs(p.x - st.x) < 1.2 && p.y < st.y + 2.6) best = st;
      if (best) {
        const price = best.slot.price, can = this.run.coins >= price;
        const label = `${this.shop.label(best).toUpperCase()} · ${price} PEARLS`;
        if (E) this.buy(best);
        return { key: 'E', label: can ? `BUY ${label}` : label, at: this.anchor(best.x, best.y + 2.2), bad: !can };
      }
    }
    // the post office
    if (this.post && Math.hypot(p.x - this.post.at.x, p.y - this.post.at.y) < 4) {
      if (E) this.openMail();
      return { key: 'E', label: 'MAIL ITEMS HOME', at: this.anchor(this.post.at.x, this.post.at.y + 1.4) };
    }
    // the hatch down
    if (this.hatch?.active && Math.abs(p.x - this.hatch.x) < 1.6 && p.y < this.hatch.y + 2.2) {
      if (E || p.y < this.hatch.y + 0.9) this.descend();
      return { key: 'E', label: this.floorIdx >= this.floors.length - 1 ? 'SWIM HOME' : 'DIVE DEEPER', at: this.anchor(this.hatch.x, this.hatch.y + 2) };
    }
    // a refused pickup nearby (pack full / health full)
    for (const e of w.entities) if (e instanceof Pickup && e.refused > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 2) {
      if (e.pk === 'item') return { key: 'TAB', label: 'PACK FULL: MAKE ROOM', at: this.anchor(e.x, e.y + 0.6), bad: true };
      if (e.pk === 'heart') return { key: '', label: 'HEALTH FULL', at: this.anchor(e.x, e.y + 0.6) };
    }
    return null;
  }

  private markOpened(d: Dir) {
    const node = this.floor.rooms[this.roomId];
    node.opened[d] = true;
    const nb = node.doors[d];
    if (nb !== undefined) this.floor.rooms[nb].opened[OPP[d]] = true;
  }

  private buy(st: ShopStand) {
    const s = st.slot, w = this.world;
    if (this.run.coins < s.price) { this.dlg.bark('crab', "Pearls first, kid. I don't do tabs.", 2.4); w.sfx('k_err1', st.x, 0.4); return; }
    if (s.kind === 'item' && !packFits(this.run, s.id!)) { this.dlg.bark('crab', "Your bag's stuffed. Make room, then we talk.", 2.6); this.packFull(s.id!, st.x, st.y + 1.5); return; }
    this.run.coins -= s.price;
    this.hud.flash('pearls');
    if (s.kind === 'item') { packAdd(this.run, s.id!); this.installStats(); this.applyStats(); w.emit('itemPicked', { id: s.id, bought: true }); }
    else if (s.kind === 'heart') this.player.heal(2, w);
    else if (s.kind === 'key') this.keys++;
    else this.bombs++;
    this.shop!.sell(st);
    audio.play('buy1', { vol: 0.6 }); audio.play('coins_many1', { vol: 0.4 });
    this.dlg.bark('crab', this.world.rng.pick(['Pleasure doing business.', 'Good eye. Better than mine.', "Don't spend it all in one reef.", 'No refunds. Ever.']), 2.4);
    w.emit('buy', { kind: s.kind, id: s.id, price: s.price });
    this.save();
  }

  // ---- post office
  private openMail() {
    if (!this.post) return;
    const items = this.run.items.filter((i) => ITEMS[i.id]);
    this.mail = { items, picked: new Set(), capacity: PostOffice.CAPACITY - this.post.used, used: 0 };
    audio.play('page1', { vol: 0.5, dry: true });
  }
  private mailAction(a: string) {
    const m = this.mail;
    if (!m) return;
    if (a === 'mail:close') { this.mail = null; return; }
    if (a === 'mail:send') { this.sendMail(); return; }
    const uid = Number(a.slice(5));
    if (m.picked.has(uid)) m.picked.delete(uid); else m.picked.add(uid);
    m.used = m.items.filter((i) => m.picked.has(i.uid)).reduce((s, i) => s + getItem(i.id).shape.length, 0);
  }
  private sendMail() {
    const m = this.mail, po = this.post;
    if (!m || !po || !m.picked.size || m.used > m.capacity) return;
    const sent = this.run.items.filter((i) => m.picked.has(i.uid));
    this.run.items = this.run.items.filter((i) => !m.picked.has(i.uid));
    const { materials, gear } = packTotals(sent);
    addMaterials(materials);
    for (const g of gear) stashItem(g.id, g.level);
    META.extractions++; saveMeta();
    po.used += m.used;
    const ids = expandIds(sent);
    this.mailed.push(...ids);
    this.tally.extracted += ids.length;
    po.celebrate();
    audio.play('jin_catch', { vol: 0.5 }); audio.play('bag_zip1', { vol: 0.5 });
    this.dlg.bark('manatee', 'Off they go! Safe and sound at home, dear.', 2.6);
    this.world.emit('extract', { items: ids, counts: materials });
    this.installStats(); this.applyStats();
    this.mail = null;
    this.save();
  }

  // ---- bombs
  private dropBomb() {
    if (this.bombs <= 0) { this.world.sfx('k_err1', this.player.x, 0.3); return; }
    this.bombs--;
    this.hud.flash('bombs');
    const p = this.player;
    this.world.add(new PufferBomb(p.x, p.y - 0.1, p.vx * 0.3, p.vy * 0.3 - 0.5));
    this.world.sfx('inflate1', p.x, 0.5); this.world.sfx('k_tick1', p.x, 0.4);
  }

  // ---- the backpack (Tab): nearby refused items come along to the board; whatever is left there drops out
  private openBag() {
    if (!this.game.get('backpack')) return;
    const p = this.player, w = this.world;
    for (const e of [...w.entities]) {
      if (!(e instanceof Pickup) || e.pk !== 'item' || !e.alive || Math.hypot(e.x - p.x, e.y - p.y) > 3.2) continue;
      if (e.refused <= 0 && packFits(this.run, e.id!)) continue;
      const it = this.run.addItem(e.id!); it.level = e.level; it.n = e.n;
      e.alive = false; e.obj.removeFromParent();
    }
    this.game.openModal('backpack', {
      run: this.run,
      onClose: () => {
        this.game.closeModal();
        let k = 0;
        for (const it of packLoose(this.run)) {
          this.world.spawnPickup('item', p.x + p.facing * (0.9 + k * 0.4), p.y + 0.3, { id: it.id, level: it.level, n: it.n ?? 1, dropped: true, hold: 1, vx: p.facing * 2, vy: 1 });
          k++;
        }
        this.run.items = this.run.items.filter((i) => i.gx >= 0);
        this.installStats(); this.applyStats(); this.save();
      },
    });
  }

  // ================================================================ transitions
  private checkExits() {
    if (this.phase !== 'play' || this.trans) return;
    const p = this.player, r = this.room!, node = this.floor.rooms[this.roomId];
    const open = (d: Dir) => { const dr = this.doors[d]; return !!dr && dr.isOpen && !dr.cracked && !dr.locked && node.doors[d] !== undefined; };
    let dir: Dir | null = null;
    if (p.x < -HALF_W - 0.7 && open('L')) dir = 'L';
    else if (p.x > HALF_W + 0.7 && open('R')) dir = 'R';
    else if (p.y > r.top + 0.8 && open('U')) dir = 'U';
    else if (p.y < r.F - 1.0 && Math.abs(p.x) < SHAFT_HW && open('D')) dir = 'D';
    if (!dir) return;
    this.trans = { dir, t: 0, swapped: false, to: node.doors[dir]! };
    this.phase = 'trans';
    this.game.post.fadeTo?.(1, 0.16, '#02060a');
    this.world.sfx('swish_b', p.x, 0.4, 0.8);
  }

  private updateTrans(dt: number) {
    const tr = this.trans!;
    tr.t += dt;
    const [dx, dy] = tr.dir === 'L' ? [-1, 0] : tr.dir === 'R' ? [1, 0] : tr.dir === 'U' ? [0, 1] : [0, -1];
    if (!tr.swapped) {
      this.camOff.x += dx * dt * 16; this.camOff.y += dy * dt * 10;
      if (tr.t >= 0.18) {
        tr.swapped = true;
        this.enterRoom(tr.to, OPP[tr.dir]);
        this.camOff.set(-dx * 3.5, -dy * 2.5);
        this.game.post.cut?.();
        this.game.post.fadeTo?.(0, 0.24, '#02060a');
      }
    } else if (tr.t > 0.45) { this.trans = null; this.phase = 'play'; }
  }

  private descend() {
    if (this.phase !== 'play') return;
    this.phase = 'descend';
    this.world.god = true;
    this.game.post.fadeTo?.(1, 0.9, '#000000');
    audio.play('flood_rush1', { vol: 0.6 });
    const n = this.floorIdx;
    this.world.emit('floorCleared', { n, area: this.floors[n] });
    this.tally.floors++;
    this.after(1.0, () => {
      if (n >= this.floors.length - 1) { this.victory(); return; }
      this.teardownRoom(true);
      this.startFloor(n + 1);
      this.world.god = this.god;
      this.phase = 'play';
      this.game.post.cut?.();
      this.game.post.fadeTo?.(0, 0.9);
      this.save();
    });
  }

  // ================================================================ endings
  private die() {
    if (this.phase === 'dead' || this.ended) return;
    this.phase = 'dead';
    this.deadT = 0;
    this.paused = false; this.mail = null;
    audio.music(null, 2);
    const b = board(this.world), by = b.lastHurt.by;
    if (by && b.time - b.lastHurt.t < 6) this.killer = { name: by.callsign, title: by.nemesisId ? META.nemeses.find((n) => n.id === by.nemesisId)?.title : undefined, nemesis: !!by.nemesisId };
    else if (this.boss && this.fight === 'boss') this.killer = { name: this.boss.bar?.().name ?? 'The boss', title: this.boss.bar?.().title };
    else this.killer = { name: 'The deep', title: AREA_NAME(this.floors[this.floorIdx]) };
  }

  private result(won: boolean, items: string[]): DungeonResult {
    const area = this.floors[this.floorIdx] ?? 'reef';
    return {
      outcome: won ? 'victory' : 'dead', areaName: AREA_NAME(area), areaIdx: this.floorIdx, wave: this.tally.rooms, mastery: this.cfg.mastery,
      items, killer: won ? null : this.killer, tally: { ...this.tally },
      won, floor: this.floorIdx, floors: this.floors.length, kills: this.tally.kills,
      packLost: won ? [] : items, mailed: [...this.mailed], broughtHome: won ? items : [],
    };
  }

  private endLost() {
    if (this.ended) return;
    this.ended = true;
    const lost = expandIds(this.run.items.filter((i) => ITEMS[i.id]));
    this.run.items = [];
    META.deaths++; saveMeta();
    clearDungeonSave();
    this.finish(this.result(false, lost));
  }

  private victory() {
    if (this.ended) return;
    this.ended = true;
    const items = this.run.items.filter((i) => ITEMS[i.id]);
    const home = expandIds(items);
    const { materials, gear } = packTotals(items);
    returnToStash(gear);
    addMaterials(materials);
    META.wins++;
    const before = META.masteryUnlocked;
    META.masteryUnlocked = Math.max(META.masteryUnlocked, Math.min(MAX_MASTERY, this.cfg.mastery + 1));
    saveMeta();
    clearDungeonSave();
    const r = this.result(true, home);
    if (META.masteryUnlocked > before) r.unlocked = META.masteryUnlocked;
    this.finish(r);
  }

  private finish(r: DungeonResult) {
    this.phase = 'done';
    this.game.timeScale = 1;
    if (this.onEnd) { this.onEnd(r); return; }
    const flow = (window as unknown as { flow?: { runEnded?: (r: DungeonResult) => void } }).flow;
    if (flow?.runEnded) { flow.runEnded(r); return; }
    if (this.game.get('hideout')) { this.game.go('hideout', {}); if (this.game.get('result')) this.game.openModal('result', r); }
  }

  private quit() {
    this.save();
    this.paused = false;
    this.ended = true;
    if (this.onQuit) { this.onQuit(); return; }
    const flow = (window as unknown as { flow?: { dungeonQuit?: () => void } }).flow;
    if (flow?.dungeonQuit) { flow.dungeonQuit(); return; }
    if (this.game.get('hideout')) this.game.go('hideout', {});
  }

  /** the run so far (RESUME): written on every room change, clear, purchase and mail */
  save() {
    if (this.ended || this.phase === 'dead' || !this.floor || this.dev) return;
    const s: DungeonSave = {
      v: 3, cfg: this.cfg, seed: this.seed, floors: [...this.floors], floorIdx: this.floorIdx, floor: this.floor, roomId: this.roomId,
      hp: this.player?.hp ?? this.run.hp, items: this.run.items.map((i) => ({ ...i })), nextUid: this.run.nextUid,
      pearls: this.run.coins, keys: this.keys, bombs: this.bombs, tally: { ...this.tally }, mailed: [...this.mailed],
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage full / blocked */ }
  }

  // ================================================================ events
  private wire() {
    const w = this.world;
    w.on('kill', (d) => { if (d.boss) return; this.tally.kills++; this.run.kills++; });
    w.on('hit', (d) => { if (d.crit) this.critPending = true; });
    w.on('explosion', (d) => {
      if (typeof d.x !== 'number' || typeof d.y !== 'number') return;
      for (const [dir, door] of Object.entries(this.doors) as [Dir, Door][]) {
        if (door.blast(d.x, d.y as number, (d.r as number) ?? 2)) {
          this.markOpened(dir);
          this.room!.terrain.doors[dir].exists = true;
          this.hud.banner('A SECRET!', '', '#e0c0ff', 2);
          audio.play('jin_rare2', { vol: 0.5 });
          reveal(this.floor, this.roomId);
          this.save();
        }
      }
    });
    w.on('bossDefeated', (d) => { if (!d.byDungeon && this.boss && d.id === this.boss.bossId) this.after(1.5, () => this.bossDown()); });
  }

  private after(t: number, fn: () => void) { this.seq.push({ t, fn }); }

  private title3d(title: string, sub: string, st: T3DStyle, life = 3, at?: { x: number; y: number }) {
    const x = at?.x ?? this.camLook.x, y = at?.y ?? this.camLook.y + 2.2;
    this.t3d.add(title, x, y, 1.4, st, { size: 0.72, life, enter: 'drop', stagger: 0.05 });
    if (sub) this.t3d.add(sub, x, y - 0.78, 1.4, T3D.sub, { size: 0.24, life: life - 0.2, delay: 0.45, stagger: 0.015 });
  }

  private damageNumbers(dt: number) {
    const w = this.world;
    for (const e of w.entities) {
      if (e.team !== 'enemy' || e.hp === undefined) continue;
      const last = this.hpSeen.get(e);
      if (last !== undefined && e.hp < last - 0.05) this.dmgAcc.set(e, (this.dmgAcc.get(e) ?? 0) + (last - e.hp));
      this.hpSeen.set(e, e.hp);
    }
    this.dmgT -= dt;
    if (this.dmgT > 0 || !this.dmgAcc.size) return;
    this.dmgT = 0.12;
    const crit = this.critPending; this.critPending = false;
    for (const [e, d] of this.dmgAcc) this.t3d.damage(d, e.x, e.y + e.r + 0.45, crit);
    this.dmgAcc.clear();
  }

  // ================================================================ frame
  update(dt: number) {
    const w = this.world, p = this.player, inp = this.game.input, r = this.room;
    if (!w || !r || this.ended) return;
    // ---- pause
    if (inp.hit('pause') && !this.mail && this.phase !== 'dead' && this.phase !== 'descend') { this.paused = !this.paused; audio.play(this.paused ? 'k_open1' : 'k_close1', { vol: 0.5, dry: true }); }
    this.game.cursor = this.paused || this.mail ? 'none' : 'aim';
    if (this.paused) {
      const c = this.hud.draw(dt, this.hudState(null), inp);
      if (c === 'resume') this.paused = false;
      else if (c === 'bag') { this.paused = false; this.openBag(); }
      else if (c === 'quit') this.quit();
      return;
    }
    w.time += dt; this.run.time += dt; this.tally.time += dt;
    this.fullPopT -= dt;
    for (const s of this.seq) s.t -= dt;
    const due = this.seq.filter((s) => s.t <= 0);
    this.seq = this.seq.filter((s) => s.t > 0);
    for (const s of due) s.fn();
    if (this.ended || this.room !== r) { if (this.ended) return; }
    const room = this.room!;
    // ---- the blobfish (frozen in place while the mail picker is up)
    if (this.god) p.hp = p.maxHp;
    if (!this.mail) p.update(dt, w);
    const spd = Math.hypot(p.vx, p.vy);
    this.wakeT -= dt;
    if (p.alive && spd > 1.4 && this.wakeT <= 0) { this.wakeT = 0.07; w.fx.wake(p.x - (p.vx / spd) * p.r, p.y - (p.vy / spd) * p.r, { x: p.vx, y: p.vy }, spd / 5); }
    // ---- entities
    for (let i = 0; i < w.entities.length; i++) { const e = w.entities[i]; if (e.alive) e.update(dt, w); }
    this.damageNumbers(dt);
    for (let i = w.entities.length - 1; i >= 0; i--) {
      const e = w.entities[i];
      if (!e.alive) { e.dispose?.(w); e.obj?.removeFromParent(); w.entities.splice(i, 1); }
    }
    // ---- the room
    room.update(dt, this.camLook.x);
    for (const d of Object.values(this.doors)) d?.update(dt);
    for (const pr of this.props) pr.update(dt);
    w.emit('tick', { dt });
    if (this.fight !== 'calm') this.updateFight(dt);
    // ---- input: bombs, the bag
    if (this.phase === 'play' && p.alive && !this.mail) {
      if (inp.keyHit('KeyG')) this.dropBomb();
      if (inp.hit('bag')) this.openBag();
    }
    const prompt = this.mail ? null : this.interact();
    // ---- transitions
    if (this.phase === 'play') this.checkExits();
    if (this.phase === 'trans' && this.trans) this.updateTrans(dt);
    // ---- camera, water, fx
    this.updateCamera(dt);
    w.water.update(this.game.renderer, dt, this.camLook.x);
    w.fx.update(dt);
    w.text.update(dt);
    this.t3d.update(dt, this.camera);
    audio.listenerX = this.camLook.x;
    audio.setUnderwater(0.55);
    // ---- heartbeat / desat
    const low = p.alive && p.hp <= 2;
    this.heartbeat -= dt;
    if (low && this.heartbeat <= 0) { this.heartbeat = 1.0; audio.play('heartbeat1', { vol: 0.5 }); POST.uPulse.value = 1; }
    POST.uPulse.value *= Math.exp(-dt * 3);
    if (this.phase !== 'dead') POST.uDesat.value = damp(POST.uDesat.value, 0, 3, dt);
    this.run.hp = p.hp;
    // ---- HUD
    this.dlg.update(dt, inp);
    const act = this.hud.draw(dt, this.hudState(prompt), inp);
    if (act?.startsWith('mail:')) this.mailAction(act);
    if (this.mail && inp.keyHit('Escape')) this.mail = null;
    this.hud.ui.begin(null, 0); this.dlg.draw(); this.hud.ui.end();
    this.bar.visible = this.phase === 'play' && !this.mail;
    this.bar.update(dt, p.skillHud());
    // ---- death
    if (this.deadT >= 0) {
      this.deadT += dt;
      POST.uDesat.value = Math.min(1, this.deadT * 0.5);
      if (this.deadT > 3.2) { this.deadT = -1; this.endLost(); }
    }
  }

  private camTarget(): THREE.Vector3 {
    const r = this.room!, p = this.player;
    const halfV = (ROOM_H + 0.8) / 2;
    this.camDist = halfV / Math.tan((this.camera.fov * Math.PI) / 360);
    const halfW = halfV * this.camera.aspect;
    // keep the side walls in frame when there's room, else follow the blobfish along the room
    const span = Math.max(0, HALF_W + 1.4 - halfW);
    const tx = clamp(p.x * 0.6, -span, span);
    const ty = r.F + ROOM_H / 2 + clamp((p.y - (r.F + ROOM_H / 2)) * 0.12, -0.6, 0.6);
    return new THREE.Vector3(tx, ty, 0);
  }

  private updateCamera(dt: number) {
    const t = this.camTarget();
    this.camLook.x = damp(this.camLook.x, t.x, 5, dt);
    this.camLook.y = damp(this.camLook.y, t.y, 5, dt);
    if (!this.trans || this.trans.swapped) { this.camOff.x = damp(this.camOff.x, 0, 9, dt); this.camOff.y = damp(this.camOff.y, 0, 9, dt); }
    const sh = this.game.shakeOffset();
    const cx = this.camLook.x + this.camOff.x, cy = this.camLook.y + this.camOff.y;
    this.camera.position.set(cx + sh.x, cy + 0.9 + sh.y, this.camDist);
    this.camera.lookAt(cx + sh.x * 0.5, cy + sh.y * 0.5, 0);
    this.camera.updateMatrixWorld();
    this.light.follow(cx, cy);
  }

  private anchor(x: number, y: number, z = 0): HudAnchor {
    const v = this.v.set(x, y, z).project(this.camera);
    const ui = this.hud.ui;
    const sx = (v.x * 0.5 + 0.5) * ui.w, sy = (1 - (v.y * 0.5 + 0.5)) * ui.h;
    return { x: sx, y: sy, on: v.z < 1 && sx >= 0 && sx <= ui.w && sy >= 0 && sy <= ui.h };
  }

  /** everything the HUD shows (agent L's HUD can read this every frame: dungeon.hudState()) */
  hudState(prompt: DungeonHudState['prompt'] = null): DungeonHudState {
    const p = this.player, node = this.floor.rooms[this.roomId];
    const combat = (p as unknown as { combat?: { hud?: () => PlayerCombatHud } }).combat?.hud?.() ?? null;
    const cells = packCells(this.run);
    let enemies = this.pending.length;
    for (const e of this.world.entities) if (e.alive && e.team === 'enemy') enemies++;
    return {
      hp: p.hp, maxHp: p.maxHp,
      pearls: this.run.coins, keys: this.keys, bombs: this.bombs,
      combat,
      floor: { n: this.floorIdx, of: this.floors.length, name: AREA_NAME(this.floors[this.floorIdx]), area: this.floors[this.floorIdx] },
      room: { type: node.type, cleared: node.cleared, enemies },
      minimap: minimapData(this.floor, this.roomId, this.dev?.get('reveal') === '1'),
      boss: this.boss && this.fight === 'boss' && !this.bossDone ? this.boss.bar() : null,
      prompt,
      pack: { ...cells, full: cells.free <= 0 },
      paused: this.paused,
      mail: this.mail,
    };
  }
}

void ROOM_FLOOR; void DOOR_Y0; void rollMaterial;
