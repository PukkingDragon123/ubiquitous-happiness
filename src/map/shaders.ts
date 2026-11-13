// Shaders for the ocean diorama.
//   - DIO: shared uniforms (time, cloud shadows, water absorption, caustics, the cutaway z)
//   - dio(mat): patches any MeshStandard material with drifting cloud shadows, and (below the waterline)
//     light absorption + pixel caustics; optional wind sway / flutter / wing flap / tail wiggle
//   - water, ground, cutaway face, slab walls, current ribbons, wakes, glow rings and light beams
import * as THREE from 'three';

export const DIO = {
  uDTime: { value: 0 },
  /** amount, scale, wind x, wind z */
  uDCloud: { value: new THREE.Vector4(0.34, 0.055, 0.22, 0.1) },
  uDExt: { value: new THREE.Vector3(0.5, 0.17, 0.1) },
  uDCaustic: { value: 1.0 },
  uDCausticCol: { value: new THREE.Color('#fff4d6') },
  uDCutZ: { value: 1000 },
  uDSunDir: { value: new THREE.Vector3(-0.5, 0.78, 0.4).normalize() },
  uDSunCol: { value: new THREE.Color('#fff0d4') },
  uDNight: { value: 0 },
  /** z01, z12, half blend width: zone boundaries along the act */
  uZoneZ: { value: new THREE.Vector3(-1e5, -1e5, 2.2) },
};

export const DIO_GLSL = /* glsl */ `
uniform float uDTime; uniform vec4 uDCloud; uniform vec3 uDExt; uniform float uDCaustic; uniform vec3 uDCausticCol;
uniform float uDCutZ; uniform vec3 uDSunDir; uniform vec3 uDSunCol; uniform float uDNight; uniform vec3 uZoneZ;
float dHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float dNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float dFbm(vec2 p) { float a = 0.0, s = 0.5; for (int i = 0; i < 4; i++) { a += dNoise(p) * s; p = p * 2.03 + vec2(1.7, 9.2); s *= 0.5; } return a / 0.9375; }
float dBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float dBayer(vec2 a) { return dBayer2(0.5 * a) * 0.25 + dBayer2(a); }
float dCloud(vec2 xz) { float n = dFbm(xz * uDCloud.y + uDCloud.zw * uDTime); return smoothstep(0.5, 0.7, n) * uDCloud.x; }
vec3 dZoneW(float z) {
  float t1 = 1.0 - smoothstep(uZoneZ.x - uZoneZ.z, uZoneZ.x + uZoneZ.z, z);
  float t2 = 1.0 - smoothstep(uZoneZ.y - uZoneZ.z, uZoneZ.y + uZoneZ.z, z);
  return vec3(1.0 - t1, t1 - t2, t2);
}
// miniature swell: four small travelling waves
float dWaveH(vec2 p) {
  float t = uDTime;
  return 0.016 * sin(dot(p, vec2(1.7, 0.9)) - t * 1.5) + 0.011 * sin(dot(p, vec2(-1.1, 2.3)) - t * 1.9 + 1.3)
       + 0.007 * sin(dot(p, vec2(3.1, -2.6)) - t * 2.7 + 0.4) + 0.004 * sin(dot(p, vec2(-4.7, -3.9)) - t * 3.3 + 2.1);
}
vec2 dWaveG(vec2 p) {
  float t = uDTime;
  return 0.016 * cos(dot(p, vec2(1.7, 0.9)) - t * 1.5) * vec2(1.7, 0.9) + 0.011 * cos(dot(p, vec2(-1.1, 2.3)) - t * 1.9 + 1.3) * vec2(-1.1, 2.3)
       + 0.007 * cos(dot(p, vec2(3.1, -2.6)) - t * 2.7 + 0.4) * vec2(3.1, -2.6) + 0.004 * cos(dot(p, vec2(-4.7, -3.9)) - t * 3.3 + 2.1) * vec2(-4.7, -3.9);
}
float dCaustic(vec2 p, float t) {
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.5);
}
`;

const SWAY_GLSL = /* glsl */ `
{
  vec3 dIp = vec3(0.0);
  #ifdef USE_INSTANCING
    dIp = instanceMatrix[3].xyz;
  #endif
  float dPh = dot(dIp.xz, vec2(1.31, 0.77)) + dIp.y * 3.0;
  #ifdef DIO_SWAY_PALM
    float dHh = max(position.y, 0.0);
    float dSw = sin(uDTime * 1.1 + dPh) * 0.6 + sin(uDTime * 2.3 + dPh * 1.7) * 0.25;
    transformed.x += dSw * 0.035 * dHh * dHh * uDSwayK;
    transformed.z += cos(uDTime * 0.9 + dPh) * 0.025 * dHh * dHh * uDSwayK;
    transformed.y += sin(uDTime * 3.4 + dPh + position.x * 7.0 + position.z * 5.0) * 0.018 * aW;
  #endif
  #ifdef DIO_SWAY_KELP
    float dKh = max(position.y, 0.0);
    transformed.x += sin(uDTime * 0.8 + dPh + dKh * 1.6) * 0.07 * dKh * uDSwayK;
    transformed.z += cos(uDTime * 0.7 + dPh * 1.3 + dKh * 1.2) * 0.05 * dKh * uDSwayK;
  #endif
  #ifdef DIO_SWAY_FLAG
    transformed.z += sin(uDTime * 7.0 + position.x * 14.0 + dPh) * 0.025 * aW * uDSwayK;
    transformed.y += sin(uDTime * 5.0 + position.x * 9.0 + dPh) * 0.01 * aW * uDSwayK;
  #endif
  #ifdef DIO_SWAY_GULL
    float dFl = sin(uDTime * 9.0 + dPh * 3.0);
    float dGate = smoothstep(-0.2, 0.4, sin(uDTime * 0.9 + dPh));
    transformed.y += mix(0.06, dFl, dGate) * abs(position.z) * 0.85 * aW;
  #endif
  #ifdef DIO_SWAY_FISH
    transformed.z += sin(uDTime * 9.0 + dPh * 5.0 - position.x * 30.0) * 0.022 * aW;
  #endif
}
`;

