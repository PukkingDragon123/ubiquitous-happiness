// Painted prop surfaces shared by wrecks, crates, nodes, the buoy and landmarks: one region per surface in the
// area's prop atlas (planks old / fresh / holed, painted hull, rusty steel, rope, sail cloth, brass, ore, gems,
// shells, bone, ice). Realistic low-saturation pixel textures at ~32-64 px per metre.
import type { Atlas } from '../world/atlas';
import type { UVR } from '../world/lp';
import { paintPlanks, paintMetal } from '../world/texlib';
import { ramp, hex, mix, pxNoise, worley, RGB } from '../gfx/px';
import { hash2 } from '../core/math';
import { Rng } from '../core/rng';
import type { AreaDef } from './defs';

export type PropRegion = 'planksOld' | 'planksHoles' | 'planksNew' | 'hullPaint' | 'hullPaintHoles' | 'steel' | 'steelHoles' | 'deck' | 'rope' | 'sail' | 'sailTorn' |
  'brass' | 'iron' | 'rock' | 'copper' | 'ironOre' | 'gold' | 'gemViolet' | 'gemCyan' | 'gemGreen' | 'gemRed' | 'mana' | 'shell' | 'shellPink' | 'pearl' |
  'bone' | 'ice' | 'crate' | 'glassLit' | 'buoyRed' | 'buoyWhite' | 'postBlue' | 'lamp' | 'kelpBundle' | 'black' | 'flag';

export class PropKit {
  constructor(public A: Atlas, public a: AreaDef) {}

