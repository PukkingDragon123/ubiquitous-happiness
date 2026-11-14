// Floor plans: each floor is ONE long side-scrolling level (~280-400 m) laid out as a seeded run of segments:
//
//   start     the arrival (a current drops the blobfish in from above)
//   travel    open water with terrain features (a mid-water ledge that splits off an upper lane, a boulder mound,
//             a shallow trench) and sometimes a roaming enemy group
//   arena     an encounter zone: gates rise on both sides, the enemies spawn, the gates drop with a reward burst
//   branch    the seabed dips into a cave under a rock lid: the upper path runs over the lid, the lower one through
//             the cave and its CHALLENGE arena (a mini-boss + a reward chest); the two rejoin past it
//   poi       Mr. Crab's shop, the post office buoy (the manatee), a treasure nook (a locked chest or a pedestal
//             on a ledge), a secret pit under a cracked rock lid (bomb it)
//   boss      the far end: a big skull gate, the boss arena, then the current down to the next floor
//
//   const plan = genLevel({ n: 0, area: 'reef', seed: 1234, mastery: 0 });
//   plan.bedAt(x)   seabed (bedrock) height; plan.arenas / plan.pois / plan.solids / plan.dips / plan.groups
//
// Everything here is data (saved with the run: cleared arenas, used POIs, explored spans); src/dungeon/levelBuild.ts
// turns it into scenery, terrain and props.
import { Rng } from '../core/rng';
import { fbm, smooth } from '../core/math';
import { areaDef } from '../area/defs';

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
/** a solid rock body on the gameplay plane (rounded box) */
export interface SolidPlan { id: number; kind: 'ledge' | 'lid' | 'cracked' | 'mound'; x0: number; x1: number; y0: number; y1: number; poi?: number }
/** a dip in the bedrock (caves, pits, trenches): depth at the middle, ramps of `ramp` metres */
export interface DipPlan { x0: number; x1: number; depth: number; ramp: number }
export interface GroupPlan { id: number; x: number; n: number; seed: number; spawned: boolean; cleared: boolean }

export interface LevelPlan {
  n: number; area: string; seed: number;
  /** level length: x runs 0 .. W */
  W: number;
  /** mean seabed level and relief */
  base: number; amp: number;
  /** the water column's usable top (the surface, or under the ice) */
  top: number;
  arenas: ArenaPlan[]; pois: PoiPlan[]; solids: SolidPlan[]; dips: DipPlan[]; groups: GroupPlan[];
  /** zones the relief is flattened in (arenas, POIs) */
  flats: [number, number][];
  /** minimap lane hints */
  lanes: { kind: 'upper' | 'cave'; x0: number; x1: number }[];
  /** explored 4 m bins (saved) */
  explored: number[];
  startX: number;
  bossX0: number;
}

export interface LevelOpts { n: number; area: string; seed: number; mastery?: number; floors?: number }

export const BIN = 4;
export const ARENA_W = 26;

