// Sky dome + the shared sky function the water surface reflects / refracts. A painterly, slightly cartoony
// sky: soft gradient, a sun with a warm halo, and banded (cel-stepped) cumulus clouds that drift.
import * as THREE from 'three';
import { UW } from './shaders/underwater';

export const SKY = {
  uSkyTop: { value: new THREE.Color('#3f86d8') },
  uSkyHorizon: { value: new THREE.Color('#bfe6f5') },
  uSeaFar: { value: new THREE.Color('#1d6f96') },
  uSunCol: { value: new THREE.Color('#fff2d6') },
  uCloudCol: { value: new THREE.Color('#ffffff') },
  uCloudShade: { value: new THREE.Color('#9ab6d6') },
  uCloudCover: { value: 0.5 },
  /** the sun as seen in the sky (in air) */
  uSunAir: { value: new THREE.Vector3(0.42, 0.4, -0.81).normalize() },
};

export const NOISE_GLSL = /* glsl */ `
float nhash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(nhash(i), nhash(i + vec2(1.0, 0.0)), u.x), mix(nhash(i + vec2(0.0, 1.0)), nhash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm2(vec2 p) { float a = 0.0, s = 0.5; for (int i = 0; i < 5; i++) { a += vnoise(p) * s; p = p * 2.03 + vec2(1.7, 9.2); s *= 0.5; } return a; }
`;

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uSeaFar; uniform vec3 uSunCol; uniform vec3 uCloudCol; uniform vec3 uCloudShade;
uniform float uCloudCover; uniform vec3 uSunAir;
vec3 skyCol(vec3 d, float t) {
  float y = d.y;
  vec3 c = mix(uSkyHorizon, uSkyTop, pow(clamp(y, 0.0, 1.0), 0.55));
  if (y < 0.0) c = mix(uSkyHorizon * 0.9, uSeaFar, clamp(-y * 7.0, 0.0, 1.0));
  float sd = max(dot(d, uSunAir), 0.0);
  c += uSunCol * (smoothstep(0.9993, 0.9996, sd) * 18.0 + pow(sd, 18.0) * 0.45 + pow(sd, 4.0) * 0.12);
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.12) * 0.9 + vec2(t * 0.006, t * 0.002);
    float n = fbm2(cp * 1.6);
    float cl = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.18, n);
    float lit = fbm2(cp * 1.6 + uSunAir.xz * 0.12) ;
    float band = floor(clamp((n - lit) * 6.0 + 0.6, 0.0, 1.0) * 3.0) / 3.0;
    vec3 cc = mix(uCloudCol, uCloudShade, band);
    cc += uSunCol * pow(sd, 6.0) * 0.4;
    c = mix(c, cc, cl * smoothstep(0.0, 0.12, y) * 0.95);
  }
  return c;
}
`;

export function makeSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...SKY, uTime: UW.uTime },
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vDir;\n${NOISE_GLSL}\n${SKY_GLSL}\nvoid main() { gl_FragColor = vec4(skyCol(normalize(vDir), uTime), 1.0); }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -1000;
  m.name = 'sky';
  return m;
}
