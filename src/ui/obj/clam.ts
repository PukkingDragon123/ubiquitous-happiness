// The HEALING CLAM (v6, HEAL_ITEM in src/combat/types.ts): the run's heal item as a lit low-poly HUD prop.
// A plump pink clam (two ribbed valves on a dark hinge ligament) with a glowing heal-jelly and a little pearl inside.
// Its pages are hand-painted pixel art at 1 texel per texel-of-detail: radial ribs in a hue-shifted coral ramp, growth
// rings, a sun-bleached lip, a violet umbo, algae tufts and a barnacle on the top valve; pearly nacre inside with a
// muscle scar and a sheen band. No noise: every mark is placed by rule.
//
//   const c = new HealClam3D();  stage.ui.add(c.root);  each frame: c.update(dt, { has, eating, gulped })
//     has      a clam is left (false: an empty, greyed shell resting half open)
//     eating   0..1 progress of the heal (0 = idle): it pops open wide, the jelly is slurped away at the gulp
//   c.pop()    a refill / a new charge: a happy bounce
//   clamProp('full' | 'empty')   a static clam (shop card, the run summary's empty state)
import * as THREE from 'three';
import { ramp } from './pixtex';

// ------------------------------------------------------------------ the pages (pixel art)
const SHELL = '#e89a86', NACRE = '#f2d8e6';
const pageCache = new Map<string, THREE.CanvasTexture>();
function page(key: string, w: number, h: number, paint: (set: (x: number, y: number, c: string) => void) => void) {
  let t = pageCache.get(key);
  if (t) return t;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!;
  paint((px, py, c) => { x.fillStyle = c; x.fillRect(px, py, 1, 1); });
  t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  pageCache.set(key, t);
  return t;
}
/** the outside of a valve: u across the fan (64), v from the hinge (row 0) to the lip (row 31) */
function shellPage(top: boolean, grey = false) {
  return page(`clamShell|${top}|${grey}`, 64, 32, (set) => {
    const C = ramp(grey ? '#9a9098' : SHELL), V = ramp(grey ? '#6a6070' : '#9a5a86');
    const K = ['#1f4a16', '#3a7a28', '#5fae3f', '#a6e07a'];
    const ribs = 14, rw = 64 / ribs;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const ri = Math.floor(x / rw), rx = x - ri * rw;
      // a rib: a lit crest down its middle, shaded flanks, a dark groove between ribs
      let c = rx < 0.9 ? C[1] : rx < 1.8 ? C[2] : rx < 3.2 ? (ri % 2 ? C[4] : C[3]) : C[3];
      if (rx >= 1.8 && rx < 2.6 && y > 4) c = C[5];
      // coral rays every third rib
      if (ri % 3 === 1 && rx >= 1 && y > 6) c = rx < 1.8 ? '#a8343a' : rx < 3.2 ? '#d8544a' : '#c0443e';
      // growth rings: a dark step with a lit lip under it
      for (const gy of [9, 15, 20, 25]) { if (y === gy) c = C[1]; else if (y === gy + 1 && rx > 0.9) c = C[4]; }
      // the violet umbo by the hinge
      if (y < 5) c = y < 2 ? V[1] : rx < 1.5 ? V[2] : V[3];
      if (y === 5) c = V[4];
      // the sun-bleached lip
      if (y >= 30) c = y === 31 ? C[2] : C[5];
      set(x, y, c);
    }
    if (!top || grey) return;
    // algae tufts and a barnacle settled on the top valve (placed, never scattered)
    for (const [ax, ay] of [[11, 7], [23, 4], [44, 8], [52, 12]]) {
      set(ax, ay, K[0]); set(ax + 1, ay, K[1]); set(ax + 1, ay - 1, K[2]); set(ax, ay - 1, K[1]); set(ax + 2, ay - 1, K[3]); set(ax - 1, ay + 1, K[0]); set(ax + 2, ay, K[2]);
    }
    const bx = 36, by = 11;
    for (const [dx, dy, c] of [[0, -1, '#3a3328'], [1, -1, '#3a3328'], [-1, 0, '#3a3328'], [2, 0, '#3a3328'], [-1, 1, '#3a3328'], [2, 1, '#3a3328'], [0, 2, '#3a3328'], [1, 2, '#3a3328'], [0, 0, '#f6eedc'], [1, 0, '#d8cdb0'], [0, 1, '#a89c80'], [1, 1, '#241c14']] as [number, number, string][]) set(bx + dx, by + dy, c);
  });
}
/** the inside: pearly nacre in soft bands, a sheen, the muscle scar, the shell's rim at the lip */
function nacrePage(grey = false) {
  return page(`clamNacre|${grey}`, 32, 16, (set) => {
    const N = ramp(grey ? '#c8c0c8' : NACRE), C = ramp(grey ? '#9a9098' : SHELL);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      let c = y < 3 ? N[2] : (y + Math.floor(x / 6)) % 5 === 0 ? N[4] : N[3];
      if (Math.abs(x - y * 1.6 - 6) < 1.5 && y > 2 && y < 12) c = N[5];          // the iridescent sheen band
      if ((x - 22) ** 2 + ((y - 6) * 1.6) ** 2 < 6) c = grey ? N[1] : '#c89ab8';   // the muscle scar
      if (y >= 14) c = y === 15 ? C[1] : C[3];                                     // the rim
      set(x, y, c);
    }
  });
}
function jellyPage() {
  return page('clamJelly', 16, 16, (set) => {
    const J = ramp('#ff5aa0');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, y < 3 ? J[5] : y < 7 ? J[4] : y > 12 ? J[2] : J[3]);
    for (const [x, y] of [[4, 4], [10, 6], [6, 9], [12, 10]]) { set(x, y, '#ffffff'); set(x + 1, y, J[5]); }
  });
}

