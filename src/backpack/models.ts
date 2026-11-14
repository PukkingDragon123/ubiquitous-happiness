// Item MODELS (v3): every item is a small, dense, textured low-poly 3D object in the PS2-realistic look
// (flat-shaded facets, matte, clean painted pixel pages: grain, veins, rust runs, stitches, no noise speckle).
// The same model is the world pickup, the miniature lying in the backpack, the HUD counter, the card subject
// and (photographed by studio.ts) the flat icon wherever a picture is unavoidable.
//
//   itemModel('copperOre')            a new Object3D (cheap clone of a cached template), 1 unit = 1 grid cell,
//                                     centred on the origin, facing +Z (the viewer), fitted to the item's shape
//   itemModel('kelp', { cell: 0.5 })  scaled to 0.5 m per cell (world pickups)
//   hudModel('heart' | 'pearlCoin' | 'key' | 'bomb' | 'flask' | 'flaskEmpty')    HUD counters / consumables
//
// Weapons reuse the blobfish's gear builders (src/player/gear.ts); summons and gadgets reuse the skill props
// (src/skills/models.ts); anything without a bespoke model is its painted icon extruded into voxels.
import * as THREE from 'three';
import { Px, hex, worley, type RGB } from '../gfx/px';
import { T, tone, rect, bevel, rivet, rust, stitches, gemFacets, type Tones } from '../skills/texkit';
import { facet, xf } from '../player/psx';
import { hash2, TAU } from '../core/math';
import { getItem, ITEMS, type ItemDef } from '../game/items';
import { buildWeapon, type WeaponId } from '../player/gear';
import { inkBombMesh, mineMesh, turretMesh, ballistaMesh, crabMesh, netTrapMesh } from '../skills/models';
import { voxelMesh } from './voxel';
import { paintIconAt } from './icons';

type V2 = [number, number];
type V3 = [number, number, number];

// ------------------------------------------------------------------ textures & materials
const texCache = new Map<string, THREE.Texture>();
function tex(key: string, w: number, h: number, fn: (p: Px) => void): THREE.Texture {
  let t = texCache.get(key);
  if (!t) { const p = new Px(w, h); fn(p); t = p.texture({ repeat: true }); texCache.set(key, t); }
  return t;
}
interface MO { map?: THREE.Texture | null; color?: string; rough?: number; metal?: number; emissive?: string; emissiveK?: number; smooth?: boolean; side?: THREE.Side; opacity?: number }
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function M(key: string, o: MO | (() => MO)): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (!m) {
    const v = typeof o === 'function' ? o() : o;
    m = new THREE.MeshStandardMaterial({
      map: v.map ?? null, color: v.color ?? '#ffffff', flatShading: !v.smooth, roughness: v.rough ?? 0.78, metalness: v.metal ?? 0,
      side: v.side ?? THREE.FrontSide, transparent: v.opacity !== undefined, opacity: v.opacity ?? 1,
    });
    if (v.emissive) { m.emissive = new THREE.Color(v.emissive); m.emissiveIntensity = v.emissiveK ?? 0.6; if (v.map) m.emissiveMap = v.map; }
    matCache.set(key, m);
  }
  return m;
}
const shade = (c: RGB, k: number): RGB => (k >= 0 ? [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k] : [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)]);

// painted pages ---------------------------------------------------------------
/** faceted stone: clean worley patches in the stone tones, a few crack lines */
const STONE = (key: string, ts: Tones, seed = 1) => tex('stone:' + key, 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const [d, , id] = worley(x, y, 8, seed, 32); p.set(x, y, tone(ts, 1.4 + (id % 3) * 0.8 - (d > 0.75 ? 1 : 0))); }
  for (const [x, y, l] of [[5, 7, 7], [20, 18, 9], [12, 25, 5]] as V3[]) for (let i = 0; i < l; i++) p.set(x + i, y + Math.round(Math.sin(i * 0.9) * 1.2), tone(ts, 0));
});
/** ore: stone plus mineral veins and bright flecks */
const ORE = (key: string, ts: Tones, vein: Tones, seed = 2) => tex('ore:' + key, 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const [d, , id] = worley(x, y, 7, seed, 32); p.set(x, y, tone(ts, 1.3 + (id % 3) * 0.7 - (d > 0.78 ? 1 : 0))); }
  for (const [x0, y0, dx, dy, l] of [[2, 5, 1, 0.45, 26], [4, 20, 1, -0.3, 22], [14, 2, 0.2, 1, 24]] as number[][]) for (let i = 0; i < l; i++) {
    const x = Math.round(x0 + dx * i + Math.sin(i * 0.5) * 1.1), y = Math.round(y0 + dy * i);
    p.set(x & 31, y & 31, tone(vein, 2)); p.set((x + 1) & 31, y & 31, tone(vein, 3)); if (i % 5 === 0) p.set(x & 31, (y - 1) & 31, tone(vein, 4));
  }
  for (const [x, y] of [[9, 12], [24, 8], [27, 26], [6, 28], [17, 15]] as V2[]) { p.set(x, y, '#ffffff'); p.set(x + 1, y, tone(vein, 4)); }
});
/** wood with long grain, a knot and worm holes; tones run along u (the length) */
const GRAIN = (key: string, ts: Tones, holes = true) => tex('grain:' + key, 64, 16, (p) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
    const g = Math.sin(y * 1.7 + Math.sin(x * 0.11 + y) * 1.4) * 0.5 + 0.5;
    p.set(x, y, tone(ts, 1.6 + g * 1.6 - (y < 2 || y > 13 ? 0.6 : 0)));
  }
  for (let x = 0; x < 64; x += 9) p.set(x, 5 + (x % 7), tone(ts, 0));
  p.ellipse(40, 8, 3, 2, (nx, ny) => hex(Math.hypot(nx, ny) > 0.6 ? ts[0] : ts[1]));
  if (holes) for (const [x, y] of [[12, 4], [26, 11], [52, 6], [58, 12]] as V2[]) { p.set(x, y, '#140c08'); p.set(x + 1, y, '#140c08'); p.set(x, y - 1, tone(ts, 4)); }
});
const RINGS = (key: string, ts: Tones) => tex('rings:' + key, 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); p.set(x, y, d > 7.2 ? tone(ts, 0) : tone(ts, 2 + (Math.floor(d) % 2) * 1.2)); } p.set(7, 7, tone(ts, 0)); });
const RUSTY = (key: string, ts: Tones) => tex('rusty:' + key, 32, 32, (p) => {
  bevel(p, 0, 0, 32, 32, ts, 2);
  for (const [x, y, r] of [[8, 9, 4], [23, 20, 5], [12, 26, 3], [27, 5, 3]] as V3[]) p.ellipse(x, y, r, r * 0.8, (nx, ny) => hex(Math.hypot(nx, ny) > 0.7 ? '#7a3a14' : ny < 0 ? '#c0702c' : '#a0521c'));
  for (const [x, y, l] of [[6, 13, 6], [21, 25, 5]] as V3[]) rust(p, x, y, l);
});
const METAL = (key: string, ts: Tones) => tex('metal:' + key, 16, 16, (p) => { bevel(p, 0, 0, 16, 16, ts, 2); rect(p, 2, 3, 9, 1, tone(ts, 4)); rect(p, 3, 4, 3, 1, tone(ts, 4)); });
const GEM = (key: string, ts: Tones) => tex('gem:' + key, 16, 16, (p) => gemFacets(p, 0, 0, 16, 16, ts));
const RIBS = (key: string, ts: Tones, n = 8) => tex('ribs:' + key, 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const k = (x * n / 32) % 1; p.set(x, y, tone(ts, (k < 0.2 ? 4 : k < 0.6 ? 3 : 2) - (y > 26 ? 1 : 0))); } for (let x = 0; x < 32; x += 6) p.set(x, 30, tone(ts, 0)); });
const ROPE = (key: string, ts: Tones) => tex('rope:' + key, 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = ((x + y * 2) % 6) / 6; p.set(x, y, tone(ts, k < 0.3 ? 3 : k < 0.7 ? 2 : 1)); } });
const CLOTH = (key: string, ts: Tones, pat?: string) => tex('cloth:' + key, 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(ts, 2 + ((x + y) % 4 === 0 ? -0.6 : 0) + ((x - y + 64) % 4 === 0 ? 0.6 : 0)));
  stitches(p, 1, 1, 30, 1, tone(ts, 4) as unknown as string, '#1a0c08'); stitches(p, 1, 30, 30, 30, tone(ts, 4) as unknown as string, '#1a0c08');
  if (pat) for (let y = 6; y < 28; y += 8) for (let x = 6; x < 28; x += 8) p.set(x, y, pat);
});
const PAPER = () => tex('paper', 32, 32, (p) => { bevel(p, 0, 0, 32, 32, ['#5a4630', '#8a7050', '#c8b088', '#e8d8b0', '#fff4d8'], 3); for (let y = 6; y < 28; y += 4) rect(p, 4, y, 20 - (y % 8), 1, '#6a5038'); rect(p, 20, 18, 6, 6, '#a82020'); });
const LABEL = (key: string, bg: string, fg: string, txt: (p: Px) => void) => tex('label:' + key, 32, 16, (p) => { rect(p, 0, 0, 32, 16, bg); rect(p, 0, 0, 32, 1, fg); rect(p, 0, 15, 32, 1, fg); txt(p); });

