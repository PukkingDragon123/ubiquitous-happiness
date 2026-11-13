// The v2 RUN: roguelike wave defense across three areas.
//
//   area 1 = cfg.startArea, then the next two of the AREAS progression (reef > kelp > graveyard > arctic > abyss).
//   Each area: 3 + index waves of humans (WaveDirector); the last wave of the third area is the boss. Between waves
//   an intermission (~30 s; hold ENTER or ring the ship's bell [R] to start early) to break resource nodes, carry
//   loot to the mail buoy (the manatee sends it home: [E]) and repair the wreck ([E] spends bag materials). Once the
//   area's waves are beaten and the wreck is seaworthy: SET SAIL ([E] at the wreck) -> letterbox, fade, next area.
//   Dying (or losing the wreck) loses the bag and the backpack; winning area 3 brings everything home and unlocks
//   the next mastery level. META.activeRun is saved at every area start, wave clear, extraction and quit (RESUME).
//
//   const rs = new RunScreen(game); rs.onEnd = (result) => ...; rs.onQuit = () => ...; game.register(rs);
//   game.go('run', { cfg })          a new run from a RunConfig (loadout uids come out of the stash)
//   game.go('run', { resume: save }) continue META.activeRun
//   game.go('run')                   dev: a run from the URL (&area=kelp&mastery=0&wave=1&god=1&rich=1&inter=30)
import * as THREE from 'three';
import type { Game, Screen } from './game';
import { Run, type ItemInst } from './run';
import { RunWorld } from './runWorld';
import { RunHud, type HudAnchor, type HudState } from './runHud';
import { makeSky } from '../gfx/sky';
import { WaterFX } from '../gfx/water/water';
import { Lighting } from '../gfx/lighting';
import { Particles } from '../gfx/particles';
import { POST } from '../gfx/post';
import { FloatText } from '../ui/text';
import { Rng } from '../core/rng';
import { clamp, damp } from '../core/math';
import { audio } from '../audio/audio';
import { Blobfish } from '../player/blobfish';
import { SkillBar } from '../skills/hud';
import { buildArea, type Area } from '../area';
import { WaveDirector } from '../waves';
import { board } from '../waves/board';
import { ITEMS, installItemSystem, skillLevels, abilityLevels, findSpot, rollItem, type ItemDef } from './items';
import { META, saveMeta, addMaterials, stashItem, takeFromStash, returnToStash, type RunConfig, type RunSave, type RunResult, type RunTally } from '../meta/meta';
import { AREAS as AREA_LIST, masteryScalars, MAX_MASTERY } from '../hideout/mastery';
import { stationsBuilt, stationPerks } from '../hideout/blueprints';

export const RUN_AREAS = 3;
/** waves in the area at index i (3, 4, 5) */
export const areaWaves = (i: number) => 3 + i;
/** the director's wave number for wave k (1-based) of area i: one rising count across the run */
const globalWave = (i: number, k: number) => { let n = k; for (let j = 0; j < i; j++) n += areaWaves(j); return n; };
const FINAL_WAVE = globalWave(RUN_AREAS - 1, areaWaves(RUN_AREAS - 1));
const INTERMISSION = 30;
const ARCH = ['mage', 'warrior', 'summoner', 'tinkerer', 'rogue'];

/** the three areas of a run starting at `start` */
export function runAreas(start: string): string[] {
  const ids = AREA_LIST.map((a) => a.id);
  const i = Math.max(0, ids.indexOf(start));
  return [0, 1, 2].map((k) => ids[(i + k) % ids.length]);
}

type Phase = 'intermission' | 'wave' | 'cleared' | 'sailing' | 'fade' | 'dead';
type Ender = 'dead' | 'sunk';

export interface RunEnter { cfg?: RunConfig; resume?: RunSave }

export class RunScreen implements Screen {
  name = 'run';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
  overlay = new THREE.Scene();
  hud = new RunHud();
  bar = new SkillBar();
  overlays: { scene: THREE.Scene; camera: THREE.Camera }[] = [
    { scene: this.overlay, camera: this.camera },
    { scene: this.bar.scene, camera: this.bar.camera },
    this.hud.ui.layer,
  ];
  /** the run ended (death, lost wreck, victory): META is already updated */
  onEnd?: (r: RunResult) => void;
  /** paused -> quit: META.activeRun holds the run */
  onQuit?: () => void;

