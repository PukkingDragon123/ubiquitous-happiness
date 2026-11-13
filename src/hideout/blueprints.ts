// The hideout BLUEPRINTS catalog: cosy furniture, lights, decor and functional stations, their footprints on the
// floor grid, material costs (item ids of kind 'material'), unlock rules and the perks stations grant.
//
//   BLUEPRINTS.sofa                      the def
//   isUnlocked('forge')                  unlock rule met (or listed in META.unlockedBlueprints)
//   stationsBuilt()                      ids of functional stations currently built in the hideout
//   stationPerks()                       { unlocks: item ids, perks: text[], arch: archetypes with a station }
//   defaultLayout()                      the starting placements (core furniture)
import { META, saveMeta, type Placement } from '../meta/meta';
import { ITEMS } from '../game/items';

export type BpCat = 'core' | 'cozy' | 'light' | 'decor' | 'station';
export type Arch = 'mage' | 'warrior' | 'summoner' | 'tinkerer' | 'rogue' | 'any';

export interface Blueprint {
  id: string;
  name: string;
  desc: string;
  cat: BpCat;
  /** footprint in cells at rot 0 (w along x, d along z); the front faces +z */
  size: [number, number];
  cost: Record<string, number>;
  /** can be moved but never removed (the TV, the chest, the bench, the locker, the sofa) */
  core?: boolean;
  /** must stand with its back against a wall */
  wall?: boolean;
  /** floor layer (rugs): other furniture can stand on it */
  floor?: boolean;
  /** only one may be built */
  unique?: boolean;
  /** what clicking it does in the hideout */
  use?: 'tv' | 'storage' | 'workshop' | 'locker' | 'sofa' | 'trophy' | 'music' | 'poke';
  /** functional station: archetype + perk text + item ids it unlocks for runs and the workshop */
  station?: { arch: Arch; perk: string; unlocks?: string[] };
  /** unlock rule: 'start' (default), 'runs:N', 'wins:N', 'extract:N', 'mastery:N', 'nemesis:N', 'deaths:N' */
  unlock?: string;
}

