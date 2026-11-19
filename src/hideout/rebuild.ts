// REBUILDING THE HOME (v4). A new save starts in a ruined, abandoned stone house; the blobfish and Mr. Crab rebuild
// it piece by piece on fixed BUILD SPOTS, spending the materials brought home from runs. Each piece unlocks something
// (the stash, crafting, +1 heart on runs, cosmetics, achievements...). The GOAL is always the first piece in PIECES
// order that is not built yet; the goal board and the on-screen objective line show it with have / need counts.
//
//   PIECES, PIECE[id]           the build list: where it stands, what it costs, what it unlocks
//   isBuilt(id), builtPieces()  read the save (META.built holds { bp: pieceId } placements)
//   canAfford(id), missing(id)  materials check
//   buildPiece(id)              spend + mark built (the build scene calls it when the hammering starts)
//   nextGoal()                  the piece the goal board shows (null when the house is done)
//   ensureHome()                once per save: migrate a v3 hideout, Mr. Crab's starter driftwood
//   homeStations()              the station ids the run screens read (bed -> 'bunk' = +1 heart)
import { META, saveMeta, spendMaterials, hasMaterials } from '../meta/meta';
import { ITEMS } from '../game/items';

export type PieceId = 'stash' | 'workbench' | 'bed' | 'lampA' | 'trophy' | 'wardrobe' | 'sofa' | 'window' | 'lampB' | 'door';

export interface Piece {
  id: PieceId;
  name: string;
  /** what building it gives you (one short line, shown on the cost tag and the unlock card) */
  unlock: string;
  cost: Record<string, number>;
  /** world placement on the floor (centre x, z) and facing (yaw: the model's +z front turned by this) */
  x: number; z: number; yaw: number;
  /** footprint (m) in the model's own frame: w along x, d along z (blocks walking once built) */
  w: number; d: number;
  /** mounted on a wall at this height (window, shelf): no footprint on the floor */
  wall?: number;
}

const P = (p: Piece) => p;
export const PIECES: Piece[] = [
  P({ id: 'stash', name: 'Stash Chest', unlock: 'A stash: keep what you bring home', cost: { driftwood: 3 }, x: 5.15, z: -0.6, yaw: -Math.PI / 2, w: 1.5, d: 0.75 }),
  P({ id: 'workbench', name: 'Workbench', unlock: 'Crafting and upgrades', cost: { seashell: 4, coralShard: 3 }, x: 5.2, z: -3.2, yaw: -Math.PI / 2, w: 1.9, d: 0.75 }),
  P({ id: 'bed', name: 'Bed', unlock: '+1 heart on every run', cost: { kelp: 4, cork: 2, seashell: 2 }, x: -5.0, z: -2.0, yaw: Math.PI / 2, w: 2.0, d: 1.15 }),
  P({ id: 'lampA', name: 'Lamp', unlock: 'Warm light (cosier)', cost: { seaGlass: 2, coralShard: 1 }, x: -5.35, z: 0.25, yaw: 0, w: 0.6, d: 0.6 }),
  P({ id: 'trophy', name: 'Trophy Shelf', unlock: 'Achievements', cost: { driftwood: 3, lineScrap: 3 }, x: 3.2, z: -4.05, yaw: 0, w: 2.2, d: 0.5, wall: 0 }),
  P({ id: 'wardrobe', name: 'Wardrobe', unlock: 'Cosmetics: hats, skins, scarves', cost: { driftwood: 4, seashell: 3, cork: 2 }, x: -2.9, z: -4.0, yaw: 0, w: 1.3, d: 0.65 }),
  P({ id: 'sofa', name: 'Sofa', unlock: 'A place to sit (cosier)', cost: { kelp: 5, cork: 3, driftwood: 2 }, x: 0.2, z: 0.9, yaw: Math.PI, w: 1.9, d: 0.85 }),
  P({ id: 'window', name: 'Window', unlock: 'Daylight through the round window', cost: { seaGlass: 4, copperOre: 1 }, x: 0, z: -4.5, yaw: 0, w: 2, d: 0.3, wall: 2.15 }),
  P({ id: 'lampB', name: 'Lamp', unlock: 'More warm light', cost: { seaGlass: 2, copperOre: 1 }, x: 2.05, z: 1.35, yaw: 0, w: 0.6, d: 0.6 }),
  P({ id: 'door', name: 'Front Door', unlock: 'A proper door (cosy and snug)', cost: { driftwood: 5, scrap: 2, rustyNail: 3 }, x: 0, z: 4.5, yaw: 0, w: 1.8, d: 0.4, wall: 0 }),
];
export const PIECE: Record<string, Piece> = Object.fromEntries(PIECES.map((p) => [p.id, p]));

