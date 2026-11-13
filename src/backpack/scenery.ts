// The cosy seabed nook the backpack sits in: rippled sand, a leaning boulder, soft out-of-focus cave walls
// and kelp, drifting light shafts, a brass ship's lantern hanging on a rope (the warm key light), and the
// driftwood board that serves as the tray for loose items.
import * as THREE from 'three';
import { sandTex, rockTex, glowTex, shaftTex, driftwoodTex } from './bagTex';
import { Px, ramp, pxNoise } from '../gfx/px';
import { Loft, FULL, type V3 } from '../gfx/loft';
import { fbm } from '../core/math';

export interface Scenery {
  group: THREE.Group;
  tray: THREE.Group;          // tray-local: x across, z deep, y up from the board's top
  trayHalf: { x: number; z: number };
  lamp: THREE.Group;
  lampLight: THREE.SpotLight;
  lampGlow: THREE.Sprite;
  shafts: THREE.Mesh[];
  kelp: THREE.Mesh[];
  update(t: number): void;
}

function noisyRock(r: number, seed: number, detail = 3, squash = 0.7): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pa = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i).normalize();
    const n = fbm(v.x * 1.6 + seed, v.y * 1.6 + v.z * 1.3, 4, seed) - 0.5;
    const k = r * (1 + n * 0.55);
    pa.setXYZ(i, v.x * k, v.y * k * squash, v.z * k);
  }
  g.computeVertexNormals();
  // spherical-ish uv for the tiling rock texture
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); uv.setXY(i, (v.x + v.z * 0.6) * 0.9, v.y * 0.9); }
  return g;
}

function kelpTex(): THREE.Texture {
  const w = 24, h = 160, p = new Px(w, h);
  const r = ramp(['#06180e', '#0c2a14', '#163e1a', '#245a22', '#3a7a2c'], 4, 0);
  for (let y = 0; y < h; y++) {
    const cx = w / 2 + Math.sin(y * 0.08) * 3;
    const hw = 3 + Math.sin(y * 0.21) * 1.2 + (y % 26 < 13 ? 4 : 1.5) * (1 - y / h * 0.3);
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - cx);
      if (d > hw) continue;
      p.set(x, y, r(0.35 + (1 - d / hw) * 0.5 + (pxNoise(x, y, 8, 2, 4) - 0.5) * 0.3));
    }
  }
  const t = p.texture({ mip: false });
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
}

function backdropTex(): THREE.Texture {
  // a blurred cave opening: dark rock frame around a glowing blue-green distance
  const w = 128, h = 72, p = new Px(w, h);
  const deep = ramp(['#02090e', '#04131c', '#082230', '#0f3646', '#1a5560', '#2a7470'], 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x - w * 0.56) / (w * 0.42), ny = (y - h * 0.22) / (h * 0.62);
    const open = 1 - Math.min(1, Math.hypot(nx, ny) + (fbm(x / 10, y / 10, 3, 5) - 0.5) * 0.5);
    const t = 0.05 + Math.max(0, open) * 0.95 * (1 - y / h * 0.5);
    p.set(x, y, deep(t));
  }
  const t = p.texture({ mip: false });
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
}

