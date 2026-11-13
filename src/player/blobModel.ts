// The blobfish adventurer's model: a gelatinous lofted body with the famous droopy nose, glossy wet pink skin
// painted at hi-res pixel density (mottling, pores, veins, gill slit), a fully 3D expressive face (glossy eyes
// with pixel irises that look around, sliding eyelids, brows, lips that frown/grin/gasp), stubby fins, a red
// polka-dot bandana with flowing knot tails, and a frilly cocktail-toothpick sword with a cork guard.
//
// Body space: +x nose, +y up, +z toward the camera. The soft body (softbody.ts) bends the mesh in the
// vertex shader via uSB[] (outline displacement per ring point) — see patchBlob().
import * as THREE from 'three';
import { Loft, V3, Reg, usFor } from '../gfx/loft';
import { Px, ramp, hex, mix, worley, pxNoise, RGB } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { clamp01, smooth, hash2, TAU } from '../core/math';

export const SB_N = 18;
const TAIL_N = 8;

// ------------------------------------------------------------------ body profile (t: 0 tail .. 1 front)
const KT = [0, 0.12, 0.3, 0.5, 0.68, 0.82, 0.92, 0.97, 1];
const KTOP = [0.05, 0.15, 0.28, 0.37, 0.42, 0.425, 0.385, 0.29, 0.06];
const KBOT = [0.05, 0.13, 0.26, 0.35, 0.405, 0.435, 0.415, 0.345, 0.07];
const KWID = [0.04, 0.13, 0.28, 0.39, 0.445, 0.46, 0.425, 0.335, 0.07];
const KCY = [0.02, 0.01, 0.0, 0.0, -0.005, -0.02, -0.04, -0.06, -0.07];
const X0 = -0.62, XL = 1.12;
function interp(keys: number[], t: number) {
  t = clamp01(t);
  let i = 0; while (i < KT.length - 2 && t > KT[i + 1]) i++;
  const t0 = KT[i], t1 = KT[i + 1], k = (t - t0) / (t1 - t0);
  const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(keys.length - 1, i + 2)];
  // Catmull-Rom
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * (2 * p1 + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
}
export const prof = (t: number) => ({ x: X0 + XL * t, top: interp(KTOP, t), bot: interp(KBOT, t), wid: interp(KWID, t), cy: interp(KCY, t) });

/** a point on the body surface at length t and angle a (0 = top, +pi/2 = +z side, pi = bottom) */
export function surf(t: number, a: number, out = 0): THREE.Vector3 {
  const p = prof(t);
  const s = Math.sin(a), c = Math.cos(a);
  const ry = c >= 0 ? p.top : p.bot;
  return new THREE.Vector3(p.x, p.cy + c * (ry + out), s * (p.wid + out));
}
/** find the body surface point at height y and depth z near the front (binary search along t) */
export function surfFront(y: number, z: number, out = 0): THREE.Vector3 {
  let lo = 0.55, hi = 0.999;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2, p = prof(m);
    const ry = y >= p.cy ? p.top : p.bot;
    const f = ((y - p.cy) / ry) ** 2 + (z / p.wid) ** 2;
    if (f < 1) lo = m; else hi = m;
  }
  const p = prof(lo);
  const n = new THREE.Vector3(0.35, (y - p.cy) / (y >= p.cy ? p.top : p.bot), z / p.wid).normalize();
  return new THREE.Vector3(p.x, y, z).addScaledVector(n, out);
}

