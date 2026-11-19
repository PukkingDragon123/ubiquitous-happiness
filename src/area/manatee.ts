// Marge, the mail manatee, and her mail buoy.
//
// The buoy: a red-and-white navigation buoy with a little blue post box and a brass bell bobs at the surface, chained
// to a concrete sinker. Every so often (or when the bell is rung: ring(), or whack the buoy with the sword) Marge
// swims in, waits by the buoy at the blobfish's depth (coming up for air now and then, never while it's close),
// takes whatever loot you deposit() and swims off with it: world.emit('extract', { items, counts }).
// The dungeon's post office uses her alone: station(x, y, ceiling) keeps her hovering by her pillar box.
//
// Marge is a West Indian manatee in a full postal uniform, one skinned PS2-style mesh (flat-shaded, matte, one
// painted 256 px page of her own) on a 17-bone rig, so everything she wears bends and breathes with her:
//   body    fat, wrinkled grey-brown hide with sparse hairs, algae on the back, a set of old propeller scars, a
//           notched round paddle tail, small eyes with a ring lid that blinks, a bristly cleft upper lip (two
//           prehensile pads with whiskers), a small lower lip that moves when she talks, mitten flippers with nails
//   uniform a peaked cap (red band, gold cord, post-horn badge, black visor), a navy jacket with red piping,
//           brass buttons, pocket flaps, gold-fringed epaulettes, a standing collar with collar badges, short
//           sleeves on the flippers, a MARGE name tag on each flank, a red polka-dot neckerchief, and a leather
//           mailbag hung under her belly from a strap that loops right round her (letters tucked under it)
// Callers read x / y (her chest), z, state; drive her with update(); arrive() / leave() / station() / celebrate();
// talk() opens her mouth for a moment (hook it to a dialogue speaker's onTalk), wave() raises the near flipper.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { ItemInst } from '../game/run';
import type { AreaDef } from './defs';
import type { Scenery } from './scenery';
import { Soup, V3, V2, UVR, icosphere } from '../world/lp';
import { Atlas, Region } from '../world/atlas';
import { RGB, hex, mix } from '../gfx/px';
import { hueRamp } from '../world/pixart';
import { propMaterial } from '../world/mats';
import { hash2, damp, clamp, smooth, lerp, easeInOut } from '../core/math';
import { ITEMS } from '../game/items';

const TAU = Math.PI * 2;
const PI = Math.PI;

// ------------------------------------------------------------------ small vector kit
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mixV = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mirror = (p: V3): V3 => [p[0], p[1], -p[2]];
const centroid = (...ps: V3[]): V3 => { const c: V3 = [0, 0, 0]; for (const p of ps) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return mul(c, 1 / ps.length); };

// ------------------------------------------------------------------ her shape
// Model space: she faces +x, back up (+y), right flank toward +z (the camera when she faces right). Angles around
// the body (th) run from the dorsal midline (0) over the +z flank (PI/2) to the belly (PI). Rings start at the belly
// and run belly -> -z -> back -> +z -> belly, counter-clockwise seen from the front, so v = 0..1 maps straight down
// the painted hide page (row 0 belly, 1/4 the +z flank, 1/2 the back, 3/4 the -z flank).

interface Sec { x: number; y: number; phi: number; ry: number; rz: number; sq: number; flat: number; pear: number }
const S_ = (x: number, y: number, phi: number, ry: number, rz: number, sq = 2.2, flat = 0, pear = 0): Sec => ({ x, y, phi, ry, rz, sq, flat, pear });
/** cross sections from the paddle's trailing edge to the muzzle (phi tilts the section: the snout turns down) */
const ST: Sec[] = [
  S_(-2.21, 0.02, 0, 0.008, 0.12, 2), S_(-2.17, 0.02, 0, 0.014, 0.27, 2), S_(-2.09, 0.02, 0, 0.02, 0.41, 2),
  S_(-1.97, 0.02, 0, 0.027, 0.51, 2), S_(-1.83, 0.02, 0, 0.035, 0.55, 2), S_(-1.69, 0.02, 0, 0.046, 0.51, 2),
  S_(-1.57, 0.02, 0, 0.064, 0.41, 2), S_(-1.47, 0.02, 0, 0.095, 0.3, 2.1),
  S_(-1.33, 0.02, 0, 0.16, 0.26, 2.2, 0.03), S_(-1.17, 0.02, 0, 0.225, 0.3, 2.2, 0.06), S_(-0.98, 0.015, 0, 0.31, 0.37, 2.2, 0.08),
  S_(-0.74, 0.01, 0, 0.41, 0.47, 2.2, 0.1), S_(-0.45, 0, 0, 0.5, 0.55, 2.2, 0.12), S_(-0.15, 0, 0, 0.55, 0.59, 2.2, 0.14),
  S_(0.14, 0, 0, 0.56, 0.6, 2.2, 0.14), S_(0.4, 0, 0, 0.535, 0.565, 2.2, 0.12), S_(0.64, -0.01, 0, 0.48, 0.505, 2.2, 0.1),
  S_(0.84, -0.02, 0, 0.41, 0.43, 2.2, 0.06), S_(0.97, -0.03, 0, 0.365, 0.38, 2.2, 0.04), S_(1.06, -0.03, -0.02, 0.372, 0.382, 2.25, 0.02),
  S_(1.18, -0.045, -0.06, 0.345, 0.355, 2.3), S_(1.3, -0.065, -0.13, 0.305, 0.322, 2.35, 0, 0.04), S_(1.42, -0.1, -0.28, 0.262, 0.3, 2.45, 0, 0.1),
  S_(1.52, -0.14, -0.45, 0.235, 0.29, 2.55, 0, 0.14), S_(1.6, -0.185, -0.6, 0.205, 0.27, 2.6, 0, 0.16),
];
const MUZ = ST.findIndex((s) => s.x >= 1.42);
const X_TAIL = ST[0].x, X_MUZ = ST[MUZ].x, X_NOSE = ST[ST.length - 1].x;

function secAt(x: number): Sec {
  if (x <= ST[0].x) return ST[0];
  for (let i = 0; i < ST.length - 1; i++) {
    const a = ST[i], b = ST[i + 1];
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return { x, y: lerp(a.y, b.y, t), phi: lerp(a.phi, b.phi, t), ry: lerp(a.ry, b.ry, t), rz: lerp(a.rz, b.rz, t), sq: lerp(a.sq, b.sq, t), flat: lerp(a.flat, b.flat, t), pear: lerp(a.pear, b.pear, t) };
    }
  }
  return ST[ST.length - 1];
}
/** (up, side) of the section outline at th */
function outline(s: Sec, th: number): [number, number] {
  const c = Math.cos(th), sn = Math.sin(th), e = 2 / s.sq;
  let ly = Math.sign(c) * Math.pow(Math.abs(c), e) * s.ry;
  const lz = Math.sign(sn) * Math.pow(Math.abs(sn), e) * s.rz * (1 - s.pear * c);
  if (ly < 0) ly *= 1 - s.flat;
  return [ly, lz];
}
/** a point on the hide (off > 0: that far out along the surface normal, for clothes and straps) */
function surf(s: Sec, th: number, off = 0): V3 {
  let [ly, lz] = outline(s, th);
  if (off) {
    const a = outline(s, th - 1e-3), b = outline(s, th + 1e-3);
    const ty = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(ty, tz) || 1;
    ly += (tz / l) * off; lz += (-ty / l) * off;
  }
  return [s.x - Math.sin(s.phi) * ly, s.y + Math.cos(s.phi) * ly, lz];
}
const surfX = (x: number, th: number, off = 0) => surf(secAt(x), th, off);
const center = (s: Sec): V3 => [s.x, s.y, 0];
/** outward normal of the hide at (x, th) */
const normalAt = (x: number, th: number): V3 => norm(sub(surfX(x, th, 0.05), surfX(x, th, 0)));
/** the top of the head under (x, z) */
function topY(x: number, z: number): number {
  const s = secAt(x), az = Math.abs(z);
  let lo = 0, hi = PI / 2;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (surf(s, m)[2] < az) lo = m; else hi = m; }
  return surf(s, (lo + hi) / 2)[1];
}

// ------------------------------------------------------------------ the rig
const BN = ['body', 'chest', 'neck', 'head', 'lip', 'jaw', 'lidR', 'lidL', 'flipR', 'flipL', 'lumbar', 'stock', 'paddle', 'bag', 'flapR', 'flapL', 'tie'] as const;
type BoneName = typeof BN[number];
const B = Object.fromEntries(BN.map((n, i) => [n, i])) as Record<BoneName, number>;

const EYE_X = 1.3, EYE_TH = 1.12;
const EYE_C = surfX(EYE_X, EYE_TH, -0.012);
const FLIP_X = 0.64, FLIP_TH = 2.08;
const FLIP_ROOT = surfX(FLIP_X, FLIP_TH, -0.06);
const KNOT = surfX(0.965, PI, 0.05);
/** the flipper's long axis at rest (+z side) */
const FLIP_DIR = norm([-0.3, -0.8, 0.52]), FLIP_W = norm(cross([0, 0, 1], FLIP_DIR)), FLIP_T = cross(FLIP_DIR, FLIP_W);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const BAG = { x: -0.13, top: -0.43, h: 0.33, hl: 0.24 };
const OFF = 0.032; // jacket thickness over the hide

const POS: Record<BoneName, V3> = {
  body: [0, 0, 0], chest: [0.42, 0, 0], neck: [0.96, -0.03, 0], head: [1.14, -0.04, 0], lip: [1.54, -0.22, 0], jaw: [1.33, -0.3, 0],
  lidR: EYE_C, lidL: mirror(EYE_C), flipR: FLIP_ROOT, flipL: mirror(FLIP_ROOT),
  lumbar: [-0.5, 0, 0], stock: [-1.08, 0.015, 0], paddle: [-1.44, 0.02, 0],
  bag: [BAG.x, BAG.top, 0], flapR: [BAG.x, BAG.top - 0.035, 0.128], flapL: [BAG.x, BAG.top - 0.035, -0.128], tie: KNOT,
};
const PARENT: Record<BoneName, BoneName | null> = {
  body: null, chest: 'body', neck: 'chest', head: 'neck', lip: 'head', jaw: 'head', lidR: 'head', lidL: 'head', flipR: 'chest', flipL: 'chest',
  lumbar: 'body', stock: 'lumbar', paddle: 'stock', bag: 'body', flapR: 'bag', flapL: 'bag', tie: 'neck',
};
type Wt = [number, number, number]; // bone a, bone b, weight of b
/** the spine chain blends over each joint, so the hide and everything sewn onto it bends as one */
function spineW(x: number): Wt {
  if (x > 0.17) {
    if (x < 0.67) return [B.body, B.chest, smooth(0.17, 0.67, x)];
    if (x < 0.89) return [B.chest, B.chest, 0];
    if (x < 1.03) return [B.chest, B.neck, smooth(0.89, 1.03, x)];
    if (x < 1.07) return [B.neck, B.neck, 0];
    if (x < 1.21) return [B.neck, B.head, smooth(1.07, 1.21, x)];
    return [B.head, B.head, 0];
  }
  if (x > -0.25) return [B.body, B.body, 0];
  if (x > -0.75) return [B.body, B.lumbar, smooth(-0.25, -0.75, x)];
  if (x > -0.94) return [B.lumbar, B.lumbar, 0];
  if (x > -1.22) return [B.lumbar, B.stock, smooth(-0.94, -1.22, x)];
  if (x > -1.35) return [B.stock, B.stock, 0];
  if (x > -1.53) return [B.stock, B.paddle, smooth(-1.35, -1.53, x)];
  return [B.paddle, B.paddle, 0];
}
/** the oral disk's lower half rides the lip bone (prehensile pads) */
const faceW = (p: V3): Wt => { const w = spineW(p[0]); if (w[0] !== B.head) return w; return [B.head, B.lip, smooth(-0.1, -0.24, p[1]) * smooth(1.44, 1.56, p[0])]; };

