// Biomes for the dungeon's floors: the five areas (src/area/defs.ts) plus the endless HADAL remixes below the
// abyss: vents, the trench, bone fields and crystal caves. A hadal biome is an area def remixed (palette, flora,
// look, name) on top of a base area whose builders it reuses (landmarks / heroes switch on the base id), so the
// level builder takes it like any other area.
//
//   biomeDef('kelp')            the area itself
//   biomeDef('hadal:vents')     a remix ('hadal:' + HADAL key)
//   hadalFor(k, seed)           the biome id of hadal floor k (procedurally rotated)
//   baseOf('hadal:bones')       'graveyard' (the area the builders, enemies and boss come from)
import { AREAS, type AreaDef, type AreaId } from '../area/defs';

interface Remix { base: AreaId; name: string; pal: Partial<AreaDef['pal']>; flora: AreaDef['flora']; look: Partial<AreaDef['look']>; snow: number; snowCol: string }

const HADAL: Record<string, Remix> = {
  vents: {
    base: 'abyss', name: 'Hadal Vents',
    pal: { sand: ['#0c0806', '#1e140e', '#30221a', '#463226', '#5c4434'], rock: ['#060404', '#120c0a', '#221814', '#34261e', '#4a362a'], rockTop: '#e8701a', silt: '#3a2a20', accent: ['#ff6a20', '#ffd060', '#ff3a3a', '#7cf8ff'] },
    flora: [
      { sp: 'tubeworms', zones: ['play', 'mid', 'fg'], per10: 3.2, cluster: 5 },
      { sp: 'bacteriaMat', zones: ['play', 'mid'], per10: 2.4, cluster: 3 },
      { sp: 'glowcoral', zones: ['play', 'mid', 'back'], per10: 1.2, cluster: 2 },
      { sp: 'crinoid', zones: ['mid', 'back'], per10: 0.8, cluster: 2 },
    ],
    look: { scatterTop: '#140a08', scatterDeep: '#030102', hemiSky: '#3a2418', hemiGround: '#0a0402', sun: '#ffb070', rim: ['#ff9a50', 0.6] },
    snow: 2.4, snowCol: '#ffb070',
  },
  trench: {
    base: 'graveyard', name: 'The Trench',
    pal: { sand: ['#06080c', '#10141c', '#1c222c', '#2a323e', '#3a4452'], rock: ['#030406', '#0a0c12', '#141820', '#20262e', '#2e3640'], rockTop: '#5a7aa0', silt: '#2a3442', accent: ['#7cf8ff', '#5a8aff', '#c8f0ff', '#ff5ad8'] },
    flora: [
      { sp: 'seapen', zones: ['play', 'mid', 'fg'], per10: 2.4, cluster: 4 },
      { sp: 'hydroid', zones: ['play', 'mid'], per10: 1.6, cluster: 3, onRock: true },
      { sp: 'glowcoral', zones: ['play', 'mid', 'back', 'fg'], per10: 1.6, cluster: 3 },
      { sp: 'seawhip', zones: ['mid', 'back'], per10: 1, cluster: 2 },
    ],
    look: { scatterTop: '#060c18', scatterDeep: '#010204', hemiSky: '#18284a', hemiGround: '#020306', sun: '#8aa8ff', rim: ['#7ab4ff', 0.6] },
    snow: 2.6, snowCol: '#9fd8ff',
  },
  bones: {
    base: 'graveyard', name: 'Bone Fields',
    pal: { sand: ['#1c1a16', '#36322a', '#56503e', '#7a7258', '#a09678'], rock: ['#0c0a08', '#1c1814', '#2e2822', '#443c32', '#5c5244'], rockTop: '#d8ccb0', silt: '#5a5444', accent: ['#ece4d0', '#c8b890', '#ff5a5a', '#7cf8ff'] },
    flora: [
      { sp: 'crinoid', zones: ['play', 'mid', 'back'], per10: 2, cluster: 3 },
      { sp: 'glasssponge', zones: ['mid', 'back', 'play'], per10: 1.6, cluster: 2 },
      { sp: 'plumose', zones: ['play', 'mid', 'fg'], per10: 1.6, cluster: 3, onRock: true },
      { sp: 'glowcoral', zones: ['play', 'mid'], per10: 0.8, cluster: 2 },
    ],
    look: { scatterTop: '#0c0c10', scatterDeep: '#020203', hemiSky: '#2a2a34', hemiGround: '#060606', sun: '#d8d0c0', rim: ['#d8e0ff', 0.5] },
    snow: 2.8, snowCol: '#e8e4d8',
  },
  crystal: {
    base: 'abyss', name: 'Crystal Caves',
    pal: { sand: ['#08061a', '#141030', '#221a48', '#322662', '#46367e'], rock: ['#04030c', '#0c0a1c', '#18142e', '#261e44', '#362a5c'], rockTop: '#a07aff', silt: '#2a2250', accent: ['#c08cff', '#7cf8ff', '#ff8ad8', '#ffffff'] },
    flora: [
      { sp: 'glasssponge', zones: ['play', 'mid', 'back'], per10: 2.4, cluster: 3 },
      { sp: 'glowcoral', zones: ['play', 'mid', 'back', 'fg'], per10: 2.8, cluster: 3 },
      { sp: 'crinoid', zones: ['mid', 'back'], per10: 1, cluster: 2 },
      { sp: 'seapen', zones: ['play', 'fg'], per10: 1.2, cluster: 3 },
    ],
    look: { scatterTop: '#0c0820', scatterDeep: '#020108', hemiSky: '#2a1c5a', hemiGround: '#04020a', sun: '#c0a8ff', rim: ['#c08cff', 0.65] },
    snow: 2.2, snowCol: '#c8b0ff',
  },
};
export const HADAL_KEYS = Object.keys(HADAL);

const cache = new Map<string, AreaDef>();
/** the area def a floor is built from (an area, or a hadal remix) */
export function biomeDef(id: string): AreaDef {
  const hit = cache.get(id);
  if (hit) return hit;
  let d: AreaDef;
  if (id.startsWith('hadal:') && HADAL[id.slice(6)]) {
    const r = HADAL[id.slice(6)], b = AREAS[r.base];
    d = {
      ...b, name: r.name, pal: { ...b.pal, ...r.pal }, flora: r.flora, look: { ...b.look, ...r.look } as AreaDef['look'],
      snow: r.snow, snowCol: r.snowCol, glow: true, ice: false, music: 'mu_abyss',
      eco: { ...b.eco, schoolsN: 2, huntersN: 2 },
    };
  } else d = AREAS[id as AreaId] ?? AREAS.reef;
  cache.set(id, d);
  return d;
}
/** the plain area a biome is built on (builders, enemy tables, bosses) */
export function baseOf(id: string): AreaId {
  if (id.startsWith('hadal:')) return HADAL[id.slice(6)]?.base ?? 'abyss';
  return (AREAS[id as AreaId] ? id : 'reef') as AreaId;
}
/** the biome of hadal floor k (0-based past the abyss): a seeded rotation that never repeats back to back */
export function hadalFor(k: number, seed: number): string {
  const n = HADAL_KEYS.length;
  const a = ((seed >>> 3) + k * 3) % n;
  return 'hadal:' + HADAL_KEYS[a];
}
export const isHadal = (id: string) => id.startsWith('hadal:');
