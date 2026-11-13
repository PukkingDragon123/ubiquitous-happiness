// Mastery levels (cumulative modifiers: win a run at level N to unlock N+1) and the starting areas a run can
// begin in. The run code reads masteryScalars(level) for the numbers; the TV shows the text.
import { Px, hex, mix } from '../gfx/px';
import { hash2 } from '../core/math';

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

/** a little 64 x 40 pixel postcard of an area (for the TV run config) */
const thumbs = new Map<string, HTMLCanvasElement>();
export function areaThumb(id: string): HTMLCanvasElement {
  const hit = thumbs.get(id);
  if (hit) return hit;
  const W = 64, H = 40, p = new Px(W, H);
  const pal: Record<string, [string, string, string]> = {
    reef: ['#7ad8e8', '#1a8ab0', '#d8c890'], kelp: ['#6ac8a0', '#145a50', '#5a6a3a'], graveyard: ['#5a8a90', '#122a38', '#4a4038'],
    arctic: ['#d8f4ff', '#3a7ab0', '#a8c8d8'], abyss: ['#1a2a5a', '#02040e', '#1a1a2a'],
  };
  const [top, deep, floor] = pal[id] ?? pal.reef;
  p.fill((x, y) => { const t = y / H; const c = mix(hex(top), hex(deep), Math.min(1, t * 1.3)); return ((x + y) % 2 && t > 0.3 && t < 0.35) ? mix(c, hex(top), 0.3) : c; });
  // light shafts
  if (id !== 'abyss') for (let i = 0; i < 4; i++) { const x0 = 8 + i * 15; for (let y = 0; y < H - 8; y++) for (let k = 0; k < 3; k++) { const x = x0 + k + Math.floor(y * 0.3); if ((x + y) % 2 === 0) p.blend(x, y, top, 0.25); } }
  // seabed
  for (let x = 0; x < W; x++) { const h = 32 + Math.round(Math.sin(x * 0.2) * 1.5 + hash2(x, 1, 3) * 1.2); for (let y = h; y < H; y++) p.set(x, y, mix(hex(floor), hex('#000000'), (y - h) * 0.08 + (hash2(x, y, 2) > 0.8 ? 0.15 : 0))); }
  if (id === 'reef') for (let i = 0; i < 6; i++) { const x = 6 + i * 10, c = ['#ff6a8a', '#ffb03a', '#c06aff'][i % 3]; for (let y = 0; y < 6 + (i % 3) * 2; y++) { p.set(x + (y % 3 === 0 ? 1 : 0), 31 - y, c); if (y > 2 && y % 2) p.set(x + 2, 31 - y, c); } }
  if (id === 'kelp') for (let i = 0; i < 7; i++) { const x0 = 4 + i * 9; for (let y = 4; y < 33; y++) { const x = x0 + Math.round(Math.sin(y * 0.25 + i) * 1.5); p.set(x, y, '#2a5a1a'); if (y % 4 === 0) p.set(x + 1, y, '#4a8a2a'); } }
  if (id === 'graveyard') { p.poly([[10, 33], [14, 22], [40, 20], [52, 26], [50, 33]], '#2a2622'); p.rect(26, 10, 2, 12, '#2a2622'); p.line(27, 10, 40, 20, '#3a3430'); p.rect(30, 24, 3, 3, '#0a0a0a'); }
  if (id === 'arctic') { p.poly([[0, 0], [64, 0], [64, 6], [48, 9], [30, 5], [14, 10], [0, 6]], '#eaf8ff'); for (let x = 0; x < 64; x += 7) p.line(x + 3, 6, x + 4, 12, '#bfe8ff'); }
  if (id === 'abyss') { for (let i = 0; i < 12; i++) p.set(Math.floor(hash2(i, 1, 9) * 64), Math.floor(hash2(i, 2, 9) * 30), '#6ad8ff'); p.circle(44, 20, 1.5, '#fff6a0'); p.line(44, 20, 40, 24, '#3a4a6a'); p.ellipse(38, 26, 5, 3, '#0a0e1a'); }
  // a tiny blobfish
  p.ellipse(20, 26, 3, 2, '#f4a0b4'); p.set(22, 25, '#2a0a10');
  // frame
  for (let x = 0; x < W; x++) { p.set(x, 0, '#000000'); p.set(x, H - 1, '#000000'); }
  for (let y = 0; y < H; y++) { p.set(0, y, '#000000'); p.set(W - 1, y, '#000000'); }
  const cv = p.canvas();
  thumbs.set(id, cv);
  return cv;
}
