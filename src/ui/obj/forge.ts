// THE FORGE (v8b "abyssal ceramic"): every UI frame, button, tab, keycap and slot is a real little 3D object, built
// low-poly in the game's PS2 matte style, lit from one direction and photographed orthographically into a canvas
// that the 2D UI draws (so text and layering stay exact and crisp, and each piece renders once per size and state).
//
// The material language (one family, everywhere):
//   CERAMIC   deep blue-slate glazed ceramic: the slabs that hold content (a dark, calm reading surface)
//   PEWTER    cool cast pewter: the raised rims and bezels (lit bevels top-left, shade bottom-right)
//   NACRE     mother-of-pearl / old ivory: studs, inlay lines, title tablets, light keycaps (a faint pink-teal sheen)
//   GLASS     deep sea-glass enamel (muted teal): the primary buttons, a gem, the selected state
//   CORAL     muted coral enamel: danger
//   WELL      the near-black floor of an inset (slots, wells, bar troughs)
// Geometry: rounded rects extruded with a one-step chamfer (flat shaded facets read as hand-cut), rims as raised
// rings, insets as rings whose inner walls slope in (lit on the lower right, shaded top left: they read as recessed).
//
//   forge(key, w, h, d, build)   a w x h UI px piece rendered at d device px per UI px (cached), or null without GL
//   M.ceramic / M.pewter / ...   the shared materials;  slab(), ring(), stud(), gem()  geometry helpers (UI px units)
import * as THREE from 'three';

let R: THREE.WebGLRenderer | null = null;
let failed = false;
function renderer(): THREE.WebGLRenderer | null {
  if (R || failed) return R;
  try {
    R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.NoToneMapping;
    R.setPixelRatio(1);
  } catch { R = null; failed = true; }
  return R;
}
/** the forge is usable (a GL context could be made); off with ?forge=0 */
export function forgeOn() {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('forge') === '0') return false;
  return !!renderer();
}

const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
cam.position.set(0, 0, 800); cam.lookAt(0, 0, 0);
// one light direction for the whole UI: a soft key from the upper left front, a cool sky fill, a faint rim from above
// (a point key placed per piece: its falloff across a big face reads as a soft glaze gradient, top left to bottom right)
const key = new THREE.PointLight('#fff1de', 1.55, 0, 0);
const dirK = new THREE.DirectionalLight('#fff4e6', 0.55); dirK.position.set(-0.55, 0.75, 1);
const rimL = new THREE.DirectionalLight('#9fc4ff', 0.55); rimL.position.set(0.4, 1, -0.3);
const sky = new THREE.HemisphereLight('#8fa8cc', '#0c0a12', 0.3);
scene.add(key, dirK, rimL, sky);

const flat = (color: string, o: { rough?: number; metal?: number; emissive?: string; ei?: number } = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, flatShading: true, emissive: o.emissive ?? '#000000', emissiveIntensity: o.ei ?? 1 });
export const M = {
  ceramic: flat('#123a5c', { rough: 0.32, metal: 0.1 }),
  ceramicHi: flat('#1b4d74', { rough: 0.32, metal: 0.1 }),
  ceramicDim: flat('#0e2a44', { rough: 0.45, metal: 0.08 }),
  pewter: flat('#b6bfcc', { rough: 0.3, metal: 0.45 }),
  pewterDark: flat('#77839a', { rough: 0.36, metal: 0.4 }),
  nacre: flat('#f1e7d6', { rough: 0.28, emissive: '#2c2432' }),
  ivory: flat('#dccdab', { rough: 0.6 }),
  glass: flat('#2f8078', { rough: 0.25, emissive: '#06221f' }),
  glassHi: flat('#45a196', { rough: 0.25, emissive: '#0a3029' }),
  coral: flat('#9a4538', { rough: 0.35, emissive: '#200806' }),
  coralHi: flat('#b8594a', { rough: 0.35, emissive: '#2a0c08' }),
  steel: flat('#3e5778', { rough: 0.35, emissive: '#0a1424' }),
  steelHi: flat('#557198', { rough: 0.35, emissive: '#0e1a2e' }),
  gold: flat('#b99a62', { rough: 0.4, metal: 0.3 }),
  well: new THREE.MeshBasicMaterial({ color: '#060c13' }),
  disabled: flat('#1a212b', { rough: 0.85 }),
};
export type Mat = THREE.Material;

