// Dive gear built onto a diver's bones (PS1 low-poly, small painted textures, flat shading):
//   - scuba / freediving / commando masks: a silicone skirt hugging the face, a frame, a tinted glass that
//     shows the eyes behind it, the nose pocket; a regulator second stage with its exhaust tee and hose;
//   - an aluminium tank on a BCD back plate (painted bands, scuffs, a chrome valve), or a compact
//     rebreather with counterlungs for the commandos;
//   - fins: short split blades or long carbon freediving blades, with rails, on the foot bones;
//   - a J-snorkel for free divers;
//   - the Mark V hard hat: a copper bonnet with brass portholes and grilles, bolted to a corselet with
//     lead weights front and back.
// Shared textures / materials are cached; meshes are per instance (cheap: a few hundred triangles each).
import * as THREE from 'three';
import type { V3, Reg } from '../gfx/loft';
import { Loft, usFor, FULL } from '../gfx/loft';
import { Px, mix, shade } from '../gfx/px';
import type { RGB } from '../gfx/px';
import type { Look, DiveKit } from './looks';
import type { BodyBuild } from './body';
import type { Dims, BoneName } from './rig';
import { ellRing } from './rig';
import type { HeadShape } from './head';
import { band, nz, hh, metal } from './fabric';
import { faceLayout } from './head';

export interface DiveGear {
  mask: THREE.Object3D | null;
  helmet: THREE.Object3D | null;
  tank: THREE.Object3D | null;
  fins: THREE.Object3D[];
  parts: THREE.Object3D[];
  /** where the air hose leaves the helmet / tank (for the surface air line) */
  hoseOut: THREE.Object3D | null;
  /** helmet front port glass (glints) */
  ports: THREE.Mesh[];
}

const mats = new Map<string, THREE.Material>();
/** cached flat-shaded material with a small painted texture */
export function kitMat(key: string, w: number, h: number, paint: (x: number, y: number) => RGB | null, o: { rough?: number; metal?: number; emissive?: number; transparent?: number } = {}): THREE.Material {
  let m = mats.get(key);
  if (m) return m;
  const p = new Px(w, h);
  p.fill((x, y) => paint(x, y));
  const tex = p.texture({ mip: true });
  const mm = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, flatShading: true });
  if (o.emissive) { mm.emissive = new THREE.Color(0xffffff); mm.emissiveMap = tex; mm.emissiveIntensity = o.emissive; }
  if (o.transparent !== undefined) { mm.transparent = true; mm.opacity = o.transparent; mm.depthWrite = false; }
  mats.set(key, (m = mm));
  return m;
}
const rgbKey = (c: RGB) => c.map((v) => Math.round(v)).join(',');

/** silicone / rubber (matte, faint grain) */
export const rubberMat = (c: RGB) => kitMat('rub' + rgbKey(c), 16, 16, (x, y) => band(c, 0.95 + (hh(x, y, 3) - 0.5) * 0.12 + (nz(x, y, 6, 4) - 0.5) * 0.1, x, y), { rough: 0.85 });
/** brushed / chromed metal */
export const steelMat = (c: RGB, rough = 0.35) => kitMat('stl' + rgbKey(c) + rough, 16, 16, (x, y) => metal(c, x, y, 0.85 + y / 40), { rough, metal: 0.75 });
/** weathered brass / copper with verdigris in the crevices */
export const brassMat = (c: RGB, verd = 0.3) => kitMat('brs' + rgbKey(c) + verd, 32, 32, (x, y) => {
  const v = nz(x, y, 7, 31);
  if (v < verd * 0.55) return band(mix([70, 140, 110], [40, 90, 70], hh(x, y, 32)), 1, x, y);
  return metal(c, x, y, 0.8 + (nz(x, y, 4, 33) - 0.5) * 0.5 + (hh(x, y, 34) > 0.94 ? 0.4 : 0));
}, { rough: 0.45, metal: 0.8 });
/** mask glass: tinted, reflective, see-through */
const glassMat = (c: RGB) => kitMat('gls' + rgbKey(c), 16, 16, (x, y) => {
  const streak = Math.abs(x - y * 1.2 - 3) < 1.5 || Math.abs(x - y * 1.2 - 9) < 0.8;
  return streak ? mix(c, [255, 255, 255], 0.6) : mix(c, [8, 10, 12], y / 24);
}, { rough: 0.05, metal: 0.3, emissive: 0.35, transparent: 0.42 });

