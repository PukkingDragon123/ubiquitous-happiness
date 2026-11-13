// Swim animation in the vertex shader, layered under uw(): a lateral body wave that grows toward the tail,
// turn bending, fin flutter / ripple, a hinged lower jaw, eyeballs that track a look direction, an optional
// morph target (pufferfish inflate) and special modes for jellies, rays and sea cucumbers. Plus a white hit
// flash in the fragment shader.
//
// Per-vertex data (attributes every fish geometry carries):
//   aSwim = (flutter weight, phase offset, ripple weight, jaw weight)
//   aEye  = (eye centre xyz, 1 if this vertex belongs to an eyeball)
//   aMorph / aMorphN (only with FISH_MORPH): position / normal offsets of the morph target
// Per-instance uniforms (FishInst): uSwim = (phase, amp, turn, jaw open 0..1), uFx = (flash, morph, look yaw,
// look pitch), uFlashCol. Instanced schools read the same from instanced attributes instead (FISH_INST).
// Per-species uniforms (shared objects): uShape = (nose x, body length, wave count, head amplitude),
// uShape2 = (amp exponent, flutter Hz, flutter amp, ripple amp), uJawP = (hinge x, hinge y, max angle, mode param).
import * as THREE from 'three';
import { uw, UwOpts } from '../gfx/shaders/underwater';

export type SwimMode = 0 | 1 | 2 | 3; // 0 fish, 1 jelly, 2 ray, 3 worm (sea cucumber)

export interface SpeciesUniforms {
  uShape: { value: THREE.Vector4 };
  uShape2: { value: THREE.Vector4 };
  uJawP: { value: THREE.Vector4 };
}

export class FishInst {
  uSwim = { value: new THREE.Vector4(0, 0, 0, 0) };
  uFx = { value: new THREE.Vector4(0, 0, 0, 0) };
  uFlashCol = { value: new THREE.Color(1, 1, 1) };
}

export interface SwimFlags { mode?: SwimMode; vertical?: boolean; morph?: boolean; inst?: boolean }

