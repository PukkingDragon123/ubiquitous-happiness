// Souls-kit projectiles: they hit the player through attackPlayer (so they can be dodged, blocked or parried).
//   Bolt   a speargun shaft / cannon bolt / flare: a parry sends it back at its shooter (it now hurts enemies);
//          a block stops it dead; the blade knocks it aside (slash)
//   Net    the netter's weighted throw net (red: unblockable). If it lands it wraps the blobfish (NetSnare)
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { attackPlayer } from './resolve';
import { segDist } from '../core/math';
import { NetSnare } from '../waves/projectiles';
import { board } from '../waves/board';
import type { Attacker } from '../waves/board';
import { steelMat } from '../humans/diveGear';
import { band } from '../humans/fabric';
import { Px } from '../gfx/px';

const _v = new THREE.Vector3();

const geos = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();
function shaftMesh(kind: 'shaft' | 'bolt' | 'flare'): THREE.Object3D {
  if (kind === 'flare') return new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7040').multiplyScalar(2.2) }));
  const big = kind === 'bolt';
  let g = geos.get(kind);
  if (!g) {
    const L = big ? 1.3 : 1.0, r = big ? 0.022 : 0.012;
    const shaft = new THREE.CylinderGeometry(r, r, L, 5); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -L / 2);
    const tip = new THREE.ConeGeometry(r * 2.6, big ? 0.18 : 0.1, 5); tip.rotateX(Math.PI / 2); tip.translate(0, 0, big ? 0.09 : 0.05);
    geos.set(kind, (g = [shaft, tip]));
  }
  const grp = new THREE.Group();
  const mat = steelMat([206, 210, 214], 0.3);
  for (const geo of g) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; grp.add(m); }
  return grp;
}

export class Bolt implements Entity {
  kind = 'bolt'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.08; alive = true;
  obj: THREE.Object3D;
  /** sent back by a parry: now it hits enemies */
  reflected = false;
  private stuck = 0; private life = 0; private px: number; private py: number;
  constructor(x: number, y: number, vx: number, vy: number, public dmg: number, public owner: (Entity & Partial<Attacker>) | null, public look: 'shaft' | 'bolt' | 'flare' = 'shaft') {
    this.x = this.px = x; this.y = this.py = y; this.vx = vx; this.vy = vy;
    this.obj = shaftMesh(look);
    this.obj.position.set(x, y, 0.15);
  }
  update(dt: number, w: World) {
    this.life += dt;
    if (this.stuck > 0) { this.stuck += dt; if (this.stuck > 4) this.alive = false; return; }
    this.px = this.x; this.py = this.y;
    const drag = Math.exp(-(this.look === 'bolt' ? 0.3 : 0.45) * dt);
    this.vx *= drag; this.vy = this.vy * drag - (this.look === 'flare' ? 0.3 : 0.8) * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.15);
    this.obj.lookAt(_v.set(this.x + this.vx, this.y + this.vy, 0.15));
    if (this.look === 'flare') { w.fx.emit('glow', this.x, this.y, { n: 1, size: 0.6, life: 0.12, color: '#ff6030' }); if (Math.random() < dt * 30) w.fx.emit('ember', this.x, this.y, { n: 1, speed: 0.5, life: 0.5, color: '#ffa040' }); }
    else if (Math.random() < dt * 20) w.fx.emit('bubbleS', this.x - this.vx * 0.05, this.y - this.vy * 0.05, { n: 1, spread: 0.02 });
    const sp = Math.hypot(this.vx, this.vy) || 1;
    if (this.reflected) {
      // a parried shaft flies back: anything on the enemy team it meets takes it
      for (const e of w.entities) {
        if (!e.alive || e.team !== 'enemy' || !e.hit || e === (this as Entity)) continue;
        if (segDist(e.x, e.y, this.px, this.py, this.x, this.y).d < e.r + this.r) {
          e.hit(this.dmg * 3, this.vx / sp, this.vy / sp, w, w.player, 'spike');
          w.fx.hit(this.x, this.y, 'crit', Math.atan2(this.vy, this.vx));
          w.sfx('hit_squish1', this.x, 0.8);
          this.alive = false;
          return;
        }
      }
    } else {
      const p = w.player;
      if (p.alive && segDist(p.x, p.y, this.px, this.py, this.x, this.y).d < p.r + this.r) {
        const res = attackPlayer(w, { src: this.owner, dmg: this.dmg, x: this.px, y: this.py, kind: this.look === 'flare' ? 'explosion' : 'spike', projectile: this, knock: 3, name: this.look === 'bolt' ? 'cannon' : this.look === 'flare' ? 'flare' : 'harpoon', guardDmg: this.look === 'bolt' ? 40 : 22 });
        if (res === 'hit') { w.fx.gore(p.x, p.y, 0.5, { x: this.vx / sp, y: this.vy / sp }); this.alive = false; return; }
        if (res === 'blocked' || res === 'guardBreak') { this.vx = -this.vx * 0.15; this.vy = 2; this.owner = null; this.dmg = 0; this.stuck = 3.5; return; }
        // dodged: keeps flying; parried: deflect() already turned it round
      }
    }
    if (w.terrain.sdf(this.x, this.y) < 0 || this.y < w.terrain.floorAt(this.x)) {
      w.fx.silt(this.x, this.y, 4);
      w.sfx('rock_hit', this.x, 0.4, 1.6);
      if (this.look === 'flare') { w.fx.explosion(this.x, this.y, 0.4); this.alive = false; } else this.stuck = 0.001;
      return;
    }
    if (this.life > 4 || sp < 1.5) this.alive = false;
  }
  /** a perfect parry sends it back at whoever shot it */
  deflect(w: World, dirX: number, dirY: number) {
    const o = this.owner;
    let ax = -dirX, ay = -dirY;
    if (o && o.alive) { const dx = o.x - this.x, dy = o.y - this.y, l = Math.hypot(dx, dy) || 1; ax = dx / l; ay = dy / l; }
    const sp = Math.max(14, Math.hypot(this.vx, this.vy) * 1.2);
    this.vx = ax * sp; this.vy = ay * sp + 0.4;
    this.reflected = true; this.life = 0;
    w.sfx('sw_clang', this.x, 0.8, 1.5);
  }
  slash(ax: number, ay: number, bx: number, by: number, _dmg: number, w: World): boolean {
    if (this.stuck > 0 || this.reflected) return false;
    if (segDist(this.x, this.y, ax, ay, bx, by).d > 0.3) return false;
    w.fx.sparks(this.x, this.y, 10);
    w.sfx('sw_clang', this.x, 0.7);
    this.vx = -this.vx * 0.3 + (Math.random() - 0.5) * 3; this.vy = Math.abs(this.vy) * 0.3 + 2;
    this.dmg = 0; this.owner = null; this.stuck = 0; this.life = 3.5;
    w.emit('deflect', { x: this.x, y: this.y });
    return true;
  }
}

