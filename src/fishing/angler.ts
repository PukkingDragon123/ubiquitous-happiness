// Anglers: a fisherman on a vessel with a rod, a line, bait and an attitude.
//
// State machine per angler: idle -> cast (hook arcs out, splashes in) -> wait (bait sinks, jigs, bobber bobs)
// -> strike (the blobfish bit!) -> fight (reel + yanks; struggle QTEs on the fish side) -> either
//    SNAP (line breaks: fisherman falls on his butt, the bait is stolen, maybe loot) or
//    LANDED (the blobfish is lifted out: last-chance wriggle QTE, else something gets yoinked and you're tossed back)
// Every stolen bait / snapped line costs the angler resolve; at 0 they give up, rage, and leave a tackle box.
//
// FishingSystem (one per dive) owns the anglers, bite detection, the nibble-steal QTE and the struggle QTEs.
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { FishingLine, LINES, LineSpec } from './line';
import { buildBait, buildSinker, buildBobber, BaitKind, BAITS } from './bait';
import { QTE, QteKind } from './qte';
import type { Blobfish } from '../player/blobfish';
import { clamp, damp, smooth } from '../core/math';
import { audio } from '../audio/audio';
import { float, Floater } from '../gfx/water/sim';

// ------------------------------------------------------------------ rig adapter (humans module or stand-in)
export interface AnglerRig {
  group: THREE.Object3D;
  update(dt: number): void;
  play(state: string, o?: unknown): void;
  onCastRelease?: () => void;
  rodTip(out: THREE.Vector3): THREE.Vector3;
  setTension(k: number): void;
  lookAt(x: number, y: number): void;
  setMood?(k: number): void;
}
export interface Vessel { group: THREE.Object3D; update(dt: number, water: unknown): void; seats: THREE.Object3D[]; underwaterColliders(): { x: number; y: number; r: number }[] }
export interface RigFactory { rig(arch: string, seed: number): AnglerRig; vessel(kind: string, seed: number): Vessel }

/** a crude stand-in used until the humans module is wired in */
class StubRig implements AnglerRig {
  group = new THREE.Group();
  private rod = new THREE.Group();
  private bend = 0; private anim = ''; private at = 0;
  onCastRelease?: () => void;
  constructor() {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 12), new THREE.MeshStandardMaterial({ color: '#d8a040' }));
    body.position.y = 0.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: '#f0c0a0' }));
    head.position.y = 1.45;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#3a2a1a' }));
    pole.position.y = 1.2; this.rod.add(pole);
    this.rod.position.set(0.25, 0.9, 0.2); this.rod.rotation.z = -0.9;
    this.group.add(body, head, this.rod);
  }
  update(dt: number) {
    this.at += dt;
    let r = -0.9 - this.bend * 0.4;
    if (this.anim === 'cast') { r = this.at < 0.45 ? 0.6 : -1.2; if (this.at >= 0.45 && this.onCastRelease) { const f = this.onCastRelease; this.onCastRelease = undefined; f(); } }
    if (this.anim === 'yank') r = this.at < 0.25 ? 0.2 : -0.9;
    this.rod.rotation.z = damp(this.rod.rotation.z, r, 12, dt);
  }
  play(state: string) { this.anim = state; this.at = 0; }
  rodTip(out: THREE.Vector3) { return out.set(0, 2.4, 0).applyMatrix4(this.rod.children[0].matrixWorld).setY(out.y); }
  setTension(k: number) { this.bend = k; }
  lookAt() {}
}
class StubBoat implements Vessel {
  group = new THREE.Group(); seats: THREE.Object3D[] = [];
  private f: Floater = { x: 0, y: 0, vy: 0, roll: 0, rollV: 0, half: 1.4, mass: 1, draft: 0.25 };
  constructor() {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: '#8a5a30' }));
    this.group.add(hull);
    const seat = new THREE.Object3D(); seat.position.y = 0.3; this.group.add(seat); this.seats.push(seat);
  }
  update(dt: number, water: unknown) {
    const wf = water as { sim: import('../gfx/water/sim').WaterSim };
    this.f.x = this.group.position.x;
    float(this.f, dt, wf.sim);
    this.group.position.y = this.f.y; this.group.rotation.z = this.f.roll;
  }
  underwaterColliders() { return [{ x: this.group.position.x, y: -0.2, r: 0.5 }]; }
}

