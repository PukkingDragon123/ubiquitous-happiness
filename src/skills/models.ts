// Low-poly PS1 models for skill props: projectiles (mana bolt, ice shard, magma orb, nail, harpoon, ink bomb,
// venom vial, net ball), summons (pet crab, piranha, octopus pal) and gadgets (junk turret, harpoon ballista,
// sea mine, net trap). A few dozen faceted polys each, every one with a small painted pixel page.
import * as THREE from 'three';
import { Loft, usFor, type V3 } from '../gfx/loft';
import { Px, hex, worley } from '../gfx/px';
import { T, tone, rect, bevel, planks, rivet, rust, cylinder, gemFacets } from './texkit';
import { hash2, TAU } from '../core/math';
import { psxMat, mesh, facet, xf, uvTo } from '../player/psx';

const cache = new Map<string, THREE.Texture>();
const tex = (key: string, w: number, h: number, fn: (p: Px) => void) => {
  let t = cache.get(key);
  if (!t) { const p = new Px(w, h); fn(p); t = p.texture(); cache.set(key, t); }
  return t;
};
const matCache = new Map<string, THREE.Material>();
const M = (key: string, make: () => THREE.Material) => { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m); } return m; };

const RUST = () => tex('rust', 32, 32, (p) => { bevel(p, 0, 0, 32, 32, ['#2a120a', '#4e2412', '#74381a', '#9a5226', '#c07a40'], 2); for (const [x, y, l] of [[6, 4, 9], [17, 8, 12], [26, 3, 7]]) rust(p, x, y, l); rect(p, 3, 20, 10, 2, '#3a1a0c'); rect(p, 18, 24, 8, 2, '#3a1a0c'); });
const DARKMETAL = () => tex('dmetal', 32, 32, (p) => { bevel(p, 0, 0, 32, 16, T.slate, 2); bevel(p, 0, 16, 32, 16, T.slate, 2); for (const x of [3, 14, 25]) { rivet(p, x, 3, T.slate); rivet(p, x, 19, T.slate); rust(p, x + 1, 6, 5); } });
const WOOD = () => tex('swood', 32, 32, (p) => planks(p, 0, 0, 32, 32, T.oak, { vertical: false, plank: 8, seed: 4, knots: 2 }));
const glow = (key: string, cs: string[]) => tex(key, 16, 16, (p) => gemFacets(p, 0, 0, 16, 16, cs));

