// Floor generation: Binding-of-Isaac style room layouts on a grid, seeded.
//
//   const f = genFloor({ n: 0, area: 'reef', seed: 1234, rooms: 12 });
//   f.rooms[f.start]  the start room; f.rooms[f.boss] the boss room (the farthest dead end)
//   room.doors.L = id of the room through the left wall (U/D = shafts up / down)
//
// The algorithm is Isaac's: a breadth-first walk out from the start cell that only adds a cell when it would
// touch exactly one existing room (so the map branches into corridors and dead ends), retried until the room
// count is met and there are enough dead ends for the special rooms. The boss takes the farthest dead end, then
// treasure, shop, post office and challenge take the next ones. A secret room goes in an empty cell touching
// two or more rooms; it connects through cracked walls you bomb open.
//
// Grid y grows DOWN (deeper): door 'D' leads one cell down a shaft, 'U' up one.
import { Rng } from '../core/rng';

export type RoomType = 'start' | 'combat' | 'treasure' | 'shop' | 'post' | 'challenge' | 'secret' | 'boss';
export type Dir = 'L' | 'R' | 'U' | 'D';
export const DIRS: Dir[] = ['L', 'R', 'U', 'D'];
export const DXY: Record<Dir, [number, number]> = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
export const OPP: Record<Dir, Dir> = { L: 'R', R: 'L', U: 'D', D: 'U' };

export interface RoomNode {
  id: number;
  gx: number; gy: number;
  type: RoomType;
  /** neighbour room id per wall */
  doors: Partial<Record<Dir, number>>;
  /** doors that start as cracked walls (to / from the secret room): bomb them open */
  cracked: Partial<Record<Dir, boolean>>;
  /** BFS distance from the start room */
  depth: number;
  /** per-room seed (layout, enemies, dressing) */
  seed: number;
  /** arena template index (obstacle layout) */
  layout: number;
  /** ceiling style: 'cave' (solid rock) or 'open' (water above, rock lip with gaps) */
  roof: 'cave' | 'open';
  // ---- live state (saved with the run)
  /** shown on the minimap (adjacent to a visited room) */
  seen: boolean;
  visited: boolean;
  cleared: boolean;
  /** doors unlocked with a key / walls bombed (by dir) */
  opened: Partial<Record<Dir, boolean>>;
  /** what the room still holds: pedestal item, shop stock, a chest... (filled on first build) */
  loot: RoomLoot | null;
}

export interface ShopSlot { kind: 'item' | 'heart' | 'key' | 'bomb'; id?: string; price: number; sold: boolean }
export interface RoomLoot {
  /** treasure / boss / secret pedestal item (taken = '') */
  pedestal?: string;
  pedestalTaken?: boolean;
  shop?: ShopSlot[];
  /** a chest (challenge reward) */
  chest?: { open: boolean; items: string[] };
  /** pickups lying on the floor when the player left (counter kinds and item ids) */
  floor?: { kind: string; id?: string; x: number; y: number; n?: number; level?: number }[];
}

export interface Floor {
  /** 0-based floor index in the run */
  n: number;
  area: string;
  seed: number;
  rooms: RoomNode[];
  start: number;
  boss: number;
  /** grid extents */
  x0: number; y0: number; x1: number; y1: number;
}

export interface FloorOpts { n: number; area: string; seed: number; rooms?: number; secret?: boolean }

const GW = 9, GH = 8;
/** how many obstacle layouts the room builder knows (rooms pick one by seed) */
export const LAYOUTS = 8;

export function genFloor(o: FloorOpts): Floor {
  const want = Math.max(8, Math.min(16, o.rooms ?? 10 + Math.min(4, o.n)));
  for (let attempt = 0; attempt < 400; attempt++) {
    const f = tryGen(o, want, (o.seed + attempt * 7919) >>> 0, attempt > 120);
    if (f) return f;
  }
  // can't happen in practice; a straight line keeps the run alive
  return line(o, want);
}