let factory: RigFactory = { rig: () => new StubRig(), vessel: () => new StubBoat() };
export function setRigFactory(f: RigFactory) { factory = f; }

// ------------------------------------------------------------------ anglers
export interface AnglerDef {
  arch: string; vessel: string; name: string;
  line: keyof typeof LINES; baits: BaitKind[]; resolve: number;
  reel: number; yankEvery: number; yankPower: number; patience: number; castMin: number; castMax: number; depthMin: number; depthMax: number;
  bobber: boolean; loot: string[]; qteDifficulty: number; greed: number;
}
export const ANGLERS: Record<string, AnglerDef> = {
  weekendDad: { arch: 'weekendDad', vessel: 'rowboat', name: 'Weekend Dad', line: 'mono', baits: ['worm', 'cheese', 'worm'], resolve: 2, reel: 0.55, yankEvery: 3.2, yankPower: 0.7, patience: 18, castMin: 3, castMax: 7, depthMin: 2, depthMax: 6, bobber: true, loot: ['corkBobber', 'lineScrap'], qteDifficulty: 0.8, greed: 0.3 },
  kid: { arch: 'kid', vessel: 'dock', name: 'Kid', line: 'mono', baits: ['worm', 'worm', 'cheese'], resolve: 2, reel: 0.45, yankEvery: 2.6, yankPower: 0.5, patience: 12, castMin: 2, castMax: 5, depthMin: 1.5, depthMax: 4, bobber: true, loot: ['rubberDuck', 'lineScrap'], qteDifficulty: 0.7, greed: 0.2 },
  grandma: { arch: 'grandma', vessel: 'dock', name: 'Grandma', line: 'braid', baits: ['shrimp', 'squid'], resolve: 3, reel: 0.6, yankEvery: 4, yankPower: 0.9, patience: 30, castMin: 3, castMax: 6, depthMin: 3, depthMax: 8, bobber: false, loot: ['luckyBottleCap', 'knittingNeedle'], qteDifficulty: 1, greed: 0.4 },
  oldSalt: { arch: 'oldSalt', vessel: 'skiff', name: 'Old Salt', line: 'braid', baits: ['squid', 'minnow', 'shrimp'], resolve: 3, reel: 0.8, yankEvery: 2.6, yankPower: 1.1, patience: 22, castMin: 4, castMax: 9, depthMin: 4, depthMax: 10, bobber: false, loot: ['leadSinker', 'whetstone', 'captainsCompass'], qteDifficulty: 1.2, greed: 0.6 },
  proAngler: { arch: 'proAngler', vessel: 'dinghy', name: 'Pro Angler', line: 'wire', baits: ['spoon', 'minnow', 'spoon'], resolve: 4, reel: 1.0, yankEvery: 2.0, yankPower: 1.3, patience: 14, castMin: 5, castMax: 11, depthMin: 3, depthMax: 10, bobber: false, loot: ['luckyLure', 'reelGear', 'scissors'], qteDifficulty: 1.45, greed: 0.8 },
  dockWorker: { arch: 'dockWorker', vessel: 'dock', name: 'Dock Worker', line: 'braid', baits: ['minnow', 'worm', 'squid'], resolve: 3, reel: 0.75, yankEvery: 2.8, yankPower: 1.0, patience: 20, castMin: 3, castMax: 8, depthMin: 3, depthMax: 9, bobber: false, loot: ['rustyNail', 'leadSinker'], qteDifficulty: 1.1, greed: 0.5 },
  iceFisher: { arch: 'iceFisher', vessel: 'ice', name: 'Ice Fisher', line: 'mono', baits: ['minnow', 'worm'], resolve: 3, reel: 0.7, yankEvery: 2.4, yankPower: 1.0, patience: 25, castMin: 0, castMax: 0.5, depthMin: 4, depthMax: 9, bobber: false, loot: ['seaGlass', 'whetstone'], qteDifficulty: 1.15, greed: 0.5 },
};

type Phase = 'idle' | 'cast' | 'flying' | 'wait' | 'fight' | 'landing' | 'landed' | 'retrieve' | 'snapped' | 'giveup' | 'gone';

