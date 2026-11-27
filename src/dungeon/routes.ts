// CROSSROADS: the journey's route graph (v6). There is no map: the way forks, signposts say where each branch
// leads, and the branch you swim into decides what comes next.
//
//   END OF A FLOOR   past the boss the seabed splits into two (sometimes three) exit pits, each with its own sign
//                    and its own look; each one drops into a different next biome and/or ROUTE:
//                      deep   DEEPER, RICHER        a steeper floor, a longer drop, one more arena, no post office
//                      safe   SAFER, MORE CHESTS    a gentler floor, one arena fewer, chests along the way, the post
//                      trade  POST OFFICE, SUPPLIES the post office and the shop, supply caches of what home needs
//                    The graph only ever goes on down the progression (reef > kelp > graveyard > arctic > abyss >
//                    the hadal remixes), never more than one biome skipped, so every run reaches the abyss.
//   MID-FLOOR        a detour that rejoins (src/dungeon/level.ts: 'den' = the champion's cave vs the high road;
//                    'grotto' = the open water with a patrol and a locked chest vs a quiet grotto with a supply cache)
//
//   crossroads('reef', 0, seed, 11)  -> [{ area: 'kelp', route: 'safe', ...sign }, { area: 'graveyard', route: 'deep', ... }]
//   ROUTE.deep.descent               the level generator's tweaks for a route
import { Rng } from '../core/rng';
import { biomeDef, baseOf, isHadal, HADAL_KEYS } from './biomes';
import { ENEMIES_FOR, isGiant } from '../combat';
import { depthDifficulty } from './depth';

export type RouteKind = 'main' | 'deep' | 'safe' | 'trade';
/** a reward a sign shows (painted icons on the boards) */
export type SignIcon = 'chest' | 'bigchest' | 'locked' | 'pearls' | 'mats' | 'post' | 'shop' | 'key';
/** what a branch's signpost says */
export interface SignInfo {
  /** the place ("KELP CATHEDRAL", "THE HIGH ROAD") */
  name: string;
  /** the route in two words ("DEEPER, RICHER") */
  note: string;
  /** skulls 0..3 */
  danger: number;
  /** giant humans patrol it (a giant's silhouette on the board) */
  giant: boolean;
  reward: SignIcon[];
}
/** one way on from an end-of-floor crossroads */
export interface Branch extends SignInfo { area: string; route: RouteKind }

export interface RouteDef {
  note: string;
  /** the floor's terrace descent multiplier and the extra metres of the dark drop into it */
  descent: number; drop: number;
  /** arenas added / removed */
  arenas: number;
  /** the points of interest on the floor (shuffled) */
  pois: ('shop' | 'post' | 'treasure' | 'secret')[];
  /** extra route chests (small / locked) and supply caches */
  small: number; locked: number; caches: number;
  /** roaming groups: chance per travel stretch */
  groups: number;
  danger: number;
  reward: SignIcon[];
}
export const ROUTE: Record<RouteKind, RouteDef> = {
  main: { note: 'THE WAY ON', descent: 1, drop: 0, arenas: 0, pois: ['shop', 'post', 'treasure', 'secret'], small: 0, locked: 0, caches: 0, groups: 0.5, danger: 1, reward: ['chest'] },
  deep: { note: 'DEEPER, RICHER', descent: 1.3, drop: 14, arenas: 1, pois: ['shop', 'treasure', 'secret'], small: 0, locked: 1, caches: 0, groups: 0.6, danger: 3, reward: ['bigchest', 'pearls'] },
  safe: { note: 'SAFER, MORE CHESTS', descent: 0.85, drop: 0, arenas: -1, pois: ['shop', 'post', 'treasure'], small: 3, locked: 1, caches: 0, groups: 0.3, danger: 1, reward: ['chest', 'chest'] },
  trade: { note: 'POST OFFICE, SUPPLIES', descent: 1, drop: 0, arenas: 0, pois: ['shop', 'post', 'secret', 'treasure'], small: 1, locked: 0, caches: 2, groups: 0.45, danger: 2, reward: ['post', 'mats'] },
};
export const routeOf = (k: string | undefined): RouteDef => ROUTE[(k as RouteKind)] ?? ROUTE.main;

/** the progression the graph walks down (one biome may be skipped, never two) */
export const AREA_ORDER = ['reef', 'kelp', 'graveyard', 'arctic', 'abyss'];

