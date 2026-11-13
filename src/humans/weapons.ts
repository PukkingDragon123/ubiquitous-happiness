// Hand-held diver weapons and tools (PS1 low-poly, small painted textures). Each is built along +z (the
// muzzle / blade points +z), the right-hand grip at the origin, with named points for the IK hands:
//   speargun     pneumatic gun: black barrel, a pistol grip, a loaded steel shaft with a flopper tip
//   bandgun      a teak band gun for free divers: rubber bands stretched over the stock, a long shaft
//   polespear    a 2 m pole with a three-prong paralyser head and a rubber sling loop
//   knife        a dive knife: serrated steel blade, a yellow rubber handle
//   net          a bundled throw net with lead weights and floats
//   flaregun     an orange flare pistol
//   cannon       the heavy diver's harpoon cannon: an iron tube with a brass breech and a shoulder stock
//   medkit       a first-aid pouch with a red cross
import * as THREE from 'three';
import type { V3 } from '../gfx/loft';
import { Loft, FULL } from '../gfx/loft';
import { mix } from '../gfx/px';
import type { RGB } from '../gfx/px';
import { band, hh, nz, metal } from './fabric';
import { kitMat, rubberMat, steelMat, brassMat } from './diveGear';

export type WeaponKind = 'speargun' | 'bandgun' | 'polespear' | 'knife' | 'net' | 'flaregun' | 'cannon' | 'medkit' | 'none';

export interface Weapon {
  kind: WeaponKind;
  obj: THREE.Group;
  /** right-hand grip (origin) and left-hand fore grip, local */
  fore: THREE.Vector3 | null;
  /** muzzle / blade tip, local */
  muzzle: THREE.Object3D;
  /** the loaded shaft / spear head (hidden while reloading) */
  ammo: THREE.Object3D | null;
  /** length (m) from grip to muzzle */
  len: number;
  setLoaded(b: boolean): void;
}

const woodMat = () => kitMat('teak', 32, 16, (x, y) => band(mix([120, 70, 38], [80, 44, 22], nz(x * 0.3, y * 2, 6, 51)), 0.9 + ((y + (x >> 3)) % 3 === 0 ? -0.1 : 0.05) + (hh(x, y, 52) - 0.5) * 0.08, x, y), { rough: 0.6 });
const plasticMat = (c: RGB) => kitMat('pls' + c.join(','), 16, 16, (x, y) => band(c, 0.92 + y / 80 + (hh(x, y, 53) - 0.5) * 0.06, x, y), { rough: 0.5 });
const netMat = () => kitMat('netmesh', 32, 32, (x, y) => {
  const a = (x + y) % 6, b = (x - y + 60) % 6;
  return a === 0 || b === 0 ? band([200, 190, 150], 0.9 + (hh(x, y, 54) - 0.5) * 0.2, x, y) : band([90, 84, 64], 0.55 + nz(x, y, 5, 55) * 0.2, x, y);
}, { rough: 0.9 });

function mesh(B: Loft, m: THREE.Material) { const o = new THREE.Mesh(B.build(), m); o.castShadow = true; return o; }

