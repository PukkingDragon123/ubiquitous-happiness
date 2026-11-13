// Fishing rods: a tapered lofted blank on a chain of bones with cork grips, a reel seat, wire guides standing
// off the blank on thread wraps, a tip-top, and one of six reels (spinning, conventional boat reel, low-profile
// baitcaster, closed-face spincast, inline ice reel, vintage centre-pin) with a crank that turns. The blank
// bends progressively toward the line under tension (more toward the tip) and whips on fast swings via a
// damped spring, so the tip position the line attaches to is always the bent one.
//
// Rod space: the butt at y = 0, the blank along +y, the reel side (spinning reels hang, guides face) is -z,
// +z is the rod's top. The grip point (where the casting hand closes) is `grip` up the blank.
import * as THREE from 'three';
import type { V3, Wt, Reg } from '../gfx/loft';
import { Loft, usFor } from '../gfx/loft';
import { Px, mix, shade } from '../gfx/px';
import type { RGB } from '../gfx/px';
import type { Look, RodKind, ReelKind } from './looks';
import { band, nz, hh, metal } from './fabric';
import { ellRing, clamp01 } from './rig';

const T = 128;
const REG = {
  BLANK: { x: 0, y: 0, w: 32, h: 128 }, CORK: { x: 32, y: 0, w: 32, h: 64 }, EVA: { x: 32, y: 64, w: 32, h: 64 },
  REEL: { x: 64, y: 0, w: 32, h: 64 }, REEL2: { x: 96, y: 0, w: 32, h: 64 }, METAL: { x: 64, y: 64, w: 32, h: 32 }, WRAP: { x: 96, y: 64, w: 32, h: 32 },
  SPOOL: { x: 64, y: 96, w: 32, h: 32 }, KNOB: { x: 96, y: 96, w: 32, h: 32 },
};
const reg = (k: keyof typeof REG): Reg => { const r = REG[k]; return { x: (r.x + 0.5) / T, y: (r.y + 0.5) / T, w: (r.w - 1) / T, h: (r.h - 1) / T }; };

interface RodSpec { len: number; butt: number; tip: number; grip: number; rearGrip: [number, number]; foreGrip: [number, number] | null; seat: [number, number]; guides: number; reel: ReelKind; corkKind: 'cork' | 'eva' | 'cane'; }
function specOf(L: Look): RodSpec {
  const r = L.rod, k = r.thick;
  const base = (kind: RodKind): RodSpec => {
    switch (kind) {
      case 'boat': return { len: r.len, butt: 0.013, tip: 0.0028, grip: 0.36, rearGrip: [0.0, 0.3], foreGrip: [0.42, 0.56], seat: [0.3, 0.42], guides: 6, reel: r.reel, corkKind: 'eva' };
      case 'kid': return { len: r.len, butt: 0.011, tip: 0.0028, grip: 0.24, rearGrip: [0.0, 0.2], foreGrip: null, seat: [0.2, 0.28], guides: 4, reel: r.reel, corkKind: 'eva' };
      case 'cane': return { len: r.len, butt: 0.011, tip: 0.0022, grip: 0.3, rearGrip: [0.02, 0.26], foreGrip: null, seat: [0.26, 0.34], guides: 7, reel: r.reel, corkKind: 'cork' };
      case 'pro': return { len: r.len, butt: 0.0095, tip: 0.0016, grip: 0.34, rearGrip: [0.0, 0.26], foreGrip: [0.4, 0.48], seat: [0.26, 0.4], guides: 8, reel: r.reel, corkKind: 'cork' };
      case 'ice': return { len: r.len, butt: 0.009, tip: 0.0018, grip: 0.16, rearGrip: [0.0, 0.14], foreGrip: null, seat: [0.14, 0.2], guides: 4, reel: r.reel, corkKind: 'cork' };
      case 'pier': return { len: r.len, butt: 0.013, tip: 0.0025, grip: 0.5, rearGrip: [0.0, 0.42], foreGrip: [0.56, 0.68], seat: [0.42, 0.56], guides: 7, reel: r.reel, corkKind: 'eva' };
      case 'heavy': return { len: r.len, butt: 0.017, tip: 0.0045, grip: 0.46, rearGrip: [0.0, 0.4], foreGrip: [0.54, 0.7], seat: [0.4, 0.54], guides: 6, reel: r.reel, corkKind: 'eva' };
      default: return { len: r.len, butt: 0.01, tip: 0.0022, grip: 0.34, rearGrip: [0.0, 0.28], foreGrip: [0.4, 0.5], seat: [0.28, 0.4], guides: 6, reel: r.reel, corkKind: 'cork' };
    }
  };
  const sp = base(r.kind);
  sp.butt *= k; sp.tip *= Math.sqrt(k);
  return sp;
}

