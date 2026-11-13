// Skins: tint / texture variants of the blobfish's own skin page. The lead's BlobModel paints one indexed page
// (body, nose, fins, tail: clean tone ramps, no noise), so a skin is a palette swap: every page colour is mapped
// by its brightness onto the skin's own ramp (still clean, still the same blotches, creases and pores), plus a
// pattern pass (peeling sunburn, kelp camo blotches, glowing photophores) and material tweaks (pearl sheen, gold
// metal, ghost translucency). Applied per model by setting bodyMat / nose / fin materials (never editing them in
// place for other models) and fresh eyelid materials.
import * as THREE from 'three';
import { worley } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { hash2, TAU } from '../core/math';
import type { BlobModel } from '../player/blobModel';

export interface SkinDef {
  ramp: string[] | null;
  pattern?: 'peel' | 'camo' | 'spots';
  mat?: { metal?: number; rough?: number; clearcoat?: number; irid?: number; opacity?: number; emissive?: string; emissiveK?: number };
  eye?: string;
  lid?: string;
}
export const SKINS: Record<string, SkinDef> = {
  pink: { ramp: null },
  pearl: { ramp: ['#5a4e58', '#857884', '#ab9eaa', '#c9bec6', '#ddd4d8', '#ece6e6', '#f6f2f0', '#fffdfa'], mat: { rough: 0.4, clearcoat: 0.7, irid: 0.8 }, eye: '#b8102a', lid: '#e6dcde' },
  violet: { ramp: ['#160826', '#271044', '#3c1a66', '#552888', '#7038a8', '#8c52c4', '#aa72da', '#caa0ee'], pattern: 'spots', mat: { emissive: '#ffffff', emissiveK: 1.4, clearcoat: 0.3 }, lid: '#7a4cb0' },
  gold: { ramp: ['#3a1e04', '#663c0a', '#946012', '#c0861c', '#e0aa2c', '#f4cc4a', '#ffe684', '#fff6c8'], mat: { metal: 0.75, rough: 0.32, clearcoat: 0.8 }, lid: '#e8b434' },
  ghost: { ramp: ['#4a6a7c', '#6a8c9e', '#8cacbc', '#aac8d4', '#c2dce4', '#d8ecf2', '#eaf6fa', '#ffffff'], mat: { opacity: 0.55, emissive: '#9ae8ff', emissiveK: 0.35, rough: 0.3 }, lid: '#c8e8f2' },
  sunburnt: { ramp: ['#4a0c0c', '#741814', '#9e261c', '#c23a28', '#d8543a', '#e67656', '#f09c7e', '#f8c4a8'], pattern: 'peel', lid: '#d8543a' },
  camo: { ramp: ['#141a0a', '#222e16', '#324420', '#46582a', '#5c7034', '#768a42', '#92a656', '#b4c27a'], pattern: 'camo', lid: '#5c7034' },
};

const hexRGB = (c: string): [number, number, number] => { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const lumOf = (r: number, g: number, b: number) => (r * 0.299 + g * 0.587 + b * 0.114) / 255;

interface Paged { map: THREE.Texture; emissive: THREE.Texture | null }
const pageCache = new Map<string, Paged>();
/** the recoloured skin page (and its glow page) for a skin, from the model's own page */
function skinPage(orig: THREE.Texture, id: string): Paged | null {
  const def = SKINS[id];
  if (!def?.ramp) return null;
  const hit = pageCache.get(id);
  if (hit) return hit;
  const src = orig.image as HTMLCanvasElement;
  const W = src.width, H = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H);
  const d = sd.data;
  // brightness range of the page's own tones
  let lo = 1, hi = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const l = lumOf(d[i], d[i + 1], d[i + 2]); lo = Math.min(lo, l); hi = Math.max(hi, l); }
  const R = def.ramp.map(hexRGB), N = R.length;
  const out = new ImageData(W, H), o = out.data;
  const glow = def.pattern === 'spots' ? new ImageData(W, H) : null;
  const bodyH = H / 2;   // the body occupies the top half of the page (u around, rows tail -> face)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] < 128) { o[i + 3] = 0; continue; }
    let k = Math.round(((lumOf(d[i], d[i + 1], d[i + 2]) - lo) / (hi - lo || 1)) * (N - 1));
    if (y < bodyH) {
      const u = x / W, up = -Math.cos(u * TAU);
      if (def.pattern === 'camo') {
        // three-tone blotches (domain-warped cells), darker on the back
        const [f1, , cid] = worley(x + Math.sin(y * 0.2) * 4, y * 1.4, 20, 31, W);
        if (f1 < 7 + cid * 4) k += cid < 0.34 ? -2 : cid < 0.67 ? 1 : 0;
        if (up > 0.3 && cid > 0.8 && f1 < 5) k = 1;
      } else if (def.pattern === 'peel' && up > 0.15) {
        // peeling patches on the sun-facing back: a pale flake with a dark burnt rim
        const [f1, f2, cid] = worley(x, y * 1.3, 13, 57, W);
        if (cid < 0.32 && f1 < 3.2) k = f2 - f1 < 1.2 ? 2 : N - 1;
      } else if (def.pattern === 'spots' && glow) {
        // photophores: rows of glowing dots along the flanks and belly
        const row = (Math.abs(u - 0.3) < 0.012 || Math.abs(u - 0.7) < 0.012 || Math.abs(u - 0.06) < 0.01 || Math.abs(u - 0.94) < 0.01);
        if (row && y % 9 === 4) { k = N - 1; glow.data[i] = 120; glow.data[i + 1] = 240; glow.data[i + 2] = 255; glow.data[i + 3] = 255; }
        else if (row && (y % 9 === 3 || y % 9 === 5)) k = N - 2;
        if (up > 0.5 && hash2(x >> 2, y >> 2, 7) < 0.02 && (x & 3) === 1 && (y & 3) === 1) { k = N - 1; glow.data[i] = 200; glow.data[i + 1] = 140; glow.data[i + 2] = 255; glow.data[i + 3] = 255; }
      }
    }
    k = Math.max(0, Math.min(N - 1, k));
    o[i] = R[k][0]; o[i + 1] = R[k][1]; o[i + 2] = R[k][2]; o[i + 3] = 255;
  }
  const mk = (img: ImageData) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d')!.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = orig.magFilter; t.minFilter = orig.minFilter; t.generateMipmaps = orig.generateMipmaps;
    t.colorSpace = orig.colorSpace; t.wrapS = orig.wrapS; t.wrapT = orig.wrapT; t.anisotropy = orig.anisotropy; t.flipY = orig.flipY;
    t.needsUpdate = true;
    return t;
  };
  const res = { map: mk(out), emissive: glow ? mk(glow) : null };
  pageCache.set(id, res);
  return res;
}