// geometry ---------------------------------------------------------------------
/** a lumpy faceted rock: an icosphere with hash-jittered vertices (shared corners move together) */
function rockGeo(r: number, seed: number, s: V3 = [1, 1, 1], det = 1, amt = 0.28): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, det);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (hash2(Math.round(v.x * 97) + seed * 13, Math.round(v.y * 89) + Math.round(v.z * 83) * 7, seed) - 0.5) * amt * 2;
    pos.setXYZ(i, v.x * k * s[0], v.y * k * s[1], v.z * k * s[2]);
  }
  g.computeVertexNormals();
  return sphereUV(g, 1.4);
}
/** box-ish spherical uvs (good enough for stone pages) */
function sphereUV(g: THREE.BufferGeometry, rep = 1) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); uv[i * 2] = (Math.atan2(x, z) / TAU + 0.5) * rep; uv[i * 2 + 1] = (y * 0.9 + 0.5) * rep; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function frontUV(g: THREE.BufferGeometry, s = 1) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) * s + 0.5; uv[i * 2 + 1] = pos.getY(i) * s + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const cyl = (r0: number, r1: number, h: number, n = 7) => new THREE.CylinderGeometry(r1, r0, h, n, 1);
function tubeGeo(pts: V3[], r: number, segs = 6, closed = false): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  return new THREE.TubeGeometry(c, Math.max(8, pts.length * 4), r, segs, closed);
}
function latheGeo(prof: V2[], n = 10) { return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), n); }
function extrudeGeo(pts: V2[], depth: number, bevel = 0.02) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return frontUV(g, 1);
}
function crystalGeo(r: number, h: number, tip = 0.35, n = 6) {
  const body = cyl(r, r, h * (1 - tip), n); body.translate(0, h * (1 - tip) / 2, 0);
  const cap = new THREE.ConeGeometry(r, h * tip, n, 1); cap.translate(0, h * (1 - tip) + h * tip / 2, 0);
  return [body, cap];
}

/** the builder context: add parts to a group */
class B {
  g = new THREE.Group();
  add(geo: THREE.BufferGeometry, m: THREE.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 | number = 1) {
    const me = new THREE.Mesh(facet(xf(geo, pos, rot, scl)), m);
    me.castShadow = true; me.receiveShadow = true;
    this.g.add(me);
    return me;
  }
  addSmooth(geo: THREE.BufferGeometry, m: THREE.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 | number = 1) {
    const g2 = xf(geo, pos, rot, scl); g2.computeVertexNormals();
    const me = new THREE.Mesh(g2, m); me.castShadow = true; this.g.add(me); return me;
  }
  obj(o: THREE.Object3D, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], s = 1) { o.position.set(...pos); o.rotation.set(...rot); o.scale.multiplyScalar(s); this.g.add(o); return o; }
}

// shared materials --------------------------------------------------------------
const mStone = (k: string, ts: Tones, seed = 1) => M('stone:' + k, () => ({ map: STONE(k, ts, seed), rough: 0.9 }));
const mOre = (k: string, ts: Tones, vein: Tones) => M('ore:' + k, () => ({ map: ORE(k, ts, vein), rough: 0.75, metal: 0.1 }));
const mMetal = (k: string, ts: Tones, metal = 0.35) => M('metal:' + k, () => ({ map: METAL(k, ts), rough: 0.45, metal }));
const mRust = (k: string, ts: Tones) => M('rusty:' + k, () => ({ map: RUSTY(k, ts), rough: 0.8, metal: 0.2 }));
const mGem = (k: string, ts: Tones, glow = 0.25) => M('gem:' + k, () => ({ map: GEM(k, ts), rough: 0.2, metal: 0.1, emissive: ts[3], emissiveK: glow }));
const mFlat = (c: string, rough = 0.7, metal = 0) => M('flat:' + c + rough + metal, { color: c, rough, metal });
const mGlass = (c: string) => M('glass:' + c, { color: c, rough: 0.12, metal: 0.1, opacity: 0.72, smooth: true });

// ------------------------------------------------------------------ the models
const SAND: Tones = ['#3a2a18', '#6a5034', '#9a7c54', '#c8aa7a', '#ecd8a8'];
const COPPER: Tones = ['#3a120a', '#7a2e16', '#b85a2a', '#e08a48', '#ffc890'];
const PATINA: Tones = ['#0c2a2a', '#1d5a4e', '#2f9070', '#58c28e', '#a0eab6'];
const GOLD: Tones = T.gold;
const PEARL: Tones = ['#5a4a6a', '#9a8aae', '#d2c4dc', '#f2eaf2', '#ffffff'];
const SHELL: Tones = ['#5a3a34', '#9a6a5e', '#d4a090', '#f0c8b4', '#fff0e4'];
const KELP: Tones = ['#0a1a0a', '#1e3a14', '#36621e', '#5a8c2a', '#9cc04a'];
const DRIFT: Tones = T.drift;
const MANA: Tones = ['#120836', '#2a1a8a', '#4a4ad8', '#7aa8ff', '#d8f0ff'];
const AMETH: Tones = ['#1c0a33', '#3e1868', '#6a34a8', '#a062e2', '#e0b8ff'];
const AQUA: Tones = ['#042a2a', '#0a5a5c', '#14908e', '#3ccab8', '#a8f6e4'];
const RUBY: Tones = ['#2a0412', '#6a0a26', '#b01632', '#ec3a48', '#ffb0a0'];
const EMER: Tones = ['#032018', '#08482e', '#118040', '#36bc54', '#a8f088'];
const ABYSS: Tones = ['#0a0424', '#2a105c', '#4a2aa8', '#3a88ea', '#9af6ff'];
const CORAL: Tones = T.coral;
const IVORY: Tones = ['#4a3e2c', '#7e6e54', '#b4a482', '#e0d4b4', '#fffaec'];
const LEAD: Tones = ['#1a1c24', '#363a48', '#565c6e', '#7c8496', '#b0b8c6'];
const SEAG: Tones = ['#06302a', '#145a4c', '#2a907a', '#62c8a4', '#c8fff0'];

