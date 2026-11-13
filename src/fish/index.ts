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
    cleanTexture(a.map);
    cache.set(species, a);
  }
  return a;
}

/**
 * v2 clean-pixel pass over a painted page: 2x box downsample (kills dither and speckle) then a small k-means
 * palette (14 colours), so every fish reads as clean, deliberate pixel tones at PS2 texel density.
 */
export function cleanTexture(tex: THREE.Texture, colors = 14, down = 2) {
  const img = tex.image as HTMLCanvasElement | undefined;
  if (!img || !(img as HTMLCanvasElement).getContext || (tex.userData as Record<string, unknown>).cleaned) return;
  const W = img.width, H = img.height, w = Math.max(1, Math.floor(W / down)), h = Math.max(1, Math.floor(H / down));
  const src = img.getContext('2d')!.getImageData(0, 0, W, H).data;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = 0; j < down; j++) for (let i = 0; i < down; i++) {
      const k = ((y * down + j) * W + x * down + i) * 4;
      if (src[k + 3] > 127) { r += src[k]; g += src[k + 1]; b += src[k + 2]; n++; }
      a += src[k + 3];
    }
    const o = (y * w + x) * 4;
    if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; }
    out[o + 3] = a / (down * down) > 100 ? 255 : 0;
  }
  // k-means palette over the opaque pixels
  const px: number[] = [];
  for (let i = 0; i < w * h; i++) if (out[i * 4 + 3]) px.push(i);
  if (px.length > colors) {
    const C: number[][] = [];
    for (let k = 0; k < colors; k++) { const i = px[Math.floor((k + 0.5) / colors * px.length)]; C.push([out[i * 4], out[i * 4 + 1], out[i * 4 + 2]]); }
    const lab = new Uint8Array(w * h);
    for (let it = 0; it < 7; it++) {
      const acc = C.map(() => [0, 0, 0, 0]);
      for (const i of px) {
        let best = 0, bd = 1e9;
        for (let k = 0; k < colors; k++) { const dr = out[i * 4] - C[k][0], dg = out[i * 4 + 1] - C[k][1], db = out[i * 4 + 2] - C[k][2], d = dr * dr * 2 + dg * dg * 3 + db * db; if (d < bd) { bd = d; best = k; } }
        lab[i] = best; const q = acc[best]; q[0] += out[i * 4]; q[1] += out[i * 4 + 1]; q[2] += out[i * 4 + 2]; q[3]++;
      }
      for (let k = 0; k < colors; k++) if (acc[k][3]) C[k] = [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]];
    }
    for (const i of px) { const c = C[lab[i]]; out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; }
  }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0);
  tex.image = cv;
  tex.magFilter = THREE.NearestFilter;
  (tex.userData as Record<string, unknown>).cleaned = true;
  tex.needsUpdate = true;
}

export function buildFish(species: string, seed = 0): FishModel {
  return new FishModel(speciesAsset(species), seed);
}

/** warm the cache (paint + upload) so first spawns don't hitch */
export function preloadFish(list: string[] = SPECIES) { for (const s of list) speciesAsset(s); }
export { FishSchool } from './school';
