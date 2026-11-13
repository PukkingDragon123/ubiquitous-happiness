// The area's shipwreck: the thing the blobfish defends and rebuilds to sail on. One parametric low-poly ship
// builder covers the five themes (reef sloop, kelp trawler, graveyard galleon, arctic steamer, abyss
// submarine), each part painted from the area's prop atlas. Repair runs in four visible stages:
//   0 wrecked: listing hard, half-buried, holed hull, snapped mast, torn sail, overgrown;
//   1 patched: fresh planks / plates nailed over the holes, sand dug out;
//   2 righted: back on her keel, mast spliced, growth scraped off;
//   3 lit + lifted: lanterns / portholes glow, orange lift bags tug her off the bottom;
//   4 seaworthy: new sail, flag, hovering on her lift bags: `ready`, emits 'repair' {stage: 4, ready: true}.
// It has hp; enemies attack it (hit() ignores the player's own sword).
//
//   wreck.needs()                -> { driftwood: 2, ... } still missing for the next stage
//   wreck.repair({ kelp: 5 })    -> what it took; advances (emit 'repair' {stage}) when the stage is paid
//   wreck.sail()                 -> cinematic hook: rises toward the surface, emits 'sail' when gone
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { AreaDef, WreckKind } from './defs';
import type { Scenery } from './scenery';
import { Soup, V3, UVR, mat4 } from '../world/lp';
import { materialId } from './materials';
import { Rng } from '../core/rng';
import { damp, clamp, easeInOut } from '../core/math';
import type { LampHandle } from '../gfx/lighting';

const TAU = Math.PI * 2;
export const WRECK_STAGES = 4;

const COSTS: Record<WreckKind, Record<string, number>[]> = {
  sloop: [{ driftwood: 2, seashell: 2, kelp: 1 }, { copperOre: 2, ironOre: 1, lineScrap: 2 }, { seaGlass: 1, pearl: 1, coralShard: 2 }, { manaCrystal: 1, amethyst: 1, goldNugget: 1 }],
  trawler: [{ kelp: 3, driftwood: 2 }, { ironOre: 2, lineScrap: 2, scrapMetal: 1 }, { seaGlass: 1, copperOre: 2, urchinSpine: 2 }, { manaCrystal: 1, emerald: 1, pearl: 1 }],
  galleon: [{ driftwood: 3, scrapMetal: 2, rustyNail: 2 }, { ironOre: 3, lineScrap: 2, leadShot: 1 }, { seaGlass: 2, doubloon: 1, pearl: 1 }, { manaCrystal: 1, ruby: 1, goldNugget: 1 }],
  steamer: [{ scrapMetal: 3, rustyNail: 2 }, { ironOre: 3, copperOre: 2, riverStone: 1 }, { aquamarine: 1, seaGlass: 1, lineScrap: 2 }, { manaCrystal: 1, goldNugget: 1, amethyst: 1 }],
  sub: [{ scrapMetal: 3, ironOre: 1 }, { copperOre: 2, lineScrap: 2, seaGlass: 1 }, { goldNugget: 1, amethyst: 1, manaCrystal: 1 }, { manaCrystal: 2, abyssCrystal: 1 }],
};
const STAGE_NAME = ['Patch the hull', 'Right her and mend the mast', 'Lights and lift bags', 'New sail: ready to sail'];

/** pose per stage: list (roll), how deep in the sand, pitch */
const POSE = [
  { roll: 0.34, sink: 1.3, pitch: 0.06 },
  { roll: 0.24, sink: 0.85, pitch: 0.04 },
  { roll: 0.05, sink: 0.4, pitch: 0.01 },
  { roll: 0.03, sink: 0.05, pitch: 0 },
  { roll: 0.0, sink: -0.6, pitch: 0 },
];

interface ShipDims { L: number; B: number; D: number; steel: boolean; masts: number; sub?: boolean }
const DIMS: Record<WreckKind, ShipDims> = {
  sloop: { L: 9.5, B: 1.6, D: 2.2, steel: false, masts: 1 },
  trawler: { L: 10.5, B: 1.8, D: 2.5, steel: false, masts: 1 },
  galleon: { L: 15, B: 2.5, D: 3.3, steel: false, masts: 2 },
  steamer: { L: 14, B: 2.1, D: 3.0, steel: true, masts: 1 },
  sub: { L: 12, B: 1.35, D: 2.7, steel: true, masts: 0, sub: true },
};

export interface Parts {
  hullBroken: Soup; hullFixed: Soup; deck: Soup; deckBroken: Soup; cabin: Soup; mastBroken: Soup; mastFull: Soup;
  sailTorn: Soup; sailNew: Soup; rigging: Soup; lampsDark: Soup; lampsLit: Soup; bags: Soup; flag: Soup; growth: Soup;
  lampPts: V3[];
}

