// Workshop recipes: craft stash gear from materials (some need a station built in the hideout) and upgrade
// stash items a level at a time. Ids are item ids from src/game/items.ts; unknown ids are skipped.
import { ITEMS, getItem, type Rarity } from '../game/items';
import { META, saveMeta, hasMaterials, spendMaterials, stashItem } from '../meta/meta';
import { stationsBuilt, BLUEPRINTS } from './blueprints';
import type { ItemInst } from '../game/run';

export interface Craft { out: string; cost: Record<string, number>; station?: string }

const C = (out: string, cost: Record<string, number>, station?: string): Craft => ({ out, cost, station });
const ALL: Craft[] = [
  C('scissors', { rustyNail: 3, ironOre: 1 }),
  C('whetstone', { riverStone: 3, ironOre: 1 }),
  C('leadSinker', { leadShot: 4 }),
  C('corkBobber', { cork: 3, lineScrap: 1 }),
  C('wormCan', { kelp: 2, rustyNail: 1 }),
  C('lineSpool', { lineScrap: 5, driftwood: 1 }),
  C('rodTip', { driftwood: 2, lineScrap: 2 }),
  C('netShard', { lineScrap: 6, kelp: 2 }),
  C('spinnerSpoon', { copperOre: 2, seaGlass: 1 }),
  C('teacup', { seaGlass: 2, coralShard: 1 }),
  C('spiralShell', { coralShard: 2, pearl: 1 }),
  C('sharkNecklace', { sharkTooth: 3, lineScrap: 2 }),
  C('compass', { copperOre: 2, glassLens: 1, doubloon: 1 }),
  C('luckyLure', { goldNugget: 1, rustyHook: 2, pearl: 1 }),
  C('sailFin', { kelp: 4, sharkTooth: 1, cork: 2 }),
  C('lodestone', { ironOre: 5, amethyst: 1 }),
  C('pliers', { ironOre: 2, rustyHook: 2 }, 'junkLathe'),
  C('reelGear', { copperOre: 3, rustyNail: 2 }, 'junkLathe'),
  C('tackleBox', { ironOre: 4, copperOre: 2, rustyHook: 3 }, 'junkLathe'),
  C('harpoonTip', { ironOre: 3, sharkTooth: 2 }, 'forge'),
  C('filletKnife', { ironOre: 4, copperOre: 1, sharkTooth: 1 }, 'forge'),
  C('grappleHook', { ironOre: 4, rustyHook: 4, lineScrap: 3 }, 'forge'),
  C('bubbleWand', { seaGlass: 3, aquamarine: 1 }, 'manaAltar'),
  C('eelBattery', { copperOre: 4, amethyst: 1 }, 'manaAltar'),
  C('laserLens', { glassLens: 2, ruby: 1, copperOre: 2 }, 'manaAltar'),
  C('inkSac', { kelp: 2, urchinSpine: 2 }, 'inkStill'),
  C('pufferSpines', { urchinSpine: 4, coralShard: 1 }, 'inkStill'),
  C('rubberDuck', { cork: 4, coralShard: 1 }, 'toyBench'),
  C('starfish', { coralShard: 3, pearl: 1 }, 'toyBench'),
];
/** recipes whose output and every ingredient exist in the item table */
export const CRAFTS: Craft[] = ALL.filter((c) => ITEMS[c.out] && Object.keys(c.cost).every((k) => ITEMS[k]));

export function craftAvailable(c: Craft) { return !c.station || stationsBuilt().includes(c.station); }
export function stationName(id: string) { return BLUEPRINTS[id]?.name ?? id; }

export function craft(c: Craft): ItemInst | null {
  if (!craftAvailable(c) || !spendMaterials(c.cost)) return null;
  return stashItem(c.out, 1);
}

const BASE: Record<Rarity, number> = { common: 2, uncommon: 3, rare: 4, epic: 6, legendary: 8 };
/** materials to raise a stash item from its level to the next */
export function upgradeCost(it: ItemInst): Record<string, number> | null {
  const d = ITEMS[it.id];
  if (!d) return null;
  const lv = it.level ?? 1;
  if (lv >= d.maxLevel) return null;
  const n = BASE[d.rarity] * lv;
  const pair: [string, string] = d.kind === 'tool' ? ['ironOre', 'copperOre'] : d.kind === 'trinket' ? ['pearl', 'seaGlass'] : d.kind === 'ability' ? ['amethyst', 'aquamarine'] : ['driftwood', 'lineScrap'];
  const out: Record<string, number> = { [pair[0]]: n, [pair[1]]: Math.ceil(n / 2) };
  if (lv >= 2) out.goldNugget = lv - 1;
  for (const k of Object.keys(out)) if (!ITEMS[k]) delete out[k];
  return out;
}
export function canUpgrade(it: ItemInst) { const c = upgradeCost(it); return !!c && hasMaterials(c); }
export function upgrade(it: ItemInst): boolean {
  const c = upgradeCost(it);
  if (!c || !spendMaterials(c)) return false;
  it.level = (it.level ?? 1) + 1;
  saveMeta();
  return true;
}
/** stash items that can still level up */
export function upgradable(): ItemInst[] { return META.stash.filter((it) => ITEMS[it.id] && (it.level ?? 1) < getItem(it.id).maxLevel); }