export class Angler implements Entity {
  kind = 'angler'; team: Team = 'neutral';
  x: number; y = 0; vx = 0; vy = 0; r = 1; alive = true;
  def: AnglerDef;
  rig: AnglerRig; vessel: Vessel;
  obj = new THREE.Group();
  line: FishingLine | null = null;
  bait: BaitEntity | null = null;
  phase: Phase = 'idle';
  t = 0;
  resolve: number;
  facing: number;
  private tip = new THREE.Vector3();
  private jigT = 3;
  private yankT = 0;
  private yankLeft = 0;
  private castTarget = new THREE.Vector2();
  private qteT = 2;
  private reelLoop: ReturnType<typeof audio.loop> | null = null;
  private dragLoop: ReturnType<typeof audio.loop> | null = null;
  private bobber: THREE.Group | null = null;
  private bobberF: Floater = { x: 0, y: 0, vy: 0, roll: 0, rollV: 0, half: 0.06, mass: 0.3, draft: 0.03 };
  private sinker: THREE.Mesh;
  private seed: number;
  sys: FishingSystem;
  leaving = 0;

  constructor(sys: FishingSystem, defId: string, x: number, facing: number, seed: number) {
    this.sys = sys;
    this.def = ANGLERS[defId] ?? ANGLERS.weekendDad;
    this.x = x; this.facing = facing; this.seed = seed;
    this.resolve = this.def.resolve;
    this.vessel = factory.vessel(this.def.vessel, seed);
    this.rig = factory.rig(this.def.arch, seed);
    this.vessel.group.position.set(x, 0, -0.4);
    const seat = this.vessel.seats[0];
    (seat ?? this.vessel.group).add(this.rig.group);
    this.rig.group.scale.x = facing;
    this.obj.add(this.vessel.group);
    this.sinker = buildSinker();
    this.sinker.visible = false;
    this.obj.add(this.sinker);
    this.t = 1 + Math.random() * 2;
  }

  /** world x where this angler casts (in front of the vessel) */
  private pickCast(w: World) {
    const d = this.def;
    const dist = d.castMin + (d.castMax - d.castMin) * w.rng.next();
    const tx = this.x + this.facing * dist;
    const floor = w.terrain.floorAt(tx);
    const depth = Math.min(d.depthMin + (d.depthMax - d.depthMin) * w.rng.next(), -floor - 1.2);
    this.castTarget.set(tx, -Math.max(1.2, depth));
  }

  update(dt: number, w: World) {
    this.vessel.update(dt, w.water);
    this.rig.update(dt);
    this.obj.updateMatrixWorld(true);
    this.rig.rodTip(this.tip);
    this.t -= dt;
    const L = this.line;
    if (L) { L.tip.set(this.tip.x, this.tip.y); }
    const p = w.player as Blobfish;
    switch (this.phase) {
      case 'idle':
        if (this.t <= 0 && this.resolve > 0) { this.phase = 'cast'; this.rig.play('cast'); this.t = 0.9; this.pickCast(w); this.rig.onCastRelease = () => this.release(w); w.sfx('swish_b', this.tip.x, 0.5); }
        break;
      case 'cast':
        if (this.t <= 0 && !this.line) this.release(w);
        break;
      case 'flying':
        if (L && L.endY < w.water.heightAt(L.endX)) {
          this.phase = 'wait'; this.t = this.def.patience * (0.7 + w.rng.next() * 0.6);
          w.water.disturb(L.endX, 1.2, 0.3); w.fx.splash(L.endX, 0.5);
          w.sfx('plop', L.endX, 0.7);
          if (this.def.bobber) this.spawnBobber(w, L.endX);
          this.rig.play('wait');
        }
        if (L && this.t < -3) this.phase = 'wait';
        break;
      case 'wait': {
        if (!L) { this.phase = 'idle'; break; }
        // let line out until the bait hangs at the target depth, then hold
        const wantLen = Math.hypot(this.tip.x - this.castTarget.x, this.tip.y - this.castTarget.y) + 0.3;
        L.restLen = damp(L.restLen, wantLen, 1.5, dt);
        // jigging twitches make the bait dance (and attract curious fish)
        this.jigT -= dt;
        if (this.jigT <= 0) { this.jigT = 2.5 + w.rng.next() * 3; L.reel(-0.35); this.rig.play('nibble'); setTimeout(() => this.line?.reel(0.35), 250); }
        this.rig.lookAt(L.endX, L.endY);
        if (this.t <= 0) { this.phase = 'retrieve'; this.rig.play('reel'); }
        break;
      }
      case 'retrieve':
        if (!L) { this.phase = 'idle'; this.t = 1; break; }
        L.reel(-dt * 6);
        if (L.restLen < 1.0) { this.removeLine(w); this.phase = 'idle'; this.t = 1.2 + w.rng.next(); }
        break;
      case 'fight':
        this.fight(dt, w, p);
        break;
      case 'landing':
        this.landing(dt, w, p);
        break;
      case 'snapped':
        if (this.t <= 0) {
          if (this.resolve <= 0) { this.phase = 'giveup'; this.t = 2.2; this.rig.play('angry'); w.text.pop(rage(w), this.tip.x - this.facing * 1, 2.6, 'danger', { size: 0.34, life: 2 }); w.sfx('grunt', this.x, 0.8); }
          else { this.phase = 'idle'; this.t = 1.5; }
        }
        break;
      case 'giveup':
        if (this.t <= 0) { this.phase = 'gone'; this.leaving = 0.001; this.sys.anglerDefeated(this, w); }
        break;
      case 'gone':
        this.leaving += dt;
        this.vessel.group.position.x += this.facing * -dt * Math.min(3, this.leaving * 1.5);
        this.x = this.vessel.group.position.x;
        if (this.leaving > 7) this.alive = false;
        break;
      default: break;
    }
    this.updateBobber(dt, w);
    // the sinker rides a little above the hook
    if (L && !L.snapped && this.phase !== 'flying') {
      const i = Math.max(1, L.n - 3);
      this.sinker.visible = true; this.sinker.position.set(L.px[i], L.py[i], 0.02);
    } else this.sinker.visible = false;
    const tension = L ? clamp(L.tension / L.spec.breaking, 0, 1.2) : 0;
    this.rig.setTension(tension);
    this.reelLoop?.set(this.phase === 'fight' ? 0.35 + tension * 0.3 : 0.25, 0.8 + tension * 0.6);
    this.dragLoop?.set(L && L.paying > 0.05 ? 0.5 : 0, 1.2);
  }

