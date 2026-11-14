// Items: every tool, material, trinket and ability core the blobfish can carry, their merge recipes and the
// item system that turns the backpack grid into stats + gameplay hooks.
//
//   getItem('scissors')                       the def (name, shape, stats, hooks...)
//   tryMerge(a, b)                            'level' (same item levels up) | result id (recipe) | null
//   rollItem(run.rng, 'loot', stats.luck)     a random item id from a pool, rarer with luck
//   installItemSystem(run)                    recompute run.statFn + item hooks from the 5x5 grid (call after
//                                             every backpack change; the backpack screen does it on close)
//   itemIcon(id, level)                       painted pixel-art canvas, 32 px per grid cell
//   itemMesh(id, level)                       the icon extruded into a voxel object (0.5 m per cell)
//   setBonuses(run)                           build sets: tag counts + active 2/4/6 tiers (mage, warrior, ...)
//   skillLevels(run) / skillIcon(skillId)     levels + icons of the skills granted by placed items
//
// Builds: items carry archetype tags (mage, warrior, summoner, tinkerer, rogue) and element tags (fire, frost,
// shock, poison, water). Placed items of a tag stack into set bonuses at 2 / 4 / 6 (SETS below; stats here,
// special effects read stats.sets in src/skills and src/player). `skill` grants an active skill (src/skills),
// `gear` dresses the blobfish (weapon / armor / hat / back, see src/player/gear.ts).
//
// Only items placed in the grid (gx >= 0) count. Items with an `adj` rule also look at their grid neighbours,
// so arranging the bag matters (gems next to the anglerfish lantern, tools around the tackle box...).
// Hooks receive the event data the dive fires: 'hit' {target,dmg}, 'kill' {kind,x,y}, 'lineSnap' {x,y,how},
// 'baitStolen' {bait}, 'hooked' {}, 'hurt' {dmg}, 'dash' {}, 'tick' {dt}, 'enterNode' {type}. When an item
// does something visible it fires run.fire('proc', { id, text, x?, y? }) so the dive can pop floating text.
import type * as THREE from 'three';
import { BASE_STATS, Run, type AbilityId, type ItemInst, type Stats } from './run';
import type { Rng } from '../core/rng';
import { paintIcon } from '../backpack/icons';
import { voxelMesh } from '../backpack/voxel';

export type ItemKind = 'tool' | 'material' | 'trinket' | 'ability' | 'weapon' | 'armor';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Cell = [number, number];

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** occupied cells relative to the origin (x right, y down) */
  shape: Cell[];
  rarity: Rarity;
  desc: string;
  maxLevel: number;
  stats?: (s: Stats, level: number) => void;
  hook?: (run: Run, inst: ItemInst) => void;
  grants?: AbilityId;
  /** extra rules text for hooks/adjacency, shown on the item tag */
  note?: (level: number) => string;
  /** bonus from grid neighbours (edge-adjacent items) */
  adj?: (s: Stats, level: number, near: ItemDef[]) => void;
  tags?: string[];
  /** never rolled as loot: only made by merging */
  craftOnly?: boolean;
  /** voxel thickness multiplier for itemMesh */
  thick?: number;
  /** glows in the dark (emissive voxel material) */
  glow?: number;
  /** material look for the voxel mesh */
  look?: 'gem' | 'metal' | 'soft' | 'glass' | 'wood';
  /** active skill granted while placed (SKILLS id in src/skills) */
  skill?: string;
  /** what the blobfish wears while it's placed (src/player/gear.ts ids) */
  gear?: { weapon?: string; armor?: string; hat?: string; back?: string };
  /** stack cap per placed instance (materials: STACK_DEFAULT unless set; gear never stacks) */
  stack?: number;
}

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<Rarity, string> = { common: '#d8d2c4', uncommon: '#7fe07a', rare: '#5ab8ff', epic: '#d07aff', legendary: '#ffb63a' };
const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, uncommon: 28, rare: 10, epic: 3.5, legendary: 1 };

const chance = (p: number) => Math.random() < p;
const heal = (run: Run, n: number) => { const m = run.stats().maxHp; const h0 = run.hp; run.hp = Math.min(m, run.hp + n); return run.hp > h0; };
const proc = (run: Run, id: string, text: string, d: Record<string, unknown> = {}) => run.fire('proc', { id, text, x: d.x, y: d.y });
const count = (near: ItemDef[], f: (d: ItemDef) => boolean) => near.filter(f).length;
const isGem = (d: ItemDef) => !!d.tags?.includes('gem');