// ------------------------------------------------------------------ projectiles
export function boltMesh(color = '#9a7aff'): THREE.Object3D {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  g.add(mesh(facet(xf(new THREE.OctahedronGeometry(0.13, 0), [0, 0, 0], [0, 0, 0], [2.4, 1, 1])), M('bolt' + color, () => psxMat(glow('bolt' + color, ['#1a0a4a', '#' + c.clone().multiplyScalar(0.5).getHexString(), color, '#e8e0ff', '#ffffff']), { emissive: color, emissiveK: 2.2, rough: 0.1 })), false));
  return g;
}
export function shardMesh(): THREE.Object3D {
  return mesh(facet(xf(new THREE.OctahedronGeometry(0.17, 0), [0, 0, 0], [0, 0, 0], [2.8, 0.75, 0.75])), M('shard', () => psxMat(glow('ice', ['#1a4a7a', '#4aa0d8', '#a8e8ff', '#e8ffff', '#ffffff']), { emissive: '#4ab8f0', emissiveK: 0.8, rough: 0.05, metal: 0.3 })), false);
}
export function magmaMesh(): THREE.Object3D {
  // cooled black crust plates with bright molten cracks between them
  const t = tex('magma', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const [f1, f2] = worley(x, y, 8, 3, 32); const e = f2 - f1; p.set(x, y, tone(T.lava, e < 1.2 ? 4 : e < 2.4 ? 3 : e < 3.5 ? 1 : 0)); } });
  return mesh(facet(new THREE.IcosahedronGeometry(0.2, 0)), M('magma', () => psxMat(t, { emissive: '#ff6a10', emissiveK: 1.2, emissiveMap: t, rough: 0.8 })), false);
}
export function nailMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.012, 0.004, 0.22, 4), [0, 0, 0], [0, 0, -Math.PI / 2])), M('nail', () => psxMat(RUST(), { metal: 0.6, rough: 0.5 })), false));
  g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 6), [-0.11, 0, 0], [0, 0, Math.PI / 2])), M('nail', () => psxMat(RUST(), { metal: 0.6, rough: 0.5 })), false));
  return g;
}
export function harpoonMesh(scale = 1): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), [-0.35, 0, 0], [0, 0, Math.PI / 2])), M('hshaft', () => psxMat(WOOD(), { rough: 0.8 }))));
  const tip = M('htip', () => psxMat(DARKMETAL(), { metal: 0.8, rough: 0.35 }));
  g.add(mesh(facet(xf(new THREE.ConeGeometry(0.06, 0.26, 4), [0.33, 0, 0], [0, 0, -Math.PI / 2])), tip));
  for (const s of [-1, 1]) g.add(mesh(facet(xf(new THREE.ConeGeometry(0.025, 0.14, 3), [0.22, s * 0.05, 0], [0, 0, -Math.PI / 2 + s * 2.6])), tip));
  for (const s of [-1, 1]) g.add(mesh(facet(xf(new THREE.BoxGeometry(0.14, 0.005, 0.08), [-0.85, s * 0.03, 0], [0, 0, s * 0.3])), M('fletch', () => psxMat(null, { color: '#d83030', rough: 0.9, side: THREE.DoubleSide }))));
  g.scale.setScalar(scale);
  return g;
}
export function inkBombMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const t = tex('inkbomb', 16, 16, (p) => { bevel(p, 0, 0, 16, 16, ['#06040c', '#14102a', '#2a2050', '#4a3a80', '#6a5aa8'], 1); rect(p, 6, 6, 4, 4, '#e8e0ff'); p.set(7, 7, '#1a1030'); p.set(8, 8, '#1a1030'); });
  g.add(mesh(facet(new THREE.IcosahedronGeometry(0.13, 0)), M('ink', () => psxMat(t, { rough: 0.3, metal: 0.2 }))));
  g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6), [0, 0.13, 0])), M('inkcap', () => psxMat(DARKMETAL(), { metal: 0.8 }))));
  g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 3), [0.02, 0.2, 0], [0, 0, -0.4])), M('fuse', () => psxMat(null, { color: '#c8a060' }))));
  return g;
}
export function vialMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(facet(xf(new THREE.IcosahedronGeometry(0.11, 0), [0, -0.03, 0], [0, 0, 0], [1, 1.1, 1])), M('vial', () => psxMat(glow('venom', ['#0a2a08', '#2a7a1a', '#6ae03a', '#c8ff8a', '#ffffff']), { emissive: '#4ad020', emissiveK: 0.8, rough: 0.05 }))));
  g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.035, 0.04, 0.1, 6), [0, 0.1, 0])), M('vialneck', () => psxMat(null, { color: '#a8e8c0', rough: 0.1, metal: 0.2 }))));
  g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.04, 0.035, 0.05, 6), [0, 0.16, 0])), M('cork', () => psxMat(null, { color: '#a07040', rough: 0.9 }))));
  return g;
}
const NET = () => tex('net', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const gx = (x + y) % 8, gy = (x - y + 64) % 8; if (gx < 1 || gy < 1) p.set(x, y, gx < 1 && gy < 1 ? '#f0e0b0' : '#b89a62'); } });
export function netBallMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(0.18, 1), M('netball', () => psxMat(NET(), { alphaTest: 0.5, side: THREE.DoubleSide}))));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6), [Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0])), M('cork', () => psxMat(null, { color: '#c89050', rough: 0.9 })))); }
  return g;
}
/** a spread net lying on the seabed (trap) */
export function netTrapMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1.4, 0.8, 4, 2);
  const pa = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 6) * 0.03 + hash2(i, 1, 3) * 0.04);
  geo.rotateX(-Math.PI / 2);
  g.add(mesh(geo, M('nettrap', () => psxMat(NET(), { alphaTest: 0.5, side: THREE.DoubleSide}))));
  for (let k = 0; k < 6; k++) g.add(mesh(facet(xf(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 6), [(k % 3 - 1) * 0.6, 0.03, (k < 3 ? -1 : 1) * 0.36], [Math.PI / 2, 0, 0])), M('cork', () => psxMat(null, { color: '#c89050', rough: 0.9 }))));
  return g;
}

