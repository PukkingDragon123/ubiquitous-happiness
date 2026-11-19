// Strip minimap DATA for the HUD (agent L draws it: src/ui/hud3.ts StripMap) — v4: the WHOLE JOURNEY, not just this
// floor. x is metres from home (the home marker sits at the left edge, x = 0); y is the real depth (0 = the surface,
// 1 = the deepest the strip has to show). Floors you've passed stay on it, fully explored, with their landmarks
// (arenas beaten, the shop, the post office, secrets found, bosses) as done markers.
//
//   const strip = journeyStrip(legs, plan, player.x, player.y, { floors: 3 });
//   strip.far          metres from home now (also handed to the HUD as data.far)
//   strip.legs         the stages so far: { x0, x1, name } in metres from home (stage boundaries / labels)
import type { StripMap, StripPoi } from '../ui/hud3';
import { bedAt, BIN, depthOf, type LevelPlan } from './level';
import { biomeDef } from './biomes';

/** a floor already travelled: its span from home, its seabed (real depth every LEG_STEP m) and its landmarks */
export interface JourneyLeg {
  far0: number; W: number; name: string; area: string;
  /** real depth of the seabed, sampled every LEG_STEP metres */
  seabed: number[];
  marks: { type: StripPoi['type']; x: number; d: number }[];
}
export const LEG_STEP = 8;

/** the strip's extra fields (agent L: `far` is the distance readout; `legs` mark the stage boundaries) */
export interface JourneyStrip extends StripMap {
  far: number;
  home: number;
  legs: { x0: number; x1: number; name: string }[];
  /** the current floor's span on the strip */
  stage: { x0: number; x1: number };
}

/** snapshot a floor for the journey record (call when you leave it) */
export function legOf(plan: LevelPlan): JourneyLeg {
  const seabed: number[] = [];
  for (let x = 0; x <= plan.W; x += LEG_STEP) seabed.push(depthOf(plan, bedAt(plan, x)));
  const marks: JourneyLeg['marks'] = [];
  for (const p of plan.pois) {
    if (p.kind === 'start' || (p.kind === 'secret' && !p.opened)) continue;
    marks.push({ type: p.kind as StripPoi['type'], x: plan.far0 + p.x, d: depthOf(plan, p.y) });
  }
  for (const a of plan.arenas) if (a.kind === 'arena' && a.cleared) marks.push({ type: 'arena', x: plan.far0 + (a.x0 + a.x1) / 2, d: depthOf(plan, a.floor + 3) });
  return { far0: plan.far0, W: plan.W, name: biomeDef(plan.area).name, area: plan.area, seabed, marks };
}

const SAMPLES = 128;

export function journeyStrip(legs: JourneyLeg[], plan: LevelPlan, px: number, py: number, o: { floors: number; revealAll?: boolean }): JourneyStrip {
  const L = Math.max(1, plan.far0 + plan.W);
  // the vertical scale: the deepest seabed on the strip so far (at least 60 m, so the reef doesn't look like a trench)
  const curDeep = depthOf(plan, plan.exit.bottom);
  let deep = Math.max(60, curDeep);
  for (const lg of legs) for (const d of lg.seabed) deep = Math.max(deep, d);
  const ny = (d: number) => Math.max(0, Math.min(1, d / (deep * 1.05)));
  const depthAtFar = (x: number): number => {
    if (x >= plan.far0) return depthOf(plan, bedAt(plan, Math.min(plan.W, x - plan.far0)));
    const lg = legs.find((g) => x >= g.far0 && x < g.far0 + g.W) ?? legs[legs.length - 1];
    if (!lg) return depthOf(plan, plan.base);
    const i = Math.max(0, Math.min(lg.seabed.length - 1, Math.round((x - lg.far0) / LEG_STEP)));
    return lg.seabed[i];
  };
  const seabed: number[] = [];
  for (let i = 0; i < SAMPLES; i++) seabed.push(ny(depthAtFar(((i + 0.5) / SAMPLES) * L)));
  // explored: every floor behind you, then this floor's bins
  const explored: [number, number][] = plan.far0 > 0 ? [[0, plan.far0]] : [];
  let run = -1;
  for (let b = 0; b < plan.explored.length; b++) {
    const on = o.revealAll || !!plan.explored[b];
    if (on && run < 0) run = b;
    if ((!on || b === plan.explored.length - 1) && run >= 0) { explored.push([plan.far0 + run * BIN, plan.far0 + Math.min(plan.W, (on ? b + 1 : b) * BIN)]); run = -1; }
  }
  const seen = (x: number) => o.revealAll || !!plan.explored[Math.max(0, Math.min(plan.explored.length - 1, Math.floor(x / BIN)))];
  const pois: StripPoi[] = [{ type: 'start', x: 0, y: 0.04, known: true, done: false }];
  for (const lg of legs) for (const m of lg.marks) pois.push({ type: m.type, x: m.x, y: ny(m.d), known: true, done: true });
  for (const p of plan.pois) {
    if (p.kind === 'start') continue;
    const known = p.kind === 'secret' ? !!p.opened : p.kind === 'boss' ? true : seen(p.x);
    if (p.kind === 'secret' && !known) continue;
    pois.push({ type: p.kind as StripPoi['type'], x: plan.far0 + p.x, y: ny(depthOf(plan, p.y)), known, done: p.done });
  }
  for (const a of plan.arenas) {
    if (a.kind !== 'arena') continue;
    pois.push({ type: 'arena', x: plan.far0 + (a.x0 + a.x1) / 2, y: ny(depthOf(plan, a.floor + 3)), known: seen((a.x0 + a.x1) / 2), done: a.cleared });
  }
  const far = plan.far0 + px;
  return {
    length: L, explored, player: far, playerY: ny(depthOf(plan, py)),
    lanes: plan.lanes.map((l) => ({ kind: l.kind, x0: plan.far0 + l.x0, x1: plan.far0 + l.x1 })), seabed, pois,
    floor: plan.n + 1, floors: o.floors, name: biomeDef(plan.area).name,
    far, home: 0,
    legs: [...legs.map((g) => ({ x0: g.far0, x1: g.far0 + g.W, name: g.name })), { x0: plan.far0, x1: plan.far0 + plan.W, name: biomeDef(plan.area).name }],
    stage: { x0: plan.far0, x1: plan.far0 + plan.W },
  };
}

/** v3's per-floor strip (kept for previews) */
export function stripMap(plan: LevelPlan, px: number, py: number, o: { floors: number; revealAll?: boolean }): StripMap {
  return journeyStrip([], { ...plan, far0: 0 }, px, py, o);
}
