// Floor plans: each floor is ONE long side-scrolling level (~300-400 m) that DESCENDS as you travel: the seabed
// steps down in terraces (cliffs to swim over and down, steep slopes, narrow shafts with overhanging lips) about
// 28-40 m over the floor, with the arenas and points of interest on flat-ish shelves along the way.
//
//   start     floor 1: you dive in from the surface; deeper floors: you drop in down a rock shaft from above
//   travel    open water with a drop-off (cliff / slope / shaft / steps) plus terrain features (a mid-water ledge
//             that splits off an upper lane, a boulder mound, a shallow trench) and sometimes a roaming group
//   arena     an encounter zone on a shelf: gates rise on both sides, enemies spawn, the gates sink with loot
//   fork      a MID-FLOOR FORK (v6 crossroads): the seabed dips into a cave under a rock lid and the way splits in
//             two lanes you can see, a signpost at the split saying where each leads. 'den': the high road over the
//             lid (safe, a chest) or the cave and its CHALLENGE arena (a champion + a big chest); 'grotto': the open
//             water (a patrol, a locked chest on the lid) or a quiet grotto (a supply cache of what home needs).
//             Swimming into a lane commits to it: bars rise across both ends of the other one. They rejoin past it.
//   poi       Mr. Crab's shop, the post office (the manatee), a treasure nook (a locked chest or a pedestal on a
//             ledge), a secret pit under a cracked rock lid (bomb it)
//   boss      the deepest shelf: the skull gate, the boss arena and, past it, the END-OF-FLOOR CROSSROADS: two or three
//             EXIT PITS under grates, each framed in the look of where it leads with its own signpost (the next biome
//             and route: src/dungeon/routes.ts); swim down one to choose. (A plan without branches has one pit.) After
//             the last planned floor a rope also hangs back up to the surface.
//
// No map (v6): the plan also carries the way-finding: signposts (distance home, forks, dead ends), CURRENTS (bubble
// streams and drifting chevrons pointing onward, into each lane, down the pits) and DEAD-END zones that tell you
// to turn back.
//
//   const plan = genLevel({ n: 0, area: 'reef', seed: 1234, mastery: 0, depth0: 0 });
//   bedAt(plan, x)   the bedrock height;  shelfAt(plan, x)   the terrace level;  depthOf(plan, y)   real metres
//
// World y stays in a shallow window per floor (the area builders were tuned there); the REAL depth in metres is
// plan.depth0 - y (depth0 = the real depth of world y = 0), continuous across floors. Everything here is data
// (saved with the run); src/dungeon/levelBuild.ts turns it into scenery, terrain and props.
import { Rng } from '../core/rng';
import { fbm, smooth } from '../core/math';
import { biomeDef } from './biomes';
import { routeOf, detourSigns, AREA_ORDER, type RouteKind, type SignInfo, type Branch } from './routes';
export type { RouteKind } from './routes';

export type PoiKind = 'start' | 'shop' | 'post' | 'treasure' | 'secret' | 'challenge' | 'boss';
export interface ShopSlot { kind: 'item' | 'heart' | 'key' | 'bomb'; id?: string; price: number; sold: boolean }

export interface ArenaPlan {
  id: number; kind: 'arena' | 'challenge' | 'boss';
  x0: number; x1: number; floor: number; top: number;
  seed: number;
  cleared: boolean;
}
export interface PoiPlan {
  id: number; kind: PoiKind;
  x: number; y: number;
  /** revealed on the strip map (secrets: once opened) */
  known: boolean;
  /** used up (looted, sold out, opened) */
  done: boolean;
  /** treasure: 'chest' (locked) | 'pedestal'; the item(s); shop stock */
  style?: 'chest' | 'pedestal';
  items?: string[];
  taken?: boolean;
  shop?: ShopSlot[];
  /** secret: the lid has been bombed open */
  opened?: boolean;
}
/** a solid rock body on the gameplay plane (rounded box). 'wall': the entry shaft's sides; 'grate': the exit pit's cover */
export interface SolidPlan { id: number; kind: 'ledge' | 'lid' | 'cracked' | 'mound' | 'wall' | 'grate' | 'lip'; x0: number; x1: number; y0: number; y1: number; poi?: number }
/** a dip in the bedrock (caves, pits, trenches): depth at the middle, ramps of `ramp` metres */
export interface DipPlan { x0: number; x1: number; depth: number; ramp: number }
/** a drop-off between two shelves (the terrace profile) */
export interface StepPlan { x0: number; x1: number; drop: number; kind: 'cliff' | 'slope' | 'shaft' | 'steps' }
export interface GroupPlan { id: number; x: number; n: number; seed: number; spawned: boolean; cleared: boolean; fork?: number; lane?: number }
/**
 * a chest along the route: 'small' (no key), 'locked' (a key), 'big' (after each arena: hidden until it's cleared),
 * 'sunken' (the treasure in a secret pit). y = the floor it sits on (world).
 */
