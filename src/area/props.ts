// Painted prop surfaces shared by wrecks, crates, nodes, the buoy and landmarks: one region per surface in the
// area's prop atlas (planks old / fresh / holed, painted hull, rusty steel, rope, sail cloth, brass, ore, gems,
// shells, bone, ice). Realistic low-saturation pixel textures at ~32-64 px per metre.
import type { Atlas } from '../world/atlas';
import type { UVR } from '../world/lp';
import { paintPlanks, paintMetal } from '../world/texlib';
import { hex, RGB } from '../gfx/px';
import { hueRamp } from '../world/pixart';
import { cells } from '../world/texlib';
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
      case 'planksNew': return A.paint(r, 64, 64, (p, w, h) => paintPlanks(p, w, h, { base: ['#3a2410', '#6a4420', '#a8743a', '#c8945a', '#e8b878'], seed: 21, nails: true }));
      case 'deck': return A.paint(r, 64, 64, (p, w, h) => paintPlanks(p, w, h, { base: woodOld(a), seed: 31, rot: 0.4, algae: algae(a), plankH: 6 }));
      case 'hullPaint': return A.paint(r, 64, 64, (p, w, h) => hullPaint(p, w, h, a));
      case 'hullPaintHoles': return A.paint(r, 64, 64, (p, w, h) => { hullPaint(p, w, h, a); holes(p, w, h, 4); });
      case 'steel': return A.paint(r, 64, 64, (p, w, h) => paintMetal(p, w, h, { paint: steelPaint(a), rust: 0.45, seed: 41, rivets: 1, plate: 16 }));
      case 'steelHoles': return A.paint(r, 64, 64, (p, w, h) => { paintMetal(p, w, h, { paint: steelPaint(a), rust: 0.55, seed: 41, rivets: 1, plate: 16 }); holes(p, w, h, 4); });
      case 'rope': return A.paint(r, 8, 32, (p) => { const T = hueRamp('#8a7448', 4); p.fill((x, y) => T[((x + y) % 4) < 2 ? 2 : (x + y) % 4 === 2 ? 3 : 1]); });
      case 'sail': return A.paint(r, 48, 48, (p, w, h) => sail(p, w, h, false));
      case 'sailTorn': return A.paint(r, 48, 48, (p, w, h) => sail(p, w, h, true));
      case 'brass': return A.paint(r, 16, 16, (p) => { const T = hueRamp('#b08a3a', 5); p.fill((x, y) => T[x + y < 7 ? 4 : x + y < 14 ? 3 : x + y < 22 ? 2 : 1]); });
      case 'iron': return A.paint(r, 16, 16, (p, w, h) => paintMetal(p, w, h, { paint: ['#141414', '#242424', '#3a3a3c', '#4a4a4a'], rust: 0.5, seed: 51, plate: 8 }));
      case 'rock': return A.paint(r, 32, 32, (p) => { const T = hueRamp(a.pal.rock[2], 5); p.fill((x, y) => { const c = cells(x, y, 11, 4, 32); const l = Math.hypot(c.dx, c.dy) || 1; const e = c.f2 - c.f1; return T[e < 0.9 ? 0 : e < 2.2 ? ((c.dx / l) * -0.6 + (c.dy / l) * -0.8 > 0.15 ? 4 : 1) : c.id > 0.5 ? 3 : 2]; }); });
      case 'copper': return A.paint(r, 16, 16, (p, w, h) => nugget(p, w, h, '#c8703a', '#3a9a7a'));
      case 'ironOre': return A.paint(r, 16, 16, (p, w, h) => nugget(p, w, h, '#7a6a62', '#8a4a2a'));
      case 'gold': return A.paint(r, 16, 16, (p, w, h) => nugget(p, w, h, '#e0b030', null));
      case 'gemViolet': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, '#8a4ac8'));
      case 'gemCyan': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, '#40b0d0'));
      case 'gemGreen': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, '#40c060'));
      case 'gemRed': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, '#d04040'));
      case 'mana': return A.paint(r, 16, 32, (p, w, h) => gem(p, w, h, '#5a8aff'));
      case 'shell': return A.paint(r, 16, 16, (p) => { const T = hueRamp('#d8c4a8', 5); p.fill((x, y) => T[(x % 4 === 0 ? 1 : x % 4 === 1 ? 3 : 2) + (y % 5 === 0 ? -1 : 0) + (y < 3 ? 1 : 0)]); });
      case 'shellPink': return A.paint(r, 16, 16, (p) => { const T = hueRamp('#e8a0a0', 5); p.fill((x, y) => T[(x % 4 === 0 ? 1 : x % 4 === 1 ? 3 : 2) + (y % 4 === 0 ? -1 : 0) + (y < 3 ? 1 : 0)]); });
      case 'pearl': return A.paint(r, 8, 8, (p) => { const T = hueRamp('#e8e4f0', 4); p.fill((x, y) => T[Math.hypot(x - 2.5, y - 2.5) < 1.6 ? 3 : Math.hypot(x - 2.5, y - 2.5) < 4 ? 2 : 1]); });
      case 'bone': return A.paint(r, 16, 32, (p) => { const T = hueRamp('#d8d0bc', 5); p.fill((x, y) => T[x < 3 ? 4 : x > 12 ? 1 : (y % 9 === 0 ? 1 : 3)]); });
      case 'ice': return A.paint(r, 32, 32, (p) => { const T = hueRamp('#9ad4ee', 5, { spread: 1.3 }); p.fill((x, y) => { const c = cells(x, y, 12, 9, 32); const e = c.f2 - c.f1, l = Math.hypot(c.dx, c.dy) || 1; return T[e < 0.8 ? 4 : e < 2 ? ((c.dx / l) * -0.6 + (c.dy / l) * -0.8 > 0.1 ? 4 : 1) : c.id > 0.6 ? 3 : 2]; }); });
      case 'crate': return A.paint(r, 32, 32, (p, w, h) => { paintPlanks(p, w, h, { base: woodOld(a), seed: 61, rot: 0.3, algae: algae(a), plankH: 8, nails: true }); const D = hueRamp(woodOld(a)[2], 4)[0]; for (let i = 0; i < w; i++) { p.set(i, 0, D); p.set(i, h - 1, D); p.set(0, i, D); p.set(w - 1, i, D); p.set(i, i, D); p.set(i + 1, i, hueRamp(woodOld(a)[2], 4)[3]); } });
      case 'glassLit': return A.paint(r, 8, 8, (p) => { const T = hueRamp('#ffd890', 4, { hi: 0.97 }); p.fill((x, y) => T[x === 0 || y === 0 || x === 7 || y === 7 ? 1 : x + y < 6 ? 3 : 2]); });
      case 'lamp': return A.paint(r, 8, 8, (p) => p.fill(() => hex('#fff0c0')));
      case 'black': return A.paint(r, 4, 4, (p) => p.fill(() => [10, 10, 12]));
      case 'buoyRed': return A.paint(r, 16, 32, (p, w, h) => paintMetal(p, w, h, { paint: ['#4a0a08', '#8a1a12', '#c03020', '#e05a40'], rust: 0.25, seed: 71, plate: 64 }));
      case 'buoyWhite': return A.paint(r, 16, 16, (p, w, h) => paintMetal(p, w, h, { paint: ['#7a7a74', '#b8b8b0', '#e0e0d8', '#fafaf4'], rust: 0.2, seed: 73, plate: 64 }));
      case 'postBlue': return A.paint(r, 16, 16, (p, w, h) => paintMetal(p, w, h, { paint: ['#0a1430', '#1a2a5a', '#2a4a8a', '#4a6ab0'], rust: 0.15, seed: 75, plate: 64 }));
      case 'kelpBundle': return A.paint(r, 16, 32, (p) => { const T = hueRamp('#9a7424', 5); p.fill((x, y) => T[x % 4 === 0 ? 1 : ((y + x * 2) % 6 === 0 ? 2 : x % 4 === 1 ? 4 : 3)]); });
      case 'flag': return A.paint(r, 24, 16, (p) => { p.fill((x, y) => (y < 8 ? hex('#1a2a5a') : hex('#e8e0d0'))); for (let i = 0; i < 6; i++) p.set(4 + i, 3, '#f0d070'); p.set(6, 2, '#f0d070'); p.set(7, 4, '#f0d070'); });
    }
    return A.get('black');
  }
}

