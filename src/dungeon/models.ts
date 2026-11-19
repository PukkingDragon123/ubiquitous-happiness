// Dungeon props, PS2 blocky low-poly: flat-shaded, matte, clean hand-placed pages (no noise, no dither).
//
//   arenaGateModel(area, kind, h)  a fence of the area's bars (coral, kelp, iron, ice, bone) that grows out of the
//                           sand to seal an arena side; 'challenge' adds a skull pike, 'boss' a jawed skull arch
//   crackedPlug(area)       the cracked rock lid over a secret pit (bomb it)
//   padlock()               for locked chests
//   pedestalModel(area)     carved plinth an item floats over
//   chestModel()            iron-banded chest with a lid pivot
//   keyModel() bombModel() pearlModel(v) heartModel(half)  pickups
//   floorHatch()            the boss room's exit: a round porthole hatch in the floor with a wheel
//   postBox()               the post office's pillar box
//
// Materials are cached per page; geometry is per instance (dispose it with disposeModel()).
import * as THREE from 'three';
import { Px, hex, type RGB } from '../gfx/px';
import { psxMat } from '../player/psx';
import { ctex, T, tone, bevel, rivet, rust, type Tones } from '../skills/texkit';
import { chamferBox, lpCyl, lpCone, lpSphere, facet, boxUV } from '../gfx/lowpoly';
import { hash2 } from '../core/math';
import { measure, glyphs } from '../ui/pixel/font';

const TAU = Math.PI * 2;
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function M(key: string, map: () => THREE.Texture | null, o: Parameters<typeof psxMat>[1] = {}): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (!m) { m = psxMat(map(), o); m.userData.shared = true; matCache.set(key, m); }
  return m;
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true) {
  const me = new THREE.Mesh(g.index ? facet(g) : g, m);
  me.castShadow = cast; me.receiveShadow = true;
  return me;
}
/** dispose an instance's geometries (materials are shared) */
export function disposeModel(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mt = m.material as THREE.MeshStandardMaterial;
    if (mt.userData?.shared) return;
    // a texture painted for this one instance (a sign's board face) goes with it
    for (const t of [mt.map, mt.emissiveMap]) if (t?.userData?.own) t.dispose();
    mt.dispose();
  });
}

// ------------------------------------------------------------------ pages
const PAL: Record<string, Tones> = {
  coral: ['#4a0e16', '#8a2226', '#c8483a', '#ec7a52', '#ffb48a', '#ffe0c4'],
  coralP: ['#3a0e2a', '#6e1e4a', '#a8366e', '#d85e94', '#f49ac0', '#ffd8ea'],
  kelp: ['#1a1a08', '#33310e', '#55501a', '#7a7226', '#a29a3a', '#cac060'],
  rustI: ['#170c08', '#2e1a12', '#4a2c1e', '#6c4228', '#925a32', '#b8804a'],
  ice: ['#123a5a', '#2a6a96', '#4e9cc8', '#86ccec', '#c6ecff', '#f4ffff'],
  bone: ['#2a2218', '#504434', '#7c6e58', '#a89c80', '#d2c8ac', '#f2ead4'],
  stone: ['#16161a', '#2c2c32', '#46464e', '#64646c', '#8a8a92', '#b4b4ba'],
  red: ['#2a0406', '#5a0a0e', '#9a1418', '#e02820', '#ff6a3a', '#ffd0a0'],
};

/** branching coral bar: banded cylinder with rows of polyp pits */
const coralPage = (pal: Tones, key: string) => ctex('dg.' + key, 32, 64, (p) => {
  for (let x = 0; x < 32; x++) {
    const k = x / 31, t = k < 0.1 ? 1 : k < 0.28 ? 3 : k < 0.4 ? 4 : k < 0.7 ? 2 : k < 0.88 ? 1.4 : 0.6;
    for (let y = 0; y < 64; y++) p.set(x, y, tone(pal, t));
  }
  for (let y = 3; y < 64; y += 6) for (let x = 2 + ((y / 6) % 2) * 3; x < 30; x += 6) {
    p.set(x, y, tone(pal, 0)); p.set(x + 1, y, tone(pal, 1)); p.set(x, y - 1, tone(pal, 5)); p.set(x + 1, y + 1, tone(pal, 1));
  }
});
const kelpPage = () => ctex('dg.kelp', 16, 64, (p) => {
  for (let x = 0; x < 16; x++) { const t = x < 2 ? 1 : x < 5 ? 3 : x < 7 ? 4 : x < 12 ? 2 : 1; for (let y = 0; y < 64; y++) p.set(x, y, tone(PAL.kelp, t)); }
  for (let y = 0; y < 64; y += 11) { for (let x = 0; x < 16; x++) { p.set(x, y, tone(PAL.kelp, 0)); p.set(x, y + 1, tone(PAL.kelp, 3)); } }
});
const ironPage = () => ctex('dg.iron', 32, 32, (p) => {
  bevel(p, 0, 0, 32, 32, PAL.rustI, 2);
  for (let y = 4; y < 32; y += 8) for (let x = 3; x < 32; x += 9) rivet(p, x, y, PAL.rustI);
  rust(p, 9, 7, 9); rust(p, 22, 13, 12); rust(p, 15, 22, 6);
  for (let x = 0; x < 32; x++) { p.set(x, 15, tone(PAL.rustI, 1)); p.set(x, 16, tone(PAL.rustI, 4)); }
});
const icePage = () => ctex('dg.ice', 32, 64, (p) => {
  for (let x = 0; x < 32; x++) { const k = x / 31, t = k < 0.15 ? 2 : k < 0.3 ? 4 : k < 0.38 ? 5 : k < 0.75 ? 3 : 2; for (let y = 0; y < 64; y++) p.set(x, y, tone(PAL.ice, t)); }
  for (const [x0, y0, len] of [[6, 8, 14], [20, 30, 18], [12, 48, 10]] as const) for (let i = 0; i < len; i++) p.set(x0 + Math.round(Math.sin(i * 0.7) * 2), y0 + i, tone(PAL.ice, 5));
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 32; x++) if ((x + y) % 7 < 3) p.set(x, y, tone(PAL.ice, 1));
});
const bonePage = () => ctex('dg.bone', 32, 32, (p) => {
  for (let x = 0; x < 32; x++) { const t = x < 3 ? 1 : x < 9 ? 3 : x < 13 ? 5 : x < 24 ? 4 : x < 29 ? 2 : 1; for (let y = 0; y < 32; y++) p.set(x, y, tone(PAL.bone, t)); }
  for (const [x, y] of [[6, 5], [18, 12], [10, 22], [24, 26], [15, 3]] as const) { p.set(x, y, tone(PAL.bone, 0)); p.set(x + 1, y, tone(PAL.bone, 1)); p.set(x, y + 1, tone(PAL.bone, 1)); }
  for (let y = 0; y < 32; y += 10) for (let x = 0; x < 32; x++) if (x % 3) p.set(x, y, tone(PAL.bone, 2));
});
/** carved stone blocks with bevelled joints */
const stonePage = (tint: string, key: string) => ctex('dg.stone.' + key, 64, 64, (p) => {
  const base = hex(tint);
  const ts: Tones = [0.32, 0.5, 0.66, 0.8, 0.94, 1.08].map((k) => '#' + base.map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join(''));
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 3; col++) {
      const x = col * 32 + off, y = row * 16;
      bevel(p, x, y, 32, 16, ts, 3);
      // a chip and a worn edge, placed by hash so blocks differ
      const h = hash2(col + 9, row, 7);
      if (h > 0.5) { p.set(x + 6 + Math.floor(h * 18), y + 4, tone(ts, 1)); p.set(x + 7 + Math.floor(h * 18), y + 4, tone(ts, 1)); p.set(x + 6 + Math.floor(h * 18), y + 5, tone(ts, 5)); }
      if (h < 0.3) for (let i = 0; i < 6; i++) p.set(x + 20 + i, y + 9 + (i % 2), tone(ts, 2));
    }
  }
});
const goldPage = () => ctex('dg.gold', 32, 16, (p) => {
  for (let y = 0; y < 16; y++) { const t = y < 2 ? 4 : y < 5 ? 3 : y < 11 ? 2 : y < 14 ? 1 : 0; for (let x = 0; x < 32; x++) p.set(x, y, tone(T.gold, t)); }
  for (let x = 2; x < 32; x += 8) { p.set(x, 7, tone(T.gold, 4)); p.set(x + 1, 8, tone(T.gold, 0)); }
});
const woodPage = () => ctex('dg.wood', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const pl = x % 8; p.set(x, y, tone(T.oak, pl === 0 ? 0 : pl === 1 ? 3 : pl === 7 ? 1 : 2)); }
  for (let k = 0; k < 4; k++) for (let y = 0; y < 32; y++) if (hash2(k, Math.floor(y / 5), 3) > 0.3) p.set(k * 8 + 3 + Math.round(Math.sin(y * 0.3 + k) * 1.2), y, tone(T.oak, 1));
});
const crackPage = (tint: string, key: string) => ctex('dg.crack.' + key, 64, 64, (p) => {
  const base = hex(tint);
  const ts: Tones = [0.3, 0.48, 0.64, 0.8, 0.95, 1.1].map((k) => '#' + base.map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join(''));
  // big flat facets of tone
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const c = Math.floor(x / 21) + Math.floor(y / 21) * 3; p.set(x, y, tone(ts, 2 + (hash2(c, 1, 5) > 0.5 ? 1 : 0))); }
  // the crack: a branching dark seam with a lit lip
  const seam = (x0: number, y0: number, dx: number, n: number) => { let x = x0; for (let y = y0; y < y0 + n && y < 64; y++) { x += dx * (hash2(y, x0, 3) > 0.5 ? 1 : 0) - (hash2(y, x0, 4) > 0.8 ? dx : 0); p.set(x, y, tone(ts, 0)); p.set(x + 1, y, tone(ts, 0)); p.set(x - 1, y, tone(ts, 5)); } return x; };
  const xm = seam(30, 0, 1, 34); seam(xm, 34, -1, 30); seam(xm, 30, 1, 20); seam(14, 18, 1, 16);
});
const brassPage = () => ctex('dg.brass', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(T.brass, x < 3 ? 2 : x < 6 ? 4 : x < 11 ? 3 : 1)); });
const pufferPage = () => ctex('dg.puffer', 64, 32, (p) => {
  // a pufferfish skin wrapped round the bomb: sandy back with dark saddles, pale belly, a painted eye each side
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    let t = y < 10 ? 2 : y < 20 ? 3 : 5;
    const saddle = Math.floor(x / 8) % 2 === 0 && y < 14 && y > 3;
    let c = tone(T.yellow, t);
    if (saddle) c = tone(T.olive, 1);
    if (y > 20) c = tone(T.bone, 4);
    if (y === 20) c = tone(T.olive, 2);
    p.set(x, y, c); void t; t = 0;
  }
  for (const ex of [16, 48]) { p.ellipse(ex, 13, 3.4, 3.4, '#fff8e0'); p.ellipse(ex + 0.6, 13.4, 1.8, 2.2, '#101010'); p.set(ex - 1, 12, '#ffffff'); }
});

