// Archetypes: body build, face, hair, outfit, rod and temperament of every kind of fisherman, with seeded
// variation (skin, hair, clothing colours, small proportion and face changes). Everything downstream (geometry,
// paint, animation) reads one resolved Look.
import type { RGB } from '../gfx/px';
import { hex, mix } from '../gfx/px';
import { Rng } from '../core/rng';
import type { Build } from './rig';

export type FisherArch = 'oldSalt' | 'weekendDad' | 'kid' | 'grandma' | 'proAngler' | 'iceFisher' | 'dockWorker' | 'captainGaff';
/** v2 wave enemies: scuba harpooners, camo free divers, net divers, black-suited knife commandos, medics,
 * brass-helmet heavy divers and the titan */
export type DiverArch = 'scuba' | 'freediver' | 'netDiver' | 'commando' | 'medic' | 'heavyDiver' | 'titan';
export type Archetype = FisherArch | DiverArch;
export const ARCHETYPES: Archetype[] = ['oldSalt', 'weekendDad', 'kid', 'grandma', 'proAngler', 'iceFisher', 'dockWorker', 'captainGaff'];
export const DIVER_ARCHETYPES: DiverArch[] = ['scuba', 'freediver', 'netDiver', 'commando', 'medic', 'heavyDiver', 'titan'];
export const isDiverArch = (a: string): a is DiverArch => (DIVER_ARCHETYPES as string[]).includes(a);

export type HairStyle = 'none' | 'short' | 'messy' | 'bun' | 'sides' | 'shaggy' | 'long';
export type Facial = 'none' | 'stubble' | 'beard' | 'bigBeard' | 'moustache' | 'walrus' | 'goatee';
export type HatKind = 'none' | 'captain' | 'bucket' | 'cap' | 'capBack' | 'sunhat' | 'ushanka' | 'beanie' | 'captainBlack' | 'hood' | 'brass';
export type Glasses = 'none' | 'sun' | 'wrap' | 'round';
export type TopKind = 'sweater' | 'hawaiian' | 'tee' | 'blouse' | 'sunshirt' | 'thermal' | 'flannel' | 'henley';
export type OuterKind = 'none' | 'cardigan' | 'vest' | 'parka' | 'slicker' | 'raincoat';
export type LegKind = 'pants' | 'shorts' | 'skirt' | 'overalls' | 'snowpants';
export type FeetKind = 'boot' | 'rubber' | 'sneaker' | 'sandal' | 'shoe' | 'snow' | 'bootie' | 'lead';
export type HandKind = 'bare' | 'mitten' | 'glove';
export type RodKind = 'boat' | 'spin' | 'kid' | 'cane' | 'pro' | 'ice' | 'pier' | 'heavy';
export type ReelKind = 'spin' | 'conventional' | 'spincast' | 'baitcast' | 'inline' | 'vintage';

/** dive kit (divers only): suit paint, mask, tank, fins and belt; painted by divePaint.ts, built by diveGear.ts */
export interface DiveKit {
  suit: 'wetsuit' | 'canvas';
  col: RGB; col2: RGB; col3: RGB;
  pattern: 'panels' | 'camo' | 'plain';
  hood: boolean;
  mask: 'none' | 'scuba' | 'free' | 'brass' | 'commando';
  lens: RGB;
  tank: 'none' | 'single' | 'twin' | 'rebreather';
  tankCol: RGB;
  bcd: boolean;
  fins: 'none' | 'short' | 'long';
  finCol: RGB;
  belt: boolean;
  knife: boolean;
  snorkel: boolean;
  cross: boolean;
  num: number;
}

