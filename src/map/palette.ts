// Per-zone palettes for the diorama: water, ground ramps (dark -> light, hue-shifted pixel-art style),
// the cutaway strata, and the light rig. Zones blend smoothly along the act.
import * as THREE from 'three';
import type { ZoneId } from './gen';

type R4 = [string, string, string, string];
export interface ZonePal {
  shallow: string; deep: string; foam: string; sky: string;
  sand: R4; grass: R4; rock: R4; bed: R4;
  capWater: [string, string, string];
  strata: R4; bedrock: string; ore: [string, string, string];
  sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number;
  /** 0 day .. 1 night (lantern / plankton glow) */
  night: number;
  exposure: number; saturation: number; contrast: number; bloom: number;
  table: string;
  coral: number; kelp: number; palms: number; snow: number; plankton: string;
}

export const PAL: Record<ZoneId, ZonePal> = {
  reef: {
    shallow: '#38d8d0', deep: '#0a4a92', foam: '#f2fffb', sky: '#bfe9ff',
    sand: ['#b0865a', '#d8b47a', '#ecd29a', '#fff1c8'], grass: ['#2c6a34', '#4c9a38', '#7cc646', '#bce66e'],
    rock: ['#4c4250', '#706668', '#988c80', '#c6baa4'], bed: ['#8a8466', '#b0a87a', '#d4c692', '#efe0b4'],
    capWater: ['#44d4d0', '#1a8eb6', '#0a3f78'], strata: ['#dcc28a', '#b88e5c', '#8c6a4a', '#664c48'], bedrock: '#3a2e3e', ore: ['#ffd84a', '#5af0d8', '#ff6a86'],
    sun: '#fff0d4', sunI: 2.7, hemiSky: '#bfe8ff', hemiGround: '#6a5a44', hemiI: 0.95, night: 0,
    exposure: 1.0, saturation: 1.12, contrast: 1.05, bloom: 0.45, table: '#6a4a34', coral: 1, kelp: 0, palms: 1, snow: 0, plankton: '#9ff6ff',
  },
  kelp: {
    shallow: '#52cdb0', deep: '#0b4a5a', foam: '#eefff4', sky: '#cdeee4',
    sand: ['#6e5e44', '#9a845e', '#bea67a', '#e0cc9e'], grass: ['#285a34', '#3c7c3c', '#62a24a', '#9ccc6c'],
    rock: ['#383a42', '#58585a', '#7e7a72', '#a8a294'], bed: ['#4e5a3e', '#6c7a4c', '#8c9660', '#b0b47e'],
    capWater: ['#3cbca4', '#16786e', '#0a3842'], strata: ['#8e7c5a', '#6c5c48', '#4e4640', '#3a3a3e'], bedrock: '#262630', ore: ['#8affc8', '#e8c450', '#ff8a5a'],
    sun: '#fff2d8', sunI: 2.5, hemiSky: '#c6f0dc', hemiGround: '#4a5034', hemiI: 1.0, night: 0,
    exposure: 1.0, saturation: 1.1, contrast: 1.06, bloom: 0.45, table: '#664834', coral: 0.25, kelp: 1, palms: 0.6, snow: 0, plankton: '#b0ffd8',
  },
  sunset: {
    shallow: '#6ccfc6', deep: '#22407a', foam: '#fff4ea', sky: '#ffc49a',
    sand: ['#a8664a', '#d49668', '#efbc86', '#ffdcac'], grass: ['#4a5a2c', '#768c36', '#a6b24a', '#d6ce6c'],
    rock: ['#4e3a48', '#7a5a5c', '#a27a6c', '#cca28a'], bed: ['#8c6c5c', '#b08a70', '#cea884', '#ecc8a2'],
    capWater: ['#5ec4c4', '#2c72a8', '#1a3268'], strata: ['#e2aa7a', '#c27a5a', '#905448', '#6a3e46'], bedrock: '#3a2436', ore: ['#ffcc4a', '#ff7ab4', '#7af0ff'],
    sun: '#ffc88e', sunI: 2.6, hemiSky: '#ffd2b4', hemiGround: '#5a3a44', hemiI: 0.95, night: 0.15,
    exposure: 1.02, saturation: 1.14, contrast: 1.06, bloom: 0.55, table: '#6e4834', coral: 0.6, kelp: 0, palms: 1, snow: 0, plankton: '#ffd8a8',
  },
  harbor: {
    shallow: '#5eae9c', deep: '#173f52', foam: '#eef6f0', sky: '#d6e2e4',
    sand: ['#5e584a', '#827a64', '#a69c7e', '#c8be9e'], grass: ['#34502e', '#4e6e3a', '#6e8c4a', '#9aae66'],
    rock: ['#3a3c46', '#585a62', '#7c7e82', '#a6a6a2'], bed: ['#4a5048', '#62695c', '#7e8470', '#9ea08a'],
    capWater: ['#4a9a90', '#24626e', '#123644'], strata: ['#8a8270', '#6a6458', '#4e4a48', '#3a3a42'], bedrock: '#24242e', ore: ['#c8d2dc', '#ffb04a', '#6ad0ff'],
    sun: '#ffe8cc', sunI: 2.4, hemiSky: '#d4e6e4', hemiGround: '#4c4638', hemiI: 1.05, night: 0.1,
    exposure: 1.0, saturation: 1.0, contrast: 1.07, bloom: 0.45, table: '#5e4636', coral: 0, kelp: 0.3, palms: 0, snow: 0, plankton: '#d8f0ff',
  },
  arctic: {
    shallow: '#86dcee', deep: '#16467c', foam: '#ffffff', sky: '#e4f4ff',
    sand: ['#7a8a98', '#a2b2be', '#c8d4de', '#eef4f8'], grass: ['#8ea6c4', '#b8cce2', '#dce8f6', '#ffffff'],
    rock: ['#3a4254', '#5a6276', '#7e889c', '#a8b2c4'], bed: ['#4a5e72', '#62788c', '#7e96a8', '#a0b6c6'],
    capWater: ['#6ad0e8', '#2a78b2', '#123c6e'], strata: ['#9aa8ba', '#78869a', '#56647c', '#3e4a62'], bedrock: '#262c42', ore: ['#bff4ff', '#ffffff', '#7ab0ff'],
    sun: '#f2f8ff', sunI: 2.5, hemiSky: '#dcf0ff', hemiGround: '#5a6a80', hemiI: 1.2, night: 0,
    exposure: 1.0, saturation: 1.0, contrast: 1.05, bloom: 0.5, table: '#5a4a40', coral: 0, kelp: 0, palms: 0, snow: 1, plankton: '#e0fbff',
  },
  abyss: {
    shallow: '#2a6c9c', deep: '#050c26', foam: '#9fd8ff', sky: '#3a5a9a',
    sand: ['#2a2a3c', '#3e3e54', '#56566e', '#74748e'], grass: ['#1c2a2c', '#2c3e3a', '#42584c', '#607a60'],
    rock: ['#17151e', '#292532', '#3d3748', '#595168'], bed: ['#1a2238', '#24304c', '#304060', '#405476'],
    capWater: ['#2a5c8c', '#142e5c', '#050b22'], strata: ['#3c344a', '#2c2838', '#221e2c', '#18141e'], bedrock: '#0c0a12', ore: ['#5affe8', '#ff5aa8', '#ffd84a'],
    sun: '#9cb6ff', sunI: 1.25, hemiSky: '#4a62a8', hemiGround: '#141826', hemiI: 0.75, night: 1,
    exposure: 1.08, saturation: 1.12, contrast: 1.1, bloom: 0.8, table: '#2e2430', coral: 0, kelp: 0.4, palms: 0, snow: 0, plankton: '#5affea',
  },
  trench: {
    shallow: '#245c8e', deep: '#03071a', foam: '#a8c8ff', sky: '#2a3a6a',
    sand: ['#24222e', '#36323e', '#4c4654', '#686072'], grass: ['#1a2224', '#283432', '#3a4a42', '#566a56'],
    rock: ['#141118', '#241e28', '#382e3c', '#524558'], bed: ['#16182c', '#20243e', '#2c3252', '#3c446a'],
    capWater: ['#244e80', '#10244e', '#03061a'], strata: ['#3a2c3a', '#2a2030', '#1e1824', '#140f18'], bedrock: '#08060c', ore: ['#ff7a3a', '#5affe8', '#c07aff'],
    sun: '#a4a8ff', sunI: 1.1, hemiSky: '#3a4a90', hemiGround: '#100c18', hemiI: 0.7, night: 1,
    exposure: 1.1, saturation: 1.15, contrast: 1.1, bloom: 0.85, table: '#2a2028', coral: 0, kelp: 0.2, palms: 0, snow: 0, plankton: '#ff9aea',
  },
};

const tmp = new THREE.Color();
export const col = (s: string) => new THREE.Color(s);
/** blend a colour field of up to 3 zones with weights w */
export function blendCol(pals: ZonePal[], w: [number, number, number], get: (p: ZonePal) => string, out = new THREE.Color()): THREE.Color {
  out.setRGB(0, 0, 0);
  for (let i = 0; i < 3; i++) if (w[i] > 0) { tmp.set(get(pals[Math.min(i, pals.length - 1)])); out.r += tmp.r * w[i]; out.g += tmp.g * w[i]; out.b += tmp.b * w[i]; }
  return out;
}
export function blendNum(pals: ZonePal[], w: [number, number, number], get: (p: ZonePal) => number): number {
  let v = 0;
  for (let i = 0; i < 3; i++) v += get(pals[Math.min(i, pals.length - 1)]) * w[i];
  return v;
}