  run!: Run;
  cfg: RunConfig = { mastery: 0, startArea: 'reef', loadout: [] };
  seed = 1;
  areas: string[] = [];
  areaIdx = 0;
  wavesCleared = 0;
  /** the loot bag: ids carried, not yet extracted (lost on death) */
  bag: string[] = [];
  tally: RunTally = { kills: 0, time: 0, waves: 0, extracted: 0, repairs: 0, bosses: 0 };
  world!: RunWorld;
  area!: Area;
  dir!: WaveDirector;
  player!: Blobfish;
  light = new Lighting();
  phase: Phase = 'intermission';
  paused = false;
  private interT = INTERMISSION;
  private interMax = INTERMISSION;
  private holdT = 0;
  private deadT = -1;
  private ender: Ender = 'dead';
  private killer: RunResult['killer'] = null;
  private ended = false;
  private seq: { t: number; fn: () => void }[] = [];
  private camLook = new THREE.Vector3(0, -5, 0);
  private camDist = 16;
  private scal = masteryScalars(0);
  private perks = new Set<string>();
  private pendingGear: ItemInst[] = [];
  private ambience: ReturnType<typeof audio.loop> | null = null;
  private heartbeat = 0;
  private sailT = 0;
  private bossWave = false;
  private god = false;
  private v = new THREE.Vector3();

  constructor(public game: Game) { (window as unknown as { runScreen: RunScreen }).runScreen = this; }