// ------------------------------------------------------------------ the painted page
const GLYPH: Record<string, string[]> = {
  M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  G: ['.XXXX', 'X....', 'X....', 'X..XX', 'X...X', 'X...X', '.XXXX'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
};
/** a little post horn (7 x 5) */
const HORN = ['..XXX..', '.X...XX', 'X..X..X', '.X...XX', '..XXX..'];

type Reg = Record<string, UVR>;
function paintPage(): { A: Atlas; R: Reg } {
  const A = new Atlas(256, 256);
  const K = hueRamp('#7e776b', 6, { spread: 0.7 });    // hide, dark -> light
  const G = hueRamp('#6c7a36', 5);                      // algae
  const M = hueRamp('#9e9384', 5, { spread: 0.8 });     // muzzle
  const P = hueRamp('#a68f86', 5, { spread: 0.8 });     // lip pads
  const N = hueRamp('#27396a', 6, { spread: 0.6 });     // postal navy
  const Rd = hueRamp('#a51f22', 5);                     // piping red
  const Au = hueRamp('#d6a23a', 5);                     // gold braid
  const Br = hueRamp('#b88a3e', 5);                     // brass
  const Le = hueRamp('#93592c', 5);                     // saddle leather
  const Ld = hueRamp('#5e3219', 5);                     // the flap's darker leather
  const SC: RGB[] = [hex('#5e524e'), hex('#c4aaa2'), hex('#e6d2ca')];
  const cream = hex('#efe6cf');
  const wrapRow = (p: Region, y: number) => ((Math.round(y) % p.h) + p.h) % p.h;
  const R: Reg = {};

  // the hide: u along the body (col 0 = the nose, col 127 = the paddle's edge), v around
  R.skin = A.paint('mSkin', 128, 96, (p, w, h) => {
    const X = (px: number) => X_NOSE - ((px + 0.5) / w) * (X_NOSE - X_TAIL);
    const TH = (py: number) => (0.5 - (py + 0.5) / h) * TAU;
    const paddleCol = Math.ceil(((X_NOSE + 1.47) / (X_NOSE - X_TAIL)) * w), muzCol = Math.floor(((X_NOSE - X_MUZ) / (X_NOSE - X_TAIL)) * w);
    p.fill((px, py) => {
      const c = Math.cos(TH(py));
      if (c > 0.6 + Math.sin(px * 0.23) * 0.07) return K[2];
      if (c < -0.6 + Math.sin(px * 0.19 + 1.3) * 0.07) return K[4];
      return K[3];
    });
    // pale old blotches on the flanks
    for (let i = 0; i < 9; i++) {
      const cx = 8 + hash2(i, 3) * (paddleCol - 14), cy = (hash2(i, 4) < 0.5 ? 14 : 62) + hash2(i, 5) * 20, rx = 2 + hash2(i, 6) * 3, ry = 1.5 + hash2(i, 7) * 2;
      for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) { const d = (x / rx) ** 2 + (y / ry) ** 2; if (d < 1) p.set(cx + x, wrapRow(p, cy + y), d > 0.55 ? K[3] : mix(K[3], K[4], 0.6)); }
    }
    // wrinkles: wavy creases running round the body, a lit lip behind each; tight rings at the neck and tail stock
    const crease = (x0: number, y0: number, len: number, amp: number, ph: number, strong = false) => {
      for (let i = 0; i < len; i++) {
        const y = wrapRow(p, y0 + i), x = Math.round(x0 + Math.sin(i * 0.45 + ph) * amp), back = Math.cos(TH(y)) > 0.55;
        if (back && !strong) { p.set(x, y, K[1]); continue; }
        p.set(x, y, strong ? K[1] : K[2]);
        if (strong) p.set(x + 1, y, K[4]); else if (i % 3 === 1) p.set(x + 1, y, mix(K[3], K[4], 0.35));
      }
    };
    for (let g = 0; g < 30; g++) {
      const x0 = muzCol + 4 + g * 4.3 + hash2(g, 1) * 2;
      if (x0 > paddleCol - 2) break;
      const xm = X(x0), dense = (xm > 0.8 && xm < 1.25) || (xm < -0.85 && xm > -1.5);
      for (let s = 0; s < (dense ? 7 : 4); s++) {
        const y0 = Math.floor(hash2(g, s + 7) * h), len = 5 + Math.floor(hash2(g, s + 31) * (dense ? 15 : 10));
        crease(x0 + (hash2(g, s + 50) - 0.5) * 2, y0, len, 0.5 + hash2(g, s) * 0.9, hash2(g, s + 3) * 6);
      }
    }
    for (const xm of [0.92, 1.0, 1.1]) crease(((X_NOSE - xm) / (X_NOSE - X_TAIL)) * w, 0, h, 0.8, xm * 9, true);
    // double-chin folds under the head
    for (let k = 0; k < 3; k++) { const x0 = muzCol + 3 + k * 3; crease(x0, h - 9 - k, 18 + k * 2, 1.2, k); }
    // sparse long hairs
    for (let cy = 0; cy < h; cy += 6) for (let cx = 0; cx < paddleCol; cx += 6) {
      if (hash2(cx, cy, 5) > 0.5) continue;
      p.set(cx + Math.floor(hash2(cx, cy, 6) * 5), cy + Math.floor(hash2(cx, cy, 7) * 5), K[5]);
    }
    // the paddle: radiating ribs over the top and bottom, a paler thin rim
    for (let x = paddleCol; x < w; x++) for (let y = 0; y < h; y++) {
      const th = TH(y), edge = Math.abs(Math.abs(th) - PI / 2);
      const rib = (y + Math.round(Math.sin(x * 0.3) * 1.2)) % 4;
      if (edge < 0.25) p.set(x, y, edge < 0.12 ? K[4] : K[3]);
      else p.set(x, y, rib === 0 ? K[1] : rib === 1 ? K[3] : Math.cos(th) > 0 ? K[2] : K[3]);
    }
    // the muzzle: a paler, pinker skin peppered with bristle follicles (a dark pit, a pale bristle tip above it)
    for (let x = 0; x <= muzCol + 1; x++) for (let y = 0; y < h; y++) {
      const c = Math.cos(TH(y));
      p.set(x, y, mix(c > 0.5 ? K[3] : K[4], hex('#a8938a'), x <= muzCol ? 0.35 : 0.15));
    }
    for (let cy = 0; cy < h; cy += 3) for (let cx = 0; cx <= muzCol; cx += 2) {
      const x = cx + Math.floor(hash2(cx, cy, 41) * 2), y = cy + 1 + Math.floor(hash2(cx, cy, 42) * 2);
      if (Math.cos(TH(y)) > 0.75 && hash2(cx, cy, 40) < 0.5) continue;
      p.set(x, y, K[1]); p.set(x, wrapRow(p, y - 1), K[4]);
    }
    // algae on the back: clean clumps with a sunlit upper edge
    const clump = (cx: number, cy: number, r: number, k: number) => {
      for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 2; x <= r + 2; x++) {
        const a = Math.atan2(y, x), rr = r * (1 + 0.25 * Math.sin(a * 3 + k) + 0.12 * Math.sin(a * 5 + k * 2));
        const d = Math.hypot(x * 0.8, y);
        if (d > rr) continue;
        const lit = Math.hypot(x * 0.8, y - 1) > rr;
        p.set(cx + x, wrapRow(p, cy + y), lit ? G[3] : d > rr - 1 ? G[1] : (x * 3 + y * 5 + k) % 7 === 0 ? G[3] : G[2]);
      }
    };
    for (let i = 0; i < 13; i++) clump(26 + hash2(i, 11) * (paddleCol - 30), 41 + hash2(i, 12) * 14, 1.5 + hash2(i, 13) * 3.2, i);
    for (let i = 0; i < 26; i++) p.set(22 + hash2(i, 21) * (paddleCol - 24), wrapRow(p, 38 + hash2(i, 22) * 20), G[hash2(i, 23) < 0.5 ? 1 : 2]);
    // propeller scars: four parallel slashes across the back behind the jacket, an older faded set by the tail
    const scar = (x0: number, y0: number, x1: number, y1: number, fresh: boolean) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t + Math.sin(t * 7) * 0.5, y = wrapRow(p, y0 + (y1 - y0) * t);
        p.set(x - 1, y, SC[0]); p.set(x, y, fresh ? SC[2] : SC[1]);
        if (fresh) { p.set(x + 1, y, SC[2]); p.set(x + 2, y, SC[1]); p.set(x + 3, y, SC[0]); } else p.set(x + 1, y, SC[0]);
      }
    };
    for (let k = 0; k < 4; k++) scar(60 + k * 6, 31 - k, 68 + k * 6, 64 - k, true);
    for (let k = 0; k < 3; k++) scar(86 + k * 4, 52, 89 + k * 4, 70, false);
  });
  // the oral disk seen head-on: follicles in arcs, the cleft, two closed crescent nostrils at the top
  R.face = A.paint('mFace', 32, 32, (p, w, h) => {
    p.fill((_x, y) => (y > 17 ? mix(mix(M[3], hex('#a8938a'), 0.35), hex('#b08a82'), (y - 17) / 18) : mix(M[3], hex('#a8938a'), 0.35)));
    for (let cy = 9; cy < h; cy += 3) for (let cx = 1; cx < w; cx += 3) {
      if (Math.abs(cx - 15.5) < 2) continue;
      const x = cx + Math.floor(hash2(cx, cy, 43) * 2), y = cy + Math.floor(hash2(cx, cy, 44) * 2);
      p.set(x, y, M[1]); p.set(x, y - 1, M[3]);
    }
    for (let y = 18; y < h; y++) { p.set(15, y, M[0]); p.set(16, y, M[1]); p.set(14, y, M[4]); }
    for (const nx of [10, 19]) {
      for (let i = 0; i < 4; i++) { p.set(nx + i, 5 - (i === 0 || i === 3 ? 1 : 0), K[0]); p.set(nx + i, 6 - (i === 0 || i === 3 ? 1 : 0), K[1]); p.set(nx + i, 3 - (i === 0 || i === 3 ? 1 : 0), M[4]); }
    }
  });
  R.pad = A.paint('mLip', 16, 16, (p, w, h) => {
    p.fill((_x, y) => (y < 4 ? P[2] : P[3]));
    for (let cy = 0; cy < h; cy += 2) for (let cx = 0; cx < w; cx += 3) {
      const x = cx + Math.floor(hash2(cx, cy, 45) * 2), y = cy + 1;
      p.set(x, y, P[0]); p.set(x, y - 1, P[4]);
    }
  });
  R.eye = A.paint('mEye', 8, 8, (p) => {
    p.fill((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); return d > 3.2 ? hex('#4a3426') : d > 2.2 ? hex('#2a1a12') : hex('#120a08'); });
    p.set(2, 2, '#eef4ff'); p.set(3, 2, '#98a6b6'); p.set(2, 3, '#98a6b6');
  });
  R.lid = A.paint('mLid', 8, 8, (p) => { p.fill((x, y) => ((x + y * 2) % 5 === 0 ? K[1] : y < 3 ? K[2] : K[3])); });
  R.flip = A.paint('mFlip', 16, 32, (p, w, h) => {
    p.fill((_x, y) => (y > h - 6 ? K[4] : K[3]));
    for (let y = 4; y < h - 5; y += 5) for (let x = 0; x < w; x++) { if (hash2(x >> 2, y, 63) < 0.3) continue; const yy = y + Math.round(Math.sin(x * 0.7 + y) * 0.8); p.set(x, yy, K[2]); p.set(x, yy - 1, K[4]); }
    for (let i = 0; i < 6; i++) p.set(hash2(i, 61) * w, hash2(i, 62) * (h - 6), K[5]);
  });
  R.nail = A.paint('mNail', 4, 4, (p) => p.fill((_x, y) => (y === 3 ? hex('#b9a984') : y === 0 ? hex('#f6eedb') : hex('#e4d9bd'))));
  R.mouth = A.paint('mMouth', 4, 4, (p) => p.fill((x, y) => ((x + y) % 2 ? hex('#3a1a1c') : hex('#5c2a2c'))));
  R.whisk = A.paint('mWhisk', 4, 4, (p) => p.fill((_x, y) => (y < 2 ? hex('#8e8576') : hex('#5f574d'))));
  // the jacket: navy twill; u from the hem (col 0) to the collar, v around like the hide
  R.coat = A.paint('mCoat', 64, 48, (p, w, h) => {
    p.fill((x, y) => ((x + y) % 4 === 0 ? N[3] : N[2]));
    for (let y = 0; y < h; y++) { p.set(0, y, N[1]); p.set(1, y, N[1]); }
    // back seam, side seams, and the double-breasted overlap along the belly
    for (let x = 0; x < w; x++) {
      p.set(x, 24, N[1]); p.set(x, 23, N[3]);
      p.set(x, 15, N[1]); p.set(x, 33, N[1]);
      p.set(x, 2, N[0]); p.set(x, 3, N[4]); p.set(x, 45, N[0]); p.set(x, 44, N[4]);
    }
    // pocket flaps on both lower flanks, piped in red, a brass button on each
    for (const [r0, dir] of [[9, -1], [38, 1]] as const) {
      for (let x = 6; x <= 21; x++) for (let k = 0; k < 4; k++) {
        const y = r0 + dir * k, tip = k === 3 && (x < 8 || x > 19);
        if (tip) continue;
        const edge = x === 6 || x === 21 || k === 0 || k === 3 || (k === 2 && (x === 7 || x === 20));
        p.set(x, y, edge ? Rd[2] : (x + k) % 3 === 0 ? N[4] : N[3]);
      }
      p.set(13, r0 + dir * 3, Br[3]); p.set(14, r0 + dir * 3, Br[2]);
      for (let x = 7; x <= 20; x++) p.set(x, r0 - dir, N[1]);
    }
  });
  R.coll = A.paint('mColl', 48, 8, (p, w, h) => {
    p.fill((x, y) => (y === 0 ? Rd[3] : y === 1 ? Rd[1] : (x + y) % 4 === 0 ? N[3] : N[2]));
    for (let x = 0; x < w; x++) p.set(x, h - 1, N[1]);
    // collar badges: gold post horns on both sides
    for (const cx of [14, 27]) HORN.forEach((row, yy) => { for (let xx = 0; xx < 7; xx++) if (row[xx] === 'X') p.set(cx + xx, 2 + yy, yy < 2 ? Au[4] : Au[2]); });
  });
  R.pipe = A.paint('mPipe', 4, 4, (p) => p.fill((_x, y) => (y === 0 ? Rd[4] : y === 3 ? Rd[1] : Rd[2])));
  // the cap: crown and band (u around, v down), top, black visor, enamel badge
  R.cap = A.paint('mCap', 48, 16, (p, w, h) => {
    p.fill((x, y) => {
      if (y >= 11) return y === 11 || y === 15 ? Au[y === 11 ? 3 : 1] : (x + y) % 4 === 0 ? Rd[3] : Rd[2];
      if (y <= 1) return N[4];
      return x % 12 === 0 ? N[1] : (x + y) % 3 === 0 ? N[3] : N[2];
    });
  });
  R.capTop = A.paint('mCapTop', 16, 16, (p, w, h) => {
    p.fill((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 6.5 ? N[3] : d < 1.5 ? N[3] : (x === 7 || y === 7) && d > 2.5 ? N[1] : N[2]; });
    void w; void h;
  });
  R.visor = A.paint('mVisor', 16, 8, (p) => p.fill((_x, y) => (y === 1 ? hex('#2a2a34') : y === 2 ? hex('#16161c') : hex('#08080b'))));
  R.badge = A.paint('mBadge', 16, 16, (p) => {
    p.fill((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 7.6 ? null : d > 6.4 ? Au[1] : d > 5.4 ? Au[3] : Rd[2]; });
    HORN.forEach((row, yy) => { for (let xx = 0; xx < 7; xx++) if (row[xx] === 'X') p.set(4 + xx, 5 + yy, yy < 2 ? Au[4] : Au[2]); });
    p.set(4, 4, Au[4]);
  });
  R.brass = A.paint('mBrass', 8, 8, (p) => p.fill((x, y) => { const d = Math.hypot(x - 3, y - 3); return d < 1.2 ? Br[4] : d < 2.6 ? Br[3] : d < 3.8 ? Br[2] : Br[1]; }));
  R.fringe = A.paint('mFringe', 16, 8, (p) => p.fill((x, y) => (y < 2 ? Au[y ? 2 : 3] : y === 7 && x % 2 ? null : x % 2 === 0 ? Au[3] : y > 5 ? Au[4] : Au[1])));
  R.epau = A.paint('mEpau', 16, 8, (p, w, h) => p.fill((x, y) => (x === 0 || x === w - 1 || y === h - 1 ? Au[1] : y === 0 ? Au[4] : (x + y) % 4 < 2 ? Au[3] : Au[2])));
  // the name tag: a brass-rimmed cream plate, MARGE in navy capitals
  R.tag = A.paint('mTag', 38, 11, (p, w, h) => {
    p.fill((x, y) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? Br[1] : x === 1 || y === 1 ? Br[4] : x === w - 2 || y === h - 2 ? Br[2] : y === 2 ? hex('#fbf4e2') : cream));
    'MARGE'.split('').forEach((ch, i) => GLYPH[ch].forEach((row, yy) => { for (let xx = 0; xx < 5; xx++) if (row[xx] === 'X') p.set(4 + i * 6 + xx, 2 + yy, N[0]); }));
  });
  R.scarf = A.paint('mScarf', 16, 16, (p) => p.fill((x, y) => ((x + (y >> 2) * 2) % 4 === 0 && y % 4 === 1 ? hex('#f4ead8') : (x + y) % 4 === 0 ? Rd[3] : Rd[2])));
  R.leather = A.paint('mLeather', 32, 24, (p, w, h) => {
    // smooth tan hide, a paler worn band round the middle, darker where it sags at the bottom, a few soft creases
    p.fill((x, y) => (y > h - 5 ? Le[1] : y > h - 9 ? mix(Le[1], Le[2], 0.5) : y > 7 && y < 12 ? mix(Le[2], Le[3], 0.45) : Le[2]));
    for (let i = 0; i < 4; i++) { const y0 = 13 + i * 2, x0 = 4 + i * 6; for (let x = x0; x < x0 + 6; x++) p.set(x, y0 + Math.round(Math.sin(x * 0.8) * 0.6), Le[1]); }
    for (let x = 0; x < w; x++) { p.set(x, 0, Le[3]); p.set(x, h - 1, Le[0]); if (x % 3 === 0) p.set(x, h - 3, Le[3]); }
  });
  R.flap = A.paint('mFlap', 32, 16, (p, w, h) => {
    p.fill((x, y) => (x === 0 || x === w - 1 || y === h - 1 ? Ld[0] : y === 0 ? Ld[3] : y === 1 ? Ld[2] : x < 2 || x > w - 3 ? Ld[2] : Ld[1]));
    for (let x = 2; x < w - 2; x += 2) p.set(x, h - 3, cream);
    for (let y = 2; y < h - 3; y += 2) { p.set(2, y, cream); p.set(w - 3, y, cream); }
    HORN.forEach((row, yy) => { for (let xx = 0; xx < 7; xx++) if (row[xx] === 'X') p.set(12 + xx, 4 + yy, yy < 2 ? Au[3] : Au[1]); });
  });
  R.strap = A.paint('mStrap', 8, 24, (p, w, h) => p.fill((x, y) => (x === 0 || x === w - 1 ? Le[1] : (x === 1 || x === w - 2) && y % 3 === 0 ? Le[4] : x === 3 ? Le[3] : Le[2])));
  R.env = A.paint('mEnv', 16, 10, (p, w, h) => p.fill((x, y) => {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return ((x + y) >> 1) % 2 ? hex('#c83a30') : hex('#3456a8');
    if (x >= 11 && x <= 13 && y >= 2 && y <= 4) return x === 12 && y === 3 ? hex('#f4d26a') : hex('#c83a30');
    if ((y === 4 || y === 6) && x > 2 && x < (y === 4 ? 9 : 11)) return hex('#8a8a98');
    return cream;
  }));
  return { A, R };
}

