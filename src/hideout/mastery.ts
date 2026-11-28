// Mastery levels (cumulative modifiers: win a run at level N to unlock N+1) and the starting areas a run can
// begin in. The run code reads masteryScalars(level) for the numbers; the TV shows the text.

export interface MasteryLevel { level: number; name: string; mod: string }
export const MASTERY: MasteryLevel[] = [
  { level: 0, name: 'Shallow Waters', mod: 'The standard run. Humans are clumsy, manatees are punctual.' },
  { level: 1, name: 'Choppy Seas', mod: 'Humans have +25% health.' },
  { level: 2, name: 'Salty Crews', mod: '+1 human per wave; divers throw more nets.' },
  { level: 3, name: 'Depth Charges', mod: 'Boats drop depth charges from area 1.' },
  { level: 4, name: 'Old Grudges', mod: 'A nemesis hunts you in every area.' },
  { level: 5, name: 'Iron Hulls', mod: 'Shipwreck repairs cost 50% more.' },
  { level: 6, name: 'Night Shift', mod: 'Darker water; waves arrive 20% faster.' },
  { level: 7, name: 'Hunting Season', mod: 'Elite divers and mini-subs from the first wave.' },
  { level: 8, name: 'Slow Post', mod: 'Manatees come half as often to the mail buoy.' },
  { level: 9, name: 'The Abyss Stares', mod: 'Bosses gain a second phase.' },
  { level: 10, name: 'Leviathan', mod: 'Everything, all at once. Good luck, little fish.' },
];
export const MAX_MASTERY = MASTERY.length - 1;

/** all modifier lines active at a mastery level (cumulative) */
export function masteryMods(level: number): string[] { return MASTERY.slice(1, level + 1).map((m) => m.mod); }

/** floors a run dives at a mastery level: 3 at M0, 4 from M3, 5 from M6 (the dungeon reads masteryScalars().floors) */
export function floorsAt(level: number) { return level >= 6 ? 5 : level >= 3 ? 4 : 3; }

/** numbers the run can apply */
export function masteryScalars(level: number) {
  const L = (n: number) => (level >= n ? 1 : 0);
  return {
    enemyHp: 1 + 0.25 * L(1) + 0.15 * L(10),
    extraPerWave: L(2) + L(10),
    depthCharges: !!L(3),
    nemesisEveryArea: !!L(4),
    repairCost: 1 + 0.5 * L(5),
    waveSpeed: 1 + 0.2 * L(6),
    darkness: 0.25 * L(6),
    elitesEarly: !!L(7),
    mailRate: L(8) ? 0.5 : 1,
    bossPhase2: !!L(9),
    lootBonus: 1 + level * 0.08,
    floors: floorsAt(level),
  };
}

export interface AreaInfo { id: string; name: string; desc: string; minMastery: number }
export const AREAS: AreaInfo[] = [
  { id: 'reef', name: 'Sunlit Reef', desc: 'Warm shallows, coral, curious divers.', minMastery: 0 },
  { id: 'kelp', name: 'Kelp Cathedral', desc: 'Towering kelp, spearfishers in the shade.', minMastery: 0 },
  { id: 'graveyard', name: 'Shipwreck Graveyard', desc: 'Rusting hulls and salvage crews.', minMastery: 1 },
  { id: 'arctic', name: 'Frost Shelf', desc: 'Ice ceilings, seals and trawlers.', minMastery: 2 },
  { id: 'abyss', name: 'The Abyss', desc: 'Pitch dark. Mini-subs. Things with lights.', minMastery: 3 },
];