export function genLevel(o: LevelOpts): LevelPlan {
  const a = areaDef(o.area);
  const r = new Rng(o.seed);
  const base = a.floor;
  const top = a.ice ? -2.6 : -0.6;
  const plan: LevelPlan = {
    n: o.n, area: a.id, seed: o.seed, W: 0, base, amp: a.amp, top,
    arenas: [], pois: [], solids: [], dips: [], groups: [], flats: [], lanes: [], explored: [], startX: 9, bossX0: 0,
  };
  let x = 0;
  const poi = (kind: PoiKind, px: number, py: number, extra: Partial<PoiPlan> = {}) => { const p: PoiPlan = { id: plan.pois.length, kind, x: px, y: py, known: kind !== 'secret', done: false, ...extra }; plan.pois.push(p); return p; };
  const solid = (kind: SolidPlan['kind'], x0: number, x1: number, y0: number, y1: number, poiId?: number) => { plan.solids.push({ id: plan.solids.length, kind, x0, x1, y0, y1, poi: poiId }); };
  const arena = (kind: ArenaPlan['kind'], x0: number, x1: number, floor: number, aTop: number) => { plan.arenas.push({ id: plan.arenas.length, kind, x0, x1, floor, top: aTop, seed: (o.seed ^ Math.imul(plan.arenas.length + 1, 0x85ebca6b)) >>> 0, cleared: false }); };
  // ---- segments
  const seg = {
    start: () => { poi('start', 8, base + 4, { done: true }); plan.flats.push([0, 17]); x = 18; },
    travel: (L: number, group: boolean) => {
      const x0 = x, x1 = x + L;
      const f = r.next();
      if (f < 0.4 && L >= 20) {
        // a mid-water ledge: an upper lane over a lower one
        const lx0 = x0 + r.range(3, 6), lx1 = Math.min(x1 - 3, lx0 + r.range(10, 16)), ly = base + r.range(5, 6.5);
        solid('ledge', lx0, lx1, ly, ly + r.range(1.2, 1.8));
        plan.lanes.push({ kind: 'upper', x0: lx0, x1: lx1 });
      } else if (f < 0.65) {
        solid('mound', x0 + L * 0.5 - 2.5, x0 + L * 0.5 + 2.5, base - 1, base + r.range(2, 3.2));
      } else if (f < 0.85) {
        plan.dips.push({ x0: x0 + 3, x1: x1 - 3, depth: r.range(2.5, 3.5), ramp: 5 });
      }
      if (group) plan.groups.push({ id: plan.groups.length, x: x0 + L * 0.55, n: r.int(2, 3), seed: (o.seed ^ Math.imul(plan.groups.length + 11, 0x27d4eb2f)) >>> 0, spawned: false, cleared: false });
      x = x1;
    },
    arena: () => { const x0 = x + 2, x1 = x0 + ARENA_W; arena('arena', x0, x1, base - 0.3, top); plan.flats.push([x0 - 2, x1 + 2]); x = x1 + 2; },
    branch: () => {
      // the seabed dips into a cave; a lid of rock roofs it, the challenge arena inside
      const x0 = x, L = 46, x1 = x0 + L, depth = 7.5;
      plan.dips.push({ x0: x0 + 4, x1: x1 - 4, depth, ramp: 6 });
      const lid0 = x0 + 9, lid1 = x1 - 9, ly0 = base - 0.6, ly1 = base + 1.0;
      solid('lid', lid0, lid1, ly0, ly1);
      plan.flats.push([x0 + 8, x1 - 8]);
      const ax0 = lid0 + 1.5, ax1 = lid1 - 1.5;
      arena('challenge', ax0, ax1, base - depth - 0.3, ly0);
      poi('challenge', (ax0 + ax1) / 2, base - depth + 1, {});
      plan.lanes.push({ kind: 'cave', x0: x0 + 6, x1: x1 - 6 });
      x = x1;
    },
    shop: () => { poi('shop', x + 9, base + 1); plan.flats.push([x + 1, x + 17]); x += 18; },
    post: () => { poi('post', x + 8, -0.4); plan.flats.push([x + 2, x + 14]); x += 16; },
    treasure: () => {
      const style = r.chance(0.55) ? 'chest' : 'pedestal';
      const ly = base + r.range(4, 5.5), lx0 = x + 3, lx1 = x + 12;
      const p = poi('treasure', (lx0 + lx1) / 2, ly + 1.3, { style });
      solid('ledge', lx0, lx1, ly - 1.4, ly, p.id);
      plan.lanes.push({ kind: 'upper', x0: lx0, x1: lx1 });
      x += 15;
    },
    secret: () => {
      const px0 = x + 4, px1 = x + 13;
      plan.dips.push({ x0: px0, x1: px1, depth: 5.5, ramp: 1.4 });
      const p = poi('secret', (px0 + px1) / 2, base - 4, { opened: false });
      solid('cracked', px0 - 0.8, px1 + 0.8, base - 0.9, base + 0.35, p.id);
      plan.flats.push([x + 1, x + 16]);
      x += 17;
    },
    boss: () => {
      plan.bossX0 = x + 2;
      const x0 = x + 5, x1 = x0 + 36;
      arena('boss', x0, x1, base - 0.3, top);
      poi('boss', (x0 + x1) / 2, base + 5);
      plan.flats.push([x, x1 + 4]);
      x = x1 + 3;
    },
  };
  // ---- the order: start, then arenas interleaved with travel and the POIs, the branch somewhere in the middle
  const nArenas = Math.min(5, 3 + Math.floor((o.n + (o.mastery ?? 0) / 3) * 0.7));
  type PoiSeg = 'shop' | 'post' | 'treasure' | 'secret';
  const pois = r.shuffle<PoiSeg>(['shop', 'post', 'treasure', 'secret']);
  seg.start();
  seg.travel(r.range(10, 14), false);
  const branchAt = r.int(1, nArenas - 1);
  let pi = 0;
  for (let k = 0; k < nArenas; k++) {
    seg.arena();
    seg.travel(r.range(10, 16), r.chance(0.55));
    if (pi < pois.length) seg[pois[pi++]]();
    if (k === branchAt) { seg.travel(r.range(6, 10), false); seg.branch(); }
    seg.travel(r.range(6, 12), r.chance(0.45));
  }
  while (pi < pois.length) { seg[pois[pi++]](); seg.travel(r.range(10, 14), r.chance(0.4)); }
  seg.travel(r.range(8, 12), false);
  seg.boss();
  plan.W = x;
  plan.explored = new Array(Math.ceil(plan.W / BIN) + 1).fill(0);
  return plan;
}