const B = (b: Blueprint) => b;
const LIST: Blueprint[] = [
  // ---------------------------------------------------------------- core (the starting hideout)
  B({ id: 'tv', name: 'CRT Television', cat: 'core', size: [2, 1], core: true, unique: true, use: 'tv', cost: { copperOre: 4, glassLens: 2, rustyNail: 6 },
    desc: 'A fat old tube TV on a fish crate. Click it to plan a run.' }),
  B({ id: 'sofa', name: 'Squashy Sofa', cat: 'core', size: [2, 1], core: true, unique: true, use: 'sofa', cost: { kelp: 6, driftwood: 4, cork: 4 },
    desc: 'Mustard corduroy, sagging in exactly your shape.' }),
  B({ id: 'storage', name: 'Sea Chest', cat: 'core', size: [2, 1], core: true, unique: true, use: 'storage', cost: { driftwood: 6, rustyNail: 4, ironOre: 2 },
    desc: 'Everything the manatees mailed home. Click to browse the stash.' }),
  B({ id: 'workbench', name: 'Workbench', cat: 'core', size: [2, 1], core: true, unique: true, use: 'workshop', wall: true, cost: { driftwood: 8, ironOre: 4, rustyNail: 6 },
    desc: 'Vise, pegboard, a jar of screws. Craft and upgrade gear here.' }),
  B({ id: 'locker', name: 'Gear Locker', cat: 'core', size: [1, 1], core: true, unique: true, use: 'locker', wall: true, cost: { ironOre: 6, rustyNail: 4, rustyHook: 3 },
    desc: 'Where you suit up before every run.' }),
  // ---------------------------------------------------------------- cosy
  B({ id: 'rug', name: 'Persian Rug', cat: 'cozy', size: [4, 3], floor: true, cost: { kelp: 4, lineScrap: 6 },
    desc: 'Hand-knotted, salt-faded, fished out of a wreck.' }),
  B({ id: 'rugBlue', name: 'Indigo Runner', cat: 'cozy', size: [2, 3], floor: true, cost: { kelp: 3, lineScrap: 4 },
    desc: 'A long blue rug. Hides the scorch mark.' }),
  B({ id: 'armchair', name: 'Leather Armchair', cat: 'cozy', size: [1, 1], cost: { driftwood: 3, sharkTooth: 1, kelp: 3 }, use: 'poke',
    desc: 'Cracked oxblood leather and a dent from a long nap.' }),
  B({ id: 'coffeeTable', name: 'Coffee Table', cat: 'cozy', size: [1, 1], cost: { driftwood: 3, rustyNail: 2 },
    desc: 'With a mug of kelp tea that never goes cold.' }),
  B({ id: 'bookshelf', name: 'Bookshelf', cat: 'cozy', size: [2, 1], wall: true, cost: { driftwood: 6, lineScrap: 4 },
    desc: 'Soggy paperbacks, a jar of pearls, a shell collection.' }),
  B({ id: 'plant', name: 'Potted Sea Fern', cat: 'cozy', size: [1, 1], cost: { coralShard: 2, kelp: 2, riverStone: 1 },
    desc: 'Thrives on neglect and the TV glow.' }),
  B({ id: 'aquarium', name: 'Aquarium', cat: 'cozy', size: [2, 1], cost: { seaGlass: 6, glassLens: 1, kelp: 2, copperOre: 1 }, use: 'poke', unlock: 'runs:1',
    desc: 'A fish tank. Inside a cave. Under the sea. Do not ask.' }),
  B({ id: 'bunk', name: 'Bunk Bed', cat: 'cozy', size: [2, 1], wall: true, cost: { driftwood: 8, kelp: 6, rustyNail: 4 }, unlock: 'runs:2',
    station: { arch: 'any', perk: 'Well rested: start each run with +1 half heart' },
    desc: 'Top bunk for you, bottom bunk for the sock pile.' }),
  B({ id: 'recordPlayer', name: 'Record Player', cat: 'cozy', size: [1, 1], cost: { copperOre: 2, pearl: 1, driftwood: 2 }, use: 'music',
    desc: 'Click to change the hideout record.' }),
  B({ id: 'stove', name: 'Pot-Belly Stove', cat: 'light', size: [1, 1], cost: { ironOre: 6, copperOre: 2 }, unlock: 'runs:1',
    desc: 'How is it lit down here? Volcanic coal. Obviously.' }),
  B({ id: 'fridge', name: 'Snack Fridge', cat: 'cozy', size: [1, 1], wall: true, cost: { ironOre: 3, seaGlass: 2, copperOre: 2 }, use: 'poke',
    station: { arch: 'any', perk: 'Snacks: eating bait heals a little more' },
    desc: 'Plankton yoghurt and one suspicious sandwich.' }),
  B({ id: 'beanbag', name: 'Bean Bag', cat: 'cozy', size: [1, 1], cost: { kelp: 4, cork: 6 }, use: 'poke',
    desc: 'Stuffed with cork. Squeaks when you flop.' }),
  // ---------------------------------------------------------------- lights
  B({ id: 'lamp', name: 'Floor Lamp', cat: 'light', size: [1, 1], cost: { copperOre: 2, kelp: 1, glassLens: 1 },
    desc: 'A fringed shade and a warm bulb.' }),
  B({ id: 'candles', name: 'Candle Cluster', cat: 'light', size: [1, 1], cost: { cork: 2, lineScrap: 1 },
    desc: 'Wax drips on a crate. Very moody.' }),
  B({ id: 'lavaLamp', name: 'Lava Lamp', cat: 'light', size: [1, 1], cost: { seaGlass: 2, amethyst: 1, copperOre: 1 }, unlock: 'extract:2',
    desc: 'Purple goo rising and falling forever.' }),
  B({ id: 'jellyLantern', name: 'Jelly Lantern', cat: 'light', size: [1, 1], cost: { seaGlass: 2, pearl: 1 }, unlock: 'runs:1',
    desc: 'A sleepy moon jelly in a jar. Glows when it dreams.' }),
  // ---------------------------------------------------------------- decor
  B({ id: 'trophyWall', name: 'Nemesis Wall', cat: 'decor', size: [2, 1], wall: true, unique: true, use: 'trophy', cost: { driftwood: 3, rustyHook: 4, lineScrap: 3 }, unlock: 'deaths:1',
    desc: 'Wanted posters of every human with a grudge. String and pins.' }),
  B({ id: 'painting', name: 'Oil Painting', cat: 'decor', size: [1, 1], wall: true, cost: { driftwood: 1, coralShard: 1 },
    desc: 'A dignified portrait of you. Commissioned. From you.' }),
  B({ id: 'shipWheel', name: "Ship's Wheel", cat: 'decor', size: [1, 1], wall: true, cost: { driftwood: 4, doubloon: 1 },
    desc: 'Pried off a wreck. Spins nicely.' }),
  B({ id: 'anchor', name: 'Old Anchor', cat: 'decor', size: [1, 1], cost: { ironOre: 5 },
    desc: 'Barnacled, heavy and a great coat hook.' }),
  B({ id: 'treasure', name: 'Doubloon Pile', cat: 'decor', size: [1, 1], cost: { doubloon: 8, goldNugget: 2 }, unlock: 'wins:1',
    desc: 'Purely to sit on. Like a dragon. A wet dragon.' }),
  B({ id: 'helmet', name: 'Diving Helmet', cat: 'decor', size: [1, 1], cost: { copperOre: 4, glassLens: 2, doubloon: 1 }, unlock: 'nemesis:1',
    desc: 'Taken from a diver who will not be needing it.' }),
  // ---------------------------------------------------------------- functional stations
  B({ id: 'manaAltar', name: 'Mana Crystal Altar', cat: 'station', size: [1, 1], unique: true, cost: { amethyst: 3, aquamarine: 2, riverStone: 4 },
    station: { arch: 'mage', perk: 'Mage gear can drop on runs; craft bubble wands', unlocks: ['bubbleWand', 'eelBattery', 'laserLens'] },
    desc: 'Crystals humming on a stone plinth. Bolts, frost and bubbles.' }),
  B({ id: 'forge', name: 'Forge & Anvil', cat: 'station', size: [2, 1], unique: true, cost: { ironOre: 8, copperOre: 4, riverStone: 6 },
    station: { arch: 'warrior', perk: 'Warrior gear can drop; upgrade blades here', unlocks: ['whetstone', 'filletKnife', 'harpoonTip'] },
    desc: 'Volcanic coals, bellows and a dented anvil.' }),
  B({ id: 'weaponRack', name: 'Weapon Rack', cat: 'station', size: [1, 1], wall: true, cost: { driftwood: 4, ironOre: 2, rustyHook: 2 },
    station: { arch: 'warrior', perk: 'Start runs with a spare toothpick (+sword damage)' },
    desc: 'Toothpicks, a fork, a very small trident.' }),
  B({ id: 'toyBench', name: 'Toy Workshop', cat: 'station', size: [2, 1], unique: true, cost: { cork: 6, driftwood: 4, copperOre: 3, pearl: 1 }, unlock: 'runs:1',
    station: { arch: 'summoner', perk: 'Summoner gear can drop: wind-up toys that summon friends', unlocks: ['rubberDuck', 'starfish'] },
    desc: 'Wind-up megalodons, tin crabs, a jar of springs.' }),
  B({ id: 'junkLathe', name: 'Junk Lathe', cat: 'station', size: [2, 1], unique: true, cost: { ironOre: 6, rustyNail: 8, copperOre: 4, lineScrap: 4 },
    station: { arch: 'tinkerer', perk: 'Tinkerer gear can drop: traps and turrets', unlocks: ['reelGear', 'pliers', 'tackleBox'] },
    desc: 'Turns reel parts and scrap into traps and turrets.' }),
  B({ id: 'inkStill', name: 'Ink Distillery', cat: 'station', size: [1, 1], unique: true, cost: { seaGlass: 4, kelp: 4, urchinSpine: 3 }, unlock: 'runs:1',
    station: { arch: 'rogue', perk: 'Rogue gear can drop: ink, poison, backstabs', unlocks: ['inkSac', 'pufferSpines'] },
    desc: 'Squid ink bubbling through copper coils.' }),
  B({ id: 'periscope', name: 'Periscope', cat: 'station', size: [1, 1], unique: true, cost: { copperOre: 4, glassLens: 2, rustyNail: 2 },
    station: { arch: 'any', perk: 'Scout: see each area’s first wave before it lands' },
    desc: 'Spy on the boats above without leaving the sofa.' }),
  B({ id: 'mailbox', name: 'Manatee Mailbox', cat: 'station', size: [1, 1], unique: true, cost: { driftwood: 2, copperOre: 2, kelp: 2 },
    station: { arch: 'any', perk: 'Express post: +1 extraction per area' },
    desc: 'The manatees love a proper mailbox.' }),
  B({ id: 'dummy', name: 'Training Dummy', cat: 'station', size: [1, 1], cost: { kelp: 3, driftwood: 2, lineScrap: 3 },
    station: { arch: 'warrior', perk: 'Practice: +5% sword damage' }, use: 'poke',
    desc: 'A sack of sand in a fisherman’s hat. Very satisfying.' }),
];