type Build = (b: B, d: ItemDef) => void;
const MODELS: Record<string, Build> = {
  // ================================================================ materials
  copperOre(b) {
    b.add(rockGeo(0.32, 3, [1.1, 0.9, 0.85]), mOre('cu', ['#3a3034', '#5a4e50', '#7c6c6a', '#a08c84', '#c8b4a8'], COPPER));
    for (const [x, y, z, s] of [[0.12, 0.14, 0.2, 0.14], [-0.18, 0.06, 0.18, 0.12], [0.02, -0.16, 0.22, 0.11], [0.22, -0.05, 0.1, 0.09]] as number[][]) b.add(rockGeo(s, 7 + x * 10, [1, 1, 1], 0, 0.3), M('cuNug', { color: '#e88a48', rough: 0.3, metal: 0.45, emissive: '#5a2010', emissiveK: 0.3 }), [x, y, z]);
    for (const [x, y, z] of [[-0.05, 0.2, 0.2], [0.24, 0.12, 0.08]] as V3[]) b.add(new THREE.OctahedronGeometry(0.05, 0), M('patina', { color: '#4ab88a', rough: 0.4, emissive: '#1a6a4a', emissiveK: 0.3 }), [x, y, z], [0.5, 0.3, 0.2], [1, 1.6, 1]);
  },
  ironOre(b) {
    b.add(rockGeo(0.33, 11, [1.05, 0.85, 0.9], 0, 0.22), mOre('fe', ['#2a2c38', '#444858', '#626a7c', '#8a94a8', '#b4bccc'], ['#20242e', '#4a5262', '#8a94a8', '#c8d2e2', '#ffffff']));
    for (const [x, y, z] of [[0.1, 0.12, 0.26], [-0.14, -0.08, 0.26], [0.2, -0.12, 0.18]] as V3[]) b.add(new THREE.BoxGeometry(0.07, 0.07, 0.05), mMetal('ironbit', T.steel, 0.6), [x, y, z], [0.4, 0.7, 0.2]);
  },
  goldNugget(b) {
    b.add(rockGeo(0.26, 19, [1.2, 0.85, 0.9], 1, 0.34), M('goldN', { map: METAL('gold', GOLD), rough: 0.3, metal: 0.65 }));
    b.add(rockGeo(0.12, 23, [1, 1, 1], 0, 0.3), M('goldN', { map: METAL('gold', GOLD), rough: 0.3, metal: 0.65 }), [0.24, -0.14, 0.05]);
  },
  riverStone(b) {
    b.addSmooth(rockGeo(0.3, 31, [1.25, 0.72, 0.9], 1, 0.08), M('pebble', () => ({ map: STONE('pebble', ['#3a3640', '#5e5a66', '#86828c', '#aeaab2', '#d6d2d8'], 4), rough: 0.6, smooth: true })));
    b.add(cyl(0.302, 0.302, 0.03, 12), mFlat('#d8d4cc', 0.6), [0, 0.02, 0], [0.2, 0, 1.4], [1.22, 1, 0.88]);
  },
  lodestone(b) {
    b.add(rockGeo(0.3, 41, [1, 0.9, 0.85], 0, 0.25), mStone('lode', ['#060608', '#14141c', '#22222e', '#34364a', '#545872'], 5));
    b.add(cyl(0.02, 0.02, 0.36), mMetal('nail', T.steel), [0.2, 0.18, 0.2], [0, 0, 0.9]);
    b.add(cyl(0.05, 0.05, 0.015, 8), mMetal('nail', T.steel), [0.05, 0.25, 0.2], [0, 0, 0.9]);
    b.add(cyl(0.09, 0.09, 0.025, 12), M('coin', { map: METAL('gold', GOLD), rough: 0.3, metal: 0.65 }), [-0.18, -0.12, 0.26], [1.3, 0, 0.3]);
  },
  pearl(b) {
    const sh = M('shellIn', () => ({ map: RIBS('clam', SHELL, 9), rough: 0.6, side: THREE.DoubleSide }));
    const half = new THREE.SphereGeometry(0.34, 10, 5, 0, TAU, 0, Math.PI / 2);
    b.add(half, sh, [0, -0.1, 0], [Math.PI, 0, 0], [1, 0.38, 0.85]);
    b.add(half, sh, [0, -0.04, -0.2], [-0.35, 0, 0], [1, 0.38, 0.85]);
    b.addSmooth(new THREE.IcosahedronGeometry(0.17, 3), M('pearl', { color: '#f4ecf2', rough: 0.18, metal: 0.15, smooth: true, emissive: '#3a2a3a', emissiveK: 0.2 }), [0, 0.06, 0.08]);
  },
  seashell(b) {
    const g = new THREE.SphereGeometry(0.34, 12, 6, Math.PI * 0.08, Math.PI * 0.84, 0, Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(x, z); const k = 1 + Math.abs(Math.sin(a * 9)) * 0.06; pos.setXYZ(i, x * k, pos.getY(i), z * k); }
    b.add(g, M('cockle', () => ({ map: RIBS('cockle', SHELL, 10), rough: 0.65, side: THREE.DoubleSide })), [0, -0.12, 0], [-1.2, 0, 0], [1, 1.1, 0.5]);
    b.add(new THREE.BoxGeometry(0.14, 0.06, 0.05), M('cockleH', { color: '#b07c74', rough: 0.7 }), [0, -0.2, 0.05]);
  },
  spiralShell(b) {
    const m = M('whelk', () => ({ map: RIBS('whelk', ['#4a2a24', '#8a5a4a', '#c89480', '#ecc0a8', '#fff0e0'], 4), rough: 0.6 }));
    for (let i = 0; i < 6; i++) { const t = i / 5; b.add(new THREE.ConeGeometry(0.2 * (1 - t * 0.75), 0.22, 8, 1), m, [-0.12 + t * 0.32, -0.08 + t * 0.26, 0], [0, 0, -0.9 + t * 0.1]); }
    b.add(new THREE.SphereGeometry(0.12, 8, 6), M('whelkLip', { color: '#f0a0a8', rough: 0.5 }), [-0.18, -0.12, 0.08], [0, 0, 0], [1, 0.7, 0.4]);
  },
  sharkTooth(b) {
    b.add(extrudeGeo([[0, 0.34], [0.2, -0.16], [0.12, -0.22], [0, -0.18], [-0.12, -0.22], [-0.2, -0.16]], 0.08, 0.025), M('tooth', () => ({ map: tex('tooth', 16, 16, (p) => { bevel(p, 0, 0, 16, 16, IVORY, 3); rect(p, 0, 12, 16, 4, tone(IVORY, 1)); }), rough: 0.5 })));
  },
  coralShard(b) {
    const m = M('coral', () => ({ map: tex('coralT', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(CORAL, 2.4 + ((x * 3 + y) % 5 === 0 ? 1.4 : 0) - (y > 13 ? 1 : 0))); }), rough: 0.85 }));
    const br = (pts: V3[], r: number) => b.add(tubeGeo(pts, r, 6), m);
    br([[0.3, -0.62, 0], [0.12, -0.4, 0], [-0.2, -0.2, 0.05], [-0.28, 0.1, 0]], 0.07);
    br([[-0.28, 0.1, 0], [-0.3, 0.4, 0.02], [-0.22, 0.62, 0]], 0.05);
    br([[-0.28, 0.1, 0], [-0.08, 0.3, 0.04], [0.0, 0.5, 0]], 0.045);
    br([[0.12, -0.4, 0], [0.4, -0.3, 0.03], [0.55, -0.12, 0]], 0.05);
    br([[-0.2, -0.2, 0.05], [-0.44, -0.1, 0.05], [-0.56, 0.08, 0]], 0.04);
    for (const p of [[-0.22, 0.62, 0], [0.0, 0.5, 0], [0.55, -0.12, 0], [-0.56, 0.08, 0]] as V3[]) b.add(new THREE.IcosahedronGeometry(0.06, 0), M('polyp', { color: '#ffd0b0', rough: 0.6, emissive: '#ff8a5a', emissiveK: 0.25 }), p);
    b.add(rockGeo(0.16, 51, [1.5, 0.5, 1], 0), mStone('base', T.slate, 3), [0.32, -0.66, 0]);
  },
  kelp(b) {
    // a bundle of fronds tied with twine
    const m = M('kelpF', () => ({ map: tex('kelpT', 16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) { const e = Math.abs(x - 7.5) / 8; p.set(x, y, tone(KELP, 3.2 - e * 2 - (x === 7 ? 1.4 : 0) + ((y + x) % 9 === 0 ? 0.6 : 0))); } }), rough: 0.7, side: THREE.DoubleSide }));
    for (let i = 0; i < 4; i++) {
      const g = new THREE.PlaneGeometry(0.18, 1.5, 1, 8);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) { const y = pos.getY(j), x = pos.getX(j); pos.setXYZ(j, x * (1 - Math.abs(y) * 0.5) + Math.sin(y * 4 + i) * 0.07, y, Math.sin(y * 3 + i * 1.7) * 0.05 + Math.abs(x) * 0.3); }
      b.add(g, m, [-0.12 + i * 0.08, 0, 0.02 * i], [0, 0, (i - 1.5) * 0.08]);
    }
    for (const y of [-0.42, 0.1, 0.48]) b.add(new THREE.SphereGeometry(0.06, 6, 4), M('bladder', { color: '#9a8a2c', rough: 0.5 }), [0.02, y, 0.08]);
    b.add(new THREE.TorusGeometry(0.14, 0.03, 4, 10), M('twine', () => ({ map: ROPE('twine', T.rope), rough: 0.9 })), [0, -0.2, 0], [Math.PI / 2, 0, 0], [1, 1, 0.6]);
  },
  driftwood(b) {
    const m = M('drift', () => ({ map: GRAIN('drift', DRIFT), rough: 0.9 }));
    const log = cyl(0.13, 0.17, 1.6, 7);
    const pos = log.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) + Math.sin(y * 3) * 0.05); pos.setZ(i, pos.getZ(i) + Math.cos(y * 2.3) * 0.03); }
    b.add(log, m, [0, 0, 0], [0, 0, Math.PI / 2 + 0.12]);
    b.add(cyl(0.04, 0.07, 0.42, 6), m, [0.2, 0.16, 0], [0, 0, -0.6]);
    b.add(new THREE.CircleGeometry(0.16, 7), M('driftEnd', () => ({ map: RINGS('drift', DRIFT), rough: 0.9 })), [-0.8, -0.1, 0], [0, -Math.PI / 2, 0]);
  },
  cork(b) {
    b.add(cyl(0.16, 0.13, 0.42, 9), M('cork', () => ({ map: tex('corkT', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(T.leather.map((c, i) => ['#3a2410', '#6a4420', '#a07040', '#c89a62', '#ecc890'][i] ?? c), 2.6 + (hash2(x, y, 4) < 0.18 ? -1.4 : hash2(x, y, 5) < 0.1 ? 1 : 0))); }), rough: 0.95 })), [0, 0, 0], [0.3, 0, 0.75]);
  },
  lineScrap(b) {
    const m = M('mono', { color: '#9cd8e2', rough: 0.25, metal: 0.1, emissive: '#2e6274', emissiveK: 0.2 });
    for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.22 - i * 0.02, 0.018, 4, 16), m, [Math.sin(i) * 0.04, Math.cos(i * 2) * 0.03, i * 0.02], [0.4 + i * 0.5, i * 0.6, 0]);
    b.add(tubeGeo([[0.18, -0.1, 0], [0.32, -0.25, 0.02], [0.28, -0.38, 0]], 0.016, 4), m);
    b.add(new THREE.IcosahedronGeometry(0.04, 0), mMetal('lead', LEAD), [0.28, -0.4, 0]);
  },
  rustyHook(b) {
    const pts: V3[] = [[0, 0.36, 0], [0, -0.06, 0], [-0.04, -0.24, 0], [-0.18, -0.3, 0], [-0.28, -0.18, 0], [-0.26, 0.0, 0]];
    b.add(tubeGeo(pts, 0.04, 6), mRust('hook', T.iron));
    b.add(new THREE.TorusGeometry(0.07, 0.03, 5, 10), mRust('hook', T.iron), [0, 0.42, 0]);
    b.add(new THREE.ConeGeometry(0.05, 0.12, 4), mRust('hook', T.iron), [-0.26, 0.06, 0], [0, 0, -0.3]);
  },
  rustyNail(b) {
    b.add(cyl(0.035, 0.035, 0.8, 6), mRust('nail', T.iron), [0, 0, 0], [0, 0, -0.75]);
    b.add(cyl(0.09, 0.09, 0.03, 8), mRust('nail', T.iron), [-0.27, 0.25, 0], [0, 0, -0.75]);
    b.add(new THREE.ConeGeometry(0.035, 0.1, 6), mRust('nail', T.iron), [0.29, -0.27, 0], [0, 0, Math.PI - 0.75]);
  },
  leadShot(b) {
    for (const [x, y, r] of [[0.14, -0.06, 0.16], [-0.14, 0.1, 0.13], [-0.1, -0.16, 0.12]] as V3[]) {
      b.add(new THREE.IcosahedronGeometry(r, 1), mMetal('lead', LEAD, 0.45), [x, y, 0]);
      b.add(new THREE.BoxGeometry(r * 2.1, 0.02, 0.02), mFlat('#14161e'), [x, y, r * 0.9]);
    }
  },
  seaGlass(b) {
    for (const [x, y, c, s] of [[-0.16, 0.08, '#5cc29a', 0.2], [0.14, -0.04, '#58a8d8', 0.17], [-0.02, -0.2, '#e8a050', 0.12]] as [number, number, string, number][]) b.addSmooth(rockGeo(s, x * 20, [1.2, 0.8, 0.45], 1, 0.12), M('sglass' + c, { color: c, rough: 0.55, smooth: true, emissive: c, emissiveK: 0.15 }), [x, y, 0]);
  },
  amethyst(b) { cluster(b, AMETH, 'ameth', [[0, 0.62, 0.1], [-0.2, 0.42, 0.08], [0.2, 0.46, 0.08], [-0.08, 0.36, 0.07], [0.12, 0.3, 0.06]], 0.2); },
  aquamarine(b) { cluster(b, AQUA, 'aqua', [[-0.05, 0.7, 0.11], [0.16, 0.5, 0.09]], 0.25); },
  manaCrystal(b) { cluster(b, MANA, 'mana', [[0, 0.68, 0.11], [-0.22, 0.46, 0.08], [0.22, 0.42, 0.08]], 0.55); },
  abyssCrystal(b) { cluster(b, ABYSS, 'abyss', [[0, 1.5, 0.15], [-0.22, 0.8, 0.09], [0.24, 0.9, 0.1], [-0.1, 0.5, 0.06]], 0.8); },
  ruby(b) { cutGem(b, RUBY, 'ruby', 8); },
  emerald(b) { cutGem(b, EMER, 'emer', 4); },
  doubloon(b) {
    const m = M('coinFace', () => ({ map: tex('doub', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5); p.set(x, y, tone(GOLD, d > 13 ? 2 : d > 12 ? 4 : 3)); } const sk = ['.###.', '#####', '#.#.#', '#####', '.#.#.']; sk.forEach((r, y) => { for (let x = 0; x < 5; x++) if (r[x] === '#') { rect(p, 11 + x * 2, 11 + y * 2, 2, 2, tone(GOLD, 1)); p.set(11 + x * 2, 11 + y * 2, tone(GOLD, 4)); } }); }), rough: 0.3, metal: 0.65 }));
    b.add(cyl(0.3, 0.3, 0.06, 14), M('coinEdge', { map: METAL('gold', GOLD), rough: 0.3, metal: 0.65 }), [0, 0, 0], [Math.PI / 2, 0, 0]);
    b.add(new THREE.CircleGeometry(0.29, 14), m, [0, 0, 0.032]);
  },
  urchinSpine(b) {
    const m = M('spine', { color: '#963a90', rough: 0.5 });
    for (let i = 0; i < 9; i++) { const a = -0.6 + i * 0.15; b.add(new THREE.ConeGeometry(0.025, 0.7, 4), m, [Math.sin(a) * 0.22, 0.05 + Math.cos(a) * 0.1, (i % 3) * 0.03], [0, 0, -a]); }
    b.add(cyl(0.09, 0.08, 0.14, 8), M('twine', () => ({ map: ROPE('twine', T.rope), rough: 0.9 })), [0, -0.32, 0]);
  },
  glassLens(b) {
    b.add(new THREE.TorusGeometry(0.26, 0.045, 5, 16), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }));
    b.addSmooth(new THREE.SphereGeometry(0.26, 14, 6), mGlass('#b8ecec'), [0, 0, 0], [0, 0, 0], [1, 1, 0.18]);
    b.add(new THREE.BoxGeometry(0.02, 0.2, 0.01), mFlat('#ffffff', 0.2), [-0.04, 0.02, 0.06], [0, 0, 0.5]);
    b.add(tubeGeo([[0.24, -0.1, 0], [0.34, -0.2, 0], [0.42, -0.36, 0]], 0.02, 4), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }));
  },
  scrap(b) {
    const plate = (w: number, h: number, bend: number) => { const g = new THREE.BoxGeometry(w, h, 0.03, 4, 1, 1); const pos = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, pos.getZ(i) + x * x * bend); } return frontUV(g, 1.3); };
    b.add(plate(0.9, 0.42, 0.5), mRust('scrapA', T.iron), [-0.28, 0.04, 0], [0, 0, 0.18]);
    b.add(plate(0.62, 0.34, -0.6), mRust('scrapB', T.slate), [0.36, -0.06, 0.06], [0.2, 0.2, -0.25]);
    for (const [x, y] of [[-0.6, 0.12], [-0.02, -0.06], [0.52, 0.02], [0.2, -0.16]] as V2[]) b.add(cyl(0.035, 0.035, 0.04, 6), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }), [x, y, 0.06], [Math.PI / 2, 0, 0]);
    b.add(tubeGeo(Array.from({ length: 13 }, (_, i) => [0.05 + i * 0.03, -0.24 + Math.sin(i * 1.6) * 0.04, 0.08 + Math.cos(i * 1.6) * 0.04] as V3), 0.012, 4), mMetal('steel', T.steel));
  },
  // ================================================================ consumables / tools
  wormCan(b) {
    b.add(cyl(0.24, 0.24, 0.44, 12), M('can', () => ({ map: LABEL('worm', '#c8342c', '#f0e0c0', (p) => { rect(p, 6, 5, 20, 6, '#f0e0c0'); for (let x = 8; x < 24; x += 3) p.set(x, 8, '#c8342c'); }), rough: 0.5, metal: 0.3 })), [0, -0.08, 0]);
    b.add(cyl(0.245, 0.245, 0.03, 12), mMetal('tin', T.steel, 0.5), [0, 0.15, 0]);
    for (let i = 0; i < 3; i++) b.add(tubeGeo([[-0.1 + i * 0.1, 0.12, 0], [-0.12 + i * 0.1 + Math.sin(i) * 0.05, 0.3, 0.02], [-0.08 + i * 0.1, 0.42 - i * 0.05, 0]], 0.03, 5), M('worm', { color: '#e47c9a', rough: 0.5 }));
  },
  tackleBox(b) {
    const m = M('tackle', () => ({ map: tex('tackleT', 32, 16, (p) => { bevel(p, 0, 0, 32, 16, T.green, 2); rect(p, 0, 5, 32, 1, tone(T.green, 0)); rect(p, 22, 8, 7, 5, '#f0f0f0'); rect(p, 24, 10, 3, 1, '#2650a8'); }), rough: 0.55, metal: 0.25 }));
    b.add(new THREE.BoxGeometry(2.4, 1.1, 0.6), m, [0, -0.15, 0]);
    b.add(new THREE.BoxGeometry(2.45, 0.3, 0.65), m, [0, 0.48, 0]);
    b.add(new THREE.TorusGeometry(0.28, 0.05, 4, 10, Math.PI), mFlat('#222630', 0.6), [0, 0.64, 0]);
    for (const x of [-0.9, 0, 0.9]) b.add(new THREE.BoxGeometry(0.16, 0.2, 0.05), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }), [x, 0.32, 0.33]);
  },
  lineSpool(b) {
    b.add(cyl(0.2, 0.2, 0.5, 14), M('spoolLine', () => ({ map: tex('spoolT', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(['#14303c', '#2e6274', '#5fa2b4', '#9cd8e2', '#dcf8fc'], 2.5 + (y % 2) + (x === 3 ? 1 : 0))); }), rough: 0.35 })), [0, 0, 0], [0, 0, Math.PI / 2]);
    for (const x of [-0.27, 0.27]) b.add(cyl(0.32, 0.32, 0.05, 12), M('spoolEnd', () => ({ map: RINGS('spool', T.oak), rough: 0.8 })), [x, 0, 0], [0, 0, Math.PI / 2]);
  },
  corkBobber(b) {
    b.addSmooth(new THREE.SphereGeometry(0.3, 10, 8, 0, TAU, 0, Math.PI / 2), M('bobRed', { color: '#d8382e', rough: 0.45, smooth: true }), [0, 0.0, 0], [0, 0, 0], [1, 1.5, 1]);
    b.addSmooth(new THREE.SphereGeometry(0.3, 10, 8, 0, TAU, Math.PI / 2, Math.PI / 2), M('bobWhite', { color: '#f2f0ea', rough: 0.45, smooth: true }), [0, 0.0, 0], [0, 0, 0], [1, 1.3, 1]);
    b.add(cyl(0.022, 0.022, 1.3, 5), M('stick', () => ({ map: GRAIN('oak', T.oak, false), rough: 0.8 })));
  },
  leadSinker(b) {
    b.add(latheGeo([[0, -0.3], [0.2, -0.22], [0.24, -0.05], [0.16, 0.14], [0.05, 0.26], [0, 0.28]], 8), mMetal('lead', LEAD, 0.45));
    b.add(new THREE.TorusGeometry(0.07, 0.022, 4, 10), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }), [0, 0.36, 0]);
  },
  reelGear(b) {
    const pts: V2[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) for (const [da, r] of [[0, 0.3], [0.12, 0.38], [0.5, 0.38], [0.62, 0.3]] as V2[]) { const a = ((i + da) / n) * TAU; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const g = extrudeGeo(pts, 0.08, 0.015);
    b.add(g, M('gear', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }));
    b.add(cyl(0.12, 0.12, 0.12, 10), mMetal('steel', T.steel), [0, 0, 0], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.05, 0.05, 0.14, 6), mFlat('#14141c'), [0, 0, 0], [Math.PI / 2, 0, 0]);
  },
  // ================================================================ trinkets
  bottleCap(b) {
    const pts: V2[] = []; for (let i = 0; i < 42; i++) { const a = (i / 42) * TAU; const r = i % 2 ? 0.3 : 0.34; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    b.add(extrudeGeo(pts, 0.1, 0.01), M('capRed', { color: '#c8302a', rough: 0.4, metal: 0.4 }));
    b.add(new THREE.CircleGeometry(0.24, 16), M('capFace', () => ({ map: tex('capT', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, Math.hypot(x - 7.5, y - 7.5) > 6.5 ? '#a82020' : '#e8e0d0'); for (const [x, y] of [[7, 3], [8, 3], [4, 6], [11, 6], [5, 10], [10, 10], [7, 8], [8, 8]] as V2[]) p.set(x, y, '#e8a020'); }), rough: 0.5 })), [0, 0, 0.065]);
  },
  rubberDuck(b) {
    const m = M('duck', { color: '#f8c828', rough: 0.4, smooth: true });
    b.addSmooth(new THREE.SphereGeometry(0.3, 12, 8), m, [0.04, -0.1, 0], [0, 0, 0], [1.25, 0.8, 1]);
    b.addSmooth(new THREE.SphereGeometry(0.19, 12, 8), m, [-0.14, 0.22, 0.02]);
    b.add(new THREE.ConeGeometry(0.08, 0.16, 6), M('beak', { color: '#f07a20', rough: 0.5 }), [-0.36, 0.2, 0.02], [0, 0, Math.PI / 2], [1, 1, 0.6]);
    for (const z of [0.12]) b.add(new THREE.SphereGeometry(0.035, 6, 4), mFlat('#141418', 0.3), [-0.22, 0.28, z]);
    b.add(new THREE.ConeGeometry(0.1, 0.18, 5), m, [0.36, 0.0, 0], [0, 0, -0.9]);
  },
  teacup(b) {
    b.add(latheGeo([[0, -0.2], [0.14, -0.2], [0.2, -0.1], [0.26, 0.12], [0.24, 0.13], [0.18, -0.08], [0, -0.12]], 14), M('china', () => ({ map: tex('china', 32, 16, (p) => { rect(p, 0, 0, 32, 16, '#f2f5ff'); for (let x = 0; x < 32; x += 4) { rect(p, x, 6, 2, 2, '#2650a8'); p.set(x + 1, 9, '#3f80dc'); } rect(p, 0, 13, 32, 1, '#d8b040'); }), rough: 0.3 })));
    b.add(new THREE.TorusGeometry(0.08, 0.025, 4, 8), mFlat('#f2f5ff', 0.3), [0.28, 0.0, 0]);
    b.add(new THREE.CircleGeometry(0.2, 14), mFlat('#8a4a1c', 0.2), [0, 0.08, 0], [-Math.PI / 2, 0, 0]);
    b.add(cyl(0.36, 0.3, 0.04, 16), mFlat('#eef2fa', 0.35), [0, -0.22, 0]);
  },
  boneDice(b) {
    const m = M('die', () => ({ map: tex('dieT', 16, 16, (p) => { bevel(p, 0, 0, 16, 16, IVORY, 3); for (const [x, y] of [[4, 4], [11, 4], [7, 7], [4, 11], [11, 11]] as V2[]) { rect(p, x, y, 2, 2, '#2a1a10'); } }), rough: 0.55 }));
    b.add(new THREE.BoxGeometry(0.34, 0.34, 0.34), m, [-0.16, 0.08, 0], [0.5, 0.6, 0.1]);
    b.add(new THREE.BoxGeometry(0.28, 0.28, 0.28), m, [0.2, -0.14, 0.04], [0.3, -0.5, 0.4]);
  },
  starfish(b) {
    const pts: V2[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.14 : 0.4; pts.push([Math.cos(a) * r, -Math.sin(a) * r]); }
    b.add(extrudeGeo(pts, 0.1, 0.05), M('star', () => ({ map: tex('starT', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(T.coral.map((c) => c), 3 - ((x + y) % 4 === 0 ? -1 : 0))); }), rough: 0.7 })));
  },
  crabClaw(b) {
    const m = M('claw', { color: '#d03a2a', rough: 0.45 });
    b.addSmooth(new THREE.SphereGeometry(0.26, 10, 8), m, [-0.04, -0.02, 0], [0, 0, 0.5], [1.2, 0.8, 0.6]);
    b.add(new THREE.ConeGeometry(0.1, 0.42, 6), m, [0.22, 0.24, 0], [0, 0, -0.5]);
    b.add(new THREE.ConeGeometry(0.08, 0.36, 6), m, [0.3, 0.06, 0], [0, 0, -1.1]);
    b.add(cyl(0.07, 0.09, 0.34, 6), m, [-0.3, -0.22, 0], [0, 0, 0.9]);
    for (const p of [[0.2, 0.2, 0.06], [0.26, 0.12, 0.05]] as V3[]) b.add(new THREE.TetrahedronGeometry(0.03), mFlat('#fff0dc'), p);
  },
  compass(b) {
    b.add(cyl(0.3, 0.3, 0.1, 16), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }), [0, 0, 0], [Math.PI / 2, 0, 0]);
    b.add(new THREE.CircleGeometry(0.25, 16), M('compFace', () => ({ map: tex('compT', 16, 16, (p) => { rect(p, 0, 0, 16, 16, '#e8d8b0'); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; p.set(Math.round(7.5 + Math.cos(a) * 6), Math.round(7.5 + Math.sin(a) * 6), '#5a4630'); } }), rough: 0.6 })), [0, 0, 0.052]);
    b.add(new THREE.ConeGeometry(0.04, 0.2, 3), mFlat('#c8302a'), [0, 0.09, 0.06]);
    b.add(new THREE.ConeGeometry(0.04, 0.2, 3), mFlat('#4a5062'), [0, -0.09, 0.06], [0, 0, Math.PI]);
    b.add(new THREE.TorusGeometry(0.06, 0.02, 4, 8), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }), [0, 0.36, 0]);
  },
  brassKey(b) {
    const br = M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 });
    b.add(cyl(0.035, 0.035, 0.5, 6), br, [0.08, -0.08, 0], [0, 0, 0.8]);
    for (const a of [0, Math.PI]) b.add(new THREE.SphereGeometry(0.15, 8, 5), br, [-0.16 + Math.cos(a + 2.4) * 0.13, 0.14 + Math.sin(a + 2.4) * 0.13, 0], [0, 0, a + 2.4], [1, 0.6, 0.35]);
    b.add(new THREE.BoxGeometry(0.1, 0.1, 0.1), br, [0.26, -0.26, 0], [0, 0, 0.8]);
  },
  spinnerSpoon(b) {
    b.addSmooth(new THREE.SphereGeometry(0.22, 10, 6), M('spoon', { color: '#d8dee8', rough: 0.15, metal: 0.7, smooth: true }), [-0.05, 0.08, 0], [0, 0, 0.35], [0.6, 1, 0.15]);
    b.add(cyl(0.012, 0.012, 0.8, 4), mMetal('steel', T.steel));
    b.add(new THREE.IcosahedronGeometry(0.05, 0), mFlat('#d8382e', 0.4), [0, -0.26, 0]);
    for (const a of [-0.6, 0.6]) b.add(tubeGeo([[0, -0.38, 0], [Math.sin(a) * 0.08, -0.46, 0], [Math.sin(a) * 0.1, -0.38, 0]], 0.012, 3), mMetal('steel', T.steel));
  },
  bottleMessage(b) {
    b.addSmooth(latheGeo([[0, -0.6], [0.24, -0.58], [0.26, 0.2], [0.12, 0.38], [0.1, 0.62], [0, 0.62]], 10), mGlass('#5cc29a'), [0, 0, 0], [0, 0, Math.PI / 2]);
    b.add(cyl(0.1, 0.09, 0.14, 8), M('cork', () => ({ map: STONE('corkB', ['#3a2410', '#6a4420', '#a07040', '#c89a62', '#ecc890'], 9), rough: 0.95 })), [0.66, 0, 0], [0, 0, Math.PI / 2]);
    b.add(cyl(0.12, 0.12, 0.6, 8), M('scroll', () => ({ map: PAPER(), rough: 0.8 })), [-0.12, 0, 0], [0, 0, Math.PI / 2]);
  },
  sharkNecklace(b) {
    b.add(new THREE.TorusGeometry(0.62, 0.02, 4, 24, Math.PI), M('cord', () => ({ map: ROPE('cord', T.rope), rough: 0.9 })), [0, 0.32, 0], [0, 0, Math.PI]);
    for (let i = 0; i < 6; i++) { const a = Math.PI * (0.12 + i * 0.152); b.add(new THREE.IcosahedronGeometry(0.05, 0), mFlat(i % 2 ? '#2fc8b6' : '#e8603a', 0.4), [Math.cos(a) * 0.62, 0.32 - Math.sin(a) * 0.62, 0.02]); }
    b.add(extrudeGeo([[0, -0.2], [0.11, 0.08], [-0.11, 0.08]], 0.05, 0.015), M('tooth2', { color: '#ece4d0', rough: 0.5 }), [0, -0.38, 0.02]);
  },
  anglerLantern(b) {
    b.add(tubeGeo([[-0.1, -0.8, 0], [-0.18, -0.2, 0], [-0.05, 0.4, 0], [0.18, 0.5, 0], [0.2, 0.3, 0]], 0.04, 5), M('stalk', { color: '#62346a', rough: 0.6 }));
    b.addSmooth(new THREE.IcosahedronGeometry(0.17, 2), M('lure', { color: '#e0f040', rough: 0.3, smooth: true, emissive: '#c8f020', emissiveK: 1.2 }), [0.2, 0.18, 0]);
  },
  mermaidScale(b) {
    const pts: V2[] = []; for (let i = 0; i <= 14; i++) { const a = Math.PI * (i / 14); pts.push([Math.cos(a) * 0.32, 0.06 + Math.sin(a) * 0.28]); } pts.push([0, -0.4]);
    b.add(extrudeGeo(pts, 0.04, 0.03), M('scale', () => ({ map: tex('scaleT', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (x + y) / 30; p.set(x, y, hex(k < 0.33 ? '#6a9cff' : k < 0.66 ? '#3ccab8' : '#e47c9a')); } }), rough: 0.25, metal: 0.4, emissive: '#2a6a8a', emissiveK: 0.2 })));
  },
  cutpursePouch(b) {
    b.addSmooth(new THREE.SphereGeometry(0.32, 10, 8), M('pouch', () => ({ map: CLOTH('pouch', T.leather), rough: 0.85 })), [0, -0.08, 0], [0, 0, 0], [1, 0.9, 0.8]);
    b.add(new THREE.ConeGeometry(0.16, 0.2, 8, 1, true), M('pouch', () => ({ map: CLOTH('pouch', T.leather), rough: 0.85 })), [0, 0.3, 0], [Math.PI, 0, 0]);
    b.add(new THREE.TorusGeometry(0.1, 0.025, 4, 10), M('twine', () => ({ map: ROPE('twine', T.rope), rough: 0.9 })), [0, 0.22, 0], [Math.PI / 2, 0, 0]);
    for (const [x, y] of [[-0.08, 0.36], [0.08, 0.34]] as V2[]) b.add(cyl(0.07, 0.07, 0.02, 10), M('coin', { map: METAL('gold', GOLD), rough: 0.3, metal: 0.65 }), [x, y, 0.02], [1.2, 0, x]);
  },
  inkSac(b) { b.addSmooth(new THREE.SphereGeometry(0.3, 10, 8), M('inkS', { color: '#3a2a6a', rough: 0.2, smooth: true }), [0, -0.05, 0], [0, 0, 0], [0.9, 1.1, 0.8]); b.add(cyl(0.04, 0.06, 0.2, 6), M('flesh', { color: '#62346a', rough: 0.6 }), [0.05, 0.36, 0], [0, 0, -0.3]); },
  pufferSpines(b) { puffer(b, 0.3); },
  // ================================================================ gadgets & summons (skill props)
  inkBomb(b) { b.obj(inkBombMesh(), [0, -0.05, 0], [0, 0, 0], 2.6); },
  seaMine(b) { b.obj(mineMesh().root, [0, 0, 0], [0, 0, 0], 1.6); },
  junkTurret(b) { b.obj(turretMesh().root, [0, -0.3, 0], [0, 0.6, 0], 1.4); },
  harpoonBallista(b) { b.obj(ballistaMesh().root, [0, -0.2, 0], [0, 0.5, 0], 1.2); },
  petCrab(b) { b.obj(crabMesh().root, [0, -0.1, 0], [0.3, 0.4, 0], 1.6); },
  netTrap(b) { b.obj(netTrapMesh(), [0, 0, 0], [0.5, 0, 0], 1.6); },
  venomVial(b) { vial(b, '#6ae03a', '#2a8a16'); },
  // ================================================================ weapons (the blobfish's own gear builders)
  apprenticeWand(b) { weapon(b, 'wand'); },
  coralStaff(b) { weapon(b, 'staff', Math.PI / 2); },
  cutlass(b) { weapon(b, 'sword'); },
  bronzeBlade(b) { weapon(b, 'dagger'); },
  tideTrident(b) { weapon(b, 'trident', Math.PI / 2); },
  pipeWrench(b) { weapon(b, 'wrench'); },
  stingrayBarb(b) { weapon(b, 'dagger'); },
  filletKnife(b) { weapon(b, 'dagger'); },
};

