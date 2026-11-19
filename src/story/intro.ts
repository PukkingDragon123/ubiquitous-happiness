// The prologue (screen 'intro'): a letterboxed, directed cinematic that turns into a short playable tutorial, on the
// Sunlit Reef. NEW GAME always starts here; hold ESC 1.5 s to skip at any point.
//
//   a. MORNING   the kid (the player's blobfish at 0.65 scale, no hat, no sword) plays with MOM (rosy, a shell
//                necklace) and DAD (greyer, bigger, a sailor cap). Warm dialogue; the player takes over early
//                ("SWIM" in bubble letters) and tags Dad, then Mom.
//   b. BREAD     a boat idles overhead; a slice of bread drifts down on a line (whip-pan + snap zoom, an angelic
//                shimmer). "BREAD!!" / "Wait, sweetie—". The player grabs it (slide-whistle sting, freeze-frame):
//                it's a hook (dun dun DUNNN, dutch angle, slow-mo push-in). Mom and Dad bite through the line, the
//                kid falls free, and a trawl net takes them instead: slow motion, desaturation, muffled sound, the
//                sad violin, close-ups on their faces for their last words, the net hauled up to the boat.
//   c. ALONE     wordless: the boat motors away overhead while the camera pushes in, very slowly, on the kid alone.
//                Silence. Fade.
//   d. MR. CRAB  a gruff weapon dealer in his shop window (the twist sting, a push-in on him). A choice or two; he
//                hands over the TOOTHPICK (slow-mo push-in on the kid) and a hat (DEFAULT_GEAR from here on).
//   e. TUTORIAL  seven short lessons, one goal at a time on a small objective line, each opened by a quick establishing
//                shot and a bubble-word name card, Mr. Crab scuttling along and commenting:
//                1 SWIM    a kelp slalom (four gates, low / high), then a warm current to ride (WASD / arrows)
//                2 DART    catch a skittish minnow (tap SHIFT to dart at it; it tires if you can't)
//                3 CHARGE  hold SHIFT, aim, let go: one charged dash through three bubble rings (slow-mo wind-up)
//                4 SLASH   smash three glass bottles (human trash): click / J
//                5 PARRY   Mr. Crab lobs shells: right click / K as one flashes (they slow down if you struggle)
//                6 HEAL    the shells stung: R (or H) eats a Healing Clam
//                7 MAIL    ring the buoy for MARGE and mail the glass home
//                Every lesson has a way out (the minnow tires, rings / parries go lenient, Mr. Crab hands over glass,
//                waves the mail through): nothing can get stuck.
//   f. HOME      Mr. Crab leads the kid to a ruined stone house: his brother's place. "We'll fix her up together."
//                The kid swims in through the door -> onDone -> the home screen (the rebuild begins there).
//
//   const intro = new IntroScreen(game); intro.onDone = (skipped) => ...; game.register(intro);
//   game.go('intro', { beat?: 'morning' | 'bread' | 'alone' | 'crab' | 'tutorial' | 'home', step?: 1..7 })
//   (?preview=intro&beat=bread / &beat=tutorial&step=3 jumps straight there; &speed=N runs it N x faster.)
//
// The beats are one async script: await this.wait(s) / this.until(fn) / this.talk(lines) resolve from update(), and
// a skip aborts the whole chain (every pending await rejects with ABORT). Shots are functions returning a camera
// framing { x, y, dist, yaw, h, roll (dutch), fov (zoom) }; push() blends two of them over time, whip() snaps.
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
import { clamp, damp, lerp, smooth, segDist, TAU } from '../core/math';
import { audio } from '../audio/audio';
import { Blobfish } from '../player/blobfish';
import { DEFAULT_GEAR } from '../player/gear';
import { BlobPuppet } from '../player/puppet';
import { buildArea, materialId, type Area } from '../area';
import { FishingLine } from '../fishing/line';
import { makeBoat, makeFisherman, type Vessel, type Fisherman } from '../humans';
import { ITEMS, installItemSystem, getItem } from '../game/items';
import { addMaterials, stashItem, returnToStash } from '../meta/meta';
import { glint } from '../combat/telegraph';
import { PixelUI } from '../ui/pixel/ui';
import { Text3DLayer, Float3D, T3D } from '../ui/text3d';
import { Dialogue, type Line } from './dialogue';
import { HEAL_ITEM, hpOf, hpText, hpDelta } from '../combat/types';
import { sailorCap, shellNecklace, buildBread, GlassBottle, ShellShot, RuinedHome, TrawlNet, BubbleRing, KelpGate, CurrentStream, Minnow, type BottleKind } from './models';
import { MrCrab, CrabShop } from './crab';

export type IntroBeat = 'morning' | 'bread' | 'alone' | 'crab' | 'tutorial' | 'home';
const BEATS: IntroBeat[] = ['morning', 'bread', 'alone', 'crab', 'tutorial', 'home'];
const ABORT = new Error('intro: aborted');
const SEED = 4242;
const KID_SCALE = 0.65;
const SKIP_HOLD = 1.5;
/** the lessons, in order (&step=1..7) */
const L = { swim: 0, dart: 1, charge: 2, slash: 3, parry: 4, heal: 5, mail: 6 } as const;
const LESSONS = 7;
const FOV = 36;

/** a camera framing: look at (x, y, 0) from `dist` away, swung `yaw` round, raised `h`; roll = dutch angle, fov = zoom */
interface Shot { x: number; y: number; dist: number; yaw: number; h: number; roll?: number; fov?: number }
type ShotSrc = Shot | (() => Shot);
/** the one thing to do right now (the objective line): text, an optional count, keys to show */
interface Goal { text: string; n?: number; of?: number; keys?: [string, string][] }

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

const mixShot = (a: Shot, b: Shot, k: number): Shot => ({
  x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), dist: lerp(a.dist, b.dist, k), yaw: lerp(a.yaw, b.yaw, k), h: lerp(a.h, b.h, k),
  roll: lerp(a.roll ?? 0, b.roll ?? 0, k), fov: lerp(a.fov ?? FOV, b.fov ?? FOV, k),
});
const resolveShot = (s: ShotSrc): Shot => (typeof s === 'function' ? s() : s);

export class IntroScreen implements Screen {
  name = 'intro';
  /** finished (or skipped): the owner goes home */
  onDone?: (skipped: boolean) => void;

