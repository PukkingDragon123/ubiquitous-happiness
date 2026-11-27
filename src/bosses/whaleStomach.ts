// INSIDE THE WHALE SHARK: the survival arena of the whale shark fight (src/bosses/whaleShark.ts, phase 2).
//
// A fleshy sack built round the fight box: the camera looks into its back half, the walls curling toward the lens top
// and bottom and pinching shut at both ends. Pulsing gut ridges (rugae) run along it, peristaltic waves travel through,
// patches of bioluminescent bacteria and a glowing pyloric VALVE (the soft spot to strike) light it; the gullet hangs
// open at the top left (where you fell in and more swallowed fish drop after you). Acid pools on the floor and rises.
// Swallowed junk lies about (a tyre, a shopping cart, a brass diving helmet, bottles, a ghost net, an old boot, a
// tackle box, a scuba tank) next to a half-digested fish, and a young sea turtle is tangled in netting.
//
//   const s = new Stomach(box);   scene.add(s.group);   s.update(dt, t)   s.squeeze / s.slide / s.acidY   s.dispose()
// Everything is hand-built low-poly with clean pixel pages (flat shaded, matte), lit by the rig's pooled lamps.
import * as THREE from 'three';
import type { Arena } from '../combat/types';
import { Px, type RGB } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { cleanKit } from '../humans/clean';
import { band, nz, hh } from '../humans/fabric';
import { itemModel } from '../backpack/models';
import { buildFish, type FishModel } from '../fish';
import { clamp } from '../core/math';

const TAU = Math.PI * 2;
const C = (h: string): RGB => { const c = new THREE.Color(h); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]; };

// ------------------------------------------------------------------ materials (clean pixel pages, matte, flat)
const mats = new Map<string, THREE.MeshStandardMaterial>();
function pixMat(key: string, w: number, h: number, paint: (x: number, y: number) => RGB | null, o: { rough?: number; metal?: number; repeat?: boolean; glow?: (x: number, y: number) => RGB | null; emissive?: number; transparent?: number; side?: THREE.Side; alphaTest?: number; noUw?: boolean } = {}) {
  let m = mats.get(key);
  if (m) return m;
  const p = new Px(w, h);
  p.fill((x, y) => paint(x, y));
  if (!o.alphaTest) cleanKit(p);
  const tex = p.texture({ repeat: o.repeat, mip: true });
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, flatShading: true, side: o.side ?? THREE.FrontSide });
  if (o.glow) {
    const g = new Px(w, h);
    g.fill((x, y) => o.glow!(x, y) ?? [0, 0, 0]);
    m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = g.texture({ repeat: o.repeat, mip: true }); m.emissiveIntensity = o.emissive ?? 1;
  }
  if (o.alphaTest) { m.alphaTest = o.alphaTest; m.side = THREE.DoubleSide; }
  if (o.transparent !== undefined) { m.transparent = true; m.opacity = o.transparent; m.depthWrite = false; }
  if (!o.noUw && o.transparent === undefined) uw(m, { rim: 0.15 });
  mats.set(key, m);
  return m;
}