/** the bedrock height at x (relief flattened in arenas / POIs, dips cut in) */
export function bedAt(plan: LevelPlan, x: number): number {
  const s = plan.seed % 9973;
  let flat = 0;
  for (const [a, b] of plan.flats) flat = Math.max(flat, smooth(a - 5, a, x) * smooth(b + 5, b, x));
  let y = plan.base + ((fbm(x * 0.028, 0.5, 4, s) - 0.5) * 2 * plan.amp * 0.7 + (fbm(x * 0.13, 3.1, 2, s + 9) - 0.5) * plan.amp * 0.3) * (1 - flat * 0.85);
  y -= 0.35;
  for (const d of plan.dips) {
    if (x < d.x0 || x > d.x1) continue;
    const k = Math.min(smooth(d.x0, d.x0 + d.ramp, x), smooth(d.x1, d.x1 - d.ramp, x));
    y -= d.depth * k;
  }
  // cliffs close the level at both ends
  y += smooth(4, -14, x) * 14 + smooth(plan.W - 3, plan.W + 14, x) * 14;
  return Math.min(y, plan.top - 2);
}

/** sand thickness at x */
export function sandAt(plan: LevelPlan, x: number): number {
  const s = plan.seed % 9973;
  let t = 0.35 + fbm(x * 0.05, 7.7, 3, s + 21) * 0.8;
  if (fbm(x * 0.09, 2.2, 2, s + 22) < 0.33) t *= 0.2;
  // no sand slumping into the pits and caves
  for (const d of plan.dips) if (x > d.x0 - 1 && x < d.x1 + 1 && d.depth > 4) t *= 0.15;
  return Math.max(0, t);
}

/** mark the bins around x explored; returns true if anything new was revealed */
export function explore(plan: LevelPlan, x: number, r = 14): boolean {
  let any = false;
  for (let b = Math.max(0, Math.floor((x - r) / BIN)); b <= Math.min(plan.explored.length - 1, Math.floor((x + r) / BIN)); b++) if (!plan.explored[b]) { plan.explored[b] = 1; any = true; }
  return any;
}

/** the run's floors: from the starting area down the progression (extra floors repeat the deepest) */
export const AREA_ORDER = ['reef', 'kelp', 'graveyard', 'arctic', 'abyss'];
export function floorAreas(start: string, count: number): string[] {
  const i = Math.max(0, AREA_ORDER.indexOf(start));
  return Array.from({ length: count }, (_, k) => AREA_ORDER[Math.min(AREA_ORDER.length - 1, i + k)]);
}
/** floors in a run at a mastery level: 3 at mastery 0 (masteryScalars().floors wins when the hideout defines it) */
export function floorsForMastery(m: number, scal?: { floors?: number }): number {
  if (scal && typeof scal.floors === 'number') return Math.max(1, Math.min(8, scal.floors));
  return m >= 6 ? 5 : m >= 3 ? 4 : 3;
}