/** a closed loop of (deg, y) points on the face (head-local reference) → mask outline */
const MASK_LOOP: [number, number][] = [[0, 0.136], [24, 0.138], [44, 0.127], [50, 0.1], [43, 0.074], [22, 0.07], [9, 0.06], [0, 0.044], [-9, 0.06], [-22, 0.07], [-43, 0.074], [-50, 0.1], [-44, 0.127], [-24, 0.138]];

function buildMask(L: Look, D: DiveKit, S: HeadShape, head: THREE.Bone, out: DiveGear) {
  const F = faceLayout(L);
  const dy = F.eyeY - 0.1;
  const loop = MASK_LOOP.map(([a, y]) => [a * (D.mask === 'free' ? 0.92 : 1), y * (D.mask === 'free' ? 0.96 : 1) + dy + (D.mask === 'free' ? 0.004 : 0)] as [number, number]);
  const front = (y: number) => 0.124 + Math.max(0, 0.082 - y) * (D.mask === 'free' ? 0.7 : 0.95) + (D.mask === 'commando' ? 0.004 : 0);
  const skirt: V3[] = [], rim: V3[] = [], glassR: V3[] = [];
  for (const [a, y] of loop) {
    const p = S.skull(y, a, 0.004);
    skirt.push(S.loc(p));
    const fz = front(y) + (S.L.face.nose.len - 1) * 0.02;
    const q: V3 = [p[0] * 1.02, y, Math.max(p[2] + 0.012, fz)];
    rim.push(S.loc(q));
    glassR.push(S.loc([p[0] * 0.86, y + (0.098 + dy - y) * 0.14, Math.max(p[2] + 0.01, fz) + 0.002]));
  }
  skirt.push(skirt[0]); rim.push(rim[0]); glassR.push(glassR[0]);
  const B = new Loft(false);
  const us = usFor(loop.length);
  B.loft([{ pts: skirt, v: 0 }, { pts: rim, v: 1 }], us, FULL, 1, {});
  B.loft([{ pts: skirt, v: 0 }, { pts: rim, v: 1 }], us, FULL, 2, { flip: true });
  const frameCol: RGB = D.mask === 'scuba' ? D.col2 : D.mask === 'commando' ? [18, 18, 20] : [26, 26, 28];
  const g = new THREE.Group();
  const frame = new THREE.Mesh(B.build(), rubberMat(frameCol));
  // the glass: a fan over the front rim
  const G = new Loft(false);
  const c: V3 = [0, 0, 0];
  for (const p of glassR.slice(0, -1)) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= loop.length; c[1] /= loop.length; c[2] = c[2] / loop.length + 0.004 * S.hs;
  G.loft([{ pts: glassR, v: 0 }], us, FULL, 3, { end: c });
  const glass = new THREE.Mesh(G.build(), glassMat(D.lens));
  glass.renderOrder = 2;
  g.add(frame, glass);
  frame.castShadow = true;
  head.add(g);
  out.mask = g; out.parts.push(frame, glass);
  // regulator second stage at the mouth, its exhaust tee and the hose curling round to the right shoulder
  if (D.tank === 'single' || D.tank === 'twin') {
    const R = new Loft(false);
    const m = S.loc(S.skull(0.03, 0, 0.026));
    const hs = S.hs;
    R.box(m, [0.05 * hs, 0.045 * hs, 0.038 * hs], FULL);
    R.box([m[0], m[1] - 0.03 * hs, m[2] - 0.004 * hs], [0.06 * hs, 0.018 * hs, 0.03 * hs], FULL);
    const reg = new THREE.Mesh(R.build(), rubberMat([30, 30, 34]));
    const H = new Loft(false);
    const path: V3[] = [[m[0] - 0.024 * hs, m[1], m[2] - 0.01 * hs], S.loc(S.skull(0.0, -60, 0.05)), S.loc(S.skull(-0.04, -120, 0.06)), S.loc(S.skull(-0.08, -160, 0.08))];
    H.tube(path, () => 0.011 * hs, 5, FULL, 1);
    const hose = new THREE.Mesh(H.build(), rubberMat([24, 24, 26]));
    g.add(reg, hose);
    out.parts.push(reg, hose);
  }
  // snorkel: a J-tube up the left side of the head
  if (D.snorkel) {
    const hs = S.hs;
    const H = new Loft(false);
    const m = S.loc(S.skull(0.03, 0, 0.02));
    H.tube([m, S.loc(S.skull(0.02, 40, 0.05)), S.loc(S.skull(0.08, 85, 0.03)), S.loc(S.skull(0.2, 95, 0.03)), S.loc(S.skull(0.28, 100, 0.03))], () => 0.012 * hs, 5, FULL, 1, { capEnd: true });
    const sn = new THREE.Mesh(H.build(), rubberMat([210, 120, 30]));
    g.add(sn); out.parts.push(sn);
  }
}