  private release(w: World) {
    if (this.line) return;
    this.rig.onCastRelease = undefined;
    const L = new FishingLine(LINES[this.def.line] as LineSpec);
    this.rig.rodTip(this.tip);
    L.reset(this.tip.x, this.tip.y, this.tip.x + this.facing * 0.2, this.tip.y - 0.1, 1);
    // throw the free end in an arc toward the cast target's surface point
    const tx = this.castTarget.x, dx = tx - this.tip.x;
    const flight = 0.9;
    const vx = dx / flight, vy = (0 - this.tip.y + 0.5 * 9.8 * flight * flight) / flight;
    const i = L.n - 1;
    const h = 1 / 60;
    L.ox[i] = L.px[i] - vx * h / 3; L.oy[i] = L.py[i] - vy * h / 3;
    L.restLen = Math.hypot(dx, this.tip.y) + 1.5;
    this.line = L;
    w.add(L);
    if (!L.obj.parent) w.scene.add(L.obj);
    L.onSnap = (how, x, y, ww) => this.onSnap(how, x, y, ww);
    const kind = this.def.baits[Math.floor(w.rng.next() * this.def.baits.length)];
    const golden = w.rng.next() < 0.04 + w.run.stats().luck * 0.02;
    this.bait = w.add(new BaitEntity(this, golden ? 'goldWorm' : kind));
    this.phase = 'flying'; this.t = 0;
    w.sfx('cast', this.tip.x, 0.6);
    w.sfx('line_zip1', this.tip.x, 0.4);
  }

  private spawnBobber(w: World, x: number) {
    if (!this.bobber) { this.bobber = buildBobber(); this.obj.add(this.bobber); }
    this.bobber.visible = true;
    this.bobberF.x = x; this.bobberF.y = w.water.heightAt(x); this.bobberF.vy = 0;
    void w;
  }
  private updateBobber(dt: number, w: World) {
    if (!this.bobber || !this.bobber.visible) return;
    const L = this.line;
    if (!L || L.snapped || this.phase === 'retrieve' || this.phase === 'idle') { this.bobber.visible = false; return; }
    // the bobber rides the node nearest the surface
    let best = 1, bd = 1e9;
    for (let i = 1; i < L.n - 1; i++) { const d = Math.abs(L.py[i] - w.water.heightAt(L.px[i])); if (d < bd) { bd = d; best = i; } }
    const nib = this.bait?.nibbled ?? 0;
    this.bobberF.x = L.px[best];
    float(this.bobberF, dt, w.water.sim);
    const dip = nib > 0 ? Math.sin(w.time * 25) * 0.06 * nib + 0.08 * nib : 0;
    const by = this.phase === 'fight' ? L.py[best] : this.bobberF.y - dip;
    this.bobber.position.set(L.px[best], by, 0.03);
    this.bobber.rotation.z = this.bobberF.roll;
    if (this.phase === 'wait') { L.py[best] = damp(L.py[best], by, 6, dt); }
    if (nib > 0.5 && Math.random() < dt * 6) w.water.disturb(L.px[best], 0.3, 0.15);
  }

