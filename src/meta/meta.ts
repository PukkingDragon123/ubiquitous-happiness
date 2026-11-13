// Persistent meta-progression (survives runs): the hideout stash, extracted materials, what's been built in the
// hideout, blueprints, mastery, nemeses, and the run in progress (for RESUME).
//
//   import { META, saveMeta, addMaterials, spendMaterials } from '../meta/meta';
//   META.materials.copperOre += 3; saveMeta();
import type { ItemInst } from '../game/run';

/** a piece of furniture / station placed in the hideout (grid cell coords, quarter-turn rotation) */
export interface Placement { uid: number; bp: string; x: number; z: number; rot: number }

/** a human who beat you or got away: they come back, stronger, and remember */
export interface Nemesis {
  id: string;
  name: string;           // "Gary 'Two-Lines' Petersen"
  title: string;          // "the Line-Snapped"
  arch: string;           // humans archetype id
  level: number;          // promotions
  scars: string[];        // visual + lore: 'eyepatch', 'hookHand', 'burns', 'bandage', 'bite'
  memories: string[];     // short facts used for taunts: 'killed you in reef', 'you cut his line twice'
  kills: number;          // times they killed the blobfish
  defeats: number;        // times the blobfish beat them
  seed: number;
  alive: boolean;
}

export interface RunConfig { mastery: number; startArea: string; loadout: number[] /* stash item uids */ }

export interface MetaSave {
  version: 2;
  materials: Record<string, number>;
  stash: ItemInst[];
  nextUid: number;
  built: Placement[];
  unlockedBlueprints: string[];
  mastery: number;          // selected
  masteryUnlocked: number;  // highest beaten + 1
  nemeses: Nemesis[];
  runs: number; wins: number; deaths: number; extractions: number;
  activeRun: unknown | null;
  lastConfig: RunConfig | null;
  settings: { volume: number; music: number; lowQuality: boolean; motionBlur: number };
}

const KEY = 'blobfish.meta.v2';

function fresh(): MetaSave {
  return {
    version: 2, materials: {}, stash: [], nextUid: 1,
    built: [], unlockedBlueprints: ['sofa', 'tv', 'storage', 'workbench', 'lamp', 'rug'],
    mastery: 0, masteryUnlocked: 0, nemeses: [],
    runs: 0, wins: 0, deaths: 0, extractions: 0,
    activeRun: null, lastConfig: null,
    settings: { volume: 0.9, music: 0.55, lowQuality: false, motionBlur: 1 },
  };
}

function load(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const m = JSON.parse(raw) as MetaSave; if (m.version === 2) return { ...fresh(), ...m, settings: { ...fresh().settings, ...m.settings } }; }
  } catch { /* corrupt or blocked storage: start fresh */ }
  return fresh();
}

export const META: MetaSave = load();

export function saveMeta() { try { localStorage.setItem(KEY, JSON.stringify(META)); } catch { /* ignore */ } }
export function resetMeta() { Object.assign(META, fresh()); saveMeta(); }

export function addMaterials(m: Record<string, number>) {
  for (const [k, v] of Object.entries(m)) META.materials[k] = (META.materials[k] ?? 0) + v;
  saveMeta();
}
export function hasMaterials(cost: Record<string, number>) { return Object.entries(cost).every(([k, v]) => (META.materials[k] ?? 0) >= v); }
export function spendMaterials(cost: Record<string, number>): boolean {
  if (!hasMaterials(cost)) return false;
  for (const [k, v] of Object.entries(cost)) META.materials[k] -= v;
  saveMeta();
  return true;
}
export function stashItem(id: string, level = 1): ItemInst {
  const it: ItemInst = { uid: META.nextUid++, id, gx: -1, gy: -1, rot: 0, level };
  META.stash.push(it); saveMeta();
  return it;
}
