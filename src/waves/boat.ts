// Boats on the surface (the humans module's hulls and fishermen): they motor in to a surface spot and work it.
// Jobs:
//   charges  the crew rolls depth charges over the side whenever the blobfish is below (set to its depth)
//   lines    the crew casts baited hook lines (src/fishing FishingLine); touch a hook and you're hauled up —
//            cut the line with the sword
//   trawl    a trawl net hangs from the stern and sweeps the water column as the boat crosses the area
//   drop     a dive boat: divers roll backwards off the side, then it leaves
//   cannon   the boss trawler's deck harpoon cannon (with charges and a trawl)
// A boat's hull can be hacked at from below; at 0 hp it lists, floods and sinks with its crew.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import { makeBoat, makeFisherman } from '../humans';
import type { Fisherman, Vessel, BoatKind, Archetype } from '../humans';
import type { Attacker } from './board';
import { board } from './board';
import { DepthCharge, Harpoon, NetSnare, pullPlayer, hurtPlayer } from './projectiles';
import { FishingLine, LINES } from '../fishing/line';
import { buildHook } from '../fishing/bait';
import { bark } from './barks';
import { explosion, bubbles, sparks, silt } from './fx';
import { segDist, clamp } from '../core/math';
import { kitMat } from '../humans/diveGear';
import { band, hh } from '../humans/fabric';

export type BoatJob = 'charges' | 'lines' | 'trawl' | 'drop' | 'cannon';
const _v = new THREE.Vector3();

interface HookLine { line: FishingLine; hook: THREE.Object3D; crew: Fisherman; hooked: boolean; t: number; x: number; y: number; vy: number }

export class SurfaceBoat implements Entity, Attacker {
  kind = 'boat'; team: Team = 'enemy';
  x: number; y = 0; vx = 0; vy = 0; r = 1.2; alive = true;
  hp: number; maxHp: number;
  obj = new THREE.Group();
  vessel: Vessel;
  crew: Fisherman[] = [];
  callsign: string;
  squad = 0;
  state: 'arrive' | 'work' | 'leave' | 'sinking' = 'arrive';
  isBoss = false; bossName?: string;
  onSunk?: (b: SurfaceBoat, w: World) => void;
  /** dive boats: called when a diver should roll off (x, y) */
  onDrop?: (x: number, b: SurfaceBoat) => void;
  private t = 0;
  private cool = 2;
  private lines: HookLine[] = [];
  private trawl: TrawlNet | null = null;
  private dropLeft = 0;
  private sinkT = 0;
  private dir: number;
  private iq: number;
  private workT = 0;