export interface ChestPlan {
  id: number; kind: 'small' | 'locked' | 'big' | 'sunken'; x: number; y: number; opened: boolean; arena?: number; poi?: number; items?: string[];
  /** a supply cache: filled (when first built) with materials the house still needs */
  cache?: boolean;
  /** it sits in a fork's lane (sealed with it) */
  fork?: number; lane?: number;
}
/**
 * a wooden signpost: distances home and onward, painted on its boards (at vistas and the floor's start); v6: 'fork'
 * (a crossroads: one board per lane), 'lane' (one board at a lane's mouth / over an exit pit), 'dead' (turn back)
 */
export interface SignPlan { x: number; y: number; kind: 'home' | 'mile' | 'vista' | 'fork' | 'lane' | 'dead'; fork?: number; lane?: number }

/** where bars rise across a lane when another lane of its fork is chosen (world: the bars stand on `floor`) */
export interface SealPlan { x: number; floor: number; top: number; bodyTop: number; bodyBottom?: number }
/** one way on at a fork: its sign, where swimming in commits to it, and (end of floor) where it leads */
export interface ForkLane extends SignInfo {
  side: 'upper' | 'lower' | 'pit';
  /** the commit zone */
  x0: number; x1: number; y0: number; y1: number;
  /** bars across this lane (raised when ANOTHER lane is chosen) */
  seals: SealPlan[];
  /** end of floor: the exit pit (plan.exits index), the next floor's biome and route */
  exit?: number; area?: string; route?: RouteKind;
}
export interface ForkPlan {
  id: number; kind: 'den' | 'grotto' | 'end';
  /** the split, where its signpost stands */
  x: number; y: number;
  /** what the camera frames while you choose */
  view: { x0: number; x1: number; y0: number; y1: number };
  lanes: ForkLane[];
  /** the lane taken, -1 while undecided (saved) */
  chosen: number;
}
/** an exit pit: a shaft down under a grate past the boss */
export interface ExitPlan { x0: number; x1: number; top: number; bottom: number }
/** a current: bubbles and drifting chevrons pointing the way (dx, dy a unit direction; len metres). exit: only once that pit is open */
export interface CurrentPlan { x: number; y: number; dx: number; dy: number; len: number; exit?: number; fork?: number; lane?: number }
/** a dead end: swimming into it (moving `dir`) says turn back */
export interface DeadEndPlan { x0: number; x1: number; y0: number; y1: number; dir: -1 | 1; say: string; fork?: number; lane?: number }

export interface LevelPlan {
  n: number; area: string; seed: number;
  /** level length: x runs 0 .. W */
  W: number;
  /** the first shelf's level and the relief amplitude */
  base: number; amp: number;
  /** the water column's usable top: the surface on floor 1, else a ceiling of dark water over the level */
  top: number;
  /** the real depth (m) of world y = 0: real metres = depth0 - y */
  depth0: number;
  arenas: ArenaPlan[]; pois: PoiPlan[]; solids: SolidPlan[]; dips: DipPlan[]; groups: GroupPlan[]; steps: StepPlan[];
  /** zones the relief is flattened in (arenas, POIs) */
  flats: [number, number][];
  /** minimap lane hints */
  lanes: { kind: 'upper' | 'cave'; x0: number; x1: number }[];
  /** explored 4 m bins (saved) */
  explored: number[];
  startX: number;
  bossX0: number;
  /** the exit pit: x span, the shelf it's cut into and its bottom (world y) */
  exit: { x0: number; x1: number; top: number; bottom: number };
  /** where the surface rope hangs (only on the floor that ends the planned run / a hadal rope point) */
  ropeX: number | null;
  /** metres from home at x = 0 (the journey: floor 1 starts at the front door) */
  far0: number;
  chests: ChestPlan[];
  signs: SignPlan[];
  /** cliff edges with a view down: the camera pulls back here */
  vistas: number[];
  /** v6 crossroads: the forks (mid-floor detours and the end-of-floor crossroads), every exit pit, the currents, dead ends */
  forks: ForkPlan[];
  exits: ExitPlan[];
  currents: CurrentPlan[];
  dead: DeadEndPlan[];
  /** the route this floor was reached by (src/dungeon/routes.ts) */
  route: RouteKind;
}

