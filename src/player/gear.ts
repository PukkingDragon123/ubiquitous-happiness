// Blobfish v2 gear: every weapon, hat, armour and back item, modelled PS1-style (a few dozen faceted polys each)
// with a small painted pixel page. Armour and cloth hats are skin-tight shells built on the body's own
// parametrisation (blobShape.bodyPoint) so they squish with the soft body; rigid pieces hang off anchors.
//
//   setGear({ weapon: 'staff', armor: 'robe', hat: 'wizardHat', back: 'cape' })   on BlobModel / Blobfish / BlobPuppet
//   BUILD_GEAR.mage                                                              a full outfit per build
import * as THREE from 'three';
import { Loft, usFor, type V3 } from '../gfx/loft';
import { worley } from '../gfx/px';
import { ctex, T, tone, rect, bevel, cylinder, rivet, stitches, cloth, gemFacets } from '../skills/texkit';
import { hash2, TAU } from '../core/math';
import { bodyPoint, NS, RINGS, addSB } from './blobShape';
import { psxMat, mesh, facet, xf, uvTo } from './psx';

export type WeaponId = 'toothpick' | 'sword' | 'wand' | 'trident' | 'staff' | 'wrench' | 'dagger';
export type ArmorId = 'none' | 'shellPlate' | 'chainmail' | 'robe';
/** cosmetic hats (src/cosmetics registers their builders in HAT_EXT): looks only, never stats */
export type CosmeticHatId = 'roninKasa' | 'coralCrown' | 'tricorn' | 'viking' | 'toque' | 'partyCone' | 'jellyCap' | 'anglerLamp' | 'kabuto';
export type HatId = 'none' | 'bandana' | 'kasa' | 'helmet' | 'wizardHat' | 'crown' | 'goggles' | 'hood' | CosmeticHatId;
export type BackId = 'none' | 'pack' | 'tank' | 'cape';
export interface BlobGear { weapon?: WeaponId; armor?: ArmorId; hat?: HatId; back?: BackId }
export type BuildId = 'default' | 'mage' | 'warrior' | 'summoner' | 'tinkerer' | 'rogue';

/** the blobfish's own look: the conical straw kasa and the toothpick */
export const DEFAULT_GEAR: Required<BlobGear> = { weapon: 'toothpick', armor: 'none', hat: 'kasa', back: 'none' };

/**
 * Cosmetic look overrides, installed by src/cosmetics: the model shows `hat(id)` instead of the hat it was given,
 * and `weapon(id)` (a fresh group, or null for the stock model) instead of the weapon. Stats always keep the real
 * gear id; BlobModel.setGear(gear, true) rebuilds a model after the look changes.
 */
export const GEAR_LOOK: { hat?: (id: HatId) => HatId; weapon?: (id: WeaponId) => THREE.Group | null } = {};
/** extra hat builders (cosmetics): fill `h.root` (skin-tight shells, bend) / `h.rig` (rigid, on the head anchor) */
export interface HatBuild {
  root: THREE.Group; rig: THREE.Group; part: GearPart;
  patch: (m: THREE.Material, bend: boolean) => THREE.Material;
  add: (g: THREE.BufferGeometry, m: THREE.Material, bend: boolean, parent?: THREE.Object3D) => THREE.Mesh;
}
export const HAT_EXT: Partial<Record<HatId, (h: HatBuild) => void>> = {};
export const BUILD_GEAR: Record<BuildId, Required<BlobGear>> = {
  default: DEFAULT_GEAR,
  mage: { weapon: 'staff', armor: 'robe', hat: 'wizardHat', back: 'none' },
  warrior: { weapon: 'sword', armor: 'chainmail', hat: 'helmet', back: 'cape' },
  summoner: { weapon: 'trident', armor: 'shellPlate', hat: 'crown', back: 'pack' },
  tinkerer: { weapon: 'wrench', armor: 'none', hat: 'goggles', back: 'tank' },
  rogue: { weapon: 'dagger', armor: 'none', hat: 'hood', back: 'none' },
};
/** which way a weapon behaves in combat */
export const WEAPON_KIND: Record<WeaponId, 'blade' | 'caster' | 'polearm' | 'blunt'> = {
  toothpick: 'blade', sword: 'blade', dagger: 'blade', wand: 'caster', staff: 'caster', trident: 'polearm', wrench: 'blunt',
};
/** blade/shaft length from the hand (for swing trails and casting tips) */
export const WEAPON_LEN: Record<WeaponId, number> = { toothpick: 0.84, sword: 0.86, dagger: 0.5, wand: 0.56, staff: 0.86, trident: 1.08, wrench: 0.6 };

// ------------------------------------------------------------------ painted pages (clean: deliberate shapes, no noise)
const tex = ctex;
/** a turned wooden shaft: cylinder tone bands across, grain lines along, a knot */
function shaft(key: string, ts: string[]) {
  return tex(key, 16, 64, (p) => {
    cylinder(p, 0, 0, 16, 64, ts);
    for (const [x, ph] of [[5, 0], [10, 2.1]] as [number, number][]) for (let y = 0; y < 64; y++) { if ((y >> 3) % 4 === 3) continue; p.set(x + Math.round(Math.sin(y * 0.15 + ph) * 0.7), y, tone(ts, 1)); }
    p.ellipse(8, 40, 1.6, 2.4, tone(ts, 0)); p.set(8, 40, tone(ts, 2));
  });
}
const WOOD = () => shaft('wood', T.oak);
const DRIFT = () => shaft('drift', T.drift);
/** blade steel: around the 4-sided blade (edge, face, edge, face): bright bevels, a dark fuller down each face */
const STEEL = () => tex('steel', 32, 32, (p) => {
  for (let x = 0; x < 32; x++) {
    const k = x % 16;
    const t = k < 2 ? 4 : k < 5 ? 3 : k === 7 || k === 8 ? 1 : k < 12 ? 2 : k < 14 ? 3 : 4;
    rect(p, x, 0, 1, 32, tone(T.steel, t));
  }
  rect(p, 0, 30, 32, 2, tone(T.steel, 1));
});
const BRASS = () => tex('brass', 32, 32, (p) => { bevel(p, 0, 0, 32, 32, T.brass, 2); rect(p, 2, 15, 28, 1, tone(T.brass, 1)); rect(p, 2, 16, 28, 1, tone(T.brass, 4)); for (const x of [5, 26]) rivet(p, x, 6, T.brass); });
const GOLD = () => tex('gold', 32, 32, (p) => { bevel(p, 0, 0, 32, 32, T.gold, 3); rect(p, 3, 10, 26, 1, tone(T.gold, 1)); rect(p, 3, 21, 26, 1, tone(T.gold, 1)); rect(p, 3, 11, 26, 1, tone(T.gold, 4)); });
const LEATHER = () => tex('leather', 32, 32, (p) => { bevel(p, 0, 0, 32, 32, T.leather, 2); stitches(p, 2, 2, 29, 2); stitches(p, 2, 29, 29, 29); stitches(p, 2, 2, 2, 29); stitches(p, 29, 2, 29, 29); rect(p, 6, 17, 18, 1, tone(T.leather, 1)); });
function glowTex(key: string, ts: string[]) { return tex(key, 16, 16, (p) => gemFacets(p, 0, 0, 16, 16, ts)); }
const ROPE = () => tex('rope', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (x + y) % 6; p.set(x, y, tone(T.rope, k === 0 ? 0 : k < 3 ? 3 : 2)); } });
const CORK = () => tex('cork', 16, 16, (p) => { bevel(p, 0, 0, 16, 16, ['#3a2410', '#6a4824', '#94703e', '#b89060', '#d8b484'], 2); for (const [x, y] of [[4, 4], [10, 6], [6, 11], [12, 12], [3, 9]]) { p.set(x, y, '#4a3018'); p.set(x + 1, y, '#5a3a1c'); } });