export interface Look {
  arch: Archetype; seed: number;
  /** nemesis scars painted / built onto the model: eyepatch, hookHand, burns, bandage, bite, scar */
  scars?: string[];
  dive?: DiveKit;
  build: Build;
  skin: RGB; skinDark: number; age: number;
  hair: { style: HairStyle; col: RGB; grey: number };
  facial: Facial; facialCol: RGB;
  face: {
    iris: RGB; eyeR: number; eyeX: number; brow: number; browCol: RGB;
    nose: { w: number; len: number; bulb: number; up: number; red: number };
    jaw: number; chin: number; cheek: number; wide: number; long: number;
    freckles: number; blush: number; sunburn: number; ears: number; eyepatch: '' | 'L' | 'R'; scar: number;
    teethGap: boolean; lipK: number;
  };
  glasses: Glasses; glassCol: RGB; lensCol: RGB;
  hat: HatKind; hatCol: RGB; hatCol2: RGB;
  top: { kind: TopKind; col: RGB; col2: RGB; col3: RGB; sleeve: 'short' | 'long' | 'rolled'; hem: number };
  outer: { kind: OuterKind; col: RGB; col2: RGB; hem: number; open: boolean; sleeve: 'none' | 'long'; thick: number };
  legs: { kind: LegKind; col: RGB; col2: RGB; hem: number };
  feet: { kind: FeetKind; col: RGB; col2: RGB };
  hands: { kind: HandKind; col: RGB };
  extras: { pipe?: boolean; pearls?: boolean; scarf?: RGB; lures?: boolean; whistle?: boolean; harpoon?: boolean; belt?: RGB; watch?: boolean; badge?: boolean };
  rod: { kind: RodKind; len: number; col: RGB; wrap: RGB; reel: ReelKind; reelCol: RGB; thick: number };
  anim: { speed: number; energy: number; bounce: number; heavy: number };
}

const SKINS: string[] = ['#f6d3bc', '#eec0a0', '#e3ad8a', '#d29a74', '#bd8160', '#a26a4b', '#86543a', '#6a3f2c', '#53311f'];
const HAIRS: string[] = ['#1d1612', '#2e211a', '#4a3324', '#6b4a2e', '#8f6a42', '#b98c55', '#d6b27a', '#7a2f1c', '#a8481f'];
const IRIS: string[] = ['#5a3a22', '#3e2a1a', '#6b8a3a', '#4f7fa8', '#2f5f8a', '#7a6a4a', '#3a6a5a', '#8a9aa8'];

const C = (h: string): RGB => hex(h);
const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r.next() * a.length)];
const jitter = (r: Rng, c: RGB, k = 0.08): RGB => {
  const f = 1 + (r.next() - 0.5) * k * 2;
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
};

function baseBuild(o: Partial<Build>): Build {
  return { s: 1, bw: 1, mass: 1, belly: 0, chest: 0.2, fem: 0, headS: 1.18, legLen: 0.93, armLen: 0.97, handS: 1.2, footS: 1.12, shoulders: 1.04, neckLen: 0.82, hunch: 0, ...o };
}

function baseFace(r: Rng, o: Partial<Look['face']> = {}): Look['face'] {
  return {
    iris: C(pick(r, IRIS)), eyeR: 1, eyeX: 1, brow: 1, browCol: [40, 30, 24],
    nose: { w: 1 + (r.next() - 0.5) * 0.3, len: 1 + (r.next() - 0.5) * 0.3, bulb: r.next() * 0.4, up: (r.next() - 0.5) * 0.3, red: 0.15 },
    jaw: 1, chin: 1, cheek: 1, wide: 1, long: 1,
    freckles: 0, blush: 0.3, sunburn: 0, ears: 1, eyepatch: '', scar: 0, teethGap: false, lipK: 1,
    ...o,
  };
}