  get(r: PropRegion): UVR {
    const A = this.A, a = this.a;
    switch (r) {
      case 'planksOld': return A.paint(r, 64, 64, (p, w, h) => paintPlanks(p, w, h, { base: woodOld(a), seed: 11, rot: 0.55, algae: algae(a), barnacles: a.id === 'arctic' ? 0 : 26, nails: true }));
      case 'planksHoles': return A.paint(r, 64, 64, (p, w, h) => { paintPlanks(p, w, h, { base: woodOld(a), seed: 11, rot: 0.55, algae: algae(a), barnacles: 20, nails: true }); holes(p, w, h, 5); });
      case 'planksNew': return A.paint(r, 64, 64, (p, w, h) => paintPlanks(p, w, h, { base: ['#3a2410', '#6a4420', '#9a6a34', '#c8945a', '#e8b878'], seed: 21, nails: true }));
      case 'deck': return A.paint(r, 64, 64, (p, w, h) => paintPlanks(p, w, h, { base: woodOld(a).map((c) => c), seed: 31, rot: 0.4, algae: algae(a), plankH: 6 }));
      case 'hullPaint': return A.paint(r, 64, 64, (p, w, h) => hullPaint(p, w, h, a, false));
      case 'hullPaintHoles': return A.paint(r, 64, 64, (p, w, h) => { hullPaint(p, w, h, a, true); holes(p, w, h, 4); });
      case 'steel': return A.paint(r, 64, 64, (p, w, h) => paintMetal(p, w, h, { paint: steelPaint(a), rust: 0.45, seed: 41, rivets: 1, plate: 16 }));
      case 'steelHoles': return A.paint(r, 64, 64, (p, w, h) => { paintMetal(p, w, h, { paint: steelPaint(a), rust: 0.55, seed: 41, rivets: 1, plate: 16 }); holes(p, w, h, 4); });
      case 'rope': return A.paint(r, 8, 32, (p, w, h) => { const R = ramp(['#2a2010', '#5a4a2a', '#8a7448', '#b8a070'], 5, 0.7); p.fill((x, y) => R(0.5 + (((x + y) % 4) < 2 ? 0.25 : -0.15) + (hash2(x, y, 3) - 0.5) * 0.15, x, y)); });
      case 'sail': return A.paint(r, 48, 48, (p, w, h) => sail(p, w, h, false));
      case 'sailTorn': return A.paint(r, 48, 48, (p, w, h) => sail(p, w, h, true));
      case 'brass': return A.paint(r, 16, 16, (p, w, h) => { const R = ramp(['#2a1a08', '#6a4a18', '#b08a3a', '#f0d080'], 6, 0.7); p.fill((x, y) => R(0.45 + (pxNoise(x, y, 4, 2, 5) - 0.5) * 0.6 + (x + y < 8 ? 0.2 : 0), x, y)); });
      case 'iron': return A.paint(r, 16, 16, (p, w, h) => paintMetal(p, w, h, { paint: ['#141414', '#242424', '#343434', '#4a4a4a'], rust: 0.5, seed: 51 }));
      case 'rock': return A.paint(r, 32, 32, (p, w, h) => { const R = ramp(a.pal.rock, 8, 0.7); p.fill((x, y) => { const [f1, f2] = worley(x, y, 9, 4, 32); return R(0.45 + (pxNoise(x, y, 8, 3, 3, 32) - 0.5) * 0.6 - (f2 - f1 < 1 ? 0.25 : 0), x, y); }); });
      case 'copper': return A.paint(r, 16, 16, (p, w, h) => nugget(p, w, h, ['#2a1408', '#7a3a18', '#c8703a', '#f0b080'], '#3a9a7a'));
      case 'ironOre': return A.paint(r, 16, 16, (p, w, h) => nugget(p, w, h, ['#1a1818', '#4a4040', '#7a6a62', '#b0a098'], '#8a4a2a'));
      case 'gold': return A.paint(r, 16, 16, (p, w, h) => nugget(p, w, h, ['#3a2808', '#8a6418', '#e0b030', '#fff0a0'], null));
      case 'gemViolet': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, ['#1a0830', '#4a1a7a', '#8a4ac8', '#d0a8ff']));
      case 'gemCyan': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, ['#082030', '#1a5a7a', '#40b0d0', '#b0f0ff']));
      case 'gemGreen': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, ['#082010', '#1a6a2a', '#40c060', '#b0ffc0']));
      case 'gemRed': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, ['#300808', '#7a1a1a', '#d04040', '#ffb0a0']));
      case 'mana': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, ['#101040', '#2a3aa0', '#5a8aff', '#d0f0ff']));
      case 'shell': return A.paint(r, 16, 16, (p, w, h) => { const R = ramp(['#5a4838', '#a08870', '#d8c4a8', '#fff4e4'], 6, 0.7); p.fill((x, y) => R(0.5 + Math.sin(x * 1.6) * 0.2 + (y % 5 === 0 ? -0.15 : 0) + (hash2(x, y, 2) - 0.5) * 0.12, x, y)); });
      case 'shellPink': return A.paint(r, 16, 16, (p, w, h) => { const R = ramp(['#5a2a2a', '#b06060', '#f0a0a0', '#fff0e8'], 6, 0.7); p.fill((x, y) => R(0.5 + Math.sin(x * 1.6) * 0.2 + (y % 4 === 0 ? -0.18 : 0) + (hash2(x, y, 4) - 0.5) * 0.12, x, y)); });
      case 'pearl': return A.paint(r, 8, 8, (p, w, h) => p.fill((x, y) => mix(hex('#e8e4f0'), hex('#fffaf0'), Math.max(0, 1 - Math.hypot(x - 2.5, y - 2.5) / 5)) as RGB));
      case 'bone': return A.paint(r, 16, 32, (p, w, h) => { const R = ramp(['#4a4438', '#8a8270', '#c8c0a8', '#ece8d8'], 6, 0.7); p.fill((x, y) => R(0.55 + (pxNoise(x, y, 5, 2, 7) - 0.5) * 0.5 + (hash2(x, y, 8) > 0.95 ? -0.3 : 0), x, y)); });
      case 'ice': return A.paint(r, 32, 32, (p, w, h) => { const R = ramp(['#2a5a7a', '#5a9ac0', '#a0d8f0', '#e8f8ff', '#ffffff'], 7, 0.7); p.fill((x, y) => { const [f1, f2] = worley(x, y, 10, 9, 32); return R(0.5 + (pxNoise(x, y, 10, 3, 9, 32) - 0.5) * 0.5 + (f2 - f1 < 1 ? 0.3 : 0) - y / 128, x, y); }); });
      case 'crate': return A.paint(r, 32, 32, (p, w, h) => { paintPlanks(p, w, h, { base: woodOld(a), seed: 61, rot: 0.3, algae: algae(a), plankH: 8, nails: true }); for (let i = 0; i < w; i++) { p.set(i, 0, '#141008'); p.set(i, h - 1, '#141008'); p.set(0, i, '#141008'); p.set(w - 1, i, '#141008'); p.set(i, i, '#3a2a18'); } });
      case 'glassLit': return A.paint(r, 8, 8, (p, w, h) => p.fill((x, y) => mix(hex('#ffd890'), hex('#fff8e0'), Math.max(0, 1 - Math.hypot(x - 3.5, y - 3.5) / 4)) as RGB));
      case 'lamp': return A.paint(r, 8, 8, (p, w, h) => p.fill(() => hex('#fff0c0')));
      case 'black': return A.paint(r, 4, 4, (p) => p.fill(() => [10, 10, 12]));
      case 'buoyRed': return A.paint(r, 16, 32, (p, w, h) => paintMetal(p, w, h, { paint: ['#4a0a08', '#8a1a12', '#c03020', '#e05a40'], rust: 0.25, seed: 71, plate: 64 }));
      case 'buoyWhite': return A.paint(r, 16, 16, (p, w, h) => paintMetal(p, w, h, { paint: ['#7a7a74', '#b8b8b0', '#e0e0d8', '#fafaf4'], rust: 0.2, seed: 73, plate: 64 }));
      case 'postBlue': return A.paint(r, 16, 16, (p, w, h) => paintMetal(p, w, h, { paint: ['#0a1430', '#1a2a5a', '#2a4a8a', '#4a6ab0'], rust: 0.15, seed: 75, plate: 64 }));
      case 'kelpBundle': return A.paint(r, 16, 32, (p, w, h) => { const R = ramp(['#2a1e08', '#5a4614', '#8a7224', '#c8a840'], 6, 0.7); p.fill((x, y) => R(0.5 + Math.sin(y * 0.9 + x) * 0.15 + (x % 4 === 0 ? -0.2 : 0) + (hash2(x, y, 9) - 0.5) * 0.1, x, y)); });
      case 'flag': return A.paint(r, 24, 16, (p, w, h) => { p.fill((x, y) => (y < 8 ? hex('#1a2a5a') : hex('#e8e0d0'))); for (let i = 0; i < 6; i++) p.set(4 + i, 3, '#f0d070'); p.set(6, 2, '#f0d070'); p.set(7, 4, '#f0d070'); });
    }
    return A.get('black');
  }
}