export interface LevelOpts {
  n: number; area: string; seed: number; mastery?: number; depth0?: number; rope?: boolean; far0?: number;
  /** the route this floor was reached by (shapes the floor) */
  route?: RouteKind;
  /** the ways on from the end-of-floor crossroads (none or one: a single exit pit) */
  branches?: Branch[];
}

/** a plan from an older save: fill in what v6 added (one exit, no forks, no currents) so it plays as before */
export function normalizePlan(plan: LevelPlan): LevelPlan {
  plan.chests ??= []; plan.signs ??= []; plan.vistas ??= [];
  plan.forks ??= []; plan.currents ??= []; plan.dead ??= [];
  if (!plan.exits?.length) plan.exits = [plan.exit];
  plan.exit = plan.exits[0];
  plan.route ??= 'main';
  for (const f of plan.forks) { f.chosen ??= -1; for (const l of f.lanes) l.seals ??= []; }
  return plan;
}

export const BIN = 4;
export const ARENA_W = 26;
/** an arena's gates reach this far above its shelf (beat-'em-up box height) */
export const ARENA_H = 13;
/** world y of the entry shaft's mouth on floors below the first */
export const ENTRY_TOP = -3;
/** the exit pit's depth below the boss shelf */
export const EXIT_DEPTH = 15;