export const BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(LIST.map((b) => [b.id, b]));
export const BLUEPRINT_LIST: readonly Blueprint[] = LIST;
export const CATS: { id: BpCat; label: string }[] = [
  { id: 'cozy', label: 'COSY' }, { id: 'light', label: 'LIGHT' }, { id: 'decor', label: 'DECOR' }, { id: 'station', label: 'STATIONS' }, { id: 'core', label: 'CORE' },
];

/** a blueprint's cost with any unknown material ids dropped (materials may be renamed by other modules) */
export function costOf(bp: Blueprint): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(bp.cost)) if (ITEMS[k]) out[k] = v;
  return out;
}

function ruleMet(rule: string | undefined): boolean {
  if (!rule || rule === 'start') return true;
  const [k, n] = rule.split(':'); const v = Number(n);
  switch (k) {
    case 'runs': return META.runs >= v;
    case 'wins': return META.wins >= v;
    case 'deaths': return META.deaths >= v;
    case 'extract': return META.extractions >= v;
    case 'mastery': return META.masteryUnlocked >= v;
    case 'nemesis': return META.nemeses.length >= v;
  }
  return false;
}
export function unlockText(bp: Blueprint): string {
  const [k, n] = (bp.unlock ?? 'start').split(':');
  const N = Number(n), s = N === 1 ? '' : 's';
  switch (k) {
    case 'runs': return `Play ${N} run${s}`;
    case 'wins': return `Win ${N} run${s}`;
    case 'deaths': return `Get got ${N} time${s}`;
    case 'extract': return `Extract loot ${N} time${s}`;
    case 'mastery': return `Reach mastery ${N}`;
    case 'nemesis': return `Make a nemesis`;
  }
  return '';
}
export function isUnlocked(id: string): boolean {
  const bp = BLUEPRINTS[id];
  if (!bp) return false;
  if (META.unlockedBlueprints.includes(id)) return true;
  if (ruleMet(bp.unlock)) { META.unlockedBlueprints.push(id); saveMeta(); return true; }
  return false;
}

