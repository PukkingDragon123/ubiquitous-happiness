// Boss base: one per floor. Dormant until the blobfish enters its arena, then an intro (roar + a 3D name /
// title card + 'bossIntro'), 2-3 phases split by hp (each with its own learnable move cycle; a phase change is
// an invulnerable roar + 'bossPhase'), parry windows on the white-glint moves, poise breaks for a riposte, and a
// death sequence (slow-mo, bursts, '<NAME> FELLED', 'kill' {boss: true} + 'bossDefeated', then onDefeated()).
//
// Subclasses build the body, map move ids to MoveDefs and run them:
//   moves: Record<string, MoveDef>; cycles: string[][] (one per phase)
//   approach(dt, w): free movement between moves;  run(dt, w): per-frame move logic (poses, hitboxes)
//   want(id, w): can this move start from here (range check) — else the boss approaches first
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { Arena, BossBar, BossEntity } from '../combat/types';
import { EnemyCore, type MoveDef } from '../combat/core';
import { callout } from '../combat/feel';
import { clamp } from '../core/math';

export type BossState = 'dormant' | 'intro' | 'fight' | 'transition' | 'dying' | 'dead';

export abstract class BossBase implements BossEntity {
  kind: string;
  team: Team = 'enemy';
  isBoss = true as const;
  bossId: string;
  bossName: string;
  title: string;
  x: number; y: number; vx = 0; vy = 0; r = 1; alive = true;
  hp: number; maxHp: number;
  obj = new THREE.Group();
  core: EnemyCore;
  state: BossState = 'dormant';
  st = 0;
  phase = 1;
  /** hp fractions where phases 2, 3 start */
  phaseAt: number[] = [0.66, 0.33];
  onDefeated?: () => void;
  facing = -1;
  /** the move cycle per phase (learnable patterns) */
  abstract cycles: string[][];
  abstract moves: Record<string, MoveDef>;
  protected cycleI = 0;
  protected queued: string | null = null;
  protected cd = 1;
  protected flash = 0;
  /** extra damage taken multiplier (weak points, enrage) */
  protected vuln = 1;

  constructor(kind: string, public arena: Arena, o: { name: string; title: string; hp: number; poise: number; r: number; x?: number; y?: number }) {
    this.kind = kind; this.bossId = kind;
    this.bossName = o.name; this.title = o.title;
    this.hp = this.maxHp = o.hp;
    this.r = o.r;
    this.x = o.x ?? arena.x0 + (arena.x1 - arena.x0) * 0.72;
    this.y = o.y ?? arena.floor + o.r;
    this.core = new EnemyCore(this, { poise: o.poise, regen: o.poise * 0.12, head: () => this.head() });
    this.core.onStagger = (w, k) => this.onStagger(w, k);
  }
  get phases() { return this.phaseAt.length + 1; }
  head() { return { x: this.x, y: this.y + this.r + 0.4 }; }

  bar(): BossBar {
    return { name: this.bossName, title: this.title, hp: Math.max(0, this.hp), max: this.maxHp, phase: this.phase, phases: this.phases, poise: clamp(this.core.poise / this.core.poiseMax, 0, 1), visible: this.state !== 'dormant' && this.state !== 'dead' };
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, w: World) {
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    const p = w.player, a = this.arena;
    switch (this.state) {
      case 'dormant':
        this.idlePose(dt, w);
        if (p.alive && p.x > a.x0 + 0.5 && p.x < a.x1 - 0.5 && p.y > a.floor - 1 && p.y < a.top + 1) this.setState('intro', w);
        break;
      case 'intro': {
        this.introPose(dt, w, clamp(this.st / 2.6, 0, 1));
        if (this.st >= 2.6) this.setState('fight', w);
        break;
      }
      case 'fight': {
        this.facing = p.x >= this.x ? 1 : -1;
        this.core.facing = this.facing;
        this.core.update(dt, w, () => this.tellPoint());
        if (!this.core.busy && p.alive) {
          this.cd -= dt;
          const id = this.queued ?? this.cycles[this.phase - 1][this.cycleI % this.cycles[this.phase - 1].length];
          this.queued = id;
          if (this.cd <= 0 && this.want(id, w)) {
            this.queued = null; this.cycleI++;
            this.core.start(this.moves[id]);
            this.started(w, this.moves[id]);
          } else this.approach(dt, w, id);
        }
        if (this.core.busy) this.run(dt, w);
        if (this.core.phase === 'stagger') this.staggerPose(dt, w);
        break;
      }
      case 'transition': {
        this.transitionPose(dt, w, clamp(this.st / 1.8, 0, 1));
        if (this.st >= 1.8) this.setState('fight', w);
        break;
      }
      case 'dying': this.dying(dt, w); break;
      case 'dead': this.deadPose(dt, w); break;
    }
    this.place(dt, w);
  }

