// Realistic pixel texture library: tileable 64-128 px painted materials with normal + roughness (+ metal) maps.
//
//   const t = tex('rustSteel', { size: 64, seed: 2 })       // -> { map, normal, rough, metal, ... } (cached)
//   mesh.material = texMat('planksRotten', { repeat: [4, 1] }) // MeshStandardMaterial, uw()+retro patched
//   texMat('skinTan', { uw: false })                          // above-water / dry use (retro patch only)
//   tex('planksPainted', { tint: '#8a2a20' })                 // paint / wool / leather / neoprene accent colour
//
// Scale: world surfaces (sand, rock, wood, steel, concrete...) are painted at ~32 px per metre, so a 64 px tile
// covers 2 m (128 px: 4 m, with less visible repetition). Model wraps (fabrics, skin, scales) use pixel-sized
// features (1 px threads, ~5 px scales). Nearest magnification keeps every texel crisp at the low internal
// resolution; mipmaps avoid shimmer at distance.
import * as THREE from 'three';
import { Surf, type TexSet } from './core';
import * as N from './natural';
import * as B from './built';
import * as O from './organic';
import { uw, type UwOpts } from '../shaders/underwater';
import { retro } from '../retro';

export type { TexSet };

type Painter = (s: Surf, tint?: string) => void;
const PAINTERS = {
  // natural
  sand: N.sand, sandWet: N.sandWet, sandRipple: N.sandRipple,
  granite: N.granite, basalt: N.basalt, limestone: N.limestone, rockMossy: N.rockMossy,
  coralRock: N.coralRock, kelp: N.kelp, ice: N.ice, bone: N.bone,
  // built
  planks: B.planks, planksRotten: B.planksRotten, planksPainted: B.planksPainted,
  rustSteel: B.rustSteel, hullPlates: B.hullPlates, rope: B.rope, concrete: B.concrete, glass: B.glass, grit: B.grit,
  // fabric / rubber
  cotton: O.cotton, denim: O.denim, wool: O.wool, canvas: O.canvas, leather: O.leather, neoprene: O.neoprene, rubber: O.rubber,
  // skin
  skinPale: (s: Surf) => O.skin(s, 'skinPale'), skinFair: (s: Surf) => O.skin(s, 'skinFair'), skinTan: (s: Surf) => O.skin(s, 'skinTan'),
  skinBrown: (s: Surf) => O.skin(s, 'skinBrown'), skinDark: (s: Surf) => O.skin(s, 'skinDark'),
  // fish
  scalesSilver: O.scalesSilver, scalesGold: O.scalesGold, scalesCarp: O.scalesCarp, scalesReef: O.scalesReef, sharkSkin: O.sharkSkin,
  // gore
  flesh: O.flesh, gore: O.gore, blood: O.blood,
} satisfies Record<string, Painter>;

export type TexName = keyof typeof PAINTERS;
export const TEX_NAMES = Object.keys(PAINTERS) as TexName[];
/** groups for sheets / pickers */
export const TEX_GROUPS: Record<string, TexName[]> = {
  ground: ['sand', 'sandWet', 'sandRipple', 'granite', 'basalt', 'limestone', 'rockMossy', 'coralRock', 'ice'],
  built: ['planks', 'planksRotten', 'planksPainted', 'rustSteel', 'hullPlates', 'concrete', 'glass', 'rope'],
  cloth: ['cotton', 'denim', 'wool', 'canvas', 'leather', 'neoprene', 'rubber'],
  skin: ['skinPale', 'skinFair', 'skinTan', 'skinBrown', 'skinDark'],
  fish: ['scalesSilver', 'scalesGold', 'scalesCarp', 'scalesReef', 'sharkSkin', 'kelp'],
  gore: ['flesh', 'gore', 'blood', 'bone'],
};

export interface TexOpts {
  /** pixels per side (power of two: 32, 64, 128). Default 64 */
  size?: number;
  /** variation seed (different crack / plank / knot layout). Default 1 */
  seed?: number;
  /** accent colour for painted / dyed materials (planksPainted, wool, leather, neoprene) */
  tint?: string;
}

const cache = new Map<string, TexSet>();

/** paint (once) and return a material's texture set. Shared + cached: clone a texture before changing repeat */
export function tex(name: TexName, o: TexOpts = {}): TexSet {
  const size = o.size ?? 64, seed = o.seed ?? 1;
  const key = `${name}|${size}|${seed}|${o.tint ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = new Surf(size, size, seed * 7919 + hashName(name));
  (PAINTERS[name] as Painter)(s, o.tint);
  const set = s.build();
  set.map.name = set.normal.name = set.rough.name = key;
  cache.set(key, set);
  return set;
}

export interface TexMatOpts extends TexOpts {
  /** uv repeat (textures are cloned so the shared set isn't mutated) */
  repeat?: [number, number];
  /** underwater patch (default on); false = above water / dry: retro patch only */
  uw?: UwOpts | false;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  flatShading?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
}

/** a MeshStandardMaterial wired to a texture set (map + normal + roughness [+ metalness]) */
export function texMat(name: TexName, o: TexMatOpts = {}): THREE.MeshStandardMaterial {
  const t = tex(name, o);
  const rep = (x: THREE.Texture | null) => {
    if (!x || !o.repeat) return x;
    const c = x.clone(); c.repeat.set(o.repeat[0], o.repeat[1]); c.needsUpdate = true; return c;
  };
  const m = new THREE.MeshStandardMaterial({
    map: rep(t.map), normalMap: rep(t.normal), roughnessMap: rep(t.rough), metalnessMap: t.metal ? rep(t.metal) : null,
    color: o.color ?? '#ffffff', roughness: o.roughness ?? 1, metalness: o.metalness ?? (t.metal ? 1 : 0),
    flatShading: o.flatShading ?? false, side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
  });
  const ns = o.normalScale ?? 1;
  m.normalScale.set(ns, ns);
  if (o.uw === false) retro(m); else uw(m, o.uw ?? {});
  return m;
}

function hashName(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 100000; }