const AREA_STONE: Record<string, string> = { reef: '#c8b49a', kelp: '#8a8670', graveyard: '#7a7a6a', arctic: '#a8b8c8', abyss: '#4a5266' };

// ------------------------------------------------------------------ arena gates
export type GateKind = 'arena' | 'challenge' | 'boss';
export interface GateModel {
  root: THREE.Group;
  /** the bar columns, each rising on its own (staggered) */
  cols: THREE.Group[];
  /** decoration that stays put (the boss skull arch) */
  frame: THREE.Group;
  /** glowing bits (boss eyes) */
  glow: THREE.Mesh[];
  /** height of the barrier */
  h: number;
}

function barMat(area: string): THREE.MeshStandardMaterial {
  switch (area) {
    case 'kelp': return M('bar.kelp', kelpPage, { rough: 0.9, emissive: '#3a3a10', emissiveK: 0.35 });
    case 'graveyard': return M('bar.iron', ironPage, { rough: 0.75, metal: 0.25 });
    case 'arctic': return M('bar.ice', icePage, { rough: 0.35, emissive: '#2a6a9a', emissiveK: 0.25 });
    case 'abyss': return M('bar.bone', bonePage, { rough: 0.8, emissive: '#1a3a5a', emissiveK: 0.15 });
    default: return M('bar.coral', () => coralPage(PAL.coral, 'coral'), { rough: 0.85 });
  }
}

/** one bar of the area's kind, height h, standing on y = 0 (the tip at the top) */
function barGeo(area: string, h: number, seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const r = 0.13 + hash2(seed, 1, 3) * 0.04;
  const segs = Math.max(2, Math.round(h / 2));
  switch (area) {
    case 'kelp': {
      // a kelp stipe with blades every couple of metres and a float bulb at the tip
      const g = lpCyl(r * 0.8, h, 6, r * 0.6, segs); g.translate(0, h / 2, 0); out.push(g);
      for (let y = 1.2; y < h - 0.6; y += 1.6 + hash2(seed, y, 2) * 0.8) { const sgn = hash2(seed, y, 5) > 0.5 ? 1 : -1; const b = new THREE.BoxGeometry(0.05, 0.9, 0.34); b.rotateZ(0.55 * sgn); b.translate(sgn * 0.26, y, 0); out.push(b); }
      const bulb = lpSphere(r * 1.6, 0); bulb.translate(0, h + 0.1, 0); out.push(bulb);
      break;
    }
    case 'graveyard': {
      const g = boxUV(new THREE.BoxGeometry(r * 1.4, h, r * 1.4), 1.4); g.translate(0, h / 2, 0); out.push(g);
      const tip = lpCone(r * 1.2, 0.45, 4); tip.translate(0, h + 0.2, 0); out.push(tip);
      break;
    }
    case 'arctic': {
      const g = lpCyl(r * 1.3, h, 5, r * 0.7, segs); g.translate(0, h / 2, 0); out.push(g);
      const tip = lpCone(r * 0.7, 0.6, 5); tip.translate(0, h + 0.28, 0); out.push(tip);
      break;
    }
    case 'abyss': {
      const g = lpCyl(r * 1.4, h, 6, r * 0.5, segs); g.translate(0, h / 2, 0); out.push(g);
      const tip = lpCone(r * 0.5, 0.5, 6); tip.translate(0, h + 0.24, 0); out.push(tip);
      break;
    }
    default: {
      // a coral branch: a trunk with knobbly side branches all the way up
      const g = lpCyl(r, h, 6, r * 0.75, segs); g.translate(0, h / 2, 0); out.push(g);
      for (let y = 0.8; y < h - 0.5; y += 1.3 + hash2(seed, y, 3) * 0.9) {
        const s2 = hash2(seed, y, 4) > 0.5 ? 1 : -1;
        const b = lpCyl(r * 0.55, 0.6, 5, r * 0.4); b.translate(0, 0.3, 0); b.rotateZ(-s2 * 0.75); b.translate(s2 * 0.05, y, 0); out.push(b);
        const knob = lpSphere(r * 0.6, 0); knob.translate(s2 * 0.42, y + 0.44, 0); out.push(knob);
      }
      const knob = lpSphere(r * 0.9, 0); knob.translate(0, h, 0); out.push(knob);
    }
  }
  return out;
}

/**
 * An arena gate: a fence band of the area's bars (coral, kelp, rusted iron, ice, bone) that grows up out of the
 * sand to seal one side of an encounter. Built around x = 0, standing on y = 0, height h; columns spread over
 * x in [-0.7, 0.7] and rows across z so the front reads as a barrier. The boss kind adds a jawed skull arch.
 */