export interface DioOpts { caustics?: number; cloud?: number; sway?: 'palm' | 'kelp' | 'flag' | 'gull' | 'fish'; swayK?: number; extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void; key?: string }

/** inject the diorama lighting into a compiled MeshStandard/Physical shader */
export function patchDio(sh: THREE.WebGLProgramParametersWithUniforms, o: DioOpts, local: Record<string, THREE.IUniform>) {
  Object.assign(sh.uniforms, DIO, local);
  const sway = o.sway ? '#define DIO_SWAY_' + o.sway.toUpperCase() + '\n' : '';
  sh.vertexShader = sway + sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDW;\nuniform float uDSwayK;\n' + (o.sway ? 'attribute float aW;\n' : '') + DIO_GLSL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (o.sway ? SWAY_GLSL : ''))
    .replace('#include <project_vertex>', `#include <project_vertex>
    {
      vec4 dP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        dP = instanceMatrix * dP;
      #endif
      vDW = (modelMatrix * dP).xyz;
    }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDW;\nuniform float uDMatCaustic; uniform float uDMatCloud;\n' + DIO_GLSL)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    {
      float dCs = dCloud(vDW.xz) * uDMatCloud;
      reflectedLight.directDiffuse *= 1.0 - dCs;
      reflectedLight.directSpecular *= 1.0 - dCs;
      float dDep = -vDW.y;
      if (dDep > 0.0) {
        vec3 dEx = exp(-uDExt * dDep);
        reflectedLight.directDiffuse *= dEx;
        reflectedLight.directSpecular *= dEx;
        reflectedLight.indirectDiffuse *= mix(dEx, vec3(1.0), 0.4);
        vec3 dN = inverseTransformDirection(normal, viewMatrix);
        float dUp = smoothstep(-0.1, 0.8, dot(dN, uDSunDir));
        vec2 dQ = floor(vDW.xz * 18.0) / 18.0;
        float dC = dCaustic(dQ * 2.3, uDTime * 0.55);
        float dFade = smoothstep(0.0, 0.18, dDep) * exp(-dDep * 0.32);
        reflectedLight.directDiffuse += diffuseColor.rgb * uDCausticCol * dC * dFade * dUp * (1.0 - dCs) * uDCaustic * uDMatCaustic * 0.55;
      }
    }`);
  o.extra?.(sh);
}

export function dio<T extends THREE.Material>(mat: T, o: DioOpts = {}): T {
  const local = { uDMatCaustic: { value: o.caustics ?? 1 }, uDMatCloud: { value: o.cloud ?? 1 }, uDSwayK: { value: o.swayK ?? 1 } };
  (mat.userData as Record<string, unknown>).dio = local;
  mat.onBeforeCompile = (sh) => patchDio(sh, o, local);
  mat.customProgramCacheKey = () => 'dio:' + (o.sway ?? '') + ':' + (o.key ?? '');
  return mat;
}