  // ---------------------------------------------------------------- hooking and the fight
  hookPlayer(w: World) {
    const p = w.player as Blobfish;
    if (!this.line || this.line.snapped || p.hooked) return;
    const L = this.line;
    this.phase = 'fight';
    this.yankT = 0.6; this.qteT = 1.4 + w.rng.next();
    p.hooked = true;
    p.hook = { pullX: L.px[L.n - 2], pullY: L.py[L.n - 2], tension: 0, line: L };
    L.end = { x: p.x, y: p.y };
    L.reel(-0.6); // the strike
    this.rig.play('yank');
    w.text.pop('HOOKED!', p.x, p.y + 1.1, 'danger', { size: 0.5, life: 1.2 });
    w.sfx('hook_clink1', p.x, 0.9); w.sfx('reel', p.x, 0.6);
    w.game.addShake(0.2); w.game.freeze(0.08);
    this.reelLoop = audio.loop('lp_reel', 0.3);
    this.dragLoop = audio.loop('reel2', 0);
    w.emit('hooked', { angler: this.def.name });
    p.setExpr('scared', 0.7);
    if (this.bait) this.bait.onHook();
  }

  private fight(dt: number, w: World, p: Blobfish) {
    const L = this.line;
    if (!L || L.snapped) return;
    const mouth = p.mouthWorld(new THREE.Vector3());
    L.end = { x: mouth.x, y: mouth.y };
    // reel: slows under tension and when the fish is swimming away hard
    const away = p.intent.x * (p.x - this.tip.x) + p.intent.y * (p.y - this.tip.y) > 0 ? Math.hypot(p.intent.x, p.intent.y) : 0;
    const strain = clamp(L.tension / L.spec.drag, 0, 1);
    const st = w.run.stats();
    L.reel(-this.def.reel * dt * (1 - strain * 0.8) * (1 - away * 0.5 * st.struggle) * (p.rock > 0.5 ? 0.1 : 1));
    // yanks
    this.yankT -= dt;
    if (this.yankT <= 0) {
      this.yankT = this.def.yankEvery * (0.7 + w.rng.next() * 0.6);
      this.yankLeft = 0.18;
      this.rig.play('yank');
      w.sfx('reel', this.x, 0.5, 1.2);
    }
    if (this.yankLeft > 0) { this.yankLeft -= dt; L.reel(-this.def.yankPower * 4.5 * dt * (p.rock > 0.5 ? 0.2 : 1)); }
    else if (strain > 0.75) this.rig.play('struggle');
    // pull on the fish: along the line, reduced by wraps around rocks and the reel-resist stat
    const k = L.n - 2;
    const dx = L.px[k] - mouth.x, dy = L.py[k] - mouth.y, dl = Math.hypot(dx, dy) || 1;
    const pull = L.tensionFish * (1 - st.reelResist) * (p.rock > 0.5 ? 0.15 : 1);
    p.applyForce(dx / dl * pull, dy / dl * pull);
    if (p.hook) { p.hook.pullX = L.px[k]; p.hook.pullY = L.py[k]; p.hook.tension = pull; }
    // jerk: tapping space while hooked yanks back against the line
    if (p.struggleTap && !this.sys.qte.active) {
      p.sb.accel(-dx / dl * 160 * st.struggle * (1 - p.pressure * 0.5), -dy / dl * 160 * st.struggle * (1 - p.pressure * 0.5), dt);
      w.sfx('squish', p.x, 0.4, 1.3);
      w.fx.emit('bubble', p.x, p.y, { n: 4, speed: 1.2 });
    }
    // periodic struggle QTEs
    this.qteT -= dt;
    if (this.qteT <= 0 && !this.sys.qte.active) {
      const kinds: QteKind[] = ['mash', 'hold', 'push'];
      const kind = kinds[Math.floor(w.rng.next() * 3)];
      const diff = this.def.qteDifficulty * (1 + p.pressure * 0.6) / st.struggle;
      this.sys.qte.start(kind, (r) => {
        if (!this.line || this.line.snapped || this.phase !== 'fight') return;
        if (r.ok) {
          const dmg = (1.5 + r.quality * 2.5) * st.struggle;
          this.line.damage(dmg, Math.max(1, this.line.n - 4), w, 'struggle');
          this.line.reel(1.2);
          p.sb.accel(-dx / dl * 220, -dy / dl * 220, 1 / 60);
          this.rig.play('surprised');
          w.text.pop(r.quality > 0.7 ? 'PERFECT!' : 'NICE!', p.x, p.y + 1.2, r.quality > 0.7 ? 'gold' : 'shout', { size: 0.4 });
          w.game.addShake(0.15); w.sfx('rope_strain1', p.x, 0.8);
        } else {
          this.line.reel(-1.4);
          this.rig.play('yank');
          w.text.pop('YANK!', p.x, p.y + 1.2, 'danger', { size: 0.4 });
          w.sfx('reel', p.x, 0.8, 0.9);
          p.setExpr('hurt', 0.5);
        }
        this.qteT = 2.2 + w.rng.next() * 1.8;
      }, { difficulty: diff });
      this.qteT = 99;
    }
    // reeled to the surface: landed
    if (p.y > w.water.heightAt(p.x) - 0.15 && L.restLen < Math.hypot(this.tip.x - p.x, this.tip.y - p.y) + 0.4) {
      this.phase = 'landing'; this.t = 0;
      this.sys.qte.cancel();
      w.sfx('splash_b', p.x, 0.9);
      w.fx.splash(p.x, 2);
      w.water.disturb(p.x, 3, 0.6);
      this.rig.play('cheer');
      w.text.pop('LANDED?!', p.x, p.y + 1.4, 'danger', { size: 0.5 });
    }
  }