/** side-profile outline radius around the body centre (used for the soft body ring), in body space */
export const SB_CENTER = new THREE.Vector2(-0.02, -0.02);
const outlinePoly: [number, number][] = (() => {
  const top: [number, number][] = [], bot: [number, number][] = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, p = prof(t); top.push([p.x, p.cy + p.top]); bot.push([p.x, p.cy - p.bot]); }
  // the droopy nose bulges the front-bottom of the outline
  const nose: [number, number][] = [[0.62, 0.12], [0.71, -0.06], [0.68, -0.24], [0.56, -0.3]];
  return [...top, ...nose, ...bot.reverse()];
})();
export function outlineAt(a: number): { x: number; y: number } {
  // ray from the centre at angle a against the outline polygon
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

// ------------------------------------------------------------------ texture page (256 x 256)
const PAGE = 256;
const R_BODY: Reg = { x: 0, y: 0, w: 1, h: 0.75 };
const R_NOSE: Reg = { x: 0, y: 0.75, w: 0.5, h: 0.25 };
const R_FIN: Reg = { x: 0.5, y: 0.75, w: 0.25, h: 0.25 };
const R_BAND: Reg = { x: 0.75, y: 0.75, w: 0.25, h: 0.25 };

let pageCache: { map: THREE.Texture; nrm: THREE.Texture; rough: THREE.Texture; rock: THREE.Texture } | null = null;
function paintPage() {
  if (pageCache) return pageCache;
  const p = new Px(PAGE, PAGE);
  const H = new Float32Array(PAGE * PAGE); // height for the normal map
  const rough = new Px(PAGE, PAGE);
  // soft rose-pink jelly: hue-shifted ramp (cool rose shadows, warm cream lights), low-contrast mottling,
  // sparse freckles on the back, a pale belly and blushing cheeks under the eyes
  const skin = ramp(['#8e3a5a', '#c35e7a', '#e2869b', '#f4a9b6', '#ffcfd4', '#fff0ea'], 10, 0.55);
  const bh = PAGE * R_BODY.h;
  for (let y = 0; y < bh; y++) for (let x = 0; x < PAGE; x++) {
    const u = x / PAGE, t = 1 - y / bh;
    const ang = u * TAU; // 0 bottom
    const up = -Math.cos(ang); // 1 top, -1 bottom
    const side = Math.sin(ang); // +1 at u=.25 (-z), -1 at u=.75 (+z)
    const mott = pxNoise(x, y, 26, 3, 5, PAGE);
    const [f1, , cid] = worley(x, y, 11, 3, PAGE);
    const freckle = up > 0.25 && cid > 0.6 && f1 < 1.6 ? 1 : 0;
    let v = 0.56 - up * 0.13 + (mott - 0.5) * 0.12 - freckle * 0.16;
    v += smooth(-0.2, -0.85, up) * 0.14;            // pale belly
    v += smooth(0.35, 0.75, up) * smooth(0.3, 0.8, t) * 0.04 * Math.sin(t * 40); // faint jelly sheen bands
    v -= smooth(0.3, 0.0, t) * 0.1;                  // tail a touch deeper
    let c: RGB = skin(v, x, y);
    // blush: soft dithered ovals on both cheeks, below and behind the eyes
    for (const s0 of [-1, 1]) {
      const cu = 0.5 + s0 * 0.215, ct = 0.8;
      const dx = (u - cu) * PAGE / 9, dy = (t - ct) * bh / 7;
      const b = 1 - (dx * dx + dy * dy);
      if (b > 0 && hash2(x, y, 41) < b * 1.4) c = mix(c, hex('#ff6d8a'), 0.32 + b * 0.18);
    }
    void side;
    p.set(x, y, c);
    H[y * PAGE + x] = mott * 0.35 - freckle * 0.3;
    rough.set(x, y, [Math.round(55 + mott * 30), 0, 0]);
  }
  // --- nose: big, soft, glossy, slightly warmer
  const nr = ramp(['#9a3e5e', '#cc6680', '#ea8fa2', '#ffbcc8', '#ffe2e4'], 8, 0.55);
  const nx0 = 0, ny0 = PAGE * 0.75, nw = PAGE * 0.5, nh = PAGE * 0.25;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const u = x / nw, t = 1 - y / nh, up = Math.cos(u * TAU);
    const m = pxNoise(x, y, 11, 3, 11, 0);
    const pore = hash2(x, y, 4) > 0.985 ? 1 : 0;
    const v = 0.5 + up * 0.14 + (m - 0.5) * 0.1 - pore * 0.1 + t * 0.06;
    p.set(nx0 + x, ny0 + y, nr(v, x, y));
    H[(ny0 + y) * PAGE + nx0 + x] = m * 0.3 - pore * 0.5;
    rough.set(nx0 + x, ny0 + y, [45, 0, 0]);
  }
  // --- fin membrane: translucent pink with darker rays, rounded edge (alpha)
  const fx0 = PAGE * 0.5, fy0 = PAGE * 0.75, fw = PAGE * 0.25, fh = PAGE * 0.25;
  const fr = ramp(['#9a4058', '#d6758c', '#f4a8b8', '#ffd8e0'], 5);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const u = x / (fw - 1), v = y / (fh - 1);
    // rays fan along u (base at u=0)
    const ray = Math.abs(Math.sin(v * Math.PI * 6)) < 0.18 ? 1 : 0;
    const edge = Math.pow(u, 1.0) + Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.5;
    if (edge > 1.0) continue;
    const c = fr(0.75 - u * 0.25 - ray * 0.3, x, y);
    p.set(fx0 + x, fy0 + y, edge > 0.92 ? mix(c, hex('#7a2a40'), 0.6) : c);
    H[(fy0 + y) * PAGE + fx0 + x] = ray * 0.6;
    rough.set(fx0 + x, fy0 + y, [50, 0, 0]);
  }
  // --- bandana: red cotton with white polka dots + weave
  const bx0 = PAGE * 0.75, by0 = PAGE * 0.75, bw = PAGE * 0.25, bhh = PAGE * 0.25;
  const red = ramp(['#5e0d14', '#9c1b22', '#d0302e', '#f05a48'], 5);
  for (let y = 0; y < bhh; y++) for (let x = 0; x < bw; x++) {
    const weave = ((x + y) & 1) * 0.06 + ((x >> 1) & 1) * 0.03;
    const dx = ((x + (y >> 4 & 1) * 8) % 16) - 7.5, dy = (y % 16) - 7.5;
    const r2 = dx * dx + dy * dy;
    const dot = r2 < 9;
    const hem = y > bhh - 6;
    const c = hem ? red(0.3 + weave, x, y) : dot ? (r2 < 4 && dx < 0 ? hex('#ffffff') : hex('#fbecd6')) : red(0.62 + weave + (pxNoise(x, y, 6, 2, 3) - 0.5) * 0.25, x, y);
    p.set(bx0 + x, by0 + y, c);
    H[(by0 + y) * PAGE + bx0 + x] = weave * 3 + (dot ? 0.3 : 0);
    rough.set(bx0 + x, by0 + y, [200, 0, 0]);
  }
  const map = p.texture();
  const nrm = Px.normalMap(PAGE, PAGE, (x, y) => H[y * PAGE + x], 1.6);
  // roughness lives in the green channel for three's roughnessMap
  const rp = new Px(PAGE, PAGE);
  rp.fill((x, y) => { const r = rough.get(x, y)[0] || 90; return [r, r, r]; });
  const roughT = rp.texture({ srgb: false });
  // --- rock skin for Rock Body: grey granite with flecks + cracks
  const rk = new Px(128, 128);
  const rr = ramp(['#2e2c2a', '#4f4b46', '#77716a', '#a39b90', '#cfc6b8'], 6);
  rk.fill((x, y) => {
    const [f1, f2] = worley(x, y, 18, 7, 128);
    const crack = f2 - f1 < 1.6 ? 1 : 0;
    const n = pxNoise(x, y, 10, 4, 3, 128);
    const fleck = hash2(x, y, 3) > 0.93 ? 0.25 : 0;
    return rr(0.55 + (n - 0.5) * 0.6 + fleck - crack * 0.45, x, y);
  });
  const rock = rk.texture({ repeat: true });
  pageCache = { map, nrm, rough: roughT, rock };
  return pageCache;
}

