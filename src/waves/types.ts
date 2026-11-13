// Contracts the waves module needs from the rest of the game, kept loose so it runs against the real area
// (src/area: buildArea) or a mock: bounds, where boats sit on the surface, where divers swim in from, and the
// thing they want to destroy (the shipwreck: any Entity with hp and hit()).
import type { Entity, World, DamageKind } from '../game/types';

export interface WaveArea {
  id?: string;
  name?: string;
  def?: { name?: string };
  /** playable span; floor / surface heights when known */
  bounds: { x0: number; x1: number; floor?: number; surface?: number; top?: number };
  /** the objective the humans attack (Shipwreck), if any */
  shipwreck?: (Entity & { hp?: number; maxHp?: number }) | null;
  /** boat x positions on the surface; diver entry points (side = which edge they come from) */
  spawns: { surface: number[]; entries: { x: number; y: number; side?: number }[] };
  /** dig sand / shake plants at an explosion */
  impact?(x: number, y: number, r?: number, k?: number): void;
}

export interface WaveOpts {
  /** mastery level (0 = first run): more, stronger and smarter humans, new modifiers */
  mastery?: number;
  /** nemeses that may return (defaults to META.nemeses) */
  nemeses?: import('../meta/meta').Nemesis[];
  /** explicit objective (overrides area.shipwreck) */
  target?: Entity | null;
  /** seed for the wave composition */
  seed?: number;
  /** don't persist nemesis promotions (previews) */
  noSave?: boolean;
}

/** the AI's target: the wreck, the player, or anything else with hp + hit() */
export type Target = Entity;

export function damageTarget(t: Target, dmg: number, fromX: number, fromY: number, w: World, src: Entity | null, kind: DamageKind) {
  if (t === (w.player as Entity)) { w.hurtPlayer(dmg, fromX, fromY, kind); return true; }
  const dx = t.x - fromX, dy = t.y - fromY, l = Math.hypot(dx, dy) || 1;
  if (t.hit) return t.hit(dmg, dx / l, dy / l, w, src, kind);
  if (t.hp !== undefined) { t.hp = Math.max(0, t.hp - dmg); w.emit('wreckHit', { dmg, x: fromX, y: fromY }); return true; }
  return false;
}

/** the name of an area for memories ("the Sunlit Reef") */
export function areaName(a: WaveArea | null | undefined): string {
  const n = a?.name ?? a?.def?.name ?? a?.id ?? 'the deep';
  const pretty: Record<string, string> = { reef: 'Sunlit Reef', kelp: 'Kelp Cathedral', graveyard: 'Shipwreck Graveyard', arctic: 'Frost Shelf', abyss: 'The Abyss' };
  return pretty[n] ?? n;
}