const NB = 10;

interface RodAsset { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; spec: RodSpec; boneY: number[]; crank: { c: V3; r: number; axis: V3 } ; crankGeo: THREE.BufferGeometry; }
const assets = new Map<string, RodAsset>();

function rodAsset(L: Look): RodAsset {
  const key = L.arch + ':' + L.seed;
  const hit = assets.get(key);
  if (hit) return hit;
  const sp = specOf(L);
  const B = new Loft(true);
  // bones: 0 = the handle (rigid, from the butt to the blank start), then NB-1 links up the blank
  const b0 = sp.foreGrip ? sp.foreGrip[1] : sp.seat[1] + 0.02;
  const boneY = [0, ...Array.from({ length: NB - 1 }, (_, i) => b0 + ((sp.len - b0) * i) / (NB - 1))];
  const wAt = (y: number): Wt => {
    if (y <= b0) return [0, 1];
    for (let i = 1; i < NB; i++) {
      const y0 = boneY[i], y1 = i + 1 < NB ? boneY[i + 1] : sp.len + 1;
      if (y < y1) { const t = clamp01((y - y0) / (y1 - y0)); return t < 0.5 ? [i, 1] : [i, 1 - (t - 0.5), Math.min(NB - 1, i + 1), t - 0.5]; }
    }
    return [NB - 1, 1];
  };
  const radius = (y: number) => {
    const t = clamp01(y / sp.len);
    return sp.butt * (1 - t) ** 0.85 + sp.tip * t;
  };
  // the blank (bamboo cane gets nodes)
  const n = 8, rows = 34;
  const blank = Array.from({ length: rows + 1 }, (_, i) => {
    const y = (sp.len * i) / rows;
    const node = sp.corkKind === 'cane' || L.rod.kind === 'cane' ? Math.max(0, 1 - Math.abs(((y * 3.3) % 1) - 0.5) * 30) * 0.15 : 0;
    return { pts: ellRing(y, 0, 0, radius(y) * (1 + node), radius(y) * (1 + node), radius(y) * (1 + node), n, 2, 1), v: y / sp.len, w: wAt(y) };
  });
  B.loft(blank, usFor(n), reg('BLANK'), 1, { start: [0, 0, 0], end: [0, sp.len, 0] });
  // grips: cork / EVA swells with a butt cap
  const gripR = (y0: number, y1: number, k: 'CORK' | 'EVA', fat: number, g: number) => {
    const ys = [y0, y0 + 0.008, (y0 + y1) / 2, y1 - 0.008, y1];
    const rr = ys.map((y, i) => {
      const t = (y - y0) / (y1 - y0);
      const r = (radius(y) + 0.008 * fat + Math.sin(t * Math.PI) * 0.003 * fat) * (i === 0 || i === 4 ? 0.85 : 1);
      return { pts: ellRing(y, 0, 0, r, r, r, 10, 2, 1), v: t, w: wAt(y) };
    });
    B.loft(rr, usFor(10), reg(k), g, { start: [0, y0, 0], end: [0, y1, 0] });
  };
  const gk = sp.corkKind === 'eva' ? 'EVA' : 'CORK';
  gripR(sp.rearGrip[0], sp.rearGrip[1], gk, 1.2, 2);
  if (sp.foreGrip) gripR(sp.foreGrip[0], sp.foreGrip[1], gk, 0.9, 3);
  // reel seat: a metal sleeve with locking rings
  {
    const [y0, y1] = sp.seat;
    const ys = [y0, y0 + 0.012, y0 + 0.018, y1 - 0.018, y1 - 0.012, y1];
    const rr = ys.map((y, i) => { const r = radius(y) + (i === 1 || i === 4 ? 0.0075 : 0.0055); return { pts: ellRing(y, 0, 0, r, r, r, 10, 2, 1), v: i / 5, w: wAt(y) }; });
    B.loft(rr, usFor(10), reg('METAL'), 4, {});
  }
  // guides: a wire ring on two little feet, a thread wrap under each foot; sizes shrink toward the tip
  for (let i = 0; i < sp.guides; i++) {
    const t = 0.28 + (0.95 - 0.28) * Math.pow(i / Math.max(1, sp.guides - 1), 0.85);
    const y = b0 + (sp.len - b0) * t;
    const gr = (0.016 - t * 0.011) * (sp.butt / 0.011);
    const rb = radius(y);
    const off = rb + gr * 1.3;
    const w = wAt(y);
    // wrap
    const wr = [y - gr * 0.9, y + gr * 0.9].map((yy, k) => ({ pts: ellRing(yy, 0, 0, radius(yy) + 0.0007, radius(yy) + 0.0007, radius(yy) + 0.0007, 6, 2, 1), v: k, w: wAt(yy) }));
    B.loft(wr, usFor(6), reg('WRAP'), 5, {});
    // feet
    B.tube([[0, y - gr * 0.8, -rb], [0, y, -off + gr * 0.9]], () => 0.0007, 3, reg('METAL'), 6, { w: () => w });
    // the ring (in the x-z plane... standing across the rod, facing along it)
    const ring: V3[] = [];
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; ring.push([Math.cos(a) * gr, y, -off + Math.sin(a) * gr]); }
    B.tube(ring, () => Math.max(0.0007, gr * 0.12), 4, reg('METAL'), 7, { w: () => w });
  }
  // tip-top
  { const y = sp.len, r = sp.tip * 2.2; const ring: V3[] = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; ring.push([Math.cos(a) * r, y + 0.004, -r * 1.2 + Math.sin(a) * r]); } B.tube(ring, () => 0.0008, 4, reg('METAL'), 8, { w: () => [NB - 1, 1] }); }
  // the reel
  const crank = buildReel(B, sp, radius, wAt);
  const geo = B.build();
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, sp.len / 2, 0), sp.len);
  // crank handle (a separate rigid mesh that spins about its axis)
  const CB = new Loft(false);
  const cr = crank.r;
  // the arm from the hub to the knob, along local +x of the crank frame; knob a fat barrel
  CB.box([cr / 2, 0, 0], [cr, 0.006, 0.004], reg('METAL'));
  const knob = [0, 0.004, 0.018, 0.024].map((d, i) => ({ pts: ellRing(0, cr, 0, 0.007 + (i === 1 || i === 2 ? 0.002 : 0), 0.007 + (i === 1 || i === 2 ? 0.002 : 0), 0.007, 8, 2, 1).map((p) => [p[0], p[2], 0.004 + d] as V3), v: i / 3 }));
  CB.loft(knob, usFor(8), reg('KNOB'), 1, { start: [cr, 0, 0.004], end: [cr, 0, 0.03] });
  const crankGeo = CB.build();
  const mat = new THREE.MeshStandardMaterial({ map: paintRod(L, sp), roughness: 0.45, metalness: 0.1, vertexColors: true });
  const a: RodAsset = { geo, mat, spec: sp, boneY, crank, crankGeo };
  assets.set(key, a);
  return a;
}

