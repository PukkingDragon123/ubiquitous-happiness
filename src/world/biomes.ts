// Biomes: one per fishing-spot flavour. Each sets the look (lighting/water optics), the seabed shape, palettes
// for sand / rock / strata / coral, decoration densities, swell and music.
export interface Biome {
  id: string;
  look: string;
  floor: number; amp: number; detail: number;
  sand: string[]; rock: string[]; strata: string[][];
  coral: string[]; kelp: number; corals: number; rocks: number; junk: number; crystals: number; anemones: number;
  kelpCol: string[];
  swell: string; music: string; ambience: string;
  snow: number;      // marine snow density
  ice?: boolean;     // ice sheet on the surface
  glow?: boolean;    // bioluminescent decor
}

export const BIOMES: Record<string, Biome> = {
  reef: {
    id: 'reef', look: 'reef', floor: -10.5, amp: 2.2, detail: 0.5,
    sand: ['#6e5a42', '#a88a62', '#d2b88a', '#f0dcb0'], rock: ['#3a3430', '#5e554c', '#857a6c', '#ada090'],
    strata: [['#c8ae80', '#b09468'], ['#8a6e50', '#76604a'], ['#6a5a50', '#584a42'], ['#4a4044', '#3a3238']],
    coral: ['#ff6b8a', '#ff9f43', '#ffd166', '#c77dff', '#4cc9f0', '#f72585', '#80ed99'], kelp: 0.25, corals: 1.0, rocks: 0.8, junk: 0.1, crystals: 0.25, anemones: 0.6,
    kelpCol: ['#2f5a1e', '#4f8a2a', '#8ac04a'], swell: 'calm', music: 'mu_shallows', ambience: 'uw_amb1', snow: 0.6,
  },
  kelp: {
    id: 'kelp', look: 'kelp', floor: -13, amp: 2.8, detail: 0.6,
    sand: ['#4a4636', '#6e6a4e', '#948e66', '#b4ac80'], rock: ['#2e3430', '#4a524a', '#6a7266', '#8e9688'],
    strata: [['#7e7658', '#6a6248'], ['#5a5444', '#4a4638'], ['#46443c', '#3a3832'], ['#34322e', '#2a2826']],
    coral: ['#e85d75', '#f4a261', '#2a9d8f', '#e9c46a'], kelp: 1.6, corals: 0.3, rocks: 1.0, junk: 0.15, crystals: 0.3, anemones: 0.4,
    kelpCol: ['#3a3a12', '#6a6a1e', '#a8a03a'], swell: 'breeze', music: 'mu_fjord', ambience: 'uw_amb1', snow: 0.9,
  },
  harbor: {
    id: 'harbor', look: 'harbor', floor: -9, amp: 1.4, detail: 0.7,
    sand: ['#3a3a32', '#5a584a', '#7a7660', '#9a9478'], rock: ['#2a2a2a', '#44443e', '#64625a', '#86847a'],
    strata: [['#6a6656', '#5a5648'], ['#4a463c', '#3e3a32'], ['#3a3630', '#2e2a26'], ['#2a2622', '#201e1a']],
    coral: ['#c08060', '#80a070', '#a0a0a0'], kelp: 0.4, corals: 0.15, rocks: 0.9, junk: 1.0, crystals: 0.2, anemones: 0.5,
    kelpCol: ['#2a3a1a', '#4a5a2a', '#7a8a4a'], swell: 'breeze', music: 'mu_junkyard', ambience: 'uw_amb1', snow: 1.4,
  },
  arctic: {
    id: 'arctic', look: 'arctic', floor: -12, amp: 2.5, detail: 0.5,
    sand: ['#5a6670', '#7e8c96', '#a6b4bc', '#d0dce2'], rock: ['#2a3440', '#465462', '#6a7a88', '#96a6b2'],
    strata: [['#8a9aa6', '#7a8a96'], ['#5a6a78', '#4a5a68'], ['#3a4a58', '#2e3e4c'], ['#22303c', '#1a2632']],
    coral: ['#a0d8ef', '#e0f4ff', '#c8a8ff', '#ff9ec7'], kelp: 0.3, corals: 0.35, rocks: 1.1, junk: 0.1, crystals: 0.9, anemones: 0.7,
    kelpCol: ['#2a3a3a', '#4a6a5a', '#7aa08a'], swell: 'calm', music: 'mu_fjord', ambience: 'uw_amb1', snow: 1.2, ice: true,
  },
  abyss: {
    id: 'abyss', look: 'abyss', floor: -24, amp: 4, detail: 0.8,
    sand: ['#141820', '#22283a', '#343c52', '#4a5470'], rock: ['#0e1018', '#1c2030', '#2e3448', '#465068'],
    strata: [['#2a3044', '#222838'], ['#1a1e2c', '#141822'], ['#10121a', '#0c0e14'], ['#08090e', '#050608']],
    coral: ['#7cf8ff', '#ff5ad8', '#b8ff6a', '#ffe066'], kelp: 0.1, corals: 0.5, rocks: 1.2, junk: 0.2, crystals: 1.4, anemones: 0.9,
    kelpCol: ['#1a1a3a', '#2a3a6a', '#4a6aaa'], swell: 'calm', music: 'mu_abyss', ambience: 'uw_amb1', snow: 2.0, glow: true,
  },
  sunset: {
    id: 'sunset', look: 'sunset', floor: -10, amp: 2, detail: 0.5,
    sand: ['#6a4a42', '#9a7060', '#c49a80', '#e6c4a6'], rock: ['#3a2c30', '#5a464a', '#80686a', '#a68e8c'],
    strata: [['#b8907a', '#a07a66'], ['#7a5a52', '#684a44'], ['#5a4448', '#4a383c'], ['#3a2c32', '#2c2228']],
    coral: ['#ff7aa2', '#ffb86b', '#ffe08a', '#b48cff', '#7ad7f0'], kelp: 0.5, corals: 0.8, rocks: 0.8, junk: 0.1, crystals: 0.3, anemones: 0.6,
    kelpCol: ['#4a3a1a', '#7a6a2a', '#b0a04a'], swell: 'calm', music: 'mu_shallows', ambience: 'uw_amb1', snow: 0.7,
  },
};
export const biomeOf = (id: string) => BIOMES[id] ?? BIOMES.reef;
