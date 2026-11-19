// v4 "low poly, rich pixel texture" kit shared by the loot models and the 3D UI objects.
//
//   ramp('#c8902a')                 6 hand-picked-looking tones from one colour: hue-shifted (cool purple shadows,
//                                   warm yellow lights), the way a pixel artist builds a ramp, not a brightness scale
//   pagePainted('#c8902a', 'metal') a 64 px pixel page for a flat colour: bevelled face edges (every box face and
//                                   cylinder band gets a lit top-left edge and a shaded bottom-right edge), deliberate
//                                   wear (scratches, chips, a polished band), no random speckle
//   pixelShade(mat)                 a material patch: diffuse light quantised into 4 bands mapped onto the hue-
//                                   shifted ramp, specular cut to hard pixel glints. Faceted low-poly + this =
//                                   the hand-painted pixel-art look on any lit object.
import * as THREE from 'three';
import { chainKey } from '../../gfx/retro';

type RGB = [number, number, number];
const hexRGB = (c: string): RGB => { const s = c.replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((ch) => ch + ch).join('') : s.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: RGB) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function rgb2hsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** move a hue toward a target hue by up to `amt` degrees */
const hueToward = (h: number, target: number, amt: number) => { let d = ((target - h + 540) % 360) - 180; d = Math.max(-amt, Math.min(amt, d)); return h + d; };

const rampCache = new Map<string, string[]>();
/** six tones, dark to light: [ink, shadow, mid-shadow, base, light, highlight] */
export function ramp(c: string): string[] {
  let r = rampCache.get(c);
  if (r) return r;
  const [h, s, l] = rgb2hsl(hexRGB(c));
  const sat = (k: number) => Math.min(1, s * k);
  r = [
    hsl2rgb([hueToward(h, 250, 28), sat(0.9), Math.max(0.05, l * 0.32)]),
    hsl2rgb([hueToward(h, 250, 18), sat(0.95), l * 0.55]),
    hsl2rgb([hueToward(h, 250, 8), s, l * 0.78]),
    hsl2rgb([h, s, l]),
    hsl2rgb([hueToward(h, 55, 10), sat(0.95), l + (1 - l) * 0.3]),
    hsl2rgb([hueToward(h, 55, 18), sat(0.7), l + (1 - l) * 0.62]),
  ].map(toHex);
  rampCache.set(c, r);
  return r;
}

export type PageKind = 'matte' | 'metal' | 'soft' | 'wood' | 'enamel';
const pageCache = new Map<string, THREE.CanvasTexture>();
/**
 * a 64 px pixel page for a flat-coloured part. UV 0..1 spans one face of a box / one band of a cylinder, so the
 * bevel reads as a lit edge on every facet. Detail is placed by rule (fixed scratch strokes, edge chips), never noise.
 */
export function pagePainted(c: string, kind: PageKind = 'matte', size = 64): THREE.CanvasTexture {
  const key = `${c}|${kind}|${size}`;
  let t = pageCache.get(key);
  if (t) return t;
  const S = size, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  const R = ramp(c);
  const f = (px: number, py: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  f(0, 0, S, S, R[3]);
  if (kind === 'metal') {
    // brushed bands, a diagonal polished stripe, engraved hairlines, scratches
    for (let y = 0; y < S; y += 4) f(0, y, S, 2, y % 8 === 0 ? R[3] : R[2]);
    for (let i = 0; i < S * 2; i++) { const px = i - S * 0.4, py = i * 0.5; if (px >= 0 && px < S) { f(Math.round(px), Math.round(S - 1 - py), 6, 1, R[4]); f(Math.round(px) + 2, Math.round(S - 1 - py), 2, 1, R[5]); } }
    for (const [sx, sy, l] of [[10, 18, 9], [38, 30, 7], [22, 46, 11], [46, 12, 6]]) { f(sx, sy, l, 1, R[5]); f(sx + 1, sy + 1, l - 2, 1, R[1]); }
  } else if (kind === 'wood') {
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx += 1) {
      const g = Math.sin(y * 0.55 + Math.sin(xx * 0.09 + y * 0.2) * 1.8);
      if (g > 0.82) f(xx, y, 1, 1, R[2]); else if (g < -0.9) f(xx, y, 1, 1, R[4]);
    }
    for (const [kx, ky] of [[20, 22], [46, 44]]) { f(kx - 3, ky - 1, 7, 3, R[1]); f(kx - 2, ky, 5, 1, R[0]); f(kx - 4, ky - 2, 9, 1, R[2]); }
  } else if (kind === 'soft') {
    // organic: big soft lobes of the light tone with a darker underside, like hand-shaded blobs
    for (const [cx, cy, r] of [[18, 16, 9], [44, 24, 7], [26, 44, 8], [50, 50, 6]]) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
      const d = Math.hypot(xx, yy * 1.2); if (d > r) continue;
      f(cx + xx, cy + yy, 1, 1, d > r - 1.5 && yy > 0 ? R[2] : yy < -r * 0.3 && d < r * 0.6 ? R[5] : R[4]);
    }
  } else if (kind === 'enamel') {
    f(0, 0, S, S * 0.45, R[4]); f(4, 4, S * 0.3, 3, R[5]); f(4, 8, 4, 3, R[5]);
  } else {
    // matte paint / stone-ish: two deliberate scuffs and a chipped corner
    for (const [sx, sy, l] of [[12, 20, 8], [34, 40, 10]]) { f(sx, sy, l, 1, R[4]); f(sx + 2, sy + 1, l - 3, 1, R[2]); }
    f(S - 10, S - 8, 4, 2, R[1]); f(S - 9, S - 9, 2, 1, R[4]);
  }
  // the bevel every face gets: 1 px ink rim, 2 px lit top / left, 2 px shade bottom / right, a bright corner
  const e = Math.max(2, Math.round(S / 32));
  f(0, 0, S, e, R[4]); f(0, 0, e, S, R[4]);
  f(0, S - e, S, e, R[1]); f(S - e, 0, e, S, R[1]);
  f(0, 0, S, 1, R[5]); f(0, 0, 1, S, R[5]);
  f(0, S - 1, S, 1, R[0]); f(S - 1, 0, 1, S, R[0]);
  f(1, 1, e + 1, e + 1, R[5]);
  t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  pageCache.set(key, t);
  return t;
}

