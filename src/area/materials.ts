// Materials the v2 areas drop that items.ts does not define yet. Agent E owns items.ts: these defs are written
// in its ItemDef shape so they can be pasted into the material table as-is. Until then, materialId() maps each
// to the closest existing material so drops never break the pickup / backpack code.
import { ITEMS, type ItemDef } from '../game/items';

export const EXTRA_MATERIALS: ItemDef[] = [
  { id: 'manaCrystal', name: 'Mana Crystal', kind: 'material', shape: [[0, 0], [0, 1]], rarity: 'rare', maxLevel: 1, look: 'gem', tags: ['gem', 'mana'], glow: 1.2,
    desc: 'A sliver of the sea\'s own magic. Hums in the key of bubbles.' },
  { id: 'scrapMetal', name: 'Scrap Metal', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'metal', tags: ['metal'],
    desc: 'Rusty plate off a dead boat. A tinkerer\'s love language.' },
  { id: 'seashell', name: 'Seashell', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1,
    desc: 'Ribbed, pink-lipped and perfectly fist-sized. Fins-sized.' },
];

/** fallbacks while the defs above are missing from items.ts */
const FALLBACK: Record<string, string> = { manaCrystal: 'amethyst', scrapMetal: 'scrap', seashell: 'seaGlass' };

/** a material id that items.ts knows (the id itself once E has added it) */
export function materialId(id: string): string {
  if (id === 'scrapMetal' && ITEMS.scrap) return 'scrap';
  if (ITEMS[id]) return id;
  return FALLBACK[id] && ITEMS[FALLBACK[id]] ? FALLBACK[id] : 'lineScrap';
}

export function rarityOf(id: string): ItemDef['rarity'] {
  return ITEMS[id]?.rarity ?? EXTRA_MATERIALS.find((d) => d.id === id)?.rarity ?? 'common';
}