function weapon(b: B, id: WeaponId, rot = 0) {
  const w = buildWeapon(id);
  // gear builders run their materials through the underwater patch: fine in the world; the HUD stage lights them too
  w.rotation.z = rot; b.g.add(w);
}
function cluster(b: B, ts: Tones, key: string, cs: [number, number, number][], glow: number) {
  const m = mGem(key, ts, glow);
  b.add(rockGeo(0.3, 61, [1.4, 0.45, 0.9], 0, 0.2), mStone('matrix', ['#0c0a12', '#1e1a26', '#34303e', '#4c4656', '#6a6474'], 6), [0, -0.3, 0]);
  cs.forEach(([x, h, r], i) => {
    const tilt = x * 1.6 + (i % 2 ? 0.12 : -0.08);
    for (const g of crystalGeo(r, h)) b.add(g, m, [x, -0.32, (i % 3) * 0.04], [0.15, 0, -tilt]);
  });
}
function cutGem(b: B, ts: Tones, key: string, n: number) {
  const m = mGem(key, ts, 0.3);
  b.add(cyl(0.34, 0.26, 0.12, n), m, [0, 0.0, 0.0], [Math.PI / 2, 0, 0]);
  b.add(new THREE.ConeGeometry(0.34, 0.26, n), m, [0, 0, -0.19], [-Math.PI / 2, 0, 0]);
  b.add(cyl(0.2, 0.2, 0.02, n), M('gemTable' + key, { color: ts[4], rough: 0.1, emissive: ts[3], emissiveK: 0.3 }), [0, 0, 0.07], [Math.PI / 2, 0, 0]);
}
function puffer(b: B, r: number, fuse = false) {
  const m = M('puffer', () => ({ map: tex('pufT', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y > 10 ? '#f8eecc' : (x + y * 3) % 7 === 0 ? '#8a4a08' : '#eab040'); }), rough: 0.55 }));
  b.addSmooth(new THREE.IcosahedronGeometry(r, 2), m);
  const spike = M('pufSpike', { color: '#fff2c0', rough: 0.5 });
  for (let i = 0; i < 26; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / 26), th = i * 2.4;
    const d = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
    const cone = new THREE.ConeGeometry(r * 0.09, r * 0.35, 4);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const e = new THREE.Euler().setFromQuaternion(q);
    b.add(cone, spike, [d.x * r * 1.05, d.y * r * 1.05, d.z * r * 1.05], [e.x, e.y, e.z]);
  }
  for (const z of [-1, 1]) { b.add(new THREE.SphereGeometry(r * 0.2, 8, 6), mFlat('#ffffff', 0.3), [-r * 0.55, r * 0.25, z * r * 0.62]); b.add(new THREE.SphereGeometry(r * 0.1, 6, 4), mFlat('#101014', 0.2), [-r * 0.68, r * 0.25, z * r * 0.72]); }
  if (fuse) {
    b.add(cyl(0.05, 0.06, 0.08, 6), M('brass', { map: METAL('brass', T.brass), rough: 0.35, metal: 0.6 }), [r * 0.3, r * 0.95, 0], [0, 0, -0.4]);
    b.add(tubeGeo([[r * 0.34, r * 1.0, 0], [r * 0.5, r * 1.35, 0.02], [r * 0.75, r * 1.4, 0]], 0.02, 4), mFlat('#c8a060', 0.9));
    b.add(new THREE.IcosahedronGeometry(0.06, 0), M('spark', { color: '#fff2a0', emissive: '#ff8a2a', emissiveK: 2 }), [r * 0.8, r * 1.42, 0]);
  }
}
function vial(b: B, liquid: string, dark: string) {
  b.add(latheGeo([[0, -0.32], [0.22, -0.28], [0.26, -0.05], [0.2, 0.14], [0.08, 0.22], [0.08, 0.34], [0, 0.34]], 10), mGlass('#c8f0e8'));
  b.addSmooth(new THREE.SphereGeometry(0.22, 10, 6, 0, TAU, Math.PI * 0.42, Math.PI * 0.58), M('liq' + liquid, { color: liquid, rough: 0.2, smooth: true, emissive: dark, emissiveK: 0.6 }), [0, -0.06, 0]);
  b.add(cyl(0.09, 0.08, 0.1, 8), M('cork', () => ({ map: STONE('corkB', ['#3a2410', '#6a4420', '#a07040', '#c89a62', '#ecc890'], 9), rough: 0.95 })), [0, 0.38, 0]);
}

