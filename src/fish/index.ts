// Fish model library entry point.
//
//   const m = buildFish('piranha', seed);   // FishModel: m.group (nose +x, centred), m.length, m.mouth, m.eye
//   scene.add(m.group); m.update(dt, speed, turn); m.setJaw(1); m.flash(); m.lookAt(dx, dy); m.dispose()
//
// Geometry, textures and the compiled shader program are cached per species; every instance owns only a
// tiny material carrying its swim uniforms.
import * as THREE from 'three';
import { FishBuilder, FishSpec } from './builder';
import { FishModel, SpeciesAsset, makeAsset } from './model';
import { SPECS } from './species';
import { SPECIALS } from './special';

export { FishModel } from './model';
export type { SpeciesAsset } from './model';

const cache = new Map<string, SpeciesAsset>();
const v3 = (p?: number[]) => (p ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3());

export function assetFromSpec(spec: FishSpec): SpeciesAsset {
  let b;
  // grow the texture page if the fins / extras don't fit
  for (let k = 0; ; k++) {
    try { b = new FishBuilder(k ? { ...spec, page: [spec.page?.[0] ?? 256, (spec.page?.[1] ?? 256) + 128 * k], bodyH: spec.bodyH ?? Math.round((spec.page?.[1] ?? 256) / 2) } : spec).build(); break; }
    catch (e) { if (k > 3 || !String(e).includes('page full')) throw e; }
  }
  const sw = spec.swim ?? {};
  const uni = {
    uShape: { value: new THREE.Vector4(b.noseX, b.bodyLen, sw.k ?? 0.9, sw.a0 ?? 0.04) },
    uShape2: { value: new THREE.Vector4(sw.pow ?? 2.2, sw.flutter?.[0] ?? 6, sw.flutter?.[1] ?? 0.015, sw.ripple ?? 0.01) },
    uJawP: { value: new THREE.Vector4(b.hinge[0], b.hinge[1], b.jawOpen, 0) },
  };
  const anchors: Record<string, THREE.Vector3> = {};
  for (const k in b.anchors) anchors[k] = v3(b.anchors[k]);
  return makeAsset({
    name: spec.name, geo: b.geo,
    map: b.tex.map, normalMap: b.tex.normalMap, roughnessMap: b.tex.roughnessMap, emissiveMap: b.tex.emissiveMap,
    emissive: spec.emissive ?? 1.5,
    uni, flags: { mode: 0, vertical: sw.vertical, morph: b.morph }, uwo: spec.uwo ?? { rim: 0.4, sss: [0.9, 0.88, 0.85], sssK: 0.8 },
    length: spec.L, mouth: v3(b.mouth), eye: v3(b.eye), eyeR: b.eyeR, anchors,
    amp: sw.amp ?? 0.1, freq: sw.freq ?? 1.3, freqK: sw.freqK ?? 1.0, jawIdle: b.jawIdle, normalScale: 0.55,
    clearcoat: spec.clearcoat ?? 0.5, clearcoatRough: spec.clearcoatRough ?? 0.3,
  });
}

/** all species ids buildFish understands */
export const SPECIES: string[] = [...Object.keys(SPECS), ...Object.keys(SPECIALS)];

export function speciesAsset(species: string): SpeciesAsset {
  let a = cache.get(species);
  if (!a) {
    if (SPECS[species]) a = assetFromSpec(SPECS[species]);
    else if (SPECIALS[species]) a = SPECIALS[species]();
    else throw new Error('unknown fish species ' + species);
    cache.set(species, a);
  }
  return a;
}

export function buildFish(species: string, seed = 0): FishModel {
  return new FishModel(speciesAsset(species), seed);
}

/** warm the cache (paint + upload) so first spawns don't hitch */
export function preloadFish(list: string[] = SPECIES) { for (const s of list) speciesAsset(s); }
export { FishSchool } from './school';
