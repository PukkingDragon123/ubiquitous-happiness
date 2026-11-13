// Blobfish v2 gear: every weapon, hat, armour and back item, modelled PS1-style (a few dozen faceted polys each)
// with a small painted pixel page. Armour and cloth hats are skin-tight shells built on the body's own
// parametrisation (blobShape.bodyPoint) so they squish with the soft body; rigid pieces hang off anchors.
//
//   setGear({ weapon: 'staff', armor: 'robe', hat: 'wizardHat', back: 'cape' })   on BlobModel / Blobfish / BlobPuppet
//   BUILD_GEAR.mage                                                              a full outfit per build
import * as THREE from 'three';
import { Loft, usFor, type V3 } from '../gfx/loft';
import { Px, ramp, hex, mix, pxNoise, worley } from '../gfx/px';
import { hash2, TAU } from '../core/math';
import { bodyPoint, NS, RINGS, addSB } from './blobShape';
import { psxMat, mesh, facet, xf, uvTo } from './psx';

export type WeaponId = 'toothpick' | 'sword' | 'wand' | 'trident' | 'staff' | 'wrench' | 'dagger';
export type ArmorId = 'none' | 'shellPlate' | 'chainmail' | 'robe';
export type HatId = 'none' | 'bandana' | 'helmet' | 'wizardHat' | 'crown' | 'goggles' | 'hood';
export type BackId = 'none' | 'pack' | 'tank' | 'cape';
export interface BlobGear { weapon?: WeaponId; armor?: ArmorId; hat?: HatId; back?: BackId }
export type BuildId = 'default' | 'mage' | 'warrior' | 'summoner' | 'tinkerer' | 'rogue';

export const DEFAULT_GEAR: Required<BlobGear> = { weapon: 'toothpick', armor: 'none', hat: 'bandana', back: 'none' };
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

// ------------------------------------------------------------------ painted pages
const cache = new Map<string, THREE.Texture>();
function tex(key: string, w: number, h: number, fn: (p: Px) => void): THREE.Texture {
  let t = cache.get(key);
  if (!t) { const p = new Px(w, h); fn(p); t = p.texture({ repeat: true }); cache.set(key, t); }
  return t;
}
const R = (cs: string[], n = 5, d = 0.6) => ramp(cs, n, d);

