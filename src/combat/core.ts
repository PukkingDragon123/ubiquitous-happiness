// The enemy combat kit: every souls-like enemy (divers, sea life, bosses) owns an EnemyCore that runs its
// attacks as wind-up -> active -> recovery, fires the telegraph, tracks poise (stagger when broken), guards
// (crab shells), parry staggers and riposte openings, and turns the player's blows into damage.
//
//   core = new EnemyCore(this, { poise: 30 });
//   core.start(MOVE);                         // begin an attack (wind-up + tell)
//   core.update(dt, w, () => tellPoint)       // per frame; read core.phase / core.k / core.justEntered('active')
//   if (core.phase === 'active' && overlap) core.strike(w, { dmg, x, y })   // once per move
//   hit(): const d = core.receive(w, dmg, dx, dy, kind); if (d < 0) return false;   // blocked by a guard
import type { Entity, World, DamageKind } from '../game/types';
import type { AttackSpec, DefenseResult } from './types';
import { attackPlayer } from './resolve';
import { glint, stunStars } from './telegraph';
import { clang, callout, dmgNumber } from './feel';

/** one enemy attack */
export interface MoveDef {
  id: string;
  windup: number; active: number; recover: number;
  dmg: number;
  /** red glint: can't be blocked or parried (dodge it) */
  unblockable?: boolean;
  /** blockable but not parryable */
  noParry?: boolean;
  guardDmg?: number; knock?: number;
  /** tell: white glint (default), red glint, none (the owner draws its own: aim lines, rings) */
  tell?: 'glint' | 'red' | 'none';
  /** seconds before the end of the wind-up that the glint flashes (default 0.28) */
  tellAt?: number;
  /** hyper armour: poise can't break during wind-up / active */
  hyper?: boolean;
  kind?: DamageKind;
}

export type Phase = 'idle' | 'windup' | 'active' | 'recover' | 'stagger';

/** the player's blow currently being dealt (set by the moveset around strike()) */
export interface Blow { heavy: boolean; riposte: boolean; poise: number; guardBreak: boolean; weight: 'light' | 'heavy' | 'riposte' }
let BLOW: Blow | null = null;
export function withBlow<T>(b: Blow, f: () => T): T { const prev = BLOW; BLOW = b; try { return f(); } finally { BLOW = prev; } }
export const currentBlow = () => BLOW;

/** the core of an entity, if it has one */
export const coreOf = (e: Entity | null | undefined): EnemyCore | null => ((e as unknown as { core?: EnemyCore })?.core instanceof EnemyCore ? (e as unknown as { core: EnemyCore }).core : null);

export class EnemyCore {
  phase: Phase = 'idle';
  t = 0;
  move: MoveDef | null = null;
  poise: number; poiseMax: number;
  /** poise regenerates this fast (per s) after `poiseDelay` without being hit */
  poiseRegen: number;
  private poiseWait = 0;
  private staggerDur = 0;
  /** stagger flavour: 'parried' (riposte window), 'broken' (poise), 'guard' (guard broken), 'flinch' */
  staggerKind: 'parried' | 'broken' | 'guard' | 'flinch' = 'flinch';
  /** a shell / shield: 'front' blocks blows from the facing side, 'all' blocks everything but heavies */
  guard: 'none' | 'front' | 'all' = 'none';
  facing = 1;
  /** wind-up speed (elites / later phases are faster) */
  speed = 1;
  /** the player's hit landed during this move? */
  landed = false;
  private told = false;
  private entered: Phase | null = null;
  /** scales enemy damage (difficulty) */
  dmgMul = 1;
  /** callbacks */
  onStagger?: (w: World, kind: EnemyCore['staggerKind']) => void;
  onPhase?: (p: Phase, m: MoveDef | null) => void;
  /** where stun stars sit (head) */
  head: () => { x: number; y: number };
  /** last time a blow was blocked by the guard (for the player's recoil) */
  lastBlocked = -99;
  hitFlash = 0;

  constructor(public owner: Entity, o: { poise?: number; regen?: number; head?: () => { x: number; y: number } } = {}) {
    this.poise = this.poiseMax = o.poise ?? 20;
    this.poiseRegen = o.regen ?? this.poiseMax * 0.35;
    this.head = o.head ?? (() => ({ x: owner.x, y: owner.y + owner.r + 0.2 }));
  }

  get busy() { return this.phase !== 'idle'; }
  get staggered() { return this.phase === 'stagger'; }
  /** an attack is in progress (wind-up / active / recovery) */
  get attacking() { return this.phase === 'windup' || this.phase === 'active' || this.phase === 'recover'; }
  /** progress 0..1 through the current phase */
  get k() { return Math.min(1, this.t / Math.max(1e-3, this.dur())); }
  private dur() {
    const m = this.move;
    if (this.phase === 'stagger') return this.staggerDur;
    if (!m) return 1;
    return this.phase === 'windup' ? m.windup / this.speed : this.phase === 'active' ? m.active : this.phase === 'recover' ? m.recover / Math.max(1, this.speed * 0.8) : 1;
  }
  /** true on the frame a phase was entered */
  justEntered(p: Phase) { return this.entered === p; }
  is(id: string) { return this.move?.id === id && this.attacking; }

  start(m: MoveDef) {
    this.move = m; this.set('windup'); this.landed = false; this.told = false;
  }
  cancel() { this.move = null; this.set('idle'); }
  private set(p: Phase) { this.phase = p; this.t = 0; this.entered = p; this.onPhase?.(p, this.move); }

