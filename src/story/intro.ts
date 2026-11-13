// The prologue (screen 'intro'): a letterboxed cinematic that turns into a playable tutorial, on the Sunlit Reef.
//
//   a. MORNING   the kid (the player's blobfish at 0.65 scale, no hat, no sword) plays with MOM (rosy, a shell
//                necklace) and DAD (greyer, bigger, a sailor cap). Warm dialogue; the player takes over early
//                ("SWIM ← →" painted in 3D), tags Dad, then Mom.
//   b. BREAD     a boat idles overhead and a slice of bread drifts down on a line. "BREAD!!" / "Wait, sweetie—".
//                The player grabs it: it's a hook. The kid is yanked up (shake, hit-stop); Mom and Dad bite through
//                the line and the kid falls free. A trawl net sweeps in and takes them instead: slow motion,
//                desaturation, muffled sound, their last words, the net hauled up to the boat. Silence.
//   c. TITLE     black stage: "REVENGE." slams down in 3D, then the logo.
//   d. MR. CRAB  a gruff weapon dealer at his junk stall. A choice or two; he hands over the TOOTHPICK
//                ("It ain't much, kid. Neither are you. Yet.") and a hat (DEFAULT_GEAR from here on).
//   e. TUTORIAL  taught by doing, with Mr. Crab scuttling along and commenting: swim + dash through hoops, slash
//                driftwood dummies, get hooked on a test line and struggle (QTE) or cut it, break a resource node,
//                equip gear from the backpack (TAB), ring for MARGE the mail manatee and send the loot home, repair
//                the old sloop, survive a training wave of two weak divers. Then "This is your home now" -> hideout.
//
//   const intro = new IntroScreen(game); intro.onDone = (skipped) => ...; game.register(intro);
//   game.go('intro', { beat?: 'morning' | 'bread' | 'title' | 'crab' | 'tutorial', step?: 1..8 })
//   (?preview=intro&beat=bread / &beat=tutorial&step=4 jumps straight there.)  Hold ESC 1.5 s to skip.
//
// The beats are written as one async script: await this.wait(s) / this.until(fn) / this.talk(lines) all resolve
// from update(), and a skip aborts the whole chain (every pending await rejects with ABORT).
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Input } from '../core/input';
import { Run } from '../game/run';
import { RunWorld } from '../game/runWorld';
import { makeSky } from '../gfx/sky';
import { WaterFX } from '../gfx/water/water';
import { Lighting } from '../gfx/lighting';
import { Particles } from '../gfx/particles';
import { POST } from '../gfx/post';
import { Rng } from '../core/rng';
import { clamp, damp, lerp, smooth, TAU } from '../core/math';
import { audio } from '../audio/audio';
import { Blobfish } from '../player/blobfish';
import { DEFAULT_GEAR } from '../player/gear';
import { BlobPuppet } from '../player/puppet';
import { buildArea, materialId, type Area, type ResourceNode } from '../area';
import { Human, newSquad } from '../waves';
import { FishingLine, type LineSpec } from '../fishing/line';
import { buildBait, buildBobber } from '../fishing/bait';
import { QTE } from '../fishing/qte';
import { makeBoat, makeFisherman, type Vessel, type Fisherman } from '../humans';
import { ITEMS, installItemSystem, skillLevels, abilityLevels, getItem } from '../game/items';
import { addMaterials, stashItem, returnToStash } from '../meta/meta';
import { PixelUI } from '../ui/pixel/ui';
import { Text3DLayer, Float3D, T3D, type Text3D } from '../ui/text3d';
import { HUD_ART } from '../game/runHud';
import { Dialogue, type Line } from './dialogue';
import { sailorCap, shellNecklace, buildBread, Dummy, Hoop, TrawlNet } from './models';
import { MrCrab, CrabShop } from './crab';

export type IntroBeat = 'morning' | 'bread' | 'title' | 'crab' | 'tutorial';
const BEATS: IntroBeat[] = ['morning', 'bread', 'title', 'crab', 'tutorial'];
const ABORT = new Error('intro: aborted');
const SEED = 4242;
const KID_SCALE = 0.65;
const SKIP_HOLD = 1.5;

/** the tutorial's lesson list (HUD card) */
const STEPS: { title: string; keys: [string, string][] }[] = [
  { title: 'SWIM & DASH', keys: [['WASD', 'swim'], ['SPACE', 'dash']] },
  { title: 'SLASH THE DUMMIES', keys: [['LMB', 'slash'], ['J', 'slash']] },
  { title: 'GET OFF THE HOOK', keys: [['SPACE', 'mash'], ['LMB', 'cut line']] },
  { title: 'BREAK A ROCK', keys: [['LMB', 'hit it'], ['', 'grab the loot']] },
  { title: 'EQUIP GEAR', keys: [['TAB', 'backpack'], ['', 'drag it in']] },
  { title: 'MAIL LOOT HOME', keys: [['E', 'ring / send']] },
  { title: 'REPAIR THE WRECK', keys: [['E', 'repair']] },
  { title: 'SURVIVE THE DIVERS', keys: [['LMB', 'fight'], ['SPACE', 'dodge']] },
];
const TEST_LINE: LineSpec = { hp: 2.4, breaking: 999, drag: 999, k: 40, color: '#e8fbff', name: 'test line' };

// ------------------------------------------------------------------ input gate
/**
 * What the blobfish sees as game.input while the intro runs: the real keys for the actions allowed right now,
 * plus scripted ones (the cinematic swims it about, yanks it, holds it still).
 */
class Gate {
  src: Input | null = null;
  allow = new Set<string>();
  ax = { x: 0, y: 0 };
  taps = new Set<string>();
  private none = new Set<string>();
  /** the real input (captured before the gate is swapped in as game.input) */
  base: Input | null = null;
  get mouse() { return this.base!.mouse; }
  get lastMouse() { return this.src && this.allow.has('aim') ? this.src.lastMouse : 0; }
  get lastKeyboard() { return this.src && this.allow.has('aim') ? this.src.lastKeyboard : performance.now(); }
  get down() { return this.src && this.allow.has('keys') ? this.src.down : this.none; }
  get pressed() { return this.src && this.allow.has('keys') ? this.src.pressed : this.none; }
  get released() { return this.src && this.allow.has('keys') ? this.src.released : this.none; }
  axis() { return this.src && this.allow.has('move') ? this.src.axis() : this.ax; }
  hit(a: string) { return this.taps.has(a) || (!!this.src && this.allow.has(a) && this.src.hit(a as never)); }
  held(a: string) { return !!this.src && this.allow.has(a) && this.src.held(a as never); }
  up(a: string) { return !!this.src && this.allow.has(a) && this.src.up(a as never); }
  key(c: string) { return !!this.src && this.allow.has('keys') && this.src.key(c); }
  keyHit(c: string) { return !!this.src && this.allow.has('keys') && this.src.keyHit(c); }
  anyHit() { return false; }
  endFrame() { this.taps.clear(); }
}

/** a scripted swimmer (Mom, Dad): a BlobPuppet steered toward a target, facing its motion like the player */
interface Swimmer { p: BlobPuppet; x: number; y: number; z: number; vx: number; vy: number; tx: number | null; ty: number; speed: number; face: number; flip: number; scale: number; ph: number; held: boolean }

export class IntroScreen implements Screen {
  name = 'intro';
  /** finished (or skipped): the owner goes to the hideout */
  onDone?: (skipped: boolean) => void;

  private worldScene = new THREE.Scene();
  private worldCam = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
  private titleScene = new THREE.Scene();
  private titleCam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private overlay = new THREE.Scene();
  ui = new PixelUI({ targetH: 240 });
  dlg: Dialogue;
  t3d = new Text3DLayer();
  private titleT3d = new Text3DLayer();
  private showTitle = false;
  get scene() { return this.showTitle ? this.titleScene : this.worldScene; }
  get camera() { return this.showTitle ? this.titleCam : this.worldCam; }
  get underwater() { return !this.showTitle; }
  get overlays() { return [{ scene: this.overlay, camera: this.worldCam as THREE.Camera }, this.ui.layer]; }

  // the world
  private run!: Run;
  world!: RunWorld;
  area!: Area;
  kid!: Blobfish;
  private light = new Lighting();
  private mom!: Swimmer; private dad!: Swimmer;
  private crab!: MrCrab;
  private stall!: CrabShop;
  private crabVy = 0;
  private boat: Vessel | null = null;
  private angler: Fisherman | null = null;
  private qte = new QTE();
  private gate: Gate;
  private ambience: ReturnType<typeof audio.loop> | null = null;
  private engine: ReturnType<typeof audio.loop> | null = null;
  // layout
  private home = 0; private crabX = 0; private testX = 0;
  // state
  private time = 0; private clock = 0; private real = 0;
  private control: 'free' | 'script' = 'script';
  private allowAttack = false;
  private bounds: [number, number] | null = null;
  private bag: string[] = [];
  private bagFlash = 0;
  private gen = 0;
  private waits: { fn: () => boolean; res: () => void; rej: (e: unknown) => void }[] = [];
  private skipT = 0;
  private skipStart = -1;
  private skipping = -1;
  private finished = false;
  private step = -1;
  private stepDone = 0;
  private prompt: { key: string; label: string } | null = null;
  private target: { x: number; y: number; label: string } | null = null;
  private crabFollow = false;
  private muffle = 0; private muffleT = 0;
  private cam = { x: 0, y: -6, dist: 12, yaw: 0, h: 0.6 };
  private camFn: () => { x: number; y: number; dist: number; yaw: number; h: number } = () => this.cam;
  private camK = 3;
  private v = new THREE.Vector3();
  private hint = '';
  private hintT = 0;
  private beat0: IntroBeat = 'morning';
  private step0 = 0;
  private tears = 0;
  private wakeT = 0;
  private speed = Math.max(0.1, Number(new URLSearchParams(location.search).get('speed') || 1));
  private dt = 0;
  private desatT = 0;
  private engineK = 0;
  private engineRate = 0;
  private built = false;
  private armed = false;

  constructor(public game: Game) {
    this.gate = new Gate();
    this.dlg = new Dialogue(this.ui, () => this.worldCam);
    this.overlay.add(this.qte.group);
    this.buildTitleStage();
    (window as unknown as { intro: IntroScreen }).intro = this;
  }

