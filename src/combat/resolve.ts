// Enemy attacks against the player. Every souls-like attack goes through attackPlayer(): the player's moveset
// gets the first say (dodge i-frames, perfect parry, late parry / block, guard break), then whatever lands is
// routed through world.hurtPlayer (god mode, the run's hooks). A perfect parry staggers the attacker
// (Parryable.onParried / its EnemyCore) or deflects the projectile, and emits 'parry' {perfect}.
import type { World, Entity, PlayerLike } from '../game/types';
import type { AttackSpec, DefenseResult, Parryable } from './types';
import type { Attacker } from '../waves/board';
import { creditHurt } from '../waves/board';

/** what the resolver needs from the player's moveset (src/combat/moveset.ts implements it) */
export interface Defender {
  defend(w: World, a: AttackSpec): DefenseResult;
  /** set while attackPlayer routes the landed hit through world.hurtPlayer (the moveset skips its checks) */
  resolving: boolean;
}

export function attackPlayer(w: World, a: AttackSpec): DefenseResult {
  const p = w.player as PlayerLike & { combat?: Defender };
  if (!p.alive) return 'immune';
  const c = p.combat;
  const res: DefenseResult = c ? c.defend(w, a) : p.invuln > 0 ? 'dodged' : 'hit';
  if (res === 'hit') {
    const before = p.hp ?? 0;
    if (c) c.resolving = true;
    try { w.hurtPlayer(a.dmg, a.x, a.y, a.kind); } finally { if (c) c.resolving = false; }
    const k = a.knock ?? 0;
    if (k > 0 && (p.hp ?? 0) < before) { const dx = p.x - a.x, dy = p.y - a.y, l = Math.hypot(dx, dy) || 1; p.push((dx / l) * k, (dy / l) * k * 0.6 + 1); }
    if ((p.hp ?? 0) < before && (a.src as Attacker | null)?.callsign) creditHurt(w, a.src as Attacker, a.name ?? 'hit');
  } else if (res === 'parried') {
    const src = a.src as (Entity & Parryable) | null;
    if (a.projectile?.deflect) { const dx = a.x - p.x, dy = a.y - p.y, l = Math.hypot(dx, dy) || 1; a.projectile.deflect(w, dx / l, dy / l); }
    else if (src?.onParried) src.onParried(w);
    else (src as unknown as { core?: { parried?(w: World): void } } | null)?.core?.parried?.(w);
    w.emit('parry', { perfect: true, by: src?.kind ?? null });
  } else if (res === 'blocked') {
    const src = a.src as (Entity & Parryable) | null;
    if (src?.onBlocked) src.onBlocked(w); else (src as unknown as { core?: { blocked?(w: World): void } } | null)?.core?.blocked?.(w);
  }
  return res;
}
