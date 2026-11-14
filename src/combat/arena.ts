// Room arenas: the box a fight happens in. The dungeon (agent J) sets one per room with setArena(world, arena)
// (or passes opts.arena to spawnEnemy); enemies clamp to it, pick positions inside it and never need the
// shipwreck / wave director. Without one, an arena is guessed around the player from the terrain.
import type { World } from '../game/types';
import type { Arena } from './types';
import { clamp } from '../core/math';

const ARENAS = new WeakMap<World, Arena>();

export function setArena(w: World, a: Arena | null) { if (a) ARENAS.set(w, { ...a }); else ARENAS.delete(w); }

/** the world's current arena (or a 24 x 12 m box guessed round the player) */
export function arenaOf(w: World, fallback?: Arena): Arena {
  const a = fallback ?? ARENAS.get(w);
  if (a) return a;
  const p = w.player;
  const floor = w.terrain.floorAt(p.x);
  const top = Math.min(floor + 12, w.water.heightAt(p.x) - 0.6);
  return { x0: p.x - 12, x1: p.x + 12, floor, top };
}

/** keep a point inside the arena (r = body radius) */
export function clampArena(a: Arena, x: number, y: number, r = 0.4): [number, number] {
  return [clamp(x, a.x0 + r, a.x1 - r), clamp(y, a.floor + r, a.top - r)];
}

export const arenaW = (a: Arena) => a.x1 - a.x0;
export const arenaH = (a: Arena) => a.top - a.floor;
export const arenaCX = (a: Arena) => (a.x0 + a.x1) / 2;

/** the floor height inside the arena at x (terrain if it's above the arena floor) */
export function floorIn(w: World, a: Arena, x: number) { return Math.max(a.floor, w.terrain.floorAt(x)); }