// the stomach lining: a pale flesh page (the fold colours come from the geometry, per vertex, every frame) with
// darker pits, blue-purple veins, and the bioluminescent bacteria in a few drifting colonies (emissive)
const fleshMat = () => {
  const m = pixMat('wsFlesh', 128, 128, (x, y) => {
    let c = C('#f0c8c8');
    const n = nz(x, y, 26, 3);
    if (n > 0.66) c = C('#e0a8b0'); else if (n < 0.3) c = C('#fae0d8');
    const vein = Math.abs(Math.sin(x * 0.09 + Math.sin(y * 0.07) * 2.6 + nz(x, y, 34, 5) * 3.4)) < 0.045 && nz(x, y, 20, 9) > 0.42;
    if (vein) c = C('#9a6ab0');
    if (hh(x >> 1, y >> 1, 13) > 0.985) c = C('#b07888');                 // pits
    return band(c, 0.96 + (nz(x, y, 12, 7) - 0.5) * 0.1, x, y, 0.05);
  }, {
    repeat: true, rough: 0.85, emissive: 1.0,
    glow: (x, y) => {
      // colonies: a big soft mask, then little round dots inside it
      // colonies: round patches seeded on a 32 px grid (wrapping, so the tile repeats cleanly)
      let inCol = false;
      const gx = Math.floor(x / 32), gy = Math.floor(y / 32);
      for (let j = -1; j <= 1 && !inCol; j++) for (let i = -1; i <= 1 && !inCol; i++) {
        const qx = (gx + i + 4) % 4, qy = (gy + j + 4) % 4;
        if (hh(qx, qy, 5) < 0.7) continue;
        const ccx = (gx + i) * 32 + 8 + hh(qx, qy, 6) * 16, ccy = (gy + j) * 32 + 8 + hh(qx, qy, 8) * 16;
        if (Math.hypot(x - ccx, y - ccy) < 5 + hh(qx, qy, 9) * 5) inCol = true;
      }
      if (!inCol) return null;
      const cx = Math.floor(x / 6), cy = Math.floor(y / 6);
      if (hh(cx, cy, 41) < 0.55) return null;
      const ox = cx * 6 + 1.5 + hh(cx, cy, 2) * 3, oy = cy * 6 + 1.5 + hh(cx, cy, 3) * 3;
      const d = Math.hypot(x - ox, y - oy);
      return d < 0.9 ? C('#a0fff0') : d < 1.7 ? C('#145a50') : null;
    },
  });
  m.vertexColors = true;
  return m;
};
const acidMat = () => pixMat('wsAcid', 64, 64, (x, y) => {
  // bile: slow swirling bands, rings where bubbles just burst, foam beads
  const r = Math.sin(x * 0.2 + Math.sin(y * 0.3) * 2.4 + Math.sin(y * 0.11) * 1.5);
  let c = C(r > 0.7 ? '#c8e030' : r > 0.0 ? '#8aae18' : r > -0.6 ? '#5e800e' : '#40600a');
  for (let k = 0; k < 5; k++) {
    const cx = hh(k, 1, 91) * 64, cy = hh(k, 2, 91) * 64, rr = 3 + hh(k, 3, 91) * 5;
    const d = Math.hypot(((x - cx + 96) % 64) - 32, ((y - cy + 96) % 64) - 32);
    if (Math.abs(d - rr) < 0.7) c = C('#e8ff80');
  }
  if (hh(x, y, 7) > 0.975) c = C('#f4ffc0');
  return c;
}, { repeat: true, rough: 0.5, glow: (x, y) => { const r = Math.sin(x * 0.2 + Math.sin(y * 0.3) * 2.4 + Math.sin(y * 0.11) * 1.5); return r > 0.7 ? C('#a0d020') : r > 0.0 ? C('#4a7008') : C('#1e3004'); }, emissive: 1.25, transparent: 0.94 });
const acidBodyMat = () => {
  let m = mats.get('wsAcidBody');
  if (!m) {
    const p = new Px(16, 64);
    p.fill((x, y) => (y < 2 ? C('#f0ff90') : y < 4 ? C('#c8f050') : (y + (x >> 2)) % 11 === 0 ? C('#9ac828') : y < 30 ? C('#6a9a1c') : C('#4a7012')));
    const t = p.texture({ repeat: true, mip: false });
    m = new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color('#5a8a10'), emissiveIntensity: 0.7, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1, side: THREE.DoubleSide });
    mats.set('wsAcidBody', m);
  }
  return m;
};
const rubberMat = () => pixMat('wsTyre', 64, 32, (x, y) => {
  // tread blocks round the outside (v middle), sidewall bands with raised lettering; green slime in patches
  let c = C('#26262a');
  if (y > 10 && y < 22) c = ((x >> 2) + (y > 16 ? 1 : 0)) & 1 ? C('#1a1a1e') : C('#34343a');
  else if (y === 5 || y === 26) c = C('#3c3c44');
  else if ((y === 7 || y === 24) && (x % 6) < 3) c = C('#4a4a52');
  if (nz(x, y, 14, 2) > 0.72) c = C('#4a6a2a');
  return band(c, 0.95 + (y < 16 ? 0.05 : -0.05), x, y);
}, { rough: 0.95 });
const chromeMat = () => pixMat('wsCartWire', 16, 16, (x, y) => {
  let c = C(y < 4 ? '#d8dde0' : y < 10 ? '#a8b0b4' : '#6a7074');
  if (nz(x, y, 6, 4) > 0.6) c = C('#8a5a2a');                              // rust blooms
  return c;
}, { rough: 0.5, metal: 0.5 });
const redPlasticMat = () => pixMat('wsCartRed', 16, 16, (x, y) => band(C('#c42a20'), y < 4 ? 1.2 : 0.95 - y / 60, x, y), { rough: 0.6 });
const brassMat = () => pixMat('wsBrass', 48, 48, (x, y) => {
  let c = C('#c08a30');
  const k = 0.9 + (y < 12 ? 0.18 : 0) - (y > 36 ? 0.15 : 0);
  if (nz(x, y, 12, 6) > 0.64) c = C('#4a9a80');                             // verdigris
  if (y % 16 === 0) c = C('#6a4410');                                      // seams
  if (y % 16 === 2 && x % 6 === 0) c = C('#f0d070');                        // rivets
  return band(c, k, x, y);
}, { rough: 0.55, metal: 0.45 });
const glassMat = (col: string, key: string) => pixMat('wsGlass' + key, 16, 32, (x, y) => {
  let c = C(col);
  if (x === 3 && y > 6 && y < 26) c = C('#e8fff0');                          // a highlight streak
  if (y > 12 && y < 20) c = key === 'g' ? C('#e8dcc0') : C('#d8c8a0');      // the label
  if (y > 12 && y < 20 && (x === 6 || x === 9) && y % 2 === 0) c = C('#8a5a30');
  return c;
}, { rough: 0.3, glow: (x, y) => (y > 2 && y < 12 ? C(col).map((v) => v * 0.15) as RGB : null), emissive: 1 });
const netMat = () => pixMat('wsNet', 64, 64, (x, y) => {
  const on = (x % 8 === 0) || (y % 8 === 0) || ((x + y) % 11 === 0 && nz(x, y, 20, 3) > 0.7);
  if (!on) return null;
  return C(hh(x >> 3, y >> 3, 3) > 0.7 ? '#3a7aa0' : '#5a8a5a');
}, { alphaTest: 0.5, rough: 0.9 });
const corkMat = () => pixMat('wsFloat', 16, 16, (x, y) => band(C(y < 8 ? '#e86a2a' : '#f0c050'), 0.9 + (x % 4 === 0 ? -0.1 : 0.05), x, y), { rough: 0.8 });
const boneMat = () => pixMat('wsBone', 16, 16, (x, y) => band(C('#e8e0c8'), 1 - y / 40 + (nz(x, y, 6, 1) - 0.5) * 0.2, x, y), { rough: 0.7 });
const throatMat = () => pixMat('wsThroat', 32, 32, (x, y) => band(C(y % 8 < 3 ? '#4a0e1c' : '#2a0610'), 1 - y / 64, x, y), { rough: 0.9 });
const valveMat = () => pixMat('wsValve', 64, 32, (x, y) => {
  // puckered lobes: a pale rim on each lobe, deep red in the creases between them, darker toward the throat
  const lobe = Math.cos((x / 64) * TAU * 8);
  const c = C(lobe > 0.7 ? '#f0909a' : lobe > 0.2 ? '#d0606e' : lobe > -0.4 ? '#a83a4c' : '#6a1a2a');
  return band(c, 1.0 + (y < 6 ? 0.12 : 0) - (y / 32) * 0.35, x, y);
}, { rough: 0.7 });
const coreMat = () => {
  let m = mats.get('wsCore');
  if (!m) {
    const p = new Px(32, 32);
    p.fill((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); return d < 5 ? C('#f0fff8') : d < 9 ? C('#9affe0') : d < 13 ? C('#38d8b0') : C('#1a8a78'); });
    m = new THREE.MeshBasicMaterial({ map: p.texture({ mip: false }), color: new THREE.Color(1.6, 1.6, 1.6) }) as unknown as THREE.MeshStandardMaterial;
    mats.set('wsCore', m);
  }
  return m;
};

