// Loot tables: what a cleared room drops (Isaac-style chances), what pedestals, chests and shops hold, and the
// materials each floor's rooms give. Luck (run.stats().luck) and mastery's lootBonus tilt the odds.
import type { Rng } from '../core/rng';
import { ITEMS, rollItem, type ItemDef } from '../game/items';
import { stationPerks } from '../hideout/blueprints';
import type { ShopSlot } from './floor';

export type Reward = { kind: 'pearl'; value: number } | { kind: 'heart'; value: number } | { kind: 'key' } | { kind: 'bomb' } | { kind: 'item'; id: string };

/** the materials each floor's rooms, chests and enemies give (weights) */
export const FLOOR_MATERIALS: Record<string, [string, number][]> = {
  reef: [['coralShard', 3], ['seashell', 3], ['seaGlass', 2], ['cork', 2], ['lineScrap', 2], ['pearl', 0.6]],
  kelp: [['kelp', 3], ['driftwood', 3], ['seashell', 2], ['urchinSpine', 2], ['copperOre', 2], ['amethyst', 0.6]],
  graveyard: [['scrap', 3], ['rustyNail', 3], ['rustyHook', 2], ['ironOre', 2], ['driftwood', 1.5], ['doubloon', 0.6]],
  arctic: [['ironOre', 3], ['riverStone', 2], ['seaGlass', 2], ['sharkTooth', 2], ['aquamarine', 1], ['manaCrystal', 0.8]],
  abyss: [['manaCrystal', 2.5], ['leadShot', 2], ['goldNugget', 1.5], ['ruby', 0.8], ['emerald', 0.8], ['abyssCrystal', 0.5]],
};

export function rollMaterial(rng: Rng, area: string): string {
  const t = FLOOR_MATERIALS[area] ?? FLOOR_MATERIALS.reef;
  const id = rng.weighted(t, (e) => e[1])[0];
  return ITEMS[id] ? id : 'lineScrap';
}

const ARCH = ['mage', 'warrior', 'summoner', 'tinkerer', 'rogue'];
/** a gear roll (never a material): archetype gear only once its hideout station is built, untagged gear always */
export function rollGear(rng: Rng, luck: number, tier: 'room' | 'treasure' | 'boss' | 'shop' = 'room'): string {
  let arch = new Set<string>(), unlocks = new Set<string>();
  try { const p = stationPerks(); arch = new Set(p.arch); unlocks = new Set(p.unlocks); } catch { /* hideout not loaded */ }
  const ok = (d: ItemDef) => {
    if (d.kind === 'material' || d.craftOnly) return false;
    if (unlocks.has(d.id)) return true;
    const tags = (d.tags ?? []).filter((t) => ARCH.includes(t));
    return !tags.length || tags.some((t) => arch.has(t));
  };
  const pool = (d: ItemDef) => ok(d) && (tier !== 'boss' || d.rarity !== 'common') && (tier !== 'treasure' || d.rarity !== 'common' || rng.chance(0.3));
  const L = luck + (tier === 'boss' ? 2.5 : tier === 'treasure' ? 1 : 0);
  const id = rollItem(rng, pool, L);
  return ITEMS[id] && ITEMS[id].kind !== 'material' ? id : rollItem(rng, (d) => d.kind !== 'material' && !d.craftOnly, L);
}

/** Isaac-style room-clear reward: often a pearl or a heart, sometimes a key / bomb / material, rarely gear */
export function rollClearReward(rng: Rng, area: string, luck: number, lootBonus = 1): Reward[] {
  const nothing = Math.max(0.08, 0.3 - luck * 0.03 - (lootBonus - 1) * 0.5);
  if (rng.chance(nothing)) return [];
  const table: [string, number][] = [['pearl', 30], ['heart', 14], ['key', 9], ['bomb', 11], ['material', 24], ['pearls', 6], ['gear', 2.5 + Math.max(0, luck) * 0.5]];
  const k = rng.weighted(table, (e) => e[1])[0];
  switch (k) {
    case 'pearl': return [{ kind: 'pearl', value: rng.chance(0.06) ? 10 : rng.chance(0.22) ? 5 : 1 }];
    case 'pearls': return [{ kind: 'pearl', value: 1 }, { kind: 'pearl', value: 1 }, { kind: 'pearl', value: 1 }];
    case 'heart': return [{ kind: 'heart', value: rng.chance(0.55) ? 1 : 2 }];
    case 'key': return [{ kind: 'key' }];
    case 'bomb': return [{ kind: 'bomb' }];
    case 'gear': return [{ kind: 'item', id: rollGear(rng, luck) }];
    default: return rng.chance(0.3) ? [{ kind: 'item', id: rollMaterial(rng, area) }, { kind: 'item', id: rollMaterial(rng, area) }] : [{ kind: 'item', id: rollMaterial(rng, area) }];
  }
}

const PRICE: Record<string, number> = { common: 6, uncommon: 9, rare: 14, epic: 20, legendary: 28 };
/** Mr. Crab's stock: two or three pieces of gear and a counter or two */
export function rollShop(rng: Rng, luck: number, floorN: number): ShopSlot[] {
  const slots: ShopSlot[] = [];
  const nGear = rng.chance(0.4) ? 3 : 2;
  const used = new Set<string>();
  for (let i = 0; i < nGear; i++) {
    let id = rollGear(rng, luck + floorN * 0.4, 'shop');
    for (let k = 0; k < 4 && used.has(id); k++) id = rollGear(rng, luck + floorN * 0.4, 'shop');
    used.add(id);
    slots.push({ kind: 'item', id, price: PRICE[ITEMS[id]?.rarity ?? 'common'] + floorN, sold: false });
  }
  slots.push(rng.chance(0.5) ? { kind: 'heart', price: 3, sold: false } : { kind: rng.chance(0.5) ? 'key' : 'bomb', price: 5, sold: false });
  if (slots.length < 4 && rng.chance(0.5)) slots.push({ kind: rng.chance(0.5) ? 'bomb' : 'key', price: 5, sold: false });
  return slots;
}