const woodOld = (a: AreaDef) => a.id === 'graveyard' ? ['#14120c', '#2a261a', '#46402c', '#625a40', '#7e7454'] :
  a.id === 'arctic' ? ['#1a1a1c', '#34322e', '#504a40', '#6e665a', '#8e8678'] :
    a.id === 'abyss' ? ['#0a0a0c', '#1a1a1e', '#2c2a2c', '#403c3a', '#56504a'] :
      ['#1e160c', '#3a2c18', '#5a4626', '#7a6238', '#9a7e50'];
const algae = (a: AreaDef) => (a.id === 'arctic' ? '#9aa8a8' : a.id === 'abyss' ? '#3a4a5a' : a.id === 'kelp' ? '#5a6a2a' : '#4a6a3a');
const steelPaint = (a: AreaDef) => (a.id === 'abyss' ? ['#3a2a08', '#7a5a14', '#b08a2a', '#d8b050'] : a.id === 'arctic' ? ['#1a1010', '#4a1a14', '#7a2a20', '#a04030'] : ['#141a1c', '#283234', '#3e4a4c', '#5a6668']);

function holes(p: { set(x: number, y: number, c: RGB | string, a?: number): void }, w: number, h: number, n: number) {
  const rng = new Rng(97 + n);
  for (let k = 0; k < n; k++) {
    const cx = rng.range(6, w - 6), cy = rng.range(6, h - 6), r = rng.range(3, 7);
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const d = Math.hypot((x - cx) * 0.8, y - cy) + (hash2(x, y, k) - 0.5) * 2.5;
      if (d < r) p.set(x, y, mix([6, 6, 8], [16, 14, 12], hash2(x, y, 1)) as RGB);
      else if (d < r + 1.6) p.set(x, y, mix([60, 44, 28], [120, 96, 64], hash2(x, y, 2)) as RGB); // splintered rim
    }
  }
}