// ------------------------------------------------------------------ small mesh helpers
const tube = (path: V3[], r: (t: number) => number, sides: number, reg = { x: 0, y: 0, w: 1, h: 1 }, caps = true) => {
  const L = new Loft(); L.tube(path, r, sides, reg, 0, { capStart: caps, capEnd: caps }); return L.build();
};
/** a 4-sided blade (diamond cross-section) along +x from x0 to x1; width(t), thickness(t), curve(t) in y */
function bladeGeo(x0: number, x1: number, w: (t: number) => number, th: (t: number) => number, cy: (t: number) => number = () => 0, n = 8, edge?: (t: number, side: number) => number) {
  const L = new Loft();
  const rings = [];
  const us = usFor(4);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, c = cy(t);
    const ww = w(t), tt = th(t);
    const up = edge ? edge(t, 1) : 0, dn = edge ? edge(t, -1) : 0;
    rings.push({ pts: [[x, c + ww + up, 0], [x, c, tt], [x, c - ww - dn, 0], [x, c, -tt], [x, c + ww + up, 0]] as V3[], v: t });
  }
  L.loft(rings, us, { x: 0, y: 0, w: 1, h: 1 }, -1, { end: [x1 + 0.02, cy(1), 0], start: null });
  return facet(L.build());
}
const box = (sx: number, sy: number, sz: number, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) => xf(new THREE.BoxGeometry(sx, sy, sz), at, rot);
const cyl = (r0: number, r1: number, h: number, n: number, at: V3 = [0, 0, 0], rot: V3 = [0, 0, Math.PI / 2]) => xf(new THREE.CylinderGeometry(r1, r0, h, n), at, rot);

