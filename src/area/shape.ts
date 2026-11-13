// The shape of an area's seabed: the bedrock profile under the gameplay plane, the initial sand cover, and the
// 3D seabed behind it (dunes, rising reef walls, a falling abyssal drop-off), all deterministic from the seed.
import { fbm, smooth, noise1 } from '../core/math';
import type { AreaDef } from './defs';

export interface Shape {
  X0: number; X1: number;
  /** bedrock top under the gameplay plane */
  bed(x: number): number;
  /** initial sand thickness */
  sand0(x: number): number;
  /** seabed height anywhere behind the sand strip (z <= -3.8) */
  back(x: number, z: number): number;
  /** reserved x positions (wreck, buoy, spawn) */
  wreckX: number; buoyX: number; spawnX: number;
  /** hero set pieces: the kelp light hall's aisle, the graveyard's broken galleon */
  hallX: number; galleonX: number;
}

export const SEAM_Z = -3.8;

export function makeShape(a: AreaDef, seed: number): Shape {
  const W = a.width, X0 = -W / 2, X1 = W / 2, s = seed % 9973;
  const wreckX = (seed % 7) - 3;          // near the middle
  const buoyX = X1 - 26 - (seed % 5);     // toward the right end
  const spawnX = X0 + 18;
  const hallX = wreckX + 27, galleonX = wreckX - 36;
  const edge = (x: number) => {
    // the area ends in rising cliffs (the camera clamps before them)
    const e = Math.max(0, Math.abs(x) - (W / 2 - 14)) / 14;
    return e * e * (-a.floor * 0.55);
  };
  const flatAt = (x: number, c: number, r: number) => smooth(r + 4, r, Math.abs(x - c));
  const bedRaw = (x: number) => {
    let y = a.floor + (fbm(x * 0.028, 0.5, 4, s) - 0.5) * 2 * a.amp + (fbm(x * 0.13, 3.1, 2, s + 9) - 0.5) * a.amp * 0.35;
    switch (a.id) {
      case 'reef': y += Math.max(0, noise1(x * 0.05, s + 3) - 0.55) * 7; break;                      // coral knolls
      case 'kelp': y += (fbm(x * 0.07, 1.7, 3, s + 4) - 0.5) * 2.5; break;                          // boulder reef
      case 'graveyard': y -= Math.max(0, noise1(x * 0.04, s + 5) - 0.6) * 6; break;                 // scour pits
      case 'arctic': y += Math.abs(Math.sin(x * 0.09 + s)) * 1.2; break;                             // moraine ridges
      case 'abyss': y -= Math.max(0, 1 - Math.abs(x - wreckX - 22) / 9) * 5; break;                  // a vent trench
    }
    return y;
  };
  const bed = (x: number) => {
    let y = bedRaw(x);
    // flatten under the wreck, the buoy anchor and the arrival
    const kw = flatAt(x, wreckX, 9), kb = flatAt(x, buoyX, 3), ks = flatAt(x, spawnX, 4);
    const k = Math.max(kw, kb, ks);
    y = y * (1 - k) + (a.floor - 0.2) * k;
    return Math.min(y + edge(x), -3);
  };
  const sand0 = (x: number) => {
    const n = fbm(x * 0.05, 7.7, 3, s + 21);
    let t = a.sand * (0.3 + n * 1.4);
    if (fbm(x * 0.09, 2.2, 2, s + 22) < 0.33) t *= 0.15; // rocky outcrops poke through
    t += smooth(10, 0, Math.abs(x - wreckX)) * 0.5;     // the wreck sits in a drift of sand
    return Math.max(0, t);
  };
  const seamAt = (x: number) => bed(x) + sand0(x);
  const back = (x: number, z: number) => {
    const k = smooth(SEAM_Z, -16, z);
    const rise = smooth(-6, -48, z);
    let b = a.floor + a.backRise * rise * (0.55 + 0.9 * fbm(x * 0.018, z * 0.03, 3, s + 31));
    b += (fbm(x * 0.07, z * 0.09, 3, s + 32) - 0.5) * 1.6 * (1 - rise * 0.5);          // dunes / rubble
    b += Math.max(0, fbm(x * 0.025, z * 0.04, 3, s + 33) - 0.55) * 16 * smooth(-12, -36, z); // cliffs and knolls
    if (a.id === 'abyss') b -= smooth(-14, -40, z) * 10;                                     // the drop-off behind
    if (a.id === 'graveyard') b += Math.max(0, fbm(x * 0.05, z * 0.05, 2, s + 34) - 0.6) * 4;
    b += edge(x) * 1.3;
    let h = seamAt(x) * (1 - k) + b * k;
    const cap = a.ice ? -4.5 : -3.2;
    if (h > cap - 2) h = cap - 2 * Math.exp(-(h - (cap - 2)) / 2);
    return h;
  };
  return { X0, X1, bed, sand0, back, wreckX, buoyX, spawnX, hallX, galleonX };
}
