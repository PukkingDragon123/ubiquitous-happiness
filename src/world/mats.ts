// Materials for the v2 environment. Every one is a MeshStandardMaterial with flat (faceted) shading, nearest
// pixel textures and the shared underwater patch (uw), plus:
//   - flora: alpha-cut atlas, double-sided, vertex sway driven by the aSway attribute (base position + flex in
//     metres), current lean, plants bending away from the player (uPush) and blast waves (uBlast);
//   - glow: per-vertex aGlow weight adds pulsing emissive light (bioluminescence, vents, lanterns);
//   - rock: world-space triplanar tile (no UVs needed, so sculpted rocks merge freely);
//   - ground: sand tile from above, rock tile on steep faces;
//   - section: the cross-section wall, sampled by world x / y.
import * as THREE from 'three';
import { uw, UW } from '../gfx/shaders/underwater';
import { retro } from '../gfx/retro';

export const ENV = {
  /** player push: x, y, radius, strength */
  uPush: { value: new THREE.Vector4(0, -999, 1.6, 1) },
  /** blast wave: x, y, age (s), strength */
  uBlast: { value: new THREE.Vector4(0, -999, 99, 0) },
  /** steady current lean (m per m of flex) */
  uCurrent: { value: 0.25 },
  uGlowK: { value: 1 },
  /** sand height change texture (SandField) + box: x0, dx, n, enabled */
  uSand: { value: null as THREE.Texture | null },
  uSandBox: { value: new THREE.Vector4(0, 1, 1, 0) },
};

const SAND_GLSL = /* glsl */ `
uniform sampler2D uSand; uniform vec4 uSandBox;
float sandDY(float x, float z) {
  if (uSandBox.w < 0.5) return 0.0;
  float f = clamp((x - uSandBox.x) / uSandBox.y, 0.0, uSandBox.z - 1.001);
  float i = floor(f), t = f - i;
  float a = texture2D(uSand, vec2((i + 0.5) / uSandBox.z, 0.5)).r;
  float b = texture2D(uSand, vec2((i + 1.5) / uSandBox.z, 0.5)).r;
  return mix(a, b, t) * smoothstep(-2.6, -0.6, z);
}
`;

const SWAY_V = SAND_GLSL + /* glsl */ `
attribute vec4 aSway; attribute float aGlow;
uniform vec4 uPush; uniform vec4 uBlast; uniform float uCurrent; uniform float uEnvT;
varying float vGlow; varying float vGlowPh;
`;
const SWAY_BODY = /* glsl */ `
{
  vGlow = aGlow; vGlowPh = aSway.x * 0.7 + aSway.z * 0.3;
  float f = aSway.w;
  if (f > 0.0) {
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vec3 base = aSway.xyz;
    float h = max(0.0, wp.y - base.y);
    float ph = base.x * 0.37 + base.z * 0.23;
    float t = uEnvT;
    vec3 off = vec3(0.0);
    off.x += sin(t * 0.9 + ph + h * 0.22) * 0.75 + sin(t * 2.3 + ph * 2.1 + h * 0.9) * 0.18 + uCurrent;
    off.z += cos(t * 0.7 + ph * 1.3 + h * 0.15) * 0.45;
    off.y -= 0.12 * abs(off.x);
    // the blobfish brushes through: tips lean away from it
    vec2 d = wp.xy - uPush.xy;
    float dl = length(d);
    float pk = smoothstep(uPush.z, 0.0, dl) * uPush.w;
    off.xy += (d / max(dl, 0.001)) * pk * 1.6;
    // blast waves: a ring travelling outward
    vec2 bd = wp.xy - uBlast.xy; float bl = length(bd);
    float ring = exp(-pow(bl - uBlast.z * 9.0, 2.0) * 0.5) * exp(-uBlast.z * 1.6) * uBlast.w;
    off.xy += (bd / max(bl, 0.001)) * ring * 2.5;
    transformed += off * f;
  }
  // plants rooted near the gameplay plane ride the sand
  if (dot(aSway.xyz, aSway.xyz) > 0.0) transformed.y += sandDY(aSway.x, aSway.z);
}
`;
const GLOW_F_DECL = /* glsl */ `varying float vGlow; varying float vGlowPh; uniform float uGlowK; uniform float uEnvT;`;
const GLOW_F = /* glsl */ `
if (vGlow > 0.0) totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlowK * (0.72 + 0.28 * sin(uEnvT * 1.9 + vGlowPh));
`;

/** chain an onBeforeCompile patch after uw() */
function patch(m: THREE.Material, key: string, fn: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); fn(sh); };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + key;
}

function addSwayGlow(m: THREE.MeshStandardMaterial, sway: boolean) {
  patch(m, sway ? '|sway' : '|glow', (sh) => {
    Object.assign(sh.uniforms, ENV, { uEnvT: UW.uTime });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SWAY_V)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (sway ? SWAY_BODY : 'vGlow = aGlow; vGlowPh = aSway.x * 0.7 + aSway.z * 0.3;'));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLOW_F_DECL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLOW_F);
  });
}

/** alpha-cut, double-sided, swaying plants on an atlas */
export function floraMaterial(map: THREE.Texture, o: { sss?: [number, number, number]; rough?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, flatShading: true, side: THREE.DoubleSide, alphaTest: 0.5, roughness: o.rough ?? 0.75, metalness: 0 });
  uw(m, { sss: o.sss ?? [0.7, 0.9, 0.5], sssK: 0.55, caustics: 0.9, retro: false });
  addSwayGlow(m, true);
  return retro(m);
}

