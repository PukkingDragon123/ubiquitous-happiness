// The water surface as seen in the cross-section ocean: a receding sheet from the front cut (z = FRONT_Z) back
// to the horizon, displaced by the Gerstner swell, the GPU ripple field and the 1D gameplay-plane sim.
// Seen from below it does real optics: a Snell's window (refracted sky, a bright chromatic rim at the critical
// angle) and total internal reflection beyond it (the silvery mirror you see in aquariums). From above it
// reflects the sky with Fresnel and lets the water body show through. Plus cel-stepped foam on crests and
// churned water, sun glints, and a bright meniscus line along the front cut.
import * as THREE from 'three';
import { UW } from '../shaders/underwater';
import { SKY, SKY_GLSL, NOISE_GLSL } from '../sky';
import { SWELL_GLSL } from './sim';

export const FRONT_Z = 3;

export const SURF = {
  uSwell: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uRip: { value: null as THREE.Texture | null },
  uRipBox: { value: new THREE.Vector4(-32, -26, 64, 32) }, // x0, z0, W, D
  uLift: { value: null as THREE.Texture | null },
  uLiftBox: { value: new THREE.Vector2(-45, 90) },          // x0, W
  uCenterX: { value: 0 },
  uShallow: { value: new THREE.Color('#1fa5c4') },
  uDeep: { value: new THREE.Color('#0b4f7a') },
  uTir: { value: new THREE.Color('#2a8fb0') },
  uFoamCol: { value: new THREE.Color('#f4ffff') },
};