  // ---------------------------------------------------------------- Screen
  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.hud.resize(w, h, this.game.renderer.getPixelRatio());
    this.bar.resize(w, h);
    const ph = h * Math.min(devicePixelRatio || 1, 1.5);
    this.world?.fx.setPixelScale(ph, this.camera.fov);
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as RunEnter;
    this.ended = false; this.paused = false; this.seq = []; this.killer = null; this.deadT = -1;
    this.game.timeScale = 1;
    POST.uDesat.value = 0; POST.uPulse.value = 0;
    const q = new URLSearchParams(location.search);
    this.god = q.get('god') === '1';
    this.perks = new Set(stationsBuilt());
    if (d.resume) this.restore(d.resume);
    else this.fresh(d.cfg ?? this.devConfig(q), !d.cfg);
    this.scal = masteryScalars(this.cfg.mastery);
    this.buildAreaAt(this.areaIdx, d.resume?.wreck ?? null);
    if (!d.cfg && !d.resume) this.devExtras(q);
    if (d.resume) this.player.hp = Math.max(1, Math.min(this.player.maxHp, d.resume.hp));
    this.save();
  }

  exit() {
    this.ambience?.stop(); this.ambience = null;
    this.teardown();
    this.game.timeScale = 1;
    POST.uDesat.value = 0; POST.uPulse.value = 0; POST.uLetterbox.value = 0; POST.uFade.value = 0;
    this.game.cursor = 'normal';
  }

  // ---------------------------------------------------------------- setup
  private devConfig(q: URLSearchParams): RunConfig {
    return { mastery: Number(q.get('mastery') || 0), startArea: q.get('area') || 'reef', loadout: [] };
  }
  /** dev URL extras: &wave=N (start at wave N of the area), &areaIdx, &rich=1 (a bag of materials), &stage=N (wreck), &inter=sec */
  private devExtras(q: URLSearchParams) {
    const wave = Number(q.get('wave') || 1);
    if (wave > 1) { this.wavesCleared = Math.min(areaWaves(this.areaIdx), wave - 1); if (this.wavesCleared >= areaWaves(this.areaIdx)) this.setPhase('cleared'); }
    if (q.get('rich') === '1') for (const d of Object.values(ITEMS)) if (d.kind === 'material' && !d.craftOnly) for (let k = 0; k < 4; k++) this.bag.push(d.id);
    const st = Number(q.get('stage') || 0);
    for (let i = 0; i < st; i++) this.area.shipwreck.repair(this.area.shipwreck.needs());
    if (q.get('inter')) this.interT = this.interMax = Number(q.get('inter'));
    if (q.get('manatee') === '1') this.area.mailbox.eta = 0.5;
  }

  private fresh(cfg: RunConfig, dev: boolean) {
    this.cfg = { ...cfg, loadout: [...cfg.loadout] };
    this.seed = (Math.random() * 1e9) | 0;
    if (dev) this.seed = Number(new URLSearchParams(location.search).get('seed') || 12345);
    this.run = new Run(this.seed);
    // the loadout leaves the stash and goes into the backpack grid
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
    this.areas = runAreas(cfg.startArea);
    this.areaIdx = dev ? Math.max(0, Math.min(RUN_AREAS - 1, Number(new URLSearchParams(location.search).get('areaIdx') || 0))) : 0;
    this.wavesCleared = 0;
    this.bag = [];
    this.tally = { kills: 0, time: 0, waves: 0, extracted: 0, repairs: 0, bosses: 0 };
    this.installStats();
    this.run.hp = this.run.stats().maxHp;
    if (!dev) { META.runs++; saveMeta(); }
  }

  private restore(s: RunSave) {
    this.cfg = { ...s.cfg, loadout: [...s.cfg.loadout] };
    this.seed = s.seed;
    this.run = new Run(s.seed);
    this.run.items = s.items.filter((i) => ITEMS[i.id]).map((i) => ({ ...i }));
    this.run.nextUid = s.nextUid;
    this.areas = [...s.areas];
    this.areaIdx = s.areaIdx;
    this.wavesCleared = s.wavesCleared;
    this.bag = s.bag.filter((id) => ITEMS[id]);
    this.tally = { ...s.tally };
    this.installStats();
    this.run.hp = s.hp;
  }

  /** the backpack's item system + hideout station perks */
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

  private teardown() {
    const w = this.world;
    if (!w) return;
    this.dir?.dispose();
    this.area?.dispose();
    w.clear();
    this.player?.dispose();
    this.scene.clear(); this.overlay.clear();
  }

  private buildAreaAt(idx: number, wreckSave: RunSave['wreck']) {
    this.teardown();
    const id = this.areas[idx];
    this.light = new Lighting();
    const water = new WaterFX(), fx = new Particles(), text = new FloatText();
    this.player = new Blobfish(0, -5);
    const w = this.world = new RunWorld(this.game, this.run, this.scene, this.camera, water, fx, text, new Rng((this.seed ^ Math.imul(idx + 1, 2654435761)) >>> 0), this.player);
    w.god = this.god;
    this.scene.add(makeSky(), water.group, this.light.group, fx.object, this.player.obj);
    this.overlay.add(text.group);
    fx.waterAt = (x) => water.heightAt(x);
    fx.onSurfacePop = (x) => { if (Math.random() < 0.3) water.disturb(x, 0.15, 0.1); };
    // the area: scenery, sand, terrain, nodes, the wreck, the mail buoy, the ecosystem
    const a = this.area = buildArea(w, id, (this.seed + idx * 7919) >>> 0);
    this.light.applyLook(a.look);
    a.setLighting(this.light);
    water.sim.setSwell(a.swell);
    POST.uExposure.value = a.look.exposure * (1 - this.scal.darkness);
    const sp = a.spawns.player;
    this.player.sb.place(sp.x, sp.y); this.player.x = sp.x; this.player.y = sp.y;
    this.player.onDeath = () => this.die('dead');
    // mastery + perks on the area's objects
    const wk = a.shipwreck;
    wk.costMul = this.scal.repairCost;
    a.mailbox.interval = a.mailbox.interval / this.scal.mailRate * (this.perks.has('mailbox') ? 0.7 : 1);
    if (wreckSave) {
      for (let i = 0; i < wreckSave.stage && wk.stage < wreckSave.stage; i++) wk.repair(wk.needs());
      wk.paid = { ...wreckSave.paid };
      wk.hp = Math.max(1, Math.min(wk.maxHp, wreckSave.hp));
    }
    // the humans
    const dir = this.dir = new WaveDirector(w, a, { mastery: this.cfg.mastery, nemeses: META.nemeses, seed: (this.seed + idx * 101) >>> 0 });
    // one boss per run: the final area's last wave (the director's own rule would put one on every 5th)
    dir.isBossWave = (n = dir.wave) => n === FINAL_WAVE;
    this.wire();
    this.applyStats();
    this.run.hp = this.player.hp = Math.min(this.player.maxHp, Math.max(1, this.run.hp));
    // camera snap
    this.camLook.set(sp.x, sp.y + 1, 0);
    this.camDist = 16;
    this.resize(this.game.w, this.game.h);
    this.game.post.cut?.();
    // music
    audio.music(a.music);
    this.ambience?.stop(); this.ambience = audio.loop(a.ambience, 0.35);
    // arrival
    this.interMax = INTERMISSION / this.scal.waveSpeed;
    this.interT = this.interMax;
    this.holdT = 0;
    this.setPhase(this.wavesCleared >= areaWaves(idx) ? 'cleared' : 'intermission');
    this.hud.banner(a.name.toUpperCase(), `AREA ${idx + 1} OF ${RUN_AREAS}  ·  ${areaWaves(idx)} WAVES${idx === RUN_AREAS - 1 ? ' + BOSS' : ''}`, '#fff6c8', 4);
    this.player.sb.accel(9 / 0.016, 0, 0.016);
    fx.emit('bubbleBig', sp.x - 1, sp.y, { n: 18, spread: 0.8, speed: 2 });
    if (idx === 0 && this.wavesCleared === 0 && META.runs <= 1) setTimeout(() => w.text.pop('Break rocks for materials. Repair the wreck. Mail loot home.', sp.x + 3, sp.y + 2, 'hint', { size: 0.3, life: 5 }), 1500);
  }

  // ---------------------------------------------------------------- events
  private wire() {
    const w = this.world;
    w.onLoot = (what, x, y) => {
      if (!what.item) return;
      const d = ITEMS[what.item];
      if (!d) return;
      if (d.kind === 'material') { this.bag.push(d.id); this.hud.flashBag(d.id); }
      else {
        this.run.addItem(d.id);
        this.hud.flashBag(d.id);
        w.text.pop('TAB to equip', x, y + 1.1, 'hint', { size: 0.26, life: 2 });
      }
    };
    w.on('waveStart', (d) => {
      this.setPhase('wave');
      this.bossWave = !!d.boss;
      if (d.boss) { this.hud.banner('BOSS WAVE', String(d.bossKind ?? '').toUpperCase(), '#ff6a5a', 3.5); audio.play('boss_growl', { vol: 0.6 }); }
    });
    w.on('waveCleared', () => this.waveCleared());
    w.on('kill', () => { this.tally.kills++; this.run.kills++; });
    w.on('nemesis', (d) => { if (d.promoted && d.line === 'killed you') this.killer = { name: String(d.name), title: String(d.title ?? ''), nemesis: true }; });
    w.on('extract', (d) => this.extracted(d));
    w.on('repair', (d) => {
      this.tally.repairs++;
      const wk = this.area.shipwreck;
      if (d.ready) this.hud.banner('SEAWORTHY!', this.phase === 'cleared' ? 'SET SAIL AT THE WRECK' : 'SURVIVE THE WAVES, THEN SET SAIL', '#aaf08a', 3.2, true);
      else this.hud.banner('WRECK REPAIRED', `STAGE ${wk.stage}/4 · NEXT: ${wk.stageName.toUpperCase()}`, '#ffe7a0', 2.6, true);
      this.save();
    });
    w.on('wreckDestroyed', () => this.die('sunk'));
    w.on('wreckDown', () => this.die('sunk'));
    w.on('sail', () => { if (this.phase === 'sailing') this.toNextArea(); });
    w.on('manatee', (d) => {
      if (d.state === 'arriving') { const mb = this.area.mailbox; w.text.pop('The mail manatee is coming!', mb.x, -1.5, 'hint', { size: 0.32, life: 3 }); }
    });
  }

  private setPhase(p: Phase) { this.phase = p; }

  private startWave() {
    if (this.phase !== 'intermission') return;
    this.holdT = 0;
    this.dir.start(globalWave(this.areaIdx, this.wavesCleared + 1));
    this.setPhase('wave');
  }

  private waveCleared() {
    if (this.phase !== 'wave') return;
    this.wavesCleared++;
    this.tally.waves++;
    if (this.bossWave) this.tally.bosses++;
    // the spoils: gear from the beaten wave (rarer after a boss), more with mastery
    const p = this.player;
    const n = 1 + (this.world.rng.chance(this.scal.lootBonus - 1) ? 1 : 0);
    for (let i = 0; i < n; i++) this.world.drop(p.x + (i - 0.5), p.y + 1.2, { item: this.rollGear(this.bossWave) });
    this.bossWave = false;
    if (this.wavesCleared >= areaWaves(this.areaIdx)) {
      this.setPhase('cleared');
      const wk = this.area.shipwreck;
      this.hud.banner('AREA CLEAR', wk.ready ? 'SET SAIL AT THE WRECK [E]' : 'REPAIR THE WRECK TO SAIL ON', '#ffe7a0', 3.5);
    } else {
      this.setPhase('intermission');
      this.interT = this.interMax;
    }
    this.save();
  }

  /** a gear drop: archetype gear only once its hideout station is built (untagged gear always) */
  private rollGear(boss: boolean): string {
    const arch = new Set<string>(stationPerks().arch);
    const unlocks = new Set(stationPerks().unlocks);
    const ok = (d: ItemDef) => {
      if (d.kind === 'material' || d.craftOnly) return false;
      if (unlocks.has(d.id)) return true;
      const tags = (d.tags ?? []).filter((t) => ARCH.includes(t));
      return !tags.length || tags.some((t) => arch.has(t));
    };
    const pool = (d: ItemDef) => ok(d) && (!boss || d.rarity !== 'common');
    const luck = this.run.stats().luck + (boss ? 2 : 0);
    const id = rollItem(this.world.rng, pool, luck);
    return ITEMS[id] ? id : rollItem(this.world.rng, 'loot', luck);
  }

  private extracted(d: Record<string, unknown>) {
    const ids = (d.items as string[]) ?? [];
    const mats: Record<string, number> = {};
    for (const id of ids) {
      const def = ITEMS[id];
      if (!def) continue;
      if (def.kind === 'material') mats[id] = (mats[id] ?? 0) + 1;
      else {
        const gi = this.pendingGear.findIndex((g) => g.id === id);
        const lvl = gi >= 0 ? this.pendingGear.splice(gi, 1)[0].level ?? 1 : 1;
        stashItem(id, lvl);
      }
    }
    addMaterials(mats);
    META.extractions++;
    this.tally.extracted += ids.length;
    const counts: [string, number][] = [];
    for (const id of ids) { const c = counts.find((x) => x[0] === id); if (c) c[1]++; else counts.push([id, 1]); }
    if (ids.length) {
      const m = this.area.mailbox.manatee;
      this.hud.receipt('SENT HOME', counts, () => this.anchor(m.x, m.y + 1.2, m.z));
    }
    this.save();
  }

  // ---------------------------------------------------------------- actions
  private bagCounts(): Record<string, number> {
    const c: Record<string, number> = {};
    for (const id of this.bag) c[id] = (c[id] ?? 0) + 1;
    return c;
  }
  private looseGear() { return this.run.items.filter((i) => i.gx < 0); }

  private repair() {
    const wk = this.area.shipwreck;
    const took = wk.repair(this.bagCounts());
    const n = Object.values(took).reduce((a, b) => a + b, 0);
    if (!n) { this.world.text.pop('Need other materials', this.player.x, this.player.y + 1, 'hint', { size: 0.28 }); this.world.sfx('k_err1', this.player.x, 0.4); return; }
    for (const [id, k] of Object.entries(took)) for (let i = 0; i < k; i++) { const j = this.bag.indexOf(id); if (j >= 0) this.bag.splice(j, 1); }
    this.world.text.pop(`-${n} materials`, wk.repairPoint.x, wk.repairPoint.y + 1.2, 'gold', { size: 0.3 });
    this.save();
  }

  private extract() {
    const mb = this.area.mailbox;
    const gear = this.looseGear();
    const ids = [...this.bag, ...gear.map((g) => g.id)];
    if (!ids.length) return;
    // empty the bag first: the 'extract' handler saves the run, and must not save what just went home
    const bag = this.bag, items = this.run.items;
    this.pendingGear = gear.map((g) => ({ ...g }));
    this.bag = [];
    this.run.items = items.filter((i) => i.gx >= 0);
    const sent = mb.deposit(ids);
    if (!sent.length) { this.bag = bag; this.run.items = items; }
    this.pendingGear = [];
  }

  private setSail() {
    const wk = this.area.shipwreck;
    if (!wk.sail()) return;
    this.setPhase('sailing');
    this.sailT = 0;
    this.world.god = true;
    this.game.post.letterboxTo?.(1, 1.0);
    this.hud.banner('SET SAIL!', this.areaIdx < RUN_AREAS - 1 ? `NEXT: ${(AREA_LIST.find((x) => x.id === this.areas[this.areaIdx + 1])?.name ?? '').toUpperCase()}` : 'HOME, VICTORIOUS', '#ffe7a0', 3);
    audio.play('jin_legend', { vol: 0.6 });
  }

  /** the wreck is gone over the surface (or the cinematic timed out): fade to the next area / victory */
  private toNextArea() {
    if (this.phase !== 'sailing') return;
    this.setPhase('fade');
    this.game.post.fadeTo?.(1, 1.1, '#000000');
    this.after(1.25, () => {
      if (this.areaIdx >= RUN_AREAS - 1) { this.victory(); return; }
      this.run.hp = this.player.hp;
      this.areaIdx++;
      this.wavesCleared = 0;
      // a breather between areas: +2 half hearts
      this.run.hp = Math.min(this.run.stats().maxHp, this.run.hp + 2);
      this.buildAreaAt(this.areaIdx, null);
      this.save();
      this.game.post.fadeTo?.(0, 1.3);
      this.after(1.2, () => this.game.post.letterboxTo?.(0, 1.2));
    });
  }

  private after(t: number, fn: () => void) { this.seq.push({ t, fn }); }

  // ---------------------------------------------------------------- endings
  private die(kind: Ender) {
    if (this.phase === 'dead' || this.ended) return;
    this.setPhase('dead');
    this.ender = kind;
    this.deadT = 0;
    this.paused = false;
    if (kind === 'sunk') {
      const wk = this.area.shipwreck;
      this.world.text.pop('THE WRECK IS LOST', wk.x, wk.floor + 4, 'danger', { size: 0.7, life: 3.5 });
      this.game.addShake(0.5);
      audio.play('creak3', { vol: 0.8 });
      this.world.god = true;
    }
    audio.music(null, 2);
  }

  private result(outcome: RunResult['outcome'], items: string[]): RunResult {
    return {
      outcome, areaName: this.area?.name ?? '', areaIdx: this.areaIdx, wave: this.wavesCleared + (this.phase === 'wave' || this.phase === 'dead' ? 1 : 0),
      mastery: this.cfg.mastery, items, killer: this.killer, tally: { ...this.tally },
    };
  }

  private endLost() {
    if (this.ended) return;
    this.ended = true;
    // who did it: a fresh nemesis (the director promoted him) or whoever last hurt the blobfish
    if (!this.killer) {
      const b = board(this.world);
      const by = b.lastHurt.by;
      if (this.ender === 'sunk') this.killer = { name: 'The salvage crews', title: 'sank your wreck' };
      else if (by && b.time - b.lastHurt.t < 6) this.killer = { name: by.callsign, title: by.nemesisId ? META.nemeses.find((n) => n.id === by.nemesisId)?.title : undefined, nemesis: !!by.nemesisId };
      else this.killer = { name: 'The deep', title: 'it happens' };
    }
    const lost = [...this.bag, ...this.run.items.map((i) => i.id)];
    META.deaths++;
    META.activeRun = null;
    saveMeta();
    const r = this.result(this.ender === 'sunk' ? 'sunk' : 'dead', lost);
    this.game.timeScale = 1;
    this.onEnd?.(r);
  }

  private victory() {
    if (this.ended) return;
    this.ended = true;
    const home = [...this.bag, ...this.run.items.map((i) => i.id)];
    // everything comes home: the backpack to the stash, the bag's materials to the pile
    returnToStash(this.run.items.map((i) => ({ id: i.id, level: i.level })));
    const mats: Record<string, number> = {};
    for (const id of this.bag) { if (ITEMS[id]?.kind === 'material') mats[id] = (mats[id] ?? 0) + 1; else stashItem(id); }
    addMaterials(mats);
    META.wins++;
    const before = META.masteryUnlocked;
    META.masteryUnlocked = Math.max(META.masteryUnlocked, Math.min(MAX_MASTERY, this.cfg.mastery + 1));
    META.activeRun = null;
    saveMeta();
    const r = this.result('victory', home);
    if (META.masteryUnlocked > before) r.unlocked = META.masteryUnlocked;
    this.onEnd?.(r);
  }

  private quit() {
    this.save();
    this.paused = false;
    this.ended = true;
    this.onQuit?.();
  }

  /** META.activeRun: everything RESUME needs */
  save() {
    if (this.ended || this.phase === 'dead' || !this.area) return;
    const wk = this.area.shipwreck;
    META.activeRun = {
      v: 2, cfg: this.cfg, seed: this.seed, areas: [...this.areas], areaIdx: this.areaIdx, wavesCleared: this.wavesCleared,
      hp: this.player?.hp ?? this.run.hp, items: this.run.items.map((i) => ({ ...i })), nextUid: this.run.nextUid, bag: [...this.bag],
      wreck: { stage: wk.stage, paid: { ...wk.paid }, hp: wk.hp }, tally: { ...this.tally },
    };
    saveMeta();
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const w = this.world, p = this.player, inp = this.game.input, a = this.area;
    if (!w || !a) return;
    // ---- pause (Esc): the world freezes under the pixel menu
    if (inp.hit('pause') && this.phase !== 'dead' && this.phase !== 'fade') { this.paused = !this.paused; audio.play(this.paused ? 'k_open1' : 'k_close1', { vol: 0.5, dry: true }); }
    this.game.cursor = this.paused ? 'none' : 'aim';
    if (this.paused) {
      const c = this.hud.draw(dt, this.hudState(), inp);
      if (c === 'resume') this.paused = false;
      else if (c === 'bag') { this.paused = false; this.openBag(); }
      else if (c === 'quit') this.quit();
      return;
    }
    w.time += dt;
    this.run.time += dt; this.tally.time += dt;
    for (const s of this.seq) s.t -= dt;
    const due = this.seq.filter((s) => s.t <= 0);
    this.seq = this.seq.filter((s) => s.t > 0);
    for (const s of due) s.fn();
    if (this.world !== w) return; // an area change happened
    // ---- the blobfish stays inside the area
    const b = a.bounds;
    if (p.x < b.x0) p.applyForce((b.x0 - p.x) * 140 - Math.min(0, p.vx) * 14, 0);
    if (p.x > b.x1) p.applyForce((b.x1 - p.x) * 140 - Math.max(0, p.vx) * 14, 0);
    if (this.god) { p.hp = p.maxHp; }
    p.update(dt, w);
    for (let i = 0; i < w.entities.length; i++) { const e = w.entities[i]; if (e.alive) e.update(dt, w); }
    for (let i = w.entities.length - 1; i >= 0; i--) {
      const e = w.entities[i];
      if (!e.alive) { e.dispose?.(w); e.obj?.removeFromParent(); w.entities.splice(i, 1); }
    }
    this.dir.update(dt);
    a.update(dt, this.camLook.x);
    w.emit('tick', { dt });
    // ---- phases
    const wk = a.shipwreck;
    if (this.phase === 'intermission') {
      this.interT -= dt;
      if (inp.key('Enter') || inp.key('NumpadEnter')) this.holdT += dt; else this.holdT = Math.max(0, this.holdT - dt * 2);
      if (this.interT <= 0 || this.holdT >= 1) this.startWave();
    } else if (this.phase === 'sailing') {
      this.sailT += dt;
      if (this.sailT > 7) this.toNextArea();
    }
    if (wk.hp <= 0 && this.phase !== 'dead' && this.phase !== 'sailing' && this.phase !== 'fade') this.die('sunk');
    // ---- interactions
    const prompt = this.interact();
    // ---- camera
    this.updateCamera(dt);
    // ---- world systems
    w.water.update(this.game.renderer, dt, this.camLook.x);
    w.fx.update(dt);
    w.text.update(dt);
    // ---- audio + feedback
    audio.listenerX = this.camLook.x;
    audio.setUnderwater(this.camera.position.y < 0.2 ? 0.55 : 0.15);
    const low = p.alive && p.hp <= 2;
    this.heartbeat -= dt;
    if (low && this.heartbeat <= 0) { this.heartbeat = 1.0; audio.play('heartbeat1', { vol: 0.5 }); POST.uPulse.value = 1; }
    POST.uPulse.value *= Math.exp(-dt * 3);
    if (this.phase !== 'dead') POST.uDesat.value = damp(POST.uDesat.value, 0, 3, dt);
    this.run.hp = p.hp;
    // ---- HUD
    this.hud.draw(dt, this.hudState(prompt), inp);
    this.bar.visible = this.phase !== 'dead' && this.phase !== 'fade' && this.phase !== 'sailing';
    this.bar.update(dt, p.skillHud());
    // ---- backpack
    if (inp.hit('bag') && this.phase !== 'dead' && this.phase !== 'fade' && !p.hooked) this.openBag();
    // ---- death
    if (this.deadT >= 0) {
      this.deadT += dt;
      POST.uDesat.value = Math.min(1, this.deadT * 0.5);
      if (this.deadT > 3.2) { this.deadT = -1; this.endLost(); }
    }
  }

  private openBag() {
    if (!this.game.get('backpack')) return;
    this.game.openModal('backpack', {
      run: this.run,
      onClose: () => { this.game.closeModal(); this.installStats(); this.applyStats(); this.save(); },
    });
  }

  /** what [E] / [R] do where the blobfish is; returns the prompt to show */
  private interact(): HudState['prompt'] {
    const p = this.player, inp = this.game.input, a = this.area, wk = a.shipwreck, mb = a.mailbox;
    if (!p.alive || this.phase === 'dead' || this.phase === 'fade' || this.phase === 'sailing') return null;
    const nearWreck = Math.abs(p.x - wk.x) < wk.dims.L * 0.5 + 1.6 && p.y < wk.floor + wk.dims.D + 3.5;
    const nearBuoy = Math.abs(p.x - mb.x) < 4.5 && p.y > -8;
    const needs = wk.needs(), have = this.bagCounts();
    const canPay = Object.keys(needs).some((id) => (have[id] ?? 0) > 0);
    const carried = this.bag.length + this.looseGear().length;
    const E = inp.hit('interact');
    if (nearWreck && wk.ready && this.phase === 'cleared') { if (E) this.setSail(); return { key: 'E', label: 'SET SAIL' }; }
    if (nearWreck && canPay) { if (E) this.repair(); return { key: 'E', label: 'REPAIR WRECK' }; }
    if (mb.canDeposit(p.x, p.y) && carried > 0) { if (E) this.extract(); return { key: 'E', label: `SEND HOME (${carried})` }; }
    if (nearBuoy && mb.manatee.state === 'away') { if (E) { mb.ring(); this.world.text.pop('DING DING!', mb.x, mb.y + 1.6, 'gold', { size: 0.3 }); } return { key: 'E', label: 'RING FOR THE MANATEE' }; }
    if (nearWreck && this.phase === 'intermission') {
      if (inp.keyHit('KeyR')) { this.world.sfx('bell', wk.x, 0.9); this.world.text.pop('ALL HANDS!', wk.x, wk.floor + wk.dims.D + 2, 'danger', { size: 0.4 }); this.startWave(); }
      return { key: 'R', label: "SHIP'S BELL: NEXT WAVE" };
    }
    if (nearWreck && wk.ready && this.phase !== 'cleared') return { key: '·', label: 'BEAT THE WAVES TO SAIL' };
    return null;
  }

  private updateCamera(dt: number) {
    const p = this.player, a = this.area, b = a.bounds, wk = a.shipwreck;
    let tx = p.x + clamp(p.vx * 0.35, -2.5, 2.5), ty = p.y + clamp(p.vy * 0.25, -1.5, 1.5);
    let dist = 15.5;
    if (this.phase === 'sailing' || this.phase === 'fade') {
      const t = Math.min(wk.sailingT, 6);
      tx = wk.x; ty = Math.min(-2, wk.floor + wk.dims.D + t * t * 1.1 * 0.8); dist = 21;
    } else if (p.y > -4.5) { ty = damp(ty, p.y + 1.2, 1, 1); dist = 13.5; }
    const halfW = dist * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect;
    const lo = b.x0 + halfW * 0.55, hi = b.x1 - halfW * 0.55;
    tx = lo < hi ? clamp(tx, lo, hi) : (b.x0 + b.x1) / 2;
    const floor = a.sand.heightAt(tx);
    ty = clamp(ty, floor + 3.2, 1.6);
    this.camDist = damp(this.camDist, dist, 2.5, dt);
    this.camLook.x = damp(this.camLook.x, tx, 4, dt); this.camLook.y = damp(this.camLook.y, ty, 4, dt);
    const sh = this.game.shakeOffset();
    this.camera.position.set(this.camLook.x + sh.x, this.camLook.y + 0.6 + sh.y, this.camDist);
    this.camera.lookAt(this.camLook.x + sh.x * 0.5, this.camLook.y + sh.y * 0.5, 0);
    this.camera.updateMatrixWorld();
    this.light.follow(this.camLook.x, this.camLook.y);
  }

  /** world point -> HUD pixels */
  private anchor(x: number, y: number, z = 0): HudAnchor {
    const v = this.v.set(x, y, z).project(this.camera);
    const ui = this.hud.ui;
    const behind = v.z > 1;
    const sx = (v.x * 0.5 + 0.5) * ui.w, sy = (1 - (v.y * 0.5 + 0.5)) * ui.h;
    return { x: sx, y: sy, behind, on: !behind && sx >= 0 && sx <= ui.w && sy >= 0 && sy <= ui.h };
  }

  private hudState(prompt: HudState['prompt'] = null): HudState {
    const p = this.player, a = this.area, wk = a.shipwreck, mb = a.mailbox, d = this.dir;
    const counts = this.bagCounts();
    return {
      hp: p.hp, maxHp: p.maxHp,
      areaName: a.name, areaIdx: this.areaIdx, areaCount: RUN_AREAS,
      phase: this.phase, wave: this.wavesCleared, waves: areaWaves(this.areaIdx),
      remaining: d.remaining, boss: this.bossWave,
      interT: this.interT, interMax: this.interMax, holdK: Math.min(1, this.holdT),
      bag: Object.entries(counts).sort((x, y) => y[1] - x[1]),
      loose: this.looseGear().map((i) => i.id),
      manatee: { state: mb.manatee.state, eta: mb.eta, wait: mb.waitLeft },
      wreck: {
        hp: wk.hp, maxHp: wk.maxHp, stage: wk.stage, stages: 4, stageName: wk.stageName, needs: wk.needs(), ready: wk.ready,
        at: this.anchor(wk.x, wk.floor + wk.dims.D + 2.4, wk.z * 0.3), dist: Math.abs(wk.x - p.x),
      },
      buoy: { at: this.anchor(mb.x, mb.y + 0.8, -0.6), dist: Math.abs(mb.x - p.x) },
      player: this.anchor(p.x, p.y + 0.5, 0),
      prompt, have: counts, paused: this.paused,
    };
  }
}
