// The v3 RUN: the Binding-of-Isaac loop (fight -> loot -> gear up -> boss, floors, keys / bombs / pearls, shop,
// treasure, post office, secrets, pack-everything) in a continuous 2D side-scrolling ocean. It replaces
// runScreen.ts's wave defense as the run.
//
//   Floors follow the areas from cfg.startArea down the progression (reef > kelp > graveyard > arctic > abyss);
//   3 floors at mastery 0 (floorsForMastery). Each floor is ONE long level (src/dungeon/level.ts, ~300-400 m):
//   open water with an upper lane over mid-water ledges, the seabed lane, a cave branch under a rock lid (with the
//   CHALLENGE arena) that rejoins, Mr. Crab's shop, the post office buoy, a treasure nook (locked chest / pedestal
//   on a ledge), a secret pit under a cracked lid, and the boss arena behind a skull gate at the far end.
//   Encounters are beat-'em-up arena locks: swim in, gates burst out of the sand on both sides, K's enemies spawn
//   (src/combat), the camera frames the fight; clear it and the gates sink with a reward burst. Roaming groups
//   patrol between arenas. Every item pickup goes into the backpack grid (src/dungeon/pack.ts); pearls, keys,
//   bombs and hearts are counters. Death loses the pack (mailed items are safe); the last boss brings it home.
//
//   DEPTH is the spine: every floor descends ~30-40 m in terraces and ends in an exit shaft past the boss; you swim
//   down it (a down-current, then a dark stretch) straight into the next biome's entry shaft, the counter ticking all
//   the way (real metres = plan.depth0 - y, continuous across floors; UW.uWaterY = depth0 so every shader's light
//   falloff reads real depth). The light is re-graded by the camera's depth (src/dungeon/depth.ts: sunlit ->
//   twilight -> midnight -> hadal), the blobfish's own lantern comes up in the dark, and enemy difficulty, elites,
//   loot luck, pearls and shop prices scale with metres. After the last planned floor's boss: a ROPE to the surface
//   (victory, the pack comes home) or the shaft on into the ENDLESS DEEP (the remaining areas, then the hadal
//   remixes: vents, trench, bone fields, crystal caves) with a rope every second floor. META.records.maxDepth.
//
//   const ds = new DungeonScreen(game); game.register(ds);
//   game.go('dungeon', { cfg })            a new run from a RunConfig (loadout uids come out of the stash)
//   game.go('dungeon', { resume: true })   continue the saved run (loadDungeonSave())
//   game.go('dungeon')                     dev, from the URL: ?preview=dungeon&floor=reef&at=boss|shop|treasure|post|
//                                          secret|challenge|arena&god=1&mastery=0&floorIdx=0&seed=N&rich=1&reveal=1
//                                          &keys=N&bombs=N&pearls=N
//   The run's end goes to (window).flow.runEnded(result) when flow has it, else hideout + the result card.
//
// World events (besides K's and the v2 ones): 'arenaLock' {kind}, 'roomCleared' {type}, 'floorCleared' {n},
// 'bossDefeated' {id} (if the boss didn't), 'extract' {items, counts} (mail), 'itemPicked' {id}, 'packFull' {id},
// 'secretFound' {x}, 'buy' {kind, id, price}.
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
import { ITEMS, installItemSystem, skillLevels, abilityLevels, findSpot, fits, getItem, expandIds } from './items';
import { META, saveMeta, addMaterials, spendMaterials, stashItem, takeFromStash, returnToStash, type RunConfig, type RunResult, type RunTally } from '../meta/meta';
import { AREAS as AREA_LIST, masteryScalars, MAX_MASTERY } from '../hideout/mastery';
import { stationsBuilt } from '../hideout/blueprints';
import { spawnEnemy, ENEMIES_FOR, spawnBoss, setArena, type BossEntity, type EnemyKind, type PlayerCombatHud, type Arena } from '../combat';
import { roomBudget } from '../combat/index';
import { board } from '../waves/board';
import { Dialogue } from '../story/dialogue';
import { genLevel, explore, floorAreas, floorsForMastery, shelfAt, depthOf, depthSpan, AREA_ORDER, ENTRY_TOP, type LevelPlan, type ArenaPlan, type PoiPlan, type GroupPlan } from '../dungeon/level';
import { biomeDef, baseOf, hadalFor, isHadal } from '../dungeon/biomes';
import { depthLook, zoneOf, ZONE_NAME, depthDifficulty, depthElite, depthLuck, depthPearls, playerLight, type Zone } from '../dungeon/depth';
import { UW } from '../gfx/shaders/underwater';
import { meadowLook } from '../world/meadow';
import type { LampHandle } from '../gfx/lighting';
import { LevelBuild } from '../dungeon/levelBuild';
import { DungeonWorld } from '../dungeon/world';
import { Pickup, type PickKind } from '../dungeon/pickups';
import { PufferBomb } from '../dungeon/bomb';
import { packAdd, packCells, packTotals, packLoose, packFits } from '../dungeon/pack';
import { rollClearReward, rollGear, rollShop, rollMaterial, type Reward } from '../dungeon/rewards';
import { stripMap } from '../dungeon/minimap';
import { DungeonHud, type DungeonHudState, type HudAnchor, type MailState, type Prompt, type DepthHud } from '../dungeon/hud';
import { Pedestal, ShopStock, ChestProp, type ShopStand } from '../dungeon/contents';

// ------------------------------------------------------------------ save / resume
export interface DungeonTally extends RunTally { rooms: number; floors: number; pearls: number }
interface FloorLoot { kind: PickKind; id?: string; x: number; y: number; n: number; level: number }
export interface DungeonSave {
  v: 4;
  cfg: RunConfig; seed: number;
  floors: string[]; floorIdx: number; plan: LevelPlan; checkX: number;
  hp: number; items: ItemInst[]; nextUid: number;
  pearls: number; keys: number; bombs: number;
  tally: DungeonTally; mailed: string[]; loot: FloorLoot[];
  /** v2 aliases (achievements and other META readers look at activeRun.areas[activeRun.areaIdx]) */
  areas: string[]; areaIdx: number;
  /** floors planned at the start (past them: the endless deep); the run's deepest metre */
  planned: number; maxDepth: number;
}
/** the run in progress lives in META.activeRun (v 4) like the v2 run's did, so flow's RESUME finds it */
export function loadDungeonSave(): DungeonSave | null {
  const s = META.activeRun as unknown as DungeonSave | null;
  return s && s.v === 4 ? s : null;
}
export const hasDungeonSave = () => !!loadDungeonSave();
export function clearDungeonSave() { if (loadDungeonSave() || META.activeRun) { META.activeRun = null; saveMeta(); } }