function tryGen(o: FloorOpts, want: number, seed: number, lax: boolean): Floor | null {
  const r = new Rng(seed);
  const grid = new Map<number, number>(); // cell key -> room id
  const key = (x: number, y: number) => y * 64 + x;
  const cells: { gx: number; gy: number }[] = [];
  const sx = 4, sy = r.int(2, 3);
  const at = (x: number, y: number) => grid.get(key(x, y));
  const filledNb = (x: number, y: number) => DIRS.reduce((n, d) => n + (at(x + DXY[d][0], y + DXY[d][1]) !== undefined ? 1 : 0), 0);
  const add = (x: number, y: number) => { grid.set(key(x, y), cells.length); cells.push({ gx: x, gy: y }); };
  add(sx, sy);
  const q: number[] = [0];
  while (q.length && cells.length < want) {
    const id = q.shift()!;
    const c = cells[id];
    // vertical moves (shafts) are a little rarer than side doors: a side-view map reads wider than tall
    const dirs = r.shuffle([...DIRS]);
    for (const d of dirs) {
      if (cells.length >= want) break;
      const nx = c.gx + DXY[d][0], ny = c.gy + DXY[d][1];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      if (at(nx, ny) !== undefined) continue;
      if (filledNb(nx, ny) > 1) continue;
      if (r.chance(d === 'U' || d === 'D' ? 0.62 : 0.45)) continue;
      add(nx, ny);
      q.push(cells.length - 1);
    }
    // the walk died early: restart from a random room
    if (!q.length && cells.length < want) q.push(r.int(0, cells.length - 1));
  }
  if (cells.length < want) return null;
  // neighbours (every touching cell connects: Isaac maps have no walls between adjacent rooms)
  const rooms: RoomNode[] = cells.map((c, id) => ({
    id, gx: c.gx, gy: c.gy, type: 'combat', doors: {}, cracked: {}, depth: -1, seed: (seed ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0,
    layout: 0, roof: 'cave', seen: false, visited: false, cleared: false, opened: {}, loot: null,
  }));
  for (const rm of rooms) for (const d of DIRS) { const nb = at(rm.gx + DXY[d][0], rm.gy + DXY[d][1]); if (nb !== undefined) rm.doors[d] = nb; }
  // depth from the start
  rooms[0].depth = 0;
  const bq = [0];
  while (bq.length) { const id = bq.shift()!; for (const nb of Object.values(rooms[id].doors)) if (rooms[nb!].depth < 0) { rooms[nb!].depth = rooms[id].depth + 1; bq.push(nb!); } }
  // dead ends (one door, not the start), farthest first
  const ends = rooms.filter((rm) => rm.id !== 0 && Object.keys(rm.doors).length === 1).sort((a, b) => b.depth - a.depth);
  const need = lax ? 4 : 5;
  if (ends.length < need) return null;
  // the boss room must be at least 3 rooms away and entered from the side (its big door is a wall door)
  const boss = ends[0];
  if (boss.depth < 3) return null;
  const bossDir = Object.keys(boss.doors)[0] as Dir;
  if (bossDir === 'U' || bossDir === 'D') { if (!lax) return null; }
  rooms[0].type = 'start';
  boss.type = 'boss';
  const specials: RoomType[] = ['treasure', 'shop', 'post', 'challenge'];
  const rest = r.shuffle(ends.slice(1));
  // the treasure room prefers a dead end near-ish the start, the challenge a far one
  rest.sort((a, b) => a.depth - b.depth);
  const order: RoomType[] = [];
  for (let i = 0; i < Math.min(rest.length, specials.length); i++) order.push(specials[i]);
  // spread: nearest -> treasure, then shop, post, the farthest -> challenge
  if (rest.length >= 4) { rest[0].type = 'treasure'; rest[1].type = 'shop'; rest[2].type = 'post'; rest[rest.length - 1].type = 'challenge'; }
  else rest.forEach((rm, i) => { rm.type = order[i]; });
  // layouts + roofs
  for (const rm of rooms) {
    const rr = new Rng(rm.seed);
    rm.layout = rm.type === 'combat' || rm.type === 'challenge' ? rr.int(0, LAYOUTS - 1) : 0;
    rm.roof = rm.type === 'boss' ? 'cave' : rr.chance(0.45) ? 'open' : 'cave';
  }
  // the secret room: an empty cell next to two or more rooms (never the boss), connected by cracked walls
  if (o.secret !== false) {
    let best: { x: number; y: number; n: number } | null = null;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (at(x, y) !== undefined) continue;
      const nbs = DIRS.map((d) => at(x + DXY[d][0], y + DXY[d][1])).filter((v): v is number => v !== undefined && rooms[v].type !== 'boss' && rooms[v].type !== 'start');
      if (nbs.length < 2) continue;
      const n = nbs.length + r.next() * 0.9;
      if (!best || n > best.n) best = { x, y, n };
    }
    if (best) {
      const id = rooms.length;
      const sec: RoomNode = {
        id, gx: best.x, gy: best.y, type: 'secret', doors: {}, cracked: {}, depth: 99, seed: (seed ^ 0x5ec7e7) >>> 0,
        layout: 0, roof: 'cave', seen: false, visited: false, cleared: true, opened: {}, loot: null,
      };
      for (const d of DIRS) {
        const nb = at(best.x + DXY[d][0], best.y + DXY[d][1]);
        if (nb === undefined || rooms[nb].type === 'boss' || rooms[nb].type === 'start') continue;
        sec.doors[d] = nb; sec.cracked[d] = true;
        rooms[nb].doors[OPP[d]] = id; rooms[nb].cracked[OPP[d]] = true;
      }
      rooms.push(sec);
      grid.set(key(best.x, best.y), id);
    }
  }
  rooms[0].seen = true; rooms[0].visited = true; rooms[0].cleared = true;
  for (const nb of Object.values(rooms[0].doors)) if (!rooms[0].cracked[dirTo(rooms[0], nb!)]) rooms[nb!].seen = true;
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
  for (const rm of rooms) { x0 = Math.min(x0, rm.gx); y0 = Math.min(y0, rm.gy); x1 = Math.max(x1, rm.gx); y1 = Math.max(y1, rm.gy); }
  return { n: o.n, area: o.area, seed, rooms, start: 0, boss: boss.id, x0, y0, x1, y1 };
}