/** U-section loft (open at the top), each quad mapped to a whole tile region */
function uLoft(s: Soup, rings: V3[][], reg: (j: number, k: number) => UVR, flipSide = false) {
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < rings[j].length - 1; k++) {
    const a = rings[j][k], b = rings[j + 1][k], c = rings[j + 1][k + 1], d = rings[j][k + 1];
    const r = reg(j, k);
    const shade = 0.75 + 0.25 * (1 - Math.abs(k - (rings[j].length - 1) / 2) / ((rings[j].length - 1) / 2));
    // u runs along the ship (planks lie lengthwise), v around the section
    const ua: [number, number] = [r.u0, r.v0], ub: [number, number] = [r.u1, r.v0], uc: [number, number] = [r.u1, r.v1], ud: [number, number] = [r.u0, r.v1];
    if (flipSide) { s.tri(a, d, c, ua, ud, uc, shade, shade, shade); s.tri(a, c, b, ua, uc, ub, shade, shade, shade); }
    else { s.tri(a, b, c, ua, ub, uc, shade, shade, shade); s.tri(a, c, d, ua, uc, ud, shade, shade, shade); }
  }
}

export function buildShip(kind: WreckKind, scen: Scenery, seed: number): Parts {
  const P = scen.props, rng = new Rng(seed);
  const D = DIMS[kind];
  const parts: Parts = {
    hullBroken: new Soup(), hullFixed: new Soup(), deck: new Soup(), deckBroken: new Soup(), cabin: new Soup(), mastBroken: new Soup(), mastFull: new Soup(),
    sailTorn: new Soup(), sailNew: new Soup(), rigging: new Soup(), lampsDark: new Soup(), lampsLit: new Soup(), bags: new Soup(), flag: new Soup(), growth: new Soup(), lampPts: [],
  };
  const { L, B } = D;
  const skin = D.steel ? P.get('steel') : kind === 'trawler' ? P.get('hullPaint') : P.get('planksOld');
  const skinHoles = D.steel ? P.get('steelHoles') : kind === 'trawler' ? P.get('hullPaintHoles') : P.get('planksHoles');
  const patch = D.steel ? P.get('iron') : P.get('planksNew');
  const holeSet = new Set<string>();
  if (D.sub) {
    // ---------------------------------------------------------------- submarine: a lathed cigar along x
    const prof: [number, number][] = [[-0.5, 0.05], [-0.47, 0.35], [-0.4, 0.7], [-0.25, 0.95], [0, 1], [0.25, 0.97], [0.38, 0.85], [0.46, 0.55], [0.5, 0.06]];
    const NS = 9, R = B;
    const rings: V3[][] = prof.map(([t, r]) => Array.from({ length: NS + 1 }, (_, k) => { const a = (k / NS) * TAU; return [t * L, D.D * 0.5 + Math.cos(a) * r * R, Math.sin(a) * r * R] as V3; }));
    for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < NS; k++) if (rng.chance(0.18) && j > 0 && j < rings.length - 2 && k > 1 && k < 7) holeSet.add(j + ',' + k);
    uLoft(parts.hullBroken, rings, (j, k) => (holeSet.has(j + ',' + k) ? skinHoles : skin), true);
    uLoft(parts.hullFixed, rings, (j, k) => (holeSet.has(j + ',' + k) ? patch : skin), true);
    // conning tower (sail) + dive planes + prop
    const tw = parts.cabin, from = tw.count;
    tw.lathe([[0.9, 0], [0.85, 1.1], [0.7, 1.35], [0, 1.4]], 7, P.get('steel'), { sx: 1.3, sz: 0.55 });
    tw.transformSince(from, mat4(L * 0.06, D.D * 0.5 + R * 0.92, 0, 1, 1, 1));
    tw.box([L * 0.06 - 0.05, D.D * 0.5 + R + 1.3, -0.05], [0.1, 1.2, 0.1], P.get('iron')); // periscope
    for (const sgn of [-1, 1]) tw.quad([L * 0.06 - 0.5, D.D * 0.5 + R + 0.7, 0], [L * 0.06 + 0.5, D.D * 0.5 + R + 0.7, 0], [L * 0.06 + 0.3, D.D * 0.5 + R + 0.72, sgn * 1.1], [L * 0.06 - 0.5, D.D * 0.5 + R + 0.72, sgn * 1.1], P.get('steel'));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; tw.quad([-L * 0.5 - 0.1, D.D * 0.5, 0], [-L * 0.5 - 0.12, D.D * 0.5 + Math.cos(a) * 0.7, Math.sin(a) * 0.7], [-L * 0.5 - 0.3, D.D * 0.5 + Math.cos(a + 0.5) * 0.75, Math.sin(a + 0.5) * 0.75], [-L * 0.5 - 0.28, D.D * 0.5, 0], P.get('brass')); }
    // portholes along the side (dark / lit)
    for (let i = 0; i < 6; i++) {
      const x = -L * 0.32 + i * L * 0.12, y = D.D * 0.5 + 0.15, z = R * 0.97;
      for (const [s, lit] of [[parts.lampsDark, false], [parts.lampsLit, true]] as const) {
        s.glow(lit ? 2.6 : 0);
        s.quad([x - 0.16, y - 0.16, z], [x + 0.16, y - 0.16, z], [x + 0.16, y + 0.16, z], [x - 0.16, y + 0.16, z], P.get(lit ? 'glassLit' : 'black'));
        s.glow(0);
      }
      if (i % 2 === 0) parts.lampPts.push([x, y, z + 0.6]);
    }
    // a searchlight on the bow
    for (const [s, lit] of [[parts.lampsDark, false], [parts.lampsLit, true]] as const) { s.glow(lit ? 3 : 0); s.box([L * 0.44, D.D * 0.5 + 0.2, -0.2], [0.35, 0.4, 0.4], P.get(lit ? 'lamp' : 'iron')); s.glow(0); }
    parts.lampPts.push([L * 0.5 + 0.5, D.D * 0.5 + 0.3, 0]);
  } else {
    // ---------------------------------------------------------------- displacement hull
    const ts = [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.76, 0.86, 0.94, 1];
    const halfB = (t: number) => (t < 0.45 ? 0.72 + 0.28 * Math.sin((t / 0.45) * Math.PI / 2) : Math.cos(((t - 0.45) / 0.55) * Math.PI / 2) ** 0.8) * B;
    const deckY = (t: number) => D.D * (1 + 0.6 * (t - 0.5) ** 2 + (kind === 'galleon' && t < 0.2 ? 0.25 : 0));
    const keelY = (t: number) => 0.3 * D.D * Math.abs((t - 0.5) * 2) ** 4;
    const pts = [1, 0.97, 0.82, 0.45, 0];
    const rings: V3[][] = ts.map((t) => {
      const x = (t - 0.5) * L, hb = Math.max(0.02, halfB(t)), dy = deckY(t), ky = keelY(t);
      const ring: V3[] = [];
      const ys = [dy, dy * 0.62 + ky * 0.38, dy * 0.3 + ky * 0.7, ky + (dy - ky) * 0.07, ky];
      for (let k = 0; k < 5; k++) ring.push([x, ys[k], hb * pts[k]]);
      for (let k = 3; k >= 0; k--) ring.push([x, ys[k], -hb * pts[k]]);
      return ring;
    });
    for (let j = 1; j < rings.length - 2; j++) for (let k = 0; k < 8; k++) if (rng.chance(0.2) && (k < 3 || k > 4)) holeSet.add(j + ',' + k);
    uLoft(parts.hullBroken, rings, (j, k) => (holeSet.has(j + ',' + k) ? skinHoles : skin), true);
    uLoft(parts.hullFixed, rings, (j, k) => (holeSet.has(j + ',' + k) ? patch : skin), true);
    // patched hulls carry a few visible battens (fresh boards) over the old holes
    // transom (stern panel)
    const st = rings[0];
    for (const s of [parts.hullBroken, parts.hullFixed]) for (let k = 0; k < st.length - 2; k++) s.tri(st[0], st[k + 2], st[k + 1], [skin.u0, skin.v0], [skin.u1, skin.v1], [skin.u1, skin.v0], 0.7, 0.7, 0.7);
    // deck
    const deckR = P.get('deck');
    for (let j = 0; j < rings.length - 1; j++) {
      const a = rings[j][0], b = rings[j + 1][0], c = rings[j + 1][8], d = rings[j][8];
      const hole = j === 3 || j === 5;
      parts.deck.quad(a, b, c, d, deckR);
      if (!hole) parts.deckBroken.quad(a, b, c, d, deckR);
      // bulwark rails
      for (const s of [parts.hullBroken, parts.hullFixed]) {
        const up = 0.35;
        s.quad(a, b, [b[0], b[1] + up, b[2]], [a[0], a[1] + up, a[2]], skin, [0.8, 0.8, 0.9, 0.9]);
        s.quad(c, d, [d[0], d[1] + up, d[2]], [c[0], c[1] + up, c[2]], skin, [0.8, 0.8, 0.9, 0.9]);
      }
    }
    // superstructure per theme
    const cab = parts.cabin;
    if (kind === 'sloop') {
      cab.box([-L * 0.38, deckY(0.12), -B * 0.45], [L * 0.2, 0.8, B * 0.9], P.get('planksOld'));
      cab.box([-L * 0.4, deckY(0.12) + 0.8, -B * 0.5], [L * 0.24, 0.08, B], P.get('deck'));
    } else if (kind === 'trawler') {
      cab.box([-L * 0.25, deckY(0.3), -B * 0.55], [L * 0.2, 1.5, B * 1.1], P.get('hullPaint'));
      cab.box([-L * 0.27, deckY(0.3) + 1.5, -B * 0.62], [L * 0.24, 0.1, B * 1.24], P.get('steel'));
      // gantry A-frame at the stern + net drum
      for (const sz of [-1, 1]) cab.tube([[-L * 0.45, deckY(0), sz * B * 0.6], [-L * 0.5, deckY(0) + 2.6, sz * 0.3]], () => 0.07, 4, P.get('steel'));
      const from = cab.count; cab.lathe([[0.35, 0], [0.35, B * 1.1]], 7, P.get('rope')); cab.transformSince(from, mat4(-L * 0.38, deckY(0.1) + 0.45, -B * 0.55, 1, 1, 1, 0, Math.PI / 2, 0));
    } else if (kind === 'galleon') {
      // stern castle with windows
      cab.box([-L * 0.5, deckY(0.05), -B * 0.7], [L * 0.22, 1.6, B * 1.4], P.get('planksOld'));
      cab.box([-L * 0.52, deckY(0.05) + 1.6, -B * 0.75], [L * 0.24, 0.12, B * 1.5], P.get('deck'));
      cab.box([L * 0.36, deckY(0.88), -B * 0.35], [L * 0.1, 0.7, B * 0.7], P.get('planksOld')); // forecastle
      // gun ports along the hull
      for (let i = 0; i < 6; i++) { const x = -L * 0.25 + i * L * 0.1; cab.quad([x, D.D * 0.65, B * 0.99], [x + 0.35, D.D * 0.65, B * 0.99], [x + 0.35, D.D * 0.65 + 0.3, B * 0.99], [x, D.D * 0.65 + 0.3, B * 0.99], P.get('black')); }
      // bowsprit
      cab.tube([[L * 0.45, deckY(1) - 0.2, 0], [L * 0.5 + 2.6, deckY(1) + 1.2, 0]], (t) => 0.12 * (1 - t * 0.5), 5, P.get('planksOld'));
      for (let i = 0; i < 3; i++) {
        const x = -L * 0.46 + i * 0.9, y = deckY(0.05) + 0.6;
        for (const [s, lit] of [[parts.lampsDark, false], [parts.lampsLit, true]] as const) { s.glow(lit ? 2.4 : 0); s.quad([x, y, B * 0.71], [x + 0.5, y, B * 0.71], [x + 0.5, y + 0.6, B * 0.71], [x, y + 0.6, B * 0.71], P.get(lit ? 'glassLit' : 'black')); s.glow(0); }
      }
      parts.lampPts.push([-L * 0.4, deckY(0.05) + 1, B + 0.8]);
    } else if (kind === 'steamer') {
      cab.box([-L * 0.18, deckY(0.35), -B * 0.6], [L * 0.24, 1.6, B * 1.2], P.get('steel'));
      cab.box([-L * 0.1, deckY(0.35) + 1.6, -B * 0.45], [L * 0.12, 0.9, B * 0.9], P.get('steel'));
      const from = cab.count; cab.lathe([[0.45, 0], [0.45, 2.6], [0.5, 2.7]], 7, P.get('buoyRed')); cab.transformSince(from, mat4(-L * 0.22, deckY(0.3) + 1.3, 0, 1, 1, 1, 0, 0, 0.12));
      for (let i = 0; i < 4; i++) {
        const x = -L * 0.16 + i * 0.75, y = deckY(0.35) + 0.8;
        for (const [s, lit] of [[parts.lampsDark, false], [parts.lampsLit, true]] as const) { s.glow(lit ? 2.4 : 0); s.quad([x, y, B * 0.61], [x + 0.35, y, B * 0.61], [x + 0.35, y + 0.35, B * 0.61], [x, y + 0.35, B * 0.61], P.get(lit ? 'glassLit' : 'black')); s.glow(0); }
      }
      parts.lampPts.push([-L * 0.05, deckY(0.35) + 1.2, B + 0.6]);
    }
    // masts
    const mastXs = D.masts === 2 ? [L * 0.12, -L * 0.18] : [kind === 'trawler' ? L * 0.18 : L * 0.08];
    const mastH = kind === 'galleon' ? 11 : kind === 'steamer' ? 7 : 8.5;
    mastXs.forEach((mx, mi) => {
      const y0 = deckY(0.5 + mx / L) - 0.2, H = mastH * (mi ? 0.85 : 1);
      const wood = D.steel ? P.get('steel') : P.get('planksOld');
      parts.mastFull.tube([[mx, y0, 0], [mx, y0 + H, 0]], (t) => 0.16 * (1 - t * 0.5), 5, wood);
      // yard + sail
      const yy = y0 + H * 0.82, yw = (kind === 'galleon' ? 3.4 : 2.6) * (mi ? 0.85 : 1);
      if (!D.steel) {
        parts.mastFull.tube([[mx, yy, -yw], [mx, yy, yw]], () => 0.07, 4, wood);
        const sg = (s: Soup, torn: boolean) => {
          const r = P.get(torn ? 'sailTorn' : 'sail');
          const rows = 4, cols = 4, grid: V3[][] = [];
          for (let i = 0; i <= rows; i++) { const v = i / rows; const row: V3[] = []; for (let j = 0; j <= cols; j++) { const u = j / cols; row.push([mx + 0.12 + Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.7 * (torn ? 0.5 : 1), yy - v * H * 0.62, (u - 0.5) * 2 * yw * (1 - v * 0.08)]); } grid.push(row); }
          for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
            const fa = (i / rows) * 0.25, fb = ((i + 1) / rows) * 0.25;
            const ur = { u0: r.u0 + (r.u1 - r.u0) * j / cols, u1: r.u0 + (r.u1 - r.u0) * (j + 1) / cols, v0: r.v1 - (r.v1 - r.v0) * (i + 1) / rows, v1: r.v1 - (r.v1 - r.v0) * i / rows };
            s.quad(grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1], grid[i][j], ur, [1, 1, 1, 1], [fb, fb, fa, fa]);
          }
        };
        sg(parts.sailTorn, true); sg(parts.sailNew, false);
      }
      // broken stump + fallen top lying across the deck into the sand
      const bh = H * 0.35;
      parts.mastBroken.tube([[mx, y0, 0], [mx + 0.05, y0 + bh, 0.02]], (t) => 0.16 * (1 - t * 0.2), 5, wood);
      parts.mastBroken.tube([[mx + 0.4, y0 + 0.3, 0.6], [mx + H * 0.55, -0.6, B * 1.6]], (t) => 0.13 * (1 - t * 0.4), 5, wood);
      // rigging lines: masthead to bow, stern and both rails
      const top: V3 = [mx, y0 + H * 0.97, 0];
      for (const end of [[L * 0.5, deckY(1), 0], [-L * 0.48, deckY(0), 0], [mx, deckY(0.5), B * 0.95], [mx, deckY(0.5), -B * 0.95]] as V3[]) parts.rigging.tube([top, end], () => 0.025, 3, P.get('rope'));
      if (mi === 0) {
        const fy = y0 + H;
        parts.flag.quad([mx, fy - 0.1, 0], [mx - 1.3, fy - 0.1, 0], [mx - 1.3, fy + 0.8, 0], [mx, fy + 0.8, 0], P.get('flag'), [1, 1, 1, 1], [0, 0.3, 0.3, 0]);
      }
    });
    // deck lanterns (bow + stern)
    for (const lx of [L * 0.42, -L * 0.44]) {
      const y = deckY(0.5 + lx / L) + 0.35;
      for (const [s, lit] of [[parts.lampsDark, false], [parts.lampsLit, true]] as const) { s.glow(lit ? 2.8 : 0); s.box([lx - 0.12, y, B * 0.5], [0.24, 0.32, 0.24], P.get(lit ? 'glassLit' : 'iron')); s.glow(0); }
      parts.lampPts.push([lx, y + 0.2, B * 0.5 + 0.7]);
    }
  }
  // lift bags: bright orange salvage bags on short lines, both sides
  const bagR = scen.props.A.paint('liftbag', 16, 16, (p) => p.fill((x, y) => { const k = 0.7 + Math.sin(x * 0.8) * 0.1 - y / 50; return [230 * k, 110 * k, 30 * k]; }));
  for (let i = 0; i < 4; i++) {
    const x = (i / 3 - 0.5) * L * 0.6, z = (i % 2 ? 1 : -1) * B * 0.9, y = D.D + 1.3 + (i % 2) * 0.3;
    const from = parts.bags.count;
    parts.bags.lathe([[0.25, 0], [0.55, 0.4], [0.5, 0.9], [0, 1.15]], 7, bagR, { flexTop: 0.1 });
    parts.bags.transformSince(from, mat4(x, y, z, 1, 1, 1));
    parts.bags.tube([[x, y, z], [x, D.D * 0.8, z * 0.95]], () => 0.02, 3, P.get('rope'));
  }
  // growth on the wreck: the area's own 3D flora clinging to the hull / deck (scraped off at stage 2)
  const growthSp = { reef: ['staghorn', 'brain', 'softcoral', 'anemone'], kelp: ['sealettuce', 'redweed', 'anemone'], graveyard: ['plumose', 'hydroid', 'brownweed'], arctic: ['softcoralCold', 'plumose'], abyss: ['tubeworms', 'glowcoral'] }[scen.a.id] ?? [];
  for (let i = 0; i < 14 && growthSp.length; i++) {
    const v = scen.flora.get(rng.pick(growthSp));
    const x = rng.range(-L * 0.4, L * 0.4), onDeck = rng.chance(0.6);
    const y = onDeck ? D.D + 0.05 : rng.range(D.D * 0.3, D.D * 0.8), z = onDeck ? rng.range(-B * 0.6, B * 0.6) : B * 0.95;
    parts.growth.append(rng.pick(v), mat4(x, y, z, rng.range(0.6, 1.1), rng.range(0.6, 1.1), rng.range(0.6, 1.1), rng.range(0, 6), onDeck ? 0 : Math.PI / 2 * 0.8, 0));
  }
  return parts;
}

