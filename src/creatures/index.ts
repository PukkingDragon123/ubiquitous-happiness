// Creature registry for the world generator.
//
//   const e = spawnCreature('piranha', world, x, y);           // builds + world.add()s it, returns the Entity
//   CREATURES.filter((c) => c.biomes.includes('reef') && y >= c.depth[0] && y <= c.depth[1])
//
// depth = [minY, maxY] in world metres (surface is y = 0, so both are negative). rarity = relative spawn
// weight (1 common .. 0.05 very rare). group = how many to spawn together.
import type { Entity, World, Team } from '../game/types';
import { Piranha, Pufferfish, Moray, Barracuda, Jellyfish, Anglerfish, Crab } from './enemies';
import { SardineSchool, CleanerWrasse, SeaTurtle, HermitCrab } from './friends';
import { OldIchthy, MotherAngler } from './bosses';
import { ReefFish, Triggerfish, Predator, Stingray, Crawler } from './ambient';

export type Biome = 'reef' | 'kelp' | 'harbor' | 'arctic' | 'abyss' | 'sunset';

export interface CreatureInfo {
  kind: string;
  team: Team;
  depth: [number, number];
  biomes: Biome[];
  rarity: number;
  group?: [number, number];
  boss?: boolean;
  /** spawn on / near the seabed or rock (crabs, morays, stingrays) */
  floor?: boolean;
  desc: string;
}

export const CREATURES: CreatureInfo[] = [
  // enemies
  { kind: 'piranha', team: 'enemy', depth: [-14, -1.5], biomes: ['reef', 'kelp', 'sunset', 'harbor'], rarity: 1, group: [3, 6], desc: 'swarm biter: circles, then darts in one at a time' },
  { kind: 'pufferfish', team: 'enemy', depth: [-16, -2], biomes: ['reef', 'sunset', 'kelp'], rarity: 0.6, group: [1, 2], desc: 'inflates into a spiky ball when threatened' },
  { kind: 'moray', team: 'enemy', depth: [-30, -4], biomes: ['reef', 'kelp', 'harbor'], rarity: 0.45, floor: true, desc: 'hides in rock, lunges out' },
  { kind: 'barracuda', team: 'enemy', depth: [-20, -2], biomes: ['reef', 'sunset', 'harbor'], rarity: 0.4, desc: 'telegraphed straight-line torpedo dash' },
  { kind: 'jellyfish', team: 'enemy', depth: [-25, -1], biomes: ['reef', 'sunset', 'arctic', 'abyss', 'harbor'], rarity: 0.7, group: [1, 4], desc: 'drifting hazard: stings on touch' },
  { kind: 'anglerfish', team: 'enemy', depth: [-80, -18], biomes: ['abyss'], rarity: 0.6, desc: 'deep lurker: glowing lure, jaw snap' },
  { kind: 'crab', team: 'enemy', depth: [-40, -2], biomes: ['reef', 'kelp', 'harbor', 'arctic', 'sunset'], rarity: 0.7, floor: true, group: [1, 2], desc: 'walks the seabed, raises claws, pinches' },
  { kind: 'triggerfish', team: 'enemy', depth: [-12, -2], biomes: ['reef', 'sunset'], rarity: 0.35, floor: true, desc: 'territorial: rams you if you linger' },
  { kind: 'peacock_bass', team: 'enemy', depth: [-10, -1.5], biomes: ['kelp', 'sunset', 'harbor'], rarity: 0.35, desc: 'lone predator: stalks and lunges' },
  // neutral ambience
  { kind: 'cichlid', team: 'neutral', depth: [-10, -1.5], biomes: ['reef', 'kelp', 'sunset'], rarity: 0.8, group: [2, 4], desc: 'shy reef fish' },
  { kind: 'cichlid_blue', team: 'neutral', depth: [-10, -1.5], biomes: ['reef', 'sunset'], rarity: 0.6, group: [2, 4], desc: 'shy reef fish (electric blue)' },
  { kind: 'napoleon', team: 'neutral', depth: [-20, -4], biomes: ['reef', 'sunset'], rarity: 0.15, desc: 'gentle giant wrasse' },
  { kind: 'stingray', team: 'neutral', depth: [-30, -3], biomes: ['reef', 'kelp', 'sunset', 'harbor'], rarity: 0.3, floor: true, desc: 'glides over the seabed; stings if provoked' },
  { kind: 'stingray_blue', team: 'neutral', depth: [-30, -3], biomes: ['reef', 'sunset', 'arctic'], rarity: 0.25, floor: true, desc: 'glides over the seabed; stings if provoked' },
  { kind: 'sea_cucumber', team: 'neutral', depth: [-60, -3], biomes: ['reef', 'kelp', 'abyss', 'arctic'], rarity: 0.3, floor: true, desc: 'inches along the seabed' },
  { kind: 'starfish', team: 'neutral', depth: [-40, -2], biomes: ['reef', 'kelp', 'sunset', 'harbor', 'arctic'], rarity: 0.4, floor: true, desc: 'decor: clings to rock' },
  { kind: 'grouper', team: 'enemy', depth: [-30, -4], biomes: ['reef', 'harbor'], rarity: 0.2, desc: 'big lone predator: stalks and gulps' },
  { kind: 'pike', team: 'enemy', depth: [-12, -1.5], biomes: ['kelp', 'arctic', 'harbor'], rarity: 0.3, desc: 'ambush predator: lunges' },
  { kind: 'pumpkinseed', team: 'neutral', depth: [-8, -1], biomes: ['kelp', 'harbor', 'sunset'], rarity: 0.6, group: [2, 4], desc: 'shy sunfish' },
  { kind: 'unicornfish', team: 'neutral', depth: [-15, -2], biomes: ['reef', 'sunset'], rarity: 0.4, group: [1, 3], desc: 'shy surgeonfish' },
  { kind: 'snapper', team: 'neutral', depth: [-25, -3], biomes: ['reef', 'sunset', 'harbor'], rarity: 0.5, group: [2, 4], desc: 'reef snapper school' },
  { kind: 'orca', team: 'neutral', depth: [-12, -2], biomes: ['arctic'], rarity: 0.05, desc: 'passing giant (background spectacle)' },
  { kind: 'sperm_whale', team: 'neutral', depth: [-60, -10], biomes: ['abyss', 'arctic'], rarity: 0.03, desc: 'passing giant (background spectacle)' },
  // friends
  { kind: 'sardines', team: 'friend', depth: [-12, -1], biomes: ['reef', 'kelp', 'harbor', 'arctic', 'sunset'], rarity: 0.6, desc: 'school that swirls round you; bite one for a snack heal' },
  { kind: 'cleaner_wrasse', team: 'friend', depth: [-14, -2], biomes: ['reef', 'sunset', 'kelp'], rarity: 0.35, desc: 'cleaning station: heals once per visit' },
  { kind: 'sea_turtle', team: 'friend', depth: [-16, -2], biomes: ['reef', 'kelp', 'sunset', 'harbor'], rarity: 0.2, desc: 'rideable: carry(dt, player)' },
  { kind: 'hermit', team: 'friend', depth: [-30, -2], biomes: ['reef', 'kelp', 'harbor', 'sunset', 'arctic'], rarity: 0.25, floor: true, desc: 'follows you; snips fishing lines (cutsLines)' },
  // bosses
  { kind: 'old_ichthy', team: 'enemy', depth: [-20, -4], biomes: ['reef', 'kelp', 'sunset', 'harbor'], rarity: 0, boss: true, desc: 'BOSS: Old Ichthy, the 7 m ichthyosaur' },
  { kind: 'mother_angler', team: 'enemy', depth: [-80, -15], biomes: ['abyss'], rarity: 0, boss: true, desc: 'BOSS: Mother Angler, queen of the dark' },
];