// ------------------------------------------------------------------ water
export interface WaterUniforms {
  uField: THREE.IUniform<THREE.Texture | null>; uFieldBox: THREE.IUniform<THREE.Vector4>;
  uShallow: THREE.IUniform<THREE.Color[]>; uDeep: THREE.IUniform<THREE.Color[]>; uFoam: THREE.IUniform<THREE.Color[]>; uSky: THREE.IUniform<THREE.Color[]>; uPlank: THREE.IUniform<THREE.Color[]>;
}
export function waterUniforms(): WaterUniforms {
  const c3 = () => [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  return { uField: { value: null }, uFieldBox: { value: new THREE.Vector4() }, uShallow: { value: c3() }, uDeep: { value: c3() }, uFoam: { value: c3() }, uSky: { value: c3() }, uPlank: { value: c3() } };
}

export function waterMaterial(U: WaterUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.16, metalness: 0.0, transparent: true, depthWrite: false });
  const local = { uDMatCaustic: { value: 0 }, uDMatCloud: { value: 0.85 }, uDSwayK: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    patchDio(sh, {}, local);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;')
      .replace('#include <beginnormal_vertex>', `vec4 dW0 = modelMatrix * vec4(position, 1.0);
      vec2 dG0 = dWaveG(dW0.xz) * aEdge;
      vec3 objectNormal = normalize(mix(vec3(normal), normalize(vec3(-dG0.x, 1.0, -dG0.y)), aEdge));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += dWaveH(dW0.xz) * aEdge; vEdge = aEdge;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying float vEdge;
      uniform sampler2D uField; uniform vec4 uFieldBox;
      uniform vec3 uShallow[3]; uniform vec3 uDeep[3]; uniform vec3 uFoam[3]; uniform vec3 uSky[3]; uniform vec3 uPlank[3];
      vec3 dZ3(vec3 a[3], vec3 w) { return a[0] * w.x + a[1] * w.y + a[2] * w.z; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 dZw = dZoneW(vDW.z);
      vec4 dF = texture2D(uField, vec2((vDW.x - uFieldBox.x) * uFieldBox.z, (vDW.z - uFieldBox.y) * uFieldBox.w));
      float dDepth = dF.r * 4.5;
      float dShore = dF.g * 2.5;
      vec2 dPix = floor(vDW.xz * 20.0);
      float dB = dBayer(dPix);
      float dK = 1.0 - exp(-dDepth * 0.62);
      float dKq = floor(dK * 8.0 + dB * 0.95) / 8.0;
      vec3 dWc = mix(dZ3(uShallow, dZw), dZ3(uDeep, dZw), dKq);
      dWc *= 0.95 + 0.1 * dNoise(vDW.xz * 1.3 + vec2(uDTime * 0.15, -uDTime * 0.1));
      float dA = mix(0.42, 0.97, smoothstep(0.0, 2.6, dDepth));
      // lacy foam hugging every shore and rock, plus rings breathing outward
      float dN1 = dNoise(dPix * 0.3 + vec2(uDTime * 0.7, uDTime * 0.2));
      float dN2 = dNoise(vDW.xz * 3.2 - uDTime * 0.3);
      float dLine = step(dShore, 0.035 + 0.075 * dN2 + 0.025 * sin(uDTime * 1.6 + vDW.x * 3.0 + vDW.z * 2.0));
      float dRing = fract(dShore * 2.6 - uDTime * 0.3);
      float dRings = step(0.82, dRing) * step(dShore, 0.8) * step(0.38, dN1) * step(0.12, dShore);
      float dFoam = max(dLine, dRings * (1.0 - dShore / 0.8) * 1.6);
      dFoam = clamp(dFoam, 0.0, 1.0);
      vec3 dFo = dZ3(uFoam, dZw);
      dWc = mix(dWc, dFo, dFoam);
      dA = max(dA, dFoam * 0.95);
      dA = mix(1.0, dA, smoothstep(0.0, 0.7, vEdge));
      dWc = mix(dZ3(uDeep, dZw) * 0.8, dWc, smoothstep(0.0, 0.5, vEdge));
      diffuseColor.rgb = dWc;
      diffuseColor.a = dA;
      float dFoamOut = dFoam;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      {
        vec2 dG = dWaveG(vDW.xz);
        vec2 p1 = vDW.xz * 6.5 + vec2(uDTime * 0.33, uDTime * 0.21);
        vec2 p2 = vDW.xz * 10.5 - vec2(uDTime * 0.26, -uDTime * 0.3);
        float e = 0.06;
        float hx1 = dNoise(p1 + vec2(e, 0.0)) - dNoise(p1 - vec2(e, 0.0));
        float hz1 = dNoise(p1 + vec2(0.0, e)) - dNoise(p1 - vec2(0.0, e));
        float hx2 = dNoise(p2 + vec2(e, 0.0)) - dNoise(p2 - vec2(e, 0.0));
        float hz2 = dNoise(p2 + vec2(0.0, e)) - dNoise(p2 - vec2(0.0, e));
        dG += (vec2(hx1, hz1) * 6.5 + vec2(hx2, hz2) * 10.5 * 0.6) / (2.0 * e) * 0.0045;
        vec3 dNw = normalize(vec3(-dG.x, 1.0, -dG.y));
        vec3 dNg = inverseTransformDirection(normal, viewMatrix);
        dNw = normalize(mix(dNg, dNw, vEdge));
        normal = normalize((viewMatrix * vec4(dNw, 0.0)).xyz);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 dV = normalize(cameraPosition - vDW);
        vec3 dN = inverseTransformDirection(normal, viewMatrix);
        vec3 dR = reflect(-dV, dN);
        float dS = pow(max(dot(dR, uDSunDir), 0.0), 700.0);
        float dTw = step(0.62, dNoise(floor(vDW.xz * 26.0) * 0.7 + floor(uDTime * 5.0) * 3.17));
        float dCl = 1.0 - dCloud(vDW.xz) * 1.6;
        totalEmissiveRadiance += uDSunCol * dS * (0.6 + 5.0 * dTw) * 2.2 * max(dCl, 0.0) * vEdge * (1.0 - dFoamOut);
        float dFr = pow(1.0 - max(dot(dN, dV), 0.0), 3.0);
        totalEmissiveRadiance += dZ3(uSky, dZw) * dFr * 0.55;
        // bioluminescent plankton (night zones)
        if (uDNight > 0.01) {
          vec2 dC = floor(vDW.xz * 22.0);
          float dH = dHash(dC);
          float dP = step(0.986, dH) * (0.5 + 0.5 * sin(uDTime * (1.5 + dH * 3.0) + dH * 40.0));
          totalEmissiveRadiance += dZ3(uPlank, dZw) * dP * uDNight * 1.6 * (1.0 - dFoamOut);
          totalEmissiveRadiance += dZ3(uPlank, dZw) * dFoamOut * uDNight * 0.35;
        }
      }`);
  };
  m.customProgramCacheKey = () => 'dioWater';
  return m;
}

