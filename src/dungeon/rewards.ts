// Loot tables: what a cleared room drops (Isaac-style chances), what pedestals, chests and shops hold, and the
// materials each floor's rooms give. Luck (run.stats().luck) and mastery's lootBonus tilt the odds.
import type { Rng } from '../core/rng';
import { ITEMS, rollItem, type ItemDef } from '../game/items';
import { stationPerks } from '../hideout/blueprints';
import type { ShopSlot } from './level';

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
/** v4's big items (3x3 to 4x4, agent L): rare finds from big chests, sunken treasure and champions, never the shop */
export const BIG_ITEMS = ['giantClam', 'shipWheel', 'rustAnchor', 'sunkenChest', 'harpoonGun'];
const isBig = (id: string) => BIG_ITEMS.includes(id);
/** one big item (epic more often than legendary), or null when none exist */
export function rollBig(rng: Rng): string | null {
  const ok = BIG_ITEMS.filter((id) => ITEMS[id]);
  if (!ok.length) return null;
  return rng.weighted(ok, (id) => (ITEMS[id].rarity === 'legendary' ? 1 : 2.5));
}
/** the chance a chest / champion holds a big item */
export function bigChance(kind: 'big' | 'sunken' | 'elite' | 'boss', luck: number): number {
  const base = { big: 0.1, sunken: 0.22, elite: 0.06, boss: 0.3 }[kind];
  return Math.min(0.6, base + Math.max(0, luck) * 0.015);
}

