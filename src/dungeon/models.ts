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
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mt = m.material as THREE.Material; if (!mt.userData?.shared) mt.dispose(); } });
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
export function chestModel(): ChestModel {
  const root = new THREE.Group();
  const wood = M('wood', woodPage, { rough: 0.85 });
  const iron = M('bar.iron', ironPage, { rough: 0.75, metal: 0.25 });
  const gold = M('gold', goldPage, { rough: 0.4, metal: 0.35, emissive: '#3a2000', emissiveK: 0.3 });
  const W = 1.1, H = 0.55, D = 0.7;
  const body = mesh(chamferBox(W, H, D, 0.05), wood); body.position.y = H / 2; root.add(body);
  for (const x of [-0.38, 0.38]) { const band = mesh(boxUV(new THREE.BoxGeometry(0.1, H + 0.02, D + 0.04), 2), iron); band.position.set(x, H / 2, 0); root.add(band); }
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const top = mesh(lpCyl(D / 2, W, 6, D / 2, 1), wood); top.rotation.z = Math.PI / 2; top.scale.set(1, 1, 1); top.position.set(0, 0, D / 2); lid.add(top);
  for (const x of [-0.38, 0.38]) { const band = mesh(lpCyl(D / 2 + 0.03, 0.1, 6), iron); band.rotation.z = Math.PI / 2; band.position.set(x, 0, D / 2); lid.add(band); }
  root.add(lid);
  const lock = mesh(chamferBox(0.2, 0.24, 0.08, 0.03), gold); lock.position.set(0, H - 0.05, D / 2 + 0.04); root.add(lock);
  return { root, lid };
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
