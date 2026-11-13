// Blobfish v2 body shape: the side profile, a low-poly surface parametrisation shared by the body loft, the
// armour shells and the gear anchors, the soft-body outline, and the vertex-shader patch that bends every
// skin-tight mesh (body, face decal, nose, armour) with the 2D soft body.
//
// Body space: +x nose, +y up, +z toward the camera (the blobfish's right side). u runs around the body:
// 0 = belly, 0.25 = +z side, 0.5 = back, 0.75 = -z side. t runs along it: 0 = tail tip, 1 = face.
import * as THREE from 'three';
import { clamp01, smooth, TAU } from '../core/math';
import type { V3 } from '../gfx/loft';

export const SB_N = 18;
/** low-poly resolution: sides around the body */
export const NS = 10;
/** ring positions along the body: few, so the facets read (PS2 blocky); one sits on the neck crease */
export const RINGS = [0.03, 0.12, 0.24, 0.38, 0.5, 0.6, 0.68, 0.78, 0.87, 0.94, 0.985];

// ------------------------------------------------------------------ profile (t: 0 tail .. 1 front)
// Psychrolutes marcidus: a huge fat gelatinous head that is most of the fish, sagging jowls, a quick taper into a
// slim tail stalk with a small fan. The head is wider than tall; the lower face hangs below the chin line.
const KT = [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.76, 0.86, 0.93, 0.975, 1];
const KTOP = [0.035, 0.08, 0.15, 0.25, 0.34, 0.41, 0.44, 0.44, 0.40, 0.31, 0.1];
const KBOT = [0.035, 0.07, 0.13, 0.22, 0.31, 0.38, 0.43, 0.45, 0.44, 0.37, 0.12];
const KWID = [0.025, 0.07, 0.14, 0.25, 0.36, 0.45, 0.5, 0.51, 0.48, 0.39, 0.12];
const KCY = [0.04, 0.03, 0.02, 0.01, 0.0, -0.01, -0.03, -0.05, -0.065, -0.08, -0.09];
const X0 = -0.62, XL = 1.12;
function interp(keys: number[], t: number) {
  t = clamp01(t);
  let i = 0; while (i < KT.length - 2 && t > KT[i + 1]) i++;
  const t0 = KT[i], t1 = KT[i + 1], k = (t - t0) / (t1 - t0);
  const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(keys.length - 1, i + 2)];
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * (2 * p1 + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
}
export const prof = (t: number) => ({ x: X0 + XL * t, top: interp(KTOP, t), bot: interp(KBOT, t), wid: interp(KWID, t), cy: interp(KCY, t) });

/**
 * A point on the (smooth) body surface at length t, around-angle u (0 belly .. 0.5 back), pushed `out` metres
 * along the outward normal of the cross-section. The low-poly body samples exactly this function.
 */
export function bodyPoint(t: number, u: number, out = 0): V3 {
  const p = prof(t);
  const ang = u * TAU;
  const s = Math.sin(ang), c = -Math.cos(ang);
  // jowls: the lower front cheeks sag and bulge out (fat, gelatinous)
  const jowl = c < 0 ? 1 + smooth(0.62, 0.9, t) * smooth(0.0, -0.75, c) * 0.13 : 1;
  // neck crease: loose skin folds in behind the head (top and flanks)
  const crease = 1 - Math.exp(-((t - 0.6) ** 2) / (2 * 0.028 ** 2)) * smooth(-0.4, 0.3, c) * 0.06;
  const ry = (c >= 0 ? p.top : p.bot * jowl) * crease;
  const e = c >= 0 ? 2 / 2.15 : 2 / 2.6; // fleshy round back, flat sagging belly
  const ex = Math.sign(s) * Math.pow(Math.abs(s), e), ey = Math.sign(c) * Math.pow(Math.abs(c), e);
  const wz = p.wid * jowl * crease;
  const y = p.cy + ey * ry, z = ex * wz;
  if (!out) return [p.x, y, z];
  // approximate outward normal of the ellipse in the ring plane, tipped forward/back by the profile slope
  let ny = (y - p.cy) / (ry * ry || 1e-6), nz = z / (wz * wz || 1e-6);
  const l = Math.hypot(ny, nz) || 1; ny /= l; nz /= l;
  const dt = 0.01, a = prof(Math.max(0, t - dt)), b = prof(Math.min(1, t + dt));
  const slope = -((b.top + b.wid) - (a.top + a.wid)) / 2 / (b.x - a.x || 1e-6);
  const nx = Math.max(-0.9, Math.min(0.9, slope * 0.6));
  const k = Math.hypot(nx, 1);
  return [p.x + (nx / k) * out, y + (ny / k) * out, z + (nz / k) * out];
}
export const bodyVec = (t: number, u: number, out = 0) => new THREE.Vector3(...bodyPoint(t, u, out));

/** body-space front centre the face is projected from */
export const FACE_C = new THREE.Vector3(0.06, -0.03, 0);

// ------------------------------------------------------------------ soft-body outline (side profile)
export const SB_CENTER = new THREE.Vector2(-0.02, -0.02);
const outlinePoly: [number, number][] = (() => {
  const top: [number, number][] = [], bot: [number, number][] = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, p = prof(t); top.push([p.x, p.cy + p.top]); bot.push([p.x, p.cy - p.bot]); }
  // the droopy nose bulges the front of the outline
  const nose: [number, number][] = [[0.56, 0.06], [0.68, -0.08], [0.69, -0.27], [0.56, -0.35]];
  return [...top, ...nose, ...bot.reverse()];
})();
export function outlineAt(a: number): { x: number; y: number } {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = 0;
  for (let i = 0; i < outlinePoly.length; i++) {
    const [x1, y1] = outlinePoly[i], [x2, y2] = outlinePoly[(i + 1) % outlinePoly.length];
    const ex = x2 - x1, ey = y2 - y1, ox = x1 - SB_CENTER.x, oy = y1 - SB_CENTER.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ox * ey - oy * ex) / den, u = (ox * dy - oy * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
  }
  return { x: dx * best, y: dy * best };
}