// ------------------------------------------------------------------ ground (seabed + islands)
export interface GroundUniforms {
  uField: THREE.IUniform<THREE.Texture | null>; uFieldBox: THREE.IUniform<THREE.Vector4>; uDetail: THREE.IUniform<THREE.Texture | null>;
  uSand: THREE.IUniform<THREE.Color[]>; uGrass: THREE.IUniform<THREE.Color[]>; uRock: THREE.IUniform<THREE.Color[]>; uBed: THREE.IUniform<THREE.Color[]>;
}
export function groundUniforms(): GroundUniforms {
  const c12 = () => Array.from({ length: 12 }, () => new THREE.Color());
  return { uField: { value: null }, uFieldBox: { value: new THREE.Vector4() }, uDetail: { value: null }, uSand: { value: c12() }, uGrass: { value: c12() }, uRock: { value: c12() }, uBed: { value: c12() } };
}

export function groundMaterial(U: GroundUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93, metalness: 0 });
  const local = { uDMatCaustic: { value: 1 }, uDMatCloud: { value: 1 }, uDSwayK: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    patchDio(sh, {}, local);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO;\nvarying float vAO;\nvarying vec3 vDN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = aAO; vDN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying float vAO; varying vec3 vDN;
      uniform sampler2D uField; uniform vec4 uFieldBox; uniform sampler2D uDetail;
      uniform vec3 uSand[12]; uniform vec3 uGrass[12]; uniform vec3 uRock[12]; uniform vec3 uBed[12];
      vec3 dRamp(vec3 a, vec3 b, vec3 c, vec3 d, float t) { t = clamp(t, 0.0, 1.0) * 3.0; return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : mix(c, d, t - 2.0); }
      #define DRAMP(R, w, t) dRamp(R[0]*w.x+R[4]*w.y+R[8]*w.z, R[1]*w.x+R[5]*w.y+R[9]*w.z, R[2]*w.x+R[6]*w.y+R[10]*w.z, R[3]*w.x+R[7]*w.y+R[11]*w.z, t)`)
      .replace('#include <map_fragment>', `
      {
        vec3 dZw = dZoneW(vDW.z);
        vec2 dWp = vDW.xz;
        vec2 dPx = floor(dWp * 32.0);
        float dB = dBayer(dPx);
        vec4 dDet = texture2D(uDetail, (dPx + 0.5) / 64.0);
        vec4 dDet2 = texture2D(uDetail, dWp * 0.09 + vec2(0.37, 0.71));
        vec4 dF = texture2D(uField, vec2((vDW.x - uFieldBox.x) * uFieldBox.z, (vDW.z - uFieldBox.y) * uFieldBox.w));
        float dRocky = dF.b, dVeg = dF.a;
        vec3 dNw = normalize(vDN);
        float dSlope = 1.0 - dNw.y;
        float dH = vDW.y + (dB - 0.5) * 0.045 + (dDet2.b - 0.5) * 0.07;
        float dLight = 0.0;
        vec3 dC;
        float dRockT = dSlope * 1.2 + dRocky * 0.55 + (dDet.b - 0.5) * 0.3 + (dB - 0.5) * 0.12 + smoothstep(0.25, 1.2, vDW.y) * dRocky * 0.4;
        float dGrassLine = mix(0.95, 0.1, dVeg) + (dDet2.g - 0.5) * 0.12;
        float dQ = 6.0;
        if (dH > 0.03 && dRockT > 0.62) {
          float t = floor((dDet.b * 0.75 + dNw.y * 0.25) * dQ + dB) / dQ;
          dC = DRAMP(uRock, dZw, t);
        } else if (dH > dGrassLine) {
          float t = floor((dDet.g * 0.8 + 0.2 * dDet2.g) * dQ + dB) / dQ;
          dC = DRAMP(uGrass, dZw, t);
        } else if (dH > 0.03) {
          float t = floor((dDet.r * 0.7 + 0.3) * dQ + dB) / dQ;
          dC = DRAMP(uSand, dZw, t);
        } else if (dH > -0.2) {
          float t = floor((dDet.r * 0.55 + 0.15) * dQ + dB) / dQ;
          dC = DRAMP(uSand, dZw, t) * vec3(0.84, 0.86, 0.9);
        } else {
          float t = floor((dDet.a * 0.75 + dDet2.a * 0.25) * dQ + dB) / dQ;
          dC = DRAMP(uBed, dZw, t);
          // darker silt in the deep, rubble + rocks on slopes
          dC *= mix(1.0, 0.72, 1.0 - smoothstep(-3.5, -0.6, vDW.y));
          if (dRockT > 0.75) dC = mix(dC, DRAMP(uRock, dZw, t * 0.8), 0.7);
        }
        dC *= mix(0.62, 1.0, vAO);
        diffuseColor.rgb *= dC;
      }`);
  };
  m.customProgramCacheKey = () => 'dioGround';
  return m;
}

