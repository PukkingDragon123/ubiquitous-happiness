// Low-poly PS1 models for skill props: projectiles (mana bolt, ice shard, magma orb, nail, harpoon, ink bomb,
// venom vial, net ball), summons (pet crab, piranha, octopus pal) and gadgets (junk turret, harpoon ballista,
// sea mine, net trap). A few dozen faceted polys each, every one with a small painted pixel page.
import * as THREE from 'three';
import { Loft, usFor, type V3 } from '../gfx/loft';
import { Px, ramp, hex, mix, pxNoise, worley } from '../gfx/px';
import { hash2, TAU } from '../core/math';
import { psxMat, mesh, facet, xf, uvTo } from '../player/psx';

const cache = new Map<string, THREE.Texture>();
const tex = (key: string, w: number, h: number, fn: (p: Px) => void) => {
  let t = cache.get(key);
  if (!t) { const p = new Px(w, h); fn(p); t = p.texture(); cache.set(key, t); }
  return t;
};
const R = (cs: string[], n = 5, d = 0.6) => ramp(cs, n, d);
const matCache = new Map<string, THREE.Material>();
const M = (key: string, make: () => THREE.Material) => { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m); } return m; };

const RUST = () => tex('rust', 32, 32, (p) => { const r = R(['#1a0c08', '#3e1c10', '#6a3418', '#9a5a2a', '#c8884a'], 5); p.fill((x, y) => r(0.45 + (pxNoise(x, y, 5, 3, 2) - 0.5) * 0.7 + (hash2(x, y, 4) > 0.9 ? -0.2 : 0), x, y)); });
const DARKMETAL = () => tex('dmetal', 32, 32, (p) => { const r = R(['#0c0e14', '#1e2230', '#343a4e', '#56607a', '#8a96b0'], 5, 0.4); p.fill((x, y) => { const rust = pxNoise(x, y, 6, 3, 9) > 0.62; return rust ? R(['#3a1a0c', '#6a3418', '#a05a28'], 3)(hash2(x, y, 2), x, y) : r(0.5 + (y < 6 ? 0.2 : 0) + (pxNoise(x, y, 3, 2, 5) - 0.5) * 0.3, x, y); }); });
const WOOD = () => tex('swood', 32, 32, (p) => { const r = R(['#2a1a0e', '#55361c', '#86592e', '#b48450', '#dcb47e'], 5); p.fill((x, y) => r(0.5 + (pxNoise(x * 0.3, y * 3, 4, 2, 7) - 0.5) * 0.7 + (y % 8 === 0 ? -0.25 : 0), x, y)); });
const glow = (key: string, cs: string[]) => tex(key, 16, 16, (p) => { const r = R(cs, 5, 0.3); p.fill((x, y) => r(0.45 + (1 - Math.hypot(x - 5, y - 5) / 12) * 0.6, x, y)); });