// ------------------------------------------------------------------ HUD / pickup props
const HUD_MODELS: Record<string, (b: B) => void> = {
  heart(b) {
    const m = M('heartJelly', { color: '#ff4a6a', rough: 0.25, smooth: true, emissive: '#a01030', emissiveK: 0.35 });
    b.addSmooth(new THREE.SphereGeometry(0.22, 12, 8), m, [-0.15, 0.08, 0]);
    b.addSmooth(new THREE.SphereGeometry(0.22, 12, 8), m, [0.15, 0.08, 0]);
    b.addSmooth(new THREE.ConeGeometry(0.33, 0.42, 12), m, [0, -0.2, 0], [Math.PI, 0, 0], [1, 1, 0.66]);
    b.add(new THREE.SphereGeometry(0.06, 6, 4), mFlat('#ffffff', 0.1), [-0.2, 0.18, 0.18]);
  },
  pearlCoin(b) { b.addSmooth(new THREE.IcosahedronGeometry(0.3, 3), M('pearl', { color: '#f4ecf2', rough: 0.18, metal: 0.15, smooth: true, emissive: '#3a2a3a', emissiveK: 0.2 })); b.add(new THREE.SphereGeometry(0.07, 6, 4), mFlat('#ffffff', 0.1), [-0.12, 0.12, 0.24]); },
  key(b) {
    const m = mRust('key', T.brass);
    b.add(new THREE.TorusGeometry(0.16, 0.06, 6, 12), m, [0, 0.3, 0]);
    b.add(cyl(0.05, 0.05, 0.62, 6), m, [0, -0.15, 0]);
    for (const y of [-0.4, -0.28]) b.add(new THREE.BoxGeometry(0.16, 0.07, 0.07), m, [0.1, y, 0]);
  },
  bomb(b) { puffer(b, 0.26, true); },
  flask(b) { vial(b, '#5cb830', '#2a7a24'); },
  flaskEmpty(b) { b.add(latheGeo([[0, -0.32], [0.22, -0.28], [0.26, -0.05], [0.2, 0.14], [0.08, 0.22], [0.08, 0.34], [0, 0.34]], 10), mGlass('#8aa8a0')); b.add(cyl(0.09, 0.08, 0.1, 8), mFlat('#a07040', 0.9), [0, 0.38, 0]); },
};

