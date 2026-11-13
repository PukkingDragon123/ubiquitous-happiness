// Boss fights: human bosses built on the angler system plus their signature hazards.
//   Act 1 – THE REEL KING: a golden-rod show-off who also lobs golden lure bombs into the water
//   Act 2 – CAPTAIN FROSTBEARD: wire leaders + telegraphed harpoons that spear down from the icebreaker
//   Act 3 – THE LEVIATHAN TRAWLER: heavy cord, a crew of dock workers, and a giant trawl net that sweeps the
//            water column; get caught and you must hack your way out
// Boss resolve is shown diegetically: a row of bobbers floating above the vessel, one pops per broken line.
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { ANGLERS, Angler, FishingSystem } from './angler';
import { buildBobber } from './bait';
import { uw } from '../gfx/shaders/underwater';
import { Px, ramp } from '../gfx/px';
import { textSprite, STYLES } from '../ui/text';
import { clamp, segDist, TAU } from '../core/math';
import type { Blobfish } from '../player/blobfish';
import type { DiveNode } from '../game/dive';

Object.assign(ANGLERS, {
  reelKing: { arch: 'proAngler', vessel: 'dinghy', name: 'The Reel King', line: 'braid', baits: ['goldWorm', 'spoon', 'minnow'], resolve: 5, reel: 1.05, yankEvery: 1.8, yankPower: 1.35, patience: 9, castMin: 3, castMax: 10, depthMin: 3, depthMax: 9, bobber: false, loot: ['luckyLure', 'reelGear'], qteDifficulty: 1.4, greed: 1 },
  frostbeard: { arch: 'captainGaff', vessel: 'trawler', name: 'Captain Frostbeard', line: 'wire', baits: ['squid', 'minnow'], resolve: 6, reel: 1.1, yankEvery: 1.7, yankPower: 1.45, patience: 9, castMin: 2, castMax: 9, depthMin: 4, depthMax: 10, bobber: false, loot: ['captainsCompass'], qteDifficulty: 1.6, greed: 1 },
  leviathan: { arch: 'captainGaff', vessel: 'trawler', name: 'The Leviathan Trawler', line: 'heavy', baits: ['squid', 'minnow', 'goldWorm'], resolve: 7, reel: 1.2, yankEvery: 1.6, yankPower: 1.6, patience: 8, castMin: 2, castMax: 10, depthMin: 5, depthMax: 14, bobber: false, loot: ['reelGear'], qteDifficulty: 1.8, greed: 1 },
});

/** pips: bobbers floating over the boss vessel, one per point of resolve */
class ResolvePips implements Entity {
  kind = 'pips'; team: Team = 'neutral';
  x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true;
  obj = new THREE.Group();
  private pips: THREE.Group[] = [];
  private shown: number;
  private label: THREE.Sprite;
  constructor(private boss: Angler) {
    this.shown = boss.resolve;
    for (let i = 0; i < boss.resolve; i++) { const b = buildBobber(); b.scale.setScalar(2.2); this.obj.add(b); this.pips.push(b); }
    this.label = textSprite(boss.def.name.toUpperCase(), STYLES.title, 0.42);
    this.obj.add(this.label);
  }
  update(dt: number, w: World) {
    const bx = this.boss.vessel.group.position.x;
    const n = this.pips.length;
    this.pips.forEach((p, i) => {
      const alive = i < this.boss.resolve;
      p.position.set(bx + (i - (n - 1) / 2) * 0.55, 4.1 + Math.sin(w.time * 2 + i) * 0.08, -0.4);
      p.visible = alive || p.scale.x > 0.05;
      if (!alive) p.scale.multiplyScalar(Math.exp(-dt * 8));
    });
    if (this.boss.resolve < this.shown) {
      const p = this.pips[this.boss.resolve];
      if (p) { w.fx.burst('star', p.position.x, p.position.y, 10, 3); w.sfx('pop', p.position.x, 0.8); }
      this.shown = this.boss.resolve;
    }
    this.label.position.set(bx, 4.75, -0.4);
    if (!this.boss.alive) this.alive = false;
  }
}

