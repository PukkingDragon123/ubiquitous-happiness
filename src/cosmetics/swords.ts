// Sword skins: alternative looks for the toothpick (the model's +x from the hand, ~0.84 m like the original, so
// the swing trail and the tip stay where combat expects them). Bamboo shoot, lacquer chopstick, golden pick and
// a glowing jellyfish sting ('glow' meshes pulse with BlobModel's weapon glow).
import * as THREE from 'three';
import type { V3 } from '../gfx/loft';
import { ctex, T, tone, rect, cylinder, gemFacets } from '../skills/texkit';
import { TAU } from '../core/math';
import { psxMat, mesh, facet, xf } from '../player/psx';
import { tubeGeo } from './hats';

const line = (n: number, x0: number, x1: number): V3[] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, 0, 0] as V3);

const BAMBOO = () => ctex('bambooShaft', 16, 64, (p) => {
  const G = ['#14300e', '#24521a', '#3a7a28', '#5aa23a', '#94d064'];
  cylinder(p, 0, 0, 16, 64, G);
  // nodes: a dark groove with a pale swollen ring
  for (let y = 0; y < 64; y += 16) { rect(p, 0, y, 16, 1, tone(G, 0)); rect(p, 0, y + 1, 16, 2, '#b8c870'); rect(p, 0, y + 3, 16, 1, tone(G, 1)); }
  for (let y = 5; y < 64; y += 16) for (let x = 3; x < 14; x += 5) p.set(x, y + 6, tone(G, 3));
});
const LEAF = () => ctex('bambooLeaf', 8, 16, (p) => { for (let y = 0; y < 16; y++) { const w = Math.round(Math.sin((y / 15) * Math.PI) * 3.5); for (let x = 4 - w; x < 4 + w; x++) p.set(x, y, x < 4 ? '#4a9a34' : '#6abc48'); } });
const LACQUER = () => ctex('chopLacquer', 16, 64, (p) => {
  for (let x = 0; x < 16; x++) rect(p, x, 0, 1, 64, tone(T.red, x % 4 === 0 ? 4 : x % 4 === 3 ? 1 : 2));
  // the thick end (row 63 = the grip end): black with a gold band and a little wave pattern
  rect(p, 0, 42, 16, 22, '#0c0a10'); rect(p, 0, 42, 16, 2, tone(T.gold, 3)); rect(p, 0, 43, 16, 1, tone(T.gold, 1));
  for (let x = 0; x < 16; x++) p.set(x, 50 + Math.round(Math.sin(x * 0.8) * 2), tone(T.gold, 4));
  for (let x = 0; x < 16; x += 4) { p.set(x, 56, tone(T.gold, 3)); p.set(x + 1, 57, tone(T.gold, 3)); }
  rect(p, 0, 61, 16, 2, tone(T.gold, 3));
});
const GOLDW = () => ctex('goldPick', 16, 64, (p) => { cylinder(p, 0, 0, 16, 64, T.gold); for (let y = 6; y < 64; y += 9) { rect(p, 0, y, 16, 1, tone(T.gold, 4)); } });
const RUBY = () => ctex('ruby', 16, 16, (p) => gemFacets(p, 0, 0, 16, 16, ['#3a0410', '#8a0a20', '#d81c3a', '#ff6a7a', '#ffd0d8']));
const STING = () => ctex('jellySting', 16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) { const k = x % 8; p.set(x, y, ['#2a6ab0', '#5ab8f0', '#9ae8ff', '#e0ffff'][k < 1 ? 0 : k < 3 ? 3 : k < 6 ? 2 : 1]); } for (let y = 3; y < 32; y += 5) rect(p, 0, y, 16, 1, '#ffffff'); });
const TENTACLE = () => ctex('stingGrip', 16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x + y * 2) % 6 < 3 ? '#f0a0d8' : '#a04a98'); });