interface Orig { mats: { m: THREE.MeshPhysicalMaterial; map: THREE.Texture | null; metal: number; rough: number; clear: number; irid: number; opacity: number; transparent: boolean; emissive: THREE.Color; emissiveK: number; emissiveMap: THREE.Texture | null }[]; lids: { mesh: THREE.Mesh; mat: THREE.Material }[]; balls: { mesh: THREE.Mesh; mat: THREE.Material }[] }
const origs = new WeakMap<BlobModel, Orig>();

function skinMats(model: BlobModel): THREE.MeshPhysicalMaterial[] {
  const out = new Set<THREE.MeshPhysicalMaterial>([model.bodyMat]);
  for (const m of [model.nose, model.finR, model.finL, model.tail]) out.add(m.material as THREE.MeshPhysicalMaterial);
  return [...out];
}

/** dress a model in a skin (pink restores the original page and materials) */
export function applySkin(model: BlobModel, id: string) {
  let o = origs.get(model);
  if (!o) {
    o = { mats: skinMats(model).map((m) => ({ m, map: m.map, metal: m.metalness, rough: m.roughness, clear: m.clearcoat, irid: m.iridescence, opacity: m.opacity, transparent: m.transparent, emissive: m.emissive.clone(), emissiveK: m.emissiveIntensity, emissiveMap: m.emissiveMap })), lids: [], balls: [] };
    for (const e of model.eyes) {
      const root = e.g.children[0];
      if (!root) continue;
      const [ball, rim, , lid] = root.children as THREE.Mesh[];
      if (ball) o.balls.push({ mesh: ball, mat: ball.material as THREE.Material });
      for (const m of [rim, lid]) if (m) o.lids.push({ mesh: m, mat: m.material as THREE.Material });
    }
    origs.set(model, o);
  }
  const def = SKINS[id] ?? SKINS.pink;
  const page = def.ramp ? skinPage(o.mats[0].map!, id) : null;
  for (const r of o.mats) {
    const m = r.m, mt = def.mat ?? {};
    const key = () => `${!!m.emissiveMap}|${m.transparent}|${m.iridescence > 0}`;
    const before = key();
    m.map = page?.map ?? r.map;
    m.metalness = mt.metal ?? r.metal;
    m.roughness = mt.rough ?? r.rough;
    m.clearcoat = mt.clearcoat ?? r.clear;
    m.iridescence = mt.irid ?? r.irid;
    m.transparent = mt.opacity !== undefined ? true : r.transparent;
    m.opacity = mt.opacity ?? r.opacity;
    m.emissive.set(mt.emissive ?? r.emissive);
    m.emissiveIntensity = mt.emissiveK ?? r.emissiveK;
    // photophores glow from their own page; a tinted glow (ghost) follows the skin page; otherwise as built
    m.emissiveMap = def.pattern === 'spots' ? page?.emissive ?? null : mt.emissive ? page?.map ?? null : r.emissiveMap;
    if (key() !== before) m.needsUpdate = true;
  }
  // eyelids / socket rims in the skin colour, albino eyes
  for (const l of o.lids) l.mesh.material = def.lid ? lidMat(def.lid, def.mat?.opacity) : l.mat;
  for (const b of o.balls) b.mesh.material = def.eye ? eyeMat(def.eye) : b.mat;
}
const lidCache = new Map<string, THREE.Material>();
function lidMat(col: string, opacity?: number) {
  const k = col + (opacity ?? '');
  let m = lidCache.get(k);
  if (!m) {
    const pm = new THREE.MeshPhysicalMaterial({ color: col, flatShading: true, roughness: 0.72, clearcoat: 0.12, clearcoatRoughness: 0.5 });
    if (opacity !== undefined) { pm.transparent = true; pm.opacity = opacity; }
    m = uw(pm, { sss: [1, 0.6, 0.6], sssK: 0.4, rim: 0.14 });
    lidCache.set(k, m);
  }
  return m;
}
const eyeCache = new Map<string, THREE.Material>();
function eyeMat(col: string) {
  let m = eyeCache.get(col);
  if (!m) { m = uw(new THREE.MeshPhysicalMaterial({ color: col, flatShading: true, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: col, emissiveIntensity: 0.25 }), { caustics: 0.15, rim: 0.2 }); eyeCache.set(col, m); }
  return m;
}