export function genLevel(o: LevelOpts): LevelPlan {
  const a = biomeDef(o.area);
  const r = new Rng(o.seed);
  const R = routeOf(o.route);
  const first = o.n === 0 && (o.depth0 ?? 0) <= 0;
  const top = first ? (a.ice ? -2.6 : -0.6) : ENTRY_TOP;
  const base = first ? -11 : -14;
  const plan: LevelPlan = {
    n: o.n, area: o.area, seed: o.seed, W: 0, base, amp: Math.min(a.amp, 2.6), top, depth0: o.depth0 ?? 0,
    arenas: [], pois: [], solids: [], dips: [], groups: [], steps: [], flats: [], lanes: [], explored: [], startX: 8.5, bossX0: 0,
    exit: { x0: 0, x1: 0, top: 0, bottom: 0 }, ropeX: null, far0: o.far0 ?? 0, chests: [], signs: [], vistas: [],
    forks: [], exits: [], currents: [], dead: [], route: o.route ?? 'main',
  };
  const metres = (y: number) => plan.depth0 - y;
  const chest = (kind: ChestPlan['kind'], cx: number, cy: number, extra: Partial<ChestPlan> = {}) => { plan.chests.push({ id: plan.chests.length, kind, x: cx, y: cy, opened: false, ...extra }); };
  let x = 0, level = base;
  const poi = (kind: PoiKind, px: number, py: number, extra: Partial<PoiPlan> = {}) => { const p: PoiPlan = { id: plan.pois.length, kind, x: px, y: py, known: kind !== 'secret', done: false, ...extra }; plan.pois.push(p); return p; };
  const solid = (kind: SolidPlan['kind'], x0: number, x1: number, y0: number, y1: number, poiId?: number) => { plan.solids.push({ id: plan.solids.length, kind, x0, x1, y0, y1, poi: poiId }); };
  const arena = (kind: ArenaPlan['kind'], x0: number, x1: number, floor: number, aTop: number) => { plan.arenas.push({ id: plan.arenas.length, kind, x0, x1, floor, top: aTop, seed: (o.seed ^ Math.imul(plan.arenas.length + 1, 0x85ebca6b)) >>> 0, cleared: false }); };
  const arenaTop = (lv: number) => Math.min(top, lv + ARENA_H);
  const current = (cx: number, cy: number, dx: number, dy: number, len = 7, extra: Partial<CurrentPlan> = {}) => { const l = Math.hypot(dx, dy) || 1; plan.currents.push({ x: cx, y: Math.min(cy, top - 1.2), dx: dx / l, dy: dy / l, len, ...extra }); };
  // ---- the order first (the descent budget is spread over the travel stretches)
  const nArenas = Math.max(2, Math.min(6, 3 + Math.floor((o.n + (o.mastery ?? 0) / 3) * 0.6) + R.arenas));
  type Seg = 'arena' | 'travel' | 'fork' | 'shop' | 'post' | 'treasure' | 'secret';
  const pois = r.shuffle<Seg>([...R.pois]);
  const order: Seg[] = ['travel'];
  const forkAt = r.int(1, nArenas - 1);
  // a second detour on the longer floors
  const fork2 = nArenas >= 4 && r.chance(0.6) ? (forkAt + 2 <= nArenas - 1 ? forkAt + 2 : forkAt - 2) : -1;
  let pi = 0;
  for (let k = 0; k < nArenas; k++) {
    order.push('arena', 'travel');
    if (pi < pois.length) order.push(pois[pi++]);
    if (k === forkAt || k === fork2) order.push('travel', 'fork');
    order.push('travel');
  }
  while (pi < pois.length) order.push(pois[pi++], 'travel');
  const travels = order.filter((s) => s === 'travel').length;
  const descent = r.range(28, 38) * R.descent;
  // drops: one per travel stretch (a couple stay flat), shares of the floor's descent
  const shares = Array.from({ length: travels }, (_, i) => (i === 0 ? 0.6 : r.chance(0.18) ? 0 : r.range(0.6, 1.6)));
  const sum = shares.reduce((s2, v) => s2 + v, 0) || 1;
  const drops = shares.map((v) => (v / sum) * descent);
  let ti = 0;
  // the first detour is the champion's den (the floor's CHALLENGE), a second one the grotto; else a coin toss
  let forks = 0;
  const forkKinds: ('den' | 'grotto')[] = fork2 >= 0 ? r.shuffle<'den' | 'grotto'>(['den', 'grotto']) : [r.chance(0.6) ? 'den' : 'grotto'];
  /** quiet shelf spans along the travel stretches (extra route chests and supply caches go here afterwards) */
  const quiet: [number, number][] = [];
  // ---- segments
  const seg = {
    start: () => {
      if (first) { poi('start', 8, base + 4, { done: true }); plan.signs.push({ x: 5, y: base, kind: 'home' }); plan.flats.push([0, 17]); current(12, base + 3, 1, 0, 6); x = 18; return; }
      // the entry shaft: rock walls either side from the shelf up to the ceiling; you drop in from the top
      poi('start', 8.5, base + 4, { done: true });
      solid('wall', 0, 4.2, base - 1, top + 3);
      solid('wall', 12.8, 16, base + 4.5, top + 3);
      plan.signs.push({ x: 18, y: base, kind: 'mile' });
      current(13.5, base + 2.2, 1, 0, 6);
      plan.flats.push([0, 22]);
      x = 22;
    },
    travel: (L: number, group: boolean) => {
      const x0 = x, drop = drops[ti++] ?? 0;
      // the drop-off sits in the middle of the stretch; features go on the shelf before or after it
      const kinds: StepPlan['kind'][] = drop > 7 ? ['cliff', 'shaft', 'cliff'] : drop > 3.5 ? ['cliff', 'slope', 'steps'] : ['slope', 'steps'];
      const kind = r.pick(kinds);
      const w = kind === 'cliff' ? r.range(2.2, 3.4) : kind === 'shaft' ? r.range(3.2, 4.2) : kind === 'steps' ? r.range(7, 10) : r.range(8, 12);
      const L2 = Math.max(L, w + 10);
      const sx = x0 + L2 * r.range(0.35, 0.6) - w / 2;
      if (drop > 0.5) {
        plan.steps.push({ x0: sx, x1: sx + w, drop, kind });
        // a shaft: an overhanging lip narrows the top of the drop, so you swim over it and down
        if (kind === 'shaft') solid('lip', sx - 3.2, sx + w * 0.35, level - 0.6, level + 0.9);
        // a big drop is a vista: the camera pulls back over the edge and a signpost marks how far you've come
        // (a signpost only every ~110 m or so: a stage of the voyage, not a fence)
        if (drop >= 4.5) {
          plan.vistas.push(sx);
          const last = plan.signs[plan.signs.length - 1];
          if (!last || sx - last.x > 110) plan.signs.push({ x: sx - 2.6, y: level, kind: 'vista' });
        }
      }
      const upper = level, lower = level - drop;
      // the current runs on along the shelf and pours over the edge of a drop (the way on, without a map)
      if (drop > 3) current(sx - 1.6, upper + (kind === 'shaft' ? 3.4 : 2.2), 0.75, -0.65, 6.5);
      else current(x0 + Math.max(3, (sx - x0) * 0.5), upper + 2.6, 1, 0, 7);
      const f = r.next();
      if (f < 0.35 && L2 >= 20) {
        // a mid-water ledge over the lower shelf: an upper lane (often with a chest up top)
        const lx0 = sx + w + 2, lx1 = Math.min(x0 + L2 - 2, lx0 + r.range(8, 13)), ly = lower + r.range(5, 6.5);
        if (lx1 - lx0 > 5) {
          const t = ly + r.range(1.2, 1.8);
          solid('ledge', lx0, lx1, ly, t); plan.lanes.push({ kind: 'upper', x0: lx0, x1: lx1 });
          if (r.chance(0.55)) chest(r.chance(0.35) ? 'locked' : 'small', (lx0 + lx1) / 2 + r.range(-1.5, 1.5), t);
        }
      } else if (f < 0.6 && sx - x0 > 9) {
        solid('mound', x0 + 2, x0 + 7, upper - 1, upper + r.range(2, 3.2));
      } else if (f < 0.75 && x0 + L2 - (sx + w) > 12) {
        plan.dips.push({ x0: sx + w + 2, x1: x0 + L2 - 1, depth: r.range(2, 3), ramp: 4 });
      }
      // small chests along the way (no key), on the shelf before or after the drop
      if (r.chance(0.5)) { const cx = r.chance(0.5) && sx - x0 > 6 ? x0 + r.range(2, sx - x0 - 2) : Math.min(x0 + L2 - 2, sx + w + r.range(2, 5)); chest('small', cx, cx < sx ? upper : lower); }
      if (group) plan.groups.push({ id: plan.groups.length, x: sx + w + 5, n: r.int(2, 3), seed: (o.seed ^ Math.imul(plan.groups.length + 11, 0x27d4eb2f)) >>> 0, spawned: false, cleared: false });
      if (sx - x0 > 7) quiet.push([x0 + 2, sx - 2]);
      if (x0 + L2 - (sx + w) > 7) quiet.push([sx + w + 2.5, x0 + L2 - 2]);
      level = lower;
      x = x0 + L2;
    },
    arena: () => {
      const x0 = x + 2, x1 = x0 + ARENA_W;
      arena('arena', x0, x1, level - 0.3, arenaTop(level));
      // the big chest that drops in when the arena is cleared
      chest('big', (x0 + x1) / 2 + r.range(-2, 2), level, { arena: plan.arenas.length - 1 });
      plan.flats.push([x0 - 2, x1 + 2]); x = x1 + 2;
      current(x1 + 1.5, level + 3, 1, 0, 6);
    },
    fork: () => {
      // the seabed dips into a cave under a rock lid: the way splits into the lane over the lid and the one under it
      const kind = forkKinds[forks++ % forkKinds.length];
      const id = plan.forks.length;
      const x0 = x, L = kind === 'den' ? 46 : 42, x1 = x0 + L, depth = kind === 'den' ? 7.5 : 6.5;
      plan.dips.push({ x0: x0 + 4, x1: x1 - 4, depth, ramp: 6 });
      const lid0 = x0 + 9, lid1 = x1 - 9, ly0 = level - 0.6, ly1 = level + 1.0, cave = level - depth;
      solid('lid', lid0, lid1, ly0, ly1);
      plan.flats.push([x0 - 1, x1 - 8]);
      const signs = detourSigns(kind, o.area, metres(level), o.mastery ?? 0);
      if (kind === 'den') {
        const ax0 = lid0 + 1.5, ax1 = lid1 - 1.5;
        arena('challenge', ax0, ax1, cave - 0.3, ly0);
        chest('big', (ax0 + ax1) / 2, cave, { arena: plan.arenas.length - 1, fork: id, lane: 1 });
        poi('challenge', (ax0 + ax1) / 2, cave + 1, {});
        // the high road's own chest, up on the lid
        chest('small', lid0 + (lid1 - lid0) * r.range(0.45, 0.6), ly1, { fork: id, lane: 0 });
      } else {
        // the open water: a patrol over the lid and a locked chest on it; the grotto: a supply cache for home
        chest('locked', lid0 + (lid1 - lid0) * r.range(0.55, 0.7), ly1, { fork: id, lane: 0 });
        plan.groups.push({ id: plan.groups.length, x: (lid0 + lid1) / 2 - 2, n: r.int(2, 3), seed: (o.seed ^ Math.imul(plan.groups.length + 11, 0x27d4eb2f)) >>> 0, spawned: false, cleared: false, fork: id, lane: 0 });
        chest('small', lid0 + (lid1 - lid0) * r.range(0.4, 0.6), cave, { cache: true, fork: id, lane: 1 });
      }
      plan.lanes.push({ kind: 'cave', x0: x0 + 6, x1: x1 - 6 });
      // bars across a lane: on the lid (the upper lane, up to the ceiling) / under it (the cave, from its floor)
      const upTop = Math.min(top, ly1 + 9);
      const lanes: ForkLane[] = [
        { ...signs.upper, side: 'upper', x0: lid0 + 1, x1: lid1 - 1, y0: ly1, y1: top + 5, seals: [lid0 + 0.9, lid1 - 0.9].map((sx) => ({ x: sx, floor: ly1, top: upTop, bodyTop: top + 3, bodyBottom: ly1 - 0.3 })) },
        { ...signs.lower, side: 'lower', x0: lid0 + 1, x1: lid1 - 1, y0: cave - 4, y1: ly0, seals: [lid0 + 0.25, lid1 - 0.25].map((sx) => ({ x: sx, floor: cave, top: ly0, bodyTop: ly0 + 0.7, bodyBottom: cave - 3 })) },
      ];
      plan.forks.push({ id, kind, x: x0 + 2.6, y: level, view: { x0: x0 - 2, x1: lid0 + 9, y0: cave - 1, y1: level + 9 }, lanes, chosen: -1 });
      plan.signs.push({ x: x0 + 2.6, y: level, kind: 'fork', fork: id });
      // the currents split at the fork: one over the lid, one down into the cave
      current(x0 + 5.5, level + 3.2, 1, 0.12, 6, { fork: id, lane: 0 });
      current(x0 + 6, level - 0.6, 0.55, -0.85, 5, { fork: id, lane: 1 });
      // ... and pick up again where the lanes meet
      current(x1 - 3, level + 2.4, 1, 0, 6);
      x = x1;
    },
    shop: () => { poi('shop', x + 9, level + 1); plan.flats.push([x + 1, x + 17]); x += 18; },
    post: () => { poi('post', x + 8, level + 4); plan.flats.push([x + 2, x + 14]); x += 16; },
    treasure: () => {
      const style = r.chance(0.55) ? 'chest' : 'pedestal';
      const ly = level + r.range(4, 5.5), lx0 = x + 3, lx1 = x + 12;
      const p = poi('treasure', (lx0 + lx1) / 2, ly + 1.3, { style });
      solid('ledge', lx0, lx1, ly - 1.4, ly, p.id);
      if (style === 'chest') chest('locked', (lx0 + lx1) / 2, ly, { poi: p.id });
      plan.lanes.push({ kind: 'upper', x0: lx0, x1: lx1 });
      plan.flats.push([x + 1, x + 14]);
      x += 15;
    },
    secret: () => {
      const px0 = x + 4, px1 = x + 13;
      plan.dips.push({ x0: px0, x1: px1, depth: 5.5, ramp: 1.4 });
      const p = poi('secret', (px0 + px1) / 2, level - 4, { opened: false });
      chest('sunken', (px0 + px1) / 2 + 1.6, level - 5.5, { poi: p.id });
      solid('cracked', px0 - 0.8, px1 + 0.8, level - 0.9, level + 0.35, p.id);
      plan.flats.push([x + 1, x + 16]);
      x += 17;
    },
    boss: () => {
      plan.bossX0 = x + 2;
      const x0 = x + 5, x1 = x0 + 34;
      arena('boss', x0, x1, level - 0.3, arenaTop(level));
      chest('big', (x0 + x1) / 2 + 4, level, { arena: plan.arenas.length - 1 });
      poi('boss', (x0 + x1) / 2, level + 5);
      current(x - 2, level + 3, 1, 0, 6);
      if (o.rope) plan.ropeX = x0 + 7;
      const br = o.branches ?? [];
      if (br.length < 2) {
        // one way on: the exit pit, past the boss: a shaft down under an iron grate
        const ex0 = x1 + 2, ex1 = ex0 + 5.2;
        plan.dips.push({ x0: ex0 - 0.6, x1: ex1 + 0.6, depth: EXIT_DEPTH, ramp: 0.9 });
        plan.exits.push({ x0: ex0, x1: ex1, top: level, bottom: level - EXIT_DEPTH });
        solid('grate', ex0 - 0.8, ex1 + 0.8, level - 0.7, level + 0.25);
        if (br.length === 1) {
          const b = br[0];
          plan.forks.push({ id: plan.forks.length, kind: 'end', x: ex0 - 3, y: level, view: { x0: ex0 - 8, x1: ex1 + 6, y0: level - 6, y1: level + 8 }, chosen: -1,
            lanes: [{ ...b, side: 'pit', exit: 0, x0: ex0, x1: ex1, y0: level - EXIT_DEPTH, y1: level - 1.6, seals: [] }] });
          plan.signs.push({ x: ex0 - 2.6, y: level, kind: 'lane', fork: plan.forks.length - 1, lane: 0 });
        }
        current((ex0 + ex1) / 2, level + 2.5, 0, -1, 5, { exit: 0 });
        plan.flats.push([x, ex1 + 6]);
        x = ex1 + 6;
      } else {
        // THE CROSSROADS: a shelf past the arena with one pit per way on, each framed in the look of where it goes,
        // a big signpost at the start listing them all and a sign at each pit's lip
        const fid = plan.forks.length, cx0 = x1 + 2, GAP = 15;
        plan.signs.push({ x: cx0 + 0.6, y: level, kind: 'fork', fork: fid });
        const lanes: ForkLane[] = [];
        br.forEach((b, k) => {
          const deep = b.route === 'deep';
          const ex0 = cx0 + 13 + k * GAP, ex1 = ex0 + 5.2, bottom = level - EXIT_DEPTH - (deep ? 4 : 0);
          plan.dips.push({ x0: ex0 - 0.6, x1: ex1 + 0.6, depth: level - bottom, ramp: 0.9 });
          plan.exits.push({ x0: ex0, x1: ex1, top: level, bottom });
          solid('grate', ex0 - 0.8, ex1 + 0.8, level - 0.7, level + 0.25);
          plan.signs.push({ x: ex0 - 3.1, y: level, kind: 'lane', fork: fid, lane: k });
          lanes.push({ ...b, side: 'pit', exit: k, x0: ex0, x1: ex1, y0: bottom, y1: level - 1.6, seals: [] });
          current((ex0 + ex1) / 2, level + 2.6, 0, -1, 5, { exit: k });
        });
        const last = plan.exits[plan.exits.length - 1];
        const W = last.x1 + 8;
        plan.forks.push({ id: fid, kind: 'end', x: cx0 + 0.6, y: level, view: { x0: cx0 - 2, x1: W, y0: level - 7, y1: level + 7 }, lanes, chosen: -1 });
        // the end of the line: a dead end past the last pit
        plan.signs.push({ x: W - 3.2, y: level, kind: 'dead' });
        plan.dead.push({ x0: last.x1 + 2.2, x1: W, y0: level - 1, y1: top + 5, dir: 1, say: 'DEAD END: CHOOSE A PIT, BACK THAT WAY' });
        plan.flats.push([x, W]);
        x = W;
      }
      plan.exit = plan.exits[0];
    },
  };
  seg.start();
  for (const s of order) {
    if (s === 'travel') seg.travel(r.range(10, 15), x > 30 && r.chance(R.groups));
    else seg[s]();
  }
  seg.boss();
  plan.W = x;
  // the route's extra chests along the quiet shelves: small ones, a locked one, supply caches (materials for home)
  const extras: Partial<ChestPlan>[] = [
    ...Array.from({ length: R.small }, () => ({ kind: 'small' as const })),
    ...Array.from({ length: R.locked }, () => ({ kind: 'locked' as const })),
    ...Array.from({ length: R.caches }, () => ({ kind: 'small' as const, cache: true })),
  ];
  const spots = r.shuffle(quiet.filter(([q0, q1]) => q1 - q0 > 2 && !plan.chests.some((c) => c.x > q0 - 2 && c.x < q1 + 2)));
  const clear = (cx: number) => !plan.dips.some((d) => cx > d.x0 - 1 && cx < d.x1 + 1) && !plan.steps.some((st) => cx > st.x0 - 1 && cx < st.x1 + 1);
  extras.forEach((e, i) => {
    const sp = spots[i % Math.max(1, spots.length)];
    if (!sp) return;
    let cx = r.range(sp[0], sp[1]) + (i >= spots.length ? 1.6 : 0);
    for (let k = 0; k < 8 && !clear(cx); k++) cx = r.range(sp[0], sp[1]);
    if (clear(cx)) chest(e.kind!, cx, shelfAt(plan, cx), e.cache ? { cache: true } : {});
  });
  // a route chest that landed on a boulder mound / a shaft's lip sits on top of it, not inside
  for (const c of plan.chests) {
    if (c.arena !== undefined || c.poi !== undefined || c.fork !== undefined) continue;
    for (const s of plan.solids) {
      if ((s.kind !== 'mound' && s.kind !== 'lip') || c.x < s.x0 - 0.6 || c.x > s.x1 + 0.6 || c.y > s.y1 || c.y < s.y0 - 2.5) continue;
      c.x = Math.max(s.x0 + 0.7, Math.min(s.x1 - 0.7, c.x)); c.y = s.y1;
    }
  }
  plan.explored = new Array(Math.ceil(plan.W / BIN) + 1).fill(0);
  return plan;
}