const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uRip; uniform vec4 uRipBox; uniform sampler2D uLift; uniform vec2 uLiftBox; uniform float uTime;
${SWELL_GLSL}
float ripAt(vec2 p) {
  vec2 uv = (p - uRipBox.xy) / uRipBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uRip, uv).r;
}
vec2 liftAt(float x) {
  float u = (x - uLiftBox.x) / uLiftBox.y;
  if (u < 0.0 || u > 1.0) return vec2(0.0);
  return texture2D(uLift, vec2(u, 0.5)).rg;
}
float surfH(vec2 p) {
  float near = exp(-abs(p.y) * 0.35);
  return swellAt(p, uTime).y + ripAt(p) + liftAt(p.x).r * near;
}
`;

export function makeSurface(): { sheet: THREE.Mesh; lip: THREE.Mesh; update: (cx: number) => void } {
  // non-uniform grid: dense near the gameplay plane, sparse toward the horizon
  const nx = 320, nz = 110, W = 110;
  const zs: number[] = [];
  for (let j = 0; j <= nz; j++) { const t = j / nz; zs.push(FRONT_Z - Math.pow(t, 2.2) * 160); }
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) pos.push(-W / 2 + (i / nx) * W, 0, zs[j]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);

  const mat = new THREE.ShaderMaterial({
    uniforms: { ...SURF, ...SKY, uTime: UW.uTime, uSunDir: UW.uSunDir },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uCenterX;
      ${HEIGHT_GLSL}
      varying vec3 vWorld; varying vec2 vBase;
      void main() {
        vec2 p = vec2(position.x + uCenterX, position.z);
        vec3 sw = swellAt(p, uTime);
        float near = exp(-abs(p.y) * 0.35);
        float h = sw.y + ripAt(p) + liftAt(p.x).r * near;
        vec3 wp = vec3(p.x + sw.x, h, p.y + sw.z);
        vWorld = wp; vBase = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      ${HEIGHT_GLSL}
      ${SKY_GLSL}
      uniform vec3 uSunDir; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uTir; uniform vec3 uFoamCol;
      varying vec3 vWorld; varying vec2 vBase;
      void main() {
        vec2 p = vBase;
        float dist = length(vWorld - cameraPosition);
        float e = clamp(dist * 0.006, 0.04, 0.5);
        float hx = (surfH(p + vec2(e, 0.0)) - surfH(p - vec2(e, 0.0))) / (2.0 * e);
        float hz = (surfH(p + vec2(0.0, e)) - surfH(p - vec2(0.0, e))) / (2.0 * e);
        // wind chop micro-normals (fade with distance so the horizon doesn't sparkle-alias)
        float ch = exp(-dist * 0.02) * 0.35;
        vec2 q = p * 2.2 + vec2(uTime * 0.35, uTime * 0.2);
        float n0 = vnoise(q), n1 = vnoise(q + vec2(0.07, 0.0)), n2 = vnoise(q + vec2(0.0, 0.07));
        hx += (n1 - n0) / 0.07 * ch * 0.06; hz += (n2 - n0) / 0.07 * ch * 0.06;
        vec3 N = normalize(vec3(-hx, 1.0, -hz));
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 col; float a;
        // foam: crests, churned ripples, the gameplay-plane sim's foam; cel-stepped with a noise edge
        vec2 lf = liftAt(p.x);
        float rip = ripAt(p);
        float foam = lf.g * exp(-abs(p.y) * 0.5) + smoothstep(0.08, 0.25, abs(rip)) * 0.7;
        float fn = fbm2(p * 3.0 + uTime * 0.1);
        float foamMask = step(0.75, foam * 0.9 + fn * 0.45) * exp(-dist * 0.01);
        if (!gl_FrontFacing) {
          // seen from below
          vec3 Nd = -N;
          float cosi = clamp(dot(-V, Nd), 0.0, 1.0);
          vec3 T = refract(V, Nd, 1.333);
          if (dot(T, T) < 1e-4) {
            // total internal reflection: the mirror reflects the water body below (lit from above)
            float shimmer = vnoise(p * 1.5 + uTime * 0.25);
            col = uTir * (0.75 + 0.35 * shimmer) + vec3(0.05, 0.1, 0.12) * pow(1.0 - cosi, 6.0);
            a = 0.97;
          } else {
            float cost = clamp(dot(T, -Nd), 0.0, 1.0);
            float rs = (1.333 * cosi - cost) / (1.333 * cosi + cost), rp = (cosi - 1.333 * cost) / (cosi + 1.333 * cost);
            float F = clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
            vec3 sky = skyCol(T, uTime);
            // Snell's window: refracted sky with a bright, slightly chromatic rim near the critical angle
            float rim = smoothstep(0.55, 0.98, F);
            vec3 rimCol = mix(vec3(0.6, 1.0, 1.0), vec3(1.0, 0.85, 0.7), fract(F * 3.0)) * rim * 0.45;
            col = mix(sky * 1.05 + rimCol, uTir, F);
            a = mix(0.38, 0.97, F);
          }
          col = mix(col, uFoamCol * 0.85, foamMask * 0.6);
          a = max(a, foamMask * 0.7);
        } else {
          // seen from above
          float cosv = clamp(dot(-V, N), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
          vec3 R = reflect(V, N);
          vec3 sky = skyCol(R, uTime);
          vec3 body = mix(uShallow, uDeep, clamp(dist * 0.012, 0.0, 1.0));
          col = mix(body, sky, F);
          float spec = pow(max(dot(R, uSunAir), 0.0), 380.0);
          col += uSunCol * spec * 6.0;
          col = mix(col, uFoamCol, foamMask * 0.85);
          a = mix(0.62, 1.0, max(F, foamMask));
        }
        gl_FragColor = vec4(col, a);
      }`,
  });
  const sheet = new THREE.Mesh(geo, mat);
  sheet.frustumCulled = false;
  sheet.renderOrder = 10;
  sheet.name = 'waterSheet';

  // the meniscus lip: a thin bright ribbon along the front cut where the surface meets the cross-section
  const ln = 600;
  const lp: number[] = [], li: number[] = [], lv: number[] = [];
  for (let i = 0; i <= ln; i++) { const x = -W / 2 + (i / ln) * W; lp.push(x, 0, FRONT_Z, x, 0, FRONT_Z); lv.push(0, 1); }
  for (let i = 0; i < ln; i++) { const a = i * 2; li.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute('side', new THREE.Float32BufferAttribute(lv, 1));
  lg.setIndex(li);
  const lmat = new THREE.ShaderMaterial({
    uniforms: { ...SURF, uTime: UW.uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uCenterX;
      ${HEIGHT_GLSL}
      attribute float side; varying float vSide; varying float vFoam;
      void main() {
        vec2 p = vec2(position.x + uCenterX, position.z);
        vec3 sw = swellAt(p, uTime);
        float h = sw.y + ripAt(p) + liftAt(p.x).r;
        vFoam = liftAt(p.x).g;
        vSide = side;
        vec3 wp = vec3(p.x + sw.x, h - side * 0.09, p.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vSide; varying float vFoam;
      void main() {
        float k = pow(1.0 - vSide, 2.5);
        gl_FragColor = vec4(vec3(0.75, 0.97, 1.0) * (k * 1.1 + vFoam * 0.6), 1.0);
      }`,
  });
  const lip = new THREE.Mesh(lg, lmat);
  lip.frustumCulled = false;
  lip.renderOrder = 11;
  lip.name = 'waterLip';

  const step = W / nx;
  const update = (cx: number) => { SURF.uCenterX.value = Math.round(cx / step) * step; };
  return { sheet, lip, update };
}