export function arenaGateModel(area: string, kind: GateKind, h: number): GateModel {
  const root = new THREE.Group();
  const frame = new THREE.Group();
  root.add(frame);
  const glow: THREE.Mesh[] = [];
  const mat = kind === 'boss' ? M('bar.boss', ironPage, { rough: 0.6, metal: 0.3, color: '#6a4a44' }) : barMat(area);
  const xs = [-0.55, 0, 0.55], zs = [-1.3, -0.45, 0.4, 1.25];
  const cols: THREE.Group[] = [];
  xs.forEach((cx, ci) => {
    const g = new THREE.Group();
    zs.forEach((z, zi) => {
      const hh = h + (hash2(ci, zi, 3) - 0.5) * 0.8;
      for (const geo of barGeo(kind === 'boss' ? 'graveyard' : area, hh, ci * 7 + zi)) { const m = mesh(geo, mat); m.position.set(cx + (zi % 2 ? 0.12 : -0.12), 0, z); g.add(m); }
    });
    root.add(g); cols.push(g);
  });
  // crossbars at the front and the back every couple of metres: a ladder face that reads as a barrier from the side
  if (area !== 'abyss' || kind === 'boss') {
    const rails = new THREE.Group();
    for (let y = 1.4; y < h - 0.6; y += 2.4) for (const z of [-1.3, 1.25]) { const rail = mesh(boxUV(new THREE.BoxGeometry(1.5, 0.14, 0.16), 2), mat); rail.position.set(0, y, z); rails.add(rail); }
    cols[1].add(rails);
  }
  if (kind === 'challenge') {
    // a skull on a pike in front: a fight worth having in here
    const iron = M('bar.iron', ironPage, { rough: 0.75, metal: 0.25 });
    const pike = mesh(boxUV(new THREE.BoxGeometry(0.1, 3.2, 0.1), 2), iron); pike.position.set(0, 1.6, 2.2); frame.add(pike);
    const skull = skullHead(0.7); skull.position.set(0, 3.4, 2.2); frame.add(skull);
  } else if (kind === 'boss') {
    // a huge jawed skull arch over the way in: cranium, horns, fangs, glowing red sockets
    const bone = M('bossBone', bonePage, { rough: 0.85 });
    const dark = M('dark', () => null, { color: '#120808', rough: 1 });
    const H = 6.5;
    const cap = mesh(lpSphere(2.6, 1), bone); cap.scale.set(1.3, 0.8, 0.55); cap.position.set(0, H + 1.4, 1.9); frame.add(cap);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(lpSphere(0.42, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(2.2) }));
      eye.position.set(s * 1.0, H + 1.5, 3.2); frame.add(eye); glow.push(eye);
      const sock = mesh(lpCyl(0.7, 0.4, 6), dark); sock.rotation.x = Math.PI / 2; sock.position.set(s * 1.0, H + 1.5, 3.0); frame.add(sock);
      const jaw = mesh(chamferBox(1.0, H + 1.2, 1.1, 0.16), bone); jaw.position.set(s * 2.3, (H + 1.2) / 2 - 0.4, 1.9); jaw.rotation.z = s * 0.07; frame.add(jaw);
      for (let k = 0; k < 3; k++) { const f = mesh(lpCone(0.26, 1.1, 4), bone); f.rotation.x = Math.PI; f.position.set(s * (0.4 + k * 0.55), H + 0.25, 2.6); frame.add(f); }
      const horn = mesh(lpCone(0.6, 3.0, 5), bone); horn.rotation.z = -s * 0.9; horn.position.set(s * 3.4, H + 3.0, 1.7); frame.add(horn);
      const tusk = mesh(lpCone(0.3, 1.4, 4), bone); tusk.position.set(s * 1.7, 0.6, 2.6); frame.add(tusk);
    }
    const nose = mesh(lpCone(0.4, 0.7, 3), dark); nose.rotation.x = Math.PI; nose.position.set(0, H + 0.95, 3.1); frame.add(nose);
  }
  return { root, cols, frame, glow, h };
}

/** a brass padlock (locked chests) */
export function padlock(): THREE.Group {
  const g = new THREE.Group();
  const brass = M('brass', brassPage, { rough: 0.35, metal: 0.35, emissive: '#2a1800', emissiveK: 0.3 });
  const body = mesh(chamferBox(0.5, 0.42, 0.22, 0.06), brass); g.add(body);
  const shackle = mesh(facet(new THREE.TorusGeometry(0.16, 0.045, 4, 8, Math.PI)), M('steel', () => null, { color: '#a8b0b8', rough: 0.35, metal: 0.35 })); shackle.position.y = 0.2; g.add(shackle);
  const hole = mesh(lpCyl(0.05, 0.06, 6), M('dark', () => null, { color: '#120808', rough: 1 })); hole.rotation.x = Math.PI / 2; hole.position.set(0, -0.02, 0.11); g.add(hole);
  const slot = mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), M('dark', () => null, { color: '#120808', rough: 1 })); slot.position.set(0, -0.09, 0.11); g.add(slot);
  return g;
}

function skullHead(s: number): THREE.Group {
  const g = new THREE.Group();
  const bone = M('bossBone', bonePage, { rough: 0.85 });
  const dark = M('dark', () => null, { color: '#120808', rough: 1 });
  const head = mesh(lpSphere(s * 0.5, 1), bone); head.scale.set(1, 0.9, 0.8); g.add(head);
  const jaw = mesh(chamferBox(s * 0.6, s * 0.3, s * 0.5, s * 0.06), bone); jaw.position.set(0, -s * 0.42, s * 0.05); g.add(jaw);
  for (const x of [-1, 1]) { const e = mesh(lpSphere(s * 0.14, 0), dark); e.position.set(x * s * 0.18, -s * 0.02, s * 0.36); g.add(e); }
  return g;
}

// ------------------------------------------------------------------ cracked wall plug (secret passages)
export function crackedPlug(area: string, w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const tint = { reef: '#a89878', kelp: '#6a6658', graveyard: '#5a5a4e', arctic: '#8a9aaa', abyss: '#343a48' }[area] ?? '#7a7a70';
  const m = M('crack.' + area, () => crackPage(tint, area), { rough: 0.95 });
  // a few big wedge blocks so it breaks into chunks
  const cols = 2, rowsN = 3;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rowsN; j++) {
    const b = mesh(chamferBox(w / cols + 0.06, h / rowsN + 0.06, d, 0.12), m);
    b.position.set((i - (cols - 1) / 2) * (w / cols), (j + 0.5) * (h / rowsN), 0);
    b.rotation.z = (hash2(i, j, 4) - 0.5) * 0.08;
    g.add(b);
  }
  return g;
}

// ------------------------------------------------------------------ pedestal
export function pedestalModel(area: string): THREE.Group {
  const g = new THREE.Group();
  const stone = M('frame.' + area, () => stonePage(AREA_STONE[area] ?? '#9a9a90', area), { rough: 0.9 });
  const gold = M('gold', goldPage, { rough: 0.4, metal: 0.35, emissive: '#3a2000', emissiveK: 0.3 });
  const base = mesh(chamferBox(1.1, 0.3, 1.1, 0.08), stone); base.position.y = 0.15; g.add(base);
  const shaft = mesh(lpCyl(0.32, 0.75, 8, 0.28), stone); shaft.position.y = 0.67; g.add(shaft);
  const band = mesh(lpCyl(0.34, 0.1, 8), gold); band.position.y = 0.62; g.add(band);
  const top = mesh(chamferBox(0.9, 0.2, 0.9, 0.06), stone); top.position.y = 1.12; g.add(top);
  const trim = mesh(boxUV(new THREE.BoxGeometry(0.94, 0.05, 0.94), 2), gold); trim.position.y = 1.0; g.add(trim);
  return g;
}

// ------------------------------------------------------------------ chest
export interface ChestModel { root: THREE.Group; lid: THREE.Group }
export type ChestKind = 'small' | 'locked' | 'big' | 'sunken' | 'elite';
/**
 * A chest, by kind: 'small' (plain planks + iron bands), 'locked' (a padlock on a brass hasp), 'big' (wide, gold
 * bands and corners, gems on the lid), 'sunken' (green-slimed planks, barnacles, a weed strand), 'elite' (red iron
 * bands: what a champion drops). The lid is a half barrel on a hinge at the back (rotate `lid.rotation.x` negative).
 */