/** the wall of `rm` that leads to room `to` */
export function dirTo(rm: RoomNode, to: number): Dir { return (Object.keys(rm.doors) as Dir[]).find((d) => rm.doors[d] === to) ?? 'L'; }

function line(o: FloorOpts, want: number): Floor {
  const rooms: RoomNode[] = [];
  for (let i = 0; i < want; i++) rooms.push({ id: i, gx: i, gy: 0, type: i === 0 ? 'start' : i === want - 1 ? 'boss' : 'combat', doors: {}, cracked: {}, depth: i, seed: o.seed + i, layout: i % LAYOUTS, roof: 'cave', seen: i < 2, visited: i === 0, cleared: i === 0, opened: {}, loot: null });
  for (let i = 0; i < want; i++) { if (i > 0) rooms[i].doors.L = i - 1; if (i < want - 1) rooms[i].doors.R = i + 1; }
  rooms[1].type = 'treasure'; rooms[2].type = 'shop'; rooms[3].type = 'post';
  return { n: o.n, area: o.area, seed: o.seed, rooms, start: 0, boss: want - 1, x0: 0, y0: 0, x1: want - 1, y1: 0 };
}

/** reveal the neighbours of a visited room on the minimap (cracked walls stay hidden) */
export function reveal(f: Floor, id: number) {
  const rm = f.rooms[id];
  rm.seen = true; rm.visited = true;
  for (const d of DIRS) { const nb = rm.doors[d]; if (nb === undefined) continue; if (rm.cracked[d] && !rm.opened[d]) continue; f.rooms[nb].seen = true; }
}

/** does this door exist for the player right now (a cracked wall counts only once bombed) */
export function doorOpenable(rm: RoomNode, d: Dir) { return rm.doors[d] !== undefined && (!rm.cracked[d] || !!rm.opened[d]); }

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
