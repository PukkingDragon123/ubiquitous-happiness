// Floor plans: each floor is ONE long side-scrolling level (~300-400 m) that DESCENDS as you travel: the seabed
// steps down in terraces (cliffs to swim over and down, steep slopes, narrow shafts with overhanging lips) about
// 28-40 m over the floor, with the arenas and points of interest on flat-ish shelves along the way.
//
//   start     floor 1: you dive in from the surface; deeper floors: you drop in down a rock shaft from above
//   travel    open water with a drop-off (cliff / slope / shaft / steps) plus terrain features (a mid-water ledge
//             that splits off an upper lane, a boulder mound, a shallow trench) and sometimes a roaming group
//   arena     an encounter zone on a shelf: gates rise on both sides, enemies spawn, the gates sink with loot
//   branch    the seabed dips into a cave under a rock lid: the upper path runs over the lid, the lower one through
//             the cave and its CHALLENGE arena (a mini-boss + a reward chest); the two rejoin past it
//   poi       Mr. Crab's shop, the post office (the manatee), a treasure nook (a locked chest or a pedestal on a
//             ledge), a secret pit under a cracked rock lid (bomb it)
//   boss      the deepest shelf: the skull gate, the boss arena and, past it, the EXIT PIT under a grate: a shaft
//             down into the next biome (and, after the last planned floor, a rope back up to the surface)
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
export interface GroupPlan { id: number; x: number; n: number; seed: number; spawned: boolean; cleared: boolean }

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
}