// ------------------------------------------------------------------ weapons (+x from the hand)
const weaponCache = new Map<WeaponId, THREE.Group>();
export function buildWeapon(id: WeaponId): THREE.Group {
  const look = GEAR_LOOK.weapon?.(id);
  if (look) return look;
  const hit = weaponCache.get(id);
  if (hit) return hit.clone();
  const g = new THREE.Group();
  g.name = 'weapon:' + id;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const me = mesh(geo, m); g.add(me); return me; };
  switch (id) {
    case 'toothpick': {
      add(facet(tube(Array.from({ length: 7 }, (_, i) => [i / 6 * 0.84, 0, 0] as V3), (t) => (t < 0.08 ? 0.016 + t * 0.12 : 0.027 * Math.pow(1 - (t - 0.08) / 0.92, 0.75) + 0.002), 6)), psxMat(WOOD(), { rough: 0.6 }));
      const cork = CORK();
      add(facet(cyl(0.048, 0.05, 0.07, 6, [0.09, 0, 0])), psxMat(cork, { rough: 0.95 }));
      // cocktail frill: foil strips fanning from the pommel
      const cols = ['#ff3b5c', '#ffd23b', '#3bd1ff', '#7dff6a', '#c27bff'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const s = mesh(box(0.006, 0.075, 0.018, [0, 0.038, 0]), psxMat(null, { color: cols[i % 5], metal: 0.7, rough: 0.25, emissive: cols[i % 5], emissiveK: 0.15 }), false);
        const piv = new THREE.Group(); piv.position.x = -0.01; piv.rotation.set(a, 0, 0); piv.add(s); s.rotation.z = 0.55;
        g.add(piv);
      }
      break;
    }
    case 'sword': {
      // a sea-worn cutlass: curved steel blade with a fuller, brass basket guard, leather grip
      const blade = bladeGeo(0.06, 0.86, (t) => 0.04 * (1 - t * 0.45) + (t > 0.85 ? -(t - 0.85) * 0.25 : 0), (t) => 0.012 * (1 - t * 0.6), (t) => t * t * 0.07, 7);
      uvTo(blade, 0, 0, 1, 1);
      add(blade, psxMat(STEEL(), { metal: 0.85, rough: 0.28 }));
      add(facet(box(0.035, 0.17, 0.05, [0.045, 0, 0])), psxMat(BRASS(), { metal: 0.8, rough: 0.35 }));
      add(facet(tube([[0.05, 0.08, 0], [-0.02, 0.1, 0], [-0.1, 0.07, 0], [-0.13, 0.02, 0]], () => 0.01, 4)), psxMat(BRASS(), { metal: 0.8, rough: 0.35 }));
      add(facet(cyl(0.022, 0.02, 0.13, 6, [-0.03, 0, 0])), psxMat(LEATHER(), { rough: 0.9 }));
      add(facet(xf(new THREE.OctahedronGeometry(0.032, 0), [-0.11, 0, 0])), psxMat(BRASS(), { metal: 0.8, rough: 0.35 }));
      break;
    }
    case 'dagger': {
      // a stingray barb: serrated, curved, venom-dark at the tip
      // bone barb: bright bevelled edges, a venom-dark tip end, notch marks along the serration
      const barb = tex('barb', 32, 32, (p) => { for (let x = 0; x < 32; x++) { const k = x % 16; rect(p, x, 0, 1, 32, tone(T.bone, k < 2 ? 4 : k < 6 ? 3 : k < 12 ? 2 : 3)); } rect(p, 0, 0, 32, 8, tone(T.slate, 2)); rect(p, 0, 8, 32, 1, tone(T.slate, 4)); for (let y = 12; y < 32; y += 4) rect(p, 0, y, 3, 1, tone(T.bone, 1)); });
      const blade = bladeGeo(0.05, 0.5, (t) => 0.034 * (1 - t * 0.7), (t) => 0.01 * (1 - t * 0.5), (t) => Math.sin(t * Math.PI) * 0.025, 9, (t, s) => (s > 0 ? ((Math.floor(t * 9) & 1) ? 0.012 * (1 - t) : 0) : 0));
      uvTo(blade, 0, 0, 1, 1);
      add(blade, psxMat(barb, { rough: 0.35, metal: 0.1 }));
      add(facet(box(0.03, 0.09, 0.04, [0.04, 0, 0])), psxMat(LEATHER(), { rough: 0.6 }));
      add(facet(cyl(0.02, 0.018, 0.11, 5, [-0.03, 0, 0])), psxMat(tex('wrap', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (x + y * 2) % 8; p.set(x, y, tone(T.purple, k === 0 ? 0 : k < 4 ? 3 : 2)); } }), { rough: 0.8 }));
      add(facet(xf(new THREE.OctahedronGeometry(0.026, 0), [-0.095, 0, 0])), psxMat(null, { color: '#7a3aa0', emissive: '#a040ff', emissiveK: 0.6, rough: 0.2 }));
      break;
    }
    case 'wand': {
      add(facet(tube([[-0.06, 0, 0], [0.12, 0.006, 0], [0.28, -0.006, 0], [0.44, 0.01, 0]], (t) => 0.018 - t * 0.006, 5)), psxMat(DRIFT(), { rough: 0.85 }));
      add(facet(cyl(0.022, 0.022, 0.03, 6, [0.43, 0.01, 0])), psxMat(GOLD(), { metal: 0.9, rough: 0.3 }));
      const gem = xf(new THREE.OctahedronGeometry(0.045, 0), [0.5, 0.012, 0], [0, 0, Math.PI / 2], [1.5, 0.9, 0.9]);
      const m = add(facet(gem), psxMat(glowTex('mana', ['#2a0a6a', '#5a2ad0', '#8a6aff', '#c0b0ff', '#ffffff']), { emissive: '#8a5aff', emissiveK: 1.4, rough: 0.15 }));
      m.name = 'glow';
      break;
    }
    case 'staff': {
      const path: V3[] = []; for (let i = 0; i <= 8; i++) { const t = i / 8; path.push([-0.36 + t * 1.1, Math.sin(t * 9) * 0.012, Math.cos(t * 7) * 0.01]); }
      add(facet(tube(path, (t) => 0.024 - t * 0.006 + (Math.abs(t - 0.4) < 0.05 ? 0.006 : 0), 6)), psxMat(DRIFT(), { rough: 0.85 }));
      // three roots curl round the orb
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        const c: V3[] = [[0.72, 0, 0], [0.8, Math.cos(a) * 0.07, Math.sin(a) * 0.07], [0.9, Math.cos(a + 0.4) * 0.075, Math.sin(a + 0.4) * 0.075], [0.97, Math.cos(a + 0.9) * 0.03, Math.sin(a + 0.9) * 0.03]];
        add(facet(tube(c, (t) => 0.014 * (1 - t * 0.7), 4)), psxMat(DRIFT(), { rough: 0.85 }));
      }
      const orb = add(facet(xf(new THREE.IcosahedronGeometry(0.07, 0), [0.86, 0, 0])), psxMat(glowTex('orb', ['#04224a', '#0a5aa0', '#2aa8e0', '#9af0ff', '#ffffff']), { emissive: '#4ad0ff', emissiveK: 1.5, rough: 0.1 }));
      orb.name = 'glow';
      add(facet(cyl(0.03, 0.03, 0.08, 6, [0.02, 0, 0])), psxMat(ROPE(), { rough: 0.95 }));
      break;
    }
    case 'trident': {
      add(facet(cyl(0.02, 0.018, 1.0, 6, [0.25, 0, 0])), psxMat(DRIFT(), { rough: 0.8 }));
      const gm = psxMat(GOLD(), { metal: 0.9, rough: 0.3 });
      add(facet(box(0.04, 0.2, 0.035, [0.76, 0, 0])), gm);
      add(facet(cyl(0.03, 0.03, 0.06, 6, [0.72, 0, 0])), gm);
      for (const s of [-1, 0, 1]) {
        const y = s * 0.085, len = s === 0 ? 0.3 : 0.22;
        const prong = bladeGeo(0.77, 0.77 + len, (t) => 0.014 * (1 - t * 0.8), (t) => 0.012 * (1 - t * 0.8), (t) => y * (1 + t * 0.15), 3);
        uvTo(prong, 0, 0, 1, 1);
        add(prong, gm);
        // barb
        add(facet(xf(new THREE.TetrahedronGeometry(0.022, 0), [0.77 + len - 0.05, y - Math.sign(s || 1) * 0.018, 0])), gm);
      }
      add(facet(cyl(0.026, 0.026, 0.12, 6, [0, 0, 0])), psxMat(ROPE(), { rough: 0.95 }));
      break;
    }
    case 'wrench': {
      // red enamel handle with a few chipped spots showing bare metal
      const red = tex('redPaint', 16, 32, (p) => { cylinder(p, 0, 0, 16, 32, T.red); for (const [x, y, w, h] of [[3, 5, 3, 2], [9, 14, 2, 3], [5, 24, 4, 2]]) { rect(p, x, y, w, h, tone(T.iron, 3)); rect(p, x, y + h, w, 1, tone(T.red, 0)); } });
      add(facet(box(0.42, 0.045, 0.026, [0.15, 0, 0])), psxMat(red, { rough: 0.6 }));
      const sm = psxMat(STEEL(), { metal: 0.85, rough: 0.35 });
      add(facet(box(0.07, 0.14, 0.036, [0.39, 0.02, 0])), sm);
      add(facet(box(0.09, 0.03, 0.036, [0.45, 0.075, 0])), sm);
      add(facet(box(0.07, 0.03, 0.036, [0.44, -0.02, 0])), sm);
      add(facet(cyl(0.018, 0.018, 0.05, 6, [0.37, -0.045, 0], [0, 0, 0])), psxMat(BRASS(), { metal: 0.8 }));
      break;
    }
  }
  weaponCache.set(id, g);
  return g.clone();
}
/** the classic toothpick sword (kept for the old menu) */
export function buildSword() { return buildWeapon('toothpick'); }

