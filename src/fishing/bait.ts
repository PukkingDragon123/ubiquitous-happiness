// Bait + terminal tackle: lofted, pixel-textured baits (wriggling worm, shrimp, squid strip, minnow, flashing
// spoon lure, golden worm) on a real J hook with a barb, a lead split-shot sinker, and an optional bobber that
// floats on the live water surface and dips when something nibbles.
import * as THREE from 'three';
import { Loft, V3, FULL } from '../gfx/loft';
import { Px, ramp, hex, mix, pxNoise } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { hash2, clamp01, TAU } from '../core/math';

export type BaitKind = 'worm' | 'shrimp' | 'squid' | 'minnow' | 'spoon' | 'goldWorm' | 'cheese';
export interface BaitDef { kind: BaitKind; name: string; heal: number; coins: number; rarity: number; lure?: boolean }
export const BAITS: Record<BaitKind, BaitDef> = {
  worm: { kind: 'worm', name: 'Juicy Worm', heal: 1, coins: 2, rarity: 1 },
  shrimp: { kind: 'shrimp', name: 'Pink Shrimp', heal: 1, coins: 4, rarity: 0.7 },
  squid: { kind: 'squid', name: 'Squid Strip', heal: 2, coins: 3, rarity: 0.5 },
  minnow: { kind: 'minnow', name: 'Live Minnow', heal: 2, coins: 5, rarity: 0.45 },
  spoon: { kind: 'spoon', name: 'Spoon Lure', heal: 0, coins: 9, rarity: 0.35, lure: true },
  cheese: { kind: 'cheese', name: 'Stinky Cheese', heal: 1, coins: 3, rarity: 0.3 },
  goldWorm: { kind: 'goldWorm', name: 'Golden Worm', heal: 3, coins: 20, rarity: 0.06 },
};

const texCache = new Map<string, THREE.Texture>();
function tex(key: string, w: number, h: number, paint: (p: Px) => void) {
  let t = texCache.get(key);
  if (!t) { const p = new Px(w, h); paint(p); t = p.texture(); texCache.set(key, t); }
  return t;
}

function wiggleMat(map: THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}, amp = 0.05) {
  const m = uw(new THREE.MeshStandardMaterial({ map, roughness: 0.45, ...o }), { sss: [1, 0.5, 0.5], sssK: 0.4, rim: 0.2 });
  const u = { uWig: { value: 0 }, uAmp: { value: amp } };
  m.userData.wig = u;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWig; uniform float uAmp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += sin(uWig + position.x * 28.0) * uAmp * smoothstep(0.0, 0.08, abs(position.x)); transformed.z += cos(uWig * 0.7 + position.x * 20.0) * uAmp * 0.5;');
  };
  return m;
}

function wormTex(gold: boolean) {
  return tex(gold ? 'goldworm' : 'worm', 64, 16, (p) => {
    const r = gold ? ramp(['#6a4a08', '#c8960e', '#ffd84a', '#fff6c0'], 5) : ramp(['#5a1e2a', '#a2475a', '#d97a86', '#f5b5b8'], 5);
    p.fill((x, y) => {
      const seg = (x % 4 === 0 ? -0.18 : 0) + (y === 0 || y === 15 ? -0.15 : 0) + (y > 6 && y < 10 ? 0.12 : 0);
      const band = x > 40 && x < 48 ? (gold ? 0.15 : -0.12) : 0;
      return r(0.55 + seg + band + (pxNoise(x, y, 4, 2, 7) - 0.5) * 0.25, x, y);
    });
    if (gold) for (let i = 0; i < 12; i++) p.set((i * 17) % 64, (i * 7) % 16, '#ffffff');
  });
}