// ------------------------------------------------------------------ geometry kit
const U = (r: UVR, u: number, v: number): V2 => [r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v];
/** a triangle wound so its face points along `want` */
function triN(s: Soup, a: V3, b: V3, c: V3, ua: V2, ub: V2, uc: V2, want: V3) {
  if (dot(cross(sub(b, a), sub(c, a)), want) >= 0) s.tri(a, b, c, ua, ub, uc); else s.tri(a, c, b, ua, uc, ub);
}
/**
 * Loft rings of equal length. uv(j, k) for ring j, point k (k may equal n on a closed ring: the seam). Faces point
 * away from the middle of each ring pair unless `want` says otherwise.
 */
function loft(s: Soup, rings: V3[][], uv: (j: number, k: number) => V2, o: { closed?: boolean; alt?: boolean; want?: (c: V3, j: number, k: number) => V3 } = {}) {
  const n = rings[0].length, closed = o.closed ?? true;
  const cens = rings.map((r) => centroid(...r));
  for (let j = 0; j < rings.length - 1; j++) {
    const mid = mixV(cens[j], cens[j + 1], 0.5);
    for (let k = 0; k < (closed ? n : n - 1); k++) {
      const k2 = k + 1;
      const a = rings[j][k], b = rings[j][k2 % n], c = rings[j + 1][k2 % n], d = rings[j + 1][k];
      const W = (t: V3) => (o.want ? o.want(t, j, k) : sub(t, mid));
      if (o.alt && (j + k) & 1) {
        triN(s, a, b, d, uv(j, k), uv(j, k2), uv(j + 1, k), W(centroid(a, b, d)));
        triN(s, b, c, d, uv(j, k2), uv(j + 1, k2), uv(j + 1, k), W(centroid(b, c, d)));
      } else {
        triN(s, a, b, c, uv(j, k), uv(j, k2), uv(j + 1, k2), W(centroid(a, b, c)));
        triN(s, a, c, d, uv(j, k), uv(j + 1, k2), uv(j + 1, k), W(centroid(a, c, d)));
      }
    }
  }
}
/** close a ring to a point */
function fan(s: Soup, ring: V3[], tip: V3, uv: (k: number) => V2, uvTip: V2) {
  const n = ring.length, cen = centroid(...ring);
  for (let k = 0; k < n; k++) { const a = ring[k], b = ring[(k + 1) % n]; triN(s, a, b, tip, uv(k), uv(k + 1), uvTip, sub(centroid(a, b, tip), cen)); }
}
/** n points round c in the plane (u1, u2): counter-clockwise seen from u1 x u2 */
function ringAt(c: V3, u1: V3, u2: V3, r1: number, r2: number, n: number, a0 = 0): V3[] {
  const out: V3[] = [];
  for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU; out.push(add(c, add(mul(u1, Math.cos(a) * r1), mul(u2, Math.sin(a) * r2)))); }
  return out;
}
/** a frame (u1, u2) perpendicular to axis f */
function frame(f: V3): [V3, V3] {
  const u1 = norm(Math.abs(f[1]) < 0.9 ? cross(f, [0, 1, 0]) : cross(f, [1, 0, 0]));
  return [u1, cross(f, u1)];
}
/** a little dome (button, nail, eye) sitting on base point c, bulging along f */
function dome(s: Soup, c: V3, f: V3, r1: number, r2: number, hgt: number, n: number, reg: UVR, u1?: V3) {
  const [a1, a2] = u1 ? [u1, cross(f, u1)] : frame(f);
  const r0 = ringAt(c, a1, a2, r1, r2, n), rm = ringAt(add(c, mul(f, hgt * 0.7)), a1, a2, r1 * 0.72, r2 * 0.72, n);
  const pu = (k: number, rr: number): V2 => U(reg, 0.5 + Math.cos((k / n) * TAU) * 0.5 * rr, 0.5 + Math.sin((k / n) * TAU) * 0.5 * rr);
  loft(s, [r0, rm], (j, k) => pu(k, j ? 0.6 : 1));
  fan(s, rm, add(c, mul(f, hgt)), (k) => pu(k, 0.6), U(reg, 0.5, 0.5));
}
/** duplicate the triangles added since `from`, mirrored to the -z side */
function mirrorSince(s: Soup, from: number, flipU?: UVR) {
  const end = s.count;
  for (let f = from; f < end; f += 3) {
    for (const i of [f, f + 2, f + 1]) {
      s.P.push(s.P[i * 3], s.P[i * 3 + 1], -s.P[i * 3 + 2]);
      let u = s.UV[i * 2];
      if (flipU) u = flipU.u0 + flipU.u1 - u;
      s.UV.push(u, s.UV[i * 2 + 1]);
      s.C.push(s.C[i * 3], s.C[i * 3 + 1], s.C[i * 3 + 2]);
      s.S.push(s.S[i * 4], s.S[i * 4 + 1], s.S[i * 4 + 2], s.S[i * 4 + 3]);
      s.G.push(s.G[i]);
    }
  }
}
/** a double-sided flat card (letters) */
function card(s: Soup, c: V3, ax: V3, ay: V3, w: number, h: number, reg: UVR) {
  const a = sub(sub(c, mul(ax, w / 2)), mul(ay, h / 2)), b = add(sub(c, mul(ay, h / 2)), mul(ax, w / 2));
  const cc = add(add(c, mul(ax, w / 2)), mul(ay, h / 2)), d = sub(add(c, mul(ay, h / 2)), mul(ax, w / 2));
  s.tri(a, b, cc, U(reg, 0, 0), U(reg, 1, 0), U(reg, 1, 1)); s.tri(a, cc, d, U(reg, 0, 0), U(reg, 1, 1), U(reg, 0, 1));
  s.tri(a, cc, b, U(reg, 0, 0), U(reg, 1, 1), U(reg, 1, 0), 0.8, 0.8, 0.8); s.tri(a, d, cc, U(reg, 0, 0), U(reg, 0, 1), U(reg, 1, 1), 0.8, 0.8, 0.8);
}

// ------------------------------------------------------------------ building Marge
const NB = 20; // points round the body
const thK = (k: number, n = NB) => PI + (k / n) * TAU;

class Build {
  s = new Soup();
  private mark = 0;
  constructor(public R: Reg) {}
  /** bind every vertex added since the last bind */
  bind(fn: (p: V3) => Wt) {
    const s = this.s;
    for (let i = this.mark; i < s.count; i++) {
      const w = fn([s.P[i * 3], s.P[i * 3 + 1], s.P[i * 3 + 2]]);
      s.S[i * 4] = w[0]; s.S[i * 4 + 1] = w[1]; s.S[i * 4 + 2] = w[2]; s.S[i * 4 + 3] = 0;
    }
    this.mark = s.count;
  }
  rigid(b: number) { this.bind(() => [b, b, 0]); }
  spine() { this.bind((p) => spineW(p[0])); }