// ------------------------------------------------------------------ skin-tight shells
/**
 * A shell over part of the body: t from t0..t1 (sampled on the body's own ring stations plus the ends),
 * around-angle u0..u1 (on the body's own side stations), `out(t, u)` metres off the skin.
 */
export function shellGeo(t0: number, t1: number, u0: number, u1: number, out: (t: number, u: number) => number, reg = { x: 0, y: 0, w: 1, h: 1 }, o: { closed?: boolean; flip?: boolean; uvScale?: [number, number] } = {}): THREE.BufferGeometry {
  const ts = [t0, ...RINGS.filter((t) => t > t0 + 0.02 && t < t1 - 0.02), t1];
  const us: number[] = [];
  if (o.closed) for (let j = 0; j <= NS; j++) us.push(j / NS);
  else {
    us.push(u0);
    for (let j = 0; j <= NS; j++) { const u = j / NS; if (u > u0 + 0.01 && u < u1 - 0.01) us.push(u); }
    us.push(u1);
  }
  const L = new Loft();
  const uvU = us.map((u) => (u - us[0]) / (us[us.length - 1] - us[0] || 1));
  const rings = ts.map((t) => ({ pts: us.map((u) => bodyPoint(t, u, out(t, u))), v: (t - t0) / (t1 - t0) }));
  L.loft(rings, uvU, reg, 3, { flip: o.flip });
  const g = L.build();
  if (o.uvScale) { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uvScale[0], uv.getY(i) * o.uvScale[1]); }
  return addSB(g);
}

// ------------------------------------------------------------------ pages for cloth / armour
const BANDANA = () => tex('bandana', 32, 32, (p) => {
  rect(p, 0, 0, 32, 32, tone(T.red, 2));
  for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) {
    const cx = x + ((y >> 3) & 1) * 4 + 3, cy = y + 3;
    p.ellipse(cx + 1.5, cy + 1.5, 1.8, 1.8, tone(T.red, 1));
    p.ellipse(cx + 1, cy + 1, 1.8, 1.8, '#f6e6cc'); p.set(cx, cy, '#ffffff');
  }
  rect(p, 0, 30, 32, 2, tone(T.red, 1));
});
const SHELL = () => tex('turtle', 64, 64, (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const [f1, f2, id] = worley(x, y, 16, 5, 64);
    const e = f2 - f1;
    const t = e < 1.6 ? 0 : e < 3 ? 4 : e < 5.5 ? 3 : id > 0.5 ? 2 : 3;
    p.set(x, y, tone(T.olive, t));
    if (e > 7 && Math.abs(f1 - 4) < 0.5) p.set(x, y, tone(T.olive, 1)); // a growth ring in each scute
  }
});
const CHAIN = () => tex('chain', 32, 32, (p) => {
  rect(p, 0, 0, 32, 32, tone(T.steel, 0));
  for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x += 4) {
    const ox = x + ((y >> 2) & 1) * 2;
    p.set(ox, y, tone(T.steel, 3)); p.set(ox + 1, y, tone(T.steel, 4)); p.set(ox + 2, y + 1, tone(T.steel, 3));
    p.set(ox, y + 1, tone(T.steel, 2)); p.set(ox + 2, y + 2, tone(T.steel, 2)); p.set(ox + 1, y + 2, tone(T.steel, 1));
  }
});
const ROBE = () => tex('robe', 64, 64, (p) => {
  cloth(p, 0, 0, 64, 64, T.purple, 10, { ts: T.gold, top: 6, bottom: 3 });
  // gold runes stitched along the hem
  const G = tone(T.gold, 3);
  for (let k = 0; k < 6; k++) {
    const x = 4 + k * 10, y = 50;
    const g = k % 3;
    if (g === 0) { p.line(x, y, x + 4, y + 6, G); p.line(x + 4, y, x, y + 6, G); }
    else if (g === 1) { p.line(x + 2, y, x + 2, y + 6, G); p.line(x, y + 2, x + 4, y + 2, G); p.set(x, y + 6, G); p.set(x + 4, y + 6, G); }
    else { p.line(x, y + 6, x + 2, y, G); p.line(x + 2, y, x + 4, y + 6, G); p.line(x + 1, y + 4, x + 3, y + 4, G); }
  }
});
const CAPE = () => tex('cape', 32, 32, (p) => cloth(p, 0, 0, 32, 32, T.red, 8, { ts: T.gold, top: 3, bottom: 3 }));
const HOOD = () => tex('hood', 32, 32, (p) => { cloth(p, 0, 0, 32, 32, T.navy, 8); rect(p, 0, 0, 32, 2, tone(T.purple, 3)); rect(p, 0, 2, 32, 1, tone(T.purple, 1)); stitches(p, 0, 4, 31, 4, '#46587e', '#080a14'); });
const WIZ = () => tex('wizard', 64, 64, (p) => {
  cloth(p, 0, 0, 64, 64, T.blue, 12);
  const star = (x: number, y: number, big: boolean) => { const c = '#ffe680'; p.set(x, y, '#ffffff'); p.set(x - 1, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x, y + 1, c); if (big) { p.set(x - 2, y, c); p.set(x + 2, y, c); p.set(x, y - 2, c); p.set(x, y + 2, c); } };
  for (const [x, y, b] of [[8, 8, 1], [22, 18, 0], [40, 6, 1], [54, 22, 0], [12, 30, 0], [30, 36, 1], [48, 40, 0], [6, 44, 1], [58, 10, 0], [36, 24, 0]] as [number, number, number][]) star(x, y, !!b);
  rect(p, 0, 50, 64, 8, tone(T.gold, 3)); rect(p, 0, 50, 64, 1, tone(T.gold, 4)); rect(p, 0, 57, 64, 1, tone(T.gold, 1));
  for (let x = 4; x < 64; x += 10) { rect(p, x, 52, 3, 4, tone(T.purple, 2)); p.set(x, 52, tone(T.purple, 4)); }
});