/** per-vertex soft-body binding: ring index, blend, radial weight */
export function addSB(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - SB_CENTER.x, y = pos.getY(i) - SB_CENTER.y;
    let ang = Math.atan2(y, x); if (ang < 0) ang += TAU;
    const f = (ang / TAU) * SB_N, i0 = Math.floor(f) % SB_N;
    const o = outlineAt(ang);
    const R = Math.hypot(o.x, o.y) || 1;
    a[i * 3] = i0; a[i * 3 + 1] = f - Math.floor(f); a[i * 3 + 2] = Math.min(1.15, Math.hypot(x, y) / R);
  }
  geo.setAttribute('aSB', new THREE.BufferAttribute(a, 3));
  return geo;
}
/** the angle (around SB_CENTER) a body-space point sits at, for sampling the soft body's displacement */
export const sbAngle = (p: { x: number; y: number }) => Math.atan2(p.y - SB_CENTER.y, p.x - SB_CENTER.x);

// ------------------------------------------------------------------ shader patch: soft-body bend + effects
export interface BlobUniforms {
  uSB: { value: THREE.Vector2[] }; uFlash: { value: number }; uRock: { value: number }; uBloat: { value: number };
  uWag: { value: number }; uWagAmp: { value: number }; uRockMap: { value: THREE.Texture | null }; uGlow: { value: THREE.Color }; uSqueeze: { value: number };
  uFlashCol: { value: THREE.Color }; uFade: { value: number };
}
export function makeBlobUniforms(rock: THREE.Texture | null): BlobUniforms {
  return {
    uSB: { value: Array.from({ length: SB_N }, () => new THREE.Vector2()) },
    uFlash: { value: 0 }, uRock: { value: 0 }, uBloat: { value: 0 }, uWag: { value: 0 }, uWagAmp: { value: 0.04 },
    uRockMap: { value: rock }, uGlow: { value: new THREE.Color(0, 0, 0) }, uSqueeze: { value: 0 },
    uFlashCol: { value: new THREE.Color(1, 0.95, 0.95) }, uFade: { value: 1 },
  };
}

/**
 * Patch a lit material: `bend` meshes carry the aSB attribute and follow the soft body (plus the decompression
 * sag, tail wag and cheek squeeze); `rock` lets Rock Body spread stone over it; every patched mesh flashes.
 */
export function patchBlob(mat: THREE.Material, U: BlobUniforms, o: { bend?: boolean; rock?: boolean; key?: string } = {}) {
  const bend = !!o.bend, rock = !!o.rock && !!U.uRockMap.value;
  // idempotent: a material shared by several gear meshes is patched once
  if (mat.userData.blobPatched) return mat;
  mat.userData.blobPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec2 uSB[${SB_N}]; uniform float uBloat; uniform float uWag; uniform float uWagAmp; uniform float uSqueeze;
        ${bend ? 'attribute vec3 aSB;' : ''} varying vec3 vObj;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObj = position;
        ${bend ? `
        {
          int i0 = int(aSB.x); int i1 = (i0 + 1) % ${SB_N};
          vec2 d = mix(uSB[i0], uSB[i1], aSB.y) * aSB.z;
          transformed.xy += d;
          // decompression sag: the lower half droops and spreads (the classic out-of-water blobfish look)
          float below = clamp(-(position.y + 0.05) * 3.0, 0.0, 1.0);
          transformed.y -= uBloat * (0.05 + below * 0.1) * (0.5 + 0.5 * clamp(position.x + 0.3, 0.0, 1.0));
          transformed.z *= 1.0 + uBloat * 0.18 * below;
          // tail wag (stronger toward the tail)
          float tail = clamp((0.15 - position.x) / 0.8, 0.0, 1.0);
          transformed.z += sin(uWag - position.x * 5.0) * uWagAmp * tail * tail;
          transformed.y += sin(uWag * 0.5 - position.x * 3.0) * uWagAmp * 0.3 * tail;
          // squeeze (strain): the cheeks puff out
          transformed.z *= 1.0 + uSqueeze * 0.1 * clamp(position.x + 0.2, 0.0, 1.0);
        }` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uFlash; uniform vec3 uFlashCol; uniform float uRock; uniform sampler2D uRockMap; uniform vec3 uGlow; varying vec3 vObj;
        float bhash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${rock ? `{
          // Rock Body: stone spreads over the skin from the centre with a pixel dither edge
          vec2 rq = floor(vObj.xz * 40.0 + vObj.y * 20.0);
          float edge = uRock * 1.6 - length(vObj) * 1.8 + (bhash(rq) - 0.5) * 0.35;
          vec3 stone = texture2D(uRockMap, vObj.xz * 1.6 + vObj.yx * 0.9).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, stone, step(0.0, edge));
        }` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uFlashCol * uFlash + uGlow;`);
    if (rock) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, step(0.0, uRock * 1.6 - length(vObj) * 1.8));`);
  };
  const pk = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => pk() + 'blob2' + (bend ? 'B' : '') + (rock ? 'R' : '') + (o.key ?? '');
  return mat;
}
