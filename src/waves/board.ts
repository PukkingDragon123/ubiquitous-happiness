// The humans' shared blackboard (one per world): who hurt the blobfish last (kill credit for nemeses), where
// the blobfish was last seen, squad alerts, flank slots, reinforcement flares and the net snare.
import type { World, Entity } from '../game/types';

export interface Attacker extends Entity {
  /** display name for kill credit (nemeses use their own) */
  callsign: string;
  nemesisId?: string;
}

export interface Board {
  time: number;
  lastHurt: { by: Attacker | null; t: number; how: string };
  /** where the blobfish was last seen by anyone, and when */
  seen: { x: number; y: number; t: number };
  /** per squad: alerted (provoked) until time */
  alert: Map<number, number>;
  /** flares fired: reinforcements requested at x (director consumes) */
  flares: { x: number; t: number; squad: number }[];
  /** the active net on the player (only one) */
  netOn: Entity | null;
  /** last time any human barked (keep the chatter readable) */
  lastBark: number;
}

const boards = new WeakMap<World, Board>();
export function board(w: World): Board {
  let b = boards.get(w);
  if (!b) {
    b = { time: 0, lastHurt: { by: null, t: -99, how: '' }, seen: { x: 0, y: 0, t: -99 }, alert: new Map(), flares: [], netOn: null, lastBark: -99 };
    boards.set(w, b);
  }
  return b;
}
/** note that `by` hurt the blobfish (call right after a successful hurtPlayer) */
export function creditHurt(w: World, by: Attacker | null, how: string) {
  const b = board(w);
  b.lastHurt = { by, t: b.time, how };
}