// ------------------------------------------------------------------ sea mine
export function mineMesh(): { root: THREE.Group; light: THREE.Mesh } {
  const root = new THREE.Group();
  const body = new THREE.IcosahedronGeometry(0.32, 1);
  const metal = M('mine', () => psxMat(DARKMETAL(), { metal: 0.7, rough: 0.45 }));
  root.add(mesh(facet(body), metal));
  const ico = new THREE.IcosahedronGeometry(0.32, 0);
  const pa = ico.attributes.position as THREE.BufferAttribute;
  const seen = new Set<string>();
  for (let i = 0; i < pa.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pa, i);
    const k = v.toArray().map((n) => n.toFixed(2)).join(',');
    if (seen.has(k)) continue; seen.add(k);
    const sp = new THREE.ConeGeometry(0.05, 0.16, 4);
    sp.translate(0, 0.08, 0);
    sp.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()));
    sp.translate(v.x * 0.95, v.y * 0.95, v.z * 0.95);
    root.add(mesh(facet(sp), M('minespike', () => psxMat(RUST(), { metal: 0.5, rough: 0.6 }))));
  }
  const light = mesh(facet(xf(new THREE.OctahedronGeometry(0.05, 0), [0, 0.36, 0.08])), new THREE.MeshBasicMaterial({ color: '#ff2020' }), false);
  root.add(light);
  return { root, light };
}

// ------------------------------------------------------------------ junk turret
export function turretMesh(): { root: THREE.Group; head: THREE.Group; muzzle: THREE.Object3D } {
  const root = new THREE.Group(), head = new THREE.Group();
  const wood = M('swood', () => psxMat(WOOD(), { rough: 0.85 }));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; root.add(mesh(facet(xf(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 5), [Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4])), wood)); }
  // a sardine tin: red enamel, a cream label with a fish, crimped steel rims
  const can = tex('can', 32, 16, (p) => { cylinder(p, 0, 0, 32, 16, T.red, false); rect(p, 0, 6, 32, 4, '#f0e8d0'); for (let x = 3; x < 32; x += 10) { rect(p, x, 7, 5, 2, '#6a7a8a'); p.set(x + 5, 7, '#6a7a8a'); p.set(x + 5, 8, '#6a7a8a'); p.set(x + 1, 7, '#1a1a20'); } for (const y of [0, 15]) rect(p, 0, y, 32, 1, tone(T.steel, 1)); for (const y of [1, 14]) for (let x = 0; x < 32; x += 2) p.set(x, y, tone(T.steel, 4)); });
  const canM = M('can', () => psxMat(can, { metal: 0.4, rough: 0.45 }));
  head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 8), [0, 0, 0], [0, 0, Math.PI / 2])), canM));
  const pipe = M('pipe', () => psxMat(DARKMETAL(), { metal: 0.8, rough: 0.4 }));
  head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), [0.32, 0.02, 0], [0, 0, Math.PI / 2])), pipe));
  head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 6), [0.52, 0.02, 0], [0, 0, Math.PI / 2])), pipe));
  head.add(mesh(facet(xf(new THREE.BoxGeometry(0.16, 0.12, 0.12), [-0.18, 0.1, 0])), M('battery', () => psxMat(tex('bat', 16, 16, (p) => { bevel(p, 0, 4, 16, 12, T.slate, 1); rect(p, 0, 0, 8, 4, '#d02020'); rect(p, 8, 0, 8, 4, '#202020'); p.rect(3, 8, 10, 3, '#e8c020'); }), { rough: 0.5 }))));
  head.add(mesh(facet(xf(new THREE.OctahedronGeometry(0.035, 0), [0.0, 0.2, 0])), new THREE.MeshBasicMaterial({ color: '#40ff60' }), false));
  head.position.y = 0.66;
  root.add(head);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.56, 0.02, 0); head.add(muzzle);
  return { root, head, muzzle };
}