// ------------------------------------------------------------------ geometry
/** one valve: a ribbed fan from the hinge (origin) toward +z, domed up (top) or down (bottom) */
function valveGeo(sign: 1 | -1): THREE.BufferGeometry {
  const cols = 28, rows = 6, R = 0.5, H = 0.2, ribs = 7;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const u = (c / cols) * 2 - 1, v = r / rows, th = u * 1.22;
    const scallop = 1 + 0.05 * Math.cos(u * ribs * Math.PI) * v;
    const rr = (0.06 + v * 0.94) * R * scallop;
    const rib = 0.024 * v * Math.max(0, Math.cos(u * ribs * Math.PI));
    const dome = H * Math.sqrt(Math.max(0, 1 - v * v)) * (0.55 + 0.45 * Math.cos(th)) + rib;
    pos.push(Math.sin(th) * rr * 1.12, sign * dome, Math.cos(th) * rr * 0.92 - 0.04);
    uv.push(c / cols, 1 - v);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
    if (sign > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  return ng;
}
let geoTop: THREE.BufferGeometry | null = null, geoBot: THREE.BufferGeometry | null = null;

function valve(top: boolean, grey: boolean): THREE.Group {
  geoTop ??= valveGeo(1); geoBot ??= valveGeo(-1);
  const g = new THREE.Group();
  const geo = top ? geoTop : geoBot;
  const out = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: shellPage(top, grey), roughness: 0.55, flatShading: true }));
  // the nacre is seen from the inside (BackSide), where the outward normals face away from the light: it glows a
  // little of its own pearly pink so the open shell never reads as a dark hole
  const inn = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: nacrePage(grey), roughness: 0.25, metalness: 0.1, flatShading: true, side: THREE.BackSide, emissive: grey ? '#5a5560' : '#b88aa4', emissiveMap: nacrePage(grey), emissiveIntensity: 0.75 }));
  out.name = 'shell'; inn.name = 'nacre';
  g.add(out, inn);
  return g;
}

/** the jelly: a squashed glowing blob with a pearl on top */
function jelly(): THREE.Group {
  const g = new THREE.Group();
  const jm = new THREE.MeshStandardMaterial({ map: jellyPage(), roughness: 0.12, emissive: '#ff2a7a', emissiveIntensity: 0.55, flatShading: true });
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), jm); blob.scale.set(1.25, 0.55, 1); blob.name = 'jelly';
  const pearl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshStandardMaterial({ color: '#fff6fa', roughness: 0.1, metalness: 0.15, emissive: '#ffd8ec', emissiveIntensity: 0.35, flatShading: true }));
  pearl.position.set(0.04, 0.1, 0.02);
  g.add(blob, pearl);
  g.position.set(0, 0.02, 0.2);
  return g;
}