  private landing(dt: number, w: World, p: Blobfish) {
    const L = this.line;
    if (!L) return;
    this.t += dt;
    // dangle under the rod tip, flopping
    const hx = this.tip.x - this.facing * 0.2, hy = this.tip.y - 1.3;
    p.carried = (d) => { p.sb.accel((hx - p.x) * 40 - p.vx * 6, (hy - p.y) * 40 - p.vy * 6 + 18, d); };
    L.end = { x: p.mouthWorld(new THREE.Vector3()).x, y: p.mouthWorld(new THREE.Vector3()).y };
    L.restLen = damp(L.restLen, 1.4, 4, dt);
    if (this.t > 0.6 && !this.sys.qte.active && this.t < 1) {
      this.sys.qte.start('mash', (r) => {
        p.carried = null;
        if (r.ok) {
          w.text.pop('WRIGGLED FREE!', p.x, p.y + 1, 'gold', { size: 0.4 });
          this.unhook(w, p);
          p.sb.accel(this.facing * 60, -80, 1 / 60);
          this.rig.play('surprised');
          (w.player as Blobfish).damage(1, p.x, p.y + 1, w, 'hook');
        } else {
          // yoink: the fisherman takes something and tosses you back
          const stolen = this.sys.yoink(w);
          w.text.pop(stolen ? `YOINKED: ${stolen}` : 'TOSSED BACK!', p.x, p.y + 1.2, 'danger', { size: 0.38, life: 2 });
          this.unhook(w, p);
          p.sb.accel(this.facing * 120, 40, 1 / 60);
          (w.player as Blobfish).damage(1, p.x, p.y + 1, w, 'hook');
          this.rig.play('throw');
        }
        this.phase = 'snapped'; this.t = 2.5;
        this.removeLine(w);
      }, { difficulty: this.def.qteDifficulty * 1.3 });
    }
  }

  private unhook(w: World, p: Blobfish) {
    p.hooked = false; p.hook = null; p.carried = null;
    this.reelLoop?.stop(); this.dragLoop?.stop(); this.reelLoop = this.dragLoop = null;
    this.sys.qte.cancel();
    void w;
  }

