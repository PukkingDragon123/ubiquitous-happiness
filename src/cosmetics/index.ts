// Cosmetics: looks only, never stats. Five slots (hat, skin, sword, trail, scarf); every item but the starters is
// unlocked by one achievement (src/achievements). The save lives in META.cosmetics { unlocked, equipped }.
//
//   installCosmetics()              once at boot, before any blobfish is built: the hat / sword look hooks in gear.ts
//   equip('tricorn'); owned('ghost'); equippedLook()
//   new CosmeticPuppet()            a BlobPuppet wearing the equipped look (src/cosmetics/rig.ts)
//   new CosmeticRig(model, space)   the same on any BlobModel (the run's player): skin, scarf cloth, trail
//
// Hats: a cosmetic hat replaces the hat the gear shows, except the default straw kasa, which steps aside for a
// build's own hat (wizard hat, plumed helm...) so outfits stay readable. A sword skin reskins the toothpick only.
import { META, saveMeta } from '../meta/meta';
import { GEAR_LOOK, type HatId } from '../player/gear';
import { swordSkin } from './swords';
import './hats';

export type Slot = 'hat' | 'skin' | 'sword' | 'trail' | 'scarf';
export const SLOTS: Slot[] = ['hat', 'skin', 'sword', 'scarf', 'trail'];
export const SLOT_NAME: Record<Slot, string> = { hat: 'HAT', skin: 'SKIN', sword: 'SWORD', trail: 'TRAIL', scarf: 'SCARF' };
export type Look = Record<Slot, string>;

export interface CosmeticDef {
  id: string; slot: Slot; name: string; desc: string;
  /** the achievement that unlocks it (none: a starter) */
  ach?: string;
}

export const COSMETICS: CosmeticDef[] = [
  // ---- hats
  { id: 'kasa', slot: 'hat', name: 'Straw Kasa', desc: 'Woven rice straw. Keeps the sun and the questions off.' },
  { id: 'roninKasa', slot: 'hat', name: 'Ronin Kasa', desc: 'Black lacquer, red cord. Masterless. Hatless? Never.', ach: 'survivor' },
  { id: 'coralCrown', slot: 'hat', name: 'Coral Crown', desc: 'Grown, not forged. The reef approves of your interior design.', ach: 'decorator' },
  { id: 'tricorn', slot: 'hat', name: 'Pirate Tricorn', desc: 'Salvaged with the wreck. Smells of rum and regret.', ach: 'shipwright' },
  { id: 'viking', slot: 'hat', name: 'Viking Helm', desc: 'Taken from a nemesis who will not be needing it.', ach: 'nemesisSlayer' },
  { id: 'toque', slot: 'hat', name: 'Chef Toque', desc: 'Fifty baits later, you have opinions about seasoning.', ach: 'gourmet' },
  { id: 'partyCone', slot: 'hat', name: 'Party Cone', desc: 'For the hoarder who has everything. Including this.', ach: 'collector' },
  { id: 'jellyCap', slot: 'hat', name: 'Jellyfish Cap', desc: 'A moon jelly that likes you. It glows when it is happy.', ach: 'megalodon' },
  { id: 'anglerLamp', slot: 'hat', name: 'Angler Lamp', desc: 'A lure headlamp from the abyss. Follow the light.', ach: 'deepDiver' },
  { id: 'kabuto', slot: 'hat', name: 'Samurai Kabuto', desc: 'Lacquered plates and a golden crest. Mastery made metal.', ach: 'mastery5' },
  // ---- skins
  { id: 'pink', slot: 'skin', name: 'Blobfish Pink', desc: 'The classic. Gelatinous, rosy, perfect.' },
  { id: 'pearl', slot: 'skin', name: 'Pearl Albino', desc: 'A rare pale morph with a nacre sheen.', ach: 'mastery4' },
  { id: 'violet', slot: 'skin', name: 'Deep-Sea Violet', desc: 'Abyssal purple with glowing photophores.', ach: 'mastery3' },
  { id: 'gold', slot: 'skin', name: 'Solid Gold', desc: 'A full set deserves a full gilding.', ach: 'fullSet' },
  { id: 'ghost', slot: 'skin', name: 'Ghost', desc: 'Translucent. Nothing touches you. Nothing ever did.', ach: 'untouchable' },
  { id: 'sunburnt', slot: 'skin', name: 'Sunburnt', desc: 'Too long in the shallows. Peeling, proud.', ach: 'mastery1' },
  { id: 'camo', slot: 'skin', name: 'Kelp Camo', desc: 'Blotched olive and kelp brown. Now you see me.', ach: 'mastery2' },
  // ---- swords
  { id: 'toothpick', slot: 'sword', name: 'Toothpick', desc: 'Birch, cork grip, cocktail frill. The original.' },
  { id: 'bamboo', slot: 'sword', name: 'Bamboo Shoot', desc: 'Green, jointed, sharpened to a point by patience.', ach: 'lineBreaker' },
  { id: 'chopstick', slot: 'sword', name: 'Lacquer Chopstick', desc: 'Stolen with the bread. Still has crumbs on it.', ach: 'breadThief' },
  { id: 'goldPick', slot: 'sword', name: 'Golden Pick', desc: 'A gilded toothpick with a ruby pommel. Tacky. Great.', ach: 'hoarder' },
  { id: 'sting', slot: 'sword', name: 'Jellyfish Sting', desc: 'A glowing barb that hums with venom.', ach: 'bossHunter' },
  // ---- scarves
  { id: 'none', slot: 'scarf', name: 'No Scarf', desc: 'Bare neck. Brave.' },
  { id: 'redScarf', slot: 'scarf', name: 'Red Ronin Scarf', desc: 'A long red scarf that never stops flowing.' },
  { id: 'cloak', slot: 'scarf', name: 'Tattered Cloak', desc: 'Worn by one who keeps their grudges close.', ach: 'grudgeHolder' },
  // ---- trails
  { id: 'bubbles', slot: 'trail', name: 'Bubbles', desc: 'The honest wake of a hard-working fish.' },
  { id: 'sparkles', slot: 'trail', name: 'Sparkles', desc: 'Set sail and leave a little glitter behind.', ach: 'setSail' },
  { id: 'ink', slot: 'trail', name: 'Ink', desc: 'Dark wisps for a fish who has cleared a lot of waves.', ach: 'waveBreaker' },
  { id: 'hearts', slot: 'trail', name: 'Hearts', desc: 'Every parcel sent home with love.', ach: 'postal' },
  { id: 'embers', slot: 'trail', name: 'Embers', desc: 'A hundred battles still smoulder behind you.', ach: 'butcher' },
];
export const COSMETIC: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const DEFAULT_LOOK: Look = { hat: 'kasa', skin: 'pink', sword: 'toothpick', trail: 'bubbles', scarf: 'redScarf' };
export const bySlot = (s: Slot) => COSMETICS.filter((c) => c.slot === s);