// ------------------------------------------------------------------ swallowed junk (hand-built)
function mesh(g: THREE.BufferGeometry, m: THREE.Material, p?: [number, number, number], r?: [number, number, number], s?: number) {
  const me = new THREE.Mesh(g, m);
  if (p) me.position.set(...p);
  if (r) me.rotation.set(...r);
  if (s) me.scale.setScalar(s);
  me.castShadow = true;
  return me;
}
const tube = (pts: [number, number, number][], r: number, seg = 8, radial = 4) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), seg, r, radial, false);
const line = (a: [number, number, number], b: [number, number, number], r: number) => tube([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], r, 1, 4);

/** a car tyre: a lathed cross-section (tread, shoulders, sidewalls, bead) round its axle */
export function buildTyre(): THREE.Group {
  const g = new THREE.Group();
  const prof: [number, number][] = [[0.3, -0.13], [0.36, -0.15], [0.44, -0.14], [0.48, -0.1], [0.5, -0.04], [0.5, 0.04], [0.48, 0.1], [0.44, 0.14], [0.36, 0.15], [0.3, 0.13], [0.29, 0]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  g.add(mesh(geo, rubberMat(), [0, 0, 0], [Math.PI / 2, 0, 0]));
  // a rusted steel rim inside
  const rim = new THREE.LatheGeometry([[0.29, -0.1], [0.26, -0.08], [0.18, -0.06], [0.08, -0.03], [0.04, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  g.add(mesh(rim, chromeMat(), [0, 0, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 5), brassMat(), [Math.cos(a) * 0.12, Math.sin(a) * 0.12, -0.05], [Math.PI / 2, 0, 0])); }
  return g;
}

/** a shopping cart on its side: a tapered wire basket, the fold-down child seat, a red handle, castor wheels */
export function buildCart(): THREE.Group {
  const g = new THREE.Group(), W = chromeMat(), r = 0.014;
  const bot = [[-0.38, 0.22, -0.22], [0.34, 0.22, -0.22], [0.34, 0.22, 0.22], [-0.38, 0.22, 0.22]] as [number, number, number][];
  const top = [[-0.5, 0.78, -0.27], [0.46, 0.78, -0.27], [0.46, 0.78, 0.27], [-0.5, 0.78, 0.27]] as [number, number, number][];
  for (let i = 0; i < 4; i++) { g.add(mesh(line(bot[i], bot[(i + 1) % 4], r), W)); g.add(mesh(line(top[i], top[(i + 1) % 4], r * 1.3), W)); g.add(mesh(line(bot[i], top[i], r), W)); }
  // the mesh of the basket: vertical wires on the sides and the front, two horizontal rings, a floor grid
  for (let k = 1; k < 8; k++) {
    const u = k / 8;
    for (const z of [-1, 1]) g.add(mesh(line([-0.38 + 0.72 * u, 0.22, 0.22 * z], [-0.5 + 0.96 * u, 0.78, 0.27 * z], r * 0.6), W));
    g.add(mesh(line([-0.38 + 0.72 * u, 0.22, -0.22], [-0.38 + 0.72 * u, 0.22, 0.22], r * 0.6), W));
  }
  for (let k = 1; k < 5; k++) { const z = -0.22 + 0.44 * k / 5; g.add(mesh(line([0.34, 0.22, z], [0.46, 0.78, z * 1.22], r * 0.6), W)); g.add(mesh(line([-0.38, 0.22, z], [-0.5, 0.78, z * 1.22], r * 0.6), W)); }
  for (const yy of [0.41, 0.6]) { const k = (yy - 0.22) / 0.56; const xa = -0.38 - 0.12 * k, xb = 0.34 + 0.12 * k, zz = 0.22 + 0.05 * k; g.add(mesh(tube([[xa, yy, -zz], [xb, yy, -zz], [xb, yy, zz], [xa, yy, zz], [xa, yy, -zz]], r * 0.7, 12), W)); }
  // the handle (red plastic grip) and its uprights
  g.add(mesh(line([-0.5, 0.78, -0.27], [-0.62, 0.92, -0.27], r * 1.3), W)); g.add(mesh(line([-0.5, 0.78, 0.27], [-0.62, 0.92, 0.27], r * 1.3), W));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), redPlasticMat(), [-0.62, 0.92, 0], [Math.PI / 2, 0, 0]));
  // the child seat flap
  g.add(mesh(line([-0.46, 0.76, -0.24], [-0.3, 0.6, -0.24], r), W)); g.add(mesh(line([-0.46, 0.76, 0.24], [-0.3, 0.6, 0.24], r), W)); g.add(mesh(line([-0.3, 0.6, -0.24], [-0.3, 0.6, 0.24], r), W));
  // the chassis and castors
  for (const [x, z] of [[-0.36, -0.2], [0.32, -0.2], [-0.36, 0.2], [0.32, 0.2]]) {
    g.add(mesh(line([x, 0.22, z], [x, 0.07, z], r * 1.2), W));
    const wh = new THREE.LatheGeometry([[0.0, -0.02], [0.05, -0.022], [0.06, 0], [0.05, 0.022], [0, 0.02]].map(([a, b]) => new THREE.Vector2(a, b)), 8);
    g.add(mesh(wh, rubberMat(), [x, 0.05, z], [0, 0, Math.PI / 2]));
  }
  g.add(mesh(line([-0.36, 0.1, -0.2], [0.32, 0.1, -0.2], r), W)); g.add(mesh(line([-0.36, 0.1, 0.2], [0.32, 0.1, 0.2], r), W));
  return g;
}

