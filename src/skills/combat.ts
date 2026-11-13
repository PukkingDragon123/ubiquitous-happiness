// Damage helpers shared by skills, summons and gadgets: crits, the caster's damage buff, poison-on-hit,
// set-bonus tricks, hit feedback (sparks, hitstop, numbers) and target picking.
import type { Entity, World, DamageKind } from '../game/types';
import type { SkillCaster } from './types';
import { FX } from './fx';
import { applyStatus } from './status';

export const foes = (w: World, x: number, y: number, r: number): Entity[] => w.near(x, y, r, 'enemy').filter((e) => e.alive && !!e.hit);

/** nearest enemy to a point, optionally inside a cone around (dx, dy) */
export function nearestFoe(w: World, x: number, y: number, r: number, cone?: { dx: number; dy: number; cos: number }): Entity | null {
  let best: Entity | null = null, bd = Infinity;
  for (const e of foes(w, x, y, r)) {
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
    if (cone && d > 0.3 && (dx * cone.dx + dy * cone.dy) / d < cone.cos) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export interface StrikeOpts { crit?: boolean; gore?: number; quiet?: boolean; poison?: boolean; stopTime?: number; text?: boolean }

/** deal damage from the caster (or one of its summons) to an enemy; returns true if it landed */
export function strike(w: World, p: SkillCaster | null, e: Entity, dmg: number, dx: number, dy: number, kind: DamageKind, o: StrikeOpts = {}): boolean {
  if (!e.alive || !e.hit) return false;
  let d = dmg * ((p as unknown as { dmgMul?: number })?.dmgMul ?? 1);
  let crit = false;
  if (p && o.crit !== false) {
    const c = p.stats.crit ?? 0;
    if (Math.random() < c) { crit = true; d *= (p.stats.sets?.rogue ?? 0) >= 6 ? 3 : 2; }
  }
  const l = Math.hypot(dx, dy) || 1;
  const ok = e.hit(d, dx / l, dy / l, w, p, kind);
  if (!ok) return false;
  if (!o.quiet) FX.sparks(w, e.x - (dx / l) * e.r * 0.6, e.y - (dy / l) * e.r * 0.6, crit ? 14 : 6, Math.atan2(dy, dx), crit ? 7 : 4, crit ? '#ffe070' : '#ffffff');
  if (o.gore) FX.gore(w, e.x, e.y, o.gore, { x: dx, y: dy });
  if (crit) { w.text.pop('CRIT!', e.x, e.y + e.r + 0.35, 'gold', { size: 0.3 }); w.game.freeze(0.05); }
  if (o.stopTime) w.game.freeze(o.stopTime);
  if (p && (o.poison !== false) && (p.stats.poison ?? 0) > 0) applyStatus(w, e, 'poison', 3, { dps: p.stats.poison, src: p });
  w.emit('hit', { target: e.kind, dmg: d, crit });
  return true;
}

/** damage everything in a radius (with falloff), pushing it outward */
export function blast(w: World, p: SkillCaster | null, x: number, y: number, r: number, dmg: number, kind: DamageKind, o: StrikeOpts & { falloff?: boolean } = {}): Entity[] {
  const hit: Entity[] = [];
  for (const e of foes(w, x, y, r)) {
    const d = Math.hypot(e.x - x, e.y - y);
    const k = o.falloff === false ? 1 : 1 - Math.max(0, d - e.r) / (r * 1.6);
    if (strike(w, p, e, dmg * k, e.x - x || 0.01, e.y - y, kind, o)) hit.push(e);
  }
  return hit;
}

/** cooldown / power multipliers for a skill given the caster's stats and set tiers */
export function skillMods(p: SkillCaster, tags: string[]): { cd: number; power: number; manaK: number } {
  const s = p.stats, sets = s.sets ?? {};
  let cd = 1 - Math.min(0.6, s.cdr ?? 0), power = 1, manaK = 1;
  if (tags.includes('mage')) { power *= s.spellPower ?? 1; if ((sets.mage ?? 0) >= 4) manaK *= 0.8; }
  if (tags.includes('summoner')) { power *= s.summonPower ?? 1; if ((sets.summoner ?? 0) >= 4) cd *= 0.85; if ((sets.summoner ?? 0) >= 6) cd *= 0.8; }
  if (tags.includes('tinkerer')) { power *= s.gadgetPower ?? 1; if ((sets.tinkerer ?? 0) >= 6) cd *= 0.65; }
  if (tags.includes('warrior') && (sets.warrior ?? 0) >= 4) power *= 1.2;
  if (tags.includes('rogue') && (sets.rogue ?? 0) >= 4) cd *= 0.85;
  return { cd, power, manaK };
}