export class Shipwreck implements Entity {
  kind = 'shipwreck'; team: Team = 'friend';
  x: number; y: number; vx = 0; vy = 0; r: number; alive = true;
  hp: number; maxHp: number;
  stage = 0;
  /** fully repaired: can sail to the next area */
  ready = false;
  /** materials paid toward the current stage */
  paid: Record<string, number> = {};
  /** multiplies repair costs (mastery) */
  costMul = 1;
  obj = new THREE.Group();
  ship = new THREE.Group();
  wreckKind: WreckKind;
  dims: ShipDims;
  z: number;
  floor: number;
  /** where the player stands to repair (in front of the hull, on the plane) */
  repairPoint: { x: number; y: number };
  private meshes: Record<string, THREE.Mesh> = {};
  private pose = { roll: POSE[0].roll, sink: POSE[0].sink, pitch: POSE[0].pitch };
  private poseFrom = { ...POSE[0] };
  private poseT = 1;
  private t = 0;
  private flashT = 0;
  private sailing = -1;
  private lamps: LampHandle[] = [];
  private lampPts: V3[] = [];
  private world: World;
  private matsBackup = new Map<THREE.Mesh, THREE.Material>();
  private hullCircles: { x: number; y: number; r: number }[] = [];

  constructor(public a: AreaDef, public scen: Scenery, x: number, w: World) {
    this.world = w;
    this.wreckKind = a.wreck;
    this.dims = DIMS[a.wreck];
    this.x = x;
    this.z = -(this.dims.B + 0.9);
    this.floor = scen.sand.restAt(x);
    this.y = this.floor + this.dims.D * 0.55;
    this.r = this.dims.L * 0.42;
    this.hp = this.maxHp = 100;
    this.repairPoint = { x, y: this.floor + 1.2 };
    const parts = buildShip(a.wreck, scen, (x * 1000) | 0);
    this.lampPts = parts.lampPts;
    const M = scen.mats;
    const add = (name: keyof Parts, mat: THREE.Material, cast = true) => {
      const s = parts[name] as Soup;
      if (!s.count) return;
      const g = s.geometry();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = cast; m.receiveShadow = true;
      m.name = name;
      this.meshes[name] = m;
      this.ship.add(m);
    };
    add('hullBroken', M.prop); add('hullFixed', M.prop); add('deck', M.prop); add('deckBroken', M.prop); add('cabin', M.prop);
    add('mastBroken', M.prop); add('mastFull', M.prop); add('rigging', M.prop, false); add('lampsDark', M.prop); add('lampsLit', M.prop);
    add('sailTorn', M.cloth); add('sailNew', M.cloth); add('bags', M.propSway); add('flag', M.cloth, false); add('growth', M.flora);
    this.ship.rotation.order = 'YXZ';
    this.obj.add(this.ship);
    this.obj.position.set(x, this.floor, this.z);
    // the wreck sits in a trough it dug: scour the sand around it a little
    scen.sand.deposit(x - this.dims.L * 0.55, 0.4, 1.6);
    scen.sand.deposit(x + this.dims.L * 0.55, 0.4, 1.6);
    this.applyStage(true);
  }