// ------------------------------------------------------------------ the item table
const DEFS: ItemDef[] = [
  // ---------------------------------------------------------------- materials
  { id: 'lineScrap', name: 'Line Scrap', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, thick: 0.6, look: 'soft',
    desc: 'A snarl of snapped fishing line. Still smells of worm.' },
  { id: 'rustyHook', name: 'Rusty Hook', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'metal', tags: ['metal'],
    desc: 'Pried from a cheek. Not yours. Probably.' },
  { id: 'leadShot', name: 'Split Shot', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'metal', tags: ['metal'],
    desc: 'Tiny lead pellets. Heavy for their size, like you.', stats: (s) => { s.reelResist += 0.02; } },
  { id: 'cork', name: 'Cork', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'soft',
    desc: 'Floaty, squeaky, faintly of wine.', stats: (s) => { s.speed += 0.08; } },
  { id: 'kelp', name: 'Kelp Frond', kind: 'material', shape: [[0, 0], [0, 1]], rarity: 'common', maxLevel: 1, stack: 3, thick: 0.6, look: 'soft',
    desc: 'Rubbery, salty, endlessly useful. Do not eat. Okay, a little.' },
  { id: 'pearl', name: 'Giant Pearl', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1, look: 'gem', tags: ['gem'],
    desc: 'An oyster spent years on this. Too big to spend: Mr. Crab will not take it.', stats: (s) => { s.luck += 0.25; } },
  { id: 'coralShard', name: 'Coral Shard', kind: 'material', shape: [[0, 0], [0, 1], [1, 1]], rarity: 'common', maxLevel: 1, stack: 3,
    desc: 'A snapped branch of fire coral. Polyps still waving.' },
  { id: 'seaGlass', name: 'Sea Glass', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'glass', tags: ['gem'],
    desc: 'Bottle shards the sea sanded into candy.' },
  { id: 'rustyNail', name: 'Rusty Nail', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'metal', tags: ['metal'],
    desc: 'Fell off a pier. Tetanus not included.' },
  { id: 'doubloon', name: 'Gold Doubloon', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1, look: 'metal', tags: ['metal', 'gem'],
    desc: 'Pirate money. The skull winks if you stare.', stats: (s) => { s.luck += 0.2; } },
  { id: 'copperOre', name: 'Copper Nugget', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'metal', tags: ['metal'],
    desc: 'Warm, ruddy, a little green round the gills.' },
  { id: 'ironOre', name: 'Iron Chunk', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, look: 'metal', tags: ['metal'],
    desc: 'Rock with ambitions of becoming an anchor.' },
  { id: 'riverStone', name: 'Grey Pebble', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1,
    desc: 'Smooth, cool, deeply unremarkable. You love it.', stats: (s) => { s.armor += 0.01; } },
  { id: 'amethyst', name: 'Amethyst', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1, look: 'gem', tags: ['gem'],
    desc: 'Purple spikes that hum when nobody listens.', stats: (s) => { s.luck += 0.15; } },
  { id: 'emerald', name: 'Emerald', kind: 'material', shape: [[0, 0]], rarity: 'rare', maxLevel: 1, look: 'gem', tags: ['gem'],
    desc: 'Step-cut and smug about it.', stats: (s) => { s.luck += 0.3; } },
  { id: 'goldNugget', name: 'Gold Nugget', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1, look: 'metal', tags: ['metal', 'gem'],
    desc: 'Lumpy, heavy and gloriously shiny.', stats: (s) => { s.luck += 0.2; } },
  { id: 'aquamarine', name: 'Aquamarine', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1, look: 'gem', tags: ['gem'],
    desc: 'Seawater that forgot how to slosh.', stats: (s) => { s.luck += 0.15; } },
  { id: 'ruby', name: 'Ruby', kind: 'material', shape: [[0, 0]], rarity: 'rare', maxLevel: 1, look: 'gem', tags: ['gem'],
    desc: 'Hot to the touch. Volcano-born, pocket-raised.', stats: (s) => { s.luck += 0.3; } },
  { id: 'abyssCrystal', name: 'Abyssal Crystal', kind: 'material', shape: [[0, 0], [0, 1]], rarity: 'epic', maxLevel: 1, stack: 2, look: 'gem', tags: ['gem', 'mage'], glow: 1.4,
    desc: 'It glows. It whispers. It is probably fine.', stats: (s) => { s.luck += 0.5; s.magnet += 0.3; } },
  { id: 'sharkTooth', name: 'Shark Tooth', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1,
    desc: 'Sharks lose thirty thousand of these. This one is yours now.' },
  { id: 'driftwood', name: 'Driftwood', kind: 'material', shape: [[0, 0], [1, 0]], rarity: 'common', maxLevel: 1, stack: 3, look: 'wood',
    desc: 'Sea-bleached and silky. Smells like a beach holiday.' },
  { id: 'glassLens', name: 'Cracked Lens', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1, look: 'glass',
    desc: 'Fell out of a fisherman\'s spectacles. He is squinting now.' },
  { id: 'urchinSpine', name: 'Urchin Spines', kind: 'material', shape: [[0, 0]], rarity: 'common', tags: ['poison'], maxLevel: 1, thick: 0.7,
    desc: 'A prickly bouquet. Handle with fins.' },

  // ---------------------------------------------------------------- tools (fishing gear turned buffs)
  { id: 'scissors', name: 'Rusty Scissors', kind: 'tool', shape: [[0, 0], [1, 0]], rarity: 'uncommon', maxLevel: 3, look: 'metal', tags: ['metal', 'rogue'],
    desc: 'Snip snip. Fishing line\'s worst nightmare.', stats: (s, l) => { s.lineCut += 0.6 * l; },
    note: () => 'Cutting a line: 30% chance of a coin',
    hook: (run, it) => run.on('lineSnap', (d) => { if (d.how === 'cut' && chance(0.3)) { run.coins++; proc(run, it.id, '+1 coin', d); } }) },
  { id: 'whetstone', name: 'Whetstone', kind: 'tool', shape: [[0, 0], [1, 0]], rarity: 'uncommon', tags: ['warrior'], maxLevel: 3,
    desc: 'Grind your toothpick to a terrifying point.', stats: (s, l) => { s.swordDmg += 0.4 * l; } },
  { id: 'leadSinker', name: 'Lead Sinker', kind: 'tool', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, look: 'metal', tags: ['metal', 'warrior'],
    desc: 'Dead weight. Reels groan when they lift you.', stats: (s, l) => { s.reelResist += 0.1 * l; s.speed -= 0.15; } },
  { id: 'corkBobber', name: 'Cork Bobber', kind: 'tool', shape: [[0, 0], [0, 1]], rarity: 'uncommon', tags: ['water'], maxLevel: 3, look: 'soft',
    desc: 'Bob along faster than the fish who notice you.', stats: (s, l) => { s.speed += 0.45 * l; s.accel += 2 * l; } },
  { id: 'luckyLure', name: 'Lucky Lure', kind: 'tool', shape: [[0, 0], [1, 0]], rarity: 'rare', tags: ['rogue'], maxLevel: 3, look: 'metal',
    desc: 'A gold crankbait with a knowing wink.', stats: (s, l) => { s.luck += 1 * l; },
    note: (l) => `Stealing bait: ${20 * l}% chance of +2 coins`,
    hook: (run, it) => run.on('baitStolen', (d) => { if (chance(0.2 * (it.level || 1))) { run.coins += 2; proc(run, it.id, 'Lucky! +2', d); } }) },
  { id: 'reelGear', name: 'Reel Gear', kind: 'tool', shape: [[0, 0]], rarity: 'rare', maxLevel: 3, look: 'metal', tags: ['metal', 'tinkerer'],
    desc: 'Brass cog from a busted reel. Makes your swings go brrr.', stats: (s, l) => { s.swordRate += 0.35 * l; } },
  { id: 'grappleHook', name: 'Grapple Hook', kind: 'tool', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'epic', maxLevel: 3, look: 'metal', tags: ['metal', 'tinkerer'],
    desc: 'Hook the hookers. Climb the line. Sort of.', stats: (s, l) => { s.struggle += 0.25 * l; s.reelResist += 0.06 * l; },
    note: (l) => `Snapping a line on a rock: ${25 * l}% chance to heal`,
    hook: (run, it) => run.on('lineSnap', (d) => { if (d.how === 'rock' && chance(0.25 * (it.level || 1)) && heal(run, 1)) proc(run, it.id, 'Patched up!', d); }) },
  { id: 'netShard', name: 'Net Shard', kind: 'tool', shape: [[0, 0], [1, 0], [0, 1]], rarity: 'rare', tags: ['tinkerer'], maxLevel: 3, thick: 0.6, look: 'soft',
    desc: 'A torn bit of trawl net. Sweeps loot your way.', stats: (s, l) => { s.magnet += 0.8 * l; },
    note: (l) => `Kills: ${15 * l}% chance of a coin`,
    hook: (run, it) => run.on('kill', (d) => { if (chance(0.15 * (it.level || 1))) { run.coins++; proc(run, it.id, '+1 coin', d); } }) },
  { id: 'tackleBox', name: 'Tackle Box', kind: 'tool', shape: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], rarity: 'epic', maxLevel: 3, look: 'metal', tags: ['metal', 'tinkerer'],
    desc: 'A dented green box of pure organisation.', stats: (s, l) => { s.armor += 0.05 * l; },
    note: (l) => `+${(0.12 * l).toFixed(2)} swings/s per touching tool`,
    adj: (s, l, near) => { s.swordRate += 0.12 * l * count(near, (d) => d.kind === 'tool'); } },
  { id: 'rodTip', name: 'Rod Tip', kind: 'tool', shape: [[0, 0], [0, 1], [0, 2]], rarity: 'rare', maxLevel: 3, thick: 0.7, look: 'wood',
    desc: 'Snapped off a carbon rod. Tape it to your toothpick.', stats: (s, l) => { s.swordReach += 0.18 * l; } },
  { id: 'pliers', name: 'Needle Pliers', kind: 'tool', shape: [[0, 0], [1, 0]], rarity: 'rare', maxLevel: 3, look: 'metal', tags: ['metal', 'tinkerer'],
    desc: 'Pinch, twist, snap. A surgeon of line.', stats: (s, l) => { s.lineCut += 0.4 * l; s.swordDmg += 0.2 * l; } },
  { id: 'spinnerSpoon', name: 'Spinner Spoon', kind: 'tool', shape: [[0, 0]], rarity: 'rare', maxLevel: 3, look: 'metal', tags: ['metal'],
    desc: 'Flash flash flash. Shiny things drift closer.', stats: (s, l) => { s.luck += 0.5 * l; s.magnet += 0.3 * l; } },
  { id: 'filletKnife', name: 'Fillet Knife', kind: 'tool', shape: [[0, 0], [1, 0], [2, 0]], rarity: 'epic', maxLevel: 3, look: 'metal', tags: ['metal', 'rogue', 'warrior'], craftOnly: true,
    desc: 'They brought it for you. Ironic.', stats: (s, l) => { s.swordDmg += 0.8 * l; s.swordReach += 0.1 * l; } },
  { id: 'harpoonTip', name: 'Harpoon Head', kind: 'tool', shape: [[0, 0], [0, 1]], rarity: 'epic', maxLevel: 3, look: 'metal', tags: ['metal', 'warrior', 'tinkerer'],
    desc: 'Barbed iron on a stub of oar. Dash like you mean it.', stats: (s, l) => { s.swordDmg += 0.5 * l; s.swordReach += 0.12 * l; s.dashPower += 1 * l; } },
  { id: 'wormCan', name: "Can o' Worms", kind: 'tool', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, look: 'soft',
    desc: 'Opened. Regretted. Still snacking.', stats: (s, l) => { s.biteHeal += 1 * l; } },
  { id: 'lineSpool', name: 'Line Spool', kind: 'tool', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3,
    desc: 'Forty metres of stolen monofilament. Tug of war, anyone?', stats: (s, l) => { s.struggle += 0.2 * l; } },

  // ---------------------------------------------------------------- trinkets
  { id: 'bottleCap', name: 'Lucky Bottle Cap', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, look: 'metal', tags: ['metal'],
    desc: 'Under the cap it says WINNER. You believe it.', stats: (s, l) => { s.luck += 0.7 * l; },
    note: () => '+0.3 luck per touching trinket',
    adj: (s, _l, near) => { s.luck += 0.3 * count(near, (d) => d.kind === 'trinket'); } },
  { id: 'rubberDuck', name: 'Rubber Duck', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', tags: ['summoner'], maxLevel: 3, look: 'soft',
    desc: 'It floats. It squeaks. It believes in you.', stats: (s, l) => { s.pressureResist += 0.2 * l; },
    note: (l) => `Getting hurt: ${10 * l}% chance the duck heals you`,
    hook: (run, it) => run.on('hurt', (d) => { if (chance(0.1 * (it.level || 1)) && heal(run, 1)) proc(run, it.id, 'SQUEAK!', d); }) },
  { id: 'bottleMessage', name: 'Message in a Bottle', kind: 'trinket', shape: [[0, 0], [1, 0]], rarity: 'rare', maxLevel: 3, look: 'glass',
    desc: '"X marks the spot." There are forty Xs.', stats: (s, l) => { s.luck += 0.3 * l; },
    note: (l) => `New area: 25% chance of +${2 * l} coins`,
    hook: (run, it) => run.on('enterNode', () => { if (chance(0.25)) { run.coins += 2 * (it.level || 1); proc(run, it.id, 'Treasure tip!'); } }) },
  { id: 'compass', name: "Captain's Compass", kind: 'trinket', shape: [[0, 0]], rarity: 'rare', maxLevel: 3, look: 'metal', tags: ['metal'],
    desc: 'Points to whatever you want most. Usually snacks.', stats: (s, l) => { s.speed += 0.2 * l; s.luck += 0.3 * l; } },
  { id: 'sharkNecklace', name: 'Shark Tooth Necklace', kind: 'trinket', shape: [[0, 0], [1, 0]], rarity: 'epic', tags: ['warrior'], maxLevel: 3,
    desc: 'Wear the bite you survived.', stats: (s, l) => { s.swordDmg += 0.3 * l; },
    note: (l) => `Kills: ${12 * l}% chance to heal half a heart`,
    hook: (run, it) => run.on('kill', (d) => { if (chance(0.12 * (it.level || 1)) && heal(run, 1)) proc(run, it.id, 'Chomp!', d); }) },
  { id: 'anglerLantern', name: 'Anglerfish Lantern', kind: 'trinket', shape: [[0, 0], [0, 1]], rarity: 'epic', tags: ['summoner', 'fire'], maxLevel: 3, glow: 1.2,
    desc: 'Borrowed from a very angry fish.', stats: (s, l) => { s.magnet += 0.6 * l; s.luck += 0.4 * l; },
    note: () => '+0.3 luck per touching gem',
    adj: (s, _l, near) => { s.luck += 0.3 * count(near, isGem); } },
  { id: 'mermaidScale', name: 'Mermaid Scale', kind: 'trinket', shape: [[0, 0]], rarity: 'rare', tags: ['water'], maxLevel: 3, look: 'gem',
    desc: 'Iridescent, slippery, suspiciously large.', stats: (s, l) => { s.armor += 0.06 * l; s.speed += 0.15 * l; } },
  { id: 'starfish', name: 'Lucky Starfish', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', tags: ['summoner', 'water'], maxLevel: 3, look: 'soft',
    desc: 'Grows back whatever it loses. Teaches you to, too.',
    note: (l) => `New area: heal ${l} half-heart${l > 1 ? 's' : ''}`,
    hook: (run, it) => run.on('enterNode', () => { if (heal(run, it.level || 1)) proc(run, it.id, 'Regrow!'); }) },
  { id: 'crabClaw', name: 'Crab Claw', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3,
    desc: 'The crab wants it back. The crab can wait.', stats: (s, l) => { s.lineCut += 0.35 * l; s.swordDmg += 0.15 * l; } },
  { id: 'oldBoot', name: 'Old Boot', kind: 'trinket', shape: [[0, 0], [0, 1], [1, 1]], rarity: 'rare', tags: ['warrior'], maxLevel: 3, look: 'soft',
    desc: 'The classic catch. Roomy, sturdy, mildly haunted.', stats: (s, l) => { s.maxHp += 2 * l; s.speed -= 0.3; } },
  { id: 'spiralShell', name: 'Spiral Shell', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', tags: ['water'], maxLevel: 3,
    desc: 'Hold it to your ear: someone is fishing.', stats: (s, l) => { s.armor += 0.07 * l; } },
  { id: 'teacup', name: 'Chipped Teacup', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3,
    desc: 'Fell off a yacht mid-sip. Very civilised.', stats: (s, l) => { s.maxHp += 1 * l; } },

  // ---------------------------------------------------------------- ability cores
  { id: 'pumiceHeart', name: 'Pumice Heart', kind: 'ability', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'legendary', tags: ['warrior', 'fire'], maxLevel: 3, grants: 'rockBody', glow: 0.9,
    desc: 'A stone heart with lava in its veins. Become the rock.', stats: (s, l) => { s.armor += 0.08 * l; s.maxHp += 2; } },
  { id: 'laserLens', name: 'Laser Pointer Lens', kind: 'ability', shape: [[0, 0], [0, 1]], rarity: 'epic', tags: ['mage', 'fire'], maxLevel: 3, grants: 'laserEyes', look: 'metal', glow: 0.6, craftOnly: true,
    desc: 'Cats fear it. Fishermen will too.' },
  { id: 'bubbleWand', name: 'Bubble Wand', kind: 'ability', shape: [[0, 0], [0, 1]], rarity: 'rare', tags: ['mage', 'water'], maxLevel: 3, grants: 'bubbleShield', look: 'glass',
    desc: 'Blow one big bubble and hide inside it.' },
  { id: 'inkSac', name: 'Squid Ink Sac', kind: 'ability', shape: [[0, 0]], rarity: 'rare', tags: ['rogue'], maxLevel: 3, grants: 'inkCloud', look: 'soft',
    desc: 'Squeeze for instant mystery.' },
  { id: 'eelBattery', name: 'Eel Battery', kind: 'ability', shape: [[0, 0], [1, 0]], rarity: 'rare', tags: ['mage', 'shock'], maxLevel: 3, grants: 'zap', look: 'metal', glow: 0.5,
    desc: 'Fully charged. Zero safety warnings.' },
  { id: 'pufferSpines', name: 'Puffer Spines', kind: 'ability', shape: [[0, 0]], rarity: 'rare', tags: ['rogue', 'poison'], maxLevel: 3, grants: 'puff', look: 'soft',
    desc: 'Inflate. Spike. Regret nothing.' },
  { id: 'lodestone', name: 'Lodestone', kind: 'ability', shape: [[0, 0]], rarity: 'rare', maxLevel: 3, grants: 'magnet', look: 'metal', tags: ['metal', 'tinkerer'],
    desc: 'Hooks, nails and coins simply adore it.', stats: (s, l) => { s.magnet += 1 * l; },
    note: () => '+0.4 pull per touching metal item',
    adj: (s, _l, near) => { s.magnet += 0.4 * count(near, (d) => !!d.tags?.includes('metal')); } },
  { id: 'sailFin', name: 'Sailfish Fin', kind: 'ability', shape: [[0, 0], [0, 1]], rarity: 'rare', tags: ['rogue', 'water'], maxLevel: 3, grants: 'dash', thick: 0.6,
    desc: 'Fastest fin in the sea, slightly used.', stats: (s, l) => { s.dashPower += 1.5 * l; s.speed += 0.2 * l; } },

  // ================================================================ v2 builds
  // ---------------------------------------------------------------- new materials (resource nodes, wave drops)
  { id: 'manaCrystal', name: 'Mana Crystal', kind: 'material', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 1, look: 'gem', tags: ['gem', 'mage'], glow: 0.9,
    desc: 'A shard of frozen moonlight. It hums in your fins.', stats: (s) => { s.maxMana += 3; } },
  { id: 'scrap', name: 'Scrap Metal', kind: 'material', shape: [[0, 0], [1, 0]], rarity: 'common', maxLevel: 1, look: 'metal', tags: ['metal', 'tinkerer'],
    desc: 'Bent bits of boat. A tinkerer sees a turret.' },
  { id: 'seashell', name: 'Seashell', kind: 'material', shape: [[0, 0]], rarity: 'common', maxLevel: 1, tags: ['water'],
    desc: 'A perfect little cockle. Somebody used to live here.' },

  // ---------------------------------------------------------------- mage: mana crystals, wands, staff, spellbooks, robes
  { id: 'apprenticeWand', name: 'Apprentice Wand', kind: 'weapon', shape: [[0, 0], [1, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['mage'], look: 'wood', glow: 0.8,
    skill: 'manaBolt', gear: { weapon: 'wand' },
    desc: 'Driftwood, a mana crystal and some optimism. Shoots sparkles. Hard ones.', stats: (s, l) => { s.spellPower += 0.12 * l; s.maxMana += 4; } },
  { id: 'coralStaff', name: 'Coral Staff', kind: 'weapon', shape: [[0, 0], [0, 1], [0, 2]], rarity: 'rare', maxLevel: 3, tags: ['mage', 'fire'], look: 'wood', glow: 1,
    skill: 'magmaOrb', gear: { weapon: 'staff' },
    desc: 'Fire coral grown round a magma pearl. Warm to hold.', stats: (s, l) => { s.spellPower += 0.22 * l; s.manaRegen += 0.5 * l; } },
  { id: 'frostTome', name: 'Tome of Brine Frost', kind: 'tool', shape: [[0, 0], [0, 1]], rarity: 'rare', maxLevel: 3, tags: ['mage', 'frost'], look: 'soft',
    skill: 'frostNova', desc: 'Pages of pressed sea-ice. Do not lick.', stats: (s, l) => { s.maxMana += 5 * l; } },
  { id: 'stormTome', name: 'Eel-Skin Grimoire', kind: 'tool', shape: [[0, 0], [0, 1]], rarity: 'epic', maxLevel: 3, tags: ['mage', 'shock'], look: 'soft', glow: 0.5,
    skill: 'chainZap', desc: 'Bound in eel leather. It crackles when opened. Your hair would stand up, if you had any.', stats: (s, l) => { s.spellPower += 0.18 * l; } },
  { id: 'bubblePipe', name: 'Bubble Pipe', kind: 'tool', shape: [[0, 0], [1, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['mage', 'water'],
    skill: 'bubbleBarrage', desc: 'Carved from a whelk. Blows bubbles hard enough to hurt.', stats: (s, l) => { s.manaRegen += 0.4 * l; } },
  { id: 'kelpRobe', name: 'Kelpweave Robe', kind: 'armor', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'rare', maxLevel: 3, tags: ['mage'], look: 'soft', thick: 0.6,
    gear: { armor: 'robe' }, desc: 'Woven from enchanted kelp. Smells faintly of miso.', stats: (s, l) => { s.maxMana += 8 * l; s.manaRegen += 0.6 * l; s.armor += 0.03 * l; } },
  { id: 'wizardHat', name: 'Starry Wizard Hat', kind: 'armor', shape: [[0, 0], [0, 1]], rarity: 'rare', maxLevel: 3, tags: ['mage'], look: 'soft',
    gear: { hat: 'wizardHat' }, desc: 'Pointy. Very pointy. Stars sold separately.', stats: (s, l) => { s.spellPower += 0.12 * l; s.cdr += 0.04 * l; } },
  { id: 'manaGeode', name: 'Mana Geode', kind: 'trinket', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'epic', maxLevel: 3, tags: ['mage', 'gem'], look: 'gem', glow: 1.3,
    desc: 'Crack it open and the inside is all glow.', stats: (s, l) => { s.maxMana += 12; s.manaRegen += 0.8 * l; },
    note: () => '+0.4 Mana/s per touching mage item', adj: (s, _l, near) => { s.manaRegen += 0.4 * count(near, (d) => !!d.tags?.includes('mage')); } },

  // ---------------------------------------------------------------- warrior: swords, armour, shields, helmets
  { id: 'cutlass', name: 'Sunken Cutlass', kind: 'weapon', shape: [[0, 0], [1, 0], [2, 0]], rarity: 'rare', maxLevel: 3, tags: ['warrior', 'metal'], look: 'metal',
    skill: 'whirlwind', gear: { weapon: 'sword' },
    desc: 'Pried from a skeleton captain. He said "arr". Sort of.', stats: (s, l) => { s.swordDmg += 0.6 * l; s.swordReach += 0.1; } },
  { id: 'bronzeBlade', name: 'Bronze Shortsword', kind: 'weapon', shape: [[0, 0], [1, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['warrior', 'metal'], look: 'metal',
    gear: { weapon: 'sword' }, desc: 'Greek, probably. Definitely sharp.', stats: (s, l) => { s.swordDmg += 0.4 * l; s.swordRate += 0.2 * l; } },
  { id: 'chainmail', name: 'Barnacle Chainmail', kind: 'armor', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'rare', maxLevel: 3, tags: ['warrior', 'metal'], look: 'metal',
    gear: { armor: 'chainmail' }, desc: 'Rings of rusted steel, barnacles included free.', stats: (s, l) => { s.armor += 0.08 * l; s.maxHp += 2; s.speed -= 0.2; } },
  { id: 'turtleShell', name: 'Turtle Shell Plate', kind: 'armor', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'epic', maxLevel: 3, tags: ['warrior', 'summoner'],
    gear: { armor: 'shellPlate' }, desc: 'On loan from a turtle who no longer needs it. Do not ask.', stats: (s, l) => { s.armor += 0.1 * l; s.maxHp += 2 * l; s.speed -= 0.35; } },
  { id: 'clamShield', name: 'Clam Shield', kind: 'armor', shape: [[0, 0], [0, 1]], rarity: 'rare', maxLevel: 3, tags: ['warrior', 'water'],
    skill: 'shieldBash', desc: 'Half a giant clam. Bonk.', stats: (s, l) => { s.armor += 0.06 * l; } },
  { id: 'plumedHelm', name: 'Plumed Helm', kind: 'armor', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['warrior', 'metal'], look: 'metal',
    gear: { hat: 'helmet' }, desc: 'The plume is a sea pen. It is fine with this.', stats: (s, l) => { s.maxHp += 1 * l; s.armor += 0.03; } },
  { id: 'warConch', name: 'War Conch', kind: 'trinket', shape: [[0, 0], [1, 0]], rarity: 'rare', maxLevel: 3, tags: ['warrior'],
    skill: 'warCry', desc: 'Blow it and every fish for a mile gets brave. Or deaf.', stats: (s, l) => { s.swordDmg += 0.2 * l; } },
  { id: 'heroCape', name: "Captain's Cape", kind: 'armor', shape: [[0, 0], [0, 1]], rarity: 'rare', maxLevel: 3, tags: ['warrior'], look: 'soft', thick: 0.5,
    gear: { back: 'cape' }, desc: 'Billows dramatically. Underwater. Somehow.', stats: (s, l) => { s.dashPower += 1 * l; s.speed += 0.2 * l; } },

  // ---------------------------------------------------------------- summoner / toymaker
  { id: 'windUpMegalodon', name: 'Wind-Up Megalodon', kind: 'ability', shape: [[0, 0], [1, 0]], rarity: 'legendary', maxLevel: 3, tags: ['summoner'], look: 'metal',
    skill: 'megalodon', desc: 'A tin toy shark that smells of chum. Wind it up, let it go, and swim away. Fast.', stats: (s, l) => { s.summonPower += 0.1 * l; } },
  { id: 'piranhaJar', name: 'Piranha in a Jar', kind: 'ability', shape: [[0, 0], [0, 1]], rarity: 'rare', maxLevel: 3, tags: ['summoner'], look: 'glass',
    skill: 'piranhas', desc: 'They have not eaten in days. Open with the lid facing AWAY.' },
  { id: 'petCrab', name: 'Pet Crab', kind: 'ability', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['summoner'],
    skill: 'petCrab', desc: 'His name is Gerald. He will snip for you.' },
  { id: 'octopusPal', name: 'Octopus Ink Pal', kind: 'ability', shape: [[0, 0], [1, 0]], rarity: 'rare', maxLevel: 3, tags: ['summoner', 'rogue'], look: 'soft',
    skill: 'inkPal', desc: 'Eight arms, three hearts, one very messy hug.' },
  { id: 'tideTrident', name: 'Tidecaller Trident', kind: 'weapon', shape: [[0, 0], [0, 1], [0, 2]], rarity: 'rare', maxLevel: 3, tags: ['summoner', 'water'], look: 'metal',
    gear: { weapon: 'trident' }, desc: 'Three prongs, one for each wish. Fish follow it like a conductor\'s baton.', stats: (s, l) => { s.summonPower += 0.15 * l; s.swordReach += 0.25; s.swordDmg += 0.3 * l; } },
  { id: 'brassKey', name: 'Brass Wind-Up Key', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['summoner', 'metal'], look: 'metal',
    desc: 'Fits every toy. Fits the sea, if you turn it hard enough.', stats: (s, l) => { s.summonPower += 0.15 * l; },
    note: () => '+4% Haste per touching summoner item', adj: (s, _l, near) => { s.cdr += 0.04 * count(near, (d) => !!d.tags?.includes('summoner')); } },
  { id: 'chumBucket', name: 'Chum Bucket', kind: 'tool', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['summoner'], look: 'metal',
    desc: 'Smells unbelievably bad. Your pets adore it.', stats: (s, l) => { s.summonPower += 0.2 * l; s.biteHeal += 1; } },
  { id: 'tideCrown', name: 'Tiny Tide Crown', kind: 'armor', shape: [[0, 0]], rarity: 'epic', maxLevel: 3, tags: ['summoner', 'gem'], look: 'metal',
    gear: { hat: 'crown' }, desc: 'King of the tide pool. The anemones bow.', stats: (s, l) => { s.summonPower += 0.25 * l; s.luck += 0.5 * l; } },
  { id: 'toyPack', name: "Toymaker's Pack", kind: 'armor', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'rare', maxLevel: 3, tags: ['summoner', 'tinkerer'], look: 'soft',
    gear: { back: 'pack' }, desc: 'Twelve pockets, every one full of tiny screwdrivers.', stats: (s, l) => { s.summonPower += 0.1 * l; s.gadgetPower += 0.1 * l; s.magnet += 0.6; } },

  // ---------------------------------------------------------------- tinkerer: junk traps and turrets (wave defense)
  { id: 'junkTurret', name: 'Junk Turret Kit', kind: 'ability', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'rare', maxLevel: 3, tags: ['tinkerer', 'metal'], look: 'metal',
    skill: 'junkTurret', desc: 'A sardine can, a pipe and a car battery. What could go wrong?' },
  { id: 'netTrap', name: 'Net Trap', kind: 'ability', shape: [[0, 0], [1, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['tinkerer'], look: 'soft', thick: 0.6,
    skill: 'netTrap', desc: 'Their nets, your rules.' },
  { id: 'seaMine', name: 'Sea Mine', kind: 'ability', shape: [[0, 0]], rarity: 'rare', maxLevel: 3, tags: ['tinkerer', 'fire', 'metal'], look: 'metal',
    skill: 'seaMine', desc: 'Left over from a war nobody down here remembers. Still works.' },
  { id: 'harpoonBallista', name: 'Harpoon Ballista', kind: 'ability', shape: [[0, 0], [1, 0], [2, 0], [1, 1]], rarity: 'epic', maxLevel: 3, tags: ['tinkerer'], look: 'wood',
    skill: 'ballista', desc: "A whaler's harpoon gun on a driftwood sled. Turnabout is fair play." },
  { id: 'pipeWrench', name: 'Pipe Wrench', kind: 'weapon', shape: [[0, 0], [1, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['tinkerer', 'metal'], look: 'metal',
    gear: { weapon: 'wrench' }, desc: 'Fixes things. Also un-fixes divers.', stats: (s, l) => { s.swordDmg += 0.5 * l; s.gadgetPower += 0.15 * l; } },
  { id: 'brassGoggles', name: 'Brass Goggles', kind: 'armor', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['tinkerer', 'metal'], look: 'metal',
    gear: { hat: 'goggles' }, desc: 'See everything twice as clearly, and slightly orange.', stats: (s, l) => { s.gadgetPower += 0.15 * l; s.crit += 0.04 * l; } },
  { id: 'scubaTank', name: 'Scuba Tank', kind: 'armor', shape: [[0, 0], [0, 1]], rarity: 'rare', maxLevel: 3, tags: ['tinkerer'], look: 'metal',
    gear: { back: 'tank' }, desc: 'Air, for a fish. Ironic? Practical.', stats: (s, l) => { s.pressureResist += 0.25 * l; s.dashPower += 1 * l; s.speed += 0.15; } },
  { id: 'clockworkHeart', name: 'Clockwork Heart', kind: 'trinket', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], rarity: 'epic', maxLevel: 3, tags: ['tinkerer', 'summoner', 'metal'], look: 'metal',
    desc: 'Tick, tock. Everything you build lasts a little longer.', stats: (s, l) => { s.gadgetPower += 0.2 * l; s.summonPower += 0.2 * l; s.cdr += 0.06 * l; } },

  // ---------------------------------------------------------------- rogue: poison, ink, backstab
  { id: 'stingrayBarb', name: 'Stingray Barb', kind: 'weapon', shape: [[0, 0], [1, 0]], rarity: 'rare', maxLevel: 3, tags: ['rogue', 'poison'],
    skill: 'backstab', gear: { weapon: 'dagger' },
    desc: 'Serrated, venomous, and pointy at both ends of the argument.', stats: (s, l) => { s.crit += 0.06 * l; s.swordRate += 0.3 * l; s.poison += 0.4 * l; } },
  { id: 'venomVial', name: 'Lionfish Venom', kind: 'ability', shape: [[0, 0]], rarity: 'rare', maxLevel: 3, tags: ['rogue', 'poison'], look: 'glass', glow: 0.6,
    skill: 'poisonCloud', desc: 'Beautiful fish, terrible attitude. Bottled.', stats: (s, l) => { s.poison += 0.4 * l; } },
  { id: 'inkBomb', name: 'Ink Bomb', kind: 'ability', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['rogue'],
    skill: 'inkBomb', desc: "A squid's worst day, in a ball, with a fuse." },
  { id: 'shadowHood', name: 'Eel-Skin Hood', kind: 'armor', shape: [[0, 0]], rarity: 'rare', maxLevel: 3, tags: ['rogue'], look: 'soft',
    gear: { hat: 'hood' }, desc: 'Nobody sees you coming. You are still very pink, though.', stats: (s, l) => { s.crit += 0.05 * l; s.speed += 0.25 * l; } },
  { id: 'cutpursePouch', name: 'Cutpurse Pouch', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['rogue'], look: 'soft',
    desc: 'Not your coins. Not anymore.', stats: (s, l) => { s.luck += 0.4 * l; },
    note: (l) => `Kills: ${10 * l}% chance of a coin`,
    hook: (run, it) => run.on('kill', (d) => { if (chance(0.1 * (it.level || 1))) { run.coins++; proc(run, it.id, 'Yoink! +1', d); } }) },
  { id: 'boneDice', name: 'Bone Dice', kind: 'trinket', shape: [[0, 0]], rarity: 'uncommon', maxLevel: 3, tags: ['rogue'],
    desc: 'Carved from a fish ear-bone. Always rolls a six. Usually.', stats: (s, l) => { s.crit += 0.05 * l; s.luck += 0.2 * l; } },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(DEFS.map((d) => [d.id, d]));
export const ITEM_LIST: readonly ItemDef[] = DEFS;

export function getItem(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error('unknown item ' + id);
  return d;
}

// ------------------------------------------------------------------ recipes (order-independent pairs)
export interface Recipe { a: string; b: string; out: string; flavor?: string }
export const RECIPES: Recipe[] = [
  { a: 'rustyHook', b: 'lineScrap', out: 'grappleHook' },
  { a: 'glassLens', b: 'eelBattery', out: 'laserLens' },
  { a: 'seaGlass', b: 'seaGlass', out: 'glassLens' },
  { a: 'cork', b: 'lineScrap', out: 'corkBobber' },
  { a: 'leadShot', b: 'leadShot', out: 'leadSinker' },
  { a: 'lineScrap', b: 'lineScrap', out: 'lineSpool' },
  { a: 'copperOre', b: 'ironOre', out: 'reelGear' },
  { a: 'goldNugget', b: 'rustyHook', out: 'luckyLure' },
  { a: 'kelp', b: 'lineScrap', out: 'netShard' },
  { a: 'pearl', b: 'sharkTooth', out: 'sharkNecklace' },
  { a: 'coralShard', b: 'pearl', out: 'bubbleWand' },
  { a: 'kelp', b: 'amethyst', out: 'inkSac' },
  { a: 'copperOre', b: 'aquamarine', out: 'eelBattery' },
  { a: 'urchinSpine', b: 'urchinSpine', out: 'pufferSpines' },
  { a: 'ironOre', b: 'ironOre', out: 'lodestone' },
  { a: 'sharkTooth', b: 'kelp', out: 'sailFin' },
  { a: 'sharkTooth', b: 'driftwood', out: 'harpoonTip' },
  { a: 'riverStone', b: 'ruby', out: 'pumiceHeart' },
  { a: 'copperOre', b: 'seaGlass', out: 'compass' },
  { a: 'abyssCrystal', b: 'rustyHook', out: 'anglerLantern' },
  { a: 'riverStone', b: 'riverStone', out: 'whetstone' },
  { a: 'scissors', b: 'whetstone', out: 'filletKnife' },
  { a: 'scissors', b: 'rustyNail', out: 'pliers' },
  { a: 'goldNugget', b: 'rustyNail', out: 'spinnerSpoon' },
  { a: 'driftwood', b: 'lineScrap', out: 'rodTip' },
  { a: 'driftwood', b: 'rustyNail', out: 'tackleBox' },
  { a: 'pearl', b: 'pearl', out: 'mermaidScale' },
  { a: 'seaGlass', b: 'doubloon', out: 'bottleMessage' },
  { a: 'coralShard', b: 'coralShard', out: 'starfish' },
  // builds
  { a: 'manaCrystal', b: 'driftwood', out: 'apprenticeWand' },
  { a: 'manaCrystal', b: 'manaCrystal', out: 'manaGeode' },
  { a: 'apprenticeWand', b: 'coralShard', out: 'coralStaff' },
  { a: 'manaCrystal', b: 'kelp', out: 'kelpRobe' },
  { a: 'seaGlass', b: 'manaCrystal', out: 'frostTome' },
  { a: 'frostTome', b: 'eelBattery', out: 'stormTome' },
  { a: 'seashell', b: 'manaCrystal', out: 'bubblePipe' },
  { a: 'scrap', b: 'scrap', out: 'bronzeBlade' },
  { a: 'bronzeBlade', b: 'sharkTooth', out: 'cutlass' },
  { a: 'scrap', b: 'rustyHook', out: 'chainmail' },
  { a: 'seashell', b: 'seashell', out: 'clamShield' },
  { a: 'seashell', b: 'spiralShell', out: 'warConch' },
  { a: 'scrap', b: 'ironOre', out: 'plumedHelm' },
  { a: 'scrap', b: 'reelGear', out: 'brassKey' },
  { a: 'brassKey', b: 'sharkTooth', out: 'windUpMegalodon' },
  { a: 'seaGlass', b: 'sharkTooth', out: 'piranhaJar' },
  { a: 'seashell', b: 'urchinSpine', out: 'petCrab' },
  { a: 'inkSac', b: 'kelp', out: 'octopusPal' },
  { a: 'scrap', b: 'copperOre', out: 'junkTurret' },
  { a: 'netShard', b: 'leadShot', out: 'netTrap' },
  { a: 'scrap', b: 'urchinSpine', out: 'seaMine' },
  { a: 'harpoonTip', b: 'driftwood', out: 'harpoonBallista' },
  { a: 'scrap', b: 'rustyNail', out: 'pipeWrench' },
  { a: 'glassLens', b: 'copperOre', out: 'brassGoggles' },
  { a: 'reelGear', b: 'brassKey', out: 'clockworkHeart' },
  { a: 'harpoonTip', b: 'seashell', out: 'tideTrident' },
  { a: 'urchinSpine', b: 'sharkTooth', out: 'stingrayBarb' },
  { a: 'urchinSpine', b: 'seaGlass', out: 'venomVial' },
  { a: 'inkSac', b: 'leadShot', out: 'inkBomb' },
];

export function recipeFor(a: string, b: string): Recipe | null {
  for (const r of RECIPES) if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r;
  return null;
}

/** what dropping b onto a makes: 'level' (same item levels up), a recipe result id, or null.
 *  Stacks never fuse (a recipe would eat the whole stack) and same-id materials stack instead (see stackOnto). */
export function tryMerge(a: ItemInst, b: ItemInst): string | 'level' | null {
  if (a.uid === b.uid) return null;
  if ((a.n ?? 1) > 1 || (b.n ?? 1) > 1) return null;
  if (a.id === b.id && stackCap(a.id) > 1) return null;
  const r = recipeFor(a.id, b.id);
  if (r) return r.out;
  if (a.id === b.id) {
    const d = ITEMS[a.id];
    if (d && (a.level || 1) < d.maxLevel && (b.level || 1) < d.maxLevel) return 'level';
  }
  return null;
}

/** the item a merge produces (id + level) */
export function mergeResult(a: ItemInst, b: ItemInst): { id: string; level: number } | null {
  const m = tryMerge(a, b);
  if (!m) return null;
  if (m === 'level') return { id: a.id, level: Math.min(getItem(a.id).maxLevel, (a.level || 1) + (b.level || 1)) };
  const out = getItem(m);
  return { id: m, level: Math.max(1, Math.min(out.maxLevel, Math.min(a.level || 1, b.level || 1))) };
}

/** every recipe that uses this item, for hints */
export function recipesWith(id: string): Recipe[] { return RECIPES.filter((r) => r.a === id || r.b === id); }

// ------------------------------------------------------------------ stacks (v3: materials take pack space, same ones stack per cell group)
/** default stack cap for materials without their own `stack` */
export const STACK_DEFAULT = 5;
/** how many of an item one placed instance can hold (1 = doesn't stack: gear, trinkets...) */
export function stackCap(id: string): number {
  const d = ITEMS[id];
  if (!d || d.kind !== 'material') return 1;
  return Math.max(1, d.stack ?? STACK_DEFAULT);
}
/** how many more of `id` the instance can take */
export function stackRoom(a: ItemInst): number { return Math.max(0, stackCap(a.id) - (a.n ?? 1)); }
/** move as much of stack b onto stack a as fits (same id); returns how many moved. b.n is reduced (0 = empty) */
export function stackOnto(a: ItemInst, b: ItemInst): number {
  if (a.uid === b.uid || a.id !== b.id) return 0;
  const k = Math.min(stackRoom(a), b.n ?? 1);
  if (k <= 0) return 0;
  a.n = (a.n ?? 1) + k;
  b.n = (b.n ?? 1) - k;
  return k;
}
/** every item id in a list of instances, stacks expanded (for result cards / tallies) */
export function expandIds(items: ItemInst[]): string[] {
  const out: string[] = [];
  for (const it of items) for (let k = 0; k < (it.n ?? 1); k++) out.push(it.id);
  return out;
}

// ------------------------------------------------------------------ loot
export type Pool = 'any' | 'loot' | 'shop' | 'boss' | 'material' | ItemKind | readonly string[] | ((d: ItemDef) => boolean);

function poolDefs(pool: Pool): ItemDef[] {
  if (typeof pool === 'function') return DEFS.filter(pool);
  if (Array.isArray(pool)) return (pool as readonly string[]).map((id) => ITEMS[id]).filter(Boolean);
  const rollable = DEFS.filter((d) => !d.craftOnly);
  switch (pool) {
    case 'any': return rollable;
    case 'loot': return rollable.filter((d) => d.kind !== 'ability' || d.rarity !== 'legendary');
    case 'shop': return rollable.filter((d) => d.kind !== 'material' || d.rarity !== 'common');
    case 'boss': return rollable.filter((d) => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary');
    default: return rollable.filter((d) => d.kind === pool);
  }
}

/** pick an item id from a pool, weighted by rarity; luck shifts the odds toward rarer things */
export function rollItem(rng: Rng, pool: Pool = 'loot', luck = 0): string {
  const defs = poolDefs(pool);
  if (!defs.length) return 'lineScrap';
  const L = Math.max(-2, luck);
  return rng.weighted(defs, (d) => {
    const r = RARITY_ORDER.indexOf(d.rarity);
    return RARITY_WEIGHT[d.rarity] * Math.max(0.15, 1 + L * 0.22 * (r - 1));
  }).id;
}

// ------------------------------------------------------------------ grid geometry
export const GRID = 5;

/** shape cells after `rot` clockwise quarter turns, normalised to start at 0,0 */
export function rotCells(shape: Cell[], rot: number): Cell[] {
  let cs = shape.map(([x, y]) => [x, y] as Cell);
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cs = cs.map(([x, y]) => [-y, x] as Cell);
  const mx = Math.min(...cs.map((c) => c[0])), my = Math.min(...cs.map((c) => c[1]));
  return cs.map(([x, y]) => [x - mx, y - my] as Cell);
}
export function shapeSize(shape: Cell[]): { w: number; h: number } {
  return { w: Math.max(...shape.map((c) => c[0])) + 1, h: Math.max(...shape.map((c) => c[1])) + 1 };
}
/** grid cells an instance covers */
export function instCells(it: ItemInst, rot = it.rot, gx = it.gx, gy = it.gy): Cell[] {
  return rotCells(getItem(it.id).shape, rot).map(([x, y]) => [gx + x, gy + y] as Cell);
}
/** 5x5 occupancy: uid per cell (0 = empty) */
export function occupancy(items: ItemInst[], skipUid = -1): number[][] {
  const g = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
  for (const it of items) {
    if (it.gx < 0 || it.uid === skipUid || !ITEMS[it.id]) continue;
    for (const [x, y] of instCells(it)) if (x >= 0 && y >= 0 && x < GRID && y < GRID) g[y][x] = it.uid;
  }
  return g;
}
export function fits(items: ItemInst[], it: ItemInst, gx: number, gy: number, rot: number): boolean {
  const occ = occupancy(items, it.uid);
  for (const [x, y] of instCells(it, rot, gx, gy)) {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID || occ[y][x]) return false;
  }
  return true;
}
/** first free spot for an item (any rotation), or null */
export function findSpot(items: ItemInst[], it: ItemInst, prefer?: { gx: number; gy: number; rot: number }): { gx: number; gy: number; rot: number } | null {
  if (prefer && fits(items, it, prefer.gx, prefer.gy, prefer.rot)) return prefer;
  const rots = prefer ? [prefer.rot, (prefer.rot + 1) % 4, (prefer.rot + 2) % 4, (prefer.rot + 3) % 4] : [it.rot, (it.rot + 1) % 4, (it.rot + 2) % 4, (it.rot + 3) % 4];
  const cands: { gx: number; gy: number; rot: number; d: number }[] = [];
  for (const rot of rots) for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (!fits(items, it, gx, gy, rot)) continue;
    cands.push({ gx, gy, rot, d: prefer ? Math.hypot(gx - prefer.gx, gy - prefer.gy) + (rot !== prefer.rot ? 0.5 : 0) : gy * GRID + gx });
  }
  cands.sort((a, b) => a.d - b.d);
  return cands[0] ?? null;
}
/** items edge-adjacent to `it` in the grid */
export function neighbours(items: ItemInst[], it: ItemInst): ItemInst[] {
  if (it.gx < 0) return [];
  const occ = occupancy(items);
  const out = new Set<number>();
  for (const [x, y] of instCells(it)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
    const u = occ[ny][nx];
    if (u && u !== it.uid) out.add(u);
  }
  return items.filter((i) => out.has(i.uid));
}

// ------------------------------------------------------------------ the item system
const STAT_CLAMP = (s: Stats) => {
  s.cdr = Math.min(0.6, Math.max(0, s.cdr ?? 0));
  s.crit = Math.min(0.75, Math.max(0, s.crit ?? 0));
  s.maxMana = Math.max(0, Math.round(s.maxMana ?? 20));
  s.reelResist = Math.min(0.8, Math.max(0, s.reelResist));
  s.armor = Math.min(0.6, Math.max(0, s.armor));
  s.pressureResist = Math.min(1, Math.max(0, s.pressureResist));
  s.speed = Math.max(2.5, s.speed);
  s.swordRate = Math.min(8, s.swordRate);
  s.maxHp = Math.max(2, Math.round(s.maxHp));
};

// ------------------------------------------------------------------ build sets (tags stack into bonuses at 2 / 4 / 6)
export interface SetTier { n: number; text: string; stats?: (s: Stats) => void }
export interface SetDef { tag: string; name: string; color: string; kind: 'build' | 'element'; tiers: SetTier[] }
export const SETS: Record<string, SetDef> = {
  mage: { tag: 'mage', name: 'Tidecaller', color: '#a88aff', kind: 'build', tiers: [
    { n: 2, text: '+10 Mana, +1 Mana/s', stats: (s) => { s.maxMana += 10; s.manaRegen += 1; } },
    { n: 4, text: '+25% Spell Power, spells cost 20% less', stats: (s) => { s.spellPower += 0.25; } },
    { n: 6, text: '30% of spells are free, +2 Mana/s', stats: (s) => { s.manaRegen += 2; } },
  ] },
  warrior: { tag: 'warrior', name: 'Reefguard', color: '#ff8a5a', kind: 'build', tiers: [
    { n: 2, text: '+1 Heart, +5% Armor', stats: (s) => { s.maxHp += 2; s.armor += 0.05; } },
    { n: 4, text: '+0.5 Sword Dmg, warrior skills +20%', stats: (s) => { s.swordDmg += 0.5; } },
    { n: 6, text: 'Spin attacks unleash a shockwave, +10% Armor', stats: (s) => { s.armor += 0.1; } },
  ] },
  summoner: { tag: 'summoner', name: 'Toymaker', color: '#ffc04a', kind: 'build', tiers: [
    { n: 2, text: '+20% Summon Power', stats: (s) => { s.summonPower += 0.2; } },
    { n: 4, text: '+20% Summon Power, summons recharge 15% faster', stats: (s) => { s.summonPower += 0.2; } },
    { n: 6, text: '+40% Summon Power, summons recharge 20% faster again', stats: (s) => { s.summonPower += 0.4; } },
  ] },
  tinkerer: { tag: 'tinkerer', name: 'Junkwright', color: '#d8b070', kind: 'build', tiers: [
    { n: 2, text: '+20% Gadget Power', stats: (s) => { s.gadgetPower += 0.2; } },
    { n: 4, text: '+30% Gadget Power, +10% Haste', stats: (s) => { s.gadgetPower += 0.3; s.cdr += 0.1; } },
    { n: 6, text: 'Traps and turrets recharge 35% faster' },
  ] },
  rogue: { tag: 'rogue', name: 'Inkblade', color: '#b070ff', kind: 'build', tiers: [
    { n: 2, text: '+8% Crit', stats: (s) => { s.crit += 0.08; } },
    { n: 4, text: 'Hits poison (1/s), +1.5 Dash, rogue skills recharge 15% faster', stats: (s) => { s.poison += 1; s.dashPower += 1.5; } },
    { n: 6, text: 'Crits deal x3; dashing through enemies backstabs them', stats: (s) => { s.crit += 0.05; } },
  ] },
  fire: { tag: 'fire', name: 'Magma', color: '#ff7a30', kind: 'element', tiers: [
    { n: 2, text: '+10% Spell and Gadget Power', stats: (s) => { s.spellPower += 0.1; s.gadgetPower += 0.1; } },
    { n: 4, text: '+20% Spell and Gadget Power', stats: (s) => { s.spellPower += 0.2; s.gadgetPower += 0.2; } },
  ] },
  frost: { tag: 'frost', name: 'Brine Frost', color: '#8ae0ff', kind: 'element', tiers: [
    { n: 2, text: '+5% Armor', stats: (s) => { s.armor += 0.05; } },
    { n: 4, text: '+1 Heart, +5% Armor', stats: (s) => { s.maxHp += 2; s.armor += 0.05; } },
  ] },
  shock: { tag: 'shock', name: 'Stormbound', color: '#c8f4ff', kind: 'element', tiers: [
    { n: 2, text: '+0.3 Swing Rate', stats: (s) => { s.swordRate += 0.3; } },
    { n: 4, text: '+10% Haste', stats: (s) => { s.cdr += 0.1; } },
  ] },
  poison: { tag: 'poison', name: 'Venomous', color: '#8aff5a', kind: 'element', tiers: [
    { n: 2, text: 'Hits poison (0.5/s)', stats: (s) => { s.poison += 0.5; } },
    { n: 4, text: 'Hits poison (+1/s), +5% Crit', stats: (s) => { s.poison += 1; s.crit += 0.05; } },
  ] },
  water: { tag: 'water', name: 'Tidal', color: '#5ac8ff', kind: 'element', tiers: [
    { n: 2, text: '+0.4 Speed', stats: (s) => { s.speed += 0.4; } },
    { n: 4, text: '+0.6 Speed, +1 Mana/s', stats: (s) => { s.speed += 0.6; s.manaRegen += 1; } },
  ] },
};
export const SET_ORDER = ['mage', 'warrior', 'summoner', 'tinkerer', 'rogue', 'fire', 'frost', 'shock', 'poison', 'water'];

/** how many placed items carry each set tag */
export function setCounts(items: ItemInst[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    if (it.gx < 0) continue;
    const d = ITEMS[it.id]; if (!d?.tags) continue;
    for (const t of d.tags) if (SETS[t]) out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}
export interface SetState { tag: string; name: string; color: string; kind: 'build' | 'element'; count: number; tier: number; next: number | null; tiers: (SetTier & { active: boolean })[] }
/** every set the run has at least one item of: count, active tier (0/2/4/6), the next threshold */
export function setBonuses(run: Run | ItemInst[]): SetState[] {
  const counts = setCounts(Array.isArray(run) ? run : run.items);
  return SET_ORDER.filter((t) => counts[t]).map((t) => {
    const d = SETS[t], c = counts[t];
    const tier = d.tiers.filter((x) => c >= x.n).reduce((m, x) => Math.max(m, x.n), 0);
    return { tag: t, name: d.name, color: d.color, kind: d.kind, count: c, tier, next: d.tiers.find((x) => x.n > c)?.n ?? null, tiers: d.tiers.map((x) => ({ ...x, active: c >= x.n })) };
  }).sort((a, b) => b.count - a.count);
}

const RANK = (d: ItemDef, l: number) => RARITY_ORDER.indexOf(d.rarity) * 10 + l;

/** apply every placed item's stats (and adjacency bonuses), set bonuses, granted skills and gear */
export function applyItems(base: Stats, items: ItemInst[]): Stats {
  const s = base;
  s.skills = s.skills ?? []; s.sets = s.sets ?? {}; s.gear = s.gear ?? {};
  const placed = items.filter((i) => i.gx >= 0 && ITEMS[i.id]).sort((a, b) => a.gy - b.gy || a.gx - b.gx);
  const gearRank: Record<string, number> = {};
  for (const it of placed) {
    const d = ITEMS[it.id], l = it.level || 1;
    d.stats?.(s, l);
    if (d.adj) d.adj(s, l, neighbours(placed, it).map((n) => ITEMS[n.id]));
    if (d.grants && !s.abilities.includes(d.grants)) s.abilities.push(d.grants);
    if (d.skill && !s.skills.includes(d.skill)) s.skills.push(d.skill);
    if (d.gear) for (const [slot, id] of Object.entries(d.gear)) {
      const r = RANK(d, l);
      if (id && r > (gearRank[slot] ?? -1)) { gearRank[slot] = r; s.gear[slot] = id; }
    }
  }
  for (const st of setBonuses(placed)) {
    s.sets[st.tag] = st.tier;
    for (const t of st.tiers) if (t.active) t.stats?.(s);
  }
  STAT_CLAMP(s);
  return s;
}

/** highest level of each skill granted by placed items */
export function skillLevels(run: Run): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of run.items) {
    const d = ITEMS[it.id];
    if (it.gx < 0 || !d) continue;
    const id = d.skill ?? d.grants;
    if (id) out[id] = Math.max(out[id] ?? 0, it.level || 1);
  }
  return out;
}
/** the item that grants a skill (for icons / tooltips) */
export function skillItem(skillId: string): ItemDef | null { return DEFS.find((d) => d.skill === skillId) ?? DEFS.find((d) => d.grants === skillId) ?? null; }
/** a skill's icon: the granting item's painted icon */
export function skillIcon(skillId: string): HTMLCanvasElement | null { const d = skillItem(skillId); return d ? itemIcon(d.id) : null; }

/** highest level of each granted ability among placed cores (abilities scale with it) */
export function abilityLevels(run: Run): Partial<Record<AbilityId, number>> {
  const out: Partial<Record<AbilityId, number>> = {};
  for (const it of run.items) {
    const d = ITEMS[it.id];
    if (it.gx < 0 || !d?.grants) continue;
    out[d.grants] = Math.max(out[d.grants] ?? 0, it.level || 1);
  }
  return out;
}

const installed = new WeakMap<Run, Set<(data: Record<string, unknown>) => void>>();

/** recompute run.statFn and the item hooks from the items placed in the grid */
export function installItemSystem(run: Run) {
  // remove the hooks we registered last time (other systems' listeners stay)
  const prev = installed.get(run);
  if (prev) for (const [ev, l] of run.hooks) run.hooks.set(ev, l.filter((fn) => !prev.has(fn)));
  const before = new Set<(data: Record<string, unknown>) => void>();
  for (const l of run.hooks.values()) for (const fn of l) before.add(fn);
  for (const it of run.items) {
    if (it.gx < 0) continue;
    const d = ITEMS[it.id];
    d?.hook?.(run, it);
  }
  const mine = new Set<(data: Record<string, unknown>) => void>();
  for (const l of run.hooks.values()) for (const fn of l) if (!before.has(fn)) mine.add(fn);
  installed.set(run, mine);
  // cached: the dive may call run.stats() every frame; recompute only when the bag or the base changes
  let key = '', cached: Stats | null = null;
  run.statFn = (base, r) => {
    let k = JSON.stringify(base);
    for (const it of r.items) if (it.gx >= 0) k += `|${it.id}:${it.gx},${it.gy},${it.rot},${it.level || 1}`;
    if (k !== key || !cached) { key = k; cached = applyItems({ ...base, abilities: [...base.abilities], skills: [...(base.skills ?? [])], sets: { ...(base.sets ?? {}) }, gear: { ...(base.gear ?? {}) } }, r.items); }
    return { ...cached, abilities: [...cached.abilities], skills: [...cached.skills], sets: { ...cached.sets }, gear: { ...cached.gear } };
  };
  const m = run.stats().maxHp;
  if (run.hp > m) run.hp = m;
}

// ------------------------------------------------------------------ stat text for item tags
export const STAT_LABEL: Partial<Record<keyof Stats, [string, number]>> = {
  maxHp: ['Max HP', 0], speed: ['Speed', 2], accel: ['Accel', 0], dashPower: ['Dash', 1], swordDmg: ['Sword Dmg', 2],
  swordReach: ['Reach', 2], swordRate: ['Swing Rate', 2], lineCut: ['Line Cut', 2], struggle: ['Struggle', 2],
  reelResist: ['Reel Resist', 0], pressureResist: ['Pressure', 0], luck: ['Luck', 2], magnet: ['Pull', 1], armor: ['Armor', 0], biteHeal: ['Bite Heal', 0],
  maxMana: ['Mana', 0], manaRegen: ['Mana/s', 1], spellPower: ['Spell Power', 0], summonPower: ['Summon Power', 0], gadgetPower: ['Gadget Power', 0],
  crit: ['Crit', 0], cdr: ['Haste', 0], poison: ['Poison/s', 1],
};
const PCT = new Set<keyof Stats>(['reelResist', 'pressureResist', 'armor', 'spellPower', 'summonPower', 'gadgetPower', 'crit', 'cdr']);

export interface StatLine { key: keyof Stats | 'ability' | 'note' | 'skill'; text: string; good: boolean }

/** human-readable stat lines for one item at a level (diffs its stats against the base) */
export function statLines(id: string, level = 1): StatLine[] {
  const d = getItem(id);
  const out: StatLine[] = [];
  if (d.stats) {
    const s: Stats = { ...BASE_STATS, abilities: [], skills: [], sets: {}, gear: {} };
    d.stats(s, level);
    for (const k of Object.keys(STAT_LABEL) as (keyof Stats)[]) {
      const diff = (s[k] as number) - (BASE_STATS[k] as number);
      if (Math.abs(diff) < 1e-6) continue;
      const [label, dec] = STAT_LABEL[k]!;
      let v: string;
      if (PCT.has(k)) v = `${Math.round(diff * 100)}%`;
      else if (k === 'maxHp' || k === 'biteHeal') v = `${diff / 2 === Math.round(diff / 2) ? diff / 2 : (diff / 2).toFixed(1)} ${Math.abs(diff) === 2 ? 'heart' : 'hearts'}`;
      else v = diff.toFixed(dec).replace(/\.?0+$/, '') || '0';
      out.push({ key: k, text: `${diff > 0 ? '+' : ''}${v} ${label}`, good: diff > 0 });
    }
  }
  if (d.grants) out.push({ key: 'ability', text: `Grants ${ABILITY_NAME[d.grants]}`, good: true });
  if (d.skill) out.push({ key: 'skill', text: `Skill: ${SKILL_NAMES[d.skill] ?? d.skill}`, good: true });
  if (d.note) out.push({ key: 'note', text: d.note(level), good: true });
  return out;
}

/** display names of the skills items grant (the full defs live in src/skills/registry.ts) */
export const SKILL_NAMES: Record<string, string> = {
  manaBolt: 'Mana Volley', frostNova: 'Frost Nova', chainZap: 'Chain Lightning', magmaOrb: 'Magma Orb', bubbleBarrage: 'Bubble Barrage',
  whirlwind: 'Whirlwind', shieldBash: 'Clam Bash', warCry: 'Conch War Cry', megalodon: 'Wind-Up Megalodon', piranhas: 'Piranha Jar', petCrab: 'Pet Crab',
  inkPal: 'Octopus Pal', junkTurret: 'Junk Turret', netTrap: 'Net Trap', seaMine: 'Sea Mine', ballista: 'Harpoon Ballista', backstab: 'Backstab',
  poisonCloud: 'Venom Cloud', inkBomb: 'Ink Bomb',
};

export const ABILITY_NAME: Record<AbilityId, string> = {
  rockBody: 'Rock Body', laserEyes: 'Laser Eyes', bubbleShield: 'Bubble Shield', inkCloud: 'Ink Cloud', zap: 'Zap', puff: 'Puff', magnet: 'Magnet', dash: 'Dash',
};

// ------------------------------------------------------------------ art
const iconCache = new Map<string, HTMLCanvasElement>();
/** painted pixel-art icon: 32 px per cell of the (unrotated) shape */
export function itemIcon(id: string, level = 1): HTMLCanvasElement {
  const key = id + '|' + level;
  let c = iconCache.get(key);
  if (!c) { c = ICON_TILE[id] ? tiledIcon(getItem(id), level) : paintIcon(getItem(id), level); iconCache.set(key, c); }
  return c;
}

/**
 * v3 gave some materials bigger shapes than their painters were drawn for (1 cell). Until the icon painter draws
 * them at the new size, their 1-cell art is tiled into every cell of the new shape (a little heap: alternate
 * cells mirrored). Remove an id here once src/backpack/icons.ts paints it natively at its shape.
 */
export const ICON_TILE: Record<string, true> = {};
function tiledIcon(d: ItemDef, level: number): HTMLCanvasElement {
  const one = paintIcon({ ...d, shape: [[0, 0]] }, level);
  const { w, h } = shapeSize(d.shape);
  const cv = document.createElement('canvas');
  cv.width = w * 32; cv.height = h * 32;
  const x = cv.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  d.shape.forEach(([cx, cy], i) => {
    x.save();
    if (i % 2) { x.translate(cx * 32 + 32, cy * 32); x.scale(-1, 1); x.drawImage(one, 0, 0); }
    else x.drawImage(one, cx * 32, cy * 32);
    x.restore();
  });
  return cv;
}

/** metres per grid cell for itemMesh (world pickups use it as-is; the backpack scales it to its pockets) */
export const ITEM_CELL_M = 0.5;

/** the icon extruded into a voxel object, centred, facing +z, 0.5 m per cell; rare items sparkle */
export function itemMesh(id: string, level = 1): THREE.Object3D {
  return voxelMesh(getItem(id), level, itemIcon(id, level));
}