// ------------------------------------------------------------------ the kasa: a conical woven straw hat
// Page layout (u around the cone, 3 repeats; y = radius: row 0 at the apex, row 63 at the brim): a bound top knot,
// concentric rows of woven straw strips crossing over / under radial bamboo spokes, a cord binding near the rim,
// then frayed strand ends (alpha cut). The ronin variant is black lacquer with a red binding.
const KASA_STRAW = ['#2e1e0c', '#5a4020', '#866634', '#b08e4c', '#d4b46a', '#f2da98'];
const KASA_BLACK = ['#060608', '#101014', '#1c1c24', '#2c2c38', '#444452', '#686878'];
const KASA_RED = ['#2a0408', '#5a0a12', '#981820', '#d0342c', '#f86848'];
const KASA_ROPE = ['#1e1408', '#3e2a12', '#624420', '#8a6434', '#b08c52'];
/** frayed strand length past the binding, per column pair (0 = cut short) */
const frayLen = (x: number) => { const k = x >> 1; return 1 + Math.floor(hash2(k, 3, 77) * 4.6) + ((k % 5) === 2 ? 1 : 0); };
const KASA_FRAY0 = 59;
const KW = 128;
function kasaTop(black: boolean) {
  return tex(black ? 'kasaBlack' : 'kasaStraw', KW, 64, (p) => {
    const S = black ? KASA_BLACK : KASA_STRAW, B = black ? KASA_RED : KASA_ROPE;
    const st = (i: number) => tone(S, i);
    // top knot: a spiral binding
    for (let y = 0; y < 6; y++) for (let x = 0; x < KW; x++) p.set(x, y, (x + y * 2) % 6 < 3 ? tone(B, 3) : tone(B, 1));
    rect(p, 0, 5, KW, 1, tone(B, 0));
    // woven rows of flat straw strips passing over / under the radial bamboo spokes
    for (let y = 6; y < 56; y++) {
      const band = Math.floor((y - 6) / 3), yy = (y - 6) % 3;
      for (let x = 0; x < KW; x++) {
        const spoke = Math.floor(x / 6), sx = x % 6;
        const over = (band + spoke) % 2 === 0;
        let c: number;
        if (yy === 2) c = over ? 2 : 1;                        // the shadow under each strip
        else if (yy === 0) c = over ? 5 : 3;                   // the lit upper edge
        else c = over ? 4 : 2;
        if (!over && sx === 0) c = 1;                          // the spoke's dark side where it shows
        if (over && sx === 5) c = Math.max(1, c - 1);          // the strip dips under the next spoke
        if (yy === 1 && over && (x * 7 + band * 3) % 23 === 0) c = 3; // a fibre fleck
        p.set(x, y, st(c));
      }
    }
    // the rim binding: a twisted cord
    for (let y = 56; y < KASA_FRAY0; y++) for (let x = 0; x < KW; x++) p.set(x, y, (x + (y - 56) * 2) % 5 < 3 ? tone(B, y === 56 ? 4 : 3) : tone(B, 1));
    rect(p, 0, KASA_FRAY0 - 1, KW, 1, tone(B, 0));
    // frayed straw ends
    for (let x = 0; x < KW; x++) {
      const L = frayLen(x);
      for (let y = KASA_FRAY0; y < 64; y++) {
        if (y - KASA_FRAY0 >= L) { p.set(x, y, '#000000', 0); continue; }
        p.set(x, y, st(x % 2 ? 3 : 4));
        if (y - KASA_FRAY0 === L - 1) p.set(x, y, st(2));
      }
    }
  });
}
function kasaLining(black: boolean) {
  return tex(black ? 'kasaLinB' : 'kasaLin', KW, 64, (p) => {
    const D = ['#07070c', '#0e0e16', '#181822', '#24242e'], S = black ? KASA_BLACK : KASA_STRAW;
    for (let y = 0; y < 64; y++) for (let x = 0; x < KW; x++) p.set(x, y, D[(Math.floor(y / 6) + Math.floor(x / 4)) % 2 ? 1 : 2]);
    // bamboo ribs fanning out under the cloth
    for (let x = 0; x < KW; x += 12) for (let y = 4; y < KASA_FRAY0; y++) { p.set(x, y, tone(T.oak, 2)); p.set(x + 1, y, tone(T.oak, 1)); }
    // the head ring: a leather band with stitching
    rect(p, 0, 26, KW, 6, tone(T.leather, 2)); rect(p, 0, 26, KW, 1, tone(T.leather, 4)); rect(p, 0, 31, KW, 1, tone(T.leather, 0));
    for (let x = 1; x < KW; x += 4) { p.set(x, 28, '#d8c090'); p.set(x + 1, 29, '#d8c090'); }
    rect(p, 0, KASA_FRAY0 - 3, KW, 3, D[0]);
    for (let x = 0; x < KW; x++) { const L = frayLen(x); for (let y = KASA_FRAY0; y < 64; y++) p.set(x, y, y - KASA_FRAY0 < L ? tone(S, x % 2 ? 1 : 2) : '#000000', y - KASA_FRAY0 < L ? 255 : 0); }
  });
}
const KASA_CORD = (red: boolean) => tex(red ? 'kasaCordR' : 'kasaCord', 16, 16, (p) => {
  const C = red ? KASA_RED : T.navy;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (x * 2 + y) % 8; p.set(x, y, tone(C, k < 1 ? 0 : k < 4 ? 3 : k < 6 ? 2 : 4)); }
});
const KASA_TASSEL = () => tex('kasaTassel', 16, 16, (p) => {
  for (let x = 0; x < 16; x++) {
    const L = 11 + Math.floor(hash2(x, 1, 13) * 5);
    for (let y = 0; y < 16; y++) p.set(x, y, y < L ? tone(KASA_STRAW, y < 3 ? 1 : x % 3 === 0 ? 2 : x % 3 === 1 ? 4 : 3) : '#000000', y < L ? 255 : 0);
  }
  rect(p, 0, 2, 16, 2, tone(KASA_RED, 3)); rect(p, 0, 3, 16, 1, tone(KASA_RED, 1));
});
/** cone radius / height of the kasa, and the sub-group offset on the head anchor */
export const KASA = { R: 0.74, H: 0.32, sides: 9 };
/** a low cone (apex up, brim drooping) as one flat-shaded mesh; `under` builds the lining just below it */
function kasaGeo(R: number, H: number, n: number, droop: number, under: boolean) {
  const F = [0, 0.1, 0.34, 0.62, 0.84, 1];
  const yAt = (f: number) => H * (1 - f) - droop * Math.max(0, (f - 0.55) / 0.45) ** 2 - (under ? 0.014 : 0);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const REP = 3;
  F.forEach((f) => {
    for (let j = 0; j <= n; j++) {
      const a = (j / n) * TAU;
      pos.push(Math.cos(a) * R * f, yAt(f), Math.sin(a) * R * f);
      uv.push((j / n) * REP, 1 - f * 0.995);
    }
  });
  for (let i = 0; i < F.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + 1, c = a + n + 2, d = a + n + 1;
    // outward-up facing for the top, down for the lining
    if (i === 0) { if (under) idx.push(a, d, c); else idx.push(a, c, d); continue; }
    if (under) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return facet(g);
}
function buildKasa(h: HatBuild, black: boolean) {
  const { R, H, sides } = KASA;
  const tilt = new THREE.Group(); tilt.name = 'hatTilt';
  // sits back on the dome of the head, tipped forward so the brim shades the eyes (ronin)
  tilt.position.set(-0.08, 0.03, 0); tilt.rotation.z = -0.13;
  h.rig.add(tilt);
  h.add(kasaGeo(R, H, sides, 0.06, false), psxMat(kasaTop(black), { rough: black ? 0.45 : 0.95, alphaTest: 0.5 }), false, tilt);
  h.add(kasaGeo(R, H, sides, 0.06, true), psxMat(kasaLining(black), { rough: 0.95, alphaTest: 0.5 }), false, tilt);
  // the top knot finial
  const knot = h.add(facet(xf(new THREE.ConeGeometry(0.045, 0.07, 6), [0, H + 0.02, 0])), psxMat(KASA_CORD(true), { rough: 0.9 }), false, tilt);
  knot.name = 'kasaKnot';
  // chin cords from the lining at the sides, straw tassels off the back of the brim: they stream in the current
  const cordMat = psxMat(KASA_CORD(true), { rough: 0.9, side: THREE.DoubleSide });
  const tasselMat = psxMat(KASA_TASSEL(), { rough: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 });
  const anchors: { o: THREE.Object3D; kind: 'cord' | 'tassel'; k: number }[] = [];
  for (const s of [-1, 1]) { const o = new THREE.Object3D(); o.position.set(0.06, H * (1 - 0.74) - 0.04, s * R * 0.74); tilt.add(o); anchors.push({ o, kind: 'cord', k: s > 0 ? 1 : 0 }); }
  for (const s of [-1, 1]) { const o = new THREE.Object3D(); o.position.set(-R * 0.9, -0.03, s * 0.07); tilt.add(o); anchors.push({ o, kind: 'tassel', k: s > 0 ? 0.8 : 0.2 }); }
  h.part.ribbons = anchors.map((a) => a.kind === 'cord'
    ? { mat: cordMat, opts: { n: 6, seg: 0.05, w0: 0.02, w1: 0.016, gravity: 0.0012, flutter: 0.0012, uv: [0, 0, 1, 1] as [number, number, number, number], thick: 0.008 }, anchor: a.o, k: a.k }
    : { mat: tasselMat, opts: { n: 5, seg: 0.05, w0: 0.045, w1: 0.03, gravity: 0.001, flutter: 0.002, uv: [0, 0, 1, 1] as [number, number, number, number], thick: 0.006 }, anchor: a.o, k: a.k });
}

// ------------------------------------------------------------------ gear parts
export interface GearPart { slot: 'weapon' | 'armor' | 'hat' | 'back'; root: THREE.Group; ribbons?: { mat: THREE.Material; opts: import('./ribbon').RibbonOpts; anchor: THREE.Object3D; k: number; axis?: boolean }[]; glow?: THREE.Mesh[] }

/**
 * Build an armour piece: meshes go under root (skin-tight shells: bend-patched by the caller via `patch`).
 */
export function buildArmor(id: ArmorId, patch: (m: THREE.Material, bend: boolean) => THREE.Material): GearPart {
  const root = new THREE.Group(); root.name = 'armor:' + id;
  const add = (g: THREE.BufferGeometry, m: THREE.Material, bend = true) => { const me = mesh(g, patch(m, bend)); root.add(me); return me; };
  if (id === 'shellPlate') {
    // a domed turtle carapace on the back with a scalloped rim and a leather belly strap
    add(shellGeo(0.1, 0.66, 0.29, 0.71, (t, u) => 0.03 + Math.sin(((u - 0.29) / 0.42) * Math.PI) * Math.sin(((t - 0.1) / 0.56) * Math.PI) * 0.07, undefined, { uvScale: [1.5, 1.5] }), psxMat(SHELL(), { rough: 0.55 }));
    add(shellGeo(0.38, 0.47, 0, 1, () => 0.022, undefined, { closed: true, uvScale: [6, 1] }), psxMat(LEATHER(), { rough: 0.8 }));
  } else if (id === 'chainmail') {
    add(shellGeo(0.2, 0.66, 0, 1, () => 0.02, undefined, { closed: true, uvScale: [7, 3] }), psxMat(CHAIN(), { metal: 0.85, rough: 0.4, side: THREE.DoubleSide }));
    // a brass-trimmed leather belt
    add(shellGeo(0.36, 0.42, 0, 1, () => 0.03, undefined, { closed: true }), psxMat(LEATHER(), { rough: 0.8 }));
  } else if (id === 'robe') {
    // a flowing mage robe from the neck to the tail, flared at the hem, gold-trimmed collar
    add(shellGeo(0.03, 0.66, 0, 1, (t) => 0.022 + Math.pow(Math.max(0, 0.35 - t) / 0.35, 1.5) * 0.12, undefined, { closed: true, uvScale: [3, 1] }), psxMat(ROBE(), { rough: 0.9, side: THREE.DoubleSide }));
  }
  return { slot: 'armor', root };
}

/** hats: cloth caps are shells (bend), rigid ones hang off the head anchor (returned as root, placed by the caller) */
export function buildHat(id: HatId, patch: (m: THREE.Material, bend: boolean) => THREE.Material): GearPart {
  id = GEAR_LOOK.hat?.(id) ?? id;
  const root = new THREE.Group(); root.name = 'hat:' + id;
  const add = (g: THREE.BufferGeometry, m: THREE.Material, bend: boolean, parent: THREE.Object3D = root) => { const me = mesh(g, patch(m, bend)); parent.add(me); return me; };
  const part: GearPart = { slot: 'hat', root };
  const rig = new THREE.Group(); rig.name = 'hatRig'; // rigid pieces, positioned at the head anchor every frame
  root.add(rig);
  const ext = HAT_EXT[id];
  if (id === 'kasa' || id === 'roninKasa') buildKasa({ root, rig, part, patch, add }, id === 'roninKasa');
  else if (ext) ext({ root, rig, part, patch, add });
  else if (id === 'bandana') {
    const mat = psxMat(BANDANA(), { rough: 0.9, side: THREE.DoubleSide});
    add(shellGeo(0.52, 0.86, 0.27, 0.73, (t) => 0.016 + (t > 0.83 ? 0.008 : 0), undefined, { uvScale: [3, 1.2] }), mat, true);
    const knot = add(facet(xf(new THREE.IcosahedronGeometry(0.05, 0), [0, 0, 0], [0, 0, 0], [1.2, 0.85, 1.1])), psxMat(BANDANA(), { rough: 0.9 }), false);
    knot.name = 'knot';
    knot.position.set(...bodyPoint(0.56, 0.5, 0.035));
    part.ribbons = [0, 1].map((k) => ({ mat: psxMat(BANDANA(), { rough: 0.9, side: THREE.DoubleSide}), opts: { n: 7, seg: 0.06, w0: 0.045, w1: 0.03, uv: [0, 0, 1, 1] as [number, number, number, number] }, anchor: knot, k }));
  } else if (id === 'helmet') {
    const st = psxMat(STEEL(), { metal: 0.85, rough: 0.32 });
    add(shellGeo(0.52, 0.93, 0.16, 0.84, (t, u) => 0.03 + Math.sin(((u - 0.16) / 0.68) * Math.PI) * 0.02), st, true);
    add(shellGeo(0.9, 0.95, 0.16, 0.84, () => 0.052), psxMat(BRASS(), { metal: 0.8, rough: 0.35 }), true);
    // nasal guard + crest plume (rigid, on the anchor)
    add(facet(box(0.12, 0.03, 0.035, [0.06, -0.02, 0], [0, 0, -1.1])), psxMat(STEEL(), { metal: 0.85, rough: 0.32 }), false, rig);
    const plume = tex('plume', 16, 32, (p) => { for (let x = 0; x < 16; x++) rect(p, x, 0, 1, 32, tone(T.red, x % 4 === 0 ? 1 : x % 4 === 1 ? 4 : 3)); rect(p, 7, 0, 2, 32, tone(T.red, 0)); });
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const f = mesh(facet(box(0.05, 0.13 - Math.abs(t - 0.35) * 0.08, 0.022, [-t * 0.36 + 0.02, 0.07 + Math.sin(t * Math.PI) * 0.03, 0], [0, 0, 0.35 + t * 0.6])), patch(psxMat(plume, { rough: 0.9 }), false));
      rig.add(f);
    }
  } else if (id === 'hood') {
    const m = psxMat(HOOD(), { rough: 0.95, side: THREE.DoubleSide});
    add(shellGeo(0.42, 0.9, 0.1, 0.9, (t, u) => 0.024 + (t < 0.5 ? (0.5 - t) * 0.3 : 0) + Math.abs(u - 0.5) * 0.01, undefined, { uvScale: [3, 1] }), m, true);
    // the hood's point flops back behind the head
    add(facet(xf(new THREE.ConeGeometry(0.1, 0.32, 5), [-0.26, -0.05, 0], [0, 0, 1.9])), psxMat(HOOD(), { rough: 0.95 }), false, rig);
    // a dark mask band across the eyes is painted on the face via `mask` (see BlobModel)
  } else if (id === 'wizardHat') {
    const m = psxMat(WIZ(), { rough: 0.9, side: THREE.DoubleSide });
    // brim: a wobbly low-poly ring
    const brim = new THREE.RingGeometry(0.16, 0.36, 8, 1);
    brim.rotateX(-Math.PI / 2);
    const bp = brim.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z); bp.setY(i, r > 0.3 ? Math.sin(Math.atan2(z, x) * 3) * 0.02 - 0.015 : 0); }
    uvTo(brim, 0, 0.78, 1, 0.12);
    add(facet(brim), m, false, rig);
    // cone with a bent, floppy tip (a lofted tube)
    const path: V3[] = [[0, 0, 0], [0, 0.18, 0], [-0.03, 0.34, 0], [-0.1, 0.46, 0], [-0.2, 0.5, 0], [-0.27, 0.46, 0]];
    const cone = tube(path, (t) => 0.19 * Math.pow(1 - t, 1.15) + 0.008, 6, { x: 0, y: 0, w: 1, h: 0.78 });
    add(facet(cone), m, false, rig);
    const star = mesh(facet(xf(new THREE.OctahedronGeometry(0.035, 0), [-0.27, 0.43, 0])), patch(psxMat(null, { color: '#ffe060', emissive: '#ffc020', emissiveK: 0.9, metal: 0.5, rough: 0.3 }), false));
    rig.add(star);
    rig.rotation.z = 0.25; rig.position.y = 0.02;
  } else if (id === 'crown') {
    const gm = psxMat(GOLD(), { metal: 0.9, rough: 0.28, side: THREE.DoubleSide });
    const N = 8;
    const pos: number[] = [], uv: number[] = [];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, r = 0.13;
      const top0 = i % 2 ? 0.07 : 0.14, top1 = (i + 1) % 2 ? 0.07 : 0.14;
      const p = (a: number, y: number): number[] => [Math.cos(a) * r, y, Math.sin(a) * r];
      const q = [p(a0, 0), p(a1, 0), p(a1, top1), p(a0, 0), p(a1, top1), p(a0, top0)];
      for (const v of q) pos.push(...v);
      uv.push(0, 0, 1, 0, 1, top1 / 0.14, 0, 0, 1, top1 / 0.14, 0, top0 / 0.14);
    }
    const band = new THREE.BufferGeometry();
    band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    band.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    band.computeVertexNormals();
    add(band, gm, false, rig);
    const gems = ['#ff3050', '#30a0ff', '#40e070', '#ff3050', '#c060ff'];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.3;
      const gmesh = mesh(facet(xf(new THREE.OctahedronGeometry(0.022, 0), [Math.cos(a) * 0.135, 0.045, Math.sin(a) * 0.135])), patch(psxMat(null, { color: gems[k], emissive: gems[k], emissiveK: 0.5, rough: 0.15, metal: 0.3 }), false));
      rig.add(gmesh);
      const ball = mesh(facet(xf(new THREE.OctahedronGeometry(0.014, 0), [Math.cos(a + Math.PI / 5) * 0.13, 0.15, Math.sin(a + Math.PI / 5) * 0.13])), gm);
      rig.add(ball);
    }
    rig.rotation.set(0.15, 0, -0.2);
  } else if (id === 'goggles') {
    add(shellGeo(0.8, 0.85, 0.12, 0.88, () => 0.02), psxMat(LEATHER(), { rough: 0.8, side: THREE.DoubleSide }), true);
    const bm = psxMat(BRASS(), { metal: 0.85, rough: 0.3 });
    for (const s of [-1, 1]) {
      const lens = new THREE.Group();
      lens.add(mesh(facet(cyl(0.07, 0.065, 0.06, 6, [0, 0, 0], [0, 0, Math.PI / 2])), patch(bm, false)));
      lens.add(mesh(facet(cyl(0.055, 0.055, 0.02, 6, [0.032, 0, 0], [0, 0, Math.PI / 2])), patch(psxMat(null, { color: '#7ad8e0', emissive: '#2a8a9a', emissiveK: 0.4, metal: 0.4, rough: 0.05 }), false)));
      lens.position.set(0.02, 0.0, s * 0.11);
      lens.rotation.set(0, -s * 0.5, -0.5);
      rig.add(lens);
    }
  }
  return part;
}