  /** materials still missing for the next stage (ids as items.ts knows them) */
  needs(): Record<string, number> {
    if (this.stage >= WRECK_STAGES) return {};
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(COSTS[this.wreckKind][this.stage])) {
      const real = materialId(id);
      const need = Math.ceil(n * this.costMul) - (this.paid[real] ?? 0);
      if (need > 0) out[real] = (out[real] ?? 0) + need;
    }
    return out;
  }
  /** the next stage's name for UI */
  get stageName() { return this.stage >= WRECK_STAGES ? 'Seaworthy' : STAGE_NAME[this.stage]; }
  setMastery(m: number) { this.costMul = 1 + Math.max(0, m) * 0.25; }

  /** pay materials toward the current stage; returns what was taken. Advances the stage when it is paid in full. */
  repair(materials: Record<string, number>): Record<string, number> {
    const took: Record<string, number> = {};
    if (this.stage >= WRECK_STAGES || this.sailing >= 0) return took;
    const need = this.needs();
    for (const [id, n] of Object.entries(materials)) {
      const want = need[id] ?? 0;
      const k = Math.min(want, Math.max(0, Math.floor(n)));
      if (k > 0) { took[id] = k; this.paid[id] = (this.paid[id] ?? 0) + k; }
    }
    const w = this.world;
    if (Object.keys(took).length) {
      // every patch pays back some hull
      let n = 0; for (const v of Object.values(took)) n += v;
      this.hp = Math.min(this.maxHp, this.hp + n * 6);
      w.sfx('hammer1', this.x, 0.8); w.sfx('clank1', this.x, 0.5, 1.2);
      w.fx.burst('spark', this.repairPoint.x, this.repairPoint.y + 0.6, 8, 3);
    }
    if (Object.keys(this.needs()).length === 0) this.advance();
    return took;
  }

  private advance() {
    const w = this.world;
    this.stage++;
    this.paid = {};
    this.maxHp = 100 + this.stage * 25;
    this.hp = this.maxHp;   // a finished stage leaves her sound again
    this.poseFrom = { ...this.pose }; this.poseT = 0;
    this.applyStage(false);
    // a creaking heave: sand bursts out from under the hull, bubbles stream from every seam
    w.sfx('creak2', this.x, 1); w.sfx('jin_good', this.x, 0.7);
    this.world.game.addShake(0.25);
    for (let i = 0; i < 5; i++) this.scen.sand.impact(this.x + (i - 2) * this.dims.L * 0.22, this.floor + 0.2, 1.3, 0.5);
    for (let i = 0; i < 18; i++) w.fx.emit('bubbleBig', this.x + (Math.random() - 0.5) * this.dims.L, this.floor + Math.random() * this.dims.D, { n: 1, vy: 1.5, life: 3, z: this.z + this.dims.B });
    this.ready = this.stage >= WRECK_STAGES;
    w.emit('repair', { stage: this.stage, ready: this.ready, x: this.x, y: this.y });
  }

  private applyStage(first: boolean) {
    const s = this.stage, m = this.meshes;
    const vis = (k: string, v: boolean) => { if (m[k]) m[k].visible = v; };
    vis('hullBroken', s < 1); vis('hullFixed', s >= 1);
    vis('deckBroken', s < 2); vis('deck', s >= 2);
    vis('mastBroken', s < 2); vis('mastFull', s >= 2);
    vis('sailTorn', s >= 2 && s < 4); vis('sailNew', s >= 4);
    vis('rigging', s >= 2);
    vis('lampsDark', s < 3); vis('lampsLit', s >= 3);
    vis('bags', s >= 3); vis('flag', s >= 4);
    vis('growth', s < 2);
    if (s >= 3 && !this.lamps.length) this.lightUp();
    if (first) { const p = POSE[s]; this.pose = { ...p }; }
  }

  /** hand the wreck a lighting rig so its lanterns cast real light (optional) */
  setLighting(rig: { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null) {
    this.rig = rig;
    if (this.stage >= 3) this.lightUp();
  }
  private rig: { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null = null;
  private lightUp() {
    if (!this.rig || this.lamps.length) return;
    const p = this.lampPts[0];
    if (!p) return;
    const l = this.rig.lamp(this.x + p[0], this.floor + p[1], this.z + p[2], this.a.id === 'abyss' ? '#a0e0ff' : '#ffc070', 3.5, 9);
    if (l) this.lamps.push(l);
  }

  /**
   * Damage the wreck. Two call styles:
   *   hit(dmg, x, y, kind?)                      - attackers: (x, y) is where the blow lands
   *   hit(dmg, dirX, dirY, world, src, kind?)    - the Entity interface (the player's own sword is ignored)
   * Splinters + a silt puff at the impact, the hull shudders, the timbers creak. At hp <= 0 it emits
   * 'wreckDestroyed' (and 'wreckDown'); repairs restore hp.
   */
  hit(dmg: number, a: number, b: number, w?: World | string, src?: Entity | null, kind?: DamageKind | string): boolean {
    const worldStyle = typeof w === 'object' && w !== null;
    const W = worldStyle ? (w as World) : this.world;
    const k = (worldStyle ? kind : (w as string | undefined)) ?? '';
    if (src && src.team === 'player') return false;   // the blobfish's own sword never hurts the wreck
    if (this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - dmg * (k === 'explosion' ? 1.5 : 1));
    this.flashT = 0.08;
    // impact point: given (x, y), or a spot on the hull side the blow came from
    let hx: number, hy: number;
    if (worldStyle) { hx = this.x + clamp(a, -1, 1) * -this.dims.L * 0.3 + (Math.random() - 0.5) * 2; hy = this.floor + this.dims.D * 0.6; }
    else { hx = clamp(a, this.x - this.dims.L * 0.5, this.x + this.dims.L * 0.5); hy = clamp(b, this.floor, this.floor + this.dims.D * 1.2); }
    const zf = this.z + this.dims.B;
    W.fx.debrisBurst(hx, hy, 7, this.dims.steel ? '#5a4a40' : '#7a5a34', 3, 0.07, zf);
    W.fx.burst('bubble', hx, hy, 6, 1.5);
    this.scen.sand.onPuff?.(hx, this.floor + 0.1, 0.5 + Math.min(1, dmg * 0.1));
    W.sfx(this.dims.steel ? 'clank2' : 'crunch1', hx, 0.8, 0.8 + Math.random() * 0.3);
    if (Math.random() < 0.5) W.sfx(Math.random() < 0.5 ? 'creak1' : 'creak2', this.x, 0.6, 0.9 + Math.random() * 0.2);
    this.shudder = Math.min(1, this.shudder + 0.35 + dmg * 0.04);
    if (this.hp <= 0) { W.emit('wreckDestroyed', { x: this.x, y: this.y, stage: this.stage }); W.emit('wreckDown', { x: this.x, y: this.y }); W.sfx('creak3', this.x, 1); }
    return true;
  }
  /** max hp (alias of maxHp) */
  get hpMax() { return this.maxHp; }
  private shudder = 0;
  /** heal (e.g. a repair ability) */
  heal(n: number) { this.hp = Math.min(this.maxHp, this.hp + n); }

  /** start the sail-away cinematic (only when ready) */
  sail(): boolean {
    if (!this.ready || this.sailing >= 0) return false;
    this.sailing = 0;
    this.world.sfx('creak3', this.x, 1);
    return true;
  }
  get sailingT() { return this.sailing; }

  update(dt: number, w: World) {
    this.t += dt;
    // ease between stage poses
    if (this.poseT < 1) {
      this.poseT = Math.min(1, this.poseT + dt / 2.8);
      const k = easeInOut(this.poseT), to = POSE[this.stage];
      this.pose.roll = this.poseFrom.roll + (to.roll - this.poseFrom.roll) * k;
      this.pose.sink = this.poseFrom.sink + (to.sink - this.poseFrom.sink) * k;
      this.pose.pitch = this.poseFrom.pitch + (to.pitch - this.poseFrom.pitch) * k;
      if (Math.random() < dt * 20) w.fx.emit('bubble', this.x + (Math.random() - 0.5) * this.dims.L, this.floor + Math.random() * 1.5, { n: 2, vy: 1, z: this.z + this.dims.B });
    }
    const hover = this.stage >= 4 ? Math.sin(this.t * 0.8) * 0.12 : this.stage >= 3 ? Math.sin(this.t * 0.6) * 0.04 : 0;
    let lift = 0;
    if (this.sailing >= 0) {
      this.sailing += dt;
      lift = Math.pow(this.sailing, 2) * 1.1;
      if (Math.random() < dt * 30) w.fx.emit('bubbleBig', this.x + (Math.random() - 0.5) * this.dims.L, this.floor + lift, { n: 1, vy: 2, z: this.z + this.dims.B });
      if (this.floor + lift > 1.5 && this.sailing < 99) { w.emit('sail', { x: this.x }); this.sailing = 99; }
    }
    // a struck hull shudders (no camera shake: the wreck itself rocks)
    this.shudder = Math.max(0, this.shudder - dt * 2.5);
    const sh = this.shudder * this.shudder;
    this.ship.position.set(Math.sin(this.t * 41) * 0.06 * sh, -this.pose.sink + hover + lift + Math.sin(this.t * 37) * 0.04 * sh, 0);
    // list away from the camera so the holed hull side faces the player
    this.ship.rotation.set(-this.pose.roll + Math.sin(this.t * 29) * 0.012 * sh, 0, this.pose.pitch + Math.sin(this.t * 0.5) * (this.stage >= 3 ? 0.01 : 0));
    // flash on damage
    if (this.flashT > 0) {
      this.flashT -= dt;
      for (const m of Object.values(this.meshes)) {
        if (this.flashT > 0) { if (!this.matsBackup.has(m)) this.matsBackup.set(m, m.material as THREE.Material); m.material = HIT_FLASH; }
        else { const b = this.matsBackup.get(m); if (b) m.material = b; }
      }
      if (this.flashT <= 0) this.matsBackup.clear();
    }
    // lantern light follows the hull, flickers
    const lp = this.lampPts[0];
    for (const l of this.lamps) if (lp) { l.set(this.x + lp[0], this.floor + lp[1] + this.ship.position.y, this.z + lp[2]); l.light.intensity = 3.2 + Math.sin(this.t * 7) * 0.3 + Math.sin(this.t * 13) * 0.2; }
    // low-hp smoke of silt and bubbles
    if (this.hp < this.maxHp * 0.35 && Math.random() < dt * 4) w.fx.emit('bubble', this.x + (Math.random() - 0.5) * this.dims.L * 0.6, this.floor + this.dims.D, { n: 2, vy: 1.2, z: this.z + this.dims.B });
    this.y = this.floor + this.dims.D * 0.55 + this.ship.position.y;
    this.vx = damp(this.vx, 0, 5, dt);
    void this.hullCircles;
  }

  dispose() {
    for (const m of Object.values(this.meshes)) m.geometry.dispose();
    for (const l of this.lamps) l.release();
    this.lamps = [];
  }
}

const HIT_FLASH = new THREE.MeshBasicMaterial({ color: '#ffd8c8' });
