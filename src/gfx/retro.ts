// PS1/PS2 material patch: vertex snapping to the low internal resolution grid + optional affine (not
// perspective-corrected) texture mapping, the two things that make low-poly 3D read as "PlayStation".
//
//   retro(new THREE.MeshStandardMaterial({ map }))            // patch in place (returns it)
//   retro(mat, { snap: 0 })                                    // no vertex snapping on this one (UI-ish props)
//   retro(mat, { affine: 0.6 })                                // stronger texture swim when RETRO.uAffine is on
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
  /** facet the shading (PS1 flat/gouraud look) */
  flat?: boolean;
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
uniform float uRetroAffine; uniform float uRetroMatAffine;
varying vec3 vRetroAff;
`;

/** patch a three.js built-in material (Standard / Physical / Lambert / Phong / Basic) for the PS1 look */
export function retro<T extends THREE.Material>(mat: T, o: RetroOpts = {}): T {
  const ud = mat.userData as Record<string, unknown>;
  if (ud.retro) {
    // already patched: just update the per-material values
    const l = ud.retro as { uRetroMatSnap: { value: number }; uRetroMatAffine: { value: number } };
    if (o.snap !== undefined) l.uRetroMatSnap.value = o.snap;
    if (o.affine !== undefined) l.uRetroMatAffine.value = o.affine;
    return mat;
  }
  const local = {
    uRetroMatSnap: { value: o.snap ?? 1 },
    uRetroMatAffine: { value: o.affine ?? 0.35 },
  };
  ud.retro = local;
  if (o.flat) (mat as unknown as THREE.MeshStandardMaterial).flatShading = true;
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
        ${uvFix(THREE.ShaderChunk.map_fragment, 'vMapUv', 'rUvMap')}`);
  };
  mat.customProgramCacheKey = chainKey(mat, prev, '|retro');
  mat.needsUpdate = true;
  return mat;
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