const tankTex = (c: RGB, kind: string) => kitMat('tank' + kind + rgbKey(c), 32, 64, (x, y) => {
  const v = y / 63;
  if (v > 0.92) return band([24, 24, 26], 0.9 + (x & 1) * 0.08, x, y);         // rubber boot
  let col = c;
  if (kind === 'single' && v > 0.12 && v < 0.2) col = (x % 8 < 4) ? [230, 200, 30] : [40, 140, 70]; // nitrox band
  if (v > 0.38 && v < 0.46) col = mix(c, [240, 240, 236], 0.85);              // the white label band
  let k = 0.82 + Math.sin((x / 32) * Math.PI * 2 - 0.6) * 0.18 + (v < 0.06 ? 0.15 : 0);
  if (hh(x, y, 41) > 0.95) k -= 0.35;                                          // scratches
  if (nz(x, y, 6, 42) > 0.78) k -= 0.12;
  return band(col, k, x, y, 0.08);
}, { rough: 0.45, metal: 0.35 });

function buildTank(L: Look, D: DiveKit, d: Dims, chest: THREE.Bone, out: DiveGear) {
  const s = d.s, b = L.build;
  const g = new THREE.Group();
  const back = -(0.098 * b.mass + 0.03) * s;
  if (D.tank === 'rebreather') {
    // a compact chest-mounted unit with two counterlung bags over the shoulders
    const B = new Loft(false);
    B.box([0, -0.02 * s, (0.11 * b.mass + 0.05) * s], [0.2 * s, 0.24 * s, 0.08 * s], FULL);
    B.box([0, 0.12 * s, (0.11 * b.mass + 0.04) * s], [0.12 * s, 0.05 * s, 0.05 * s], FULL);
    const unit = new THREE.Mesh(B.build(), rubberMat(D.tankCol));
    const C = new Loft(false);
    for (const k of [1, -1]) C.box([k * 0.1 * s, 0.17 * s, 0.05 * s], [0.08 * s, 0.07 * s, 0.14 * s], FULL, undefined, new THREE.Matrix4().makeRotationZ(k * 0.3));
    const lungs = new THREE.Mesh(C.build(), rubberMat([30, 34, 30]));
    g.add(unit, lungs);
    unit.castShadow = lungs.castShadow = true;
    out.parts.push(unit, lungs);
  } else {
    // BCD back plate + the cylinder(s)
    const P = new Loft(false);
    P.box([0, -0.04 * s, back - 0.01 * s], [0.24 * s, 0.42 * s, 0.03 * s], FULL);
    const plate = new THREE.Mesh(P.build(), rubberMat([26, 27, 30]));
    g.add(plate); out.parts.push(plate);
    const r = 0.088 * s, z0 = back - 0.025 * s - r;
    const n = 8;
    for (const xo of D.tank === 'twin' ? [-0.095 * s, 0.095 * s] : [0]) {
      const T = new Loft(false);
      const ys = [-0.4, -0.38, 0.12, 0.2, 0.235];
      const rr = [0.86, 1, 1, 0.82, 0.4];
      const rings = ys.map((y, i) => ({ pts: ellRing(y * s, xo, z0, r * rr[i], r * rr[i], r * rr[i], n, 2, 1), v: 1 - (y + 0.4) / 0.635 }));
      T.loft(rings, usFor(n), FULL, 1, { start: [xo, -0.41 * s, z0], end: [xo, 0.245 * s, z0] });
      const tank = new THREE.Mesh(T.build(), tankTex(D.tankCol, D.tank));
      tank.castShadow = true;
      g.add(tank); out.parts.push(tank);
      // the valve: chrome block and knob
      const V = new Loft(false);
      V.box([xo, 0.27 * s, z0], [0.04 * s, 0.07 * s, 0.04 * s], FULL);
      V.box([xo + 0.045 * s, 0.285 * s, z0], [0.05 * s, 0.03 * s, 0.03 * s], FULL);
      const valve = new THREE.Mesh(V.build(), steelMat([200, 202, 208]));
      g.add(valve); out.parts.push(valve);
      if (!out.hoseOut) { const ho = new THREE.Object3D(); ho.position.set(xo, 0.3 * s, z0); g.add(ho); out.hoseOut = ho; }
    }
  }
  chest.add(g);
  out.tank = g;
}