export function makeWeapon(kind: WeaponKind, scale = 1): Weapon {
  const obj = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let fore: THREE.Vector3 | null = null;
  let ammo: THREE.Object3D | null = null;
  let len = 0.3;
  const s = scale;
  const add = (o: THREE.Object3D) => { obj.add(o); return o; };
  switch (kind) {
    case 'speargun': case 'bandgun': case 'cannon': {
      const band_ = kind === 'bandgun', can = kind === 'cannon';
      const L0 = (can ? 1.0 : band_ ? 1.15 : 0.85) * s, r = (can ? 0.06 : band_ ? 0.025 : 0.024) * s;
      const B = new Loft(false);
      // barrel / stock from just behind the grip to the muzzle (6 sides)
      B.tube([[0, 0.03 * s, -0.12 * s], [0, 0.03 * s, L0]], (t) => r * (can ? (t < 0.2 ? 1.25 : 1) : 1), 6, FULL, 1, { capStart: true, capEnd: true });
      add(mesh(B, band_ ? woodMat() : can ? steelMat([70, 72, 76], 0.6) : rubberMat([30, 31, 34])));
      // pistol grip + trigger guard
      const G = new Loft(false);
      G.box([0, -0.05 * s, 0.0], [0.03 * s, 0.13 * s, 0.045 * s], FULL, undefined, new THREE.Matrix4().makeRotationX(-0.3));
      G.box([0, -0.02 * s, 0.06 * s], [0.012 * s, 0.05 * s, 0.05 * s], FULL);
      add(mesh(G, rubberMat([24, 24, 26])));
      if (can) {
        // brass breech, coil spring and a shoulder stock
        const C = new Loft(false);
        C.tube([[0, 0.03 * s, -0.12 * s], [0, 0.03 * s, 0.12 * s]], () => r * 1.45, 6, FULL, 1, { capStart: true, capEnd: true });
        add(mesh(C, brassMat([200, 156, 70], 0.3)));
        const S = new Loft(false);
        S.box([0, 0.0, -0.3 * s], [0.05 * s, 0.1 * s, 0.3 * s], FULL);
        add(mesh(S, woodMat()));
      }
      if (band_) {
        // red rubber bands over the muzzle, stretched back to the notches on the shaft
        const R = new Loft(false);
        for (const k of [1, -1]) R.tube([[k * r * 1.1, 0.03 * s, L0 - 0.02 * s], [k * r * 1.4, 0.05 * s, L0 * 0.55], [k * 0.01 * s, 0.065 * s, L0 * 0.32]], () => 0.009 * s, 4, FULL, 1);
        add(mesh(R, rubberMat([170, 40, 30])));
      }
      // the loaded shaft: steel rod, flopper barb at the tip
      const A = new Loft(false);
      const sl = (can ? 1.25 : band_ ? 1.4 : 1.05) * s, sr = (can ? 0.016 : 0.0075) * s;
      A.tube([[0, 0.03 * s + r + sr, 0.02 * s], [0, 0.03 * s + r + sr, sl]], () => sr, 4, FULL, 1, { capStart: true });
      A.tube([[0, 0.03 * s + r + sr, sl], [0, 0.03 * s + r + sr, sl + (can ? 0.12 : 0.06) * s]], (t) => sr * 2.2 * (1 - t), 4, FULL, 2);
      A.box([0, 0.03 * s + r + sr * 2, sl - 0.06 * s], [0.004 * s, 0.006 * s, 0.07 * s], FULL, undefined, new THREE.Matrix4().makeRotationX(0.25));
      ammo = add(mesh(A, steelMat([196, 200, 206], 0.3)));
      muzzle.position.set(0, 0.03 * s + r + sr, L0 + 0.02 * s);
      fore = new THREE.Vector3(0, -0.01 * s, L0 * (can ? 0.45 : 0.42));
      len = L0;
      break;
    }
    case 'polespear': {
      const L0 = 1.9 * s;
      const B = new Loft(false);
      B.tube([[0, 0, -0.5 * s], [0, 0, L0 - 0.5 * s]], () => 0.014 * s, 5, FULL, 1, { capStart: true, capEnd: true });
      add(mesh(B, plasticMat([40, 60, 90])));
      const T = new Loft(false);
      for (const k of [-1, 0, 1]) T.tube([[0, 0, L0 - 0.5 * s], [k * 0.025 * s, k === 0 ? 0.01 * s : 0, L0 - 0.38 * s], [k * 0.032 * s, 0, L0 - 0.3 * s]], (t) => 0.005 * s * (1 - t * 0.7), 3, FULL, 1);
      ammo = add(mesh(T, steelMat([200, 204, 210])));
      const R = new Loft(false);
      R.tube([[0, 0, -0.5 * s], [0.03 * s, 0, -0.62 * s], [0, 0, -0.7 * s], [-0.03 * s, 0, -0.62 * s], [0, 0, -0.5 * s]], () => 0.008 * s, 4, FULL, 1);
      add(mesh(R, rubberMat([190, 50, 36])));
      muzzle.position.set(0, 0, L0 - 0.3 * s);
      fore = new THREE.Vector3(0, 0, 0.45 * s);
      len = L0 - 0.3 * s;
      break;
    }
    case 'knife': {
      const B = new Loft(false);
      B.box([0, 0, 0.0], [0.03 * s, 0.035 * s, 0.12 * s], FULL);
      add(mesh(B, plasticMat([230, 186, 30])));
      const K = new Loft(false);
      const tip: V3 = [0, 0.004 * s, 0.26 * s];
      K.loft([{ pts: [[0, 0.018 * s, 0.065 * s], [0.004 * s, 0, 0.065 * s], [0, -0.018 * s, 0.065 * s], [-0.004 * s, 0, 0.065 * s], [0, 0.018 * s, 0.065 * s]], v: 0 }], [0, 0.25, 0.5, 0.75, 1], FULL, 1, { end: tip });
      K.box([0, 0, 0.065 * s], [0.012 * s, 0.05 * s, 0.012 * s], FULL);
      ammo = add(mesh(K, steelMat([190, 196, 204], 0.25)));
      muzzle.position.set(...tip);
      len = 0.26 * s;
      break;
    }
    case 'net': {
      const B = new Loft(false);
      B.tube([[0, 0, -0.08 * s], [0, 0.02 * s, 0.1 * s], [0, 0, 0.28 * s]], (t) => (0.07 + Math.sin(t * Math.PI) * 0.05) * s, 6, FULL, 1, { capStart: true, capEnd: true });
      add(mesh(B, netMat()));
      const F = new Loft(false);
      for (let i = 0; i < 4; i++) F.box([Math.sin(i * 1.7) * 0.09 * s, Math.cos(i * 1.7) * 0.09 * s, 0.05 * s + i * 0.06 * s], [0.04 * s, 0.03 * s, 0.03 * s], FULL);
      add(mesh(F, plasticMat([230, 120, 30])));
      muzzle.position.set(0, 0, 0.2 * s);
      ammo = obj.children[0];
      len = 0.3 * s;
      break;
    }
    case 'flaregun': {
      const B = new Loft(false);
      B.tube([[0, 0.04 * s, -0.02 * s], [0, 0.04 * s, 0.2 * s]], () => 0.022 * s, 6, FULL, 1, { capStart: true, capEnd: true });
      B.box([0, -0.02 * s, 0.0], [0.03 * s, 0.1 * s, 0.045 * s], FULL, undefined, new THREE.Matrix4().makeRotationX(-0.25));
      add(mesh(B, plasticMat([236, 110, 24])));
      muzzle.position.set(0, 0.04 * s, 0.21 * s);
      len = 0.21 * s;
      break;
    }
    case 'medkit': {
      const P = new Loft(false);
      P.box([0, 0, 0.06 * s], [0.08 * s, 0.14 * s, 0.16 * s], FULL);
      add(mesh(P, kitMat('medkit', 16, 16, (x, y) => ((x > 6 && x < 9 && y > 3 && y < 12) || (y > 6 && y < 9 && x > 3 && x < 12) ? band([200, 30, 30], 1, x, y) : band([230, 228, 220], 0.9 + (hh(x, y, 56) - 0.5) * 0.1, x, y)), { rough: 0.8 })));
      muzzle.position.set(0, 0, 0.14 * s);
      len = 0.14 * s;
      break;
    }
    case 'none': break;
  }
  obj.add(muzzle);
  return {
    kind, obj, fore, muzzle, ammo, len,
    setLoaded(b: boolean) { if (ammo && kind !== 'net' && kind !== 'knife') ammo.visible = b; else if (ammo && kind === 'net') ammo.visible = b; },
  };
}
export { metal };