// ------------------------------------------------------------------ material: PBR + uw + soft-body bend + effects
export interface BlobUniforms {
  uSB: { value: THREE.Vector2[] }; uFlash: { value: number }; uRock: { value: number }; uBloat: { value: number };
  uWag: { value: number }; uWagAmp: { value: number }; uRockMap: { value: THREE.Texture }; uGlow: { value: THREE.Color }; uSqueeze: { value: number };
}

export function makeBlobUniforms(): BlobUniforms {
  return {
    uSB: { value: Array.from({ length: SB_N }, () => new THREE.Vector2()) },
    uFlash: { value: 0 }, uRock: { value: 0 }, uBloat: { value: 0 }, uWag: { value: 0 }, uWagAmp: { value: 0.04 },
    uRockMap: { value: paintPage().rock }, uGlow: { value: new THREE.Color(0, 0, 0) }, uSqueeze: { value: 0 },
  };
}

function patchBlob(mat: THREE.MeshPhysicalMaterial, U: BlobUniforms, bend: boolean) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec2 uSB[${SB_N}]; uniform float uBloat; uniform float uWag; uniform float uWagAmp; uniform float uSqueeze;
        attribute vec3 aSB; varying vec3 vObj;`)
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
        uniform float uFlash; uniform float uRock; uniform sampler2D uRockMap; uniform vec3 uGlow; varying vec3 vObj;
        float bhash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // Rock Body: stone spreads over the skin from the centre with a pixel dither edge
          vec2 rq = floor(vObj.xz * 90.0 + vObj.y * 40.0);
          float edge = uRock * 1.6 - length(vObj) * 1.8 + (bhash(rq) - 0.5) * 0.35;
          float rk = step(0.0, edge);
          vec3 stone = texture2D(uRockMap, vObj.xz * 1.6 + vObj.yx * 0.9).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, stone, rk);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, step(0.0, uRock * 1.6 - length(vObj) * 1.8));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.95, 0.95) * uFlash + uGlow;`);
  };
  const pk = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => pk() + (bend ? 'blobB' : 'blob');
}

// ------------------------------------------------------------------ geometry builders
function addSB(geo: THREE.BufferGeometry) {
  // per-vertex soft-body binding: ring index, blend, radial weight
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - SB_CENTER.x, y = pos.getY(i) - SB_CENTER.y;
    let ang = Math.atan2(y, x); if (ang < 0) ang += TAU;
    const f = (ang / TAU) * SB_N, i0 = Math.floor(f) % SB_N;
    const R = Math.hypot(outlineAt(ang).x, outlineAt(ang).y) || 1;
    a[i * 3] = i0; a[i * 3 + 1] = f - Math.floor(f); a[i * 3 + 2] = Math.min(1.15, Math.hypot(x, y) / R);
  }
  geo.setAttribute('aSB', new THREE.BufferAttribute(a, 3));
}

function buildBody(): THREE.BufferGeometry {
  const L = new Loft();
  const NS = 28;
  const us = usFor(NS);
  const rings = [];
  const NR = 34;
  for (let i = 0; i < NR; i++) {
    const k = i / (NR - 1);
    const t = 0.012 + (1 - Math.pow(1 - k, 1.6)) * 0.975;
    const p = prof(t);
    const pts: V3[] = us.map((u) => {
      const ang = u * TAU; // 0 bottom
      const s = Math.sin(ang), c = -Math.cos(ang);
      // jowls: the lower front cheeks sag a little extra
      const jowl = c < 0 ? 1 + smooth(0.7, 0.92, t) * smooth(0.0, -0.8, c) * 0.06 : 1;
      const ry = c >= 0 ? p.top : p.bot * jowl;
      const e = 2 / 2.15; // slightly boxy superellipse: a soft, fleshy cross-section
      const ex = Math.sign(s) * Math.pow(Math.abs(s), e), ey = Math.sign(c) * Math.pow(Math.abs(c), e);
      return [p.x, p.cy + ey * ry, ex * p.wid * jowl] as V3;
    });
    rings.push({ pts, v: t });
  }
  const p0 = prof(0), p1 = prof(1);
  L.loft(rings, us, R_BODY, 0, { start: [p0.x - 0.01, p0.cy, 0], end: [p1.x + 0.005, p1.cy, 0], alt: true });
  // the droopy nose: a bulb hanging off the front of the head
  const nose: V3[] = [];
  const NN = 14;
  for (let i = 0; i <= NN; i++) {
    const s = i / NN;
    const ax = 0.33, ay = 0.16, bx = 0.62, by = 0.14, cx = 0.57, cyy = -0.16;
    const x = (1 - s) * (1 - s) * ax + 2 * (1 - s) * s * bx + s * s * cx;
    const y = (1 - s) * (1 - s) * ay + 2 * (1 - s) * s * by + s * s * cyy;
    nose.push([x, y, 0]);
  }
  const nr = (s: number) => {
    const base = 0.09 + 0.07 * smooth(0.15, 0.8, s);
    const cap = s > 0.76 ? Math.sqrt(Math.max(0, 1 - ((s - 0.76) / 0.24) ** 2)) : 1;
    return Math.max(0.004, base * cap);
  };
  L.tube(nose, nr, 18, R_NOSE, 1, { capStart: false, capEnd: true });
  const geo = L.build();
  addSB(geo);
  return geo;
}