/** a J hook with a barb and an eye, in local space hanging from (0, 0) */
let hookGeo: THREE.BufferGeometry | null = null;
function hookGeometry() {
  if (hookGeo) return hookGeo;
  const L = new Loft();
  const path: V3[] = [];
  // shank down, bend, point up
  for (let i = 0; i <= 10; i++) path.push([0, -i * 0.012, 0]);
  for (let i = 1; i <= 12; i++) { const a = Math.PI * (i / 12); path.push([0.03 - Math.cos(a) * 0.03, -0.12 - Math.sin(a) * 0.03, 0]); }
  for (let i = 1; i <= 4; i++) path.push([0.06, -0.12 + i * 0.012, 0]);
  L.tube(path, (t) => 0.0045 * (t > 0.9 ? (1 - t) * 10 : 1) + 0.0008, 6, FULL, 0, { capStart: true, capEnd: true });
  // barb
  L.tube([[0.06, -0.08, 0], [0.05, -0.095, 0]], () => 0.003, 4, FULL, 1, { capEnd: true });
  // eye
  const eye: V3[] = []; for (let i = 0; i <= 12; i++) { const a = (i / 12) * TAU; eye.push([Math.sin(a) * 0.009, 0.009 + Math.cos(a) * 0.009, 0]); }
  L.tube(eye, () => 0.0028, 5, FULL, 2);
  hookGeo = L.build();
  return hookGeo;
}
/** a bare hook (used when the blobfish is hooked: it sits in the lip) */
export function buildHook(): THREE.Mesh { const m = new THREE.Mesh(hookGeometry(), metal()); m.scale.setScalar(1.8); return m; }
const metal = () => uw(new THREE.MeshStandardMaterial({ color: '#c9d2da', metalness: 0.9, roughness: 0.25 }), { rim: 0.4 });

