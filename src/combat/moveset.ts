// The blobfish's souls-like moveset. Owned by the Blobfish (blob.combat); it reads input, runs moves as
// startup -> active -> recovery with buffering and cancel windows, animates the BlobModel (weapon angle +
// thrust, body lean / squash / spin / roll, expressions), sweeps the blade, and defends against enemy attacks.
//
//   LIGHT   J / left mouse            3-hit combo: toothpick lunge, rising lunge, spin slash
//   HEAVY   keep holding attack (or middle mouse / U) to charge, release: a guard-breaking thrust
//   PARRY   K / right mouse (tap)      0.15 s perfect window: deflect, stagger the attacker, riposte (x3 crit)
//           pressed a touch late it's a block
//   BLOCK   K / right mouse (hold)     drains stamina; at 0 the guard breaks
//   DODGE   Space                      a quick dart, ~0.26 s of i-frames (no direction: a backstep)
//   FLASK   R / H                      "kelp tea": a slow gulp, heals half your hearts, interrupted by hits
//   SKILLS  1-4                        unchanged (mana)
// Stamina regenerates after a short delay. hud() exposes everything the HUD needs.
import * as THREE from 'three';
import type { World, Entity, DamageKind } from '../game/types';
import type { Blobfish } from '../player/blobfish';
import type { AttackSpec, DefenseResult, PlayerCombatHud } from './types';
import type { Defender } from './resolve';
import { WEAPON_KIND } from '../player/gear';
import { clamp, damp, dampAngle, segDist, TAU } from '../core/math';
import { strike } from '../skills/combat';
import { manaBoltShot } from '../skills/projectiles';
import { withBlow, coreOf } from './core';
import { parryFlash, clang, impact, callout } from './feel';

type MoveId = 'light1' | 'light2' | 'light3' | 'heavy' | 'charge' | 'riposte' | 'dodge' | 'parry' | 'drink' | 'hitstun' | 'guardBroken' | 'whirl';
type Act = 'light' | 'heavy' | 'dodge' | 'parry' | 'drink';

interface MoveSpec { startup: number; active: number; recovery: number; stamina: number; dmg: number; poise: number; reach: number; lunge: number; cancel: number }
/** base timings (s) at sword rate 2.6; recovery scales with the weapon's rate */
const MOVES: Record<'light1' | 'light2' | 'light3' | 'heavy' | 'riposte', MoveSpec> = {
  light1: { startup: 0.1, active: 0.09, recovery: 0.24, stamina: 12, dmg: 1, poise: 12, reach: 1, lunge: 4.2, cancel: 0.24 },
  light2: { startup: 0.09, active: 0.09, recovery: 0.24, stamina: 12, dmg: 1, poise: 12, reach: 1, lunge: 4.6, cancel: 0.23 },
  light3: { startup: 0.13, active: 0.2, recovery: 0.34, stamina: 16, dmg: 1.6, poise: 26, reach: 1.25, lunge: 3, cancel: 0.42 },
  heavy: { startup: 0.07, active: 0.14, recovery: 0.46, stamina: 24, dmg: 2.4, poise: 55, reach: 1.35, lunge: 10, cancel: 0.5 },
  riposte: { startup: 0.12, active: 0.16, recovery: 0.3, stamina: 0, dmg: 3, poise: 99, reach: 1.3, lunge: 8, cancel: 0.4 },
};
export const PARRY_WINDOW = 0.15;
const LATE_WINDOW = 0.12;
const PARRY_RECOVER = 0.22;
const DODGE = { dur: 0.34, iframes: 0.26, stamina: 20, cancel: 0.2 };
const DRINK = { dur: 1.2, gulp: 0.72 };
const HOLD_TO_CHARGE = 0.22;
const CHARGE_FULL = 0.75;
const BUFFER = 0.2;

export class PlayerCombat implements Defender {
  stamina = 100; staminaMax = 100;
  /** seconds before stamina regenerates */
  staminaDelay = 0;
  flasks = 3; flasksMax = 3;
  /** heal per flask (fraction of max hp) */
  flaskHeal = 0.5;
  resolving = false;
  /** current move */
  move: MoveId | null = null;
  t = 0;
  private spec: MoveSpec | null = null;
  private combo = 0;
  private comboT = 0;
  private buffer: { act: Act; t: number } | null = null;
  // attack hold / heavy charge
  private holdT = -1;
  private fromHold = false;
  charge = 0;
  private chargeDing = false;
  // guard
  parryT = 0;
  private lateT = 0;
  blocking = false;
  private parryAt = -99;
  private parryDown = false;
  lastParry: 'perfect' | 'late' | null = null;
  private lastParryAt = -99;
  /** after a perfect parry: the next attack is a riposte */
  riposteT = 0;
  private riposteTarget: Entity | null = null;
  /** dodge i-frames left */
  iframes = 0;
  private dodgeDir = new THREE.Vector2();
  private gulped = false;
  // whirlwind (warrior skill)
  private whirlT = 0; private whirlMul = 1; private whirlTick = 0;
  // pose layer read by the controller (Blobfish.place)
  lean = 0; squash = 0; spin = 0; roll = 0; thrust = 0;
  bladeAng = 0.4;
  private hitSet = new Set<Entity>();
  private lastTip = new THREE.Vector3();
  private tipValid = false;
  private aimAng = 0;
  private f = 1;
  /** a log of parry timings (ms between the press and the hit) for the training dummy */
  parryLog: { dt: number; result: string; t: number }[] = [];
  /** enemy attacks seen (for the dummy log): name, result, parry age */
  onDefend?: (a: AttackSpec, res: DefenseResult, parryAge: number) => void;

