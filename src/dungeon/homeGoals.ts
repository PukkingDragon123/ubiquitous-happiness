// What a shipment home is FOR: the pieces of the house still to rebuild (agent M's src/hideout/rebuild.ts: PIECES in
// goal order, costOf, isBuilt) with their material counts before and after this parcel lands.
//
//   homeGoals({ driftwood: 3 })   -> [{ name: 'Workbench', unlock, lines: [{ id, have, after, need }], ready, readyNow }]
//   the first entry is the house's current goal; then any other unbuilt piece the parcel helps with
import { META } from '../meta/meta';
import { ITEMS } from '../game/items';
import { PIECES, costOf, isBuilt } from '../hideout/rebuild';

export interface GoalLine { id: string; name: string; have: number; after: number; need: number }
export interface HomeGoal {
  id: string; name: string; unlock: string;
  lines: GoalLine[];
  /** buildable once this parcel is home (and wasn't before) / already buildable */
  ready: boolean; readyBefore: boolean;
  /** the house's current goal (the goal board's piece) */
  goal: boolean;
}

export function homeGoals(parcel: Record<string, number>, max = 3): HomeGoal[] {
  const out: HomeGoal[] = [];
  let first = true;
  for (const p of PIECES) {
    if (isBuilt(p.id)) continue;
    const cost = costOf(p.id);
    const lines: GoalLine[] = Object.entries(cost).filter(([id]) => ITEMS[id]).map(([id, need]) => {
      const have = META.materials[id] ?? 0;
      return { id, name: ITEMS[id].name, have, after: have + (parcel[id] ?? 0), need };
    });
    const helps = lines.some((l) => (parcel[l.id] ?? 0) > 0);
    const goal = first; first = false;
    if (!goal && !helps) continue;
    const readyBefore = lines.every((l) => l.have >= l.need), ready = lines.every((l) => l.after >= l.need);
    out.push({ id: p.id, name: p.name, unlock: p.unlock, lines, ready, readyBefore, goal });
    if (out.length >= max) break;
  }
  return out;
}