const WOOD = () => tex('wood', 16, 64, (p) => {
  const r = R(['#5a3a20', '#8a6a40', '#c49a62', '#e2c08a', '#f6dfb0'], 6);
  p.fill((x, y) => r(0.62 + (pxNoise(x * 3, y * 0.4, 6, 2, 8) - 0.5) * 0.6 + Math.sin(x * 1.7 + y * 0.05) * 0.08 - (x < 2 || x > 13 ? 0.2 : 0), x, y));
});
const DRIFT = () => tex('drift', 16, 64, (p) => {
  const r = R(['#2a2018', '#55463a', '#86755f', '#b3a286', '#ddd2b8'], 6);
  p.fill((x, y) => { const g = pxNoise(x * 4, y * 0.3, 5, 3, 21); const knot = Math.hypot(x - 8, (y % 21) - 10) < 2.2 ? -0.35 : 0; return r(0.55 + (g - 0.5) * 0.9 + knot - (x & 3 ? 0 : 0.08), x, y); });
});
const STEEL = () => tex('steel', 32, 32, (p) => {
  const r = R(['#1e2232', '#3e4660', '#6a7690', '#a4b0c6', '#dde6f2', '#ffffff'], 6, 0.4);
  p.fill((x, y) => r(0.5 + (y < 3 ? 0.35 : 0) - (y > 28 ? 0.2 : 0) + (pxNoise(x * 0.4, y * 4, 4, 2, 2) - 0.5) * 0.25 + (y === 15 || y === 16 ? -0.25 : 0), x, y));
});
const BRASS = () => tex('brass', 32, 32, (p) => {
  const r = R(['#3a1c06', '#7a4a10', '#c08a24', '#f0c850', '#fff2a8'], 5, 0.5);
  p.fill((x, y) => r(0.5 + (pxNoise(x, y, 6, 3, 4) - 0.5) * 0.5 + (y < 4 ? 0.25 : 0) - (y > 27 ? 0.2 : 0), x, y));
});
const GOLD = () => tex('gold', 32, 32, (p) => {
  const r = R(['#4a1a04', '#94500a', '#d89018', '#ffd040', '#fff6b0', '#ffffff'], 6, 0.4);
  p.fill((x, y) => r(0.55 + (pxNoise(x, y, 5, 3, 7) - 0.5) * 0.4 + (y < 5 ? 0.25 : 0) - (y > 26 ? 0.25 : 0), x, y));
});
const LEATHER = () => tex('leather', 32, 32, (p) => {
  const r = R(['#1e0e06', '#4a2410', '#7a4220', '#a86a38', '#d09a60'], 5);
  p.fill((x, y) => r(0.5 + (pxNoise(x, y, 4, 3, 9) - 0.5) * 0.6 - ((x + y * 3) % 8 === 0 ? 0.25 : 0), x, y));
});
function glowTex(key: string, cs: string[]) {
  return tex(key, 16, 16, (p) => {
    const r = R(cs, 5, 0.3);
    p.fill((x, y) => r(0.45 + (1 - Math.hypot(x - 5, y - 5) / 12) * 0.6 + ((x * 7 + y * 3) % 11 === 0 ? 0.2 : 0), x, y));
  });
}
const ROPE = () => tex('rope', 16, 16, (p) => { const r = R(['#3a2410', '#7a5a30', '#b08a54', '#e0c890'], 4); p.fill((x, y) => r(0.6 + (((x + y) % 4) < 2 ? 0.2 : -0.2), x, y)); });

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
  const hit = weaponCache.get(id);
  if (hit) return hit.clone();
  const g = new THREE.Group();
  g.name = 'weapon:' + id;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const me = mesh(geo, m); g.add(me); return me; };
  switch (id) {
    case 'toothpick': {
      add(facet(tube(Array.from({ length: 7 }, (_, i) => [i / 6 * 0.84, 0, 0] as V3), (t) => (t < 0.08 ? 0.016 + t * 0.12 : 0.027 * Math.pow(1 - (t - 0.08) / 0.92, 0.75) + 0.002), 6)), psxMat(WOOD(), { rough: 0.6 }));
      const cork = tex('cork', 16, 16, (p) => { const r = R(['#5a3a1c', '#8a6236', '#b88c5a', '#dcb886'], 4); p.fill((x, y) => r(0.55 + (hash2(x, y, 5) - 0.5) * 0.8, x, y)); });
      add(facet(cyl(0.048, 0.05, 0.07, 6, [0.09, 0, 0])), psxMat(cork, { rough: 0.95 }));
      // cocktail frill: foil strips fanning from the pommel
      const cols = ['#ff3b5c', '#ffd23b', '#3bd1ff', '#7dff6a', '#c27bff'];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
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
      const barb = tex('barb', 32, 32, (p) => { const r = R(['#1a1410', '#3e3226', '#6e5c44', '#a89070', '#e0d0b0'], 5, 0.4); p.fill((x, y) => r(0.6 - x / 60 + (y % 4 === 0 ? -0.2 : 0) + (pxNoise(x, y, 4, 2, 3) - 0.5) * 0.3 - (x > 26 ? 0.3 : 0), x, y)); });
      const blade = bladeGeo(0.05, 0.5, (t) => 0.034 * (1 - t * 0.7), (t) => 0.01 * (1 - t * 0.5), (t) => Math.sin(t * Math.PI) * 0.025, 9, (t, s) => (s > 0 ? ((Math.floor(t * 9) & 1) ? 0.012 * (1 - t) : 0) : 0));
      uvTo(blade, 0, 0, 1, 1);
      add(blade, psxMat(barb, { rough: 0.35, metal: 0.1 }));
      add(facet(box(0.03, 0.09, 0.04, [0.04, 0, 0])), psxMat(LEATHER(), { rough: 0.6 }));
      add(facet(cyl(0.02, 0.018, 0.11, 5, [-0.03, 0, 0])), psxMat(tex('wrap', 16, 16, (p) => { const r = R(['#1a0a1e', '#3a1840', '#6a3070', '#a060a8'], 4); p.fill((x, y) => r(((x + y) & 3) < 2 ? 0.75 : 0.35, x, y)); }), { rough: 0.8 }));
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
      const red = tex('redPaint', 16, 32, (p) => { const r = R(['#2a0806', '#6a160c', '#a82a14', '#d85a2a', '#f09a5a'], 5); p.fill((x, y) => { const chip = pxNoise(x, y, 3, 2, 5) > 0.66; return chip ? hex(hash2(x, y, 1) < 0.5 ? '#6a6058' : '#8a5a3a') : r(0.55 + (x < 3 ? 0.25 : x > 12 ? -0.25 : 0), x, y); }); });
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
  const red = R(['#5e0d14', '#9c1b22', '#d0302e', '#f05a48'], 5);
  p.fill((x, y) => {
    const weave = ((x + y) & 1) * 0.06;
    const dx = ((x + ((y >> 3) & 1) * 4) % 8) - 3.5, dy = (y % 8) - 3.5;
    const r2 = dx * dx + dy * dy;
    if (r2 < 3.2) return r2 < 1.2 && dx < 0 ? hex('#ffffff') : hex('#fbecd6');
    return red(0.62 + weave + (pxNoise(x, y, 6, 2, 3) - 0.5) * 0.25, x, y);
  });
});
const SHELL = () => tex('turtle', 64, 64, (p) => {
  const r = R(['#1a1a08', '#3a3410', '#6a5a1c', '#9a8030', '#c8a850', '#f0d890'], 6);
  p.fill((x, y) => {
    const [f1, f2, id] = worley(x, y, 16, 5, 64);
    const seam = f2 - f1 < 2.2;
    const rim = f2 - f1 < 5 ? (5 - (f2 - f1)) / 5 : 0;
    return seam ? hex('#20180a') : r(0.35 + id * 0.25 + rim * 0.3 - f1 / 40 + (pxNoise(x, y, 3, 2, 8) - 0.5) * 0.2, x, y);
  });
});
const CHAIN = () => tex('chain', 32, 32, (p) => {
  const r = R(['#14161e', '#30364a', '#5a6478', '#8e9ab0', '#d0dae8'], 5, 0.3);
  p.fill((x, y) => {
    const row = y >> 2, ox = (row & 1) * 2;
    const cx = (((x + ox) % 4) + 4) % 4 - 1.5, cy = (y % 4) - 1.5;
    const d = Math.hypot(cx, cy * 1.2);
    if (d > 1.9) return hex('#0c0e14');
    return r(d > 1 ? 0.75 - cy * 0.12 : 0.2, x, y);
  });
  for (let x = 0; x < 32; x++) for (const y of [0, 1, 30, 31]) p.set(x, y, mix(hex('#a07a2a'), hex('#f0c860'), y < 2 ? 0.7 : 0.2));
});
const ROBE = () => tex('robe', 64, 64, (p) => {
  const r = R(['#14082a', '#2a1258', '#46208a', '#6a3cb8', '#9a70e0'], 5);
  p.fill((x, y) => r(0.5 + (pxNoise(x, y, 8, 3, 2) - 0.5) * 0.35 + (((x + y * 2) % 7) === 0 ? -0.08 : 0), x, y));
  // gold trim at the front edge (v = 1 = top rows) and runes along the hem
  for (let x = 0; x < 64; x++) for (let y = 0; y < 6; y++) p.set(x, y, y === 0 || y === 5 ? hex('#6a3a08') : mix(hex('#f0c040'), hex('#fff0a0'), y === 2 ? 0.6 : 0.1));
  for (let k = 0; k < 8; k++) {
    const cx = 4 + k * 8, cy = 54;
    const c = hex('#f0c040');
    const seed = k * 7;
    for (let s = 0; s < 4; s++) { const a = hash2(k, s, 3) * TAU, l = 2 + hash2(k, s, 5) * 2; p.line(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, c); }
    void seed;
  }
});
const CAPE = () => tex('cape', 32, 32, (p) => {
  const r = R(['#3a040c', '#6e0a18', '#a81828', '#d83a3a', '#f87a5a'], 5);
  p.fill((x, y) => (y < 3 || y > 28 ? (y === 0 || y === 31 ? hex('#5a3006') : hex('#f0c040')) : r(0.55 + Math.sin(x * 0.7) * 0.1 + (pxNoise(x, y, 6, 2, 1) - 0.5) * 0.2, x, y)));
});
const HOOD = () => tex('hood', 32, 32, (p) => {
  const r = R(['#06080e', '#12161e', '#20283a', '#36425a', '#56647e'], 5);
  p.fill((x, y) => r(0.5 + (pxNoise(x, y, 5, 3, 6) - 0.5) * 0.4 + (((x + y) & 3) === 0 ? 0.08 : 0) - (y > 28 ? 0.2 : 0), x, y));
  for (let x = 0; x < 32; x++) { p.set(x, 0, '#5a1a6a'); p.set(x, 1, '#8a3aa0'); }
});
const WIZ = () => tex('wizard', 64, 64, (p) => {
  const r = R(['#06082a', '#101a5a', '#1e2e90', '#3248c0', '#5a7ae8'], 5);
  p.fill((x, y) => r(0.45 + (pxNoise(x, y, 7, 3, 4) - 0.5) * 0.35 + y / 200, x, y));
  for (let k = 0; k < 14; k++) {
    const x = Math.floor(hash2(k, 1, 9) * 60) + 2, y = Math.floor(hash2(k, 2, 9) * 46) + 2, big = hash2(k, 3, 9) > 0.6;
    const c = hex('#ffe680');
    p.set(x, y, '#ffffff'); p.set(x - 1, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x, y + 1, c);
    if (big) { p.set(x - 2, y, c); p.set(x + 2, y, c); p.set(x, y - 2, c); p.set(x, y + 2, c); }
  }
  for (let x = 0; x < 64; x++) for (let y = 50; y < 58; y++) p.set(x, y, y === 50 || y === 57 ? hex('#5a2a04') : mix(hex('#d89018'), hex('#ffe060'), y === 52 ? 0.8 : 0.3));
  for (let x = 4; x < 64; x += 10) { p.rect(x, 51, 3, 6, '#3a1a6a'); p.rect(x + 1, 52, 1, 4, '#c070ff'); }
});

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
    add(shellGeo(0.1, 0.66, 0.29, 0.71, (t, u) => 0.03 + Math.sin(((u - 0.29) / 0.42) * Math.PI) * Math.sin(((t - 0.1) / 0.56) * Math.PI) * 0.07), psxMat(SHELL(), { rough: 0.55 }));
    add(shellGeo(0.38, 0.47, 0, 1, () => 0.022, undefined, { closed: true }), psxMat(LEATHER(), { rough: 0.8 }));
  } else if (id === 'chainmail') {
    add(shellGeo(0.18, 0.66, 0, 1, (t) => 0.02 + (t < 0.24 ? (0.24 - t) * 0.3 : 0), undefined, { closed: true }), psxMat(CHAIN(), { metal: 0.85, rough: 0.4, side: THREE.DoubleSide }));
    // a brass-trimmed leather belt
    add(shellGeo(0.36, 0.42, 0, 1, () => 0.03, undefined, { closed: true }), psxMat(LEATHER(), { rough: 0.8 }));
  } else if (id === 'robe') {
    // a flowing mage robe from the neck to the tail, flared at the hem, gold-trimmed collar
    add(shellGeo(0.03, 0.66, 0, 1, (t) => 0.022 + Math.pow(Math.max(0, 0.35 - t) / 0.35, 1.5) * 0.12, undefined, { closed: true }), psxMat(ROBE(), { rough: 0.9, side: THREE.DoubleSide, flat: false }));
  }
  return { slot: 'armor', root };
}