const woodOld = (a: AreaDef) => a.id === 'graveyard' ? ['#26241c', '#423e30', '#5e5844', '#7a725a', '#948a70'] :
  a.id === 'arctic' ? ['#2e3032', '#4c4c4a', '#6a6862', '#8a867e', '#a8a49a'] :
    a.id === 'abyss' ? ['#1c1c20', '#302e30', '#46423e', '#5c5650', '#746c62'] :
      ['#3a3226', '#5a4e3c', '#7a6c52', '#9a8a6c', '#b8a888'];
const algae = (a: AreaDef) => (a.id === 'arctic' ? '#9aa8a8' : a.id === 'abyss' ? '#3a4a5a' : a.id === 'kelp' ? '#5a6a2a' : '#4a6a3a');
const steelPaint = (a: AreaDef) => (a.id === 'abyss' ? ['#3a2a08', '#7a5a14', '#b08a2a', '#d8b050'] : a.id === 'arctic' ? ['#1a1010', '#4a1a14', '#7a2a20', '#a04030'] : ['#141a1c', '#283234', '#3e4a4c', '#5a6668']);

type Setter = { set(x: number, y: number, c: RGB | string, a?: number): void };
type Filler = { fill(fn: (x: number, y: number) => RGB | [number, number, number, number] | null): void };