function finGeo(len: number, wid: number, cup: number): THREE.BufferGeometry {
  const L = new Loft();
  const grid: V3[][] = [];
  const R = 6, C = 7;
  for (let i = 0; i < R; i++) {
    const v = i / (R - 1);
    const row: V3[] = [];
    for (let j = 0; j < C; j++) {
      const u = j / (C - 1);
      const spread = (v - 0.5) * wid * (0.45 + u * 0.75);
      row.push([u * len, spread, Math.sin(u * Math.PI) * cup * (0.5 - Math.abs(v - 0.5))]);
    }
    grid.push(row);
  }
  L.sheet(grid, R_FIN, 0);
  return L.build();
}

// ------------------------------------------------------------------ the toothpick sword
let swordCache: THREE.Group | null = null;
export function buildSword(): THREE.Group {
  if (swordCache) return swordCache.clone();
  const g = new THREE.Group();
  // birch wood with fine grain, pixel painted
  const wp = new Px(16, 64);
  const wr = ramp(['#8a6a40', '#c49a62', '#e2c08a', '#f6dfb0'], 6);
  wp.fill((x, y) => wr(0.6 + (pxNoise(x * 3, y * 0.4, 6, 2, 8) - 0.5) * 0.6 + (Math.sin(x * 1.7 + y * 0.05) * 0.08), x, y));
  const wood = wp.texture({ repeat: true });
  const L = new Loft();
  const path: V3[] = [];
  for (let i = 0; i <= 16; i++) path.push([i / 16 * 0.62, 0, 0]);
  L.tube(path, (t) => (t < 0.08 ? 0.012 + t * 0.1 : 0.02 * Math.pow(1 - (t - 0.08) / 0.92, 0.75) + 0.0015), 8, { x: 0, y: 0, w: 1, h: 1 }, 0, { capEnd: true, capStart: true });
  const blade = new THREE.Mesh(L.build(), uw(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 })));
  blade.castShadow = true;
  g.add(blade);
  // cork crossguard
  const cp = new Px(16, 16);
  const cr = ramp(['#6a4a2a', '#a07a4a', '#c8a070', '#e0c090'], 4);
  cp.fill((x, y) => cr(0.55 + (hash2(x, y, 5) - 0.5) * 0.7, x, y));
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.05, 14), uw(new THREE.MeshStandardMaterial({ map: cp.texture(), roughness: 0.9 })));
  cork.rotation.z = Math.PI / 2; cork.position.x = 0.07;
  cork.castShadow = true;
  g.add(cork);
  // cocktail frill: shiny foil strips fanning from the pommel
  const cols = ['#ff3b5c', '#ffd23b', '#3bd1ff', '#7dff6a', '#c27bff'];
  const strip = new THREE.BoxGeometry(0.004, 0.06, 0.012);
  strip.translate(0, 0.03, 0);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    const m = new THREE.Mesh(strip, uw(new THREE.MeshStandardMaterial({ color: cols[i % cols.length], metalness: 0.7, roughness: 0.22, emissive: cols[i % cols.length], emissiveIntensity: 0.12 })));
    m.position.set(-0.005, 0, 0);
    m.rotation.set(a, 0, 0);
    m.rotateZ(0.5 + (i % 3) * 0.12);
    g.add(m);
  }
  swordCache = g;
  return g.clone();
}

// ------------------------------------------------------------------ eyes, lids, brows, mouth
/** iris cap texture: row 0 = pole (pupil) .. last row = cap edge (limbal ring); x runs around the iris */
function eyeTexture(): THREE.Texture {
  const W = 64, H = 32;
  const p = new Px(W, H);
  const iris = ramp(['#2a1206', '#6e3410', '#b8661a', '#f0a43a', '#ffd88a'], 9, 0.6);
  p.fill((x, y) => {
    const v = y / (H - 1);
    if (v < 0.36) return hex(v < 0.3 ? '#07030a' : '#1a0c08');
    if (v > 0.9) return hex('#1a0a06');
    const k = (v - 0.36) / 0.54; // 0 inner .. 1 outer
    const stri = Math.sin(x * 0.9 + Math.sin(x * 0.31) * 3) * 0.12 + (hash2(x, 0, 4) - 0.5) * 0.18;
    // lighter collarette ring near the pupil, darker toward the rim
    const t = 0.78 - k * 0.55 + stri + (k < 0.18 ? 0.18 : 0);
    return iris(t, x, y);
  });
  return p.texture({ mip: false });
}

