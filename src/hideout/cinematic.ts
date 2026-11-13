// The "suit up and head out" cinematic: letterbox in, the hero hops off the sofa and waddles to the gear locker,
// the doors swing open and each loadout item flies out and pops onto them (sparkles + sounds), the toothpick
// sword last; then a low tracking shot to the round hatch, which unwheels and swings open onto the water
// membrane; the hero pushes through in a burst of bubbles, cut to outside: the hatch in the rock face, the hero
// swimming up and away into the blue; fade out and onEnterRun(cfg). Esc / Space skips.
import * as THREE from 'three';
import type { RunConfig } from '../meta/meta';
import { META } from '../meta/meta';
import { ITEMS, itemMesh } from '../game/items';
import type { HideoutHero, HeroSlot } from './hero';
import type { Furniture, Placed } from './furniture';
import { Furniture as FurnitureCls } from './furniture';
import type { Room } from './room';
import { DOOR, HALF_W } from './room';
import { CamRig, type Shot } from './camera';
import type { Motes } from './ocean';
import { audio } from '../audio/audio';
import { damp, clamp01, easeOutBack, easeInOut } from '../core/math';

/** walks the hero along waypoints (world xz), turning smoothly; done() when arrived */
export class Walker {
  path: THREE.Vector3[] = [];
  i = 0;
  speed = 1.7;
  done = true;
  constructor(public hero: HideoutHero) {}
  go(path: THREE.Vector3[], speed = 1.7) { this.path = path; this.i = 1; this.done = path.length < 2; this.speed = speed; this.hero.play?.('walk'); }
  update(dt: number): number {
    if (this.done) return 0;
    const r = this.hero.root;
    const tgt = this.path[this.i];
    const d = new THREE.Vector3(tgt.x - r.position.x, 0, tgt.z - r.position.z);
    const L = d.length();
    const step = this.speed * dt;
    if (L <= step || L < 0.04) {
      r.position.x = tgt.x; r.position.z = tgt.z;
      this.i++;
      if (this.i >= this.path.length) { this.done = true; this.hero.play?.('idle'); return 0; }
      return 1;
    }
    d.multiplyScalar(1 / L);
    r.position.x += d.x * step; r.position.z += d.z * step;
    const yaw = Math.atan2(-d.z, d.x);
    let dy = yaw - r.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    r.rotation.y += dy * (1 - Math.exp(-dt * 10));
    return 1;
  }
}

/** face the hero toward a world point (smoothly) */
export function faceToward(hero: HideoutHero, p: THREE.Vector3, dt: number, k = 8) {
  const r = hero.root;
  const yaw = Math.atan2(-(p.z - r.position.z), p.x - r.position.x);
  let dy = yaw - r.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  r.rotation.y += dy * (1 - Math.exp(-dt * k));
}

type Step = 'stand' | 'toLocker' | 'gear' | 'toDoor' | 'through' | 'outside' | 'fade' | 'done';

interface Flyer { obj: THREE.Object3D; from: THREE.Vector3; slot: HeroSlot; t: number; delay: number; landed: boolean }

export class Cinematic {
  active = false;
  step: Step = 'done';
  private st = 0;   // time in step
  private t = 0;
  letterbox = 0;
  fade = 0;
  cfg: RunConfig | null = null;
  private walker: Walker;
  private flyers: Flyer[] = [];
  private locker: Placed | undefined;
  private shot: Shot = { target: new THREE.Vector3(), yaw: 0, pitch: 0.3, dist: 14, fov: 20 };
  private swimV = new THREE.Vector3();
  onDone?: (cfg: RunConfig) => void;
  /** caption shown in the letterbox */
  caption = '';

  constructor(private hero: HideoutHero, private furn: Furniture, private room: Room, private rig: CamRig, private scene: THREE.Object3D, private sparks: Motes, private bubbles: Motes) {
    this.walker = new Walker(hero);
  }

  start(cfg: RunConfig) {
    this.cfg = cfg; this.active = true; this.t = 0;
    this.locker = this.furn.byBp('locker');
    this.hero.clearGear?.();
    this.hero.root.visible = true;
    // start from the hero's current spot (sofa or wherever)
    this.goStep('stand');
    this.shot = { ...this.rig.cur, target: this.rig.cur.target.clone() };
    this.rig.shot = this.shot;
    this.rig.k = 2.2;
    audio.music('mu_fjord', 2.5);
    this.caption = '';
  }