export function rollGear(rng: Rng, luck: number, tier: 'room' | 'treasure' | 'boss' | 'shop' = 'room'): string {
  let arch = new Set<string>(), unlocks = new Set<string>();
  try { const p = stationPerks(); arch = new Set(p.arch); unlocks = new Set(p.unlocks); } catch { /* hideout not loaded */ }
  const ok = (d: ItemDef) => {
    if (d.kind === 'material' || d.craftOnly) return false;
    if (unlocks.has(d.id)) return true;
    const tags = (d.tags ?? []).filter((t) => ARCH.includes(t));
    return !tags.length || tags.some((t) => arch.has(t));
  };
  // (big items only come from their own rolls: rollBig)
  const pool = (d: ItemDef) => ok(d) && !isBig(d.id) && (tier !== 'boss' || d.rarity !== 'common') && (tier !== 'treasure' || d.rarity !== 'common' || rng.chance(0.3));
  const L = luck + (tier === 'boss' ? 2.5 : tier === 'treasure' ? 1 : 0);
  const id = rollItem(rng, pool, L);
  return ITEMS[id] && ITEMS[id].kind !== 'material' && !isBig(id) ? id : rollItem(rng, (d) => d.kind !== 'material' && !d.craftOnly && !isBig(d.id), L);
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

// ------------------------------------------------------------------ chests and kill drops (v4: lots more loot)
/** what a chest holds, by kind; luck and the depth's pearl multiplier (pk) tilt it */
export function rollChest(rng: Rng, kind: 'small' | 'locked' | 'big' | 'sunken' | 'elite', area: string, luck: number, pk = 1): Reward[] {
  const out: Reward[] = [];
  const pearls = (n: number) => { for (let i = 0; i < n; i++) out.push({ kind: 'pearl', value: pk }); };
  const mat = () => out.push({ kind: 'item', id: rollMaterial(rng, area) });
  switch (kind) {
    case 'small': {
      const k = rng.weighted([['pearls', 4], ['mat', 4], ['heart', 1.5], ['bomb', 1.5], ['key', 1]] as [string, number][], (e) => e[1])[0];
      if (k === 'pearls') pearls(rng.int(2, 4)); else if (k === 'mat') mat(); else out.push({ kind: k as 'heart', value: 1 } as Reward);
      if (rng.chance(0.55)) rng.chance(0.5) ? mat() : pearls(2);
      if (rng.chance(0.12 + luck * 0.02)) out.push({ kind: 'item', id: rollGear(rng, luck) });
      break;
    }
    case 'locked': out.push({ kind: 'item', id: rollGear(rng, luck + 1, 'treasure') }); mat(); pearls(3); if (rng.chance(0.3)) out.push({ kind: 'bomb' }); break;
    case 'big':
      out.push({ kind: 'item', id: rollGear(rng, luck + 0.5, 'treasure') });
      if (rng.chance(0.45 + luck * 0.03)) out.push({ kind: 'item', id: rollGear(rng, luck) });
      mat(); mat(); pearls(rng.int(4, 6));
      if (rng.chance(0.35)) out.push(rng.chance(0.5) ? { kind: 'key' } : { kind: 'bomb' });
      if (rng.chance(0.3)) out.push({ kind: 'heart', value: 2 });
      break;
    case 'sunken': out.push({ kind: 'item', id: rollGear(rng, luck + 2, 'treasure') }); pearls(rng.int(6, 9)); if (rng.chance(0.5)) mat(); break;
    case 'elite': mat(); if (rng.chance(0.6)) out.push({ kind: 'item', id: rollGear(rng, luck + 0.5) }); pearls(rng.int(2, 3)); break;
  }
  // the rare big find: a 3x3-4x4 piece (a build in itself)
  if ((kind === 'big' || kind === 'sunken' || kind === 'elite') && rng.chance(bigChance(kind, luck))) { const b = rollBig(rng); if (b) out.unshift({ kind: 'item', id: b }); }
  return out;
}

const FISH = /moray|crab|puffer|jelly|angler|barracuda|piranha|eel|shark|ray|squid|octo|fish|grouper|pike|bass|trigger|urchin|lion/i;
const HUMAN_JUNK: [string, number][] = [['scrap', 3], ['rustyHook', 2], ['rustyNail', 2], ['lineScrap', 2], ['leadShot', 1.5], ['cork', 1]];
/** a fish's own material, when it has an obvious one */
function fishMaterial(kind: string): string | null {
  if (/puffer|urchin|lion/i.test(kind)) return 'urchinSpine';
  if (/crab/i.test(kind)) return 'seashell';
  if (/moray|barracuda|shark|pike/i.test(kind)) return 'sharkTooth';
  if (/jelly/i.test(kind)) return 'seaGlass';
  if (/angler/i.test(kind)) return 'manaCrystal';
  return null;
}
export const isFishKind = (kind: string) => !/^human:/.test(kind) && FISH.test(kind);

/** what an enemy drops when it dies: fish drop materials, humans gear and scrap, bigger ones more; elites add a chest */
export function rollKillDrops(rng: Rng, kind: string, size: number, area: string, luck: number, pk = 1, family?: string): Reward[] {
  const out: Reward[] = [];
  const rolls = 1 + (size >= 1.5 ? 1 : 0) + (size >= 2.5 ? 1 : 0);
  // K's kill events carry a family ('fish' | 'human' ...) when they know it; else guess from the kind
  const fish = family ? family === 'fish' : isFishKind(kind);
  for (let i = 0; i < rolls; i++) {
    if (fish) {
      if (rng.chance(0.55)) { const own = fishMaterial(kind); out.push({ kind: 'item', id: own && ITEMS[own] && rng.chance(0.6) ? own : rollMaterial(rng, area) }); }
      if (rng.chance(0.35)) out.push({ kind: 'pearl', value: pk });
    } else {
      if (rng.chance(0.6)) { const j = rng.weighted(HUMAN_JUNK, (e) => e[1])[0]; out.push({ kind: 'item', id: ITEMS[j] ? j : 'scrap' }); }
      if (rng.chance(0.22 + luck * 0.02)) out.push({ kind: 'item', id: rollGear(rng, luck) });
      if (rng.chance(0.5)) { out.push({ kind: 'pearl', value: pk }); if (rng.chance(0.4)) out.push({ kind: 'pearl', value: pk }); }
    }
  }
  if (rng.chance(0.06)) out.push({ kind: 'heart', value: 1 });
  return out;
}
