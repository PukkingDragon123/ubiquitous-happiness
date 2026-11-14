// The photo studio (a port of DUSTUP's CardStudio + IconFactory): a private offscreen WebGL renderer that
// photographs 3D objects and little dioramas into 2D canvases.
//
//   photo(obj, 96, 64, { yaw, pitch, bg })      a lit studio shot of any object (canvas, display-ready sRGB)
//   modelIcon('copperOre', 32)                   an item icon RENDERED FROM ITS MODEL with a pixel finish:
//                                                rendered 4x, box-downsampled, lightly posterised, a 1 px ink
//                                                outline (a deep shade of the edge colour) and a warm rim
//   diorama(build, 120, 90)                      a card vignette: sea backdrop, god rays, sand, the subject
//
// Everything is cached by key; the studio runs in its own GL context so it never disturbs the game's renderer.
import * as THREE from 'three';
import { itemModel } from '../../backpack/models';
import { ITEMS } from '../../game/items';

let R: THREE.WebGLRenderer | null = null;
function renderer(): THREE.WebGLRenderer | null {
  if (R) return R;
  try {
    R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.NoToneMapping;
    R.setPixelRatio(1);
  } catch { R = null; }
  return R;
}

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
const key = new THREE.DirectionalLight('#fff1dc', 3.0);
const rim = new THREE.DirectionalLight('#ffc890', 2.0);
const fill = new THREE.HemisphereLight('#d8e8ff', '#6a5040', 1.2);
key.position.set(-1.2, 1.8, 2.2); rim.position.set(1.6, 0.8, -1.6);
scene.add(key, rim, fill);

const _box = new THREE.Box3(), _v = new THREE.Vector3();

export interface PhotoOpts { yaw?: number; pitch?: number; fill?: number; bg?: string | null; ss?: number; fov?: number }

/** render obj (framed to fill `fill` of the shot) to a w x h canvas */
export function photo(obj: THREE.Object3D, w: number, h: number, o: PhotoOpts = {}): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const r = renderer();
  if (!r) return out;
  const ss = o.ss ?? 1;
  r.setSize(w * ss, h * ss, false);
  const holder = new THREE.Group();
  holder.add(obj);
  obj.rotation.set(o.pitch ?? 0.18, o.yaw ?? -0.35, 0);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  _box.setFromObject(obj);
  const c = _box.getCenter(_v.clone()), size = _box.getSize(new THREE.Vector3());
  cam.fov = o.fov ?? 26; cam.aspect = w / h;
  const fillK = o.fill ?? 0.82;
  const need = Math.max(size.y, size.x / cam.aspect) / fillK;
  const dist = need / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) + size.z;
  cam.position.set(c.x, c.y, c.z + dist); cam.lookAt(c); cam.near = dist * 0.1; cam.far = dist * 4; cam.updateProjectionMatrix();
  r.setClearColor(o.bg ?? '#000000', o.bg ? 1 : 0);
  r.render(scene, cam);
  scene.remove(holder);
  holder.remove(obj);
  out.getContext('2d')!.drawImage(r.domElement, 0, 0, w, h);
  return out;
}

const iconCache = new Map<string, HTMLCanvasElement>();
/**
 * an item icon rendered from its 3D model with a pixel finish (w x h = the item's cells x `cell`). Returns null
 * when no GL is available (callers fall back to painted art).
 */
export function modelIcon(id: string, cell = 32, level = 1): HTMLCanvasElement | null {
  const d = ITEMS[id];
  if (!d) return null;
  const k = `${id}|${cell}|${level}`;
  const hit = iconCache.get(k);
  if (hit) return hit;
  if (!renderer()) return null;
  const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
  const W = cw * cell, H = ch * cell, SS = 4;
  const m = itemModel(id);
  const big = photo(m, W * SS, H * SS, { yaw: -0.3, pitch: 0.2, fill: 0.86 });
  const out = pixelFinish(big, W, H, SS);
  iconCache.set(k, out);
  return out;
}