// ------------------------------------------------------------------ geometry (UI px units, y up, centred at 0)
function rr(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  r = Math.max(0.5, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const s = new THREE.Shape(), x0 = cx - w / 2, y0 = cy - h / 2;
  // a cut corner (one chamfer step): reads hand-cut and stays low-poly
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.lineTo(x0 + w, y0 + r); s.lineTo(x0 + w, y0 + h - r);
  s.lineTo(x0 + w - r, y0 + h); s.lineTo(x0 + r, y0 + h); s.lineTo(x0, y0 + h - r); s.lineTo(x0, y0 + r); s.closePath();
  return s;
}
function holePath(w: number, h: number, r: number): THREE.Path {
  const p = new THREE.Path(), x0 = -w / 2, y0 = -h / 2;
  r = Math.max(0.5, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  p.moveTo(x0 + r, y0); p.lineTo(x0, y0 + r); p.lineTo(x0, y0 + h - r); p.lineTo(x0 + r, y0 + h); p.lineTo(x0 + w - r, y0 + h);
  p.lineTo(x0 + w, y0 + h - r); p.lineTo(x0 + w, y0 + r); p.lineTo(x0 + w - r, y0); p.closePath();
  return p;
}
/** a chamfered slab w x h, `depth` thick, the chamfer `bev` px; its top face at z = z0 + depth */
export function slab(w: number, h: number, mat: Mat, o: { depth?: number; bev?: number; r?: number; z?: number; cx?: number; cy?: number } = {}): THREE.Mesh {
  const bev = Math.max(0, Math.min(o.bev ?? 2, w / 2 - 1, h / 2 - 1)), depth = o.depth ?? 4;
  const g = new THREE.ExtrudeGeometry(rr(w - bev * 2, h - bev * 2, o.r ?? 3, o.cx ?? 0, o.cy ?? 0), { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 });
  const m = new THREE.Mesh(g, mat); m.position.z = o.z ?? 0;
  return m;
}
/** a raised ring (a rim / bezel): outer w x h, `t` px wide */
export function ring(w: number, h: number, t: number, mat: Mat, o: { depth?: number; bev?: number; r?: number; z?: number } = {}): THREE.Mesh {
  const bev = Math.max(0, Math.min(o.bev ?? 1.5, t / 2 - 0.2)), depth = o.depth ?? 3;
  const s = rr(w - bev * 2, h - bev * 2, o.r ?? 3);
  s.holes.push(holePath(w - t * 2 + bev * 2, h - t * 2 + bev * 2, (o.r ?? 3) + 0.5));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 });
  const m = new THREE.Mesh(g, mat); m.position.z = o.z ?? 0;
  return m;
}
/** a little faceted stud (nacre / pewter), radius r, at (x, y) */
export function stud(x: number, y: number, r: number, mat: Mat, z = 6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat);
  m.position.set(x, y, z); m.rotation.set(0.5, 0.2, Math.PI / 4); m.scale.z = 0.55;
  return m;
}
/** a cut gem (sea-glass / coral), r px, at (x, y) */
export function gem(x: number, y: number, r: number, mat: Mat, z = 6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.7, r * 0.8, 6, 1), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z);
  return m;
}
/** a low-poly disc (a round key / a bezel): radius r (UI px), `depth` thick, its top face at z + depth; a chamfered
 *  top edge (a second, slightly smaller cylinder) */
export function disc(r: number, mat: Mat, o: { depth?: number; z?: number; segs?: number; x?: number; y?: number } = {}): THREE.Group {
  const g = new THREE.Group(), d = o.depth ?? 3, n = o.segs ?? 14, z = o.z ?? 0;
  const a = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d * 0.6, n, 1), mat); a.rotation.x = Math.PI / 2; a.position.z = z + d * 0.3;
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r - Math.min(1.6, r * 0.12), r, d * 0.4, n, 1), mat); b.rotation.x = Math.PI / 2; b.position.z = z + d * 0.8;
  g.add(a, b); g.position.set(o.x ?? 0, o.y ?? 0, 0);
  return g;
}
export function boxAt(x: number, y: number, w: number, h: number, d: number, mat: Mat, z = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z + d / 2); m.rotation.z = rz;
  return m;
}

// ------------------------------------------------------------------ the camera
const cache = new Map<string, HTMLCanvasElement | null>();
let texels = 0;
function dispose(o: THREE.Object3D) { o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
/**
 * a w x h UI px piece rendered at d device px per UI px. `build` adds meshes to the group in UI px (centred at the
 * origin, y up, the camera looks down -z). o.tilt tips it (radians about x: the top comes toward you), o.scale grows
 * it a touch (hover), o.light brightens the key (hover / pressed). Cached by key.
 */
export function forge(keyStr: string, w: number, h: number, d: number, build: (g: THREE.Group) => void, o: { tilt?: number; tiltY?: number; scale?: number; light?: number } = {}): HTMLCanvasElement | null {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h)); d = Math.max(1, Math.min(6, Math.round(d)));
  const k = `${keyStr}|${w}|${h}|${d}`;
  if (cache.has(k)) { const c = cache.get(k)!; cache.delete(k); cache.set(k, c); return c; }
  const r = renderer();
  if (!r) { cache.set(k, null); return null; }
  const g = new THREE.Group();
  build(g);
  g.rotation.x = -(o.tilt ?? 0); g.rotation.y = o.tiltY ?? 0;
  g.scale.setScalar(o.scale ?? 1);
  scene.add(g);
  const W = w * d, H = h * d;
  r.setSize(W, H, false);
  cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2; cam.updateProjectionMatrix();
  const k0 = key.intensity; key.intensity = k0 * (o.light ?? 1);
  const S = Math.max(w, h);
  key.position.set(-w * 0.55, h * 0.75, S * 1.1 + 40);
  r.setClearColor('#000000', 0);
  r.render(scene, cam);
  key.intensity = k0;
  scene.remove(g); dispose(g);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  out.getContext('2d')!.drawImage(r.domElement, 0, 0, W, H);
  cache.set(k, out); texels += W * H;
  while ((texels > 24e6 || cache.size > 900) && cache.size > 1) {
    const f = cache.keys().next().value as string; const c = cache.get(f); cache.delete(f); if (c) texels -= c.width * c.height;
  }
  return out;
}
