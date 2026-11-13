// The five v2 areas: palette, light, terrain shape, flora mix, landmarks, wreck theme, resources and ecosystem
// cast. Everything the area builder needs to know to paint and populate one bounded 2.5D cross-section.
import { LOOKS, type Look } from '../gfx/lighting';

export type AreaId = 'reef' | 'kelp' | 'graveyard' | 'arctic' | 'abyss';
export const AREA_IDS: AreaId[] = ['reef', 'kelp', 'graveyard', 'arctic', 'abyss'];

export type RockKind = 'limestone' | 'volcanic' | 'mudstone' | 'granite' | 'pillow';
export type GroundKind = 'coralSand' | 'kelpSand' | 'silt' | 'gravel' | 'ooze';
export type WreckKind = 'sloop' | 'trawler' | 'galleon' | 'steamer' | 'sub';
export type NodeKind = 'ore' | 'crystal' | 'mana' | 'kelp' | 'shells' | 'clam' | 'scrap' | 'crate';

/** a flora placement rule: species id (src/world/flora.ts), zones, density per 10 m of x, clustering */
export interface FloraRule { sp: string; zones: ('fg' | 'play' | 'mid' | 'back')[]; per10: number; cluster?: number; onRock?: boolean; scale?: [number, number] }

export interface AreaDef {
  id: AreaId;
  name: string;
  music: string;
  ambience: string;
  look: Look;
  lookId: string;
  swell: string;
  width: number;            // metres of playable x
  floor: number;            // mean bedrock height
  amp: number;              // bedrock relief
  sand: number;             // mean sand thickness on the gameplay floor
  backRise: number;         // how far the seabed climbs toward the back (m)
  rock: RockKind;
  ground: GroundKind;
  pal: {
    sand: string[];         // dark .. light
    rock: string[];
    rockTop: string;        // encrusting / dusting colour on rock tops
    strata: string[][];
    silt: string;           // puff colour
    accent: string[];       // flora accents
  };
  flora: FloraRule[];
  wreck: WreckKind;
  nodes: Partial<Record<NodeKind, number>>;
  /** loot tables per node kind (material ids + weights) */
  loot?: Partial<Record<NodeKind, [string, number][]>>;
  eco: { schools: string[]; hunters: string[]; scavengers: string[]; plankton: string; schoolsN: number; huntersN: number; scavN: number };
  snow: number;
  snowCol: string;
  ice?: boolean;
  glow?: boolean;
}

const look = (base: string, o: Partial<Look>): Look => ({ ...(LOOKS[base] ?? LOOKS.reef), ...o } as Look);