/** jagged holes punched through the planks: black inside, splintered pale wood around */
function holes(p: Setter, w: number, h: number, n: number) {
  const rng = new Rng(97 + n);
  const T = hueRamp('#9a7a50', 4);
  for (let k = 0; k < n; k++) {
    const cx = rng.range(8, w - 8), cy = rng.range(8, h - 8), r = rng.range(3.5, 6.5);
    const jag = Array.from({ length: 12 }, () => rng.range(0.75, 1.25));
    for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++) for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
      const a = Math.atan2(y - cy, x - cx), j = jag[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 12];
      const d = Math.hypot((x - cx) * 0.8, y - cy) / j;
      if (d < r) p.set(x, y, d < r - 1 ? [8, 8, 12] : [26, 22, 20]);
      else if (d < r + 1.5) p.set(x, y, T[(x - cx) + (y - cy) < 0 ? 1 : 3]);
    }
  }
}

/** painted planks: a coloured top strake, a white band, antifouling below; clean chips and a fouling line */
function hullPaint(p: Setter, w: number, h: number, a: AreaDef) {
  const T1 = hueRamp(a.id === 'kelp' ? '#2a6a3a' : '#8a2a20', 5), T2 = hueRamp('#d8d4c4', 5), T3 = hueRamp('#6a2a1c', 5);
  const W = hueRamp('#7a6c52', 4), G = hueRamp(algae(a), 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const pi = Math.floor(y / 8), py = y - pi * 8;
    const T = y < h * 0.3 ? T1 : y < h * 0.4 ? T2 : T3;
    let c: RGB = T[py === 0 ? 0 : py === 1 ? 4 : pi % 2 ? 2 : 3];
    const chip = cells(x, y, 9, 13, 64);
    if (chip.id > 0.8 && chip.f1 < 2.2) c = W[chip.f1 < 1.2 ? 2 : 1];
    if (y > h * 0.62 && y < h * 0.62 + 3) c = G[2];
    p.set(x, y, c);
  }
}

/** sail cloth: panels with stitched seams, a darker luff tape, clean stains; torn ones lose ragged pieces */
function sail(p: Filler, w: number, h: number, torn: boolean) {
  const T = hueRamp('#c0b896', 5);
  const rng = new Rng(torn ? 23 : 29);
  const rips = torn ? Array.from({ length: 4 }, () => ({ x: rng.range(4, w - 4), y: rng.range(h * 0.3, h), r: rng.range(5, 11) })) : [];
  p.fill((x, y) => {
    for (const q of rips) { const d = Math.hypot((x - q.x) * 0.7, y - q.y); if (d < q.r + ((x * 7 + y * 3) % 4)) return null; }
    if (torn && y > h - 4 && (x * 5) % 7 < 3) return null;
    let t = 3;
    if (x % 12 === 0) t = 1; else if (x % 12 === 1) t = 4;           // seams
    if (y < 2 || x < 2) t = 2;                                        // tapes
    if (cells(x, y, 16, 31, 48).id > 0.85) t -= 1;                    // stains
    return T[t];
  });
}

/** an ore nugget: faceted lumps with a lit upper-left face, dark seams, optional patina */
function nugget(p: Filler, w: number, h: number, base: string, patina: string | null) {
  const T = hueRamp(base, 5, { spread: 1.1 }), P = patina ? hueRamp(patina, 4) : null;
  p.fill((x, y) => {
    const c = cells(x, y, 6, 3, 16), e = c.f2 - c.f1, l = Math.hypot(c.dx, c.dy) || 1, k = (c.dx / l) * -0.6 + (c.dy / l) * -0.8;
    let t = e < 0.8 ? 0 : k > 0.3 ? 4 : k < -0.3 ? 1 : 2 + (c.id > 0.5 ? 1 : 0);
    if (P && c.id > 0.75 && t < 3) return P[1];
    return T[t];
  });
}

/** a gem prism skin: facet stripes, a bright table near the tip, internal flashes on the diagonal */
function gem(p: Filler, w: number, h: number, base: string) {
  const T = hueRamp(base, 5, { spread: 1.3 });
  p.fill((x, y) => {
    const facet = Math.floor(x / 4) % 3;
    let t = facet === 0 ? 3 : facet === 1 ? 2 : 1;
    if (y < h * 0.2) t += 1;
    if ((x + y * 2) % 13 === 0) t = 4;
    return T[Math.min(4, t)];
  });
}