  protected setState(s: BossState, w: World) {
    const prev = this.state;
    this.state = s; this.st = 0;
    if (s === 'intro') {
      w.emit('bossIntro', { id: this.bossId, name: this.bossName, title: this.title });
      const cx = (this.arena.x0 + this.arena.x1) / 2;
      w.text.pop(this.bossName, cx, this.arena.floor + (this.arena.top - this.arena.floor) * 0.62, 'title', { size: 1.0, life: 3.4, vy: 0.04 });
      w.text.pop(this.title, cx, this.arena.floor + (this.arena.top - this.arena.floor) * 0.62 - 1.0, 'magic', { size: 0.5, life: 3.4, vy: 0.04 });
      w.sfx('boss_growl', this.x, 0.9, 0.8); w.sfx('roar', this.x, 0.6, 0.7);
      w.game.addShake(0.35);
    }
    if (s === 'fight' && prev === 'intro') { this.cd = 0.6; this.cycleI = 0; }
    if (s === 'transition') {
      this.core.cancel();
      this.core.poise = this.core.poiseMax;
      w.emit('bossPhase', { id: this.bossId, phase: this.phase });
      w.sfx('roar', this.x, 0.9, 0.8 - this.phase * 0.05); w.sfx('boss_growl', this.x, 0.7, 0.7);
      w.game.addShake(0.4); w.game.flash('#ffffff', 0.35);
      w.fx.shockwave(this.x, this.y, 2.4, '#ffd0a0');
      callout(w, this.phase === this.phases ? 'ENRAGED' : 'PHASE ' + this.phase, this.x, this.y + this.r + 1.4, 'danger', 0.7);
      this.onPhase(w, this.phase);
      this.cycleI = 0; this.queued = null; this.cd = 0.4;
    }
    if (s === 'dying') {
      this.core.cancel();
      w.game.timeScale = 0.4;
      w.sfx('roar', this.x, 1, 0.55);
      w.game.flash('#ffffff', 0.6); w.game.freeze(0.25); w.game.addShake(0.5);
      this.team = 'neutral';
    }
  }

  // ---------------------------------------------------------------- damage
  hit(dmg: number, dirX: number, dirY: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    if (this.state === 'dormant') this.setState('intro', w);
    if (this.state !== 'fight') { if (this.state === 'intro' || this.state === 'transition') { w.fx.sparks(this.x - dirX * this.r, this.y, 8, Math.atan2(dirY, dirX) + Math.PI, 5); w.sfx('sw_clang', this.x, 0.5, 0.8); } return false; }
    const d = this.core.receive(w, dmg * this.vuln, dirX, dirY, kind);
    if (d < 0) return false;
    this.hp -= d;
    this.flash = 1;
    this.onHurt(w, d, dirX, dirY, kind);
    const k = this.hp / this.maxHp;
    if (this.hp <= 0) { this.hp = 0; this.setState('dying', w); return true; }
    if (this.phase - 1 < this.phaseAt.length && k <= this.phaseAt[this.phase - 1]) { this.phase++; this.setState('transition', w); }
    return true;
  }
  onParried(w: World) { this.core.parried(w); }
  protected onStagger(_w: World, _k: EnemyCore['staggerKind']) {}
  protected onHurt(_w: World, _d: number, _dx: number, _dy: number, _k?: DamageKind) {}
  protected onPhase(_w: World, _n: number) {}
  /** a move just started (sounds, danger zones) */
  protected started(_w: World, _m: MoveDef) {}