const DECL_V = /* glsl */ `
attribute vec4 aSwim; attribute vec4 aEye;
#ifdef FISH_MORPH
attribute vec3 aMorph; attribute vec3 aMorphN;
#endif
#ifdef FISH_INST
attribute vec4 aInstSwim; attribute vec4 aInstFx;
#endif
uniform vec4 uSwim; uniform vec4 uFx; uniform vec4 uShape; uniform vec4 uShape2; uniform vec4 uJawP;
uniform float uTime;
varying float vFishFlash;
vec3 fishP; vec3 fishN;
void fishRotY(inout vec3 v, float a) { float c = cos(a), s = sin(a); v = vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
void fishRotZ(inout vec3 v, float a) { float c = cos(a), s = sin(a); v = vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
void fishDeform() {
  fishP = position; fishN = normal;
#ifdef FISH_INST
  vec4 fSw = aInstSwim; vec4 fFx = aInstFx;
#else
  vec4 fSw = uSwim; vec4 fFx = uFx;
#endif
  vFishFlash = fFx.x;
#ifdef FISH_MORPH
  fishP += aMorph * fFx.y; fishN = normalize(fishN + aMorphN * fFx.y);
#endif
  // eyeballs: rotate about their centre (mirror yaw on the far eye)
  if (aEye.w > 0.5) {
    vec3 d = fishP - aEye.xyz;
    float yaw = fFx.z * sign(aEye.z + 1e-5);
    fishRotY(d, yaw); fishRotY(fishN, yaw);
    fishRotZ(d, fFx.w); fishRotZ(fishN, fFx.w);
    fishP = aEye.xyz + d;
  }
  // hinged lower jaw
  if (aSwim.w > 0.0) {
    float ja = -fSw.w * uJawP.z * aSwim.w;
    vec3 q = fishP - vec3(uJawP.xy, 0.0);
    fishRotZ(q, ja); fishRotZ(fishN, ja);
    fishP = q + vec3(uJawP.xy, 0.0);
  }
  float L = uShape.y;
#if FISH_MODE == 0
  float s = max(0.0, (uShape.x - fishP.x) / L);
  float pw = uShape2.x;
  float env = uShape.w + (1.0 - uShape.w) * pow(s, pw);
  float denv = (1.0 - uShape.w) * pw * pow(max(s, 1e-3), pw - 1.0);
  float K = uShape.z * 6.2831853;
  float ph = fSw.x - s * K;
  float lat = fSw.y * L * env * sin(ph);
  float slope = fSw.y * (env * cos(ph) * K - denv * sin(ph));
  float bend = fSw.z * L * 0.2 * s * s;
  float bslope = -fSw.z * 0.4 * s;
  float side = aSwim.x * uShape2.z * L * sin(uTime * uShape2.y + aSwim.y)
             + aSwim.z * uShape2.w * L * sin(fSw.x * 1.7 + aSwim.y - fishP.x / L * 10.0);
  fishP.y += aSwim.x * uShape2.z * L * 0.45 * cos(uTime * uShape2.y * 0.71 + aSwim.y * 1.3);
  #ifdef FISH_VERT
    fishP.y += lat;
    { float a = atan(slope); fishRotZ(fishN, a); }
    fishP.z += bend + side;
    { float a = atan(bslope); fishRotY(fishN, -a); }
  #else
    fishP.z += lat + bend + side;
    { float a = atan(slope + bslope); fishRotY(fishN, -a); }
  #endif
#elif FISH_MODE == 1
  // jelly: bell pulse (aSwim.x = bell weight), tentacles (aSwim.z = distance along, aSwim.y = phase)
  float pulse = pow(max(0.0, sin(fSw.x)), 2.0);
  float k = 1.0 - pulse * 0.2 * aSwim.x;
  fishP.xz *= k; fishP.y += pulse * 0.06 * L * aSwim.x;
  float tw = aSwim.z;
  fishP.x += tw * tw * L * 0.18 * sin(fSw.x * 0.5 - tw * 5.0 + aSwim.y) + fSw.z * tw * tw * L * 0.3;
  fishP.z += tw * tw * L * 0.18 * cos(fSw.x * 0.45 - tw * 4.0 + aSwim.y * 1.3);
  fishP.y += tw * pulse * L * 0.06;
  fishP.z += aSwim.x * uShape2.z * L * sin(uTime * uShape2.y + aSwim.y);
#elif FISH_MODE == 2
  // ray: wing undulation travelling nose -> tail, amplitude by |z| (uShape.w = half span)
  float s = max(0.0, (uShape.x - fishP.x) / L);
  float wz = pow(min(1.0, abs(fishP.z) / uShape.w), 1.6);
  float K = uShape.z * 6.2831853;
  float ph = fSw.x - s * K;
  float dy = fSw.y * L * wz * sin(ph);
  fishP.y += dy;
  fishN = normalize(fishN + vec3(0.0, 0.0, -sign(fishP.z) * fSw.y * 2.0 * wz * cos(ph)));
  fishP.z += aSwim.z * uShape2.w * L * sin(fSw.x * 0.8 - aSwim.z * 4.0);
  fishP.y += aSwim.z * uShape2.w * L * 0.5 * cos(fSw.x * 0.6 - aSwim.z * 3.0);
#else
  // worm: peristaltic swelling travelling along x
  float s = (uShape.x - fishP.x) / L;
  float sw = 1.0 + fSw.y * sin(fSw.x - s * uShape.z * 6.2831853);
  fishP.yz = vec2(uJawP.w, 0.0) + (fishP.yz - vec2(uJawP.w, 0.0)) * sw;
  fishP.z += fSw.z * L * 0.25 * s * s;
  fishP.z += aSwim.x * uShape2.z * L * sin(uTime * uShape2.y + aSwim.y);
#endif
}
`;

const DECL_F = /* glsl */ `
uniform vec3 uFlashCol; varying float vFishFlash;
`;

/** patch a MeshStandard/Physical material with the swim shader, then run it through uw() */
export function swimMaterial<T extends THREE.MeshStandardMaterial>(mat: T, sp: SpeciesUniforms, inst: FishInst | null, flags: SwimFlags = {}, uwo: UwOpts = {}): T {
  const mode = flags.mode ?? 0;
  const key = `fish${mode}${flags.vertical ? 'v' : ''}${flags.morph ? 'm' : ''}${flags.inst ? 'i' : ''}`;
  const local = inst ?? new FishInst();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSwim = local.uSwim; sh.uniforms.uFx = local.uFx; sh.uniforms.uFlashCol = local.uFlashCol;
    sh.uniforms.uShape = sp.uShape; sh.uniforms.uShape2 = sp.uShape2; sh.uniforms.uJawP = sp.uJawP;
    let defs = `#define FISH_MODE ${mode}\n`;
    if (flags.vertical) defs += '#define FISH_VERT\n';
    if (flags.morph) defs += '#define FISH_MORPH\n';
    if (flags.inst) defs += '#define FISH_INST\n';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + defs + DECL_V)
      .replace('#include <beginnormal_vertex>', 'fishDeform();\nvec3 objectNormal = fishN;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = fishP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL_F)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uFlashCol * 1.4, clamp(vFishFlash, 0.0, 1.0));\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => key;
  (mat.userData as Record<string, unknown>).fishInst = local;
  return uw(mat, uwo);
}

/** depth material for shadows that keeps fin cut-outs (shared per species) */
export function fishDepthMaterial(map: THREE.Texture): THREE.MeshDepthMaterial {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
}