const finTex = (c: RGB, long: boolean) => kitMat('fin' + rgbKey(c) + long, 16, 32, (x, y) => {
  const rail = x < 2 || x > 13;
  const vent = !long && y > 6 && y < 16 && (x === 5 || x === 10);
  let k = rail ? 0.75 : 1 + (long ? ((x + y * 3) % 5 === 0 ? 0.12 : 0) : 0);   // carbon weave glint on long blades
  if (vent) k = 0.5;
  if (y < 5) return band([28, 28, 30], 0.95, x, y);                             // the foot pocket
  return band(long ? mix(c, [40, 40, 44], 0.3) : c, k * (0.9 + y / 160), x, y, 0.08);
}, { rough: 0.5, metal: 0.05 });

function buildFins(L: Look, D: DiveKit, d: Dims, bones: Record<BoneName, THREE.Bone>, out: DiveGear) {
  const s = d.s, fs = s * L.build.footS;
  const long = D.fins === 'long';
  const len = (long ? 0.72 : 0.42) * s, w0 = 0.1 * fs, w1 = (long ? 0.19 : 0.22) * s;
  for (const side of ['L', 'R'] as const) {
    const foot = bones[('foot' + side) as BoneName];
    const B = new Loft(false);
    const rows = 4, cols = 4;
    const grid: V3[][] = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const row: V3[] = [];
      for (let j = 0; j < cols; j++) {
        const u = j / (cols - 1) - 0.5;
        const wd = w0 + (w1 - w0) * Math.pow(t, 0.8);
        // a shallow V channel down the blade, the tip curling up a touch
        const y = -d.L.ankle + 0.03 * s - Math.abs(u) * 0.025 * s * (1 - t * 0.5) + t * t * 0.03 * s;
        row.push([u * wd, y, 0.06 * fs + t * len]);
      }
      grid.push(row);
    }
    B.sheet(grid, FULL, 1, undefined, 0.012 * s);
    // the foot pocket: a low box round the forefoot
    B.box([0, -d.L.ankle + 0.045 * s, 0.08 * fs], [0.11 * fs, 0.06 * s, 0.16 * fs], { x: 0, y: 0, w: 1, h: 0.12 });
    const m = new THREE.Mesh(B.build(), finTex(D.finCol, long));
    m.castShadow = true;
    foot.add(m);
    out.fins.push(m); out.parts.push(m);
  }
}