export function buildScenery(): Scenery {
  const group = new THREE.Group();
  // ---------------------------------------------------------------- sand
  const sand = sandTex();
  sand.map.repeat.set(18, 18); sand.normal.repeat.set(18, 18);
  const sg = new THREE.PlaneGeometry(24, 24, 60, 60);
  sg.rotateX(-Math.PI / 2);
  const pa = sg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i);
    const back = Math.max(0, -z - 2.5);
    pa.setY(i, (fbm(x * 0.3, z * 0.3, 3, 2) - 0.5) * 0.25 + back * back * 0.04 - Math.max(0, Math.hypot(x - 0.3, z - 0.2) < 2.6 ? 0 : 0));
  }
  sg.computeVertexNormals();
  const floor = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1 }));
  floor.receiveShadow = true; floor.position.y = -0.03;
  group.add(floor);
  // ---------------------------------------------------------------- rocks: one the bag leans on + blurred cave walls
  const rockT = rockTex(64, false, ['#0c1416', '#18262a', '#24363a', '#34484a', '#466058', '#5a7466']);
  const rockMat = new THREE.MeshStandardMaterial({ map: rockT, roughness: 0.95 });
  const lean = new THREE.Mesh(noisyRock(1.3, 3, 4, 0.75), rockMat);
  lean.position.set(-0.6, 0.3, -1.85); lean.castShadow = lean.receiveShadow = true;
  group.add(lean);
  const pebbles: [number, number, number, number][] = [[1.9, 0.05, -0.9, 0.22], [-1.9, 0.04, 0.5, 0.16], [2.6, 0.04, 0.6, 0.12], [-2.4, 0.06, -0.6, 0.3], [0.9, 0.03, 1.2, 0.08]];
  for (const [x, y, z, r] of pebbles) { const m = new THREE.Mesh(noisyRock(r, x * 7, 2, 0.6), rockMat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); }
  const blurRock = new THREE.MeshStandardMaterial({ map: rockTex(32, true), roughness: 1, color: '#c8e0dc' });
  const walls: [number, number, number, number, number][] = [[-4.6, 1.2, -4.5, 2.8, 0.9], [4.8, 0.8, -4.2, 2.6, 0.8], [-1.2, 4.2, -6.5, 3.4, 0.5], [3.0, 3.6, -6.8, 2.8, 0.6], [0.5, -0.6, -6.2, 3.2, 0.5], [-5.5, 3.8, -3.5, 2.2, 1]];
  walls.forEach(([x, y, z, r, sq], k) => { const m = new THREE.Mesh(noisyRock(r, 11 + k, 3, sq), blurRock); m.position.set(x, y, z); m.receiveShadow = true; group.add(m); });
  // distant backdrop (cave mouth)
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), new THREE.MeshBasicMaterial({ map: backdropTex(), fog: false }));
  bd.position.set(1, 5, -12);
  group.add(bd);
  // ---------------------------------------------------------------- kelp ribbons (soft, swaying)
  const kt = kelpTex();
  const kelp: THREE.Mesh[] = [];
  const kspots: [number, number, number][] = [[-3.4, -2.6, 3.6], [-2.6, -3.4, 4.4], [3.6, -2.8, 3.8], [4.4, -3.6, 4.6], [2.9, -3.0, 3.2], [-4.2, -1.8, 3]];
  for (const [x, z, hgt] of kspots) {
    const g = new THREE.PlaneGeometry(0.42, hgt, 1, 12); g.translate(0, hgt / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: kt, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: '#a8c8a0' }));
    m.position.set(x, -0.05, z);
    m.userData.base = (g.attributes.position as THREE.BufferAttribute).array.slice(0);
    m.userData.ph = x * 1.3;
    group.add(m); kelp.push(m);
  }
  // ---------------------------------------------------------------- light shafts
  const st = shaftTex();
  const shafts: THREE.Mesh[] = [];
  for (const [x, z, w, rot, a] of [[-1.6, -2.2, 1.2, 0.32, 0.18], [0.8, -3.0, 1.6, 0.28, 0.14], [2.6, -1.6, 0.9, 0.36, 0.12], [-3.2, -3.6, 1.4, 0.3, 0.1]] as number[][]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 9), new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, color: '#bff4e8', fog: false }));
    m.position.set(x, 4.2, z); m.rotation.z = rot;
    m.userData.a = a; m.userData.ph = x;
    group.add(m); shafts.push(m);
  }
  // ---------------------------------------------------------------- the lantern
  const lamp = new THREE.Group();
  {
    const brass = new THREE.MeshStandardMaterial({ color: '#c8963a', roughness: 0.35, metalness: 0.6, emissive: '#2a1604' });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.6, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb050', emissiveIntensity: 1.6, roughness: 0.2, transparent: true, opacity: 0.85 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 16), brass); base.position.y = -0.26; lamp.add(base);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.36, 16, 1, true), glass); gl.position.y = -0.04; lamp.add(gl);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff4c0' })); flame.scale.y = 1.6; flame.position.y = -0.06; lamp.add(flame);
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.02), dark);
      const a = (k / 4) * Math.PI * 2 + 0.4; bar.position.set(Math.cos(a) * 0.15, -0.04, Math.sin(a) * 0.15); lamp.add(bar);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 16), brass); cap.position.y = 0.22; lamp.add(cap);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), brass); chim.position.y = 0.33; lamp.add(chim);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 16), brass); ring.position.y = 0.43; lamp.add(ring);
    const L = new Loft();
    const rope: V3[] = [[0, 0.5, 0], [0.02, 1.5, 0], [0.0, 3.5, 0]];
    L.tube(rope, () => 0.016, 6, FULL, 0);
    const rp = new Px(8, 32); rp.fill((x, y) => ((x + y * 2) % 6 < 3 ? [150, 120, 80] : [100, 76, 48]));
    const rt = rp.texture({ repeat: true }); rt.repeat.set(1, 30);
    lamp.add(new THREE.Mesh(L.build(), new THREE.MeshStandardMaterial({ map: rt, roughness: 1 })));
    lamp.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== gl && o !== flame) o.castShadow = false; });
  }
  lamp.position.set(-2.3, 3.1, 1.3);
  group.add(lamp);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(64, 2.2), color: '#ffb860', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  lampGlow.scale.set(1.6, 1.6, 1);
  lamp.add(lampGlow);
  lampGlow.position.y = -0.05;
  const lampLight = new THREE.SpotLight('#ffc27a', 16, 14, 0.7, 0.9, 1.3);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.camera.near = 0.5; lampLight.shadow.camera.far = 10;
  lampLight.shadow.bias = -0.0008; lampLight.shadow.normalBias = 0.02; lampLight.shadow.radius = 4;
  lamp.add(lampLight);
  lampLight.position.set(0, -0.06, 0);
  group.add(lampLight.target);
  // ---------------------------------------------------------------- driftwood tray
  const tray = new THREE.Group();
  const halfX = 0.66, halfZ = 0.5;
  {
    const dw = driftwoodTex();
    const top = new THREE.MeshStandardMaterial({ map: dw.map, normalMap: dw.normal, roughness: 0.95 });
    const side = new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 1 });
    const g = new THREE.BoxGeometry(halfX * 2, 0.07, halfZ * 2, 8, 1, 6);
    const p2 = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p2.count; i++) { const x = p2.getX(i), z = p2.getZ(i); p2.setY(i, p2.getY(i) + Math.sin(x * 2.2) * 0.008 + Math.cos(z * 3) * 0.006); }
    g.computeVertexNormals();
    const board = new THREE.Mesh(g, [side, side, top, side, side, side]);
    board.position.y = -0.035; board.castShadow = board.receiveShadow = true;
    tray.add(board);
    // barnacles on a corner + a sprig of weed
    const barn = new THREE.MeshStandardMaterial({ color: '#c8c0b0', roughness: 0.9 });
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018 + k % 3 * 0.006, 0.03 + k % 2 * 0.01, 0.03, 7), barn);
      b.position.set(halfX - 0.06 - (k % 3) * 0.05, 0.01, -halfZ + 0.06 + Math.floor(k / 3) * 0.05); b.castShadow = true;
      tray.add(b);
    }
  }
  tray.position.set(1.42, 0.07, 0.62);
  tray.rotation.y = -0.22;
  group.add(tray);

  const update = (t: number) => {
    for (const m of kelp) {
      const base = m.userData.base as Float32Array, pos = (m.geometry.attributes.position as THREE.BufferAttribute);
      for (let i = 0; i < pos.count; i++) {
        const y = base[i * 3 + 1], k = y / 4;
        pos.setX(i, base[i * 3] + Math.sin(t * 0.9 + m.userData.ph + y * 0.8) * 0.18 * k * k);
        pos.setZ(i, base[i * 3 + 2] + Math.cos(t * 0.7 + m.userData.ph + y * 0.5) * 0.08 * k);
      }
      pos.needsUpdate = true;
    }
    for (const s of shafts) (s.material as THREE.MeshBasicMaterial).opacity = s.userData.a * (0.7 + 0.3 * Math.sin(t * 0.4 + s.userData.ph));
    lamp.rotation.z = Math.sin(t * 0.8) * 0.035; lamp.rotation.x = Math.sin(t * 0.63 + 1) * 0.025;
    lampLight.intensity = 16 * (0.94 + Math.sin(t * 13) * 0.02 + Math.sin(t * 7.3) * 0.03);
  };
  return { group, tray, trayHalf: { x: halfX, z: halfZ }, lamp, lampLight, lampGlow, shafts, kelp, update };
}
