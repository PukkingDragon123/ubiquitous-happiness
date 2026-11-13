// Act map generation (Slay-the-Spire style): a single start node at the bottom (front of the diorama, +z),
// 3-5 lanes of branching, never-crossing currents, a treasure row in the middle, a rest row before the
// boss, and one boss node at the top (back of the diorama, -z). Deterministic from the run seed + act.
//
//   const map = ensureActMap(run, run.act);     // generates + stores in run.map when needed
//   availableIds(map, run)                       // node ids the player may pick right now
//   visitNode(run, node)                          // mark it current + visited (call when a node is entered)
import type { Run } from '../game/run';
import { Rng } from '../core/rng';

export type NodeType = 'fishing' | 'elite' | 'shop' | 'rest' | 'treasure' | 'mystery' | 'boss';
export type SpotId = 'pier' | 'rowboatCove' | 'kelpForest' | 'harbor' | 'reef' | 'iceHole' | 'trawlerLane' | 'sunsetBay';
/** a LOOKS key (src/gfx/lighting.ts) */
export type Biome = 'reef' | 'kelp' | 'harbor' | 'arctic' | 'abyss' | 'sunset';
/** diorama palette of a stretch of the act (several per act; 'trench' is a darker abyss) */
export type ZoneId = 'reef' | 'kelp' | 'sunset' | 'harbor' | 'arctic' | 'abyss' | 'trench';

export interface MapNode {
  id: number;
  row: number;
  lane: number;
  /** diorama coordinates (metres): x across, z along the act (start at z = 0, boss at the most negative z) */
  x: number;
  z: number;
  type: NodeType;
  spot: SpotId;
  biome: Biome;
  zone: ZoneId;
  next: number[];
  prev: number[];
  /** act + progress through the act (1.0 .. ~2.6 in act 1, 2.0 .. ~3.6 in act 2 ...); elites +0.6, boss +1 */
  difficulty: number;
  /** human fishing lines at the spot (fishing / elite) */
  lines: number;
  /** water condition flavour, e.g. 'calm water' */
  water: string;
  title: string;
  blurb: string;
  seed: number;
}

export interface Zone { id: ZoneId; biome: Biome; row0: number; row1: number }

export interface ActMap {
  act: number;
  seed: number;
  name: string;
  rows: number;
  lanes: number;
  nodes: MapNode[];
  startId: number;
  bossId: number;
  zones: Zone[];
  /** diorama extents */
  width: number;
  zFront: number;
  zBack: number;
  /** z where zone k ends and zone k+1 begins (zones.length - 1 entries) */
  zoneZ: number[];
}

interface ActDef { name: string; zones: ZoneId[]; boss: [string, string]; elite: number }
export const ACTS: Record<number, ActDef> = {
  1: { name: 'The Sunlit Shallows', zones: ['reef', 'kelp', 'sunset'], boss: ['The Reel King', 'Golden rod · golden ego'], elite: 0.09 },
  2: { name: 'Rusthook & the Frostline', zones: ['harbor', 'arctic'], boss: ['Captain Frostbeard', 'Icebreaker · harpoon reels'], elite: 0.12 },
  3: { name: 'The Trawler Abyss', zones: ['abyss', 'trench'], boss: ['The Leviathan Trawler', 'Factory nets · no mercy'], elite: 0.15 },
};

export const ZONE_BIOME: Record<ZoneId, Biome> = { reef: 'reef', kelp: 'kelp', sunset: 'sunset', harbor: 'harbor', arctic: 'arctic', abyss: 'abyss', trench: 'abyss' };

const SPOTS: Record<ZoneId, [SpotId, number][]> = {
  reef: [['reef', 4], ['pier', 2], ['rowboatCove', 2]],
  kelp: [['kelpForest', 4], ['rowboatCove', 2], ['pier', 1]],
  sunset: [['sunsetBay', 4], ['rowboatCove', 2], ['pier', 1]],
  harbor: [['harbor', 4], ['pier', 3], ['rowboatCove', 1]],
  arctic: [['iceHole', 4], ['pier', 1], ['harbor', 1]],
  abyss: [['trawlerLane', 4], ['harbor', 1], ['pier', 1]],
  trench: [['trawlerLane', 4], ['iceHole', 1], ['harbor', 1]],
};