function hullPaint(p: { set(x: number, y: number, c: RGB | string, a?: number): void }, w: number, h: number, a: AreaDef, worn: boolean) {
  // painted planks: a coloured top strake, a white band, antifouling below, all chipped and fouled
  const top = a.id === 'kelp' ? ['#0a2a1a', '#1a4a2a', '#2a6a3a', '#4a8a52'] : ['#2a0a08', '#5a1a14', '#8a2a20', '#b04a38'];
  const R1 = ramp(top, 6, 0.7), R2 = ramp(['#6a6a60', '#a8a89a', '#d8d4c4', '#f0ece0'], 6, 0.7), R3 = ramp(['#200a08', '#4a1a14', '#6a2a1c', '#8a3e28'], 6, 0.7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ph = 8, pi = Math.floor(y / ph), py = y - pi * ph;
    const n = pxNoise(x, y, 6, 3, 13);
    const R = y < h * 0.3 ? R1 : y < h * 0.4 ? R2 : R3;
    let c = R(0.5 + (n - 0.5) * 0.4 + (py === 0 ? -0.35 : 0), x, y);
    const chip = pxNoise(x, y, 5, 2, 17);
    if (chip > (worn ? 0.6 : 0.7)) c = mix(c, hex('#4a3a24'), 0.75);
    if (pxNoise(x, y, 9, 2, 19) > 0.72) c = mix(c, hex(algae(a)), 0.6);
    p.set(x, y, c);
  }
}

function sail(p: { set(x: number, y: number, c: RGB | string, a?: number): void; fill(fn: (x: number, y: number) => RGB | [number, number, number, number] | null): void }, w: number, h: number, torn: boolean) {
  const R = ramp(['#4a4436', '#8a826a', '#c0b896', '#e4dcc0'], 6, 0.7);
  p.fill((x, y) => {
    if (torn) {
      const edge = pxNoise(x, y, 6, 3, 23);
      if (edge > 0.62 || (y > h * 0.55 && pxNoise(x, y * 0.4, 4, 2, 29) > 0.45)) return null;
    }
    let k = 0.55 + (pxNoise(x, y, 8, 2, 27) - 0.5) * 0.4 + (x % 12 === 0 ? -0.2 : 0);
    if (pxNoise(x, y, 7, 2, 31) > 0.7) k -= 0.25; // stains
    return R(k, x, y);
  });
}

function nugget(p: { fill(fn: (x: number, y: number) => RGB | null): void }, w: number, h: number, pal: string[], patina: string | null) {
  const R = ramp(pal, 6, 0.7);
  p.fill((x, y) => {
    const [f1, f2] = worley(x, y, 5, 3, 16);
    let c = R(0.35 + Math.min(1, f2 / 6) * 0.5 + (x + y < 10 ? 0.15 : 0) + (f2 - f1 < 0.8 ? -0.2 : 0), x, y);
    if (patina && pxNoise(x, y, 4, 2, 5) > 0.66) c = mix(c, hex(patina), 0.6);
    if (hash2(x, y, 7) > 0.94) c = mix(c, [255, 250, 230], 0.6);
    return c;
  });
}

function gem(p: { fill(fn: (x: number, y: number) => RGB | null): void }, w: number, h: number, pal: string[]) {
  const R = ramp(pal, 6, 0.7);
  p.fill((x, y) => {
    const facet = Math.floor(x / 4) % 2;
    let k = 0.35 + (1 - y / h) * 0.35 + facet * 0.15 + (pxNoise(x, y, 4, 2, 9) - 0.5) * 0.15;
    if ((x + y * 2) % 11 === 0) k += 0.35; // internal flashes
    return R(k, x, y);
  });
}
