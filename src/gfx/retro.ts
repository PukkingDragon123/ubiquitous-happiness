// PS1/PS2 material patch: vertex snapping to the low internal resolution grid + optional affine (not
// perspective-corrected) texture mapping, the two things that make low-poly 3D read as "PlayStation".
//
//   retro(new THREE.MeshStandardMaterial({ map }))            // patch in place (returns it): hard-faceted by default
//   retro(mat, { smooth: true })                               // opt out of flat shading (gouraud: soft bodies, water)
//   retro(mat, { snap: 0 })                                    // no vertex snapping on this one (UI-ish props)
//   retro(mat, { affine: 0.6 })                                // stronger texture swim when RETRO.uAffine is on
//   retro(eyeMat, { glossy: true, smooth: true })              // the only things allowed to shine: wet eyes
//
// Matte by default (the clean PS2 diffuse look; specular only as pixel glints painted into textures): roughness is
// clamped to >= 0.6 and metalness to <= 0.2 in the shader (so roughness / metalness maps can't sneak gloss back),
// clearcoat and sheen are capped at 0.15. Opt out with { glossy: true } / { metal: true }.
//
// Every material that goes through uw() (src/gfx/shaders/underwater.ts) gets this automatically. Above-water
// and dry materials can call retro() directly. The patch is idempotent and composes with other
// onBeforeCompile patches (uw, custom ones), and with skinning / instancing.
//
// Global switches (shared by every patched material, driven by the post pipeline + settings):
//   RETRO.uRes    internal render resolution in pixels (Post keeps it in sync)
//   RETRO.uSnap   snap step in internal pixels (0 = off, 1 = PS1-subtle, 2-3 = very wobbly)
//   RETRO.uAffine global multiplier for the per-material affine amount (0 = perspective correct)
import * as THREE from 'three';

export const RETRO = {
  uRes: { value: new THREE.Vector2(640, 360) },
  uSnap: { value: 1.0 },
  uAffine: { value: 0.0 },
};

export interface RetroOpts {
  /** vertex snap multiplier for this material (0 = never snap). Default 1 */
  snap?: number;
  /** affine texture mapping amount 0..1 when RETRO.uAffine is on. Default 0.35 */
  affine?: number;
  /** keep smooth (gouraud) shading; default is hard-faceted flat shading (the PS2 blocky look) */
  smooth?: boolean;
  /** @deprecated flat shading is the default now; kept for compatibility */
  flat?: boolean;
  /** allow glossy (roughness < 0.6): wet eyes only. Default: matte PS2 diffuse, roughness >= 0.6 */
  glossy?: boolean;
  /** allow metalness above 0.2 */
  metal?: boolean;
}

const VERT_DECL = /* glsl */ `
uniform vec2 uRetroRes; uniform float uRetroSnap; uniform float uRetroMatSnap;
varying vec3 vRetroAff;
`;
const VERT_SNAP = /* glsl */ `
{
  float rs = uRetroSnap * uRetroMatSnap;
  if (rs > 0.0 && gl_Position.w > 0.0) {
    vec2 g = uRetroRes * 0.5 / rs;
    gl_Position.xy = (floor(gl_Position.xy / gl_Position.w * g + 0.5) / g) * gl_Position.w;
  }
  #ifdef USE_MAP
    vRetroAff = vec3(vMapUv * gl_Position.w, gl_Position.w);
  #else
    vRetroAff = vec3(0.0, 0.0, 1.0);
  #endif
}
`;
const FRAG_DECL = /* glsl */ `
uniform float uRetroAffine; uniform float uRetroMatAffine; uniform float uRetroMinRough; uniform float uRetroMaxMetal;
varying vec3 vRetroAff;
`;