// ------------------------------------------------------------------ the cutaway face
export interface CapUniforms {
  uProf: THREE.IUniform<THREE.Texture | null>; uProfX: THREE.IUniform<THREE.Vector2>;
  uBottom: THREE.IUniform<number>; uHalfW: THREE.IUniform<number>; uBevel: THREE.IUniform<number>; uCapZ: THREE.IUniform<number>;
  uW0: THREE.IUniform<THREE.Color>; uW1: THREE.IUniform<THREE.Color>; uW2: THREE.IUniform<THREE.Color>;
  uS0: THREE.IUniform<THREE.Color>; uS1: THREE.IUniform<THREE.Color>; uS2: THREE.IUniform<THREE.Color>; uS3: THREE.IUniform<THREE.Color>;
  uSand: THREE.IUniform<THREE.Color>; uSandD: THREE.IUniform<THREE.Color>; uGrass: THREE.IUniform<THREE.Color>; uSoil: THREE.IUniform<THREE.Color>; uRockC: THREE.IUniform<THREE.Color>;
  uBedrock: THREE.IUniform<THREE.Color>; uOre0: THREE.IUniform<THREE.Color>; uOre1: THREE.IUniform<THREE.Color>; uOre2: THREE.IUniform<THREE.Color>;
  uLight: THREE.IUniform<THREE.Color>; uPlankC: THREE.IUniform<THREE.Color>; uFoamC: THREE.IUniform<THREE.Color>;
  uKelp: THREE.IUniform<number>; uKelpC: THREE.IUniform<THREE.Color>; uFishC: THREE.IUniform<THREE.Color>;
  uWr: THREE.IUniform<THREE.Vector4[]>; uWrN: THREE.IUniform<number>;
}
export function capUniforms(): CapUniforms {
  const c = () => ({ value: new THREE.Color() });
  return {
    uProf: { value: null }, uProfX: { value: new THREE.Vector2() }, uBottom: { value: -6 }, uHalfW: { value: 10 }, uBevel: { value: 0.45 }, uCapZ: { value: 0 },
    uW0: c(), uW1: c(), uW2: c(), uS0: c(), uS1: c(), uS2: c(), uS3: c(), uSand: c(), uSandD: c(), uGrass: c(), uSoil: c(), uRockC: c(),
    uBedrock: c(), uOre0: c(), uOre1: c(), uOre2: c(), uLight: c(), uPlankC: c(), uFoamC: c(),
    uKelp: { value: 0 }, uKelpC: c(), uFishC: c(),
    uWr: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uWrN: { value: 0 },
  };
}