  hide() {
    const { s, R } = this;
    const ring = (sec: Sec) => {
      const out: V3[] = [];
      for (let k = 0; k < NB; k++) {
        const p = surf(sec, thK(k));
        // an old notch bitten out of the paddle's right edge (every real manatee has one: it's how they're told apart)
        if (sec.x > -2.13 && sec.x < -2.0 && p[2] > 0.2) p[2] -= 0.075;
        out.push(p);
      }
      return out;
    };
    const body = ST.slice(0, MUZ + 1).map(ring), muz = ST.slice(MUZ).map(ring);
    const uB = (x: number) => (X_NOSE - x) / (X_NOSE - X_TAIL);
    loft(s, body, (j, k) => U(R.skin, uB(ST[j].x), k / NB), { alt: true });
    fan(s, body[0], [X_TAIL - 0.015, ST[0].y, 0], (k) => U(R.skin, 1, k / NB), U(R.skin, 1, 0.5));
    this.spine();
    loft(s, muz, (j, k) => U(R.skin, uB(ST[MUZ + j].x), k / NB), { alt: true });
    // the oral disk: a domed, bristly front face, facing forward-down, with the cleft running up its lower half
    const last = ST[ST.length - 1], fw: V3 = [Math.cos(last.phi), Math.sin(last.phi), 0], up: V3 = [-Math.sin(last.phi), Math.cos(last.phi), 0];
    const capRing = (sc: number, push: number) => {
      const out: V3[] = [];
      for (let k = 0; k < NB; k++) {
        const [ly, lz] = outline(last, thK(k));
        const cleft = ly < 0 && Math.abs(lz) < 0.02 ? -0.022 * (1 - sc) * 2 : 0;
        out.push(add(add(center(last), add(mul(up, ly * sc), [0, 0, lz * sc])), mul(fw, push + cleft)));
      }
      return out;
    };
    const fr = [muz[muz.length - 1], capRing(0.8, 0.045), capRing(0.5, 0.08)];
    const fuv = (p: V3): V2 => { const d = sub(p, center(last)); return U(R.face, clamp(0.5 + d[2] / 0.6, 0, 1), clamp(0.5 + dot(d, up) / 0.44, 0, 1)); };
    loft(s, fr, (j, k) => fuv(fr[j][k % NB]));
    const tip = add(center(last), mul(fw, 0.094));
    fan(s, fr[2], tip, (k) => fuv(fr[2][k % NB]), fuv(tip));
    this.bind(faceW);
    // the cleft upper lip: two big bristly pads bulging out of the lower face
    const padC = (side: number): V3 => add(add(add(center(last), mul(up, -0.11)), mul(fw, 0.03)), [0, 0, side * 0.1]);
    const ico = icosphere(1);
    for (const side of [1, -1]) {
      const c = padC(side), pt = (i: number): V3 => { const q: V3 = [ico.p[i * 3], ico.p[i * 3 + 1], ico.p[i * 3 + 2]]; return add(c, add(add(mul(fw, q[0] * 0.088), mul(up, q[1] * 0.105)), [0, 0, q[2] * 0.12])); };
      for (let f = 0; f < ico.i.length; f += 3) {
        const a = pt(ico.i[f]), b = pt(ico.i[f + 1]), cc = pt(ico.i[f + 2]);
        const uv = (p: V3): V2 => U(R.pad, clamp(0.5 + (p[2] - c[2]) / 0.24, 0, 1), clamp(0.5 + dot(sub(p, c), up) / 0.21, 0, 1));
        triN(s, a, b, cc, uv(a), uv(b), uv(cc), sub(centroid(a, b, cc), c));
      }
      // stiff dark bristles (vibrissae) fanning out of the pads
      for (let i = 0; i < 7; i++) {
        const e = 0.6 + 0.25 * (i % 3), az = -0.7 + i * 0.26;
        const v = norm(add(add(mul(fw, Math.cos(e)), mul(up, Math.sin(e) * Math.sin(az))), [0, 0, side * Math.sin(e) * Math.cos(az)]));
        const root = add(c, add(add(mul(fw, dot(v, fw) * 0.084), mul(up, dot(v, up) * 0.1)), [0, 0, v[2] * 0.115]));
        const dir = norm(add(add(v, mul(fw, 0.6)), [0, 0, side * 0.3]));
        s.tube([root, add(root, mul(dir, 0.028 + 0.012 * (i % 2)))], (t) => 0.0055 * (1 - t * 0.5), 3, R.whisk, { tip: true });
      }
    }
    this.rigid(B.lip);
    // the small lower lip under the pads (rides the jaw) and the dark mouth behind it (shows when she talks)
    s.box([1.36, -0.375, -0.08], [0.2, 0.07, 0.16], R.mouth);
    this.rigid(B.head);
    const lipRings = [[1.33, 0.04, 0.09], [1.41, 0.05, 0.11], [1.49, 0.045, 0.105], [1.55, 0.03, 0.07]].map(([x, ry, rz]) => {
      const out: V3[] = [];
      for (let k = 0; k < 10; k++) { const th = thK(k, 10), c = Math.cos(th), sn = Math.sin(th); out.push([x, -0.372 + (c > 0 ? c * ry * 0.4 : c * ry), sn * rz]); }
      return out;
    });
    loft(s, lipRings, (j, k) => U(R.pad, j / 3, k / 10));
    fan(s, lipRings[0], [1.3, -0.37, 0], (k) => U(R.pad, 0, k / 10), U(R.pad, 0, 0.5));
    fan(s, lipRings[3], [1.575, -0.372, 0], (k) => U(R.pad, 1, k / 10), U(R.pad, 1, 0.5));
    for (const z of [-0.05, 0.05]) s.tube([[1.52, -0.41, z], [1.56, -0.44, z * 1.5]], (t) => 0.005 * (1 - t * 0.5), 3, R.whisk, { tip: true });
    this.rigid(B.jaw);
  }

  /** small eyes in a wrinkled socket, and the ring lid that closes over them (built on the +z side, then mirrored) */
  eyes() {
    const { s, R } = this;
    const f = normalAt(EYE_X, EYE_TH), [a1, a2] = frame(f);
    const at = (h: number) => add(EYE_C, mul(f, h));
    const socket = [ringAt(at(-0.006), a1, a2, 0.066, 0.06, 8), ringAt(at(0.01), a1, a2, 0.05, 0.046, 8), ringAt(at(0.012), a1, a2, 0.04, 0.037, 8), ringAt(at(0.002), a1, a2, 0.033, 0.031, 8)];
    const from0 = s.count;
    loft(s, socket, (j, k) => U(R.lid, k / 8, j / 3), { want: () => f });
    dome(s, at(-0.004), f, 0.034, 0.032, 0.024, 8, R.eye, a1);
    this.rigid(B.head);
    mirrorSince(s, from0);
    this.rigid(B.head);
    const from = s.count;
    dome(s, at(-0.003), f, 0.043, 0.041, 0.04, 8, R.lid, a1);
    this.rigid(B.lidR);
    mirrorSince(s, from);
    this.rigid(B.lidL);
  }

