// The training dummy: a sack-and-plank sparring post on a weighted base. It never dies (hp refills), shows
// damage numbers, staggers when its poise breaks, and in `attacks` mode swings its plank arm on a steady rhythm
// (white glint, white glint, RED sweep) so parry / dodge timing can be practised; every defense is logged
// (dummy.log + the console) with the parry press-to-hit delay.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { Arena } from './types';
import { EnemyCore, type MoveDef } from './core';
import { kitMat } from '../humans/diveGear';
import { band, hh, nz } from '../humans/fabric';

const SWING: MoveDef = { id: 'swing', windup: 0.6, active: 0.14, recover: 0.5, dmg: 1, tellAt: 0.3 };
const SWEEP: MoveDef = { id: 'sweep', windup: 0.75, active: 0.18, recover: 0.6, dmg: 1, unblockable: true, tellAt: 0.38 };

function burlap() {
  return kitMat('dummySack', 32, 32, (x, y) => {
    const weave = ((x >> 1) + (y >> 1)) & 1 ? 0.94 : 1.04;
    let c = band([186, 154, 104], weave * (0.9 + (nz(x, y, 10, 4) - 0.5) * 0.18), x, y, 0.06);
    if (y % 11 === 0 || (x === 15 && y > 4)) c = band([120, 92, 58], 1, x, y);          // seams + stitches
    if (hh(x, y, 3) > 0.985) c = band([230, 210, 150], 1, x, y);                         // straw poking out
    return c;
  }, { rough: 0.95 });
}
function wood() {
  return kitMat('dummyWood', 16, 32, (x, y) => band([130, 98, 64], 0.86 + (x % 5 === 0 ? -0.12 : 0) + (nz(x * 3, y, 8, 2) - 0.5) * 0.2 + (y < 2 ? 0.2 : 0), x, y), { rough: 0.85 });
}
function rope() { return kitMat('dummyRope', 8, 16, (x, y) => band([104, 80, 52], ((x + y) % 4 < 2 ? 1.05 : 0.82), x, y), { rough: 0.9 }); }
function tin() { return kitMat('dummyTin', 16, 16, (x, y) => band([150, 156, 160], y < 3 ? 1.25 : 0.82 + (x % 4 === 0 ? 0.12 : 0), x, y), { rough: 0.45, metal: 0.6 }); }