/** a place's name for a sign ("Kelp Cathedral" -> "KELP CATHEDRAL") */
export const placeName = (area: string) => biomeDef(area).name.toUpperCase();

/** do giant humans walk this biome at this depth (K's tables)? */
export function giantsAt(area: string, metres: number, mastery = 0): boolean {
  if (isHadal(area) || baseOf(area) === 'abyss') return true;
  return ENEMIES_FOR(baseOf(area), depthDifficulty(metres, mastery)).some((k) => isGiant(k));
}

/** the biomes one floor on from `area`: the next in the progression, and the one after it (a skip, the deep way) */
function nextAreas(area: string, rng: Rng): string[] {
  if (isHadal(area) || area === 'abyss') {
    const cur = isHadal(area) ? area.slice(6) : '';
    const keys = rng.shuffle(HADAL_KEYS.filter((k) => k !== cur));
    return keys.slice(0, 2).map((k) => 'hadal:' + k);
  }
  const i = AREA_ORDER.indexOf(baseOf(area));
  return AREA_ORDER.slice(i + 1, i + 3);
}

/**
 * The branches at the end of a floor: two, sometimes three, each a (biome, route) with its sign. `metres` is the
 * real depth of the floor's first shelf (the danger and the giants are judged for the depth the branch arrives at).
 */
export function crossroads(area: string, floorIdx: number, seed: number, metres: number, mastery = 0, whaleFree = true): Branch[] {
  const rng = new Rng((seed ^ Math.imul(floorIdx + 7, 0x51ed27)) >>> 0);
  const next = nextAreas(area, rng);
  const near = rng.chance(0.5) ? 'safe' : 'trade';
  const other: RouteKind = near === 'safe' ? 'trade' : 'safe';
  const out: { area: string; route: RouteKind }[] = [];
  if (next.length >= 2) {
    out.push({ area: next[0], route: near }, { area: next[1], route: 'deep' });
    // sometimes a third way: the nearer biome by the other route (never on the very first crossroads)
    if (floorIdx > 0 && rng.chance(0.4)) out.push({ area: next[0], route: other });
  } else if (next.length === 1) {
    out.push({ area: next[0], route: near }, { area: next[0], route: 'deep' });
    if (rng.chance(0.35)) out.push({ area: next[0], route: other });
  } else {
    out.push({ area, route: 'safe' }, { area, route: 'deep' });
  }
  const arrive = metres + 75;
  return rng.shuffle(out).map((b) => {
    const R = ROUTE[b.route];
    const m = arrive + R.drop + 30 * (R.descent - 1);
    // v8: a deeper branch into stage 3 or later is where THE GENTLE GIANT waits (the whale shark boss, once a run:
    // src/game/dungeonScreen.ts whaleFloor): its sign says so
    const whale = whaleFree && b.route === 'deep' && floorIdx + 1 >= 2;
    return { ...b, name: placeName(b.area), note: whale ? 'A GIANT SHADOW' : R.note, danger: R.danger, giant: giantsAt(b.area, m, mastery), reward: [...R.reward] };
  });
}

/** does a champion's den at this depth hold a giant (the challenge's champion is a heavy diver when the table has one)? */
export function championGiant(area: string, metres: number, mastery = 0): boolean {
  return ENEMIES_FOR(baseOf(area), depthDifficulty(metres, mastery) + 0.35).includes('heavy');
}

/** the signs of the two mid-floor detours ('den': the champion's cave vs the high road; 'grotto': open water vs a quiet grotto) */
export function detourSigns(kind: 'den' | 'grotto', area: string, metres: number, mastery = 0): { upper: SignInfo; lower: SignInfo } {
  if (kind === 'den') {
    return {
      upper: { name: 'THE HIGH ROAD', note: 'NO FIGHT, A CHEST', danger: 0, giant: false, reward: ['chest'] },
      lower: { name: 'THE DEN', note: 'A CHAMPION, BIG CHEST', danger: 2, giant: championGiant(area, metres, mastery), reward: ['bigchest'] },
    };
  }
  const g = giantsAt(area, metres, mastery);
  return {
    upper: { name: 'OPEN WATER', note: 'A PATROL, LOCKED CHEST', danger: g ? 2 : 1, giant: g, reward: ['locked'] },
    lower: { name: 'THE GROTTO', note: 'QUIET, SUPPLIES FOR HOME', danger: 0, giant: false, reward: ['mats'] },
  };
}