  // ================================================================ Screen
  resize(w: number, h: number) {
    for (const c of [this.worldCam, this.titleCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
    const pr = this.game.renderer.getPixelRatio();
    this.ui.resize(w, h, pr);
    this.world?.fx.setPixelScale(h * Math.min(devicePixelRatio || 1, 1.5), this.worldCam.fov);
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as { beat?: IntroBeat; step?: number };
    const q = new URLSearchParams(location.search);
    const beat = (d.beat ?? q.get('beat') ?? 'morning') as IntroBeat;
    this.beat0 = BEATS.includes(beat) ? beat : 'morning';
    this.step0 = clamp(Math.round(Number(d.step ?? q.get('step') ?? 1)) - 1, 0, STEPS.length - 1);
    this.finished = false; this.skipping = -1; this.skipT = 0; this.desatT = 0;
    this.game.timeScale = 1;
    POST.uDesat.value = 0; POST.uPulse.value = 0; POST.uLetterbox.value = 1; POST.uFade.value = 1;
    this.build();
    this.resize(this.game.w, this.game.h);
    this.ui.drawCursor = false;
    this.script(this.beat0, this.step0).catch((e) => { if (e !== ABORT) console.error(e); });
  }

  exit() {
    this.abort();
    this.teardown();
    this.engine?.stop(); this.engine = null;
    this.ambience?.stop(); this.ambience = null;
    this.game.timeScale = 1;
    this.setMuffle(0, true);
    if (audio.ctx && audio.musicBus) audio.musicBus.gain.value = audio.volume.music;
    POST.uDesat.value = 0; POST.uPulse.value = 0; POST.uLetterbox.value = 0; POST.uFade.value = 0;
    this.game.cursor = 'normal';
    this.showTitle = false;
  }

  // ================================================================ build
  private teardown() {
    const w = this.world;
    this.built = false;
    if (!w) return;
    this.area?.dispose();
    w.clear();
    this.kid?.dispose();
    this.light.sun.shadow.dispose();
    this.worldScene.clear();
    this.t3d.clear();
    this.qte.group.visible = false;
  }

  private build() {
    this.teardown();
    this.time = 0; this.clock = 0; this.real = 0;
    this.bag = []; this.step = -1; this.prompt = null; this.target = null; this.crabFollow = false; this.tears = 0;
    this.run = new Run(SEED);
    installItemSystem(this.run);
    // extra point-light slots: the shop's lantern, glow jar and rim light
    this.light = new Lighting(2048, 7);
    const water = new WaterFX(), fx = new Particles(), text = new Float3D(this.t3d);
    this.kid = new Blobfish(0, -8);
    const w = this.world = new RunWorld(this.game, this.run, this.worldScene, this.worldCam, water, fx, text, new Rng(SEED), this.kid);
    this.worldScene.add(makeSky(), water.group, this.light.group, fx.object, this.kid.obj, this.t3d.group);
    this.overlay.clear();
    this.overlay.add(text.group, this.qte.group);
    fx.waterAt = (x) => water.heightAt(x);
    fx.onSurfacePop = (x) => { if (Math.random() < 0.3) water.disturb(x, 0.15, 0.1); };
    const a = this.area = buildArea(w, 'reef', SEED);
    // the prologue's crane shots sit farther out than the run camera: thinner haze and a touch more contrast so the
    // morning reef reads crisp and saturated instead of washed out
    this.light.applyLook({ ...a.look, fogK: (a.look.fogK ?? 0.042) * 0.6, fogNear: (a.look.fogNear ?? 5) + 3, contrast: (a.look.contrast ?? 1) * 1.08, saturation: (a.look.saturation ?? 1) * 1.08, exposure: (a.look.exposure ?? 1) * 0.92 });
    a.setLighting(this.light);
    fx.ambient('reef');
    water.sim.setSwell(a.swell);
    POST.uExposure.value = (a.look.exposure ?? 1) * 0.92;
    // the manatee stays home until the tutorial calls for her
    a.mailbox.eta = 1e6;
    a.shipwreck.costMul = 0.5;
    // the kid: small, no hat, no sword (yet)
    const k = this.kid;
    k.setStats(this.run.stats());
    k.setGear({ hat: 'none', weapon: 'toothpick' });
    k.model.weaponVisible = false;
    this.armed = false;
    k.model.body.scale.setScalar(KID_SCALE);
    k.onDeath = () => { /* the tutorial never kills */ };
    // layout: home near the arrival, Mr. Crab between the wreck and the mail buoy
    this.home = a.spawns.player.x + 3;
    const wx = a.shipwreck.x;
    let best = wx + 18, bs = 1e9;
    for (let x = wx + 15; x <= wx + 22; x += 0.5) { const s = Math.abs(this.floorAt(x + 1.5) - this.floorAt(x - 1.5)) + Math.abs(x - (wx + 18)) * 0.05; if (s < bs) { bs = s; best = x; } }
    this.crabX = best;
    this.testX = this.crabX + 20;
    // Mom and Dad
    const mk = (tint: string, scale: number, x: number, ph: number): Swimmer => {
      const p = new BlobPuppet({ hat: 'none', weapon: 'toothpick' }, 'swim');
      p.onLand = false;
      p.model.weaponVisible = false;
      p.model.bodyMat.color.set(tint);
      (p.model.nose.material as THREE.MeshPhysicalMaterial).color.set(tint);
      this.worldScene.add(p.root);
      return { p, x, y: this.famY(x), z: 0, vx: 0, vy: 0, tx: null, ty: 0, speed: 2.4, face: 1, flip: 1, scale, ph, held: false };
    };
    this.mom = mk('#ffd6de', 1.0, this.home - 2.2, 0);
    this.dad = mk('#c2c0cc', 1.16, this.home + 2.2, 2);
    this.mom.p.model.body.add(shellNecklace());
    this.dad.p.attach('head', sailorCap());
    // Mr. Crab + his stall
    this.crab = new MrCrab();
    this.crab.group.scale.setScalar(0.8);
    this.crab.onPuff = (p) => this.world.fx.emit('bubble', p.x, p.y, { n: 3, spread: 0.04, speed: 0.3, vy: 0.5, size: 0.06 });
    this.stall?.release();
    this.stall = new CrabShop();
    this.stall.group.position.set(this.crabX + 0.3, Math.min(this.floorAt(this.crabX - 1.2), this.floorAt(this.crabX + 1.8)) - 0.05, -2.0);
    this.worldScene.add(this.stall.group, this.crab.group);
    this.stall.setLighting(this.light);
    this.crabOnCounter();
    // the boat (moored far off until the bread beat)
    this.boat = makeBoat('trawler', 7);
    this.boat.setX(this.home + 60);
    this.worldScene.add(this.boat.group);
    this.angler = makeFisherman('oldSalt', 5);
    const seat = this.boat.seats[0];
    if (seat) { seat.add(this.angler.group); this.angler.setSeating(((seat.userData.seating as string) ?? 'stand') as 'stand'); this.angler.setFacing(-1); }
    // events
    w.onLoot = (what, x, y) => {
      if (!what.item) return;
      const d = ITEMS[what.item];
      if (!d) return;
      if (d.kind === 'material') this.bag.push(d.id);
      else { this.run.addItem(d.id); this.t3d.add('TAB TO EQUIP', x, y + 1.3, 0.8, T3D.hint, { size: 0.24, life: 2.2 }); }
      this.bagFlash = 1;
    };
    w.on('extract', (d) => this.extracted(d));
    // speakers
    const at = (fn: () => THREE.Vector3) => fn;
    this.dlg.speaker({ id: 'kid', name: 'BUBBLE', color: '#e0587e', voice: 'squeak', pitch: 1.85, vol: 0.22, anchor: at(() => new THREE.Vector3(this.kid.x, this.kid.y + 0.62, 0)) });
    this.dlg.speaker({ id: 'mom', name: 'MOM', color: '#c84a7a', voice: 'chirp', pitch: 1.3, vol: 0.26, anchor: at(() => this.swimHead(this.mom)), onTalk: () => this.mom.p.sb.poke(0, 1, 0.6) });
    this.dlg.speaker({ id: 'dad', name: 'DAD', color: '#3a5a9a', voice: 'chirp', pitch: 0.78, vol: 0.3, anchor: at(() => this.swimHead(this.dad)), onTalk: () => this.dad.p.sb.poke(0, 1, 0.6) });
    this.dlg.speaker({ id: 'crab', name: 'MR. CRAB', color: '#c8402a', voice: 'crab_click', pitch: 0.9, vol: 0.34, anchor: at(() => this.crab.head()), onTalk: () => { this.crab.talk = 1; } });
    this.dlg.speaker({ id: 'marge', name: 'MARGE', color: '#2a8a8a', voice: 'bub', pitch: 0.85, vol: 0.35, anchor: at(() => { const m = this.area.mailbox.manatee; return new THREE.Vector3(m.x, m.y + 1.3, m.z); }) });
    this.dlg.speaker({ id: 'boat', name: '???', color: '#5a5a62', voice: 'k_tick', pitch: 0.55, vol: 0.3, anchor: at(() => new THREE.Vector3(this.boat?.x ?? 0, 0.8, 0)) });
    this.dlg.speaker({ id: 'narr', name: '', color: '#000000', voice: 'k_tick', pitch: 0.7, vol: 0.12 });
    // music + room tone
    this.ambience?.stop(); this.ambience = audio.loop(a.ambience, 0.3);
    this.engine?.stop(); this.engine = audio.loop('lp_machine', 0, 0.7);
    this.engineK = 0; this.engineRate = 0;
    this.game.post.cut?.();
    this.built = true;
  }

  private buildTitleStage() {
    const s = this.titleScene;
    s.background = new THREE.Color('#030204');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#141016', roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    const key = new THREE.SpotLight('#fff0e0', 5.5, 0, 0.42, 0.55, 0);
    key.position.set(-1.5, 11, 6); key.target.position.set(0, 0.8, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight('#ff4030', 0.7); rim.position.set(5, 3, -6);
    s.add(floor, key, key.target, rim, new THREE.HemisphereLight('#3a3040', '#060306', 0.5), this.titleT3d.group);
    this.titleCam.position.set(0, 1.7, 10); this.titleCam.lookAt(0, 1.3, 0);
  }

  /** Mr. Crab back on his counter, in the shop window */
  private crabOnCounter() {
    this.stall.group.updateMatrixWorld(true);
    const p = this.stall.group.localToWorld(this.stall.counter.clone());
    this.crab.group.position.copy(p);
    this.crabVy = 0;
  }
  /** dev: hold the camera on a fixed framing (screenshots): intro.debugCam(dist, yaw, h, dx, dy) around Mr. Crab */
  debugCam(dist = 4, yaw = 0, h = 0.3, dx = 0, dy = 0.9) {
    const c = this.crab.group.position;
    this.abort();
    this.shot(() => ({ x: c.x + dx, y: c.y + dy, dist, yaw, h }), 50);
    this.letterbox(0, 0.01);
    this.crab.lookX = c.x + Math.sin(yaw) * dist;
  }

  // ================================================================ helpers
  private floorAt(x: number) { return this.world ? this.world.terrain.floorAt(x) : -12; }
  private famY(x: number) { return this.floorAt(x) + 3.4; }
  private swimHead(s: Swimmer) { return new THREE.Vector3(s.x, s.y + 0.55 * s.scale + 0.1, s.z); }
  private place(x: number, y: number) { const k = this.kid; k.sb.place(x, y); k.x = x; k.y = y; k.vx = k.vy = 0; }
  private near(a: { x: number; y: number }, b: { x: number; y: number }, r: number) { return Math.hypot(a.x - b.x, a.y - b.y) < r; }

  private setMuffle(k: number, now = false) { this.muffleT = k; if (now) this.muffle = k; }
  private letterbox(v: number, sec = 0.8) { this.game.post.letterboxTo?.(v, sec); }
  private fade(v: number, sec = 0.8, col = '#000000') { this.game.post.fadeTo?.(v, sec, col); }
  private shot(fn: () => { x: number; y: number; dist: number; yaw: number; h: number }, k = 3) { this.camFn = fn; this.camK = k; }
  private followKid(dist = 11, h = 0.7) {
    this.shot(() => {
      const p = this.kid;
      const fl = this.floorAt(p.x);
      return { x: p.x + clamp(p.vx * 0.3, -2, 2), y: clamp(p.y + 0.6 + clamp(p.vy * 0.2, -1, 1), fl + 2.1, -2.6), dist, yaw: 0, h };
    }, 3);
  }
  private snapCam() { const t = this.camFn(); Object.assign(this.cam, t); }
  /** let the player swim (and optionally fight) */
  private free(attack = false, bounds: [number, number] | null = null) {
    this.control = 'free'; this.allowAttack = attack; this.bounds = bounds;
  }
  private script_(ax = 0, ay = 0) { this.control = 'script'; this.gate.ax = { x: ax, y: ay }; }

  // ---- the coroutine plumbing
  private until(fn: () => boolean): Promise<void> {
    return new Promise((res, rej) => this.waits.push({ fn, res, rej }));
  }
  private wait(sec: number, real = false) {
    const t0 = real ? this.real : this.clock;
    return this.until(() => (real ? this.real : this.clock) - t0 >= sec);
  }
  private async talk(lines: Line[]): Promise<number[]> {
    const g = this.gen;
    const r = await this.dlg.play(lines);
    if (g !== this.gen) throw ABORT;
    return r;
  }
  private abort() {
    this.gen++;
    const ws = this.waits; this.waits = [];
    for (const w of ws) w.rej(ABORT);
    this.dlg.finish();
  }
  private bark(who: string, text: string, life = 2.6) { this.dlg.bark(who, text, life); }
  /** run fn every frame (before the sim) until it returns true or the returned stop() is called */
  private ticker(fn: () => boolean | void): () => void {
    let on = true;
    this.waits.push({ fn: () => !on || fn() === true, res: () => {}, rej: () => {} });
    return () => { on = false; };
  }

  // ================================================================ the script
  private async script(from: IntroBeat, step: number) {
    const i = BEATS.indexOf(from);
    if (i <= 0) await this.morning();
    if (i <= 1) await this.breadBeat();
    if (i <= 2) await this.titleCard();
    if (i <= 3) await this.crabBeat();
    await this.tutorial(i <= 3 ? 0 : step);
    await this.ending();
    this.finish(false);
  }

  // ---------------------------------------------------------------- a. morning
  private async morning() {
    const H = this.home;
    this.place(H - 0.6, this.famY(H) + 0.2);
    this.mom.x = H - 2.4; this.mom.y = this.famY(H) + 0.3; this.dad.x = H + 2.2; this.dad.y = this.famY(H) - 0.1;
    this.script_();
    this.letterbox(1, 0.01);
    audio.music('mu_aquarium', 1.5);
    // the crane: from the bright shallows down onto the family
    const t0 = this.clock;
    const fy = this.famY(H);
    this.shot(() => {
      const k = smooth(0, 7, this.clock - t0);
      return { x: H + lerp(5, 0.4, k), y: lerp(-2.6, fy + 0.2, k), dist: lerp(17, 8.5, k), yaw: lerp(-0.35, 0.18, k), h: lerp(2.4, 0.5, k) };
    }, 6);
    this.snapCam();
    this.fade(0, 2.6);
    // the family plays: the kid zig-zags between Mom and Dad
    let playing = true;
    const play = () => {
      if (!playing) return true;
      const tt = this.clock - t0;
      const side = Math.sin(tt * 0.9);
      this.gate.ax = { x: side > 0 ? 0.7 : -0.7, y: Math.sin(tt * 1.7) * 0.5 };
      this.mom.tx = H - 2.4 + Math.sin(tt * 0.6) * 0.8; this.mom.ty = fy + 0.3 + Math.sin(tt * 0.8) * 0.4;
      this.dad.tx = H + 2.2 + Math.sin(tt * 0.5 + 1) * 0.8; this.dad.ty = fy - 0.1 + Math.sin(tt * 0.7 + 2) * 0.3;
      return false;
    };
    this.ticker(play);
    await this.wait(1.6);
    const title = this.t3d.add('SUNLIT REEF', H + 0.5, fy + 2.4, -2.5, T3D.title, { size: 0.85, stagger: 0.07, enter: 'drop', angle: 0.12 });
    const sub = this.t3d.add('ONE MORNING, LONG AGO', H + 0.5, fy + 1.45, -2.5, T3D.sub, { size: 0.3, delay: 0.9, stagger: 0.025, angle: 0.12 });
    audio.play('jin_arrive', { vol: 0.45, dry: true });
    await this.wait(4.4);
    title.hide(); sub.hide();
    await this.wait(1.2);
    playing = false;
    this.script_();
    this.shot(() => {
      const cx = (this.mom.x + this.dad.x + this.kid.x) / 3;
      return { x: cx, y: (this.mom.y + this.dad.y + this.kid.y) / 3 + 0.3, dist: 8.2, yaw: 0.16, h: 0.45 };
    }, 2.5);
    this.mom.tx = H - 1.6; this.mom.ty = fy + 0.2; this.dad.tx = H + 1.6; this.dad.ty = fy;
    this.mom.p.setExpression('happy'); this.dad.p.setExpression('happy'); this.kid.setExpr('happy', 99);
    const pick = await this.talk([
      { who: 'dad', text: 'Morning, little bubble! Sleep well?' },
      { who: 'kid', text: '...', choices: [
        { text: 'Five more minutes...', then: [{ who: 'mom', text: 'Ha! Not today, sleepyhead. The whole reef is up.' }] },
        { text: 'RACE YOU!', then: [{ who: 'dad', text: 'Oho! {wave}You\'re on,{/wave} champ!' }] },
      ] },
      { who: 'mom', text: 'Stretch those fins first. Swim over to Daddy!' },
    ]);
    void pick;
    // the player takes over: a painted prompt in the reef
    this.letterbox(0.35, 1.2);
    this.free(false, [H - 9, H + 9]);
    this.followKid(9.5, 0.6);
    this.dad.tx = H + 4.2; this.dad.ty = fy + 0.4;
    this.mom.tx = H - 1.2; this.mom.ty = fy + 0.3;
    const swim = this.t3d.add('SWIM ← →', this.kid.x + 0.4, this.kid.y + 1.5, 0.6, T3D.hint, { size: 0.42, stagger: 0.06, angle: 0.3 });
    const wasd = this.t3d.add('W A S D', this.kid.x + 0.4, this.kid.y + 0.95, 0.6, T3D.sub, { size: 0.22, delay: 0.5, angle: 0.3 });
    this.hint = 'WASD / ARROWS: SWIM'; this.hintT = 6;
    await this.until(() => { this.meet(this.dad, H + 4.2, fy + 0.4); return this.near(this.kid, this.dad, 1.35); });
    swim.hide(); wasd.hide();
    this.tag(this.dad);
    this.bark('dad', 'Ha! Fast as a sea slug!', 2.2);
    this.mom.tx = H - 4; this.mom.ty = fy + 0.9;
    await this.wait(0.8);
    this.bark('mom', 'Now tag Mommy!', 2.4);
    await this.until(() => { this.meet(this.mom, H - 4, fy + 0.9); return this.near(this.kid, this.mom, 1.3); });
    this.tag(this.mom);
    this.kid.play('cheer');
    this.bark('mom', 'Got me! Okay, okay, you win.', 2.4);
    await this.wait(2.2);
  }

  /** a game of tag: a little pop, a word and a squish */
  /** a parent playing tag: drifts toward the kid's height when it comes close */
  private meet(s: Swimmer, x: number, y: number) {
    const k = this.kid;
    const d = Math.hypot(k.x - s.x, k.y - s.y);
    s.tx = x; s.ty = d < 4 ? lerp(y, k.y, smooth(4, 1.5, d)) : y;
    if (d < 4) s.tx = lerp(x, k.x, smooth(4, 1.5, d) * 0.5);
  }
  private tag(s: Swimmer) {
    const k = this.kid;
    this.t3d.add('TAG!', (k.x + s.x) / 2, (k.y + s.y) / 2 + 1, 0.8, T3D.gold, { size: 0.42, life: 1.2, rise: 0.8, enter: 'pop' });
    this.world.fx.burst('heart', s.x, s.y + 0.4, 6, 1.4, { vy: 1, life: 1.4 });
    this.world.sfx('boing', s.x, 0.5, 1.3); this.world.sfx('cute', s.x, 0.4);
    s.p.sb.poke(-Math.sign(k.x - s.x), 0, 4);
    s.p.setExpression('cheer');
    k.push(-Math.sign(s.x - k.x) * 1.5, 1);
  }

  // ---------------------------------------------------------------- b. the bread
  private async breadBeat() {
    const H = this.home, fy = this.famY(H);
    const w = this.world, k = this.kid;
    if (this.beat0 === 'bread') { this.place(H - 1, fy + 0.3); this.mom.x = H - 3; this.mom.y = fy + 0.6; this.dad.x = H + 2; this.dad.y = fy; this.letterbox(0.35, 0.01); this.fade(0, 1.2); audio.music('mu_aquarium', 1); }
    this.free(false, [H - 9, H + 9]);
    this.followKid(10, 0.7);
    this.mom.tx = H - 1.8; this.mom.ty = fy + 0.3; this.dad.tx = H + 1.2; this.dad.ty = fy + 0.1;
    // the boat motors in overhead
    const bx = H + 4.8;
    const boat = this.boat!;
    let boatX = H + 26;
    boat.setX(boatX);
    this.engineK = 1;
    this.ticker(() => { boatX = damp(boatX, bx, 0.9, this.dt); boat.setX(boatX); return Math.abs(boatX - bx) < 0.05; });
    await this.wait(3.4);
    this.dad.p.lookAt(new THREE.Vector3(boat.x, 0, 0));
    this.mom.p.lookAt(new THREE.Vector3(boat.x, 0, 0));
    this.letterbox(1, 0.8);
    this.script_();
    // look up from the family at the hull against the bright surface
    this.shot(() => ({ x: lerp(k.x, boat.x, 0.45), y: -3.2, dist: 10.5, yaw: -0.25, h: -4.2 }), 1.6);
    await this.talk([
      { who: 'dad', text: 'Hm. A boat.' },
      { who: 'mom', text: 'They pass by every morning. Stay close to us, sweetie.' },
    ]);
    this.mom.p.lookAt(null); this.dad.p.lookAt(null);
    // a slice of bread on a line, sinking slowly
    const { group: breadG } = buildBread();
    this.worldScene.add(breadG);
    const line = new FishingLine({ hp: 99, breaking: 999, drag: 999, k: 60, color: '#e8fbff', name: 'mono' });
    const tip = new THREE.Vector3();
    this.angler?.rodTip(tip);
    let bxx = bx - 1.2, byy = -0.4;
    const target = fy + 0.4;
    line.reset(tip.x, tip.y, bxx, byy, Math.hypot(tip.x - bxx, tip.y - byy) * 1.05);
    w.add(line);
    this.angler?.play('cast');
    w.fx.splash(bxx, 0.6); w.sfx('splash_s', bxx, 0.5);
    let hooked = false;
    const breadTick = () => {
      this.angler?.rodTip(tip);
      line.tip.set(tip.x, tip.y);
      if (!hooked) {
        byy = damp(byy, target, 0.45, this.dt);
        bxx = bx - 1.2 + Math.sin(this.time * 0.9) * 0.35;
        const len = Math.hypot(tip.x - bxx, tip.y - byy) * 1.03;
        if (line.restLen < len) line.restLen = len;
        line.end = { x: bxx, y: byy };
        breadG.position.set(bxx, byy - 0.05, 0.05);
        breadG.rotation.z = Math.sin(this.time * 1.3) * 0.25;
      }
      return false;
    };
    const stopBread = this.ticker(breadTick);
    this.shot(() => ({ x: lerp(k.x, bxx, 0.5), y: lerp(k.y, byy, 0.5) + 0.5, dist: 9.5, yaw: 0.1, h: 0.2 }), 2);
    await this.until(() => byy < target + 1.6);
    this.kid.setExpr('chomp', 3);
    const word = this.t3d.add('BREAD!!', 0, 0, 0.7, T3D.gold, { size: 0.62, shake: 0.7, stagger: 0.05, follow: () => ({ x: bxx, y: byy + 1 }), angle: -0.15 });
    await this.talk([
      { who: 'kid', text: '{shake}BREAD!!{/shake}', auto: 0.7 },
      { who: 'mom', text: 'Wait, sweetie—', auto: 0.25, speed: 1.4 },
    ]);
    // the player grabs it
    this.letterbox(0.35, 0.6);
    this.free(false, [H - 9, H + 9]);
    this.followKid(9.5, 0.6);
    this.hint = 'SWIM TO THE BREAD'; this.hintT = 8;
    this.target = { x: bxx, y: byy, label: 'BREAD' };
    const tg0 = this.clock;
    await this.until(() => {
      // after a while the kid can't resist
      if (this.clock - tg0 > 14) { this.script_(); this.gate.ax = { x: Math.sign(bxx - k.x), y: clamp((byy - k.y) * 2, -1, 1) }; }
      return this.near(k, { x: bxx, y: byy }, 0.7);
    });
    this.target = null;
    word.hide();
    // ---- HOOKED: the yank
    hooked = true;
    this.script_();
    this.gate.ax = { x: 0, y: 0 };
    const mouth = new THREE.Vector3();
    k.hooked = true;
    k.hook = { pullX: tip.x, pullY: tip.y, tension: 1, line };
    k.setExpr('scared', 2);
    this.game.addShake(0.7); this.game.freeze(0.16); this.game.flash('#ffffff', 0.5);
    w.sfx('hook_clink1', k.x, 1); w.sfx('reel', k.x, 0.8); w.sfx('rope_strain1', k.x, 0.7);
    this.angler?.play('yank');
    this.t3d.add('HOOKED!', k.x, k.y + 1.3, 1, T3D.danger, { size: 0.55, life: 1.4, shake: 0.8, enter: 'slam' });
    k.push(0.4, 4.5);
    this.letterbox(1, 0.3);
    this.shot(() => ({ x: k.x, y: k.y + 0.6, dist: 7.5, yaw: -0.15, h: -0.2 }), 5);
    let yanking = true;
    const yank = () => {
      if (!yanking) return true;
      k.mouthWorld(mouth);
      line.end = { x: mouth.x, y: mouth.y };
      breadG.position.set(mouth.x, mouth.y - 0.08, 0.1);
      line.reel(-this.dt * 1.4);
      const dx = tip.x - k.x, dy = tip.y - k.y, d = Math.hypot(dx, dy) || 1;
      if (k.y < -3.2) k.applyForce((dx / d) * 30, (dy / d) * 30); else k.applyForce(-k.vx * 6, -k.vy * 8);
      if (k.hook) { k.hook.pullX = line.px[Math.max(0, line.n - 2)]; k.hook.pullY = line.py[Math.max(0, line.n - 2)]; }
      if (Math.random() < this.dt * 6) this.game.addShake(0.12);
      if (Math.random() < this.dt * 10) w.fx.emit('bubble', k.x, k.y, { n: 2, spread: 0.2, speed: 1 });
      return false;
    };
    this.ticker(yank);
    await this.talk([{ who: 'kid', text: '{shake}MOM!! DAD!!{/shake}', auto: 0.6 }]);
    // Mom and Dad rush up the line
    this.mom.speed = this.dad.speed = 5.5;
    const above = () => ({ x: line.px[Math.max(0, line.n - 4)], y: line.py[Math.max(0, line.n - 4)] });
    const c0 = this.clock;
    const chase = () => { const a = above(); this.dad.tx = a.x + 0.35; this.dad.ty = a.y; this.mom.tx = a.x - 0.4; this.mom.ty = a.y - 0.2; return this.near(this.dad, a, 0.7) || this.clock - c0 > 3.2; };
    this.dad.p.setExpression('attack'); this.mom.p.setExpression('attack');
    this.bark('dad', '{shake}HOLD ON!{/shake}', 1.4);
    this.shot(() => ({ x: (k.x + this.dad.x) / 2, y: (k.y + this.dad.y) / 2 + 0.4, dist: 8.5, yaw: 0.12, h: 0 }), 4);
    await this.until(chase);
    // CHOMP: the line parts, the kid falls free
    const a = above();
    this.dad.p.setExpression('chomp'); this.mom.p.setExpression('chomp');
    w.sfx('bite', a.x, 1); w.sfx('chomp', a.x, 0.8);
    this.game.freeze(0.12); this.game.addShake(0.35);
    line.snap(Math.max(1, line.n - 4), w, 'bite');
    yanking = false;
    k.hooked = false; k.hook = null;
    k.push(-0.8, -3);
    k.setExpr('dizzy', 1.2);
    this.angler?.play('snapFall');
    // the bread drifts off with the lost end of the line
    let bv = -0.3;
    const stopFall = this.ticker(() => { bv = Math.max(-1.2, bv - this.dt * 0.6); breadG.position.y += bv * this.dt; breadG.rotation.z += this.dt; return breadG.position.y < this.floorAt(breadG.position.x) + 0.2; });
    await this.wait(0.5);
    await this.tragedy(boat);
    stopBread(); stopFall();
    breadG.removeFromParent();
    line.alive = false;
  }

  // ---------------------------------------------------------------- the trawl
  private async tragedy(boat: Vessel) {
    const w = this.world, k = this.kid;
    const pY = (this.mom.y + this.dad.y) / 2;
    this.dad.tx = this.dad.x + 0.3; this.dad.ty = pY; this.mom.tx = this.mom.x - 0.2; this.mom.ty = pY;
    this.mom.speed = this.dad.speed = 1.2;
    // Dad shoves the kid down; the engine roars; the net comes out of the blue
    await this.talk([{ who: 'dad', text: 'Got it! Swim down, bubble — {shake}GO!{/shake}', auto: 0.5 }]);
    this.script_(-0.5, -1);
    k.push(-1.2, -3.2);
    this.engineK = 1.8; this.engineRate = 0.45;
    const net = new TrawlNet();
    net.attachTo(this.worldScene);
    let nx = this.dad.x + 13, ny = pY - 0.1;
    let haul = 0, up = 0;
    const stern = new THREE.Vector3();
    let boatX = boat.x;
    const netTick = () => {
      const dt = this.dt;
      if (haul <= 0) nx -= 3.4 * dt;
      else { up += dt * (0.4 + up * 0.25); ny += up * dt; nx -= 0.6 * dt; }
      boatX -= (haul > 0 ? 1.2 : 2.2) * dt;
      boat.setX(boatX);
      net.group.position.set(nx, ny, -0.2);
      net.group.rotation.z = haul > 0 ? Math.min(0.9, up * 0.5) * -1 : Math.sin(this.time * 0.8) * 0.04;
      stern.set(boat.x + 2.6, 0.2, 0);
      net.tow(stern);
      net.update(dt, haul > 0 ? 0.6 : 1);
      if (Math.random() < dt * 14) w.fx.emit('bubble', nx + Math.random() * 4, ny + (Math.random() - 0.5) * 3, { n: 1, speed: 0.6 });
      return false;
    };
    const stopNet = this.ticker(netTick);
    this.shot(() => ({ x: lerp(this.dad.x, nx, 0.3) - 0.5, y: pY - 0.3, dist: 12.5, yaw: -0.22, h: -1.2 }), 2.5);
    this.mom.p.setExpression('scared'); this.dad.p.setExpression('scared');
    await this.until(() => nx < this.dad.x + 2.5);
    this.bark('mom', '{shake}SWEETIE, GO!{/shake}', 1.4);
    await this.until(() => nx < this.dad.x + 0.6);
    // caught: slow motion, colour drains, sound goes under
    this.game.addShake(0.4);
    w.sfx('net', nx, 1); w.sfx('thud_heavy', nx, 0.6, 0.7);
    this.mom.held = this.dad.held = true;
    this.game.timeScale = 0.32;
    this.setMuffle(1);
    audio.music(null, 2.5);
    audio.play('heartbeat1', { vol: 0.6, dry: true, rate: 0.85 });
    this.letterbox(1, 0.6);
    // the kid swims at the net, too slow, too small
    this.script_(0.6, 0.5);
    k.setExpr('scared', 99);
    const holdIn = () => {
      net.group.updateMatrixWorld(true);
      const pts = [new THREE.Vector3(4.6, 0.25, 0.3), new THREE.Vector3(5.2, -0.25, -0.2)];
      [this.dad, this.mom].forEach((s, i) => {
        const p = net.group.localToWorld(pts[i].clone());
        s.x = damp(s.x, p.x + Math.sin(this.time * 9 + i) * 0.1, 6, this.dt);
        s.y = damp(s.y, p.y + Math.cos(this.time * 7 + i) * 0.1, 6, this.dt);
        s.z = damp(s.z, p.z, 6, this.dt);
        s.p.sb.poke(Math.sin(this.time * 13 + i), Math.cos(this.time * 11), 0.8);
      });
      return false;
    };
    const stopHold = this.ticker(holdIn);
    this.shot(() => ({ x: lerp(k.x, this.dad.x, 0.55), y: lerp(k.y, this.dad.y, 0.5) + 0.2, dist: 10, yaw: 0.2, h: -0.8 }), 1.5);
    await this.talk([{ who: 'kid', text: '{shake}MOM! DAD!{/shake}', auto: 0.8 }]);
    haul = 1;
    w.sfx('rope_creak1', nx, 0.6); w.sfx('chain1', nx, 0.4);
    this.mom.p.setExpression('sad'); this.dad.p.setExpression('brave');
    await this.talk([
      { who: 'dad', text: 'Be brave, little bubble.', auto: 1.2, speed: 0.75 },
      { who: 'mom', text: 'We love you. {wave}Always.{/wave}', auto: 1.4, speed: 0.7 },
    ]);
    this.script_(0, 0.3);
    this.shot(() => ({ x: lerp(k.x, nx, 0.35), y: Math.min(-1.6, lerp(k.y, ny, 0.6)), dist: 13, yaw: -0.15, h: -1.4 }), 1.2);
    await Promise.race([this.until(() => ny > -0.6), this.wait(9)]);
    // gone: a splash far above, the boat motors off
    w.fx.splash(nx, 1.4); w.sfx('splash_b', nx, 0.4);
    net.setVisible(false);
    this.mom.p.root.visible = false; this.dad.p.root.visible = false;
    this.mom.held = this.dad.held = false;
    this.engineK = 0.4; this.engineRate = 0.2;
    stopHold();
    await this.wait(1.2, true);
    // silence
    this.game.timeScale = 1;
    this.script_(0, 0);
    this.engineK = 0;
    this.desatT = 0.85;
    k.setExpr('sad', 99);
    this.tears = 1;
    this.shot(() => ({ x: k.x + 0.2, y: k.y + 0.25, dist: 4.6, yaw: 0.25, h: 0.1 }), 0.8);
    await this.wait(2.4, true);
    await this.talk([
      { who: 'kid', text: '{slow}...Mom?{/slow}', auto: 1.4, speed: 0.6 },
      { who: 'kid', text: '{slow}...Dad?{/slow}', auto: 1.8, speed: 0.6 },
    ]);
    await this.wait(1.2, true);
    this.fade(1, 2.6);
    await this.wait(3, true);
    this.tears = 0;
    stopNet();
    net.dispose();
  }

  // ---------------------------------------------------------------- c. REVENGE + logo
  private async titleCard() {
    POST.uFade.value = 1;
    this.showTitle = true;
    this.setMuffle(0, true);
    const desat = POST.uDesat.value;
    POST.uDesat.value = 0;
    this.fade(0, 0.6);
    this.titleCam.position.set(0, 1.7, 11); this.titleCam.lookAt(0, 1.3, 0);
    const push = () => { this.titleCam.position.z = damp(this.titleCam.position.z, 9.2, 0.35, this.dt); this.titleCam.lookAt(0, 1.3, 0); return !this.showTitle; };
    this.ticker(push);
    await this.wait(0.5, true);
    const rev = this.titleT3d.add('REVENGE.', 0, 1.5, 0, T3D.blood, {
      size: 0.88, stagger: 0.16, enter: 'slam', bob: 0.02, angle: -0.18, face: 0.2,
      onLand: (i) => { audio.play(i === 7 ? 'boom_uw1' : 'thud_heavy', { vol: 0.7, dry: true, rate: 0.7 + i * 0.03 }); this.game.addShake(0.15); },
    });
    await this.wait(3.6, true);
    rev.hide();
    await this.wait(0.9, true);
    const logo = this.titleT3d.add('BLOBFISH', 0, 2.0, 0, T3D.logo, { size: 1.0, stagger: 0.06, enter: 'drop', angle: 0.16, face: 0.3, onLand: () => audio.play('boing', { vol: 0.35, dry: true, rate: 1.4 }) });
    const sub = this.titleT3d.add('REEL REBELLION', 0, 0.95, 0.3, T3D.sub, { size: 0.42, delay: 0.7, stagger: 0.04, angle: 0.16, face: 0.3 });
    audio.play('jin_legend', { vol: 0.5, dry: true });
    await this.wait(3.6, true);
    logo.hide(); sub.hide();
    await this.wait(0.6, true);
    this.fade(1, 0.8);
    await this.wait(0.9, true);
    this.titleT3d.clear();
    this.showTitle = false;
    POST.uDesat.value = Math.min(desat, 0.55);
    this.desatT = 0.55;
  }

  // ---------------------------------------------------------------- d. Mr. Crab
  private async crabBeat() {
    const k = this.kid, cx = this.crabX;
    this.mom.p.root.visible = false; this.dad.p.root.visible = false;
    this.boat?.setX(this.home + 200);
    this.place(cx - 9, this.floorAt(cx - 9) + 2.6);
    k.setExpr('sad', 99);
    this.letterbox(1, 0.01);
    this.script_(0.55, 0);
    this.shot(() => ({ x: lerp(k.x, cx, 0.4), y: this.floorAt(cx) + 2.3, dist: 10, yaw: 0.22, h: 0.5 }), 2);
    this.snapCam();
    this.fade(0, 2.2);
    audio.music('mu_junkyard', 2.5);
    this.crab.lookX = k.x;
    await this.talk([{ who: 'narr', text: 'The kid swam until the reef ran out of colour.', auto: 1.6 }]);
    this.crabOnCounter();
    const name = this.t3d.add('MR. CRAB', 0, 0, 0, T3D.name, { size: 0.36, angle: 0.25, delay: 0.3, follow: () => { const g = this.crab.group.position; return { x: g.x, y: g.y + 1.55, z: g.z + 0.5 }; } });
    this.letterbox(0.35, 0.8);
    this.free(false, [cx - 14, cx + 4]);
    this.followKid(10, 0.7);
    this.hint = 'SWIM TO THE STALL'; this.hintT = 6;
    await this.until(() => k.x > cx - 3.4);
    name.hide();
    this.script_();
    // the kid drifts up to the shop window
    const cp = this.crab.group.position;
    this.ticker(() => { if (this.control !== 'script' || this.step >= 0) return true; const dx = cp.x - 1.7 - k.x, dy = cp.y + 0.85 - k.y; this.gate.ax = { x: clamp(dx * 0.8, -0.6, 0.6), y: clamp(dy * 0.8, -0.6, 0.6) }; return false; });
    this.letterbox(1, 0.6);
    this.desatT = 0;
    this.shot(() => ({ x: lerp(k.x, cp.x, 0.62), y: cp.y + 0.6, dist: 5.3, yaw: -0.16, h: 0.2 }), 2.5);
    this.crab.lookX = k.x;
    const p1 = await this.talk([
      { who: 'crab', text: 'Oi. Shop\'s closed.' },
      { who: 'crab', text: '...You\'re the Bubble kid. Heard about your folks. {p=0.3}Rotten business.' },
      { who: 'kid', text: '...', choices: [{ text: 'I want revenge.' }, { text: 'I need a weapon.' }, { text: '...Do you have bread?' }] },
    ]);
    if (p1[0] === 0) await this.talk([{ who: 'crab', text: 'Revenge, huh. {gold}Big{/gold} word for a small fish.' }]);
    else if (p1[0] === 1) await this.talk([{ who: 'crab', text: 'Everybody wants a weapon. Few know which end to hold.' }]);
    else await this.talk([{ who: 'crab', text: '{shake}NO.{/shake} No bread. Bread\'s how they get you, kid. {grey}Bread\'s how they got my brother.{/grey}' }]);
    await this.talk([
      { who: 'crab', text: 'Humans took my left claw once. Grew a new one. It\'s smaller. {p=0.3}We don\'t talk about it.' },
      { who: 'crab', text: 'Here.', do: () => this.crab.snip() },
    ]);
    // the toothpick
    k.setGear({ ...DEFAULT_GEAR });
    k.model.weaponVisible = true;
    this.armed = true;
    k.play('gearUp');
    k.setExpr('cheer', 1.4);
    this.world.fx.burst('star', k.x, k.y + 0.4, 10, 2.5);
    this.world.fx.pickup(k.x, k.y + 0.3, '#ffe08a');
    audio.play('jin_rare1', { vol: 0.6, dry: true }); audio.play('sw_swish1', { vol: 0.5, dry: true, rate: 1.2 });
    this.t3d.add('TOOTHPICK SWORD', k.x, k.y + 1.7, 0.6, T3D.item, { size: 0.36, life: 3.2, stagger: 0.03, angle: 0.2 });
    await this.wait(1.4);
    const p2 = await this.talk([
      { who: 'crab', text: 'It ain\'t much, kid. Neither are you. {shake}Yet.{/shake}' },
      { who: 'crab', text: 'And a hat. Every fighter needs one. So does every idiot. Same thing, mostly.' },
      { who: 'kid', text: '...', choices: [{ text: 'Thank you, Mr. Crab.' }, { text: 'It\'s a toothpick.' }] },
    ]);
    await this.talk(p2[0] === 0
      ? [{ who: 'crab', text: 'Don\'t thank me. Pay me. Later. With {gold}interest{/gold}.' }]
      : [{ who: 'crab', text: 'And you\'re a blobfish. {wave}Make it work.{/wave}' }]);
    await this.talk([{ who: 'crab', text: 'Now. Let\'s see if you can swing it without poking your own eye out. Follow me.' }]);
    k.setExpr('brave', 0.1);
  }

  // ---------------------------------------------------------------- e. the tutorial
  private async tutorial(from: number) {
    const k = this.kid;
    if (this.beat0 === 'tutorial') {
      this.mom.p.root.visible = false; this.dad.p.root.visible = false;
      this.boat?.setX(this.home + 200);
      k.setGear({ ...DEFAULT_GEAR });
      k.model.weaponVisible = true;
      this.armed = true;
      const sx = [this.crabX - 1, this.crabX + 3, this.crabX + 9, this.crabX + 16, this.crabX + 19, this.crabX + 22, this.area.shipwreck.x + 6, this.area.shipwreck.x + 5][from];
      this.place(sx, this.floorAt(sx) + 2.2);
      if (from > 0) { this.crab.group.position.set(sx - 3, this.floorAt(sx - 3) - 0.05, -0.45); }
      this.fade(0, 1);
      audio.music('mu_shallows', 1.5);
    } else audio.music('mu_shallows', 3);
    this.letterbox(0, 1);
    this.free(true, null);
    this.followKid(11.5, 0.7);
    if (!this.crabFollow) this.crabVy = 3.2;
    this.crabFollow = true;
    const steps = [() => this.lessonSwim(), () => this.lessonSlash(), () => this.lessonHook(), () => this.lessonNode(), () => this.lessonBag(), () => this.lessonMail(), () => this.lessonRepair(), () => this.lessonWave()];
    for (let i = from; i < steps.length; i++) {
      this.step = i; this.stepDone = 0;
      await steps[i]();
      this.stepDone = 1;
      audio.play('jin_good', { vol: 0.5, dry: true });
      await this.wait(1.0);
    }
    this.step = STEPS.length;
  }

  private async lessonSwim() {
    const cx = this.crabX, w = this.world, k = this.kid;
    const hoops = [new Hoop(cx + 5, this.floorAt(cx + 5) + 2.4), new Hoop(cx + 9.5, this.floorAt(cx + 9.5) + 3.6)];
    for (const h of hoops) this.worldScene.add(h.group);
    const dash = this.t3d.add('DASH: SPACE', hoops[0].x, hoops[0].y + 1.7, 0.3, T3D.hint, { size: 0.38, angle: 0.3 });
    this.bark('crab', 'Rings. Swim through \'em. No — {shake}DASH{/shake} through \'em! SPACE!', 3.2);
    let warned = 0;
    await this.until(() => {
      for (const h of hoops) {
        h.update(this.dt);
        if (h.passed) continue;
        if (h.check(k.x, k.y)) {
          const sp = Math.hypot(k.vx, k.vy);
          if (sp > 6.2) {
            h.celebrate();
            w.sfx('pop', h.x, 0.7, 1.2); w.sfx('jin_catch', h.x, 0.4);
            w.fx.burst('star', h.x, h.y, 10, 3); w.fx.emit('bubbleBig', h.x, h.y, { n: 12, spread: 0.8, speed: 2 });
            this.t3d.add(hoops.filter((x) => x.passed).length === 1 ? 'WHOOSH!' : 'ZOOM!', h.x, h.y + 1.1, 0.6, T3D.gold, { size: 0.42, life: 1, rise: 0.7 });
          } else if (this.clock - warned > 2.5) { warned = this.clock; this.bark('crab', 'Faster! {shake}DASH!{/shake} Hit SPACE as you go through!', 2.4); }
        }
      }
      return hoops.every((h) => h.passed);
    });
    dash.hide();
    this.bark('crab', 'Hah. Slippery little thing.', 2.2);
    await this.wait(0.8);
    for (const h of hoops) h.group.removeFromParent();
  }

  private async lessonSlash() {
    const cx = this.crabX, w = this.world;
    const names = ['GARY', 'DOUG', 'BRENDA'];
    const lines = ['Ha! So long, Gary!', 'Doug never saw it coming.', 'Brenda had that coming.'];
    const ds: Dummy[] = [];
    const tags: Text3D[] = [];
    names.forEach((n, i) => {
      const x = cx + 12.5 + i * 1.7;
      const d = new Dummy(n, x, this.floorAt(x), i + 1);
      d.onBreak = () => {
        w.drop(d.x, d.y + 0.3, { item: materialId('driftwood') });
        tags[i]?.hide();
        this.t3d.add(['TIMBER!', 'SPLINTERED!', 'KINDLING!'][i], d.x, d.y + 1.4, 0.6, T3D.gold, { size: 0.38, life: 1.2, rise: 0.6 });
        this.bark('crab', lines[i], 2.2);
      };
      w.add(d);
      ds.push(d);
      tags.push(this.t3d.add(n, x, this.floorAt(x) + 1.95, 0.25, T3D.name, { size: 0.22, delay: 0.2 + i * 0.25, angle: 0.2 }));
    });
    const hint = this.t3d.add('SLASH: CLICK / J', cx + 14.2, this.floorAt(cx + 14) + 3.0, 0.3, T3D.hint, { size: 0.34, angle: 0.25 });
    this.bark('crab', 'These are humans. Well. Driftwood. Same brains. Hit \'em!', 3);
    this.target = { x: cx + 14, y: this.floorAt(cx + 14) + 1, label: 'DUMMIES' };
    await this.until(() => { if (this.target && this.kid.x > cx + 10) this.target = null; return ds.every((d) => !d.alive); });
    this.target = null;
    hint.hide();
  }

  private async lessonHook() {
    const w = this.world, k = this.kid;
    const x = this.testX, hy = this.floorAt(x) + 3.2;
    const float = buildBobber();
    float.position.set(x, 0, 0.05);
    float.scale.setScalar(2.2);
    this.worldScene.add(float);
    const bait = buildBait('worm');
    bait.group.scale.setScalar(2);
    this.worldScene.add(bait.group);
    const line = new FishingLine(TEST_LINE);
    line.reset(x, -0.02, x, hy, -hy + 0.1);
    w.add(line);
    let hooked = false, free = false;
    line.onSnap = () => { free = true; };
    const sign = this.t3d.add('BITE?', x, hy + 1.2, 0.4, T3D.hint, { size: 0.36, angle: -0.2 });
    this.target = { x, y: hy, label: 'TEST LINE' };
    this.bark('crab', 'Humans fish with hooks. You\'ll get hooked. Everybody does. So: practice. {wave}Bite the worm.{/wave}', 4);
    const mouth = new THREE.Vector3();
    let qteOn = false;
    const startQte = () => {
      qteOn = true;
      this.qte.group.visible = true;
      this.qte.start('mash', (r) => {
        qteOn = false;
        if (free) return;
        if (r.ok) line.snap(Math.max(1, line.n - 3), w, 'struggle');
        else { this.bark('crab', 'Harder! {shake}MASH IT!{/shake}', 1.6); startQte(); }
      }, { dur: 5 });
    };
    await this.until(() => {
      const wy = w.water.heightAt(x);
      float.position.y = wy + Math.sin(this.time * 2) * 0.03 - (hooked ? 0.12 : 0);
      line.tip.set(x, wy - 0.02);
      if (!hooked) {
        const ex = x + Math.sin(this.time * 1.3) * 0.15, ey = hy + Math.sin(this.time * 2.1) * 0.12;
        line.end = { x: ex, y: ey };
        bait.group.position.set(ex, ey, 0.05);
        bait.tick(this.time, 0.3);
        k.mouthWorld(mouth);
        if (!free && (Math.hypot(mouth.x - ex, mouth.y - ey) < 0.55 || Math.hypot(k.x - ex, k.y - ey) < 0.6)) {
          hooked = true;
          sign.hide();
          this.target = null;
          k.hooked = true;
          k.hook = { pullX: x, pullY: wy, tension: 1, line };
          k.setExpr('strain', 1);
          w.sfx('hook_clink1', k.x, 0.9); w.sfx('reel', k.x, 0.6);
          this.game.addShake(0.3); this.game.freeze(0.08);
          this.t3d.add('HOOKED!', k.x, k.y + 1.2, 0.9, T3D.danger, { size: 0.45, life: 1.2, shake: 0.6, enter: 'slam' });
          this.bark('crab', '{shake}NOW!{/shake} Mash SPACE to wriggle free — or cut the line!', 3.2);
          this.hint = 'MASH SPACE / SLASH THE LINE'; this.hintT = 6;
          startQte();
        }
      } else if (!free) {
        k.mouthWorld(mouth);
        line.end = { x: mouth.x, y: mouth.y };
        bait.group.position.set(mouth.x, mouth.y, 0.1);
        const dx = x - k.x, dy = wy - k.y, d = Math.hypot(dx, dy) || 1;
        if (k.y < -2) k.applyForce((dx / d) * 13, (dy / d) * 13);
        line.reel(-this.dt * 0.4);
        if (k.hook) { k.hook.pullX = line.px[Math.max(0, line.n - 2)]; k.hook.pullY = line.py[Math.max(0, line.n - 2)]; }
        if (qteOn) this.qte.update(this.dt, this.game.input, k.x, k.y, this.time);
      }
      return free;
    });
    k.hooked = false; k.hook = null;
    if (this.qte.active) this.qte.update(1, this.game.input, k.x, k.y, this.time);
    this.qte.group.visible = false;
    this.t3d.add('FREE!', k.x, k.y + 1.1, 0.9, T3D.gold, { size: 0.5, life: 1.3, rise: 0.8 });
    w.fx.burst('star', k.x, k.y + 0.3, 10, 3);
    this.bark('crab', 'See? Hooks are just rude questions. Answer with violence.', 3);
    // the float bobs off, the worm sinks
    this.ticker(() => { bait.group.position.y -= this.dt * 0.6; if (bait.group.position.y < this.floorAt(x)) { bait.group.removeFromParent(); return true; } });
    await this.wait(1.2);
    float.removeFromParent();
  }

  private async lessonNode() {
    const k = this.kid;
    const want = this.testX + 3;
    const ok = (n: ResourceNode) => n.alive && !n.gone && !n.buried && n.node !== 'clam' && n.node !== 'kelp';
    const nodes = this.area.nodes.filter(ok).sort((a, b) => Math.abs(a.x - want) - Math.abs(b.x - want));
    const node = nodes[0];
    if (!node) return;
    let broke = false;
    const off = () => { /* listener */ };
    this.world.on('resource', (d) => { if (Math.abs((d.x as number) - node.x) < 1.5) broke = true; });
    void off;
    const sign = this.t3d.add('BREAK IT!', node.x, node.y + 1.6, 0.4, T3D.hint, { size: 0.38, angle: 0.2 });
    this.target = { x: node.x, y: node.y + 0.5, label: 'ROCK' };
    this.bark('crab', 'Rocks, clams, crates: they\'re full of good stuff. Smash that one!', 3.2);
    const bag0 = this.bag.length;
    await this.until(() => broke);
    sign.hide();
    this.target = null;
    this.hint = 'GRAB THE LOOT'; this.hintT = 4;
    await Promise.race([this.until(() => this.bag.length > bag0 + 1), this.wait(6)]);
    this.bark('crab', 'Loot! It goes in your bag. Lose it if you die, so don\'t.', 3);
    void k;
  }

  private async lessonBag() {
    const k = this.kid, w = this.world;
    const c = this.crab.group.position;
    this.bark('crab', 'Catch!', 1.4);
    this.crab.snip();
    w.drop(c.x + 0.6, c.y + 1.2, { item: 'plumedHelm' });
    w.sfx('swish_a', c.x, 0.6);
    await Promise.race([this.until(() => this.run.items.some((i) => i.id === 'plumedHelm')), this.wait(5)]);
    if (!this.run.items.some((i) => i.id === 'plumedHelm')) this.run.addItem('plumedHelm');
    const sign = this.t3d.add('TAB: BACKPACK', k.x, k.y + 1.6, 0.8, T3D.hint, { size: 0.36, angle: 0.25, follow: () => ({ x: this.kid.x - k.x, y: this.kid.y - k.y }) });
    this.bark('crab', 'Gear only works IN the backpack. Hit TAB, drag it in.', 3.5);
    this.hint = 'TAB: OPEN THE BACKPACK'; this.hintT = 99;
    let nag = this.clock;
    await this.until(() => {
      const placed = this.run.items.some((i) => i.id === 'plumedHelm' && i.gx >= 0);
      if (!placed && this.clock - nag > 12) { nag = this.clock; this.bark('crab', 'TAB, kid. Then drag the helm into the bag.', 3); }
      return placed && this.game.modal === null;
    });
    this.hintT = 0;
    sign.hide();
    this.t3d.add('PLUMED HELM', k.x, k.y + 1.5, 0.8, T3D.item, { size: 0.32, life: 1.8, rise: 0.4 });
    this.bark('crab', 'Snazzy. Very... {wave}plumed.{/wave}', 2.6);
  }

  private async lessonMail() {
    const mb = this.area.mailbox, k = this.kid;
    const sign = this.t3d.add('MAIL BUOY', mb.x, -1.4, -0.4, T3D.name, { size: 0.36, angle: -0.2 });
    this.target = { x: mb.x, y: -2.5, label: 'MAIL' };
    this.bark('crab', 'Your bag\'s heavy. Mail it home: ring the bell at the buoy and the manatee comes.', 4);
    const mailing = { greeted: false };
    let sent = false;
    this.world.on('extract', () => { sent = true; });
    await this.until(() => {
      if (!mailing.greeted && mb.present && this.near(k, mb.manatee, 5)) { mailing.greeted = true; this.greet().catch(() => {}); }
      if (Math.abs(k.x - mb.x) < 8) this.target = null;
      return sent;
    });
    sign.hide();
    this.target = null;
    await this.wait(1.4);
    this.bark('marge', 'It\'ll be waiting for you, hon. I always find the way.', 3);
    await this.wait(1.6);
  }
  private async greet() {
    if (this.dlg.blocking) return;
    this.script_();
    await this.talk([
      { who: 'marge', text: 'Mornin\', hon! Parcel for... {p=0.2}home? Where\'s home?' },
      { who: 'kid', text: '...I don\'t have one anymore.' },
      { who: 'marge', text: 'Oh, sweetie. {p=0.3}Then I\'ll hold it for you \'til you do.' },
    ]);
    this.free(true, null);
  }

  private async lessonRepair() {
    const wk = this.area.shipwreck, k = this.kid, w = this.world;
    const sign = this.t3d.add('THE OLD SLOOP', wk.x, wk.floor + wk.dims.D + 3.2, -0.5, T3D.name, { size: 0.5, angle: 0.15 });
    this.target = { x: wk.x, y: wk.floor + 2, label: 'WRECK' };
    this.bark('crab', 'That old sloop\'s yours now. Fix her up. Humans hate anything that floats without asking.', 4);
    await this.until(() => Math.abs(k.x - wk.x) < wk.dims.L * 0.5 + 3);
    this.target = null;
    // he chips in what the first patch needs
    const need = wk.needs();
    let i = 0;
    for (const [id, n] of Object.entries(need)) for (let j = 0; j < n; j++) w.drop(k.x + 1 + (i++ % 3) * 0.4, k.y + 1, { item: id });
    this.bark('crab', 'Here. Patch her with these. Don\'t tell nobody I\'m soft.', 3);
    const stage0 = wk.stage;
    await this.until(() => wk.stage > stage0);
    sign.hide();
    this.t3d.add('WRECK REPAIRED', wk.x, wk.floor + wk.dims.D + 2.4, 0.2, T3D.gold, { size: 0.6, life: 2.6, enter: 'drop' });
  }

  private async lessonWave() {
    const w = this.world, wk = this.area.shipwreck, k = this.kid;
    this.bark('crab', 'Uh-oh. Company. Two rookies. Show \'em what a toothpick does.', 3.4);
    await this.wait(1.6);
    this.t3d.add('TRAINING WAVE', k.x, k.y + 2.3, 0.6, T3D.danger, { size: 0.62, life: 2.4, enter: 'drop', stagger: 0.05 });
    audio.play('boss_growl', { vol: 0.35, dry: true, rate: 1.4 });
    const sq = newSquad();
    const side = k.x < wk.x ? -1 : 1;
    const hs: Human[] = [];
    (['spear', 'harpoon'] as const).forEach((role, i) => {
      const x = wk.x + side * (10 + i * 2.5);
      const y = Math.max(this.floorAt(x) + 2.2, -6);
      const h = new Human(role, x, y, sq, this.area, wk, { hpMul: 0.45, dmgMul: 0.5, iq: 0.12, seed: 1 + i, reloadMul: 1.6 });
      w.add(h);
      h.mountTag(this.worldScene);
      hs.push(h);
      w.fx.emit('bubbleBig', x, y, { n: 10, spread: 0.6, speed: 1.5 });
    });
    this.target = { x: hs[0].x, y: hs[0].y, label: 'DIVERS' };
    await this.until(() => {
      const left = hs.filter((h) => h.alive && h.state !== 'dead' && h.state !== 'escaped');
      if (left[0]) { this.target = Math.abs(left[0].x - k.x) > 9 ? { x: left[0].x, y: left[0].y, label: 'DIVERS' } : null; }
      // training: the blobfish can't die
      if (k.hp <= 2) { w.god = true; k.hp = Math.max(k.hp, 1); } else w.god = false;
      return left.length === 0;
    });
    this.target = null;
    w.god = false;
    this.t3d.add('WAVE CLEARED', k.x, k.y + 2, 0.6, T3D.gold, { size: 0.7, life: 2.6, enter: 'drop' });
    w.sfx('jin_good', k.x, 0.7);
  }

  // ---------------------------------------------------------------- the end
  private async ending() {
    const k = this.kid;
    await this.wait(1.6);
    for (const t of this.t3d.items) t.hide();
    this.step = -1;
    this.crabFollow = false;
    this.script_();
    this.letterbox(1, 0.8);
    this.crab.group.position.set(k.x - 2.8, this.floorAt(k.x - 2.8) - 0.05, -0.45);
    this.crab.lookX = k.x;
    this.shot(() => ({ x: k.x - 1.4, y: Math.max(k.y, this.floorAt(k.x) + 1.6) + 0.2, dist: 7.5, yaw: 0.25, h: 0.3 }), 2);
    k.setExpr('brave', 99);
    const p = await this.talk([
      { who: 'crab', text: 'Not bad, kid. {p=0.2}Not bad at all.' },
      { who: 'crab', text: 'You\'ll be back for better steel. I\'ll be here. Overcharging.' },
      { who: 'kid', text: '...', choices: [{ text: 'Where do I go now?' }, { text: 'I\'m going to find them.' }] },
    ]);
    await this.talk(p[0] === 0
      ? [{ who: 'crab', text: 'There\'s a cave behind the reef. Was my brother\'s. {p=0.3}He won\'t be needing it.' }]
      : [{ who: 'crab', text: 'Course you are. But first you sleep. There\'s a cave behind the reef. It\'s yours.' }]);
    await this.talk([{ who: 'crab', text: 'Sofa\'s lumpy. TV gets one channel. Come on.' }]);
    audio.music(null, 2.5);
    this.fade(1, 2);
    await this.wait(2.3, true);
  }

  private finish(skipped: boolean) {
    if (this.finished) return;
    this.finished = true;
    // achievements etc.: the world bus (run.fire) and a DOM event, both 'prologueDone' {skipped}
    try { this.world?.emit('prologueDone', { skipped }); } catch { /* torn down */ }
    window.dispatchEvent(new CustomEvent('blobfish:prologueDone', { detail: { skipped } }));
    if (!skipped) {
      // what the kid carried goes home: gear to the stash, materials to the pile
      const mats: Record<string, number> = {};
      for (const id of this.bag) if (ITEMS[id]) mats[id] = (mats[id] ?? 0) + 1;
      addMaterials(mats);
      returnToStash(this.run.items.filter((i) => ITEMS[i.id]).map((i) => ({ id: i.id, level: i.level })));
    }
    this.onDone?.(skipped);
  }

  private extracted(d: Record<string, unknown>) {
    const ids = (d.items as string[]) ?? [];
    const mats: Record<string, number> = {};
    for (const id of ids) {
      const def = ITEMS[id];
      if (!def) continue;
      if (def.kind === 'material') mats[id] = (mats[id] ?? 0) + 1; else stashItem(id);
    }
    addMaterials(mats);
    if (ids.length) this.t3d.add('SENT HOME', this.area.mailbox.manatee.x, this.area.mailbox.manatee.y + 2, 0, T3D.gold, { size: 0.5, life: 2.2, rise: 0.5 });
  }

  // ================================================================ frame
  update(dt: number) {
    const g = this.game, inp = g.input;
    // dev: &speed=N runs the prologue N times faster (testing under software GL)
    dt *= this.speed;
    this.dt = dt;
    const real = g.timeScale > 0 ? Math.min(0.05 * this.speed, dt / g.timeScale) : dt;
    this.time += dt; this.clock += dt; this.real += real;
    this.ui.begin(inp, real);
    // ---- skip: hold ESC
    if (this.skipping < 0) {
      // wall-clock hold (frame dt is capped, so a slow machine would otherwise need a much longer hold)
      if (inp.key('Escape')) {
        const now = performance.now();
        if (this.skipStart < 0) this.skipStart = now - this.skipT * 1000;
        this.skipT = (now - this.skipStart) / 1000;
        if (this.skipT >= SKIP_HOLD) this.skip();
      } else { this.skipStart = -1; this.skipT = Math.max(0, this.skipT - real * 3); }
    } else {
      this.skipping += real;
      if (this.skipping > 0.7) this.finish(true);
    }
    if (this.finished || !this.built) { this.ui.end(); return; }
    // ---- dialogue first: it eats the advance keys
    this.dlg.update(real, this.skipping < 0 ? inp : null);
    // ---- the script's waits
    for (const w of [...this.waits]) {
      let done = false;
      try { done = w.fn(); } catch (e) { console.error(e); done = true; }
      if (done) { const i = this.waits.indexOf(w); if (i >= 0) this.waits.splice(i, 1); w.res(); }
    }
    if (this.showTitle) {
      this.titleT3d.update(real, this.titleCam);
      this.hud(real);
      this.ui.end();
      g.cursor = 'none';
      return;
    }
    this.sim(dt, real);
    this.hud(real);
    this.ui.end();
  }

  private skip() {
    if (this.skipping >= 0 || this.finished) return;
    this.skipping = 0;
    this.abort();
    this.fade(1, 0.5);
    audio.play('k_back2', { vol: 0.4, dry: true });
    audio.music(null, 0.8);
  }

  private sim(dt: number, real: number) {
    const g = this.game, w = this.world, k = this.kid, a = this.area;
    w.time += dt;
    // ---- the blobfish, with the gated input
    const blocking = this.dlg.blocking || this.skipping >= 0;
    const gate = this.gate;
    gate.src = this.control === 'free' && !blocking ? g.input : null;
    gate.allow.clear();
    if (gate.src) {
      for (const x of ['move', 'aim', 'dash']) gate.allow.add(x);
      if (this.allowAttack) for (const x of ['attack', 'ability', 'ability2', 'keys']) gate.allow.add(x);
    }
    const realInput = g.input;
    gate.base = realInput;
    g.input = gate as unknown as Input;
    try {
      // soft walls (the family scene) + the area's
      const b = this.bounds ?? [a.bounds.x0, a.bounds.x1];
      if (k.x < b[0]) k.applyForce((b[0] - k.x) * 120 - Math.min(0, k.vx) * 12, 0);
      if (k.x > b[1]) k.applyForce((b[1] - k.x) * 120 - Math.max(0, k.vx) * 12, 0);
      if (k.hp < 1) k.hp = 1;
      // the kid hovers while the script holds it (no sinking into the plants mid-conversation), and in the
      // prologue it never settles into the foreground weeds
      if (!k.hooked) {
        if (!gate.src) k.applyForce(0, 0.55);
        const fl = this.floorAt(k.x) + (this.step < 0 ? 1.1 : 0.5);
        if (k.y < fl) k.applyForce(0, (fl - k.y) * 8);
      }
      k.update(dt, w);
      // no sword until Mr. Crab hands one over (Blobfish.update re-shows it every frame)
      if (!this.armed) k.model.weaponPivot.visible = false;
      for (let i = 0; i < w.entities.length; i++) { const e = w.entities[i]; if (e.alive) e.update(dt, w); }
    } finally { g.input = realInput; gate.endFrame(); }
    for (let i = w.entities.length - 1; i >= 0; i--) {
      const e = w.entities[i];
      if (!e.alive) { e.dispose?.(w); e.obj?.removeFromParent(); w.entities.splice(i, 1); }
    }
    a.update(dt, this.cam.x);
    w.emit('tick', { dt });
    // a pixel wake behind the kid; tears in the silence
    const spd = Math.hypot(k.vx, k.vy);
    this.wakeT -= dt;
    if (spd > 1.4 && this.wakeT <= 0) { this.wakeT = 0.07; w.fx.wake(k.x - (k.vx / spd) * k.r, k.y - (k.vy / spd) * k.r, { x: k.vx, y: k.vy }, spd / 5); }
    if (this.tears && Math.random() < real * 2.5) { const e = k.model.eyeWorld(Math.random() < 0.5 ? 0 : 1, this.v); w.fx.emit('bubble', e.x, e.y, { n: 1, speed: 0.3, vy: 0.4, size: 0.05 }); }
    // ---- Mom and Dad
    for (const s of [this.mom, this.dad]) if (s.p.root.visible) this.swim(s, dt);
    // ---- Mr. Crab: scuttles along the seabed after the kid during the tutorial
    const c = this.crab;
    if (this.crabFollow) {
      const want = k.x - Math.sign(k.vx || 1) * 3.2;
      const dx = want - c.group.position.x;
      const v = Math.abs(dx) > 1.2 ? clamp(dx * 1.5, -4.5, 4.5) : 0;
      const gp = c.group.position, fl = this.floorAt(gp.x) - 0.05;
      c.move = damp(c.move, gp.y > fl + 0.05 ? v * 0.4 : v, 5, dt);
      gp.x += c.move * dt;
      gp.z = damp(gp.z, -0.45, 3, dt);
      // off the counter: a hop, a fall, a puff of sand
      if (gp.y > fl + 0.02 || this.crabVy > 0) {
        this.crabVy -= 14 * dt; gp.y += this.crabVy * dt;
        if (gp.y <= fl) { gp.y = fl; if (this.crabVy < -2) { w.fx.emit('dust', gp.x, fl + 0.1, { n: 10, spread: 0.6, speed: 1.2 }); w.sfx('thud_heavy', gp.x, 0.4, 1.4); } this.crabVy = 0; }
      } else gp.y = damp(gp.y, fl, 8, dt);
    } else c.move = damp(c.move, 0, 6, dt);
    c.lookX = k.x;
    c.update(dt);
    this.stall.update(dt);
    // ---- the boat + its fisherman
    if (this.boat) {
      this.boat.update(dt, w.water); this.angler?.lookAt(k.x, k.y); this.angler?.update(dt);
      const d = Math.abs(this.boat.x - this.cam.x);
      this.engine?.set(this.engineK * clamp(1 - d / 32, 0, 1) * 0.3 * (1 - this.muffle * 0.6), 0.7 + this.engineRate);
    }
    // ---- interactions (tutorial): [E] at the buoy and the wreck, TAB for the backpack
    this.interact();
    // ---- camera
    this.camera_(dt);
    // ---- world systems
    w.water.update(g.renderer, dt, this.cam.x);
    w.fx.update(dt);
    w.text.update(dt);
    this.t3d.update(dt, this.worldCam);
    // ---- audio: muffled in the tragedy
    this.muffle = damp(this.muffle, this.muffleT, 1.5, real);
    audio.listenerX = this.cam.x;
    audio.setUnderwater(Math.max(this.worldCam.position.y < 0.2 ? 0.5 : 0.15, this.muffle));
    if (audio.ctx && audio.musicBus) audio.musicBus.gain.value = audio.volume.music * (1 - this.muffle * 0.85);
    POST.uDesat.value = damp(POST.uDesat.value, this.muffleT > 0 ? 0.85 : this.desatT, this.muffleT > 0 ? 1.2 : 0.6, real);
    this.bagFlash = Math.max(0, this.bagFlash - real * 2);
    this.hintT -= real;
  }

  /** steer a scripted parent */
  private swim(s: Swimmer, dt: number) {
    if (!s.held) {
      if (s.tx !== null) {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        const want = Math.min(s.speed, d * 1.8);
        s.vx = damp(s.vx, d > 1e-3 ? (dx / d) * want : 0, 3.5, dt); s.vy = damp(s.vy, d > 1e-3 ? (dy / d) * want : 0, 3.5, dt);
      } else { s.vx = damp(s.vx, 0, 2, dt); s.vy = damp(s.vy, 0, 2, dt); }
      s.x += s.vx * dt; s.y += s.vy * dt;
      const fl = this.floorAt(s.x) + 0.8;
      if (s.y < fl) s.y = fl;
      s.z = damp(s.z, 0, 2, dt);
      if (Math.abs(s.vx) > 0.25) s.face = Math.sign(s.vx);
      else if (Math.abs(this.kid.x - s.x) > 0.6) s.face = Math.sign(this.kid.x - s.x);
    }
    s.flip = damp(s.flip, s.face, 9, dt);
    const r = s.p.root, f = s.flip;
    const bob = s.held ? 0 : Math.sin(this.time * 1.6 + s.ph) * 0.08;
    r.position.set(s.x, s.y + bob, s.z);
    r.scale.set(Math.sign(f || 1) * Math.max(0.12, Math.abs(f)) * s.scale, s.scale, s.scale);
    r.rotation.set(0, -0.55 * Math.sign(f || 1) * Math.abs(f), 0);
    const pitch = s.held ? Math.sin(this.time * 6 + s.ph) * 0.4 : clamp(Math.atan2(s.vy, Math.abs(s.vx) + 0.6), -0.6, 0.6);
    s.p.model.body.rotation.z = damp(s.p.model.body.rotation.z, pitch, 5, dt);
    s.p.update(dt, { t: this.time, move: s.held ? 1 : Math.min(1, Math.hypot(s.vx, s.vy) / 1.5) });
  }

  private camera_(dt: number) {
    const tg = this.camFn();
    const c = this.cam, k = 1 - Math.exp(-dt * this.camK);
    c.x += (tg.x - c.x) * k; c.y += (tg.y - c.y) * k; c.dist += (tg.dist - c.dist) * k; c.yaw += (tg.yaw - c.yaw) * k; c.h += (tg.h - c.h) * k;
    const sh = this.game.shakeOffset();
    const cam = this.worldCam;
    cam.position.set(c.x + Math.sin(c.yaw) * c.dist + sh.x, Math.min(1.2, c.y + c.h + sh.y), Math.cos(c.yaw) * c.dist);
    cam.lookAt(c.x + sh.x * 0.5, c.y + sh.y * 0.5, 0);
    cam.updateMatrixWorld();
    this.light.follow(c.x, c.y);
  }

  private bagCounts(): Record<string, number> { const c: Record<string, number> = {}; for (const id of this.bag) c[id] = (c[id] ?? 0) + 1; return c; }

  private interact() {
    this.prompt = null;
    if (this.step < 0 || this.control !== 'free' || this.dlg.blocking) return;
    const k = this.kid, inp = this.game.input, a = this.area, mb = a.mailbox, wk = a.shipwreck;
    const E = inp.hit('interact');
    // the backpack (from the gear lesson on)
    if (this.step >= 4 && inp.hit('bag') && !k.hooked && this.game.get('backpack')) {
      this.game.openModal('backpack', { run: this.run, onClose: () => { this.game.closeModal(); this.applyStats(); } });
      return;
    }
    const loose = this.run.items.filter((i) => i.gx < 0).length;
    const carried = this.bag.length + loose;
    if (this.step >= 5) {
      if (mb.canDeposit(k.x, k.y) && carried > 0) {
        this.prompt = { key: 'E', label: `SEND HOME (${carried})` };
        if (E) {
          const ids = [...this.bag, ...this.run.items.filter((i) => i.gx < 0).map((i) => i.id)];
          this.bag = [];
          this.run.items = this.run.items.filter((i) => i.gx >= 0);
          mb.deposit(ids);
        }
        return;
      }
      if (Math.abs(k.x - mb.x) < 4.5 && k.y > -8 && mb.manatee.state === 'away') {
        this.prompt = { key: 'E', label: 'RING FOR THE MANATEE' };
        if (E) { mb.ring(); mb.eta = Math.min(mb.eta, 2.5); this.t3d.add('DING DING!', mb.x, mb.y + 1.4, 0, T3D.gold, { size: 0.36, life: 1.3, rise: 0.5 }); }
        return;
      }
    }
    if (this.step >= 6) {
      const nearWreck = Math.abs(k.x - wk.x) < wk.dims.L * 0.5 + 1.6 && k.y < wk.floor + wk.dims.D + 3.5;
      const needs = wk.needs(), have = this.bagCounts();
      if (nearWreck && Object.keys(needs).some((id) => (have[id] ?? 0) > 0)) {
        this.prompt = { key: 'E', label: 'REPAIR WRECK' };
        if (E) {
          const took = wk.repair(have);
          for (const [id, n] of Object.entries(took)) for (let i = 0; i < n; i++) { const j = this.bag.indexOf(id); if (j >= 0) this.bag.splice(j, 1); }
        }
      }
    }
  }

  private applyStats() {
    const k = this.kid, st = this.run.stats();
    const hp = k.hp;
    k.setStats(st);
    k.skillLv = skillLevels(this.run);
    k.abilityLv = abilityLevels(this.run);
    k.hp = Math.min(Math.max(hp, 1), k.maxHp);
    this.world.magnet = st.magnet;
  }

  // ================================================================ HUD
  private toUi(x: number, y: number, z = 0) {
    const v = this.v.set(x, y, z).project(this.worldCam);
    const ui = this.ui;
    return { x: (v.x * 0.5 + 0.5) * ui.w, y: (1 - (v.y * 0.5 + 0.5)) * ui.h, behind: v.z > 1 };
  }

  private hud(real: number) {
    const ui = this.ui;
    const showGame = !this.showTitle && this.step >= 0 && this.step < STEPS.length + 1;
    if (showGame) { this.lessonCard(); this.hearts(); this.bagRow(); }
    // the [E] prompt over the kid
    if (this.prompt && !this.dlg.blocking && !this.showTitle) {
      const s = this.toUi(this.kid.x, this.kid.y + 0.6);
      const kw = ui.keycap(this.prompt.key, 0, -100);
      const lw = ui.measure(this.prompt.label, 'small');
      const wd = kw + 3 + lw, x = Math.round(s.x - wd / 2), y = Math.round(s.y - 30 + Math.sin(this.real * 4) * 1.5);
      ui.fill(x - 3, y - 2, wd + 6, 16, '#000000', 0.45);
      ui.keycap(this.prompt.key, x, y);
      ui.text(this.prompt.label, x + kw + 3, y + 3, { font: 'small', color: '#f4f0e6', outline: '#06080e' });
    }
    // an arrow to the current goal when it's off screen
    if (this.target && !this.showTitle && !this.dlg.blocking) this.edgeArrow(this.target);
    // a one-line instruction (cinematic control moments)
    if (this.hintT > 0 && this.hint && !this.dlg.blocking && !this.showTitle && this.step < 0) {
      const a = Math.min(1, this.hintT);
      const w = ui.measure(this.hint, 'small') + 14;
      const bar = Math.ceil(ui.h * POST.uLetterbox.value * Math.max(0, 1 - (ui.w / ui.h) / 2.39) * 0.5);
      ui.fill(Math.round((ui.w - w) / 2), ui.h - bar - 18, w, 13, '#000000', 0.45 * a);
      ui.text(this.hint, ui.w / 2, ui.h - bar - 15, { font: 'small', color: '#e8fdff', outline: '#06303f', align: 'center', alpha: a });
    }
    this.dlg.draw();
    this.skipRing(real);
    // the game cursor: aim while fighting, a pointer for choices
    this.game.cursor = this.dlg.blocking ? 'normal' : this.control === 'free' && this.allowAttack ? 'aim' : 'none';
  }

  private lessonCard() {
    const ui = this.ui;
    const i = Math.min(this.step, STEPS.length - 1);
    const s = STEPS[i];
    const done = this.step >= STEPS.length;
    const x = 4, y = 26, w = 132;
    const h = 36;
    ui.frame('dark', x, y, w, h, 0.88);
    ui.text(done ? 'TRAINING DONE' : `TRAINING ${i + 1}/${STEPS.length}`, x + 6, y + 5, { font: 'small', color: '#ffd860', outline: '#06080e' });
    // progress pips
    for (let j = 0; j < STEPS.length; j++) ui.fill(x + w - 6 - (STEPS.length - j) * 5, y + 6, 4, 3, j < this.step || done ? '#ffd860' : j === this.step ? (Math.floor(this.real * 4) % 2 ? '#ffffff' : '#7a8898') : '#3a4252');
    const tick = this.stepDone > 0 || done;
    ui.text((tick ? '✓ ' : '') + (done ? 'GOOD JOB, KID' : s.title), x + 6, y + 14, { font: 'body', color: tick ? '#8aff7a' : '#ffffff', shadow: '#000' });
    let hx = x + 6;
    if (!done) for (const [key, label] of s.keys) { if (key) hx += ui.hint(key, label, hx, y + 24) - 4; else hx += ui.text(label, hx, y + 27, { font: 'small', color: '#c8d8f0', shadow: '#000' }) + 6; }
  }

  private hearts() {
    const ui = this.ui, k = this.kid;
    const n = Math.ceil(k.maxHp / 2);
    for (let i = 0; i < n; i++) {
      const v = k.hp - i * 2;
      ui.img(v >= 2 ? HUD_ART.heart : v === 1 ? HUD_ART.heartHalf : HUD_ART.heartEmpty, 5 + i * 10, 6);
    }
  }

  private bagRow() {
    const ui = this.ui;
    const counts = Object.entries(this.bagCounts());
    const loose = this.run.items.filter((i) => i.gx < 0).map((i) => [i.id, 1] as [string, number]);
    const all = [...counts, ...loose].slice(0, 8);
    if (!all.length) return;
    const cell = 16, x = 4, y = ui.h - cell - 18;
    const w = all.length * cell + 8;
    ui.frame('dark', x, y, w, cell + 14, 0.85);
    ui.text('BAG', x + 4, y + 3, { font: 'small', color: '#ffd860', outline: '#06080e' });
    all.forEach(([id, n], i) => {
      const ix = x + 4 + i * cell, iy = y + 11;
      if (this.bagFlash > 0 && i === all.length - 1) ui.fill(ix, iy, cell, cell, '#fff2a0', this.bagFlash * 0.5);
      if (ITEMS[id]) ui.item(id, ix, iy, 15, 15);
      if (n > 1) ui.text(String(n), ix + cell - 1, iy + 8, { font: 'small', color: '#ffffff', outline: '#06080e', align: 'right' });
    });
    if (ui.hover(x, y, w, cell + 14)) {
      const names = all.map(([id, n]) => `${getItem(id).name}${n > 1 ? ' x' + n : ''}`);
      ui.tooltip(names, { maxW: 160 });
    }
  }

  private edgeArrow(t: { x: number; y: number; label: string }) {
    const ui = this.ui;
    const s = this.toUi(t.x, t.y);
    const m = 18;
    if (!s.behind && s.x > m && s.x < ui.w - m && s.y > m && s.y < ui.h - m) {
      // on screen: a bobbing chevron over the goal
      const bob = Math.round(Math.sin(this.real * 5) * 2);
      const x = Math.round(s.x), y = Math.round(s.y) - 22 + bob;
      for (let i = 0; i < 4; i++) ui.fill(x - 4 + i, y + i, 9 - i * 2, 1, '#ffd860');
      ui.fill(x - 5, y - 1, 11, 1, '#3a2408');
      return;
    }
    const cx = ui.w / 2, cy = ui.h / 2;
    let dx = s.x - cx, dy = s.y - cy;
    if (s.behind) { dx = -dx; dy = -dy; }
    const k = Math.min((ui.w / 2 - m) / Math.max(1e-3, Math.abs(dx)), (ui.h / 2 - m - 14) / Math.max(1e-3, Math.abs(dy)));
    const x = Math.round(cx + dx * k), y = Math.round(cy + dy * k);
    const ang = Math.atan2(dy, dx);
    const pulse = Math.floor(this.real * 4) % 2 ? '#ffd860' : '#ffffff';
    for (let i = 0; i <= 6; i++) {
      const bx = x + Math.cos(ang) * (9 - i), by = y + Math.sin(ang) * (9 - i);
      const half = i * 0.7;
      for (let j = -half; j <= half; j += 0.5) ui.fill(bx - Math.sin(ang) * j, by + Math.cos(ang) * j, 1, 1, pulse);
    }
    const lw = ui.measure(t.label, 'small');
    const lx = Math.round(clamp(x - Math.cos(ang) * 16 - lw / 2, 3, ui.w - lw - 3)), ly = Math.round(clamp(y - Math.sin(ang) * 12 - 3, 3, ui.h - 10));
    ui.text(t.label, lx, ly, { font: 'small', color: '#ffffff', outline: '#06080e' });
  }

  /** HOLD ESC TO SKIP, with a pixel ring that fills */
  private skipRing(real: number) {
    const ui = this.ui;
    void real;
    const k = clamp(this.skipT / SKIP_HOLD, 0, 1);
    const cx = ui.w - 16, cy = ui.h - 16, r = 7;
    const hintOn = this.real < 8 || k > 0 || this.showTitle;
    if (!hintOn && k <= 0) return;
    const alpha = k > 0 ? 1 : 0.55;
    ui.fill(cx - r - 2, cy - r - 2, r * 2 + 5, r * 2 + 5, '#000000', 0.35 * alpha);
    // the ring: every pixel at radius r, lit clockwise from 12 o'clock as the hold fills
    for (let yy = -r - 1; yy <= r + 1; yy++) for (let xx = -r - 1; xx <= r + 1; xx++) {
      const d = Math.hypot(xx + 0.5, yy + 0.5);
      if (d < r - 1.6 || d > r + 0.4) continue;
      let a = Math.atan2(xx + 0.5, -(yy + 0.5)); if (a < 0) a += TAU;
      const on = a / TAU <= k;
      ui.fill(cx + xx, cy + yy, 1, 1, on ? '#ffd860' : '#3a4252', alpha);
    }
    ui.text('ESC', cx, cy - 3, { font: 'small', color: k > 0 ? '#ffffff' : '#c8c8c8', align: 'center', alpha });
    ui.text(k > 0 ? 'SKIPPING...' : 'HOLD TO SKIP', cx - r - 5, cy - 3, { font: 'small', color: '#e8e0d0', outline: '#06080e', align: 'right', alpha });
  }
}