  /** a mitten flipper with three nails and a short uniform sleeve (built on the +z side) */
  flipper() {
    const { s, R } = this;
    const from = s.count;
    const L = FLIP_DIR, W = FLIP_W, T = FLIP_T;
    const LEN = 0.5;
    const path = (t: number) => add(add(FLIP_ROOT, mul(L, LEN * t)), add(mul(W, -0.07 * t * t), mul(T, 0.03 * t)));
    const prof: [number, number, number][] = [[-0.04, 0.075, 0.052], [0.14, 0.08, 0.045], [0.32, 0.092, 0.037], [0.52, 0.108, 0.031], [0.72, 0.118, 0.027], [0.88, 0.106, 0.023], [0.97, 0.07, 0.017]];
    const sec = (t: number, w: number, h: number, n = 10) => {
      const c = path(t), out: V3[] = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU, ca = Math.cos(a), sa = Math.sin(a); out.push(add(c, add(mul(W, Math.sign(ca) * Math.pow(Math.abs(ca), 0.8) * w), mul(T, Math.sign(sa) * Math.pow(Math.abs(sa), 0.8) * h)))); }
      return out;
    };
    const rings = prof.map(([t, w, h]) => sec(t, w, h));
    loft(s, rings, (j, k) => U(R.flip, k / 10, (j / (prof.length - 1)) * 0.95), { alt: true });
    fan(s, rings[rings.length - 1], path(1.03), (k) => U(R.flip, k / 10, 0.97), U(R.flip, 0.5, 1));
    // three nails on the back of the tip
    for (const o of [0.048, 0, -0.048]) {
      const t = 0.86 - Math.abs(o) * 0.8, c = add(add(path(t), mul(W, o)), mul(T, 0.021));
      dome(s, c, T, 0.019, 0.014, 0.009, 6, R.nail, L);
    }
    // the sleeve: navy, a red-piped cuff
    const sl = [sec(-0.08, 0.104, 0.074, 10), sec(0.12, 0.106, 0.07, 10), sec(0.2, 0.112, 0.074, 10), sec(0.225, 0.112, 0.074, 10), sec(0.235, 0.09, 0.05, 10)];
    loft(s, sl.slice(0, 3), (j, k) => U(R.coat, 0.2 + j * 0.15, k / 10));
    loft(s, sl.slice(2), (j, k) => U(R.pipe, k / 10, j / 2));
    this.rigid(B.flipR);
    mirrorSince(s, from);
    this.rigid(B.flipL);
  }

  /** the peaked postal cap, sat snug on the crown of her head */
  cap() {
    const { s, R } = this;
    // the cap sits tipped forward on a plane that follows the slope of her head (flat crown, falling forehead), so
    // its band is an even height all round with its lower edge sunk into the hide, clear of the collar behind
    const cx = 1.14, a = 0.165, b = 0.165, n = 16, slope = -0.32;
    const plane = (x: number) => topY(cx, 0) - 0.03 + (x - cx) * slope;
    // rings counter-clockwise seen from above: start on the +z side, then the front (+x)
    const pt = (al: number, k: number, y: number): V3 => [cx + Math.sin(al) * a * k, y, Math.cos(al) * b * k];
    const lift = (al: number) => 0.04 * Math.max(0, Math.sin(al)) ** 2;
    const yb = (al: number) => { const b0 = pt(al, 1, 0); return Math.min(topY(b0[0], b0[2]) - 0.03, plane(b0[0]) - 0.01); };
    const rings: V3[][] = [[], [], [], [], []];
    for (let i = 0; i < n; i++) {
      const al = (i / n) * TAU, x = cx + Math.sin(al) * a, y = plane(x);
      rings[0].push([x, yb(al), Math.cos(al) * b]);
      rings[1].push(pt(al, 1.03, y + 0.052));
      rings[2].push(pt(al, 1.06, y + 0.07));
      rings[3].push(pt(al, 1.27, y + 0.152 + lift(al)));
      rings[4].push(pt(al, 1.2, y + 0.174 + lift(al)));
    }
    const vRow = [15.5 / 16, 11 / 16, 10 / 16, 2 / 16, 0.5 / 16];
    loft(s, rings, (j, k) => U(R.cap, k / n, 1 - vRow[j]));
    const topC: V3 = [cx + 0.02, plane(cx + 0.02) + 0.19, 0];
    fan(s, rings[4], topC, (k) => { const al = (k / n) * TAU; return U(R.capTop, 0.5 + Math.sin(al) * 0.45, 0.5 + Math.cos(al) * 0.45); }, U(R.capTop, 0.5, 0.5));
    // the visor: a stiff black crescent over the brow
    const vn = 8, inner: V3[] = [], outer: V3[] = [];
    for (let i = 0; i <= vn; i++) {
      const al = PI / 2 - 1.15 + (i / vn) * 2.3, q = Math.cos(((i / vn) * 2 - 1) * 1.2);
      const base = pt(al, 1.0, 0);
      const y = plane(base[0]) + 0.004;
      inner.push([base[0] - Math.sin(al) * 0.01, y, base[2] - Math.cos(al) * 0.01]);
      outer.push([base[0] + Math.sin(al) * 0.15 * q, y - 0.15 * q * 0.16 - 0.012 * q - 0.003, base[2] + Math.cos(al) * 0.12 * q]);
    }
    const down = (p: V3): V3 => [p[0], p[1] - 0.013, p[2]];
    for (let i = 0; i < vn; i++) {
      const A1 = inner[i], A2 = inner[i + 1], B1 = outer[i], B2 = outer[i + 1], u0 = i / vn, u1 = (i + 1) / vn;
      triN(s, A1, A2, B2, U(R.visor, u0, 0), U(R.visor, u1, 0), U(R.visor, u1, 1), [0.3, 1, 0]); triN(s, A1, B2, B1, U(R.visor, u0, 0), U(R.visor, u1, 1), U(R.visor, u0, 1), [0.3, 1, 0]);
      triN(s, down(A1), down(A2), down(B2), U(R.visor, u0, 0.6), U(R.visor, u1, 0.6), U(R.visor, u1, 0.9), [0, -1, 0]); triN(s, down(A1), down(B2), down(B1), U(R.visor, u0, 0.6), U(R.visor, u1, 0.9), U(R.visor, u0, 0.9), [0, -1, 0]);
      const out = norm([B1[0] - cx, 0, B1[2]]);
      triN(s, B1, B2, down(B2), U(R.visor, u0, 0.1), U(R.visor, u1, 0.1), U(R.visor, u1, 0.2), out); triN(s, B1, down(B2), down(B1), U(R.visor, u0, 0.1), U(R.visor, u1, 0.2), U(R.visor, u0, 0.2), out);
    }
    // the badge on the crown's front, the gold cord over the visor and its two brass side buttons
    const f1 = rings[2][Math.round(n / 4)], f2 = rings[3][Math.round(n / 4)], tf = norm(sub(f2, f1)), nf = norm([tf[1], -tf[0], 0]);
    const bc = add(mixV(f1, f2, 0.45), mul(nf, 0.01)), bz: V3 = [0, 0, 0.04], by = mul(tf, 0.042);
    s.glow(0.08);
    triN(s, sub(sub(bc, bz), by), add(sub(bc, by), bz), add(add(bc, by), bz), U(R.badge, 0, 0), U(R.badge, 1, 0), U(R.badge, 1, 1), nf);
    triN(s, sub(sub(bc, bz), by), add(add(bc, by), bz), sub(add(bc, by), bz), U(R.badge, 0, 0), U(R.badge, 1, 1), U(R.badge, 0, 1), nf);
    s.glow(0);
    const cord: V3[] = [];
    for (let i = 0; i <= 8; i++) { const al = PI / 2 - 1.0 + (i / 8) * 2.0; cord.push(pt(al, 1.065, plane(cx + Math.sin(al) * a) + 0.03)); }
    s.tube(cord, () => 0.009, 3, R.fringe);
    for (const al of [PI / 2 - 1.04, PI / 2 + 1.04]) { const p = pt(al, 1.05, plane(cx + Math.sin(al) * a) + 0.03); dome(s, p, norm([Math.sin(al), 0, Math.cos(al)]), 0.016, 0.016, 0.01, 6, R.brass); }
    this.rigid(B.head);
  }

  /** the jacket, its collar and piping, buttons, epaulettes, name tags */
  jacket() {
    const { s, R } = this;
    const hem = (th: number) => 0.175 + 0.045 * Math.cos(th);
    const XC = 0.885;
    const xs = [-1, 0.28, 0.4, 0.52, 0.64, 0.75, 0.84, XC];
    const uJ = (x: number) => (x - 0.13) / (0.95 - 0.13);
    const ringJ = (x: number, off: number) => { const out: V3[] = []; for (let k = 0; k < NB; k++) { const th = thK(k); out.push(surfX(x < 0 ? hem(th) : x, th, off)); } return out; };
    const shell = xs.map((x) => ringJ(x, OFF));
    loft(s, shell, (j, k) => U(R.coat, uJ(j === 0 ? hem(thK(k)) : xs[j]), k / NB), { alt: true });
    // the hem: the jacket's thickness turned under, and red piping along its edge
    const hemIn: V3[] = [], hemPipe: V3[][] = [[], [], [], []];
    for (let k = 0; k < NB; k++) {
      const th = thK(k), x = hem(th);
      hemIn.push(surfX(x, th, 0.004));
      hemPipe[0].push(surfX(x - 0.008, th, OFF - 0.004)); hemPipe[1].push(surfX(x - 0.005, th, OFF + 0.012));
      hemPipe[2].push(surfX(x + 0.02, th, OFF + 0.012)); hemPipe[3].push(surfX(x + 0.03, th, OFF));
    }
    loft(s, [hemIn, shell[0]], (_j, k) => U(R.coat, 0, k / NB), { want: () => [-1, 0, 0] });
    loft(s, hemPipe, (j, k) => U(R.pipe, k / NB, j / 3));
    // the standing collar, red-piped along its top, with gold collar badges
    const cl = [ringJ(XC, OFF), ringJ(0.9, OFF + 0.034), ringJ(0.928, OFF + 0.038)];
    loft(s, cl, (j, k) => U(R.coll, k / NB, 1 - [7.5, 4, 0.5][j] / 8));
    const clFront = [cl[2], ringJ(0.94, OFF + 0.012), ringJ(0.935, -0.004)];
    loft(s, clFront, (j, k) => U(R.coll, k / NB, j ? 0.3 : 0.75), { want: () => [1, 0, 0] });
    this.spine();
    // brass buttons: a row down each lower flank
    let from = s.count;
    for (const x of [0.4, 0.53, 0.66]) { const th = PI - 0.62, f = normalAt(x, th); dome(s, surfX(x, th, OFF - 0.006), f, 0.027, 0.027, 0.02, 6, R.brass); }
    // the epaulette: a gold-bordered board on the shoulder with a gold fringe hanging off its outer edge
    const ex = [0.56, 0.6, 0.645, 0.69, 0.73], eth = (i: number, q: number) => lerp(1.36, 1.66, q) + (i === 0 || i === ex.length - 1 ? (q < 0.5 ? 0.05 : -0.04) : 0);
    const plate: V3[][] = ex.map((x, i) => [0, 0.5, 1].map((q) => surfX(x, eth(i, q), OFF + 0.02)));
    for (let i = 0; i < ex.length - 1; i++) for (let q = 0; q < 2; q++) {
      const a = plate[i][q], b = plate[i][q + 1], c = plate[i + 1][q + 1], d = plate[i + 1][q];
      const nn = normalAt(ex[i], 1.5), uv = (ii: number, qq: number) => U(R.epau, ii / (ex.length - 1), qq / 2);
      triN(s, a, b, c, uv(i, q), uv(i, q + 1), uv(i + 1, q + 1), nn); triN(s, a, c, d, uv(i, q), uv(i + 1, q + 1), uv(i + 1, q), nn);
    }
    // its edges down to the jacket
    const edge = (p: V3, x: number, th: number) => [p, surfX(x, th, OFF - 0.004)] as const;
    const rim: [V3, V3][] = [];
    for (let i = 0; i < ex.length; i++) rim.push(edge(plate[i][2], ex[i], eth(i, 1)) as [V3, V3]);
    for (let i = ex.length - 1; i >= 0; i--) rim.push(edge(plate[i][0], ex[i], eth(i, 0)) as [V3, V3]);
    const pc = centroid(...plate.map((r) => r[1]));
    for (let i = 0; i < rim.length; i++) {
      const [a, a2] = rim[i], [b, b2] = rim[(i + 1) % rim.length], out = sub(centroid(a, b), pc);
      triN(s, a, b, b2, U(R.epau, 0, 0), U(R.epau, 0.1, 0), U(R.epau, 0.1, 0.1), out); triN(s, a, b2, a2, U(R.epau, 0, 0), U(R.epau, 0.1, 0.1), U(R.epau, 0, 0.1), out);
    }
    const fr: V3[][] = [ex.map((x, i) => surfX(x, eth(i, 1) - 0.01, OFF + 0.018)), ex.map((x, i) => surfX(x, eth(i, 1) + 0.15, OFF + 0.028))];
    loft(s, fr, (j, k) => U(R.fringe, k / (ex.length - 1), 1 - j), { closed: false, want: (c) => normalAt(c[0], 1.75) });
    dome(s, surfX(0.645, 1.42, OFF + 0.018), normalAt(0.645, 1.42), 0.016, 0.016, 0.012, 6, R.brass);
    mirrorSince(s, from);
    // the name tag on each flank (the -z one flipped so MARGE still reads left to right)
    from = s.count;
    const tx = [0.27, 0.33, 0.39, 0.45], tth = [1.3, 1.52];
    const tg = tx.map((x) => tth.map((th) => surfX(x, th, OFF + 0.009)));
    for (let i = 0; i < tx.length - 1; i++) {
      const a = tg[i][1], b = tg[i + 1][1], c = tg[i + 1][0], d = tg[i][0], nn = normalAt(tx[i], 1.5);
      const u0 = i / (tx.length - 1), u1 = (i + 1) / (tx.length - 1);
      triN(s, a, b, c, U(R.tag, u0, 0), U(R.tag, u1, 0), U(R.tag, u1, 1), nn); triN(s, a, c, d, U(R.tag, u0, 0), U(R.tag, u1, 1), U(R.tag, u0, 1), nn);
    }
    mirrorSince(s, from, R.tag);
    this.spine();
  }

  /** the red neckerchief: a band round the throat in front of the collar, a knot, two tails */
  scarf() {
    const { s, R } = this;
    const n = 12, band: V3[][] = [[], [], []];
    for (let k = 0; k <= n; k++) {
      const th = PI - 1.85 + (k / n) * 3.7, taper = 1 - Math.pow(Math.abs(k / n * 2 - 1), 3) * 0.7;
      band[0].push(surfX(0.972 - 0.022 * taper, th, 0.02)); band[1].push(surfX(0.975, th, 0.03)); band[2].push(surfX(0.972 + 0.022 * taper, th, 0.02));
    }
    loft(s, band, (j, k) => U(R.scarf, k / n, j / 2), { closed: false, want: (c) => sub(c, [c[0], -0.03, 0]) });
    this.spine();
    const ico = icosphere(0);
    for (let f = 0; f < ico.i.length; f += 3) {
      const pt = (i: number): V3 => add(KNOT, [ico.p[i * 3] * 0.042, ico.p[i * 3 + 1] * 0.036, ico.p[i * 3 + 2] * 0.048]);
      const a = pt(ico.i[f]), b = pt(ico.i[f + 1]), c = pt(ico.i[f + 2]);
      triN(s, a, b, c, U(R.scarf, 0.2, 0.2), U(R.scarf, 0.6, 0.3), U(R.scarf, 0.4, 0.7), sub(centroid(a, b, c), KNOT));
    }
    this.rigid(B.neck);
    // the two tails hang from the knot (they ride the tie bone and swing)
    for (const [dx, len, dz, wid] of [[-0.06, 0.17, 0.016, 0.07], [0.045, 0.14, -0.016, 0.06]]) {
      const top = add(KNOT, [0, -0.02, dz]), a: V3 = add(top, [-wid / 2, 0, 0]), b: V3 = add(top, [wid / 2, 0, 0]);
      const tipL: V3 = add(top, [dx - 0.016, -len, 0]), tipR: V3 = add(top, [dx + 0.016, -len + 0.03, 0]);
      for (const zz of [0.007, -0.007]) {
        const sh = (p: V3): V3 => [p[0], p[1], p[2] + zz], wz: V3 = [0, 0, Math.sign(zz)];
        triN(s, sh(a), sh(b), sh(tipR), U(R.scarf, 0, 1), U(R.scarf, 1, 1), U(R.scarf, 0.9, 0), wz);
        triN(s, sh(a), sh(tipR), sh(tipL), U(R.scarf, 0, 1), U(R.scarf, 0.9, 0), U(R.scarf, 0.2, 0), wz);
      }
      const rimPts = [a, b, tipR, tipL];
      for (let i = 0; i < 4; i++) {
        const p = rimPts[i], q = rimPts[(i + 1) % 4], o = sub(centroid(p, q), centroid(a, b, tipR, tipL));
        triN(s, [p[0], p[1], p[2] + 0.007], [q[0], q[1], q[2] + 0.007], [q[0], q[1], q[2] - 0.007], U(R.scarf, 0, 0), U(R.scarf, 0.1, 0), U(R.scarf, 0.1, 0.1), o);
        triN(s, [p[0], p[1], p[2] + 0.007], [q[0], q[1], q[2] - 0.007], [p[0], p[1], p[2] - 0.007], U(R.scarf, 0, 0), U(R.scarf, 0.1, 0.1), U(R.scarf, 0, 0.1), o);
      }
    }
    this.rigid(B.tie);
  }

  /** the mailbag under her belly and the strap that loops right round her body */
  mailbag() {
    const { s, R } = this;
    // the strap lies in a tilted plane (forward over the back, back under the belly where the bag hangs)
    const X0 = -0.03, KX = 0.2, HW = 0.032;
    const xAt = (th: number) => { let x = X0; for (let i = 0; i < 5; i++) x = X0 + KX * surfX(x, th)[1]; return x; };
    const n = NB, fo: V3[] = [], bo: V3[] = [], fi: V3[] = [], bi: V3[] = [];
    for (let k = 0; k < n; k++) {
      const th = thK(k), x = xAt(th);
      fo.push(surfX(x + HW, th, 0.026)); bo.push(surfX(x - HW, th, 0.026));
      fi.push(surfX(x + HW, th, 0.004)); bi.push(surfX(x - HW, th, 0.004));
    }
    const pn = norm([1, -KX, 0]);
    loft(s, [bo, fo], (j, k) => U(R.strap, j, k % 2));
    loft(s, [fi, fo], (j, k) => U(R.strap, 0.9 + j * 0.1, k % 2), { want: () => pn });
    loft(s, [bi, bo], (j, k) => U(R.strap, j * 0.1, k % 2), { want: () => mul(pn, -1) });
    // letters tucked under the strap on each flank
    let from = s.count;
    for (const [th, rot, dx] of [[1.32, 0.38, 0.0], [1.55, -0.2, -0.03]] as const) {
      const x = xAt(th) + dx, c = surfX(x, th, 0.016), nn = normalAt(x, th), tx = norm(sub(surfX(x + 0.05, th), surfX(x - 0.05, th))), ty = cross(nn, tx);
      card(s, c, add(mul(tx, Math.cos(rot)), mul(ty, Math.sin(rot))), add(mul(ty, Math.cos(rot)), mul(tx, -Math.sin(rot))), 0.15, 0.095, R.env);
    }
    // a brass buckle on the strap
    { const th = 0.95, x = xAt(th), c = surfX(x, th, 0.026), nn = normalAt(x, th), tx = norm(sub(surfX(x + 0.05, th), surfX(x - 0.05, th))), ty = cross(nn, tx);
      const q = (u: number, v: number): V3 => add(add(c, mul(tx, u * 0.05)), add(mul(ty, v * 0.04), mul(nn, 0.006)));
      triN(s, q(-1, -1), q(1, -1), q(1, 1), U(R.brass, 0, 0), U(R.brass, 1, 0), U(R.brass, 1, 1), nn); triN(s, q(-1, -1), q(1, 1), q(-1, 1), U(R.brass, 0, 0), U(R.brass, 1, 1), U(R.brass, 0, 1), nn);
      for (const [p1, p2] of [[q(-1, -1), q(1, -1)], [q(1, -1), q(1, 1)], [q(1, 1), q(-1, 1)], [q(-1, 1), q(-1, -1)]]) {
        const o = sub(centroid(p1, p2), c), d = mul(nn, -0.007);
        triN(s, p1, p2, add(p2, d), U(R.brass, 0, 0), U(R.brass, 1, 0), U(R.brass, 1, 0.3), o); triN(s, p1, add(p2, d), add(p1, d), U(R.brass, 0, 0), U(R.brass, 1, 0.3), U(R.brass, 0, 0.3), o);
      }
    }
    mirrorSince(s, from);
    // under the belly the strap rides the bag
    this.bind((p) => { const th = Math.atan2(p[2], p[1]), dB = Math.abs(Math.abs(th) - PI); return [B.body, B.bag, p[1] < -0.3 ? smooth(0.85, 0.35, dB) : 0]; });
    // the bag: a rounded leather satchel, top tucked against the belly
    const T0 = BAG.top, ol: [number, number][] = [[-0.345, 0], [-0.33, -0.085], [-0.29, -0.125], [-0.16, -0.132], [-0.03, -0.122], [0, -0.085], [0.012, 0], [0, 0.085], [-0.03, 0.122], [-0.16, 0.132], [-0.29, 0.125], [-0.33, 0.085]];
    const bagZ = (y: number) => { const t = clamp((T0 - y) / 0.33, 0, 1); return t < 0.1 ? lerp(0.12, 0.122, t / 0.1) : t < 0.48 ? lerp(0.122, 0.132, (t - 0.1) / 0.38) : lerp(0.132, 0.125, (t - 0.48) / 0.4); };
    const bring = (x: number, k: number): V3[] => ol.map(([y, z]) => [x, T0 + (y + 0.16) * k - 0.16, z * k]);
    const bx = [BAG.x - BAG.hl, BAG.x - BAG.hl + 0.04, BAG.x + BAG.hl - 0.04, BAG.x + BAG.hl], bk = [0.82, 1, 1, 0.82];
    const br = bx.map((x, i) => bring(x, bk[i]));
    loft(s, br, (j, k) => U(R.leather, [0, 0.08, 0.92, 1][j], k / ol.length));
    fan(s, br[0], [bx[0] - 0.012, T0 - 0.16, 0], (k) => U(R.leather, 0, k / ol.length), U(R.leather, 0, 0.5));
    fan(s, br[3], [bx[3] + 0.012, T0 - 0.16, 0], (k) => U(R.leather, 1, k / ol.length), U(R.leather, 1, 0.5));
    // a letter slipped behind the flap
    from = s.count;
    card(s, [BAG.x + 0.17, T0 - 0.105, bagZ(T0 - 0.105) + 0.004], norm([1, 0.25, 0]), norm([-0.25, 1, 0]), 0.14, 0.09, R.env);
    mirrorSince(s, from);
    this.rigid(B.bag);
    // the flap over the +z face, stitched, gold-stamped, a brass buckle; it lifts open on a delivery
    const flapStart = s.count;
    const fx = [-0.21, -0.105, 0, 0.105, 0.21], fy = [0, 0.09, 0.17, 0.2];
    const fp = (i: number, j: number): V3 => {
      const y = T0 - 0.035 - fy[j] + (j === 3 ? Math.abs(fx[i]) * 0.25 : 0), x = BAG.x + fx[i] * (j === 3 ? 0.9 : 1);
      return [x, y, bagZ(y) + 0.011];
    };
    for (let i = 0; i < fx.length - 1; i++) for (let j = 0; j < fy.length - 1; j++) {
      const uv = (ii: number, jj: number) => U(R.flap, ii / (fx.length - 1), 1 - jj / (fy.length - 1));
      triN(s, fp(i, j), fp(i + 1, j), fp(i + 1, j + 1), uv(i, j), uv(i + 1, j), uv(i + 1, j + 1), [0, 0, 1]); triN(s, fp(i, j), fp(i + 1, j + 1), fp(i, j + 1), uv(i, j), uv(i + 1, j + 1), uv(i, j + 1), [0, 0, 1]);
    }
    const rimF: V3[] = [];
    for (let j = 0; j < fy.length; j++) rimF.push(fp(fx.length - 1, j));
    for (let i = fx.length - 2; i >= 0; i--) rimF.push(fp(i, fy.length - 1));
    for (let j = fy.length - 2; j >= 0; j--) rimF.push(fp(0, j));
    const fc = fp(2, 1);
    for (let i = 0; i < rimF.length - 1; i++) {
      const a = rimF[i], b = rimF[i + 1], d: V3 = [0, 0, -0.011], o = sub(centroid(a, b), fc); o[2] = 0;
      triN(s, a, b, add(b, d), U(R.flap, 0, 0), U(R.flap, 0.05, 0), U(R.flap, 0.05, 0.05), o); triN(s, a, add(b, d), add(a, d), U(R.flap, 0, 0), U(R.flap, 0.05, 0.05), U(R.flap, 0, 0.05), o);
    }
    { const y = T0 - 0.035 - 0.19, c: V3 = [BAG.x, y, bagZ(y) + 0.02];
      dome(s, c, [0, 0, 1], 0.03, 0.022, 0.012, 6, R.brass, [1, 0, 0]); }
    this.rigid(B.flapR);
    mirrorSince(s, flapStart);
    this.rigid(B.flapL);
  }
}