/** an old brass diving helmet: the dome, three portholes (the front one barred), the corselet, bolts and the air elbow */
export function buildHelmet(): THREE.Group {
  const g = new THREE.Group(), B = brassMat();
  const dome = new THREE.LatheGeometry([[0.0, 0.62], [0.16, 0.6], [0.27, 0.53], [0.33, 0.42], [0.35, 0.3], [0.34, 0.18], [0.3, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  g.add(mesh(dome, B));
  const breast = new THREE.LatheGeometry([[0.3, 0.1], [0.36, 0.06], [0.46, 0.0], [0.5, -0.06], [0.48, -0.1], [0.3, -0.08]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  g.add(mesh(breast, B));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), B, [Math.cos(a) * 0.44, 0.0, Math.sin(a) * 0.44])); }
  const glass = glassMat('#5ac8c0', 'h');
  for (const [a, rr] of [[0, 0.13], [Math.PI / 2, 0.09], [-Math.PI / 2, 0.09]] as [number, number][]) {
    const port = new THREE.Group();
    port.add(mesh(new THREE.TorusGeometry(rr, 0.025, 4, 10), B));
    port.add(mesh(new THREE.CircleGeometry(rr * 0.95, 10), glass, [0, 0, -0.01]));
    if (a === 0) for (const dy of [-0.05, 0, 0.05]) port.add(mesh(new THREE.BoxGeometry(rr * 1.9, 0.014, 0.014), B, [0, dy, 0.012]));
    port.position.set(Math.sin(a) * 0.33, 0.36, Math.cos(a) * 0.33);
    port.rotation.y = a;
    g.add(port);
  }
  g.add(mesh(tube([[-0.2, 0.5, -0.22], [-0.3, 0.6, -0.3], [-0.42, 0.62, -0.3]], 0.035, 6, 5), B));
  g.add(mesh(new THREE.TorusGeometry(0.05, 0.015, 4, 8), B, [-0.44, 0.62, -0.3], [0, Math.PI / 2, 0]));
  return g;
}

/** a glass bottle: lathed body, shoulder, neck, lip, a cork, a peeling label */
export function buildBottle(col: string, key: string): THREE.Group {
  const g = new THREE.Group();
  const prof: [number, number][] = [[0, 0], [0.09, 0], [0.1, 0.03], [0.1, 0.26], [0.07, 0.33], [0.035, 0.38], [0.033, 0.48], [0.042, 0.5], [0.03, 0.52]];
  g.add(mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 8), glassMat(col, key)));
  g.add(mesh(new THREE.CylinderGeometry(0.028, 0.025, 0.06, 6), corkMat(), [0, 0.53, 0]));
  return g;
}