const cache = new Map<string, THREE.Group>();
/** a fresh copy of a sword skin's model (null for the stock toothpick) */
export function swordSkin(id: string): THREE.Group | null {
  const hit = cache.get(id);
  if (hit) return hit.clone();
  const g = new THREE.Group(); g.name = 'weapon:' + id;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, name?: string) => { const me = mesh(geo, m); if (name) me.name = name; g.add(me); return me; };
  switch (id) {
    case 'bamboo': {
      add(tubeGeo(line(8, -0.1, 0.72), (t) => 0.024 - t * 0.004, 6), psxMat(BAMBOO(), { rough: 0.55 }));
      // the cut point: a slanted cone
      add(facet(xf(new THREE.ConeGeometry(0.021, 0.14, 6), [0.79, 0, 0], [0, 0, -Math.PI / 2], [1, 1, 0.75])), psxMat(ctex('bambooCut', 8, 8, (p) => { p.rect(0, 0, 8, 8, '#d8d890'); p.rect(0, 0, 8, 2, '#8ab84a'); }), { rough: 0.6 }));
      // a leaf sprouting at the pommel
      const leaf = new THREE.PlaneGeometry(0.05, 0.16); leaf.translate(0, 0.08, 0);
      add(xf(leaf, [-0.08, 0.02, 0], [0.3, 0, 1.9]), psxMat(LEAF(), { rough: 0.7, alphaTest: 0.5, side: THREE.DoubleSide }));
      break;
    }
    case 'chopstick': {
      // square section, tapering from the grip end to a blunt point
      const geo = tubeGeo(line(6, -0.12, 0.84), (t) => 0.026 * (1 - t * 0.55), 4);
      geo.rotateX(Math.PI / 4);
      add(geo, psxMat(LACQUER(), { rough: 0.35, metal: 0.1 }));
      break;
    }
    case 'goldPick': {
      add(facet(tubeGeo(line(6, 0, 0.84), (t) => (t < 0.08 ? 0.017 + t * 0.12 : 0.028 * Math.pow(1 - (t - 0.08) / 0.92, 0.75) + 0.002), 6)), psxMat(GOLDW(), { metal: 0.9, rough: 0.28 }));
      add(facet(xf(new THREE.OctahedronGeometry(0.045, 0), [-0.04, 0, 0], [0, 0, 0], [1.3, 1, 1])), psxMat(RUBY(), { emissive: '#ff2040', emissiveK: 0.6, rough: 0.15 }), 'glow');
      for (let i = 0; i < 6; i++) {
        const piv = new THREE.Group(); piv.position.x = 0.02; piv.rotation.set((i / 6) * TAU, 0, 0);
        const s = mesh(xf(new THREE.BoxGeometry(0.006, 0.07, 0.016), [0, 0.035, 0]), psxMat(null, { color: i % 2 ? '#ffe060' : '#fff6c0', metal: 0.7, rough: 0.25, emissive: '#ffc020', emissiveK: 0.2 }), false);
        s.rotation.z = 0.55; piv.add(s); g.add(piv);
      }
      break;
    }
    case 'sting': {
      // a translucent barbed blade (4-sided, tapering) with a coiled tentacle grip
      const L: V3[] = line(7, 0.08, 0.86);
      const blade = tubeGeo(L, (t) => 0.034 * Math.pow(1 - t, 0.9) + 0.003, 4);
      blade.scale(1, 1, 0.45);
      const bm = psxMat(STING(), { rough: 0.2, emissive: '#5ad8ff', emissiveK: 1.3 });
      bm.transparent = true; bm.opacity = 0.85;
      add(blade, bm, 'glow');
      for (let k = 0; k < 4; k++) add(facet(xf(new THREE.TetrahedronGeometry(0.02, 0), [0.25 + k * 0.15, (k % 2 ? 1 : -1) * 0.028, 0])), bm, 'glow');
      add(tubeGeo([[-0.12, 0, 0], [-0.04, 0.012, 0.008], [0.04, -0.008, 0], [0.1, 0, 0]], () => 0.022, 6), psxMat(TENTACLE(), { rough: 0.5, sss: [1, 0.6, 0.9], sssK: 0.5 }));
      for (const s of [-1, 1]) add(tubeGeo([[-0.11, 0, 0], [-0.17, s * 0.03, 0.02], [-0.23, s * 0.01, 0.04], [-0.28, s * 0.04, 0.03]], (t) => 0.008 * (1 - t * 0.7), 4), psxMat(TENTACLE(), { rough: 0.5 }));
      break;
    }
    default: return null;
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  cache.set(id, g);
  return g.clone();
}