  constructor(public job: BoatJob, kind: BoatKind, public stationX: number, fromSide: number, seed: number, o: { iq?: number; hpMul?: number; crew?: Archetype[]; drops?: number; boss?: boolean } = {}) {
    this.vessel = makeBoat(kind, seed);
    this.dir = fromSide;
    this.x = stationX + fromSide * 22;
    this.vessel.setX(this.x);
    this.obj.add(this.vessel.group);
    this.iq = o.iq ?? 0.4;
    this.maxHp = this.hp = Math.round((kind === 'trawler' ? 45 : kind === 'skiff' ? 16 : 12) * (o.hpMul ?? 1) * (o.boss ? 2 : 1));
    this.isBoss = !!o.boss;
    if (this.isBoss) this.bossName = 'The Harpoon Trawler';
    this.callsign = kind === 'trawler' ? 'the trawler crew' : 'the boat crew';
    const crewA = o.crew ?? (job === 'lines' ? ['proAngler'] : job === 'charges' ? ['dockWorker'] : ['oldSalt']);
    crewA.forEach((a, i) => {
      const seat = this.vessel.seats[i % Math.max(1, this.vessel.seats.length)];
      if (!seat) return;
      const f = makeFisherman(a, seed + i * 17);
      seat.add(f.group);
      f.setSeating((seat.userData.seating as 'stand' | 'sit' | 'kayak') ?? 'stand');
      f.setFacing(-fromSide);
      f.setMood(-0.6);
      this.crew.push(f);
    });
    this.dropLeft = o.drops ?? 0;
    this.r = this.vessel.length * 0.35;
  }

  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    const v = this.vessel;
    if (this.state === 'sinking') { this.sink(dt, w); return; }
    // ---- motor to the station, hold (drifting a little toward the action), leave when done
    let want = 0;
    if (this.state === 'arrive') {
      const dx = this.stationX - this.x;
      want = clamp(dx, -3, 3);
      if (Math.abs(dx) < 0.6) { this.state = 'work'; this.workT = 0; if (this.job === 'trawl' || this.job === 'cannon') this.trawl = this.trawl ?? this.makeTrawl(w); }
    } else if (this.state === 'work') {
      this.workT += dt;
      if (this.job === 'trawl') want = -this.dir * 1.1;
      else if (this.job === 'charges' || this.job === 'cannon') want = clamp((p.x - this.x) * 0.4, -1.4, 1.4) * (this.iq > 0.3 ? 1 : 0.4);
      if (this.job === 'drop' && this.dropLeft <= 0 && this.workT > 3) this.state = 'leave';
      if (this.job === 'trawl' && Math.abs(this.x - this.stationX) > 18) this.state = 'leave';
    } else if (this.state === 'leave') {
      want = this.dir * 3.5;
      if (Math.abs(this.x - this.stationX) > 26) { this.alive = false; return; }
    }
    this.vx += (want - this.vx) * (1 - Math.exp(-dt * 0.8));
    v.drift(this.vx);
    v.update(dt, w.water);
    this.x = v.x;
    this.y = w.water.heightAt(this.x) - 0.2;
    for (const f of this.crew) { f.lookAt(p.x, p.y); f.update(dt); }
    if (this.state !== 'work') return;
    // ---- jobs
    this.cool -= dt;
    const below = Math.abs(p.x - this.x) < 5 + this.iq * 3 && p.alive && p.y < w.water.heightAt(p.x) - 0.5;
    if ((this.job === 'charges' || this.job === 'cannon') && below && this.cool <= 0) {
      this.cool = (this.job === 'cannon' ? 2.6 : 3.4) - this.iq;
      const f = this.crew[0];
      if (f) { f.play('throw'); f.expression('angry'); }
      const depth = this.iq > 0.35 ? p.y + (Math.random() - 0.5) * 1.2 : p.y - 2 + Math.random() * 4;
      const n = this.job === 'cannon' || this.iq > 0.8 ? 2 : 1;
      for (let i = 0; i < n; i++) w.add(new DepthCharge(this.x + (Math.random() - 0.5) * 1.2 + i * 0.7, this.y + 0.6, depth, this, 1));
      w.sfx('wood_knock', this.x, 0.6);
      if (Math.random() < 0.4) bark(w, 'boat', this.x, this.y + 0.8);
    }
    if (this.job === 'cannon' && this.cool > 0.5 && this.cool < 0.55 && p.alive) {
      // the deck gun: a heavy harpoon straight down at the blobfish
      const ang = Math.atan2(p.y - (this.y + 0.8), p.x - this.x);
      w.add(new Harpoon(this.x, this.y + 0.3, Math.cos(ang) * 16, Math.sin(ang) * 16, 2, this, null, true));
      w.sfx('thud_heavy', this.x, 0.8, 0.6);
      w.game.addShake(0.08);
    }
    if (this.job === 'lines') this.workLines(dt, w);
    if (this.job === 'drop' && this.dropLeft > 0 && this.cool <= 0) {
      this.cool = 1.4;
      this.dropLeft--;
      w.fx.splash(this.x + this.dir * 0.8, 1.2);
      w.sfx('splash_b', this.x, 0.7);
      this.onDrop?.(this.x + this.dir * 0.8, this);
    }
    if (this.trawl) this.trawl.place(this.x - this.vx * 0.5, w);
  }

  private workLines(dt: number, w: World) {
    const p = w.player;
    // keep a line per crew member in the water
    for (const f of this.crew) {
      if (this.lines.some((l) => l.crew === f) || this.cool > 0) continue;
      this.cool = 1.5;
      f.play('cast');
      f.onCastRelease = () => {
        const line = new FishingLine(LINES.braid);
        f.rodTip(_v);
        const tx = p.x + (Math.random() - 0.5) * 3, ty = Math.max(w.terrain.floorAt(tx) + 1, Math.min(-1.2, p.y + (Math.random() - 0.5) * 2));
        line.reset(_v.x, _v.y, tx, ty, Math.hypot(tx - _v.x, ty - _v.y) * 1.1);
        const hook = buildHook();
        w.scene.add(hook);
        w.add(line);
        const hl: HookLine = { line, hook, crew: f, hooked: false, t: 0, x: tx, y: ty, vy: 0 };
        line.onSnap = () => this.dropLine(hl, w, true);
        this.lines.push(hl);
      };
    }
    for (const hl of [...this.lines]) {
      hl.t += dt;
      const L = hl.line;
      hl.crew.rodTip(_v);
      L.tip.set(_v.x, _v.y);
      if (!L.alive || L.snapped) { this.dropLine(hl, w, false); continue; }
      if (!hl.hooked) {
        // jig the hook at depth, slowly drifting toward the blobfish
        hl.x += clamp(p.x - hl.x, -1, 1) * dt * 0.4 * this.iq;
        hl.y += Math.sin(hl.t * 2.3) * dt * 0.4;
        L.end = { x: hl.x, y: hl.y };
        hl.hook.position.set(hl.x, hl.y - 0.05, 0.05);
        hl.hook.rotation.z = Math.sin(hl.t * 3) * 0.3;
        hl.crew.setTension(0.1);
        if (p.alive && !p.hooked && !board(w).netOn && Math.hypot(p.x - hl.x, p.y - hl.y) < p.r + 0.18) {
          hl.hooked = true;
          p.hooked = true;
          hl.crew.play('yank');
          w.text.pop('HOOKED!', p.x, p.y + 1.1, 'danger', { size: 0.5 });
          w.sfx('hook_clink1', p.x, 0.9); w.sfx('reel', p.x, 0.6);
          w.game.addShake(0.2);
          w.emit('hooked', { by: 'boat' });
        }
        if (hl.t > 14) { L.alive = false; }
      } else {
        // hauling: the line drags the blobfish up toward the boat; slash it to get free
        const st = hl.t % 3 < 2 ? 'reel' : 'yank';
        if (hl.crew.state !== st) hl.crew.play(st);
        hl.crew.setTension(0.9);
        L.end = { x: p.x, y: p.y };
        hl.hook.position.set(p.x, p.y, 0.4);
        L.reel(-dt * 0.9);
        const dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy) || 1;
        pullPlayer(w, (dx / d) * 11, (dy / d) * 11, dt);
        if (p.y > w.water.heightAt(p.x) - 0.6) {
          // landed: smacked about on deck and thrown back
          hurtPlayer(w, 2, this.x, this.y, 'hook', this, 'hooked');
          w.text.pop('LANDED!', p.x, p.y + 1, 'danger', { size: 0.5 });
          p.push(-this.dir * 3, -6);
          for (const f of this.crew) f.play('cheer');
          L.alive = false;
        }
      }
    }
  }
  private dropLine(hl: HookLine, w: World, snapped: boolean) {
    const p = w.player;
    if (hl.hooked) { p.hooked = false; if (snapped) { w.text.pop('FREE!', p.x, p.y + 1, 'gold', { size: 0.4 }); hl.crew.play('snapFall'); } }
    hl.hook.removeFromParent();
    hl.line.alive = false;
    this.lines.splice(this.lines.indexOf(hl), 1);
    this.cool = 3;
  }

  private makeTrawl(w: World) { const t = new TrawlNet(this); w.add(t); return t; }

  // ---------------------------------------------------------------- damage + sinking
  hit(dmg: number, dx: number, _dy: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    if (this.state === 'sinking') return false;
    this.hp -= dmg * (kind === 'explosion' ? 2 : 1);
    sparks(w, this.x, this.y - 0.3, 6);
    w.fx.debrisBurst(this.x, this.y - 0.3, 5, '#7a5a3a', 3, 0.08);
    w.sfx('wood_knock', this.x, 0.7);
    for (const f of this.crew) { f.play('surprised'); }
    this.vx += dx * 0.5;
    if (this.hp <= 0) this.startSink(w);
    return true;
  }
  private startSink(w: World) {
    this.state = 'sinking'; this.sinkT = 0;
    this.team = 'neutral';
    for (const hl of [...this.lines]) this.dropLine(hl, w, true);
    if (this.trawl) this.trawl.alive = false;
    for (const f of this.crew) f.play('snapFall');
    explosion(w, this.x, this.y, 0.7);
    w.sfx('rock_crumble', this.x, 0.8); w.sfx('creak', this.x, 0.8);
    w.emit('kill', { kind: 'boat', x: this.x, y: this.y });
    w.drop(this.x, this.y - 0.5, { coins: this.isBoss ? 40 : 8, item: 'scrap' });
    this.onSunk?.(this, w);
  }
  private sink(dt: number, w: World) {
    this.sinkT += dt;
    const g = this.vessel.group;
    g.rotation.z += dt * 0.25 * this.dir;
    g.position.y -= dt * (0.4 + this.sinkT * 0.25);
    this.y = g.position.y;
    if (Math.random() < dt * 25) bubbles(w, this.x + (Math.random() - 0.5) * this.vessel.length, this.y + 0.2, 2, 1.5);
    if (this.y < w.terrain.floorAt(this.x) + 0.3) { silt(w, this.x, this.y, 12); this.alive = false; }
  }
  /** where a trawl / net line is hauled from */
  haulPoint(out: THREE.Vector3) { return out.set(this.x, this.y + 0.3, 0); }
  get dead() { return this.state === 'sinking'; }
  /** a hull collider on the gameplay plane (blades / bites / ramming hit the boat here) */
  colliders() { return this.vessel.underwaterColliders(); }
  dispose(w: World) {
    for (const hl of [...this.lines]) this.dropLine(hl, w, false);
    if (this.trawl) this.trawl.alive = false;
    for (const f of this.crew) f.dispose();
  }
}