// ------------------------------------------------------------------ net
let netMatC: THREE.Material | null = null;
function netMat() {
  return (netMatC ??= (() => {
    const p = new Px(64, 64);
    p.fill((x, y) => {
      const d = Math.hypot(x - 31.5, y - 31.5) / 32;
      if (d > 1) return null;
      if (d > 0.9) return band([60, 56, 50], 1, x, y);
      return (x + y) % 7 === 0 || (x - y + 70) % 7 === 0 ? band([196, 186, 150], 1, x, y) : null;
    });
    const t = p.texture();
    t.magFilter = THREE.NearestFilter;
    return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  })());
}

export class Net implements Entity {
  kind = 'net'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.3; alive = true;
  obj: THREE.Mesh;
  private open = 0; private life = 0; private done = new Set<number>();
  constructor(x: number, y: number, vx: number, vy: number, public owner: (Attacker & { haulPoint(out: THREE.Vector3): THREE.Vector3; alive: boolean; dead?: boolean }) | null, public strength: number) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.obj = new THREE.Mesh(new THREE.CircleGeometry(1, 10), netMat());
    this.obj.position.set(x, y, 0.2);
  }
  update(dt: number, w: World) {
    this.life += dt;
    this.open = Math.min(1, this.open + dt * 2.4);
    const dr = Math.exp(-1.1 * dt);
    this.vx *= dr; this.vy = this.vy * dr - 1.1 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.r = 0.25 + this.open * 0.75;
    this.obj.position.set(this.x, this.y, 0.2);
    this.obj.scale.setScalar(this.r);
    this.obj.rotation.set(0.3 + Math.sin(this.life * 5) * 0.3, Math.sin(this.life * 3) * 0.4, this.life * 2);
    const p = w.player, bb = board(w);
    if (p.alive && !bb.netOn && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r * 0.6 && !this.done.has(1)) {
      const res = attackPlayer(w, { src: this.owner, dmg: 0.5, x: this.x, y: this.y, kind: 'hook', unblockable: true, name: 'net', knock: 0 });
      if (res === 'hit') {
        const snare = new NetSnare(this.owner, this.strength);
        w.add(snare);
        bb.netOn = snare;
        w.text.pop('NETTED!', p.x, p.y + 1.1, 'danger', { size: 0.5, life: 1.2 });
        w.sfx('net', p.x, 0.8); w.sfx('squeak', p.x, 0.6, 0.8);
        w.game.addShake(0.15);
        w.emit('netted', { by: this.owner?.callsign ?? '' });
        this.alive = false;
        return;
      }
      if (res === 'dodged' || res === 'immune') this.done.add(1);
    }
    if (this.y < w.terrain.floorAt(this.x) + 0.1 || this.life > 3.2 || w.terrain.sdf(this.x, this.y) < 0) { w.fx.silt(this.x, this.y, 3); this.alive = false; }
  }
  slash(ax: number, ay: number, bx: number, by: number, _d: number, w: World): boolean {
    if (segDist(this.x, this.y, ax, ay, bx, by).d > this.r) return false;
    w.text.pop('SHRED', this.x, this.y + 0.4, 'hint', { size: 0.3 });
    w.fx.debrisBurst(this.x, this.y, 8, '#c4ba96', 3, 0.04);
    this.alive = false;
    return true;
  }
  dispose() { this.obj.geometry.dispose(); }
}