/** the terrace level at x (the shelves and the drop-offs between them) */
export function shelfAt(plan: LevelPlan, x: number): number {
  let y = plan.base;
  for (const s of plan.steps) {
    if (x <= s.x0) break;
    const t = Math.min(1, (x - s.x0) / Math.max(0.01, s.x1 - s.x0));
    // cliffs and shafts: a hard edge with a little lip; slopes ease; steps go down in two
    const k = s.kind === 'slope' ? t * t * (3 - 2 * t) : s.kind === 'steps' ? (t < 0.5 ? smooth(0, 0.18, t) * 0.5 : 0.5 + smooth(0.5, 0.68, t) * 0.5) : smooth(0, 1, t);
    y -= s.drop * k;
  }
  return y;
}

/** the bedrock height at x (relief flattened in arenas / POIs, dips cut in, cliffs closing both ends) */
export function bedAt(plan: LevelPlan, x: number): number {
  const s = plan.seed % 9973;
  let flat = 0;
  for (const [a, b] of plan.flats) flat = Math.max(flat, smooth(a - 5, a, x) * smooth(b + 5, b, x));
  // relief stays off the drop-offs so the cliffs read
  let onStep = 0;
  for (const st of plan.steps) onStep = Math.max(onStep, smooth(st.x0 - 2, st.x0, x) * smooth(st.x1 + 2, st.x1, x));
  let y = shelfAt(plan, x) + ((fbm(x * 0.028, 0.5, 4, s) - 0.5) * 2 * plan.amp * 0.6 + (fbm(x * 0.13, 3.1, 2, s + 9) - 0.5) * plan.amp * 0.3) * (1 - flat * 0.85) * (1 - onStep);
  y -= 0.35;
  for (const d of plan.dips) {
    if (x < d.x0 || x > d.x1) continue;
    const k = Math.min(smooth(d.x0, d.x0 + d.ramp, x), smooth(d.x1, d.x1 - d.ramp, x));
    y -= d.depth * k;
  }
  // cliffs close the level at both ends
  y += smooth(4, -14, x) * 16 + smooth(plan.W - 3, plan.W + 14, x) * 16;
  return Math.min(y, plan.top - 2);
}