/** Reel King's golden lure bombs: drop in, tick, explode; slash them to bat them away */
class LureBomb implements Entity {
  kind = 'lureBomb'; team: Team = 'enemy';
  x: number; y: number; vx: number; vy = 0; r = 0.3; alive = true; hp = 1;
  obj = new THREE.Group();
  private t = 0;
  private fuse = 2.6;
  constructor(x: number, y: number, vx: number) {
    this.x = x; this.y = y; this.vx = vx;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), uw(new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.9, roughness: 0.2, emissive: '#5a3a00' }), { rim: 0.6 }));
    body.scale.set(1, 1.35, 0.6);
    const hooks = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#c0c8d0', metalness: 1, roughness: 0.3 }));
    hooks.position.y = -0.32;
    this.obj.add(body, hooks);
  }
  update(dt: number, w: World) {
    this.t += dt;
    const under = this.y < w.water.heightAt(this.x);
    this.vy += (under ? -1.8 : -9.8) * dt;
    this.vx *= Math.exp(-(under ? 2 : 0.2) * dt); this.vy *= Math.exp(-(under ? 2 : 0.1) * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const fl = w.terrain.floorAt(this.x) + 0.3;
    if (this.y < fl) { this.y = fl; this.vy = 0; }
    if (under && this.t > 0.3 && this.fuse === 2.6) { w.water.disturb(this.x, 1, 0.3); w.fx.splash(this.x, 0.6); }
    if (under) this.fuse -= dt;
    const blink = this.fuse < 1 ? Math.sin(this.t * 40) > 0 : Math.sin(this.t * 10) > 0.6;
    ((this.obj.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.set(blink ? '#ff4020' : '#5a3a00');
    this.obj.position.set(this.x, this.y, 0.1);
    this.obj.rotation.z = Math.sin(this.t * 4) * 0.3;
    if (this.fuse <= 0) this.explode(w);
  }
  hit(_d: number, dx: number, dy: number, w: World) { this.vx = dx * 9; this.vy = dy * 9 + 2; this.fuse = Math.max(this.fuse, 0.8); w.sfx('sw_clang', this.x, 0.8); return true; }
  private explode(w: World) {
    this.alive = false;
    w.fx.emit('glow', this.x, this.y, { n: 1, size: 3, size1: 5, life: 0.35, color: '#ffd060', add: true });
    w.fx.burst('ember', this.x, this.y, 30, 6, { color: '#ffb040' });
    w.fx.emit('bubbleBig', this.x, this.y, { n: 16, spread: 0.6, speed: 3 });
    w.sfx('boom_uw1', this.x, 1); w.game.addShake(0.35);
    w.water.disturb(this.x, 2, 1.2);
    const p = w.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 2.2) w.hurtPlayer(1, this.x, this.y, 'explosion');
    for (const e of w.near(this.x, this.y, 2.2)) if (e !== this && e.slash) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; e.slash(this.x, this.y, this.x + Math.cos(a) * 2.2, this.y + Math.sin(a) * 2.2, 4, w); }
  }
}