export interface LevelOpts { n: number; area: string; seed: number; mastery?: number; depth0?: number; rope?: boolean }

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
  const first = o.n === 0 && (o.depth0 ?? 0) <= 0;
  const top = first ? (a.ice ? -2.6 : -0.6) : ENTRY_TOP;
  const base = first ? -11 : -14;
  const plan: LevelPlan = {
    n: o.n, area: o.area, seed: o.seed, W: 0, base, amp: Math.min(a.amp, 2.6), top, depth0: o.depth0 ?? 0,
    arenas: [], pois: [], solids: [], dips: [], groups: [], steps: [], flats: [], lanes: [], explored: [], startX: 8.5, bossX0: 0,
    exit: { x0: 0, x1: 0, top: 0, bottom: 0 }, ropeX: null,
  };
  let x = 0, level = base;
  const poi = (kind: PoiKind, px: number, py: number, extra: Partial<PoiPlan> = {}) => { const p: PoiPlan = { id: plan.pois.length, kind, x: px, y: py, known: kind !== 'secret', done: false, ...extra }; plan.pois.push(p); return p; };
  const solid = (kind: SolidPlan['kind'], x0: number, x1: number, y0: number, y1: number, poiId?: number) => { plan.solids.push({ id: plan.solids.length, kind, x0, x1, y0, y1, poi: poiId }); };
  const arena = (kind: ArenaPlan['kind'], x0: number, x1: number, floor: number, aTop: number) => { plan.arenas.push({ id: plan.arenas.length, kind, x0, x1, floor, top: aTop, seed: (o.seed ^ Math.imul(plan.arenas.length + 1, 0x85ebca6b)) >>> 0, cleared: false }); };
  const arenaTop = (lv: number) => Math.min(top, lv + ARENA_H);
  // ---- the order first (the descent budget is spread over the travel stretches)
  const nArenas = Math.min(5, 3 + Math.floor((o.n + (o.mastery ?? 0) / 3) * 0.6));
  type Seg = 'arena' | 'travel' | 'branch' | 'shop' | 'post' | 'treasure' | 'secret';
  const pois = r.shuffle<Seg>(['shop', 'post', 'treasure', 'secret']);
  const order: Seg[] = ['travel'];
  const branchAt = r.int(1, nArenas - 1);
  let pi = 0;
  for (let k = 0; k < nArenas; k++) {
    order.push('arena', 'travel');
    if (pi < pois.length) order.push(pois[pi++]);
    if (k === branchAt) order.push('travel', 'branch');
    order.push('travel');
  }
  while (pi < pois.length) order.push(pois[pi++], 'travel');
  order.push('travel');
  const travels = order.filter((s) => s === 'travel').length;
  const descent = r.range(28, 38);
  // drops: one per travel stretch (a couple stay flat), shares of the floor's descent
  const shares = Array.from({ length: travels }, (_, i) => (i === 0 ? 0.6 : r.chance(0.18) ? 0 : r.range(0.6, 1.6)));
  const sum = shares.reduce((s2, v) => s2 + v, 0) || 1;
  const drops = shares.map((v) => (v / sum) * descent);
  let ti = 0;
  // ---- segments
  const seg = {
    start: () => {
      if (first) { poi('start', 8, base + 4, { done: true }); plan.flats.push([0, 17]); x = 18; return; }
      // the entry shaft: rock walls either side from the shelf up to the ceiling; you drop in from the top
      poi('start', 8.5, base + 4, { done: true });
      solid('wall', 0, 4.2, base - 1, top + 3);
      solid('wall', 12.8, 16, base + 4.5, top + 3);
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
      }
      const upper = level, lower = level - drop;
      const f = r.next();
      if (f < 0.35 && L2 >= 20) {
        // a mid-water ledge over the lower shelf: an upper lane
        const lx0 = sx + w + 2, lx1 = Math.min(x0 + L2 - 2, lx0 + r.range(8, 13)), ly = lower + r.range(5, 6.5);
        if (lx1 - lx0 > 5) { solid('ledge', lx0, lx1, ly, ly + r.range(1.2, 1.8)); plan.lanes.push({ kind: 'upper', x0: lx0, x1: lx1 }); }
      } else if (f < 0.6 && sx - x0 > 9) {
        solid('mound', x0 + 2, x0 + 7, upper - 1, upper + r.range(2, 3.2));
      } else if (f < 0.75 && x0 + L2 - (sx + w) > 12) {
        plan.dips.push({ x0: sx + w + 2, x1: x0 + L2 - 1, depth: r.range(2, 3), ramp: 4 });
      }
      if (group) plan.groups.push({ id: plan.groups.length, x: sx + w + 5, n: r.int(2, 3), seed: (o.seed ^ Math.imul(plan.groups.length + 11, 0x27d4eb2f)) >>> 0, spawned: false, cleared: false });
      level = lower;
      x = x0 + L2;
    },
    arena: () => { const x0 = x + 2, x1 = x0 + ARENA_W; arena('arena', x0, x1, level - 0.3, arenaTop(level)); plan.flats.push([x0 - 2, x1 + 2]); x = x1 + 2; },
    branch: () => {
      // the seabed dips into a cave; a lid of rock roofs it, the challenge arena inside
      const x0 = x, L = 46, x1 = x0 + L, depth = 7.5;
      plan.dips.push({ x0: x0 + 4, x1: x1 - 4, depth, ramp: 6 });
      const lid0 = x0 + 9, lid1 = x1 - 9, ly0 = level - 0.6, ly1 = level + 1.0;
      solid('lid', lid0, lid1, ly0, ly1);
      plan.flats.push([x0 + 8, x1 - 8]);
      const ax0 = lid0 + 1.5, ax1 = lid1 - 1.5;
      arena('challenge', ax0, ax1, level - depth - 0.3, ly0);
      poi('challenge', (ax0 + ax1) / 2, level - depth + 1, {});
      plan.lanes.push({ kind: 'cave', x0: x0 + 6, x1: x1 - 6 });
      x = x1;
    },
    shop: () => { poi('shop', x + 9, level + 1); plan.flats.push([x + 1, x + 17]); x += 18; },
    post: () => { poi('post', x + 8, level + 4); plan.flats.push([x + 2, x + 14]); x += 16; },
    treasure: () => {
      const style = r.chance(0.55) ? 'chest' : 'pedestal';
      const ly = level + r.range(4, 5.5), lx0 = x + 3, lx1 = x + 12;
      const p = poi('treasure', (lx0 + lx1) / 2, ly + 1.3, { style });
      solid('ledge', lx0, lx1, ly - 1.4, ly, p.id);
      plan.lanes.push({ kind: 'upper', x0: lx0, x1: lx1 });
      plan.flats.push([x + 1, x + 14]);
      x += 15;
    },
    secret: () => {
      const px0 = x + 4, px1 = x + 13;
      plan.dips.push({ x0: px0, x1: px1, depth: 5.5, ramp: 1.4 });
      const p = poi('secret', (px0 + px1) / 2, level - 4, { opened: false });
      solid('cracked', px0 - 0.8, px1 + 0.8, level - 0.9, level + 0.35, p.id);
      plan.flats.push([x + 1, x + 16]);
      x += 17;
    },
    boss: () => {
      plan.bossX0 = x + 2;
      const x0 = x + 5, x1 = x0 + 34;
      arena('boss', x0, x1, level - 0.3, arenaTop(level));
      poi('boss', (x0 + x1) / 2, level + 5);
      // the exit pit, past the boss: a shaft down under an iron grate
      const ex0 = x1 + 2, ex1 = ex0 + 5.2;
      plan.dips.push({ x0: ex0 - 0.6, x1: ex1 + 0.6, depth: EXIT_DEPTH, ramp: 0.9 });
      plan.exit = { x0: ex0, x1: ex1, top: level, bottom: level - EXIT_DEPTH };
      solid('grate', ex0 - 0.8, ex1 + 0.8, level - 0.7, level + 0.25);
      if (o.rope) plan.ropeX = x0 + 7;
      plan.flats.push([x, ex1 + 6]);
      x = ex1 + 6;
    },
  };
  seg.start();
  for (const s of order) {
    if (s === 'travel') seg.travel(r.range(14, 22), x > 30 && r.chance(0.5));
    else seg[s]();
  }
  seg.boss();
  plan.W = x;
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