/** the ghost net: a sagging sheet of mesh with cork floats along the head rope */
export function buildNet(w = 2.4, h = 1.6, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h, 10, 7);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 2.1 + seed) * 0.18 + Math.cos(y * 2.7 + seed * 2) * 0.14);
    pos.setY(i, y - Math.pow(Math.abs(x) / (w / 2), 2) * 0.25 * (1 - (y + h / 2) / h));
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, netMat()));
  for (let k = 0; k < 5; k++) { const x = -w / 2 + (k + 0.5) * (w / 5); const fl = new THREE.LatheGeometry([[0, -0.07], [0.05, -0.06], [0.07, 0], [0.05, 0.06], [0, 0.07]].map(([a, b]) => new THREE.Vector2(a, b)), 6); g.add(mesh(fl, corkMat(), [x, h / 2 - Math.pow(Math.abs(x) / (w / 2), 2) * 0.0, Math.sin(x * 2.1 + seed) * 0.18], [0, 0, Math.PI / 2])); }
  return g;
}

/** a fish skeleton (the digested half): spine, ribs, a tail fan of rays */
export function buildRibs(L = 1.2): THREE.Group {
  const g = new THREE.Group(), M = boneMat();
  g.add(mesh(tube([[0, 0, 0], [-L * 0.35, 0.02, 0], [-L * 0.7, 0.0, 0]], 0.025, 8, 4), M));
  for (let k = 0; k < 8; k++) {
    const x = -k * L * 0.075 - 0.03, h = (0.22 - k * 0.018) * L;
    for (const z of [-1, 1]) g.add(mesh(tube([[x, 0, 0], [x - 0.04, -h * 0.55, z * h * 0.25], [x - 0.08, -h, z * h * 0.08]], 0.012, 5, 3), M));
    g.add(mesh(tube([[x, 0, 0], [x - 0.05, h * 0.45, 0]], 0.01, 2, 3), M));
  }
  for (let k = -3; k <= 3; k++) g.add(mesh(tube([[-L * 0.7, 0, 0], [-L * 0.82, k * 0.035, 0], [-L * 0.92, k * 0.07, 0]], 0.008, 3, 3), M));
  return g;
}

// ------------------------------------------------------------------ the sack
export interface JunkProp { obj: THREE.Object3D; x: number; y: number; z: number; bob: number; slide: number; rot: number }

export class Stomach {
  group = new THREE.Group();
  /** the fight box inside (walls x0 / x1, the floor and the roof); `base` keeps the rest position */
  box: Arena; base: Arena;
  cx: number; cy: number;
  acidY: number;
  /** 0..1 how hard the stomach is squeezing (a contraction); slide: metres the contents are shoved along x */
  squeeze = 0; slide = 0; tremble = 0;
  /** the valve: where it is, how open (0..1), a hit flash */
  valve = { x: 0, y: 0, open: 0.5, flash: 0 };
  gullet = { x: 0, y: 0 };
  junk: JunkProp[] = [];
  turtle: FishModel | null = null;
  turtleNet: THREE.Object3D | null = null;
  turtleProp: JunkProp | null = null;
  digest: FishModel | null = null;
  private wall: THREE.Mesh;
  private wallBase: Float32Array;
  private NU = 54; private NV = 34;
  private acidTop: THREE.Mesh; private acidFront: THREE.Mesh;
  private valveG = new THREE.Group(); private core: THREE.Mesh;
  private t = 0;
  private HX = 17; private R = 5.9; private RZ = 6.2;