  private worldScene = new THREE.Scene();
  private worldCam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1200);
  private overlay = new THREE.Scene();
  ui = new PixelUI({ targetH: 240 });
  dlg: Dialogue;
  t3d = new Text3DLayer();
  get scene() { return this.worldScene; }
  get camera() { return this.worldCam; }
  underwater = true;
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
  private ruin!: RuinedHome;
  private crabVy = 0;
  /** where the kid hovers while the script holds it */
  private holdY: number | null = null;
  /** Mr. Crab: 'follow' the kid, scuttle to an x, or stay put */
  private crabMode: 'stay' | 'follow' | 'goto' = 'stay';
  private crabGoal = 0;
  private boat: Vessel | null = null;
  private angler: Fisherman | null = null;
  private gate: Gate;
  private ambience: ReturnType<typeof audio.loop> | null = null;
  private engine: ReturnType<typeof audio.loop> | null = null;
  // layout
  private home = 0; private crabX = 0; private ruinX = 0;
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
  /** tutorial lesson index (-1: the cinematic) */
  private step = -1;
  private goal: Goal | null = null;
  private goalT = 0;
  private prompt: { key: string; label: string } | null = null;
  private target: { x: number; y: number; label: string } | null = null;
  private muffle = 0; private muffleT = 0;
  private cam: Required<Shot> = { x: 0, y: -6, dist: 12, yaw: 0, h: 0.6, roll: 0, fov: FOV };
  private camFn: () => Shot = () => this.cam;
  private camK = 3;
  private whipT = 0;
  private slowTok = 0;
  private v = new THREE.Vector3();
  private beat0: IntroBeat = 'morning';
  private step0 = 0;
  private tears = 0;
  private sinking = false;
  private wakeT = 0;
  private speed = Math.max(0.1, Number(new URLSearchParams(location.search).get('speed') || 1));
  private dt = 0;
  private desatT = 0;
  private engineK = 0;
  private engineRate = 0;
  private built = false;
  private armed = false;
  /** dev / tests: the current lesson's props (gates, current, fish, rings, bottles, shell) */
  dbg: Record<string, unknown> = {};
  /** the kid's last frame of motion (segA -> segB): gates and rings test what it swam through */
  private segA = new THREE.Vector2();
  private segB = new THREE.Vector2();

  constructor(public game: Game) {
    this.gate = new Gate();
    this.dlg = new Dialogue(this.ui, () => this.worldCam);
    (window as unknown as { intro: IntroScreen }).intro = this;
  }

  // ================================================================ Screen
  resize(w: number, h: number) {
    this.worldCam.aspect = w / h; this.worldCam.updateProjectionMatrix();
    const pr = this.game.renderer.getPixelRatio();
    this.ui.resize(w, h, pr);
    this.world?.fx.setPixelScale(h * Math.min(devicePixelRatio || 1, 1.5), FOV);
  }

  /** starts clean every time (NEW GAME, the menu's replay, previews): everything is rebuilt from scratch */
  enter(data?: unknown) {
    const d = (data ?? {}) as { beat?: IntroBeat; step?: number };
    const q = new URLSearchParams(location.search);
    const beat = (d.beat ?? q.get('beat') ?? 'morning') as IntroBeat;
    this.beat0 = BEATS.includes(beat) ? beat : 'morning';
    this.step0 = clamp(Math.round(Number(d.step ?? q.get('step') ?? 1)) - 1, 0, LESSONS - 1);
    this.abort();
    this.finished = false; this.skipping = -1; this.skipT = 0; this.skipStart = -1; this.desatT = 0;
    this.goal = null; this.whipT = 0; this.slowTok++; this.sinking = false;
    this.game.timeScale = 1;
    this.cam = { x: 0, y: -6, dist: 12, yaw: 0, h: 0.6, roll: 0, fov: FOV };
    this.worldCam.fov = FOV; this.worldCam.updateProjectionMatrix();
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
    this.worldCam.fov = FOV; this.worldCam.updateProjectionMatrix();
    this.game.cursor = 'normal';
  }

  // ================================================================ build
  private teardown() {
    const w = this.world;
    this.built = false;
    if (!w) return;
    this.area?.dispose();
    w.clear();
    this.kid?.dispose();
    this.stall?.release();
    this.light.sun.shadow.dispose();
    this.worldScene.clear();
    this.t3d.clear();
  }

  private build() {
    this.teardown();
    this.time = 0; this.clock = 0; this.real = 0;
    this.bag = []; this.step = -1; this.prompt = null; this.target = null; this.crabMode = 'stay'; this.tears = 0; this.holdY = null; this.bounds = null;
    this.run = new Run(SEED);
    installItemSystem(this.run);
    // extra point-light slots: the shop's lantern, glow jar and rim light
    this.light = new Lighting(2048, 7);
    const water = new WaterFX(), fx = new Particles(), text = new Float3D(this.t3d);
    this.kid = new Blobfish(0, -8);
    const w = this.world = new RunWorld(this.game, this.run, this.worldScene, this.worldCam, water, fx, text, new Rng(SEED), this.kid);
    this.worldScene.add(makeSky(), water.group, this.light.group, fx.object, this.kid.obj, this.t3d.group);
    this.overlay.clear();
    this.overlay.add(text.group);
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
    // the kid: small, no hat, no sword (yet)
    const k = this.kid;
    k.setStats(this.run.stats());
    k.setGear({ hat: 'none', weapon: 'toothpick' });
    k.model.weaponVisible = false;
    this.armed = false;
    k.model.body.scale.setScalar(KID_SCALE);
    k.onDeath = () => { /* the tutorial never kills */ };
    // layout: home near the arrival, Mr. Crab between the wreck and the mail buoy, the ruin past the buoy
    this.home = a.spawns.player.x + 3;
    // a flat patch of sand near `want`, clear of the scenery rocks that stand in front of / inside a building at z ~ -2.4
    const rocks = a.mailbox.scen.rockTops.filter((r) => r.z > -5.5 && r.z < 2);
    const flattest = (x0: number, x1: number, want: number, clear = 0, span = 1.5) => {
      let best = want, bs = 1e9;
      for (let x = x0; x <= x1; x += 0.5) {
        const f0 = this.floorAt(x);
        let sc = Math.abs(this.floorAt(x + span) - this.floorAt(x - span)) + Math.abs(x - want) * 0.05;
        // no dunes in front of it (they hide the doorway from a low camera)
        if (span > 1.5) for (let d = -span; d <= span; d += 0.75) sc += Math.max(0, this.floorAt(x + d) - f0 - 0.15) * 2;
        if (clear) for (const r of rocks) if (Math.abs(r.x - x) < clear + r.r) sc += 2 + Math.max(0, r.y - this.floorAt(r.x));
        if (sc < bs) { bs = sc; best = x; }
      }
      return best;
    };
    const wx = a.shipwreck.x;
    this.crabX = flattest(wx + 15, wx + 22, wx + 18);
    const bx = a.mailbox.x;
    this.ruinX = flattest(bx + 6, Math.min(bx + 14, a.bounds.x1 - 6), bx + 9, 3, 3.5);
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
    // Mr. Crab + his shop
    this.crab = new MrCrab();
    this.crab.group.scale.setScalar(0.8);
    this.crab.onPuff = (p) => this.world.fx.emit('bubble', p.x, p.y, { n: 3, spread: 0.04, speed: 0.3, vy: 0.5, size: 0.06 });
    this.stall = new CrabShop();
    this.stall.group.position.set(this.crabX + 0.3, Math.min(this.floorAt(this.crabX - 1.2), this.floorAt(this.crabX + 1.8)) - 0.05, -2.0);
    this.worldScene.add(this.stall.group, this.crab.group);
    this.stall.setLighting(this.light);
    this.crabOnCounter();
    // the ruined home, behind the play plane past the mail buoy
    this.ruin = new RuinedHome();
    this.ruin.group.position.set(this.ruinX, Math.min(this.floorAt(this.ruinX - 2), this.floorAt(this.ruinX + 2)) - 0.1, -2.4);
    this.worldScene.add(this.ruin.group);
    // the boat (moored far off until the bread beat)
    this.boat = makeBoat('trawler', 7);
    this.boat.setX(this.home + 60);
    this.worldScene.add(this.boat.group);
    this.angler = makeFisherman('oldSalt', 5);
    const seat = this.boat.seats[0];
    if (seat) { seat.add(this.angler.group); this.angler.setSeating(((seat.userData.seating as string) ?? 'stand') as 'stand'); this.angler.setFacing(-1); }
    // events
    w.onLoot = (what) => {
      if (!what.item) return;
      const d = ITEMS[what.item];
      if (!d) return;
      if (d.kind === 'material') this.bag.push(d.id); else this.run.addItem(d.id);
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
    this.dlg.speaker({ id: 'narr', name: '', color: '#000000', voice: 'k_tick', pitch: 0.7, vol: 0.12 });
    // music + room tone
    this.ambience?.stop(); this.ambience = audio.loop(a.ambience, 0.3);
    this.engine?.stop(); this.engine = audio.loop('lp_machine', 0, 0.7);
    this.engineK = 0; this.engineRate = 0;
    this.game.post.cut?.();
    this.built = true;
  }

  /** Mr. Crab back on his counter, in the shop window */
  private crabOnCounter() {
    this.stall.group.updateMatrixWorld(true);
    const p = this.stall.group.localToWorld(this.stall.counter.clone());
    this.crab.group.position.copy(p);
    this.crabVy = 0;
    this.crabMode = 'stay';
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
  /** a parent's face (close-ups) */
  private face(s: Swimmer) { return { x: s.x + s.face * 0.15 * s.scale, y: s.y + 0.05 }; }
  private place(x: number, y: number) { const k = this.kid; k.sb.place(x, y); k.x = x; k.y = y; k.vx = k.vy = 0; this.segA.set(x, y); this.segB.set(x, y); }
  private near(a: { x: number; y: number }, b: { x: number; y: number }, r: number) { return Math.hypot(a.x - b.x, a.y - b.y) < r; }

  private setMuffle(k: number, now = false) { this.muffleT = k; if (now) this.muffle = k; }
  private letterbox(v: number, sec = 0.8) { this.game.post.letterboxTo?.(v, sec); }
  private fade(v: number, sec = 0.8, col = '#000000') { this.game.post.fadeTo?.(v, sec, col); }
  private shot(fn: ShotSrc, k = 3) { this.camFn = typeof fn === 'function' ? fn : () => fn; this.camK = k; }
  /** a whip-pan: the camera snaps to the next framing (the motion blur does the rest) */
  private whip(sec = 0.3) { this.whipT = sec; audio.play('swish_c', { vol: 0.32, dry: true, rate: 0.75 }); }
  /** blend from one framing to another over `sec` real seconds (push-ins, cranes, pull-outs) */
  private push(a: ShotSrc, b: ShotSrc, sec: number): () => Shot {
    const t0 = this.real;
    return () => mixShot(resolveShot(a), resolveShot(b), smooth(0, sec, this.real - t0));
  }
  /** slow motion for `sec` real seconds (a later slowmo / normal() overrides it) */
  private slowmo(scale: number, sec: number) {
    const tok = ++this.slowTok;
    this.game.timeScale = scale;
    const t0 = this.real;
    this.ticker(() => { if (tok !== this.slowTok) return true; if (this.real - t0 >= sec) { this.game.timeScale = 1; return true; } });
  }
  private normalSpeed() { this.slowTok++; this.game.timeScale = 1; }
  private followKid(dist = 11, h = 0.7) {
    this.shot(() => {
      const p = this.kid;
      const fl = this.floorAt(p.x);
      return { x: p.x + clamp(p.vx * 0.3, -2, 2), y: clamp(p.y + 0.6 + clamp(p.vy * 0.2, -1, 1), fl + 2.1, -2.6), dist, yaw: 0, h };
    }, 3);
  }
  /** a close-up on a face (the kid, a parent): x/y of the head, a slight angle */
  private closeUp(at: () => { x: number; y: number }, o: { dist?: number; yaw?: number; roll?: number; fov?: number } = {}): () => Shot {
    return () => { const p = at(); return { x: p.x, y: p.y, dist: o.dist ?? 3, yaw: o.yaw ?? 0.18, h: 0.12, roll: o.roll ?? 0, fov: o.fov ?? 28 }; };
  }
  private snapCam() { const t = this.camFn(); Object.assign(this.cam, { roll: 0, fov: FOV }, t); }
  /** let the player swim (and optionally fight) */
  private free(attack = false, bounds: [number, number] | null = null) {
    this.control = 'free'; this.allowAttack = attack; this.bounds = bounds;
  }
  private script_(ax = 0, ay = 0) { this.control = 'script'; this.gate.ax = { x: ax, y: ay }; }
  private setGoal(g: Goal | null) { if (g?.text !== this.goal?.text) this.goalT = 0; this.goal = g; }
  private sting(id: string, vol = 0.8) { audio.play(id, { vol, dry: true, jitter: 0 }); }

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
    if (i <= 2) await this.alone();
    if (i <= 3) await this.crabBeat();
    if (i <= 4) await this.tutorial(i <= 3 ? 0 : step);
    await this.homeBeat();
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
    // the crane: from the bright shallows down onto the family, settling out of a slight tilt
    const fy = this.famY(H);
    this.shot(this.push({ x: H + 5, y: -2.6, dist: 17, yaw: -0.35, h: 2.4, roll: -0.05, fov: 40 }, { x: H + 0.4, y: fy + 0.2, dist: 8.5, yaw: 0.18, h: 0.5, roll: 0, fov: 34 }, 7), 6);
    this.snapCam();
    this.fade(0, 2.6);
    // the family plays: the kid zig-zags between Mom and Dad
    let playing = true;
    const t0 = this.clock;
    this.ticker(() => {
      if (!playing) return true;
      const tt = this.clock - t0;
      this.gate.ax = { x: Math.sin(tt * 0.9) > 0 ? 0.7 : -0.7, y: Math.sin(tt * 1.7) * 0.5 };
      this.mom.tx = H - 2.4 + Math.sin(tt * 0.6) * 0.8; this.mom.ty = fy + 0.3 + Math.sin(tt * 0.8) * 0.4;
      this.dad.tx = H + 2.2 + Math.sin(tt * 0.5 + 1) * 0.8; this.dad.ty = fy - 0.1 + Math.sin(tt * 0.7 + 2) * 0.3;
    });
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
      return { x: cx, y: (this.mom.y + this.dad.y + this.kid.y) / 3 + 0.3, dist: 8.2, yaw: 0.16, h: 0.45, fov: 34 };
    }, 2.5);
    this.mom.tx = H - 1.6; this.mom.ty = fy + 0.2; this.dad.tx = H + 1.6; this.dad.ty = fy;
    this.mom.p.setExpression('happy'); this.dad.p.setExpression('happy'); this.kid.setExpr('happy', 99);
    await this.talk([
      { who: 'dad', text: 'Morning, little bubble! Sleep well?', do: () => this.shot(this.closeUp(() => this.face(this.dad), { dist: 4.2, yaw: 0.25 }), 3) },
      { who: 'kid', text: '...', do: () => this.shot(this.closeUp(() => ({ x: this.kid.x, y: this.kid.y + 0.2 }), { dist: 3.6, yaw: -0.2 }), 3), choices: [
        { text: 'Five more minutes...', then: [{ who: 'mom', text: 'Ha! Not today, sleepyhead. The whole reef is up.' }] },
        { text: 'RACE YOU!', then: [{ who: 'dad', text: 'Oho! {wave}You\'re on,{/wave} champ!' }] },
      ] },
      { who: 'mom', text: 'Stretch those fins first. Swim over to Daddy!', do: () => this.shot(this.closeUp(() => this.face(this.mom), { dist: 4, yaw: -0.15 }), 3) },
    ]);
    // the player takes over: a painted prompt in the reef
    this.letterbox(0.35, 1.2);
    this.free(false, [H - 9, H + 9]);
    this.followKid(9.5, 0.6);
    this.dad.tx = H + 4.2; this.dad.ty = fy + 0.4;
    this.mom.tx = H - 1.2; this.mom.ty = fy + 0.3;
    const swim = this.t3d.add('SWIM', this.kid.x + 0.6, this.kid.y + 1.55, 0.6, T3D.hint, { size: 0.42, stagger: 0.08, angle: 0.3 });
    const wasd = this.t3d.add('WASD / ARROWS', this.kid.x + 0.6, this.kid.y + 0.95, 0.6, T3D.sub, { size: 0.22, delay: 0.5, angle: 0.3 });
    this.setGoal({ text: 'Swim to Dad', keys: [['WASD', ''], ['ARROWS', 'swim']] });
    await this.until(() => { this.meet(this.dad, H + 4.2, fy + 0.4); return this.near(this.kid, this.dad, 1.35); });
    swim.hide(); wasd.hide();
    this.tag(this.dad);
    this.bark('dad', 'Ha! Fast as a sea slug!', 2.2);
    this.mom.tx = H - 4; this.mom.ty = fy + 0.9;
    this.setGoal({ text: 'Now tag Mom', keys: [['WASD', 'swim']] });
    await this.wait(0.8);
    this.bark('mom', 'Now tag Mommy!', 2.4);
    await this.until(() => { this.meet(this.mom, H - 4, fy + 0.9); return this.near(this.kid, this.mom, 1.3); });
    this.setGoal(null);
    this.tag(this.mom);
    this.kid.play('cheer');
    this.bark('mom', 'Got me! Okay, okay, you win.', 2.4);
    await this.wait(2.2);
  }

  /** a parent playing tag: drifts toward the kid's height when it comes close */
  private meet(s: Swimmer, x: number, y: number) {
    const k = this.kid;
    const d = Math.hypot(k.x - s.x, k.y - s.y);
    s.tx = x; s.ty = d < 4 ? lerp(y, k.y, smooth(4, 1.5, d)) : y;
    if (d < 4) s.tx = lerp(x, k.x, smooth(4, 1.5, d) * 0.5);
  }
  /** a game of tag: a little pop, a word and a squish */
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
    // look up from the family at the hull against the bright surface, tilted a little: something's wrong
    this.shot(this.push(() => ({ x: lerp(k.x, boat.x, 0.45), y: -4.4, dist: 12, yaw: -0.25, h: -3.6, fov: 40 }), () => ({ x: lerp(k.x, boat.x, 0.5), y: -4.2, dist: 10.5, yaw: -0.3, h: -3.8, roll: 0.05, fov: 36 }), 5), 1.6);
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
    const stopBread = this.ticker(() => {
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
    });
    this.shot(() => ({ x: lerp(k.x, bxx, 0.5), y: lerp(k.y, byy, 0.5) + 0.5, dist: 9.5, yaw: 0.1, h: 0.2 }), 2);
    await this.until(() => byy < target + 1.6);
    // the reveal: a whip-pan and a snap zoom onto the slice, an angelic shimmer
    this.whip();
    this.shot(() => ({ x: bxx, y: byy + 0.35, dist: 5.8, yaw: 0.14, h: 0.05, roll: 0.04, fov: 26 }), 5);
    audio.play('shimmer', { vol: 0.6, dry: true, rate: 0.9 }); audio.play('magic', { vol: 0.25, dry: true, rate: 1.3 });
    w.fx.emit('star', bxx, byy, { n: 6, spread: 0.3, speed: 0.6, life: 1.2, size: 0.16 });
    this.kid.setExpr('chomp', 3);
    const word = this.t3d.add('BREAD!!', 0, 0, 0.7, T3D.gold, { size: 0.62, shake: 0.7, stagger: 0.05, follow: () => ({ x: bxx, y: byy + 1 }), angle: -0.15 });
    await this.wait(1.1, true);
    this.whip();
    this.shot(this.closeUp(() => ({ x: k.x, y: k.y + 0.15 }), { dist: 3.2, yaw: -0.25, roll: -0.05, fov: 26 }), 6);
    await this.talk([
      { who: 'kid', text: '{shake}BREAD!!{/shake}', auto: 0.7 },
      { who: 'mom', text: 'Wait, sweetie—', auto: 0.25, speed: 1.4 },
    ]);
    // the player grabs it
    this.letterbox(0.35, 0.6);
    this.free(false, [H - 9, H + 9]);
    this.followKid(9.5, 0.6);
    this.setGoal({ text: 'Grab the bread!', keys: [['WASD', 'swim']] });
    this.target = { x: bxx, y: byy, label: 'BREAD' };
    const tg0 = this.clock;
    await this.until(() => {
      if (this.target) { this.target.x = bxx; this.target.y = byy; }
      // after a while the kid can't resist
      if (this.clock - tg0 > 14) { this.script_(); this.gate.ax = { x: Math.sign(bxx - k.x), y: clamp((byy - k.y) * 2, -1, 1) }; }
      return this.near(k, { x: bxx, y: byy }, 0.7);
    });
    this.setGoal(null);
    this.target = null;
    word.hide();
    // ---- the grab: a comedic sting and a freeze-frame zoom on the chomp...
    hooked = true;
    this.script_();
    const mouth = new THREE.Vector3();
    k.hooked = true;
    k.hook = { pullX: tip.x, pullY: tip.y, tension: 1, line };
    k.setExpr('chomp', 0.6);
    this.sting('st_slidewhistle', 0.75);
    this.letterbox(1, 0.2);
    this.whip(0.2);
    this.shot(this.closeUp(() => ({ x: k.x, y: k.y + 0.1 }), { dist: 2.6, yaw: 0.1, fov: 22 }), 12);
    this.slowmo(0.06, 0.55);
    await this.wait(0.6, true);
    // ...then the reveal: it's a HOOK. dun dun DUNNN: a yank on each hit, a dutch angle, a slow-mo push-in
    this.sting('st_dundundun', 0.85);
    k.setExpr('scared', 2);
    this.game.addShake(0.7); this.game.flash('#ffffff', 0.5);
    w.sfx('hook_clink1', k.x, 1); w.sfx('reel', k.x, 0.8); w.sfx('rope_strain1', k.x, 0.7);
    this.angler?.play('yank');
    k.push(0.4, 4.5);
    this.shot(this.push(this.closeUp(() => ({ x: k.x, y: k.y + 0.4 }), { dist: 6, yaw: -0.2, roll: 0.16, fov: 34 }), this.closeUp(() => ({ x: k.x, y: k.y + 0.3 }), { dist: 3.6, yaw: -0.12, roll: 0.2, fov: 28 }), 2.2), 6);
    this.slowmo(0.45, 1.6);
    const tr = this.real;
    let hits = 1;
    this.ticker(() => {
      if (hits === 1 && this.real - tr > 0.43) { hits++; this.game.addShake(0.45); k.push(0.2, 2.5); this.t3d.add('HOOKED!', k.x, k.y + 1.3, 1, T3D.danger, { size: 0.55, life: 1.6, shake: 0.8, enter: 'slam' }); }
      if (hits === 2 && this.real - tr > 0.88) { hits++; this.game.addShake(0.6); this.game.flash('#ffffff', 0.3); return true; }
    });
    let yanking = true;
    this.ticker(() => {
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
    });
    await this.wait(1.3, true);
    await this.talk([{ who: 'kid', text: '{shake}MOM!! DAD!!{/shake}', auto: 0.6 }]);
    // Mom and Dad rush up the line: whip to Dad's face
    this.mom.speed = this.dad.speed = 5.5;
    const above = () => ({ x: line.px[Math.max(0, line.n - 4)], y: line.py[Math.max(0, line.n - 4)] });
    const c0 = this.clock;
    this.dad.p.setExpression('attack'); this.mom.p.setExpression('attack');
    this.whip();
    this.shot(this.closeUp(() => this.face(this.dad), { dist: 3.4, yaw: 0.3, roll: -0.08, fov: 30 }), 5);
    this.bark('dad', '{shake}HOLD ON!{/shake}', 1.4);
    await this.wait(0.9, true);
    this.shot(() => ({ x: (k.x + this.dad.x) / 2, y: (k.y + this.dad.y) / 2 + 0.4, dist: 7.5, yaw: 0.12, h: 0, roll: 0.06, fov: 34 }), 4);
    await this.until(() => { const a = above(); this.dad.tx = a.x + 0.35; this.dad.ty = a.y; this.mom.tx = a.x - 0.4; this.mom.ty = a.y - 0.2; return this.near(this.dad, a, 0.7) || this.clock - c0 > 3.2; });
    // CHOMP: the line parts, the kid falls free
    const a = above();
    this.dad.p.setExpression('chomp'); this.mom.p.setExpression('chomp');
    w.sfx('bite', a.x, 1); w.sfx('chomp', a.x, 0.8);
    this.game.freeze(0.12); this.game.addShake(0.35);
    this.shot(this.closeUp(() => a, { dist: 3.2, yaw: 0.05, fov: 26 }), 10);
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
    const stopNet = this.ticker(() => {
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
    });
    // a wide, low, uneasy shot as the net comes in
    this.shot(() => ({ x: lerp(this.dad.x, nx, 0.3) - 0.5, y: pY - 0.3, dist: 12.5, yaw: -0.22, h: -1.2, roll: -0.08, fov: 38 }), 2.5);
    this.mom.p.setExpression('scared'); this.dad.p.setExpression('scared');
    await this.until(() => nx < this.dad.x + 2.5);
    this.bark('mom', '{shake}SWEETIE, GO!{/shake}', 1.4);
    await this.until(() => nx < this.dad.x + 0.6);
    // caught: slow motion, colour drains, sound goes under, the sad violin
    this.game.addShake(0.4);
    w.sfx('net', nx, 1); w.sfx('thud_heavy', nx, 0.6, 0.7);
    this.mom.held = this.dad.held = true;
    this.normalSpeed();
    this.game.timeScale = 0.32;
    this.setMuffle(1);
    audio.music(null, 2.5);
    this.sting('st_sadviolin', 0.95);
    audio.play('heartbeat1', { vol: 0.5, dry: true, rate: 0.85 });
    this.letterbox(1, 0.6);
    // the kid swims at the net, too slow, too small: over the kid's shoulder
    this.script_(0.6, 0.5);
    k.setExpr('scared', 99);
    const stopHold = this.ticker(() => {
      net.group.updateMatrixWorld(true);
      const pts = [new THREE.Vector3(4.0, 0.2, 0.15), new THREE.Vector3(5.5, -0.1, 0.1)];
      [this.dad, this.mom].forEach((s, i) => {
        const p = net.group.localToWorld(pts[i].clone());
        s.x = damp(s.x, p.x + Math.sin(this.time * 9 + i) * 0.1, 6, this.dt);
        s.y = damp(s.y, p.y + Math.cos(this.time * 7 + i) * 0.1, 6, this.dt);
        s.z = damp(s.z, p.z, 6, this.dt);
        s.p.sb.poke(Math.sin(this.time * 13 + i), Math.cos(this.time * 11), 0.8);
      });
    });
    this.whip();
    this.shot(() => ({ x: lerp(k.x, (this.dad.x + this.mom.x) / 2, 0.7), y: lerp(k.y, this.dad.y, 0.72), dist: 9.5, yaw: -0.36, h: -0.6, roll: 0.05, fov: 38 }), 2);
    await this.talk([{ who: 'kid', text: '{shake}MOM! DAD!{/shake}', auto: 0.8 }]);
    haul = 1;
    w.sfx('rope_creak1', nx, 0.6); w.sfx('chain1', nx, 0.4);
    this.mom.p.setExpression('sad'); this.dad.p.setExpression('brave');
    // their last words: slow push-ins on their faces through the mesh
    await this.talk([
      { who: 'dad', text: 'Be brave, little bubble.', auto: 1.2, speed: 0.75, do: () => this.shot(this.push(this.closeUp(() => this.face(this.dad), { dist: 4.2, yaw: 0.25, fov: 32 }), this.closeUp(() => this.face(this.dad), { dist: 2.6, yaw: 0.2, roll: 0.04, fov: 26 }), 3), 4) },
      { who: 'mom', text: 'We love you. {wave}Always.{/wave}', auto: 1.4, speed: 0.7, do: () => { this.whip(0.25); this.shot(this.push(this.closeUp(() => this.face(this.mom), { dist: 4, yaw: -0.25, fov: 32 }), this.closeUp(() => this.face(this.mom), { dist: 2.5, yaw: -0.2, roll: -0.04, fov: 26 }), 3), 4); } },
    ]);
    // hauled away: tilt up after the net to the boat's silhouette
    this.script_(0, 0.3);
    this.shot(() => ({ x: lerp(k.x, nx, 0.35), y: Math.min(-1.6, lerp(k.y, ny, 0.6)), dist: 13, yaw: -0.15, h: -2.6, fov: 36 }), 1.2);
    await Promise.race([this.until(() => ny > -0.6), this.wait(9)]);
    // gone: a splash far above
    w.fx.splash(nx, 1.4); w.sfx('splash_b', nx, 0.4);
    net.setVisible(false);
    this.mom.p.root.visible = false; this.dad.p.root.visible = false;
    this.mom.held = this.dad.held = false;
    stopHold();
    await this.wait(0.6, true);
    stopNet();
    net.dispose();
  }

  // ---------------------------------------------------------------- c. alone (wordless)
  private async alone() {
    const k = this.kid, w = this.world, boat = this.boat!;
    if (this.beat0 === 'alone') {
      this.mom.p.root.visible = false; this.dad.p.root.visible = false;
      this.place(this.home + 2, this.famY(this.home) + 0.5);
      boat.setX(this.home + 3);
      this.letterbox(1, 0.01); this.fade(0, 1);
      POST.uDesat.value = 0.85;
    }
    // silence: no music, the room tone low, the engine fading as the boat motors away overhead
    this.normalSpeed();
    this.game.timeScale = 0.75;
    this.setMuffle(0.6);
    this.desatT = 0.85;
    audio.music(null, 1.5);
    this.ambience?.set(0.12);
    this.engineK = 0.9; this.engineRate = 0.1;
    let boatX = boat.x;
    const stopBoat = this.ticker(() => { boatX -= 1.6 * this.dt; boat.setX(boatX); this.engineK = Math.max(0, this.engineK - this.dt * 0.08); });
    this.script_(0, 0);
    this.sinking = true;
    k.setExpr('sad', 99);
    this.tears = 1;
    audio.play('heartbeat1', { vol: 0.35, dry: true, rate: 0.75 });
    // the push-in: from wide and low (the hull leaving across the bright surface) to the kid's face, very slowly
    const kx = k.x, ky = k.y;
    this.shot(this.push({ x: kx + 2.2, y: ky + 2.6, dist: 17, yaw: -0.22, h: -3.4, roll: 0, fov: 42 }, () => ({ x: k.x + 0.08, y: k.y + 0.15, dist: 2.7, yaw: 0.22, h: 0.12, roll: 0.03, fov: 25 }), 10), 2.5);
    this.snapCam();
    await this.wait(5.5, true);
    w.fx.emit('bubble', k.x + 0.1, k.y + 0.3, { n: 4, spread: 0.08, speed: 0.4, vy: 0.6 });
    await this.wait(5.5, true);
    this.fade(1, 3);
    audio.play('heartbeat1', { vol: 0.25, dry: true, rate: 0.7 });
    await this.wait(3.4, true);
    stopBoat();
    this.tears = 0;
    this.sinking = false;
    this.engineK = 0;
    this.normalSpeed();
    this.setMuffle(0, true);
    this.ambience?.set(0.3);
  }

  // ---------------------------------------------------------------- d. Mr. Crab
  private async crabBeat() {
    const k = this.kid, cx = this.crabX;
    this.mom.p.root.visible = false; this.dad.p.root.visible = false;
    this.boat?.setX(this.home + 200);
    // (the family scene's soft walls end here: the kid is far down the reef now)
    this.bounds = null;
    this.place(cx - 9, this.floorAt(cx - 9) + 2.6);
    k.setExpr('sad', 99);
    this.letterbox(1, 0.01);
    this.script_(0.55, 0.12);
    POST.uDesat.value = Math.max(POST.uDesat.value, 0.5);
    this.desatT = 0.5;
    this.shot(() => ({ x: lerp(k.x, cx, 0.4), y: this.floorAt(cx) + 2.3, dist: 10, yaw: 0.22, h: 0.5, fov: 36 }), 2);
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
    this.setGoal({ text: 'Swim to the shop', keys: [['WASD', 'swim']] });
    await this.until(() => k.x > cx - 3.4);
    this.setGoal(null);
    name.hide();
    this.script_();
    // the kid drifts up to the shop window
    const cp = this.crab.group.position;
    this.ticker(() => { if (this.control !== 'script' || this.step >= 0) return true; const dx = cp.x - 1.7 - k.x, dy = cp.y + 0.85 - k.y; this.gate.ax = { x: clamp(dx * 0.8, -0.6, 0.6), y: clamp(dy * 0.8, -0.6, 0.6) }; });
    this.letterbox(1, 0.6);
    this.desatT = 0;
    this.crab.lookX = k.x;
    // the reveal: a twist sting, a whip-pan and a push-in on the shopkeeper in his window
    this.sting('st_twist', 0.7);
    this.whip();
    this.shot(this.push({ x: cp.x, y: cp.y + 0.8, dist: 5.5, yaw: -0.1, h: 0.2, fov: 34 }, { x: cp.x, y: cp.y + 0.75, dist: 3.0, yaw: -0.12, h: 0.15, roll: 0.03, fov: 28 }, 2.5), 5);
    await this.talk([
      { who: 'crab', text: 'Oi. Shop\'s closed.' },
      { who: 'crab', text: '...You\'re the Bubble kid. Heard about your folks. {p=0.3}Rotten business.' },
    ]);
    this.shot(() => ({ x: lerp(k.x, cp.x, 0.62), y: cp.y + 0.6, dist: 5.3, yaw: -0.16, h: 0.2, fov: 34 }), 2.5);
    const p1 = await this.talk([
      { who: 'kid', text: '...', choices: [{ text: 'I want revenge.' }, { text: 'I need a weapon.' }, { text: '...Do you have bread?' }] },
    ]);
    if (p1[0] === 0) await this.talk([{ who: 'crab', text: 'Revenge, huh. {gold}Big{/gold} word for a small fish.' }]);
    else if (p1[0] === 1) await this.talk([{ who: 'crab', text: 'Everybody wants a weapon. Few know which end to hold.' }]);
    else await this.talk([{ who: 'crab', text: '{shake}NO.{/shake} No bread. Bread\'s how they get you, kid. {grey}Bread\'s how they got my brother.{/grey}' }]);
    await this.talk([
      { who: 'crab', text: 'Humans took my left claw once. Grew a new one. It\'s smaller. {p=0.3}We don\'t talk about it.' },
      { who: 'crab', text: 'Here.', do: () => this.crab.snip() },
    ]);
    // the toothpick: a slow-mo push-in on the kid as it pops into his fin
    k.setGear({ ...DEFAULT_GEAR });
    k.model.weaponVisible = true;
    this.armed = true;
    k.play('gearUp');
    k.setExpr('cheer', 1.4);
    this.slowmo(0.4, 1.5);
    this.whip(0.2);
    this.shot(this.push(this.closeUp(() => ({ x: k.x, y: k.y + 0.25 }), { dist: 3.6, yaw: 0.35, fov: 30 }), this.closeUp(() => ({ x: k.x, y: k.y + 0.25 }), { dist: 2.2, yaw: 0.28, roll: 0.06, fov: 24 }), 1.6), 6);
    this.world.fx.burst('star', k.x, k.y + 0.4, 10, 2.5);
    this.world.fx.pickup(k.x, k.y + 0.3, '#ffe08a');
    audio.play('jin_rare1', { vol: 0.6, dry: true }); audio.play('sw_swish1', { vol: 0.5, dry: true, rate: 1.2 });
    this.t3d.add('TOOTHPICK SWORD', k.x, k.y + 1.4, 0.6, T3D.item, { size: 0.3, life: 3.2, stagger: 0.03, angle: 0.2 });
    await this.wait(1.8, true);
    this.shot(() => ({ x: lerp(k.x, cp.x, 0.62), y: cp.y + 0.6, dist: 5.3, yaw: -0.16, h: 0.2, fov: 34 }), 2.5);
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
  /** the soft walls while the lessons run (a little behind the shop .. the far end of the reef) */
  private tutBounds(): [number, number] { return [this.crabX - 8, this.area.bounds.x1 - 2]; }
  /** where the lessons may put their props: past the shop, short of the mail buoy */
  private lane(): [number, number] { return [this.crabX + 4, this.area.mailbox.x - 3]; }
  /** a span of `len` metres starting `gap` ahead of x, toward the mail buoy if it fits there, else back the other way */
  private ahead(x: number, gap: number, len: number): { x0: number; dir: 1 | -1 } {
    const [lo, hi] = this.lane();
    if (x + gap + len <= hi) return { x0: Math.max(lo, x + gap), dir: 1 };
    if (x - gap - len >= lo) return { x0: x - gap, dir: -1 };
    return { x0: clamp(x + gap, lo, hi - len), dir: 1 };
  }
  /** a lesson's name card: a big bubble word up ahead of the kid (and the key under it) */
  private lessonCard(title: string, sub: string) {
    // over the middle of the shot the lesson just framed, in its upper half
    const c = this.camFn();
    const x = c.x, y = Math.min(-1.6, c.y + c.dist * 0.17);
    this.t3d.add(title, x, y, 0.4, T3D.title, { size: 0.62, life: 2.8, enter: 'drop', stagger: 0.07, angle: 0.15 });
    if (sub) this.t3d.add(sub, x, y - 0.72, 0.4, T3D.sub, { size: 0.26, life: 2.6, delay: 0.5, stagger: 0.03, angle: 0.15 });
    audio.play('jin_arrive', { vol: 0.32, dry: true, rate: 1.15 });
  }
  /** the kid and a point in one frame (a two-shot whose distance follows the gap between them) */
  private twoShot(p: () => { x: number; y: number }, k = 2.5, min = 9, h = 0.5) {
    const kid = this.kid;
    this.shot(() => {
      const q = p(), mx = (kid.x + q.x) / 2, my = (kid.y + q.y) / 2;
      const span = Math.max(Math.abs(kid.x - q.x), Math.abs(kid.y - q.y) * 1.8);
      return { x: mx, y: Math.max(my + 0.4, this.floorAt(mx) + 2.2), dist: clamp(6 + span, min, 14), yaw: 0.08, h };
    }, k);
  }
  /** a short camera punch-in (catches, rings): `sec` real seconds on the framing, then back to `back` */
  private punch(at: () => { x: number; y: number }, sec: number, back: () => void, dist = 5.5) {
    this.shot(this.closeUp(at, { dist, yaw: 0.12, fov: 30 }), 7);
    const t0 = this.real, g = this.gen;
    this.ticker(() => { if (g !== this.gen) return true; if (this.real - t0 >= sec) { back(); return true; } });
  }

  private async tutorial(from: number) {
    const k = this.kid;
    if (this.beat0 === 'tutorial') {
      this.mom.p.root.visible = false; this.dad.p.root.visible = false;
      this.boat?.setX(this.home + 200);
      k.setGear({ ...DEFAULT_GEAR });
      k.model.weaponVisible = true;
      this.armed = true;
      const cx = this.crabX;
      const sx = [cx - 1, cx + 25, cx + 22, cx + 17, cx + 22, cx + 22, this.area.mailbox.x - 12][from];
      this.place(sx, this.floorAt(sx) + (from === 1 ? 3.6 : 2.2));
      if (from > 0) this.crab.group.position.set(sx - 3, this.floorAt(sx - 3) - 0.05, -0.45);
      if (from >= L.parry) this.bag.push(materialId('seaGlass'), materialId('seaGlass'));
      this.fade(0, 1);
      audio.music('mu_shallows', 1.5);
    } else audio.music('mu_shallows', 3);
    this.letterbox(0, 1);
    this.free(true, this.tutBounds());
    this.followKid(11.5, 0.7);
    if (this.crabMode !== 'follow') this.crabVy = this.crab.group.position.y > this.floorAt(this.crab.group.position.x) + 0.3 ? 3.2 : 0;
    this.crabMode = 'follow';
    const lessons = [() => this.lessonSwim(), () => this.lessonDart(), () => this.lessonCharge(), () => this.lessonBottles(), () => this.lessonParry(), () => this.lessonHeal(), () => this.lessonMail()];
    for (let i = from; i < lessons.length; i++) {
      this.step = i;
      await lessons[i]();
      audio.play('jin_good', { vol: 0.5, dry: true });
      this.setGoal(null);
      this.free(true, this.tutBounds());
      await this.wait(0.7);
    }
  }

  /** 1: SWIM: a slalom through four kelp gates (low, high, low, high), then a warm current to ride */
  private async lessonSwim() {
    const k = this.kid, w = this.world, cx = this.crabX;
    const xs = [cx + 5.5, cx + 9, cx + 12.5, cx + 16];
    // high, low, high, low (the first one lifts the kid over the rocks by the shop); every gap clear of the scenery
    const clear = (x: number, y: number) => Math.min(w.terrain.sdf(x, y), w.terrain.sdf(x - 1, y), w.terrain.sdf(x + 1, y));
    const gates = xs.map((x, i) => {
      const f = this.floorAt(x);
      let gy = i % 2 ? f + 2.7 : f + 6.0;
      for (let t = 0; t < 12 && clear(x, gy) < 1.5; t++) gy += 0.4;
      const g = new KelpGate(x, f, Math.min(gy, -2.4), 2.9, -0.3, i * 2.1 + 1);
      g.addTo(this.worldScene);
      return g;
    });
    this.dbg = { gates };
    const tick = () => { for (const g of gates) g.update(this.dt, this.time); };
    // the establishing pan along the gates while Mr. Crab explains
    this.script_();
    this.letterbox(1, 0.6);
    const f0 = this.floorAt(xs[1]);
    const stopTick = this.ticker(() => { tick(); });
    this.shot(this.push(() => ({ x: k.x + 2, y: k.y + 0.8, dist: 10, yaw: 0.1, h: 0.6 }), { x: xs[2] + 1.5, y: f0 + 4.4, dist: 16, yaw: 0.22, h: 1.2, fov: 38 }, 2.6), 3);
    await this.talk([
      { who: 'crab', text: 'Lesson one: {gold}swim{/gold}. Weave through the gaps in the kelp.' },
      { who: 'crab', text: '{gold}WASD{/gold} or the {gold}arrow keys{/gold}. Up, down, up, down. Like a sea snake. A {wave}fancy{/wave} one.' },
    ]);
    this.letterbox(0, 0.8);
    this.free(true, this.tutBounds());
    this.followKid(11.5, 0.7);
    this.lessonCard('SWIM', 'WASD / ARROWS');
    let n = 0;
    const cheers = ['That\'s it!', 'Up, up, up!', 'Now dive!', 'Look at those fins go!'];
    const goal = () => this.setGoal({ text: 'Swim through the kelp gates', n, of: 4, keys: [['WASD', ''], ['ARROWS', 'swim']] });
    goal();
    await this.until(() => {
      const next = gates.find((g) => !g.passed);
      for (const g of gates) g.ring.highlight(g === next ? 1 : 0);
      if (next) this.target = { x: next.x, y: next.gapY, label: 'GATE' };
      for (const g of gates) { const p = g.push(k.x, k.y); if (p.y) k.applyForce(p.x, p.y); }
      const a = this.segA, b = this.segB;
      for (const g of gates) {
        if (g.passed || (a.x - g.x) * (b.x - g.x) > 0 || a.x === b.x) continue;
        g.passed = true; n++;
        const through = Math.abs(b.y - g.gapY) < g.gapH / 2 + 0.2;
        g.ring.burst();
        w.sfx('bubble', g.x, 0.7, 1); w.sfx('k_glass', g.x, 0.45, 1.2 + n * 0.18); audio.play('jin_catch', { vol: 0.3, dry: true, rate: 0.9 + n * 0.12 });
        w.fx.emit('bubbleBig', g.x, g.gapY, { n: 14, spread: 0.9, speed: 2.2 });
        w.fx.burst('star', g.x, g.gapY, 6, 2.5);
        this.t3d.add(n < 4 ? `${n}` : 'GO!', g.x + 0.6, g.gapY + 1.3, 0.8, n < 4 ? T3D.gold : T3D.heal, { size: 0.5, life: 1, rise: 0.8 });
        if (through) this.bark('crab', cheers[n - 1], 1.8);
        goal();
      }
      return n >= 4;
    });
    this.target = null;
    // the current: it carries the kid on to the minnow's patch
    const fc = this.floorAt(xs[3] + 6);
    const g4 = gates[3];
    const cur = new CurrentStream([[xs[3] + 0.6, g4.gapY], [xs[3] + 3.4, g4.gapY + 0.7], [xs[3] + 6.5, fc + 4.6], [xs[3] + 9.5, fc + 3.9], [xs[3] + 11.5, fc + 3.8]], 1.7, 34);
    this.worldScene.add(cur.group);
    this.dbg.cur = cur;
    cur.setOn(true);
    const flow = audio.loop('lp_flow', 0, 1.1);
    this.setGoal({ text: 'Ride the current!', keys: [['WASD', 'steer']] });
    this.bark('crab', 'Feel that? A warm current. {wave}Hop on!{/wave}', 2.6);
    this.target = { x: cur.start.x, y: cur.start.y, label: 'CURRENT' };
    let riding = 0, cheered = false;
    const end = cur.end;
    await this.until(() => {
      cur.update(this.dt, w.fx);
      const f = cur.flow(k.x, k.y);
      if (f.k > 0) k.applyForce(f.x, f.y);
      riding = damp(riding, f.k > 0.05 ? 1 : 0, 4, this.dt);
      flow.set(0.05 + riding * 0.35, 0.9 + riding * 0.4);
      if (f.k > 0.1) {
        this.target = null;
        if (!cheered) {
          cheered = true;
          k.setExpr('cheer', 2.5);
          w.sfx('flood_rush', k.x, 0.45, 1.2);
          this.t3d.add('WHEEE!', 0, 0, 0.8, T3D.heal, { size: 0.5, life: 1.6, stagger: 0.05, follow: () => ({ x: k.x, y: k.y + 1.2 }) });
          // ride-along: a wider lens, the camera leads with the flow
          this.shot(() => ({ x: k.x + 1.6, y: clamp(k.y + 0.6, this.floorAt(k.x) + 2.4, -2.4), dist: 12.5, yaw: -0.12, h: 0.5, fov: 44 }), 3);
        }
      }
      return k.x > end.x - 1.2 || (cheered && cur.along(k.x, k.y) > 0.96);
    });
    this.target = null;
    cur.setOn(false);
    flow.stop(1);
    this.followKid(11.5, 0.7);
    this.bark('crab', 'Hah! Showing off already.', 2);
    stopTick();
    // the gates and the current fade off behind the kid
    const t0 = this.clock;
    this.ticker(() => {
      tick(); cur.update(this.dt);
      if (this.clock - t0 < 2.5) return false;
      for (const g of gates) g.dispose();
      cur.dispose();
      return true;
    });
  }

  /** 2: DART: a quick little minnow you can only really catch with a tap of SHIFT */
  private async lessonDart() {
    const k = this.kid, w = this.world, cx = this.crabX;
    const [, hi] = this.lane();
    const f = this.floorAt(cx + 23);
    const box = { x0: cx + 17.5, x1: Math.min(hi - 0.5, cx + 29), y0: f + 1.3, y1: f + 7 };
    const fish = new Minnow(box.x0 + 2.2, f + 4.2);
    this.worldScene.add(fish.group);
    this.dbg = { fish, box };
    const at = () => ({ x: fish.x, y: fish.y });
    let caught = 0, dartT = 0, near = 0, nearWas = false, nag = -9, tLast = this.clock, listen = true;
    w.on('dash', (d) => { if (listen && !d.charged) dartT = 0.5; });
    // keep the fish swimming through the cutscene
    let live = true;
    this.ticker(() => { if (!live) return true; if (this.control === 'script') fish.update(this.dt, k.x, k.y, box, 2.2); });
    // the reveal: a squeak, a whip-pan to the minnow peeking out
    this.script_();
    this.letterbox(1, 0.4);
    this.whip();
    this.shot(this.closeUp(at, { dist: 4.2, yaw: -0.15, fov: 30 }), 6);
    w.sfx('fish_squeak', fish.x, 0.5, 1.5);
    await this.wait(0.9, true);
    await this.talk([
      { who: 'crab', text: 'Ooh. A minnow. Quickest thing on the reef.' },
      { who: 'crab', text: 'You\'ll never catch it just paddling. {gold}Tap SHIFT{/gold} to {shake}dart{/shake} at it!' },
    ]);
    this.letterbox(0, 0.6);
    this.free(true, this.tutBounds());
    this.twoShot(at, 2.5, 9.5);
    this.lessonCard('DART', 'TAP SHIFT');
    const goal = () => this.setGoal({ text: 'Catch the minnow', n: caught, of: 2, keys: [['SHIFT', 'tap: dart']] });
    goal();
    await this.until(() => {
      dartT -= this.dt;
      // a player who can't get it: after a while the minnow tires
      fish.slow = clamp((this.clock - tLast - 12) / 10, 0, 1);
      if (this.control === 'free') fish.update(this.dt, k.x, k.y, box, 4.8 + caught * 0.3);
      if (caught >= 2) return !fish.stunned;
      const d = Math.hypot(fish.x - k.x, fish.y - k.y);
      // close but no dart: Mr. Crab reminds you (not too often)
      const isNear = d < 1.9;
      if (isNear && !nearWas) near++;
      nearWas = isNear;
      if (near >= 3 && dartT <= 0 && this.clock - nag > 6) { nag = this.clock; near = 0; this.bark('crab', 'Now! {gold}Tap SHIFT{/gold}! Dart!', 2); }
      if (fish.catchable && d < (dartT > 0 ? 1.05 : 0.8)) {
        caught++;
        tLast = this.clock;
        fish.caught();
        this.game.freeze(0.08); this.game.addShake(0.25);
        w.sfx('fish_squeak', fish.x, 0.7, 1.7); w.sfx('pop', fish.x, 0.7, 1.1); audio.play('jin_catch', { vol: 0.45, dry: true, rate: 1 + caught * 0.15 });
        w.fx.burst('star', fish.x, fish.y, 10, 3); w.fx.emit('bubbleBig', fish.x, fish.y, { n: 12, spread: 0.5, speed: 2.5 });
        k.setExpr('cheer', 1.5);
        this.t3d.add(caught < 2 ? 'GOTCHA!' : 'GOT IT!', fish.x, fish.y + 1.1, 0.9, T3D.gold, { size: 0.5, life: 1.3, rise: 0.7, shake: 0.3 });
        this.bark('crab', dartT > 0 ? (caught < 2 ? 'Ha! Like a harpoon! Again!' : 'Quick fins. I like it.') : (caught < 2 ? 'Sneaky. Now try a dart.' : 'Got it. Good.'), 2.2);
        this.punch(() => ({ x: (k.x + fish.x) / 2, y: (k.y + fish.y) / 2 + 0.2 }), 0.7, () => this.twoShot(at, 2.5, 9.5), 5);
        goal();
      }
      return caught >= 2 && !fish.stunned;
    });
    listen = false;
    live = false;
    // the minnow zips off home
    this.followKid(11.5, 0.7);
    const fx0 = fish.x;
    this.ticker(() => {
      fish.update(this.dt, fish.x - 3, fish.y - 1, { x0: fx0 - 40, x1: fx0 + 40, y0: -40, y1: 0 }, 6);
      if (Math.abs(fish.x - fx0) > 14 || fish.y > -1) { fish.dispose(); return true; }
    });
  }

  /** 3: CHARGE: hold SHIFT to wind up a charged dash, let go to burst through three bubble rings in one go */
  private async lessonCharge() {
    const k = this.kid, w = this.world;
    const sp = 2.3;
    const { x0, dir } = this.ahead(k.x, 3.6, sp * 2);
    const ry = clamp(k.y, this.floorAt(x0) + 2.4, this.floorAt(x0) + 5.5);
    const rings = [0, 1, 2].map((i) => { const r = new BubbleRing(x0 + dir * i * sp, ry + i * 0.05, 0.95, '#d8f4ff'); this.worldScene.add(r.group); return r; });
    const mid = { x: x0 + dir * sp, y: ry };
    this.dbg = { rings, dir };
    const tick = () => { for (const r of rings) r.update(this.dt); };
    const stopTick = this.ticker(() => { tick(); });
    // the establishing shot along the rings
    this.script_();
    this.letterbox(1, 0.5);
    this.shot(this.push(() => ({ x: lerp(k.x, mid.x, 0.5), y: ry + 0.8, dist: 10, yaw: 0.1, h: 0.4 }), { x: mid.x + dir * 0.6, y: ry + 0.3, dist: 7.5, yaw: -0.25 * dir, h: 0.3, fov: 32 }, 2.4), 4);
    await this.talk([
      { who: 'crab', text: 'Now the big one. {gold}HOLD SHIFT{/gold} and you wind up. Like a spring. A {wave}squishy{/wave} spring.' },
      { who: 'crab', text: 'Aim at the rings with your mouse — or hold a direction — and {shake}LET GO{/shake}. Straight through all three!' },
    ]);
    this.letterbox(0, 0.6);
    this.free(true, this.tutBounds());
    const frame = () => this.twoShot(() => ({ x: rings[2].x, y: ry }), 2.5, 9);
    frame();
    this.lessonCard('CHARGE', 'HOLD SHIFT, LET GO');
    let n = 0, chargedT = 0, warned = -9, charging = false, chargeT0 = 0, misses = 0, listen = true;
    const t0 = this.clock;
    w.on('dash', (d) => { if (listen && d.charged) chargedT = 0.8; });
    const goal = () => this.setGoal({ text: 'Charge-dash through the rings', n, of: 3, keys: [['SHIFT', 'hold, then let go']] });
    goal();
    await this.until(() => {
      chargedT -= this.dt;
      const next = rings.find((r) => !r.passed);
      for (const r of rings) r.highlight(r === next ? 1 : 0.3);
      this.target = next && Math.abs(k.x - next.x) > 7 ? { x: next.x, y: next.y, label: 'RINGS' } : null;
      // the wind-up: time slows and the camera leans in on the kid, the rings in the frame behind
      const isCharging = k.combat.move === 'dashCharge';
      if (isCharging && !charging) {
        charging = true; chargeT0 = this.real;
        this.slowTok++; this.game.timeScale = 0.45;
        this.shot(() => { const r = next ?? rings[2]; return { x: lerp(k.x, r.x, 0.35), y: lerp(k.y, r.y, 0.35) + 0.3, dist: 6.2, yaw: -0.18 * dir, h: 0.25, fov: 30 }; }, 4);
        audio.play('charge', { vol: 0.35, dry: true, rate: 0.8 });
      } else if (charging && (!isCharging || this.real - chargeT0 > 4)) {
        charging = false;
        this.normalSpeed();
        this.whip(0.2);
        this.shot(() => ({ x: k.x + clamp(k.vx * 0.25, -2.5, 2.5), y: Math.max(k.y + 0.4, this.floorAt(k.x) + 2.2), dist: 10, yaw: 0.06, h: 0.4, fov: 38 }), 5);
        const back = this.real;
        this.ticker(() => { if (this.real - back > 1.2) { if (rings.some((r) => !r.passed)) frame(); return true; } });
      }
      const a = this.segA, b = this.segB;
      // patience: after a long struggle any pass will do
      const lenient = this.clock - t0 > 40 || misses >= 5;
      for (const r of rings) {
        if (!r.crossed(a.x, a.y, b.x, b.y)) continue;
        if (chargedT > 0 || k.combat.move === 'dash' || lenient) {
          r.burst(); n++;
          w.sfx('pop', r.x, 0.8, 1 + n * 0.15); w.sfx('k_glass', r.x, 0.5, 1.4 + n * 0.2);
          w.fx.burst('star', r.x, r.y, 10, 3); w.fx.emit('bubbleBig', r.x, r.y, { n: 16, spread: 0.9, speed: 2.4 });
          if (n === 1) this.t3d.add('WHOOSH!', r.x, r.y + 1.3, 0.7, T3D.gold, { size: 0.5, life: 1.1, rise: 0.7 });
          if (n === 3) { this.game.addShake(0.3); this.game.freeze(0.06); this.t3d.add('PERFECT!', mid.x, ry + 1.6, 0.8, T3D.heal, { size: 0.55, life: 1.5, rise: 0.5, enter: 'slam' }); }
          goal();
        } else if (this.clock - warned > 2.5) {
          warned = this.clock; misses++;
          this.bark('crab', 'Not like that! {gold}HOLD SHIFT{/gold}, aim, then let go!', 2.4);
        }
      }
      return n >= 3;
    });
    listen = false;
    this.target = null;
    if (charging) this.normalSpeed();
    this.followKid(11.5, 0.7);
    this.bark('crab', 'Hah. Slippery little thing.', 2.2);
    await this.wait(1);
    stopTick();
    for (const r of rings) r.dispose();
  }

  /** 4: SLASH: three giant glass bottles (human trash): slash them, they shatter */
  private async lessonBottles() {
    const k = this.kid, w = this.world;
    const kinds: BottleKind[] = ['beer', 'jar', 'soda'];
    const lines = ['Humans. Leave their trash everywhere.', 'Ha! Pickles.', 'Now {wave}that\'s{/wave} recycling.'];
    const words = ['CRASH!', 'SMASH!', 'TINKLE!'];
    const bs: GlassBottle[] = [];
    let broken = 0;
    const { x0, dir } = this.ahead(k.x, 3.2, 4.4);
    const goal = () => this.setGoal({ text: 'Smash the bottles', n: broken, of: 3, keys: [['LMB', ''], ['J', 'slash']] });
    kinds.forEach((kind, i) => {
      const x = x0 + dir * i * 2.2;
      const b = new GlassBottle(kind, x, this.floorAt(x));
      b.onBreak = () => {
        broken++;
        w.drop(b.x, b.y + 0.3, { item: materialId('seaGlass') });
        this.t3d.add(words[i], b.x, b.y + 1.3, 0.6, T3D.gold, { size: 0.45, life: 1.2, rise: 0.6 });
        this.bark('crab', lines[i], 2.2);
        goal();
      };
      w.add(b);
      bs.push(b);
    });
    const mx = x0 + dir * 2.2, my = this.floorAt(mx);
    this.dbg = { bottles: bs };
    // a look at the trash first
    this.script_();
    this.whip(0.25);
    this.shot({ x: mx, y: my + 1.6, dist: 7.5, yaw: 0.15 * dir, h: 0.6, fov: 34 }, 5);
    await this.talk([{ who: 'crab', text: 'Human trash. Glass. {gold}Click{/gold} (or {gold}J{/gold}) to slash. Hit it till it pops — we\'ll keep the pieces.' }]);
    this.free(true, this.tutBounds());
    this.twoShot(() => ({ x: mx, y: my + 1.2 }), 2.5, 9);
    this.lessonCard('SLASH', 'CLICK OR J');
    goal();
    this.target = { x: mx, y: my + 1, label: 'BOTTLES' };
    await this.until(() => { if (this.target && Math.abs(k.x - mx) < 6) this.target = null; return bs.every((b) => !b.alive); });
    this.target = null;
    this.followKid(11.5, 0.7);
    // pick up the glass (the magnet does most of it)
    this.setGoal({ text: 'Grab the sea glass' });
    await Promise.race([this.until(() => this.bag.length >= 3), this.wait(5)]);
  }

  /** 5: PARRY: Mr. Crab lobs shells; tap K / right click as one flashes */
  private async lessonParry() {
    const w = this.world, k = this.kid;
    // he steps out in front of the kid so the shells come from where the kid is looking
    const [lo, hi] = this.lane();
    const side = k.x + 3.4 < hi ? 1 : k.x - 3.4 > lo ? -1 : (Math.sign(this.crab.group.position.x - k.x) || 1);
    this.crabMode = 'goto'; this.crabGoal = k.x + side * 3.4;
    const goal = (n: number) => this.setGoal({ text: 'Parry the shell as it flashes', n, of: 2, keys: [['RMB', ''], ['K', 'tap']] });
    goal(0);
    this.twoShot(() => { const g = this.crab.group.position; return { x: g.x, y: g.y + 0.6 }; }, 2.5, 8);
    await this.talk([{ who: 'crab', text: 'Now the important bit. When something flies at you, {gold}right-click (or K){/gold} right as it {shake}flashes{/shake}. That\'s a parry. Face me.' }]);
    this.free(true, this.tutBounds());
    this.lessonCard('PARRY', 'RIGHT CLICK OR K');
    // frame the two of them: the throw, the flight and the parry all in shot
    this.shot(() => {
      const g = this.crab.group.position, mx = (k.x + g.x) / 2, my = (k.y + g.y + 0.6) / 2;
      const span = Math.max(Math.abs(k.x - g.x), Math.abs(k.y - g.y - 0.6) * 1.8);
      return { x: mx, y: Math.max(my, this.floorAt(mx) + 1.6), dist: clamp(6.5 + span, 8, 13), yaw: 0.1, h: 0.45 };
    }, 2.5);
    let parries = 0, thrown = 0, inFlight: ShellShot | null = null, nextT = 0.6;
    const claw = () => { const g = this.crab.group.position; return { x: g.x - side * 0.55, y: g.y + 0.75 }; };
    await this.until(() => {
      this.crab.lookX = k.x;
      // stay a few metres in front of the kid
      const want = clamp(k.x + side * 3.4, lo - 2, hi + 2);
      if (Math.abs(this.crabGoal - want) > 1.2) this.crabGoal = want;
      if (inFlight && !inFlight.alive) inFlight = null;
      if (!inFlight && parries < 2) {
        nextT -= this.dt;
        if (nextT <= 0) {
          const c = claw();
          this.crab.snip();
          k.combat.lastParry = null;
          w.sfx('swish_a', c.x, 0.5, 1.3);
          thrown++;
          // after a few misses the shells come slower (a longer look at the flash)
          const s = new ShellShot(c.x, c.y, claw, thrown > 4 ? 1.7 : 2.2, (ww, sh) => glint(ww, sh.x, sh.y, { size: 0.8, follow: () => ({ x: sh.x, y: sh.y }) }));
          s.onResolve = (res) => {
            nextT = 1.5;
            // patience: after many throws a block will do
            const ok = res === 'parried' || (thrown >= 8 && res === 'blocked');
            if (ok) {
              parries++;
              // the moveset calls out PARRY! itself: the count rides above it
              this.t3d.add(`${parries} / 2`, k.x, k.y + 1.75, 0.8, T3D.gold, { size: 0.4, life: 1.1, rise: 0.6 });
              goal(parries);
              this.bark('crab', parries >= 2 ? (res === 'parried' ? 'That\'s it! You got it!' : 'Close enough. You\'ll learn the hard way.') : 'Ha! Again!', 2);
              if (parries >= 2) { this.game.addShake(0.2); this.punch(() => ({ x: k.x, y: k.y + 0.2 }), 0.6, () => this.followKid(11.5, 0.7), 4.5); }
            } else if (res === 'blocked') this.bark('crab', k.combat.lastParry === 'late' ? 'A hair late! Tap right as it {shake}FLASHES{/shake}.' : 'That\'s a block. {gold}Tap{/gold} it, don\'t hold it.', 2.6);
            else if (res === 'dodged' || res === 'immune') this.bark('crab', 'Dodging works too. But I said {shake}PARRY{/shake}.', 2.6);
            else {
              const facing = (s.x - k.x) * (k.aim.x >= 0 ? 1 : -1) > -0.35;
              this.bark('crab', facing ? 'Too slow! Tap right as it {shake}FLASHES{/shake}.' : 'Face the shell, kid! Then tap!', 2.6);
            }
          };
          w.add(s);
          inFlight = s;
          this.dbg = { shell: s };
        }
      }
      // training: the kid can't drop below half its health
      if (k.hp < k.maxHp / 2) k.hp = Math.ceil(k.maxHp / 2);
      return parries >= 2 && !inFlight;
    });
    this.crabMode = 'follow';
    this.followKid(11.5, 0.7);
  }

  /** 6: HEAL: the shells left a mark: eat a Healing Clam (R / H) */
  private async lessonHeal() {
    const k = this.kid, w = this.world;
    // the training knocks: down to about half (so the clam shows what it does), and a clam in the pocket
    k.hp = Math.min(k.hp, Math.max(1, Math.ceil(k.maxHp / 2)));
    k.combat.flasks = Math.max(1, k.combat.flasks);
    this.script_();
    this.twoShot(() => { const g = this.crab.group.position; return { x: g.x, y: g.y + 0.6 }; }, 3, 7);
    await this.talk([
      { who: 'crab', text: `Those shells sting, huh? You're down to {red}${hpText(k.hp)}{/red}.` },
      { who: 'crab', text: `Here: a {gold}${HEAL_ITEM.name}{/gold}. Press {gold}${HEAL_ITEM.key}{/gold} (or H) and eat it. Takes a second, so not with a shark in your face.` },
    ]);
    this.free(true, this.tutBounds());
    this.followKid(10, 0.6);
    this.lessonCard('HEAL', `${HEAL_ITEM.key}: EAT A CLAM`);
    this.setGoal({ text: `Eat a ${HEAL_ITEM.name}`, keys: [[HEAL_ITEM.key, 'eat'], ['H', '']] });
    let ate = false, listen = true;
    const hp0 = k.hp, t0 = this.clock;
    w.on('flask', () => { if (listen) ate = true; });
    await this.until(() => {
      if (ate) return true;
      // never stuck: after a while Mr. Crab patches the kid up himself
      if (this.clock - t0 > 30 && !this.dlg.blocking) { k.hp = k.maxHp; this.bark('crab', '...Or don\'t. I\'ll patch you up. {grey}Lazy.{/grey}', 2.6); return true; }
      return false;
    });
    listen = false;
    if (ate) {
      this.t3d.add('YUM!', 0, 0, 0.8, T3D.heal, { size: 0.5, life: 1.3, rise: 0.6, follow: () => ({ x: k.x, y: k.y + 1.2 }) });
      w.fx.burst('heart', k.x, k.y + 0.4, 5, 1.2, { vy: 1, life: 1.2 });
      k.setExpr('happy', 1.5);
      this.bark('crab', `Better? ${hpDelta(Math.max(1, k.hp - hp0))}. Clams are rare out there. Save 'em for when it counts.`, 3);
    }
    await this.wait(1.2);
  }

  /** 7: MAIL: ring the mail buoy, give Marge the glass: it goes home */
  private async lessonMail() {
    const mb = this.area.mailbox, k = this.kid;
    // nothing to send (the glass was left lying about)? Mr. Crab hands some over
    if (this.bag.length + this.run.items.filter((i) => i.gx < 0).length === 0) {
      this.bag.push(materialId('seaGlass'));
      this.bagFlash = 1;
      this.bark('crab', 'You forgot your glass, kid. Here.', 2.4);
      await this.wait(1.2);
    }
    const sign = this.t3d.add('MAIL BUOY', mb.x, -1.4, -0.4, T3D.name, { size: 0.4, angle: -0.2 });
    this.target = { x: mb.x, y: -2.5, label: 'MAIL' };
    this.setGoal({ text: 'Swim to the mail buoy', keys: [['WASD', 'swim']] });
    this.bark('crab', 'Glass is worth something. Mail it home: the manatee carries it. Ring the bell at the buoy.', 4);
    let greeted = false, sent = false, rangT = -1, listen = true;
    this.world.on('extract', () => { if (listen) sent = true; });
    await this.until(() => {
      const nearBuoy = Math.abs(k.x - mb.x) < 6, canRing = Math.abs(k.x - mb.x) < 4.5 && k.y > -8;
      if (nearBuoy) this.target = null;
      if (mb.manatee.state === 'away') this.setGoal(canRing ? { text: 'Ring the bell', keys: [['E', 'ring']] } : { text: nearBuoy ? 'Swim up to the bell' : 'Swim to the mail buoy', keys: [['WASD', 'swim']] });
      else {
        if (rangT < 0) rangT = this.clock;
        if (!mb.present) this.setGoal({ text: 'Marge is on her way...' });
        else this.setGoal({ text: 'Give Marge your loot', keys: [['E', 'send home']] });
      }
      if (!greeted && mb.present && this.near(k, mb.manatee, 5)) { greeted = true; this.greet().catch(() => {}); }
      // never stuck: if the mail run doesn't happen, Mr. Crab waves it through (the loot still goes home at the end)
      if (rangT >= 0 && this.clock - rangT > 45 && !this.dlg.blocking) { this.bark('crab', 'Eh. She\'ll find you later. Come on.', 2.6); return true; }
      return sent;
    });
    listen = false;
    sign.hide();
    this.target = null;
    this.setGoal(null);
    if (sent) {
      this.margeShot();
      await this.wait(1.4);
      this.bark('marge', 'It\'ll be waiting for you, hon. I always find the way.', 3);
      await this.wait(2.6);
    }
    this.followKid(11.5, 0.7);
  }
  /** the kid and Marge in one frame */
  private margeShot() {
    const m = this.area.mailbox.manatee, k = this.kid;
    this.shot(() => ({ x: (k.x + m.x) / 2, y: Math.min(-2.2, (k.y + m.y) / 2), dist: clamp(6.5 + Math.hypot(k.x - m.x, k.y - m.y), 8, 12), yaw: 0.08, h: 0.3 }), 2.5);
  }
  private async greet() {
    if (this.dlg.blocking) return;
    this.script_();
    // a two-shot; the kid drifts up beside her (close enough to hand the parcel over afterwards)
    const m = this.area.mailbox.manatee, k = this.kid;
    this.ticker(() => {
      if (this.control !== 'script') return true;
      const dx = m.x + (k.x < m.x ? -1.9 : 1.9) - k.x, dy = m.y - 0.4 - k.y;
      this.gate.ax = { x: clamp(dx * 0.6, -0.5, 0.5), y: clamp(dy * 0.6, -0.5, 0.5) };
    });
    this.margeShot();
    await this.talk([
      { who: 'marge', text: 'Mornin\', hon! Parcel for... {p=0.2}home? Where\'s home?' },
      { who: 'kid', text: '...I don\'t have one anymore.' },
      { who: 'marge', text: 'Oh, sweetie. {p=0.3}Then I\'ll hold it for you \'til you do.' },
    ]);
    this.free(true, this.tutBounds());
    this.followKid(11.5, 0.7);
  }

  // ---------------------------------------------------------------- f. home
  private async homeBeat() {
    const k = this.kid, hx = this.ruinX, r = this.ruin;
    if (this.beat0 === 'home') {
      this.mom.p.root.visible = false; this.dad.p.root.visible = false;
      this.boat?.setX(this.home + 200);
      k.setGear({ ...DEFAULT_GEAR }); k.model.weaponVisible = true; this.armed = true;
      this.place(hx - 10, this.floorAt(hx - 10) + 2.2);
      this.crab.group.position.set(hx - 12, this.floorAt(hx - 12) - 0.05, -0.45);
      this.fade(0, 1); this.letterbox(0, 0.01);
    }
    this.step = -1;
    this.free(true, null);
    this.followKid(11, 0.7);
    this.bark('crab', 'Come on, kid. I know a place. Needs work.', 3);
    this.crabMode = 'goto'; this.crabGoal = hx - 2.2;
    this.setGoal({ text: 'Follow Mr. Crab' });
    this.target = { x: hx, y: this.floorAt(hx) + 1.5, label: 'HOME' };
    await this.until(() => { if (this.target && Math.abs(k.x - hx) < 9) this.target = null; return Math.abs(k.x - hx) < 4.5; });
    this.setGoal(null); this.target = null;
    for (const t of this.t3d.items) t.hide();
    // the establishing shot: a crane down onto the ruin, the morning music again
    this.script_();
    this.letterbox(1, 0.8);
    audio.music('mu_aquarium', 2.5);
    const door = r.group.localToWorld(r.door.clone());
    this.ticker(() => { if (this.control !== 'script') return true; const dx = door.x + 1.4 - k.x, dy = door.y + 0.6 - k.y; this.gate.ax = { x: clamp(dx * 0.6, -0.5, 0.5), y: clamp(dy * 0.6, -0.5, 0.5) }; });
    this.crab.lookX = k.x;
    this.shot(this.push({ x: hx, y: door.y + 4.5, dist: 14, yaw: 0.3, h: 2.2, fov: 38 }, { x: hx - 0.4, y: door.y + 1.1, dist: 7.6, yaw: 0.16, h: 1.2, fov: 32 }, 4.5), 4);
    this.snapCam();
    await this.wait(2.5, true);
    const p = await this.talk([
      { who: 'crab', text: 'Here we are.' },
      { who: 'crab', text: 'Was my brother\'s place. Nobody\'s lived here since the humans came through.' },
      { who: 'kid', text: '...', choices: [{ text: 'It\'s... a ruin.' }, { text: 'Can I really live here?' }] },
    ]);
    await this.talk(p[0] === 0
      ? [{ who: 'crab', text: 'It\'s a ruin with a {gold}door{/gold}. Mostly.' }]
      : [{ who: 'crab', text: 'If you don\'t mind the draught.' }]);
    this.shot(this.push(() => ({ x: lerp(k.x, this.crab.group.position.x, 0.5), y: door.y + 0.9, dist: 7.6, yaw: 0.12, h: 0.9, fov: 34 }), () => ({ x: lerp(k.x, this.crab.group.position.x, 0.5), y: door.y + 0.85, dist: 6.2, yaw: 0.1, h: 0.75, roll: 0.02, fov: 30 }), 5), 3);
    await this.talk([
      { who: 'crab', text: 'Bones are good, though. You bring me driftwood and shells — I\'ll bring the hammer.' },
      { who: 'crab', text: '{gold}We\'ll fix her up together, kid.{/gold} Starting tonight.' },
      { who: 'kid', text: '...Home.' },
    ]);
    // in through the door: the camera follows into the dark
    this.ticker(() => { const dx = door.x - k.x, dy = door.y - k.y; this.gate.ax = { x: clamp(dx, -0.6, 0.6), y: clamp(dy, -0.6, 0.6) }; });
    this.shot(this.push(() => ({ x: k.x, y: k.y + 0.3, dist: 5, yaw: 0.1, h: 0.3, fov: 32 }), { x: door.x, y: door.y + 0.2, dist: 2.6, yaw: 0, h: 0.1, fov: 26 }, 3), 3);
    await this.wait(2.2, true);
    audio.music(null, 2.5);
    this.fade(1, 1.6);
    await this.wait(1.9, true);
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
    this.sim(dt, real);
    this.hud(real);
    this.ui.end();
  }

  private skip() {
    if (this.skipping >= 0 || this.finished) return;
    this.skipping = 0;
    this.abort();
    this.normalSpeed();
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
      // (capped: a stale or far-off wall must nudge, never fling)
      if (k.x < b[0]) k.applyForce(Math.min(80, (b[0] - k.x) * 120) - Math.min(0, k.vx) * 12, 0);
      if (k.x > b[1]) k.applyForce(Math.max(-80, (b[1] - k.x) * 120) - Math.max(0, k.vx) * 12, 0);
      if (k.hp < 1) k.hp = 1;
      // the kid hovers while the script holds it (no sinking into the plants mid-conversation), and in the
      // prologue it never settles into the foreground weeds
      if (!k.hooked) {
        // (a soft spring to where the gate closed; scripted steering moves the anchor along with the kid)
        if (!gate.src && !this.sinking) {
          if (this.holdY === null || Math.hypot(gate.ax.x, gate.ax.y) > 0.05) this.holdY = k.y;
          k.applyForce(0, clamp(0.35 + (this.holdY - k.y) * 5 - k.vy * 2, -3, 3));
        } else this.holdY = null;
        const fl = this.floorAt(k.x) + (this.step < 0 ? 1.1 : 0.5);
        if (k.y < fl) k.applyForce(0, (fl - k.y) * 8);
      }
      this.segA.set(k.x, k.y);
      k.update(dt, w);
      this.segB.set(k.x, k.y);
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
    // ---- Mr. Crab: hops off his counter, then follows the kid / scuttles to a spot along the seabed
    const c = this.crab, gp = c.group.position;
    if (this.crabMode !== 'stay') {
      const want = this.crabMode === 'follow' ? k.x - Math.sign(k.vx || 1) * 3.2 : this.crabGoal;
      const dx = want - gp.x;
      const v = Math.abs(dx) > (this.crabMode === 'follow' ? 1.2 : 0.15) ? clamp(dx * 1.6, -4.5, 4.5) : 0;
      const fl = this.floorAt(gp.x) - 0.05;
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
    this.ruin.update(dt);
    // ---- the boat + its fisherman
    if (this.boat) {
      this.boat.update(dt, w.water); this.angler?.lookAt(k.x, k.y); this.angler?.update(dt);
      const d = Math.abs(this.boat.x - this.cam.x);
      this.engine?.set(this.engineK * clamp(1 - d / 32, 0, 1) * 0.3 * (1 - this.muffle * 0.6), 0.7 + this.engineRate);
    }
    // ---- interactions (tutorial): [E] at the mail buoy
    this.interact();
    // ---- camera (real time: the camera keeps moving through slow motion)
    this.camera_(real);
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
    POST.uDesat.value = damp(POST.uDesat.value, this.muffleT > 0 ? Math.max(this.desatT, 0.85) : this.desatT, this.muffleT > 0 ? 1.2 : 0.6, real);
    this.bagFlash = Math.max(0, this.bagFlash - real * 2);
    this.goalT += real;
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

  /** the directed camera: damped toward the current shot (a whip-pan snaps), with dutch roll and zoom */
  private camera_(real: number) {
    const tg = this.camFn();
    this.whipT -= real;
    const c = this.cam, k = 1 - Math.exp(-real * (this.whipT > 0 ? 16 : this.camK));
    c.x += (tg.x - c.x) * k; c.y += (tg.y - c.y) * k; c.dist += (tg.dist - c.dist) * k; c.yaw += (tg.yaw - c.yaw) * k; c.h += (tg.h - c.h) * k;
    c.roll += ((tg.roll ?? 0) - c.roll) * k; c.fov += ((tg.fov ?? FOV) - c.fov) * k;
    const sh = this.game.shakeOffset();
    const cam = this.worldCam;
    cam.position.set(c.x + Math.sin(c.yaw) * c.dist + sh.x, Math.min(1.2, c.y + c.h + sh.y), Math.cos(c.yaw) * c.dist);
    cam.lookAt(c.x + sh.x * 0.5, c.y + sh.y * 0.5, 0);
    if (c.roll) cam.rotateZ(c.roll);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.light.follow(c.x, c.y);
  }

  private interact() {
    this.prompt = null;
    if (this.step < L.mail || this.control !== 'free' || this.dlg.blocking) return;
    const k = this.kid, inp = this.game.input, mb = this.area.mailbox;
    const E = inp.hit('interact');
    const loose = this.run.items.filter((i) => i.gx < 0).length;
    const carried = this.bag.length + loose;
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
      this.prompt = { key: 'E', label: 'RING THE BELL' };
      if (E) {
        mb.ring();
        // the tutorial doesn't make you wait: she's already close by, coming in from the far side of the buoy
        const side = k.x > mb.x ? -1 : 1;
        mb.manatee.arrive(mb.x + side * 13, mb.x);
        mb.waitLeft = mb.window;
        this.world.sfx('honk1', mb.x + side * 8, 0.5);
        this.world.emit('manatee', { state: 'arriving', x: mb.x });
        this.t3d.add('DING DING!', mb.x, mb.y + 1.4, 0, T3D.gold, { size: 0.36, life: 1.3, rise: 0.5 });
      }
    }
  }

  // ================================================================ HUD
  private toUi(x: number, y: number, z = 0) {
    const v = this.v.set(x, y, z).project(this.worldCam);
    const ui = this.ui;
    return { x: (v.x * 0.5 + 0.5) * ui.w, y: (1 - (v.y * 0.5 + 0.5)) * ui.h, behind: v.z > 1 };
  }

  private hud(real: number) {
    const ui = this.ui;
    if (this.step >= 0) { this.hpBar(); this.bagRow(); }
    if (this.goal && !this.dlg.blocking) this.goalLine();
    // the [E] prompt over the kid
    if (this.prompt && !this.dlg.blocking) {
      const s = this.toUi(this.kid.x, this.kid.y + 0.6);
      const kw = ui.keycap(this.prompt.key, 0, -100);
      const lw = ui.measure(this.prompt.label, 'small');
      const wd = kw + 3 + lw, x = Math.round(s.x - wd / 2), y = Math.round(s.y - 30 + Math.sin(this.real * 4) * 1.5);
      ui.fill(x - 3, y - 2, wd + 6, 16, '#000000', 0.45);
      ui.keycap(this.prompt.key, x, y);
      ui.text(this.prompt.label, x + kw + 3, y + 3, { font: 'small', color: '#f4f0e6', outline: '#06080e' });
    }
    // an arrow to the current goal when it's off screen
    if (this.target && !this.dlg.blocking) this.edgeArrow(this.target);
    this.dlg.draw();
    this.skipRing(real);
    // the game cursor: aim while fighting, a pointer for choices
    this.game.cursor = this.dlg.blocking ? 'normal' : this.control === 'free' && this.allowAttack ? 'aim' : 'none';
  }

  /** the objective: one short line top-centre (under the letterbox bar), a count, the keys that do it */
  private goalLine() {
    const ui = this.ui, g = this.goal!;
    const bar = Math.ceil(ui.h * POST.uLetterbox.value * Math.max(0, 1 - (ui.w / ui.h) / 2.39) * 0.5);
    const text = g.of !== undefined ? `${g.text}  ${g.n ?? 0}/${g.of}` : g.text;
    const tw = ui.measure(text, 'body');
    let kw = 0;
    for (const [key, label] of g.keys ?? []) kw += ui.keycap(key, 0, -100) + 3 + (label ? ui.measure(label, 'small') + 7 : 0);
    const w = 14 + tw + (kw ? kw + 8 : 0) + 6;
    const pop = Math.min(1, this.goalT * 5);
    const x = Math.round((ui.w - w) / 2), y = bar + 5 - Math.round((1 - pop) * 6);
    ui.fill(x, y, w, 15, '#06080e', 0.72 * pop);
    ui.fill(x, y + 15, w, 1, '#ffd860', 0.8 * pop);
    // a little gold diamond, the goal text, then the keys
    ui.fill(x + 5, y + 6, 3, 3, '#ffd860');
    ui.text(text, x + 12, y + 4, { font: 'body', color: '#ffffff', shadow: '#000', alpha: pop });
    let hx = x + 12 + tw + 8;
    for (const [key, label] of g.keys ?? []) {
      hx += ui.keycap(key, hx, y + 2, true) + 3;
      if (label) hx += ui.text(label, hx, y + 5, { font: 'small', color: '#c8d8f0', shadow: '#000', alpha: pop }) + 7;
    }
  }

  /** health while training: the HP number on a little bar (HP like the run HUD), and the Healing Clams once they
   *  have been introduced */
  private hpBar() {
    const ui = this.ui, k = this.kid;
    const x = 6, y = 6, w = 56;
    const f = clamp(k.hp / Math.max(1, k.maxHp), 0, 1);
    ui.fill(x - 1, y - 1, w + 2, 9, '#06080e', 0.75);
    ui.fill(x, y, w, 7, '#3a1a24');
    ui.fill(x, y, Math.round(w * f), 7, f > 0.5 ? '#5ae08a' : f > 0.25 ? '#ffd860' : '#ff5a4a');
    ui.fill(x, y, Math.round(w * f), 2, '#ffffff', 0.35);
    ui.text(`${hpOf(k.hp)}/${hpOf(k.maxHp)} HP`, x + w + 4, y - 1, { font: 'small', color: '#f4f0e6', outline: '#06080e' });
    if (this.step >= L.heal) {
      const kw = ui.keycap(HEAL_ITEM.key, x, y + 11, true);
      ui.text(`${HEAL_ITEM.short} x${k.combat.flasks}`, x + kw + 3, y + 13, { font: 'small', color: '#ffe8c8', outline: '#06080e' });
    }
  }

  private bagRow() {
    const ui = this.ui;
    const counts: Record<string, number> = {};
    for (const id of this.bag) counts[id] = (counts[id] ?? 0) + 1;
    const loose = this.run.items.filter((i) => i.gx < 0).map((i) => [i.id, 1] as [string, number]);
    const all = [...Object.entries(counts), ...loose].slice(0, 8);
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
    if (ui.hover(x, y, w, cell + 14)) ui.tooltip(all.map(([id, n]) => `${getItem(id).name}${n > 1 ? ' x' + n : ''}`), { maxW: 160 });
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

  /** HOLD ESC TO SKIP, with a pixel ring that fills (always shown while the cinematic plays) */
  private skipRing(real: number) {
    const ui = this.ui;
    void real;
    const k = clamp(this.skipT / SKIP_HOLD, 0, 1);
    const cx = ui.w - 16, cy = ui.h - 16, r = 7;
    const hintOn = this.real < 10 || k > 0 || this.control === 'script';
    if (!hintOn) return;
    const alpha = k > 0 ? 1 : 0.55;
    ui.fill(cx - r - 2, cy - r - 2, r * 2 + 5, r * 2 + 5, '#000000', 0.35 * alpha);
    // the ring: every pixel at radius r, lit clockwise from 12 o'clock as the hold fills
    for (let yy = -r - 1; yy <= r + 1; yy++) for (let xx = -r - 1; xx <= r + 1; xx++) {
      const d = Math.hypot(xx + 0.5, yy + 0.5);
      if (d < r - 1.6 || d > r + 0.4) continue;
      let a = Math.atan2(xx + 0.5, -(yy + 0.5)); if (a < 0) a += TAU;
      ui.fill(cx + xx, cy + yy, 1, 1, a / TAU <= k ? '#ffd860' : '#3a4252', alpha);
    }
    ui.text('ESC', cx, cy - 3, { font: 'small', color: k > 0 ? '#ffffff' : '#c8c8c8', align: 'center', alpha });
    ui.text(k > 0 ? 'SKIPPING...' : 'HOLD TO SKIP', cx - r - 5, cy - 3, { font: 'small', color: '#e8e0d0', outline: '#06080e', align: 'right', alpha });
  }
}