// ------------------------------------------------------------------ harpoon ballista
export function ballistaMesh(): { root: THREE.Group; head: THREE.Group; bolt: THREE.Object3D; muzzle: THREE.Object3D } {
  const root = new THREE.Group(), head = new THREE.Group();
  const wood = M('swood', () => psxMat(WOOD(), { rough: 0.85 }));
  const iron = M('pipe', () => psxMat(DARKMETAL(), { metal: 0.8, rough: 0.4 }));
  root.add(mesh(facet(xf(new THREE.BoxGeometry(0.9, 0.12, 0.6), [0, 0.06, 0])), wood));
  root.add(mesh(facet(xf(new THREE.BoxGeometry(0.12, 0.6, 0.12), [0, 0.4, 0])), wood));
  for (const s of [-1, 1]) root.add(mesh(facet(xf(new THREE.BoxGeometry(0.06, 0.5, 0.06), [s * 0.22, 0.3, 0], [0, 0, s * 0.5])), wood));
  head.add(mesh(facet(xf(new THREE.BoxGeometry(1.0, 0.1, 0.14), [0.1, 0, 0])), wood));
  // bow arms: three bent planks per side
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a0 = k * 0.35;
      head.add(mesh(facet(xf(new THREE.BoxGeometry(0.06, 0.24, 0.05), [0.42 - k * 0.05, s * (0.12 + k * 0.2), 0], [0, 0, s * (0.15 + a0)])), wood));
    }
    head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.006, 0.006, 0.66, 3), [0.12, s * 0.3, 0], [0, 0, s * -1.0])), M('string', () => psxMat(null, { color: '#e8dcb8', rough: 0.9 })), false));
  }
  head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), [-0.4, 0, 0], [Math.PI / 2, 0, 0])), iron));
  const bolt = harpoonMesh(0.85);
  bolt.position.set(0.18, 0.07, 0);
  head.add(bolt);
  head.position.y = 0.72;
  root.add(head);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.6, 0.07, 0); head.add(muzzle);
  return { root, head, bolt, muzzle };
}