export function chestModel(kind: ChestKind = 'small'): ChestModel & { lock: THREE.Object3D | null; glow: THREE.Mesh } {
  const root = new THREE.Group();
  const big = kind === 'big';
  const wood = kind === 'sunken' ? M('woodSunk', woodPage, { rough: 0.95, color: '#7e9a78' }) : M('wood', woodPage, { rough: 0.85 });
  const band = big ? M('gold', goldPage, { rough: 0.4, metal: 0.35, emissive: '#3a2000', emissiveK: 0.3 })
    : kind === 'elite' ? M('bar.redIron', ironPage, { rough: 0.6, metal: 0.3, color: '#c85a48' })
      : M('bar.iron', ironPage, { rough: 0.75, metal: 0.25 });
  const gold = M('gold', goldPage, { rough: 0.4, metal: 0.35, emissive: '#3a2000', emissiveK: 0.3 });
  const W = big ? 1.5 : kind === 'small' ? 0.85 : 1.1, H = big ? 0.72 : kind === 'small' ? 0.45 : 0.55, D = big ? 0.9 : kind === 'small' ? 0.58 : 0.7;
  const body = mesh(chamferBox(W, H, D, 0.05), wood); body.position.y = H / 2; root.add(body);
  const bx = [-W * 0.35, W * 0.35];
  for (const x of bx) { const b = mesh(boxUV(new THREE.BoxGeometry(0.1, H + 0.02, D + 0.04), 2), band); b.position.set(x, H / 2, 0); root.add(b); }
  // inside: dark, and a warm glow that shows when the lid swings up
  const inner = mesh(new THREE.BoxGeometry(W - 0.12, 0.04, D - 0.12), M('dark', () => null, { color: '#120808', rough: 1 })); inner.position.y = H - 0.03; root.add(inner);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, D - 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(big ? '#ffd870' : '#ffe8b0').multiplyScalar(1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = H + 0.005; root.add(glow);
  // the lid: a half barrel hinged at the back edge
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const barrel = new THREE.CylinderGeometry(D / 2, D / 2, W, 7, 1, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2);
  const top = mesh(barrel, wood); top.position.set(0, 0, D / 2); lid.add(top);
  for (const x of bx) { const lb = new THREE.CylinderGeometry(D / 2 + 0.03, D / 2 + 0.03, 0.1, 7, 1, false, 0, Math.PI); lb.rotateZ(Math.PI / 2); const m2 = mesh(lb, band); m2.position.set(x, 0, D / 2); lid.add(m2); }
  if (big) {
    // gold corners and three gems along the lid's crown
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = mesh(chamferBox(0.14, 0.16, 0.14, 0.03), gold); c.position.set(sx * (W / 2 - 0.04), 0.08, sz * (D / 2 - 0.04)); root.add(c); }
    ['#e8304a', '#40c8ff', '#7ae05a'].forEach((col, i) => { const g = mesh(lpSphere(0.07, 0), M('gem.' + col, () => null, { color: col, rough: 0.3, emissive: col, emissiveK: 0.5 })); g.position.set((i - 1) * 0.36, D / 2 + 0.01, D / 2); lid.add(g); });
  }
  if (kind === 'sunken') {
    const shell = M('barnacle', () => null, { color: '#d8ccb0', rough: 0.9 });
    for (let k = 0; k < 9; k++) { const b = mesh(lpCone(0.05 + (k % 3) * 0.015, 0.06, 5), shell); b.position.set(-W / 2 + 0.1 + ((k * 0.37) % 1) * (W - 0.2), (k % 2 ? 0.08 : H * 0.6), D / 2 + 0.01); b.rotation.x = Math.PI / 2; root.add(b); }
    const weed = mesh(new THREE.BoxGeometry(0.04, 0.6, 0.02), M('weed', () => null, { color: '#4a7a2a', rough: 0.9 })); weed.position.set(W / 2 - 0.1, H + 0.25, D / 2 - 0.1); weed.rotation.z = -0.3; lid.add(weed);
  }
  root.add(lid);
  let lock: THREE.Object3D | null = null;
  if (kind === 'locked') {
    const hasp = mesh(chamferBox(0.16, 0.2, 0.06, 0.02), gold); hasp.position.set(0, H - 0.04, D / 2 + 0.03); root.add(hasp);
    lock = padlock(); lock.position.set(0, H - 0.22, D / 2 + 0.1); lock.scale.setScalar(0.75); root.add(lock);
  } else {
    const plate = mesh(chamferBox(0.18, 0.2, 0.06, 0.02), big ? gold : band); plate.position.set(0, H - 0.05, D / 2 + 0.03); root.add(plate);
  }
  return { root, lid, lock, glow };
}

// ------------------------------------------------------------------ pickups
export function keyModel(): THREE.Group {
  const g = new THREE.Group();
  const brass = M('brass', brassPage, { rough: 0.35, metal: 0.35, emissive: '#3a2400', emissiveK: 0.35 });
  const bow = mesh(facet(new THREE.TorusGeometry(0.11, 0.04, 4, 8)), brass); bow.position.x = -0.2; g.add(bow);
  const shaft = mesh(boxUV(new THREE.BoxGeometry(0.34, 0.05, 0.05), 4), brass); shaft.position.x = 0.04; g.add(shaft);
  for (const [x, h] of [[0.15, 0.1], [0.2, 0.07]] as const) { const t = mesh(new THREE.BoxGeometry(0.035, h, 0.05), brass); t.position.set(x, -h / 2 - 0.01, 0); g.add(t); }
  return g;
}
export function bombModel(): THREE.Group {
  const g = new THREE.Group();
  const skin = M('puffer', pufferPage, { rough: 0.7 });
  const spineM = M('spine', () => null, { color: '#e8dcb0', rough: 0.6 });
  const bg: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.22, 1);
  // wrap the skin round the ball (equirectangular uvs from the normal)
  const pos = bg.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); uv[i * 2] = 0.5 + Math.atan2(z, x) / TAU; uv[i * 2 + 1] = 0.5 + Math.asin(Math.max(-1, Math.min(1, y / 0.22))) / Math.PI; }
  bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const body = new THREE.Mesh(facet(bg), skin);
  body.castShadow = true;
  g.add(body);
  const ico = new THREE.IcosahedronGeometry(0.22, 0);
  const p = ico.attributes.position as THREE.BufferAttribute;
  const seen = new Set<string>();
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const k = v.toArray().map((q) => q.toFixed(2)).join();
    if (seen.has(k)) continue; seen.add(k);
    const sp = mesh(lpCone(0.035, 0.12, 4), spineM);
    sp.position.copy(v.clone().multiplyScalar(1.05));
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    g.add(sp);
  }
  ico.dispose();
  const fuse = mesh(lpCyl(0.025, 0.16, 5), M('rope', () => null, { color: '#6a4e26', rough: 0.9 })); fuse.position.set(0.04, 0.27, 0); fuse.rotation.z = -0.3; g.add(fuse);
  const spark = new THREE.Mesh(lpSphere(0.04, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcc55').multiplyScalar(2) }));
  spark.position.set(0.08, 0.35, 0); spark.name = 'spark'; g.add(spark);
  return g;
}
const PEARL_COL: Record<number, [string, string]> = { 1: ['#f4ece0', '#8a8070'], 5: ['#ffc8d8', '#a05a70'], 10: ['#4a4a5e', '#14141e'] };
export function pearlModel(v: number): THREE.Group {
  const g = new THREE.Group();
  const [c, e] = PEARL_COL[v] ?? PEARL_COL[1];
  const m = M('pearl.' + v, () => null, { color: c, rough: 0.3, emissive: e, emissiveK: 0.25 });
  const s = mesh(lpSphere(v >= 10 ? 0.15 : v >= 5 ? 0.13 : 0.1, 1), m); g.add(s);
  const hl = new THREE.Mesh(lpSphere(0.025, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' })); hl.position.set(-0.04, 0.05, 0.08); g.add(hl);
  if (v >= 5) {
    // an open cockle shell under the bigger pearls
    const shell = M('shell', () => null, { color: v >= 10 ? '#5a6a7a' : '#e8c8a8', rough: 0.8 });
    const bot = mesh(lpSphere(0.2, 0), shell); bot.scale.set(1, 0.35, 0.8); bot.position.y = -0.12; g.add(bot);
    const top = mesh(lpSphere(0.2, 0), shell); top.scale.set(1, 0.35, 0.8); top.position.set(0, 0.04, -0.12); top.rotation.x = -1.0; g.add(top);
  }
  return g;
}
let heartShape: THREE.Shape | null = null;
export function heartModel(half = false): THREE.Group {
  const g = new THREE.Group();
  if (!heartShape) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.22); s.lineTo(-0.22, 0.02); s.lineTo(-0.2, 0.14); s.lineTo(-0.12, 0.2); s.lineTo(-0.03, 0.16); s.lineTo(0, 0.11);
    s.lineTo(0.03, 0.16); s.lineTo(0.12, 0.2); s.lineTo(0.2, 0.14); s.lineTo(0.22, 0.02); s.lineTo(0, -0.22);
    heartShape = s;
  }
  const geo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1 });
  geo.translate(0, 0, -0.06);
  if (half) { const p = geo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) if (p.getX(i) > 0) p.setX(i, 0); }
  const m = M('heart', () => null, { color: '#e8304a', rough: 0.45, emissive: '#5a0010', emissiveK: 0.5 });
  const me = mesh(facet(geo), m); g.add(me);
  const hl = new THREE.Mesh(lpSphere(0.03, 0), new THREE.MeshBasicMaterial({ color: '#ffd0d8' })); hl.position.set(-0.11, 0.12, 0.11); g.add(hl);
  return g;
}