/** pixel-art sprite cards: nearest-filtered alpha cut-outs, smooth (tilted) card normals, sway + glow */
export function spriteMaterial(map: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, flatShading: false, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.92, metalness: 0 });
  uw(m, { sss: [0.75, 0.8, 0.6], sssK: 0.6, caustics: 0.8, retro: false });
  addSwayGlow(m, true);
  return retro(m, { affine: 0 });
}

/** opaque UV-mapped props (wrecks, crates, buoys, clams) on an atlas; sway optional (sails, flags, chains) */
export function propMaterial(map: THREE.Texture, o: { sway?: boolean; rough?: number; metal?: number; side?: THREE.Side; alphaTest?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, flatShading: true, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0 });
  // wrap light keeps the camera-facing shadow sides of hulls and props readable against the sunlit sand
  uw(m, { caustics: 1, retro: false, sss: [0.62, 0.66, 0.66], sssK: 0.7 });
  addSwayGlow(m, o.sway ?? false);
  return retro(m);
}

const TRI_V = /* glsl */ `varying vec3 vTW; varying vec3 vTN;`;
const TRI_VB = /* glsl */ `
{
  vec4 tp = vec4(transformed, 1.0); vec3 tn = objectNormal;
  #ifdef USE_INSTANCING
    tp = instanceMatrix * tp; tn = mat3(instanceMatrix) * tn;
  #endif
  vTW = (modelMatrix * tp).xyz; vTN = normalize(mat3(modelMatrix) * tn);
}`;

/** sculpted rock: world-space triplanar pixel tile (32 px/m), vertex colour = tint x cavity x crust */
export function rockMaterial(tile: THREE.Texture, o: { scale?: number; glow?: boolean } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tile, vertexColors: true, flatShading: true, roughness: 0.93, metalness: 0 });
  uw(m, { caustics: 0.9, retro: false, sss: [0.5, 0.56, 0.58], sssK: 0.5 });
  const sc = (o.scale ?? 0.5).toFixed(3);
  patch(m, '|rock' + sc, (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRI_V).replace('#include <project_vertex>', '#include <project_vertex>\n' + TRI_VB);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TRI_V)
      .replace('#include <map_fragment>', `
        vec3 bw = abs(vTN); bw = step(max(bw.x, max(bw.y, bw.z)) - 0.0001, bw); // dominant axis: crisp PS1 box mapping
        vec2 tuv = bw.x > 0.5 ? vTW.zy : bw.y > 0.5 ? vTW.xz : vTW.xy;
        diffuseColor *= texture2D(map, tuv * ${sc});`);
  });
  if (o.glow) addSwayGlow(m, false);
  return retro(m);
}

/** seabed: sand tile from above, rock tile on slopes (world space) */
export function groundMaterial(sand: THREE.Texture, rock: THREE.Texture, o: { sandScale?: number; rockScale?: number; slope?: [number, number]; dynamic?: boolean } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: sand, vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0 });
  uw(m, { caustics: 1, retro: false });
  const ss = (o.sandScale ?? 0.36).toFixed(3), rs = (o.rockScale ?? 0.5).toFixed(3);
  const [s0, s1] = o.slope ?? [0.55, 0.75];
  patch(m, '|ground' + ss + rs + (o.dynamic ? 'd' : ''), (sh) => {
    sh.uniforms.uRockMap = { value: rock };
    if (o.dynamic) Object.assign(sh.uniforms, { uSand: ENV.uSand, uSandBox: ENV.uSandBox });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRI_V + (o.dynamic ? SAND_GLSL + 'attribute float aSandW;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (o.dynamic ? 'transformed.y += sandDY(position.x, position.z) * aSandW;' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + TRI_VB);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRockMap;\n' + TRI_V)
      .replace('#include <map_fragment>', `
        vec3 gn = normalize(cross(dFdx(vTW), dFdy(vTW)));
        vec4 sc = texture2D(map, vTW.xz * ${ss});
        vec2 ruv = abs(gn.x) > abs(gn.z) ? vTW.zy : vTW.xy;
        vec4 rc = texture2D(uRockMap, ruv * ${rs});
        float rk = 1.0 - smoothstep(${s0.toFixed(2)}, ${s1.toFixed(2)}, abs(gn.y));
        diffuseColor *= mix(sc, rc, step(0.5, rk));`);
  });
  return retro(m);
}

/** the cross-section wall: tile sampled by world (x, y) */
export function sectionMaterial(tile: THREE.Texture, scale = 0.5, dynamic = false) {
  const m = new THREE.MeshStandardMaterial({ map: tile, vertexColors: true, flatShading: false, roughness: 0.95, metalness: 0 });
  uw(m, { caustics: 0.4, retro: false });
  patch(m, '|section' + scale + (dynamic ? 'd' : ''), (sh) => {
    if (dynamic) Object.assign(sh.uniforms, { uSand: ENV.uSand, uSandBox: ENV.uSandBox });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRI_V + (dynamic ? SAND_GLSL + 'attribute float aSandW;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (dynamic ? 'transformed.y += sandDY(position.x, 0.0) * aSandW;' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + TRI_VB);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TRI_V)
      .replace('#include <map_fragment>', `diffuseColor *= texture2D(map, vec2(vTW.x, vTW.y) * ${scale.toFixed(3)});`);
  });
  return retro(m);
}

/** unlit additive sheet (light shafts, glints, beams): depthWrite off, fades with vertex alpha in colour */
export function additiveMaterial(color: THREE.ColorRepresentation, o: { map?: THREE.Texture; opacity?: number } = {}) {
  return new THREE.MeshBasicMaterial({ color, map: o.map ?? null, transparent: true, opacity: o.opacity ?? 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, fog: false });
}