/** costs with unknown material ids dropped (materials can be renamed elsewhere) */
export function costOf(id: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(PIECE[id]?.cost ?? {})) if (ITEMS[k]) out[k] = v;
  return out;
}
export function isBuilt(id: string) { return META.built.some((p) => p.bp === id); }
export function builtPieces(): PieceId[] { return PIECES.filter((p) => isBuilt(p.id)).map((p) => p.id); }
export function canAfford(id: string) { return hasMaterials(costOf(id)); }
/** [material, have, need] for each cost line */
export function costLines(id: string): [string, number, number][] { return Object.entries(costOf(id)).map(([k, v]) => [k, META.materials[k] ?? 0, v]); }
export function missing(id: string) { return costLines(id).filter(([, h, n]) => h < n); }

/** spend the materials and mark the piece built; false when it can't be afforded (or is built already) */
export function buildPiece(id: string): boolean {
  if (!PIECE[id] || isBuilt(id) || !spendMaterials(costOf(id))) return false;
  const uid = META.built.reduce((m, p) => Math.max(m, p.uid), 0) + 1;
  META.built.push({ uid, bp: id, x: 0, z: 0, rot: 0 });
  saveMeta();
  return true;
}
/** the next piece to build (the goal board), or null when the house is whole */
export function nextGoal(): Piece | null { return PIECES.find((p) => !isBuilt(p.id)) ?? null; }
/** 0..1 how rebuilt the house is (the lighting warms with it) */
export function homeProgress() { return builtPieces().length / PIECES.length; }

/** v3 hideout furniture -> v4 pieces (a returning player keeps what they had) */
const FROM_V3: Record<string, PieceId> = { storage: 'stash', workbench: 'workbench', bunk: 'bed', lamp: 'lampA', trophyWall: 'trophy', sofa: 'sofa' };

/** every load: a v3 layout becomes v4 pieces (what they had), and a save gets Mr. Crab's starter driftwood once */
export function ensureHome() {
  const old = META.built.filter((p) => !PIECE[p.bp]);
  if (old.length) {
    META.built = META.built.filter((p) => !!PIECE[p.bp]);
    for (const p of old) { const id = FROM_V3[p.bp]; if (id && !isBuilt(id)) META.built.push({ uid: META.built.reduce((m, q) => Math.max(m, q.uid), 0) + 1, bp: id, x: 0, z: 0, rot: 0 }); }
  }
  starterGift();
  saveMeta();
}
/** a fresh home (NEW GAME): ruined, with the starter driftwood */
export function resetHome() {
  META.built = [];
  starterGift();
  saveMeta();
}
function starterGift() {
  const c = META.achievements.counters as Record<string, number>;
  if (c.crabGift) return;
  c.crabGift = 1;
  META.materials.driftwood = (META.materials.driftwood ?? 0) + 3;
}

/** station ids the run screens read: the bed is the old 'bunk' (+1 max heart), the workbench opens archetype gear */
export function homeStations(): string[] {
  const out: string[] = [];
  if (isBuilt('bed')) out.push('bunk');
  if (isBuilt('workbench')) out.push('workbench');
  if (isBuilt('stash')) out.push('storage');
  return out;
}