export interface Expr { lid: number; lidTilt: number; browUp: number; browTilt: number; curve: number; open: number; width: number; pupil: number; lowLid: number }
export const EXPR: Record<string, Expr> = {
  brave: { lid: 0.3, lidTilt: 0.35, browUp: 0, browTilt: 0.5, curve: -0.25, open: 0.0, width: 1, pupil: 1, lowLid: 0.1 },
  happy: { lid: 0.42, lidTilt: -0.1, browUp: 0.4, browTilt: -0.2, curve: 1, open: 0.25, width: 1.1, pupil: 1.1, lowLid: 0.45 },
  attack: { lid: 0.45, lidTilt: 0.9, browUp: -0.3, browTilt: 1, curve: -0.6, open: 0.45, width: 1.05, pupil: 0.85, lowLid: 0.25 },
  hurt: { lid: 0.95, lidTilt: 0.5, browUp: -0.2, browTilt: -0.6, curve: -1, open: 0.7, width: 0.9, pupil: 1, lowLid: 0.5 },
  strain: { lid: 0.62, lidTilt: 0.8, browUp: -0.2, browTilt: 1, curve: -0.9, open: 0.3, width: 1.15, pupil: 0.8, lowLid: 0.35 },
  scared: { lid: 0.02, lidTilt: -0.6, browUp: 1, browTilt: -0.8, curve: -0.7, open: 0.75, width: 0.8, pupil: 0.6, lowLid: 0 },
  chomp: { lid: 0.2, lidTilt: 0.2, browUp: 0.3, browTilt: 0, curve: 0.2, open: 1.0, width: 1.1, pupil: 1.2, lowLid: 0.1 },
  dizzy: { lid: 0.5, lidTilt: -0.5, browUp: 0.5, browTilt: -0.5, curve: -0.3, open: 0.35, width: 0.9, pupil: 0.7, lowLid: 0.2 },
  sad: { lid: 0.5, lidTilt: -0.7, browUp: 0.3, browTilt: -0.9, curve: -1, open: 0.05, width: 0.9, pupil: 1.2, lowLid: 0.15 },
  sleep: { lid: 1, lidTilt: 0, browUp: 0, browTilt: 0, curve: 0.2, open: 0.0, width: 0.9, pupil: 1, lowLid: 0.3 },
};

export class BlobModel {
  root = new THREE.Group();      // world-placed by the player (position, flip)
  body = new THREE.Group();      // yaw/pitch/squash
  U = makeBlobUniforms();
  bodyMat: THREE.MeshPhysicalMaterial;
  skinMat: THREE.MeshPhysicalMaterial;
  eyes: { g: THREE.Group; iris: THREE.Mesh; lid: THREE.Mesh; low: THREE.Mesh; brow: THREE.Mesh; side: number; rest: THREE.Vector3; ang: number }[] = [];
  finL: THREE.Mesh; finR: THREE.Mesh; tail: THREE.Mesh;
  mouth: { up: THREE.Mesh; lo: THREE.Mesh; fill: THREE.Mesh; geoUp: THREE.BufferGeometry; geoLo: THREE.BufferGeometry; geoFill: THREE.BufferGeometry };
  band: THREE.Mesh;
  bandKnot: THREE.Mesh;
  tails: { pts: THREE.Vector3[]; prev: THREE.Vector3[]; mesh: THREE.Mesh; geo: THREE.BufferGeometry }[] = [];
  expr: Expr = { ...EXPR.brave };
  exprTarget: Expr = { ...EXPR.brave };
  look = new THREE.Vector2(1, 0);
  blink = 0;
  private blinkT = 2;
  mouthPos: THREE.Vector3;
  facingSign = 1;