export function buildBack(id: BackId, patch: (m: THREE.Material, bend: boolean) => THREE.Material): GearPart {
  const root = new THREE.Group(); root.name = 'back:' + id;
  const rig = new THREE.Group(); rig.name = 'backRig';
  root.add(rig);
  const part: GearPart = { slot: 'back', root };
  const addR = (g: THREE.BufferGeometry, m: THREE.Material) => { const me = mesh(g, patch(m, false)); rig.add(me); return me; };
  const addS = (g: THREE.BufferGeometry, m: THREE.Material) => { const me = mesh(g, patch(m, true)); root.add(me); return me; };
  if (id === 'pack') {
    const lm = psxMat(LEATHER(), { rough: 0.85 });
    addR(facet(box(0.26, 0.22, 0.2, [-0.02, 0.06, 0])), lm);
    addR(facet(box(0.2, 0.06, 0.21, [0.0, 0.17, 0], [0, 0, 0.12])), psxMat(tex('flap', 16, 16, (p) => { bevel(p, 0, 0, 16, 16, T.leather, 3); stitches(p, 1, 13, 14, 13); }), { rough: 0.85 }));
    addR(facet(box(0.03, 0.04, 0.05, [0.1, 0.12, 0])), psxMat(BRASS(), { metal: 0.8, rough: 0.35 }));
    addR(facet(cyl(0.035, 0.035, 0.18, 6, [-0.05, -0.06, 0], [Math.PI / 2, 0, 0])), psxMat(tex('roll', 16, 16, (p) => { cylinder(p, 0, 0, 16, 16, T.green); rect(p, 0, 7, 16, 2, tone(T.leather, 2)); }), { rough: 0.9 }));
    addS(shellGeo(0.48, 0.53, 0, 1, () => 0.02, undefined, { closed: true }), psxMat(LEATHER(), { rough: 0.85 }));
  } else if (id === 'tank') {
    // yellow scuba cylinder: a black-and-white band, a stencilled O2 mark, a scuffed rim
    const yel = tex('tank', 16, 32, (p) => { cylinder(p, 0, 0, 16, 32, T.yellow); rect(p, 0, 13, 16, 1, '#e8e8e8'); rect(p, 0, 14, 16, 2, '#202024'); rect(p, 0, 16, 16, 1, '#e8e8e8'); for (const [x, y] of [[6, 22], [7, 22], [8, 22], [6, 24], [8, 24], [6, 23], [8, 23], [7, 24]]) p.set(x, y, '#3a2404'); rect(p, 0, 0, 16, 1, tone(T.yellow, 1)); });
    const tm = psxMat(yel, { rough: 0.35, metal: 0.3 });
    addR(facet(cyl(0.075, 0.075, 0.4, 6, [-0.08, 0.06, 0])), tm);
    addR(facet(xf(new THREE.SphereGeometry(0.075, 6, 2, 0, TAU, 0, Math.PI / 2), [-0.28, 0.06, 0], [0, 0, Math.PI / 2])), tm);
    addR(facet(xf(new THREE.SphereGeometry(0.075, 6, 2, 0, TAU, 0, Math.PI / 2), [0.12, 0.06, 0], [0, 0, -Math.PI / 2])), tm);
    const sm = psxMat(STEEL(), { metal: 0.85, rough: 0.3 });
    addR(facet(cyl(0.025, 0.025, 0.07, 6, [0.2, 0.06, 0])), sm);
    addR(facet(cyl(0.03, 0.03, 0.02, 6, [0.22, 0.1, 0], [0, 0, 0])), sm);
    // the hose loops round to a regulator by the mouth
    addR(facet(tube([[0.22, 0.06, 0.03], [0.32, 0.0, 0.18], [0.36, -0.25, 0.36], [0.5, -0.38, 0.3]], () => 0.016, 5, { x: 0, y: 0, w: 1, h: 1 })), psxMat(null, { color: '#1a1a22', rough: 0.6 }));
    addS(shellGeo(0.36, 0.41, 0, 1, () => 0.02, undefined, { closed: true, uvScale: [6, 1] }), psxMat(tex('strap', 16, 16, (p) => { rect(p, 0, 0, 16, 16, tone(T.navy, 3)); stitches(p, 0, 2, 15, 2, '#7a8ab0', '#080a14'); stitches(p, 0, 13, 15, 13, '#7a8ab0', '#080a14'); rect(p, 0, 0, 16, 1, tone(T.navy, 4)); rect(p, 0, 15, 16, 1, tone(T.navy, 1)); }), { rough: 0.8 }));
  } else if (id === 'cape') {
    const clasp = mesh(facet(xf(new THREE.OctahedronGeometry(0.035, 0), [0, 0, 0], [0, 0, 0], [1, 1, 0.6])), patch(psxMat(GOLD(), { metal: 0.9, rough: 0.3 }), false));
    root.add(clasp);
    clasp.name = 'clasp';
    clasp.position.set(...bodyPoint(0.62, 0.5, 0.03));
    part.ribbons = [{ mat: psxMat(CAPE(), { rough: 0.9, side: THREE.DoubleSide}), opts: { n: 7, seg: 0.075, w0: 0.2, w1: 0.3, mode: 'axis', gravity: 0.0012, flutter: 0.0024, uv: [0, 0, 1, 1], thick: 0.006 }, anchor: clasp, k: 0, axis: true }];
  }
  return part;
}

/** the visual identity per gear piece for the backpack / preview labels */
export const GEAR_NAMES: Record<string, string> = {
  toothpick: 'Toothpick Sword', sword: 'Cutlass', dagger: 'Stingray Barb', wand: 'Mana Wand', staff: 'Driftwood Staff', trident: 'Trident', wrench: 'Pipe Wrench',
  none: '-', shellPlate: 'Turtle Shell', chainmail: 'Chainmail', robe: 'Mage Robe',
  bandana: 'Bandana', kasa: 'Straw Kasa', roninKasa: 'Ronin Kasa', helmet: 'Plumed Helm', wizardHat: 'Wizard Hat', crown: 'Tide Crown', goggles: 'Brass Goggles', hood: 'Shadow Hood',
  pack: 'Backpack', tank: 'Scuba Tank', cape: 'Hero Cape',
};