export const AREAS: Record<AreaId, AreaDef> = {
  reef: {
    id: 'reef', name: 'Sunlit Reef', music: 'mu_shallows', ambience: 'uw_amb1', swell: 'calm',
    look: look('reef', {}), lookId: 'reef',
    width: 150, floor: -12.5, amp: 2.2, sand: 1.0, backRise: 7,
    rock: 'limestone', ground: 'coralSand',
    pal: {
      sand: ['#5e5040', '#9a8668', '#c8b48e', '#e8dab8', '#f6eedc'],
      rock: ['#3e3a36', '#6a6258', '#948a7a', '#bab09c', '#d8d0bc'],
      rockTop: '#a87a8a',
      strata: [['#d0bc94', '#bca880'], ['#a08a68', '#8c7658'], ['#7a6a58', '#685a4a'], ['#54483e', '#443a32']],
      silt: '#d8ccb0', accent: ['#e8604a', '#f0a040', '#8a5ac8', '#40b0c8', '#f07aa0'],
    },
    flora: [
      { sp: 'seagrass', zones: ['play', 'fg', 'mid'], per10: 7, cluster: 6 },
      { sp: 'brain', zones: ['play', 'mid'], per10: 1.8, cluster: 2, onRock: true },
      { sp: 'staghorn', zones: ['play', 'mid'], per10: 2.2, cluster: 3, onRock: true },
      { sp: 'table', zones: ['mid'], per10: 0.7, cluster: 2, onRock: true },
      { sp: 'seafan', zones: ['play', 'mid', 'back'], per10: 1.6, cluster: 2, onRock: true, scale: [1, 1.4] },
      { sp: 'tubesponge', zones: ['play', 'mid', 'fg'], per10: 1.6, cluster: 2, onRock: true },
      { sp: 'softcoral', zones: ['play', 'mid'], per10: 1.6, cluster: 3, onRock: true },
      { sp: 'anemone', zones: ['play', 'mid', 'fg'], per10: 1.2, cluster: 2, onRock: true },
      { sp: 'sealettuce', zones: ['play', 'fg'], per10: 1, cluster: 2 },
      { sp: 'seastarDeco', zones: ['play', 'fg'], per10: 0.8, cluster: 1 },
      { sp: 'urchins', zones: ['play'], per10: 0.6, cluster: 2, onRock: true },
    ],
    wreck: 'sloop',
    nodes: { ore: 4, crystal: 3, mana: 2, shells: 4, clam: 3, scrap: 2, crate: 3, kelp: 2 },
    eco: { schools: ['sardine', 'cichlid_blue', 'unicornfish'], hunters: ['barracuda'], scavengers: ['crab', 'hermit'], plankton: '#c8f0a0', schoolsN: 4, huntersN: 2, scavN: 3 },
    snow: 0.5, snowCol: '#f0f6e8',
  },
  kelp: {
    id: 'kelp', name: 'Kelp Cathedral', music: 'mu_fjord', ambience: 'uw_amb1', swell: 'breeze',
    look: look('kelp', { rays: 1.6 }), lookId: 'kelp',
    width: 150, floor: -14, amp: 2.8, sand: 0.6, backRise: 9,
    rock: 'volcanic', ground: 'kelpSand',
    pal: {
      sand: ['#3a3628', '#5e5640', '#847a5a', '#a89c76', '#c4b892'],
      rock: ['#24221e', '#3e3a32', '#5a5448', '#787060', '#968e7c'],
      rockTop: '#b06a7a',
      strata: [['#7e7658', '#6a6248'], ['#5a5444', '#4a4638'], ['#46443c', '#3a3832'], ['#34322e', '#2a2826']],
      silt: '#a89c80', accent: ['#e0782a', '#c84a5a', '#8a2a6a', '#f0d070'],
    },
    flora: [
      { sp: 'giantkelp', zones: ['play', 'fg', 'mid', 'back'], per10: 2.4, cluster: 2 },
      { sp: 'bullkelp', zones: ['play', 'fg', 'mid', 'back'], per10: 0.8, cluster: 1 },
      { sp: 'sealettuce', zones: ['play', 'mid', 'fg'], per10: 2.6, cluster: 3 },
      { sp: 'redweed', zones: ['play', 'mid'], per10: 2, cluster: 3, onRock: true },
      { sp: 'seagrass', zones: ['play', 'fg'], per10: 2, cluster: 5 },
      { sp: 'urchins', zones: ['play', 'mid'], per10: 1.6, cluster: 4 },
      { sp: 'anemone', zones: ['play', 'mid', 'fg'], per10: 1.2, cluster: 2, onRock: true },
      { sp: 'seastarDeco', zones: ['play', 'fg'], per10: 1.2, cluster: 1, onRock: true },
    ],
    wreck: 'trawler',
    nodes: { ore: 4, crystal: 2, mana: 2, kelp: 6, shells: 4, clam: 1, scrap: 2, crate: 2 },
    eco: { schools: ['sardine', 'pumpkinseed'], hunters: ['pike', 'peacock_bass'], scavengers: ['crab'], plankton: '#e0f0a0', schoolsN: 4, huntersN: 2, scavN: 3 },
    snow: 0.9, snowCol: '#e8f0d8',
  },
  graveyard: {
    id: 'graveyard', name: 'Shipwreck Graveyard', music: 'mu_junkyard', ambience: 'uw_amb1', swell: 'breeze',
    look: look('graveyard', {}), lookId: 'graveyard',
    width: 160, floor: -15, amp: 2.4, sand: 1.4, backRise: 6,
    rock: 'mudstone', ground: 'silt',
    pal: {
      sand: ['#2e3028', '#4a4c3e', '#686852', '#86846a', '#a09c80'],
      rock: ['#1e201c', '#34362e', '#4c4e44', '#66685a', '#808272'],
      rockTop: '#6a7050',
      strata: [['#6a6656', '#5a5648'], ['#4a463c', '#3e3a32'], ['#3a3630', '#2e2a26'], ['#2a2622', '#201e1a']],
      silt: '#7c7c66', accent: ['#d8d0c0', '#a0a080', '#c86a3a', '#8a9a7a'],
    },
    flora: [
      { sp: 'plumose', zones: ['play', 'mid', 'fg'], per10: 1.6, cluster: 3, onRock: true },
      { sp: 'seawhip', zones: ['play', 'mid', 'back'], per10: 1.2, cluster: 2 },
      { sp: 'seapen', zones: ['play', 'mid', 'fg'], per10: 1.4, cluster: 3 },
      { sp: 'hydroid', zones: ['play', 'mid'], per10: 1.4, cluster: 3, onRock: true },
      { sp: 'wrackStrap', zones: ['play', 'fg'], per10: 1.2, cluster: 2 },
      { sp: 'brownweed', zones: ['mid', 'back'], per10: 1.2, cluster: 2 },
    ],
    wreck: 'galleon',
    nodes: { ore: 3, crystal: 2, mana: 2, scrap: 6, crate: 5, shells: 2, clam: 1 },
    eco: { schools: ['snapper', 'sardine'], hunters: ['grouper', 'barracuda'], scavengers: ['crab'], plankton: '#d0e0b0', schoolsN: 3, huntersN: 2, scavN: 4 },
    snow: 1.6, snowCol: '#d8dccc',
  },
  arctic: {
    id: 'arctic', name: 'Frost Shelf', music: 'mu_fjord', ambience: 'uw_amb1', swell: 'calm',
    look: look('arctic', {}), lookId: 'arctic',
    width: 150, floor: -14, amp: 2.6, sand: 0.5, backRise: 8,
    rock: 'granite', ground: 'gravel',
    pal: {
      sand: ['#3a4048', '#5a646c', '#7c868e', '#a0aab0', '#c8d0d4'],
      rock: ['#1c222a', '#323a44', '#4c5662', '#6c7682', '#929ca6'],
      rockTop: '#d8e4ec',
      strata: [['#8a9aa6', '#7a8a96'], ['#5a6a78', '#4a5a68'], ['#3a4a58', '#2e3e4c'], ['#22303c', '#1a2632']],
      silt: '#b8c4cc', accent: ['#f0f4f8', '#f0a0b0', '#e86a4a', '#a0d0e0'],
    },
    flora: [
      { sp: 'softcoralCold', zones: ['play', 'mid', 'fg'], per10: 2.2, cluster: 3, onRock: true },
      { sp: 'plumose', zones: ['play', 'mid', 'fg'], per10: 2.2, cluster: 3, onRock: true },
      { sp: 'glasssponge', zones: ['mid', 'back'], per10: 1.2, cluster: 2 },
      { sp: 'wrackStrap', zones: ['play', 'fg'], per10: 1.6, cluster: 3 },
      { sp: 'giantkelp', zones: ['play', 'mid', 'back'], per10: 0.5, cluster: 2 },
      { sp: 'seastarDeco', zones: ['play', 'mid', 'fg'], per10: 1.6, cluster: 2 },
      { sp: 'urchins', zones: ['play', 'mid'], per10: 1.2, cluster: 3 },
    ],
    wreck: 'steamer',
    nodes: { ore: 4, crystal: 5, mana: 2, shells: 2, scrap: 2, crate: 2, clam: 1 },
    eco: { schools: ['sardine'], hunters: ['pike'], scavengers: ['crab'], plankton: '#d0f0ff', schoolsN: 3, huntersN: 2, scavN: 3 },
    snow: 1.2, snowCol: '#f4f8ff', ice: true,
  },
  abyss: {
    id: 'abyss', name: 'The Abyss', music: 'mu_abyss', ambience: 'uw_amb1', swell: 'calm',
    look: look('abyss', { rays: 0.2, hemi: 0.75, depthMin: [0.05, 0.08, 0.15] }), lookId: 'abyss',
    width: 150, floor: -24, amp: 3.2, sand: 0.7, backRise: 10,
    rock: 'pillow', ground: 'ooze',
    pal: {
      sand: ['#0c0e14', '#1a1e28', '#2a303c', '#3c4452', '#525c6c'],
      rock: ['#08090c', '#14161c', '#22262e', '#343a44', '#4a525e'],
      rockTop: '#c8a040',
      strata: [['#2a3044', '#222838'], ['#1a1e2c', '#141822'], ['#10121a', '#0c0e14'], ['#08090e', '#050608']],
      silt: '#3c4452', accent: ['#7cf8ff', '#ff5ad8', '#b8ff6a', '#ffe066', '#e8402a'],
    },
    flora: [
      { sp: 'tubeworms', zones: ['play', 'mid', 'fg'], per10: 2, cluster: 4 },
      { sp: 'glowcoral', zones: ['play', 'mid', 'back', 'fg'], per10: 2.2, cluster: 3 },
      { sp: 'crinoid', zones: ['play', 'mid', 'back'], per10: 1.6, cluster: 2 },
      { sp: 'glasssponge', zones: ['mid', 'back'], per10: 1.2, cluster: 2 },
      { sp: 'seapen', zones: ['play', 'mid', 'fg'], per10: 2, cluster: 4 },
      { sp: 'bacteriaMat', zones: ['play', 'mid'], per10: 1.6, cluster: 2 },
    ],
    wreck: 'sub',
    nodes: { ore: 4, crystal: 4, mana: 4, shells: 1, scrap: 3, crate: 2 },
    eco: { schools: ['sardine'], hunters: ['anglerfish'], scavengers: ['sea_cucumber', 'crab'], plankton: '#7cf8ff', schoolsN: 3, huntersN: 2, scavN: 3 },
    snow: 2.0, snowCol: '#9fe8ff', glow: true,
  },
};

export const areaDef = (id: string): AreaDef => AREAS[id as AreaId] ?? AREAS.reef;
