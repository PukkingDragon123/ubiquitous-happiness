// Headwear and worn gear, each its own mesh on a bone so it can react (hats pop off in surprise, glasses
// glint): captain's hats (white top / Gaff's black one with gold braid), bucket hat, ball caps (forward and
// backward), a floppy straw sunhat with ribbon and flower, a fur ushanka with ear flaps, a knit beanie,
// wayfarer / wraparound / round glasses, the captain's leather eyepatch, a corncob pipe, Gaff's harpoon arm,
// the pro's lures hooked to his vest and grandma's pearls. Shapes follow the skull (HeadShape) so everything
// sits snugly; textures live in the HAT / HAT2 / GEAR / ACC / PATCH regions of the character page.
import * as THREE from 'three';
import type { V3, Reg } from '../gfx/loft';
import { Loft, usFor } from '../gfx/loft';
import { Px as PxC } from '../gfx/px';
import type { Px, RGB } from '../gfx/px';
import { mix, shade } from '../gfx/px';
import type { Look } from './looks';
import type { BodyBuild, Shape } from './body';
import type { Dims, BoneName } from './rig';
import { ellRing, clamp01 } from './rig';
import type { HeadShape } from './head';
import { R, subR } from './page';
import { fillSub } from './paint';
import { band, nz, hh, knitK, ribK, canvas, fur, metal, oilskin, cotton } from './fabric';

export interface Gear {
  hat: THREE.Object3D | null;
  hatRest: THREE.Vector3;
  glasses: THREE.Object3D | null;
  parts: THREE.Object3D[];
  harpoonTip: THREE.Object3D | null;
  pipe: THREE.Object3D | null;
}

const lensMats = new Map<string, THREE.Material>();
/** lenses: clear (round reading glasses) or tinted / mirrored with a painted gradient and a glint streak */
function lensMat(c: RGB, kind: string): THREE.Material {
  const key = kind + c.join(',');
  let m = lensMats.get(key);
  if (!m) {
    if (kind === 'round') m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace), roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false });
    else {
      const P = new PxC(32, 16);
      const mirror = kind === 'wrap';
      P.fill((x, y) => {
        const v = y / 15;
        // mirror coating: bright colour on top fading to near-black; a dark smoked gradient for plain shades
        let col: RGB = mirror ? mix(mix(c, [255, 255, 255], 0.25), shade(c, 0.25), v) : mix(mix(c, [20, 20, 24], 0.55), [8, 8, 10], v * 0.8);
        const streak = Math.abs((x - y * 1.3) - 8) < 1.6 || Math.abs((x - y * 1.3) - 13) < 0.8;
        if (streak) col = mix(col, [255, 255, 255], mirror ? 0.55 : 0.4);
        return band(col, 1, x, y, 0.08);
      });
      m = new THREE.MeshStandardMaterial({ map: P.texture(), roughness: 0.1, metalness: mirror ? 0.6 : 0.3, emissive: new THREE.Color(0xffffff), emissiveMap: P.texture(), emissiveIntensity: 0.25 });
    }
    lensMats.set(key, m);
  }
  return m;
}
let pearlMat: THREE.Material | null = null;

/** a thin closed slab from a grid of mid-surface points and their normals (visors, brims, flaps) */
function slab(B: Loft, grid: V3[][], nrm: V3[][], t: number, top: Reg, bot: Reg, g: number) {
  const Rn = grid.length, Cn = grid[0].length;
  const off = (i: number, j: number, k: number): V3 => { const p = grid[i][j], n = nrm[i][j]; return [p[0] + n[0] * t * k, p[1] + n[1] * t * k, p[2] + n[2] * t * k]; };
  const ids = (k: number, reg: Reg, gg: number) => grid.map((row, i) => row.map((_, j) => B.vert(off(i, j, k), reg.x + (j / (Cn - 1)) * reg.w, reg.y + (i / (Rn - 1)) * reg.h, undefined, gg)));
  const T = ids(0.5, top, g), Bt = ids(-0.5, bot, g + 1);
  for (let i = 0; i + 1 < Rn; i++) for (let j = 0; j + 1 < Cn; j++) {
    B.tri(T[i][j], T[i + 1][j], T[i][j + 1]); B.tri(T[i][j + 1], T[i + 1][j], T[i + 1][j + 1]);
    B.tri(Bt[i][j], Bt[i][j + 1], Bt[i + 1][j]); B.tri(Bt[i][j + 1], Bt[i + 1][j + 1], Bt[i + 1][j]);
  }
  // fix winding so the top faces along +normal
  const a = B.pos(T[0][0]), b = B.pos(T[1][0]), c = B.pos(T[0][1]);
  const n = nrm[0][0];
  const cr = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) {
    const I = B.I;
    const start = I.length - (Rn - 1) * (Cn - 1) * 12;
    for (let q = start; q < I.length; q += 3) { const tmp = I[q + 1]; I[q + 1] = I[q + 2]; I[q + 2] = tmp; }
  }
  // the rim: an edge strip round the outer row (last row) using the bottom texture's edge
  const last = Rn - 1;
  for (let j = 0; j + 1 < Cn; j++) {
    const a1 = B.vert(off(last, j, 0.5), bot.x + (j / (Cn - 1)) * bot.w, bot.y + bot.h, undefined, -1), b1 = B.vert(off(last, j + 1, 0.5), bot.x + ((j + 1) / (Cn - 1)) * bot.w, bot.y + bot.h, undefined, -1);
    const c1 = B.vert(off(last, j + 1, -0.5), bot.x + ((j + 1) / (Cn - 1)) * bot.w, bot.y + bot.h * 0.98, undefined, -1), d1 = B.vert(off(last, j, -0.5), bot.x + (j / (Cn - 1)) * bot.w, bot.y + bot.h * 0.98, undefined, -1);
    const ins = grid[last - 1][j];
    B.triOut(a1, b1, c1, ins); B.triOut(a1, c1, d1, ins);
  }
}

const HANG = Array.from({ length: 25 }, (_, i) => -180 + i * 15);