/** build a creature of `kind` at (x, y), add it to the world and return it */
export function spawnCreature(kind: string, world: World, x: number, y: number, o: { onDarkness?: (k: number) => void; light?: boolean } = {}): Entity {
  let e: Entity;
  switch (kind) {
    case 'piranha': e = new Piranha(x, y); break;
    case 'pufferfish': e = new Pufferfish(x, y); break;
    case 'moray': e = new Moray(x, y, world); break;
    case 'barracuda': e = new Barracuda(x, y); break;
    case 'jellyfish': e = new Jellyfish(x, y); break;
    case 'anglerfish': e = new Anglerfish(x, y, { light: o.light }); break;
    case 'crab': e = new Crab(x, y); break;
    case 'triggerfish': e = new Triggerfish(x, y); break;
    case 'peacock_bass': e = new Predator('peacock_bass', x, y, { scale: 1.1, hp: 4 }); break;
    case 'cichlid': case 'cichlid_blue': e = new ReefFish(kind, x, y, { scale: 1.6 }); break;
    case 'napoleon': e = new ReefFish('napoleon', x, y, { scale: 1, hp: 8, speed: 1.2 }); break;
    case 'stingray': case 'stingray_blue': e = new Stingray(kind, x, y); break;
    case 'sea_cucumber': case 'starfish': e = new Crawler(kind, x, y); break;
    case 'grouper': e = new Predator('grouper', x, y, { scale: 1, hp: 6 }); break;
    case 'pike': e = new Predator('pike', x, y, { scale: 1, hp: 4 }); break;
    case 'pumpkinseed': case 'unicornfish': case 'snapper': e = new ReefFish(kind, x, y, { scale: kind === 'snapper' ? 1 : 1.5 }); break;
    case 'orca': case 'sperm_whale': e = new ReefFish(kind, x, y, { scale: 1, hp: 40, speed: kind === 'orca' ? 3 : 1.5 }); break;
    case 'sardines': e = new SardineSchool(x, y); break;
    case 'cleaner_wrasse': e = new CleanerWrasse(x, y); break;
    case 'sea_turtle': e = new SeaTurtle(x, y); break;
    case 'hermit': e = new HermitCrab(x, y); break;
    case 'old_ichthy': e = new OldIchthy(x, y); break;
    case 'mother_angler': e = new MotherAngler(x, y, o); break;
    default: throw new Error('unknown creature ' + kind);
  }
  return world.add(e);
}

export { Piranha, Pufferfish, Moray, Barracuda, Jellyfish, Anglerfish, Crab, SardineSchool, CleanerWrasse, SeaTurtle, HermitCrab, OldIchthy, MotherAngler, ReefFish, Triggerfish, Predator, Stingray, Crawler };
export { Creature } from './base';
export { BossPart, DecoyLure } from './bosses';