  private deathT = 0;
  protected dying(dt: number, w: World) {
    this.deathT += dt;
    w.game.timeScale = Math.min(1, 0.4 + this.st * 0.3);
    this.dyingPose(dt, w, clamp(this.st / 3, 0, 1));
    if (Math.random() < dt * 8) {
      const ox = (Math.random() - 0.5) * this.r * 2, oy = (Math.random() - 0.5) * this.r * 1.6;
      w.fx.gore(this.x + ox, this.y + oy, 0.8, { x: ox, y: oy + 1 });
      w.fx.sparks(this.x + ox, this.y + oy, 8, undefined, 5, '#fff0c0');
      w.sfx('hit_squish1', this.x, 0.5, 0.6 + Math.random() * 0.3);
    }
    if (this.st >= 3) {
      w.game.timeScale = 1;
      w.fx.explosion(this.x, this.y, 1.6);
      w.fx.gore(this.x, this.y, 3, { x: 0, y: 1 });
      w.game.flash('#ffffff', 0.7); w.game.addShake(0.6);
      w.sfx('boom_uw', this.x, 1, 0.6); w.sfx('jin_epic', this.x, 0.7);
      const cx = (this.arena.x0 + this.arena.x1) / 2;
      w.text.pop(this.bossName + ' FELLED', cx, this.arena.floor + (this.arena.top - this.arena.floor) * 0.6, 'gold', { size: 0.9, life: 3.5, vy: 0.05 });
      w.run.kills++;
      w.emit('kill', { kind: this.bossId, x: this.x, y: this.y, boss: true, elite: true });
      w.emit('bossDefeated', { id: this.bossId, name: this.bossName });
      this.state = 'dead'; this.st = 0;
      this.onDefeated?.();
    }
  }
  protected deadPose(dt: number, w: World) {
    // the carcass settles and fades out
    this.y = Math.max(this.arena.floor + this.r * 0.4, this.y - dt * 0.6);
    if (this.st > 4) { this.obj.scale.multiplyScalar(Math.max(0, 1 - dt * 2)); if (this.st > 5) this.alive = false; }
    void w;
  }

  // ---------------------------------------------------------------- hooks
  protected abstract tellPoint(): { x: number; y: number };
  protected abstract want(id: string, w: World): boolean;
  protected abstract approach(dt: number, w: World, next: string): void;
  protected abstract run(dt: number, w: World): void;
  protected abstract place(dt: number, w: World): void;
  protected idlePose(_dt: number, _w: World) {}
  protected introPose(_dt: number, _w: World, _k: number) {}
  protected transitionPose(_dt: number, _w: World, _k: number) {}
  protected staggerPose(_dt: number, _w: World) {}
  protected dyingPose(_dt: number, _w: World, _k: number) {}
  /** the player inside the arena box? */
  protected inArena(x: number, y: number, m = 0) { const a = this.arena; return x > a.x0 - m && x < a.x1 + m && y > a.floor - m && y < a.top + m; }
  /** strike the player if within (cx, cy, r) during the active phase (once per move) */
  protected hitCircle(w: World, cx: number, cy: number, r: number, o: { kind?: DamageKind; knock?: number; dmg?: number } = {}) {
    if (this.core.phase !== 'active' || this.core.landed) return null;
    const p = w.player;
    if (Math.hypot(p.x - cx, p.y - cy) > r + p.r) return null;
    return this.core.strike(w, { x: cx, y: cy, kind: o.kind, knock: o.knock, dmg: o.dmg });
  }
}
