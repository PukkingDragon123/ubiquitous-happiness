// Shared underwater lighting for every lit material in the dive scenes.
//
//   const mat = uw(new THREE.MeshStandardMaterial({ map, roughness: 0.6 }));   // patch in place, returns it
//   uw(mat, { caustics: 0.5, sss: [1, 0.4, 0.5] })                                // per-material tweaks
//
// What the patch adds (on top of three's PBR lighting):
//   - animated sun caustics projected down the sun direction onto upward-facing surfaces, with a slight RGB
//     split, fading with depth and shadowed by the material's own shadow map term;
//   - depth light falloff: lit (not emissive) light is attenuated per channel with depth below the surface,
//     reds first, so deeper things go cool and dim like real water while glowing things stay bright;
//   - optional soft "subsurface" wrap light + a wet rim sheen (for fleshy creatures like the blobfish);
//   - above the surface (y > 0) nothing changes.
// Distance fog / absorption along the view ray is applied later in post (src/gfx/post.ts) from the depth buffer.
import * as THREE from 'three';

export const UW = {
  uTime: { value: 0 },
  uWaterY: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.25, 1, 0.18).normalize() },
  uCausticCol: { value: new THREE.Color(1.0, 0.97, 0.85) },
  uCaustic: { value: 1.0 },
  /** per-metre light extinction with depth (r, g, b) */
  uDepthExt: { value: new THREE.Vector3(0.05, 0.022, 0.014) },
  /** floor on depth light so the abyss never goes pure black */
  uDepthMin: { value: new THREE.Vector3(0.08, 0.13, 0.2) },
  uCausticScale: { value: 0.55 },
};

export interface UwOpts { caustics?: number; depth?: number; sss?: [number, number, number] | null; sssK?: number; rim?: number; rimCol?: [number, number, number] }

const CAUSTIC_GLSL = /* glsl */ `
uniform float uTime; uniform float uWaterY; uniform vec3 uSunDir; uniform vec3 uCausticCol; uniform float uCaustic;
uniform vec3 uDepthExt; uniform vec3 uDepthMin; uniform float uCausticScale;
uniform float uMatCaustic; uniform float uMatDepth; uniform vec3 uSss; uniform float uSssK; uniform float uRim; uniform vec3 uRimCol;
varying vec3 vUwWorld; varying vec3 vUwNormal;
float uwCausticF(vec2 p, float t) {
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 3.0);
}
vec3 uwCaustics(vec3 wp, vec3 n) {
  float depth = uWaterY - wp.y;
  if (depth <= 0.0) return vec3(0.0);
  vec2 q = (wp.xz - uSunDir.xz / max(uSunDir.y, 0.2) * depth) * uCausticScale;
  float t = uTime * 0.55;
  float r = uwCausticF(q + vec2(0.012, 0.0) * depth, t);
  float g = uwCausticF(q, t);
  float b = uwCausticF(q - vec2(0.012, 0.0) * depth, t);
  float facing = smoothstep(-0.15, 0.7, dot(n, uSunDir));
  float fade = exp(-depth * 0.045) * smoothstep(0.0, 0.4, depth);
  return vec3(r, g, b) * uCausticCol * facing * fade;
}
vec3 uwDepthLight(float y) {
  float depth = max(0.0, uWaterY - y);
  return max(exp(-uDepthExt * depth), uDepthMin);
}
`;

export function uw<T extends THREE.Material>(mat: T, o: UwOpts = {}): T {
  const m = mat as unknown as THREE.MeshStandardMaterial;
  const local = {
    uMatCaustic: { value: o.caustics ?? 1 },
    uMatDepth: { value: o.depth ?? 1 },
    uSss: { value: new THREE.Vector3(...(o.sss ?? [0, 0, 0])) },
    uSssK: { value: o.sss ? o.sssK ?? 0.5 : 0 },
    uRim: { value: o.rim ?? 0 },
    uRimCol: { value: new THREE.Vector3(...(o.rimCol ?? [0.7, 0.95, 1.0])) },
  };
  (m.userData as Record<string, unknown>).uw = local;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, UW, local);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUwWorld; varying vec3 vUwNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 uwP = vec4(transformed, 1.0);
        vec3 uwN = objectNormal;
        #ifdef USE_INSTANCING
          uwP = instanceMatrix * uwP; uwN = mat3(instanceMatrix) * uwN;
        #endif
        vUwWorld = (modelMatrix * uwP).xyz;
        vUwNormal = normalize(mat3(modelMatrix) * uwN);
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CAUSTIC_GLSL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 uwN = normalize(vUwNormal);
        vec3 dl = mix(vec3(1.0), uwDepthLight(vUwWorld.y), uMatDepth);
        reflectedLight.directDiffuse *= dl; reflectedLight.indirectDiffuse *= dl;
        reflectedLight.directSpecular *= dl; reflectedLight.indirectSpecular *= dl;
        #ifdef USE_SHADOWMAP
          float uwSh = 1.0;
          #if NUM_DIR_LIGHT_SHADOWS > 0
            uwSh = directionalLightShadows[0].shadowIntensity > 0.0 ? getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]) : 1.0;
          #endif
        #else
          float uwSh = 1.0;
        #endif
        vec3 cst = uwCaustics(vUwWorld, uwN) * uCaustic * uMatCaustic * (0.25 + 0.75 * uwSh);
        reflectedLight.directDiffuse += diffuseColor.rgb * cst * 0.85;
        // soft wrap light: light bleeding through thin flesh toward the dark side
        float wrap = clamp(dot(uwN, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uSss * uSssK * (1.0 - wrap) * dl;
        vec3 vdir = normalize(cameraPosition - vUwWorld);
        float fr = pow(1.0 - clamp(dot(uwN, vdir), 0.0, 1.0), 3.0);
        reflectedLight.indirectSpecular += uRimCol * fr * uRim * dl;
      }`);
  };
  const key = `uw${o.caustics ?? 1}|${o.depth ?? 1}|${o.sss ? 1 : 0}|${o.rim ? 1 : 0}`;
  const prevKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key;
  return mat;
}