  update(dt: number, w: World, tellAt?: () => { x: number; y: number }) {
    this.entered = null;
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.poiseWait -= dt;
    if (this.poiseWait <= 0 && this.phase !== 'stagger') this.poise = Math.min(this.poiseMax, this.poise + this.poiseRegen * dt);
    const m = this.move;
    switch (this.phase) {
      case 'windup': {
        const left = m!.windup / this.speed - this.t;
        if (!this.told && left <= (m!.tellAt ?? 0.28) && m!.tell !== 'none') {
          this.told = true;
          const p = tellAt ? tellAt() : this.head();
          glint(w, p.x, p.y, { red: m!.unblockable || m!.tell === 'red', size: this.owner.isBoss ? 1.3 : 0.9 });
        }
        if (left <= 0) this.set('active');
        break;
      }
      case 'active': if (this.t >= m!.active) this.set('recover'); break;
      case 'recover': if (this.t >= this.dur()) { this.move = null; this.set('idle'); } break;
      case 'stagger': if (this.t >= this.staggerDur) { this.poise = this.poiseMax; this.move = null; this.set('idle'); } break;
    }
  }

  /** deal the current move's hit to the player (once per move); returns the defense result */
  strike(w: World, o: Partial<AttackSpec> & { x: number; y: number }): DefenseResult | null {
    const m = this.move;
    if (!m || this.phase !== 'active' || this.landed) return null;
    this.landed = true;
    return attackPlayer(w, {
      src: this.owner, dmg: Math.max(0.5, (o.dmg ?? m.dmg) * this.dmgMul), x: o.x, y: o.y, kind: o.kind ?? m.kind ?? 'bite',
      unblockable: o.unblockable ?? m.unblockable, parryable: o.parryable ?? !m.noParry, guardDmg: o.guardDmg ?? m.guardDmg, knock: o.knock ?? m.knock, name: m.id, projectile: o.projectile,
    });
  }

  /** stagger: the attack is interrupted; parried / broken staggers open a riposte */
  stagger(w: World, dur: number, kind: EnemyCore['staggerKind']) {
    this.move = null;
    this.staggerKind = kind;
    this.staggerDur = dur;
    this.set('stagger');
    if (kind !== 'flinch') stunStars(w, this.head, dur);
    this.onStagger?.(w, kind);
  }
  /** called by attackPlayer when the player perfectly parried this enemy */
  parried(w: World) {
    const h = this.head();
    callout(w, 'PARRIED', h.x, h.y + 0.3, 'gold', 0.4);
    this.poise = 0;
    this.stagger(w, this.owner.isBoss ? 1.3 : 1.6, 'parried');
  }
  /** blocked by the player: a short recoil (some bosses ignore it) */
  blocked(_w: World) { if (this.phase === 'active' && !this.move?.hyper) { /* the swing bounces off; finish quicker */ this.t = Math.max(this.t, (this.move?.active ?? 0) * 0.8); } }

  /** does the guard stop a blow coming along (dirX, dirY) (the push direction, i.e. away from the attacker)? */
  blocks(dirX: number): boolean {
    if (this.guard === 'none' || this.phase === 'stagger') return false;
    if (this.guard === 'all') return true;
    // front guard: blows pushing against our facing (attacker in front)
    return dirX * this.facing < 0.2;
  }

  /**
   * a blow arrives (from the owner's hit()): guard check, poise damage, stagger, damage number.
   * Returns the damage to apply, or -1 when the guard stopped it.
   */
  receive(w: World, dmg: number, dirX: number, dirY: number, kind?: DamageKind): number {
    const b = currentBlow();
    const o = this.owner;
    if (this.blocks(dirX) && kind !== 'explosion' && kind !== 'zap') {
      if (b && (b.guardBreak || b.riposte)) {
        // a heavy smashes the guard open
        this.guard = this.guard === 'all' ? 'all' : this.guard;
        callout(w, 'GUARD BREAK', o.x, o.y + o.r + 0.7, 'gold', 0.42);
        clang(w, o.x - dirX * o.r, o.y, Math.atan2(dirY, dirX), true);
        this.poise = 0;
        this.stagger(w, 1.5, 'guard');
        w.emit('guardBreak', { kind: o.kind });
        dmg *= 0.6;
      } else {
        this.lastBlocked = w.time;
        clang(w, o.x - dirX * o.r * 0.8, o.y, Math.atan2(dirY, dirX));
        this.poise -= (b?.poise ?? 6) * 0.25; this.poiseWait = 1;
        return -1;
      }
    }
    const pd = b ? b.poise : dmg * 8;
    const hyper = !!this.move?.hyper && (this.phase === 'windup' || this.phase === 'active');
    if (this.phase === 'stagger' && this.staggerKind !== 'flinch') dmg *= 1.25;
    this.poise -= pd; this.poiseWait = 1.2;
    this.hitFlash = 1;
    if (this.poise <= 0 && !hyper && this.phase !== 'stagger') {
      const h = this.head();
      callout(w, 'STAGGER', h.x, h.y + 0.3, 'hint', 0.36);
      this.stagger(w, o.isBoss ? 1.6 : 1.3, 'broken');
      w.sfx('thud_heavy', o.x, 0.6, 1.3);
    }
    dmgNumber(w, dmg, o.x, o.y + o.r + 0.25, !!b && (b.riposte || b.weight === 'heavy'));
    return dmg;
  }
}
