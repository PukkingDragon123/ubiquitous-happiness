// Depth is the spine of the run: the deeper the water, the darker and bluer the light, the fewer the god rays,
// the more the glowing life and marine snow carry the scene, and the harder (and richer) everything gets.
//
//   depthLook(area.look, metres)   the area's Look graded continuously by real depth (sunlit -> twilight ->
//                                  midnight -> hadal); the run re-applies it as the camera sinks
//   zoneOf(metres)                 'sunlit' | 'twilight' | 'midnight' | 'abyssal' | 'hadal'
//   depthDifficulty(m, mastery)    0.. : enemy difficulty for K's spawners
//   depthElite(m)                  elite chance;  depthLuck(m)  loot luck bonus;  depthPearls(m)  pearl multiplier
//   playerLight(m)                 the blobfish's own lantern intensity (0 in the sunlit zone)
//
// The scale is game metres: a floor descends ~30-40 m plus its exit shaft, so the reef is sunlit (0-60), the kelp
// and the graveyard sink through the twilight (60-200), the arctic and the abyss are midnight (200-380) and the
// endless hadal floors go on below.
import * as THREE from 'three';
import type { Look } from '../gfx/lighting';
import { smooth, lerp } from '../core/math';

export type Zone = 'sunlit' | 'twilight' | 'midnight' | 'abyssal' | 'hadal';
export function zoneOf(m: number): Zone { return m < 60 ? 'sunlit' : m < 200 ? 'twilight' : m < 330 ? 'midnight' : m < 420 ? 'abyssal' : 'hadal'; }
export const ZONE_NAME: Record<Zone, string> = { sunlit: 'SUNLIT ZONE', twilight: 'TWILIGHT ZONE', midnight: 'MIDNIGHT ZONE', abyssal: 'ABYSSAL ZONE', hadal: 'HADAL ZONE' };

const c = new THREE.Color(), d = new THREE.Color();
const mixHex = (a: string, b: string, t: number) => '#' + c.set(a).lerp(d.set(b), Math.max(0, Math.min(1, t))).getHexString();
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** the area's look graded by real depth (m) */
export function depthLook(L: Look, m: number): Look {
  const tw = smooth(25, 150, m), mid = smooth(150, 330, m), had = smooth(330, 620, m);
  let scTop = mixHex(L.scatterTop, '#0c2a52', tw); scTop = mixHex(scTop, '#04122a', mid); scTop = mixHex(scTop, '#01040c', had);
  let scDeep = mixHex(L.scatterDeep, '#06183a', tw); scDeep = mixHex(scDeep, '#020a1c', mid); scDeep = mixHex(scDeep, '#000206', had);
  let dMin = lerp3(L.depthMin, [0.12, 0.17, 0.28], tw); dMin = lerp3(dMin, [0.06, 0.085, 0.15], mid); dMin = lerp3(dMin, [0.03, 0.04, 0.08], had);
  const rim = L.rim ?? ['#e8fcff', 0.35];
  const fill = L.fill ?? ['#a0c8d8', 0.3];
  return {
    ...L,
    sun: mixHex(L.sun, '#9ab8ff', tw),
    sunI: L.sunI * lerp(1, 0.4, tw) * lerp(1, 0.35, mid) * lerp(1, 0.5, had),
    hemi: L.hemi * lerp(1, 0.75, tw) * lerp(1, 0.6, mid) * lerp(1, 0.7, had),
    hemiSky: mixHex(mixHex(L.hemiSky, '#1c3c78', tw), '#0c1a3a', mid),
    hemiGround: mixHex(L.hemiGround, '#020306', tw * 0.6 + mid * 0.4),
    rays: L.rays * (1 - 0.8 * tw) * (1 - mid),
    caustic: L.caustic * (1 - tw * 0.9),
    scatterTop: scTop, scatterDeep: scDeep,
    shallow: mixHex(L.shallow, scTop, tw), deep: mixHex(L.deep, scDeep, tw),
    depthMin: dMin,
    rim: [mixHex(rim[0], '#4a6aa8', tw), rim[1] * lerp(1, 0.6, tw) * lerp(1, 0.45, mid)],
    fill: [mixHex(fill[0], '#2a4a8a', tw), fill[1] * lerp(1, 0.6, mid)],
    exposure: L.exposure * (1 + 0.12 * tw + 0.15 * mid),
    bloom: (L.bloom ?? 0.3) + 0.2 * mid + 0.1 * had,
    vignette: (L.vignette ?? 0.2) + 0.15 * mid,
    fogK: (L.fogK ?? 0.045) * (1 + 0.5 * mid),
  };
}

/** enemy difficulty for K's spawners: mostly depth, a little mastery */
export const depthDifficulty = (m: number, mastery = 0) => Math.max(0, (m - 10) / 300) + mastery * 0.08;
export const depthElite = (m: number) => Math.min(0.6, 0.04 + m / 700);
export const depthLuck = (m: number) => m / 90;
export const depthPearls = (m: number) => 1 + Math.floor(m / 140);
/** the blobfish's own lantern: off in the sunlit water, brighter the darker it gets */
export const playerLight = (m: number) => smooth(45, 240, m) * 3.2 + smooth(240, 500, m) * 1.6;