/** patch a three.js built-in material (Standard / Physical / Lambert / Phong / Basic) for the PS1 look */
export function retro<T extends THREE.Material>(mat: T, o: RetroOpts = {}): T {
  const ud = mat.userData as Record<string, unknown>;
  const shaded = mat as unknown as { flatShading?: boolean };
  const setFlat = (flat: boolean) => { if ('flatShading' in mat && shaded.flatShading !== flat) { shaded.flatShading = flat; mat.needsUpdate = true; } };
  if (ud.retro) {
    // already patched: just update the per-material values
    const l = ud.retro as { uRetroMatSnap: { value: number }; uRetroMatAffine: { value: number } };
    if (o.snap !== undefined) l.uRetroMatSnap.value = o.snap;
    if (o.affine !== undefined) l.uRetroMatAffine.value = o.affine;
    if (o.smooth !== undefined) setFlat(!o.smooth);
    const lm = l as unknown as { uRetroMinRough: { value: number }; uRetroMaxMetal: { value: number } };
    if (o.glossy !== undefined) lm.uRetroMinRough.value = o.glossy ? 0 : 0.6;
    if (o.metal !== undefined) lm.uRetroMaxMetal.value = o.metal ? 1 : 0.2;
    matte(mat, o);
    return mat;
  }
  const local = {
    uRetroMatSnap: { value: o.snap ?? 1 },
    uRetroMatAffine: { value: o.affine ?? 0.35 },
    uRetroMinRough: { value: o.glossy ? 0 : 0.6 },
    uRetroMaxMetal: { value: o.metal ? 1 : 0.2 },
  };
  ud.retro = local;
  setFlat(!o.smooth);
  matte(mat, o);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uRetroRes = RETRO.uRes;
    sh.uniforms.uRetroSnap = RETRO.uSnap;
    sh.uniforms.uRetroAffine = RETRO.uAffine;
    Object.assign(sh.uniforms, local);
    if (!sh.vertexShader.includes('#include <project_vertex>')) return;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_SNAP);
    const uvFix = (chunk: string, v: string, local_: string) =>
      chunk.split(v).join(local_);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 rUvMap = mix(vMapUv, vRetroAff.xy / vRetroAff.z, clamp(uRetroAffine * uRetroMatAffine, 0.0, 1.0));
        #endif
        ${uvFix(THREE.ShaderChunk.map_fragment, 'vMapUv', 'rUvMap')}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n      roughnessFactor = max(roughnessFactor, uRetroMinRough);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n      metalnessFactor = min(metalnessFactor, uRetroMaxMetal);');
  };
  mat.customProgramCacheKey = chainKey(mat, prev, '|retro');
  mat.needsUpdate = true;
  return mat;
}

/** cap the shiny parameters on the material itself (clearcoat / sheen / roughness / metalness) */
function matte(mat: THREE.Material, o: RetroOpts) {
  const m = mat as unknown as { roughness?: number; metalness?: number; clearcoat?: number; sheen?: number };
  if (!o.glossy && typeof m.roughness === 'number') m.roughness = Math.max(0.6, m.roughness);
  if (!o.metal && typeof m.metalness === 'number') m.metalness = Math.min(0.2, m.metalness);
  if (!o.glossy && typeof m.clearcoat === 'number') m.clearcoat = Math.min(0.15, m.clearcoat);
  if (!o.glossy && typeof m.sheen === 'number') m.sheen = Math.min(0.15, m.sheen);
}

/**
 * A program cache key that stays unique when several onBeforeCompile patches are chained: three's default key
 * is the *current* onBeforeCompile source, which after wrapping is the same wrapper text for every material, so
 * the earlier patch's source (or its own explicit key) must be folded in at patch time.
 */
export function chainKey(mat: THREE.Material, prevCompile: THREE.Material['onBeforeCompile'] | undefined, suffix: string): () => string {
  const own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey');
  const prevKey = own ? mat.customProgramCacheKey.bind(mat) : null;
  const prevSrc = prevCompile ? prevCompile.toString() : '';
  return () => (prevKey ? prevKey() : prevSrc) + suffix;
}

/** recursively retro-patch every mesh material under an object (skips ShaderMaterials) */
export function retroAll(root: THREE.Object3D, o: RetroOpts = {}) {
  root.traverse((ob) => {
    const m = (ob as THREE.Mesh).material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) if (!(mm instanceof THREE.ShaderMaterial)) retro(mm, o);
  });
  return root;
}