/** reel geometry; returns the crank hub (rod space), radius and axis */
function buildReel(B: Loft, sp: RodSpec, radius: (y: number) => number, wAt: (y: number) => Wt): { c: V3; r: number; axis: V3 } {
  const y = (sp.seat[0] + sp.seat[1]) / 2, w = wAt(y), rb = radius(y) + 0.006;
  const W = (): Wt => w;
  const cyl = (c: V3, axis: 'x' | 'y' | 'z', len: number, r0: number, r1: number, rg: Reg, g: number, n = 12, caps = true) => {
    const rings = [-0.5, 0.5].map((f, i) => {
      const r = i ? r1 : r0;
      const pts: V3[] = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
        pts.push(axis === 'x' ? [c[0] + f * len, c[1] + u, c[2] + v] : axis === 'y' ? [c[0] + u, c[1] + f * len, c[2] + v] : [c[0] + u, c[1] + v, c[2] + f * len]);
      }
      return { pts, v: i, w };
    });
    const ends: V3[] = [axis === 'x' ? [c[0] - len / 2, c[1], c[2]] : axis === 'y' ? [c[0], c[1] - len / 2, c[2]] : [c[0], c[1], c[2] - len / 2], axis === 'x' ? [c[0] + len / 2, c[1], c[2]] : axis === 'y' ? [c[0], c[1] + len / 2, c[2]] : [c[0], c[1], c[2] + len / 2]];
    B.loft(rings, usFor(n), rg, g, caps ? { start: ends[0], end: ends[1], startW: w, endW: w } : {});
  };
  switch (sp.reel) {
    case 'spin': case 'inline': case 'vintage': {
      const small = sp.reel === 'inline' ? 0.65 : sp.reel === 'vintage' ? 0.9 : 1;
      // stem down from the seat, body, spool facing up the rod, a bail wire round the front, crank on the -x side
      const d = (0.045 * small);
      B.tube([[0, y, -rb], [0, y - 0.004, -rb - d * 0.6], [0, y - 0.01, -rb - d]], () => 0.0035 * small, 5, reg('REEL'), 20, { w: W });
      const bc: V3 = [0, y - 0.012, -rb - d - 0.018 * small];
      if (sp.reel === 'vintage') {
        cyl(bc, 'x', 0.022, 0.034, 0.034, reg('REEL2'), 21, 16);
        cyl([0, bc[1], bc[2]], 'x', 0.026, 0.012, 0.012, reg('METAL'), 22);
        return { c: [-0.014, bc[1], bc[2]], r: 0.022, axis: [-1, 0, 0] };
      }
      cyl(bc, 'y', 0.05 * small, 0.022 * small, 0.026 * small, reg('REEL'), 21, 14);
      cyl([bc[0], bc[1] + 0.04 * small, bc[2]], 'y', 0.03 * small, 0.02 * small, 0.02 * small, reg('SPOOL'), 22, 14);
      cyl([bc[0], bc[1] + 0.06 * small, bc[2]], 'y', 0.012 * small, 0.017 * small, 0.013 * small, reg('REEL2'), 23, 12);
      // bail arm
      const bail: V3[] = [];
      for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); bail.push([Math.cos(a) * 0.026 * small, bc[1] + 0.05 * small + Math.sin(a) * 0.006, bc[2] - Math.sin(a) * 0.024 * small]); }
      B.tube(bail, () => 0.0012, 4, reg('METAL'), 24, { w: W });
      return { c: [-0.028 * small, bc[1] - 0.004, bc[2]], r: 0.03 * small, axis: [-1, 0, 0] };
    }
    case 'conventional': {
      // a star-drag boat reel on TOP of the rod: drum across the rod, side plates, crank on the -x side
      const c: V3 = [0, y, rb + 0.03];
      cyl(c, 'x', 0.06, 0.032, 0.032, reg('REEL'), 21, 16);
      cyl([c[0], c[1], c[2]], 'x', 0.064, 0.024, 0.024, reg('SPOOL'), 22, 16, false);
      for (const sx of [-1, 1]) cyl([c[0] + sx * 0.033, c[1], c[2]], 'x', 0.008, 0.035, 0.035, reg('REEL2'), 23 + (sx > 0 ? 1 : 0), 16);
      cyl([c[0], c[1], rb + 0.004], 'z', 0.012, 0.008, 0.008, reg('METAL'), 25, 8);
      return { c: [-0.042, c[1] - 0.006, c[2]], r: 0.034, axis: [-1, 0, 0] };
    }
    case 'baitcast': {
      const c: V3 = [0, y, rb + 0.018];
      const rings = [-0.03, -0.02, 0.02, 0.03].map((dy, i) => ({ pts: ellRing(c[1] + dy, c[0], c[2], [0.022, 0.034, 0.034, 0.024][i], 0.02, 0.016, 14, 2.4, 1), v: i / 3, w }));
      B.loft(rings, usFor(14), reg('REEL'), 21, { start: [c[0], c[1] - 0.034, c[2]], end: [c[0], c[1] + 0.034, c[2]] });
      cyl([c[0] - 0.034, c[1] - 0.004, c[2]], 'x', 0.008, 0.016, 0.016, reg('REEL2'), 22, 12);
      return { c: [-0.04, c[1] - 0.004, c[2]], r: 0.028, axis: [-1, 0, 0] };
    }
    case 'spincast': {
      const c: V3 = [0, y + 0.01, rb + 0.022];
      const rings = [-0.03, -0.012, 0.012, 0.03, 0.04].map((dy, i) => ({ pts: ellRing(c[1] + dy, c[0], c[2], [0.024, 0.028, 0.028, 0.02, 0.008][i], [0.024, 0.028, 0.028, 0.02, 0.008][i], [0.024, 0.028, 0.028, 0.02, 0.008][i], 14, 2, 1), v: i / 4, w }));
      B.loft(rings, usFor(14), reg('REEL'), 21, { start: [c[0], c[1] - 0.034, c[2]] });
      B.box([c[0], c[1] - 0.034, c[2] + 0.012], [0.016, 0.01, 0.012], reg('REEL2'), w);
      return { c: [-0.032, c[1] - 0.012, c[2]], r: 0.026, axis: [-1, 0, 0] };
    }
  }
}