  skip() { if (this.step !== 'fade' && this.step !== 'done') { this.goStep('fade'); } }

  private goStep(s: Step) { this.step = s; this.st = 0; this.onStep(s); }

  private onStep(s: Step) {
    const hero = this.hero, r = hero.root;
    if (s === 'stand') { hero.play?.('hop'); audio.play('boing1', { vol: 0.35, rate: 1.2 }); }
    if (s === 'toLocker') {
      const dest = this.locker ? this.furn.standPoint(this.locker) : new THREE.Vector3(-4, 0, 0);
      this.walker.go(this.furn.path(r.position.clone(), dest), 1.9);
    }
    if (s === 'gear') {
      hero.play?.('idle');
      if (this.locker) { this.furn.setOpen(this.locker, 1); audio.play('chest_creak', { vol: 0.5, rate: 1.3 }); audio.play('clank1', { vol: 0.35, delay: 0.2 }); }
      // gear: the loadout items (up to 5) + the sword last
      const ids = (this.cfg?.loadout ?? []).map((uid) => META.stash.find((s2) => s2.uid === uid)).filter((it) => it && ITEMS[it.id]).slice(0, 5);
      const slots: HeroSlot[] = ['back', 'head', 'side', 'belly', 'back'];
      const from = this.locker ? this.locker.obj.position.clone().add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(FurnitureCls.front(this.locker.p.rot), 0.2) : r.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      ids.forEach((it, i) => {
        const m = itemMesh(it!.id, it!.level ?? 1);
        const box = new THREE.Box3().setFromObject(m); const sz = box.getSize(new THREE.Vector3());
        const k = 0.3 / Math.max(0.01, sz.x, sz.y, sz.z);
        const holder = new THREE.Group(); holder.add(m); m.scale.setScalar(k);
        m.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(k));
        holder.visible = false;
        this.scene.add(holder);
        this.flyers.push({ obj: holder, from: from.clone(), slot: slots[i], t: 0, delay: 0.6 + i * 0.55, landed: false });
      });
      const sword = new THREE.Group(); sword.userData.sword = true;
      this.flyers.push({ obj: sword, from: from.clone(), slot: 'hand', t: 0, delay: 0.6 + ids.length * 0.55 + 0.2, landed: false });
      this.caption = 'SUITING UP';
    }
    if (s === 'toDoor') {
      if (this.locker) this.furn.setOpen(this.locker, 0);
      audio.play('wood_close1', { vol: 0.4 });
      const dest = new THREE.Vector3(-HALF_W + 0.8, 0, DOOR.z);
      this.walker.go(this.furn.path(r.position.clone(), dest), 2.0);
      this.caption = '';
    }
    if (s === 'through') {
      audio.play('creak2', { vol: 0.5 }); audio.play('air1', { vol: 0.5, delay: 0.5 });
      this.room.door.target = 1;
    }
    if (s === 'outside') {
      // cut to the rock face outside; the hero bursts out of the outer hatch and swims away
      r.position.set(-HALF_W - 2.0, 1.0, DOOR.z);
      r.rotation.y = Math.PI;
      hero.play?.('swim');
      this.swimV.set(-1.4, 0.35, -0.25);
      for (let i = 0; i < 40; i++) this.bubbles.emit(r.position.x + Math.random() * 0.3, r.position.y + Math.random() * 0.8, r.position.z + (Math.random() - 0.5) * 1.2, { vy: 0.6 + Math.random(), life: 2.5, size: 0.06 + Math.random() * 0.1 });
      audio.play('splash_b', { vol: 0.5 }); audio.play('bubbles_a', { vol: 0.5 });
      this.shot = { target: new THREE.Vector3(-HALF_W - 3.2, 1.6, DOOR.z), yaw: -0.5, pitch: 0.1, dist: 9.5, fov: 30 };
      this.rig.shot = this.shot; this.rig.snap(); this.rig.k = 1.5;
      this.room.door.target = 0;
      this.caption = '';
    }
    if (s === 'fade') audio.music(null, 1.2);
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt; this.st += dt;
    const hero = this.hero, r = hero.root;
    const want = this.step === 'fade' || this.step === 'done' ? 1 : 1;
    this.letterbox = damp(this.letterbox, want, 3, dt);
    const hp = r.position;
    switch (this.step) {
      case 'stand': {
        // hop off the seat onto the floor in front of it
        const k = clamp01(this.st / 0.6);
        r.position.y = Math.max(0, r.position.y - dt * 1.2) + Math.sin(k * Math.PI) * 0.06;
        this.shot.target.lerp(new THREE.Vector3(hp.x, 0.6, hp.z), 1 - Math.exp(-dt * 2));
        this.shot.dist = damp(this.shot.dist, 17, 2, dt); this.shot.pitch = damp(this.shot.pitch, 0.42, 2, dt); this.shot.fov = damp(this.shot.fov, 20, 2, dt);
        if (this.st > 0.7) { r.position.y = 0; this.goStep('toLocker'); }
        break;
      }
      case 'toLocker': {
        this.walker.update(dt);
        this.shot.target.lerp(new THREE.Vector3(hp.x, 0.6, hp.z), 1 - Math.exp(-dt * 3));
        this.shot.dist = damp(this.shot.dist, 13, 1.5, dt);
        if (this.locker) this.shot.yaw = damp(this.shot.yaw, lockerYaw(this.locker) + 0.75, 0.8, dt);
        if (this.walker.done || this.st > 8) this.goStep('gear');
        break;
      }
      case 'gear': {
        if (this.locker) faceToward(hero, this.locker.obj.position, dt);
        const yaw = this.locker ? lockerYaw(this.locker) + 0.9 + Math.sin(this.st * 0.3) * 0.15 : this.shot.yaw;
        this.shot.target.lerp(new THREE.Vector3(hp.x, 0.62, hp.z), 1 - Math.exp(-dt * 3));
        this.shot.yaw = damp(this.shot.yaw, yaw, 2, dt);
        this.shot.dist = damp(this.shot.dist, 7.2, 2, dt); this.shot.pitch = damp(this.shot.pitch, 0.2, 2, dt); this.shot.fov = damp(this.shot.fov, 21, 2, dt);
        let all = true;
        for (const f of this.flyers) {
          f.t += dt;
          if (f.landed) continue;
          all = false;
          const k = (f.t - f.delay) / 0.5;
          if (k < 0) continue;
          if (!f.obj.userData.sword) {
            f.obj.visible = true;
            const to = (hero as unknown as { slotWorld?: (s: HeroSlot) => THREE.Vector3 }).slotWorld?.(f.slot) ?? hp.clone().add(new THREE.Vector3(0, 0.9, 0));
            const e = easeInOut(clamp01(k));
            f.obj.position.lerpVectors(f.from, to, e);
            f.obj.position.y += Math.sin(e * Math.PI) * 0.7;
            f.obj.rotation.set(e * 6, e * 9, 0);
            f.obj.scale.setScalar(0.4 + easeOutBack(clamp01(k * 1.5), 2) * 0.6);
          }
          if (k >= 1) {
            f.landed = true;
            f.obj.position.set(0, 0, 0); f.obj.rotation.set(0, 0, 0); f.obj.scale.setScalar(1);
            hero.attach?.(f.slot, f.obj);
            hero.play?.('gear');
            const p = (hero as unknown as { slotWorld?: (s: HeroSlot) => THREE.Vector3 }).slotWorld?.(f.slot) ?? hp.clone().add(new THREE.Vector3(0, 0.8, 0));
            for (let i = 0; i < 14; i++) this.sparks.emit(p.x, p.y, p.z, { vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 0.6 + Math.random() * 0.4, size: 0.1 });
            audio.play(f.obj.userData.sword ? 'sw_swish1' : ['buckle1', 'cloth1', 'k_pluck1', 'pop1'][Math.floor(Math.random() * 4)], { vol: 0.5 });
            audio.play('pickup_sparkle1', { vol: 0.25, dry: true, rate: 1 + Math.random() * 0.3 });
            if (f.obj.userData.sword) { hero.play?.('cheer'); this.caption = 'READY'; audio.play('jin_good', { vol: 0.4, dry: true }); }
          }
        }
        if (all && this.st > 1.2 + this.flyers.length * 0.1) { if (this.st > this.flyers.reduce((m, f) => Math.max(m, f.delay), 0) + 1.6) this.goStep('toDoor'); }
        break;
      }
      case 'toDoor': {
        this.walker.update(dt);
        // low tracking shot from inside the room, looking toward the hatch
        const mid = hp.clone().lerp(DOOR, 0.35);
        this.shot.target.lerp(new THREE.Vector3(mid.x, 0.85, mid.z), 1 - Math.exp(-dt * 2.5));
        this.shot.yaw = damp(this.shot.yaw, Math.PI / 2 - 0.42, 1.2, dt);
        this.shot.pitch = damp(this.shot.pitch, 0.14, 1.5, dt);
        this.shot.dist = damp(this.shot.dist, 10, 1.5, dt);
        this.shot.fov = damp(this.shot.fov, 26, 1.5, dt);
        if (hp.x < -HALF_W + 2.6 && this.room.door.target === 0) { this.room.door.target = 1; audio.play('creak2', { vol: 0.5 }); audio.play('air1', { vol: 0.45, delay: 0.4 }); }
        if (this.walker.done || this.st > 9) this.goStep('through');
        break;
      }
      case 'through': {
        faceToward(hero, DOOR, dt);
        if (this.st > 0.8) {
          // waddle into the membrane
          r.position.x -= dt * 1.5;
          r.position.y = Math.max(0, (this.st - 0.8) * 0.6);
          if (Math.random() < dt * 30) this.bubbles.emit(DOOR.x + 0.1, DOOR.y + (Math.random() - 0.5) * 1.2, DOOR.z + (Math.random() - 0.5) * 1.2, { vx: 0.5, vy: 0.5 + Math.random(), life: 1.6, size: 0.05 + Math.random() * 0.08 });
          if (r.position.x < -HALF_W + 0.1 && !this.splashed) { this.splashed = true; audio.play('splash_s', { vol: 0.6 }); audio.play('bubbles_b', { vol: 0.5 }); }
        }
        this.shot.target.lerp(new THREE.Vector3(DOOR.x + 1.2, 1.0, DOOR.z), 1 - Math.exp(-dt * 2));
        this.shot.dist = damp(this.shot.dist, 7, 1.2, dt);
        if (this.st > 2.4) { this.splashed = false; this.goStep('outside'); }
        break;
      }
      case 'outside': {
        this.swimV.multiplyScalar(1 + dt * 0.4);
        r.position.addScaledVector(this.swimV, dt);
        r.rotation.y = damp(r.rotation.y, Math.atan2(-this.swimV.z, this.swimV.x), 3, dt);
        if (Math.random() < dt * 8) this.bubbles.emit(hp.x + 0.3, hp.y + 0.2, hp.z, { vy: 0.4, life: 2, size: 0.05 + Math.random() * 0.05 });
        // camera drifts and tilts up after the hero toward the light
        this.shot.target.lerp(new THREE.Vector3(hp.x * 0.5 + (-HALF_W - 3.2) * 0.5, 1.6 + Math.max(0, this.st - 1) * 0.9, DOOR.z - this.st * 0.3), 1 - Math.exp(-dt * 1.2));
        this.shot.pitch = damp(this.shot.pitch, -0.12, 0.6, dt);
        if (this.st > 1.6) this.caption = this.cfg ? areaCaption(this.cfg) : '';
        if (this.st > 3.6) this.goStep('fade');
        break;
      }
      case 'fade': {
        this.fade = clamp01(this.fade + dt * 1.4);
        if (this.step === 'fade' && hp.y < 30) r.position.addScaledVector(this.swimV, dt);
        if (this.fade >= 1 && this.st > 0.8) { this.step = 'done'; this.active = false; this.onDone?.(this.cfg!); }
        break;
      }
    }
  }
  private splashed = false;

  /** tidy up after the run starts (or when re-entering the hideout) */
  reset() {
    for (const f of this.flyers) f.obj.removeFromParent();
    this.flyers = [];
    this.hero.clearGear?.();
    this.active = false; this.step = 'done'; this.fade = 0; this.letterbox = 0; this.caption = '';
    this.rig.shot = null; this.rig.k = 4.5;
    this.room.door.target = 0;
  }
}

function lockerYaw(it: Placed) { const f = FurnitureCls.front(it.p.rot); return Math.atan2(f.x, f.z); }
function areaCaption(cfg: RunConfig) {
  const names: Record<string, string> = { reef: 'THE SUNLIT REEF', kelp: 'THE KELP CATHEDRAL', graveyard: 'THE SHIPWRECK GRAVEYARD', arctic: 'THE FROST SHELF', abyss: 'THE ABYSS' };
  return `${names[cfg.startArea] ?? cfg.startArea.toUpperCase()}  ·  MASTERY ${cfg.mastery}`;
}
export { CamRig };
