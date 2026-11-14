// Strip minimap DATA for the HUD (agent L draws it: src/ui/hud3.ts StripMap). The whole side-scrolling level as a
// horizontal strip: explored spans (fog elsewhere), the seabed profile, upper-lane / cave hints, POI glyphs and the
// player dot. Units are metres along the level (0 .. plan.W).
//
//   const strip = stripMap(plan, player.x, player.y, { floors: 3 });
import type { StripMap, StripPoi } from '../ui/hud3';
import { bedAt, BIN, type LevelPlan } from './level';
import { AREAS } from '../area/defs';

const SAMPLES = 96;

/** y (metres) -> strip 0 (the surface) .. 1 (the deepest point of the level) */
function normY(plan: LevelPlan, y: number, deep: number) { return Math.max(0, Math.min(1, -y / Math.max(4, -deep + 1))); }

/** the level's lowest bedrock (for the vertical scale); cached per plan */
const deepest = new WeakMap<LevelPlan, number>();
function deepOf(plan: LevelPlan) {
  let d = deepest.get(plan);
  if (d === undefined) { d = 0; for (let i = 0; i <= SAMPLES; i++) d = Math.min(d, bedAt(plan, (i / SAMPLES) * plan.W)); deepest.set(plan, d); }
  return d;
}

export function stripMap(plan: LevelPlan, px: number, py: number, o: { floors: number; revealAll?: boolean }): StripMap {
  const deep = deepOf(plan);
  // explored spans from the bins
  const explored: [number, number][] = [];
  let run = -1;
  for (let b = 0; b < plan.explored.length; b++) {
    const on = o.revealAll || !!plan.explored[b];
    if (on && run < 0) run = b;
    if ((!on || b === plan.explored.length - 1) && run >= 0) { explored.push([run * BIN, Math.min(plan.W, (on ? b + 1 : b) * BIN)]); run = -1; }
  }
  const seen = (x: number) => o.revealAll || !!plan.explored[Math.max(0, Math.min(plan.explored.length - 1, Math.floor(x / BIN)))];
  const seabed: number[] = [];
  for (let i = 0; i < SAMPLES; i++) seabed.push(normY(plan, bedAt(plan, ((i + 0.5) / SAMPLES) * plan.W), deep));
  const pois: StripPoi[] = [];
  for (const p of plan.pois) {
    if (p.kind === 'start') continue;
    // secrets show only once opened; the boss gate is always on the map; the rest once their spot is explored
    const known = p.kind === 'secret' ? !!p.opened : p.kind === 'boss' ? true : seen(p.x);
    if (p.kind === 'secret' && !known) continue;
    pois.push({ type: p.kind as StripPoi['type'], x: p.x, y: normY(plan, p.y, deep), known, done: p.done });
  }
  for (const a of plan.arenas) {
    if (a.kind !== 'arena') continue;
    pois.push({ type: 'arena', x: (a.x0 + a.x1) / 2, y: normY(plan, a.floor + 3, deep), known: seen((a.x0 + a.x1) / 2), done: a.cleared });
  }
  return {
    length: plan.W, explored, player: px, playerY: normY(plan, py, deep),
    lanes: plan.lanes.map((l) => ({ ...l })), seabed, pois,
    floor: plan.n + 1, floors: o.floors, name: AREAS[plan.area as keyof typeof AREAS]?.name ?? plan.area,
  };
}