  constructor(public p: Blobfish) {}

  // ------------------------------------------------------------------ queries
  get busy() { return this.move !== null; }
  get attacking() { return this.move === 'light1' || this.move === 'light2' || this.move === 'light3' || this.move === 'heavy' || this.move === 'riposte'; }
  get drinking() { return this.move === 'drink'; }
  /** swim speed multiplier for the controller */
  moveMul(): number {
    switch (this.move) {
      case 'light1': case 'light2': case 'light3': case 'riposte': return this.phase() === 'recovery' ? 0.55 : 0.25;
      case 'heavy': return this.phase() === 'recovery' ? 0.35 : 0.15;
      case 'charge': return 0.35;
      case 'parry': return 0.5;
      case 'drink': return 0.3;
      case 'hitstun': return 0.15;
      case 'guardBroken': return 0;
      case 'dodge': return 0.2;
      default: return this.blocking ? 0.45 : this.whirlT > 0 ? 0.7 : 1;
    }
  }
  /** facing locked to the aim during moves */
  get faceAim() { return this.move !== null && this.move !== 'dodge' && this.move !== 'hitstun' || this.blocking; }
  phase(): 'startup' | 'active' | 'recovery' | null {
    const s = this.spec;
    if (!s) return null;
    if (this.t < s.startup) return 'startup';
    if (this.t < s.startup + s.active) return 'active';
    return 'recovery';
  }
  hud(): PlayerCombatHud {
    return {
      stamina: this.stamina, staminaMax: this.staminaMax, staminaDelay: Math.max(0, this.staminaDelay),
      flasks: this.flasks, flasksMax: this.flasksMax, drinking: this.move === 'drink' ? clamp(this.t / DRINK.dur, 0, 1) : 0,
      guard: this.move === 'guardBroken' ? 'guardBroken' : this.riposteT > 0 ? 'riposte' : this.parryT > 0 ? 'parry' : this.blocking || this.lateT > 0 ? 'block' : 'idle',
      parryWindow: Math.max(0, this.parryT), lastParry: this.lastParry, lastParryAge: this.p.alive ? performance.now() / 1000 - this.lastParryAt : 99,
      charge: this.move === 'charge' ? this.charge : 0, move: this.move, iframes: this.iframes > 0,
    };
  }
  /** refill flasks (new floor) */
  refill() { this.flasks = this.flasksMax; }
  /** start a whirlwind (warrior skill) */
  whirl(dur: number, mul: number) { this.whirlT = dur; this.whirlMul = mul; this.hitSet.clear(); this.p.setExpr('attack', dur); }