export function owned(id: string): boolean {
  const d = COSMETIC[id];
  return !!d && (!d.ach || META.cosmetics.unlocked.includes(id));
}
export function equippedLook(): Look {
  const e = META.cosmetics.equipped as Partial<Look>;
  const out = { ...DEFAULT_LOOK };
  for (const s of SLOTS) { const id = e[s]; if (id && COSMETIC[id]?.slot === s && owned(id)) out[s] = id; }
  return out;
}
/** bumps whenever the equipped look changes: rigs re-dress when they see a new number */
export let lookVersion = 1;
export function equip(id: string): boolean {
  const d = COSMETIC[id];
  if (!d || !owned(id)) return false;
  (META.cosmetics.equipped as Look)[d.slot] = id;
  saveMeta();
  lookVersion++;
  return true;
}
/** unlock a cosmetic (achievements call this); true if it was new */
export function unlockCosmetic(id: string): boolean {
  if (!COSMETIC[id] || META.cosmetics.unlocked.includes(id)) return false;
  META.cosmetics.unlocked.push(id);
  saveMeta();
  return true;
}

// ------------------------------------------------------------------ the gear.ts look hooks
let active: Look | null = null;
const lookNow = () => active ?? equippedLook();
/** run fn (a BlobModel.setGear rebuild) while `look` decides what the hat / sword show */
export function withLook<T>(look: Look, fn: () => T): T {
  const prev = active; active = look;
  try { return fn(); } finally { active = prev; }
}
let installed = false;
export function installCosmetics() {
  if (installed) return;
  installed = true;
  GEAR_LOOK.hat = (id) => {
    const want = lookNow().hat;
    if (id === 'none' || want === 'kasa') return id;
    return want as HatId;
  };
  GEAR_LOOK.weapon = (id) => {
    const want = lookNow().sword;
    return id === 'toothpick' && want !== 'toothpick' ? swordSkin(want) : null;
  };
}