interface Built { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; tris: number }
let BUILT: Built | null = null;
/** her mesh and material are built once and shared (the dungeon builds a new Marge on every post-office floor) */
function built(): Built {
  if (BUILT) return BUILT;
  const { A, R } = paintPage();
  const b = new Build(R);
  b.hide(); b.eyes(); b.flipper(); b.cap(); b.jacket(); b.scarf(); b.mailbag();
  const s = b.s;
  // a gentle top light baked in the vertex colours (the undersides a touch darker)
  // (the paddle a shade darker: banked toward the camera it catches the full sun)
  s.paintSince(0, (p, n, c) => { const k = (0.9 + 0.1 * n[1]) * (p[0] < -1.5 ? 0.86 : 1); return [c[0] * k, c[1] * k, c[2] * k]; });
  const geo = s.geometry();
  const sw = geo.getAttribute('aSway') as THREE.BufferAttribute;
  const n = sw.count, si = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = sw.getX(i), bb = sw.getY(i), w = sw.getZ(i);
    si[i * 4] = a; si[i * 4 + 1] = bb; wt[i * 4] = 1 - w; wt[i * 4 + 1] = w;
    sw.setXYZW(i, 0, 0, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  const mat = propMaterial(A.texture());
  BUILT = { geo, mat, tris: n / 3 };
  return BUILT;
}

// ------------------------------------------------------------------ Marge
type MState = 'away' | 'arriving' | 'waiting' | 'leaving';
/** model metres -> world */
const SCALE = 0.9;
/** the model x that sits at her root: callers' (x, y) is her chest, and she turns about it */
const ANCHOR_X = 0.4;
/** collision circles along her (model x, model y, radius): snout, head, chest, flippers, bag, belly, stock, paddle */
const HULL: [number, number, number][] = [[1.55, -0.18, 0.2], [1.12, -0.02, 0.34], [0.45, -0.02, 0.5], [0.5, -0.62, 0.16], [-0.13, -0.62, 0.2], [-0.45, 0, 0.5], [-1.15, 0.02, 0.27], [-1.8, 0.02, 0.12]];

export class Manatee {
  root = new THREE.Group();
  private yawG = new THREE.Group();
  private pitchG = new THREE.Group();
  private rollG = new THREE.Group();
  private bodyG = new THREE.Group();
  private mesh: THREE.SkinnedMesh;
  private b: Record<BoneName, THREE.Bone>;
  x = 0; y = -3; z = -1.25; vx = 0; vy = 0;
  state: MState = 'away';
  /** post-office mode (the dungeon): hover by this point instead of by a buoy */
  anchor: { x: number; y: number } | null = null;
  /** the highest her chest goes (the surface, or a ceiling of dark water in the deep) */
  ceiling = -0.55;
  private t = Math.random() * 10;
  // facing: the side she wants (+1 right, -1 left) and how far through the turn she is (0 right .. 1 left)
  private side = 1; private faceP = 0; private faceHold = 0; private turnCD = 0;
  private leaveDir = 1; private leaveT = 0;
  // swimming / hanging about
  private ph = 0; private swimK = 0; private pitch = 0; private look = 0; private heave = 0;
  private hoverY: number | null = null;
  private breatheT = 9; private surfacing = 0; private surfaceT = 0;
  private greeted = false;
  // face and gestures
  private talkT = 0; private talkK = 0; private waveT = 0; private waveK = 0; private waveSide = 1;
  private blinkT = 1.5; private blinkK = 0; private blink2 = -1; private munchT = 6; private munchK = 0;
  private celebrateT = -1;
  // the bag and the neckerchief swing
  private bagA = 0; private bagV = 0; private tieA = 0; private tieV = 0; private pvx = 0;

  constructor(_scen?: Scenery) {
    const { geo, mat } = built();
    const bones = BN.map((n) => { const bn = new THREE.Bone(); bn.name = 'marge.' + n; return bn; });
    BN.forEach((n, i) => {
      const par = PARENT[n], p = POS[n], pp = par ? POS[par] : [0, 0, 0];
      bones[i].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      if (par) bones[B[par]].add(bones[i]);
    });
    // the ring lids squash flat along the eye's axis to open: point each lid bone's z down that axis
    const f = normalAt(EYE_X, EYE_TH);
    bones[B.lidR].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...f));
    bones[B.lidL].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f[0], f[1], -f[2]));
    this.b = Object.fromEntries(BN.map((n, i) => [n, bones[i]])) as Record<BoneName, THREE.Bone>;
    const mesh = this.mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = 'marge';
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.bodyG.add(mesh);
    this.bodyG.position.set(-ANCHOR_X * SCALE, 0, 0);
    this.bodyG.scale.setScalar(SCALE);
    this.rollG.add(this.bodyG); this.pitchG.add(this.rollG); this.yawG.add(this.pitchG); this.root.add(this.yawG);
    this.root.name = 'manatee';
    this.root.visible = false;
    this.animate(0, 5, 0);
  }

  /** open her mouth for a moment (a dialogue speaker's onTalk: () => marge.talk()) */
  talk(seconds = 0.18) { this.talkT = Math.max(this.talkT, seconds); }
  /** a wave of the flipper nearer the camera */
  wave(seconds = 1.6) { this.waveT = Math.max(this.waveT, seconds); }
  /** the delivery: the bag flaps lift, then a happy barrel roll */
  celebrate() { this.celebrateT = 0; this.talk(0.7); }

  update(dt: number, w: World, buoyX: number, _buoyY: number) {
    this.t += dt;
    if (this.state === 'away') { this.root.visible = false; return; }
    this.root.visible = true;
    const p = w.player, dist = Math.hypot(p.x - this.x, p.y - this.y);
    // the highest her chest goes: under the ceiling in the deep; by the buoy a little under the surface, or just high
    // enough for her nostrils to break it when she comes up for a breath
    const sea = w.water.heightAt(this.x + this.side * 1.1);
    const top = this.anchor ? this.ceiling : this.surfacing ? sea - 0.3 : Math.min(this.ceiling, sea - 0.55);
    let floor = -1e9;
    for (const dx of [-1.6, -0.6, 0.4, 1.2]) floor = Math.max(floor, w.terrain.floorAt(this.x + dx));
    let tx = this.x, ty = this.y, spd = 0, slow = 2;
    if (this.state === 'arriving') {
      // she comes in at a good clip and eases to a stop beside the buoy
      [tx, ty] = this.waitSpot(w, buoyX, floor, top); spd = 4.6; slow = 3.2;
      if (Math.hypot(tx - this.x, ty - this.y) < 0.7) { this.state = 'waiting'; this.wave(); this.talk(0.7); }
    } else if (this.state === 'waiting' && this.anchor) {
      // post-office hours: a slow lazy figure-eight by her pillar box, no trips to the surface
      const a = this.anchor;
      tx = a.x + Math.sin(this.t * 0.31) * 0.3; ty = a.y + Math.sin(this.t * 0.62) * 0.12; spd = 0.5; slow = 2.5;
      if (dist < 6 && !this.greeted) { this.greeted = true; this.wave(); } else if (dist > 11) this.greeted = false;
    } else if (this.state === 'waiting') {
      [tx, ty] = this.waitSpot(w, buoyX, floor, top); spd = 1.6; slow = 2.2;
      // up for air now and then, never while the blobfish is close (the hand-over prompt must not drop out):
      // if it swims up mid-trip she comes straight back down
      const near = dist < 7.5;
      if (this.surfacing === 0) { if (!near) this.breatheT -= dt; if (this.breatheT <= 0) { this.surfacing = 1; this.surfaceT = 0; } }
      else if (near) { this.surfacing = 0; this.breatheT = 8 + Math.random() * 6; }
      if (this.surfacing === 1) {
        ty = top + 0.1; spd = 2; slow = 0.8;
        this.surfaceT += dt;
        if (this.y > top - 0.12 || this.surfaceT > 6) { this.surfacing = 2; this.surfaceT = 1.6; this.puff(w); }
      } else if (this.surfacing === 2) {
        ty = top; spd = 0.6;
        this.surfaceT -= dt;
        if (this.surfaceT <= 0) { this.surfacing = 0; this.breatheT = 14 + Math.random() * 8; }
      }
      if (dist < 6 && !this.greeted) { this.greeted = true; this.wave(); } else if (dist > 11) this.greeted = false;
    } else if (this.state === 'leaving') {
      // a goodbye wave, then off she goes the way she came
      this.leaveT += dt;
      if (this.leaveT > 1.1) { tx = buoyX + this.leaveDir * 44; ty = clamp(-5.5, floor + 1.6, top - 2); spd = 4.6; slow = 0.5; }
      // gone once she's well clear of the buoy and of the blobfish (an area's end wall must not hold her on screen)
      if ((Math.abs(this.x - buoyX) > 22 && Math.abs(this.x - p.x) > 17) || Math.abs(this.x - buoyX) > 40) { this.state = 'away'; this.root.visible = false; return; }
    }
    this.steer(dt, tx, ty, spd, slow);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.collide(dt, w, top);
    this.face(dt, p.x);
    this.animate(dt, p.x, p.y);
  }

  /** where she hangs about by the buoy: beside it, at the blobfish's depth (it has to stray a fair way first) */
  private waitSpot(w: World, buoyX: number, floor: number, top: number): [number, number] {
    const p = w.player, lo = floor + 1.7, hi = Math.max(lo, top - 2.4);
    if (this.hoverY === null) this.hoverY = -4.2;
    if (Math.abs(p.x - buoyX) < 10 && Math.abs(p.y + 0.35 - this.hoverY) > 1.4) this.hoverY = p.y + 0.35;
    this.hoverY = clamp(this.hoverY, lo, hi);
    return [buoyX + this.leaveDir * 1.9, this.hoverY];
  }

  private steer(dt: number, tx: number, ty: number, spd: number, slow: number) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1e-6;
    const s = spd * Math.min(1, d / slow), k = spd > 2.5 ? 2.0 : 1.3;
    this.vx = damp(this.vx, (dx / d) * s, k, dt);
    this.vy = damp(this.vy, (dy / d) * s, k, dt);
  }

  /**
   * Keep all of her (snout to paddle, flippers and bag too) out of the rock, the sand and the ceiling. Swimming in
   * from off screen or heading home she only minds the seabed (she comes and goes through an area's end walls).
   */
  private collide(dt: number, w: World, top: number) {
    const hx = Math.cos(this.yawG.rotation.y), walls = this.state === 'waiting';
    for (const [mx, my, r] of HULL) {
      const px = this.x + (mx - ANCHOR_X) * SCALE * hx, py = this.y + my * SCALE, rr = r * SCALE;
      if (!walls) {
        const fl = w.terrain.floorAt(px) + rr - py;
        if (fl > 0) { this.y += Math.min(fl, Math.max(0.05, fl * 0.3)); if (this.vy < 0) this.vy *= 0.5; }
        continue;
      }
      const d = w.terrain.sdf(px, py) - rr;
      if (d >= 0) continue;
      const n = w.terrain.normal(px, py);
      this.x += n.x * -d; this.y += n.y * -d;
      const vn = this.vx * n.x + this.vy * n.y;
      if (vn < 0) { this.vx -= n.x * vn; this.vy -= n.y * vn; }
    }
    // (eased back under, not snapped: the limit drops when a breath ends)
    if (this.y > top) { this.y -= Math.min(this.y - top, Math.max(1.5 * dt, (this.y - top - 0.4))); if (this.vy > 0) this.vy = 0; }
  }

  /** she faces the way she swims, or the blobfish once it has settled on her other side (no flip-flopping) */
  private face(dt: number, px: number) {
    const fast = Math.abs(this.vx) > 1.1;
    let want = this.side;
    if (fast) want = this.vx > 0 ? 1 : -1;
    else if (this.state === 'waiting' && Math.abs(px - this.x) > 1.8) want = px > this.x ? 1 : -1;
    this.turnCD -= dt;
    if (want !== this.side) {
      this.faceHold += dt;
      if (this.faceHold > (fast ? 0.15 : 0.7) && (fast || this.turnCD <= 0)) { this.side = want; this.faceHold = 0; this.turnCD = 2.4; }
    } else this.faceHold = 0;
    this.faceP += clamp((this.side > 0 ? 0 : 1) - this.faceP, -dt * 0.9, dt * 0.9);
  }

  /** a breath at the surface: a puff of spray off her nostrils */
  private puff(w: World) {
    const nx = this.x + Math.cos(this.yawG.rotation.y) * (X_NOSE - ANCHOR_X) * SCALE;
    w.fx.splash(nx, 0.45);
    w.fx.burst('bubbleS', nx, this.y + 0.3, 6, 1.2, { vy: 1.5 });
    w.sfx('splash_s', nx, 0.35);
  }

  /** the whole body language, every frame */
  private animate(dt: number, px: number, py: number) {
    const b = this.b, t = this.t;
    const S = smooth(0, 1, this.faceP), cs = Math.cos(PI * S);
    const sp = Math.hypot(this.vx, this.vy);
    this.swimK = damp(this.swimK, clamp((sp - 0.5) / 3, 0, 1), 3, dt);
    const idle = 1 - this.swimK;
    // facing: she turns through the camera (her face toward you mid-turn) and backs off a little so her head never
    // swings through the play plane; hanging about she keeps a 3/4 turn toward the camera so her face reads
    const q = 0.4 * idle + 0.06;
    const yaw = lerp(-q, -PI + q, S);
    // the stroke: the paddle beats up and down, slow and lazy at rest, strong when she cruises; at rest the tail
    // hangs a little low, as a resting manatee's does
    const cel = this.celebrateT;
    this.ph += dt * (lerp(0.28, 1.0, this.swimK) + (cel >= 0 ? 0.35 : 0)) * TAU;
    const A = lerp(0.09, 0.32, this.swimK), ph = this.ph;
    b.lumbar.rotation.z = A * 0.3 * Math.sin(ph) + 0.04 * idle;
    b.stock.rotation.z = A * 0.6 * Math.sin(ph - 0.8) + 0.06 * idle;
    b.paddle.rotation.z = A * 1.0 * Math.sin(ph - 1.6) + 0.05 * idle;
    this.heave = -A * 0.07 * Math.sin(ph + 0.5);
    // side-on the paddle would be a knife edge: she keeps it banked toward the camera so its round face reads
    const twist = 0.55 * cs;
    b.lumbar.rotation.x = twist * 0.12; b.stock.rotation.x = twist * 0.33; b.paddle.rotation.x = twist * 0.55;
    // breathing swells the chest (and the jacket with it)
    const br = Math.sin(t * 1.25 + 0.4) * (this.surfacing === 2 ? 2 : 1), sy = 1 + 0.018 * br, sz = 1 + 0.022 * br;
    b.chest.scale.set(1, sy, sz);
    for (const c of [b.neck, b.flipR, b.flipL]) c.scale.set(1, 1 / sy, 1 / sz);
    b.chest.rotation.z = -A * 0.12 * Math.sin(ph + 0.2);
    // the head: looks at the blobfish when it's in front of her, a lazy bob, nods along when she talks
    const dxp = px - this.x, dyp = py - this.y, ahead = Math.sign(dxp) === this.side;
    const lookT = Math.hypot(dxp, dyp) < 9 && ahead ? clamp(Math.atan2(dyp - 0.2, Math.abs(dxp) + 0.8), -0.4, 0.45) : 0;
    this.look = damp(this.look, lookT, 2.5, dt);
    this.talkT = Math.max(0, this.talkT - dt);
    this.talkK = damp(this.talkK, this.talkT > 0 ? 1 : 0, 12, dt);
    b.neck.rotation.z = this.look * 0.45 + Math.sin(t * 0.8) * 0.03 * idle + this.talkK * Math.sin(t * 5.3) * 0.035 + (this.surfacing ? 0.1 : 0);
    b.head.rotation.z = this.look * 0.45 + Math.sin(t * 0.8 - 0.6) * 0.025 * idle;
    const hy = -0.22 * cs * idle;
    b.neck.rotation.y = hy * 0.4 + Math.sin(t * 0.37) * 0.05 * idle;
    b.head.rotation.y = hy * 0.6;
    // blinks (sometimes a double), a happy squint through the roll, half-shut eyes as she breathes at the surface
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkK = 0.17; this.blinkT = 2.2 + Math.random() * 3.6; if (Math.random() < 0.22) this.blink2 = 0.32; }
    if (this.blink2 > 0) { this.blink2 -= dt; if (this.blink2 <= 0) { this.blinkK = 0.17; this.blink2 = -1; } }
    this.blinkK = Math.max(0, this.blinkK - dt);
    let lid = this.blinkK > 0 ? Math.sin(PI * (1 - this.blinkK / 0.17)) : 0;
    if (cel > 0.9 && cel < 2.4) lid = Math.max(lid, 0.85);
    if (this.surfacing === 2) lid = Math.max(lid, 0.55);
    const ls = Math.max(0.02, lid);
    b.lidR.scale.set(1, 1, ls); b.lidL.scale.set(1, 1, ls);
    // the mouth: the lower lip drops as she talks; now and then the split upper lip flares and grips (grazing)
    const open = this.talkK * (0.3 + 0.7 * Math.abs(Math.sin(t * 11.5) * Math.sin(t * 4.1 + 1)));
    this.munchT -= dt;
    if (this.munchT <= 0 && this.talkK < 0.1) { this.munchK = 1.1; this.munchT = 5 + Math.random() * 6; }
    this.munchK = Math.max(0, this.munchK - dt);
    const mu = this.munchK > 0 ? Math.max(0, Math.sin(((1.1 - this.munchK) / 1.1) * TAU * 2)) : 0;
    b.jaw.rotation.z = -0.42 * open - 0.08 * mu;
    b.lip.rotation.z = 0.05 * open - 0.07 * mu;
    b.lip.scale.set(1, 1 + 0.05 * open, 1 + 0.06 * open + 0.14 * mu);
    // flippers: slow sculling, tucked back when she cruises, the near one waves
    this.waveT = Math.max(0, this.waveT - dt);
    if (this.waveT > 0 && this.waveK < 0.05) this.waveSide = cs >= 0 ? 1 : -1;
    this.waveK = damp(this.waveK, this.waveT > 0 ? 1 : 0, 5, dt);
    const sc = t * 1.7;
    this.flipper(b.flipR, 1, sc, this.waveSide > 0 ? this.waveK : 0);
    this.flipper(b.flipL, -1, sc + 2.2, this.waveSide < 0 ? this.waveK : 0);
    // the bag swings back as she speeds up, and sways; the neckerchief tails follow
    const ax = dt > 0 ? (this.vx - this.pvx) / dt : 0;
    this.pvx = this.vx;
    const fa = ax * Math.cos(yaw);
    const bt = clamp(-fa * 0.05, -0.3, 0.3) + Math.sin(t * 1.1) * 0.03;
    this.bagV += ((bt - this.bagA) * 26 - this.bagV * 3.5) * dt; this.bagA += this.bagV * dt;
    b.bag.rotation.set(Math.sin(t * 0.9) * 0.025, 0, this.bagA);
    const tt = clamp(-fa * 0.08, -0.5, 0.5) + Math.sin(t * 1.7) * 0.06 - this.swimK * 0.25;
    this.tieV += ((tt - this.tieA) * 34 - this.tieV * 3) * dt; this.tieA += this.tieV * dt;
    b.tie.rotation.set(Math.sin(t * 1.3) * 0.08, 0, this.tieA);
    // the delivery: flaps up, letters in, flaps down, then a full barrel roll about her own long axis
    let roll = 0.1 * cs * idle, flapK = 0;
    if (cel >= 0) {
      this.celebrateT += dt;
      const c = this.celebrateT;
      flapK = c < 0.25 ? easeInOut(c / 0.25) : c < 0.7 ? 1 : c < 0.95 ? 1 - easeInOut((c - 0.7) / 0.25) : 0;
      if (c > 0.95 && c < 2.35) roll += easeInOut((c - 0.95) / 1.4) * TAU * (cs >= 0 ? 1 : -1);
      if (c >= 2.6) this.celebrateT = -1;
    }
    b.flapR.rotation.x = -flapK * 1.6; b.flapL.rotation.x = flapK * 1.6;
    const pT = clamp(this.vy * 0.13, -0.3, 0.35) + (this.surfacing === 1 ? 0.22 : this.surfacing === 2 ? 0.3 : 0) + this.talkK * 0.04;
    this.pitch = damp(this.pitch, pT, 2.2, dt);
    this.yawG.rotation.y = yaw;
    this.pitchG.rotation.z = this.pitch + Math.sin(t * 0.5) * 0.025 * idle;
    this.rollG.rotation.x = roll;
    this.bodyG.position.y = this.heave;
    this.root.position.set(this.x, this.y + Math.sin(t * 0.9) * 0.04 * idle, this.z - Math.sin(PI * S) * 0.95);
  }

  private flipper(bone: THREE.Bone, side: number, ph: number, wave: number) {
    // sculling: a slow fore-and-aft sweep with a feathering twist; tucked back along the body when she cruises
    const tuck = this.swimK;
    const rz = 0.2 * Math.sin(ph) * (1 - tuck) - 0.5 * tuck;
    const rx = side * (-0.08 + 0.08 * Math.sin(ph + 1.2)) * (1 - tuck) + side * 0.14 * tuck;
    const ry = side * 0.28 * Math.sin(ph + 0.5) * (1 - tuck);
    bone.rotation.set(rx, ry, rz);
    if (wave <= 0.001) return;
    // the wave: the flipper swings up beside her face and waggles to and fro (fore and aft, so it reads side-on)
    // (whole frames, not just the long axis, so the palm turns to face the camera instead of going edge-on)
    _qa.copy(bone.quaternion);
    const a = Math.sin(this.t * 8) * 0.42, ca = Math.cos(a), sa = Math.sin(a);
    const L2 = norm([0.3 * ca - 0.82 * sa, 0.3 * sa + 0.82 * ca, 0.48]), W2 = norm(cross([0, 0, 1], L2)), T2 = cross(L2, W2);
    const m = (v: V3): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2] * side);
    _m1.makeBasis(m(FLIP_DIR), m(FLIP_W), m(FLIP_T)).transpose();
    _m2.makeBasis(m(L2), m(W2), m(T2)).multiply(_m1);
    _qb.setFromRotationMatrix(_m2);
    bone.quaternion.slerpQuaternions(_qa, _qb, wave);
  }

  /** dev studio: pose her without the swim logic (faceP 0 = facing right .. 1 = left, speed in m/s) */
  studio(dt: number, faceP: number, speed = 0, lookX = 4, lookY = 0) {
    this.t += dt;
    this.faceP = faceP; this.side = faceP < 0.5 ? 1 : -1;
    this.vx = speed * this.side; this.vy = 0;
    this.root.visible = true;
    this.animate(dt, this.x + lookX * this.side, this.y + lookY);
  }

  arrive(fromX: number, buoyX: number) {
    this.state = 'arriving';
    this.x = fromX; this.y = -4.6; this.vx = Math.sign(buoyX - fromX) * 4; this.vy = 0;
    this.side = this.vx >= 0 ? 1 : -1; this.faceP = this.side > 0 ? 0 : 1; this.faceHold = 0; this.turnCD = 0;
    this.leaveDir = Math.sign(fromX - buoyX) || 1;
    this.breatheT = 9; this.surfacing = 0; this.hoverY = null; this.celebrateT = -1; this.greeted = false;
    this.swimK = 1;
  }
  leave() { if (this.state !== 'away' && this.state !== 'leaving') { this.state = 'leaving'; this.leaveT = 0; this.surfacing = 0; this.wave(1.2); } }
  /** post-office mode: waiting at (x, y) from the start, no arrival swim, never rising above `ceiling` */
  station(x: number, y: number, ceiling = -0.55) {
    this.anchor = { x, y }; this.ceiling = ceiling;
    this.state = 'waiting'; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.side = -1; this.faceP = 1; this.faceHold = 0; this.swimK = 0;
    this.root.visible = true;
    this.animate(0, x - 5, y);
  }
  dispose() { this.mesh.skeleton.dispose(); }
}