// ------------------------------------------------------------------ pet crab
export function crabMesh(): { root: THREE.Group; legs: THREE.Object3D[]; claws: { arm: THREE.Group; pin: THREE.Object3D }[]; eyes: THREE.Object3D[] } {
  const root = new THREE.Group();
  // red-orange shell: a darker band at the rim, pale bumps in deliberate rows, a cream underside
  const shell = tex('crab', 32, 32, (p) => {
    rect(p, 0, 0, 32, 24, tone(T.coral, 2)); rect(p, 0, 0, 32, 3, tone(T.coral, 3)); rect(p, 0, 20, 32, 4, tone(T.coral, 1)); rect(p, 0, 24, 32, 8, tone(['#6a4a3a', '#a08068', '#d8c0a0', '#f0e0c8'], 2));
    for (let y = 6; y < 18; y += 5) for (let x = (y % 2) * 3 + 2; x < 32; x += 6) { p.set(x, y, tone(T.coral, 4)); p.set(x + 1, y + 1, tone(T.coral, 1)); }
  });
  const sm = M('crab', () => psxMat(shell, { rough: 0.5 }));
  const cara = new THREE.IcosahedronGeometry(0.22, 1);
  cara.scale(1.25, 0.55, 0.95);
  const pa = cara.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) { if (pa.getY(i) < 0) pa.setY(i, pa.getY(i) * 0.5); if (pa.getX(i) > 0.15) pa.setY(i, pa.getY(i) - 0.02); }
  const body = mesh(facet(cara), sm);
  body.position.y = 0.22;
  root.add(body);
  const eyes: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.add(mesh(facet(xf(new THREE.CylinderGeometry(0.015, 0.02, 0.12, 4), [0, 0.06, 0])), sm, false));
    e.add(mesh(facet(xf(new THREE.OctahedronGeometry(0.035, 1), [0, 0.13, 0])), M('crabeye', () => psxMat(null, { color: '#0a0a10', rough: 0.1, metal: 0.4 })), false));
    e.add(mesh(xf(new THREE.OctahedronGeometry(0.012, 0), [0.015, 0.145, 0.02]), new THREE.MeshBasicMaterial({ color: '#ffffff' }), false));
    e.position.set(0.2, 0.3, s * 0.07);
    root.add(e); eyes.push(e);
  }
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const leg = new THREE.Group();
    leg.add(mesh(facet(xf(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 4), [0, -0.0, s * 0.1], [s * 1.2, 0, 0])), sm, false));
    leg.add(mesh(facet(xf(new THREE.CylinderGeometry(0.008, 0.016, 0.2, 4), [0, -0.12, s * 0.2], [s * 0.3, 0, 0])), sm, false));
    leg.position.set(0.08 - k * 0.12, 0.2, s * 0.16);
    root.add(leg); legs.push(leg);
  }
  const claws: { arm: THREE.Group; pin: THREE.Object3D }[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.add(mesh(facet(xf(new THREE.CylinderGeometry(0.025, 0.03, 0.18, 4), [0.08, 0, 0], [0, 0, Math.PI / 2])), sm, false));
    const hand = mesh(facet(xf(new THREE.IcosahedronGeometry(0.07, 0), [0.22, 0, 0], [0, 0, 0], [1.3, 0.8, 0.7])), sm);
    arm.add(hand);
    arm.add(mesh(facet(xf(new THREE.ConeGeometry(0.03, 0.14, 4), [0.33, 0.025, 0], [0, 0, -Math.PI / 2 - 0.2])), sm, false));
    const pin = new THREE.Group();
    pin.add(mesh(facet(xf(new THREE.ConeGeometry(0.025, 0.13, 4), [0.06, 0, 0], [0, 0, -Math.PI / 2 + 0.2])), sm, false));
    pin.position.set(0.27, -0.03, 0);
    arm.add(pin);
    arm.position.set(0.24, 0.2, s * 0.17);
    arm.rotation.set(0, -s * 0.5, 0.3);
    root.add(arm); claws.push({ arm, pin });
  }
  return { root, legs, claws, eyes };
}