  // ------------------------------------------------------------------ per frame (before the controller moves)
  update(dt: number, w: World) {
    const p = this.p, inp = w.game.input;
    // aim
    this.aimAng = Math.atan2(p.aim.y, p.aim.x);
    this.f = p.aim.x >= 0 ? 1 : -1;
    // timers
    this.t += dt;
    this.comboT -= dt;
    this.parryT -= dt; this.lateT -= dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.riposteT -= dt; if (this.riposteT <= 0) this.riposteTarget = null;
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && this.move !== 'guardBroken') this.stamina = Math.min(this.staminaMax, this.stamina + (this.blocking ? 18 : 52) * dt);
    if (this.blocking) this.drain(4 * dt, 0.3);
    if (this.buffer && w.time - this.buffer.t > BUFFER) this.buffer = null;
    const free = !p.hooked && !p.outOfWater && p.rock < 0.5 && !p.riding;
    // ---- input -> buffer
    if (free) {
      if (inp.hit('attack')) { this.buffer = { act: 'light', t: w.time }; this.holdT = 0; }
      if (inp.keyHit('Mouse1') || inp.keyHit('KeyU')) { this.buffer = { act: 'heavy', t: w.time }; this.holdT = HOLD_TO_CHARGE; }
      if (inp.hit('dash')) this.buffer = { act: 'dodge', t: w.time };
      if (inp.hit('ability')) { this.buffer = { act: 'parry', t: w.time }; this.parryDown = true; }
      if (inp.keyHit('KeyR') || inp.keyHit('KeyH')) this.buffer = { act: 'drink', t: w.time };
    }
    const attackHeld = inp.held('attack') || inp.key('Mouse1') || inp.key('KeyU');
    if (this.holdT >= 0) { if (attackHeld) this.holdT += dt; else this.holdT = -1; }
    if (!inp.held('ability')) this.parryDown = false;
    // ---- move timeline
    this.step(dt, w, attackHeld);
    // ---- start buffered actions when allowed
    if (this.buffer && free && p.alive) this.tryStart(w);
    // ---- block: holding guard after the parry window
    this.blocking = free && this.parryDown && this.move === null && this.stamina > 0;
    if (this.whirlT > 0) this.whirlT -= dt;
  }

  private canCancel(act: Act): boolean {
    const m = this.move;
    if (!m) return true;
    if (m === 'hitstun' || m === 'guardBroken') return false;
    if (m === 'drink') return false;
    if (m === 'dodge') return this.t >= (act === 'dodge' ? DODGE.dur - 0.06 : DODGE.cancel);
    if (m === 'parry') return act === 'dodge' || this.t > PARRY_WINDOW + 0.05;
    if (m === 'charge') return act === 'dodge';
    const s = this.spec!;
    // dodge cancels recovery; chaining attacks waits for the cancel point
    if (act === 'dodge' || act === 'parry') return this.t >= s.startup + s.active;
    return this.t >= s.cancel;
  }

  private tryStart(w: World) {
    const b = this.buffer!;
    if (!this.canCancel(b.act)) return;
    const p = this.p;
    switch (b.act) {
      case 'light': case 'heavy': {
        if (this.stamina <= 0 && this.riposteT <= 0) { this.noStamina(w); this.buffer = null; return; }
        if (this.riposteT > 0) { this.startAttack(w, 'riposte'); break; }
        if (b.act === 'heavy') { this.begin('charge'); this.charge = 0; this.chargeDing = false; break; }
        const next = this.comboT > 0 && (this.move === 'light1' || this.move === 'light2' || this.combo > 0) ? this.combo % 3 + 1 : 1;
        this.startAttack(w, ('light' + next) as 'light1');
        this.fromHold = this.holdT >= 0;
        break;
      }
      case 'dodge': this.startDodge(w); break;
      case 'parry': this.startParry(w); break;
      case 'drink': {
        if (this.flasks <= 0) { callout(w, 'NO TEA', p.x, p.y + 0.9, 'hint', 0.3); w.sfx('k_err1', p.x, 0.4); break; }
        this.begin('drink'); this.gulped = false;
        w.sfx('cloth', p.x, 0.5, 1.2); w.sfx('bubble', p.x, 0.4, 0.8);
        p.setExpr('focus', DRINK.dur);
        break;
      }
    }
    this.buffer = null;
  }

  private begin(m: MoveId, spec: MoveSpec | null = null) {
    this.move = m; this.t = 0; this.spec = spec; this.hitSet.clear(); this.tipValid = false;
  }
  private end() { this.move = null; this.spec = null; }

  private drain(n: number, delay = 0.6) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = Math.max(this.staminaDelay, delay);
  }
  private noStamina(w: World) { callout(w, 'WINDED', this.p.x, this.p.y + 0.9, 'hint', 0.3); w.sfx('k_err2', this.p.x, 0.35); }

  private weaponKind() { return WEAPON_KIND[this.p.model.weaponId] ?? 'blade'; }
  private specFor(id: keyof typeof MOVES): MoveSpec {
    const base = MOVES[id], wk = this.weaponKind(), p = this.p;
    const rate = clamp((p.stats.swordRate ?? 2.6) / 2.6, 0.6, 1.6);
    const slow = wk === 'blunt' ? 1.25 : wk === 'polearm' ? 1.08 : 1;
    return {
      ...base,
      startup: base.startup * slow / Math.sqrt(rate), recovery: base.recovery * slow / rate, cancel: base.cancel * slow / rate,
      poise: base.poise * (wk === 'blunt' ? 1.6 : 1), dmg: base.dmg * (wk === 'blunt' ? 1.25 : 1), reach: base.reach * (wk === 'polearm' ? 1.3 : 1),
    };
  }

  private startAttack(w: World, id: 'light1' | 'light2' | 'light3' | 'heavy' | 'riposte', charge = 0) {
    const p = this.p;
    const s = this.specFor(id);
    if (id === 'heavy') { s.dmg *= 1 + charge * 0.55; s.poise *= 1 + charge * 0.6; s.lunge *= 0.75 + charge * 0.5; s.stamina += charge * 10; }
    this.begin(id, s);
    this.drain(s.stamina, 0.65);
    if (id.startsWith('light')) { this.combo = +id.slice(5); this.comboT = s.startup + s.active + s.recovery + 0.35; }
    else this.combo = 0;
    if (id === 'riposte') {
      this.riposteT = 0;
      const tgt = this.riposteTarget && this.riposteTarget.alive ? this.riposteTarget : null;
      if (tgt && Math.hypot(tgt.x - p.x, tgt.y - p.y) < 4) { p.aim.set(tgt.x - p.x, tgt.y - p.y).normalize(); this.aimAng = Math.atan2(p.aim.y, p.aim.x); this.f = p.aim.x >= 0 ? 1 : -1; }
      p.invuln = Math.max(p.invuln, s.startup + s.active + 0.1);
      w.game.timeScale = 0.6;
      w.sfx('magic_whoosh1', p.x, 0.6, 0.8);
      p.setExpr('angry', 0.8);
    } else p.setExpr('attack', s.startup + s.active + s.recovery);
    const wk = this.weaponKind();
    if (wk === 'caster') {
      // wands / staves: a bolt (3 for the spin, a fat charged volley for the heavy)
      const tip = p.tip(new THREE.Vector3());
      const n = id === 'light3' ? 3 : id === 'heavy' ? 5 : id === 'riposte' ? 3 : 1;
      const dmg = p.stats.swordDmg * (0.75 + 0.25 * (p.stats.spellPower ?? 1)) * s.dmg / Math.sqrt(n);
      for (let k = 0; k < n; k++) manaBoltShot(w, p, tip.x, tip.y, this.aimAng + (k - (n - 1) / 2) * (id === 'heavy' ? 0.14 : 0.25), dmg * (id === 'riposte' ? 3 : 1));
      w.sfx('magic_whoosh1', p.x, 0.4, 1.3 + this.combo * 0.1);
      p.lunge(-p.aim.x, -p.aim.y, 0.8);
    }
  }

  private startDodge(w: World) {
    const p = this.p, inp = w.game.input;
    if (this.stamina <= 0) { this.noStamina(w); return; }
    const ax = inp.axis();
    const back = Math.hypot(ax.x, ax.y) < 0.1;
    if (back) this.dodgeDir.set(-p.aim.x, -p.aim.y * 0.5).normalize(); else this.dodgeDir.set(ax.x, ax.y).normalize();
    this.begin('dodge');
    this.drain(DODGE.stamina, 0.55);
    this.iframes = back ? DODGE.iframes * 0.8 : DODGE.iframes;
    // a dart: an instant velocity kick (the soft body squashes into it)
    const pw = (p.stats.dashPower ?? 9) * (back ? 0.6 : 0.78) * (1 - p.pressure * 0.45);
    p.sb.accel(this.dodgeDir.x * pw, this.dodgeDir.y * pw, 1);
    p.sb.stretch = 0.4; p.sb.stretchDir = Math.atan2(this.dodgeDir.y, this.dodgeDir.x);
    w.fx.emit('bubble', p.x - this.dodgeDir.x * 0.4, p.y - this.dodgeDir.y * 0.4, { n: 12, spread: 0.25, speed: 1.4 });
    w.fx.wake(p.x, p.y, { x: this.dodgeDir.x, y: this.dodgeDir.y }, 2);
    w.sfx('swish_a', p.x, 0.55, 1.35);
    w.emit('dash', {});
    p.dodged(w);
  }

  private startParry(w: World) {
    const p = this.p;
    // mashing: a parry pressed right after another gets a shorter window
    const mash = w.time - this.parryAt < 0.45;
    this.begin('parry');
    this.parryT = mash ? PARRY_WINDOW * 0.5 : PARRY_WINDOW;
    this.lateT = this.parryT + LATE_WINDOW;
    this.parryAt = w.time;
    this.drain(5, 0.4);
    w.sfx('sw_swish', p.x, 0.35, 1.6);
    p.setExpr('focus', 0.4);
  }

  /** advance the current move; transitions + lunges + heavy charge */
  private step(dt: number, w: World, attackHeld: boolean) {
    const p = this.p, m = this.move, s = this.spec;
    if (!m) return;
    switch (m) {
      case 'light1': case 'light2': case 'light3': case 'heavy': case 'riposte': {
        const prevT = this.t - dt;
        // the lunge fires as the blade comes out
        if (prevT < s!.startup && this.t >= s!.startup) {
          const pw = s!.lunge;
          p.sb.accel(p.aim.x * pw * 0.3, p.aim.y * pw * 0.3, 1);
          p.sb.stretch = m === 'heavy' || m === 'riposte' ? 0.4 : 0.25; p.sb.stretchDir = this.aimAng;
          const wk = this.weaponKind();
          w.sfx('sw_swish', p.x, m === 'heavy' || m === 'riposte' ? 0.8 : 0.55, (m === 'light3' ? 0.85 : m === 'heavy' ? 0.7 : 1.1 + this.combo * 0.08) * (wk === 'blunt' ? 0.75 : 1));
          if (m === 'heavy' || m === 'riposte') w.fx.emit('bubble', p.x - p.aim.x * 0.4, p.y - p.aim.y * 0.4, { n: 10, spread: 0.2, speed: 1.6 });
        }
        if (m === 'riposte' && this.t >= s!.startup + s!.active) w.game.timeScale = damp(w.game.timeScale, 1, 10, dt);
        // hold through a light: roll into a heavy charge (Zelda-style)
        if (m.startsWith('light') && this.fromHold && attackHeld && this.holdT >= HOLD_TO_CHARGE && this.t >= s!.startup + s!.active && this.weaponKind() !== 'caster') {
          this.begin('charge'); this.charge = 0; this.chargeDing = false; this.combo = 0;
          break;
        }
        if (this.t >= s!.startup + s!.active + s!.recovery) { if (m === 'riposte') w.game.timeScale = 1; this.end(); }
        break;
      }
      case 'charge': {
        this.charge = clamp(this.t / CHARGE_FULL, 0, 1);
        if (this.charge >= 1 && !this.chargeDing) { this.chargeDing = true; w.sfx('k_glass', p.x, 0.6, 1.8); const tp = p.tip(new THREE.Vector3()); w.fx.emit('glint', tp.x, tp.y, { n: 1, size: 0.5, life: 0.4 }); w.fx.emit('ring', tp.x, tp.y, { size: 0.2, size1: 0.9, life: 0.25, color: '#fff0a0', add: true }); }
        if (Math.random() < dt * (6 + this.charge * 20)) { const tp = p.tip(new THREE.Vector3()); w.fx.emit('sparkle', tp.x, tp.y, { n: 1, spread: 0.1, color: this.charge >= 1 ? '#fff0a0' : '#d8f0ff', life: 0.3 }); }
        this.drain(dt * 6, 0.5);
        if (!attackHeld || this.t > 2.5) { this.startAttack(w, 'heavy', this.charge); this.holdT = -1; }
        break;
      }
      case 'dodge':
        if (Math.random() < dt * 30) w.fx.emit('bubbleS', p.x, p.y, { n: 1, spread: 0.2 });
        if (this.t >= DODGE.dur) this.end();
        break;
      case 'parry':
        // held: becomes a block once the windows close; released: a short recovery
        if (this.lateT <= 0 && this.parryDown) { this.end(); break; }
        if (this.t >= PARRY_WINDOW + PARRY_RECOVER && !this.parryDown) this.end();
        break;
      case 'drink':
        if (!this.gulped && this.t >= DRINK.gulp) {
          this.gulped = true;
          this.flasks--;
          p.heal(Math.max(1, Math.ceil(p.maxHp * this.flaskHeal)), w);
          w.fx.emit('heartP', p.x, p.y + 0.5, { n: 3, spread: 0.3, vy: 1 });
          w.fx.emit('bubble', p.x, p.y + 0.3, { n: 10, spread: 0.2, speed: 0.8, color: '#9ae07a' });
          w.sfx('gulp', p.x, 0.8); w.sfx('shimmer', p.x, 0.5, 1.2);
          p.setExpr('happy', 0.8);
          w.emit('flask', { left: this.flasks });
        }
        if (this.t >= DRINK.dur) this.end();
        break;
      case 'hitstun': if (this.t >= 0.3) this.end(); break;
      case 'guardBroken': if (this.t >= 1.0) this.end(); break;
      case 'whirl': this.end(); break;
    }
  }

  // ------------------------------------------------------------------ defense
  defend(w: World, a: AttackSpec): DefenseResult {
    const p = this.p;
    const parryAge = w.time - this.parryAt;
    let res: DefenseResult;
    if (!p.alive) res = 'immune';
    else if (this.iframes > 0) {
      res = 'dodged';
      if (DODGE.iframes - this.iframes < 0.12) { callout(w, 'DODGE!', p.x, p.y + 0.8, 'hint', 0.3); w.emit('dodge', { perfect: true }); }
    } else if (p.invuln > 0) res = 'immune';
    else {
      // facing check against the attacker's body (a claw tip can overshoot past us), projectiles by their path
      const ox = a.projectile ? a.x : a.src ? a.src.x : a.x;
      const front = (ox - p.x) * (this.faceAim ? this.f : p.facing) > -0.35;
      if (!a.unblockable && a.parryable !== false && this.parryT > 0 && front) res = 'parried';
      else if (!a.unblockable && front && (this.blocking || this.lateT > 0)) {
        this.drain(a.guardDmg ?? 18 + a.dmg * 10, 0.8);
        res = this.stamina <= 0 ? 'guardBreak' : 'blocked';
      } else res = 'hit';
    }
    this.react(w, a, res, parryAge);
    this.onDefend?.(a, res, parryAge);
    return res;
  }

  private react(w: World, a: AttackSpec, res: DefenseResult, parryAge: number) {
    const p = this.p;
    const ang = Math.atan2(a.y - p.y, a.x - p.x);
    const cx = p.x + Math.cos(ang) * 0.45, cy = p.y + Math.sin(ang) * 0.45;
    if (res === 'parried') {
      parryFlash(w, cx, cy, ang);
      callout(w, 'PARRY!', p.x, p.y + 1, 'gold', 0.5);
      this.lastParry = 'perfect'; this.lastParryAt = performance.now() / 1000;
      this.parryT = 0; this.lateT = 0;
      this.riposteT = 1.6;
      this.riposteTarget = a.src;
      this.stamina = Math.min(this.staminaMax, this.stamina + 15);
      p.setExpr('cool', 0.8);
      // the blade flicks out to meet the blow
      this.bladeAng = ang + 0.4 * this.f;
      this.logParry(parryAge, 'perfect');
    } else if (res === 'blocked') {
      clang(w, cx, cy, ang);
      p.push(-Math.cos(ang) * 3, -Math.sin(ang) * 2);
      if (this.move === 'parry' && this.lateT > 0 && this.parryT <= 0) {
        this.lastParry = 'late'; this.lastParryAt = performance.now() / 1000;
        callout(w, 'LATE', p.x, p.y + 0.9, 'hint', 0.3);
        w.emit('parry', { perfect: false });
        this.logParry(parryAge, 'late');
      }
      p.setExpr('strain', 0.4);
    } else if (res === 'guardBreak') {
      clang(w, cx, cy, ang, true);
      callout(w, 'GUARD BREAK', p.x, p.y + 1, 'danger', 0.5);
      w.sfx('thud_heavy', p.x, 0.8, 0.8); w.sfx('squeak', p.x, 0.5, 0.7);
      p.push(-Math.cos(ang) * 7, -Math.sin(ang) * 3 + 1);
      this.begin('guardBroken');
      this.staminaDelay = 1.2;
      this.blocking = false; this.parryDown = false;
      p.setExpr('dizzy', 1);
      w.emit('guardBreak', { player: true });
    } else if (res === 'hit' && this.move === 'parry') this.logParry(parryAge, this.parryAt > 0 ? 'missed' : 'none');
  }

  private logParry(age: number, result: string) {
    const rec = { dt: Math.round(age * 1000), result, t: Math.round(performance.now()) };
    this.parryLog.push(rec);
    if (this.parryLog.length > 40) this.parryLog.shift();
    console.log(`[parry] ${result} ${rec.dt}ms after the press (window ${Math.round(PARRY_WINDOW * 1000)}ms)`);
  }

  /** a blow landed on the player (from Blobfish.damage): interrupt whatever was going on */
  onHurt(w: World) {
    if (this.move === 'drink' && !this.gulped) { callout(w, 'SPILLED!', this.p.x, this.p.y + 1, 'danger', 0.34); w.sfx('splash_s', this.p.x, 0.4); }
    if (this.move === 'riposte') w.game.timeScale = 1;
    if (this.move !== 'guardBroken') this.begin('hitstun');
    this.charge = 0; this.holdT = -1; this.buffer = null; this.combo = 0;
  }

  /**
   * a legacy hit (world.hurtPlayer from code that doesn't use attackPlayer): parry / block still work, there's
   * just no attacker to stagger. Returns true when the hit is stopped.
   */
  legacyDefend(w: World, dmg: number, fromX: number, fromY: number, kind?: DamageKind): boolean {
    if (this.resolving) return false;
    if (kind === 'explosion' || kind === 'crush') return this.iframes > 0;
    const res = this.defend(w, { src: null, dmg, x: fromX, y: fromY, kind });
    return res !== 'hit';
  }

  // ------------------------------------------------------------------ the blade (after the controller moved)
  /** animate the weapon + body pose and sweep the blade for hits; hand = weapon hand (world) */
  updateBlade(dt: number, w: World, hand: THREE.Vector3) {
    const p = this.p, s = this.spec, m = this.move, f = this.f, a = this.aimAng;
    const stats = p.stats;
    const wk = this.weaponKind();
    let ang = this.bladeAng, thrust = 0, lean = 0, squash = 0, spin = 0, roll = 0, sweep = false, reach = stats.swordReach;
    const ease = (k: number) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
    if (this.whirlT > 0) {
      ang = this.bladeAng + dt * 22 * f; sweep = true; reach *= 1.3;
      this.whirlTick -= dt;
      if (this.whirlTick <= 0) { this.whirlTick = 0.16; this.hitSet.clear(); w.sfx('sw_swish', p.x, 0.3, 1.3); }
    } else if (s && (m === 'light1' || m === 'light2' || m === 'light3' || m === 'heavy' || m === 'riposte')) {
      const su = s.startup, ac = s.active, t = this.t;
      reach *= s.reach;
      if (m === 'light3') {
        // spin slash: coil, then the blade (and the body) whip a full turn
        if (t < su) { const k = t / su; ang = a - 0.9 * f * ease(k); squash = 0.14 * k; lean = -0.25 * k; }
        else if (t < su + ac) { const k = (t - su) / ac; ang = a - 0.9 * f + (TAU + 0.9) * f * ease(k); spin = TAU * ease(k); sweep = wk !== 'caster'; squash = -0.08; }
        else { const k = (t - su - ac) / s.recovery; ang = a + TAU * f * (1 - k * 0) ; lean = 0.15 * (1 - k); }
      } else if (m === 'riposte') {
        // leap-roll, blade raised overhead, then a crushing stab along the aim
        if (t < su) { const k = t / su; ang = a + (1.8 * f) * ease(k); roll = -TAU * 0.5 * ease(k) * f; squash = 0.1 * (1 - k); thrust = -0.15 * k; }
        else if (t < su + ac) { const k = (t - su) / ac; ang = a + 1.8 * f * (1 - ease(k)); roll = -TAU * (0.5 + 0.5 * ease(k)) * f; thrust = 0.7 * ease(k); sweep = true; }
        else { const k = (t - su - ac) / s.recovery; ang = a; thrust = 0.7 * (1 - ease(k)); lean = 0.2 * (1 - k); }
      } else {
        // thrusts: draw back, then the toothpick shoots out along the aim
        const off = m === 'light2' ? -0.35 : m === 'heavy' ? 0 : 0.35;
        const back = m === 'heavy' ? -0.32 : -0.16, out = m === 'heavy' ? 0.85 : 0.45;
        if (t < su) { const k = t / su; ang = a + off * f * ease(k); thrust = back * ease(k); lean = -0.15 * k; squash = m === 'heavy' ? 0.1 : 0.05; }
        else if (t < su + ac) { const k = (t - su) / ac; ang = a + off * f * (1 - ease(k)) * 0.5; thrust = back + (out - back) * ease(k * 1.4); lean = 0.3 * f * 0; sweep = wk !== 'caster'; squash = -0.06; }
        else { const k = (t - su - ac) / s.recovery; ang = a; thrust = out * (1 - ease(k)); }
        lean += (t >= su && t < su + ac + s.recovery * 0.4 ? 0.2 : 0);
      }
    } else if (m === 'charge') {
      const k = this.charge;
      ang = a + (Math.PI * 0.85) * f * ease(Math.min(1, this.t / 0.15)) + Math.sin(w.time * 50) * 0.03 * k;
      thrust = -0.2 * k; squash = 0.06 + 0.12 * k; lean = -0.3 * k;
    } else if (m === 'parry' || this.blocking) {
      // blade up across the body toward the aim
      const k = m === 'parry' ? ease(this.t / 0.06) : 1;
      ang = a + 1.15 * f * k + (m === 'parry' && this.t < 0.1 ? Math.sin(this.t * 60) * 0.08 : 0);
      lean = -0.18 * k; squash = 0.04;
    } else if (m === 'dodge') {
      const k = this.t / DODGE.dur;
      ang = a + 1.4 * f; roll = -TAU * ease(k) * Math.sign(this.dodgeDir.x || f); squash = -0.1 * Math.sin(k * Math.PI);
    } else if (m === 'drink') {
      const k = clamp(this.t / 0.3, 0, 1), k2 = clamp((DRINK.dur - this.t) / 0.25, 0, 1);
      ang = (f > 0 ? -1.1 : Math.PI + 1.1); lean = -0.45 * Math.min(k, k2); squash = this.t > DRINK.gulp - 0.15 && this.t < DRINK.gulp + 0.1 ? 0.12 : 0;
      if (Math.random() < dt * 12) w.fx.emit('bubbleS', p.x + f * 0.25, p.y + 0.2, { n: 1, spread: 0.05, color: '#a8e890' });
    } else if (m === 'hitstun' || m === 'guardBroken') {
      ang = dampAngle(this.bladeAng, a - 1.2 * f, 8, dt);
      lean = m === 'guardBroken' ? -0.4 + Math.sin(this.t * 30) * 0.05 : -0.2;
    } else {
      // idle: held up and forward, bobbing, pointing roughly where you aim
      const idle = Math.atan2(p.aim.y * 0.6 + 0.35, p.aim.x * 0.6 + p.facing * 0.5);
      ang = dampAngle(this.bladeAng, idle + Math.sin(w.time * 2.2) * 0.08, 10, dt);
    }
    this.bladeAng = ang;
    this.thrust = damp(this.thrust, thrust, 30, dt);
    this.lean = damp(this.lean, lean, 18, dt);
    this.squash = damp(this.squash, squash, 20, dt);
    this.spin = spin; this.roll = roll;
    p.model.weaponAng = ang;
    // blade sweep (hits)
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const base = new THREE.Vector3(hand.x + dx * (0.12 + this.thrust), hand.y + dy * (0.12 + this.thrust), 0.6);
    const tip = new THREE.Vector3(hand.x + dx * (reach + this.thrust), hand.y + dy * (reach + this.thrust), 0.6);
    if (sweep) {
      if (!this.tipValid) { this.lastTip.copy(base); this.tipValid = true; }
      p.trailPush(base, tip, m === 'riposte' || (m === 'heavy' && this.charge > 0.9));
      this.sweep(w, hand.x, hand.y, base, tip);
    } else this.tipValid = false;
    this.lastTip.copy(tip);
  }

  private sweep(w: World, hx: number, hy: number, base: THREE.Vector3, tip: THREE.Vector3) {
    const p = this.p, s = this.spec, m = this.move;
    const st = p.stats;
    for (const e of w.entities) {
      if (!e.alive || e === (p as unknown as Entity)) continue;
      if (e.slash) {
        if (e.slash(base.x, base.y, tip.x, tip.y, st.lineCut, w) || e.slash(this.lastTip.x, this.lastTip.y, tip.x, tip.y, st.lineCut, w)) w.fx.sparks(tip.x, tip.y, 6, undefined, 4);
        continue;
      }
      if (e.team === 'player' || e.team === 'friend' || e.team === 'neutral' || this.hitSet.has(e) || !e.hit) continue;
      const d = Math.min(segDist(e.x, e.y, base.x, base.y, tip.x, tip.y).d, segDist(e.x, e.y, this.lastTip.x, this.lastTip.y, tip.x, tip.y).d, segDist(e.x, e.y, hx, hy, base.x, base.y).d);
      if (d > e.r + 0.08) continue;
      this.hitSet.add(e);
      this.land(w, e, tip, m, s);
    }
  }

  private land(w: World, e: Entity, tip: THREE.Vector3, m: MoveId | null, s: MoveSpec | null) {
    const p = this.p, st = p.stats;
    const heavy = m === 'heavy', rip = m === 'riposte', whirl = this.whirlT > 0;
    const mul = whirl ? this.whirlMul : s?.dmg ?? 1;
    let dmg = st.swordDmg * mul * (rip ? 3 : 1);
    const core = coreOf(e);
    const kind = e.kind;
    const dirX = e.x - p.x === 0 ? Math.cos(this.bladeAng) : Math.sign(e.x - p.x);
    const ang = Math.atan2(e.y - p.y, e.x - p.x);
    const hx = e.x - (e.x - tip.x) * 0.5, hy = e.y - (e.y - tip.y) * 0.5;
    const ok = withBlow({ heavy, riposte: rip, poise: (s?.poise ?? 12) * (whirl ? 0.5 : 1), guardBreak: heavy || rip, weight: rip ? 'riposte' : heavy ? 'heavy' : 'light' }, () =>
      strike(w, p, e, dmg, dirX, 0.3, 'sword', { quiet: true, crit: rip ? false : undefined }));
    if (!ok) {
      // a guard / shell stopped it: the blade bounces off
      if (core && w.time - core.lastBlocked < 0.05) { p.push(-dirX * 4, 0.5); if (this.move && this.move !== 'heavy') { this.t = Math.max(this.t, (s?.startup ?? 0) + (s?.active ?? 0)); } p.setExpr('strain', 0.4); }
      return;
    }
    impact(w, hx, hy, ang, rip ? 'riposte' : heavy ? 'heavy' : 'light', { armour: (e as unknown as { armoured?: boolean }).armoured });
    if (rip) { callout(w, 'RIPOSTE!', e.x, e.y + e.r + 0.9, 'gold', 0.55); w.emit('riposte', { kind }); w.game.timeScale = 1; }
    if (heavy) { e.vx += Math.cos(ang) * 5; e.vy += Math.sin(ang) * 3; }
    // warrior 6-set: the spinning flourish releases a shockwave
    if (m === 'light3' && (st.sets?.warrior ?? 0) >= 6) { w.fx.shockwave(p.x, p.y, 1.2, '#ffe8a0'); for (const o of w.near(p.x, p.y, 2.4, 'enemy')) if (o !== e) strike(w, p, o, st.swordDmg, o.x - p.x, o.y - p.y, 'crush'); }
    void core;
  }
}