export class HealClam3D {
  root = new THREE.Group();
  private body = new THREE.Group();
  private top = new THREE.Group();
  private jel = jelly();
  private full: { top: THREE.Group; bot: THREE.Group };
  private grey: { top: THREE.Group; bot: THREE.Group };
  private open = 0.1; private openV = 0;
  private t = Math.random() * 5;
  private bounce = 0; private bounceV = 0;
  private slurp = 0;
  /** 0..1: the jelly's light (the HUD reads it to glow the alcove) */
  glow = 0;
  constructor() {
    this.full = { top: valve(true, false), bot: valve(false, false) };
    this.grey = { top: valve(true, true), bot: valve(false, true) };
    // the hinge ligament: a dark rounded bar across the back
    const lig = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), new THREE.MeshStandardMaterial({ color: '#6a3a2a', roughness: 0.8, flatShading: true }));
    lig.rotation.z = Math.PI / 2; lig.position.set(0, 0, -0.06);
    this.top.add(this.full.top, this.grey.top);
    this.body.add(this.full.bot, this.grey.bot, this.top, lig, this.jel);
    // seen from the front, a touch from above; the hinge at the back
    this.body.rotation.set(0.62, 0, 0);
    this.body.position.set(0, -0.05, 0);
    this.root.add(this.body);
  }
  /** a refill / a new charge: a happy hop */
  pop() { this.bounceV += 7; }

  update(dt: number, s: { has: boolean; eating: number }) {
    this.t += dt;
    const eating = s.eating > 0 && s.eating < 1;
    const empty = !s.has && !eating;
    // open: idle breathes a crack of light; eating pops it wide; empty rests half open
    const want = eating ? (s.eating < 0.12 ? s.eating / 0.12 * 1.05 : 1.05) : empty ? 0.32 : 0.1 + Math.max(0, Math.sin(this.t * 1.7)) ** 6 * 0.22;
    this.openV += ((want - this.open) * 160 - this.openV * 13) * dt;
    this.open += this.openV * dt;
    this.top.rotation.x = -Math.max(0, this.open);
    // the slurp: after the gulp point the jelly shrinks and lifts toward the mouth
    this.slurp = eating ? Math.max(0, Math.min(1, (s.eating - 0.45) / 0.2)) : empty ? 1 : Math.max(0, this.slurp - dt * 3);
    const js = 1 - this.slurp;
    this.jel.visible = js > 0.02;
    this.jel.scale.set(js * (1 + Math.sin(this.t * 5) * 0.04), js * (1 - Math.sin(this.t * 5) * 0.05), js);
    this.jel.position.y = 0.02 + this.slurp * 0.35;
    const jm = (this.jel.getObjectByName('jelly') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    this.glow = (eating ? 1 : 0.35 + 0.25 * Math.sin(this.t * 2.2)) * js;
    jm.emissiveIntensity = 0.35 + this.glow * 0.8;
    // swap to the grey, spent shell when it's gone
    this.full.top.visible = this.full.bot.visible = !empty;
    this.grey.top.visible = this.grey.bot.visible = empty;
    // the bounce: a squash spring (eating lifts it to the mouth with a wobble)
    this.bounceV += (-this.bounce * 140 - this.bounceV * 10) * dt;
    this.bounce += this.bounceV * dt;
    const lift = eating ? Math.sin(Math.min(1, s.eating * 2.2) * Math.PI / 2) * 0.18 : 0;
    this.root.position.y = 0;
    this.body.position.y = -0.05 + lift + Math.max(0, this.bounce) * 0.08;
    const sq = Math.max(-0.3, Math.min(0.3, this.bounce * 0.12));
    this.body.scale.set(1 + sq, 1 - sq, 1 + sq);
    this.body.rotation.y = Math.sin(this.t * 0.8) * 0.28 + (eating ? Math.sin(this.t * 18) * 0.06 : 0);
    this.body.rotation.z = empty ? 0.18 : Math.sin(this.t * 1.1) * 0.04;
  }
}

/** a static clam: 'full' (closed a crack, glowing) or 'empty' (spent, grey, open) */
export function clamProp(kind: 'full' | 'empty' = 'full'): THREE.Group {
  const c = new HealClam3D();
  c.update(1, { has: kind === 'full', eating: 0 });
  c.update(1, { has: kind === 'full', eating: 0 });
  return c.root;
}