// ------------------------------------------------------------------ the buoy
export class MailBuoy implements Entity {
  kind = 'mailbuoy'; team: Team = 'friend';
  x: number; y = 0; vx = 0; vy = 0; r = 0.8; alive = true;
  obj = new THREE.Group();
  manatee: Manatee;
  /** seconds between visits */
  interval = 70;
  /** how long she waits at the buoy */
  window = 32;
  /** seconds until the next arrival (while away) */
  eta: number;
  /** seconds left at the buoy (while waiting) */
  waitLeft = 0;
  private float = new THREE.Group();
  private bell = new THREE.Group();
  private chain: THREE.Mesh;
  private bellT = 0;
  private t = 0;
  private floorY: number;
  private world: World;
  private deliveries = 0;
  private inReach = false;
  private lastState = 'away';

  constructor(public a: AreaDef, public scen: Scenery, x: number, w: World) {
    this.x = x; this.world = w;
    this.floorY = scen.sand.restAt(x);
    this.eta = 12;
    const P = scen.props;
    const s = new Soup();
    // float: a red can with a white band, flat deck on top
    s.lathe([[0.42, -0.9], [0.55, -0.6], [0.55, 0.15], [0.5, 0.25]], 8, P.get('buoyRed'));
    s.lathe([[0.555, -0.25], [0.555, -0.02]], 8, P.get('buoyWhite'));
    s.lathe([[0.5, 0.25], [0.48, 0.27], [0, 0.28]], 8, P.get('buoyWhite'));
    // the tower: four legs + a ring
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; s.tube([[Math.cos(a) * 0.38, 0.25, Math.sin(a) * 0.38], [Math.cos(a) * 0.14, 1.5, Math.sin(a) * 0.14]], () => 0.03, 3, P.get('iron')); }
    // the blue post box on the deck
    s.box([-0.22, 0.28, -0.18], [0.44, 0.5, 0.36], P.get('postBlue'));
    s.box([-0.24, 0.78, -0.2], [0.48, 0.06, 0.4], P.get('postBlue'));
    s.box([-0.12, 0.62, 0.181], [0.24, 0.04, 0.01], P.get('black'));       // the slot
    s.box([0.24, 0.5, -0.02], [0.02, 0.32, 0.04], P.get('iron'));           // the little flag post
    s.box([0.26, 0.72, -0.01], [0.16, 0.1, 0.02], P.get('buoyRed'));        // the flag
    // radar reflector / topmark
    s.lathe([[0.16, 1.5], [0, 1.75]], 4, P.get('buoyRed'));
    const g = new THREE.Mesh(s.geometry(), scen.mats.prop);
    g.castShadow = true;
    this.float.add(g);
    // the bell swings inside the tower
    const b = new Soup();
    b.lathe([[0.14, -0.2], [0.12, -0.12], [0.08, 0.0], [0.03, 0.04], [0, 0.05]], 7, P.get('brass'));
    b.tube([[0, -0.2, 0], [0, -0.28, 0]], () => 0.02, 3, P.get('iron'));
    const bm = new THREE.Mesh(b.geometry(), scen.mats.prop);
    this.bell.add(bm); this.bell.position.set(0, 1.35, 0);
    this.float.add(this.bell);
    this.obj.add(this.float);
    // chain to the sinker (rebuilt as the buoy bobs)
    this.chain = new THREE.Mesh(new THREE.BufferGeometry(), scen.mats.prop);
    this.obj.add(this.chain);
    const sk = new Soup(); sk.box([-0.4, 0, -0.4], [0.8, 0.45, 0.8], P.get('rock'));
    const sinker = new THREE.Mesh(sk.geometry(), scen.mats.prop);
    sinker.position.set(x - 1.4, this.floorY - 0.2, -0.6);
    sinker.rotation.y = 0.4;
    this.obj.add(sinker);
    this.manatee = new Manatee(scen);
    this.obj.add(this.manatee.root);
    this.float.position.set(x, 0, -0.6);
  }

  /** the manatee is at the buoy and will take loot */
  get present() { return this.manatee.state === 'waiting'; }
  /** close enough to hand over loot (with a little slack once in reach, so the prompt doesn't flicker as she drifts) */
  canDeposit(px: number, py: number) {
    if (!this.present) { this.inReach = false; return false; }
    const d = Math.hypot(px - this.manatee.x, py - this.manatee.y);
    this.inReach = d < (this.inReach ? 4.6 : 3.6);
    return this.inReach;
  }

  /** ring the bell: calls the manatee early */
  ring() {
    this.bellT = 2.5;
    this.world.sfx('bell', this.x, 0.8);
    if (this.manatee.state === 'away') this.eta = Math.min(this.eta, 4);
    else if (this.present) this.waitLeft = Math.max(this.waitLeft, 12);
  }

  /**
   * Hand loot to the manatee. items: ids, ItemInsts or a { id: n } bag; omit to send every material item the
   * run carries (they are removed from run.items). Emits 'extract' {items: string[], counts}. Returns the ids
   * extracted (empty when she is not here).
   */
  deposit(items?: (string | ItemInst)[] | Record<string, number>): string[] {
    if (!this.present) return [];
    const w = this.world;
    let ids: string[] = [];
    if (!items) {
      const take = w.run.items.filter((it) => ITEMS[it.id]?.kind === 'material');
      ids = take.map((it) => it.id);
      w.run.items = w.run.items.filter((it) => !take.includes(it));
    } else if (Array.isArray(items)) ids = items.map((i) => (typeof i === 'string' ? i : i.id));
    else for (const [id, n] of Object.entries(items)) for (let k = 0; k < n; k++) ids.push(id);
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    w.emit('extract', { items: ids, counts, x: this.manatee.x, y: this.manatee.y });
    const m = this.manatee;
    m.celebrate();
    this.deliveries++;
    w.fx.burst('heart', m.x + 0.8, m.y + 0.6, 6 + Math.min(10, ids.length), 1.5, { vy: 1.2, life: 1.6 });
    w.fx.burst('bubble', m.x, m.y, 10, 1.5);
    w.sfx('cute1', m.x, 0.8); w.sfx('jin_catch1', m.x, 0.6);
    w.text.pop(ids.length ? 'Special delivery!' : 'Nothing today?', m.x, m.y + 1.4, 'magic', { size: 0.32, life: 1.8 });
    // she heads home with the parcel once the roll is done
    this.waitLeft = Math.min(this.waitLeft, 3.2);
    return ids;
  }

  hit(_d: number, _dx: number, _dy: number, w: World, _src: Entity | null, _k?: DamageKind): boolean {
    // whacking the buoy rings the bell
    this.ring();
    w.fx.burst('spark', this.x, this.y + 1.2, 6, 2.5);
    return true;
  }

  update(dt: number, w: World) {
    this.t += dt;
    const m = this.manatee;
    // bob on the waves
    const wy = w.water.heightAt(this.x);
    this.y = wy - 0.1;
    const tilt = (w.water.heightAt(this.x + 0.5) - w.water.heightAt(this.x - 0.5)) * 0.6;
    this.float.position.set(this.x, this.y + Math.sin(this.t * 1.3) * 0.05, -0.6);
    this.float.rotation.set(Math.sin(this.t * 0.9) * 0.05, 0, -tilt + Math.sin(this.t * 1.1) * 0.04);
    this.bellT = Math.max(0, this.bellT - dt);
    this.bell.rotation.z = Math.sin(this.t * 14) * 0.5 * Math.min(1, this.bellT) + Math.sin(this.t * 1.2) * 0.05;
    this.rebuildChain();
    // the visit schedule
    if (m.state === 'away') {
      this.eta -= dt;
      if (this.eta <= 0) {
        const side = this.x > 0 ? 1 : -1;
        m.arrive(this.x + side * 18, this.x);
        this.waitLeft = this.window;
        w.sfx('honk1', this.x, 0.5);
        w.emit('manatee', { state: 'arriving', x: this.x });
      }
    } else if (m.state === 'waiting') {
      this.waitLeft -= dt;
      if (this.waitLeft <= 0) { m.leave(); this.eta = this.interval; w.emit('manatee', { state: 'leaving', x: this.x }); }
    }
    m.update(dt, w, this.x, this.y);
    if (m.state === 'waiting' && this.lastState !== 'waiting') w.emit('manatee', { state: 'waiting', x: this.x });
    this.lastState = m.state;
  }

  private chainT = 0;
  private rebuildChain() {
    this.chainT -= 1;
    if (this.chainT > 0) return;
    this.chainT = 3;
    const top: V3 = [this.x, this.y - 0.85, -0.6], bot: V3 = [this.x - 1.4, this.floorY + 0.2, -0.6];
    const path: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      path.push([top[0] + (bot[0] - top[0]) * t + Math.sin(t * Math.PI) * 0.8 + Math.sin(this.t * 0.7 + t * 3) * 0.1, top[1] + (bot[1] - top[1]) * t, -0.6]);
    }
    const s = new Soup();
    s.tube(path, () => 0.035, 3, this.scen.props.get('iron'));
    this.chain.geometry.dispose();
    this.chain.geometry = s.geometry({ sway: false, glow: false });
  }

  dispose() { this.manatee.dispose(); this.chain.geometry.dispose(); }
}