  private onSnap(how: string, x: number, y: number, w: World) {
    const p = w.player as Blobfish;
    const wasHooked = this.phase === 'fight' || this.phase === 'landing';
    this.resolve--;
    this.rig.play('snapFall');
    w.sfx('grunt', this.x, 0.6);
    if (wasHooked) {
      this.unhook(w, p);
      // the bait is yours, and maybe a piece of their tackle
      const b = this.bait ? BAITS[this.bait.baitKind] : BAITS.worm;
      p.heal(b.heal + w.run.stats().biteHeal, w);
      w.run.coins += b.coins; w.run.baitStolen++;
      w.text.pop(`${b.name.toUpperCase()} STOLEN!`, p.x, p.y + 1.5, 'gold', { size: 0.36, life: 1.8 });
      w.sfx('chomp1', p.x, 0.8); w.sfx('coin', p.x, 0.6);
      w.emit('baitStolen', { bait: b.kind });
      if (w.rng.next() < 0.35 + w.run.stats().luck * 0.05) w.drop(x, y, { item: this.def.loot[Math.floor(w.rng.next() * this.def.loot.length)] });
      else w.drop(x, y, { item: 'rustyHook' });
      this.bait?.kill(w);
      this.bait = null;
    } else if (this.bait) {
      this.bait.detach(w);
      this.bait = null;
    }
    w.run.linesSnapped++;
    this.phase = 'snapped'; this.t = 2.2;
    this.line = null;
    void how;
  }

  removeLine(w: World) {
    if (this.line) { this.line.alive = false; this.line.obj.removeFromParent(); this.line = null; }
    if (this.bait) { this.bait.kill(w); this.bait = null; }
    this.reelLoop?.stop(); this.dragLoop?.stop(); this.reelLoop = this.dragLoop = null;
  }

  /** a stolen bait without snapping the line (nibble success) */
  baitNibbled(w: World) {
    this.resolve--;
    this.rig.play('angry');
    w.text.pop('HEY!', this.tip.x - this.facing * 0.5, this.tip.y + 0.6, 'danger', { size: 0.34 });
    this.phase = 'retrieve';
  }

  colliders() { return this.vessel.underwaterColliders(); }
  dispose(w: World) { this.removeLine(w); }
}

function rage(w: World) { const r = ['I QUIT!', 'CURSE YOU, BLOB!', 'THIS LAKE IS RIGGED!', 'MY BAIT!!', 'UNBELIEVABLE!']; return r[Math.floor(w.rng.next() * r.length)]; }

// ------------------------------------------------------------------ bait entity
export class BaitEntity implements Entity {
  kind = 'bait'; team: Team = 'neutral';
  x = 0; y = 0; vx = 0; vy = 0; r = 0.18; alive = true; biteable = true;
  obj: THREE.Group;
  baitKind: BaitKind;
  angler: Angler | null;
  nibbled = 0;
  private tick: (t: number, s: number) => void;
  private free = false;
  private onLine = true;
  private eaten = false;

  constructor(angler: Angler | null, kind: BaitKind) {
    this.angler = angler; this.baitKind = kind;
    const b = buildBait(kind);
    this.obj = b.group; this.tick = b.tick;
    this.obj.scale.setScalar(1.6);
  }