  constructor() {
    const pg = paintPage();
    this.bodyMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, normalMap: pg.nrm, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: pg.rough, roughness: 1.0, clearcoat: 0.55, clearcoatRoughness: 0.28, sheen: 0.4, sheenColor: new THREE.Color('#ffd0dc'), sheenRoughness: 0.5 }), { sss: [1.0, 0.35, 0.42], sssK: 0.55, rim: 0.35, rimCol: [1.0, 0.85, 0.9] });
    patchBlob(this.bodyMat, this.U, true);
    this.skinMat = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }), { sss: [1.0, 0.4, 0.5], sssK: 0.7 });
    patchBlob(this.skinMat, this.U, false);
    const body = new THREE.Mesh(buildBody(), this.bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    this.body.add(body);
    this.root.add(this.body);

    // fins
    this.finR = new THREE.Mesh(finGeo(0.3, 0.24, 0.04), this.skinMat);
    this.finL = new THREE.Mesh(finGeo(0.3, 0.24, 0.04), this.skinMat);
    this.finR.position.copy(surf(0.55, Math.PI * 0.62, -0.02)); this.finL.position.copy(surf(0.55, -Math.PI * 0.62, -0.02));
    this.finR.castShadow = this.finL.castShadow = true;
    this.tail = new THREE.Mesh(finGeo(0.3, 0.42, 0.0), this.skinMat);
    this.tail.position.set(-0.58, 0.02, 0);
    this.tail.rotation.set(0, Math.PI, 0);
    this.tail.castShadow = true;
    this.body.add(this.finR, this.finL, this.tail);

    // eyes: glossy sclera, an amber iris cap that rotates to look around, fixed catchlights, skin lids and brows
    const eyeTex = eyeTexture();
    const scleraMat = uw(new THREE.MeshPhysicalMaterial({ color: '#f7f1ec', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }), { depth: 0.45, caustics: 0.25, sss: [1, 0.85, 0.85], sssK: 0.3 });
    const irisMat = uw(new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }), { depth: 0.35, caustics: 0.1 });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const browMat = uw(new THREE.MeshStandardMaterial({ color: '#a64a66', roughness: 0.6 }));
    const eyeR = 0.108;
    const irisGeo = new THREE.SphereGeometry(eyeR * 1.006, 36, 14, 0, TAU, 0, 0.66);
    irisGeo.rotateX(Math.PI / 2);
    for (const side of [1, -1]) {
      const g = new THREE.Group();
      const pos = surf(0.9, side * 0.86, -eyeR * 0.5);
      g.position.copy(pos);
      const out = new THREE.Vector3(0.72, 0.12, side * 0.68).normalize();
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 32, 24), scleraMat);
      const iris = new THREE.Mesh(irisGeo, irisMat);
      const glints = new THREE.Group();
      const g1 = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.2, 12, 8), glintMat); g1.position.set(-eyeR * 0.32, eyeR * 0.38, eyeR * 0.9); g1.scale.z = 0.4;
      const g2 = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.09, 8, 6), glintMat); g2.position.set(eyeR * 0.3, -eyeR * 0.28, eyeR * 0.95); g2.scale.z = 0.4;
      glints.add(g1, g2);
      const lidGeo = new THREE.SphereGeometry(eyeR * 1.08, 28, 12, 0, TAU, 0, Math.PI * 0.5);
      const lid = new THREE.Mesh(lidGeo, this.bodyMatPlain());
      const low = new THREE.Mesh(lidGeo, this.bodyMatPlain());
      low.rotation.x = Math.PI;
      const L = new Loft();
      const bp: V3[] = []; for (let i = 0; i <= 10; i++) { const k = i / 10; bp.push([(k - 0.5) * eyeR * 2.3, Math.sin(k * Math.PI) * eyeR * 0.3, 0]); }
      L.tube(bp, (k) => 0.019 * (0.55 + Math.sin(k * Math.PI) * 0.55), 8, { x: 0, y: 0, w: 1, h: 1 }, 0, { capStart: true, capEnd: true });
      const brow = new THREE.Mesh(L.build(), browMat);
      brow.position.set(0, eyeR * 1.42, eyeR * 0.5);
      for (const m of [ball, iris, lid, low, brow]) m.castShadow = false;
      g.add(ball, iris, glints, lid, low, brow);
      this.body.add(g);
      this.eyes.push({ g, iris, lid, low, brow, side, rest: pos.clone(), ang: Math.atan2(pos.y - SB_CENTER.y, pos.x - SB_CENTER.x) });
    }

    // mouth (rebuilt when the expression changes)
    const lipMat = uw(new THREE.MeshPhysicalMaterial({ color: '#c0566e', roughness: 0.3, clearcoat: 0.7 }), { sss: [1, 0.4, 0.5], sssK: 0.4 });
    const inMat = uw(new THREE.MeshStandardMaterial({ color: '#2a0810', roughness: 0.8, side: THREE.DoubleSide }), { caustics: 0 });
    const geoUp = new THREE.BufferGeometry(), geoLo = new THREE.BufferGeometry(), geoFill = new THREE.BufferGeometry();
    this.mouth = { up: new THREE.Mesh(geoUp, lipMat), lo: new THREE.Mesh(geoLo, lipMat), fill: new THREE.Mesh(geoFill, inMat), geoUp, geoLo, geoFill };
    this.body.add(this.mouth.up, this.mouth.lo, this.mouth.fill);
    this.mouthPos = surfFront(-0.31, 0, 0.0);
    this.buildMouth();

    // bandana: a cloth cap over the top of the head with a rolled hem, a knot at the back and two flowing tails
    const bandL = new Loft();
    const NB = 18, bus = usFor(NB);
    const capRings = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      const t = 0.55 + k * 0.34;
      // the hem dips lower over the brow at the front and wraps the sides
      const span = 1.28 - k * 0.6;
      const pts = bus.map((u) => { const a = (u - 0.5) * 2 * span; return surf(t, a, 0.014 + (i === 10 ? 0.012 : 0)).toArray() as V3; });
      capRings.push({ pts, v: k });
    }
    bandL.loft(capRings, bus, R_BAND, 0, { alt: true });
    // rolled hem along the front edge
    const hem: V3[] = [];
    for (let j = 0; j <= 16; j++) { const a = (j / 16 - 0.5) * 2 * 0.68; hem.push(surf(0.89, a, 0.03).toArray() as V3); }
    bandL.tube(hem, () => 0.016, 6, R_BAND, 1, { capStart: true, capEnd: true });
    const bandMat = uw(new THREE.MeshStandardMaterial({ map: pg.map, roughness: 0.85, side: THREE.DoubleSide }), { rim: 0.15 });
    const capMat = uw(new THREE.MeshStandardMaterial({ map: pg.map, roughness: 0.85, side: THREE.DoubleSide }), { rim: 0.15 });
    patchBlob(capMat as unknown as THREE.MeshPhysicalMaterial, this.U, true);
    const capGeo = bandL.build();
    addSB(capGeo);
    this.band = new THREE.Mesh(capGeo, capMat);
    this.band.castShadow = true;
    this.body.add(this.band);
    const knotPos = surf(0.55, 0.0, 0.03);
    knotPos.x -= 0.02;
    this.bandKnot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), bandMat);
    this.bandKnot.scale.set(1.2, 0.85, 1.1);
    this.bandKnot.position.copy(knotPos);
    this.body.add(this.bandKnot);
    for (let k = 0; k < 2; k++) {
      const pts: THREE.Vector3[] = [], prev: THREE.Vector3[] = [];
      for (let i = 0; i < TAIL_N; i++) { pts.push(new THREE.Vector3()); prev.push(new THREE.Vector3()); }
      // a flat cloth strip with real thickness (rectangular cross-section) so it reads from any angle
      const geo = new THREE.BufferGeometry();
      const nv = TAIL_N * 5;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      const uv = new Float32Array(nv * 2);
      for (let i = 0; i < TAIL_N; i++) for (let j = 0; j < 5; j++) { uv[(i * 5 + j) * 2] = 0.76 + (i / (TAIL_N - 1)) * 0.22; uv[(i * 5 + j) * 2 + 1] = 0.02 + (j / 4) * 0.2; }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const idx: number[] = [];
      for (let i = 0; i < TAIL_N - 1; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 1, c = a + 6, d = a + 5; idx.push(a, b, c, a, c, d); }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, bandMat);
      mesh.frustumCulled = false; mesh.castShadow = true;
      this.tails.push({ pts, prev, mesh, geo });
    }
  }

  private plainSkin?: THREE.MeshPhysicalMaterial;
  private bodyMatPlain() {
    if (!this.plainSkin) {
      const pg = paintPage();
      this.plainSkin = uw(new THREE.MeshPhysicalMaterial({ map: pg.map, roughness: 0.5, clearcoat: 0.5, side: THREE.DoubleSide }), { sss: [1, 0.4, 0.5], sssK: 0.6, rim: 0.3 });
      patchBlob(this.plainSkin, this.U, false);
    }
    return this.plainSkin;
  }

  /** tail ribbons live in world space; the player adds them to the scene */
  get tailMeshes() { return this.tails.map((t) => t.mesh); }

  setExpression(name: keyof typeof EXPR | string) { const e = EXPR[name]; if (e) this.exprTarget = { ...e }; }

  private buildMouth() {
    const e = this.expr;
    const N = 15, w = 0.23 * e.width;
    const up: THREE.Vector3[] = [], lo: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const k = (i / (N - 1)) * 2 - 1;
      const z = k * w;
      const curve = e.curve * 0.07 * (k * k) - e.curve * 0.016;
      const yU = -0.305 + curve + e.open * 0.015;
      const yL = yU - e.open * 0.11 * (1 - k * k * 0.9) - 0.003;
      up.push(surfFront(yU, z, 0.008));
      lo.push(surfFront(yL, z, 0.008));
    }
    const tubeGeo = (pts: THREE.Vector3[], g: THREE.BufferGeometry) => {
      const L = new Loft();
      L.tube(pts.map((p) => p.toArray() as V3), (t) => 0.022 * (0.45 + Math.sin(t * Math.PI) * 0.7), 6, { x: 0, y: 0, w: 1, h: 1 }, 0, { capStart: true, capEnd: true });
      const b = L.build();
      g.setAttribute('position', b.getAttribute('position')); g.setAttribute('normal', b.getAttribute('normal')); g.setAttribute('uv', b.getAttribute('uv'));
      g.setIndex(b.getIndex()); g.computeBoundingSphere();
    };
    tubeGeo(up, this.mouth.geoUp);
    tubeGeo(lo, this.mouth.geoLo);
    // interior: a strip between the lips, pushed slightly inward
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = up[i].clone().addScaledVector(new THREE.Vector3(-1, 0, 0), 0.01), b = lo[i].clone().addScaledVector(new THREE.Vector3(-1, 0, 0), 0.01);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i < N - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    this.mouth.geoFill.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.mouth.geoFill.setIndex(idx);
    this.mouth.geoFill.computeVertexNormals();
    this.mouth.fill.visible = e.open > 0.08;
  }

  private sbTmp = { x: 0, y: 0 };
  /**
   * per-frame: soft-body displacements -> uniforms + attachments, expression easing, blink, eye look,
   * fins and the bandana tails (simulated in world space)
   */
  update(dt: number, o: { sb: { disp(a: number, out: { x: number; y: number }): { x: number; y: number } }; swim: number; time: number; worldMatrix: THREE.Matrix4; vel: THREE.Vector2 }) {
    const disp = this.sbTmp;
    for (let i = 0; i < SB_N; i++) {
      const a = (i / SB_N) * TAU;
      o.sb.disp(a, disp);
      this.U.uSB.value[i].set(disp.x, disp.y);
    }
    // attachments follow the skin
    for (const e of this.eyes) { o.sb.disp(e.ang, disp); e.g.position.set(e.rest.x + disp.x * 0.9, e.rest.y + disp.y * 0.9, e.rest.z); }
    const ma = Math.atan2(this.mouthPos.y - SB_CENTER.y, this.mouthPos.x - SB_CENTER.x);
    o.sb.disp(ma, disp);
    const sag = this.U.uBloat.value * (0.05 + 0.055) * 0.85;
    for (const m of [this.mouth.up, this.mouth.lo, this.mouth.fill]) m.position.set(disp.x, disp.y - sag, 0);
    const ka = Math.atan2(this.bandKnot.position.y - SB_CENTER.y, this.bandKnot.position.x - SB_CENTER.x);
    o.sb.disp(ka, disp);
    // expression easing
    const E = this.expr, T = this.exprTarget;
    let changed = false;
    for (const k of Object.keys(E) as (keyof Expr)[]) {
      const nv = E[k] + (T[k] - E[k]) * (1 - Math.exp(-dt * 14));
      if (Math.abs(nv - E[k]) > 1e-4) changed = true;
      E[k] = nv;
    }
    if (changed) this.buildMouth();
    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 3.5; }
    this.blink = Math.max(0, this.blink - dt * 8);
    const lid = Math.max(E.lid, Math.sin(this.blink * Math.PI));
    for (const e of this.eyes) {
      e.lid.rotation.set(-1.45 + lid * 2.9, 0, 0);
      e.lid.rotateZ(E.lidTilt * 0.45 * -e.side);
      e.low.rotation.set(Math.PI + 1.45 - E.lowLid * 1.1, 0, 0);
      e.brow.position.y = 0.078 * (1.45 + E.browUp * 0.35 - lid * 0.25);
      e.brow.rotation.z = E.browTilt * 0.42 * -e.side;
      // the iris looks toward the look direction (in body space), scaled by pupil
      e.iris.rotation.set(-this.look.y * 0.38, this.look.x * 0.45 * e.side, 0);
      e.iris.scale.setScalar(1 + (E.pupil - 1) * 0.12);
    }
    // fins
    const flap = o.time * (6 + o.swim * 10);
    this.finR.rotation.set(-0.5 + Math.sin(flap) * (0.25 + o.swim * 0.35), -0.6, -0.35);
    this.finL.rotation.set(0.5 - Math.sin(flap + 0.6) * (0.25 + o.swim * 0.35), 0.6, -0.35);
    this.tail.rotation.set(0, Math.PI + Math.sin(o.time * (5 + o.swim * 9)) * (0.35 + o.swim * 0.35), Math.sin(o.time * 2.1) * 0.08);
    this.U.uWag.value += dt * (4 + o.swim * 9);
    this.U.uWagAmp.value = 0.02 + o.swim * 0.035;
    // bandana tails: verlet chains anchored at the knot (world space)
    const knotW = this.bandKnot.getWorldPosition(new THREE.Vector3());
    for (let k = 0; k < this.tails.length; k++) {
      const T = this.tails[k];
      const seg = 0.055;
      T.pts[0].copy(knotW).add(new THREE.Vector3(0, 0, (k - 0.5) * 0.04));
      for (let i = 1; i < T.pts.length; i++) {
        const p = T.pts[i], q = T.prev[i];
        if (p.lengthSq() === 0) { p.copy(T.pts[0]); q.copy(p); }
        const vx = (p.x - q.x) * 0.86, vy = (p.y - q.y) * 0.86, vz = (p.z - q.z) * 0.86;
        q.copy(p);
        // water drag: the tails stream away from the swim direction and flutter
        p.x += vx - o.vel.x * 0.0009 - this.facingSign * 0.0012;
        p.y += vy - o.vel.y * 0.0009 - 0.0007 + Math.sin(o.time * 9 + i * 0.9 + k * 2) * 0.0016 * (i / 6);
        p.z += vz;
      }
      for (let it = 0; it < 3; it++) for (let i = 1; i < T.pts.length; i++) {
        const a = T.pts[i - 1], b = T.pts[i];
        const d = b.clone().sub(a), l = d.length() || 1e-6;
        b.copy(a).addScaledVector(d, seg / l);
      }
      const pos = T.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < T.pts.length; i++) {
        const p = T.pts[i];
        const nxt = T.pts[Math.min(T.pts.length - 1, i + 1)], prv = T.pts[Math.max(0, i - 1)];
        const dir = nxt.clone().sub(prv).normalize();
        const wv = 0.05 * (1 - i / (TAIL_N + 2)) * (k === 0 ? 1 : 0.82);
        const sx = -dir.y * wv, sy = dir.x * wv, th = 0.012;
        // twist the strip a little along its length so it catches light like cloth
        const tw = Math.sin(i * 0.9 + o.time * 3 + k) * 0.6;
        const cz = Math.cos(tw), sz = Math.sin(tw);
        const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]];
        for (let j = 0; j < 5; j++) {
          const [a, b] = corners[j];
          const ox = sx * a * cz, oy = sy * a * cz, oz = wv * a * sz + th * b;
          pos.setXYZ(i * 5 + j, p.x + ox, p.y + oy, p.z + oz + 0.03 * k);
        }
      }
      pos.needsUpdate = true;
      T.geo.computeVertexNormals();
      T.geo.computeBoundingSphere();
    }
  }

  /** world position of the mouth (the hook attaches here) */
  mouthWorld(out = new THREE.Vector3()) { return out.copy(this.mouthPos).add(this.mouth.up.position).applyMatrix4(this.body.matrixWorld); }
  /** world position of the sword hand (the +z pectoral fin tip) */
  handWorld(out = new THREE.Vector3()) { return out.set(0.16, -0.06, 0.05).applyMatrix4(this.finR.matrixWorld); }
}
