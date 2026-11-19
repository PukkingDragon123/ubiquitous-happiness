// Item MODELS (v4.1): every item is a small, chunky, flat-shaded low-poly object with its own hand-painted pixel pages
// (grain and knots, rust blooms and rivets, weave and stitches, creases, growth rings and nacre, facets and glints,
// inked labels), lit from the top left. The same model is the world pickup, the miniature lying in the backpack, the
// HUD counter, the card subject and (photographed by studio.ts) the flat icon wherever a picture is unavoidable.
//
//   itemModel('copperOre')            a new Object3D (cheap clone of a cached template), 1 unit = 1 grid cell,
//                                     centred on the origin, facing +Z (the viewer), fitted to the item's shape
//   itemModel('kelp', { cell: 0.5 })  scaled to 0.5 m per cell (world pickups)
//   hudModel('heart' | 'pearlCoin' | 'key' | 'bomb' | 'flask' | 'flaskEmpty')    HUD counters / consumables
//
// The builders live in ./models/ by category (materials, tools, trinkets, cores, gear, builds, big, hud); the kit is
// ./models/kit.ts (geometry, materials, the part builder) and ./models/paint.ts (the pixel painter + palettes).
// Rarity reads at a glance: commons are worn and rusty, uncommons clean, rares carry a gem or polished silver, epics an
// ornate trim, legendaries gold.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, type ItemDef } from '../game/items';
import { voxelMesh } from './voxel';
import { paintIconAt } from './icons';
import { B } from './models/kit';
import { MATERIAL_MODELS } from './models/materials';
import { TOOL_MODELS } from './models/tools';
import { TRINKET_MODELS } from './models/trinkets';
import { CORE_MODELS } from './models/cores';
import { GEAR_MODELS } from './models/gear';
import { BUILD_MODELS } from './models/builds';
import { BIG_MODELS } from './models/big';
import { HUD_MODELS } from './models/hud';
import { LEGACY_MODELS, LEGACY_HUD, LegacyB, runLegacy } from './models/legacy';

export type Build = (b: B, d: ItemDef) => void;
const MODELS: Record<string, Build> = { ...MATERIAL_MODELS, ...TOOL_MODELS, ...TRINKET_MODELS, ...CORE_MODELS, ...GEAR_MODELS, ...BUILD_MODELS, ...BIG_MODELS };

// ------------------------------------------------------------------ cache + merge + fit
const templates = new Map<string, THREE.Object3D>();

/** collapse a built part tree into one mesh per material (a 30-part model draws in a handful of calls) */
function mergeByMaterial(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, { gs: THREE.BufferGeometry[]; cast: boolean }>();
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || Array.isArray(me.material)) return;
    const g = (me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    const e = groups.get(me.material) ?? { gs: [], cast: false };
    e.gs.push(g); e.cast ||= me.castShadow;
    groups.set(me.material, e);
  });
  const out = new THREE.Group();
  // opaque first, see-through last (glass over its contents)
  const entries = [...groups.entries()].sort((a, b) => Number(a[0].transparent) - Number(b[0].transparent));
  for (const [m, e] of entries) {
    const g = e.gs.length === 1 ? e.gs[0] : mergeGeometries(e.gs, false);
    if (!g) continue;
    g.computeBoundingSphere();
    const me = new THREE.Mesh(g, m);
    me.castShadow = e.cast && !m.transparent; me.receiveShadow = true;
    out.add(me);
  }
  return out;
}

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
  if (fn && d) { const b = new B(); fn(b, d); raw = mergeByMaterial(b.g); }
  else if (d && LEGACY_MODELS[id]) raw = runLegacy(id, d)!;
  else if (d) {
    // no bespoke model (a new item): the hand-painted icon extruded into chunky voxels (0.5 m per cell -> 1 unit per cell)
    const v = voxelMesh(d, 1, paintIconAt(d, 1, 32));
    v.scale.multiplyScalar(2);
    const sprites: THREE.Object3D[] = []; v.traverse((o) => { if ((o as THREE.Sprite).isSprite) sprites.push(o); });
    for (const o of sprites) o.removeFromParent();
    raw = new THREE.Group(); raw.add(v);
  } else { const b = new B(); b.add(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: '#8a7050' })); raw = b.g; }
  t = fit(raw, cw, ch, fn ? 0.92 : 1);
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
  if (!t) {
    if (HUD_MODELS[name]) { const b = new B(); HUD_MODELS[name](b); t = fit(mergeByMaterial(b.g), 1, 1, 0.92); }
    else { const lb = new (LegacyB)(); (LEGACY_HUD[name] ?? LEGACY_HUD.pearlCoin)(lb); t = fit(lb.g, 1, 1, 0.92); }
    templates.set(key, t);
  }
  return t.clone(true);
}

/** every item id with a bespoke 3D model */
export const BESPOKE_MODELS = Object.keys(MODELS);
export const HUD_MODEL_NAMES = [...new Set([...Object.keys(LEGACY_HUD), ...Object.keys(HUD_MODELS)])];