export function buildGear(L: Look, body: BodyBuild, d: Dims, mat: THREE.Material, bones: Record<BoneName, THREE.Bone>): Gear {
  const S = body.head;
  const gear: Gear = { hat: null, hatRest: new THREE.Vector3(), glasses: null, parts: [], harpoonTip: null, pipe: null };
  const mk = (B: Loft, parent: THREE.Object3D, m: THREE.Material = mat, shadow = true) => {
    const mesh = new THREE.Mesh(B.build(), m);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    parent.add(mesh); gear.parts.push(mesh);
    return mesh;
  };
  // ---------------- hats (head-bone space)
  if (L.hat !== 'none' && L.hat !== 'hood' && L.hat !== 'brass') {
    const B = new Loft(false);
    buildHat(B, L, S);
    const hat = new THREE.Group();
    const m = new THREE.Mesh(B.build(), mat);
    m.castShadow = true; m.receiveShadow = true;
    // pivot at the crown so the hat can hop and tip
    const piv = S.loc([0, 0.15, 0]);
    m.position.set(-piv[0], -piv[1], -piv[2]);
    hat.add(m);
    hat.position.set(piv[0], piv[1], piv[2]);
    bones.head.add(hat);
    gear.hat = hat; gear.hatRest.copy(hat.position);
  }
  // ---------------- glasses
  if (L.glasses !== 'none') {
    const g = new THREE.Group();
    const B = new Loft(false), BL = new Loft(false);
    buildGlasses(B, BL, L, S);
    g.add(mk(B, g, frameMat(L.glassCol)));
    if (BL.count) {
      const lm = mk(BL, g, lensMat(L.lensCol, L.glasses), false);
      // planar uvs from the lens bounds: the tint gradient runs top to bottom across both lenses
      const geo = lm.geometry, pos = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1));
      uv.needsUpdate = true;
    }
    bones.head.add(g);
    gear.glasses = g;
  }
  // ---------------- eyepatch
  if (L.face.eyepatch) {
    const B = new Loft(false);
    const side = L.face.eyepatch === 'L' ? 1 : -1, F = S.F;
    const grid: V3[][] = [];
    const rows = 6, cols = 7;
    for (let i = 0; i < rows; i++) {
      const row: V3[] = [];
      for (let j = 0; j < cols; j++) {
        const u = j / (cols - 1) - 0.5, v = i / (rows - 1) - 0.5;
        const e = Math.min(1, Math.hypot(u * 2, v * 2));
        const y = F.eyeY + v * 0.044 * (1 - Math.abs(u) * 0.25), a = side * (F.eyeA + u * 30);
        row.push(S.loc(S.skull(y, a, 0.0035 + (1 - e * e) * 0.006, false)));
      }
      grid.push(row);
    }
    const reg = subR(R('PATCH'), 0, 0.5, 1, 1);
    B.sheet(grid, reg, 1);
    mk(B, bones.head);
  }
  // ---------------- pipe (corncob) in the mouth corner
  if (L.extras.pipe) {
    const B = new Loft(false);
    const F = S.F;
    const m0 = S.loc(S.skull(F.mouthY + 0.002, 22, 0.002, true));
    const dir: V3 = [0.35, -0.42, 0.84];
    const hs = S.hs;
    const p1: V3 = [m0[0] + dir[0] * 0.07 * hs, m0[1] + dir[1] * 0.07 * hs, m0[2] + dir[2] * 0.07 * hs];
    B.tube([m0, [(m0[0] + p1[0]) / 2, (m0[1] + p1[1]) / 2 + 0.004 * hs, (m0[2] + p1[2]) / 2], p1], (t) => (0.0042 - t * 0.0008) * hs, 6, subR(R('GEAR'), 0, 0.8, 0.12, 1), 1, { capStart: true });
    // the bowl: a corncob cylinder standing up from the stem end
    const bowl: { y: number; r: number }[] = [{ y: -0.004, r: 0.012 }, { y: 0.006, r: 0.016 }, { y: 0.03, r: 0.017 }, { y: 0.046, r: 0.016 }];
    const rings = bowl.map((q, i) => ({ pts: ellRing(p1[1] + q.y * hs, p1[0], p1[2], q.r * hs, q.r * hs, q.r * hs, 10, 2, 1), v: i / 3 }));
    B.loft(rings, usFor(10), subR(R('GEAR'), 0.12, 0.8, 0.3, 1), 2, { start: [p1[0], p1[1] - 0.008 * hs, p1[2]] });
    // dark burnt hole on top
    const top = p1[1] + 0.046 * hs;
    const hole = [{ pts: ellRing(top, p1[0], p1[2], 0.016 * hs, 0.016 * hs, 0.016 * hs, 10, 2, 1), v: 1 }, { pts: ellRing(top - 0.004 * hs, p1[0], p1[2], 0.011 * hs, 0.011 * hs, 0.011 * hs, 10, 2, 1), v: 0.5 }];
    B.loft(hole, usFor(10), subR(R('GEAR'), 0.3, 0.8, 0.36, 1), 3, { end: [p1[0], top - 0.012 * hs, p1[2]] });
    const pm = mk(B, bones.head);
    gear.pipe = pm;
  }
  // ---------------- harpoon arm (Gaff, left forearm)
  if (L.extras.harpoon) {
    const B = new Loft(false);
    const s = d.s, al = L.build.armLen;
    const y0 = -(0.45 - 0.285) * al * s; // farm-local: the stump end
    const reg = R('GEAR');
    const cyl = (ya: number, yb: number, ra: number, rb: number, rg: Reg, g: number, n = 12, cap = false) => {
      const rr = [{ pts: ellRing(ya, 0, 0, ra, ra, ra, n, 2, 1), v: 1 }, { pts: ellRing(yb, 0, 0, rb, rb, rb, n, 2, 1), v: 0 }];
      B.loft(rr, usFor(n), rg, g, cap ? { start: [0, ya, 0], end: [0, yb, 0] } : {});
    };
    // a brass cuff over the stump, leather straps, then the iron launcher barrel
    cyl(y0 + 0.07 * s, y0 - 0.02 * s, 0.05 * s, 0.054 * s, subR(reg, 0.36, 0.6, 0.56, 1), 10, 14);
    cyl(y0 + 0.03 * s, y0 + 0.012 * s, 0.056 * s, 0.056 * s, subR(reg, 0.56, 0.6, 0.66, 1), 11, 14);
    cyl(y0 - 0.02 * s, y0 - 0.05 * s, 0.054 * s, 0.03 * s, subR(reg, 0.36, 0.6, 0.56, 1), 12, 14, true);
    cyl(y0 - 0.03 * s, y0 - 0.26 * s, 0.024 * s, 0.022 * s, subR(reg, 0.66, 0.6, 0.86, 1), 13, 10);
    cyl(y0 - 0.25 * s, y0 - 0.28 * s, 0.03 * s, 0.03 * s, subR(reg, 0.36, 0.6, 0.56, 1), 14, 10, true);
    // the harpoon: a shaft and a barbed head sticking out of the muzzle
    cyl(y0 - 0.2 * s, y0 - 0.42 * s, 0.008 * s, 0.008 * s, subR(reg, 0.86, 0.6, 1, 1), 15, 6);
    const tipY = y0 - 0.42 * s;
    const head = [{ pts: ellRing(tipY, 0, 0, 0.012 * s, 0.012 * s, 0.012 * s, 6, 2, 1), v: 1 }, { pts: ellRing(tipY - 0.03 * s, 0, 0, 0.016 * s, 0.006 * s, 0.006 * s, 6, 2, 1), v: 0.5 }];
    B.loft(head, usFor(6), subR(reg, 0.86, 0.6, 1, 1), 16, { start: [0, tipY + 0.004 * s, 0], end: [0, tipY - 0.07 * s, 0] });
    for (const k of [1, -1]) B.box([k * 0.016 * s, tipY - 0.02 * s, 0], [0.005 * s, 0.04 * s, 0.006 * s], subR(reg, 0.86, 0.6, 1, 1), undefined, new THREE.Matrix4().makeRotationZ(k * 0.5));
    // a rope coil on the side of the barrel
    const coil: V3[] = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 6; coil.push([0.03 * s + Math.cos(a) * 0.008 * s, y0 - 0.08 * s - i * 0.0028 * s, Math.sin(a) * 0.03 * s]); }
    B.tube(coil, () => 0.0045 * s, 5, subR(reg, 0.56, 0.6, 0.66, 1), 17);
    mk(B, bones.farmL);
    const tip = new THREE.Object3D(); tip.position.set(0, tipY - 0.07 * s, 0); bones.farmL.add(tip);
    gear.harpoonTip = tip;
  }
  // ---------------- lures on the pro's vest (chest-bone space)
  if (L.extras.lures) {
    const B = new Loft(false);
    const cp = d.rest.chest;
    const surf = (y: number, deg: number) => {
      // approximate vest surface: torso front + vest thickness
      const yy = d.ty(y);
      const r = 0.1 * L.build.mass * d.s + 0.022 * d.s;
      const th = (deg * Math.PI) / 180;
      return [Math.sin(th) * 0.14 * L.build.bw * d.s * 1.05 - cp[0], yy - cp[1], Math.cos(th) * r - cp[2]] as V3;
    };
    const spots: [number, number, number][] = [[38, 1.33, 0], [44, 1.3, 1], [50, 1.27, 2], [40, 1.26, 3], [-20, 1.31, 1], [-28, 1.2, 2], [20, 1.08, 0]];
    spots.forEach(([deg, y, kind], i) => {
      const p = surf(y, deg);
      const s = d.s;
      const hang = 0.018 * s;
      const col = subR(R('GEAR'), 0.0 + (i % 4) * 0.08, 0.3, 0.08 + (i % 4) * 0.08, 0.6);
      if (kind === 0 || kind === 3) {
        // crankbait: a fat little fish body with a diving lip, nose up hanging from its hook
        const len = 0.05 * s, rr = 0.011 * s;
        const pts = [0, 0.15, 0.4, 0.7, 0.92].map((t) => [p[0], p[1] - hang - t * len, p[2] + 0.012 * s] as V3);
        const rad = [0.4, 0.9, 1, 0.75, 0.35];
        const rings = pts.map((c, k) => ({ pts: ellRing(c[1], c[0], c[2], rr * rad[k] * 0.6, rr * rad[k], rr * rad[k], 8, 2, 1), v: k / 4 }));
        B.loft(rings, usFor(8), col, 20 + i, { start: [p[0], p[1] - hang + 0.003 * s, p[2] + 0.012 * s], end: [p[0], p[1] - hang - len * 1.02, p[2] + 0.012 * s] });
        B.box([p[0], p[1] - hang - len * 1.05, p[2] + 0.018 * s], [0.012 * s, 0.014 * s, 0.002 * s], subR(R('GEAR'), 0.34, 0.3, 0.4, 0.6), undefined, new THREE.Matrix4().makeRotationX(0.6));
      } else if (kind === 1) {
        // spoon: a flat cupped ellipse of polished metal
        const grid: V3[][] = [];
        for (let a = 0; a < 5; a++) { const row: V3[] = []; for (let b = 0; b < 4; b++) { const v = a / 4, u = b / 3 - 0.5; const w = Math.sin(v * Math.PI) * 0.012 * s; row.push([p[0] + u * w * 2, p[1] - hang - v * 0.045 * s, p[2] + 0.012 * s + Math.abs(u) * 0.006 * s]); } grid.push(row); }
        B.sheet(grid, subR(R('ACC'), 0, 0.5, 0.5, 1), 40 + i);
      } else {
        // jig: a painted lead head with a rubber skirt
        const c: V3 = [p[0], p[1] - hang - 0.008 * s, p[2] + 0.014 * s];
        const rings = [0.006, 0.009, 0.006].map((r, k) => ({ pts: ellRing(c[1] - k * 0.006 * s, c[0], c[2], r * s, r * s, r * s, 8, 2, 1), v: k / 2 }));
        B.loft(rings, usFor(8), col, 60 + i, { start: [c[0], c[1] + 0.006 * s, c[2]] });
        const sk = [0, 1, 2].map((k) => ({ pts: ellRing(c[1] - 0.012 * s - k * 0.012 * s, c[0], c[2], (0.006 + k * 0.004) * s, (0.006 + k * 0.004) * s, (0.006 + k * 0.004) * s, 8, 2, 1, (th) => Math.sin(th * 4) * 0.2 * k), v: 1 - k / 2 }));
        B.loft(sk, usFor(8), subR(R('GEAR'), 0.4, 0.3, 0.5, 0.6), 80 + i, {});
      }
      // the hook eye clipped through the vest
      B.tube([[p[0], p[1] + 0.002 * s, p[2] + 0.004 * s], [p[0], p[1] - hang * 0.6, p[2] + 0.014 * s], [p[0], p[1] - hang, p[2] + 0.012 * s]], () => 0.0012 * s, 4, subR(R('ACC'), 0.5, 0.5, 1, 1), 100 + i);
    });
    mk(B, bones.chest, mat, false);
  }
  // ---------------- pearls
  if (L.extras.pearls) {
    const cp = d.rest.chest, s = d.s;
    const geos: THREE.BufferGeometry[] = [];
    const base = new THREE.IcosahedronGeometry(0.0062 * s, 1);
    const n = 30;
    const yN = d.ty(1.452);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const front = Math.max(0, Math.cos(a));
      const r = 0.064 * s * L.build.mass;
      const g = base.clone();
      g.translate(Math.sin(a) * r * 0.98 - cp[0], yN - front * front * 0.03 * s - cp[1], Math.cos(a) * r * 1.05 + 0.004 * s - cp[2]);
      geos.push(g);
    }
    const merged = mergeGeos(geos);
    if (!pearlMat) pearlMat = new THREE.MeshStandardMaterial({ color: 0xf6f0e6, roughness: 0.18, metalness: 0.05, emissive: 0x2a2620 });
    const m = new THREE.Mesh(merged, pearlMat);
    m.castShadow = false;
    bones.chest.add(m); gear.parts.push(m);
  }
  return gear;
}

