// Fishing-spot layouts: which anglers fish where for each kind of map node, scaled by difficulty/act.
import type { World } from './types';
import type { FishingSystem } from '../fishing/angler';
import type { DiveNode } from './dive';

const SPOTS: Record<string, { def: string; x: number; facing: number }[][]> = {
  // each spot: tiers of angler lineups (index by difficulty)
  pier: [[{ def: 'kid', x: -4, facing: 1 }, { def: 'grandma', x: 4, facing: 1 }], [{ def: 'kid', x: -6, facing: 1 }, { def: 'grandma', x: 2, facing: 1 }, { def: 'dockWorker', x: 10, facing: -1 }]],
  rowboatCove: [[{ def: 'weekendDad', x: -2, facing: 1 }, { def: 'oldSalt', x: 12, facing: -1 }], [{ def: 'weekendDad', x: -4, facing: 1 }, { def: 'oldSalt', x: 8, facing: -1 }, { def: 'kid', x: 18, facing: -1 }]],
  kelpForest: [[{ def: 'oldSalt', x: 0, facing: 1 }, { def: 'weekendDad', x: 14, facing: -1 }], [{ def: 'oldSalt', x: -2, facing: 1 }, { def: 'proAngler', x: 12, facing: -1 }]],
  harbor: [[{ def: 'dockWorker', x: -3, facing: 1 }, { def: 'dockWorker', x: 9, facing: -1 }], [{ def: 'dockWorker', x: -4, facing: 1 }, { def: 'oldSalt', x: 6, facing: -1 }, { def: 'dockWorker', x: 16, facing: -1 }]],
  reef: [[{ def: 'weekendDad', x: 0, facing: 1 }, { def: 'kid', x: 12, facing: -1 }], [{ def: 'weekendDad', x: -2, facing: 1 }, { def: 'grandma', x: 8, facing: -1 }, { def: 'kid', x: 17, facing: -1 }]],
  iceHole: [[{ def: 'iceFisher', x: 0, facing: 1 }, { def: 'iceFisher', x: 10, facing: -1 }], [{ def: 'iceFisher', x: -3, facing: 1 }, { def: 'iceFisher', x: 6, facing: 1 }, { def: 'iceFisher', x: 15, facing: -1 }]],
  trawlerLane: [[{ def: 'proAngler', x: 0, facing: 1 }, { def: 'oldSalt', x: 12, facing: -1 }], [{ def: 'proAngler', x: -2, facing: 1 }, { def: 'proAngler', x: 10, facing: -1 }, { def: 'oldSalt', x: 20, facing: -1 }]],
  sunsetBay: [[{ def: 'grandma', x: 0, facing: 1 }, { def: 'weekendDad', x: 12, facing: -1 }], [{ def: 'grandma', x: -2, facing: 1 }, { def: 'oldSalt', x: 8, facing: -1 }, { def: 'weekendDad', x: 18, facing: -1 }]],
  elite: [[{ def: 'proAngler', x: -1, facing: 1 }, { def: 'proAngler', x: 11, facing: -1 }]],
};

export function spotLayout(w: World, sys: FishingSystem, node: DiveNode) {
  const key = node.type === 'elite' ? 'elite' : node.spot;
  const tiers = SPOTS[key] ?? SPOTS.rowboatCove;
  const lineup = tiers[Math.min(tiers.length - 1, Math.max(0, Math.round(node.difficulty) - 1))];
  for (const a of lineup) {
    const an = sys.spawn(w, a.def, a.x, a.facing);
    if (node.difficulty > 2) an.resolve += 1;
  }
}