/** resolve an archetype + seed into a full look */
export function makeLook(arch: Archetype, seed: number): Look {
  const ai = (ARCHETYPES as string[]).indexOf(arch);
  const r = new Rng((seed * 2654435761 + (ai >= 0 ? ai : 20 + DIVER_ARCHETYPES.indexOf(arch as DiverArch)) * 97) >>> 0);
  const skinI = Math.min(SKINS.length - 1, Math.floor(r.next() * SKINS.length));
  let skin = C(SKINS[skinI]);
  const dark = skinI / (SKINS.length - 1);
  const hairNat = C(pick(r, dark > 0.55 ? HAIRS.slice(0, 3) : HAIRS));
  const greyHair = (k: number): RGB => mix(hairNat, [222, 220, 214], k);
  const L: Look = {
    arch, seed, build: baseBuild({}), skin, skinDark: dark, age: 0.35,
    hair: { style: 'short', col: hairNat, grey: 0 },
    facial: 'none', facialCol: hairNat,
    face: baseFace(r),
    glasses: 'none', glassCol: [30, 30, 34], lensCol: [30, 40, 50],
    hat: 'none', hatCol: [200, 60, 50], hatCol2: [240, 240, 240],
    top: { kind: 'tee', col: [200, 200, 200], col2: [60, 60, 60], col3: [255, 255, 255], sleeve: 'short', hem: 0.9 },
    outer: { kind: 'none', col: [0, 0, 0], col2: [0, 0, 0], hem: 0.9, open: false, sleeve: 'none', thick: 0 },
    legs: { kind: 'pants', col: [70, 70, 80], col2: [50, 50, 60], hem: -0.83 },
    feet: { kind: 'boot', col: [60, 40, 30], col2: [30, 25, 20] },
    hands: { kind: 'bare', col: skin },
    extras: {},
    rod: { kind: 'spin', len: 2.1, col: [40, 60, 120], wrap: [200, 40, 40], reel: 'spin', reelCol: [60, 60, 66], thick: 1 },
    anim: { speed: 1, energy: 1, bounce: 1, heavy: 0.3 },
  };
  const F = L.face;
  switch (arch) {
    case 'oldSalt': {
      skin = mix(skin, [176, 112, 80], 0.25); L.skin = skin;
      L.build = baseBuild({ s: 0.97, bw: 1.08, mass: 1.14, belly: 0.45, chest: 0.4, hunch: 0.12, headS: 1.2 });
      L.age = 0.95;
      L.hair = { style: 'sides', col: greyHair(0.92), grey: 0.92 };
      L.facial = 'bigBeard'; L.facialCol = greyHair(0.88);
      F.browCol = greyHair(0.8); F.brow = 1.35;
      F.nose = { w: 1.25, len: 1.1, bulb: 0.9, up: 0, red: 0.55 };
      F.cheek = 1.04; F.blush = 0.55; F.eyeR = 0.92;
      L.hat = 'captain'; L.hatCol = [236, 234, 226]; L.hatCol2 = [24, 26, 38];
      const sw = pick(r, ['#1f2d4f', '#e8dfc8', '#2f4a3a', '#5a2a2a']);
      L.top = { kind: 'sweater', col: C(sw), col2: jitter(r, C(sw), 0.1), col3: [230, 230, 230], sleeve: 'long', hem: 0.86 };
      L.legs = { kind: 'pants', col: C(pick(r, ['#3a3a40', '#4a4234', '#2c3442'])), col2: [40, 40, 40], hem: -0.83 };
      L.feet = { kind: 'rubber', col: C(pick(r, ['#202224', '#3a2a1e'])), col2: [180, 170, 150] };
      L.extras = { pipe: true };
      L.rod = { kind: 'boat', len: 2.0, col: C(pick(r, ['#2a4a2a', '#4a3020', '#1a2a4a'])), wrap: [210, 180, 90], reel: 'conventional', reelCol: [170, 140, 70], thick: 1.3 };
      L.anim = { speed: 0.8, energy: 0.75, bounce: 0.6, heavy: 0.6 };
      break;
    }
    case 'weekendDad': {
      L.build = baseBuild({ s: 1.0, bw: 1.05, mass: 1.22, belly: 1.2, chest: 0.2, headS: 1.18 });
      L.age = 0.5;
      L.hair = { style: 'short', col: hairNat, grey: 0.15 };
      L.facial = r.chance(0.6) ? 'stubble' : 'moustache'; L.facialCol = hairNat;
      F.browCol = mix(hairNat, [20, 16, 12], 0.3);
      F.sunburn = dark < 0.5 ? 0.8 : 0.2; F.nose.red = 0.5;
      L.hat = 'bucket'; L.hatCol = C(pick(r, ['#c8b48a', '#7a8a5a', '#e8e0c8', '#4a6a8a'])); L.hatCol2 = mix(L.hatCol, [40, 30, 20], 0.3);
      L.glasses = 'sun'; L.glassCol = [24, 22, 22]; L.lensCol = C(pick(r, ['#202a30', '#3a2a10', '#103040']));
      const base = pick(r, ['#d8343a', '#1f8fa8', '#e86a1f', '#2a5ab0', '#2a9a6a']);
      L.top = { kind: 'hawaiian', col: C(base), col2: C(pick(r, ['#ffd84a', '#ffffff', '#ff8fb0'])), col3: C(pick(r, ['#1a6a3a', '#0f5a5a', '#3a7a2a'])), sleeve: 'short', hem: 0.88 };
      L.legs = { kind: 'shorts', col: C(pick(r, ['#b8a27a', '#8a8a6a', '#6a7a8a'])), col2: [90, 80, 60], hem: -0.25 };
      L.feet = { kind: 'sandal', col: [110, 72, 44], col2: [244, 244, 240] };
      L.extras = { watch: true };
      L.rod = { kind: 'spin', len: 2.0, col: C(pick(r, ['#2a5ab0', '#b02a2a', '#2a8a4a'])), wrap: [240, 240, 240], reel: 'spin', reelCol: [70, 70, 80], thick: 1 };
      L.anim = { speed: 1, energy: 1.1, bounce: 1.2, heavy: 0.5 };
      break;
    }
    case 'kid': {
      L.build = baseBuild({ s: 0.64, bw: 0.95, mass: 0.95, belly: 0.25, chest: 0, headS: 1.62, legLen: 0.9, armLen: 0.95, handS: 1.3, footS: 1.3, neckLen: 0.7 });
      L.age = 0;
      L.hair = { style: 'messy', col: hairNat, grey: 0 };
      F.freckles = dark < 0.5 ? 0.9 : 0.3; F.eyeR = 1.12; F.blush = 0.6; F.teethGap = true;
      F.nose = { w: 0.85, len: 0.75, bulb: 0.4, up: 0.45, red: 0.2 }; F.chin = 0.9; F.cheek = 1.06; F.wide = 1.04; F.long = 0.84;
      L.hat = r.chance(0.5) ? 'capBack' : 'cap'; L.hatCol = C(pick(r, ['#d8343a', '#2a6ad8', '#2aa84a', '#f0a020'])); L.hatCol2 = [250, 250, 250];
      const st = pick(r, [['#f2f2f2', '#2a6ad8'], ['#ffd84a', '#e8463a'], ['#9ad84a', '#2a8a4a'], ['#ff9ac0', '#8a3aa8']]);
      L.top = { kind: 'tee', col: C(st[0]), col2: C(st[1]), col3: [255, 255, 255], sleeve: 'short', hem: 0.9 };
      L.legs = { kind: 'shorts', col: C(pick(r, ['#3a5a8a', '#6a7a4a', '#c87a3a'])), col2: [40, 40, 60], hem: -0.2 };
      L.feet = { kind: 'sneaker', col: C(pick(r, ['#e8463a', '#2a8ad8', '#3ac87a', '#f8c83a'])), col2: [250, 250, 250] };
      L.rod = { kind: 'kid', len: 1.3, col: C(pick(r, ['#f8c83a', '#ff6ab0', '#3ac8e8'])), wrap: [250, 250, 250], reel: 'spincast', reelCol: [240, 240, 240], thick: 1 };
      L.anim = { speed: 1.25, energy: 1.5, bounce: 1.6, heavy: 0 };
      break;
    }
    case 'grandma': {
      L.build = baseBuild({ s: 0.88, fem: 1, bw: 1.0, mass: 1.06, belly: 0.35, chest: 0.3, hunch: 0.4, headS: 1.22, shoulders: 0.92, neckLen: 0.75 });
      L.age = 1;
      L.hair = { style: 'bun', col: greyHair(0.95), grey: 0.95 };
      F.browCol = greyHair(0.7); F.brow = 0.75; F.blush = 0.7; F.eyeR = 0.95; F.lipK = 0.8;
      F.nose = { w: 0.9, len: 0.95, bulb: 0.3, up: -0.1, red: 0.2 }; F.chin = 0.9; F.cheek = 1.05; F.long = 0.94;
      L.glasses = 'round'; L.glassCol = C(pick(r, ['#8a6a3a', '#c0a060', '#a03a5a'])); L.lensCol = [200, 220, 230];
      L.hat = 'sunhat'; L.hatCol = [226, 200, 142]; L.hatCol2 = C(pick(r, ['#c83a5a', '#3a6ab0', '#8a3aa8', '#3a8a5a']));
      const cg = pick(r, ['#b89ad0', '#7ab8b0', '#f0b090', '#d07a8a', '#a8b870']);
      L.top = { kind: 'blouse', col: [248, 244, 236], col2: C(pick(r, ['#e86a8a', '#6a8ae8', '#e8a83a'])), col3: [120, 170, 110], sleeve: 'long', hem: 0.88 };
      L.outer = { kind: 'cardigan', col: C(cg), col2: mix(C(cg), [40, 30, 40], 0.3), hem: 1.0, open: true, sleeve: 'long', thick: 0.007 };
      L.legs = { kind: 'skirt', col: C(pick(r, ['#5a4a6a', '#3a4a5a', '#6a4a3a', '#2a3a4a'])), col2: [40, 30, 40], hem: -0.55 };
      L.feet = { kind: 'shoe', col: C(pick(r, ['#c8b090', '#3a2a24', '#7a5a4a'])), col2: [60, 50, 40] };
      L.extras = { pearls: true };
      L.rod = { kind: 'cane', len: 2.2, col: [200, 160, 90], wrap: [150, 30, 40], reel: 'vintage', reelCol: [190, 170, 120], thick: 1 };
      L.anim = { speed: 0.72, energy: 0.6, bounce: 0.5, heavy: 0.2 };
      break;
    }
    case 'proAngler': {
      L.build = baseBuild({ s: 1.01, bw: 1.0, mass: 0.98, belly: 0.1, chest: 0.4, headS: 1.16 });
      L.age = 0.4;
      L.hair = { style: 'short', col: hairNat, grey: 0 };
      L.facial = 'goatee'; L.facialCol = hairNat;
      F.browCol = mix(hairNat, [20, 16, 12], 0.3); F.jaw = 1.06;
      L.hat = 'cap'; L.hatCol = C(pick(r, ['#e8e8e8', '#3a4a5a', '#2a2a2a', '#5a6a3a'])); L.hatCol2 = C(pick(r, ['#e84a2a', '#2aa8e8', '#f8c83a']));
      L.glasses = 'wrap'; L.glassCol = [30, 30, 34]; L.lensCol = C(pick(r, ['#2a7ad8', '#e87a2a', '#3ad89a']));
      L.top = { kind: 'sunshirt', col: C(pick(r, ['#a8c8e0', '#d8d8d0', '#8ab0a0'])), col2: [60, 90, 110], col3: [240, 240, 240], sleeve: 'long', hem: 0.86 };
      L.outer = { kind: 'vest', col: C(pick(r, ['#8a8460', '#5a6448', '#a8946a'])), col2: [60, 56, 40], hem: 0.96, open: false, sleeve: 'none', thick: 0.012 };
      L.legs = { kind: 'pants', col: C(pick(r, ['#a89a7a', '#6a6a5a', '#4a5260'])), col2: [60, 60, 50], hem: -0.83 };
      L.feet = { kind: 'boot', col: [110, 80, 50], col2: [40, 34, 30] };
      L.extras = { lures: true, watch: true };
      L.rod = { kind: 'pro', len: 2.35, col: [24, 24, 28], wrap: C(pick(r, ['#e83a2a', '#2a8ae8', '#e8c03a'])), reel: 'baitcast', reelCol: [190, 50, 40], thick: 0.9 };
      L.anim = { speed: 1.1, energy: 1.1, bounce: 0.9, heavy: 0.2 };
      break;
    }
    case 'iceFisher': {
      L.build = baseBuild({ s: 0.98, bw: 1.12, mass: 1.3, belly: 0.5, chest: 0.3, headS: 1.18 });
      L.age = 0.6;
      L.hair = { style: 'short', col: hairNat, grey: 0.3 };
      L.facial = 'walrus'; L.facialCol = mix(hairNat, [210, 205, 200], 0.3);
      F.browCol = L.facialCol; F.blush = 1; F.nose.red = 0.75; F.brow = 1.2;
      L.hat = 'ushanka'; L.hatCol = C(pick(r, ['#3a3028', '#2a3040', '#4a3a2a'])); L.hatCol2 = C(pick(r, ['#8a6a4a', '#c8b8a0', '#5a4a3a']));
      const pk = pick(r, ['#c83a2a', '#e87a1a', '#3a5a3a', '#2a4a8a']);
      L.top = { kind: 'thermal', col: [200, 190, 170], col2: [160, 150, 130], col3: [240, 240, 240], sleeve: 'long', hem: 0.86 };
      L.outer = { kind: 'parka', col: C(pk), col2: mix(C(pk), [20, 20, 30], 0.35), hem: 0.74, open: false, sleeve: 'long', thick: 0.03 };
      L.legs = { kind: 'snowpants', col: C(pick(r, ['#22262e', '#2a3448', '#3a3a3a'])), col2: [20, 20, 24], hem: -0.83 };
      L.feet = { kind: 'snow', col: [70, 60, 52], col2: [200, 190, 175] };
      L.hands = { kind: 'mitten', col: C(pick(r, ['#c83a3a', '#3a6aa8', '#e8e0d0', '#4a7a3a'])) };
      L.extras = { scarf: C(pick(r, ['#e8d84a', '#3a8ac8', '#c83a8a', '#e8e8e8'])) };
      L.rod = { kind: 'ice', len: 0.75, col: [220, 60, 40], wrap: [20, 20, 20], reel: 'inline', reelCol: [40, 40, 44], thick: 1.1 };
      L.anim = { speed: 0.85, energy: 0.85, bounce: 0.8, heavy: 0.5 };
      break;
    }
    case 'dockWorker': {
      L.build = baseBuild({ s: 1.04, bw: 1.12, mass: 1.1, belly: 0.4, chest: 0.6, headS: 1.16, shoulders: 1.1 });
      L.age = 0.55;
      L.hair = { style: 'short', col: hairNat, grey: 0.2 };
      L.facial = r.chance(0.5) ? 'moustache' : 'beard'; L.facialCol = hairNat;
      F.browCol = mix(hairNat, [20, 16, 12], 0.3); F.brow = 1.3; F.jaw = 1.1; F.nose = { w: 1.15, len: 1.05, bulb: 0.5, up: -0.1, red: 0.35 };
      L.hat = 'beanie'; L.hatCol = C(pick(r, ['#e86a1a', '#c82a2a', '#3a3a40', '#2a5a8a', '#3a6a3a'])); L.hatCol2 = L.hatCol;
      L.top = { kind: 'flannel', col: C(pick(r, ['#a83a2a', '#3a5a8a', '#3a6a3a'])), col2: [30, 30, 30], col3: [230, 220, 200], sleeve: 'long', hem: 0.86 };
      L.outer = { kind: 'slicker', col: C(pick(r, ['#f2c81e', '#e8761e', '#f2c81e'])), col2: [180, 140, 20], hem: 0.82, open: true, sleeve: 'long', thick: 0.012 };
      L.legs = { kind: 'overalls', col: C(pick(r, ['#f2c81e', '#e8761e', '#3a4a3a'])), col2: [60, 60, 50], hem: -0.83 };
      L.feet = { kind: 'rubber', col: C(pick(r, ['#5a3a26', '#2a4a2a', '#e8c81e'])), col2: [200, 160, 60] };
      L.hands = { kind: 'glove', col: C(pick(r, ['#e8701e', '#3a6ab0', '#e8e0d0'])) };
      L.rod = { kind: 'pier', len: 2.6, col: C(pick(r, ['#e8e8e0', '#2a2a2a', '#3a5a3a'])), wrap: [40, 40, 40], reel: 'conventional', reelCol: [60, 60, 66], thick: 1.2 };
      L.anim = { speed: 0.95, energy: 1, bounce: 0.8, heavy: 0.5 };
      break;
    }
    case 'captainGaff': {
      skin = mix(skin, [170, 120, 96], 0.2); L.skin = skin;
      L.build = baseBuild({ s: 1.24, bw: 1.32, mass: 1.42, belly: 0.75, chest: 1, headS: 1.08, shoulders: 1.2, handS: 1.3, neckLen: 0.62, hunch: 0.1 });
      L.age = 0.75;
      L.hair = { style: 'shaggy', col: C('#1a1614'), grey: 0.15 };
      L.facial = 'bigBeard'; L.facialCol = C(pick(r, ['#1a1614', '#2a1a12', '#4a2614']));
      F.browCol = L.facialCol; F.brow = 1.6; F.eyepatch = 'R'; F.scar = 1; F.jaw = 1.15; F.chin = 1.1;
      F.nose = { w: 1.3, len: 1.15, bulb: 0.7, up: -0.2, red: 0.45 }; F.eyeR = 0.95;
      L.hat = 'captainBlack'; L.hatCol = [28, 28, 34]; L.hatCol2 = [200, 160, 60];
      L.top = { kind: 'henley', col: [70, 64, 60], col2: [40, 36, 34], col3: [200, 170, 90], sleeve: 'long', hem: 0.86 };
      L.outer = { kind: 'raincoat', col: C(pick(r, ['#2c3646', '#3a3028', '#26382e'])), col2: [190, 150, 60], hem: 0.4, open: false, sleeve: 'long', thick: 0.016 };
      L.legs = { kind: 'pants', col: [40, 38, 40], col2: [30, 30, 30], hem: -0.83 };
      L.feet = { kind: 'rubber', col: [26, 24, 24], col2: [70, 60, 50] };
      L.hands = { kind: 'bare', col: skin };
      L.extras = { harpoon: true, belt: [60, 40, 26] };
      L.rod = { kind: 'heavy', len: 2.7, col: [20, 20, 22], wrap: [200, 160, 60], reel: 'conventional', reelCol: [200, 160, 60], thick: 1.8 };
      L.anim = { speed: 0.78, energy: 1.2, bounce: 0.4, heavy: 1 };
      break;
    }
    default: {
      // ---------------- divers: an athletic build in a skin-tight suit, the face framed by a hood and a mask
      const d = arch as DiverArch;
      const heavy = d === 'heavyDiver' || d === 'titan';
      // MGS2-style mass: broad shoulders, a barrel chest, wide hips, big gloved hands
      L.build = baseBuild({ s: d === 'titan' ? 1.55 : heavy ? 1.08 : 1.0 + (r.next() - 0.5) * 0.06, bw: heavy ? 1.24 : 1.14, mass: heavy ? 1.3 : 1.1, belly: heavy ? 0.4 : 0.1, chest: heavy ? 1 : 0.9, headS: d === 'titan' ? 1.0 : 1.1, shoulders: heavy ? 1.24 : 1.2, handS: heavy ? 1.45 : 1.35, footS: 1.12, neckLen: 0.7, fem: d === 'medic' && r.chance(0.5) ? 1 : 0 });
      L.age = 0.3 + r.next() * 0.4;
      L.hair = { style: 'none', col: hairNat, grey: 0 };
      L.facial = r.chance(0.45) ? 'stubble' : r.chance(0.3) ? 'moustache' : 'none'; L.facialCol = hairNat;
      if (L.build.fem > 0.5) L.facial = 'none';
      F.browCol = mix(hairNat, [20, 16, 12], 0.3); F.brow = 1.15; F.jaw = 1.05;
      L.hat = heavy ? 'brass' : 'hood'; L.hatCol = [20, 20, 22]; L.hatCol2 = [20, 20, 22];
      const neo = (h: string) => C(h);
      const kit: DiveKit = {
        suit: heavy ? 'canvas' : 'wetsuit', col: neo('#24272c'), col2: neo('#2a6ab0'), col3: neo('#e8c020'), pattern: 'panels', hood: !heavy,
        mask: heavy ? 'brass' : 'scuba', lens: [40, 70, 80], tank: heavy ? 'none' : 'single', tankCol: C(pick(r, ['#e8c018', '#d8dade', '#c83a24', '#2a4a8a'])),
        bcd: !heavy, fins: heavy ? 'none' : 'short', finCol: C(pick(r, ['#16181c', '#e8c018', '#2a6ab0'])), belt: true, knife: !heavy, snorkel: false, cross: false,
        num: 1 + Math.floor(r.next() * 9),
      };
      switch (d) {
        case 'scuba': {
          kit.col2 = C(pick(r, ['#2a5aa8', '#c8401c', '#e8b818', '#3a7a5a', '#6a6e78']));
          kit.col3 = C(pick(r, ['#e8e8e0', '#e8c020', '#18a8c8']));
          break;
        }
        case 'freediver': {
          // reef camo: blotches of olive, sand and kelp brown, a long-bladed carbon fin, a snorkel and no tank
          kit.pattern = 'camo'; kit.col = C(pick(r, ['#3a4232', '#2e3a36', '#4a4436'])); kit.col2 = C(pick(r, ['#6a6a48', '#58704e', '#7a6a4a'])); kit.col3 = C('#22261e');
          kit.mask = 'free'; kit.tank = 'none'; kit.bcd = false; kit.fins = 'long'; kit.finCol = C(pick(r, ['#202224', '#3a4a3a', '#6a5a3a'])); kit.snorkel = true; kit.lens = [60, 60, 50];
          L.build.s *= 0.98; L.build.mass *= 0.94; L.build.chest = 0.4;
          break;
        }
        case 'netDiver': {
          kit.col = C('#2c3036'); kit.col2 = C(pick(r, ['#e8701c', '#d8a018'])); kit.col3 = C('#e8e8e0'); kit.tankCol = C('#d8dade');
          L.build.bw *= 1.06; L.build.mass *= 1.06; L.build.belly = 0.25;
          break;
        }
        case 'commando': {
          kit.pattern = 'plain'; kit.col = C('#1c1e22'); kit.col2 = C('#2a2d32'); kit.col3 = C('#4a4e56');
          kit.mask = 'commando'; kit.tank = 'rebreather'; kit.tankCol = C('#2a2e2a'); kit.fins = 'short'; kit.finCol = C('#101114'); kit.lens = [20, 30, 34];
          F.brow = 1.4; F.jaw = 1.12; L.facial = 'stubble';
          break;
        }
        case 'medic': {
          kit.col = C('#1e2024'); kit.col2 = C('#e8e6e0'); kit.col3 = C('#c82020'); kit.cross = true; kit.tankCol = C('#e8e6e0');
          break;
        }
        case 'heavyDiver': case 'titan': {
          // the Mark V: rubberised canvas, a copper-and-brass helmet bolted to its corselet, lead boots
          kit.col = C(pick(r, ['#8a7a58', '#7a6e52', '#94845e'])); kit.col2 = C('#5a4e3a'); kit.col3 = C('#b88a3a'); kit.pattern = 'plain';
          kit.tankCol = C(d === 'titan' ? '#4a4c50' : '#b8862e');
          L.feet = { kind: 'lead', col: [70, 72, 74], col2: [150, 110, 50] };
          L.hands = { kind: 'glove', col: [60, 54, 46] };
          break;
        }
      }
      L.dive = kit;
      L.top = { kind: 'thermal', col: kit.col, col2: kit.col2, col3: kit.col3, sleeve: 'long', hem: 0.86 };
      L.legs = { kind: 'pants', col: kit.col, col2: kit.col2, hem: -0.83 };
      if (!heavy) { L.feet = { kind: 'bootie', col: [24, 24, 26], col2: [60, 60, 64] }; L.hands = { kind: 'glove', col: d === 'freediver' ? kit.col : [26, 26, 28] }; }
      L.rod = { kind: 'spin', len: 2.0, col: [40, 40, 44], wrap: [40, 40, 44], reel: 'spin', reelCol: [60, 60, 66], thick: 1 };
      L.anim = { speed: 1, energy: 1, bounce: 0.6, heavy: heavy ? 0.9 : 0.3 };
      break;
    }
  }
  if (L.hands.kind === 'bare') L.hands.col = L.skin;
  // small seeded proportion variation (the boss and the kid stay on model)
  if (arch !== 'captainGaff' && arch !== 'kid' && arch !== 'titan') {
    L.build.s *= 1 + (r.next() - 0.5) * 0.06;
    L.build.bw *= 1 + (r.next() - 0.5) * 0.06;
    L.build.mass *= 1 + (r.next() - 0.5) * 0.08;
  }
  F.jaw *= 1 + (r.next() - 0.5) * 0.08;
  F.cheek *= 1 + (r.next() - 0.5) * 0.04;
  return L;
}