/** ids of functional stations currently built */
export function stationsBuilt(): string[] {
  const ids = new Set(META.built.map((p) => p.bp));
  return [...ids].filter((id) => BLUEPRINTS[id]?.station);
}
/** everything the built stations give: item ids unlocked for loot/crafting, perk lines, archetypes covered */
export function stationPerks(): { unlocks: string[]; perks: string[]; arch: Arch[] } {
  const unlocks = new Set<string>(), perks: string[] = [], arch = new Set<Arch>();
  for (const id of stationsBuilt()) {
    const s = BLUEPRINTS[id].station!;
    perks.push(`${BLUEPRINTS[id].name}: ${s.perk}`);
    arch.add(s.arch);
    for (const u of s.unlocks ?? []) if (ITEMS[u]) unlocks.add(u);
  }
  return { unlocks: [...unlocks], perks, arch: [...arch] };
}

// ------------------------------------------------------------------ the floor grid
export const GRID_W = 10, GRID_D = 8;
/** cells kept clear in front of the door (x = 0 wall) */
export const DOOR_CELLS: [number, number][] = [[0, 5], [0, 6], [1, 5], [1, 6]];
/** cells taken by fixed set dressing (the sea-vent stove in the back corner) */
export const FIXED_CELLS: [number, number][] = [[0, 0]];

export function footprint(bp: Blueprint, rot: number): [number, number] { return rot % 2 ? [bp.size[1], bp.size[0]] : [bp.size[0], bp.size[1]]; }
export function cellsOf(p: Placement): [number, number][] {
  const bp = BLUEPRINTS[p.bp]; if (!bp) return [];
  const [w, d] = footprint(bp, p.rot);
  const out: [number, number][] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([p.x + i, p.z + j]);
  return out;
}
/** grid cell -> world xz of the cell's corner */
export const cellX = (x: number) => x - GRID_W / 2;
export const cellZ = (z: number) => z - GRID_D / 2;
/** placement centre in world xz */
export function placementCentre(p: { bp: string; x: number; z: number; rot: number }): [number, number] {
  const bp = BLUEPRINTS[p.bp];
  const [w, d] = footprint(bp, p.rot);
  return [cellX(p.x) + w / 2, cellZ(p.z) + d / 2];
}

export function defaultLayout(): Placement[] {
  let uid = 1;
  const P = (bp: string, x: number, z: number, rot: number): Placement => ({ uid: uid++, bp, x, z, rot });
  return [
    P('tv', 4, 0, 0),
    P('rug', 3, 1, 0),
    P('sofa', 4, 3, 2),
    P('coffeeTable', 6, 2, 0),
    P('lamp', 6, 3, 0),
    P('storage', 0, 1, 1),
    P('locker', 0, 3, 1),
    P('workbench', 7, 0, 0),
    P('plant', 9, 0, 0),
    P('bookshelf', 1, 0, 0),
    P('armchair', 7, 2, 3),
    P('aquarium', 9, 3, 3),
  ];
}
export function ensureLayout() {
  if (!META.built.length) { META.built = defaultLayout(); saveMeta(); }
  // core furniture must always exist (older saves)
  for (const p of defaultLayout()) if (BLUEPRINTS[p.bp].core && !META.built.some((q) => q.bp === p.bp)) META.built.push({ ...p, uid: nextUid() });
}
export function nextUid() { return META.built.reduce((m, p) => Math.max(m, p.uid), 0) + 1; }