const WATER: Record<ZoneId, string[]> = {
  reef: ['calm water', 'crystal shallows', 'gentle swell', 'sunny & clear'],
  kelp: ['kelp tangles', 'green murk', 'swaying fronds', 'cool current'],
  sunset: ['golden hour', 'warm current', 'long shadows', 'low sun glare'],
  harbor: ['oily water', 'busy docks', 'foghorn fog', 'rusty chop'],
  arctic: ['icy water', 'thin ice', 'snow squall', 'frost fog'],
  abyss: ['pitch dark', 'net drag', 'heavy swell', 'deck lights'],
  trench: ['crushing deep', 'lantern glow', 'abyssal cold', 'storm swell'],
};

export const SPOT_NAME: Record<SpotId, string> = {
  pier: 'Old Pier', rowboatCove: 'Rowboat Cove', kelpForest: 'Kelp Forest', harbor: 'Harbor Docks',
  reef: 'Coral Reef', iceHole: 'Ice Hole', trawlerLane: 'Trawler Lane', sunsetBay: 'Sunset Bay',
};

/** world layout constants (metres in the diorama) */
export const LAYOUT = { laneW: 3.05, rowH: 3.0, margin: 4.2, front: 4.6, back: 8.0 };

export function generateActMap(run: Run, act: number): ActMap {
  const seed = (run.seed ^ Math.imul(act + 1, 0x2c1b3c6d)) >>> 0;
  const rng = new Rng(seed).fork(act * 977 + 13);
  const def = ACTS[act] ?? ACTS[((act - 1) % 3) + 1];
  const R = rng.int(13, 15);            // rows incl. start (0) and boss (R-1)
  const C = act === 1 ? rng.int(4, 5) : 5;
  // ---- paths on the lane grid (rows 1 .. R-2), never crossing
  const cells = new Set<string>();
  const edges = new Set<string>();
  const key = (r: number, c: number) => r + ':' + c;
  const ekey = (r: number, c: number, c2: number) => r + ':' + c + '>' + c2;
  const P = C + 1;
  let first = -1;
  for (let p = 0; p < P; p++) {
    let c = rng.int(0, C - 1);
    if (p === 1) while (c === first) c = rng.int(0, C - 1);
    if (p === 0) first = c;
    cells.add(key(1, c));
    for (let r = 1; r < R - 2; r++) {
      const opts: number[] = [];
      for (const c2 of [c - 1, c, c + 1]) {
        if (c2 < 0 || c2 >= C) continue;
        if (c2 === c + 1 && edges.has(ekey(r, c + 1, c))) continue;
        if (c2 === c - 1 && edges.has(ekey(r, c - 1, c))) continue;
        opts.push(c2);
      }
      const c2 = opts.length ? rng.weighted(opts, (o) => (o === c ? 1.0 : 1.15) * (cells.has(key(r + 1, o)) ? 0.8 : 1)) : c;
      edges.add(ekey(r, c, c2));
      c = c2;
      cells.add(key(r + 1, c));
    }
  }
  // ---- nodes
  const nodes: MapNode[] = [];
  const idAt = new Map<string, number>();
  const rowX = Array.from({ length: R }, () => rng.range(-0.35, 0.35));
  const rowZ: number[] = [0];
  for (let r = 1; r < R; r++) rowZ.push(rowZ[r - 1] - LAYOUT.rowH * rng.range(0.92, 1.08) - (r === R - 1 ? 1.6 : 0));
  const mk = (row: number, lane: number, x: number, z: number): MapNode => {
    const n: MapNode = {
      id: nodes.length, row, lane, x, z, type: 'fishing', spot: 'pier', biome: 'reef', zone: def.zones[0], next: [], prev: [],
      difficulty: 1, lines: 1, water: '', title: '', blurb: '', seed: rng.int(0, 1 << 30),
    };
    nodes.push(n);
    return n;
  };
  const start = mk(0, (C - 1) / 2, 0, 0);
  for (let r = 1; r <= R - 2; r++) for (let c = 0; c < C; c++) {
    if (!cells.has(key(r, c))) continue;
    const x = (c - (C - 1) / 2) * LAYOUT.laneW + rowX[r] + rng.range(-0.4, 0.4);
    const n = mk(r, c, x, rowZ[r] + rng.range(-0.3, 0.3));
    idAt.set(key(r, c), n.id);
  }
  const boss = mk(R - 1, (C - 1) / 2, 0, rowZ[R - 1]);
  const link = (a: MapNode, b: MapNode) => { if (!a.next.includes(b.id)) { a.next.push(b.id); b.prev.push(a.id); } };
  for (const e of edges) {
    const [rs, rest] = e.split(':');
    const [cs, c2s] = rest.split('>');
    const r = +rs;
    link(nodes[idAt.get(key(r, +cs))!], nodes[idAt.get(key(r + 1, +c2s))!]);
  }
  for (const n of nodes) {
    if (n.row === 1) link(start, n);
    if (n.row === R - 2) link(n, boss);
  }
  for (const n of nodes) n.next.sort((a, b) => nodes[a].x - nodes[b].x);
  // ---- zones (front to back)
  const zones: Zone[] = def.zones.map((id, i) => {
    const k = def.zones.length;
    return { id, biome: ZONE_BIOME[id], row0: Math.round((i * R) / k), row1: Math.round(((i + 1) * R) / k) - 1 };
  });
  const zoneOfRow = (r: number) => zones.find((z) => r >= z.row0 && r <= z.row1) ?? zones[zones.length - 1];
  const zoneZ: number[] = [];
  for (let i = 0; i + 1 < zones.length; i++) zoneZ.push((rowZ[zones[i].row1] + rowZ[zones[i + 1].row0]) / 2);
  // ---- types (StS rules, adapted)
  const treasureRow = Math.floor((R - 2) / 2) + 1;
  const W = { fishing: 0.47, mystery: 0.22, elite: def.elite, rest: 0.12, shop: 0.07 } as Record<NodeType, number>;
  for (const n of nodes) {
    const zone = zoneOfRow(n.row);
    n.zone = zone.id; n.biome = zone.biome;
    if (n === start) { n.type = 'fishing'; continue; }
    if (n === boss) { n.type = 'boss'; continue; }
    if (n.row === 1 || n.row === 2) { n.type = n.row === 2 && rng.chance(0.25) ? 'mystery' : 'fishing'; continue; }
    if (n.row === treasureRow) { n.type = 'treasure'; continue; }
    if (n.row === R - 2) { n.type = 'rest'; continue; }
    const parents = n.prev.map((i) => nodes[i]);
    const siblings = parents.flatMap((p) => p.next).filter((i) => i < n.id).map((i) => nodes[i]);
    const opts = (Object.keys(W) as NodeType[]).filter((t) => {
      if (t === 'elite' && n.row < 4) return false;
      if (t === 'rest' && (n.row < 4 || n.row >= R - 3)) return false;
      if ((t === 'elite' || t === 'rest' || t === 'shop') && parents.some((p) => p.type === t)) return false;
      if (t !== 'fishing' && siblings.some((s) => s.type === t)) return false;
      return true;
    });
    n.type = rng.weighted(opts, (t) => W[t]);
  }
  // at least one shop and one elite per act
  const mids = nodes.filter((n) => n.type === 'fishing' && n.row >= 4 && n.row < R - 3);
  if (!nodes.some((n) => n.type === 'shop') && mids.length) rng.pick(mids).type = 'shop';
  const mids2 = nodes.filter((n) => n.type === 'fishing' && n.row >= 5 && n.row < R - 2);
  if (!nodes.some((n) => n.type === 'elite') && mids2.length) rng.pick(mids2).type = 'elite';
  // ---- flavour
  for (const n of nodes) {
    const zr = n.zone;
    n.spot = rng.weighted(SPOTS[zr], (s) => s[1])[0];
    if (n === start) n.spot = act === 1 ? 'pier' : act === 2 ? 'harbor' : 'trawlerLane';
    n.water = rng.pick(WATER[zr]);
    const prog = n.row / (R - 1);
    n.difficulty = Math.round((act + prog + (n.type === 'elite' ? 0.6 : 0) + (n.type === 'boss' ? 1 : 0)) * 100) / 100;
    if (n.type === 'fishing') n.lines = Math.min(5, 1 + Math.floor(rng.next() * (1.6 + act * 0.6 + prog * 2)));
    else if (n.type === 'elite') n.lines = 3 + act + rng.int(0, 1);
    else if (n.type === 'boss') n.lines = 6 + act * 2;
    else n.lines = 0;
    const s = SPOT_NAME[n.spot];
    switch (n.type) {
      case 'fishing': n.title = s; n.blurb = `${n.lines} line${n.lines > 1 ? 's' : ''} · ${n.water}`; break;
      case 'elite': n.title = 'Pro Tournament'; n.blurb = `${n.lines} pro anglers · ${s}`; break;
      case 'shop': n.title = 'Hermit Crab Shop'; n.blurb = 'Shells, odd wares & bait'; break;
      case 'rest': {
        const spa = zr === 'arctic' || zr === 'abyss' || zr === 'trench' ? rng.chance(0.6) : rng.chance(0.25);
        n.title = spa ? 'Cleaner Station' : 'Sea Turtle Spa';
        n.blurb = spa ? 'Shrimp scrub · heal up' : 'Warm shallows · heal up';
        break;
      }
      case 'treasure': n.title = 'Shipwreck'; n.blurb = 'Something glints below'; break;
      case 'mystery': n.title = rng.pick(['Message in a Bottle', 'Strange Waters', 'Drifting Bottle']); n.blurb = 'Who knows what bobs here?'; break;
      case 'boss': n.title = def.boss[0]; n.blurb = def.boss[1]; break;
    }
  }
  const xs = nodes.map((n) => Math.abs(n.x));
  const width = Math.max(((C - 1) / 2) * LAYOUT.laneW, Math.max(...xs)) * 2 + LAYOUT.margin * 2;
  return {
    act, seed, name: def.name, rows: R, lanes: C, nodes, startId: start.id, bossId: boss.id, zones,
    width, zFront: LAYOUT.front, zBack: boss.z - LAYOUT.back, zoneZ,
  };
}

/** the stored map for this act, generating (and storing in run.map) when missing or stale */
export function ensureActMap(run: Run, act = run.act): ActMap {
  const m = run.map as ActMap | null;
  if (m && m.act === act && Array.isArray(m.nodes)) return m;
  const map = generateActMap(run, act);
  run.map = map;
  return map;
}

export function nodeById(map: ActMap, id: number): MapNode | undefined { return map.nodes[id]; }

/** ids the player may travel to now: the current node's exits, or the start node at the beginning of an act */
export function availableIds(map: ActMap, run: Run): number[] {
  const c = run.current;
  if (c && c.act === map.act && map.nodes[c.id]) return [...map.nodes[c.id].next];
  return [map.startId];
}

export function visitedIds(map: ActMap, run: Run): Set<number> {
  return new Set(run.visited.filter((v) => v.act === map.act).map((v) => v.id));
}

/** mark a node as entered: it becomes the current node and joins the visited trail */
export function visitNode(run: Run, node: MapNode, act = (run.map as ActMap | null)?.act ?? run.act) {
  run.current = { act, id: node.id };
  if (!run.visited.some((v) => v.act === act && v.id === node.id)) run.visited.push({ act, id: node.id });
  run.depth++;
}