function paintRod(L: Look, sp: RodSpec): THREE.Texture {
  const P = new Px(T, T);
  const blank = L.rod.col, wrap = L.rod.wrap, rc = L.rod.reelCol;
  const fill = (k: keyof typeof REG, fn: (u: number, v: number, x: number, y: number) => RGB) => {
    const r = REG[k];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) P.set(x, y, fn((x - r.x) / (r.w - 1), 1 - (y - r.y) / (r.h - 1), x, y));
  };
  const cane = L.rod.kind === 'cane';
  fill('BLANK', (u, v, x, y) => {
    // glossy blank with a light spine streak; decorative wraps near the handle, a hook keeper, a painted logo band
    let c: RGB = cane ? band(blank, 0.9 + (nz(x * 3, y * 0.3, 8, 1) - 0.5) * 0.3 + (Math.abs(u - 0.5) < 0.08 ? 0.15 : 0), x, y) : band(blank, 0.92 + (Math.abs(u - 0.62) < 0.07 ? 0.35 : 0) + (Math.abs(u - 0.3) < 0.05 ? 0.12 : 0), x, y);
    const yy = v * sp.len;
    const b0 = sp.foreGrip ? sp.foreGrip[1] : sp.seat[1];
    if (yy > b0 && yy < b0 + 0.03) c = band(wrap, 0.95 + ((y % 2) ? 0.08 : 0), x, y);
    if (yy > b0 + 0.04 && yy < b0 + 0.05) c = band(mix(wrap, [255, 255, 255], 0.5), 1, x, y);
    if (yy > b0 + 0.06 && yy < b0 + 0.11 && !cane) c = band(mix(blank, [240, 240, 240], 0.6), 0.95 + (Math.abs(u - 0.5) < 0.2 && (y % 3) ? -0.3 : 0), x, y);
    if (cane && Math.abs(((yy * 3.3) % 1) - 0.5) < 0.03) c = band(wrap, 0.9, x, y);
    return c;
  });
  fill('CORK', (u, v, x, y) => {
    const base: RGB = [196, 156, 104];
    let k = 0.92 + (nz(x, y, 3, 2) - 0.5) * 0.35;
    if (hh(x, y, 3) > 0.9) k -= 0.25;
    if (y % 6 === 0) k -= 0.08;
    return band(base, k, x, y);
  });
  fill('EVA', (u, v, x, y) => band(L.arch === 'kid' ? mix(blank, [30, 30, 30], 0.6) : [36, 36, 40], 0.9 + (hh(x, y, 5) - 0.5) * 0.12 + (y % 5 === 0 ? -0.06 : 0), x, y));
  fill('REEL', (u, v, x, y) => metal(rc, x, y, 0.85 + Math.sin(u * Math.PI) * 0.3 + (v > 0.45 && v < 0.55 ? -0.15 : 0)));
  fill('REEL2', (u, v, x, y) => metal(L.rod.reel === 'conventional' ? [210, 210, 214] : shade(rc, 0.7), x, y, 0.85 + Math.sin(u * Math.PI) * 0.3));
  fill('METAL', (u, v, x, y) => metal([200, 204, 210], x, y, 0.8 + Math.sin(u * Math.PI * 2) * 0.25));
  fill('WRAP', (u, v, x, y) => band(wrap, 0.9 + ((y % 2) ? 0.1 : 0), x, y));
  fill('SPOOL', (u, v, x, y) => band(L.arch === 'kid' ? [250, 240, 120] : [220, 230, 210], 0.85 + ((y % 2) ? 0.15 : 0), x, y));
  fill('KNOB', (u, v, x, y) => band(L.rod.reel === 'vintage' ? [70, 40, 26] : [34, 32, 32], 0.85 + Math.sin(u * Math.PI) * 0.3, x, y));
  return P.texture();
}