export function buildBait(kind: BaitKind): { group: THREE.Group; tick: (t: number, speed: number) => void } {
  const g = new THREE.Group();
  let tick: (t: number, s: number) => void = () => {};
  const hook = new THREE.Mesh(hookGeometry(), metal());
  hook.scale.setScalar(1.4);
  hook.castShadow = true;
  g.add(hook);
  if (kind === 'worm' || kind === 'goldWorm') {
    const L = new Loft();
    const path: V3[] = []; for (let i = 0; i <= 20; i++) path.push([-0.11 + i * 0.011, 0, 0]);
    L.tube(path, (t) => 0.014 * Math.sin(Math.PI * clamp01(t * 1.05)) + 0.004, 8, FULL, 0, { capStart: true, capEnd: true });
    const m = wiggleMat(wormTex(kind === 'goldWorm'), kind === 'goldWorm' ? { emissive: '#ffb020', emissiveIntensity: 0.6, metalness: 0.4 } : {}, 0.03);
    const worm = new THREE.Mesh(L.build(), m);
    worm.position.set(0.04, -0.14, 0); worm.rotation.z = 0.5;
    worm.castShadow = true;
    g.add(worm);
    tick = (t, s) => { (m.userData.wig as { uWig: { value: number } }).uWig.value = t * (6 + s * 4); worm.rotation.z = 0.5 + Math.sin(t * 2.3) * 0.25; };
  } else if (kind === 'shrimp') {
    const L = new Loft();
    const path: V3[] = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 0.9; path.push([Math.cos(a) * 0.07, Math.sin(a) * 0.07 - 0.06, 0]); }
    L.tube(path, (t) => 0.022 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 0.005, 10, FULL, 0, { capStart: true, capEnd: true });
    const st = tex('shrimp', 32, 16, (p) => { const r = ramp(['#8a3a2a', '#e0705a', '#ffa890', '#ffe0d0'], 5); p.fill((x, y) => r(0.6 + (x % 5 === 0 ? -0.25 : 0) + (y < 4 ? 0.15 : 0) + (hash2(x, y, 2) - 0.5) * 0.2, x, y)); });
    const m = wiggleMat(st, { roughness: 0.35 }, 0.008);
    const body = new THREE.Mesh(L.build(), m);
    body.position.set(0.03, -0.12, 0);
    body.castShadow = true;
    g.add(body);
    for (const s of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.12, 3), new THREE.MeshBasicMaterial({ color: '#d06050' }));
      ant.position.set(0.09, -0.1 + s * 0.01, s * 0.01); ant.rotation.z = -0.9 + s * 0.2;
      g.add(ant);
    }
    tick = (t) => { (m.userData.wig as { uWig: { value: number } }).uWig.value = t * 9; body.rotation.z = Math.sin(t * 5) * 0.08; };
  } else if (kind === 'squid') {
    const st = tex('squid', 32, 16, (p) => { const r = ramp(['#9a8890', '#e8dce0', '#fff6f8'], 4); p.fill((x, y) => r(0.6 + (hash2(x, y, 5) > 0.9 ? -0.4 : 0) + (pxNoise(x, y, 5, 2, 3) - 0.5) * 0.3, x, y)); for (let i = 0; i < 10; i++) p.set((i * 7) % 32, (i * 5) % 16, '#8a3a6a'); });
    const geo = new THREE.PlaneGeometry(0.2, 0.05, 12, 1);
    const m = wiggleMat(st, { side: THREE.DoubleSide, roughness: 0.3 }, 0.02);
    const strip = new THREE.Mesh(geo, m);
    strip.position.set(0.0, -0.17, 0); strip.rotation.z = 1.1;
    g.add(strip);
    tick = (t) => { (m.userData.wig as { uWig: { value: number } }).uWig.value = t * 7; };
  } else if (kind === 'minnow') {
    const L = new Loft();
    const rings = [];
    const us = Array.from({ length: 11 }, (_, i) => i / 10);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, x = -0.08 + t * 0.16, rr = Math.sin(Math.PI * clamp01(t * 1.1)) * 0.022 + 0.003;
      rings.push({ pts: us.map((u) => [x, Math.cos(u * TAU) * rr * 1.2, Math.sin(u * TAU) * rr * 0.6] as V3), v: t });
    }
    L.loft(rings, us, FULL, 0, { start: [-0.085, 0, 0], end: [0.085, 0, 0] });
    const st = tex('minnow', 32, 16, (p) => { const r = ramp(['#2a3a4a', '#6a8aa0', '#c8dce8', '#ffffff'], 5); p.fill((x, y) => r(y / 16 * 0.8 + 0.15 + (y === 7 ? 0.2 : 0) + (hash2(x, y, 3) - 0.5) * 0.1, x, y)); p.set(29, 6, '#000000'); });
    const m = wiggleMat(st, { metalness: 0.5, roughness: 0.3 }, 0.01);
    const fish = new THREE.Mesh(L.build(), m);
    fish.position.set(0.02, -0.13, 0); fish.rotation.z = -1.3;
    fish.castShadow = true;
    g.add(fish);
    tick = (t) => { (m.userData.wig as { uWig: { value: number } }).uWig.value = t * 14; };
  } else if (kind === 'spoon') {
    const geo = new THREE.SphereGeometry(0.05, 16, 8);
    geo.scale(0.55, 1, 0.2);
    const st = tex('spoon', 16, 32, (p) => { const r = ramp(['#8a6a10', '#e0b030', '#fff0a0'], 4); p.fill((x, y) => (y > 12 && y < 18 ? hex('#d02030') : r(0.5 + (pxNoise(x, y, 4, 2, 2) - 0.5) * 0.5 + (x < 4 ? 0.3 : 0), x, y))); });
    const spoon = new THREE.Mesh(geo, uw(new THREE.MeshStandardMaterial({ map: st, metalness: 0.95, roughness: 0.15, emissive: '#402800', emissiveIntensity: 0.4 }), { rim: 0.6 }));
    spoon.position.set(0.0, -0.06, 0);
    spoon.castShadow = true;
    g.add(spoon);
    hook.position.y = -0.1;
    tick = (t, s) => { spoon.rotation.y = t * (6 + s * 10); };
  } else if (kind === 'cheese') {
    const st = tex('cheese', 16, 16, (p) => { const r = ramp(['#a07a10', '#f0c030', '#ffe890'], 4); p.fill((x, y) => r(0.65 + (hash2(x, y, 1) - 0.5) * 0.3, x, y)); p.circle(5, 6, 2, '#c09018'); p.circle(11, 11, 1.6, '#c09018'); });
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.045, 3, 1);
    const ch = new THREE.Mesh(geo, uw(new THREE.MeshStandardMaterial({ map: st, roughness: 0.7 })));
    ch.position.set(0.03, -0.13, 0); ch.rotation.x = Math.PI / 2;
    g.add(ch);
    tick = (t) => { ch.rotation.z = t * 0.6; };
  }
  return { group: g, tick };
}

/** lead split shot */
export function buildSinker(): THREE.Mesh {
  const st = tex('lead', 8, 8, (p) => { const r = ramp(['#3a3e44', '#6a7078', '#9aa2aa'], 3); p.fill((x, y) => r(0.5 + (hash2(x, y, 9) - 0.5) * 0.5, x, y)); });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), uw(new THREE.MeshStandardMaterial({ map: st, metalness: 0.6, roughness: 0.5 })));
  m.castShadow = true;
  return m;
}

/** red-and-white bobber with a stick antenna */
export function buildBobber(): THREE.Group {
  const g = new THREE.Group();
  const st = tex('bobber', 16, 32, (p) => p.fill((x, y) => {
    const top = y < 16;
    const base = top ? hex('#e8243a') : hex('#f4f2ea');
    const shade = 0.75 + (x / 16) * 0.4;
    return mix([0, 0, 0], base, shade) as [number, number, number];
  }));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 14), uw(new THREE.MeshPhysicalMaterial({ map: st, roughness: 0.3, clearcoat: 1 })));
  ball.castShadow = true;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#f4f2ea' }));
  stick.position.y = 0.1;
  g.add(ball, stick);
  return g;
}