// ------------------------------------------------------------------ projectiles
export function boltMesh(color = '#9a7aff'): THREE.Object3D {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  g.add(mesh(facet(xf(new THREE.OctahedronGeometry(0.09, 0), [0, 0, 0], [0, 0, 0], [2.2, 0.9, 0.9])), M('bolt' + color, () => psxMat(glow('bolt' + color, ['#1a0a4a', '#' + c.clone().multiplyScalar(0.5).getHexString(), color, '#e8e0ff', '#ffffff']), { emissive: color, emissiveK: 2.2, rough: 0.1 })), false));
  return g;
}
export function shardMesh(): THREE.Object3D {
  return mesh(facet(xf(new THREE.OctahedronGeometry(0.1, 0), [0, 0, 0], [0, 0, 0], [2.6, 0.7, 0.7])), M('shard', () => psxMat(glow('ice', ['#1a4a7a', '#4aa0d8', '#a8e8ff', '#e8ffff', '#ffffff']), { emissive: '#4ab8f0', emissiveK: 0.8, rough: 0.05, metal: 0.3 })), false);
}
export function magmaMesh(): THREE.Object3D {
  const t = tex('magma', 32, 32, (p) => { const r = R(['#1a0402', '#5a0c04', '#c03008', '#ff8a10', '#ffe060', '#fffbd0'], 6, 0.4); p.fill((x, y) => { const [f1, f2] = worley(x, y, 8, 3, 32); const crack = f2 - f1 < 2; return crack ? r(0.85 + hash2(x, y, 1) * 0.15, x, y) : r(0.15 + pxNoise(x, y, 4, 2, 3) * 0.25, x, y); }); });
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
  const t = tex('inkbomb', 16, 16, (p) => { const r = R(['#06040c', '#14102a', '#2a2050', '#4a3a80'], 4); p.fill((x, y) => r(0.4 + (x + y < 10 ? 0.4 : 0) - (x + y > 24 ? 0.2 : 0), x, y)); p.rect(6, 6, 4, 4, '#e8e0ff'); p.set(7, 7, '#1a1030'); p.set(8, 8, '#1a1030'); });
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
  g.add(mesh(new THREE.IcosahedronGeometry(0.18, 1), M('netball', () => psxMat(NET(), { alphaTest: 0.5, side: THREE.DoubleSide, flat: false }))));
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
  g.add(mesh(geo, M('nettrap', () => psxMat(NET(), { alphaTest: 0.5, side: THREE.DoubleSide, flat: false }))));
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
  const can = tex('can', 32, 16, (p) => { const r = R(['#4a0a0a', '#8a1a14', '#c83a1c', '#f07a3a'], 4); p.fill((x, y) => (y < 2 || y > 13 ? hex(y === 0 || y === 15 ? '#4a4a52' : '#b8b8c8') : y > 5 && y < 10 ? (x % 5 === 0 ? hex('#2a2a30') : hex('#f0e8d0')) : r(0.6 + (x < 6 ? 0.2 : 0) - (pxNoise(x, y, 3, 2, 3) > 0.7 ? 0.3 : 0), x, y))); });
  const canM = M('can', () => psxMat(can, { metal: 0.4, rough: 0.45 }));
  head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 8), [0, 0, 0], [0, 0, Math.PI / 2])), canM));
  const pipe = M('pipe', () => psxMat(DARKMETAL(), { metal: 0.8, rough: 0.4 }));
  head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), [0.32, 0.02, 0], [0, 0, Math.PI / 2])), pipe));
  head.add(mesh(facet(xf(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 6), [0.52, 0.02, 0], [0, 0, Math.PI / 2])), pipe));
  head.add(mesh(facet(xf(new THREE.BoxGeometry(0.16, 0.12, 0.12), [-0.18, 0.1, 0])), M('battery', () => psxMat(tex('bat', 16, 16, (p) => { p.fill((x, y) => (y < 4 ? hex(x < 8 ? '#d02020' : '#202020') : mix(hex('#1a1a20'), hex('#3a3a48'), x / 16))); p.rect(3, 8, 10, 3, '#e8c020'); }), { rough: 0.5 }))));
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
  const shell = tex('crab', 32, 32, (p) => {
    const r = R(['#3a0804', '#7a1a0a', '#c03a14', '#ee6a2a', '#ffa860', '#ffe0b0'], 6);
    p.fill((x, y) => { const [f1] = worley(x, y, 7, 4, 32); return r(0.55 - f1 / 22 + (pxNoise(x, y, 3, 2, 8) - 0.5) * 0.3 + (y > 24 ? -0.3 : 0) + (hash2(x, y, 2) > 0.93 ? 0.3 : 0), x, y); });
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
  const skin = tex('piranha', 32, 16, (p) => {
    const back = R(['#1a2028', '#3a4858', '#6a7a8a', '#a8b8c4', '#e0e8f0'], 5), belly = R(['#4a0808', '#8a1414', '#d02a1a', '#ff6a3a', '#ffb080'], 5);
    p.fill((x, y) => { const v = y / 15; const spk = hash2(x, y, 7) > 0.88 ? -0.25 : 0; return v > 0.62 ? belly(0.55 + (pxNoise(x, y, 3, 2, 4) - 0.5) * 0.3, x, y) : back(0.75 - v * 0.6 + spk, x, y); });
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
  const skin = tex('octo', 32, 32, (p) => {
    const r = R(['#2a0a2e', '#5a1a5a', '#9a3a8a', '#d06ab0', '#f8a8d8', '#fff0f8'], 6);
    p.fill((x, y) => { const [f1, , id] = worley(x, y, 6, 2, 32); const spot = f1 < 1.6 && id > 0.4; return r(0.55 + (pxNoise(x, y, 5, 3, 1) - 0.5) * 0.3 - (spot ? 0.3 : 0) + (y < 10 ? 0.12 : 0), x, y); });
  });
  const sm = M('octo', () => psxMat(skin, { rough: 0.4, flat: false, sss: [1, 0.4, 0.6], sssK: 0.5 }));
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