// ------------------------------------------------------------------ the boss room's exit hatch
export interface FloorHatch { root: THREE.Group; door: THREE.Group; wheel: THREE.Group; glow: THREE.Mesh }
export function floorHatch(): FloorHatch {
  const root = new THREE.Group();
  const iron = M('bar.iron', ironPage, { rough: 0.7, metal: 0.3 });
  const brass = M('brass', brassPage, { rough: 0.35, metal: 0.35, emissive: '#2a1800', emissiveK: 0.3 });
  const rim = mesh(lpCyl(1.25, 0.3, 10, 1.15), iron); rim.position.y = 0.05; root.add(rim);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; const b = mesh(lpSphere(0.06, 0), brass); b.position.set(Math.cos(a) * 1.15, 0.22, Math.sin(a) * 1.15); root.add(b); }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.0, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ae8ff').multiplyScalar(1.4) }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; root.add(glow);
  const door = new THREE.Group(); door.position.set(-1.05, 0.22, 0);
  const plate = mesh(lpCyl(1.05, 0.12, 10), iron); plate.position.x = 1.05; door.add(plate);
  const wheel = new THREE.Group(); wheel.position.set(1.05, 0.14, 0);
  const ring = mesh(facet(new THREE.TorusGeometry(0.4, 0.045, 4, 10)), brass); ring.rotation.x = Math.PI / 2; wheel.add(ring);
  for (let k = 0; k < 3; k++) { const sp = mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), brass); sp.rotation.y = (k / 3) * Math.PI; wheel.add(sp); }
  door.add(wheel);
  root.add(door);
  return { root, door, wheel, glow };
}

// ------------------------------------------------------------------ the post office's pillar box
export function postBox(): THREE.Group {
  const g = new THREE.Group();
  const paint = M('postBlue', () => ctex('dg.post', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.blue, x < 4 ? 1 : x < 10 ? 3 : x < 24 ? 2 : 1));
    for (let x = 0; x < 32; x++) { p.set(x, 6, tone(T.gold, 3)); p.set(x, 7, tone(T.gold, 1)); }
    // a little envelope badge
    p.rect(11, 14, 10, 7, '#f4ecd8'); p.line(11, 14, 16, 18, '#8a7a60'); p.line(20, 14, 16, 18, '#8a7a60');
  }), { rough: 0.6 });
  const dark = M('dark', () => null, { color: '#120808', rough: 1 });
  const body = mesh(lpCyl(0.38, 1.2, 8), paint); body.position.y = 0.6; g.add(body);
  const cap = mesh(lpSphere(0.4, 1), paint); cap.scale.y = 0.5; cap.position.y = 1.2; g.add(cap);
  const slot = mesh(new THREE.BoxGeometry(0.36, 0.06, 0.1), dark); slot.position.set(0, 0.95, 0.36); g.add(slot);
  const base = mesh(lpCyl(0.45, 0.14, 8), M('frame.reef', () => stonePage(AREA_STONE.reef, 'reef'), { rough: 0.9 })); base.position.y = 0.07; g.add(base);
  return g;
}

/** a colour helper for others (pickup glints) */
export const rgbOf = (c: string): RGB => hex(c);
void Px;

// ------------------------------------------------------------------ the exit pit's iron grate
/** a heavy iron grate over a pit, centred on x = 0, lying at y = 0, w wide; returns the two leaves (pivots) */
export function grateModel(w: number): { root: THREE.Group; leaves: THREE.Group[] } {
  const root = new THREE.Group();
  const iron = M('bar.iron', ironPage, { rough: 0.7, metal: 0.3 });
  const brass = M('brass', brassPage, { rough: 0.35, metal: 0.35, emissive: '#2a1800', emissiveK: 0.3 });
  const leaves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.x = s * w / 2;
    const leaf = new THREE.Group();
    for (let k = 0; k < 5; k++) { const bar = mesh(boxUV(new THREE.BoxGeometry(w / 2, 0.2, 0.2), 2), iron); bar.position.set(-s * w / 4, 0, -1.6 + k * 0.8); leaf.add(bar); }
    for (const fx of [0.25, 0.5, 0.75]) { const cross = mesh(boxUV(new THREE.BoxGeometry(0.18, 0.24, 3.6), 2), iron); cross.position.set(-s * w / 2 * fx, 0.02, 0); leaf.add(cross); }
    const ring = mesh(facet(new THREE.TorusGeometry(0.22, 0.05, 4, 8)), brass); ring.rotation.x = Math.PI / 2; ring.position.set(-s * (w / 2 - 0.5), 0.12, 1.2); leaf.add(ring);
    pivot.add(leaf); root.add(pivot); leaves.push(pivot);
  }
  // a skull on the frame: down there is the boss's way out
  const stone = M('frame.abyss', () => stonePage(AREA_STONE.abyss, 'abyss'), { rough: 0.9 });
  for (const s of [-1, 1]) { const curb = mesh(chamferBox(0.7, 0.6, 4, 0.08), stone); curb.position.set(s * (w / 2 + 0.35), 0, 0); root.add(curb); }
  return { root, leaves };
}

// ------------------------------------------------------------------ the rope to the surface
/** a knotted rope hanging from high above down to y = 0, a brass float and a lantern at its end (height h) */
export function ropeModel(h: number): { root: THREE.Group; lamp: THREE.Mesh } {
  const root = new THREE.Group();
  const rope = M('ropeTex', () => ctex('dg.rope', 16, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) { const tw = ((x + y * 2) % 8) < 4; p.set(x, y, tone(T.rope, tw ? 2 : 1)); }
    for (let y = 0; y < 32; y += 4) for (let x = 0; x < 16; x++) if ((x + y) % 8 === 0) p.set(x, y, tone(T.rope, 3));
  }), { rough: 0.95 });
  const line = mesh(lpCyl(0.07, h, 5, 0.07, Math.max(2, Math.round(h / 3))), rope); line.position.y = h / 2; root.add(line);
  for (let y = 0.8; y < Math.min(h, 12); y += 1.6) { const knot = mesh(lpSphere(0.13, 0), rope); knot.position.y = y; root.add(knot); }
  const brass = M('brass', brassPage, { rough: 0.35, metal: 0.35, emissive: '#2a1800', emissiveK: 0.3 });
  const hook = mesh(facet(new THREE.TorusGeometry(0.22, 0.05, 4, 8, Math.PI * 1.4)), brass); hook.position.y = -0.1; hook.rotation.z = Math.PI * 0.8; root.add(hook);
  const float = mesh(lpSphere(0.35, 1), M('buoyRed', () => null, { color: '#c8302a', rough: 0.6 })); float.position.y = 2.6; float.scale.y = 1.3; root.add(float);
  const band = mesh(lpCyl(0.36, 0.14, 8), M('buoyWhite', () => null, { color: '#f0ece0', rough: 0.6 })); band.position.y = 2.6; root.add(band);
  const lamp = new THREE.Mesh(lpSphere(0.16, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd890').multiplyScalar(2.4) }));
  lamp.position.set(0.25, 1.5, 0.1); root.add(lamp);
  for (const dy of [0.2, -0.2]) { const cap = mesh(lpCyl(0.14, 0.07, 6), brass); cap.position.set(0.25, 1.5 + dy, 0.1); root.add(cap); }
  return { root, lamp };
}

// ------------------------------------------------------------------ signposts (the journey's distances)
/**
 * A weathered wooden signpost: a pole with barnacles at its foot, arrow boards with the words burnt in (painted
 * with the pixel font onto plank pages), and a little lantern on top. dir: -1 points left (home), 1 right (onward),
 * 0 a plain plaque.
 */
export function signpostModel(boards: { text: string; dir: -1 | 0 | 1 }[], lantern = true): THREE.Group {
  const g = new THREE.Group();
  const wood = M('wood', woodPage, { rough: 0.9 });
  const H = 1.6 + boards.length * 0.55;
  const pole = mesh(lpCyl(0.09, H, 6, 0.08), wood); pole.position.y = H / 2; g.add(pole);
  const shell = M('barnacle', () => null, { color: '#d8ccb0', rough: 0.9 });
  for (let k = 0; k < 5; k++) { const b = mesh(lpCone(0.05, 0.06, 5), shell); const a = k * 1.3; b.position.set(Math.cos(a) * 0.09, 0.1 + k * 0.06, Math.sin(a) * 0.09); b.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4); g.add(b); }
  boards.forEach((bd, i) => {
    const y = H - 0.35 - i * 0.55;
    const font = 'body' as const;
    const tw = Math.max(24, measure(bd.text, font));
    const cw = tw + 16, chh = 20;
    // v5: painted at 2x: a pale weathered plank face with two grain lines, a knot, worn rounded ends, two nails, and
    // the letters CARVED in (a dark cut with a lit lower lip), so the distances read from across the reef
    const S2 = 2, W2 = cw * S2, H2 = chh * S2;
    const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
    const x = cv.getContext('2d')!;
    const f = (px: number, py: number, w: number, h: number, c: string) => { x.fillStyle = c; x.fillRect(px, py, w, h); };
    f(0, 0, W2, H2, '#3e2814');
    f(2, 2, W2 - 4, H2 - 4, '#c49a68');
    f(2, 2, W2 - 4, 3, '#dcb684'); f(2, H2 - 7, W2 - 4, 5, '#a87c4c');
    // grain: two long wavy lines and short streaks, placed (not random)
    for (let xx = 4; xx < W2 - 4; xx++) {
      const g1 = Math.round(11 + Math.sin(xx * 0.07 + i) * 2), g2 = Math.round(H2 - 13 + Math.sin(xx * 0.05 + 2 + i) * 2);
      if ((xx + i * 7) % 23 < 17) f(xx, g1, 1, 1, '#a87c4c');
      if ((xx + i * 5) % 29 < 21) f(xx, g2, 1, 1, '#b08452');
    }
    const kx = Math.round(W2 * (i % 2 ? 0.78 : 0.22)), ky = H2 - 10;
    f(kx - 3, ky - 1, 7, 3, '#8a6038'); f(kx - 2, ky, 5, 1, '#5a3a1c'); f(kx - 4, ky - 2, 9, 1, '#b08452');
    // worn ends (lighter where weather rubs)
    f(2, 2, 3, H2 - 4, '#d4ac78'); f(W2 - 5, 2, 3, H2 - 4, '#a87c4c');
    for (const nx of [7, W2 - 9]) { f(nx, H2 / 2 - 2, 3, 3, '#3a3a40'); f(nx, H2 / 2 - 2, 1, 1, '#d8d8e0'); f(nx + 2, H2 / 2, 1, 1, '#1a1a20'); }
    // the carved letters: a lit lip (offset down-right) under the dark cut, drawn 2x
    const lip = glyphs(bd.text, { font, color: '#e8c898', shadow: null });
    const cut = glyphs(bd.text, { font, color: '#2a140a', shadow: null });
    x.imageSmoothingEnabled = false;
    const lx = Math.round((W2 - tw * S2) / 2), ly = 4 * S2;
    x.drawImage(lip.cv, lx + 1, ly + 1, lip.w * S2, lip.h * S2);
    x.drawImage(cut.cv, lx, ly, cut.w * S2, cut.h * S2);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const bw = cw / 40, bh = 0.46;
    const board = mesh(chamferBox(bw, bh, 0.07, 0.02), wood);
    const off = bd.dir * (bw / 2 - 0.15);
    board.position.set(off, y, 0.02); g.add(board);
    // the painted face glows a touch (the lantern's light on it), so the distances read in the dark of the deep
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.04, bh - 0.04), psxMat(tex, { rough: 0.9, emissive: '#ffe8c0', emissiveK: 0.45, emissiveMap: tex }));
    face.position.set(off, y, 0.057); g.add(face);
    if (bd.dir) {
      // the arrow's point: a wedge on the board's far end
      const tip = new THREE.Shape(); tip.moveTo(0, -bh / 2); tip.lineTo(0.26, 0); tip.lineTo(0, bh / 2); tip.lineTo(0, -bh / 2);
      const tg = new THREE.ExtrudeGeometry(tip, { depth: 0.07, bevelEnabled: false }); tg.translate(0, 0, -0.035);
      const t = mesh(tg, wood); t.position.set(off + bd.dir * bw / 2, y, 0.02); if (bd.dir < 0) t.rotation.y = Math.PI; g.add(t);
    }
  });
  if (lantern) {
    const brass = M('brass', brassPage, { rough: 0.35, metal: 0.35, emissive: '#2a1800', emissiveK: 0.3 });
    const arm = mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), wood); arm.position.set(0.2, H - 0.05, 0); g.add(arm);
    const lamp = new THREE.Mesh(lpSphere(0.1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd890').multiplyScalar(2.2) }));
    lamp.position.set(0.36, H - 0.25, 0); lamp.name = 'lamp'; g.add(lamp);
    for (const dy of [0.13, -0.13]) { const cap = mesh(lpCyl(0.09, 0.05, 6), brass); cap.position.set(0.36, H - 0.25 + dy, 0); g.add(cap); }
  }
  return g;
}

