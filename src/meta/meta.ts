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

/** running totals for one run (the end-of-run card) */
export interface RunTally { kills: number; time: number; waves: number; extracted: number; repairs: number; bosses: number }

/**
 * The run in progress (META.activeRun), written by src/game/runScreen.ts at every area start, wave clear,
 * extraction and quit, so RESUME rebuilds the run from here. Its backpack items are out of the stash while it lives.
 */
export interface RunSave {
  v: 2;
  cfg: RunConfig;
  seed: number;
  /** the three areas of this run, in order */
  areas: string[];
  areaIdx: number;
  /** waves cleared in the current area */
  wavesCleared: number;
  hp: number;
  /** the run's backpack (Run.items): loadout + gear found */
  items: ItemInst[];
  nextUid: number;
  /** the loot bag: material / item ids carried and not yet extracted (lost on death) */
  bag: string[];
  /** the current area's shipwreck progress */
  wreck: { stage: number; paid: Record<string, number>; hp: number } | null;
  tally: RunTally;
}

/** how a run ended (shown on the hideout's result card) */
export interface RunResult {
  outcome: 'dead' | 'sunk' | 'victory';
  areaName: string; areaIdx: number; wave: number; mastery: number;
  /** ids lost on death (bag + backpack) / brought home on victory */
  items: string[];
  killer: { name: string; title?: string; nemesis?: boolean } | null;
  tally: RunTally;
  /** mastery level newly unlocked by a win */
  unlocked?: number;
}

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
  activeRun: RunSave | null;
  lastConfig: RunConfig | null;
  settings: { volume: number; music: number; lowQuality: boolean; motionBlur: number };
  /** the prologue (src/story/intro.ts) has been played or skipped: boot goes straight to the hideout */
  introDone: boolean;
  /** cosmetics (src/cosmetics): looks only, never stats. Ids per slot; '' never appears (the defaults are ids) */
  cosmetics: CosmeticsSave;
  /** achievements (src/achievements): unlocked ids, when, and the running counters they track */
  achievements: AchievementsSave;
}

export interface CosmeticsSave { unlocked: string[]; equipped: { hat: string; skin: string; sword: string; trail: string; scarf: string } }
export interface AchievementsSave { unlocked: string[]; at: Record<string, number>; counters: Record<string, number> }

const KEY = 'blobfish.meta.v2';

function fresh(): MetaSave {
  return {
    version: 2, materials: {}, stash: [], nextUid: 1,
    built: [], unlockedBlueprints: ['sofa', 'tv', 'storage', 'workbench', 'lamp', 'rug'],
    mastery: 0, masteryUnlocked: 0, nemeses: [],
    runs: 0, wins: 0, deaths: 0, extractions: 0,
    activeRun: null, lastConfig: null,
    settings: { volume: 0.9, music: 0.55, lowQuality: false, motionBlur: 1 },
    introDone: false,
    cosmetics: { unlocked: [], equipped: { hat: 'kasa', skin: 'pink', sword: 'toothpick', trail: 'bubbles', scarf: 'redScarf' } },
    achievements: { unlocked: [], at: {}, counters: {} },
  };
}

function load(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw) as MetaSave;
      // saves from before the prologue existed: anyone who has played a run skips it
      if (m.version === 2) {
        const f = fresh();
        return {
          ...f, ...m, settings: { ...f.settings, ...m.settings }, introDone: m.introDone ?? (m.runs ?? 0) > 0,
          cosmetics: { ...f.cosmetics, ...m.cosmetics, equipped: { ...f.cosmetics.equipped, ...m.cosmetics?.equipped } },
          achievements: { ...f.achievements, ...m.achievements, at: { ...m.achievements?.at }, counters: { ...m.achievements?.counters } },
        };
      }
    }
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
/** take stash items out for a run (by uid); they leave the stash until returned */
export function takeFromStash(uids: number[]): ItemInst[] {
  const out = META.stash.filter((s) => uids.includes(s.uid));
  META.stash = META.stash.filter((s) => !uids.includes(s.uid));
  saveMeta();
  return out.map((s) => ({ ...s }));
}
/** put items back in the stash (fresh uids, loose) */
export function returnToStash(items: { id: string; level?: number }[]) {
  for (const it of items) META.stash.push({ uid: META.nextUid++, id: it.id, gx: -1, gy: -1, rot: 0, level: it.level ?? 1 });
  saveMeta();
}