// ------------------------------------------------------------------ trawl net
let trawlMat: THREE.Material | null = null;
class TrawlNet implements Entity {
  kind = 'trawl'; team: Team = 'neutral';
  x = 0; y = 0; vx = 0; vy = 0; r = 1.5; alive = true;
  hp = 10;
  obj: THREE.Group = new THREE.Group();
  private mesh: THREE.Mesh;
  private top = -0.6; private bot = -5; private w2 = 1.6;
  private cd = 0;
  constructor(public boat: SurfaceBoat) {
    trawlMat ??= (() => {
      const m = kitMat('trawl', 64, 64, (x, y) => ((x + y) % 6 === 0 || (x - y + 64) % 6 === 0 ? band([170, 160, 120], 0.85 + hh(x, y, 5) * 0.3, x, y) : y < 3 ? band([200, 90, 30], 1, x, y) : null), { rough: 0.9 }) as THREE.MeshStandardMaterial;
      m.alphaTest = 0.5; m.side = THREE.DoubleSide;
      return m;
    })();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 4, 6), trawlMat);
    this.obj.add(this.mesh);
  }
  place(bx: number, w: World) {
    this.x = bx - Math.sign(this.boat.vx || 1) * 2.5;
    this.bot = Math.max(w.terrain.floorAt(this.x) + 0.8, -6.5);
    this.y = (this.top + this.bot) / 2;
  }
  update(dt: number, w: World) {
    const h = this.top - this.bot;
    this.mesh.position.set(this.x, this.y, 0.05);
    this.mesh.scale.set(this.w2 * 2, h, 1);
    // billow
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getY(i) * 3 + w.time * 2 + pos.getX(i) * 2) * 0.08);
    pos.needsUpdate = true;
    this.cd -= dt;
    const p = w.player;
    if (p.alive && this.cd <= 0 && !board(w).netOn && Math.abs(p.x - this.x) < this.w2 && p.y < this.top && p.y > this.bot) {
      const s = new NetSnare(this.boat, 1.5);
      w.add(s);
      board(w).netOn = s;
      w.text.pop('TRAWLED!', p.x, p.y + 1.1, 'danger', { size: 0.5 });
      w.sfx('net', p.x, 0.8);
      this.cd = 6;
    }
    if (!this.boat.alive || this.boat.state === 'sinking') this.alive = false;
  }
  slash(ax: number, ay: number, bx: number, by: number, dmg: number, w: World): boolean {
    if (Math.abs((ax + bx) / 2 - this.x) > this.w2 || (ay + by) / 2 > this.top || (ay + by) / 2 < this.bot) return false;
    this.hp -= dmg;
    w.fx.debrisBurst((ax + bx) / 2, (ay + by) / 2, 5, '#aaa070', 3, 0.04);
    w.sfx('sw_slash', this.x, 0.5, 1.3);
    if (this.hp <= 0) { this.alive = false; w.text.pop('TORN!', this.x, this.y, 'gold', { size: 0.4 }); }
    void segDist;
    return true;
  }
}