// ------------------------------------------------------------------ v6 crossroads signs
/** which way a crossroads board points: left / right, up-right, down-right, straight down */
export type SignDir = -1 | 0 | 1 | 'ur' | 'dr' | 'down';
export type SignIconKind = 'chest' | 'bigchest' | 'locked' | 'pearls' | 'mats' | 'post' | 'shop' | 'key';
/** one board of a crossroads sign: the place, its route in two words, the danger (skulls / a giant) and the reward */
export interface SignBoardSpec { title: string; note?: string; danger?: number; giant?: boolean; icons?: SignIconKind[]; dir: SignDir; tint?: string; hang?: -1 | 1 }

// little painted icons for the boards (one char = one sign pixel; ' ' clear). An outline is added round each.
const ICONS: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  skull: { rows: [' BBBBB ', 'BBBBBBB', 'BkkBkkB', 'BkkBkkB', 'BBBkBBB', ' BbBbB ', ' BBBBB '], pal: { B: '#f2ead4', b: '#a89c80', k: '#1a0c06' } },
  giant: { rows: ['  GGG  ', ' GwwwG ', ' GwwwG ', '  GGG  ', ' GGGGG ', 'GGGGGGG', 'G GGG G', 'G GGG G', '  G G  ', ' GG GG '], pal: { G: '#7a1c14', w: '#9fd0e0' } },
  chest: { rows: [' OOOOOO ', 'OooooooO', 'OYYYYYYO', 'OooYYooO', 'OooooooO', 'OOOOOOOO'], pal: { O: '#4a2410', o: '#b0682c', Y: '#e8b440' } },
  bigchest: { rows: [' s  s  s ', ' YYYYYYY ', 'YyyyyyyyY', 'YWWWWWWWY', 'YyyyRyyyY', 'YyyyyyyyY', 'YYYYYYYYY'], pal: { Y: '#8a5a10', y: '#f0b828', W: '#fff4b0', R: '#d82a3a', s: '#fff8c0' } },
  locked: { rows: [' OOOOOO   ', 'OooooooO  ', 'OYYYYYYO  ', 'OooooooO g', 'OooooooOggg', 'OOOOOOOOgkg', '        ggg'], pal: { O: '#4a2410', o: '#b0682c', Y: '#e8b440', g: '#9a9aa8', k: '#1a1a20' } },
  pearls: { rows: [' hW   hW   hW ', 'hWWW hWWW hWWW', 'WWWs WWWs WWWs', ' Ws   Ws   Ws '], pal: { h: '#ffffff', W: '#efe6da', s: '#a8987e' } },
  mats: { rows: ['   RR   ', '  RRRR  ', ' RRRRRR ', 'RRRRRRRR', ' wwwwww ', ' wdwwkw ', ' wwwwkw ', ' wwwwkw '], pal: { R: '#c8402a', w: '#ecdcb4', d: '#5ab0e0', k: '#5a3214' } },
  post: { rows: ['CCCCCCCCC', 'CcCCCCCcC', 'CCcCCCcCC', 'CCCcRcCCC', 'CCCCRCCCC', 'CCCCCCCCC'], pal: { C: '#f4ead0', c: '#a8906a', R: '#c8302a' } },
  shop: { rows: ['  kkk  ', ' k   k ', 'bbbbbbb', 'bYbbbYb', 'bbbYbbb', 'bYbbbYb', 'bbbbbbb'], pal: { k: '#5a3214', b: '#8a5a2a', Y: '#f2d060' } },
  key: { rows: [' YY     ', 'YyYYYYYY', ' YY  Y Y'], pal: { Y: '#e8b440', y: '#4a2a08' } },
};
// chunky carved arrows (the dark cut; the lit lip is offset)
const ARROWS: Record<string, string[]> = {
  right: ['    X    ', '    XX   ', 'XXXXXXX  ', 'XXXXXXXX ', 'XXXXXXX  ', '    XX   ', '    X    '],
  left: ['    X    ', '   XX    ', '  XXXXXXX', ' XXXXXXXX', '  XXXXXXX', '   XX    ', '    X    '],
  ur: ['  XXXXXX', '   XXXXX', '    XXXX', '   XXXXX', '  XXX XX', ' XXX   X', 'XXX     ', 'XX      '],
  dr: ['XX      ', 'XXX     ', ' XXX   X', '  XXX XX', '   XXXXX', '    XXXX', '   XXXXX', '  XXXXXX'],
  down: ['  XXX  ', '  XXX  ', '  XXX  ', '  XXX  ', 'XXXXXXX', ' XXXXX ', '  XXX  ', '   X   '],
};
// art pixels are drawn at a whole number of canvas px: icons 3 (1.5 sign px), arrows 4 (2 sign px), so they stay crisp
const ICON_PX = 3, ARROW_PX = 4;
const iconCols = (k: string) => Math.max(...(ICONS[k]?.rows ?? ['']).map((r) => r.length));
/** an icon's footprint in sign px */
const iconW = (k: string) => Math.ceil(((iconCols(k) + 2) * ICON_PX) / 2);
const iconH = (k: string) => Math.ceil((((ICONS[k]?.rows.length ?? 0) + 2) * ICON_PX) / 2);
function paintIcon(x: CanvasRenderingContext2D, k: string, lx: number, ly: number, S: number) {
  const ic = ICONS[k]; if (!ic) return;
  const P = ICON_PX, X0 = lx * S + P, Y0 = ly * S + P;
  const on = (cx: number, cy: number) => cy >= 0 && cy < ic.rows.length && cx >= 0 && cx < ic.rows[cy].length && ic.rows[cy][cx] !== ' ';
  // the outline first (a dark cut round the shape), then the pixels
  x.fillStyle = '#2a140a';
  for (let cy = -1; cy <= ic.rows.length; cy++) for (let cx = -1; cx <= iconCols(k); cx++) {
    if (on(cx, cy)) continue;
    if (on(cx - 1, cy) || on(cx + 1, cy) || on(cx, cy - 1) || on(cx, cy + 1)) x.fillRect(X0 + cx * P, Y0 + cy * P, P, P);
  }
  ic.rows.forEach((row, cy) => { for (let cx = 0; cx < row.length; cx++) { const ch = row[cx]; if (ch === ' ') continue; x.fillStyle = ic.pal[ch] ?? '#ff00ff'; x.fillRect(X0 + cx * P, Y0 + cy * P, P, P); } });
}
const arrowW = (k: string) => (ARROWS[k]?.[0].length ?? 0) * ARROW_PX / 2;
const arrowH = (k: string) => (ARROWS[k]?.length ?? 0) * ARROW_PX / 2;
function paintArrow(x: CanvasRenderingContext2D, k: string, lx: number, ly: number, S: number) {
  const rows = ARROWS[k]; if (!rows) return;
  const P = ARROW_PX;
  for (const [dx, dy, col] of [[2, 2, '#e8c898'], [0, 0, '#2a140a']] as const) {
    x.fillStyle = col;
    rows.forEach((row, cy) => { for (let cx = 0; cx < row.length; cx++) if (row[cx] === 'X') x.fillRect(lx * S + cx * P + dx, ly * S + cy * P + dy, P, P); });
  }
}
const arrowKey = (d: SignDir) => (d === -1 ? 'left' : d === 1 ? 'right' : d === 0 ? '' : d);

