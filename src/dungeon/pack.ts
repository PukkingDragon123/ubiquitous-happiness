// The pack (v3 rules): EVERY item pickup, gear and materials alike, goes into the 5x5 backpack grid. Materials have
// real shapes and stack per placed instance (same id, up to stackCap(id)). Gear in the grid gives stats as before
// (installItemSystem / run.statFn). Pearls, keys, bombs and hearts are counters, never pack items.
//
//   packAdd(run, 'copperOre')            -> { inst, stacked, left } | null (null = PACK FULL: the pickup keeps floating)
//   packFits(run, 'driftwood')           would it go in right now
//   packTake(run, uid, n?)               remove n of a stack (all by default); returns the removed copy
//   packLoose(run) / packPlaced(run)     instances off / on the grid (loose ones are on the backpack's board)
//   packTotals(run)                      { materials: {id: n}, gear: [{id, level}] } for mailing / bringing home
//   packCells(run)                       { used, free, total }
//
// The backpack screen (agent L draws it) edits run.items directly: placing, rotating, fusing. Its board (gx < 0)
// is "the floor at your fins": the run screen drops whatever is left on it back into the water when the bag closes.
import type { Run, ItemInst } from '../game/run';
import { ITEMS, GRID, findSpot, stackCap, stackRoom, getItem } from '../game/items';

/** what went in: the instance that took the last unit, whether it was a stack top-up, and how many did NOT fit */
export interface PackAdd { inst: ItemInst; stacked: boolean; left: number }

/** put one item (or a stack of n) into the grid: top up a matching stack first, then find room (any rotation) */
export function packAdd(run: Run, id: string, level = 1, n = 1): PackAdd | null {
  if (!ITEMS[id]) return null;
  const cap = stackCap(id);
  let left = n;
  let last: ItemInst | null = null;
  // top up existing stacks in the grid
  if (cap > 1) for (const it of run.items) {
    if (left <= 0) break;
    if (it.id !== id || it.gx < 0) continue;
    const k = Math.min(stackRoom(it), left);
    if (k > 0) { it.n = (it.n ?? 1) + k; left -= k; last = it; }
  }
  if (left <= 0 && last) return { inst: last, stacked: true, left: 0 };
  const stackedSome = left < n;
  // new instances for the rest
  while (left > 0) {
    const inst: ItemInst = { uid: run.nextUid++, id, gx: -1, gy: -1, rot: 0, level, n: Math.min(cap, left) };
    const spot = findSpot(run.items, inst);
    if (!spot) { run.nextUid--; break; }
    inst.gx = spot.gx; inst.gy = spot.gy; inst.rot = spot.rot;
    run.items.push(inst);
    left -= inst.n ?? 1;
    last = inst;
  }
  if (!last || left >= n) return null;
  return { inst: last, stacked: stackedSome, left };
}

/** would one of `id` go into the pack right now (a stack with room, or a free spot) */
export function packFits(run: Run, id: string): boolean {
  if (!ITEMS[id]) return false;
  if (stackCap(id) > 1 && run.items.some((it) => it.id === id && it.gx >= 0 && stackRoom(it) > 0)) return true;
  return !!findSpot(run.items, { uid: -1, id, gx: -1, gy: -1, rot: 0 });
}

/** remove n of a stack (default: all of it); returns what was removed (null if the uid is unknown) */
export function packTake(run: Run, uid: number, n?: number): ItemInst | null {
  const it = run.items.find((i) => i.uid === uid);
  if (!it) return null;
  const have = it.n ?? 1, k = Math.min(have, n ?? have);
  if (k >= have) { run.items = run.items.filter((i) => i.uid !== uid); return { ...it, n: have }; }
  it.n = have - k;
  return { ...it, n: k };
}

export const packLoose = (run: Run) => run.items.filter((i) => i.gx < 0 && ITEMS[i.id]);
export const packPlaced = (run: Run) => run.items.filter((i) => i.gx >= 0 && ITEMS[i.id]);

/** what a list of instances amounts to at home: material counts + gear (one stash entry each) */
export function packTotals(items: ItemInst[]): { materials: Record<string, number>; gear: { id: string; level: number }[] } {
  const materials: Record<string, number> = {};
  const gear: { id: string; level: number }[] = [];
  for (const it of items) {
    const d = ITEMS[it.id];
    if (!d) continue;
    if (d.kind === 'material') materials[it.id] = (materials[it.id] ?? 0) + (it.n ?? 1);
    else gear.push({ id: it.id, level: it.level ?? 1 });
  }
  return { materials, gear };
}

export function packCells(run: Run): { used: number; free: number; total: number } {
  let used = 0;
  for (const it of run.items) if (it.gx >= 0 && ITEMS[it.id]) used += getItem(it.id).shape.length;
  const total = GRID * GRID;
  return { used, free: total - used, total };
}