/** the run's end, for flow / the result card: RunResult (the v2 card reads it) + the dungeon's own fields */
export interface DungeonResult extends RunResult {
  won: boolean;
  /** the deepest the run went (m) and whether that beat the record */
  maxDepth: number; record: boolean;
  /** the floor reached, 1-based, and the floors in the run ("FLOOR 2/3") */
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

type Phase = 'play' | 'dead' | 'descend' | 'done';
interface Fight { arena: ArenaPlan; pending: { t: number; kind: EnemyKind; x: number; y: number; elite: boolean }[]; ents: Entity[]; clearT: number; boss: BossEntity | null; bossDone: boolean; bossDeadT: number }

const AREA_NAME = (id: string) => (isHadal(id) ? biomeDef(id).name : AREA_LIST.find((a) => a.id === id)?.name ?? biomeDef(id).name);
const FAR = 1e9;

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
  plan!: LevelPlan;
  level: LevelBuild | null = null;
  keys = 1; bombs = 1;
  tally: DungeonTally = { kills: 0, time: 0, waves: 0, extracted: 0, repairs: 0, bosses: 0, rooms: 0, floors: 0, pearls: 0 };
  mailed: string[] = [];
  world!: DungeonWorld;
  player!: Blobfish;
  phase: Phase = 'play';
  fight: Fight | null = null;
  paused = false;
  light = new Lighting();
  /** where a resume / respawn puts the blobfish (the start, then past each cleared arena) */
  checkX = 9;
  private water = new WaterFX();
  private fx = new Particles();
  private text!: Float3D;
  private dlg!: Dialogue;
  private props: { update(dt: number): void; dispose(): void }[] = [];
  private pedestals = new Map<number, Pedestal>();
  private chests = new Map<number, ChestProp>();
  private shop: ShopStock | null = null;
  private shopPoi: PoiPlan | null = null;
  /** floors planned by the table (the run is won by surfacing after the last of them, or any rope below) */
  planned = 3;
  /** depth: the run's deepest metre, this floor's, and the animated counter during a descent */
  maxDepth = 0; floorMax = 0;
  private vdepth: number | null = null;
  private lookT = 0;
  private lamp: LampHandle | null = null;
  private desc: { stage: 'sink' | 'dark' | 'arrive' | 'surface'; t: number; from: number; to: number } | null = null;
  private recordBefore = 0;
  private sky!: THREE.Object3D;
  private groups = new Map<number, Entity[]>();
  private camLook = new THREE.Vector3();
  private camDist = 16.5;
  private lookAhead = 0;
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
  private musicKey = '';
  private hintT = 0;
  private hintText = '';
  /** a line of help at the bottom of the screen for a few seconds */
  hint(text: string, life = 4) { this.hintText = text; this.hintT = life; }
  /** dev: teleport the blobfish (console: dungeon.tp(x, y?)) */
  tp(x: number, y?: number) { const p = this.player, yy = y ?? this.level!.terrain.floorUnder(x, this.plan.top) + 2.5; p.sb.place(x, yy); p.x = x; p.y = yy; this.camLook.copy(this.camTarget(1)); }

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
    this.ended = false; this.paused = false; this.seq = []; this.deadT = -1; this.killer = null; this.mail = null; this.phase = 'play';
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
    this.teardownLevel();
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
    this.player = new Blobfish(0, -6);
    this.run = new Run(1);
    const w = this.world = new DungeonWorld(this.game, this.run, this.scene, this.camera, this.water, this.fx, this.text, new Rng(1), this.player);
    w.god = this.god;
    w.collect = (p) => this.collect(p);
    this.sky = makeSky();
    this.scene.add(this.sky, this.water.group, this.light.group, this.fx.object, this.player.obj, this.t3d.group);
    this.overlay.add(this.text.group);
    this.fx.waterAt = (x) => this.water.heightAt(x);
    this.player.onDeath = () => this.die();
    this.dlg = new Dialogue(this.hud.ui, () => this.camera);
    this.dlg.speaker({ id: 'crab', name: 'MR. CRAB', color: '#e8603a', voice: 'crab_click', pitch: 0.9, anchor: () => this.shop?.head() ?? null });
    this.dlg.speaker({ id: 'manatee', name: 'MAUDE', color: '#8ab8e8', voice: 'whale', pitch: 1.6, vol: 0.25, anchor: () => { const m = this.level?.manatee; return m ? new THREE.Vector3(m.x, m.y + 1.3, m.z) : null; } });
    this.wire();
    this.resize(this.game.w, this.game.h);
  }

  private fresh(cfg: RunConfig) {
    this.cfg = { ...cfg, loadout: [...cfg.loadout] };
    const dev = this.dev;
    this.seed = dev ? Number(dev.get('seed') || 12345) : (Math.random() * 1e9) | 0;
    this.run.seed = this.seed; this.run.rng = new Rng(this.seed);
    this.world.rng = new Rng(this.seed ^ 0xd00d);
    this.packFromConfig(cfg as RunConfig & { pack?: ItemInst[]; mats?: Record<string, number> }, !!dev);
    this.scal = masteryScalars(this.cfg.mastery);
    this.floors = floorAreas(this.cfg.startArea, floorsForMastery(this.cfg.mastery, this.scal as { floors?: number }));
    this.planned = this.floors.length;
    this.maxDepth = 0;
    this.recordBefore = (META as unknown as { records?: { maxDepth?: number } }).records?.maxDepth ?? 0;
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
    this.startFloor(this.floorIdx, null, this.floorIdx === 0 ? 0 : 70 + this.floorIdx * 78);
  }

  /**
   * the starting pack: the planning table's arranged grid (cfg.pack: stash gear keeps its uid, material stacks have
   * negative uids + n; cfg.mats leave META.materials), else the old loadout path (stash uids, auto-placed)
   */
  private packFromConfig(cfg: RunConfig & { pack?: ItemInst[]; mats?: Record<string, number> }, dev: boolean) {
    this.run.items = [];
    if (dev) { this.run.nextUid = 1; return; }
    if (cfg.pack && cfg.pack.length) {
      const gearUids = cfg.pack.filter((i) => i.uid > 0).map((i) => i.uid);
      const taken = new Map(takeFromStash(gearUids).map((i) => [i.uid, i]));
      const mats = cfg.mats ?? {};
      const haveMats = Object.keys(mats).length ? spendMaterials(mats) : true;
      let uid = 1;
      for (const it of taken.values()) uid = Math.max(uid, it.uid + 1);
      for (const it of cfg.pack) {
        if (!ITEMS[it.id]) continue;
        let inst: ItemInst;
        if (it.uid > 0) { const st = taken.get(it.uid); if (!st) continue; inst = { ...st, gx: it.gx, gy: it.gy, rot: it.rot ?? 0 }; }
        else { if (!haveMats) continue; inst = { uid: uid++, id: it.id, gx: it.gx, gy: it.gy, rot: it.rot ?? 0, level: 1, n: Math.max(1, it.n ?? 1) }; }
        this.run.items.push(inst);
      }
      // anything that no longer fits where it was arranged finds a spot (or rides on the board)
      const ok: ItemInst[] = [];
      for (const inst of this.run.items) {
        if (inst.gx < 0 || !fits(ok, inst, inst.gx, inst.gy, inst.rot)) {
          const sp = findSpot(ok, inst); if (sp) { inst.gx = sp.gx; inst.gy = sp.gy; inst.rot = sp.rot; } else { inst.gx = -1; inst.gy = -1; }
        }
        if (inst.gx >= 0) ok.push(inst);
      }
      this.run.nextUid = Math.max(uid, ...this.run.items.map((i) => i.uid + 1));
      return;
    }
    // the old path: the loadout leaves the stash and goes into the pack
    const items = takeFromStash(cfg.loadout);
    let uid = 1;
    for (const it of items) uid = Math.max(uid, it.uid + 1);
    this.run.nextUid = uid;
    for (const it of items) {
      const inst: ItemInst = { ...it, gx: -1, gy: -1, rot: it.rot ?? 0 };
      const spot = findSpot(this.run.items, inst);
      if (spot) { inst.gx = spot.gx; inst.gy = spot.gy; inst.rot = spot.rot; }
      this.run.items.push(inst);
    }
  }

  private restore(s: DungeonSave) {
    this.cfg = { ...s.cfg, loadout: [...s.cfg.loadout] };
    this.seed = s.seed;
    this.run.seed = s.seed; this.run.rng = new Rng(s.seed);
    this.world.rng = new Rng((s.seed ^ 0xd00d ^ Math.round(s.checkX) * 977) >>> 0);
    this.run.items = s.items.filter((i) => ITEMS[i.id]).map((i) => ({ ...i }));
    this.run.nextUid = s.nextUid;
    this.run.coins = s.pearls; this.keys = s.keys; this.bombs = s.bombs;
    this.floors = [...s.floors];
    this.planned = s.planned ?? s.floors.length; this.maxDepth = s.maxDepth ?? 0;
    this.recordBefore = (META as unknown as { records?: { maxDepth?: number } }).records?.maxDepth ?? 0;
    this.tally = { ...s.tally }; this.mailed = [...s.mailed];
    this.scal = masteryScalars(this.cfg.mastery);
    this.installStats();
    this.run.hp = s.hp;
    this.startFloor(s.floorIdx, s, s.plan.depth0);
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, s.hp));
  }

  /** the pack's item system + hideout station perks + the dungeon's rules (no surface weakness) */
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
  private teardownLevel() {
    for (const pr of this.props) pr.dispose();
    this.props = [];
    this.pedestals.clear(); this.chests.clear(); this.groups.clear();
    this.shop = null; this.shopPoi = null; this.fight = null;
    this.t3d.clear();
    this.dmgAcc.clear();
    this.world?.clearRoom();
    this.level?.dispose();
    this.level = null;
  }

  /**
   * build floor i and drop the blobfish in. depth0 = the real depth (m) of world y = 0 on this floor (0 on the first;
   * below, chosen so the entry shaft continues the descent from the floor above without a jump in the counter)
   */
  private startFloor(i: number, save: DungeonSave | null, depth0 = 0) {
    this.teardownLevel();
    this.floorIdx = i;
    const area = this.floors[i];
    const seed = (this.seed ^ Math.imul(i + 1, 0x2c1b3c6d)) >>> 0;
    // a rope to the surface hangs past the boss on the last planned floor, then every second floor of the deep
    const rope = i === this.planned - 1 || (i >= this.planned && (i - this.planned) % 2 === 1);
    this.plan = save ? save.plan : genLevel({ n: i, area, seed, mastery: this.cfg.mastery, depth0, rope });
    const plan = this.plan;
    if (this.dev?.get('reveal') === '1') plan.explored.fill(1);
    const lvl = this.level = new LevelBuild(this.world, plan, { light: this.game.lowQuality && this.dev?.get('full') !== '1' });
    console.info(`[dungeon] floor ${i + 1} (${area}) ${plan.W.toFixed(0)} m, ${depthSpan(plan).map((v) => v.toFixed(0)).join('-')} m deep, built in ${lvl.buildMs.toFixed(0)} ms`);
    lvl.bind(this.world);
    // the player's lantern first (a pooled point light), then the level's glow lamps
    this.lamp?.release(); this.lamp = this.light.lamp(0, -999, 0, '#ffd8a0', 0, 8);
    lvl.setLighting(this.light);
    // real depth everywhere: the shaders' light falloff, caustics and water colour read it from the water level
    UW.uWaterY.value = plan.depth0;
    const open = plan.top > -2.9;
    this.water.group.visible = open; this.sky.visible = open;
    this.fx.ambient(baseOf(area));
    this.water.sim.setSwell(lvl.a.swell);
    this.lookT = 0;
    this.setTravelArena();
    this.music(lvl.a.music);
    this.ambience?.stop(); this.ambience = audio.loop(lvl.a.ambience, 0.35);
    for (const a of plan.arenas) if (a.cleared) for (const g of lvl.gates.get(a.id) ?? []) g.drop(true);
    if (plan.arenas.find((q) => q.kind === 'boss')?.cleared) lvl.openExit();
    this.buildPois();
    // the blobfish arrives: dives in from the surface / drops down the entry shaft (or back at the checkpoint)
    let x = save ? save.checkX : plan.startX;
    const at = this.dev?.get('at');
    if (at && !save) x = this.devJump(at);
    this.checkX = x;
    const p = this.player;
    const y = save || at ? lvl.terrain.floorUnder(x, plan.top) + 2.5 : plan.top - 1.2;
    p.sb.place(x, y); p.x = x; p.y = y;
    if (!save && !at) { p.sb.accel(open ? 2 / 0.016 : 0, -6 / 0.016, 0.016); this.world.fx.emit('bubbleBig', x, y + 1, { n: 24, spread: 1, speed: 2.5 }); }
    if (p.obj.parent !== this.scene) this.scene.add(p.obj);
    this.applyStats();
    if (save) for (const it of save.loot) {
      if (it.kind === 'item') { if (it.id && ITEMS[it.id]) this.world.spawnPickup('item', it.x, it.y, { id: it.id, level: it.level, n: it.n, vx: 0, vy: 0 }); }
      else this.world.spawnPickup(it.kind, it.x, it.y, { value: it.n, vx: 0, vy: 0 });
    }
    explore(plan, x, 20);
    this.floorMax = depthOf(plan, y);
    this.camLook.copy(this.camTarget(1));
    this.updateDepth(0, true);
    this.game.post.cut?.();
    if (!save) {
      (this.player as unknown as { combat?: { refill?: () => void } }).combat?.refill?.();
      if (i > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
      this.world.emit('enterNode', { type: 'floor', n: i });
    }
    // the depth title, stamped in 3D: "-92 M · KELP CATHEDRAL"
    const dTop = Math.round(depthOf(plan, plan.base));
    this.after(0.6, () => {
      const deeper = i >= this.planned;
      const tx = this.camLook.x, ty = this.camLook.y + 1.6;
      this.t3d.add(`-${dTop} M · ${AREA_NAME(area).toUpperCase()}`, tx, ty, 2.2, deeper ? T3D.danger : T3D.title, { size: 0.5, life: 4, enter: 'slam', stagger: 0.04, onLand: (k) => { if (k % 4 === 0) audio.play('k_tick1', { vol: 0.25, dry: true }); } });
      this.t3d.add(deeper ? `THE DEEP · ${ZONE_NAME[zoneOf(dTop)]}` : `FLOOR ${i + 1} OF ${this.planned} · ${ZONE_NAME[zoneOf(dTop)]}`, tx, ty - 0.7, 2.2, T3D.sub, { size: 0.2, life: 3.6, delay: 0.7, stagger: 0.012 });
      audio.play('thud_heavy1', { vol: 0.5, dry: true });
      this.game.addShake(0.15);
    });
    audio.play('jin_biome', { vol: 0.5 });
  }

  /** dev: start next to a POI / arena (?at=boss|shop|treasure|post|secret|challenge|arena) */
  private devJump(at: string): number {
    const plan = this.plan;
    if (at === 'arena') { const a = plan.arenas.find((q) => q.kind === 'arena'); return a ? a.x0 - 6 : plan.startX; }
    if (at === 'boss') return plan.bossX0 - 6;
    const p = plan.pois.find((q) => q.kind === at);
    if (!p) return plan.startX;
    if (at === 'challenge') { const a = plan.arenas.find((q) => q.kind === 'challenge'); return a ? a.x0 - 9 : p.x; }
    return p.x - 6;
  }

  /** outside an arena, enemies roam in a box round the player's stretch of the level */
  private setTravelArena(cx?: number) {
    const plan = this.plan, x = cx ?? this.player?.x ?? plan.startX;
    setArena(this.world, { x0: Math.max(0.5, x - 18), x1: Math.min(plan.W - 0.5, x + 18), floor: shelfAt(plan, x) - 9, top: plan.top });
  }

  private music(id: string) { if (this.musicKey === id) return; this.musicKey = id; audio.music(id); }

  private buildPois() {
    const plan = this.plan, lvl = this.level!, w = this.world;
    const luck = this.run.stats().luck + depthLuck(depthOf(plan, plan.base));
    for (const p of plan.pois) {
      const rng = new Rng((plan.seed ^ Math.imul(p.id + 3, 0x9e3779b1)) >>> 0);
      switch (p.kind) {
        case 'shop': {
          p.shop ??= rollShop(rng, luck, this.floorIdx).map((sl) => ({ ...sl, price: sl.price + Math.floor(depthOf(plan, plan.base) / 45) }));
          const shop = this.shop = new ShopStock(w, this.t3d, p.shop, (x) => lvl.terrain.floorAt(x), lvl.a.id, p.x);
          this.shopPoi = p;
          lvl.group.add(shop.group);
          shop.setLighting(this.light);
          this.props.push({ update: (dt) => shop.update(dt), dispose: () => shop.dispose() });
          break;
        }
        case 'treasure': {
          p.items ??= p.style === 'chest' ? [rollGear(rng, luck + 1, 'treasure'), rollMaterial(rng, plan.area)] : [rollGear(rng, luck + 1, 'treasure')];
          const fl = lvl.terrain.floorUnder(p.x, p.y + 1);
          if (p.style === 'chest') this.addChest(p, p.x, fl, true);
          else this.addPedestal(p, p.x, fl, p.taken ? null : p.items[0]);
          break;
        }
        case 'secret': {
          p.items ??= rng.chance(0.6) ? [rollGear(rng, luck + 1, 'treasure')] : [];
          const fl = lvl.terrain.floorAt(p.x);
          if (p.items.length) this.addPedestal(p, p.x - 1.5, fl, p.taken ? null : p.items[0]);
          if (!p.done) {
            p.done = true; // the pearl pile is placed once; later it's whatever is lying there (saved loot)
            const pv = depthPearls(depthOf(plan, fl));
            for (let k = 0; k < 6; k++) w.spawnPickup('pearl', p.x + 1.2 + (k % 3) * 0.5, fl + 0.6 + Math.floor(k / 3) * 0.4, { value: (k === 0 ? 5 : 1) * pv, vx: 0, vy: 0 });
            p.done = !p.items.length;
          }
          break;
        }
        case 'challenge': {
          const a = plan.arenas.find((q) => q.kind === 'challenge');
          if (a?.cleared) this.addChest(p, (a.x0 + a.x1) / 2, a.floor + 0.3, false);
          break;
        }
        case 'boss': {
          const a = plan.arenas.find((q) => q.kind === 'boss');
          if (a?.cleared) this.bossRewards(a, p, false);
          void 0;
          break;
        }
        default: break;
      }
    }
  }

  private addPedestal(p: PoiPlan, x: number, floorY: number, id: string | null) {
    const ped = new Pedestal(this.level!.a.id, x, floorY, id);
    this.level!.group.add(ped.group);
    this.pedestals.set(p.id, ped);
    this.props.push({ update: (dt) => ped.update(dt, this.world), dispose: () => ped.dispose() });
  }
  private addChest(p: PoiPlan, x: number, y: number, locked: boolean) {
    const c = new ChestProp(x, y, !!p.taken, locked);
    this.level!.group.add(c.group);
    this.chests.set(p.id, c);
    this.props.push({ update: (dt) => c.update(dt), dispose: () => c.dispose() });
  }

  // ================================================================ arenas
  /** the real depth (m) of the blobfish / of a world y on this floor */
  depthNow() { return this.vdepth ?? depthOf(this.plan, this.player.y); }
  /** danger scales with depth (metres), not the floor index */
  private difficulty(y = this.player.y) { return depthDifficulty(depthOf(this.plan, y), this.cfg.mastery); }
  /** loot luck: the run's stats plus the depth bonus */
  private luck(y = this.player.y) { return this.run.stats().luck + depthLuck(depthOf(this.plan, y)); }
  private arenaBox(a: ArenaPlan): Arena { return { x0: a.x0, x1: a.x1, floor: a.floor, top: a.top }; }

  /** the player is inside an uncleared arena: lock it */
  private checkArenas() {
    if (this.fight || this.phase !== 'play') return;
    const p = this.player;
    for (const a of this.plan.arenas) {
      if (a.cleared) continue;
      if (p.x < a.x0 + 1.5 || p.x > a.x1 - 1.5 || p.y > a.top + 0.5 || p.y < a.floor - 1) continue;
      this.lockArena(a);
      return;
    }
  }

  private lockArena(a: ArenaPlan) {
    const lvl = this.level!, rng = new Rng((a.seed ^ 0xe7e7) >>> 0);
    const f: Fight = this.fight = { arena: a, pending: [], ents: [], clearT: 0, boss: null, bossDone: false, bossDeadT: -1 };
    for (const g of lvl.gates.get(a.id) ?? []) g.raise();
    setArena(this.world, this.arenaBox(a));
    this.world.emit('arenaLock', { kind: a.kind, id: a.id });
    audio.play('k_bong', { vol: 0.5 });
    if (a.kind === 'boss') {
      this.music('mu_volcano');
      this.after(1.4, () => {
        if (this.fight !== f) return;
        const b = f.boss = spawnBoss(this.world, baseOf(this.floors[this.floorIdx]), this.arenaBox(a));
        // deeper bosses hit the same, but take longer to bring down (the endless deep keeps climbing)
        const hpK = this.scal.enemyHp * (1 + Math.max(0, depthOf(this.plan, a.floor) - 60) / 400);
        if (b.hp !== undefined) { b.hp *= hpK; if (b.maxHp) b.maxHp *= hpK; }
        b.onDefeated = () => this.bossDown();
        f.ents.push(b);
        const info = b.bar?.();
        this.title3d(info?.name ?? 'THE BOSS', info?.title ?? '', T3D.danger, 3.2, { x: (a.x0 + a.x1) / 2, y: a.floor + 8 });
        audio.play('boss_growl', { vol: 0.7 }); audio.play('roar1', { vol: 0.4 });
        this.game.addShake(0.4);
      });
      return;
    }
    const dif = this.difficulty(a.floor) + (a.kind === 'challenge' ? 0.35 : 0);
    const kinds = ENEMIES_FOR(baseOf(this.floors[this.floorIdx]), dif);
    const [lo, hi] = roomBudget(dif);
    let n = rng.int(lo, hi) + this.scal.extraPerWave;
    const list: { kind: EnemyKind; elite: boolean }[] = [];
    if (a.kind === 'challenge') {
      const big: EnemyKind = kinds.includes('heavy') ? 'heavy' : kinds.includes('moray') ? 'moray' : kinds[0];
      list.push({ kind: big, elite: true });
      n = 2 + this.scal.extraPerWave;
      this.title3d('CHALLENGE', 'A CHAMPION BLOCKS THE WAY', T3D.danger, 2.6, { x: (a.x0 + a.x1) / 2, y: a.floor + 5 });
    }
    for (let i = 0; i < n; i++) list.push({ kind: rng.pick(kinds), elite: rng.chance(depthElite(depthOf(this.plan, a.floor))) });
    const p = this.player;
    list.forEach((e, i) => {
      const pos = this.spawnPoint(rng, e.kind, a, p.x);
      f.pending.push({ t: 0.8 + i * 0.15, kind: e.kind, x: pos.x, y: pos.y, elite: e.elite });
      this.after(0.3 + i * 0.15, () => { if (this.fight === f) this.world.fx.emit('silt', pos.x, pos.y, { n: 10, spread: 0.6, speed: 0.6, life: 1.4, size: 0.5, size1: 1.3, color: new THREE.Color(lvl.a.pal.silt), alpha: 0.55, drag: 2 }); });
    });
  }

  private spawnPoint(rng: Rng, kind: EnemyKind, a: { x0: number; x1: number; floor: number; top: number }, px: number): { x: number; y: number } {
    const T = this.level!.terrain;
    const floorKind = kind === 'crab' || kind === 'moray' || kind === 'heavy';
    const yTop = Math.min(a.top - 1.5, a.floor + 10);
    for (let k = 0; k < 40; k++) {
      const x = rng.range(a.x0 + 2, a.x1 - 2);
      if (Math.abs(x - px) < 5) continue;
      const fl = T.floorUnder(x, yTop);
      const y = floorKind ? fl + 0.7 : rng.range(Math.max(a.floor, fl) + 1.8, yTop);
      if (T.sdf(x, y) < 1.0) continue;
      return { x, y };
    }
    return { x: (a.x0 + a.x1) / 2 + (px < (a.x0 + a.x1) / 2 ? 5 : -5), y: a.floor + 4 };
  }

  private spawnOne(s: { kind: EnemyKind; x: number; y: number; elite: boolean }, arena: Arena): Entity {
    const e = spawnEnemy(this.world, s.kind, s.x, s.y, { elite: s.elite, difficulty: this.difficulty(s.y), arena });
    if (e.hp !== undefined) { e.hp *= this.scal.enemyHp; if (e.maxHp) e.maxHp *= this.scal.enemyHp; }
    this.world.fx.emit('bubbleBig', s.x, s.y, { n: 8, spread: 0.5, speed: 1.6 });
    this.world.sfx('gloop1', s.x, 0.4);
    return e;
  }

  private updateFight(dt: number) {
    const f = this.fight!;
    for (const s of f.pending) s.t -= dt;
    const due = f.pending.filter((s) => s.t <= 0);
    f.pending = f.pending.filter((s) => s.t > 0);
    for (const s of due) f.ents.push(this.spawnOne(s, this.arenaBox(f.arena)));
    if (f.arena.kind === 'boss') {
      const b = f.boss;
      if (b && !f.bossDone) {
        if ((b.hp ?? 1) <= 0) { if (f.bossDeadT < 0) f.bossDeadT = 0; f.bossDeadT += dt; if (f.bossDeadT > 2.5) this.bossDown(); }
        else if (!b.alive) this.bossDown();
      }
      return;
    }
    if (!f.ents.length && f.pending.length) return;
    const alive = this.alive(f.ents, f.arena.top, dt);
    if (alive === 0 && !f.pending.length) { f.clearT += dt; if (f.clearT > 0.7) this.arenaCleared(); } else f.clearT = 0;
  }

  /** living enemies of a list (a diver pinned under the ceiling trying to surface counts as gone after a while) */
  private alive(ents: Entity[], top: number, dt: number): number {
    let n = 0;
    for (const e of ents) {
      if (!e.alive || e.team !== 'enemy') continue;
      const st = (e as unknown as { state?: string }).state;
      if (st === 'retreat' || st === 'breathe') {
        const t = (this.stuck.get(e) ?? 0) + (e.y > top - 2.5 ? dt : 0);
        this.stuck.set(e, t);
        if (t > 3) { e.alive = false; this.world.fx.burst('bubble', e.x, e.y, 14, 2); this.world.emit('escaped', { kind: e.kind, x: e.x, y: e.y }); continue; }
      }
      n++;
    }
    return n;
  }

  private arenaCleared() {
    const f = this.fight;
    if (!f) return;
    const a = f.arena, lvl = this.level!;
    a.cleared = true;
    this.fight = null;
    this.tally.rooms++; this.tally.waves++;
    for (const g of lvl.gates.get(a.id) ?? []) g.drop();
    this.setTravelArena();
    audio.play('jin_good', { vol: 0.45 });
    this.title3d(a.kind === 'challenge' ? 'CHAMPION DOWN' : 'CLEARED', '', T3D.gold, 1.8, { x: this.player.x, y: this.player.y + 2.4 });
    this.world.emit('roomCleared', { type: a.kind === 'challenge' ? 'challenge' : a.kind === 'boss' ? 'boss' : 'combat', id: a.id });
    const cx = clamp(this.player.x, a.x0 + 3, a.x1 - 3), cy = Math.min(a.top - 2, this.player.y + 1.5);
    if (a.kind === 'challenge') {
      const p = this.plan.pois.find((q) => q.kind === 'challenge')!;
      p.items = [rollGear(this.world.rng, this.luck(a.floor) + 1, 'treasure'), rollGear(this.world.rng, this.luck(a.floor), 'room')];
      this.addChest(p, (a.x0 + a.x1) / 2, lvl.terrain.floorAt((a.x0 + a.x1) / 2), false);
    } else if (a.kind === 'arena') {
      // the reward burst: an Isaac-style clear drop, plus a guaranteed handful of pearls on the later arenas
      const pv = depthPearls(depthOf(this.plan, a.floor));
      const rewards = rollClearReward(this.world.rng, baseOf(lvl.plan.area), this.luck(a.floor), this.scal.lootBonus).map((rw) => (rw.kind === 'pearl' ? { ...rw, value: rw.value * pv } : rw));
      if (this.world.rng.chance(0.4 + depthOf(this.plan, a.floor) / 500)) rewards.push({ kind: 'pearl', value: pv });
      this.spawnRewards(rewards, cx, cy);
    }
    this.checkX = a.x1 + 2;
    this.save();
  }

  private spawnRewards(rewards: Reward[], x: number, y: number) {
    rewards.forEach((rw, i) => {
      const xx = x + (i - (rewards.length - 1) / 2) * 0.7, vx = (i - (rewards.length - 1) / 2) * 1.2;
      if (rw.kind === 'item') this.world.spawnPickup('item', xx, y, { id: rw.id, vy: 3.5, vx });
      else if (rw.kind === 'pearl' || rw.kind === 'heart') this.world.spawnPickup(rw.kind, xx, y, { value: rw.value, vy: 3.5, vx });
      else this.world.spawnPickup(rw.kind, xx, y, { vy: 3.5, vx });
    });
    if (rewards.length) {
      this.world.fx.emit('glow', x, y, { n: 2, size: 2.4, life: 0.5, color: '#ffe8a0' });
      this.world.fx.burst('star', x, y, 12, 2.5, { color: '#fff2b0' });
      this.world.sfx('pickup_sparkle1', x, 0.5); this.world.sfx('treasure1', x, 0.3);
    }
  }

  private bossDown() {
    const f = this.fight;
    if (!f || f.bossDone) return;
    f.bossDone = true;
    const a = f.arena, b = f.boss;
    this.tally.bosses++;
    if (b) this.world.emit('bossDefeated', { id: b.bossId, floor: this.floorIdx, byDungeon: true });
    a.cleared = true;
    this.fight = null;
    this.tally.rooms++;
    this.setTravelArena();
    this.world.emit('roomCleared', { type: 'boss', id: a.id });
    const rope = this.plan.ropeX !== null;
    this.title3d('VICTORY', rope ? 'CLIMB THE ROPE HOME, OR DIVE DEEPER' : 'THE WAY DOWN IS OPEN', T3D.gold, 3.5, { x: (a.x0 + a.x1) / 2, y: a.floor + 8 });
    this.level!.openExit();
    audio.play('creak3', { vol: 0.6 }); audio.play('flood_rush1', { vol: 0.4 });
    this.music(this.level!.a.music);
    audio.play('jin_legend', { vol: 0.6 });
    const p = this.plan.pois.find((q) => q.kind === 'boss')!;
    this.bossRewards(a, p, true);
    this.checkX = (a.x0 + a.x1) / 2;
    this.save();
  }

  private bossRewards(a: ArenaPlan, p: PoiPlan, fresh: boolean) {
    const lvl = this.level!, cx = (a.x0 + a.x1) / 2;
    p.items ??= [rollGear(this.world.rng, this.luck(a.floor), 'boss')];
    this.addPedestal(p, cx - 5, lvl.terrain.floorAt(cx - 5), p.taken ? null : p.items[0]);
    if (fresh) this.spawnRewards([{ kind: 'heart', value: 2 }, { kind: 'pearl', value: 5 * depthPearls(depthOf(this.plan, a.floor)) }, { kind: 'key' }], cx, a.floor + 4);
  }


  // ================================================================ roaming groups
  private updateGroups(dt: number) {
    const p = this.player;
    for (const g of this.plan.groups) {
      if (g.cleared) continue;
      if (!g.spawned) {
        if (Math.abs(p.x - g.x) > 17 || this.fight) continue;
        this.spawnGroup(g);
        continue;
      }
      const ents = this.groups.get(g.id) ?? [];
      if (this.alive(ents, this.plan.top, dt) === 0) { g.cleared = true; this.world.emit('roomCleared', { type: 'roam', id: g.id }); }
    }
  }
  private spawnGroup(g: GroupPlan) {
    g.spawned = true;
    const rng = new Rng(g.seed), lvl = this.level!;
    const gy = shelfAt(this.plan, g.x);
    const kinds = ENEMIES_FOR(baseOf(this.floors[this.floorIdx]), this.difficulty(gy));
    const box: Arena = { x0: Math.max(1, g.x - 14), x1: Math.min(this.plan.W - 1, g.x + 14), floor: gy - 9, top: this.plan.top };
    const ents: Entity[] = [];
    for (let i = 0; i < g.n; i++) {
      const kind = rng.pick(kinds);
      const pos = this.spawnPoint(rng, kind, { x0: g.x - 5, x1: g.x + 8, floor: gy, top: Math.min(this.plan.top, gy + 12) }, this.player.x);
      ents.push(this.spawnOne({ kind, x: pos.x, y: pos.y, elite: rng.chance(depthElite(depthOf(this.plan, gy)) * 0.5) }, box));
    }
    this.groups.set(g.id, ents);
    void lvl;
  }

  // ================================================================ pickups -> counters / the pack
  private collect(p: Pickup): boolean {
    const w = this.world, pl = this.player;
    switch (p.pk) {
      case 'pearl':
        this.run.coins += p.value; this.tally.pearls += p.value;
        w.sfx(p.value > 1 ? 'coins_pile1' : 'coin_a', p.x, 0.5, 1.1 + Math.random() * 0.2);
        this.text.pop(`+${p.value}`, p.x, p.y + 0.5, 'gold', { size: 0.3, life: 0.9 });
        return true;
      case 'heart':
        if (pl.hp >= pl.maxHp) return false;
        pl.heal(p.value, w);
        return true;
      case 'key': this.keys++; w.sfx('hook_clink1', p.x, 0.6, 1.3); w.sfx('k_confirm2', p.x, 0.3); return true;
      case 'bomb': this.bombs++; w.sfx('inflate1', p.x, 0.4, 1.4); return true;
      default: {
        const res = packAdd(this.run, p.id!, p.level, p.n);
        if (!res) { this.packFull(p.id!, p.x, p.y); return false; }
        if (res.left > 0) { p.n = res.left; this.packFull(p.id!, p.x, p.y); }
        this.hud.l.pickup(p.id!);
        w.sfx('pickup_sparkle1', p.x, 0.5); w.sfx('jin_catch', p.x, 0.3);
        w.emit('itemPicked', { id: p.id });
        this.installStats(); this.applyStats();
        return res.left <= 0;
      }
    }
  }
  private packFull(id: string, x: number, y: number) {
    this.hud.l.flash('pack');
    if (this.fullPopT > 0) return;
    this.fullPopT = 1.6;
    this.text.pop('PACK FULL', x, y + 0.7, 'danger', { size: 0.3, life: 1.2 });
    this.world.sfx('k_err1', x, 0.4);
    this.world.emit('packFull', { id });
  }

  // ================================================================ interactions
  private interact(): Prompt | null {
    const p = this.player, inp = this.game.input, w = this.world, lvl = this.level!;
    if (!p.alive || this.phase !== 'play') return null;
    const E = inp.hit('interact');
    // pedestals: swim into the floating item
    for (const [pid, ped] of this.pedestals) {
      if (!ped.id || Math.abs(p.x - ped.x) > 1.1 || Math.abs(p.y - ped.itemY) > 1.3) continue;
      if (!packFits(this.run, ped.id)) { this.packFull(ped.id, ped.x, ped.itemY); return { key: 'TAB', label: 'PACK FULL: MAKE ROOM', at: this.anchor(ped.x, ped.itemY + 0.6), bad: true }; }
      const id = ped.id;
      packAdd(this.run, id);
      ped.setItem(null);
      const poi = this.plan.pois[pid]; poi.taken = true; poi.done = true;
      this.hud.l.pickup(id);
      w.fx.burst('star', ped.x, ped.itemY, 18, 2.6, { color: '#fff2b0' });
      audio.play('treasure1', { vol: 0.6 }); audio.play('jin_rare1', { vol: 0.4 });
      w.emit('itemPicked', { id, pedestal: true });
      this.installStats(); this.applyStats();
      this.save();
    }
    // chests (treasure nooks are locked: a key opens them)
    for (const [pid, ch] of this.chests) {
      if (ch.open || Math.abs(p.x - ch.x) > 1.8 || p.y > ch.y + 2.4 || p.y < ch.y - 1) continue;
      const poi = this.plan.pois[pid];
      if (ch.locked) {
        if (this.keys <= 0) return { key: '', label: 'LOCKED: NEEDS A KEY', at: this.anchor(ch.x, ch.y + 1.6), bad: true };
        if (!E) return { key: 'E', label: 'UNLOCK (1 KEY)', at: this.anchor(ch.x, ch.y + 1.6) };
        this.keys--; ch.unlock();
        w.sfx('k_confirm1', ch.x, 0.7); w.sfx('clank1', ch.x, 0.6);
      }
      ch.open = true; poi.taken = true; poi.done = true;
      audio.play('chest_creak', { vol: 0.7 }); audio.play('treasure1', { vol: 0.5 });
      const items = poi.items ?? [];
      this.after(0.5, () => this.spawnRewards([...items.map((id) => ({ kind: 'item' as const, id })), { kind: 'pearl', value: poi.kind === 'challenge' ? 5 : 1 }], ch.x, ch.y + 1.2));
      this.save();
    }
    // the shop
    if (this.shop) {
      let best: ShopStand | null = null;
      for (const st of this.shop.stands) if (!st.slot.sold && Math.abs(p.x - st.x) < 1.2 && p.y < st.y + 2.8 && p.y > st.y - 1) best = st;
      if (best) {
        const price = best.slot.price, can = this.run.coins >= price;
        const label = `${this.shop.label(best).toUpperCase()} · ${price} PEARLS`;
        if (E) this.buy(best);
        return { key: 'E', label: can ? `BUY ${label}` : label, at: this.anchor(best.x, best.y - 0.6), bad: !can };
      }
      if (this.shopPoi && Math.abs(p.x - this.shopPoi.x) < 12 && !this.shopPoi.known) { /* noop */ }
    }
    // the post office: the manatee waits by her pillar box
    const mt = lvl.manatee;
    if (mt && Math.hypot(p.x - mt.x, p.y - mt.y) < 3.8) {
      if (E) this.openMail();
      return { key: 'E', label: 'MAIL ITEMS HOME', at: this.anchor(mt.x, mt.y + 1.4) };
    }
    // past the boss: the rope up to the surface (a victory that keeps the pack) or the pit down
    const plan = this.plan;
    if (lvl.exitOpen && plan.ropeX !== null && Math.abs(p.x - plan.ropeX) < 1.6) {
      if (E) this.surface();
      return { key: 'E', label: 'CLIMB THE ROPE: SURFACE WITH YOUR PACK', at: this.anchor(plan.ropeX, p.y + 1.2) };
    }
    const ex = plan.exit, ecx = (ex.x0 + ex.x1) / 2;
    if (lvl.exitOpen && Math.abs(p.x - ecx) < 4.5 && p.y < ex.top + 4 && p.y > ex.bottom) {
      const last = this.floorIdx >= this.floors.length - 1;
      return { key: '', label: last && plan.ropeX !== null ? 'DIVE DEEPER: INTO THE ENDLESS DEEP' : 'SWIM DOWN THE SHAFT', at: this.anchor(ecx, ex.top + 2.4) };
    }
    // a refused pickup nearby
    for (const e of w.entities) if (e instanceof Pickup && e.refused > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 2) {
      if (e.pk === 'item') return { key: 'TAB', label: 'PACK FULL: MAKE ROOM', at: this.anchor(e.x, e.y + 0.6), bad: true };
      if (e.pk === 'heart') return { key: '', label: 'HEALTH FULL', at: this.anchor(e.x, e.y + 0.6) };
    }
    return null;
  }

  private shopGreeted = false;
  private updateShopTalk() {
    const sp = this.shopPoi;
    if (!sp || this.shopGreeted || Math.abs(this.player.x - sp.x) > 9) return;
    this.shopGreeted = true;
    this.dlg.bark('crab', this.world.rng.pick(["Pearls on the counter, kid. Let's see 'em.", 'Mind the merchandise. Breaks? Buys.', "Back again? Swim slow, I'm old."]), 3.2);
  }

  private buy(st: ShopStand) {
    const s = st.slot, w = this.world;
    if (this.run.coins < s.price) { this.dlg.bark('crab', "Pearls first, kid. I don't do tabs.", 2.4); w.sfx('k_err1', st.x, 0.4); return; }
    if (s.kind === 'item' && !packFits(this.run, s.id!)) { this.dlg.bark('crab', "Your bag's stuffed. Make room, then we talk.", 2.6); this.packFull(s.id!, st.x, st.y + 1.5); return; }
    this.run.coins -= s.price;
    if (s.kind === 'item') { packAdd(this.run, s.id!); this.installStats(); this.applyStats(); this.hud.l.pickup(s.id!); w.emit('itemPicked', { id: s.id, bought: true }); }
    else if (s.kind === 'heart') this.player.heal(2, w);
    else if (s.kind === 'key') this.keys++;
    else this.bombs++;
    this.shop!.sell(st);
    if (this.shopPoi && this.shopPoi.shop?.every((q) => q.sold)) this.shopPoi.done = true;
    audio.play('buy1', { vol: 0.6 }); audio.play('coins_many1', { vol: 0.4 });
    this.dlg.bark('crab', w.rng.pick(['Pleasure doing business.', 'Good eye. Better than mine.', "Don't spend it all in one reef.", 'No refunds. Ever.']), 2.4);
    w.emit('buy', { kind: s.kind, id: s.id, price: s.price });
    this.save();
  }

  // ---- post office
  private mailUsed = 0;
  static MAIL_CAPACITY = 8;
  private openMail() {
    const items = this.run.items.filter((i) => ITEMS[i.id]);
    this.mail = { items, picked: new Set(), capacity: DungeonScreen.MAIL_CAPACITY - this.mailUsed, used: 0 };
    audio.play('page1', { vol: 0.5, dry: true });
    if (!this.mailUsed) this.dlg.bark('manatee', 'Parcels home? Pop them in my bag, dear.', 3);
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
    const m = this.mail, mt = this.level?.manatee;
    if (!m || !mt || !m.picked.size || m.used > m.capacity) return;
    const sent = this.run.items.filter((i) => m.picked.has(i.uid));
    this.run.items = this.run.items.filter((i) => !m.picked.has(i.uid));
    const { materials, gear } = packTotals(sent);
    addMaterials(materials);
    for (const g of gear) stashItem(g.id, g.level);
    META.extractions++; saveMeta();
    this.mailUsed += m.used;
    const ids = expandIds(sent);
    this.mailed.push(...ids);
    this.tally.extracted += ids.length;
    // her delivery roll and a burst of hearts, as at the buoy
    mt.celebrate();
    this.world.fx.burst('heart', mt.x + 0.8, mt.y + 0.6, 6 + Math.min(10, ids.length), 1.5, { vy: 1.2, life: 1.6 });
    this.world.sfx('cute1', mt.x, 0.8); this.world.sfx('jin_catch1', mt.x, 0.6);
    this.world.emit('extract', { items: ids, counts: materials, x: mt.x, y: mt.y });
    const post = this.plan.pois.find((q) => q.kind === 'post');
    if (post && this.mailUsed >= DungeonScreen.MAIL_CAPACITY) post.done = true;
    audio.play('bag_zip1', { vol: 0.5 });
    this.dlg.bark('manatee', 'Off they go! Safe and sound at home, dear.', 2.6);
    this.installStats(); this.applyStats();
    this.mail = null;
    this.save();
  }

  // ---- bombs
  private dropBomb() {
    if (this.bombs <= 0) { this.world.sfx('k_err1', this.player.x, 0.3); return; }
    this.bombs--;
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

  // ================================================================ the way down
  /** the boss is down and the blobfish swims into the open pit: the physical descent to the next floor */
  private beginDescent() {
    if (this.phase !== 'play' || this.desc) return;
    this.phase = 'descend';
    this.world.god = true;
    this.mail = null;
    const n = this.floorIdx;
    this.world.emit('floorCleared', { n, area: this.floors[n], depth: Math.round(this.depthNow()) });
    this.tally.floors++;
    // past the last planned floor: the run turns into the endless deep
    if (n >= this.floors.length - 1) {
      const last = this.floors[this.floors.length - 1];
      const i = AREA_ORDER.indexOf(baseOf(last));
      const next = !isHadal(last) && i >= 0 && i < AREA_ORDER.length - 1 ? AREA_ORDER[i + 1] : hadalFor(this.floors.filter(isHadal).length, this.seed);
      this.floors.push(next);
      if (n === this.planned - 1) this.world.emit('endlessDeep', { depth: Math.round(this.depthNow()) });
    }
    const from = this.depthNow();
    this.desc = { stage: 'sink', t: 0, from, to: from };
    audio.play('flood_rush1', { vol: 0.7 }); audio.play('uw_rumble1', { vol: 0.5 });
  }

  private updateDescent(dt: number) {
    const d = this.desc!, p = this.player, plan = this.plan;
    d.t += dt;
    if (d.stage === 'sink') {
      // the down-current: pulled into the middle of the shaft and down, bubbles streaming up past
      const ex = plan.exit, cx = (ex.x0 + ex.x1) / 2;
      p.applyForce((cx - p.x) * 18 - p.vx * 4, -26 - p.vy * 2);
      if (Math.random() < dt * 40) this.world.fx.emit('bubble', p.x + (Math.random() - 0.5) * 3, p.y - 2 - Math.random() * 3, { n: 1, vy: 3.5, life: 1.4, size: 0.06 });
      if (p.y < ex.bottom + 4 || d.t > 4) {
        d.stage = 'dark'; d.t = 0;
        d.from = this.depthNow();
        d.to = d.from + 22;                                   // the rest of the way down is in the dark
        this.vdepth = d.from;
        this.game.post.fadeTo?.(1, 0.7, '#000000');
      }
    } else if (d.stage === 'dark') {
      this.vdepth = d.from + (d.to - d.from) * Math.min(1, d.t / 1.6);
      if (d.t > 0.8 && !this.levelSwapped) {
        this.levelSwapped = true;
        this.mailUsed = 0; this.shopGreeted = false;
        // the next floor's entry shaft (world y = ENTRY_TOP - 1) sits at the depth we reach in the dark
        const entryY = ENTRY_TOP - 1;
        this.startFloor(this.floorIdx + 1, null, d.to + entryY);
        this.vdepth = d.from + (d.to - d.from) * Math.min(1, d.t / 1.6);
      }
      if (d.t > 1.6) {
        d.stage = 'arrive'; d.t = 0;
        this.vdepth = null;
        this.levelSwapped = false;
        this.game.post.fadeTo?.(0, 1.0);
        this.world.god = this.god;
        this.phase = 'play';
        this.save();
      }
    } else if (d.stage === 'arrive') {
      if (d.t > 1.2) this.desc = null;
    } else if (d.stage === 'surface') {
      // up the rope: hand over fin, then the light
      p.applyForce((this.plan.ropeX! - p.x) * 16 - p.vx * 4, 30 - p.vy * 2);
      if (Math.random() < dt * 20) this.world.fx.emit('bubble', p.x, p.y - 0.4, { n: 1, vy: 2, life: 1.2, size: 0.05 });
      if (d.t > 0.6 && !this.levelSwapped) { this.levelSwapped = true; this.game.post.fadeTo?.(1, 1.4, '#d8f0ff'); }
      if (d.t > 2.2) { this.desc = null; this.levelSwapped = false; this.victory(); }
    }
  }
  private levelSwapped = false;

  /** climb the rope: surface with the pack (a victory) */
  private surface() {
    if (this.phase !== 'play' || this.desc) return;
    this.phase = 'descend';
    this.world.god = true;
    this.desc = { stage: 'surface', t: 0, from: this.depthNow(), to: 0 };
    audio.play('rope_creak1', { vol: 0.7 }); audio.play('jin_legend', { vol: 0.5 });
    this.title3d('SURFACING', `FROM -${Math.round(this.depthNow())} M`, T3D.gold, 2.5, { x: this.player.x, y: this.player.y + 2 });
  }


  // ================================================================ endings
  private die() {
    if (this.phase === 'dead' || this.ended) return;
    this.phase = 'dead';
    this.deadT = 0;
    this.paused = false; this.mail = null;
    audio.music(null, 2);
    const b = board(this.world), by = b.lastHurt.by;
    const boss = this.fight?.boss;
    if (by && b.time - b.lastHurt.t < 6) this.killer = { name: by.callsign, title: by.nemesisId ? META.nemeses.find((n) => n.id === by.nemesisId)?.title : undefined, nemesis: !!by.nemesisId };
    else if (boss) this.killer = { name: boss.bar?.().name ?? 'The boss', title: boss.bar?.().title };
    else this.killer = { name: 'The deep', title: AREA_NAME(this.floors[this.floorIdx]) };
  }

  private result(won: boolean, items: string[]): DungeonResult {
    const area = this.floors[this.floorIdx] ?? 'reef';
    return {
      outcome: won ? 'victory' : 'dead', areaName: AREA_NAME(area), areaIdx: this.floorIdx, wave: this.tally.rooms, mastery: this.cfg.mastery,
      items, killer: won ? null : this.killer, tally: { ...this.tally },
      won, floor: this.floorIdx + 1, floors: this.floors.length, kills: this.tally.kills,
      maxDepth: Math.round(this.maxDepth), record: Math.round(this.maxDepth) > this.recordBefore,
      packLost: won ? [] : items, mailed: [...this.mailed], broughtHome: won ? items : [],
    };
  }

  private endLost() {
    if (this.ended) return;
    this.ended = true;
    const lost = expandIds(this.run.items.filter((i) => ITEMS[i.id]));
    this.run.items = [];
    if (!this.dev) { META.deaths++; saveMeta(); }
    clearDungeonSave();
    this.finish(this.result(false, lost));
  }

  private victory() {
    if (this.ended) return;
    this.ended = true;
    const items = this.run.items.filter((i) => ITEMS[i.id]);
    const home = expandIds(items);
    const r = this.result(true, home);
    if (!this.dev) {
      const { materials, gear } = packTotals(items);
      returnToStash(gear);
      addMaterials(materials);
      META.wins++;
      const before = META.masteryUnlocked;
      META.masteryUnlocked = Math.max(META.masteryUnlocked, Math.min(MAX_MASTERY, this.cfg.mastery + 1));
      saveMeta();
      if (META.masteryUnlocked > before) r.unlocked = META.masteryUnlocked;
    }
    clearDungeonSave();
    this.finish(r);
  }

  private finish(r: DungeonResult) {
    this.phase = 'done';
    this.game.timeScale = 1;
    (window as unknown as { lastDungeonResult: DungeonResult }).lastDungeonResult = r;
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
    if (this.game.get('hideout')) this.game.go('hideout', { arrive: true });
  }

  /** the run so far (RESUME): written at floor starts, arena clears, purchases, mail and quit */
  save() {
    if (this.ended || this.phase === 'dead' || !this.plan || this.dev) return;
    const loot: FloorLoot[] = [];
    for (const e of this.world.entities) if (e instanceof Pickup && e.alive) loot.push({ kind: e.pk, id: e.id, x: e.x, y: e.y, n: e.pk === 'item' ? e.n : e.value, level: e.level });
    const s: DungeonSave = {
      v: 4, cfg: this.cfg, seed: this.seed, floors: [...this.floors], floorIdx: this.floorIdx, plan: this.plan, checkX: this.checkX,
      hp: this.player?.hp ?? this.run.hp, items: this.run.items.map((i) => ({ ...i })), nextUid: this.run.nextUid,
      pearls: this.run.coins, keys: this.keys, bombs: this.bombs, tally: { ...this.tally }, mailed: [...this.mailed], loot,
      areas: [...this.floors], areaIdx: this.floorIdx, planned: this.planned, maxDepth: Math.round(this.maxDepth),
    };
    META.activeRun = s as unknown as typeof META.activeRun;
    saveMeta();
  }

  // ================================================================ events
  private wire() {
    const w = this.world;
    w.on('kill', (d) => { if (d.boss) return; this.tally.kills++; this.run.kills++; });
    w.on('hit', (d) => { if (d.crit) this.critPending = true; });
    w.on('explosion', (d) => {
      if (typeof d.x !== 'number' || typeof d.y !== 'number' || !this.level) return;
      for (const [pid, lid] of this.level.lids) {
        if (!lid.blast(d.x, d.y as number, (d.r as number) ?? 2)) continue;
        const p = this.plan.pois[pid];
        p.opened = true; p.known = true;
        this.hud.l.title('A SECRET!', 'SOMETHING GLITTERS BELOW', '#e0c0ff', 2.4);
        audio.play('jin_rare2', { vol: 0.5 });
        this.world.emit('secretFound', { x: p.x });
        this.save();
      }
    });
    w.on('bossDefeated', (d) => { const b = this.fight?.boss; if (!d.byDungeon && b && d.id === b.bossId) this.after(1.5, () => this.bossDown()); });
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
    const w = this.world, p = this.player, inp = this.game.input, lvl = this.level;
    if (!w || !lvl || this.ended) return;
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
    if (this.ended || !this.level) return;
    const L = this.level;
    // ---- the blobfish (frozen while the mail picker is up)
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
    // ---- the level
    L.update(dt, this.camLook.x);
    for (const pr of this.props) pr.update(dt);
    w.emit('tick', { dt });
    if (this.phase === 'play') {
      explore(this.plan, p.x);
      this.checkArenas();
      if (!this.fight) this.setTravelArenaThrottled(dt);
      // the open exit pit pulls: a down-current sucks the blobfish in when it swims over it
      const ex = this.plan.exit, ecx = (ex.x0 + ex.x1) / 2;
      if (L.exitOpen && Math.abs(p.x - ecx) < 3.6 && p.y < ex.top + 3.5) p.applyForce((ecx - p.x) * 10, -12);
      if (L.exitOpen && p.x > ex.x0 - 0.3 && p.x < ex.x1 + 0.3 && p.y < ex.top - 1.6) this.beginDescent();
      if (L.exitOpen && Math.random() < dt * 14) this.world.fx.emit('bubble', ex.x0 + Math.random() * (ex.x1 - ex.x0), ex.top + Math.random() * 3, { n: 1, vy: -2.4, life: 1.1, size: 0.05 });
    }
    if (this.desc) this.updateDescent(dt);
    this.updateDepth(dt);
    if (this.fight) this.updateFight(dt);
    this.updateGroups(dt);
    this.updateShopTalk();
    // ---- input: bombs, the bag
    if (this.phase === 'play' && p.alive && !this.mail) {
      if (inp.keyHit('KeyG')) this.dropBomb();
      if (inp.hit('bag')) this.openBag();
    }
    let prompt = this.mail ? null : this.interact();
    this.hintT -= dt;
    if (!prompt && this.hintT > 0) prompt = { key: '', label: this.hintText };
    // ---- camera, water, fx
    this.updateCamera(dt);
    w.water.update(this.game.renderer, dt, this.camLook.x);
    w.fx.update(dt);
    w.text.update(dt);
    this.t3d.update(dt, this.camera);
    audio.listenerX = this.camLook.x;
    audio.setUnderwater(this.camera.position.y < 0.2 ? 0.55 : 0.15);
    const low = p.alive && p.hp <= 2;
    this.heartbeat -= dt;
    if (low && this.heartbeat <= 0) { this.heartbeat = 1.0; audio.play('heartbeat1', { vol: 0.5 }); POST.uPulse.value = 1; }
    POST.uPulse.value *= Math.exp(-dt * 3);
    if (this.phase !== 'dead') POST.uDesat.value = damp(POST.uDesat.value, 0, 3, dt);
    this.run.hp = p.hp;
    // ---- HUD (+ the dialogue bubbles on the same layer)
    this.dlg.update(dt, this.mail ? null : inp);
    const act = this.hud.draw(dt, this.hudState(prompt), inp, () => this.dlg.draw());
    if (act?.startsWith('mail:')) this.mailAction(act);
    this.bar.visible = false; // replaced by the HUD's hand of skill cards (HudData.skills)
    this.bar.update(dt, p.skillHud());
    // ---- death
    if (this.deadT >= 0) {
      this.deadT += dt;
      POST.uDesat.value = Math.min(1, this.deadT * 0.5);
      if (this.deadT > 3.2) { this.deadT = -1; this.endLost(); }
    }
  }

  private travelT = 0;
  private setTravelArenaThrottled(dt: number) { this.travelT -= dt; if (this.travelT <= 0) { this.travelT = 0.5; this.setTravelArena(); } }

  /** the camera target: side-scrolling follow with look-ahead, clamped to the level; framed on an arena fight */
  /** depth drives the look: re-grade the area's light by the camera's real depth, dim the god rays, light the lantern */
  private updateDepth(dt: number, force = false) {
    const lvl = this.level, p = this.player;
    if (!lvl) return;
    const camD = this.vdepth ?? depthOf(this.plan, this.camLook.y);
    const m = this.depthNow();
    this.lookT -= dt;
    if (force || this.lookT <= 0) {
      this.lookT = 0.15;
      const L = depthLook(lvl.look, camD);
      this.light.applyLook(L);
      meadowLook(L.sun, L.sunI, L.hemiSky, L.hemiGround, L.hemi);
      POST.uExposure.value = L.exposure * (1 - this.scal.darkness);
      const k = Math.max(0, 1 - Math.max(0, camD - 20) / 110);
      for (const sh of lvl.shafts) { const mt = sh.material as THREE.MeshBasicMaterial; if (mt.color) mt.color.setScalar(k); }
    }
    // the blobfish's own lantern (kasa hat light): off in the sunlit zone, the main light down in the dark
    if (this.lamp) {
      const I = playerLight(m);
      this.lamp.light.intensity = I * (0.92 + Math.sin(this.world.time * 7) * 0.04 + Math.sin(this.world.time * 13) * 0.03);
      this.lamp.light.distance = 7 + I * 1.5;
      this.lamp.set(p.x + p.facing * 0.25, p.y + 0.7, 1.4);
    }
    // records
    if (this.phase === 'play' && !this.vdepth) {
      this.floorMax = Math.max(this.floorMax, m);
      if (m > this.maxDepth + 0.5) {
        const prevZone = zoneOf(this.maxDepth);
        this.maxDepth = m;
        if (zoneOf(m) !== prevZone && this.maxDepth > 1) { this.world.emit('depthZone', { zone: zoneOf(m), depth: Math.round(m) }); this.hud.l.title(ZONE_NAME[zoneOf(m)], `-${Math.round(m)} M`, '#9fe8ff', 2.6); }
        const rec = META as unknown as { records?: { maxDepth: number; deepestFloor: number; hadal: number } };
        rec.records ??= { maxDepth: 0, deepestFloor: 0, hadal: 0 };
        if (m > rec.records.maxDepth && !this.dev) {
          rec.records.maxDepth = Math.round(m);
          rec.records.deepestFloor = Math.max(rec.records.deepestFloor, this.floorIdx + 1);
          rec.records.hadal = Math.max(rec.records.hadal, this.floors.slice(0, this.floorIdx + 1).filter(isHadal).length);
          this.recordDirty = true;
        }
      }
    }
    if (this.recordDirty && this.lookT === 0.15) { this.recordDirty = false; saveMeta(); }
  }
  private recordDirty = false;

  /** depth data for the HUD (agent L's brass depth gauge): the counter, this floor's span, the run's and the record */
  depthHud(): DepthHud {
    const m = this.depthNow();
    const [top, bottom] = depthSpan(this.plan);
    const rec = (META as unknown as { records?: { maxDepth: number } }).records?.maxDepth ?? 0;
    return { m, floorTop: top, floorBottom: bottom, floorMax: this.floorMax, runMax: this.maxDepth, record: Math.max(rec, this.recordBefore), zone: zoneOf(m), deeper: this.floorIdx >= this.planned, descending: !!this.desc && this.desc.stage !== 'arrive' };
  }

  private camTarget(snap = 0): THREE.Vector3 {
    const p = this.player, plan = this.plan, f = this.fight;
    const fov = (this.camera.fov * Math.PI) / 360;
    const dist = f ? (f.arena.kind === 'boss' ? 20 : 18.5) : 16.5;
    this.camDist = snap ? dist : damp(this.camDist, dist, 2, 1 / 60);
    const halfV = this.camDist * Math.tan(fov), halfW = halfV * this.camera.aspect;
    let tx = p.x + this.lookAhead, ty = p.y + clamp(p.vy * 0.2, -1.2, 1.2);
    // deeper floors keep the camera under the dark ceiling; descending, it follows the blobfish down the shaft
    let x0 = 0, x1 = plan.W, y0 = plan.exit.bottom - 4, y1 = plan.top > -2.9 ? plan.top + 1.8 : plan.top - 0.3;
    if (f) { x0 = f.arena.x0 - 1.5; x1 = f.arena.x1 + 1.5; y0 = f.arena.floor - 1.5; y1 = f.arena.top + 1.8; }
    tx = x1 - x0 > halfW * 2 ? clamp(tx, x0 + halfW, x1 - halfW) : (x0 + x1) / 2;
    // keep the seabed under the frame and don't show much sky
    const floorHere = this.level!.terrain.floorAt(clamp(tx, 0, plan.W));
    const lo = Math.max(y0, Math.min(floorHere, p.y - 2)) + halfV - 2.8, hi = y1 - halfV + 0.6;
    if (this.desc && this.desc.stage !== 'surface') return new THREE.Vector3(clamp(tx, x0 + halfW, x1 - halfW), p.y - 1.5, 0);
    ty = lo < hi ? clamp(ty, lo, hi) : (lo + hi) / 2;
    return new THREE.Vector3(tx, ty, 0);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const want = clamp(p.vx * 0.55, -3.5, 3.5) + p.facing * 1.2;
    this.lookAhead = damp(this.lookAhead, want, 1.6, dt);
    const t = this.camTarget();
    const k = this.fight ? 3 : 4.5;
    this.camLook.x = damp(this.camLook.x, t.x, k, dt);
    this.camLook.y = damp(this.camLook.y, t.y, 3.5, dt);
    const sh = this.game.shakeOffset();
    this.camera.position.set(this.camLook.x + sh.x, this.camLook.y + 0.8 + sh.y, this.camDist);
    this.camera.lookAt(this.camLook.x + sh.x * 0.5, this.camLook.y + sh.y * 0.5, 0);
    this.camera.updateMatrixWorld();
    this.light.follow(this.camLook.x, this.camLook.y);
  }

  private anchor(x: number, y: number, z = 0): HudAnchor {
    const v = this.v.set(x, y, z).project(this.camera);
    const ui = this.hud.ui;
    const sx = (v.x * 0.5 + 0.5) * ui.w, sy = (1 - (v.y * 0.5 + 0.5)) * ui.h;
    return { x: sx, y: sy, on: v.z < 1 && sx >= 0 && sx <= ui.w && sy >= 0 && sy <= ui.h };
  }

  /** everything the HUD shows (L's HudData + prompts / menus); agent L can also read dungeon.hudState() */
  hudState(prompt: Prompt | null = null): DungeonHudState {
    const p = this.player;
    const combat = (p as unknown as { combat?: { hud?: () => PlayerCombatHud } }).combat?.hud?.() ?? null;
    const cells = packCells(this.run);
    const boss = this.fight?.boss && !this.fight.bossDone ? this.fight.boss.bar() : null;
    return {
      data: {
        hp: p.hp, maxHp: p.maxHp, combat, mana: p.mana, maxMana: p.maxMana,
        pearls: this.run.coins, keys: this.keys, bombs: this.bombs,
        pack: { used: cells.used, total: cells.total, full: cells.free <= 0 },
        strip: stripMap(this.plan, p.x, p.y, { floors: this.floors.length, revealAll: this.dev?.get('reveal') === '1' }),
        boss, hidden: this.phase === 'done' || this.desc?.stage === 'surface',
        // the skills are a hand of 3D cards in L's HUD (the old 2D SkillBar overlay stays hidden)
        skills: p.skillHud(),
      },
      prompt, paused: this.paused, mail: this.mail, depth: this.depthHud(),
      where: `${AREA_NAME(this.floors[this.floorIdx]).toUpperCase()} · -${Math.round(this.depthNow())} M · FLOOR ${this.floorIdx + 1}`,
    };
  }
}

void FAR;