/** a weathered plank face (the same hand-placed grain as the distance boards), painted at S canvas px per sign px */
function plankCanvas(cw: number, ch: number, S: number, i: number, tint?: string): { cv: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const W2 = cw * S, H2 = ch * S;
  const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
  const x = cv.getContext('2d')!;
  const f = (px: number, py: number, w: number, h: number, c: string) => { x.fillStyle = c; x.fillRect(px, py, w, h); };
  f(0, 0, W2, H2, '#3e2814');
  f(2, 2, W2 - 4, H2 - 4, '#c49a68');
  f(2, 2, W2 - 4, 3, '#dcb684'); f(2, H2 - 7, W2 - 4, 5, '#a87c4c');
  for (let xx = 4; xx < W2 - 4; xx++) {
    const g1 = Math.round(11 + Math.sin(xx * 0.07 + i) * 2), g2 = Math.round(H2 - 13 + Math.sin(xx * 0.05 + 2 + i) * 2), g3 = Math.round(H2 * 0.5 + Math.sin(xx * 0.04 + 5 + i) * 3);
    if ((xx + i * 7) % 23 < 17) f(xx, g1, 1, 1, '#a87c4c');
    if ((xx + i * 5) % 29 < 21) f(xx, g2, 1, 1, '#b08452');
    if ((xx + i * 3) % 31 < 9) f(xx, g3, 1, 1, '#b48a58');
  }
  const kx = Math.round(W2 * (i % 2 ? 0.86 : 0.14)), ky = H2 - 10;
  f(kx - 3, ky - 1, 7, 3, '#8a6038'); f(kx - 2, ky, 5, 1, '#5a3a1c'); f(kx - 4, ky - 2, 9, 1, '#b08452');
  f(2, 2, 3, H2 - 4, '#d4ac78'); f(W2 - 5, 2, 3, H2 - 4, '#a87c4c');
  for (const nx of [7, W2 - 9]) for (const ny of [8, H2 - 11]) { f(nx, ny, 3, 3, '#3a3a40'); f(nx, ny, 1, 1, '#d8d8e0'); f(nx + 2, ny + 2, 1, 1, '#1a1a20'); }
  // where it leads, at a glance: a painted band in the destination's colour along the top edge
  if (tint) { f(5, 5, W2 - 10, 2 * S, tint); f(5, 5 + 2 * S, W2 - 10, 1, '#2a140a'); }
  return { cv, x };
}
function carve(x: CanvasRenderingContext2D, text: string, font: 'body' | 'small' | 'title', lx: number, ly: number, S: number, cut = '#2a140a', lipC = '#e8c898') {
  const lip = glyphs(text, { font, color: lipC, shadow: null });
  const c = glyphs(text, { font, color: cut, shadow: null });
  x.imageSmoothingEnabled = false;
  x.drawImage(lip.cv, lx * S + 1, ly * S + 1, lip.w * S, lip.h * S);
  x.drawImage(c.cv, lx * S, ly * S, c.w * S, c.h * S);
}
function planeTex(cv: HTMLCanvasElement) {
  // (no mipmaps: seen from a pulled-back camera the boards are only slightly minified, and mips blur the letters)
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.own = true;
  return tex;
}

/** the wax seal stamped on the chosen board: a red disc with a raised rim and a tick */
function stampTex(): THREE.Texture {
  return ctex('dg.stamp', 24, 24, (p) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11.5, y - 11.5) + (hash2(x, y, 7) > 0.85 ? 0.6 : 0);
      if (d > 11.2) continue;
      p.set(x, y, d > 9.8 ? '#7a1010' : d > 8.4 ? '#e0483a' : d > 7.6 ? '#9a1a16' : '#c8302a');
    }
    const tick = [[6, 12], [7, 13], [8, 14], [9, 15], [10, 14], [11, 13], [12, 12], [13, 11], [14, 10], [15, 9], [16, 8], [17, 7]];
    for (const [x, y] of tick) { for (const [dx, dy] of [[0, 0], [0, -1], [1, 0]]) p.set(x + dx, y + dy, '#fff0d8'); p.set(x + 1, y + 1, '#5a0808'); }
  });
}

export interface ForkSign {
  root: THREE.Group;
  /** the board pivots (stamp / board up) */
  boards: THREE.Group[];
  lamp: THREE.Mesh | null;
  /** the chosen board: a wax seal stamps onto it */
  stamp(i: number, instant?: boolean): void;
  /** a way not taken: a plank nailed across the board */
  cross(i: number, instant?: boolean): void;
  update(dt: number): void;
}

/**
 * A crossroads signpost: a thick post with one big board per way (the place in carved letters, a painted arrow,
 * the danger as skulls and a giant's silhouette, the reward as icons, the route in small letters, a band in the
 * destination's colour), an optional header plaque ("CROSSROADS") and a lantern. Boards are ~1/32 m per sign pixel,
 * so they read from across the shelf.
 */