function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], I: number[] = [];
  let off = 0;
  for (const g of gs) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position as THREE.BufferAttribute;
    ng.computeVertexNormals();
    const nn = ng.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(nn.getX(i), nn.getY(i), nn.getZ(i)); I.push(off + i); }
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setIndex(I);
  return out;
}

const frameMats = new Map<string, THREE.Material>();
function frameMat(c: RGB) {
  const key = c.join(',');
  let m = frameMats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace), roughness: 0.25, metalness: c[0] > 120 ? 0.8 : 0.1 }); frameMats.set(key, m); }
  return m;
}

// ------------------------------------------------------------------ hats
function buildHat(B: Loft, L: Look, S: HeadShape) {
  const sk = (y: number, deg: number, off: number) => S.loc(S.skull(y, deg, off, false));
  const reg = R('HAT'), reg2 = R('HAT2');
  const us = HANG.map((a) => 0.5 + a / 360);
  // a crown that follows the skull from a hat line up over the top
  const dome = (yBase: (deg: number) => number, off: number, top: number, regC: Reg, g: number, lift = 0, sq = 1) => {
    const rows = 7;
    const rings = Array.from({ length: rows }, (_, i) => {
      const t = i / (rows - 1);
      return {
        pts: HANG.map((a) => {
          const y0 = yBase(a), y = y0 + (0.208 - y0) * Math.pow(t, 0.9);
          const p = sk(y, a, off + lift * t * t);
          return [p[0] * sq, p[1], p[2]] as V3;
        }), v: t,
      };
    });
    B.loft(rings, us, regC, g, { end: S.loc([0, top, -0.006]), endV: 1 });
  };
  /** an annular brim from the crown base: inner(deg) -> outer(deg) points, normal up */
  const brim = (inner: (deg: number) => V3, outer: (deg: number) => V3, t: number, top: Reg, bot: Reg, g: number, cols = HANG, rows = 4, droop = (_a: number, _f: number) => 0) => {
    const grid: V3[][] = [], nrm: V3[][] = [];
    for (let i = 0; i < rows; i++) {
      const f = i / (rows - 1);
      const row: V3[] = [], nr: V3[] = [];
      for (const a of cols) {
        const p = inner(a), q = outer(a);
        row.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f + droop(a, f), p[2] + (q[2] - p[2]) * f]);
        nr.push([0, 1, 0]);
      }
      grid.push(row); nrm.push(nr);
    }
    // normals from the grid (cross of the along / across directions)
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols.length; j++) {
      const a = grid[Math.min(rows - 1, i + 1)][j], b = grid[Math.max(0, i - 1)][j];
      const c = grid[i][Math.min(cols.length - 1, j + 1)], e = grid[i][Math.max(0, j - 1)];
      const u: V3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v: V3 = [c[0] - e[0], c[1] - e[1], c[2] - e[2]];
      let n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nrm[i][j] = [n[0] / l, n[1] / l, n[2] / l];
    }
    slab(B, grid, nrm, t, top, bot, g);
  };
  const hs = S.hs;
  const radial = (deg: number, y: number, r: number): V3 => { const t = (deg * Math.PI) / 180; return S.loc([Math.sin(t) * r, y, 0.004 + Math.cos(t) * r]); };
  switch (L.hat) {
    case 'captain': case 'captainBlack': {
      const black = L.hat === 'captainBlack';
      // band round the head, flaring a little, then the wide crown with its flat top, tipped forward
      const ys = [0.146, 0.166, 0.186];
      const band = ys.map((y, i) => ({ pts: HANG.map((a) => sk(y + (Math.abs(a) > 100 ? -0.004 : 0), a, 0.007 + i * 0.004)), v: i / 2 * 0.35 }));
      const tip = (a: number) => Math.cos((a * Math.PI) / 180) * 0.006;
      const crownR = black ? 0.138 : 0.13;
      const c1 = { pts: HANG.map((a) => radial(a, 0.212 - tip(a), crownR * (Math.abs(a) > 90 ? 0.97 : 1))), v: 0.55 };
      const c2 = { pts: HANG.map((a) => radial(a, 0.226 - tip(a), crownR * 1.01 * (Math.abs(a) > 90 ? 0.97 : 1))), v: 0.7 };
      B.loft([...band, c1, c2], us, subR(reg, 0, 0, 1, 1), 1, { end: S.loc([0, 0.232, 0.0]), endV: 1 });
      // the peak (visor): glossy black, curving down
      const vc = HANG.filter((a) => Math.abs(a) <= 75);
      brim((a) => sk(0.15, a, 0.008), (a) => { const p = sk(0.138, a, 0.008); const t = (a * Math.PI) / 180; const k = Math.cos(t) ** 0.7 * 0.058; return [p[0] + Math.sin(t) * k * hs, p[1] - 0.022 * hs * Math.cos(t), p[2] + Math.cos(t) * k * hs]; }, 0.004 * hs, subR(reg2, 0, 0.5, 0.5, 1), subR(reg2, 0, 0, 0.5, 0.5), 3, vc, 3);
      // gold cord above the peak
      const cord = HANG.filter((a) => Math.abs(a) <= 70).map((a) => sk(0.163, a, 0.013));
      B.tube(cord, () => 0.0028 * hs, 5, subR(R('ACC'), 0, 0, 0.5, 0.5), 4);
      // badge on the front of the crown band
      const bp = sk(0.184, 0, 0.017);
      B.box([bp[0], bp[1], bp[2]], [0.034 * hs, 0.028 * hs, 0.004 * hs], subR(R('PATCH'), 0, 0, 1, 0.5), undefined, new THREE.Matrix4().makeRotationX(-0.25));
      break;
    }
    case 'bucket': {
      dome((a) => 0.142 - (Math.abs(a) > 100 ? 0.006 : 0), 0.012, 0.238, subR(reg, 0, 0.2, 1, 1), 1, 0.006);
      brim((a) => sk(0.142 - (Math.abs(a) > 100 ? 0.006 : 0), a, 0.012), (a) => { const t = (a * Math.PI) / 180; const p = sk(0.138 - (Math.abs(a) > 100 ? 0.006 : 0), a, 0.012); return [p[0] + Math.sin(t) * 0.055 * hs, p[1] - 0.03 * hs, p[2] + Math.cos(t) * 0.055 * hs]; }, 0.004 * hs, subR(reg2, 0, 0.5, 0.6, 1), subR(reg2, 0, 0, 0.6, 0.5), 3, HANG, 4, (a, f) => Math.sin(a * 0.07) * 0.004 * hs * f);
      break;
    }
    case 'cap': case 'capBack': {
      const back = L.hat === 'capBack';
      const yb = (a: number) => { const aa = Math.abs(back ? 180 - Math.abs(a) : a); return aa < 60 ? 0.156 : 0.134 - (aa > 120 ? 0.008 : 0); };
      // six panels: seams are painted, the crown is slightly peaked
      dome(yb, 0.01, 0.232, subR(reg, 0, 0, 1, 1), 1, 0.008);
      // the bill
      const fa = back ? 180 : 0;
      const bc = Array.from({ length: 11 }, (_, i) => -66 + i * 13.2);
      // the bill reaches FORWARD (along the cap's facing), a rounded half-oval, its sides tucked to the band
      brim((a) => sk(yb(a + fa), a + fa, 0.01), (a) => { const p = sk(yb(a + fa) - 0.004, a + fa, 0.01); const ca = Math.cos((a * Math.PI) / 180); const k = Math.pow(Math.max(0, ca - 0.38) / 0.62, 0.55) * 0.088 * hs; const fz = back ? -1 : 1; return [p[0] + Math.sin(((a + fa) * Math.PI) / 180) * 0.008 * hs, p[1] - 0.014 * hs * ca, p[2] + fz * k]; }, 0.0045 * hs, subR(reg2, 0, 0.5, 0.5, 1), subR(reg2, 0, 0, 0.5, 0.5), 3, bc, 3, (a, f) => -(Math.abs(a / 66) ** 2) * 0.008 * hs * f);
      // the button on top
      const bt = S.loc([0, 0.235, -0.006]);
      B.box(bt, [0.014 * hs, 0.008 * hs, 0.014 * hs], subR(reg, 0.45, 0.95, 0.55, 1), undefined);
      break;
    }
    case 'sunhat': {
      dome(() => 0.145, 0.014, 0.246, subR(reg, 0, 0.35, 1, 1), 1, 0.012);
      // ribbon band
      const rb = [0.145, 0.165].map((y, i) => ({ pts: HANG.map((a) => sk(y, a, 0.0165 + i * 0.002)), v: i }));
      B.loft(rb, us, subR(reg, 0, 0, 1, 0.3), 2, {});
      // the wide floppy brim
      brim((a) => sk(0.145, a, 0.014), (a) => { const t = (a * Math.PI) / 180; const p = sk(0.141, a, 0.014); const w = 0.13 + Math.sin(a * 0.035 + 1) * 0.008; return [p[0] + Math.sin(t) * w * hs, p[1] - 0.035 * hs, p[2] + Math.cos(t) * w * hs]; }, 0.004 * hs, subR(reg2, 0, 0, 1, 1), subR(reg2, 0, 0, 1, 1), 3, HANG, 6, (a, f) => (Math.sin(a * 0.05) * 0.012 * f * f + f * 0.02 * (1 - f) * 0) * hs);
      // a fabric flower on the band (petals round a button)
      const fc = sk(0.155, 58, 0.022);
      for (let i = 0; i < 5; i++) {
        const an = (i / 5) * Math.PI * 2;
        B.box([fc[0] + Math.cos(an) * 0.012 * hs * 0.5, fc[1] + Math.sin(an) * 0.012 * hs, fc[2] + 0.004 * hs], [0.016 * hs, 0.016 * hs, 0.005 * hs], subR(R('ACC'), 0.5, 0, 1, 0.5), undefined, new THREE.Matrix4().makeRotationY((58 * Math.PI) / 180).multiply(new THREE.Matrix4().makeRotationZ(an)));
      }
      break;
    }
    case 'ushanka': {
      // leather / felt crown, the fur front flap turned up, ear flaps hanging down
      dome((a) => (Math.abs(a) < 60 ? 0.158 : 0.134), 0.016, 0.244, subR(reg, 0, 0, 1, 1), 1, 0.008);
      const fr = [0.15, 0.176, 0.204].map((y, i) => ({ pts: HANG.filter((a) => Math.abs(a) <= 75).map((a) => sk(y, a, 0.026 + (i === 1 ? 0.01 : 0) - (i === 2 ? 0.002 : 0))), v: i / 2 }));
      B.loft(fr, HANG.filter((a) => Math.abs(a) <= 75).map((_, i, arr) => i / (arr.length - 1)), subR(reg2, 0, 0.5, 0.6, 1), 2, {});
      B.loft(fr.map((r) => ({ ...r, pts: r.pts.map((p) => [p[0] * 0.92, p[1], p[2] * 0.92] as V3) })), HANG.filter((a) => Math.abs(a) <= 75).map((_, i, arr) => i / (arr.length - 1)), subR(reg2, 0, 0.5, 0.6, 1), 3, { flip: true });
      for (const k of [1, -1]) {
        // a padded flap over each ear: wide at the crown, tapering to a rounded tip, a tie string hanging off it
        const rows = [0.14, 0.1, 0.06, 0.025, 0.0, -0.012];
        const half = [32, 31, 28, 23, 15, 6];
        const grid = rows.map((y, i) => [-1, -0.5, 0, 0.5, 1].map((f) => sk(y, k * (100 + f * half[i]), 0.022 + (0.14 - y) * 0.07)));
        const nr = rows.map((_, i) => [-1, -0.5, 0, 0.5, 1].map((f) => { const t = (k * (100 + f * half[i]) * Math.PI) / 180; return [Math.sin(t), 0, Math.cos(t)] as V3; }));
        slab(B, grid, nr, 0.02 * hs, subR(reg2, 0.6, 0.5, 1, 1), subR(reg2, 0.6, 0, 1, 0.5), 5 + (k > 0 ? 0 : 2));
        const tip = sk(-0.004, k * 100, 0.034);
        B.tube([tip, [tip[0], tip[1] - 0.03 * hs, tip[2] + 0.01 * hs], [tip[0] - k * 0.006 * hs, tip[1] - 0.07 * hs, tip[2] + 0.004 * hs]], () => 0.0018 * hs, 4, subR(reg, 0, 0, 0.1, 0.1), 8 + (k > 0 ? 0 : 1));
      }
      // fur round the back
      const bk = [0.11, 0.135].map((y, i) => ({ pts: HANG.filter((a) => Math.abs(a) >= 120).sort((p, q) => (p < 0 ? p + 360 : p) - (q < 0 ? q + 360 : q)).map((a) => sk(y, a, 0.024 - i * 0.002)), v: i }));
      B.loft(bk, bk[0].pts.map((_, i, arr) => i / (arr.length - 1)), subR(reg2, 0, 0, 0.6, 0.5), 9, {});
      break;
    }
    case 'beanie': {
      dome((a) => (Math.abs(a) < 50 ? 0.152 : 0.122), 0.009, 0.238, subR(reg, 0, 0.3, 1, 1), 1, 0.014);
      // the rolled cuff
      const cuff = [0.116, 0.128, 0.152, 0.162].map((y, i) => ({ pts: HANG.map((a) => sk(y + (Math.abs(a) < 50 ? 0.026 : 0), a, 0.011 + [0.002, 0.008, 0.008, 0.002][i])), v: i / 3 }));
      B.loft(cuff, us, subR(reg, 0, 0, 1, 0.3), 2, {});
      break;
    }
  }
}