  constructor(box: Arena) {
    this.base = { ...box }; this.box = { ...box };
    this.cx = (box.x0 + box.x1) / 2; this.cy = (box.floor + box.top) / 2;
    this.acidY = box.floor + 0.5;
    this.group.name = 'whaleStomach';
    // ---- the wall: an (x, theta) grid round the box; theta 0 = the roof over the front, PI/2 = the back, PI = floor
    const NU = this.NU, NV = this.NV;
    const geo = new THREE.BufferGeometry();
    const P = new Float32Array((NU + 1) * (NV + 1) * 3), UV = new Float32Array((NU + 1) * (NV + 1) * 2), idx: number[] = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const k = j * (NU + 1) + i;
      UV[k * 2] = (i / NU) * 9; UV[k * 2 + 1] = (j / NV) * 6;
      if (i < NU && j < NV) { const a = k, b = k + 1, c = k + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(P.length), 3));
    geo.setIndex(idx);
    this.wallBase = new Float32Array(P.length);
    this.wall = new THREE.Mesh(geo, fleshMat());
    this.wall.frustumCulled = false;
    this.wall.castShadow = false;
    this.wall.receiveShadow = true;
    this.group.add(this.wall);
    this.shapeWall(0);
    geo.computeVertexNormals();
    // ---- the acid: a glowing surface and its murky body in front of the play plane
    const W = (box.x1 - box.x0) + 10;
    const top = new THREE.PlaneGeometry(W, 9, 24, 4); top.rotateX(-Math.PI / 2);
    { const uv = top.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 4, uv.getY(i) * 9 / 4); }
    this.acidTop = mesh(top, acidMat(), [this.cx, this.acidY, -2.5]);
    this.acidTop.castShadow = false;
    const front = new THREE.PlaneGeometry(W, 1, 1, 1); front.translate(0, -0.5, 0);
    this.acidFront = new THREE.Mesh(front, acidBodyMat());
    this.acidFront.position.set(this.cx, this.acidY, 1.4);
    this.acidFront.renderOrder = 5;
    this.group.add(this.acidTop, this.acidFront);
    // ---- the valve (pyloric sphincter) in the right end wall, and the gullet at the top left
    this.valve.x = box.x1 + 0.6; this.valve.y = this.cy - 0.6;
    const lobes = new THREE.TorusGeometry(1.15, 0.55, 8, 16);
    const lp = lobes.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i), a = Math.atan2(y, x), k = 1 + Math.sin(a * 8) * 0.12; lp.setXYZ(i, x * k, y * k, lp.getZ(i) * (1 + Math.cos(a * 8) * 0.2)); }
    lobes.computeVertexNormals();
    this.valveG.add(mesh(lobes, valveMat()));
    this.core = mesh(new THREE.CircleGeometry(0.75, 12), coreMat(), [0, 0, -0.15]);
    this.valveG.add(this.core);
    // a halo of glowing bacteria round the sphincter
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; this.valveG.add(mesh(new THREE.CircleGeometry(0.09 + (k % 3) * 0.03, 5), coreMat(), [Math.cos(a) * 1.95, Math.sin(a) * 1.95, 0.25])); }
    this.valveG.position.set(this.valve.x, this.valve.y, -0.6);
    this.valveG.rotation.y = -Math.PI / 2 + 0.55;
    this.group.add(this.valveG);
    this.gullet.x = box.x0 + 6.5; this.gullet.y = box.top + 0.4;
    const gul = new THREE.LatheGeometry([[2.0, 0], [1.6, 0.4], [1.2, 1.2], [1.0, 2.4], [0.95, 4]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
    const gm = mesh(gul, throatMat(), [this.gullet.x, this.gullet.y - 0.4, -1.2]);
    (gm.material as THREE.Material).side = THREE.DoubleSide;
    this.group.add(gm);
    for (let k = 0; k < 3; k++) this.group.add(mesh(new THREE.TorusGeometry(1.7 - k * 0.25, 0.18, 4, 12), valveMat(), [this.gullet.x, this.gullet.y + k * 0.7 - 0.2, -1.2], [Math.PI / 2, 0, 0]));
    this.buildJunk();
    // strands of mucus hanging from the roof folds (they sway and stretch with the squeeze)
    const mu = pixMat('wsMucus', 8, 32, (x, y) => band(C(x === 2 ? '#ffd0c8' : '#d88890'), 1 - y / 64, x, y), { rough: 0.4, glow: (_x, y) => (y > 26 ? C('#3a1418') : null), emissive: 0.6 });
    for (let k = 0; k < 7; k++) {
      const x = box.x0 + 2 + k * (box.x1 - box.x0 - 4) / 6 + Math.sin(k * 7.1) * 1.2, z = -1.5 - (k % 3) * 1.4, len = 1.4 + (k * 37 % 5) * 0.5;
      const g = new THREE.Group();
      g.add(mesh(tube([[0, 0, 0], [0.12, -len * 0.5, 0.05], [0, -len, 0]], 0.07, 6, 4), mu));
      g.add(mesh(new THREE.SphereGeometry(0.13, 5, 4), mu, [0, -len - 0.05, 0]));
      g.position.set(x, box.top + 1.6, z);
      this.group.add(g);
      this.strands.push({ g, x, ph: k * 1.7 });
    }
  }
  private strands: { g: THREE.Group; x: number; ph: number }[] = [];

  /**
   * wall vertices for this frame: the rugae (gut ridges, meandering along the stomach) pulse, a peristaltic wave rolls
   * through, the squeeze pinches it all in. Colours follow the folds: dark wet valleys, pink crests, the passing wave
   * and a squeeze flush brighter
   */
  private shapeWall(t: number) {
    const NU = this.NU, NV = this.NV, g = this.wall.geometry;
    const P = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const Cc = (g.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const x0 = this.cx - this.HX - 1, x1 = this.cx + this.HX + 1, th0 = -0.62, th1 = Math.PI + 0.62;
    const sq = this.squeeze, tr = this.tremble;
    for (let j = 0; j <= NV; j++) {
      const th = th0 + (th1 - th0) * (j / NV);
      for (let i = 0; i <= NU; i++) {
        const x = x0 + (x1 - x0) * (i / NU);
        const xn = clamp((x - this.cx - this.slide * 0.6) / (this.HX + 1), -1, 1);
        const kx = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(xn), 3.2)), 1 / 3.2);
        const s = Math.sin(th * 9 + Math.sin(x * 0.19 + th * 2) * 1.1 + Math.sin(x * 0.07) * 0.8);
        const ruga = Math.pow(Math.max(0, s), 1.6);                       // 0 valley .. 1 crest
        const wave = Math.max(0, Math.sin(t * 2.2 - x * 0.45));
        const throb = 1 + 0.25 * Math.sin(t * 1.7 + x * 0.3);
        const peri = 1 + 0.05 * wave - sq * 0.15 * (0.6 + 0.4 * Math.sin(x * 0.5 - t * 6)) + tr * 0.03 * Math.sin(t * 40 + i + j);
        const R = (this.R * peri + ruga * 0.85 * throb) * kx;
        const Rz = (this.RZ * peri + ruga * 0.85 * throb) * kx;
        const k = (j * (NU + 1) + i) * 3;
        P[k] = x + this.slide * 0.35 * kx;
        P[k + 1] = this.cy + 0.3 + R * Math.cos(th) * 1.0;
        P[k + 2] = -Rz * Math.sin(th) - 0.8 * (1 - kx);
        // fold colour (multiplies the pale flesh page)
        const lit = 0.13 + 0.72 * ruga + 0.25 * wave * ruga + sq * 0.2;
        Cc[k] = Math.min(1.1, lit * 0.95 + 0.03);
        Cc[k + 1] = lit * (0.3 + 0.16 * ruga) * (1 - sq * 0.2);
        Cc[k + 2] = lit * (0.36 + 0.12 * ruga);
      }
    }
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  private place(o: THREE.Object3D, x: number, y: number, z: number, rot: [number, number, number], s: number, bob = 0.5, slide = 1) {
    o.position.set(x, y, z); o.rotation.set(...rot); o.scale.multiplyScalar(s);
    this.group.add(o);
    this.junk.push({ obj: o, x, y, z, bob, slide, rot: rot[2] });
  }

  private buildJunk() {
    const b = this.box, f = b.floor, cx = this.cx;
    // the big pieces on the floor, half in the acid, and against the back wall
    this.place(buildTyre(), cx - 5.6, f + 0.9, -1.6, [0.35, 0.5, 0.15], 2.8, 0.3);
    this.place(buildCart(), cx + 4.4, f + 0.5, -2.2, [0.3, -0.5, 1.25], 3.0, 0.15, 0.6);
    this.place(buildHelmet(), cx + 0.9, f + 1.0, -1.2, [0.15, 0.6, 0.35], 2.4, 0.25);
    this.place(buildNet(4.6, 3.0, 2), cx - 2.2, f + 3.4, -3.4, [0.1, 0.2, 0.25], 1.1, 0.6, 0.4);
    this.place(buildNet(3.4, 2.2, 5), cx + 8.4, f + 4.0, -3.2, [0, -0.4, -0.3], 1.1, 0.7, 0.4);
    this.place(buildBottle('#3aa858', 'g'), cx - 2.8, f + 1.0, -0.6, [0.2, 0.3, 1.35], 2.6, 1.0);
    this.place(buildBottle('#a8602a', 'b'), cx + 2.6, f + 1.2, -0.8, [0.4, 0, -1.1], 2.4, 1.1);
    this.place(buildBottle('#5ab8d8', 'c'), cx - 8.6, f + 1.4, -1.2, [0, 0.6, 0.6], 2.2, 1.2);
    const items: [string, number, number, number, [number, number, number], number][] = [
      ['oldBoot', cx - 4.0, f + 1.1, -0.6, [0.2, 0.5, -0.4], 1.5],
      ['tackleBox', cx + 7.0, f + 0.6, -1.6, [0.1, -0.4, 0.3], 1.2],
      ['scubaTank', cx - 9.8, f + 1.4, -3.0, [0, 0.3, 1.1], 1.5],
      ['rubberDuck', cx + 1.4, f + 1.2, -0.4, [0, 0.4, 0.2], 0.9],
      ['teacup', cx + 9.6, f + 1.0, -0.8, [0.3, 0, 0.5], 0.8],
    ];
    for (const [id, x, y, z, r, s] of items) { try { this.place(itemModel(id, { cell: 0.8 }), x, y + 0.3, z * 0.7, r, s, 1); } catch { /* a model that failed to build is just not there */ } }
    // the half-digested fish: a grouper, pale and blistered, its back half already bones
    const dg = buildFish('grouper', 3);
    dg.group.scale.setScalar(2.8);
    dg.flash(0.45, '#c8d8a0');
    const holder = new THREE.Group();
    holder.add(dg.group);
    const ribs = buildRibs(1.6);
    ribs.position.set(-0.15, 0.05, 0);
    holder.add(ribs);
    this.place(holder, cx - 0.4, f + 0.8, -0.5, [Math.PI / 2 - 0.25, 0, -0.18], 1, 0.4, 1);
    this.digest = dg;
    // hide the grouper's back half: clip by squashing its tail end into the acid (a lean back and down)
    dg.group.position.set(0.25, 0, 0);
    // the trapped turtle in a scrap of net (free it for a reward)
    const tu = buildFish('sea_turtle', 7);
    tu.group.scale.setScalar(2.2);
    const tg = new THREE.Group(); tg.add(tu.group);
    const tn = buildNet(1.8, 1.4, 9); tn.position.set(0, 0.05, 0.45); tg.add(tn);
    this.place(tg, b.x0 + 4.2, f + 2.6, -0.4, [0, 0.5, 0.1], 1, 0.35, 1);
    this.turtle = tu; this.turtleNet = tn; this.turtleProp = this.junk[this.junk.length - 1];
  }

  /** world position of the trapped turtle */
  turtlePos() { const j = this.turtleProp; return j ? { x: j.obj.position.x, y: j.obj.position.y } : { x: this.box.x0 + 4, y: this.box.floor + 2.6 }; }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.shapeWall(t);
    this.box.x0 = this.base.x0 + this.slide + this.squeeze * 1.6;
    this.box.x1 = this.base.x1 + this.slide - this.squeeze * 1.6;
    // acid: surface ripples, sloshing toward the shove
    const ap = this.acidTop.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < ap.count; i++) { const x = ap.getX(i), z = ap.getZ(i); ap.setY(i, Math.sin(x * 0.9 + t * 2.4 + z) * 0.08 + Math.sin(x * 0.37 - t * 1.3) * 0.12 + this.slide * x * -0.02); }
    ap.needsUpdate = true;
    const mm = this.acidTop.material as THREE.MeshStandardMaterial;
    if (mm.map) { mm.map.offset.x = (t * 0.05) % 1; }
    this.acidTop.position.set(this.cx + this.slide, this.acidY, -2.5);
    this.acidFront.position.set(this.cx + this.slide, this.acidY + 0.05, 1.4);
    this.acidFront.scale.y = Math.max(0.01, this.acidY - this.base.floor + 1.5);
    // the valve: breathes open and shut, flashes white when struck
    this.valve.flash = Math.max(0, this.valve.flash - dt * 4);
    const op = this.valve.open;
    this.valveG.position.set(this.valve.x + this.slide - this.squeeze * 1.2, this.valve.y, -0.6);
    this.valveG.scale.setScalar(1 + Math.sin(t * 3) * 0.04 + this.valve.flash * 0.12 - this.squeeze * 0.1);
    this.core.scale.setScalar(0.35 + op * 0.75 + Math.sin(t * 6) * 0.05);
    (this.core.material as THREE.MeshBasicMaterial).color.setScalar(1.3 + op * 0.6 + this.valve.flash * 2);
    // the flesh glows brighter as it squeezes
    const fm = this.wall.material as THREE.MeshStandardMaterial;
    fm.emissiveIntensity = 1.2 + Math.sin(t * 1.4) * 0.3 + this.squeeze * 1.5;
    // junk bobs in the acid and slides with the shove
    for (const j of this.junk) {
      j.obj.position.x = j.x + this.slide * j.slide;
      j.obj.position.y = j.y + Math.sin(t * 1.1 + j.x) * 0.06 * j.bob + Math.max(0, this.acidY - j.y - 0.3) * 0.25;
      j.obj.rotation.z = j.rot + Math.sin(t * 0.8 + j.x) * 0.04 * j.bob + this.slide * 0.015 * j.slide;
    }
    for (const st of this.strands) { st.g.position.x = st.x + this.slide * 0.5; st.g.rotation.z = Math.sin(t * 0.9 + st.ph) * 0.12 + this.slide * 0.03; st.g.scale.y = 1 + this.squeeze * 0.35 + Math.sin(t * 1.3 + st.ph) * 0.05; }
    this.digest?.update(dt, 0, 0);
    if (this.turtle) this.turtle.update(dt, this.turtleNet?.visible ? 0.6 + Math.sin(t * 5) * 0.4 : 1.2, 0);
  }

  dispose() {
    this.group.removeFromParent();
    this.wall.geometry.dispose(); this.acidTop.geometry.dispose(); this.acidFront.geometry.dispose();
    this.digest?.dispose(); this.turtle?.dispose();
  }
}