// ------------------------------------------------------------------ cache + fit
const templates = new Map<string, THREE.Object3D>();

/** fit a model into w x h cells (fill fraction), centred on the origin */
function fit(o: THREE.Object3D, w: number, h: number, fill = 0.9) {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = Math.min((w * fill) / Math.max(1e-3, size.x), (h * fill) / Math.max(1e-3, size.y), (Math.max(w, h) * 0.9) / Math.max(1e-3, size.z));
  o.position.sub(c);
  const inner = new THREE.Group(); inner.add(o); inner.scale.setScalar(k);
  const wrap = new THREE.Group(); wrap.add(inner);
  return wrap;
}

function template(id: string): THREE.Object3D {
  let t = templates.get(id);
  if (t) return t;
  const d = ITEMS[id];
  const cw = d ? Math.max(...d.shape.map((c) => c[0])) + 1 : 1, ch = d ? Math.max(...d.shape.map((c) => c[1])) + 1 : 1;
  const fn = MODELS[id] as Build | undefined;
  let raw: THREE.Object3D;
  if (fn && d) { const b = new B(); fn(b, d); raw = b.g; }
  else if (d) {
    // no bespoke model yet: the hand-painted icon extruded into chunky voxels (0.5 m per cell -> 1 unit per cell)
    const v = voxelMesh(d, 1, paintIconAt(d, 1, 32));
    v.scale.multiplyScalar(2);
    // drop the world twinkle sprites (they are screen-sized; on the UI stage they would blow up)
    const sprites: THREE.Object3D[] = []; v.traverse((o) => { if ((o as THREE.Sprite).isSprite) sprites.push(o); });
    for (const o of sprites) o.removeFromParent();
    raw = new THREE.Group(); raw.add(v);
  } else { const b = new B(); b.add(new THREE.BoxGeometry(0.5, 0.5, 0.5), mFlat('#8a7050')); raw = b.g; }
  t = fit(raw, cw, ch, fn ? 0.9 : 1);
  t.userData.cells = [cw, ch];
  t.userData.bespoke = !!fn;
  templates.set(id, t);
  return t;
}

/** a fresh item model (shared geometry + materials): 1 unit per grid cell, facing +Z */
export function itemModel(id: string, o: { cell?: number } = {}): THREE.Object3D {
  const c = template(id).clone(true);
  if (o.cell) c.scale.multiplyScalar(o.cell);
  c.userData = { ...template(id).userData, id };
  return c;
}

/** HUD / pickup props: 'heart' | 'pearlCoin' | 'key' | 'bomb' | 'flask' | 'flaskEmpty' (about 1 unit tall) */
export function hudModel(name: string): THREE.Object3D {
  const key = 'hud:' + name;
  let t = templates.get(key);
  if (!t) { const b = new B(); (HUD_MODELS[name] ?? HUD_MODELS.pearlCoin)(b); t = fit(b.g, 1, 1, 0.92); templates.set(key, t); }
  return t.clone(true);
}

/** every item id with a bespoke 3D model */
export const BESPOKE_MODELS = Object.keys(MODELS);
export const HUD_MODEL_NAMES = Object.keys(HUD_MODELS);
void getItem; void shade; void rivet; void SAND; void PEARL; void SEAG; void stitches;