export class TrainingDummy implements Entity {
  kind = 'dummy'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r = 0.55; alive = true;
  hp = 60; maxHp = 60;
  obj = new THREE.Group();
  core: EnemyCore;
  /** swing at the player on a rhythm */
  attacks = true;
  /** 'kill' is never emitted; set false to let it die */
  immortal = true;
  log: { t: number; move: string; result: string; parryMs: number }[] = [];
  private body = new THREE.Group();
  private arm = new THREE.Group();
  private wob = 0; private wobV = 0;
  private cd = 1.5;
  private n = 0;
  private baseY: number;
  private dmgTaken = 0;
  constructor(x: number, y: number, public arena: Arena) {
    this.x = x; this.baseY = arena.floor;
    this.y = arena.floor + 1.05;
    this.core = new EnemyCore(this, { poise: 40, regen: 25, head: () => ({ x: this.x, y: this.y + 0.85 }) });
    // model: weighted base, post, sack torso + head, tin-bucket helmet, a padded plank arm
    const W = wood(), S = burlap(), R = rope(), T = tin();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.22, 8), W); base.position.y = -0.95;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), W); post.position.y = -0.05;
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), S); torso.scale.set(0.9, 1.15, 0.75); torso.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), S); head.position.y = 0.82;
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.26, 7), T); helm.position.y = 1.0; helm.rotation.z = 0.12;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 4, 10), R); belt.rotation.x = Math.PI / 2; belt.position.y = 0.05; belt.scale.set(1, 0.8, 1);
    for (const m of [base, post, torso, head, helm, belt]) { m.castShadow = true; m.receiveShadow = true; }
    // painted target: a red ring on the chest
    const tgt = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 10), new THREE.MeshStandardMaterial({ color: '#c0302a', roughness: 0.9, flatShading: true }));
    tgt.position.set(0, 0.25, 0.33);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.08), W); plank.position.x = 0.6;
    const pad = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), S); pad.position.x = 1.2; pad.scale.set(1.2, 0.9, 0.9);
    plank.castShadow = pad.castShadow = true;
    this.arm.add(plank, pad);
    this.arm.position.set(0, 0.45, 0.2);
    this.body.add(torso, head, helm, belt, tgt, this.arm);
    this.obj.add(base, post, this.body);
    this.obj.position.set(this.x, this.y, 0);
  }

  update(dt: number, w: World) {
    const p = w.player, c = this.core;
    const f = p.x >= this.x ? 1 : -1;
    c.facing = f;
    c.update(dt, w, () => ({ x: this.x + f * 1.2, y: this.y + 0.5 }));
    // rhythm: swing, swing, red sweep
    if (this.attacks && !c.busy && p.alive) {
      this.cd -= dt;
      if (this.cd <= 0 && Math.abs(p.x - this.x) < 2.6) { this.n++; c.start(this.n % 3 === 0 ? SWEEP : SWING); this.cd = 1.1; }
    }
    // arm pose by phase
    let armAng = 0.25, armY = 0;
    const m = c.move;
    if (c.phase === 'windup') { armAng = 0.25 + 1.4 * Math.min(1, c.k * 1.4); armY = m?.unblockable ? -0.25 : 0; }
    else if (c.phase === 'active') { armAng = 1.65 - 2.6 * c.k; armY = m?.unblockable ? -0.25 : 0; }
    else if (c.phase === 'recover') armAng = -0.95 + 1.2 * c.k;
    else if (c.phase === 'stagger') armAng = -0.6 + Math.sin(c.t * 20) * 0.1;
    if (c.phase === 'active') {
      const tipX = this.x + f * Math.cos(armAng) * 1.4, tipY = this.y + 0.45 + armY + Math.sin(armAng) * 1.4;
      const reach = Math.abs(p.x - this.x) < 2.1 && Math.abs(p.y - (this.y + 0.3)) < 1.4;
      if (reach) {
        const res = c.strike(w, { x: tipX, y: tipY, kind: 'crush' });
        if (res) this.record(w, m!.id, res);
      }
    }
    // a wobbly spring on the post (hits, swings)
    this.wobV += (-this.wob * 120 - this.wobV * 7) * dt;
    this.wob += this.wobV * dt;
    if (c.phase === 'stagger') this.wob += Math.sin(c.t * 25) * 0.01;
    this.arm.rotation.set(0, f > 0 ? 0 : Math.PI, armAng);
    this.arm.position.y = 0.45 + armY;
    this.body.rotation.set(0, (f > 0 ? 0.25 : -0.25), this.wob);
    this.obj.position.set(this.x, this.y, 0);
    void this.baseY;
  }

  private record(w: World, move: string, result: string) {
    const pc = (w.player as unknown as { combat?: { parryLog: { dt: number; result: string }[] } }).combat;
    const last = pc?.parryLog[pc.parryLog.length - 1];
    const rec = { t: +w.time.toFixed(2), move, result, parryMs: last ? last.dt : -1 };
    this.log.push(rec);
    if (this.log.length > 60) this.log.shift();
    console.log(`[dummy] ${move}${move === 'sweep' ? ' (RED)' : ''} -> ${result}`);
  }

  hit(dmg: number, dirX: number, dirY: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    const d = this.core.receive(w, dmg, dirX, dirY, kind);
    if (d < 0) return false;
    this.hp -= d; this.dmgTaken += d;
    this.wobV += -dirX * 9 * Math.min(2, 0.6 + d * 0.4);
    w.fx.debrisBurst(this.x - dirX * 0.3, this.y + 0.3, 3 + Math.round(d * 2), '#d8c080', 2.5, 0.04);
    w.sfx('cloth', this.x, 0.6, 0.8); w.sfx('wood_knock', this.x, 0.4, 1.2);
    if (this.hp <= 0) {
      if (this.immortal) { this.hp = this.maxHp; w.text.pop('RESET', this.x, this.y + 1.6, 'hint', { size: 0.3 }); }
      else { this.alive = false; w.emit('kill', { kind: 'dummy', x: this.x, y: this.y }); }
    }
    return true;
  }
  /** the player parried the dummy */
  onParried(w: World) { this.core.parried(w); this.wobV += 6; }
}