// ------------------------------------------------------------------ glasses
function buildGlasses(B: Loft, BL: Loft, L: Look, S: HeadShape) {
  const F = S.F, hs = S.hs;
  const sk = (y: number, deg: number, off: number) => S.loc(S.skull(y, deg, off, false));
  const fr = R('ACC');
  if (L.glasses === 'wrap') {
    // one curved visor lens + a thin top frame + temples
    const cols = Array.from({ length: 17 }, (_, i) => -72 + i * 9);
    // two lens lobes joined over the nose: the lower edge dips under each eye and notches up at the bridge
    const lower = (a: number) => F.eyeY - 0.02 + 0.016 * Math.exp(-((a / 8) ** 2)) + Math.max(0, Math.abs(a) - 50) * 0.0004;
    const upper = (a: number) => F.eyeY + 0.023 - Math.max(0, Math.abs(a) - 45) * 0.0003;
    const grid = [0, 0.5, 1].map((f) => cols.map((a) => sk(upper(a) + (lower(a) - upper(a)) * f, a, 0.0185 + Math.exp(-((a / 10) ** 2)) * 0.004 + (1 - Math.abs(a) / 72) * 0.002)));
    BL.sheet(grid, { x: 0, y: 0, w: 1, h: 1 }, 1);
    B.tube(cols.map((a) => sk(F.eyeY + 0.024, a, 0.018)), () => 0.0022 * hs, 4, fr, 2);
    for (const k of [1, -1]) B.tube([sk(F.eyeY + 0.02, k * 66, 0.017), sk(F.eyeY + 0.024, k * 90, 0.01), sk(F.eyeY + 0.018, k * 128, 0.008)], () => 0.0022 * hs, 4, fr, 3);
    return;
  }
  const round = L.glasses === 'round';
  for (const k of [1, -1]) {
    const a0 = k * F.eyeA, cy = F.eyeY - 0.002;
    const rw = round ? 0.017 : 0.022, rh = round ? 0.017 : 0.0155;
    const loop: V3[] = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      let x = Math.cos(t), y = Math.sin(t);
      if (!round) { x = Math.sign(x) * Math.pow(Math.abs(x), 0.6); y = Math.sign(y) * Math.pow(Math.abs(y), 0.7) * (y > 0 ? 1 : 0.9); }
      loop.push(sk(cy + y * rh, a0 + (x * rw) / 0.00175, 0.0175));
    }
    B.tube(loop, () => (round ? 0.0012 : 0.003) * hs, round ? 4 : 5, fr, 1 + (k > 0 ? 0 : 1));
    // lens: a cupped disc inside the loop
    const grid: V3[][] = [];
    const lr = round ? fr : { x: 0, y: 0, w: 1, h: 1 };
    for (let i = 0; i < 4; i++) {
      const rr = 1 - i / 3;
      grid.push(loop.slice(0, n).map((_, j) => {
        const t = (j / n) * Math.PI * 2;
        let x = Math.cos(t), y = Math.sin(t);
        if (!round) { x = Math.sign(x) * Math.pow(Math.abs(x), 0.6); y = Math.sign(y) * Math.pow(Math.abs(y), 0.7) * (y > 0 ? 1 : 0.9); }
        return sk(cy + y * rh * rr * 0.98, a0 + (x * rw * rr * 0.98) / 0.00175, 0.0172 + (1 - rr) * 0.002);
      }));
    }
    for (const row of grid) row.push(row[0]);
    BL.sheet(grid.reverse(), lr, 3);
    // temples back to the ears
    B.tube([sk(cy + rh * 0.6, k * (F.eyeA + rw / 0.00175), 0.0175), sk(cy + 0.008, k * 88, 0.006), sk(cy - 0.006, k * 118, 0.004)], () => (round ? 0.0012 : 0.0026) * hs, 4, fr, 5);
  }
  // bridge
  B.tube([sk(F.eyeY + 0.006, -F.eyeA + 0.013 / 0.00175 * 0.6, 0.0178), sk(F.eyeY + 0.009, 0, 0.022), sk(F.eyeY + 0.006, F.eyeA - 0.013 / 0.00175 * 0.6, 0.0178)], () => (round ? 0.0012 : 0.0026) * hs, 4, fr, 6);
}