export function forkSignModel(specs: SignBoardSpec[], o: { header?: string; lantern?: boolean } = {}): ForkSign {
  const root = new THREE.Group();
  const wood = M('wood', woodPage, { rough: 0.9 });
  const S = 2, PX = 1 / 36;
  // measure each board: title line, then the danger / reward icon row, then the note
  const lay = specs.map((b) => {
    const arrow = arrowKey(b.dir);
    const aw = arrow ? arrowW(arrow) + 5 : 0;
    const tw = measure(b.title, 'body');
    const nw = b.note ? measure(b.note, 'small') : 0;
    const dz = Math.max(0, Math.min(3, b.danger ?? 0));
    const iconsL = [...Array(dz).fill('skull'), ...(b.giant ? ['giant'] : [])] as string[];
    const iconsR = (b.icons ?? []) as string[];
    const rowW = iconsL.reduce((s, k) => s + iconW(k), 0) + (dz === 0 && !b.giant ? measure('SAFE', 'small') + 4 : 0) + 8 + iconsR.reduce((s, k) => s + iconW(k), 0);
    const cw = Math.max(aw + Math.max(tw, nw, rowW) + 14, 60);
    const rowH = Math.max(9, ...[...iconsL, ...iconsR].map((k) => iconH(k)));
    const ch = Math.max(6 + 11 + 3 + rowH + (b.note ? 2 + 7 : 0) + 5, arrow ? arrowH(arrow) + 10 : 0);
    return { b, arrow, aw, iconsL, iconsR, cw, ch, dz, rowH };
  });
  const H = 0.9 + lay.reduce((s, l) => s + l.ch * PX + 0.12, 0) + (o.header ? 0.62 : 0);
  const pole = mesh(lpCyl(0.13, H, 6, 0.11), wood); pole.position.y = H / 2; root.add(pole);
  const shell = M('barnacle', () => null, { color: '#d8ccb0', rough: 0.9 });
  for (let k = 0; k < 7; k++) { const b = mesh(lpCone(0.06, 0.07, 5), shell); const a = k * 1.1; b.position.set(Math.cos(a) * 0.13, 0.1 + k * 0.07, Math.sin(a) * 0.13); b.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4); root.add(b); }
  // a rock at its foot (the post is planted, not floating)
  const rock = mesh(lpSphere(0.32, 0), M('frame.reef', () => stonePage(AREA_STONE.reef, 'reef'), { rough: 0.95 })); rock.scale.set(1.3, 0.55, 1); rock.position.y = 0.05; root.add(rock);
  let y = H - 0.12;
  if (o.header) {
    const tw = measure(o.header, 'body'), cw = tw + 18, ch = 19;
    const { cv, x } = plankCanvas(cw, ch, S, 9);
    carve(x, o.header, 'body', 9, 4, S, '#3a1c0a', '#f0d8a8');
    const bw = cw * PX, bh = ch * PX;
    const plank = mesh(chamferBox(bw, bh, 0.08, 0.02), wood); plank.position.set(0, y - bh / 2, 0.03); root.add(plank);
    const htex = planeTex(cv);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.04, bh - 0.04), psxMat(htex, { rough: 0.9, emissive: '#ffe8c0', emissiveK: 0.5, emissiveMap: htex }));
    face.position.set(0, y - bh / 2, 0.072); root.add(face);
    y -= bh + 0.12;
  }
  const boards: THREE.Group[] = [];
  const stamps: { m: THREE.Mesh; t: number; on: boolean }[] = [];
  const crosses: { m: THREE.Mesh; t: number; on: boolean; board: THREE.Group; face: THREE.Mesh }[] = [];
  const stampMat = new THREE.MeshBasicMaterial({ map: stampTex(), transparent: true, alphaTest: 0.5, color: new THREE.Color(1.15, 1.15, 1.15) });
  lay.forEach((L, i) => {
    const { cv, x } = plankCanvas(L.cw, L.ch, S, i, L.b.tint);
    let cx = 6;
    if (L.arrow) { paintArrow(x, L.arrow, cx, Math.round((L.ch - arrowH(L.arrow)) / 2), S); cx += L.aw; }
    carve(x, L.b.title, 'body', cx, 6, S);
    // the danger, left; the reward, right
    let ix = cx - 1;
    const iy = 6 + 11 + 3, rh = L.rowH;
    if (!L.dz && !L.b.giant) { carve(x, 'SAFE', 'small', ix + 1, iy + Math.round((rh - 7) / 2), S, '#1e4a1a', '#cfe8a8'); ix += measure('SAFE', 'small') + 4; }
    for (const k of L.iconsL) { paintIcon(x, k, ix, iy + Math.round((rh - iconH(k)) / 2), S); ix += iconW(k); }
    let rx = L.cw - 6;
    for (const k of [...L.iconsR].reverse()) { rx -= iconW(k); paintIcon(x, k, rx, iy + Math.round((rh - iconH(k)) / 2), S); }
    if (L.b.note) carve(x, L.b.note, 'small', cx, iy + rh + 2, S, '#3a1c0a', '#ecd0a0');
    const bw = L.cw * PX, bh = L.ch * PX;
    const pivot = new THREE.Group();
    // boards hang to the side they point (left boards left of the post, the rest to the right)
    const side = L.b.hang ?? (L.b.dir === -1 ? -1 : L.b.dir === 0 ? 0 : 1);
    const off = side * (bw / 2 - 0.2);
    pivot.position.set(off, y - bh / 2, 0.02);
    const plank = mesh(chamferBox(bw, bh, 0.08, 0.025), wood); pivot.add(plank);
    const tex = planeTex(cv);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.04, bh - 0.04), psxMat(tex, { rough: 0.9, emissive: '#ffe8c0', emissiveK: 0.5, emissiveMap: tex }));
    face.position.z = 0.042; pivot.add(face);
    if (L.b.dir === 1 || L.b.dir === -1) {
      const tip = new THREE.Shape(); tip.moveTo(0, -bh / 2); tip.lineTo(0.34, 0); tip.lineTo(0, bh / 2); tip.lineTo(0, -bh / 2);
      const tg = new THREE.ExtrudeGeometry(tip, { depth: 0.08, bevelEnabled: false }); tg.translate(0, 0, -0.04);
      const t = mesh(tg, wood); t.position.set(L.b.dir * bw / 2, 0, 0); if (L.b.dir < 0) t.rotation.y = Math.PI; pivot.add(t);
    }
    root.add(pivot); boards.push(pivot);
    // the wax seal (hidden until stamped) and the plank nailed across (hidden until crossed)
    const st = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), stampMat);
    st.position.set(bw / 2 - 0.36, 0.02, 0.06); st.visible = false; pivot.add(st);
    stamps.push({ m: st, t: 0, on: false });
    const xb = mesh(chamferBox(bw * 0.95, 0.12, 0.05, 0.015), M('woodDark', woodPage, { rough: 0.95, color: '#6a5040' }));
    xb.rotation.z = -Math.atan2(bh * 0.8, bw); xb.position.set(0, 0, 0.08); xb.visible = false; pivot.add(xb);
    crosses.push({ m: xb, t: 0, on: false, board: pivot, face });
    y -= bh + 0.12;
  });
  let lamp: THREE.Mesh | null = null;
  if (o.lantern !== false) {
    const brass = M('brass', brassPage, { rough: 0.35, metal: 0.35, emissive: '#2a1800', emissiveK: 0.3 });
    const arm = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), wood); arm.position.set(-0.25, H - 0.05, 0); root.add(arm);
    lamp = new THREE.Mesh(lpSphere(0.13, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd890').multiplyScalar(2.2) }));
    lamp.position.set(-0.45, H - 0.3, 0); lamp.name = 'lamp'; root.add(lamp);
    for (const dy of [0.16, -0.16]) { const cap = mesh(lpCyl(0.11, 0.06, 6), brass); cap.position.set(-0.45, H - 0.3 + dy, 0); root.add(cap); }
  }
  const easeBack = (t: number) => { const c = 2.2; t = Math.min(1, t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  return {
    root, boards, lamp,
    stamp(i, instant = false) { const s = stamps[i]; if (!s || s.on) return; s.on = true; s.t = instant ? 9 : 0; s.m.visible = true; },
    cross(i, instant = false) { const c = crosses[i]; if (!c || c.on) return; c.on = true; c.t = instant ? 9 : 0; c.m.visible = true; },
    update(dt) {
      for (const [i, s] of stamps.entries()) {
        if (!s.on) continue;
        s.t += dt;
        // it slams down from big to flat, the board kicks
        const k = Math.min(1, s.t / 0.28);
        s.m.scale.setScalar(3 - 2 * easeBack(k));
        (s.m.material as THREE.MeshBasicMaterial).opacity = 1;
        const b = boards[i];
        b.rotation.z = s.t < 0.6 ? Math.sin(s.t * 30) * 0.06 * (1 - s.t / 0.6) : 0;
        b.scale.setScalar(s.t < 0.5 ? 1 + 0.12 * Math.sin(Math.min(1, s.t / 0.5) * Math.PI) : 1);
      }
      for (const c of crosses) {
        if (!c.on) continue;
        c.t += dt;
        const k = Math.min(1, c.t / 0.35);
        c.m.position.y = (1 - k) * 0.5; c.m.scale.x = 0.4 + 0.6 * k;
        // the board it closes droops on its nails and dims
        c.board.rotation.z = -0.09 * Math.min(1, c.t / 0.6);
        const fm = c.face.material as THREE.MeshStandardMaterial;
        if (fm.emissiveIntensity !== undefined) fm.emissiveIntensity = 0.5 * (1 - 0.7 * Math.min(1, c.t / 0.6));
      }
    },
  };
}