/** Frostbeard's harpoon: a red telegraph line first, then a barbed iron spear rockets along it */
class Harpoon implements Entity {
  kind = 'harpoon'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r = 0.2; alive = true;
  obj = new THREE.Group();
  private t = 0;
  private ax: number; private ay: number; private dx: number; private dy: number;
  private tele: THREE.Mesh; private spear: THREE.Group;
  private stuck = false;
  constructor(ax: number, ay: number, tx: number, ty: number) {
    this.ax = ax; this.ay = ay; this.x = ax; this.y = ay;
    const l = Math.hypot(tx - ax, ty - ay) || 1; this.dx = (tx - ax) / l; this.dy = (ty - ay) / l;
    this.tele = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.06), new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tele.geometry.translate(0.5, 0, 0);
    this.tele.scale.x = 26;
    this.tele.position.set(ax, ay, 0.2); this.tele.rotation.z = Math.atan2(this.dy, this.dx);
    this.spear = new THREE.Group();
    const iron = uw(new THREE.MeshStandardMaterial({ color: '#4a5058', metalness: 0.9, roughness: 0.35 }));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8), iron); shaft.rotation.z = Math.PI / 2; shaft.position.x = -1.1;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 8), iron); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.15;
    const barb1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), iron); barb1.position.set(-0.05, 0.1, 0); barb1.rotation.z = 2.4;
    const barb2 = barb1.clone(); barb2.position.y = -0.1; barb2.rotation.z = 0.74;
    this.spear.add(shaft, tip, barb1, barb2);
    this.spear.visible = false;
    this.obj.add(this.tele, this.spear);
  }
  update(dt: number, w: World) {
    this.t += dt;
    const m = this.tele.material as THREE.MeshBasicMaterial;
    if (this.t < 0.9) { m.opacity = (Math.sin(this.t * 30) > 0 ? 0.55 : 0.25) * Math.min(1, this.t * 4); return; }
    m.opacity = Math.max(0, m.opacity - dt * 3);
    if (!this.spear.visible) { this.spear.visible = true; w.sfx('swish_c', this.ax, 0.9, 0.7); }
    if (!this.stuck) {
      const sp = 26 * dt;
      const px = this.x, py = this.y;
      this.x += this.dx * sp; this.y += this.dy * sp;
      if (py > 0 && this.y <= w.water.heightAt(this.x)) { w.water.disturb(this.x, 2, 0.4); w.fx.splash(this.x, 1.2); w.sfx('splash_b', this.x, 0.8); }
      const p = w.player;
      if (segDist(p.x, p.y, px, py, this.x, this.y).d < p.r + 0.15) w.hurtPlayer(1, this.x - this.dx, this.y - this.dy, 'spike');
      if (w.terrain.sdf(this.x, this.y) < 0) { this.stuck = true; w.sfx('rock_hit', this.x, 0.9); w.fx.debrisBurst(this.x, this.y, 8, '#7a7064', 3); w.game.addShake(0.15); }
    }
    this.spear.position.set(this.x, this.y, 0.1);
    this.spear.rotation.z = Math.atan2(this.dy, this.dx);
    if (this.t > 7) this.alive = false;
  }
}

/** the Leviathan's trawl net: a sagging mesh wall swept across the water column */
class TrawlNet implements Entity {
  kind = 'net'; team: Team = 'enemy';
  x: number; y = 0; vx: number; vy = 0; r = 0.5; alive = true;
  obj: THREE.Mesh;
  private t = 0;
  private caught = 0;
  private cutHp = 0;
  private geo: THREE.PlaneGeometry;
  constructor(x: number, dir: number, private top: number, private bottom: number) {
    this.x = x; this.vx = dir * 3.2;
    const p = new Px(32, 32);
    const r = ramp(['#2a3a2a', '#5a6a4a', '#8a9a6a'], 3);
    p.fill((xx, yy) => ((xx % 8 < 1 || yy % 8 < 1) ? r(0.6, xx, yy) : null));
    const tex = p.texture({ repeat: true }); tex.repeat.set(3, 12);
    this.geo = new THREE.PlaneGeometry(3.5, top - bottom, 10, 30);
    this.obj = new THREE.Mesh(this.geo, uw(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 })));
    this.obj.position.set(x, (top + bottom) / 2, 0.15);
    this.obj.rotation.y = Math.PI / 2 - 0.35;
  }
  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player as Blobfish;
    if (this.caught > 0) {
      // trapped: hack your way out (sword) — the net drags you along meanwhile
      p.carried = (d) => { p.sb.accel((this.x - p.x) * 20 - p.vx * 4, 0, d); };
      if (w.game.input.hit('attack')) { this.cutHp += 1; w.sfx('rope_twang', p.x, 0.7); w.fx.burst('spark', p.x, p.y, 4, 2); }
      this.caught += dt;
      if (this.cutHp >= 6) { p.carried = null; this.caught = -99; w.text.pop('CUT FREE!', p.x, p.y + 1, 'gold', { size: 0.4 }); p.sb.accel(-this.vx * 30, 40, 1 / 60); }
      else if (this.caught > 3) { p.carried = null; this.caught = -99; w.hurtPlayer(2, this.x, p.y, 'crush'); }
    } else if (this.caught === 0 && Math.abs(p.x - this.x) < 0.6 && p.y < this.top && p.y > this.bottom && p.alive) {
      this.caught = 0.001; this.cutHp = 0;
      w.text.pop('NETTED! SLASH OUT!', p.x, p.y + 1.2, 'danger', { size: 0.42 });
      w.sfx('net1', p.x, 1);
    }
    this.x += this.vx * dt;
    this.obj.position.x = this.x;
    // the net billows
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const yy = pos.getY(i), xx = pos.getX(i); pos.setZ(i, Math.sin(yy * 0.8 + this.t * 2 + xx) * 0.25 + (xx > 0 ? 0.4 : 0)); }
    pos.needsUpdate = true;
    if (Math.abs(this.x - w.player.x) > 40) this.alive = false;
  }
  dispose() { this.geo.dispose(); }
}