// ------------------------------------------------------------------ gear painting
buildGear.paint = function (P: Px, L: Look, S: Shape) {
  const hc = L.hatCol, hc2 = L.hatCol2;
  switch (L.hat) {
    case 'captain': case 'captainBlack': {
      const black = L.hat === 'captainBlack';
      fillSub(P, 'HAT', 0, 0, 1, 1, (u, v, x, y) => {
        if (v < 0.36) {
          // the band: dark mohair with a faint braid at the top
          let c = band(hc2, 0.92 + ((x + y) % 3 === 0 ? -0.06 : 0) + (nz(x, y, 6, 1) - 0.5) * 0.08, x, y);
          if (v > 0.3) c = black ? metal([200, 160, 70], x, y, 0.95 + ((x >> 1) & 1) * 0.15) : band(shade(hc2, 1.3), 1, x, y);
          return c;
        }
        // the crown top: white cotton cover (or weathered black) with a welt seam where it turns over
        const base = black ? hc : hc;
        let c = cotton(base, x, y, 1 - (v > 0.5 && v < 0.56 ? 0.12 : 0), 7);
        if (black) c = oilskin(hc, x, y, 1 - (v > 0.5 && v < 0.56 ? 0.15 : 0), 8);
        if (!black && nz(x, y, 10, 9) > 0.78) c = mix(c, [200, 190, 160], 0.25); // a little salt stain
        return c;
      });
      fillSub(P, 'HAT2', 0, 0, 0.5, 1, (u, v, x, y) => band([16, 16, 20], v > 0.5 ? 0.9 + clamp01(1 - Math.abs(v - 0.8) * 8) * 0.6 : 0.7, x, y));
      // badge: an anchor (oldSalt) or skull-and-anchor (Gaff) on a navy / black plaque, gold
      fillSub(P, 'PATCH', 0, 0, 1, 0.5, (u, v, x, y) => {
        const cx = (u - 0.5) * 2, cy = (v - 0.5) * 2;
        const gold: RGB = [216, 176, 80];
        const anchor = (Math.abs(cx) < 0.12 && cy > -0.6 && cy < 0.6) || (Math.abs(cy - 0.45) < 0.1 && Math.abs(cx) < 0.4) || (Math.abs(Math.hypot(cx, cy + 0.15) - 0.55) < 0.1 && cy < -0.25);
        const ring = Math.abs(Math.hypot(cx, cy - 0.68) - 0.14) < 0.08;
        const skull = black && Math.hypot(cx, (cy - 0.2) * 1.2) < 0.36 && !(Math.hypot(cx - 0.14, cy - 0.25) < 0.09 || Math.hypot(cx + 0.14, cy - 0.25) < 0.09);
        if (anchor || ring || skull) return metal(gold, x, y, 1.05 + cy * 0.1);
        // laurel leaves round it
        if (Math.abs(Math.hypot(cx, cy) - 0.82) < 0.12 && cy < 0.5 && hh(x, y, 3) > 0.3) return band([196, 156, 60], 0.85, x, y);
        return band(black ? [20, 20, 22] : [24, 30, 56], 0.95, x, y);
      });
      break;
    }
    case 'bucket':
      fillSub(P, 'HAT', 0, 0, 1, 1, (u, v, x, y) => { const c = canvas(hc, x, y, 1, 11); return v > 0.2 && (y % 7 === 0) ? shade(c, 0.86) : c; });
      fillSub(P, 'HAT2', 0, 0, 0.6, 1, (u, v, x, y) => { const c = canvas(hc, x, y, v < 0.5 ? 0.82 : 1, 12); const vv = v < 0.5 ? v * 2 : (v - 0.5) * 2; return Math.abs(vv - 0.33) < 0.03 || Math.abs(vv - 0.66) < 0.03 ? shade(c, 0.85) : c; });
      break;
    case 'cap': case 'capBack': {
      fillSub(P, 'HAT', 0, 0, 1, 1, (u, v, x, y) => {
        const a = (u - 0.5) * 360 + (L.hat === 'capBack' ? 180 : 0);
        const aa = ((a + 540) % 360) - 180;
        let c = cotton(hc, x, y, 1, 13);
        // panel seams with stitching; the front panels carry a fish logo (in the accent colour); mesh back for the pro
        for (const sd of [-60, 0, 60, 120, -120, 180]) if (Math.abs(((aa - sd + 540) % 360) - 180) < 1.4) c = shade(c, 0.78);
        if (Math.abs(aa) < 26 && v > 0.15 && v < 0.55) {
          const fx = aa / 26, fy = (v - 0.35) / 0.2;
          const body = (fx / 0.7) ** 2 + (fy / 0.45) ** 2 < 1, tail = fx > 0.55 && fx < 1 && Math.abs(fy) < (fx - 0.55) * 1.4;
          if (body || tail) c = band(hc2, 1.05, x, y);
          if (Math.hypot(fx + 0.35, fy - 0.1) < 0.1) c = band(hc, 0.6, x, y);
        }
        if (L.arch === 'proAngler' && Math.abs(aa) > 110 && v < 0.85 && ((x % 3 === 0) || (y % 3 === 0))) c = shade(c, 0.6);
        if (v > 0.93) c = band(hc, 0.9, x, y);
        if (L.hat === 'capBack' && Math.abs(aa) > 165 && v < 0.25) c = band([40, 40, 40], 0.8, x, y); // the strap opening
        return c;
      });
      fillSub(P, 'HAT2', 0, 0, 0.5, 1, (u, v, x, y) => {
        if (v < 0.5) return band(L.arch === 'kid' ? mix(hc, [255, 255, 255], 0.0) : [60, 70, 60], 0.75, x, y); // under the bill
        const c = cotton(hc, x, y, 1, 14);
        const vv = (v - 0.5) * 2;
        return vv > 0.85 || Math.abs(vv - 0.6) < 0.04 || Math.abs(vv - 0.4) < 0.04 ? shade(c, 0.85) : c;
      });
      break;
    }
    case 'sunhat':
      fillSub(P, 'HAT', 0, 0, 1, 1, (u, v, x, y) => (v < 0.3 ? band(hc2, 0.95 + (v > 0.27 || v < 0.03 ? -0.15 : 0) + ((y % 2) ? 0.04 : 0), x, y) : straw(hc, x, y)));
      fillSub(P, 'HAT2', 0, 0, 1, 1, (u, v, x, y) => (v > 0.94 || v < 0.06 ? band(shade(hc, 0.8), 1, x, y) : straw(hc, x, y)));
      fillSub(P, 'ACC', 0.5, 0, 1, 0.5, (u, v, x, y) => band(mix(hc2, [255, 255, 255], 0.35), 0.9 + (1 - Math.hypot(u - 0.5, v - 0.5) * 2) * 0.3, x, y));
      break;
    case 'ushanka':
      fillSub(P, 'HAT', 0, 0, 1, 1, (u, v, x, y) => { const c = band(hc, 0.92 + (nz(x, y, 7, 15) - 0.5) * 0.2, x, y); return (x % 16 === 0) ? shade(c, 0.8) : c; });
      fillSub(P, 'HAT2', 0, 0, 1, 1, (u, v, x, y) => fur(hc2, x, y, 1, 16));
      break;
    case 'beanie':
      fillSub(P, 'HAT', 0, 0.3, 1, 1, (u, v, x, y) => band(hc, knitK(x, y) * (v > 0.95 ? 0.85 : 1), x, y));
      fillSub(P, 'HAT', 0, 0, 1, 0.3, (u, v, x, y) => band(hc, ribK(x, y) * (0.94 + v * 0.1), x, y));
      break;
  }
  // accessory swatches: gold cord, polished steel, flower
  fillSub(P, 'ACC', 0, 0, 0.5, 0.5, (u, v, x, y) => metal([214, 172, 74], x, y, 0.9 + ((x + y) % 3) * 0.1));
  fillSub(P, 'ACC', 0, 0.5, 1, 1, (u, v, x, y) => metal([200, 204, 210], x, y, 0.85 + (1 - Math.abs(u - 0.5) * 2) * 0.35));
  // eyepatch leather
  fillSub(P, 'PATCH', 0, 0.5, 1, 1, (u, v, x, y) => { const e = Math.hypot(u - 0.5, v - 0.5); return band([34, 26, 22], 0.85 + (0.5 - e) * 0.5 + (nz(x, y, 4, 17) - 0.5) * 0.15 - (e > 0.42 ? 0.15 : 0), x, y); });
  // GEAR: pipe stem / corncob / burnt top, lure paints, brass, leather, iron, steel
  fillSub(P, 'GEAR', 0, 0.8, 0.12, 1, (u, v, x, y) => band([30, 26, 24], 0.9 + v * 0.2, x, y));
  fillSub(P, 'GEAR', 0.12, 0.8, 0.3, 1, (u, v, x, y) => { const k = ((x % 3) + (y % 3 === 0 ? 1 : 0)) % 2 ? 1.05 : 0.86; return band([214, 178, 112], k * (0.9 + (hh(x, y, 4) - 0.5) * 0.15), x, y); });
  fillSub(P, 'GEAR', 0.3, 0.8, 0.36, 1, (u, v, x, y) => band([40, 26, 18], 0.8 + v * 0.3, x, y));
  const lures: RGB[][] = [[[250, 210, 40], [230, 60, 30]], [[60, 200, 90], [250, 250, 250]], [[240, 240, 250], [40, 90, 200]], [[250, 120, 30], [30, 30, 30]]];
  lures.forEach((cs, i) => fillSub(P, 'GEAR', i * 0.08, 0.3, 0.08 + i * 0.08, 0.6, (u, v, x, y) => (v > 0.55 ? band(cs[1], 1 + (v - 0.55), x, y) : (y % 3 === 0 && u > 0.3 && u < 0.7 ? band(cs[0], 0.75, x, y) : band(cs[0], 1.05 - v * 0.3, x, y)))));
  fillSub(P, 'GEAR', 0.34, 0.3, 0.4, 0.6, (u, v, x, y) => band([220, 230, 240], 1, x, y));
  fillSub(P, 'GEAR', 0.4, 0.3, 0.5, 0.6, (u, v, x, y) => band((x % 3) ? [60, 160, 80] : [240, 200, 40], 1, x, y));
  fillSub(P, 'GEAR', 0.36, 0.6, 0.56, 1, (u, v, x, y) => metal([190, 150, 70], x, y, 0.85 + Math.sin(u * 12) * 0.12));
  fillSub(P, 'GEAR', 0.56, 0.6, 0.66, 1, (u, v, x, y) => band([70, 46, 30], 0.9 + (hh(x, y, 7) - 0.5) * 0.15, x, y));
  fillSub(P, 'GEAR', 0.66, 0.6, 0.86, 1, (u, v, x, y) => metal([70, 72, 76], x, y, 0.8 + Math.sin(u * 9) * 0.15 + (nz(x, y, 5, 18) > 0.7 ? -0.15 : 0)));
  fillSub(P, 'GEAR', 0.86, 0.6, 1, 1, (u, v, x, y) => metal([196, 200, 206], x, y, 0.9 + v * 0.2));
};

function straw(c: RGB, x: number, y: number): RGB {
  // woven straw: alternating over/under strips
  const s = 4, bx = Math.floor(x / s), by = Math.floor(y / s);
  const horiz = (bx + by) % 2 === 0;
  const lx = x % s, ly = y % s;
  const k = horiz ? 0.92 + (ly === 0 ? -0.15 : ly === 1 ? 0.12 : 0) : 0.92 + (lx === 0 ? -0.15 : lx === 1 ? 0.12 : 0);
  return band(c, k + (hh(x, y, 19) - 0.5) * 0.08, x, y, 0.07);
}