// ------------------------------------------------------------------ the live rod
export class Rod {
  obj = new THREE.Group();
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[] = [];
  crank: THREE.Object3D;
  spec: RodSpec;
  private asset: RodAsset;
  /** bend state: static (tension) and dynamic (whip) bend vectors in rod-local x/z, radians total */
  private dyn = new THREE.Vector2(); private dynV = new THREE.Vector2();
  private prevDir = new THREE.Vector3(0, 1, 0); private prevQ = new THREE.Quaternion();
  private bendAxis = new THREE.Vector3(1, 0, 0);
  tension = 0;
  /** where the line pulls (body space unit vector); default straight down */
  pull = new THREE.Vector3(0, -1, 0);
  crankAngle = 0;
  private tip = new THREE.Object3D();
  stiff: number;

  constructor(L: Look) {
    this.asset = rodAsset(L);
    this.spec = this.asset.spec;
    const boneY = this.asset.boneY;
    for (let i = 0; i < NB; i++) {
      const b = new THREE.Bone();
      b.position.set(0, i === 0 ? 0 : boneY[i] - boneY[i - 1], 0);
      if (i > 0) this.bones[i - 1].add(b);
      this.bones.push(b);
    }
    this.mesh = new THREE.SkinnedMesh(this.asset.geo, this.asset.mat);
    this.mesh.add(this.bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.obj.add(this.mesh);
    this.tip.position.set(0, this.spec.len - boneY[NB - 1] + 0.004, -this.spec.tip * 2.6);
    this.bones[NB - 1].add(this.tip);
    // crank: hub frame at the reel, spinning about the crank axis (rod -x)
    const hub = new THREE.Object3D();
    const c = this.asset.crank.c;
    hub.position.set(c[0], c[1], c[2]);
    hub.rotation.y = -Math.PI / 2; // local +z of the crank frame -> rod -x (outward)
    const cm = new THREE.Mesh(this.asset.crankGeo, this.asset.mat);
    cm.castShadow = true;
    hub.add(cm);
    this.bones[0].add(hub);
    this.crank = hub;
    this.stiff = L.rod.kind === 'heavy' ? 0.55 : L.rod.kind === 'boat' || L.rod.kind === 'pier' ? 0.75 : L.rod.kind === 'ice' ? 1.3 : 1;
  }

  /** knob position of the crank (rod space) for the off hand's IK */
  knobLocal(out: THREE.Vector3): THREE.Vector3 {
    const c = this.asset.crank.c, r = this.asset.crank.r;
    // the knob orbits in the rod's y-z plane round the hub
    return out.set(c[0] - 0.02, c[1] + Math.cos(this.crankAngle) * r, c[2] + Math.sin(this.crankAngle) * r);
  }
  /** grip point (where the rod hand closes) */
  get grip() { return this.spec.grip; }
  get len() { return this.spec.len; }

  /**
   * Bend the blank. The rod's world/body orientation must already be set on obj. tension 0..1 bends toward
   * `pull`; the whip spring reacts to how fast the rod swings.
   */
  update(dt: number) {
    this.obj.updateMatrixWorld();
    const q = this.obj.quaternion;
    // static bend toward the pull, scaled by how across the rod the pull is
    const pl = this.pull.clone().applyQuaternion(q.clone().invert()); // into rod space
    const across = Math.hypot(pl.x, pl.z);
    const bendS = this.tension * (1.35 * this.stiff) * Math.min(1, across * 1.3 + 0.15) + 0.05; // a little sag always
    const sx = across > 1e-4 ? pl.x / across : 0, sz = across > 1e-4 ? pl.z / across : -1;
    // dynamic whip: the tip lags the swing
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    if (dt > 0) {
      const vel = dir.clone().sub(this.prevDir).multiplyScalar(1 / dt).applyQuaternion(q.clone().invert());
      const k = 260, c = 9;
      const tx = -vel.x * 0.06, tz = -vel.z * 0.06;
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) {
        this.dynV.x += ((tx - this.dyn.x) * k - this.dynV.x * c) * h; this.dynV.y += ((tz - this.dyn.y) * k - this.dynV.y * c) * h;
        this.dyn.x += this.dynV.x * h; this.dyn.y += this.dynV.y * h;
      }
      this.dyn.clampLength(0, 1.2);
    }
    this.prevDir.copy(dir); this.prevQ.copy(q);
    const bx = sx * bendS + this.dyn.x, bz = sz * bendS + this.dyn.y;
    const total = Math.hypot(bx, bz);
    // rotation axis that tips +y toward (bx, 0, bz): axis = y x b
    if (total > 1e-5) this.bendAxis.set(bz / total, 0, -bx / total); else this.bendAxis.set(1, 0, 0);
    let wsum = 0; const ws: number[] = [];
    for (let i = 1; i < NB; i++) { const w = Math.pow(i / (NB - 1), 1.7); ws.push(w); wsum += w; }
    for (let i = 1; i < NB; i++) this.bones[i].quaternion.setFromAxisAngle(this.bendAxis, (total * ws[i - 1]) / wsum);
    // crank spin
    this.crank.rotation.z = this.crankAngle;
  }

  /** world position of the (bent) rod tip */
  tipWorld(out: THREE.Vector3): THREE.Vector3 {
    this.tip.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.tip.matrixWorld);
  }
  /** rod-space position of the tip (bent) relative to obj */
  tipObj(): THREE.Object3D { return this.tip; }
}