// ------------------------------------------------------------------ piranha
export function piranhaMesh(): { root: THREE.Group; tail: THREE.Object3D; jaw: THREE.Object3D } {
  const root = new THREE.Group();
  // silver-grey back over a blood-red belly, a few dark spots on the flank in rows
  const skin = tex('piranha', 32, 16, (p) => {
    rect(p, 0, 0, 32, 3, tone(T.shark, 1)); rect(p, 0, 3, 32, 4, tone(T.steel, 3)); rect(p, 0, 7, 32, 3, tone(T.steel, 2)); rect(p, 0, 10, 32, 6, tone(T.red, 3)); rect(p, 0, 10, 32, 1, tone(T.red, 4));
    for (let x = 3; x < 30; x += 4) p.set(x, 5 + (x % 8 ? 0 : 1), tone(T.shark, 1));
  });
  const sm = M('piranha', () => psxMat(skin, { rough: 0.35, metal: 0.2 }));
  const L = new Loft();
  const us = usFor(6);
  const st = [[-0.17, 0.02, 0.012], [-0.1, 0.06, 0.03], [0.0, 0.1, 0.045], [0.08, 0.09, 0.042], [0.14, 0.06, 0.03], [0.18, 0.02, 0.012]];
  const rings = st.map(([x, h, wz], i) => ({ pts: us.map((u) => { const a = u * TAU; return [x, -Math.cos(a) * h * (Math.cos(a) < 0 ? 1.1 : 0.9), Math.sin(a) * wz] as V3; }), v: i / (st.length - 1) }));
  L.loft(rings, us, { x: 0, y: 0, w: 1, h: 1 }, -1, { start: [-0.19, 0.02, 0], end: [0.2, -0.0, 0] });
  const g = L.build();
  // remap uv: u around -> v (belly at bottom), along -> u
  const uv = g.attributes.uv as THREE.BufferAttribute, pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pa.getX(i) + 0.2) / 0.4, 0.5 + pa.getY(i) / 0.22);
  root.add(mesh(facet(g), sm));
  // fins
  const fin = M('pfin', () => psxMat(null, { color: '#5a6878', rough: 0.6, side: THREE.DoubleSide }));
  const tri = (a: V3, b: V3, c: V3) => { const t = new THREE.BufferGeometry(); t.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3)); t.computeVertexNormals(); return t; };
  const tail = new THREE.Group();
  tail.add(mesh(tri([0, 0, 0], [-0.12, 0.08, 0], [-0.12, -0.08, 0]), fin, false));
  tail.position.x = -0.17; root.add(tail);
  root.add(mesh(tri([-0.02, 0.09, 0], [0.06, 0.1, 0], [-0.08, 0.15, 0]), fin, false));
  root.add(mesh(tri([-0.02, -0.08, 0], [0.06, -0.09, 0], [-0.04, -0.14, 0]), M('pfinr', () => psxMat(null, { color: '#c02a1a', rough: 0.6, side: THREE.DoubleSide })), false));
  // underbite jaw with teeth + an angry eye
  const jaw = new THREE.Group();
  jaw.add(mesh(facet(xf(new THREE.BoxGeometry(0.08, 0.025, 0.06), [0.04, 0, 0])), sm, false));
  for (let k = 0; k < 4; k++) jaw.add(mesh(xf(new THREE.ConeGeometry(0.008, 0.025, 3), [0.015 + k * 0.018, 0.022, 0.025]), M('tooth', () => psxMat(null, { color: '#fff8e8', rough: 0.3 })), false));
  jaw.position.set(0.12, -0.04, 0);
  root.add(jaw);
  for (const s of [-1, 1]) {
    root.add(mesh(xf(new THREE.OctahedronGeometry(0.018, 0), [0.11, 0.025, s * 0.032]), M('peye', () => psxMat(null, { color: '#f0d020', emissive: '#806000', emissiveK: 0.4 })), false));
    root.add(mesh(xf(new THREE.OctahedronGeometry(0.009, 0), [0.122, 0.026, s * 0.04]), new THREE.MeshBasicMaterial({ color: '#000000' }), false));
  }
  return { root, tail, jaw };
}