/** hats: cloth caps are shells (bend), rigid ones hang off the head anchor (returned as root, placed by the caller) */
export function buildHat(id: HatId, patch: (m: THREE.Material, bend: boolean) => THREE.Material): GearPart {
  const root = new THREE.Group(); root.name = 'hat:' + id;
  const add = (g: THREE.BufferGeometry, m: THREE.Material, bend: boolean, parent: THREE.Object3D = root) => { const me = mesh(g, patch(m, bend)); parent.add(me); return me; };
  const part: GearPart = { slot: 'hat', root };
  const rig = new THREE.Group(); rig.name = 'hatRig'; // rigid pieces, positioned at the head anchor every frame
  root.add(rig);
  if (id === 'bandana') {
    const mat = psxMat(BANDANA(), { rough: 0.9, side: THREE.DoubleSide, flat: false });
    add(shellGeo(0.52, 0.86, 0.27, 0.73, (t) => 0.016 + (t > 0.83 ? 0.008 : 0), undefined, { uvScale: [3, 1.2] }), mat, true);
    const knot = add(facet(xf(new THREE.IcosahedronGeometry(0.05, 0), [0, 0, 0], [0, 0, 0], [1.2, 0.85, 1.1])), psxMat(BANDANA(), { rough: 0.9 }), false);
    knot.name = 'knot';
    knot.position.set(...bodyPoint(0.56, 0.5, 0.035));
    part.ribbons = [0, 1].map((k) => ({ mat: psxMat(BANDANA(), { rough: 0.9, side: THREE.DoubleSide, flat: false }), opts: { n: 7, seg: 0.06, w0: 0.045, w1: 0.03, uv: [0, 0, 1, 1] as [number, number, number, number] }, anchor: knot, k }));
  } else if (id === 'helmet') {
    const st = psxMat(STEEL(), { metal: 0.85, rough: 0.32 });
    add(shellGeo(0.52, 0.93, 0.16, 0.84, (t, u) => 0.03 + Math.sin(((u - 0.16) / 0.68) * Math.PI) * 0.02), st, true);
    add(shellGeo(0.9, 0.95, 0.16, 0.84, () => 0.052), psxMat(BRASS(), { metal: 0.8, rough: 0.35 }), true);
    // nasal guard + crest plume (rigid, on the anchor)
    add(facet(box(0.12, 0.03, 0.035, [0.06, -0.02, 0], [0, 0, -1.1])), psxMat(STEEL(), { metal: 0.85, rough: 0.32 }), false, rig);
    const plume = tex('plume', 16, 32, (p) => { const r = R(['#4a040c', '#8a0a18', '#d02030', '#ff6050'], 4); p.fill((x, y) => r(0.55 + (x % 3 === 0 ? -0.25 : 0.1) + (y < 4 ? 0.2 : 0), x, y)); });
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const f = mesh(facet(box(0.05, 0.13 - Math.abs(t - 0.35) * 0.08, 0.022, [-t * 0.36 + 0.02, 0.07 + Math.sin(t * Math.PI) * 0.03, 0], [0, 0, 0.35 + t * 0.6])), patch(psxMat(plume, { rough: 0.9 }), false));
      rig.add(f);
    }
  } else if (id === 'hood') {
    const m = psxMat(HOOD(), { rough: 0.95, side: THREE.DoubleSide, flat: false });
    add(shellGeo(0.42, 0.9, 0.1, 0.9, (t, u) => 0.024 + (t < 0.5 ? (0.5 - t) * 0.3 : 0) + Math.abs(u - 0.5) * 0.01), m, true);
    // the hood's point flops back behind the head
    add(facet(xf(new THREE.ConeGeometry(0.1, 0.32, 5), [-0.26, -0.05, 0], [0, 0, 1.9])), psxMat(HOOD(), { rough: 0.95 }), false, rig);
    // a dark mask band across the eyes is painted on the face via `mask` (see BlobModel)
  } else if (id === 'wizardHat') {
    const m = psxMat(WIZ(), { rough: 0.9, side: THREE.DoubleSide });
    // brim: a wobbly low-poly ring
    const brim = new THREE.RingGeometry(0.16, 0.36, 10, 1);
    brim.rotateX(-Math.PI / 2);
    const bp = brim.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z); bp.setY(i, r > 0.3 ? Math.sin(Math.atan2(z, x) * 3) * 0.02 - 0.015 : 0); }
    uvTo(brim, 0, 0.78, 1, 0.12);
    add(facet(brim), m, false, rig);
    // cone with a bent, floppy tip (a lofted tube)
    const path: V3[] = [[0, 0, 0], [0, 0.18, 0], [-0.03, 0.34, 0], [-0.1, 0.46, 0], [-0.2, 0.5, 0], [-0.27, 0.46, 0]];
    const cone = tube(path, (t) => 0.19 * Math.pow(1 - t, 1.15) + 0.008, 8, { x: 0, y: 0, w: 1, h: 0.78 });
    add(facet(cone), m, false, rig);
    const star = mesh(facet(xf(new THREE.OctahedronGeometry(0.035, 0), [-0.27, 0.43, 0])), patch(psxMat(null, { color: '#ffe060', emissive: '#ffc020', emissiveK: 0.9, metal: 0.5, rough: 0.3 }), false));
    rig.add(star);
    rig.rotation.z = 0.25; rig.position.y = 0.02;
  } else if (id === 'crown') {
    const gm = psxMat(GOLD(), { metal: 0.9, rough: 0.28, side: THREE.DoubleSide });
    const N = 10;
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
      lens.add(mesh(facet(cyl(0.07, 0.065, 0.06, 8, [0, 0, 0], [0, 0, Math.PI / 2])), patch(bm, false)));
      lens.add(mesh(facet(cyl(0.055, 0.055, 0.02, 8, [0.032, 0, 0], [0, 0, Math.PI / 2])), patch(psxMat(null, { color: '#7ad8e0', emissive: '#2a8a9a', emissiveK: 0.4, metal: 0.4, rough: 0.05 }), false)));
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
    addR(facet(box(0.2, 0.06, 0.21, [0.0, 0.17, 0], [0, 0, 0.12])), psxMat(tex('flap', 16, 16, (p) => { const r = R(['#2a1206', '#5a2e14', '#8a5028', '#b87a44'], 4); p.fill((x, y) => r(0.6 - y / 30 + (hash2(x, y, 2) - 0.5) * 0.2, x, y)); }), { rough: 0.85 }));
    addR(facet(box(0.03, 0.04, 0.05, [0.1, 0.12, 0])), psxMat(BRASS(), { metal: 0.8, rough: 0.35 }));
    addR(facet(cyl(0.035, 0.035, 0.18, 6, [-0.05, -0.06, 0], [Math.PI / 2, 0, 0])), psxMat(tex('roll', 16, 16, (p) => { const r = R(['#1a3a2a', '#2a6a4a', '#4a9a6a', '#8ad0a0'], 4); p.fill((x, y) => r(0.5 + ((y % 4) < 2 ? 0.2 : -0.1), x, y)); }), { rough: 0.9 }));
    addS(shellGeo(0.48, 0.53, 0, 1, () => 0.02, undefined, { closed: true }), psxMat(LEATHER(), { rough: 0.85 }));
  } else if (id === 'tank') {
    const yel = tex('tank', 16, 32, (p) => { const r = R(['#3a2004', '#8a5a08', '#d8a018', '#ffd840', '#fff4a0'], 5, 0.4); p.fill((x, y) => (y > 13 && y < 17 ? hex(y === 15 ? '#202020' : '#e8e8e8') : r(0.55 + (x < 4 ? 0.25 : x > 12 ? -0.25 : 0) - (pxNoise(x, y, 3, 2, 3) > 0.7 ? 0.2 : 0), x, y))); });
    const tm = psxMat(yel, { rough: 0.35, metal: 0.3 });
    addR(facet(cyl(0.075, 0.075, 0.4, 8, [-0.08, 0.06, 0])), tm);
    addR(facet(xf(new THREE.SphereGeometry(0.075, 8, 3, 0, TAU, 0, Math.PI / 2), [-0.28, 0.06, 0], [0, 0, Math.PI / 2])), tm);
    addR(facet(xf(new THREE.SphereGeometry(0.075, 8, 3, 0, TAU, 0, Math.PI / 2), [0.12, 0.06, 0], [0, 0, -Math.PI / 2])), tm);
    const sm = psxMat(STEEL(), { metal: 0.85, rough: 0.3 });
    addR(facet(cyl(0.025, 0.025, 0.07, 6, [0.2, 0.06, 0])), sm);
    addR(facet(cyl(0.03, 0.03, 0.02, 6, [0.22, 0.1, 0], [0, 0, 0])), sm);
    // the hose loops round to a regulator by the mouth
    addR(facet(tube([[0.22, 0.06, 0.03], [0.32, 0.0, 0.18], [0.36, -0.25, 0.36], [0.5, -0.38, 0.3]], () => 0.016, 5, { x: 0, y: 0, w: 1, h: 1 })), psxMat(null, { color: '#1a1a22', rough: 0.6 }));
    addS(shellGeo(0.36, 0.41, 0, 1, () => 0.02, undefined, { closed: true }), psxMat(tex('strap', 16, 16, (p) => { const r = R(['#06080e', '#1a2030', '#2a3448', '#4a5670'], 4); p.fill((x, y) => r(0.5 + (y % 3 === 0 ? -0.2 : 0.1), x, y)); }), { rough: 0.8 }));
  } else if (id === 'cape') {
    const clasp = mesh(facet(xf(new THREE.OctahedronGeometry(0.035, 0), [0, 0, 0], [0, 0, 0], [1, 1, 0.6])), patch(psxMat(GOLD(), { metal: 0.9, rough: 0.3 }), false));
    root.add(clasp);
    clasp.name = 'clasp';
    clasp.position.set(...bodyPoint(0.62, 0.5, 0.03));
    part.ribbons = [{ mat: psxMat(CAPE(), { rough: 0.9, side: THREE.DoubleSide, flat: false }), opts: { n: 7, seg: 0.075, w0: 0.2, w1: 0.3, mode: 'axis', gravity: 0.0012, flutter: 0.0024, uv: [0, 0, 1, 1], thick: 0.006 }, anchor: clasp, k: 0, axis: true }];
  }
  return part;
}

/** the visual identity per gear piece for the backpack / preview labels */
export const GEAR_NAMES: Record<string, string> = {
  toothpick: 'Toothpick Sword', sword: 'Cutlass', dagger: 'Stingray Barb', wand: 'Mana Wand', staff: 'Driftwood Staff', trident: 'Trident', wrench: 'Pipe Wrench',
  none: '-', shellPlate: 'Turtle Shell', chainmail: 'Chainmail', robe: 'Mage Robe',
  bandana: 'Bandana', helmet: 'Plumed Helm', wizardHat: 'Wizard Hat', crown: 'Tide Crown', goggles: 'Brass Goggles', hood: 'Shadow Hood',
  pack: 'Backpack', tank: 'Scuba Tank', cape: 'Hero Cape',
};