/** box-downsample, posterise a little, 1 px selective ink outline, warm top-left rim */
function pixelFinish(src: HTMLCanvasElement, W: number, H: number, SS: number): HTMLCanvasElement {
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(W, H), D = img.data;
  const A = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let yy = 0; yy < SS; yy++) for (let xx = 0; xx < SS; xx++) {
      const i = ((y * SS + yy) * src.width + x * SS + xx) * 4;
      const al = sd[i + 3] / 255; r += sd[i] * al; g += sd[i + 1] * al; b += sd[i + 2] * al; a += al;
    }
    const j = (y * W + x) * 4;
    if (a / (SS * SS) < 0.45) continue;
    const q = (v: number) => Math.min(255, Math.round(v / a / 12) * 12);
    D[j] = q(r); D[j + 1] = q(g); D[j + 2] = q(b); D[j + 3] = 255; A[y * W + x] = 1;
  }
  // outline: deep shade of the neighbouring colour, darker on the shadow side (bottom / right)
  const put: [number, number, number, number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A[y * W + x]) continue;
    let src2 = -1, deep = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !A[yy * W + xx]) continue;
      src2 = yy * W + xx; if (dx < 0 || dy < 0) deep = true;
    }
    if (src2 < 0) continue;
    const k = deep ? 0.22 : 0.34;
    put.push([y * W + x, D[src2 * 4] * k + 6, D[src2 * 4 + 1] * k + 4, D[src2 * 4 + 2] * k + 10, 255]);
  }
  for (const [i, r, g, b, a] of put) { D[i * 4] = r; D[i * 4 + 1] = g; D[i * 4 + 2] = b; D[i * 4 + 3] = a; }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ------------------------------------------------------------------ card dioramas
const dioCache = new Map<string, HTMLCanvasElement>();
let backdrop: THREE.Mesh | null = null;
/**
 * photograph a little underwater diorama for card art: a sea-gradient backdrop with god rays, a sandy floor,
 * a few pebbles and kelp, and the subject the builder adds, lit like a stage. Cached by key.
 */
export function diorama(key: string, w: number, h: number, build: (set: THREE.Group) => void, o: { tint?: string } = {}): HTMLCanvasElement {
  const hit = dioCache.get(key);
  if (hit) return hit;
  const set = new THREE.Group();
  if (!backdrop) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#5ad2e8'); g.addColorStop(0.55, '#1e6a9a'); g.addColorStop(1, '#0a2a4a');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.globalAlpha = 0.18; x.fillStyle = '#ffffff';
    for (const [x0, w0] of [[8, 6], [26, 4], [44, 7]]) { x.beginPath(); x.moveTo(x0, 0); x.lineTo(x0 + w0, 0); x.lineTo(x0 + w0 + 14, 64); x.lineTo(x0 + 10, 64); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    backdrop.position.set(0, 0.6, -2);
  }
  set.add(backdrop.clone());
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.3, 9), new THREE.MeshStandardMaterial({ color: o.tint ?? '#c8aa7a', flatShading: true, roughness: 0.95 }));
  floor.position.set(0, -0.95, -0.4);
  set.add(floor);
  for (const [x, z, s] of [[-1.1, 0.1, 0.18], [1.2, -0.2, 0.14], [0.7, 0.4, 0.1]] as [number, number, number][]) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: '#5a5462', flatShading: true }));
    p.position.set(x, -0.78, z); set.add(p);
  }
  for (const x of [-1.4, 1.5]) {
    const k = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.4, 4), new THREE.MeshStandardMaterial({ color: '#4c8a2a', flatShading: true }));
    k.position.set(x, -0.2, -0.6); k.rotation.z = x * 0.1; set.add(k);
  }
  build(set);
  const out = photoSet(set, w, h);
  dioCache.set(key, out);
  return out;
}
function photoSet(set: THREE.Object3D, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const r = renderer();
  if (!r) return out;
  r.setSize(w * 2, h * 2, false);
  scene.add(set);
  cam.fov = 34; cam.aspect = w / h; cam.position.set(0, 0.25, 3.4); cam.lookAt(0, -0.05, 0); cam.near = 0.1; cam.far = 20; cam.updateProjectionMatrix();
  r.setClearColor('#0a2a4a', 1);
  r.render(scene, cam);
  scene.remove(set);
  out.getContext('2d')!.drawImage(r.domElement, 0, 0, w, h);
  return out;
}
