// Shared helpers for the Kit-built (non-lofted-fish) creatures: the SpeciesAsset wrapper, a per-texel region
// painter and a few clean, hand-placed pattern tools (seeded Voronoi tiles for scutes / head shields / scales,
// hex scale lattices). No random noise: every pattern comes from hand-placed seeds or a regular lattice.
import * as THREE from 'three';
import { Page, Rect } from './page';
import type { V3 } from '../gfx/loft';
import { SpeciesAsset, makeAsset } from './model';
import type { SwimFlags } from './swim';
import type { UwOpts } from '../gfx/shaders/underwater';
import type { RGB } from '../gfx/px';
import { clamp } from '../core/math';

const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

export interface KitAssetOpts {
  length: number; mouth: V3; eye: V3; eyeR?: number;
  mode?: SwimFlags['mode']; vertical?: boolean;
  shape?: [number, number, number, number]; shape2?: [number, number, number, number]; jaw?: [number, number, number, number];
  amp?: number; freq?: number; freqK?: number;
  uwo?: UwOpts; emissive?: number; clearcoat?: number; clearcoatRough?: number; normal?: number;
  parts?: SpeciesAsset['parts']; animate?: SpeciesAsset['animate'];
  anchors?: Record<string, V3>;
  side?: THREE.Side;
  /** colours kept by the clean-pixel pass (default 14) */
  palette?: number;
  jawIdle?: number;
}
export function kitAsset(name: string, geo: THREE.BufferGeometry, pg: Page, o: KitAssetOpts): SpeciesAsset {
  const tex = pg.textures(o.normal ?? 2);
  const anchors: Record<string, THREE.Vector3> = {};
  for (const k in o.anchors ?? {}) anchors[k] = v3(o.anchors![k]);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius *= 1.3;
  return makeAsset({
    name, geo, map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap,
    emissive: o.emissive ?? 1.5,
    uni: {
      uShape: { value: new THREE.Vector4(...(o.shape ?? [o.length / 2, o.length, 0, 0])) },
      uShape2: { value: new THREE.Vector4(...(o.shape2 ?? [2, 4, 0.01, 0])) },
      uJawP: { value: new THREE.Vector4(...(o.jaw ?? [0, 0, 0, 0])) },
    },
    flags: { mode: o.mode ?? 0, vertical: o.vertical }, uwo: o.uwo ?? { rim: 0.4, sss: [0.9, 0.85, 0.8], sssK: 0.7 },
    length: o.length, mouth: v3(o.mouth), eye: v3(o.eye), eyeR: o.eyeR ?? 0.02, anchors,
    amp: o.amp ?? 0, freq: o.freq ?? 1, freqK: o.freqK ?? 0, jawIdle: o.jawIdle ?? 0, normalScale: 0.6,
    parts: o.parts, animate: o.animate, side: o.side,
    clearcoat: o.clearcoat ?? 0.5, clearcoatRough: o.clearcoatRough ?? 0.3,
    palette: o.palette,
  });
}

/** paint a rect pixel by pixel: fn(u, v, i, j) -> [colour, alpha 0..1, rough, height] */
export function paintRect(pg: Page, r: Rect, fn: (u: number, v: number, i: number, j: number) => [RGB, number, number, number], glow?: (u: number, v: number, i: number, j: number) => RGB | null) {
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const u = i / (r.w - 1), v = j / (r.h - 1);
    const [c, a, ro, h] = fn(u, v, i, j);
    pg.set(r.x + i, r.y + j, c, Math.round(clamp(a, 0, 1) * 255), ro, h);
    if (glow) { const g = glow(u, v, i, j); if (g) pg.setGlow(r.x + i, r.y + j, g); }
  }
}

/**
 * Nearest / second-nearest of a hand-placed seed set (scutes, head shields, flipper scales). Optional per-seed
 * weights grow a tile (power-diagram style). Returns the tile index, distance to its seed, the seam distance
 * (half the gap between the two nearest bisector distances, in the same units) and the second tile.
 */
export interface Tile { i: number; d: number; seam: number; j: number; dx: number; dy: number }
export function tiles(x: number, y: number, seeds: [number, number][], w?: number[], sx = 1, sy = 1): Tile {
  let b = 1e9, b2 = 1e9, bi = 0, bj = 0, bdx = 0, bdy = 0;
  for (let k = 0; k < seeds.length; k++) {
    const dx = (x - seeds[k][0]) * sx, dy = (y - seeds[k][1]) * sy;
    const d = Math.hypot(dx, dy) - (w ? w[k] : 0);
    if (d < b) { b2 = b; bj = bi; b = d; bi = k; bdx = dx; bdy = dy; } else if (d < b2) { b2 = d; bj = k; }
  }
  return { i: bi, d: b + (w ? w[bi] : 0), seam: (b2 - b) * 0.5, j: bj, dx: bdx, dy: bdy };
}

/**
 * A regular staggered hex lattice of scales: cell index + distance to the cell centre (0 centre .. ~1 edge) and
 * the edge distance in cell units. Used for skin (flippers, necks) where real scales are near-regular.
 */
export function hexCell(x: number, y: number, size: number): { id: number; d: number; edge: number; cx: number; cy: number } {
  const h = size * 0.866;
  const row = Math.floor(y / h);
  let best = 1e9, second = 1e9, id = 0, bcx = 0, bcy = 0;
  for (let r = row - 1; r <= row + 1; r++) {
    const off = (r & 1) * size * 0.5;
    const col = Math.floor((x - off) / size);
    for (let c = col - 1; c <= col + 1; c++) {
      const cx = (c + 0.5) * size + off, cy = (r + 0.5) * h;
      const d = Math.hypot(x - cx, y - cy);
      if (d < best) { second = best; best = d; id = r * 977 + c; bcx = cx; bcy = cy; } else if (d < second) second = d;
    }
  }
  return { id, d: best / (size * 0.5), edge: (second - best) / size, cx: bcx, cy: bcy };
}

/** a small deterministic per-index pick (structured variation for hand-laid tiles, not noise) */
export const pick = (i: number, k: number) => (((i * 73856093) ^ (k * 19349663)) >>> 0) % 1000 / 1000;

/**
 * Cellular tiles on a jittered grid (the jitter is a fixed per-cell offset, so the layout is stable and smooth
 * at any texel size): cell id, distance to the cell's seed relative to the cell size, and the seam half-gap in
 * cell units. Reticulated skins (whiprays, giraffe-like nets), plates and pebbly scales.
 */
export function cells(x: number, y: number, size: number, jitter = 0.7, salt = 0): { id: number; d: number; seam: number } {
  const gx = Math.floor(x / size), gy = Math.floor(y / size);
  let b = 1e9, b2 = 1e9, bid = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j, id = cx * 7919 + cy * 104729 + salt * 31;
    const sx = (cx + 0.5 + (pick(id, 1) - 0.5) * jitter) * size, sy = (cy + 0.5 + (pick(id, 2) - 0.5) * jitter) * size;
    const d = Math.hypot(x - sx, y - sy);
    if (d < b) { b2 = b; b = d; bid = id; } else if (d < b2) b2 = d;
  }
  return { id: bid, d: b / size, seam: (b2 - b) * 0.5 / size };
}