  update(dt: number, w: World) {
    const L = this.angler?.line;
    if (this.onLine && L && !L.snapped) {
      this.x = L.endX; this.y = L.endY;
      const i = L.n - 2;
      this.obj.rotation.z = Math.atan2(L.endY - L.py[i], L.endX - L.px[i]) + Math.PI / 2;
    } else if (this.free) {
      const under = this.y < w.water.heightAt(this.x);
      this.vy += (under ? -0.8 : -9.8) * dt;
      this.vy *= Math.exp(-(under ? 2 : 0.1) * dt); this.vx *= Math.exp(-2 * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      const fl = w.terrain.floorAt(this.x) + 0.1;
      if (this.y < fl) { this.y = fl; this.vy = 0; }
      this.obj.rotation.z += dt * 0.6;
    }
    this.nibbled = Math.max(0, this.nibbled - dt * 2);
    this.tick(w.time, this.nibbled);
    this.obj.position.set(this.x, this.y, 0.05);
    this.obj.visible = !(this.onLine && !L);
  }

  onHook() { this.biteable = false; }
  detach(w: World) {
    this.onLine = false; this.free = true; this.biteable = true; this.angler = null;
    w.text.pop('FREE BAIT!', this.x, this.y + 0.5, 'hint', { size: 0.28 });
  }

  onBite(w: World) {
    if (this.eaten) return;
    const p = w.player as Blobfish;
    if (this.onLine && this.angler && this.angler.line && !this.angler.line.snapped) { this.angler.hookPlayer(w); return; }
    // free bait: eat it
    this.eaten = true;
    const b = BAITS[this.baitKind];
    p.heal(b.heal + w.run.stats().biteHeal, w);
    w.run.coins += b.coins; w.run.baitStolen++;
    w.text.pop(`+${b.coins}`, this.x, this.y + 0.4, 'gold', { size: 0.34 });
    w.sfx('chomp1', this.x, 0.8); w.sfx('gulp', this.x, 0.6);
    p.setExpr('chomp', 0.35);
    w.emit('baitStolen', { bait: b.kind });
    this.kill(w);
  }

  /** nibble-steal success: the bait comes off the hook into your mouth */
  stealClean(w: World) {
    const a = this.angler;
    this.onLine = false; this.angler = null;
    this.onBite(w);
    a?.baitNibbled(w);
    if (a) a.bait = null;
  }

  kill(w: World) { this.alive = false; void w; }
}

// ------------------------------------------------------------------ the per-dive fishing system
export class FishingSystem {
  anglers: Angler[] = [];
  qte = new QTE();
  defeated = 0;
  onAllDefeated?: () => void;
  onAnglerDefeated?: (a: Angler, w: World) => void;
  private nibbleTarget: BaitEntity | null = null;

  spawn(w: World, defId: string, x: number, facing: number) {
    const a = new Angler(this, defId, x, facing, Math.floor(w.rng.next() * 1e9));
    this.anglers.push(a);
    w.add(a);
    return a;
  }

  anglerDefeated(a: Angler, w: World) {
    this.defeated++;
    w.emit('anglerDefeated', { name: a.def.name });
    this.onAnglerDefeated?.(a, w);
    if (this.anglers.every((x) => x.phase === 'gone' || !x.alive)) this.onAllDefeated?.();
  }

  /** take something from the player: an item from the backpack, else coins */
  yoink(w: World): string | null {
    const run = w.run;
    const placed = run.items.filter((i) => i.gx >= 0);
    const pool = placed.length ? placed : run.items;
    if (pool.length && w.rng.next() < 0.5) {
      const it = pool[Math.floor(w.rng.next() * pool.length)];
      run.removeItem(it.uid);
      w.emit('itemLost', { id: it.id });
      return it.id;
    }
    const c = Math.min(run.coins, 5 + Math.floor(run.coins * 0.25));
    run.coins -= c;
    return c > 0 ? `${c} coins` : null;
  }

  update(dt: number, w: World) {
    const p = w.player as Blobfish;
    this.qte.update(dt, w.game.input, p.x, p.y, w.time);
    if (!p.alive) return;
    const mouth = p.mouthWorld(new THREE.Vector3());
    // bites: the mouth touching bait
    this.nibbleTarget = null;
    for (const e of w.entities) {
      if (!e.alive || !e.biteable || !e.onBite) continue;
      const d = Math.hypot(e.x - mouth.x, e.y - mouth.y);
      if (e instanceof BaitEntity && e.angler && d < 1.1 && !p.hooked) {
        this.nibbleTarget = e;
        e.nibbled = Math.max(e.nibbled, 1 - d / 1.1);
      }
      if (d < e.r + 0.12 && !p.hooked && !this.qte.active) e.onBite(w);
    }
    // nibble-steal: press E near hooked bait for a timing QTE
    if (this.nibbleTarget && w.game.input.hit('interact') && !this.qte.active && !p.hooked) {
      const target = this.nibbleTarget;
      p.setExpr('happy', 0.5);
      w.sfx('nibble', target.x, 0.7);
      this.qte.start('timing', (r) => {
        if (!target.alive) return;
        if (r.ok) { target.stealClean(w); w.text.pop('NIBBLED!', p.x, p.y + 1, 'gold', { size: 0.4 }); }
        else if (target.angler) { w.text.pop('GOTCHA!', p.x, p.y + 1, 'danger', { size: 0.4 }); target.angler.hookPlayer(w); }
      }, { difficulty: target.angler?.def.qteDifficulty ?? 1 });
    }
    void smooth;
  }

  colliders() { const out: { x: number; y: number; r: number }[] = []; for (const a of this.anglers) if (a.alive) out.push(...a.colliders()); return out; }
}
