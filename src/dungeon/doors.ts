// Room doors: the gate in each door gap and its animation.
//   side doors (L / R)  a portcullis of the area's bars (coral, kelp stipes, rusted iron, ice, fangs) that drops
//                       from the lintel to seal the gap and rises row by row to open; a carved stone frame faces
//                       the camera. Locked doors (into a treasure room) wear gold trim and a padlock: touch with a
//                       key to unlock. The boss door is a jawed skull arch with glowing eyes.
//   shafts (U / D)      a two-leaf grate over the hole that swings open.
//   secret walls        a cracked rock plug: only a puffer-bomb opens it (it shatters into chunks).
//
//   const d = new Door(world, room, 'L', 'locked'); d.close(); d.open(); d.update(dt)
//   d.shut   0 open .. 1 shut (the terrain reads it); d.locked; d.cracked
import * as THREE from 'three';
import type { World } from '../game/types';
import type { Dir } from './floor';
import { gateModel, hatchModel, crackedPlug, disposeModel, type GateKind, type GateModel, type HatchModel } from './models';
import { HALF_W, DOOR_Y0, DOOR_Y1, SHAFT_HW, ROOM_H } from './terrain';
import type { RoomBuild } from './room';

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export class Door {
  shut = 1;
  /** where shut is heading */
  target = 1;
  locked = false;
  cracked = false;
  group = new THREE.Group();
  private gate: GateModel | null = null;
  private hatch: HatchModel | null = null;
  private plug: THREE.Group | null = null;
  private t = 0;
  private rumble = 0;
  private side: number;
  constructor(public w: World, public room: RoomBuild, public dir: Dir, public kind: GateKind) {
    const F = room.F, a = room.a.id;
    this.side = dir === 'L' ? -1 : dir === 'R' ? 1 : 0;
    this.cracked = kind === 'secret';
    this.locked = kind === 'locked';
    const h = DOOR_Y1 - DOOR_Y0;
    if (this.cracked) {
      if (dir === 'L' || dir === 'R') { this.plug = crackedPlug(a, 1.6, h + 0.2, 3.4); this.plug.position.set(this.side * (HALF_W + 0.3), F + DOOR_Y0 - 0.1, 0); }
      else { this.plug = crackedPlug(a, SHAFT_HW * 2 + 0.4, 1.4, 3.4); this.plug.position.set(0, dir === 'U' ? F + ROOM_H - 0.3 : F - 1.0, 0); }
      this.group.add(this.plug);
    } else if (dir === 'L' || dir === 'R') {
      this.gate = gateModel(a, kind, h);
      this.gate.root.position.set(this.side * (HALF_W + 0.25), F + DOOR_Y0, 0);
      this.group.add(this.gate.root);
    } else {
      this.hatch = hatchModel(a, SHAFT_HW);
      this.hatch.root.position.set(0, dir === 'U' ? F + ROOM_H - 0.05 : F - 0.05, 0);
      this.group.add(this.hatch.root);
    }
    room.group.add(this.group);
    this.pose();
  }

  get isOpen() { return this.shut < 0.02; }
  /** start opening (no-op while locked / cracked) */
  open(instant = false) {
    if (this.locked || this.cracked) return;
    if (this.target === 0 && !instant) return;
    this.target = 0;
    if (instant) { this.shut = 0; this.pose(); return; }
    this.rumble = 0.6;
    const x = this.side * HALF_W;
    this.w.sfx('chain1', x, 0.55, 0.9); this.w.sfx('uw_rumble1', x, 0.5); this.w.sfx('creak2', x, 0.35, 1.2);
  }
  close(instant = false) {
    if (this.target === 1 && !instant) return;
    this.target = 1;
    if (instant) { this.shut = 1; this.pose(); return; }
    const x = this.side * HALF_W;
    this.w.sfx('thud_heavy1', x, 0.7, 0.8); this.w.sfx('rock_hit1', x, 0.4, 0.7);
  }
  unlock() {
    if (!this.locked) return;
    this.locked = false;
    const lock = this.gate?.lock;
    if (lock) {
      // the padlock springs off and tumbles away
      const wp = new THREE.Vector3(); lock.getWorldPosition(wp);
      this.w.fx.burst('spark', wp.x, wp.y, 14, 2.6, { color: '#ffe07a' });
      this.w.fx.emit('ring', wp.x, wp.y, { n: 1, size: 0.2, size1: 1.4, life: 0.4, alpha: 0.8, add: true });
      lock.visible = false;
    }
    this.w.sfx('k_confirm1', this.side * HALF_W, 0.7); this.w.sfx('clank1', this.side * HALF_W, 0.6);
    this.open();
  }
  /** a bomb went off at (x, y): a cracked wall in reach shatters. Returns true when it opened */
  blast(x: number, y: number, r: number): boolean {
    if (!this.cracked || !this.plug) return false;
    const c = new THREE.Vector3(); this.plug.getWorldPosition(c);
    const cy = c.y + (this.dir === 'L' || this.dir === 'R' ? (DOOR_Y1 - DOOR_Y0) / 2 : 0.6);
    if (Math.hypot(x - c.x, y - cy) > r + 2.2) return false;
    this.cracked = false;
    this.plug.visible = false;
    const col = { reef: '#a89878', kelp: '#6a6658', graveyard: '#5a5a4e', arctic: '#8a9aaa', abyss: '#343a48' }[this.room.a.id] ?? '#7a7a70';
    this.w.fx.debrisBurst(c.x, cy, 26, col, 5, 0.12);
    this.w.fx.emit('ink', c.x, cy, { n: 16, spread: 1.2, speed: 1.5, life: 2.5, size: 0.6, size1: 1.6, color: new THREE.Color(this.room.a.pal.silt), alpha: 0.6, drag: 2 });
    this.w.sfx('rock_crumble2', c.x, 0.9); this.w.sfx('rock_crumble1', c.x, 0.7, 0.8);
    this.w.game.addShake(0.35);
    this.shut = 0; this.target = 0;
    return true;
  }

  update(dt: number) {
    this.t += dt;
    const k = this.target < this.shut ? 1.5 : 4.5; // opening is a slow grind, slamming is quick
    if (this.shut !== this.target) {
      this.shut = this.target < this.shut ? Math.max(this.target, this.shut - dt * k) : Math.min(this.target, this.shut + dt * k);
      if (this.target === 1 && this.shut >= 1) {
        // the slam
        const x = this.side * HALF_W, y = this.room.F + (this.dir === 'U' ? ROOM_H : this.dir === 'D' ? 0 : 0.4);
        this.w.fx.debrisBurst(x, y, 10, this.room.a.pal.sand[2], 3, 0.06);
        this.w.fx.emit('bubble', x, y + 0.3, { n: 10, spread: 0.8, speed: 1.4 });
        this.w.game.addShake(0.12);
      }
      if (this.target === 0 && Math.random() < dt * 14) {
        const x = this.side * (HALF_W - 0.2), y = this.room.F + DOOR_Y1 + (this.dir === 'U' ? ROOM_H - DOOR_Y1 : this.dir === 'D' ? -DOOR_Y1 : 0);
        this.w.fx.emit('dust', x + (Math.random() - 0.5) * 1.5, y, { n: 1, spread: 0.3, speed: 0.5, life: 1.2, size: 0.06, color: '#c8c0a8', grav: -1.5 });
        if (Math.random() < 0.3) this.w.fx.emit('bubble', x, y - 0.5, { n: 2, spread: 0.4, vy: 1 });
      }
    }
    if (this.rumble > 0) { this.rumble -= dt; this.w.game.addShake(0.03); }
    this.pose();
  }

  private pose() {
    const s = this.shut;
    if (this.gate) {
      const g = this.gate;
      // rows rise one after another (front row last, so the front reads as the last to clear)
      g.bars.forEach((row, i) => {
        const delay = (g.bars.length - 1 - i) * 0.12;
        const open = Math.min(1, Math.max(0, (1 - s) * (1 + delay * 2) - delay));
        row.position.y = easeOut(open) * g.travel;
        row.position.x = Math.sin(this.t * 40 + i) * 0.015 * (s > 0.02 && s < 0.98 ? 1 : 0);
        row.visible = open < 0.999;
      });
      for (const m of g.glow) { const k = 0.7 + Math.sin(this.t * 3) * 0.3; (m.material as THREE.MeshBasicMaterial).color.setRGB(2.2 * k, 0.25 * k, 0.15 * k); }
      if (g.lock && g.lock.visible) g.lock.rotation.z = Math.sin(this.t * 2) * 0.08;
    }
    if (this.hatch) {
      const a = easeOut(1 - s) * 1.45;
      const [l, r] = this.hatch.leaves;
      const sgn = this.dir === 'U' ? 1 : -1;
      l.rotation.z = a * sgn; r.rotation.z = -a * sgn;
    }
  }

  dispose() { this.group.removeFromParent(); disposeModel(this.group); }
}