export function capMaterial(U: CapUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...DIO, ...U },
    transparent: true,
    vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${DIO_GLSL}
      uniform sampler2D uProf; uniform vec2 uProfX; uniform float uBottom; uniform float uHalfW; uniform float uBevel; uniform float uCapZ;
      uniform vec3 uW0, uW1, uW2, uS0, uS1, uS2, uS3, uSand, uSandD, uGrass, uSoil, uRockC, uBedrock, uOre0, uOre1, uOre2, uLight, uPlankC, uFoamC;
      uniform float uKelp; uniform vec3 uKelpC; uniform vec3 uFishC;
      uniform vec4 uWr[4]; uniform float uWrN;
      varying vec3 vW;
      // sliced hull of a sunken wreck: x = 1 planking, 2 inside; y = height 0..1 above the keel
      vec2 wreckAt(float x, float y) {
        for (int i = 0; i < 4; i++) {
          if (float(i) >= uWrN) break;
          vec4 w = uWr[i];
          float lx = (x - w.x) / w.z, ly = (y - w.y) / w.w;
          if (ly < 0.0 || ly > 1.0 || abs(lx) > 1.0) continue;
          float hw = pow(ly, 0.42);
          float ax = abs(lx);
          if (ax > hw) continue;
          bool plank = ax > hw - 0.075 / w.z || ly < 0.07 / w.w;
          // a broken gunwale on one side
          if (lx > 0.0 && ly > 0.72 + 0.2 * dHash(vec2(floor(y * 12.0), float(i)))) continue;
          return vec2(plank ? 1.0 : 2.0, ly);
        }
        return vec2(0.0);
      }
      // kelp stalks just behind the glass: each one fades in and out as the cut slides through its patch
      float kelpAt(float x, float y, float g, float wt) {
        float cw = 0.55, m = 0.0;
        float cx = floor(x / cw);
        for (int i = -1; i <= 1; i++) {
          float c = cx + float(i);
          float zc = uCapZ / 1.4 + dHash(vec2(c, 5.3));
          float layer = floor(zc);
          float fade = 1.0 - abs(fract(zc) - 0.5) * 2.0;
          float h = dHash(vec2(c, layer * 7.13));
          if (h > uKelp || fade < 0.05) continue;
          float hgt = (wt - g) * (0.75 + 0.25 * dHash(vec2(c, layer + 1.7)));
          float yy = y - g;
          if (yy < 0.0 || yy > hgt) continue;
          float sx = (c + 0.5 + (dHash(vec2(c, layer + 3.1)) - 0.5) * 0.5) * cw + sin(yy * 2.0 + uDTime * 0.8 + h * 6.28) * 0.06 * yy;
          float d = abs(x - sx);
          float lp = yy * 3.2 + h * 4.0;
          float side = mod(floor(lp), 2.0) * 2.0 - 1.0;
          float lf = fract(lp);
          vec2 q = vec2((x - sx - side * 0.07) / 0.075, (lf - 0.5) / 0.42);
          float leaf = step(dot(q, q), 1.0);
          m = max(m, max(step(d, 0.022), leaf) * smoothstep(0.05, 0.35, fade));
        }
        return m;
      }
      // a few fish drifting across the water band
      float fishAt(float x, float y, float wt, float g) {
        float m = 0.0;
        for (int k = 0; k < 3; k++) {
          float fk = float(k);
          float sp = 0.25 + fk * 0.12;
          float dirn = mod(fk, 2.0) * 2.0 - 1.0;
          float span = uHalfW * 2.0 + 2.0;
          float fx = mod(uDTime * sp * dirn + fk * 7.3 + uCapZ * 0.37, span) - span * 0.5;
          float fy = mix(wt - 0.35, g + 0.3, fract(0.3 + fk * 0.37 + floor(uCapZ / 3.0) * 0.21)) + sin(uDTime * 1.3 + fk) * 0.05;
          for (int j = 0; j < 4; j++) {
            float ox = fx + float(j) * 0.32 * -dirn + sin(float(j) * 2.3) * 0.1;
            float oy = fy + sin(float(j) * 1.7 + fk) * 0.12;
            vec2 q = vec2((x - ox) / 0.11, (y - oy) / 0.045);
            float body = step(dot(q, q), 1.0);
            vec2 tq = vec2((x - ox) * dirn + 0.1, y - oy);
            float tail = step(0.0, -tq.x) * step(-0.07, tq.x) * step(abs(tq.y), (-tq.x) * 0.9);
            m = max(m, max(body, tail));
          }
        }
        return m;
      }
      void main() {
        vec2 PX = vec2(16.0, 8.0);
        vec2 cell = floor(vW.xy * PX);
        vec2 pc = (cell + 0.5) / PX;
        float x = pc.x, y = pc.y;
        float edgeD = uHalfW - abs(x);
        if (edgeD < 0.0) discard;
        vec4 pr = texture2D(uProf, vec2((x - uProfX.x) * uProfX.y, 0.5));
        float g = pr.r, veg = pr.g, rocky = pr.b;
        float be = clamp(uBevel - edgeD, 0.0, uBevel);
        float bev = -(uBevel - sqrt(max(0.0, uBevel * uBevel - be * be)));
        float wt = dWaveH(vec2(x, uCapZ)) * smoothstep(0.0, uBevel, edgeD) + bev;
        float top = max(g, wt);
        if (y > top) discard;
        // the slab's lower edge is rounded too
        float be2 = clamp(uBevel - edgeD, 0.0, uBevel);
        if (y < uBottom + uBevel && be2 > 0.0) { float dy = uBottom + uBevel - y; if (dy * dy + be2 * be2 > uBevel * uBevel) discard; }
        float b = dBayer(cell);
        vec3 col; float alpha = 1.0;
        if (y > g) {
          // ---- water: stepped bands, drifting light shafts, motes, a bright meniscus
          float d = wt - y;
          float k = clamp(d / 3.6, 0.0, 1.0);
          float kq = floor(k * 7.0 + b * 0.95) / 7.0;
          col = kq < 0.5 ? mix(uW0, uW1, kq * 2.0) : mix(uW1, uW2, kq * 2.0 - 1.0);
          float sx = x + y * 0.45 + uDTime * 0.06;
          float sh = dNoise(vec2(sx * 1.1, 3.0)) * 0.7 + dNoise(vec2(sx * 3.1, 9.0)) * 0.3;
          col += uW0 * smoothstep(0.58, 0.78, sh) * (1.0 - k) * 0.4;
          float mt = dHash(cell + vec2(0.0, floor(uDTime * 3.0 - cell.x * 0.37)));
          col = mix(col, uW0 * 1.5 + 0.2, step(0.994, mt) * (1.0 - k * 0.6));
          if (uDNight > 0.01) col += uPlankC * step(0.993, dHash(cell * 1.7 + 3.0)) * (0.5 + 0.5 * sin(uDTime * 2.0 + cell.x)) * uDNight * 1.5;
          float kp = kelpAt(x, y, g, wt);
          col = mix(col, uKelpC * (0.75 + 0.35 * k), kp * 0.85);
          float fs = fishAt(x, y, wt, g);
          col = mix(col, uFishC, fs * 0.8 * (1.0 - kp));
          if (d < 1.2 / PX.y) col = mix(col, uFoamC, 0.8);
          else if (d < 2.2 / PX.y) col = mix(col, uW2, 0.25);
          col *= mix(0.78, 1.0, smoothstep(0.0, 0.5, y - g));
          alpha = mix(0.5, 0.92, k * k);
          alpha = max(alpha, max(kp, fs) * 0.9);
        } else {
          // ---- ground: seabed sand / island soil on top, wavy sediment strata, ore voxels, bedrock
          float dd = g - y;
          float n = dNoise(vec2(x * 1.4, y * 2.2 + 7.0));
          float lay = y + 0.2 * sin(x * 0.55 + 1.3) + 0.13 * sin(x * 1.7 + 4.1) + (n - 0.5) * 0.16;
          float band = floor(lay / 0.6 + (b - 0.5) * 0.25);
          float bi = mod(band, 4.0);
          col = bi < 0.5 ? uS0 : bi < 1.5 ? uS1 : bi < 2.5 ? uS2 : uS3;
          // grain + pebbles
          float gr = dHash(cell * 1.13);
          col *= 0.93 + 0.12 * gr;
          if (gr > 0.93) col *= 1.18; else if (gr < 0.05) col *= 0.7;
          col *= mix(1.0, 0.58, clamp((-y - 0.5) / (-uBottom - 0.5), 0.0, 1.0));
          float sandT = 0.2 + 0.12 * dNoise(vec2(x * 2.1, 3.0));
          if (g > 0.02) {
            float soilT = 0.28 + 0.1 * dNoise(vec2(x * 3.0, 5.0));
            if (dd < 1.5 / PX.y && veg > 0.35 && rocky < 0.6) col = uGrass * (0.95 + 0.15 * step(0.5, dHash(cell)));
            else if (rocky > 0.55 && dd < g + 0.25) col = uRockC * (0.85 + 0.25 * dNoise(cell * 0.5)) * (dd < 1.5 / PX.y ? 1.15 : 1.0);
            else if (dd < soilT && veg > 0.35) col = uSoil * (0.9 + 0.2 * dHash(cell + 3.0));
            else if (dd < soilT + 0.25 || y > -0.1) col = mix(uSand, uSandD, clamp(dd / (g + 0.4), 0.0, 1.0)) * (0.92 + 0.12 * dHash(cell + 1.0));
          } else if (dd < sandT) {
            float t = floor(dd / sandT * 3.0 + b) / 3.0;
            col = mix(uSand, uSandD, t);
            if (dHash(cell + 11.0) > 0.96) col = uSandD * 0.75;
          }
          // ore voxels (2x2 cells) with a lit corner + a dark corner
          vec2 oc = floor(cell / 2.0);
          float oh = dHash(oc + 17.31);
          if (dd > sandT + 0.25 && oh > 0.972) {
            float which = dHash(oc + 3.7);
            vec3 ore = which < 0.4 ? uOre0 : which < 0.75 ? uOre1 : uOre2;
            vec2 sub = cell - oc * 2.0;
            col = ore * (sub.x < 0.5 && sub.y > 0.5 ? 1.45 : sub.x > 0.5 && sub.y < 0.5 ? 0.6 : 1.0);
            col += ore * uDNight * 0.9;
          }
          if (y < uBottom + 0.45 + n * 0.3) col = uBedrock * (0.9 + 0.2 * gr);
        }
        // a wreck caught in the cut
        if (uWrN > 0.5) {
          vec2 wk = wreckAt(x, y);
          if (wk.x > 0.5) {
            alpha = 1.0;
            if (wk.x < 1.5) {
              float seam = step(0.8, fract(y * 12.0));
              col = mix(vec3(0.36, 0.25, 0.17), vec3(0.22, 0.15, 0.11), seam) * (0.85 + 0.25 * dHash(cell));
              if (dHash(cell * 1.31) > 0.93) col = mix(col, vec3(0.55, 0.62, 0.5), 0.6);
            } else {
              col = uW2 * 0.42 + vec3(0.01, 0.015, 0.02);
              if (wk.y < 0.22 && dHash(floor(cell / 2.0) + 7.7) > 0.7) col = mix(uOre0, vec3(1.0, 0.95, 0.6), step(0.8, dHash(cell)));
              if (dHash(cell + floor(uDTime * 2.0)) > 0.995) col += 0.35;
            }
          }
        }
        // crafted outline around the slab face
        if (y < uBottom + 1.0 / PX.y || edgeD < 1.0 / PX.x) col *= 0.42;
        gl_FragColor = vec4(col * uLight, alpha);
      }`,
  });
}

// ------------------------------------------------------------------ slab walls (only seen through the bevel / at grazing angles)
export function wallMaterial(deep: THREE.Color, rock: THREE.Color, seabed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...DIO, uDeep: { value: deep }, uRock: { value: rock }, uSeabed: { value: seabed } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${DIO_GLSL}
      uniform vec3 uDeep; uniform vec3 uRock; uniform float uSeabed; varying vec3 vW;
      void main() {
        if (vW.z > uDCutZ) discard;
        float k = clamp(-vW.y / 4.0, 0.0, 1.0);
        vec3 c = vW.y > uSeabed ? uDeep * (1.0 - k * 0.5) : uRock * (0.7 + 0.3 * dNoise(floor(vW.xy * vec2(16.0, 8.0)) * 0.3));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ current ribbons
export const RIBBON = { uHover: { value: -1 }, uRide: { value: -1 }, uRideT: { value: 0 } };
export function ribbonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...DIO, ...RIBBON },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `${DIO_GLSL}
      attribute float aState; attribute float aLen; attribute float aId;
      uniform float uHover;
      varying vec2 vUv; varying float vState; varying float vLen; varying vec3 vW; varying float vHi; varying float vId;
      void main() {
        vec3 p = position;
        p.y = dWaveH(p.xz) + 0.014;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz; vUv = uv; vState = aState; vLen = aLen; vId = aId;
        vHi = abs(aId - uHover) < 0.5 ? 1.0 : 0.0;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `${DIO_GLSL}
      uniform float uRide; uniform float uRideT;
      varying vec2 vUv; varying float vState; varying float vLen; varying vec3 vW; varying float vHi; varying float vId;
      void main() {
        if (vW.z > uDCutZ) discard;
        float u = vUv.x, v = vUv.y;
        // pixel grid in ribbon space
        float cu = (floor(u * 10.0) + 0.5) / 10.0;
        float cv = (floor(v * 20.0) + 0.5) / 20.0;
        float across = abs(cu - 0.5) * 2.0;
        float endA = smoothstep(0.0, 0.4, cv) * (1.0 - smoothstep(vLen - 0.4, vLen, cv));
        vec3 band, chc; float bandA, chA, speed, glow;
        bool dots = false;
        if (vState < 0.5) { band = vec3(0.02, 0.16, 0.3); bandA = 0.16; chc = vec3(0.9, 0.98, 1.0); chA = 0.75; speed = 0.25; glow = 0.0; dots = true; }
        else if (vState < 1.5) { band = vec3(0.05, 0.42, 0.6); bandA = 0.5; chc = vec3(0.8, 1.0, 0.96); chA = 1.0; speed = 0.85; glow = 0.9; }
        else if (vState < 2.5) { band = vec3(0.3, 0.17, 0.04); bandA = 0.22; chc = vec3(1.0, 0.86, 0.45); chA = 0.95; speed = 0.3; glow = 0.35; dots = true; }
        else { band = vec3(0.04, 0.2, 0.3); bandA = 0.2; chc = vec3(0.8, 0.95, 1.0); chA = 0.35; speed = 0.3; glow = 0.0; }
        if (vHi > 0.5) { bandA += 0.15; glow += 1.1; speed *= 1.7; chA = 1.0; dots = false; }
        float flow = cv * 1.25 - uDTime * speed - across * 0.5;
        float chev = step(fract(flow), 0.24) * step(across, 0.8);
        float streak = step(0.8, dNoise(vec2(floor(u * 10.0) * 1.9 + vId * 7.0, cv * 2.4 - uDTime * speed * 3.0))) * step(across, 0.7);
        float rimFoam = step(0.8, across) * step(across, 0.98) * step(0.45, dNoise(vec2(cv * 6.0 - uDTime * speed * 2.0, u * 3.0 + vId)));
        if (dots) {
          // a quiet dotted trail, like an ink route on a sea chart
          float fd = fract(cv * 2.4 - uDTime * speed);
          chev = step(fd, 0.26) * step(across, 0.22);
          streak = 0.0; rimFoam = 0.0;
        }
        float bodyA = bandA * (1.0 - across * across * 0.6) * step(across, 0.98);
        float fA = max(chev * chA, max(streak * chA * 0.55, rimFoam * 0.55));
        vec3 col = mix(band, chc, clamp(fA / max(fA + bodyA, 0.001) * 1.4, 0.0, 1.0));
        float a = (bodyA + fA * (1.0 - bodyA)) * endA;
        // the stretch the token has already ridden fades to a soft trail
        if (abs(vId - uRide) < 0.5) { float past = step(cv, uRideT * vLen); a *= mix(1.0, 0.4, past); glow += (1.0 - past) * 0.9; }
        gl_FragColor = vec4(col * (1.0 + glow * fA), clamp(a, 0.0, 1.0));
      }`,
  });
}