/** sand thickness at x (none on the drop-offs and in the pits) */
export function sandAt(plan: LevelPlan, x: number): number {
  const s = plan.seed % 9973;
  let t = 0.35 + fbm(x * 0.05, 7.7, 3, s + 21) * 0.8;
  if (fbm(x * 0.09, 2.2, 2, s + 22) < 0.33) t *= 0.2;
  for (const d of plan.dips) if (x > d.x0 - 1 && x < d.x1 + 1 && d.depth > 4) t *= 0.15;
  for (const st of plan.steps) if (x > st.x0 - 1.5 && x < st.x1 + 0.5 && st.kind !== 'slope') t *= 0.1;
  return Math.max(0, t);
}

/** the real depth (m, positive down) of a world y on this floor */
export const depthOf = (plan: LevelPlan, y: number) => plan.depth0 - y;
/** the floor's depth span: its first shelf to its exit pit's bottom */
export function depthSpan(plan: LevelPlan): [number, number] { return [depthOf(plan, plan.base), depthOf(plan, plan.exit.bottom)]; }

/** mark the bins around x explored; returns true if anything new was revealed */
export function explore(plan: LevelPlan, x: number, r = 14): boolean {
  let any = false;
  for (let b = Math.max(0, Math.floor((x - r) / BIN)); b <= Math.min(plan.explored.length - 1, Math.floor((x + r) / BIN)); b++) if (!plan.explored[b]) { plan.explored[b] = 1; any = true; }
  return any;
}

/** the default floors from an area down the progression (dev jumps; v6 runs choose theirs at the crossroads) */
export { AREA_ORDER };
export function floorAreas(start: string, count: number): string[] {
  // a hadal start (dev previews): hadal floors all the way
  if (start.startsWith('hadal:')) return Array.from({ length: count }, (_, k) => (k === 0 ? start : 'hadal:' + ['vents', 'trench', 'bones', 'crystal'][k % 4]));
  const i = Math.max(0, AREA_ORDER.indexOf(start));
  return Array.from({ length: count }, (_, k) => AREA_ORDER[Math.min(AREA_ORDER.length - 1, i + k)]);
}
/** floors in a run at a mastery level: 3 at mastery 0 (masteryScalars().floors wins when the hideout defines it) */
export function floorsForMastery(m: number, scal?: { floors?: number }): number {
  if (scal && typeof scal.floors === 'number') return Math.max(1, Math.min(8, scal.floors));
  return m >= 6 ? 5 : m >= 3 ? 4 : 3;
}