export function setupBoss(w: World, node: DiveNode, sys: FishingSystem, done: () => void) {
  const act = clamp(Math.round(w.run.act), 1, 3);
  const id = act === 1 ? 'reelKing' : act === 2 ? 'frostbeard' : 'leviathan';
  const boss = sys.spawn(w, id, 4, -1);
  boss.resolve += Math.max(0, Math.round(node.difficulty) - act);
  if (act === 3) { sys.spawn(w, 'dockWorker', -8, 1); sys.spawn(w, 'dockWorker', 16, -1); }
  w.add(new ResolvePips(boss));
  w.text.pop(ANGLERS[id].name.toUpperCase(), w.player.x + 6, 1.6, 'title', { size: 0.9, life: 3.5 });
  w.sfx('boss_growl2', boss.x, 0.6); w.sfx('honk', boss.x, 0.8);
  let hazard = 4;
  const tick = (dt: number) => {
    if (!boss.alive || boss.phase === 'gone' || boss.phase === 'giveup') return;
    hazard -= dt;
    if (hazard > 0) return;
    const p = w.player;
    const angry = 1 - boss.resolve / (ANGLERS[id].resolve + 1);
    hazard = (act === 1 ? 5 : act === 2 ? 4 : 9) * (1 - angry * 0.4);
    if (act === 1) {
      const n = 1 + Math.round(angry * 2);
      for (let k = 0; k < n; k++) w.add(new LureBomb(boss.x - 1, 2.5, (p.x - boss.x) * 0.45 + (k - n / 2) * 1.5));
      w.text.pop('CATCH, PEASANT!', boss.x - 1, 3.4, 'danger', { size: 0.3 });
    } else if (act === 2) {
      const n = 1 + Math.round(angry * 2);
      for (let k = 0; k < n; k++) setTimeout(() => w.add(new Harpoon(boss.x - 1.5, 2.6, p.x + p.vx * 0.5 + (k - 1) * 1.6, p.y + p.vy * 0.5)), k * 350);
    } else {
      const dir = Math.random() < 0.5 ? 1 : -1;
      w.add(new TrawlNet(p.x - dir * 18, dir, -0.6, w.terrain.floorAt(p.x) + 0.6));
      w.text.pop('NETS OUT!', boss.x, 3.4, 'danger', { size: 0.34 });
      w.sfx('chain1', boss.x, 0.8);
    }
  };
  (w as unknown as { on(ev: string, fn: (d: Record<string, unknown>) => void): void }).on('tick', (d) => tick((d.dt as number) ?? 0.016));
  sys.onAnglerDefeated = (a) => { if (a === boss) { for (const o of sys.anglers) if (o !== boss && o.phase !== 'gone') { o.resolve = 0; } done(); } };
}