export interface PixelShadeOpts { bands?: number; floor?: number; specCut?: number }
const PATCH = /* glsl */ `
{
  // metals: light is measured against the de-metalled albedo but the ramp is painted in the full colour, so brass
  // stays brass-yellow (a PBR metal's diffuse is nearly black; its look lives in the hard glints below)
  vec3 pxBase = max(diffuseColor.rgb, vec3(0.004));
  vec3 pxLit = totalDiffuse / max(diffuseColor.rgb * (1.0 - metalnessFactor), vec3(0.004));
  pxBase *= mix(1.0, 0.92, metalnessFactor);
  float pxL = max(max(pxLit.r, pxLit.g), pxLit.b);
  vec3 pxHue = pxLit / max(pxL, 1e-4);
  float pxQ = max(uPxFloor, floor(pxL * uPxBands + 0.45) / uPxBands);
  float pxW = clamp((pxQ - 0.3) / 0.9, 0.0, 1.0);
  vec3 pxTint = mix(vec3(0.78, 0.83, 1.12), vec3(1.06, 1.02, 0.92), pxW);
  vec3 pxDiff = pxBase * pxQ * pxHue * pxTint;
  float pxS = max(max(totalSpecular.r, totalSpecular.g), totalSpecular.b);
  vec3 pxSpec = totalSpecular * smoothstep(uPxSpec, uPxSpec + 0.02, pxS) * 1.25 + totalSpecular * 0.15;
  outgoingLight = pxDiff + pxSpec + totalEmissiveRadiance;
}
#include <opaque_fragment>`;

/** quantised, hue-shifted ramp lighting (idempotent; composes with retro() / uw() patches) */
export function pixelShade<T extends THREE.Material>(mat: T, o: PixelShadeOpts = {}): T {
  const ud = mat.userData as Record<string, unknown>;
  if (ud.pixelShade) return mat;
  const u = { uPxBands: { value: o.bands ?? 4 }, uPxFloor: { value: o.floor ?? 0.2 }, uPxSpec: { value: o.specCut ?? 0.3 } };
  ud.pixelShade = u;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    if (!sh.fragmentShader.includes('#include <opaque_fragment>') || !sh.fragmentShader.includes('totalSpecular')) return;
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPxBands; uniform float uPxFloor; uniform float uPxSpec;')
      .replace('#include <opaque_fragment>', PATCH);
  };
  mat.customProgramCacheKey = chainKey(mat, prev, '|pxshade');
  mat.needsUpdate = true;
  return mat;
}
export function pixelShadeAll(root: THREE.Object3D, o: PixelShadeOpts = {}) {
  root.traverse((ob) => {
    const m = (ob as THREE.Mesh).material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) if (mm instanceof THREE.MeshStandardMaterial) pixelShade(mm, o);
  });
  return root;
}

const neutralCache = new Map<PageKind, THREE.CanvasTexture>();
/**
 * a GREY version of pagePainted (values 0.38 .. 1.0 around a 0.9 base), for parts whose colour is set or animated in
 * code (heart halves, liquids, flashes): the material colour keeps the hue, the page adds the bevel and the wear
 */
export function pageNeutral(kind: PageKind = 'matte'): THREE.CanvasTexture {
  let t = neutralCache.get(kind);
  if (t) return t;
  const src = pagePainted('#e6e6e6', kind);
  t = src.clone(); t.needsUpdate = true;
  neutralCache.set(kind, t);
  return t;
}

/**
 * v4 UI objects: every lit part under `root` gets the pixel treatment. Flat-coloured opaque parts get the neutral
 * pixel page (kind from metalness / roughness) on top of their own colour; everything standard gets pixelShade.
 * Cheap and idempotent: call it again after adding children.
 */
export function pixelize(root: THREE.Object3D) {
  if (root.userData.noPixel) return;
  for (const ch of root.children) pixelize(ch);
  const mesh = root as THREE.Mesh;
  if (mesh.isMesh) {
    for (const mm of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(mm instanceof THREE.MeshStandardMaterial) || mm.userData.pixelized) continue;
      mm.userData.pixelized = true;
      if (!mm.map && !mm.transparent && !mm.vertexColors) {
        mm.map = pageNeutral(mm.metalness >= 0.3 ? 'metal' : mm.roughness <= 0.3 ? 'enamel' : 'matte');
        mm.color.multiplyScalar(1.1);
        mm.needsUpdate = true;
      }
      pixelShade(mm);
    }
  }
}