// ------------------------------------------------------------------ boat wakes (one dynamic strip per boat)
export function wakeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...DIO },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `${DIO_GLSL}
      attribute vec2 aWake; // age 0..1, side -1..1
      varying vec2 vWk; varying vec3 vW;
      void main() { vec3 p = position; p.y = dWaveH(p.xz) + 0.01; vWk = aWake; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${DIO_GLSL}
      varying vec2 vWk; varying vec3 vW;
      void main() {
        if (vW.z > uDCutZ) discard;
        float age = vWk.x, s = abs(vWk.y);
        vec2 px = floor(vW.xz * 24.0);
        float n = dNoise(px * 0.45 + uDTime * 1.5);
        float edge = step(0.62 - age * 0.25, s) * step(s, 1.0);
        float core = step(s, 0.28) * (1.0 - age) * step(0.45, n);
        float f = max(edge * step(0.32 + age * 0.4, n), core);
        float a = f * (1.0 - age) * (1.0 - age) * 0.85;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(0.95, 1.0, 1.0) * (1.0 + uDNight * 0.4), a);
      }`,
  });
}

// ------------------------------------------------------------------ glow ring on the water (available nodes, the boss)
export function glowRingMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...DIO, uCol: { value: color }, uK: { value: 1 }, uPh: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `${DIO_GLSL} varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0); w.y = dWaveH(w.xz) + 0.018; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${DIO_GLSL}
      uniform vec3 uCol; uniform float uK; uniform float uPh; varying vec2 vUv; varying vec3 vW;
      void main() {
        if (vW.z > uDCutZ) discard;
        vec2 q = floor((vUv - 0.5) * 48.0) + 0.5;
        float r = length(q) / 24.0;
        float t = fract(uDTime * 0.55 + uPh);
        float ring = step(abs(r - (0.35 + t * 0.6)), 0.035) * (1.0 - t);
        float ring2 = step(abs(r - (0.35 + fract(t + 0.5) * 0.6)), 0.03) * (1.0 - fract(t + 0.5));
        float halo = (1.0 - smoothstep(0.25, 0.75, r)) * 0.18;
        float a = (ring + ring2) * 0.85 + halo;
        gl_FragColor = vec4(uCol * a * uK, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ additive light beam (lighthouse / boss searchlights)
export function beamMaterial(color: THREE.Color, strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...DIO, uCol: { value: color }, uK: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${DIO_GLSL}
      uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() {
        if (vW.z > uDCutZ) discard;
        float along = vUv.y;
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float a = (1.0 - along) * (1.0 - along) * edge * (0.75 + 0.25 * dNoise(vec2(along * 8.0 - uDTime, vUv.x * 6.0)));
        gl_FragColor = vec4(uCol * a * uK, 1.0);
      }`,
  });
}