function buildHelmet(L: Look, D: DiveKit, d: Dims, S: HeadShape, bones: Record<BoneName, THREE.Bone>, out: DiveGear) {
  const s = d.s, hs = S.hs;
  const titan = L.arch === 'titan';
  const copper: RGB = titan ? [96, 98, 104] : [184, 108, 62];
  const brass: RGB = titan ? [150, 120, 70] : [206, 160, 74];
  // ---- bonnet (head-bone space): a faceted dome around the head
  const g = new THREE.Group();
  const B = new Loft(false);
  const cy = 0.09, R = 0.175;
  const n = 10;
  const rows: [number, number][] = [[-0.11, 0.86], [-0.06, 0.97], [0.0, 1], [0.08, 0.98], [0.15, 0.86], [0.21, 0.6], [0.245, 0.25]];
  const rings = rows.map(([y, k]) => ({ pts: ellRing((cy + y) * hs, 0, 0.008 * hs, R * k * hs, R * k * hs, R * k * 1.02 * hs, n, 2, 1), v: (y + 0.11) / 0.355 }));
  B.loft(rings, usFor(n), FULL, 1, { end: [0, (cy + 0.255) * hs, 0.008 * hs] });
  const bonnet = new THREE.Mesh(B.build(), brassMat(copper, titan ? 0.15 : 0.35));
  bonnet.castShadow = true;
  g.add(bonnet);
  // portholes: brass rings with glass and grille bars (front, both sides, top front)
  const ports: [number, number, number][] = [[0, 0.1, 0.075], [90, 0.09, 0.055], [-90, 0.09, 0.055], [0, 0.22, 0.035]];
  const PR = new Loft(false), PG = new Loft(false), GR = new Loft(false);
  for (const [a, y, r] of ports) {
    const t = (a * Math.PI) / 180;
    const nrm: V3 = y > 0.2 ? [0, 0.7, 0.71] : [Math.sin(t), 0, Math.cos(t)];
    const up: V3 = y > 0.2 ? [0, 0.71, -0.7] : [0, 1, 0];
    const side: V3 = [up[1] * nrm[2] - up[2] * nrm[1], up[2] * nrm[0] - up[0] * nrm[2], up[0] * nrm[1] - up[1] * nrm[0]];
    const rad = R * (y > 0.2 ? 0.75 : 1) * 1.0;
    const c: V3 = [nrm[0] * rad * hs, (cy + (y - 0.09)) * hs + (y > 0.2 ? 0.0 : 0), nrm[2] * rad * hs + 0.008 * hs];
    const ringAt = (rr: number, push: number): V3[] => {
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const q = (i / 8) * Math.PI * 2;
        pts.push([c[0] + (Math.cos(q) * side[0] + Math.sin(q) * up[0]) * rr * hs + nrm[0] * push * hs, c[1] + (Math.cos(q) * side[1] + Math.sin(q) * up[1]) * rr * hs + nrm[1] * push * hs, c[2] + (Math.cos(q) * side[2] + Math.sin(q) * up[2]) * rr * hs + nrm[2] * push * hs]);
      }
      return pts;
    };
    PR.loft([{ pts: ringAt(r * 1.35, -0.005), v: 0 }, { pts: ringAt(r * 1.3, 0.03), v: 0.5 }, { pts: ringAt(r, 0.03), v: 1 }], usFor(8), FULL, 2, {});
    PG.loft([{ pts: ringAt(r, 0.022), v: 0 }], usFor(8), FULL, 3, { end: [c[0] + nrm[0] * 0.024 * hs, c[1] + nrm[1] * 0.024 * hs, c[2] + nrm[2] * 0.024 * hs] });
    if (y < 0.2) {
      // grille bars across the port
      for (const k of a === 0 ? [-0.5, 0, 0.5] : [-0.4, 0.4]) {
        const bc: V3 = [c[0] + side[0] * k * r * hs + nrm[0] * 0.034 * hs, c[1] + side[1] * k * r * hs, c[2] + side[2] * k * r * hs + nrm[2] * 0.034 * hs];
        GR.box(bc, [0.01 * hs, r * 2 * hs, 0.01 * hs], FULL, undefined, new THREE.Matrix4().makeRotationY(t));
      }
    }
  }
  const portRings = new THREE.Mesh(PR.build(), brassMat(brass, 0.2));
  const portGlass = new THREE.Mesh(PG.build(), glassMat(titan ? [200, 60, 30] : [70, 110, 110]));
  const grilles = new THREE.Mesh(GR.build(), brassMat(brass, 0.25));
  g.add(portRings, portGlass, grilles);
  out.ports.push(portGlass);
  // the air hose gooseneck at the back
  const H = new Loft(false);
  H.tube([[0, (cy + 0.04) * hs, -R * 0.95 * hs], [0, (cy + 0.06) * hs, -(R + 0.06) * hs], [0, (cy + 0.14) * hs, -(R + 0.08) * hs]], () => 0.022 * hs, 6, FULL, 1, { capEnd: true });
  const goose = new THREE.Mesh(H.build(), brassMat(brass, 0.3));
  g.add(goose);
  const ho = new THREE.Object3D(); ho.position.set(0, (cy + 0.14) * hs, -(R + 0.08) * hs); g.add(ho); out.hoseOut = ho;
  bones.head.add(g);
  out.helmet = g;
  out.parts.push(bonnet, portRings, portGlass, grilles, goose);
  // ---- corselet (chest-bone space): a breastplate dome over the shoulders, the neck ring, studs, weights
  const C = new Loft(false);
  const neckY = (d.rest.neck[1] - d.rest.chest[1]) + 0.02 * s;
  const cr = (0.2 * L.build.shoulders * L.build.bw) * s;
  const crow: [number, number, number][] = [[neckY + 0.02 * s, 0.4, 0.42], [neckY, 0.52, 0.55], [neckY - 0.06 * s, 0.86, 0.75], [neckY - 0.14 * s, 1.0, 0.82], [neckY - 0.2 * s, 1.0, 0.82]];
  const cRings = crow.map(([y, kx, kz], i) => ({ pts: ellRing(y, 0, 0, cr * kx, cr * kz * L.build.mass, cr * kz * L.build.mass, 10, 2.3, 1), v: i / (crow.length - 1) }));
  C.loft(cRings, usFor(10), FULL, 1, {});
  C.loft(cRings.map((r) => ({ ...r, c: 0.4 })), usFor(10), FULL, 2, { flip: true });
  const corselet = new THREE.Mesh(C.build(), brassMat(copper, titan ? 0.15 : 0.3));
  corselet.castShadow = true;
  // studs along the rim, lead weights hung front and back
  const W = new Loft(false);
  for (let i = 0; i < 8; i++) {
    const q = (i / 8) * Math.PI * 2;
    W.box([Math.sin(q) * cr * 1.0, neckY - 0.17 * s, Math.cos(q) * cr * 0.82 * L.build.mass], [0.025 * s, 0.025 * s, 0.025 * s], FULL);
  }
  const studs = new THREE.Mesh(W.build(), brassMat(brass, 0.1));
  const LW = new Loft(false);
  for (const zs of [1, -1]) LW.box([0, neckY - 0.3 * s, zs * (cr * 0.82 * L.build.mass + 0.02 * s)], [0.2 * s, 0.16 * s, 0.035 * s], FULL);
  const weights = new THREE.Mesh(LW.build(), steelMat([84, 86, 90], 0.7));
  bones.chest.add(corselet, studs, weights);
  out.parts.push(corselet, studs, weights);
}

/** build a diver's gear onto the model's bones (no-op for people without a dive kit) */
export function buildDiveGear(L: Look, body: BodyBuild, d: Dims, bones: Record<BoneName, THREE.Bone>): DiveGear {
  const out: DiveGear = { mask: null, helmet: null, tank: null, fins: [], parts: [], hoseOut: null, ports: [] };
  const D = L.dive;
  if (!D) return out;
  if (D.mask === 'brass') buildHelmet(L, D, d, body.head, bones, out);
  else if (D.mask !== 'none') buildMask(L, D, body.head, bones.head, out);
  if (D.tank !== 'none') buildTank(L, D, d, bones.chest, out);
  if (D.fins !== 'none') buildFins(L, D, d, bones, out);
  for (const p of out.parts) { p.castShadow = true; (p as THREE.Mesh).receiveShadow = true; }
  return out;
}
export { shade };
export type { Reg };