// ------------------------------------------------------------------ octopus pal
export function octopusMesh(): { root: THREE.Group; arms: THREE.Object3D[][]; mantle: THREE.Mesh } {
  const root = new THREE.Group();
  // pink-purple skin, a paler top, deliberate darker spots, pale sucker rings on the lower half
  const skin = tex('octo', 32, 32, (p) => {
    const O = ['#2a0a2e', '#5a1a5a', '#9a3a8a', '#d06ab0', '#f8a8d8'];
    rect(p, 0, 0, 32, 32, tone(O, 3)); rect(p, 0, 0, 32, 8, tone(O, 4)); rect(p, 0, 24, 32, 8, tone(O, 2));
    for (const [x, y] of [[4, 10], [14, 13], [24, 9], [9, 18], [20, 19], [28, 16]]) { p.ellipse(x + 0.5, y + 0.5, 1.6, 1.3, tone(O, 1)); }
    for (let x = 2; x < 32; x += 5) { p.set(x, 27, tone(O, 4)); p.set(x + 1, 27, tone(O, 4)); p.set(x, 28, tone(O, 1)); }
  });
  const sm = M('octo', () => psxMat(skin, { rough: 0.4, sss: [1, 0.4, 0.6], sssK: 0.5 }));
  const mg = new THREE.IcosahedronGeometry(0.26, 1);
  mg.scale(0.9, 1.15, 0.9);
  mg.translate(0, 0.18, 0);
  const pa = mg.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pa.count * 2);
  for (let i = 0; i < pa.count; i++) { uv[i * 2] = 0.5 + Math.atan2(pa.getZ(i), pa.getX(i)) / TAU; uv[i * 2 + 1] = 0.5 + pa.getY(i); }
  mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mantle = mesh(facet(mg), sm);
  root.add(mantle);
  // big cute eyes with goat pupils
  for (const s of [-1, 1]) {
    root.add(mesh(xf(new THREE.IcosahedronGeometry(0.07, 1), [0.17, 0.07, s * 0.12], [0, 0, 0], [0.6, 1, 1]), M('oeye', () => psxMat(null, { color: '#fff4c8', rough: 0.2 })), false));
    root.add(mesh(xf(new THREE.BoxGeometry(0.02, 0.025, 0.07), [0.212, 0.07, s * 0.128]), new THREE.MeshBasicMaterial({ color: '#100810' }), false));
    root.add(mesh(xf(new THREE.OctahedronGeometry(0.012, 0), [0.22, 0.09, s * 0.11]), new THREE.MeshBasicMaterial({ color: '#ffffff' }), false));
  }
  const arms: THREE.Object3D[][] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.2;
    let parent: THREE.Object3D = root;
    const segs: THREE.Object3D[] = [];
    for (let j = 0; j < 5; j++) {
      const seg = new THREE.Group();
      const r0 = 0.055 * (1 - j / 5.5), r1 = 0.055 * (1 - (j + 1) / 5.5);
      seg.add(mesh(facet(xf(new THREE.CylinderGeometry(r1, r0, 0.13, 5), [0, -0.065, 0])), sm, j < 2));
      if (j === 0) { seg.position.set(Math.cos(a) * 0.15, -0.04, Math.sin(a) * 0.15); seg.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
      else seg.position.y = -0.13;
      parent.add(seg); parent = seg; segs.push(seg);
    }
    arms.push(segs);
  }
  return { root, arms, mantle };
}

// ------------------------------------------------------------------ frost nova star: crystal spikes radiating from a point
export function iceStarMesh(n = 10): THREE.Group {
  const g = new THREE.Group();
  const m = M('shard', () => psxMat(glow('ice', ['#1a4a7a', '#4aa0d8', '#a8e8ff', '#e8ffff', '#ffffff']), { emissive: '#4ab8f0', emissiveK: 0.8, rough: 0.05, metal: 0.3 }));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + hash2(k, 1, 7) * 0.3, len = 0.9 + hash2(k, 2, 7) * 0.8;
    const c = new THREE.ConeGeometry(0.16 + hash2(k, 3, 7) * 0.08, len, 4);
    c.translate(0, len / 2, 0);
    const sp = mesh(facet(c), m, false);
    sp.rotation.set(0, 0, a - Math.PI / 2);
    sp.rotateX((hash2(k, 4, 7) - 0.5) * 1.2);
    g.add(sp);
  }
  g.add(mesh(facet(new THREE.IcosahedronGeometry(0.3, 0)), m, false));
  return g;
}
/** the warrior's clam shield (held in front during Clam Bash) */
export function clamShieldMesh(): THREE.Group {
  const g = new THREE.Group();
  const t = tex('clam', 32, 32, (p) => { const C = ['#2a2a3a', '#5a5a78', '#9a9ab8', '#d0d0e8', '#ffffff']; for (let x = 0; x < 32; x++) rect(p, x, 0, 1, 32, tone(C, x % 5 === 0 ? 1 : x % 5 === 1 ? 4 : 3)); for (let y = 6; y < 32; y += 8) rect(p, 0, y, 32, 1, tone(C, 2)); });
  const geo = new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI, 0, Math.PI * 0.5);
  geo.rotateZ(-Math.PI / 2); geo.scale(0.45, 1, 1);
  g.add(mesh(facet(geo), M('clam', () => psxMat(t, { rough: 0.35, metal: 0.2, side: THREE.DoubleSide }))));
  return g;
}
